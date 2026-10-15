// 词缀领域层(DDD):词缀 = 纯数据定义,物品实例只存 {id, v} 引用,
// 属性 = 基础值 × 词缀聚合(本文件的纯函数)。新增词条 = 加一条数据,系统零改动。
//
// slot:  'prefix' 前缀(词名 A)/ 'suffix' 后缀(词名 B)→ 物品名 "A且B的xxx"
// stat:  属性键(消费端只认识键):见 STAT_KEYS 注释
// tiers: { 1:[min,max], 2:[min,max], 3:[min,max] } 按品质档取值
//        品质档:broken/normal→1,fine/rare→2,epic/legendary→3
// applies: ['gun','head','body'] 该词条能出现在哪类物品上
// future: true = 预留未实装(展示用,不参与掷取)

export const AFFIXES = [
  // ================= 前缀 ×20 =================
  { id: 'deadly',      label: '致命', slot: 'prefix', stat: 'dmgPct',      applies: ['gun'],                 fmt: (v) => `伤害 +${v}%`,      tiers: { 1: [6, 10], 2: [10, 16], 3: [16, 25] } },
  { id: 'swiftgun',    label: '急速', slot: 'prefix', stat: 'rpmPct',      applies: ['gun'],                 fmt: (v) => `射速 +${v}%`,      tiers: { 1: [6, 10], 2: [10, 16], 3: [16, 25] } },
  { id: 'expansive',   label: '扩容', slot: 'prefix', stat: 'magFlat',     applies: ['gun'],                 fmt: (v) => `弹容量 +${v}`,     tiers: { 1: [3, 5], 2: [5, 8], 3: [8, 12] } },
  { id: 'precise',     label: '精准', slot: 'prefix', stat: 'spreadRed',   applies: ['gun'],                 fmt: (v) => `散布 -${v}%`,      tiers: { 1: [5, 9], 2: [9, 14], 3: [14, 20] } },
  { id: 'farreach',    label: '致远', slot: 'prefix', stat: 'rangePct',    applies: ['gun'],                 fmt: (v) => `射程 +${v}%`,      tiers: { 1: [10, 18], 2: [18, 28], 3: [28, 40] } },
  { id: 'quickload',   label: '迅装', slot: 'prefix', stat: 'reloadRed',   applies: ['gun'],                 fmt: (v) => `换弹 -${v}%`,      tiers: { 1: [8, 14], 2: [14, 20], 3: [20, 30] } },
  { id: 'apround',     label: '破甲', slot: 'prefix', stat: 'armorDmgPct', applies: ['gun'],                 fmt: (v) => `对甲伤害 +${v}%`,  tiers: { 1: [12, 20], 2: [20, 30], 3: [30, 45] } },
  { id: 'tempered',    label: '稳固', slot: 'prefix', stat: 'heatRed',     applies: ['gun'],                 fmt: (v) => `热量 -${v}%`,      tiers: { 1: [8, 14], 2: [14, 20], 3: [20, 30] } },
  { id: 'tungsten',    label: '钨芯', slot: 'prefix', stat: 'dmgPct',      applies: ['gun'],                 fmt: (v) => `伤害 +${v}%`,      tiers: { 1: [4, 8], 2: [8, 12], 3: [12, 18] } },
  { id: 'overdrive',   label: '超载', slot: 'prefix', stat: 'rpmPct',      applies: ['gun'],                 fmt: (v) => `射速 +${v}%`,      tiers: { 1: [4, 7], 2: [7, 11], 3: [11, 16] } },
  { id: 'vampiric',    label: '吸血', slot: 'prefix', stat: 'lifesteal',   applies: ['gun', 'head', 'body'], fmt: (v) => `吸血 +${v}%`,      tiers: { 1: [1, 2], 2: [2, 3], 3: [3, 5] } },
  { id: 'hunter',      label: '猎手', slot: 'prefix', stat: 'dropRate',    applies: ['gun', 'head', 'body'], fmt: (v) => `装备掉率 +${v}%`,  tiers: { 1: [3, 5], 2: [5, 8], 3: [8, 12] } },
  { id: 'greedy',      label: '贪婪', slot: 'prefix', stat: 'coinGain',    applies: ['gun', 'head', 'body'], fmt: (v) => `金币 +${v}%`,      tiers: { 1: [8, 14], 2: [14, 22], 3: [22, 35] } },
  { id: 'lightfoot',   label: '轻捷', slot: 'prefix', stat: 'moveSpeed',   applies: ['head', 'body'],        fmt: (v) => `移速 +${v}%`,      tiers: { 1: [2, 3], 2: [3, 5], 3: [5, 8] } },
  { id: 'vital',       label: '生命的', slot: 'prefix', stat: 'hpMaxFlat', applies: ['body'],                fmt: (v) => `HP上限 +${v}`,     tiers: { 1: [4, 6], 2: [6, 10], 3: [10, 16] } },
  { id: 'aegis',       label: '庇护', slot: 'prefix', stat: 'helmetDurPct', applies: ['head'],              fmt: (v) => `头盔耐久 +${v}%`,  tiers: { 1: [10, 18], 2: [18, 28], 3: [28, 40] } },
  { id: 'sturdy',      label: '厚实', slot: 'prefix', stat: 'armorDurPct', applies: ['body'],                fmt: (v) => `护甲耐久 +${v}%`,  tiers: { 1: [10, 18], 2: [18, 28], 3: [28, 40] } },
  { id: 'might',       label: '强击', slot: 'prefix', stat: 'meleeDmgPct', applies: ['body', 'gun'],         fmt: (v) => `近战伤害 +${v}%`,  tiers: { 1: [15, 25], 2: [25, 40], 3: [40, 60] } },
  { id: 'vengeance',   label: '复仇', slot: 'prefix', stat: 'lowHpDmgPct', applies: ['gun', 'body'],         fmt: (v) => `背水伤害 +${v}%`,  tiers: { 1: [8, 14], 2: [14, 22], 3: [22, 35] } },
  { id: 'burning',     label: '灼热', slot: 'prefix', stat: 'burnDPS',     applies: ['gun'],                 fmt: (v) => `灼烧 ${v}/s`,      tiers: { 1: [1, 2], 2: [2, 3], 3: [3, 5] }, future: true },
  // ================= 后缀 ×20 =================
  { id: 'ironwall',    label: '铁壁', slot: 'suffix', stat: 'defenseFlat', applies: ['body'],                fmt: (v) => `防御 +${v}%`,      tiers: { 1: [2, 4], 2: [4, 6], 3: [6, 9] } },
  { id: 'lucky',       label: '幸运', slot: 'suffix', stat: 'dropRate',    applies: ['gun', 'head', 'body'], fmt: (v) => `装备掉率 +${v}%`,  tiers: { 1: [3, 5], 2: [5, 8], 3: [8, 12] } },
  { id: 'plunder',     label: '掠夺', slot: 'suffix', stat: 'coinGain',    applies: ['gun', 'head', 'body'], fmt: (v) => `金币 +${v}%`,      tiers: { 1: [6, 10], 2: [10, 16], 3: [16, 25] } },
  { id: 'rejuv',       label: '回春', slot: 'suffix', stat: 'healOnKill',  applies: ['body'],                fmt: (v) => `击杀回血 +${v}`,   tiers: { 1: [1, 2], 2: [2, 3], 3: [3, 5] } },
  { id: 'durable',     label: '耐久', slot: 'suffix', stat: 'allDurPct',   applies: ['gun', 'head', 'body'], fmt: (v) => `全耐久 +${v}%`,    tiers: { 1: [6, 10], 2: [10, 15], 3: [15, 22] } },
  { id: 'crushing',    label: '碎击', slot: 'suffix', stat: 'meleeDmgPct', applies: ['body'],                fmt: (v) => `近战伤害 +${v}%`,  tiers: { 1: [10, 16], 2: [16, 25], 3: [25, 38] } },
  { id: 'striding',    label: '疾步', slot: 'suffix', stat: 'moveSpeed',   applies: ['body'],                fmt: (v) => `移速 +${v}%`,      tiers: { 1: [2, 3], 2: [3, 4], 3: [4, 6] } },
  { id: 'ammobox',     label: '弹药箱', slot: 'suffix', stat: 'magFlat',   applies: ['gun'],                 fmt: (v) => `弹容量 +${v}`,     tiers: { 1: [2, 4], 2: [4, 6], 3: [6, 9] } },
  { id: 'farsight',    label: '远视', slot: 'suffix', stat: 'rangePct',    applies: ['gun'],                 fmt: (v) => `射程 +${v}%`,      tiers: { 1: [8, 14], 2: [14, 20], 3: [20, 30] } },
  { id: 'finesse',     label: '精工', slot: 'suffix', stat: 'spreadRed',   applies: ['gun'],                 fmt: (v) => `散布 -${v}%`,      tiers: { 1: [6, 10], 2: [10, 15], 3: [15, 22] } },
  { id: 'steadyhand',  label: '稳手', slot: 'suffix', stat: 'reloadRed',   applies: ['gun'],                 fmt: (v) => `换弹 -${v}%`,      tiers: { 1: [6, 10], 2: [10, 15], 3: [15, 22] } },
  { id: 'lifesiphon',  label: '汲血', slot: 'suffix', stat: 'meleeLifesteal', applies: ['body'],            fmt: (v) => `近战吸血 +${v}`,   tiers: { 1: [3, 5], 2: [5, 8], 3: [8, 12] } },
  { id: 'bulwark',     label: '壁垒', slot: 'suffix', stat: 'hpMaxPct',    applies: ['body'],                fmt: (v) => `HP上限 +${v}%`,    tiers: { 1: [6, 10], 2: [10, 15], 3: [15, 22] } },
  { id: 'reinforce',   label: '补强', slot: 'suffix', stat: 'armorDurPct', applies: ['body'],                fmt: (v) => `护甲耐久 +${v}%`,  tiers: { 1: [6, 10], 2: [10, 15], 3: [15, 22] } },
  { id: 'headguard',   label: '护首', slot: 'suffix', stat: 'helmetDurPct', applies: ['head'],               fmt: (v) => `头盔耐久 +${v}%`,  tiers: { 1: [6, 10], 2: [10, 15], 3: [15, 22] } },
  { id: 'phantom',     label: '幻影', slot: 'suffix', stat: 'dodgePct',    applies: ['body'],                fmt: (v) => `闪避 +${v}%`,      tiers: { 1: [3, 5], 2: [5, 8], 3: [8, 12] }, future: true },
  { id: 'unbowed',     label: '屹立', slot: 'suffix', stat: 'knockRes',    applies: ['body'],                fmt: (v) => `击退抗性 +${v}%`,  tiers: { 1: [10, 20], 2: [20, 30], 3: [30, 45] }, future: true },
  { id: 'tactical',    label: '战术', slot: 'suffix', stat: 'eliteDrop',   applies: ['gun', 'head', 'body'], fmt: (v) => `精英掉率 +${v}%`,  tiers: { 1: [5, 10], 2: [10, 16], 3: [16, 25] }, future: true },
  { id: 'reflecting',  label: '反伤', slot: 'suffix', stat: 'reflectDmg',  applies: ['body'],                fmt: (v) => `反伤 +${v}`,       tiers: { 1: [2, 4], 2: [4, 7], 3: [7, 12] }, future: true },
  { id: 'deathless',   label: '不死', slot: 'suffix', stat: 'revive',      applies: ['body'],                fmt: (v) => `免死 +1`,          tiers: { 1: [1, 1], 2: [1, 1], 3: [1, 1] }, future: true },
];

