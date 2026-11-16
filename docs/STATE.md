# هيبة الصحراء 1899 — حالة المشروع (STATE)

> هذا الملف مرجع الاستمرار: لو انقطعت الجلسة أو لُخّص السياق، ابدأ من هنا.

## Identifiers
- Higgsfield website_id: `cc8b3ebe-071e-49b0-acd0-3e1a73f75218`
- slug / live URL: `haybat-alsahra-1899` → https://haybat-alsahra-1899.higgsfield.app
- type: game, category: adventure
- Remote sandbox checkout (Higgsfield sandbox_exec): `/home/user/website-a19a8d83b617fc3d9ddb6d36` (branch main)
- OLD projects — DO NOT TOUCH: `haybat-alsahra` (838b8d4d-ed35-4a38-8149-75f1b10cc0b5), `haybat-safari-play` (a6a8ff3f-7dea-45b2-ba53-e97dbecdd166)
- Workspace (private): `52845b75-df2e-45cc-be1c-296e99992056`, plan pro, credits at start: 1494

## Environment facts
- Repo access is BROKERED: edit/commit only inside the remote sandbox via `sandbox_exec`; then `website_repo_access {operation: push}`; then `deploy_website`.
- Remote sandbox: node 22 + npm, python3, Playwright+Chromium, ffmpeg, ImageMagick, internet. NO bun (CI has bun). 1 CPU. stdout per call is truncated around ~20k chars. Foreground commands ≤120s; use background:true for longer.
- Local container (this one): node 22, bun 1.4.4, Playwright+Chromium. Network: npm registry / github / fonts.gstatic OK; higgsfield.ai, *.higgsfield.app, unpkg, jsdelivr BLOCKED.
- Therefore: code is authored LOCALLY, shipped to the sandbox as base64 tarball chunks inside sandbox_exec commands (≤128k chars per command). Binary assets (GLB, textures, audio) live ONLY in the sandbox checkout under `app/public/assets/`.
- Template contract: CI runs `bun run build` in `app/` = check:logic → tsc --noEmit → scripts/build.mjs (bundles src/worker.ts, copies `app/public/**` → dist/client). Static files are served before the Worker. DO NOT change app/package.json deps or bun.lock.
- `app/src/logic.js`: six pure exports (meta, setup, validateAction, applyAction, isGameOver, viewFor). No imports, no Date.now/Math.random.
- Wire protocol: client → {type:"join",playerId} | {type:"action",action} | {type:"reset"}; server → {type:"state",status,seats,you,connected,view,result,meta} | {type:"error",error}; rooms at /ws/<room> ([A-Za-z0-9_-]{1,64}); ping "__ping" → "__pong".

## Decisions
- Deploy only (direct link). Publishing to the Higgsfield community feed is the user's call — offer at the end.
- Client is a prebuilt esbuild bundle committed into `app/public/` ; sources live in `/game` (not part of CI).

## Log
- 2026-11-15: capabilities checked, skill read, website created, scaffold inspected.

## Concept image jobs (gpt_image_2_6)
| idx | asset | job_id | status |
|---|---|---|---|
| 2 | sheikh (مانع) | 10b30667-9a00-48f2-b562-9b99cfd32028 | submitted |
| 3 | herdsman (tribesman A) | e9afeb31-9435-48ba-90d2-e0278a95e79f | submitted |
| 6 | boy (فهيد) | 074aa319-016b-4e59-afba-9d01a89ea407 | submitted |
| 7 | camel standing (الوضحا) | d6748f7f-8b14-4f77-a2de-49dea4983fae | submitted |
| 1,4,5,8,9 | hero, rival rider, woman, camel kneeling, wolf | — | rate-limited (429), retry in groups of ≤4 |

