#!/usr/bin/env node
// Acceptance check of group "state" (F01 F15 F16 F17 F19 F24 C02) on the REAL page (/?dev=1, real time, trusted input).
//   node tools/build.mjs --dev --harness && node tools/accept_state.cjs [--only F01,F19]
// Prints one JSON line { items: { F01: { pass, detail }, … } }; exit 0 only if every item passes.
// Needs the dev build (window.__G is exposed by main.js under ?dev=1 in development builds only).
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const only = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1].split(',') : null; })();
const items = {};
const rec = (id, pass, detail) => { items[id] = { pass: !!pass, detail }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now(); const dbg = (...a) => { if (process.env.DEBUG) console.error(((Date.now() - T0) / 1000).toFixed(1), ...a); };
const URL = '/?dev=1&q=low';
const SAVE_KEY = 'hs1899.save.v1';
const seed = (o) => ({ v: 1, id: 'acceptstate', chapter: 1, beat: null, flags: {}, cp: null, stats: { started: 1, playSeconds: 0, retries: 0 }, done: false, unlocked: 1, settings: { quality: 'low', master: 0.9, music: 0.7, sfx: 1, voice: 1, sens: 1, invertY: false, firasaToggle: false, textScale: 1, haptics: true }, ...o });

let base, browser;
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'ar-SA' };
const DESKTOP = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, locale: 'ar-SA' };

