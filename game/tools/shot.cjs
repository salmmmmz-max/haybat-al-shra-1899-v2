#!/usr/bin/env node
/**
 * Headless screenshot / probe tool (Playwright + software WebGL).
 *
 *   node tools/shot.cjs <urlPath> <out.png> [options]
 *
 *   <urlPath>   e.g. "/?test=1"  or  "/harness/harness.html?m=terrain"
 * options
 *   --w 844 --h 390        viewport (default 844x390 = phone landscape); --portrait swaps them
 *   --mobile               emulate a touch phone (hasTouch, isMobile, DPR 2)
 *   --wait 1500            ms to wait after load (default 800)
 *   --until "<js expr>"    wait until the expression is truthy (timeout 60 s)
 *   --eval "<js>"          run JS in the page (may be async, e.g. "await __hs.step(120)") before the shot; repeatable
 *   --print "<js expr>"    print JSON of an expression after the evals; repeatable
 *   --quiet                do not print console messages
 * Exit code 1 if the page logged an uncaught error.
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

(async () => {
  const argv = process.argv.slice(2);
  const pos = []; const opt = { evals: [], prints: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--w') opt.w = +argv[++i]; else if (a === '--h') opt.h = +argv[++i];
    else if (a === '--portrait') opt.portrait = true; else if (a === '--mobile') opt.mobile = true;
    else if (a === '--wait') opt.wait = +argv[++i]; else if (a === '--until') opt.until = argv[++i];
    else if (a === '--eval') opt.evals.push(argv[++i]); else if (a === '--print') opt.prints.push(argv[++i]);
    else if (a === '--quiet') opt.quiet = true; else pos.push(a);
  }
  const [urlPath, out] = pos;
  if (!urlPath) { console.error('usage: shot.cjs <urlPath> [out.png] [options]'); process.exit(2); }
  let w = opt.w || 844, h = opt.h || 390; if (opt.portrait) [w, h] = [h, w];
  const { createServer } = await import(path.join(__dirname, 'serve.mjs'));
  const server = createServer(); await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  let failed = false;
  try {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opt.mobile ? 2 : 1, hasTouch: !!opt.mobile, isMobile: !!opt.mobile, locale: 'ar-SA' });
    const page = await ctx.newPage();
    page.on('console', m => { const t = m.type(); if (t === 'error') { failed = true; console.log('[console.error]', m.text().slice(0, 600)); } else if (!opt.quiet && (t === 'warning' || t === 'log' || t === 'info')) console.log(`[${t}]`, m.text().slice(0, 300)); });
    page.on('pageerror', e => { failed = true; console.log('[pageerror]', String(e && e.stack || e).slice(0, 800)); });
    page.on('requestfailed', r => { if (!r.url().includes('/ws')) console.log('[requestfailed]', r.url().replace(base, ''), r.failure() && r.failure().errorText); });
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/ws')) console.log('[http ' + r.status() + ']', r.url().replace(base, '')); });
    await page.goto(base + urlPath, { waitUntil: 'load' });
    if (opt.until) await page.waitForFunction(opt.until, null, { timeout: 60000 });
    await page.waitForTimeout(opt.wait ?? 800);
    for (const js of opt.evals) await page.evaluate(`(async () => { ${js} })()`);
    for (const js of opt.prints) console.log('[print]', JSON.stringify(await page.evaluate(`(async () => (${js}))()`)));
    if (out) await page.screenshot({ path: out });
  } catch (e) { failed = true; console.log('[tool error]', String(e).slice(0, 600)); }
  finally { await browser.close(); server.close(); }
  process.exit(failed ? 1 : 0);
})();
