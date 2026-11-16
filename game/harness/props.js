/** props harness — camp, fire, scatter, items, landmarks, flock. Params: set=camp|fire|scatter|items|landmarks|flock, night=1, preset, cam=x,y,z,tx,ty,tz, vis=m */
import * as THREE from 'three';

export const assets = ['tent', 'well', 'campfire', 'acacia', 'waterskins', 'camelsit', 'camel'];

export async function run(G, P) {
  const set = P.set || 'camp', night = P.night === '1';
  const W = G.world, pr = W.props;
  W.terrain.build({ seed: 5, duneAmp: 6, duneScale: 110, windDeg: 250, flats: [{ x: 0, z: 0, r: 26, fall: 24 }] });
  W.sky.setPreset(P.preset || (night ? 'night' : set === 'landmarks' ? 'dusk' : 'morning'));
  W.weather.setWind(250, 0.35);
  if (P.vis) W.sky.setVisibility(+P.vis);
  const out = { set };
  const H = (x, z) => W.terrain.heightAt(x, z);
  const camp = () => {
    [[-9, -6, 0.3], [9, -8, -0.4], [-12, 6, 1.2], [12, 7, 2.2]].forEach(([x, z, y]) => pr.spawn('tent', { x, z, yaw: y }));
    pr.spawn('well', { x: 0, z: -14 }); pr.spawn('waterskins', { x: -4, z: -10 });
    pr.spawn('campfire', { x: 2, z: 0 }); out.fire = pr.fire(2, 0, { size: 1, lit: true });
    [[5, 3, 1.5], [-1, 4, -1.2], [6, -3, 0.2]].forEach(([x, z, y]) => pr.spawn('camelsit', { x, z, yaw: y }));
    pr.spawn('acacia', { x: 20, z: -12 });
    pr.scatter('shrub', { count: 120, x: 0, z: 0, r: 80, seed: 3, avoid: [{ x: 0, z: 0, r: 16 }] });
    pr.scatter('grass', { count: 260, x: 0, z: 0, r: 50, seed: 4, avoid: [{ x: 0, z: 0, r: 8 }] });
    pr.scatter('rock', { count: 60, x: 0, z: 0, r: 70, seed: 5, avoid: [{ x: 0, z: 0, r: 14 }] });
    pr.scatter('pebble', { count: 200, x: 0, z: 0, r: 30, seed: 6 });
    pr.scatter('greenpatch', { count: 5, x: 30, z: 20, r: 12, seed: 7 });
    pr.cairn(-26, 14, { h: 1.6 }); pr.rockOutcrop(-40, -30, { r: 9, h: 5, seed: 2 }); pr.bones(14, 18); pr.deadCamel(-18, 20, 0.7);
    pr.signalPile(24, 6);
  };
  const items = () => {
    ['torch', 'rifle', 'staff', 'waterskin', 'bucket'].forEach((id, i) => {
      const o = pr.make(id); o.position.set(i - 2, H(0, 0) + 1.0, -2); G.scene.add(o); o.rotation.z = 0;
    });
    const t = G.scene.children[G.scene.children.length - 5]; void t;
    const torch = G.scene.getObjectByName('item:torch'); if (torch) out.flame = pr.flame(torch, { size: 0.35 });
  };
  if (set === 'camp') camp();
  else if (set === 'fire') { out.fire = pr.fire(0, 0, { size: 1.3, logs: true }); pr.scatter('pebble', { count: 120, x: 0, z: 0, r: 8, seed: 2 }); if (P.vis) out.fire.setBeacon(120); }
  else if (set === 'scatter') {
    const kinds = ['shrub', 'grass', 'rock', 'pebble', 'greenpatch'];
    kinds.forEach((k, i) => pr.scatter(k, { count: k === 'pebble' ? 80 : 24, x: -12 + i * 6, z: 0, r: 2.5, seed: 10 + i }));
  } else if (set === 'items') items();
  else if (set === 'landmarks') { pr.cairn(0, -150, { h: 1.6 }); pr.rockOutcrop(-40, -90, { r: 12, h: 6, seed: 4 }); pr.bones(4, -20); pr.deadCamel(-6, -14, 0.5); pr.signalPile(10, -30); }
  else if (set === 'flock') { G.state.fastText = false; out.flock = pr.flock({ from: { x: -60, z: -30 }, to: { x: 60, z: 30 }, count: 16, height: 24, speed: 15 }); out.flock.pass(); }

  const cs = (P.cam || { camp: '0,5,28,0,2,-2', fire: '0,1.6,5,0,1,0', scatter: '0,2.4,8,0,0.3,0', items: '0,1.4,1.2,0,1,-2', landmarks: '0,2,10,0,3,-150', flock: '0,1.7,0,0,26,-2' }[set]).split(',').map(Number);
  G.loop.add({ update() { G.camera.position.set(cs[0], H(cs[0], cs[2]) + cs[1], cs[2]); G.camera.lookAt(cs[3], cs[4] === 0.3 ? H(0, 0) + 0.3 : H(cs[3], cs[5]) + cs[4], cs[5]); } }, 98);
  void THREE;
  return out;
}
