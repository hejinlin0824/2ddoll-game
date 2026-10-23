import test from 'node:test';
import assert from 'node:assert/strict';
import { RAID_FLOOR_Y, RAID_STAIR_NO_SPAWN_ZONE, RAID_STAIR_OPENING, RAID_STAIR_SHAFTS, RAID_STAIR_STEPS_PER_FLIGHT, createSwitchbackStairs, createRaidTraversalStairs, keepRaidSpawnOutOfStairwell } from '../src/game/domain/raidLayout.js';

test('each floor transition has a complete 3.5m switchback stair flight within its shaft', () => {
  const layout = createRaidTraversalStairs();
  const stairs = layout.filter((r) => r.type === 'stair');
  const ramps = layout.filter((r) => r.type === 'stairRamp');
  assert.equal(RAID_FLOOR_Y.length, 4);
  assert.equal(RAID_STAIR_SHAFTS.length, 3);
  assert.equal(stairs.length, 60);
  assert.equal(ramps.length, 3);
  assert.equal(RAID_STAIR_STEPS_PER_FLIGHT, 20);
  assert.deepEqual(RAID_STAIR_OPENING, { left: 47, right: 53 });
  for (const shaft of RAID_STAIR_SHAFTS) {
    assert.equal(shaft.xLow, RAID_STAIR_OPENING.left, 'every flight must align with the shared opening');
    assert.equal(shaft.xHigh, RAID_STAIR_OPENING.right, 'every flight must align with the shared opening');
    assert.ok(shaft.xStart === shaft.xHigh && shaft.xEnd === shaft.xLow
      || shaft.xStart === shaft.xLow && shaft.xEnd === shaft.xHigh, 'each flight must run between both landing sides');
    const flight = stairs.filter((step) => step.stairId === shaft.id).sort((a, b) => a.stairStep - b.stairStep);
    assert.equal(flight.length, 20, `${shaft.id} must have twenty treads`);
    assert.equal(flight[0].stairStep, 0);
    assert.equal(flight[19].stairStep, 19);
    assert.ok(flight.every((step) => step.x + 1e-9 < shaft.xHigh && step.x - 1e-9 > shaft.xLow));
    assert.ok(flight.every((step) => step.destructible === false && step.type === 'stair'));
    assert.ok(flight.every((step) => step.collision === false), 'visible treads should not create snagging physics lips');
    assert.equal(flight[0].x, (shaft.xStart + shaft.xEnd) / 2 + (shaft.xStart - shaft.xEnd) * 19 / 40);
    assert.equal(flight.at(-1).x, (shaft.xStart + shaft.xEnd) / 2 - (shaft.xStart - shaft.xEnd) * 19 / 40);
    for (let i = 1; i < flight.length; i++) {
      const direction = Math.sign(shaft.xEnd - shaft.xStart);
      assert.equal(Math.sign(flight[i].x - flight[i - 1].x), direction, 'treads must follow the flight direction');
      assert.ok(flight[i].y > flight[i - 1].y, 'each tread must be higher than the previous tread');
    }
    const firstTop = flight[0].y + flight[0].h / 2;
    const lastTop = flight[19].y + flight[19].h / 2;
    assert.ok(Math.abs(firstTop - (shaft.lowerTop + 3.5 / 20)) < 1e-9);
    assert.ok(Math.abs(lastTop - (shaft.lowerTop + 3.5)) < 1e-9);
    assert.ok(flight.every((step) => Math.abs((step.y + step.h / 2) - (shaft.lowerTop + (step.stairStep + 1) * 3.5 / 20)) < 1e-9));
    assert.ok(flight.every((step) => step.h < 0.2 && step.h > 0.17), 'treads should have gentle, closely spaced risers');
  }
});

test('invalid switchback dimensions fail closed instead of emitting bad physics fixtures', () => {
  assert.deepEqual(createSwitchbackStairs(2, 2, 0, 'bad'), []);
  assert.deepEqual(createSwitchbackStairs(4, 1, -1, 'bad'), []);
  assert.deepEqual(createSwitchbackStairs(4, 1, 0, 'bad', 2.5), []);
});


test('reinforcements never spawn in the stair shaft or its landing approaches', () => {
  assert.deepEqual(RAID_STAIR_NO_SPAWN_ZONE, { left: 45, right: 55 });
  assert.equal(keepRaidSpawnOutOfStairwell(50, 30), 44.5);
  assert.equal(keepRaidSpawnOutOfStairwell(49, 30), 44.5);
  assert.equal(keepRaidSpawnOutOfStairwell(50, 65), 55.5);
  assert.equal(keepRaidSpawnOutOfStairwell(44, 30), 44);
  assert.equal(keepRaidSpawnOutOfStairwell(56, 65), 56);
  assert.equal(keepRaidSpawnOutOfStairwell(-20, 30), 2.1);
  assert.equal(keepRaidSpawnOutOfStairwell(99, 65), 71.9);
});

test('each stair flight has a continuous physics-only ramp aligned to both floor landings', () => {
  const layout = createRaidTraversalStairs();
  const ramps = layout.filter((r) => r.type === 'stairRamp');
  assert.equal(ramps.length, RAID_STAIR_SHAFTS.length);
  for (const shaft of RAID_STAIR_SHAFTS) {
    const ramp = ramps.find((r) => r.stairRampId === shaft.id);
    assert.ok(ramp, `missing collision ramp for ${shaft.id}`);
    assert.equal(ramp.collisionOnly, true);
    assert.equal(ramp.destructible, false);
    assert.ok(Math.abs(ramp.h - 0.24) < 1e-9);
    assert.ok(Math.abs(Math.abs(ramp.angle) - Math.atan2(3.5, 6)) < 1e-9);
    const upperNormalX = -Math.sin(ramp.angle);
    const upperNormalY = Math.cos(ramp.angle);
    const topCenter = { x: ramp.x + upperNormalX * ramp.h / 2, y: ramp.y + upperNormalY * ramp.h / 2 };
    assert.ok(Math.abs(topCenter.x - 50) < 1e-9);
    assert.ok(Math.abs(topCenter.y - (shaft.lowerTop + 1.75)) < 1e-9);
  }
});
