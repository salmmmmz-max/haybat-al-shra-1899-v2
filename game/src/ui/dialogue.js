/** Dialogue panel with typewriter, and the choices overlay (0.7 s input lock; `confirm` options need a 0.5 s hold). */
import { h, icon, flag, ring, onPress } from './dom.js';
import { ICONS, SPEAKER } from './art.js';

export function createDialogue(G, root, ctx) {
  const tap = h('div', 'dlg-tap hidden', root);
  const el = h('div', 'dlg hidden', root), name = h('div', 'name', el), text = h('div', 'text', el);
  const tA = h('span', 'a', text), tB = h('span', 'b', text); icon(ICONS.next, 'next', el);
  const on = flag(el, 'on'), done = flag(el, 'done');
  let full = '', shown = 0, vis = false, hideT = 0;
  const speed = () => (G.state.fastText ? 1e5 : 55);
  const skip = e => { e.preventDefault(); e.stopPropagation(); G.input.tap('skip'); };
  tap.addEventListener('pointerdown', skip); el.addEventListener('pointerdown', skip);

  const box = h('div', 'choices hidden', root);
  let opts = [], lockT = 0, holdIdx = -1, holdT = 0, chosen = false, boxOn = false;
  // a choice is made by the player's hand on the open screen: never while paused or while a menu covers it
  const blocked = () => G.time.scale === 0 || ctx.menuOpen();
  function choose(i) { if (chosen || blocked()) return; chosen = true; ctx.vib(18); G.events.emit('ui:choice', { index: i }); }
  function cancelHold() { if (holdIdx >= 0) { opts[holdIdx].el.style.setProperty('--p', 0); holdIdx = -1; } }
  const holdTime = () => (G.state.fastText ? 0.05 : 0.5);

  const dialogue = {
    get typing() { return shown < full.length; },
    show({ who, name: nm, text: tx }) {
      full = tx || ''; shown = 0; tA._n = -1; el.classList.toggle('short', full.length <= 85); name.textContent = nm || ''; el.style.setProperty('--plate', SPEAKER[who] || '#5b3a22');
      tA.textContent = ''; tB.textContent = full; done(false);
      if (G.state.fastText) dialogue.finishTyping();
      vis = true; hideT = 0; el.classList.remove('hidden'); tap.classList.toggle('hidden', boxOn); void el.offsetWidth; on(true);
    },
    hide() { vis = false; on(false); tap.classList.add('hidden'); hideT = 0.25; },
    finishTyping() { shown = full.length; tA.textContent = full; tB.textContent = ''; done(true); },
    choices(prompt, options) {
      box.textContent = ''; opts = []; chosen = false; holdIdx = -1; boxOn = true; tap.classList.add('hidden');
      if (prompt) h('div', 'prompt', box, prompt);
      options.forEach((o, i) => {
        const b = h('button', 'opt lock' + (o.confirm ? ' confirm' : ''), box); h('i', 'fill', b); h('span', 'lbl', b, o.label);
        const rec = { el: b, confirm: !!o.confirm };
        if (o.confirm) {
          b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (lockT > 0 || chosen) return; holdIdx = i; holdT = 0; try { b.setPointerCapture(e.pointerId); } catch { /* */ } });
          const rel = () => { if (holdIdx === i) cancelHold(); };
          b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('lostpointercapture', rel);
          b.addEventListener('keydown', e => { if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat && lockT <= 0 && !chosen) { e.preventDefault(); e.stopPropagation(); holdIdx = i; holdT = 0; } });
          b.addEventListener('keyup', e => { if (holdIdx === i) cancelHold(); });
        } else onPress(b, () => { if (lockT <= 0) choose(i); });
        opts.push(rec);
      });
      lockT = G.state.fastText ? 0.05 : 0.7;
      box.classList.remove('hidden');
    },
    hideChoices() { box.classList.add('hidden'); boxOn = false; cancelHold(); if (vis) tap.classList.remove('hidden'); },
    get choosing() { return boxOn; },
    update(dt) {
      if (shown < full.length) {
        shown = Math.min(full.length, shown + dt * speed()); const n = Math.floor(shown);
        if (n !== tA._n) { tA._n = n; tA.textContent = full.slice(0, n); tB.textContent = full.slice(n); }
        if (shown >= full.length) done(true);
      }
      if (hideT > 0) { hideT -= dt; if (hideT <= 0 && !vis) el.classList.add('hidden'); }
      if (lockT > 0) { lockT -= dt; if (lockT <= 0) for (const o of opts) o.el.classList.remove('lock'); }
      if (holdIdx >= 0 && blocked()) cancelHold();               // pause / a menu interrupts a hold: it restarts from zero on the next press
      if (holdIdx >= 0) {
        holdT += dt; const p = Math.min(1, holdT / holdTime()); opts[holdIdx].el.style.setProperty('--p', p.toFixed(2));
        if (p >= 1) { const i = holdIdx; holdIdx = -1; choose(i); }
      }
    },
  };
  dialogue.el = el;
  return dialogue;
}
