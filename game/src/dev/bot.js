/**
 * Autoplay bot (tests only, ?test=1): finishes beats through public inputs + warps.
 *   await __hs.bot.run(chapter, beatId = null, { until: beatId | 'end', maxSteps = 40000, choices: {'c2_ration': 'child'}, realtime: false })
 *   realtime: true = fastText OFF (real dialogue pacing, real holds, real cinematics); the bot taps through dialogue and choices.
 * Each tick in mode 'play': warp next to the objective target (if any), then cycle: hold interact 1.8 s → release 0.2 s →
 * hold the eye 1.2 s → release 0.2 s. A beat may export `bot(G, bot)` for special moves (called every tick, return true to
 * skip the default behaviour). With G.state.fastText dialogue, cards, holds and cinematics resolve by themselves.
 */
import { pointOf, yawOf } from '../core/math.js';

export function createBot(G, api) {
  let t = 0, warpT = 0, skipT = 0;
  function tick(dt) {
    if (G.state.mode !== 'play') {
      // real-time runs: advance dialogue lines like a player tapping the screen
      skipT += dt; const tap = G.state.mode === 'dialogue' && skipT > 0.55; if (tap) skipT = 0;
      G.input.feed({ move: { x: 0, y: 0 }, hold: [], press: tap ? ['skip'] : [] }); return;
    }
    t += dt; warpT -= dt;
    const dir = G.sys.director, cur = dir.current, beat = cur && cur.beatDef;
    if (beat && beat.bot && beat.bot(G, bot) === true) return;
    const o = G.sys.objectives.current, pl = G.actors.player;
    let move = { x: 0, y: 0 };
    if (o && o.at) {
      const p = pointOf(o.at), dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, dist = Math.hypot(dx, dz);
      if (dist > 2.2 && warpT <= 0) { const k = (dist - 1.6) / dist; pl.teleport(pl.pos.x + dx * k, pl.pos.z + dz * k, yawOf(dx, dz)); if (G.actors.cam.snap) G.actors.cam.snap(); warpT = 0.5; }
      else if (dist > 0.9) move = { x: 0, y: 0.5 };
    }
    // a الثبات request or a hold verb in progress: keep the button down (a real player would); otherwise cycle tap / eye
    const req = G.sys.steady.activeRequest, v = G.sys.interact.verb, ph = t % 3.4;
    let hold;
    if (req) hold = ['interact'];
    else if (v && v.kind && v.progress > 0 && v.progress < 1) hold = ['interact'];
    else hold = ph < 1.8 ? ['interact'] : ph >= 2.0 && ph < 3.2 ? ['firasa'] : [];
    G.input.feed({ move: req ? { x: 0, y: 0 } : move, hold });
  }
  const bot = {
    tick,
    /** walk the hero in a straight line toward a point at stick magnitude `mag` (for beats that test real movement) */
    steer(target, mag = 1) {
      const p = pointOf(target), pl = G.actors.player, yaw = yawOf(p.x - pl.pos.x, p.z - pl.pos.z), cy = G.actors.cam.yaw || 0, a = yaw - cy;
      G.input.feed({ move: { x: -Math.sin(a) * mag, y: Math.cos(a) * mag }, hold: [] });
    },
    async run(chapter, beatId = null, o = {}) {
      G.state.autoChoice = o.choices || G.state.autoChoice || {};
      if (o.realtime) { G.state.fastText = false; G.state.autoPlay = true; }
      const log = []; let last = null, steps = 0, ended = false, waited = 0, peak = null;
      const offEnd = G.events.on('chapter:end', () => { ended = true; });
      await api.chapter(chapter, beatId);
      const max = o.maxSteps || 40000;
      while (steps < max) {
        if (G.state.beat !== last) { last = G.state.beat; log.push(`${steps}:${last}`); if (o.until && o.until !== 'end' && last === o.until) break; }
        if (ended || G.state.mode === 'end' || G.state.chapter !== chapter) break;
        if (G.state.mode === 'loading' || G.state.mode === 'boot') {            // assets load on wall-clock time: wait for real
          await new Promise(r => setTimeout(r, 25)); G.loop.render = false; G.loop.tick(1 / 60); waited += 25; if (waited > 120000) break; continue;
        }
        const probe = o.peak && steps % 20 === 0;
        tick(1 / 60); G.loop.render = !!probe; G.loop.tick(1 / 60); for (let k = 0; k < 10; k++) await null; steps++;
        if (probe) {
          const r = G.renderer.info.render;
          if (!peak || r.triangles > peak.tris) {
            peak = { tris: r.triangles, calls: r.calls, beat: G.state.beat, mode: G.state.mode, step: steps };
            if (o.peak === 'detail') {   // what was in view: triangles per named object, frustum-tested like the renderer
              const cam = G.camera, fr = new cam.constructor().constructor; void fr;
              const b = {}; G.scene.traverseVisible(ob => {
                if (!(ob.isMesh || ob.isPoints) || !ob.geometry) return;
                const g = ob.geometry, tri = ((g.index ? Math.min(g.index.count, g.drawRange.count) : Math.min(g.attributes.position.count, g.drawRange.count)) / 3) * (ob.isInstancedMesh ? ob.count : 1);
                let p = ob, tag = ''; while (p && !tag) { if (p.name && !/^(Scene|AuxScene|Armature|root)$/i.test(p.name)) tag = p.name; p = p.parent; }
                tag = (ob.isSkinnedMesh ? 'S:' : ob.isInstancedMesh ? 'I:' : '') + (tag || ob.type); b[tag] = (b[tag] || 0) + tri;
              });
              peak.top = Object.entries(b).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => k + '=' + Math.round(v / 100) / 10 + 'k').join(' ');
              peak.cam = [cam.position.x, cam.position.y, cam.position.z].map(v => Math.round(v));
            }
          }
        }
        if (steps % 300 === 299) await new Promise(r => setTimeout(r, 0));
      }
      offEnd(); G.loop.render = true; G.input.feed({ move: { x: 0, y: 0 }, hold: [] }); G.loop.tick(1 / 60);
      return { steps, log, beat: G.state.beat, chapter: G.state.chapter, flags: { ...G.state.flags }, errors: api.errors.slice(-5), timedOut: steps >= max, peak };
    },
  };
  /** the whole story in ONE session (natural chapter hand-over, no cold starts): await __hs.bot.runAll({ choices, maxSteps }) */
  bot.runAll = async function (o = {}) {
    G.state.autoChoice = o.choices || G.state.autoChoice || {};
    if (o.realtime) { G.state.fastText = false; G.state.autoPlay = true; }
    const log = []; let last = null, steps = 0, waited = 0, peakTris = 0, peakCalls = 0;
    await api.chapter(o.from || 1, null);
    const max = o.maxSteps || 120000;
    while (steps < max) {
      const tag = `${G.state.chapter}:${G.state.beat}`;
      if (tag !== last) { last = tag; log.push(`${steps}:${G.state.beat}`); }
      if (G.state.mode === 'end') break;
      if (G.state.mode === 'loading' || G.state.mode === 'boot') { await new Promise(r => setTimeout(r, 25)); G.loop.render = false; G.loop.tick(1 / 60); waited += 25; if (waited > 240000) break; continue; }
      tick(1 / 60); G.loop.render = steps % 400 === 0; G.loop.tick(1 / 60); for (let k = 0; k < 10; k++) await null; steps++;
      if (steps % 400 === 1) { const r = G.renderer.info.render; peakTris = Math.max(peakTris, r.triangles); peakCalls = Math.max(peakCalls, r.calls); }
      if (steps % 300 === 299) await new Promise(r => setTimeout(r, 0));
    }
    G.loop.render = true; G.input.feed({ move: { x: 0, y: 0 }, hold: [] }); G.loop.tick(1 / 60);
    return { steps, minutes: +(G.time.now / 60).toFixed(1), mode: G.state.mode, chapter: G.state.chapter, beat: G.state.beat, flags: { ...G.state.flags }, peakTris, peakCalls, errors: api.errors.slice(-6), timedOut: steps >= max, log };
  };
  return bot;
}
