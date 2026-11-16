/** Lead acceptance checks: C01 (silence requested while the AudioContext is suspended), F25 (one verb for the brand), F28 (lineage branch).
 *  node tools/shot.cjs "/harness/harness.html?m=accept_lead&test=1" --quiet --until "window.__harness && (window.__harness.ready || window.__harness.error)" --print "await window.__harness.api.run()" */
export const assets = ['dhari', 'a:music_march', 'a:music_night'];
export async function run(G) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const A = G.audio;
  const pump = async ms => { let peak = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { A.update(0.016); peak = Math.max(peak, A.level); await wait(16); } return peak; };
  return {
    async run() {
      const items = {};
      // C01 — music(null) while suspended must be honoured on resume
      A.unlock(); A.setVolumes({ master: 1, music: 1, sfx: 1 }); A.ambience({ wind: 0, storm: 0, fire: 0, night: 0 }); await pump(2500);
      const floor = await pump(400);
      A.music('music_march', { fade: 0.2 }); const playing = await pump(1200);
      A.suspend(); await wait(150); A.music(null, { fade: 0.3 }); await wait(150); A.resume(); await pump(2200);
      const after = await pump(500);
      items.C01 = { pass: playing > 0.02 && after < Math.max(0.003, floor * 1.5), detail: `floor ${floor.toFixed(4)} · playing ${playing.toFixed(4)} → after music(null) during suspend + resume ${after.toFixed(4)}` };
      // F25 — the tutorial words match the button label
      const btn = G.t('verb.swing'), pr = G.story.text['c3_wolves.prompt.swing'] || '', h2 = G.story.text['c3_wolves.fight.hint2'] || '';
      items.F25 = { pass: pr.includes('«' + btn + '»') && h2.includes('«' + btn + '»') && !/اضرب/.test(pr + h2), detail: `button «${btn}» · prompt: ${pr} · hint2: ${h2}` };
      // F28 — the evasive branch explains how Thamer knows the lineage before r2.q addresses him as «ولد مانع»
      const c = (G.story.talk['c5_words.r1.c'] || []).map(l => l[1]).join(' ');
      items.F28 = { pass: /وسم مانع|عين مانع|من دمّه/.test(c) && /ولد مانع/.test((G.story.talk['c5_words.r2.q'] || []).map(l => l[1]).join(' ')), detail: c };
      return { items };
    },
  };
}
