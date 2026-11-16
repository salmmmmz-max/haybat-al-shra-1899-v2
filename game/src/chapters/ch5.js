/**
 * Chapter 5 «الهيبة» — L3 «أم الحيا», night → dawn. The ridge, the walk down, the Sheikh's fire, the signal, the well.
 * Beats: c5_scout · c5_walk · c5_words · c5_stare · c5_verdict · c5_signal · c5_staff · c5_end   (DESIGN §5, SCRIPT ch5).
 * No Arabic literals here: every line is a story key.
 */
import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { pullWellBucket } from './well-pull.js';
import { at, yawTo, cast, camel, toast, prompt, hud, goal, use, steadyLadder, music, pause } from './kit.js';
import { clamp, yawOf, bearingDeg, pointOf } from '../core/math.js';

// ---------------------------------------------------------------------------------------------------- places
const ORDER = ['c5_scout', 'c5_walk', 'c5_words', 'c5_stare', 'c5_verdict', 'c5_signal', 'c5_staff', 'c5_end'];
const THAMER_TINT = 0xe0d2bf, MEN_TINTS = [0xd6c6b2, 0xc6beb0, 0xdfcfb6, 0xbfb4a6, 0xd8c9b6, 0xcac1b4];
const WALK_SPEED = 1.5;
// the six riflemen: x, z (absolute, L3), post while the hero scouts / walks, who fires
const MEN = [
  { id: 'rf1', x: 6.5, z: 222, stand: true, shoots: 1 },
  { id: 'rf2', x: -6, z: 234, stand: true, shoots: 2 },
  { id: 'rf3', x: -4.8, z: 247, stand: false },
  { id: 'rf4', x: 5.2, z: 248, stand: false },
  { id: 'rf5', x: -4.6, z: 208, stand: true },
  { id: 'rf6', x: 5.2, z: 216, stand: true },
];
const STARE_FROM = { x: 2.8, z: 241 }, STARE_NEAR = { x: 1.5, z: 239.4 }, STARE_CLOSE = { x: 0.8, z: 238.9 };
const HERO_AT_FIRE = { x: 0, z: 237.6, yaw: 0 };
const WELL_FRONT = { x: 6.8, z: 251.6 };

// module state that outlives a beat (reset when the level loads)
let seen = new Set();            // riflemen counted by الفراسة in c5_scout (outlined later, shots telegraph earlier)
let staffGiven = false, camHoldFor = null;
let threatLight = null, rifleDropAt = null;
let pileH = null, hungRifle = null, groundRifle = null, staffProp = null, daggerObj = null, titleShown = false, scoutPhase = '';

// ---------------------------------------------------------------------------------------------------- helpers

// ---- test bot: the kernel bot warps to `objectives.current.at`, which the public state does not carry — so beats say where to go
const BOT = { at: null, warp: 0, t: 0, lift: 0 };
/** objective + remember the target for the bot */
function g5(d, key, at, opts = {}) { BOT.at = at; goal(d, key, { at, ...opts }); }
function autoBot(G, bot) {
  if (!BOT.at) return false;
  const pl = player(G), p = pointOf(BOT.at), dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, dist = Math.hypot(dx, dz);
  BOT.warp -= 1 / 60; BOT.t += 1 / 60;
  if (dist > 2.2 && BOT.warp <= 0) { const k = (dist - 1.6) / dist; pl.teleport(pl.pos.x + dx * k, pl.pos.z + dz * k, yawOf(dx, dz)); if (G.actors.cam.snap) G.actors.cam.snap(); BOT.warp = 0.5; }
  const ph = BOT.t % 3.4, req = G.sys.steady.activeRequest, v = G.sys.interact.verb;
  // a الثبات request or a hold in progress: the thumb stays down (never cycled off, that would be a flinch)
  const bt = G.state.botTest;                                  // tests: `botTest = { stareFlinch: n }` lifts the thumb n times mid-hold
  if (bt && bt.stareFlinch > 0 && req && G.sys.steady.progress > 0.3 && !(BOT.lift > 0)) { BOT.lift = 0.6; bt.stareFlinch--; }
  if (BOT.lift > 0) { BOT.lift -= 1 / 60; G.input.feed({ move: { x: 0, y: 0 }, hold: [] }); return true; }
  const hold = req || (v && v.kind && v.progress > 0 && v.progress < 1) ? ['interact'] : ph < 1.8 ? ['interact'] : ph >= 2.0 && ph < 3.2 ? ['firasa'] : [];
  G.input.feed({ move: { x: 0, y: 0 }, hold });
  return true;
}
/** bot: turn the camera onto a world point with thumb-drag-sized look input (what a player does); returns the remaining angle (rad) */
function aimAt(G, p, gain = 6) {
  const cam = G.actors.cam, pl = G.actors.player, dt = 1 / 60;
  const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, h = Math.hypot(dx, dz) || 1;
  const wantYaw = yawOf(dx, dz), dy = Math.atan2(Math.sin(wantYaw - cam.yaw), Math.cos(wantYaw - cam.yaw));
  const wantPitch = clamp(Math.atan2(G.camera.position.y - (p.y !== undefined ? p.y : pl.pos.y + 1.3), h), -0.25, 1.1), dp = wantPitch - cam.pitch;
  const lx = clamp(-dy * gain * dt, -0.12, 0.12), ly = clamp(-dp * gain * dt, -0.08, 0.08);
  G.input.feed({ look: { x: lx, y: ly } });
  return Math.hypot(dy, dp);
}
const hAt = (G, x, z) => G.world.terrain.heightAt(x, z);
const P3 = (G, x, z, h = 0) => [x, hAt(G, x, z) + h, z];
const isStub = f => !f || f._stub === true;
/** a promise nobody awaits must not surface BeatAbort as an unhandled rejection when the beat ends */
const free = p => { if (p && p.catch) p.catch(() => {}); return p; };
const ar = a => (Array.isArray(a) ? a : [a]);
const player = G => G.actors.player;
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fireP = L => at(L, 'fire');

/** a scene-level point that follows an npc's head (the ring of الثبات is drawn around it; camera aim uses world positions) */
function headOf(G, d, npc) {
  const e = new THREE.Object3D(), h = npc.actor.height * 0.9;
  e.position.set(npc.pos.x, npc.pos.y + h, npc.pos.z); G.scene.add(e);
  d.onEnd(() => { if (e.parent) e.parent.remove(e); });
  d.task(() => { e.position.set(npc.pos.x, npc.pos.y + h, npc.pos.z); return undefined; });
  return e;
}

function newMaterial(G, color) { const m = new THREE.MeshLambertMaterial({ color }); if (G.shade && G.shade.patch) G.shade.patch(m); return m; }

