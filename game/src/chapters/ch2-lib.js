/**
 * Chapter 2 helpers: named places, absolute staging of every beat, the camp, the gust / sip / lost-guidance routines.
 * Everything here is beat-safe (promises through `d`, handles owned by the beat).
 */
import { at, yawTo, toast, prompt, hud, music, goal as kitGoal } from './kit.js';
import { yawOf, bearingDeg, dist, DEG, pointOf } from '../core/math.js';

/** module state (reset when the level (re)loads — see ch2.js setup) */
export const S = { G: null, sipping: false, first: true, softTime: 0, ready: Promise.resolve(), lastBounds: -99, lastThirst: -99 };

export const PACK_TINTS = [0xc9a877, 0xb08a5a, 0x9c7748, 0xc9a877];
export const WADHA_TINT = 0xf3ead6, CALF_TINT = 0xe4d3b0;
export const swallow = p => Promise.resolve(p).then(() => {}, () => {});
/** a camera point `h` metres above the ground at (x, z) — cine shots take absolute y, the level floor here is ~4.4 m */
export const above = (G, x, h, z) => { const a = [x, 0, z]; return () => { a[1] = G.world.terrain.heightAt(x, z) + h; return a; }; };

/** every authored place of the chapter (fresh objects) */
export function pts(L) {
  const p = n => L.poi(n), camp = p('camp'), fire = p('fire'), ring = p('ring');
  return {
    start: p('start'), cairn: p('cairn'), fork: p('fork'), firm: p('firm'), qata: p('qata'), rock: p('rock'),
    camp, fire, ring, lastSeen: p('lastSeen'), gap1: p('gap1'), gap2: p('gap2'), bush: p('bush'),
    shade: { x: camp.x, z: camp.z },                 // the march ends here (objective)
    arrive: at(L, 'camp', 0, -26),                   // a cold c2_ration starts here, mounted, riding in
    seatC: { x: fire.x, z: fire.z + 0.8 },            // the family around the fire
    home: at(L, 'camp', 10, -4),                      // the end of the way back
    moudi: at(L, 'fire', 6, -2),                      // موضي at the east edge of the ring at dusk
    wadhaRest: { x: ring.x, z: ring.z },
  };
}

const SEATS = { mani: [3.1, 0.8], moudi: [-3.0, 0.6], misfer: [-1.7, -3.4], fuhaid: [1.7, -3.2] };
export const seatOf = (L, id) => { const f = L.poi('fire'); return { x: f.x + SEATS[id][0], z: f.z + SEATS[id][1] }; };
const STAND = { mani: [3.4, 2.4], misfer: [-4.2, 1.2], moudi: [6, -2], fuhaid: [1.6, 3.6] };
export const standOf = (L, id) => { const f = L.poi('fire'); return { x: f.x + STAND[id][0], z: f.z + STAND[id][1] }; };

export const npc = (G, id) => G.actors.npcs.get(id);
export const cam = (G, id) => G.actors.camels.get(id);

/** spawn an npc if it is missing; with `force` stop it, take it off a camel and place it (never respawned) */
export function ensureNpc(G, id, p, yaw, force, clip = 'idle') {
  let n = npc(G, id);
  if (!n) { n = G.actors.npcs.spawn(id, id, { x: p.x, z: p.z, yaw, clip }); n.stop(); n.place(p.x, p.z, yaw); n.play(clip); }
  else if (force) { n.stop(); if (n.riding && n.unride) n.unride(); n.place(p.x, p.z, yaw); n.play(clip); }
  return n;
}
export function ensureCamel(G, id, p, yaw, force, opts = {}) {
  let c = cam(G, id);
  if (!c) { c = G.actors.camels.spawn(id, { x: p.x, z: p.z, yaw, ...opts }); if (c.stop) c.stop(); c.place(p.x, p.z, yaw); }
  else if (force) { if (c.stop) c.stop(); if (!c.ridden) c.place(p.x, p.z, yaw); }
  return c;
}

/** positions of the kneeling ring (same layout as caravan.kneelAll) */
export function ringSpots(ring, n, r) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4, x = ring.x + Math.sin(a) * r, z = ring.z + Math.cos(a) * r;
    out.push({ x, z, yaw: yawOf(x - ring.x, z - ring.z) + (i % 2 ? 90 * DEG : -90 * DEG) });
  }
  return out;
}
export const RING_R = 5.5;

/** the three-camel + calf caravan strung out behind the lead; `riders` ride, `walkers` walk alongside */
export function buildCaravan(G, L, lead, { riding }) {
  const C = G.actors.caravan;
  C.clear();
  C.form({
    lead, camels: 4, tints: PACK_TINTS,
    walkers: riding ? ['misfer', 'fuhaid'] : [],
    riders: riding ? [{ npc: 'mani', index: 0 }, { npc: 'moudi', index: 2 }] : [],
  });
}

