// Authored traversal geometry for HERO's four-storey raid.
export const RAID_FLOOR_Y = Object.freeze([0, 3.5, 7, 10.5]);
// Every storey shares the same open shaft. Keep slab gaps and physical stair flights aligned.
export const RAID_STAIR_OPENING = Object.freeze({ left: 47, right: 53 });
// The shaft gets a walkable crossing at each storey. Players intentionally enter a flight with
// W+A/D (up) or S+A/D (down); ordinary A/D movement keeps both sides of the floor connected.
export function createRaidStairBridge(centerY) {
  if (!Number.isFinite(centerY)) return null;
  return {
    x: (RAID_STAIR_OPENING.left + RAID_STAIR_OPENING.right) / 2,
    y: centerY,
    w: RAID_STAIR_OPENING.right - RAID_STAIR_OPENING.left,
    h: 0.5,
    type: 'stairBridge',
    stairBridgeId: `stair-crossing-${centerY}`,
    destructible: false,
  };
}
export const RAID_STAIR_STEPS_PER_FLIGHT = 20;
// Keep reinforcements away from the stair shaft and its two landing approaches.
export const RAID_STAIR_NO_SPAWN_ZONE = Object.freeze({
  left: RAID_STAIR_OPENING.left - 2,
  right: RAID_STAIR_OPENING.right + 2,
});
// AI may defend the landing from its edges, but must not camp inside the only vertical route.
export const RAID_STAIR_ACTOR_CLEARANCE = Object.freeze({
  left: RAID_STAIR_OPENING.left - 0.85,
  right: RAID_STAIR_OPENING.right + 0.85,
});

// A few roof set-pieces give the insertion zone cover, a recognizable skyline and short combat beats.
// All pieces sit on the roof surface and deliberately leave the central stair approach x=45..55 open.
export const RAID_ROOF_TACTICAL_COVER = Object.freeze([
  Object.freeze({ x: 12.5, y: 11.08, w: 2.8, h: 1.16, type: 'steel', destructible: false, coverId: 'roof-west-hvac' }),
  Object.freeze({ x: 22.5, y: 11.0, w: 2.0, h: 1.0, type: 'crate', destructible: true, coverId: 'roof-supply-crate' }),
  Object.freeze({ x: 35.5, y: 11.1, w: 2.4, h: 1.2, type: 'concrete', destructible: false, coverId: 'roof-generator' }),
  Object.freeze({ x: 60.0, y: 11.05, w: 2.4, h: 1.1, type: 'crate', destructible: true, coverId: 'roof-ammo-crate' }),
  Object.freeze({ x: 68.0, y: 11.1, w: 2.8, h: 1.2, type: 'steel', destructible: false, coverId: 'roof-east-vent' }),
]);

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Keep living raiders on their own side of the stairwell. If knockback or a bad target puts
// one inside the route, gently drive it toward the nearer landing edge instead of letting it camp.
export function constrainRaidActorVelocity(x, velocityX) {
  if (!Number.isFinite(x) || !Number.isFinite(velocityX)) return 0;
  const { left, right } = RAID_STAIR_ACTOR_CLEARANCE;
  if (x < left && velocityX > 0) return 0;
  if (x > right && velocityX < 0) return 0;
  if (x >= left && x <= right) {
    const midpoint = (left + right) / 2;
    const escapeDirection = x < midpoint ? -1 : 1;
    return escapeDirection * Math.max(Math.abs(velocityX), 1.15);
  }
  return velocityX;
}

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
    xStart,
    xEnd,
    lowerTop,
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
