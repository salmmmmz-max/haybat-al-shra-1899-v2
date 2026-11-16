/**
 * Chapter 4 «حقّ الملح» — L3 «أم الحيا», morning → dusk → night. Teaches the hard choice; the exam is finding the well alone.
 * Beats: c4_stranger · c4_collapse · c4_search · c4_search2 · c4_ridge.   Flags read: gaveWater (set here).
 * Text: only keys (STORY); helpers: ch4-fx.js (vultures, qata flight line, dialogue line hooks).
 * Water (DESIGN §4, rule in systems/survival.js): the قربة is locked (toast «water.locked.c4») until the c4_stranger decision; the choice moves
 * the single sip — «اسقِه» gives it to جابر (sips = 0, no benefit for Dhari), «امضِ» keeps it for Dhari (he may drink it in c4_search).
 */
import { LEVELS } from './levels.js';
import { at, yawTo, cast, camel, toast, prompt, hud, goal, use, music, pause } from './kit.js';
import { circler, ribbon, hookLines } from './ch4-fx.js';
import { yawOf, smoothstep, clamp } from '../core/math.js';

const BEATS = ['c4_stranger', 'c4_collapse', 'c4_search', 'c4_search2', 'c4_ridge'];
const SKY = { c4_stranger: 'morning', c4_collapse: 'noon', c4_search: 'dusk', c4_search2: 'dusk', c4_ridge: 'night' };
const SKY_FADE = { c4_search: 5 };                                    // seconds of visible sky change when the beat is entered in sequence
const COOL = { c4_stranger: 0, c4_collapse: 0, c4_search: -0.08, c4_search2: -0.1, c4_ridge: -0.16 };   // thirst relief (golden hour, night)
const TINTS = [0xc9a877, 0xb08a5a, 0x9c7748];
const SUHAIL_BEARING = 154, JADY_BEARING = 0;
const CAIRN_H = 3.4;

/** per-session progress inside a beat: a retry after a thirst fall wakes the hero at the last cairn reached */
const S = { beat: null, reached: 0, alone: false, title: false, mount: null, bg: [], sun: null, bones: false };
let W = null;                                                         // places (derived from the level's pois)

// ------------------------------------------------------------------------------------------------ places
const gy = (G, x, z) => G.world.terrain.heightAt(x, z);
/** highest dune top within r of a poi (a cairn stands on the skyline) */
function crestNear(G, p, r = 14) {
  let best = p, bs = -1e9;
  for (let dx = -r; dx <= r; dx += 2) for (let dz = -r; dz <= r; dz += 2) {
    const d = Math.hypot(dx, dz); if (d > r) continue;
    const s = gy(G, p.x + dx, p.z + dz) - d * 0.12;
    if (s > bs) { bs = s; best = { x: p.x + dx, z: p.z + dz }; }
  }
  return best;
}
function places(G, L) {
  if (W && W.L === L) return W;
  const man = at(L, 'stranger');
  const A = at(L, 'acacia');
  W = {
    L, man,
    start: at(L, 'start', -4, -22),
    acacia: A,
    campLead: { x: A.x + 5, z: A.z - 6 },
    wadhaCamp: { x: A.x + 10, z: A.z + 5 },
    bones: at(L, 'bones'), crest: at(L, 'crest'), fire: at(L, 'fire'), well: at(L, 'well'),
    cairn: [null, crestNear(G, at(L, 'cairn1')), crestNear(G, at(L, 'cairn2')), crestNear(G, at(L, 'cairn3')), crestNear(G, at(L, 'cairn4'), 8)],
  };
  return W;
}
const topOf = (G, p) => ({ x: p.x, y: gy(G, p.x, p.z) + CAIRN_H + 0.2, z: p.z });
/** camera / actor spots around the man: `along` away from the dead camel, `across` to its side, `h` above the ground */
function spot(G, p, c, along, across, h = 0) {
  const x = p.x + c.x * along - c.z * across, z = p.z + c.z * along + c.x * across;
  return [x, gy(G, x, z) + h, z];
}
const flat = (G, p, dy) => [p.x, gy(G, p.x, p.z) + dy, p.z];
/** walk an npc to a spot; the pose is applied only after he has really stopped (npc.standStill keeps overriding clips while he decelerates) */
const walkPose = (G, n, x, z, o, then) => bg(n.goTo(x, z, o).then(() => G.scope.sleep(G.state.fastText ? 0.05 : 0.8)).then(then));
const bg = (promise) => { if (promise && promise.catch) promise.catch(() => {}); return promise; };

