/**
 * Asset manager. Everything is optional at runtime: a missing/failed asset returns null and the caller falls back.
 *
 *   await assets.loadManifest()
 *   await assets.loadGroup('ch1', p => …)        // p: 0..1
 *   assets.model(id)     → { scene, animations, meta } | null     (template — do not add to the scene)
 *   assets.instance(id)  → Object3D | null   static models: wrapped so they sit on y=0, centred, facing +Z, real size
 *                                            humanoids: SkeletonUtils clone (own skeleton), `.animations` on userData
 *   assets.meta(id)      → manifest entry | null
 *   assets.texture(id)   → THREE.Texture | null
 *   assets.audioData(id) → ArrayBuffer | null  (encoded bytes; audio.js decodes after the AudioContext is unlocked)
 *   assets.image(id)     → url | null
 *
 * Failures: an id the manifest does not know is cached as null for good; a load that FAILS (network, decode) is not cached:
 * it is remembered in `failed` and retried with backoff on the next group load / retryFailed() / the browser's `online` event.
 *   await assets.loadGroup(name, onProgress, { force })  → { failed: [{kind,id,tries}] }   (a group with failures is not "loaded")
 *   assets.failed · assets.groupFailures(name) · await assets.retryFailed({ force })
 *   event 'assets:recovered' { id, kind }  when an item that failed (and was served as a stand-in) finally loads
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createMaterialQuality } from './asset-materials.js';

const BASE = 'assets/';

export function createAssets(G) {
  let manifest = { models: {}, textures: {}, audio: {}, images: {}, groups: {} };
  const models = new Map(), textures = new Map(), audio = new Map();
  const loadedGroups = new Set(), loadingGroups = new Map(), groupItems = new Map();
  const failed = new Map();            // 'kind:id' → { kind, id, tries, next }  (next = earliest wall-clock ms for a non-forced retry)
  const inflight = new Map();          // 'kind:id' → Promise (one load per item, shared by every caller)
  const standIns = new Set();          // 'model:id' served as null (callers built a stand-in) while the real one is missing
  G.events.on('level:unload', () => standIns.clear());   // the next level re-registers only the stand-ins it really uses
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const gltfLoader = new GLTFLoader(); gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const texLoader = new THREE.TextureLoader();
  const v = () => (manifest.generated ? `?v=${manifest.generated}` : '');

  async function loadManifest() {
    try {
      const r = await fetch(`${BASE}manifest.json?t=${typeof __BUILD__ !== 'undefined' ? __BUILD__ : ''}`, { cache: 'no-cache' });
      if (r.ok) manifest = Object.assign(manifest, await r.json());
      else console.warn('[assets] manifest http', r.status);
    } catch (e) { console.warn('[assets] no manifest', e); }
    return manifest;
  }

  const materialQuality = createMaterialQuality(G, () => Array.from(models.values(),m=>m?.scene).filter(Boolean));
  const simplifyMaterials = root => materialQuality.convert(root);

  /** run `work()` once per item; a rejection is remembered (not cached) so a later call retries it */
  function once(kind, id, store, force, work) {
    if (store.has(id)) return Promise.resolve();
    const key = kind + ':' + id;
    if (inflight.has(key)) return inflight.get(key);
    const f = failed.get(key);
    if (f && !force && nowMs() < f.next) return Promise.resolve();      // backing off
    const p = (async () => {
      try {
        store.set(id, await work());
        if (failed.delete(key) && standIns.delete(key)) G.events.emit('assets:recovered', { id, kind });
      } catch (e) {
        console.warn(`[assets] ${kind} "${id}" failed`, e);
        const tries = (f ? f.tries : 0) + 1;
        failed.set(key, { kind, id, tries, next: nowMs() + Math.min(30000, 1500 * 2 ** (tries - 1)) });
      } finally { inflight.delete(key); }
    })();
    inflight.set(key, p); return p;
  }

  function loadModel(id, force) {
    if (models.has(id)) return Promise.resolve();
    const meta = manifest.models[id];
    if (!meta) { models.set(id, null); return Promise.resolve(); }
    return once('model', id, models, force, async () => {
      const side = l => (l ? fetch(BASE + l.url + v()).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null);
      const [gltf, lodBuf, lod2Buf] = await Promise.all([gltfLoader.loadAsync(BASE + meta.url + v()), side(meta.lod1), side(meta.lod2)]);
      simplifyMaterials(gltf.scene);
      let mesh = null;
      gltf.scene.traverse(o => {
        if (o.isMesh && !mesh) mesh = o;
        if (o.isSkinnedMesh) { o.frustumCulled = false; }  // the actor wrapper assigns explicit bounds and re-enables culling
        if (o.isMesh && !o.isSkinnedMesh) { o.geometry.computeBoundingSphere(); }
      });
      const entry = { scene: gltf.scene, animations: gltf.animations || [], meta, mesh, lod1: null, lodIndex: null, lod2: null, lod2Index: null };
      // reduced index buffers over the template's own vertex buffers (LOD2 = far crowds only, see tools/assets.mjs)
      const share = (buf, l) => {
        const index = new THREE.BufferAttribute(l.u16 ? new Uint16Array(buf) : new Uint32Array(buf), 1);
        const g = new THREE.BufferGeometry();
        for (const name in mesh.geometry.attributes) g.setAttribute(name, mesh.geometry.attributes[name]);
        g.setIndex(index); g.boundingSphere = mesh.geometry.boundingSphere; g.boundingBox = mesh.geometry.boundingBox;
        return [g, index];
      };
      if (lodBuf && mesh) [entry.lod1, entry.lodIndex] = share(lodBuf, meta.lod1);
      if (lod2Buf && mesh) [entry.lod2, entry.lod2Index] = share(lod2Buf, meta.lod2);
      return entry;
    });
  }
  function loadTexture(id, force) {
    if (textures.has(id)) return Promise.resolve();
    const meta = manifest.textures[id];
    if (!meta) { textures.set(id, null); return Promise.resolve(); }
    return once('texture', id, textures, force, async () => {
      const t = await texLoader.loadAsync(BASE + meta.url + v());
      t.colorSpace = meta.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      if (meta.repeat !== false) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      t.anisotropy = Math.min(4, G.renderer.capabilities.getMaxAnisotropy());
      return t;
    });
  }
  function loadAudio(id, force) {
    if (audio.has(id)) return Promise.resolve();
    const meta = manifest.audio[id];
    if (!meta) { audio.set(id, null); return Promise.resolve(); }
    return once('audio', id, audio, force, async () => {
      const r = await fetch(BASE + meta.url + v());
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    });
  }
  const LOADERS = { model: loadModel, texture: loadTexture, audio: loadAudio };
  const failedList = () => Array.from(failed.values(), f => ({ kind: f.kind, id: f.id, tries: f.tries }));
  /** retry every item that failed (all of them with `force`, else only those whose backoff has elapsed) */
  async function retryFailed({ force = false } = {}) {
    const list = Array.from(failed.values());
    await Promise.all(list.map(f => LOADERS[f.kind](f.id, force)));
    return failedList();
  }
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', () => { if (failed.size) retryFailed({ force: true }); });

  /** Load a manifest group: { models:[ids], textures:[ids], audio:[ids] }. Unknown group → resolves immediately.
   *  Resolves `{ failed }` — items that could not be loaded (the group then stays "not loaded" and the next call retries them). */
  function loadGroup(name, onProgress, { force = false } = {}) {
    if (loadedGroups.has(name)) { if (onProgress) onProgress(1); return Promise.resolve({ failed: [] }); }
    if (loadingGroups.has(name)) return loadingGroups.get(name);
    const g = (manifest.groups && manifest.groups[name]) || {};
    const items = [];
    for (const id of g.models || []) items.push(['model', id]);
    for (const id of g.textures || []) items.push(['texture', id]);
    for (const id of g.audio || []) items.push(['audio', id]);
    groupItems.set(name, items);
    let ok = 0; const total = items.length || 1;
    const run = async () => {
      let next = 0;
      const worker = async () => {
        while (next < items.length) {
          const [kind, id] = items[next++]; await LOADERS[kind](id, force);
          if (!failed.has(kind + ':' + id)) ok++;                       // the bar counts what really arrived
          if (onProgress) onProgress(ok / total);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
      const bad = groupFailures(name);
      if (!bad.length) loadedGroups.add(name);
      loadingGroups.delete(name);
      if (onProgress && !bad.length) onProgress(1);
      return { failed: bad };
    };
    const p = run(); loadingGroups.set(name, p); return p;
  }
  /** the items of a group that are currently failed */
  function groupFailures(name) {
    const out = [];
    for (const [kind, id] of groupItems.get(name) || []) { const f = failed.get(kind + ':' + id); if (f) out.push({ kind, id, tries: f.tries }); }
    return out;
  }

  function instance(id) {
    const m = models.get(id); if (!m) { if (failed.has('model:' + id)) standIns.add('model:' + id); return null; }
    const meta = m.meta;
    if (meta.kind === 'humanoid') {
      const c = SkeletonUtils.clone(m.scene);
      c.userData.animations = m.animations; c.userData.meta = meta;
      return c;
    }
    const inner = m.scene.clone(true);
    inner.scale.setScalar(meta.scale || 1);
    if (meta.offset) inner.position.set(meta.offset[0], meta.offset[1], meta.offset[2]);
    const pivot = new THREE.Group(); pivot.add(inner);
    pivot.rotation.y = meta.yaw || 0;
    const root = new THREE.Group(); root.add(pivot);
    root.userData.meta = meta; root.name = id;
    return root;
  }

  return {
    loadManifest, loadGroup,
    groupLoaded: name => loadedGroups.has(name),
    get manifest() { return manifest; },
    model: id => { const m = models.get(id); if (!m && failed.has('model:' + id)) standIns.add('model:' + id); return m || null; },
    get failed() { return failedList(); },
    groupFailures, retryFailed,
    /** failed model ids whose stand-in is on screen right now (a rebuild of the level would use the real ones if they arrived) */
    get standIns() { return Array.from(standIns, k => k.slice(6)); },
    instance,
    meta: id => manifest.models[id] || null,
    /** reduced-detail geometry sharing the template's vertex buffers (null when the model has no LOD) */
    /** reduced geometry: level 1 (default, seam-safe) or 2 (far only; falls back to level 1) — null when the model has none */
    lodGeometry: (id, level = 1) => { const m = models.get(id); return (m && (level >= 2 ? m.lod2 || m.lod1 : m.lod1)) || null; },
    /** the reduced index buffer alone (for wrappers that build their own geometry in the same vertex order) */
    lodIndex: id => { const m = models.get(id); return (m && m.lodIndex) || null; },
    texture: id => textures.get(id) || null,
    audioData: id => audio.get(id) || null,
    audioMeta: id => manifest.audio[id] || null,
    image: id => (manifest.images && manifest.images[id] ? BASE + manifest.images[id].url + v() : null),
    /** load single items outside a group (dev/harness) */
    loadModel, loadTexture, loadAudio,
  };
}
