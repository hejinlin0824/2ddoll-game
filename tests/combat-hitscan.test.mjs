import test from 'node:test';
import assert from 'node:assert/strict';
// The level module reads browser storage at import time; provide an isolated test store before loading combat.
const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
globalThis.Image = class TestImage {
  set src(value) { this._src = value; }
  get src() { return this._src; }
};
const { applyHitscanDamage } = await import('../src/game/systems/combat.js');

function makeEnemy(x, zone) {
  const hits = [];
  return {
    x, y: 0, radius: 0.4, alive: true,
    zoneAt: () => zone,
    hit: (hitZone, damage, dir, armorMul) => {
      hits.push({ zone: hitZone, damage, dir, armorMul });
      return { broke: null, absorbed: true };
    },
    hits,
  };
}

function context(enemies) {
  return {
    enemies,
    player: {
      lifestealPct: 0,
      torso: { getPosition: () => ({ x: 0, y: 0 }) },
    },
    pstate: { hp: 30, maxHp: 30 },
    particles: [],
  };
}

test('hitscan calls the shared damage contract with zone multipliers, target order, and falloff', () => {
  const head = makeEnemy(3, 'head');
  const body = makeEnemy(6, 'body');
  const behindRange = makeEnemy(30, 'body');
  const C = context([body, behindRange, head]);

  applyHitscanDamage(C, {
    x: 0, y: 0,
    parts: [{ dx: 1, dy: 0, damage: 10 }],
    stats: { range: 20, armorDmgMul: 1.5, falloff: 0.5 },
  }, 20);

  assert.equal(head.hits.length, 1);
  assert.deepEqual(head.hits[0], {
    zone: 'head',
    damage: 20,
    dir: { x: 1, y: 0 },
    armorMul: 1.5,
  });
  assert.equal(body.hits.length, 1);
  assert.deepEqual(body.hits[0], {
    zone: 'body',
    damage: 5,
    dir: { x: 1, y: 0 },
    armorMul: 1.5,
  });
  assert.equal(behindRange.hits.length, 0, 'targets beyond the hitscan range must not be hit');
});

test('hitscan ignores dead enemies and targets behind the muzzle', () => {
  const dead = makeEnemy(2, 'body');
  dead.alive = false;
  const behind = makeEnemy(-2, 'body');
  const C = context([dead, behind]);

  applyHitscanDamage(C, {
    x: 0, y: 0,
    parts: [{ dx: 1, dy: 0, damage: 12 }],
    stats: { range: 20, armorDmgMul: 1, falloff: 0.55 },
  }, 20);

  assert.equal(dead.hits.length, 0);
  assert.equal(behind.hits.length, 0);
});