// ------------------------------------------------------------------------------------------------ staging
/** the camp under the acacia: mode 'arrive' (halted, riders still up) or 'rest' (kneeling, everyone down) */
function stageCamp(G, L, mode) {
  const A = W.acacia, N = G.actors.npcs, C = G.actors.caravan;
  const wad = G.actors.camels.get('wadha');
  const members = C.members;
  const ring = i => { const a = 0.5 + i * 0.95; return { x: A.x + Math.sin(a) * 11, z: A.z + Math.cos(a) * 11 + 3 }; };
  members.forEach((c, i) => { const p = ring(i); c.place(p.x, p.z, yawOf(p.x - A.x, p.z - A.z) + (i % 2 ? 1.57 : -1.57)); });
  C.scatterTo(members.map((c, i) => ring(i)));
  const spots = restSpots();
  if (mode === 'rest') {
    members.forEach(c => c.pose('kneel', { duration: 0.01 }));
    for (const id of Object.keys(spots)) { const s = spots[id]; const n = N.get(id); if (n) { if (n.riding) n.unride(); n.place(s.x, s.z, s.yaw); n.play(s.clip); } }
    const calf = G.actors.camels.get('hwar'); if (calf) calf.place(A.x - 3.5, A.z + 6.5, 1.0);
  } else {
    ['mani', 'misfer', 'moudi', 'fuhaid', 'jaber'].forEach((id, i) => { const n = N.get(id), c = members[i]; if (n && c && !n.riding) n.ride(c); });
    const calf = G.actors.camels.get('hwar'); if (calf) calf.place(A.x - 6, A.z - 4, 0.3);
  }
}
function restSpots() {
  const A = W.acacia, face = (x, z) => yawOf(A.x - 1.4 - x, A.z + 4.2 - z);
  const sp = (dx, dz, clip) => ({ x: A.x + dx, z: A.z + dz, clip, yaw: face(A.x + dx, A.z + dz) });
  return {
    mani: { x: A.x - 1.4, z: A.z + 4.2, clip: 'lie', yaw: 1.2 },
    misfer: sp(1.6, 7.2, 'idle'), moudi: sp(-4.6, 6.4, 'sit'), fuhaid: sp(-3.6, 2.2, 'sit'), jaber: sp(-6.4, 4.6, 'sit'),
  };
}
const CAST = { mani: 'mani', misfer: 'misfer', moudi: 'moudi', fuhaid: 'fuhaid', jaber: 'jaber' };

