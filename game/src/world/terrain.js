/**
 * Terrain «الرملة» (lean): one 1024 m dune field on a 6.4 m lattice + a coarse far field to the horizon, both drawn with a
 * MeshLambertMaterial extended in onBeforeCompile (ripples, sand/soft/gravel tones, sparkle, cloud shadows, الفراسة line).
 * Lambert keeps three's fog and the pooled fire lights for free.
 *   terrain.build(def) · heightAt(x, z) (exact triangles of the near mesh) · normalAt(x, z, out) · slopeAt(x, z) → 0..1 (1 = 33°)
 *   terrain.softAt(x, z) → 0..1 · surfaceAt(x, z) → 'sand'|'soft'|'gravel' · size · half · exactRadius · update(dt)
 * def: { seed, duneAmp, duneScale, windDeg (bearing the wind blows TOWARD), flats:[{x,z,r,fall,y?}], soft:[{x,z,r}], gravel:[{x,z,r}],
 *        ridges:[{x1,z1,x2,z2,h,w}] }.   A flat lies at the local base level + (y || 0).
 */
import * as THREE from 'three';
import { makeNoise } from '../core/noise.js';
import { SHADE_PARS_FRAGMENT, SHADE_FRAGMENT } from '../core/shade.js';
import { DEG } from '../core/math.js';

