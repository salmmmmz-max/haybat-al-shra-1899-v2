/**
 * Humanoid actor — wraps a rigged GLB (Meshy 24-bone skeleton) with clip playback, foot-synced locomotion blending,
 * an upper-body overlay layer, sockets, head look-at, sitting offsets, LOD, blob shadow.
 *
 *   const a = createHumanoid(G, 'dhari', { tint, scale, name, pinLod });   // pinLod: always the full mesh (the hero)
 *   a.place(x, z, yaw) · a.play('idle') · await a.playOnce('kneel') · a.locomotion(speed) · a.face(yaw) · a.faceTo(x, z)
 *   a.overlay('torch' | null, { fade }) · a.overlayOnce('swing', { hold }) · a.lookAt(target | null) · a.gesture(on)
 *   a.socket('handR'|'handL'|'back'|'head'|'hips') · a.sitOn(parent | null) · a.update(dt) (called by the owner)
 *
 * Layers: every clip is split into a lower part (hips + legs) and an upper part (spine and up, arms). Base weights sum
 * to 1; the overlay replaces the upper part only, so weights always stay normalised.
 */
import * as THREE from 'three';
import { dampAngle, yawOf, dist2, clamp, smoothstep, wrapPi } from '../core/math.js';

export const CLIPS = ['idle', 'walk', 'run', 'sit', 'kneel', 'drink', 'torch', 'swing', 'call', 'steady', 'talk', 'lie', 'aim', 'wave'];
const FALLBACK = { run: 'walk', steady: 'idle', talk: 'idle', call: 'idle', torch: 'idle', aim: 'idle', wave: 'idle', drink: 'idle', kneel: 'sit', sit: 'idle', lie: 'sit', swing: 'idle', pull: 'idle', idle: 'walk', walk: 'idle' };
const BONES = { handR: 'RightHand', handL: 'LeftHand', head: 'Head', hips: 'Hips', back: 'Spine01' };
const POSES = { sit: 1, kneel: 1, lie: 1 };
const LOWER = /^(Hips|.*UpLeg|.*Leg|.*Foot|.*ToeBase)$/;
const WALK_SPEED = 1.35, RUN_SPEED = 4.2;   // fallback strides (m/s at timeScale 1)

const _v = new THREE.Vector3(), _wp = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _qx = new THREE.Quaternion();
const _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _h = new THREE.Vector3(), _k = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _qf = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _nrm = { x: 0, y: 1, z: 0 };
const LEGS = [['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'], ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']];
// V01 riding: thigh / shin directions in actor space (x = the leg's own side, y up, z forward) — astride the hump, legs down
// the camel's flanks (half-width ≈ 0.49 m at the belly), knees ≈ 130°; the back leans 6° behind vertical
const RIDE = { thigh: [0.78, -0.45, 0.43], shin: [0.28, -0.96, 0.02], lean: 0.1 };
const _elbowTarget = new THREE.Vector3(), _wristTarget = new THREE.Vector3(), _wristHold = new THREE.Quaternion();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _e3 = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------------------------
// per-model measurements (once per model id): stride of walk/run, stance phase, root offsets of sit/kneel/lie
const MEASURE = new Map();
export function humanoidMeasure(G, id) {
  if (MEASURE.has(id)) return MEASURE.get(id);
  const M = { walk: { stride: WALK_SPEED, ph: 0 }, run: { stride: RUN_SPEED, ph: 0 }, ground: {}, seat: {}, ankle: 0.08, has: false };
  const inst = G.assets.instance(id);
  if (!inst) return M;                                   // stand-in: not cached, the real model may still arrive
  MEASURE.set(id, M);
  try {
    const holder = new THREE.Group(); holder.add(inst); holder.updateMatrixWorld(true);
    const clips = {}; for (const c of inst.userData.animations || []) clips[c.name] = c;
    const mixer = new THREE.AnimationMixer(inst); const bones = []; let hips = null, lf = null, rf = null;
    inst.traverse(o => { if (o.isBone) { bones.push(o); if (o.name === 'Hips') hips = o; if (o.name === 'LeftFoot') lf = o; if (o.name === 'RightFoot') rf = o; } });
    const sample = (clip, t) => { mixer.stopAllAction(); const a = mixer.clipAction(clip); a.reset().play(); a.time = t; mixer.update(0); holder.updateMatrixWorld(true); return a; };
    const lowest = () => { let y = 1e9; for (const b of bones) { if (/end|front/.test(b.name)) continue; b.getWorldPosition(_v); if (_v.y < y) y = _v.y; } return y; };
    const stride = (clip, fallback) => {
      if (!clip || !lf) return { stride: fallback, ph: 0 };
      const N = 32, T = clip.duration, z = [], y = []; let best = 0;
      for (let i = 0; i < N; i++) { sample(clip, T * i / N); lf.getWorldPosition(_v); z.push(_v.z); y.push(_v.y); if (z[i] > z[best]) best = i; }
      const ymin = Math.min(...y), yr = Math.max(...y) - ymin; let sum = 0, n = 0;
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; if (y[i] < ymin + 0.3 * yr && y[j] < ymin + 0.45 * yr) { sum += -(z[j] - z[i]) / (T / N); n++; } }
      let s = n ? sum / n : fallback; if (!(s > 0.3 && s < 9)) s = fallback;
      mixer.stopAllAction();
      return { stride: s * T, T, ph: best / N, ankle: ymin };   // stride = metres per cycle; ankle = planted ankle height
    };
    const w = stride(clips.walk, WALK_SPEED * (clips.walk ? clips.walk.duration : 1)), r = clips.run ? stride(clips.run, RUN_SPEED * clips.run.duration) : null;
    M.walk = { stride: w.stride, ph: w.ph }; if (w.ankle > 0 && w.ankle < 0.3) M.ankle = w.ankle;
    if (r) M.run = { stride: r.stride, ph: r.ph };
    // pose offsets: lowest joint of the pose vs the standing pose (ground); hips height/forward (saddle)
    const idle = clips.idle || clips.walk;
    const base = idle ? (sample(idle, 0), lowest()) : 0;
    for (const k in POSES) {
      const c = clips[k]; if (!c) continue;
      sample(c, c.duration * 0.98);
      M.ground[k] = base - lowest();
      if (hips) { hips.getWorldPosition(_v); M.seat[k] = { y: 0.1 - _v.y, z: -_v.z }; } // ground contact is solved from the deformed garment, never by burying the hips
    }
    // V01: saddle seat from each pose clip ALONE (the samples above still blend with the clips left playing — kept as they
    // are for the ground offsets); x centres the hips over the saddle (the clips carry a sideways hip offset)
    if (hips) for (const k in POSES) { const c = clips[k]; if (!c) continue; mixer.stopAllAction(); sample(c, c.duration * 0.98); hips.getWorldPosition(_v); M.seat[k] = { y: 0.1 - _v.y, z: -_v.z, x: -_v.x }; }
    M.has = true;
  } catch (e) { console.warn('[humanoid] measure failed', id, e); }
  return M;
}

