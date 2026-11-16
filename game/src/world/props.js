/**
 * props.js — GLB prop placement, procedural items & landmarks, instanced scatter, fires (pooled lights), torch flames,
 * glow markers, sandgrouse flock.  Contract: docs/ARCHITECTURE.md §4 props.js.
 * Everything is built at construction / level load; per-frame work is allocation-free.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep, yawOf } from '../core/math.js';

// ---------- scratch ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _c = new THREE.Color(), _wp = new THREE.Vector3(), _bs = new THREE.Vector2(), _up = new THREE.Vector3(0, 1, 0);

function rng32(seed) {
  let a = (seed | 0) >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

// ---------- geometry builders (vertex-coloured, non-indexed, merged) ----------
/** part: geometry + colour + transform; grad = [bottomMul, topMul] brightness over its own height. */
function part(geo, color, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, grad = [0.78, 1.12], jit = 0) {
  return { geo, color, x, y, z, sx, sy, sz, rx, ry, rz, grad, jit };
}
function merged(parts, upNormals = false) {
  const list = [];
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.deleteAttribute('uv');
    const pos = g.attributes.position, n = pos.count;
    if (p.jit) for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = p.jit; pos.setXYZ(i, x + (hash3(x, y, z) - 0.5) * k, y + (hash3(y, z, x) - 0.5) * k, z + (hash3(z, x, y) - 0.5) * k);
    }
    g.computeBoundingBox(); const y0 = g.boundingBox.min.y, hh = Math.max(1e-4, g.boundingBox.max.y - y0);
    const col = new Float32Array(n * 3); _c.set(p.color);
    for (let i = 0; i < n; i++) {
      const m = lerp(p.grad[0], p.grad[1], (pos.getY(i) - y0) / hh);
      col[i * 3] = _c.r * m; col[i * 3 + 1] = _c.g * m; col[i * 3 + 2] = _c.b * m;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    _q.setFromEuler(_e.set(p.rx, p.ry, p.rz)); _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.sx, p.sy, p.sz));
    g.applyMatrix4(_m);
    if (!p.jit && !g.attributes.normal) g.computeVertexNormals();
    if (p.jit) g.computeVertexNormals();
    list.push(g);
  }
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (upNormals) { const nn = out.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0); }
  out.computeBoundingSphere(); out.userData.own = true;
  return out;
}
const ico = (d = 0) => new THREE.IcosahedronGeometry(0.5, d);
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([ax, ay, az, bx, by, bz, cx, cy, cz], 3)); g.computeVertexNormals(); return g;
};

// ---------- shaders ----------
const BILL_VS = `
uniform float uSize, uGrow; varying vec2 vUv; varying float vD;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0); vD = -mv.z;
  float s = uSize + max(vD,0.0) * uGrow; mv.xy += (uv - 0.5) * 2.0 * s; gl_Position = projectionMatrix * mv; }`;
const GLOW_FS = `
uniform vec3 uColor; uniform float uA, uT, uPulse; varying vec2 vUv; varying float vD;
void main(){ float r = length(vUv*2.0-1.0); float a = pow(max(1.0-r,0.0),2.2);
  float pu = 1.0 - uPulse + uPulse*(0.65+0.35*sin(uT*6.2831));
  vec3 c = mix(uColor, vec3(1.0), smoothstep(0.45,0.0,r)*0.45);
  gl_FragColor = vec4(c, a*uA*pu); }`;
const BEACON_FS = `
uniform vec3 uColor; uniform float uA, uRange, uT; varying vec2 vUv; varying float vD;
void main(){ float r = length(vUv*2.0-1.0); float a = pow(max(1.0-r,0.0),2.0);
  float far = 1.0 - smoothstep(uRange*0.6, uRange, vD); float near = smoothstep(2.0, 12.0, vD);
  float fl = 0.9 + 0.1*sin(uT*9.0);
  gl_FragColor = vec4(mix(uColor, vec3(1.0,0.9,0.6), smoothstep(0.5,0.0,r)*0.6), a*uA*far*near*fl*0.9); }`;
const FLAME_VS = `
uniform float uT, uSeed; varying vec2 vUv;
void main(){ vUv = uv; vec3 p = position; float h = uv.y;
  p.x += sin(uT*7.0 + uSeed + h*4.0 + position.z*3.0) * 0.14 * h * h; p.z += cos(uT*6.0 + uSeed*1.7 + h*3.0) * 0.10 * h * h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`;
const FLAME_FS = `
uniform float uT, uSeed, uLit; varying vec2 vUv;
void main(){ float h = vUv.y; float x = (vUv.x-0.5)*2.0;
  float fl = sin(uT*9.0+h*5.0+uSeed)*0.5 + sin(uT*13.0+h*8.0+uSeed*2.0)*0.3;
  float w = mix(0.8, 0.0, pow(h, 0.75)) * (1.0 + 0.18*fl);
  float d = abs(x + 0.16*fl*h) / max(w, 0.001);
  float a = smoothstep(1.0, 0.3, d) * smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.78, 1.0, h));
  vec3 col = mix(vec3(1.0,0.95,0.55), vec3(1.0,0.5,0.12), smoothstep(0.0,0.45,h)); col = mix(col, vec3(0.85,0.2,0.06), smoothstep(0.4,1.0,h));
  gl_FragColor = vec4(col, a*uLit); }`;
const GROUND_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const GROUND_FS = `
uniform float uT, uLit, uSeed; varying vec2 vUv;
void main(){ float r = length(vUv*2.0-1.0); float a = pow(max(1.0-r,0.0),2.0) * 0.55 * uLit * (0.88+0.12*sin(uT*11.0+uSeed));
  gl_FragColor = vec4(1.0,0.55,0.18, a); }`;
const EMBER_VS = `
attribute vec4 aS; uniform float uT, uPx, uLit; varying float vA;
void main(){ float age = fract(uT*aS.y*0.32 + aS.x); float ang = aS.z;
  vec3 p = vec3(cos(ang)*(0.12+age*0.55) + sin(uT*2.0+aS.x*20.0)*0.10*age, 0.2 + age*2.6, sin(ang)*(0.12+age*0.55));
  vec4 mv = modelViewMatrix * vec4(p,1.0); vA = (1.0-age) * smoothstep(0.0,0.06,age) * uLit;
  gl_PointSize = max(1.6, uPx * aS.w * (1.0-age*0.5) / max(-mv.z, 0.1)); gl_Position = projectionMatrix * mv; }`;
