// Turns raw MediaPipe Hands results into stable, mirror-corrected hand state.
//
// Raw landmarks jitter, a hand can vanish for a frame or two, and the
// left/right label can flip. This module smooths positions, keeps a hand
// alive through short dropouts, applies hysteresis to the pinch test and
// estimates a smoothed velocity so throws feel consistent.

const PALM_LANDMARK = 9; // middle-finger base, the most stable palm point

export class HandTracker {
  constructor({
    viewportWidth = 14,
    viewportHeight = 9,
    graceMs = 220,
    positionAlpha = 0.55,
    velocityAlpha = 0.35,
    pinchEnter = 0.38,
    pinchExit = 0.5
  } = {}) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.graceMs = graceMs;
    this.positionAlpha = positionAlpha;
    this.velocityAlpha = velocityAlpha;
    this.pinchEnter = pinchEnter;
    this.pinchExit = pinchExit;
    this.hands = { left: null, right: null };
  }

  setViewport(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  reset() {
    this.hands = { left: null, right: null };
  }

  // results: MediaPipe `onResults` payload. now: timestamp in ms.
  update(results, now) {
    const seen = { left: null, right: null };
    const landmarkSets = results?.multiHandLandmarks ?? [];
    const labels = results?.multiHandedness ?? [];

    const candidates = landmarkSets.map((landmarks, i) => ({
      landmarks,
      // The camera image is mirrored, so MediaPipe's "Right" is the user's left.
      side: labels[i]?.label === 'Right' ? 'left' : 'right',
      worldX: (0.5 - landmarks[PALM_LANDMARK].x) * this.viewportWidth
    }));

    // Two hands given the same label: fall back to screen position.
    if (candidates.length === 2 && candidates[0].side === candidates[1].side) {
      candidates.sort((a, b) => a.worldX - b.worldX);
      candidates[0].side = 'left';
      candidates[1].side = 'right';
    }

    for (const c of candidates) {
      if (!seen[c.side]) seen[c.side] = c;
    }

    for (const side of ['left', 'right']) {
      this.hands[side] = seen[side]
        ? this._track(this.hands[side], seen[side], now)
        : this._coast(this.hands[side], now);
    }

    return { left: this.hands.left, right: this.hands.right };
  }

  _track(prev, c, now) {
    const { landmarks } = c;
    const palm = landmarks[PALM_LANDMARK];
    const rawX = c.worldX;
    const rawY = (0.5 - palm.y) * this.viewportHeight;

    const x = prev ? prev.x + (rawX - prev.x) * this.positionAlpha : rawX;
    const y = prev ? prev.y + (rawY - prev.y) * this.positionAlpha : rawY;

    let vx = 0;
    let vy = 0;
    if (prev) {
      const dt = Math.max(0.001, (now - prev.lastSeen) / 1000);
      const rawVx = (x - prev.x) / dt;
      const rawVy = (y - prev.y) / dt;
      vx = prev.vx + (rawVx - prev.vx) * this.velocityAlpha;
      vy = prev.vy + (rawVy - prev.vy) * this.velocityAlpha;
    }

    // Pinch distance relative to hand size, so it works at any distance.
    const wrist = landmarks[0];
    const handScale = Math.max(0.08, Math.hypot(palm.x - wrist.x, palm.y - wrist.y));
    const pinchRatio =
      Math.hypot(landmarks[8].x - landmarks[4].x, landmarks[8].y - landmarks[4].y) / handScale;
    const wasPinching = prev?.isPinching ?? false;
    const isPinching = wasPinching ? pinchRatio < this.pinchExit : pinchRatio < this.pinchEnter;

    return {
      x,
      y,
      vx,
      vy,
      speed: Math.hypot(vx, vy),
      isPinching,
      pinchRatio,
      landmarks,
      stale: false,
      lastSeen: now
    };
  }

  // Hand missing this frame: keep it alive briefly instead of dropping instantly.
  _coast(prev, now) {
    if (!prev) return null;
    if (now - prev.lastSeen > this.graceMs) return null;
    return { ...prev, vx: prev.vx * 0.8, vy: prev.vy * 0.8, speed: prev.speed * 0.8, stale: true };
  }
}
