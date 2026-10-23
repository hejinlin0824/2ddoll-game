import test from 'node:test';
import assert from 'node:assert/strict';

// skin.js is shared with the browser renderer; stub only the storage-event surface so its
// pure placement helpers can be exercised in Node without loading a DOM or canvas runtime.
globalThis.window = { addEventListener() {} };
const {
  SKIN_BOX,
  SKIN_END_ANCHORED,
  skinPartLayout,
} = await import('../src/game/domain/skin.js');

test('legacy v1/v2 torso artwork keeps its historical center pivot', () => {
  const layout = skinPartLayout('torso', 320, 680, 100, { ox: 0, oy: 0, scale: 1 });
  assert.deepEqual(layout.pivot, { x: 0.5, y: 0.5 });
  assert.ok(Math.abs(layout.x + layout.w / 2) < 1e-9);
  assert.ok(Math.abs(layout.y + layout.h / 2) < 1e-9);
});

test('legacy forearm and calf artwork keeps bottom-edge attachment', () => {
  for (const part of ['foreArm', 'calf']) {
    const layout = skinPartLayout(part, 90, 300, 100, { ox: 0, oy: 0, scale: 1 });
    assert.deepEqual(layout.pivot, { x: 0.5, y: 1 });
    assert.ok(Math.abs(layout.x + layout.w / 2) < 1e-9);
    assert.ok(Math.abs(layout.y + layout.h - layout.targetY) < 1e-9);
    assert.equal(SKIN_END_ANCHORED[part], true);
  }
});

test('asymmetric hand-painted pivot lands exactly on the bone anchor, not the image bbox center', () => {
  const pivot = { x: 0.23, y: 0.41 };
  const xf = { ox: 0.07, oy: -0.025, scale: 1.2, pivot };
  const ppm = 104;
  const layout = skinPartLayout('upperArm', 256, 256, ppm, xf);
  assert.deepEqual(layout.pivot, pivot);
  assert.ok(Math.abs(layout.x + pivot.x * layout.w - xf.ox * ppm) < 1e-9);
  assert.ok(Math.abs(layout.y + pivot.y * layout.h - xf.oy * ppm) < 1e-9);
  // Deliberately asymmetric art should not silently be centered by its transparent crop.
  assert.ok(Math.abs(layout.x + layout.w / 2 - xf.ox * ppm) > 1);
});

test('marked forearm/calf tip pivots stay attached to hand and foot through scale changes', () => {
  for (const part of ['foreArm', 'calf']) {
    const pivot = { x: 0.34, y: 0.83 };
    const first = skinPartLayout(part, 240, 400, 120, { ox: -0.02, oy: 0.015, scale: 1, pivot });
    const scaled = skinPartLayout(part, 240, 400, 120, { ox: -0.02, oy: 0.015, scale: 1.65, pivot });
    assert.ok(Math.abs(first.x + pivot.x * first.w - first.targetX) < 1e-9);
    assert.ok(Math.abs(scaled.x + pivot.x * scaled.w - scaled.targetX) < 1e-9);
    assert.ok(Math.abs(first.y + pivot.y * first.h - first.targetY) < 1e-9);
    assert.ok(Math.abs(scaled.y + pivot.y * scaled.h - scaled.targetY) < 1e-9);
  }
});

test('all eight DIY slots resolve to a finite shared layout', () => {
  const sizes = {
    head: [180, 240], torso: [240, 300], upperArm: [90, 180], foreArm: [100, 220],
    thigh: [120, 220], calf: [100, 200], helmet: [220, 170], vest: [210, 300],
  };
  for (const [part, [w, h]] of Object.entries(sizes)) {
    const layout = skinPartLayout(part, w, h, 104, {
      ox: 0.01, oy: -0.02, scale: 1.1,
      pivot: { x: 0.29, y: 0.37 },
    });
    assert.ok(layout && [layout.x, layout.y, layout.w, layout.h].every(Number.isFinite), part);
    assert.ok(layout.w > 0 && layout.h > 0, part);
    assert.ok(layout.w / 104 <= SKIN_BOX[part].w * 2.2, part + ' fit width exceeded its standard frame cap');
  }
});
