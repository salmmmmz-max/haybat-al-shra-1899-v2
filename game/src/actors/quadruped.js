/**
 * Quadruped body (camel, wolf) — the GLBs are static meshes; legs, neck and tail are animated in the VERTEX SHADER
 * (hip swing + knee flex per leg from one gait phase, leg fold for kneeling) and the body bobs/rolls on the CPU.
 *   createQuadruped(G, modelId, { scale, tint, rig, name }) → body
 *   body.root · pos · yaw · place(x, z, yaw?) · face(yaw, rate=6) · update(dt) · setScale · setTint · setVisible · dispose · freeze(b)
 *   body.setSpeed(mps) · gait ('idle'|'walk'|'run') · saddle (Object3D, seat point, world scale 1) · head (Object3D) · kneeling
 *   body.pose(name, { duration }) → Promise     camel: kneel rise shake raiseHead lowerHead neutral · wolf: crouch lunge snarl howl cower neutral
 *   body.lookAt(target | null)
 * The owner (camels.js / wolves.js / the rider) moves `root` in x/z; this module keeps y on the terrain and animates.
 */
import * as THREE from 'three';
import { damp, dampAngle, clamp, clamp01, lerp, pointOf, yawOf, angleDelta } from '../core/math.js';

const SPEC = {
  camel: { belly: 1.06, hip: 1.3, knee: 0.56, legZ: [0.37, -0.72], tailZ: -0.99, neck: [0.42, 1.5, 0.72, 0.85], saddle: [0, 2.13, -0.3], head: [0.08, 2.3, 1.1],
    walk: 2.4, run: 5.5, A: [0.45, 0.62], flex: [0.55, 0.95], roll: 0.05, drop: 0.8, off: [[0.06, 0.56, 0, 0.5], [0.06, 0.56, 0, 0.5]], blob: 1.0, lod: 16,
    // V02: a longer, higher-carried neck (stretched 0.2 m along its own axis, head lifted 4.5°), the pace's side-to-side sway
    // over the supporting legs, front legs folding more in the swing than the hind ones
    neckExt: [0, 0.82, 0.57, 0.2], headRest: -0.08, sway: 0.035, rollPace: 0.075, frontFlex: 1.3 },
  wolf: { belly: 0.43, hip: 0.56, knee: 0.22, legZ: [0.27, -0.37], tailZ: -0.47, neck: [0.24, 0.62, 0.3, 0.3], saddle: [0, 0.72, 0], head: [0, 0.8, 0.5],
    walk: 3, run: 8, A: [0.5, 0.85], flex: [0.7, 1.2], roll: 0.02, drop: 0.2, off: [[0, 0.5, 0.5, 0], [0, 0.12, 0.5, 0.62]], blob: 0.5, lod: 14 },
};
const QUAD_PARS = /* glsl */`
uniform mat4 uQN, uQNI; uniform vec4 uQ, uQLeg, uQOff, uQGait, uQNeck, uQNeckX; uniform vec2 uQHead; uniform float uQPhase, uQStretch, uQSquash, uQFront;
`;
const QUAD_VERT = /* glsl */`
{ vec3 q = (uQN * vec4(transformed, 1.0)).xyz;
  float legK = smoothstep(uQ.x + 0.12, uQ.x - 0.2, q.y) * step(uQ.z, q.z);
  if (legK > 0.0) {
    float front = step(uQLeg.z, q.z), left = step(0.0, q.x), sgn = front * 2.0 - 1.0;
    float ph = fract(uQPhase + mix(mix(uQOff.w, uQOff.z, left), mix(uQOff.y, uQOff.x, left), front));
    float flex = 0.0, ang;
    if (ph < uQGait.z) ang = mix(uQGait.x, -uQGait.x, ph / uQGait.z);
    else { float s = (ph - uQGait.z) / (1.0 - uQGait.z); flex = sin(3.14159 * s) * uQGait.y; ang = mix(-uQGait.x, uQGait.x, 0.5 - 0.5 * cos(3.14159 * s)); }
    ang = ang * uQGait.w + uQStretch * sgn; flex *= uQGait.w * mix(2.0 - uQFront, uQFront, front);
    float pz = mix(uQLeg.y, uQLeg.x, front);
    float fk = flex * smoothstep(uQ.w + 0.1, uQ.w - 0.12, q.y);
    vec2 d = vec2(q.y - uQ.w, q.z - pz); float c1 = cos(fk), s1 = sin(fk);
    d = vec2(d.x * c1 - d.y * s1, d.x * s1 + d.y * c1); q.y = uQ.w + d.x; q.z = pz + d.y;
    vec2 e = vec2(q.y - uQ.y, q.z - pz); float a = -ang * legK, c2 = cos(a), s2 = sin(a);
    e = vec2(e.x * c2 - e.y * s2, e.x * s2 + e.y * c2); q.y = uQ.y + e.x; q.z = pz + e.y;
    q.y = mix(q.y, uQ.x - (uQ.x - q.y) * 0.22, uQSquash * legK); q.z += uQSquash * legK * (front * 0.24 - 0.06);
  }
  float nk = smoothstep(uQNeck.y - 0.12, uQNeck.y + uQNeck.w, q.y) * step(uQNeck.x, q.z);
  if (nk > 0.0) {
    q.yz += uQNeckX.yz * (uQNeckX.w * nk);                                   // neck stretch (the head moves rigidly)
    float a = uQHead.x * nk, c = cos(a), s = sin(a); vec2 d = vec2(q.y - uQNeck.y, q.z - uQNeck.z);
    d = vec2(d.x * c - d.y * s, d.x * s + d.y * c); q.y = uQNeck.y + d.x; q.z = uQNeck.z + d.y;
    float b = uQHead.y * nk, cb = cos(b), sb = sin(b); vec2 h = vec2(q.x, q.z - uQNeck.z);
    h = vec2(h.x * cb + h.y * sb, -h.x * sb + h.y * cb); q.x = h.x; q.z = uQNeck.z + h.y;
  }
  float tl = step(q.z, uQ.z) * (uQ.z - q.z);
  q.x += sin(uQPhase * 12.566 + q.y * 5.0) * 0.25 * tl * (0.3 + uQGait.w);
  transformed = (uQNI * vec4(q, 1.0)).xyz; }
`;
const scratch = new THREE.Vector3(), mTmp = new THREE.Matrix4();

