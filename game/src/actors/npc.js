/**
 * NPC registry (`G.actors.npcs`): humanoid characters that walk, follow, ride, talk, plus baked crowds of extras.
 *   spawn(id, modelId, { x, z, yaw, tint, scale, clip }) → npc { goTo follow followTrail stop lookAtPlayer ride unride speak place play playOnce }
 *   crowd(modelId, [{ x, z, yaw, tint?, clip, t }]) → { setVisible(b), remove() }   (no skinned meshes: poses baked on the CPU)
 */
import * as THREE from 'three';
import { createHumanoid, humanoidMeasure, foldGroundLegs } from './humanoid.js';
import { yawOf, turnToward, damp, clamp, angleDelta, DEG } from '../core/math.js';

const _o = { x: 0, z: 0 }, _v = new THREE.Vector3(), _n = new THREE.Vector3(), _n2 = new THREE.Vector3(), _tp = { x: 0, z: 0 };

export function createNpcs(G) {
  const map = new Map(); const list = [];
  const crowds = new Set();

  function makeNpc(id, modelId, o) {
    const actor = createHumanoid(G, modelId, { tint: o.tint, scale: o.scale, name: id });
    actor.place(o.x || 0, o.z || 0, o.yaw || 0);
    actor.play(o.clip || 'idle', { fade: 0 });
    let mode = 'idle', tx = 0, tz = 0, stopD = 0.4, spd = 1.6, followT = null, followDist = 1.6, followSpeed = 2.2, behind = 2.5;
    let look = false, riding = null, speed = 0, job = null, best = 1e9, stuck = 0, speaking = false, jid = 0, speechGestures = true;
    const finish = v => { if (job) { job.v = v; job = null; } };

    /** move along (dx,dz) at speed sp for dt: turn, avoid props / player circle, stay on the terrain */
    function walk(dx, dz, sp, dt, turn = 8) {
      const p = actor.pos;
      actor.yaw = turnToward(actor.yaw, yawOf(dx, dz), turn * dt);
      speed = damp(speed, sp, 6, dt);
      _o.x = p.x + Math.sin(actor.yaw) * speed * dt; _o.z = p.z + Math.cos(actor.yaw) * speed * dt;
      const cols = G.world.props.colliders;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i], r = c.r + 0.4, ex = _o.x - c.x, ez = _o.z - c.z, d2 = ex * ex + ez * ez;
        if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); _o.x = c.x + ex / d * r; _o.z = c.z + ez / d * r; }
      }
      const pl = G.actors.player.pos, ex = _o.x - pl.x, ez = _o.z - pl.z, d2 = ex * ex + ez * ez;   // 0.45 m personal circle
      if (d2 < 0.2025 && d2 > 1e-8) { const d = Math.sqrt(d2); _o.x = pl.x + ex / d * 0.45; _o.z = pl.z + ez / d * 0.45; }
      actor.place(_o.x, _o.z); actor.locomotion(speed);
    }
    function standStill(dt) { if (speed > 0.02) { speed = damp(speed, 0, 8, dt); actor.locomotion(speed); } else if (speed !== 0) { speed = 0; actor.locomotion(0); } }

    const npc = {
      id, actor, modelId,
      get pos() { return actor.pos; },
      get yaw() { return actor.yaw; },
      get riding() { return riding; },
      get busy() { return mode !== 'idle'; },
      place(x, z, yaw) { actor.place(x, z, yaw); },
      play: (c, opt) => actor.play(c, opt),
      playOnce: (c, opt) => actor.playOnce(c, opt),
      /** walk to a point; resolves true on arrival (false if superseded / blocked) — arrives facing the travel direction */
      goTo(x, z, { speed: sp = 1.6, stop = 0.4 } = {}) {
        if (riding) return Promise.resolve(false);
        finish(false);
        followT = null; mode = 'goto'; tx = x; tz = z; spd = sp; stopD = stop; best = 1e9; stuck = 0;
        const j = job = { v: undefined };
        if (G.state.fastText) { actor.place(x, z); j.fast = true; }
        return G.scope.task(() => j.v);
      },
      follow(target, { dist = 1.6, speed: sp = 2.2 } = {}) { finish(false); followT = target; followDist = dist; followSpeed = sp; mode = 'follow'; },
      /** walk the player's recorded path, `behind` metres back (the child in the storm) */
      followTrail(player = G.actors.player, { behind: b = 2.5, speed: sp = 4 } = {}) { finish(false); followT = player; behind = b; followSpeed = sp; mode = 'trail'; },
      stop() { finish(false); mode = 'idle'; followT = null; },
      lookAtPlayer(on) { look = !!on; actor.lookAt(on ? G.actors.player.actor : null); },
      speak(on) { speaking = !!on; actor.gesture(!!on && speechGestures); },
      /** A quiet dramatic line keeps the authored seated/idle pose instead of a looping talk overlay. */
      setSpeechGesture(on) { speechGestures = !!on; actor.gesture(speaking && speechGestures); },
      /** sit on a camel's saddle (instant) */
      ride(camel, { x = 0, y = 0, z = 0 } = {}) {
        finish(false); mode = 'idle'; followT = null; riding = camel; speed = 0;
        actor.sitOn(camel.saddle); actor.root.position.set(x, y, z);
      },
      unride() {
        if (!riding) return; const c = riding; riding = null;
        actor.sitOn(null);
        const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
        actor.place(c.pos.x - co * 1.4, c.pos.z + s * 1.4, c.yaw);
      },
      update(dt) {
        if (!riding) {
          if (mode === 'goto') {
            const p = actor.pos, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
            if (job && job.fast) { finish(true); mode = 'idle'; }
            else {
              if (d < best - 0.02) { best = d; stuck = 0; } else stuck += dt;
              if (d <= stopD) { finish(true); mode = 'idle'; standStill(dt); }
              else if (stuck > 3) { finish(false); mode = 'idle'; }
              else walk(dx, dz, Math.min(spd, 0.5 + d * 2), dt);
            }
          } else if (mode === 'follow' && followT) {
            const t = followT.pos || followT.position || followT, p = actor.pos;
            const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
            if (d > followDist) walk(dx, dz, Math.min(followSpeed, (d - followDist) * 2 + 0.8), dt); else standStill(dt);
          } else if (mode === 'trail' && followT && followT.trail) {
            followT.trail.behind(behind, _tp);
            const p = actor.pos, dx = _tp.x - p.x, dz = _tp.z - p.z, d = Math.hypot(dx, dz);
            if (d > 0.2) walk(dx, dz, Math.min(followSpeed, 0.5 + d * 2.5), dt, 10); else standStill(dt);
          } else standStill(dt);
          if (look && mode === 'idle' && !speaking) {                 // turn the body when the player is far off to the side
            const pl = G.actors.player.pos, a = angleDelta(actor.yaw, yawOf(pl.x - actor.pos.x, pl.z - actor.pos.z));
            if (Math.abs(a) > 55 * DEG) actor.faceTo(pl.x, pl.z, 3);
          }
        }
        actor.update(dt);
      },
      dispose() { finish(false); actor.dispose(); },
    };
    return npc;
  }

  // ---- baked crowd: skinned pose → static geometry, one plain Mesh per extra
  function crowd(modelId, items, opts = {}) {
    const group = new THREE.Group(); group.name = 'crowd:' + modelId;
    const own = []; const tints = new Map(); const lods = [];
    const inst = G.assets.instance(modelId);
    const M = humanoidMeasure(G, modelId);
    if (inst) {
      const holder = new THREE.Group(); holder.add(inst);
      const mixer = new THREE.AnimationMixer(inst);
      const anims = inst.userData.animations || [];
      const byName = {}; for (const c of anims) byName[c.name] = c;
      const lodGeo = G.assets.lodGeometry ? G.assets.lodGeometry(modelId) : null;
      const farGeo = G.assets.lodGeometry ? G.assets.lodGeometry(modelId, 2) : null;
      const meshes = [], crowdBones = {}; inst.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); if (o.isBone) crowdBones[o.name] = o; });
      // near: full index for ≤ 6 extras, the seam-safe LOD1 for big crowds / low tier; far (beyond FAR_NEAR m, scaled per tier
      // by core/lod.js): the Permissive LOD2 — a crowd seen from a ridge costs a fraction, and nobody close sees its seams
      const useLod = opts.lod !== undefined ? opts.lod : (items.length > 6 || G.quality.tier === 'low');
      const FAR_NEAR = 40;
      for (const it of items) {
        const clip = byName[it.clip] || byName.sit || byName.idle || anims[0];
        if (clip) { const a = mixer.clipAction(clip); a.play(); a.time = clamp(it.t || 0, 0, clip.duration); mixer.update(0); }
        holder.updateMatrixWorld(true);
        if ((it.clip || 'sit') === 'sit' || !byName[it.clip]) foldGroundLegs(holder, crowdBones);
        const mesh = meshes[0]; if (!mesh) continue;
        const src = mesh.geometry, idx = (useLod && lodGeo && lodGeo.index) ? lodGeo.index : src.index, n = src.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), pa = src.attributes.position, na = src.attributes.normal;
        // bake into the holder (actor) space: skin the vertex and its normal, then mesh matrixWorld
        for (let i = 0; i < n; i++) {
          _v.fromBufferAttribute(pa, i); mesh.applyBoneTransform(i, _v);
          if (na) { _n.fromBufferAttribute(na, i).add(_n2.fromBufferAttribute(pa, i)); mesh.applyBoneTransform(i, _n); _n.sub(_v).transformDirection(mesh.matrixWorld); nor[i * 3] = _n.x; nor[i * 3 + 1] = _n.y; nor[i * 3 + 2] = _n.z; }
          _v.applyMatrix4(mesh.matrixWorld);
          pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv);
        if (idx) g.setIndex(idx);
        if (na) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); else g.computeVertexNormals();
        g.computeBoundingSphere();
        let gFar = null;
        if (farGeo && farGeo.index && farGeo.index !== idx) {
          gFar = new THREE.BufferGeometry();
          for (const name in g.attributes) gFar.setAttribute(name, g.attributes[name]);
          gFar.setIndex(farGeo.index); gFar.boundingSphere = g.boundingSphere;
          own.push(gFar);
        }
        let mat = mesh.material;
        if (it.tint !== undefined && it.tint !== null) {
          mat = tints.get(it.tint);
          if (!mat) { mat = mesh.material.clone(); mat.userData.hsShade = false; G.shade.patch(mat); mat.color.set(it.tint); tints.set(it.tint, mat); }
        }
        const m = new THREE.Mesh(g, mat); m.frustumCulled = true; m.matrixAutoUpdate = true;
        const k = it.clip === 'sit' || !byName[it.clip] ? 'sit' : it.clip;
        // Exact posed garment clearance, including terrain under the full seated silhouette.
        let drop = -Infinity; const sy = Math.sin(it.yaw || 0), cy = Math.cos(it.yaw || 0), base = G.world.terrain.heightAt(it.x, it.z);
        for (let i = 0; i < n; i++) {
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          drop = Math.max(drop, G.world.terrain.heightAt(it.x + x * cy + z * sy, it.z - x * sy + z * cy) - base + 0.022 - y);
        }
        m.rotation.y = it.yaw || 0; m.position.set(it.x, G.world.terrain.heightAt(it.x, it.z) + drop, it.z);
        group.add(m); own.push(g);
        if (gFar && G.lod) lods.push(G.lod.add({ at: m, near: FAR_NEAR, set(level) { m.geometry = level ? gFar : g; } }));
        mixer.stopAllAction(); mixer.uncacheClip(clip);
      }
      mixer.uncacheRoot(inst);
    } else {
      // stand-in: a squat capsule per item
      const mat = G.shade.patch(new THREE.MeshLambertMaterial({ color: 0xd8c8a8 })); own.push(mat);
      const geo = new THREE.CapsuleGeometry(0.22, 0.5, 3, 6); own.push(geo);
      for (const it of items) { const m = new THREE.Mesh(geo, mat); m.position.set(it.x, G.world.terrain.heightAt(it.x, it.z) + 0.45, it.z); group.add(m); }
    }
    G.scene.add(group);
    const blobs = [];
    if (G.world.decals && G.world.decals.blob) for (const it of items) { const o = new THREE.Object3D(); o.position.set(it.x, G.world.terrain.heightAt(it.x, it.z), it.z); blobs.push(G.world.decals.blob(o, 0.55)); }
    const h = {
      group,
      setVisible(b) { group.visible = !!b; },
      remove() {
        if (!crowds.has(h)) return; crowds.delete(h);
        for (const b of blobs) b.remove();
        for (const l of lods) l.remove();
        G.scene.remove(group); for (const g of own) g.dispose(); for (const m of tints.values()) m.dispose();
      },
    };
    crowds.add(h);
    return h;
  }

  return {
    spawn(id, modelId, o = {}) {
      const old = map.get(id); if (old) return old;                    // idempotent per id
      const n = makeNpc(id, modelId, o); map.set(id, n); list.push(n); return n;
    },
    crowd,
    get: id => map.get(id) || null,
    get all() { return list; },
    remove(id) { const n = map.get(id); if (!n) return; n.dispose(); map.delete(id); list.splice(list.indexOf(n), 1); },
    clear() { for (const n of list) n.dispose(); map.clear(); list.length = 0; for (const c of [...crowds]) c.remove(); },
    onLevelUnload() { this.clear(); },
    update(dt) { for (let i = 0; i < list.length; i++) list[i].update(dt); },
  };
}
