/**
 * weather.js — wind, dust streamers, storm (grains + one full-screen sheet), rain (streaks + splashes), scripted gusts.
 * Everything is camera-relative, preallocated at construction (counts/alpha 0 when unused) and tier-scaled.
 */
import * as THREE from 'three';
import { SHADE_PARS_FRAGMENT, SHADE_FRAGMENT } from '../core/shade.js';
import { DEG, lerp, clamp, smoothstep } from '../core/math.js';

const GRAINS = { low: 120, medium: 200, high: 300 };
const RAIN = { low: 250, medium: 450, high: 700 };
const SPLASH = { low: 40, medium: 70, high: 110 };
const RIBBONS = { low: 8, medium: 14, high: 22 };
const K = 14;                 // points per ribbon

const STREAK_VS = `
  attribute vec4 aSeed; attribute float aEnd;
  uniform float uPhase, uAmt, uLen, uBox, uSpread;
  uniform vec3 uDir;
  varying float vAl;
  #include <fog_pars_vertex>
  void main() {
    vec3 base = aSeed.xyz * uBox;
    float sp = 0.75 + 0.5 * fract(aSeed.w * 7.31);
    vec3 p = base + uDir * (uPhase * sp);
    vec3 r = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5;
    r.y *= uSpread;
    vAl = (aSeed.w < uAmt ? 1.0 : 0.0) * smoothstep(0.6, 2.5, length(r)) * (1.0 - smoothstep(0.35, 0.5, length(r) / uBox));
    r -= uDir * (uLen * sp) * aEnd;
    vec4 mvPosition = viewMatrix * vec4(cameraPosition + r, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const STREAK_FS = SHADE_PARS_FRAGMENT + `
  uniform vec3 uColor; uniform float uAlpha; varying float vAl;
  #include <fog_pars_fragment>
  void main() {
    if (vAl < 0.01) discard;
    gl_FragColor = vec4(uColor, vAl * uAlpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
  }`;

const RIB_VS = `
  attribute float aA; varying float vA;
  #include <fog_pars_vertex>
  void main() {
    vA = aA;
    vec4 mvPosition = viewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const RIB_FS = SHADE_PARS_FRAGMENT + `
  uniform vec3 uColor; uniform float uAmt; varying float vA;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(uColor, vA * uAmt);
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
  }`;

const SHEET_VS = `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const SHEET_FS = SHADE_PARS_FRAGMENT + `
  uniform vec3 fogColor;
  uniform vec2 uDir; uniform float uPhase, uStorm, uWarn, uAspect;
  varying vec2 vP;
  float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 q = vec2(vP.x * uAspect, vP.y);
    float al = dot(q, uDir), ac = dot(q, vec2(-uDir.y, uDir.x));
    float n1 = vn(vec2(al * 0.7 - uPhase * 2.4, ac * 16.0));
    float n2 = vn(vec2(al * 0.28 - uPhase, ac * 5.0));
    float streak = smoothstep(0.35, 0.95, n1) * (0.4 + 0.6 * n2);
    float wv = smoothstep(-0.2, 1.2, dot(vP, -uDir * vec2(1.0 / uAspect, 1.0)));
    float a = uStorm * (0.1 + 0.34 * streak) + uWarn * wv * (0.15 + 0.25 * streak) + uStorm * 0.18 * n2 * (0.4 + 0.6 * wv);
    if (a < 0.003) discard;
    gl_FragColor = vec4(fogColor * (0.82 + 0.3 * streak), min(a, 0.7));
    #include <colorspace_fragment>
    ${SHADE_FRAGMENT}
  }`;

const SPL_VS = `
  attribute float aAge; varying float vAge; uniform float uPx;
  #include <fog_pars_vertex>
  void main() {
    vAge = aAge;
    vec4 mvPosition = viewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(0.34 * uPx / -mvPosition.z, 1.0, 40.0);
    #include <fog_vertex>
  }`;
const SPL_FS = SHADE_PARS_FRAGMENT + `
  uniform float uAmt; varying float vAge;
  #include <fog_pars_fragment>
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(0.22, 0.0, abs(d - vAge)) * (1.0 - vAge) * uAmt * step(0.0, vAge);
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.78, 0.8, 0.82, a * 0.55);
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
  }`;

function fogMat(extra, vs, fs, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, extra]),
    vertexShader: vs, fragmentShader: fs, fog: true, transparent: true, depthWrite: false, ...opts,
  });
}

export function createWeather(G) {
  const wind = { x: 1, z: 0, strength: 0.25, deg: 250 };
  let dust = 0, storm = 0, rain = 0, tier = G.quality ? G.quality.tier : 'medium';
  const tw = { dust: null, storm: null, rain: null };
  const sh = G.shade.uFirasa;
  let time = 0, gPhase = 0, rPhase = 0, sPhase = 0;
  const gust = { phase: 0, t: 0, warn: 0, dur: 0, strength: 1, id: 0, surge: 0, warnAmt: 0 };

  // ---- streak systems (grains / rain): LineSegments in a camera-centred wrapping box ----
  function streaks(n, box, color, alpha, len, spread) {
    const seed = new Float32Array(n * 8), end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = G.vrng.next(), b = G.vrng.next(), c = G.vrng.next(), d = (i + 0.5) / n;
      for (let v = 0; v < 2; v++) { const o = (i * 2 + v) * 4; seed[o] = a; seed[o + 1] = b; seed[o + 2] = c; seed[o + 3] = d; end[i * 2 + v] = v; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setDrawRange(0, 0);
    const m = fogMat({ uPhase: { value: 0 }, uAmt: { value: 0 }, uLen: { value: len }, uBox: { value: box }, uSpread: { value: spread },
      uDir: { value: new THREE.Vector3(1, 0, 0) }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uFirasa: sh }, STREAK_VS, STREAK_FS);
    const mesh = new THREE.LineSegments(g, m);
    mesh.frustumCulled = false; mesh.renderOrder = 50; mesh.visible = false;
    G.scene.add(mesh);
    return { mesh, m, g };
  }
  const grains = streaks(GRAINS.high, 36, 0xd8b074, 0.55, 1.4, 0.5);
  const rainS = streaks(RAIN.high, 30, 0xc4ccd4, 0.38, 0.75, 0.55);

  // ---- ground streamers: dynamic ribbons following the dune surface ----
  const MR = RIBBONS.high;
  const rPos = new Float32Array(MR * K * 2 * 3), rA = new Float32Array(MR * K * 2);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage));
  rg.setAttribute('aA', new THREE.BufferAttribute(rA, 1));
  const idx = [];
  for (let r = 0; r < MR; r++) for (let j = 0; j < K - 1; j++) { const a = (r * K + j) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  rg.setIndex(idx); rg.setDrawRange(0, 0);
  const ribMat = fogMat({ uColor: { value: new THREE.Color(0xe2c690) }, uAmt: { value: 1 }, uFirasa: sh }, RIB_VS, RIB_FS, { side: THREE.DoubleSide });
  const ribbons = new THREE.Mesh(rg, ribMat);
  ribbons.frustumCulled = false; ribbons.renderOrder = 50; ribbons.visible = false;
  G.scene.add(ribbons);
  const rb = { x: new Float32Array(MR), z: new Float32Array(MR), ph: new Float32Array(MR), v: new Float32Array(MR), h: new Float32Array(MR) };
  for (let r = 0; r < MR; r++) {
    for (let j = 0; j < K; j++) { const a = Math.sin(Math.PI * j / (K - 1)); rA[(r * K + j) * 2] = a * 0.38; rA[(r * K + j) * 2 + 1] = 0; }
    rb.v[r] = 0.7 + G.vrng.next() * 0.6; rb.ph[r] = G.vrng.next() * 6.28; rb.h[r] = 0.12 + G.vrng.next() * 0.14;
    rb.x[r] = rb.z[r] = 1e5;   // respawn on first update
  }

  // ---- full-screen storm sheet (one layer) ----
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const sheetMat = fogMat({ uDir: { value: new THREE.Vector2(1, 0) }, uPhase: { value: 0 }, uStorm: { value: 0 }, uWarn: { value: 0 }, uAspect: { value: 1.6 }, uFirasa: sh },
    SHEET_VS, SHEET_FS, { depthTest: false });
  const sheet = new THREE.Mesh(sg, sheetMat);
  sheet.frustumCulled = false; sheet.renderOrder = 51; sheet.visible = false;
  G.scene.add(sheet);

  // ---- rain splashes ----
  const NS = SPLASH.high;
  const spPos = new Float32Array(NS * 3), spAge = new Float32Array(NS).fill(-1);
  const spg = new THREE.BufferGeometry();
  spg.setAttribute('position', new THREE.BufferAttribute(spPos, 3).setUsage(THREE.DynamicDrawUsage));
  spg.setAttribute('aAge', new THREE.BufferAttribute(spAge, 1).setUsage(THREE.DynamicDrawUsage));
  spg.setDrawRange(0, 0);
  const splMat = fogMat({ uPx: { value: 800 }, uAmt: { value: 0 }, uFirasa: sh }, SPL_VS, SPL_FS);
  const splash = new THREE.Points(spg, splMat);
  splash.frustumCulled = false; splash.renderOrder = 50; splash.visible = false;
  G.scene.add(splash);
  const spLife = new Float32Array(NS);
  for (let i = 0; i < NS; i++) { spAge[i] = G.vrng.next(); spLife[i] = 0.35 + G.vrng.next() * 0.3; spPos[i * 3 + 1] = -1e4; }

  function ramp(key, get, set, to, duration) {
    if (!duration) { set(to); tw[key] = null; return; }
    tw[key] = { from: get(), to, t: 0, dur: duration, set };
  }
  function visibility() {
    let v = Infinity;
    if (storm > 0.01) v = lerp(600, 12, Math.pow(storm, 0.85));
    if (dust > 0.35) v = Math.min(v, lerp(500, 90, (dust - 0.35) / 0.65));
    if (rain > 0.3) v = Math.min(v, lerp(500, 220, (rain - 0.3) / 0.7));
    return v;
  }

  const _c = new THREE.Vector3();
  function updateRibbons(dt, amt) {
    const n = amt < 0.01 ? 0 : Math.max(1, Math.ceil(RIBBONS[tier] * Math.min(1, amt)));
    ribbons.visible = n > 0; rg.setDrawRange(0, n * (K - 1) * 6);
    if (!n) return;
    ribMat.uniforms.uAmt.value = Math.min(1, 0.45 + amt);
    const cam = G.camera.position, T = G.world.terrain, R = 26;
    const wx = wind.x, wz = wind.z, px = -wz, pz = wx;
    const spd = (2 + 9 * wind.strength) * (1 + storm * 1.8 + gust.surge * 1.5);
    for (let r = 0; r < n; r++) {
      rb.x[r] += wx * spd * rb.v[r] * dt; rb.z[r] += wz * spd * rb.v[r] * dt;
      const dx = rb.x[r] - cam.x, dz = rb.z[r] - cam.z;
      if (dx * wx + dz * wz > R || dx * dx + dz * dz > R * R * 1.6) {
        const l = (G.vrng.next() * 2 - 1) * R;
        rb.x[r] = cam.x - wx * R * (0.6 + 0.4 * G.vrng.next()) + px * l;
        rb.z[r] = cam.z - wz * R * (0.6 + 0.4 * G.vrng.next()) + pz * l;
      }
      const seg = 0.55 + 0.25 * rb.v[r];
      for (let j = 0; j < K; j++) {
        const w = Math.sin(rb.ph[r] + time * 1.3 * rb.v[r] + j * 0.6) * (0.25 + 0.5 * j / K);
        const x = rb.x[r] - wx * j * seg + px * w, z = rb.z[r] - wz * j * seg + pz * w;
        const y = T.heightAt(x, z) + 0.03, o = (r * K + j) * 6, hh = rb.h[r] * Math.sin(Math.PI * (j + 0.5) / K);
        rPos[o] = x + px * 0.06; rPos[o + 1] = y; rPos[o + 2] = z + pz * 0.06;
        rPos[o + 3] = x - px * 0.06; rPos[o + 4] = y + hh; rPos[o + 5] = z - pz * 0.06;
      }
    }
    rg.attributes.position.needsUpdate = true;
  }

  function updateSplashes(dt, amt) {
    const n = amt < 0.01 ? 0 : Math.ceil(SPLASH[tier] * Math.min(1, amt));
    splash.visible = n > 0; spg.setDrawRange(0, n);
    if (!n) return;
    splMat.uniforms.uAmt.value = 1;
    const cam = G.camera.position, T = G.world.terrain;
    for (let i = 0; i < n; i++) {
      spAge[i] += dt / spLife[i];
      if (spAge[i] >= 1) {
        spAge[i] = 0; spLife[i] = 0.35 + G.vrng.next() * 0.3;
        const a = G.vrng.next() * 6.283, d = 1.5 + Math.sqrt(G.vrng.next()) * 13;
        const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
        spPos[i * 3] = x; spPos[i * 3 + 1] = T.heightAt(x, z) + 0.04; spPos[i * 3 + 2] = z;
      }
    }
    spg.attributes.position.needsUpdate = true; spg.attributes.aAge.needsUpdate = true;
    splMat.uniforms.uPx.value = G.renderer.domElement.height / (2 * Math.tan(G.camera.fov * DEG * 0.5));
  }

  const api = {
    wind,
    get dust() { return dust; }, get stormLevel() { return storm; }, get rainLevel() { return rain; },
    get gusting() { return gust.phase === 2; },
    get visibility() { return visibility(); },
    /** deg = compass bearing the wind blows TOWARD */
    setWind(deg, strength) { wind.deg = deg; wind.strength = strength; wind.x = Math.sin(deg * DEG); wind.z = -Math.cos(deg * DEG); },
    setDust(a, { duration = 0 } = {}) { ramp('dust', () => dust, v => { dust = v; }, a, duration); },
    storm(level, { duration = 0 } = {}) { ramp('storm', () => storm, v => { storm = v; }, level, duration); },
    rain(level, { duration = 0 } = {}) { ramp('rain', () => rain, v => { rain = v; }, level, duration); },
    /** scripted gust: warn (visual from the windward side) → impact → resolves when it has passed */
    gust({ warn = 1.5, strength = 1, duration = 1.2 } = {}) {
      const f = G.state.fastText;
      gust.id++; const id = gust.id;
      gust.phase = 1; gust.t = 0; gust.warn = f ? 0.05 : warn; gust.dur = f ? 0.05 : duration; gust.strength = strength;
      G.events.emit('weather:gustWarn', { in: warn, dir: { x: wind.x, z: wind.z } });
      return G.scope.until(() => gust.id !== id || gust.phase === 0, { timeout: warn + duration + 5 });
    },
    onBeatEnd() { gust.phase = 0; gust.id++; },
    onLevelUnload() { gust.phase = 0; gust.id++; dust = storm = rain = 0; tw.dust = tw.storm = tw.rain = null; },
    setQuality(t) { if (GRAINS[t]) tier = t; },
    update(dt) {
      time += dt;
      for (const k in tw) { const t = tw[k]; if (!t) continue; t.t += dt; const a = Math.min(1, t.t / t.dur); t.set(t.from + (t.to - t.from) * a); if (a >= 1) tw[k] = null; }
      // gust state machine
      if (gust.phase === 1) {
        gust.t += dt; gust.warnAmt = Math.min(1, gust.t / gust.warn);
        if (gust.t >= gust.warn) { gust.phase = 2; gust.t = 0; gust.warnAmt = 0; G.events.emit('weather:gust', { strength: gust.strength, duration: gust.dur }); }
      } else if (gust.phase === 2) {
        gust.t += dt;
        const u = gust.t / gust.dur;
        gust.surge = gust.strength * smoothstep(0, 0.12, u) * (1 - smoothstep(0.45, 1, u));
        if (gust.t >= gust.dur) gust.phase = 0;
      } else { gust.warnAmt = 0; gust.surge += (0 - gust.surge) * Math.min(1, dt * 4); if (gust.surge < 0.005) gust.surge = 0; }
      const surge = gust.surge, warnA = gust.warnAmt;

      const vis = visibility();
      G.world.sky.setVisibility(isFinite(vis) ? vis : null);

      const cam = G.camera, e = cam.matrixWorld.elements;
      const sx = wind.x * e[0] + wind.z * e[2], sy = wind.x * e[4] + wind.z * e[6];
      const sl = Math.hypot(sx, sy) || 1;
      const ws = 3 + 14 * wind.strength;

      // grains
      const gAmt = Math.max(storm, dust * 0.4, surge * 0.8, warnA * 0.2);
      const gn = Math.ceil(GRAINS[tier] * Math.min(1, gAmt));
      grains.mesh.visible = gAmt > 0.01; grains.g.setDrawRange(0, gAmt > 0.01 ? GRAINS[tier] * 2 : 0);
      if (grains.mesh.visible) {
        gPhase += dt * (12 + 38 * storm + 60 * surge) * (0.6 + wind.strength);
        const u = grains.m.uniforms;
        u.uPhase.value = gPhase; u.uAmt.value = gn / GRAINS[tier] * (gAmt >= 1 ? 1 : 1);
        u.uDir.value.set(wind.x, -0.04, wind.z); u.uLen.value = 0.6 + 1.6 * storm + 1.4 * surge;
        u.uAlpha.value = 0.3 + 0.35 * Math.min(1, gAmt);
      }
      // rain
      const rn = rain > 0.01;
      rainS.mesh.visible = rn; rainS.g.setDrawRange(0, rn ? RAIN[tier] * 2 : 0);
      if (rn) {
        rPhase += dt * 13;
        const u = rainS.m.uniforms;
        u.uPhase.value = rPhase; u.uAmt.value = Math.min(1, rain);
        u.uDir.value.set(wind.x * wind.strength * 3, -9, wind.z * wind.strength * 3).multiplyScalar(1 / 9);
        u.uDir.value.y = -1; u.uLen.value = 0.45 + 0.4 * rain; u.uAlpha.value = 0.25 + 0.25 * rain;
      }
      updateSplashes(dt, rain);
      updateRibbons(dt, Math.max(dust, storm, surge * 0.8, warnA * 0.3));

      // storm sheet
      const sAmt = Math.max(storm, 0), wAmt = Math.min(1, warnA + surge * 0.7);
      sheet.visible = sAmt > 0.02 || wAmt > 0.02;
      if (sheet.visible) {
        sPhase += dt * (0.5 + 2.5 * storm + 3 * surge) * (0.5 + wind.strength);
        const u = sheetMat.uniforms;
        u.uDir.value.set(sx / sl, sy / sl); u.uPhase.value = sPhase; u.uStorm.value = sAmt; u.uWarn.value = wAmt;
        u.uAspect.value = G.stage ? G.stage.w / Math.max(1, G.stage.h) : 1.6;
      }
    },
  };
  void _c; void clamp;
  return api;
}
