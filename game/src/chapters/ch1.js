/**
 * Chapter 1 «الأثر» — L1 «المراح», dawn → morning. The camp by the dying well.
 * Teaches: move, look, the context button, الفراسة (tracks), الثبات (calm approach), riding.
 * Beats (DESIGN §5): c1_intro · c1_wake · c1_well · c1_firasa · c1_trail · c1_gravel · c1_calm · c1_ride · c1_decision.
 * All text lives in content/story.ar.js (keys c1_*); every place is derived from levels.js pois.
 */
import { LEVELS } from './levels.js';
import { at, yawTo, toast, prompt, hud, goal, use, music, pause } from './kit.js';
import { dist2, pointOf, yawOf } from '../core/math.js';

const ORDER = ['c1_intro', 'c1_wake', 'c1_well', 'c1_firasa', 'c1_trail', 'c1_gravel', 'c1_calm', 'c1_ride', 'c1_decision'];
const EAST = Math.PI / 2;

/** the current objective's target (also read by the test bot, which cannot see it through objectives.current) */
let botAt = null, botWarpAt = -9;
const aim = (d, key, opts = {}) => { botAt = opts.at || null; goal(d, key, opts); };
const done = d => { botAt = null; d.objectiveDone(); };
/** test bot: warp next to the objective, then let the default hold-interact / eye cycle run */
function botStep(G) {
  if (!botAt || G.time.now - botWarpAt < 0.5) return false;
  const q = pointOf(botAt), tx = q.x, tz = q.z, pl = G.actors.player;
  const dx = tx - pl.pos.x, dz = tz - pl.pos.z, dist = Math.hypot(dx, dz);
  if (dist > 2.2) { const k = (dist - 1.6) / dist; pl.teleport(pl.pos.x + dx * k, pl.pos.z + dz * k, yawOf(dx, dz)); if (G.actors.cam.snap) G.actors.cam.snap(); botWarpAt = G.time.now; }
  return false;
}

// ------------------------------------------------------------------------------------------------ geometry helpers
/** Catmull-Rom through points, ~`step` m between samples (authored, hand-weighted camel tracks) */
function spline(pts, step = 3) {
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const k = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ x: pts[n - 1].x, z: pts[n - 1].z });
  return out;
}
/** point `s` metres along a polyline (+ its heading) */
function along(poly, s) {
  let acc = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + l >= s) { const u = (s - acc) / l; return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, yaw: yawTo(a, b) }; }
    acc += l;
  }
  const a = poly[poly.length - 2], b = poly[poly.length - 1];
  return { x: b.x, z: b.z, yaw: yawTo(a, b) };
}

/** every authored place of the chapter (all derived from levels.js pois) */
function places(L) {
  const P = k => L.poi(k);
  const gate = P('gate'), brk = P('break');
  const A = spline([{ x: 5, z: 24 }, { x: 9, z: 28.5 }, { x: 14, z: 34 }, { x: 21, z: 42 }, { x: 28, z: 50 }, P('ridge'), { x: 41, z: 63 }, { x: 49, z: 72 }, brk]);
  const OLD = spline([{ x: 4, z: 25 }, { x: -2, z: 28 }, { x: -12, z: 32 }, { x: -22, z: 36 }, { x: -33, z: 39.5 }, P('oldEnd')]);
  const B = spline([P('resume'), { x: 92, z: 130 }, { x: 94, z: 145 }, { x: 95, z: 157 }, { x: 96, z: 172 }, { x: 97, z: 186 }]);
  const wolfP = at(L, 'wolfprint', -3, -13);
  const WOLF = spline([{ x: wolfP.x - 17, z: wolfP.z - 8 }, { x: wolfP.x - 8, z: wolfP.z - 4 }, wolfP, { x: wolfP.x + 10, z: wolfP.z + 4 }, { x: wolfP.x + 21, z: wolfP.z + 9 }], 1);
  return {
    spawn: P('spawn'), well: P('well'), gate, brk, A, OLD, B, WOLF, wolfP,
    sheikhWell: { x: 5.4, z: 3.0 },                 // the Sheikh stands west of the well, facing the sun
    sheikhPen: { x: 1.8, z: 20.5 },                 // and later at the pen, where the tracks begin
    insFresh: along(A, 7), insOld: along(OLD, 6.5),  // the two track sets ≤ 10 m from the gate
    twig: P('twig'), dung: at(L, 'twig', 12, 8),
    calmStart: at(L, 'green', -3, -40), green: P('green'),
    wadhaStart: at(L, 'green', -3, 2),              // she grazes beside the green patch
    rideStart: at(L, 'green', -2, -20),             // where she kneels for Dhari
    arrive: { x: 11, z: 28 },                       // end of the ride (≤ 12 m from the Sheikh)
    moudi: { x: -14.5, z: -3 }, fuhaid0: { x: -2, z: -8.5 }, hwar0: { x: -3.6, z: -9.6 },
    penFuhaid: { x: 2.6, z: 16.5 }, penHwar: { x: 4.4, z: 25.5 }, misfer: { x: -1.2, z: 15.5 },
  };
}

