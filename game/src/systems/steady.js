/**
 * الثبات — the steadiness verb. Hold the context button while the view stays on the target.
 *   hold({ target, seconds, labelKey, tolerance = 35°, window = Infinity, resolve = 'full'|'windowEnd',
 *          breakOn = 'never'|'empty'|'flinch', stages: [fn33, fn66] }) → Promise<boolean>
 *   tense(on)               open/close a TEST WINDOW (feint, shot, dagger). breakOn 'flinch' fails at once on a flinch.
 *   brace({ warn, impactAt }) → Promise<boolean>     gust: button down at impactAt and 1.0 s after. Only judges.
 *   walk({ to, radius = 3, speed = 1.5 }) → { done: Promise<boolean>, shot() }   speed is a locked pace: any stick that
 *                           moves the hero (player.moving, |stick| > MOVE_STICK) walks him at exactly `speed`; "still" = not moving
 *   fails(tag) / fail(tag)  counters that persist across beat retries, reset when a new chapter starts.
 * State: progress · tension · activeRequest ({kind:'hold'|'brace'|'walk', target, labelKey, seconds}).
 * Events: steady:start · steady:progress {p} · steady:stage {n} · steady:end {ok}.
 * Pure helpers (unit tests): stepFlinch, stepWalkFlinch, stepRing.
 */
import { DEG, clamp, wrapPi, yawOf } from '../core/math.js';
import { resolvePoint } from './interact.js';
import { MOVE_STICK } from '../actors/player.js';

export const FLINCH_RELEASE = 0.25;
export const FLINCH_STICK = 0.5;
export const FLINCH_AIM = 35 * DEG;
export const BRACE_AFTER = 1.0;
export const BRACE_GAP = 0.15;     // touch fairness: a thumb slip shorter than this does not count
const WALK_STILL = 0.5, WALK_HEAD = 0.4, WALK_SHOT = 0.8, WALK_AIM = 35 * DEG, WALK_GRACE = 1.2;
const BRACE_LIMIT = Object.freeze({ speedMul: 0.2 });

