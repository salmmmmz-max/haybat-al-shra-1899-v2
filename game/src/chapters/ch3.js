/**
 * Chapter 3 «ليلة سهيل» — L2 at night → first light. The camp at الجال. (DESIGN §5 Ch3, SCRIPT Ch3)
 * Beats: c3_fire · c3_polaris · c3_wolves · c3_alpha · c3_suhail.
 * Teaches: the sky (the eye held + look up), the brand (tap to swing), the stare (الثبات); exam = the alpha stare.
 *
 * Geometry is derived from the poi `fire` (L.poi) — seats, the ring of kneeling camels (south half), the wolves' arc (north half).
 */
import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { cast, camel, toast, prompt, hud, goal as kitGoal, use, music, pause } from './kit.js';
import { bearingDeg, yawOf, wrapPi, DEG } from '../core/math.js';

const NIGHT_LST = 18.0, DAWN_LST = 3.3;
const BOUNDS = 30;                                       // darkness + a howl 30 m from the fire (c3.bounds)
const V = new THREE.Vector3(), AV = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ helpers
/** per-run state shared between enter / run / bot (the chapter module is a singleton) */
const S = { aimT0: 0, resumed: false, phase: '', aim: null, tele: null, teles: [], marks: {} };

/** objective + two derived hints; also exposes `at` on objectives.current (the test bot reads it there) */
function goal(G, d, key, opts = {}) {
  kitGoal(d, key, opts);
  const c = G.sys.objectives.current;
  if (c && opts.at && !c.at) c.at = opts.at;
}
const bg = p => { if (p && p.catch) p.catch(() => {}); return p; };          // fire-and-forget promises never throw into the console
const gy = (G, x, z) => G.world.terrain.heightAt(x, z);
const p3 = (G, x, dy, z) => [x, gy(G, x, z) + dy, z];
const yawBetween = (a, b) => yawOf(b.x - a.x, b.z - a.z);

/** every authored place of the chapter, relative to the fire */
function geo(L) {
  const F = L.poi('fire'), P = (dx, dz) => ({ x: F.x + dx, z: F.z + dz });
  const ring = [-80, -40, 0, 40, 80].map(a => P(Math.sin(a * DEG) * 9, Math.cos(a * DEG) * 9));   // the south half guards the rear
  return {
    F, ring,
    seatM: P(-2.7, -0.3), seatD: P(-2.0, 1.9), seatF: P(-0.4, 2.8), calfRest: P(0.9, 3.4),
    misfer: P(2.7, -0.8), watch: P(5.4, 3.6),                  // the watch: south-east, behind the c3_fire shots
    startFire: P(-2.9, 7.4),                             // Dhari's start of c3_fire: a gap in the ring, the camera behind him sees the fire and the seats
    standWolves: P(1.6, 2.2),                            // c3_wolves, resumed
    calf: P(-1.4, -2.2),                                 // the calf the wolves want (c3_wolves / c3_alpha)
    fuhaidFight: P(-2.4, -1.4), fightPlayer: P(0.7, -2.0),
    packC: P(0, -4),                                     // centre of the wolves' arc (radius 12, 180° to the north)
    suhailStand: P(-0.4, 3.8),
  };
}
const packOpts = g => ({ cx: g.packC.x, cz: g.packC.z, radius: 12, arc: { centerYaw: Math.PI, width: 180 } });

function starBearing(G, id) { G.world.sky.stars.dir(id, V); return bearingDeg(Math.atan2(V.x, V.z)); }

function setKneel(c, on) {
  if (!c) return;
  if (on && !c.kneeling) bg(c.pose('kneel', { duration: 0.01 }));
  else if (!on && c.kneeling) bg(c.pose('rise', { duration: 0.01 }));
}

/** darkness and a howl 30 m from the fire: a soft edge (every beat). F29: the player's fence resists the outward step and eases
 *  the overshoot back in sim time (no per-tick impulses: no bounce, the same at any frame rate); walking back in is free. */
function guard(G, L, d) {
  const F = L.poi('fire'), pl = G.actors.player; let cool = 0;
  const edge = pl.fence(F.x, F.z, BOUNDS); d.onEnd(() => edge.remove());
  d.spawn(d2 => d2.task(dt => {
    cool -= dt;
    const dx = pl.pos.x - F.x, dz = pl.pos.z - F.z, r = Math.hypot(dx, dz);
    if (r > BOUNDS) {
      if (cool <= 0) { cool = 7; toast(G, 'c3.bounds', 4); G.audio.sfx('sfx_howl', { at: { x: F.x + dx * 1.3, z: F.z + dz * 1.3 }, volume: 0.8 }); }
    }
    return undefined;
  }));
}

