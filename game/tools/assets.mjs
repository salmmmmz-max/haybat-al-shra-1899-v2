#!/usr/bin/env node
/**
 * Asset pipeline — هيبة الصحراء ١٨٩٩
 *
 * Reads game/assets.sources.json, downloads the raw generated files (cached in game/.cache/raw),
 * optimizes them and writes the shippable files + manifest into app/public/assets/.
 *
 *   node tools/assets.mjs            # process everything that is missing or changed
 *   node tools/assets.mjs --force    # reprocess all
 *   node tools/assets.mjs dhari tent # only these ids
 *
 * The SAME script runs locally and in the remote Higgsfield sandbox, so the binary outputs never
 * have to be copied between machines: both sides rebuild them from the same sources.
 *
 * Models
 *   - "prop" / "quadruped": static meshes. Normalized so that the manifest carries the transform
 *     needed to put the model on the ground (y=0), centered, facing +Z, at its real-world size.
 *   - "humanoid": rigged GLB (+ extra single-clip GLBs merged in by node name). Never re-scaled:
 *     the manifest carries height + clip names.
 * Textures are resized + converted to WebP (EXT_texture_webp); geometry is meshopt-compressed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, getBounds, weld, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(__dirname, '..');
const OUT = path.resolve(GAME, '../app/public/assets');
const RAW = path.join(GAME, '.cache/raw');
const SRC = JSON.parse(fs.readFileSync(path.join(GAME, 'assets.sources.json'), 'utf8'));
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = args.filter(a => !a.startsWith('--'));

fs.mkdirSync(RAW, { recursive: true });
for (const d of ['models', 'tex', 'audio', 'img']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

function fetchRaw(name, src) {
  const url = /^https?:/.test(src) ? src : SRC.cdn + src;
  const file = path.join(RAW, name);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    process.stdout.write(`  ↓ ${name}\n`);
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', file, url], { stdio: 'inherit' });
  }
  return file;
}
const want = id => ONLY.length === 0 || ONLY.includes(id);
const r3 = v => Math.round(v * 1000) / 1000;

const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
manifest.models ??= {}; manifest.textures ??= {}; manifest.audio ??= {}; manifest.images ??= {};

/** Copy every animation of `from` into `into`, matching channels to nodes by NAME. */
function mergeClip(into, from, clipName) {
  const nodesByName = new Map(into.getRoot().listNodes().map(n => [n.getName(), n]));
  const buffer = into.getRoot().listBuffers()[0];
  for (const anim of from.getRoot().listAnimations()) {
    const out = into.createAnimation(clipName);
    for (const ch of anim.listChannels()) {
      const target = ch.getTargetNode(); const s = ch.getSampler();
      if (!target || !s) continue;
      const node = nodesByName.get(target.getName());
      if (!node) continue;
      const input = into.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buffer);
      const output = into.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buffer);
      const sampler = into.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
      out.addSampler(sampler);
      out.addChannel(into.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
  }
}

/** Remove scale tracks and horizontal root motion so every clip plays in place at the rig's own scale. */
function sanitizeClips(doc, rootBone = 'Hips') {
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode(); if (!node) continue;
      const p = ch.getTargetPath();
      if (p === 'scale') { anim.removeChannel(ch); ch.dispose(); continue; }
      if (p === 'translation') {
        if (node.getName() !== rootBone) { anim.removeChannel(ch); ch.dispose(); continue; }
        // keep vertical bob, pin X/Z to the first key
        const acc = ch.getSampler().getOutput(); const arr = acc.getArray().slice();
        const x0 = arr[0], z0 = arr[2];
        for (let i = 0; i < arr.length; i += 3) { arr[i] = x0; arr[i + 2] = z0; }
        acc.setArray(arr);
      }
    }
  }
}

/**
 * V03: pre-filter the base textures before the WebP pass — `texFilter: { median: 3, kernel: 'mitchell' }` in the source
 * entry. A small median at source resolution removes the generated speckle while keeping edges (eyes, brows, hems);
 * Mitchell then downsizes without the ringing/oversharpening of the default Lanczos3.
 */
