/** Tiny event bus. Safe to add/remove listeners while emitting; no allocation per emit. */
export function createEvents() {
  /** @type {Map<string, Array<Function|null>>} */
  const map = new Map();
  let depth = 0; let dirty = false;

  function on(name, fn) {
    let list = map.get(name);
    if (!list) { list = []; map.set(name, list); }
    list.push(fn);
    return () => off(name, fn);
  }
  function once(name, fn) {
    const offFn = on(name, payload => { offFn(); fn(payload); });
    return offFn;
  }
  function off(name, fn) {
    const list = map.get(name); if (!list) return;
    const i = list.indexOf(fn); if (i < 0) return;
    if (depth > 0) { list[i] = null; dirty = true; } else list.splice(i, 1);
  }
  function emit(name, payload) {
    const list = map.get(name); if (!list) return;
    depth++;
    const n = list.length; // listeners added during emit are not called this round
    for (let i = 0; i < n; i++) {
      const fn = list[i];
      if (fn) { try { fn(payload); } catch (e) { console.error(`[events] listener for "${name}" threw`, e); } }
    }
    depth--;
    if (depth === 0 && dirty) {
      dirty = false;
      for (const l of map.values()) { for (let i = l.length - 1; i >= 0; i--) if (l[i] === null) l.splice(i, 1); }
    }
  }
  return { on, once, off, emit };
}
