/**
 * Acceptance checks + contact sheets for group fx_chars (F04 F18 F21 V01 V02 V03).
 *   checks:  ?m=accept_fx_chars&test=1   →  await window.__harness.api.run()  →  { items: { F04: {pass, detail}, … } }
 *   sheets:  &show=lod (full | LOD pairs: idle, walk, kneel) · &show=slope (up / down / side slopes) · &show=ride (&walk=1)
 *            &show=camel (&speed=2.4|5.5) · &show=face (close portrait, texture)
 */
import * as THREE from 'three';
import { createHumanoid } from '../src/actors/humanoid.js';

export const assets = ['dhari', 'mani', 'jaber', 'camel'];

const flat = G => G.world.terrain.build({ seed: 5, duneAmp: 0, duneScale: 100, flats: [{ x: 0, z: 0, r: 300, fall: 10 }] });
// a straight east-west ridge through z = 0: the north flank (z < 0) rises toward +z, max slope ≈ 33° near z = ±7
const ridge = (G, h = 6.5) => G.world.terrain.build({ seed: 5, duneAmp: 0, duneScale: 100, ridges: [{ x1: -60, z1: 0, x2: 60, z2: 0, h, w: 15 }] });
const skinned = a => { let m = null; a.root.traverse(o => { if (o.isSkinnedMesh && !m) m = o; }); return m; };
// the actor's own LOD registration may switch again on a later G.lod tick; tests call this right before drawing
const forceLod = (G, a, on) => { const m = skinned(a), lod = G.assets.lodGeometry(a.modelId), full = G.assets.model(a.modelId).mesh.geometry; if (m && lod) m.geometry = on ? lod : full; };

/** Render the scene into an RGBA buffer (w×h) with the current camera. */
function grab(G, rt, buf) {
  G.renderer.setRenderTarget(rt); G.renderer.render(G.scene, G.camera); G.renderer.setRenderTarget(null);
  G.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf); return buf;
}