const N = 161, SIZE = 1024, HALF = 512, CELL = SIZE / (N - 1);
const FN = 49, FHALF = 3600, FCELL = (FHALF * 2) / (FN - 1);
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function createTerrain(G) {
  const H = new Float32Array(N * N);
  let def = { flats: [], soft: [], gravel: [], ridges: [] }, nz = makeNoise(1), amp = 7, sc = 110, wx = -0.94, wz = 0.34;
  let flatY = [];

  // ---- height function ---------------------------------------------------------------------------------
  const mega = (x, z) => 9 * nz.n2(x / 900, z / 900) + 4 * nz.n2(x / 380 + 9.1, z / 380 - 4.7);
  function farFn(x, z) {
    const u = (x * wx + z * wz) / sc, v = (x * wz - z * wx) / sc;
    return mega(x, z) + amp * (0.32 + 0.36 * nz.n2(u * 0.31 + 5.5, v * 0.19));
  }
  function natural(x, z) {
    const u = (x * wx + z * wz) / sc, v = (x * wz - z * wx) / sc;       // along / across the wind, in dune wavelengths
    let t = u + 0.55 * nz.n2(v * 0.45, u * 0.2) + 0.2 * nz.n2(v * 1.3 + 3.3, u * 0.7); t -= Math.floor(t);
    const p = t < 0.72 ? smooth(t / 0.72) : 1 - smooth((t - 0.72) / 0.28);   // gentle windward slope, steep slip face downwind
    const a = 0.3 + 0.7 * (0.5 + 0.5 * nz.n2(x / 310 + 2.2, z / 310 + 7.7));
    let t2 = u * 2.9 + 0.4 * nz.n2(v * 1.7, u * 0.9); t2 -= Math.floor(t2);
    const p2 = t2 < 0.7 ? smooth(t2 / 0.7) : 1 - smooth((t2 - 0.7) / 0.3);
    let h = mega(x, z) + amp * a * p + amp * 0.13 * p2 * (0.4 + 0.6 * a) + 0.3 * nz.n2(x / 23, z / 23);
    for (let i = 0; i < def.ridges.length; i++) {
      const r = def.ridges[i], ex = r.x2 - r.x1, ez = r.z2 - r.z1, L2 = ex * ex + ez * ez || 1;
      let k = ((x - r.x1) * ex + (z - r.z1) * ez) / L2; k = k < 0 ? 0 : k > 1 ? 1 : k;
      const dx = x - (r.x1 + ex * k), dz = z - (r.z1 + ez * k), w = r.w || 30;
      h += (r.h || 8) * smooth(1 - Math.sqrt(dx * dx + dz * dz) / w) * (0.85 + 0.15 * nz.n2(x / 40, z / 40));
    }
    return h;
  }
  function heightFn(x, z) {
    let h = natural(x, z);
    const e = smooth((Math.max(Math.abs(x), Math.abs(z)) - (HALF - 80)) / 72);
    if (e > 0) h += (farFn(x, z) - h) * e;
    for (let i = 0; i < def.flats.length; i++) {
      const f = def.flats[i], dist = Math.hypot(x - f.x, z - f.z), fall = f.fall || 30;
      if (dist >= f.r + fall) continue;
      h += (flatY[i] - h) * smooth(1 - (dist - f.r) / fall);
    }
    return h;
  }
  function discs(list, x, z, edge) {
    let m = 0;
    for (let i = 0; i < list.length; i++) { const s = list[i], k = smooth((s.r + edge - Math.hypot(x - s.x, z - s.z)) / (2 * edge)); if (k > m) m = k; }
    return m;
  }

  // ---- meshes ------------------------------------------------------------------------------------------
  function grid(n, cell, half) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * n * 3), idx = new Uint16Array((n - 1) * (n - 1) * 6);
    for (let j = 0, k = 0; j < n; j++) for (let i = 0; i < n; i++, k++) { pos[k * 3] = i * cell - half; pos[k * 3 + 2] = j * cell - half; }
    for (let j = 0, q = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = i + n * j, b = i + n * (j + 1), c = i + 1 + n * (j + 1), d = i + 1 + n * j;
      idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    g.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(n * n * 2), 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }
  function normals(g, n, cell) {
    const p = g.attributes.position.array, nr = g.attributes.normal.array;
    for (let j = 0, k = 0; j < n; j++) for (let i = 0; i < n; i++, k++) {
      const l = p[(k - (i > 0 ? 1 : 0)) * 3 + 1], r = p[(k + (i < n - 1 ? 1 : 0)) * 3 + 1];
      const u = p[(k - (j > 0 ? n : 0)) * 3 + 1], d = p[(k + (j < n - 1 ? n : 0)) * 3 + 1];
      const sx = (r - l) / ((i > 0 && i < n - 1 ? 2 : 1) * cell), sz = (d - u) / ((j > 0 && j < n - 1 ? 2 : 1) * cell), inv = 1 / Math.hypot(sx, 1, sz);
      nr[k * 3] = -sx * inv; nr[k * 3 + 1] = inv; nr[k * 3 + 2] = -sz * inv;
    }
    g.attributes.normal.needsUpdate = true;
  }
  const U = {
    uWind: { value: new THREE.Vector2(wx, wz) }, uTime: G.world.sky ? G.world.sky.uniforms.uTime : { value: 0 },
    uSunDirW: G.world.sky ? G.world.sky.uniforms.uSunDir : { value: new THREE.Vector3(0, 1, 0) }, uNightK: G.world.sky ? G.world.sky.uniforms.uNight : { value: 0 },
    uSunCol: G.world.sky ? G.world.sky.uniforms.uSunColor : { value: new THREE.Color(1, 1, 1) },
    uSand: { value: new THREE.Color(0xdcaa66) }, uSoft: { value: new THREE.Color(0xecd3a2) }, uGravel: { value: new THREE.Color(0x957552) },
    uFirasa: G.shade.uFirasa,
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.userData.hsShade = true;                       // shade chunk is injected below (the gold line must come after it)
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec2 aMask;\nvarying vec2 vMask;\nvarying vec3 vWPos;\n' + sh.vertexShader
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vMask = aMask;');
    sh.fragmentShader = SHADE_PARS_FRAGMENT + /* glsl */`
      uniform vec2 uWind; uniform float uTime, uNightK; uniform vec3 uSunDirW, uSunCol, uSand, uSoft, uGravel;
      varying vec2 vMask; varying vec3 vWPos;
      float tHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float tNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(tHash(i), tHash(i + vec2(1, 0)), f.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), f.x), f.y); }
    ` + sh.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        float tDist = length(vViewPosition);
        float tBig = tNoise(vWPos.xz * 0.011) * 0.6 + tNoise(vWPos.xz * 0.047) * 0.4;
        vec3 tSand = uSand * (0.88 + 0.22 * tBig);
        tSand = mix(tSand, uSoft, vMask.x * 0.85);
        float tSpk = (tHash(floor(vWPos.xz * 24.0)) - 0.5) * 0.26 * (1.0 - smoothstep(6.0, 26.0, tDist));
        tSand = mix(tSand, uGravel * (0.93 + 0.14 * tNoise(vWPos.xz * 1.9) + tSpk), vMask.y * 0.9 * (1.0 - smoothstep(60.0, 160.0, tDist) * 0.5));
        tSand *= 1.0 - 0.14 * smoothstep(0.55, 0.82, tNoise(vWPos.xz * 0.0042 + uTime * 0.006)) * (1.0 - uNightK);
        diffuseColor.rgb *= tSand;`)
      .replace('#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
        float tFw = fwidth(vWPos.x) + fwidth(vWPos.z);
        float tRk = (1.0 - smoothstep(5.0, 36.0, length(vViewPosition))) * (1.0 - vMask.y) * (1.0 - 0.5 * vMask.x) * (1.0 - smoothstep(0.045, 0.105, tFw));
        if (tRk > 0.002) {
          // two ripple families (along the wind in two wavelengths / ~58° off, a third wavelength) that trade places over ~30 m patches; calm and busy patches,
          // soft or sharp crests, bending crests — and a lower amplitude than the old single sine, so the ground no longer reads as a printed pattern
          vec2 tq = vWPos.xz;
          float tFam = smoothstep(0.3, 0.7, tNoise(tq * 0.035 + 3.7));
          float tPat = smoothstep(0.25, 0.75, tNoise(tq * 0.075 + 11.0));
          float tSh = tNoise(tq * 0.05 + 29.0);
          float tWr = 2.4 * tNoise(tq * 0.33) + 26.0 * tNoise(tq * 0.075 + 5.0) + 0.9 * tNoise(tq * 1.4);
          vec2 tD2 = vec2(uWind.x * 0.53 - uWind.y * 0.85, uWind.x * 0.85 + uWind.y * 0.53);
          float tDw = dot(tq, uWind), tSc = smoothstep(0.35, 0.65, tNoise(tq * 0.045 + 17.0));
          float tW1 = mix(cos(tDw * 6.2 + tWr), cos(tDw * 10.5 + tWr * 1.3 + 0.9), tSc), tW2 = cos(dot(tq, tD2) * 15.5 + tWr * 1.4 + 1.7);
          float tEx = mix(1.0, 2.4, tSh);
          tW1 = sign(tW1) * pow(abs(tW1), tEx); tW2 = sign(tW2) * pow(abs(tW2), tEx);
          vec2 tOff = uWind * tW1 * (1.0 - tFam) + tD2 * tW2 * tFam * 0.85;
          normal = normalize(normal - mat3(viewMatrix) * vec3(tOff.x, 0.0, tOff.y) * (0.07 + 0.16 * tPat) * tRk);
        }`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
        { vec3 tV = normalize(vViewPosition), tL = normalize(mat3(viewMatrix) * uSunDirW);
          float tGl = pow(max(dot(reflect(-tL, normal), tV), 0.0), 24.0);
          float tSp = step(0.9955, tHash(floor(vWPos.xz * 70.0) + floor(vViewPosition.xy * 2.0)));
          totalEmissiveRadiance += uSunCol * tSp * tGl * 0.9 * (1.0 - smoothstep(4.0, 26.0, length(vViewPosition))) * (1.0 - vMask.y); }`)
      .replace('#include <dithering_fragment>', SHADE_FRAGMENT + /* glsl */`
        { float tE = smoothstep(0.36, 0.5, vMask.x) * (1.0 - smoothstep(0.5, 0.64, vMask.x));
          gl_FragColor.rgb += vec3(1.0, 0.76, 0.28) * tE * uFirasa * (0.55 + 0.25 * sin(uTime * 6.28)); }
        #include <dithering_fragment>`);
  };
  mat.customProgramCacheKey = () => 'hs-terrain';
  const near = grid(N, CELL, HALF), far = grid(FN, FCELL, FHALF);
  // the near field is drawn as CHUNKS² frustum-culled pieces that share its vertex buffers (same triangles, so heightAt is
  // unchanged): what lies behind the camera costs nothing. The far skirt stays one always-drawn mesh.
  const CHUNKS = 4, CC = (N - 1) / CHUNKS, chunks = [];
  for (let cj = 0; cj < CHUNKS; cj++) for (let ci = 0; ci < CHUNKS; ci++) {
    const idx = new Uint16Array(CC * CC * 6);
    for (let j = cj * CC, q = 0; j < (cj + 1) * CC; j++) for (let i = ci * CC; i < (ci + 1) * CC; i++) {
      const a = i + N * j, b = i + N * (j + 1), c = i + 1 + N * (j + 1), d = i + 1 + N * j;
      idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    for (const name in near.attributes) g.setAttribute(name, near.attributes[name]);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.Mesh(g, mat); m.name = 'terrain'; m.frustumCulled = true; m.renderOrder = 10; m.matrixAutoUpdate = false;
    chunks.push(m); G.scene.add(m);
  }
  const meshF = new THREE.Mesh(far, mat); meshF.frustumCulled = false; meshF.renderOrder = 10; meshF.matrixAutoUpdate = false; meshF.name = 'terrain-far';
  G.scene.add(meshF);

  function build(d) {
    def = { flats: [], soft: [], gravel: [], ridges: [], ...d };
    nz = makeNoise(def.seed || 1);
    amp = def.duneAmp === undefined ? 7 : def.duneAmp; sc = def.duneScale || 110;
    const a = (def.windDeg === undefined ? 250 : def.windDeg) * DEG; wx = Math.sin(a); wz = -Math.cos(a); U.uWind.value.set(wx, wz);
    flatY = def.flats.map(f => mega(f.x, f.z) + amp * 0.22 + (f.y || 0));
    const p = near.attributes.position.array, m = near.attributes.aMask.array;
    for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++, k++) {
      const x = i * CELL - HALF, z = j * CELL - HALF, h = heightFn(x, z);
      H[k] = h; p[k * 3 + 1] = h; m[k * 2] = discs(def.soft, x, z, 7); m[k * 2 + 1] = discs(def.gravel, x, z, 9);
    }
    near.attributes.position.needsUpdate = true; near.attributes.aMask.needsUpdate = true; normals(near, N, CELL);
    const fp = far.attributes.position.array;
    for (let j = 0, k = 0; j < FN; j++) for (let i = 0; i < FN; i++, k++) {
      const x = i * FCELL - FHALF, z = j * FCELL - FHALF, r = Math.max(Math.abs(x), Math.abs(z));
      fp[k * 3 + 1] = farFn(x, z) - (r < HALF - 60 ? 26 : 4.5 * (1 - smooth((r - 700) / 500)));   // sits under the near field, meets it beyond the rim
    }
    far.attributes.position.needsUpdate = true; normals(far, FN, FCELL);
    near.computeBoundingSphere(); far.computeBoundingSphere();
    // per-chunk bounds from the chunk's own lattice (three's compute* would scan the whole shared vertex buffer)
    for (let c = 0; c < chunks.length; c++) {
      const ci = c % CHUNKS, cj = (c / CHUNKS) | 0; let lo = Infinity, hi = -Infinity;
      for (let j = cj * CC; j <= (cj + 1) * CC; j++) for (let i = ci * CC; i <= (ci + 1) * CC; i++) { const h = H[j * N + i]; if (h < lo) lo = h; if (h > hi) hi = h; }
      const g = chunks[c].geometry, x0 = ci * CC * CELL - HALF, z0 = cj * CC * CELL - HALF, x1 = x0 + CC * CELL, z1 = z0 + CC * CELL;
      if (!g.boundingBox) g.boundingBox = new THREE.Box3();
      if (!g.boundingSphere) g.boundingSphere = new THREE.Sphere();
      g.boundingBox.min.set(x0, lo - 1, z0); g.boundingBox.max.set(x1, hi + 1, z1);
      g.boundingBox.getBoundingSphere(g.boundingSphere);
    }
  }
  function heightAt(x, z) {
    if (x <= -HALF || x >= HALF || z <= -HALF || z >= HALF) return farFn(x, z);
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL, i = Math.min(N - 2, fx | 0), j = Math.min(N - 2, fz | 0), u = fx - i, v = fz - j, k = j * N + i;
    const ha = H[k], hd = H[k + 1], hb = H[k + N], hc = H[k + N + 1];
    return u + v < 1 ? ha + u * (hd - ha) + v * (hb - ha) : hc + (1 - u) * (hb - hc) + (1 - v) * (hd - hc);
  }
  const E = 2.2;
  build({ seed: 1 });
  return {
    size: SIZE, half: HALF, exactRadius: HALF, material: mat,
    build, heightAt,
    normalAt(x, z, out) {
      const dx = heightAt(x + E, z) - heightAt(x - E, z), dz = heightAt(x, z + E) - heightAt(x, z - E), l = Math.hypot(dx, 2 * E, dz);
      out.x = -dx / l; out.y = (2 * E) / l; out.z = -dz / l; return out;
    },
    slopeAt(x, z) { const g = Math.hypot(heightAt(x + E, z) - heightAt(x - E, z), heightAt(x, z + E) - heightAt(x, z - E)) / (2 * E); return Math.min(1, g / 0.65); },
    softAt(x, z) { return discs(def.soft, x, z, 7); },
    surfaceAt(x, z) { return discs(def.soft, x, z, 7) > 0.5 ? 'soft' : discs(def.gravel, x, z, 9) > 0.5 ? 'gravel' : 'sand'; },
    update() {},
  };
}