/** cold-place everyone kneeling / sitting at the camp (beats after c2_ration) */
export function placeCamp(G, L, { people = 'seated' } = {}) {
  const P = pts(L), C = G.actors.caravan;
  for (const id of ['mani', 'moudi', 'misfer', 'fuhaid']) {
    const q = people === 'seated' ? seatOf(L, id) : standOf(L, id);
    const n = ensureNpc(G, id, q, 0, true);
    n.place(q.x, q.z, yawTo(q, P.fire)); n.play(people === 'seated' ? 'sit' : 'idle');
    if (id !== 'fuhaid' && n.lookAtPlayer) n.lookAtPlayer(true);
  }
  const wadha = ensureCamel(G, 'wadha', P.wadhaRest, 0, true, { tint: WADHA_TINT });
  buildCaravan(G, L, wadha, { riding: false });
  const spots = ringSpots(P.ring, Math.max(1, C.members.length), RING_R);
  C.members.forEach((c, i) => { const s = spots[i]; c.place(s.x, s.z, s.yaw); c.pose('kneel', { duration: 0.01 }); });
  wadha.pose('kneel', { duration: 0.01 });
  ensureCamel(G, 'hwar', { x: P.ring.x + 2.2, z: P.ring.z + 1.6 }, 0.6, true, { scale: 0.55, tint: CALF_TINT });
}

/** per-beat world state (absolute); `resumed` = cold start */
const CFG = {
  c2_march:  { sky: 'noon',  storm: 0, wind: [90, 0.35], dust: 0.35, music: 'music_march', water: false, range: 45, fire: false },
  c2_ration: { sky: 'noon',  storm: 0, wind: [90, 0.35], dust: 0.35, music: 'music_march', water: true,  range: 45, fire: false },
  c2_wall:   { sky: 'noon',  storm: 0, wind: [90, 0.4],  dust: 0.4,  music: 'music_march', water: true,  range: 45, fire: false },
  c2_storm:  { sky: 'storm', storm: 1, wind: [90, 0.9],  dust: 0.8,  music: null,          water: true,  range: 14, fire: false },
  c2_return: { sky: 'storm', storm: 1, wind: [90, 0.9],  dust: 0.8,  music: null,          water: true,  range: 14, fire: true },
  c2_dusk:   { sky: 'dusk',  storm: 0, wind: [90, 0.2],  dust: 0.2,  music: 'music_march', water: true,  range: 45, fire: true },
};

