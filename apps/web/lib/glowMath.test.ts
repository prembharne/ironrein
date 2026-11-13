/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  lerp,
  smoothstep,
  interpolateScrollKeys,
  buildBowlPolyline,
  distToSegment,
  calculatePixelColor,
  computeLetterStyle,
  computeStatementMotion,
  computeDarkSplitMotion,
  computeSlidesMotion,
} from './glowMath.ts';

test('clamp clamps correctly', () => {
  assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.equal(clamp(-0.2, 0, 1), 0);
  assert.equal(clamp(1.5, 0, 1), 1);
});

test('lerp calculates linear interpolation', () => {
  assert.equal(lerp(10, 20, 0.5), 15);
  assert.equal(lerp(0, 100, 0.25), 25);
});

test('smoothstep boundary conditions', () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(smoothstep(0.5), 0.5);
});

test('interpolateScrollKeys interpolates properly', () => {
  const atZero = interpolateScrollKeys(0);
  assert.equal(atZero.tip, 0.30);
  assert.equal(atZero.half, 0.34);
  assert.equal(atZero.soft, 0.22);

  const atMax = interpolateScrollKeys(2.0);
  assert.equal(atMax.tip, 2.40);
  assert.equal(atMax.half, 3.00);
  assert.equal(atMax.soft, 0.10);

  const atMid = interpolateScrollKeys(0.055);
  assert.ok(atMid.tip > 0.45 && atMid.tip < 0.65);
});

test('buildBowlPolyline constructs expected curve points', () => {
  const poly = buildBowlPolyline(0.8, 0.5, 1.6, 48);
  assert.equal(poly.length, 48);
  assert.equal(poly[0].y, -0.3);
  assert.ok(Math.abs(poly[47].y - 0.8) < 0.001);
  assert.ok(poly[0].x > 0);
  assert.equal(poly[47].x, 0); // At yy == tip, ratio is 0
});

test('distToSegment calculates correct perpendicular and point distances', () => {
  const d1 = distToSegment(0, 5, 0, 0, 0, 10);
  assert.equal(d1, 0);

  const d2 = distToSegment(3, 5, 0, 0, 0, 10);
  assert.equal(d2, 3);

  const d3 = distToSegment(0, 12, 0, 0, 0, 10);
  assert.equal(d3, 2);
});

test('calculatePixelColor returns RGB within 0-255 bounds', () => {
  const poly = buildBowlPolyline(0.8, 0.5, 1.6, 48);
  const color1 = calculatePixelColor(0, 0.1, 0.8, 0.5, 0.2, 1.6, poly);
  assert.ok(color1[0] >= 0 && color1[0] <= 255);
  assert.ok(color1[1] >= 0 && color1[1] <= 255);
  assert.ok(color1[2] >= 0 && color1[2] <= 255);

  const colorFar = calculatePixelColor(10, 10, 0.8, 0.5, 0.2, 1.6, poly);
  assert.deepEqual(colorFar, [255, 255, 255]);
});

test('computeLetterStyle transitions from ghost to accent to final', () => {
  const ghost: [number, number, number] = [255, 255, 255];
  const accent: [number, number, number] = [63, 124, 255];
  const final: [number, number, number] = [11, 29, 58];

  const s0 = computeLetterStyle(0, false, ghost, accent, final);
  assert.equal(s0.opacity, 0);
  assert.equal(s0.blur, 8);

  const sMid = computeLetterStyle(0.5, false, ghost, accent, final);
  assert.equal(sMid.opacity, 1);
  assert.ok(sMid.blur < 1.5 && sMid.blur > 0);

  const sEnd = computeLetterStyle(1.0, false, ghost, accent, final);
  assert.equal(sEnd.opacity, 1);
  assert.equal(sEnd.blur, 0);
  assert.equal(sEnd.color, 'rgb(11, 29, 58)');

  const sFlagged = computeLetterStyle(1.0, true, ghost, accent, final);
  assert.equal(sFlagged.color, 'rgb(56, 189, 248)'); // soft glacier cyan #38bdf8
});

test('computeStatementMotion handles rise and nav toggle', () => {
  const m0 = computeStatementMotion(0, 1000);
  assert.ok(m0.translateY > 0);
  assert.equal(m0.navOn, false);

  const mMid = computeStatementMotion(1.5, 1000);
  assert.ok(mMid.revealP > 0.4);
  assert.equal(mMid.navOn, true);
});

test('computeSlidesMotion handles sequential slides and nav toggle', () => {
  const m0 = computeSlidesMotion(0, 5);
  assert.equal(m0.slides.length, 5);
  assert.equal(m0.navOn, false);

  const mSlide1 = computeSlidesMotion(1.5, 5);
  assert.ok(mSlide1.slides[0].revealP > 0.3);
  assert.equal(mSlide1.slides[0].isActive, true);
  assert.equal(mSlide1.navOn, true);

  const mSlide2 = computeSlidesMotion(3.6, 5);
  assert.ok(mSlide2.slides[1].revealP > 0.3);
  assert.equal(mSlide2.slides[1].isActive, true);
});

test('computeDarkSplitMotion handles split progress and scale', () => {
  const m1 = computeDarkSplitMotion(500, 1000);
  assert.ok(m1.p2 >= 0 && m1.p2 <= 1);
  assert.ok(m1.shipScale <= 1.08 && m1.shipScale >= 1.0);
});