/** a dagger: hilt + a blade that can show an inch (blade.scale.z) */
function makeDagger(G) {
  const g = new THREE.Group();
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.13), newMaterial(G, 0x5a3a22)); hilt.position.z = 0.0;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.24), newMaterial(G, 0xb9bcc0)); blade.position.z = 0.19; blade.scale.z = 0.0001;
  g.add(hilt, blade); g.userData.blade = blade;
  return g;
}
/** where the dagger sits: 'sheath' (hip) | 'hand' (closed on the hilt). blade ∈ 0..1 of its length */
function daggerTo(G, thamer, where, blade = 0) {
  if (!daggerObj) daggerObj = makeDagger(G);
  const a = thamer.actor;
  const sock = a.socket && !isStub(a.socket) ? a.socket(where === 'hand' ? 'handR' : 'hips') : a.root;
  if (daggerObj.parent !== sock) sock.add(daggerObj);
  if (sock === a.root) daggerObj.position.set(0.25, a.height * 0.55, 0.12); else daggerObj.position.set(where === 'hand' ? 0 : 0.18, 0, where === 'hand' ? 0 : 0.08);
  daggerObj.rotation.set(where === 'hand' ? Math.PI / 2 : 0, 0, 0);
  daggerObj.userData.blade.scale.z = Math.max(0.0001, blade);
}

/** a rifle prop (props.make('rifle') is a vertical mesh, barrel up) */
function rifleMesh(G) { return G.world.props.make('rifle'); }
function hangRifle(G, wadha) {
  if (hungRifle) { if (hungRifle.parent) hungRifle.parent.remove(hungRifle); hungRifle = null; }
  if (!wadha || !wadha.saddle) return;
  hungRifle = rifleMesh(G);
  hungRifle.position.set(0.42, 0.18, 0.1); hungRifle.rotation.set(0.15, 0.3, 1.25);
  wadha.saddle.add(hungRifle);
}
function layRifle(G, x, z) {
  rifleDropAt = { x, z };
  if (groundRifle && groundRifle.parent) groundRifle.parent.remove(groundRifle);
  groundRifle = rifleMesh(G);
  groundRifle.position.set(x, hAt(G, x, z) + 0.06, z); groundRifle.rotation.set(0, 0.7, Math.PI / 2);
  G.scene.add(groundRifle);
}
function clearRifles(G) {
  for (const r of [hungRifle, groundRifle]) if (r && r.parent) r.parent.remove(r);
  hungRifle = groundRifle = null;
}

function giveStaff(G, mani, on) {
  if (staffProp && staffProp.parent) staffProp.parent.remove(staffProp);
  staffProp = null;
  if (!on || !mani) return;
  staffProp = G.world.props.make('staff');
  const a = mani.actor, sock = a.socket && !isStub(a.socket) ? a.socket('handR') : null;
  if (sock) sock.add(staffProp); else { staffProp.position.set(0.35, a.height * 0.5 - 0.1, 0.1); a.root.add(staffProp); }
}

/** walk an npc to a point on a scope-owned tween (cancels with its branch) and face a target */
async function walkTo(d, npc, p, speed = 1.3, face = null) {
  const sx = npc.pos.x, sz = npc.pos.z, dist = Math.hypot(p.x - sx, p.z - sz), yaw = yawOf(p.x - sx, p.z - sz);
  if (dist > 0.05) await d.tween(dist / speed, k => { npc.place(sx + (p.x - sx) * k, sz + (p.z - sz) * k, yaw); npc.actor.locomotion(speed); });
  npc.actor.locomotion(0);
  if (face) npc.actor.faceTo(face.x, face.z, 6);
}

/** camera: hold a fixed shot until released (the beat releases it on end) */
function shotCut(G, d, pos, look) {
  const cam = G.actors.cam;
  cam.cut(pos, look);
  if (camHoldFor !== G.scope) { camHoldFor = G.scope; d.onEnd(() => cam.release({ duration: 0.6 })); }
}

// ---------------------------------------------------------------------------------------------------- staging
function people(G, L, idx, flags) {
  const N = G.actors.npcs, fire = fireP(L), th = at(L, 'thamer');
  const hero = player(G).pos;
  // --- riflemen ---
  MEN.forEach((m, i) => {
    let clip = 'idle', p = { x: m.x, z: m.z }, face = fire;
    if (idx >= 2 && m.id === 'rf5') p = { x: -8.5, z: 240 };
    if (idx >= 2 && m.id === 'rf6') p = { x: 8, z: 241 };
    if (idx <= 1) { clip = m.stand ? 'idle' : 'sit'; face = idx === 1 && m.stand ? hero : m.stand ? { x: 0, z: 218 } : fire; }
    else if (idx <= 4) { clip = 'idle'; face = idx === 2 ? hero : fire; }
    else if (idx === 5) { clip = 'idle'; face = fire; }
    else { p = { x: p.x * 0.8 + 3, z: p.z + 3 }; face = at(L, 'well'); }
    const n = cast(G, m.id, 'jaber', p, yawTo(p, face), { tint: MEN_TINTS[i], clip });
    n.lookAtPlayer(false);
    const a = n.actor;
    if (!a.userData) a.userData = {};
    if (!a.userData.rifle && a.socket && !isStub(a.socket)) { const r = rifleMesh(G); r.scale.setScalar(0.9); a.socket('handR').add(r); a.userData.rifle = r; }
    if (a.userData.rifle) a.userData.rifle.quaternion.identity();
    if (a.setHandTargets) a.setHandTargets(null);
  });
  // --- Sheikh ثامر ---
  let tp = th, tclip = 'sit';
  if (idx === 3) { tp = STARE_FROM; tclip = 'idle'; }
  else if (idx === 4) { tp = STARE_CLOSE; tclip = 'idle'; }
  else if (idx === 5) { tp = { x: 1.6, z: 244.4 }; tclip = 'idle'; }
  else if (idx >= 6) { tp = { x: -1.5, z: 250 }; tclip = 'idle'; }
  const thamer = cast(G, 'thamer', 'jaber', tp, yawTo(tp, idx >= 6 ? at(L, 'well') : (idx >= 3 && idx <= 4 ? hero : { x: 0, z: 200 })), { tint: THAMER_TINT, clip: tclip });
  daggerTo(G, thamer, idx === 4 ? 'hand' : 'sheath', idx === 4 && flags.haybah <= 1 ? 0.0001 : 0);
  // --- jaber: with ثامر once he has testified (gave) / at the well in the morning ---
  if (idx >= 5 && (flags.gaveWater || idx >= 6)) {
    const jp = idx >= 6 ? { x: -4.5, z: 249 } : { x: -2.6, z: 239.6 };
    cast(G, 'jaber', 'jaber', jp, yawTo(jp, idx >= 6 ? at(L, 'well') : fire), { clip: 'idle' });
  } else if (idx < 5 || !flags.gaveWater) G.actors.npcs.remove('jaber');
  // --- the caravan at the well (dawn) ---
  if (idx >= 6) {
    const w = at(L, 'well');
    const q = { mani: { x: 3.6, z: 251.4 }, misfer: { x: 9.6, z: 250.2 }, moudi: { x: 11.4, z: 252.6 }, fuhaid: { x: 6.6, z: 257.6 } };
    for (const id of Object.keys(q)) { const n = cast(G, id, id, q[id], yawTo(q[id], idx === 6 && id === 'mani' ? hero : w)); n.lookAtPlayer(id === 'mani' || id === 'fuhaid'); }
    camel(G, 'hwar', { x: 9.5, z: 258.5 }, 3.4, { scale: 0.55 });
    camel(G, 'p1', { x: 13.5, z: 255.5 }, 2.6, { tint: 0xc9a877 });
    camel(G, 'p2', { x: 15.5, z: 252 }, 2.9, { tint: 0xb08a5a });
    camel(G, 'p3', { x: 12, z: 260.5 }, 3.8, { tint: 0x9c7748 });
    giveStaff(G, G.actors.npcs.get('mani'), idx === 6 && !staffGiven);
  } else {
    for (const id of ['mani', 'misfer', 'moudi', 'fuhaid']) G.actors.npcs.remove(id);
    for (const id of ['hwar', 'p1', 'p2', 'p3', 'jcamel']) G.actors.camels.remove(id);
    giveStaff(G, null, false);
  }
}

