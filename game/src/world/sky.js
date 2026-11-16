/**
 * Sky (ARCHITECTURE §4): gradient dome + sun, real night sky (lat 20°N, RA/Dec catalogue), key/ambient lights, the one FogExp2.
 *   sky.setPreset(name, { duration }) → Promise        'dawn'|'morning'|'noon'|'storm'|'dusk'|'night'|'predawn'|'sunrise_rain'
 *   sky.setVisibility(metres | null)                    weather's request: fog density = max(preset, 1.98 / m), colour → murk
 *   sky.uniforms (shared BY REFERENCE)  uSunDir uSunColor uAmbSky uAmbGround uHorizonColor uZenithColor uTime uNight
 *       colours are linear and already divided by π: `albedo * uSunColor * NdotL` matches MeshLambertMaterial under sunLight
 *   sky.sunDir · sky.sunLight · sky.hemi · sky.preset · sky.sunBearing() → deg | null (night)
 *   sky.stars.setLST(h, { duration }) → Promise · dir(id, out) · asterism(id) · highlight(id | null, amount) · lst
 */
import * as THREE from 'three';
import { STARS, STAR_INDEX, ASTERISMS, skyMatrix, applySky, equatorial, makeFaintStars } from './stars-data.js';
import { SHADE_PARS_FRAGMENT, SHADE_FRAGMENT } from '../core/shade.js';
import { clamp01, lerp, DEG } from '../core/math.js';

// el/az in degrees (az = compass bearing of the key light). I = light intensities (three r170 physical units: I/π reaches a Lambert surface)
const P = {
  dawn:         { zen: 0x5d7fb6, hor: 0xf2c79e, sun: 0xffc58a, sunI: 2.1, hs: 0xb9cbe6, hg: 0xc79a64, hemiI: 0.9, fog: 0xe7c4a2, dens: 0.0019, el: 7, az: 92, night: 0, disc: 1, glow: 1.0, wall: 0, cloud: 0.12 },
  morning:      { zen: 0x5f93cf, hor: 0xdbe4e6, sun: 0xfff0d6, sunI: 2.6, hs: 0xcfe0f2, hg: 0xd3a868, hemiI: 1.05, fog: 0xdfe1d8, dens: 0.0013, el: 32, az: 105, night: 0, disc: 1, glow: 0.55, wall: 0, cloud: 0.1 },
  noon:         { zen: 0x4f8fd6, hor: 0xe6e2d0, sun: 0xfffaf0, sunI: 2.9, hs: 0xd5e4f4, hg: 0xddb478, hemiI: 1.15, fog: 0xe8e0cc, dens: 0.0015, el: 70, az: 175, night: 0, disc: 1, glow: 0.4, wall: 0, cloud: 0.05 },
  storm:        { zen: 0xa8813f, hor: 0xb88d4c, sun: 0xe0b070, sunI: 0.9, hs: 0xc9a468, hg: 0xa87e45, hemiI: 1.9, fog: 0xb58a4b, dens: 0.011, el: 40, az: 225, night: 0, disc: 0.25, glow: 0.5, wall: 1, cloud: 0 },
  dusk:         { zen: 0x51679f, hor: 0xf0a56a, sun: 0xff9a55, sunI: 2.2, hs: 0xa9b3d6, hg: 0xc08a5c, hemiI: 0.85, fog: 0xe2a274, dens: 0.0018, el: 5, az: 262, night: 0, disc: 1, glow: 1.0, wall: 0, cloud: 0.15 },
  night:        { zen: 0x060a18, hor: 0x141d38, sun: 0x8fa9ea, sunI: 1.6, hs: 0x334672, hg: 0x1f2130, hemiI: 1.25, fog: 0x0d1426, dens: 0.0022, el: 58, az: 200, night: 1, disc: 0, glow: 0, wall: 0, cloud: 0 },
  predawn:      { zen: 0x131d3c, hor: 0x4a5580, sun: 0xa9b8e2, sunI: 1.7, hs: 0x4d5c86, hg: 0x302b36, hemiI: 1.3, fog: 0x27304f, dens: 0.002, el: 30, az: 100, night: 0.75, disc: 0, glow: 0.35, wall: 0, cloud: 0.05 },
  sunrise_rain: { zen: 0x6c7f9e, hor: 0xf0cfa6, sun: 0xffd9a6, sunI: 2.0, hs: 0xb8c2d2, hg: 0xb99668, hemiI: 1.0, fog: 0xd6c2a8, dens: 0.0022, el: 9, az: 92, night: 0, disc: 1, glow: 0.9, wall: 0, cloud: 1 },
};
const NUM = ['sunI', 'hemiI', 'dens', 'night', 'disc', 'glow', 'wall', 'cloud'];
const COL = ['zen', 'hor', 'sun', 'hs', 'hg', 'fog'];

