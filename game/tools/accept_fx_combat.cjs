#!/usr/bin/env node
/**
 * F03 with TRUSTED touch input (group fx_combat): a phone context drags the real floating stick (CDP touch events →
 * pointer events → ui/touch.js → G.input) and holds it while c5_walk runs in sim time (fastText off).
 *   node tools/accept_fx_combat.cjs        → one JSON line { items: { F03_touch: { pass, detail } } }, exit 0 only if all pass
 * Drags: 14.1 px (≈ stick 0.15, the audited bypass), 19 px (≈ 0.25) and 45 px (≈ 0.8). Each must open the walk challenge
 * at the foot, draw both shots and finish at the locked 1.5 m/s pace.
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const SETUP = `(async () => {
  const H = window.__hs, G = H.G, wall = ms => new Promise(r => setTimeout(r, ms));
  window.__fx = { async step(n) { for (let i = 0; i < n; i++) { G.loop.render = false; G.loop.tick(1 / 60); for (let k = 0; k < 10; k++) await null; if (i % 300 === 299) await wall(0); } G.loop.render = true; } };
  G.state.fastText = true; G.state.autoPlay = true;
  G.sys.director.startChapter(5, 'c5_walk'); await wall(0); await window.__fx.step(2);
  for (let i = 0; i < 6000 && (G.state.mode === 'loading' || G.state.mode === 'boot'); i++) { await wall(25); G.loop.tick(1 / 60); }
  await window.__fx.step(5); G.state.fastText = false; await window.__fx.step(2);
  const L = G.sys.director.level, f = L.poi('fire'), p = G.actors.player.pos;
  G.actors.cam.yaw = Math.atan2(f.x - p.x, f.z - p.z); G.actors.cam.snap && G.actors.cam.snap();
  return { mode: G.state.mode, beat: G.state.beat };
})()`;
const WALK = `(async () => {
  const H = window.__hs, G = H.G, P = G.actors.player, L = G.sys.director.level, fire = L.poi('fire'), foot = L.poi('foot');
  let shots = 0, end = null, fail = null, opened = null, sum = 0, n = 0, mags = 0, mn = 0, t = 0;
  const sfx = G.audio.sfx; G.audio.sfx = (id, o) => { if (id === 'sfx_shot') shots++; return sfx.call(G.audio, id, o); };
  const offs = [G.events.on('steady:end', e => { if (end === null) end = e.ok; }), G.events.on('beat:fail', e => { fail = e.textKey; })];
  const along = () => Math.hypot(P.pos.x - foot.x, P.pos.z - foot.z);
  let px = P.pos.x, pz = P.pos.z;
  for (let i = 0; i < 60 * 80; i++) {
    G.actors.cam.yaw = Math.atan2(fire.x - P.pos.x, fire.z - P.pos.z);        // the thumb pushes straight at the fire
    await window.__fx.step(1); t += 1 / 60;
    const v = Math.hypot(P.pos.x - px, P.pos.z - pz) * 60; px = P.pos.x; pz = P.pos.z;
    mags += G.input.moveMag; mn++;
    const r = G.sys.steady.activeRequest;
    if (r && r.kind === 'walk') { if (opened === null) opened = Math.round(along() * 100) / 100; if (along() > 3 && along() < 40) { sum += v; n++; } }
    if (fail || end !== null || G.state.beat !== 'c5_walk') break;
  }
  G.audio.sfx = sfx; offs.forEach(f => f());
  const r2 = x => Math.round(x * 100) / 100;
  return { stick: r2(mags / Math.max(1, mn)), openedAtAlong: opened, shots, ok: end, fail, pace: n ? r2(sum / n) : 0, secs: r2(t) };
})()`;

(async () => {
  const { createServer } = await import(path.join(__dirname, 'serve.mjs'));
  const server = createServer(); await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const items = {}; let errors = [];
  try {
    const detail = {}; let pass = true;
    for (const dpx of [14.1, 19, 45]) {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ar-SA' });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
      await page.goto(base + '/harness/harness.html?m=play&test=1', { waitUntil: 'load' });
      await page.waitForFunction('window.__harness && (window.__harness.ready || window.__harness.error)', null, { timeout: 120000 });
      await page.evaluate(SETUP);
      await page.evaluate('window.__fx.step(2)');                  // the touch layer turns on in mode play
      const cdp = await ctx.newCDPSession(page), x = 150, y = 300;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - dpx / 2, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - dpx, id: 1 }] });
      const r = await page.evaluate(WALK);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      detail['drag' + dpx + 'px'] = r;
      if (!(r.openedAtAlong !== null && r.openedAtAlong < 2 && r.shots === 2 && r.ok === true && Math.abs(r.pace - 1.5) < 0.12)) pass = false;
      await ctx.close();
    }
    items.F03_touch = { pass: pass && errors.length === 0, detail };
  } catch (e) { items.F03_touch = { pass: false, detail: 'tool error: ' + String(e).slice(0, 400) }; }
  finally { await browser.close(); server.close(); }
  console.log(JSON.stringify({ items, errors }));
  process.exit(Object.values(items).every(i => i.pass) ? 0 : 1);
})();