const EMBER_FS = `varying float vA; void main(){ float r = length(gl_PointCoord-0.5)*2.0; float a = (1.0-smoothstep(0.3,1.0,r))*vA;
  gl_FragColor = vec4(mix(vec3(1.0,0.8,0.3), vec3(1.0,0.4,0.1), 1.0-vA), a); }`;
const SMOKE_VS = `
attribute vec4 aS; uniform float uT, uPx, uLit; uniform vec3 uWind; varying float vA;
void main(){ float age = fract(uT*aS.y*0.12 + aS.x); float ang = aS.z;
  vec3 p = vec3(cos(ang)*0.2 + uWind.x*age*age*5.0*(0.3+uWind.z*2.0), 0.9 + age*3.4, sin(ang)*0.2 + uWind.y*age*age*5.0*(0.3+uWind.z*2.0));
  vec4 mv = modelViewMatrix * vec4(p,1.0); vA = smoothstep(0.0,0.2,age) * (1.0-age) * uLit;
  gl_PointSize = uPx * aS.w * (0.5+age*1.6) / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`;
const SMOKE_FS = `uniform float uNight; varying float vA; void main(){ float r = length(gl_PointCoord-0.5)*2.0; float a = (1.0-smoothstep(0.0,1.0,r))*vA*0.16;
  gl_FragColor = vec4(mix(vec3(0.42,0.37,0.33), vec3(0.08,0.08,0.1), uNight), a); }`;

const SIZES = { tent: [6.5, 2.6, 4.2], well: [3, 3, 3], campfire: [1.9, 0.5, 1.9], acacia: [5.2, 5.2, 5.2], waterskins: [1.7, 1.7, 1.7], camelsit: [1.2, 1.6, 2.6] };
const COLLIDER = { acacia: 0.12, tent: 0.36, well: 0.4, campfire: 0.37, waterskins: 0.3, camelsit: 0.4 };   // × max horizontal size × scale
const CAM_BLOCK = new Set(['tent', 'well', 'camelsit']);   // large solid props the camera must not end inside (oriented box + fading cloth)
const _box = new THREE.Box3();

