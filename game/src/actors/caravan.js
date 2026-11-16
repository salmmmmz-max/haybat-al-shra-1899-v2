/**
 * Caravan — a string of pack camels that follow the lead's breadcrumb trail at 4.5 m spacing.
 *   form({ lead, camels:n, tints, walkers:[npcId], riders:[{npc,index}] }) · follow(on) · pace · halt()
 *   kneelAll({ring}) → Promise · riseAll() → Promise · members · clear()
 * The lead's path is stored as a uniformly spaced trail (0.5 m); each member keeps an arc-length progress on it, so the
 * string snakes through turns exactly along the lead's path. On soft sand members are slower and the string stretches.
 */
import { yawOf, damp, DEG } from '../core/math.js';

const STEP = 0.5, GAP = 4.5, CAP = 2048;
const FAR = 25, NEAR = 21;

export function createCaravan(G) {
  const tx = new Float32Array(CAP), tz = new Float32Array(CAP);
  let head = 0;                       // absolute index of newest trail point
  let lead = null, members = [], prog = [], vel = [], off = [], walkers = [], rigs = [], following = false, pace = 2.4, lastX = 0, lastZ = 0;
  let farT = 0, ringOn = false;
  const wt = walkers;                 // (kept for symmetry)
  void wt;
  const wpt = []; const ftgt = [];                     // walker targets {x,z}
  const sp = { x: 0, z: 0 };

  function push(x, z) { head++; tx[head % CAP] = x; tz[head % CAP] = z; }
  function sample(p, out) {           // p = arc length from trail start (absolute head*STEP coordinates)
    let f = p / STEP; const lo = Math.max(head - CAP + 2, 0);
    if (f < lo) f = lo; if (f > head) f = head;
    const i = Math.floor(f), k = f - i, a = i % CAP, b = Math.min(i + 1, head) % CAP;
    out.x = tx[a] + (tx[b] - tx[a]) * k; out.z = tz[a] + (tz[b] - tz[a]) * k; return out;
  }
  const leadProg = () => head * STEP;
  function record() {
    if (!lead) return;
    let dx = lead.pos.x - tx[head % CAP], dz = lead.pos.z - tz[head % CAP]; let d = Math.hypot(dx, dz);
    if (d < STEP) return;
    dx /= d; dz /= d; const bx = tx[head % CAP], bz = tz[head % CAP];
    for (let s = STEP; s <= d; s += STEP) push(bx + dx * s, bz + dz * s);
  }
  function resolveNpc(n) { return typeof n === 'string' ? G.actors.npcs.get(n) : n; }

  function setRig(i, rig) {
    const c = members[i]; if (!c || rigs[i] === rig || c.kneeling || c.hasRider) return;
    const id = 'caravan' + i, tint = c._tint;
    const n = G.actors.camels.spawn(id, { x: c.pos.x, z: c.pos.z, yaw: c.yaw, tint, rig });
    n.driven = true; n._tint = tint; members[i] = n; rigs[i] = rig;
  }

  const C = {
    effort: 100,
    form(o) {
      C.clear(); lead = o.lead || null; if (!lead) return;
      const n = o.camels || 0;
      head = 0; const fx = Math.sin(lead.yaw), fz = Math.cos(lead.yaw), len = (n + 2) * GAP;
      const steps = Math.ceil(len / STEP);
      tx[0] = lead.pos.x - fx * steps * STEP; tz[0] = lead.pos.z - fz * steps * STEP;
      for (let k = 1; k <= steps; k++) push(tx[0] + fx * k * STEP, tz[0] + fz * k * STEP);
      for (let i = 0; i < n; i++) {
        const tint = o.tints ? o.tints[i % o.tints.length] : 0xd9b98c;
        const rig = 'skinned';
        const c = G.actors.camels.spawn('caravan' + i, { x: 0, z: 0, yaw: lead.yaw, tint, rig, scale: 0.97 + G.rng.next() * 0.08 });
        c.driven = true; c._tint = tint; members.push(c); rigs.push(rig);
        prog.push(leadProg() - GAP * (i + 1)); vel.push(0); off.push(false);
        sample(prog[i], sp); c.place(sp.x, sp.z, lead.yaw);
      }
      walkers = (o.walkers || []).map(resolveNpc).filter(Boolean);
      wpt.length = 0; for (let i = 0; i < walkers.length; i++) wpt.push({ x: 0, z: 0 });
      for (const r of o.riders || []) {
        const npc = resolveNpc(r.npc), c = members[r.index];
        if (npc && c && npc.ride) { npc.ride(c); c.hasRider = true; }
      }
      pace = 2.4; C.effort = 100; lastX = lead.pos.x; lastZ = lead.pos.z;
    },
    get members() { return members; },
    get camels() { return members; },
    get pace() { return pace; },
    follow(on) {
      following = !!on;
      for (let i = 0; i < members.length; i++) members[i].driven = on ? !off[i] : false;
      if (!on) for (const c of members) c.setSpeed(0);
    },
    halt() {
      following = false;
      for (let i = 0; i < members.length; i++) { members[i].setSpeed(0); vel[i] = 0; }
      for (const w of walkers) if (w.stop) w.stop();
    },
    async kneelAll({ ring } = {}) {
      following = false; ringOn = true; const fast = G.state.fastText;
      const n = members.length, ps = [];
      for (const w of walkers) if (w.stop) w.stop();
      for (let i = 0; i < n; i++) {
        const c = members[i]; c.driven = false; off[i] = true; c.setSpeed(0);
        const go = async () => {
          await G.scope.sleep(fast ? 0.02 : i * 0.7);
          if (ring) {
            const a = (i / n) * Math.PI * 2 + 0.4, x = ring.x + Math.sin(a) * ring.r, z = ring.z + Math.cos(a) * ring.r;
            await c.goTo(x, z, { speed: 2.2, stop: 0.6 });
            c.face(yawOf(x - ring.x, z - ring.z) + (i % 2 ? 90 * DEG : -90 * DEG), 4);   // tangent: lie around the fire
          } else { c.stop(); }
          await G.scope.sleep(fast ? 0.02 : 0.3);
          await c.pose('kneel', { duration: fast ? 0.1 : 1.6 });
        };
        ps.push(go());
      }
      await Promise.all(ps); ringOn = false;
    },
    async riseAll() {
      const fast = G.state.fastText;
      await Promise.all(members.map(async (c, i) => { await G.scope.sleep(fast ? 0.02 : i * 0.5); await c.pose('rise', { duration: fast ? 0.1 : 1.4 }); }));
    },
    scatterTo(points) { members.forEach((c, i) => { const p = points[i % points.length]; c.place(p.x, p.z, c.yaw); off[i] = true; }); },
    clear() {
      for (let i = 0; i < members.length; i++) G.actors.camels.remove('caravan' + i);
      members = []; prog = []; vel = []; off = []; rigs = []; walkers = []; lead = null; following = false; ringOn = false;
    },
    onLevelUnload() { members = []; prog = []; vel = []; off = []; rigs = []; walkers = []; lead = null; following = false; ringOn = false; },
    update(dt) {
      if (!lead) return;
      record();
      const T = G.world.terrain;
      // pace cap from the lead's ground
      const soft = T.softAt(lead.pos.x, lead.pos.z) > 0.5;
      pace = damp(pace, soft ? 1.8 : 2.4, 3, dt);
      const dl = Math.hypot(lead.pos.x - lastX, lead.pos.z - lastZ); lastX = lead.pos.x; lastZ = lead.pos.z;
      const leadSpeed = dt > 0 ? dl / dt : 0;
      C.effort = Math.max(0, Math.min(100, C.effort + (soft ? -4 : 1.5) * dt));
      const LP = leadProg();
      const n = members.length;
      for (let i = 0; i < n; i++) {
        const c = members[i];
        if (ringOn) continue;
        if (off[i]) {   // came back from a ring / scatter: walk to the trail slot, then rejoin the string
          if (!following) continue;
          sample(LP - GAP * (i + 1), sp); const d = Math.hypot(sp.x - c.pos.x, sp.z - c.pos.z);
          if (d < 1.2) { off[i] = false; prog[i] = LP - GAP * (i + 1); c.driven = true; vel[i] = 0; c.stop(); c.__fol = 0; }
          else if (!c.ridden) {
            const t = ftgt[i] || (ftgt[i] = { x: 0, z: 0 }); t.x = sp.x; t.z = sp.z; c.driven = false;
            if (!c.__fol) { c.follow(t, { dist: 0.5, speed: 3.6 }); c.__fol = 1; }
          }
          continue;
        }
        if (!following) continue;
        const front = i === 0 ? LP : prog[i - 1];
        const gap = front - prog[i];
        const mySoft = T.softAt(c.pos.x, c.pos.z) > 0.5;
        const vmax = (mySoft ? 1.7 : 2.9) * (0.96 + 0.04 * (i % 3));
        let want = gap > GAP + 0.15 ? Math.min(vmax, (gap - GAP) * 1.6 + (i === 0 ? leadSpeed : vel[i - 1])) : Math.max(0, (i === 0 ? leadSpeed : vel[i - 1]) * (gap > GAP - 0.4 ? 1 : 0));
        if (want > vmax) want = vmax;
        vel[i] = damp(vel[i], want, 3, dt);
        if (vel[i] < 0.03 && want === 0) vel[i] = 0;
        prog[i] += vel[i] * dt;
        if (prog[i] > front - 2.5) prog[i] = front - 2.5;
        sample(prog[i], sp); const x = sp.x, z = sp.z;
        const sp2 = sample(prog[i] + 0.8, sp);
        const yaw = yawOf(sp2.x - x, sp2.z - z);
        c.place(x, z); c.face(yaw, 7); c.setSpeed(vel[i]);
      }
      // walkers keep abreast of the string
      if (following) {
        for (let w = 0; w < walkers.length; w++) {
          const npc = walkers[w]; if (!npc || npc.riding) continue;
          const i = Math.min(n - 1, Math.max(0, Math.floor((w + 0.5) * n / Math.max(1, walkers.length)) - (w % 2 ? 0 : 0)));
          const p = prog[i] != null ? prog[i] : LP - 4;
          const side = w % 2 ? 2.6 : -2.6;
          sample(p + 1.0, sp); const px = sp.x, pz = sp.z;
          const sp2 = sample(p + 1.8, sp); const yaw = yawOf(sp2.x - px, sp2.z - pz);
          const t = wpt[w]; t.x = px + Math.cos(yaw) * -side; t.z = pz - Math.sin(yaw) * -side;
          npc.follow(t, { dist: 0.3, speed: Math.max(1.1, Math.min(3, leadSpeed + 0.5)) });
        }
      }
      // distant members use the cheap rig (staggered check; never riders / kneelers)
      farT -= dt;
      if (farT <= 0 && n) {
        farT = 0.6;
        const cam = G.camera.position;
        for (let i = 0; i < n; i++) {
          const c = members[i]; const d = Math.hypot(c.pos.x - cam.x, c.pos.z - cam.z);
          if (rigs[i] === 'skinned' && d > FAR) setRig(i, 'static');
          else if (rigs[i] === 'static' && d < NEAR) setRig(i, 'skinned');
        }
      }
    },
  };
  return C;
}