async function filterTextures(doc, f, size) {
  for (const t of doc.getRoot().listTextures()) {
    const img = t.getImage(); if (!img) continue;
    let buf = Buffer.from(img);
    if (f.median) buf = await sharp(buf).median(f.median).png().toBuffer();
    const meta = await sharp(buf).metadata();
    const w = Math.min(size, meta.width), h = Math.min(size, meta.height);
    buf = await sharp(buf).resize(w, h, { kernel: f.kernel || 'mitchell', fit: 'fill' }).png().toBuffer();
    t.setImage(new Uint8Array(buf)).setMimeType('image/png');
  }
}

async function optimize(doc, { texSize = 1024, animated = false }) {
  await doc.transform(
    dedup(), prune(),
    ...(animated ? [resample({ tolerance: 0.001 })] : [weld()]),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality: 82 }),
    ...(animated ? [quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 })] : []),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
}

/**
 * LOD1 = a 20 % index buffer over the SAME vertices, computed from the file as written (final vertex order) and stored
 * as a sidecar models/<id>.lod1.bin. Only for single-primitive models above 3k triangles.
 * Humanoids (F04): generated characters have many UV islands; a position-only 'Permissive' collapse welds across
 * them and shreds the texture. They are simplified with normal + UV weights, open borders locked, no Permissive and
 * a small error bound (0.5 %): ≈ 60-70 % of the triangles — UV seams set the floor, which is the honest LOD.
 */
const HUMAN_LOD = { ratio: 0.2, error: 0.005, weights: [0.5, 0.5, 0.5, 1, 1], flags: ['LockBorder'] };
async function writeLod(id, glbFile, kind) {
  const d = await io.read(glbFile);
  const prims = d.getRoot().listMeshes().flatMap(m => m.listPrimitives());
  const lodFile = path.join(OUT, 'models', `${id}.lod1.bin`);
  if (fs.existsSync(lodFile)) fs.unlinkSync(lodFile);
  const lod2Old = path.join(OUT, 'models', `${id}.lod2.bin`); if (fs.existsSync(lod2Old)) fs.unlinkSync(lod2Old);
  if (prims.length !== 1 || !prims[0].getIndices()) return { tris: prims.reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0) | 0 };
  const prim = prims[0]; const pos = prim.getAttribute('POSITION'); const n = pos.getCount();
  const tris = prim.getIndices().getCount() / 3;
  if (tris <= 3000) return { tris };
  const positions = new Float32Array(n * 3); const el = [0, 0, 0];
  for (let i = 0; i < n; i++) { pos.getElement(i, el); positions[i * 3] = el[0]; positions[i * 3 + 1] = el[1]; positions[i * 3 + 2] = el[2]; }
  const indices = new Uint32Array(prim.getIndices().getArray());
  let lod;
  if (kind === 'humanoid') {
    const nor = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0'), attrs = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      if (nor) { nor.getElement(i, el); attrs[i * 5] = el[0]; attrs[i * 5 + 1] = el[1]; attrs[i * 5 + 2] = el[2]; }
      if (uv) { uv.getElement(i, el); attrs[i * 5 + 3] = el[0]; attrs[i * 5 + 4] = el[1]; }
    }
    const L = HUMAN_LOD, target = Math.floor(indices.length * L.ratio / 3) * 3;
    [lod] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attrs, 5, L.weights, null, target, L.error, L.flags);
  } else {
    // props / animals (Tripo): few UV islands, so the seam-safe attribute-aware simplifier reaches ≈ 20-31 % without welding
    // across islands (camel 24 %, wolf 20 %, tent 30 %, campfire 29 %, camelsit 28 %, waterskins 31 %)
    const target = Math.floor(indices.length * 0.2 / 3) * 3;
    const nor = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0');
    // a LOD is only worth it when it is cheap: try seam-safe (0.02, borders locked), then seam-safe 0.04; if neither reaches
    // ≤ 32 % of the triangles (well, acacia: dense UV islands) keep the Permissive 20 % used so far for those props —
    // they switch beyond 22 m (× tier scale), where a welded island is a pixel or two.
    if (nor && uv) {
      const attrs = new Float32Array(n * 5);
      for (let i = 0; i < n; i++) { nor.getElement(i, el); attrs[i * 5] = el[0]; attrs[i * 5 + 1] = el[1]; attrs[i * 5 + 2] = el[2]; uv.getElement(i, el); attrs[i * 5 + 3] = el[0]; attrs[i * 5 + 4] = el[1]; }
      for (const [err, flags] of [[0.02, ['LockBorder']], [0.04, []]]) {
        [lod] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attrs, 5, [0.5, 0.5, 0.5, 1, 1], null, target, err, flags);
        if (lod.length <= indices.length * 0.32) break;
      }
      if (lod.length > indices.length * 0.32) [lod] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.03, ['Permissive']);
    } else [lod] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.03, ['Permissive']);
  }
  const u16 = n < 65536; const out = u16 ? new Uint16Array(lod) : new Uint32Array(lod);
  fs.writeFileSync(lodFile, Buffer.from(out.buffer, out.byteOffset, out.byteLength));
  const res = { tris, lod1: { url: `models/${id}.lod1.bin`, tris: lod.length / 3, u16, bytes: out.byteLength } };
  if (kind === 'humanoid') {
    // LOD2 (far): the seam-safe LOD1 cannot go below ≈ 55-70 % (UV islands lock it), so crowds seen from afar get a
    // position-only Permissive level (≈ 15 %). It welds across UV islands, which is invisible only when the figure is small:
    // consumers switch to it beyond ~40 m (npc crowds). Never used up close.
    const lod2File = path.join(OUT, 'models', `${id}.lod2.bin`);
    const t2 = Math.floor(indices.length * 0.15 / 3) * 3;
    const [l2] = MeshoptSimplifier.simplify(indices, positions, 3, t2, 0.03, ['Permissive']);
    const o2 = u16 ? new Uint16Array(l2) : new Uint32Array(l2);
    fs.writeFileSync(lod2File, Buffer.from(o2.buffer, o2.byteOffset, o2.byteLength));
    res.lod2 = { url: `models/${id}.lod2.bin`, tris: l2.length / 3, u16, bytes: o2.byteLength };
  }
  return res;
}

