// Authored traversal geometry for HERO's four-storey raid.
export const RAID_FLOOR_Y = Object.freeze([0, 3.5, 7, 10.5]);
// Every storey shares the same open shaft. Keep slab gaps and physical stair flights aligned.
export const RAID_STAIR_OPENING = Object.freeze({ left: 47, right: 53 });
export const RAID_STAIR_STEPS_PER_FLIGHT = 20;
// Keep reinforcements away from the stair shaft and its two landing approaches.
export const RAID_STAIR_NO_SPAWN_ZONE = Object.freeze({
  left: RAID_STAIR_OPENING.left - 2,
  right: RAID_STAIR_OPENING.right + 2,
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function keepRaidSpawnOutOfStairwell(candidateX, callerX, bounds = {}) {
  const low = Number.isFinite(bounds.left) ? bounds.left : 2.1;
  const high = Number.isFinite(bounds.right) ? bounds.right : 71.9;
  if (low > high) return low;
  if (!Number.isFinite(candidateX)) return clamp(2.1, low, high);
  const x = clamp(candidateX, low, high);
  if (x < RAID_STAIR_NO_SPAWN_ZONE.left || x > RAID_STAIR_NO_SPAWN_ZONE.right) return x;
  const callerSide = Number.isFinite(callerX) ? callerX : RAID_STAIR_OPENING.left;
  const landingX = callerSide < (RAID_STAIR_OPENING.left + RAID_STAIR_OPENING.right) / 2
    ? RAID_STAIR_NO_SPAWN_ZONE.left - 0.5
    : RAID_STAIR_NO_SPAWN_ZONE.right + 0.5;
  return clamp(landingX, low, high);
}

export const RAID_STAIR_SHAFTS = Object.freeze([
  Object.freeze({ id: 'stair-ground-level02', xLow: RAID_STAIR_OPENING.left, xHigh: RAID_STAIR_OPENING.right, xStart: RAID_STAIR_OPENING.right, xEnd: RAID_STAIR_OPENING.left, lowerTop: 0 }),
  Object.freeze({ id: 'stair-level02-level03', xLow: RAID_STAIR_OPENING.left, xHigh: RAID_STAIR_OPENING.right, xStart: RAID_STAIR_OPENING.left, xEnd: RAID_STAIR_OPENING.right, lowerTop: 3.5 }),
  Object.freeze({ id: 'stair-level03-roof', xLow: RAID_STAIR_OPENING.left, xHigh: RAID_STAIR_OPENING.right, xStart: RAID_STAIR_OPENING.right, xEnd: RAID_STAIR_OPENING.left, lowerTop: 7 }),
]);

export function createSwitchbackStairs(xStart, xEnd, lowerTop, id, steps = RAID_STAIR_STEPS_PER_FLIGHT) {
  if (![xStart, xEnd, lowerTop, steps].every(Number.isFinite)
      || xStart === xEnd || lowerTop < 0 || !Number.isInteger(steps) || steps < 2) return [];
  const run = xEnd - xStart;
  const pitch = Math.abs(run) / steps;
  const rise = 3.5 / steps;
  // Smaller, slightly overlapping treads reduce the tall lips that snag the capsule collider.
  const h = Math.min(0.2, rise * 1.08);
  const overlap = Math.min(0.08, pitch * 0.24);
  return Array.from({ length: steps }, (_, i) => {
    const top = lowerTop + (i + 1) * rise;
    return {
      x: xStart + (i + 0.5) * (run / steps),
      y: top - h / 2,
      w: pitch + overlap,
      h,
      type: 'stair',
      stairId: id,
      stairStep: i,
      destructible: false,
      collision: false,
    };
  });
}

export function createSwitchbackRamp(xStart, xEnd, lowerTop, id) {
  if (![xStart, xEnd, lowerTop].every(Number.isFinite)
      || xStart === xEnd || lowerTop < 0) return null;
  const rise = 3.5;
  const run = Math.abs(xEnd - xStart);
  const length = Math.hypot(run, rise);
  const angle = Math.atan2(Math.sign(xEnd - xStart) * rise, run);
  const thickness = 0.24;
  // Position the rotated box so its upper edge exactly joins the lower and upper floor edges.
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);
  return {
    x: (xStart + xEnd) / 2 - normalX * thickness / 2,
    y: lowerTop + rise / 2 - normalY * thickness / 2,
    w: length,
    h: thickness,
    angle,
    type: 'stairRamp',
    stairRampId: id,
    collisionOnly: true,
    destructible: false,
  };
}

export function createRaidTraversalStairs() {
  return RAID_STAIR_SHAFTS.flatMap(({ id, xStart, xEnd, lowerTop }) => [
    createSwitchbackRamp(xStart, xEnd, lowerTop, id),
    ...createSwitchbackStairs(xStart, xEnd, lowerTop, id, RAID_STAIR_STEPS_PER_FLIGHT),
  ]);
}