function stage(G, L, id, resumed) {
  const idx = ORDER.indexOf(id), flags = G.state.flags, pl = player(G), W = G.world;
  // sky, weather, fires
  W.sky.setPreset(idx >= 7 ? 'sunrise_rain' : idx >= 6 ? 'dawn' : 'night', { duration: 0 });
  W.weather.setWind(240, id === 'c5_walk' ? 0.12 : 0.3);
  W.weather.storm(0, { duration: 0 }); W.weather.rain(idx >= 7 ? 0.5 : 0, { duration: 0 });
  if (L.fires.well) L.fires.well.setLit(true);
  if (pileH) { pileH.setLit(idx >= 6); if (idx >= 6 && pileH.setBeacon) pileH.setBeacon(0); }
  if (threatLight) { const z = idx >= 2 ? 244 : 229; threatLight.position.set(0.8, hAt(G, 0.8, z) + 2.6, z); threatLight.intensity = idx >= 6 ? 0 : idx >= 2 ? 9 : 26; }
  // hud + firasa: the eye is only needed to count the men
  const eye = id === 'c5_scout';
  hud(G, { eye, water: false, strip: true });
  G.sys.firasa.setAllowed(eye); G.sys.firasa.setRange(45);
  G.ui.hud.count(null); prompt(G, null);
  // music
  if (idx <= 2 || id === 'c5_signal') music(G, 'music_night'); else if (idx >= 6) music(G, 'music_haya'); else music(G, null, 1.5);
  if (id === 'c5_walk') music(G, null, 2);
  // the camel, the rifle, the hero
  const wp = at(L, 'crest', -2.8, -1.4);
  const wadha = camel(G, 'wadha', wp, 1.0);
  if (wadha.pose) free(wadha.pose('kneel', { duration: 0.01 }));
  const hung = idx >= 1 && flags.leftRifle;
  hangRifle(G, hung ? wadha : null);
  if (groundRifle && groundRifle.parent) { groundRifle.parent.remove(groundRifle); groundRifle = null; }
  if (idx >= 3 && !hung && id !== 'c5_scout') layRifle(G, rifleDropAt ? rifleDropAt.x : -1.3, rifleDropAt ? rifleDropAt.z : 237.9);
  const carry = idx <= 2 && !hung ? 'rifle' : null;
  if (pl.equip) pl.equip(carry);
  if (resumed) {
    const spots = {
      c5_scout: { ...at(L, 'crest', 0, 3.4), yaw: 0 }, c5_walk: { ...at(L, 'foot'), yaw: 0 },
      c5_words: HERO_AT_FIRE, c5_stare: HERO_AT_FIRE, c5_verdict: HERO_AT_FIRE, c5_signal: { x: 0, z: 238.4, yaw: 0 },
      c5_staff: { ...WELL_FRONT, yaw: 0 }, c5_end: { ...WELL_FRONT, yaw: 0 },
    };
    const s = spots[id]; pl.teleport(s.x, s.z, s.yaw);
    if (G.actors.cam.snap) G.actors.cam.snap();
  }
  people(G, L, idx, flags);
  if (id === 'c5_signal' && pl.equip) pl.equip(null);
  if (idx >= 6 && pl.equip) pl.equip(staffGiven || id === 'c5_end' ? 'staff' : null);
  if (G.actors.cam.frame && id === 'c5_scout') G.actors.cam.frame(fireP(L));
}

// ---------------------------------------------------------------------------------------------------- shots
async function muzzleFlash(G, d, p, color = 0xffd070, size = 1.8, s = 0.14) {
  const g = G.world.props.glow(p, { color, size }); g.set(1);
  d.own(g); await d.wait(s); g.set(0); g.remove();
}

/** one sentry shot at (hx, hz); `lead` seconds of readable telegraph (the shooter raises the rifle, the screen edge glints) */
async function fireShot(G, d, L, man, impact, lead, w) {
  const pl = player(G), n = G.actors.npcs.get(man.id);
  const mx = man.x, mz = man.z, my = hAt(G, mx, mz) + 1.45;
  if (n) { n.actor.faceTo(impact.x, impact.z, 10); n.actor.play('aim'); }
  G.ui.hud.glint(bearingDeg(yawOf(mx - pl.pos.x, mz - pl.pos.z)));
  const g = G.world.props.glow({ x: mx, y: my, z: mz }, { color: 0xffe1a0, size: 0.5, pulse: true }); g.set(0.8); d.own(g);
  await d.wait(lead);
  g.remove();
  G.audio.sfx('sfx_shot', { at: { x: mx, z: mz } });
  G.actors.cam.shake(man.shoots === 2 ? 0.5 : 0.22, man.shoots === 2 ? 0.5 : 0.3);
  if (w) w.shot();
  d.spawn(async d2 => { await muzzleFlash(G, d2, { x: mx, y: my, z: mz }, 0xffd070, 2.2, 0.14); });
  d.spawn(async d2 => { await muzzleFlash(G, d2, { x: impact.x, y: hAt(G, impact.x, impact.z) + 0.2, z: impact.z }, 0xc9a877, 1.1, 0.5); });
  await d.wait(0.35);
  if (n) n.actor.play('aim');
}

