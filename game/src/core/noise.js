/** Deterministic, seedable 2D simplex noise + fractal helpers. */
import { makeRng } from './rng.js';

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);

/**
 * @param {number|string} seed
 * @returns {{n2(x:number,y:number):number, fbm(x:number,y:number,oct?:number,lac?:number,gain?:number):number, ridge(x:number,y:number,oct?:number,lac?:number,gain?:number):number}}
 */
export function makeNoise(seed) {
  const rng = makeRng(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  /** simplex noise in [-1, 1] */
  function n2(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let a = 0.5 - x0 * x0 - y0 * y0;
    if (a > 0) { const g = (perm[ii + perm[jj]] & 7) * 2; a *= a; n += a * a * (GRAD[g] * x0 + GRAD[g + 1] * y0); }
    a = 0.5 - x1 * x1 - y1 * y1;
    if (a > 0) { const g = (perm[ii + i1 + perm[jj + j1]] & 7) * 2; a *= a; n += a * a * (GRAD[g] * x1 + GRAD[g + 1] * y1); }
    a = 0.5 - x2 * x2 - y2 * y2;
    if (a > 0) { const g = (perm[ii + 1 + perm[jj + 1]] & 7) * 2; a *= a; n += a * a * (GRAD[g] * x2 + GRAD[g + 1] * y2); }
    return 70 * n;
  }
  /** fractal brownian motion, roughly [-1, 1] */
  function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) { sum += amp * n2(x * f, y * f); norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  }
  /** ridged multifractal in [0, 1] — sharp crests */
  function ridge(x, y, oct = 3, lac = 2, gain = 0.5) {
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) { const r = 1 - Math.abs(n2(x * f, y * f)); sum += amp * r * r; norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  }
  return { n2, fbm, ridge };
}
