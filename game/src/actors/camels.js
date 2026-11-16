/**
 * Camel registry (`G.actors.camels`) — owner of every camel: a quadruped body + a small brain.
 *   camels.spawn(id, { x, z, yaw, scale, tint, rig, model }) → camel (idempotent per id)
 *   camel.goTo(x, z, {speed, stop}) → Promise · follow(target, {dist, speed}) · flee(from, dist) → Promise · stop()
 *   camel.ridden (brain suspended; rider calls place/setSpeed) · camel.driven (caravan drives it) · camel.kneeling
 *   camels.get · all · remove · clear · onLevelUnload
 */
import * as THREE from 'three';
import { createQuadruped } from './quadruped.js';
import { damp, dampAngle, yawOf, clamp } from '../core/math.js';

const IDLE_POSES = ['shake', 'lowerHead', 'raiseHead'];
const WADHA_WHITE = new THREE.Color(1.34, 1.31, 1.24);

export function createCamels(G) {
  const map = new Map(); const list = [];

  function brainify(c) {
    const bodyUpdate = c.update.bind(c);
    const bodyPose = c.pose ? c.pose.bind(c) : null;
    const bodyLook = c.lookAt ? c.lookAt.bind(c) : null;
    c.root.rotation.order = 'YXZ';
    let mode = 'idle', tx = 0, tz = 0, tgt = null, fdist = 3, fspeed = 2.4, stopD = 1, spd = 2.4;
    let token = 0, resolve = null, cur = 0, pitch = 0, idleT = 2 + G.vrng.next() * 5, fx = 0, fz = 0, kneel = false, posing = false;
    c.ridden = false; c.driven = false; c.id = c.id || '';

    Object.defineProperty(c, 'kneeling', { get: () => kneel, configurable: true });
    c.pose = (name, o) => {
      if (name === 'kneel') kneel = true; else if (name === 'rise') kneel = false;
      if (kneel && mode !== 'idle' && name === 'kneel') { mode = 'idle'; fin(); }
      posing = true;
      const p = bodyPose ? bodyPose(name, o) : G.scope.sleep((o && o.duration) || 1.2);
      const done = () => { posing = false; idleT = 3 + G.vrng.next() * 5; };
      p.then(done, done);
      return G.state.fastText ? G.scope.sleep(0.05) : p;
    };
    c.lookAt = t => { if (bodyLook) bodyLook(t); };
    const fin = () => { const r = resolve; resolve = null; if (r) r(); };
    const begin = m => { token++; fin(); mode = m; };
    let pend = false;
    const mkPromise = () => { pend = true; const t = token; return new Promise(res => { resolve = () => { pend = false; res(true); }; void t; }); };
    const sync = p => G.scope.until(() => !pend).then(() => p);   // keeps the promise sim-aware (abort-safe)

    c.goTo = (x, z, { speed = 2.4, stop = 1 } = {}) => {
      begin('goto'); tx = x; tz = z; spd = speed; stopD = stop;
      if (G.state.fastText) { c.place(x, z); mode = 'idle'; c.setSpeed(0); cur = 0; return G.scope.sleep(0.05); }
      const p = mkPromise(); return sync(p);
    };
    c.follow = (target, { dist = 3, speed = 2.4 } = {}) => { begin('follow'); tgt = target; fdist = dist; fspeed = speed; };
    c.flee = (from, dist = 25) => {
      begin('flee'); const f = from && (from.pos || from.position || from);
      fx = f ? f.x : c.pos.x; fz = f ? f.z : c.pos.z; spd = 5.2; stopD = dist;
      let dx = c.pos.x - fx, dz = c.pos.z - fz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      tx = fx + dx * dist; tz = fz + dz * dist;
      if (G.state.fastText) { c.place(tx, tz); mode = 'idle'; c.setSpeed(0); cur = 0; return G.scope.sleep(0.05); }
      c.face(yawOf(dx, dz), 6);
      return sync(mkPromise());
    };
    c.stop = () => { begin('idle'); };

    function steer(dx, dz, dt) {   // returns heading yaw avoiding colliders crudely
      const cols = G.world.props && G.world.props.colliders;
      if (cols) {
        const px = c.pos.x, pz = c.pos.z;
        for (let i = 0; i < cols.length; i++) {
          const o = cols[i]; const ox = px - o.x, oz = pz - o.z, rr = o.r + 1.6;
          const d2 = ox * ox + oz * oz;
          if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2), w = (1 - d / rr) * 2.2; dx += ox / d * w * 3; dz += oz / d * w * 3; }
        }
      }
      void dt; return yawOf(dx, dz);
    }

    c.update = dt => {
      if (!c.ridden && !c.driven) {
        let want = 0;
        if (kneel) { mode = mode === 'goto' || mode === 'flee' ? 'idle' : mode; }
        if (mode === 'goto' || mode === 'flee') {
          const dx = tx - c.pos.x, dz = tz - c.pos.z; const d = Math.hypot(dx, dz);
          if (d <= (mode === 'goto' ? stopD : 1.2)) { mode = 'idle'; fin(); }
          else { want = mode === 'goto' ? Math.min(spd, 0.6 + d * 0.9) : spd; c.face(steer(dx, dz, dt), 4); }
        } else if (mode === 'follow' && tgt) {
          const t = tgt.pos || tgt.position || tgt; const dx = t.x - c.pos.x, dz = t.z - c.pos.z; const d = Math.hypot(dx, dz);
          if (d > fdist + 0.4) { want = Math.min(fspeed, 0.5 + (d - fdist) * 0.9); c.face(steer(dx, dz, dt), 4); }
        }
        cur = damp(cur, want, want > cur ? 2.5 : 4, dt);
        if (cur < 0.05 && want === 0) cur = 0;
        if (cur > 0) {
          const y = c.yaw; const s = cur * dt;
          c.place(c.pos.x + Math.sin(y) * s, c.pos.z + Math.cos(y) * s);
        }
        c.setSpeed(cur);
        // idle behaviours
        if (mode === 'idle' && cur === 0 && !kneel && !posing) {
          idleT -= dt;
          if (idleT <= 0) {
            idleT = 3 + G.vrng.next() * 6; const r = G.vrng.next();
            if (r < 0.5 && bodyPose) { const n = IDLE_POSES[(G.vrng.next() * IDLE_POSES.length) | 0]; c.pose(n, { duration: 1.4 }); }
            else c.face(c.yaw + (G.vrng.next() - 0.5) * 1.6, 1.5);
          }
        }
      }
      {   // Rider and free camel use the same terrain pitch; mounting must not flatten the animal
        const T = G.world.terrain; const y = c.yaw;
        const ps = clamp((T.heightAt(c.pos.x + Math.sin(y) * 1.4, c.pos.z + Math.cos(y) * 1.4) - T.heightAt(c.pos.x - Math.sin(y) * 1.4, c.pos.z - Math.cos(y) * 1.4)) / 2.8, -0.6, 0.6);
        pitch = dampAngle(pitch, -Math.atan(ps) * 0.55, 4, dt); c.root.rotation.x = pitch;
      }
      bodyUpdate(dt);
    };
    return c;
  }

  return {
    spawn(id, { x = 0, z = 0, yaw = 0, scale = 1, tint = null, rig = 'skinned', model = 'camel' } = {}) {
      if (map.has(id)) this.remove(id);
      const a = createQuadruped(G, model, { tint: tint || undefined, scale, rig, name: id });
      // الوضحا is the WHITE camel: lift the cream coat (material colour above 1 brightens the painted texture)
      if (id === 'wadha' && !tint && a.setTint) a.setTint(WADHA_WHITE);
      a.id = id; a.place(x, z, yaw);
      brainify(a);
      map.set(id, a); list.push(a);
      return a;
    },
    get: id => map.get(id) || null,
    get all() { return list; },
    remove(id) { const a = map.get(id); if (!a) return; a.dispose(); map.delete(id); list.splice(list.indexOf(a), 1); },
    clear() { for (const a of list) a.dispose(); map.clear(); list.length = 0; },
    onLevelUnload() { this.clear(); },
    update(dt) { for (let i = 0; i < list.length; i++) list[i].update(dt); },
  };
}