// ----------------------------------------------------------------------------------------------------------------------
export async function run(G, p) {
  G.world.sky.setPreset(p.preset || 'morning');
  G.state.mode = 'play';
  const actors = [], quads = [];
  const step = n => { for (let i = 0; i < n; i++) { for (const a of actors) a.update(1 / 60); for (const q of quads) q.update(1 / 60); } };
  let camFn = null;
  G.loop.add({ update(dt) { for (const a of actors) a.update(dt); for (const q of quads) q.update(dt); } }, 75);
  G.loop.add({ lateUpdate() { if (camFn) camFn(); } }, 200);
  const view = (eye, at) => { const h = G.world.terrain.heightAt(at[0], at[2]); G.camera.position.set(eye[0], eye[1] + h, eye[2]); G.camera.lookAt(at[0], at[1] + h, at[2]); };

  if (p.show === 'lod') {
    flat(G); G.actors.player.spawn(60, 60, 0);
    const who = p.who || 'dhari', poses = ['idle', 'walk', 'kneel'];
    poses.forEach((pose, i) => [0, 1].forEach(l => {
      const a = createHumanoid(G, who, { name: pose + l }); a.place((i * 2 + l - 2.5) * 0.95, 0, 0);
      if (pose === 'walk') a.locomotion(1.6); else a.play(pose, { fade: 0 });
      forceLod(G, a, !!l); actors.push(a);
    }));
    camFn = () => view([0, 1.1, 4.3], [0, 0.85, 0]);
    return {};
  }
  if (p.show === 'slope') {
    ridge(G, 8.5); G.actors.player.spawn(60, 60, 0);
    [['up', 0, 0], ['down', Math.PI, 0], ['side', -Math.PI / 2, 0], ['walk-down', Math.PI, 1.6]].forEach(([n, yaw, sp], i) => {
      const a = createHumanoid(G, 'dhari', { name: n }); let z = -11.6 + i * 1.25; a.place(0, z, yaw); a.footIK = p.ik !== '0';
      if (sp) { a.locomotion(sp); const upd = a.update; a.update = dt => { z += Math.cos(yaw) * sp * dt; if (z < -12.6) z = -10.6; a.place(0, z); a.locomotion(sp); upd(dt); }; } else a.play('idle', { fade: 0 });
      actors.push(a);
    });
    const f = +(p.focus || 0), fa = actors[f];
    actors.forEach((a, i) => a.setVisible(i === f));
    camFn = () => { const q = fa.pos; G.camera.position.set(q.x + 2.3, q.y + 0.75, q.z); G.camera.lookAt(q.x, q.y + 0.55, q.z); };
    return {};
  }
  if (p.show === 'ride') {
    flat(G); G.actors.player.spawn(60, 60, 0);
    const c = G.actors.camels.spawn('wadha', { x: 0, z: 0 }); c.place(0, 0, 0); c.ridden = true; quads.push(c);
    const a = createHumanoid(G, 'dhari', { name: 'rider' }); a.astride = p.ride !== '0'; a.sitOn(c.saddle); actors.push(a);
    const sp = +(p.speed || 0); let z = 0;
    if (sp) { const upd = c.update; c.update = dt => { z += sp * dt; c.place(0, z, 0); c.setSpeed(sp); upd(dt); }; }
    const v = p.view || 'side';
    camFn = () => { const q = c.pos; if (v === 'front') view([q.x + 0.7, 2.4, q.z + 3.4], [q.x, 1.85, q.z - 0.3]); else if (v === 'far') view([q.x + 6.5, 1.9, q.z + 0.6], [q.x, 1.4, q.z]); else view([q.x + 3.3, 2.2, q.z - 0.2], [q.x, 1.8, q.z - 0.3]); };
    return {};
  }
  if (p.show === 'camel') {
    flat(G); G.actors.player.spawn(60, 60, 0);
    const c = G.actors.camels.spawn('fx_camel', { x: 0, z: 0 }); c.place(0, 0, 0); c.ridden = true; quads.push(c);
    const sp = +(p.speed || 0); let z = 0;
    { const upd = c.update; c.update = dt => { z += sp * dt; c.place(0, z, 0); c.setSpeed(sp); upd(dt); }; }
    camFn = () => { const q = c.pos; view([q.x + 4.6, 1.5, q.z + 0.1], [q.x, 1.4, q.z + 0.1]); };
    return {};
  }
  if (p.show === 'face') {
    flat(G); G.actors.player.spawn(60, 60, 0);
    ['dhari', 'mani', 'jaber'].forEach((id, i) => { const a = createHumanoid(G, id, { name: 'face' + i }); a.place((i - 1) * 0.75, 0, 0); a.play('idle', { fade: 0 }); actors.push(a); });
    camFn = () => view([0.25, 1.55, 2.1], [0, 1.3, 0]);
    return {};
  }
  return { run: () => checks(G, { actors, quads, step }) };
}

// ----------------------------------------------------------------------------------------------------------------------
async function checks(G) {
  const items = {};
  const tryItem = async (k, fn) => { try { items[k] = await fn(); } catch (e) { items[k] = { pass: false, detail: 'threw: ' + String(e && e.stack || e).slice(0, 300) }; } };
  await tryItem('F04', () => checkF04(G));
  await tryItem('F18', () => checkF18(G));
  await tryItem('V03', () => checkV03(G));
  await tryItem('F21', () => checkF21(G));
  await tryItem('V01', () => checkV01(G));
  await tryItem('V02', () => checkV02(G));
  return { items };
}

