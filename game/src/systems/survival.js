/**
 * Thirst & sips (DESIGN §4). thirst 100 = comfortable … 0 = collapse.
 *   survival.thirst · sips · draining · drinkProgress
 *   set({ thirst?, sips?, drain? }) · rate(tag, perSecond | null) · drink() → Promise<boolean>
 * Per-second drain: riding 0.16 (soft sand 0.24), walking 0.15, running 0.35, standing 0.05, plus `rate()` extras.
 * Events: survival:changed (≤ 4/s) · survival:level {step: 40|30|15} once each going down · survival:drink · survival:collapse (once)
 *   · survival:denied {key} (the قربة was held while locked; at most once per 3 s).
 * Below 15 the hero may not run: survival owns ONE player.limit('thirst', { run: false }) handle (set below 15, released at 20,
 * re-attached if the player cleared its limits at a beat end) — limits never pile up.
 *
 * WATER RULE (DESIGN §4: "the only sips in the game are decisions"). Each sip is spent exactly once, by whoever the player chooses:
 *   - the قربة is LOCKED (lockDrink(true, toastKey)) from the start of a chapter until its decision (ch2 ration, ch4 stranger):
 *     holding the icon does nothing but raise survival:denied, whose toast explains why; drink() answers false;
 *   - the choice moves the sip to its recipient: «اشرب» → the hero drinks it (+35), «أعطِ فهيدًا / جدّك / جابرًا» → sips = 0 at once;
 *     a refusal (ch4) keeps the sip for the hero (c4_search). A later beat of the same chapter never gets a free sip back.
 * Pure helpers (unit tests): baseDrain, crossings, drinkStep.
 */
export const RATES = { ride: 0.16, rideSoft: 0.24, walk: 0.15, run: 0.35, stand: 0.05 };
export const LEVELS = [40, 30, 15];
export const SIP_GAIN = 35;
export const DRINK_SECONDS = 1.2;
const RUN_SPEED = 3.2, MOVE_SPEED = 0.3, NO_RUN = 15, NO_RUN_OFF = 20;      // no running below 15, allowed again from 20 (hysteresis)
const NO_RUN_LIMIT = Object.freeze({ run: false });

/** Pure: base drain per second for a hero state. */
export function baseDrain(mounted, speed, soft) {
  if (mounted) return soft ? RATES.rideSoft : RATES.ride;
  return speed > RUN_SPEED ? RATES.run : speed > MOVE_SPEED ? RATES.walk : RATES.stand;
}

/** Pure: thresholds crossed going down between prev and next that are still armed; disarms them. armed: boolean[3]. Returns the lowest step or 0. */
export function crossings(prev, next, armed, out) {
  let n = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (next > LEVELS[i] + 1) armed[i] = true;                       // re-arm after drinking
    else if (armed[i] && prev > LEVELS[i] && next <= LEVELS[i]) { armed[i] = false; if (out) out[n] = LEVELS[i]; n++; }
  }
  return n;
}

