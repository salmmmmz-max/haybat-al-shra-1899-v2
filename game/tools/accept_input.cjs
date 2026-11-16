#!/usr/bin/env node
// Acceptance checks for the input & UI group (F11 F12 F13 F14 F26 F27) on the REAL page "/?test=1" with trusted input
// (Playwright mouse / keyboard / touchscreen and CDP Input.dispatchTouchEvent). Needs a dev build:  node tools/build.mjs --dev
//   node tools/accept_input.cjs [--only F11,F14] [--verbose]
// Prints ONE JSON line { items: { F11: { pass, detail }, ... } } on stdout; exit 0 only if every item passes. Diagnostics -> stderr.
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const verbose = argv.includes('--verbose');
const log = (...a) => { if (verbose) console.error(...a); };
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const items = {};
const rec = (id, pass, detail) => { items[id] = { pass: !!pass, detail }; log(id, pass ? 'PASS' : 'FAIL', JSON.stringify(detail)); };

let browser, server, base;
const bad = [];

/** kind: desk (no touch) · hybrid (touch + mouse, desktop UA) · phone (844x390) · portrait (390x844, stage rotated) */
async function openPage(kind) {
  const o = {
    desk: { viewport: { width: 1280, height: 720 }, hasTouch: false },
    hybrid: { viewport: { width: 1280, height: 720 }, hasTouch: true },
    phone: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: UA_PHONE, deviceScaleFactor: 2 },
    portrait: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: UA_PHONE, deviceScaleFactor: 2 },
  }[kind];
  const ctx = await browser.newContext({ locale: 'ar-SA', ...o });
  const page = await ctx.newPage();
  page.on('pageerror', e => bad.push(kind + ' pageerror: ' + String(e && e.stack || e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !/WebSocket|\/ws|426/.test(m.text())) bad.push(kind + ' console: ' + m.text().slice(0, 200)); });
  await page.goto(base + '/?test=1', { waitUntil: 'load' });
  await page.waitForFunction('window.__hs && window.__hs.G', null, { timeout: 90000 });
  page.cdp = await ctx.newCDPSession(page);
  page.kind = kind;
  return page;
}

/** chapter 1 / c1_wake: wait for 'play' (or walk the bot to the grandfather's 'dialogue'), then run the loop in real time */
async function startPlay(page, toDialogue) {
  const r = await page.evaluate(async toDlg => {
    const G = __hs.G; G.state.fastText = false; G.loop.render = false; G.ui.menus.hideAll();
    await __hs.chapter(1, 'c1_wake');
    let i = 0;
    for (; i < 8000; i++) {
      if (G.state.mode === 'loading') await new Promise(r => setTimeout(r, 25));
      if (toDlg) { if (G.state.mode === 'dialogue') break; __hs.bot.tick(1 / 60); } else if (G.state.mode === 'play') break;
      G.loop.tick(1 / 60); await null; if (i % 200 === 199) await new Promise(r => setTimeout(r, 0));
    }
    G.input.feed({ move: { x: 0, y: 0 }, hold: [] });
    for (let k = 0; k < 20; k++) { G.loop.tick(1 / 60); await null; }
    window.__pump = setInterval(() => { G.loop.render = false; G.loop.tick(1 / 60); }, 16);
    return { mode: G.state.mode, steps: i };
  }, !!toDialogue);
  await sleep(150);
  return r;
}
const G = (page, fn, arg) => page.evaluate(`(${fn.toString()})(__hs.G, ${JSON.stringify(arg === undefined ? null : arg)})`);

