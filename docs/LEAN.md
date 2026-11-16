# هيبة الصحراء ١٨٩٩ — LEAN engineer sheet (read this, your task prompt, and your own files — nothing else)

3D third-person Bedouin story game for mobile browsers. three.js r170, WebGL2, esbuild. The kernel exists; you write ONE module group to its API. Aim: looks good, runs smooth on a mid phone, small simple code. No over-engineering.

## Workspace & loop
Your private copy: `WS=/home/user/lw/<name>` (given in your task). Run everything from `WS/game`. Edit ONLY the files your task says you own.
```
node tools/build.mjs --dev --harness
node tools/shot.cjs "/harness/harness.html?m=<scene>&test=1" .cache/out/x.png --w 960 --h 540 --quiet \
  --until "window.__harness && (window.__harness.ready || window.__harness.error)" \
  --eval "await __hs.step(120)" --print "window.__harness.error" --print "__hs.errors"
```
`--eval "js"` and `--print "expr"` are repeatable; `--portrait --mobile` emulates a phone held upright (the stage is drawn rotated). `?test=1`: no RAF — time moves only with `await __hs.step(n)` (1/60 s ticks, only the last is drawn); `__hs.G` = context; `__hs.input({move:{x,y},look:{x,y},hold:[],press:[]})`; `__hs.warp(x,z,yaw)`.
A harness scene is `game/harness/<scene>.js`: `export const assets = ['dhari','camel',…]` (model ids to preload) and `export async function run(G, params)` (URL query → params; return value → `window.__harness.api`). Scene `kernel` = small sandbox chapter (must keep running without errors); scene `api` → `--print "window.__harness.api.missing"` lists contract names still missing.
Screenshots are software-rendered (slow; fps meaningless). View a PNG with the Read tool; keep it to ≤ 8 image views; prefer `--print` probes. Write the whole module FIRST (working end to end), then polish. Keep a short `WS/NOTES.md` (done/next) — if it exists when you start, you are resuming.

## Conventions
Metres, seconds, radians. +X east, +Z south, +Y up (north = −Z). `rotation.y = yaw`, yaw 0 faces +Z; forward `(sin yaw, 0, cos yaw)`. Compass bearing° = `(180 − yaw°) mod 360` (helpers in `src/core/math.js`: clamp, lerp, damp(cur,target,lambda,dt), dampAngle, turnToward, yawOf(dx,dz), dist2, bearingDeg, pointOf(target), smoothstep, DEG, TAU). Ground height = `G.world.terrain.heightAt(x, z)`.
Module shape: `export function createX(G) { … return api }`; optional `update(dt)`, `onBeatEnd()`, `onLevelUnload()`, `setQuality(tier)`. dt-correct motion. Sim time only (`G.time.now`); never Date.now / setTimeout / RAF / Math.random in gameplay (`G.rng.next()`, cosmetics `G.vrng.next()`). No per-frame allocations (scratch vectors at module scope; swarms = ONE InstancedMesh/Points). No new npm packages. Missing model/texture → procedural stand-in, never throw. With `G.state.fastText` (tests) every scripted wait/hold/animation resolves in ≤ 0.1 s.

## G (context)
`G.scene, G.camera (Perspective, FOV 55), G.renderer, G.events (on/once/emit), G.input, G.assets, G.save, G.quality (tier 'low'|'medium'|'high', pick(lo,mid,hi)), G.stage (w,h in stage px; toLocal(cx,cy,out); delta(dx,dy,out)), G.shade, G.lod, G.t(key,vars), G.rng, G.vrng, G.time {now,dt,frame,scale}, G.state {mode,chapter,beat,flags,fastText}`
`G.world {terrain, sky, weather, props, decals, level}` · `G.actors {player, cam, npcs, camels, caravan, wolves}` · `G.sys {interact, firasa, steady, survival, objectives, stars, tracks, director}` · `G.ui {hud, touch, dialogue, menus, cards, loading}` · `G.audio`
Modes: `'title'|'loading'|'play'|'cine'|'dialogue'|'end'`. Gameplay only acts in `play`.
Awaitables (sim-time, abort-safe — always use them for promises): `G.scope.sleep(s)`, `G.scope.until(fn, {timeout})`, `G.scope.task(dt => value|undefined)` (resolves with the first non-undefined), `G.scope.tween(s, k => …)`, `G.scope.own(handle)`, `G.scope.onEnd(fn)`.
Input (read): `G.input.move {x,y}` (y forward), `moveMag`, `look {x,y}` (radians this tick), `held(a)/pressed(a)/released(a)` with a ∈ `interact firasa run drink pause skip`. Write (UI): `setMove(x,y)`, `addLook(dx,dy)`, `setHeld(a,on)`, `tap(a)`.
Assets: `G.assets.instance(id)` → Object3D | null (static: on y=0, centred, facing +Z, metres; humanoid: skinned clone with `userData.animations`); `G.assets.meta(id)` → `{size:[x,y,z], tris, …}`; `G.assets.lodGeometry(id)`; `G.assets.texture(id)`.

