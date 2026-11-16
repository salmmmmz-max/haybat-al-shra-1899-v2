/**
 * Wolves (chapter 3, night, by the fire).
 *   spawnPack({cx,cz,radius,arc:{centerYaw,width}}) · wave({target,lunges,gap,double,tele,calm}) → {repelled,missed} · next · threat
 *   (tele = telegraph seconds, default 1.2; calm = extra seconds of quiet before each lunge — the retry help in ch3)
 * Repel rule (F06/F22): a swing repels a lunging wolf when it was made between that wolf's telegraph (eyes blaze) and its
 * bite, toward it (±60°), and within REACH m of its leap path. Every swing repels at most one wolf, the earliest first.
 *   alphaEnter() · alphaFeint() · alphaLunge() · flee() · alpha · clear()
 * The pack = 5-6 "proxy" wolves at the firelight rim: ONE instanced eye mesh + ONE instanced dark silhouette mesh.
 * Exactly one full skinned wolf (the "skin") is lent to whichever wolf is stepping into the light / lunging.
 */
import * as THREE from 'three';
import { createQuadruped } from './quadruped.js';
import { yawOf, wrapPi, damp, lerp, pointOf, TAU, DEG } from '../core/math.js';

const MAXW = 6, ALPHA = MAXW, EYES = (MAXW + 1) * 2;
const EYE_VS = `
attribute float aGlow; varying float vGlow; varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  vGlow = aGlow; vUv = position.xy * 2.0;
  float s = length(instanceMatrix[0].xyz);
  vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  s *= 1.0 + 0.045 * max(0.0, -mvPosition.z);
  mvPosition.xy += position.xy * 2.0 * s;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const EYE_FS = `