export const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

// 品质档 → 词缀数值档
export function tierOf(quality) {
  if (quality === 'broken' || quality === 'normal') return 1;
  if (quality === 'fine' || quality === 'rare') return 2;
  return 3; // epic / legendary
}

// 掷一条词缀(在适用且已实装的池子里抽;数值在档位区间内均匀分布)
export function rollAffix(kind, quality, excludeStat = null) {
  const tier = tierOf(quality);
  const pool = AFFIXES.filter((a) => !a.future && a.applies.includes(kind) && !(excludeStat && a.stat === excludeStat));
  if (!pool.length) return null;
  const def = pool[Math.floor(Math.random() * pool.length)];
  const [lo, hi] = def.tiers[tier] ?? def.tiers[1];
  const v = +(lo + Math.random() * (hi - lo)).toFixed(1);
  return { id: def.id, v };
}

// 掷一对:1 前缀 + 1 后缀(同属性键去重,避免词条重复叠加同一键)
export function rollAffixes(kind, quality) {
  const tier = tierOf(quality);
  const pick = (slot, excludeStat) => {
    const pool = AFFIXES.filter((a) => !a.future && a.slot === slot && a.applies.includes(kind) && a.stat !== excludeStat);
    if (!pool.length) return null;
    const def = pool[Math.floor(Math.random() * pool.length)];
    const [lo, hi] = def.tiers[tier] ?? def.tiers[1];
    const v = +(lo + Math.random() * (hi - lo)).toFixed(1);
    return { id: def.id, v };
  };
  // 前缀先掷,后缀掷时排除同属性键
  const pPool = AFFIXES.filter((a) => !a.future && a.slot === 'prefix' && a.applies.includes(kind));
  const pre = pPool[Math.floor(Math.random() * pPool.length)];
  const pv = pre.tiers[tier] ?? pre.tiers[1];
  const preV = +(pv[0] + Math.random() * (pv[1] - pv[0])).toFixed(1);
  const sufPool = AFFIXES.filter((a) => !a.future && a.slot === 'suffix' && a.applies.includes(kind) && a.stat !== pre.stat);
  const suf = sufPool[Math.floor(Math.random() * sufPool.length)];
  if (!suf) return [{ id: pre.id, v: preV }];
  const sv = suf.tiers[tier] ?? suf.tiers[1];
  const sufV = +(sv[0] + Math.random() * (sv[1] - sv[0])).toFixed(1);
  return [{ id: pre.id, v: preV }, { id: suf.id, v: sufV }];
}

