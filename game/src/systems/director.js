/**
 * Director (kernel) — runs chapters and beats; owns checkpoints, dialogue/choice/card sequencing, modes and fail→retry.
 * The ONLY module that changes G.state.chapter / G.state.beat / G.state.mode (besides boot).
 *
 * Chapter module (chapters/chN.js):
 *   { id, index, assets, level: LevelDef, sky?, lst?, survival?: { thirst, sips, drain }, setup?(G, L),
 *     beats: [{ id, enter?(G, L, ctx), run(G, L, d) }] }
 *   - setup(G, L): once after the level loads — spawn level-lifetime actors, `L.own()` their handles.
 *   - enter(G, L, ctx): ALWAYS called at beat start; idempotent absolute setup. ctx.resumed (= ctx.cold) is true when the
 *     beat starts cold (chapter start, checkpoint load, retry, test jump) → place every actor, set sky/weather, mount, equip.
 *   - run(G, L, d): the async sequence; returns when the beat is complete. Never catch BeatAbort.
 *
 * `d` — sim-time driven, everything aborts with the beat:
 *   d.wait(s) · d.until(fn,{timeout}) · d.task(tickFn) · d.tween(s, fn) · d.near(target, r) · d.wrap(promise)
 *   d.first({ name: promise, … }) → name of the first to settle (the others are cancelled)
 *   d.spawn(async d2 => …) → { cancel(), done }   background branch with its own child scope
 *   d.talk(blockId) · d.say(who, text) · d.bark(blockId, s) · d.choice(promptKey|null, [{key, value, confirm?}]) · d.card(cardId,{seconds}) · d.fade(toBlack, s)
 *   d.objective(key, opts) · d.objectiveDone() · d.flag(name, value) · d.flags · d.own(handle) · d.onEnd(fn) · d.cine(shots)
 *   d.failAndRestart(textKey)   fade out, show the line, restart this beat cold (never resolves)
 */
import { createScope, BeatAbort } from '../core/scope.js';
import { pointOf, dist2 } from '../core/math.js';
import { CHAPTERS } from '../chapters/index.js';

export { BeatAbort };
export const FLAG_DEFAULTS = { ration: 'self', gaveWater: false, sawWolfPrint: false, leftRifle: false, haybah: 0 };
const LOCK_TAGS = ['dialogue', 'cine', 'card', 'fail', 'steady', 'scripted', 'director'];

