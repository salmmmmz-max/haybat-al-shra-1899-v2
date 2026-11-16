/**
 * Star catalogue + pure celestial maths (no three.js, no DOM — unit-tested in tests/unit/sky.test.js).
 *
 * Exports
 *   LAT_DEG                         observer latitude (20.0° N — the Empty Quarter)
 *   STARS                           [{ id, ra /* hours *\/, dec /* deg *\/, mag, bv, rgb: [r,g,b] 0..1 }]  — ≥ 60 named bright stars, J2000
 *   STAR_INDEX                      { id → index into STARS }
 *   ASTERISMS                       { banat_nash: [[a,b]…], pointer: [[a,b]…] }
 *   altAz(raH, decDeg, lstH, latDeg = LAT_DEG, out?) → { alt, az }   degrees; az from north, clockwise
 *   dirFromAltAz(altDeg, azDeg, out) → out {x,y,z}                    world unit vector (north = −Z, east = +X, up = +Y)
 *   equatorial(raH, decDeg, out) → out {x,y,z}                        unit vector in the equatorial frame
 *   skyMatrix(lstH, latDeg = LAT_DEG, out /* Float32Array(9) *\/) → out   column-major mat3: world = M · equatorial
 *   applySky(m, e, out) → out                                           multiply (allocation-free)
 *   starDir(id, lstH, out, latDeg?) → out | null                        world unit vector of a named star
 *   bvToRgb(bv, out?) → [r,g,b]
 *   makeFaintStars(count, seed) → { pos: Float32Array(3n) equatorial, mag: Float32Array(n), rgb: Float32Array(3n) }
 *   GAL_POLE, GAL_CENTER            equatorial unit vectors (Milky Way band)
 *
 * Conventions: hour angle H = LST − RA; world direction for azimuth az / altitude alt = (sin az·cos alt, sin alt, −cos az·cos alt).
 */
import { makeRng } from '../core/rng.js';

export const LAT_DEG = 20.0;
const D2R = Math.PI / 180, H2R = Math.PI / 12;

