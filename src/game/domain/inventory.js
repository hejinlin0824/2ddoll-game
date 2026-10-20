// 背包与经济:金币 + 装备实例(品质/耐久/词缀),穿戴绑定,修复/升级/合成/锻造。
// 存档 'contra-inv' = { coins, items: [{id, slot, quality, dur, maxDur, equipped, affixes}] }
// 装备 = 消耗品:碎了不清空存档,留在背包里等修复。
// 词条领域(词缀定义/掷取/聚合)在 affixes.js —— 本层只管实例与持久化。
import { rollAffixes, AFFIX_BY_ID, absorbAffix, loadGunAffixes, saveGunAffixes } from './affixes.js';
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

// 新装备实例(掉落/奖励/搜尸用);dur 默认满。affixes 可显式传入(搜尸战利品/吸收材料),
// 缺省现掷一对。slot 允许 'gun' = 武器词条材料(不可穿戴,供吸取/突破/分解,无耐久概念)
export function invAddItem(slot, quality, dur, affixes, extra) {
  invLoad();
  const q = quality;
  const base = slot === 'head' ? 12 : 24;
  // 品质倍率
  const mul = { broken: 0.5, normal: 1, fine: 1.3, rare: 1.6, epic: 2, legendary: 2.6 }[q] ?? 1;
  const useAffixes = affixes || rollAffixes(slot === 'body' ? 'body' : slot === 'head' ? 'head' : 'gun', q);
  const durPct = useAffixes.reduce((t, a) => {
    const def = AFFIX_BY_ID[a.id];
    return def && (def.stat === 'allDurPct' || (slot === 'head' && def.stat === 'helmetDurPct') || (slot === 'body' && def.stat === 'armorDurPct')) ? t + a.v : t;
  }, 0);
  const maxDur = slot === 'gun' ? 0 : Math.round(base * mul * (1 + durPct / 100) * 10) / 10;
  const it = { id: 'i' + (seq++).toString(36) + Math.floor(Math.random() * 999).toString(36), slot, quality: q, dur: slot === 'gun' ? 0 : (dur ?? maxDur), maxDur, equipped: false, affixes: useAffixes, ...(extra || {}) };
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

// ---- 分解(替代丢弃):按品质+词条数折算金币 ----
export const DECOMPOSE_VALUE = { broken: 5, normal: 12, fine: 25, rare: 50, epic: 100, legendary: 200 };
export function invDecompose(id) {
  invLoad();
  const it = invItem(id);
  if (!it || it.equipped) return { ok: false, msg: it ? '装备中的不能分解' : '不存在' };
  const coins = (DECOMPOSE_VALUE[it.quality] ?? 10) + (it.affixes?.length || 0) * 10;
  invTakeItem(id);
  invAddCoins(coins);
  return { ok: true, msg: `分解获得 ${coins} 金币`, coins };
}

// ---- 吸取词条(对标 D3 卡奈魔盒提取):材料的词条合并进目标后消失 ----
// 装备材料 → 已装备的同槽装备(同词条数值相加,异词条追加,装备词条位上限 2);
// 枪材料(slot 'gun') → 主武器槽位词条(上限 4 条,玩家和敌人共用这条成长线)
export function invAbsorb(materialId) {
  invLoad();
  const m = invItem(materialId);
  if (!m || m.equipped) return { ok: false, msg: m ? '装备中的不能作为材料' : '材料不存在' };
  if (!m.affixes?.length) return { ok: false, msg: '这件没有词条可吸' };
  let skipped = 0;
  if (m.slot === 'gun') {
    let list = (loadGunAffixes() || []).map((a) => ({ ...a }));
    for (const a of m.affixes) {
      const r = absorbAffix(list, a, 4);
      if (r) list = r; else skipped++;
    }
    saveGunAffixes(list);
    invTakeItem(materialId);
    return { ok: true, msg: `已吸取进主武器词条${skipped ? `(词条位满,跳过 ${skipped} 条)` : ''}` };
  }
  const eq = inv.items.find((it) => it.equipped && it.slot === m.slot);
  if (!eq) return { ok: false, msg: `先装备一件${m.slot === 'head' ? '头盔' : '防弹衣'}才能吸取` };
  if (!eq.affixes) eq.affixes = [];
  for (const a of m.affixes) {
    const r = absorbAffix(eq.affixes, a, 2);
    if (r) eq.affixes = r; else skipped++;
  }
  invTakeItem(materialId);
  invSave();
  return { ok: true, msg: `已吸取进${eq.slot === 'head' ? '头盔' : '防弹衣'}${skipped ? `(词条位满,跳过 ${skipped} 条)` : ''}` };
}

// ---- 突破(替代三合一):3 件同槽位同品质 → 三态判定 ----
// 升(品质+1)/不变/失败(随机失去一条词条)。词条按"逐属性取三件最大值"继承(词条位上限:装备2/枪4)。
// 概率:紫之前 90% 升 10% 败;紫→金 10% 升 80% 不变 10% 败(用户指定,失败会掉属性)
export const BT_RATE = {
  broken: { up: 0.9, keep: 0, fail: 0.1 },
  normal: { up: 0.9, keep: 0, fail: 0.1 },
  fine: { up: 0.9, keep: 0, fail: 0.1 },
  rare: { up: 0.9, keep: 0, fail: 0.1 },
  epic: { up: 0.1, keep: 0.8, fail: 0.1 },
};
export function invBreakthrough(ids) {
  invLoad();
  if (!Array.isArray(ids) || ids.length !== 3) {
    return { ok: false, msg: '需要 3 件同槽位同品质的装备' };
  }
  // 领域层必须验证 ID 唯一,不能依赖 UI 阻止重复选择同一件装备。
  if (new Set(ids).size !== 3) {
    return { ok: false, msg: '不能重复选择同一件装备' };
  }
  const its = ids.map((x) => invItem(x));
  if (its.some((it) => !it)) return { ok: false, msg: '素材不存在' };
  const [a, b, c] = its;
  if (a.slot !== b.slot || b.slot !== c.slot || a.quality !== b.quality || b.quality !== c.quality) {
    return { ok: false, msg: '三件必须同槽位同品质' };
  }
  if (its.some((it) => it.equipped)) return { ok: false, msg: '装备中的不能当素材' };
  const i = QUALITY_ORDER.indexOf(a.quality);
  if (i < 0 || i >= QUALITY_ORDER.length - 1) return { ok: false, msg: '已是最高品质' };
  // 词条继承:逐属性键取三件中的最大值
  const cap = a.slot === 'gun' ? 4 : 2;
  const best = new Map();
  for (const it of its) for (const af of (it.affixes || [])) {
    const stat = AFFIX_BY_ID[af.id]?.stat;
    if (!stat) continue;
    if (!best.has(stat) || af.v > best.get(stat).v) best.set(stat, { ...af });
  }
  let affixes = [...best.values()].sort((x, y) => y.v - x.v).slice(0, cap);
  const rate = BT_RATE[a.quality] ?? { up: 0.9, keep: 0, fail: 0.1 };
  const roll = Math.random();
  const outcome = roll < rate.up ? 'up' : roll < rate.up + rate.keep ? 'keep' : 'fail';
  let msg;
  if (outcome === 'fail' && affixes.length) {
    const drop = affixes.splice(Math.floor(Math.random() * affixes.length), 1)[0];
    msg = `突破失败…失去「${AFFIX_BY_ID[drop.id]?.label ?? drop.id}」词条`;
  } else if (outcome === 'up') msg = `突破成功!升级为 ${QLABEL_OF[QUALITY_ORDER[i + 1]]}`;
  else msg = '突破未成功,品质不变(素材已返还一件)';
  const nxtQ = outcome === 'up' ? QUALITY_ORDER[i + 1] : a.quality;
  inv.items = inv.items.filter((x) => !ids.includes(x.id));
  const it = { id: 'i' + (seq++).toString(36) + Math.floor(Math.random() * 999).toString(36), slot: a.slot, quality: nxtQ, dur: 0, maxDur: 0, equipped: false, affixes };
  if (a.slot !== 'gun') { // 装备件耐久按新品质重算满
    const mul = { broken: 0.5, normal: 1, fine: 1.3, rare: 1.6, epic: 2, legendary: 2.6 }[nxtQ] ?? 1;
    const durPct = affixes.reduce((t, af) => {
      const def = AFFIX_BY_ID[af.id];
      return def && (def.stat === 'allDurPct' || (a.slot === 'head' && def.stat === 'helmetDurPct') || (a.slot === 'body' && def.stat === 'armorDurPct')) ? t + af.v : t;
    }, 0);
    it.maxDur = Math.round((a.slot === 'head' ? 12 : 24) * mul * (1 + durPct / 100) * 10) / 10;
    it.dur = it.maxDur;
  }
  inv.items.push(it);
  invSave();
  return { ok: true, outcome, msg: outcome === 'keep' ? '突破未成功,品质不变(素材已返还一件)' : msg, item: it };
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

// ---- 背包容量(已穿戴的不占格子;枪词条材料也占格)----
export const BP_CAP = 24;
export function invIsFull() {
  invLoad();
  return inv.items.filter((it) => !it.equipped).length >= BP_CAP;
}
export function invUsedCount() {
  invLoad();
  return inv.items.filter((it) => !it.equipped).length;
}

// ---- 完整物品取出/放回(丢弃到世界再捡回,词缀/耐久必须原样保留)----
export function invTakeItem(id) {
  invLoad();
  const i = inv.items.findIndex((it) => it.id === id);
  if (i < 0) return null;
  const [it] = inv.items.splice(i, 1);
  invSave();
  return it;
}
export function invInsertItem(it) {
  invLoad();
  if (!it || invIsFull()) return null;
  inv.items.push(it);
  invSave();
  return it;
}

// ---- 开箱:三档宝箱,按品质权重掷一件(词缀随 invAddItem 自动掷) ----
export const BOXES = [
  { id: 'bronze', name: '青铜箱', color: '#b0783c', cost: 50, odds: { broken: 25, normal: 45, fine: 25, rare: 5 } },
  { id: 'silver', name: '白银箱', color: '#b9c4d6', cost: 140, odds: { normal: 20, fine: 45, rare: 25, epic: 10 } },
  { id: 'gold', name: '黄金箱', color: '#ffc21c', cost: 320, odds: { fine: 25, rare: 40, epic: 25, legendary: 10 } },
];
export function invOpenBox(boxId) {
  invLoad();
  const box = BOXES.find((b) => b.id === boxId);
  if (!box) return { ok: false, msg: '无此宝箱' };
  if (!invSpend(box.cost)) return { ok: false, msg: '金币不足' };
  if (invIsFull()) { inv.coins += box.cost; invSave(); return { ok: false, msg: '背包已满,先清理一下' }; }
  const slot = Math.random() < 0.5 ? 'head' : 'body';
  const entries = Object.entries(box.odds);
  let r = Math.random() * entries.reduce((t, [, w]) => t + w, 0);
  let quality = entries[0][0];
  for (const [q, w] of entries) { r -= w; if (r <= 0) { quality = q; break; } }
  const item = invAddItem(slot, quality);
  return { ok: true, msg: `开出 ${itemTitleOf(item)}!`, item, box };
}
function itemTitleOf(it) {
  // 避免循环依赖:这里只拼品质+槽位(词缀名交给 UI 层展示)
  return `${QLABEL_OF[it.quality] ?? it.quality}${it.slot === 'head' ? '头盔' : '防弹衣'}`;
}
const QLABEL_OF = { broken: '破损', normal: '普通', fine: '优良', rare: '稀有', epic: '高级', legendary: '传说' };



