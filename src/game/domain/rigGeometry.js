// Canonical active-ragdoll rig dimensions and anchor points.
// Physics coordinates are y-up; Canvas preview coordinates are y-down.
// Keep designer previews tied to this source instead of hand-entered pixel offsets.
export const RIG_DIMS = Object.freeze({
  torso: Object.freeze({ w: 0.30, h: 0.52 }),
  headR: 0.15,
  upperArm: Object.freeze({ w: 0.09, h: 0.26 }),
  foreArm: Object.freeze({ w: 0.08, h: 0.24 }),
  thigh: Object.freeze({ w: 0.115, h: 0.28 }),
  calf: Object.freeze({ w: 0.095, h: 0.26 }),
  gunLen: 0.36,
});

export const RIG_ANCHORS = Object.freeze({
  shoulder: Object.freeze({ x: 0, y: 0.20 }),
  neck: Object.freeze({ x: 0, y: 0.30 }),
  hip: Object.freeze({ x: 0, y: -0.24 }),
});

export const DEFAULT_RIG_POSE = Object.freeze({
  torso: 0, neck: 0,
  shF: 0.15, elF: 0.55, shB: -0.2, elB: 0.5,
  hipF: 0.05, kneeF: -0.08, hipB: -0.05, kneeB: -0.12,
});

/**
 * Canvas-space center of a vertical rig segment whose root endpoint is the given point.
 * Angles retain the physics convention (positive is counter-clockwise in y-up world);
 * Canvas drawing applies rotate(-angle).
 */
export function segmentCenterFromCanvasTop(top, physicsAngle, length, pixelsPerMeter = 1) {
  const half = length * pixelsPerMeter / 2;
  return {
    x: top.x + Math.sin(physicsAngle) * half,
    y: top.y + Math.cos(physicsAngle) * half,
  };
}

/** Canvas-space tip endpoint for a segment with the same convention. */
export function segmentTipFromCanvasTop(top, physicsAngle, length, pixelsPerMeter = 1) {
  const distance = length * pixelsPerMeter;
  return {
    x: top.x + Math.sin(physicsAngle) * distance,
    y: top.y + Math.cos(physicsAngle) * distance,
  };
}
