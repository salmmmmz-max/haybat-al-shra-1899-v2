/**
 * Camera harness: ?m=camera&mode=foot|ride|softlock|sky|cine &slope=1 (steep dune to test the spring arm).
 * Drive with __hs.input({move:{x,y},look:{x,y}}) and step; probe G.camera / G.actors.cam.
 */
export const assets = ['dhari', 'camel', 'wolf'];
export async function run(G, p) {
  const T = G.world.terrain;
  T.build(p.slope ? { seed: 4, duneAmp: 12, duneScale: 38, windDeg: 250, flats: [] } : { seed: 5, duneAmp: 3, duneScale: 90, flats: [{ x: 0, z: 0, r: 30, fall: 20 }] });
  G.world.sky.setPreset(p.preset || 'morning');
  G.state.mode = 'play';
  const P = G.actors.player, C = G.actors.cam, mode = p.mode || 'foot';
  P.spawn(0, 0, 0);
  const out = { mode };
  if (mode === 'ride') { const c = G.actors.camels.spawn('c', { x: 0, z: 3 }); out.camel = c; P.mount(c); }
  if (mode === 'softlock') {
    const w = G.actors.wolves.spawnPack ? null : null; void w;
    const t = { x: 6, y: 1, z: 14 }; out.target = t; P.equip('torch'); C.snap(); C.softLock(t);
  }
  if (mode === 'sky') { C.snap(); C.skyMode(true); C.magnet(() => { const v = new (G.camera.position.constructor)(0.3, 0.8, -0.5); return v.normalize(); }, 12); }
  if (mode === 'cine') {
    out.done = C.cine([{ pos: [10, 4, 10], look: () => P.pos, dur: 1, cut: true }, { pos: [4, 2, 6], look: () => ({ x: P.pos.x, y: 1.4, z: P.pos.z }), dur: 2, fov: 40 }]);
  }
  C.snap();
  return out;
}