async function newPage(opts = PHONE, { blockWrites = false, pre = null } = {}) {
  const ctx = await browser.newContext(opts);
  // window.name survives reloads: 'blk' = every Storage.setItem throws QuotaExceededError (reads keep working)
  await ctx.addInitScript(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (window.name === 'blk') throw new DOMException('quota', 'QuotaExceededError'); return real.call(this, k, v); };
  });
  const page = await ctx.newPage(); page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e && e.message || e).slice(0, 200)));
  if (pre) await pre(page);                                          // e.g. block a request before the title backdrop starts preloading
  await page.goto(base + URL);
  if (blockWrites) await page.evaluate(() => { window.name = 'blk'; });
  await page.waitForFunction(() => window.__G && window.__G.state.mode === 'title', null, { timeout: 120000 });
  page.ctx = ctx; return page;
}
/** write a save into localStorage and reload (the page boots from it) */
async function reloadWith(page, save, { block = false } = {}) {
  await page.evaluate(([k, v]) => { window.name = ''; if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); }, [SAVE_KEY, save]);
  if (block) await page.evaluate(() => { window.name = 'blk'; });
  await page.reload();
  await page.waitForFunction(() => window.__G && window.__G.state.mode === 'title', null, { timeout: 120000 });
}
const raw = page => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, SAVE_KEY);
/** a real tap on the visible button whose text matches (scoped to a CSS selector) */
async function tap(page, scope, text, how = 'touch') {
  const loc = page.locator(`${scope} button`, { hasText: text }).first();
  await loc.waitFor({ state: 'visible', timeout: 20000 });
  await sleep(350);                                                  // menu fade-in
  const b = await loc.boundingBox();
  if (how === 'touch') await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
const waitPlay = (page, beat) => page.waitForFunction(b => window.__G.state.mode === 'play' && (!b || window.__G.state.beat === b), beat || null, { timeout: 150000 });
const startAt = (page, chapter, beat) => page.evaluate(([c, b]) => { window.__G.ui.menus.hideAll(); window.__G.events.emit('ui:start', { chapter: c, beat: b }); }, [chapter, beat]);   // (what the chapter menu does)
const titleButtons = page => page.evaluate(() => [...document.querySelectorAll('.menu[data-id="title"] button')].map(b => b.textContent.trim()));
const levelSnap = page => page.evaluate(() => { const G = window.__G, e = G.sys.interact.entries; return { col: G.world.props.colliders.length, level: !!G.world.level.current, ents: e ? (e.length !== undefined ? e.length : e.size) : -1, obj: G.sys.objectives.current ? G.sys.objectives.current.key : null, beat: G.state.beat, mode: G.state.mode }; });
async function pauseToTitle(page) {
  await page.keyboard.press('Escape');
  await tap(page, '.menu[data-id="pause"]', 'القائمة الرئيسية');
  await page.waitForFunction(() => window.__G.state.mode === 'title', null, { timeout: 20000 });
}

// ------------------------------------------------------------------------------------------------ F01
async function F01() {
  const page = await newPage(); const out = [];
  for (const [ch, beat] of [[1, 'c1_well'], [3, 'c3_wolves']]) {
    await startAt(page, ch, beat); await waitPlay(page, beat); await sleep(2500);
    const before = await levelSnap(page);
    await pauseToTitle(page);
    const atTitle = await levelSnap(page);
    await tap(page, '.menu[data-id="title"]', 'أكمل الرحلة');
    await waitPlay(page, beat); await sleep(2500);
    const after = await levelSnap(page);
    out.push({ scene: beat, before, atTitle: { col: atTitle.col, level: atTitle.level }, after });
  }
  const ok = out.every(o => o.before.col > 0 && o.after.col === o.before.col && o.after.level && o.after.ents === o.before.ents && o.after.obj === o.before.obj);
  rec('F01', ok && !page.errs.length, JSON.stringify(out) + (page.errs.length ? ' errs=' + page.errs : '')); await page.ctx.close();
}

// ------------------------------------------------------------------------------------------------ F15
async function F15() {
  const page = await newPage();
  // no progress → no question
  const b0 = await titleButtons(page);
  await tap(page, '.menu[data-id="title"]', 'ابدأ الرحلة');
  await page.waitForFunction(() => window.__G.state.mode !== 'title', null, { timeout: 30000 });
  const noProgressStarted = true;
  await page.ctx.close();

  const p = await newPage();
  await reloadWith(p, seed({ chapter: 3, beat: 'c3_wolves', unlocked: 4, flags: { ration: 'child' } }));
  const b1 = await titleButtons(p);
  await tap(p, '.menu[data-id="title"]', 'ابدأ الرحلة');
  await sleep(600);
  const dlg = await p.evaluate(() => { const m = document.querySelector('.menu[data-id="confirm"]'); return { on: !!m && m.classList.contains('on'), text: m ? m.textContent : '', mode: window.__G.state.mode, chapter: window.__G.save.data.chapter, t1: window.__G.t('ui.ch.3'), unl: window.__G.t('ui.newJourney.unlocked') }; });
  const disk1 = await raw(p);
  // «back» keeps everything
  if (dlg.on) await tap(p, '.menu[data-id="confirm"]', 'ارجع إلى رحلتي');
  await sleep(500);
  const kept = await p.evaluate(() => ({ title: document.querySelector('.menu[data-id="title"]').classList.contains('on'), confirm: !!document.querySelector('.menu[data-id="confirm"]') && document.querySelector('.menu[data-id="confirm"]').classList.contains('on'), chapter: window.__G.save.data.chapter }));
  // «start over» replaces the journey, keeps the unlocked chapters
  if (!dlg.on) { rec('F15', false, JSON.stringify({ confirmShown: false, modeAfterTap: dlg.mode, chapterAfterTap: dlg.chapter, diskAfterTap: disk1 && { chapter: disk1.chapter, beat: disk1.beat, unlocked: disk1.unlocked }, note: 'start replaced the journey immediately' })); await p.ctx.close(); return; }
  await tap(p, '.menu[data-id="title"]', 'ابدأ الرحلة');
  await tap(p, '.menu[data-id="confirm"]', 'ابدأ من جديد');
  await p.waitForFunction(() => window.__G.state.chapter === 1, null, { timeout: 30000 });
  await sleep(500);
  const after = await raw(p);
  const pass = noProgressStarted && dlg.on && dlg.mode === 'title' && dlg.chapter === 3 && disk1.chapter === 3 && disk1.beat === 'c3_wolves'
    && dlg.text.includes(dlg.t1) && dlg.text.includes(dlg.unl) && kept.title && !kept.confirm && kept.chapter === 3
    && after.chapter === 1 && after.beat !== 'c3_wolves' && after.unlocked === 4;
  rec('F15', pass, JSON.stringify({ freshButtons: b0, buttons: b1, confirm: { on: dlg.on, mode: dlg.mode, chapterBefore: dlg.chapter, diskBefore: disk1 && disk1.chapter, text: dlg.text.slice(0, 120) }, back: kept, after: after && { chapter: after.chapter, beat: after.beat, unlocked: after.unlocked } }));
  await p.ctx.close();
}

// ------------------------------------------------------------------------------------------------ F16
async function F16() {
  const page = await newPage();
  await reloadWith(page, seed({ chapter: 5, beat: null, done: true, finished: true, unlocked: 5, flags: { ration: 'child' } }));
  const b0 = await titleButtons(page);
  await tap(page, '.menu[data-id="title"]', 'الفصول');
  await sleep(500);
  const cb = await page.locator('.menu[data-id="chapters"] .ch').nth(4).boundingBox();
  await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);                // chapter 5 (unlocked after the ending)
  await waitPlay(page); await sleep(2500);
  const mid = await raw(page);
  await reloadWith(page, mid);                                      // = a plain page refresh with whatever the game saved
  const b1 = await titleButtons(page);
  const hasCont = b1.some(t => t.includes('أكمل الرحلة'));
  let resumed = null;
  if (hasCont) { await tap(page, '.menu[data-id="title"]', 'أكمل الرحلة'); await waitPlay(page); resumed = await page.evaluate(() => ({ chapter: window.__G.state.chapter, beat: window.__G.state.beat })); }
  const disk = await raw(page);
  const pass = !b0.some(t => t.includes('أكمل الرحلة')) && mid.chapter === 5 && !!mid.beat && hasCont && resumed && resumed.chapter === 5 && resumed.beat === mid.beat
    && (disk.finished === true) && disk.unlocked === 5;
  rec('F16', pass, JSON.stringify({ titleAfterEnd: b0, savedBeat: mid && mid.beat, titleAfterReplay: b1, resumed, finished: disk && disk.finished, unlocked: disk && disk.unlocked, done: disk && disk.done }));
  await page.ctx.close();
}

