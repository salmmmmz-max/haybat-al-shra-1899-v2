/**
 * interact.js — the context button (ARCHITECTURE §6, glue 3). The ONLY reader of the `interact` action.
 *
 * Every tick ONE verb is resolved, by priority:
 *   1 `steady`  a steady request is open (`G.sys.steady.activeRequest`) — the button belongs to الثبات;
 *   2 `swing`   `player.item === 'torch'` and `wolves.threat` — a press calls `player.swing()`;
 *   3 `use`     the best enabled entry in range (2.4 m on foot; mounted: only `mountedOk` entries, range
 *               max(3.5, radius + 1.1)). Between two candidates closer than ~1.2 m apart in distance the one the
 *               camera looks toward wins; the current entry keeps a small hysteresis so the label never flickers.
 * Nothing is usable outside mode `play`, while suspended (`suspend(tag)`; a steady request is never suspended), or while
 * the player is `scripted`.
 *
 *   const h = interact.add({ id, at, radius = 2.4, label, enabled = true, onUse, mountedOk = false, once = false, hold = 0 })
 *   h.remove() · h.setEnabled(b) · h.setLabel(key)
 *     at        Object3D (world position) | {x,z} | {x,y,z} | () => one of those
 *     hold > 0  seconds the button must stay down: `verb.progress` fills while held, drains at 2× when released,
 *               `onUse` fires once at 100 % (the press must START while this entry is the verb; after firing the button
 *               must be released before anything else can be used). hold = 0: `onUse` fires on the press.
 *     once      the entry removes itself after its first use.
 *   An entry added while a beat scope is current is owned by that scope (dies with the beat); `onBeatEnd()` /
 *   `onLevelUnload()` sweep whatever is left. Adding an id that already exists replaces the older entry.
 *
 *   interact.verb     ONE reused object { kind: 'steady'|'swing'|'use'|null, labelKey, at: {x,y,z}|null, progress 0..1 }
 *   interact.current  the entry behind a `use` verb ({ id, label, … }) or null
 *   interact.held     the button state in mode `play` (steady.js reads this, never G.input)
 *   interact.suspend(tag) / resume(tag)       tags are released at beat end
 * Events: 'interact:verb' { kind, labelKey } when the verb changes · 'interact:use' { id } when an entry fires.
 *
 * Extras beyond the contract:
 *   - entry option `height` (m): marker height above the anchor for `verb.at` (default 1.1; 0 for a literal {x,y,z}).
 *   - `interact.pressed` (bool, this tick) · `interact.entries` (read-only list, for the bot/overlay) · `interact.clear()`.
 *   - swing label key: 'verb.swing' (SWING_LABEL); `verb.at` then points at `wolves.next` when there is one.
 *   - exported helpers shared by the other systems: `resolvePoint`, `aimAngle`, `camForward`, `toRad`, `isBeatScope`.
 */
import * as THREE from 'three';
import { DEG, clamp } from '../core/math.js';

export const SWING_LABEL = 'verb.swing';
export const RADIUS_FOOT = 2.4;
export const RADIUS_MOUNTED = 3.5;

const _v = new THREE.Vector3(), _f = new THREE.Vector3();
const _pt = { x: 0, y: 0, z: 0 };

/** Angles in options are radians; anything above 1.6 can only be degrees (35 → 35°). */
export const toRad = v => (v > 1.6 ? v * DEG : v);

/** true when `scope` is a beat (or beat-child) scope, i.e. not the root / level scope */
export function isBeatScope(G, scope) {
  return !!scope && scope !== G.rootScope && scope !== G.levelScope && !scope.closed;
}

/**
 * Resolve a target to a world point. Object3D → world position; {x,z} → on the terrain; {x,y,z} → literal.
 * `lift` is added to Object3D / terrain anchors only. Returns `out`, or null when there is no target.
 * @param {any} G @param {any} target Object3D | {x,z} | {x,y,z} | fn @param {{x:number,y:number,z:number}} out
 */
