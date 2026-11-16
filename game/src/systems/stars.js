/**
 * Star reading. `find({ star, seconds = 0.8, tolerance = 7°, magnet = 12°, decoys: [{ star, onGaze }] })` → Promise
 * Night sky mode + the eye (firasa) held: while the view axis is within `tolerance` of the star the dwell fills.
 *   stars.active → null | { star, progress }   (reused object; non-null while a find is open)
 * Events: stars:progress {p} · stars:found {id}. Decoy gaze ≥ 0.6 s calls onGaze once (a hint, never a fail).
 * Camera state is restored in `finally`. Pure helper (unit tests): stepDwell.
 */
import * as THREE from 'three';
import { DEG } from '../core/math.js';

export const GAZE_SECONDS = 0.6;
const _d = new THREE.Vector3(), _f = new THREE.Vector3();
const evProg = { p: 0 }, evFound = { id: '' };

/** Pure: dwell ring, fills at 1/seconds while on target, drains at 2/seconds otherwise. */
export function stepDwell(t, on, dt, seconds) {
  t += (on ? dt : -2 * dt) / Math.max(1e-3, seconds);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function createStars(G) {
  const act = { star: null, progress: 0, hint: '' };
  let open = false;
  const S = {
    get active() { return open ? act : null; },
    get activeRequest() { return open ? act : null; },
    find(o = {}) {
      const id = o.star || 'polaris';
      const seconds = o.seconds || 0.8;
      const tol = (o.tolerance || 7) * (o.tolerance > 1.6 || !o.tolerance ? DEG : 1);
      const cone = (o.magnet === undefined ? 12 : o.magnet);
      const decoys = (o.decoys || []).map(d => ({ star: d.star, onGaze: d.onGaze, t: 0, fired: false }));
      const cam = G.actors.cam, stars = G.world.sky.stars;
      const dirFn = () => stars.dir(id, _d);
      let p = 0, total = 0, finished = false;
      const cleanup = () => {
        if (finished) return; finished = true; open = false; act.progress = 0; act.hint = '';
        try { stars.teach?.(null); stars.highlight(null, 0); } catch (e) { /* noop */ }
        if (cam.magnet) cam.magnet(null, 0);
        cam.skyMode(false);
      };
      open = true; act.star = id; act.progress = 0; act.hint = ''; stars.teach?.(id);
      cam.skyMode(true);
      if (cam.magnet) cam.magnet(dirFn, cone);
      G.scope.onEnd(cleanup);
      const task = G.scope.task(dt => {
        total += dt;
        // First let the player read the sky. Later teach the shape, without
        // drawing the answer-to-Polaris line or moving any catalogue star.
        stars.teach?.(id, Math.max(0, Math.min(0.8, (total - 24) / 18)));
        act.hint = total < 12 ? '' : id === 'megrez' ? 'أربع نجوم للمغرفة، وثلاث تمتد منها.'
          : id === 'polaris' ? 'مدّ النظر من نجمتَي طرف المغرفة نحو الشمال.'
          : id === 'canopus' ? 'سهيل منخفض عند الأفق الجنوبي.' : '';
        G.camera.getWorldDirection(_f);
        stars.dir(id, _d);
        const err = _f.angleTo(_d);
        const eye = G.sys.firasa.active && G.state.mode === 'play';
        p = stepDwell(p, eye && err <= tol, dt, seconds);
        act.progress = p;
        try { stars.highlight(id, p); } catch (e) { /* noop */ }
        evProg.p = p; G.events.emit('stars:progress', evProg);
        for (let i = 0; i < decoys.length; i++) {
          const dc = decoys[i]; if (dc.fired) continue;
          stars.dir(dc.star, _d);
          dc.t = eye && _f.angleTo(_d) <= tol * 1.4 ? dc.t + dt : 0;
          if (dc.t >= GAZE_SECONDS) { dc.fired = true; if (dc.onGaze) dc.onGaze(dc.star); }
        }
        if (p >= 1 || (G.state.fastText && total > 0.1)) { evFound.id = id; cleanup(); G.events.emit('stars:found', evFound); return true; }
        return undefined;
      });
      task.catch(cleanup);
      return task;
    },
    onBeatEnd() { open = false; act.progress = 0; act.hint = ''; G.world.sky.stars.teach?.(null); },
    onLevelUnload() { open = false; act.hint = ''; G.world.sky.stars.teach?.(null); },
    update() {},
  };
  return S;
}
