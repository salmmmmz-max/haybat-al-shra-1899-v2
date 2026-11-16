/**
 * Chapter 4 helpers — small scene effects the world modules do not provide:
 *   circler()    vultures soaring in a circle over a spot (ONE InstancedMesh, level lifetime)
 *   ribbon()     the sandgrouse flight line الفراسة draws in the sky (one additive strip, alpha follows firasa.amount)
 *   hookLines()  run a callback when line N of a dialogue block is shown (staging inside a blocking talk)
 */
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** vultures: `n` birds circling (x, z) at `h` metres above the ground; returns { update(dt), remove() } */
export function circler(G, { x, z, r = 14, h = 22, n = 5, speed = 5, scale = 2.4 }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.55, 0, 0, -0.45, -1.3, 0.22, -0.25, 0, 0, 0.55, 1.3, 0.22, -0.25, 0, 0, -0.45,
    0, 0, 0.55, 0.12, 0, 0.9, -0.12, 0, 0.9], 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  const mat = new THREE.MeshBasicMaterial({ color: 0x241c16, side: THREE.DoubleSide });
  G.shade.patch(mat);
  const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.frustumCulled = false; mesh.renderOrder = 5;
  G.scene.add(mesh);
  const ph = [], rr = [], dir = [], hh = [];
  for (let i = 0; i < n; i++) { ph.push((i / n) * Math.PI * 2 + G.vrng.next()); rr.push(r * (0.7 + G.vrng.next() * 0.6)); dir.push(1); hh.push(h + (G.vrng.next() - 0.5) * 7); }
  let t = 0;
  const T = G.world.terrain;
  const api = {
    update(dt) {
      t += dt;
      for (let i = 0; i < n; i++) {
        const a = ph[i] + (speed / rr[i]) * t * dir[i];
        const px = x + Math.cos(a) * rr[i], pz = z + Math.sin(a) * rr[i];
        const vx = -Math.sin(a) * dir[i], vz = Math.cos(a) * dir[i];
        const py = T.heightAt(x, z) + hh[i] + Math.sin(t * 0.6 + ph[i]) * 1.2;
        _q.setFromEuler(_e.set(0, Math.atan2(vx, vz), -0.32 * dir[i]));
        _m.compose(_p.set(px, py, pz), _q, _s.set(scale, scale, scale));
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    remove() { G.scene.remove(mesh); mesh.dispose(); geo.dispose(); mat.dispose(); },
  };
  api.update(0);
  return api;
}

/** the flight line of a sandgrouse flock: a flat additive strip along from → to at `height` m; set(a) 0..1 */
export function ribbon(G, from, to, height = 20, width = 3.2) {
  const T = G.world.terrain;
  const len = Math.hypot(to.x - from.x, to.z - from.z) || 1, segs = Math.max(2, Math.round(len / 14));
  const ux = (to.x - from.x) / len, uz = (to.z - from.z) / len, px = -uz * width * 0.5, pz = ux * width * 0.5;
  const pos = new Float32Array((segs + 1) * 2 * 3), idx = [];
  for (let i = 0; i <= segs; i++) {
    const x = from.x + (to.x - from.x) * (i / segs), z = from.z + (to.z - from.z) * (i / segs), y = T.heightAt(x, z) + height;
    pos.set([x + px, y, z + pz, x - px, y, z - pz], i * 6);
    if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((from.x + to.x) / 2, height, (from.z + to.z) / 2), len);
  const mat = new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 60; mesh.visible = false;
  G.scene.add(mesh);
  return {
    set(a) { mat.opacity = a; mesh.visible = a > 0.01; },
    remove() { G.scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}

/** call table[`${blockId}:${lineIndex}`]() when that line of a d.talk block appears; removed with the beat */
export function hookLines(G, d, table) {
  let id = null, n = 0;
  const a = G.events.on('dialogue:open', e => { id = e && e.id; n = 0; });
  const b = G.events.on('dialogue:line', () => {
    const f = table[`${id}:${n++}`];
    if (f) { try { f(); } catch (err) { console.error('[ch4] line hook failed', err); } }
  });
  d.onEnd(() => { if (a) a(); if (b) b(); });
}
