import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAID_FLOOR_HEIGHT,
  RAID_FLOOR_COUNT,
  raidFloorBand,
  rectIntersectsRaidFloor,
  raidVisionProfile,
  isInRaidVisionCone,
} from '../src/game/domain/raidVisibility.js';

test('raid floor bands are finite, adjacent, and non-overlapping', () => {
  assert.equal(RAID_FLOOR_HEIGHT, 3.5);
  assert.equal(RAID_FLOOR_COUNT, 4);
  for (let id = 0; id < RAID_FLOOR_COUNT; id++) {
    const band = raidFloorBand(id);
    assert.equal(band.minY, id * 3.5);
    assert.equal(band.maxY, (id + 1) * 3.5);
  }
  assert.equal(raidFloorBand(1).maxY, raidFloorBand(2).minY);
});

test('floor clipping keeps short partitions local but tall outer walls block every intersected floor', () => {
  const secondFloorPartition = { y: 4.825, h: 2.65 };
  const outerWall = { y: 5.25, h: 10.5 };
  assert.equal(rectIntersectsRaidFloor(secondFloorPartition, 1), true);
  assert.equal(rectIntersectsRaidFloor(secondFloorPartition, 0), false);
  assert.equal(rectIntersectsRaidFloor(outerWall, 0), true);
  assert.equal(rectIntersectsRaidFloor(outerWall, 2), true);
  assert.equal(rectIntersectsRaidFloor(outerWall, 3), false);
});

test('vision range uses the same illumination and crouch multipliers for AI and its overlay', () => {
  const dark = raidVisionProfile({ sightRange: 10, illumination: 0 });
  const bright = raidVisionProfile({ sightRange: 10, illumination: 1 });
  const crouched = raidVisionProfile({ sightRange: 10, illumination: 1, crouch: true });
  assert.ok(bright.range > dark.range);
  assert.ok(Math.abs(crouched.range - bright.range * 0.62) < 1e-9);
  assert.ok(raidVisionProfile({ suspicious: true }).halfAngle > raidVisionProfile().halfAngle);
});

test('vision cone is symmetric for left/right facing and rejects targets behind the guard', () => {
  const halfAngle = 0.42;
  assert.equal(isInRaidVisionCone(5, 1, 1, halfAngle), true);
  assert.equal(isInRaidVisionCone(5, 1, -1, halfAngle), false);
  assert.equal(isInRaidVisionCone(-5, 1, -1, halfAngle), true);
  assert.equal(isInRaidVisionCone(-5, 1, 1, halfAngle), false);
  assert.equal(isInRaidVisionCone(5, 5, 1, halfAngle), false);
});
