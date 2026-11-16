/** Menus: title, chapter select, settings, pause, ending. Every screen is one `.menu` layer; panels share the Sadu frame. */
import { arDigits } from '../core/strings.js';
import { h, icon, onPress } from './dom.js';
import { ICONS } from './art.js';
import { UI_STRINGS } from './strings.ui.ar.js';

const _sp = { x: 0, y: 0 };

export function createMenus(G, root, ctx) {
  const { t } = ctx;
  const screens = {};
  let pauseOpen = false, settingsFrom = 'title';

  function layer(id, cls) { const m = h('div', 'menu hidden ' + (cls || ''), root); m.dataset.id = id; m.addEventListener('pointerdown', e => e.stopPropagation()); screens[id] = m; return m; }
  function open(id) { const m = screens[id]; m.classList.remove('hidden'); void m.offsetWidth; m.classList.add('on'); }
  function close(id) { const m = screens[id]; m.classList.remove('on'); m.classList.add('hidden'); }
  const btn = (parent, label, fn, cls) => {
    const b = h('button', 'opt ' + (cls || ''), parent, label);
    onPress(b, () => { if (G.audio && G.audio.unlock) G.audio.unlock(); ctx.vib(8); fn(); });
    return b;
  };
  function panel(m, title, wide) {
    const p = h('div', 'panel' + (wide ? ' wide' : ''), m); h('div', 'sadu t', p);
    if (title) h('h2', '', p, title);
    const body = h('div', 'body', p); h('div', 'sadu b', p); dragScroll(body); return { p, body };
  }
  /** Rotated stage (phone held upright): the browser does not pan a rotated scroller, so touch drag-scroll is done here (CSS turns native panning off there).
   *  Capture phase: a drag may start on a button. A drag longer than 8 px swallows the click that would follow it. Sliders keep their own drag. */
  function dragScroll(body) {
    let id = null, py = 0, sy = 0, sx = 0, dragged = false, rng = null, rngVal = '';
    body.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !G.stage.rotated || id !== null) return;
      rng = e.target.closest ? e.target.closest('input[type=range]') : null; rngVal = rng ? rng.value : '';
      if (!rng && e.target.closest && e.target.closest('input')) return;
      id = e.pointerId; dragged = false; G.stage.toLocal(e.clientX, e.clientY, _sp); py = sy = _sp.y; sx = _sp.x;
    }, true);
    body.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      G.stage.toLocal(e.clientX, e.clientY, _sp);
      if (!dragged) {
        const ay = Math.abs(_sp.y - sy), ax = Math.abs(_sp.x - sx);
        if (rng) { if (ax > 6 && ax >= ay) { id = null; return; } if (ay < 10 || ay < ax * 2) return; }   // on a slider: sideways = adjust it, clearly vertical = scroll
        else if (ay < 8) return;
        if (rng && rng.value !== rngVal) { rng.value = rngVal; rng.dispatchEvent(new Event('input', { bubbles: true })); }
      }
      dragged = true; if (rng) { e.preventDefault(); e.stopPropagation(); } body.scrollTop -= _sp.y - py; py = _sp.y;
    }, true);
    const end = e => { if (e.pointerId === id) id = null; };
    body.addEventListener('pointerup', end, true); body.addEventListener('pointercancel', end, true);
    body.addEventListener('click', e => { if (dragged) { dragged = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }
  function backBtn(p, fn) { const b = h('button', 'hdr-back', p); icon(ICONS.back, '', b); onPress(b, () => { ctx.vib(8); fn(); }); return b; }

  // ---------------------------------------------------------------- title
  const title = layer('title', 'title');
  const tt = h('div', 'tt', title); h('h1', '', tt, t('ui.title')); h('div', 'sadu', tt); h('p', '', tt, t('ui.subtitle'));
  const tBtns = h('div', 'btns', title);
  // ---------------------------------------------------------------- new journey (confirm before replacing progress)
  const conf = layer('confirm', 'dim'); const cfP = panel(conf, t('ui.newJourney.title'));
  const cfRep = h('p', 'cf', cfP.body), cfKeep = h('p', 'cf', cfP.body, t('ui.newJourney.unlocked')); const cfCol = h('div', 'col', cfP.body);
  cfRep.style.cssText = cfKeep.style.cssText = 'margin:0;text-align:center;line-height:1.7';
  btn(cfCol, t('ui.newJourney.keep'), () => { close('confirm'); open('title'); }, 'primary');   // the safe choice is the obvious one
  btn(cfCol, t('ui.newJourney.go'), () => { menus.hideAll(); G.events.emit('ui:start', { continue: false }); });
  // ---------------------------------------------------------------- replay a chapter (confirm before it replaces the checkpoint)
  const confC = layer('confirmCh', 'dim'); const ccP = panel(confC, t('ui.replay.title'));
  const ccRep = h('p', 'cf', ccP.body), ccKeep = h('p', 'cf', ccP.body, t('ui.newJourney.unlocked')); const ccCol = h('div', 'col', ccP.body);
  ccRep.style.cssText = ccKeep.style.cssText = 'margin:0;text-align:center;line-height:1.7';
  let ccPending = 0;
  btn(ccCol, t('ui.newJourney.keep'), () => { close('confirmCh'); open('chapters'); }, 'primary');
  const ccGo = btn(ccCol, t('ui.replay.go'), () => { const n = ccPending; ccPending = 0; menus.hideAll(); if (n) G.events.emit('ui:start', { chapter: n }); });
  function startChapterPicked(i) {
    const sd = G.save.data;
    if (!G.save.hasProgress) { menus.hideAll(); G.events.emit('ui:start', { chapter: i }); return; }
    ccPending = i;
    ccRep.textContent = t('ui.replay.replace', { n: arDigits(sd.chapter), name: t('ui.ch.' + sd.chapter), m: arDigits(i) });
    close('chapters'); open('confirmCh');
  }
  // ---------------------------------------------------------------- chapters
  const chap = layer('chapters', 'dim'); const chP = panel(chap, t('ui.chapters'), true);
  backBtn(chP.p, () => { close('chapters'); open(chapFrom); });
  const chGrid = h('div', 'chs', chP.body); let chapFrom = 'title';
  // ---------------------------------------------------------------- settings
  const set = layer('settings', 'dim'); const sP = panel(set, t('ui.settings'));
  backBtn(sP.p, () => { close('settings'); open(settingsFrom); });
  const refreshers = [];
  const S = () => G.save.settings;
  function apply(k, v, commit = true) {
    S()[k] = v;
    if (k === 'quality') G.quality.set(v);
    if (k === 'textScale') ctx.applyScale();
    if (commit) G.save.commit();
    G.events.emit('settings:changed', S());
  }
  function seg(label, key, choices) {
    const row = h('div', 'row', sP.body), lab = h('span', 'rlb', row, label); const sg = h('div', 'seg', row), bs = [];
    lab.id = 'set-' + key + '-l'; sg.setAttribute('role', 'group'); sg.setAttribute('aria-labelledby', lab.id);
    for (const [v, text] of choices) { const b = h('button', '', sg, text); onPress(b, () => { apply(key, v); ctx.vib(8); refresh(); }); bs.push([v, b]); }
    const refresh = () => { for (const [v, b] of bs) { b.classList.toggle('on', v === S()[key]); b.setAttribute('aria-pressed', String(v === S()[key])); } }; refreshers.push(refresh);
  }
  function range(label, key, min, max, step, fmt) {
    const row = h('div', 'row', sP.body), lab = h('label', '', row, label); const w = h('div', 'rng', row), val = h('b', '', w);
    const inp = h('input', '', w); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    inp.id = 'set-' + key; lab.htmlFor = inp.id; val.setAttribute('aria-hidden', 'true');   // name = the visible label; spoken value = aria-valuetext
    const show = v => { val.textContent = fmt(v); inp.setAttribute('aria-valuetext', val.textContent); };
    inp.addEventListener('input', () => { apply(key, +inp.value, false); show(+inp.value); });
    inp.addEventListener('change', () => G.save.commit());
    inp.addEventListener('pointerdown', e => e.stopPropagation());
    refreshers.push(() => { inp.value = S()[key]; show(S()[key]); });
  }
  const pct = v => arDigits(Math.round(v * 100)) + '٪', mult = v => '×' + arDigits(v.toFixed(1)).replace('.', '٫');
  seg(t('ui.set.quality'), 'quality', [['auto', t('ui.set.auto')], ['low', t('ui.set.low')], ['medium', t('ui.set.medium')], ['high', t('ui.set.high')]]);
  range(t('ui.set.master'), 'master', 0, 1, 0.05, pct); range(t('ui.set.music'), 'music', 0, 1, 0.05, pct); range(t('ui.set.sfx'), 'sfx', 0, 1, 0.05, pct);
  range(t('ui.set.sens'), 'sens', 0.5, 2, 0.1, mult);
  seg(t('ui.set.invert'), 'invertY', [[false, t('ui.off')], [true, t('ui.on')]]);
  seg(t('ui.set.eye'), 'firasaToggle', [[false, t('ui.set.eyeHold')], [true, t('ui.set.eyeToggle')]]);
  seg(t('ui.set.text'), 'textScale', [[1, t('ui.set.textS')], [1.15, t('ui.set.textM')], [1.3, t('ui.set.textL')]]);
  seg(t('ui.set.haptics'), 'haptics', [[true, t('ui.on')], [false, t('ui.off')]]);
  // ---------------------------------------------------------------- pause
  const pause = layer('pause', 'dim'); const pP = panel(pause, t('ui.paused')); const pCol = h('div', 'col', pP.body);
  btn(pCol, t('ui.resume'), () => menus.showPause(false), 'primary');
  btn(pCol, t('ui.restartBeat'), () => { menus.showPause(false); G.sys.director.restartBeat(); });
  btn(pCol, t('ui.settings'), () => openSettings('pause'));
  btn(pCol, t('ui.mainMenu'), () => { menus.hideAll(); G.setPaused(false); G.sys.director.stop(); G.setMode('title'); menus.showTitle(); });
  // ---------------------------------------------------------------- ending
  const end = layer('ending', 'ending'); const eP = panel(end, t('ui.theEnd'), false);
  const recap = h('ul', 'recap', eP.body); h('div', 'credits', eP.body, t('ui.credits')); const eCol = h('div', 'col', eP.body);
  btn(eCol, t('ui.playAgain'), () => { menus.hideAll(); G.save.reset(); G.events.emit('ui:start', { continue: false }); }, 'primary');
  btn(eCol, t('ui.chapters'), () => openChapters('ending'));

  function openSettings(from) { settingsFrom = from; for (const r of refreshers) r(); close(from); open('settings'); }
  function openChapters(from) {
    chapFrom = from; chGrid.textContent = ''; const unlocked = (G.save.data && G.save.data.unlocked) || 1;
    for (let i = 1; i <= 5; i++) {
      const lock = i > unlocked, b = h('button', 'ch' + (lock ? ' lock' : ''), chGrid); h('div', 'sadu', b);
      h('div', 'n', b, arDigits(i)); h('div', 't', b, t('ui.ch.' + i));
      if (lock) icon(ICONS.lock, 'lk', b); else h('div', 's', b, t('ui.chNum') + ' ' + arDigits(i));
      if (!lock) onPress(b, () => { if (G.audio && G.audio.unlock) G.audio.unlock(); ctx.vib(8); startChapterPicked(i); });
    }
    close(from === 'ending' ? 'ending' : from); open('chapters');
  }

  const menus = {
    get open() { return !!root.querySelector('.menu.on'); },
    get pauseOpen() { return pauseOpen; },
    get settingsOpen() { return screens.settings.classList.contains('on'); },
    showTitle() {
      menus.hideAll(); tBtns.textContent = '';
      const cont = G.save.hasProgress;      // a resumable journey (finishing the story once does not hide it after a chapter is re-entered)
      if (cont) btn(tBtns, t('ui.continue'), () => { menus.hideAll(); G.events.emit('ui:start', { continue: true }); }, 'primary');
      btn(tBtns, t('ui.start'), () => {
        if (G.save.hasProgress) {           // never replace a journey with one accidental tap: say what is replaced, then ask
          cfRep.textContent = t('ui.newJourney.replace', { n: G.save.data.chapter, name: t('ui.ch.' + G.save.data.chapter) });
          close('title'); open('confirm'); return;
        }
        menus.hideAll(); G.events.emit('ui:start', { continue: false });
      }, cont ? '' : 'primary');
      btn(tBtns, t('ui.chapters'), () => openChapters('title'));
      btn(tBtns, t('ui.settings'), () => openSettings('title'));
      open('title');
    },
    showPause(on) {
      if (!on) { pauseOpen = false; menus.hideAll(); if (G.time.scale === 0) G.setPaused(false); return; }
      pauseOpen = true; for (const k in screens) if (k !== 'pause') close(k); open('pause');
    },
    showEnding(summary) {
      const flags = (summary && summary.flags) || {}, stats = (summary && summary.stats) || {};
      recap.textContent = '';
      const T = k => (G.story && G.story.text && G.story.text[k]) || null;   // the screenplay's own summary lines
      const lines = [T('c5_end.sum.ration.' + (flags.ration || 'self')), T('c5_end.sum.water.' + (flags.gaveWater ? 'gave' : 'refused')),
        T('c5_end.sum.wolf.' + (flags.sawWolfPrint ? 'named' : 'unnamed')), T('c5_end.sum.rifle.' + (flags.leftRifle ? 'left' : 'kept')),
        T('c5_end.sum.haybah.' + Math.max(0, Math.min(4, flags.haybah | 0)))].filter(Boolean);
      if (!lines.length) lines.push(t('ui.recap.generic'));
      void stats;
      for (const l of lines) h('li', '', recap, l);
      menus.hideAll(); open('ending');
    },
    hideAll() { pauseOpen = false; for (const k in screens) close(k); },
  };
  G.events.on('game:end', e => menus.showEnding(e));
  return menus;
}
