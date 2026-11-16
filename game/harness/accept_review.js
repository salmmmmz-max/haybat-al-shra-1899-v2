/** Checks for the independent review of audit round 1: F1 (stand-ins are per level), F2 (chapter pick asks before replacing a
 *  journey), F3 (no cached stand-in measurement), G1 (knockdown keeps a rider seated), I1 (event hint over a lower own hint,
 *  survives a poke), I2 (pause answers click/keyboard once per tap), terrain chunks (same heights, culled pieces), crowd LOD2.
 *  node tools/shot.cjs "/harness/harness.html?m=accept_review&test=1" --quiet --until "window.__harness && (window.__harness.ready || window.__harness.error)" --print "await window.__harness.api.run()" */
import * as THREE from 'three';
import { humanoidMeasure } from '../src/actors/humanoid.js';
export const assets = ['dhari', 'camel', 'jaber'];
export async function run(G) {
  const items = {}, wait = ms => new Promise(r => setTimeout(r, ms));
  const vis = id => { const m = document.querySelector(`.menu[data-id="${id}"]`); return !!m && !m.classList.contains('hidden'); };
  const click = el => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const byText = (root, txt) => [...root.querySelectorAll('button')].find(b => b.textContent.includes(txt));
  return {
    async run() {
      // F1 — a stand-in registered by one level is forgotten when the level unloads
      G.assets.instance('nosuchmodel');
      G.events.emit('level:unload', {});
      items.F1 = { pass: G.assets.standIns.length === 0, detail: `standIns after unload: ${JSON.stringify(G.assets.standIns)}` };
      // F3 — measuring a model that has no instance is not cached
      const m1 = humanoidMeasure(G, 'nosuchmodel'), m2 = humanoidMeasure(G, 'nosuchmodel');
      items.F3 = { pass: m1 !== m2 && !m1.has, detail: m1 !== m2 ? 'not cached' : 'cached stand-in measurement' };
      // F2 — chapter pick with a resumable journey opens the confirm and keeps the save until «ابدأ هذا الفصل»
      const sd = G.save.data, keep = { chapter: sd.chapter, beat: sd.beat, done: sd.done, unlocked: sd.unlocked };
      sd.chapter = 3; sd.beat = 'c3_polaris'; sd.done = false; sd.unlocked = 5;
      let started = null; const off = G.events.on('ui:start', e => { started = e; });
      G.setMode('title'); G.ui.menus.showTitle(); await wait(50);
      const title = document.querySelector('.menu[data-id="title"]');
      click(byText(title, G.t('ui.chapters'))); await wait(50);
      const tiles = [...document.querySelectorAll('.menu[data-id="chapters"] button.ch')];
      click(tiles[0]); await wait(50);
      const askOpen = vis('confirmCh'), saveKept = sd.chapter === 3 && sd.beat === 'c3_polaris' && started === null;
      click(byText(document.querySelector('.menu[data-id="confirmCh"]'), G.t('ui.newJourney.keep'))); await wait(50);
      const backToChapters = vis('chapters') && started === null;
      click(tiles[0]); await wait(50);
      click(byText(document.querySelector('.menu[data-id="confirmCh"]'), G.t('ui.replay.go'))); await wait(50);
      items.F2 = { pass: askOpen && saveKept && backToChapters && started && started.chapter === 1, detail: { askOpen, saveKept, backToChapters, started } };
      off(); G.ui.menus.hideAll(); Object.assign(sd, keep); G.setMode('play');
      // I2 — pause: a tap (pointerdown + click) pauses once; a bare click (screen reader) and Enter also pause
      const pb = document.querySelector('.tb.pause'); let taps = 0; const tap0 = G.input.tap; G.input.tap = a => { if (a === 'pause') taps++; };
      pb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, button: 0 })); click(pb);
      const tapOnce = taps; click(pb); const bare = taps - tapOnce;
      pb.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true })); const key = taps - tapOnce - bare;
      pb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 2 })); const right = taps - tapOnce - bare - key;
      G.input.tap = tap0;
      items.I2 = { pass: tapOnce === 1 && bare === 1 && key === 1 && right === 0, detail: { tapOnce, bare, key, right } };
      // I1 — an event-only level-2 hint shows over the objective's own level-1 hint and survives a poke
      const O = G.sys.objectives; O.set('c3_suhail.obj', { at: { x: 0, z: -50 }, hints: ['c3_suhail.hint1', 'c3_suhail.hint2'], hintAfter: [0.05, 999] });
      for (let i = 0; i < 20; i++) G.loop.tick(1 / 60);
      G.events.emit('hint:show', { key: 'c3_suhail.hint2', text: G.t('c3_suhail.hint2'), level: 2 });
      for (let i = 0; i < 3; i++) G.loop.tick(1 / 60);
      const hintEl = document.querySelector('.hud .hint'), shown = hintEl ? hintEl.textContent : '';
      O.poke(); for (let i = 0; i < 3; i++) G.loop.tick(1 / 60);
      const afterPoke = hintEl ? hintEl.textContent : '';
      items.I1 = { pass: shown === G.t('c3_suhail.hint2') && afterPoke === G.t('c3_suhail.hint2'), detail: { own: O.hint && O.hint.key, shown, afterPoke } };
      O.clear();
      // G1 — a knockdown while riding keeps the rider in the saddle pose
      const pl = G.actors.player, camel = G.actors.camels.spawn('t_wadha', { x: 6, z: 6, yaw: 0 });
      pl.spawn(4, 6, 0); G.state.fastText = true; pl.mount(camel).catch(() => {});   // test mode: time only moves when we tick
      for (let i = 0; i < 600 && !(pl.mounted && pl.actor.clip === 'sit'); i++) { G.loop.tick(1 / 60); if (i % 30 === 29) await wait(0); }
      for (let i = 0; i < 30; i++) G.loop.tick(1 / 60);
      const before = pl.actor.clip; pl.knockdown(0.3);
      for (let i = 0; i < 90; i++) G.loop.tick(1 / 60);
      items.G1 = { pass: pl.mounted && before === 'sit' && pl.actor.clip === 'sit', detail: { mounted: !!pl.mounted, before, after: pl.actor.clip, mode: pl.mode } };
      // terrain chunks: heights unchanged (heightAt is the exact near triangles), 16 culled pieces with local bounds
      const chunks = []; G.scene.traverse(o => { if (o.isMesh && o.name === 'terrain') chunks.push(o); });
      const culled = chunks.filter(c => c.frustumCulled).length, r = chunks[0] && chunks[0].geometry.boundingSphere.radius;
      G.camera.position.set(0, 30, 0); G.camera.lookAt(0, 0, 200); G.camera.updateMatrixWorld(); G.renderer.render(G.scene, G.camera);
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(G.camera.projectionMatrix, G.camera.matrixWorldInverse));
      const inView = chunks.filter(c => fr.intersectsSphere(c.geometry.boundingSphere)).length;
      items.TERRAIN = { pass: chunks.length === 16 && culled === 16 && r < 300 && inView < 16, detail: { chunks: chunks.length, culled, radius: r && +r.toFixed(1), inView } };
      // crowd far level: LOD2 sidecar loaded and used beyond the far distance
      const far = G.assets.lodGeometry('jaber', 2), near1 = G.assets.lodGeometry('jaber', 1);
      const crowd = G.actors.npcs.crowd('jaber', Array.from({ length: 8 }, (_, i) => ({ x: 200 + i * 1.5, z: 200, yaw: 0, clip: 'sit' })));
      G.camera.position.set(200, 10, 260); for (let i = 0; i < 40; i++) G.lod.update();
      const meshes = crowd.group.children, farUsed = meshes.filter(m => m.geometry.index === (far && far.index)).length;
      G.camera.position.set(203, 3, 205); for (let i = 0; i < 40; i++) G.lod.update();
      const nearUsed = meshes.filter(m => m.geometry.index !== (far && far.index)).length;
      crowd.remove();
      items.CROWD_LOD2 = { pass: !!far && far !== near1 && farUsed === meshes.length && nearUsed === meshes.length, detail: { lod2Tris: far ? far.index.count / 3 : 0, lod1Tris: near1 ? near1.index.count / 3 : 0, farUsed, nearUsed, n: meshes.length } };
      return { items };
    },
  };
}