for (const [id, m] of Object.entries(SRC.models || {})) {
  if (!want(id)) continue;
  const outFile = path.join(OUT, 'models', `${id}.glb`);
  const stamp = JSON.stringify(m);
  if (!FORCE && fs.existsSync(outFile) && manifest.models[id]?.stamp === stamp) continue;
  console.log(`model ${id}`);
  const doc = await io.read(fetchRaw(`${id}.glb`, m.src));
  const entry = { url: `models/${id}.glb`, kind: m.kind, stamp };

  if (m.kind === 'humanoid') {
    // rename the base clip, merge extras
    const anims = doc.getRoot().listAnimations();
    if (anims[0]) anims[0].setName(m.baseClip || 'walk');
    for (const a of anims.slice(1)) a.dispose();
    for (const [clip, src] of Object.entries(m.clips || {})) {
      const extra = await io.read(fetchRaw(`${id}__${clip}.glb`, src));
      mergeClip(doc, extra, clip);
    }
    sanitizeClips(doc);
    for (const mat of doc.getRoot().listMaterials()) mat.setAlphaMode('OPAQUE').setDoubleSided(true).setMetallicFactor(0).setRoughnessFactor(1);
    const { min, max } = getBounds(doc.getRoot().listScenes()[0]);
    entry.height = m.height || r3(max[1] - min[1]);
    entry.measured = [r3(max[0] - min[0]), r3(max[1] - min[1]), r3(max[2] - min[2])];
    entry.clips = doc.getRoot().listAnimations().map(a => a.getName());
    entry.bones = doc.getRoot().listSkins()[0]?.listJoints().map(j => j.getName()) || [];
    if (m.texFilter) await filterTextures(doc, m.texFilter, m.texSize || 1024);
    await optimize(doc, { texSize: m.texSize || 1024, animated: true });
  } else {
    for (const mat of doc.getRoot().listMaterials()) mat.setAlphaMode('OPAQUE').setMetallicFactor(0).setRoughnessFactor(1);
    const { min, max } = getBounds(doc.getRoot().listScenes()[0]);
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    // real-world scale: `fit` = { axis: 'x'|'y'|'z'|'max', meters }
    const fit = m.fit || { axis: 'max', meters: 1 };
    const dim = fit.axis === 'max' ? Math.max(...size) : size['xyz'.indexOf(fit.axis)];
    const scale = fit.meters / dim;
    entry.scale = r3(scale);
    entry.yaw = m.yaw || 0;                       // radians to add so the model faces +Z
    entry.offset = [r3(-(min[0] + max[0]) / 2 * scale), r3(-min[1] * scale + (m.sink || 0)), r3(-(min[2] + max[2]) / 2 * scale)];
    entry.size = size.map(v => r3(v * scale));    // before yaw
    if (m.spec) entry.spec = m.spec;
    await optimize(doc, { texSize: m.texSize || 1024, animated: false });
  }
  await io.write(outFile, doc);
  entry.bytes = fs.statSync(outFile).size;
  Object.assign(entry, await writeLod(id, outFile, m.kind));
  manifest.models[id] = entry;
  console.log(`  → ${(entry.bytes / 1024).toFixed(0)} KB`, entry.kind === 'humanoid' ? `clips: ${entry.clips.join(', ')}` : `size ${entry.size.join('×')} m`);
}

