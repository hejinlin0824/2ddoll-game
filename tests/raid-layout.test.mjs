import test from 'node:test';
import assert from 'node:assert/strict';
import { RAID_FLOOR_Y, RAID_STAIR_OPENING, RAID_STAIR_SHAFTS, createSwitchbackStairs, createRaidTraversalStairs } from '../src/game/domain/raidLayout.js';

test('each floor transition has a complete 3.5m switchback stair flight within its shaft', () => {
  const stairs = createRaidTraversalStairs();
  assert.equal(RAID_FLOOR_Y.length, 4);
  assert.equal(RAID_STAIR_SHAFTS.length, 3);
  assert.equal(stairs.length, 36);
  assert.deepEqual(RAID_STAIR_OPENING, { left: 47, right: 53 });
  for (const shaft of RAID_STAIR_SHAFTS) {
    assert.equal(shaft.xLow, RAID_STAIR_OPENING.left, 'every flight must align with the shared opening');
    assert.equal(shaft.xHigh, RAID_STAIR_OPENING.right, 'every flight must align with the shared opening');
    assert.ok(shaft.xStart === shaft.xHigh && shaft.xEnd === shaft.xLow
      || shaft.xStart === shaft.xLow && shaft.xEnd === shaft.xHigh, 'each flight must run between both landing sides');
    const flight = stairs.filter((step) => step.stairId === shaft.id).sort((a, b) => a.stairStep - b.stairStep);
    assert.equal(flight.length, 12, `${shaft.id} must have twelve treads`);
    assert.equal(flight[0].stairStep, 0);
    assert.equal(flight[11].stairStep, 11);
    assert.ok(flight.every((step) => step.x + 1e-9 < shaft.xHigh && step.x - 1e-9 > shaft.xLow));
    assert.ok(flight.every((step) => step.destructible === false && step.type === 'stair'));
    assert.equal(flight[0].x, (shaft.xStart + shaft.xEnd) / 2 + (shaft.xStart - shaft.xEnd) * 11 / 24);
    assert.equal(flight.at(-1).x, (shaft.xStart + shaft.xEnd) / 2 - (shaft.xStart - shaft.xEnd) * 11 / 24);
    for (let i = 1; i < flight.length; i++) {
      const direction = Math.sign(shaft.xEnd - shaft.xStart);
      assert.equal(Math.sign(flight[i].x - flight[i - 1].x), direction, 'treads must follow the flight direction');
      assert.ok(flight[i].y > flight[i - 1].y, 'each tread must be higher than the previous tread');
    }
    const firstTop = flight[0].y + flight[0].h / 2;
    const lastTop = flight[11].y + flight[11].h / 2;
    assert.ok(Math.abs(firstTop - (shaft.lowerTop + 3.5 / 12)) < 1e-9);
    assert.ok(Math.abs(lastTop - (shaft.lowerTop + 3.5)) < 1e-9);
  }
});

test('invalid switchback dimensions fail closed instead of emitting bad physics fixtures', () => {
  assert.deepEqual(createSwitchbackStairs(2, 2, 0, 'bad'), []);
  assert.deepEqual(createSwitchbackStairs(1, 4, 0, 'bad'), []);
  assert.deepEqual(createSwitchbackStairs(4, 1, -1, 'bad'), []);
  assert.deepEqual(createSwitchbackStairs(4, 1, 0, 'bad', 2.5), []);
});
