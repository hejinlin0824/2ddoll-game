// Authored traversal geometry for HERO's four-storey raid.
export const RAID_FLOOR_Y = Object.freeze([0, 3.5, 7, 10.5]);
// Every storey shares the same open shaft. Keep slab gaps and physical stair flights aligned.
export const RAID_STAIR_OPENING = Object.freeze({ left: 47, right: 53 });
export const RAID_STAIR_SHAFTS = Object.freeze([
  Object.freeze({ id: 'stair-ground-level02', xHigh: RAID_STAIR_OPENING.right, xLow: RAID_STAIR_OPENING.left, lowerTop: 0 }),
  Object.freeze({ id: 'stair-level02-level03', xHigh: RAID_STAIR_OPENING.right, xLow: RAID_STAIR_OPENING.left, lowerTop: 3.5 }),
  Object.freeze({ id: 'stair-level03-roof', xHigh: RAID_STAIR_OPENING.right, xLow: RAID_STAIR_OPENING.left, lowerTop: 7 }),
]);

export function createSwitchbackStairs(xHigh, xLow, lowerTop, id, steps = 12) {
  if (![xHigh, xLow, lowerTop, steps].every(Number.isFinite) || xHigh <= xLow || lowerTop < 0 || steps < 2) return [];
  const run = xHigh - xLow;
  const pitch = run / steps;
  const rise = 3.5 / steps;
  return Array.from({ length: Math.floor(steps) }, (_, i) => {
    const top = lowerTop + (i + 1) * rise;
    return {
      x: xHigh - (i + 0.5) * pitch,
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
  return RAID_STAIR_SHAFTS.flatMap(({ id, xHigh, xLow, lowerTop }) =>
    createSwitchbackStairs(xHigh, xLow, lowerTop, id));
}