/** sky mode puts the camera 1.6 m behind Dhari's head, right on the line to the low stars: he steps out of the picture while the sky is read */
function heroHidden(G, d, on) {
  const a = G.actors.player.actor; if (!a || !a.setVisible) return;
  a.setVisible(!on);
  if (on) d.onEnd(() => a.setVisible(true));
}

/** bot helper for the sky beats: aim the view at the star and hold the eye */
function skyBot(G) {
  if (!G.sys.stars.active || !S.aim) return false;
  if (G.time.now - S.aimT0 < (G.state.ch3SkyDelay || 0)) { G.input.feed({ move: { x: 0, y: 0 }, hold: [] }); return true; }      // test hook: a slow, human searcher
  const cam = G.actors.cam; G.world.sky.stars.dir(S.aim, V);
  cam.yaw = Math.atan2(V.x, V.z); cam.pitch = -Math.asin(Math.max(-1, Math.min(1, V.y)));
  G.input.feed({ move: { x: 0, y: 0 }, hold: ['firasa'] });
  return true;
}

/**
 * Sky search with the dwell visuals: the asterism lines draw in with the dwell, prompts follow the view.
 * `lines` = asterism id (banat_nash / pointer) or null. Resolves when the star is found.
 */
async function findStar(G, d, { star, lines, dwellPrompt }) {
  const stars = G.world.sky.stars, cam = G.actors.cam;
  S.aim = star; S.aimT0 = G.time.now;
  let near = false;
  d.spawn(d2 => d2.task(() => {
    const act = G.sys.stars.active;
    if (!act) return undefined;
    if (lines) stars.highlight(lines, act.progress);
    if (dwellPrompt && !near) {
      stars.dir(star, V);
      const f = V.clone();
      if (cam.aimError(() => f) < 12 * DEG) { near = true; S.dwellShown = true; prompt(G, dwellPrompt); }
    }
    return undefined;
  }));
  heroHidden(G, d, true);
  try { await G.sys.stars.find({ star, seconds: 0.8, tolerance: 7, magnet: 12 }); } finally { heroHidden(G, d, false); }
  prompt(G, null); S.aim = null;
}

/** draw an asterism in segment by segment, one plucked note per star */
async function drawLines(G, d, id, seconds) {
  const stars = G.world.sky.stars, n = Math.max(1, stars.asterism(id).length); let noted = 0;
  await d.tween(G.state.fastText ? 0.05 : seconds, k => {
    stars.highlight(id, k);
    const want = Math.floor(k * n + 1e-6);
    while (noted < want) { G.audio.note(noted % 7, 0.7); noted++; }
  });
  stars.highlight(id, 1);
}

function addMark(G, id, star, icon) {
  if (S.marks[id]) S.marks[id].remove();
  S.marks[id] = G.sys.objectives.mark(id, { bearingFn: () => starBearing(G, star), icon, scope: 'level' });
}
function dropMark(id) { if (S.marks[id]) { S.marks[id].remove(); S.marks[id] = null; } }

// ------------------------------------------------------------------------------------------------ staging
const ORDER = ['c3_fire', 'c3_polaris', 'c3_wolves', 'c3_alpha', 'c3_suhail'];