## Rendering rules
- `NoToneMapping`, sRGB output; keep lit colours ≤ 1. ONE `FogExp2` owned by sky (custom shaders: `fog:true` + `THREE.UniformsLib.fog` + three's `<fog_*>` chunks). Exactly four lights exist forever: `sky.sunLight`, `sky.hemi`, two pooled `PointLight`s owned by props — never add/remove lights. No shadow maps (blob shadows only).
- الفراسة desaturation: built-in materials → `G.shade.patch(material)` once. Custom `ShaderMaterial`: add uniform `uFirasa: G.shade.uFirasa`, include `SHADE_PARS_FRAGMENT` and (last in main) `SHADE_FRAGMENT` from `src/core/shade.js`. Glowing clue markers are exempt.
- `frustumCulled=false` on camera-following things (sky, weather, fire particles, decal buffers). renderOrder: 0 opaque · 10 terrain · 20 sky · 30 stars · 40 decals/blob shadows (polygonOffset, depthWrite off) · 50 particles (depthWrite off) · 60 glows (additive).
- Create every material/buffer at construction or level load (counts 0 when unused) — nothing lazily on first use. Never dispose `G.assets` resources.
- Sky uniforms shared by reference (`G.world.sky.uniforms`): `uSunDir, uSunColor, uAmbSky, uAmbGround, uHorizonColor, uZenithColor, uTime, uNight`.
- Budgets: ≤ 120 draw calls, ≤ 250k triangles on screen, particles small (dust ≤ 300, rain ≤ 700, embers ≤ 24 per fire on medium).

## Glue between modules (binding)
- Only the director/chapters call `G.ui.*`. Other modules expose state + emit events; the UI polls state each frame and listens to events.
- `objectives.current → null|{key,text}` · `objectives.hint → null|{key,text,level}` · `objectives.marks → [{id, icon, bearing(deg, 0=N, clockwise)|null, dist|null}]` (stable array). Events `objective:set {key,text}`, `objective:done`, `hint:show {key,text,level}`.
- `interact.verb` = one reused `{kind:'steady'|'swing'|'use'|null, labelKey, at:{x,y,z}|null, progress:0..1}`.
- `steady.activeRequest → null|{kind:'hold'|'brace'|'walk', target, labelKey, seconds}` · `steady.progress` · `steady.tension`.
- `stars.active → null|{star, progress}`. Camera: `cam.yaw`, `cam.aimError(target|dirFn)`, `cam.softLock(target|null)`, `cam.skyMode(bool)`, `cam.magnet(dirFn|null, coneDeg)`, `cam.setFov(deg|null, s)`, `cam.shake(a, s)`.
- `survival.thirst` (100 good → 0 collapse), `sips`, `drinkProgress`; survival watches `input.held('drink')` itself.
- firasa: writes `G.shade.uFirasa.value`, calls `decals.setFirasa(amount)` each tick; `firasa.amount`, `firasa.active`.
- Riding: `camel.saddle` (Object3D, origin = seat point, world scale 1), `camel.ridden` (bool: brain suspended; the rider's module calls `camel.place(x,z,yaw)` + `camel.setSpeed(mps)` each tick), `camel.kneeling`, `camel.pose('kneel'|'rise', {duration})` → Promise. Humanoid actors: `actor.sitOn(parent|null)`.
- `player:step {x,z,yaw,foot:'L'|'R',surface:'sand'|'soft'|'gravel',run,camel}` · `player:swing {x,z,yaw}` · `weather:gustWarn {in,dir:{x,z}}` · `weather:gust {strength,duration}` · `wolf:telegraph {wolf,x,z,in}` · `wolf:lunge` · `wolf:repelled` · `wolf:bite` · `steady:start/progress/stage/end` · `survival:changed/level {step}/drink/collapse` · `firasa:on/off/seen {id,type}/ping {bearing}` · `stars:progress/found`.
- Wind: `weather.setWind(deg, strength)` — deg = compass bearing the wind blows TOWARD; `weather.wind {x,z,strength}` (x = sin deg, z = −cos deg), `weather.visibility` (m, Infinity when clear), `weather.gusting`.
- Fire handle `{setLit(b), lit, position, setBeacon(range)}`; `props.fires` (array of handles); `props.colliders` (stable array `{x,z,r}`).
- Audio is automatic from events (do not call `G.audio` from world/actor/system code).

## Art direction
Stylized painterly realism: matte hand-painted look, warm golden-amber sand under a pale dusty-blue sky, people in off-white cotton and coffee-brown wool with indigo and madder-red accents, soft warm light, calm dignified epic mood, strong readable silhouettes. Beauty from light, colour and motion — not heavy effects.

## Final answer (short, plain text)
Files written · API extras · what you verified (numbers/screens) · known gaps · anything the lead must change elsewhere.
