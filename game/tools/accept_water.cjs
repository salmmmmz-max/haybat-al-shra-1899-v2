#!/usr/bin/env node
/**
 * Acceptance checks of group «water & guidance» (audit F07 F08 F09 F10 F23) on the real play scene.
 *   node tools/build.mjs --dev --harness && node tools/accept_water.cjs [--only F07,F23] [--verbose]
 * Prints ONE json line { items: { F07: { pass, detail }, … } } and exits 0 only when every item passes.
 * Drinking is done with a trusted keyboard hold (physical R = the قربة button); time is sim time (`__hs.step`).
 *   F07  thirst run-limit = one handle, released after drinking (hysteresis 15 → 20), re-attached after a beat end, never piles up
 *   F08  ch4: drink-then-give does not count both (the قربة is locked until the decision; one sip → one benefit)
 *   F09  ch2: drink-early-then-«اشرب نصيبك» does not wait 30 s (locked early; nothing impossible to wait for)
 *   F10  ch2: ration child / elder → the sip leaves the قربة (sips 0, thirst unchanged); self → +35 once
 *   F23  ch2 storm (ration = self, 80 m away): the lost-guidance arrow shows from where the player is lost (also at 150 m)
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const verbose = argv.includes('--verbose');
const want = id => !only || only.includes(id);

/** in-page helpers (installed once per page after the harness is ready) */
function install() {
  const G = window.__hs.G, hs = window.__hs;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const flush = async () => { for (let k = 0; k < 10; k++) await null; };
  const W = window.__W = {
    G, log: [],
    /** advance n ticks (bot = drive the generic autoplay bot like a player); stops early when stop() is truthy; returns steps used */
    async adv(n, o = {}) {
      let i = 0, wall = 0;
      for (; i < n; i++) {
        if (o.stop && o.stop()) break;
        if (G.state.mode === 'loading' || G.state.mode === 'boot') { await sleep(25); G.loop.render = false; G.loop.tick(1 / 60); wall += 25; i--; if (wall > 150000) break; continue; }
        if (o.bot) hs.bot.tick(1 / 60);
        G.loop.render = i === n - 1 || i % 500 === 0; G.loop.tick(1 / 60); await flush();
        if (i % 300 === 299) await sleep(0);
      }
      G.loop.render = true; return i;
    },
    /** cold start a beat and wait until it is really playing */
    async start(ch, beat) {
      G.state.autoChoice = {};
      G.sys.director.startChapter(ch, beat); await sleep(0);
      await W.adv(4000, { stop: () => G.state.mode === 'play' && G.state.beat === beat });
      await W.adv(90);                                           // settle (camera, mount)
    },
    snap() {
      const sv = G.sys.survival, pl = G.actors.player;
      return { thirst: +sv.thirst.toFixed(2), sips: sv.sips, locked: sv.drinkLocked, thirstLimits: pl.limits.filter(l => l.tag === 'thirst').length, flags: { ...G.state.flags }, beat: G.state.beat, mode: G.state.mode, t: +G.time.now.toFixed(2) };
    },
    watchDenied() { W.denied = 0; G.events.on('survival:denied', () => { W.denied++; }); },
    toasts() { return [...document.querySelectorAll('.toast.on, .toasts .toast')].map(e => e.textContent).filter(Boolean).join(' | '); },
    runSpeed() {                                                // stick fully forward for 1.2 s from the same spot
      const pl = G.actors.player, p = { x: pl.pos.x, z: pl.pos.z, yaw: pl.yaw };
      return (async () => {
        let top = 0;
        G.input.feed({ move: { x: 0, y: 1 }, hold: [] });
        for (let i = 0; i < 72; i++) { G.loop.render = i === 71; G.loop.tick(1 / 60); await flush(); if (pl.speed > top) top = pl.speed; }
        G.input.feed({ move: { x: 0, y: 0 }, hold: [] });
        await W.adv(30); pl.teleport(p.x, p.z, p.yaw); G.actors.cam.snap(); await W.adv(20);
        return +top.toFixed(2);
      })();
    },
  };
  return true;
}