/** Pure: advance the drink ring. */
export function drinkStep(p, on, dt, seconds = DRINK_SECONDS) {
  p += (on ? dt : -2 * dt) / seconds;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

export function createSurvival(G) {
  let thirst = 100, sips = 0, drain = false, collapsed = false;
  let dp = 0, needRelease = false, changedT = 0, dirty = false, limitH = null, noRun = false;
  let locked = false, lockKey = null, deniedHold = false, deniedAt = -99;
  const armed = [true, true, true], out = [0, 0, 0], extras = new Map();
  let extra = 0;
  const evChanged = { thirst: 100, sips: 0 }, evLevel = { step: 0 }, evDenied = { key: null };

  const changed = (force) => { dirty = true; if (force) flush(); };
  function flush() { dirty = false; changedT = 0.25; evChanged.thirst = thirst; evChanged.sips = sips; G.events.emit('survival:changed', evChanged); }
  function setThirst(v) {
    const prev = thirst;
    thirst = v < 0 ? 0 : v > 100 ? 100 : v;
    const n = crossings(prev, thirst, armed, out);
    for (let i = 0; i < n; i++) { evLevel.step = out[i]; G.events.emit('survival:level', evLevel); }
    if (thirst <= 0 && !collapsed) { collapsed = true; flush(); G.events.emit('survival:collapse', {}); }
    else if (thirst > 0 && collapsed && thirst > 5) collapsed = false;
  }
  function doDrink() {
    if (!(sips > 0)) return false;                                    // a sip is spent once (hold path + scripted drink can finish in the same tick)
    if (sips !== Infinity) sips--;
    setThirst(thirst + SIP_GAIN);
    G.events.emit('survival:drink'); flush();
    return true;
  }
  const canDrink = () => sips > 0 && thirst < 95 && !locked;

  const S = {
    get thirst() { return thirst; },
    set thirst(v) { setThirst(v); changed(true); },
    get sips() { return sips; },
    set sips(v) { sips = v; changed(true); },
    get draining() { return drain; },
    get drinkProgress() { return dp; },
    setSips(n) { sips = n; changed(true); },
    /** lock / unlock the قربة until the story decision; `key` = the toast text key that explains why */
    lockDrink(on, key = null) { locked = !!on; lockKey = locked ? key : null; if (locked) { dp = 0; deniedHold = false; } },
    get drinkLocked() { return locked; },
    setDrain(on) { drain = !!on; },
    set(o = {}) {
      if (o.thirst !== undefined) { collapsed = false; for (let i = 0; i < 3; i++) armed[i] = o.thirst > LEVELS[i]; thirst = o.thirst < 0 ? 0 : o.thirst > 100 ? 100 : o.thirst; }
      if (o.sips !== undefined) sips = o.sips;
      if (o.drain !== undefined) drain = !!o.drain;
      flush();
    },
    reset(t = 100) { S.set({ thirst: t }); },
    /** extra drain source in units/second (negative = relief); null removes it */
    rate(tag, v) {
      if (v === null || v === undefined) extras.delete(tag); else extras.set(tag, v);
      extra = 0; for (const x of extras.values()) extra += x;
    },
    /** current total drain per second (debug / harness) */
    get drainRate() {
      const pl = G.actors.player;
      const soft = pl.mode === 'mounted' && G.world.terrain.softAt(pl.pos.x, pl.pos.z) > 0.5;
      const r = baseDrain(pl.mode === 'mounted', pl.speed, soft) + extra;
      return r < 0 ? 0 : r;
    },
    /** hold-to-drink performed by script/bot: fills the ring by itself */
    drink() {
      if (!canDrink()) return Promise.resolve(false);
      const secs = G.state.fastText ? 0.08 : DRINK_SECONDS;
      let p = 0;
      return G.scope.task(dt => {
        p += dt / secs; dp = p < 1 ? p : 1;
        if (p >= 1) { dp = 0; needRelease = true; return doDrink(); }
        return undefined;
      });
    },
    onBeatEnd() { dp = 0; },
    onLevelUnload() { drain = false; extras.clear(); extra = 0; dp = 0; locked = false; lockKey = null; limitH = null; noRun = false; },
    update(dt) {
      const play = G.state.mode === 'play';
      const pl = G.actors.player;
      changedT -= dt; if (dirty && changedT <= 0) flush();
      if (!play) { if (dp > 0) dp = drinkStep(dp, false, dt); return; }
      // hold-to-drink
      const hold = G.input.held('drink');
      if (!hold) { needRelease = false; deniedHold = false; }
      else if (locked && !deniedHold) { deniedHold = true; if (G.time.now - deniedAt > 3) { deniedAt = G.time.now; evDenied.key = lockKey; G.events.emit('survival:denied', evDenied); } }
      const want = hold && !needRelease && canDrink();
      if (want || dp > 0) {
        dp = drinkStep(dp, want, dt, G.state.fastText ? 0.08 : DRINK_SECONDS);
        if (dp >= 1) { dp = 0; needRelease = true; doDrink(); }
      }
      // drain
      if (drain && !collapsed) {
        const r = S.drainRate;
        if (r > 0) { const before = thirst | 0; setThirst(thirst - r * dt); if ((thirst | 0) !== before) changed(false); }
      }
      // no running when parched: ONE limit handle (the player clears its limits at every beat end, so re-attach when it is gone)
      if (thirst < NO_RUN) noRun = true; else if (thirst >= NO_RUN_OFF) noRun = false;
      if (pl.limit) {
        if (noRun) { if (!limitH || (pl.limits && pl.limits.indexOf(limitH) < 0)) limitH = pl.limit('thirst', NO_RUN_LIMIT); }
        else if (limitH) { limitH.remove(); limitH = null; }
      }
    },
  };
  G.events.on('beat:reset', () => { collapsed = false; if (thirst < 25) setThirst(40); flush(); });   // QA4: only a near-collapse restart is topped up (ch4 starts at 36, not 40)
  return S;
}
