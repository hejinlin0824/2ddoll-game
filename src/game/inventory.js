// 背包与经济:金币 + 装备实例(品质/耐久/词缀),穿戴绑定,修复/升级/合成/锻造。
// 存档 'contra-inv' = { coins, items: [{id, slot, quality, dur, maxDur, equipped, affixes}] }
// 装备 = 消耗品:碎了不清空存档,留在背包里等修复。
// 词条领域(词缀定义/掷取/聚合)在 affixes.js —— 本层只管实例与持久化。
import { rollAffixes, AFFIX_BY_ID } from './affixes.js';
const KEY = 'contra-inv';
export const QUALITY_ORDER = ['broken', 'normal', 'fine', 'rare', 'epic', 'legendary'];
let seq = Date.now() % 100000;

let inv = null;

export function invLoad() {
  if (inv) return inv;
  try {
    inv = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch { inv = null; }
  if (!inv || !Array.isArray(inv.items)) {
    // 出厂:金币 30,普通头盔+背心已装备
    inv = {
      coins: 30,
      items: [
        { id: 'i1', slot: 'head', quality: 'normal', dur: ARMOR_DUR().head, maxDur: ARMOR_DUR().head, equipped: true },
        { id: 'i2', slot: 'body', quality: 'normal', dur: ARMOR_DUR().body, maxDur: ARMOR_DUR().body, equipped: true },
      ],
    };
    invSave();
  }
  return inv;
}

function ARMOR_DUR() { return { head: 12, body: 24 }; }

export function invSave() {
  try { localStorage.setItem(KEY, JSON.stringify(inv)); } catch { /* 忽略 */ }
}

export function invGet() { return invLoad(); }

export function invAddCoins(n) {
  invLoad();
  inv.coins = Math.max(0, inv.coins + n);
  invSave();
}
export function invCoins() { return invLoad().coins; }
export function invSpend(n) {
  invLoad();
  if (inv.coins < n) return false;
  inv.coins -= n;
  invSave();
  return true;
}

// 新装备实例(掉落/奖励用);dur 默认满,可传 0(敌人掉落的破损件)
// 掷两条词缀(1 前缀 + 1 后缀),耐久上限吃"全耐久/护甲耐久"词条加成
export function invAddItem(slot, quality, dur) {
  invLoad();
  const q = quality;
  const base = slot === 'head' ? 12 : 24;
  // 品质倍率
  const mul = { broken: 0.5, normal: 1, fine: 1.3, rare: 1.6, epic: 2, legendary: 2.6 }[q] ?? 1;
  const affixes = rollAffixes(slot, q);
  const durPct = affixes.reduce((t, a) => {
    const def = AFFIX_BY_ID[a.id];
    return def && (def.stat === 'allDurPct' || (slot === 'head' && def.stat === 'helmetDurPct') || (slot === 'body' && def.stat === 'armorDurPct')) ? t + a.v : t;
  }, 0);
  const maxDur = Math.round(base * mul * (1 + durPct / 100) * 10) / 10;
  const it = { id: 'i' + (seq++).toString(36) + Math.floor(Math.random() * 999).toString(36), slot, quality: q, dur: dur ?? maxDur, maxDur, equipped: false, affixes };
  inv.items.push(it);
  invSave();
  return it;
}

export function invItem(id) {
  invLoad();
  return inv.items.find((it) => it.id === id) || null;
}

export function invEquipped(slot) {
  invLoad();
  return inv.items.find((it) => it.equipped && it.slot === slot) || null;
}

export function invSetEquipped(id, on) {
  invLoad();
  const it = inv.items.find((x) => x.id === id);
  if (!it) return;
  if (on) for (const x of inv.items) if (x.slot === it.slot) x.equipped = false; // 同槽互斥
  it.equipped = on;
  invSave();
}

// 修复:1 金币 / 1 点耐久
export function invRepairCost(id) {
  invLoad();
  const it = invItem(id);
  return it ? Math.ceil((it.maxDur - it.dur) * 1) : 0;
}
export function invRepair(id) {
  invLoad();
  const cost = invRepairCost(id);
  if (cost <= 0) return { ok: false, msg: '无需修复' };
  if (!invSpend(cost)) return { ok: false, msg: '金币不足' };
  const it = invItem(id);
  it.dur = it.maxDur;
  invSave();
  return { ok: true, msg: `已修复,花费 ${cost} 金币` };
}

// 升级品质:下一档,费用按档位;耐久上限按新品质倍率放大,当前耐久等比跟随
// 强化概率制:普通→优良 99%,优良→稀有 80%,稀有→高级 70%,高级→传说 8%;失败吞金
export const UPGRADE_COST = { broken: 10, normal: 15, fine: 25, rare: 40, epic: 60 };
export const UPGRADE_RATE = { normal: 0.99, fine: 0.8, rare: 0.7, epic: 0.08 };
export function invUpgradeCost(quality) {
  return UPGRADE_COST[quality] ?? undefined;
}
export function invUpgradeRate(quality) {
  return UPGRADE_RATE[quality] ?? undefined;
}

export function invUpgrade(id) {
  invLoad();
  const it = invItem(id);
  if (!it) return { ok: false, msg: '不存在' };
  const i = QUALITY_ORDER.indexOf(it.quality);
  if (i < 0 || i >= QUALITY_ORDER.length - 1) return { ok: false, msg: '已是最高品质' };
  const cost = UPGRADE_COST[it.quality] ?? 20;
  if (!invSpend(cost)) return { ok: false, msg: '金币不足' };
  // 概率判定:失败吞金不退
  if (Math.random() > (UPGRADE_RATE[QUALITY_ORDER[i]] ?? 1)) {
    return { ok: false, msg: `强化失败…(${cost} 金币已消耗)` };
  }
  const mul = { broken: 0.5, normal: 1, fine: 1.3, rare: 1.6, epic: 2, legendary: 2.6 };
  const cur = mul[it.quality] ?? 1, nxt = mul[QUALITY_ORDER[i + 1]] ?? 1;
  it.maxDur = Math.round(it.maxDur / cur * nxt * 10) / 10;
  it.dur = Math.min(it.maxDur, Math.round(it.dur / cur * nxt * 10) / 10);
  it.quality = QUALITY_ORDER[i + 1];
  invSave();
  return { ok: true, msg: `强化成功!已升级为 ${it.quality}` };
}

// 合成:3 件同槽位同品质 → 1 件下一档品质(耐久取三件中最高上限)
export function invCombine(ids) {
  invLoad();
  if (!ids || ids.length !== 3) return { ok: false, msg: '需要 3 件同槽位同品质' };
  const its = ids.map((x) => invItem(x));
  if (its.some((it) => !it)) return { ok: false, msg: '素材不存在' };
  const [a, b, c] = its;
  if (a.slot !== b.slot || b.slot !== c.slot || a.quality !== b.quality || b.quality !== c.quality) {
    return { ok: false, msg: '三件必须同槽位同品质' };
  }
  const i = QUALITY_ORDER.indexOf(a.quality);
  if (i < 0 || i >= QUALITY_ORDER.length - 1) return { ok: false, msg: '已是最高品质' };
  const mul = { broken: 0.5, normal: 1, fine: 1.3, rare: 1.6, epic: 2, legendary: 2.6 };
  const nxtQ = QUALITY_ORDER[i + 1];
  const nxtMul = mul[nxtQ] ?? 1;
  const base = a.slot === 'head' ? 12 : 24;
  const maxDur = Math.round(base * nxtMul * 10) / 10;
  inv.items = inv.items.filter((x) => !ids.includes(x.id));
  const it = { id: 'i' + (seq++).toString(36) + Math.floor(Math.random() * 999).toString(36), slot: a.slot, quality: nxtQ, dur: maxDur, maxDur, equipped: false };
  inv.items.push(it);
  invSave();
  return { ok: true, msg: `合成 ${nxtQ} ${it.slot === 'head' ? '头盔' : '防弹衣'}`, item: it };
}

// 锻造:耐久上限 +50%(可重复),费用 25
export function invForge(id) {
  invLoad();
  const it = invItem(id);
  if (!it) return { ok: false, msg: '不存在' };
  if (!invSpend(25)) return { ok: false, msg: '金币不足' };
  it.maxDur = Math.round(it.maxDur * 1.5 * 10) / 10;
  invSave();
  return { ok: true, msg: `锻造完成,耐久上限 ${it.maxDur}` };
}

// 死亡掉落入库(0 耐久装备)
export function invAddDrop(slot, quality) {
  return invAddItem(slot, quality, 0);
}