// ---- 属性聚合(纯函数):基础值 + 词缀 → 最终值 ----
const sum = (affixes, stat) => affixes.reduce((t, a) => {
  const def = AFFIX_BY_ID[a.id];
  return def && def.stat === stat ? t + a.v : t;
}, 0);
const mul = (affixes, stat) => Math.max(0, 1 + sum(affixes, stat) / 100);

// 枪械聚合:伤害/射速/弹容/散布/换弹/射程/吸血
export function computeGunMods(affixes = []) {
  return {
    dmgMul: mul(affixes, 'dmgPct'),
    rpmMul: mul(affixes, 'rpmPct'),
    magFlat: sum(affixes, 'magFlat'),
    spreadMul: mul(affixes, 'spreadRed'),
    reloadMul: mul(affixes, 'reloadRed'),
    rangeMul: mul(affixes, 'rangePct'),
    armorDmgMul: mul(affixes, 'armorDmgPct'),
    heatMul: mul(affixes, 'heatRed'),
    lifesteal: sum(affixes, 'lifesteal'),
  };
}

// 防具聚合:耐久上限%/HP上限/移速/防御/近战/吸血/掉率/金币/击杀回血
export function computeArmorMods(slot, affixes = []) {
  let durPct = sum(affixes, 'allDurPct');
  if (slot === 'head') durPct += sum(affixes, 'helmetDurPct');
  if (slot === 'body') durPct += sum(affixes, 'armorDurPct');
  return {
    durPct,
    hpMaxFlat: sum(affixes, 'hpMaxFlat'),
    moveSpeedPct: sum(affixes, 'moveSpeed'),
    defenseFlat: sum(affixes, 'defenseFlat'),
    lifesteal: sum(affixes, 'lifesteal'),
    dropRatePct: sum(affixes, 'dropRate'),
    coinGainPct: sum(affixes, 'coinGain'),
    meleeDmgPct: sum(affixes, 'meleeDmgPct'),
    healOnKill: sum(affixes, 'healOnKill'),
  };
}

// 物品名:"A且B的xxx"
export function itemTitle(affixes = [], baseName) {
  const labels = affixes.map((a) => AFFIX_BY_ID[a.id]?.label).filter(Boolean);
  return labels.length ? `${labels.join('且')}${baseName}` : baseName;
}
