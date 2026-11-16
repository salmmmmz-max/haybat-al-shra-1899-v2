# هيبة الصحراء — ١٨٩٩ · وثيقة التصميم (DESIGN v2)

> مصدر الحقيقة للتصميم. أي تعديل على القصة أو الأرقام يُكتب هنا أولًا.
> Code/agents: read this whole file before touching chapters or systems. v2 folds in the accepted items of `docs/REVIEW-gameplay.md` (ids like S1, F1, C2-4 refer to it).

## 1. Experience formula & pillars

**اللاعب يحس بثِقل الأمانة وهيبة الصحراء، لأن اللعبة تطلب منه دائمًا أن يقرأ الأرض والسماء بعينيه ويقرّر لربعه — والماء ينقص.**

Pillars (each must reinforce the others):
1. **الفراسة** — reading signs (tracks, plants, birds, stars). The core verb.
2. **الأمانة** — the tribe's water. ONE resource for the whole game; every sip is a decision.
3. **الثبات / الهيبة** — composure under pressure: stand firm, don't flinch. The climax verb.
4. **الجد والحفيد** — every lesson is delivered by the Sheikh; by the end the grandson reads alone.

Profile: real-time 3D, one hero, solo, authored story (5 chapters, ~27 min), win by finishing; soft fails only (never a dead end). Engagement: story + discovery.
Platforms: **mobile touch first** (iOS Safari, Android Chrome), desktop keyboard+mouse, basic gamepad. Language: Arabic (RTL), all strings external.
**Presentation is landscape.** When the browser viewport is portrait (e.g. iPhone rotation lock), the whole stage is drawn rotated 90° so the player simply holds the phone sideways; a short «أدِر الجوال» hint shows until the first input. There is no portrait layout.

## 2. Setting & cast

