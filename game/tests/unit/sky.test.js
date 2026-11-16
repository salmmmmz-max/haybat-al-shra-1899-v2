/** Star positions (real sky at 20° N) — pure maths of world/stars-data.js. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STARS, STAR_INDEX, ASTERISMS, LAT_DEG, altAz, dirFromAltAz, equatorial, skyMatrix, applySky, starDir, makeFaintStars, bvToRgb,
} from '../../src/world/stars-data.js';

const D2R = Math.PI / 180;
const star = id => STARS[STAR_INDEX[id]];
const pos = (id, lst) => { const s = star(id); return altAz(s.ra, s.dec, lst, LAT_DEG); };
const azDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('catalogue: ≥ 60 named stars, the gameplay stars and the first-magnitude ones exist, ids unique', () => {
  assert.ok(STARS.length >= 60, `only ${STARS.length} stars`);
  const need = ['polaris', 'dubhe', 'merak', 'phecda', 'megrez', 'alioth', 'mizar', 'alkaid', 'canopus', 'sirius',
    'vega', 'arcturus', 'capella', 'rigel', 'betelgeuse', 'procyon', 'altair', 'aldebaran', 'antares', 'spica', 'pollux', 'castor',
    'fomalhaut', 'deneb', 'regulus', 'achernar', 'bellatrix', 'alnilam'];
  for (const id of need) assert.ok(star(id), `missing ${id}`);
  assert.equal(new Set(STARS.map(s => s.id)).size, STARS.length);
  for (const s of STARS) {
    assert.ok(s.ra >= 0 && s.ra < 24 && s.dec >= -90 && s.dec <= 90 && s.mag > -2 && s.mag < 4, s.id);
    assert.ok(s.rgb.length === 3 && s.rgb.every(c => c >= 0 && c <= 1), s.id);
  }
});

test('LST 18.0: الجدي ≈ 20° up due north; بنات نعش low in the north-west', () => {
  const p = pos('polaris', 18.0);
  assert.ok(p.alt >= 19.3 && p.alt <= 20.8, `polaris alt ${p.alt}`);
  assert.ok(azDiff(p.az, 0) <= 1.5, `polaris az ${p.az}`);
  const d = pos('dubhe', 18.0);
  assert.ok(Math.abs(d.alt - 11.1) <= 0.6, `dubhe alt ${d.alt}`);
  assert.ok(azDiff(d.az, 332) <= 1.5, `dubhe az ${d.az}`);
  // the whole Dipper is above the horizon, between az 300° and 340°
  for (const id of ['dubhe', 'merak', 'phecda', 'megrez', 'alioth', 'mizar', 'alkaid']) {
    const q = pos(id, 18.0);
    assert.ok(q.alt > 5 && q.alt < 40, `${id} alt ${q.alt}`);
    assert.ok(q.az > 300 && q.az < 340, `${id} az ${q.az}`);
  }
});

test('LST 3.3: سهيل just risen in the south-south-east, الشعرى high in the south-east', () => {
  const c = pos('canopus', 3.3);
  assert.ok(Math.abs(c.alt - 6.9) <= 0.4, `canopus alt ${c.alt}`);
  assert.ok(azDiff(c.az, 153.7) <= 0.8, `canopus az ${c.az}`);
  const s = pos('sirius', 3.3);
  assert.ok(Math.abs(s.alt - 27.3) <= 0.6, `sirius alt ${s.alt}`);
  assert.ok(azDiff(s.az, 122) <= 1, `sirius az ${s.az}`);
});

test('world direction convention: north = −Z, east = +X, up = +Y', () => {
  const o = { x: 0, y: 0, z: 0 };
  dirFromAltAz(0, 0, o); assert.ok(Math.abs(o.z + 1) < 1e-9 && Math.abs(o.x) < 1e-9);
  dirFromAltAz(0, 90, o); assert.ok(Math.abs(o.x - 1) < 1e-9 && Math.abs(o.z) < 1e-9);
  dirFromAltAz(90, 123, o); assert.ok(Math.abs(o.y - 1) < 1e-9);
  dirFromAltAz(30, 180, o); assert.ok(Math.abs(o.z - Math.cos(30 * D2R)) < 1e-9 && Math.abs(o.y - 0.5) < 1e-9);
});

test('skyMatrix · equatorial equals the alt/az route for every star at several sidereal times', () => {
  const m = new Float32Array(9), e = { x: 0, y: 0, z: 0 }, a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  for (const lst of [0, 3.3, 9.75, 18, 23.99, 27.3]) {
    skyMatrix(lst, LAT_DEG, m);
    for (const s of STARS) {
      applySky(m, equatorial(s.ra, s.dec, e), a);
      starDir(s.id, lst, b);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-5, `${s.id} @ ${lst}`);
      assert.ok(Math.abs(Math.hypot(a.x, a.y, a.z) - 1) < 1e-5);
    }
  }
  // the matrix is a rotation
  skyMatrix(7.7, LAT_DEG, m);
  const det = m[0] * (m[4] * m[8] - m[7] * m[5]) - m[3] * (m[1] * m[8] - m[7] * m[2]) + m[6] * (m[1] * m[5] - m[4] * m[2]);
  assert.ok(Math.abs(Math.abs(det) - 1) < 1e-5);
});

test('the sky turns about the pole: the celestial pole stays at altitude = latitude, stars rise in the east', () => {
  for (const lst of [0, 6, 12, 18]) {
    const p = altAz(0, 90, lst, LAT_DEG);
    assert.ok(Math.abs(p.alt - LAT_DEG) < 1e-6);
  }
  // an equatorial star 3 h before culmination is in the eastern half and climbing
  const before = altAz(6, 0, 3, LAT_DEG), later = altAz(6, 0, 4, LAT_DEG);
  assert.ok(before.az > 0 && before.az < 180 && later.alt > before.alt);
  // culmination altitude = 90 − |lat − dec| (canopus: 17.3°)
  const c = star('canopus'); const top = altAz(c.ra, c.dec, c.ra, LAT_DEG);
  assert.ok(Math.abs(top.alt - (90 - Math.abs(LAT_DEG - c.dec))) < 1e-6 && azDiff(top.az, 180) < 1e-6);
  assert.equal(starDir('no_such_star', 3, {}), null);
});

test('asterisms reference catalogue stars in the documented order', () => {
  assert.deepEqual(ASTERISMS.banat_nash, [['alkaid', 'mizar'], ['mizar', 'alioth'], ['alioth', 'megrez'], ['megrez', 'phecda'], ['phecda', 'merak'], ['merak', 'dubhe'], ['dubhe', 'megrez']]);
  assert.deepEqual(ASTERISMS.pointer, [['merak', 'dubhe'], ['dubhe', 'polaris']]);
  for (const segs of Object.values(ASTERISMS)) for (const [a, b] of segs) assert.ok(star(a) && star(b));
});

test('faint stars: deterministic, unit vectors, denser in the Milky Way band', () => {
  const a = makeFaintStars(1500, 'x'), b = makeFaintStars(1500, 'x');
  assert.deepEqual(Array.from(a.pos.subarray(0, 60)), Array.from(b.pos.subarray(0, 60)));
  let inBand = 0;
  const P = equatorial(12.857, 27.13, { x: 0, y: 0, z: 0 });
  for (let i = 0; i < 1500; i++) {
    const x = a.pos[i * 3], y = a.pos[i * 3 + 1], z = a.pos[i * 3 + 2];
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-4);
    assert.ok(a.mag[i] >= 2.9 && a.mag[i] <= 6.1);
    if (Math.abs(x * P.x + y * P.y + z * P.z) < Math.sin(15 * D2R)) inBand++;
  }
  // a ±15° belt is 26 % of the sphere; the band must hold clearly more than that
  assert.ok(inBand / 1500 > 0.4, `band share ${inBand / 1500}`);
  const blue = bvToRgb(-0.2), red = bvToRgb(1.6);
  assert.ok(blue[2] > blue[0] && red[0] > red[2]);
});
