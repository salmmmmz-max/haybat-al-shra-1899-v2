# SCRIPT — «هيبة الصحراء — ١٨٩٩» · السيناريو والنصّ الكامل

> The complete Arabic screenplay and story text of the five chapters.
> **Data:** `game/src/content/story.ar.js` → `STORY.names / cards / talk / text`. This file and the data file are generated from one source, so the index in §2 is exact: **16 cards · 114 talk blocks (352 lines, 29 of them barks) · 282 text keys**.
> Read with `docs/DESIGN.md` (v2 — beats, flags, numbers) and `docs/GLOSSARY.md` (vocabulary, customs, do / don't).
> Register: speech is Najdi / Bedouin dialect; cards, narrator lines, objectives, explicit hints (hint2), labels and prompts are simple فصحى.
> Naming: no real tribe, lineage, house or place. Given names only; the two groups are «ربع مانع» and «ربع ثامر».

## 1. Conventions

### 1.1 Key patterns and length limits

| pattern | in | used with | meaning | limit (characters) |
|---|---|---|---|---|
| `c1` … `c5` | `cards` | `d.card(id)` | chapter title card `{ num, title, sub }` | — |
| `intro`, `c1_end` … `c4_end`, `c3_lapse`, `c4_alone`, `c5_far`, `c5_dawn`, `c5_rain`, `epilogue` | `cards` | `d.card(id)` | narration cards (empty `num` / `title` = show the `sub` line only) | sub ≤ 90 |
| `<beatId>.<moment>` | `talk` | `d.talk(id)` | blocking dialogue block, lines = `[speakerId, text]` | ≤ 6 lines, each ≤ 110 |
| `<beatId>.bark.<n>` | `talk` | `d.bark(id)` | ONE in-play line, non-blocking, ≥ 3.5 s on screen, never inside a test window | ≤ 45 · 3–6 per chapter |
| `<beatId>.obj` · `.hint1` · `.hint2` | `text` | `d.objective(key)` | objective + two escalating hints (the hint keys are derived from the objective key) | 42 · 80 · 80 |
| `<beatId>.<step>.obj` · `.<step>.hint1` · `.<step>.hint2` | `text` | `d.objective(key)` | a further objective inside the same beat (e.g. `c1_gravel.follow.obj`) | 42 · 80 · 80 |
| `<beatId>.label.<verb>` | `text` | `interact.add({label})`, `steady.hold({labelKey})` | the verb shown on the context button | ≤ 16 |
| `<beatId>.prompt.<what>` (+ `.kb`) | `text` | `ui.hud.prompt(key)` | tutorial prompt; `.kb` = wording for `input.device === 'keyboard'` (fall back to the base key when there is no `.kb`) | ≤ 60 |
| `<id>.ask` | `text` | `d.choice(askKey, options)` | heading of a choice | ≤ 60 |
| `<id>.choice.<value>` | `text` | `d.choice(…, [{ key, value, confirm: true }])` | choice option | ≤ 38 |
| `<beatId>.toast.<what>` · `….circle` · `c2_storm.lost<n>` | `text` | `ui.hud.toast(G.t(key))` | non-blocking toast | ≤ 60 |
| `<beatId>.fail.<n>` · `c5_walk.fail` · `fail.thirst.*` | `text` | `d.failAndRestart(key)` (or a toast where the index says so) | fail-soft / retry line | ≤ 80 |
| `c1.bounds` … `c5.bounds` | `text` | on `player:bounds` | the chapter's turn-back line | ≤ 60 |
| `label.*` · `prompt.*` · `thirst.toast.*` | `text` | anywhere | shared fallbacks | as above |
| `c5_end.*` | `text` | ending screen | title, motto, one summary line per flag, credits, buttons | ≤ 60 |

Lengths are counted in code points **including** tashkeel. Strings contain no Latin letters, no ASCII digits and no ASCII punctuation (، ؛ ؟ … « » only), so they can be rendered as they are.

### 1.2 Speakers

| id | name plate | voice |
|---|---|---|
| `dhari` | ضاري | terse, respectful («سَمّ»، «أبشر»، «طال عمرك»); never talks back — he disagrees with a question. From ch4 he says the Sheikh's sayings as his own. |
| `mani` | الشيخ مانع | images and short proverbs; he ASKS («وش تشوف؟») — which reads as teaching until c3_fire reveals that he is seeing through Dhari's eyes. He touches, smells and listens where another man would look. |
| `misfer` | مسفر | blunt and warm; the voice of the arithmetic of water; says what he thinks, then admits it when he was wrong. |
| `moudi` | موضي | authority and tenderness; prayers («جعلني فداك»، «عساك سالم»); she runs the camp and has known the secret all along (c5_staff.truth). Calls the Sheikh «يا عمّي» (her father-in-law). |
| `fuhaid` | فهيد | a real child: literal, loud, loyal to his calf; repeats the grown-ups' proverbs. |
| `jaber` | جابر | a man of ربع ثامر — ثامر's nephew («يا عم»). Formal honour phrases; becomes their خويّ. |
| `thamer` | الشيخ ثامر | hard, proud and fair. Short sentences with an edge. He keeps his manners: returns the greeting, says «والنِّعم», and pours coffee only as his verdict. |
| `rider` | رجل من ربع ثامر | the sentry of c5_walk: curt commands. |
| `narrator` | *(empty)* | فصحى. One-line stage narration for gestures the clip set cannot play (a hand on a muddy rope, a face washed at dawn). Render without a name plate; let the camera hold on the action. |

### 1.3 Who speaks in the hints

- `hint1` (gentle, in-world): in **ch1–ch3** it is the Sheikh — live when he is present («الشيخ: …»), remembered when Dhari is alone («قال جدّي: …»). In **ch4–ch5** it is Dhari's own voice (no prefix, dialect): the grandson now reads alone.
- `hint2` (explicit): always فصحى, says what to press and where to go; the goal mark on the horizon strip appears with it.
- Toasts whose speaker is not Dhari carry the speaker inside the string («الشيخ: يمينك!»، «ثامر: …»).

### 1.4 Flags → text (branch map)

| flag | set by | text that depends on it |
|---|---|---|
| `ration` ∈ self · child · elder | `c2_ration.choice.*` | `c2_ration.self / .child / .elder` · `c2_storm.toast.answer` vs `.answer.hoarse` (self) · `c2_return.toast.thirst` (child, elder) · `c2_dusk.sip` + `c2_dusk.prompt.drink` (child, elder) · `fail.thirst.giver` vs `fail.thirst.self` · `c3_fire.thanks.child / .elder` · `c5_staff.ration.child / .elder` · `c5_end.sum.ration.*` |
| `gaveWater` | `c4_stranger.choice.give / .refuse` | `c4_stranger.give` vs `.refuse` + `.refuse.after` · `c4_collapse.gave` vs `.refused` · `c4_search.toast.dry` (gave) vs `c4_search.prompt.drink` + `.toast.sip` (refused) · `c5_verdict.gave` + `.gave.oath` vs `c5_verdict.refused` · `c5_signal.gave` vs `c5_signal.refused` + `.refused.sulh` · `c5_staff.gave` vs `.refused` · `c5_end.sum.water.*` |
| `sawWolfPrint` | inspecting `c1_gravel.wolf` | `c3_alpha.named` vs `.unnamed` · `c5_end.sum.wolf.*` |
| `leftRifle` | `c5_scout.label.hang` | `c5_words.open.unarmed` vs `.armed` · `c5_scout.toast.armed` · `c5_end.sum.rifle.*` |
| `haybah` 0–4 | the two answers of `c5_words` | stare length (8 − 0.6 × haybah s, min 5) · `c5_stare.toast.stage3` (haybah ≤ 1) · `c5_verdict.words.high` (≥ 3) / `.mid` (2) / `.low` (≤ 1) · `c5_end.sum.haybah.<n>` |
| *(march quality — not a flag)* | time in soft sand in `c2_march` | `c2_ration.arrive.firm` vs `.arrive.soft` |

### 1.5 The words of `c5_words` — effect on `haybah`

Truth, lineage and الدخالة raise it; evasion and bravado (الهياط) lower it. `haybah = clamp(effect₁ + effect₂, 0, 4)`.

| exchange | option key | Dhari's answer (the option text) | هيبة | why | ثامر's reaction block | the circle (toast) |
|---|---|---|---|---|---|---|
| r1 | `c5_words.r1.choice.a` | «أنا ضاري… والشيخ مانع جدّي» | **+2** | truth + lineage | `c5_words.r1.a` | `c5_words.r1.a.circle` — «همهمة في الحلقة… وأنزل أحد الرماة بندقه.» |
| r1 | `c5_words.r1.choice.b` | «اسمي ضاري… وجايّك بحاجة» | **+1** | true, but he holds the lineage back until asked again | `c5_words.r1.b` | `c5_words.r1.b.circle` — «سكتت الحلقة… تنتظر كلمة الشيخ.» |
| r1 | `c5_words.r1.choice.c` | «واحدٍ من رجاله… والاسم ما يهمّ» | **−1** | evasion | `c5_words.r1.c` | `c5_words.r1.c.circle` — «ضحكة قصيرة في الحلقة… ومال الشيخ إلى الأمام.» |
| r2 | `c5_words.r2.choice.a` | «جيت للما… وما أرجع بلاه» | **−1** | bravado | `c5_words.r2.a` | `c5_words.r2.a.circle` — «ضحك الرماة… واشتدّت قبضاتهم على البنادق.» |
| r2 | `c5_words.r2.choice.b` | «جيتك عاني… داخل على الله ثم عليك» | **+2** | الدخالة, with the truth of the need | `c5_words.r2.b` | `c5_words.r2.b.circle` — «همهمة استحسان… ورجع الشيخ بظهره إلى الوراء.» |
| r2 | `c5_words.r2.choice.c` | «نشتري وِردنا… ببكرتين من خيار البل» | **0** | honest but misjudged: water is given or withheld, never sold | `c5_words.r2.c` | `c5_words.r2.c.circle` — «ابتسم بعضهم… وهزّ شايبٌ في الحلقة رأسه.» |

Exchange 1 is asked by `c5_words.r1.q` (heading `c5_words.r1.ask`), exchange 2 by `c5_words.r2.q` (heading `c5_words.r2.ask`). Each reaction block opens with Dhari's full spoken answer, so the option text can stay short.
Totals → stare: 4 → 5.6 s · 3 → 6.2 s · 2 → 6.8 s · 1 → 7.4 s + the inch of blade · 0 → 8.0 s + the inch of blade.

### 1.6 Fail-soft map (DESIGN §8)

| situation | key | shown as |
|---|---|---|
| thirst 0 in ch2, `ration` ≠ self | `fail.thirst.giver` | `d.failAndRestart(key)` — given water without reproach |
| thirst 0 in ch2 with `ration` = self, or in ch4 while the caravan is with him | `fail.thirst.self` | `d.failAndRestart(key)` — the Sheikh's sip and one piece of advice |
| thirst 0 alone in ch4 | `fail.thirst.alone` | `d.failAndRestart(key)`; he wakes at the last cairn |
| lost in the storm 30 / 60 / 90 s | `c2_storm.lost1 / lost2 / lost3` | toasts, in both storm legs |
| a missed gust | `c2_return.fail.knock` | toast with the 2 s knockdown (no restart) |
| third miss in a wolf wave | `c3_wolves.fail.wave` | retry card; that wave restarts |
| flinch before الأمعط | `c3_alpha.fail.1 / .2 / .3` | retry card; `.3` is the sterner line, then the hold auto-steadies |
| flinch on the walk | `c5_walk.fail` | the jeer; retry from the ridge foot |
| flinch in the stare | `c5_stare.fail.1 / .2 / .3` | retry card; `.3` is the sterner line, then the hold auto-steadies |
| running at الوضحا (ch1) | `c1_calm.toast.warn` · `c1_calm.toast.bolt` | toasts |
| leaving the playable radius | `c1.bounds` … `c5.bounds` | toast + the gentle push |

### 1.7 Notes for the gameplay programmers

1. **Hints follow the objective key.** `objectives.set('x.obj')` derives `x.hint1` / `x.hint2`; every `.obj` in the index has both.
2. **Keyboard wording.** Six prompts have a `.kb` twin: `c1_wake.prompt.move`, `c1_wake.prompt.look`, `c1_trail.prompt.run`, `c1_ride.prompt.ride`, `c1_ride.prompt.trot`, `c5_walk.prompt.pace`. All other prompts name on-screen buttons and fit every device.
3. **Choices.** `d.choice('c2_ration.ask', [{ key: 'c2_ration.choice.self', value: 'self', confirm: true }, …])`; show `prompt.confirm` under the options (0.5 s hold). After «اشرب نصيبك» the player performs the hold-to-drink (`c2_ration.prompt.drink`).
4. **Bark budget.** The ≤ 6 barks per chapter are all listed in §2.2. Every other in-play line is a `.toast.*` string. Do not turn toasts into barks without dropping another bark.
5. **Test windows.** `c3_alpha.toast.stage*`, `c5_stare.toast.stage*` and the `c5_walk` toasts are written to appear AFTER a feint / a shot / a move has resolved, never during it.
6. **Thirst collapse.** The kernel currently calls `failAndRestart('fail.thirst')` (a UI string). Branch it to the three `fail.thirst.*` keys of §1.6.
7. **الثبات labels.** `label.steady` equals the UI key `steady.hold`; each beat also has its own `.label.steady` / `.label.brace` so it can pass its own `labelKey`.
8. **Cards.** `c1`…`c5` are the title cards (chapter start, and the chapter-select screen); `cN_end` close chapters 1–4; `epilogue` closes the story.
9. **Verbatim text — do not edit:** the Qur'an quotation in `c3_polaris.jady` (النحل ١٦), the prayers in `c5_staff.rain`, and the definition of «الهيبة» in `c5_staff.haybah` (DESIGN §2).
10. **Optional lines** (the story holds without them): `c1_gravel.wolf` (optional by design) · `c2_march.toast.fork / .firm` · `c2_return.toast.shield / .near` · `c3_wolves.toast.right / .left / .front` · `c3_wolves.prompt.eye` · `c4_search2.toast.fork / .night` · `c5_scout.toast.armed` · `thirst.toast.*` · `c5_staff.ration.*` · `c5_verdict.words.*`.

## 2. INDEX — every id and key

Complete and exact: generated from the same source as `story.ar.js`. Order = story order. “blocking” = `d.talk(id)`; “bark” = `d.bark(id)`; text keys = `G.t(key)`.

### 2.1 Cards — `STORY.cards` (16)

| id | num · title | when it plays |
|---|---|---|
| `c1` | الفصل الأول · الأثر | Chapter 1 title card — shown at the end of c1_intro, when the camera has landed behind Dhari (also used by chapter select). |
| `intro` | الربع الخالي | Opening place/time card over black, before the glide. |
| `c1_end` | الرحيل | Closing card of chapter 1 (the "Chapter card" of c1_decision). |
| `c2` | الفصل الثاني · المسير | Chapter 2 title card — at chapter start, before c2_march (also chapter select). |
| `c2_end` | الجال | Closing card of chapter 2. |
| `c3` | الفصل الثالث · ليلة سهيل | Chapter 3 title card — at chapter start, before c3_fire (also chapter select). |
| `c3_lapse` | — (sub only) | Narration card over the star time-lapse at the start of c3_suhail. |
| `c3_end` | ذَنَب السِّرحان | Closing card of chapter 3 («ذنب السرحان» = the false dawn, "the wolf's tail"). |
| `c4` | الفصل الرابع · حقّ الملح | Chapter 4 title card — at chapter start, before c4_stranger (also chapter select). |
| `c4_alone` | — (sub only) | Narration card at the start of c4_search, over the first wide shot of the lone rider. |
| `c4_end` | أم الحيا | Closing (cliffhanger) card of chapter 4. |
| `c5` | الفصل الخامس · الهيبة | Chapter 5 title card — at chapter start, before c5_scout (also chapter select). |
| `c5_far` | — (sub only) | Narration card over the far shot of the signal fire. |
| `c5_dawn` | — (sub only) | Narration card over the time-lapse to dawn and the descent of the caravan. |
| `c5_rain` | الحيا | Narration card over the rising camera and the rain. |
| `epilogue` | ١٣١٧هـ · سنة ضاري | Epilogue card — the last card of the story, before c5_end. |

### 2.2 Talk blocks — `STORY.talk` (114; 352 lines)

**Ch1 «الأثر» — L1 «المراح», dawn → morning. The camp by the dying well.**

| id | type · lines | speakers | when it plays |
|---|---|---|---|
| `c1_intro.vo` | blocking · 2 | mani | Voice-over during the dune glide (auto-advancing, not input-blocking). Then card c1. |
| `c1_wake.bark.1` | bark · 1 | moudi | Bark as Dhari passes the tent (first 5 m). |
| `c1_wake.bark.2` | bark · 1 | fuhaid | Bark when فهيد and الحوار cross the path (~10 m from the well). Seeds الوضحا's absence. |
| `c1_wake.greet` | blocking · 5 | mani, dhari | Blocking, on «كلّم جدّك». Ends the beat. |
| `c1_well.mud` | blocking · 2 | dhari, narrator | Blocking, right after the hold completes (bucket up, mud on the rope). |
| `c1_well.bark.1` | bark · 1 | mani | Bark with the قطا flight crossing the well: they do not land where there is no water (the proverb seeds ch2 and the ch4 exam). |
| `c1_well.misfer` | blocking · 3 | misfer, mani | Blocking, after the قطا bark. Ends the beat. |
| `c1_firasa.rule` | blocking · 4 | mani, dhari | Blocking, on arrival at the pen gate. The eye button appears when it closes. |
| `c1_firasa.wrong` | blocking · 3 | mani, dhari | Blocking, when the OLD set is inspected. The player then inspects the right one. |
| `c1_firasa.right` | blocking · 6 | mani, dhari | Blocking, when the FRESH set is inspected. Ends the beat; Dhari goes on alone. |
| `c1_gravel.twig` | blocking · 1 | dhari | Blocking one-liner (Dhari kneels) when the twig is inspected. |
| `c1_gravel.dung` | blocking · 1 | dhari | Blocking one-liner when the dung is inspected. After BOTH clues the trail re-appears. |
| `c1_gravel.wolf` | blocking · 3 | dhari | Blocking, when the wolf print is inspected. Sets sawWolfPrint = true. |
| `c1_calm.bark.1` | bark · 1 | dhari | Bark when she comes into view (~40 m). Plants the question c1_decision answers. |
| `c1_ride.bark.1` | bark · 1 | dhari | Bark on the ridge crest when the camp is revealed. |
| `c1_ride.bark.2` | bark · 1 | fuhaid | Bark on arrival, as الحوار runs to its mother. |
| `c1_decision.green` | blocking · 5 | misfer, narrator, mani, dhari | Blocking, when Dhari dismounts by the Sheikh. |
| `c1_decision.rahil` | blocking · 6 | misfer, mani, moudi | Blocking, follows c1_decision.green. |
| `c1_decision.eyes` | blocking · 3 | mani, dhari | Blocking, follows c1_decision.rahil. Then card c1_end. |

**Ch2 «المسير» — L2 «الجال», harsh noon → sandstorm → dusk.**

| id | type · lines | speakers | when it plays |
|---|---|---|---|
| `c2_march.lead` | blocking · 5 | mani, dhari, misfer | Blocking, at beat start before control is given. |
| `c2_march.bark.1` | bark · 1 | mani | Bark when the رجم landmark enters view (seeds the ch4 cairns; Dhari repeats the line in c4_search). |
| `c2_march.bark.2` | bark · 1 | misfer | Bark when the lead camel has been in soft sand for 2 s (once per entry, 12 s cooldown). |
| `c2_march.bark.3` | bark · 1 | mani | Bark with the قطا flight (the Sheikh hears them and asks for their heading). |
| `c2_ration.arrive.firm` | blocking · 1 | misfer | Blocking one-liner on arrival IF the caravan spent < 6 s in soft sand during c2_march. |
| `c2_ration.arrive.soft` | blocking · 1 | misfer | Blocking one-liner on arrival IF the caravan spent ≥ 6 s in soft sand. |
| `c2_ration.share` | blocking · 3 | misfer, moudi, narrator | Blocking, once everyone is seated. Leads straight into the choice. |
| `c2_ration.self` | blocking · 3 | narrator, mani | Blocking, ration = self, after the drink completes. No reproach — a lesson. |
| `c2_ration.child` | blocking · 4 | fuhaid, dhari, narrator, mani | Blocking, ration = child (the consequence shot of فهيد drinking sits on the narrator line). |
| `c2_ration.elder` | blocking · 5 | dhari, mani, narrator | Blocking, ration = elder (consequence shot of the Sheikh drinking on the narrator line). |
| `c2_wall.sky` | blocking · 4 | mani, dhari, misfer | Blocking, at beat start (sky preset turning to storm). |
| `c2_wall.bark.1` | bark · 1 | mani | Bark 1 s before the first gust warning (the gust lesson). |
| `c2_wall.fuhaid` | blocking · 5 | moudi, misfer, dhari, mani | Blocking, after the braced gust; the last line plays over the 2 s shot of فهيد's prints. Ends the beat. |
| `c2_storm.found` | blocking · 4 | fuhaid, dhari | Blocking, when Dhari reaches the bush (wind ducked). Ends the beat. |
| `c2_return.bark.1` | bark · 1 | fuhaid | Bark after the first braced gust (never inside a gust window). |
| `c2_return.bark.2` | bark · 1 | mani | Bark between gusts 2 and 3: the Sheikh's rhythmic call (twin of the ripple rings). |
| `c2_dusk.back` | blocking · 5 | moudi, fuhaid, misfer, mani | Blocking, on reaching موضي. |
| `c2_dusk.sip` | blocking · 3 | moudi, dhari | Blocking, ONLY when ration ≠ self. Then the player performs the hold-to-drink. |

**Ch3 «ليلة سهيل» — L2 at night → first light. The camp at الجال.**

| id | type · lines | speakers | when it plays |
|---|---|---|---|
| `c3_fire.sit` | blocking · 3 | fuhaid, dhari, misfer | Blocking, when Dhari sits. |
| `c3_fire.thanks.child` | blocking · 2 | fuhaid | Blocking, ONLY when ration = child. |
| `c3_fire.thanks.elder` | blocking · 2 | mani | Blocking, ONLY when ration = elder. |
| `c3_fire.ask` | blocking · 5 | mani, dhari | Blocking. Camera: two-shot, then slowly onto the Sheikh's face. |
| `c3_fire.reveal` | blocking · 5 | narrator, mani, dhari | Blocking. Music: the low rababa drone enters on line 2. |
| `c3_fire.why` | blocking · 6 | dhari, mani | Blocking, follows c3_fire.reveal. |
| `c3_fire.eyes` | blocking · 5 | mani, dhari | Blocking, follows c3_fire.why. Ends the beat; the horizon strip appears. |
| `c3_polaris.dipper` | blocking · 5 | dhari, mani | Blocking, when بنات نعش is found (stars:found). |
| `c3_polaris.jady` | blocking · 4 | dhari, mani | Blocking, when الجدي is found. Ends the beat. |
| `c3_wolves.howl` | blocking · 5 | narrator, misfer, fuhaid, mani | Blocking, at beat start (the howl SFX precedes line 1). |
| `c3_wolves.bark.1` | bark · 1 | fuhaid | Bark as wave 1 starts (before the first telegraph). |
| `c3_wolves.bark.2` | bark · 1 | fuhaid | Bark on a missed lunge (calf dragged 2 m; once per wave). |
| `c3_wolves.bark.3` | bark · 1 | misfer | Bark in the 6 s breath after wave 1. |
| `c3_wolves.bark.4` | bark · 1 | mani | Bark in the breath before wave 3 (announces the double lunge). |
| `c3_alpha.named` | blocking · 5 | narrator, dhari, mani | Blocking, at beat start WHEN sawWolfPrint = true: the Sheikh names him. |
| `c3_alpha.unnamed` | blocking · 5 | narrator, dhari, mani | Blocking, at beat start WHEN sawWolfPrint = false. |
| `c3_alpha.win` | blocking · 5 | narrator, fuhaid, misfer, mani | Blocking, after the hold completes (frame-drum hit + exhale first). Ends the beat. |
| `c3_suhail.ask` | blocking · 4 | mani, dhari | Blocking, after the time-lapse. |
| `c3_suhail.bark.1` | bark · 1 | mani | Bark when the gaze rests on the decoy (Dhari is taken to have described it); fires together with hint2. |
| `c3_suhail.found` | blocking · 5 | dhari, mani | Blocking, when سهيل is found. |

**Ch4 «حقّ الملح» — L3 «أم الحيا», morning → dusk → night.**

| id | type · lines | speakers | when it plays |
|---|---|---|---|
| `c4_stranger.bark.1` | bark · 1 | dhari | Bark at beat start, when the vultures enter view. |
| `c4_stranger.bark.2` | bark · 1 | mani | Bark 4 s after bark.1. |
| `c4_stranger.find` | blocking · 6 | dhari, misfer, jaber, mani | Blocking, on «تفقّد الرجل». Leads straight into the choice. |
| `c4_stranger.give` | blocking · 5 | dhari, narrator, jaber, mani, misfer | Blocking, gaveWater = true. |
| `c4_stranger.refuse` | blocking · 6 | dhari, narrator, mani, jaber | Blocking, gaveWater = false. |
| `c4_stranger.refuse.after` | blocking · 2 | dhari, mani | Blocking, gaveWater = false, right after c4_stranger.refuse. |
| `c4_stranger.news` | blocking · 6 | jaber, mani, misfer | Blocking, both branches. |
| `c4_stranger.salt` | blocking · 3 | jaber, mani, narrator | Blocking, both branches. Ends the beat (fade). |
| `c4_collapse.gave` | blocking · 4 | narrator, misfer, moudi, mani | Blocking, at beat start, gaveWater = true. |
| `c4_collapse.refused` | blocking · 6 | narrator, misfer, dhari, mani | Blocking, at beat start, gaveWater = false (the cost of refusing: his collapse; Dhari keeps the sip). |
| `c4_collapse.send` | blocking · 6 | mani, dhari | Blocking, both branches. |
| `c4_collapse.go` | blocking · 6 | jaber, moudi, fuhaid, dhari, mani | Blocking, both branches. Then control: mount and leave. |
| `c4_search.bark.1` | bark · 1 | dhari | Bark with the first قطا flight (he now says the Sheikh's proverb himself). |
| `c4_search.bark.2` | bark · 1 | dhari | Bark on reaching cairn 1 (the Sheikh's ch2 line, now in Dhari's mouth). |
| `c4_search2.bones` | blocking · 3 | dhari | Blocking, on «افحص العظام» (only if the player took the false trail). The true cairn is then marked. |
| `c4_search2.bark.1` | bark · 1 | dhari | Bark shortly after nightfall, when the سهيل mark shows on the strip. |
| `c4_search2.bark.2` | bark · 1 | dhari | Bark after the single far howl (between cairns 3 and 4). Sets up the last line of c4_ridge. |
| `c4_ridge.see` | blocking · 3 | dhari | Blocking, inside the 20 m crest volume. Then card c4_end. |

**Ch5 «الهيبة» — L3 «أم الحيا», night → dawn. The well.**

| id | type · lines | speakers | when it plays |
|---|---|---|---|
| `c5_scout.bark.1` | bark · 1 | dhari | Bark when the sixth rifleman is numbered. |
| `c5_walk.bark.1` | bark · 1 | rider | Bark at ~6 m of the walk. |
| `c5_walk.bark.2` | bark · 1 | dhari | Bark at ~12 m (must end before shot 1 at 20 m). |
| `c5_walk.bark.3` | bark · 1 | rider | Bark at ~30 m (must end before shot 2 at 38 m). |
| `c5_walk.bark.4` | bark · 1 | rider | Bark in the last 6 m, as the men rise. |
| `c5_words.open.unarmed` | blocking · 5 | narrator, dhari, thamer | Blocking, at beat start WHEN leftRifle = true. |
| `c5_words.open.armed` | blocking · 5 | narrator, dhari, thamer | Blocking, at beat start WHEN leftRifle = false. |
| `c5_words.r1.q` | blocking · 1 | thamer | Blocking, before choice 1. |
| `c5_words.r1.a` | blocking · 3 | dhari, thamer | Blocking, after option r1.a (he leans back). |
| `c5_words.r1.b` | blocking · 4 | dhari, thamer | Blocking, after option r1.b (he waits, unmoved). |
| `c5_words.r1.c` | blocking · 3 | dhari, thamer | Blocking, after option r1.c (he leans forward). |
| `c5_words.r2.q` | blocking · 2 | thamer | Blocking, before choice 2. |
| `c5_words.r2.a` | blocking · 3 | dhari, thamer | Blocking, after option r2.a (he leans forward). |
| `c5_words.r2.b` | blocking · 5 | dhari, narrator, thamer | Blocking, after option r2.b (he leans back). |
| `c5_words.r2.c` | blocking · 3 | dhari, thamer | Blocking, after option r2.c (he does not move). |
| `c5_words.rise` | blocking · 2 | thamer, narrator | Blocking, after the second reaction. Ends the beat (checkpoint before the stare). |
| `c5_verdict.words.high` | blocking · 1 | thamer | Blocking, at beat start WHEN haybah ≥ 3 (before the gave / refused block). |
| `c5_verdict.words.mid` | blocking · 1 | thamer | Blocking, at beat start WHEN haybah = 2. |
| `c5_verdict.words.low` | blocking · 1 | thamer | Blocking, at beat start WHEN haybah ≤ 1. |
| `c5_verdict.gave` | blocking · 6 | narrator, jaber, thamer | Blocking, gaveWater = true, after c5_verdict.words.*. |
| `c5_verdict.gave.oath` | blocking · 6 | narrator, thamer, dhari | Blocking, gaveWater = true, follows c5_verdict.gave. The oath is resolved by the bond of salt. |
| `c5_verdict.refused` | blocking · 6 | narrator, thamer | Blocking, gaveWater = false, after c5_verdict.words.*. The oath is resolved by كفّارة اليمين. |
| `c5_verdict.signal` | blocking · 3 | dhari, thamer | Blocking, both branches. Ends the beat. |
| `c5_signal.bark.1` | bark · 1 | dhari | Bark as the pile catches (the الحيا music cue enters here). Light is the one thing the Sheikh still sees. |
| `c5_signal.far` | blocking · 4 | misfer, mani, moudi | Auto-advancing dialogue inside the cinematic (camp under the acacia). |
| `c5_signal.drink` | blocking · 4 | thamer, fuhaid, misfer, moudi | Dialogue inside the cinematic, at the trough. |
| `c5_signal.gave` | blocking · 6 | thamer, mani | Blocking, gaveWater = true: the reconciliation. |
| `c5_signal.refused` | blocking · 6 | jaber, thamer, mani | Blocking, gaveWater = false: جابر's testimony about the Sheikh. |
| `c5_signal.refused.sulh` | blocking · 5 | thamer, mani | Blocking, gaveWater = false, follows c5_signal.refused: the two old men reconcile. |
| `c5_staff.water` | blocking · 4 | dhari, narrator, mani | Blocking, after the bucket comes up full. |
| `c5_staff.truth` | blocking · 6 | mani, misfer, moudi, thamer | Blocking, follows c5_staff.water. |
| `c5_staff.staff` | blocking · 4 | narrator, mani, dhari | Blocking, follows c5_staff.truth. |
| `c5_staff.ration.child` | blocking · 1 | mani | Blocking, ONLY when ration = child, between c5_staff.staff and c5_staff.haybah. |
| `c5_staff.ration.elder` | blocking · 1 | mani | Blocking, ONLY when ration = elder, between c5_staff.staff and c5_staff.haybah. |
| `c5_staff.haybah` | blocking · 2 | mani | Blocking, all branches: the definition of «الهيبة». Dhari takes the staff on the second line. |
| `c5_staff.gave` | blocking · 1 | mani | Blocking, gaveWater = true — the one differing line, right after c5_staff.haybah (closes the loop with c1_wake.greet). |
| `c5_staff.refused` | blocking · 1 | mani | Blocking, gaveWater = false — the one differing line, right after c5_staff.haybah. |
| `c5_staff.rain` | blocking · 4 | narrator, fuhaid, moudi, mani | Blocking, after the staff changes hands (thunder SFX first). |
| `c5_staff.last` | blocking · 5 | fuhaid, dhari, mani | Blocking — the final dialogue of the game. The camera starts rising on the last line. |

### 2.3 Text keys — `STORY.text` (282)

**Shared keys — used by any chapter**

| key | kind | when it plays |
|---|---|---|
| `label.talk` | label | Generic context verb: talk to the focused NPC (fallback when a beat defines no label of its own). |
| `label.inspect` | label | Generic context verb: inspect a sign / clue. |
| `label.mount` | label | Generic context verb: mount at a scripted prompt. |
| `label.dismount` | label | Generic context verb: dismount at a scripted prompt. |
| `label.steady` | label | Generic الثبات label (same wording as the UI key steady.hold). |
| `label.drink` | label | Generic drink verb (قربة icon). |
| `label.take` | label | Generic context verb: pick something up. |
| `label.sit` | label | Generic context verb: sit down. |
| `prompt.confirm` | prompt | Shown under every flag-setting choice (0.5 s hold to confirm): c2_ration, c4_stranger, c5_words. |
| `prompt.drink` | prompt | Generic hold-to-drink prompt (0.6 s on the قربة icon). |
| `thirst.toast.40` | toast | survival:level step 40 (dry breath + one icon pulse). Ch2 and ch4 only. |
| `thirst.toast.30` | toast | survival:level step 30 (heat-haze vignette, heavy breath). |
| `thirst.toast.15` | toast | survival:level step 15 (running disabled, heartbeat). |
| `fail.thirst.giver` | fail / retry line | Thirst 0 → collapse card when ration ≠ self (ch2) — given water without reproach. Passed to d.failAndRestart(). |
| `fail.thirst.self` | fail / retry line | Thirst 0 → collapse card when ration = self (ch2), or in ch4 while the caravan is still with Dhari. |
| `fail.thirst.alone` | fail / retry line | Thirst 0 while alone in ch4 (c4_search / c4_search2 / c4_ridge): الوضحا kneels to shade him; resume at the last cairn. |

**Ch1 «الأثر» — L1 «المراح», dawn → morning. The camp by the dying well.**

| key | kind | when it plays |
|---|---|---|
| `c1.bounds` | turn-back line | Ch1 soft boundary (player:bounds): the Sheikh's call + a gentle push back. |
| `c1_intro.prompt.rotate` | prompt | Rotate hint while the stage is drawn rotated (portrait viewport), until the first input. |
| `c1_intro.label.skip` | label | Skip button of the intro (appears after 2 s). |
| `c1_wake.obj` | objective | Objective from the first frame of control. |
| `c1_wake.prompt.move` | prompt | Tutorial prompt 1 (touch): shown at once, cleared after the first 1 m walked. |
| `c1_wake.prompt.move.kb` | prompt | Keyboard variant of prompt 1 (input.device = keyboard). |
| `c1_wake.prompt.look` | prompt | Tutorial prompt 2 (touch): only after 3 m walked. |
| `c1_wake.prompt.look.kb` | prompt | Keyboard/mouse variant of prompt 2. |
| `c1_wake.hint1` | hint | Hint 1 (12 s without progress — the very first objective). |
| `c1_wake.hint2` | hint | Hint 2 (explicit) + goal mark on the strip. |
| `c1_wake.label.talk` | label | Context verb within 2.4 m of the Sheikh. |
| `c1_well.obj` | objective | Objective. |
| `c1_well.label.pull` | label | Context verb at the well (hold 1.5 s). |
| `c1_well.prompt.hold` | prompt | Tutorial prompt: the first hold of the game (context button). |
| `c1_well.hint1` | hint | Hint 1 (25 s). |
| `c1_well.hint2` | hint | Hint 2 (50 s). |
| `c1_firasa.obj` | objective | Objective (set after c1_firasa.rule). |
| `c1_firasa.prompt.eye` | prompt | Tutorial prompt: first use of الفراسة (eye button just appeared). |
| `c1_firasa.prompt.afterglow` | prompt | Tutorial prompt after the first release (teaches the 6 s afterglow). |
| `c1_firasa.label.inspect` | label | Context verb on either track set (Dhari kneels). |
| `c1_firasa.hint1` | hint | Hint 1 (25 s). |
| `c1_firasa.hint2` | hint | Hint 2 (50 s). |
| `c1_trail.obj` | objective | Objective. |
| `c1_trail.prompt.run` | prompt | Tutorial prompt (touch) after ~10 m on the trail: running (knob turns gold). |
| `c1_trail.prompt.run.kb` | prompt | Keyboard variant of the run prompt. |
| `c1_trail.hint1` | hint | Hint 1 (25 s) — remembered line. |
| `c1_trail.hint2` | hint | Hint 2 (50 s). |
| `c1_trail.toast.read` | toast | Toast (Dhari, to himself) at the ridge crest, halfway along the trail. |
| `c1_gravel.obj` | objective | Objective when the trail breaks. |
| `c1_gravel.hint1` | hint | Hint 1 (25 s) — remembered line. |
| `c1_gravel.hint2` | hint | Hint 2 (50 s). |
| `c1_gravel.label.twig` | label | Context verb on the bitten twig. |
| `c1_gravel.label.dung` | label | Context verb on the dung. |
| `c1_gravel.follow.obj` | objective | Objective after both clues (the restored trail, ~85 m). |
| `c1_gravel.follow.hint1` | hint | Hint 1 for the restored trail — remembered line. |
| `c1_gravel.follow.hint2` | hint | Hint 2 for the restored trail. |
| `c1_gravel.label.wolf` | label | Context verb on the wolf print (optional). |
| `c1_calm.obj` | objective | Objective. |
| `c1_calm.hint1` | hint | Hint 1 (25 s) — remembered line. |
| `c1_calm.hint2` | hint | Hint 2 (50 s). |
| `c1_calm.toast.warn` | toast | Toast, once: running inside 30 m (she raises her head and snorts). |
| `c1_calm.toast.bolt` | toast | Toast each time she bolts / shies (running inside 18 m). |
| `c1_calm.label.steady` | label | الثبات label at 5 m (first use — safe, no test window). |
| `c1_calm.prompt.steady` | prompt | Tutorial prompt: first الثبات hold. |
| `c1_calm.toast.soothe` | toast | Toast (Dhari, low voice) at stage 1 of the hold (33 %: her head lowers). |
| `c1_calm.toast.kneel` | toast | Toast at 100 %: she steps in and kneels on the kneel-call. |
| `c1_calm.mount.obj` | objective | Objective once she kneels. |
| `c1_calm.label.mount` | label | Context verb on the kneeling camel (she kneels → he sits → she rises). |
| `c1_calm.mount.hint1` | hint | Hint 1 while she waits kneeling. |
| `c1_calm.mount.hint2` | hint | Hint 2 while she waits kneeling. |
| `c1_calm.toast.mount` | toast | Toast (Dhari) as she rises with him in the saddle. |
| `c1_ride.obj` | objective | Objective. |
| `c1_ride.prompt.ride` | prompt | Tutorial prompt at beat start (touch; one-thumb riding). |
| `c1_ride.prompt.ride.kb` | prompt | Keyboard variant of the riding prompt. |
| `c1_ride.prompt.trot` | prompt | Tutorial prompt after 5 s (touch): trot. |
| `c1_ride.prompt.trot.kb` | prompt | Keyboard variant of the trot prompt. |
| `c1_ride.hint1` | hint | Hint 1 (25 s) — remembered line. |
| `c1_ride.hint2` | hint | Hint 2 (50 s). |
| `c1_decision.obj` | objective | Objective (the last metres to the Sheikh; she kneels at the scripted prompt). |
| `c1_decision.hint1` | hint | Hint 1 (25 s). |
| `c1_decision.hint2` | hint | Hint 2 (50 s). |

**Ch2 «المسير» — L2 «الجال», harsh noon → sandstorm → dusk.**

| key | kind | when it plays |
|---|---|---|
| `c2.bounds` | turn-back line | Ch2 soft boundary: the Sheikh's call + a gentle push back. |
| `c2_march.obj` | objective | Objective. |
| `c2_march.prompt.lead` | prompt | Tutorial prompt at the first metres (leading; no trot while leading). |
| `c2_march.prompt.water` | prompt | Tutorial prompt when the قربة HUD appears (after ~20 m). |
| `c2_march.hint1` | hint | Hint 1 (25 s) — carries the «وش تشوف؟» refrain. |
| `c2_march.hint2` | hint | Hint 2 (50 s). |
| `c2_march.toast.fork` | toast | Toast when the fork comes into view, before the caravan commits to a side (the «وش تشوف؟» refrain). |
| `c2_march.toast.firm` | toast | Toast when the caravan is back on firm ground after a soft stretch. |
| `c2_ration.obj` | objective | Objective on arrival (kneel الوضحا in the shade). |
| `c2_ration.label.kneel` | label | Context verb at the shade (scripted dismount). |
| `c2_ration.hint1` | hint | Hint 1 (25 s). |
| `c2_ration.hint2` | hint | Hint 2 (50 s). |
| `c2_ration.ask` | choice heading | Choice heading (d.choice promptKey). |
| `c2_ration.choice.self` | choice option | Option → ration = self. The player then performs the hold-to-drink. |
| `c2_ration.choice.child` | choice option | Option → ration = child. |
| `c2_ration.choice.elder` | choice option | Option → ration = elder. |
| `c2_ration.prompt.drink` | prompt | Tutorial prompt after choosing «اشرب نصيبك» (first hold-to-drink, +35). |
| `c2_wall.obj` | objective | Objective. |
| `c2_wall.label.kneel` | label | Context verb at the camel ring. |
| `c2_wall.hint1` | hint | Hint 1 (25 s). |
| `c2_wall.hint2` | hint | Hint 2 (50 s). |
| `c2_wall.toast.wadha` | toast | Toast as she kneels at once while the other camels fight (echo of c1_calm). |
| `c2_wall.brace.obj` | objective | Objective for the taught gust. |
| `c2_wall.label.brace` | label | الثبات label during the gust warning (2.5 s). |
| `c2_wall.prompt.brace` | prompt | Tutorial prompt with the first gust warning. |
| `c2_wall.brace.hint1` | hint | Hint 1 if the taught gust is missed (it repeats until braced once). |
| `c2_wall.brace.hint2` | hint | Hint 2 for the taught gust. |
| `c2_wall.toast.braced` | toast | Toast after the first successful brace. |
| `c2_storm.obj` | objective | Objective. |
| `c2_storm.hint1` | hint | Hint 1 (25 s) — remembered line. |
| `c2_storm.hint2` | hint | Hint 2 (50 s). |
| `c2_storm.prompt.voice` | prompt | Tutorial prompt at the first print gap (ripple rings = his call). |
| `c2_storm.label.brace` | label | الثبات label for the 2 teaching gusts. |
| `c2_storm.toast.call` | toast | Toast (Dhari shouting) at beat start and at each print gap. |
| `c2_storm.toast.answer` | toast | Toast (فهيد, far) answering at each gap — ration ≠ self (beacon 90 m). |
| `c2_storm.toast.answer.hoarse` | toast | Same answer when ration = self: his call is hoarse (beacon 60 m, fainter ripple). |
| `c2_storm.lost1` | toast | Lost 30 s (no progress): the call grows and the ripple becomes an arrow. Used in c2_storm AND c2_return. |
| `c2_storm.lost2` | toast | Lost 60 s: الحوار moans as a second beacon (out: from فهيد's bush; back: it pulls toward its mother at the camp). |
| `c2_storm.lost3` | toast | Lost 90 s: a visible glow on the target. |
| `c2_return.obj` | objective | Objective. |
| `c2_return.hint1` | hint | Hint 1 (25 s) — remembered line. |
| `c2_return.hint2` | hint | Hint 2 (50 s). |
| `c2_return.label.brace` | label | الثبات label for the 5 gusts. |
| `c2_return.toast.shield` | toast | Toast after a braced gust (max twice). |
| `c2_return.toast.thirst` | toast | Toast when a giver (ration ≠ self) crosses thirst 30 here. |
| `c2_return.toast.near` | toast | Toast in the last 30 m, as visibility opens 12 → 25 m. |
| `c2_return.fail.knock` | fail / retry line | Toast on a missed gust (2 s knockdown + 3 m slide). Soft — no restart. |
| `c2_dusk.obj` | objective | Objective (the last metres to the fire). |
| `c2_dusk.hint1` | hint | Hint 1 (25 s). |
| `c2_dusk.hint2` | hint | Hint 2 (50 s). |
| `c2_dusk.prompt.drink` | prompt | Prompt for the giver's sip (same gesture as the ration). |

**Ch3 «ليلة سهيل» — L2 at night → first light. The camp at الجال.**

| key | kind | when it plays |
|---|---|---|
| `c3.bounds` | turn-back line | Ch3 soft boundary (30 m from the fire): darkness + a howl. |
| `c3_fire.obj` | objective | Objective at chapter start. |
| `c3_fire.label.sit` | label | Context verb at the fire, next to the Sheikh. |
| `c3_fire.hint1` | hint | Hint 1 (45 s). |
| `c3_fire.hint2` | hint | Hint 2 (90 s). |
| `c3_polaris.prompt.sky` | prompt | Tutorial prompt: entering sky mode. |
| `c3_polaris.prompt.dwell` | prompt | Tutorial prompt when the view first comes within 12° of a target star. |
| `c3_polaris.obj` | objective | Objective, step 1. |
| `c3_polaris.hint1` | hint | Hint 1 (20 s) — ground-based. |
| `c3_polaris.hint2` | hint | Hint 2 (40 s). |
| `c3_polaris.jady.obj` | objective | Objective, step 2. |
| `c3_polaris.jady.hint1` | hint | Hint 1 (20 s) for الجدي. |
| `c3_polaris.jady.hint2` | hint | Hint 2 (40 s) for الجدي. |
| `c3_polaris.toast.strip` | toast | Toast when the الجدي mark is added to the horizon strip. |
| `c3_wolves.obj` | objective | Objective, step 1. |
| `c3_wolves.label.take` | label | Context verb at the fire. |
| `c3_wolves.hint1` | hint | Hint 1 (45 s). |
| `c3_wolves.hint2` | hint | Hint 2 (90 s). |
| `c3_wolves.fight.obj` | objective | Objective, step 2 (the three waves). |
| `c3_wolves.label.swing` | label | Context verb while the brand is in hand (tap). |
| `c3_wolves.prompt.swing` | prompt | Tutorial prompt with the first telegraph of wave 1. |
| `c3_wolves.prompt.eye` | prompt | Tutorial prompt in the 6 s breath after wave 1 (mastery, optional). |
| `c3_wolves.fight.hint1` | hint | Hint 1 (45 s) during the fight. |
| `c3_wolves.fight.hint2` | hint | Hint 2 (90 s) during the fight. |
| `c3_wolves.toast.right` | toast | Call-out toast when the telegraphed lunger is on Dhari's right. |
| `c3_wolves.toast.left` | toast | Call-out toast when the lunger is on Dhari's left. |
| `c3_wolves.toast.front` | toast | Call-out toast when the lunger is ahead (within ± 20°). |
| `c3_wolves.fail.wave` | fail / retry line | Retry line: third miss in a wave → that wave restarts. |
| `c3_alpha.obj` | objective | Objective. |
| `c3_alpha.label.steady` | label | الثبات label (6 s; replaces «اضرب» for the whole beat). |
| `c3_alpha.prompt.steady` | prompt | Prompt at the start of the hold (the trained reflex is the mistake). |
| `c3_alpha.hint1` | hint | Hint 1 (45 s). |
| `c3_alpha.hint2` | hint | Hint 2 (90 s). |
| `c3_alpha.toast.stage1` | toast | Coaching toast after feint 1 has passed (stage 33 %, outside the test window). |
| `c3_alpha.toast.stage2` | toast | Coaching toast after feint 2 has passed (stage 66 %). |
| `c3_alpha.fail.1` | fail / retry line | Retry line, 1st flinch (he lunges, Dhari staggers; next try −1 s, one feint fewer). |
| `c3_alpha.fail.2` | fail / retry line | Retry line, 2nd flinch. |
| `c3_alpha.fail.3` | fail / retry line | Retry line, 3rd flinch — the sterner line; the next attempt auto-steadies. |
| `c3_suhail.obj` | objective | Objective. |
| `c3_suhail.hint1` | hint | Hint 1 (20 s). |
| `c3_suhail.hint2` | hint | Hint 2 (40 s) — ALSO shown at once when the gaze rests on the decoy star. |
| `c3_suhail.toast.strip` | toast | Toast when the سهيل mark is added to the horizon strip. |

**Ch4 «حقّ الملح» — L3 «أم الحيا», morning → dusk → night.**

| key | kind | when it plays |
|---|---|---|
| `c4.bounds` | turn-back line | Ch4 soft boundary: الوضحا balks and turns back. |
| `c4_stranger.obj` | objective | Objective. |
| `c4_stranger.label.inspect` | label | Context verb at the dead camel (usable from the saddle; triggers the scripted dismount). |
| `c4_stranger.hint1` | hint | Hint 1 (45 s) — Dhari's own voice from here to the end of the game. |
| `c4_stranger.hint2` | hint | Hint 2 (90 s). |
| `c4_stranger.ask` | choice heading | Choice heading. |
| `c4_stranger.choice.give` | choice option | Option → gaveWater = true. |
| `c4_stranger.choice.refuse` | choice option | Option → gaveWater = false. |
| `c4_collapse.obj` | objective | Objective after the farewells. |
| `c4_collapse.label.mount` | label | Context verb on the kneeling الوضحا. |
| `c4_collapse.hint1` | hint | Hint 1 (45 s) — Dhari's voice. |
| `c4_collapse.hint2` | hint | Hint 2 (90 s). |
| `c4_search.obj` | objective | Objective. |
| `c4_search.prompt.qata` | prompt | Prompt with the first قطا flight. |
| `c4_search.label.cairn` | label | Context verb at a cairn (from the saddle). |
| `c4_search.hint1` | hint | Hint 1 (45 s) — Dhari's voice. |
| `c4_search.hint2` | hint | Hint 2 (90 s). |
| `c4_search.toast.dry` | toast | Toast when gaveWater = true and the player holds the empty قربة / at thirst 30. |
| `c4_search.prompt.drink` | prompt | Prompt at cairn 1 when gaveWater = false (the single sip is still his). |
| `c4_search.toast.sip` | toast | Toast (Dhari) after drinking that last sip, gaveWater = false. |
| `c4_search2.obj` | objective | Objective. |
| `c4_search2.label.cairn` | label | Context verb at cairns 2–4. |
| `c4_search2.hint1` | hint | Hint 1 (45 s) — Dhari's voice. |
| `c4_search2.hint2` | hint | Hint 2 (90 s). |
| `c4_search2.toast.fork` | toast | Toast at cairn 2 where the false trail branches east. |
| `c4_search2.label.bones` | label | Context verb at the bones (end of the false trail). |
| `c4_search2.toast.night` | toast | Toast at nightfall (~60 % of the path), when the strip switches to the star marks. |
| `c4_ridge.obj` | objective | Objective (set when the glow becomes visible). |
| `c4_ridge.hint1` | hint | Hint 1 (45 s) — Dhari's voice. |
| `c4_ridge.hint2` | hint | Hint 2 (90 s). |
| `c4_ridge.toast.glow` | toast | Toast (Dhari) when the glow first shows, 150 m out. |

**Ch5 «الهيبة» — L3 «أم الحيا», night → dawn. The well.**

| key | kind | when it plays |
|---|---|---|
| `c5.bounds` | turn-back line | Ch5 soft boundary: a sentry's whistle. |
| `c5_scout.obj` | objective | Objective, step 1. |
| `c5_scout.prompt.count` | prompt | Prompt at beat start. |
| `c5_scout.hint1` | hint | Hint 1 (45 s) — Dhari's voice. |
| `c5_scout.hint2` | hint | Hint 2 (90 s). |
| `c5_scout.rifle.obj` | objective | Objective, step 2. |
| `c5_scout.label.hang` | label | Context verb at الوضحا (hold 1 s) → leftRifle = true. |
| `c5_scout.prompt.hang` | prompt | Prompt when «علّق البندق» is in reach. |
| `c5_scout.rifle.hint1` | hint | Hint 1 (45 s) — Dhari's voice («القوم» = raiders). |
| `c5_scout.rifle.hint2` | hint | Hint 2 (90 s). |
| `c5_scout.toast.hung` | toast | Toast (Dhari) when the rifle is hung. |
| `c5_scout.toast.armed` | toast | Warning toast if the player starts down the slope WITHOUT hanging the rifle (leftRifle stays false; not a fail). |
| `c5_walk.obj` | objective | Objective. |
| `c5_walk.prompt.pace` | prompt | Prompt at the first step of the descent (touch). |
| `c5_walk.prompt.pace.kb` | prompt | Keyboard variant of the pace prompt. |
| `c5_walk.hint1` | hint | Hint 1 (45 s) — Dhari's voice. |
| `c5_walk.hint2` | hint | Hint 2 (90 s). |
| `c5_walk.toast.shot1` | toast | Toast (Dhari, inner voice) at ~24 m — after the 0.8 s window of shot 1 has passed. |
| `c5_walk.toast.shot2` | toast | Toast (Dhari, inner voice) at ~42 m — after the window of shot 2. |
| `c5_walk.fail` | fail / retry line | Retry line on a flinch (the jeer) → restart from the ridge foot (or from the last passed shot). |
| `c5_words.obj` | objective | Objective (shown during the two choices). |
| `c5_words.hint1` | hint | Hint 1 (45 s on a choice) — Dhari's voice. |
| `c5_words.hint2` | hint | Hint 2 (90 s on a choice). |
| `c5_words.r1.ask` | choice heading | Choice 1 heading. |
| `c5_words.r1.choice.a` | choice option | Choice 1 option a. |
| `c5_words.r1.choice.b` | choice option | Choice 1 option b. |
| `c5_words.r1.choice.c` | choice option | Choice 1 option c. |
| `c5_words.r1.a.circle` | toast | Circle reaction toast after c5_words.r1.a (approving murmur). |
| `c5_words.r1.b.circle` | toast | Circle reaction toast after c5_words.r1.b (silence). |
| `c5_words.r1.c.circle` | toast | Circle reaction toast after c5_words.r1.c (a short laugh). |
| `c5_words.r2.ask` | choice heading | Choice 2 heading. |
| `c5_words.r2.choice.a` | choice option | Choice 2 option a. |
| `c5_words.r2.choice.b` | choice option | Choice 2 option b. |
| `c5_words.r2.choice.c` | choice option | Choice 2 option c. |
| `c5_words.r2.a.circle` | toast | Circle reaction toast after c5_words.r2.a (a short laugh). |
| `c5_words.r2.b.circle` | toast | Circle reaction toast after c5_words.r2.b (approving murmur). |
| `c5_words.r2.c.circle` | toast | Circle reaction toast after c5_words.r2.c (wry smiles). |
| `c5_stare.obj` | objective | Objective. |
| `c5_stare.label.steady` | label | الثبات label. |
| `c5_stare.prompt.steady` | prompt | Prompt at the start of the hold. |
| `c5_stare.hint1` | hint | Hint 1 (45 s) — Dhari's voice. |
| `c5_stare.hint2` | hint | Hint 2 (90 s). |
| `c5_stare.toast.stage1` | toast | Stage 1 (33 %): after he has stepped in. |
| `c5_stare.toast.stage2` | toast | Stage 2 (66 %): after his hand has closed on the dagger. |
| `c5_stare.toast.stage3` | toast | Stage 3, ONLY when haybah ≤ 1: after the inch of blade shows. |
| `c5_stare.fail.1` | fail / retry line | Retry line, 1st flinch (next try −1 s, one test fewer). |
| `c5_stare.fail.2` | fail / retry line | Retry line, 2nd flinch. |
| `c5_stare.fail.3` | fail / retry line | Retry line, 3rd flinch — the sterner line; the next attempt auto-steadies. |
| `c5_signal.obj` | objective | Objective, step 1. |
| `c5_signal.label.take` | label | Context verb at ثامر's fire. |
| `c5_signal.hint1` | hint | Hint 1 (45 s) — Dhari's voice. |
| `c5_signal.hint2` | hint | Hint 2 (90 s). |
| `c5_signal.light.obj` | objective | Objective, step 2 (at the signal pile). |
| `c5_signal.label.light` | label | Context verb at the pile (hold 1.5 s). |
| `c5_signal.prompt.light` | prompt | Prompt at the pile — names the echo of c1_well. |
| `c5_signal.light.hint1` | hint | Hint 1 at the pile — Dhari's voice. |
| `c5_signal.light.hint2` | hint | Hint 2 at the pile. |
| `c5_staff.obj` | objective | Objective (the same hold as c1_well — now it brings up water). |
| `c5_staff.label.pull` | label | Context verb at the well (hold 1.5 s). |
| `c5_staff.hint1` | hint | Hint 1 (45 s) — Dhari's voice. |
| `c5_staff.hint2` | hint | Hint 2 (90 s). |
| `c5_end.title` | ending summary | Ending screen title. |
| `c5_end.motto` | ending summary | Ending screen motto under the title (the meaning of «الهيبة», in فصحى). |
| `c5_end.sum.head` | ending summary | Heading of the choices summary. |
| `c5_end.sum.ration.self` | ending summary | Summary line, ration = self. |
| `c5_end.sum.ration.child` | ending summary | Summary line, ration = child. |
| `c5_end.sum.ration.elder` | ending summary | Summary line, ration = elder. |
| `c5_end.sum.water.gave` | ending summary | Summary line, gaveWater = true. |
| `c5_end.sum.water.refused` | ending summary | Summary line, gaveWater = false. |
| `c5_end.sum.wolf.named` | ending summary | Summary line, sawWolfPrint = true. |
| `c5_end.sum.wolf.unnamed` | ending summary | Summary line, sawWolfPrint = false. |
| `c5_end.sum.rifle.left` | ending summary | Summary line, leftRifle = true. |
| `c5_end.sum.rifle.kept` | ending summary | Summary line, leftRifle = false. |
| `c5_end.sum.haybah.4` | ending summary | Summary line, haybah = 4. |
| `c5_end.sum.haybah.3` | ending summary | Summary line, haybah = 3. |
| `c5_end.sum.haybah.2` | ending summary | Summary line, haybah = 2. |
| `c5_end.sum.haybah.1` | ending summary | Summary line, haybah = 1. |
| `c5_end.sum.haybah.0` | ending summary | Summary line, haybah = 0. |
| `c5_end.credits` | ending summary | Credits line / disclaimer on the ending screen. |
| `c5_end.replay` | ending summary | Ending screen button: new game. |
| `c5_end.chapters` | ending summary | Ending screen button: chapter select. |

## 3. Screenplay

Stage directions are in English italics; every Arabic string below is the exact content of `story.ar.js`.

### مشترك · Shared keys — used by any chapter

#### `global`

*Generic context-button verbs, shared prompts and the thirst fail-soft lines (DESIGN §8). Beat-specific keys always win when they exist.*

- `label.talk` · label — «كلّمه» <sub>— Generic context verb: talk to the focused NPC (fallback when a beat defines no label of its own).</sub>
- `label.inspect` · label — «افحص» <sub>— Generic context verb: inspect a sign / clue.</sub>
- `label.mount` · label — «اركب» <sub>— Generic context verb: mount at a scripted prompt.</sub>
- `label.dismount` · label — «انزل» <sub>— Generic context verb: dismount at a scripted prompt.</sub>
- `label.steady` · label — «اثبُت» <sub>— Generic الثبات label (same wording as the UI key steady.hold).</sub>
- `label.drink` · label — «اشرب» <sub>— Generic drink verb (قربة icon).</sub>
- `label.take` · label — «خذ» <sub>— Generic context verb: pick something up.</sub>
- `label.sit` · label — «اجلس» <sub>— Generic context verb: sit down.</sub>
- `prompt.confirm` · prompt — «اضغط مطوّلًا على اختيارك لتثبيته» <sub>— Shown under every flag-setting choice (0.5 s hold to confirm): c2_ration, c4_stranger, c5_words.</sub>
- `prompt.drink` · prompt — «اضغط مطوّلًا على القربة لتشرب» <sub>— Generic hold-to-drink prompt (0.6 s on the قربة icon).</sub>
- `thirst.toast.40` · toast — «جفّ ريقك… والماء أمانة.» <sub>— survival:level step 40 (dry breath + one icon pulse). Ch2 and ch4 only.</sub>
- `thirst.toast.30` · toast — «اشتدّ العطش… وغامت الأرض في عينيك.» <sub>— survival:level step 30 (heat-haze vignette, heavy breath).</sub>
- `thirst.toast.15` · toast — «خارت قواك… لم يبقَ في رجليك ركض.» <sub>— survival:level step 15 (running disabled, heartbeat).</sub>
- `fail.thirst.giver` · fail / retry line — «أظلمت الدنيا في عينيك… ثم برد الماء على شفتيك. سقاك أهلك ممّا بقي لهم.» <sub>— Thirst 0 → collapse card when ration ≠ self (ch2) — given water without reproach. Passed to d.failAndRestart().</sub>
- `fail.thirst.self` · fail / retry line — «غلبك العطش فسقطت… سقاك جدّك من نصيبه وقال: الركض يشرب الما يا وليدي.» <sub>— Thirst 0 → collapse card when ration = self (ch2), or in ch4 while the caravan is still with Dhari.</sub>
- `fail.thirst.alone` · fail / retry line — «هويتَ عن ظهر الوضحا… فناخت تُظِلّك حتى أفقت عند آخر رجم.» <sub>— Thirst 0 while alone in ch4 (c4_search / c4_search2 / c4_ridge): الوضحا kneels to shade him; resume at the last cairn.</sub>

### Ch1 «الأثر» — L1 «المراح», dawn → morning. The camp by the dying well.

#### `c1`

*Chapter-wide keys.*

▣ **card `c1`** — «الفصل الأول» · «الأثر» — «الرمل لا ينسى من مرّ به.»  
<sub>Chapter 1 title card — shown at the end of c1_intro, when the camera has landed behind Dhari (also used by chapter select).</sub>

- `c1.bounds` · turn-back line — «نادى الشيخ من بعيد: ارجع يا ضاري… ما هو بدربك!» <sub>— Ch1 soft boundary (player:bounds): the Sheikh's call + a gentle push back.</sub>

#### `c1_intro`

*Black, wind. Place/time card. The camera glides over dunes at dawn and lands behind Dhari (no fade). ≤ 12 s, skippable after 2 s.*

▣ **card `intro`** — «الربع الخالي» — «صيف ١٨٩٩م — ١٣١٧هـ»  
<sub>Opening place/time card over black, before the glide.</sub>

- `c1_intro.prompt.rotate` · prompt — «أدِر الجوال» <sub>— Rotate hint while the stage is drawn rotated (portrait viewport), until the first input.</sub>
- `c1_intro.label.skip` · label — «تجاوز» <sub>— Skip button of the intro (appears after 2 s).</sub>

*The Sheikh's voice over the glide — the thesis of the game: the sand keeps the news of everyone who crossed it.*

**`c1_intro.vo`** — <sub>Voice-over during the dune glide (auto-advancing, not input-blocking). Then card c1.</sub>

> **الشيخ مانع:** الرملة ما تخفي شي يا وليدي… كل من وطاها خلّى عليها خبره.  
> **الشيخ مانع:** واللي يعرف يقصّه… ما يضيع.  

#### `c1_wake`

*Control is given. Dhari faces the well; the Sheikh stands 20 m ahead, backlit by the sunrise. فهيد and الحوار cross his path.*

- `c1_wake.obj` · objective — «اذهب إلى جدّك عند البئر» <sub>— Objective from the first frame of control.</sub>
- `c1_wake.prompt.move` · prompt — «المس يسار الشاشة واسحب لتمشي» <sub>— Tutorial prompt 1 (touch): shown at once, cleared after the first 1 m walked.</sub>
- `c1_wake.prompt.move.kb` · prompt — «امشِ بمفاتيح الأسهم» <sub>— Keyboard variant of prompt 1 (input.device = keyboard).</sub>
- `c1_wake.prompt.look` · prompt — «اسحب على يمين الشاشة لتلتفت حولك» <sub>— Tutorial prompt 2 (touch): only after 3 m walked.</sub>
- `c1_wake.prompt.look.kb` · prompt — «اسحب بالفأرة لتلتفت حولك» <sub>— Keyboard/mouse variant of prompt 2.</sub>
- `c1_wake.hint1` · hint — «الشيخ واقف عند البئر قبالة الشمس… ينتظرك.» <sub>— Hint 1 (12 s without progress — the very first objective).</sub>
- `c1_wake.hint2` · hint — «اسحب على يسار الشاشة لتمشي نحو الشيخ الواقف عند البئر.» <sub>— Hint 2 (explicit) + goal mark on the strip.</sub>

*موضي is at the tent, weaving; she greets him as he passes.*

◌ **bark `c1_wake.bark.1`** — **موضي:** صبّحك الله بالخير يا وليدي… جدّك عند البير.  
<sub>Bark as Dhari passes the tent (first 5 m).</sub>

*فهيد runs across Dhari's path with الحوار; the calf moans for its missing mother (positional sound toward the pen).*

◌ **bark `c1_wake.bark.2`** — **فهيد:** ضاري! الحوار من الفجر يحنّ… يدوّر أمّه!  
<sub>Bark when فهيد and الحوار cross the path (~10 m from the well). Seeds الوضحا's absence.</sub>

- `c1_wake.label.talk` · label — «كلّم جدّك» <sub>— Context verb within 2.4 m of the Sheikh.</sub>

*The Sheikh does not turn — he names Dhari by the sound of his steps (first, deniable sign of the blindness; echoed by the last scene of the game).*

**`c1_wake.greet`** — <sub>Blocking, on «كلّم جدّك». Ends the beat.</sub>

> **الشيخ مانع:** أقبلت يا ضاري… أعرف حِسّ خطاك من يوم كنت تحبي.  
> **ضاري:** صبّحك الله بالخير يا جدّي.  
> **الشيخ مانع:** صبّحك الله بالنور يا وليدي.  
> **الشيخ مانع:** البير ساكتة من البارح… ما أوحي للما بها حِسّ.  
> **الشيخ مانع:** نزّل الدلو… وعلّمني وش يطلع به.  

#### `c1_well`

*Dhari pulls the bucket himself (hold 1.5 s): mud. The Sheikh is silent. A flight of قطا crosses the well without landing. مسفر arrives: الوضحا is missing. ≤ 6 blocking lines in the beat.*

- `c1_well.obj` · objective — «اسحب الدلو من البئر» <sub>— Objective.</sub>
- `c1_well.label.pull` · label — «اسحب الدلو» <sub>— Context verb at the well (hold 1.5 s).</sub>
- `c1_well.prompt.hold` · prompt — «اضغط مطوّلًا حتى يمتلئ الطوق» <sub>— Tutorial prompt: the first hold of the game (context button).</sub>
- `c1_well.hint1` · hint — «الشيخ: الرِّشا بيدك يا وليدي… وش تنطر؟» <sub>— Hint 1 (25 s).</sub>
- `c1_well.hint2` · hint — «قف عند البئر واضغط مطوّلًا على «اسحب الدلو».» <sub>— Hint 2 (50 s).</sub>

*The rope comes up black with mud. The Sheikh says nothing; he feels the rope with his palm (he touches where another man would look).*

**`c1_well.mud`** — <sub>Blocking, right after the hold completes (bucket up, mud on the rope).</sub>

> **ضاري:** طين يا جدّي… طين أسود. ما به ولا جُغمة.  
> **الراوي:** لم يقل الشيخ شيئًا… مرّ بكفّه على الرِّشاء المبتلّ بالطين، ثم رفع وجهه إلى السماء.  

*Sandgrouse whirr over the well and do not land. The Sheikh HEARS them.*

◌ **bark `c1_well.bark.1`** — **الشيخ مانع:** توحي القطا؟ مرّ وما نزل… أهدى من القطا ما به.  
<sub>Bark with the قطا flight crossing the well: they do not land where there is no water (the proverb seeds ch2 and the ch4 exam).</sub>

*مسفر comes running from the pen.*

**`c1_well.misfer`** — <sub>Blocking, after the قطا bark. Ends the beat.</sub>

> **مسفر:** يا عم! الوضحا ما هي بالمراح… قطعت قيدها وسرت بالليل.  
> **الشيخ مانع:** الوضحا ما تسري عبث… شمّت شي ما شمّيناه.  
> **الشيخ مانع:** قم يا ضاري… جرّتها تعلّمنا.  

#### `c1_firasa`

*The pen, ≤ 15 m from the well. The Sheikh states the rule first; the eye button appears. Two track sets ≤ 10 m from the gate: old and fresh. Inspect (kneel) the fresh one.*

- `c1_firasa.obj` · objective — «ميّز أثر الوضحا الجديد وافحصه» <sub>— Objective (set after c1_firasa.rule).</sub>

**`c1_firasa.rule`** — <sub>Blocking, on arrival at the pen gate. The eye button appears when it closes.</sub>

> **الشيخ مانع:** هنا مبركها… والأرض حولها كلها جرّات، قديمها وجديدها.  
> **الشيخ مانع:** الجرّة الجديدة حدّها قاطع ورملها للحين ينهال… والعتيقة سفت عليها الريح ودوّرت حرفها.  
> **الشيخ مانع:** لا تطالع بعينك بس… اركد، وخلّ الأرض تهرج لك.  
> **ضاري:** سَمّ.  

- `c1_firasa.prompt.eye` · prompt — «اضغط مطوّلًا على زرّ الفراسة… ودَع الأرض تتكلّم» <sub>— Tutorial prompt: first use of الفراسة (eye button just appeared).</sub>
- `c1_firasa.prompt.afterglow` · prompt — «ارفع إصبعك: يبقى الأثر مضيئًا لحظات، فامشِ إليه» <sub>— Tutorial prompt after the first release (teaches the 6 s afterglow).</sub>
- `c1_firasa.label.inspect` · label — «افحص الأثر» <sub>— Context verb on either track set (Dhari kneels).</sub>
- `c1_firasa.hint1` · hint — «الشيخ: الجديدة حدّها قاطع ورملها ينهال… والعتيقة مدوّرة.» <sub>— Hint 1 (25 s).</sub>
- `c1_firasa.hint2` · hint — «اضغط زرّ الفراسة مطوّلًا، ثم اقترب من الأثر الحادّ الحافة وافحصه.» <sub>— Hint 2 (50 s).</sub>

*Wrong pick (the old set): the Sheikh ASKS what the rim looks like — teaching, and seeing through Dhari's eyes.*

**`c1_firasa.wrong`** — <sub>Blocking, when the OLD set is inspected. The player then inspects the right one.</sub>

> **الشيخ مانع:** وقفت عندها… علّمني: حرفها قاطع والا مدوّر؟  
> **ضاري:** مدوّر… والسافي راقد بوسطها.  
> **الشيخ مانع:** هذي عتيقة من ليال… سفت عليها الريح. دوّر اللي رملها توّه ينهال.  

*Right pick. First «وش تشوف؟» of the game — the refrain that the ch3 reveal pays off.*

**`c1_firasa.right`** — <sub>Blocking, when the FRESH set is inspected. Ends the beat; Dhari goes on alone.</sub>

> **الشيخ مانع:** علّمني… وش تشوف؟  
> **ضاري:** حدّها قاطع ورملها توّه ينهال… وممشاها عدل، ما تلفّتت ولا رعت.  
> **الشيخ مانع:** ممشاها عدل… يعني قاصدة شي، ما هي بهاملة. عفيه عليك.  
> **الشيخ مانع:** قصّيتها قصّ أبوك، الله يرحمه.  
> **الشيخ مانع:** اتبعها لحالك… الجرّة ما تنقصّ بالزحمة. وليا عيّنتها، لا تركض لها.  
> **ضاري:** أبشر يا جدّي.  

#### `c1_trail`

*Alone. Follow the fresh trail ~85 m over a dune ridge to a gravel flat where it breaks.*

- `c1_trail.obj` · objective — «اتبع أثر الوضحا» <sub>— Objective.</sub>
- `c1_trail.prompt.run` · prompt — «اسحب إبهامك إلى أقصى الدائرة لتركض» <sub>— Tutorial prompt (touch) after ~10 m on the trail: running (knob turns gold).</sub>
- `c1_trail.prompt.run.kb` · prompt — «اضغط مفتاح «شِفت» مطوّلًا لتركض» <sub>— Keyboard variant of the run prompt.</sub>
- `c1_trail.hint1` · hint — «قال جدّي: الجرّة ما تنقصّ بالعجلة… اركد وخايل قدّامك.» <sub>— Hint 1 (25 s) — remembered line.</sub>
- `c1_trail.hint2` · hint — «افتح عين الفراسة لتلمع الآثار، واتبعها صعودًا فوق الكثيب.» <sub>— Hint 2 (50 s).</sub>
- `c1_trail.toast.read` · toast — «ممشاها عدل… ما وقفت ترعى ولا تلفّتت.» <sub>— Toast (Dhari, to himself) at the ridge crest, halfway along the trail.</sub>

#### `c1_gravel`

*The trail breaks on gravel. Two clue nodes (bitten ghada twig, fresh dung) ≤ 30 m ahead restore it; ~85 m more. Optional: a wolf print crossing the trail (sets sawWolfPrint).*

- `c1_gravel.obj` · objective — «انقطع الأثر على الحصى… ابحث عن علامة» <sub>— Objective when the trail breaks.</sub>
- `c1_gravel.hint1` · hint — «قال جدّي: الحصا ما يحفظ الخفّ… دوّر عود مكسور والا بعر طري.» <sub>— Hint 1 (25 s) — remembered line.</sub>
- `c1_gravel.hint2` · hint — «بعين الفراسة ابحث أمامك عن غصن مقضوم وبعر طريّ، وافحصهما.» <sub>— Hint 2 (50 s).</sub>
- `c1_gravel.label.twig` · label — «افحص الغصن» <sub>— Context verb on the bitten twig.</sub>

**`c1_gravel.twig`** — <sub>Blocking one-liner (Dhari kneels) when the twig is inspected.</sub>

> **ضاري:** عود غضا مقضوم… وقضمته للحين خضرا رطبة. توّها مرّت من هنا.  

- `c1_gravel.label.dung` · label — «افحص البعر» <sub>— Context verb on the dung.</sub>

**`c1_gravel.dung`** — <sub>Blocking one-liner when the dung is inspected. After BOTH clues the trail re-appears.</sub>

> **ضاري:** بعر طري… رطب من داخله. ما لها إلا من الفجر.  

- `c1_gravel.follow.obj` · objective — «عاد الأثر على الرمل… اتبعه» <sub>— Objective after both clues (the restored trail, ~85 m).</sub>
- `c1_gravel.follow.hint1` · hint — «قال جدّي: اللي مسك أول الخيط… لا يفكّه.» <sub>— Hint 1 for the restored trail — remembered line.</sub>
- `c1_gravel.follow.hint2` · hint — «الأثر يظهر من جديد بعد الحصى؛ اتبعه بعين الفراسة.» <sub>— Hint 2 for the restored trail.</sub>

*OPTIONAL — a line of large clawed prints crosses the camel's trail. Inspecting it sets sawWolfPrint (→ c3_alpha.named).*

- `c1_gravel.label.wolf` · label — «افحص الأثر» <sub>— Context verb on the wolf print (optional).</sub>

**`c1_gravel.wolf`** — <sub>Blocking, when the wolf print is inspected. Sets sawWolfPrint = true.</sub>

> **ضاري:** جرّة ذيب… أربع أصابع بمخالبها، وممشاه خيط واحد.  
> **ضاري:** كبيرة… وتقطع جرّة الوضحا من الليل.  
> **ضاري:** قال جدّي: «الذيب ما يهرول عبث».  

#### `c1_calm`

*الوضحا by a patch of green. Running inside 30 m raises her head (one warning line); inside 18 m she bolts. At 5 m the الثبات prompt: 3 s — head lowers → ears forward → she steps in and kneels. Mount.*

- `c1_calm.obj` · objective — «اقترب من الوضحا على مهل» <sub>— Objective.</sub>

◌ **bark `c1_calm.bark.1`** — **ضاري:** الوضحا… ترعى خضار! من وين جا الخضار؟  
<sub>Bark when she comes into view (~40 m). Plants the question c1_decision answers.</sub>

- `c1_calm.hint1` · hint — «قال جدّي: تعال لها من قدّامها وبصوت واطي… ولا تركض أبد.» <sub>— Hint 1 (25 s) — remembered line.</sub>
- `c1_calm.hint2` · hint — «امشِ نحوها دون ركض، وعند ظهور «اثبُت» اضغط مطوّلًا ولا تتحرّك.» <sub>— Hint 2 (50 s).</sub>
- `c1_calm.toast.warn` · toast — «قال جدّي: على هونك… الذلول تعرفك من مشيتك.» <sub>— Toast, once: running inside 30 m (she raises her head and snorts).</sub>
- `c1_calm.toast.bolt` · toast — «جفلت الوضحا وابتعدت… الهون أبرك ما يكون.» <sub>— Toast each time she bolts / shies (running inside 18 m).</sub>
- `c1_calm.label.steady` · label — «اثبُت» <sub>— الثبات label at 5 m (first use — safe, no test window).</sub>
- `c1_calm.prompt.steady` · prompt — «اضغط مطوّلًا على «اثبُت» ولا تتحرّك حتى تطمئنّ» <sub>— Tutorial prompt: first الثبات hold.</sub>
- `c1_calm.toast.soothe` · toast — «هدّي يا الوضحا… هدّي. أنا ضاري.» <sub>— Toast (Dhari, low voice) at stage 1 of the hold (33 %: her head lowers).</sub>
- `c1_calm.toast.kneel` · toast — «إخّ… إخّ… كفو يا الوضحا.» <sub>— Toast at 100 %: she steps in and kneels on the kneel-call.</sub>
- `c1_calm.mount.obj` · objective — «اركب الوضحا» <sub>— Objective once she kneels.</sub>
- `c1_calm.label.mount` · label — «اركب الوضحا» <sub>— Context verb on the kneeling camel (she kneels → he sits → she rises).</sub>
- `c1_calm.mount.hint1` · hint — «قال جدّي: الذلول ما تنوخ إلا للي تأمنه.» <sub>— Hint 1 while she waits kneeling.</sub>
- `c1_calm.mount.hint2` · hint — «اقترب من الوضحا الباركة واضغط «اركب الوضحا».» <sub>— Hint 2 while she waits kneeling.</sub>
- `c1_calm.toast.mount` · toast — «بسم الله… يالله على أهلنا يا الوضحا.» <sub>— Toast (Dhari) as she rises with him in the saddle.</sub>

#### `c1_ride`

*A 170 m shortcut over one ridge that reveals the camp in morning light. Trot prompt after 5 s. On arrival الحوار runs to her.*

- `c1_ride.obj` · objective — «عُد بالوضحا إلى المخيّم» <sub>— Objective.</sub>
- `c1_ride.prompt.ride` · prompt — «وجّه الوضحا بإبهامك الأيسر… والنظر يتبع وجهتها» <sub>— Tutorial prompt at beat start (touch; one-thumb riding).</sub>
- `c1_ride.prompt.ride.kb` · prompt — «وجّه الوضحا بمفاتيح الأسهم… والنظر يتبع وجهتها» <sub>— Keyboard variant of the riding prompt.</sub>
- `c1_ride.prompt.trot` · prompt — «اسحب إبهامك إلى أقصى الدائرة لتخبّ الوضحا» <sub>— Tutorial prompt after 5 s (touch): trot.</sub>
- `c1_ride.prompt.trot.kb` · prompt — «اضغط مفتاح «شِفت» مطوّلًا لتخبّ الوضحا» <sub>— Keyboard variant of the trot prompt.</sub>
- `c1_ride.hint1` · hint — «قال جدّي: من راس الطعس تبين لك بيوتنا… اقطع عليه.» <sub>— Hint 1 (25 s) — remembered line.</sub>
- `c1_ride.hint2` · hint — «اصعد الكثيب الذي أمامك؛ المخيّم خلفه مباشرة.» <sub>— Hint 2 (50 s).</sub>

◌ **bark `c1_ride.bark.1`** — **ضاري:** ذيك بيوتنا… أربعة بيوت بوسط هالخلا كله.  
<sub>Bark on the ridge crest when the camp is revealed.</sub>

◌ **bark `c1_ride.bark.2`** — **فهيد:** جات الوضحا! شف الحوار كيف يركض لها!  
<sub>Bark on arrival, as الحوار runs to its mother.</sub>

#### `c1_decision`

*At the pen. The Sheikh smells the green on her muzzle: rain fell far south. The decision to leave tonight for عِدّ أم الحيا. Closing card.*

- `c1_decision.obj` · objective — «خذ الوضحا إلى جدّك» <sub>— Objective (the last metres to the Sheikh; she kneels at the scripted prompt).</sub>
- `c1_decision.hint1` · hint — «الشيخ واقف عند المراح… وكفّه ممدودة نحو الوضحا.» <sub>— Hint 1 (25 s).</sub>
- `c1_decision.hint2` · hint — «اقترب بالوضحا من الشيخ الواقف عند المراح.» <sub>— Hint 2 (50 s).</sub>

*The Sheikh reaches for her muzzle and smells his palm: he reads the green by scent.*

**`c1_decision.green`** — <sub>Blocking, when Dhari dismounts by the Sheikh.</sub>

> **مسفر:** عزّ الله إنك قصّاص يا ضاري… جبتها قبل تحمى الشمس.  
> **الراوي:** مدّ الشيخ يده إلى خَطْم الوضحا… ثم قرّب كفّه من أنفه وأطال.  
> **الشيخ مانع:** زَهَر… ريحة عشب أخضر. وين لقيتها ترعى يا وليدي؟  
> **ضاري:** جنوب، ورا الحصا… خضار قليل، توّه طالع.  
> **الشيخ مانع:** الخضار ما يطلع بلا حيا… وهذا طرف السحاب. الحيا الصدق وراه بالجنوب، والوضحا شمّته قبلنا.  

**`c1_decision.rahil`** — <sub>Blocking, follows c1_decision.green.</sub>

> **مسفر:** والجنوب وش به يا عم؟ رملة وراها رملة.  
> **الشيخ مانع:** به عِدّ ما ينزح… أم الحيا. وردته وأنا بعمر ضاري.  
> **مسفر:** أم الحيا! بيننا وبينها ست ليال… والقِرَب ما بها إلا القليل.  
> **الشيخ مانع:** واللي يقعد على بير يابسة… وش ينطر؟  
> **الشيخ مانع:** شدّوا. نرحل الليلة… لعِدّ أم الحيا.  
> **موضي:** سمعتوا الشيخ… البيوت تنطوي قبل المغيب. قم يا فهيد، عاوني.  

*The others turn to the tents. The Sheikh keeps Dhari back for a word (seed of «أنت عيوني»).*

**`c1_decision.eyes`** — <sub>Blocking, follows c1_decision.rahil. Then card c1_end.</sub>

> **الشيخ مانع:** ضاري… من باكر تمشي قدّامي. وكل ما شفت شي، علّمني به.  
> **ضاري:** وأنت أخبر مني بالأرض يا جدّي؟  
> **الشيخ مانع:** الأرض أخبَرها… بس عيونك أجدّ من عيوني.  

▣ **card `c1_end`** — «الرحيل» — «طُويت البيوت مع المغيب… ومشى ربع مانع على أثر المطر.»  
<sub>Closing card of chapter 1 (the "Chapter card" of c1_decision).</sub>

### Ch2 «المسير» — L2 «الجال», harsh noon → sandstorm → dusk.

#### `c2`

*Chapter-wide keys.*

▣ **card `c2`** — «الفصل الثاني» · «المسير» — «الماء أهون موجود… وأعزّ مفقود.»  
<sub>Chapter 2 title card — at chapter start, before c2_march (also chapter select).</sub>

- `c2.bounds` · turn-back line — «نادى الشيخ: لا تبعد عن الظعن يا ضاري… ارجع!» <sub>— Ch2 soft boundary: the Sheikh's call + a gentle push back.</sub>

#### `c2_march`

*Riding at the head of the caravan, 280 m to the shade rock «الجال» at a fixed lead pace. The قربة HUD appears (thirst 55). Three authored events ~70 m apart: a cairn, a soft-sand fork, a قطا flight.*

*The caravan is formed up, about to move. The Sheikh rides at Dhari's side — "tell me what you see, I tell you what it means".*

**`c2_march.lead`** — <sub>Blocking, at beat start before control is given.</sub>

> **الشيخ مانع:** اليوم أنت قدّام الظعن يا ضاري… والركاب على جرّتك.  
> **ضاري:** وأنت يا جدّي؟  
> **الشيخ مانع:** أنا يمّك… علّمني باللي تشوفه، وأعلّمك باللي يعنيه.  
> **مسفر:** القِرَب خفّت يا عم… ما بها إلا جُغمة لكل راس، وعقبها الله كريم.  
> **الشيخ مانع:** قطرة على قطرة تصير غدير… يالله، توكلنا على الله.  

- `c2_march.obj` · objective — «قُد الظعن إلى ظلّ الجال» <sub>— Objective.</sub>
- `c2_march.prompt.lead` · prompt — «أنت في مقدّمة الظعن… والركاب تمشي على أثرك» <sub>— Tutorial prompt at the first metres (leading; no trot while leading).</sub>
- `c2_march.prompt.water` · prompt — «هذه قربتك… والماء أمانة الفريق كلّه» <sub>— Tutorial prompt when the قربة HUD appears (after ~20 m).</sub>
- `c2_march.hint1` · hint — «الشيخ: وش تشوف يا ضاري؟ الأرض اللي تشيل… صوتها غير.» <sub>— Hint 1 (25 s) — carries the «وش تشوف؟» refrain.</sub>
- `c2_march.hint2` · hint — «سِر في الممرّ الصلب بين الكثبان؛ عين الفراسة تُظهر حدوده.» <sub>— Hint 2 (50 s).</sub>

*Event 1 (~70 m): a cairn on a crest to the right. The Sheikh knows it is there from memory — and ASKS whether Dhari sees it.*

◌ **bark `c2_march.bark.1`** — **الشيخ مانع:** تشوف الرجم؟ حطّه اللي قبلنا يدلّ اللي بعدنا.  
<sub>Bark when the رجم landmark enters view (seeds the ch4 cairns; Dhari repeats the line in c4_search).</sub>

*Event 2 (~140 m): the soft-sand fork. Firm corridor ≥ 14 m wide; in soft sand the line stretches and مسفر calls out.*

- `c2_march.toast.fork` · toast — «الشيخ: الدرب انفرق… وش تشوف يا ضاري؟» <sub>— Toast when the fork comes into view, before the caravan commits to a side (the «وش تشوف؟» refrain).</sub>

◌ **bark `c2_march.bark.2`** — **مسفر:** دَهَس يا ضاري! الركاب غاصت… خذ الجَلَد!  
<sub>Bark when the lead camel has been in soft sand for 2 s (once per entry, 12 s cooldown).</sub>

- `c2_march.toast.firm` · toast — «أرض جَلَد… واستراحت الركاب.» <sub>— Toast when the caravan is back on firm ground after a soft stretch.</sub>

*Event 3 (~210 m): sandgrouse overtake the caravan, heading south. One line.*

◌ **bark `c2_march.bark.3`** — **الشيخ مانع:** قطا… وين وجهه؟ القطا ما يضيّع الما.  
<sub>Bark with the قطا flight (the Sheikh hears them and asks for their heading).</sub>

#### `c2_ration`

*Midday shade at الجال. The single sip: drink it / give it to فهيد / give it to the grandfather → ration ∈ {self, child, elder}. A 2 s shot of whoever drinks. The Sheikh notices.*

- `c2_ration.obj` · objective — «استرح في ظلّ الجال» <sub>— Objective on arrival (kneel الوضحا in the shade).</sub>
- `c2_ration.label.kneel` · label — «نوِّخ الوضحا» <sub>— Context verb at the shade (scripted dismount).</sub>
- `c2_ration.hint1` · hint — «نوّخت الركاب في الظلّ… والقربة تدور على الجالسين.» <sub>— Hint 1 (25 s).</sub>
- `c2_ration.hint2` · hint — «اقترب من أهلك الجالسين في ظلّ الجال.» <sub>— Hint 2 (50 s).</sub>

*مسفر's remark depends on how the march went (echo of "reads firm sand").*

**`c2_ration.arrive.firm`** — <sub>Blocking one-liner on arrival IF the caravan spent < 6 s in soft sand during c2_march.</sub>

> **مسفر:** ما غاصت ولا ذلول اليوم… دربك عدل يا ضاري.  

**`c2_ration.arrive.soft`** — <sub>Blocking one-liner on arrival IF the caravan spent ≥ 6 s in soft sand.</sub>

> **مسفر:** الركاب أكلها الدَّهَس اليوم… والعطش زاد على الكل.  

**`c2_ration.share`** — <sub>Blocking, once everyone is seated. Leads straight into the choice.</sub>

> **مسفر:** هذي القسمة… جُغمة لكل راس. وما عقبها شي لين الله يفرجها.  
> **موضي:** فهيد شفايفه مشقّقة… والشيخ من الفجر ما بلّ ريقه.  
> **الراوي:** دارت القربة حتى بلغت يد ضاري… وفيها شربته.  

- `c2_ration.ask` · choice heading — «في يدك شربة واحدة… لمن تكون؟» <sub>— Choice heading (d.choice promptKey).</sub>
- `c2_ration.choice.self` · choice option — «اشرب نصيبك» <sub>— Option → ration = self. The player then performs the hold-to-drink.</sub>
- `c2_ration.choice.child` · choice option — «أعطِ نصيبك فهيدًا» <sub>— Option → ration = child.</sub>
- `c2_ration.choice.elder` · choice option — «أعطِ نصيبك جدّك» <sub>— Option → ration = elder.</sub>
- `c2_ration.prompt.drink` · prompt — «اضغط مطوّلًا على القربة لتشرب» <sub>— Tutorial prompt after choosing «اشرب نصيبك» (first hold-to-drink, +35).</sub>

*Consequence shot (2 s) of whoever drinks, then the Sheikh's remark. He cannot see who drank — he hears it.*

**`c2_ration.self`** — <sub>Blocking, ration = self, after the drink completes. No reproach — a lesson.</sub>

> **الراوي:** شرب ضاري… وسرى برد الماء في صدره.  
> **الشيخ مانع:** بالعافية يا وليدي… شربتك حقّك، وما عليك شرهة.  
> **الشيخ مانع:** مير اعرف… اللي يعطي وهو عطشان، هذا اللي يِنتَبَع.  

**`c2_ration.child`** — <sub>Blocking, ration = child (the consequence shot of فهيد drinking sits on the narrator line).</sub>

> **فهيد:** لي أنا؟… وأنت يا ضاري؟  
> **ضاري:** اشرب يا ورع… أنا ماني بعطشان.  
> **الراوي:** شرب فهيد حتى آخر قطرة… ثم مسح فمه بكمّه وضحك.  
> **الشيخ مانع:** اللي يعطي وهو عطشان… هذا اللي يِنتَبَع.  

**`c2_ration.elder`** — <sub>Blocking, ration = elder (consequence shot of the Sheikh drinking on the narrator line).</sub>

> **ضاري:** اشرب يا جدّي… الدرب بصدرك أنت، ولا لنا دليلة غيرك.  
> **الشيخ مانع:** تسقيني وأنت اللي قدّام الركاب؟  
> **ضاري:** طال عمرك… أنا أصبر.  
> **الراوي:** شرب الشيخ على مهل… ثم ردّ القربة فارغة، وأبقى كفّه على كتف ضاري.  
> **الشيخ مانع:** اللي يعطي وهو عطشان… هذا اللي يِنتَبَع.  

#### `c2_wall`

*The sky yellows; a storm wall rises in the west. الوضحا kneels at once while other camels fight (echo of ch1). The first gust is taught at the camel ring. The beat ends on فهيد's small figure running east after الحوار.*

*A dead stillness. The Sheikh feels it first — and asks Dhari for the colour of the sky.*

**`c2_wall.sky`** — <sub>Blocking, at beat start (sky preset turning to storm).</sub>

> **الشيخ مانع:** الهوا ركد… وهذي كَتمة ما أحبها. وش لون السما من صوب المغيب يا ضاري؟  
> **ضاري:** صفرا يا جدّي… وجدار أصفر قايم من الأرض للسما!  
> **الشيخ مانع:** عجاج! نوّخوا الركاب… العجاج!  
> **مسفر:** نوّخوا! حلقة… والحريم والجهّال بذَرا الركاب! تلثّموا!  

- `c2_wall.obj` · objective — «نوِّخ الوضحا في حلقة الركاب» <sub>— Objective.</sub>
- `c2_wall.label.kneel` · label — «نوِّخ الوضحا» <sub>— Context verb at the camel ring.</sub>
- `c2_wall.hint1` · hint — «الشيخ: نوّخها وصر بذَراها… العجاج ما يمهل.» <sub>— Hint 1 (25 s).</sub>
- `c2_wall.hint2` · hint — «اقترب من حلقة الركاب واضغط «نوِّخ الوضحا».» <sub>— Hint 2 (50 s).</sub>
- `c2_wall.toast.wadha` · toast — «ناخت الوضحا من أول «إخّ»… وغيرها يعاند.» <sub>— Toast as she kneels at once while the other camels fight (echo of c1_calm).</sub>

*On foot inside the ring. The first gust is announced and taught.*

◌ **bark `c2_wall.bark.1`** — **الشيخ مانع:** ليا صفّر الهوا… اثبت وعطه كتفك!  
<sub>Bark 1 s before the first gust warning (the gust lesson).</sub>

- `c2_wall.brace.obj` · objective — «اثبُت للهبّة الأولى» <sub>— Objective for the taught gust.</sub>
- `c2_wall.label.brace` · label — «اثبُت» <sub>— الثبات label during the gust warning (2.5 s).</sub>
- `c2_wall.prompt.brace` · prompt — «حين يصفر الهواء اضغط مطوّلًا على «اثبُت» حتى تمرّ الهبّة» <sub>— Tutorial prompt with the first gust warning.</sub>
- `c2_wall.brace.hint1` · hint — «الشيخ: الصوت يسبق الهبّة… ليا سمعته، اثبت.» <sub>— Hint 1 if the taught gust is missed (it repeats until braced once).</sub>
- `c2_wall.brace.hint2` · hint — «عند التحذير اضغط مطوّلًا على «اثبُت» وأبقِه حتى تهدأ الهبّة.» <sub>— Hint 2 for the taught gust.</sub>
- `c2_wall.toast.braced` · toast — «ثبتَّ… ومرّت الهبّة من فوق كتفك.» <sub>— Toast after the first successful brace.</sub>

*الحوار bolts downwind (east). فهيد runs after it. Hold 2 s on his small figure and first prints before visibility drops.*

**`c2_wall.fuhaid`** — <sub>Blocking, after the braced gust; the last line plays over the 2 s shot of فهيد's prints. Ends the beat.</sub>

> **موضي:** فهيد! وين فهيد؟ يا ضاري… أخوك!  
> **مسفر:** الحوار جفل وطار مع الهوا… والورع لحقه!  
> **ضاري:** أنا أجيبه.  
> **الشيخ مانع:** ضاري! العجاج يمحي الجرّة… بس الصوت ما يمحيه. صوّت له، وتسمّع.  
> **موضي:** جعلني فداك يا وليدي… لا ترجع إلا به.  

#### `c2_storm`

*OUT, on foot, 80 m, tailwind, visibility ~12 m. Verb: الفراسة + his call. Prints show within 14 m with the eye; two gaps of 16–18 m are bridged by his call. 2 teaching gusts. He is behind a ghada bush with الحوار.*

- `c2_storm.obj` · objective — «اقتفِ أثر فهيد في العجاج» <sub>— Objective.</sub>
- `c2_storm.hint1` · hint — «قال جدّي: العجاج يمحي الجرّة… بس الصوت ما يمحيه.» <sub>— Hint 1 (25 s) — remembered line.</sub>
- `c2_storm.hint2` · hint — «عين الفراسة تُظهر آثاره القريبة؛ وإذا انقطعت فاتبع حلقات صوته.» <sub>— Hint 2 (50 s).</sub>
- `c2_storm.prompt.voice` · prompt — «إذا انقطع الأثر… فاتبع حلقات الصوت على الشاشة» <sub>— Tutorial prompt at the first print gap (ripple rings = his call).</sub>
- `c2_storm.label.brace` · label — «اثبُت» <sub>— الثبات label for the 2 teaching gusts.</sub>
- `c2_storm.toast.call` · toast — «فهيد! صوّت لي يا فهيد!» <sub>— Toast (Dhari shouting) at beat start and at each print gap.</sub>
- `c2_storm.toast.answer` · toast — «ضاري! أنا هنا… ضاري!» <sub>— Toast (فهيد, far) answering at each gap — ration ≠ self (beacon 90 m).</sub>
- `c2_storm.toast.answer.hoarse` · toast — «ضا… ري…! أنا… هنا!» <sub>— Same answer when ration = self: his call is hoarse (beacon 60 m, fainter ripple).</sub>
- `c2_storm.lost1` · toast — «النداء يعلو… اتبع جهة الصوت.» <sub>— Lost 30 s (no progress): the call grows and the ripple becomes an arrow. Used in c2_storm AND c2_return.</sub>
- `c2_storm.lost2` · toast — «الحوار يحنّ… اتبع صوته.» <sub>— Lost 60 s: الحوار moans as a second beacon (out: from فهيد's bush; back: it pulls toward its mother at the camp).</sub>
- `c2_storm.lost3` · toast — «وهج يلوح في العجاج… اقصده.» <sub>— Lost 90 s: a visible glow on the target.</sub>

*He is crouched behind a ghada bush, arms round the calf's neck. He runs to Dhari; the ripple stops.*

**`c2_storm.found`** — <sub>Blocking, when Dhari reaches the bush (wind ducked). Ends the beat.</sub>

> **فهيد:** ضاري! كنت أدري إنك تجي… كنت أدري!  
> **ضاري:** وراك تلحق الحوار بوسط العجاج يا ورع؟  
> **فهيد:** الذيب ياخذ القاصية… والحوار راح لحاله. ما قدرت أخلّيه.  
> **ضاري:** كفو يا فهيد… امسك حزامي ولا تفكّه. نرجع لأهلنا.  

#### `c2_return`

*BACK, 80 m, headwind (×0.8). Verb: الثبات. 5 scripted gusts 9–12 s apart; bracing shields فهيد, who holds Dhari's sash and walks his recorded path. Guidance: the Sheikh's rhythmic call + a fire glow.*

- `c2_return.obj` · objective — «عُد بفهيد إلى الظعن» <sub>— Objective.</sub>
- `c2_return.hint1` · hint — «قال جدّي: ليا صفّر الهوا… اثبت وعطه كتفك.» <sub>— Hint 1 (25 s) — remembered line.</sub>
- `c2_return.hint2` · hint — «اتبع نداء الشيخ ووهج النار، واضغط «اثبُت» عند كل هبّة.» <sub>— Hint 2 (50 s).</sub>
- `c2_return.label.brace` · label — «اثبُت» <sub>— الثبات label for the 5 gusts.</sub>

◌ **bark `c2_return.bark.1`** — **فهيد:** ماسك حزامك يا ضاري… ما أفكّه!  
<sub>Bark after the first braced gust (never inside a gust window).</sub>

◌ **bark `c2_return.bark.2`** — **الشيخ مانع:** على صوتي يا ضاري… على صوتي!  
<sub>Bark between gusts 2 and 3: the Sheikh's rhythmic call (twin of the ripple rings).</sub>

- `c2_return.toast.shield` · toast — «ثبتَّ… وفهيد محتمٍ بظهرك.» <sub>— Toast after a braced gust (max twice).</sub>
- `c2_return.toast.thirst` · toast — «جفّ الريق وثقلت الخطى… لكنّ فهيدًا خلفك.» <sub>— Toast when a giver (ration ≠ self) crosses thirst 30 here.</sub>
- `c2_return.toast.near` · toast — «وهج النار يلوح… والعجاج يخفّ.» <sub>— Toast in the last 30 m, as visibility opens 12 → 25 m.</sub>
- `c2_return.fail.knock` · fail / retry line — «طرحتك الهبّة… انهض، وأعطِ الريح كتفك حين تصفر.» <sub>— Toast on a missed gust (2 s knockdown + 3 m slide). Soft — no restart.</sub>

#### `c2_dusk`

*The storm passes; golden light. فهيد runs to his mother. A giver is handed a sip now (hold-to-drink). Closing card.*

- `c2_dusk.obj` · objective — «سلِّم فهيدًا إلى أمّه» <sub>— Objective (the last metres to the fire).</sub>
- `c2_dusk.hint1` · hint — «موضي واقفة عند طرف الحلقة… وعيناها على العجاج.» <sub>— Hint 1 (25 s).</sub>
- `c2_dusk.hint2` · hint — «امشِ نحو النار؛ أهلك مجتمعون حولها.» <sub>— Hint 2 (50 s).</sub>

**`c2_dusk.back`** — <sub>Blocking, on reaching موضي.</sub>

> **موضي:** فهيد! يا ضناي… الحمد لله، الحمد لله.  
> **فهيد:** يُمّه! ضاري جاني بوسط العجاج… وثبت للهوا وأنا وراه!  
> **موضي:** بيّض الله وجهك يا وليدي… عساك سالم.  
> **مسفر:** ركد الهوا وانجلى العجاج… والركاب كلها سالمة يا عم.  
> **الشيخ مانع:** اللي يرجع لاجل واحد… يتبعونه الكل.  

*Only for a giver (ration = child or elder): the mother hands him her own untouched sip — giving is answered by giving.*

**`c2_dusk.sip`** — <sub>Blocking, ONLY when ration ≠ self. Then the player performs the hold-to-drink.</sub>

> **موضي:** هاك يا وليدي… هذي شربتي، ما ذقتها من القايلة.  
> **ضاري:** يُمّه… وأنتِ؟  
> **موضي:** الأم تروى ليا روي عيالها… اشرب، بسم الله.  

- `c2_dusk.prompt.drink` · prompt — «اضغط مطوّلًا على القربة لتشرب» <sub>— Prompt for the giver's sip (same gesture as the ration).</sub>

▣ **card `c2_end`** — «الجال» — «انجلى العجاج عن ليلٍ بلا قمر… وشبّ ربع مانع نارهم في ذَرا الجال.»  
<sub>Closing card of chapter 2.</sub>

### Ch3 «ليلة سهيل» — L2 at night → first light. The camp at الجال.

#### `c3`

*Chapter-wide keys.*

▣ **card `c3`** — «الفصل الثالث» · «ليلة سهيل» — «إذا أظلمت الأرض… تكلّمت السماء.»  
<sub>Chapter 3 title card — at chapter start, before c3_fire (also chapter select).</sub>

- `c3.bounds` · turn-back line — «عواء قريب في العتمة… لا تبتعد عن النار.» <sub>— Ch3 soft boundary (30 m from the fire): darkness + a howl.</sub>

#### `c3_fire`

*Campfire, moonless night. فهيد sits by Dhari; one line from whoever received the water. The Sheikh asks Dhari to describe the stars — and reveals his failing sight. EMOTIONAL PEAK: play it slowly, wind ducked, fire crackle only.*

- `c3_fire.obj` · objective — «اجلس عند النار بجوار جدّك» <sub>— Objective at chapter start.</sub>
- `c3_fire.label.sit` · label — «اجلس عند النار» <sub>— Context verb at the fire, next to the Sheikh.</sub>
- `c3_fire.hint1` · hint — «الشيخ: تعال اقعد يمّي يا ضاري… الليل طويل.» <sub>— Hint 1 (45 s).</sub>
- `c3_fire.hint2` · hint — «اقترب من الشيخ عند النار واضغط «اجلس عند النار».» <sub>— Hint 2 (90 s).</sub>

*Dhari sits. فهيد is beside him, the calf's halter in his fist. مسفر feeds the fire.*

**`c3_fire.sit`** — <sub>Blocking, when Dhari sits.</sub>

> **فهيد:** ضاري… الحوار ما يبي ينام. يطالع الظلما ويرجف.  
> **ضاري:** قرّبه من الضو… الضو أمان.  
> **مسفر:** ليلة ظلما… آخر الشهر. والله ما ودّي بها.  

*One line from whoever received the ch2 sip (nothing when ration = self).*

**`c3_fire.thanks.child`** — <sub>Blocking, ONLY when ration = child.</sub>

> **فهيد:** ضاري… شربتك اللي عطيتني، للحين بردها بصدري.  
> **فهيد:** ليا كبرت… أعطيك شربتي كل يوم.  

**`c3_fire.thanks.elder`** — <sub>Blocking, ONLY when ration = elder.</sub>

> **الشيخ مانع:** شربتك اللي سقيتني اليوم يا ضاري… ما روّت بدني بس.  
> **الشيخ مانع:** عرفت بها من اللي يشيل الأمانة عقبي.  

*The others lie down. The Sheikh calls Dhari closer and asks him to NAME the stars — the old refrain, now turned on the sky.*

**`c3_fire.ask`** — <sub>Blocking. Camera: two-shot, then slowly onto the Sheikh's face.</sub>

> **الشيخ مانع:** تعال اقعد يمّي يا ضاري… وخلّ العرب ينامون.  
> **الشيخ مانع:** ارفع راسك وعلّمني… وش تشوف بالسما الليلة؟  
> **ضاري:** نجوم يا جدّي… السما مليانة.  
> **الشيخ مانع:** سمّها لي… وين بنات نعش؟ وين الجدي؟  
> **ضاري:** طال عمرك… أنت اللي علّمت العرب النجوم. ليه تنشدني أنا؟  

*THE REVEAL. Hold on his unblinking eyes turned to the sky.*

**`c3_fire.reveal`** — <sub>Blocking. Music: the low rababa drone enters on line 2.</sub>

> **الراوي:** سكت الشيخ… ووجهه إلى السماء، وعيناه لا تطرفان.  
> **الشيخ مانع:** لأني يا وليدي… أرفع راسي وما ألقى إلا سواد.  
> **الشيخ مانع:** من شتاين والنجوم تطفي بعيني، نجمٍ ورا نجم… أول ما راح السها، وآخر ما راح الجدي.  
> **الشيخ مانع:** والنهار صار غبشة… أشوف الرجّال ظل، وأعرفه من حِسّه ومن مشيته.  
> **ضاري:** يا جدّي…  

*Every «وش تشوف؟» of ch1–ch2 is paid off here. He explains why he hid it.*

**`c3_fire.why`** — <sub>Blocking, follows c3_fire.reveal.</sub>

> **ضاري:** والدرب يا جدّي؟ من يوم شدّينا والظعن يمشي وراك.  
> **الشيخ مانع:** الدرب بصدري… مشيته قبل ينولد أبوك. بس الصدر ما يشوف الدَّهَس ولا العجاج.  
> **الشيخ مانع:** «وش تشوف يا ضاري؟»… كل ما نشدتك، كنت أمشي بعيونك.  
> **ضاري:** وليه ما علّمت أحد؟ مسفر… أمي…  
> **الشيخ مانع:** الظعن يمشي ورا دليلته ما دام يحسبه يشوف… ليا درى إنه ما عاد يشوف، وقف بمكانه ومات عطش.  
> **الشيخ مانع:** الرايد ما يكذب أهله، وأنا ما كذبت… قلت الما بالجنوب، والما بالجنوب.  

**`c3_fire.eyes`** — <sub>Blocking, follows c3_fire.why. Ends the beat; the horizon strip appears.</sub>

> **الشيخ مانع:** بس الأمل مثل الما يا وليدي… ليا انكبّ ما ينلمّ.  
> **ضاري:** وش تبي مني يا جدّي؟ آمر.  
> **الشيخ مانع:** أنت عيوني يا ضاري… لين نرد أم الحيا. تشوف أنت، وأفهم أنا.  
> **ضاري:** أبشر… عيوني عيونك، والسرّ بصدري.  
> **الشيخ مانع:** عفيه. يالله… نبدا من السما. دوّر لي بنات نعش.  

#### `c3_polaris`

*Sky mode (LST 18.0). بنات نعش low in the north-west, then الجدي 19.5° up. 7° cone, 0.8 s dwell; lines draw with one plucked note per star. The Sheikh guides by the ground, from memory.*

- `c3_polaris.prompt.sky` · prompt — «اضغط مطوّلًا على زرّ الفراسة وارفع نظرك إلى السماء» <sub>— Tutorial prompt: entering sky mode.</sub>
- `c3_polaris.prompt.dwell` · prompt — «ثبّت نظرك على النجم حتى يُرسم خيطه» <sub>— Tutorial prompt when the view first comes within 12° of a target star.</sub>
- `c3_polaris.obj` · objective — «ابحث عن بنات نعش» <sub>— Objective, step 1.</sub>
- `c3_polaris.hint1` · hint — «الشيخ: ناظر مغيب الشمس وخذ يمينه… أربع نجوم نعش وثلاث بنات وراه.» <sub>— Hint 1 (20 s) — ground-based.</sub>
- `c3_polaris.hint2` · hint — «انظر منخفضًا نحو الشمال الغربي: سبعة نجوم على هيئة مغرفة.» <sub>— Hint 2 (40 s).</sub>

*The seven stars join. He tells the folk tale («يقولون») and tests Dhari's eyes on السها — the star he lost first.*

**`c3_polaris.dipper`** — <sub>Blocking, when بنات نعش is found (stars:found).</sub>

> **ضاري:** لقيتها… أربع مثل النعش، وثلاث يمشن وراه.  
> **الشيخ مانع:** ذولا بنات نعش… يقولون: بنات شايلات نعش أبوهن، يدوّرن ثاره من يوم الدنيا ولا يلحقنه.  
> **الشيخ مانع:** الوسطى من البنات… جنبها نجمٍ صغيّر، لاصق بها. تشوفه؟  
> **ضاري:** أشوفه… صغيّر، ويرجف.  
> **الشيخ مانع:** ذاك السها… تمتحن به العرب النظر. نظرك حديد يا وليدي، وهذا اللي أبيه.  

- `c3_polaris.jady.obj` · objective — «اتبع النعش إلى الجدي» <sub>— Objective, step 2.</sub>
- `c3_polaris.jady.hint1` · hint — «الشيخ: خذ نجمتين النعش البعيدات عن البنات ومدّ بينهن خيط… يوصّلك للجدي.» <sub>— Hint 1 (20 s) for الجدي.</sub>
- `c3_polaris.jady.hint2` · hint — «مُدّ الخطّ من طرف المغرفة نحو اليمين وإلى أعلى قليلًا: نجم وحيد.» <sub>— Hint 2 (40 s) for الجدي.</sub>

**`c3_polaris.jady`** — <sub>Blocking, when الجدي is found. Ends the beat.</sub>

> **ضاري:** نجمٍ لحاله… ما حوله شي يشبهه.  
> **الشيخ مانع:** ذاك الجدي… النجوم كلها تدور حوله، وهو بمكانه ما يتحرك.  
> **الشيخ مانع:** «وعلاماتٍ وبالنجم هم يهتدون»… خلّه بين كتوفك، يصير وجهك للجنوب.  
> **ضاري:** الجدي بين كتوفي… ووجهي لأم الحيا.  

- `c3_polaris.toast.strip` · toast — «حفظتَ موضع الجدي… وصار علامة على شريط الأفق.» <sub>— Toast when the الجدي mark is added to the horizon strip.</sub>

#### `c3_wolves`

*A howl. Take a brand from the fire. Attack arc 180°; 3 waves of 3 / 4 / 5 lunges; each miss drags الحوار 2 m toward the dark; the third miss in a wave retries that wave. The blind Sheikh calls the sides by ear.*

**`c3_wolves.howl`** — <sub>Blocking, at beat start (the howl SFX precedes line 1).</sub>

> **الراوي:** عواءٌ طويل شقّ الليل… ثم أجابه ثانٍ، فثالث.  
> **مسفر:** ذيابة! قوموا… الذيابة حول المراح!  
> **فهيد:** يبون الحوار يا ضاري… يبون الحوار!  
> **الشيخ مانع:** لا تثوّر البندق بالظلما، تصيب ذلول والا رجّال… الذيب يهاب الضو. خذ لك شهاب!  
> **الشيخ مانع:** وأنا أسمعهم لك… ليا قلت «يمينك»، لوّح بالشعلة يمينك.  

- `c3_wolves.obj` · objective — «خذ شهابًا من النار» <sub>— Objective, step 1.</sub>
- `c3_wolves.label.take` · label — «خذ الشهاب» <sub>— Context verb at the fire.</sub>
- `c3_wolves.hint1` · hint — «الشيخ: الذيب يهاب الضو… خذ لك شهاب!» <sub>— Hint 1 (45 s).</sub>
- `c3_wolves.hint2` · hint — «اقترب من النار واضغط «خذ الشهاب».» <sub>— Hint 2 (90 s).</sub>
- `c3_wolves.fight.obj` · objective — «ذُد الذئاب عن الحوار» <sub>— Objective, step 2 (the three waves).</sub>
- `c3_wolves.label.swing` · label — «اضرب» <sub>— Context verb while the brand is in hand (tap).</sub>
- `c3_wolves.prompt.swing` · prompt — «حين تلمع عينا الذئب ويتحفّز… اضغط «لوّح»» <sub>— Tutorial prompt with the first telegraph of wave 1.</sub>
- `c3_wolves.prompt.eye` · prompt — «عين الفراسة تكشف الذئب الواثب قبل وثبته» <sub>— Tutorial prompt in the 6 s breath after wave 1 (mastery, optional).</sub>
- `c3_wolves.fight.hint1` · hint — «الشيخ: عين الذيب تلمع قبل ينطّ… وذاك وقتك.» <sub>— Hint 1 (45 s) during the fight.</sub>
- `c3_wolves.fight.hint2` · hint — «اضغط «لوّح» عند الوميض؛ الشعلة تتّجه نحو الذئب من تلقاء نفسها.» <sub>— Hint 2 (90 s) during the fight.</sub>

*The Sheikh's call-outs: one word with each telegraph (text twin of the growl; shown at the matching screen edge).*

- `c3_wolves.toast.right` · toast — «الشيخ: يمينك!» <sub>— Call-out toast when the telegraphed lunger is on Dhari's right.</sub>
- `c3_wolves.toast.left` · toast — «الشيخ: يسارك!» <sub>— Call-out toast when the lunger is on Dhari's left.</sub>
- `c3_wolves.toast.front` · toast — «الشيخ: قدّامك!» <sub>— Call-out toast when the lunger is ahead (within ± 20°).</sub>

◌ **bark `c3_wolves.bark.1`** — **فهيد:** ماسك رسن الحوار… ما أفكّه يا ضاري!  
<sub>Bark as wave 1 starts (before the first telegraph).</sub>

◌ **bark `c3_wolves.bark.2`** — **فهيد:** سحبوه! ضاري… سحبوا الحوار!  
<sub>Bark on a missed lunge (calf dragged 2 m; once per wave).</sub>

◌ **bark `c3_wolves.bark.3`** — **مسفر:** ردّوا… بس عيونهم للحين حولنا.  
<sub>Bark in the 6 s breath after wave 1.</sub>

◌ **bark `c3_wolves.bark.4`** — **الشيخ مانع:** جايّينك ثنين ورا بعض… لا تستعجل.  
<sub>Bark in the breath before wave 3 (announces the double lunge).</sub>

- `c3_wolves.fail.wave` · fail / retry line — «كاد الحوار يغيب في العتمة… ثبّت قدميك وأعِد الكرّة.» <sub>— Retry line: third miss in a wave → that wave restarts.</sub>

#### `c3_alpha`

*الأمعط steps into the light (named by the Sheikh if sawWolfPrint). Hold الثبات 6 s; feints at 2.2 s and 4.4 s reuse the lunge telegraph — releasing to swing IS the flinch. Camera pushes in.*

*The eye-pairs part. One wolf, bigger than the rest, walks into the firelight and does not fear the brand.*

**`c3_alpha.named`** — <sub>Blocking, at beat start WHEN sawWolfPrint = true: the Sheikh names him.</sub>

> **الراوي:** تفرّقت العيون… وخرج إلى ضوء النار ذئبٌ أضخم منها كلّها، ممعوط الجنب، قديم الجراح.  
> **ضاري:** جدّي… ذيب كبير، ممعوط الجنب. هذا راعي الجرّة اللي شفتها عند الحصا!  
> **الشيخ مانع:** الأمعط… أخبَره. ذيب هالرملة من سنين، وتابع ظعننا من يوم شدّينا.  
> **الشيخ مانع:** هذا ما ينضرب يا ضاري… هذا يُواجَه. نزّل الشهاب، وحطّ عينك بعينه.  
> **الشيخ مانع:** ينطّ عليك ويرجع… يمتحنك. ليا رمشت، أخذ الحوار. اثبت.  

**`c3_alpha.unnamed`** — <sub>Blocking, at beat start WHEN sawWolfPrint = false.</sub>

> **الراوي:** تفرّقت العيون… وخرج إلى ضوء النار ذئبٌ أضخم منها كلّها، ممعوط الجنب، قديم الجراح.  
> **ضاري:** جدّي… ذيب كبير طلع للضو. ممعوط الجنب، وما يهاب الشهاب!  
> **الشيخ مانع:** ذا كبيرهم… والذيابة ما تمشي إلا ورا راسه.  
> **الشيخ مانع:** هذا ما ينضرب يا ضاري… هذا يُواجَه. نزّل الشهاب، وحطّ عينك بعينه.  
> **الشيخ مانع:** ينطّ عليك ويرجع… يمتحنك. ليا رمشت، أخذ الحوار. اثبت.  

- `c3_alpha.obj` · objective — «اثبُت… وعينك في عين الذئب» <sub>— Objective.</sub>
- `c3_alpha.label.steady` · label — «اثبُت» <sub>— الثبات label (6 s; replaces «اضرب» for the whole beat).</sub>
- `c3_alpha.prompt.steady` · prompt — «اضغط مطوّلًا على «اثبُت»… ولا تضرب مهما وثب» <sub>— Prompt at the start of the hold (the trained reflex is the mistake).</sub>
- `c3_alpha.hint1` · hint — «الشيخ: الشجاعة صبر ساعة… لا تضرب، ولا ترمش.» <sub>— Hint 1 (45 s).</sub>
- `c3_alpha.hint2` · hint — «أبقِ إصبعك على «اثبُت» حتى يكتمل الطوق؛ وثباته خدعة فلا تضرب.» <sub>— Hint 2 (90 s).</sub>
- `c3_alpha.toast.stage1` · toast — «الشيخ: اركد… اركد.» <sub>— Coaching toast after feint 1 has passed (stage 33 %, outside the test window).</sub>
- `c3_alpha.toast.stage2` · toast — «الشيخ: اثبت… لا تلتفت.» <sub>— Coaching toast after feint 2 has passed (stage 66 %).</sub>
- `c3_alpha.fail.1` · fail / retry line — «رفعتَ الشهاب فوثب عليك… الثبات ألّا تضرب.» <sub>— Retry line, 1st flinch (he lunges, Dhari staggers; next try −1 s, one feint fewer).</sub>
- `c3_alpha.fail.2` · fail / retry line — «جفلتَ ثانيةً فطمع فيك… هو يمتحنك، فلا تُجِبه.» <sub>— Retry line, 2nd flinch.</sub>
- `c3_alpha.fail.3` · fail / retry line — «صاح الشيخ: اركد يا ولد! عينك بعينه… وأنا وراك.» <sub>— Retry line, 3rd flinch — the sterner line; the next attempt auto-steadies.</sub>

*The wolf looks away first. The pack melts into the dark. First naming of «الهيبة».*

**`c3_alpha.win`** — <sub>Blocking, after the hold completes (frame-drum hit + exhale first). Ends the beat.</sub>

> **الراوي:** طال الوقوف… ثم أشاح الذئب بعينه، ومضى إلى الظلام على مهل. وتبعته العيون واحدةً واحدة.  
> **فهيد:** راحوا! ضاري… راحوا والحوار سالم!  
> **مسفر:** عزّ الله إنك ذيب يا ضاري… ما شفت بعمري رجّال يردّ ذيب بعينه.  
> **الشيخ مانع:** الذيب ما يهاب العصا… يهاب اللي ما يهابه.  
> **الشيخ مانع:** وهذي يا وليدي أول الهيبة.  

#### `c3_suhail`

*Time-lapse: the sky wheels to LST 3.3. Low in the south-south-east (7° up) a yellow star has just risen: سهيل. The bright white star high in the south-east (المرزم) is NOT it. The strip gains the سهيل mark. Closing card.*

▣ **card `c3_lapse`** — «دار الفلك فوق رؤوسهم… ومضى الليل إلا أقلّه.»  
<sub>Narration card over the star time-lapse at the start of c3_suhail.</sub>

**`c3_suhail.ask`** — <sub>Blocking, after the time-lapse.</sub>

> **الشيخ مانع:** تالي الليل… والهوا برد. عط الجدي ظهرك يا ضاري، وناظر صوب اليَمَن.  
> **الشيخ مانع:** هالليالي يطلع سهيل… نجمٍ أصفر يرجف، قريّب من الأرض. إن شفته، عرفنا دربنا.  
> **ضاري:** وإن ما طلع يا جدّي؟  
> **الشيخ مانع:** يطلع… كلٍّ له يومه. دوّره.  

- `c3_suhail.obj` · objective — «ابحث عن سهيل قبل الفجر» <sub>— Objective.</sub>
- `c3_suhail.hint1` · hint — «الشيخ: عط الجدي ظهرك وناظر حدر… سهيل ما يعلّي.» <sub>— Hint 1 (20 s).</sub>
- `c3_suhail.hint2` · hint — «النجم الأبيض العالي هو المِرزم لا سهيل؛ انظر تحته إلى اليمين قرب الأفق.» <sub>— Hint 2 (40 s) — ALSO shown at once when the gaze rests on the decoy star.</sub>

◌ **bark `c3_suhail.bark.1`** — **الشيخ مانع:** ذاك المرزم… أبيض وعالي. لا يحلّفك إنه سهيل.  
<sub>Bark when the gaze rests on the decoy (Dhari is taken to have described it); fires together with hint2.</sub>

**`c3_suhail.found`** — <sub>Blocking, when سهيل is found.</sub>

> **ضاري:** جدّي… تحت المرزم على يمينه. نجمٍ أصفر يرجف، توّه طالع من الأرض!  
> **الشيخ مانع:** طلع سهيل… الحمد لله. علامة إن القيظ انكسر.  
> **الشيخ مانع:** ذاك علامة اليَمَن… ومن تبع سهيل ما ضاع عن أم الحيا.  
> **ضاري:** الجدي بين كتوفي… وسهيل بين عيوني.  
> **الشيخ مانع:** إيه… هذي كل الدلالة. والباقي صبر.  

- `c3_suhail.toast.strip` · toast — «حفظتَ مطلع سهيل… وصار علامة على شريط الأفق.» <sub>— Toast when the سهيل mark is added to the horizon strip.</sub>

▣ **card `c3_end`** — «ذَنَب السِّرحان» — «لاح الفجر الكاذب كذيل ذئبٍ في المشرق… وشدّ ربع مانع رحالهم صوب سهيل.»  
<sub>Closing card of chapter 3 («ذنب السرحان» = the false dawn, "the wolf's tail").</sub>

### Ch4 «حقّ الملح» — L3 «أم الحيا», morning → dusk → night.

#### `c4`

*Chapter-wide keys.*

▣ **card `c4`** — «الفصل الرابع» · «حقّ الملح» — «من شاركك الماء… حَرُم عليك دمه.»  
<sub>Chapter 4 title card — at chapter start, before c4_stranger (also chapter select).</sub>

- `c4.bounds` · turn-back line — «الوضحا تأبى وتلوي عنقها… ليس الماء من هنا.» <sub>— Ch4 soft boundary: الوضحا balks and turns back.</sub>

#### `c4_stranger`

*Day six. Thirst 36, one sip left. A dead camel and a man in its shade: جابر of ربع ثامر — old blood between the clans. Give the last sip or ride on → gaveWater. If refused the Sheikh gives his own share. جابر lives either way and tells them who holds the well. EMOTIONAL PEAK.*

*Riding at the head. Vultures wheel over something ahead — Dhari reports; the Sheikh reads it (this is the lesson the false trail of c4_search2 tests).*

◌ **bark `c4_stranger.bark.1`** — **ضاري:** رَخَم يحوم قدّامنا يا جدّي… فوق شي طايح.  
<sub>Bark at beat start, when the vultures enter view.</sub>

◌ **bark `c4_stranger.bark.2`** — **الشيخ مانع:** الرخم ما يحوم على ما… يحوم على موت.  
<sub>Bark 4 s after bark.1.</sub>

- `c4_stranger.obj` · objective — «تفقّد ما تحوم فوقه الرَّخَم» <sub>— Objective.</sub>
- `c4_stranger.label.inspect` · label — «تفقّد الرجل» <sub>— Context verb at the dead camel (usable from the saddle; triggers the scripted dismount).</sub>
- `c4_stranger.hint1` · hint — «الرخم ما يحوم عبث… خلّني أشوف وش تحته.» <sub>— Hint 1 (45 s) — Dhari's own voice from here to the end of the game.</sub>
- `c4_stranger.hint2` · hint — «اقترب من البعير الطريح واضغط «تفقّد الرجل».» <sub>— Hint 2 (90 s).</sub>

*مسفر reads the brand on the dead camel. He is the voice of the grudge AND of the arithmetic. The Sheikh puts the decision in Dhari's hand.*

**`c4_stranger.find`** — <sub>Blocking, on «تفقّد الرجل». Leads straight into the choice.</sub>

> **ضاري:** ذلول ميتة… وبظلّها رجّال! حيّ يا جدّي، صدره يطلع وينزل.  
> **مسفر:** تحرّ يا ضاري… شف الوسم على فخذ الذلول. هذا وسم ربع ثامر!  
> **مسفر:** ذولا اللي بيننا وبينهم دم… أبوك طاح بكونٍ معهم وأنت ورع.  
> **جابر:** ما… جُغمة ما… تكفون.  
> **مسفر:** ما بقربتك إلا شربة يا ضاري، وعيالنا ورانا… لا تصير مجير أم عامر.  
> **الشيخ مانع:** القربة بيد ضاري… والراي رايه.  

- `c4_stranger.ask` · choice heading — «في القربة شربة واحدة… والرجل يحتضر.» <sub>— Choice heading.</sub>
- `c4_stranger.choice.give` · choice option — «اسقِه من مائنا» <sub>— Option → gaveWater = true.</sub>
- `c4_stranger.choice.refuse` · choice option — «امضِ… ماؤنا لا يكفي عيالنا» <sub>— Option → gaveWater = false.</sub>

*GIVE — consequence shot: جابر drinks from Dhari's skin; the قربة icon empties.*

**`c4_stranger.give`** — <sub>Blocking, gaveWater = true.</sub>

> **ضاري:** العطشان ما له قبيلة يا مسفر.  
> **الراوي:** جثا ضاري عند الرجل ورفع رأسه… وصبّ آخر ما في القربة بين شفتيه.  
> **جابر:** سقاك الله… من حوض النبي.  
> **الشيخ مانع:** بيّض الله وجهك يا وليدي… اليوم سقيت رجّال، وباكر يسقيك الله.  
> **مسفر:** قلت اللي بخاطري… وأنت سوّيت اللي أكبر منه.  

*REFUSE — Dhari turns الوضحا away. Behind him a camel is made to kneel: the Sheikh asks to be LED to the man and gives his own share. Consequence shot: the Sheikh's hands, the stranger drinking.*

**`c4_stranger.refuse`** — <sub>Blocking, gaveWater = false.</sub>

> **ضاري:** سامحني يا رجّال… ما معي إلا شربة، وورانا جهّال.  
> **الراوي:** لوى ضاري رأس الوضحا ليمضي… فسمع خلفه ذلولًا تُناخ.  
> **الشيخ مانع:** إخّ… إخّ. هات يدك يا مسفر، ودلّني عليه.  
> **الراوي:** نزل الشيخ عن ذلوله وجثا عند الغريب… وسقاه نصيبه كلّه.  
> **الشيخ مانع:** الما يرجع… والوجه ما يرجع يا ضاري.  
> **جابر:** سقاك الله من حوض النبي يا عم.  

**`c4_stranger.refuse.after`** — <sub>Blocking, gaveWater = false, right after c4_stranger.refuse.</sub>

> **ضاري:** يا جدّي… هذا نصيبك كله! وأنت؟  
> **الشيخ مانع:** أنا شايب، وقليلي يكفيني… امش، واحفظ اللي شفت.  

*BOTH branches: the revived man tells them who he is and who holds the well.*

**`c4_stranger.news`** — <sub>Blocking, both branches.</sub>

> **جابر:** أنا جابر… من ربع ثامر. ذلولي بركت وما ثارت، من ليلتين.  
> **الشيخ مانع:** ووين ربعك يا جابر؟  
> **جابر:** على عِدّ أم الحيا… نازلين عليه من أول القيظ، والبواردية حوله ليل ونهار.  
> **مسفر:** أم الحيا! يا عم… العِدّ اللي نبيه بيدينهم!  
> **جابر:** والشيخ ثامر حالف… ما يسقي منه غريب هالسنة. الما قلّ، والخوف من القوم كثر.  
> **الشيخ مانع:** ثامر… أخبَره. رجّال صلب، مير ما هو بظالم. والعطش ما يخيّرنا يا مسفر… ما قدّامنا غيره.  

*The chapter title lands: shared water is a bond (حق الملح). جابر becomes their خويّ.*

**`c4_stranger.salt`** — <sub>Blocking, both branches. Ends the beat (fade).</sub>

> **جابر:** بيني وبينكم ملح من ذا اليوم… وأنا خويّكم لين العِدّ.  
> **الشيخ مانع:** حق الملح محفوظ يا جابر… اركب.  
> **الراوي:** أُركب جابر على بعيرٍ من الزَّمَل… ومضى الظعن جنوبًا.  

#### `c4_collapse`

*Afternoon. The Sheikh weakens (if refused: BECAUSE he gave his share — مسفر says so). The caravan halts under an acacia. He sends Dhari on alone: follow the قطا.*

**`c4_collapse.gave`** — <sub>Blocking, at beat start, gaveWater = true.</sub>

> **الراوي:** عند العصر مال الشيخ على شداده… ولولا يد مسفر لسقط.  
> **مسفر:** نوّخوا تحت السَّمُرة! الشيخ طاح حيله… نوّخوا!  
> **موضي:** يا عمّي! ما تشوف شر… ريقه ناشف، وما بقى بالقِرَب قطرة.  
> **الشيخ مانع:** الشر ما يجيكم… القيظ أخذ مني اللي أخذ. ما أقدر أكمّل الليلة.  

**`c4_collapse.refused`** — <sub>Blocking, at beat start, gaveWater = false (the cost of refusing: his collapse; Dhari keeps the sip).</sub>

> **الراوي:** عند العصر مال الشيخ على شداده… ولولا يد مسفر لسقط.  
> **مسفر:** نوّخوا تحت السَّمُرة! الشيخ طاح حيله… نوّخوا!  
> **مسفر:** عطى نصيبه للغريب، ومن الفجر ما بلّ ريقه… هذا اللي طيّحه يا ضاري.  
> **ضاري:** اشرب شربتي يا جدّي… تكفى.  
> **الشيخ مانع:** خلّها معك… اللي رايح يدوّر الما أحوج لها من اللي قاعد ينطره.  
> **الشيخ مانع:** وما أقدر أكمّل الليلة يا وليدي… القيظ أخذ مني اللي أخذ.  

*Lying in the acacia's shade he gives the whole method in four lines — birds, cairns, the star at the back.*

**`c4_collapse.send`** — <sub>Blocking, both branches.</sub>

> **الشيخ مانع:** اقرب يا ضاري… واسمعني زين.  
> **الشيخ مانع:** أم الحيا قريبة، مسيرة عصر ومغيب… بس الظعن ما يمشي بلا دليلة، وأنا طحت.  
> **الشيخ مانع:** رُح لحالك. القطا يرد الما مع المغيب… اتبع القطا.  
> **الشيخ مانع:** والرجوم على روس الطعوس، رجمٍ يسلّمك لرجم… وليا أظلمت، الجدي بين كتوفك.  
> **ضاري:** وإن ضعت يا جدّي؟ أنا أشوف… بس أنت اللي تفهم.  
> **الشيخ مانع:** اللي أفهمه عطيتك إياه، سؤال ورا سؤال… بقي تصدّق عيونك. اعقلها وتوكّل.  

*Farewells. جابر, still weak, teaches the way a stranger must come to an armed well (sets up c5_scout / c5_walk).*

**`c4_collapse.go`** — <sub>Blocking, both branches. Then control: mount and leave.</sub>

> **جابر:** يا ضاري… ليا شفت ضوّ ربعي، لا تجيهم من ورا البيوت.  
> **جابر:** تعال من قدّام الضو، على رجليك… والبندق على الشداد. ثامر يعرف الرجّال من مشيته.  
> **موضي:** استودعتك الله يا وليدي… اللي ما تضيع ودايعه.  
> **فهيد:** خذ الوضحا يا ضاري… الوضحا تعرف ريحة الما!  
> **ضاري:** في أمان الله.  
> **الشيخ مانع:** في أمان الكريم يا وليدي.  

- `c4_collapse.obj` · objective — «اركب الوضحا وامضِ وحدك» <sub>— Objective after the farewells.</sub>
- `c4_collapse.label.mount` · label — «اركب الوضحا» <sub>— Context verb on the kneeling الوضحا.</sub>
- `c4_collapse.hint1` · hint — «الظعن وقف… وما بقى يمشي إلا أنا.» <sub>— Hint 1 (45 s) — Dhari's voice.</sub>
- `c4_collapse.hint2` · hint — «اقترب من الوضحا واضغط «اركب الوضحا».» <sub>— Hint 2 (90 s).</sub>

#### `c4_search`

*Alone on الوضحا, golden hour. Cairn 1 → cairn 2 (~240 m). قطا flights every 30 s overtake from behind. If gaveWater the قربة is empty; else Dhari may drink the single sip. EXAM of الفراسة — nobody asks, nobody explains.*

▣ **card `c4_alone`** — «مضى ضاري وحده… ولأوّل مرّة لم يسأله أحد: ماذا ترى؟»  
<sub>Narration card at the start of c4_search, over the first wide shot of the lone rider.</sub>

- `c4_search.obj` · objective — «اتبع القطا والرجوم إلى الماء» <sub>— Objective.</sub>
- `c4_search.prompt.qata` · prompt — «افتح عين الفراسة حين يمرّ القطا لترى خطّ طيرانه» <sub>— Prompt with the first قطا flight.</sub>
- `c4_search.label.cairn` · label — «افحص الرجم» <sub>— Context verb at a cairn (from the saddle).</sub>
- `c4_search.hint1` · hint — «القطا يمرّ من فوقي ووجهه ما يتغيّر… وجهه وجهي.» <sub>— Hint 1 (45 s) — Dhari's voice.</sub>
- `c4_search.hint2` · hint — «افتح عين الفراسة عند مرور السرب، ثم اقصد الرجم الذي على الأفق.» <sub>— Hint 2 (90 s).</sub>

◌ **bark `c4_search.bark.1`** — **ضاري:** قطا… وجهه جنوب. أهدى من القطا ما به.  
<sub>Bark with the first قطا flight (he now says the Sheikh's proverb himself).</sub>

◌ **bark `c4_search.bark.2`** — **ضاري:** رجم… حطّه اللي قبلنا يدلّ اللي بعدنا.  
<sub>Bark on reaching cairn 1 (the Sheikh's ch2 line, now in Dhari's mouth).</sub>

- `c4_search.toast.dry` · toast — «القربة فارغة… أعطيتَ آخرها.» <sub>— Toast when gaveWater = true and the player holds the empty قربة / at thirst 30.</sub>
- `c4_search.prompt.drink` · prompt — «في القربة شربة أخيرة… اضغط عليها مطوّلًا إن شئت» <sub>— Prompt at cairn 1 when gaveWater = false (the single sip is still his).</sub>
- `c4_search.toast.sip` · toast — «آخر شربة… وجدّي ما ذاق مثلها.» <sub>— Toast (Dhari) after drinking that last sip, gaveWater = false.</sub>

#### `c4_search2`

*Cairn 2 → 3 → 4 (~240 m). A false trail branches east at cairn 2 (≤ 100 m) and ends at camel bones; from the bones the true cairn is in sight. Night falls at ~60 %; a far howl once; the strip shows the سهيل mark; الجدي over the shoulder.*

- `c4_search2.obj` · objective — «واصل من رجمٍ إلى رجم قبل الظلام» <sub>— Objective.</sub>
- `c4_search2.label.cairn` · label — «افحص الرجم» <sub>— Context verb at cairns 2–4.</sub>
- `c4_search2.hint1` · hint — «الدرب المدقوق يغرّ… والرجم ما يكذب.» <sub>— Hint 1 (45 s) — Dhari's voice.</sub>
- `c4_search2.hint2` · hint — «تجاهل الدرب الشرقي؛ اقصد الرجم الذي يلمع رأسه على الأفق.» <sub>— Hint 2 (90 s).</sub>
- `c4_search2.toast.fork` · toast — «دربان… جادّة مدقوقة إلى الشرق، ورجمٌ بعيد على الأفق.» <sub>— Toast at cairn 2 where the false trail branches east.</sub>

*The false trail ends at bleached camel bones under circling vultures — the Sheikh's morning lesson, proved.*

- `c4_search2.label.bones` · label — «افحص العظام» <sub>— Context verb at the bones (end of the false trail).</sub>

**`c4_search2.bones`** — <sub>Blocking, on «افحص العظام» (only if the player took the false trail). The true cairn is then marked.</sub>

> **ضاري:** عظام ركاب… ماتت هنا عطش. هذا درب موت.  
> **ضاري:** ما كل بيضا شحمة… الدرب المدقوق ما هو بدرب الما.  
> **ضاري:** ذاك الرجم، راسه يلمع ورا الطعس… ارجعي يا الوضحا.  

- `c4_search2.toast.night` · toast — «أظلم الليل… والجدي بين كتفيك.» <sub>— Toast at nightfall (~60 % of the path), when the strip switches to the star marks.</sub>

◌ **bark `c4_search2.bark.1`** — **ضاري:** هناك مطلع سهيل… ما طلع، بس أعرف مكانه.  
<sub>Bark shortly after nightfall, when the سهيل mark shows on the strip.</sub>

◌ **bark `c4_search2.bark.2`** — **ضاري:** عوى الذيب… وعزّ الله إني استانست به.  
<sub>Bark after the single far howl (between cairns 3 and 4). Sets up the last line of c4_ridge.</sub>

#### `c4_ridge`

*Firelight glows on the haze from 150 m; a crest above a basin with trees, a fire, armed men around the well. Cliffhanger card.*

- `c4_ridge.obj` · objective — «اصعد الكثيب المطلّ على الوهج» <sub>— Objective (set when the glow becomes visible).</sub>
- `c4_ridge.hint1` · hint — «ضو على الغبرة… والضو معناه ناس، والناس معناهم ما.» <sub>— Hint 1 (45 s) — Dhari's voice.</sub>
- `c4_ridge.hint2` · hint — «اقصد الوهج البرتقالي واصعد الكثيب المطلّ عليه.» <sub>— Hint 2 (90 s).</sub>
- `c4_ridge.toast.glow` · toast — «ضو… ضو على الغبرة يا الوضحا!» <sub>— Toast (Dhari) when the glow first shows, 150 m out.</sub>

*On the crest: the basin, the trees, the well — and the rifles. The wolf's howl was company; men are what he fears.*

**`c4_ridge.see`** — <sub>Blocking, inside the 20 m crest volume. Then card c4_end.</sub>

> **ضاري:** أم الحيا… شجر، وبير، وضو.  
> **ضاري:** ورجال… بواردية حول الما. ربع ثامر.  
> **ضاري:** عوى الذيب واستانست… وهالحين شفت الناس، وخفت.  

▣ **card `c4_end`** — «أم الحيا» — «وجد الماء… ووجد البنادق دونه.»  
<sub>Closing (cliffhanger) card of chapter 4.</sub>

### Ch5 «الهيبة» — L3 «أم الحيا», night → dawn. The well.

#### `c5`

*Chapter-wide keys.*

▣ **card `c5`** — «الفصل الخامس» · «الهيبة» — «الشجاعة صبر ساعة.»  
<sub>Chapter 5 title card — at chapter start, before c5_scout (also chapter select).</sub>

- `c5.bounds` · turn-back line — «صفير حارسٍ من العتمة… الزم دربك.» <sub>— Ch5 soft boundary: a sentry's whistle.</sub>

#### `c5_scout`

*On the ridge (المرقاب). الفراسة counts six riflemen (numerals ١…٦). Hang the rifle on the saddle (hold 1 s) → leftRifle: coming unarmed = seeking الدخالة.*

- `c5_scout.obj` · objective — «عُدّ الرجال حول البئر بعين الفراسة» <sub>— Objective, step 1.</sub>
- `c5_scout.prompt.count` · prompt — «مرّ بعين الفراسة على الرجال واحدًا واحدًا لتعدّهم» <sub>— Prompt at beat start.</sub>
- `c5_scout.hint1` · hint — «قبل أنزل… كم بندق حول الما؟ خلّني أعدّهم.» <sub>— Hint 1 (45 s) — Dhari's voice.</sub>
- `c5_scout.hint2` · hint — «اضغط زرّ الفراسة ومرّ بنظرك على الرجال حتى يكتمل عدّهم ستة.» <sub>— Hint 2 (90 s).</sub>

◌ **bark `c5_scout.bark.1`** — **ضاري:** ستة… ست بنادق، وأنا واحد.  
<sub>Bark when the sixth rifleman is numbered.</sub>

- `c5_scout.rifle.obj` · objective — «علّق البندق على الشداد وانزل أعزل» <sub>— Objective, step 2.</sub>
- `c5_scout.label.hang` · label — «علّق البندق» <sub>— Context verb at الوضحا (hold 1 s) → leftRifle = true.</sub>
- `c5_scout.prompt.hang` · prompt — «اضغط مطوّلًا لتعلّق البندق على الشداد» <sub>— Prompt when «علّق البندق» is in reach.</sub>
- `c5_scout.rifle.hint1` · hint — «البندق يقول «قوم»… واليد الفاضية تقول «دخيل».» <sub>— Hint 1 (45 s) — Dhari's voice («القوم» = raiders).</sub>
- `c5_scout.rifle.hint2` · hint — «اقترب من الوضحا واضغط مطوّلًا على «علّق البندق».» <sub>— Hint 2 (90 s).</sub>
- `c5_scout.toast.hung` · toast — «البندق على الشداد… خلّيك هنا يا الوضحا.» <sub>— Toast (Dhari) when the rifle is hung.</sub>
- `c5_scout.toast.armed` · toast — «بندقك على كتفك… ومن نزل مسلّحًا عُدَّ غازيًا.» <sub>— Warning toast if the player starts down the slope WITHOUT hanging the rifle (leftRifle stays false; not a fail).</sub>

#### `c5_walk`

*55 m down to the fire, speed locked at 1.5 m/s. Shot 1 at 20 m, shot 2 at 38 m; in the last 6 m the men rise and nothing happens. Flinch → the jeer → retry from the ridge foot. EMOTIONAL PEAK: footsteps as metronome, wind drops.*

- `c5_walk.obj` · objective — «انزل إلى النار بخطوةٍ لا تتغيّر» <sub>— Objective.</sub>
- `c5_walk.prompt.pace` · prompt — «أبقِ إبهامك مسحوبًا نحو النار… لا تقف ولا تلتفت» <sub>— Prompt at the first step of the descent (touch).</sub>
- `c5_walk.prompt.pace.kb` · prompt — «أبقِ مفتاح التقدّم مضغوطًا… لا تقف ولا تلتفت» <sub>— Keyboard variant of the pace prompt.</sub>
- `c5_walk.hint1` · hint — «الهون أبرك ما يكون… مشية وحدة، لا أوقف ولا ألتفت.» <sub>— Hint 1 (45 s) — Dhari's voice.</sub>
- `c5_walk.hint2` · hint — «واصل المشي نحو النار دون توقّف أو انحراف، حتى عند الرصاص.» <sub>— Hint 2 (90 s).</sub>

*A sentry's challenge out of the dark. Dhari answers with his standing and his people — walking on.*

◌ **bark `c5_walk.bark.1`** — **رجل من ربع ثامر:** عندك! من الرجّال؟  
<sub>Bark at ~6 m of the walk.</sub>

◌ **bark `c5_walk.bark.2`** — **ضاري:** عاني… من ربع مانع! جايّكم على رجليّ.  
<sub>Bark at ~12 m (must end before shot 1 at 20 m).</sub>

- `c5_walk.toast.shot1` · toast — «اركد… اثبت… لا تلتفت.» <sub>— Toast (Dhari, inner voice) at ~24 m — after the 0.8 s window of shot 1 has passed.</sub>

◌ **bark `c5_walk.bark.3`** — **رجل من ربع ثامر:** حدّك! الثانية ما تخطيك!  
<sub>Bark at ~30 m (must end before shot 2 at 38 m).</sub>

- `c5_walk.toast.shot2` · toast — «كلٍّ يموت بيومه… وأنا يومي ما هو اليوم.» <sub>— Toast (Dhari, inner voice) at ~42 m — after the window of shot 2.</sub>

◌ **bark `c5_walk.bark.4`** — **رجل من ربع ثامر:** والله ما رمش… خلّوه يقبل.  
<sub>Bark in the last 6 m, as the men rise.</sub>

- `c5_walk.fail` · fail / retry line — «ضحك الرماة: «هذا ما هو ولد مانع!»… عُد إلى سفح الكثيب.» <sub>— Retry line on a flinch (the jeer) → restart from the ridge foot (or from the last passed shot).</sub>

#### `c5_words`

*Sheikh ثامر at the fire. Two exchanges, three answers each. Truth, lineage and الدخالة raise haybah; evasion and bravado lower it (0–4). After each answer the circle reacts and he leans back or forward. EMOTIONAL PEAK.*

- `c5_words.obj` · objective — «أجب الشيخ ثامر» <sub>— Objective (shown during the two choices).</sub>
- `c5_words.hint1` · hint — «الرجّال ينوزن بكلمته… والصدق أثقل من الهياط.» <sub>— Hint 1 (45 s on a choice) — Dhari's voice.</sub>
- `c5_words.hint2` · hint — «اختر جوابك واضغط مطوّلًا لتثبيته؛ الصدق والنسب والدخالة ترفع الهيبة.» <sub>— Hint 2 (90 s on a choice).</sub>

*He does not rise. He returns the greeting — a rival keeps his manners. His first line reads the rifle.*

**`c5_words.open.unarmed`** — <sub>Blocking, at beat start WHEN leftRifle = true.</sub>

> **الراوي:** عند النار شيخٌ لم يقم… لحيته خطّها الشيب، وعيناه على ضاري من أوّل خطوة.  
> **ضاري:** السلام عليكم.  
> **الشيخ ثامر:** وعليكم السلام.  
> **الشيخ ثامر:** جاي لضوّي على رجليك، ويدينك فاضية… يا إنك دخيل، يا إنك ما تدري وين جيت.  
> **ضاري:** أدري وين جيت يا عم.  

**`c5_words.open.armed`** — <sub>Blocking, at beat start WHEN leftRifle = false.</sub>

> **الراوي:** عند النار شيخٌ لم يقم… لحيته خطّها الشيب، وعيناه على ضاري من أوّل خطوة.  
> **ضاري:** السلام عليكم.  
> **الشيخ ثامر:** وعليكم السلام.  
> **الشيخ ثامر:** جاي لضوّي وبندقك على كتفك… حطّها بالأرض، ثم تكلّم.  
> **الراوي:** وضع ضاري بندقه على الرمل… وأبعد يديه عنها.  

*EXCHANGE 1 — who are you, whose are you?*

**`c5_words.r1.q`** — <sub>Blocking, before choice 1.</sub>

> **الشيخ ثامر:** قلت إنك من ربع مانع… من أنت منهم؟ وش ترجع؟  

- `c5_words.r1.ask` · choice heading — «ثامر: من أنت من ربع مانع… وش ترجع؟» <sub>— Choice 1 heading.</sub>
- `c5_words.r1.choice.a` · choice option — «أنا ضاري… والشيخ مانع جدّي» — **هيبة +2 — صدق ونسب (truth + lineage)** <sub>— Choice 1 option a.</sub>
- `c5_words.r1.choice.b` · choice option — «اسمي ضاري… وجايّك بحاجة» — **هيبة +1 — صدق بلا نسب (true, but he holds the lineage back)** <sub>— Choice 1 option b.</sub>
- `c5_words.r1.choice.c` · choice option — «واحدٍ من رجاله… والاسم ما يهمّ» — **هيبة −1 — مراوغة (evasion)** <sub>— Choice 1 option c.</sub>

**`c5_words.r1.a`** — <sub>Blocking, after option r1.a (he leans back).</sub>

> **ضاري:** أنا ضاري… والشيخ مانع جدّي، أبو أبوي. وأنا اللي قدّام ظعنه.  
> **الشيخ ثامر:** ولد ولد مانع…  
> **الشيخ ثامر:** والنِّعم. جدّك دليلة ما جاب الله مثله… ولو إن بيني وبينه دم.  

- `c5_words.r1.a.circle` · toast — «همهمة في الحلقة… وأنزل أحد الرماة بندقه.» <sub>— Circle reaction toast after c5_words.r1.a (approving murmur).</sub>

**`c5_words.r1.b`** — <sub>Blocking, after option r1.b (he waits, unmoved).</sub>

> **ضاري:** اسمي ضاري… وجايّك بحاجة.  
> **الشيخ ثامر:** ضاري… والرجّال بلا أهل مثل الجرّة بلا ذلول. ولد من أنت؟  
> **ضاري:** ولد ولد مانع… الشيخ مانع جدّي.  
> **الشيخ ثامر:** كان قلتها من أول… الاسم الطيّب ما ينخشّ.  

- `c5_words.r1.b.circle` · toast — «سكتت الحلقة… تنتظر كلمة الشيخ.» <sub>— Circle reaction toast after c5_words.r1.b (silence).</sub>

**`c5_words.r1.c`** — <sub>Blocking, after option r1.c (he leans forward).</sub>

> **ضاري:** واحدٍ من رجاله… والاسم ما يهمّ.  
> **الشيخ ثامر:** ما يهمّ؟ اللي يخشّ اسمه… يا خايف منه، يا مستحي به.  
> **الشيخ ثامر:** وربع مانع ما عهدتهم لا ذا ولا ذاك.  
> **الشيخ ثامر:** وتحسب الاسم ينخبّى؟ رجالي شافوا ذلولك فوق الطعس… وعليها وسم مانع.  
> **الشيخ ثامر:** وهالعين عينه… أنت من دمّه، قلتها والا ما قلتها.  

- `c5_words.r1.c.circle` · toast — «ضحكة قصيرة في الحلقة… ومال الشيخ إلى الأمام.» <sub>— Circle reaction toast after c5_words.r1.c (a short laugh).</sub>

*EXCHANGE 2 — the blood and the oath are put on the table; then: what brought you?*

**`c5_words.r2.q`** — <sub>Blocking, before choice 2.</sub>

> **الشيخ ثامر:** بيني وبين جدّك دم… أخوي طاح ذاك اليوم، وأبوك طاح. والدم ما يصير ما.  
> **الشيخ ثامر:** وأنا حالف ما أسقي غريب هالسنة… وش جابك لمانا يا ولد مانع؟  

- `c5_words.r2.ask` · choice heading — «ثامر: وش جابك لمانا يا ولد مانع؟» <sub>— Choice 2 heading.</sub>
- `c5_words.r2.choice.a` · choice option — «جيت للما… وما أرجع بلاه» — **هيبة −1 — تحدٍّ وهياط (bravado)** <sub>— Choice 2 option a.</sub>
- `c5_words.r2.choice.b` · choice option — «جيتك عاني… داخل على الله ثم عليك» — **هيبة +2 — دخالة وصدق (asking protection, truthfully)** <sub>— Choice 2 option b.</sub>
- `c5_words.r2.choice.c` · choice option — «نشتري وِردنا… ببكرتين من خيار البل» — **هيبة 0 — مساومة (honest but misjudged: water is not sold)** <sub>— Choice 2 option c.</sub>

**`c5_words.r2.a`** — <sub>Blocking, after option r2.a (he leans forward).</sub>

> **ضاري:** جيت للما… واللي مشى للرصاص ما يرجع بلاه.  
> **الشيخ ثامر:** الرصاص اللي مشيت له كان بالأرض يا ولد… لو بغيته بصدرك ما خطاك.  
> **الشيخ ثامر:** والهياط ما يروّي عطشان.  

- `c5_words.r2.a.circle` · toast — «ضحك الرماة… واشتدّت قبضاتهم على البنادق.» <sub>— Circle reaction toast after c5_words.r2.a (a short laugh).</sub>

**`c5_words.r2.b`** — <sub>Blocking, after option r2.b (he leans back).</sub>

> **ضاري:** جيتك عاني يا عم… ربعي وراي عطاشى: حريم وجهّال، وشايب طاح حيله.  
> **ضاري:** ما جيت أنكر الدم ولا أذكّرك به… جيت داخل على الله ثم عليك.  
> **الراوي:** سكتت الحلقة كلّها… فالكلمة التي قيلت لا يردّها رجلٌ له وجه.  
> **الشيخ ثامر:** دخيل… وجاي من بيت الدم.  
> **الشيخ ثامر:** كلمة ثقيلة يا ولد… واللي يقولها لازم يقدر يشيلها.  

- `c5_words.r2.b.circle` · toast — «همهمة استحسان… ورجع الشيخ بظهره إلى الوراء.» <sub>— Circle reaction toast after c5_words.r2.b (approving murmur).</sub>

**`c5_words.r2.c`** — <sub>Blocking, after option r2.c (he does not move).</sub>

> **ضاري:** نشتري وِردنا يا عم… ببكرتين من خيار حلالنا.  
> **الشيخ ثامر:** حنّا ما نبيع الما يا ولد… الما ما ينباع ولا ينشرى.  
> **الشيخ ثامر:** ينعطى… والا ينمنع.  

- `c5_words.r2.c.circle` · toast — «ابتسم بعضهم… وهزّ شايبٌ في الحلقة رأسه.» <sub>— Circle reaction toast after c5_words.r2.c (wry smiles).</sub>

*Whatever was said, words are not enough. He stands.*

**`c5_words.rise`** — <sub>Blocking, after the second reaction. Ends the beat (checkpoint before the stare).</sub>

> **الشيخ ثامر:** الكلام قلته… والكلام هيّن. خلّني أشوف وش وراه.  
> **الراوي:** قام الشيخ ثامر… ويده على خنجره.  

#### `c5_stare`

*He steps close, hand on his dagger. Hold الثبات for 8 − 0.6 × haybah s (min 5): he steps in → hand on the dagger → (haybah ≤ 1) an inch of blade. Flinch → retry this beat only, with the assist. EMOTIONAL PEAK: no music, heartbeat 60 → 96 bpm.*

- `c5_stare.obj` · objective — «اثبُت… وعينك في عينه» <sub>— Objective.</sub>
- `c5_stare.label.steady` · label — «اثبُت» <sub>— الثبات label.</sub>
- `c5_stare.prompt.steady` · prompt — «اضغط مطوّلًا على «اثبُت»… ولا تُشِح بنظرك عنه» <sub>— Prompt at the start of the hold.</sub>
- `c5_stare.hint1` · hint — «ثبتّ للذيب عند الضو… وهذا ذيبٍ ثاني. عيني بعينه.» <sub>— Hint 1 (45 s) — Dhari's voice.</sub>
- `c5_stare.hint2` · hint — «أبقِ إصبعك على «اثبُت» ونظرك عليه حتى يكتمل الطوق.» <sub>— Hint 2 (90 s).</sub>

*One line per authored stage, shown as he completes each move (never inside the test window itself).*

- `c5_stare.toast.stage1` · toast — «ثامر: عينك بعيني يا ولد مانع.» <sub>— Stage 1 (33 %): after he has stepped in.</sub>
- `c5_stare.toast.stage2` · toast — «ثامر: أبوك وقف وقفتك ذي… وما رجع.» <sub>— Stage 2 (66 %): after his hand has closed on the dagger.</sub>
- `c5_stare.toast.stage3` · toast — «ثامر: الخنجر عطشان مثلكم يا ولد.» <sub>— Stage 3, ONLY when haybah ≤ 1: after the inch of blade shows.</sub>
- `c5_stare.fail.1` · fail / retry line — «ثامر: رمشت يا ولد… والعِدّ ما يرِده اللي يرمش. ارفع راسك.» <sub>— Retry line, 1st flinch (next try −1 s, one test fewer).</sub>
- `c5_stare.fail.2` · fail / retry line — «ثامر: مرّتين… جدّك ما رمش لي بعمره. آخر مرّة.» <sub>— Retry line, 2nd flinch.</sub>
- `c5_stare.fail.3` · fail / retry line — «شددتَ على نفسك: وراي فهيد وأمي وجدّي… والله ما أرمش.» <sub>— Retry line, 3rd flinch — the sterner line; the next attempt auto-steadies.</sub>

#### `c5_verdict`

*gaveWater: جابر rides in alone, sent ahead by the Sheikh, and testifies. Otherwise ثامر grants the water on composure alone. Either way the oath is resolved honourably; the coffee is the sign of safety.*

*First his judgment of how the boy SPOKE — the haybah-dependent wording of the verdict ("sterner words" when the answers were poor).*

**`c5_verdict.words.high`** — <sub>Blocking, at beat start WHEN haybah ≥ 3 (before the gave / refused block).</sub>

> **الشيخ ثامر:** لسانك لسان رجّال… وعينك عين رجّال.  

**`c5_verdict.words.mid`** — <sub>Blocking, at beat start WHEN haybah = 2.</sub>

> **الشيخ ثامر:** لسانك تعثّر… مير عينك ما تعثّرت.  

**`c5_verdict.words.low`** — <sub>Blocking, at beat start WHEN haybah ≤ 1.</sub>

> **الشيخ ثامر:** لسانك خانك يا ولد… وعينك هي اللي شفعت لك.  

*GAVE — a rider out of the dark, on the Sheikh's own camel.*

**`c5_verdict.gave`** — <sub>Blocking, gaveWater = true, after c5_verdict.words.*.</sub>

> **الراوي:** طال الصمت… ثم سُمع من العتمة رُغاء ذلول، وراكبٌ ينادي قبل أن يصل.  
> **جابر:** يا عم! يا عم ثامر… عندك لا تمسّه!  
> **الشيخ ثامر:** جابر؟ قلنا أكلتك الرملة يا ولد أخوي!  
> **جابر:** أكلتني لولا هذا… ذلولي ماتت وطحت بظلّها، ومرّ بي ظعن مانع وما بقربتهم إلا شربة.  
> **جابر:** هذا اللي سقاني من آخر ماه يا عم!  
> **جابر:** وجدّه ركّبني ذلوله وقال: الحق ضاري… شهادتك أمانة.  

**`c5_verdict.gave.oath`** — <sub>Blocking, gaveWater = true, follows c5_verdict.gave. The oath is resolved by the bond of salt.</sub>

> **الراوي:** نظر ثامر إلى ضاري طويلًا… ثم رفع يده عن خنجره.  
> **الشيخ ثامر:** سقيته من آخر ماك… وأنت تدري إنه من ربع ثامر؟  
> **ضاري:** أدري… والعطشان ما له قبيلة.  
> **الشيخ ثامر:** حلفت ما أسقي غريب هالسنة… واللي بيننا وبينه ملح، ما عاد هو بغريب.  
> **الشيخ ثامر:** اللي يسقي ولدنا من آخر ماه… ما يُرَدّ عن مانا. رِدوا، الما ماكم.  
> **الشيخ ثامر:** صبّوا له القهوة.  

*REFUSED — nobody comes. He judges the boy by the stare alone, and expiates his oath.*

**`c5_verdict.refused`** — <sub>Blocking, gaveWater = false, after c5_verdict.words.*. The oath is resolved by كفّارة اليمين.</sub>

> **الراوي:** طال الصمت… ثم رفع ثامر يده عن خنجره، ورجع خطوة.  
> **الشيخ ثامر:** وقفت لي وقفة ما وقفها قدّامي إلا رجّال واحد… جدّك.  
> **الشيخ ثامر:** فيك من مانع.  
> **الشيخ ثامر:** حلفت ما أسقي غريب هالسنة… وأكفّر عن يميني. العطشان ما يُرَدّ.  
> **الشيخ ثامر:** لكم وِرْد… رِدوا واسقوا حلالكم. والدم له مجلس غير هذا.  
> **الشيخ ثامر:** صبّوا له القهوة.  

*BOTH — the caravan is still out in the dark and cannot find the basin: the signal.*

**`c5_verdict.signal`** — <sub>Blocking, both branches. Ends the beat.</sub>

> **ضاري:** ربعي ورا الطعوس يا عم… ينطرون علامة، وما يشوفون الدرب بالليل.  
> **الشيخ ثامر:** خذ شهاب من ضوّي وشبّ على راس المرقاب… اللي يشوف الضو يعرف إن الما وراه.  
> **الشيخ ثامر:** يالله… ربعك عطاشى، والكلام يصبر.  

#### `c5_signal`

*Carry a brand ≤ 60 m up the ridge (running allowed, no fail) and hold 1.5 s to light the signal pile — the hold that drew mud in ch1 now draws fire. Cinematic: the fire from afar; time-lapse to dawn; the caravan descends; everyone drinks; the two old men meet.*

- `c5_signal.obj` · objective — «احمل الشهاب إلى رأس المرقاب» <sub>— Objective, step 1.</sub>
- `c5_signal.label.take` · label — «خذ الشهاب» <sub>— Context verb at ثامر's fire.</sub>
- `c5_signal.hint1` · hint — «الحطب مركوم على راس المرقاب… والظعن ينطر ضوّي.» <sub>— Hint 1 (45 s) — Dhari's voice.</sub>
- `c5_signal.hint2` · hint — «خذ شهابًا من نار ثامر واصعد به الكثيب الذي نزلتَ منه.» <sub>— Hint 2 (90 s).</sub>
- `c5_signal.light.obj` · objective — «أوقِد نار العلامة» <sub>— Objective, step 2 (at the signal pile).</sub>
- `c5_signal.label.light` · label — «أوقِد النار» <sub>— Context verb at the pile (hold 1.5 s).</sub>
- `c5_signal.prompt.light` · prompt — «اضغط مطوّلًا… كما سحبتَ الدلو يوم البئر» <sub>— Prompt at the pile — names the echo of c1_well.</sub>
- `c5_signal.light.hint1` · hint — «يوم البير سحبت طين… واليوم أسحب ضو.» <sub>— Hint 1 at the pile — Dhari's voice.</sub>
- `c5_signal.light.hint2` · hint — «قف عند كومة الحطب واضغط مطوّلًا على «أوقِد النار».» <sub>— Hint 2 at the pile.</sub>

◌ **bark `c5_signal.bark.1`** — **ضاري:** شبّت… شف الضو يا جدّي. هذا تشوفه.  
<sub>Bark as the pile catches (the الحيا music cue enters here). Light is the one thing the Sheikh still sees.</sub>

*CINEMATIC — cut to the halted caravan far out in the dark: a point of fire on the skyline.*

▣ **card `c5_far`** — «ومن وراء الكثبان رأى الظعنُ نارًا على رأس المرقاب… كأنّها علمٌ في رأسه نار.»  
<sub>Narration card over the far shot of the signal fire.</sub>

**`c5_signal.far`** — <sub>Auto-advancing dialogue inside the cinematic (camp under the acacia).</sub>

> **مسفر:** ضو! ضو على راس الطعس يا عم… ضاري وصل!  
> **الشيخ مانع:** أشوفه… أشوفه يا مسفر. نورٍ بوسط السواد.  
> **موضي:** الحمد لله… الحمد لله اللي ما خيّب رجانا.  
> **الشيخ مانع:** ثوّروا الركاب… الما قدّامنا.  

▣ **card `c5_dawn`** — «ومع الفجر نزل ربع مانع إلى الماء… فشرب الناس، وشربت الإبل، وبكى من بكى.»  
<sub>Narration card over the time-lapse to dawn and the descent of the caravan.</sub>

**`c5_signal.drink`** — <sub>Dialogue inside the cinematic, at the trough.</sub>

> **الشيخ ثامر:** حيّاكم الله… رِدوا. الحوض مليان.  
> **فهيد:** ما! يُمّه… ما كثير! اشرب يا حوار، اشرب!  
> **مسفر:** بسم الله… الحمد لله اللي بلّغنا.  
> **موضي:** اشرب يا وليدي، بالعافية… اليوم ما به قسمة.  

*The two old men, face to face after eight years. GAVE: جابر has already testified in the night.*

**`c5_signal.gave`** — <sub>Blocking, gaveWater = true: the reconciliation.</sub>

> **الشيخ ثامر:** مانع.  
> **الشيخ مانع:** ثامر… عرفتك من حِسّك. ما غيّرته السنين.  
> **الشيخ ثامر:** ولد ولدك سقى ولد أخوي من آخر ماه… وهو يدري من هو. من علّمه؟  
> **الشيخ مانع:** ما علّمته… حطّيت القربة بيده وسكتّ. والباقي منه.  
> **الشيخ ثامر:** حيّا لنا رقبة… والرقبة برقبة. طاح الحطب يا مانع.  
> **الشيخ مانع:** طاح الحطب يا ثامر… وولدي وأخوك، الله يرحمهم.  

*REFUSED: جابر's testimony about the Sheikh comes NOW, before anyone drinks deep — and the feud is laid down.*

**`c5_signal.refused`** — <sub>Blocking, gaveWater = false: جابر's testimony about the Sheikh.</sub>

> **جابر:** يا عم ثامر… قبل يشرب أحد، عندي شهادة.  
> **جابر:** ذلولي ماتت وطحت بظلّها… ومرّ بي ظعن مانع وما بقِرَبهم إلا القليل.  
> **جابر:** نزل هالشايب عن ذلوله وسقاني نصيبه كله… وهو يدري إني من ربع ثامر.  
> **جابر:** ومن عطشه طاح عقبها… وأنا حيّ بشربته.  
> **الشيخ ثامر:** مانع… سقيت ولد أخوي من نصيبك؟ وأخوي هو اللي…  
> **الشيخ مانع:** سقيت عطشان يا ثامر… والعطشان ما يُنشد: ولد من أنت.  

**`c5_signal.refused.sulh`** — <sub>Blocking, gaveWater = false, follows c5_signal.refused: the two old men reconcile.</sub>

> **الشيخ ثامر:** ولدك وأخوي راحوا بيوم واحد… ومن ثمان سنين وحنّا نعدّ الدم.  
> **الشيخ مانع:** عدّيناه لين شابت لحانا… والدم ما رجّع أحد.  
> **الشيخ ثامر:** حيّيت لنا رقبة يا مانع… والرقبة برقبة. طاح الحطب.  
> **الشيخ مانع:** طاح الحطب يا ثامر.  
> **الشيخ ثامر:** حلفت ما أسقي غريب… وأنتم من ذا اليوم ما بكم غريب.  

#### `c5_staff`

*Dawn at the well. Dhari draws the bucket — water this time. The Sheikh drinks and washes his face; he tells his people the truth and hands over the guide's staff. Thunder; the first drops — الحيا. The camera rises. Epilogue. EMOTIONAL PEAK; the last lines land the meaning of «الهيبة».*

- `c5_staff.obj` · objective — «اسقِ جدّك من ماء أم الحيا» <sub>— Objective (the same hold as c1_well — now it brings up water).</sub>
- `c5_staff.label.pull` · label — «اسحب الدلو» <sub>— Context verb at the well (hold 1.5 s).</sub>
- `c5_staff.hint1` · hint — «يوم سحبت الدلو لجدّي طلع طين… واليوم يطلع ما.» <sub>— Hint 1 (45 s) — Dhari's voice.</sub>
- `c5_staff.hint2` · hint — «اقترب من البئر واضغط مطوّلًا على «اسحب الدلو».» <sub>— Hint 2 (90 s).</sub>

*Mirror of c1_well.mud («طين يا جدّي…»). He washes his face and turns it to the sunrise.*

**`c5_staff.water`** — <sub>Blocking, after the bucket comes up full.</sub>

> **ضاري:** ما يا جدّي… ما صافي وبارد. اشرب.  
> **الراوي:** شرب الشيخ على مهل… ثم غسل وجهه بكفّيه، ورفعه نحو المشرق.  
> **الشيخ مانع:** أشوف نور… وما أشوف وجيه.  
> **الشيخ مانع:** بس أعرف وجهك يا ضاري.  

*The guide does not lie to his people: now that they are safe, he tells them. موضي knew. ثامر honours him.*

**`c5_staff.truth`** — <sub>Blocking, follows c5_staff.water.</sub>

> **الشيخ مانع:** يا ربعي… اسمعوني. من شتاين وأنا ما أشوف الدرب.  
> **الشيخ مانع:** اللي جابكم من البير اليابسة لهالعِدّ… ما هو أنا. عيون ضاري.  
> **مسفر:** يا عم…! وحنّا نمشي وراك ونقول: الشيخ يشوف اللي ما نشوف!  
> **موضي:** أنا أدري من زمان يا عمّي… اللي تصبّ قهوتك تعرف وين تمتدّ يدك.  
> **موضي:** وسكتّ… لأن اللي يمشي قدّامك ولدي.  
> **الشيخ ثامر:** العمى عمى القلب يا مانع… وأنت قلبك دلّ ربعك على الما.  

*THE STAFF. Slow. He holds it out with both hands; Dhari takes it on the last line.*

**`c5_staff.staff`** — <sub>Blocking, follows c5_staff.truth.</sub>

> **الراوي:** مدّ الشيخ مشعابه… عصا الدليلة التي لم تفارق يده أربعين سنة.  
> **الشيخ مانع:** هاك يا ضاري… هذي عصا الدليلة. شلتها عن أبوي، وكان ودّي يشيلها أبوك.  
> **ضاري:** يا جدّي… أنا ما سوّيت إلا اللي علّمتني.  
> **الشيخ مانع:** علّمتك الجرّة والنجم… والهيبة ما يعلّمها أحد لأحد. تبين بالرجّال يوم الضيق.  

*Echo of the ch2 sip (only for a giver): he "saw" it in him at الجال.*

**`c5_staff.ration.child`** — <sub>Blocking, ONLY when ration = child, between c5_staff.staff and c5_staff.haybah.</sub>

> **الشيخ مانع:** شفتها بك يوم الجال… يوم عطيت فهيد شربتك وأنت أعطش منه.  

**`c5_staff.ration.elder`** — <sub>Blocking, ONLY when ration = elder, between c5_staff.staff and c5_staff.haybah.</sub>

> **الشيخ مانع:** شفتها بك يوم الجال… يوم سقيتني شربتك وأنت قدّام الركاب.  

*The meaning of the title, in the Sheikh's words (DESIGN §2) — verbatim.*

**`c5_staff.haybah`** — <sub>Blocking, all branches: the definition of «الهيبة». Dhari takes the staff on the second line.</sub>

> **الشيخ مانع:** الهيبة ما هي بالصوت العالي ولا بالبارود…  
> **الشيخ مانع:** الهيبة إنك تثبت يوم يهتزّ غيرك، وتعطي يوم يمسك غيرك.  

**`c5_staff.gave`** — <sub>Blocking, gaveWater = true — the one differing line, right after c5_staff.haybah (closes the loop with c1_wake.greet).</sub>

> **الشيخ مانع:** وأنت ثبتّ… وعطيت. امش قدّامهم، وأنا وراك… أعرف حِسّ خطاك.  

**`c5_staff.refused`** — <sub>Blocking, gaveWater = false — the one differing line, right after c5_staff.haybah.</sub>

> **الشيخ مانع:** وأنت ثبتّ… والعطا عرفت ثمنه. امش قدّامهم، وأنا وراك… أعرف حِسّ خطاك.  

*Thunder from the south. The first drops pock the sand.*

**`c5_staff.rain`** — <sub>Blocking, after the staff changes hands (thunder SFX first).</sub>

> **الراوي:** دوّى الرعد من الجنوب… وسقطت على الرمل أولى القطرات.  
> **فهيد:** مطر! يُمّه… مطر!  
> **موضي:** اللهم صيّبًا نافعًا.  
> **الشيخ مانع:** الحيا… جا الحيا. مُطِرنا بفضل الله ورحمته.  

*THE LAST LINES OF THE GAME. In the first rain the child asks; the grandson answers with what he has become; the grandfather seals it with the title word. Then the camera rises.*

**`c5_staff.last`** — <sub>Blocking — the final dialogue of the game. The camera starts rising on the last line.</sub>

> **فهيد:** ضاري… عطني العصا أشيلها شوي!  
> **ضاري:** ثقيلة عليك يا ورع.  
> **فهيد:** ومن يشيلها أجل؟  
> **ضاري:** يشيلها اللي يثبت يوم يهتزّ غيره… ويعطي يوم يمسك غيره.  
> **الشيخ مانع:** إيه… هذي هي الهيبة.  

▣ **card `c5_rain`** — «الحيا» — «نزل الغيث على أم الحيا… وشرب ربع مانع وربع ثامر من حوضٍ واحد.»  
<sub>Narration card over the rising camera and the rain.</sub>

▣ **card `epilogue`** — «١٣١٧هـ» · «سنة ضاري» — «ومنذ تلك السنة صار اسمها عند العرب: سنة ضاري.»  
<sub>Epilogue card — the last card of the story, before c5_end.</sub>

#### `c5_end`

*Summary of choices, credits, «العب من جديد» / «الفصول». One line per flag; the motto restates the meaning of the title.*

- `c5_end.title` · ending summary — «سنة ضاري» <sub>— Ending screen title.</sub>
- `c5_end.motto` · ending summary — «الهيبة أن تثبت يوم يهتزّ غيرك… وأن تعطي يوم يُمسك غيرك.» <sub>— Ending screen motto under the title (the meaning of «الهيبة», in فصحى).</sub>
- `c5_end.sum.head` · ending summary — «ما اخترتَه في الطريق» <sub>— Heading of the choices summary.</sub>
- `c5_end.sum.ration.self` · ending summary — «في ظلّ الجال شربتَ نصيبك لتُبصر الطريق.» <sub>— Summary line, ration = self.</sub>
- `c5_end.sum.ration.child` · ending summary — «في ظلّ الجال سقيتَ فهيدًا نصيبك.» <sub>— Summary line, ration = child.</sub>
- `c5_end.sum.ration.elder` · ending summary — «في ظلّ الجال سقيتَ جدّك نصيبك.» <sub>— Summary line, ration = elder.</sub>
- `c5_end.sum.water.gave` · ending summary — «سقيتَ الغريب آخر مائك… فصار الماء عهدًا.» <sub>— Summary line, gaveWater = true.</sub>
- `c5_end.sum.water.refused` · ending summary — «مضيتَ عن الغريب… فسقاه الشيخ، وتعلّمتَ.» <sub>— Summary line, gaveWater = false.</sub>
- `c5_end.sum.wolf.named` · ending summary — «قرأتَ أثر الأمعط قبل أن تراه.» <sub>— Summary line, sawWolfPrint = true.</sub>
- `c5_end.sum.wolf.unnamed` · ending summary — «واجهتَ كبير الذئاب ولم تعرف اسمه.» <sub>— Summary line, sawWolfPrint = false.</sub>
- `c5_end.sum.rifle.left` · ending summary — «نزلتَ إلى البئر أعزل… دخيلًا لا غازيًا.» <sub>— Summary line, leftRifle = true.</sub>
- `c5_end.sum.rifle.kept` · ending summary — «نزلتَ إلى البئر وبندقك على كتفك.» <sub>— Summary line, leftRifle = false.</sub>
- `c5_end.sum.haybah.4` · ending summary — «الهيبة: تامّة… صدقٌ ونسبٌ ودخالة.» <sub>— Summary line, haybah = 4.</sub>
- `c5_end.sum.haybah.3` · ending summary — «الهيبة: راسخة… قلّ الكلام وصدق.» <sub>— Summary line, haybah = 3.</sub>
- `c5_end.sum.haybah.2` · ending summary — «الهيبة: ثابتة… وإن تعثّر اللسان.» <sub>— Summary line, haybah = 2.</sub>
- `c5_end.sum.haybah.1` · ending summary — «الهيبة: نجت بالثبات لا بالكلام.» <sub>— Summary line, haybah = 1.</sub>
- `c5_end.sum.haybah.0` · ending summary — «الهيبة: خذلها الكلام… وأنقذها الثبات.» <sub>— Summary line, haybah = 0.</sub>
- `c5_end.credits` · ending summary — «قصة أصلية… وكل الأسماء والأماكن فيها من نسج الخيال.» <sub>— Credits line / disclaimer on the ending screen.</sub>
- `c5_end.replay` · ending summary — «العب من جديد» <sub>— Ending screen button: new game.</sub>
- `c5_end.chapters` · ending summary — «الفصول» <sub>— Ending screen button: chapter select.</sub>

## 4. Design ambiguities resolved by the script

1. **The old blood is made concrete — in text only.** Eight years ago Dhari's father and ثامر's brother fell on the same day; جابر is that brother's son, ثامر's nephew («يا عم» is literal; «ولدنا» = our boy). Said three times and no more: مسفر in `c4_stranger.find`, ثامر in `c5_words.r2.q` and `c5_stare.toast.stage2`, and the two old men when they lay it down («طاح الحطب») in `c5_signal.gave` / `.refused.sulh`. No flag, level or model depends on it.
2. **The hail and the jeer.** The design's jeer «هذا ما هو ولد مانع» needs the riflemen to know whose he is, so Dhari hails as «عاني… من ربع مانع» during the walk (`c5_walk.bark.2`) and exchange 1 asks *which* of Mani's men he is.
3. **`leftRifle` may stay false.** Hanging the rifle is written as the objective, but both openings exist (`c5_words.open.unarmed` / `.armed`), plus a warning toast and a summary line, so the beat works whether the hold is mandatory or optional.
4. **The verdict.** The grant uses the idiomatic «رِدوا… الما ماكم» / «لكم وِرْد» (GLOSSARY §8). The oath is resolved honourably in both branches: by the bond of salt when Dhari gave («…ما عاد هو بغريب»), by كفّارة اليمين when he did not — and then by جابر's testimony at dawn. Coffee («صبّوا له القهوة») is the visible sign of safety and the first coffee of the game (no water was spent on it before the last well).
5. **`haybah` and the wording of the verdict.** DESIGN §6 lists "wording of the verdict" as an echo of the answers: `c5_verdict.words.high / .mid / .low` is that wording (one line before the gave / refused block); low haybah gets the "sterner words".
6. **The last lines.** The definition of «الهيبة» is spoken verbatim by the Sheikh as he hands over the staff (`c5_staff.haybah`), then the rain, then the final exchange: فهيد asks who can carry the staff, Dhari answers with the definition as his own, and the Sheikh's «إيه… هذي هي الهيبة» is the last spoken line. The ending screen repeats it as a motto (`c5_end.motto`).
7. **The Sheikh tells his people.** `c5_staff.truth` makes the blindness public once the camp is safe («الرايد ما يكذب أهله»); موضي reveals she knew. If the design prefers the secret kept, drop that one block — nothing else refers to it.
8. **Echo of the ch2 sip in ch5.** DESIGN §6 lists "the Sheikh's last line" as an echo of the sip: `c5_staff.ration.child / .elder` (one line, only for a giver) carries it, so `c5_staff.gave / .refused` stay a single differing line as specified.
9. **Who hands the giver his sip at dusk.** موضي, from her own untouched share (`c2_dusk.sip`): giving answered by giving, and it keeps the Sheikh's own water out of the arithmetic.
10. **The refuser and the last sip.** In `c4_collapse.refused` Dhari offers the kept sip to the Sheikh, who declines («اللي رايح يدوّر الما أحوج لها»), so the sip the design lets him drink during the search is not a loose end.
11. **Storm guidance strings** `c2_storm.lost1–3` are worded to serve both legs (out: فهيد's voice and his calf; back: the Sheikh's call, and the calf pulling toward its mother).
12. **Small additions that reuse existing verbs:** `c5_staff.obj` (Dhari draws the bucket for his grandfather — the ch1 hold, now bringing up water) and the narration cards `c3_lapse`, `c4_alone`, `c5_far`, `c5_dawn`, `c5_rain`. All optional.
13. **Timeline.** «ست ليال» to أم الحيا (said in ch1): ch2–ch3 are day and night three, ch4 is day six, ch5 the dawn after.

## 5. Wording quoted in DESIGN.md — kept or changed

| DESIGN.md | in the script | why |
|---|---|---|
| «الجرّة الجديدة حدّها قاطع…» | `c1_firasa.rule`, kept and completed | — |
| «أهدى من القطا» | `c1_well.bark.1`, echoed by Dhari in `c4_search.bark.1` | — |
| «نرحل الليلة… لعِدّ أم الحيا» | `c1_decision.rahil`, verbatim | — |
| «اللي يعطي وهو عطشان… هذا اللي يِنْتَبَع» | all three `c2_ration.*` blocks, verbatim (as a lesson, not a reproach, when he drank) | — |
| «برّكوا الركاب! العجاج!» | «عجاج! نوّخوا الركاب… العجاج!» | GLOSSARY §8: «نوِّخوا» is the more Najdi call |
| «ليا صفّر الهوا… اثبت وعطه كتفك!» | `c2_wall.bark.1`, verbatim | — |
| «اللي يرجع عشان واحد… يتبعونه الكل» | «اللي يرجع لاجل واحد… يتبعونه الكل» | §8: «لاجل» has the older colour |
| «أنت عيوني» | `c3_fire.eyes` | — |
| «ناظر مغيب الشمس وخذ يمينه…» | `c3_polaris.hint1` | — |
| «الجدي ما يتحرك… خلّه على كتفك تعرف دربك» | «…وهو بمكانه ما يتحرك» + «خلّه بين كتوفك، يصير وجهك للجنوب» | GLOSSARY §4: «خلّ الجدي بين كتوفك» = heading south |
| the white decoy star | named «المرزم» (Sirius); «المحلف» only alluded to («لا يحلّفك إنه سهيل») | classically المحلفان are other stars — naming Sirius so would be an error |
| «طلع سهيل… ومن تبع سهيل ما ضاع عن أم الحيا» | `c3_suhail.found`, over two lines; the star is called a «علامة», never a cause | GLOSSARY §4 ⚠ |
| «الماء يرجع… والوجه ما يرجع يا ضاري» | «الما يرجع… والوجه ما يرجع يا ضاري.» | §8: «الما» in speech; «مانا، ماه، ماك» throughout |
| [اسقِه من ماينا] / [امضِ — ماينا ما يكفي عيالنا] | «اسقِه من مائنا» / «امضِ… ماؤنا لا يكفي عيالنا» | choice options that are actions are UI text → فصحى (the ch5 options are Dhari's spoken answers → dialect) |
| «رح لحالك. القطا يرد الماء مع المغيب… اتبع القطا» | `c4_collapse.send`, with «الما» | — |
| «قف! من أنت؟» | «عندك! من الرجّال؟» | §8 |
| «هذا ما هو ولد مانع» | `c5_walk.fail` | — |
| «هذا اللي سقاني من آخر ماه يا عم!» | `c5_verdict.gave`, verbatim | — |
| «اللي يسقي ولدنا من آخر مايه ما يُرد عن مانا» | «اللي يسقي ولدنا من آخر ماه… ما يُرَدّ عن مانا. رِدوا، الما ماكم.» | spelling unified; the grant added |
| «فيك من مانع… وِرْد» | «فيك من مانع.» … «لكم وِرْد… رِدوا واسقوا حلالكم.» | §8: «وِرد» is a noun; the idiomatic grant is «رِدوا» / «لكم وِرد» |
| «أشوف نور… وما أشوف وجيه. بس أعرف وجهك يا ضاري» | `c5_staff.water`, verbatim (two lines) | — |
| the definition of «الهيبة» (DESIGN §2) | `c5_staff.haybah`, verbatim | — |
| «ومن ذيك السنة صار اسمها عند العرب: سنة ضاري» | card `epilogue`: «ومنذ تلك السنة صار اسمها عند العرب: سنة ضاري.» | cards are فصحى |
| a ghada twig / bush | «غضا» kept | it is the design's prop and grows in the north-east of the Sands (GLOSSARY §4) |
