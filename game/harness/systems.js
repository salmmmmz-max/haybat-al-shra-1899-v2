/**
 * Systems harness — ?m=systems&sys=interact|firasa|steady|brace|walk|survival|objectives|stars|tracks
 * Builds a tiny situation on the sandbox level and exposes drivers on window.__harness.api for --eval scripts.
 * All drivers use sim time (await __hs.step(n)). Results are read through api.log / api.state().
 */
export const assets = ['dhari', 'camel'];

export async function run(G, params) {
  G.sys.director.startChapter(1);
  for (let i = 0; i < 400 && !(G.actors.player.actor && G.state.mode !== 'loading'); i++) { await new Promise(r => setTimeout(r, 5)); G.loop.tick(1 / 60); }
  for (let i = 0; i < 10; i++) { G.loop.tick(1 / 60); await null; }
  G.sys.director.stop();           // keep the level, drop the chapter script
  G.setMode('play');
  G.state.fastText = params.fast === '1';
  G.sys.firasa.setAllowed(true);
  const pl = G.actors.player;
  pl.teleport(0, 0, 0); G.actors.cam.snap && G.actors.cam.snap();
  const log = [];
  const on = (n) => G.events.on(n, e => log.push(n + (e && typeof e === 'object' ? ' ' + JSON.stringify(e) : '')));
  ['interact:use', 'firasa:seen', 'firasa:ping', 'steady:start', 'steady:end', 'steady:stage', 'stars:found', 'survival:level', 'survival:drink', 'survival:collapse', 'objective:set', 'objective:done', 'hint:show'].forEach(on);
  const api = { log, results: {}, sys: params.sys || 'interact' };
  const S = G.sys;
  G.actors.cam.yaw = 0; G.actors.cam.snap && G.actors.cam.snap();
  for (let i = 0; i < 5; i++) G.loop.tick(1 / 60);
  // 'ahead' = along the camera yaw (forward = (sin yaw, cos yaw)), so the view axis points at it
  const ahead = (d) => ({ x: pl.pos.x + Math.sin(G.actors.cam.yaw) * d, z: pl.pos.z + Math.cos(G.actors.cam.yaw) * d });

  switch (api.sys) {
    case 'interact': {
      const at = ahead(1.5);
      api.entry = S.interact.add({ id: 'box', at, label: 'steady.hold', onUse: () => { api.results.used = (api.results.used || 0) + 1; } });
      api.hold = S.interact.add({ id: 'well', at: ahead(-1.5), hold: 1, label: 'steady.hold', onUse: () => { api.results.drawn = true; } });
      break;
    }
    case 'firasa': {
      const at = ahead(20);
      api.clue = S.firasa.addClue({ id: 'sign1', at, type: 'sign', onSeen: () => { api.results.seen = true; } });
      api.at = at;
      break;
    }
    case 'steady': case 'brace': case 'walk': {
      const at = ahead(12);
      api.at = at;
      api.hold = (o = {}) => { api.results.hold = undefined; S.steady.hold({ target: at, seconds: 2, ...o }).then(v => { api.results.hold = v; }); };
      api.brace = (o = {}) => { api.results.brace = undefined; S.steady.brace({ warn: 1, impactAt: 1, ...o }).then(v => { api.results.brace = v; }); };
      api.walk = (o = {}) => { api.results.walk = undefined; const w = S.steady.walk({ to: at, radius: 3, speed: 1.5, ...o }); api.w = w; w.done.then(v => { api.results.walk = v; }); return w; };
      break;
    }
    case 'survival': {
      S.survival.set({ thirst: 100, sips: 2, drain: true });
      break;
    }
    case 'objectives': {
      const T = (G.story && G.story.text) || null;
      if (T) { T['h.obj'] = 'objective'; T['h.hint1'] = 'hint one'; T['h.hint2'] = 'hint two'; }
      api.set = (o = {}) => S.objectives.set('h.obj', { at: ahead(60), ...o });
      break;
    }
    case 'stars': {
      G.world.sky.setPreset && await G.world.sky.setPreset('night');
      api.find = (o = {}) => { api.results.found = undefined; S.stars.find({ star: 'polaris', ...o }).then(() => { api.results.found = true; }); };
      break;
    }
    case 'tracks': {
      const pts = []; for (let i = 0; i <= 12; i++) pts.push({ x: i * 6, z: Math.sin(i / 2) * 3 });
      api.tr = S.tracks.add({ id: 't1', points: pts, kind: 'camel', gaps: [[5, 6]] });
      api.pts = pts;
      break;
    }
    default: throw new Error('unknown sys ' + api.sys);
  }
  api.state = () => ({
    verb: { ...S.interact.verb, at: null }, firasa: { active: S.firasa.active, amount: +S.firasa.amount.toFixed(3) },
    steady: { p: +S.steady.progress.toFixed(3), req: S.steady.activeRequest && S.steady.activeRequest.kind, tension: +S.steady.tension.toFixed(2) },
    thirst: +S.survival.thirst.toFixed(2), sips: S.survival.sips, drinkP: +S.survival.drinkProgress.toFixed(2),
    obj: S.objectives.current, hint: S.objectives.hint, marks: S.objectives.marks.map(m => ({ ...m, at: undefined, bearingFn: undefined })),
    stars: S.stars.active && { ...S.stars.active },
  });
  return api;
}