// id, RA (h), Dec (°), V magnitude, B−V, optional display colour override (stylised)
const RAW = [
  ['sirius', 6.7525, -16.716, -1.46, 0.00, [0.80, 0.88, 1.0]],        // الشعرى — blue-white
  ['canopus', 6.3992, -52.696, -0.74, 0.15, [1.0, 0.86, 0.56]],       // سهيل — yellowish (stylised + low-altitude reddening)
  ['arcturus', 14.2610, 19.182, -0.05, 1.23],
  ['rigil_kent', 14.6601, -60.834, -0.27, 0.71],
  ['vega', 18.6156, 38.784, 0.03, 0.00],
  ['capella', 5.2782, 45.998, 0.08, 0.80],
  ['rigel', 5.2423, -8.202, 0.13, -0.03],
  ['procyon', 7.6550, 5.225, 0.34, 0.42],
  ['achernar', 1.6286, -57.237, 0.46, -0.16],
  ['betelgeuse', 5.9195, 7.407, 0.50, 1.85],
  ['hadar', 14.0637, -60.373, 0.61, -0.23],
  ['altair', 19.8464, 8.868, 0.77, 0.22],
  ['acrux', 12.4433, -63.099, 0.76, -0.24],
  ['aldebaran', 4.5987, 16.509, 0.85, 1.54],
  ['antares', 16.4901, -26.432, 0.96, 1.83],
  ['spica', 13.4199, -11.161, 0.97, -0.23],
  ['pollux', 7.7553, 28.026, 1.14, 1.00],
  ['fomalhaut', 22.9608, -29.622, 1.16, 0.09],
  ['deneb', 20.6905, 45.280, 1.25, 0.09],
  ['mimosa', 12.7953, -59.689, 1.25, -0.23],
  ['regulus', 10.1395, 11.967, 1.35, -0.11],
  ['adhara', 6.9771, -28.972, 1.50, -0.21],
  ['castor', 7.5767, 31.888, 1.57, 0.03],
  ['shaula', 17.5601, -37.104, 1.63, -0.22],
  ['gacrux', 12.5194, -57.113, 1.63, 1.59],
  ['bellatrix', 5.4189, 6.350, 1.64, -0.22],
  ['elnath', 5.4382, 28.608, 1.65, -0.13],
  ['miaplacidus', 9.2200, -69.717, 1.68, 0.00],
  ['alnilam', 5.6036, -1.202, 1.69, -0.19],
  ['alnair', 22.1372, -46.961, 1.74, -0.13],
  ['alnitak', 5.6793, -1.943, 1.77, -0.21],
  ['alioth', 12.9005, 55.960, 1.77, -0.02],
  ['regor', 8.1589, -47.337, 1.78, -0.22],
  ['dubhe', 11.0621, 61.751, 1.79, 1.07],
  ['mirfak', 3.4054, 49.861, 1.79, 0.48],
  ['wezen', 7.1399, -26.393, 1.84, 0.68],
  ['kaus_australis', 18.4029, -34.385, 1.85, -0.03],
  ['avior', 8.3752, -59.510, 1.86, 1.28],
  ['alkaid', 13.7923, 49.313, 1.86, -0.19],
  ['sargas', 17.6219, -42.998, 1.87, 0.40],
  ['menkalinan', 5.9921, 44.947, 1.90, 0.03],
  ['atria', 16.8111, -69.028, 1.92, 1.44],
  ['alhena', 6.6285, 16.399, 1.93, 0.00],
  ['peacock', 20.4275, -56.735, 1.94, -0.20],
  ['alsephina', 8.7451, -54.708, 1.96, 0.04],
  ['polaris', 2.5303, 89.264, 1.98, 0.60],                             // الجدي
  ['mirzam', 6.3783, -17.956, 1.98, -0.23],
  ['alphard', 9.4598, -8.659, 1.98, 1.44],
  ['hamal', 2.1196, 23.463, 2.00, 1.15],
  ['nunki', 18.9211, -26.297, 2.02, -0.22],
  ['diphda', 0.7265, -17.987, 2.04, 1.02],
  ['menkent', 14.1114, -36.370, 2.06, 1.01],
  ['alpheratz', 0.1398, 29.090, 2.06, -0.11],
  ['mirach', 1.1622, 35.621, 2.06, 1.58],
  ['rasalhague', 17.5822, 12.560, 2.07, 0.15],
  ['kochab', 14.8451, 74.156, 2.08, 1.47],
  ['algieba', 10.3329, 19.842, 2.08, 1.15],
  ['saiph', 5.7959, -9.670, 2.09, -0.18],
  ['algol', 3.1361, 40.956, 2.12, -0.05],
  ['denebola', 11.8177, 14.572, 2.14, 0.09],
  ['sadr', 20.3705, 40.257, 2.20, 0.68],
  ['mintaka', 5.5334, -0.299, 2.23, -0.22],
  ['schedar', 0.6751, 56.537, 2.23, 1.17],
  ['eltanin', 17.9434, 51.489, 2.23, 1.52],
  ['alphecca', 15.5781, 26.715, 2.23, -0.02],
  ['naos', 8.0597, -40.003, 2.25, -0.26],
  ['aspidiske', 9.2848, -59.275, 2.25, 0.18],
  ['almach', 2.0650, 42.330, 2.26, 1.37],
  ['mizar', 13.3987, 54.925, 2.27, 0.02],
  ['caph', 0.1530, 59.150, 2.27, 0.34],
  ['dschubba', 16.0056, -22.622, 2.32, -0.12],
  ['merak', 11.0307, 56.382, 2.37, -0.02],
  ['izar', 14.7498, 27.074, 2.37, 0.97],
  ['ankaa', 0.4381, -42.306, 2.39, 1.09],
  ['enif', 21.7364, 9.875, 2.39, 1.53],
  ['scheat', 23.0629, 28.083, 2.42, 1.67],
  ['sabik', 17.1730, -15.725, 2.43, 0.06],
  ['phecda', 11.8972, 53.695, 2.44, 0.00],
  ['aludra', 7.4016, -29.303, 2.45, -0.08],
  ['navi', 0.9451, 60.717, 2.47, -0.15],
  ['markab', 23.0793, 15.205, 2.49, -0.04],
  ['alderamin', 21.3097, 62.586, 2.51, 0.22],
  ['menkar', 3.0380, 4.090, 2.53, 1.64],
  ['arneb', 5.5455, -17.822, 2.58, 0.21],
  ['gienah', 12.2634, -17.542, 2.59, -0.11],
  ['zubeneschamali', 15.2834, -9.383, 2.61, -0.11],
  ['phact', 5.6608, -34.074, 2.64, -0.12],
  ['ruchbah', 1.4303, 60.235, 2.68, 0.13],
  ['nihal', 5.4708, -20.759, 2.84, 0.82],
  ['alcyone', 3.7914, 24.105, 2.87, -0.09],
  ['acamar', 2.9710, -40.305, 2.90, 0.14],
  ['megrez', 12.2571, 57.033, 3.31, 0.08],
];

