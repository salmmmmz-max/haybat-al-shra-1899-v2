/**
 * weather.js — wind, terrain streamers, storm (world-space dust volumes + grains), rain (streaks + splashes), scripted gusts.
 * Everything is camera-relative, preallocated at construction (counts/alpha 0 when unused) and tier-scaled.
 */
import * as THREE from 'three';
import { SHADE_PARS_FRAGMENT, SHADE_FRAGMENT } from '../core/shade.js';
import { DEG, lerp, clamp, smoothstep } from '../core/math.js';

const GRAINS = { low: 120, medium: 200, high: 300 };
const RAIN = { low: 250, medium: 450, high: 700 };
const SPLASH = { low: 40, medium: 70, high: 110 };
const RIBBONS = { low: 8, medium: 14, high: 22 };
const K = 14;                 // points per ribbon

const STREAK_VS = `
  attribute vec4 aSeed; attribute float aEnd;
  uniform float uPhase, uAmt, uLen, uBox, uSpread;
  uniform vec3 uDir;
  varying float vAl;
  #include <fog_pars_vertex>
  void main() {
    vec3 base = aSeed.xyz * uBox;
    float sp = 0.75 + 0.5 * fract(aSeed.w * 7.31);
    vec3 p = base + uDir * (uPhase * sp);
    vec3 r = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5;
    r.y *= uSpread;
    vAl = (aSeed.w < uAmt ? 1.0 : 0.0) * smoothstep(0.6, 2.5, length(r)) * (1.0 - smoothstep(0.35, 0.5, length(r) / uBox));
    r -= uDir * (uLen * sp) * aEnd;
    vec4 mvPosition = viewMatrix * vec4(cameraPosition + r, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const STREAK_FS = SHADE_PARS_FRAGMENT + `
  uniform vec3 uColor; uniform float uAlpha; varying float vAl;
  #include <fog_pars_fragment>
  void main() {
    if (vAl < 0.01) discard;
    gl_FragColor = vec4(uColor, vAl * uAlpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
  }`;

const RIB_VS = `
  attribute float aA; varying float vA;
  #include <fog_pars_vertex>
  void main() {
    vA = aA;
    vec4 mvPosition = viewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const RIB_FS = SHADE_PARS_FRAGMENT + `
  uniform vec3 uColor; uniform float uAmt; varying float vA;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(uColor, vA * uAmt);
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
  }`;

// Billboards occupy actual world positions. Their depth, occlusion and parallax remain
// coherent while the player turns; no full-screen sheet or screen-space wind stripes.
const DUST_VS = `
  attribute vec4 aSeed; uniform float uPhase, uAmt, uWarn;
  uniform vec3 uDir; varying vec2 vUv; varying float vAl, vSeed;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv; vSeed = aSeed.w;
    float speed = 0.35 + fract(aSeed.w * 9.7) * 0.9;
    vec3 p = aSeed.xyz * vec3(72.0, 23.0, 72.0) + uDir * uPhase * speed;
    p.x += sin(uPhase * 0.11 + aSeed.w * 43.0) * 2.2;
    p.z += cos(uPhase * 0.08 + aSeed.w * 21.0) * 2.7;
    vec3 r = mod(p - cameraPosition + vec3(36.0, 11.5, 36.0), vec3(72.0, 23.0, 72.0)) - vec3(36.0, 11.5, 36.0);
    float distanceFade = smoothstep(3.5, 8.0, length(r)) * (1.0 - smoothstep(25.0, 35.0, length(r)));
    float altitudeFade = 1.0 - smoothstep(6.0, 10.5, abs(r.y));
    float warning = uWarn * smoothstep(-4.0, 20.0, -dot(r, uDir));
    vAl = distanceFade * altitudeFade * (uAmt + warning * 0.7);
    vec4 mvPosition = viewMatrix * vec4(cameraPosition + r, 1.0);
    float size = 3.2 + fract(aSeed.w * 17.3) * 5.3;
    mvPosition.xy += position.xy * vec2(size * 1.7, size);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const DUST_FS = SHADE_PARS_FRAGMENT + `
  uniform vec3 uColor; uniform float uPhase; varying vec2 vUv; varying float vAl, vSeed;
  #include <fog_pars_fragment>
  float dh(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
  float dn(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(dh(i),dh(i+vec2(1,0)),f.x),mix(dh(i+vec2(0,1)),dh(i+vec2(1,1)),f.x),f.y); }
  void main() {
    vec2 q=vUv*2.0-1.0;
    float edge=1.0-smoothstep(0.3,1.0,length(q));
    vec2 uvn=vUv*3.8+vec2(vSeed*37.0,uPhase*0.035);
    float n=dn(uvn)*0.65+dn(uvn*2.3-vec2(uPhase*0.021,0.0))*0.35;
    float a=edge*smoothstep(0.18,0.78,n)*vAl*0.38;
    if(a<0.002)discard;
    gl_FragColor=vec4(uColor*(0.86+n*0.17),min(a,0.30));
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
  }`;
const GRAIN_VS = `
  attribute vec4 aSeed; uniform float uPhase, uAmt, uPx; uniform vec3 uDir;
  varying float vAl;
  #include <fog_pars_vertex>
  void main(){
    float speed=0.6+fract(aSeed.w*23.7)*0.8;
    vec3 p=aSeed.xyz*vec3(30.0,12.0,30.0)+uDir*uPhase*speed;
    p.y+=sin(uPhase*0.23+aSeed.w*31.0)*0.55;
    vec3 r=mod(p-cameraPosition+vec3(15.0,6.0,15.0),vec3(30.0,12.0,30.0))-vec3(15.0,6.0,15.0);
    vAl=uAmt*smoothstep(0.8,2.2,length(r))*(1.0-smoothstep(10.0,15.0,length(r)));
    vec4 mvPosition=viewMatrix*vec4(cameraPosition+r,1.0);
    gl_Position=projectionMatrix*mvPosition;
    gl_PointSize=clamp((0.012+aSeed.w*0.012)*uPx/max(0.5,-mvPosition.z),1.0,2.6);
    #include <fog_vertex>
  }`;
const GRAIN_FS = SHADE_PARS_FRAGMENT + `
  varying float vAl; uniform vec3 uColor;
  #include <fog_pars_fragment>
  void main(){ float a=(1.0-smoothstep(0.0,0.5,length(gl_PointCoord-0.5)))*vAl*0.34; if(a<0.003)discard;
    gl_FragColor=vec4(uColor,a);
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
  }`;

const SPL_VS = `
  attribute float aAge; varying float vAge; uniform float uPx;
  #include <fog_pars_vertex>
  void main() {
    vAge = aAge;
    vec4 mvPosition = viewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(0.34 * uPx / -mvPosition.z, 1.0, 40.0);
    #include <fog_vertex>
  }`;
const SPL_FS = SHADE_PARS_FRAGMENT + `
  uniform float uAmt; varying float vAge;
  #include <fog_pars_fragment>
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(0.22, 0.0, abs(d - vAge)) * (1.0 - vAge) * uAmt * step(0.0, vAge);
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.78, 0.8, 0.82, a * 0.55);
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${SHADE_FRAGMENT}
  }`;

function fogMat(extra, vs, fs, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, extra]),
    vertexShader: vs, fragmentShader: fs, fog: true, transparent: true, depthWrite: false, ...opts,
  });
}

export function createWeather(G) {
  const wind = { x: 1, z: 0, strength: 0.25, deg: 250 };
  let dust = 0, storm = 0, rain = 0, tier = G.quality ? G.quality.tier : 'medium';
  const tw = { dust: null, storm: null, rain: null };
  const sh = G.shade.uFirasa;
  let time = 0, gPhase = 0, rPhase = 0, sPhase = 0;
  const gust = { phase: 0, t: 0, warn: 0, dur: 0, strength: 1, id: 0, surge: 0, warnAmt: 0 };

  // ---- streak systems (grains / rain): LineSegments in a camera-centred wrapping box ----
  function streaks(n, box, color, alpha, len, spread) {
    const seed = new Float32Array(n * 8), end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = G.vrng.next(), b = G.vrng.next(), c = G.vrng.next(), d = (i + 0.5) / n;
      for (let v = 0; v < 2; v++) { const o = (i * 2 + v) * 4; seed[o] = a; seed[o + 1] = b; seed[o + 2] = c; seed[o + 3] = d; end[i * 2 + v] = v; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setDrawRange(0, 0);
    const m = fogMat({ uPhase: { value: 0 }, uAmt: { value: 0 }, uLen: { value: len }, uBox: { value: box }, uSpread: { value: spread },
      uDir: { value: new THREE.Vector3(1, 0, 0) }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uFirasa: sh }, STREAK_VS, STREAK_FS);
    const mesh = new THREE.LineSegments(g, m);
    mesh.frustumCulled = false; mesh.renderOrder = 50; mesh.visible = false;
    G.scene.add(mesh);
    return { mesh, m, g };
  }
  const grainGeo = new THREE.BufferGeometry();
  const grainSeeds = new Float32Array(GRAINS.high * 4);
  for (let i=0;i<grainSeeds.length;i++) grainSeeds[i]=G.vrng.next();
  grainGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(GRAINS.high*3),3));
  grainGeo.setAttribute('aSeed',new THREE.BufferAttribute(grainSeeds,4));
  const grainMat=fogMat({uPhase:{value:0},uAmt:{value:0},uPx:{value:800},uDir:{value:new THREE.Vector3(1,0,0)},uColor:{value:new THREE.Color(0xc9ae83)},uFirasa:sh},GRAIN_VS,GRAIN_FS);
  const grainMesh=new THREE.Points(grainGeo,grainMat); grainMesh.frustumCulled=false; grainMesh.visible=false; grainMesh.renderOrder=50; G.scene.add(grainMesh);
  const grains={mesh:grainMesh,m:grainMat,g:grainGeo};
  const rainS = streaks(RAIN.high, 30, 0xc4ccd4, 0.38, 0.75, 0.55);

  // ---- ground streamers: dynamic ribbons following the dune surface ----
  const MR = RIBBONS.high;
  const rPos = new Float32Array(MR * K * 2 * 3), rA = new Float32Array(MR * K * 2);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage));
  rg.setAttribute('aA', new THREE.BufferAttribute(rA, 1));
  const idx = [];
  for (let r = 0; r < MR; r++) for (let j = 0; j < K - 1; j++) { const a = (r * K + j) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  rg.setIndex(idx); rg.setDrawRange(0, 0);
  const ribMat = fogMat({ uColor: { value: new THREE.Color(0xe2c690) }, uAmt: { value: 1 }, uFirasa: sh }, RIB_VS, RIB_FS, { side: THREE.DoubleSide });
  const ribbons = new THREE.Mesh(rg, ribMat);
  ribbons.frustumCulled = false; ribbons.renderOrder = 50; ribbons.visible = false;
  G.scene.add(ribbons);
  const rb = { x: new Float32Array(MR), z: new Float32Array(MR), ph: new Float32Array(MR), v: new Float32Array(MR), h: new Float32Array(MR) };
  for (let r = 0; r < MR; r++) {
    for (let j = 0; j < K; j++) { const a = Math.sin(Math.PI * j / (K - 1)); rA[(r * K + j) * 2] = a * 0.14; rA[(r * K + j) * 2 + 1] = 0; }
    rb.v[r] = 0.45 + G.vrng.next() * 1.1; rb.ph[r] = G.vrng.next() * 6.28; rb.h[r] = 0.12 + G.vrng.next() * 0.14;
    rb.x[r] = rb.z[r] = 1e5;   // respawn on first update
  }

  // ---- depth-separated dust banks (one instanced draw, bounded mobile overdraw) ----
  const dustCounts={low:18,medium:30,high:44};
  const dg=new THREE.PlaneGeometry(1,1);
  const ds=new Float32Array(dustCounts.high*4);
  for(let i=0;i<ds.length;i++) ds[i]=G.vrng.next();
  dg.setAttribute('aSeed',new THREE.InstancedBufferAttribute(ds,4));
  const dustMat=fogMat({uPhase:{value:0},uAmt:{value:0},uWarn:{value:0},uDir:{value:new THREE.Vector3(1,0,0)},uColor:{value:new THREE.Color(0xbba582)},uFirasa:sh},DUST_VS,DUST_FS);
  const dustBanks=new THREE.InstancedMesh(dg,dustMat,dustCounts.high);
  dustBanks.name='world-dust-banks'; dustBanks.frustumCulled=false; dustBanks.renderOrder=49; dustBanks.visible=false;
  G.scene.add(dustBanks);

  // ---- rain splashes ----
  const NS = SPLASH.high;
  const spPos = new Float32Array(NS * 3), spAge = new Float32Array(NS).fill(-1);
  const spg = new THREE.BufferGeometry();
  spg.setAttribute('position', new THREE.BufferAttribute(spPos, 3).setUsage(THREE.DynamicDrawUsage));
  spg.setAttribute('aAge', new THREE.BufferAttribute(spAge, 1).setUsage(THREE.DynamicDrawUsage));
  spg.setDrawRange(0, 0);
  const splMat = fogMat({ uPx: { value: 800 }, uAmt: { value: 0 }, uFirasa: sh }, SPL_VS, SPL_FS);
  const splash = new THREE.Points(spg, splMat);
  splash.frustumCulled = false; splash.renderOrder = 50; splash.visible = false;
  G.scene.add(splash);
  const spLife = new Float32Array(NS);
  for (let i = 0; i < NS; i++) { spAge[i] = G.vrng.next(); spLife[i] = 0.35 + G.vrng.next() * 0.3; spPos[i * 3 + 1] = -1e4; }

  function ramp(key, get, set, to, duration) {
    if (!duration) { set(to); tw[key] = null; return; }
    tw[key] = { from: get(), to, t: 0, dur: duration, set };
  }
  function visibility() {
    let v = Infinity;
    if (storm > 0.01) v = Math.max(18,600/(1+storm*storm*24)/(1+gust.surge*0.65));
    if (dust > 0.35) v = Math.min(v, lerp(500, 90, (dust - 0.35) / 0.65));
    if (rain > 0.3) v = Math.min(v, lerp(500, 220, (rain - 0.3) / 0.7));
    return v;
  }

  const _c = new THREE.Vector3();
  function updateRibbons(dt, amt) {
    const n = amt < 0.01 ? 0 : Math.max(1, Math.ceil(RIBBONS[tier] * Math.min(1, amt)));
    ribbons.visible = n > 0; rg.setDrawRange(0, n * (K - 1) * 6);
    if (!n) return;
    ribMat.uniforms.uAmt.value = Math.min(1, 0.45 + amt);
    const cam = G.camera.position, T = G.world.terrain, R = 26;
    const wx = wind.x, wz = wind.z, px = -wz, pz = wx;
    const spd = (2 + 9 * wind.strength) * (1 + storm * 1.8 + gust.surge * 1.5);
    for (let r = 0; r < n; r++) {
      rb.x[r] += wx * spd * rb.v[r] * dt; rb.z[r] += wz * spd * rb.v[r] * dt;
      const dx = rb.x[r] - cam.x, dz = rb.z[r] - cam.z;
      if (dx * wx + dz * wz > R || dx * dx + dz * dz > R * R * 1.6) {
        const l = (G.vrng.next() * 2 - 1) * R;
        rb.x[r] = cam.x - wx * R * (0.6 + 0.4 * G.vrng.next()) + px * l;
        rb.z[r] = cam.z - wz * R * (0.6 + 0.4 * G.vrng.next()) + pz * l;
      }
      const seg = 0.55 + 0.25 * rb.v[r];
      for (let j = 0; j < K; j++) {
        const w = Math.sin(rb.ph[r] + time * 1.3 * rb.v[r] + j * 0.6) * (0.25 + 0.5 * j / K);
        const x = rb.x[r] - wx * j * seg + px * w, z = rb.z[r] - wz * j * seg + pz * w;
        const y = T.heightAt(x, z) + 0.03, o = (r * K + j) * 6, hh = rb.h[r] * Math.sin(Math.PI * (j + 0.5) / K);
        rPos[o] = x + px * 0.06; rPos[o + 1] = y; rPos[o + 2] = z + pz * 0.06;
        rPos[o + 3] = x - px * 0.06; rPos[o + 4] = y + hh; rPos[o + 5] = z - pz * 0.06;
      }
    }
    rg.attributes.position.needsUpdate = true;
  }

  function updateSplashes(dt, amt) {
    const n = amt < 0.01 ? 0 : Math.ceil(SPLASH[tier] * Math.min(1, amt));
    splash.visible = n > 0; spg.setDrawRange(0, n);
    if (!n) return;
    splMat.uniforms.uAmt.value = 1;
    const cam = G.camera.position, T = G.world.terrain;
    for (let i = 0; i < n; i++) {
      spAge[i] += dt / spLife[i];
      if (spAge[i] >= 1) {
        spAge[i] = 0; spLife[i] = 0.35 + G.vrng.next() * 0.3;
        const a = G.vrng.next() * 6.283, d = 1.5 + Math.sqrt(G.vrng.next()) * 13;
        const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
        spPos[i * 3] = x; spPos[i * 3 + 1] = T.heightAt(x, z) + 0.04; spPos[i * 3 + 2] = z;
      }
    }
    spg.attributes.position.needsUpdate = true; spg.attributes.aAge.needsUpdate = true;
    splMat.uniforms.uPx.value = G.renderer.domElement.height / (2 * Math.tan(G.camera.fov * DEG * 0.5));
  }

  const api = {
    wind,
    get dust() { return dust; }, get stormLevel() { return storm; }, get rainLevel() { return rain; },
    get gusting() { return gust.phase === 2; },
    get visibility() { return visibility(); },
    /** deg = compass bearing the wind blows TOWARD */
    setWind(deg, strength) { wind.deg = deg; wind.strength = strength; wind.x = Math.sin(deg * DEG); wind.z = -Math.cos(deg * DEG); },
    setDust(a, { duration = 0 } = {}) { ramp('dust', () => dust, v => { dust = v; }, a, duration); },
    storm(level, { duration = 0 } = {}) { ramp('storm', () => storm, v => { storm = v; }, level, duration); },
    rain(level, { duration = 0 } = {}) { ramp('rain', () => rain, v => { rain = v; }, level, duration); },
    /** scripted gust: warn (visual from the windward side) → impact → resolves when it has passed */
    gust({ warn = 1.5, strength = 1, duration = 1.2 } = {}) {
      const f = G.state.fastText;
      gust.id++; const id = gust.id;
      gust.phase = 1; gust.t = 0; gust.warn = f ? 0.05 : warn; gust.dur = f ? 0.05 : duration; gust.strength = strength;
      G.events.emit('weather:gustWarn', { in: warn, dir: { x: wind.x, z: wind.z } });
      return G.scope.until(() => gust.id !== id || gust.phase === 0, { timeout: warn + duration + 5 });
    },
    onBeatEnd() { gust.phase = 0; gust.id++; },
    onLevelUnload() { gust.phase = 0; gust.id++; dust = storm = rain = 0; tw.dust = tw.storm = tw.rain = null; },
    setQuality(t) { if (GRAINS[t]) tier = t; },
    debug() { return { dustCards: dustBanks.visible ? dustBanks.count : 0, grains: grains.mesh.visible ? grains.g.drawRange.count : 0, screenSheet: false, storm, dust }; },
    update(dt) {
      time += dt;
      for (const k in tw) { const t = tw[k]; if (!t) continue; t.t += dt; const a = Math.min(1, t.t / t.dur); t.set(t.from + (t.to - t.from) * a); if (a >= 1) tw[k] = null; }
      // gust state machine
      if (gust.phase === 1) {
        gust.t += dt; gust.warnAmt = Math.min(1, gust.t / gust.warn);
        if (gust.t >= gust.warn) { gust.phase = 2; gust.t = 0; gust.warnAmt = 0; G.events.emit('weather:gust', { strength: gust.strength, duration: gust.dur }); }
      } else if (gust.phase === 2) {
        gust.t += dt;
        const u = gust.t / gust.dur;
        gust.surge = gust.strength * smoothstep(0, 0.12, u) * (1 - smoothstep(0.45, 1, u));
        if (gust.t >= gust.dur) gust.phase = 0;
      } else { gust.warnAmt = 0; gust.surge += (0 - gust.surge) * Math.min(1, dt * 4); if (gust.surge < 0.005) gust.surge = 0; }
      const surge = gust.surge, warnA = gust.warnAmt;

      const vis = visibility();
      G.world.sky.setVisibility(isFinite(vis) ? vis : null);

      const cam = G.camera, e = cam.matrixWorld.elements;
      const sx = wind.x * e[0] + wind.z * e[2], sy = wind.x * e[4] + wind.z * e[6];
      const sl = Math.hypot(sx, sy) || 1;
      const ws = 3 + 14 * wind.strength;

      // Small grains add scale, never long identical screen-facing streaks.
      const gAmt = Math.max(storm, dust * 0.35, surge * 0.8, warnA * 0.2);
      grains.mesh.visible = gAmt > 0.01; grains.g.setDrawRange(0, Math.ceil(GRAINS[tier]*Math.min(1,gAmt)));
      if (grains.mesh.visible) {
        gPhase += dt * (4 + 8 * storm + 11 * surge) * (0.6 + wind.strength);
        const u = grains.m.uniforms;
        u.uPhase.value = gPhase; u.uAmt.value = Math.min(1,gAmt);
        u.uDir.value.set(wind.x, -0.015, wind.z);
        u.uPx.value=G.renderer.domElement.height/(2*Math.tan(G.camera.fov*DEG*0.5));
      }
      // rain
      const rn = rain > 0.01;
      rainS.mesh.visible = rn; rainS.g.setDrawRange(0, rn ? RAIN[tier] * 2 : 0);
      if (rn) {
        rPhase += dt * 13;
        const u = rainS.m.uniforms;
        u.uPhase.value = rPhase; u.uAmt.value = Math.min(1, rain);
        u.uDir.value.set(wind.x * wind.strength * 3, -9, wind.z * wind.strength * 3).multiplyScalar(1 / 9);
        u.uDir.value.y = -1; u.uLen.value = 0.45 + 0.4 * rain; u.uAlpha.value = 0.25 + 0.25 * rain;
      }
      updateSplashes(dt, rain);
      updateRibbons(dt, Math.max(dust, storm, surge * 0.8, warnA * 0.3));

      const bankAmt=Math.max(storm*0.9,dust*0.24,surge*0.85);
      dustBanks.visible=bankAmt>0.01 || warnA>0.01;
      dustBanks.count=dustCounts[tier];
      if(dustBanks.visible){
        sPhase+=dt*(2.0+6.0*storm+8.0*surge)*(0.5+wind.strength);
        const u=dustMat.uniforms;
        u.uPhase.value=sPhase;u.uAmt.value=bankAmt;u.uWarn.value=warnA;
        u.uDir.value.set(wind.x,0,wind.z);
      }
    },
  };
  G.events.on('quality:changed',e=>{if(e?.tier&&GRAINS[e.tier])tier=e.tier;});
  void _c; void clamp;
  return api;
}