export function createHumanoid(G, modelId, opts = {}) {
  const root = new THREE.Group(); root.name = opts.name || modelId;
  const inst = G.assets.instance(modelId);
  const meta = G.assets.meta(modelId) || {};
  const scale = opts.scale || 1;
  const height = (meta.height || 1.75) * scale;
  const M = inst ? humanoidMeasure(G, modelId) : null;
  let mixer = null, placeholder = null, lodReg = null, blob = null;
  const meshes = [], bones = {}, ownMats = [];
  const raw = {};            // clip name -> { clip, L, U, O, dur }
  const lodAt = { x: 0, z: 0 };

  if (inst) {
    inst.scale.multiplyScalar(scale);
    root.add(inst); root.updateMatrixWorld(true);
    mixer = new THREE.AnimationMixer(inst);
    inst.traverse(o => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh) meshes.push(o); });
    for (const clip of inst.userData.animations || []) {
      const up = [], lo = [];
      for (const t of clip.tracks) (LOWER.test(t.name.split('.')[0]) ? lo : up).push(t);
      raw[clip.name] = {
        clip, dur: clip.duration || 1,
        L: mixer.clipAction(new THREE.AnimationClip(clip.name + ':L', clip.duration, lo)),
        U: mixer.clipAction(new THREE.AnimationClip(clip.name + ':U', clip.duration, up)),
        O: null,
      };
    }
    // explicit bounding spheres (inflated: animation raises arms) and LOD1 on the shared vertex buffers
    for (const m of meshes) {
      m.frustumCulled = true;
      try { m.computeBoundingSphere(); m.boundingSphere.radius = Math.max(m.boundingSphere.radius * 1.5, height * 0.9); } catch (e) { m.frustumCulled = false; }
    }
    const lodGeo = G.assets.lodGeometry ? G.assets.lodGeometry(modelId) : null;
    if (lodGeo && meshes.length === 1 && G.lod) {
      const full = meshes[0].geometry;
      lodReg = G.lod.add({ at: lodAt, near: 18, pinned: !!opts.pinLod, set(level) { meshes[0].geometry = level ? lodGeo : full; } });   // F04: the hero passes pinLod
    }
  } else {
    // stand-in: capsule body + head, procedural bob
    placeholder = new THREE.Group();
    const k = height / 1.75;
    const mat = G.shade.patch(new THREE.MeshLambertMaterial({ color: opts.tint || 0xe8dcc0 }));
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * k, 0.9 * k, 4, 8), mat); body.position.y = 0.9 * k;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13 * k, 10, 8), G.shade.patch(new THREE.MeshLambertMaterial({ color: 0xb98a62 }))); head.position.y = 1.62 * k;
    placeholder.add(body, head); root.add(placeholder);
  }
  G.scene.add(root);
  const mkBlob = () => { blob = G.world.decals && G.world.decals.blob ? G.world.decals.blob(root, 0.45 * scale) : null; };
  mkBlob();

  // ---- sockets: bone children with world-unit scale and actor-aligned axes in the bind pose (computed before any animation)
  const sockets = {};
  const mkSocket = name => {
    const s = new THREE.Object3D(); s.name = 'socket:' + name;
    const bone = bones[BONES[name]];
    if (bone) {
      root.updateMatrixWorld(true);
      bone.getWorldQuaternion(_qa); root.getWorldQuaternion(_qp); _qa.premultiply(_qp.invert()).invert();   // = (root⁻¹ · bone)⁻¹
      s.quaternion.copy(_qa);
      bone.getWorldScale(_v); root.getWorldScale(_wp); s.scale.set(_wp.x / _v.x, _wp.y / _v.y, _wp.z / _v.z);
      bone.add(s);
    } else { root.add(s); s.position.y = name === 'head' ? height * 0.92 : name === 'back' ? height * 0.7 : name === 'hips' ? height * 0.55 : height * 0.5; }
    sockets[name] = s; return s;
  };
  if (inst) for (const n in BONES) mkSocket(n);

  // ---- state
  let curName = null, baseLoop = 'idle', yawTarget = 0, yawRate = 0, skip = false, acc = 0;
  let drop = 0, dropT = 0, dropZ = 0, dropZT = 0, dropX = 0, dropXT = 0, seated = false, baseRate = 12;
  let loco = false, locoSpeed = 0, phase = 0, locoW = { idle: 1, walk: 0, run: 0 };
  const bw = {}, bt = {};          // base weights / targets (by raw clip name)
  const ow = {}, ot = {};          // overlay weights / targets
  // F21 foot placement: per-leg bones, damped ground offsets under each ankle, pelvis drop, blend weight
  const legs = LEGS.every(l => l.every(n => bones[n])) ? LEGS.map(l => l.map(n => bones[n])) : null;
  const footOff = [0, 0], planted = [0, 0]; let pelvis = 0, ikW = 0, rideW = 0;
  let handTargets = null, handWeight = 0, groundSitW = 0;
  const lapTargets = { left: new THREE.Vector3(), right: new THREE.Vector3(), weight: 0 };
  const groundSamples = meshes.map(mesh => {
    // Directional extrema per dominant bone retain skirt/heel/toe silhouettes at low CPU cost.
    const P = mesh.geometry.attributes.position, I = mesh.geometry.attributes.skinIndex, W = mesh.geometry.attributes.skinWeight;
    const extrema = new Map(), ids = new Set();
    for (let i = 0; i < P.count; i++) {
      let j = 0; if (W) for (let k = 1; k < 4; k++) if (W.getComponent(i, k) > W.getComponent(i, j)) j = k;
      const bone = I ? I.getComponent(i, j) : 0;
      for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
        const key = bone + ':' + axis + ':' + sign, val = P.getComponent(i, axis) * sign, prev = extrema.get(key);
        if (!prev || val > prev.val) extrema.set(key, { val, i });
      }
      if (i % Math.max(1, Math.floor(P.count / 128)) === 0) ids.add(i);
    }
    for (const v of extrema.values()) ids.add(v.i);
    return { mesh, ids: [...ids] };
  });
  let ovRate = 8, ovName = null, onceTimer = 0, onceOn = null, onceBack = null, gesW = 0, gesT = 0, lookW = 0, lookWT = 0, lookYaw = 0, lookPitch = 0, lookTarget = null, gtime = G.vrng.next() * 10;
  for (const n in raw) { bw[n] = bt[n] = 0; }
  const idleName = raw.idle ? 'idle' : raw.walk ? 'walk' : Object.keys(raw)[0];
  if (idleName) bw[idleName] = bt[idleName] = 1;
  for (const n in raw) { const r = raw[n]; r.L.play(); r.U.play(); r.L.enabled = r.U.enabled = bw[n] > 0; r.L.timeScale = r.U.timeScale = 1; }

  const resolve = name => {                 // logical → real clip name (never throws)
    let n = name, guard = 0;
    while (n && !raw[n] && guard++ < 4) n = FALLBACK[n];
    return raw[n] ? n : idleName;
  };
  const setDrop = name => {
    const k = POSES[name] ? name : (name === 'lie' ? 'sit' : null);
    const pose = POSES[name] ? name : null;
    dropXT = 0;
    if (!pose || !M) { dropT = 0; dropZT = 0; return; }
    const real = raw[pose] ? pose : (pose === 'lie' || pose === 'kneel') && raw.sit ? 'sit' : pose;
    const extra = pose === 'lie' && !raw.lie ? -0.35 : 0;
    if (seated && M.seat[real]) { dropT = M.seat[real].y + extra; dropZT = M.seat[real].z; dropXT = M.seat[real].x || 0; }   // V01: x = centred on the saddle
    else { dropT = 0; dropZT = 0; } // ground pose solver owns the pelvis and garment clearance
    void k;
  };
  const tScale = s => (G.state.fastText ? Math.min(s, 0.08) : s);

  /**
   * V01: astride the saddle. The 'sit' clip is a chair pose (thighs level, shins vertical) that reads as a squat on a camel.
   * While seated on a parent and sitting, each leg is re-aimed: the hip turns the whole leg so the thigh runs down the
   * flank and the knee hinge stays in its own plane (frame match, no twist), then the knee opens about that hinge; the
   * lower spine straightens to a relaxed, slightly reclined back. Blended in/out with the sit fade.
   */
  function ridePose(dt) {
    const want = actor.astride && seated && curName === 'sit' && root.parent && root.parent !== G.scene ? 1 : 0;
    rideW += (want - rideW) * (1 - Math.exp(-6 * dt));
    if (rideW < 0.002) { rideW = 0; return; }
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_qs);
    const k = rideW, hips = bones.Hips;
    if (hips) {
      hips.getWorldPosition(_h); root.worldToLocal(_h);
      inst.position.x -= _h.x * k; inst.position.z -= _h.z * k;
      inst.position.y += (0.10 - _h.y) * k; inst.updateMatrixWorld(true);
    }
    for (let i = 0; i < 2; i++) {
      const up = legs[i][0], kn = legs[i][1], ft = legs[i][2];
      up.getWorldPosition(_h); kn.getWorldPosition(_k); ft.getWorldPosition(_f);
      root.worldToLocal(_t.copy(_h)); if (hips) { hips.getWorldPosition(_f); root.worldToLocal(_f); } else _f.set(0, 0, 0);
      const side = _t.x >= _f.x ? 1 : -1; ft.getWorldPosition(_f);
      // current frame (thigh, hinge, third) and the riding frame, both in world space
      _u.subVectors(_k, _h).normalize(); _w.subVectors(_f, _k).normalize(); _ax.crossVectors(_u, _w).normalize();
      _e1.set(RIDE.thigh[0] * side, RIDE.thigh[1], RIDE.thigh[2]).normalize().applyQuaternion(_qs);
      _e2.set(RIDE.shin[0] * side, RIDE.shin[1], RIDE.shin[2]).normalize().applyQuaternion(_qs);
      _e3.crossVectors(_e1, _e2).normalize();                                // riding hinge
      if (_ax.dot(_e3) < 0) _e3.negate();
      _m1.makeBasis(_u, _ax, _t.crossVectors(_u, _ax)); _m2.makeBasis(_e1, _e3, _f.crossVectors(_e1, _e3));
      _qi.setFromRotationMatrix(_m2.multiply(_m1.transpose())); _qf.identity().slerp(_qi, k);
      worldRotate(up, _qf); up.updateMatrixWorld(true);
      // open/close the knee about the (rotated) hinge until the shin points along the riding shin
      kn.getWorldPosition(_k); ft.getWorldPosition(_f); _w.subVectors(_f, _k).normalize();
      const cur = Math.atan2(_t.crossVectors(_e1, _w).dot(_e3), _e1.dot(_w)), tgt = Math.atan2(_t.crossVectors(_e1, _e2).dot(_e3), _e1.dot(_e2));
      _qi.setFromAxisAngle(_e3, (tgt - cur) * k); worldRotate(kn, _qi); kn.updateMatrixWorld(true);
    }
    // relaxed back: lower spine aims hips→neck at the actor's up, reclined by RIDE.lean
    const sp = bones.Spine02 || bones.Spine, nk = bones.neck || bones.Head;
    if (sp && nk) {
      sp.getWorldPosition(_h); nk.getWorldPosition(_k); _u.subVectors(_k, _h).normalize();
      _w.set(0, Math.cos(RIDE.lean), -Math.sin(RIDE.lean)).applyQuaternion(_qs);
      // The rider balances against gravity; only a quarter of the camel's roll reaches the trunk.
      _w.multiplyScalar(0.25).addScaledVector(_up, 0.75).normalize();
      _qi.setFromUnitVectors(_u, _w); _qf.identity().slerp(_qi, k); worldRotate(sp, _qf); sp.updateMatrixWorld(true);
    }
  }


  // Aim a joint-to-child segment in world space; preserves the imported bone's local axes.
  function aimSegment(joint, child, direction, weight) {
    joint.getWorldPosition(_h); child.getWorldPosition(_k);
    _u.subVectors(_k, _h).normalize(); _w.copy(direction).normalize();
    _qi.setFromUnitVectors(_u, _w); _qf.identity().slerp(_qi, weight);
    worldRotate(joint, _qf); joint.updateMatrixWorld(true);
  }

  function groundPose(dt) {
    const logicalSit = curName === 'sit' || (curName === 'kneel' && !raw.kneel) || (curName === 'lie' && !raw.lie);
    groundSitW += ((logicalSit && !seated ? 1 : 0) - groundSitW) * (1 - Math.exp(-baseRate * dt));
    if (!inst || seated || root.parent !== G.scene || Math.abs(root.rotation.x) > 0.1) return;
    const sitW = raw.sit ? (bw.sit || 0) : groundSitW;
    root.updateMatrixWorld(true); root.getWorldQuaternion(_qs);
    if (legs && sitW > 0.001) {
      foldGroundLegs(root, bones, sitW);
      const spine = bones.Spine02 || bones.Spine, neck = bones.neck || bones.Head;
      if (spine && neck) { _e1.set(0, 1, 0.04).applyQuaternion(_qs); aimSegment(spine, neck, _e1, sitW * 0.9); }
      if (bones.Hips) {
        bones.Hips.getWorldPosition(_h);
        const floor = G.world.terrain.heightAt(_h.x, _h.z);
        inst.position.y += (floor + 0.30 * scale - _h.y) * sitW;
        inst.updateMatrixWorld(true);
      }
    }
    // Garment and body, not ankle joints alone: apply the smallest nonpenetrating vertical correction.
    // This also protects the descent/stand-up blend and kneel clips on sloping sand.
    if (dist2(G.camera.position.x, G.camera.position.z, root.position.x, root.position.z) > 900) return;
    let clearance = Infinity;
    for (const { mesh, ids } of groundSamples) {
      mesh.skeleton.update();
      for (const i of ids) {
        mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld);
        clearance = Math.min(clearance, _v.y - G.world.terrain.heightAt(_v.x, _v.z));
      }
    }
    if (clearance < 0.026) { inst.position.y += 0.026 - clearance; inst.updateMatrixWorld(true); }
  }

  function reachHand(side, target, weight) {
    const shoulder = bones[side + 'Arm'], elbow = bones[side + 'ForeArm'], wrist = bones[side + 'Hand'];
    if (!shoulder || !elbow || !wrist || !target || weight < 0.001) return;
    if (target.isObject3D) target.getWorldPosition(_e1); else _e1.copy(target);
    shoulder.getWorldPosition(_h); elbow.getWorldPosition(_k); wrist.getWorldPosition(_f);
    const a = _h.distanceTo(_k), b = _k.distanceTo(_f), distance = _h.distanceTo(_e1);
    if (a < 0.001 || b < 0.001 || distance < 0.001) return;
    const d = clamp(distance, Math.abs(a - b) + 0.002, a + b - 0.002);
    _e2.subVectors(_e1, _h).normalize();
    // Elbow pole stays outward/downward, avoiding straight-arm snaps and inverted elbows.
    root.getWorldQuaternion(_qs);
    _e3.set(side === 'Left' ? 0.7 : -0.7, -0.7, -0.15).applyQuaternion(_qs);
    _e3.addScaledVector(_e2, -_e3.dot(_e2)).normalize();
    const along = (a * a + d * d - b * b) / (2 * d), away = Math.sqrt(Math.max(0, a * a - along * along));
    const desiredElbow = _elbowTarget.copy(_e2).multiplyScalar(along).addScaledVector(_e3, away).add(_h);
    const targetWrist = _wristTarget.copy(_e2).multiplyScalar(d).add(_h);
    const wristQ = wrist.getWorldQuaternion(_wristHold);
    aimSegment(shoulder, elbow, desiredElbow.sub(_h), weight);
    elbow.getWorldPosition(_k); aimSegment(elbow, wrist, targetWrist.sub(_k), weight);
    elbow.getWorldQuaternion(_qp); wrist.quaternion.copy(_qp.invert().multiply(wristQ)); wrist.updateMatrixWorld(true);
  }

  function handContact(dt) {
    const ride = seated && root.parent?.userData.handGrips;
    const sitW = !seated ? (raw.sit ? bw.sit || 0 : groundSitW) : 0;
    if (sitW > 0.01 && legs) {
      legs[0][1].getWorldPosition(lapTargets.left); legs[1][1].getWorldPosition(lapTargets.right);
      lapTargets.left.y += 0.09; lapTargets.right.y += 0.09; lapTargets.weight = sitW;
    }
    const targets = handTargets || ride || (sitW > 0.01 && legs ? lapTargets : null);
    handWeight += ((targets ? (targets.weight ?? 1) : 0) - handWeight) * (1 - Math.exp(-12 * dt));
    if (!targets) return;
    reachHand('Left', targets.left, handWeight); reachHand('Right', targets.right, handWeight);
  }

  /**
   * F21: feet on sloped sand. Runs right after the mixer (the clip pose is fresh every update, so nothing accumulates).
   * Each ankle moves by the terrain height under it relative to the root (a foot in the air reaches down only as it
   * lands); the pelvis drops to the lowest foot's ground (plus a little knee slack on steep sand) so that leg can reach;
   * a two-bone IK (hip-knee-ankle, knee in its animated bend plane, soft reach) puts each ankle on its target; planted
   * soles tilt toward the ground normal. Only for actors standing on the terrain within 30 m of the camera; fades in/out
   * so poses, mounting arcs and knock-downs never pop.
   */
  function footIK(dt, cam) {
    const T = G.world.terrain, p = root.position, ry = p.y;
    const on = actor.footIK && root.parent === G.scene && !seated && dropT === 0 && Math.abs(root.rotation.x) < 0.01 && Math.abs(ry - T.heightAt(p.x, p.z)) < 0.05 && dist2(cam.x, cam.z, p.x, p.z) < 900;
    ikW += ((on ? 1 : 0) - ikW) * (1 - Math.exp(-8 * dt));
    if (ikW < 0.002) { ikW = 0; pelvis = footOff[0] = footOff[1] = 0; return; }
    root.updateMatrixWorld(true);
    let lo = 0;
    const ankle = M ? M.ankle : 0.08, yaw = root.rotation.y;
    for (let i = 0; i < 2; i++) {
      // ground under the ankle; a swinging foot also clears the ground under its toe (a planted sole tilts instead)
      legs[i][2].getWorldPosition(_f); legs[i][3].getWorldPosition(_k);
      const gA = T.heightAt(_f.x, _f.z), gT = T.heightAt(_k.x, _k.z);
      planted[i] = 1 - smoothstep(ankle + 0.02, ankle + 0.3, _f.y - ry);
      let off = clamp((gT > gA ? gA + (gT - gA) * (1 - planted[i]) : gA) - ry, -0.45, 0.45);
      if (off < lo) lo = off;                                               // the pelvis is lowered ahead of a landing foot …
      if (off < 0) off *= 0.3 + 0.7 * planted[i];                           // … which itself reaches down only as it lands
      footOff[i] = off;
    }
    T.normalAt(p.x, p.z, _nrm);
    lo -= 0.1 * Math.min(1, Math.sqrt(Math.max(0, 1 - _nrm.y * _nrm.y)) / _nrm.y / 0.65);  // softer knees on steep sand
    pelvis = lo < pelvis ? Math.max(lo, pelvis - 2 * dt) : pelvis + (lo - pelvis) * (1 - Math.exp(-10 * dt));   // drops at once (≤ 2 m/s), rises softly
    inst.position.y = drop + pelvis * ikW; inst.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const up = legs[i][0], kn = legs[i][1], ft = legs[i][2];
      up.getWorldPosition(_h); kn.getWorldPosition(_k); ft.getWorldPosition(_f);
      ft.getWorldQuaternion(_qf);                                           // keep the clip's foot orientation through the IK
      _t.copy(_f); _t.y += (footOff[i] - pelvis) * ikW;
      const a = _h.distanceTo(_k), b = _k.distanceTo(_f), s1 = (a + b) * 0.999, s0 = Math.min(Math.max((a + b) * 0.95, _h.distanceTo(_f)), s1 - 1e-3);
      let d = Math.max(_h.distanceTo(_t), Math.abs(a - b) + 1e-3);
      if (d > s0) d = s0 + (s1 - s0) * (1 - Math.exp(-(d - s0) / (s1 - s0)));   // soft reach beyond the clip's own: no knee snap
      _u.subVectors(_k, _h); _w.subVectors(_f, _k); _ax.crossVectors(_u, _w);
      // knee hinge: the animated bend plane, blended continuously toward the actor's left as the leg straightens (bend forward)
      _ax.multiplyScalar(1 / (a * b)); _ax.x += Math.cos(yaw) * 0.25; _ax.z -= Math.sin(yaw) * 0.25; _ax.normalize();
      const cur = Math.PI - _u.angleTo(_w), want = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
      _qi.setFromAxisAngle(_ax, cur - want); worldRotate(kn, _qi); kn.updateMatrixWorld(true);
      ft.getWorldPosition(_f); _u.subVectors(_f, _h).normalize(); _w.subVectors(_t, _h).normalize();
      _qi.setFromUnitVectors(_u, _w); worldRotate(up, _qi); up.updateMatrixWorld(true);
      // sole: back to the clip's world orientation, tilted toward the slope while planted
      const pw = planted[i] * ikW;
      _w.set(_nrm.x, _nrm.y, _nrm.z); _qs.setFromUnitVectors(_up, _w); _qi.identity().slerp(_qs, pw);
      _qf.premultiply(_qi); kn.getWorldQuaternion(_qs); ft.quaternion.copy(_qs.invert().multiply(_qf)); ft.updateMatrixWorld(true);
    }
  }

  const actor = {
    root, modelId, height, tintable: !!inst, measure: M,
    pos: root.position,
    get yaw() { return root.rotation.y; },
    set yaw(v) { root.rotation.y = v; yawTarget = v; },
    get clip() { return curName; },
    get seated() { return seated; },
    get overlayClip() { return ovName; },
    /** 0 = full mesh, 1 = LOD1, -1 = no LOD registered */
    get lodLevel() { return lodReg ? lodReg.level : -1; },
    /** F21 foot placement on slopes (on by default; fades out while seated, posed, airborne or far away) */
    footIK: true,
    /** V01 astride riding pose while seated on a saddle (on by default) */
    astride: true,
    has: name => !!raw[name],

    place(x, z, yaw) {
      if (root.parent === G.scene) root.position.set(x, G.world.terrain.heightAt(x, z), z);
      if (yaw !== undefined) { root.rotation.y = yaw; yawTarget = yaw; yawRate = 0; }
    },
    /** Loop a logical clip (ends locomotion mode). */
    play(name, { fade = 0.25, loop = true, speed = 1 } = {}) {
      loco = false;
      const n = resolve(name);
      if (loop) baseLoop = name;
      curName = name; baseRate = 3 / Math.max(0.03, fade);
      setDrop(name);
      if (!mixer || !n) return;
      const r = raw[n];
      const fresh = bw[n] < 0.05 || !loop || bt[n] < 0.5;
      for (const k in bt) bt[k] = k === n ? 1 : 0;
      for (const a of [r.L, r.U]) {
        if (fresh) { a.reset(); a.time = 0; }
        a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = true; a.paused = false;
        a.timeScale = n === 'idle' || !FALLBACK[name] || raw[name] ? speed : speed * (name === 'run' ? 1.6 : 1);
      }
    },
    /** Play a clip once; resolves when finished (sim time). hold = stay on the last frame. */
    playOnce(name, { fade = 0.2, speed = 1, hold = false } = {}) {
      const back = baseLoop;
      actor.play(name, { fade, loop: false, speed });
      const n = resolve(name);
      const dur = tScale(mixer && raw[n] ? raw[n].dur / Math.max(0.01, speed) : 1.0);
      let t = 0;
      return G.scope.task(dt => { t += dt; if (t < dur) return undefined; if (!hold) actor.play(back, { fade: 0.25 }); return true; });
    },
    /** Idle / walk / run blended by ground speed with a shared phase; call every tick while moving. */
    locomotion(speed) {
      if (!loco) { loco = true; baseRate = 6; for (const k in bt) bt[k] = 0; if (mixer) for (const n of ['walk', 'run', 'idle']) if (raw[n]) { raw[n].L.reset(); raw[n].U.reset(); raw[n].L.timeScale = raw[n].U.timeScale = n === 'idle' ? 1 : 0; } }
      locoSpeed = speed; curName = speed < 0.15 ? 'idle' : speed > 3.2 && raw.run ? 'run' : 'walk';
      dropT = 0; dropZT = 0; dropXT = 0;
    },
    /** Upper-body layer over the base (carry a torch, call, aim). null removes it. */
    overlay(name, { fade = 0.25 } = {}) {
      ovRate = 3 / Math.max(0.03, fade);
      for (const k in ot) ot[k] = 0;
      const n = name && raw[name] ? name : null;
      ovName = n; onceTimer++; onceOn = null;          // any overlay call supersedes a running one-shot
      if (!n || !mixer) return;
      const r = raw[n];
      if (!r.O) { r.O = mixer.clipAction(new THREE.AnimationClip(n + ':O', r.clip.duration, r.U.getClip().tracks)); r.O.play(); r.O.enabled = false; ow[n] = 0; }
      if ((ow[n] || 0) < 0.05) { r.O.reset(); r.O.time = 0; }
      r.O.setLoop(THREE.LoopRepeat, Infinity); r.O.paused = false; r.O.timeScale = 1;
      ot[n] = 1;
    },
    /** Upper-body one-shot; resolves when finished (+hold seconds), then returns to the previous overlay. */
    overlayOnce(name, { fade = 0.12, hold = 0, speed = 1 } = {}) {
      const back = onceOn && onceOn === name ? onceBack : ovName, n = name && raw[name] ? name : null;   // a re-trigger keeps the overlay it returns to
      if (!n || !mixer) return G.scope.sleep(tScale(0.35 + hold));
      actor.overlay(n, { fade }); onceOn = n; onceBack = back;
      const r = raw[n]; r.O.reset(); r.O.time = 0; r.O.setLoop(THREE.LoopOnce, 1); r.O.clampWhenFinished = true; r.O.timeScale = speed;   // restarts from frame 0
      let t = 0; const dur = tScale(r.dur / Math.max(0.01, speed) + hold); const tok = ++onceTimer;
      return G.scope.task(dt => {
        if (onceTimer !== tok) return true;           // superseded by another overlay call
        t += dt; if (t < dur) return undefined;
        actor.overlay(back, { fade: 0.25 }); return true;
      });
    },
    /** Damped neck/head turn toward a target (point | Object3D | humanoid | fn) — ≤ 60° yaw, ≤ 30° pitch. */
    lookAt(target) { lookTarget = target || null; lookWT = target ? 1 : 0; },
    /** World-space hand constraints (well rope, tools); null releases them. */
    setHandTargets(targets) { handTargets = targets || null; },
    /** Small talking gesture while a dialogue line is theirs (talk clip as overlay, else procedural head/hand). */
    gesture(on) {
      gesT = on ? 1 : 0;
      if (raw.talk) actor.overlay(on ? 'talk' : null, { fade: 0.3 });
    },
    face(yaw, rate = 8) { yawTarget = yaw; yawRate = rate; },
    faceTo(x, z, rate = 8) { yawTarget = yawOf(x - root.position.x, z - root.position.z); yawRate = rate; },
    /** Socket object parented to a bone; children use world units. */
    socket(name) { return sockets[name] || mkSocket(name); },
    /** Sit on a parent (camel saddle) or back on the terrain (null). */
    sitOn(parent) {
      if (parent) {
        parent.add(root); root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); yawTarget = 0; yawRate = 0;
        seated = true; if (blob) { blob.remove(); blob = null; }
        actor.play('sit', { fade: 0.2 });
      } else {
        if (root.parent !== G.scene) { root.getWorldPosition(_wp); G.scene.add(root); root.position.copy(_wp); }
        seated = false; if (!blob) mkBlob();
        actor.play('idle', { fade: 0.3 });
      }
    },
    setTint(hex) {
      if (!inst) return;
      for (const m of meshes) {
        if (!m.userData.ownMat) { m.material = m.material.clone(); m.material.userData.hsShade = false; G.shade.patch(m.material); m.userData.ownMat = true; ownMats.push(m.material); }
        m.material.color.set(hex === null || hex === undefined ? 0xffffff : hex);
      }
    },
    setVisible(b) { root.visible = b; },
    update(dt) {
      if (yawRate > 0) root.rotation.y = dampAngle(root.rotation.y, yawTarget, yawRate, dt);
      if (root.parent === G.scene) { lodAt.x = root.position.x; lodAt.z = root.position.z; } else { root.getWorldPosition(_wp); lodAt.x = _wp.x; lodAt.z = _wp.z; }
      if (drop !== dropT) drop += (dropT - drop) * Math.min(1, dt * 6);
      if (dropZ !== dropZT) dropZ += (dropZT - dropZ) * Math.min(1, dt * 6);
      if (dropX !== dropXT) dropX += (dropXT - dropX) * Math.min(1, dt * 6);
      if (inst) { inst.position.y = drop; inst.position.z = dropZ; inst.position.x = dropX; }
      if (!mixer) {
        if (placeholder) placeholder.position.y = Math.abs(Math.sin(G.time.now * 8)) * (curName === 'walk' || curName === 'run' ? 0.05 : 0);
        return;
      }
      // half-rate animation for distant characters
      let step = dt;
      const c = G.camera.position;
      if (dist2(c.x, c.z, lodAt.x, lodAt.z) > 1600) { acc += dt; skip = !skip; if (skip) return; step = acc; acc = 0; } else acc = 0;

      // base weights
      const kb = 1 - Math.exp(-baseRate * step), ko = 1 - Math.exp(-ovRate * step);
      if (loco) {
        const s = locoSpeed, hasRun = !!raw.run;
        const kIdle = smoothstep(0.05, 0.6, s), kRun = hasRun ? smoothstep(2.6, 3.9, s) : 0;
        const wMove = Math.min(kIdle, 1);
        const tw = raw.walk ? wMove * (1 - kRun) : 0, tr = hasRun ? wMove * kRun : 0, ti = 1 - tw - tr;
        for (const k in bt) bt[k] = 0;
        if (raw.idle) bt.idle = ti; else bt[idleName] += ti;
        if (raw.walk) bt.walk += tw; if (hasRun) bt.run += tr;
        const Lw = M ? M.walk.stride : WALK_SPEED, Lr = M ? M.run.stride : RUN_SPEED;
        const L = Lw + (Lr - Lw) * kRun;
        const f = clamp(s / L, 0, 2.2 / Math.max(0.5, Lw / WALK_SPEED));     // cycles per second
        phase = (phase + f * step) % 1;
        if (raw.walk) { const a = raw.walk; a.L.time = a.U.time = phase * a.dur; }
        if (hasRun) { const a = raw.run, ph = (phase + (M.run.ph - M.walk.ph) + 1) % 1; a.L.time = a.U.time = ph * a.dur; }
      }
      let sumO = 0;
      for (const n in ow) { ow[n] += ((ot[n] || 0) - ow[n]) * ko; if (ow[n] < 0.002 && !ot[n]) ow[n] = 0; sumO += ow[n]; }
      const oK = sumO > 1 ? 1 / sumO : 1, oSum = Math.min(1, sumO);
      for (const n in raw) {
        const r = raw[n];
        bw[n] += (bt[n] - bw[n]) * kb; if (bw[n] < 0.002 && bt[n] === 0) bw[n] = 0;
        r.L.setEffectiveWeight(bw[n]); r.U.setEffectiveWeight(bw[n] * (1 - oSum));
        r.L.enabled = r.U.enabled = bw[n] > 0;
        if (r.O) { r.O.setEffectiveWeight(ow[n] * oK); r.O.enabled = ow[n] > 0; }
      }
      mixer.update(step);
      if (legs) { footIK(step, c); ridePose(step); }
      groundPose(step);

      // additive head look / talking gesture (only right after a mixer update, so it never accumulates)
      gtime += step;
      lookW += (lookWT - lookW) * (1 - Math.exp(-5 * step));
      gesW += (gesT - gesW) * (1 - Math.exp(-4 * step));
      const head = bones.Head;
      if (head && (lookW > 0.01 || gesW > 0.01)) {
        let ty = 0, tp = 0;
        root.updateWorldMatrix(true, false); const me = root.matrixWorld.elements, myaw = Math.atan2(me[8], me[10]);
        if (lookTarget && lookW > 0.01) {
          const t = lookTarget; let px, py, pz;
          if (t.root) { const gaze = t.socket && t.socket('head'); if (gaze) gaze.getWorldPosition(_v); else { t.root.getWorldPosition(_v); _v.y += (t.height || 1.7) * 0.9; } px = _v.x; py = _v.y; pz = _v.z; }
          else if (t.isObject3D) { t.getWorldPosition(_v); px = _v.x; py = _v.y; pz = _v.z; }
          else { const q = typeof t === 'function' ? t() : (t.pos || t); px = q.x; py = q.y === undefined ? G.world.terrain.heightAt(q.x, q.z) + 1.6 : q.y; pz = q.z; }
          head.getWorldPosition(_wp);
          // A seated eye is below standing eye height; use the animated head and a restrained neck turn under the ghutra.
          const quietPose = seated || groundSitW > 0.1, yawLimit = quietPose ? 0.52 : 1.05, pitchLimit = quietPose ? 0.24 : 0.52;
          ty = clamp(wrapPi(yawOf(px - _wp.x, pz - _wp.z) - myaw), -yawLimit, yawLimit);
          tp = clamp(Math.atan2(py - _wp.y, Math.hypot(px - _wp.x, pz - _wp.z)), -pitchLimit, pitchLimit);
        }
        lookYaw += (ty - lookYaw) * (1 - Math.exp(-6 * step)); lookPitch += (tp - lookPitch) * (1 - Math.exp(-6 * step));
        const gy = Math.sin(gtime * 2.3) * 0.12 * gesW, gp = (Math.sin(gtime * 4.1) * 0.07 - 0.03) * gesW;
        if (raw.talk) { /* clip provides the gesture */ } else if (bones.RightForeArm) bones.RightForeArm.rotation.x += Math.sin(gtime * 3.3) * 0.25 * gesW;
        const yaw = lookYaw * lookW + gy * (raw.talk ? 0 : 1), pitch = lookPitch * lookW + gp * (raw.talk ? 0 : 1);
        if (bones.neck) rotateWorld(bones.neck, yaw * 0.4, pitch * 0.4, myaw);
        rotateWorld(head, yaw * 0.6, pitch * 0.6, myaw);
      }
      handContact(step);
    },
    dispose() {
      if (lodReg) lodReg.remove(); if (blob) blob.remove();
      if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(inst); }
      if (root.parent) root.parent.remove(root);
      for (const m of ownMats) m.dispose();
      // F18: each clone owns its Skeleton (its bone texture is created on first draw) — free it. Bones, bind matrices,
      // geometry and template materials stay shared with the G.assets template and are never disposed here.
      for (const m of meshes) if (m.skeleton) m.skeleton.dispose();
    },
  };
  if (opts.tint && inst) actor.setTint(opts.tint);
  actor.play('idle', { fade: 0 });
  return actor;
}