export function createDirector(G) {
  let token = 0;
  /** @type {null | {ch:any, n:number, i:number, beat:any, scope:any}} */
  let cur = null;
  let loadedKey = null;
  let L = null;
  let failScope = null;          // the fail→retry transition in flight (owns its card/fade writes; at most one)
  let standInStale = false;      // a failed model arrived after the level was built with a stand-in
  let rebuildQuiet = false;      // that rebuild happens mid-chapter: no load-failure prompt (the player already chose stand-ins)
  let fadeAlpha = 0;
  let choicePicked = -1;
  G.events.on('ui:choice', e => { choicePicked = e.index; });
  // any unload (the title backdrop, a chapter switch) invalidates the cached level: the next startChapter rebuilds it fully
  G.events.on('level:unload', () => { loadedKey = null; L = null; });
  // a model that failed (and is on screen as a stand-in) arrived: the level is rebuilt with it at the next beat start
  G.events.on('assets:recovered', e => { if (e.kind === 'model') standInStale = true; });
  // shared story reactions every chapter gets for free: the turn-back line at the level boundary, the thirst lines
  G.events.on('player:bounds', () => { const k = `c${G.state.chapter}.bounds`; if (G.state.mode === 'play' && G.story.text && G.story.text[k]) G.ui.hud.toast(G.t(k), 3.6); });
  G.events.on('survival:level', e => { const k = `thirst.toast.${e && e.step}`; if (G.state.mode === 'play' && G.story.text && G.story.text[k]) G.ui.hud.toast(G.t(k), 3.6); });
  G.state.flags = Object.assign({}, FLAG_DEFAULTS, G.save.data.flags || {});

  const fast = () => !!G.state.fastText;
  function setFade(a) { fadeAlpha = a; G.ui.cards.setFade(a); }
  const modules = () => [...Object.values(G.world), ...Object.values(G.actors), ...Object.values(G.sys), G.ui, G.audio];

  // ---------------------------------------------------------------------------------------- d API
  /** build a `d` bound to a scope getter (the beat scope, or a spawned child scope) */
  function makeD(scope) {
    const d = {
      get flags() { return G.state.flags; },
      wait: s => scope().sleep(s),
      until: (fn, o) => scope().until(fn, o),
      task: fn => scope().task(fn),
      tween: (s, fn, ease) => scope().tween(s, fn, ease),
      wrap: p => scope().wrap(p),
      own: h => scope().own(h),
      onEnd: fn => scope().onEnd(fn),
      /** resolves when the player is within `radius` metres (XZ) of target */
      near(target, radius = 2.5) {
        const r2 = radius * radius; const p = G.actors.player.pos;
        return scope().until(() => { const t = pointOf(target); return dist2(p.x, p.z, t.x, t.z) < r2; });
      },
      /** first of several named awaitables; losers are cancelled. @returns {Promise<string>} */
      first(map) {
        const keys = Object.keys(map);
        return new Promise((resolve, reject) => {
          let settled = false;
          const finish = (k, fn, v) => {
            if (settled) return; settled = true;
            for (const o of keys) if (o !== k && map[o] && map[o].cancel) map[o].cancel();
            fn(v);
          };
          for (const k of keys) Promise.resolve(map[k]).then(() => finish(k, resolve, k), e => finish(k, reject, e));
        });
      },
      /** background branch: `fn(d2)` runs with a child scope; ends with the beat or on cancel() */
      spawn(fn) {
        const child = scope().child('spawn'); const d2 = makeD(() => child);
        const done = (async () => {
          try { await fn(d2); }
          catch (e) { if (!(e instanceof BeatAbort)) { console.error('[director] spawned branch failed', e); G.events.emit('beat:error', { beat: G.state.beat, error: String(e && e.stack || e) }); } }
          finally { child.end(); }
        })();
        return { cancel() { child.abort(); }, done };
      },
      fade(toBlack, seconds = 0.6) {
        const from = fadeAlpha, to = toBlack ? 1 : 0;
        if (seconds <= 0 || from === to) { setFade(to); return Promise.resolve(); }
        return scope().tween(fast() ? 0.05 : seconds, k => setFade(from + (to - from) * k));
      },
      /** one raw dialogue line (blocking) */
      async say(who, text) {
        const sc = scope();
        G.ui.dialogue.show({ who, name: (G.story.names && G.story.names[who]) || '', text });
        G.events.emit('dialogue:line', { who, text });
        const npc = G.actors.npcs.get(who); if (npc && npc.speak) npc.speak(true);
        let t = 0;
        try {
          await sc.task(dt => {
            t += dt;
            if (G.input.pressed('skip') && t > 0.15) { if (G.ui.dialogue.typing) G.ui.dialogue.finishTyping(); else return true; }
            if (fast() && t > 0.05) return true;
            return undefined;
          });
        } finally { if (npc && npc.speak) npc.speak(false); }
      },
      /** play a STORY.talk block (blocking; mode 'dialogue') */
      async talk(blockId) {
        const lines = G.story.talk && G.story.talk[blockId];
        if (!lines) { console.warn('[director] missing talk block', blockId); return; }
        const sc = scope(); const prev = G.state.mode;
        G.setMode('dialogue'); G.input.lock('dialogue');
        G.events.emit('dialogue:open', { id: blockId });
        let open = true;
        const close = () => { if (!open) return; open = false; G.ui.dialogue.hide(); G.input.unlock('dialogue'); if (G.state.mode === 'dialogue') G.setMode(prev === 'dialogue' || prev === 'loading' ? 'play' : prev); G.events.emit('dialogue:close', { id: blockId }); };
        sc.onEnd(close);
        for (let i = 0; i < lines.length; i++) await d.say(lines[i][0], lines[i][1]);
        close();
      },
      /** non-blocking one-liner (first line of the block) */
      bark(blockId, seconds = 3.6) {
        const lines = G.story.talk && G.story.talk[blockId];
        if (!lines || !lines[0]) { console.warn('[director] missing bark', blockId); return; }
        G.ui.hud.toast({ who: lines[0][0], name: (G.story.names && G.story.names[lines[0][0]]) || '', text: lines[0][1] }, seconds);
        G.events.emit('dialogue:bark', { id: blockId, who: lines[0][0] });
      },
      /** @param {string|null} promptKey @param {{key:string, value:any, confirm?:boolean}[]} options */
      async choice(promptKey, options) {
        const sc = scope(); const prev = G.state.mode;
        G.setMode('dialogue'); G.input.lock('dialogue');
        let open = true;
        const close = () => { if (!open) return; open = false; G.ui.dialogue.hideChoices(); G.input.unlock('dialogue'); if (G.state.mode === 'dialogue') G.setMode(prev === 'dialogue' || prev === 'loading' ? 'play' : prev); };
        sc.onEnd(close);
        choicePicked = -1;
        G.ui.dialogue.choices(promptKey ? G.t(promptKey) : '', options.map(o => ({ label: G.t(o.key), confirm: !!o.confirm })));
        let t = 0;
        const idx = await sc.task(dt => {
          t += dt;
          if (t > 0.7 && choicePicked >= 0 && choicePicked < options.length) return choicePicked;
          if (t <= 0.7) choicePicked = -1;                                   // input lock while the options appear
          if ((fast() && t > 0.05) || (G.state.autoPlay && t > 1.4)) {      // tests / autoplay pick through G.state.autoChoice
            const want = G.state.autoChoice && G.state.autoChoice[options[0].key.replace(/\.choice\..*$/, '')];
            const i = options.findIndex(o => o.value === want); return i >= 0 ? i : 0;
          }
          return undefined;
        });
        close();
        G.events.emit('choice:made', { key: options[idx].key, value: options[idx].value });
        return options[idx].value;
      },
      /** chapter / narration card (blocking) */
      async card(cardId, { seconds = 3.4 } = {}) {
        const c = G.story.cards && G.story.cards[cardId];
        if (!c) { console.warn('[director] missing card', cardId); return; }
        const sc = scope();
        G.input.lock('card');
        let open = true;
        const close = () => { if (!open) return; open = false; G.ui.cards.hide(); G.input.unlock('card'); };
        sc.onEnd(close);
        G.ui.cards.show(c); G.events.emit('card:show', { id: cardId });
        let t = 0; const dur = fast() ? 0.1 : seconds;
        await sc.task(dt => { t += dt; if (t >= dur || (t > 0.8 && G.input.pressed('skip'))) return true; return undefined; });
        close();
      },
      objective(key, opts) { G.sys.objectives.set(key, opts); },
      objectiveDone() { G.sys.objectives.done(); },
      flag(name, value) {
        if (!(name in FLAG_DEFAULTS)) console.warn('[director] unknown flag', name);
        G.state.flags[name] = value; G.save.data.flags = { ...G.state.flags }; G.save.commit();
        G.net.flag(name, value);
      },
      /** cinematic camera shots (camera.js). Mode 'cine'; 'skip' fast-forwards a shot. */
      async cine(shots) {
        const sc = scope(); const prev = G.state.mode;
        G.setMode('cine'); G.input.lock('cine'); G.ui.cards.letterbox(true);
        let open = true;
        const close = () => { if (!open) return; open = false; G.input.unlock('cine'); G.ui.cards.letterbox(false); if (G.state.mode === 'cine') G.setMode(prev === 'cine' || prev === 'loading' ? 'play' : prev); };
        sc.onEnd(close);
        await G.actors.cam.cine(shots);
        close();
      },
      failAndRestart(textKey) { return failAndRestart(textKey); },
    };
    return d;
  }
  const d = makeD(() => (cur ? cur.scope : G.rootScope));

  // ---------------------------------------------------------------------------------------- flow
  /** release everything beat-scoped (called at every beat end/abort and before a cold start) */
  function teardown() {
    for (const m of modules()) { if (m && m.onBeatEnd) { try { m.onBeatEnd(); } catch (e) { console.error('[director] onBeatEnd failed', e); } } }
    for (const tag of LOCK_TAGS) G.input.unlock(tag);
    const cam = G.actors.cam, pl = G.actors.player;
    if (cam.softLock) cam.softLock(null);
    if (cam.skyMode) cam.skyMode(false);
    if (cam.magnet) cam.magnet(null);
    if (cam.setFov) cam.setFov(null, 0.4);
    if (pl.setScripted) pl.setScripted(false);
    if (pl.clearLimits) pl.clearLimits('beat');
    G.ui.dialogue.hide(); G.ui.dialogue.hideChoices(); G.ui.cards.hide(); G.ui.cards.letterbox(false);
    G.sys.objectives.clear();
  }

  function snapshot(beatId) {
    const sv = G.sys.survival;
    G.save.data.cp = { beat: beatId, thirst: sv.thirst, sips: sv.sips === Infinity ? -1 : sv.sips, flags: { ...G.state.flags } };
  }

  /** abort a fail transition that is still running: it must not touch the UI of whatever starts next */
  function cancelFail() {
    if (!failScope) return;
    failScope.abort(); failScope = null;
    G.ui.cards.hide(); G.input.unlock('fail');
  }

  async function runBeat(ch, n, i, cold, my) {
    const beat = ch.beats[i];
    if (G.assets.failed.length) G.assets.retryFailed();            // models/sounds that failed earlier: try again (backoff-gated)
    const sc = createScope('beat:' + beat.id);
    G.scope = sc;
    cur = { ch, n, i, beat, scope: sc };
    G.state.chapter = n; G.state.beat = beat.id;
    const sd = G.save.data; sd.chapter = n; sd.beat = beat.id; sd.done = false;   // a journey with a checkpoint exists again
    try {
      if (cold) {
        teardown(); G.setPaused(false); setFade(1);
        if (sd.cp && sd.cp.beat === beat.id) {                       // restore the checkpoint taken when this beat first started
          G.sys.survival.set({ thirst: sd.cp.thirst, sips: sd.cp.sips < 0 ? Infinity : sd.cp.sips });
          G.state.flags = Object.assign({}, FLAG_DEFAULTS, sd.cp.flags);
        }
        G.events.emit('beat:reset');
      }
      snapshot(beat.id); G.save.commit(); G.net.checkpoint(n, i);
      // a beat with `startBlack` opens on its own (title card / cinematic): no HUD, no automatic fade-in
      G.setMode(beat.startBlack && cold ? 'cine' : 'play');
      G.events.emit('beat:start', { chapter: n, beat: beat.id, resumed: cold });
      if (beat.enter) beat.enter(G, L, { resumed: cold, cold, flags: G.state.flags });
      if (cold) { await sc.sleep(0.05); if (!beat.startBlack) await d.fade(false, 0.9); }
      await beat.run(G, L, d);
      sc.end();
      G.events.emit('beat:end', { chapter: n, beat: beat.id });
      return 'done';
    } catch (e) {
      sc.abort();
      if (e instanceof BeatAbort || my !== token) return 'aborted';
      console.error(`[director] beat "${beat.id}" crashed`, e);
      G.events.emit('beat:error', { beat: beat.id, error: String(e && e.stack || e) });
      return 'error';
    } finally {
      if (G.scope === sc) G.scope = G.rootScope;
      if (my === token) teardown();
    }
  }

  /** Start (or jump to) a chapter. beatId = start cold at that beat. */
  async function startChapter(n, beatId = null) {
    const my = ++token;
    cancelFail();
    if (cur) { cur.scope.abort(); cur = null; }
    G.scope = G.rootScope;
    const ch = CHAPTERS[n - 1];
    if (!ch) { finish(); return; }
    G.state.chapter = n;
    try {
      const key = ch.id;
      if (standInStale) loadedKey = null;               // rebuild even the cached level: the real model is here now
      if (loadedKey !== key) {
        G.setMode('loading'); setFade(1);
        G.ui.loading.show(true); G.ui.loading.set(0.02);
        const groups = ['common', ch.assets || ch.id];
        for (;;) {
          // a load the player is waiting for retries failed items at once (the backoff is for the automatic background retries)
          await G.assets.loadGroup(groups[0], p => G.ui.loading.set(p * 0.25), { force: true });
          await G.assets.loadGroup(groups[1], p => G.ui.loading.set(0.25 + p * 0.6), { force: true });
          if (my !== token) return;
          const lost = groups.flatMap(g => G.assets.groupFailures(g)).filter(f => f.kind === 'model');
          if (!lost.length || fast() || rebuildQuiet) break;   // tests/fast runs and quiet rebuilds carry on with stand-ins
          // required models are missing: do not pretend the bar is full — say so and let the player retry or go on with stand-ins
          const again = await new Promise(res => {
            const online = () => { G.ui.loading.problem(null); res(true); };           // the connection is back: retry by itself
            if (typeof window !== 'undefined') window.addEventListener('online', online, { once: true });
            G.ui.loading.problem(G.t('ui.loadFail'), { retry: G.t('ui.loadRetry'), skip: G.t('ui.loadSkip') }, v => { if (typeof window !== 'undefined') window.removeEventListener('online', online); res(v); });
          });
          if (my !== token) return;
          if (!again) { G.events.emit('assets:standins', { ids: lost.map(f => f.id) }); break; }
          G.ui.loading.set(0.02);
        }
        standInStale = false; rebuildQuiet = false;
        G.world.level.unload();
        L = await G.world.level.load(ch.level);
        if (my !== token) return;
        if (ch.sky) G.world.sky.setPreset(ch.sky, { duration: 0 });
        if (ch.lst !== undefined && G.world.sky.stars) G.world.sky.stars.setLST(ch.lst, { duration: 0 });
        loadedKey = key;
        if (ch.setup) ch.setup(G, L);
        G.ui.loading.set(0.92);
        // compile every program before the first frame is shown (no hitches in play)
        try { G.loop.tick(1 / 60); if (G.renderer.compileAsync && !G.opts.test) await G.renderer.compileAsync(G.scene, G.camera); } catch (e) { console.warn('[director] warm-up skipped', e); }
        if (my !== token) return;
        G.ui.loading.set(1); G.ui.loading.show(false);
        // next chapter's files download in the background
        const next = CHAPTERS[n]; if (next) G.assets.loadGroup(next.assets || next.id).catch(() => {});
      }
      let i = beatId ? ch.beats.findIndex(b => b.id === beatId) : 0;
      if (i < 0) i = 0;
      const sd = G.save.data; const sv = ch.survival || { thirst: 100, sips: 0, drain: false };
      const hasCp = sd.cp && sd.cp.beat === ch.beats[i].id;
      if (!hasCp) { G.sys.survival.set({ thirst: sv.thirst, sips: sv.sips }); G.state.flags = Object.assign({}, FLAG_DEFAULTS, sd.flags || {}); }
      G.sys.survival.set({ drain: !!sv.drain });
      let cold = true; let crashes = 0;
      while (i < ch.beats.length) {
        if (my !== token) return;
        const outcome = await runBeat(ch, n, i, cold, my);
        if (outcome === 'aborted') return;
        if (outcome === 'error') { if (++crashes > 1) { crashes = 0; i++; } cold = true; continue; }   // retry once cold, then skip the beat
        crashes = 0; cold = false; i++;
        if (standInStale && i < ch.beats.length) {       // a failed model arrived meanwhile: restart cold on the next beat with a rebuilt level
          snapshot(ch.beats[i].id); loadedKey = null; rebuildQuiet = true;
          await G.rootScope.tween(fast() ? 0.01 : 0.45, k => setFade(Math.max(fadeAlpha, k)));   // fade out before the rebuild cut
          if (my !== token) return;
          return startChapter(n, ch.beats[i].id);
        }
      }
      if (my !== token) return;
      cur = null;
      G.events.emit('chapter:end', { chapter: n });
      sd.unlocked = Math.max(sd.unlocked || 1, Math.min(CHAPTERS.length, n + 1));
      sd.flags = { ...G.state.flags };
      if (n < CHAPTERS.length) { sd.chapter = n + 1; sd.beat = null; sd.cp = null; G.save.commit(); startChapter(n + 1); }
      else finish();
    } catch (e) {
      if (e instanceof BeatAbort) return;
      console.error('[director] chapter failed', e);
      G.events.emit('fatal', { error: String(e && e.stack || e) });
    }
  }

  function finish() {
    const sd = G.save.data; sd.done = true; sd.finished = true; sd.beat = null; sd.cp = null; sd.chapter = CHAPTERS.length; sd.flags = { ...G.state.flags }; G.save.commit(); G.net.complete();
    cur = null; G.scope = G.rootScope;
    G.setMode('end');
    G.events.emit('game:end', { flags: G.state.flags, stats: sd.stats });
  }

  function restartBeat() { if (cur) return startChapter(cur.n, cur.beat.id); return Promise.resolve(); }

  function failAndRestart(textKey) {
    if (!cur) { const r = Promise.reject(new BeatAbort()); r.catch(() => {}); return r; }
    const n = cur.n, id = cur.beat.id; const my = ++token;
    cur.scope.abort(); cur = null; G.scope = G.rootScope;
    cancelFail();
    G.save.data.stats.retries = (G.save.data.stats.retries || 0) + 1;
    G.input.lock('fail');
    G.events.emit('beat:fail', { beat: id, textKey });
    // the transition runs in its own scope and owns every card/fade write it makes: when anything else starts (continue after
    // quitting to the title, another chapter jump, a second failure) cancelFail() aborts it and it never touches the UI again
    const fs = G.rootScope.child('fail'); failScope = fs;
    (async () => {
      const from = fadeAlpha;
      try {
        await fs.tween(fast() ? 0.05 : 0.7, k => setFade(from + (1 - from) * k));
        if (textKey) G.ui.cards.show({ num: '', title: '', sub: G.t(textKey) });
        await fs.sleep(fast() ? 0.05 : 2.6);
      } catch (e) { if (!(e instanceof BeatAbort)) console.error('[director] fail transition', e); }
      if (failScope !== fs || my !== token) return;                // superseded: cancelFail() already cleaned up
      failScope = null; G.ui.cards.hide(); G.input.unlock('fail');
      startChapter(n, id);
    })();
    const r = Promise.reject(new BeatAbort('beat failed: ' + (textKey || ''))); r.catch(() => {});
    return r;
  }

  /** Quit to title: cancel everything, keep the save. */
  function stop() {
    token++;
    cancelFail();
    if (cur) { cur.scope.abort(); cur = null; }
    G.scope = G.rootScope;
    teardown(); setFade(0);                                        // the title backdrop must not sit under a half-finished fade
  }

  G.events.on('survival:collapse', e => {
    if (!cur) return;
    const key = (e && e.textKey) || (G.state.flags.ration !== 'self' ? 'fail.thirst.giver' : 'fail.thirst.self');
    failAndRestart(key);
  });

  return {
    startChapter, restartBeat, stop, failAndRestart, d,
    get current() { return cur ? { chapter: cur.n, beat: cur.beat.id, index: cur.i, beatDef: cur.beat } : null; },
    get level() { return L; },
    get chapters() { return CHAPTERS; },
    /** forget the loaded level (forces a reload on the next startChapter) */
    invalidateLevel() { loadedKey = null; },
    update(dt) { if (cur && G.state.mode !== 'loading') G.save.data.stats.playSeconds += dt; },
  };
}
