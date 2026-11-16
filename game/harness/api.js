/**
 * Contract conformance check (KERNEL-owned): compares every module's public surface with docs/ARCHITECTURE.md.
 *   /harness/harness.html?m=api&test=1        → window.__harness.api = { missing: ['path.name', …], checked: n }
 * A module is done only when nothing under its paths is listed in `missing`.
 */
import { isStub } from '../src/dev/stubfill.js';

export const assets = ['dhari', 'mani', 'camel', 'wolf'];

const EXPECT = {
  'world.terrain': 'build heightAt normalAt slopeAt softAt surfaceAt size exactRadius update',
  'world.sky': 'setPreset setVisibility uniforms sunDir sunLight hemi stars sunBearing update',
  'world.sky.stars': 'setLST dir asterism highlight',
  'world.sky.uniforms': 'uSunDir uSunColor uAmbSky uAmbGround uHorizonColor uZenithColor uTime uNight',
  'world.weather': 'setWind wind setDust storm rain visibility gust update',
  'world.props': 'spawn make scatter cairn bones rockOutcrop deadCamel fire signalPile flame glow flock colliders clear',
  'world.decals': 'print trail blob setFirasa',
  'actors.player': 'actor pos yaw speed mode spawn teleport mount dismount mounted limit push knockdown equip item swing setScripted moveTo trail',
  'actors.cam': 'follow yaw pitch forward snap setDistance shake aimError frame softLock skyMode cine cut release',
  'actors.npcs': 'spawn get remove clear crowd',
  'actors.camels': 'spawn get all remove clear',
  'actors.caravan': 'form follow pace halt kneelAll riseAll clear',
  'actors.wolves': 'spawnPack wave next threat alphaEnter alphaFeint alphaLunge flee alpha clear',
  'sys.interact': 'add verb current held suspend resume',
  'sys.firasa': 'active amount setAllowed setRange addClue',
  'sys.steady': 'hold tense brace walk progress activeRequest',
  'sys.survival': 'thirst sips set drink rate',
  'sys.objectives': 'set poke done clear mark',
  'sys.tracks': 'add',
  'sys.stars': 'find',
  'sys.director': 'startChapter restartBeat stop current failAndRestart',
  'ui': 'hud touch dialogue menus cards loading update',
  'ui.hud': 'ripple glint toast prompt count show',
  'ui.dialogue': 'show hide typing finishTyping choices hideChoices',
  'ui.cards': 'setFade show hide letterbox',
  'ui.menus': 'showTitle showPause showEnding hideAll',
  'ui.loading': 'show set',
  'audio': 'unlock setVolumes suspend resume music sfx loop ambience step heartbeat duck note ui',
};
const INSTANCES = {
  humanoid: 'root pos yaw height has place face faceTo play playOnce locomotion overlay socket lookAt setTint setVisible update dispose',
  npc: 'actor pos yaw place play playOnce goTo follow followTrail stop lookAtPlayer ride unride speak',
  camel: 'root pos yaw place face update setScale setTint setVisible dispose setSpeed gait saddle head pose lookAt goTo follow flee stop',
  fire: 'setLit lit position setBeacon',
  flame: 'setLit lit remove',
  glow: 'set remove',
  flock: 'pass dir remove',
  trail: 'setVisible setReveal remove',
  blob: 'remove',
  interactEntry: 'remove setEnabled setLabel',
  clue: 'remove seen',
  track: 'reveal hide progressOf distanceTo end remove',
  limit: 'remove',
  mark: 'remove',
  crowd: 'setVisible remove',
  steadyWalk: 'done shot',
  loopSound: 'setVolume stop',
};