export function stage(G, L, id, resumed) {
  const c = CFG[id], P = pts(L), W = G.world.weather, sky = G.world.sky, pl = G.actors.player;
  hud(G, { eye: true, water: c.water, strip: false });
  const sv = G.sys.survival;
  if (id === 'c2_march' || id === 'c2_ration') sv.lockDrink(true, 'water.locked.c2');   // the single sip is the ration decision's (c2_ration)
  else { sv.lockDrink(false); if (resumed) sv.set({ sips: 0 }); }                       // a beat after it never starts with the sip back (c2_dusk hands the giver's own)
  G.sys.firasa.setAllowed(true); G.sys.firasa.setRange(c.range);
  music(G, c.music, 3);
  const fire = L.fires && L.fires.camp;
  if (fire) { fire.setLit(c.fire); if (c.fire && fire.setBeacon) fire.setBeacon(id === 'c2_return' ? 170 : 60); }
  if (resumed) {
    sky.setPreset(c.sky, { duration: 0 });
    W.setWind(c.wind[0], c.wind[1]); W.setDust(c.dust, { duration: 0 }); W.storm(c.storm, { duration: 0 });
  }
  if (!resumed) { if (!cam(G, 'wadha')) resumed = true; else return; }          // continuing: the previous beat left everything in place
  let ready = null;
  const calfAt = (p, yaw, kneel) => {
    const hw = ensureCamel(G, 'hwar', p, yaw, true, { scale: 0.55, tint: CALF_TINT });
    if (kneel && hw.pose) hw.pose('kneel', { duration: 0.01 });
    return hw;
  };

  if (id === 'c2_march' || id === 'c2_ration') {
    const at0 = id === 'c2_march' ? P.start : P.arrive;
    const sp = (dx, dz) => ({ x: at0.x + dx, z: at0.z + dz });
    ensureNpc(G, 'mani', sp(0, -4), 0, true); ensureNpc(G, 'moudi', sp(0, -13), 0, true);
    ensureNpc(G, 'misfer', sp(3.2, -7), 0, true); ensureNpc(G, 'fuhaid', sp(-3.2, -9), 0, true);
    const wadha = ensureCamel(G, 'wadha', at0, 0, true, { tint: WADHA_TINT });
    if (wadha.kneeling && pl.mounted !== wadha) wadha.pose('rise', { duration: 0.01 });
    if (pl.mounted === wadha) pl.teleport(at0.x, at0.z, 0);
    buildCaravan(G, L, wadha, { riding: true });
    const calf = calfAt(sp(-3.5, -3), 0, false);
    if (calf.follow) calf.follow(wadha, { dist: 5, speed: 2.6 });
    if (pl.mounted !== wadha) { pl.teleport(at0.x, at0.z - 2.5, 0); ready = pl.mount(wadha); }
  } else {
    const doPlace = () => {
      placeCamp(G, L, { people: id === 'c2_dusk' ? 'stand' : 'seated' });
      const bush = P.bush, last = P.lastSeen, home = P.home;
      if (id === 'c2_wall') pl.teleport(P.seatC.x, P.seatC.z - 7, 0);
      else if (id === 'c2_storm') {
        pl.teleport(last.x - 4, last.z, 90 * DEG);
        ensureNpc(G, 'fuhaid', { x: bush.x + 3.2, z: bush.z + 0.8 }, -90 * DEG, true, 'kneel');
        calfAt({ x: bush.x + 4.6, z: bush.z + 1.8 }, -90 * DEG, true);
      } else if (id === 'c2_return') {
        pl.teleport(bush.x - 2.4, bush.z, -90 * DEG);
        ensureNpc(G, 'fuhaid', { x: bush.x - 0.6, z: bush.z + 0.8 }, -90 * DEG, true);
        calfAt({ x: bush.x + 1.2, z: bush.z + 1.8 }, -90 * DEG, false);
      } else if (id === 'c2_dusk') {
        pl.teleport(home.x, home.z, -90 * DEG);
        ensureNpc(G, 'fuhaid', { x: home.x + 1.6, z: home.z + 1.2 }, -90 * DEG, true);
        calfAt({ x: home.x + 3.4, z: home.z + 2 }, -90 * DEG, false);
      }
      if (G.actors.cam.snap) G.actors.cam.snap();
    };
    if (pl.mounted) ready = swallow(pl.dismount()).then(doPlace); else doPlace();
  }
  if (G.actors.cam.snap) G.actors.cam.snap();
  S.ready = ready ? swallow(ready) : Promise.resolve();
}

// ------------------------------------------------------------------------------------------------ routines

/** a small camera shot on someone's face (for the consequence shots); the subject sits a little high, clear of the text panel */
export function faceShots(actor, dur = 2.2) {
  const p = actor.pos, y = actor.yaw, fx = Math.sin(y), fz = Math.cos(y), sit = actor.clip === 'sit';
  const hy = sit ? 0.8 : 1.4, cy = sit ? 1.15 : 1.6;
  return [
    { pos: [p.x + fx * 3.0 + fz * 0.7, p.y + cy, p.z + fz * 3.0 - fx * 0.7], look: [p.x, p.y + hy - 0.4, p.z], dur: 0.02, cut: true },
    { pos: [p.x + fx * 2.1 + fz * 0.5, p.y + cy - 0.05, p.z + fz * 2.1 - fx * 0.5], look: [p.x, p.y + hy - 0.35, p.z], dur },
  ];
}

/** the hold-to-drink gesture performed by the player (auto-performed in tests / after 30 s) */
export async function sip(G, d, key) {
  const sv = G.sys.survival; let done = false;
  if (sv.sips < 1) return;                                              // nothing left to drink (never wait for an impossible hold)
  d.onEnd(G.events.on('survival:drink', () => { done = true; }));
  prompt(G, key); S.sipping = true; d.onEnd(() => { S.sipping = false; });
  if (G.state.fastText) sv.drink();
  await d.until(() => done, { timeout: 30 });
  S.sipping = false;
  if (!done) await d.wrap(sv.drink());
  prompt(G, null);
}

/**
 * One scripted gust with its brace window. Resolves true when the player held the button through it. A miss = toast + 2 s
 * knockdown with a 3 m slide downwind (`onMiss` replaces the default).
 */
export async function gustBrace(G, d, { warn = 2.5, strength = 1, missKey = 'c2_return.fail.knock', shield = null } = {}) {
  const W = G.world.weather, win = G.sys.steady.brace({ warn, impactAt: warn });
  const gust = W.gust({ warn, strength, duration: 1.2 });
  const duck = shield ? d.spawn(async d2 => { await d2.wait(warn * 0.8); shield.play('kneel'); }) : null;   // the child ducks behind Dhari's back
  const ok = await d.wrap(win);
  if (duck) { duck.cancel(); shield.play('idle'); }
  if (!ok) {                                                                                     // the miss lands with the gust
    toast(G, missKey, 3.6);
    const w = W.wind || { x: 1, z: 0 };
    await d.wrap(G.actors.player.knockdown(2, { slide: { x: w.x * 3, z: w.z * 3 } }));
  }
  await d.wrap(gust);
  return ok;
}

