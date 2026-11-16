/**
 * Objectives, escalating hints and horizon-strip marks.
 *   set(key, { vars, at, bearingFn, mark = 'hint'|'always'|'never', hints: [k1, k2], hintAfter: [s1, s2], progress: () => number })
 *   poke() · done() · clear() · mark(id, { at | bearingFn, icon, scope = 'beat'|'level' }) → { remove() }
 * State (UI polls): current → null|{key,text} · hint → null|{key,text,level} · marks → stable [{id, icon, bearing, dist}]
 * Hint clocks run only in mode `play` and only while there is no progress (progress() grew, distance to `at` dropped ≥ 8 m since
 * the last mark, or firasa:seen / interact:use happened — each restarts the clock).
 * Events: objective:set {key,text} · objective:done · objective:marks · hint:show {key,text,level}.
 * Pure helper (unit tests): stepHintClock.
 */
import { bearingDeg } from '../core/math.js';
import { resolvePoint } from './interact.js';

export const PROGRESS_DIST = 8;
export const defaultHintAfter = chapter => (chapter >= 3 ? [45, 90] : [25, 50]);

/**
 * Pure hint clock. s = { t, level }. Returns the hint index to show now (0-based) or -1.
 * `progressed` restarts the clock (and the level).
 */
export function stepHintClock(s, dt, progressed, hintAfter, count) {
  if (progressed) { s.t = 0; s.level = 0; return -1; }
  s.t += dt;
  if (s.level < count && s.t >= hintAfter[Math.min(s.level, hintAfter.length - 1)]) return s.level++;
  return -1;
}

const _p = { x: 0, y: 0, z: 0 };

export function createObjectives(G) {
  const marks = [];                    // stable array of mark records
  const byId = new Map();
  // compat for the baseline UI (Map-style lookup); the contract is the plain stable array
  Object.defineProperty(marks, 'get', { value: id => byId.get(id === '__goal' ? 'goal' : id), enumerable: false });
  let cur = null, hint = null, o = null;
  const clock = { t: 0, level: 0 };
  let lastProg = 0, lastDist = Infinity, bump = false, goal = null, goalShown = false, dirty = false;

  const hasText = k => !!(G.story && G.story.text && G.story.text[k] !== undefined);
  const textOf = (k, v) => G.t(k, v);

  function addMark(id, def, scope) {
    let m = byId.get(id);
    if (!m) { m = { id, icon: 'goal', bearing: null, dist: null, at: null, bearingFn: null, scope: 'beat' }; byId.set(id, m); marks.push(m); }
    m.icon = def.icon || 'goal'; m.at = def.at || null; m.bearingFn = def.bearingFn || null; m.scope = scope || 'beat';
    m.bearing = null; m.dist = null;
    G.events.emit('objective:marks');
    return { remove() { removeMark(id, m); } };
  }
  function removeMark(id, ref) {
    const m = byId.get(id);
    if (!m || (ref && m !== ref)) return;
    byId.delete(id); const i = marks.indexOf(m); if (i >= 0) marks.splice(i, 1);
    G.events.emit('objective:marks');
  }
  function measure(m) {
    const pl = G.actors.player;
    if (m.bearingFn) { const b = m.bearingFn(); m.bearing = typeof b === 'number' && isFinite(b) ? ((b % 360) + 360) % 360 : null; }
    if (m.at && resolvePoint(G, m.at, _p, 0)) {
      const dx = _p.x - pl.pos.x, dz = _p.z - pl.pos.z;
      m.dist = Math.sqrt(dx * dx + dz * dz);
      if (!m.bearingFn) m.bearing = bearingDeg(Math.atan2(dx, dz));
    } else if (!m.at) m.dist = null;
  }
  function distToGoal() {
    if (!o || !o.at || !resolvePoint(G, o.at, _p, 0)) return Infinity;
    const pl = G.actors.player; return Math.hypot(_p.x - pl.pos.x, _p.z - pl.pos.z);
  }
  function showGoal() {
    if (goalShown || !o || o.mark === 'never' || (!o.at && !o.bearingFn)) return;
    goalShown = true; goal = addMark('goal', { at: o.at, bearingFn: o.bearingFn, icon: 'goal' }, 'beat');
  }
  function emitHint(i) {
    const k = o.hints[i]; if (!k || !hasText(k)) return false;
    hint = { key: k, text: textOf(k, o.vars), level: i + 1 };
    G.events.emit('hint:show', hint); return true;
  }

  const O = {
    get current() { return cur; },
    get hint() { return hint; },
    get marks() { return marks; },
    set(key, opt = {}) {
      removeMark('goal'); goal = null; goalShown = false;
      const base = key.replace(/\.obj$/, '');
      o = {
        key, vars: opt.vars, at: opt.at || null, bearingFn: opt.bearingFn || null, mark: opt.mark || 'hint',
        hints: opt.hints || [`${base}.hint1`, `${base}.hint2`],
        hintAfter: opt.hintAfter || defaultHintAfter(G.state.chapter || 1), progress: opt.progress || null,
      };
      cur = { key, text: textOf(key, opt.vars), at: opt.at || null }; hint = null;
      clock.t = 0; clock.level = 0; bump = false;
      lastProg = o.progress ? o.progress() : 0; lastDist = distToGoal();
      if (o.mark === 'always') showGoal();
      G.events.emit('objective:set', cur);
    },
    poke() {
      if (!o) return;
      if (hint) G.events.emit('hint:show', hint);
      else G.events.emit('objective:set', cur);
    },
    done() { if (!cur) return; cur = null; hint = null; o = null; removeMark('goal'); goal = null; goalShown = false; G.events.emit('objective:done'); },
    clear() { cur = null; hint = null; o = null; removeMark('goal'); goal = null; goalShown = false; G.events.emit('objective:done'); },
    mark(id, def = {}) { return addMark(id, def, def.scope || 'beat'); },
    /** restart the hint clock from code (chapters may call this when the player did something meaningful) */
    progress() { bump = true; },
    onBeatEnd() {
      for (let i = marks.length - 1; i >= 0; i--) if (marks[i].scope !== 'level') byId.delete(marks[i].id), marks.splice(i, 1);
      goal = null; goalShown = false; G.events.emit('objective:marks');
    },
    onLevelUnload() { marks.length = 0; byId.clear(); cur = null; hint = null; o = null; goal = null; goalShown = false; },
    update(dt) {
      const play = G.state.mode === 'play';
      if (play && marks.length) for (let i = 0; i < marks.length; i++) measure(marks[i]);
      if (!o || !play) return;
      let prog = bump; bump = false;
      if (o.progress) { const v = o.progress(); if (v > lastProg) prog = true; lastProg = v; }
      if (o.at) { const d = distToGoal(); if (d <= lastDist - PROGRESS_DIST) { prog = true; lastDist = d; } }
      if (prog && hint) hint = null;
      const i = stepHintClock(clock, dt, prog, o.hintAfter, o.hints.length);
      if (i >= 0) { emitHint(i); if (i === o.hints.length - 1 && o.mark === 'hint') showGoal(); }
      else if (o.hints.length === 0 && clock.t > (o.hintAfter[0] || 45) && o.mark === 'hint') showGoal();
    },
  };
  const markProgress = () => { bump = true; };
  G.events.on('firasa:seen', markProgress);
  G.events.on('interact:use', markProgress);
  return O;
}
