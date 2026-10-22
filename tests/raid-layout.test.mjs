import test from 'node:test';
import assert from 'node:assert/strict';
import { RAID_FLOOR_Y, RAID_STAIR_SHAFTS, createSwitchbackStairs, createRaidTraversalStairs } from '../src/game/domain/raidLayout.js';

test('each floor transition has a complete 3.5m switchback stair flight within its shaft', () => {
  const stairs = createRaidTraversalStairs();
  assert.equal(RAID_FLOOR_Y.length, 4);
  assert.equal(RAID_STAIR_SHAFTS.length, 3);
  assert.equal(stairs.length, 21);
  for (const shaft of RAID_STAIR_SHAFTS) {
    const flight = stairs.filter((step) => step.stairId === shaft.id).sort((a, b) => a.stairStep - b.stairStep);
    assert.equal(flight.length, 7, `${shaft.id} must have seven treads`);
    assert.equal(flight[0].stairStep, 0);
    assert.equal(flight[6].stairStep, 6);
    assert.ok(flight.every((step) => step.x + 1e-9 < shaft.xHigh && step.x - 1e-9 > shaft.xLow));
    assert.ok(flight.every((step) => step.destructible === false && step.type === 'stair'));
    for (let i = 1; i < flight.length; i++) {
      assert.ok(flight[i].x < flight[i - 1].x, 'ascending path should move left through the shaft');
      assert.ok(flight[i].y > flight[i - 1].y, 'each tread must be higher than the previous tread');
    }
    const firstTop = flight[0].y + flight[0].h / 2;
    const lastTop = flight[6].y + flight[6].h / 2;
    assert.ok(Math.abs(firstTop - (shaft.lowerTop + 0.5)) < 1e-9);
    assert.ok(Math.abs(lastTop - (shaft.lowerTop + 3.5)) < 1e-9);
  }
});

test('invalid switchback dimensions fail closed instead of emitting bad physics fixtures', () => {
  assert.deepEqual(createSwitchbackStairs(2, 2, 0, 'bad'), []);
  assert.deepEqual(createSwitchbackStairs(1, 4, 0, 'bad'), []);
  assert.deepEqual(createSwitchbackStairs(4, 1, -1, 'bad'), []);
});