for (const [id, t] of Object.entries(SRC.textures || {})) {
  if (!want(id)) continue;
  const ext = t.format || 'webp';
  const outFile = path.join(OUT, 'tex', `${id}.${ext}`);
  const stamp = JSON.stringify(t);
  if (!FORCE && fs.existsSync(outFile) && manifest.textures[id]?.stamp === stamp) continue;
  console.log(`texture ${id}`);
  const raw = t.local ? path.resolve(GAME, t.local) : fetchRaw(`${id}${path.extname(t.src) || '.png'}`, t.src);
  let img = sharp(raw);
  if (t.size) img = img.resize(t.size[0], t.size[1], { fit: 'fill' });
  if (ext === 'webp') img = img.webp({ quality: t.quality || 85, lossless: !!t.lossless });
  else if (ext === 'jpg') img = img.jpeg({ quality: t.quality || 85 });
  else img = img.png();
  await img.toFile(outFile);
  manifest.textures[id] = { url: `tex/${id}.${ext}`, stamp, bytes: fs.statSync(outFile).size, ...(t.meta || {}) };
}

for (const [id, a] of Object.entries(SRC.audio || {})) {
  if (!want(id)) continue;
  const outFile = path.join(OUT, 'audio', `${id}.mp3`);
  const stamp = JSON.stringify(a);
  if (!FORCE && fs.existsSync(outFile) && manifest.audio[id]?.stamp === stamp) continue;
  console.log(`audio ${id}`);
  const raw = fetchRaw(`${id}${path.extname(a.src.split('?')[0]) || '.wav'}`, a.src);
  // loudness targets (dBFS-ish, via loudnorm I): voice -16 LUFS, sfx -20, music -24 ; true peak ≤ -3 dB
  const I = a.lufs ?? ({ music: -24, sfx: -20, voice: -16, ambience: -26 }[a.type || 'sfx']);
  const af = [`loudnorm=I=${I}:TP=-3:LRA=11`];
  if (a.trim) af.unshift(`atrim=${a.trim[0]}:${a.trim[1]},asetpts=PTS-STARTPTS`);
  if (a.fade) af.push(`afade=t=in:st=0:d=${a.fade[0]}`, `areverse,afade=t=in:st=0:d=${a.fade[1]},areverse`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', af.join(','), '-ac', a.mono ? '1' : '2', '-ar', '44100', '-b:a', a.bitrate || (a.type === 'music' ? '128k' : '96k'), outFile]);
  manifest.audio[id] = { url: `audio/${id}.mp3`, type: a.type || 'sfx', loop: !!a.loop, stamp, bytes: fs.statSync(outFile).size };
}

manifest.groups = SRC.groups || manifest.groups || {};
manifest.generated = SRC.version || 1;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
const total = [...Object.values(manifest.models), ...Object.values(manifest.textures), ...Object.values(manifest.audio)].reduce((s, e) => s + (e.bytes || 0) + ((e.lod1 && e.lod1.bytes) || 0) + ((e.lod2 && e.lod2.bytes) || 0), 0);
console.log(`manifest: ${Object.keys(manifest.models).length} models, ${Object.keys(manifest.textures).length} textures, ${Object.keys(manifest.audio).length} audio — ${(total / 1048576).toFixed(2)} MB`);
