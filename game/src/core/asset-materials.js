/** Shared asset material variants. Quality changes preserve meshes, poses and ownership. */
import * as THREE from 'three';

export function createMaterialQuality(G, getTemplates = () => []) {
  const profiles = new Map(), pairs = new WeakMap();
  let nextProfile = 1;
  // The supplied albedo-led assets gain little from PBR on mobile; reserve its cost for high.
  const low = () => G.quality.tier !== 'high';

  function make(src, profile, cheap) {
    const m = cheap ? new THREE.MeshLambertMaterial() : new THREE.MeshStandardMaterial();
    // Base state includes transparency/depth/blending and userData, but not class flags.
    THREE.Material.prototype.copy.call(m, src);
    for (const k of ['map','alphaMap','lightMap','lightMapIntensity','envMap','emissiveMap']) if (src[k] !== undefined) m[k] = src[k];
    if (src.color) m.color.copy(src.color);
    if (src.emissive) m.emissive.copy(src.emissive);
    m.emissiveIntensity = src.emissiveIntensity ?? 1;
    if (!cheap) {
      m.roughness = Math.max(0.82, profile.roughness ?? 0.9);
      m.metalness = Math.min(0.06, profile.metalness || 0);
      m.normalMap = profile.normalMap; m.roughnessMap = profile.roughnessMap;
      m.aoMap = profile.aoMap; m.aoMapIntensity = 0.65;
    }
    return m;
  }
  function pairFor(src) {
    if (pairs.has(src)) return pairs.get(src);
    const profile = profiles.get(src.userData.hsAssetProfile);
    if (!profile) return null;
    const cheap = !!src.isMeshLambertMaterial;
    const alternate = make(src, profile, !cheap);
    // Cloned actor materials can carry their own vertex deformation and uniforms.
    alternate.onBeforeCompile = src.onBeforeCompile;
    alternate.onBeforeRender = src.onBeforeRender;
    const key = src.customProgramCacheKey.bind(src);
    alternate.customProgramCacheKey = () => key() + '|quality-variant';
    const pair = cheap ? { low: src, high: alternate } : { low: alternate, high: src };
    pairs.set(src,pair); pairs.set(alternate,pair);
    let disposing=false;
    const disposeOther = other => () => { if(disposing)return; disposing=true; other.dispose(); disposing=false; };
    src.addEventListener('dispose',disposeOther(alternate));
    alternate.addEventListener('dispose',disposeOther(src));
    return pair;
  }
  function select(src, cheap) {
    const pair=pairFor(src); if(!pair)return src;
    const target=cheap?pair.low:pair.high; if(target===src)return src;
    // Mutations such as an actor tint or a tent fade survive either direction.
    for(const k of ['opacity','transparent','depthWrite','depthTest','side','visible','alphaTest','wireframe','vertexColors','polygonOffset','polygonOffsetFactor','polygonOffsetUnits']) target[k]=src[k];
    target.color.copy(src.color); target.emissive.copy(src.emissive);
    target.emissiveIntensity=src.emissiveIntensity;
    target.needsUpdate=true;
    return target;
  }
  function convert(root) {
    const cache=new Map();
    const convertOne=src=>{
      if(cache.has(src))return cache.get(src);
      const id=nextProfile++,profile={roughness:src.roughness,metalness:src.metalness,normalMap:src.normalMap||null,roughnessMap:src.roughnessMap||null,aoMap:src.aoMap||null};
      profiles.set(id,profile);
      const m=make(src,profile,low());
      m.userData.hsAssetProfile=id; m.userData.hsShade=false;
      if(m.map){m.map.colorSpace=THREE.SRGBColorSpace;m.map.anisotropy=Math.min(low()?2:4,G.renderer.capabilities.getMaxAnisotropy());}
      G.shade.patch(m);cache.set(src,m);src.dispose();return m;
    };
    root.traverse(o=>{if(!o.isMesh)return;o.material=Array.isArray(o.material)?o.material.map(convertOne):convertOne(o.material);o.castShadow=false;o.receiveShadow=false;});
  }
  function refresh(tier) {
    const replacements=new Map(),cheap=tier!=='high';
    const one=m=>{if(!replacements.has(m))replacements.set(m,select(m,cheap));return replacements.get(m);};
    const visit=root=>root?.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(one):one(o.material);});
    visit(G.scene);
    for(const root of getTemplates())visit(root);
    // These material lists intentionally outlive their mesh and drive cloth fades.
    for(const b of G.world?.props?.camBlockers||[])b.mats=b.mats.map(one);
  }
  G.events.on('quality:changed',e=>{if(e?.tier)refresh(e.tier);});
  return {convert,refresh};
}
