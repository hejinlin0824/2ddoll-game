import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EQUIPMENT_COORDINATE_SPACE,
  equipmentPartCenter,
  equipmentPartToStudio,
  equipmentPartToStorage,
} from '../src/game/domain/equipmentGeometry.js';

test('legacy raster parts keep their historically saved center pivot', () => {
  const part = { img: 'helmet-art', x: 4, y: -9, w: 76, h: 40 };
  assert.deepEqual(equipmentPartCenter({}, part), { x: 4, y: -9 });
  assert.deepEqual(equipmentPartToStudio({}, part), part);
});

test('legacy rectangle parts keep top-left coordinates', () => {
  const part = { color: '#ffb14a', x: -38, y: -20, w: 76, h: 40 };
  assert.deepEqual(equipmentPartCenter({}, part), { x: 0, y: 0 });
});

test('new schema stores top-left but reconstructs the same visual center', () => {
  const studioItem = { id: 'helmet-art', x: 13.5, y: -7.25, w: 31, h: 19, rot: 17, crop: { sx: 2, sy: 3, sw: 40, sh: 20 } };
  const savedPart = equipmentPartToStorage(studioItem);
  const equipment = { coordinateSpace: EQUIPMENT_COORDINATE_SPACE, parts: [savedPart] };

  assert.equal(savedPart.x, -2);
  assert.equal(savedPart.y, -16.75);
  assert.deepEqual(equipmentPartCenter(equipment, savedPart), { x: studioItem.x, y: studioItem.y });
  assert.deepEqual(equipmentPartToStudio(equipment, savedPart), studioItem);
});

test('old equipment can be opened and re-saved without a visual jump', () => {
  const legacy = { slot: 'head', meterScale: 200, parts: [
    { img: 'asset', x: 0, y: 0, w: 76, h: 40, rot: 0 },
  ] };
  const edited = equipmentPartToStudio(legacy, legacy.parts[0]);
  const nextPart = equipmentPartToStorage(edited);
  const next = { ...legacy, coordinateSpace: EQUIPMENT_COORDINATE_SPACE, parts: [nextPart] };

  assert.deepEqual(equipmentPartCenter(legacy, legacy.parts[0]), { x: 0, y: 0 });
  assert.deepEqual(equipmentPartCenter(next, next.parts[0]), { x: 0, y: 0 });
});

test('center pivot is independent from rotation and remains finite', () => {
  const part = { img: 'asset', x: 1e4, y: -1e4, w: 23, h: 51, rot: 89 };
  const pivot = equipmentPartCenter({}, part);
  assert.ok(Number.isFinite(pivot.x) && Number.isFinite(pivot.y));
  assert.deepEqual(pivot, { x: 1e4, y: -1e4 });
});
