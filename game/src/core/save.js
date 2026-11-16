/**
 * Save data (localStorage is the source of truth; net.js mirrors it to the platform room best-effort).
 *   save.data = { v, id, chapter, beat, flags, settings, stats, done, unlocked }
 *   save.settings                       shortcut to data.settings
 *   save.commit()                       persist now (called at checkpoints/settings changes) → true when written; on failure it
 *                                       emits `save:failed` (never `save:committed`) and the next commit simply tries again
 *   save.reset()                        new journey (keeps settings, unlocked chapters, the "finished once" record)
 *   save.hasProgress                    a resumable journey exists (≠ finished the story once: `data.finished`, kept across resets)
 *   data.done                           the LAST journey ended (nothing to resume until a new beat is entered)
 */
const KEY = 'hs1899.save.v1';

export const DEFAULT_SETTINGS = {
  quality: 'auto',      // auto | low | medium | high
  master: 0.9, music: 0.7, sfx: 1, voice: 1,
  sens: 1, invertY: false,
  firasaToggle: false,  // false = hold, true = tap to toggle
  textScale: 1,
  haptics: true,
};

function fresh() {
  return {
    v: 1,
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
    chapter: 1, beat: null,
    flags: {},
    cp: null,            // { beat, thirst, sips, flags } snapshot taken at the last beat start
    stats: { started: Date.now(), playSeconds: 0, retries: 0 },
    done: false,
    finished: false,     // the story was finished at least once (survives reset; unrelated to resuming)
    unlocked: 1,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function createSave(G) {
  let data = fresh();
  // reading and writing are independent: a store that refuses writes (quota, private mode) can still be read
  const store = () => { try { return window.localStorage; } catch { return null; } };
  let failing = false;

  function load() {
    try {
      const st = store(); const raw = st && st.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.v === 1) {
          data = { ...fresh(), ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) }, flags: { ...(d.flags || {}) }, stats: { ...fresh().stats, ...(d.stats || {}) } };
          if (d.done) data.finished = true;               // saves from before `finished` existed
        }
      }
    } catch (e) { console.warn('[save] load failed', e); }
    return data;
  }
  /** @returns {boolean} true when the data really reached the store */
  function commit() {
    let err = null;
    try { const st = store(); if (!st) throw new Error('storage unavailable'); st.setItem(KEY, JSON.stringify(data)); }
    catch (e) { err = e; }
    if (!err) { failing = false; G.events.emit('save:committed', data); return true; }
    console.warn('[save] write failed', err);
    const first = !failing; failing = true;                   // `first`: the start of a failure streak (one notice per streak)
    G.events.emit('save:failed', { error: String((err && err.name) || err), first });
    return false;
  }
  function reset() {
    const keep = { settings: data.settings, unlocked: data.unlocked, id: data.id, finished: data.finished };
    data = { ...fresh(), ...keep };
    commit();
  }
  return {
    load, commit, reset,
    get data() { return data; },
    get settings() { return data.settings; },
    /** true when there is a journey worth "continue": a checkpoint exists, or a chapter was finished and the next one is waiting.
     *  A finished story (done, no checkpoint) is not resumable — but re-entering any chapter afterwards saves a checkpoint again. */
    get hasProgress() { return !!data.beat || (!data.done && data.chapter > 1); },
    /** the story was finished at least once */
    get finished() { return !!data.finished || !!data.done; },
    /** the last write failed (a later commit retries) */
    get failing() { return failing; },
  };
}