## Concept images — ALL DONE (gpt_image_2_6; result PNGs have alpha+speckles unless `background:"opaque"` is passed)
Sandbox dir: /home/user/hs/concept/<name>.png (+ <name>_clean.png = flattened on white via ./clean.sh)
| name | job_id |
|---|---|
| hero (ضاري) | eecdd216-4de8-49b0-b8b8-3dc7805c080a |
| sheikh (مانع) | 10b30667-9a00-48f2-b562-9b99cfd32028 |
| herdsman (مسفر) | e9afeb31-9435-48ba-90d2-e0278a95e79f |
| rival (جابر / رجال هذال) | 448aa2dd-f600-458a-a305-8f232ae167dc |
| boy (فهيد) | 074aa319-016b-4e59-afba-9d01a89ea407 |
| woman (موضي) | 5026da35-a2e8-4bbf-b120-b8b16bafd5cc |
| camel standing (الوضحا) | d6748f7f-8b14-4f77-a2de-49dea4983fae |
| camelsit (kneeling pack camel) | 8e46a32a-3e21-43e0-ad7a-b8ebc4bdc34b |
| wolf | 7eab081e-25d3-4e73-8adf-2643ecab4f51 |
| tent | f4eed169-5d30-4aa8-b1c5-251986218a03 |
| well | ba3be503-396f-4cb2-a3f3-9c048a852b8f (opaque bg) |
| campfire set | 78e60e79-ca02-46fb-bd63-8e8cb9772acd (opaque bg) |
| acacia | 5c960992-d4de-49b1-817e-d3ef4af7096d (opaque bg) |
| waterskins tripod | 6a3f26e1-8d92-4164-921b-88600cb07c58 (opaque bg) |
CDN base for results: https://d8j0ntlcm91z4.cloudfront.net/user_3Ky375jjSHvERKsiNPrFj3jEWq2/hf_<date>_<time>_<jobid>.png (get exact URL via jobs_wait)

## 3D costs (preflighted)
- Meshy image_to_3d: static textured 30 cr; rig+1 anim 38 cr; extra clip (3d_rigging) 8 cr
- meshy_v7_image_to_3d: static 38, rig+anim 47.5
- tripo_h3_1_image_to_3d: 9 cr (static, medias role image_references)  ← default for static props
- sam_3_3d: 1 cr (static) ; hunyuan3d_v3 LowPoly 18 ; tripo_p2 34

## 3D jobs
| asset | model | job_id | status |
|---|---|---|---|
| tent (test) | tripo_h3_1_image_to_3d | f7835e59-c2f7-49ce-bbbd-95af1cb589cc | submitted |
| tent (test) | sam_3_3d | f72f9be3-b368-48ec-b0c9-30a889d486ee | submitted |

## Cleaned (white-bg) concept uploads → media_ids (use as `medias[].value`)
- hero 6fe1b804-9864-4a56-a850-556cb5d51106
- sheikh cb9ecf52-a62f-42c8-9a04-c24775c419fe
- herdsman f3173d52-390b-421a-973f-971dbc9fd745
- rival f4ddd4bc-00fd-4ed1-8ecb-f8120e6fcc18
- boy 5362f51e-c024-4853-aa19-cd8c04123330
- camel 56de25ad-d3c6-47bf-a21f-3e950c13d54f
- (woman, camelsit, wolf: alpha originals only so far → need clean upload; well/campfire/acacia/waterskins are opaque → job ids usable directly)

## 3D jobs (continued)
| asset | model | job_id | notes |
|---|---|---|---|
| tent | tripo_h3_1 | f7835e59-c2f7-49ce-bbbd-95af1cb589cc | DONE → hf_20261115_055653_f7835e59-c2f7-49ce-bbbd-95af1cb589cc.glb |
| tent | sam_3_3d | f72f9be3-… | FAILED (skip SAM) |
| hero rig+walk(613) | image_to_3d | 5880da95-c2aa-4bc9-a365-e3a1d67669c1 | submitted (poly 22k, symmetry off, a-pose, h 1.75) |
| sheikh rig+walk(613) | image_to_3d | 03f48046-d181-4d97-904b-62f29dcd546c | submitted (poly 20k, h 1.78) |
| camel standing | tripo_h3_1 | 15f3d2dc-634c-47bc-b48d-48a178a38715 | submitted (face_limit 12000) |

Sandbox tools: /home/user/hs/tools/render_glb.cjs  (NODE_PATH=/usr/local/lib/node_modules node render_glb.cjs <glb under /home/user/hs> <out.png> [w h] ["clip=0&phases=4"])
| camelsit | tripo_h3_1 | a4193113-879a-48a2-8778-0983052efb39 | submitted |
| wolf | tripo_h3_1 | 74ddf2f8-e613-4ac5-9e4b-89724af2a493 | submitted |
| well | tripo_h3_1 | 7df796df-57e1-411c-b464-7c9f6514fda9 | submitted |
| campfire | tripo_h3_1 | 30e9b80a-7a49-42e5-8190-e43e6f432d40 | submitted |
| acacia | tripo_h3_1 | 5b304f8d-405e-4b89-bc4c-960240047b93 | submitted |
| waterskins | tripo_h3_1 | b294b47c-0914-4d91-94ac-818c7effded1 | submitted |

