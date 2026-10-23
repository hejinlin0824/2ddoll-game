import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AFFIXES,
  AFFIX_BY_ID,
  tierOf,
  rollAffixes,
  computeGunMods,
  computeArmorMods,
  absorbAffix,
} from '../src/game/domain/affixes.js';

test('rolled affixes are applicable, implemented, in-tier, and never duplicate a stat', () => {
  for (const kind of ['gun', 'head', 'body']) {
    for (const quality of ['normal', 'fine', 'epic']) {
      const tier = tierOf(quality);
      for (let i = 0; i < 120; i++) {
        const rolled = rollAffixes(kind, quality);
        assert.equal(rolled.length, 2, `expected a complete affix pair for ${kind}/${quality}`);
        const defs = rolled.map((affix) => AFFIX_BY_ID[affix.id]);
        assert.ok(defs.every((def) => def && !def.future && def.applies.includes(kind)));
        assert.notEqual(defs[0].stat, defs[1].stat, 'a rolled pair must not duplicate a stat');
        for (let j = 0; j < rolled.length; j++) {
          const [min, max] = defs[j].tiers[tier];
          assert.ok(rolled[j].v >= min && rolled[j].v <= max,
            `${rolled[j].id}=${rolled[j].v} outside tier ${tier} [${min}, ${max}]`);
        }
      }
    }
  }
  assert.equal(AFFIXES.filter((a) => !a.future).length, 34);
});

test('gun reduction affixes reduce spread, reload time, and heat with a safe lower bound', () => {
  const mods = computeGunMods([
    { id: 'precise', v: 25 },
    { id: 'quickload', v: 35 },
    { id: 'tempered', v: 150 },
  ]);
  assert.equal(mods.spreadMul, 0.75);
  assert.equal(mods.reloadMul, 0.65);
  assert.equal(mods.heatMul, 0.2);
});

test('all implemented gun-affix consumers are aggregated', () => {
  const mods = computeGunMods([
    { id: 'deadly', v: 20 },
    { id: 'swiftgun', v: 15 },
    { id: 'expansive', v: 4 },
    { id: 'farreach', v: 30 },
    { id: 'apround', v: 40 },
    { id: 'vampiric', v: 3 },
    { id: 'might', v: 25 },
    { id: 'vengeance', v: 18 },
    { id: 'hunter', v: 8 },
    { id: 'greedy', v: 12 },
  ]);
  assert.equal(mods.dmgMul, 1.2);
  assert.equal(mods.rpmMul, 1.15);
  assert.equal(mods.magFlat, 4);
  assert.equal(mods.rangeMul, 1.3);
  assert.equal(mods.armorDmgMul, 1.4);
  assert.equal(mods.lifesteal, 3);
  assert.equal(mods.meleeDmgPct, 25);
  assert.equal(mods.lowHpDmgPct, 18);
  assert.equal(mods.dropRatePct, 8);
  assert.equal(mods.coinGainPct, 12);
});

test('armor affixes keep slot-specific durability separate and aggregate survivability effects', () => {
  const affixes = [
    { id: 'durable', v: 10 },
    { id: 'aegis', v: 20 },
    { id: 'headguard', v: 5 },
    { id: 'ironwall', v: 7 },
    { id: 'vampiric', v: 2 },
    { id: 'hunter', v: 4 },
    { id: 'greedy', v: 6 },
    { id: 'might', v: 15 },
    { id: 'vengeance', v: 12 },
  ];
  const head = computeArmorMods('head', affixes);
  const body = computeArmorMods('body', affixes);
  assert.equal(head.durPct, 35);
  assert.equal(body.durPct, 10);
  assert.equal(body.defenseFlat, 7);
  assert.equal(body.lifesteal, 2);
  assert.equal(body.dropRatePct, 4);
  assert.equal(body.coinGainPct, 6);
  assert.equal(body.meleeDmgPct, 15);
  assert.equal(body.lowHpDmgPct, 12);
});

test('affix absorption merges same-stat values, appends new stats up to cap, and never mutates input', () => {
  const original = [{ id: 'deadly', v: 10 }];
  const merged = absorbAffix(original, { id: 'tungsten', v: 7 }, 2);
  assert.deepEqual(original, [{ id: 'deadly', v: 10 }]);
  assert.deepEqual(merged, [{ id: 'deadly', v: 10 }, { id: 'tungsten', v: 7 }]);

  const stacked = absorbAffix(merged, { id: 'swiftgun', v: 4 }, 2);
  assert.deepEqual(stacked, [
    { id: 'deadly', v: 10 },
    { id: 'tungsten', v: 7 },
  ]);
  const stackedSameStat = absorbAffix(merged, { id: 'precise', v: 5 }, 2);
  assert.deepEqual(stackedSameStat, [
    { id: 'deadly', v: 10 },
    { id: 'tungsten', v: 7 },
  ]);
  const capList = [{ id: 'deadly', v: 10 }, { id: 'swiftgun', v: 5 }];
  assert.equal(absorbAffix(capList, { id: 'expansive', v: 3 }, 2), null);
  assert.equal(absorbAffix(original, { id: 'not-a-real-affix', v: 99 }, 2).length, 1);
});
