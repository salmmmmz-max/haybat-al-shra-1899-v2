# REVIEW — gameplay critique of DESIGN.md · «هيبة الصحراء — ١٨٩٩»

> Lens: senior designer, mobile third-person adventure. Scope: the beats and systems already in `DESIGN.md` — no new chapters, no new major systems. Every item reads **problem → fix**. `[§4]` = the fix reopens a frozen agency metric of DESIGN §4 (needs the lead's sign-off). Arabic in «» is a draft for the script pass (speech = Najdi, UI = فصحى). Times are estimates computed from the §4 speeds. Cross-checked against `docs/ARCHITECTURE.md` (written in parallel): where it already holds the fix or contradicts it, the item names the API.
>
> Keep untouched: soft fails only, no bad ending, الفراسة growing from sand to sky, the ch1↔ch5 mirror (walk in steady, then hold), جابر living whatever the player chooses.

## 0. The three structural problems (fix before any chapter work)
1. **The right thumb is triple-booked.** Look-drag, hold-eye (الفراسة) and hold/tap context (الثبات, swing) all sit on it; c2_storm, c3_polaris and c3_wolves ask for two of them at once = a third finger. → S1, T2, C2-4, C3-3.
2. **الفراسة turns the game into a crawl.** ×0.6 speed while held: c1_trail 260 m = 3:37; c4_search up to 7:30. Total playtime today ≈ 26–41 min against a 20–30 target. → F1 and the pacing table.
3. **Water never bites, yet there are three meters.** From 100 (start values are never stated) ch2 can drain ≈ 60 at most and ch4 ≈ 45, with 2 and 1 sips in hand — collapse is unreachable and no sip is a decision. Stamina and «جهد الركاب» each matter in a single beat. → W1–W4.

## 1. Systems

### 1.1 Touch controls and thumb budget
- **S1 · Hold buttons block looking.** A right thumb holding the eye or the context button cannot drag the camera, yet الفراسة is scanning and الثبات tests facing. → **Fix:** a touch that starts on either button also steers the camera once it moves > 12 px (the button is a look-pad origin). Hard rule for every beat: never require eye + context at the same moment.
- **S2 · DESIGN gives no layout; ARCHITECTURE gives zones (45 % stick, 48 px targets) but no positions.** → **Fix (landscape):** left 45 % = floating stick (radius 56 px, dead zone 0.12); right 55 % = look; context ⌀ 76 px bottom-right; eye ⌀ 64 px on the thumb arc ~90 px up-left of it; drink = hold the قربة icon 0.6 s, top-right, so a sip is never spent by accident; pause top-left. Buttons ≥ 24 px + safe-area inset from every edge (iOS back-swipe, home bar); `touch-action:none`. Controls are not mirrored for RTL — only text aligns right.
- **S3 · Portrait is a trap.** 72° vertical FOV on a 9:19.5 screen is ~37° horizontal (landscape 55° ≈ 97°): circling wolves, low stars and six riflemen cannot be read, and two thumbs do not fit; ARCHITECTURE §8 still promises portrait from 320 px. → **Fix:** v1 is landscape-only with a rotate overlay «أدِر الجهاز أفقيًّا»; remove portrait from layouts and the test matrix. `[§4]`
- **S4 · Auto-run at stick > 0.85 punishes the resting thumb.** On glass most players sit at full deflection, so they always run: الوضحا bolts, c5_walk fails. → **Fix:** threshold 0.90 with a visible "click" (knob turns gold, footstep tempo changes); beats that forbid running either warn first and cap the punishment (C1-6) or clamp the speed (C5-2) — never fail on stick magnitude alone. `[§4]`
- **S5 · One context button, many verbs, no priority.** → **Fix:** fixed order: الثبات prompt > swing (brand in hand) > mount > talk > inspect. Verb label on the button plus a small Sadu diamond over the world target, so the player sees what the verb applies to.
- **S6 · Free mount/dismount strands the camel, and a 1.2 s climb has no clip in ASSETS.md.** → **Fix:** mount/dismount only at scripted prompts, played the Bedouin way with the poses quadruped.js already plans: she kneels → Dhari sits → she rises (~3 s). No free dismount; signs are inspected from the saddle (3.5 m radius). `[§4]`
- **S7 · Riding needs both thumbs for no reason** (ARCHITECTURE even switches auto-align off while the camel turns). → **Fix:** the riding camera follows the heading on its own at 90°/s — faster than the camel's 75°/s turn — after 1.0 s without look input. Riding becomes one-thumb, so every riding beat is also a physical breather and the right thumb is free to scan.

### 1.2 الفراسة
- **F1 · Holding = crawling, releasing = blind.** The glow dies on release, so the player holds all the way (×0.6) and must let go exactly when asked to inspect (c1_firasa). → **Fix:** keep hold-to-scan at ×0.6 and add a 6 s **afterglow** after release (full speed, fading over the last 2 s); fresh clues stay faintly visible within 8 m without the eye; mounted, holding only forbids trot. The loop becomes stop – read – go. `[§4]`
- **F2 · Gold on gold sand.** "Slightly desaturated" will not separate a gold clue from amber sand on a phone in daylight. → **Fix:** world saturation to 35 %, value −12 %; clues pulse at 1 Hz with a thin dark rim; sky clues are pale blue-white. `terrain.setFirasa` and `decals.setFirasa` exist; props, actors and sky need the same uniform or they stay saturated (no post chain, and no CSS filter on the canvas).
- **F3 · Fresh vs old is coded by brightness alone.** → **Fix:** three redundant channels: shape (crisp rim vs wind-rippled), motion (grains still trickling into a fresh print), sound (a soft tick when the screen centre crosses a fresh print).
- **F4 · Clues outside a ~97° view do not exist.** → **Fix:** when a clue enters range, one stereo ping + a gold glint on the matching screen edge. In the storm the range is 14 m, not 45 m.
- **F5 · A compass with objective marks replaces reading the land.** → **Fix:** no permanent compass. A thin horizon strip shows only what Dhari has learned (sun bearing, الجدي, the سهيل mark); an objective mark (the `goal` icon of `objectives.mark`) appears on it only as the last hint step (H1).

### 1.3 الثبات
- **T1 · Two failure models contradict.** §4 says release drains at 2×; ch3 and ch5 say a flinch is an instant retry. → **Fix:** outside a *test window* release only drains; inside one (feint, shot, dagger) a flinch fails. In the stares a flinch is: hold released > 0.25 s, or stick > 0.5, or camera > 35° off the target.
- **T2 · The ring is under the thumb and the cone cannot be corrected while holding.** → **Fix:** on prompt the camera soft-locks to the target in 0.4 s (player may still nudge ± 20°); cone 25° → 35° on touch; draw the ring around the target (the camel's eye, the wolf's head, هذال's chest), never on the button. `[§4]`
- **T3 · No assist: a player can loop at the climax.** → **Fix:** each failure −1 s and one feint fewer (floors: ch3 4 s, ch5 5 s); the third failure auto-steadies with a sterner line. The ending is never blocked.
- **T4 · A long hold is flat.** → **Fix:** three authored stages with a reaction at 33 / 66 / 100 % (ch1: head lowers → ears forward → she steps in; ch3: feints at 2.2 s and 4.4 s; ch5: he steps in at 2.5 s → hand on the dagger at 5 s → an inch of blade at 6.5 s). Ambience ducks −12 dB, heartbeat 60 → 96 bpm, success = one frame-drum hit and an exhale.
- **T5 · Gust timing is undefined.** → **Fix:** warning 1.5 s (the first two 2.5 s); the hold must be down at impact and for 1.0 s after; no facing test for gusts; bracing roots Dhari at ×0.2 speed. A miss = 2 s knockdown + a 3 m slide downwind — a visible cost, not just lost time. `[§4]`

### 1.4 Water, stamina, meters
- **W1 · Thirst never reaches a value that means anything.** → **Fix:** start ch2 at 55 and ch4 at 36; c2_march riding drain 0.16/s (noon), storm on foot 0.08/s. Feedback steps: ≤ 40 dry breath + one pulse of the icon; ≤ 30 heat-haze vignette + heavy breath + gust recovery +1 s; ≤ 15 no run + heartbeat; 0 collapse (now a pure safety net). Tuned so a giver crosses 30 as c2_return starts and by the second cairn of ch4. `[§4]`
- **W2 · The ration is hollow if 2 HUD sips remain, and no beat teaches drinking ("ch1 ∞").** → **Fix:** the only sips in the game are decisions. ch1: no thirst, no قربة. ch2: the ration is the single sip — [اشرب] performs the hold-to-drink; a giver is handed a sip at c2_dusk and performs the same gesture then. ch4: the single sip is the one جابر asks for; a refuser may drink it alone during the search. `[§4]`
- **W3 · Stamina yo-yos and matters in one beat.** Full stick = 7.5 s of run, then cycles of 1.7 s run / 2.5 s forced walk (avg 3.2 m/s); the "−20 % in the storm" echo acts on a bar the storm barely uses. → **Fix:** cut the stamina bar; running already costs water (0.35/s vs 0.15/s), W1's ≤ 15 step is exhaustion, and the storm disables running. If the bar must stay: run −6/s, regen +10/+20, exhausted = jog at 3.2 m/s until 40. `[§4]`
- **W4 · «جهد الركاب» is a one-beat meter with no rule at 0.** → **Fix:** cut it. Soft sand slows the caravan to 1.8 m/s and raises riding drain to 0.24/s, with groans, bigger dust puffs, the line stretching and مسفر calling out. Bad reading costs time under the sun, i.e. water — one resource for the whole game.
- **W5 · The collapse line («سقيتك من نصيبي… لا تعيدها») scolds a giver and assumes the Sheikh is there.** → **Fix:** branch it: when `ration ≠ self` he gives without reproach; in c4_search (alone) الوضحا kneels to shade Dhari and he wakes at the last cairn.

### 1.5 Camera
- **K1 · Pitch −15°…+65° is ambiguous** (orbit elevation or look-up?). As orbit elevation the screen centre cannot rise above 15°, and الجدي sits ≈ 20° up at this latitude. → **Fix:** write ARCHITECTURE's `cam.skyMode` (look-up to +85°) into DESIGN and define its entry: holding the eye at night with the camera pitched to its upper limit; used by c3_polaris, c3_suhail and the ch4 night ride.
- **K2 · Beats start with the camera wherever the last one left it.** ARCHITECTURE's on-foot auto-align (1.5 s, 0.6 rad/s) is right for casual thumbs, but nothing aims the first look. → **Fix:** every beat start and every resume eases the camera onto its objective within 1 s; auto-align stays on by default (setting).
- **K3 · Look sensitivity is unspecified.** → **Fix:** a full-width drag = 180° yaw, half the height = 60° pitch, no acceleration, slider 0.5–2.0×.
- **K4 · In a stare Dhari's own back hides the target.** With a centred follow camera the camel, the wolf or هذال stands exactly behind the hero's head. → **Fix:** during الثبات the camera slides to an over-shoulder frame (0.6 m right, 3.0 m back) so the target and its ring are clear; it eases back on release.

### 1.6 Hints, checkpoints, fail-soft
- **H1 · "No progress" is undefined and 45 / 90 s is slow on a phone.** → **Fix:** progress = path distance to the next objective node drops ≥ 8 m, or a clue/interaction completes. Timers: ch1–ch2 25 / 50 s, ch3–ch5 45 / 90 s, the very first objective 12 s. Tapping the objective text repeats the current hint.
- **H2 · Every hint is the Sheikh's, even when Dhari is alone.** → **Fix:** in ch1–ch3 solo hints are remembered lines («قال جدّي…»); in ch4–ch5 they are Dhari's own voice. Pillar 4 is paid off at no cost.
- **H3 · Checkpoints only at beat start replay minutes.** → **Fix:** ARCHITECTURE resumes only at beat starts, so split the long beats: c1_trail at the gravel flat, c3_wolves per wave, c4_search per cairn, c5_walk after each passed shot, and `c5_words` into `c5_words` + `c5_stare`.
- **H4 · "Lost in a storm > 150 s" is three times too long.** → **Fix:** 30 s the call grows louder and the ripple becomes an arrow; 60 s الحوار bleats as a second beacon; 90 s the visible glow.
- **H5 · The soft boundary uses the Sheikh's call where he is absent.** → **Fix:** per chapter: ch1–ch2 his call; ch3 darkness and a howl (radius 30 m from the fire); ch4 الوضحا balks; ch5 a sentry's whistle.
- **H6 · No interruption rule** (call, tab switch, rotation). → **Fix:** ARCHITECTURE suspends audio on `visibilitychange`; the simulation must pause too. Never resume inside a test window — re-enter at the beat start with the objective shown for 4 s.
- **H7 · Information carried by sound alone.** Many phones are muted (the iOS silent switch also silences Web Audio) and iOS has no Vibration API. → **Fix:** every audio cue has a visual twin (gust = sand streaks + vignette on the windward side; growl = edge glint; the Sheikh's call = ripple rings). Haptics are Android-only garnish: 15 ms tick, 40 ms hit.

### 1.7 Dialogue, choices, HUD
- **D1 · A choice can pop under a thumb that is tapping to advance.** → **Fix:** 0.7 s input lock when options appear; options centre-screen, ≥ 56 px tall; hold 0.5 s to confirm any flag-setting choice.
- **D2 · Choices have no immediate picture.** → **Fix:** a 2 s consequence shot after each (فهيد, the Sheikh or جابر drinking; the قربة icon dropping with the receiver's glyph).
- **D3 · Text-only speech while riding or fighting.** → **Fix:** in-play lines are non-blocking, ≤ 45 characters, on screen ≥ 3.5 s, never inside a test window. Blocking dialogue only when safe, ≤ 6 lines per beat. Dialogue in Tajawal ≥ 18 px; Aref Ruqaa for titles only.
- **D4 · The whole HUD is on screen from second one.** → **Fix:** progressive HUD: the eye button appears in c1_firasa, the قربة in ch2, the horizon strip in ch3.

## 2. Chapters

### Ch1 «الأثر»
- **C1-1 · Time to first input is unbounded.** → **Fix:** intro ≤ 12 s, skippable after 2 s («تجاوز»), and it is the loading screen (the Sadu strip weaves as progress); the «ابدأ» tap unlocks audio; the glide lands behind Dhari with no fade.
- **C1-2 · Two tutorial prompts at once, and a goal the player has never seen.** → **Fix:** spawn facing the well with the Sheikh 20 m ahead, backlit by the sunrise; prompt 1 = move; prompt 2 = look, only after 3 m.
- **C1-3 · فهيد and الحوار are strangers when ch2 asks the player to give up water for them.** → **Fix:** they cross Dhari's path in c1_wake; at the pen الحوار bleats for its missing mother (a positional sound that leads to the pen and pre-teaches the beacon of c2_storm); in c1_ride the calf runs to الوضحا — the visible payoff of the chapter.
- **C1-4 · The first minute contains no event the player makes.** → **Fix:** Dhari pulls the bucket himself (hold context 1.5 s, clip 276 serves) and the mud comes up under the player's thumb; c1_well ≤ 6 lines; pen ≤ 15 m from the well, so the first الفراسة happens by ~1:10.
- **C1-5 · c1_firasa quizzes before it teaches.** → **Fix:** the Sheikh states the rule first («الجرّة الجديدة حدّها قاطع ورملها للحين يطيح… والعتيقة ماحيها الهوا»); both sets lie ≤ 10 m from the gate so the afterglow keeps them lit while walking over; after a wrong pick the player still inspects the right one.
- **C1-6 · The trail is too long and the bolt too harsh.** → **Fix:** trail 260 → 170 m; clue nodes ≤ 30 m from the break and within 60° of the last heading. الوضحا warns before she punishes: running inside 30 m raises her head (snort + «على هونك… الذلول تعرفك من مشيتك», once); inside 18 m she bolts 25 m, twice at most, then only shies 6 m; the الثبات prompt appears at 5 m.
- **C1-7 · c1_ride is 260 m of backtracking** (1:48 if trot is never found). → **Fix:** a 170 m shortcut over one ridge that reveals the camp in morning light; trot prompt after 5 s.
- **C1-8 · The wolf print is passive.** → **Fix:** make it an optional inspect; if inspected, the Sheikh names الأمعط when he steps into the light in ch3.

### Ch2 «المسير»
- **C2-1 · The march is 3:20–4:00 of one mechanic, and walkers (2.0 m/s) cannot follow a trot.** → **Fix:** 480 → 280 m at a fixed lead pace of 2.4 m/s (no trot while leading; the caravan already follows the leader's breadcrumb at 4.5 m spacing). Three authored events ~70 m apart: a رجم landmark, a soft-sand fork, a قطا flight.
- **C2-2 · Firm vs soft sand is a subtle colour read at noon.** → **Fix:** redundant cues: footfall (crunch vs muffled), dust puff size, الوضحا's bob; with الفراسة the corridor edges glow. Corridor ≥ 14 m wide.
- **C2-3 · `ration = self` has no echo and "−20 % stamina" is invisible.** → **Fix:** self → فهيد's call is hoarse (beacon 60 m instead of 90 m, fainter ripple). child/elder → the قربة is empty in the storm, W1's ≤ 30 step arrives on the return, the Sheikh's line at dusk. One more line in c3_fire from whoever received the water.
- **C2-4 · c2_storm teaches five things at once** (low visibility, wind drift, gusts, fading prints, audio beacon) and pits eye against brace on one thumb. → **Fix — one verb per leg:** الحوار flees downwind (east). Out (c2_storm, 120 → 80 m, tailwind): الفراسة + the call, with 2 teaching gusts only. Back (c2_return, 80 m, headwind ×0.8): الثبات — 5 gusts 9–12 s apart, bracing shields فهيد; guidance = the Sheikh's call + fire glow; visibility opens 12 → 25 m over the last 30 m.
- **C2-5 · Prints that fade in 18 s are a race the player can lose, and they contradict c2_return** (prints older than 18 s no longer exist). → **Fix:** reveal by distance, not time: with the eye, prints show within 14 m; VFX buries them behind Dhari. Two authored gaps of 16–18 m (longer than the reveal; tracks.js already takes `gaps`) are bridged by the call. The same system serves the return. `[§4]`
- **C2-6 · Gust spam.** Every 6–9 s over 240 m is 20–30 identical prompts. → **Fix:** replace the random `scheduleGusts` timer in these beats with a scripted budget (2 out, 5 back), none in the first 12 s or within 5 s of a line. The first is taught at the camel ring: «ليا صفّر الهوا… اثبت وعطه كتفك!».
- **C2-7 · An escort at 12 m visibility is a classic frustration and a pathfinding risk.** → **Fix:** not steering-follow: فهيد walks Dhari's recorded path 1.5 m behind (he cannot get stuck) and grabs Dhari's sash during a brace; الحوار trails him the same way.
- **C2-8 · The cut to on-foot hides where the boy went.** → **Fix:** c2_wall ends on فهيد's small figure and his first prints heading east, held 2 s before visibility drops.

### Ch3 «ليلة سهيل»
- **C3-1 · The sky is real (lat 20°N), so the hour decides whether the lesson is visible.** → **Fix:** `setLST(18.0)` for c3_fire/c3_polaris (≈ 19:20): بنات نعش at az 316–332°, lowest star 9° up, الجدي 19.5° up. `setLST(3.3)` for c3_suhail (≈ 04:40): سهيل at az 154°, 7° up. Keep dune crests < 4° above the horizon in the NW and SSE sectors as seen from the fire.
- **C3-2 · "Where the gaze rests" is too strict for a thumb.** → **Fix:** relax `stars.find` (6°, 1.2 s) to a 7° cone and 0.8 s dwell, with magnetism inside 12° (8°/s); lines draw in 1.2 s with one plucked note per star. Hints use the ground, not the compass: «ناظر مغيب الشمس وخذ يمينه… أربع نجوم نعش وثلاث بنات يمشن وراه»; timers here 20 / 40 s.
- **C3-3 · Wolves need eye + look + swing on one thumb, through 360°.** → **Fix:** attack arc 180° (the fire and the ring of kneeling camels guard the rear); a 1.2 s telegraph (wolves.js plans 0.6 s) readable without الفراسة (eyes flare, crouch, edge glint, growl); the swing auto-aims within ± 60° and keeps the brand raised 0.5 s (effective window 1.1 s). الفراسة only shows the next lunger 2.5 s early — mastery, not a requirement.
- **C3-4 · "Three waves, ~90 s" has no shape.** → **Fix:** 3 / 4 / 5 lunges, gaps 3 s → 2 s, a 6 s breath between waves, one double in wave 3 (0.8 s apart, same side), never two from opposite sides.
- **C3-5 · "Wolves take الحوار" has no threshold.** → **Fix:** each miss drags him 2 m toward the dark (rope taut, فهيد cries out); the third miss in a wave retries that wave.
- **C3-6 · c3_alpha never says that the trained reflex is the mistake.** → **Fix:** his feints reuse the lunge telegraph; releasing the hold to swing is the flinch (T1). Camera pushes in, FOV 55 → 48°.
- **C3-7 · c3_suhail has no deduction and hides a trap.** At that hour the brightest star in the sky (Sirius, locally المرزم — script to confirm the name) stands 27° up in the south-east and will be taken for سهيل. → **Fix:** no marker; hint 1 «عط الجدي ظهرك وناظر حدر… سهيل ما يعلّي»; hint 2 «النجم الأبيض العالي ما هو سهيل… سهيل حدره على يمينه، أصفر وقريب من الأرض». Resting the gaze on the wrong star triggers hint 2 at once, never a fail.
- **C3-8 · Five procedural wolves are the riskiest animation in the game.** → **Fix:** one full wolf in the light at a time; the other four are eye pairs and dark silhouettes at the rim of the firelight.

### Ch4 «حق الملح»
- **C4-1 · The exam tests signs that were never taught** (القطا, الرجوم). → **Fix:** seed them: a قطا flight crosses the dying well at dawn in ch1 without landing, and again on the ch2 march, one line each (the proverb «أهدى من القطا» fits the Sheikh); one رجم is a march landmark in ch2. Green is already taught by ch1.
- **C4-2 · Each answer needs a cost inside a minute.** → **Fix:** gave → the قربة is empty and Dhari rides the search dry (W1 bites by the second cairn); refused → the Sheikh's collapse happens *because* he gave his share, and مسفر says so.
- **C4-3 · 650 m alone is 4–7 min and leaves < 100 m of margin inside the 420 m radius.** → **Fix:** 480 m; four cairns 110–130 m apart, each next one on a skyline within ± 40° of the heading, its top catching the last light; a قطا flight every 30 s in the first half, always overtaking from behind.
- **C4-4 · The false trail has no bound.** → **Fix:** it branches at cairn 2 and is ≤ 100 m long; from the bones the next true cairn is in line of sight. Its price is daylight and water, nothing else.
- **C4-5 · قطا at distance are smaller than a pixel.** → **Fix:** the flock is one instanced ribbon ≥ 12 px tall with its call panned along the flight line; الفراسة draws the line and the afterglow holds it for 6 s.
- **C4-6 · "After dark the سهيل mark confirms"** — the star itself is not up at dusk. → **Fix:** the strip shows only the *mark* (the bearing where it rose); a glance back finds الجدي over the shoulder, which is the lesson of ch3 used at last.
- **C4-7 · The ridge can be missed in the dark.** → **Fix:** firelight glows on the dust haze from 150 m out; the card fires from a crest volume 20 m wide.

### Ch5 «الهيبة»
- **C5-1 · c5_scout has no effect the player makes.** → **Fix:** each rifleman found ticks a numeral ١…٦; those found stay faintly outlined during the walk and their shots telegraph 0.4 s earlier (فراسة feeds ثبات). Hanging the rifle = hold 1 s on the saddle; هذال's first line notices it.
- **C5-2 · "Stick 0.3–0.7" is an analog band on glass** — never taught, impossible on a keyboard, unfair under stress. → **Fix:** test intent, not magnitude: speed is locked at 1.5 m/s for any stick ≥ 0.2; a flinch = stopping > 0.5 s, heading > 35° off for > 0.4 s, or lifting the thumb in the 0.8 s after a shot. This is exactly what c1_calm taught.
- **C5-3 · The walk has no numbers.** → **Fix:** 55 m (~37 s); shot 1 at 20 m (3 m ahead-left), shot 2 at 38 m (0.6 m from the feet, 0.5 s shake); in the last 6 m the men rise and nothing happens. Footsteps act as a metronome, the wind drops, a gold band lights on the stick base while the pace holds.
- **C5-4 · `haybah` changes lines only.** → **Fix:** stare length = 8 − 0.6 × haybah (min 5 s); at ≤ 1 he half-draws at 5 s. After each answer the circle reacts: a murmur of approval or a short laugh, and he leans back or forward.
- **C5-5 · A failed 8 s stare replays three exchanges.** → **Fix:** with H3's split the retry starts where he steps close.
- **C5-6 · Order contradiction.** جابر arrives "at the head of the caravan's first camels" before the signal that lets the caravan find the way. → **Fix:** he rides in alone, sent ahead by the Sheikh; c5_signal keeps its purpose in both branches.
- **C5-7 · c5_signal can sag after the climax.** → **Fix:** ≤ 60 m, running allowed, no fail; lighting = hold 1.5 s — the gesture that drew mud in ch1 now draws fire. The الحيا cue enters on ignition.
- **C5-8 · Replay from «الفصول» has no flags.** → **Fix:** use the saved flags, else defaults (`ration = self`, `gaveWater = false`), shown on the chapter card.

## 3. Pacing and time budget
| ch | today (best–worst, est.) | after fixes | shape to protect |
|---|---|---|---|
| 1 | 5:40–8:50 | ~5:00 | gentle ramp; small peak c1_calm at ~3:30; c1_ride is the breather |
| 2 | 6:30–10:00 | ~5:40 | short march → moral beat → storm; the peak is c2_return, not the search |
| 3 | 4:35–6:00 | ~5:00 | quiet wonder (stars) → peak (wolves, الأمعط) → release (سهيل) |
| 4 | 4:05–9:35 | ~5:30 | moral peak first, then the long lonely search, cliffhanger |
| 5 | 5:30–7:00 | ~5:45 | walk → words → stare → release → uplift (signal) → catharsis |
| Σ | 26–41 min | ~27 min | |

- **P1 · Ch2 opens with ~4 min of low intensity and then holds ~4 min at 12 m visibility** (eye strain, monotony). → **Fix:** C2-1 + C2-4: march ≤ 2:00, storm + return ≤ 2:30, and the air clears before the camp, not after.
- **P2 · c4_search is the only long stretch with nobody to react.** → **Fix:** a sign every 25–35 s, alternating type (bird, cairn, plant); nightfall at ~60 % of the path; الأمعط's far howl once at dusk — an echo of ch3, not a threat.
- **P3 · Ch5 stacks three composure tests in three minutes.** → **Fix:** keep each on a different channel so they never feel like one mechanic repeated: walk = left thumb, words = taps, stare = right thumb.

## 4. Action → immediate effect → later echo (gaps to close)
| player action | immediate effect to add | later echo to add |
|---|---|---|
| pulls the bucket (ch1) | mud on the rope; the Sheikh says nothing | c5_signal uses the same hold |
| calms الوضحا | three-stage reaction (T4) | she kneels at once in c2_wall while other camels fight; never bolts again |
| reads firm sand (ch2) | sound, dust, pace | مسفر's line at الجال; thirst level when the ration comes |
| the ration | consequence shot + قربة | storm effects (C2-3); a line at the fire; the Sheikh's last line in ch5 |
| inspects the wolf print | the Sheikh's remembered line | الأمعط is named in ch3 |
| finds فهيد | he runs to Dhari; the ripple stops | he sits by Dhari at the fire; his calf is what the wolves want |
| names the stars | lines + notes | marks on the horizon strip in ch4 |
| gives / refuses water | جابر or the Sheikh drinks; قربة | dry search or the collapse (C4-2); the verdict in ch5 |
| counts riflemen, hangs the rifle | numerals; rifle on the شداد | outlined shooters; هذال's first line |
| the three answers | the circle's reaction | stare length (C5-4); wording of the verdict |

## 5. Scope risks, ranked (same experience, lower cost)
1. **The storm** (wind, particles, prints, gusts, beacon, follower) is the costliest beat. → C2-4…C2-7 make it deterministic and bot-testable; ≤ 2 full-screen particle layers — the wall is fog colour, not overdraw.
2. **Camel locomotion.** الوضحا's legs are on screen ~8 min and her skin weights are generated in JS on an AI-made mesh. → Spike it before any chapter work. ARCHITECTURE's fallback (rigid bob, no leg motion) only passes if the riding camera hides the legs: 5.5 m back, +18°, saddle blanket and dust puffs over the feet.
3. **Skinned meshes ≤ 12.** ARCHITECTURE skins every camel and wolf, so c2_march is ~10 quadrupeds + up to 12 people and c5_verdict is 13 people + camels. → Only the five named clan members walk; extras are baked seated poses; caravan camels beyond 25 m and every kneeling camel take the unskinned path; four of six riflemen are static seated silhouettes.
4. **Five terrains.** → Three: ch1; ch2 + ch3 (the night camp is at الجال); ch4 + ch5 (the ridge found is the ridge stood on, origin re-centred on the basin). Better continuity, two fewer levels to light and test.
5. **Two orientations** → S3. **Three meters** → W3, W4 (one قربة; `player.stamina` and `caravan.effort` may stay in the contract, unseen). **Free dismount** → S6.
6. **Five wolves** → C3-8. **Camera:** sky-gaze (K1) and the stare frame (K4) are the only two additions — build each once (ch3, ch1) and reuse it.
7. **Time-based systems resist the `?test=1` bot** (18 s fades, random 6–9 s gusts). → Distance-driven prints and scripted gust budgets replay identically from a seed.
8. **First playable ≤ 8 MB.** → ch1 ships only hero, Sheikh, مسفر, فهيد, camel (two scales), tent, well, with 1024² textures; everything else streams behind c1_trail.

## 6. Frozen §4 values this review asks to reopen
Portrait FOV (S3) · run threshold (S4) · mount time (S6) · الفراسة afterglow and mounted rule (F1) · الثبات cone and gust timing (T2, T5) · thirst start values, drains and sip counts (W1, W2) · stamina (W3) · storm print fade (C2-5). Everything else is content or presentation and needs no unfreeze.