export function createProps(G) {
  const root = new THREE.Group(); root.name = 'props'; G.scene.add(root);
  const lvl = new THREE.Group(); lvl.name = 'props-level'; root.add(lvl);
  const colliders = [], fires = [], camBlockers = [];
  const owned = [];                       // level-lifetime handles with .dispose()
  const lodHandles = [];
  const T = { value: 0 }, PX = { value: 800 }, WIND = { value: new THREE.Vector3(1, 0, 0.25) };
  const NIGHT = () => G.world.sky.uniforms.uNight;
  const warned = new Set();
  let tier = G.quality.tier;
  const pick = (a, b, c) => (tier === 'low' ? a : tier === 'medium' ? b : c);
  const hAt = (x, z) => G.world.terrain.heightAt(x, z);

  const matLit = G.shade.patch(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const matStand = G.shade.patch(new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  const standGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  // ---------- camera blockers (F05) ----------
  /**
   * A large prop gets (1) an oriented box in `camBlockers` {x,z,c,s,hx,hz,y0,y1,want,fade} — c/s = cos/sin of its yaw, hx/hz = half sizes along its
   * local x/z — which the camera arm tests, and (2) its own transparent material copies so the box can fade (`want` 0|1, set by the camera) when
   * the cloth is still between lens and hero. Its collision circles follow the box (a chain along a long tent) and are flagged `nc`
   * (the camera's circle samples skip them). The hero can no longer stand inside the ends of a tent.
   */
  function addBlocker(o, x, z, yaw, r) {
    const ry = o.rotation.y; o.rotation.y = 0; o.updateMatrixWorld(true); _box.setFromObject(o); o.rotation.y = ry; o.updateMatrixWorld(true);
    const c = Math.cos(yaw), s = Math.sin(yaw), cu = (_box.min.x + _box.max.x) / 2 - o.position.x, cv = (_box.min.z + _box.max.z) / 2 - o.position.z;
    const b = {
      x: x + cu * c + cv * s, z: z - cu * s + cv * c, c, s, hx: (_box.max.x - _box.min.x) / 2, hz: (_box.max.z - _box.min.z) / 2,
      y0: _box.min.y, y1: _box.max.y, want: 0, fade: 0, op: 1, mats: [],
    };
    const mk = m => { const k = m.clone(); k.userData.hsShade = false; G.shade.patch(k); k.transparent = true; b.mats.push(k); return k; };
    o.traverse(n => { if (n.isMesh) n.material = Array.isArray(n.material) ? n.material.map(mk) : mk(n.material); });
    camBlockers.push(b);
    const long = b.hx > b.hz ? 'x' : 'z', hl = Math.max(b.hx, b.hz), hw = Math.min(b.hx, b.hz);
    if (hl < hw * 1.6) { colliders.push({ x, z, r, nc: true }); return; }
    const rc = hw + 0.4, ext = Math.max(0, hl - 0.9), n = Math.max(2, Math.ceil(2 * ext / 1.4) + 1);   // hero reach rc + 0.35 stays ≥ 0.6 m off the cloth
    const ax = long === 'x' ? c : s, az = long === 'x' ? -s : c;
    for (let i = 0; i < n; i++) { const t = (n === 1 ? 0 : -ext + 2 * ext * i / (n - 1)); colliders.push({ x: b.x + ax * t, z: b.z + az * t, r: rc, nc: true }); }
  }

  // ---------- GLB props ----------
  function spawn(modelId, { x = 0, z = 0, yaw = 0, scale = 1, y, solid = true } = {}) {
    let o = G.assets.instance(modelId), r = 1, size = SIZES[modelId] || [1, 1, 1];
    const meta = G.assets.meta(modelId);
    if (meta && meta.size) size = meta.size;
    if (!o) {
      if (!warned.has(modelId)) { warned.add(modelId); console.warn(`[props] model "${modelId}" unavailable — stand-in`); }
      const m = new THREE.Mesh(standGeo, matStand); m.scale.set(size[0], size[1], size[2]);
      o = new THREE.Group(); o.add(m);
    }
    const mx = Math.max(size[0], size[2]);
    r = (COLLIDER[modelId] || 0.4) * mx * scale;
    let h = hAt(x, z);
    if (mx > 3) {
      const k = mx * 0.3 * scale;
      h = Math.min(h, hAt(x + k, z) + 0.2, hAt(x - k, z) + 0.2, hAt(x, z + k) + 0.2, hAt(x, z - k) + 0.2);
    }
    o.position.set(x, y !== undefined ? y : h - 0.03, z); o.rotation.y = yaw; o.scale.setScalar(scale);
    lvl.add(o);
    if (solid && CAM_BLOCK.has(modelId)) addBlocker(o, x, z, yaw, r);
    else if (solid) colliders.push({ x, z, r });
    const lod = G.assets.lodGeometry(modelId);
    if (lod) {
      const meshes = [];
      o.traverse(n => { if (n.isMesh && n.geometry.attributes.position === lod.attributes.position) meshes.push([n, n.geometry]); });
      if (meshes.length) lodHandles.push(G.lod.add({ at: o, near: 22, set(l) { for (const [n, g] of meshes) n.geometry = l ? lod : g; } }));
    }
    return o;
  }

  // ---------- hand items ----------
  const itemGeo = {
    torch: merged([
      part(cyl(0.017, 0.02, 0.62, 6), 0x6a4a2c, 0, 0.16, 0, 1, 1, 1, 0, 0, 0, [0.85, 1]),
      part(cyl(0.05, 0.034, 0.14, 7), 0x2e2019, 0, 0.5, 0, 1, 1, 1, 0, 0, 0, [0.8, 1.1]),
      part(cyl(0.036, 0.036, 0.02, 7), 0x8a6a3a, 0, 0.44, 0, 1.15, 1, 1.15),
    ]),
    rifle: merged([
      part(box(0.03, 0.34, 0.075), 0x4a2f1b, 0, -0.24, 0, 1, 1, 1, 0, 0, 0, [0.8, 1.1]),
      part(box(0.03, 0.22, 0.045), 0x5a3a22, 0, 0.0, 0, 1, 1, 1),
      part(box(0.032, 0.42, 0.038), 0x5a3a22, 0, 0.3, -0.004, 1, 1, 1),
      part(cyl(0.011, 0.011, 0.72, 6), 0x2a2d30, 0, 0.5, 0.012, 1, 1, 1),
      part(cyl(0.013, 0.013, 0.05, 6), 0x1d1f22, 0, 0.87, 0.012),
      part(box(0.022, 0.1, 0.022), 0x2a2d30, 0, 0.12, 0.034),
      part(box(0.01, 0.014, 0.05), 0x7a5a2a, 0, 0.5, -0.046),
    ]),
    staff: merged([
      part(cyl(0.021, 0.026, 1.5, 6), 0x6a4a2c, 0, 0.15, 0, 1, 1, 1, 0, 0, 0, [0.85, 1.1]),
      part(cyl(0.02, 0.022, 0.18, 6), 0x6a4a2c, 0.035, 0.94, 0, 1, 1, 1, 0, 0, -0.35),
      part(cyl(0.018, 0.02, 0.12, 6), 0x7a5a36, 0.09, 1.02, 0, 1, 1, 1, 0, 0, -0.9),
      part(cyl(0.03, 0.03, 0.03, 6), 0x2e2019, 0, 0.0, 0, 1, 1, 1),
    ]),
    waterskin: merged([
      part(ico(1), 0x3a2418, 0, -0.24, 0, 0.26, 0.4, 0.17, 0, 0, 0, [0.7, 1.15]),
      part(cyl(0.02, 0.03, 0.07, 6), 0x2c1a10, 0, -0.02, 0, 1, 1, 1),
      part(box(0.012, 0.3, 0.01), 0x6b4a2a, 0.07, -0.14, 0.0, 1, 1, 1, 0, 0, -0.2),
      part(new THREE.TorusGeometry(0.06, 0.007, 4, 8), 0x6b4a2a, 0.0, 0.04, 0, 1, 1, 1, 0, 0, 0),
    ]),
    bucket: merged([
      part(cyl(0.115, 0.085, 0.22, 8), 0x4a2f1b, 0, -0.2, 0, 1, 1, 1, 0, 0, 0, [0.75, 1.1]),
      part(cyl(0.12, 0.12, 0.02, 8), 0x2e1d12, 0, -0.09, 0, 1, 1, 1),
      part(new THREE.TorusGeometry(0.1, 0.006, 4, 8, Math.PI), 0x8a6a3a, 0, -0.09, 0, 1, 1, 1, 0, 0, 0),
      part(new THREE.TorusGeometry(0.035, 0.007, 4, 8), 0x8a6a3a, 0, 0.02, 0, 1, 1, 1, 0, 0, 0),
    ]),
  };
  function make(id) {
    const g = itemGeo[id];
    if (!g) { console.warn(`[props] unknown item "${id}"`); return new THREE.Group(); }
    const m = new THREE.Mesh(g, matLit); m.name = 'item:' + id; return m;
  }

  // ---------- scatter (one InstancedMesh per kind) ----------
  const SK = {
    shrub: { cap: 1200, f: [0.45, 0.75, 1], sway: 0.22, geo: () => merged([
      part(ico(0), 0x8a9660, 0, 0.32, 0, 0.9, 0.62, 0.9, 0, 0.4, 0, [0.75, 1.2]),
      part(ico(0), 0x98a46a, 0.28, 0.24, 0.1, 0.7, 0.5, 0.7, 0.2, 1.1, 0, [0.75, 1.2]),
      part(ico(0), 0x7c8856, -0.22, 0.26, -0.18, 0.75, 0.55, 0.75, 0, 2.0, 0.2, [0.75, 1.2]),
      part(new THREE.ConeGeometry(0.05, 0.4, 3, 1), 0x6a5a40, 0.08, 0.12, 0.28, 1, 1, 1, 0.5, 0, 0.2, [0.9, 1]),
      part(new THREE.ConeGeometry(0.05, 0.36, 3, 1), 0x6a5a40, -0.2, 0.12, 0.2, 1, 1, 1, 0.4, 1, -0.4, [0.9, 1]),
    ]) },
    grass: { cap: 3000, f: [0.4, 0.7, 1], sway: 0.7, side: THREE.DoubleSide, geo: () => {
      const ps = [];
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, l = 0.12 + (i % 3) * 0.1, h = 0.75 + (i % 4) * 0.12;
        const bx = Math.cos(a) * 0.08, bz = Math.sin(a) * 0.08, tx = bx + Math.cos(a) * l, tz = bz + Math.sin(a) * l, w = 0.045;
        ps.push(part(tri(bx - w * Math.sin(a), 0, bz + w * Math.cos(a), bx + w * Math.sin(a), 0, bz - w * Math.cos(a), tx, h, tz), i % 2 ? 0xc8b073 : 0xb59f62, 0, 0, 0, 1, 1, 1, 0, 0, 0, [0.7, 1.25]));
      }
      return merged(ps, true);
    } },
    rock: { cap: 700, f: [0.5, 0.8, 1], sway: 0, geo: () => merged([part(ico(0), 0x8a6848, 0, 0.3, 0, 1, 0.7, 1, 0, 0, 0, [0.7, 1.2], 0.28)]) },
    pebble: { cap: 2000, f: [0.4, 0.7, 1], sway: 0, geo: () => merged([part(new THREE.OctahedronGeometry(0.5, 0), 0x9a8468, 0, 0.2, 0, 1, 0.6, 1, 0, 0, 0, [0.75, 1.15], 0.2)]) },
    greenpatch: { cap: 300, f: [0.6, 0.85, 1], sway: 0.3, side: THREE.DoubleSide, geo: () => {
      const ps = [];                                       // a tuft of fresh annuals: blades only, the sand shows between them
      for (let i = 0; i < 30; i++) {
        const a = i * 2.4, rr = 0.08 + ((i * 37) % 100) / 100 * 0.36, bx = Math.cos(a) * rr, bz = Math.sin(a) * rr, w = 0.04, h = 0.22 + (i % 4) * 0.06;
        const lx = Math.cos(a + 1) * 0.05, lz = Math.sin(a + 1) * 0.05;
        ps.push(part(tri(bx - w, 0.05, bz, bx + w, 0.05, bz, bx + lx, 0.05 + h, bz + lz), i % 3 ? 0x5f8f3a : (i % 2 ? 0x7aa648 : 0x94b85c), 0, 0, 0, 1, 1, 1, 0, a, 0, [0.8, 1.15]));
      }
      const fc = [0xffffff, 0xffe45a, 0xff9ac0, 0xffffff, 0xc9a0ff];
      for (let i = 0; i < 6; i++) {
        const a = i * 1.7 + 0.4, rr = 0.1 + (i % 3) * 0.12;
        ps.push(part(new THREE.OctahedronGeometry(0.035, 0), fc[i % 5], Math.cos(a) * rr, 0.3 + (i % 3) * 0.04, Math.sin(a) * rr, 1, 1, 1, 0, 0, 0, [1, 1]));
      }
      return merged(ps);
    } },
  };
  const scatterMeshes = {}, scatterReq = [];
  for (const kind of Object.keys(SK)) {
    const k = SK[kind];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: k.side || THREE.FrontSide });
    const sway = k.sway;
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = T; sh.uniforms.uWind = WIND; sh.uniforms.uSway = { value: sway };
      sh.vertexShader = 'uniform float uT, uSway; uniform vec3 uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        if (uSway > 0.0) {
          vec3 c0 = normalize(instanceMatrix[0].xyz), c2 = normalize(instanceMatrix[2].xyz);
          float ph = uT*1.7 + instanceMatrix[3].x*0.37 + instanceMatrix[3].z*0.23;
          float amp = position.y * position.y * uSway * (0.12 + uWind.z*1.4) * (0.55 + 0.45*sin(ph) + 0.15*sin(ph*2.7));
          transformed.x += dot(uWind.xy, vec2(c0.x, c0.z)) * amp; transformed.z += dot(uWind.xy, vec2(c2.x, c2.z)) * amp;
        }`);
    };
    mat.customProgramCacheKey = () => 'props-scatter';
    G.shade.patch(mat);
    const mesh = new THREE.InstancedMesh(k.geo(), mat, k.cap);
    mesh.count = 0; mesh.frustumCulled = false; mesh.name = 'scatter-' + kind;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(k.cap * 3).fill(1), 3);
    root.add(mesh); scatterMeshes[kind] = mesh;
  }
  const NZ = new THREE.Vector3();
  function placeScatter(kind, { count = 20, x = 0, z = 0, r = 50, seed = 1, avoid } = {}) {
    const mesh = scatterMeshes[kind], k = SK[kind]; if (!mesh) { console.warn(`[props] unknown scatter kind "${kind}"`); return; }
    const want = Math.round(count * pick(k.f[0], k.f[1], k.f[2]));
    const R = rng32(seed * 7919 + kind.length * 131 + kind.charCodeAt(0));
    let n = mesh.count, placed = 0;
    for (let att = 0; att < want * 4 && placed < want && n < k.cap; att++) {
      const a = R() * 6.2832, d = Math.sqrt(R()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const yw = R() * 6.2832, u1 = R(), u2 = R(), u3 = R();
      let bad = false;
      if (avoid) for (let i = 0; i < avoid.length; i++) { const av = avoid[i]; const dx = px - av.x, dz = pz - av.z; if (dx * dx + dz * dz < av.r * av.r) { bad = true; break; } }
      if (bad) continue;
      let sx, sy, sz, lift = -0.02, tx = 0, tz = 0;
      switch (kind) {
        case 'shrub': sy = 0.5 + u1 * 0.9; sx = sz = sy * (0.9 + u2 * 0.5); break;
        case 'grass': sy = 0.2 + u1 * 0.2; sx = sz = sy * (1.4 + u2); break;
        case 'rock': { const s = 0.3 + u1 * u1 * 0.9; sx = s * (0.9 + u2 * 0.6); sz = s * (0.9 + u3 * 0.5); sy = s * (0.55 + u2 * 0.4); lift = -sy * 0.18; tx = (u2 - 0.5) * 0.4; tz = (u3 - 0.5) * 0.4; break; }
        case 'pebble': sx = sz = 0.04 + u1 * 0.07; sy = sx * 0.8; lift = -0.005; break;
        default: sx = sz = 0.9 + u1 * 1.1; sy = 0.8 + u2 * 0.6; lift = -0.05;
      }
      G.world.terrain.normalAt(px, pz, NZ);
      _q.setFromEuler(_e.set(tx + (kind === 'rock' ? 0 : -NZ.z * 0.5), yw, tz + (kind === 'rock' ? 0 : NZ.x * 0.5)));
      _m.compose(_p.set(px, hAt(px, pz) + lift, pz), _q, _s.set(sx, sy, sz));
      mesh.setMatrixAt(n, _m);
      const v = 0.82 + u3 * 0.3; _c.setRGB(v, v * (0.96 + u2 * 0.08), v * (0.92 + u1 * 0.1));
      if (kind === 'greenpatch') _c.setRGB(1, 1, 1);
      mesh.setColorAt(n, _c);
      n++; placed++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  }
  function scatter(kind, opts = {}) {
    scatterReq.push({ kind, opts: { ...opts, avoid: opts.avoid ? opts.avoid.slice() : undefined } });
    placeScatter(kind, opts);
  }
  function replayScatter() {
    for (const k in scatterMeshes) scatterMeshes[k].count = 0;
    for (const q of scatterReq) placeScatter(q.kind, q.opts);
  }

  // ---------- landmarks ----------
  function addStatic(geo, x, z, yaw = 0, yOff = -0.03, scale = 1) {
    const m = new THREE.Mesh(geo, matLit); m.userData.ownGeo = true;
    m.position.set(x, hAt(x, z) + yOff, z); m.rotation.y = yaw; m.scale.setScalar(scale); lvl.add(m); return m;
  }
  function cairn(x, z, { h = 1.4 } = {}) {
    const R = rng32(Math.floor(x * 13 + z * 7) + 5), ps = [], layers = [5, 4, 2, 1];
    let y = 0; const base = h * 0.3;
    layers.forEach((cnt, li) => {
      const sz = base * (1 - li * 0.2) * (0.9 + R() * 0.3), ring = cnt > 1 ? sz * (0.5 - li * 0.06) : 0;
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * 6.2832 + R() * 0.6 + li, top = li === layers.length - 1;
        ps.push(part(ico(0), top ? 0xc9b48c : (R() > 0.5 ? 0x4a3d33 : 0x5a4a3c), Math.cos(a) * ring, y + sz * 0.3, Math.sin(a) * ring,
          sz * (0.85 + R() * 0.3), sz * (0.6 + R() * 0.2), sz * (0.85 + R() * 0.3), R() * 0.4, R() * 6, R() * 0.4, top ? [0.9, 1.5] : [0.65, 1.2], 0.22));
      }
      y += sz * 0.52;
    });
    const k = h / Math.max(0.5, y + base * 0.2);
    const m = addStatic(merged(ps), x, z, R() * 6, -0.05, k);
    colliders.push({ x, z, r: Math.max(0.4, h * 0.3) });
    return m;
  }
  function bones(x, z) {
    const R = rng32(Math.floor(x * 11 + z * 3) + 9), ps = [], bone = 0xe6dec8;
    ps.push(part(box(0.05, 0.05, 1.3), 0xd8cfb6, 0, 0.32, 0, 1, 1, 1, 0, 0, 0, [0.9, 1]));
    for (let i = 0; i < 7; i++) {
      const zz = -0.5 + i * 0.16, s = 0.7 + 0.5 * Math.sin((i / 6) * Math.PI);
      ps.push(part(new THREE.TorusGeometry(0.3, 0.022, 4, 8, Math.PI), bone, 0, 0.32, zz, s, s * 0.95, 1, 0, 0, 0, [0.9, 1.1]));
      ps.push(part(new THREE.TorusGeometry(0.3, 0.022, 4, 8, Math.PI), bone, 0, 0.32, zz, s * 0.96, s * 0.55, 1, 0, 0, 0, [0.9, 1.1]));
    }
    ps.push(part(box(0.2, 0.16, 0.36), bone, 0.05, 0.1, 0.95, 1, 1, 1, 0, 0.4, 0, [0.85, 1.1]));
    ps.push(part(box(0.12, 0.1, 0.22), 0xd2c8ae, 0.0, 0.07, 1.2, 1, 1, 1, 0, 0.4, 0, [0.9, 1]));
    ps.push(part(cyl(0.025, 0.03, 0.55, 4), bone, -0.3, 0.05, -0.2, 1, 1, 1, Math.PI / 2, 0.5, 0, [0.9, 1]));
    return addStatic(merged(ps), x, z, R() * 6.28, -0.04);
  }
  function rockOutcrop(x, z, { r = 10, h = 5, seed = 1 } = {}) {
    const R = rng32(seed * 101 + 17), ps = [], cols = [0xb48a5a, 0x9c7449, 0xc09a68, 0x8c6840], n = 5 + Math.floor(R() * 3);
    let y = 0; const dir = R() * 6.28;
    for (let i = 0; i < n; i++) {
      const hh = (h / n) * (0.8 + R() * 0.5), rad = r * (1 - i * 0.1) * (0.9 + R() * 0.2);
      ps.push(part(new THREE.CylinderGeometry(rad * 0.88, rad, hh, 8, 1), cols[(i + (R() > 0.7 ? 1 : 0)) % 4],
        Math.cos(dir) * i * r * 0.09, y + hh * 0.5, Math.sin(dir) * i * r * 0.09, 1, 1, 0.72, 0, R() * 6, 0, [0.82, 1.1], r * 0.09));
      y += hh * 0.92;
    }
    const m = addStatic(merged(ps), x, z, 0, -0.3);
    colliders.push({ x, z, r: r * 0.55 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + dir; colliders.push({ x: x + Math.cos(a) * r * 0.66, z: z + Math.sin(a) * r * 0.5, r: r * 0.36 }); }
    return m;
  }
  const darkMats = new Map();
  const darker = m => { let d = darkMats.get(m); if (!d) { d = m.clone(); d.color.multiplyScalar(0.55); G.shade.patch(d); darkMats.set(m, d); } return d; };
  function deadCamel(x, z, yaw = 0) {
    const inner = spawn('camelsit', { x, z, yaw, solid: false });
    colliders.push({ x, z, r: 1.3 });
    lvl.remove(inner);
    const g = new THREE.Group(); g.position.copy(inner.position); g.rotation.y = yaw; inner.position.set(0, 0, 0); inner.rotation.set(0, 0, Math.PI / 2 + 0.12);
    inner.scale.setScalar(1); g.add(inner);
    inner.traverse(n => { if (n.isMesh) n.material = Array.isArray(n.material) ? n.material.map(darker) : darker(n.material); });
    g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g); g.position.y -= b.min.y - hAt(x, z) + 0.12;
    lvl.add(g); return g;
  }
  function signalPile(x, z) {
    const ps = [], R = rng32(Math.floor(x + z * 3) + 3);
    for (let L = 0; L < 4; L++) for (let i = 0; i < 3; i++) {
      const a = L * 1.57 + i * 0.2 + R() * 0.15, off = (i - 1) * 0.28;
      ps.push(part(cyl(0.07, 0.08, 1.5 - L * 0.12, 5), L % 2 ? 0x5a4330 : 0x6a5038, Math.cos(a + 1.57) * off, 0.1 + L * 0.15, Math.sin(a + 1.57) * off, 1, 1, 1, Math.PI / 2, -a, 0, [0.8, 1.1]));
    }
    for (let i = 0; i < 6; i++) { const a = i * 1.05; ps.push(part(cyl(0.05, 0.07, 1.1, 5), 0x4a3828, Math.cos(a) * 0.22, 0.6, Math.sin(a) * 0.22, 1, 1, 1, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35)); }
    addStatic(merged(ps), x, z, R() * 6, -0.02);
    colliders.push({ x, z, r: 0.9 });
    return fire(x, z, { size: 1.6, lit: false });
  }

  // ---------- fire ----------
  const quad = new THREE.PlaneGeometry(1, 1);
  const flameGeo = (() => {
    const gs = [];
    for (let i = 0; i < 3; i++) { const g = new THREE.PlaneGeometry(1.0, 1.1).translate(0, 0.55, 0); g.rotateY(i * Math.PI / 3); gs.push(g); }
    const g = mergeGeometries(gs); gs.forEach(x => x.dispose()); return g;
  })();
  const groundGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ptGeo = {};
  function pts(n, big) {
    const key = (big ? 's' : 'e') + n; if (ptGeo[key]) return ptGeo[key];
    const R = rng32(n * 31 + (big ? 7 : 1)), a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { a[i * 4] = i / n + R() * 0.02; a[i * 4 + 1] = 0.7 + R() * 0.8; a[i * 4 + 2] = R() * 6.28; a[i * 4 + 3] = big ? 0.5 + R() * 0.4 : 0.03 + R() * 0.035; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aS', new THREE.BufferAttribute(a, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 5); ptGeo[key] = g; return g;
  }
  const sm = (o) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o });
  const baseMat = {
    flame: sm({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, side: THREE.DoubleSide, uniforms: { uT: T, uSeed: { value: 0 }, uLit: { value: 0 } } }),
    ground: sm({ vertexShader: GROUND_VS, fragmentShader: GROUND_FS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, uniforms: { uT: T, uSeed: { value: 0 }, uLit: { value: 0 } } }),
    ember: sm({ vertexShader: EMBER_VS, fragmentShader: EMBER_FS, uniforms: { uT: T, uPx: PX, uLit: { value: 0 } } }),
    smoke: sm({ vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, blending: THREE.NormalBlending, uniforms: { uT: T, uPx: PX, uLit: { value: 0 }, uWind: WIND, uNight: { value: 0 } } }),
    beacon: sm({ vertexShader: BILL_VS, fragmentShader: BEACON_FS, depthTest: true, uniforms: { uSize: { value: 3 }, uGrow: { value: 0.035 }, uColor: { value: new THREE.Color(1, 0.55, 0.2) }, uA: { value: 0 }, uRange: { value: 0 }, uT: T } }),
  };
  const emitters = [];
  const emberN = () => pick(12, 24, 40), smokeN = () => pick(4, 6, 8);

  function makeEmitter(size, torch, embers) {
    const em = { size, torch, lit: false, fade: 0, x: 0, y: 0, z: 0, seed: (emitters.length * 2.3) % 6.28, range: 0, group: new THREE.Group(), parent: null, light: 0 };
    const mats = em.mats = {};
    for (const k in baseMat) { mats[k] = baseMat[k].clone(); }
    mats.flame.uniforms.uSeed.value = mats.ground.uniforms.uSeed.value = em.seed;
    for (const k of ['ember', 'smoke', 'beacon', 'flame', 'ground']) { mats[k].uniforms.uT = T; }
    mats.ember.uniforms.uPx = mats.smoke.uniforms.uPx = PX; mats.smoke.uniforms.uWind = WIND; mats.smoke.uniforms.uNight = NIGHT();
    const g = em.group; g.visible = false;
    em.flame = new THREE.Mesh(flameGeo, mats.flame); em.flame.scale.setScalar(size); em.flame.renderOrder = 50; g.add(em.flame);
    em.embers = new THREE.Points(pts(torch ? 6 : embers, false), mats.ember); em.embers.scale.setScalar(size); em.embers.renderOrder = 50; em.embers.frustumCulled = false; g.add(em.embers);
    if (!torch) {
      em.smoke = new THREE.Points(pts(smokeN(), true), mats.smoke); em.smoke.scale.setScalar(size); em.smoke.renderOrder = 50; em.smoke.frustumCulled = false; g.add(em.smoke);
      em.ground = new THREE.Mesh(groundGeo, mats.ground); em.ground.scale.setScalar(6 * size); em.ground.position.y = 0.12; em.ground.renderOrder = 40; g.add(em.ground);
      em.beacon = new THREE.Mesh(quad, mats.beacon); em.beacon.position.y = 2 * size; em.beacon.renderOrder = 60; em.beacon.frustumCulled = false; em.beacon.visible = false; g.add(em.beacon);
    }
    emitters.push(em);
    return em;
  }
  function disposeEmitter(em) {
    const i = emitters.indexOf(em); if (i >= 0) emitters.splice(i, 1);
    if (em.group.parent) em.group.parent.remove(em.group);
    for (const k in em.mats) em.mats[k].dispose();
    for (const l of lights) if (l.em === em) { l.em = null; l.k = 0; }
  }
  function fire(x, z, { size = 1, lit = true, logs = false } = {}) {
    const em = makeEmitter(size, false, emberN());
    em.x = x; em.y = hAt(x, z); em.z = z;
    em.group.position.set(x, em.y, z); lvl.add(em.group);
    if (logs) {
      const ps = []; for (let i = 0; i < 3; i++) ps.push(part(cyl(0.06, 0.07, 0.8, 5), 0x2e2019, 0, 0.08, 0, size, size, size, Math.PI / 2 - 0.15, i * 1.05, 0, [0.7, 1]));
      for (let i = 0; i < 8; i++) { const a = i * 0.785; ps.push(part(ico(0), 0x7a6a58, Math.cos(a) * 0.5 * size, 0.07, Math.sin(a) * 0.5 * size, 0.22 * size, 0.16 * size, 0.22 * size)); }
      const m = new THREE.Mesh(merged(ps), matLit); m.userData.ownGeo = true; m.position.set(x, em.y - 0.02, z); lvl.add(m); em.logs = m;
    }
    const h = {
      lit: false, position: new THREE.Vector3(x, em.y, z), size,
      setLit(b) { h.lit = em.lit = !!b; },
      setBeacon(range = 0) { em.range = range; if (em.beacon) { em.mats.beacon.uniforms.uRange.value = range; } },
      dispose() { const i = fires.indexOf(h); if (i >= 0) fires.splice(i, 1); if (em.logs) { lvl.remove(em.logs); em.logs.geometry.dispose(); } disposeEmitter(em); },
    };
    h.setLit(lit); fires.push(h); owned.push(h);
    return h;
  }
  function flame(parent, { size = 0.35 } = {}) {
    const em = makeEmitter(size, true, 6);
    parent.add(em.group); em.parent = parent;
    const h = { lit: false, setLit(b) { h.lit = em.lit = !!b; }, remove() { disposeEmitter(em); } };
    h.setLit(true); return h;
  }

  // two pooled lights (never added/removed)
  const lights = [0, 1].map(() => {
    const L = new THREE.PointLight(0xff9a3c, 0, 14, 2); L.position.set(0, -100, 0); G.scene.add(L);
    return { L, em: null, k: 0, want: null };
  });
  const LI = 14;
  function updateLights(dt, now) {
    const c = G.camera.position; let a = null, b = null, da = 1e12, db = 1e12;
    for (let i = 0; i < emitters.length; i++) {
      const e = emitters[i]; if (!e.lit || e.fade < 0.05) continue;
      const dx = e.x - c.x, dy = e.y - c.y, dz = e.z - c.z, d = dx * dx + dy * dy + dz * dz - e.size * e.size * 40;
      if (d < da) { b = a; db = da; a = e; da = d; } else if (d < db) { b = e; db = d; }
    }
    const l0 = lights[0], l1 = lights[1];
    l0.want = l1.want = null;
    for (const l of lights) if (l.em && (l.em === a || l.em === b)) l.want = l.em;
    for (const l of lights) if (!l.want) { if (a && a !== l0.want && a !== l1.want) l.want = a; else if (b && b !== l0.want && b !== l1.want) l.want = b; }
    for (const l of lights) {
      if (l.em && l.em !== l.want) { l.k -= dt / 0.3; if (l.k <= 0) { l.k = 0; l.em = null; } }
      if (!l.em && l.want) { l.em = l.want; l.L.distance = 14 * l.em.size; }
      if (l.em && l.em === l.want) l.k = Math.min(1, l.k + dt / 0.3);
      const e = l.em;
      if (e && l.k > 0) {
        const fl = 0.9 + 0.1 * Math.sin(now * 13.7 + e.seed) + 0.05 * Math.sin(now * 31 + e.seed * 2.1);
        l.L.position.set(e.x, e.y + 0.6 * Math.max(0.5, e.size), e.z);
        l.L.intensity = LI * e.size * l.k * e.fade * fl;
      } else l.L.intensity = 0;
    }
  }

  // ---------- glow ----------
  const glows = [];
  function glow(at, { color = 0xffd070, size = 0.8, pulse = false } = {}) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: BILL_VS, fragmentShader: GLOW_FS,
      uniforms: { uSize: { value: size }, uGrow: { value: 0 }, uColor: { value: new THREE.Color(color) }, uA: { value: 1 }, uT: T, uPulse: { value: pulse ? 1 : 0 } },
    });
    const m = new THREE.Mesh(quad, mat); m.renderOrder = 60; m.frustumCulled = false;
    if (at && at.isObject3D) at.add(m); else { m.position.set(at.x, at.y !== undefined ? at.y : hAt(at.x, at.z) + 0.3, at.z); lvl.add(m); }
    const h = { set(a) { mat.uniforms.uA.value = a; m.visible = a > 0.002; }, remove() { if (m.parent) m.parent.remove(m); mat.dispose(); const i = glows.indexOf(h); if (i >= 0) glows.splice(i, 1); }, dispose() { h.remove(); } };
    glows.push(h);
    return h;
  }

  // ---------- flock ----------
  const birdGeo = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.14, 0, 0, -0.14, -0.72, 0, -0.16, 0, 0, 0.14, 0.72, 0, -0.16, 0, 0, -0.14], 3));
    g.setAttribute('aTip', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 0], 1));
    const c = []; for (let i = 0; i < 6; i++) { const t = i === 2 || i === 4; c.push(t ? 0.28 : 0.16, t ? 0.23 : 0.13, t ? 0.18 : 0.1); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.computeVertexNormals(); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    return g;
  })();
  function flock({ from, to, count = 16, height = 24, speed = 15 } = {}) {
    const geo = birdGeo.clone(); geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = T;
      sh.vertexShader = 'attribute float aTip, aPh; uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float fl = sin(uT*13.0 + aPh); transformed.y += fl * 0.34 * aTip; transformed.z += (fl * 0.5 - 0.3) * 0.12 * aTip;`);
    };
    mat.customProgramCacheKey = () => 'props-flock'; G.shade.patch(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5;
    const off = new Float32Array(count * 4), ph = geo.attributes.aPh;
    for (let i = 0; i < count; i++) {
      const row = Math.ceil(i / 2), side = i === 0 ? 0 : (i & 1 ? 1 : -1), v = G.vrng;
      off[i * 4] = side * row * 2.0 + (v.next() - 0.5) * 1.2; off[i * 4 + 1] = -row * 2.3 + (v.next() - 0.5) * 1.5; off[i * 4 + 2] = (v.next() - 0.5) * 2.5; off[i * 4 + 3] = v.next() * 6.28;
      ph.setX(i, v.next() * 6.28);
    }
    lvl.add(mesh);
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, yaw = yawOf(dx, dz);
    const position = new THREE.Vector3(from.x, hAt(from.x, from.z) + height, from.z), dir = { x: ux, z: uz };
    let dead = false;
    function place(t) {
      const cx = from.x + dx * t, cz = from.z + dz * t, cy = hAt(cx, cz) + height; position.set(cx, cy, cz);
      for (let i = 0; i < count; i++) {
        const lat = off[i * 4], along = off[i * 4 + 1], vy = off[i * 4 + 2], p = off[i * 4 + 3], bob = Math.sin(T.value * 1.3 + p) * 0.5;
        _q.setFromEuler(_e.set(0, yaw, Math.sin(T.value * 1.7 + p) * 0.12));
        _m.compose(_p.set(cx + ux * along - uz * lat, cy + vy + bob, cz + uz * along + ux * lat), _q, _s.set(1.5, 1.5, 1.5));
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    place(0);
    const h = {
      dir, position,
      pass() {
        const total = G.state.fastText ? 0.08 : (len + 60) / speed; let t = 0;
        mesh.visible = true; place(-30 / len);
        return G.scope.task(dt => {
          if (dead) return true;
          t += dt; const k = Math.min(1, t / total); place((-30 + (len + 60) * k) / len);
          if (k >= 1) { mesh.visible = false; return true; }
        });
      },
      remove() { dead = true; lvl.remove(mesh); mesh.dispose(); geo.dispose(); mat.dispose(); const i = owned.indexOf(h); if (i >= 0) owned.splice(i, 1); },
      dispose() { h.remove(); },
    };
    owned.push(h);
    return h;
  }

  // ---------- lifecycle ----------
  function clear() {
    for (let i = owned.length - 1; i >= 0; i--) { try { owned[i].dispose(); } catch (e) { console.error(e); } }
    owned.length = 0; fires.length = 0;
    for (const g of glows.slice()) g.remove();
    for (const l of lodHandles) l.remove(); lodHandles.length = 0;
    for (let i = lvl.children.length - 1; i >= 0; i--) {
      const o = lvl.children[i]; lvl.remove(o);
      o.traverse(n => { if (n.isMesh && n.userData.ownGeo) n.geometry.dispose(); });
    }
    colliders.length = 0; scatterReq.length = 0;
    for (const b of camBlockers) for (const m of b.mats) m.dispose();      // the fading material copies (textures stay with the asset store)
    camBlockers.length = 0;
    for (const k in scatterMeshes) scatterMeshes[k].count = 0;
    // free pooled lights from level emitters (torch flames stay)
    for (const l of lights) if (l.em && !l.em.torch) { l.em = null; l.k = 0; l.L.intensity = 0; }
  }

  function update(dt) {
    const now = G.time.now; T.value = now;
    const w = G.world.weather && G.world.weather.wind; if (w) WIND.value.set(w.x, w.z, w.strength);
    G.renderer.getDrawingBufferSize(_bs); PX.value = _bs.y * 0.96;
    for (let i = 0; i < camBlockers.length; i++) {          // cloth between lens and hero eases to 15 % (fast in, slower out)
      const b = camBlockers[i]; if (b.fade === b.want) continue;
      b.fade = b.want > b.fade ? Math.min(b.want, b.fade + dt / 0.1) : Math.max(b.want, b.fade - dt / 0.4);
      const op = 1 - 0.85 * smoothstep(0, 1, b.fade);
      if (Math.abs(op - b.op) > 0.002 || b.fade === 0) { b.op = op; for (const m of b.mats) { m.opacity = op; m.depthWrite = op > 0.98; } }
    }
    const c = G.camera.position;
    for (let i = 0; i < emitters.length; i++) {
      const e = emitters[i];
      if (e.lit) e.fade = Math.min(1, e.fade + dt / 0.5); else e.fade = Math.max(0, e.fade - dt / 0.8);
      if (e.torch) { e.group.getWorldPosition(_wp); e.x = _wp.x; e.y = _wp.y; e.z = _wp.z; }
      const vis = e.fade > 0.003 && (e.torch || e.range > 0 || (e.x - c.x) * (e.x - c.x) + (e.z - c.z) * (e.z - c.z) < 160000);
      e.group.visible = vis; if (!vis) continue;
      const lit = e.fade, M = e.mats;
      M.flame.uniforms.uLit.value = lit * (0.92 + 0.08 * Math.sin(now * 17 + e.seed));
      M.ember.uniforms.uLit.value = lit;
      if (e.smoke) { M.smoke.uniforms.uLit.value = lit; M.ground.uniforms.uLit.value = lit; }
      if (e.beacon) { const on = e.range > 0 && lit > 0.003; e.beacon.visible = on; M.beacon.uniforms.uA.value = lit; M.beacon.uniforms.uSize.value = 3 * e.size; }
    }
    updateLights(dt, now);
  }
  function setQuality(t) {
    tier = t;
    for (const e of emitters) { e.embers.geometry = pts(e.torch ? 6 : emberN(), false); if (e.smoke) e.smoke.geometry = pts(smokeN(), true); }
    replayScatter();
  }
  G.events.on('quality:changed', e => { if (e && e.tier && e.tier !== tier) setQuality(e.tier); });

  return {
    root, colliders, camBlockers, fires, spawn, make, scatter, cairn, bones, rockOutcrop, deadCamel, signalPile, fire, flame, glow, flock,
    clear, onLevelUnload() { clear(); }, update, setQuality,
  };
}