// ------------------------------------------------------------------------------------------------ F17
async function F17() {
  const page = await newPage();
  const sv = seed({ chapter: 3, beat: 'c3_wolves', unlocked: 3, flags: { ration: 'self' } });
  await reloadWith(page, sv, { block: true });                       // writes throw from now on; the stored save is readable
  const b0 = await titleButtons(page);
  const hasCont = b0.some(t => t.includes('أكمل الرحلة'));
  await page.evaluate(() => { const G = window.__G; window.__ev = { ok: 0, fail: 0, first: [] }; G.events.on('save:committed', () => { window.__ev.ok++; }); G.events.on('save:failed', e => { window.__ev.fail++; window.__ev.first.push(!!e.first); }); });
  let during = null, toast = '', diskDuring = null;
  {
    if (hasCont) await tap(page, '.menu[data-id="title"]', 'أكمل الرحلة'); else await startAt(page, 3, 'c3_wolves');   // (no Continue: measure the write path anyway)
    await waitPlay(page, 'c3_wolves'); await sleep(1500);
    during = await page.evaluate(() => ({ ev: window.__ev, mem: window.__G.save.data.beat }));
    toast = await page.evaluate(() => [...document.querySelectorAll('.toast.on')].map(e => e.textContent).join('|'));
    diskDuring = await raw(page);
  }
  // writes work again; the next checkpoint (a new beat) must save for real
  await page.evaluate(() => { window.name = ''; });
  const next = await page.evaluate(() => window.__G.sys.director.chapters[2].beats[1].id);
  await startAt(page, 3, next); await waitPlay(page, next); await sleep(1200);
  const afterEv = await page.evaluate(() => window.__ev), diskAfter = await raw(page);
  const pass = hasCont && during && during.ev.fail >= 1 && during.ev.ok === 0 && during.ev.first[0] === true && /تعذّر حفظ/.test(toast)
    && diskDuring.beat === 'c3_wolves' && diskAfter.beat === next && afterEv.ok >= 1;
  rec('F17', pass, JSON.stringify({ continueShownWhenWritesBlocked: hasCont, duringBlock: during, notice: toast, diskDuring: diskDuring && diskDuring.beat, afterUnblock: afterEv, diskAfter: diskAfter && diskAfter.beat }));
  await page.ctx.close();
}

