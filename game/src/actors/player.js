/**
 * Player controller (Dhari). On foot / mounted / scripted / down. Numbers: DESIGN §4 (walk 2.0, run 5.0, camel 2.4 / 5.5,
 * turn 540°/s, camel steer 75°/s). Contract: ARCHITECTURE §5 player.js, SPEC people/player.js.
 *
 *   spawn(x,z,yaw) teleport(x,z,yaw) push(vx,vz) limit(tag,{speed,speedMul,run}) → {remove()} mount(camel) dismount()
 *   knockdown(s,{slide}) equip(item|null,{lit}) swing() setScripted(on) moveTo(x,z,{speed,stop}) trail.behind(d,out)
 *   fence(x,z,r) → {remove()}   soft edge (camp at night): outward steps beyond r are resisted, the overshoot eases back
 *   moving       true while the stick drives the hero (|stick| > MOVE_STICK) — the ONE definition of "moving" (steady.walk, ch5)
 *   limit(tag,{pace})            pace (m/s): any stick that moves the hero moves him at exactly this speed (c5_walk)
 * Operations (mount / dismount) own a token: a beat end cancels the running one cleanly (onBeatEnd), and a stale
 * cancellation never touches a newer operation. The swing is time-gated (SWING_RECOVER), never tied to the clip's end.
 */
import * as THREE from 'three';
import { createHumanoid } from './humanoid.js';
import { damp, turnToward, fwd, right, yawOf, clamp, DEG, angleDelta, smoothstep } from '../core/math.js';

const WALK = 2.0, RUN = 5.0, CAMEL_WALK = 2.4, CAMEL_TROT = 5.5;
/** F03: the stick moves the hero above this magnitude (effective, after the touch dead zone) — shared by steady.walk and ch5 */
export const MOVE_STICK = 0.08;
/** F06: a new swing is possible this long after the last one; a press during it is buffered and fires when it ends */
export const SWING_RECOVER = 0.45;
const EDGE_RELAX = 4, EDGE_SOFT = 0.6;              // F29 fence: overshoot relaxes at 4/s; outward push fades over ~0.6 m
const swallow = p => { if (p && p.catch) p.catch(() => {}); return p; };
const _f = { x: 0, y: 0, z: 0 }, _r = { x: 0, y: 0, z: 0 }, _o = { x: 0, z: 0 };
const _w = new THREE.Vector3(), _w2 = { x: 0, z: 0 };

