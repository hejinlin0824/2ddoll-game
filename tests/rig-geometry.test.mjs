import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIG_DIMS,
  RIG_ANCHORS,
  DEFAULT_RIG_POSE,
  segmentCenterFromCanvasTop,
  segmentTipFromCanvasTop,
} from '../src/game/domain/rigGeometry.js';

test('rig dimensions and skin preview share stable anchor data', () => {
  assert.equal(RIG_DIMS.torso.w, 0.30);
  assert.equal(RIG_DIMS.headR, 0.15);
  assert.equal(RIG_ANCHORS.shoulder.y, 0.20);
  assert.equal(RIG_ANCHORS.hip.y, -0.24);
  assert.equal(DEFAULT_RIG_POSE.shF, 0.15);
});

test('vertical segment roots and tips preserve rig anchor spacing', () => {
  const root = { x: 100, y: 200 };
  assert.deepEqual(segmentCenterFromCanvasTop(root, 0, 20, 2), { x: 100, y: 220 });
  assert.deepEqual(segmentTipFromCanvasTop(root, 0, 20, 2), { x: 100, y: 240 });
});

test('rotated segment geometry uses the same canvas/physics angle convention', () => {
  const root = { x: 100, y: 200 };
  const center = segmentCenterFromCanvasTop(root, Math.PI / 2, 20, 2);
  const tip = segmentTipFromCanvasTop(root, Math.PI / 2, 20, 2);
  assert.ok(Math.abs(center.x - 120) < 1e-9);
  assert.ok(Math.abs(center.y - 200) < 1e-9);
  assert.ok(Math.abs(tip.x - 140) < 1e-9);
  assert.ok(Math.abs(tip.y - 200) < 1e-9);
});
