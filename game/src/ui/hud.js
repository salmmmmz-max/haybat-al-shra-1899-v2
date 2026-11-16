/** HUD — read-only view of game state. World-tracking things move by transform only; DOM is written on change. */
import { Vector3 } from 'three';
import { bearingDeg, pointOf, clamp, DEG } from '../core/math.js';
import { arDigits } from '../core/strings.js';
import { h, icon, flag, mover, fader, texter, ring, pop } from './dom.js';
import { ICONS, SPEAKER } from './art.js';

const PPD = 4;                         // strip pixels per degree
const _v = new Vector3(), _e = { x: 0, y: 0 };
const wrap180 = a => { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; };

/** point on the (inset) screen rectangle in the direction `rel` degrees clockwise from straight up */
function edgePos(rel, w, hh, m, out) {
  const s = Math.sin(rel * DEG), c = -Math.cos(rel * DEG), hw = w / 2 - m, hy = hh / 2 - m;
  const k = 1 / Math.max(Math.abs(s) / hw, Math.abs(c) / hy, 1e-6);
  out.x = w / 2 + s * k; out.y = hh / 2 + c * k; return out;
}

export function createHud(G, root, ctx) {
  const { t } = ctx;
  const el = h('div', 'hud off', root);
  const vis = ctx.vis;

  // ---- vignettes (behind everything)
  const vigF = h('div', 'vig firasa', el), vigT = h('div', 'vig thirst', el);
  const setVigF = fader(vigF), setVigT = fader(vigT), pulseT = flag(vigT, 'pulse');

  // ---- objective + hint
  const objW = h('div', 'obj', el), objBox = h('div', 'o none', objW);
  icon(ICONS.diamond, '', objBox); const objTx = h('span', '', objBox), setObj = texter(objTx);
  const hintEl = h('div', 'hint', objW), setHint = texter(hintEl), hintOn = flag(hintEl, 'on'), hintL2 = flag(hintEl, 'l2');
  objW.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); const O = G.sys.objectives; if (O && O.poke) O.poke(); });
  let lastObjKey = null, evHint = null, evHintT = 0;

  // ---- horizon strip
  const strip = h('div', 'strip off', el), trk = h('div', 'trk', strip); h('div', 'mid', strip);
  for (let a = 0; a < 1080; a += 15) {
    const d = a % 360, tk = h('div', 'tk' + (d % 45 === 0 ? ' m' : ''), trk); tk.style.left = a * PPD + 'px';
    const lab = d === 0 ? 'ش' : d === 90 ? 'ق' : d === 180 ? 'ج' : d === 270 ? 'غ' : '';
    if (lab) { const c = h('div', 'cd' + (d === 0 ? ' n' : ''), trk, lab); c.style.left = a * PPD + 'px'; }
  }
  const moveTrk = mover(trk), setStrip = flag(strip, 'off', true);
  const marks = [];
  for (let i = 0; i < 8; i++) {
    const m = h('div', 'mk', strip); const ic = h('span', '', m); const d = h('b', '', m);
    marks.push({ el: m, ic, mv: mover(m), edge: flag(m, 'edge'), txt: texter(d), shown: flag(m, 'hidden', true), icon: '' });
  }
  const _mp = { x: 0, z: 0 };
  function markAt(i, n, list, isMap, keys) { return isMap ? list.get(keys[i]) : list[i]; }

  // ---- world markers
  const steady = h('div', 'ring-w', el); h('div', 'halo', steady);
  const sRing = ring(steady, '', 44, 5), sMove = mover(steady), sOn = flag(steady, 'on'), sTense = flag(steady, 'tense');
  const wm = h('div', 'wmark', el); icon(ICONS.diamond, '', wm); const wmMove = mover(wm), wmOn = flag(wm, 'on');
  const ret = h('div', 'reticle', el), rRing = ring(ret, '', 15, 1.5), rOn = flag(ret, 'on');
  const skyHint = h('div', 'sky-hint', el), skyHintText = texter(skyHint), skyHintOn = flag(skyHint, 'on');
  let stripBearing = null;

  // Gust direction is carried by world dust. A tiny luminance response and haptic
  // onset remain; screen-space stripes used to flatten the whole scene (R09).
  const flash = h('div', 'flash', el), setFlash = fader(flash);
  let flashT = 0;
  G.events.on('weather:gust', () => { flashT = 0.45; ctx.vib(35); });

  // ---- ripple / glint
  const rip = h('div', 'ripple', el); h('i', '', rip); h('i', '', rip); h('i', '', rip);
  const ripAr = h('span', 'ar', rip); icon(ICONS.arrow, '', ripAr);
  const ripMove = mover(rip), ripOn = flag(rip, 'on'), ripArrow = flag(rip, 'arrow');
  let ripFn = null, ripAsArrow = false;
  const glints = [];
  for (let i = 0; i < 4; i++) { const g = h('div', 'glint', el); icon(ICONS.suhail, '', g); glints.push({ el: g, t: 0, b: 0, mv: mover(g), op: fader(g) }); }

  // ---- toasts / prompt / count
  const toastW = h('div', 'toasts', el), slots = [];
  for (let i = 0; i < 2; i++) slots.push({ el: h('div', 'toast', toastW), t: 0, on: null });
  slots.forEach(s => { s.on = flag(s.el, 'on'); });
  const promptEl = h('div', 'prompt-w', el), glyphEl = h('span', 'gl', promptEl), promptTx = h('span', 'tx', promptEl), pOn = flag(promptEl, 'on');
  const countEl = h('div', 'count', el), setCountOp = fader(countEl), setCountTx = texter(countEl);

  const hud = {
    el, vis,
    toast(msg, seconds = 3.5) {
      let s = slots.find(x => x.t <= 0);
      if (!s) { s = slots[0].t <= slots[1].t ? slots[0] : slots[1]; }
      s.el.textContent = ''; s.el.style.setProperty('--plate', '');
      if (typeof msg === 'string') s.el.textContent = msg;
      else {
        if (msg.who && SPEAKER[msg.who]) s.el.style.setProperty('--plate', SPEAKER[msg.who]);
        if (msg.name) h('span', 'nm', s.el, msg.name);
        s.el.appendChild(document.createTextNode(msg.text || ''));
      }
      // keep slot order stable: newest at the bottom
      toastW.appendChild(s.el); const i = slots.indexOf(s); slots.splice(i, 1); slots.push(s);
      s.t = Math.max(0.5, seconds); s.on(false); void s.el.offsetWidth; s.on(true);
    },
    prompt(key, glyph) {
      if (!key) { pOn(false); return; }
      const g = glyph || (/move|walk|stick/.test(key) ? 'thumb' : /look|turn|swipe/.test(key) ? 'swipe' : /hold|steady|eye|firasa|drink/.test(key) ? 'hold' : 'tap');
      glyphEl.innerHTML = ICONS[g] || ICONS.tap;
      const movement = /c1_wake.prompt.move|c1_trail.prompt.run|c5_walk.prompt.pace/.test(key);
      const looking = /c1_wake.prompt.look/.test(key);
      promptEl.classList.toggle('at-stick', movement); promptEl.classList.toggle('at-look', looking);
      // Keep one action beside its control; the mission remains in the objective.
      const keyboard = root.classList.contains('kb');
      promptTx.textContent = key === 'c1_wake.prompt.move' ? (keyboard ? 'امشِ بمفاتيح الأسهم' : 'اسحب لتمشي')
        : key === 'c1_wake.prompt.look' ? (keyboard ? 'اسحب بالفأرة لتنظر' : 'اسحب هنا لتنظر')
        : key === 'c5_walk.prompt.pace' ? (keyboard ? 'تقدّم بثبات نحو النار' : 'اسحب بثبات نحو النار') : t(key);
      pOn(true);
    },
    count(n) {
      if (n === null || n === undefined) { setCountOp(0); return; }
      setCountTx(arDigits(n)); setCountOp(1);
      pop(countEl, [{ transform: 'translate(-50%,-50%) scale(1.7)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], 260);
    },
    ripple(fn, opts) { ripFn = typeof fn === 'function' ? fn : null; ripAsArrow = !!(opts && opts.arrow); if (!ripFn) ripOn(false); },
    glint(bearing) {
      let g = glints.find(x => x.t <= 0) || glints[0];
      g.t = 1.2; g.b = bearing;
    },
    show(v) {
      if (!v) return;
      if ('eye' in v) vis.eye = !!v.eye; if ('water' in v) vis.water = !!v.water; if ('strip' in v) vis.strip = !!v.strip;
      setStrip(!vis.strip);
    },
    pulseHint() { objBox.classList.remove('pulse'); void objBox.offsetWidth; objBox.classList.add('pulse'); },
  };
  G.events.on('hint:show', e => {
    const lvl = e.level || 1;
    if (evHintT > 0 && evHint && evHint.level > lvl) { evHintT = 9; return; }   // a poke refreshes the stronger hint instead of replacing it
    evHint = { key: e.key, text: e.text, level: lvl }; evHintT = 9;
  });
  let evObjKey = null;   // a poke re-emits objective:set with the same key: keep the event hint then
  G.events.on('objective:set', e => { const k = e && e.key; if (k !== evObjKey) evHintT = 0; evObjKey = k; });
  G.events.on('objective:done', () => { evHintT = 0; evObjKey = null; });
  G.events.on('objective:set', e => { evHint = null; hud.pulseHint(); });
  G.events.on('firasa:ping', e => { if (e && e.bearing !== undefined) hud.glint(e.bearing); });
  G.events.on('wolf:telegraph', e => {
    const p = G.actors.player && G.actors.player.pos; if (!p || e.x === undefined) return;
    hud.glint(bearingDeg(Math.atan2(e.x - p.x, e.z - p.z)));
  });
  G.events.on('steady:stage', () => ctx.vib(12));
  G.events.on('steady:start', () => ctx.vib(10));

  const _gp = { x: 0, y: 0 };
  function project(p, out) {
    _v.set(p.x, p.y, p.z).project(G.camera);
    if (_v.z > 1) return false;
    out.x = (_v.x * 0.5 + 0.5) * G.stage.w; out.y = (-_v.y * 0.5 + 0.5) * G.stage.h; return true;
  }

  hud.update = function update(dt) {
    const S = G.sys, W = G.stage.w, Hh = G.stage.h;
    const mode = G.state.mode;
    el.classList.toggle('off', mode !== 'play');
    if (mode !== 'play') { if (ripFn) { ripOn(false); } return; }
    const cam = G.actors.cam, camB = cam ? bearingDeg(cam.yaw) : 0;

    // objective + hint
    const O = S.objectives, cur = O && O.current;
    const txt = cur ? (cur.text || t(cur.key)) : '';
    setObj(txt); objBox.classList.toggle('none', !txt);
    // the objective's own hint wins; a hint that arrived only as an event (e.g. the Suhail decoy) shows for 9 s otherwise
    if (evHintT > 0) evHintT -= dt;
    const own = O && O.hint, ev = evHintT > 0 ? evHint : null;
    const hint = ev && (!own || (ev.level || 1) > (own.level || 1)) ? ev : own;
    if (hint && cur) { setHint(hint.text || t(hint.key)); hintOn(true); hintL2(hint.level >= 2); } else hintOn(false);

    // horizon strip
    if (vis.strip) {
      // Short, wrapped low-pass removes mount sway without a 359°→0° jump.
      if (stripBearing === null || Math.abs(wrap180(camB - stripBearing)) > 70) stripBearing = camB;
      stripBearing += wrap180(camB - stripBearing) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.075));
      stripBearing = (stripBearing + 360) % 360;
      moveTrk(-(360 + stripBearing) * PPD, 0);
      const list = O && O.marks, isMap = list && !Array.isArray(list) && typeof list.get === 'function';
      const keys = isMap ? Array.from(list.keys()) : null;   // legacy Map only (small, rare)
      const n = list ? (isMap ? keys.length : list.length) : 0;
      for (let i = 0; i < marks.length; i++) {
        const M = marks[i]; const m = i < n ? markAt(i, n, list, isMap, keys) : null;
        let b = m ? m.bearing : null, dist = m ? m.dist : null;
        if (m && isMap && m.at) {
          const p = G.actors.player.pos, q = pointOf(m.at);
          b = bearingDeg(Math.atan2(q.x - p.x, q.z - p.z)); dist = Math.hypot(q.x - p.x, q.z - p.z);
        }
        if (!m || b === null || b === undefined) { M.shown(true); continue; }
        M.shown(false);
        if (M.icon !== m.icon) { M.icon = m.icon; M.ic.innerHTML = ICONS[m.icon] || ICONS.diamond; M.ic.className = 'ic'; }
        const x = wrap180(b - stripBearing) * PPD, lim = strip.clientWidth ? strip.clientWidth / 2 - 20 : 140;
        M.edge(Math.abs(x) > lim); M.mv(clamp(x, -lim, lim), 0);
        M.txt(typeof dist === 'number' && isFinite(dist) ? arDigits(Math.round(dist / 10) * 10) : '');
      }
    }

    // steady ring around the projected world target
    const req = S.steady && S.steady.activeRequest; let ok = false;
    if (req && req.target) {
      const p = pointOf(req.target); let py = p.y;
      if (!py) py = G.world.terrain.heightAt(p.x, p.z) + 1.2;
      ok = project({ x: p.x, y: py, z: p.z }, _gp);
      if (ok) { sMove(_gp.x, _gp.y); sRing.set(S.steady.progress || 0); sTense((S.steady.tension || 0) > 0.35); }
    }
    sOn(ok);

    // interact world marker
    const verb = S.interact && S.interact.verb; let mk = false;
    if (verb && verb.kind && verb.at) { mk = project(verb.at, _gp) && _gp.x > 0 && _gp.x < W && _gp.y > 0 && _gp.y < Hh; if (mk) wmMove(_gp.x, _gp.y); }
    wmOn(mk);

    // star-gaze reticle
    const sa = S.stars && S.stars.active; rOn(!!sa); if (sa) rRing.set(sa.progress || 0);
    skyHintOn(!!(sa && sa.hint) && !promptEl.classList.contains('on')); if (sa) skyHintText(sa.hint || '');

    // A gust never obscures the center of the view.
    if (flashT > 0) { flashT -= dt; setFlash(Math.max(0, flashT / 0.45) * 0.12); } else setFlash(0);

    // direction ripple
    if (ripFn) {
      const b = ripFn();
      if (typeof b === 'number' && isFinite(b)) {
        const rel = wrap180(b - camB); ripOn(true); ripArrow(ripAsArrow);
        if (ripAsArrow) { edgePos(rel, W, Hh, 70, _e); ripMove(_e.x, _e.y); ar_rot(rel); }
        else {
          const a = Math.abs(rel); const x = W / 2 + clamp(rel, -90, 90) / 90 * (W / 2 - 60);
          ripMove(x, Hh * 0.55 + (a > 90 ? (a - 90) / 90 * Hh * 0.3 : 0));
        }
      } else ripOn(false);
    }
    // glints
    for (let i = 0; i < glints.length; i++) {
      const g = glints[i]; if (g.t <= 0) continue;
      g.t -= dt;
      if (g.t <= 0) { g.op(0); continue; }
      edgePos(wrap180(g.b - camB), W, Hh, 34, _e); g.mv(_e.x, _e.y);
      const k = g.t / 1.2; g.op(Math.min(1, (1 - k) * 8) * Math.min(1, k * 2.2) * (0.75 + 0.25 * Math.sin(g.t * 18)));
    }
    // toasts
    for (let i = 0; i < slots.length; i++) { const s = slots[i]; if (s.t > 0) { s.t -= dt; if (s.t <= 0) s.on(false); } }
    // vignettes
    setVigF(clamp(S.firasa ? S.firasa.amount || 0 : 0, 0, 1) * 0.95);
    const th = S.survival ? S.survival.thirst : 100;
    const tv = clamp((55 - th) / 55, 0, 1); setVigT(tv * tv * 0.85 + (th < 25 ? 0.1 : 0)); pulseT(th < 25);
  };
  function ar_rot(rel) { const st = ripAr.style; const r = Math.round(rel / 3) * 3; if (ripAr._r !== r) { ripAr._r = r; st.transform = 'rotate(' + r + 'deg)'; } }
  hud.reset = () => { flashT = 0; stripBearing = null; skyHintOn(false); ripFn = null; ripOn(false); pOn(false); setCountOp(0); slots.forEach(s => { s.t = 0; s.on(false); }); glints.forEach(g => { g.t = 0; g.op(0); }); };
  return hud;
}
