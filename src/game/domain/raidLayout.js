// Authored traversal geometry for HERO's four-storey raid.
export const RAID_FLOOR_Y = Object.freeze([0, 3.5, 7, 10.5]);
export const RAID_STAIR_SHAFTS = Object.freeze([
  Object.freeze({ id: 'stair-ground-level02', xHigh: 52, xLow: 48, lowerTop: 0 }),
  Object.freeze({ id: 'stair-level02-level03', xHigh: 32, xLow: 28, lowerTop: 3.5 }),
  Object.freeze({ id: 'stair-level03-roof', xHigh: 18, xLow: 14, lowerTop: 7 }),
]);

export function createSwitchbackStairs(xHigh, xLow, lowerTop, id, steps = 7) {
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
