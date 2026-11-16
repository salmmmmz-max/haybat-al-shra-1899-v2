/**
 * Distance LOD service. Wrappers register an item and get told when to switch geometry.
 *   const h = G.lod.add({ at: Object3D | {x,z}, near: 18, set(level) { mesh.geometry = level ? lod1 : lod0; }, pinned: false });
 *   h.pin(true)  → always level 0 (player, current interaction target)      h.remove()
 * Round-robin (16 items per tick), ±15 % hysteresis. Level 0 = full detail, 1 = reduced.
 */
import { pointOf, dist2 } from './math.js';

export function createLod(G) {
  const items = []; let cursor = 0;
  // phones switch to the reduced meshes sooner (the triangle budget is the first thing a mid-range GPU feels)
  let scale = G.quality ? G.quality.pick(0.5, 0.7, 1) : 1;
  G.events.on('quality:changed', () => { scale = G.quality.pick(0.5, 0.7, 1); });
  function apply(it) {
    const c = G.camera.position; const p = pointOf(it.at);
    const d2 = dist2(c.x, c.z, p.x, p.z); const n = it.near * scale;
    let lvl = it.level;
    if (it.pinned) lvl = 0;
    else if (lvl < 0) lvl = d2 > n * n ? 1 : 0;
    else if (lvl === 0 && d2 > n * n * 1.3225) lvl = 1;
    else if (lvl === 1 && d2 < n * n * 0.7225) lvl = 0;
    if (lvl !== it.level) { it.level = lvl; try { it.set(lvl); } catch (e) { console.error('[lod] set failed', e); } }
  }
  return {
    add(o) {
      const it = { at: o.at, near: o.near || 18, set: o.set, pinned: !!o.pinned, level: -1 };
      items.push(it); apply(it);
      return {
        remove() { const i = items.indexOf(it); if (i >= 0) items.splice(i, 1); },
        pin(b) { it.pinned = !!b; apply(it); },
        get level() { return it.level; },
      };
    },
    get count() { return items.length; },
    update() {
      const n = Math.min(16, items.length);
      for (let k = 0; k < n; k++) { cursor = (cursor + 1) % items.length; apply(items[cursor]); }
    },
  };
}
