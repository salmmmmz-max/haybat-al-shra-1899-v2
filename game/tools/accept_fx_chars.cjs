#!/usr/bin/env node
/**
 * Acceptance run for group fx_chars (F04 F18 F21 V01 V02 V03). Needs a dev harness build:
 *   node tools/build.mjs --dev --harness && node tools/accept_fx_chars.cjs
 * 1. the in-page checks of harness/accept_fx_chars.js (all six items)
 * 2. F18 in the real chapters: ch1/c1_well → ch3/c3_wolves → ch4/c4_stranger × 4 on scene `play`; the GPU texture count
 *    in c4_stranger must stop growing after the first cycle (audited build: 20 → 27 → 34 → 41)
 * Prints ONE JSON line { items: {…} } and exits 0 only if every item passes.
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

(async () => {
  const { createServer } = await import(path.join(__dirname, 'serve.mjs'));
  const server = createServer(); await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const items = {}; const errors = [];
  const ready = 'window.__harness && (window.__harness.ready || window.__harness.error)';
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    // 1. in-page checks
    let page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
    await page.goto(base + '/harness/harness.html?m=accept_fx_chars&test=1');
    await page.waitForFunction(ready, null, { timeout: 120000 });
    const r = await page.evaluate('window.__harness.error ? { error: window.__harness.error } : window.__harness.api.run()');
    if (r.error) items.harness = { pass: false, detail: r.error.slice(0, 300) }; else Object.assign(items, r.items);
    await page.close();
    // 2. F18 in the shipped chapters
    page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
    await page.goto(base + '/harness/harness.html?m=play&test=1');
    await page.waitForFunction(ready, null, { timeout: 120000 });
    const cyc = await page.evaluate(`(async () => {
      const here = beat => __hs.G.state.mode !== 'loading' && __hs.G.state.beat === beat;
      const go = async (ch, beat) => { await __hs.chapter(ch, beat); for (let k = 0; k < 400 && !here(beat); k++) { await __hs.step(5); await new Promise(r => setTimeout(r, 50)); } await __hs.step(30); };
      const out = [];
      for (let i = 0; i < 4; i++) { await go(1, 'c1_well'); await go(3, 'c3_wolves'); await go(4, 'c4_stranger'); const s = __hs.state(); out.push({ beat: s.beat, tex: s.render.textures }); }
      return { out, errors: __hs.errors.slice(0, 3) };
    })()`);
    const tex = cyc.out.map(o => o.tex), okBeats = cyc.out.every(o => o.beat === 'c4_stranger');
    const plateau = okBeats && tex[3] === tex[2] && tex[3] - tex[1] <= 1;   // warmed up after the first cycle; audited: +7 per cycle
    items.F18_chapters = { pass: plateau && cyc.errors.length === 0, detail: `c4_stranger textures after each ch1→ch3→ch4 cycle: ${tex.join(' → ')}${okBeats ? '' : ' (beat not reached)'}${cyc.errors.length ? ' errors: ' + cyc.errors.join(' | ') : ''}` };
    await page.close();
  } catch (e) { items.tool = { pass: false, detail: String(e).slice(0, 300) }; }
  finally { await browser.close(); server.close(); }
  if (errors.length) items.pageerrors = { pass: false, detail: errors.join(' | ') };
  const pass = Object.values(items).length > 0 && Object.values(items).every(i => i.pass);
  console.log(JSON.stringify({ items }));
  process.exit(pass ? 0 : 1);
})();
