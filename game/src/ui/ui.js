/**
 * UI root (`G.ui`) — ARCHITECTURE §8. A dumb view: shows what it is told, reports through G.input and events
 * ('ui:choice', 'ui:start', 'settings:changed'). Views live in hud.js, touch.js, dialogue.js, cards.js, menus.js.
 */
import './styles.css';
import { h, icon, flag } from './dom.js';
import { ICONS, installSadu } from './art.js';
import { createHud } from './hud.js';
import { createTouch } from './touch.js';
import { createDialogue } from './dialogue.js';
import { createCards, createLoading } from './cards.js';
import { createMenus } from './menus.js';

export function createUI(G) {
  const root = document.getElementById('ui') || h('div', '', document.getElementById('stage') || document.body);
  root.id = 'ui'; root.dir = 'rtl'; root.lang = 'ar'; installSadu(root);
  root.addEventListener('contextmenu', e => e.preventDefault());
  const ctx = {
    t: G.t, vis: { eye: false, water: false, strip: false },
    vib(ms) { if (ms > 0 && G.save.settings.haptics !== false && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(ms); } catch { /* */ } } },
    applyScale() { root.style.setProperty('--ts', String(G.save.settings.textScale || 1)); },
    menuOpen: () => false,
  };
  ctx.applyScale();

  const touch = createTouch(G, root, ctx);       // z 5 (under the hud)
  const hud = createHud(G, root, ctx);
  const dialogue = createDialogue(G, root, ctx);
  const cards = createCards(G, root);
  const menus = createMenus(G, root, ctx);
  const loading = createLoading(G, root);
  ctx.menuOpen = () => menus.open;

  // rotate hint while the stage is drawn rotated, until the first input
  const rot = h('div', 'rot-hint hidden', root); icon(ICONS.phone, '', rot); h('span', '', rot, G.t('ui.rotate'));
  let rotDone = false;
  root.addEventListener('pointerdown', () => { if (!rotDone) { rotDone = true; rot.style.opacity = '0'; setTimeout(() => rot.classList.add('hidden'), 600); } }, true);
  const rotShow = flag(rot, 'hidden', true);

  const kb = flag(root, 'kb');
  const ui = {
    hud, touch, dialogue, menus, cards, loading, root,
    runWhenPaused: true,
    update(dt) {
      const mode = G.state.mode;
      // pause UX: the UI owns it
      if (G.input.pressed('pause')) {
        if (menus.settingsOpen) { /* back via the arrow button */ }
        else if (menus.pauseOpen) menus.showPause(false);
        else if (mode === 'play' || mode === 'dialogue' || mode === 'cine') { G.setPaused(true); menus.showPause(true); }
      }
      kb(G.input.device !== 'touch');
      if (!rotDone) rotShow(!G.stage.rotated);
      touch.update(); hud.update(dt); dialogue.update(dt); cards.update(dt); loading.update(dt);
    },
  };
  return ui;
}
