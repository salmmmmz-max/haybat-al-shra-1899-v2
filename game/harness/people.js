/**
 * People harness: ?m=people&who=dhari|mani|misfer|moudi|fuhaid|jaber &clip=<name> &speed=<m/s> &overlay=<clip>
 *   &item=torch|rifle|staff (hero) &sit=ground|camel &crowd=1 &view=side|front|34|close
 * Default: a row of walkers at 0 / 1 / 2 / 3.5 / 5 m/s.  Returns { actors, hero } for probes.
 */
export const assets = ['dhari', 'mani', 'misfer', 'moudi', 'fuhaid', 'jaber', 'camel'];
export async function run(G, p) {
  const { createHumanoid } = await import('../src/actors/humanoid.js');
  const T = G.world.terrain;
  T.build({ seed: 5, duneAmp: 0, duneScale: 100, flats: [{ x: 0, z: 0, r: 300, fall: 10 }] });
  G.world.sky.setPreset(p.preset || 'morning');
  G.state.mode = 'play';
  const who = p.who || 'dhari', actors = [];
  let hero = null, look = [0, 1.0, 0], eye = null;
  const row = (speeds, mk) => speeds.forEach((s, i) => { const a = mk(i, s); a.place((i - (speeds.length - 1) / 2) * 1.5, 0, 0); a.locomotion(s); if (p.overlay) a.overlay(p.overlay); actors.push(a); });
  const crowd = () => {
    const cz = p.item ? 7 : 0, items = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; items.push({ x: Math.sin(a) * 1.6, z: cz + Math.cos(a) * 1.6, yaw: a + Math.PI, clip: 'sit', t: 0.3 * i, tint: i % 2 ? 0xd8c8a8 : undefined }); }
    G.actors.npcs.crowd(who === 'dhari' ? 'mani' : who, items);
    if (p.live) { const a = createHumanoid(G, who, { name: 'live' }); a.place(0, cz, 0); a.play('sit'); actors.push(a); }
  };
  if (p.item) {
    G.actors.player.spawn(0, 0, 0); G.actors.player.equip(p.item, { lit: true }); hero = G.actors.player;
    if (p.overlay) hero.actor.overlay(p.overlay);
    if (p.crowd) crowd();
  } else if (p.crowd) {
    crowd(); G.actors.player.spawn(40, 40, 0);
  } else if (p.sit) {
    const a = createHumanoid(G, who, { name: 'sitter' }); actors.push(a);
    if (p.sit === 'camel') { const c = G.actors.camels.spawn('c', { x: 0, z: 0 }); c.place(0, 0, 0); a.sitOn(c.saddle); look = [0, 1.8, 0]; } else { a.place(0, 0, 0); a.play('sit'); }
  } else if (p.clip) {
    const a = createHumanoid(G, who, { name: 'one' }); a.place(0, 0, 0); a.play(p.clip); if (p.overlay) a.overlay(p.overlay); actors.push(a);
  } else row([0, 1, 2, 3.5, 5], () => createHumanoid(G, who, { name: 'w' }));
  if (!hero) G.actors.player.spawn(60, 60, 0);
  G.loop.add({ update(dt) {
    for (const a of actors) a.update(dt);
    if (hero) return;
    const v = p.view || 'side', d = actors.length > 2 ? 9 : 4.2;
    if (v === 'front') eye = [0, 1.4, d]; else if (v === '34') eye = [d * 0.7, 1.8, d * 0.7]; else if (v === 'close') eye = [2.2, 1.3, 2.2]; else eye = [d, 1.2, 0];
    const h = T.heightAt(0, 0); G.actors.cam.cut([eye[0], eye[1] + h, eye[2]], [look[0], look[1] + h, look[2]]);
  } }, 75);
  return { actors, hero };
}