async function holdDrink(page, steps) {
  await page.keyboard.down('KeyR');
  await page.evaluate(n => window.__W.adv(n), steps);
  await page.keyboard.up('KeyR');
  await page.evaluate(() => window.__W.adv(6));
}

(async () => {
  const { createServer } = await import(path.join(__dirname, 'serve.mjs'));
  const server = createServer(); await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const items = {}, errors = [];
  const put = (id, pass, detail) => { items[id] = { pass: !!pass, detail }; if (verbose) console.error(id, pass ? 'PASS' : 'FAIL', JSON.stringify(detail)); };
  const fresh = async () => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, locale: 'ar-SA' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e && e.stack || e).slice(0, 300)));
    await page.goto(base + '/harness/harness.html?m=play&test=1', { waitUntil: 'load' });
    await page.waitForFunction('window.__harness && (window.__harness.ready || window.__harness.error) && window.__hs', null, { timeout: 90000 });
    await page.evaluate(install);
    await page.bringToFront();
    return { page, ctx };
  };
  try {
    // ---------------------------------------------------------------- F07 + F23 (c2_storm, on foot, ration = self by default)
    if (want('F07') || want('F23')) {
      const { page, ctx } = await fresh();
      await page.evaluate(() => window.__W.start(2, 'c2_storm'));
      if (want('F07')) {
        const r = await page.evaluate(async () => {
          const W = window.__W, G = W.G, sv = G.sys.survival, pl = G.actors.player, o = {};
          sv.set({ drain: false, sips: 0 });
          const walk = await W.runSpeed();                             // healthy: the free run speed
          sv.set({ thirst: 10 }); await W.adv(300);
          o.parched = W.snap(); o.parchedSpeed = await W.runSpeed();
          sv.set({ thirst: 12 }); await W.adv(600); o.stillParched = W.snap().thirstLimits;
          pl.onBeatEnd(); await W.adv(30); o.afterBeatEnd = W.snap().thirstLimits;       // the player clears its limits at a beat end
          sv.set({ thirst: 10 }); o.walk = walk; sv.set({ sips: 1 });
          return o;
        });
        await holdDrink(page, 40);
        const r2 = await page.evaluate(async () => {
          const W = window.__W, G = W.G, sv = G.sys.survival, o = {};
          o.afterDrink = W.snap(); await W.adv(60); o.settled = W.snap(); o.freeSpeed = await W.runSpeed();
          sv.set({ thirst: 10 }); await W.adv(30); o.again = W.snap().thirstLimits;
          sv.set({ thirst: 17 }); await W.adv(30); o.at17 = W.snap().thirstLimits;      // hysteresis: still limited below 20
          sv.set({ thirst: 21 }); await W.adv(30); o.at21 = W.snap().thirstLimits;
          sv.set({ thirst: 5 }); await W.adv(1200); o.longParched = W.snap().thirstLimits;   // never piles up
          return o;
        });
        const d = { ...r, ...r2 };
        const pass = d.parched.thirstLimits === 1 && d.stillParched === 1 && d.afterBeatEnd === 1 && d.parchedSpeed < d.walk * 0.8
          && d.afterDrink.thirst > 40 && d.settled.thirstLimits === 0 && d.freeSpeed > d.parchedSpeed * 1.3
          && d.again === 1 && d.at17 === 1 && d.at21 === 0 && d.longParched === 1;
        put('F07', pass, { limitsParched: d.parched.thirstLimits, limitsAfterMore: d.stillParched, limitsAfterBeatEnd: d.afterBeatEnd, speedHealthy: d.walk, speedParched: d.parchedSpeed, thirstAfterDrink: d.afterDrink.thirst, limitsAfterDrink: d.settled.thirstLimits, speedAfterDrink: d.freeSpeed, hysteresis: [d.again, d.at17, d.at21], limitsAfter20sParched: d.longParched });
      }
      if (want('F23')) {
        // fresh beat: nobody approaches the bush; his call is hoarse (ration = self → beacon 60 m), the player is 80 m away
        await page.evaluate(() => window.__W.start(2, 'c2_storm'));
        const q = await page.evaluate(async () => {
          const W = window.__W, G = W.G, o = {}, rip = () => { const e = document.querySelector('.ripple'); return e ? { on: e.classList.contains('on'), arrow: e.classList.contains('arrow') } : null; };
          G.sys.survival.set({ drain: false, thirst: 80 });
          const L = G.sys.director.level, bush = L.poi('bush'), pl = G.actors.player;
          const D = () => Math.hypot(pl.pos.x - bush.x, pl.pos.z - bush.z);
          o.ration = G.state.flags.ration; o.dist0 = +D().toFixed(1);
          await W.adv(600); o.t10 = rip();                                // before any guidance
          await W.adv(60 * 26); o.t36 = rip(); o.dist36 = +D().toFixed(1); o.toastLost1 = /./.test(W.toasts());
          pl.teleport(pl.pos.x - 70, pl.pos.z, pl.yaw); G.actors.cam.snap();   // lost much further out
          await W.adv(120); o.far = rip(); o.distFar = +D().toFixed(1);
          return o;
        });
        const pass = q.ration === 'self' && q.dist0 > 70 && q.t36 && q.t36.on && q.t36.arrow && q.far && q.far.on && q.far.arrow;
        put('F23', pass, q);
      }
      await ctx.close();
    }

    // ---------------------------------------------------------------- ch2 ration (F09, F10)
    const rationRun = async (choice, early, preSpend = false) => {
      const { page, ctx } = await fresh();
      await page.evaluate(() => { window.__W.watchDenied(); return window.__W.start(2, 'c2_ration'); });
      await page.evaluate(c => { const G = window.__W.G; G.state.autoChoice = { c2_ration: c }; G.sys.survival.set({ drain: false }); }, choice);
      const o = { before: await page.evaluate(() => window.__W.snap()) };
      if (early) { await holdDrink(page, 40); o.afterEarly = await page.evaluate(() => ({ ...window.__W.snap(), denied: window.__W.denied, toast: window.__W.toasts() })); }
      if (preSpend) await page.evaluate(() => { const sv = window.__W.G.sys.survival; if (sv.lockDrink) sv.lockDrink(false); sv.set({ sips: 0 }); });   // the sip is already gone when «اشرب نصيبك» is chosen
      const rr = await page.evaluate(async () => {
        const W = window.__W, G = W.G; let tChoice = null;
        const stop = () => G.state.beat === 'c2_wall';
        G.events.on('choice:made', e => { if (tChoice === null && /c2_ration/.test(e.key)) tChoice = G.time.now; });
        await W.adv(9000, { bot: true, stop });
        const s = W.snap(); s.tChoice = tChoice; s.waited = tChoice === null ? null : +(G.time.now - tChoice).toFixed(1);
        return s;
      });
      o.wall = rr; o.toastsEnd = await page.evaluate(() => window.__W.toasts());
      await ctx.close(); return o;
    };
    if (want('F09')) {
      const o = await rationRun('self', true);
      const gain = o.wall.thirst - o.before.thirst;
      const pass = o.wall.beat === 'c2_wall' && o.wall.waited !== null && o.wall.waited < 10 && gain <= 35.5 && o.wall.sips === 0;
      const z = await rationRun('self', false, true);                      // defence in depth: no sip left at the choice → no 30 s wait either
      const passZ = z.wall.beat === 'c2_wall' && z.wall.waited !== null && z.wall.waited < 10 && Math.abs(z.wall.thirst - z.before.thirst) < 0.6;
      put('F09', pass && passZ, { before: o.before, afterEarlyHold: o.afterEarly, atWall: o.wall, waitedAfterChoice_s: o.wall.waited, thirstGain: +gain.toFixed(2), noSipLeft: { waited_s: z.wall.waited, thirstGain: +(z.wall.thirst - z.before.thirst).toFixed(2) } });
    }
    if (want('F10')) {
      const res = {}; let ok = true;
      for (const c of ['child', 'elder', 'self']) {
        const o = await rationRun(c, false);
        const gain = +(o.wall.thirst - o.before.thirst).toFixed(2);
        const good = o.wall.beat === 'c2_wall' && o.wall.flags.ration === c && o.wall.sips === 0 && (c === 'self' ? Math.abs(gain - 35) < 0.6 : Math.abs(gain) < 0.6) && o.wall.waited < 10;
        ok = ok && good; res[c] = { sipsBefore: o.before.sips, sipsAtWall: o.wall.sips, thirstBefore: o.before.thirst, thirstGain: gain, waited_s: o.wall.waited, pass: good };
      }
      put('F10', ok, res);
    }

    // ---------------------------------------------------------------- ch4 stranger (F08)
    if (want('F08')) {
      const strangerRun = async (give, early) => {
        const { page, ctx } = await fresh();
        await page.evaluate(() => { window.__W.watchDenied(); return window.__W.start(4, 'c4_stranger'); });
        await page.evaluate(g => { const G = window.__W.G; G.state.autoChoice = { c4_stranger: g }; G.sys.survival.set({ drain: false }); }, give);
        const o = { before: await page.evaluate(() => window.__W.snap()) };
        if (early) { await holdDrink(page, 40); o.afterEarly = await page.evaluate(() => ({ ...window.__W.snap(), denied: window.__W.denied, toast: window.__W.toasts() })); }
        o.end = await page.evaluate(async () => {
          const W = window.__W, G = W.G;
          await W.adv(9000, { bot: true, stop: () => G.state.beat === 'c4_collapse' && G.state.mode === 'play' });
          return W.snap();
        });
        if (!give) {                                                  // refusal keeps the sip: drinking it afterwards works, exactly once
          await holdDrink(page, 40); o.afterRefuseDrink = await page.evaluate(() => window.__W.snap());
          await holdDrink(page, 40); o.afterSecondHold = await page.evaluate(() => window.__W.snap());
        }
        await ctx.close(); return o;
      };
      const a = await strangerRun(true, true), b = await strangerRun(true, false), c = await strangerRun(false, false);
      const gainA = +(a.end.thirst - a.before.thirst).toFixed(2), gainB = +(b.end.thirst - b.before.thirst).toFixed(2);
      const passA = a.end.flags.gaveWater === true && a.end.sips === 0 && gainA < 1;                  // drink-then-give: one benefit at most (here: none for Dhari)
      const passB = b.end.flags.gaveWater === true && b.end.sips === 0 && gainB < 1;
      const passC = c.end.flags.gaveWater === false && c.end.sips === 1 && c.afterRefuseDrink.sips === 0 && c.afterRefuseDrink.thirst - c.end.thirst > 34 && c.afterSecondHold.thirst - c.afterRefuseDrink.thirst < 1;
      put('F08', passA && passB && passC, { drinkThenGive: { early: a.afterEarly, end: a.end, thirstGain: gainA }, giveOnly: { end: b.end, thirstGain: gainB }, refuseThenDrink: { end: c.end, afterDrink: c.afterRefuseDrink, afterSecondHold: c.afterSecondHold } });
    }
  } catch (e) { errors.push(String(e && e.stack || e).slice(0, 500)); }
  await browser.close(); server.close();
  for (const id of ['F07', 'F08', 'F09', 'F10', 'F23']) if (want(id) && !items[id]) items[id] = { pass: false, detail: 'did not run' };
  const all = Object.values(items).every(i => i.pass) && errors.length === 0;
  console.log(JSON.stringify({ items, errors }));
  process.exit(all ? 0 : 1);
})();