// ------------------------------------------------------------------------------------------------ F19
const blockHero = async page => { await page.route(/\/models\/dhari\.(glb|lod1\.bin)/, r => r.abort('failed')); };
const heroState = page => page.evaluate(() => { const G = window.__G, a = G.actors.player.actor; let skinned = 0; if (a) a.root.traverse(o => { if (o.isSkinnedMesh) skinned++; }); return { skinned, model: !!G.assets.model('dhari'), mode: G.state.mode, failed: (G.assets.failed || []).map(f => f.kind + ':' + f.id), standIns: G.assets.standIns || [] }; });
async function F19() {
  const out = {};
  // A: network down while entering the chapter → message + retry (not a full bar); network back → retry gives the real hero
  let page = await newPage(PHONE, { pre: blockHero });
  await startAt(page, 1, 'c1_well');
  const prob = await page.waitForFunction(() => { const p = document.querySelector('.loading .prob'); return (p && !p.classList.contains('hidden')) || window.__G.state.mode === 'play'; }, null, { timeout: 150000 }).then(() => page.evaluate(() => { const p = document.querySelector('.loading .prob'); return !!p && !p.classList.contains('hidden'); }), () => false);
  out.problemShown = prob; dbg('F19 A: problem', prob);
  if (!prob) { await sleep(1500); out.noProblem = await heroState(page); out.noProblem.loadingBarHidden = await page.evaluate(() => document.querySelector('.loading').classList.contains('hidden')); }
  if (prob) {
    out.A1 = await page.evaluate(() => ({ mode: window.__G.state.mode, text: document.querySelector('.loading .prob').textContent, barHidden: document.querySelector('.loading .bar').classList.contains('hidden'), loadingHidden: document.querySelector('.loading').classList.contains('hidden') }));
    dbg('F19 A: tap retry (offline)');
    await tap(page, '.loading .prob', 'أعد المحاولة');                    // still offline: stays on the message
    await page.waitForFunction(() => { const p = document.querySelector('.loading .prob'); return p && !p.classList.contains('hidden') && window.__G.assets.failed.some(f => f.id === 'dhari' && f.tries >= 2); }, null, { timeout: 60000 }).catch(() => {});
    out.A2 = await heroState(page);
    dbg('F19 A: online again');
    await page.unroute(/\/models\/dhari\.(glb|lod1\.bin)/);
    await tap(page, '.loading .prob', 'أعد المحاولة');
    await waitPlay(page, 'c1_well'); await sleep(800); dbg('F19 A: playing');
    out.A3 = await heroState(page);
  }
  dbg('F19 A done');
  const passA = prob && out.A1.mode === 'loading' && out.A1.barHidden && !out.A1.loadingHidden && /تعذّر تحميل/.test(out.A1.text) && out.A2.mode === 'loading' && out.A2.skinned === 0
    && out.A3 && out.A3.mode === 'play' && out.A3.model && out.A3.skinned > 0 && out.A3.failed.length === 0;
  await page.ctx.close();

  // B: go on with the stand-in; network returns later → «as soon as it arrives» the stand-in is rebuilt (at the latest at the next beat start)
  page = await newPage(PHONE, { pre: blockHero });
  await startAt(page, 1, 'c1_well');
  const prob2 = prob && await page.waitForFunction(() => { const p = document.querySelector('.loading .prob'); return p && !p.classList.contains('hidden'); }, null, { timeout: 150000 }).then(() => true, () => false);
  if (prob2) {
    dbg('F19 B: skip');
    await tap(page, '.loading .prob', 'تابع بشخصيات بديلة');
    await waitPlay(page, 'c1_well'); await sleep(1500);
    out.B1 = await heroState(page);
    out.B1.toast = await page.evaluate(() => [...document.querySelectorAll('.toast.on')].map(e => e.textContent).join('|'));
    dbg('F19 B: standin playing');
    await page.unroute(/\/models\/dhari\.(glb|lod1\.bin)/);
    await page.evaluate(() => { window.__rec = 0; window.__G.events.on('assets:recovered', () => { window.__rec++; }); return window.__G.assets.retryFailed({ force: true }); });   // = the network came back (or `online`)
    out.B2 = await heroState(page); out.B2.recovered = await page.evaluate(() => window.__rec);
    dbg('F19 B: recovered; restartBeat');
    await page.evaluate(() => { window.__G.sys.director.restartBeat(); });                                       // a beat start
    await waitPlay(page, 'c1_well'); await sleep(1500);
    out.B3 = await heroState(page);
  }
  const passB = prob2 && out.B1.skinned === 0 && /بديلة/.test(out.B1.toast) && out.B2.model && out.B2.recovered >= 1 && out.B3.skinned > 0 && out.B3.failed.length === 0;
  rec('F19', passA && passB && !page.errs.length, JSON.stringify(out) + (page.errs.length ? ' errs=' + page.errs : ''));
  await page.ctx.close();
}