Tripo H3.1 verdict: tent result excellent (8.4k tris, 1 material, 2048² texture, 1.2 MB, normalized to unit size, alpha-input OK) → use for ALL static props.
- woman (clean) 46aa38ab-ead0-47cf-848c-2977f3103c7e

## Workflows
- haybah-script (screenplay): run wf_a856670f-a26, task wepdl0kxh — outputs docs/GLOSSARY.md, docs/REVIEW-gameplay.md, docs/SCRIPT.md, game/src/content/story.ar.js
  script: /root/.claude/projects/-home-user/57ae3424-39f9-5fff-9054-38bf826628b2/workflows/scripts/haybah-script-wf_a856670f-a26.js

## Local dev facts (updated)
- Generation result CDN d8j0ntlcm91z4.cloudfront.net IS reachable locally → raw GLB/PNG/audio can be downloaded locally (game/.cache/raw). Upload CDN d2ol7oe51mr4n9 is NOT reachable locally.
- Local has ffmpeg, ImageMagick, PIL, sharp, gltf-transform. Local viewer: `cd game && node tools/render-glb.cjs <glb> <out.png> [w h] ["clip=0&phases=4&bones=1"]`.
- All 8 static Tripo models downloaded & look good (see game/assets.sources.json). Orientation: camel faces +Z, wolf faces +X (needs yaw fix), all normalized to unit max-dimension, centered.

## Rigged characters (Meshy image_to_3d, 38 cr each, walk clip 613 included)
| id | job_id | status |
|---|---|---|
| dhari (hero) | 5880da95-c2aa-4bc9-a365-e3a1d67669c1 | DONE ✔ excellent. URL: hf_20261115_060020_5880da95-c2aa-4bc9-a365-e3a1d67669c1.glb (5.5MB, 22.6k tris, 24 bones, clip "Armature|Casual_Walk_inplace|baselayer" 4.2s, height 1.75, faces +Z, feet y=0) |
| mani (sheikh) | 03f48046-d181-4d97-904b-62f29dcd546c | in progress |
| misfer (herdsman) | 605cae2a-f4c7-45e2-84cc-461ad5604d59 | submitted |
| jaber/rival | 75795bbd-5ccf-45fa-bed7-4ee0b5a53801 | submitted |
| moudi (woman) | e153edd4-10cc-4813-98e8-734e007abba4 | submitted |
| fuhaid (boy) | 37915115-2e40-4d45-9e61-92574bec8660 | submitted |
Meshy skeleton bone names: Hips, Spine02, Spine01, Spine, neck, Head, head_end, headfront, Left/Right Shoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot, ToeBase (24 bones, no fingers).
Extra clips: model `3d_rigging` with model_url=<rigged GLB result URL>, enable_animation:true, animation_action_id → 8 cr each; merge by node name.
Sandbox: animation preview GIF montage job → /home/user/hs/anim/sheetA.jpg, sheetB.jpg (log /home/user/.bg/b38c9bac.log)
- mani (sheikh) DONE ✔ excellent: hf_20261115_060020_03f48046-d181-4d97-904b-62f29dcd546c.glb (20.3k tris, same 24-bone skeleton)

## Extra clip plan (3d_rigging, 8 cr each; model_url = the character's rigged GLB URL)
logical clip → Meshy action id
- dhari: idle 244, run 14, sit 33, kneel 365, drink 342, torch 337, swing 4, call 29, steady 2
- mani: idle 244, talk 310, sit 33, lie 267, drink 342
- misfer: idle 244, talk 56, run 14
- jaber(rival): idle 244, talk 310, aim 585, lie 266, sit 33
- moudi: idle 244
- fuhaid: idle 244, run 14, sit 33, wave 291
Clip jobs:
| char | clip | action | job_id | status |
|---|---|---|---|---|
| dhari | idle | 244 | 711dddc9-a0cb-43fc-8ae0-59f6bce8a9cf | submitted (TEST merge first) |
| dhari | run | 14 | 0fe0659f-001c-4c2d-b3f7-9c0c2079c5ad | submitted (TEST merge first) |

