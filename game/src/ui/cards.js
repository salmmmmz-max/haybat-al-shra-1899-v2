/** Full-screen fade, chapter / narration cards, cinematic letterbox, and the loading screen. */
import { h, flag, texter, onPress } from './dom.js';
import { WISDOM } from './strings.ui.ar.js';

export function createCards(G, root) {
  const fade = h('div', 'fade', root);
  const lbT = h('div', 'lb top', root), lbB = h('div', 'lb bot', root);
  const card = h('div', 'card hidden', root);
  const num = h('div', 'num', card); h('div', 'sadu', card); const title = h('div', 'title', card), sub = h('div', 'sub', card); h('div', 'sadu', card);
  // touch has no skip key: while a card or a cinematic is up, a tap anywhere (under the HUD) is the 'skip' action
  const skipTap = h('div', 'skip-tap', root); skipTap.style.cssText = 'position:absolute;inset:0;z-index:3;pointer-events:none';
  skipTap.addEventListener('pointerdown', e => { e.preventDefault(); G.input.tap('skip'); });
  let cardUp = false, lbUp = false; const syncTap = () => { skipTap.style.pointerEvents = cardUp || lbUp ? 'auto' : 'none'; };
  let hideT = 0, lastFade = -1;
  const cardOn = flag(card, 'on');
  const cards = {
    setFade(a) {
      if (a === lastFade) return; lastFade = a;
      if (a <= 0.001) { fade.style.display = 'none'; return; }
      fade.style.display = 'block'; fade.style.opacity = a >= 0.999 ? '1' : a.toFixed(3);
    },
    show(c) {
      num.textContent = c.num || ''; title.textContent = c.title || ''; sub.textContent = c.sub || '';
      card.classList.toggle('hidden', false); hideT = 0; void card.offsetWidth; cardOn(true); cardUp = true; syncTap();
    },
    hide() { cardOn(false); hideT = 0.5; cardUp = false; syncTap(); },
    letterbox(b) { lbT.classList.toggle('on', !!b); lbB.classList.toggle('on', !!b); lbUp = !!b; syncTap(); },
    update(dt) { if (hideT > 0) { hideT -= dt; if (hideT <= 0) card.classList.add('hidden'); } },
  };
  cards.setFade(0);
  return cards;
}

export function createLoading(G, root) {
  // the page may ship its own boot splash — this view replaces it
  const old = document.getElementById('hs-loading'); if (old) { old.classList.add('hidden'); old.style.display = 'none'; }
  const el = h('div', 'loading hidden', root);
  h('div', 'ttl', el, G.t('ui.title')); const wis = h('div', 'wis', el); const bar = h('div', 'bar', el), fill = h('i', '', bar);
  const setWis = texter(wis);
  // a load problem (required models missing): a short message with «retry» / «go on» instead of a bar that claims to be full
  const prob = h('div', 'prob hidden', el); prob.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;max-width:30em';
  const probTx = h('div', 'wis', prob); probTx.style.minHeight = '0';
  const probBtns = h('div', 'btns', prob); probBtns.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center';
  let probCb = null;
  let target = 0, cur = 0, k = 0;
  const loading = {
    show(b) {
      if (b) { k = Math.floor(G.vrng.next() * WISDOM.length); setWis(WISDOM[k % WISDOM.length]); target = cur = 0; fill.style.transform = 'scaleX(0)'; }
      if (!b) loading.problem(null);
      el.classList.toggle('hidden', !b);
    },
    /** problem(text, {retry, skip}, cb) → cb(true) on retry, cb(false) on go-on; problem(null) clears it */
    problem(text, labels, cb) {
      probBtns.textContent = ''; probCb = null;
      if (!text) { prob.classList.add('hidden'); bar.classList.remove('hidden'); wis.classList.remove('hidden'); return; }
      probCb = cb; probTx.textContent = text;
      const done = v => { const f = probCb; probCb = null; prob.classList.add('hidden'); bar.classList.remove('hidden'); wis.classList.remove('hidden'); if (f) f(v); };
      onPress(h('button', 'opt primary', probBtns, labels.retry), () => done(true));
      onPress(h('button', 'opt', probBtns, labels.skip), () => done(false));
      bar.classList.add('hidden'); wis.classList.add('hidden'); prob.classList.remove('hidden');
    },
    set(p) { target = Math.max(target, Math.min(1, p)); },
    update(dt) {
      if (el.classList.contains('hidden')) return;
      cur += (target - cur) * Math.min(1, dt * 8); if (target - cur < 0.002) cur = target;
      fill.style.transform = `scaleX(${Math.max(0.02, cur).toFixed(3)})`;
    },
  };
  return loading;
}
