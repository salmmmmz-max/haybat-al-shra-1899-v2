/**
 * Scopes — sim-time awaitables with uniform cancellation.
 *
 * Every gameplay promise (waits, tweens, "until" conditions, one-shot animations, cinematics) must be created
 * through the CURRENT scope `G.scope`, so that when the director cancels a beat (restart, quit, chapter jump)
 * all of them reject with `BeatAbort` and their cleanups run. Scopes advance only while the game is not paused.
 *
 *   await G.scope.sleep(1.5);
 *   const ok = await G.scope.until(() => near(a, b), { timeout: 20 });
 *   await G.scope.task(dt => { t += dt; obj.position.y = t; if (t > 1) return true; });   // resolve by returning non-undefined
 *   await G.scope.tween(0.6, k => { el.opacity = k; });                                     // k: 0..1 (eased)
 *   G.scope.onEnd(() => thing.remove());   G.scope.own(handle);                             // cleanup at end/abort
 */
import { easeInOut } from './math.js';

export class BeatAbort extends Error {
  constructor(msg = 'beat aborted') { super(msg); this.name = 'BeatAbort'; }
}

/** @param {string} label */
export function createScope(label = 'scope') {
  let closed = false; let aborted = false;
  /** @type {Set<{tick:(dt:number)=>boolean, reject:(e:any)=>void}>} */
  const waiters = new Set();
  /** @type {Function[]} */
  const cleanups = [];
  /** @type {Set<any>} child scopes (updated and closed with this one) */
  const children = new Set();
  const noop = () => {};

  function assertOpen() { if (closed) throw new BeatAbort(`scope "${label}" is closed`); }

  /**
   * Low-level: `tickFn(dt)` is called every tick; return anything other than `undefined` to resolve with it.
   * @template T @param {(dt:number)=>T|undefined} tickFn @returns {Promise<T>}
   */
  function task(tickFn) {
    if (closed) { const r = Promise.reject(new BeatAbort(`scope "${label}" is closed`)); r.catch(noop); r.cancel = noop; return r; }
    let w;
    const p = new Promise((resolve, reject) => {
      w = {
        tick(dt) {
          let r;
          try { r = tickFn(dt); } catch (e) { reject(e); return true; }
          if (r !== undefined) { resolve(r); return true; }
          return false;
        },
        reject,
      };
      waiters.add(w);
    });
    /** stop waiting now: the promise rejects with BeatAbort */
    p.cancel = () => { if (waiters.delete(w)) w.reject(new BeatAbort('cancelled')); };
    p.catch(noop);   // an un-awaited cancelled/aborted task must not raise unhandledrejection
    return p;
  }

  const scope = {
    label,
    get aborted() { return aborted; },
    get closed() { return closed; },
    /** number of pending awaitables (debug) */
    get pending() { return waiters.size; },

    /** Called once per tick by the loop (sim time only). */
    update(dt) {
      if (closed || (waiters.size === 0 && children.size === 0)) return;
      for (const w of waiters) { if (w.tick(dt)) waiters.delete(w); }
      if (children.size) for (const c of children) c.update(dt);
    },

    task,
    /** Resolve after `seconds` of sim time. */
    sleep(seconds) { let t = 0; return task(dt => { t += dt; return t >= seconds ? true : undefined; }); },
    /** Resolve `true` when fn() is truthy, or `false` after `timeout` seconds (if given). */
    until(fn, { timeout = Infinity } = {}) {
      let t = 0;
      return task(dt => { if (fn()) return true; t += dt; return t >= timeout ? false : undefined; });
    },
    /** Call fn(k) every tick with k eased 0→1 over `seconds`. */
    tween(seconds, fn, ease = easeInOut) {
      let t = 0;
      return task(dt => { t += dt; const k = seconds <= 0 ? 1 : Math.min(1, t / seconds); fn(ease(k), k); return k >= 1 ? true : undefined; });
    },
    /** Make a foreign promise (e.g. a UI promise) reject with BeatAbort when this scope is aborted. */
    wrap(promise) {
      if (closed) { const r = Promise.reject(new BeatAbort()); r.catch(noop); r.cancel = noop; return r; }
      let w;
      const p = new Promise((resolve, reject) => {
        w = { tick: () => false, reject };
        waiters.add(w);
        Promise.resolve(promise).then(v => { if (waiters.delete(w)) resolve(v); }, e => { if (waiters.delete(w)) reject(e); });
      });
      p.cancel = () => { if (waiters.delete(w)) w.reject(new BeatAbort('cancelled')); };
      p.catch(noop);
      return p;
    },
    /** A child scope: ticks with this scope and is closed when this scope closes (or earlier, on its own). */
    child(childLabel = 'child') {
      const c = createScope(`${label}/${childLabel}`);
      if (closed) { c.abort(); return c; }
      children.add(c); c.onEnd(() => children.delete(c));
      return c;
    },
    /** Register a cleanup; runs (LIFO) when the scope ends or is aborted. Runs immediately if already closed. */
    onEnd(fn) { if (closed) { try { fn(); } catch (e) { console.error(e); } } else cleanups.push(fn); return fn; },
    /** Own a handle: its remove()/dispose()/stop() (or the function itself) is called at end/abort. Returns the handle. */
    own(handle) {
      if (!handle) return handle;
      scope.onEnd(() => {
        if (typeof handle === 'function') handle();
        else if (handle.remove) handle.remove();
        else if (handle.dispose) handle.dispose();
        else if (handle.stop) handle.stop();
      });
      return handle;
    },
    assertOpen,
    /** Normal completion: pending awaitables are rejected (nobody should be waiting), cleanups run. */
    end() { close(false); },
    /** Cancellation: every pending awaitable rejects with BeatAbort, cleanups run. */
    abort() { close(true); },
  };

  function close(isAbort) {
    if (closed) return;
    closed = true; aborted = isAbort;
    const err = new BeatAbort(`scope "${label}" ${isAbort ? 'aborted' : 'ended'}`);
    for (const c of Array.from(children)) { if (isAbort) c.abort(); else c.end(); }
    children.clear();
    for (const w of waiters) w.reject(err);
    waiters.clear();
    for (let i = cleanups.length - 1; i >= 0; i--) { try { cleanups[i](); } catch (e) { console.error('[scope] cleanup failed', e); } }
    cleanups.length = 0;
  }
  return scope;
}
