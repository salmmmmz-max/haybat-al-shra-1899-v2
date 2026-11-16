# Assets plan & pipeline notes (هيبة الصحراء 1899)

## Credit costs (preflighted 2026-11-15)
- image 1k (nano_banana_2 / gpt_image_2_6): 1.5 cr
- image_to_3d textured+rig+1 clip: ~38 cr (doc) ; meshy_v7_image_to_3d same: 47.5 cr
- extra animation clip on a rigged GLB (model `3d_rigging`, enable_animation): 8 cr
- music 40s (sonilo_music): 2.5 cr ; SFX 3s (mirelo_text_to_audio): 0.75 cr ; TTS line (inworld_text_to_speech, voice "Omar (ar)"): 2 cr

## STYLE FORMULA (byte-identical in EVERY visual prompt — never paraphrase)
stylized painterly realism in the manner of a hand-painted adventure game model, matte brushed textures with soft gradients and no photographic noise, clean strong silhouettes with simplified natural proportions and broad flowing cloth folds, environment in warm golden-amber sand and pale dusty blue sky, people in sun-bleached off-white cotton and dark coffee-brown wool with deep indigo and madder-red woven accents that stand out against the sand, evenly lit with soft warm desert light and no harsh shadows, calm dignified epic mood, high contrast, clean readable shapes

## STYLE TOKEN (≤120 chars, for texture_prompt)
painterly hand-painted matte textures, warm sand and off-white cotton palette, indigo and madder-red accents

## Meshy animation library — chosen clip ids
| use | id | name |
|---|---|---|
| idle | 0 | Idle |
| walk (in place) | 613 | Casual_Walk_inplace |
| confident walk (in place) | 621 | Confident_Strut_inplace |
| elderly walk (in place) | 626 | Elderly_Shaky_Walk_inplace |
| injured walk (in place) | 637 | Injured_Walk_inplace |
| limping walk (in place) | 645 | Limping_Walk_inplace |
| woman walk | 1 | Walking_Woman (root motion → strip in code) |
| thoughtful walk | 121 | Thoughtful_Walk (root motion) |
| run (in place) candidates | 658..665, 657 | run_fast_N_inplace |
| sprint (in place) | 644 | Lean_Forward_Sprint_inplace |
| sit (riding / by fire) | 33 (M), 32 (F) | Chair_Sit_Idle |
| sit & drink | 343 | Sit_and_Drink |
| stand & drink | 342 | Stand_and_Drink |
| kneel + stand (inspect tracks) | 365 | Kneel_on_One_Knee_and_Stand |
| bend pick up | 276 | Male_Bend_Over_Pick_Up |
| torch hold / look | 337 | Torch_Look_Around |
| one-hand swing | 4 / 97 | Attack / Left_Slash |
| alert | 2 | Alert |
| look around (breathing) | 336 / 338 | Long/Short_Breathe_and_Look_Around |
| call gesture | 29 | Call_Gesture |
| catching breath | 31 | Catching_Breath |
| talk | 56 / 313 / 310 / 308 | Stand_and_Chat / Talk_with_Hands_Open / Talk_with_Left_Hand_Raised / Talk_Passionately |
| agree / listen | 25 / 47 | Agree_Gesture / Listening_Gesture |
| wave for help | 291 | Wave_for_Help |
| rifle: aim turn / side shot / hand on gun | 585 / 104 / 292 | Rifle_Aim_Turn_Right / Side_Shot / Gesture_with_Hand_on_Gun |
| lying (collapsed) | 266 / 267 | Lie_Down_Hands_Spread / Sleep_Normally |
| sit dozing | 268 | Sit_and_Doze_Off |
| head hold in pain | 391 | Head_Hold_in_Pain |
| unsteady / stumble walk | 123 / 562 | Unsteady_Walk / Stumble_Walk |

Notes: clips without `_inplace` carry root motion → the engine strips Hips X/Z translation at load.
Preview GIFs: https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/<Name>.gif (reachable from the remote sandbox only).

## 3D pipeline rules (from Higgsfield skill)
- Concept image: ONE figure, full body, plain white background, no shadow/ground, limbs separated, A-pose for characters.
- image→3D params: should_texture:true, enable_pbr:false, should_remesh:true, topology:'triangle', target_polycount (hero 15–30k, NPC 5–15k, prop 1–5k), pose_mode:'a-pose', enable_rigging/animation for humanoids.
- One GLB per animation clip → merge in sandbox: `python3 $HF_WORKFLOWS/website-builder-flow/scripts/glb_merge_anims.py rigged.glb walk.glb:Walk idle.glb:Idle out.glb` (fixes root scale + OPAQUE).
- Inspect: `python3 $HF_WORKFLOWS/website-builder-flow/scripts/glb_inspect.py file.glb`.
- Auto-rig is humanoid-only → camel & wolf: static mesh + procedural rig in engine code.
