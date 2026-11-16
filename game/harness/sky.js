/** Sky scene: ?m=sky&preset=dusk[&lst=18][&hl=banat_nash,pointer,polaris][&look=north|south|east|west|up][&to=night&dur=4][&vis=20] */
export const assets = ['dhari', 'mani'];
export async function run(G, p) {
  G.world.terrain.build({ seed: 1101, duneAmp: 7, duneScale: 110, windDeg: 250, flats: [{ x: 0, z: 0, r: 30, fall: 30 }], soft: [], gravel: [] });
  const S = G.world.sky;
  S.setPreset(p.preset || 'morning');
  if (p.lst) S.stars.setLST(+p.lst);
  if (p.hl) for (const id of p.hl.split(',')) S.stars.highlight(id, 1);
  if (p.vis) S.setVisibility(+p.vis);
  G.actors.player.spawn(0, 0, 0);
  G.actors.npcs.spawn('m', 'mani', { x: 2.5, z: 5, yaw: Math.PI });
  const yaw = { north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 }[p.look || 'south'] ?? 0;
  const pitch = p.look === 'up' ? 1.2 : +(p.pitch || 0.12);
  G.loop.add({ update() {
    const c = G.camera, pl = G.actors.player.pos;
    c.position.set(pl.x - Math.sin(yaw) * 6, pl.y + 2.4, pl.z - Math.cos(yaw) * 6);
    c.lookAt(c.position.x + Math.sin(yaw) * Math.cos(pitch), c.position.y + Math.sin(pitch), c.position.z + Math.cos(yaw) * Math.cos(pitch));
  } }, 81);
  return { to: (name, dur) => S.setPreset(name, { duration: dur }) };
}