export function createQuadruped(G, modelId, opts = {}) {
  const S = SPEC[modelId] || (/(wolf)/.test(modelId) ? SPEC.wolf : SPEC.camel);
  const root = new THREE.Group(); root.name = opts.name || modelId; root.rotation.order = 'YXZ';
  const rig = new THREE.Group(); root.add(rig);
  let scale = opts.scale || 1; root.scale.setScalar(scale);
  const U = {
    uQN: { value: new THREE.Matrix4() }, uQNI: { value: new THREE.Matrix4() },
    uQ: { value: new THREE.Vector4(S.belly, S.hip, S.tailZ, S.knee) }, uQLeg: { value: new THREE.Vector4(S.legZ[0], S.legZ[1], (S.legZ[0] + S.legZ[1]) / 2, 0) },
    uQOff: { value: new THREE.Vector4().fromArray(S.off[0]) }, uQGait: { value: new THREE.Vector4(S.A[0], S.flex[0], 0.6, 0) },
    uQNeck: { value: new THREE.Vector4().fromArray(S.neck) }, uQHead: { value: new THREE.Vector2() }, uQPhase: { value: 0 }, uQStretch: { value: 0 }, uQSquash: { value: 0 },
    uQNeckX: { value: new THREE.Vector4().fromArray(S.neckExt || [0, 1, 0, 0]) }, uQFront: { value: S.frontFlex || 1 },
  };
  const inst = G.assets.instance(modelId);
  const meshes = []; let lodReg = null, blob = null, mat = null;
  if (inst) {
    rig.add(inst); root.updateMatrixWorld(true);
    const lodGeo = G.assets.lodGeometry(modelId);
    inst.traverse(o => {
      if (!o.isMesh) return;
      if (!mat) {
        mat = o.material.clone(); mat.userData.hsShade = false;
        mat.onBeforeCompile = sh => { Object.assign(sh.uniforms, U); sh.vertexShader = QUAD_PARS + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + QUAD_VERT); };
        mat.customProgramCacheKey = () => 'hs-quad';
        G.shade.patch(mat);
        if (opts.tint) mat.color.set(opts.tint);
        // mesh space → normalised body space (metres, feet on y = 0, facing +Z)
        mTmp.copy(root.matrixWorld).invert(); U.uQN.value.multiplyMatrices(mTmp, o.matrixWorld);
        U.uQNI.value.copy(U.uQN.value).invert();
      }
      o.material = mat; o.frustumCulled = false;
      meshes.push({ o, full: o.geometry, lod: lodGeo });
    });
    if (meshes.length && meshes[0].lod && G.lod) lodReg = G.lod.add({ at: root, near: S.lod, set(level) { for (const m of meshes) m.o.geometry = level && m.lod ? m.lod : m.full; } });
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, S.hip, 1.6), G.shade.patch(new THREE.MeshLambertMaterial({ color: opts.tint || 0xd8c8a0 })));
    b.position.y = S.hip; rig.add(b);
  }
  const saddle = new THREE.Group(); saddle.position.fromArray(S.saddle); saddle.scale.setScalar(1 / scale); rig.add(saddle);
  const head = new THREE.Group(); head.position.fromArray(S.head); rig.add(head);
  if (S.neckExt) { head.position.y += S.neckExt[1] * S.neckExt[3]; head.position.z += S.neckExt[2] * S.neckExt[3]; }
  G.scene.add(root);
  if (G.world.decals && G.world.decals.blob) blob = G.world.decals.blob(root, S.blob * scale);

  let yaw = 0, yawTarget = null, yawRate = 6, speed = 0, speedCur = 0, phase = G.vrng.next(), frozen = false, visible = true;
  let squash = 0, headPitch = 0, headPitchT = 0, headYaw = 0, lookTarget = null, stretch = 0, hop = 0, shake = 0, tilt = 0, t = G.vrng.next() * 10;
  const L = S.hip;

  function tweenTo(d, fn) { if (G.state.fastText || d <= 0) { fn(1); return Promise.resolve(); } return G.scope.tween(d, fn); }
  const body = {
    root, saddle, head, spec: S, modelId,
    get pos() { return root.position; },
    get yaw() { return yaw; }, set yaw(v) { yaw = v; root.rotation.y = v; },
    get gait() { return speedCur < 0.25 ? 'idle' : speedCur > S.walk * 1.3 ? 'run' : 'walk'; },
    get kneeling() { return squash > 0.5; },
    get speed() { return speedCur; },
    place(x, z, y2) { root.position.set(x, G.world.terrain.heightAt(x, z), z); if (y2 !== undefined) { yaw = y2; root.rotation.y = y2; yawTarget = null; } },
    face(y2, rate = 6) { yawTarget = y2; yawRate = rate; },
    setSpeed(v) { speed = Math.max(0, v || 0); },
    setScale(s) { scale = s; root.scale.setScalar(s); saddle.scale.setScalar(1 / s); },
    setTint(hex) { if (mat) mat.color.set(hex === null || hex === undefined ? 0xffffff : hex); },
    setVisible(b) { visible = !!b; root.visible = visible; },
    freeze(b) { frozen = !!b; },
    lookAt(target) { lookTarget = target || null; },
    pose(name, o = {}) {
      const d = o.duration;
      switch (name) {
        case 'kneel': { const s0 = squash; return tweenTo(d === undefined ? 1.6 : d, k => { squash = lerp(s0, 1, k); tilt = Math.sin(Math.PI * k) * 0.16; }); }
        case 'rise': { const s0 = squash; return tweenTo(d === undefined ? 1.8 : d, k => { squash = lerp(s0, 0, k); tilt = -Math.sin(Math.PI * k) * 0.14; }); }
        case 'crouch': case 'cower': { const s0 = squash; headPitchT = 0.35; return tweenTo(d === undefined ? 0.5 : d, k => { squash = lerp(s0, name === 'cower' ? 0.75 : 0.55, k); }); }
        case 'lunge': { const s0 = squash; headPitchT = -0.1; return tweenTo(d === undefined ? 0.55 : d, k => { squash = lerp(s0, 0, Math.min(1, k * 4)); stretch = Math.sin(Math.PI * k) * 0.85; hop = Math.sin(Math.PI * k) * 0.55; }); }
        case 'shake': return tweenTo(d === undefined ? 0.9 : d, k => { shake = Math.sin(k * 38) * (1 - k) * 0.07; });
        case 'snarl': headPitchT = 0.3; return tweenTo(d === undefined ? 0.4 : d, k => { shake = Math.sin(k * 50) * 0.02 * (1 - k); });
        case 'howl': headPitchT = -0.95; return tweenTo(d === undefined ? 1.2 : d, () => {});
        case 'raiseHead': headPitchT = -0.28; return tweenTo(d === undefined ? 0.7 : d, () => {});
        case 'lowerHead': headPitchT = 0.95; return tweenTo(d === undefined ? 1.0 : d, () => {});
        default: { const s0 = squash; headPitchT = 0; return tweenTo(d === undefined ? 0.5 : d, k => { squash = lerp(s0, 0, k); stretch = 0; hop = 0; }); }
      }
    },
    update(dt) {
      const p = root.position;
      p.y = G.world.terrain.heightAt(p.x, p.z);
      if (yawTarget !== null) { yaw = dampAngle(yaw, yawTarget, yawRate, dt); root.rotation.y = yaw; if (Math.abs(angleDelta(yaw, yawTarget)) < 0.002) yawTarget = null; }
      else yaw = root.rotation.y;
      if (frozen || !visible) return;
      t += dt;
      speedCur = damp(speedCur, squash > 0.3 ? 0 : speed, 5, dt);
      const amt = clamp01(speedCur / 0.5), runK = clamp01((speedCur - S.walk * 1.15) / (S.run - S.walk * 1.15));
      const A = lerp(S.A[0], S.A[1], runK), duty = lerp(0.6, 0.45, runK);
      phase = (phase + dt * (speedCur / scale) * duty / (2 * L * Math.sin(A))) % 1;
      const g = U.uQGait.value; g.x = A; g.y = lerp(S.flex[0], S.flex[1], runK); g.z = duty; g.w = amt;
      const o = U.uQOff.value, o0 = S.off[0], o1 = S.off[1]; o.set(lerp(o0[0], o1[0], runK), lerp(o0[1], o1[1], runK), lerp(o0[2], o1[2], runK), lerp(o0[3], o1[3], runK));
      U.uQPhase.value = phase; U.uQSquash.value = squash; U.uQStretch.value = stretch;
      // the supporting leg pair decides how far the body sinks (keeps stance feet on the ground)
      let drop = 1;
      for (let i = 0; i < 2; i++) { const ph = (phase + i * 0.5) % 1; if (ph < duty) { const a = lerp(A, -A, ph / duty); drop = Math.min(drop, 1 - Math.cos(a)); } }
      if (drop === 1) drop = 0;
      rig.position.y = -L * drop * amt - S.drop * squash + hop + Math.sin(t * 1.4) * 0.006;
      rig.position.x = S.sway ? Math.cos((phase - 0.3) * Math.PI * 2) * S.sway * amt * (1 - 0.5 * runK) : 0;   // over the supporting pair
      rig.rotation.z = Math.sin(phase * Math.PI * 2) * (S.rollPace || S.roll) * amt + shake;
      rig.rotation.x = tilt + Math.sin(phase * Math.PI * 4) * 0.012 * amt;
      // neck: counter-swing while walking, pose offsets, look-at
      headPitch = damp(headPitch, headPitchT, 4, dt);
      let hy = 0;
      if (lookTarget) { const q = pointOf(lookTarget); hy = clamp(angleDelta(yaw, yawOf(q.x - p.x, q.z - p.z)), -1.1, 1.1) * 0.85; }
      headYaw = damp(headYaw, hy, 4, dt);
      U.uQHead.value.set(headPitch + (S.headRest || 0) + Math.sin(phase * Math.PI * 4 + 0.7) * 0.07 * amt + Math.sin(t * 0.9) * 0.015, -headYaw);
    },
    dispose() { if (lodReg) lodReg.remove(); if (blob) blob.remove(); G.scene.remove(root); if (mat) mat.dispose(); },
  };
  void scratch;
  body.place(0, 0, 0);
  return body;
}