/** every beat start: absolute and idempotent */
function stage(G, L, id, resumed, force = false) {
  const w = places(G, L), pl = G.actors.player, sv = G.sys.survival, sky = G.world.sky, N = G.actors.npcs, C = G.actors.caravan, fl = G.state.flags;
  const i = BEATS.indexOf(id);
  if (!(resumed && S.beat === id)) { S.beat = id; S.reached = 0; S.alone = false; }   // a retry (cold start of the same beat) keeps S.reached
  S.mount = null; S.bones = false;
  sky.setPreset(id === 'c4_search2' && resumed && S.reached >= 3 ? 'night' : SKY[id], { duration: resumed ? 0 : (SKY_FADE[id] || 0) });   // a retry after night had fallen wakes in the night
  if (sky.stars && sky.stars.setLST) sky.stars.setLST(19, { duration: 0 });
  hud(G, { eye: true, water: true, strip: true });
  G.sys.firasa.setAllowed(true);
  sv.rate('c4_cool', COOL[id]);
  sv.lockDrink(id === 'c4_stranger', 'water.locked.c4');                // the single sip is the stranger decision's
  if (resumed && fl.gaveWater && sv.sips > 0) sv.set({ sips: 0 });
  if (L.fires.well) L.fires.well.setLit(i >= 3);
  music(G, id === 'c4_search2' || id === 'c4_ridge' ? (id === 'c4_ridge' ? 'music_night' : 'music_march') : 'music_march');
  const O = G.sys.objectives;
  if (S.sun) { S.sun.remove(); S.sun = null; }
  if (i < 4) S.sun = O.mark('sun', { bearingFn: () => sky.sunBearing(), icon: 'sun' });
  if (id === 'c4_ridge') { O.mark('jady', { bearingFn: () => JADY_BEARING, icon: 'jady' }); O.mark('suhail', { bearingFn: () => SUHAIL_BEARING, icon: 'suhail' }); }

  const cams = G.actors.camels;
  /** player on wadha at (x, z) facing yaw; only rebuilt when the state does not match */
  const rider = (p, yaw, force) => {
    let wad = cams.get('wadha');
    if (force || !pl.mounted || !wad) {
      pl.spawn(p.x, p.z, yaw);                                        // resets any stale mount first
      wad = camel(G, 'wadha', p, yaw);
      wad.pose('kneel', { duration: 0.01 });
      S.mount = bg(pl.mount(wad));
    } else { pl.teleport(p.x, p.z, yaw); }
    return wad;
  };
  const foot = (p, yaw) => { if (pl.mode !== 'foot' || pl.mounted) pl.spawn(p.x, p.z, yaw); else pl.teleport(p.x, p.z, yaw); };
  const formCaravan = (lead, riders) => {
    if (C.members.length !== 5) C.form({ lead, camels: 5, tints: TINTS, walkers: [], riders });
    const calf = camel(G, 'hwar', { x: lead.pos.x - 8, z: lead.pos.z - 14 }, 0, { scale: 0.55 });
    if (id === 'c4_stranger') calf.follow(lead, { dist: 6, speed: 2.6 });
  };

  switch (id) {
    case 'c4_stranger': {
      const yaw = yawTo(w.start, w.man);
      const wad = rider(w.start, yaw, true);
      ['mani', 'misfer', 'moudi', 'fuhaid'].forEach((n, k) => cast(G, n, CAST[n], { x: w.start.x, z: w.start.z - 8 - k * 4.5 }, yaw));
      C.clear(); N.get('jaber') && N.remove('jaber');
      formCaravan(wad, [0, 1, 2, 3].map(k => ({ npc: ['mani', 'misfer', 'moudi', 'fuhaid'][k], index: k })));
      const sun = sky.sunDir, sx = sun ? sun.x : 0.5, sz = sun ? sun.z : 0.3, sl = Math.hypot(sx, sz) || 1;
      const jp = { x: w.man.x - (sx / sl) * 2.4 + 1.2, z: w.man.z - (sz / sl) * 2.4 - 0.4 };
      cast(G, 'jaber', 'jaber', jp, 2.2, { clip: 'lie' });
      w.jaber = jp;
      const cx = jp.x - w.man.x, cz = jp.z - w.man.z, cl = Math.hypot(cx, cz) || 1;
      w.jc = { x: cx / cl, z: cz / cl };
      break;
    }
    case 'c4_collapse': {
      const lead = w.campLead, yaw = yawTo(lead, w.acacia);
      C.clear();
      const wad = rider(lead, yaw, true);
      ['mani', 'misfer', 'moudi', 'fuhaid', 'jaber'].forEach((n, k) => cast(G, n, CAST[n], { x: w.acacia.x - 10 - k * 4, z: w.acacia.z - 20 }, yaw));
      formCaravan(wad, ['mani', 'misfer', 'moudi', 'fuhaid', 'jaber'].map((n, k) => ({ npc: n, index: k })));
      stageCamp(G, L, 'arrive');
      break;
    }
    case 'c4_search': {
      const next = S.reached >= 1 ? w.cairn[1] : w.cairn[1];
      const start = S.reached >= 1 ? w.cairn[1] : { x: w.wadhaCamp.x + 5, z: w.wadhaCamp.z + 10 };
      if (resumed) {
        C.clear();
        rider(start, yawTo(start, S.reached >= 1 ? w.cairn[2] : next), true);
        ['mani', 'misfer', 'moudi', 'fuhaid', 'jaber'].forEach(n => cast(G, n, CAST[n], w.acacia, 0));
        formCaravan(cams.get('wadha'), []);
        stageCamp(G, L, 'rest');
      } else rider(start, yawTo(start, next), false);
      break;
    }
    case 'c4_search2': {
      clearCamp(G);
      const start = S.reached >= 3 ? w.cairn[3] : w.cairn[2];
      if (resumed) rider(start, yawTo(start, S.reached >= 3 ? w.cairn[4] : w.cairn[3]), true);
      break;
    }
    case 'c4_ridge': {
      clearCamp(G);
      if (resumed) rider(w.cairn[4], yawTo(w.cairn[4], w.crest), true);
      break;
    }
  }
  if (resumed) G.actors.cam.snap();
}
function clearCamp(G) {
  const N = G.actors.npcs;
  for (const id of Object.keys(CAST)) N.remove(id);
  G.actors.caravan.clear(); G.actors.camels.remove('hwar');
}

// ------------------------------------------------------------------------------------------------ shared run helpers
/** the mount that enter() started (cold starts) */
const ready = d => (S.mount ? d.wrap(S.mount) : Promise.resolve());
/** fail-soft before the kernel's collapse: the retry line depends on who is with him */
function thirstGuard(G, d, key) {
  d.spawn(async d2 => { await d2.until(() => G.sys.survival.thirst <= 1.2 && G.state.mode === 'play'); await d.failAndRestart(key); });
}
function normalizeAutoChoice(G) {
  const ac = G.state.autoChoice; if (ac && typeof ac.c4_stranger === 'string') ac.c4_stranger = /^(give|true|yes|1)$/i.test(ac.c4_stranger);
}
const cut = (G, pos, look) => G.actors.cam.cut(pos, look);
const release = G => G.actors.cam.release({ duration: 1 });
const above = (G, p, dy) => [p.x, gy(G, p.x, p.z) + dy, p.z];