/** complete, idempotent, absolute staging of a beat start */
function stage(G, L, id, resumed) {
  const g = geo(L), W = G.world, A = G.actors, F = g.F, idx = ORDER.indexOf(id);
  S.resumed = resumed; S.phase = ''; S.tele = null; S.teles.length = 0;
  // night: moonless, still
  W.sky.setPreset('night', { duration: 0 });
  W.sky.stars.setLST(NIGHT_LST, { duration: 0 });
  W.weather.setWind(90, 0.1); W.weather.setDust(0.04, { duration: 0 }); W.weather.storm(0, { duration: 0 });
  L.fires.camp.setLit(true);
  // marks on the horizon strip are earned (jady in c3_polaris, suhail in c3_suhail)
  if (idx > 1) addMark(G, 'jady', 'polaris', 'jady'); else dropMark('jady');
  dropMark('suhail');
  // HUD / eye / music per beat
  const fire = id === 'c3_fire', wolves = id === 'c3_wolves', alpha = id === 'c3_alpha';
  hud(G, { eye: !(fire || wolves || alpha), strip: !fire });
  G.sys.firasa.setAllowed(!(fire || wolves || alpha));
  music(G, fire ? null : 'music_night');

  // --- people and camels
  const mani = cast(G, 'mani', 'mani', g.seatM, yawBetween(g.seatM, F), { clip: 'sit' }); mani.lookAtPlayer(fire);
  const calfStands = wolves || alpha;
  // the ring of kneeling camels (south half of the camp)
  const slots = { wadha: [1, null], camelA: [3, 0xc9a877], camelB: [0, 0xb08a5a], camelC: [4, 0x9c7748] };
  for (const cid of Object.keys(slots)) {
    const [k, tint] = slots[cid], p = g.ring[k];
    const c = camel(G, cid, p, yawBetween(p, F) + Math.PI, tint ? { tint } : {});
    setKneel(c, true);
  }
  const calfP = calfStands ? g.calf : g.calfRest;
  const hwar = camel(G, 'hwar', calfP, calfStands ? Math.PI : yawBetween(calfP, F), { scale: 0.55 });
  setKneel(hwar, !calfStands);
  // (clips per model: mani idle/sit/lie · fuhaid idle/sit · misfer idle — whoever cannot lie down keeps watch or sits)
  if (fire) {
    cast(G, 'fuhaid', 'fuhaid', g.seatF, yawBetween(g.seatF, F), { clip: 'sit' }).lookAtPlayer(true);
    cast(G, 'misfer', 'misfer', g.misfer, yawBetween(g.misfer, F)).lookAtPlayer(false);
  } else if (wolves || alpha) {
    cast(G, 'fuhaid', 'fuhaid', g.fuhaidFight, Math.PI).lookAtPlayer(false);
    cast(G, 'misfer', 'misfer', { x: F.x + 2.2, z: F.z - 1.2 }, Math.PI).lookAtPlayer(false);
  } else {                                               // polaris / suhail: the camp rests, مسفر keeps watch at the edge of the light
    cast(G, 'fuhaid', 'fuhaid', g.seatF, yawBetween(g.seatF, F), { clip: 'sit' });
    cast(G, 'misfer', 'misfer', g.watch, Math.PI).lookAtPlayer(false);
  }

  // --- the pack and the brand
  if (alpha) A.wolves.spawnPack(packOpts(g)); else A.wolves.clear();
  const pl = A.player;
  const want = alpha ? 'torch' : null;
  if (resumed || pl.item !== want) pl.equip(want, { lit: true });

  // --- the player
  if (resumed) {
    const spots = {
      c3_fire: [g.startFire, yawBetween(g.startFire, g.seatD)],
      c3_polaris: [g.seatD, Math.PI],
      c3_wolves: [g.standWolves, Math.PI],
      c3_alpha: [g.fightPlayer, Math.PI],
      c3_suhail: [g.suhailStand, 0],
    }[id];
    pl.setScripted(false);
    pl.teleport(spots[0].x, spots[0].z, spots[1]);
    pl.actor && pl.actor.play('idle', { fade: 0 });
    A.cam.snap();
  }
}