Asset pipeline: `cd game && node tools/assets.mjs [ids] [--force]` → app/public/assets/{models,tex,audio}/ + manifest.json. 9 models currently = 2.03 MB (dhari 792 KB).
- Clip merge VERIFIED (dhari idle+run merged by node name → correct). moudi ✔ (hf_20261115_060812_e153edd4-10cc-4813-98e8-734e007abba4.glb), fuhaid ✔ (hf_20261115_060813_37915115-2e40-4d45-9e61-92574bec8660.glb). All registered in game/assets.sources.json.
- dhari idle clip URL: hf_20261115_061108_711dddc9-a0cb-43fc-8ae0-59f6bce8a9cf.glb ; run: hf_20261115_061110_0fe0659f-001c-4c2d-b3f7-9c0c2079c5ad.glb (in sources.json)
| dhari | sit | 33 | 146ae3ab-cf36-41e3-8c0e-5b51917a6ee8 | submitted |
| dhari | kneel | 365 | 7b0de4c9-a491-4933-800b-5abff9a5f72e | submitted |
| dhari | drink | 342 | 5d0ae025-db3c-49c2-9aa1-aeb3f2dd756d | submitted |
| dhari | torch | 337 | 48beb452-492e-41a0-a6aa-4957251b86d8 | submitted |
| dhari | swing | 4 | 80d7d5bd-74a1-44e6-94fc-838fffc14594 | submitted |
| dhari | call | 29 | 5a0d8eb4-fe2c-414e-aa12-f9af5966cb96 | submitted |
| dhari | steady | 2 | 3231fd6a-5383-45ca-a6a3-ff851eba8628 | submitted |
| mani | idle | 244 | 08787b65-522b-4fe3-8817-0bc8224fd702 | submitted |
| mani | talk | 310 | 42e62bce-43b5-41c9-b677-3dd3b59d2da3 | submitted |
| mani | sit | 33 | c5a546f6-2c4a-4f43-8a0f-ade1c6c90f82 | submitted |
| mani | lie | 267 | f84f7d0b-bc22-4a7e-9f02-b3950593a909 | submitted |
| mani | drink | 342 | 342b02f6-ab89-4f6f-bbe1-ebbee638f42d | submitted |
| moudi | idle | 244 | ce73438f-c093-430e-9a73-4935d6b8ee5b | submitted |
| fuhaid | idle | 244 | 48fff620-755d-40a5-9702-44e5e734203f | submitted |
| fuhaid | run | 14 | 81d73240-4d99-4010-9d7d-013de8d32e25 | submitted |
| fuhaid | sit | 33 | bcc806bf-05b9-4274-b5ef-f78b70034eb5 | submitted |
| fuhaid | wave | 291 | c3c6b064-b7d3-49a9-98c6-4e6e491b9792 | submitted |
TODO after misfer/jaber finish: misfer idle 244, talk 56, run 14 ; jaber idle 244, talk 310, aim 585, lie 266, sit 33
- misfer ✔ hf_20261115_060810_605cae2a-f4c7-45e2-84cc-461ad5604d59.glb ; jaber ✔ hf_20261115_060811_75795bbd-5ccf-45fa-bed7-4ee0b5a53801.glb ; dhari clips sit/kneel/drink/torch/swing/call/steady ✔ — all in game/assets.sources.json
- KERNEL boots (harness `kernel`), sandbox chapter runs end-to-end through the test API. Build: `cd game && node tools/build.mjs --dev --harness`; smoke: `node tools/shot.cjs "/harness/harness.html?m=kernel&test=1" out.png --until "window.__harness&&window.__harness.ready" --eval "await __hs.step(60)" --print "__hs.state()"`.
| misfer | idle | 244 | 1e802468-73d4-45cb-8482-95f779f620ab | submitted |
| misfer | talk | 56 | 9eecbb4c-3cf6-42a7-9377-ee9909975935 | submitted |
| misfer | run | 14 | 6d004abb-0272-4195-acb3-5dd70d42c7af | submitted |
| jaber | idle | 244 | f65d0abb-5e98-463c-9f41-65885451c7f8 | submitted |
| jaber | talk | 310 | 49a64852-b91d-4154-ba17-707b1a4faf00 | submitted |
| jaber | aim | 585 | ea767ba4-300a-49f9-bb69-f1e2d46a37a7 | submitted |
| jaber | lie | 266 | ddf2ec12-0932-4779-9ae8-05b8797c629d | submitted |
| jaber | sit | 33 | e46397be-1844-4119-98b6-bc6397d66c24 | submitted |
(all 6 characters + all hero clips verified visually ✔)