/** Approximate display colour for a B−V index (stylised, slightly saturated so tints survive on a phone). */
export function bvToRgb(bv, out = [0, 0, 0]) {
  const t = Math.max(-0.4, Math.min(2.0, bv));
  let r, g, b;
  if (t < 0.4) { const k = (t + 0.4) / 0.8; r = 0.66 + 0.34 * k; g = 0.78 + 0.22 * k; b = 1.0; }
  else { const k = Math.min(1, (t - 0.4) / 1.5); r = 1.0; g = 1.0 - 0.36 * k; b = 1.0 - 0.72 * Math.min(1, (t - 0.4) / 1.2); }
  out[0] = r; out[1] = g; out[2] = b;
  return out;
}

/** @type {{id:string, ra:number, dec:number, mag:number, bv:number, rgb:number[]}[]} */
export const STARS = RAW.map(r => ({ id: r[0], ra: r[1], dec: r[2], mag: r[3], bv: r[4], rgb: r[5] ? r[5].slice() : bvToRgb(r[4]) }));
/** @type {Record<string, number>} */
export const STAR_INDEX = {};
STARS.forEach((s, i) => { STAR_INDEX[s.id] = i; });

/** Line figures: pairs of star ids, drawn in this order. */
export const ASTERISMS = {
  banat_nash: [['alkaid', 'mizar'], ['mizar', 'alioth'], ['alioth', 'megrez'], ['megrez', 'phecda'], ['phecda', 'merak'], ['merak', 'dubhe'], ['dubhe', 'megrez']],
  pointer: [['merak', 'dubhe'], ['dubhe', 'polaris']],
};

/**
 * Horizontal coordinates of an equatorial position.
 * @param {number} raH right ascension, hours  @param {number} decDeg declination, degrees
 * @param {number} lstH local sidereal time, hours  @param {number} [latDeg] observer latitude
 * @param {{alt:number, az:number}} [out]
 * @returns {{alt:number, az:number}} degrees; az measured from north, clockwise (east = 90)
 */
export function altAz(raH, decDeg, lstH, latDeg = LAT_DEG, out = { alt: 0, az: 0 }) {
  const H = (lstH - raH) * H2R, d = decDeg * D2R, p = latDeg * D2R;
  const sd = Math.sin(d), cd = Math.cos(d), sp = Math.sin(p), cp = Math.cos(p), cH = Math.cos(H), sH = Math.sin(H);
  const up = sp * sd + cp * cd * cH;
  const north = cp * sd - sp * cd * cH;
  const east = -cd * sH;
  out.alt = Math.asin(Math.max(-1, Math.min(1, up))) / D2R;
  let az = Math.atan2(east, north) / D2R; if (az < 0) az += 360;
  out.az = az;
  return out;
}

/** World unit vector for an altitude / azimuth (degrees). north = −Z, east = +X, up = +Y. */
export function dirFromAltAz(altDeg, azDeg, out) {
  const a = altDeg * D2R, z = azDeg * D2R, ca = Math.cos(a);
  out.x = Math.sin(z) * ca; out.y = Math.sin(a); out.z = -Math.cos(z) * ca;
  return out;
}

/** Unit vector in the equatorial frame (x → RA 0, z → north celestial pole). */
export function equatorial(raH, decDeg, out) {
  const a = raH * H2R, d = decDeg * D2R, cd = Math.cos(d);
  out.x = cd * Math.cos(a); out.y = cd * Math.sin(a); out.z = Math.sin(d);
  return out;
}

/**
 * Rotation equatorial → world for a sidereal time: world = M · e. Column-major 3×3 (the layout of THREE.Matrix3.elements).
 * Rows: X(east) = [−sinθ, cosθ, 0] · Y(up) = [cosφ cosθ, cosφ sinθ, sinφ] · Z(south) = [sinφ cosθ, sinφ sinθ, −cosφ].
 */