export async function run(G) {
  const missing = [];
  let checked = 0;
  const at = path => path.split('.').reduce((o, k) => (o == null ? o : o[k]), G);
  const check = (path, obj, names) => {
    for (const n of names.split(' ')) {
      checked++;
      if (isStub(obj, n)) missing.push(`${path}.${n}`);
    }
  };
  for (const [path, names] of Object.entries(EXPECT)) check(path, at(path), names);

  const safe = (label, fn) => { try { return fn(); } catch (e) { missing.push(`${label} (threw: ${String(e && e.message || e).slice(0, 120)})`); return null; } };
  const A = G.actors, W = G.world, S = G.sys;
  W.terrain.build({ seed: 3, duneAmp: 6, duneScale: 90, windDeg: 250, flats: [{ x: 0, z: 0, r: 40, fall: 30 }], soft: [], gravel: [] });
  A.player.spawn(0, 0, 0);
  const npc = safe('npcs.spawn', () => A.npcs.spawn('t_mani', 'mani', { x: 3, z: 3, yaw: 0 }));
  if (npc) { check('npc', npc, INSTANCES.npc); check('humanoid', npc.actor, INSTANCES.humanoid); }
  const camel = safe('camels.spawn', () => A.camels.spawn('t_camel', { x: -6, z: 4 }));
  if (camel) check('camel', camel, INSTANCES.camel);
  const fire = safe('props.fire', () => W.props.fire(6, -4, {}));
  if (fire) check('fire', fire, INSTANCES.fire);
  const torch = safe('props.make', () => W.props.make('torch'));
  if (torch) { const fl = safe('props.flame', () => W.props.flame(torch, {})); if (fl) check('flame', fl, INSTANCES.flame); }
  const glow = safe('props.glow', () => W.props.glow({ x: 4, z: 9 }, { color: 0xffcc66, size: 2 }));
  if (glow) check('glow', glow, INSTANCES.glow);
  const flock = safe('props.flock', () => W.props.flock({ from: { x: -80, z: 0 }, to: { x: 80, z: 0 } }));
  if (flock) check('flock', flock, INSTANCES.flock);
  const pts = [{ x: 0, z: 5 }, { x: 4, z: 12 }, { x: 9, z: 20 }];
  const trail = safe('decals.trail', () => W.decals.trail(pts, 'camel', { fresh: 1 }));
  if (trail) check('trail', trail, INSTANCES.trail);
  const blob = safe('decals.blob', () => W.decals.blob(A.player.actor.root, 0.5));
  if (blob) check('blob', blob, INSTANCES.blob);
  const ent = safe('interact.add', () => S.interact.add({ id: 't', at: { x: 30, z: 30 }, label: 'ui.start', onUse() {} }));
  if (ent) check('interactEntry', ent, INSTANCES.interactEntry);
  const clue = safe('firasa.addClue', () => S.firasa.addClue({ id: 't', at: { x: 20, z: 20 }, type: 'track' }));
  if (clue) check('clue', clue, INSTANCES.clue);
  const track = safe('tracks.add', () => S.tracks.add({ id: 't', points: pts, kind: 'camel' }));
  if (track) check('track', track, INSTANCES.track);
  const lim = safe('player.limit', () => A.player.limit('t', { speed: 1 }));
  if (lim) check('limit', lim, INSTANCES.limit);
  const mark = safe('objectives.mark', () => S.objectives.mark('t', { at: { x: 0, z: -50 }, icon: 'goal' }));
  if (mark) check('mark', mark, INSTANCES.mark);
  const crowd = safe('npcs.crowd', () => A.npcs.crowd('mani', [{ x: 12, z: 12, yaw: 0, clip: 'sit' }]));
  if (crowd) check('crowd', crowd, INSTANCES.crowd);
  const walk = safe('steady.walk', () => S.steady.walk({ to: { x: 0, z: 40 } }));
  if (walk) { check('steadyWalk', walk, INSTANCES.steadyWalk); if (walk.done && walk.done.cancel) walk.done.cancel(); }
  const loop = safe('audio.loop', () => G.audio.loop('sfx_rain', { volume: 0 }));
  if (loop) check('loopSound', loop, INSTANCES.loopSound);
  for (const item of ['torch', 'rifle', 'staff', 'waterskin', 'bucket']) safe(`props.make(${item})`, () => { if (!W.props.make(item)) throw new Error('returned nothing'); });
  for (const kind of ['shrub', 'grass', 'rock', 'pebble', 'greenpatch']) safe(`props.scatter(${kind})`, () => W.props.scatter(kind, { count: 6, x: 20, z: -20, r: 12, seed: 5, avoid: [] }));
  safe('props.cairn', () => W.props.cairn(-20, -20, {}));
  safe('props.bones', () => W.props.bones(-24, -14));
  safe('props.rockOutcrop', () => W.props.rockOutcrop(-40, -30, { r: 6, h: 4, seed: 2 }));
  safe('props.deadCamel', () => W.props.deadCamel(-30, 10, 0.4));
  safe('props.signalPile', () => W.props.signalPile(14, -14));
  safe('decals.print', () => W.decals.print(1, 1, 0, 'hero', { fresh: 1 }));
  return { missing, checked };
}
