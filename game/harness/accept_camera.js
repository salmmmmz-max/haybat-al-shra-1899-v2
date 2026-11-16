/**
 * Acceptance checks for group fx_camera (F05 camera vs tent cloth / large props, V05 well framing, V04 sand ripples).
 *   node tools/shot.cjs "/harness/harness.html?m=accept_camera&test=1" --quiet \
 *     --until "window.__harness && (window.__harness.ready || window.__harness.error)" --print "await window.__harness.api.run()"
 * Params: &only=V04,V05,F05 (any subset)  &fast=1 (F05: fewer cases)  &portrait=1 (phone aspect for the F05 coverage rays). Full run ~3 min.
 * Debug helpers on the api: look({level,x,z,h,tx,tz}) parks the camera for a screenshot; stand({level,x,z,yaw,pitch}) places the hero with the real rig.
 * Everything here reads the real scene graph / real renderer; nothing depends on the implementation of the fix except the
 * documented behaviour (camera never behind opaque cloth, framing pitch, ripple statistics).
 */
import * as THREE from 'three';
import { LEVELS } from '../src/chapters/levels.js';

export const assets = ['dhari', 'tent', 'well', 'campfire', 'acacia', 'waterskins', 'camelsit', 'camel'];

const DEG = Math.PI / 180;
const BLOCK_MODELS = ['tent', 'well', 'camelsit'];

