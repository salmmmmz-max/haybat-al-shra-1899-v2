/**
 * firasa.js — الفراسة, the reading sense (ARCHITECTURE §6, DESIGN §4, glue 8).
 *
 * Hold the eye (or toggle it: `settings.firasaToggle`) to scan. Only in mode `play`, only while allowed.
 *   firasa.active     the eye is open right now (button held / toggled on)
 *   firasa.amount     0..1 — how strongly clues are lit: rises in 0.25 s, and after release holds through the
 *                     6 s AFTERGLOW (full for 4 s, linear fade over the last 2 s). Re-opening the eye resumes from there.
 *   firasa.setAllowed(b) · firasa.setRange(m = 45)       both persist until the level unloads
 *   const c = firasa.addClue({ id, at, type: 'track'|'sign'|'creature'|'star', radius = 45, onSeen })  →  { remove(), seen }
 *     at      Object3D | {x,z} | {x,y,z} | fn; for `type: 'star'` a star id (string)
 *     seen    onSeen(clue) fires ONCE when the view centre stays within 12° of the clue for 0.4 s while amount > 0.5 and
 *             the clue is within min(radius, range) of the hero (stars ignore range). Under `fastText` no aiming is needed.
 *     ping    an unseen clue that is in range but off-screen while amount > 0.5 gives ONE 'firasa:ping' { bearing, id, type }
 *             (compass bearing from the hero; re-armed when the clue leaves range; ≥ 0.8 s between pings; one per `group`).
 *   A clue added while a beat scope is current dies with the beat.
 *
 * Side effects (glue 8), every tick:
 *   - G.shade.uFirasa.value = max(focus, 0.3 · amount)      (see `focus` below)
 *   - G.world.decals.setFirasa(amount)
 *   - player.limit('firasa', { speedMul: 0.6, run: false }) while `active` (not during the afterglow); state-driven, so it is
 *     re-applied after the director's beat teardown clears the limits.
 *   - every non-track, non-star clue owns a gold `props.glow`: level = amount · range fade · 1 Hz pulse (a seen clue stays
 *     at a steady 45 %); an unseen one stays faintly visible within 8 m without the eye.
 *   - star clues: the one nearest the view centre is glowed through `sky.stars.highlight` (unless stars.find is running).
 * Events: 'firasa:on' · 'firasa:off' · 'firasa:seen' { id, type } · 'firasa:ping' { bearing, id, type }.
 *
 * Extras beyond the contract:
 *   - `firasa.focus` 0..1: the eye-open level WITHOUT the afterglow (in 0.25 s, out 0.35 s) — the UI vignette should use it.
 *     Decision: the world desaturation follows `focus` and keeps only a 30 % residue during the afterglow, so the desert
 *     gets its colour back on release while the clues stay lit.
 *   - `firasa.range`, `firasa.allowed`, `firasa.afterglow` (seconds of afterglow left), `firasa.clues` (read-only, bot/overlay).
 *   - clue options `height` (m above the anchor, default 0.3 for ground points), `group` (ping once per group), `ping: false`,
 *     `color`, `size` (passed to props.glow).
 *   - pure helpers `afterglowLevel(t)` and `stepFirasaLevel(state, active, dt, quench)` for the unit tests.
 */
import * as THREE from 'three';
import { DEG, TAU, clamp01, bearingDeg, yawOf } from '../core/math.js';
import { resolvePoint, isBeatScope } from './interact.js';

export const RANGE = 45;
export const AFTERGLOW = 6;
export const AFTERGLOW_FADE = 2;
export const EASE_IN = 0.25;
export const EASE_OUT = 0.35;
export const SEE_CONE = 12 * DEG;
export const SEE_DWELL = 0.4;
export const FAINT_RADIUS = 8;
const PING_GAP = 0.8;
const GOLD = 0xffc64a;
const LIMIT = Object.freeze({ speedMul: 0.6, run: false });
const COS_CONE = Math.cos(SEE_CONE);

/** Pure: afterglow level `t` seconds after the eye closed — 1 for 4 s, then a linear fade to 0 at 6 s. */
export function afterglowLevel(t) {
  if (t <= AFTERGLOW - AFTERGLOW_FADE) return 1;
  if (t >= AFTERGLOW) return 0;
  return (AFTERGLOW - t) / AFTERGLOW_FADE;
}

/** @returns {{focus:number, amount:number, since:number, peak:number}} */
export function makeFirasaLevel() { return { focus: 0, amount: 0, since: AFTERGLOW, peak: 0 }; }

/**
 * Pure: advance the two levels. `quench` (not allowed / not in play) drops everything in EASE_OUT with no afterglow.
 * @param {{focus:number, amount:number, since:number, peak:number}} s
 */
