/**
 * Contract stub filler (KERNEL). After every module is constructed, any API of docs/ARCHITECTURE.md that a module does
 * not implement yet is filled with a harmless stand-in marked `_stub = true`, so neighbours never crash on a missing call.
 * Real implementations are never touched. `harness/api.js` reports every remaining stub as "missing".
 */
import * as THREE from 'three';

const warned = new Set();
function warn(name) { if (!warned.has(name)) { warned.add(name); console.warn('[stub]', name); } }
function fn(name, impl) { const f = function (...a) { warn(name); return impl ? impl.apply(this, a) : undefined; }; f._stub = true; return f; }
function fill(obj, path, table) {
  if (!obj) return;
  for (const [k, v] of Object.entries(table)) {
    if (k in obj) continue;
    if (typeof v === 'function') obj[k] = fn(`${path}.${k}`, v);
    else Object.defineProperty(obj, k, { value: v, writable: true, configurable: true, enumerable: true });
  }
}
const ok = v => () => Promise.resolve(v);
const handle = extra => () => ({ remove() {}, ...extra });

/** @param {any} G */
export function fillContractStubs(G) {
  const W = G.world, A = G.actors, S = G.sys;
  fill(W.terrain, 'terrain', { exactRadius: 64, normalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; }, slopeAt: () => 0, softAt: () => 0, surfaceAt: () => 'sand' });
  fill(W.sky, 'sky', { setVisibility() {}, sunBearing: () => 110 });
  fill(W.weather, 'weather', { gust: ok(), setDust() {}, storm() {}, rain() {} });
  fill(W.props, 'props', {
    make: id => { const g = new THREE.Group(); g.name = 'item:' + id; return g; },
    cairn: (x, z) => W.props.spawn && W.props.spawn('cairn', { x, z }),
    bones() {}, rockOutcrop() {}, deadCamel: () => new THREE.Group(), signalPile: (x, z) => W.props.fire(x, z, {}),
    flame: () => ({ lit: false, setLit(b) { this.lit = !!b; }, remove() {} }),
    glow: () => ({ set() {}, remove() {} }),
    flock: () => ({ pass: () => Promise.resolve(), dir: { x: 0, z: 1 }, remove() {} }),
    scatter() {}, clear() {},
  });
  fill(W.decals, 'decals', {
    print() {}, setFirasa() {}, blob: handle(),
    trail: () => ({ setVisible() {}, setReveal() {}, remove() {} }),
  });
  if (W.props.fire && !W.props.fire._wrapped) {
    const fire = W.props.fire.bind(W.props);
    W.props.fire = (...a) => { const h = fire(...a); fill(h, 'fire', { setBeacon() {} }); return h; };
    W.props.fire._wrapped = true;
  }
  if (W.decals.trail && !W.decals.trail._stub) {
    const trail = W.decals.trail.bind(W.decals);
    W.decals.trail = (...a) => { const h = trail(...a); fill(h, 'trail', { setVisible() {}, setReveal() {}, remove() {} }); return h; };
  }

  fill(A.player, 'player', {
    limit: handle(), push() {}, knockdown: ok(), equip() {}, item: null, trail: [],
    swing() { const p = A.player; G.events.emit('player:swing', { x: p.pos.x, z: p.pos.z, yaw: p.yaw }); return Promise.resolve(); },
    setScripted() {}, moveTo: ok(),
  });
  fill(A.cam, 'cam', { frame() {}, softLock() {}, skyMode() {}, setDistance() {}, shake() {}, cine: ok(), cut() {}, release() {}, aimError: () => 0, snap() {} });
  fill(A.npcs, 'npcs', { crowd: () => ({ setVisible() {}, remove() {} }) });
  const patchActor = actor => fill(actor, 'humanoid', { overlay() {}, lookAt() {}, setTint() {}, setVisible() {}, has: () => false, socket: () => actor.root });
  if (A.npcs.spawn) {
    const spawn = A.npcs.spawn.bind(A.npcs);
    A.npcs.spawn = (...a) => {
      const n = spawn(...a);
      fill(n, 'npc', { followTrail() {}, speak() {}, lookAtPlayer() {}, ride() {}, unride() {}, stop() {}, follow() {}, goTo: ok() });
      if (n && n.actor) patchActor(n.actor);
      return n;
    };
  }
  if (A.player.actor) patchActor(A.player.actor);
  if (A.camels.spawn) {
    const spawn = A.camels.spawn.bind(A.camels);
    A.camels.spawn = (...a) => {
      const c = spawn(...a);
      fill(c, 'camel', { goTo: ok(), follow() {}, flee: ok(), stop() {}, pose: ok(), lookAt() {}, setSpeed() {}, gait: 'idle', setTint() {}, setScale() {}, setVisible() {}, face() {} });
      return c;
    };
  }
  fill(A.caravan, 'caravan', { pace: 2.4, halt() {}, kneelAll: ok(), riseAll: ok(), follow() {}, form() {}, clear() {} });
  fill(A.wolves, 'wolves', {
    spawnPack() {}, wave: opts => Promise.resolve({ repelled: (opts && opts.lunges) || 0, missed: 0 }), next: null, threat: false,
    alphaEnter: ok(), alphaFeint: ok(), alphaLunge: ok(), flee: ok(), alpha: null, clear() {},
  });

  fill(S.interact, 'interact', { verb: { kind: null, labelKey: null, at: null, progress: 0 }, held: false, suspend() {}, resume() {} });
  fill(S.firasa, 'firasa', { setRange() {}, setAllowed() {} });
  fill(S.steady, 'steady', {
    tense() {}, brace: ok(true), progress: 0, activeRequest: null,
    walk: () => ({ done: Promise.resolve(true), shot() {} }),
  });
  fill(S.survival, 'survival', { rate() {}, set() {}, drink: ok(true) });
  fill(S.objectives, 'objectives', { poke() {}, mark: handle(), done() {}, clear() {} });
  fill(S.tracks, 'tracks', { add: () => ({ reveal() {}, hide() {}, progressOf: () => 0, distanceTo: () => 0, end: { x: 0, z: 0 }, remove() {} }) });
  fill(S.stars, 'stars', { find: ok() });

  const U = G.ui || {};
  fill(U.hud, 'ui.hud', { ripple() {}, glint() {}, toast() {}, prompt() {}, count() {}, show() {} });
  fill(U.dialogue, 'ui.dialogue', { finishTyping() {}, hideChoices() {}, typing: false });
  fill(U.cards, 'ui.cards', { letterbox() {}, setFade() {}, show() {}, hide() {} });
  fill(U.menus, 'ui.menus', { showTitle() {}, showPause() {}, showEnding() {}, hideAll() {} });
  fill(G.audio, 'audio', {
    unlock() {}, setVolumes() {}, suspend() {}, resume() {}, music() {}, sfx() {}, ambience() {}, step() {}, heartbeat() {}, duck() {}, note() {}, ui() {},
    loop: () => ({ setVolume() {}, stop() {} }),
  });
}

/** true when `obj[name]` is absent or only a filled stand-in */
export function isStub(obj, name) {
  if (obj == null || !(name in obj)) return true;
  const v = obj[name];
  return typeof v === 'function' && v._stub === true;
}