// ------------------------------------------------------------------------------------------------ F24
async function F24() {
  const page = await newPage();
  await startAt(page, 1, 'c1_well'); await waitPlay(page, 'c1_well'); await sleep(1500);
  await page.evaluate(() => { const G = window.__G; window.__fails = 0; window.__cardsShown = 0; G.events.on('beat:fail', () => { window.__fails++; }); const sh = G.ui.cards.show; G.ui.cards.show = function (c) { window.__cardsShown++; return sh.call(this, c); }; });
  // fail, then quit to the title and continue while the fail transition is still running (it is frozen by the pause)
  await page.evaluate(() => { window.__G.sys.director.failAndRestart('fail.thirst.self').catch(() => {}); });
  await page.keyboard.press('Escape');
  await tap(page, '.menu[data-id="pause"]', 'القائمة الرئيسية');
  await page.waitForFunction(() => window.__G.state.mode === 'title', null, { timeout: 20000 });
  await tap(page, '.menu[data-id="title"]', 'أكمل الرحلة');
  await waitPlay(page, 'c1_well');
  await page.evaluate(() => { window.__cardsAtPlay = window.__cardsShown; });
  const seen = [];                                                   // sampled over 6 s of SIM time (the headless renderer runs slowly)
  const simT0 = await page.evaluate(() => window.__G.time.now); const tw = Date.now();
  while (Date.now() - tw < 150000) {
    const o = await page.evaluate(() => { const c = document.querySelector('.card'); const f = document.querySelector('.fade'); return { sim: window.__G.time.now, card: !c.classList.contains('hidden') && c.classList.contains('on'), fade: f.style.display === 'none' ? 0 : +f.style.opacity || 0 }; });
    seen.push(o); if (o.sim - simT0 > 6) break; await sleep(120);
  }
  const fin = await page.evaluate(() => ({ fails: window.__fails, shown: window.__cardsShown, atPlay: window.__cardsAtPlay, mode: window.__G.state.mode }));
  const cardSeen = seen.some(s => s.card), lastFade = seen[seen.length - 1].fade;
  rec('F24', fin.fails === 1 && fin.shown === fin.atPlay && !cardSeen && lastFade === 0 && fin.mode === 'play' && !page.errs.length,
    JSON.stringify({ ...fin, cardVisibleOverNewBeat: cardSeen, fadeAtEnd: lastFade, samples: seen.length, simSeconds: +(seen[seen.length - 1].sim - simT0).toFixed(1) }) + (page.errs.length ? ' errs=' + page.errs : ''));
  await page.ctx.close();
}

