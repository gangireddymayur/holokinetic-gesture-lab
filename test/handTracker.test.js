import test from 'node:test';
import assert from 'node:assert/strict';
import { HandTracker } from '../src/lib/handTracker.js';

// Build 21 landmarks with the palm at (px, py) and a chosen thumb/index gap.
function hand(px, py, pinchGap = 0.3) {
  const lm = Array.from({ length: 21 }, () => ({ x: px, y: py }));
  lm[0] = { x: px, y: py + 0.15 }; // wrist below the palm
  lm[4] = { x: px, y: py };
  lm[8] = { x: px + pinchGap * 0.15, y: py }; // gap scales with hand size 0.15
  return lm;
}

const frame = (...hands) => ({
  multiHandLandmarks: hands.map((h) => h.lm),
  multiHandedness: hands.map((h) => ({ label: h.label }))
});

test('maps a mirrored hand to the correct side and world position', () => {
  const t = new HandTracker({ viewportWidth: 14, viewportHeight: 9 });
  const { left, right } = t.update(frame({ lm: hand(0.25, 0.5), label: 'Right' }), 0);
  assert.ok(left, 'MediaPipe "Right" is the user\'s left in the mirrored image');
  assert.equal(right, null);
  assert.ok(left.x > 0, 'image-left maps to positive world X');
});

test('keeps a hand alive through a short dropout, then drops it', () => {
  const t = new HandTracker({ graceMs: 200 });
  t.update(frame({ lm: hand(0.5, 0.5), label: 'Left' }), 0);
  const brief = t.update(frame(), 100);
  assert.ok(brief.right?.stale, 'hand persists for a missed frame');
  const long = t.update(frame(), 400);
  assert.equal(long.right, null, 'hand is released after the grace period');
});

test('pinch has hysteresis, so it does not flicker at the threshold', () => {
  const t = new HandTracker();
  let r = t.update(frame({ lm: hand(0.5, 0.5, 0.2), label: 'Left' }), 0);
  assert.equal(r.right.isPinching, true);
  r = t.update(frame({ lm: hand(0.5, 0.5, 0.44), label: 'Left' }), 33);
  assert.equal(r.right.isPinching, true, 'stays pinched between enter and exit thresholds');
  r = t.update(frame({ lm: hand(0.5, 0.5, 0.7), label: 'Left' }), 66);
  assert.equal(r.right.isPinching, false);
});

test('smooths jitter and reports a velocity for fast movement', () => {
  const t = new HandTracker({ positionAlpha: 0.5 });
  t.update(frame({ lm: hand(0.5, 0.5), label: 'Left' }), 0);
  const r = t.update(frame({ lm: hand(0.3, 0.5), label: 'Left' }), 33);
  const rawJump = 0.2 * 14;
  assert.ok(Math.abs(r.right.x) < rawJump, 'position is smoothed, not snapped');
  assert.ok(r.right.speed > 0, 'speed is estimated from motion');
});

test('two hands with the same label are split by screen position', () => {
  const t = new HandTracker();
  const { left, right } = t.update(
    frame(
      { lm: hand(0.2, 0.5), label: 'Left' },
      { lm: hand(0.8, 0.5), label: 'Left' }
    ),
    0
  );
  assert.ok(left && right);
  assert.ok(left.x < right.x, 'left hand sits left of the right hand');
});
