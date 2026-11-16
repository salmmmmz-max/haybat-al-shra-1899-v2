# هيبة الصحراء ١٨٩٩ — Architecture & module contract (v2)

Read `docs/DESIGN.md` (v2) first. This file is the **binding contract** every module is coded against.
The kernel code in `game/src/core`, `systems/director.js`, `world/level.js` is real and final — read it when in doubt; it wins over prose.
Reviewer findings for your module live in `docs/arch-findings/<module>.md`: **advisory** — apply what is consistent with this contract.
Need something that is not here? Add it to your own module, document it in the file's JSDoc header, and list it in your hand-back. Never reach into another module's internals; never change another module's exported shape.

## 0. Repo map and ownership

```
app/public/index.html            page shell (kernel)            app/public/game.js|game.css  BUILT (never edit)
app/public/assets/               built by game/tools/assets.mjs (models/*.glb + *.lod1.bin, tex, audio, manifest.json)
app/src/logic.js + app/tests/    platform journey ledger (pure, no imports)
game/src/main.js                 boot (kernel)
game/src/core/                   KERNEL: game, loop, scope, events, input, assets, save, quality, stage, shade, lod, math, noise, rng, strings, net
game/src/world/                  terrain · sky · weather · props · decals · level (kernel)
game/src/actors/                 humanoid · player · camera · npc · quadruped · camels · caravan · wolves
game/src/systems/                director (kernel) · interact · firasa · steady · survival · objectives · stars · tracks
game/src/ui/                     ui.js (root) + views, styles.css, strings.ui.ar.js
game/src/audio/audio.js
game/src/chapters/               ch1.js … ch5.js, levels.js, index.js
game/src/content/story.ar.js     screenplay data (STORY.names/cards/talk/text) — index in docs/SCRIPT.md
game/src/dev/                    overlay, testapi, bot
game/harness/<name>.js           one demo scene per module (dev only)        game/tests/unit/*.test.js   node:test
game/tools/                      build.mjs · serve.mjs · shot.cjs · render-glb.cjs · assets.mjs
```
Every file has ONE owner (the task brief names yours). You may read anything; you may write only your files.

Dev loop (run from `game/`):
```
node tools/build.mjs --dev --harness                       # bundle game + harness (≈0.3 s)
node tools/shot.cjs "/harness/harness.html?m=<name>&test=1" out.png --until "window.__harness && (window.__harness.ready || window.__harness.error)" \
     --eval "await __hs.step(120)" --print "window.__harness.error" --print "__hs.state()" --print "__hs.errors"
node --test tests/unit/                                     # pure-logic unit tests
```
`shot.cjs` exits 1 on any console error. Screenshots are real WebGL (software): look at them (Read the PNG) before claiming a visual result. `?test=1` = no RAF, time advances only through `__hs.step(n)`.

## 1. Conventions (binding)

- **Units** metres, seconds, radians. **Axes** +X east, +Z south, +Y up; north is −Z.
- **Yaw**: `rotation.y = yaw`; yaw 0 faces **+Z** (all models are normalised to face +Z). Forward `(sin yaw, 0, cos yaw)`; right `(−cos yaw, 0, sin yaw)`. Bearing° = `(180 − yaw°) mod 360`. Use `core/math.js`; never re-derive.
- **Ground**: an actor's y is `terrain.heightAt(x, z)` (+ its own offset). Nothing else decides height.
- **Time**: every `update(dt)` gets the clamped variable frame `dt` (1/240…1/20 s). Motion must be dt-correct (`damp`, `turnToward`). Durations are **sim time** (`G.time.now`). Never use `Date.now()`, `performance.now()`, `setTimeout`, `setInterval` or `requestAnimationFrame` in gameplay code (CSS transitions in UI are fine). Tests tick with dt = 1/60.
- **Awaitables**: every gameplay promise is created through the current scope (`G.scope.task / sleep / until / tween / wrap`, §3) so it settles on sim time and rejects with `BeatAbort` when the beat is cancelled. Scope promises have `.cancel()`.
- **No allocation in per-frame paths**: module-level scratch objects, pools, ring buffers. Swarms are ONE `InstancedMesh`/`Points`.
- **Module shape**: `export function createX(G) { … return api }`. Optional lifecycle on `api`: `update(dt)`, `lateUpdate(dt)`, `onBeatEnd()` (release beat-scoped internal state; called at every beat end/abort before the next `enter`), `onLevelUnload()`, `setQuality(tier)`, `runWhenPaused = true`.
- **Events**: `G.events.on(name, fn) → off` / `once` / `emit`. Names `domain:verb` (§6). Gameplay talks to UI/audio only through events and documented APIs.
- **Strings**: no literal Arabic in logic. Story text: `G.t('c1_wake.obj')`, `G.story.talk[id]`; UI text: `ui/strings.ui.ar.js`. Missing keys return `⟦key⟧` and log once.
- **Randomness**: gameplay `G.rng` (seeded per level); cosmetics `G.vrng`. Never `Math.random()` in gameplay.
- **Graceful assets**: `G.assets.instance(id)` may return `null`; every consumer falls back to a procedural stand-in and keeps working.
- **Code style**: ES2020 modules, three r170 (`import * as THREE from 'three'`, addons `three/addons/…`), JSDoc on exports, 2 spaces, semicolons, single quotes. No new npm dependencies.