// ------------------------------------------------------------------------------------------------ C02
async function C02() {
  const page = await newPage(DESKTOP);
  await startAt(page, 2, 'c2_ration'); await waitPlay(page, 'c2_ration'); await sleep(1200);
  // a real hold-to-confirm choice (the director's own d.choice, same options as the story's «single sip»)
  await page.evaluate(() => {
    const G = window.__G; window.__c = { picked: 0, pausedAtPick: null }; G.events.on('ui:choice', () => { window.__c.picked++; window.__c.pausedAtPick = G.time.scale === 0; });
    G.sys.director.d.choice('c2_ration.ask', [{ key: 'c2_ration.choice.self', value: 'self', confirm: true }, { key: 'c2_ration.choice.child', value: 'child', confirm: true }]).catch(() => {});
  });
  await page.waitForFunction(() => window.__G.ui.dialogue.choosing, null, { timeout: 20000 });
  await page.waitForFunction(() => { const b = document.querySelector('.choices .opt.confirm'); return b && !b.classList.contains('lock'); }, null, { timeout: 60000 });   // the 0.7 s input lock
  await sleep(600);                                                   // the choices panel finishes sliding in
  const btn = page.locator('.choices .opt.confirm').first(); const b = await btn.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.waitForFunction(() => +document.querySelector('.choices .opt.confirm').style.getPropertyValue('--p') >= 0.2, null, { timeout: 30000 }).catch(() => {});   // a part of the 0.5 s hold
  await page.keyboard.press('Escape');                                // the pause menu opens, the mouse button stays down
  await page.waitForFunction(() => window.__G.time.scale === 0, null, { timeout: 5000 });
  await page.waitForFunction(() => window.__c.picked >= 1, null, { timeout: 15000 }).catch(() => {});   // far longer than the hold time (the headless loop runs at ~2 fps): a hold that kept counting would have fired
  const paused = await page.evaluate(() => ({ picked: window.__c.picked, scale: window.__G.time.scale, p: getComputedStyle(document.querySelector('.choices .opt.confirm')).getPropertyValue('--p') }));
  if (paused.picked > 0) { rec('C02', false, JSON.stringify({ whilePaused: paused, note: 'the choice fired while paused (ui:choice emitted with time.scale 0)' })); await page.ctx.close(); return; }
  await page.mouse.up();
  await sleep(300);
  const afterUp = await page.evaluate(() => window.__c.picked);
  // resume, then a fresh complete hold still works (control)
  await tap(page, '.menu[data-id="pause"]', 'أكمل', 'mouse');
  await page.waitForFunction(() => window.__G.time.scale === 1, null, { timeout: 5000 });
  await sleep(300);
  const b2 = await btn.boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.mouse.down(); await page.waitForFunction(() => window.__c.picked >= 1, null, { timeout: 30000 }).catch(() => {}); await page.mouse.up(); await sleep(400);
  const fin = await page.evaluate(() => ({ picked: window.__c.picked, pausedAtPick: window.__c.pausedAtPick }));
  rec('C02', paused.picked === 0 && paused.scale === 0 && afterUp === 0 && fin.picked === 1 && fin.pausedAtPick === false && !page.errs.length,
    JSON.stringify({ whilePaused: paused, afterRelease: afterUp, freshHold: fin }) + (page.errs.length ? ' errs=' + page.errs : ''));
  await page.ctx.close();
}

(async () => {
  const { createServer } = await import(path.join(__dirname, 'serve.mjs'));
  const server = createServer(); await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const all = { F01, F15, F16, F17, F19, F24, C02 };
  for (const [id, fn] of Object.entries(all)) {
    if (only && !only.includes(id)) continue;
    try { await fn(); } catch (e) { rec(id, false, 'exception: ' + String(e && e.message || e).split('\n')[0]); }
  }
  await browser.close(); server.close();
  console.log(JSON.stringify({ items }));
  process.exit(Object.values(items).every(i => i.pass) ? 0 : 1);
})();
