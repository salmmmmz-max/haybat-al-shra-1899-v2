# Module part — TERRAIN («الرملة»)

**Owned files**: `game/src/world/terrain.js` · optional `game/src/world/terrain-gen.js` (pure height generator, importable by node tests) · `game/harness/terrain.js` · `game/tests/unit/terrain.test.js`.
Contract: ARCHITECTURE §4 `terrain.js`, the rendering rules of §1, budgets §11. The current file is a throw-away baseline (analytic dunes on a 4 m lattice) — replace it.

## What it must be
The desert is the main character of this game: the player spends 27 minutes looking at this surface, on foot and from a camel, at dawn, noon, in a sandstorm, at dusk and at night by a fire. It must read as the Empty Quarter: long sculpted dunes with a gentle windward slope, a sharp sinuous crest and a steep slip face, clean interdune floors, light side / shadow side clearly separated, fine wind ripples close to the camera, sparkle in low sun.

## Requirements (in addition to the contract text)
- API exactly as in the contract, plus `terrain.half = 512`.
- `build(def)` handles any def of this shape. Use these three as your test set (the final levels are close to them):
```js
L1 = { seed: 1101, duneAmp: 7,  duneScale: 110, windDeg: 250, flats: [{x:0,z:0,r:42,fall:34}, {x:95,z:120,r:26,fall:30,y:1}], soft: [], gravel: [{x:95,z:120,r:40}], ridges: [{x1:20,z1:60,x2:120,z2:40,h:9,w:30}] }
L2 = { seed: 2202, duneAmp: 11, duneScale: 150, windDeg: 270, flats: [{x:0,z:-150,r:20,fall:30}, {x:0,z:130,r:34,fall:40}], soft: [{x:-30,z:-20,r:38}, {x:40,z:30,r:30}], gravel: [{x:0,z:130,r:50}], ridges: [{x1:-60,z1:165,x2:60,z2:165,h:10,w:26}] }
L3 = { seed: 3303, duneAmp: 13, duneScale: 170, windDeg: 240, flats: [{x:0,z:-330,r:24,fall:40}, {x:0,z:250,r:40,fall:45,y:-7}], soft: [], gravel: [{x:0,z:250,r:60}], ridges: [{x1:-110,z1:170,x2:110,z2:170,h:12,w:34}] }
```
  `duneAmp` = typical crest height above the interdune floor; `duneScale` = crest spacing; `windDeg` = bearing the prevailing wind blows TOWARD (slip faces look that way; ripples are perpendicular to it). `flats`: exactly level at `y` (default 0) inside `r`, blending out over `fall` metres. `ridges`: an extra dune ridge along a segment, `h` high, half-width `w`, with a crest (the sample L3 ridge is the crest above the well basin). `soft` / `gravel`: surface masks (discs with a soft edge) — soft sand is paler and smoother, gravel is darker and speckled and flattens the ripples.
- Everything must stay walkable: slip faces ≤ 33°, no cliffs, no spikes; every flat is reachable. `slopeAt` returns `tan`-normalised 0..1 (1 = 33° or steeper). Heights are deterministic per seed (no `Math.random`).
- Near field 513² @ 2 m, far field 257² @ 32 m from the same generator; `heightAt` is piecewise-linear on the exact triangles the finest ring draws; allocation-free and O(1). Inside `exactRadius` (≥ 64 m from the camera) the drawn surface equals `heightAt` to the millimetre (feet, props and prints sit on it).
- One draw call, ≤ 60k triangles (tier-scaled is fine: e.g. 28k / 42k / 58k), camera-following nested rings with cells 2/4/8/16/32 m… out to the far plane (2600 m; fog hides the end). No cracks between rings, no vertex swimming when the camera moves (snap each ring to its own lattice, geomorph the transitions). Heights on the GPU by `texelFetch` from an R32F `NearestFilter` `DataTexture` (or CPU-written vertices on ring snap). Never sample float textures with linear filtering.
- `build()` ≤ 600 ms on a phone (≈ 80 ms on a desktop): tight typed-array loops, no per-sample objects.
- Material: one `ShaderMaterial` (`fog: true`, `lights: true`): lit by `G.world.sky.uniforms` BY REFERENCE (`uSunDir`, `uSunColor`, `uAmbSky`, `uAmbGround`, `uHorizonColor`, `uZenithColor`, `uTime`, `uNight`) and by three's point-light uniforms (the two pooled fire lights — the firelit circle of sand around the campfire at night is a key image of chapter 3; in your copy the baseline has no point lights, so add two test `PointLight`s in your harness scene before the first render to verify). Its response must match what `MeshLambertMaterial` props/actors get from `sky.sunLight` + `sky.hemi`, so characters do not look pasted on.
- Look: warm lit side, cool bluish shadow side, soft terminator, bright thin rim on crests facing the sun, wind-aligned ripple normals fading out by ~40 m (no moiré, no shimmer at distance: fade detail with `fwidth`/distance), sparse sparkle near the sun reflection, slow large cloud shadows, slightly darker damp tone on `flats` near y < 0 (the well basin), subtle colour variation between dunes (hue/value noise) so the vista never looks like one flat colour. At night: cool, dim but readable forms. In the storm: fog does the work.
- الفراسة: add `uFirasa: G.shade.uFirasa` and the shade chunk last. When `uFirasa > 0`, the boundary of every `soft` disc lights up as a thin gold line that is exempt from the desaturation (the player reads the firm corridor with the eye).
- `terrain.update(dt)` follows `G.camera`. `setQuality(tier)` switches the ring budget without a hitch.

## Harness `terrain` (params)
`def=L1|L2|L3` · `preset=<sky preset>` · `cam=vista|low|walk|top|night` · `x,z,yaw` start point · `markers=1` (drop small spheres on `heightAt` over a 60 m grid around the camera — in a side view they must sit exactly on the surface) · `fly=<metres>` (advance the camera along its heading over N steps, to hunt cracks/swimming).
Deliver at least: a wide morning vista, a low-sun (dusk) vista with long light/shadow sides, a close-up of ripples at the hero's eye height, the gravel flat and the soft field, the firelit night patch, a top view showing the ring structure in wireframe (`wire=1`).

## Unit tests
Generator determinism; flats exactly flat; ridge raises the surface; `heightAt` equals the triangle interpolation at lattice points and mid-cells; continuity across cells; maximum slope ≤ 33°; far/near fields agree at the blend edge.
