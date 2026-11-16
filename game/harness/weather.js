/** weather harness: ?preset=<sky> &dust=0..1 &storm=0..1 &rain=0..1 &gust=1 &wind=<deg> */
export const assets = ['dhari', 'camel'];
export async function run(G, params = {}) {
  G.sys.director.startChapter(1);
  for (let i = 0; i < 400 && G.state.mode !== 'play'; i++) await new Promise(r => setTimeout(r, 50));
  const W = G.world.weather;
  if (params.preset) G.world.sky.setPreset(params.preset, { duration: 0 });
  W.setWind(+(params.wind || 250), 0.6);
  if (params.dust) W.setDust(+params.dust);
  if (params.storm) W.storm(+params.storm);
  if (params.rain) W.rain(+params.rain);
  if (params.gust) W.gust({ warn: 1, strength: 1, duration: 1.5 });
  const p = G.actors.player.pos, h = G.world.terrain.heightAt(p.x, p.z);
  G.actors.cam.cut([p.x, h + 1.7, p.z], [p.x + 8 * Math.sin(Math.PI), h + 1.2, p.z + 8]);
  return {};
}