varying float vGlow; varying vec2 vUv;
#include <fog_pars_fragment>
void main(){
  float d = length(vUv); float core = smoothstep(0.55, 0.0, d); float halo = smoothstep(1.0, 0.0, d) * 0.35;
  float a = (core + halo) * vGlow;
  gl_FragColor = vec4(mix(vec3(1.0, 0.72, 0.18), vec3(1.0, 0.95, 0.7), core * core), a);
  if (a < 0.003) discard;
  #include <fog_fragment>
}`;

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _h = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export const REACH = 8;          // F22: m from the swing to the wolf's leap path — anywhere around the fire (measured 3.9–5.3 m from the brand spot); 10 m+ is out of the light
const NSW = 4;                   // recent swings remembered (two lunges 0.6 s apart need two separate swings)
/** Pure: distance from (px,pz) to the segment (ax,az)→(bx,bz) */
export function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

function boxWolfGeometry() {   // fallback silhouette: merged boxes, feet on y = 0, facing +Z
  const parts = [[0.34, 0.4, 0.95, 0, 0.62, 0], [0.2, 0.22, 0.3, 0, 0.78, 0.6], [0.1, 0.1, 0.34, 0, 0.55, -0.62], [0.08, 0.46, 0.08, -0.12, 0.23, 0.32], [0.08, 0.46, 0.08, 0.12, 0.23, 0.32], [0.08, 0.46, 0.08, -0.12, 0.23, -0.32], [0.08, 0.46, 0.08, 0.12, 0.23, -0.32]];
  const pos = [], idx = []; let base = 0;
  for (const [w, h, d, x, y, z] of parts) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
    const p = g.attributes.position.array; for (let i = 0; i < p.length; i++) pos.push(p[i]);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base);
    base += p.length / 3; g.dispose();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

export function createWolves(G) {
  // ---- shared render meshes (created once, count 0 while unused) -----------------------------------------
  const eyeGeo = new THREE.PlaneGeometry(1, 1);
  const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(EYES), 1); glowAttr.setUsage(THREE.DynamicDrawUsage);
  eyeGeo.setAttribute('aGlow', glowAttr);
  const eyeMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), vertexShader: EYE_VS, fragmentShader: EYE_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
  const eyes = new THREE.InstancedMesh(eyeGeo, eyeMat, EYES); eyes.frustumCulled = false; eyes.renderOrder = 60; eyes.count = 0; eyes.name = 'wolfEyes';
  eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(eyes);
  let silGeo = null;
  const lod = G.assets.lodGeometry && G.assets.lodGeometry('wolf');
  silGeo = lod && lod.attributes && lod.attributes.position ? lod : boxWolfGeometry();
  const silMat = G.shade.patch(new THREE.MeshBasicMaterial({ color: 0x0c0a09 }));
  const sils = new THREE.InstancedMesh(silGeo, silMat, MAXW); sils.frustumCulled = false; sils.count = 0; sils.name = 'wolfSil';
  sils.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(sils);

  // the model is not loaded when this module is constructed: bake the real silhouette (metres, feet on y = 0, facing +Z) on first use
  let silReal = false;
  function ensureSilhouette() {
    if (silReal) return;
    const inst = G.assets.instance && G.assets.instance('wolf'); if (!inst) return;
    inst.updateMatrixWorld(true);
    let mesh = null; inst.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return;
    const src = (G.assets.lodGeometry && G.assets.lodGeometry('wolf')) || mesh.geometry, pos = src.attributes.position, n = pos.count;
    const out = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(out, 3)); if (src.index) g.setIndex(src.index);
    sils.geometry = g; silReal = true;
  }

  // ---- state ----------------------------------------------------------------------------------------------
  let cx = 0, cz = 0, radius = 14, centerYaw = 0, width = Math.PI;
  const pack = []; let skin = null, skinOwner = null, skinWaiters = 0, alphaW = null, alphaBody = null;
  const swings = []; for (let i = 0; i < NSW; i++) swings.push({ t: -99, x: 0, z: 0, yaw: 0, used: true });
  let swHead = 0;
  const D = s => (G.state.fastText ? Math.min(s, 0.1) : s);
  const ev = (n, p) => G.events.emit(n, p);
  const swallow = p => { if (p && p.catch) p.catch(() => {}); };
  const pose = (b, n, o) => { if (b && b.pose) swallow(b.pose(n, o)); };

  G.events.on('player:swing', e => { const s = swings[swHead]; swHead = (swHead + 1) % NSW; s.t = G.time.now; s.x = e.x; s.z = e.z; s.yaw = e.yaw; s.used = false; });

  function mk(i, ang, r) {
    return { id: 'wolf' + i, ang, r, baseR: r, dir: G.rng.next() < 0.5 ? -1 : 1, vs: 0.035 + G.rng.next() * 0.03, tAng: ang, glide: false, busy: false, ctrl: false, hidden: false, teleT: -99,
      full: false, out: 0, flare: 0, crouch: 0, roll: 0, lift: 0, vel: 0, x: 0, z: 0, yaw: 0, px: 0, pz: 0, blink: 1 + G.vrng.next() * 4, blinkOn: 0, eyeK: 1, body: null, isAlpha: false, stare: false,
      age: 0, revealAt: 0, bodyAt: 0, scale: 1, pauseLeft: 0, walkLeft: 1.5 + i * 0.43,
      pos: { x: 0, y: 0, z: 0 } };
  }
  function polar(w) { w.x = cx + Math.sin(w.ang) * w.r; w.z = cz + Math.cos(w.ang) * w.r; }
  function toPolar(w) { w.ang = Math.atan2(w.x - cx, w.z - cz); w.r = Math.hypot(w.x - cx, w.z - cz); }
  function claim(w) {
    if (!skin || skinOwner) return false;
    skinOwner = w; w.full = true; skin.root.scale.setScalar(w.scale); skin.setVisible(true); pose(skin, 'crouch', { duration: 0.3 }); return true;
  }
  function release(w) { if (skinOwner !== w) return; w.full = false; skinOwner = null; if (skin) { skin.setVisible(false); skin.setSpeed(0); skin.root.rotation.z = 0; } }

  // ---- per-frame ------------------------------------------------------------------------------------------
  function eyePos(w, side, out) {
    const b = w.full ? skin : w.isAlpha ? alphaBody : null;
    if (b && b.head && b.head.getWorldPosition) {
      b.head.getWorldPosition(out); out.y += 0.03;
    } else { const s = 1 - 0.3 * w.crouch; out.set(w.x + Math.sin(w.yaw) * 0.55 * w.scale, w.pos.y + 0.7 * s * w.scale, w.z + Math.cos(w.yaw) * 0.55 * w.scale); }
    out.x += Math.cos(w.yaw) * 0.075 * side; out.z -= Math.sin(w.yaw) * 0.075 * side; return out;
  }
  function updateWolf(w, dt) {
    w.age += dt;
    if (!w.ctrl && !w.isAlpha) {
      if (!w.busy) {
        if (w.glide) { w.ang += wrapPi(w.tAng - w.ang) * (1 - Math.exp(-1.0 * dt)); if (Math.abs(wrapPi(w.tAng - w.ang)) < 0.01) w.glide = false; }
        else {
          // Separate, unequal pauses break the mechanical procession around the fire.
          w.walkLeft -= dt;
          if (w.walkLeft <= 0 && w.pauseLeft <= 0) { w.pauseLeft = 0.7 + G.rng.next() * 2.4; w.walkLeft = 1.4 + G.rng.next() * 3.1; }
          if (w.pauseLeft > 0) w.pauseLeft -= dt; else w.ang += w.dir * w.vs * dt;
          const rel = wrapPi(w.ang - centerYaw), half = width * 0.5;
          if (rel > half) { w.ang = centerYaw + half; w.dir = -1; } else if (rel < -half) { w.ang = centerYaw - half; w.dir = 1; }
        }
        w.r = damp(w.r, w.baseR, 1.2, dt);
        w.crouch = damp(w.crouch, 0, 3, dt);
      }
      polar(w);
      if (!w.busy) w.yaw = dampAng(w.yaw, w.pauseLeft > 0 ? yawOf(cx - w.x, cz - w.z) : yawOf(Math.cos(w.ang) * w.dir, -Math.sin(w.ang) * w.dir), 2.8, dt);
    }
    const gy = G.world.terrain.heightAt(w.x, w.z);
    w.pos.x = w.x; w.pos.z = w.z; w.pos.y = gy + w.lift;
    const mv = Math.hypot(w.x - w.px, w.z - w.pz); w.px = w.x; w.pz = w.z;
    w.vel = damp(w.vel, dt > 0 ? mv / dt : 0, 8, dt);
    w.flare = damp(w.flare, w.flareT || 0, 6, dt);
    w.blink -= dt; if (w.blink < 0) { w.blinkOn = 0.12; w.blink = 2 + G.vrng.next() * 5; } if (w.blinkOn > 0) w.blinkOn -= dt;
  }
  function render(t) {
    const fa = G.sys.firasa ? G.sys.firasa.amount || 0 : 0;
    const n = pack.length; let ei = 0;
    const list = alphaW ? n + 1 : n;
    for (let i = 0; i < list; i++) {
      const w = i < n ? pack[i] : alphaW;
      const slot = w.isAlpha ? ALPHA : i;
      if (!w.isAlpha) {
        if (w.hidden || w.full || w.age < w.bodyAt) sils.setMatrixAt(i, ZERO);
        else {
          _e.set(0, w.yaw, w.roll); _q.setFromEuler(_e); _v.set(w.x, w.pos.y, w.z); _s.set(w.scale, w.scale * (1 - 0.3 * w.crouch), w.scale);
          sils.setMatrixAt(i, _m.compose(_v, _q, _s));
        }
      }
      let g = w.hidden ? 0 : 0.6 + 0.2 * fa;
      if (w.isAlpha) g = w.hidden ? 0 : 0.8;
      if (W.next === w) g = 0.55 + fa * 0.45 * (0.75 + 0.25 * Math.sin(t * 9));
      g = Math.max(g, w.flare * 1.25); g *= w.eyeK * (w.blinkOn > 0 ? 0.1 : 1) * Math.max(0, Math.min(1, (w.age - w.revealAt) / 0.65));
      const rad = (0.045 + 0.055 * Math.min(1, w.flare)) * (w.hidden ? 0 : 1) * (w.isAlpha ? 1.3 : 1);
      for (let s = 0; s < 2; s++) {
        eyePos(w, s ? 1 : -1, _h); _s.set(rad, rad, rad);
        eyes.setMatrixAt(slot * 2 + s, _m.compose(_h, _q.identity(), _s)); glowAttr.array[slot * 2 + s] = g;
      }
      ei = Math.max(ei, slot * 2 + 2);
    }
    eyes.count = alphaW ? EYES : n * 2; eyes.instanceMatrix.needsUpdate = true; glowAttr.needsUpdate = true;
    sils.count = n; sils.instanceMatrix.needsUpdate = true;
    // unused alpha slot (when n < MAXW) stays beyond count when no alpha
    void ei;
  }

  // ---- attacks -----------------------------------------------------------------------------------------------
  /** the earliest unused swing made since this wolf's telegraph, toward it and within reach of its leap → consumed */
  function swingHits(w, sx, sz) {
    const lim = 60 * DEG; let best = null;
    for (let i = 0; i < NSW; i++) {
      const s = swings[i];
      if (s.used || s.t < w.teleT - 1e-6 || s.t > G.time.now || (best && s.t >= best.t)) continue;
      if (segDist(s.x, s.z, sx, sz, w.x, w.z) > REACH) continue;
      const a = yawOf(w.x - s.x, w.z - s.z), b = yawOf(sx - s.x, sz - s.z);
      if (Math.abs(wrapPi(a - s.yaw)) <= lim || Math.abs(wrapPi(b - s.yaw)) <= lim) best = s;
    }
    if (best) best.used = true;
    return !!best;
  }
  function tgtXZ(target, out) { const p = pointOf(target); out.x = p.x; out.z = p.z; return out; }
  const TT = { x: 0, z: 0 };

  async function strike(w, target, res, tele = 1.2) {
    // telegraph
    w.busy = true; w.flareT = 1; w.hidden = false; w.teleT = G.time.now;
    toPolar(w); const r0 = w.r, a0 = w.ang;
    ev('wolf:telegraph', { wolf: w, x: w.x, z: w.z, in: tele });
    claim(w);
    await G.scope.tween(D(tele), k => { w.r = lerp(r0, r0 - 3.5, k); w.crouch = k; w.yaw = yawOf(cx - w.x, cz - w.z); });
    // lunge
    if (!w.full) { skinWaiters++; await G.scope.until(() => !skinOwner); skinWaiters--; claim(w); }
    tgtXZ(target, TT);
    const sx = w.x, sz = w.z; let dx = TT.x - sx, dz = TT.z - sz; const dd = Math.hypot(dx, dz) || 1; dx /= dd; dz /= dd;
    const ex = TT.x - dx * 1.3, ez = TT.z - dz * 1.3, startX = w.x, startZ = w.z;
    ev('wolf:lunge', { wolf: w, x: sx, z: sz });
    W.next = w;                                                    // the swing auto-aims at the wolf that is leaping now
    pose(skin, 'lunge', { duration: 0.6 });
    w.ctrl = true; w.crouch = 0;
    await G.scope.tween(D(0.6), (k, raw) => {
      w.x = lerp(startX, ex, k); w.z = lerp(startZ, ez, k); w.lift = Math.sin(raw * Math.PI) * 0.8; w.yaw = yawOf(dx, dz);
    });
    w.lift = 0;
    // impact
    const hit = swingHits(w, sx, sz);
    const ix = w.x, iz = w.z, bx = cx + Math.sin(a0) * (r0 + 3), bz = cz + Math.cos(a0) * (r0 + 3);
    if (hit) { res.repelled++; ev('wolf:repelled', { wolf: w, x: ix, z: iz }); pose(skin, 'cower', { duration: 0.4 }); }
    else { res.missed++; ev('wolf:bite', { wolf: w, x: ix, z: iz }); pose(skin, 'snarl', { duration: 0.5 }); }
    if (W.next === w) W.next = null;
    w.flareT = 0;
    if (skinWaiters) release(w);
    await G.scope.tween(D(hit ? 0.55 : 0.8), (k, raw) => {
      w.x = lerp(ix, bx, k); w.z = lerp(iz, bz, k); w.yaw = yawOf(ix - bx, iz - bz);
      if (hit) { w.roll = Math.sin(raw * Math.PI) * 1.2 * (raw < 0.5 ? 1 : 1); w.lift = Math.sin(raw * Math.PI) * 0.45; } else w.yaw = yawOf(bx - ix, bz - iz);
    });
    w.roll = 0; w.lift = 0; release(w);
    toPolar(w); w.ctrl = false; w.busy = false; w.crouch = 0;
  }
  const glideTo = (w, slot) => { w.tAng = slot; w.glide = true; };

  const W = {
    threat: false, next: null,
    get alpha() { return alphaBody; },
    get pack() { return pack; },
    spawnPack({ cx: x = 0, cz: z = 0, radius: r = 14, arc, staged = false } = {}) {
      ensureSilhouette();
      W.clear();
      cx = x; cz = z; radius = r; centerYaw = arc && arc.centerYaw !== undefined ? arc.centerYaw : 0;
      width = arc && arc.width ? arc.width : Math.PI; if (width > 6.5) width *= DEG;
      const n = G.quality.pick(5, 6, 6);
      for (let i = 0; i < n; i++) {
        const offsets = [-0.08, 0.34, -0.4, 0.12, -0.25, 0.47];
        const a = centerYaw + offsets[i] * width + (G.rng.next() - 0.5) * 0.07;
        const w = mk(i, a, radius + [-1.5, 2.8, 5.1, 0.8, 7, 3.7][i]);
        w.scale = [1.04, 0.89, 0.96, 1.09, 0.86, 0.98][i];
        w.revealAt = staged ? [0.3, 3.1, 5.9, 2.2, 7.3, 4.8][i] : 0;
        w.bodyAt = staged ? w.revealAt + 1.7 : 0;
        polar(w); w.yaw = a; w.px = w.x; w.pz = w.z; pack.push(w);
      }
      skin = createQuadruped(G, 'wolf', { name: 'wolfFull' }); skin.setVisible(false); skin.place(cx, cz + radius + 8, 0);
      alphaBody = createQuadruped(G, 'wolf', { name: 'alpha', scale: 1.3, tint: 0x8a8078 }); alphaBody.setVisible(false);
      alphaW = mk(ALPHA, 0, radius + 8); alphaW.isAlpha = true; alphaW.body = alphaBody; alphaW.hidden = true; alphaW.ctrl = true;
      alphaW.x = cx + Math.sin(centerYaw) * (radius + 8); alphaW.z = cz + Math.cos(centerYaw) * (radius + 8); alphaW.yaw = centerYaw + Math.PI;
      W.threat = true;
    },
    /** Eyes first, then one animal tests the light and withdraws; no attack window yet. */
    async introduce() {
      const w = pack[0]; if (!w) return;
      await G.scope.sleep(D(2.2));
      w.busy = true; claim(w);
      const r0 = w.r;
      await G.scope.tween(D(2.1), k => { w.r = r0 - 2.3 * k; w.yaw = yawOf(cx - w.x, cz - w.z); });
      pose(skin, 'crouch', { duration: 0.8 });
      await G.scope.sleep(D(0.85));
      await G.scope.tween(D(1.6), k => { w.r = r0 - 2.3 * (1 - k); });
      release(w); w.busy = false;
    },
    async wave({ target, lunges = 3, gap = 6, double = false, tele = 1.2, calm = 0 } = {}) {
      const res = { repelled: 0, missed: 0 };
      if (!pack.length) return res;
      let prev = null;
      const pickSlot = () => {
        let a = centerYaw;
        for (let t = 0; t < 10; t++) {
          a = centerYaw + (G.rng.next() - 0.5) * width;
          if (prev === null || Math.abs(wrapPi(a - prev)) <= 100 * DEG) return a;
        }
        return prev + Math.sign(wrapPi(centerYaw - prev) || 1) * 90 * DEG;
      };
      const pickWolf = slot => { let best = null, bd = 9; for (const w of pack) if (!w.busy && !w.hidden) { const d = Math.abs(wrapPi(w.ang - slot)); if (d < bd) { bd = d; best = w; } } return best; };
      for (let i = 0; i < lunges;) {
        await G.scope.sleep(D((i === 0 ? 1.0 : Math.max(0.2, gap - 4.5)) + calm));
        const pair = double && i === lunges - 2;
        const s1 = pickSlot(); prev = s1; const w1 = pickWolf(s1); if (!w1) { i++; continue; }
        let w2 = null;
        if (pair) {
          let s2 = s1 + (G.rng.next() < 0.5 ? -1 : 1) * 35 * DEG; if (Math.abs(wrapPi(s2 - centerYaw)) > width / 2) s2 = s1 - (s2 - s1);
          w1.busy = true; w2 = pickWolf(s2); w1.busy = false;
          if (w2) { glideTo(w2, s2); prev = s2; }
        }
        glideTo(w1, s1); W.next = w1;
        await G.scope.sleep(D(Math.min(2.5, Math.max(1.2, gap - 0.5))));      // shorter gaps really press harder
        if (pair && w2) {
          const pa = strike(w1, target, res, tele);
          await G.scope.sleep(D(0.6));
          const pb = strike(w2, target, res, tele);
          await Promise.all([pa, pb]); i += 2;
        } else { await strike(w1, target, res, tele); i++; }
      }
      return res;
    },
    async alphaEnter(speed = 1.1) {
      if (!alphaW) return;
      const pl = G.actors.player.pos; const b = alphaBody;
      const w = alphaW; w.hidden = false; w.ctrl = true; w.stare = false;
      w.x = cx + Math.sin(centerYaw) * (radius + 7); w.z = cz + Math.cos(centerYaw) * (radius + 7);
      let dx = pl.x - w.x, dz = pl.z - w.z; const d0 = Math.hypot(dx, dz) || 1; dx /= d0; dz /= d0;
      const ex = pl.x - dx * 6, ez = pl.z - dz * 6; w.yaw = yawOf(dx, dz);
      b.setVisible(true);
      if (G.state.fastText) { w.x = ex; w.z = ez; await G.scope.sleep(0.1); }
      else {
        await G.scope.task(dt => {
          const rx = ex - w.x, rz = ez - w.z, d = Math.hypot(rx, rz);
          if (d < 0.2) return true;
          const s = Math.min(d, speed * dt); w.x += rx / d * s; w.z += rz / d * s; w.yaw = yawOf(rx, rz); return undefined;
        });
      }
      w.stare = true; if (b.lookAt) b.lookAt(G.actors.player.pos);
    },
    async alphaFeint() {
      if (!alphaW || alphaW.hidden) return;
      const w = alphaW, b = alphaBody;
      ev('wolf:telegraph', { wolf: w, x: w.x, z: w.z, in: 1.2 });
      w.flareT = 1; pose(b, 'crouch', { duration: 1.2 });
      await G.scope.sleep(D(1.2));
      ev('wolf:lunge', { wolf: w, x: w.x, z: w.z, feint: true }); pose(b, 'lunge', { duration: 0.4 });
      const x0 = w.x, z0 = w.z, pl = G.actors.player.pos; const yaw = yawOf(pl.x - x0, pl.z - z0); const fx = Math.sin(yaw), fz = Math.cos(yaw);
      await G.scope.tween(D(0.3), k => { w.x = x0 + fx * k; w.z = z0 + fz * k; });
      await G.scope.tween(D(0.7), k => { w.x = x0 + fx * (1 - k); w.z = z0 + fz * (1 - k); });
      w.flareT = 0;
    },
    async alphaLunge() {
      if (!alphaW || alphaW.hidden) return;
      const w = alphaW, b = alphaBody; w.stare = false;
      const pl = G.actors.player.pos, x0 = w.x, z0 = w.z; let dx = pl.x - x0, dz = pl.z - z0; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const ex = pl.x - dx * 1.2, ez = pl.z - dz * 1.2; w.flareT = 1; w.yaw = yawOf(dx, dz); pose(b, 'lunge', { duration: 0.5 });
      await G.scope.tween(D(0.45), (k, raw) => { w.x = lerp(x0, ex, k); w.z = lerp(z0, ez, k); w.lift = Math.sin(raw * Math.PI) * 0.6; });
      w.lift = 0; ev('wolf:bite', { wolf: w, x: w.x, z: w.z });
      await G.scope.sleep(D(0.4));
      await G.scope.tween(D(1.0), k => { w.x = lerp(ex, x0, k); w.z = lerp(ez, z0, k); });
      w.flareT = 0; w.stare = true;
    },
    async flee() {
      const w = alphaW;
      if (w && !w.hidden) {
        w.stare = false; const pl = G.actors.player.pos; const away = yawOf(w.x - pl.x, w.z - pl.z); w.flareT = 0;
        const turn = G.scope.sleep(D(0.7));
        await turn;
        const fx = Math.sin(away), fz = Math.cos(away); w.yaw = away;
        const walk = G.state.fastText ? G.scope.sleep(0.1) : G.scope.tween(3.2, (k, raw) => { w.x += fx * 0.06 * (1 + raw * 3); w.z += fz * 0.06 * (1 + raw * 3); });
        const out = (async () => {
          for (const p of pack) { await G.scope.sleep(D(0.5)); await G.scope.tween(D(0.35), k => { p.eyeK = 1 - k; }); p.hidden = true; }
        })();
        await Promise.all([walk, out]);
        w.hidden = true; alphaBody.setVisible(false);
      } else {
        for (const p of pack) { await G.scope.sleep(D(0.5)); p.hidden = true; }
      }
      W.threat = false; W.next = null;
    },
    clear() {
      for (const w of pack) { w.hidden = true; }
      pack.length = 0; if (skin) skin.dispose(); if (alphaBody) alphaBody.dispose();
      skin = null; skinOwner = null; skinWaiters = 0; alphaBody = null; alphaW = null; W.next = null; W.threat = false;
      for (let i = 0; i < NSW; i++) swings[i].used = true;
      eyes.count = 0; sils.count = 0;
    },
    onBeatEnd() { W.clear(); },
    onLevelUnload() { W.clear(); },
    update(dt) {
      if (!pack.length && !alphaW) return;
      for (let i = 0; i < pack.length; i++) updateWolf(pack[i], dt);
      if (alphaW) {
        const w = alphaW;
        if (w.stare && !w.hidden) { const pl = G.actors.player.pos; w.yaw = dampAng(w.yaw, yawOf(pl.x - w.x, pl.z - w.z), 3, dt); }
        updateWolf(w, dt);
        if (!w.hidden) { alphaBody.place(w.x, w.z, w.yaw); alphaBody.root.position.y += w.lift; alphaBody.setSpeed(w.vel > 0.15 ? w.vel : 0); alphaBody.update(dt); }
      }
      if (skinOwner) { const w = skinOwner; skin.place(w.x, w.z, w.yaw); skin.root.position.y += w.lift; skin.root.rotation.z = w.roll; skin.setSpeed(w.vel > 0.3 ? w.vel : 0); skin.update(dt); }
      render(G.time.now);
    },
  };
  const dampAng = (a, b, l, dt) => a + wrapPi(b - a) * (1 - Math.exp(-l * dt));
  void TAU;
  return W;
}
