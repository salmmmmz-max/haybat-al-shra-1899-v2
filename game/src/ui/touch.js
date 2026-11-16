/** Touch controls: floating stick (left 45 %), look drag, context / eye / waterskin / pause buttons. Writes only to G.input. */
import { clamp } from '../core/math.js';
import { h, icon, flag, texter, numAttr, ring, pop } from './dom.js';
import { ICONS } from './art.js';

const R = 56, DEAD = 0.12, RUN = 0.9;
const _pt = { x: 0, y: 0 };

export function createTouch(G, root, ctx) {
  const { t, vis } = ctx;
  const el = h('div', 'touch off', root);
  const pad = h('div', 'pad', el);
  const stick = h('div', 'stick hint', el), knob = h('i', '', stick);
  const lookX = () => Math.PI / G.stage.w, lookY = () => Math.PI / 1.5 / G.stage.h;

  let moveId = null, lookId = null, ox = 0, oy = 0, lx = 0, ly = 0, run = false, used = false;
  const stOn = flag(stick, 'on'), stRun = flag(stick, 'run'), stHint = flag(stick, 'hint', true);
  function placeStick(x, y) { stick.style.transform = `translate3d(${x}px,${y}px,0)`; }
  placeStick(Math.max(110, G.stage.w * 0.14), G.stage.h - 110);
  G.events.on('resize', () => { if (moveId === null) placeStick(Math.max(110, G.stage.w * 0.14), G.stage.h - 110); });

  pad.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const p = G.stage.toLocal(e.clientX, e.clientY, _pt);
    if (p.x < G.stage.w * 0.45 && moveId === null) {
      moveId = e.pointerId; ox = p.x; oy = p.y; placeStick(ox, oy); knob.style.transform = ''; stOn(true); stHint(false); used = true;
    } else if (lookId === null) { lookId = e.pointerId; lx = p.x; ly = p.y; }
  });
  pad.addEventListener('pointermove', e => {
    if (e.pointerId !== moveId && e.pointerId !== lookId) return;
    const p = G.stage.toLocal(e.clientX, e.clientY, _pt);
    if (e.pointerId === moveId) {
      let dx = p.x - ox, dy = p.y - oy; const d = Math.hypot(dx, dy) || 1e-6, mag = Math.min(1, d / R);
      const k = Math.min(1, R / d); knob.style.transform = `translate(${(dx * k).toFixed(1)}px,${(dy * k).toFixed(1)}px)`;
      const eff = mag < DEAD ? 0 : (mag - DEAD) / (1 - DEAD);
      G.input.setMove((dx / d) * eff, -(dy / d) * eff, 'ui');
      const r = mag > RUN; stRun(r); if (r !== run) { run = r; G.input.setHeld('run', r, 'ui'); }
    } else {
      G.input.addLook((p.x - lx) * lookX(), -(p.y - ly) * lookY()); lx = p.x; ly = p.y;
    }
  });
  const end = e => {
    if (e.pointerId === moveId) endMove();
    if (e.pointerId === lookId) lookId = null;
  };
  function endMove() {
    moveId = null; stOn(false); stRun(false); stHint(!used); G.input.setMove(0, 0, 'ui');
    if (run) { run = false; G.input.setHeld('run', false, 'ui'); }
  }
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);

  /** hold button: keeps the action down while pressed; after 12 px of drag also steers the camera at 0.6x */
  function holdBtn(b, down, up) {
    let id = null, sx = 0, sy = 0, px = 0, py = 0, moved = false;
    b.addEventListener('pointerdown', e => {
      if (id !== null) return;
      e.preventDefault(); e.stopPropagation(); id = e.pointerId; moved = false;
      try { b.setPointerCapture(id); } catch { /* synthetic */ }
      const p = G.stage.toLocal(e.clientX, e.clientY, _pt); sx = px = p.x; sy = py = p.y;
      b.classList.add('down'); down(); ctx.vib(8);
    });
    b.addEventListener('pointermove', e => {
      if (e.pointerId !== id || e.pointerType === 'mouse') return;
      const p = G.stage.toLocal(e.clientX, e.clientY, _pt);
      if (!moved) { if (Math.hypot(p.x - sx, p.y - sy) < 12) return; moved = true; px = p.x; py = p.y; }
      G.input.addLook((p.x - px) * lookX() * 0.6, -(p.y - py) * lookY() * 0.6); px = p.x; py = p.y;
    });
    const rel = e => { if (e.pointerId !== id) return; id = null; b.classList.remove('down'); up(); };
    b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('lostpointercapture', rel);
    b.addEventListener('contextmenu', e => e.preventDefault());
    return () => { if (id !== null) { id = null; b.classList.remove('down'); up(); } };
  }
  const kh = (b, s) => h('span', 'kh', b, s);

  // context button
  const ctxB = h('button', 'tb ctx none', el);
  const ctxRing = ring(ctxB, '', 40, 4), ctxL = h('span', 'l', ctxB), ctxTx = texter(ctxL), ctxNone = flag(ctxB, 'none', true); kh(ctxB, 'E');
  const ctxRel = holdBtn(ctxB, () => G.input.setHeld('interact', true, 'ui'), () => G.input.setHeld('interact', false, 'ui'));
  // eye
  const eyeB = h('button', 'tb eye hidden', el); icon(ICONS.eye, '', eyeB); kh(eyeB, 'F');
  const eyeShow = flag(eyeB, 'hidden', true), eyeOn = flag(eyeB, 'on');
  const eyeRel = holdBtn(eyeB, () => G.input.setHeld('firasa', true, 'ui'), () => G.input.setHeld('firasa', false, 'ui'));
  // waterskin
  const skB = h('button', 'tb skin hidden', el); icon(ICONS.skin, '', skB); kh(skB, 'R');
  const skRing = ring(skB, '', 24, 3), skShow = flag(skB, 'hidden', true), skLow = flag(skB, 'low');
  const lvl = skB.querySelector('.lvl'), setLvl = numAttr(lvl, 'y', 4);
  const skRel = holdBtn(skB, () => G.input.setHeld('drink', true, 'ui'), () => G.input.setHeld('drink', false, 'ui'));
  G.events.on('survival:level', () => { pop(skB, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], 520); ctx.vib(20); });
  // pause: lives in the UI root (not in the touch layer) so it stays above the dialogue tap layer, cards and the cinematic fade
  const pauseB = h('button', 'tb pause hidden', root); icon(ICONS.pause, '', pauseB); kh(pauseB, 'Esc'); pauseB.setAttribute('aria-label', t('ui.paused'));
  let pauseDown = false;
  pauseB.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (e.pointerType === 'mouse' && e.button !== 0) return; pauseDown = true; G.input.tap('pause'); });
  pauseB.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (pauseDown) { pauseDown = false; return; } G.input.tap('pause'); });   // VoiceOver / TalkBack / switch access
  pauseB.addEventListener('keydown', e => { if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) G.input.tap('pause'); } });
  const pauseShow = flag(pauseB, 'hidden', true);
  let ctxLabel = null;

  const touch = {
    el, active: false,
    reset() {
      if (moveId !== null) endMove(); lookId = null; ctxRel(); eyeRel(); skRel();
    },
    update() {
      const m = G.state.mode;
      pauseShow(!((m === 'play' || m === 'dialogue' || m === 'cine') && !ctx.menuOpen()));
      const act = G.state.mode === 'play' && G.time.scale !== 0 && !ctx.menuOpen();
      if (act !== touch.active) { touch.active = act; el.classList.toggle('off', !act); if (!act) touch.reset(); }
      if (!act) return;
      const S = G.sys, v = S.interact && S.interact.verb, req = S.steady && S.steady.activeRequest;
      let label = '', prog = 0;
      if (v && v.kind) { label = t(v.labelKey); prog = v.progress || 0; }
      else if (req && req.labelKey) { label = t(req.labelKey); prog = S.steady.progress || 0; }
      ctxNone(!label); ctxTx(label); ctxRing.set(prog);
      if (label !== ctxLabel) { ctxLabel = label; if (label) ctxB.setAttribute('aria-label', label); else ctxB.removeAttribute('aria-label'); }
      eyeShow(!(vis.eye && (!S.firasa || S.firasa.allowed !== false))); eyeOn(S.firasa && S.firasa.active);
      skShow(!vis.water);
      if (vis.water && S.survival) {
        const th = S.survival.thirst; setLvl(28 - clamp(th, 0, 100) / 100 * 20); skLow(th < 30);
        skRing.set(S.survival.drinkProgress || 0); skB.style.opacity = S.survival.sips > 0 ? '' : '0.6';
      }
    },
  };
  return touch;
}
