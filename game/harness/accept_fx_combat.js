/**
 * Acceptance checks — group fx_combat (combat & movement): F02 F03 F06 F20 F22 F29 D01.
 *   node tools/shot.cjs "/harness/harness.html?m=accept_fx_combat&test=1" --quiet \
 *     --until "window.__harness && (window.__harness.ready || window.__harness.error)" --print "await window.__harness.api.run()"
 * Optional `&only=F02,F06` runs a subset. Real chapters through the director (like scene `play`), sim time without rendering,
 * fastText OFF wherever timing matters. Input goes through G.input (the same path as the touch stick / buttons).
 */
export const assets = [];

export async function run(G, params) {
  const H = window.__hs;
  const only = params.only ? String(params.only).split(',') : null;
  const want = id => !only || only.includes(id);
  const wall = ms => new Promise(r => setTimeout(r, ms));
  let tk = 0;
  async function step(n = 1, dt = 1 / 60) {
    for (let i = 0; i < n; i++) { G.loop.render = false; G.loop.tick(dt); for (let k = 0; k < 10; k++) await null; if (++tk % 300 === 0) await wall(0); }
    G.loop.render = true;
  }
  async function go(ch, beat, fast = true) {
    G.state.fastText = fast; G.state.autoPlay = true;
    G.sys.director.startChapter(ch, beat); await wall(0); await step(2);
    for (let i = 0; i < 6000 && (G.state.mode === 'loading' || G.state.mode === 'boot'); i++) { await wall(25); G.loop.render = false; G.loop.tick(1 / 60); }
  }
  async function botUntil(fn, max = 6000) { let n = 0; while (!fn() && n++ < max) { H.bot.tick(1 / 60); await step(1); } return fn(); }
  const idle = () => G.input.feed({ move: { x: 0, y: 0 }, hold: [] });
  async function press(a = 'interact') { G.input.feed({ move: { x: 0, y: 0 }, hold: [] }); await step(1); G.input.feed({ hold: [a], press: [a] }); await step(1); G.input.feed({ hold: [] }); }
  const on = (n, f) => G.events.on(n, f);
  const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  const pl = () => G.actors.player;
  const fightKey = 'c3_wolves.fight.obj';
  const inFight = () => G.sys.objectives.current && G.sys.objectives.current.key === fightKey;
  const items = {};

  // ------------------------------------------------------------------------------------------------ F02
  async function F02() {
    const out = { swing: [], mount: [], stale: [] }; let pass = true;
    // (a) restart the beat at the start / middle / end of a torch swing: the brand must swing again afterwards
    await go(3, 'c3_wolves'); await botUntil(inFight);
    let swings = 0; const off = on('player:swing', () => swings++);
    for (const at of [0.05, 1.6, 3.2]) {
      G.state.fastText = false; idle(); await step(2);
      await press(); await step(Math.round(at * 60));
      const mid = pl().swinging;
      G.sys.director.restartBeat(); await step(3);
      G.state.fastText = true; await botUntil(inFight); G.state.fastText = false; idle(); await step(2);
      const s0 = swings; for (let i = 0; i < 5; i++) { await press(); await step(36); }
      const got = swings - s0; out.swing.push({ at, swingingWhenRestarted: mid, swingsFrom5Presses: got });
      if (got !== 5) pass = false;
    }
    off();
    // (b) restart c1_calm at the start / middle / end of the mount, redo it: c1_ride must only run with Dhari in the saddle
    let dur = 0;
    for (const frac of [0, 0.1, 0.5, 0.9]) {
      await go(1, 'c1_calm');
      let usedT = -1, mountedT = -1, rideObjMounted = null;
      const o1 = on('interact:use', e => { if (e.id === 'mount' && usedT < 0) { usedT = G.time.now; G.state.fastText = false; } });
      const o2 = on('player:mounted', () => { if (mountedT < 0) mountedT = G.time.now; });
      const o3 = on('objective:set', e => { if (e && e.key === 'c1_ride.obj' && rideObjMounted === null) rideObjMounted = pl().mounted === G.actors.camels.get('wadha') && pl().mode === 'mounted'; });
      await botUntil(() => usedT >= 0, 20000);
      if (frac === 0) { await botUntil(() => mountedT >= 0, 1200); dur = mountedT - usedT; o1(); o2(); o3(); continue; }   // measure the mount
      await step(Math.max(1, Math.round(frac * dur * 60)));
      const w = G.actors.camels.get('wadha');
      const mid = { mode: pl().mode, seated: !!pl().mounted };
      G.sys.director.restartBeat(); await step(3);
      const after = { mode: pl().mode, mounted: !!pl().mounted, ridden: w.ridden, kneel: w.kneeling };
      G.state.fastText = true; rideObjMounted = null;
      await botUntil(() => G.state.beat === 'c1_ride', 20000);
      await botUntil(() => rideObjMounted !== null, 1200);
      const ok = rideObjMounted === true && pl().mounted === w && pl().mode === 'mounted' && w.ridden && !w.kneeling;
      out.mount.push({ frac, at: r2(frac * dur), mid, afterRestart: after, rideObjWhileMounted: rideObjMounted, mode: pl().mode, ridden: w.ridden, kneel: w.kneeling, ok });
      if (!ok) pass = false;
      o1(); o2(); o3();
    }
    out.mountSeconds = r2(dur);
    // (c) ownership: restart c1_ride while its own staging mount runs — the stale cancel must not undo the new mount
    for (const at of [0.2, 0.9, 1.6]) {
      await go(1, 'c1_calm'); await step(30);                   // on foot first: c1_ride's staging then has to mount her
      await go(1, 'c1_ride', false); idle();
      await step(Math.round(at * 60));
      const busy = pl().mode === 'scripted';
      G.sys.director.restartBeat(); await step(2);
      let n = 0; while (!(pl().mounted && pl().mode === 'mounted') && n++ < 900) { idle(); await step(1); }
      const w = G.actors.camels.get('wadha');
      const ok = !!pl().mounted && pl().mode === 'mounted' && w.ridden && !w.kneeling && G.state.beat === 'c1_ride';
      out.stale.push({ at, mountingWhenRestarted: busy, secondsToSaddle: r2(n / 60), ok });
      if (!ok) pass = false;
    }
    G.state.fastText = true;
    return { pass, detail: out };
  }

  // ------------------------------------------------------------------------------------------------ F03
  async function walkRun(script) {
    await go(5, 'c5_walk'); await step(5);
    G.state.fastText = false;
    const L = G.sys.director.level, fire = L.poi('fire'), foot = L.poi('foot'), P = pl();
    let shots = 0, end = null, fail = null, openedAt = null, t = 0, peak = 0, sum = 0, n = 0;
    const sfx = G.audio.sfx; G.audio.sfx = (id, o) => { if (id === 'sfx_shot') shots++; return sfx.call(G.audio, id, o); };
    const offs = [on('steady:end', e => { if (end === null) end = e.ok; }), on('beat:fail', e => { fail = e.textKey; })];
    const along = () => Math.hypot(P.pos.x - foot.x, P.pos.z - foot.z);
    let px = P.pos.x, pz = P.pos.z;
    try {
      for (let i = 0; i < 60 * 80; i++) {
        const mag = script(t, along());
        if (G.state.mode === 'play') H.bot.steer(fire, mag); else G.input.feed({ move: { x: 0, y: 0 }, hold: [], press: G.state.mode === 'dialogue' ? ['skip'] : [] });
        await step(1); t += 1 / 60;
        const v = Math.hypot(P.pos.x - px, P.pos.z - pz) * 60; px = P.pos.x; pz = P.pos.z;
        const r = G.sys.steady.activeRequest;
        if (r && r.kind === 'walk') { if (openedAt === null) openedAt = r2(along()); if (along() > 3 && along() < 40) { peak = Math.max(peak, v); sum += v; n++; } }
        if (fail || end !== null || G.state.beat !== 'c5_walk') break;
        if (mag <= 0.08 && t > 4 && openedAt === null) break;            // below the threshold nothing moves: 4 s is enough to see it
      }
    } finally { G.audio.sfx = sfx; offs.forEach(f => f()); idle(); }
    return { openedAtAlong: openedAt, shots, ok: end, fail, alongEnd: r2(along()), pace: n ? r2(sum / n) : 0, peak: r2(peak), secs: r2(t) };
  }
  async function F03() {
    const out = {}; let pass = true;
    for (const mag of [0.1, 0.15, 0.25, 0.6, 1.0]) {             // weak … strong touch: the challenge always runs, at the locked pace
      const r = await walkRun(() => mag); out['stick' + mag] = r;
      if (!(r.openedAtAlong !== null && r.openedAtAlong < 2 && r.shots === 2 && r.ok === true && Math.abs(r.pace - 1.5) < 0.12)) pass = false;
    }
    // steady but weaker mid-walk (0.6 → 0.12 → 0.6): still walking, never judged as stopping
    const v = await walkRun((t, a) => (a > 15 && a < 30 ? 0.12 : 0.6)); out.weakerMidWalk = v;
    if (!(v.ok === true && v.shots === 2)) pass = false;
    // a real stop (thumb off 0.9 s) is a flinch: the rule is visible (he stops) and enforced
    const s = await walkRun((t, a) => (a > 10 && a < 10.5 ? 0 : 0.6)); out.realStop = s;
    if (!(s.ok === false || s.fail)) pass = false;
    // below the movement threshold the hero does not move at all: nothing to bypass
    const z = await walkRun(() => 0.05); out.belowThreshold = z;
    if (!(z.alongEnd < 0.6 && z.openedAtAlong === null)) pass = false;
    return { pass, detail: out };
  }

  // ------------------------------------------------------------------------------------------------ F06
  async function F06() {
    const out = {}; let pass = true;
    await go(3, 'c3_wolves'); await botUntil(inFight);
    G.state.fastText = false; idle(); await step(2);
    // recovery numbers: second press 0.5 s later → second swing; a press 0.2 s after a swing is buffered to SWING_RECOVER
    const ts = []; const off = on('player:swing', () => ts.push(G.time.now));
    await press(); await step(28); await press(); await step(10); await press(); await step(60);
    out.swingTimes = ts.map(x => r2(x - ts[0]));
    if (!(ts.length === 3 && ts[1] - ts[0] < 0.55 && ts[2] - ts[1] >= 0.44 && ts[2] - ts[1] <= 0.5)) pass = false;
    off();
    // a whole fight with fastText off: one press per telegraph, 1.0 s after it, camera turned to that wolf (pairs: 0.6 s apart)
    const q = []; let bites = 0, rep = 0, tele = [];
    const o1 = on('wolf:telegraph', e => { if (e.wolf) { q.push({ t: G.time.now + 1.0, w: e.wolf }); tele.push(r2(G.time.now)); } });
    const o2 = on('wolf:bite', () => bites++), o3 = on('wolf:repelled', () => rep++);
    let pairGap = null; const lt = []; const o4 = on('wolf:lunge', () => lt.push(G.time.now));
    let n = 0;
    while (G.state.beat === 'c3_wolves' && n++ < 60 * 150) {
      if (q.length && G.time.now >= q[0].t && G.state.mode === 'play') {
        const { w } = q.shift(), P = pl(); G.actors.cam.yaw = Math.atan2(w.x - P.pos.x, w.z - P.pos.z);
        G.input.feed({ hold: ['interact'], press: ['interact'] }); await step(1); idle(); continue;
      }
      if (G.state.mode !== 'play') G.input.feed({ move: { x: 0, y: 0 }, hold: [], press: G.state.mode === 'dialogue' ? ['skip'] : [] }); else idle();
      await step(1);
    }
    for (let i = 1; i < lt.length; i++) { const g = lt[i] - lt[i - 1]; if (g < 1.0 && (pairGap === null || g < pairGap)) pairGap = r2(g); }
    o1(); o2(); o3(); o4();
    out.fight = { telegraphs: tele.length, repelled: rep, bites, pairLungeGap: pairGap, reachedAlpha: G.state.beat === 'c3_alpha' };
    if (!(bites === 0 && rep === tele.length && pairGap !== null && pairGap <= 0.65 && G.state.beat === 'c3_alpha')) pass = false;
    G.state.fastText = true;
    return { pass, detail: out };
  }

  // ------------------------------------------------------------------------------------------------ F20
  async function F20() {
    const out = {}; let pass = true; let steps = 0; const off = on('player:step', () => steps++);
    async function wallTest(label, secs, backSecs, backMag, backFeed) {
      const P = pl(), cols = G.world.props.colliders, f = { x: Math.sin(P.yaw), z: Math.cos(P.yaw) };
      const c = { x: P.pos.x + f.x * 2.0, z: P.pos.z + f.z * 2.0 }, wl = [];
      for (let k = -4; k <= 4; k++) { const w = { x: c.x + f.z * k * 0.9, z: c.z - f.x * k * 0.9, r: 0.8 }; wl.push(w); cols.push(w); }
      for (let i = 0; i < 90; i++) { H.bot.steer(c, 1); await step(1); }
      const s0 = steps, x0 = P.pos.x, z0 = P.pos.z;
      for (let i = 0; i < secs * 60; i++) { H.bot.steer(c, 1); await step(1); }
      const blocked = { steps: steps - s0, moved: r3(Math.hypot(P.pos.x - x0, P.pos.z - z0)) };
      const away = { x: P.pos.x - f.x * 30, z: P.pos.z - f.z * 30 }, s1 = steps, x1 = P.pos.x, z1 = P.pos.z; let first = -1;
      for (let i = 0; i < backSecs * 60; i++) { if (backFeed) G.input.feed({ move: backFeed }); else H.bot.steer(away, backMag); await step(1); if (first < 0 && steps > s1) first = r2(i / 60); }
      for (const w of wl) cols.splice(cols.indexOf(w), 1);
      idle();
      out[label] = { blocked, away: { firstStep: first, steps: steps - s1, moved: r2(Math.hypot(P.pos.x - x1, P.pos.z - z1)) } };
      return out[label];
    }
    await go(1, 'c1_trail'); await botUntil(() => G.state.mode === 'play', 600); G.state.fastText = false; await step(5);
    // normal walking keeps its cadence (0.62 m per step at walking pace)
    { const P = pl(), s0 = steps, x0 = P.pos.x, z0 = P.pos.z, tg = { x: P.pos.x + Math.sin(P.yaw) * 40, z: P.pos.z + Math.cos(P.yaw) * 40 };
      for (let i = 0; i < 180; i++) { H.bot.steer(tg, 0.6); await step(1); }
      const d = Math.hypot(P.pos.x - x0, P.pos.z - z0); out.walk = { metres: r2(d), steps: steps - s0, perStep: r2(d / Math.max(1, steps - s0)) };
      if (!(out.walk.perStep > 0.5 && out.walk.perStep < 0.8)) pass = false; idle(); await step(30); }
    const a = await wallTest('foot', 3, 1, 0.6);
    if (!(a.blocked.steps <= 1 && a.blocked.moved < 0.05 && a.away.firstStep >= 0 && a.away.firstStep <= 0.5 && a.away.moved >= 1)) pass = false;
    await go(1, 'c1_ride'); await botUntil(() => pl().mounted && pl().mode === 'mounted', 1200); G.state.fastText = false; await step(5);
    const b = await wallTest('camel', 2, 5, 1, { x: -0.8, y: 0.6 });   // a camel cannot back up: forward-left, she turns off the wall
    if (!(b.blocked.steps <= 1 && b.blocked.moved < 0.1 && b.away.steps >= 2 && b.away.moved >= 2)) pass = false;
    off(); G.state.fastText = true;
    return { pass, detail: out };
  }

  // ------------------------------------------------------------------------------------------------ F22
  async function F22() {
    const near = [1.5, 3, 5, 7], far = [10, 12, 20, 30], D = [...near, ...far];
    await go(3, 'c3_wolves'); await botUntil(inFight);
    G.state.fastText = false;
    const P = pl(), cam = G.actors.cam, hwar = G.actors.camels.get('hwar');
    const rows = []; let k = 0, pend = null;
    const offs = [
      on('wolf:telegraph', e => { if (pend || k >= D.length) return; pend = { t: G.time.now, w: e.wolf, d: D[k++], done: false }; }),
      on('wolf:repelled', e => { if (pend && e.wolf === pend.w) { rows.push({ d: pend.d, hit: true }); pend = null; } }),
      on('wolf:bite', e => { if (pend && e.wolf === pend.w) { rows.push({ d: pend.d, hit: false }); pend = null; } }),
    ];
    for (let i = 0; i < 60 * 240 && rows.length < D.length && G.state.beat === 'c3_wolves'; i++) {
      if (pend) {                                                  // stand `d` m to the side of the leap's midpoint, facing the wolf
        const w = pend.w, cx = hwar.pos.x, cz = hwar.pos.z, mx = (w.x + cx) / 2, mz = (w.z + cz) / 2;
        let px = -(cz - w.z), pz = cx - w.x; const l = Math.hypot(px, pz) || 1; px /= l; pz /= l;
        const sx = mx + px * pend.d, sz = mz + pz * pend.d, yaw = Math.atan2(w.x - sx, w.z - sz);
        P.teleport(sx, sz, yaw); cam.yaw = yaw;
        if (!pend.done && G.time.now - pend.t >= 1.3) { pend.done = true; P.swing(); }
      }
      idle(); await step(1);
    }
    offs.forEach(f => f()); G.state.fastText = true;
    const ok = rows.length === D.length && rows.every(r => r.hit === near.includes(r.d));
    return { pass: ok, detail: { reachM: 8, rows } };
  }

  // ------------------------------------------------------------------------------------------------ F29
  async function F29() {
    const out = {}; let pass = true; const fin = [];
    for (const hz of [30, 60, 120]) {
      await go(3, 'c3_fire'); await botUntil(() => G.state.mode === 'play', 600); G.state.fastText = false;
      const P = pl(), F = G.sys.director.level.poi('fire'), dt = 1 / hz;
      H.warp(F.x + 25, F.z, Math.PI / 2); await step(2, dt);
      const far = { x: F.x + 200, z: F.z }, rr = () => Math.hypot(P.pos.x - F.x, P.pos.z - F.z);
      let prev = rr(), sg = 0, flips = 0, path = 0, px = P.pos.x, pz = P.pos.z, maxIn = 0, lo = 1e9, hi = 0;
      for (let i = 0; i < 12 * hz; i++) {
        H.bot.steer(far, 1); await step(1, dt);
        const R = rr(), v = (R - prev) / dt; prev = R;
        const s = Math.abs(v) < 0.05 ? 0 : Math.sign(v);
        if (s) { if (sg && s !== sg) flips++; sg = s; }
        if (v < 0) maxIn = Math.max(maxIn, -v);
        path += Math.hypot(P.pos.x - px, P.pos.z - pz); px = P.pos.x; pz = P.pos.z;
        if (i >= 6 * hz) { lo = Math.min(lo, R); hi = Math.max(hi, R); }
      }
      const r12 = rr(); fin.push(r12);
      idle(); await step(Math.round(1.5 * hz), dt); const rel = rr();
      for (let i = 0; i < 2 * hz; i++) { H.bot.steer(F, 0.6); await step(1, dt); }
      out[hz + 'Hz'] = { flips, path: r2(path), net: r2(r12 - 25), settle: r3(r12), band: r3(hi - lo), maxInwardMps: r2(maxIn), afterRelease: r2(rel), afterWalkIn2s: r2(rr()) };
      if (!(flips <= 2 && hi - lo < 0.05 && maxIn < 1 && rel <= 30.1 && rr() <= 28)) pass = false;
      idle();
    }
    out.settleSpreadM = r3(Math.max(...fin) - Math.min(...fin));
    if (out.settleSpreadM > 0.05) pass = false;
    G.state.fastText = true;
    return { pass, detail: out };
  }

  // ------------------------------------------------------------------------------------------------ D01
  async function D01() {
    await go(3, 'c3_wolves'); await botUntil(inFight);
    G.state.fastText = false; G.state.ch3BotMiss = 6;              // the bot misses wave 1 twice (3 misses each), then plays it
    const att = [{ tele: [], lt: [] }]; let fails = 0; const hints = [];
    const offs = [
      on('wolf:telegraph', e => att[att.length - 1].tele.push(r2(e.in))),
      on('wolf:lunge', () => att[att.length - 1].lt.push(G.time.now)),
      on('hint:show', e => hints.push({ key: e.key, level: e.level, attempt: att.length })),
      on('objective:set', e => { if (e && e.key === fightKey && att[att.length - 1].tele.length) { att.push({ tele: [], lt: [] }); fails++; } }),
    ];
    let n = 0; while (att.length < 4 && fails < 3 && n++ < 60 * 150 && G.state.beat === 'c3_wolves') {
      if (att.length === 3 && att[2].tele.length >= 3 && G.sys.director.current) { /* third attempt under way */ }
      H.bot.tick(1 / 60); await step(1);
      if (att.length === 3 && att[2].lt.length >= 3) break;
    }
    offs.forEach(f => f()); G.state.ch3BotMiss = 0; G.state.fastText = true;
    const gaps = a => { const g = []; for (let i = 1; i < a.lt.length; i++) g.push(a.lt[i] - a.lt[i - 1]); return g.length ? r2(g.reduce((x, y) => x + y, 0) / g.length) : null; };
    const rows = att.map((a, i) => ({ attempt: i + 1, telegraph: a.tele[0] || null, lunges: a.lt.length, meanGapS: gaps(a) }));
    const h1 = hints.find(h => h.key === 'c3_wolves.fight.hint1' && h.attempt === 2), h2 = hints.find(h => h.key === 'c3_wolves.fight.hint2' && h.attempt === 3);
    const ok = rows.length >= 3 && rows[0].telegraph === 1.2 && rows[1].telegraph === 1.6 && rows[2].telegraph === 2 &&
      rows[1].meanGapS > rows[0].meanGapS + 0.5 && rows[2].meanGapS > rows[1].meanGapS + 0.5 && !!h1 && !!h2;
    return { pass: ok, detail: { attempts: rows, hints } };
  }

  const ALL = { F02, F03, F06, F20, F22, F29, D01 };
  return {
    async run() {
      for (const id of Object.keys(ALL)) {
        if (!want(id)) continue;
        try { items[id] = await ALL[id](); } catch (e) { items[id] = { pass: false, detail: 'threw: ' + String(e && e.stack || e).slice(0, 400) }; }
      }
      G.state.fastText = true;
      return { items, errors: H.errors.slice(-5) };
    },
  };
}
