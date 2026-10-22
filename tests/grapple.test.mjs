import test from 'node:test';
import assert from 'node:assert/strict';
import { findGrappleAnchor, GRAPPLE_MAX_RANGE } from '../src/game/systems/grapple.js';

test('grapple latches to the first solid surface along the cursor ray', () => {
  const origin = { x: 0, y: 0 };
  const target = { x: 10, y: 0 };
  const farWall = { x: 8, y: 0, w: 0.5, h: 4, type: 'wall' };
  const nearWall = { x: 4, y: 0, w: 1, h: 3, type: 'wall' };
  const hit = findGrappleAnchor(origin, target, [farWall, nearWall]);
  assert.ok(hit);
  assert.equal(hit.rect, nearWall);
  assert.ok(Math.abs(hit.distance - 3.5) < 1e-9);
  assert.ok(hit.x < 3.5 && hit.x > 3.3);
});

test('grapple ignores lamps and open doors, but attaches to structural terrain', () => {
  const origin = { x: 0, y: 0 }, target = { x: 10, y: 0 };
  const lamp = { x: 2, y: 0, w: 0.8, h: 0.2, type: 'lamp' };
  const openDoor = { x: 4, y: 0, w: 0.3, h: 3, type: 'door', doorOpen: true };
  const wall = { x: 7, y: 0, w: 0.4, h: 3, type: 'wall' };
  assert.equal(findGrappleAnchor(origin, target, [lamp, openDoor, wall])?.rect, wall);
});

test('grapple refuses targets without reachable geometry or outside its range', () => {
  assert.equal(GRAPPLE_MAX_RANGE, 16);
  assert.equal(findGrappleAnchor({ x: 0, y: 0 }, { x: 8, y: 0 }, []), null);
  const farWall = { x: 20, y: 0, w: 1, h: 4, type: 'wall' };
  assert.equal(findGrappleAnchor({ x: 0, y: 0 }, { x: 24, y: 0 }, [farWall]), null);
  const nearWall = { x: 0.3, y: 0, w: 0.1, h: 3, type: 'wall' };
  assert.equal(findGrappleAnchor({ x: 0, y: 0 }, { x: 8, y: 0 }, [nearWall]), null);
});