export function resolvePoint(G, target, out, lift = 0) {
  let t = typeof target === 'function' ? target() : target;
  if (!t) return null;
  if (t.isObject3D) {
    if (!t.parent || t.parent.isScene) { out.x = t.position.x; out.y = t.position.y + lift; out.z = t.position.z; }
    else { t.getWorldPosition(_v); out.x = _v.x; out.y = _v.y + lift; out.z = _v.z; }
    return out;
  }
  out.x = t.x || 0; out.z = t.z || 0;
  out.y = typeof t.y === 'number' ? t.y + (t.isVector3 ? lift : 0) : G.world.terrain.heightAt(out.x, out.z) + lift;
  return out;
}

/** Unit view direction of the game camera (world). */
export function camForward(G, out) { return G.camera.getWorldDirection(out); }

/** Angle (rad) between the view axis and a world point {x,y,z}. */
export function aimAngle(G, p) {
  const c = G.camera; c.getWorldDirection(_f);
  const dx = p.x - c.position.x, dy = p.y - c.position.y, dz = p.z - c.position.z;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (l < 1e-4) return 0;
  return Math.acos(clamp((dx * _f.x + dy * _f.y + dz * _f.z) / l, -1, 1));
}

/**
 * Pure: advance a hold-to-use ring. Fills at 1/seconds while `filling`, drains at 2/seconds otherwise.
 * @returns {number} the new progress 0..1
 */