## Audio jobs (batch 1, submitted just before the usage limit)
| id | model | job_id |
|---|---|---|
| music_march (40s) | sonilo_music | 3508015c-1d29-4d50-be79-a45ba18f10a4 |
| music_night (40s) | sonilo_music | da597c72-86f3-46e2-ad24-73bcb2b2d887 |
| music_haya (40s) | sonilo_music | 106c11e0-9077-4e85-a8cf-a11a13b9543b |
| sfx_camel (3s) | mirelo | b376d5ec-6e44-41f9-83d1-cb1d936dcec2 |
| sfx_snarl (2s) | mirelo | cad14df3-d337-4d6d-af19-c6779cfb79b6 |
| sfx_shot (3s) | mirelo | c4c0cbfb-97a1-40e4-92fa-7733f540fed3 |
| sfx_torch (2s) | mirelo | 8891806f-0fab-4c72-b8d0-1f0f2507304a |
| sfx_qata (4s) | mirelo | ce74e8e2-2f33-48c5-bf2e-c6701e33ce92 |
| sfx_thunder (5s) | mirelo | a9e58987-fba0-4960-af91-367d074b403f |
| sfx_pulley (3s) | mirelo | 9b70a64b-1eb8-4717-8846-866a23a86d99 |
| sfx_howl, sfx_water | — | rate-limited, RESUBMIT |
| dhari clip `pull` (276) | 3d_rigging | 56f2bbf2-5f93-4299-896a-7d5bfe1f5095 |

## Usage-limit interruption (5-hour limit hit ~06:40–07:10 UTC)
- arch review workflow wf_a1837cdf-4cf: 2/4 reviewers done (webgl-perf, gameplay-coverage; 40 findings in journal), async-state + mobile-ux + synthesize FAILED → resume.
- script workflow wf_a856670f-a26: gameplay critique done; GLOSSARY.md written (agent failed before returning); writer/reviews/revise FAILED → resume.
- DESIGN.md is v2 (accepted gameplay review items). ARCHITECTURE.md still v1 → must be updated for DESIGN v2 + arch review.