/** F04: LOD1 keeps every UV seam (no triangle spans two UV islands), hero pinned to LOD0, switch distance hides the change. */
async function checkF04(G) {
  flat(G);
  const out = [], fails = [];
  // (a) seams: a triangle's UV edge / 3-D edge ratio far above the full mesh's 99.5th percentile = welded across islands
  for (const id of ['dhari', 'mani', 'jaber']) {
    const inst = G.assets.instance(id); let mesh = null; inst.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    const g = mesh.geometry, P = g.attributes.position, UV = g.attributes.uv, lod = G.assets.lodGeometry(id);
    const ratios = idx => { const r = new Float32Array(idx.count / 3); for (let t = 0; t < idx.count; t += 3) { let mu = 0, mp = 0; for (let e = 0; e < 3; e++) { const a = idx.getX(t + e), b = idx.getX(t + (e + 1) % 3); mu = Math.max(mu, Math.hypot(UV.getX(a) - UV.getX(b), UV.getY(a) - UV.getY(b))); mp = Math.max(mp, Math.hypot(P.getX(a) - P.getX(b), P.getY(a) - P.getY(b), P.getZ(a) - P.getZ(b))); } r[t / 3] = mu / Math.max(mp, 1e-6); } return r; };
    const full = ratios(g.index), s = Float32Array.from(full).sort(), lim = s[Math.floor(s.length * 0.995)] * 3;
    const lr = ratios(lod.index); let bad = 0; for (const v of lr) if (v > lim) bad++;
    out.push(`${id}: lod ${lr.length}/${full.length} tris, seam-crossing ${bad}`);
    if (bad > 0) fails.push(id + ' seams');
  }
  // (b) the hero stays on the full mesh even far away from the camera
  const pl = G.actors.player; pl.spawn(0, 0, 0);
  G.camera.position.set(0, 3 + G.world.terrain.heightAt(0, 0), 60);
  for (let i = 0; i < 40; i++) G.lod.update();
  const heroLvl = pl.actor.lodLevel;
  out.push(`hero lod level at 60 m: ${heroLvl}`);
  if (heroLvl !== 0) fails.push('hero not pinned');
  pl.spawn(200, 200, 0);
  // (c) render full vs LOD at the switch distance of each tier (lod.js: near 18 × tier scale × 1.15 hysteresis); phone-like
  //     framing 844×390 CSS px at DPR 2; count pixels whose colour moves by > 10 % (mean over RGB)
  //     Reference: the same full mesh one frame (1/60 s) later along a 2 m/s camera orbit (walking pace; a LOD switch only
  //     happens while the distance changes) — the change a player sees every frame anyway. Pass: ≤ 2.5 × that and ≤ 3 %.
  const W = 1688, H = 780, rt = new THREE.WebGLRenderTarget(W, H), A = new Uint8Array(W * H * 4), B = new Uint8Array(W * H * 4), C = new Uint8Array(W * H * 4), D = new Uint8Array(W * H * 4);
  const cam = G.camera, aspect0 = cam.aspect; cam.aspect = W / H; cam.updateProjectionMatrix();
  const a = createHumanoid(G, 'dhari', { name: 'probe' }); a.place(0, 0, 0);
  const diffs = [], h0 = G.world.terrain.heightAt(0, 0);
  const at = (d, ang) => { cam.position.set(Math.sin(ang) * d, 1.6 + h0, Math.cos(ang) * d); cam.lookAt(0, 0.9 + h0, 0); cam.updateMatrixWorld(); };
  for (const [pose, tier] of [['idle', 0.5], ['walk', 0.5], ['kneel', 0.7], ['walk', 1]]) {
    if (pose === 'walk') a.locomotion(1.6); else a.play(pose, { fade: 0 });
    for (let i = 0; i < 50; i++) a.update(1 / 60);
    const d = 18 * tier * 1.15, ang = 0.64;
    at(d, ang); forceLod(G, a, false); grab(G, rt, A); forceLod(G, a, true); grab(G, rt, B);
    a.setVisible(false); grab(G, rt, C); a.setVisible(true); forceLod(G, a, false);
    at(d, ang + 2.0 / 60 / d); grab(G, rt, D);
    let body = 0, changed = 0, ref = 0;
    const px = (X, Y, i) => Math.abs(X[i] - Y[i]) + Math.abs(X[i + 1] - Y[i + 1]) + Math.abs(X[i + 2] - Y[i + 2]);
    for (let i = 0; i < A.length; i += 4) {
      if (px(A, C, i) <= 6) continue; body++;
      if (px(A, B, i) > 77) changed++;
      if (px(A, D, i) > 77) ref++;
    }
    const frac = changed / Math.max(1, body), fr = ref / Math.max(1, body);
    diffs.push(`${pose}@${d.toFixed(1)}m LOD ${(frac * 100).toFixed(1)}% vs 1-frame ref ${(fr * 100).toFixed(1)}% of ${body}px`);
    if (frac > Math.max(0.01, fr * 2.5) || frac > 0.03) fails.push(`switch ${pose} ${d.toFixed(1)} m`);   // before the fix: ≈ 40 %
  }
  a.dispose(); rt.dispose(); cam.aspect = aspect0; cam.updateProjectionMatrix();
  out.push('pixels changed >10 % at the switch distance: ' + diffs.join(', '));
  return { pass: fails.length === 0, detail: out.join(' · ') + (fails.length ? ' · FAIL: ' + fails.join(', ') : '') };
}