### Rendering rules (binding — they prevent the classic mobile failures)
- **Colour**: working space linear-sRGB; `renderer.toneMapping = NoToneMapping`; lights are tuned so lit albedo stays ≤ 1. Colour textures `SRGBColorSpace`, data textures `NoColorSpace`. Custom shaders are `THREE.ShaderMaterial` (never Raw); fragment `main()` ends with `#include <tonemapping_fragment>` `#include <colorspace_fragment>` then fog and the shade chunk (below). No `precision` statements. Hash noise from integers or one shared noise texture (no `sin`-hash on large coordinates).
- **Fog — one model**: `scene.fog = THREE.FogExp2` is created once by `sky.js` and never replaced. Sky is the only writer of its colour/density. Custom materials use three's fog (`fog: true` + `THREE.UniformsLib.fog` + the `<fog_*>` chunks) — no private fog maths. Weather never touches fog: it calls `sky.setVisibility(metres | null)`.
- **Lights — fixed set**: exactly four lights exist for the whole session: `sky.sunLight`, `sky.hemi`, and two pooled `PointLight`s owned by `props.js` (intensity 0 when unused). Never add, remove or hide a light (it recompiles every program = a visible freeze). **No shadow maps on any tier**; blob shadows only.
- **الفراسة desaturation**: one shared uniform `G.shade.uFirasa` (0..1). Built-in materials get it through `G.shade.patch(material)` (the kernel patches every GLB material); custom shaders include `SHADE_PARS_FRAGMENT` / `SHADE_FRAGMENT` from `core/shade.js` as the LAST step. Clue glows are exempt.
- **Bounds**: `frustumCulled = false` on terrain, sky dome, stars, sun, weather layers, fire/ember systems, decal ring buffers, blob shadows, glows. Static `InstancedMesh`: `computeBoundingSphere()` once after filling. Skinned meshes: frustum-culled with an explicit `boundingSphere` set once by the wrapper (centre `(0, 0.5h, 0)`, radius `1.25h` humanoids; `0.75·max(size) + 0.5` quadrupeds, in mesh-local units).
- **Render order** (nobody else sets `renderOrder`): 0 opaque actors/props/scatter · 10 terrain · 20 sky dome (depthWrite off, drawn at the far plane) · 30 stars/sun · 40 decals & blob shadows (polygonOffset, depthWrite off) · 50 world particles (dust, embers, rain; depthWrite off) · 60 glows/clue markers (additive).
- **Warm-up**: everything a level can show is created inside `level.load` (counts/alpha 0 if unused) — never lazily on first use. The kernel then runs `renderer.compileAsync(scene, camera)` before the fade-in. After `level:loaded`, do not create new material types or change `defines`.
- **GPU ownership**: `G.assets` owns template geometries, materials and textures for the session — never `dispose()` anything reachable from `G.assets.*`. A module disposes only what it created itself (own clones, own render targets).
- **LOD**: models above 3k triangles ship a 20 % index buffer (`G.assets.lodGeometry(id)`); wrappers register with `G.lod.add(...)` and swap `mesh.geometry` when told. Budgets in §11.
- **Quality tiers** `low | medium | high` (`G.quality.tier`, `G.quality.pick(lo, mid, hi)`, event `quality:changed`). iOS → medium; Android → low when `deviceMemory ≤ 3` else medium; desktop → high.