export function skyMatrix(lstH, latDeg = LAT_DEG, out = new Float32Array(9)) {
  const th = lstH * H2R, p = latDeg * D2R;
  const st = Math.sin(th), ct = Math.cos(th), sp = Math.sin(p), cp = Math.cos(p);
  out[0] = -st; out[1] = cp * ct; out[2] = sp * ct;      // column 0
  out[3] = ct; out[4] = cp * st; out[5] = sp * st;       // column 1
  out[6] = 0; out[7] = sp; out[8] = -cp;                 // column 2
  return out;
}

/** out = M · e (M column-major). Safe when out === e. */
export function applySky(m, e, out) {
  const x = e.x, y = e.y, z = e.z;
  out.x = m[0] * x + m[3] * y + m[6] * z;
  out.y = m[1] * x + m[4] * y + m[7] * z;
  out.z = m[2] * x + m[5] * y + m[8] * z;
  return out;
}

const _aa = { alt: 0, az: 0 };
/** World unit vector of a named star at a sidereal time; `null` for an unknown id. */
export function starDir(id, lstH, out, latDeg = LAT_DEG) {
  const i = STAR_INDEX[id];
  if (i === undefined) return null;
  const s = STARS[i];
  altAz(s.ra, s.dec, lstH, latDeg, _aa);
  return dirFromAltAz(_aa.alt, _aa.az, out);
}

/** Galactic north pole (RA 12h51.4m, Dec +27.13°) and galactic centre (RA 17h45.6m, Dec −28.94°), equatorial unit vectors. */
export const GAL_POLE = equatorial(12.857, 27.13, { x: 0, y: 0, z: 0 });
export const GAL_CENTER = equatorial(17.76, -28.94, { x: 0, y: 0, z: 0 });

/**
 * Deterministic faint field stars: ~55 % uniform over the sphere, ~45 % gathered along a soft Milky Way band
 * (denser and slightly brighter toward the galactic centre).
 * @param {number} count @param {number|string} [seed]
 */
export function makeFaintStars(count, seed = 'faint-stars') {
  const rng = makeRng(seed);
  const pos = new Float32Array(count * 3), mag = new Float32Array(count), rgb = new Float32Array(count * 3);
  // orthonormal galactic frame: P = pole, C = centre (made orthogonal to P), Q = P × C
  const P = GAL_POLE;
  const d = P.x * GAL_CENTER.x + P.y * GAL_CENTER.y + P.z * GAL_CENTER.z;
  let cx = GAL_CENTER.x - d * P.x, cy = GAL_CENTER.y - d * P.y, cz = GAL_CENTER.z - d * P.z;
  const cl = Math.hypot(cx, cy, cz); cx /= cl; cy /= cl; cz /= cl;
  const qx = P.y * cz - P.z * cy, qy = P.z * cx - P.x * cz, qz = P.x * cy - P.y * cx;
  const col = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    let x, y, z, m;
    if (rng.next() < 0.45) {
      // band: gaussian galactic latitude, longitude biased toward the centre
      const g = (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;          // ≈ gaussian in −1..1
      const b = g * 0.26;                                                     // rad (σ ≈ 7.5°)
      let l = rng.next() * Math.PI * 2;
      if (rng.next() < 0.45) l = (rng.next() + rng.next() - 1) * 1.3;         // crowd ±75° around the centre
      const cb = Math.cos(b), sb = Math.sin(b), cl2 = Math.cos(l), sl = Math.sin(l);
      x = cb * (cl2 * cx + sl * qx) + sb * P.x; y = cb * (cl2 * cy + sl * qy) + sb * P.y; z = cb * (cl2 * cz + sl * qz) + sb * P.z;
      m = 3.6 + 2.4 * Math.sqrt(rng.next());
    } else {
      const u = rng.next() * 2 - 1, a = rng.next() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      x = s * Math.cos(a); y = s * Math.sin(a); z = u;
      m = 3.0 + 2.9 * Math.pow(rng.next(), 0.45);                             // many more faint than bright
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    mag[i] = m;
    bvToRgb(-0.15 + 1.5 * Math.pow(rng.next(), 1.4), col);
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2];
  }
  return { pos, mag, rgb };
}