export async function run(G, P) {
  const hs = () => window.__hs;
  const step = n => hs().step(n);
  const C = () => G.actors.cam, PL = () => G.actors.player;
  const lvlGroup = () => G.world.props.root.children[0];
  const setup = async key => { await G.world.level.load(LEVELS[key]); G.state.mode = 'play'; G.state.fastText = false; await step(3); };

  // ------------------------------------------------------------------------------------------ F05
  function blockers() {
    const out = [], bx = new THREE.Box3();
    for (const o of lvlGroup().children) {
      if (!BLOCK_MODELS.includes(o.name)) continue;
      const yaw = o.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
      o.rotation.y = 0; o.updateMatrixWorld(true); bx.setFromObject(o); o.rotation.y = yaw; o.updateMatrixWorld(true);   // real mesh extents in the prop's own frame
      const cu = (bx.min.x + bx.max.x) / 2 - o.position.x, cv = (bx.min.z + bx.max.z) / 2 - o.position.z;
      out.push({ o, name: o.name, x: o.position.x + cu * c + cv * s, z: o.position.z - cu * s + cv * c, yaw, c, s,
        hx: (bx.max.x - bx.min.x) / 2, hz: (bx.max.z - bx.min.z) / 2, y0: bx.min.y, y1: bx.max.y });
    }
    return out;
  }
  const inBox = (b, x, y, z, m = 0) => {
    const dx = x - b.x, dz = z - b.z, u = dx * b.c - dz * b.s, v = dx * b.s + dz * b.c;
    return Math.abs(u) < b.hx + m && Math.abs(v) < b.hz + m && y > b.y0 - m && y < b.y1 + m;
  };
  /** hero stand points on the collision hull of a prop: march outward until outside every collider (hero radius 0.35) */
  function hullPoints(b, n) {
    const cols = G.world.props.colliders, pts = [];
    const dirs = [];
    for (let i = 0; i < n; i++) dirs.push(i / n * 2 * Math.PI);
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {      // the four corners of the box, in world angle
      const wx = su * b.hx * b.c + sv * b.hz * b.s, wz = -su * b.hx * b.s + sv * b.hz * b.c;
      dirs.push(Math.atan2(wz, wx));
    }
    for (const a of dirs) {
      const dx = Math.cos(a), dz = Math.sin(a);
      let r = 0.2, ok = false;
      for (; r < 12; r += 0.05) {
        const x = b.x + dx * r, z = b.z + dz * r; let free = true;
        for (const c of cols) { const q = c.r + 0.35 + 0.02; if ((x - c.x) ** 2 + (z - c.z) ** 2 < q * q) { free = false; break; } }
        if (free) { ok = true; break; }
      }
      if (ok) pts.push({ x: b.x + dx * r, z: b.z + dz * r, a });
    }
    return pts;
  }
  const rc = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3();
  const opaqueHit = (list, origin, dir, far) => {
    rc.set(origin, dir); rc.far = far;
    const hits = rc.intersectObjects(list, true);
    for (const h of hits) {
      const mt = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
      if (mt.opacity >= 0.5) return h;
    }
    return null;
  };

  async function f05(params) {
    const fast = params.fast === '1', portrait = params.portrait === '1';
    const dirsN = fast ? 8 : 16, yawN = fast ? 6 : 10, pitches = fast ? [12 * DEG] : [12 * DEG, 32 * DEG];
    const aspect = portrait ? 390 / 844 : 960 / 540;
    const cam = G.camera, saveAspect = cam.aspect; cam.aspect = aspect; cam.updateProjectionMatrix();
    const res = { cases: 0, heroBlocked: 0, covBad: 0, camInsideReal: 0, worstCov: 0, minDist: 99, perModel: {}, inHull: 0, samples: [] };
    for (const key of ['camp', 'haya']) {
      await setup(key);
      const bl = blockers(); const list = bl.map(b => b.o);
      // (a) the hero can never stand inside a prop's real box: every point of a fine grid inside each box is covered by a collider
      for (const b of bl) {
        if (b.name !== 'tent') continue;
        for (let u = -b.hx; u <= b.hx + 1e-6; u += b.hx / 3) for (let v = -b.hz; v <= b.hz + 1e-6; v += b.hz / 6) {
          const x = b.x + u * b.c + v * b.s, z = b.z - u * b.s + v * b.c; let cov = false;
          for (const c of G.world.props.colliders) { const q = c.r + 0.35; if ((x - c.x) ** 2 + (z - c.z) ** 2 < q * q) { cov = true; break; } }
          if (!cov) res.inHull++;
        }
      }
      for (const b of bl) {
        const pm = res.perModel[b.name] || (res.perModel[b.name] = { cases: 0, heroBlocked: 0, covBad: 0 });
        for (const pt of hullPoints(b, dirsN)) {
          for (const pitch of pitches) for (let k = 0; k < yawN; k++) {
            const yaw = k / yawN * 2 * Math.PI;
            PL().teleport(pt.x, pt.z, yaw); C().snap(); C().yaw = yaw; C().pitch = pitch;
            await step(14);
            const p = PL().pos; cam.updateMatrixWorld(true);
            res.cases++; pm.cases++;
            const cp = cam.position;
            if (inBox(b, cp.x, cp.y, cp.z, 0)) res.camInsideReal++;
            // hero visible: chest and head are not behind opaque cloth
            let blocked = false;
            for (const hy of [1.0, 1.6]) {
              _h.set(p.x, p.y + hy, p.z); _d.subVectors(_h, cp); const L = _d.length(); _d.normalize();
              if (opaqueHit(list, cp, _d, L - 0.05)) blocked = true;
            }
            if (blocked) { res.heroBlocked++; pm.heroBlocked++; if (res.samples.length < 4) res.samples.push({ k: key, m: b.name, hero: [+p.x.toFixed(2), +p.z.toFixed(2)], yawDeg: Math.round(yaw / DEG) }); }
            // view usable: share of the screen covered by opaque cloth that is NEARER than the hero (scenery behind him does not count)
            const heroD = Math.hypot(cp.x - p.x, cp.y - (p.y + 1.0), cp.z - p.z);
            let hit = 0, tot = 0;
            for (let iy = 0; iy < 7; iy++) for (let ix = 0; ix < 11; ix++) {
              _o.set((ix + 0.5) / 11 * 2 - 1, (iy + 0.5) / 7 * 2 - 1, 0.5).unproject(cam); _d.subVectors(_o, cp).normalize();
              tot++; if (opaqueHit(list, cp, _d, heroD)) hit++;
            }
            const cov = hit / tot; if (cov > res.worstCov) res.worstCov = cov;
            if (cov > 0.3) { res.covBad++; pm.covBad++; }
            const dh = Math.hypot(cp.x - p.x, cp.y - (p.y + 1.45), cp.z - p.z); if (dh < res.minDist) res.minDist = dh;
          }
        }
      }
    }
    cam.aspect = saveAspect; cam.updateProjectionMatrix();
    const pass = res.heroBlocked === 0 && res.covBad === 0 && res.inHull === 0;
    return { pass, detail: `cases ${res.cases}: hero behind opaque cloth ${res.heroBlocked}, screen >30% covered in front of hero ${res.covBad} (worst ${res.worstCov.toFixed(2)}), box cells without collider ${res.inHull}, camera inside real box ${res.camInsideReal}, min cam-hero ${res.minDist.toFixed(2)} m`, perModel: res.perModel, samples: res.samples };
  }

  /** continuous: the hero circles each camp tent along its collision hull at 3 m/s while the view orbits at 3 rad/s (transients count) */
  async function f05Moving() {
    await setup('camp');
    const bl = blockers().filter(b => b.name === 'tent'), list = blockers().map(b => b.o), cam = G.camera;
    let ticks = 0, blocked = 0, runLen = 0, maxRun = 0, yaw = 0;
    for (const b of bl) {
      const pts = hullPoints(b, 48).filter((_, i, a) => i < 48).sort((p, q) => p.a - q.a);
      pts.push(pts[0]);
      PL().teleport(pts[0].x, pts[0].z, 0); C().snap(); await step(10);
      for (let i = 1; i < pts.length; i++) {
        const A = pts[i - 1], B = pts[i], n = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / 0.05));
        for (let k = 1; k <= n; k++) {
          const x = A.x + (B.x - A.x) * k / n, z = A.z + (B.z - A.z) * k / n; yaw += 0.05;
          PL().teleport(x, z, yaw); C().yaw = yaw; await step(1); cam.updateMatrixWorld(true);
          const p = PL().pos, cp = cam.position; ticks++;
          let bk = false;
          for (const hy of [1.0, 1.6]) { _h.set(p.x, p.y + hy, p.z); _d.subVectors(_h, cp); const L = _d.length(); _d.normalize(); if (opaqueHit(list, cp, _d, L - 0.05)) bk = true; }
          if (bk) { blocked++; runLen++; if (runLen > maxRun) maxRun = runLen; } else runLen = 0;
        }
      }
    }
    return { pass: blocked / ticks <= 0.03 && maxRun <= 6, detail: `moving orbit: ${blocked}/${ticks} ticks with the hero behind opaque cloth (longest run ${maxRun} ticks = ${(maxRun / 60 * 1000) | 0} ms)` };
  }

  // ------------------------------------------------------------------------------------------ V05
  async function v05() {
    const out = {}; let pass = true;
    const measure = async (key, poi, hero) => {
      await setup(key);
      const L = G.world.level.current, w = L.poi(poi);
      PL().teleport(hero.x, hero.z, hero.yaw); C().snap(); await step(30);
      const pr = C().frame(w, { duration: 1 }); await step(90); void pr;
      const p = PL().pos, cp = G.camera.position;
      return { pitchDeg: +(C().pitch / DEG).toFixed(1), camAboveEye: +(cp.y - (p.y + 1.45)).toFixed(2), dist: +Math.hypot(cp.x - p.x, cp.y - (p.y + 1.45), cp.z - p.z).toFixed(2), heroY: +p.y.toFixed(1) };
    };
    // ch1 well-front spot (c1_well) and ch5 well-front spot (c5_staff)
    out.camp = await measure('camp', 'well', { x: 3.4, z: 3.0, yaw: Math.PI / 2 });
    out.haya = await measure('haya', 'well', { x: 6.8, z: 251.6, yaw: 0 });
    for (const k of ['camp', 'haya']) { const m = out[k]; if (!(m.pitchDeg >= 3 && m.pitchDeg <= 16 && m.camAboveEye >= 0 && m.camAboveEye <= 1.2 && m.dist <= 4.3)) pass = false; }
    // regression: a target with an explicit height keeps the old formula (other beats are untouched)
    await setup('camp'); PL().teleport(0, 20, 0); C().snap(); await step(30);
    const foc = { y: PL().pos.y + 1.45 }, t = { x: 12, y: G.world.terrain.heightAt(12, 30) + 0.5, z: 30 };
    C().frame(t, { duration: 1 }); await step(90);
    const h = Math.hypot(t.x - PL().pos.x, t.z - PL().pos.z);
    const exp = Math.min(40 * DEG, Math.max(-10 * DEG, Math.atan2(foc.y - t.y, Math.max(2, h * 0.4 + 3)) + 0.12));
    out.explicitY = { pitchDeg: +(C().pitch / DEG).toFixed(2), expectedDeg: +(exp / DEG).toFixed(2) };
    if (Math.abs(C().pitch - exp) > 0.6 * DEG) pass = false;
    return { pass, detail: `camp well ${JSON.stringify(out.camp)} | haya well ${JSON.stringify(out.haya)} | explicit-y ${JSON.stringify(out.explicitY)}` };
  }

  // ------------------------------------------------------------------------------------------ V04
  function ripples() {
    const W = 256, Hh = 256, rt = new THREE.WebGLRenderTarget(W, Hh), buf = new Uint8Array(W * Hh * 4);
    const tc = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    const T = G.world.terrain, spots = [[-10, 6], [8, -8], [60, 40], [-70, -35], [2, 110], [-130, 90], [150, -60], [-40, 190], [110, 160]];
    const blocks = [], lums = [];
    const saveRT = G.renderer.getRenderTarget();
    for (const [x, z] of spots) {
      tc.position.set(x, T.heightAt(x, z) + 7, z); tc.up.set(0, 0, -1); tc.lookAt(x, T.heightAt(x, z), z); tc.updateMatrixWorld(true);
      G.renderer.setRenderTarget(rt); G.renderer.render(G.scene, tc);
      G.renderer.readRenderTargetPixels(rt, 0, 0, W, Hh, buf);
      const L = new Float32Array(W * Hh);
      for (let i = 0; i < W * Hh; i++) L[i] = (buf[i * 4] * 0.299 + buf[i * 4 + 1] * 0.587 + buf[i * 4 + 2] * 0.114) / 255;
      // high-pass: remove a 49 px box blur (dune shading, large colour patches)
      const hp = new Float32Array(W * Hh), r = 24;
      const tmp = new Float32Array(W * Hh);
      for (let y = 0; y < Hh; y++) { let s = 0; for (let x = -r; x <= r; x++) s += L[y * W + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) { tmp[y * W + x] = s / (2 * r + 1); s += L[y * W + Math.min(W - 1, x + r + 1)] - L[y * W + Math.max(0, x - r)]; } }
      for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(Hh - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < Hh; y++) { hp[y * W + x] = L[y * W + x] - s / (2 * r + 1); s += tmp[Math.min(Hh - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
      lums.push(hp);
      // 64 px (~1.8 m, 3+ wavelengths) blocks: gradient energy, orientation (doubled angle), frequency ~ rms gradient / rms signal
      for (let by = 8; by < Hh - 72; by += 32) for (let bx = 8; bx < W - 72; bx += 32) {
        let e = 0, gxx = 0, gyy = 0, gxy = 0, sig = 0;
        for (let y = by; y < by + 64; y++) for (let x = bx; x < bx + 64; x++) {
          const gx = hp[y * W + x + 1] - hp[y * W + x - 1], gy = hp[(y + 1) * W + x] - hp[(y - 1) * W + x];
          gxx += gx * gx; gyy += gy * gy; gxy += gx * gy; sig += hp[y * W + x] ** 2;
        }
        e = gxx + gyy; if (sig < 1e-7 || e < 1e-7) continue;
        blocks.push({ ang: 0.5 * Math.atan2(2 * gxy, gxx - gyy), e, freq: Math.sqrt(e / sig) });
      }
    }
    G.renderer.setRenderTarget(saveRT); rt.dispose();
    let sx = 0, sy = 0, se = 0; for (const b of blocks) { sx += b.e * Math.cos(2 * b.ang); sy += b.e * Math.sin(2 * b.ang); se += b.e; }
    const coherence = Math.hypot(sx, sy) / se;                          // 1 = every block has the same ripple direction
    const fm = blocks.reduce((a, b) => a + b.freq, 0) / blocks.length, fcv = Math.sqrt(blocks.reduce((a, b) => a + (b.freq - fm) ** 2, 0) / blocks.length) / fm;
    let rms = 0, n = 0; for (const hp of lums) for (let i = 0; i < hp.length; i++) { rms += hp[i] * hp[i]; n++; } rms = Math.sqrt(rms / n);
    return { coherence: +coherence.toFixed(3), freqCV: +fcv.toFixed(3), contrastRMS: +rms.toFixed(4), blocks: blocks.length };
  }
  async function v04() {
    await setup('camp'); G.world.sky.setPreset('morning', { duration: 0 }); await step(3);
    const m = ripples();
    // baseline (old single sine): coherence 0.972, frequency CV 0.178, contrast 0.0327
    const pass = m.coherence <= 0.8 && m.freqCV >= 0.21 && m.contrastRMS <= 0.026 && m.contrastRMS >= 0.012;
    return { pass, detail: `direction coherence ${m.coherence} (<=0.80; 1 = printed uniform; was 0.972), wavelength spread CV ${m.freqCV} (>=0.21; was 0.178), high-pass contrast RMS ${m.contrastRMS} (0.012..0.026; was 0.0327), blocks ${m.blocks}`, metrics: m };
  }

  /** debug: park the real camera (after the rig) at (x,h above ground,z) looking at (tx,ty above ground,tz) — for screenshots */
  let lookHook = null;
  async function look(o) {
    if (o.level) await setup(o.level);
    const T = G.world.terrain, v = { ...o };
    if (lookHook) G.loop.remove && G.loop.remove(lookHook);
    lookHook = { lateUpdate() { G.camera.position.set(v.x, T.heightAt(v.x, v.z) + v.h, v.z); G.camera.lookAt(v.tx, T.heightAt(v.tx, v.tz) + (v.ty || 0), v.tz); } };
    G.loop.add(lookHook, 98); await step(2); return true;
  }
  /** debug: hero at (x,z) with the rig at yaw/pitch (degrees), settled for 40 ticks — for screenshots of the real follow camera */
  async function stand(o) {
    if (o.level) await setup(o.level);
    if (lookHook) { G.loop.remove && G.loop.remove(lookHook); lookHook = null; }
    PL().teleport(o.x, o.z, o.yaw); C().snap(); C().yaw = o.yaw; C().pitch = (o.pitch === undefined ? 12 : o.pitch) * DEG; await step(40); return true;
  }
  return {
    look, stand,
    run: async () => {
      const params = Object.fromEntries(new URLSearchParams(location.search).entries());
      const only = params.only || '', items = {}, t0 = performance.now(), lap = k => { items[k].ms = Math.round(performance.now() - t0); };
      // cheap checks first (fresh scene), the long orbit walk last
      if (!only || only.includes('V04')) { items.V04 = await v04(); lap('V04'); }
      if (!only || only.includes('V05')) { items.V05 = await v05(); lap('V05'); }
      if (!only || only.includes('F05')) { items.F05 = await f05(params); const mv = await f05Moving(); items.F05.moving = mv; if (!mv.pass) items.F05.pass = false; lap('F05'); }
      return { items, pass: Object.values(items).every(i => i.pass) };
    },
  };
}