/** Premultiply a world-space yaw (about +Y, + = turn left) and pitch (+ = look up) onto a bone's local rotation. ry = actor yaw. */
function rotateWorld(bone, yaw, pitch, ry) {
  const p = bone.parent; if (!p) return;
  p.getWorldQuaternion(_qp);
  _qy.setFromAxisAngle(_up, yaw);
  _ax.set(-Math.cos(ry), 0, Math.sin(ry));
  _qx.setFromAxisAngle(_ax, pitch);
  _qd.copy(_qy).multiply(_qx);
  _qa.copy(_qp).invert().multiply(_qd).multiply(_qp);
  bone.quaternion.premultiply(_qa);
}

/** Premultiply a world-space rotation q onto a bone's local rotation (bone world matrices of its parent must be current). */
function worldRotate(bone, q) {
  bone.parent.getWorldQuaternion(_qp);
  _qa.copy(_qp).invert().multiply(q).multiply(_qp);
  bone.quaternion.premultiply(_qa);
}

/** Shared with static crowd baking: anatomical ground-sitting legs, not a buried chair pose. */
export function foldGroundLegs(root, bones, weight = 1) {
  root.updateMatrixWorld(true); root.getWorldQuaternion(_qs);
  const aim = (a, b, direction) => {
    a.getWorldPosition(_h); b.getWorldPosition(_k); _u.subVectors(_k, _h).normalize();
    _qi.setFromUnitVectors(_u, direction.normalize()); _qf.identity().slerp(_qi, weight);
    worldRotate(a, _qf); a.updateMatrixWorld(true);
  };
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1, [thigh, shin, foot, toe] = LEGS[i].map(n => bones[n]);
    if (!thigh || !shin || !foot || !toe) continue;
    _e1.set(side * 0.86, -0.18, 0.64).applyQuaternion(_qs); aim(thigh, shin, _e1);
    _e1.set(-side * 0.8, -0.12, -0.6).applyQuaternion(_qs); aim(shin, foot, _e1);
    _e1.set(-side * 0.65, 0, 0.75).applyQuaternion(_qs); aim(foot, toe, _e1);
  }
}
