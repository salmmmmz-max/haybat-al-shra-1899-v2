/**
 * Boot. URL flags: ?dev=1 (overlay) · ?test=1 (no RAF, window.__hs test API) · ?q=low|medium|high · ?ch=N&beat=id (jump)
 */
import { createGame } from './core/game.js';
import { LEVELS } from './chapters/levels.js';

const q = new URLSearchParams(location.search);
// dev tools exist only in development builds (the production bundle contains no test API)
const TEST = __DEV__ && q.get('test') === '1', DEV = __DEV__ && (q.get('dev') === '1' || TEST);

function fatal(msg) {
  const el = document.getElementById('hs-fatal');
  if (el) { el.textContent = 'تعذّر تشغيل اللعبة على هذا المتصفح. حدّث الصفحة أو جرّب متصفحًا آخر.'; el.classList.remove('hidden'); }
  console.error('[fatal]', msg);
}

async function boot() {
  const canvas = document.getElementById('game');
  let G;
  try { G = createGame(canvas, { test: TEST, dev: DEV, seed: +(q.get('seed') || 1899) }); }
  catch (e) { fatal(e); return; }
  window.addEventListener('error', e => G.events.emit('error', { message: String(e.message) }));
  G.events.on('fatal', e => fatal(e.error));
  if (q.get('q')) G.quality.set(q.get('q'));
  if (__DEV__ && DEV) { const { createOverlay } = await import('./dev/overlay.js'); G.dev = { overlay: createOverlay(G) }; G.loop.add(G.dev.overlay, 99); window.__G = G; }

  G.ui.loading.show(true); G.ui.loading.set(0.05);
  await G.assets.loadManifest();
  await G.assets.loadGroup('boot', p => G.ui.loading.set(0.05 + p * 0.25));

  // pause when the tab is hidden; resume audio/time when it returns
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { G.audio.suspend(); if (G.state.mode === 'play' && G.time.scale !== 0) { G.setPaused(true); G.ui.menus.showPause(true); } }
    else G.audio.resume();
  });
  // first gesture unlocks audio
  const unlock = () => { G.audio.unlock(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);

  // a write that did not reach the store: say so once per failure streak (non-blocking); the next checkpoint tries again
  G.events.on('save:failed', e => { if (e && e.first && G.ui && G.ui.hud) G.ui.hud.toast(G.t('ui.saveFailed'), 5); });
  // the player went on with stand-in characters: remind once the story is on screen
  G.events.on('assets:standins', () => { if (G.ui && G.ui.hud) G.ui.hud.toast(G.t('ui.loadStandIn'), 5); });

  G.events.on('ui:start', e => {
    const sd = G.save.data;
    if (e.chapter) G.sys.director.startChapter(e.chapter, e.beat || null);
    else if (e.continue && G.save.hasProgress) G.sys.director.startChapter(sd.chapter, sd.beat);
    else { if (G.save.hasProgress || sd.done) G.save.reset(); G.state.flags = G.save.data.flags; G.sys.director.startChapter(1); }
  });

  if (TEST) {
    G.quality.freeze(true);
    if (__DEV__) { const { createTestApi } = await import('./dev/testapi.js'); G.dev.test = createTestApi(G); }
    G.ui.loading.show(false);
    G.loop.tick(1 / 60);
    return;
  }
  G.loop.start();
  G.ui.loading.set(1);
  const ch = +(q.get('ch') || 0);
  if (ch) { G.ui.loading.show(false); G.sys.director.startChapter(ch, q.get('beat')); }
  else { titleScene(G); G.ui.loading.show(false); G.setMode('title'); G.ui.menus.showTitle(); }
}

/** Title backdrop: the dune sea at dawn with a slow gliding camera; chapter 1 assets stream in meanwhile. */
function titleScene(G) {
  const L = LEVELS.camp, T = G.world.terrain;
  const stage = () => { T.build({ seed: L.seed, ...L.terrain }); G.world.sky.setPreset('dawn'); G.world.weather.setWind(250, 0.3); G.world.weather.setDust(0.35, { duration: 0 }); };
  stage();
  G.events.on('state:mode', e => { if (e.mode === 'title') { G.world.level.unload(); stage(); t = 0; } });
  let t = 0;
  G.loop.add({ runWhenPaused: true, update(dt) {
    if (G.state.mode !== 'title') return;
    t += dt;
    const x = -150 + ((t * 1.4) % 300), z = 150 + 26 * Math.sin(t * 0.045), c = G.camera;
    const h = Math.max(T.heightAt(x, z), T.heightAt(x + 14, z - 3)) + 11;
    c.position.set(x, h, z); c.lookAt(x + 70, h - 7 + 1.5 * Math.sin(t * 0.07), z - 18);
  } }, 82);
  G.assets.loadGroup('common').then(() => G.assets.loadGroup('ch1')).catch(() => {});
}

boot();
