/**
 * decals.js — footprints (ring buffer + authored trails, ONE InstancedMesh) and blob shadows (ONE InstancedMesh).
 * Shapes are drawn by the fragment shader (SDF): fresh = crisp dark rim + pale pushed-up edge, old = soft, rippled, faint.
 */
import * as THREE from 'three';
import { SHADE_PARS_FRAGMENT, SHADE_FRAGMENT } from '../core/shade.js';
import { yawOf } from '../core/math.js';

const KIND = { hero: 0, child: 1, camel: 2, wolf: 3 };
const QUAD = [0.42, 0.3, 0.34, 0.2];          // quad edge (m) per kind
const SPACING = [0.7, 0.5, 1.1, 0.6];
const RING = { low: 256, medium: 512, high: 768 };
const TRAIL_MAX = 640;
const BLOB_MAX = 32;
const NEVER = 1e9;

const PRINT_VS = `
  attribute vec4 aA; attribute float aS;
  varying vec2 vUv; varying vec4 vA; varying float vS; varying float vDist;
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xz + 0.5; vA = aA; vS = aS;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vDist = distance(wp.xyz, cameraPosition);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const PRINT_FS = SHADE_PARS_FRAGMENT + `
  uniform float uNow, uGold;
  varying vec2 vUv; varying vec4 vA; varying float vS; varying float vDist;
  #include <fog_pars_fragment>
  float el(vec2 p, vec2 c, vec2 r) { return (length((p - c) / r) - 1.0) * min(r.x, r.y); }
  float foot(vec2 p, float toes) {
    float d = min(el(p, vec2(0.0, 0.13), vec2(0.115, 0.2)), el(p, vec2(-0.012, -0.16), vec2(0.085, 0.14)));
    d = min(d, el(p, vec2(-0.006, -0.02), vec2(0.075, 0.15)));
    if (toes > 0.5) {
      d = min(d, length(p - vec2(-0.085, 0.3)) - 0.03);
      d = min(d, length(p - vec2(-0.04, 0.34)) - 0.03);
      d = min(d, length(p - vec2(0.012, 0.34)) - 0.028);
      d = min(d, length(p - vec2(0.06, 0.31)) - 0.026);
    }
    return d;
  }
  float shape(vec2 p, float k) {
    if (k < 0.5) return foot(p, 0.0);
    if (k < 1.5) return foot(p * 1.1, 1.0);
    if (k < 2.5) {
      float d = el(p, vec2(0.0, -0.03), vec2(0.2, 0.22));
      return max(d, min(0.04 - abs(p.x), p.y - 0.0));
    }
    float d = el(p, vec2(0.0, -0.1), vec2(0.15, 0.12));
    d = min(d, length(p - vec2(-0.17, 0.08)) - 0.06);
    d = min(d, length(p - vec2(-0.06, 0.19)) - 0.06);
    d = min(d, length(p - vec2(0.06, 0.19)) - 0.06);
    return min(d, length(p - vec2(0.17, 0.08)) - 0.06);
  }
  float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    float side = vS > 0.5 ? -1.0 : 1.0;
    vec2 p = (vUv - 0.5) * vec2(side, 1.0);
    float k = vA.x;
    float age = max(0.0, uNow - vA.z);
    float fr = vA.y * (1.0 - smoothstep(20.0, 70.0, age));
    float fade = 1.0 - smoothstep(90.0, 240.0, age);
    float d = shape(p, k);
    float sm = smoothstep(0.35, 0.65, fr);
    // fresh: crisp rim, soft pale lip
    float inF = smoothstep(0.008, -0.004, d);
    float rim = inF * smoothstep(-0.032, -0.004, d);
    float lip = (1.0 - inF) * smoothstep(0.012, -0.004, shape(p + vec2(0.012, -0.022), k)) * 0.8;
    // old: soft, half filled, broken by ripples
    float inO = smoothstep(0.05, -0.035, d);
    float rp = 0.5 + 0.5 * sin(p.y * 46.0 + p.x * 9.0 + vn(vUv * 9.0) * 5.0);
    inO *= 0.38 * mix(0.25, 1.0, smoothstep(0.25, 0.75, rp + vn(vUv * 17.0) * 0.5 - 0.25));
    float aF = inF * 0.34 + rim * 0.5;
    float a = mix(inO, aF, sm) * fade * vA.w;
    float lipA = lip * sm * fade * vA.w * 0.45;
    // without the eye, fresh prints read only close to the camera
    float near = smoothstep(16.0, 8.0, vDist);
    float vis = mix(mix(near * 0.8 + 0.2, 1.0, uGold) , 1.0, 1.0 - sm);
    a *= vis; lipA *= vis;
    a *= 1.0 - smoothstep(40.0, 70.0, vDist);
    if (a + lipA < 0.004) discard;
    vec3 dark = vec3(0.17, 0.095, 0.045), pale = vec3(0.95, 0.78, 0.5);
    vec3 col = (dark * a + pale * lipA) / (a + lipA);
    gl_FragColor = vec4(col, min(0.85, a + lipA));
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
    float gp = sm * uGold * (0.55 + 0.45 * sin(uNow * 6.2832));
    float ga = (inF * 0.9 + (1.0 - inF) * smoothstep(0.03, 0.0, d) * 0.5) * gp * vA.w;
    if (ga > 0.002) { vec3 gold = mix(vec3(0.12, 0.07, 0.02), vec3(1.0, 0.78, 0.25), smoothstep(-0.03, -0.004, d) * 0.0 + inF * (1.0 - rim * 0.8));
      gl_FragColor = vec4(mix(gl_FragColor.rgb, gold, ga), max(gl_FragColor.a, ga)); }
    if (gl_FragColor.a < 0.004) discard;
  }`;

const BLOB_VS = `
  attribute float aA; varying vec2 vUv; varying float vAl;
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xz * 2.0; vAl = aA;
    vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const BLOB_FS = SHADE_PARS_FRAGMENT + `
  varying vec2 vUv; varying float vAl;
  #include <fog_pars_fragment>
  void main() {
    float d = length(vUv);
    float a = smoothstep(1.0, 0.15, d) * vAl;
    if (a < 0.003) discard;
    gl_FragColor = vec4(0.1, 0.06, 0.03, a);
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
  }`;

