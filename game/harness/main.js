/**
 * Dev harness — runs ONE module demo scene:  /harness/harness.html?m=<name>[&test=1][&dev=1][&q=low]
 * Each harness/<name>.js exports:
 *   export const assets = ['dhari', 'camel'];        // optional: model ids to load first (textures: 't:<id>', audio: 'a:<id>')
 *   export async function run(G, params) { … }       // build the scene; may return an object exposed as window.__harness.api
 * window.__harness = { G, ready, api, error }.  With ?test=1 the loop is not started: drive it with __hs.step().
 */
import { createGame } from '../src/core/game.js';
import { createOverlay } from '../src/dev/overlay.js';
import { createTestApi } from '../src/dev/testapi.js';
import { MODS } from 'hs-registry';

const q = new URLSearchParams(location.search);
const name = q.get('m');
const H = (window.__harness = { ready: false, G: null, api: null, error: null, mods: Object.keys(MODS) });
(async () => {
  try {
    const mod = MODS[name];
    if (!mod) throw new Error(`unknown harness module "${name}". Available: ${Object.keys(MODS).join(', ')}`);
    const test = q.get('test') === '1';
    const G = createGame(document.getElementById('game'), { test, dev: true, seed: +(q.get('seed') || 1899) });
    H.G = G;
    if (q.get('q')) G.quality.set(q.get('q'));
    G.quality.freeze(true);
    G.dev = { overlay: createOverlay(G) }; G.loop.add(G.dev.overlay, 99);
    G.dev.test = createTestApi(G);
    await G.assets.loadManifest();
    for (const id of mod.assets || []) {
      if (id.startsWith('t:')) await G.assets.loadTexture(id.slice(2));
      else if (id.startsWith('a:')) await G.assets.loadAudio(id.slice(2));
      else await G.assets.loadModel(id);
    }
    G.ui.loading.show(false);
    G.setMode('play');
    H.api = (await mod.run(G, Object.fromEntries(q.entries()))) || null;
    if (!test) G.loop.start(); else G.loop.tick(1 / 60);
    H.ready = true;
  } catch (e) { H.error = String(e && e.stack || e); console.error('[harness]', e); }
})();