### Stage (forced landscape) and touch
- The page has one `#stage` element holding `<canvas id="game">` and `#ui`. When the viewport is portrait the kernel sizes the stage as landscape and rotates it 90° (class `rot`): the player holds the phone sideways. **All layout is authored for landscape only.**
- Never read `window.innerWidth/innerHeight` or raw `clientX/clientY` deltas in UI code. Use `G.stage.w`, `G.stage.h`, `G.stage.toLocal(clientX, clientY, out) → {x, y}` (stage pixels) and `G.stage.delta(dx, dy, out)`. Position UI with `position:absolute` inside `#ui` (never `fixed`, never `vw/vh`); CSS variables on `#stage`: `--sw`, `--sh` (px), `--sa-t/-r/-b/-l` (safe-area insets already mapped to the stage's orientation).
- Thumb budget (DESIGN §3): left thumb moves; right thumb looks and uses ONE of {context, eye}. A touch that starts on a hold button keeps steering the camera after it moves 12 px (0.6× sensitivity). No beat needs the eye and the context button together.
- Touch hygiene: pointer events with per-pointer ids; `touch-action:none`; no scroll/zoom/long-press callouts; tap targets ≥ 48 px and ≥ 24 px + safe-area from every edge; haptics only via `navigator.vibrate` when it exists (Android).

## 2. The context object `G`

```
G.canvas, G.renderer, G.scene, G.camera (PerspectiveCamera, vertical FOV 55°)
G.events, G.input, G.assets, G.audio, G.save, G.net, G.quality, G.loop, G.stage, G.shade, G.lod
G.t(key, vars), G.story (STORY), G.rng, G.vrng
G.time { now, dt, frame, scale }        scale 0 = paused: sim time, scopes and gameplay systems stop; UI/audio keep running
G.rootScope, G.levelScope, G.scope      scope.js — G.scope is the current beat scope while a beat runs
G.state { mode, chapter, beat, flags, fastText }   mode: 'boot'|'title'|'loading'|'play'|'cine'|'dialogue'|'end'
G.setMode(mode) (director/kernel only) · G.setPaused(bool)
G.world { terrain, sky, weather, props, decals, level }
G.actors { player, cam, npcs, camels, caravan, wolves }
G.sys { interact, firasa, steady, survival, objectives, stars, tracks, director }
G.ui { hud, touch, dialogue, menus, cards, loading }
G.dev { overlay, test }                  only with ?dev=1 / ?test=1
```
**Modes**: only the director (and boot) writes `G.state.mode`. `play`: everything runs. `dialogue` / `cine`: input locked by the director (except `pause`/`skip`), the player does not move, thirst does not drain, hint clocks freeze, no gust/lunge may start. Pause is orthogonal (`G.time.scale`).
`G.state.fastText` (tests): dialogue, cards, cinematics and holds resolve in ≤ 0.1 s; `steady`/`stars` need no aiming.

**Update order**: `input.sample → scopes → director → player → npcs → camels → caravan → wolves → interact → firasa → steady → survival → objectives → stars → tracks → weather → sky → props → decals → terrain → cam.lateUpdate → lod → audio → ui`, then one `renderer.render`.

## 3. Kernel APIs (`core/`) — provided, do not re-implement

```js
// math.js
clamp, clamp01, lerp, invLerp, remap, smoothstep, easeInOut, easeOut, easeIn, damp(cur, target, lambda, dt), dampAngle,
angleDelta(from, to), wrapPi, turnToward(cur, target, maxStep), fwd(yaw, out), right(yaw, out), yawOf(dx, dz), dist, dist2,
bearingDeg(yaw), yawOfBearing(deg), pointOf(target) /* Object3D | {x,z} | fn → shared {x,y,z} */, TAU, DEG
// noise.js / rng.js / events.js
makeNoise(seed) → { n2, fbm, ridge }  ·  makeRng(seed) → { next, range, int, pick, chance, fork }  ·  createEvents()
// scope.js — sim-time awaitables (all reject with BeatAbort on abort; all have .cancel())
G.scope.sleep(s) · until(fn, {timeout}) → Promise<bool> · task(dt => value|undefined) · tween(s, k => …, ease?) · wrap(promise)
G.scope.onEnd(fn) · own(handle /* remove|dispose|stop|fn */) · child(label) → scope
// input.js — gameplay reads, devices write
G.input.move {x, y}  (−1..1, y forward, length ≤ 1)   G.input.moveMag (0..1; keyboard = 0.6, with 'run' held = 1)
G.input.look {x, y}  (radians this tick; x: yaw right +, y: pitch up +)
G.input.held(a) / pressed(a) / released(a)      a ∈ 'interact' | 'firasa' | 'run' | 'drink' | 'pause' | 'skip'
G.input.device ('touch'|'keyboard'|'gamepad') · lock(tag) / unlock(tag) / locked
G.input.setMove(x, y, source='ui') · addLook(dx, dy) · setHeld(action, on, source='ui') · tap(action) · feed({move, look, hold:[…], press:[…]})
// assets.js
await G.assets.loadManifest() · await G.assets.loadGroup(name, onProgress) · groupLoaded(name)
G.assets.instance(id) → Object3D | null     // static: on y=0, centred, facing +Z, real size; humanoid: SkeletonUtils clone (userData.animations)
G.assets.model(id) → { scene, animations, meta } | null (template) · meta(id) → manifest entry | null
G.assets.lodGeometry(id) → BufferGeometry | null   // same vertex buffers, 20 % index (models > 3k tris)
G.assets.texture(id) → Texture | null · audioData(id) → ArrayBuffer | null (encoded; audio.js decodes) · audioMeta(id) · image(id) → url | null
// save.js
G.save.data { v, id, chapter, beat, flags, cp, settings, stats, done, unlocked } · commit() · reset() · settings · hasProgress
// quality.js
G.quality.tier · scale · isMobile · pick(lo, mid, hi) · set(tier|'auto')
// stage.js
G.stage.w, .h (stage px, always landscape) · .rotated · toLocal(cx, cy, out) · delta(dx, dy, out)        event 'resize' {w, h, rotated}
// shade.js
G.shade.uFirasa ({value}) · G.shade.patch(material) → material · SHADE_PARS_FRAGMENT, SHADE_FRAGMENT (GLSL strings; add uFirasa: G.shade.uFirasa to your uniforms)
// lod.js
G.lod.add({ at: Object3D | {x,z}, near: metres, set(level /* 0|1 */) , pinned?: bool }) → { remove(), pin(bool) }
// loop.js
G.loop.add(system, order) · tick(dt) · start() · stop()
```
Manifest entries (written by `tools/assets.mjs`): humanoid `{url, kind:'humanoid', height, clips:[…], bones:[…], tris, lod1?}`; static `{url, kind:'prop'|'quadruped', scale, yaw, offset, size:[x,y,z] metres, spec?, tris, lod1?}`.
Models: `dhari mani misfer moudi fuhaid jaber` (humanoid) · `camel wolf` (quadruped, static meshes) · `camelsit tent well campfire acacia waterskins` (props).
Clips: dhari `walk idle run sit kneel drink torch swing call steady pull` · mani `walk idle talk sit lie drink` · misfer `walk idle talk run` · jaber `walk idle talk aim lie sit` · moudi `walk idle` · fuhaid `walk idle run sit wave`. All in place (no root motion).
Meshy skeleton (all six): `Hips, Spine02, Spine01, Spine, neck, Head, head_end, headfront, Left/Right{Shoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot, ToeBase}` — 24 bones, no fingers.

## 4. World

### terrain.js — `createTerrain(G)`
```js
terrain.build(def)                  // def = LevelDef.terrain + seed; (re)bakes height fields in place; ≤ 600 ms on a phone
terrain.heightAt(x, z) → y          // piecewise-LINEAR on the 2 m lattice (each cell split along (i,j)→(i+1,j+1)) — the SAME triangles the near LOD draws
terrain.normalAt(x, z, out) · slopeAt(x, z) → 0..1 · softAt(x, z) → 0..1 · surfaceAt(x, z) → 'sand'|'soft'|'gravel'
terrain.size (= 1024, the gameplay field) · terrain.exactRadius (≥ 64 m around the camera: rendered surface === heightAt)
terrain.update(dt)                  // follows G.camera
```
`def`: `{ seed, duneAmp (m), duneScale (m), windDeg, flats:[{x,z,r,fall,y?}], soft:[{x,z,r}], gravel:[{x,z,r}], ridges?:[{x1,z1,x2,z2,h,w}] }`.
Requirements: NEAR field 513² @ 2 m (±512 m) plus a FAR field 257² @ 32 m (±4 km) from the same generator, blended near the edge, so dunes run to the horizon and the surface is defined everywhere (soft/gravel only inside the near field). Dunes with clear crests and slip faces shaped by `windDeg`; flats are truly flat (camps, wells). One draw call: camera-following nested rings (2/4/8/16/32 m cells), ≤ 60k triangles, no cracks, no swimming. GPU heights via `texelFetch` on an R32F `NearestFilter` DataTexture, or CPU-written vertices on ring snap — never linear-filtered float textures. Normals/masks: one RGBA8 texture per field. Shader: warm lit side / cool shadow side, soft terminator, crest rim light, wind-aligned ripple normals fading with distance, sparkle, pale smooth soft-sand, darker speckled gravel, drifting cloud shadows; uses `G.world.sky.uniforms` by reference; three fog; shade chunk.

### sky.js — `createSky(G)`
```js
sky.setPreset(name, { duration = 0 }) → Promise     // 'dawn'|'morning'|'noon'|'storm'|'dusk'|'night'|'predawn'|'sunrise_rain'; uniforms lerp, sun slerps
sky.setVisibility(metres | null)                    // weather's request; fog density = max(preset, 1.98 / metres), colour blends to the murk colour
sky.uniforms   // shared BY REFERENCE: uSunDir, uSunColor, uAmbSky, uAmbGround, uHorizonColor, uZenithColor, uTime, uNight (0..1) — colours linear
sky.sunDir (Vector3) · sky.sunLight (DirectionalLight) · sky.hemi (HemisphereLight) · owns scene.fog and scene.background
sky.stars.setLST(hours, { duration = 0 }) → Promise // real sky at lat 20°N; always advances forward; drives the ch3 time-lapse
sky.stars.dir(id, out) → unit Vector3 (world)       // 'polaris','dubhe','merak','phecda','megrez','alioth','mizar','alkaid','canopus','sirius', …
sky.stars.asterism(id) → [[a, b], …]                // 'banat_nash' (the Dipper), 'pointer' (merak→dubhe→polaris)
sky.stars.highlight(id | null, amount)              // glow a star; asterism lines draw in progressively with amount
sky.sunBearing() → degrees · sky.update(dt)
```
≥ 60 named bright stars from RA/Dec (J2000) + ~1500 faint ones; twinkle; Suhail yellowish, Sirius white; visible when `uNight > 0`. Sun disc + halo. `storm` = yellow-brown murk with a wall on the windward horizon; `sunrise_rain` = low cloud deck on one side, bright east. `setLST(18.0)`: بنات نعش low NW, الجدي 19.5° up. `setLST(3.3)`: سهيل at az 154°, 7° up.

### weather.js — `createWeather(G)`
```js
weather.setWind(deg, strength 0..1) · weather.wind { x, z, strength }           // direction the wind blows TOWARD
weather.setDust(a, {duration}) · weather.storm(level 0..1, {duration}) · weather.rain(level 0..1, {duration})
weather.visibility → metres (Infinity when clear, ≈ 12 at storm 1)             // pushed to sky.setVisibility every tick
weather.gust({ warn = 1.5, strength = 1, duration = 1.2 }) → Promise            // scripted: emits 'weather:gustWarn' {in, dir} → 'weather:gust' {strength, duration}; resolves after the gust
weather.update(dt)
```
No free-running gust timer — chapters script every gust. Ground-hugging sand streamers, airborne dust, storm sheets (≤ 2 full-screen layers; the wall is fog colour, not overdraw), rain streaks + splashes: instanced/points, camera-relative, tier-scaled. Every cue has a visual twin (streaks + vignette on the windward side).

### props.js — `createProps(G)`
```js
props.spawn(modelId, { x, z, yaw=0, scale=1, y?, solid=true }) → Object3D     // GLB instance (LOD-registered) or stand-in; circle collider when solid
props.make(id: 'torch'|'rifle'|'staff'|'waterskin'|'bucket') → Object3D       // unplaced procedural item for actor.socket(...).add()
props.scatter(kind, { count, x, z, r, seed, avoid:[{x,z,r}] })                 // instanced: 'shrub' | 'grass' | 'rock' | 'pebble' | 'greenpatch'
props.cairn(x, z, {h=1.4}) · props.bones(x, z) · props.rockOutcrop(x, z, {r, h, seed}) · props.deadCamel(x, z, yaw)
props.fire(x, z, { size=1 }) → { setLit(b), lit, position, setBeacon(range) }  // flames + embers + smoke; uses the pooled lights; beacon = glow visible through murk
props.signalPile(x, z) → same handle (unlit)   ·   props.flame(parent: Object3D, { size=0.35 }) → { setLit(b), lit, remove() }   // torch flame
props.glow(at, { color, size }) → { set(a), remove() }                         // soft additive marker (firelight on haze, clue marker)
props.flock({ from, to, count=16, height=24, speed=15 }) → { pass() → Promise, dir {x,z}, remove() }   // ONE instanced ribbon of sandgrouse; pass() flies it once past the player
props.colliders → [{ x, z, r }] · props.clear()
```
Each tick the two pooled lights go to the two lit emitters nearest the camera (0.3 s cross-fade).

### decals.js — `createDecals(G)`
```js
decals.print(x, z, yaw, kind, { fresh=1 })        // 'hero'|'child'|'camel'|'wolf' — ring-buffered, instanced, hugs the terrain normal
decals.trail(points, kind, { fresh=1, spacing }) → { setVisible(b), setReveal(center|null, radius), remove() }   // authored line; setReveal shows only prints near a point (storm)
decals.blob(obj, radius) → { remove() }           // blob shadow following an actor (instanced)
decals.setFirasa(v)                               // fresh prints pulse gold with a dark rim, old ones stay dim
```
Fresh vs old must differ in SHAPE (crisp rim vs wind-rippled), not only brightness. Listens to `player:step` to print the hero's/camel's steps.

### level.js (kernel) — `await level.load(def) → L`, `level.unload()`
`LevelDef`: `{ id, seed, terrain:{…}, sky, lst?, wind:{deg,strength}, dust?, pois:{name:{x,z}}, props:[{model, at?, x?, z?, dx?, dz?, yaw?, scale?, solid?}], fires:[{id, at?, dx?, dz?, size?, lit?}], scatter:[{kind, count, at?|x,z, r, seed?, avoid?}], spawn:{at?|x,z, yaw}, bounds:{x,z,r ≤ 420} }`. Everything lies within 440 m of the origin.
`L = { def, poi(name) → {x,z}, bounds, fires:{id: handle}, own(handle), scope }`.

## 5. Actors

### humanoid.js — `createHumanoid(G, modelId, { scale, tint, name })` → actor
```js
actor.root · actor.pos (live Vector3) · actor.yaw · actor.height · actor.has(clip)
actor.place(x, z, yaw?) · actor.face(yaw, rate=8) · actor.faceTo(x, z, rate=8)
actor.play(clip, { fade=0.25, loop=true, speed=1 }) · actor.playOnce(clip, { fade=0.2, speed=1, hold=false }) → Promise
actor.locomotion(speed)                 // idle/walk/run blend by ground speed, feet synced
actor.overlay(clip | null, { mask='upper', fade=0.2 })   // upper-body clip over locomotion (carry a torch, aim, call while walking)
actor.socket(name) → Object3D           // 'handR'|'handL'|'back'|'head'|'hips' — world-unit scale, axes = actor axes in bind pose
actor.lookAt(target | null)             // head/neck turn toward a point (≤ 60°)
actor.setTint(hex|null) · setVisible(b) · update(dt) · dispose()
```
Logical clips: `idle walk run sit kneel drink torch swing call steady pull talk lie aim wave`. Missing clip → nearest fallback, never throw. Missing model → capsule stand-in. Sitting/lying need a root offset so the body rests on the ground/saddle (per-model constants). Registers LOD (near 18 m) and a blob shadow. Mixers at half rate beyond 40 m.

### player.js — `createPlayer(G)`
```js
player.actor · player.pos · player.yaw · player.speed · player.mode   // 'foot' | 'mounted' | 'scripted'
player.spawn(x, z, yaw) · teleport(x, z, yaw)
player.mount(camel) → Promise · player.dismount() → Promise · player.mounted   // scripted only (she kneels → he sits → she rises)
player.limit(tag, { speed?, speedMul?, run?: false }) → { remove() }           // stackable; firasa, storm, c5_walk use it
player.push(vx, vz) · player.knockdown(seconds, { slide?: {x, z} }) → Promise
player.equip(item | null, { lit=true }) · player.item                          // 'torch'|'rifle'|'staff' in hand (props.make + socket; torch gets props.flame)
player.swing() → Promise                 // brand swing (0.5 s raised); emits 'player:swing' {x, z, yaw}
player.setScripted(on) · player.moveTo(x, z, { speed, stop=0.3 }) → Promise
player.trail → [{x, z}] ring buffer of recent positions (followers walk it)
```
On foot: camera-relative; walk `2.0·min(1, moveMag/0.6)` m/s, run 5.0 m/s when `moveMag > 0.9` or `run` held (and no limit forbids it); uphill slows; collider push-out; soft boundary (`L.bounds`, emits `player:bounds`). Mounted: stick x steers (75°/s), y sets walk 2.4 / trot 5.5. No stamina. Emits `player:step {x, z, yaw, foot, surface, run, camel}`, `player:mounted`, `player:dismounted`, `player:knockdown`, `player:swing`, `player:bounds`.

### camera.js — `createCam(G)` (`G.actors.cam`)
```js
cam.follow(target = player) · cam.yaw (heading the camera looks along) · cam.pitch · cam.forward(out) · cam.snap()
cam.setDistance(d) · cam.shake(amplitude, duration) · cam.aimError(target | dirFn) → radians
cam.frame(target, { duration=1 })       // ease the view onto a target (beat start, objectives) without taking control
cam.softLock(target | null, { shoulder=true })   // الثبات: aim at target in 0.4 s, ± 20° nudge, over-the-shoulder offset
cam.skyMode(on)                         // star gazing: look-up to +85°, 0.6× sensitivity, magnetism toward a requested star
cam.cine(shots) → Promise · cam.cut(pos, look) · cam.release({ duration=1 })   // shots: [{ pos, look, dur, ease?, fov?, cut? }]
```
Spring arm never under the terrain (≥ 0.6 m). On foot: auto-align behind after 1.5 s without look input. Mounted: follows the heading at 90°/s after 1.0 s (one-thumb riding). Look scale: full-width drag = 180°.

### npc.js — `createNpcs(G)` (`G.actors.npcs`)
```js
npcs.spawn(id, modelId, { x, z, yaw, tint, scale, clip='idle' }) → npc      // idempotent per id
npc.actor · pos · yaw · place · play · playOnce
npc.goTo(x, z, { speed=1.6, stop=0.4 }) → Promise · npc.follow(target, { dist=1.6, speed }) · npc.followTrail(player, { behind=1.5 }) · npc.stop()
npc.lookAtPlayer(on) · npc.ride(camel) · npc.unride() · npc.speak(on)        // talk gesture while a dialogue line is theirs
npcs.get(id) · npcs.remove(id) · npcs.clear()
npcs.crowd(modelId, [{ x, z, yaw, tint?, clip='sit', t=0 }]) → { setVisible(b), remove() }   // extras: poses baked to static instanced geometry (0 skinned meshes)
```
### quadruped.js — `createQuadruped(G, modelId, { scale, tint, rig='skinned'|'static', name })` → body (camel, wolf)
The GLB is a static mesh. Rig build once per model (cached): bake the template into a Float32 geometry in metres (feet on y = 0, facing +Z), place ≤ 24 bones from the `spec` layout as fractions of `meta.size`, weights = inverse distance to the 2 nearest bone segments (legs separated by side and front/rear; saddle/load vertices follow the spine), `SkinnedMesh`, explicit bounds. Animation = summed sinusoids.
```js
body.root · pos · yaw · place(x, z, yaw?) · face(yaw, rate) · update(dt) · setScale(s) · setTint(hex) · setVisible(b) · dispose()
body.setSpeed(mps) · body.gait ('idle'|'walk'|'run')        // stride synced to ground speed (no foot sliding)
body.saddle (Object3D rider socket) · body.head (Object3D)
body.pose(name, {duration}) → Promise   // camel: 'kneel' | 'rise' | 'shake' | 'raiseHead' | 'lowerHead' ; wolf: 'crouch' | 'lunge' | 'snarl' | 'howl' | 'cower'
body.lookAt(target | null)
```
Camel gait = **pace** (both legs of a side together) with neck counter-swing; kneeling folds front then hind legs. Wolf trots (diagonal pairs), bounds when running. `rig:'static'` (or a failed rig) = rigid bob/pitch only — used for distant caravan camels.
### camels.js — `createCamels(G)` (`G.actors.camels`): owner of every camel
```js
camels.spawn(id, { x, z, yaw=0, scale=1, tint=null, rig='skinned', model='camel' }) → camel   // idempotent per id; camel = body + brain
camel.goTo(x, z, { speed=2.4, stop=1 }) → Promise · camel.follow(target, { dist=3, speed }) · camel.flee(from, dist=25) → Promise · camel.stop()
camels.get(id) · camels.all · camels.remove(id) · camels.clear()
```
### caravan.js — `createCaravan(G)`
```js
caravan.form({ lead /* camel */, camels: n, tints?, walkers: [npcId], riders: [{ npc, index }] })
caravan.follow(on)          // the string follows the lead's breadcrumb, 4.5 m spacing; members beyond 25 m use rig 'static'
caravan.pace → current lead-speed cap (2.4 firm, 1.8 on soft sand) · caravan.halt() · caravan.kneelAll() → Promise · caravan.riseAll() → Promise · caravan.clear()
```
### wolves.js — `createWolves(G)`
```js
wolves.spawnPack({ cx, cz, radius=14, arc: { centerYaw, width=180° } })      // ONE full wolf in the light at a time; the rest are eye pairs + silhouettes at the rim
wolves.wave({ target, lunges, gap }) → Promise<{ repelled, missed }>        // each lunge: 'wolf:telegraph' {wolf, x, z, in: 1.2} → 'wolf:lunge'; repelled iff 'player:swing' lands within ±60° in the last 1.1 s
wolves.next → wolf | null (set 2.5 s before its telegraph; its eyes glint with firasa.amount) · wolves.threat (bool)
wolves.alphaEnter() → Promise · wolves.alphaFeint() → Promise (same telegraph) · wolves.alphaLunge() → Promise · wolves.flee() → Promise · wolves.alpha · wolves.clear()
```
All randomness from `G.rng`. Never two lunges from opposite sides.

## 6. Systems

```js
// interact.js — the ONLY reader of the 'interact' action. Each tick it resolves ONE verb by priority:
//   1 steady (a steady request is open)  2 swing (player.item === 'torch' && wolves.threat → press = player.swing())  3 use (nearest enabled entry)
interact.add({ id, at: Object3D | {x,z}, radius=2.4, label: key, enabled=true, onUse, mountedOk=false, once=false, hold=0 /* seconds to hold */ }) → { remove(), setEnabled(b), setLabel(key) }
interact.verb → { kind: 'steady'|'swing'|'use'|null, labelKey, at, progress }     // the context button and its world marker render this; emits 'interact:verb'
interact.current · interact.held (bool, for steady) · interact.suspend(tag) / resume(tag)
// firasa.js
firasa.active (button held / toggled) · firasa.amount (0..1 incl. the 6 s afterglow) · firasa.setAllowed(b) · firasa.setRange(m)
firasa.addClue({ id, at, type: 'track'|'sign'|'creature'|'star', radius=45, onSeen }) → { remove(), seen }   // onSeen once: view centre within 12° for 0.4 s; off-screen clue entering range → 'firasa:ping' {bearing}
// steady.js
steady.hold({ target | null, seconds, labelKey, tolerance=35°, window=Infinity, resolve='full'|'windowEnd', breakOn='never'|'empty'|'flinch', stages?: [fn33, fn66] }) → Promise<boolean>
steady.tense(on)            // open/close a TEST WINDOW: with breakOn 'flinch', releasing > 0.25 s, stick > 0.5 or view > 35° off fails at once
steady.brace({ warn, impactAt }) → Promise<boolean>     // gust: button must be down at impact and 1.0 s after; no facing test
steady.walk({ to: {x,z}, radius=3, speed=1.5 }) → { done: Promise<boolean>, shot() }   // c5: speed locked for stick ≥ 0.2; flinch = stop > 0.5 s, heading > 35° off > 0.4 s, or thumb lifted within 0.8 s after shot()
steady.progress · steady.activeRequest
// survival.js
survival.thirst (0..100) · survival.sips · survival.set({ thirst?, sips?, drain? }) · survival.drink() → Promise<boolean> (hold-to-drink, +35)
survival.rate(tag, perSecond | null)         // extra drain sources (soft sand, storm); base rates per DESIGN §4; emits 'survival:changed', 'survival:level' {step: 40|30|15}, 'survival:collapse'
// objectives.js
objectives.set(key, { vars?, at?, bearingFn?, mark='hint'|'always'|'never', hints?: [k1, k2], hintAfter?: [s1, s2], progress?: () => number }) · poke() · done() · clear()
objectives.mark(id, { at | bearingFn, icon: 'goal'|'suhail'|'jady'|'sun'|'camp'|'voice', scope='beat'|'level' }) → { remove() }
// tracks.js — the only API chapters use for authored trails (renders through decals.trail, registers its own clues)
tracks.add({ id, points:[{x,z}], kind, fresh=1, spacing?, gaps?: [[i0,i1]], hidden=false, reveal?: metres }) → { reveal(), hide(), progressOf(pos) → 0..1, distanceTo(pos), end, remove() }
// stars.js
stars.find({ star, seconds=0.8, tolerance=7°, magnet=12°, decoys?: [{ star, onGaze }] }) → Promise     // sky mode + الفراسة held; decoy gaze → callback (hint), never a fail
// director.js (kernel)
director.startChapter(n, beatId?) · restartBeat() · stop() · current · failAndRestart(textKey)
d.wait(s) · d.until(fn, {timeout}) · d.task(fn) · d.tween(s, fn) · d.near(target, r) · d.wrap(promise)
d.first({ name: promise, … }) → Promise<name>     // first to settle wins; the others are .cancel()led
d.spawn(async d2 => { … }) → { cancel(), done }   // background branch with a child scope (watchers, loops); ends with the beat
d.talk(blockId) · d.say(who, text) · d.bark(blockId) · d.choice(promptKey|null, [{ key, value, confirm? }]) → value · d.card(cardId, {seconds}) · d.fade(toBlack, s)
d.objective(key, opts) · d.objectiveDone() · d.flag(name, value) · d.flags · d.own(handle) · d.onEnd(fn) · d.cine(shots) · d.failAndRestart(textKey)
```
**Checkpoint (kernel)**: at every beat start the director stores `{ beat, thirst, sips, flags }` in `G.save.data.cp`; a cold start of that beat restores it. A chapter declares `survival: { thirst, sips, drain }` (ch1 `{100, 0, false}`, ch2 `{55, 1, true}`, ch3 `{100, 0, false}`, ch4 `{36, 1, true}`, ch5 `{100, 0, false}`) applied when the chapter starts fresh. `FLAG_DEFAULTS = { ration: 'self', gaveWater: false, sawWolfPrint: false, leftRifle: false, haybah: 0 }`.
**Beat teardown**: everything owned through `d.own/d.onEnd` and every scope promise is released by the scope; then the director calls `onBeatEnd()` on every module and clears input locks, `cam.softLock/skyMode`, `player.setScripted(false)`, player limits not prefixed `level:`, the objective, and beat-scoped compass marks.

### Events
`level:loaded {L}` · `level:unload` · `beat:start {chapter, beat, resumed}` · `beat:end` · `beat:reset` · `beat:fail {beat, textKey}` · `chapter:end {chapter}` · `game:end {flags, stats}` · `state:mode {mode}` · `pause {paused}` · `resize {w, h, rotated}` · `gl:lost` · `gl:restored`
`player:step` · `player:mounted` · `player:dismounted` · `player:knockdown` · `player:swing` · `player:bounds`
`interact:verb {kind, labelKey}` · `interact:use {id}` · `firasa:on` · `firasa:off` · `firasa:seen {id, type}` · `firasa:ping {bearing}`
`steady:start {seconds, labelKey, target}` · `steady:progress {p}` · `steady:stage {n}` · `steady:end {ok}` · `stars:progress {p}` · `stars:found {id}`
`survival:changed` · `survival:level {step}` · `survival:drink` · `survival:collapse` · `objective:set {key}` · `objective:done` · `objective:marks` · `hint:show {key, level}`
`weather:gustWarn {in, dir}` · `weather:gust {strength, duration}` · `wolf:telegraph {wolf, x, z, in}` · `wolf:lunge` · `wolf:repelled` · `wolf:bite`
`dialogue:open` · `dialogue:line {who, text}` · `dialogue:close` · `dialogue:bark` · `choice:made {key, value}` · `card:show` · `ui:choice {index}` · `ui:start {continue?, chapter?}` · `quality:changed` · `audio:unlocked` · `save:committed`

## 7. Chapters (`chapters/chN.js`)

```js
export default {
  id: 'ch1', index: 1, assets: 'ch1', level: LEVELS.camp /* chapters/levels.js */, sky: 'dawn',
  survival: { thirst: 100, sips: 0, drain: false },
  setup(G, L) { /* once after the level loads: spawn level-lifetime actors; L.own(handle) */ },
  beats: [
    { id: 'c1_wake',
      enter(G, L, ctx) { /* ALWAYS called at beat start; idempotent absolute setup; teleports/placements only when ctx.resumed */ },
      async run(G, L, d) { /* the sequence; returns when the beat is complete */ } },
  ],
};
```
A beat must be startable cold (`ctx.resumed === true`: chapter start, checkpoint load, retry, test jump): `enter` places every actor the beat needs, sets sky/weather, mounts the player if the beat starts mounted, equips items. `run` never assumes a previous beat's `run` happened in this session — read `d.flags`. Never catch `BeatAbort` (use `try/finally` or `d.onEnd` for cleanup). Beat ids, content and numbers: DESIGN §5; text keys: docs/SCRIPT.md.

## 8. UI (`ui/`, DOM inside `#ui`)

The UI is a dumb, immediate view: it shows what it is told and reports taps through `G.input` and events. Landscape only (see Stage). RTL text; controls are NOT mirrored.
```js
ui.touch      // left 45 %: floating stick (radius 56 px, dead zone 0.12, knob turns gold past 0.90) → input.setMove; rest: look drag → input.addLook (full width = 180°);
              // context button ⌀ 76 bottom-right (renders interact.verb: label, hold ring, dimmed when none); eye ⌀ 64 on the thumb arc up-left of it (hold; toggle option);
              // قربة icon top-right (hold 0.6 s to drink; only when survival is shown); pause top-left. Hold-and-drag on buttons steers the camera.
ui.hud        // objective (tap = repeat hint) · horizon strip with learned marks (objectives.marks) · قربة level · steady ring drawn around the world target (project its position) ·
              // gust warning (windward streaks) · direction ripple ui.hud.ripple(bearingFn | null, {arrow?}) · edge glint ui.hud.glint(bearingDeg) · toasts ui.hud.toast(msg | {who,name,text}, s) ·
              // tutorial prompt ui.hud.prompt(key | null) · numerals ui.hud.count(n | null) · firasa vignette · thirst vignette · progressive visibility ui.hud.show({ eye, water, strip })
ui.dialogue.show({ who, name, text }) · .hide() · .typing · .finishTyping() · .choices(prompt, [{ label, confirm? }]) → emits 'ui:choice' {index} · .hideChoices()
ui.cards.setFade(alpha) · .show({ num, title, sub }) · .hide() · .letterbox(bool)
ui.menus.showTitle() · .showPause(bool) · .showEnding(summary) · .hideAll()      // title: ابدأ الرحلة / أكمل / الفصول / الإعدادات; settings: quality, volumes, sensitivity 0.5–2×, invert-Y, eye hold/toggle, text size
ui.loading.show(bool) · .set(progress)        ·        ui.update(dt) runs while paused
```
Look: sand/ivory panels, dark-brown rules, the Sadu strip (SVG pattern) as the signature border; «Aref Ruqaa» titles, «Tajawal» body (dialogue ≥ 18 px). Choices lock input 0.7 s when they appear; `confirm` options need a 0.5 s hold. A rotate hint «أدِر الجوال» shows while `G.stage.rotated` until the first input.

## 9. Audio (`audio/audio.js`)

```js
audio.unlock() · audio.setVolumes({ master, music, sfx, voice }) · audio.suspend() / resume()
audio.music(id | null, { fade=2 })      // looped with a 2 s self-crossfade at the seam (generated loops are not seamless)
audio.sfx(id, { volume=1, rate=1, pan?, at?: {x,z} }) · audio.loop(id, opts) → { setVolume(v, t), stop(t) }
audio.ambience({ wind, storm, fire, night })      // 0..1 each; procedural beds (filtered noise + LFO)
audio.step(surface, weight) · audio.heartbeat(bpm | 0) · audio.duck(db, seconds) · audio.note(i) (plucked star notes) · audio.ui(kind)   // procedural
```
Files (manifest ids): `music_march music_night music_haya sfx_camel sfx_calf sfx_howl sfx_snarl sfx_shot sfx_water sfx_torch sfx_qata sfx_thunder sfx_pulley sfx_drum sfx_gust sfx_rain`. Missing buffer → silent no-op. Positional sfx = equal-power pan + distance roll-off from the camera. iOS: create/resume the context inside the first user gesture; start a silent looping `<audio playsinline>` so WebAudio is audible with the ring switch muted; handle `interrupted` state; suspend on `visibilitychange`.

## 10. Dev & test

- `?dev=1` overlay. `?test=1` → `window.__hs = { G, errors[], step(n, dt) , until(fn|string, maxSteps), chapter(n, beatId), warp(x, z, yaw), input(feed), state(), bot }`. Fast-forward ticks are not drawn.
- `harness/<name>.js`: `export const assets = [ids…]; export async function run(G, params) { … }` → `/harness/harness.html?m=<name>`.
- Unit tests (`node --test tests/unit`) for pure logic (math, terrain sampling, star positions, ledger rules…).
- The autoplay bot (`dev/bot.js`) completes every chapter through `__hs` using only public inputs + warps; chapters must stay bot-completable.

## 11. Budgets (hard)

Draw calls ≤ 120 · triangles ≤ 250k (terrain ≤ 60k) · skinned meshes ≤ 12 on screen · 4 lights total · textures ≤ 64 MB · zero allocations per frame · boot JS ≤ 350 KB gzip · one render pass.
Triangles: hero ≤ 23k, other humanoids ≤ 17k, quadruped ≤ 12k, prop ≤ 9k; LOD1 ≈ 20 %. Blended overdraw: ≤ 2 full-screen layers at any time. Particles (low/medium/high): dust 150/300/600, storm sheets 4/8/12, rain 300/700/1400, embers per fire 12/24/40.

## 12. Net / ledger

`app/src/logic.js` is the platform's pure "journey ledger" (six exports, no imports, deterministic): state `{ v, chapter, beat, flags, done }`; actions `{type:'checkpoint', chapter, beat}` (monotonic), `{type:'flag', name, value}` (whitelisted names/values), `{type:'complete'}`, `{type:'restart'}`. `core/net.js` mirrors `G.save` to the room `/ws/s-<save.id>` best-effort (lazy connect, silent failure, exponential backoff); localStorage stays the source of truth.