/** one sandgrouse flight (behind the hero → toward the well) with its flight line for الفراسة and the panned call */
async function flight(G, L, d, n, first) {
  const pl = G.actors.player.pos, well = W.well;
  let dx = well.x - pl.x, dz = well.z - pl.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
  const side = (n % 2 ? 1 : -1) * 15;
  const from = { x: pl.x - dx * 110 - dz * side, z: pl.z - dz * 110 + dx * side };
  const to = { x: well.x - dz * side * 0.3, z: well.z + dx * side * 0.3 };
  const fl = G.world.props.flock({ from, to, count: 14, height: 20, speed: 17 });
  d.own(fl);
  const rb = ribbon(G, from, to, 20); d.own(rb);
  const fa = G.sys.firasa;
  let t = 0, snd = 0;
  const watch = d.task(dt => {
    t += dt; snd -= dt;
    rb.set(Math.min(0.55, (fa.amount || 0) * 0.55) * (t < 40 ? 1 : 0));
    if (snd <= 0 && fl.position) { snd = 3.6; G.audio.sfx('sfx_qata', { at: fl.position }); }
    if (first) {
      const wantPrompt = t < 16 && !(fa.active || fa.amount > 0.3);
      if (wantPrompt && !watch.__p) { watch.__p = true; prompt(G, 'c4_search.prompt.qata'); }
      if (!wantPrompt && watch.__p) { watch.__p = false; prompt(G, null); }
    }
    return t > 44 ? true : undefined;
  });
  bg(watch);
  if (first) d.bark('c4_search.bark.1');
  await fl.pass();
  if (first) prompt(G, null);
  await d.wait(G.state.fastText ? 0.05 : 6);               // the afterglow keeps the line lit a little longer
}
/** a flight every 30 s */
function flightLoop(G, L, d, first, firstDelay) {
  return d.spawn(async d2 => {
    await d2.wait(G.state.fastText ? 0.05 : firstDelay);
    for (let n = 0; ; n++) {
      d2.spawn(async d3 => { await flight(G, L, d3, n, first && n === 0); });
      await d2.wait(G.state.fastText ? 6 : 30);
    }
  });
}
/** glow on the cairn top — "the last light" — brightened by the eye */
function cairnGlow(G, d, p) {
  const g = G.world.props.glow(topOf(G, p), { color: 0xffc060, size: 2.6 });
  d.own(g);
  d.spawn(async d2 => { await d2.task(() => { g.set(0.55 + 0.45 * (G.sys.firasa.amount || 0)); return undefined; }); });
  return g;
}
/** ride to cairn i and "inspect" it (context verb, usable from the saddle) */
async function visitCairn(G, L, d, i, o) {
  const p = W.cairn[i];
  const gl = cairnGlow(G, d, p);
  goal(d, o.obj, { at: p });
  G.actors.cam.frame(p);
  await use(G, d, { id: 'cairn' + i, at: p, label: o.label, radius: 3.2, mountedOk: true });
  d.objectiveDone(); gl.set(0); gl.remove();
  S.reached = i;
  await pause(G, d, 0.5);
}