/** Pure: ring step. Fills at 1/seconds, drains at 2/seconds. */
export function stepRing(p, filling, seconds, dt) {
  p += (filling ? dt : -2 * dt) / Math.max(1e-3, seconds);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * Pure flinch state machine for a test window. `s` = { rel }. Returns true when the hold must fail now:
 * button released > 0.25 s, stick > 0.5, or the view > 35° off the target.
 */
export function stepFlinch(s, holding, stick, aimErr, dt) {
  s.rel = holding ? 0 : s.rel + dt;
  return s.rel > FLINCH_RELEASE || stick > FLINCH_STICK || aimErr > FLINCH_AIM;
}

/**
 * Pure walk flinch machine. s = { still, head, sinceShot, shot, moved, t }.
 * `move`: player.moving (boolean), or a stick magnitude 0..1 judged with the player's own MOVE_STICK (F03: one
 * definition of moving). headErr rad (heading vs direction to goal). Returns true on a flinch.
 */
export function stepWalkFlinch(s, move, headErr, dt) {
  s.t += dt;
  const moving = typeof move === 'boolean' ? move : move > MOVE_STICK;
  if (moving) s.moved = true;
  s.still = moving ? 0 : ((s.moved || s.t > WALK_GRACE) ? s.still + dt : 0);
  s.head = moving && Math.abs(headErr) > WALK_AIM ? s.head + dt : 0;
  let shotFail = false;
  if (s.shot) { s.sinceShot += dt; if (s.sinceShot <= WALK_SHOT && !moving) shotFail = true; }
  return s.still > WALK_STILL || s.head > WALK_HEAD || shotFail;
}
export const newFlinch = () => ({ rel: 0 });
export const newWalkFlinch = () => ({ still: 0, head: 0, sinceShot: 0, shot: false, moved: false, t: 0 });

export function createSteady(G) {
  let req = null, progress = 0, tension = 0, tenseOn = false;
  const failMap = new Map();
  let lastChapter = null;
  const evProg = { p: 0 }, evStage = { n: 0 }, evEnd = { ok: false }, evStart = { seconds: 0, labelKey: '', target: null };
  const fl = newFlinch();
  const tgt = { x: 0, y: 0, z: 0 };
  let braceHandle = null, walkHandle = null;

  const limit = (tag, o) => { try { return G.actors.player.limit(tag, o); } catch (e) { return null; } };
  const drop = h => { if (h && h.remove) h.remove(); };
  const ctl = () => G.sys.interact;
  const holdBtn = () => G.state.mode === 'play' && ctl().held;
  const aimErr = r => (r.target ? G.actors.cam.aimError(r.target) : 0);

  function open(r) {
    if (req && req.finish) req.finish(false);
    req = r; progress = 0; fl.rel = 0;
    evStart.seconds = r.seconds; evStart.labelKey = r.labelKey; evStart.target = r.target || null;
    G.events.emit('steady:start', evStart);
  }
  function close(r, ok) {
    if (req !== r) return ok;
    req = null; tenseOn = false;
    if (r.lock) { try { G.actors.cam.softLock(null); } catch (e) { /* noop */ } }
    drop(braceHandle); braceHandle = null; drop(walkHandle); walkHandle = null;
    evEnd.ok = ok; G.events.emit('steady:end', evEnd);
    return ok;
  }

  const S = {
    get progress() { return progress; },
    get activeRequest() { return req; },
    get tension() { return tension; },
    get testing() { return tenseOn; },

    hold(o = {}) {
      const r = {
        kind: 'hold', target: o.target || null, seconds: o.seconds || 3, labelKey: o.labelKey || 'steady.hold',
        tolerance: o.tolerance ? (o.tolerance > 1.6 ? o.tolerance * DEG : o.tolerance) : FLINCH_AIM,
        window: o.window || Infinity, resolve: o.resolve || 'full', breakOn: o.breakOn || 'never', stages: o.stages || null,
        lock: !!o.target, finish: null,
      };
      open(r);
      if (r.target) { try { G.actors.cam.softLock(r.target); } catch (e) { /* noop */ } }
      let t = 0, peak = 0, s33 = false, s66 = false;
      r.finish = ok => close(r, ok);
      G.scope.onEnd(() => { if (req === r) close(r, false); });
      const p = G.scope.task(dt => {
        if (req !== r) return false;
        t += dt;
        if (G.state.mode !== 'play' && !G.state.fastText) return undefined;
        const fast = !!G.state.fastText;
        const err = fast ? 0 : aimErr(r);
        const holding = fast ? t > 0.02 : holdBtn();
        const aimed = err <= r.tolerance;
        if (r.breakOn === 'flinch' && tenseOn && !fast) {
          const stick = Math.hypot(G.input.move.x, G.input.move.y);
          if (stepFlinch(fl, holding, stick, err, dt)) return close(r, false);
        } else fl.rel = 0;
        progress = stepRing(progress, holding && aimed, fast ? 0.1 : r.seconds, dt);
        if (progress > peak) peak = progress;
        if (progress >= 0.33 && !s33) { s33 = true; if (r.stages && r.stages[0]) r.stages[0](); evStage.n = 1; G.events.emit('steady:stage', evStage); }
        if (progress >= 0.66 && !s66) { s66 = true; if (r.stages && r.stages[1]) r.stages[1](); evStage.n = 2; G.events.emit('steady:stage', evStage); }
        evProg.p = progress; G.events.emit('steady:progress', evProg);
        if (r.breakOn === 'empty' && peak > 0.15 && progress <= 0) return close(r, false);
        if (r.resolve === 'windowEnd' && r.window !== Infinity) { if (t >= r.window) return close(r, progress >= 0.99); return undefined; }
        if (progress >= 1) return close(r, true);
        if (r.window !== Infinity && t >= r.window) return close(r, false);
        return undefined;
      });
      return p;
    },

    tense(on) { tenseOn = !!on; fl.rel = 0; },

    brace(o = {}) {
      const impactAt = o.impactAt > 0 ? o.impactAt : 1.5;
      const r = { kind: 'brace', target: null, labelKey: 'steady.brace', seconds: impactAt + BRACE_AFTER, finish: null };
      open(r);
      let t = 0, gap = 0, limited = false;
      r.finish = ok => close(r, ok);
      G.scope.onEnd(() => { if (req === r) close(r, false); });
      return G.scope.task(dt => {
        if (req !== r) return false;
        t += dt;
        const fast = !!G.state.fastText;
        const down = fast || holdBtn();
        if (down && !limited) { braceHandle = limit('brace', BRACE_LIMIT); limited = true; }
        else if (!down && limited) { drop(braceHandle); braceHandle = null; limited = false; }
        if (fast && t > 0.05) return close(r, true);
        progress = clamp((t - impactAt) / BRACE_AFTER, 0, 1);
        if (down) gap = 0; else gap += dt;
        if (t >= impactAt && gap > BRACE_GAP) return close(r, false);   // not holding when it hits, or let go during
        if (t >= impactAt + BRACE_AFTER) return close(r, true);
        evProg.p = progress; G.events.emit('steady:progress', evProg);
        return undefined;
      });
    },

    walk(o = {}) {
      const to = o.to, radius = o.radius || 3, speed = o.speed || 1.5;
      const r = { kind: 'walk', target: to, labelKey: 'steady.walk', seconds: 0, finish: null };
      open(r);
      const w = newWalkFlinch();
      walkHandle = limit('walk', { speed, pace: speed, run: false });
      r.finish = ok => close(r, ok);
      G.scope.onEnd(() => { if (req === r) close(r, false); });
      const pl = G.actors.player;
      const done = G.scope.task(dt => {
        if (req !== r) return false;
        resolvePoint(G, to, tgt, 0);
        const dx = tgt.x - pl.pos.x, dz = tgt.z - pl.pos.z;
        if (dx * dx + dz * dz <= radius * radius) return close(r, true);
        if (G.state.fastText) return undefined;
        const head = wrapPi(pl.yaw - yawOf(dx, dz));
        if (G.state.mode === 'play' && stepWalkFlinch(w, !!pl.moving, head, dt)) return close(r, false);
        return undefined;
      });
      return { done, shot() { w.shot = true; w.sinceShot = 0; } };
    },

    fails(tag) { return failMap.get(tag) || 0; },
    fail(tag) { const n = (failMap.get(tag) || 0) + 1; failMap.set(tag, n); return n; },

    onBeatEnd() { if (req) { const r = req; close(r, false); } tenseOn = false; tension = 0; },
    onLevelUnload() { S.onBeatEnd(); },
    update(dt) {
      tension += ((tenseOn ? 1 : 0) - tension) * (1 - Math.exp(-8 * dt));
    },
  };
  G.events.on('beat:start', e => { if (e && e.chapter !== undefined && e.chapter !== lastChapter) { failMap.clear(); lastChapter = e.chapter; } });
  return S;
}
