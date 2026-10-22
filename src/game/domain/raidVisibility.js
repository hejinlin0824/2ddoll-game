// Shared geometry and perception contract for the multi-storey raid level.
// Keep light clipping, enemy AI and the cone overlay on the same floor/vision model.
export const RAID_FLOOR_HEIGHT = 3.5;
export const RAID_FLOOR_COUNT = 4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function raidFloorBand(floorId) {
  const raw = Number.isInteger(floorId) ? floorId : 0;
  const id = clamp(raw, 0, RAID_FLOOR_COUNT - 1);
  return {
    id,
    minY: id * RAID_FLOOR_HEIGHT,
    maxY: (id + 1) * RAID_FLOOR_HEIGHT,
  };
}

export function rectIntersectsRaidFloor(rect, floorId, pad = 0.01) {
  if (!rect || !Number.isFinite(rect.y) || !Number.isFinite(rect.h)) return false;
  const band = raidFloorBand(floorId);
  const bottom = rect.y - Math.max(0, rect.h) / 2;
  const top = rect.y + Math.max(0, rect.h) / 2;
  // Mere contact with a floor boundary is not overlap; this prevents floor-edge walls leaking across stories.
  return top > band.minY + pad && bottom < band.maxY - pad;
}

export function raidVisionProfile({
  sightRange = 10.5,
  suspicious = false,
  crouch = false,
  illumination = 0.5,
} = {}) {
  const range0 = Number.isFinite(sightRange) && sightRange > 0 ? sightRange : 10.5;
  const light = clamp(Number.isFinite(illumination) ? illumination : 0.5, 0, 1);
  return {
    // Match raid.js: darker targets are harder to detect; crouching reduces range.
    range: range0 * (0.58 + light * 0.52) * (crouch ? 0.62 : 1),
    // Half-angles are shared by AI perception and the player-facing hint overlay.
    halfAngle: suspicious ? 0.54 : 0.42,
  };
}

export function isInRaidVisionCone(dx, dy, facing, halfAngle) {
  if (![dx, dy, facing, halfAngle].every(Number.isFinite)) return false;
  const forward = dx * (facing >= 0 ? 1 : -1);
  if (forward <= 0) return false;
  return Math.atan2(Math.abs(dy), forward) <= Math.max(0, halfAngle);
}
