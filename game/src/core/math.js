/**
 * Shared math helpers. Conventions (see docs/ARCHITECTURE.md §1):
 *   +X east, +Z south, +Y up. yaw 0 faces +Z; forward = (sin yaw, 0, cos yaw); right = (−cos yaw, 0, sin yaw).
 */
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
/** Map v from [a,b] to [c,d], clamped. */
export const remap = (v, a, b, c, d) => c + (d - c) * clamp01((v - a) / (b - a));
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const easeIn = t => t * t;

/** Frame-rate independent exponential approach. lambda ≈ speed (1/s); higher = snappier. */
export const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
/** Wrap an angle to (−π, π]. */
export const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
/** Shortest signed rotation from → to. */
export const angleDelta = (from, to) => wrapPi(to - from);
export const dampAngle = (cur, target, lambda, dt) => cur + angleDelta(cur, target) * (1 - Math.exp(-lambda * dt));
/** Rotate cur toward target by at most maxStep radians. */
export const turnToward = (cur, target, maxStep) => { const d = angleDelta(cur, target); return cur + clamp(d, -maxStep, maxStep); };

/** Forward unit vector for a yaw. Writes into out {x,y,z}. */
export const fwd = (yaw, out) => { out.x = Math.sin(yaw); out.y = 0; out.z = Math.cos(yaw); return out; };
/** Right unit vector for a yaw (screen-right when looking along forward). */
export const right = (yaw, out) => { out.x = -Math.cos(yaw); out.y = 0; out.z = Math.sin(yaw); return out; };
/** Yaw that faces along (dx, dz). */
export const yawOf = (dx, dz) => Math.atan2(dx, dz);
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
/** Compass bearing in degrees (0 = north = −Z, 90 = east = +X) for a yaw. */
export const bearingDeg = yaw => { let b = (180 - yaw / DEG) % 360; if (b < 0) b += 360; return b; };
/** Yaw for a compass bearing in degrees. */
export const yawOfBearing = deg => wrapPi((180 - deg) * DEG);

/** Resolve a target that may be an Object3D, a {x,z}/{x,y,z} point or a function returning one. Returns {x,y,z} (shared scratch!). */
const _p = { x: 0, y: 0, z: 0 };
export function pointOf(target) {
  let t = typeof target === 'function' ? target() : target;
  if (!t) { _p.x = _p.y = _p.z = 0; return _p; }
  if (t.isObject3D) {
    // world position: targets are often child objects (a camel's head, a hand socket)
    if (t.parent && !t.parent.isScene) { t.updateWorldMatrix(true, false); const e = t.matrixWorld.elements; _p.x = e[12]; _p.y = e[13]; _p.z = e[14]; return _p; }
    t = t.position;
  }
  _p.x = t.x || 0; _p.y = t.y || 0; _p.z = t.z || 0;
  return _p;
}
