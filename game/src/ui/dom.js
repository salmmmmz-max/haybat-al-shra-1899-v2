/**
 * Tiny DOM helpers for the UI views. Everything that is written every frame goes through a cached setter
 * (`flag`, `mover`, `fader`, `texter`, `attr`) so the DOM is touched only when a value really changes.
 */

/** create an element */
export function h(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** an inline-SVG icon wrapper (`<span class="ic …">`) */
export function icon(markup, cls, parent) {
  const e = h('span', cls ? 'ic ' + cls : 'ic', parent);
  e.innerHTML = markup;
  e.setAttribute('aria-hidden', 'true');
  return e;
}

/** cached class toggle → set(on) */
export function flag(el, cls, init = false) {
  let cur = !!init;
  if (cur) el.classList.add(cls);
  return on => { on = !!on; if (on !== cur) { cur = on; el.classList.toggle(cls, on); } return on; };
}

/** cached translate → set(x, y) (half-pixel steps) */
export function mover(el) {
  let lx = NaN, ly = NaN;
  return (x, y) => {
    x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2;
    if (x !== lx || y !== ly) { lx = x; ly = y; el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; }
  };
}

/** cached opacity → set(0..1) (2 % steps) */
export function fader(el) {
  let lo = NaN;
  return o => { o = Math.round(o * 50) / 50; if (o !== lo) { lo = o; el.style.opacity = String(o); } };
}

/** cached textContent → set(string) */
export function texter(el) {
  let lt = null;
  return s => { if (s !== lt) { lt = s; el.textContent = s; } };
}

/** cached numeric attribute / style property → set(number); `q` = quantisation steps per unit */
export function numAttr(el, name, q = 100, asStyle = false, unit = '') {
  let lv = NaN;
  return v => {
    v = Math.round(v * q) / q;
    if (v !== lv) { lv = v; if (asStyle) el.style.setProperty(name, v + unit); else el.setAttribute(name, String(v)); }
  };
}

/** a ring (SVG circle) whose stroke fills with progress 0..1 → { el, set(p) } */
export function ring(parent, cls, r, stroke) {
  const size = (r + stroke) * 2, c = size / 2, len = 2 * Math.PI * r;
  const wrap = h('span', 'ring ' + (cls || ''), parent);
  wrap.innerHTML =
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<circle class="trk" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}"/>` +
    `<circle class="bar" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" ` +
    `stroke-dasharray="${len.toFixed(2)}" stroke-dashoffset="${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/></svg>`;
  const bar = wrap.querySelector('.bar');
  let lp = 0;
  return {
    el: wrap,
    set(p) {
      p = p < 0 ? 0 : p > 1 ? 1 : p; p = Math.round(p * 250) / 250;
      if (p !== lp) { lp = p; bar.setAttribute('stroke-dashoffset', (len * (1 - p)).toFixed(2)); }
    },
  };
}

/**
 * Activation for menu-style buttons: click (touch / mouse / pen) plus Enter / Space on a focused button
 * (the kernel's key handler calls preventDefault on those keys, which suppresses the native click).
 */
export function onPress(el, fn) {
  el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(e); });
  el.addEventListener('keydown', e => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) fn(e); }
  });
  el.addEventListener('pointerdown', e => e.stopPropagation());
}

/** one-shot keyframe animation (Web Animations API; silently skipped where it is missing) */
export function pop(el, frames, ms, easing = 'ease-out') {
  if (!el.animate) return null;
  try { return el.animate(frames, { duration: ms, easing, fill: 'none' }); } catch { return null; }
}