// ------------------------------------------------------------------------------------------------ actor helpers
/** get-or-spawn a character and place him (never re-spawns) */
function put(G, id, model, p, yaw = 0, clip = 'idle', opts = {}) {
  const N = G.actors.npcs;
  const n = N.get(id) || N.spawn(id, model, { x: p.x, z: p.z, yaw, ...opts });
  n.stop(); n.lookAtPlayer(false); n.place(p.x, p.z, yaw); n.play(clip);
  return n;
}
function putCamel(G, id, p, yaw, opts = {}) {
  const C = G.actors.camels;
  const c = C.get(id) || C.spawn(id, { x: p.x, z: p.z, yaw, ...opts });
  if (!c.ridden) { c.stop(); c.place(p.x, p.z, yaw); }
  return c;
}
/** fire-and-forget walk: the promise rejects with BeatAbort when the beat ends, which nobody awaits */
const go = (who, x, z, o) => { const pr = who.goTo(x, z, o); if (pr && pr.catch) pr.catch(() => {}); return pr; };
const wadhaOf = G => G.actors.camels.get('wadha');
/** F02: the riding beats count only once Dhari really sits on her — a cancelled mount is redone, never a lesson on foot */
async function seated(G, d, w) {
  const pl = G.actors.player, ok = () => pl.mounted === w && pl.mode === 'mounted';
  while (!ok()) {
    if (!pl.mounted) { const m = pl.mount(w); if (m && m.catch) m.catch(() => {}); }      // no-op while a mount is already running
    await d.until(ok, { timeout: 8 });
  }
  if (!w.ridden) w.ridden = true;
}
const player = G => G.actors.player;
const pdist = (G, p) => { const q = player(G).pos; return Math.hypot(q.x - p.x, q.z - p.z); };
/** walk an npc (or camel) somewhere with a timeout; teleport the rest of the way if it dawdles */
async function walk(G, d, who, p, { speed = 2, max = 14, stop = 0.5 } = {}) {
  const t = who.goTo(p.x, p.z, { speed, stop });
  await d.first({ arrived: t, late: d.wait(G.state.fastText ? 0.25 : max) });
  if (Math.hypot(who.pos.x - p.x, who.pos.z - p.z) > stop + 1.5) { who.stop(); who.place(p.x, p.z, who.yaw); }
}
/** the calf calls for its mother now and then (sound + a visual twin is the calf's own head-up) */
function calfCalls(G, d) {
  d.spawn(async d2 => {
    for (;;) { await d2.wait(8 + G.vrng.next() * 5); const c = G.actors.camels.get('hwar'); if (c) G.audio.sfx('sfx_calf', { at: c.pos, volume: 0.7 }); }
  });
}
/** ease the camera onto the beat's first target (no-op until camera.js provides frame) */
function frame(G, target, duration = 1) { const c = G.actors.cam; if (c.frame && target) { const r = c.frame(target, { duration }); if (r && r.catch) r.catch(() => {}); } }
/** Dhari kneels to read the ground (scripted for a moment) */
async function kneel(G, d, s = 1.2) {
  const pl = player(G);
  pl.setScripted(true);
  try { pl.actor.play('kneel', { fade: 0.2 }); await pause(G, d, s); pl.actor.play('idle', { fade: 0.25 }); }
  finally { pl.setScripted(false); }
}
/** hide / show the 3D canvas itself (the first beat starts from true black, before its own fade) */
function canvasVisible(G, on) { try { G.renderer.domElement.style.visibility = on ? '' : 'hidden'; } catch (e) { /* no DOM */ } }
/** let go of the camera at the end of a cinematic and tell the camera where the hero is */
function giveBackCamera(G, dur = 1) { const c = G.actors.cam; if (c.snap) c.snap(); c.release({ duration: dur }); }

