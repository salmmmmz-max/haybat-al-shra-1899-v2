# Engineer brief — common part (read fully, then your module part below)

You are one of seven senior engineers building **«هيبة الصحراء ١٨٩٩»**, a 3D third-person Bedouin story game for mobile browsers (three.js r170, WebGL2, esbuild bundle). The lead architect wrote the kernel and a binding contract; you implement ONE module group against it. Quality bar: a polished commercial indie game — beautiful, convincing, smooth on a mid-range phone. The player must feel the harshness and beauty of the desert.

## Your workspace
`WS = /home/user/ws/@NAME@` is a private full copy of the repository (`docs/`, `game/`, `app/`). Work ONLY inside it; run every command from `WS/game`. When you finish, the lead copies your OWNED files (listed in your module part) into the main tree. **Changes to any other file are discarded** — if you believe a kernel or neighbour file must change, do not edit it: describe the change under `kernelRequests` in your hand-back and work around it meanwhile.
Other engineers implement the neighbouring modules at the same time in their own copies; in your copy the neighbours are simple baselines. Code against the CONTRACT, not against a baseline's behaviour. Contract APIs a baseline lacks are auto-filled with no-op stand-ins (`src/dev/stubfill.js`), so a call never throws — but it may do nothing.

## Read first — in this order, and nothing else under docs/
1. `WS/BRIEF.md` (this file).
2. `docs/ARCHITECTURE.md` — the whole file. Binding.
3. `docs/DESIGN.md` — §3, §4, §7, §9 and the beats of §5 that use your module (numbers there are frozen).
4. Optional skim: `docs/arch-findings/<module>.md` (advisory review notes; ARCHITECTURE v2 already folds in the accepted ones — grep the headings, read only what affects your choices).
5. The kernel code you call (`game/src/core/*.js`; `core/game.js` shows construction and update order; `systems/director.js` and `world/level.js` show how chapters drive modules) and the current baseline of your own files.

## Dev loop (from `WS/game`)
```
node tools/build.mjs --dev --harness
node tools/shot.cjs "/harness/harness.html?m=<scene>&test=1" .cache/out/x.png --w 960 --h 540 \
  --until "window.__harness && (window.__harness.ready || window.__harness.error)" \
  --eval "await __hs.step(120)" --print "window.__harness.error" --print "__hs.state()" --print "__hs.errors"
node --test tests/unit/
```
- `shot.cjs` options: `--w --h` viewport · `--portrait --mobile` phone emulation (portrait → the stage is drawn rotated) · `--wait ms` · `--until "expr"` · `--eval "js"` (repeatable, may `await`) · `--print "expr"` (repeatable, prints `[print] <json>`) · `--quiet`. Exit code 1 on any console error.
- `?test=1`: no RAF; time advances only through `await __hs.step(n)` (dt 1/60, only the last tick is drawn). `__hs.G` is the context object; `__hs.input({ move:{x,y}, look:{x,y}, hold:[…], press:[…] })` feeds input for the following ticks; `__hs.warp(x, z, yaw)`; `__hs.state()`; `__hs.errors`.
- A harness scene is `game/harness/<scene>.js` exporting `assets` (model ids to preload; `'a:<id>'` audio) and `async run(G, params)` (`params` = the URL query; whatever it returns is `window.__harness.api`). Write scenes that show off and stress your modules — the lead reviews your work through them. Use URL params for variants.
- Look at screenshots with the Read tool. Rendering is software WebGL: slow (seconds per shot) and its fps is meaningless — judge performance by draw calls, triangles, overdraw and allocations (`__hs.state().render`). Keep shots ≤ 960×540 and view only what you need (aim for ≤ 20 image views in total); prefer numeric probes via `--print`.
- Contract check: scene `api` → `--print "window.__harness.api.missing"` lists every contract name that is still absent or a stand-in. Nothing belonging to your modules may remain in that list.
- Regression: scene `kernel` (a small sandbox chapter) must still run: `--eval "await __hs.step(600)"` with `__hs.errors` empty.

