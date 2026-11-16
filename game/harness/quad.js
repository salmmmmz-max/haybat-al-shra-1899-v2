/** Quadruped rig check: ?m=quad&model=camel|wolf&view=side|front|34 — five bodies: idle, walk (2 phases), run, kneel/crouch. */
export const assets = ['camel', 'wolf', 'dhari'];
export async function run(G, p) {
  const { createQuadruped } = await import('../src/actors/quadruped.js');
  G.world.terrain.build({ seed: 5, duneAmp: 0, duneScale: 100, flats: [{ x: 0, z: 0, r: 200, fall: 10 }] });
  G.world.sky.setPreset(p.preset || 'morning');
  const model = p.model || 'camel', sp = model === 'camel' ? 3.4 : 1.6, S = model === 'camel' ? [0, 2.4, 2.4, 5.5, 0] : [0, 3, 3, 8, 0];
  const bodies = S.map((v, i) => { const b = createQuadruped(G, model, { name: 'q' + i }); b.place(0, (i - 2) * sp, 0); b.setSpeed(v); return b; });
  bodies[4].pose(model === 'camel' ? 'kneel' : 'crouch', { duration: 0 });
  if (p.pose) bodies[0].pose(p.pose, { duration: 0 });
  let n = 0;
  G.loop.add({ update(dt) { n++; bodies.forEach((b, i) => { if (i === 2 && n < 14) return; b.update(dt); }); const c = G.camera, v = p.view || 'side', d = model === 'camel' ? 13 : 6.5, h = model === 'camel' ? 1.5 : 0.6;
    if (v === 'front') { c.position.set(0, h, d * 1.6); c.lookAt(0, h, 0); } else if (v === '34') { c.position.set(d * 0.8, h * 2, d * 0.9); c.lookAt(0, h * 0.8, 0); } else { c.position.set(d, h, 0); c.lookAt(0, h, 0); } } }, 81);
  G.actors.player.spawn(40, 40, 0);
  return {};
}
