/**
 * Small helpers shared by the chapter scripts (keep chapters short and uniform). Everything here is beat-safe:
 * promises come from the `d` API (abort-safe), handles are owned by the beat.
 */
import { yawOf, pointOf } from '../core/math.js';

/** poi + offset → {x, z} */
export const at = (L, name, dx = 0, dz = 0) => { const p = L.poi(name); return { x: p.x + dx, z: p.z + dz }; };
/** yaw that makes something at `a` face `b` */
export const yawTo = (a, b) => { const p = pointOf(a), ax = p.x, az = p.z, q = pointOf(b); return yawOf(q.x - ax, q.z - az); };
/** spawn (idempotent) or re-place a named character; returns the npc */
export function cast(G, id, model, p, yaw = 0, opts = {}) {
  const n = G.actors.npcs.spawn(id, model, { x: p.x, z: p.z, yaw, ...opts });
  n.stop(); n.place(p.x, p.z, yaw); if (opts.clip) n.play(opts.clip); else n.play('idle');
  return n;
}
/** spawn (idempotent) or re-place a camel */
export function camel(G, id, p, yaw = 0, opts = {}) {
  const c = G.actors.camels.spawn(id, { x: p.x, z: p.z, yaw, ...opts });
  if (c.stop) c.stop(); if (!c.ridden) c.place(p.x, p.z, yaw);
  return c;
}
/** non-blocking line from a text key */
export const toast = (G, key, seconds = 3.6) => G.ui.hud.toast(G.t(key), seconds);
/** tutorial prompt (keyboard wording when there is one); prompt(G, null) hides it */
export function prompt(G, key) { G.ui.hud.prompt(key && G.input.device !== 'touch' && G.story.text[key + '.kb'] ? key + '.kb' : key); }
/** progressive HUD: call at every beat start */
export const hud = (G, o) => G.ui.hud.show({ eye: false, water: false, strip: false, ...o });
/** objective with its two hints derived from the key (`x.obj` → `x.hint1`, `x.hint2`) */
export function goal(d, key, opts = {}) { const b = key.replace(/\.obj$/, ''); d.objective(key, { hints: [b + '.hint1', b + '.hint2'], ...opts }); }
/** set an objective, wait until the player is within r of the target, mark it done */
export async function reach(d, key, target, r = 3, opts = {}) { goal(d, key, { at: target, ...opts }); await d.near(target, r); d.objectiveDone(); }
/** add a context interaction and wait until it is used (owned by the beat) */
export function use(G, d, o) {
  return new Promise(resolve => { const h = G.sys.interact.add({ once: true, ...o, onUse: () => { resolve(); if (o.onUse) o.onUse(); } }); d.own(h); }).then(v => d.wrap(Promise.resolve(v)));
}
/**
 * الثبات with the fail-soft ladder: each failure shortens the hold by 1 s (never below `floor`), shows fail text, the third
 * failure auto-steadies. `opts` = steady.hold options; `onFail(n)` may play a reaction. Returns the number of failures.
 */
export async function steadyLadder(G, d, tag, opts, { floor = 3, failKeys = [], onFail } = {}) {
  const S = G.sys.steady;
  for (;;) {
    const fails = S.fails ? S.fails(tag) : 0;
    if (fails >= 3) return fails;                                  // auto-steady: the scene goes on
    const ok = await S.hold({ ...opts, seconds: Math.max(floor, opts.seconds - fails) });
    if (ok) return fails;
    if (S.fail) S.fail(tag);
    if (onFail) await onFail(fails + 1);
    if (failKeys[fails]) toast(G, failKeys[fails], 3.2);
    await d.wait(1.2);
  }
}
/** play looping music for the chapter (safe before audio unlock) */
export const music = (G, id, fade = 2.5) => G.audio.music(id, { fade });
/** a dramatic pause that tests skip (fastText) */
export const pause = (G, d, s) => d.wait(G.state.fastText ? Math.min(s, 0.05) : s);
