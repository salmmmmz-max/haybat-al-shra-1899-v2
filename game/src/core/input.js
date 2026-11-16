/**
 * Unified input. Gameplay reads actions; devices (keyboard, mouse, gamepad, the touch UI, tests) write them.
 *
 * Read (valid for the current tick, after loop → input.sample):
 *   input.move {x,y}  −1..1, y = forward, length ≤ 1
 *   input.look {x,y}  radians this tick (x: yaw to the right +, y: pitch up +)
 *   input.held(a) / pressed(a) / released(a)      a ∈ ACTIONS
 *   input.device      'touch' | 'keyboard' | 'gamepad'
 * Write (devices / UI / tests):
 *   input.setMove(x, y, source='ui')    persistent until changed (touch stick)
 *   input.addLook(dxRad, dyRad)         accumulates until the next tick
 *   input.setHeld(action, on, source='ui')   a quick down+up between two ticks still registers as one press
 *   input.tap(action)                   one-tick press
 *   input.feed({ move, look, hold:[…], press:[…] })   convenience for tests/bot: `hold` REPLACES the set held by source 'feed'
 * Locks:
 *   input.lock(tag) / unlock(tag)       while any lock is active move/look read 0 and actions read false,
 *                                       except 'pause' and 'skip'. After unlocking, an action that is still physically
 *                                       held stays suppressed until it is released (no accidental triggers).
 */
import { clamp } from './math.js';

export const ACTIONS = ['interact', 'firasa', 'run', 'drink', 'pause', 'skip'];
const ALWAYS = { pause: true, skip: true };
const KEYMAP = {
  KeyE: 'interact', Space: 'interact', Enter: 'interact',
  KeyF: 'firasa', KeyQ: 'firasa',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyR: 'drink',
  Escape: 'pause', KeyP: 'pause',
};
const SKIP_KEYS = { Space: true, Enter: true, Escape: false };

