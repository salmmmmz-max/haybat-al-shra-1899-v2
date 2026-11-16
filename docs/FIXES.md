# Fix brief — «هيبة الصحراء ١٨٩٩», audit round 1

You fix a set of audit findings in a 3D third-person story game for mobile browsers (three.js r170, esbuild). An independent auditor tested the deployed build (commit f8cb410 = your copy) and wrote `docs/AUDIT.md` (Arabic). Every item there has: what was observed, how to reproduce it, the suspected cause, a suggested fix direction, an ACCEPTANCE CRITERION and the limits of the evidence. Your items are listed at the end of this file.

## Workspace
`/home/user/lw/<group>` — a private copy. Run everything from `<ws>/game`. Other engineers fix other items in parallel in their own copies; the lead merges all groups with a 3-way merge against the audited version.

## Read (only these)
1. `docs/LEAN.md` — conventions, kernel, glue, dev loop (build, `tools/shot.cjs`, harness scenes, `__hs` test API).
2. `docs/AUDIT.md` — skim "كيف تُقرأ النتيجة"; read YOUR items in full and the bullets of "تصحيحات يجب الحفاظ عليها" that concern them.
3. The code each item names (line numbers refer to your copy). `docs/DESIGN.md` §4 (frozen numbers) when an item touches gameplay rules.
Do not read unrelated modules or other documentation.

## Method, per item
1. **Reproduce first** with a script and record the numbers. Use real time where it matters: `__hs.G.state.fastText = false`, or `await __hs.bot.run(N, beat, { realtime: true, … })`; for touch/mouse items use Playwright trusted input (`page.touchscreen`, `page.mouse`, or CDP `Input.dispatchTouchEvent`) — see `tools/smoke.cjs` for a phone context.
2. **Fix the root cause** along the suggested direction (if you find a better root cause, fix that and say why). Keep the change as small and local as the problem allows.
3. **Prove the acceptance criterion with an automated check left in the repo**, so the lead can re-run it after merging:
   - an in-page check: `game/harness/accept_<group>.js` — `export const assets = […]; export async function run(G, params) { return { run: async () => ({ items: { F01: { pass: true, detail: '…' }, … } }) }; }` run by
     `node tools/shot.cjs "/harness/harness.html?m=accept_<group>&test=1" --quiet --until "window.__harness && (window.__harness.ready || window.__harness.error)" --print "await window.__harness.api.run()"`
   - and/or a Playwright script `game/tools/accept_<group>.cjs` (reloads, storage-failure injection, trusted pointer input, the real page `/?…`). It must print one JSON line `{ items: {…} }` and exit 0 only if all pass.
   Each check must be deterministic and finish in a few minutes.
4. Re-run the neighbours your change could affect.

## Before you finish
- `node tools/build.mjs --dev --harness` clean; scene `api` → `window.__harness.api.missing` is `[]`.
- Fast whole story on scene `play`: `await __hs.bot.runAll({ choices: { c2_ration: 'child', c4_stranger: true } })` → `mode: 'end'`, `errors: []`; plus a real-time run (`bot.run(N, null, { until: 'end', realtime: true, maxSteps: 150000 })`) of every chapter you touched.
- `node tools/build.mjs` (production): the bundle must contain no `new Function` and no `eval(` (the platform's code scan rejects them).

## Ownership and rules
- You own the files listed for your group. You MAY patch another file minimally when the root cause lives there — list each such change exactly (file, function, what, why) in your final answer. Never reformat, rename or reorder code you do not change (the merge depends on small hunks). New UI strings go into `game/src/ui/strings.ui.ar.js` inside a block commented `// --- <group> ---`.
- LEAN.md conventions apply (sim time, scope-owned promises, no per-frame allocation, rendering rules, Arabic text only in string files, mobile first). No new npm packages. Voice dialogue is out of scope (deferred by the user).
- Work may be interrupted: keep `<ws>/NOTES.md` current (per item: reproduced? cause, fix, check); if it exists when you start, you are RESUMING.

## Final answer (short, plain text)
Per item: fixed / partial / not reproduced / declined — evidence before → after (numbers), and the command that runs its check. Files changed (owned; others with exact description). Anything the lead must know for the merge.