// ---------------------------------------------------------------------------------------------------- chapter
export default {
  id: 'ch5', index: 5, assets: 'ch5', level: LEVELS.haya, sky: 'night', lst: undefined, survival: { thirst: 100, sips: 0, drain: false },

  setup(G, L) {
    BOT.at = null; rifleDropAt = null; staffGiven = false; camHoldFor = null; seen = new Set(); titleShown = false; scoutPhase = ''; daggerObj = null; hungRifle = groundRifle = staffProp = null;
    // Reflected firelight catches coats and rifle barrels without a glowing enemy outline.
    threatLight = new THREE.PointLight(0xffc28a, 26, 32, 2);
    threatLight.position.set(0.8, hAt(G, 0.8, 229) + 2.6, 229); threatLight.castShadow = false;
    threatLight.name = 'camp-reflected-firelight'; G.scene.add(threatLight);
    L.own({ remove() { G.scene.remove(threatLight); threatLight.dispose(); } });
    const pile = at(L, 'pile');
    pileH = G.world.props.signalPile(pile.x, pile.z); pileH.setLit(false);
    L.own({ remove: G.events.on('player:bounds', () => toast(G, 'c5.bounds', 3.6)) });
    L.own({ remove() { for (const r of [hungRifle, groundRifle, staffProp]) if (r && r.parent) r.parent.remove(r); } });
  },

  beats: [
    // ------------------------------------------------------------------------------------------------ 1
    {
      id: 'c5_scout',
      enter(G, L, ctx) { stage(G, L, 'c5_scout', ctx.resumed); },
      bot(G, bot) {
        if (scoutPhase !== 'count') return autoBot(G, bot);
        // a player sweeps the eye over the basin: aim at the nearest man not yet counted, keep the eye held
        const pl = player(G), left = MEN.filter(m => !seen.has(m.id)).sort((a, b) => hdist(pl.pos, a) - hdist(pl.pos, b));
        if (left.length && !G.state.fastText) aimAt(G, { x: left[0].x, z: left[0].z, y: hAt(G, left[0].x, left[0].z) + 1.3 });
        G.input.feed({ move: { x: 0, y: 0 }, hold: ['firasa'] }); return true;
      },
      async run(G, L, d) {
        const fire = fireP(L), crest = at(L, 'crest'), foot = at(L, 'foot');
        const pl = player(G), wadha = G.actors.camels.get('wadha');
        d.flag('leftRifle', false);
        if (!titleShown) { titleShown = true; await d.card('c5'); }
        // ---- count the six with الفراسة (range lifted to 75 m: the men sit 45–70 m below the crest)
        seen = new Set(); scoutPhase = 'count';
        G.sys.firasa.setAllowed(true); G.sys.firasa.setRange(75);
        d.onEnd(() => { G.sys.firasa.setRange(45); scoutPhase = ''; });
        g5(d, 'c5_scout.obj', fire);
        prompt(G, 'c5_scout.prompt.count');
        MEN.forEach(m => {
          const n = G.actors.npcs.get(m.id);
          G.sys.firasa.addClue({ id: m.id, at: n.actor.root, type: 'creature', radius: 75, height: 1.3, onSeen: () => { seen.add(m.id); G.ui.hud.count(seen.size); } });
        });
        await d.until(() => seen.size >= MEN.length);
        scoutPhase = ''; BOT.at = null;
        prompt(G, null); d.objectiveDone();
        d.bark('c5_scout.bark.1');
        await pause(G, d, 2.2);
        G.ui.hud.count(null);
        // ---- hang the rifle on the saddle (hold 1 s) — or go down armed
        let hung = false;
        g5(d, 'c5_scout.rifle.obj', wadha.root);
        const h = G.sys.interact.add({ id: 'hang', at: wadha.root, radius: 3.2, label: 'c5_scout.label.hang', hold: 1, once: true, height: 1.3,
          onUse: () => { hung = true; } });
        d.own(h);
        let shown = false;
        d.spawn(async d2 => {
          for (;;) {
            const near = hdist(pl.pos, wadha.pos) < 5 && !hung;
            if (near && !shown) { prompt(G, 'c5_scout.prompt.hang'); shown = true; } else if (!near && shown) { prompt(G, null); shown = false; }
            await d2.wait(0.25);
          }
        });
        const how = await d.first({ hang: d.until(() => hung), down: d.until(() => pl.pos.z > foot.z - 4) });
        prompt(G, null);
        if (how === 'hang') {
          d.objectiveDone();
          d.flag('leftRifle', true);
          if (pl.equip) pl.equip(null);
          hangRifle(G, wadha);
          toast(G, 'c5_scout.toast.hung', 3.8);
          await pause(G, d, 2.4);
        } else {
          toast(G, 'c5_scout.toast.armed', 4.2);
          await pause(G, d, 1.2);
        }
      },
    },

    // ------------------------------------------------------------------------------------------------ 2
    {
      id: 'c5_walk',
      enter(G, L, ctx) { stage(G, L, 'c5_walk', ctx.resumed); },
      bot(G, bot) {
        const L = G.sys.director.level, pl = player(G), fire = fireP(L), foot = at(L, 'foot');
        if (G.state.mode !== 'play') return true;
        const w = bot._w || (bot._w = { z: pl.pos.z, n: 0 });
        if (pl.pos.z > w.z + 0.05 || pl.pos.z < w.z - 5) { w.z = pl.pos.z; w.n = 0; } else if (++w.n > 300) { pl.teleport(pl.pos.x, pl.pos.z + 2, pl.yaw); w.z = pl.pos.z; w.n = 0; }
        const bt = G.state.botTest, along = Math.hypot(pl.pos.x - foot.x, pl.pos.z - foot.z);
        if (bt && bt.walkFlinch > 0 && along > 10 + 8 * (3 - bt.walkFlinch) && !(bot._stop > 0)) { bot._stop = 0.9; bt.walkFlinch--; }   // tests: stand still for 0.9 s
        if (bot._stop > 0) { bot._stop -= 1 / 60; G.input.feed({ move: { x: 0, y: 0 }, hold: [] }); return true; }
        if (hdist(pl.pos, fire) > 3) bot.steer(fire, 0.75); else G.input.feed({ move: { x: 0, y: 0 }, hold: [] });
        return true;
      },
      async run(G, L, d) {
        const pl = player(G), fire = fireP(L), foot = at(L, 'foot'), S = G.sys.steady;
        g5(d, 'c5_walk.obj', fire);
        const fails = S.fails ? S.fails('c5_walk') : 0;
        // the men's shots are telegraphed (0.4 s earlier for those the hero counted; a little longer after every failure)
        const leadOf = m => 0.6 + (seen.has(m.id) ? 0.4 : 0) + 0.25 * Math.min(fails, 3);
        // Establish the two nearest rifles before the thumb-stability test starts.
        if (fails === 0) {
          for (const m of MEN.filter(m => m.stand)) {
            const n = G.actors.npcs.get(m.id); if (n) { n.play('aim'); n.actor.faceTo(pl.pos.x, pl.pos.z, 8); }
          }
          await d.cine([
            { pos: P3(G, 3.8, 216.5, 1.65), look: P3(G, 6.5, 222, 1.3), dur: 1.8, cut: true },
            { pos: P3(G, -2.2, 228.5, 1.65), look: P3(G, -6, 234, 1.3), dur: 1.8, cut: true },
          ]);
          G.actors.cam.release({ duration: 0.65 });
          await pause(G, d, 0.7);
        }
        // Both riflemen track the approach; the far pair remain ahead near the fire.
        d.task(() => {
          for (const m of MEN.filter(m => m.stand)) {
            const n = G.actors.npcs.get(m.id); if (!n) continue;
            n.actor.faceTo(pl.pos.x, pl.pos.z, 3);
            const rifle = n.actor.userData && n.actor.userData.rifle;
            if (rifle && rifle.parent) {
              rifle.parent.updateWorldMatrix(true, false);
              const grip = rifle.parent.getWorldPosition(new THREE.Vector3());
              const direction = new THREE.Vector3(pl.pos.x, pl.pos.y + 1.1, pl.pos.z).sub(grip).normalize();
              const worldQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
              rifle.quaternion.copy(rifle.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldQ));
              if (n.actor.setHandTargets) n.actor.setHandTargets({ left: grip.clone().addScaledVector(direction, 0.32), weight: 0.9 });
            }
          }
          return undefined;
        });
        d.onEnd(() => { for (const m of MEN.filter(m => m.stand)) { const n = G.actors.npcs.get(m.id); if (n && n.actor.setHandTargets) n.actor.setHandTargets(null); } });
        // found men stay faintly outlined
        for (const m of MEN) if (seen.has(m.id)) {
          const n = G.actors.npcs.get(m.id);
          if (n) { const g = G.world.props.glow({ x: m.x, y: hAt(G, m.x, m.z) + 1.0, z: m.z }, { color: 0xffc64a, size: 2.2 }); g.set(0.35); d.own(g); }
        }
        // free descent from the crest to the foot
        await d.until(() => pl.pos.z >= foot.z - 1.5);
        prompt(G, 'c5_walk.prompt.pace');
        await d.until(() => pl.moving);                    // F03: the walk starts with the first step — the same "moving" the player uses
        d.onEnd(() => G.world.weather.setWind(240, 0.3));
        G.world.weather.setWind(240, 0.1);
        let w = null, lim = null;
        if (fails < 3) w = S.walk({ to: fire, radius: 4, speed: WALK_SPEED });
        else lim = d.own(pl.limit ? pl.limit('walk', { speed: WALK_SPEED, pace: WALK_SPEED, run: false }) : null);   // the third failure: the walk is guided (no flinch)
        const along = () => Math.hypot(pl.pos.x - foot.x, pl.pos.z - foot.z);
        const watcher = d.spawn(async d2 => {
          await d2.until(() => along() > 6); d2.bark('c5_walk.bark.1'); prompt(G, null);
          await d2.until(() => along() > 12); d2.bark('c5_walk.bark.2');
          // shot 1 — 20 m, 3 m ahead-left of the hero
          await d2.until(() => along() > 20 - 1.5 * leadOf(MEN[0]));
          await fireShot(G, d2, L, MEN[0], { x: pl.pos.x + 2.1, z: pl.pos.z + 2.4 }, leadOf(MEN[0]), w);
          await d2.until(() => along() > 24); toast(G, 'c5_walk.toast.shot1', 3.6);
          await d2.until(() => along() > 30); d2.bark('c5_walk.bark.3');
          // shot 2 — 38 m, 0.6 m from his feet, with a shake
          await d2.until(() => along() > 38 - 1.5 * leadOf(MEN[1]));
          await fireShot(G, d2, L, MEN[1], { x: pl.pos.x - 0.45, z: pl.pos.z + 0.45 }, leadOf(MEN[1]), w);
          await d2.until(() => along() > 39.8); toast(G, 'c5_walk.toast.shot2', 3.6);
          // the last 6 m: the men rise and nothing happens
          await d2.until(() => along() > 41.5);
          d2.bark('c5_walk.bark.4');
          for (const m of MEN) { const n = G.actors.npcs.get(m.id); if (n && !m.stand) n.play('idle'); if (n) n.actor.faceTo(pl.pos.x, pl.pos.z, 3); }
        });
        let ok = true;
        if (w) ok = await w.done; else await d.near(fire, 4);
        watcher.cancel(); prompt(G, null);
        if (!ok) { if (S.fail) S.fail('c5_walk'); await d.failAndRestart('c5_walk.fail'); }
        d.objectiveDone();
        for (const m of MEN) { const n = G.actors.npcs.get(m.id); if (n) { n.play('idle'); n.actor.faceTo(pl.pos.x, pl.pos.z, 3); } }
        void lim;
        await pause(G, d, 0.8);
      },
    },

    // ------------------------------------------------------------------------------------------------ 3
    {
      id: 'c5_words',
      bot: autoBot,
      enter(G, L, ctx) { stage(G, L, 'c5_words', ctx.resumed); },
      async run(G, L, d) {
        const fl = d.flags, pl = player(G), thamer = G.actors.npcs.get('thamer'), fire = fireP(L);
        const th = at(L, 'thamer');
        const closeFace = (actor, side) => {
          actor.root.updateMatrixWorld(true);
          const h = actor.socket('head').getWorldPosition(new THREE.Vector3()), yaw = actor.yaw;
          const pos = h.clone().add(new THREE.Vector3(Math.sin(yaw) * 1.8 + Math.cos(yaw) * side * 0.62, 0.06, Math.cos(yaw) * 1.8 - Math.sin(yaw) * side * 0.62));
          shotCut(G, d, pos.toArray(), h.clone().add(new THREE.Vector3(0, -0.12, 0)).toArray());
        };
        const A = () => closeFace(thamer.actor, -1);
        const B = () => closeFace(pl.actor, 1);
        thamer.actor.faceTo(pl.pos.x, pl.pos.z, 3);
        thamer.setSpeechGesture(false);
        thamer.actor.lookAt(pl.actor); pl.actor.lookAt(thamer.actor);
        d.onEnd(() => { thamer.setSpeechGesture(true); thamer.actor.lookAt(null); pl.actor.lookAt(null); });
        let priorSpeaker = null, laidRifle = false, weaponAction = null;
        const offShots = G.events.on('dialogue:line', ({ who, text }) => {
          if (!fl.leftRifle && who === 'narrator' && text.includes('وضع ضاري بندقه')) {
            laidRifle = true;
            const px = pl.pos.x, pz = pl.pos.z;
            shotCut(G, d, P3(G, px - 3.4, pz + 2.6, 2.7), P3(G, px - 0.25, pz + 0.1, 0.22));
            pl.pose('kneel', { fade: 0.35 });
            weaponAction = d.spawn(async d2 => { await pause(G, d2, 0.65); layRifle(G, px - 0.75, pz + 0.28); if (pl.equip) pl.equip(null); await pause(G, d2, 0.55); pl.pose(null, { fade: 0.45 }); });
            priorSpeaker = null; return;
          }
          if (who === priorSpeaker) return;
          if (who === 'thamer') { A(); priorSpeaker = who; }
          else if (who === 'dhari') { B(); priorSpeaker = who; }
        });
        d.onEnd(offShots);
        await pause(G, d, 0.12); // let the seated skeleton settle before measuring the first close shot
        A();
        await d.talk(fl.leftRifle ? 'c5_words.open.unarmed' : 'c5_words.open.armed');
        if (weaponAction) await weaponAction.done;
        if (!fl.leftRifle && !laidRifle) { layRifle(G, -1.3, 237.9); if (pl.equip) pl.equip(null); }
        // Keep his seated contact planted. His gaze changes with the answer, without sliding the whole body.
        const lean = async k => {
          thamer.actor.lookAt({ x: pl.pos.x, y: pl.pos.y + (k > 0 ? 1.45 : 1.1), z: pl.pos.z });
          await pause(G, d, k ? 0.85 : 0.45);
          thamer.actor.lookAt(pl.actor);
        };
        g5(d, 'c5_words.obj', thamer.actor.root);
        let effect = 0;
        // ---- exchange 1
        A(); await d.talk('c5_words.r1.q');
        B();
        const r1 = await d.choice('c5_words.r1.ask', [
          { key: 'c5_words.r1.choice.a', value: 'a', confirm: true }, { key: 'c5_words.r1.choice.b', value: 'b', confirm: true }, { key: 'c5_words.r1.choice.c', value: 'c', confirm: true }]);
        effect += { a: 2, b: 1, c: -1 }[r1];
        A(); await d.talk('c5_words.r1.' + r1);
        toast(G, 'c5_words.r1.' + r1 + '.circle', 4);
        await lean(r1 === 'c' ? 1 : r1 === 'a' ? -1 : 0);
        await pause(G, d, 1.0);
        // ---- exchange 2
        await d.talk('c5_words.r2.q');
        B();
        const r2 = await d.choice('c5_words.r2.ask', [
          { key: 'c5_words.r2.choice.a', value: 'a', confirm: true }, { key: 'c5_words.r2.choice.b', value: 'b', confirm: true }, { key: 'c5_words.r2.choice.c', value: 'c', confirm: true }]);
        effect += { a: -1, b: 2, c: 0 }[r2];
        d.flag('haybah', clamp(effect, 0, 4));
        A(); await d.talk('c5_words.r2.' + r2);
        toast(G, 'c5_words.r2.' + r2 + '.circle', 4);
        await lean(r2 === 'a' ? 1 : r2 === 'b' ? -1 : 0);
        d.objectiveDone();
        await pause(G, d, 1.0);
        // ---- words are not enough: he rises and comes around the fire
        await d.talk('c5_words.rise');
        offShots(); thamer.setSpeechGesture(true); pl.actor.lookAt(null);
        thamer.play('idle');
        daggerTo(G, thamer, 'sheath');
        await walkTo(d, thamer, STARE_FROM, 1.5, pl.pos);
        G.actors.cam.release({ duration: 0.8 });
        void fire;
      },
    },

    // ------------------------------------------------------------------------------------------------ 4
    {
      id: 'c5_stare',
      bot: autoBot,
      enter(G, L, ctx) { stage(G, L, 'c5_stare', ctx.resumed); },
      async run(G, L, d) {
        const pl = player(G), S = G.sys.steady, thamer = G.actors.npcs.get('thamer'), hb = d.flags.haybah;
        music(G, null, 1.2);
        const secs = Math.max(5, 8 - 0.6 * hb);
        const look = () => thamer.actor.faceTo(pl.pos.x, pl.pos.z, 8);
        const reset = () => { thamer.place(STARE_FROM.x, STARE_FROM.z, yawTo(STARE_FROM, pl.pos)); daggerTo(G, thamer, 'sheath'); };
        const move = (d2, p, speed) => walkTo(d2, thamer, p, speed, pl.pos);
        g5(d, 'c5_stare.obj', thamer.actor.root);
        prompt(G, 'c5_stare.prompt.steady');
        const eye = headOf(G, d, thamer);
        const mv = [];
        const stage1 = () => mv.push(d.spawn(async d2 => { await move(d2, STARE_NEAR, 1.1); toast(G, 'c5_stare.toast.stage1', 3.6); }));
        const stage2 = () => mv.push(d.spawn(async d2 => { await move(d2, STARE_CLOSE, 0.8); daggerTo(G, thamer, 'hand', 0); toast(G, 'c5_stare.toast.stage2', 3.6); }));
        // the test window opens when the thumb is down: from then on a flinch fails the hold
        d.spawn(async d2 => {
          for (;;) {
            if (S.activeRequest && S.progress > 0.04) { prompt(G, null); if (!S.testing) S.tense(true); }
            await d2.wait(0.1);
          }
        });
        const fails = await steadyLadder(G, d, 'c5_stare', { target: eye, seconds: secs, labelKey: 'c5_stare.label.steady', breakOn: 'flinch', stages: [stage1, stage2] },
          { floor: 5, failKeys: ['c5_stare.fail.1', 'c5_stare.fail.2', 'c5_stare.fail.3'], onFail: async () => { S.tense(false); mv.forEach(m => m.cancel()); mv.length = 0; reset(); } });
        S.tense(false); prompt(G, null);
        if (fails >= 3) { await move(d, STARE_NEAR, 1.1); await move(d, STARE_CLOSE, 0.8); daggerTo(G, thamer, 'hand', 0); }   // the third failure auto-steadies
        // stage 3: when his words were poor, an inch of blade
        look();
        // the hold is won: a close side shot shows the two faces and his hand on the dagger (the hero would hide him from behind)
        shotCut(G, d, P3(G, 3.1, 238.7, 1.5), P3(G, 0.5, 238.7, 1.4));
        if (hb <= 1) { daggerTo(G, thamer, 'hand', 0.28); await pause(G, d, 0.5); toast(G, 'c5_stare.toast.stage3', 3.6); }
        d.objectiveDone();
        await pause(G, d, 1.8);
      },
    },

    // ------------------------------------------------------------------------------------------------ 5
    {
      id: 'c5_verdict',
      bot: autoBot,
      enter(G, L, ctx) { stage(G, L, 'c5_verdict', ctx.resumed); },
      async run(G, L, d) {
        const fl = d.flags, pl = player(G), thamer = G.actors.npcs.get('thamer'), cam = G.actors.cam;
        const SIDE = () => shotCut(G, d, P3(G, 4.6, 240.4, 1.7), P3(G, -0.6, 234.6, 1.4));
        SIDE();
        thamer.actor.faceTo(pl.pos.x, pl.pos.z, 4);
        const hb = fl.haybah;
        await d.talk(hb >= 3 ? 'c5_verdict.words.high' : hb === 2 ? 'c5_verdict.words.mid' : 'c5_verdict.words.low');
        if (fl.gaveWater) {
          // جابر rides in from the dark on the Sheikh's own camel
          const start = at(L, 'crest', 5, 4), stop = { x: 3.6, z: 233.5 };
          const jc = camel(G, 'jcamel', start, 0, { tint: 0xb08a5a });
          const jab = cast(G, 'jaber', 'jaber', start, 0, { clip: 'sit' });
          jab.ride(jc);
          const ride = d.spawn(async d2 => { await jc.goTo(stop.x, stop.z, { speed: 4, stop: 1.2 }); });
          await d.talk('c5_verdict.gave');
          await ride.done;
          jab.unride(); free(jc.pose('kneel', { duration: 1 }));
          const jp = { x: -2.6, z: 239.6 };
          jab.place(jp.x, jp.z, yawTo(jp, fireP(L))); jab.play('idle');
          daggerTo(G, thamer, 'sheath');
          thamer.actor.faceTo(pl.pos.x, pl.pos.z, 4);
          await d.talk('c5_verdict.gave.oath');
        } else {
          daggerTo(G, thamer, 'sheath');
          await d.talk('c5_verdict.refused');
        }
        await d.talk('c5_verdict.signal');
        cam.release({ duration: 0.8 });
      },
    },

    // ------------------------------------------------------------------------------------------------ 6
    {
      id: 'c5_signal',
      bot: autoBot,
      enter(G, L, ctx) { stage(G, L, 'c5_signal', ctx.resumed); if (pileH) pileH.setLit(false); },
      async run(G, L, d) {
        const fl = d.flags, pl = player(G), fire = at(L, 'fire', 0, -1.4), pile = at(L, 'pile'), cam = G.actors.cam, W = G.world;
        // ---- take a brand from ثامر's fire
        g5(d, 'c5_signal.obj', fire);
        await use(G, d, { id: 'brand', at: fire, radius: 3.4, label: 'c5_signal.label.take', hold: 0.8, once: true, height: 1.0 });
        if (pl.equip) pl.equip('torch', { lit: true });
        d.objectiveDone();
        // ---- carry it ≤ 60 m up the ridge (running allowed; nothing fails)
        g5(d, 'c5_signal.obj', pile);
        await d.near(pile, 9);
        g5(d, 'c5_signal.light.obj', pile);
        prompt(G, 'c5_signal.prompt.light');
        await use(G, d, { id: 'light', at: pile, radius: 3.6, label: 'c5_signal.label.light', hold: 1.5, once: true, height: 1.2 });
        prompt(G, null); d.objectiveDone();
        pileH.setLit(true); if (pileH.setBeacon) pileH.setBeacon(520);
        const bigGlow = W.props.glow({ x: pile.x, y: hAt(G, pile.x, pile.z) + 12, z: pile.z }, { color: 0xffa648, size: 14 }); bigGlow.set(0.25);
        d.own(bigGlow);
        music(G, 'music_haya', 3);
        d.bark('c5_signal.bark.1');
        await pause(G, d, 3.2);
        // ---- cinematic: the halted caravan sees the fire; dawn; the descent; the trough
        const camp = { x: 76, z: -26 };            // the halted caravan on a high plateau with a clear line to the ridge fire (firelight on the haze)
        const crew = { mani: { x: camp.x + 0.2, z: camp.z + 2.2 }, misfer: { x: camp.x - 2.8, z: camp.z + 1.4 }, moudi: { x: camp.x + 2.6, z: camp.z + 0.8 }, fuhaid: { x: camp.x + 4.4, z: camp.z + 1.9 } };
        for (const id of Object.keys(crew)) cast(G, id, id, crew[id], 0, { clip: 'idle' });
        camel(G, 'hwar', { x: camp.x + 6.4, z: camp.z + 2.6 }, 0.2, { scale: 0.55 });
        camel(G, 'p1', { x: camp.x - 8, z: camp.z + 5 }, 0.1, { tint: 0xc9a877 }); camel(G, 'p2', { x: camp.x + 9, z: camp.z + 6.5 }, -0.2, { tint: 0xb08a5a }); camel(G, 'p3', { x: camp.x - 5.5, z: camp.z + 9 }, 0.3, { tint: 0x9c7748 });
        if (!fl.gaveWater) cast(G, 'jaber', 'jaber', { x: camp.x - 5.2, z: camp.z + 2.6 }, 0.2, { clip: 'sit' });
        const camPos = P3(G, camp.x + 0.6, camp.z - 8.5, 1.5);
        const farLook = [pile.x, camPos[1] + 31, pile.z];
        d.onEnd(() => cam.release({ duration: 0.8 }));
        await d.cine([
          { pos: P3(G, pile.x + 6, pile.z - 7, 3.2), look: P3(G, pile.x, pile.z, 2.6), dur: 2.2, cut: true },
          { pos: P3(G, pile.x + 18, pile.z - 40, 15), look: P3(G, pile.x, pile.z, 3), dur: 4.2 },
        ]);
        bigGlow.set(0.9);
        await d.cine([{ pos: camPos, look: farLook, dur: 0.1, cut: true }]);
        const far = d.card('c5_far', { seconds: 4.2 });
        await far;
        await d.talk('c5_signal.far');
        // time-lapse to dawn; they rise and walk down to the well
        const dawn = W.sky.setPreset('predawn', { duration: G.state.fastText ? 0.05 : 7 });
        const well = at(L, 'well');
        const down = d.spawn(async d2 => {
          const cx = at(L, 'crest');
          const arrive = [['mani', { x: 3.6, z: 251.4 }, -1], ['misfer', { x: 9.6, z: 250.2 }, 3], ['moudi', { x: 11.4, z: 252.6 }, -3.5], ['fuhaid', { x: 6.6, z: 257.6 }, 6]];
          arrive.forEach(([id, p, dx], i) => { const n = G.actors.npcs.get(id); n.place(cx.x + dx, cx.z - 6 - i * 3, 0); free(n.goTo(p.x, p.z, { speed: 1.9, stop: 0.6 })); });
          const camels = [['hwar', { x: 9.5, z: 258.5 }], ['p1', { x: 13.5, z: 255.5 }], ['p2', { x: 15.5, z: 252 }], ['p3', { x: 12, z: 260.5 }]];
          camels.forEach(([id, p], i) => { const c = G.actors.camels.get(id); c.place(cx.x - 8 + i * 5, cx.z - 14 - i * 4, 0); free(c.goTo(p.x, p.z, { speed: 2.4, stop: 1 })); });
          const j = G.actors.npcs.get('jaber');
          if (j && !fl.gaveWater) { j.place(cx.x, cx.z - 22, 0); j.play('idle'); free(j.goTo(-4.5, 249, { speed: 1.9, stop: 0.6 })); }
          await d2.wait(1);
        });
        const dcard = d.card('c5_dawn', { seconds: 5 });
        await d.cine([
          { pos: P3(G, -26, 150, 5.5), look: P3(G, 0, 190, 3), dur: 3, cut: true },
          { pos: P3(G, -24, 181, 5.5), look: P3(G, 0, 232, 1), dur: 3 },          // over the crest (a straight line from the plain to the basin would run through the ridge)
          { pos: P3(G, -22, 212, 3.4), look: P3(G, 0, 236, 2), dur: 3.5 },
        ]);
        await dcard; await dawn;
        Promise.resolve(W.sky.setPreset('dawn', { duration: G.state.fastText ? 0.05 : 4 })).catch(() => {});
        down.cancel();
        // everyone is at the trough
        staffGiven = false; people(G, L, 6, fl);
        await d.cine([{ pos: P3(G, 1.5, 243.5, 2.3), look: P3(G, 7, 253.5, 1.5), dur: 0.1, cut: true }, { pos: P3(G, 3, 242.5, 2.4), look: P3(G, 8, 254, 1.5), dur: 3 }]);
        await d.talk('c5_signal.drink');
        // the two old men meet after eight years
        const th = G.actors.npcs.get('thamer'), mani = G.actors.npcs.get('mani');
        th.place(3.8, 246.8, yawTo({ x: 3.8, z: 246.8 }, { x: 5.6, z: 249 })); mani.place(5.8, 249.2, yawTo({ x: 5.8, z: 249.2 }, { x: 3.8, z: 246.8 })); mani.lookAtPlayer(false); th.lookAtPlayer(false);
        await d.cine([{ pos: P3(G, 8.6, 245.2, 1.7), look: P3(G, 4.8, 248, 1.5), dur: 0.1, cut: true }]);
        if (fl.gaveWater) await d.talk('c5_signal.gave');
        else { await d.talk('c5_signal.refused'); await d.talk('c5_signal.refused.sulh'); }
        // the hero goes to the well
        pl.teleport(WELL_FRONT.x, WELL_FRONT.z, 0);
        cam.release({ duration: 1 });
        if (cam.snap) cam.snap();
      },
    },

    // ------------------------------------------------------------------------------------------------ 7
    {
      id: 'c5_staff',
      bot: autoBot,
      enter(G, L, ctx) { if (ctx.resumed) staffGiven = false; stage(G, L, 'c5_staff', ctx.resumed); },
      async run(G, L, d) {
        const fl = d.flags, pl = player(G), mani = G.actors.npcs.get('mani'), well = at(L, 'well'), W = G.world, cam = G.actors.cam;
        cam.frame(well);
        // ---- the same hold as the first morning — and this time it brings up water
        g5(d, 'c5_staff.obj', well);
        await pullWellBucket(G, d, { at: well, label: 'c5_staff.label.pull', id: 'pull', muddy: false });
        d.objectiveDone();
        G.audio.sfx('sfx_water', { at: well });
        await d.talk('c5_staff.water');
        if (pl.actor) pl.actor.play('idle');
        // the old man and the boy over the well: from the north so both are in the upper half (the dialogue box covers the lower)
        shotCut(G, d, P3(G, 5.3, 246.4, 1.8), P3(G, 5.2, 252.4, 1.0));
        await d.talk('c5_staff.truth');
        await d.talk('c5_staff.staff');
        staffGiven = true;
        giveStaff(G, mani, false); if (pl.equip) pl.equip('staff');
        if (fl.ration === 'child') await d.talk('c5_staff.ration.child'); else if (fl.ration === 'elder') await d.talk('c5_staff.ration.elder');
        await d.talk('c5_staff.haybah');
        await d.talk(fl.gaveWater ? 'c5_staff.gave' : 'c5_staff.refused');
        // ---- thunder from the south; the first drops
        G.audio.sfx('sfx_thunder'); cam.shake(0.12, 1.2);
        W.weather.rain(0.5, { duration: G.state.fastText ? 0.05 : 10 });
        Promise.resolve(W.sky.setPreset('sunrise_rain', { duration: G.state.fastText ? 0.05 : 8 })).catch(() => {});
        await d.talk('c5_staff.rain');
        await d.talk('c5_staff.last');
        // ---- the camera rises over the well, the rain, and the two clans at one trough
        const rise = d.cine([
          { pos: P3(G, well.x - 5, well.z - 9, 3.2), look: P3(G, well.x, well.z, 1.6), dur: 0.1, cut: true },
          { pos: P3(G, well.x - 8, well.z - 22, 34), look: P3(G, well.x + 2, well.z + 4, 4), dur: 11 },
        ]);
        await pause(G, d, 2.5);
        await d.card('c5_rain', { seconds: 4.5 });
        await d.card('epilogue', { seconds: 5 });
        await rise;
        cam.release({ duration: 0.4 });
      },
    },

    // ------------------------------------------------------------------------------------------------ 8
    {
      id: 'c5_end',
      bot: autoBot,
      enter(G, L, ctx) { stage(G, L, 'c5_end', ctx.resumed); },
      async run(G, L, d) {
        await d.fade(true, 2.2);
        await pause(G, d, 0.6);
      },
    },
  ],
};
