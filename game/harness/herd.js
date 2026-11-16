/** Herd scene — ?m=herd&mode=camels|caravan|wolves. Camels wander/flee, a caravan of 6 follows a curving lead, a wolf pack besieges a fire. */
export const assets = ['dhari', 'mani', 'camel', 'wolf', 'campfire'];

export async function run(G, p) {
  const mode = p.mode || 'camels';
  G.world.terrain.build({ seed: 3, duneAmp: 5, duneScale: 90, windDeg: 250, flats: [{ x: 0, z: 0, r: 40, fall: 30 }], soft: [{ x: 40, z: -30, r: 14 }], gravel: [] });
  const P = G.actors.player; P.spawn(0, -6, 0);
  const api = { mode };
  if (mode === 'camels') {
    G.world.sky.setPreset('morning');
    const a = G.actors.camels.spawn('a', { x: -4, z: 4, yaw: 0.5 });
    const b = G.actors.camels.spawn('b', { x: 5, z: 6, yaw: 3, tint: 0xc9a47a });
    G.actors.camels.spawn('c', { x: 0, z: 10, yaw: 2, scale: 0.8 });
    a.goTo(-6, 22, { speed: 2.2 });
    b.follow(P, { dist: 3 });
    api.flee = () => G.actors.camels.get('c').flee(P.pos, 20);
    api.camels = G.actors.camels;
  } else if (mode === 'caravan') {
    G.world.sky.setPreset('morning');
    const lead = G.actors.camels.spawn('lead', { x: 0, z: 0, yaw: 0 });
    lead.ridden = true; let t = 0;
    const pathAt = u => ({ x: Math.sin(u * 0.05) * 22, z: u * 0.9 * 0.5 + Math.cos(u * 0.05) * 8 });
    const ctl = {
      update(dt) {
        if (!ctl.go) { lead.setSpeed(0); return; }
        const sp = Math.min(G.actors.caravan.pace, 2.4); t += sp * dt;
        const a = pathAt(t), b = pathAt(t + 0.5);
        lead.place(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z)); lead.setSpeed(sp);
      },
    };
    G.loop.add(ctl, 1);
    const a0 = pathAt(0), b0 = pathAt(0.5); lead.place(a0.x, a0.z, Math.atan2(b0.x - a0.x, b0.z - a0.z));
    G.actors.npcs.spawn('mani', 'mani', { x: 3, z: -4 });
    G.actors.caravan.form({ lead, camels: 6, walkers: ['mani'] });
    G.actors.caravan.follow(true);
    G.actors.cam.follow(lead);
    api.go = on => { ctl.go = on; }; api.go(true);
    api.kneel = () => G.actors.caravan.kneelAll({ ring: { x: lead.pos.x + 6, z: lead.pos.z + 6, r: 6 } });
    api.rise = () => G.actors.caravan.riseAll();
    api.caravan = G.actors.caravan;
  } else {
    G.world.sky.setPreset('night');
    const fire = G.world.props.fire(0, 4, {});
    const calf = G.actors.camels.spawn('calf', { x: 0, z: 1, yaw: 0, scale: 0.55 });
    P.teleport(0, -2, 0);
    G.actors.cam.follow(P);
    G.actors.wolves.spawnPack({ cx: 0, cz: 4, radius: 14, arc: { centerYaw: 0, width: Math.PI } });
    api.fire = fire; api.calf = calf;
    api.wave = (n = 3, gap = 5, dbl = false) => (api.waveP = G.actors.wolves.wave({ target: calf, lunges: n, gap, double: dbl }).then(r => (api.result = r)));
    api.swing = () => G.events.emit('player:swing', { x: P.pos.x, z: P.pos.z, yaw: 0 });
    api.log = []; for (const n of ['wolf:telegraph', 'wolf:lunge', 'wolf:repelled', 'wolf:bite']) G.events.on(n, () => api.log.push(n + '@' + G.time.now.toFixed(1)));
  }
  return api;
}