## 2026-11-15 08:55 UTC — resumed after usage limit
- ALL character clips done & merged (dhari 11 clips, mani 6, misfer 4, jaber 6, moudi 2, fuhaid 5). Audio batch 1 done (3 music 40s + 7 sfx). Assets total 7.83 MB. Everything is in game/assets.sources.json → `node tools/assets.mjs`.
- SFX batch 2 jobs: howl f539c0fe-0684-4e8b-adc4-f4d435694455 · water e9bea3d1-a96c-47f3-b6b8-0e12620b0969 · calf 62fee302-98b3-4993-9bdf-03f4fb4b47de · drum 5c9fdc22-e5f2-457e-b6ea-411e14eed548 · gust 6edbd57b-fda7-440f-865c-bb2b38d5a40d · rain 8e434054-f363-4e00-b0c3-d87fbdb79958
- Rival renamed: الشيخ ثامر (id `thamer`), groups «ربع مانع» / «ربع ثامر» (glossary flagged «هذال» as a real sheikhly house).
- Screenplay workflow relaunched: run wf_4d7789f2-3ab (task w5tmmg2dv) → game/src/content/story.ar.js + docs/SCRIPT.md
- Arch review: 40 findings from 2 reviewers saved in docs/.arch-findings.json and split per module in docs/arch-findings/*.md (advisory). ARCHITECTURE v2 written by lead.
- Token budget lesson: one 5-hour window ≈ limited; keep agents focused, make every agent resumable (check existing files first).

## 2026-11-15 ~09:50 UTC — Wave 1 launched (7 engineers, private workspaces)
- SFX batch 2 collected & registered (16 audio files, assets 8.31 MB).
- Kernel additions: `game/src/dev/stubfill.js` (fills missing contract APIs with marked no-ops), `game/harness/api.js` (contract conformance check: `?m=api&test=1` → `__harness.api.missing`), baseline terrain = analytic dunes, sky stub uniforms renamed to contract names, `build.mjs --tag <name>` (private harness builds).
- Briefs: `docs/briefs/common.md` + `<module>.md` → concatenated into `/home/user/ws/<name>/BRIEF.md`. GLUE CONTRACT lives in docs/briefs/common.md (binding additions to ARCHITECTURE: objectives.current/hint/marks, interact.verb, steady.activeRequest/tension, stars.active, cam.magnet/setFov, survival.drinkProgress, riding glue camel.saddle/ridden + actor.sitOn, player:step, wind convention, props.fires, settings:changed).
- Workspaces: /home/user/ws/{terrain,sky,props,quadruped,people,ui,systems} — private copies (node_modules + assets symlinked). INTEGRATION = copy each agent's OWNED files back into the main tree, then run `api` + `kernel` scenes.
  - terrain: world/terrain.js (+terrain-gen.js), harness/terrain.js, tests/unit/terrain.test.js
  - sky: world/sky.js, world/weather.js, world/stars-data.js, harness/sky.js, harness/weather.js, tests/unit/sky.test.js
  - props: world/props.js (+props-*.js), world/decals.js, harness/props.js, harness/decals.js
  - quadruped: actors/quadruped.js, camels.js, caravan.js, wolves.js, harness/quadruped.js, caravan.js, wolves.js
  - people: actors/humanoid.js, player.js, camera.js, npc.js, harness/people.js, harness/camera.js
  - ui: src/ui/*, harness/ui.js
  - systems: systems/{interact,firasa,steady,survival,objectives,stars,tracks}.js, harness/systems.js, tests/unit/systems.test.js
- Workflow runs (resume with Workflow({scriptPath, resumeFromRunId}); agents are resumable via WS/NOTES.md):
  - world (terrain, sky): wf_a5b0c6c7-b02 · task wtsq8thai
  - things (props, quadruped): wf_2eb21c41-61f · task wv5qc6nww
  - people (people, ui): wf_d7c7a80a-123 · task wi6fjv8du
  - systems: wf_4c168c2c-787 · task wgskjwt73
  scripts under /root/.claude/projects/-home-user/57ae3424-39f9-5fff-9054-38bf826628b2/workflows/scripts/haybah-w1-*.js
- LEAD does meanwhile: audio/audio.js, app/src/logic.js + core/net.js, chapters/levels.js, asset groups, then Wave 2 (chapters) after the screenplay lands.
- TRANSFER NOTE: local → sandbox has NO byte channel (upload CDN blocked; env allowlist = d8j0ntlcm91z4.cloudfront.net + an old Render host). Code must be re-typed into the sandbox via sandbox_exec heredocs (verify with sha256). Plan: one bulk transfer by sub-agents when the game is integrated, small patches after.

## 2026-11-15 ~15:00 UTC — LEAN PIVOT (3rd usage window) — READ THIS FIRST
- The 7 heavy "Wave 1" agents + the screenplay workflow died on the 5-hour limit (09:45). The screenplay WAS written before that: `game/src/content/story.ar.js` (16 cards, 114 talk blocks, 282 text keys) + `docs/SCRIPT.md` (index §2, screenplay §3 with per-chapter line ranges in docs/CHAPTERS.md).
- New method: small focused agents on **model sonnet** with short specs (`docs/LEAN.md` + SPEC.md in `/home/user/lw/<name>` private copies), merged by copying owned files. Lead (main loop) writes the hard parts directly. /home/user/ws/* (old heavy workspaces) are obsolete.
- DONE & merged in main: sky.js (real stars via stars-data.js), terrain.js (dunes + Lambert onBeforeCompile shader), quadruped.js (VERTEX-SHADER leg rig: gait phase, knee flex, kneel squash), props.js, decals.js, weather.js, camels.js, caravan.js, wolves.js, systems/* (all 7), ui/* (hud/touch/dialogue/cards/menus), audio.js, levels.js (L1 camp, L2 jal, L3 haya with POIs), kit.js, dev/bot.js (autoplay: `await __hs.bot.run(N, null, {until:'end', choices:{…}})` in scene `?m=play&test=1`), placeholder ch1..ch5, asset groups common/ch1..ch5.
- RUNNING (sonnet agents, private copies): people (humanoid/player/camera/npc → /home/user/lw/people), chapters ch1..ch5 (→ /home/user/lw/chN/game/src/chapters/chN.js; guide docs/CHAPTERS.md). Merge = copy owned files into main, rebuild, run `api` scene + bot runs.
- Scope cuts: no journey ledger / room sync (scaffold server left untouched: tic-tac-toe logic.js stays, unused); core/net.js stays a stub.

### DEPLOY PIPELINE (works, verified)
User approved two hosts in the cloud environment allowlist: `haybat-alsahra-1899.higgsfield.app` (live game: local curl/Playwright can test it) and `upload.higgsfield.ai` (Higgsfield presigned uploads).
1. Local: `cd game && node tools/build.mjs` (prod bundle → app/public/game.js|css) then from repo root:
   `zip -r -q <scratchpad>/haybah-build.zip app/public docs game -x 'game/node_modules/*' 'game/.cache/*' 'docs/arch-findings/*' 'docs/.arch-findings.json'`
2. MCP `media_upload {filename:"haybah-build.zip"}` → presigned `upload_url` + `media_id` + permanent `url` (d2ol7oe51mr4n9.cloudfront.net/…zip).
3. Local: save the upload_url into a file, `curl -X PUT -H "Content-Type: application/octet-stream" --data-binary @zip "$(cat urlfile)"` → 200.
4. MCP `media_confirm {type:"file", media_id}`.
5. MCP `sandbox_exec`: `curl -sSf -o /home/user/xfer/build.zip <permanent url>`; in R=/home/user/website-a19a8d83b617fc3d9ddb6d36: `rm -rf app/public game/src game/harness game/tools game/tests docs; unzip -q -o build.zip -d $R; git add -A; git commit` (with the attribution lines).
6. MCP `website_repo_access {operation:"push"}` → MCP `deploy_website` (times out at 60 s; poll `website_status` until production.status = deployed) → test `https://haybat-alsahra-1899.higgsfield.app`.
- The classifier denies: minting secret tokens / custom upload endpoints, and contacting hosts that are not on the allowlist. Do not retry those.
- Sandbox checkout also has `game/node_modules` + assets built there earlier (assets are now simply shipped inside the zip from local `app/public/assets`).

## 2026-11-15 ~16:30 UTC — FULL GAME MERGED, deploy #3 triggered
- All five chapters merged (ch1.js, ch2.js + ch2-lib.js, ch3.js, ch4.js + ch4-fx.js, ch5.js; 2,987 lines) + people modules. `api` scene: missing = []. Whole story in ONE session: `await __hs.bot.runAll({choices:{c2_ration:'child', c4_stranger:true, 'c5_words.r1':'a','c5_words.r2':'a'}})` → 33 beats, mode 'end', errors [], ~20k steps (both choice branches pass). Peak ≈ 236–260k tris, 49 draw calls.
- Kernel fixes after merge: `pointOf()` uses WORLD position for child Object3Ds; `objectives.current.at`; beat option `startBlack: true` (starts in mode 'cine' with no automatic fade-in; used by c1_intro); UI z-order (card 65, menu 80 above fade 60); idle stick hidden when touch is off; default toasts for `player:bounds` (cN.bounds) and `survival:level` (thirst.toast.N); production bundle has NO dev/test API (`__DEV__` guard) — the platform's code scan rejects `new Function`.
- Tools: `tools/pack.sh <zip>` (prod build + zip incl. app/src/app-meta.json), `tools/smoke.cjs <prefix> [--portrait] [--seconds N]` (prod bundle on an emulated iPhone with real touch taps), `tools/live.cjs` (live URL — NOT usable: the live site answers 401 to anonymous requests and redirects browsers to auth.higgsfield.app, i.e. visitors must be signed in to Higgsfield; only the user can open it).
- Cover: generated job 3513b288-df61-4124-829c-5ccd02b68b37 → app/public/cover.jpg (title composed locally), favicon.png, og tags, app/src/app-meta.json.
- Deploy #3: zip sha 0f8ccd38f5fef40e → sandbox commit 8e33402 "Complete story…" → pushed → deploy_website called (poll website_status).
- NEXT: verify deploy status; QA real-time (non-fastText) behaviour of key beats, per-chapter screenshots, mobile portrait-rotated check, night ground tint, wolf silhouettes; then redeploy. Offer community-feed publishing to the user at the end (their choice).

## 2026-11-15 ~17:15 UTC — real-time QA merged, deploy #4 triggered
- Five QA engineers (sonnet) ran every chapter in REAL TIME (`bot.run(N, null, {realtime:true})`) and fixed pacing/staging/fail-soft; merged with `tools/qamerge.sh qaN` (3-way against /home/user/lw/qa-base-src). Module patches merged: ui/cards.js (tap anywhere skips cards/cinematics), ui/styles.css (ending panel fits 390 px), actors/player.js (knockdown slide vector, `player.pose(name)` held pose), actors/wolves.js (alphaEnter(speed)), systems/survival.js.
- Whole story in real time in ONE session: `bot.runAll({realtime:true, …})` → 34 beats, 15.2 game-minutes (bot warps), mode 'end', errors []. Fast mode green too. Medium tier peak ≈ 234k tris / 48 calls (lod.js now scales `near` by quality: 0.5 / 0.7 / 1).
- Deploy #4: zip sha 5d7e75f89f36233c → sandbox commit 218f595 → pushed → deploy_website called.
- Known weak spots reported by QA (not fixed): wolf waves do not speed up (wolves.wave timing ≈ 5.3 s per lunge); alpha wolf reads dark on dark; c5_verdict has no music; trail nearly invisible without the eye beyond 8 m (by design); the camel texture is tan, not white; giver crosses thirst 30 in c2_storm rather than c2_return.

## 2026-11-15 ~17:40 UTC — deploy #5 triggered (latest)
- Changes since #4: الوضحا whitened (camels.js: material colour > 1 for id 'wadha'), cooler/darker night key + ambient (sky.js), wolf wave pre-reveal shortens with `gap` (wolves.js). Fast regression on medium tier: 35 beats, errors [], peak 206k tris / 48 calls.
- zip sha 6b626ff3c3d6fe0e → sandbox commit f8cb410 → pushed → deploy_website called (status was still 'queued' for #4 at that time; poll `website_status` until production.status = 'deployed').
- After 'deployed': tell the user (Arabic) that the link carries the QA'd build; remind: needs Higgsfield sign-in; publishing to the community feed is their choice (publish_website) — not done.

## 2026-11-15 16:37 UTC — LIVE: deploy confirmed
- `website_status` → production.status = deployed, error null, after the confirmation deploy of commit f8cb410 (zip sha 6b626ff3c3d6fe0e). Live URL: https://haybat-alsahra-1899.higgsfield.app (visitors must be signed in to Higgsfield; not listed in the community feed — publishing is the user's choice).
- Credits: 921 of 1,494 left (checked with `balance` after the cover image).
- If work continues: ideas not done — journey ledger/room sync (scaffold tic-tac-toe logic.js still in app/src, unused), music under c5_words/stare/verdict, rotate-hint overlapping the title subtitle in upright mode, real-device test feedback from the user.

## 2026-11-15 ~19:40 UTC — AUDIT ROUND 1 (user uploaded an audit register)
- The user's audit register (Arabic, 39 entries) is stored PRIVATELY at `.audit/AUDIT.md` (not in docs/ — it is not shipped; it mentions the user's time zone). Items: F01–F29, V01–V05, D01, C01–C02, L01 (product limit: local save only), X01 (voice dialogue — deferred by the user, do not do).
- Local git baseline commit `65c0fc0` = deployed f8cb410 (before fixes). Merge each fix workspace with `game/tools/fixmerge.sh <ws>` (3-way against 65c0fc0), then run every `harness/accept_*.js` / `tools/accept_*.cjs` check + regressions.
- Fix workspaces (/home/user/lw/fx_*; brief docs/FIXES.md + group section): fx_state (F01 F15 F16 F17 F19 F24 C02, sonnet) · fx_input (F11 F12 F13 F14 F26 F27, sonnet) · fx_combat (F02 F03 F06 F20 F22 F29 D01, opus) · fx_water (F07 F08 F09 F10 F23, sonnet) · fx_chars (F04 F18 F21 V01 V03 V02 + regenerated assets in its REAL app/public/assets copy, opus) · fx_camera (F05 V05 V04, sonnet). Workflows: wf_8affba19-c93 (combat+state), wf_88da11eb-d95 (chars+input), wf_174fce2f-46c (water+camera).
- Lead did C01 (audio reconcile incl. silence), F25 (one verb «لوّح»), F28 (Thamer recognises Dhari by the brand on his camel in branch r1.c) in main; check: `harness/accept_lead.js` (all pass; C01 proven: unfixed 0.114 → fixed 0.000).
- Sandbox apply.sh attribution updated to "Claude Opus 5.5" (model switched by the user).

## 2026-11-15 ~23:00 UTC — audit round 1: all groups merged + independent review fixed
- All six groups merged with tools/fixmerge.sh (4 trivial conflicts resolved by keeping both sides). Every group's check passes on the merged build (verify: `game/tools/verify_checks.sh`, needs a DEV build).
- Independent review (wf_3e0e667b-a14, 3 lenses + adversarial verify): 7 findings, all fixed by the lead: stand-ins cleared per level + quiet rebuild with fade (F1), chapter-pick confirm (F2), no cached stand-in measurement (F3), knockdown keeps a rider seated (G1), stronger event hint survives a poke (I1), pause answers click/keyboard once per tap (I2), vertical swipe from a slider scrolls in the rotated stage (I3). Check: harness/accept_review.js.
- Triangle budget on the phone tier restored: humanoid LOD2 (Permissive, ≈15 %) sidecars `models/<id>.lod2.bin` (tools/assets.mjs writes them; core/assets.js `lodGeometry(id, 2)`), used by npc crowds beyond 40 m (×0.7 on medium); terrain near field drawn as 16 frustum-culled chunks sharing one vertex buffer. Medium-tier cold-start peaks: c4_collapse 244k, c5_staff 198k, c5_scout 165k (were 257/234/197k).
- Hint display bug found by the combat group fixed in ui/hud.js (event-only hints were never shown).
