/**
 * Third-person camera rig (`G.actors.cam`): orbit follow with a terrain/prop-aware spring arm, soft lock over the shoulder,
 * sky mode + magnet, frame(), cinematic shots, shake, FOV control.
 * `cam.yaw` is the heading the camera LOOKS along (movement is camera-relative). pitch > 0 = camera above looking down.
 * Contract: ARCHITECTURE §5 camera.js, SPEC people/camera.js.
 */
import * as THREE from 'three';
import { clamp, damp, dampAngle, DEG, lerp, pointOf, easeInOut, angleDelta, turnToward, yawOf } from '../core/math.js';

const _t = new THREE.Vector3(), _p = new THREE.Vector3(), _l = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const NONE = [];
let _tout = 0;
/**
 * Segment P(t) = (fx,fy,fz) + (vx,vy,vz)·t, t ∈ [0,tmax], against a prop's oriented box (props.camBlockers entry) grown by m.
 * Returns the entry t (0 when the start is already inside) or -1 when it misses; the exit t is left in _tout.
 */
function segBox(b, m, fx, fy, fz, vx, vy, vz, tmax) {
  const dx = fx - b.x, dz = fz - b.z;
  const ou = dx * b.c - dz * b.s, ov = dx * b.s + dz * b.c, du = vx * b.c - vz * b.s, dv = vx * b.s + vz * b.c;
  let t0 = 0, t1 = tmax;
  for (let k = 0; k < 3; k++) {
    const o = k === 0 ? ou : k === 1 ? fy : ov, d = k === 0 ? du : k === 1 ? vy : dv;
    const lo = k === 0 ? -b.hx - m : k === 1 ? b.y0 - m : -b.hz - m, hi = k === 0 ? b.hx + m : k === 1 ? b.y1 + m : b.hz + m;
    if (d > -1e-9 && d < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  _tout = t1; return t0;
}

function vecOf(v, out) {
  if (typeof v === 'function') v = v();
  if (!v) return out.set(0, 0, 0);
  if (v.isObject3D) return v.getWorldPosition(out);
  if (v.root && v.root.isObject3D) return v.root.getWorldPosition(out);
  if (Array.isArray(v)) return out.set(v[0], v[1], v[2]);
  return out.set(v.x || 0, v.y || 0, v.z || 0);
}

export function createCam(G) {
  const cam = G.camera;
  let target = null, mode = 'follow', yaw = 0, pitch = 12 * DEG, dist = 4.2, distOverride = null, arm = 4.2, idle = 0, sky = false;
  let shakeAmp = 0, shakeT = 0, shakeDur = 0;
  let fovBase = 55, fovTarget = null, fovRate = 4, fovCur = 55;
  // soft lock / frame / magnet / cine hold / release blend
  let lock = null, lockK = 0, shoulder = 0.6, nudgeY = 0, nudgeP = 0;
  let fr = null, mDir = null, mCone = 0;
  let hold = null, skipAll = false, bDur = 0, bT = 0;
  const focus = new THREE.Vector3(), bP = new THREE.Vector3(), bQ = new THREE.Quaternion();

  const setFovNow = f => { cam.fov = fovCur = f; cam.updateProjectionMatrix(); };
  G.events.on('resize', e => { fovBase = e.portrait ? 72 : 55; if (!fovTarget && mode !== 'cine') setFovNow(fovBase); });

  const C = {
    get yaw() { return yaw; }, set yaw(v) { yaw = v; },
    get pitch() { return pitch; }, set pitch(v) { pitch = v; },
    get mode() { return mode; },
    get locked() { return !!lock; },
    follow(t = G.actors.player) { target = t; mode = 'follow'; },
    setDistance(d) { distOverride = d === null || d === undefined ? null : d; },
    setFov(deg, s = 0.5) { fovTarget = deg || null; fovRate = 4 / Math.max(0.05, s); },
    forward(out) { return cam.getWorldDirection(out); },
    shake(amplitude = 0.15, duration = 0.4) { if (amplitude * duration >= shakeAmp * shakeT) { shakeAmp = amplitude; shakeDur = duration; shakeT = duration; } },
    /** angle (rad) between the view direction and a world point / a direction fn returning a unit Vector3 */
    aimError(t) {
      cam.getWorldDirection(_d);
      if (typeof t === 'function') { const v = t(); if (v && v.isVector3 && Math.abs(v.lengthSq() - 1) < 0.01) return _d.angleTo(v); }
      const p = pointOf(t); _l.set(p.x - cam.position.x, p.y - cam.position.y, p.z - cam.position.z).normalize();
      return _d.angleTo(_l);
    },
    skyMode(on) { sky = !!on; if (on) { lock = null; fr = null; } },
    /** pull the view toward dirFn() (unit Vector3) inside a cone (degrees); null / 0 removes it */
    magnet(dirFn, coneDeg = 12) { mDir = dirFn || null; mCone = (coneDeg || 0) * DEG; },
    /** aim at a target in 0.4 s, ±20° nudge, over the right shoulder; null releases */
    softLock(t, o = {}) { lock = t || null; shoulder = o.shoulder === undefined ? 0.6 : o.shoulder; nudgeY = nudgeP = 0; fr = null; if (t) sky = false; },
    /** ease the view onto a target without taking control (any look input cancels) */
    frame(t, { duration = 1.2 } = {}) {
      if (mode !== 'follow' || !target) return Promise.resolve();
      const raw = typeof t === 'function' ? t() : t, p = pointOf(raw), pl = target.pos || target.position;
      const d = G.state.fastText ? 0.05 : duration;
      const ty = yawOf(p.x - pl.x, p.z - pl.z), h = Math.hypot(p.x - pl.x, p.z - pl.z);
      // a point of interest {x,z} has no height: aim at the ground there (+1 m), never at world y = 0 (V05: 36° down at the camp well, 10° up at the last one)
      const noY = raw && !raw.isObject3D && !Array.isArray(raw) && typeof raw.y !== 'number';
      const py = noY ? G.world.terrain.heightAt(p.x, p.z) + 1.0 : p.y;
      // such a POI frames within the normal follow band (a fire down a slope must not tip the view to 30°)
      const tp = clamp(Math.atan2(focus.y - py, Math.max(2, h * 0.4 + 3)) + 0.12, noY ? 4 * DEG : -10 * DEG, noY ? 15 * DEG : 40 * DEG);
      fr = { y0: yaw, dy: angleDelta(yaw, ty), p0: pitch, dp: tp - pitch, t: 0, d };
      return G.scope.sleep(d);
    },
    cut(pos, look) { mode = 'cine'; hold = { pos, look }; vecOf(pos, cam.position); cam.lookAt(vecOf(look, _l)); },
    /** return to the follow rig, blending from the held shot */
    release({ duration = 1.0 } = {}) {
      if (mode !== 'cine') return;
      bP.copy(cam.position); bQ.copy(cam.quaternion); bT = 0; bDur = G.state.fastText ? 0.05 : duration; hold = null;
      mode = 'follow'; C.snap(); fovTarget = null; fovRate = 3;
    },
    /**
     * Shots: [{ pos, look, dur, ease?, fov?, cut?, skippable? }] — pos/look: [x,y,z] | Vector3 | Object3D | fn (moving subjects).
     * Each shot moves from the previous shot's end (or the current camera) unless `cut`. Holds the last shot until release().
     */
    async cine(shots) {
      mode = 'cine'; skipAll = false; hold = null; lock = null; fr = null; bDur = 0;
      const fromP = new THREE.Vector3().copy(cam.position), fromL = new THREE.Vector3();
      cam.getWorldDirection(fromL).multiplyScalar(10).add(cam.position);
      for (const s of shots) {
        const ease = s.ease || easeInOut, fov0 = cam.fov, fov1 = s.fov || cam.fov;
        if (s.cut) { vecOf(s.pos, fromP); vecOf(s.look, fromL); }
        let t = 0; const dur = G.state.fastText ? Math.min(0.05, s.dur) : (skipAll ? 0.05 : s.dur);
        await G.scope.task(dt => {
          t += dt; const k = ease(clamp(dur <= 0 ? 1 : t / dur, 0, 1));
          vecOf(s.pos, _p); vecOf(s.look, _l);
          cam.position.lerpVectors(fromP, _p, s.cut ? 1 : k);
          _t.lerpVectors(fromL, _l, s.cut ? 1 : k); cam.lookAt(_t);
          if (fov1 !== fov0) { cam.fov = fovCur = lerp(fov0, fov1, k); cam.updateProjectionMatrix(); }
          if (t >= dur) return true;
          if (t > 0.4 && s.skippable !== false && G.input.pressed('skip')) { skipAll = true; return true; }
          return undefined;
        });
        vecOf(s.pos, fromP); vecOf(s.look, fromL);
      }
      const last = shots[shots.length - 1];
      if (last && mode === 'cine') hold = { pos: last.pos, look: last.look };
    },
    lateUpdate(dt) {
      const BLK = G.world.props.camBlockers || NONE;
      if (mode === 'cine') {
        for (let i = 0; i < BLK.length; i++) BLK[i].want = 0;
        if (hold) { vecOf(hold.pos, _p); vecOf(hold.look, _l); cam.position.copy(_p); cam.lookAt(_l); }
        applyShake(dt); return;
      }
      if (!target) { for (let i = 0; i < BLK.length; i++) BLK[i].want = 0; applyShake(dt); return; }
      const pl = G.actors.player, mounted = !!pl.mounted;
      const lk = G.input.look, sens = sky ? 0.6 : 1, T = G.world.terrain;
      const looked = lk.x !== 0 || lk.y !== 0;
      if (looked) { idle = 0; if (fr) fr = null; } else idle += dt;

      if (lock) {
        // aim at the target (0.4 s), keep a ±20° / ±10° nudge from the thumb
        const tp0 = target.pos || target.position, lp = pointOf(lock);
        nudgeY = clamp(nudgeY - lk.x * 0.6, -20 * DEG, 20 * DEG); nudgeP = clamp(nudgeP + lk.y * 0.6, -10 * DEG, 10 * DEG);
        if (!looked) { nudgeY = damp(nudgeY, 0, 0.5, dt); nudgeP = damp(nudgeP, 0, 0.5, dt); }
        const ty = yawOf(lp.x - tp0.x, lp.z - tp0.z) + nudgeY;
        yaw = dampAngle(yaw, ty, 9, dt);
        pitch = damp(pitch, clamp(Math.atan2(focus.y - lp.y, Math.max(3, Math.hypot(lp.x - tp0.x, lp.z - tp0.z) + 3)) + 0.1 - nudgeP, -10 * DEG, 40 * DEG), 6, dt);
      } else {
        yaw -= lk.x * sens;
        pitch = clamp(pitch - lk.y * sens, sky ? -85 * DEG : -15 * DEG, sky ? 10 * DEG : 65 * DEG);
        if (fr) {
          fr.t += dt; const k = easeInOut(clamp(fr.t / fr.d, 0, 1));
          yaw = fr.y0 + fr.dy * k; pitch = fr.p0 + fr.dp * k; if (fr.t >= fr.d) fr = null;
        } else if (!sky) {
          if (mounted) { if (idle > 1.0 && pl.speed > 0.3) { const dd = Math.abs(angleDelta(yaw, pl.yaw)); yaw = turnToward(yaw, pl.yaw, Math.min(90 * DEG, dd * 4) * dt); } }
          else if (idle > 1.5 && pl.speed > 0.5) yaw = dampAngle(yaw, pl.yaw, 0.9, dt);
        }
        if (sky && mDir) {                                      // magnet: gentle pull toward the star inside the cone
          const d = mDir();
          if (d && d.isVector3) {
            const ty = Math.atan2(d.x, d.z), te = Math.asin(clamp(d.y, -1, 1));
            cam.getWorldDirection(_d); const err = _d.angleTo(d);
            if (err < mCone) {
              const k = 1 - Math.exp(-2.6 * (1 - err / mCone) * dt);
              yaw += angleDelta(yaw, ty) * k; pitch += (-te - pitch) * k;
            }
          }
        }
      }
      lockK = damp(lockK, lock ? 1 : 0, 6, dt);
      const want = sky ? 1.6 : lerp(distOverride !== null ? distOverride : (mounted ? 7.5 : dist), 3.0, lockK);
      const tp = target.pos || target.position, h = mounted ? 2.6 : 1.45;
      focus.set(damp(focus.x, tp.x, 18, dt), damp(focus.y, tp.y + h, 10, dt), damp(focus.z, tp.z, 18, dt));
      const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
      const sh = shoulder * lockK;
      if (sky) {
        _p.set(focus.x - sy * want, focus.y + 0.25, focus.z - cy * want);
        const g = T.heightAt(_p.x, _p.z) + 0.6; if (_p.y < g) _p.y = g;
        arm = want;
      } else {
        // spring arm: shorten at the first sample under the dunes / inside a prop, grow back slowly
        const dx = -sy * cp, dy = sp, dz = -cy * cp, rx = -cy, rz = sy;
        let allowed = want; const cols = G.world.props.colliders;
        for (let i = 1; i <= 8; i++) {
          const t = want * i / 8, k = i / 8, px = focus.x + dx * t + rx * sh * k, pz = focus.z + dz * t + rz * sh * k, py = focus.y + dy * t;
          const g = T.heightAt(px, pz) + 0.6; let bad = py < g;
          if (!bad && py < g + 3) for (let j = 0; j < cols.length; j++) { const c = cols[j]; if (c.nc) continue; const ex = px - c.x, ez = pz - c.z, r = c.r + 0.35; if (ex * ex + ez * ez < r * r) { bad = true; break; } }
          if (bad) { allowed = Math.max(0.9, want * (i - 1) / 8); break; }
        }
        // large props (tents, well, sitting camels) are oriented boxes: the arm stops 0.45 m before the cloth; when the hero stands
        // against it (nothing fits in front) the arm keeps 0.9 m and the box fades (below)
        for (let i = 0; i < BLK.length; i++) {
          const b = BLK[i], sx0 = focus.x + rx * sh, sz0 = focus.z + rz * sh;
          if ((sx0 - b.x) * (sx0 - b.x) + (sz0 - b.z) * (sz0 - b.z) > (want + b.hx + b.hz + 1) * (want + b.hx + b.hz + 1)) continue;
          let lim = segBox(b, 0.45, sx0, focus.y, sz0, dx, dy, dz, want);
          if (lim < 0) continue;
          if (lim === 0) { lim = segBox(b, 0.05, sx0, focus.y, sz0, dx, dy, dz, want); lim = lim < 0 ? want : lim - 0.1; }
          lim = Math.max(0.9, lim); if (lim < allowed) allowed = lim;
        }
        arm = allowed < arm ? damp(arm, allowed, 16, dt) : damp(arm, allowed, 2.5, dt);
        if (arm > want) arm = want;
        _p.set(focus.x + dx * arm + rx * sh, focus.y + dy * arm, focus.z + dz * arm + rz * sh);
        const g = T.heightAt(_p.x, _p.z) + 0.6; if (_p.y < g) _p.y = g;
      }
      cam.position.copy(_p);
      for (let i = 0; i < BLK.length; i++) {
        const b = BLK[i]; b.want = 0; if (sky) continue;
        if ((_p.x - b.x) * (_p.x - b.x) + (_p.z - b.z) * (_p.z - b.z) > (b.hx + b.hz + 2) * (b.hx + b.hz + 2)) continue;
        if (segBox(b, 0.45, _p.x, _p.y, _p.z, 0, 0, 0, 0) >= 0) { b.want = 1; continue; }             // the lens itself is inside / right at the cloth
        for (let k = 0; k < 2; k++) {                                                                    // head and chest of the hero behind the cloth
          const ty = focus.y - k * 0.6;
          if (segBox(b, 0.05, _p.x, _p.y, _p.z, focus.x - _p.x, ty - _p.y, focus.z - _p.z, 1) >= 0) { b.want = 1; break; }
        }
      }
      if (sky) _t.set(_p.x + sy * Math.cos(-pitch), _p.y + Math.sin(-pitch), _p.z + cy * Math.cos(-pitch));
      else if (lockK > 0.01) { _t.set(focus.x + (-cy) * sh + sy * cp * 8 * lockK, focus.y - sp * 8 * lockK, focus.z + sy * sh + cy * cp * 8 * lockK); _t.lerpVectors(focus, _t, lockK); }
      else _t.copy(focus);
      cam.lookAt(_t);
      if (bDur > 0) {                                           // blend out of a cinematic shot
        bT += dt; const k = easeInOut(clamp(bT / bDur, 0, 1));
        _q.copy(cam.quaternion); cam.position.lerpVectors(bP, cam.position, k); cam.quaternion.copy(bQ).slerp(_q, k);
        if (bT >= bDur) bDur = 0;
      }
      const ft = fovTarget || fovBase;
      if (Math.abs(fovCur - ft) > 0.01) { fovCur = damp(fovCur, ft, fovRate, dt); if (Math.abs(fovCur - ft) < 0.02) fovCur = ft; cam.fov = fovCur; cam.updateProjectionMatrix(); }
      applyShake(dt);
    },
    snap() {
      const tp = target && (target.pos || target.position);
      if (tp) {
        const mounted = !!G.actors.player.mounted;
        focus.set(tp.x, tp.y + (mounted ? 2.6 : 1.45), tp.z); yaw = G.actors.player.yaw; pitch = 12 * DEG; idle = 0; fr = null;
        arm = mounted ? 7.5 : (distOverride !== null ? distOverride : dist);
      }
    },
  };
  function applyShake(dt) {
    if (shakeT <= 0) return;
    shakeT -= dt; const a = shakeAmp * Math.max(0, shakeT / shakeDur);
    cam.position.x += (G.vrng.next() - 0.5) * a; cam.position.y += (G.vrng.next() - 0.5) * a; cam.position.z += (G.vrng.next() - 0.5) * a;
    if (shakeT <= 0) shakeAmp = 0;
  }
  G.events.on('level:loaded', () => { target = target || G.actors.player; C.snap(); });
  G.events.on('beat:start', e => { if (e.resumed) { mode = 'follow'; sky = false; lock = null; hold = null; C.snap(); } });
  target = null;
  C.follow(G.actors.player);
  return C;
}