export function stepFirasaLevel(s, active, dt, quench = false) {
  if (active) {
    s.focus = Math.min(1, s.focus + dt / EASE_IN);
    s.amount = Math.min(1, s.amount + dt / EASE_IN);
    s.since = 0; s.peak = s.amount;
  } else {
    s.focus = Math.max(0, s.focus - dt / EASE_OUT);
    if (quench) { s.since = AFTERGLOW; s.peak = 0; s.amount = Math.max(0, s.amount - dt / EASE_OUT); }
    else if (s.since < AFTERGLOW) { s.since = Math.min(AFTERGLOW, s.since + dt); s.amount = s.peak * afterglowLevel(s.since); }
    else s.amount = 0;
  }
  return s;
}

const _fwd = new THREE.Vector3(), _d = new THREE.Vector3();
const _pt = { x: 0, y: 0, z: 0 };

export function createFirasa(G) {
  /** @type {any[]} */
  const clues = [];
  /** @type {any[]} */
  const fired = [];
  const lvl = makeFirasaLevel();
  const evSeen = { id: null, type: null }, evPing = { bearing: 0, id: null, type: null };
  let allowed = true, active = false, toggled = false, range = RANGE;
  let limit = null, pingWait = 0, starLit = false;

  function removeClue(c) {
    if (!c.alive) return;
    c.alive = false;
    const i = clues.indexOf(c); if (i >= 0) clues.splice(i, 1);
    if (c.glow) { try { c.glow.remove(); } catch (e) { console.error(e); } c.glow = null; }
  }

  const F = {
    get active() { return active; },
    get amount() { return lvl.amount; },
    get focus() { return lvl.focus; },
    get afterglow() { return active ? AFTERGLOW : AFTERGLOW - lvl.since; },
    get allowed() { return allowed; },
    get range() { return range; },
    get clues() { return clues; },

    setAllowed(b) { allowed = !!b; if (!allowed) toggled = false; },
    setRange(m) { range = m > 0 ? m : RANGE; },

    /** @param {{id?:string, at:any, type?:string, radius?:number, onSeen?:Function, height?:number, group?:string, ping?:boolean, color?:number, size?:number}} o */
    addClue(o) {
      const type = o.type || 'sign';
      const c = {
        id: o.id, type, at: o.at, radius: o.radius > 0 ? o.radius : RANGE, onSeen: o.onSeen || null,
        group: o.group || null, ping: o.ping !== false, star: null, fixed: false, lift: 0,
        x: 0, y: 0, z: 0, seen: false, look: 0, inRange: false, pinged: false, glow: null, level: -1, alive: true, beat: false,
      };
      if (type === 'star') c.star = typeof o.at === 'string' ? o.at : (o.at && o.at.star) || o.id;
      else {
        const dyn = typeof o.at === 'function' || (o.at && o.at.isObject3D);
        c.lift = typeof o.height === 'number' ? o.height : (dyn || (o.at && typeof o.at.y === 'number') ? 0 : (type === 'track' ? 0.05 : 0.3));
        if (!dyn) { c.fixed = true; if (resolvePoint(G, o.at, _pt, c.lift)) { c.x = _pt.x; c.y = _pt.y; c.z = _pt.z; } }
        if (type !== 'track') {
          const size = o.size || (type === 'creature' ? 2.2 : 1.4);
          try { c.glow = G.world.props.glow(o.at && o.at.isObject3D ? o.at : { x: c.x, y: c.y, z: c.z }, { color: o.color || GOLD, size }); } catch (e) { console.error('[firasa] glow failed', e); }
          if (c.glow && c.glow.set) c.glow.set(0);
        }
      }
      clues.push(c);
      const h = { clue: c, get seen() { return c.seen; }, remove() { removeClue(c); } };
      const sc = G.scope;
      if (isBeatScope(G, sc)) { c.beat = true; sc.own(h); }
      return h;
    },

    clear() { for (let i = clues.length - 1; i >= 0; i--) removeClue(clues[i]); },
    onBeatEnd() {
      for (let i = clues.length - 1; i >= 0; i--) if (clues[i].beat) removeClue(clues[i]);
      if (limit) { limit.remove(); limit = null; }           // the director clears beat limits next; update() re-applies
    },
    onLevelUnload() {
      F.clear(); toggled = false; allowed = true; range = RANGE; pingWait = 0;
      if (active) { active = false; G.events.emit('firasa:off'); }
      if (limit) { limit.remove(); limit = null; }
      lvl.focus = lvl.amount = lvl.peak = 0; lvl.since = AFTERGLOW;
      G.shade.uFirasa.value = 0; G.world.decals.setFirasa(0);
    },

    update(dt) {
      const input = G.input, play = G.state.mode === 'play';
      // ---- the verb
      if (!play || !allowed) toggled = false;
      else if (G.save.settings.firasaToggle) { if (input.pressed('firasa')) toggled = !toggled; }
      else toggled = input.held('firasa');
      if (toggled !== active) { active = toggled; G.events.emit(active ? 'firasa:on' : 'firasa:off'); }
      stepFirasaLevel(lvl, active, dt, !play || !allowed);
      const amount = lvl.amount;

      // ---- side effects
      G.shade.uFirasa.value = Math.max(lvl.focus, 0.3 * amount);
      G.world.decals.setFirasa(amount);
      const pl = G.actors.player;
      if (active && !limit) limit = pl.limit('firasa', LIMIT);
      else if (!active && limit) { limit.remove(); limit = null; }

      // ---- clues
      const n = clues.length;
      if (n === 0) { if (starLit) { starLit = false; G.world.sky.stars.highlight(null, 0); } return; }
      if (pingWait > 0) pingWait -= dt;
      const cam = G.camera; cam.getWorldDirection(_fwd);
      const me = cam.matrixWorld.elements, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      const tanV = Math.tan(cam.fov * 0.5 * DEG), tanH = tanV * cam.aspect;
      const fast = !!G.state.fastText, lit = amount > 0.5;
      const pulse = 0.72 + 0.28 * Math.sin(TAU * G.time.now);
      const px = pl.pos.x, pz = pl.pos.z;
      let star = null, starCos = -2;
      for (let i = 0; i < n; i++) {
        const c = clues[i];
        let cos, inRange, dist = 0, r = 0;
        if (c.star) {
          G.world.sky.stars.dir(c.star, _d);
          cos = _fwd.x * _d.x + _fwd.y * _d.y + _fwd.z * _d.z; inRange = _d.y > -0.02;
          if (cos > starCos) { starCos = cos; star = c; }
        } else {
          if (!c.fixed) { if (!resolvePoint(G, c.at, _pt, c.lift)) continue; c.x = _pt.x; c.y = _pt.y; c.z = _pt.z; }
          const dx = c.x - px, dz = c.z - pz; dist = Math.sqrt(dx * dx + dz * dz);
          r = Math.min(c.radius, range); inRange = dist <= r;
          const vx = c.x - cx, vy = c.y - cy, vz = c.z - cz, vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
          cos = (vx * _fwd.x + vy * _fwd.y + vz * _fwd.z) / vl;
          _d.set(vx, vy, vz);
        }
        if (inRange !== c.inRange) { c.inRange = inRange; if (!inRange) c.pinged = false; }
        if (c.glow) {
          let a = inRange ? amount * clamp01((r - dist) / (0.15 * r)) * (c.seen ? 0.45 : pulse) : 0;
          if (!c.seen && dist < FAINT_RADIUS) { const f = 0.18 * (1 - dist / FAINT_RADIUS); if (f > a) a = f; }
          if (Math.abs(a - c.level) > 0.008) { c.level = a; c.glow.set(a); }
        }
        if (c.seen) continue;
        if (!inRange || !lit) { c.look = 0; continue; }
        if (fast || cos >= COS_CONE) {
          c.look += dt;
          if (c.look >= (fast ? 0.05 : SEE_DWELL)) { c.seen = true; fired.push(c); }
        } else {
          c.look = 0;
          if (c.ping && !c.pinged && pingWait <= 0) {
            // off-screen test in view space (camera looks along −Z of its matrix)
            const vz = -(_d.x * me[8] + _d.y * me[9] + _d.z * me[10]);
            let off = vz <= 0.01;
            if (!off) {
              const sx = (_d.x * me[0] + _d.y * me[1] + _d.z * me[2]) / (vz * tanH), sy = (_d.x * me[4] + _d.y * me[5] + _d.z * me[6]) / (vz * tanV);
              off = sx < -1 || sx > 1 || sy < -1 || sy > 1;
            }
            c.pinged = true;                              // on-screen clues never ping for this visit
            if (c.group) for (let k = 0; k < n; k++) if (clues[k].group === c.group) clues[k].pinged = true;
            if (off) {
              pingWait = PING_GAP;
              evPing.bearing = c.star ? bearingDeg(yawOf(_d.x, _d.z)) : bearingDeg(yawOf(c.x - px, c.z - pz));
              evPing.id = c.id; evPing.type = c.type;
              G.events.emit('firasa:ping', evPing);
            }
          }
        }
      }
      // star clues glow through the sky (never while stars.find owns the highlight)
      const finding = G.sys.stars && G.sys.stars.active;
      if (star && amount > 0.02 && !finding) { starLit = true; G.world.sky.stars.highlight(star.star, amount * (star.seen ? 0.5 : 0.85)); }
      else if (starLit) { starLit = false; if (!finding) G.world.sky.stars.highlight(null, 0); }
      // callbacks after the loop: they may add / remove clues
      if (fired.length) {
        for (let i = 0; i < fired.length; i++) {
          const c = fired[i];
          evSeen.id = c.id; evSeen.type = c.type;
          G.events.emit('firasa:seen', evSeen);
          if (c.onSeen) { try { c.onSeen(c); } catch (e) { console.error('[firasa] onSeen failed', c.id, e); } }
        }
        fired.length = 0;
      }
    },
  };
  G.events.on('beat:reset', () => { toggled = false; lvl.focus = lvl.amount = lvl.peak = 0; lvl.since = AFTERGLOW; });
  return F;
}