## Rules that matter most (details: ARCHITECTURE §1)
- Exported names and shapes exactly as in the contract and the glue below. Extras are welcome — document them in the file's JSDoc header and list them in your hand-back.
- dt-correct; sim time only (no `Date.now`, `performance.now`, `setTimeout`, RAF in gameplay); every awaitable through the scope (`G.scope…`, abort-safe); zero per-frame allocations; no new npm packages; no `Math.random` in gameplay (`G.rng` / `G.vrng`).
- Rendering rules: colour space, the single `FogExp2`, the fixed four lights, shade chunk last, the render-order table, bounds rules, warm-up (create everything at construction / level load, never lazily on first use).
- Graceful degradation: a missing model / texture / sound → procedural stand-in, never a throw.
- Mobile first: tiers through `G.quality.pick(lo, mid, hi)`; budgets in ARCHITECTURE §11.
- With `G.state.fastText` (tests) every scripted wait, hold and animation of yours resolves in ≤ 0.1 s so the autoplay bot can run the whole game quickly.
- Art direction: stylized painterly realism — matte hand-painted look, warm golden-amber sand under a pale dusty-blue sky, people in sun-bleached off-white cotton and coffee-brown wool with indigo and madder-red accents; soft warm light; calm, dignified, epic mood; strong readable silhouettes. Beauty comes from light, colour and motion, not from heavy effects.