الربع الخالي («الرملة»), end of summer **1899م / 1317هـ**. A drought year. A small فريق known simply as **ربع مانع** (Mani's folk): 4 tents, ~12 people, ~10 camels. Their well is dying. The rivals are **ربع ثامر**. No real tribe, lineage, house or place name is ever used — people are named by given name only and groups as «ربع فلان» (never «آل…» / «ابن…»).

| id | الاسم | who | look (matches the generated models) |
|---|---|---|---|
| `dhari` | **ضاري** | player, 19, the grandson | white ghutra + black iqal, two braids, off-white thobe hitched, cartridge belt + silver khanjar, indigo sash with red tassels |
| `mani` | **الشيخ مانع** | grandfather, ~70, legendary guide (دليلة) — secretly losing his sight | white beard, gold-black iqal مقصّب, off-white thobe, dark brown bisht with gold trim |
| `misfer` | **مسفر** | herdsman, 40, loyal, blunt | beige ghutra, sadu shawl |
| `moudi` | **موضي** | Dhari's mother | black thobe, burqa, silver bracelets |
| `fuhaid` | **فهيد** | Dhari's little brother, 8 | short thobe, skullcap, barefoot |
| `jaber` | **جابر** | man of ربع ثامر found dying of thirst (ch4) | indigo thobe, red-white turban, crossed bandoliers |
| `thamer` | **الشيخ ثامر** | rival sheikh holding the well (ch5) | the `jaber` model, darker tint, older |
| — | **الوضحا** | Dhari's white riding camel | cream-white, sadu saddle blanket, wooden shadad |
| — | **الحوار** | الوضحا's calf, فهيد's pet | the camel model at 0.55 scale |
| — | **الأمعط** | scarred alpha wolf (ch3) | wolf model ×1.25, darker |

Emotional spine: the Sheikh navigates from memory and through Dhari's eyes ("أنت عيوني"). He hides his blindness to keep the tribe's hope. The game ends when he hands Dhari the guide's staff: *"الهيبة ما هي بالصوت العالي ولا بالبارود… الهيبة إنك تثبت يوم يهتزّ غيرك، وتعطي يوم يمسك غيرك."*

Dialogue register: natural Najdi/Bedouin dialect for speech (short, dignified, proverbial — never caricature); فصحى for narration cards and UI. Solo hints in ch1–ch3 are remembered lines («قال جدّي…»); in ch4–ch5 they are Dhari's own voice (H2).

## 3. Verbs and the thumb budget

Left thumb = move. Right thumb = look + ONE of {context button, eye button}. **No beat may require the eye and the context button at the same moment** (S1). A touch that starts on a hold button also steers the camera once it moves > 12 px.

| verb | input | introduced | develops into |
|---|---|---|---|
| Move / look | stick + drag | ch1 | riding (one-thumb: the camera follows the heading) |
| Context button (shows the verb) | tap / hold | ch1 pull the bucket (hold 1.5 s) | talk, inspect, mount at prompts, swing the brand (tap), light the signal (hold 1.5 s) |
| **الفراسة** (hold the eye) | hold | ch1 tracks | ch2 prints + a voice in the storm → ch3 the sky → ch4 combined signs (exam) |
| **الثبات** (hold the context button on a prompt) | hold | ch1 calming الوضحا (safe) | ch2 bracing gusts → ch3 the alpha stare → ch5 the walk and the stare (exam) |
| Choose | tap (hold 0.5 s when it sets a flag) | ch2 the sip | ch4 the stranger, ch5 the words |

Context priority when several apply (S5): الثبات prompt > swing (brand in hand) > mount > talk > inspect. The button shows the verb; a small Sadu diamond marks the world target.
Mounting/dismounting happens only at scripted prompts, the Bedouin way: she kneels → he sits → she rises (~3 s). No free dismount; signs can be inspected from the saddle (S6).
Mastery rule: one new pattern at a time; each chapter ends with an exam of what it taught.

## 4. Agency metrics (FROZEN — content is measured against these)

- Hero: 1.75 m; walk 2.0 m/s; run 5.0 m/s when the stick passes 0.90 (knob turns gold) or the run key is held; turn 540°/s. **No stamina bar** — running costs water (below). Beats that forbid running clamp the speed; nothing fails on stick magnitude alone.
- Camel: walk 2.4 m/s, trot 5.5 m/s (stick > 0.90); turn 75°/s; rider eye height 2.6 m. Riding camera follows the heading at 90°/s after 1.0 s without look input.
- Camera: follow distance 4.2 m on foot, 7.5 m riding; orbit pitch −15°…+65°; vertical FOV 55°. Look: a full-width drag = 180° yaw, half the height = 60° pitch, no acceleration, sensitivity 0.5–2.0×. Every beat start/resume eases the camera onto the objective within 1 s. **Sky mode** (star beats): holding the eye at night frees look-up to +85°.
- Interaction radius: 2.4 m on foot, 3.5 m mounted.
- **الفراسة**: hold to scan — speed ×0.6, no run (mounted: no trot); world saturation → 35 %, value −12 %; clues pulse gold (1 Hz, thin dark rim); sky clues are blue-white. Range 45 m (14 m in the storm). After release a **6 s afterglow** keeps clues lit at full speed (fades over the last 2 s). Fresh clues stay faintly visible within 8 m without the eye. Fresh vs old is told by shape (crisp rim vs wind-rippled), motion (grains still trickling) and a soft tick when the view centre crosses a fresh print. A clue entering range off-screen gives one ping + a gold glint on that screen edge.
- **الثبات**: on the prompt the camera soft-locks to the target in 0.4 s (± 20° nudge) and slides over the shoulder (0.6 m right, 3.0 m back); the ring is drawn around the TARGET. The ring fills while the button is held. Outside a *test window* releasing only drains it (2× fill rate). Inside a test window (a feint, a shot, the dagger) a flinch fails the hold: hold released > 0.25 s, or stick > 0.5, or camera > 35° off. Three authored stages at 33 / 66 / 100 % always produce a visible reaction. Assist: each failure −1 s and one test fewer (floors: ch3 4 s, ch5 5 s); the third failure auto-steadies with a sterner line. Ambience ducks, a heartbeat rises 60 → 96 bpm, success = one frame-drum hit and an exhale.
- **Gusts** (ch2): warning 1.5 s (first two 2.5 s); the hold must be down at impact and for 1.0 s after; no facing test; bracing roots Dhari (×0.2 speed). A miss = 2 s knockdown + a 3 m slide downwind.
- **Water** (the قربة; HUD only in ch2 and ch4): thirst 0–100. Start: ch2 = 55, ch4 = 36. Drain per second — riding at noon 0.16, riding on soft sand 0.24, on foot in the storm 0.08, running 0.35, walking 0.15, shade/night 0. Feedback: ≤ 40 dry breath + one icon pulse; ≤ 30 heat-haze vignette, heavy breath; ≤ 15 no running + heartbeat; 0 = collapse (safety net → checkpoint resume). **The only sips in the game are decisions**: the ch2 ration and the ch4 stranger. Drinking = hold the قربة icon 0.6 s; +35.
- Tracks: prints every 0.7 m (hero), 1.1 m (camel). In the storm prints are revealed **by distance** (14 m with the eye), never by a timer.
- Hints: "no progress" = path distance to the next objective node has not dropped ≥ 8 m and no clue/interaction completed. Timers 25 / 50 s in ch1–ch2, 45 / 90 s in ch3–ch5, 12 s for the very first objective; star beats 20 / 40 s. Tapping the objective text repeats the current hint. The goal mark on the horizon strip appears only as the last hint step.
- Level: 1024 × 1024 m terrain, playable radius ~420 m; a soft boundary turns the player back (ch1–ch2 the Sheikh's call; ch3 darkness and a howl 30 m from the fire; ch4 الوضحا balks; ch5 a sentry's whistle).
- Dialogue: blocking dialogue only when safe, ≤ 6 lines per block; in-play lines are non-blocking toasts ≤ 45 characters, ≥ 3.5 s, never inside a test window. Choices lock input 0.7 s when they appear; flag-setting choices confirm with a 0.5 s hold and are followed by a 2 s consequence shot.
- HUD is progressive: the eye button appears in c1_firasa, the قربة in ch2, the horizon strip (sun bearing, الجدي, سهيل — only what Dhari has learned) in ch3. Every audio cue has a visual twin (many phones are muted).

## 5. Chapters

World axes: +X east, +Z south, Y up. North = −Z. The journey goes south.
Three terrains: **L1 «المراح»** (ch1), **L2 «الجال»** (ch2 + ch3), **L3 «أم الحيا»** (ch4 + ch5). A chapter = a level + beats; a checkpoint is saved at every beat start, so long stretches are split into two beats.

### Ch1 «الأثر» — L1, dawn → morning. Camp by the dying well. (~5:00)
Teaches: move, look, the context button, الفراسة (tracks), الثبات (calm approach), riding.
1. `c1_intro` — ≤ 12 s, skippable after 2 s: black, wind; card «الربع الخالي — صيف ١٨٩٩م»; the camera glides over dunes at dawn and lands behind Dhari (no fade). Sheikh VO line.
2. `c1_wake` — control. Dhari faces the well; the Sheikh stands 20 m ahead, backlit by the sunrise. Prompt 1 = move; prompt 2 = look, only after 3 m. فهيد and الحوار cross his path (the calf bleats for its mother).
3. `c1_well` — Dhari pulls the bucket himself (hold 1.5 s): mud. ≤ 6 lines. مسفر arrives: الوضحا is missing. A flight of قطا crosses the well without landing («أهدى من القطا» — seeds ch4).
4. `c1_firasa` — the pen, ≤ 15 m from the well. The Sheikh states the rule first («الجرّة الجديدة حدّها قاطع…»). The eye button appears. Two track sets ≤ 10 m from the gate: old and fresh. Inspect (kneel) the fresh one. Wrong pick → he explains, then the player inspects the right one.
5. `c1_trail` — follow the fresh trail ~85 m over a dune ridge to a gravel flat where it breaks.
6. `c1_gravel` — two clue nodes (broken ghada twig, fresh dung) ≤ 30 m from the break and within 60° of the last heading restore the trail; ~85 m more. Optional: inspect a wolf print crossing the trail (`sawWolfPrint`; the Sheikh's remembered line).
7. `c1_calm` — الوضحا by a patch of green. Running inside 30 m raises her head (snort + one warning line); running inside 18 m makes her bolt 25 m (twice at most, then she only shies 6 m). At 5 m the الثبات prompt: 3 s — head lowers → ears forward → she steps in, kneels. Mount.
8. `c1_ride` — a 170 m shortcut over one ridge that reveals the camp in morning light. Trot prompt after 5 s. On arrival الحوار runs to her.
9. `c1_decision` — the Sheikh smells the green on her muzzle: rain fell far south. «نرحل الليلة… لعِدّ أم الحيا». Chapter card.

### Ch2 «المسير» — L2, harsh noon → sandstorm → dusk. (~5:40)
Teaches: leading, the sip, the storm; exam = bringing فهيد back.
1. `c2_march` — riding at the head of the caravan, 280 m to the shade rock «الجال», lead pace fixed at 2.4 m/s (no trot while leading). Thirst starts at 55. Three authored events ~70 m apart: a رجم landmark (seeds ch4), a soft-sand fork (firm corridor ≥ 14 m wide: crunchy footfall, small dust, steady bob; soft: muffled, big puffs, the line stretches, مسفر calls out; الفراسة shows the corridor edges), a قطا flight (one line).
2. `c2_ration` — midday shade. The single sip: [اشرب] (performs hold-to-drink) / [أعطه فهيد] / [أعطه جدّك] → `ration` ∈ {self, child, elder}. A 2 s shot of whoever drinks. The Sheikh notices («اللي يعطي وهو عطشان… هذا اللي يِنْتَبَع»).
3. `c2_wall` — the sky yellows; a storm wall rises in the west. «برّكوا الركاب! العجاج!». الوضحا kneels at once while other camels fight (echo of ch1). First gust taught at the camel ring («ليا صفّر الهوا… اثبت وعطه كتفك!»). The beat ends on فهيد's small figure and his first prints heading east after الحوار, held 2 s before visibility drops.
4. `c2_storm` — OUT, on foot, 80 m, tailwind. Verb: الفراسة + his call. Visibility ~12 m. Prints show within 14 m with the eye; two authored gaps of 16–18 m are bridged by his call (positional audio + ripple rings on screen). 2 teaching gusts only (2.5 s warning). If `ration = self` his call is hoarse (beacon 60 m instead of 90 m). He is behind a ghada bush with الحوار; he runs to Dhari.
5. `c2_return` — BACK, 80 m, headwind (speed ×0.8). Verb: الثبات. 5 scripted gusts 9–12 s apart; bracing shields فهيد (he grabs Dhari's sash). He walks Dhari's recorded path 1.5 m behind, الحوار behind him. Guidance: the Sheikh's rhythmic call + a fire glow; visibility opens 12 → 25 m over the last 30 m. Lost: 30 s the call grows and the ripple becomes an arrow; 60 s الحوار bleats; 90 s a visible glow. A giver crosses thirst 30 here.
6. `c2_dusk` — the storm passes; golden light. «اللي يرجع عشان واحد… يتبعونه الكل». A giver is handed a sip now (hold-to-drink). Card.

### Ch3 «ليلة سهيل» — L2 at night → first light. The camp at الجال. (~5:00)
Teaches: the sky, the brand; exam = the alpha stare.
1. `c3_fire` — campfire. فهيد sits by Dhari; one line from whoever received the water. The Sheikh asks Dhari to describe the stars and reveals his failing sight.
2. `c3_polaris` — sky mode. Real sky, lat 20°N, `LST 18.0`: **بنات نعش** low in the north-west, then **الجدي** 19.5° up. 7° cone, 0.8 s dwell, magnetism inside 12°; lines draw with one plucked note per star. Ground-based hints («ناظر مغيب الشمس وخذ يمينه…»). «الجدي ما يتحرك… خلّه على كتفك تعرف دربك».
3. `c3_wolves` — a howl. Take a brand from the fire. Attack arc 180° (the fire and the ring of kneeling camels guard the rear). 3 waves of 3 / 4 / 5 lunges, gaps 3 → 2 s, 6 s breath between waves, one double in wave 3. Telegraph 1.2 s, readable without the eye (eyes flare, crouch, edge glint, growl). Tap context to swing: auto-aims within ± 60°, the brand stays raised 0.5 s. الفراسة only reveals the next lunger 2.5 s early. Each miss drags الحوار 2 m toward the dark; the third miss in a wave retries that wave. One full wolf in the firelight at a time — the rest are eye pairs and silhouettes at the rim.
4. `c3_alpha` — الأمعط steps into the light (named by the Sheikh if `sawWolfPrint`). Hold الثبات 6 s; feints at 2.2 s and 4.4 s reuse the lunge telegraph — releasing to swing IS the flinch. Camera pushes in (FOV 55 → 48°). Flinch → he lunges, Dhari staggers, retry with the assist.
5. `c3_suhail` — time-lapse: the sky wheels to `LST 3.3`. Low in the south-south-east (7° up) a yellow star has just risen: **سهيل**. The bright white star high in the south-east is NOT it — resting the gaze there triggers hint 2 at once. «طلع سهيل… ومن تبع سهيل ما ضاع عن أم الحيا». The horizon strip gains the سهيل mark. Card.

### Ch4 «حق الملح» — L3, morning → dusk → night. (~5:30)
Teaches: the hard choice; exam = finding the well alone.
1. `c4_stranger` — thirst 36, one sip left. A dead camel and a man in its shade: جابر of ربع ثامر (old blood between the clans). [اسقِه من ماينا] / [امضِ — ماينا ما يكفي عيالنا] → `gaveWater`. Refused → the Sheikh dismounts and gives his own share: «الماء يرجع… والوجه ما يرجع يا ضاري». جابر lives either way and tells them: ربع ثامر hold أم الحيا; their sheikh swore to water no stranger this year.
2. `c4_collapse` — the Sheikh weakens (if refused: *because* he gave his share — مسفر says so). The caravan halts under an acacia. «رح لحالك. القطا يرد الماء مع المغيب… اتبع القطا».
3. `c4_search` — alone on الوضحا, golden hour. Cairn 1 → cairn 2 (~240 m). قطا flights every 30 s overtaking from behind (one instanced ribbon ≥ 12 px tall, call panned along its line; الفراسة draws the line, the afterglow holds it). Each next cairn «رجم» stands on a skyline within ± 40° of the heading, its top catching the last light. If `gaveWater` the قربة is empty; else Dhari may drink the single sip.
4. `c4_search2` — cairn 2 → 3 → 4 (~240 m). A false trail branches east at cairn 2 (≤ 100 m) and ends at camel bones («درب موت»); from the bones the true cairn is in sight. Night falls at ~60 %; الأمعط's far howl once; the strip shows the سهيل mark; الجدي is over the shoulder.
5. `c4_ridge` — firelight glows on the haze from 150 m; a crest above a basin with trees, a fire, armed men around the well. Card (cliffhanger).

### Ch5 «الهيبة» — L3, night → dawn. The well. (~5:45)
Exam of الثبات and of the player's choices.
1. `c5_scout` — on the ridge. الفراسة counts six riflemen (numerals ١…٦; those found stay faintly outlined and their shots telegraph 0.4 s earlier). Hang the rifle on the saddle (hold 1 s) → `leftRifle` — coming unarmed = seeking الدخالة.
2. `c5_walk` — 55 m down to the fire. Speed is locked at 1.5 m/s for any stick ≥ 0.2. Flinch = stopping > 0.5 s, heading > 35° off for > 0.4 s, or lifting the thumb in the 0.8 s after a shot. «قف! من أنت؟» — shot 1 at 20 m (3 m ahead-left), shot 2 at 38 m (0.6 m from the feet, 0.5 s shake); in the last 6 m the men rise and nothing happens. Flinch → they jeer «هذا ما هو ولد مانع» → retry from the ridge foot.
3. `c5_words` — Sheikh ثامر. Two exchanges, three answers each. Truth, lineage and الدخالة raise `haybah`; evasion and bravado lower it (0–4). After each answer the circle reacts (a murmur or a short laugh; he leans back or forward).
4. `c5_stare` — he steps close, hand on his dagger. Hold الثبات for 8 − 0.6 × `haybah` s (min 5): he steps in → hand on the dagger → (haybah ≤ 1) an inch of blade. Flinch → retry this beat only, with the assist.
5. `c5_verdict` — `gaveWater`: جابر rides in alone, sent ahead by the Sheikh: «هذا اللي سقاني من آخر ماه يا عم!» → «اللي يسقي ولدنا من آخر مايه ما يُرد عن مانا». Else: on composure alone: «فيك من مانع… وِرْد».
6. `c5_signal` — carry a brand ≤ 60 m up the ridge (running allowed, no fail) and hold 1.5 s to light the signal pile — the gesture that drew mud in ch1 now draws fire. Cinematic: the fire seen from afar; time-lapse to dawn; the caravan descends; people and camels drink. (If refused: جابر's testimony about the Sheikh comes now and the two old men reconcile.)
7. `c5_staff` — dawn at the well. The Sheikh drinks, washes his face: «أشوف نور… وما أشوف وجيه. بس أعرف وجهك يا ضاري». He hands over the staff. Thunder; the first drops on the sand — **الحيا**. The camera rises. Epilogue: «ومن ذيك السنة صار اسمها عند العرب: سنة ضاري».
8. `c5_end` — summary of choices, credits, «العب من جديد» / «الفصول».

## 6. Flags and echoes

`ration` ∈ {self, child, elder} · `gaveWater` ∈ {true, false} · `sawWolfPrint` · `leftRifle` · `haybah` 0–4. Chapter select uses the saved flags, else defaults (`ration = self`, `gaveWater = false`).
No bad ending — only a harder walk, a longer stare and sterner words.

| player action | immediate effect | later echo |
|---|---|---|
| pulls the bucket (ch1) | mud on the rope; the Sheikh is silent | c5_signal uses the same hold |
| calms الوضحا | three-stage reaction | she kneels at once in c2_wall; never bolts again |
| reads firm sand (ch2) | sound, dust, pace | مسفر's line at الجال; thirst when the sip comes |
| the sip | consequence shot + the قربة | storm effects; a line at the fire; the Sheikh's last line |
| inspects the wolf print | remembered line | الأمعط is named in ch3 |
| finds فهيد | he runs to Dhari; the ripple stops | he sits by Dhari at the fire; his calf is what the wolves want |
| names the stars | lines + notes | marks on the horizon strip in ch4 |
| gives / refuses water | جابر or the Sheikh drinks | dry search or the collapse; the verdict in ch5 |
| counts riflemen, hangs the rifle | numerals; rifle on the شداد | outlined shooters; ثامر's first line |
| the answers | the circle reacts | stare length; wording of the verdict |

## 7. Presentation

- Art: stylized painterly realism (see `docs/ASSETS.md` STYLE FORMULA). Smooth sculpted dunes with strong light/shadow sides and ripple detail; soft atmospheric fog tinted by the sky; sun, dust and stars carry the mood.
- UI: sand/ivory panels with thin dark-brown rules, a **Sadu** weave strip (red/black/white geometric) as the signature border. Titles «Aref Ruqaa»; body, dialogue (≥ 18 px) and UI «Tajawal». Arabic-Indic digits in cards.
- Sky presets: `dawn`, `morning`, `noon`, `storm`, `dusk`, `night`, `predawn`, `sunrise_rain`.
- Audio: 3 short looped music cues (المسير: oud + ney + frame drum; الليل: low rababa drone; الحيا: warm finale), procedural wind/fire/footsteps/heartbeat, generated SFX (camel, wolf howl/snarl, rifle, water, torch, sandgrouse, thunder).

## 8. Fail-soft rules (never a dead end)

- Thirst 0 → collapse → checkpoint resume. The line branches: a giver is given water without reproach; alone in ch4, الوضحا kneels to shade Dhari and he wakes at the last cairn.
- Lost in the storm → escalating guidance at 30 / 60 / 90 s.
- Wolves drag الحوار three times in a wave → retry that wave.
- Flinch in a stare / the walk → retry that beat only, each time easier; the third failure auto-steadies.
- Leaving the playable radius → the chapter's own turn-back cue and a gentle push.
- Interruption (call, tab switch): the simulation pauses; a resume never lands inside a test window — the beat restarts with the objective shown for 4 s.

## 9. Technical constraints (weakest target: mid-range phone)

- three.js r170, WebGL2, one render pass, no post-processing chain; custom sand/sky shaders; الفراسة desaturation is a shared uniform patched into every material.
- Frame budget 16.6 ms target, 33 ms floor. Draw calls ≤ 120, visible triangles ≤ 250k, **skinned meshes ≤ 12** (only named characters and nearby camels are skinned; kneeling camels, distant caravan camels and extras are static meshes; four of the six riflemen are seated silhouettes), texture memory ≤ 64 MB. DPR ≤ 2 with dynamic resolution (0.6–1.0).
- No real-time shadow maps on mobile (blob shadows); swarms are instanced; zero allocations in the frame loop.
- Download: boot ≤ 1 MB, first playable (ch1: hero, Sheikh, مسفر, فهيد, camel, tent, well) ≤ 8 MB, total ≤ 25 MB; later chapters stream in the background.
- Deterministic where it matters: scripted gust budgets and distance-driven prints (no free-running timers), seeded RNG; `?dev=1` overlay; `?test=1` test API + autoplay bot.
- Save: localStorage (source of truth) + best-effort room sync through the platform's `logic.js` ledger.
