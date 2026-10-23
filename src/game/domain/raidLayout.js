// Authored traversal geometry for HERO's four-storey raid.
export const RAID_FLOOR_Y = Object.freeze([0, 3.5, 7, 10.5]);
// Every storey shares the same open shaft. Keep slab gaps and physical stair flights aligned.
export const RAID_STAIR_OPENING = Object.freeze({ left: 47, right: 53 });
export const RAID_STAIR_SHAFTS = Object.freeze([
  Object.freeze({ id: 'stair-ground-level02', xLow: RAID_STAIR_OPENING.left, xHigh: RAID_STAIR_OPENING.right, xStart: RAID_STAIR_OPENING.right, xEnd: RAID_STAIR_OPENING.left, lowerTop: 0 }),
  Object.freeze({ id: 'stair-level02-level03', xLow: RAID_STAIR_OPENING.left, xHigh: RAID_STAIR_OPENING.right, xStart: RAID_STAIR_OPENING.left, xEnd: RAID_STAIR_OPENING.right, lowerTop: 3.5 }),
  Object.freeze({ id: 'stair-level03-roof', xLow: RAID_STAIR_OPENING.left, xHigh: RAID_STAIR_OPENING.right, xStart: RAID_STAIR_OPENING.right, xEnd: RAID_STAIR_OPENING.left, lowerTop: 7 }),
]);

export function createSwitchbackStairs(xStart, xEnd, lowerTop, id, steps = 12) {
  if (![xStart, xEnd, lowerTop, steps].every(Number.isFinite)
      || xStart === xEnd || lowerTop < 0 || !Number.isInteger(steps) || steps < 2) return [];
  const run = xEnd - xStart;
  const pitch = Math.abs(run) / steps;
  const rise = 3.5 / steps;
  return Array.from({ length: steps }, (_, i) => {
    const top = lowerTop + (i + 1) * rise;
    return {
      x: xStart + (i + 0.5) * (run / steps),
      y: top - 0.08,
      w: pitch + 0.08,
      h: 0.16,
      type: 'stair',
      stairId: id,
      stairStep: i,
      destructible: false,
    };
  });
}

export function createRaidTraversalStairs() {
  return RAID_STAIR_SHAFTS.flatMap(({ id, xStart, xEnd, lowerTop }) =>
    createSwitchbackStairs(xStart, xEnd, lowerTop, id));
}
