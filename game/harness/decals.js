/** decals harness: ?kind=hero|child|camel|wolf (default all) &fresh=1 &firasa=0..1 &reveal=1 &view=close|trail */
export const assets = ['dhari', 'camel', 'wolf'];
export async function run(G, params = {}) {
  G.sys.director.startChapter(1);
  for (let i = 0; i < 400 && G.state.mode !== 'play'; i++) await new Promise(r => setTimeout(r, 50));
  const p = G.actors.player.pos, cx = p.x + 6, cz = p.z + 6, T = G.world.terrain;
  const kinds = params.kind ? [params.kind] : ['hero', 'child', 'camel', 'wolf'];
  const D = G.world.decals;
  kinds.forEach((k, i) => {
    for (let j = 0; j < 6; j++) {
      const fresh = j % 2 === 0 ? 1 : 0;
      D.print(cx + i * 1.1 - 1.6, cz + j * 0.7 - 1.5, 0.3 * (j & 1), k, { fresh: params.fresh !== undefined ? +params.fresh : fresh, sd: j >> 1 & 1 });
    }
  });
  const pts = []; for (let i = 0; i <= 20; i++) pts.push({ x: cx - 6 + i * 0.9, z: cz + 4 + Math.sin(i * 0.4) * 1.5 });
  const tr = D.trail(pts, 'camel', { fresh: 1 });
  if (params.reveal) tr.setReveal({ x: cx, z: cz + 4 }, 5);
  D.setFirasa(+(params.firasa || 0));
  const dummy = G.actors.player.actor && G.actors.player.actor.object ? G.actors.player.actor.object : { getWorldPosition: v => v.set(cx + 2, T.heightAt(cx + 2, cz - 3) + 0.5, cz - 3) };
  D.blob(dummy, 0.6);
  const close = params.view !== 'trail';
  const h = T.heightAt(cx, cz);
  G.actors.cam.cut(close ? [cx + 0.2, h + 2.2, cz - 3.2] : [cx - 3, h + 4, cz + 10], close ? [cx, h, cz] : [cx, h, cz + 4]);
  return {};
}
