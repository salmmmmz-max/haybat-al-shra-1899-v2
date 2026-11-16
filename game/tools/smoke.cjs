#!/usr/bin/env node
// Production smoke on an emulated phone: boots "/", taps «ابدأ الرحلة», plays a few seconds with touch input, reports errors.
//   node tools/smoke.cjs <out-prefix> [--portrait] [--seconds 14]
const path = require('path'); const { chromium } = require('playwright');
(async () => {
  const a = process.argv.slice(2), out = a[0] || '.cache/out/smoke', portrait = a.includes('--portrait'); const si = a.indexOf('--seconds'); const secs = si >= 0 ? +a[si + 1] : 14;
  const { createServer } = await import(path.join(__dirname, 'serve.mjs')); const server = createServer(); await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const vp = portrait ? { width: 390, height: 844 } : { width: 844, height: 390 };
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ar-SA', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage(); const bad = [];
  p.on('console', m => { if (m.type() === 'error') bad.push('console: ' + m.text().slice(0, 240)); });
  p.on('pageerror', e => bad.push('pageerror: ' + String(e && e.stack || e).slice(0, 300)));
  p.on('response', r => { if (r.status() >= 400 && !r.url().includes('/ws')) bad.push(r.status() + ' ' + r.url().replace(base, '')); });
  await p.goto(base + '/', { waitUntil: 'load' });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: out + '_title.png' });
  // tap the primary button (found by its text) through a real touch
  const box = await p.evaluate(() => { const el = [...document.querySelectorAll('button')].find(x => /ابدأ/.test(x.textContent)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (box) await p.touchscreen.tap(box.x, box.y); else bad.push('start button not found');
  await p.waitForTimeout(secs * 1000);
  await p.screenshot({ path: out + '_play1.png' });
  // skip the intro with taps, then push the stick up-right for 2.5 s
  for (let i = 0; i < 6; i++) { await p.touchscreen.tap(vp.width * 0.6, vp.height * 0.5); await p.waitForTimeout(700); }
  const info = await p.evaluate(() => ({ rot: document.getElementById('stage').classList.contains('rot'), canvas: [document.getElementById('game').width, document.getElementById('game').height], ui: document.getElementById('ui').childElementCount }));
  await p.waitForTimeout(4000);
  await p.screenshot({ path: out + '_play2.png' });
  console.log(JSON.stringify({ info, bad: bad.slice(0, 10) }));
  await b.close(); server.close();
})();
