/** Terrain scene: ?m=terrain&def=L1|L2|L3&preset=morning&cam=vista|low|top&x=&z=&yaw=&fire=1 */
import * as THREE from 'three';
export const assets = ['dhari', 'mani', 'tent'];
export const DEFS = {
  L1: { seed: 1101, duneAmp: 7, duneScale: 110, windDeg: 250, flats: [{ x: 0, z: 0, r: 42, fall: 34 }, { x: 95, z: 120, r: 26, fall: 30, y: 1 }], soft: [], gravel: [{ x: 95, z: 120, r: 40 }], ridges: [{ x1: 20, z1: 60, x2: 120, z2: 40, h: 9, w: 30 }] },
  L2: { seed: 2202, duneAmp: 11, duneScale: 150, windDeg: 270, flats: [{ x: 0, z: -150, r: 20, fall: 30 }, { x: 0, z: 130, r: 34, fall: 40 }], soft: [{ x: -30, z: -20, r: 38 }, { x: 40, z: 30, r: 30 }], gravel: [{ x: 0, z: 130, r: 50 }], ridges: [{ x1: -60, z1: 165, x2: 60, z2: 165, h: 10, w: 26 }] },
  L3: { seed: 3303, duneAmp: 13, duneScale: 170, windDeg: 240, flats: [{ x: 0, z: -330, r: 24, fall: 40 }, { x: 0, z: 250, r: 40, fall: 45, y: -7 }], soft: [], gravel: [{ x: 0, z: 250, r: 60 }], ridges: [{ x1: -110, z1: 170, x2: 110, z2: 170, h: 12, w: 34 }] },
};
export async function run(G, p) {
  const T = G.world.terrain; T.build(DEFS[p.def || 'L1']);
  G.world.sky.setPreset(p.preset || 'morning');
  const x = +(p.x || 0), z = +(p.z || 0), yaw = +(p.yaw || 0.6);
  G.actors.player.spawn(x, z, yaw);
  G.actors.npcs.spawn('m', 'mani', { x: x + 3 * Math.sin(yaw) + 1, z: z + 3 * Math.cos(yaw), yaw: yaw + Math.PI });
  const mode = p.cam || 'vista';
  G.loop.add({ update() {
    const c = G.camera, h = T.heightAt(x, z);
    if (mode === 'top') { c.position.set(x, h + 420, z + 1); c.lookAt(x, h, z); }
    else if (mode === 'low') { c.position.set(x - Math.sin(yaw) * 4.5, h + 1.5, z - Math.cos(yaw) * 4.5); c.lookAt(x + Math.sin(yaw) * 10, h + 0.6, z + Math.cos(yaw) * 10); }
    else { c.position.set(x - Math.sin(yaw) * 9, Math.max(h, T.heightAt(x - Math.sin(yaw) * 9, z - Math.cos(yaw) * 9)) + +(p.up || 5), z - Math.cos(yaw) * 9); c.lookAt(x + Math.sin(yaw) * 60, h + 2, z + Math.cos(yaw) * 60); }
  } }, 81);
  // probes for the lead: slope statistics + flat check
  let maxS = 0; for (let a = -400; a <= 400; a += 9) for (let b = -400; b <= 400; b += 9) maxS = Math.max(maxS, T.slopeAt(a, b));
  return { maxSlope: +(Math.atan(maxS * 0.65) * 180 / Math.PI).toFixed(1), h00: +T.heightAt(0, 0).toFixed(2), h10: +T.heightAt(10, 12).toFixed(2), surf: T.surfaceAt(95, 120) };
}