// ------------------------------------------------------------------------------------------------ the chapter
export default {
  id: 'ch4', index: 4, assets: 'ch4', level: LEVELS.haya, sky: 'morning', lst: undefined,
  survival: { thirst: 36, sips: 1, drain: true },
  setup(G, L) {
    const w = places(G, L);
    S.beat = null; S.reached = 0; S.alone = false; S.title = false; S.mount = null; S.sun = null;
    G.world.props.deadCamel(w.man.x, w.man.z, 0.6);
    for (let i = 1; i <= 4; i++) G.world.props.cairn(w.cairn[i].x, w.cairn[i].z, { h: CAIRN_H });
    G.world.props.bones(w.bones.x, w.bones.z);
    const v1 = circler(G, { x: w.man.x, z: w.man.z, r: 13, h: 19, n: 5, speed: 4.2, scale: 2.8 });
    const v2 = circler(G, { x: w.bones.x, z: w.bones.z, r: 11, h: 17, n: 4, speed: 3.8, scale: 2.8 });
    L.own(v1); L.own(v2);
    bg(L.scope.task(dt => { v1.update(dt); v2.update(dt); return undefined; }));
    let lastBounds = -99;
    L.own(G.events.on('player:bounds', () => { if (G.time.now - lastBounds > 6) { lastBounds = G.time.now; toast(G, 'c4.bounds', 4); } }));
    L.own(G.events.on('survival:denied', e => { if (e && e.key) toast(G, e.key, 4); }));        // the locked قربة explains itself
  },
  beats: [
    // ------------------------------------------------------------------------------------------ 1
    {
      id: 'c4_stranger',
      enter(G, L, ctx) { stage(G, L, 'c4_stranger', ctx.resumed); },
      async run(G, L, d) {
        const w = places(G, L), pl = G.actors.player, N = G.actors.npcs, C = G.actors.caravan, sv = G.sys.survival;
        normalizeAutoChoice(G);
        await ready(d);
        if (!S.title) { S.title = true; await d.card('c4'); }          // the chapter title (once per chapter start, not on a retry)
        thirstGuard(G, d, 'fail.thirst.self');
        d.own(pl.limit('c4_lead', { speed: 2.4, run: false }));
        const wad = G.actors.camels.get('wadha');
        C.follow(true);
        G.actors.cam.frame(w.man);
        goal(d, 'c4_stranger.obj', { at: w.man });
        d.spawn(async d2 => { await d2.wait(G.state.fastText ? 0.1 : 1.5); d2.bark('c4_stranger.bark.1'); await d2.wait(G.state.fastText ? 0.1 : 4.2); d2.bark('c4_stranger.bark.2'); });

        await use(G, d, { id: 'c4_inspect', at: w.man, label: 'c4_stranger.label.inspect', radius: 4, mountedOk: true });
        d.objectiveDone();
        C.halt();
        await pl.dismount();
        const man = N.get('jaber'), hand = w.jaber;

        // ---- the find
        const c = w.jc, shotAt = (a, b, h) => spot(G, hand, c, a, b, h), eye = (dy) => flat(G, hand, dy), toXZ = a => [a[0], a[2]];
        /** a camera in front of the man's face (his yaw ± off), r metres away, h up — the close shots must show his face, not his back */
        const facing = (off, r, h) => { const y = man.yaw + off, x = hand.x + Math.sin(y) * r, z = hand.z + Math.cos(y) * r; return [x, Math.max(gy(G, x, z), gy(G, hand.x, hand.z)) + h, z]; };
        { const wp = spot(G, hand, c, 1.0, 6.0); bg(wad.goTo(wp[0], wp[2], { speed: 1.8, stop: 0.6 })); }   // الوضحا steps aside: she stood in every close shot
        hookLines(G, d, {
          'c4_stranger.find:1': () => cut(G, shotAt(4.2, -3.2, 1.9), flat(G, w.man, 0.9)),
          'c4_stranger.find:3': () => cut(G, facing(0.8, 1.9, 1.0), eye(0.35)),
          'c4_stranger.find:5': () => release(G),
        });
        await d.talk('c4_stranger.find');
        release(G);

        // ---- the choice
        const give = await d.choice('c4_stranger.ask', [
          { key: 'c4_stranger.choice.give', value: true, confirm: true },
          { key: 'c4_stranger.choice.refuse', value: false, confirm: true },
        ]);
        d.flag('gaveWater', !!give);
        sv.lockDrink(false);
        if (give) sv.set({ sips: 0 });                                  // the sip is spent here, once: it is جابر's now (the line hook only adds the sound)
        const pend = [];
        if (give) {
          hookLines(G, d, {
            'c4_stranger.give:1': () => {
              pend.push(bg(pl.moveTo(...toXZ(spot(G, hand, c, -0.2, 1.3)), { speed: 2.4, stop: 0.5 }).then(() => { pl.setScripted(true); pl.actor.faceTo(hand.x, hand.z, 12); pl.actor.play('kneel'); })));
              cut(G, shotAt(3.0, 2.2, 1.5), eye(-0.3));
            },
            'c4_stranger.give:2': () => { man.play('sit'); G.audio.sfx('sfx_water', { at: { x: hand.x, z: hand.z } }); },
          });
          await d.talk('c4_stranger.give');
          release(G);
        } else {
          // Dhari turns الوضحا away; behind him the Sheikh's camel is made to kneel
          pl.setScripted(false);
          await pl.moveTo(wad.pos.x, wad.pos.z, { speed: 2.6, stop: 1.8 });
          await pl.mount(wad);
          const mani = N.get('mani'), misfer = N.get('misfer'), c0 = C.members[0];
          hookLines(G, d, {
            'c4_stranger.refuse:1': () => { const y0 = pl.yaw, y = y0 + 1.9; bg(d.tween(1.3, k => { pl.yaw = y0 + (y - y0) * k; })); },
            'c4_stranger.refuse:2': () => { c0.pose('kneel', { duration: 1.4 }); G.audio.sfx('sfx_camel', { at: c0.pos }); },
            'c4_stranger.refuse:3': () => {
              mani.unride(); misfer.unride();
              pend.push(walkPose(G, mani, ...toXZ(spot(G, hand, c, -0.3, -1.3)), { speed: 1.4, stop: 0.5 }, () => { mani.actor.faceTo(hand.x, hand.z, 10); mani.play('kneel'); }));
              pend.push(walkPose(G, misfer, ...toXZ(spot(G, hand, c, -1.3, -2.8)), { speed: 1.9, stop: 0.7 }, () => { misfer.actor.faceTo(hand.x, hand.z, 10); misfer.play('idle'); }));
              cut(G, shotAt(4.4, 2.6, 1.7), eye(-0.2));
            },
            'c4_stranger.refuse:4': () => { man.play('sit'); G.audio.sfx('sfx_water', { at: { x: hand.x, z: hand.z } }); },
          });
          await d.talk('c4_stranger.refuse');
          await d.wrap(Promise.all(pend));
          await d.cine([{ pos: shotAt(3.0, -1.7, 1.2), look: eye(-0.2), dur: 2.2, cut: true }]);     // the consequence: the Sheikh's hands, the stranger drinking
          release(G);
          await d.talk('c4_stranger.refuse.after');
        }
        await d.wrap(Promise.all(pend));
        if (give) {
          // the consequence shot: his face, the empty skin
          await d.cine([{ pos: facing(0.9, 2.3, 1.1), look: eye(0.6), dur: 2.0, cut: true }]);
          release(G);
        }
        man.play('sit');

        // ---- the news, the salt
        await d.talk('c4_stranger.news');
        await d.talk('c4_stranger.salt');
        N.get('jaber').ride(C.members[4]);
        pl.setScripted(false);
        if (!pl.mounted) { await pl.moveTo(wad.pos.x, wad.pos.z, { speed: 2.6, stop: 1.8 }); await pl.mount(wad); }
        S.beat = null;
        await d.fade(true, 0.9);
      },
    },
    // ------------------------------------------------------------------------------------------ 2
    {
      id: 'c4_collapse',
      enter(G, L, ctx) { stage(G, L, 'c4_collapse', ctx.resumed, true); },
      async run(G, L, d) {
        const w = places(G, L), pl = G.actors.player, N = G.actors.npcs, C = G.actors.caravan, cams = G.actors.camels;
        await ready(d);
        thirstGuard(G, d, 'fail.thirst.self');
        const wad = cams.get('wadha'), gave = !!d.flags.gaveWater;
        const mani = N.get('mani'), spots = restSpots();
        let settling = null;
        const settle = () => { settling = bg(d.spawn(async d2 => {
          C.members.forEach(c => c.pose('kneel', { duration: 1.4 })); wad.pose('kneel', { duration: 1.4 });
          await d2.wait(G.state.fastText ? 0.1 : 1.9);
          const goes = [];
          for (const id of Object.keys(spots)) {
            const n = N.get(id), s = spots[id]; if (!n) continue;
            if (n.riding) n.unride();
            goes.push(walkPose(G, n, s.x, s.z, { speed: id === 'mani' ? 1.0 : 1.9, stop: 0.5 }, () => { n.place(n.pos.x, n.pos.z, s.yaw); n.play(s.clip); }));
          }
          await Promise.all(goes);
        }).done); };
        const A = w.acacia, ms = spots.mani, gid = `c4_collapse.${gave ? 'gave' : 'refused'}`;
        hookLines(G, d, {
          [`${gid}:0`]: () => { cut(G, [A.x - 5, gy(G, A.x - 5, A.z + 1) + 2.8, A.z + 1], [mani.pos.x, mani.pos.y + 2.4, mani.pos.z]); bg(d.tween(G.state.fastText ? 0.05 : 1.6, k => { if (mani.riding) mani.actor.root.rotation.z = 0.34 * k; })); },
          [`${gid}:1`]: () => { mani.actor.root.rotation.z = 0; settle(); G.actors.cam.shake(0.06, 0.4); cut(G, [A.x + 17, gy(G, A.x + 17, A.z + 5) + 2.6, A.z + 5], [A.x + 2, gy(G, A.x, A.z + 8) + 1.1, A.z + 8]); },
          'c4_collapse.send:0': () => cut(G, [ms.x + 2.4, gy(G, ms.x + 2.4, ms.z - 1.6) + 1.2, ms.z - 1.6], [ms.x, gy(G, ms.x, ms.z) - 0.2, ms.z]),
          'c4_collapse.send:5': () => release(G),
          'c4_collapse.go:0': () => cut(G, [A.x + 6, gy(G, A.x + 6, A.z + 13) + 1.9, A.z + 13], [A.x - 2, gy(G, A.x - 2, A.z + 5) + 0.6, A.z + 5]),
        });
        G.actors.cam.frame(mani.actor.root);
        await d.fade(false, 0.9);
        await d.talk(gave ? 'c4_collapse.gave' : 'c4_collapse.refused');
        release(G);
        if (settling) await d.wrap(settling);
        pl.setScripted(false);
        await pl.dismount();
        const near = { x: w.acacia.x + 1.4, z: w.acacia.z + 6.6 };
        await pl.moveTo(near.x, near.z, { speed: 2.4, stop: 0.8 });
        pl.actor.faceTo(mani.pos.x, mani.pos.z, 12);
        await d.talk('c4_collapse.send');
        await d.talk('c4_collapse.go');
        release(G);

        // ---- go alone
        wad.pose('kneel', { duration: 0.6 });
        goal(d, 'c4_collapse.obj', { at: wad.root });
        await use(G, d, { id: 'c4_mount', at: wad.root, label: 'c4_collapse.label.mount', radius: 3 });
        d.objectiveDone();
        await pl.mount(wad);
        S.beat = null;
      },
    },
    // ------------------------------------------------------------------------------------------ 3
    {
      id: 'c4_search',
      enter(G, L, ctx) { stage(G, L, 'c4_search', ctx.resumed); },
      async run(G, L, d) {
        const w = places(G, L), pl = G.actors.player, sv = G.sys.survival, fl = d.flags;
        await ready(d);
        thirstGuard(G, d, 'fail.thirst.alone');
        const O = { obj: 'c4_search.obj', label: 'c4_search.label.cairn' };

        // ---- the lone rider (first time only)
        if (S.reached === 0 && !S.alone) {
          S.alone = true;                                                 // a retry after a thirst fall does not replay the card
          const p = pl.pos, y = pl.yaw, fx = Math.sin(y), fz = Math.cos(y), rx = -Math.cos(y), rz = Math.sin(y);
          const at2 = (a, b, h) => { const x = p.x + fx * a + rx * b, z = p.z + fz * a + rz * b; return [x, gy(G, x, z) + h, z]; };
          const shots = [
            { pos: at2(16, -3, 1.7), look: [p.x, p.y + 2.4, p.z], dur: 0.1, cut: true },
            { pos: at2(9, 6, 2.8), look: [p.x - fx * 4, p.y + 2.2, p.z - fz * 4], dur: 4.2 },
          ];
          await d.wrap(Promise.all([d.cine(shots), d.card('c4_alone', { seconds: 4.2 })]));
          release(G);
        }

        // ---- the sip / the empty skin
        const toastDry = () => { if (fl.gaveWater) toast(G, 'c4_search.toast.dry', 3.8); };
        d.own(G.events.on('survival:level', e => { if (e && e.step === 30) toastDry(); }));
        d.own(G.events.on('survival:drink', () => { if (!fl.gaveWater) toast(G, 'c4_search.toast.sip', 3.8); }));
        if (fl.gaveWater) d.spawn(async d2 => { let held = 0; await d2.task(dt => { if (G.input.held('drink') && sv.sips <= 0) { held += dt; if (held > 0.6) { toastDry(); held = -20; } } else if (held > 0) held = 0; return undefined; }); });

        flightLoop(G, L, d, true, 6);
        if (S.reached < 1) {
          await visitCairn(G, L, d, 1, O);
          d.bark('c4_search.bark.2');
          if (!fl.gaveWater && sv.sips > 0) {
            prompt(G, 'c4_search.prompt.drink');
            d.spawn(async d2 => { await d2.first({ drank: d2.until(() => sv.sips <= 0), t: d2.wait(G.state.fastText ? 0.2 : 9) }); prompt(G, null); });
          }
        }
        await visitCairn(G, L, d, 2, O);
        S.beat = null;
      },
    },
    // ------------------------------------------------------------------------------------------ 4
    {
      id: 'c4_search2',
      enter(G, L, ctx) { stage(G, L, 'c4_search2', ctx.resumed); },
      /** test hook: `G.state.botBones = true` takes the false trail first (warp to the bones, press the verb) */
      bot(G, bot) {
        if (!G.state.botBones || S.bones) return false;
        const w = W, pl = G.actors.player;
        if (Math.hypot(pl.pos.x - w.bones.x, pl.pos.z - w.bones.z) > 4) { pl.teleport(w.bones.x - 2.4, w.bones.z, 1.57); return true; }
        G.input.feed({ move: { x: 0, y: 0 }, hold: G.time.now % 1.2 < 0.8 ? ['interact'] : [] });
        return true;
      },
      async run(G, L, d) {
        const w = places(G, L), pl = G.actors.player, sv = G.sys.survival, O = G.sys.objectives, T = G.world.terrain;
        await ready(d);
        thirstGuard(G, d, 'fail.thirst.alone');
        const c2 = w.cairn[2], c3 = w.cairn[3], c4 = w.cairn[4];
        const d23 = Math.hypot(c3.x - c2.x, c3.z - c2.z), d34 = Math.hypot(c4.x - c3.x, c4.z - c3.z), total = d23 + d34;
        let best = 0;
        const progress = () => {
          const p = pl.pos;
          const v = S.reached >= 3 ? (d23 + (1 - clamp(Math.hypot(p.x - c4.x, p.z - c4.z) / d34, 0, 1)) * d34) / total
            : (1 - clamp(Math.hypot(p.x - c3.x, p.z - c3.z) / d23, 0, 1)) * d23 / total;
          if (v > best) best = v; return best;
        };
        const opts = { obj: 'c4_search2.obj', label: 'c4_search2.label.cairn' };

        // ---- the beaten road to the east: two lines of old prints that end at camel bones
        const bez = (t) => { const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; return { x: a * c2.x + b * (c2.x + 52) + c * w.bones.x, z: a * c2.z + b * (c2.z - 14) + c * w.bones.z }; };
        for (const off of [-1.3, 1.3]) {
          const pts = []; for (let k = 0; k <= 16; k++) { const q = bez(k / 16); pts.push({ x: q.x + off * 0.7, z: q.z + off }); }
          G.sys.tracks.add({ id: 'false' + off, points: pts, kind: 'camel', fresh: 0 });
        }
        if (S.reached === 0) { toast(G, 'c4_search2.toast.fork', 4.2); }

        // ---- the bones (optional: only if he took the east road)
        let bonesSeen = false;
        d.spawn(async d2 => {
          await use(G, d2, { id: 'bones', at: w.bones, label: 'c4_search2.label.bones', radius: 3.4, mountedOk: true });
          bonesSeen = true; S.bones = true; await d2.talk('c4_search2.bones');
        });

        // ---- the sky: night falls at ~60 % of the way
        let night = false;
        const nightfall = (instant) => {                               // instant: a retry that wakes him after night had already fallen
          if (night) return; night = true;
          G.world.sky.setPreset('night', { duration: G.state.fastText || instant ? 0 : 16 });
          sv.rate('c4_cool', -0.16);
          if (!instant) toast(G, 'c4_search2.toast.night', 4.2);
          if (S.sun) { S.sun.remove(); S.sun = null; }
          O.mark('jady', { bearingFn: () => JADY_BEARING, icon: 'jady' }); O.mark('suhail', { bearingFn: () => SUHAIL_BEARING, icon: 'suhail' });
          music(G, 'music_night', 5);
          if (!instant) d.spawn(async d2 => { await d2.wait(G.state.fastText ? 0.2 : 7); d2.bark('c4_search2.bark.1'); });
        };
        if (S.reached >= 3) nightfall(true);
        d.spawn(async d2 => { await d2.until(() => progress() >= 0.6 || S.reached >= 3 && progress() >= 0.58); nightfall(); });
        // ---- the far howl, once, between cairn 3 and 4
        d.spawn(async d2 => {
          await d2.until(() => S.reached >= 3 && progress() >= 0.78);
          const p = pl.pos; G.audio.sfx('sfx_howl', { at: { x: p.x + 160, z: p.z - 40 } });
          await d2.wait(G.state.fastText ? 0.2 : 4.5); d2.bark('c4_search2.bark.2');
        });
        // ---- the firelight on the haze, from 190 m
        const hz = G.world.props.glow({ x: w.fire.x, y: T.heightAt(w.fire.x, w.fire.z) + 16, z: w.fire.z + 6 }, { color: 0xff9a40, size: 70 });
        d.own(hz);
        d.spawn(async d2 => { await d2.task(() => { const dd = Math.hypot(pl.pos.x - w.fire.x, pl.pos.z - w.fire.z); hz.set(0.85 * smoothstep(200, 105, dd) * (G.world.sky.uniforms.uNight ? Math.max(0.35, G.world.sky.uniforms.uNight.value) : 1)); return undefined; }); });

        flightLoop(G, L, d, false, 14);
        if (S.reached < 3) {
          const p3 = visitCairn(G, L, d, 3, opts);
          // the bones show the true cairn
          d.spawn(async d2 => { await d2.until(() => bonesSeen); G.actors.cam.frame(c3); });
          await p3;
        }
        await visitCairn(G, L, d, 4, opts);
        S.beat = null;
      },
    },
    // ------------------------------------------------------------------------------------------ 5
    {
      id: 'c4_ridge',
      enter(G, L, ctx) { stage(G, L, 'c4_ridge', ctx.resumed); },
      async run(G, L, d) {
        const w = places(G, L), pl = G.actors.player, T = G.world.terrain;
        await ready(d);
        thirstGuard(G, d, 'fail.thirst.alone');
        const hz = G.world.props.glow({ x: w.fire.x, y: T.heightAt(w.fire.x, w.fire.z) + 16, z: w.fire.z + 6 }, { color: 0xff9a40, size: 70 });
        d.own(hz); hz.set(0.85);
        toast(G, 'c4_ridge.toast.glow', 4.2);
        goal(d, 'c4_ridge.obj', { at: w.crest });
        G.actors.cam.frame(w.crest);
        await d.near(w.crest, 5);                                        // the reveal needs the crest itself: from 18 m back the dune hides the basin
        d.objectiveDone();

        // ---- the crest: the basin, the trees, the well — and the men
        const men = [];
        const f = w.fire;
        for (let k = 0; k < 9; k++) { const a = k * 0.7 + 0.3, r = 6 + (k % 3) * 2.2; men.push({ x: f.x + Math.sin(a) * r, z: f.z + Math.cos(a) * r, yaw: a + 3.14, tint: 0x8a7a70, clip: k % 3 === 2 ? 'sit' : 'idle', t: k * 0.37 }); }
        const npcs = G.actors.npcs;
        d.own(npcs.crowd('jaber', men));
        if (npcs.crowd._stub) {                                       // no crowd support yet: a few real men around the fire
          men.slice(0, 6).forEach((m, k) => npcs.spawn('guard' + k, 'jaber', { x: m.x, z: m.z, yaw: m.yaw, tint: m.tint, clip: m.clip }));
          d.onEnd(() => { for (let k = 0; k < 6; k++) npcs.remove('guard' + k); });
        }
        const p = pl.pos, y = pl.yaw, fx = Math.sin(y), fz = Math.cos(y);
        const look = [f.x, T.heightAt(f.x, f.z) + 1.5, f.z];
        await d.cine([
          { pos: [p.x - fz * 5 - fx * 7, T.heightAt(p.x, p.z) + 4.6, p.z + fx * 5 - fz * 7], look: [p.x + fx * 20, p.y + 0.5, p.z + fz * 20], dur: 0.1, cut: true },
          { pos: [p.x - fz * 2 - fx * 3, T.heightAt(p.x, p.z) + 3.4, p.z + fx * 2 - fz * 3], look, dur: 4.5, fov: 40 },
        ]);
        await d.talk('c4_ridge.see');
        await d.card('c4_end', { seconds: 4.5 });
        S.beat = null;
      },
    },
  ],
};

/** seconds, collapsed under fastText */
function pause0(G, s) { return G.state.fastText ? 0.05 : s; }
