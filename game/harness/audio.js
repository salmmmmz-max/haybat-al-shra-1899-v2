/**
 * Audio smoke scene (KERNEL/lead):  ?m=audio&test=1  then  await __harness.api.runAll()  → [[label, peakRMS], …]
 * Every entry must be > 0 (the engine produced signal). Runs on wall-clock time (WebAudio), not sim time.
 */
export const assets = ['dhari', 'a:music_march', 'a:music_night', 'a:sfx_camel', 'a:sfx_drum', 'a:sfx_rain', 'a:sfx_gust', 'a:sfx_snarl', 'a:sfx_torch', 'a:sfx_water', 'a:sfx_howl'];
export async function run(G) {
  const A = G.audio;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pump = async ms => { let peak = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { A.update(0.016); peak = Math.max(peak, A.level); await wait(16); } return peak; };
  async function probe(label, fn, ms = 400) { await pump(120); fn(); return [label, +(await pump(ms)).toFixed(4)]; }
  return {
    async runAll() {
      A.unlock(); A.setVolumes({ master: 1, music: 1, sfx: 1 });
      await pump(900);                                   // let buffers decode
      const out = [['state', A.state], ['silence', +(await pump(200)).toFixed(4)]];
      out.push(await probe('sfx_camel', () => A.sfx('sfx_camel')));
      out.push(await probe('sfx_positional', () => A.sfx('sfx_snarl', { at: { x: G.camera.position.x + 6, z: G.camera.position.z } })));
      out.push(await probe('step_sand', () => A.step('sand', 1)));
      out.push(await probe('step_gravel', () => A.step('gravel', 1)));
      out.push(await probe('step_camel', () => A.step('camel', 1)));
      out.push(await probe('note', () => A.note(3)));
      out.push(await probe('ui_confirm', () => A.ui('confirm')));
      out.push(await probe('thump', () => A.thump(1)));
      out.push(await probe('heartbeat', () => A.heartbeat(90), 900)); A.heartbeat(0);
      out.push(await probe('events_steady_ok', () => { G.events.emit('steady:start', {}); G.events.emit('steady:end', { ok: true }); }, 600));
      out.push(await probe('events_step', () => G.events.emit('player:step', { x: 0, z: 0, yaw: 0, foot: 'L', surface: 'sand', run: true, camel: false })));
      out.push(await probe('events_gust', () => G.events.emit('weather:gust', { strength: 1, duration: 1 }), 700));
      const lp = A.loop('sfx_rain', { volume: 1 });
      out.push(['loop_rain', +(await pump(700)).toFixed(4)]); lp.stop(0.1); await pump(400);
      A.ambience({ wind: 1, storm: 1 }); out.push(['amb_storm', +(await pump(1500)).toFixed(4)]);
      A.ambience({ wind: 0, storm: 0, fire: 1 }); await pump(1200); out.push(['amb_fire', +(await pump(900)).toFixed(4)]);
      A.ambience({ wind: 0, storm: 0, fire: 0, night: 0 }); await pump(2500);
      out.push(['amb_off', +(await pump(300)).toFixed(4)]);
      A.music('music_march', { fade: 0.3 }); out.push(['music', +(await pump(1500)).toFixed(4)]);
      A.duck(-20, 1); await pump(600); out.push(['music_ducked', +(await pump(300)).toFixed(4)]);
      A.music('music_night', { fade: 0.3 }); await pump(900); out.push(['music_switch', +(await pump(600)).toFixed(4)]);
      A.music(null, { fade: 0.2 }); await pump(1500); out.push(['music_off', +(await pump(300)).toFixed(4)]);
      return out;
    },
  };
}