export function createInput(G) {
  const move = { x: 0, y: 0 }, look = { x: 0, y: 0 };
  const lookAcc = { x: 0, y: 0 };
  /** per-source persistent move vectors */
  const moves = { ui: { x: 0, y: 0 }, key: { x: 0, y: 0 }, pad: { x: 0, y: 0 }, feed: { x: 0, y: 0 } };
  /** per-source held flags */
  const srcHeld = { ui: {}, key: {}, pad: {}, feed: {} };
  const sticky = {};            // went down since last sample
  const cur = {}, prev = {}, pressed = {}, released = {}, suppressed = {};
  for (const a of ACTIONS) { cur[a] = prev[a] = pressed[a] = released[a] = suppressed[a] = false; sticky[a] = false; }
  const locks = new Set();
  const keys = {};
  let device = (typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0)) ? 'touch' : 'keyboard';
  let dragging = false, lastX = 0, lastY = 0, moveMag = 0;

  const settings = () => (G.save && G.save.settings) || { sens: 1, invertY: false };

  function rawHeld(a) { return !!(srcHeld.ui[a] || srcHeld.key[a] || srcHeld.pad[a] || srcHeld.feed[a]); }

  function setHeld(action, on, source = 'ui') {
    if (!(action in cur)) return;
    if (on && !srcHeld[source][action]) sticky[action] = true;
    srcHeld[source][action] = !!on;
    if (source === 'ui') device = 'touch';
  }
  function tap(action) { if (action in cur) sticky[action] = true; }
  function setMove(x, y, source = 'ui') { const m = moves[source]; m.x = x; m.y = y; if (source === 'ui' && (x || y)) device = 'touch'; }
  function addLook(dx, dy) { lookAcc.x += dx; lookAcc.y += dy; }

  function feed(f) {
    if (f.move) setMove(f.move.x || 0, f.move.y || 0, 'feed');
    if (f.look) addLook(f.look.x || 0, f.look.y || 0);
    if (f.hold) { for (const a of ACTIONS) setHeld(a, f.hold.includes(a), 'feed'); }
    if (f.press) for (const a of f.press) tap(a);
  }

  function pollPad(dt) {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads(); let p = null;
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { p = pads[i]; break; }
    const m = moves.pad;
    if (!p) { m.x = m.y = 0; return; }
    const dz = v => (Math.abs(v) < 0.18 ? 0 : v);
    m.x = dz(p.axes[0] || 0); m.y = -dz(p.axes[1] || 0);
    const rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
    if (rx || ry) { addLook(rx * 2.4 * dt, -ry * 1.6 * dt); device = 'gamepad'; }
    if (m.x || m.y) device = 'gamepad';
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed);
    setHeld('interact', b(0), 'pad'); setHeld('firasa', b(2) || b(4), 'pad'); setHeld('drink', b(3), 'pad');
    setHeld('run', b(7) || b(5), 'pad'); setHeld('pause', b(9), 'pad'); setHeld('skip', b(1), 'pad');
  }

  /** Called once per tick by the loop. */
  function sample(dt = 1 / 60) {
    pollPad(dt);
    // keyboard move
    const k = moves.key;
    k.x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    k.y = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    // digital sources are normalised: 0.6 = walk, 1.0 while 'run' is held
    const kl = Math.hypot(k.x, k.y);
    if (kl > 0) { const km = (srcHeld.key.run ? 1 : 0.6) / kl; k.x *= km; k.y *= km; }
    let mx = moves.ui.x + k.x + moves.pad.x + moves.feed.x;
    let my = moves.ui.y + k.y + moves.pad.y + moves.feed.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const locked = locks.size > 0;
    move.x = locked ? 0 : mx; move.y = locked ? 0 : my;
    moveMag = Math.min(1, Math.hypot(move.x, move.y));
    const s = settings();
    look.x = locked ? 0 : lookAcc.x * (s.sens || 1);
    look.y = locked ? 0 : lookAcc.y * (s.sens || 1) * (s.invertY ? -1 : 1);
    lookAcc.x = lookAcc.y = 0;
    for (let i = 0; i < ACTIONS.length; i++) {
      const a = ACTIONS[i];
      const raw = rawHeld(a) || sticky[a];
      sticky[a] = false;
      if (!raw) suppressed[a] = false;
      const on = raw && !suppressed[a] && (!locked || ALWAYS[a]);
      prev[a] = cur[a]; cur[a] = on;
      pressed[a] = on && !prev[a];
      released[a] = !on && prev[a];
    }
  }

  function lock(tag) { locks.add(tag); }
  function unlock(tag) {
    if (!locks.delete(tag)) return;
    if (locks.size === 0) for (const a of ACTIONS) if (rawHeld(a) || sticky[a]) suppressed[a] = true;
  }

  // ---- device listeners -------------------------------------------------------------------------
  if (typeof window !== 'undefined') {
    // keys typed into a form control (settings sliders …) belong to the control — except Escape (pause)
    const inForm = e => e.code !== 'Escape' && e.target && e.target.closest && !!e.target.closest('input, select, textarea, [contenteditable]');
    window.addEventListener('keydown', e => {
      if (inForm(e)) return;
      if (e.repeat) { if (KEYMAP[e.code] || e.code.startsWith('Arrow')) e.preventDefault(); return; }
      keys[e.code] = true; device = 'keyboard';
      const a = KEYMAP[e.code]; if (a) { setHeld(a, true, 'key'); }
      if (SKIP_KEYS[e.code]) tap('skip');
      if (a || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; const a = KEYMAP[e.code]; if (a) setHeld(a, false, 'key'); });
    window.addEventListener('blur', () => {
      for (const c in keys) keys[c] = false;
      for (const a of ACTIONS) { srcHeld.key[a] = false; srcHeld.ui[a] = false; }
      moves.ui.x = moves.ui.y = 0; dragging = false;
    });
    const el = G.canvas;
    if (el) {
      // mouse drag-look on desktop (touch look is fed by ui/touch.js). Listens on window: the touch layer sits above the canvas and
      // lets mouse pointers through; menus / buttons / dialogue call stopPropagation on pointerdown, so they never start a drag.
      window.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0 || e.defaultPrevented) return; dragging = true; lastX = e.clientX; lastY = e.clientY; });
      window.addEventListener('pointermove', e => {
        if (!dragging || e.pointerType !== 'mouse') return;
        if (!(e.buttons & 1)) { dragging = false; return; }
        addLook((e.clientX - lastX) * 0.0045, -(e.clientY - lastY) * 0.0035);
        lastX = e.clientX; lastY = e.clientY; device = 'keyboard';
      });
      const end = e => { if (e.pointerType === 'mouse') dragging = false; };
      window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
      el.addEventListener('contextmenu', e => e.preventDefault());
    }
  }

  return {
    move, look,
    held: a => cur[a] === true,
    pressed: a => pressed[a] === true,
    released: a => released[a] === true,
    /** |move| after dead-zone, 0..1 (keyboard: 0.6 walking, 1 with run held) */
    get moveMag() { return moveMag; },
    get device() { return device; },
    get locked() { return locks.size > 0; },
    lock, unlock, sample, setHeld, tap, setMove, addLook, feed,
    /** release everything written by a source (e.g. when the touch UI hides) */
    clearSource(source) { for (const a of ACTIONS) srcHeld[source][a] = false; moves[source].x = moves[source].y = 0; },
  };
}
