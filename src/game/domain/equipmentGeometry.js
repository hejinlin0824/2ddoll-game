// Shared coordinate contract for equipment images placed in the equipment studio.
// Legacy image parts stored x/y as their CENTER. Rectangle parts have always used top-left.
// New equipment payloads declare coordinateSpace='top-left-v2' and store every part top-left.
export const EQUIPMENT_COORDINATE_SPACE = 'top-left-v2';

/** Canvas/game transform pivot for a persisted equipment part. */
export function equipmentPartCenter(equipment, part) {
  const x = Number(part?.x) || 0;
  const y = Number(part?.y) || 0;
  const w = Number(part?.w) || 0;
  const h = Number(part?.h) || 0;

  // Backward compatibility: the old raster equipment studio serialized image x/y as centers,
  // while the game renderer historically treated all x/y as top-left. Keep old images centered.
  if (part?.img && equipment?.coordinateSpace !== EQUIPMENT_COORDINATE_SPACE) {
    return { x, y };
  }
  return { x: x + w / 2, y: y + h / 2 };
}

/** Convert a persisted part to the center-based editing model used by studio.js. */
export function equipmentPartToStudio(equipment, part) {
  const center = equipmentPartCenter(equipment, part);
  return { ...part, x: center.x, y: center.y };
}

/** Convert a center-based studio item to the game's canonical top-left serialization. */
export function equipmentPartToStorage(part) {
  const w = Number(part?.w) || 0;
  const h = Number(part?.h) || 0;
  return { ...part, x: (Number(part?.x) || 0) - w / 2, y: (Number(part?.y) || 0) - h / 2 };
}