/** F18: spawning / disposing humanoids (as beats do) must not grow GPU textures — bone textures are freed. */
async function checkF18(G) {
  flat(G);
  const counts = [];
  { const h = G.world.terrain.heightAt(0, 0); G.camera.position.set(0, 2 + h, 8); G.camera.lookAt(0, 1 + h, 0); }
  for (let cycle = 0; cycle < 5; cycle++) {
    const list = ['dhari', 'mani', 'jaber', 'mani'].map((id, i) => { const a = createHumanoid(G, id, { name: 'f18_' + i, tint: i === 3 ? 0x998877 : undefined }); a.place(i - 1.5, 0, 0); a.update(1 / 60); return a; });
    G.renderer.render(G.scene, G.camera);
    for (const a of list) a.dispose();
    G.renderer.render(G.scene, G.camera);
    counts.push(G.renderer.info.memory.textures);
  }
  const plateau = counts[4] === counts[1];
  return { pass: plateau, detail: `textures after each spawn/dispose cycle of 4 humanoids: ${counts.join(' → ')}` };
}

/** mean |Laplacian| of the luminance in a rectangle of an RGBA buffer (y up, as read back from WebGL) */
function hfEnergy(buf, W, x0, y0, x1, y1) {
  let s = 0, n = 0; const L = i => buf[i] * 0.3 + buf[i + 1] * 0.59 + buf[i + 2] * 0.11;
  for (let y = Math.max(1, y0); y < Math.min(y1, 1e9); y++) for (let x = Math.max(1, x0); x < x1; x++) { const i = (y * W + x) * 4; s += Math.abs(4 * L(i) - L(i - 4) - L(i + 4) - L(i - W * 4) - L(i + W * 4)); n++; }
  return s / Math.max(1, n);
}
/** V03: calmer character textures (less high-frequency energy in the map and on the rendered robe) while the face keeps
 *  its features (its rendered detail stays close to the original). Baselines = audited build f8cb410, same scene. */
async function checkV03(G) {
  flat(G);
  const BASE = { robe: 12.20, face: 10.51 };   // rendered, measured on the audited assets with this same function
  const out = [], fails = [];
  // (a) the albedo textures themselves (audited HF: dhari 12.45 · mani 18.75 · jaber 22.41 — same function)
  const tex = id => { let m = null; G.assets.model(id).scene.traverse(o => { if (o.isSkinnedMesh && !m) m = o; }); return m.material.map; };
  const AUD = { dhari: 12.45, mani: 18.75, jaber: 22.41 };
  for (const id in AUD) {
    const img = tex(id).image, cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); const px = cx.getImageData(0, 0, cv.width, cv.height).data;
    const texHF = hfEnergy(px, cv.width, 1, 1, cv.width - 1, cv.height - 1);
    out.push(`${id} map HF ${texHF.toFixed(2)} (audited ${AUD[id]})`);
    if (texHF > AUD[id] * 0.85) fails.push(id + ' texture not calmer');
  }
  // (b) rendered: robe at 2.5 m and face at 0.9 m (phone DPR-2 pixels)
  const W = 1688, H = 780, rt = new THREE.WebGLRenderTarget(W, H), A = new Uint8Array(W * H * 4);
  const cam = G.camera, aspect0 = cam.aspect; cam.aspect = W / H; cam.updateProjectionMatrix();
  const a = createHumanoid(G, 'dhari', { name: 'v03' }); a.place(0, 0, 0); a.play('idle', { fade: 0 }); for (let i = 0; i < 30; i++) a.update(1 / 60);
  const h0 = G.world.terrain.heightAt(0, 0), _p = new THREE.Vector3();
  const box = (y, r) => { _p.set(0, h0 + y, 0).project(cam); const x = (_p.x * 0.5 + 0.5) * W, yy = (_p.y * 0.5 + 0.5) * H; const rp = r * H; return [x - rp | 0, yy - rp | 0, x + rp | 0, yy + rp | 0]; };
  cam.position.set(0, h0 + 1.2, 2.5); cam.lookAt(0, h0 + 1.0, 0); cam.updateMatrixWorld(); grab(G, rt, A);
  const robe = hfEnergy(A, W, ...box(0.95, 0.12));
  a.root.updateMatrixWorld(true); const head = new THREE.Vector3(); a.socket('head').getWorldPosition(head);
  cam.position.set(0, head.y + 0.05, 0.9); cam.lookAt(0, head.y + 0.02, 0); cam.updateMatrixWorld(); grab(G, rt, A);
  const face = hfEnergy(A, W, ...box(head.y + 0.02 - h0, 0.1));
  a.dispose(); rt.dispose(); cam.aspect = aspect0; cam.updateProjectionMatrix();
  out.push(`robe HF ${robe.toFixed(2)} (audited ${BASE.robe}), face HF ${face.toFixed(2)} (audited ${BASE.face})`);
  if (robe > BASE.robe) fails.push('robe busier');
  if (face < BASE.face * 0.9) fails.push('face lost detail');
  return { pass: fails.length === 0, detail: out.join(' · ') + (fails.length ? ' · FAIL: ' + fails.join(', ') : '') };
}

