/**
 * Main loop. One tick = sample input → advance scopes → systems.update (ascending order) → systems.lateUpdate → render.
 * dt is the clamped real frame time (variable); in test mode nobody calls start() and the test API ticks with dt = 1/60.
 * Paused (G.time.scale === 0): sim time and scopes stop; only systems with `runWhenPaused = true` update. Rendering continues.
 */
import { clamp } from './math.js';

/** Canonical system orders (ARCHITECTURE §2). */
export const ORDER = {
  director: 10, player: 20, npcs: 30, camels: 32, caravan: 34, wolves: 36,
  interact: 40, firasa: 42, steady: 44, survival: 46, objectives: 48, stars: 50, tracks: 52,
  weather: 60, sky: 62, props: 64, decals: 66, terrain: 68,
  cam: 80, audio: 90, ui: 95, dev: 99,
};

export function createLoop(G) {
  /** @type {{sys:any, order:number}[]} */
  const systems = [];
  let raf = 0, last = 0, running = false, renderOn = true;

  function add(sys, order = 50) {
    if (!sys) return sys;
    systems.push({ sys, order });
    systems.sort((a, b) => a.order - b.order);
    return sys;
  }

  function tick(dt) {
    const t = G.time;
    t.dt = dt; t.frame++;
    G.input.sample(dt);
    const paused = t.scale === 0;
    if (!paused) {
      t.now += dt;
      G.rootScope.update(dt);
      if (G.levelScope && G.levelScope !== G.rootScope) G.levelScope.update(dt);
      if (G.scope !== G.rootScope && G.scope !== G.levelScope) G.scope.update(dt);
    }
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i].sys;
      if (s.update && (!paused || s.runWhenPaused)) s.update(dt);
    }
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i].sys;
      if (s.lateUpdate && (!paused || s.runWhenPaused)) s.lateUpdate(dt);
    }
    if (renderOn) G.renderer.render(G.scene, G.camera);
  }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let ms = ts - last; last = ts;
    if (ms <= 0) ms = 16.7;
    // Quality must see slow frames as slow; clamping simulation is a separate concern.
    // visibilitychange resets the clock so returning to the tab is not a GPU sample.
    G.quality.onFrame(Math.min(ms, 1000));
    tick(clamp(ms / 1000, 1 / 240, 1 / 20));
  }

  return {
    add, tick,
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resetClock() { last = performance.now(); },
    get running() { return running; },
    /** tests: skip the draw while fast-forwarding */
    get render() { return renderOn; }, set render(v) { renderOn = !!v; },
    systems,
  };
}