## Glue contract (binding additions to ARCHITECTURE — both sides implement exactly this)
1. **Who talks to the UI**: only the director (kernel) and chapters call `G.ui.*`. Systems, actors and world modules never do — they expose state and emit events; the UI polls documented state every frame and subscribes to events.
2. **Objectives** (`systems/objectives.js` ↔ UI): `objectives.current → null | { key, text }` · `objectives.hint → null | { key, text, level }` · `objectives.marks → Array<{ id, icon, bearing /* deg, 0 = north, clockwise; null if unknown */, dist /* m | null */ }>` (one stable array, entries updated in place). Events `objective:set {key, text}`, `objective:done {key}`, `hint:show {key, text, level}`, `objective:marks`. Tapping the objective text → `objectives.poke()`.
3. **Context verb** (`interact.js` ↔ UI): `interact.verb` is ONE reused object `{ kind, labelKey, at /* {x,y,z} world point of the marker | null */, progress /* 0..1 for hold verbs */ }`.
4. **الثبات** (`steady.js` ↔ UI/camera): `steady.activeRequest → null | { kind: 'hold'|'brace'|'walk', target, labelKey, seconds }` · `steady.progress` 0..1 · `steady.tension` (bool: inside a test window). The UI draws the ring around the projected `target` (screen centre when null). `steady` calls `cam.softLock(target)` itself.
5. **Stars** (`stars.js` ↔ UI/camera/sky): `stars.active → null | { star, progress }`. `stars.find` drives `cam.skyMode(true)`, `cam.magnet(dirFn, cone)` and `sky.stars.highlight`.
6. **Camera extras**: `cam.magnet(dirFn | null, coneDeg = 12)` (inside the cone the view is pulled gently toward the direction; the pull fades while the player drags) · `cam.setFov(deg | null, duration = 0.6)`. Look input arrives in `G.input.look` as radians at 1×; the camera applies `G.save.settings.sens` (0.5–2) and `invertY`. The touch UI converts drags at: full stage width = π rad of yaw; half the stage height = π/3 rad of pitch.
7. **Water** (`survival.js` ↔ UI): `survival.thirst`, `survival.sips`, `survival.drinkProgress` (0..1 while holding). The survival system itself watches `G.input.held('drink')` (0.6 s, mode `play`, `sips > 0`) and performs the drink; `survival.drink()` is the scripted variant (resolves `true` when the player completes the hold; `false` if there is no sip).
8. **الفراسة side effects** (owned by `firasa.js`): it writes `G.shade.uFirasa.value`, calls `G.world.decals.setFirasa(amount)` every tick, applies `player.limit('firasa', { speedMul: 0.6, run: false })` while active, and marks every non-track, non-star clue with `G.world.props.glow(at, …)` (gold). Star clues glow through `sky.stars.highlight`. Thirst ≤ 15 → `survival` applies `player.limit('thirst', { run: false })`.
9. **Riding** (player / npc ↔ quadruped): `camel.saddle` is an Object3D whose origin is the seat point on top of the saddle (+Z forward, world scale 1 whatever the body scale). `camel.ridden` (bool, written by the rider's module): while true the camel's own brain (`goTo`/`follow`/`flee`) is suspended and the rider's module drives it every tick with `camel.place(x, z, yaw)` + `camel.setSpeed(mps)`. Humanoids expose `actor.sitOn(parent: Object3D | null)`: parents the actor under `parent`, plays `sit` and applies the model's seat offset so the pelvis rests on the parent's origin; `sitOn(null)` returns it to the scene, standing on the ground at the same x/z. No frame lag: the rider is a child of the saddle.
10. **Steps**: the player emits `player:step { x, z, yaw, foot: 'L'|'R', surface, run, camel }` for the hero on foot (every 0.7 m walking) and for the ridden camel (`camel: true`, every 1.1 m). `decals` and audio subscribe. Caravan members print through `decals.print` directly (sparingly).
11. **Weather ↔ sky**: `setWind(deg, strength)` — `deg` is the compass bearing the wind blows TOWARD (0 = north = −Z, 90 = east = +X): `wind.x = sin(deg)`, `wind.z = −cos(deg)`; `weather.wind` is one reused object. Weather pushes `sky.setVisibility(m | null)` every tick. `weather.gusting` (bool). `sky.sunBearing()` returns `null` at night.
12. **Fire / lights**: the two pooled `PointLight`s are created inside `createProps` and never added/removed afterwards (terrain shaders may rely on `NUM_POINT_LIGHTS == 2`). Fire handle: `{ setLit(b), lit, position /* Vector3 */, setBeacon(range) }`; `props.fires → Array<handle>` (all current emitters, for audio).
13. **Blob shadows / LOD**: every actor wrapper registers its own `G.world.decals.blob(root, radius)` and `G.lod.add(…)` and removes them on dispose.
14. **Audio** is event-driven and written by the lead: emit the documented events with the documented payloads; do not call `G.audio` from world/actor/system code. (UI may call `G.audio.ui('tap' | 'confirm' | 'back' | 'tick')`.)
15. **Settings** live in `G.save.settings` `{ quality, master, music, sfx, voice, sens, invertY, firasaToggle, textScale, haptics }`; whoever changes one calls `G.save.commit()` and emits `settings:changed { key, value }`.

## Working method
- Keep `WS/NOTES.md` current (done / next / decisions) after every milestone. **If `WS/NOTES.md` already exists when you start, you are RESUMING an interrupted run**: read it, inspect your files, continue — never restart from scratch.
- Build end-to-end first (whole API working with simple visuals), then raise quality. Files on disk are your checkpoints: save working states often.
- Verify before you claim: run the scenes, read the screenshots, check `__hs.errors`, run the `api` and `kernel` scenes. Say honestly what you could not verify.
- Be economical: do not re-read large files, do not dump big outputs into the terminal (pipe through `tail`/`grep`), do not explore unrelated modules.

## Hand-back (your final message)
Return: `status` (`done` | `partial`), `files` (owned files you wrote), `apiAdditions` (extras beyond the contract, one line each), `deviations` (anything that differs from the contract/glue and why), `kernelRequests` (changes you need in files you do not own), `knownIssues`, `harness` (scene URLs with their params and what each shows), `verification` (what you ran and saw), `notes` (integration advice for the lead).

---
