/**
 * In-page acceptance of group "state" (F01 F16 F17 F19 F24 C02) — deterministic logic checks in test mode (fast text, stepped time).
 *   node tools/shot.cjs "/harness/harness.html?m=accept_state&test=1" --quiet \
 *     --until "window.__harness && (window.__harness.ready || window.__harness.error)" --print "await window.__harness.api.run()"
 * The real-page, real-time, trusted-input half is tools/accept_state.cjs.
 */
import { createSave } from '../src/core/save.js';

export const assets = [];

const KEY = 'hs1899.save.v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function run(G) { return { run: () => check(G) }; }

async function check(G) {
  const hs = G.dev.test;
  const items = {};
  const rec = (id, pass, detail) => { items[id] = { pass: !!pass, detail }; };
  const ev = [];
  for (const n of ['beat:fail', 'beat:start', 'beat:reset', 'assets:recovered', 'save:committed', 'save:failed']) G.events.on(n, e => ev.push([n, e]));
  const count = n => ev.filter(e => e[0] === n).length;

  /** drive the game until pred() — assets/level loading needs real time, play needs stepped time (the bot taps the way runAll does) */
  async function settle(pred, { ms = 90000, bot = false } = {}) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (pred()) return true;
      if (G.state.mode === 'loading') { await sleep(25); G.loop.render = false; G.loop.tick(1 / 60); }
      else { if (bot) hs.bot.tick(1 / 60); await hs.step(1); }
    }
    return pred();
  }
  const skinned = () => { const a = G.actors.player.actor; let n = 0; if (a) a.root.traverse(o => { if (o.isSkinnedMesh) n++; }); return n; };

  // (F19 runs first: it needs the hero's model not to be in the cache yet)
  // ------------------------------------------------------------------------------------------ F19 (failed load is not permanent; stand-in replaced)
  {
    const realFetch = window.fetch; let blocked = true;
    window.fetch = function (u, o) { const url = String((u && u.url) || u); if (blocked && /\/models\/dhari\.(glb|lod1\.bin)/.test(url)) return Promise.reject(new TypeError('Failed to fetch (blocked by check)')); return realFetch.call(this, u, o); };
    const out = {};
    try {
      G.assets.manifest.groups.accept_tmp = { models: ['dhari'], textures: [], audio: [] };
      // 1 · the level is entered while the hero's model cannot be fetched (fast runs go on with the stand-in)
      G.sys.director.stop(); G.world.level.unload();
      hs.chapter(1, 'c1_well');
      await settle(() => G.state.mode === 'play' && G.state.beat === 'c1_well'); await hs.step(30);
      out.standIn = { skinned: skinned(), model: !!G.assets.model('dhari'), failed: G.assets.failed.map(f => `${f.kind}:${f.id}:${f.tries}`), standIns: G.assets.standIns, commonLoaded: G.assets.groupLoaded('common') };
      // 2 · retry rules: backoff is honoured, `force` bypasses it, a group with a failed model is never "loaded" and never reports 100 %
      let maxP = 0; const prog = p => { maxP = Math.max(maxP, p); };
      const r2 = await G.assets.loadGroup('accept_tmp', prog, { force: true });
      const tries0 = G.assets.failed.find(f => f.id === 'dhari').tries;
      const r1 = await G.assets.loadGroup('accept_tmp', prog);                // right after a failure: backing off, no new request
      const tries1 = G.assets.failed.find(f => f.id === 'dhari').tries;
      await G.assets.loadGroup('accept_tmp', prog, { force: true });
      const tries2 = G.assets.failed.find(f => f.id === 'dhari').tries;
      out.retry = { tries: [tries0, tries1, tries2], groupFailed: r2.failed.map(f => f.id), backoffGroupFailed: r1.failed.map(f => f.id), maxProgress: maxP, groupLoaded: G.assets.groupLoaded('accept_tmp') };
      // 3 · the network returns: the item loads (no page refresh), the recovery is announced, the group becomes loaded
      blocked = false; const rec0 = count('assets:recovered');
      await G.assets.retryFailed({ force: true });
      out.recovered = { model: !!G.assets.model('dhari'), events: count('assets:recovered') - rec0, failed: G.assets.failed.length };
      const r3 = await G.assets.loadGroup('accept_tmp'); out.recovered.groupLoaded = G.assets.groupLoaded('accept_tmp'); out.recovered.groupFailed = r3.failed.length;
      // 4 · the natural next beat start rebuilds the level: the stand-in hero becomes the real one (restart is cold at the boundary)
      const bs = G.sys.director.chapters[0].beats, first = bs[bs.findIndex(b => b.id === G.state.beat) + 1].id, resets0 = count('beat:reset');
      const ok = await settle(() => G.state.beat === first && G.state.mode === 'play', { bot: true, ms: 120000 }); await hs.step(30);
      out.swap = { reachedNextBeat: ok, beat: G.state.beat, skinned: skinned(), coldRestart: count('beat:reset') - resets0, colliders: G.world.props.colliders.length, errors: hs.errors.length };
    } catch (e) { out.exception = String(e && e.stack || e).split('\n').slice(0, 3).join(' | '); }
    finally { window.fetch = realFetch; delete G.assets.manifest.groups.accept_tmp; }
    if (out.exception) rec('F19', false, JSON.stringify(out)); else rec('F19', out.standIn.skinned === 0 && !out.standIn.model && out.standIn.failed.length >= 1 && out.standIn.standIns.includes('dhari') && !out.standIn.commonLoaded
      && out.retry.tries[1] === out.retry.tries[0] && out.retry.tries[2] === out.retry.tries[0] + 1 && out.retry.groupFailed.includes('dhari') && out.retry.maxProgress < 1 && !out.retry.groupLoaded
      && out.recovered.model && out.recovered.events >= 1 && out.recovered.failed === 0 && out.recovered.groupLoaded && out.recovered.groupFailed === 0
      && out.swap.reachedNextBeat && out.swap.skinned > 0 && out.swap.coldRestart >= 1 && out.swap.colliders > 0 && out.swap.errors === 0, JSON.stringify(out));
  }

  // ------------------------------------------------------------------------------------------ F17 + F16 (save logic on a fake store)
  {
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const mem = new Map(); let block = false, sets = 0;
    const fake = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { sets++; if (block) throw new DOMException('quota', 'QuotaExceededError'); mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => fake });
    const log = []; const Gs = { events: { emit: (n, d) => log.push([n, d]) } };
    try {
      const stored = { v: 1, id: 'x', chapter: 3, beat: 'c3_wolves', flags: { ration: 'child' }, cp: null, done: false, unlocked: 3, settings: {}, stats: {} };
      mem.set(KEY, JSON.stringify(stored)); block = true;
      const s = createSave(Gs); s.load();
      const noProbe = sets === 0, setsAtConstruction = sets, readable = s.hasProgress && s.data.chapter === 3 && s.data.beat === 'c3_wolves' && s.data.flags.ration === 'child';
      s.data.beat = 'c3_alpha';
      const r1 = s.commit(), r2 = s.commit();
      const fails = log.filter(l => l[0] === 'save:failed').map(l => l[1].first), oks1 = log.filter(l => l[0] === 'save:committed').length;
      const diskOld = JSON.parse(mem.get(KEY)).beat;
      block = false; const r3 = s.commit();
      const oks2 = log.filter(l => l[0] === 'save:committed').length, diskNew = JSON.parse(mem.get(KEY)).beat;
      block = true; const r4 = s.commit(); const fails2 = log.filter(l => l[0] === 'save:failed').map(l => l[1].first);
      rec('F17', noProbe && readable && r1 === false && r2 === false && fails[0] === true && fails[1] === false && oks1 === 0 && diskOld === 'c3_wolves' && r3 === true && oks2 === 1 && diskNew === 'c3_alpha' && r4 === false && fails2[2] === true,
        JSON.stringify({ setItemCallsAtConstruction: setsAtConstruction, readableWhenWritesBlocked: readable, commitResults: [r1, r2, r3, r4], failedFirstFlags: fails2, committedWhileBlocked: oks1, diskDuringBlock: diskOld, diskAfterRetry: diskNew }));

      // F16: "finished once" is not "a journey to resume"
      block = false; mem.clear(); log.length = 0;
      const t = createSave(Gs); t.load();
      t.data.unlocked = 5; t.data.chapter = 5; t.data.beat = null; t.data.done = true; t.data.finished = true;
      const afterEnd = { hasProgress: t.hasProgress, finished: t.finished };
      t.data.beat = 'c5_words'; t.data.done = false;                 // what runBeat does when a chapter is re-entered after the ending
      const replay = { hasProgress: t.hasProgress, finished: t.finished };
      t.commit(); const u = createSave(Gs); u.load();
      const reloaded = { hasProgress: u.hasProgress, beat: u.data.beat, finished: u.finished, unlocked: u.data.unlocked };
      u.reset(); const reset = { hasProgress: u.hasProgress, finished: u.finished, unlocked: u.data.unlocked, beat: u.data.beat };
      mem.set(KEY, JSON.stringify({ v: 1, chapter: 5, beat: null, done: true, unlocked: 5 })); const w = createSave(Gs); w.load();   // a save written before `finished` existed
      const legacy = { hasProgress: w.hasProgress, finished: w.finished };
      rec('F16', !afterEnd.hasProgress && afterEnd.finished && replay.hasProgress && replay.finished && reloaded.hasProgress && reloaded.beat === 'c5_words' && reloaded.finished && reloaded.unlocked === 5
        && !reset.hasProgress && reset.finished && reset.unlocked === 5 && !legacy.hasProgress && legacy.finished, JSON.stringify({ afterEnd, replay, reloaded, reset, legacy }));
    } finally { if (desc) Object.defineProperty(window, 'localStorage', desc); else delete window.localStorage; }
  }

  // ------------------------------------------------------------------------------------------ C02 (hold-to-confirm while paused / menu open)
  {
    const fast0 = G.state.fastText; G.state.fastText = false;
    const picked = []; const off = G.events.on('ui:choice', e => picked.push(e.index));
    const dlg = G.ui.dialogue;
    const open = () => { dlg.choices('؟', [{ label: 'أ', confirm: true }, { label: 'ب', confirm: true }]); };
    const btn = () => document.querySelector('.choices .opt.confirm');
    const fire = (el, type) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, button: 0, buttons: type === 'pointerdown' ? 1 : 0 }));
    const prog = () => +btn().style.getPropertyValue('--p') || 0;
    const out = {};
    open(); await hs.step(60);                                             // 1 s: the input lock is over
    fire(btn(), 'pointerdown'); await hs.step(15); out.p0 = prog();         // 0.25 s into the 0.5 s hold
    G.setPaused(true); G.ui.menus.showPause(true);                          // «استراحة» with the button still down
    await hs.step(180);                                                    // 3 s ≫ hold time
    out.pausedPicked = picked.length; out.pausedP = prog(); out.pausedScale = G.time.scale;
    fire(btn(), 'pointerup'); G.ui.menus.showPause(false); await hs.step(5);
    // variant: a menu is open but time still runs (settings panel over the choice)
    fire(btn(), 'pointerdown'); await hs.step(10);
    G.ui.menus.showPause(true); G.setPaused(false);                         // menu on screen, sim running
    await hs.step(120); out.menuPicked = picked.length; out.menuOpen = G.ui.menus.open;
    fire(btn(), 'pointerup'); G.ui.menus.showPause(false); await hs.step(5);
    // control: an uninterrupted hold still chooses
    fire(btn(), 'pointerdown'); await hs.step(40); out.freshPicked = picked.length;
    dlg.hideChoices(); off(); G.state.fastText = fast0;
    rec('C02', out.p0 > 0 && out.pausedPicked === 0 && out.pausedP === 0 && out.pausedScale === 0 && out.menuPicked === 0 && out.menuOpen && out.freshPicked === 1, JSON.stringify(out));
  }

  // ------------------------------------------------------------------------------------------ F01 (title backdrop unloads the level)
  {
    hs.chapter(1, 'c1_well');
    const ok1 = await settle(() => G.state.mode === 'play' && G.state.beat === 'c1_well'); await hs.step(30);
    const before = { col: G.world.props.colliders.length, level: !!G.world.level.current, scene: G.scene.children.length };
    G.sys.director.stop(); G.setMode('title'); G.world.level.unload();      // = quit to the title; main.js titleScene unloads the level on entering 'title'
    const mid = { col: G.world.props.colliders.length, level: !!G.world.level.current };
    G.sys.director.startChapter(1, 'c1_well');                              // = «أكمل الرحلة»
    const ok2 = await settle(() => G.state.mode === 'play' && G.state.beat === 'c1_well'); await hs.step(30);
    const after = { col: G.world.props.colliders.length, level: !!G.world.level.current, scene: G.scene.children.length, dirLevel: !!G.sys.director.level };
    rec('F01', ok1 && ok2 && before.col > 0 && mid.col === 0 && after.col === before.col && after.level && after.dirLevel && after.scene === before.scene, JSON.stringify({ before, unloaded: mid, after }));
  }

  // ------------------------------------------------------------------------------------------ F24 (a superseded fail transition never touches a newer beat)
  {
    const cards = G.ui.cards; const show = cards.show; let shown = 0;
    cards.show = function (c) { shown++; return show.call(this, c); };
    const fadeEl = document.querySelector('.fade'), cardEl = document.querySelector('.card');
    const cardUp = () => !cardEl.classList.contains('hidden') && cardEl.classList.contains('on');
    const fadeOp = () => (fadeEl.style.display === 'none' ? 0 : +fadeEl.style.opacity || 0);
    const out = {};
    // control: an uninterrupted failure still shows its card and restarts the beat cold
    shown = 0; const f0 = count('beat:fail'), r0 = count('beat:reset');
    G.sys.director.failAndRestart('fail.thirst.self').catch(() => {});
    await settle(() => count('beat:reset') > r0 && G.state.mode === 'play'); await hs.step(120);
    out.control = { fails: count('beat:fail') - f0, cardShown: shown, restarted: count('beat:reset') - r0, cardUpAfter: cardUp(), fade: fadeOp(), failLock: G.input.locked ? G.input.locked('fail') : null };
    // the case of the audit: fail, quit to the title at once, continue → the old transition must stay dead
    shown = 0; const f1 = count('beat:fail');
    G.sys.director.failAndRestart('fail.thirst.self').catch(() => {});
    await hs.step(1);                                                      // the transition is mid-flight
    G.sys.director.stop(); G.setMode('title');                             // quit
    out.atTitle = { fade: fadeOp(), cardUp: cardUp() };
    G.sys.director.startChapter(1, 'c1_well');                             // continue (quickly)
    await settle(() => G.state.mode === 'play' && G.state.beat === 'c1_well');
    let cardSeen = false, maxFadeAfter = 0;
    for (let i = 0; i < 360; i++) { await hs.step(1); if (cardUp()) cardSeen = true; if (i > 150) maxFadeAfter = Math.max(maxFadeAfter, fadeOp()); }
    out.interrupted = { fails: count('beat:fail') - f1, cardShown: shown, cardSeenOverNewBeat: cardSeen, fadeLate: maxFadeAfter, mode: G.state.mode };
    // a second failure while one transition runs: only the newest one owns the UI
    shown = 0;
    G.sys.director.failAndRestart('fail.thirst.self').catch(() => {});
    await hs.step(2);
    G.sys.director.startChapter(1, 'c1_well');
    await settle(() => G.state.mode === 'play' && G.state.beat === 'c1_well'); await hs.step(200);
    out.chapterJump = { cardShown: shown, cardUp: cardUp(), fade: fadeOp() };
    cards.show = show;
    rec('F24', out.control.fails === 1 && out.control.cardShown === 1 && out.control.restarted === 1 && !out.control.cardUpAfter && out.control.fade === 0
      && out.atTitle.fade === 0 && !out.atTitle.cardUp && out.interrupted.fails === 1 && out.interrupted.cardShown === 0 && !out.interrupted.cardSeenOverNewBeat && out.interrupted.fadeLate === 0 && out.interrupted.mode === 'play'
      && out.chapterJump.cardShown === 0 && !out.chapterJump.cardUp && out.chapterJump.fade === 0, JSON.stringify(out));
  }

  return { items };
}
