/**
 * Level loader — builds a chapter's world from a LevelDef and tears it down again.
 *
 * LevelDef = {
 *   id, seed,
 *   terrain: { duneAmp, duneScale, windDeg, flats:[{x,z,r,fall,y?}], soft:[{x,z,r}], gravel:[{x,z,r}], ridges?:[…] },
 *   sky: 'dawn' | …,  lst?: hours (star time),
 *   wind: { deg, strength },  dust?: 0..1,
 *   pois: { name: {x, z} },
 *   props: [{ model, at?: poiName, x?, z?, dx?, dz?, yaw?, scale?, solid? }],
 *   scatter: [{ kind, count, at?: poiName, x?, z?, r, seed?, avoid?: [poiName | {x,z,r}] }],
 *   fires?: [{ at?: poiName, x?, z?, dx?, dz?, size?, lit? , id? }],
 *   spawn: { at?: poiName, x?, z?, yaw },
 *   bounds: { x, z, r },
 * }
 * L (returned by load) = { def, poi(name) → {x,z}, bounds, fires: {id: fireHandle}, own(handle), scope }
 */
import { createScope } from '../core/scope.js';
import { makeRng } from '../core/rng.js';

export function createLevel(G) {
  /** @type {any} */
  let L = null;

  function resolve(def, o) {
    const base = o.at ? def.pois[o.at] : null;
    if (o.at && !base) console.warn('[level] unknown poi', o.at);
    return { x: (base ? base.x : (o.x || 0)) + (o.dx || 0), z: (base ? base.z : (o.z || 0)) + (o.dz || 0) };
  }

  /** @param {any} def LevelDef */
  async function load(def) {
    unload();
    const scope = createScope('level:' + def.id);
    G.levelScope = scope;
    G.rng = makeRng(def.seed || def.id);
    const W = G.world;
    W.terrain.build({ seed: def.seed || 1, ...(def.terrain || {}) });
    W.sky.setPreset(def.sky || 'morning', { duration: 0 });
    if (def.lst !== undefined && W.sky.stars) W.sky.stars.setLST(def.lst, { duration: 0 });
    const wind = def.wind || { deg: 250, strength: 0.25 };
    W.weather.setWind(wind.deg, wind.strength);
    W.weather.setDust(def.dust || 0, { duration: 0 });
    W.weather.storm(0, { duration: 0 }); W.weather.rain(0, { duration: 0 });

    const fires = {};
    for (const p of def.props || []) {
      const at = resolve(def, p);
      W.props.spawn(p.model, { x: at.x, z: at.z, yaw: p.yaw || 0, scale: p.scale || 1, solid: p.solid });
    }
    for (const f of def.fires || []) {
      const at = resolve(def, f);
      const h = W.props.fire(at.x, at.z, { size: f.size || 1 });
      h.setLit(f.lit !== false);
      fires[f.id || f.at || `fire${Object.keys(fires).length}`] = h;
    }
    for (const s of def.scatter || []) {
      const at = resolve(def, s);
      const avoid = (s.avoid || []).map(a => (typeof a === 'string' ? { ...def.pois[a], r: 14 } : a)).filter(Boolean);
      W.props.scatter(s.kind, { count: s.count, x: at.x, z: at.z, r: s.r, seed: s.seed || def.seed || 1, avoid });
    }
    const sp = def.spawn || { x: 0, z: 0, yaw: 0 };
    const spAt = resolve(def, sp);
    G.actors.player.spawn(spAt.x, spAt.z, sp.yaw || 0);
    G.actors.cam.follow(G.actors.player);

    L = {
      def, scope, fires,
      bounds: def.bounds || { x: 0, z: 0, r: 420 },
      /** named point of interest → {x, z} (returns a fresh object) */
      poi(name) { const p = def.pois && def.pois[name]; if (!p) { console.warn('[level] unknown poi', name); return { x: 0, z: 0 }; } return { x: p.x, z: p.z }; },
      /** own a handle for the level's lifetime */
      own: h => scope.own(h),
    };
    G.events.emit('level:loaded', { L });
    return L;
  }

  function unload() {
    if (!L) return;
    G.events.emit('level:unload', { L });
    L.scope.end();
    const call = m => { if (m && m.onLevelUnload) { try { m.onLevelUnload(); } catch (e) { console.error(e); } } };
    const { world: W, actors: A, sys: S } = G;
    [A.wolves, A.caravan, A.npcs, A.camels, A.player, S.tracks, S.stars, S.objectives, S.steady, S.firasa, S.interact, S.survival,
      W.props, W.decals, W.weather].forEach(call);
    G.levelScope = G.rootScope;
    L = null;
  }

  return { load, unload, get current() { return L; } };
}