// ------------------------------------------------------------------------------------------------ the chapter
export default {
  id: 'ch3', index: 3, assets: 'ch3', level: LEVELS.jal, sky: 'night', lst: NIGHT_LST,
  survival: { thirst: 100, sips: 0, drain: false },
  setup() {},
  beats: [
    // ---------------------------------------------------------------------------------------------- 1. the fire
    {
      id: 'c3_fire',
      enter(G, L, ctx) { stage(G, L, 'c3_fire', ctx.resumed); },
      async run(G, L, d) {
        const g = geo(L), A = G.actors, pl = A.player, cam = A.cam, F = g.F;
        guard(G, L, d);
        if (G.audio.duck) { G.audio.duck(-9, 120); d.onEnd(() => G.audio.duck(0, 0)); }          // wind ducked: the fire crackles alone
        if (S.resumed) await d.card('c3');
        goal(G, d, 'c3_fire.obj', { at: g.seatD });
        await use(G, d, { id: 'sit', at: g.seatD, label: 'c3_fire.label.sit', radius: 2.6 });
        d.objectiveDone();

        // Dhari sits beside his grandfather
        pl.setScripted(true);
        await d.first({ walk: pl.moveTo(g.seatD.x, g.seatD.z, { speed: 1.7, stop: 0.25 }), t: d.wait(4) });
        pl.setScripted(true);                                          // (moveTo hands control back when it arrives)
        pl.teleport(g.seatD.x, g.seatD.z, yawBetween(g.seatD, F));
        pl.pose('sit', { fade: 0.4 });
        await pause(G, d, 0.8);
        await d.talk('c3_fire.sit');
        const ration = d.flags.ration;
        if (ration === 'child') await d.talk('c3_fire.thanks.child');
        else if (ration === 'elder') await d.talk('c3_fire.thanks.elder');

        // the others lie down; two-shot, then slowly onto the Sheikh's face
        const mani = A.npcs.get('mani'), fuh = A.npcs.get('fuhaid'), mis = A.npcs.get('misfer');
        if (fuh) fuh.lookAtPlayer(false);
        if (mis) bg(mis.goTo(g.watch.x, g.watch.z, { speed: 1.1, stop: 0.3 }));        // مسفر takes the watch at the edge of the light
        G.ui.cards.letterbox(true); d.onEnd(() => G.ui.cards.letterbox(false));
        await pause(G, d, 1.2);
        if (mani) { mani.lookAtPlayer(false); mani.actor.lookAt(null); mani.actor.face(1.95, 6); }       // he sits with the firelight on his face, turned a little toward the lens
        const mid = { x: (g.seatM.x + g.seatD.x) / 2, z: (g.seatM.z + g.seatD.z) / 2 };
        // wide two-shot from the north-east: Dhari left, the Sheikh centre with the firelight on his face, the fire out at the
        // frame's edge and nobody between the lens and him; then a slow push onto his face while he speaks. The look point sits
        // below the heads so the faces ride above the dialogue panel.
        await d.cine([{ pos: p3(G, F.x + 1.5, 1.55, F.z - 5.0), look: p3(G, mid.x, 0.55, mid.z), dur: 2.6, cut: true }]);
        // Shots follow the confession's speaker, not a timer that may finish before the reader.
        const face = (actor, side = 1) => {
          actor.root.updateMatrixWorld(true);
          const head = actor.socket('head').getWorldPosition(new THREE.Vector3());
          const yaw = actor.yaw, f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
          const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
          const pos = head.clone().addScaledVector(f, 1.85).addScaledVector(right, side * 0.65);
          pos.y += 0.02;
          cam.cut(pos.toArray(), head.clone().add(new THREE.Vector3(0, -0.1, 0)).toArray());
        };
        if (mani) mani.setSpeechGesture(false);
        d.onEnd(() => { if (mani) { mani.setSpeechGesture(true); mani.actor.lookAt(null); } pl.actor.lookAt(null); cam.release({ duration: 0.6 }); });
        await d.talk('c3_fire.ask');

        // His stillness carries the admission. A skyward procedural neck twist hides the face
        // in this seated rig, so keep its authored neutral head pose throughout the close shot.
        music(G, 'music_night', 4);
        if (mani) { mani.lookAtPlayer(false); mani.actor.lookAt(null); }
        pl.actor.lookAt(null);
        let lastSpeaker = null;
        const offShot = G.events.on('dialogue:line', ({ who }) => {
          if (who === lastSpeaker) return;
          if (who === 'mani' && mani) { face(mani.actor, 0); lastSpeaker = who; }
          else if (who === 'dhari') { face(pl.actor, 1); lastSpeaker = who; }
        });
        d.onEnd(offShot);
        if (mani) face(mani.actor, 0);
        await d.talk('c3_fire.reveal');
        face(pl.actor, 1); await pause(G, d, 1.15); lastSpeaker = null;
        await d.talk('c3_fire.why');
        if (mani && mani.actor.lookAt) mani.actor.lookAt(null);
        await pause(G, d, 0.7); lastSpeaker = null;
        await d.talk('c3_fire.eyes');
        offShot(); if (mani) mani.setSpeechGesture(true); pl.actor.lookAt(null);

        // he asks for the stars: up, and the horizon strip appears
        G.ui.cards.letterbox(false);
        cam.release({ duration: 1.4 });
        pl.pose(null, { fade: 0.4 }); pl.setScripted(false);
        if (mani) mani.lookAtPlayer(true);
        hud(G, { eye: true, strip: true });
        await pause(G, d, 1.0);
      },
    },

    // ---------------------------------------------------------------------------------------------- 2. بنات نعش → الجدي
    {
      id: 'c3_polaris',
      enter(G, L, ctx) { stage(G, L, 'c3_polaris', ctx.resumed); },
      bot(G) { return skyBot(G); },
      async run(G, L, d) {
        const stars = G.world.sky.stars;
        guard(G, L, d);
        // face north (the low north-west is a short turn away)
        G.actors.cam.yaw = Math.PI; if (S.resumed) G.actors.cam.snap();
        S.dwellShown = false; let found1 = false;
        d.spawn(async d2 => {                                 // the entry prompt: until the eye is up, the first dwell prompt, or 14 s
          await d2.wait(1.5); if (found1) return;
          prompt(G, 'c3_polaris.prompt.sky');
          await d2.first({ a: d2.until(() => found1 || S.dwellShown || G.sys.firasa.active), t: d2.wait(14) });
          if (!found1 && !S.dwellShown) prompt(G, null);
        });

        // 1. بنات نعش — a ground-based hint from the Sheikh, then the dwell
        goal(G, d, 'c3_polaris.obj', { bearingFn: () => starBearing(G, 'megrez'), hintAfter: [20, 40] });
        await findStar(G, d, { star: 'megrez', lines: 'banat_nash', dwellPrompt: 'c3_polaris.prompt.dwell' });
        found1 = true;
        d.objectiveDone();
        await drawLines(G, d, 'banat_nash', 1.6);
        await d.talk('c3_polaris.dipper');

        // 2. الجدي — follow the pointers
        goal(G, d, 'c3_polaris.jady.obj', { bearingFn: () => starBearing(G, 'polaris'), hintAfter: [20, 40] });
        await findStar(G, d, { star: 'polaris', lines: 'pointer' });
        d.objectiveDone();
        stars.highlight('banat_nash', 1);
        await drawLines(G, d, 'pointer', 1.0);
        await d.talk('c3_polaris.jady');
        addMark(G, 'jady', 'polaris', 'jady');
        hud(G, { eye: true, strip: true });
        toast(G, 'c3_polaris.toast.strip', 4.5);
        await pause(G, d, 2.5);
        stars.highlight(null, 0);
      },
    },

    // ---------------------------------------------------------------------------------------------- 3. the wolves
    {
      id: 'c3_wolves',
      enter(G, L, ctx) { stage(G, L, 'c3_wolves', ctx.resumed); },
      bot(G) {
        if (S.phase !== 'fight') return false;
        const pl = G.actors.player, t = S.teles[0];                         // one swing per telegraph, in order (pairs 0.6 s apart)
        let mv = { x: 0, y: 0 };
        if (t && G.time.now - t.t >= (G.state.fastText ? 0.17 : 1.3)) {
          S.teles.shift();
          if (G.state.ch3BotMiss > 0) G.state.ch3BotMiss--;                   // test hook: skip N swings (exercise the retry path)
          else { pl.teleport(pl.pos.x, pl.pos.z, yawOf(t.x - pl.pos.x, t.z - pl.pos.z)); G.actors.cam.yaw = pl.yaw; bg(pl.swing()); }
        }
        G.input.feed({ move: mv, hold: [] });
        return true;
      },
      async run(G, L, d) {
        const g = geo(L), A = G.actors, W = A.wolves, pl = A.player, F = g.F, firasa = G.sys.firasa;
        guard(G, L, d);

        // the howl, the pack gathers at the rim (eye pairs), the Sheikh says what to do
        S.phase = 'howl';
        G.audio.sfx('sfx_howl', { at: { x: F.x, z: F.z - 40 } });
        W.spawnPack({ ...packOpts(g), staged: true });
        const probing = d.spawn(() => W.introduce());
        // People respond to the sound before they explain it; the child stays behind the defender.
        const watch = A.npcs.get('misfer'), child = A.npcs.get('fuhaid'), elder = A.npcs.get('mani');
        if (watch) { watch.lookAtPlayer(false); watch.actor.lookAt({ x: F.x - 3, y: gy(G, F.x, F.z) + 1, z: F.z - 15 }); bg(watch.goTo(F.x + 2.4, F.z - 2.8, { speed: 1.6, stop: 0.2 })); }
        if (child) { child.actor.lookAt({ x: F.x - 2, y: gy(G, F.x, F.z) + 1, z: F.z - 12 }); bg(child.goTo(F.x - 1.7, F.z - 0.8, { speed: 1.9, stop: 0.2 })); }
        if (elder) { elder.setSpeechGesture(false); elder.actor.faceTo(F.x - 2, F.z - 12, 2); d.onEnd(() => elder.setSpeechGesture(true)); }
        const alertCamel = A.camels.get('camelA');
        if (alertCamel) { bg(alertCamel.pose('rise', { duration: 1.6 })); if (alertCamel.lookAt) alertCamel.lookAt({ x: F.x, y: gy(G, F.x, F.z) + 1, z: F.z - 15 }); }
        G.audio.sfx('sfx_calf', { at: g.calf, volume: 0.55 });
        await pause(G, d, 2.6);
        await d.talk('c3_wolves.howl');
        await probing.done;

        // 1. take a brand from the fire
        S.phase = 'brand';
        goal(G, d, 'c3_wolves.obj', { at: F });
        await use(G, d, { id: 'brand', at: F, label: 'c3_wolves.label.take', radius: 2.8, hold: 0.6 });
        pl.equip('torch', { lit: true });
        d.objectiveDone();

        // 2. three waves
        S.phase = 'fight';
        goal(G, d, 'c3_wolves.fight.obj', { at: g.calf });
        const hwar = A.camels.get('hwar'), home = { x: g.calf.x, z: g.calf.z };
        const away = { x: home.x - F.x, z: home.z - F.z }; { const l = Math.hypot(away.x, away.z) || 1; away.x /= l; away.z /= l; }
        let dragged = 0, missesInWave = 0, barked2 = false, firstTele = true, tries = 0;
        const dragTo = m => {
          dragged = m;
          if (!hwar) return;
          const x0 = hwar.pos.x, z0 = hwar.pos.z, x1 = home.x + away.x * m, z1 = home.z + away.z * m;
          bg(d.tween(G.state.fastText ? 0.05 : 0.5, k => hwar.place(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k)));
        };
        const off = [
          G.events.on('wolf:telegraph', e => {
            S.tele = { t: G.time.now, x: e.x, z: e.z, done: false }; S.teles.push(S.tele);
            if (firstTele || tries > 0) { firstTele = false; prompt(G, 'c3_wolves.prompt.swing'); }     // D01: after a failed wave the cue comes back every time
            const rel = wrapPi(yawOf(e.x - pl.pos.x, e.z - pl.pos.z) - A.cam.yaw);     // < 0 = right, > 0 = left
            toast(G, Math.abs(rel) < 20 * DEG ? 'c3_wolves.toast.front' : rel < 0 ? 'c3_wolves.toast.right' : 'c3_wolves.toast.left', 1.8);
            if (tries > 0 && e.wolf) {                                   // D01: a clearer edge cue — the glint stays lit through the longer telegraph
              const w = e.wolf, glint = () => G.ui.hud.glint(bearingDeg(Math.atan2(w.x - pl.pos.x, w.z - pl.pos.z)));
              d.spawn(async d2 => { for (let k = 1; k <= 2; k++) { await d2.wait((e.in || 1.2) / 3); glint(); } });
            }
          }),
          G.events.on('wolf:repelled', () => prompt(G, null)),
          G.events.on('wolf:bite', () => {
            prompt(G, null); missesInWave++; dragTo(dragged + 2);
            if (!barked2) { barked2 = true; d.bark('c3_wolves.bark.2'); }
          }),
        ];
        d.onEnd(() => off.forEach(f => f && f()));

        const waves = [{ n: 3, gap: 3 }, { n: 4, gap: 2.5 }, { n: 5, gap: 2, double: true }];
        for (let wi = 0; wi < waves.length; wi++) {
          for (tries = 0; ; tries++) {
            missesInWave = 0; barked2 = false;
            if (wi === 0) d.bark('c3_wolves.bark.1');
            // D01: graded help — retry 1: telegraph 1.6 s, +0.8 s quiet before each lunge, hint 1 · retry 2+: telegraph 2.0 s, +1.6 s,
            // one lunge fewer (never below 3: the wave stays a wave), no pair, hint 2. The cue and the edge glint repeat on every telegraph.
            const wv = waves[wi], k = Math.min(tries, 2);
            const res = await W.wave({ target: hwar ? hwar.root : g.calf, lunges: Math.max(3, wv.n - (tries >= 2 ? 1 : 0)), gap: wv.gap, double: !!wv.double && tries < 2, tele: 1.2 + 0.4 * k, calm: 0.8 * k });
            prompt(G, null); S.teles.length = 0;
            dragTo(0);
            if (res.missed >= 3) {                                      // the third miss: that wave again — slower, fewer, longer warning
              toast(G, 'c3_wolves.fail.wave', 4); await pause(G, d, 3);
              goal(G, d, 'c3_wolves.fight.obj', { at: g.calf, hints: tries ? ['c3_wolves.fight.hint1', 'c3_wolves.fight.hint2'] : ['c3_wolves.fight.hint1'], hintAfter: [0.1, 0.1] });
              continue;
            }
            if (tries) goal(G, d, 'c3_wolves.fight.obj', { at: g.calf });   // held: the normal hint pacing again
            break;
          }
          if (wi === 0) {                                              // the breath after wave 1: mastery, optional
            hud(G, { eye: true, strip: true }); firasa.setAllowed(true);
            d.bark('c3_wolves.bark.3');
            d.spawn(async d2 => { await d2.wait(0.8); prompt(G, 'c3_wolves.prompt.eye'); await d2.wait(5); prompt(G, null); });
            await pause(G, d, 6);
          } else if (wi === 1) { d.bark('c3_wolves.bark.4'); await pause(G, d, 6); }
        }
        await pause(G, d, 1.5);
      },
    },

    // ---------------------------------------------------------------------------------------------- 4. الأمعط
    {
      id: 'c3_alpha',
      enter(G, L, ctx) { stage(G, L, 'c3_alpha', ctx.resumed); },
      bot(G) {                                             // test hook: G.state.ch3BotFlinch = N → release the hold inside the next N test windows
        const st = G.sys.steady;
        if (G.state.ch3BotFlinch > 0 && st.activeRequest && st.testing && !S.flinchAt) { S.flinchAt = G.time.now; G.state.ch3BotFlinch--; }
        if (S.flinchAt) {
          if (G.time.now - S.flinchAt < 0.5) { G.input.feed({ move: { x: 0, y: 0 }, hold: [] }); return true; }
          S.flinchAt = 0;
        }
        return false;
      },
      async run(G, L, d) {
        const g = geo(L), A = G.actors, W = A.wolves, pl = A.player, cam = A.cam, st = G.sys.steady, F = g.F;
        guard(G, L, d);
        const fails = st.fails('alpha');
        if (cam.setFov) cam.setFov(52, 1.0);

        // the eye-pairs part; one wolf, bigger than the rest, walks into the light
        if (!S.resumed && Math.hypot(pl.pos.x - g.fightPlayer.x, pl.pos.z - g.fightPlayer.z) > 1.2) {      // take the stand between the fire and the dark
          await d.first({ w: pl.moveTo(g.fightPlayer.x, g.fightPlayer.z, { speed: 2.2, stop: 0.5 }), t: d.wait(4) });
          pl.setScripted(false);
        }
        bg(cam.frame({ x: F.x, y: gy(G, F.x, F.z - 14) + 1.0, z: F.z - 14 }, { duration: 1.0 }));
        const enter = bg(W.alphaEnter(fails > 0 ? 3.2 : 1.1));                // a retry does not make him wait through the whole walk again
        if (fails === 0) await d.talk(d.flags.sawWolfPrint ? 'c3_alpha.named' : 'c3_alpha.unnamed');
        await enter;
        goal(G, d, 'c3_alpha.obj', { at: g.fightPlayer });

        const aimFn = () => {
          const a = W.alpha;
          if (a && a.head && a.head.getWorldPosition) return a.head.getWorldPosition(AV);
          if (a && a.root) return AV.copy(a.root.position).setY(a.root.position.y + 0.9);
          return AV.set(F.x, gy(G, F.x, F.z - 8) + 0.9, F.z - 8);
        };

        if (fails >= 3) {                                  // the third failure auto-steadies: the scene goes on
          await pause(G, d, 4);
        } else {
          const secs = Math.max(4, 6 - fails), feints = Math.max(0, 2 - fails);
          prompt(G, 'c3_alpha.prompt.steady');
          if (cam.setFov) cam.setFov(48, 1.5);
          const hold = st.hold({ target: aimFn, seconds: secs, labelKey: 'c3_alpha.label.steady', breakOn: 'flinch' });
          // feints reuse the lunge telegraph; each one is a TEST WINDOW (releasing to swing IS the flinch)
          const timeline = d.spawn(async d2 => {
            await d2.until(() => st.progress > 0.02);
            prompt(G, null);
            let t = 0;
            const times = [0.7, 3.3];
            for (let i = 0; i < feints; i++) {
              if (times[i] > t) { await d2.wait(times[i] - t); t = times[i]; }
              st.tense(true);
              await W.alphaFeint(); t += 2.2;
              await d2.wait(0.2); t += 0.2;
              st.tense(false);
              toast(G, 'c3_alpha.toast.stage' + (i + 1), 2.6);
            }
          });
          const ok = await hold;
          timeline.cancel(); prompt(G, null);
          if (!ok) {                                       // flinch: he lunges, Dhari staggers, retry with the assist
            st.tense(false);
            const n = st.fail('alpha');
            bg(W.alphaLunge());
            cam.shake(0.45, 0.6);
            bg(pl.knockdown(1.4));
            await pause(G, d, 1.6);
            await d.failAndRestart('c3_alpha.fail.' + Math.min(3, n));
          }
        }
        d.objectiveDone();

        // he looks away first; the pack melts into the dark — the first naming of «الهيبة»
        if (cam.setFov) cam.setFov(null, 1.0);
        bg(W.flee());
        await pause(G, d, 1.2);
        await d.talk('c3_alpha.win');
        await W.flee();
      },
    },

    // ---------------------------------------------------------------------------------------------- 5. سهيل
    {
      id: 'c3_suhail',
      enter(G, L, ctx) { stage(G, L, 'c3_suhail', ctx.resumed); },
      bot(G) { return skyBot(G); },
      async run(G, L, d) {
        const g = geo(L), A = G.actors, cam = A.cam, stars = G.world.sky.stars, pl = A.player, F = g.F;
        guard(G, L, d);
        G.sys.firasa.setAllowed(true); hud(G, { eye: true, strip: true });
        pl.equip(null, { lit: false });

        // time-lapse: the sky wheels to LST 3.3 under a narration card
        const px = pl.pos.x, pz = pl.pos.z;
        const lapse = bg(stars.setLST(DAWN_LST, { duration: 9 }));
        const shot = d.cine([
          { pos: p3(G, px, 1.7, pz), look: p3(G, px + 4, 8, pz - 14), dur: 2.5, cut: true },
          { pos: p3(G, px, 1.7, pz), look: p3(G, px + 6, 36, pz + 2), dur: 6 },
        ]);
        bg(shot);
        await d.card('c3_lapse', { seconds: 4.5 });
        await shot; await lapse;
        // back to the Sheikh's side, facing the south (Jady at the back)
        pl.teleport(pl.pos.x, pl.pos.z, 0); cam.release({ duration: 1.2 }); cam.snap();

        await d.talk('c3_suhail.ask');
        goal(G, d, 'c3_suhail.obj', { bearingFn: () => starBearing(G, 'canopus'), hintAfter: [20, 40] });
        S.aim = 'canopus'; S.aimT0 = G.time.now;
        const decoy = () => {                              // resting the gaze on the white star: hint 2 at once + the Sheikh's bark
          d.bark('c3_suhail.bark.1');
          G.events.emit('hint:show', { key: 'c3_suhail.hint2', text: G.t('c3_suhail.hint2'), level: 2 });
        };
        heroHidden(G, d, true);
        try { await G.sys.stars.find({ star: 'canopus', seconds: 0.8, tolerance: 7, magnet: 12, decoys: [{ star: 'sirius', onGaze: decoy }] }); } finally { heroHidden(G, d, false); }
        S.aim = null;
        d.objectiveDone();
        stars.highlight('canopus', 1);
        await d.talk('c3_suhail.found');
        addMark(G, 'suhail', 'canopus', 'suhail');
        toast(G, 'c3_suhail.toast.strip', 4.5);
        await pause(G, d, 2.0);
        stars.highlight(null, 0);

        // the false dawn («ذنب السرحان»)
        bg(G.world.sky.setPreset('predawn', { duration: 8 }));
        await d.card('c3_end', { seconds: 5 });
      },
    },
  ],
};