// ------------------------------------------------------------------------------------------------ staging (one table, every beat)
function stage(G, L, id, resumed) {
  const i = ORDER.indexOf(id), p = places(L), pl = player(G), A = G.actors;
  // sky, HUD, senses, sound
  G.world.sky.setPreset(i <= 3 ? 'dawn' : 'morning', { duration: resumed ? 0 : (id === 'c1_trail' ? 30 : 0) });
  prompt(G, null);
  canvasVisible(G, !(id === 'c1_intro' && resumed));
  hud(G, { eye: i >= 4 });                        // the eye appears when the Sheikh's rule closes (c1_firasa)
  G.sys.firasa.setAllowed(i >= 4);
  if (L.fires && L.fires.camp) L.fires.camp.setLit(true);
  music(G, 'music_march', i === 0 ? 4 : 2.5);

  // authored tracks (owned by the beat)
  if (i >= 3 && i <= 4) { G.sys.tracks.add({ id: 'old', points: p.OLD, kind: 'camel', fresh: 0 }); }
  if (i >= 3 && i <= 5) { G.sys.tracks.add({ id: 'fresh', points: p.A, kind: 'camel', fresh: 1 }); }
  if (i === 6) { G.sys.tracks.add({ id: 'freshB', points: p.B, kind: 'camel', fresh: 1 }); }

  // she is only in the world from c1_calm on (before that she is the one who is missing)
  const wadhaP = i === 6 ? p.wadhaStart : i === 7 ? p.rideStart : at(L, 'pen', 5, 14);
  const wadha = putCamel(G, 'wadha', wadhaP, i === 7 ? yawTo(p.rideStart, L.poi('rideTop')) : 0, { tint: 0xf2ead8 });
  putCamel(G, 'hwar', i <= 1 ? p.hwar0 : p.penHwar, 0, { scale: 0.55, tint: 0xd8bf98 });
  if (wadha.setVisible) wadha.setVisible(i >= 6);
  if (i === 6 && wadha.kneeling && pl.mounted !== wadha) { const r = wadha.pose('rise', { duration: 0.01 }); if (r && r.catch) r.catch(() => {}); }   // a retry of c1_calm: she starts standing

  if (!resumed) return;

  // ---- cold start: place everybody and the hero
  const sheikhP = i <= 2 ? p.sheikhWell : p.sheikhPen;
  put(G, 'mani', 'mani', sheikhP, i <= 2 ? EAST : yawTo(sheikhP, p.gate));
  put(G, 'misfer', 'misfer', i === 8 ? { x: 4.5, z: 22.5 } : p.misfer, EAST);
  put(G, 'moudi', 'moudi', i === 8 ? { x: -4.5, z: 15 } : p.moudi, EAST, i === 8 ? 'idle' : 'sit');
  put(G, 'fuhaid', 'fuhaid', i <= 1 ? p.fuhaid0 : i === 8 ? { x: 3.5, z: 24 } : p.penFuhaid, 0);
  putCamel(G, 'hwar', i <= 1 ? p.hwar0 : p.penHwar, 0, { scale: 0.55 });

  const start = {
    c1_intro: { ...p.spawn, yaw: EAST }, c1_wake: { ...p.spawn, yaw: EAST },
    c1_well: { x: 3.4, z: 3.0, yaw: EAST },
    c1_firasa: { x: 4.2, z: 15.2, yaw: 0 },
    c1_trail: (() => { const a = along(p.A, 11); return { x: a.x, z: a.z, yaw: a.yaw }; })(),
    c1_gravel: { x: p.brk.x, z: p.brk.z, yaw: yawTo(p.brk, p.twig) },
    c1_calm: { ...p.calmStart, yaw: yawTo(p.calmStart, p.green) },
    c1_ride: { x: p.rideStart.x - 1.6, z: p.rideStart.z, yaw: yawTo(p.rideStart, L.poi('rideTop')) },
    c1_decision: { x: 8, z: 36, yaw: yawTo({ x: 8, z: 36 }, p.sheikhPen) },
  }[id];
  const wantMount = id === 'c1_ride' || id === 'c1_decision';
  const place = () => {
    if (id === 'c1_decision') { wadha.place(start.x + 1.6, start.z, start.yaw); }
    pl.teleport(start.x, start.z, start.yaw); if (A.cam.snap) A.cam.snap();
  };
  const mounted = pl.mounted;
  if (mounted && !(wantMount && mounted === wadha)) { pl.dismount().then(place, () => {}); }      // a cold restart while riding
  else { if (!mounted) place(); }
  if (wantMount && !pl.mounted) { place(); pl.mount(wadha).catch(() => {}); }        // (a restart mid-mount rejects it: nobody waits here)
}