const DOME_VS = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position * 1800.0, 1.0); gl_Position = p.xyww; }`;
const DOME_FS = /* glsl */`
uniform vec3 uZenithColor, uHorizonColor, uSunColorRaw, uSunDir, uWallColor;
uniform vec2 uWallDir; uniform float uDisc, uGlow, uWall, uCloud, uTime, uNight;
varying vec3 vDir;
${SHADE_PARS_FRAGMENT}
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizonColor, uZenithColor, pow(h, 0.42));
  col = mix(col, uHorizonColor * 0.82, smoothstep(0.0, -0.25, d.y));                       // below the horizon: ground haze
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 sunc = uSunColorRaw;
  col += sunc * uGlow * (0.55 * pow(sd, 6.0) + 0.35 * pow(sd, 48.0)) * (1.0 - 0.6 * h);       // horizon glow around the sun
  col = mix(col, vec3(1.0, 0.95, 0.82), uDisc * smoothstep(0.99935, 0.99975, sd));                      // disc
  // painterly cloud wisps / the low rain deck (west side when uCloud is high)
  vec2 cp = d.xz / (0.22 + h) * 1.6;
  float n = vnoise(cp + vec2(uTime * 0.004, 0.0)) * 0.62 + vnoise(cp * 2.3 - vec2(0.0, uTime * 0.006)) * 0.38;
  float west = smoothstep(0.35, -0.5, d.x);
  float deck = smoothstep(0.62 - 0.4 * uCloud * west, 0.86, n) * smoothstep(0.0, 0.07, d.y) * (0.25 + 0.75 * mix(1.0, west, step(0.5, uCloud)));
  vec3 cloudCol = mix(uHorizonColor * 1.05 + sunc * 0.25 * pow(sd, 3.0), mix(uZenithColor, vec3(0.42, 0.4, 0.5), 0.6), step(0.5, uCloud) * west * 0.8);
  col = mix(col, cloudCol, deck * min(1.0, uCloud * 2.2) * (1.0 - uNight));
  // storm wall on the windward horizon
  float toward = dot(normalize(d.xz + 1e-4), uWallDir);
  float wallH = 0.10 + 0.34 * smoothstep(-0.2, 0.9, toward) + 0.05 * vnoise(vec2(atan(d.z, d.x) * 6.0, uTime * 0.05));
  col = mix(col, uWallColor, uWall * smoothstep(wallH, wallH - 0.12, d.y) * (0.55 + 0.45 * smoothstep(-0.3, 0.6, toward)));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  ${SHADE_FRAGMENT}
}`;
const STAR_VS = /* glsl */`
uniform mat3 uSkyM; uniform float uPx, uTime, uNight;
attribute float aSize; attribute vec3 aColor; attribute float aSeed;
varying vec3 vCol; varying float vA;
void main() {
  vec3 w = uSkyM * position;
  float ext = smoothstep(-0.01, 0.16, w.y);                                   // horizon extinction
  float tw = 0.91 + 0.09 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 40.0) * (1.4 - ext);
  vCol = aColor; vA = uNight * ext * tw;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * w * 1700.0, 1.0);
  gl_Position = p.xyww; gl_PointSize = aSize * uPx;
}`;
const STAR_FS = /* glsl */`
varying vec3 vCol; varying float vA;
void main() { vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; float a = (1.0 - smoothstep(0.0, 1.0, r)); a = a * a * vA; if (a < 0.01) discard;
  gl_FragColor = vec4(vCol * a, a);
  #include <colorspace_fragment>
}`;
const LINE_VS = /* glsl */`
uniform mat3 uSkyM;
void main() { vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * (uSkyM * position) * 1700.0, 1.0); gl_Position = p.xyww; }`;
const LINE_FS = /* glsl */`
uniform float uNight;
void main() { gl_FragColor = vec4(vec3(0.62, 0.78, 1.0) * 0.8 * uNight, 0.8 * uNight);
  #include <colorspace_fragment>
}`;

export function createSky(G) {
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
  const hemi = new THREE.HemisphereLight(0xdde8f5, 0xcaa56c, 1.0);
  G.scene.add(sunLight, sunLight.target, hemi);
  G.scene.fog = new THREE.FogExp2(0xdfe1d8, 0.0013);
  G.scene.background = new THREE.Color(0xdbe4e6);
  const sunDir = new THREE.Vector3(0.3, 0.6, 0.5).normalize();
  const uniforms = {
    uSunDir: { value: sunDir }, uSunColor: { value: new THREE.Color() }, uAmbSky: { value: new THREE.Color() }, uAmbGround: { value: new THREE.Color() },
    uHorizonColor: { value: new THREE.Color() }, uZenithColor: { value: new THREE.Color() }, uTime: { value: 0 }, uNight: { value: 0 },
  };
  const domeU = {
    uZenithColor: uniforms.uZenithColor, uHorizonColor: uniforms.uHorizonColor, uSunDir: uniforms.uSunDir, uTime: uniforms.uTime, uNight: uniforms.uNight,
    uSunColorRaw: { value: new THREE.Color() }, uWallColor: { value: new THREE.Color(0x7a5a2c) }, uWallDir: { value: new THREE.Vector2(-1, 0) },
    uDisc: { value: 1 }, uGlow: { value: 0.5 }, uWall: { value: 0 }, uCloud: { value: 0 }, uFirasa: G.shade.uFirasa,
  };
  const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.ShaderMaterial({ uniforms: domeU, vertexShader: DOME_VS, fragmentShader: DOME_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
  dome.frustumCulled = false; dome.renderOrder = 20; dome.name = 'sky';
  G.scene.add(dome);

  // ---- stars -----------------------------------------------------------------------------------------
  const skyM = new THREE.Matrix3(); const mArr = new Float32Array(9);
  const faint = makeFaintStars(G.quality.pick(700, 1100, 1500), 'faint-stars');
  const nNamed = STARS.length, nFaint = faint.mag.length, n = nNamed + nFaint;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), seedA = new Float32Array(n);
  const baseSize = new Float32Array(n), baseCol = new Float32Array(n * 3);
  const eq = STARS.map(s => equatorial(s.ra, s.dec, { x: 0, y: 0, z: 0 }));
  for (let i = 0; i < nNamed; i++) {
    const s = STARS[i], e = eq[i];
    pos[i * 3] = e.x; pos[i * 3 + 1] = e.y; pos[i * 3 + 2] = e.z;
    col[i * 3] = s.rgb[0]; col[i * 3 + 1] = s.rgb[1]; col[i * 3 + 2] = s.rgb[2];
    // Magnitude still determines the hierarchy; the floor keeps named stars legible on phones.
    size[i] = Math.max(2.8, 7.6 - 1.35 * s.mag); seedA[i] = (i * 0.618) % 1;
  }
  for (let j = 0; j < nFaint; j++) {
    const i = nNamed + j;
    pos[i * 3] = faint.pos[j * 3]; pos[i * 3 + 1] = faint.pos[j * 3 + 1]; pos[i * 3 + 2] = faint.pos[j * 3 + 2];
    const dim = clamp01((6.6 - faint.mag[j]) / 3.2) * 0.38 + 0.06;
    col[i * 3] = faint.rgb[j * 3] * dim; col[i * 3 + 1] = faint.rgb[j * 3 + 1] * dim; col[i * 3 + 2] = faint.rgb[j * 3 + 2] * dim;
    size[i] = 1.0 + clamp01((6.2 - faint.mag[j]) / 3) * 0.9; seedA[i] = (j * 0.381) % 1;
  }
  baseSize.set(size); baseCol.set(col);
  const starU = { uSkyM: { value: skyM }, uPx: { value: 1 }, uTime: uniforms.uTime, uNight: uniforms.uNight };
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); starGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); starGeo.setAttribute('aSeed', new THREE.BufferAttribute(seedA, 1));
  const starMat = new THREE.ShaderMaterial({ uniforms: starU, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const starPts = new THREE.Points(starGeo, starMat); starPts.frustumCulled = false; starPts.renderOrder = 30; G.scene.add(starPts);
  // highlights: soft halos + asterism lines (preallocated)
  const HL = 24, hlPos = new Float32Array(HL * 3), hlCol = new Float32Array(HL * 3), hlSize = new Float32Array(HL), hlSeed = new Float32Array(HL);
  const hlGeo = new THREE.BufferGeometry();
  hlGeo.setAttribute('position', new THREE.BufferAttribute(hlPos, 3)); hlGeo.setAttribute('aColor', new THREE.BufferAttribute(hlCol, 3));
  hlGeo.setAttribute('aSize', new THREE.BufferAttribute(hlSize, 1)); hlGeo.setAttribute('aSeed', new THREE.BufferAttribute(hlSeed, 1));
  const hlPts = new THREE.Points(hlGeo, starMat); hlPts.frustumCulled = false; hlPts.renderOrder = 31; G.scene.add(hlPts); hlGeo.setDrawRange(0, 0);
  const SEG = 24, linePos = new Float32Array(SEG * 6), lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3)); lineGeo.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(lineGeo, new THREE.ShaderMaterial({ uniforms: { uSkyM: starU.uSkyM, uNight: uniforms.uNight }, vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  lines.frustumCulled = false; lines.renderOrder = 31; G.scene.add(lines);
  const highlights = new Map();
  let lesson = null, lessonGuide = 0;
  const dipperIds = new Set(ASTERISMS.banat_nash.flat());
  const lessonBowl = ASTERISMS.banat_nash.slice(3);
  // Lesson emphasis describes a family of stars, never changes RA/Dec or marks
  // the sought answer. The guide sketches only the bowl, not the pointer to Polaris.
  function updateLesson() {
    for (let i = 0; i < n; i++) {
      const named = i < nNamed, member = named && dipperIds.has(STARS[i].id);
      const boost = lesson && member ? 1.28 : 1;
      size[i] = baseSize[i] * boost;
      const light = lesson && !named ? 0.58 : 1;
      for (let j = 0; j < 3; j++) col[i * 3 + j] = baseCol[i * 3 + j] * light;
    }
    starGeo.attributes.aSize.needsUpdate = starGeo.attributes.aColor.needsUpdate = true;
  }
  function rebuildHighlights() {
    let k = 0, s = 0;
    for (const [id, amount] of highlights) {
      if (ASTERISMS[id]) {
        const segs = ASTERISMS[id], total = amount * segs.length;
        for (let i = 0; i < segs.length && s < SEG; i++) {
          const f = clamp01(total - i); if (f <= 0) break;
          const a = eq[STAR_INDEX[segs[i][0]]], b = eq[STAR_INDEX[segs[i][1]]]; if (!a || !b) continue;
          linePos.set([a.x, a.y, a.z, lerp(a.x, b.x, f), lerp(a.y, b.y, f), lerp(a.z, b.z, f)], s * 6); s++;
        }
      } else if (STAR_INDEX[id] !== undefined && k < HL) {
        const e = eq[STAR_INDEX[id]], c = STARS[STAR_INDEX[id]].rgb;
        hlPos.set([e.x, e.y, e.z], k * 3); hlCol.set([lerp(0.6, c[0], 0.5) * amount, lerp(0.75, c[1], 0.5) * amount, lerp(1, c[2], 0.5) * amount], k * 3);
        hlSize[k] = 8 + 6 * amount; hlSeed[k] = 0.5; k++;
      }
    }
    if (lessonGuide > 0 && !highlights.has('banat_nash')) {
      const segs = lessonBowl;
      for (let i = 0; i < Math.min(3, segs.length) && s < SEG; i++) {
        const f = clamp01(lessonGuide * 3 - i); if (f <= 0) break;
        const a = eq[STAR_INDEX[segs[i][0]]], b = eq[STAR_INDEX[segs[i][1]]];
        linePos.set([a.x, a.y, a.z, lerp(a.x, b.x, f), lerp(a.y, b.y, f), lerp(a.z, b.z, f)], s++ * 6);
      }
    }
    hlGeo.setDrawRange(0, k); lineGeo.setDrawRange(0, s * 2);
    for (const a of ['position', 'aColor', 'aSize']) hlGeo.attributes[a].needsUpdate = true;
    lineGeo.attributes.position.needsUpdate = true;
  }
  let lst = 18, lstTo = 18, lstRate = 0, lstJob = 0;
  const tmpE = { x: 0, y: 0, z: 0 };
  function applyLST() { skyMatrix(((lst % 24) + 24) % 24, undefined, mArr); skyM.fromArray(mArr); }
  applyLST();
  const stars = {
    teach(id, guide = 0) {
      const next = id === 'megrez' || id === 'polaris' ? 'banat_nash' : null;
      if (next !== lesson) { lesson = next; updateLesson(); }
      const g = next && id === 'megrez' ? Math.round(clamp01(guide) * 20) / 20 : 0;
      if (g !== lessonGuide) { lessonGuide = g; rebuildHighlights(); }
    },
    get lst() { return ((lst % 24) + 24) % 24; },
    setLST(h, o = {}) {
      const d = o.duration || 0; lstJob++;
      let target = h; const curMod = ((lst % 24) + 24) % 24; lst = curMod;
      if (d <= 0 || G.state.fastText) { lst = lstTo = h; lstRate = 0; applyLST(); return Promise.resolve(); }
      if (target < lst) target += 24;
      lstTo = target; lstRate = (target - lst) / d;
      const my = lstJob; return G.scope.until(() => lstJob !== my || lstRate === 0);
    },
    dir(id, out) { const e = eq[STAR_INDEX[id]] || eq[STAR_INDEX.polaris]; applySky(mArr, e, tmpE); return out.set(tmpE.x, tmpE.y, tmpE.z); },
    asterism(id) { return ASTERISMS[id] || []; },
    highlight(id, amount = 1) { if (id === null || id === undefined) highlights.clear(); else if (amount <= 0) highlights.delete(id); else highlights.set(id, clamp01(amount)); rebuildHighlights(); },
  };

  // ---- presets ---------------------------------------------------------------------------------------
  const mk = () => { const s = { el: 0, az: 0, dir: new THREE.Vector3() }; for (const k of NUM) s[k] = 0; for (const k of COL) s[k] = new THREE.Color(); return s; };
  const cur = mk(), from = mk(), to = mk();
  function load(dst, name) {
    const p = P[name] || P.morning;
    for (const k of NUM) dst[k] = p[k]; for (const k of COL) dst[k].setHex(p[k]);
    const el = p.el * DEG, az = p.az * DEG; dst.dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  }
  function copy(dst, src) { for (const k of NUM) dst[k] = src[k]; for (const k of COL) dst[k].copy(src[k]); dst.dir.copy(src.dir); }
  let preset = 'morning', tr = 0, trDur = 0, trJob = 0, visibility = null, visK = 0;
  const murk = new THREE.Color(), tmpC = new THREE.Color();
  function push() {
    sunDir.copy(cur.dir);
    sunLight.color.copy(cur.sun); sunLight.intensity = cur.sunI;
    hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hemiI;
    uniforms.uSunColor.value.copy(cur.sun).multiplyScalar(cur.sunI / Math.PI);
    uniforms.uAmbSky.value.copy(cur.hs).multiplyScalar(cur.hemiI / Math.PI);
    uniforms.uAmbGround.value.copy(cur.hg).multiplyScalar(cur.hemiI / Math.PI);
    uniforms.uZenithColor.value.copy(cur.zen); uniforms.uHorizonColor.value.copy(cur.hor); uniforms.uNight.value = cur.night;
    domeU.uSunColorRaw.value.copy(cur.sun); domeU.uDisc.value = cur.disc; domeU.uGlow.value = cur.glow; domeU.uWall.value = cur.wall; domeU.uCloud.value = cur.cloud;
    domeU.uWallColor.value.copy(cur.fog).multiplyScalar(0.62);
    // fog: preset, thickened and tinted by the weather's visibility request
    let dens = cur.dens; murk.copy(cur.fog);
    if (visibility !== null) {
      dens = Math.max(dens, 1.98 / Math.max(4, visibility));
      tmpC.copy(cur.fog).lerp(cur.night > 0.5 ? tmpC.setHex(0x0a0d18) : tmpC.setHex(0xb08648), 0.0);
      visK = clamp01(1 - visibility / 160);
      if (cur.night < 0.5) murk.lerp(tmpC.setHex(0xb58a4b), visK * 0.85); else murk.lerp(tmpC.setHex(0x0a0d18), visK * 0.6);
      // the sky itself sinks into the murk
      uniforms.uZenithColor.value.lerp(murk, visK * 0.9); uniforms.uHorizonColor.value.lerp(murk, visK);
      uniforms.uNight.value = cur.night * (1 - visK);
      domeU.uDisc.value *= 1 - visK;
    }
    G.scene.fog.density = dens; G.scene.fog.color.copy(murk); G.scene.background.copy(murk);
  }
  load(cur, 'morning'); copy(to, cur); push();

  const sky = {
    uniforms, sunDir, sunLight, hemi, stars, dome,
    get preset() { return preset; },
    setPreset(name, o = {}) {
      if (!P[name]) { console.warn('[sky] unknown preset', name); name = 'morning'; }
      preset = name; trJob++;
      const d = o.duration || 0;
      load(to, name);
      if (d <= 0 || G.state.fastText) { copy(cur, to); trDur = 0; push(); return Promise.resolve(); }
      copy(from, cur); tr = 0; trDur = d;
      const my = trJob; return G.scope.until(() => trJob !== my || trDur === 0);
    },
    setVisibility(m) { visibility = m === null || m === undefined || !isFinite(m) ? null : m; },
    sunBearing() { if (cur.night > 0.5) return null; return ((Math.atan2(sunDir.x, -sunDir.z) / DEG) + 360) % 360; },
    update(dt) {
      uniforms.uTime.value += dt;
      if (trDur > 0) {
        tr = Math.min(1, tr + dt / trDur);
        const k = tr * tr * (3 - 2 * tr);
        for (const key of NUM) cur[key] = lerp(from[key], to[key], k);
        for (const key of COL) cur[key].copy(from[key]).lerp(to[key], k);
        cur.dir.copy(from.dir).lerp(to.dir, k); if (cur.dir.lengthSq() < 1e-6) cur.dir.copy(to.dir); cur.dir.normalize();
        if (tr >= 1) trDur = 0;
      }
      push();
      if (lstRate !== 0) { lst += lstRate * dt; if ((lstRate > 0 && lst >= lstTo) || (lstRate < 0 && lst <= lstTo)) { lst = lstTo; lstRate = 0; } applyLST(); }
      const w = G.world.weather && G.world.weather.wind;
      if (w && (w.x || w.z)) { const l = Math.hypot(w.x, w.z) || 1; domeU.uWallDir.value.set(-w.x / l, -w.z / l); }
      starU.uPx.value = G.renderer.getPixelRatio() * (G.stage && G.stage.h ? Math.min(1.35, Math.max(1, G.stage.h / 520)) : 1);
      const c = G.camera.position;
      sunLight.position.set(c.x + sunDir.x * 100, c.y + sunDir.y * 100, c.z + sunDir.z * 100); sunLight.target.position.copy(c);
      starPts.visible = hlPts.visible = lines.visible = uniforms.uNight.value > 0.01;
    },
  };
  return sky;
}
