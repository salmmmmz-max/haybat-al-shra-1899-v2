/** LOD look check: ?m=lodview&model=camel&dist=12&lod=0|1 — one body, phone-like framing, full or LOD1 geometry. */
export const assets = ['camel', 'tent', 'dhari'];
export async function run(G, p) {
  const { createQuadruped } = await import('../src/actors/quadruped.js');
  G.world.terrain.build({ seed: 5, duneAmp: 0, duneScale: 100, flats: [{ x: 0, z: 0, r: 300, fall: 10 }] });
  G.world.sky.setPreset('morning'); G.actors.player.spawn(60, 60, 0);
  const model = p.model || 'camel', dist = +(p.dist || 12), useLod = p.lod === '1';
  let root;
  if (model === 'camel') { const b = createQuadruped(G, 'camel', { name: 'c' }); b.place(0, 0, 0.9); b.pose('kneel', { duration: 0 }); root = b.root; G.loop.add({ update(dt) { b.update(dt); } }, 30); }
  else { root = G.world.props.spawn(model, { x: 0, z: 0, yaw: 0.9 }); }
  const lod = G.assets.lodGeometry(model);
  G.loop.add({ lateUpdate() {
    root.traverse(o => { if (o.isMesh && o.userData.full === undefined) o.userData.full = o.geometry; if (o.isMesh && lod) o.geometry = useLod ? lod : o.userData.full; });
    G.camera.position.set(dist * 0.8, 1.6, dist * 0.6); G.camera.lookAt(0, 1.0, 0);
  } }, 85);
  return {};
}
