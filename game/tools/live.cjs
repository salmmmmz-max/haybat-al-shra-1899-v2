#!/usr/bin/env node
// Open the LIVE game in headless Chromium: node tools/live.cjs <url> <out.png> [--mobile] [--wait ms]
const { chromium } = require('playwright');
(async () => {
  const [url, out, ...rest] = process.argv.slice(2); const mobile = rest.includes('--mobile'); const wi = rest.indexOf('--wait'); const wait = wi >= 0 ? +rest[wi + 1] : 6000;
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile, locale: 'ar-SA' });
  const p = await ctx.newPage(); const bad = [];
  p.on('console', m => { if (m.type() === 'error') bad.push('console: ' + m.text().slice(0, 200)); });
  p.on('pageerror', e => bad.push('pageerror: ' + String(e).slice(0, 200)));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 120)); });
  const r = await p.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(e => ({ status: () => 'ERR ' + String(e).slice(0, 120) }));
  await p.waitForTimeout(wait);
  console.log(JSON.stringify({ status: r.status(), title: await p.title(), text: (await p.evaluate(() => document.body.innerText)).slice(0, 200), bad: bad.slice(0, 8) }));
  if (out) await p.screenshot({ path: out });
  await b.close();
})();