// ---------------------------------------------------------------- input helpers
async function touch(page, type, pts) { await page.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id })) }); }
/** one finger from (x0,y0) to (x1,y1) in n steps; `during()` runs at the end point before the finger lifts */
async function drag(page, x0, y0, x1, y1, n = 12, during) {
  await touch(page, 'touchStart', [[x0, y0]]); await sleep(40);
  for (let i = 1; i <= n; i++) { await touch(page, 'touchMove', [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]]); await sleep(16); }
  await sleep(60); const v = during ? await during() : undefined;
  await touch(page, 'touchEnd', []); await sleep(60); return v;
}
async function mdrag(page, x0, y0, x1, y1, n = 12) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= n; i++) { await page.mouse.move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await sleep(16); }
  await sleep(60); await page.mouse.up(); await sleep(60);
}
const center = async (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, sel);
const hit = (page, x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.className && e.className.baseVal === undefined ? e.className : e.tagName) + '|' + (e.closest('.tb') ? e.closest('.tb').className : '') : null; }, [x, y]);
const yawOf = page => G(page, g => g.actors.cam.yaw);
const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const textTap = async (page, re) => {
  const p = await page.evaluate(src => { const rx = new RegExp(src); const el = [...document.querySelectorAll('#ui button')].find(b => rx.test(b.textContent) && b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden' && b.closest('.menu.on')); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, re);
  if (!p) return false; await page.touchscreen.tap(p.x, p.y); await sleep(120); return true;
};
const menuState = page => G(page, g => ({ mode: g.state.mode, scale: g.time.scale, pauseOpen: g.ui.menus.pauseOpen, settingsOpen: g.ui.menus.settingsOpen, menuOpen: g.ui.menus.open, dlg: !g.ui.dialogue.el.classList.contains('hidden') }));

// ---------------------------------------------------------------- F11
async function f11() {
  const d = {};
  // 1) desktop, no touch hardware: real mouse drag over the world turns the camera
  let page = await openPage('desk'); d.maxTouchPoints = await page.evaluate('navigator.maxTouchPoints');
  const r0 = await startPlay(page); d.mode = r0.mode;
  d.touchActive = await G(page, g => g.ui.touch.active);
  let y0 = await yawOf(page); await mdrag(page, 640, 360, 840, 360); let y1 = await yawOf(page);
  d.deskYaw = +Math.abs(angD(y1, y0)).toFixed(3);
  let p0 = await G(page, g => g.actors.cam.pitch); await mdrag(page, 640, 300, 640, 420); d.deskPitch = +Math.abs(await G(page, g => g.actors.cam.pitch) - p0).toFixed(3);
  // buttons / menus stay excluded: a mouse drag that starts on the pause button must not look
  const pb = await center(page, '.tb.pause'); y0 = await yawOf(page);
  if (pb) await mdrag(page, pb.x, pb.y, pb.x + 200, pb.y + 30); d.dragFromPauseBtn = +Math.abs(angD(await yawOf(page), y0)).toFixed(3);
  // pause menu open: dragging over the panel must not turn the camera and the menu stays usable
  await page.mouse.click(pb.x, pb.y); await sleep(200); d.pauseByMouse = (await menuState(page)).pauseOpen; y0 = await yawOf(page);
  await mdrag(page, 500, 300, 700, 330); d.dragInMenu = +Math.abs(angD(await yawOf(page), y0)).toFixed(3);
  await G(page, g => g.ui.menus.showPause(false)); await sleep(100);
  const ok1 = d.deskYaw > 0.3 && d.deskPitch > 0.1 && d.dragFromPauseBtn < 0.01 && d.pauseByMouse && d.dragInMenu < 0.01;
  await page.context().close();
  // 2) hybrid (touch screen + mouse): both work, touch stick and look not broken
  page = await openPage('hybrid'); d.hybridTouchPoints = await page.evaluate('navigator.maxTouchPoints');
  await startPlay(page);
  y0 = await yawOf(page); await mdrag(page, 640, 360, 840, 360); d.hybridMouseYaw = +Math.abs(angD(await yawOf(page), y0)).toFixed(3);
  y0 = await yawOf(page); await drag(page, 900, 360, 1100, 360); d.hybridTouchYaw = +Math.abs(angD(await yawOf(page), y0)).toFixed(3);
  d.hybridStick = await drag(page, 200, 500, 200, 420, 8, () => G(page, g => +g.input.moveMag.toFixed(2)));
  await sleep(100); d.hybridStickAfter = await G(page, g => +g.input.moveMag.toFixed(2));
  const ok2 = d.hybridMouseYaw > 0.3 && d.hybridTouchYaw > 0.2 && d.hybridStick > 0.5 && d.hybridStickAfter === 0;
  await page.context().close();
  // 3) phone (touch only): look + stick unchanged
  page = await openPage('phone'); await startPlay(page);
  y0 = await yawOf(page); await drag(page, 600, 200, 780, 200); d.phoneTouchYaw = +Math.abs(angD(await yawOf(page), y0)).toFixed(3);
  d.phoneStick = await drag(page, 120, 300, 120, 240, 8, () => G(page, g => +g.input.moveMag.toFixed(2)));
  const ok3 = d.phoneTouchYaw > 0.2 && d.phoneStick > 0.5;
  await page.context().close();
  rec('F11', ok1 && ok2 && ok3, d);
}

// ---------------------------------------------------------------- F12
async function f12() {
  const d = {}; let ok = true;
  for (const kind of ['phone', 'portrait']) {
    const page = await openPage(kind); const k = {}; d[kind] = k;
    d[kind].rot = await page.evaluate("document.getElementById('stage').classList.contains('rot')");
    await startPlay(page, true);
    k.mode = (await menuState(page)).mode;
    const hasP = async () => { const c = await center(page, '.tb.pause'); if (!c || c.w < 20) return null; return c; };
    let pb = await hasP(); k.btnInDialogue = !!pb;
    if (pb) k.topElement = await hit(page, pb.x, pb.y);
    k.onTop = !!pb && /pause/.test(k.topElement || '');
    // a tap at the pause button must open the pause menu and NOT advance the dialogue
    const lineBefore = await G(page, g => g.ui.dialogue.el.querySelector('.text').textContent);
    if (pb) await page.touchscreen.tap(pb.x, pb.y); await sleep(250);
    let s = await menuState(page); k.pauseOpened = s.pauseOpen && s.scale === 0;
    // settings -> back -> resume (the dialogue must still be there)
    k.settingsOpened = await textTap(page, 'الإعدادات') && (await menuState(page)).settingsOpen;
    const back = await center(page, '.menu[data-id=settings] .hdr-back'); if (back) await page.touchscreen.tap(back.x, back.y); await sleep(250);
    k.backToPause = (await menuState(page)).pauseOpen;
    await textTap(page, '^أكمل$'); await sleep(150); s = await menuState(page);
    k.resumed = !s.menuOpen && s.scale === 1 && s.mode === 'dialogue' && s.dlg;
    k.lineKept = (await G(page, g => g.ui.dialogue.el.querySelector('.text').textContent)) === lineBefore;
    // pause again -> main menu
    pb = await hasP(); if (pb) await page.touchscreen.tap(pb.x, pb.y); await sleep(250);
    await textTap(page, 'القائمة الرئيسية'); await sleep(300); s = await menuState(page);
    k.mainMenu = s.mode === 'title' && s.scale === 1;
    // cinematic: letterbox + card + fade on top -> the button still sits above them
    await page.evaluate(`clearInterval(window.__pump)`);
    await startPlay(page); await G(page, g => { g.setMode('cine'); g.ui.cards.letterbox(true); g.ui.cards.show({ num: 'x', title: 'y', sub: 'z' }); g.ui.cards.setFade(0.5); });
    await sleep(700); pb = await hasP(); k.btnInCine = !!pb;
    if (pb) { k.cineTop = await hit(page, pb.x, pb.y); await page.touchscreen.tap(pb.x, pb.y); await sleep(250); }
    s = await menuState(page); k.cinePause = s.pauseOpen && s.scale === 0;
    await textTap(page, '^أكمل$'); await sleep(150); k.cineResume = (await menuState(page)).scale === 1;
    // not shown where it must not be: title screen
    await G(page, g => { g.ui.cards.setFade(0); g.ui.cards.hide(); g.ui.cards.letterbox(false); g.ui.menus.hideAll(); g.setMode('title'); g.ui.menus.showTitle(); }); await sleep(300);
    k.btnOnTitle = !!(await hasP());
    const pass = k.btnInDialogue && k.onTop && k.pauseOpened && k.settingsOpened && k.backToPause && k.resumed && k.lineKept && k.mainMenu && k.btnInCine && k.cinePause && k.cineResume && !k.btnOnTitle && k.mode === 'dialogue';
    ok = ok && pass; await page.context().close();
  }
  rec('F12', ok, d);
}

// ---------------------------------------------------------------- settings helpers (F13 F14 F27)
async function openSettings(page, textScale) {
  await startPlay(page);
  if (textScale) await G(page, (g, ts) => { g.save.settings.textScale = ts; g.ui.root.style.setProperty('--ts', String(ts)); }, textScale);
  await G(page, g => { g.setPaused(true); g.ui.menus.showPause(true); }); await sleep(200);
  if (!(await textTap(page, 'الإعدادات'))) throw new Error('settings button not found');
  await sleep(350);
}
const SB = '.menu[data-id=settings] .panel .body';
async function scrollOf(page) { return page.evaluate(sel => { const b = document.querySelector(sel); return { top: Math.round(b.scrollTop), max: b.scrollHeight - b.clientHeight, h: b.clientHeight }; }, SB); }
/** swipe the content "up" (visual direction); in the rotated stage the visual vertical is the screen horizontal */
async function swipe(page, from, dist) {
  const rot = await page.evaluate("document.getElementById('stage').classList.contains('rot')");
  const [x, y] = from;
  if (!rot) return drag(page, x, y, x, y - dist, 10);
  // stage rotate(90deg): stage-down (+y) -> screen -x ; content moves "up" in the stage when the finger goes screen +x
  return drag(page, x, y, x + dist, y, 10);
}
async function reachAll(page) {
  // swipe from three kinds of starting points until the end; report whether the last control became fully visible
  const out = { starts: {} };
  const panel = await center(page, SB.replace(' .body', ''));
  const sc0 = await scrollOf(page); out.initial = sc0;
  const targets = { label: '.menu[data-id=settings] .row label', segBtn: '.menu[data-id=settings] .seg button', slider: '.menu[data-id=settings] .rng input' };
  for (const [name, sel] of Object.entries(targets)) {
    // reset to top
    await page.evaluate(s => { document.querySelector(s).scrollTop = 0; }, SB); await sleep(60);
    const c = await center(page, sel); if (!c) { out.starts[name] = 'missing'; continue; }
    const before = (await scrollOf(page)).top; await swipe(page, [c.x, c.y], Math.min(120, sc0.h * 0.5)); await sleep(150);
    out.starts[name] = (await scrollOf(page)).top - before;
  }
  // scroll to the bottom by repeated swipes from the label column
  await page.evaluate(s => { document.querySelector(s).scrollTop = 0; }, SB); await sleep(60);
  const lab = await center(page, targets.label);
  for (let i = 0; i < 12; i++) { const s = await scrollOf(page); if (s.top >= s.max - 1) break; await swipe(page, [lab.x, lab.y], Math.min(120, sc0.h * 0.5)); await sleep(120); }
  out.bottom = await scrollOf(page);
  out.lastVisible = await page.evaluate(sel => {
    const rows = document.querySelectorAll('.menu[data-id=settings] .row'); const last = rows[rows.length - 1]; const r = last.getBoundingClientRect();
    return r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
  });
  // and back to the top: the first control reachable
  for (let i = 0; i < 12; i++) { const s = await scrollOf(page); if (s.top <= 1) break; const rot = await page.evaluate("document.getElementById('stage').classList.contains('rot')"); if (rot) await drag(page, lab.x, lab.y, lab.x - 120, lab.y, 10); else await drag(page, lab.x, lab.y, lab.x, lab.y + 120, 10); await sleep(120); }
  out.top = await scrollOf(page); out.panel = panel;
  return out;
}

// ---------------------------------------------------------------- F13
async function f13() {
  const d = {}; let ok = true;
  for (const [kind, ts] of [['phone', 0], ['portrait', 0], ['phone', 1.3], ['portrait', 1.3]]) {
    const page = await openPage(kind); const key = kind + (ts ? '+big' : ''); const k = d[key] = {};
    try {
      await openSettings(page, ts);
      const r = await reachAll(page); Object.assign(k, { overflow: r.initial.max, starts: r.starts, bottom: r.bottom.top, maxTop: r.bottom.max, lastVisible: r.lastVisible, backTop: r.top.top });
      const s = r.starts;
      const scrolls = ['label', 'segBtn'].every(n => typeof s[n] === 'number' && s[n] > 20);
      k.pass = r.initial.max > 0 && scrolls && r.bottom.top >= r.bottom.max - 2 && r.lastVisible && r.top.top <= 2;
    } catch (e) { k.error = String(e).slice(0, 200); k.pass = false; }
    ok = ok && k.pass; await page.context().close();
  }
  rec('F13', ok, d);
}

// ---------------------------------------------------------------- F14
async function f14() {
  const d = {}; const page = await openPage('phone');
  await openSettings(page, 0);
  // spies: audio volumes and storage
  await page.evaluate(() => {
    const G = __hs.G; window.__vol = []; const o = G.audio.setVolumes.bind(G.audio); G.audio.setVolumes = v => { window.__vol.push(v && v.master); return o(v); };
    window.__changed = 0; G.events.on('settings:changed', () => { window.__changed++; });
  });
  const stored = () => page.evaluate(() => { try { const j = JSON.parse(localStorage.getItem('hs1899.save.v1')); return j && j.settings ? j.settings.master : null; } catch { return 'err'; } });
  const val = () => G(page, g => +g.save.settings.master.toFixed(3));
  const lastVol = () => page.evaluate('window.__vol.length ? window.__vol[window.__vol.length-1] : null');
  const sl = '.menu[data-id=settings] .rng input';
  const geom = async () => page.evaluate(s => { const i = document.querySelectorAll(s)[0]; const r = i.getBoundingClientRect(); return { l: r.left, r: r.right, y: r.top + r.height / 2, rtl: getComputedStyle(i).direction }; }, sl);
  // value 0..1 -> screen x on the track (RTL: min at the right); thumb margins ignored (range 8px in)
  const gx = (g, v, rtl) => { const l = g.l + 10, r = g.r - 10, f = rtl === 'rtl' ? 1 - v : v; return l + (r - l) * f; };
  const g0 = await geom(); d.dir = g0.rtl;
  // start from a known value
  await G(page, g => { g.save.settings.master = 0.9; g.ui.menus.settingsOpen; }); await page.evaluate(sel => { const i = document.querySelectorAll(sel)[0]; i.value = 0.9; }, sl);
  // 1) tap the track
  await page.touchscreen.tap(gx(g0, 0.25, g0.rtl), g0.y); await sleep(150);
  d.tap = await val(); d.tapStored = await stored(); d.tapVol = await lastVol();
  // 2) drag the thumb 0.25 -> 0.8 (from the thumb to the target)
  const g1 = await geom(); const before = await val();
  await drag(page, gx(g1, 0.25, g1.rtl), g1.y, gx(g1, 0.8, g1.rtl), g1.y, 14, async () => ({ mid: await val() }));
  d.dragBefore = before; d.drag = await val(); d.dragStored = await stored(); d.dragVol = await lastVol();
  // 3) keyboard: focus the slider, arrows / Home / End; arrows must not be intercepted (defaultPrevented false) nor move the hero
  await page.evaluate(s => { window.__dp = []; window.addEventListener('keydown', e => window.__dp.push([e.code, e.defaultPrevented]), false); document.querySelectorAll(s)[0].focus(); }, sl);
  const v0 = await val(); await page.keyboard.press('ArrowUp'); await sleep(80); const v1 = await val();
  await page.keyboard.press('ArrowDown'); await sleep(80); const v2 = await val();
  await page.keyboard.press('ArrowRight'); await sleep(80); const v3 = await val();
  await page.keyboard.press('ArrowLeft'); await sleep(80); const v4 = await val();
  await page.keyboard.press('End'); await sleep(80); const v5 = await val(); await page.keyboard.press('Home'); await sleep(80); const v6 = await val();
  d.keys = { start: v0, up: v1, down: v2, right: v3, left: v4, end: v5, home: v6 };
  d.keyStored = await stored(); d.keyVol = await lastVol(); d.moveMagWhileFocused = await G(page, g => +g.input.moveMag.toFixed(2));
  d.arrowDefaultPrevented = await page.evaluate('window.__dp.filter(x => x[0].startsWith("Arrow")).some(x => x[1])');
  // 4) outside a form control the game keeps its keys (arrows still move the hero and are swallowed)
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__dp.length = 0; });
  await page.keyboard.down('ArrowUp'); await sleep(120); d.arrowOutsidePrevented = await page.evaluate('window.__dp.some(x => x[0] === "ArrowUp" && x[1])'); await page.keyboard.up('ArrowUp');
  const near = (a, b) => Math.abs(a - b) < 0.011;
  const tapOk = near(d.tap, 0.25) && near(d.tapStored, 0.25) && near(d.tapVol, 0.25);
  const dragOk = near(d.drag, 0.8) && near(d.dragStored, 0.8) && near(d.dragVol, 0.8) && d.dragBefore < 0.3;
  const keyOk = near(v1 - v0, 0.05) && near(v1 - v2, 0.05) && v3 !== v2 && v4 === v2 && v5 === 1 && v6 === 0 && near(d.keyStored, 0) && near(d.keyVol, 0) && !d.arrowDefaultPrevented && d.moveMagWhileFocused === 0 && d.arrowOutsidePrevented;
  d.tapOk = tapOk; d.dragOk = dragOk; d.keyOk = keyOk;
  rec('F14', tapOk && dragOk && keyOk, d);
  await page.context().close();
}

// ---------------------------------------------------------------- F26
async function f26() {
  const d = {}; const page = await openPage('phone'); await startPlay(page);
  const vis = () => page.evaluate(() => {
    const b = document.querySelector('.tb.ctx'); const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    return { shown: r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05, text: b.textContent.replace(/\s+/g, ' ').trim(), cls: b.className };
  });
  // no verb at all
  await G(page, g => { const v = g.sys.interact.verb; window.__v0 = v && v.kind; }); d.verbKind = await page.evaluate('window.__v0');
  await page.evaluate(() => { const G = __hs.G; G.actors.player.teleport(-60, 60, 0); G.actors.cam.snap(); }); await sleep(400);
  d.noVerb = await vis();
  // every visible round button in the touch layer must say what it is (text or icon + accessible name)
  d.anonymous = await page.evaluate(() => [...document.querySelectorAll('.touch .tb')].filter(b => b.getBoundingClientRect().width > 0).filter(b => !(b.textContent.replace(/\s+/g, '').replace(/^(E|F|R|Esc)$/, '') || b.querySelector('.ic')) ).length);
  // a context verb -> shown with its label
  await page.evaluate(() => { const G = __hs.G; Object.defineProperty(G.sys.interact, 'verb', { configurable: true, get: () => ({ kind: 'use', labelKey: 'verb.talk', at: null, progress: 0 }) }); }); await sleep(250);
  d.withVerb = await vis();
  // steady request -> shown with its label
  await page.evaluate(() => { const G = __hs.G; Object.defineProperty(G.sys.interact, 'verb', { configurable: true, get: () => ({ kind: null, labelKey: null, at: null, progress: 0 }) });
    Object.defineProperty(G.sys.steady, 'activeRequest', { configurable: true, get: () => ({ kind: 'hold', target: null, labelKey: 'verb.steady', seconds: 3 }) }); }); await sleep(250);
  d.withSteady = await vis();
  await page.evaluate(() => { const G = __hs.G; Object.defineProperty(G.sys.steady, 'activeRequest', { configurable: true, get: () => null }); }); await sleep(250);
  d.afterNone = await vis();
  // a press that is in progress when the verb vanishes must still release (no stuck 'interact')
  await page.evaluate(() => { const G = __hs.G; Object.defineProperty(G.sys.interact, 'verb', { configurable: true, get: () => ({ kind: 'use', labelKey: 'verb.talk', at: null, progress: 0 }) }); }); await sleep(250);
  const c = await center(page, '.tb.ctx'); await touch(page, 'touchStart', [[c.x, c.y]]); await sleep(150);
  d.heldDuring = await G(page, g => g.input.held('interact'));
  await page.evaluate(() => { const G = __hs.G; Object.defineProperty(G.sys.interact, 'verb', { configurable: true, get: () => ({ kind: null, labelKey: null, at: null, progress: 0 }) }); }); await sleep(250);
  await touch(page, 'touchEnd', []); await sleep(200);
  d.heldAfter = await G(page, g => g.input.held('interact'));
  const pass = d.noVerb.shown === false && d.anonymous === 0 && d.withVerb.shown && /حدّث/.test(d.withVerb.text) && d.withSteady.shown && /اثبُت/.test(d.withSteady.text) && d.afterNone.shown === false && d.heldDuring === true && d.heldAfter === false;
  rec('F26', pass, d); await page.context().close();
}

// ---------------------------------------------------------------- F27
async function f27() {
  const d = { sliders: [] }; const page = await openPage('phone'); await openSettings(page, 0);
  const info = await page.evaluate(() => [...document.querySelectorAll('.menu[data-id=settings] input[type=range]')].map(i => {
    const lab = i.labels && i.labels[0];
    return { name: i.getAttribute('aria-label') || (i.getAttribute('aria-labelledby') ? document.getElementById(i.getAttribute('aria-labelledby')).textContent : '') || (lab ? lab.textContent : ''),
      labelFor: !!lab, id: i.id, min: i.min, max: i.max, valuenow: i.value, valuetext: i.getAttribute('aria-valuetext'), role: i.getAttribute('role') || 'slider(implicit)' };
  }));
  d.sliders = info;
  // computed accessibility tree (Chromium), independent of how the name is wired
  const snap = await page.locator('.menu[data-id=settings]').ariaSnapshot(); d.snapshot = snap.split('\n').filter(l => /slider/.test(l)).map(s => s.trim());
  const wanted = ['الصوت العام', 'الموسيقى', 'المؤثرات', 'حساسية النظر'];
  const named = wanted.every(w => d.snapshot.some(l => l.includes('"' + w + '"')));
  const noDup = new Set(info.map(i => i.id)).size === info.length && info.every(i => i.id);
  // role slider + a value in the accessibility tree (numeric), and a spoken value text in Arabic percent / multiplier form
  const valued = d.snapshot.length === 4 && d.snapshot.every(l => /: "[\d.]+"/.test(l)) && info.every(i => /[٠-٩]/.test(i.valuetext || ''));
  // value follows a change (the spoken value is updated)
  await page.evaluate(() => { const i = document.querySelectorAll('.menu[data-id=settings] input[type=range]')[0]; i.focus(); }); await page.keyboard.press('ArrowUp'); await sleep(100);
  d.afterKey = await page.evaluate(() => { const i = document.querySelectorAll('.menu[data-id=settings] input[type=range]')[0]; return { value: i.value, text: i.getAttribute('aria-valuetext') }; });
  const snap2 = (await page.locator('.menu[data-id=settings]').ariaSnapshot()).split('\n').find(l => /"الصوت العام"/.test(l)); d.snapAfter = snap2 && snap2.trim();
  const upd = d.afterKey.text === '٩٥٪' && snap2 && snap2.includes('"' + d.afterKey.value + '"');
  rec('F27', info.length === 4 && named && noDup && valued && !!upd, { ...d, named, noDup, valued, upd: !!upd });
  await page.context().close();
}

(async () => {
  const { createServer } = await import(path.join(__dirname, 'serve.mjs')); server = createServer(); await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  const launch = () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const all = { F11: f11, F12: f12, F13: f13, F14: f14, F26: f26, F27: f27 };
  for (const [id, fn] of Object.entries(all)) {
    if (only && !only.includes(id)) continue;
    browser = await launch();   // a fresh browser per item (software GL is memory hungry)
    try { await fn(); } catch (e) { rec(id, false, { error: String(e && e.stack || e).slice(0, 400) }); }
    try { await browser.close(); } catch { /* ignore */ }
  }
  const errs = bad.filter(b => !/favicon/.test(b)); if (errs.length) log('page errors:', errs.slice(0, 5));
  const pass = Object.values(items).length > 0 && Object.values(items).every(i => i.pass);
  console.log(JSON.stringify({ items, pageErrors: errs.slice(0, 5) }));
  server.close(); process.exit(pass ? 0 : 1);
})();
