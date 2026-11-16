# Chapter author guide — «هيبة الصحراء ١٨٩٩»

You write ONE file: `game/src/chapters/chN.js` (it replaces a placeholder). You are the director of that chapter: staging, pacing, camera, dialogue, the teaching of each verb. The modules (terrain, sky, weather, props, decals, camels, wolves, systems, UI, audio) are real; `actors/player.js`, `camera.js`, `npc.js`, `humanoid.js` are being finished by another engineer — call them strictly through the contract (missing methods are auto-filled with no-ops, so your beats still run).

## Read (in this order, nothing else)
1. `docs/LEAN.md` — conventions, kernel, glue.
2. This guide.
3. `docs/DESIGN.md` lines 57–71 (frozen numbers), the section of YOUR chapter in §5 (lines 73–125), lines 126–158 (flags, echoes, fail-soft).
4. `docs/SCRIPT.md` lines 9–108 (conventions, branch map) and YOUR chapter's screenplay section (Ch1 616–868 · Ch2 869–1087 · Ch3 1088–1319 · Ch4 1320–1525 · Ch5 1526–1951). All text is already in `game/src/content/story.ar.js` (`STORY.talk`, `STORY.text`, `STORY.cards`) — never write Arabic literals in code; use the keys.
5. `docs/ARCHITECTURE.md` lines 134–339 (module APIs, the director `d` API, events, chapter shape).
6. `game/src/chapters/levels.js` (places), `kit.js` (helpers), `sandbox.js` (tiny example), `game/src/dev/bot.js` (the autoplay bot).

## Shape
```js
import { LEVELS } from './levels.js';
import { at, yawTo, cast, camel, toast, prompt, hud, goal, reach, use, steadyLadder, music, pause } from './kit.js';
export default {
  id: 'ch1', index: 1, assets: 'ch1', level: LEVELS.camp, sky: 'dawn', lst: undefined,     // ch2/ch3: LEVELS.jal · ch4/ch5: LEVELS.haya
  survival: { thirst: 100, sips: 0, drain: false },      // ch2 {55, 1, true} · ch3 {100, 0, false} · ch4 {36, 1, true} · ch5 {100, 0, false}
  setup(G, L) { /* once per level load: nothing that a beat depends on — beats stage themselves */ },
  beats: [ { id: 'c1_intro', enter(G, L, ctx) { … }, async run(G, L, d) { … }, bot(G, bot) { … optional … } }, … ],
};
```
- Beat ids, order and content: DESIGN §5 for your chapter — implement EVERY beat. Numbers there are frozen.
- `enter(G, L, ctx)` runs at every beat start and must be a complete, idempotent, absolute staging of that moment: sky preset / LST / weather / fire lit states, every character and camel placed (use `cast`, `camel`), items equipped, the player mounted if the beat starts mounted, HUD visibility (`hud(G, { eye, water, strip })`), `G.sys.firasa.setAllowed(…)`, music. When `ctx.resumed` is true (chapter start, checkpoint load, retry, test jump) also teleport the player to the beat's start (`G.actors.player.teleport(x, z, yaw)`); when false the player keeps the position the previous beat ended at. Tip: write one `stage(G, L, beatId, resumed)` table-driven function and call it from every `enter`.
- `run(G, L, d)` is the sequence. Never assume an earlier beat's `run` happened in this session — read `d.flags`. Never catch `BeatAbort`; clean up through `d.own(handle)` / `d.onEnd(fn)` / `try…finally`.
- Two terrains are shared by two chapters (L2: ch2 + ch3, L3: ch4 + ch5): the level is NOT reloaded between them when played in sequence, but a chapter can also start cold from chapter select — so stage everything in `enter`.