/** compass bearing from the hero to a point */
export function bearingTo(G, p) {
  const pl = G.actors.player.pos;
  return bearingDeg(yawOf(p.x - pl.x, p.z - pl.z));
}

/**
 * Escalating guidance when the hero stops closing in on `target` (30 / 60 / 90 s): the call's ripple becomes an arrow,
 * the calf (or the camp) bleats, a glow shows on the target. `st` = the beat's call state {arrow}; returns { level }.
 */
export function lostWatch(G, d, target, st, { calfAt } = {}) {
  const pl = G.actors.player.pos, state = { level: 0 };
  d.spawn(async d2 => {
    let best = dist(pl.x, pl.z, target.x, target.z), t = 0, glow = null;
    await d2.task(dt => {
      const dd = dist(pl.x, pl.z, target.x, target.z);
      if (dd < best - 4) {
        best = dd; t = 0;
        if (state.level) { state.level = 0; st.arrow = false; if (st.refresh) st.refresh(); if (glow) { glow.remove(); glow = null; } }
        return undefined;
      }
      t += dt;
      if (t > 30 && state.level < 1) { state.level = 1; st.arrow = true; if (st.refresh) st.refresh(); toast(G, 'c2_storm.lost1', 4); }
      if (t > 60 && state.level < 2) { state.level = 2; toast(G, 'c2_storm.lost2', 4); G.audio.sfx('sfx_calf', { at: calfAt || target }); }
      if (t > 90 && state.level < 3) { state.level = 3; toast(G, 'c2_storm.lost3', 4); glow = G.world.props.glow({ x: target.x, z: target.z }, { color: 0xffd070, size: 3.4 }); if (glow) d.own(glow); }
      return undefined;
    });
  });
  return state;
}

/** the ripple rings (his call) toward `target`; `st` = { gap, arrow, range } decides when and how they show */
export function callRipple(G, d, target, st) {
  const hudm = G.ui.hud;
  // his call is heard within `range`; the lost-guidance ARROW (st.arrow, set by lostWatch) is an assist for a player who has strayed: no range limit (F23)
  const fn = () => (st.arrow || (st.gap && dist(G.actors.player.pos.x, G.actors.player.pos.z, target.x, target.z) <= st.range) ? bearingTo(G, target) : null);
  st.refresh = () => hudm.ripple(fn, { arrow: !!st.arrow });
  st.refresh();
  d.onEnd(() => hudm.ripple(null));
}

// ------------------------------------------------------------------------------------------------ test bot support
/** objective with its two hints (kit.goal) that also remembers the target for the beats' own bot functions */
export const aim = { at: null, t: 0, warpT: 0 };
export function goal(d, key, opts = {}) {
  aim.at = opts.at || null; kitGoal(d, key, opts);
  const G = S.G;
  if (G && opts.at && opts.frame !== false && G.actors.cam.frame) G.actors.cam.frame(opts.at, { duration: 1 });   // ease the view onto the objective
}

/**
 * Generic bot behaviour (the kernel's bot reads `objectives.current.at`, which the objectives system does not expose):
 * warp next to the remembered objective target, then alternate holding interact (1.8 s) and the eye (1.2 s).
 */
export function warpBot(G, dt = 1 / 60) {
  aim.t += dt; aim.warpT -= dt;
  const pl = G.actors.player;
  let move = { x: 0, y: 0 };
  if (aim.at && G.sys.objectives.current) {
    const p = pointOf(aim.at), dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, d = Math.hypot(dx, dz);
    if (d > 2.2 && aim.warpT <= 0) { const k = (d - 1.6) / d; pl.teleport(pl.pos.x + dx * k, pl.pos.z + dz * k, yawOf(dx, dz)); if (G.actors.cam.snap) G.actors.cam.snap(); aim.warpT = 0.5; }
    else if (d > 0.9) move = { x: 0, y: 0.5 };
  }
  // like a player: a gust / hold request is answered with the button really held (and the stick still); otherwise tap / eye
  const req = G.sys.steady.activeRequest, v = G.sys.interact.verb, ph = aim.t % 3.4;
  let hold;
  if (req) hold = ['interact'];
  else if (S.sipping) hold = ['drink'];                                  // the قربة icon is held for the sip
  else if (v && v.kind && v.progress > 0 && v.progress < 1) hold = ['interact'];
  else hold = ph < 1.8 ? ['interact'] : ph >= 2.0 && ph < 3.2 ? ['firasa'] : [];
  G.input.feed({ move: req ? { x: 0, y: 0 } : move, hold });
  return true;
}