// ---- F21 helpers: foot bones vs the terrain under them
const _b = new THREE.Vector3(), _b2 = new THREE.Vector3(), _b3 = new THREE.Vector3();
function bonesOf(a) { const B = {}; a.root.traverse(o => { if (o.isBone) B[o.name] = o; }); return B; }
/** per foot [ankle, toe] height above the terrain directly below, and knee interior angle (rad) */
function feet(G, a, B) {
  a.root.updateMatrixWorld(true);
  const T = G.world.terrain, r = {};
  for (const s of ['Left', 'Right']) {
    B[s + 'Foot'].getWorldPosition(_b); const ank = _b.y - T.heightAt(_b.x, _b.z);
    B[s + 'ToeBase'].getWorldPosition(_b); const toe = _b.y - T.heightAt(_b.x, _b.z);
    B[s + 'UpLeg'].getWorldPosition(_b); B[s + 'Leg'].getWorldPosition(_b2); B[s + 'Foot'].getWorldPosition(_b3);
    const knee = _b.sub(_b2).angleTo(_b3.sub(_b2));
    r[s] = [ank, toe, knee];
  }
  return r;
}
/** Walk (or stand) a humanoid along a heading for n frames; returns per-frame feet() samples. Slope or flat = current terrain. */
function sampleWalk(G, id, x, z, yaw, speed, n) {
  const a = createHumanoid(G, id, { name: 'f21' }), B = bonesOf(a), out = [];
  a.place(x, z, yaw);
  if (speed > 0) a.locomotion(speed); else a.play('idle', { fade: 0 });
  G.camera.position.set(x + 3, G.world.terrain.heightAt(x, z) + 1.5, z + 3);   // near: full-rate animation
  for (let i = 0; i < n; i++) {
    x += Math.sin(yaw) * speed / 60; z += Math.cos(yaw) * speed / 60; a.place(x, z); if (speed > 0) a.locomotion(speed);
    a.update(1 / 60);
    if (i >= 30) out.push(feet(G, a, B));
  }
  a.dispose();
  return out;
}
/** F21: on up / down / side slopes (≈ 30°) the planted foot neither sinks nor floats, and the knee never pops. */
async function checkF21(G) {
  const runs = [['stand-up', 0, 0], ['stand-down', Math.PI, 0], ['stand-side', Math.PI / 2, 0], ['walk-up', 0, 1.6], ['walk-down', Math.PI, 1.6], ['walk-side', Math.PI / 2, 1.6], ['run-up', 0, 4.5], ['run-down', Math.PI, 4.5]];
  const N = 130, out = [], fails = [];
  flat(G);
  const ref = runs.map(([, yaw, sp]) => sampleWalk(G, 'dhari', 0, 0, yaw, sp, N));
  for (const rh of [6.5, 8.5]) {
  ridge(G, rh);
  const _n = { x: 0, y: 0, z: 0 }; G.world.terrain.normalAt(0, -9.6, _n); const deg = (Math.acos(_n.y) * 180 / Math.PI).toFixed(0);
  out.push(`slope ${(Math.acos(_n.y) * 180 / Math.PI).toFixed(1)}°`);
  runs.forEach(([name, yaw, sp], k) => {
    // walkers start 1 m before the test point so that they cross it
    const back = sp * 0.6, x0 = -Math.sin(yaw) * back, z0 = -9.6 - Math.cos(yaw) * back;
    const S = sampleWalk(G, 'dhari', x0, z0, yaw, sp, N), R = ref[k];
    let sink = 0, float = 0, pop = 0, popRef = 0, maxKnee = 0, low = 9;
    for (const q of R) low = Math.min(low, q.Left[0], q.Right[0]);
    for (let i = 0; i < S.length; i++) {
      // stance foot = the lower ankle of the flat reference at the same phase
      const st = R[i].Left[0] < R[i].Right[0] ? 'Left' : 'Right';
      for (const f of ['Left', 'Right']) for (const j of [0, 1]) sink = Math.min(sink, S[i][f][j] - R[i][f][j]);
      if (R[i][st][0] < low + 0.02) float = Math.max(float, Math.min(S[i][st][0] - R[i][st][0], S[i][st][1] - R[i][st][1]));   // planted frames only (runs have flight)
      for (const f of ['Left', 'Right']) {
        maxKnee = Math.max(maxKnee, S[i][f][2]);
        if (i) { pop = Math.max(pop, Math.abs(S[i][f][2] - S[i - 1][f][2])); popRef = Math.max(popRef, Math.abs(R[i][f][2] - R[i - 1][f][2])); }
      }
    }
    out.push(`${name}: sink ${(sink * 100).toFixed(1)} cm, float ${(float * 100).toFixed(1)} cm, knee step ${(pop * 57.3).toFixed(1)}° (flat ${(popRef * 57.3).toFixed(1)}°), knee max ${(maxKnee * 57.3).toFixed(0)}°`);
    if (sink < -0.025) fails.push(name + deg + ' sinks');
    if (float > 0.03) fails.push(name + deg + ' floats');
    if (pop > Math.max(popRef * 1.5, popRef + 4 / 57.3)) fails.push(name + deg + ' knee pop');   // the walk clip itself turns the knee ≈ 19°/frame
    if (maxKnee > 179 / 57.3) fails.push(name + deg + ' knee hyperextends');
  });
  }
  return { pass: fails.length === 0, detail: out.join(' · ') + (fails.length ? ' · FAIL: ' + fails.join(', ') : '') };
}

