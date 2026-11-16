/**
 * Test API (?test=1) → window.__hs. The RAF loop is not running: tests advance time with step().
 *   await __hs.step(n = 1, dt = 1/60)        tick n times, letting script continuations run between ticks
 *   await __hs.chapter(n, beatId?)           start/jump (cold)
 *   __hs.state()                             JSON snapshot
 *   __hs.warp(x, z, yaw?) · __hs.input(feed) · __hs.errors[]
 *   await __hs.until(fn, maxSteps = 6000)    step until truthy; returns steps used or -1
 */
import { createBot } from './bot.js';

export function createTestApi(G) {
  const errors = [];
  window.addEventListener('error', e => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', e => { const r = e.reason; if (r && r.name === 'BeatAbort') return; errors.push('unhandled: ' + String(r && r.stack || r)); });
  G.events.on('beat:error', e => errors.push(`beat ${e.beat}: ${e.error}`));

  async function flush() { for (let k = 0; k < 10; k++) await null; }
  const api = {
    G, errors, ready: true,
    /** tick n times; only the last tick is drawn (fast-forward) */
    async step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) { G.loop.render = i === n - 1; G.loop.tick(dt); await flush(); if (i % 600 === 599) await new Promise(r => setTimeout(r, 0)); }
      G.loop.render = true; return G.time.now;
    },
    async chapter(n, beatId = null) { G.sys.director.startChapter(n, beatId); await new Promise(r => setTimeout(r, 0)); await api.step(2); },
    async until(fn, maxSteps = 6000) {
      const f = fn;                                   // a function (G) => truthy
      let res = -1;
      G.loop.render = false;
      for (let i = 0; i < maxSteps; i++) { if (f(G)) { res = i; break; } G.loop.tick(1 / 60); await flush(); if (i % 240 === 239) await new Promise(r => setTimeout(r, 0)); }
      G.loop.render = true; G.loop.tick(1 / 60); await flush();
      return res;
    },
    warp(x, z, yaw) { G.actors.player.teleport(x, z, yaw); G.actors.cam.snap(); },
    input(feed) { G.input.feed(feed); },
    state() {
      const p = G.actors.player;
      return {
        mode: G.state.mode, chapter: G.state.chapter, beat: G.state.beat, flags: G.state.flags, time: +G.time.now.toFixed(2),
        player: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(2), mode: p.mode, speed: +p.speed.toFixed(2) },
        objective: G.sys.objectives.current && G.sys.objectives.current.key,
        interact: G.sys.interact.current && G.sys.interact.current.id,
        thirst: Math.round(G.sys.survival.thirst), sips: G.sys.survival.sips,
        render: { calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, textures: G.renderer.info.memory.textures, geometries: G.renderer.info.memory.geometries },
        errors: errors.length,
      };
    },
  };
  api.bot = createBot(G, api);
  window.__hs = api;
  return api;
}
