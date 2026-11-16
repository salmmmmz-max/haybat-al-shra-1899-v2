/**
 * UI harness.  ?m=ui&view=title|hud|dialogue|choices|card|pause|settings|chapters|ending|loading|steady|gust|touch|all
 * Each view fakes the state it needs (objective, marks, steady request, …) so it can be screenshotted.
 * view=touch drives real PointerEvents through the touch layer and reports what reached G.input in `api.touch`.
 */
import { bearingDeg } from '../src/core/math.js';

export const assets = [];

const fake = (obj, prop, get) => Object.defineProperty(obj, prop, { get, configurable: true, enumerable: true });

export async function run(G, p) {
  const view = p.view || 'hud', U = G.ui, S = G.sys, api = { view };
  const cam = G.actors.cam, pl = G.actors.player;
  if (cam && cam.follow) { cam.follow(pl); if (cam.snap) cam.snap(); }
  const base = () => (cam ? bearingDeg(cam.yaw) : 0);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.tick(1 / 60); };
  step(30);
  const clickIn = (sel, i) => { const b = document.querySelectorAll(sel)[i]; if (b) b.click(); };

  function fakeHud() {
    U.hud.show({ eye: true, water: true, strip: true });
    const b0 = base(), obj = { key: 'obj', text: 'اتبع أثر الإبل نحو الكثيب الشرقي' };
    fake(S.objectives, 'current', () => obj);
    fake(S.objectives, 'hint', () => ({ key: 'h', text: 'انظر إلى الرمل جيدًا… الأثر يلمع عند الفجر.', level: 1 }));
    const marks = [
      { id: 'goal', icon: 'goal', bearing: (b0 + 24) % 360, dist: 420 }, { id: 's', icon: 'suhail', bearing: (b0 + 300) % 360, dist: null },
      { id: 'c', icon: 'camp', bearing: (b0 + 70) % 360, dist: 1380 }, { id: 'v', icon: 'voice', bearing: (b0 + 195) % 360, dist: 90 },
      { id: 'sun', icon: 'sun', bearing: (b0 + 345) % 360, dist: null },
    ];
    fake(S.objectives, 'marks', () => marks);
    const verb = { kind: 'use', labelKey: 'verb.talk', at: null, progress: 0 };
    fake(S.interact, 'verb', () => verb);
    verb.at = { get x() { return pl.pos.x + Math.sin(cam.yaw) * 5 + 1.5; }, y: 1.4, get z() { return pl.pos.z + Math.cos(cam.yaw) * 5; } };
    fake(S.survival, 'thirst', () => 46); fake(S.survival, 'sips', () => 3); fake(S.survival, 'drinkProgress', () => 0.35);
    fake(S.firasa, 'amount', () => 0.4); fake(S.firasa, 'active', () => true);
    U.hud.toast({ who: 'dhari', name: 'ضاري', text: 'الرمل هنا يحمل وجهة الريح… تمهّل.' }, 99);
    U.hud.toast({ who: 'mani', name: 'مانع', text: 'اثبت يا ولد، لا تتعجل.' }, 99);
    U.hud.prompt('prompt.hold');
    U.hud.ripple(() => b0 + 80, { arrow: false });
    U.hud.glint(b0 + 130);
    return verb;
  }
  function fakeSteady() {
    const req = { kind: 'hold', target: () => ({ x: pl.pos.x + Math.sin(cam.yaw) * 9 + Math.sin(G.time.now * 1.3) * 2, y: G.world.terrain.heightAt(pl.pos.x, pl.pos.z) + 1.3, z: pl.pos.z + Math.cos(cam.yaw) * 9 }), labelKey: 'verb.steady', seconds: 3 };
    fake(S.steady, 'activeRequest', () => req); fake(S.steady, 'progress', () => (G.time.now * 0.25) % 1); fake(S.steady, 'tension', () => 0.8);
    const verb = { kind: 'steady', labelKey: 'verb.steady', at: null, progress: 0 }; fake(S.interact, 'verb', () => verb);
  }
  const CHOICES = [{ label: 'أُشاركهم الماء' }, { label: 'أحتفظ بنصيبي' }, { label: 'أمضي وحدي في الليل', confirm: true }];

  switch (view) {
    case 'title': G.setMode('title'); U.menus.showTitle(); break;
    case 'hud': fakeHud(); break;
    case 'dialogue': G.setMode('dialogue'); U.dialogue.show({ who: 'dhari', name: 'ضاري', text: 'يا مانع، الأثر يقطع الكثيب إلى الشرق… والريح تدفنه قبل الظهر، فإن تأخّرنا ضاع منّا.' }); U.dialogue.finishTyping(); break;
    case 'choices': G.setMode('dialogue'); U.dialogue.choices('ماذا يفعل ضاري بآخر قطرات الماء؟', CHOICES); break;
    case 'card': G.setMode('cine'); U.cards.letterbox(true); U.cards.show({ num: 'الفصل الأول', title: 'الأثر', sub: 'الرمل لا ينسى من مرّ به.' }); break;
    case 'pause': U.menus.showPause(true); break;
    case 'settings': U.menus.showPause(true); clickIn('.menu[data-id=pause] .opt', 2); break;
    case 'chapters': G.setMode('title'); G.save.data.unlocked = 3; U.menus.showTitle(); clickIn('.menu[data-id=title] .opt', 1 + (G.save.hasProgress ? 1 : 0)); break;
    case 'ending': G.setMode('end'); U.menus.showEnding({ flags: { ration: 'self' }, stats: { playSeconds: 1620, retries: 3 } }); break;
    case 'loading': U.loading.show(true); U.loading.set(0.62); break;
    case 'steady': fakeHud(); fakeSteady(); break;
    case 'gust': fakeHud(); G.events.emit('weather:gustWarn', { in: 3, dir: { x: -Math.cos(cam.yaw), z: Math.sin(cam.yaw) } }); break;
    case 'all': fakeHud(); fakeSteady(); break;
    case 'touch': {
      U.hud.show({ eye: true, water: true, strip: true }); fakeHud();
      const pad = document.querySelector('.touch .pad'), st = G.stage, res = {};
      const toClient = (x, y) => (st.rotated ? { clientX: st.h - y, clientY: x } : { clientX: x, clientY: y });
      const ev = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', bubbles: true, cancelable: true, ...toClient(x, y) }));
      step(2);
      ev(pad, 'pointerdown', 1, 150, st.h - 100); ev(pad, 'pointermove', 1, 190, st.h - 140); step(1);
      res.stickUpRight = { x: +G.input.move.x.toFixed(2), y: +G.input.move.y.toFixed(2), run: G.input.held('run') };
      ev(pad, 'pointermove', 1, 270, st.h - 100); step(1); res.stickFarRight = { x: +G.input.move.x.toFixed(2), y: +G.input.move.y.toFixed(2), run: G.input.held('run') };
      ev(pad, 'pointerdown', 2, st.w * 0.7, 150); ev(pad, 'pointermove', 2, st.w * 0.7 + 100, 150); step(1);
      res.lookDx100px = { x: +G.input.look.x.toFixed(3), expected: +(100 * Math.PI / st.w).toFixed(3) };
      ev(pad, 'pointerup', 1, 270, st.h - 100); ev(pad, 'pointerup', 2, 0, 0); step(1);
      res.afterRelease = { x: G.input.move.x, y: G.input.move.y, run: G.input.held('run') };
      const bn = c => document.querySelector('.tb.' + c);
      ev(bn('ctx'), 'pointerdown', 3, st.w - 66, st.h - 66); step(1); res.ctxHeld = G.input.held('interact'); ev(bn('ctx'), 'pointerup', 3, st.w - 66, st.h - 66); step(1); res.ctxAfter = G.input.held('interact');
      ev(bn('eye'), 'pointerdown', 4, 0, 0); step(1); res.eyeHeld = G.input.held('firasa'); ev(bn('eye'), 'pointerup', 4, 0, 0);
      ev(bn('skin'), 'pointerdown', 5, 0, 0); step(1); res.drinkHeld = G.input.held('drink'); ev(bn('skin'), 'pointerup', 5, 0, 0);
      ev(bn('ctx'), 'pointerdown', 6, st.w - 66, st.h - 66); ev(bn('ctx'), 'pointermove', 6, st.w - 66 - 30, st.h - 66); ev(bn('ctx'), 'pointermove', 6, st.w - 66 - 60, st.h - 66); step(1);
      res.ctxDragLook = { held: G.input.held('interact'), lookX: +G.input.look.x.toFixed(4), expected: +(30 * Math.PI / st.w * 0.6).toFixed(4) }; ev(bn('ctx'), 'pointerup', 6, 0, 0);
      ev(bn('pause'), 'pointerdown', 7, 0, 0); step(1); res.pausePressed = G.input.pressed('pause');
      // restore menus (the pause press opened the pause menu through ui.update)
      U.menus.showPause(false); res.stage = { w: st.w, h: st.h, rotated: st.rotated };
      console.log('TOUCH ' + JSON.stringify(res)); api.touch = res; break;
    }
    default: throw new Error('unknown view ' + view);
  }
  api.step = step;
  return api;
}