// ------------------------------------------------------------------------------------------------ the beats
const BEATS = {
  // ---------------------------------------------------------------------------------------------- 1
  async c1_intro(G, L, d) {
    const p = places(L), T = G.world.terrain, cam = G.actors.cam;
    await d.fade(true, 0);                                         // black, wind
    canvasVisible(G, true); d.onEnd(() => canvasVisible(G, true));
    d.spawn(async d2 => { await d2.wait(2); prompt(G, 'c1_intro.label.skip'); await d2.wait(3); prompt(G, null); });
    await d.card('intro', { seconds: 2.0 });
    // the Sheikh's voice over the glide (auto-advancing toasts, not blocking), finished before the chapter card
    const vo = G.story.talk['c1_intro.vo'] || [];
    const voBranch = d.spawn(async d2 => {
      await d2.wait(0.3);
      for (const [who, text] of vo) { G.ui.hud.toast({ who, name: (G.story.names && G.story.names[who]) || '', text }, 3.0); await d2.wait(3.2); }
    });
    d.fade(false, 1.2);                                            // not awaited: the dunes come out of the dark while the camera moves
    const h = (x, z, up) => T.heightAt(x, z) + up;
    const landing = [p.spawn.x - Math.sin(EAST) * 4.05, h(p.spawn.x, p.spawn.z, 1.45 + 0.9), p.spawn.z - Math.cos(EAST) * 4.05];
    const lookAtHero = [p.spawn.x, h(p.spawn.x, p.spawn.z, 1.45), p.spawn.z];
    // the chapter card appears over the last, held shot (still a cinematic: no HUD, letterbox) and the whole beat stays ≤ 12 s
    let cardShown = false;
    const cardBranch = d.spawn(async d2 => { await d2.wait(G.state.fastText ? 0.05 : 7.1); cardShown = true; await d2.card('c1', { seconds: 2.5 }); });
    await d.cine([
      { pos: [-78, h(-78, -64, 20), -64], look: [-10, h(-10, 0, 4), 0], dur: 0.1, cut: true },
      { pos: [-52, h(-52, -30, 11), -30], look: [0, h(0, 2, 5), 2], dur: 2.7 },
      { pos: [-30, h(-30, -2, 5.5), -2], look: [8, h(8, 4, 2.6), 4], dur: 2.5 },
      { pos: landing, look: lookAtHero, dur: 1.8 },
      { pos: landing, look: lookAtHero, dur: 2.6 },
    ]);
    prompt(G, null);
    giveBackCamera(G, 0.01);                                       // lands behind Dhari, no fade
    if (!cardShown) { cardBranch.cancel(); voBranch.cancel(); await d.card('c1', { seconds: 2.4 }); }   // the glide was skipped: the chapter card still comes
    else await cardBranch.done;
    await d.until(() => G.state.mode === 'play', { timeout: 2 });
  },

  // ---------------------------------------------------------------------------------------------- 2
  async c1_wake(G, L, d) {
    const p = places(L), pl = player(G), mani = G.actors.npcs.get('mani');
    const fuhaid = G.actors.npcs.get('fuhaid'), moudi = G.actors.npcs.get('moudi'), calf = G.actors.camels.get('hwar');
    aim(d, 'c1_wake.obj', { at: mani.actor.root, hintAfter: [12, 28] });   // DESIGN §4: 12 s for the very first objective
    frame(G, mani.actor.root);
    calfCalls(G, d);
    const p0 = { x: pl.pos.x, z: pl.pos.z };
    // prompt 1 (move) until 1 m walked, prompt 2 (look) after 3 m
    prompt(G, 'c1_wake.prompt.move');
    d.spawn(async d2 => {
      await d2.until(() => dist2(pl.pos.x, pl.pos.z, p0.x, p0.z) > 1);
      prompt(G, null);
      await d2.until(() => dist2(pl.pos.x, pl.pos.z, p0.x, p0.z) > 9);
      prompt(G, 'c1_wake.prompt.look');
      const yaw0 = G.actors.cam.yaw;
      await d2.until(() => Math.abs(G.actors.cam.yaw - yaw0) > 0.35 || pdist(G, p.sheikhWell) < 4, { timeout: 9 });
      prompt(G, null);
    });
    // موضي greets him as he passes the tent
    d.spawn(async d2 => {
      await d2.until(() => dist2(pl.pos.x, pl.pos.z, p0.x, p0.z) > 2.25 && pdist(G, p.moudi) < 11);   // right after the first steps (he starts 8 m from her tent)
      moudi.lookAtPlayer(true);
      d2.bark('c1_wake.bark.1');
      await d2.wait(5); moudi.lookAtPlayer(false);
    });
    // فهيد and الحوار cross his path; the calf calls for its mother
    d.spawn(async d2 => {
      await d2.until(() => pdist(G, p.well) < 13);                 // ~10 m from the well; the look prompt and Moudi's greeting are long gone
      d2.bark('c1_wake.bark.2');
      G.audio.sfx('sfx_calf', { at: calf.pos });
      calf.follow(fuhaid, { dist: 2.4, speed: 3.4 });
      await walk(G, d2, fuhaid, p.penFuhaid, { speed: 2.9, max: 12 });
      calf.stop(); G.audio.sfx('sfx_calf', { at: calf.pos, volume: 0.8 });
      await d2.wait(3);
      fuhaid.lookAtPlayer(true);
    });
    await use(G, d, { id: 'mani', at: mani.actor.root, label: 'c1_wake.label.talk', radius: 2.6 });
    prompt(G, null); done(d);
    mani.lookAtPlayer(false);
    await d.talk('c1_wake.greet');
  },

  // ---------------------------------------------------------------------------------------------- 3
  async c1_well(G, L, d) {
    const p = places(L), pl = player(G), mani = G.actors.npcs.get('mani'), misfer = G.actors.npcs.get('misfer');
    aim(d, 'c1_well.obj', { at: p.well });
    frame(G, p.well);
    calfCalls(G, d);
    prompt(G, 'c1_well.prompt.hold');
    await use(G, d, { id: 'well', at: p.well, label: 'c1_well.label.pull', hold: 1.5, radius: 3.6 });
    prompt(G, null); done(d);
    G.audio.sfx('sfx_pulley', { at: p.well });
    // he pulls the bucket himself — mud
    pl.setScripted(true);
    try { pl.actor.faceTo(p.well.x, p.well.z, 10); pl.actor.play('pull', { fade: 0.2 }); await pause(G, d, 1.8); pl.actor.play('idle', { fade: 0.3 }); }
    finally { pl.setScripted(false); }
    await d.talk('c1_well.mud');
    // the sandgrouse cross the well and do not land; the Sheikh hears them
    const f = G.world.props.flock({ from: at(L, 'well', -95, -60), to: at(L, 'well', 95, 60), count: 15, height: 17, speed: 13 });
    d.own(f); f.pass(); G.audio.sfx('sfx_qata', { at: p.well });
    mani.actor.faceTo(p.well.x + 4, p.well.z - 30, 3);
    d.bark('c1_well.bark.1');
    await pause(G, d, 4.2);
    // مسفر comes running from the pen: الوضحا is gone
    misfer.actor.faceTo(p.well.x, p.well.z, 6);
    await walk(G, d, misfer, { x: 3.8, z: 5.2 }, { speed: 4.4, max: 9, stop: 0.8 });
    misfer.lookAtPlayer(true); mani.lookAtPlayer(true);
    await d.talk('c1_well.misfer');
  },

  // ---------------------------------------------------------------------------------------------- 4
  async c1_firasa(G, L, d) {
    const p = places(L), pl = player(G), mani = G.actors.npcs.get('mani');
    mani.lookAtPlayer(false);
    calfCalls(G, d);
    const gateSpot = p.sheikhPen;
    aim(d, 'c1_firasa.obj', { at: gateSpot });
    frame(G, gateSpot);
    // he walks to the pen; Dhari follows
    if (Math.hypot(mani.pos.x - gateSpot.x, mani.pos.z - gateSpot.z) > 2) go(mani, gateSpot.x, gateSpot.z, { speed: 2.3, stop: 0.6 });
    await d.near(gateSpot, 7);
    await d.until(() => Math.hypot(mani.pos.x - gateSpot.x, mani.pos.z - gateSpot.z) < 2.5, { timeout: 12 });
    mani.stop(); mani.lookAtPlayer(true);
    await d.talk('c1_firasa.rule');
    // the eye appears
    hud(G, { eye: true }); G.sys.firasa.setAllowed(true);
    aim(d, 'c1_firasa.obj', { at: p.insFresh });
    prompt(G, 'c1_firasa.prompt.eye');
    d.spawn(async d2 => {
      await d2.until(() => G.sys.firasa.active || G.sys.firasa.amount > 0.5);
      await d2.until(() => !G.sys.firasa.active && G.sys.firasa.amount > 0.05);
      prompt(G, 'c1_firasa.prompt.afterglow');
      await d2.wait(6.5); prompt(G, null);
    });
    d.spawn(async d2 => { await d2.wait(30); prompt(G, null); });
    // two sets of prints: the old (decoy) and the fresh one
    let picked = null;
    const add = (id, pt, v) => d.own(G.sys.interact.add({ id, at: pt, label: 'c1_firasa.label.inspect', hold: 1, radius: 2.8, once: true, onUse: () => { picked = v; } }));
    add('ins_fresh', p.insFresh, 'fresh'); add('ins_old', p.insOld, 'old');
    G.sys.firasa.addClue({ id: 'ins_fresh', at: p.insFresh, type: 'track', radius: 40 });
    for (;;) {
      await d.until(() => picked);
      prompt(G, null);
      await kneel(G, d, 1.3);
      if (picked === 'old') { picked = null; await d.talk('c1_firasa.wrong'); aim(d, 'c1_firasa.obj', { at: p.insFresh }); continue; }
      break;
    }
    done(d);
    await d.talk('c1_firasa.right');
    mani.lookAtPlayer(false);
  },

  // ---------------------------------------------------------------------------------------------- 5
  async c1_trail(G, L, d) {
    const p = places(L), pl = player(G);
    aim(d, 'c1_trail.obj', { at: p.brk });
    frame(G, along(p.A, 22));
    const start = { x: pl.pos.x, z: pl.pos.z };
    let ran = false;
    d.spawn(async d2 => {                                         // run prompt after ~10 m on the trail
      await d2.until(() => dist2(pl.pos.x, pl.pos.z, start.x, start.z) > 100);
      prompt(G, 'c1_trail.prompt.run');
      await d2.until(() => { if (pl.speed > 3.3) ran = true; return ran; }, { timeout: 9 });
      prompt(G, null);
    });
    d.spawn(async d2 => {                                         // at the crest, halfway
      await d2.until(() => pdist(G, L.poi('ridge')) < 6);
      toast(G, 'c1_trail.toast.read', 4);
    });
    await d.near(p.brk, 6);
    prompt(G, null); done(d);
  },

  // ---------------------------------------------------------------------------------------------- 6
  async c1_gravel(G, L, d) {
    const p = places(L), pl = player(G);
    const found = { twig: false, dung: false };
    const clues = [
      { id: 'twig', at: p.twig, label: 'c1_gravel.label.twig', talk: 'c1_gravel.twig' },
      { id: 'dung', at: p.dung, label: 'c1_gravel.label.dung', talk: 'c1_gravel.dung' },
    ];
    const nextClue = () => clues.find(c => !found[c.id]) || clues[1];
    const reaim = () => aim(d, 'c1_gravel.obj', { at: nextClue().at });
    reaim();
    frame(G, p.twig);
    for (const c of clues) {
      G.sys.firasa.addClue({ id: 'gv_' + c.id, at: c.at, type: 'sign', radius: 45 });
      d.spawn(async d2 => {
        await use(G, d2, { id: 'gv_' + c.id, at: c.at, label: c.label, hold: 1, radius: 2.8 });
        await kneel(G, d2, 1.1);
        found[c.id] = true; if (!(found.twig && found.dung)) reaim();
        await d2.talk(c.talk);
      });
    }
    await d.until(() => found.twig && found.dung);
    await d.until(() => G.state.mode === 'play');
    done(d);
    // the trail comes back out of the gravel
    G.sys.tracks.add({ id: 'freshB', points: p.B, kind: 'camel', fresh: 1 });
    G.sys.tracks.add({ id: 'wolf', points: p.WOLF, kind: 'wolf', fresh: 0.85, spacing: 0.95 });
    aim(d, 'c1_gravel.follow.obj', { at: p.calmStart });
    // optional: a wolf's print crossing the trail
    d.spawn(async d2 => {
      G.sys.firasa.addClue({ id: 'wolfprint', at: p.wolfP, type: 'creature', radius: 45 });
      await use(G, d2, { id: 'wolfprint', at: p.wolfP, label: 'c1_gravel.label.wolf', hold: 0.8, radius: 3 });
      await kneel(G, d2, 1.2);
      d2.flag('sawWolfPrint', true);
      await d2.talk('c1_gravel.wolf');
    });
    await d.near(p.calmStart, 6);
    done(d);
  },

  // ---------------------------------------------------------------------------------------------- 7
  async c1_calm(G, L, d) {
    const p = places(L), pl = player(G), w = wadhaOf(G), S = G.sys.steady;
    if (w.setVisible) w.setVisible(true);
    aim(d, 'c1_calm.obj', { at: w.root });
    frame(G, w.root);
    d.spawn(async d2 => { await d2.until(() => pdist(G, w.pos) < 46); d2.bark('c1_calm.bark.1'); });
    const wpos = () => w.pos;
    // running at her: warning inside 30 m, she bolts inside 18 m (twice at most, then she only shies)
    let state = 'wild', warned = false, bolts = 0, cool = 0;
    d.spawn(async d2 => {
      await d2.task(dt => {
        if (state !== 'wild') return true;
        cool -= dt;
        const dist = pdist(G, wpos()), running = pl.mode === 'foot' && pl.speed > 3.3;
        if (!running) return undefined;
        if (dist < 18 && cool <= 0) {
          cool = 5; bolts++;
          const dx = wpos().x - pl.pos.x, dz = wpos().z - pl.pos.z, l = Math.hypot(dx, dz) || 1, run = bolts <= 2 ? 25 : 6;
          let tx = wpos().x + dx / l * run, tz = wpos().z + dz / l * run;
          const gd = Math.hypot(tx - p.green.x, tz - p.green.z);
          if (gd > 42) { tx = p.green.x + (tx - p.green.x) * 42 / gd; tz = p.green.z + (tz - p.green.z) * 42 / gd; }
          if (w.pose) w.pose('raiseHead', { duration: 0.6 });
          G.audio.sfx('sfx_camel', { at: w.pos, volume: 0.9, rate: 1.1 });
          go(w, tx, tz, { speed: bolts <= 2 ? 5.2 : 3.6, stop: 1.5 });
          toast(G, 'c1_calm.toast.bolt', 3.8);
        } else if (dist < 30 && !warned) {
          warned = true;
          if (w.pose) w.pose('raiseHead', { duration: 1.2 });
          G.audio.sfx('sfx_camel', { at: w.pos, volume: 0.7, rate: 1.2 });
          toast(G, 'c1_calm.toast.warn', 4);
        }
        return undefined;
      });
    });
    // approach calmly to 5 m
    await d.until(() => pdist(G, wpos()) < 5);
    done(d);
    state = 'steady';
    const dx = pl.pos.x - w.pos.x, dz = pl.pos.z - w.pos.z;
    if (w.face) w.face(Math.atan2(dx, dz), 6);
    prompt(G, 'c1_calm.prompt.steady');
    const head = w.head || w.root;
    const ok = await S.hold({
      target: head, seconds: 3, labelKey: 'c1_calm.label.steady',
      stages: [
        () => { if (w.pose) w.pose('lowerHead', { duration: 1.1 }); toast(G, 'c1_calm.toast.soothe', 3.8); },
        () => { if (w.lookAt) w.lookAt(pl.pos); if (w.pose) w.pose('raiseHead', { duration: 0.8 }); },
      ],
    });
    prompt(G, null);
    void ok;
    // she steps in and kneels on the kneel-call
    toast(G, 'c1_calm.toast.kneel', 3.8);
    // she steps in beside him (ahead-left, broadside to the camera, so Dhari does not hide her) and kneels facing his side
    const k = Math.hypot(w.pos.x - pl.pos.x, w.pos.z - pl.pos.z) || 1, fx = (w.pos.x - pl.pos.x) / k, fz = (w.pos.z - pl.pos.z) / k;
    const spot = { x: pl.pos.x + fx * 1.0 + fz * 2.2, z: pl.pos.z + fz * 1.0 - fx * 2.2 };
    await walk(G, d, w, spot, { speed: 1.4, max: 8, stop: 0.4 });
    if (w.face) w.face(Math.atan2(-fx, -fz), 5);
    await d.wait(0.4);
    await w.pose('kneel', { duration: 1.2 });
    if (w.lookAt) w.lookAt(null);
    // mount
    aim(d, 'c1_calm.mount.obj', { at: w.root });
    await use(G, d, { id: 'mount', at: w.root, label: 'c1_calm.label.mount', radius: 3.4 });
    done(d);
    await player(G).mount(w);
    if (!w.ridden) w.ridden = true;
    toast(G, 'c1_calm.toast.mount', 3.8);
  },

  // ---------------------------------------------------------------------------------------------- 8
  async c1_ride(G, L, d) {
    const p = places(L), pl = player(G), w = wadhaOf(G), top = L.poi('rideTop');
    await seated(G, d, w);
    aim(d, 'c1_ride.obj', { at: top });
    frame(G, top, 1.2);
    prompt(G, 'c1_ride.prompt.ride');
    d.spawn(async d2 => {
      await d2.wait(5);
      prompt(G, 'c1_ride.prompt.trot');
      await d2.until(() => pl.speed > 3.6, { timeout: 10 });
      prompt(G, null);
    });
    d.spawn(async d2 => { await d2.wait(10); prompt(G, null); });
    await d.near(top, 9);
    prompt(G, null);
    d.bark('c1_ride.bark.1');                                      // the crest reveals the camp in morning light
    frame(G, L.poi('camp'), 1.6);
    aim(d, 'c1_ride.obj', { at: p.arrive });
    await d.near(p.arrive, 6);
    done(d);
    // the calf runs to its mother
    const calf = G.actors.camels.get('hwar');
    d.bark('c1_ride.bark.2');
    G.audio.sfx('sfx_calf', { at: calf.pos });
    go(calf, w.pos.x + 2.4, w.pos.z - 1, { speed: 4.6, stop: 2.2 });
    await pause(G, d, 2.4);
  },

  // ---------------------------------------------------------------------------------------------- 9
  async c1_decision(G, L, d) {
    const p = places(L), pl = player(G), w = wadhaOf(G);
    const mani = G.actors.npcs.get('mani'), misfer = G.actors.npcs.get('misfer'), moudi = G.actors.npcs.get('moudi'), fuhaid = G.actors.npcs.get('fuhaid');
    const calf = G.actors.camels.get('hwar');
    await seated(G, d, w);
    aim(d, 'c1_decision.obj', { at: mani.actor.root });
    frame(G, mani.actor.root, 1.2);
    mani.actor.faceTo(pl.pos.x, pl.pos.z, 2);
    calf.follow(w, { dist: 2.2, speed: 3.6 });
    await d.near(mani.actor.root, 4.6);
    done(d);
    // she kneels at the Sheikh's hand, Dhari steps down
    calf.stop();
    await pl.dismount();
    w.ridden = false;
    misfer.lookAtPlayer(true); moudi.lookAtPlayer(true);
    mani.actor.faceTo(w.pos.x, w.pos.z, 4);                        // he reaches for her muzzle
    frame(G, mani.actor.root, 0.8);                                // the camel kneels between the camera and the Sheikh: swing the view onto him
    await d.talk('c1_decision.green');
    mani.lookAtPlayer(true);
    await d.talk('c1_decision.rahil');
    // the others turn to the tents; the Sheikh keeps Dhari back
    moudi.lookAtPlayer(false); misfer.lookAtPlayer(false); fuhaid.lookAtPlayer(false);
    go(moudi, -6, 4, { speed: 1.8 }); go(fuhaid, -3, 1, { speed: 2.4 }); go(misfer, -1, 12, { speed: 2 });
    await pause(G, d, 1.8);
    await d.talk('c1_decision.eyes');
    await d.card('c1_end');
  },
};

export default {
  id: 'ch1', index: 1, assets: 'ch1', level: LEVELS.camp, sky: 'dawn', lst: undefined,
  survival: { thirst: 100, sips: 0, drain: false },
  setup(G, L) {
    // the Sheikh's call at the edge of the playable area
    let last = -99;
    const off = G.events.on('player:bounds', () => { if (G.time.now - last > 6) { last = G.time.now; toast(G, 'c1.bounds', 4); } });
    L.own({ remove: off });
    // a bitten ghada bush where the twig is
    const tw = L.poi('twig');
    G.world.props.scatter('shrub', { count: 3, x: tw.x, z: tw.z, r: 1.4, seed: 17 });
  },
  beats: ORDER.map(id => ({
    id, startBlack: id === 'c1_intro',
    enter(G, L, ctx) { stage(G, L, id, ctx.resumed); },
    run: BEATS[id],
    bot: botStep,
  })),
};