export function createPlayer(G) {
  /** @type {any} */
  let actor = null;
  const pos = new THREE.Vector3();
  const pv = { x: 0, z: 0 };                       // decaying push impulse (m/s)
  const limits = [];
  const trail = { n: 64, xs: new Float32Array(64), zs: new Float32Array(64), head: 0, count: 0, lx: 1e9, lz: 1e9,
    /** point `d` metres back along the walked path (from the hero) → out {x,z} */
    behind(d, out) {
      let px = pos.x, pz = pos.z, rem = d;
      for (let i = 0; i < trail.count; i++) {
        const k = (trail.head - 1 - i + trail.n * 2) % trail.n, x = trail.xs[k], z = trail.zs[k];
        const seg = Math.hypot(x - px, z - pz);
        if (seg >= rem && seg > 1e-6) { const t = rem / seg; out.x = px + (x - px) * t; out.z = pz + (z - pz) * t; return out; }
        rem -= seg; px = x; pz = z;
      }
      out.x = px; out.z = pz; return out;
    },
    reset(x, z) { trail.head = 0; trail.count = 0; trail.lx = x; trail.lz = z; },
  };
  let yaw = 0, speed = 0, mode = 'foot', mounted = null, stride = 0, foot = 0;
  let heldPose = null, job = null, aim = null, dn = null, itemName = null, itemObj = null, flameH = null, boundsT = -99, seq = 0;
  let op = null;                                   // running mount/dismount { kind, tok, camel, wasRidden, wasKneel }
  let swingT = -99, swingQ = false, swingTok = 0, swingAnim = false;
  let fence = null, moving = false, gs = 0;        // gs = ground speed actually achieved after collisions (steps, gait)
  let lmSpeed = Infinity, lmMul = 1, lmRun = true, lmPace = Infinity;

  const tw = (d, fn) => (G.state.fastText ? G.scope.tween(0.05, fn) : G.scope.tween(d, fn));
  let realModel = false;     // the hero was built from the real model (false: capsule stand-in because the model had failed to load)
  const ensure = () => { if (!actor) { realModel = !!G.assets.model('dhari'); actor = createHumanoid(G, 'dhari', { name: 'dhari', pinLod: true }); actor.root.rotation.order = 'YXZ'; } return actor; };

  function aggregate() {
    lmSpeed = Infinity; lmMul = 1; lmRun = true; lmPace = Infinity;
    for (let i = 0; i < limits.length; i++) {
      const l = limits[i];
      if (l.speed !== undefined && l.speed < lmSpeed) lmSpeed = l.speed;
      if (l.pace !== undefined && l.pace < lmPace) lmPace = l.pace;
      if (l.speedMul !== undefined) lmMul *= l.speedMul;
      if (l.run === false) lmRun = false;
    }
  }
  function levelBounds() { const L = G.world.level && G.world.level.current; return L && L.bounds; }
  /** push (x,z) out of props / NPCs / camels (hero radius included) */
  function collide(o, skipCamel) {
    const cols = G.world.props.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i], r = c.r + 0.35, dx = o.x - c.x, dz = o.z - c.z, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); o.x = c.x + dx / d * r; o.z = c.z + dz / d * r; }
    }
    const np = G.actors.npcs && G.actors.npcs.all;
    if (np) for (let i = 0; i < np.length; i++) {
      const n = np[i]; if (n.riding) continue;
      const p = n.pos, dx = o.x - p.x, dz = o.z - p.z, d2 = dx * dx + dz * dz, r = 0.6;
      if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); o.x = p.x + dx / d * r; o.z = p.z + dz / d * r; }
    }
    const cm = G.actors.camels && G.actors.camels.all;
    if (cm) for (let i = 0; i < cm.length; i++) {
      const c = cm[i]; if (c === skipCamel || c.ridden) continue;
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      for (let k = -1; k <= 1; k += 2) {
        const cx = c.pos.x + s * 0.7 * k, cz = c.pos.z + co * 0.7 * k, dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz, r = 0.95;
        if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); o.x = cx + dx / d * r; o.z = cz + dz / d * r; }
      }
    }
    return o;
  }
  /** soft boundary: ease back inside and emit player:bounds (≤ once per 6 s) */
  function bounds(px, pz, dt) {
    const B = levelBounds(); if (!B) return;
    const dx = px - B.x, dz = pz - B.z, d = Math.hypot(dx, dz);
    if (d <= B.r) return;
    const k = Math.min(1, dt * 1.5) * (d - B.r + 0.5);
    _o.x -= dx / d * k; _o.z -= dz / d * k;
    if (G.time.now - boundsT > 6) { boundsT = G.time.now; G.events.emit('player:bounds', { x: px, z: pz, r: B.r }); }
  }
  /** F29: soft edge of a fence — first-order and dt-stable: no bounce with constant input, easy to walk back in */
  function edge(px, pz, dt) {
    const F = fence; if (!F) return;
    const dx = _o.x - F.x, dz = _o.z - F.z, d = Math.hypot(dx, dz);
    if (d <= F.r || d < 1e-6) return;
    const o0 = Math.max(0, Math.hypot(px - F.x, pz - F.z) - F.r), step = d - F.r - o0;     // overshoot before, radial step now
    let o = o0 * Math.exp(-EDGE_RELAX * dt) + (step > 0 ? step * Math.exp(-o0 / EDGE_SOFT) : step);
    if (o < 0) o = 0;
    const k = (F.r + o) / d; _o.x = F.x + dx * k; _o.z = F.z + dz * k;
  }
  /** F02: undo the running mount/dismount (beat end / abort) — leaves hero and camel in one consistent state */
  function cancelOp() {
    const o = op; if (!o) return;
    op = null; seq++;
    if (job) { job.state = 2; job = null; }
    const c = o.camel; speed = 0;
    if (mounted === c) {                                   // already in the saddle: stay mounted, she stands up
      if (actor && actor.root.parent !== c.saddle) actor.sitOn(c.saddle);
      c.ridden = true; yaw = c.yaw; pos.copy(c.pos); mode = 'mounted';
      if (c.kneeling) swallow(c.pose('rise', { duration: 0.5 }));
    } else {                                               // on foot: she is free again (as the mount found her)
      if (actor) { if (actor.seated) actor.sitOn(null); actor.root.rotation.x = 0; actor.place(pos.x, pos.z, yaw); actor.play('idle', { fade: 0.2 }); }
      c.ridden = o.kind === 'mount' ? o.wasRidden : false; mode = 'foot';
      if (c.kneeling && !(o.kind === 'mount' && o.wasKneel)) swallow(c.pose('rise', { duration: 0.5 }));
    }
  }
  /** the swing itself (gameplay event + restartable upper-body clip) */
  function doSwing() {
    swingQ = false; swingT = G.time.now;
    const w = G.actors.wolves && G.actors.wolves.next; let a = null;
    if (w && w.pos) {
      const ay = yawOf(w.pos.x - pos.x, w.pos.z - pos.z);
      if (Math.abs(angleDelta(G.actors.cam.yaw, ay)) <= 60 * DEG) a = ay;
    }
    if (a === null) a = speed < 0.5 && !mounted ? G.actors.cam.yaw : yaw;
    aim = { yaw: a, t: 0.25 };
    G.events.emit('player:swing', { x: pos.x, z: pos.z, yaw: a });
    const tok = ++swingTok; swingAnim = true;
    const end = () => { if (swingTok === tok) swingAnim = false; };
    const p = actor.overlayOnce('swing', { hold: 0.5 }); p.then(end, end);
    return p;
  }
  function stepEvent(run, camel) {
    foot = 1 - foot;
    G.events.emit('player:step', { x: pos.x, z: pos.z, yaw, foot: foot ? 'R' : 'L', surface: G.world.terrain.surfaceAt(pos.x, pos.z), run, camel: !!camel });
  }
  function record() {
    if (Math.hypot(pos.x - trail.lx, pos.z - trail.lz) >= 0.5) {
      trail.xs[trail.head] = pos.x; trail.zs[trail.head] = pos.z; trail.head = (trail.head + 1) % trail.n;
      if (trail.count < trail.n) trail.count++;
      trail.lx = pos.x; trail.lz = pos.z;
    }
  }
  function leftOf(camel, out, d) { right(camel.yaw, _r); out.x = camel.pos.x - _r.x * d; out.z = camel.pos.z - _r.z * d; return out; }
  function hop(toX, toY, toZ, dur) {          // world-space arc for the actor root
    const r = actor.root; const x0 = r.position.x, y0 = r.position.y, z0 = r.position.z;
    return tw(dur, k => { r.position.set(x0 + (toX - x0) * k, y0 + (toY - y0) * k + Math.sin(k * Math.PI) * 0.45, z0 + (toZ - z0) * k); });
  }

  const P = {
    get actor() { return actor; },
    pos,
    get yaw() { return yaw; }, set yaw(v) { yaw = v; },
    get speed() { return speed; },
    get mode() { return mode; },
    get mounted() { return mounted; },
    get item() { return itemName; },
    get trail() { return trail; },
    get limits() { return limits; },

    spawn(x, z, y = 0) {
      if (actor && !realModel && G.assets.model('dhari')) { actor.dispose(); actor = null; }   // the failed model arrived: swap the stand-in at the level (re)build
      ensure();
      P.onLevelUnload();
      G.scene.add(actor.root);
      P.teleport(x, z, y);
      actor.play('idle', { fade: 0 });
    },
    teleport(x, z, y) {
      heldPose = null;
      if (mounted) { mounted.place(x, z, y === undefined ? mounted.yaw : y); pos.copy(mounted.pos); if (y !== undefined) yaw = y; return; }
      pos.set(x, G.world.terrain.heightAt(x, z), z);
      if (y !== undefined) yaw = y;
      if (actor) actor.place(x, z, yaw);
      trail.reset(x, z); speed = 0;
    },
    push(vx, vz) { pv.x += vx; pv.z += vz; },
    /** stackable movement limit — the strictest wins, multipliers multiply */
    limit(tag, { speed: s, speedMul, run, pace } = {}) {
      const l = { tag, speed: s, speedMul, run, pace, remove() { const i = limits.indexOf(l); if (i >= 0) limits.splice(i, 1); aggregate(); } };
      limits.push(l); aggregate(); return l;
    },

    /** Walk to her left side, kneel, climb on, rise (≈ 3 s). */
    async mount(camel) {
      if (mounted || op || !camel || !ensure()) return;
      const o = op = { kind: 'mount', tok: ++seq, camel, wasRidden: !!camel.ridden, wasKneel: !!camel.kneeling };
      try {
        mode = 'scripted'; job = null; speed = 0; camel.ridden = true; camel.setSpeed(0);
        const kneel = camel.kneeling ? Promise.resolve() : camel.pose('kneel', { duration: 1.1 });
        leftOf(camel, _w2, 1.45);
        await P.moveTo(_w2.x, _w2.z, { speed: 2.2, stop: 0.15 });
        if (op !== o) return;
        mode = 'scripted';                                          // (moveTo hands control back on arrival: not while she kneels)
        actor.face(yawOf(camel.pos.x - pos.x, camel.pos.z - pos.z), 12);
        await kneel;
        if (op !== o) return;
        camel.saddle.getWorldPosition(_w);
        actor.play('sit', { fade: 0.2 });
        await hop(_w.x, _w.y, _w.z, 0.4);
        if (op !== o) return;
        actor.sitOn(camel.saddle); mounted = camel; yaw = camel.yaw; pos.copy(camel.pos);   // QA4: yaw first — update() places the camel with `yaw` while she rises (she snapped to the walking heading)
        await camel.pose('rise', { duration: 1.1 });
        if (op !== o) return;
        yaw = camel.yaw; speed = 0; mode = 'mounted'; op = null;
        G.events.emit('player:mounted', { camel });
      } catch (e) { if (op === o) cancelOp(); throw e; }          // aborted mid-way: only the owner cleans up
    },
    /** Reverse of mount; leaves Dhari standing on her left. */
    async dismount() {
      if (!mounted || op) return;
      const camel = mounted, o = op = { kind: 'dismount', tok: ++seq, camel, wasRidden: true, wasKneel: !!camel.kneeling };
      try {
        mode = 'scripted'; job = null; speed = 0; camel.setSpeed(0);
        if (!G.state.fastText) await G.scope.until(() => camel.speed < 0.3, { timeout: 1.5 });
        if (op !== o) return;
        await camel.pose('kneel', { duration: 1.0 });
        if (op !== o) return;
        camel.saddle.getWorldPosition(_w);
        actor.sitOn(null); actor.root.position.copy(_w);
        leftOf(camel, _w2, 1.4);
        const lx = _w2.x, lz = _w2.z, gy = G.world.terrain.heightAt(lx, lz);
        await hop(lx, gy, lz, 0.4);
        if (op !== o) return;
        mounted = null; yaw = camel.yaw; pos.set(lx, gy, lz);
        actor.place(lx, lz, yaw); actor.play('idle'); trail.reset(lx, lz);
        await camel.pose('rise', { duration: 1.0 });
        if (op !== o) return;
        camel.ridden = false; mode = 'foot'; op = null;
        G.events.emit('player:dismounted', { camel });
      } catch (e) { if (op === o) cancelOp(); throw e; }
    },
    /** QA3: hold a body pose ('sit') on the spot: the hero does not run locomotion until pose(null), teleport or setScripted(false) */
    pose(name, o) { heldPose = name || null; if (actor) actor.play(name || 'idle', { fade: 0.3, ...o }); },
    setScripted(on) { if (!on) heldPose = null; if (mode === 'down') return; mode = on ? 'scripted' : (mounted ? 'mounted' : 'foot'); if (on) { speed = 0; } else job = null; },
    /** Scripted walk to a point (hero moves under the same collision rules). Resolves true on arrival. */
    moveTo(x, z, { speed: sp = WALK, stop = 0.3 } = {}) {
      if (job) job.state = 2;
      const j = job = { x, z, sp, stop, state: 0, t: 0, best: 1e9, stuck: 0, prev: mode === 'scripted' ? (mounted ? 'mounted' : 'foot') : mode };
      mode = 'scripted';
      return G.scope.task(() => (j.state ? j.state === 1 : undefined));
    },
    knockdown(seconds = 2.5, { slide = 1.5 } = {}) {
      if (!ensure() || dn) return G.scope.sleep(seconds);
      const T = G.state.fastText ? 0.08 : seconds, vl = Math.hypot(pv.x, pv.z);
      let dx = vl > 0.1 ? pv.x / vl : -Math.sin(yaw), dz = vl > 0.1 ? pv.z / vl : -Math.cos(yaw);
      if (slide && typeof slide === 'object') {            // a vector slide {x,z} (metres, e.g. downwind): direction + length
        const sl = Math.hypot(slide.x || 0, slide.z || 0);
        if (sl > 1e-3) { dx = slide.x / sl; dz = slide.z / sl; }
        slide = sl;
      }
      dn = { t: 0, T, dx, dz, slide: mounted ? 0 : slide, prev: mode };
      mode = 'down'; speed = 0; job = null;
      if (!mounted) actor.play('kneel', { fade: 0.12 });       // a rider stays in the saddle pose (astride + seat offsets)
      G.events.emit('player:knockdown', { seconds, slide });
      return G.scope.sleep(T + 0.4);
    },
    /** 'torch' | 'staff' (right hand) | 'rifle' (slung on the back) | null */
    equip(item, { lit = true } = {}) {
      ensure();
      if (flameH) { flameH.remove(); flameH = null; }
      if (itemObj && itemObj.parent) itemObj.parent.remove(itemObj);
      itemObj = null; itemName = null; actor.overlay(null);
      if (!item) return;
      const obj = G.world.props.make(item); if (!obj) return;
      itemObj = obj; itemName = item;
      if (item === 'rifle') { actor.socket('back').add(obj); obj.position.set(0.1, 0.05, -0.13); obj.rotation.set(0.1, 0, 0.5); }
      else {
        actor.socket('handR').add(obj); obj.rotation.set(0.25, 0, 0);
        if (item === 'torch') {
          const tip = new THREE.Group(); tip.position.y = 0.6; obj.add(tip);
          flameH = G.world.props.flame(tip, { size: 0.35 }); if (flameH && flameH.setLit) flameH.setLit(lit !== false);
          actor.overlay('torch');
        }
      }
    },
    /**
     * One swing: auto-aim at the next wolf within ±60° of the view, emit player:swing, brand stays raised 0.5 s.
     * F06: a new swing is possible SWING_RECOVER s after the last (the clip restarts); a press inside that is buffered.
     */
    swing() {
      if (!ensure() || mode === 'down') return Promise.resolve();
      if (G.time.now - swingT < SWING_RECOVER) { swingQ = true; return Promise.resolve(); }
      return doSwing();
    },
    get swinging() { return swingAnim; },
    get moving() { return moving; },
    fence(x, z, r) { const f = { x, z, r, remove() { if (fence === f) fence = null; } }; fence = f; return f; },
    onBeatEnd() {
      for (let i = limits.length - 1; i >= 0; i--) if (!String(limits[i].tag).startsWith('level:')) limits.splice(i, 1);
      aggregate();
      cancelOp();                                                  // F02: a beat that ends mid-mount leaves no half state
      if (job) { job.state = 2; job = null; }
      if (mode === 'scripted') mode = mounted ? 'mounted' : 'foot';
      aim = null; swingQ = false; swingT = -99;
      if (swingAnim) { swingAnim = false; swingTok++; if (actor) actor.overlay(itemName === 'torch' ? 'torch' : null, { fade: 0.15 }); }
    },
    onLevelUnload() {
      limits.length = 0; aggregate();
      if (op && op.camel !== mounted && op.kind === 'mount') op.camel.ridden = op.wasRidden;
      op = null; seq++;
      if (job) { job.state = 2; job = null; }
      if (mounted) { if (actor) { actor.sitOn(null); G.scene.add(actor.root); } mounted.ridden = false; mounted = null; }
      if (actor) { P.equip(null); actor.root.rotation.x = 0; actor.setVisible(true); }
      mode = 'foot'; speed = 0; gs = 0; dn = null; aim = null; pv.x = pv.z = 0; fence = null;
      swingQ = false; swingT = -99; swingAnim = false; swingTok++;
    },

    update(dt) {
      if (!actor) return;
      moving = false;
      if (heldPose && mode !== 'down') { actor.place(pos.x, pos.z, yaw); actor.update(dt); return; }
      const play = G.state.mode === 'play';
      if (swingQ && G.time.now - swingT >= SWING_RECOVER) { if (play && mode !== 'down' && mode !== 'scripted') doSwing(); else swingQ = false; }   // the buffered press
      let mx = 0, my = 0, mag = 0;
      if (play && mode !== 'scripted' && mode !== 'down') { mx = G.input.move.x; my = G.input.move.y; mag = Math.hypot(mx, my); }
      const camYaw = G.actors.cam.yaw;
      _o.x = pos.x; _o.z = pos.z;

      if (mode === 'down') {
        const d = dn; d.t += dt;
        const tilt = d.t < 0.2 ? d.t / 0.2 : d.t > d.T ? Math.max(0, 1 - (d.t - d.T) / 0.4) : 1;
        const sl = d.t < 0.7 ? d.slide * 2 * (1 - d.t / 0.7) / 0.7 : 0;
        _o.x += (d.dx * sl + pv.x) * dt; _o.z += (d.dz * sl + pv.z) * dt;
        edge(pos.x, pos.z, dt); collide(_o); bounds(_o.x, _o.z, dt);
        pos.x = _o.x; pos.z = _o.z; pos.y = G.world.terrain.heightAt(pos.x, pos.z);
        if (!mounted) {
          actor.place(pos.x, pos.z, yaw); actor.locomotion(0); actor.play('kneel', { fade: 0.1 });
          actor.root.rotation.x = -tilt * 1.35; actor.root.position.y += 0.12 * tilt;
        }
        if (d.t >= d.T + 0.4) { actor.root.rotation.x = 0; actor.play(mounted ? 'sit' : 'idle', { fade: 0.25 }); mode = mounted ? 'mounted' : (d.prev === 'down' ? 'foot' : d.prev === 'scripted' ? 'foot' : d.prev); dn = null; }
        pv.x = pv.z = 0; actor.update(dt); return;
      }

      const jb = job && job.state === 0 ? job : null;
      if (jb && G.state.fastText) { P.teleport(jb.x, jb.z); jb.state = 1; job = null; mode = jb.prev; actor.update(dt); return; }

      if (mounted) {
        const camel = mounted;
        let target = 0;
        if (jb) {
          const dx = jb.x - camel.pos.x, dz = jb.z - camel.pos.z, d = Math.hypot(dx, dz);
          if (d <= jb.stop) { jb.state = 1; job = null; mode = 'mounted'; } else { yaw = turnToward(yaw, yawOf(dx, dz), 75 * DEG * dt); target = jb.sp; }
        } else if (mode === 'mounted') {
          if (my > 0.2) target = my > 0.9 ? (lmRun ? CAMEL_TROT : CAMEL_WALK) : CAMEL_WALK;
          yaw += -mx * 75 * DEG * dt * (speed > 0.3 ? 1 : 0.55);
        }
        if (target > 0) {
          const sx = Math.sin(yaw), sz = Math.cos(yaw);
          const dh = G.world.terrain.heightAt(camel.pos.x + sx * 1.5, camel.pos.z + sz * 1.5) - G.world.terrain.heightAt(camel.pos.x, camel.pos.z);
          target *= (1 - 0.2 * clamp(dh / 1.0, 0, 1)) * (1 - 0.1 * G.world.terrain.softAt(camel.pos.x, camel.pos.z));
          target = Math.min(target * lmMul, lmSpeed);
        }
        speed = damp(speed, target, target > speed ? 2.5 : 4, dt);
        fwd(yaw, _f);
        const bx = camel.pos.x, bz = camel.pos.z;
        _o.x = bx + (_f.x * speed + pv.x) * dt; _o.z = bz + (_f.z * speed + pv.z) * dt;
        edge(bx, bz, dt);
        const cols = G.world.props.colliders;
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i], r = c.r + 0.9, ddx = _o.x - c.x, ddz = _o.z - c.z, d2 = ddx * ddx + ddz * ddz;
          if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); _o.x = c.x + ddx / d * r; _o.z = c.z + ddz / d * r; }
        }
        bounds(_o.x, _o.z, dt);
        // F20: gait and steps follow the distance actually covered after the colliders, not the asked-for speed
        const mv = Math.hypot(_o.x - bx, _o.z - bz); gs = damp(gs, dt > 0 ? mv / dt : 0, 10, dt);
        camel.place(_o.x, _o.z, yaw); camel.setSpeed(Math.min(speed, gs));
        pos.copy(camel.pos);
        stride += mv;
        if (stride >= (gs > 3.5 ? 1.5 : 1.1)) { stride = 0; stepEvent(gs > 3.5, true); }
        record(); pv.x *= Math.exp(-6 * dt); pv.z *= Math.exp(-6 * dt);
        actor.update(dt); return;
      }

      // ---- on foot (input or scripted job)
      let target = 0;
      if (jb) {
        const dx = jb.x - pos.x, dz = jb.z - pos.z, d = Math.hypot(dx, dz);
        jb.t += dt;
        if (d < jb.best - 0.02) { jb.best = d; jb.stuck = 0; } else jb.stuck += dt;
        if (d <= jb.stop || jb.stuck > 2.5) { if (d > jb.stop) { pos.x = jb.x; pos.z = jb.z; } jb.state = 1; job = null; mode = jb.prev; target = 0; }
        else { yaw = turnToward(yaw, yawOf(dx, dz), 540 * DEG * dt); target = Math.min(jb.sp, 0.6 + d * 2.5); }
      } else if (mag > MOVE_STICK) {
        moving = true;
        fwd(camYaw, _f); right(camYaw, _r);
        const ty = yawOf(_f.x * my + _r.x * mx, _f.z * my + _r.z * mx), diff = Math.abs(angleDelta(yaw, ty));
        if (!aim) yaw = turnToward(yaw, ty, 540 * DEG * dt);
        const run = (mag > 0.9 || G.input.held('run')) && lmRun;
        target = lmPace < Infinity ? lmPace : run ? RUN : WALK * Math.min(1, mag / 0.6);     // F03: a paced beat locks the speed
        target *= 1 - 0.5 * smoothstep(1.0, 2.6, diff);
      }
      if (aim) { aim.t -= dt; yaw = turnToward(yaw, aim.yaw, 900 * DEG * dt); if (aim.t <= 0) aim = null; }
      if (target > 0) {
        if (jb || lmPace === Infinity) {
          const sx = Math.sin(yaw), sz = Math.cos(yaw);
          const dh = G.world.terrain.heightAt(pos.x + sx, pos.z + sz) - pos.y;
          target *= (1 - 0.35 * clamp(dh / 0.65, 0, 1)) * (1 - 0.15 * G.world.terrain.softAt(pos.x, pos.z));
        }
        if (!jb) target = Math.min(target * lmMul, lmSpeed);
      }
      speed = damp(speed, target, target > speed ? 9 : 14, dt);
      if (speed < 0.02 && target === 0) speed = 0;
      fwd(yaw, _f);
      const bx = pos.x, bz = pos.z;
      _o.x = bx + (_f.x * speed + pv.x) * dt; _o.z = bz + (_f.z * speed + pv.z) * dt;
      edge(bx, bz, dt); collide(_o); bounds(_o.x, _o.z, dt);
      pos.x = _o.x; pos.z = _o.z; pos.y = G.world.terrain.heightAt(pos.x, pos.z);
      // F20: steps (prints, sounds) and the gait follow the distance actually covered after the colliders
      const mv = Math.hypot(pos.x - bx, pos.z - bz); gs = damp(gs, dt > 0 ? mv / dt : 0, 10, dt);
      stride += mv;
      const sl = gs > 3.2 ? 1.25 : 0.62;
      if (stride >= sl) { stride = 0; stepEvent(gs > 3.2, false); }
      record();
      pv.x *= Math.exp(-6 * dt); pv.z *= Math.exp(-6 * dt);
      actor.place(pos.x, pos.z, yaw);
      // QA4: a scripted pose (kneel / sit / talk …) set by a chapter must survive — locomotion() overwrote it every tick
      const pose = mode === 'scripted' && !jb && speed === 0 && actor.clip && actor.clip !== 'idle' && actor.clip !== 'walk' && actor.clip !== 'run';
      if (!pose) actor.locomotion(Math.min(speed, gs));
      actor.update(dt);
    },
  };
  return P;
}