export function stepHoldRing(p, filling, seconds, dt) {
  if (seconds <= 0) return filling ? 1 : 0;
  p += (filling ? dt : -2 * dt) / seconds;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * Pure: candidate score for the `use` verb — lower wins. `facing` = cos of the angle between the camera heading and
 * the direction to the entry (XZ).
 */
export function useScore(distance, facing, isCurrent) { return distance - 0.6 * facing - (isCurrent ? 0.3 : 0); }

export function createInteract(G) {
  /** @type {any[]} */
  const entries = [];
  const suspended = new Set();
  const verb = { kind: null, labelKey: null, at: null, progress: 0 };
  const at = { x: 0, y: 0, z: 0 };
  const evVerb = { kind: null, labelKey: null }, evUse = { id: null };
  const noop = () => {};
  let current = null, held = false, pressed = false;
  let armed = null;          // hold entry that owns the current press
  let consumed = false;      // the current press already fired something → wait for the release
  let lastKind = null, lastLabel = null, lastEntry = null;

  function removeEntry(e) {
    if (!e.alive) return;
    e.alive = false; e.p = 0;
    const i = entries.indexOf(e); if (i >= 0) entries.splice(i, 1);
    if (current === e) current = null;
    if (armed === e) armed = null;
  }

  function fire(e) {
    evUse.id = e.id;
    G.events.emit('interact:use', evUse);
    if (e.once) removeEntry(e);
    if (e.onUse) { try { e.onUse(e); } catch (err) { console.error('[interact] onUse failed', e.id, err); } }
  }

  /** best `use` candidate for this tick */
  function pick(pl) {
    const p = pl.pos; const mounted = pl.mode === 'mounted';
    const yaw = G.actors.cam.yaw || 0; const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best = null, bestScore = Infinity;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.enabled || (mounted && !e.mountedOk)) continue;
      if (!resolvePoint(G, e.at, _pt, 0)) continue;
      const r = mounted ? Math.max(RADIUS_MOUNTED, e.radius + (RADIUS_MOUNTED - RADIUS_FOOT)) : e.radius;
      const dx = _pt.x - p.x, dz = _pt.z - p.z; const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      const d = Math.sqrt(d2);
      const s = useScore(d, d > 0.05 ? (dx * fx + dz * fz) / d : 1, e === current);
      if (s < bestScore) { bestScore = s; best = e; }
    }
    return best;
  }

  const I = {
    verb,
    get current() { return current; },
    get held() { return held; },
    get pressed() { return pressed; },
    get entries() { return entries; },
    get suspended() { return suspended.size > 0; },

    /** @param {{id?:string, at:any, radius?:number, label?:string, enabled?:boolean, onUse?:Function, mountedOk?:boolean, once?:boolean, hold?:number, height?:number}} o */
    add(o) {
      if (o.id != null) { for (let i = entries.length - 1; i >= 0; i--) if (entries[i].id === o.id) removeEntry(entries[i]); }
      const literal = o.at && typeof o.at === 'object' && !o.at.isObject3D && !o.at.isVector3 && typeof o.at.y === 'number';
      const e = {
        id: o.id, at: o.at, radius: o.radius > 0 ? o.radius : RADIUS_FOOT, label: o.label || null,
        enabled: o.enabled !== false, onUse: o.onUse || null, mountedOk: !!o.mountedOk, once: !!o.once,
        hold: o.hold > 0 ? o.hold : 0, height: typeof o.height === 'number' ? o.height : (literal ? 0 : 1.1),
        p: 0, alive: true, beat: false,
      };
      entries.push(e);
      const h = {
        entry: e,
        remove() { removeEntry(e); },
        setEnabled(b) { e.enabled = !!b; if (!e.enabled) e.p = 0; },
        setLabel(key) { e.label = key; },
      };
      const sc = G.scope;
      if (isBeatScope(G, sc)) { e.beat = true; sc.own(h); }
      return h;
    },

    suspend(tag = 'default') { suspended.add(tag); },
    resume(tag = 'default') { suspended.delete(tag); },
    clear() { for (let i = entries.length - 1; i >= 0; i--) removeEntry(entries[i]); },

    onBeatEnd() {
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].beat) removeEntry(entries[i]);
      suspended.clear(); armed = null;
    },
    onLevelUnload() { I.clear(); suspended.clear(); armed = null; consumed = false; },

    update(dt) {
      const input = G.input, pl = G.actors.player;
      const play = G.state.mode === 'play';
      held = play && input.held('interact');
      pressed = play && input.pressed('interact');
      if (!held) { armed = null; consumed = false; }

      let kind = null, label = null, e = null, progress = 0, hasAt = false;
      const st = G.sys.steady;
      const req = play && st ? st.activeRequest : null;
      if (req) {
        kind = 'steady'; label = req.labelKey || 'steady.hold'; progress = st.progress || 0;
        const t = req.target;
        if (t && typeof t.x === 'number') { at.x = t.x; at.y = t.y || 0; at.z = t.z; hasAt = true; }
        if (pressed) consumed = true;                 // a press that began on الثبات never spills into a `use`
      } else if (play && suspended.size === 0 && pl.mode !== 'scripted') {
        const wolves = G.actors.wolves;
        if (pl.item === 'torch' && wolves && wolves.threat) {
          kind = 'swing'; label = SWING_LABEL;
          const nx = wolves.next;
          if (nx && resolvePoint(G, nx.root || nx.pos || nx, at, 0.6)) hasAt = true;
          if (pressed) { consumed = true; const r = pl.swing(); if (r && r.catch) r.catch(noop); }
        } else {
          e = pick(pl);
          if (e) { kind = 'use'; label = e.label; hasAt = !!resolvePoint(G, e.at, at, e.height); }
        }
      }

      // progress of hold entries: only the current one may fill; every other ring empties
      if (current && current !== e) current.p = 0;
      current = e;
      if (e) {
        if (e.hold > 0) {
          if (pressed && !consumed) armed = e;
          const seconds = G.state.fastText ? Math.min(e.hold, 0.08) : e.hold;
          e.p = stepHoldRing(e.p, held && armed === e && !consumed, seconds, dt);
          progress = e.p;
          if (e.p >= 1) { e.p = 0; consumed = true; armed = null; fire(e); }
        } else if (pressed && !consumed) { consumed = true; fire(e); }
        if (!e.alive) { e = null; current = null; kind = null; label = null; hasAt = false; progress = 0; }   // removed by `once` / its own onUse
      }

      verb.kind = kind; verb.labelKey = label; verb.at = hasAt ? at : null; verb.progress = progress;
      if (kind !== lastKind || label !== lastLabel || current !== lastEntry) {
        lastKind = kind; lastLabel = label; lastEntry = current;
        evVerb.kind = kind; evVerb.labelKey = label;
        G.events.emit('interact:verb', evVerb);
      }
    },
  };
  return I;
}