/** V01: astride the saddle — hips centred on the camel, thighs down the flanks, feet hanging outside the body, upright
 *  back; holds while the camel stands, walks and trots. Measured in the camel body's own space. */
async function checkV01(G) {
  flat(G); G.actors.player.spawn(60, 60, 0);
  const c = G.actors.camels.spawn('fx_ride', { x: 0, z: 0 }); c.place(0, 0, 0); c.ridden = true;
  const a = createHumanoid(G, 'dhari', { name: 'v01' }); a.sitOn(c.saddle);
  const B = bonesOf(a), v = new THREE.Vector3(), rig = c.saddle.parent, L = n => { B[n].getWorldPosition(v); rig.worldToLocal(v); return v.clone(); };   // body (rig) space: rolls and bobs with the camel
  // camel half-width by height (x extent of the body around the saddle, 0.2 m bands)
  const inst = G.assets.instance('camel'); inst.updateMatrixWorld(true); let mesh = null; inst.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  const P = mesh.geometry.attributes.position, half = {};
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); if (v.z < -0.7 || v.z > 0.1) continue; const k = Math.round(v.y * 5); half[k] = Math.max(half[k] || 0, Math.abs(v.x)); }
  const out = [], fails = []; let z = 0;
  G.camera.position.set(4, 2, 0);
  for (const [name, sp] of [['stand', 0], ['walk', 2.4], ['trot', 5.5]]) {
    let worst = { hipX: 0, kneeDrop: 9, footClear: 9, lean: 0, sym: 0 };
    for (let i = 0; i < 150; i++) {
      z += sp / 60; c.place(0, z, 0); c.setSpeed(sp); c.update(1 / 60); a.update(1 / 60);
      if (i < 60 || i % 6) continue;
      c.root.updateMatrixWorld(true);
      const hips = L('Hips'), neck = L('neck');
      worst.hipX = Math.max(worst.hipX, Math.abs(hips.x));
      worst.lean = Math.max(worst.lean, Math.atan2(Math.hypot(neck.x - hips.x, neck.z - hips.z), neck.y - hips.y));
      const xs = [];
      for (const s of ['Left', 'Right']) {
        const kn = L(s + 'Leg'), ft = L(s + 'Foot');
        worst.kneeDrop = Math.min(worst.kneeDrop, hips.y - kn.y);
        for (const j of [kn, ft]) { const hw = half[Math.round(j.y * 5)] || 0; worst.footClear = Math.min(worst.footClear, Math.abs(j.x) - hw); }
        xs.push(ft.x);
      }
      worst.sym = Math.max(worst.sym, Math.abs(xs[0] + xs[1]));
    }
    out.push(`${name}: hips off-centre ${(worst.hipX * 100).toFixed(1)} cm, knees ${(worst.kneeDrop * 100).toFixed(0)} cm below hips, knee/ankle clear of flank ${(worst.footClear * 100).toFixed(1)} cm, back ${(worst.lean * 57.3).toFixed(0)}° from vertical, feet asym ${(worst.sym * 100).toFixed(1)} cm`);
    if (worst.hipX > 0.03) fails.push(name + ' off-centre');
    if (worst.kneeDrop < 0.15) fails.push(name + ' thighs level (squat)');
    if (worst.footClear < 0) fails.push(name + ' legs inside the camel');
    if (worst.lean > 20 / 57.3) fails.push(name + ' hunched');
    if (worst.sym > 0.05) fails.push(name + ' asymmetric');
  }
  a.dispose(); G.actors.camels.remove('fx_ride');
  return { pass: fails.length === 0, detail: out.join(' · ') + (fails.length ? ' · FAIL: ' + fails.join(', ') : '') };
}

