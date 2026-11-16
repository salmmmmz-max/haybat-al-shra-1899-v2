# Real-time QA of one chapter — «هيبة الصحراء ١٨٩٩»

The whole story already completes with the autoplay bot in FAST mode (`fastText`: dialogue, holds and cinematics resolve instantly). Your job: make YOUR chapter correct and pleasant in REAL TIME, the way a person on a phone plays it — and fix what you find.

## Read (only these)
1. `docs/LEAN.md` (conventions, kernel, glue) and `docs/CHAPTERS.md` (chapter author guide, tools, test loop).
2. Your chapter's section of `docs/DESIGN.md` §5 (lines 73–125) + lines 57–71 (frozen numbers) + 151–158 (fail-soft).
3. Your chapter file(s) `game/src/chapters/chN*.js`, `kit.js`, `levels.js`, `game/src/dev/bot.js`.
Open module sources only when you chase a concrete bug.

## Real-time run
```
node tools/build.mjs --dev --harness
node tools/shot.cjs "/harness/harness.html?m=play&test=1" .cache/out/x.png --w 844 --h 390 --quiet --until "window.__hs" \
  --print "await __hs.bot.run(N, null, { until: 'end', realtime: true, maxSteps: 150000, choices: { … } })" --print "__hs.errors"
```
`realtime: true` turns `fastText` OFF: dialogue is typed and advanced by taps (the bot taps `skip`), choices are picked after 1.4 s through `choices`, cards/cinematics take their real time, الثبات needs the button really held and the camera really on target, gusts need real bracing, the wolves need real swings, stars need a real gaze, the camel really walks its route. The generic bot warps next to the objective's `at`, keeps the context button down while a hold is in progress, otherwise alternates tap / eye. Beat `bot(G, bot)` hooks written for fast mode may be too naive for real time — improve them so they behave like a competent player (steer, aim, hold, swing) WITHOUT cheating the mechanic under test (no direct calls into systems to force a result; warps are fine for long walks/rides).
One chapter takes 4–6 minutes of game time ≈ 15–25 k steps; start a run from a later beat with `bot.run(N, 'beat_id', …)`.

## What to do
1. Run the chapter in real time, for each flag branch that changes it. Every stall, timeout, error, or nonsense (a prompt that never clears, an objective without a target, a hold that cannot be completed, a character left in the wrong place or pose, the camera inside a dune or a person, the player stuck in `scripted` mode, HUD pieces that should be hidden/shown, wrong music, thirst numbers far from DESIGN §4) → find the cause and FIX it.
2. Trigger at least one fail-soft path in real time (a flinch, a missed gust, a missed wolf, thirst) and make sure the retry is fair and clean.
3. Look at up to 10 screenshots of real-time moments (844×390, the phone) — staging, camera, readability of prompts/toasts/dialogue over the scene, night readability. Improve what is weak (positions, camera shots, timing, missing barks/prompts from the screenplay).
4. Keep the FAST run green too (`realtime` omitted) — both must end with `timedOut: false`, `errors: []`.

## Ownership
You own your chapter file(s) (`game/src/chapters/chN*.js`). If a real bug is in another module (player, camera, npc, systems, ui, world…) you MAY patch it minimally in your copy so you can go on — and you MUST list every such change at the end (file, function, exact change, why): the lead merges those by hand, so keep them few and surgical. Do not refactor.

## Final answer (short)
Real-time result per branch (steps, timedOut, errors) · bugs found and fixed in your chapter · module patches (file/function/change/why) · what you improved · what remains weak.
