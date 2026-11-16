/** Pure parts of the gameplay systems: drain table, thresholds, hint clock, polyline maths, flinch machines, rings. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDrain, crossings, drinkStep, RATES } from '../../src/systems/survival.js';
import { stepHintClock, defaultHintAfter } from '../../src/systems/objectives.js';
import { buildPolyline, projectOnPolyline } from '../../src/systems/tracks.js';
import { stepFlinch, stepWalkFlinch, newFlinch, newWalkFlinch, stepRing } from '../../src/systems/steady.js';
import { stepDwell } from '../../src/systems/stars.js';

test('drain table (DESIGN §4)', () => {
  assert.equal(baseDrain(true, 2, false), 0.16);
  assert.equal(baseDrain(true, 2, true), 0.24);
  assert.equal(baseDrain(false, 1.5, false), 0.15);
  assert.equal(baseDrain(false, 5, false), 0.35);
  assert.equal(baseDrain(false, 0, false), RATES.stand);
});

test('thresholds fire once going down and re-arm after drinking', () => {
  const armed = [true, true, true], out = [];
  assert.equal(crossings(41, 39, armed, out), 1); assert.equal(out[0], 40);
  assert.equal(crossings(39, 38, armed, out), 0);
  assert.equal(crossings(31, 14, armed, out), 2); assert.deepEqual(out.slice(0, 2), [30, 15]);
  crossings(14, 60, armed, out);                       // drink → re-arm
  assert.equal(crossings(41, 39, armed, out), 1);
});

test('drink ring fills and drains at 2x', () => {
  assert.equal(drinkStep(0, true, 0.6, 1.2), 0.5);
  assert.equal(drinkStep(0.5, false, 0.1, 1.2), 0.5 - 0.2 / 1.2);
  assert.equal(drinkStep(0.1, false, 5), 0);
});

test('hint clock: escalates, progress restarts it', () => {
  const s = { t: 0, level: 0 }, after = [25, 50];
  let shown = [];
  for (let i = 0; i < 60 * 60; i++) { const h = stepHintClock(s, 1 / 60, false, after, 2); if (h >= 0) shown.push([h, +s.t.toFixed(1)]); }
  assert.deepEqual(shown.map(x => x[0]), [0, 1]);
  assert.ok(Math.abs(shown[0][1] - 25) < 0.1 && Math.abs(shown[1][1] - 50) < 0.1);
  stepHintClock(s, 1 / 60, true, after, 2);
  assert.equal(s.t, 0); assert.equal(s.level, 0);
  assert.deepEqual(defaultHintAfter(2), [25, 50]); assert.deepEqual(defaultHintAfter(4), [45, 90]);
});

test('polyline projection', () => {
  const P = buildPolyline([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }]);
  assert.equal(P.length, 20);
  const o = { t: 0, d: 0 };
  projectOnPolyline(P, 5, 3, o); assert.ok(Math.abs(o.t - 0.25) < 1e-6 && Math.abs(o.d - 3) < 1e-6);
  projectOnPolyline(P, 12, 5, o); assert.ok(Math.abs(o.t - 0.75) < 1e-6 && Math.abs(o.d - 2) < 1e-6);
  projectOnPolyline(P, -5, 0, o); assert.equal(o.t, 0); assert.equal(o.d, 5);
  projectOnPolyline(P, 10, 99, o); assert.equal(o.t, 1);
});

test('flinch inside a test window: release > 0.25 s, stick > 0.5, view > 35° off', () => {
  const s = newFlinch();
  for (let i = 0; i < 14; i++) assert.equal(stepFlinch(s, false, 0, 0, 1 / 60), false);   // 0.23 s
  assert.equal(stepFlinch(s, true, 0, 0, 1 / 60), false);                                   // re-press resets
  let f = false; for (let i = 0; i < 16; i++) f = stepFlinch(s, false, 0, 0, 1 / 60) || f;
  assert.equal(f, true);
  assert.equal(stepFlinch(newFlinch(), true, 0.6, 0, 1 / 60), true);
  assert.equal(stepFlinch(newFlinch(), true, 0, 36 * Math.PI / 180, 1 / 60), true);
  assert.equal(stepFlinch(newFlinch(), true, 0.3, 30 * Math.PI / 180, 1 / 60), false);
});

test('walk flinch: standing still, wrong heading, thumb lifted after the shot', () => {
  let s = newWalkFlinch(), f = false;
  for (let i = 0; i < 60; i++) f = stepWalkFlinch(s, 0.8, 0, 1 / 60) || f;
  assert.equal(f, false);
  for (let i = 0; i < 20; i++) f = stepWalkFlinch(s, 0.05, 0, 1 / 60) || f;                 // 0.33 s still
  assert.equal(f, false);
  for (let i = 0; i < 20; i++) f = stepWalkFlinch(s, 0.05, 0, 1 / 60) || f;                 // > 0.5 s
  assert.equal(f, true);
  s = newWalkFlinch(); f = false;
  for (let i = 0; i < 30; i++) f = stepWalkFlinch(s, 0.8, 40 * Math.PI / 180, 1 / 60) || f; // 0.5 s off-heading
  assert.equal(f, true);
  s = newWalkFlinch(); f = false; s.moved = true; s.shot = true;
  for (let i = 0; i < 5; i++) f = stepWalkFlinch(s, 0.05, 0, 1 / 60) || f;
  assert.equal(f, true);
});

test('rings', () => {
  assert.equal(stepRing(0, true, 2, 1), 0.5);
  assert.equal(stepRing(0.5, false, 2, 0.25), 0.25);
  assert.equal(stepDwell(0, true, 0.4, 0.8), 0.5);
  assert.equal(stepDwell(0.5, false, 0.1, 0.8), 0.25);
});