/** V02: camel neck carriage (the vertex shader's neck transform, ported for the nose tip) and the pacing gait. */
async function checkV02(G) {
  flat(G);
  const c = G.actors.camels.spawn('fx_v02', { x: 0, z: 0 }); c.place(0, 0, 0); c.ridden = true;
  const S = c.spec, N = S.neck, E = S.neckExt || [0, 1, 0, 0], out = [], fails = [];
  const inst = G.assets.instance('camel'); inst.updateMatrixWorld(true); let mesh = null; inst.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  const P = mesh.geometry.attributes.position, v = new THREE.Vector3(), sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let nose = null;
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); if (v.y > N[1] + N[3] && (!nose || v.z > nose.z)) nose = v.clone(); }
  const carry = (ext, rest) => {
    let y = nose.y, z = nose.z; const nk = sm(N[1] - 0.12, N[1] + N[3], y) * (z >= N[0] ? 1 : 0);
    y += E[1] * E[3] * nk * ext; z += E[2] * E[3] * nk * ext;
    const a = rest * nk, cs = Math.cos(a), sn = Math.sin(a), dy = y - N[1], dz = z - N[2];
    return [N[1] + dy * cs - dz * sn, N[2] + dy * sn + dz * cs];
  };
  const [y0, z0] = carry(0, 0), [y1, z1] = carry(1, S.headRest || 0);
  out.push(`nose tip at rest: ${y0.toFixed(2)} m high, ${z0.toFixed(2)} m ahead (audited) → ${y1.toFixed(2)} m, ${z1.toFixed(2)} m`);
  if (y1 - y0 < 0.1) fails.push('neck carriage unchanged');
  if (z1 < z0 - 0.05) fails.push('head pulled back');
  // gait: pace = the two legs of a side move together, the sides half a cycle apart; body sways over the stance pair
  const o = S.off[0], sameSide = Math.max(Math.abs(o[0] - o[2]), Math.abs(o[1] - o[3])), across = Math.abs(((o[1] - o[0]) % 1 + 1) % 1 - 0.5);
  out.push(`pace: same-side phase gap ${sameSide.toFixed(2)}, sides ${(0.5 - across).toFixed(2)} cycle apart`);
  if (sameSide > 0.1 || across > 0.05) fails.push('not a pace');
  const rig = c.saddle.parent; let sx = 0, roll = 0, z = 0;
  for (let i = 0; i < 180; i++) { z += 2.4 / 60; c.place(0, z, 0); c.setSpeed(2.4); c.update(1 / 60); if (i > 60) { sx = Math.max(sx, Math.abs(rig.position.x)); roll = Math.max(roll, Math.abs(rig.rotation.z)); } }
  out.push(`walk: sway ±${(sx * 100).toFixed(1)} cm, roll ±${(roll * 57.3).toFixed(1)}°`);
  if (sx < 0.02 || sx > 0.06 || roll > 6 / 57.3) fails.push('sway/roll out of range');
  G.actors.camels.remove('fx_v02');
  return { pass: fails.length === 0, detail: out.join(' · ') + (fails.length ? ' · FAIL: ' + fails.join(', ') : '') };
}