function flatQuad() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5]), 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

export function createDecals(G) {
  let tier = G.quality ? G.quality.tier : 'medium';
  let ringCap = RING[tier] || 512;
  const total = RING.high + TRAIL_MAX;

  // ---------- prints ----------
  const pGeo = flatQuad();
  const aA = new Float32Array(total * 4), aS = new Float32Array(total);
  pGeo.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 1).setUsage(THREE.DynamicDrawUsage));
  const pu = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNow: { value: 0 }, uGold: { value: 0 }, uFirasa: G.shade.uFirasa }]);
  const pMat = new THREE.ShaderMaterial({
    uniforms: pu, vertexShader: PRINT_VS, fragmentShader: PRINT_FS, fog: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const prints = new THREE.InstancedMesh(pGeo, pMat, total);
  prints.frustumCulled = false; prints.renderOrder = 40; prints.count = total;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < total; i++) prints.setMatrixAt(i, zero);
  G.scene.add(prints);

  const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _p = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _s = new THREE.Matrix4();
  let ringPos = 0, side = 0;

  function place(i, x, z, yaw, kind, fresh, birth, vis, sd) {
    const t = G.world.terrain;
    t.normalAt(x, z, _n);
    _f.set(Math.sin(yaw), 0, Math.cos(yaw));
    _f.addScaledVector(_n, -_f.dot(_n)).normalize();
    _r.crossVectors(_n, _f);
    _m.makeBasis(_r, _n, _f);
    const q = QUAD[kind];
    _s.makeScale(q, 1, q); _m.multiply(_s);
    _m.setPosition(x, t.heightAt(x, z) + 0.05, z);
    prints.setMatrixAt(i, _m);
    const o = i * 4; aA[o] = kind; aA[o + 1] = fresh; aA[o + 2] = birth; aA[o + 3] = vis; aS[i] = sd;
    prints.instanceMatrix.needsUpdate = true;
    pGeo.attributes.aA.needsUpdate = true; pGeo.attributes.aS.needsUpdate = true;
  }

  function print(x, z, yaw, kind, { fresh = 1, vis = 1, sd } = {}) {
    const k = typeof kind === 'number' ? kind : (KIND[kind] ?? 0);
    if (sd === undefined) sd = (side ^= 1);
    if (ringPos >= ringCap) ringPos = 0;
    const off = k === 0 ? 0.08 : k === 1 ? 0.05 : k === 2 ? 0.28 : 0.04;
    const sg = sd ? 1 : -1;
    place(ringPos++, x + Math.cos(yaw) * off * sg, z - Math.sin(yaw) * off * sg, yaw, k, fresh, G.time.now, vis, sd);
  }

  // ---------- trails ----------
  const free = [];
  for (let i = RING.high + TRAIL_MAX - 1; i >= RING.high; i--) free.push(i);
  const trails = [];
  function trail(points, kind, { fresh = 1, spacing } = {}) {
    const k = KIND[kind] ?? 0, sp = spacing || SPACING[k];
    const slots = [], px = [], pz = [];
    let carry = 0, sd = 0, seed = 7 + ((points.length * 131 + Math.round((points[0].x || 0) * 3)) & 1023);
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const off = k === 0 ? 0.08 : k === 1 ? 0.05 : k === 2 ? 0.28 : 0.04;
    for (let i = 1; i < points.length && free.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
      if (L < 1e-4) continue;
      const yaw = yawOf(dx, dz), cx = dz / L, cz = -dx / L;
      for (let s = carry; s <= L && free.length; s += sp) {
        const j = (rnd() - 0.5) * sp * 0.2, sg = (sd ^= 1) ? 1 : -1;
        const x = a.x + dx * (s / L) + cx * off * sg + (rnd() - 0.5) * 0.04 + dx / L * j;
        const z = a.z + dz * (s / L) + cz * off * sg + (rnd() - 0.5) * 0.04 + dz / L * j;
        const idx = free.pop(); slots.push(idx); px.push(x); pz.push(z);
        place(idx, x, z, yaw + (rnd() - 0.5) * 0.12, k, fresh, NEVER, 1, sd);
        carry = s + sp - L;
      }
      if (carry < 0) carry = 0;
    }
    const h = { visible: true, center: null, radius: 0 };
    function refresh() {
      for (let i = 0; i < slots.length; i++) {
        let v = h.visible ? 1 : 0;
        if (v && h.center) { const d = Math.hypot(px[i] - h.center.x, pz[i] - h.center.z); v = d >= h.radius ? 0 : Math.min(1, (h.radius - d) / (h.radius * 0.3)); }
        aA[slots[i] * 4 + 3] = v;
      }
      pGeo.attributes.aA.needsUpdate = true;
    }
    const api = {
      setVisible(b) { h.visible = !!b; refresh(); },
      setFade() {},
      setReveal(c, r) { if (c) { h.center = c; h.radius = r; } else h.center = null; refresh(); },
      clear() { this.remove(); },
      remove() {
        for (const i of slots) { prints.setMatrixAt(i, zero); aA[i * 4 + 3] = 0; free.push(i); }
        slots.length = 0; prints.instanceMatrix.needsUpdate = true; pGeo.attributes.aA.needsUpdate = true;
        const t = trails.indexOf(api); if (t >= 0) trails.splice(t, 1);
      },
    };
    trails.push(api);
    return api;
  }

  // ---------- blob shadows ----------
  const bGeo = flatQuad();
  const bA = new Float32Array(BLOB_MAX);
  bGeo.setAttribute('aA', new THREE.InstancedBufferAttribute(bA, 1).setUsage(THREE.DynamicDrawUsage));
  const bMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFirasa: G.shade.uFirasa }]),
    vertexShader: BLOB_VS, fragmentShader: BLOB_FS, fog: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const blobs = new THREE.InstancedMesh(bGeo, bMat, BLOB_MAX);
  blobs.frustumCulled = false; blobs.renderOrder = 40; blobs.count = 0;
  G.scene.add(blobs);
  const list = [];
  function blob(obj, radius = 0.6) {
    const e = { obj, r: radius };
    if (list.length < BLOB_MAX) list.push(e);
    return { remove() { const i = list.indexOf(e); if (i >= 0) list.splice(i, 1); } };
  }
  function updateBlobs() {
    const sky = G.world.sky, t = G.world.terrain;
    const night = sky && sky.uniforms ? sky.uniforms.uNight.value : 0;
    let sx = 0, sz = 0;
    if (sky && sky.sunDir) { sx = -sky.sunDir.x; sz = -sky.sunDir.z; const l = Math.hypot(sx, sz); if (l > 1e-3) { sx /= l; sz /= l; } else sx = sz = 0; }
    const base = 0.5 * (1 - 0.6 * night);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.obj.getWorldPosition(_p);
      const gh = t.heightAt(_p.x, _p.z), up = Math.max(0, _p.y - gh);
      t.normalAt(_p.x, _p.z, _n);
      // axes: stretched along the shadow direction (away from the sun)
      _f.set(sx, 0, sz); if (_f.lengthSq() < 0.01) _f.set(0, 0, 1);
      _f.addScaledVector(_n, -_f.dot(_n)).normalize();
      _r.crossVectors(_n, _f);
      _m.makeBasis(_r, _n, _f);
      const s = e.r * 2 * (1 + up * 0.15), st = 1 + 0.25 * (sx || sz ? 1 : 0);
      _s.makeScale(s, 1, s * st); _m.multiply(_s);
      _m.setPosition(_p.x + sx * 0.08 * e.r, gh + 0.045, _p.z + sz * 0.08 * e.r);
      blobs.setMatrixAt(n, _m);
      bA[n++] = base * Math.max(0, 1 - up / 2.5);
    }
    blobs.count = n; blobs.visible = n > 0;
    blobs.instanceMatrix.needsUpdate = true; bGeo.attributes.aA.needsUpdate = true;
  }

  // ---------- events ----------
  G.events.on('player:step', e => {
    if (!e) return;
    const sf = e.surface;
    const vis = sf === 'gravel' ? 0.3 : sf === 'soft' ? 1.15 : 1;
    print(e.x, e.z, e.yaw, e.camel ? 'camel' : 'hero', { fresh: 1, vis, sd: e.foot === 'R' ? 1 : 0 });
  });
  G.events.on('quality:changed', e => { if (e && e.tier && RING[e.tier]) { tier = e.tier; ringCap = RING[tier]; if (ringPos >= ringCap) ringPos = 0; } });

  return {
    print, trail, blob,
    setFirasa(v) { pu.uGold.value = v || 0; },
    setQuality(t) { if (RING[t]) { tier = t; ringCap = RING[t]; if (ringPos >= ringCap) ringPos = 0; } },
    onLevelUnload() {
      for (let i = 0; i < RING.high; i++) { prints.setMatrixAt(i, zero); aA[i * 4 + 3] = 0; }
      for (const t of trails.slice()) t.remove();
      ringPos = 0; list.length = 0; blobs.count = 0;
      prints.instanceMatrix.needsUpdate = true; pGeo.attributes.aA.needsUpdate = true;
    },
    update() {
      pu.uNow.value = G.time.now;
      updateBlobs();
    },
  };
}