## Tools you direct with
- Text: `await d.talk('c1_wake.greet')` (blocking block) · `d.bark('c1_wake.bark.1')` (in-play line) · `toast(G, 'c1_calm.toast.warn')` · `prompt(G, 'c1_wake.prompt.move')` / `prompt(G, null)` · `await d.card('c1')` · `await d.choice('c2_ration.ask', [{ key: 'c2_ration.choice.self', value: 'self', confirm: true }, …])` → then `d.flag('ration', value)`.
- Goals: `goal(d, 'c1_wake.obj', { at: target })` (adds the two hints from the key) · `d.objectiveDone()` · `await reach(d, 'c1_trail.obj', point, 4)`. ALWAYS give the objective an `at` (Object3D or `{x, z}`): hints, the horizon mark and the test bot depend on it.
- Verbs: `await use(G, d, { id, at, label: 'c1_well.label.pull', hold: 1.5, radius: 2.4, mountedOk: false })` · `G.sys.firasa.addClue({ id, at, type, onSeen })` · `G.sys.tracks.add({ id, points, kind, fresh, reveal })` · `await G.sys.steady.hold({ target, seconds, labelKey, breakOn, stages })` / `steadyLadder(…)` / `steady.brace` / `steady.walk` · `await G.sys.stars.find({ star })` · `await G.actors.player.mount(camel)` / `dismount()` · `G.actors.player.limit(tag, { speed, run })` · `G.sys.survival.set(…)`.
- World: `G.world.sky.setPreset(name, { duration })`, `G.world.sky.stars.setLST(h, { duration })`, `G.world.weather.storm(level, { duration })` / `gust(…)` / `setWind`, `L.fires.<id>.setLit(b)`, `G.world.props.cairn / bones / rockOutcrop / deadCamel / signalPile / flock / glow / spawn` (own the handles: `d.own` for beat lifetime, `L.own` for the level).
- Actors: `cast(G, 'mani', 'mani', point, yaw)` → npc (`goTo`, `follow`, `followTrail`, `play('sit')`, `lookAtPlayer(true)`, `ride(camel)`); `camel(G, 'wadha', point, yaw)`; `G.actors.caravan.form(…)`; `G.actors.wolves.spawnPack / wave / alphaEnter / alphaFeint / flee`. Cast ids: `mani misfer moudi fuhaid jaber thamer` (thamer = model `jaber`, `tint: 0x8a7a70`); camels `wadha` (white, the hero's), `hwar` (the calf: `scale: 0.55`), pack camels with tints `0xc9a877`, `0xb08a5a`, `0x9c7748`.
- Camera: `await d.cine([{ pos, look, dur, fov?, cut? }, …])` then `G.actors.cam.release({ duration: 1 })`; `G.actors.cam.frame(target)` at beat starts; `cam.shake`, `cam.setFov`.
- Sound: `music(G, 'music_march' | 'music_night' | 'music_haya')` (only ids in your chapter's asset group — see `assets.sources.json` groups); one-offs `G.audio.sfx('sfx_qata', { at })` (ids: sfx_camel sfx_calf sfx_howl sfx_snarl sfx_shot sfx_water sfx_torch sfx_qata sfx_thunder sfx_pulley sfx_drum sfx_gust sfx_rain). Most gameplay sounds are automatic from events.
- Waiting: `await d.wait(s)`, `await pause(G, d, s)` (shrinks in tests), `await d.until(fn, { timeout })`, `await d.near(target, r)`, `await d.first({ a: promise, b: promise })`, `d.spawn(async d2 => { … })` for watchers/loops.
- Fail-soft only (DESIGN §8): `d.failAndRestart('c5_walk.fail')` restarts the beat; thirst collapse is handled by the kernel.

## Rules
- Mobile thumbs: never require the eye and the context button at the same moment. Blocking dialogue only when safe, ≤ 6 lines; in-play lines are barks/toasts.
- Everything must still work if a module method is a no-op (guard results you depend on with timeouts, e.g. `await d.first({ done: p, t: d.wait(8) })`).
- With `G.state.fastText` (always true under `?test=1`) holds, dialogue, cards and cinematics resolve by themselves; use `pause()` for dramatic waits so the bot run stays fast.
- Every beat must be finishable by the generic bot: it warps next to the objective's `at`, then alternates holding interact (1.8 s) and the eye (1.2 s). If a beat needs anything else (riding along a route, swinging at wolves, a steady walk, looking at a star), give the beat a `bot(G, bot)` function (called every tick; return `true` to replace the default behaviour; `bot.steer(target, mag)` walks the hero; you may teleport the player or feed input with `G.input.feed`).

## Test loop (from `WS/game`)
```
node tools/build.mjs --dev --harness
node tools/shot.cjs "/harness/harness.html?m=play&test=1" .cache/out/x.png --w 960 --h 540 --quiet --until "window.__hs" \
  --print "await __hs.bot.run(N, null, { until: 'end', choices: { c2_ration: 'child' } })" --print "__hs.errors"
```
`bot.run` returns `{ steps, log: ['step:beat', …], beat, flags, errors, timedOut }`. A healthy chapter visits every beat in order, `timedOut` is false and `errors` is empty — for every branch of the flags your chapter reads or sets (pass earlier flags by setting `__hs.G.state.flags.x = …` in an `--eval` before the run; choices through `choices`, keyed by the choice id without `.choice.*`). For a screenshot at a moment: `--eval "await __hs.bot.run(N, null, { until: 'c1_trail' })" --eval "await __hs.step(40)"`. Look at 3–6 screenshots of key moments (≤ 8 image views): staging must read well on a phone (characters visible, the goal in frame, nothing buried in a dune).

## Final answer (short)
Beats implemented (ids) · simplifications you made · every module API you needed that was missing or behaved differently (exact names) · branches verified with the bot · open issues.
