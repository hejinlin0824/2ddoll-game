// 枪械数据格式(设计器与游戏共用):
// {
//   name, meterScale (px/米), parts: [{x,y,w,h,color,r}],  // 全部在"设计坐标"(px,x向枪口,y向下)
//   grips: { front: {x,y}, rear: {x,y} },                  // 前手捏握点 / 后手枪把握点
//   muzzle: {x,y}                                          // 枪口(子弹出发点)
// }
// ⚠️ 夜色背景:颜色一律取亮/中亮色调,游戏内渲染会自动加深色描边,
//    深色零件也要留亮色高光件,否则夜里成一团黑(被毙过两次)。
export const PART_TYPES = {
  barrel:   { w: 60, h: 7,  color: '#4a525e', label: '枪管' },
  receiver: { w: 55, h: 18, color: '#565f6d', label: '机匣' },
  stock:    { w: 55, h: 12, color: '#8a5a30', label: '枪托' },
  grip:     { w: 10, h: 20, color: '#8a5a30', label: '握把' },
  mag:      { w: 16, h: 20, color: '#434852', label: '弹匣' },
  scope:    { w: 32, h: 10, color: '#2f3542', label: '瞄具' },
  handguard:{ w: 34, h: 14, color: '#6b4a2e', label: '护木' },
  block:    { w: 20, h: 14, color: '#6a7688', label: '方块' },
};

export const METER_SCALE = 200; // 200px = 1m

// ---- 武器词条(v1 固定初始;未来刷宝系统在此基础上叠前后缀词缀) ----
// damage      单发威力(命中敌人扣血;打盾牌扣盾耐久)
// rpm         射速(发/分钟),开火间隔 = 60/rpm
// mag / reload 弹匣容量 / 换弹时间 s(打空自动换弹)
// spread      散布系数(×基础散布公式,>1 更散 <1 更准)
// pellets / pelletSpread  一次扣扳机的弹丸数 / 弹丸散布半角 rad(霰弹枪用)
// muzzleVel   弹丸初速 m/s     range 有效射程 m(子弹寿命由此推导)
// recoil      后坐力系数(热量积累/推背冲量 ×它)
// mode        'auto' = 弹丸飞行 | 'hitscan' = 瞬时射线(狙击:沿途伤害递减)
// sfx         枪声合成参数(每把枪音色不同)
// 枪声合成词条(三层:低频thump/主体crack/噪声爆,每枪音色分明)
const SND = (f0, f1, dur, vol, noise, cutoff) => ({ f0, f1, dur, vol, noise, cutoff });

export const WEAPON_STATS = {
  'AK-47': { damage: 26, rpm: 600, mag: 30, reload: 1.6, spread: 1.0, pellets: 1, muzzleVel: 46, range: 40, recoil: 1.0, mode: 'auto', sfx: SND(430, 70, 0.14, 0.10, 0.11, 750) },
  'M4A1': { damage: 18, rpm: 820, mag: 30, reload: 1.4, spread: 0.8, pellets: 1, muzzleVel: 52, range: 40, recoil: 0.72, mode: 'auto', sfx: SND(640, 120, 0.10, 0.09, 0.08, 1150) },
  'AWP': { damage: 90, rpm: 42, mag: 5, reload: 2.4, spread: 0.1, pellets: 1, muzzleVel: 115, range: 80, recoil: 2.6, mode: 'hitscan', falloff: 0.55, sfx: SND(210, 38, 0.35, 0.14, 0.18, 480) },
  'MP5': { damage: 13, rpm: 900, mag: 30, reload: 1.3, spread: 0.9, pellets: 1, muzzleVel: 40, range: 30, recoil: 0.55, mode: 'auto', sfx: SND(780, 160, 0.08, 0.08, 0.07, 1450) },
  '霰弹枪': { damage: 9, rpm: 70, mag: 6, reload: 2.2, spread: 1.0, pellets: 8, pelletSpread: 0.16, muzzleVel: 38, range: 14, recoil: 2.4, mode: 'auto', sfx: SND(140, 42, 0.22, 0.13, 0.16, 550) },
};

export const PISTOL_STATS = { damage: 16, rpm: 280, mag: 12, reload: 1.1, spread: 1.2, pellets: 1, muzzleVel: 34, range: 26, recoil: 0.5, mode: 'auto', sfx: SND(920, 170, 0.09, 0.07, 0.06, 1650) };

// ---- 装备品质(消耗品耐久/防御倍率;随机加成词条后期在此基础上叠) ----
export const QUALITY = {
  broken:    { label: '破损', color: '#d9d9d2', durMul: 0.5, defMul: 0.6 },
  normal:    { label: '普通', color: '#aab0b8', durMul: 1.0, defMul: 1.0 },
  fine:      { label: '优良', color: '#57b653', durMul: 1.3, defMul: 1.15 },
  rare:      { label: '稀有', color: '#3f8ef0', durMul: 1.6, defMul: 1.3 },
  epic:      { label: '高级', color: '#a55cf0', durMul: 2.0, defMul: 1.5 },
  legendary: { label: '传说', color: '#ffc21c', durMul: 2.6, defMul: 1.75 },
};

// 伤害归一:所有武器单发基础伤害 = 1(部位倍率:头 ×2 / 身 ×1 / 腿 ×0.2 / 手臂不判定)
export const BASE_DAMAGE = 1;
// 护甲基础耐久(普通品质;实际 = 基础 × 品质 durMul)
export const ARMOR_BASE_DUR = { head: 12, body: 24 };

// 设计器自定义枪(名字对不上预设)的兜底词条
export const DEFAULT_STATS = { damage: 20, rpm: 600, mag: 30, reload: 1.5, spread: 1.0, pellets: 1, muzzleVel: 30, range: 36, recoil: 1.0, mode: 'auto', sfx: SND(500, 90, 0.12, 0.10, 0.10, 900) };

export const GUN_PRESETS = {
  'AK-47': {
    name: 'AK-47', meterScale: METER_SCALE,
    parts: [
      { x: 0,   y: 24, w: 28, h: 15, color: '#8a5f32', r: 4 },  // 托底
      { x: 22,  y: 19, w: 40, h: 15, color: '#9a6a38', r: 3 },  // 托颈(木)
      { x: 58,  y: 17, w: 54, h: 19, color: '#6f7987', r: 2 },  // 机匣
      { x: 62,  y: 12, w: 46, h: 7,  color: '#5d6673', r: 3 },  // 防尘盖
      { x: 62,  y: 36, w: 11, h: 21, color: '#8a5f32', r: 3 },  // 握把(木)
      { x: 80,  y: 35, w: 16, h: 14, color: '#4d525c', r: 3 },  // 弹匣(弯)
      { x: 83,  y: 47, w: 15, h: 13, color: '#474c56', r: 3 },
      { x: 87,  y: 58, w: 13, h: 12, color: '#42464f', r: 3 },
      { x: 110, y: 13, w: 38, h: 6,  color: '#5d6673', r: 3 },  // 导气管
      { x: 110, y: 19, w: 38, h: 12, color: '#9a6a38', r: 3 },  // 护木(木)
      { x: 146, y: 21, w: 32, h: 6,  color: '#4a525e', r: 2 },  // 枪管
      { x: 150, y: 10, w: 5,  h: 12, color: '#4a525e', r: 2 },  // 准星
      { x: 102, y: 10, w: 9,  h: 8,  color: '#4a525e', r: 2 },  // 表尺
      { x: 176, y: 19, w: 10, h: 10, color: '#3f464f', r: 2 },  // 斜口消焰器
    ],
    grips: { front: { x: 128, y: 25 }, rear: { x: 67, y: 43 } },
    muzzle: { x: 186, y: 24 },
  },
  'M4A1': {
    name: 'M4A1', meterScale: METER_SCALE,
    parts: [
      { x: 0,   y: 16, w: 18, h: 8,  color: '#a08b63', r: 3 },  // 托腮板
      { x: 2,   y: 21, w: 24, h: 14, color: '#8f7a55', r: 3 },  // 伸缩托
      { x: 22,  y: 23, w: 26, h: 9,  color: '#6f7987', r: 3 },  // 缓冲管
      { x: 44,  y: 17, w: 52, h: 19, color: '#8f7a55', r: 2 },  // 机匣
      { x: 46,  y: 13, w: 78, h: 6,  color: '#5d6673', r: 2 },  // 顶部导轨
      { x: 58,  y: 8,  w: 5,  h: 5,  color: '#3a3f47', r: 2 },  // 机械照门(光学配件另装)
      { x: 59,  y: 9,  w: 2,  h: 3,  color: '#8999a8', r: 1 },  // 照门高光
      { x: 52,  y: 36, w: 10, h: 19, color: '#3a3f47', r: 3 },  // 握把
      { x: 74,  y: 36, w: 14, h: 22, color: '#5d6673', r: 2 },  // 直弹匣
      { x: 94,  y: 17, w: 42, h: 13, color: '#a08b63', r: 3 },  // 护木
      { x: 134, y: 21, w: 28, h: 6,  color: '#4a525e', r: 2 },  // 枪管
      { x: 138, y: 9,  w: 5,  h: 13, color: '#4a525e', r: 2 },  // 准星
      { x: 160, y: 20, w: 8,  h: 8,  color: '#3f464f', r: 2 },  // 消焰器
    ],
    grips: { front: { x: 114, y: 24 }, rear: { x: 57, y: 42 } },
    muzzle: { x: 168, y: 24 },
  },
  'AWP': {
    name: 'AWP', meterScale: METER_SCALE,
    parts: [
      { x: 2,   y: 18, w: 50, h: 16, color: '#5a7a3a', r: 5 },  // 枪托
      { x: 4,   y: 12, w: 22, h: 8,  color: '#6f9349', r: 3 },  // 贴腮板
      { x: 48,  y: 18, w: 46, h: 15, color: '#5a7a3a', r: 2 },  // 机匣
      { x: 92,  y: 21, w: 86, h: 6,  color: '#4a525e', r: 2 },  // 枪管
      { x: 176, y: 18, w: 8,  h: 12, color: '#3f464f', r: 2 },  // 枪口制退器
      { x: 54,  y: 33, w: 10, h: 19, color: '#3a4a2c', r: 3 },  // 握把
      { x: 72,  y: 32, w: 13, h: 15, color: '#4a5e38', r: 2 },  // 弹匣
      { x: 58,  y: 12, w: 6,  h: 7,  color: '#3a4a2c', r: 1 },  // 镜座前
      { x: 82,  y: 12, w: 6,  h: 7,  color: '#3a4a2c', r: 1 },  // 镜座后
      { x: 52,  y: 2,  w: 44, h: 11, color: '#2f3542', r: 5 },  // 瞄准镜
      { x: 94,  y: 0,  w: 10, h: 15, color: '#2f3542', r: 3 },  // 物镜罩
      { x: 97,  y: 3,  w: 4,  h: 9,  color: '#9fe0ff', r: 2 },  // 镜片(亮)
    ],
    grips: { front: { x: 118, y: 27 }, rear: { x: 59, y: 40 } },
    muzzle: { x: 184, y: 24 },
  },
  'MP5': {
    name: 'MP5', meterScale: METER_SCALE,
    parts: [
      { x: 0,   y: 17, w: 7,  h: 18, color: '#2f333b', r: 2 },  // 抵肩板
      { x: 4,   y: 21, w: 22, h: 10, color: '#3a3f47', r: 4 },  // 伸缩托
      { x: 24,  y: 17, w: 46, h: 17, color: '#454c57', r: 2 },  // 机匣
      { x: 26,  y: 13, w: 44, h: 6,  color: '#3a3f47', r: 2 },  // 瞄具轨
      { x: 30,  y: 7,  w: 9,  h: 8,  color: '#5d6673', r: 4 },  // 照门转鼓
      { x: 62,  y: 7,  w: 8,  h: 8,  color: '#5d6673', r: 4 },  // 准星圈
      { x: 28,  y: 34, w: 10, h: 18, color: '#3a3f47', r: 3 },  // 握把
      { x: 46,  y: 34, w: 11, h: 24, color: '#596069', r: 2 },  // 弹匣
      { x: 70,  y: 18, w: 30, h: 13, color: '#596069', r: 3 },  // 护木
      { x: 98,  y: 21, w: 20, h: 6,  color: '#4a525e', r: 2 },  // 枪管
      { x: 116, y: 19, w: 4,  h: 10, color: '#3f464f', r: 1 },  // 三凸耳
    ],
    grips: { front: { x: 84, y: 24 }, rear: { x: 33, y: 40 } },
    muzzle: { x: 120, y: 24 },
  },
  '霰弹枪': {
    name: '霰弹枪', meterScale: METER_SCALE,
    parts: [
      { x: 0,   y: 22, w: 6,  h: 17, color: '#2f333b', r: 2 },  // 橡胶托底
      { x: 4,   y: 20, w: 42, h: 15, color: '#9a6a38', r: 5 },  // 枪托(木)
      { x: 40,  y: 18, w: 36, h: 14, color: '#7d8794', r: 2 },  // 机匣(钢)
      { x: 48,  y: 32, w: 16, h: 3,  color: '#5d6673', r: 1 },  // 扳机护圈
      { x: 74,  y: 27, w: 72, h: 6,  color: '#5d6673', r: 2 },  // 弹仓管
      { x: 74,  y: 19, w: 88, h: 7,  color: '#4a525e', r: 2 },  // 枪管
      { x: 92,  y: 24, w: 30, h: 12, color: '#9a6a38', r: 4 },  // 护木泵(木)
      { x: 97,  y: 27, w: 20, h: 6,  color: '#8a5f32', r: 3 },  // 泵防滑纹
      { x: 158, y: 14, w: 4,  h: 6,  color: '#c9a227', r: 2 },  // 珠状准星(金)
    ],
    grips: { front: { x: 106, y: 29 }, rear: { x: 44, y: 31 } },
    muzzle: { x: 162, y: 22 },
  },
  // 常备副武器也使用同一套模块/涂装蓝图，但不会进入主武器轮盘或敌人的主武器抽选池。
  'Glock 17': {
    name: 'Glock 17', isSidearm: true, meterScale: METER_SCALE,
    parts: [
      { x: 24, y: 15, w: 10, h: 8, color: '#303944', r: 2 },
      { x: 30, y: 12, w: 55, h: 14, color: '#424c59', r: 3 },
      { x: 36, y: 10, w: 35, h: 3, color: '#647384', r: 1 },
      { x: 80, y: 16, w: 17, h: 7, color: '#303944', r: 2 },
      { x: 43, y: 24, w: 35, h: 9, color: '#303944', r: 2 },
      { x: 43, y: 30, w: 15, h: 24, color: '#242c36', r: 3 },
      { x: 45, y: 33, w: 11, h: 17, color: '#3b4654', r: 2 },
      { x: 54, y: 27, w: 18, h: 8, color: '#202731', r: 4 },
      { x: 67, y: 24, w: 11, h: 3, color: '#7b8997', r: 1 },
      { x: 82, y: 14, w: 16, h: 4, color: '#687786', r: 1 },
      { x: 87, y: 10, w: 4, h: 5, color: '#a5b4c2', r: 1 },
      { x: 47, y: 34, w: 10, h: 18, color: '#3b4654', r: 2, component: 'magazine' },
    ],
    grips: { front: { x: 69, y: 24 }, rear: { x: 49, y: 36 } },
    muzzle: { x: 98, y: 18 },
  },
};

// 把词条挂到预设枪上;手枪基底使用专属 PISTOL_STATS,其余从武器词条表回填。
for (const [k, g] of Object.entries(GUN_PRESETS)) g.stats = g.isSidearm ? { ...PISTOL_STATS } : (WEAPON_STATS[k] ?? { ...DEFAULT_STATS });

// ---- 模块化枪械配件：几何部件进入真实武器渲染，数值修正进入开火属性 ----
// id 必须稳定，供 contra-gun-primary 存档与枪型兼容判断使用。
export const GUN_ATTACHMENTS = {
  suppressor: { id: 'suppressor', label: '通用消音器', slot: '枪口', icon: 'suppressor', compatible: ['AK-47', 'M4A1', 'MP5', 'AWP', 'Glock 17'], bonus: '启用消音后降低声源半径', mods: { suppressionRadiusMul: 0.82, soundIntensityMul: 0.9, damageMul: 0.98 }, canSuppress: true },
  mp5_integral: { id: 'mp5_integral', label: 'MP5 一体消音器', slot: '枪口', icon: 'suppressor', compatible: ['MP5'], bonus: '消音半径更小，散布略收敛', mods: { suppressionRadiusMul: 0.66, spreadMul: 0.94, damageMul: 0.98 }, canSuppress: true },
  awp_suppressor: { id: 'awp_suppressor', label: '狙击专用消音器', slot: '枪口', icon: 'suppressor', compatible: ['AWP'], bonus: '大幅降低狙击枪声传播', mods: { suppressionRadiusMul: 0.58, recoilMul: 0.92, damageMul: 0.97 }, canSuppress: true },
  glock_suppressor: { id: 'glock_suppressor', label: 'Glock 螺纹消音器', slot: '枪口', icon: 'suppressor', compatible: ['Glock 17'], bonus: '消音传播半径降低 38%', mods: { suppressionRadiusMul: 0.62, soundIntensityMul: 0.82, damageMul: 0.98 }, canSuppress: true },
  red_dot: { id: 'red_dot', label: '红点瞄具', slot: '瞄具', icon: 'red-dot', compatible: ['AK-47', 'M4A1', 'MP5', '霰弹枪', 'Glock 17'], bonus: '散布降低 8%', mods: { spreadMul: 0.92 } },
  scope_4x: { id: 'scope_4x', label: '4× 光学瞄准镜', slot: '瞄具', icon: 'scope', compatible: ['AWP'], bonus: '有效射程 +22%，散布降低 28%', mods: { rangeMul: 1.22, spreadMul: 0.72 } },
  angled_grip: { id: 'angled_grip', label: '斜角握把', slot: '护木', icon: 'angled-grip', compatible: ['AK-47', 'M4A1', 'MP5', '霰弹枪'], bonus: '后坐力降低 18%', mods: { recoilMul: 0.82 } },
  extended_mag: { id: 'extended_mag', label: '扩容弹匣', slot: '弹匣', icon: 'extended-mag', compatible: ['AK-47', 'M4A1', 'MP5'], bonus: '弹匣容量 +12，换弹慢 8%', mods: { magAdd: 12, reloadMul: 1.08 } },
  pistol_extended_mag: { id: 'pistol_extended_mag', label: '手枪扩容弹匣', slot: '弹匣', icon: 'extended-mag', compatible: ['Glock 17'], bonus: '弹匣容量 +6，换弹慢 5%', mods: { magAdd: 6, reloadMul: 1.05 } },
  pistol_compensator: { id: 'pistol_compensator', label: '手枪补偿器', slot: '枪口', icon: 'muzzle-brake', compatible: ['Glock 17'], bonus: '后坐力降低 16%，枪声略远', mods: { recoilMul: 0.84, soundRadiusMul: 1.1 } },
  tactical_stock: { id: 'tactical_stock', label: '战术枪托', slot: '枪托', icon: 'stock', compatible: ['AK-47', 'M4A1', 'MP5'], bonus: '后坐力降低 15%', mods: { recoilMul: 0.85 } },
  laser_sight: { id: 'laser_sight', label: '激光指示器', slot: '下挂', icon: 'laser', compatible: ['AK-47', 'M4A1', 'MP5', 'AWP', '霰弹枪', 'Glock 17'], bonus: '散布降低 10%', mods: { spreadMul: 0.9 } },
  flashlight: { id: 'flashlight', label: '战术手电', slot: '下挂', icon: 'flashlight', compatible: ['AK-47', 'M4A1', 'MP5', 'AWP', '霰弹枪', 'Glock 17'], bonus: '暂无直接伤害加成，提供视觉辨识', mods: {} },
  muzzle_brake: { id: 'muzzle_brake', label: '枪口制退器', slot: '枪口', icon: 'muzzle-brake', compatible: ['AK-47', 'M4A1', 'AWP', '霰弹枪'], bonus: '后坐力降低 26%，枪声传播更远', mods: { recoilMul: 0.74, soundRadiusMul: 1.18 } },
  ap_round: { id: 'ap_round', label: '穿甲弹', slot: '弹药', icon: 'ap-round', compatible: ['AK-47', 'M4A1', 'MP5', 'AWP', '霰弹枪', 'Glock 17'], bonus: '伤害 +12%', mods: { damageMul: 1.12 } },
};

export function compatibleAttachments(basePreset) {
  return Object.values(GUN_ATTACHMENTS).filter((a) => a.compatible.includes(basePreset));
}

export function attachmentBonusLines(ids = []) {
  return ids.map((id) => GUN_ATTACHMENTS[id]).filter(Boolean).map((a) => ({ id: a.id, label: a.label, slot: a.slot, bonus: a.bonus }));
}

function attachmentParts(gun, ids) {
  // 配件锚点按各款枪的实际几何位置单独标定。不能用整枪 minY/maxY 推算：
  // AK 的弯弹匣很长、AWP 自带镜、Glock 枪身很短，通用边界会把配件挂到空中。
  const preset = gun.basePreset || gun.name || 'AK-47';
  const mounts = {
    'AK-47':   { rail: { x: 88, y: 12 }, under: { x: 128, y: 31 }, mag: { x: 88, y: 69 }, stock: { x: 3, y: 25 }, receiver: { x: 86, y: 24 } },
    'M4A1':    { rail: { x: 87, y: 13 }, under: { x: 114, y: 30 }, mag: { x: 81, y: 57 }, stock: { x: 1, y: 27 }, receiver: { x: 79, y: 26 } },
    'AWP':     { rail: { x: 75, y: 12 }, under: { x: 119, y: 27 }, mag: { x: 78, y: 46 }, stock: { x: 5, y: 26 }, receiver: { x: 72, y: 25 } },
    'MP5':     { rail: { x: 49, y: 13 }, under: { x: 84, y: 31 }, mag: { x: 51, y: 57 }, stock: { x: 2, y: 26 }, receiver: { x: 47, y: 25 } },
    '霰弹枪':   { rail: { x: 104, y: 18 }, under: { x: 107, y: 35 }, mag: { x: 111, y: 36 }, stock: { x: 4, y: 27 }, receiver: { x: 58, y: 25 } },
    'Glock 17': { rail: { x: 61, y: 12 }, under: { x: 66, y: 26 }, mag: { x: 52, y: 51 }, stock: { x: 30, y: 24 }, receiver: { x: 58, y: 20 } },
  };
  const m = mounts[preset] || mounts['AK-47'];
  const idsSafe = [];
  const usedSlots = new Set();
  for (const id of (Array.isArray(ids) ? ids : [])) {
    const def = GUN_ATTACHMENTS[id];
    if (!def || !def.compatible.includes(preset) || usedSlots.has(def.slot)) continue;
    usedSlots.add(def.slot);
    idsSafe.push(id);
  }
  const mx = Number(gun.baseMuzzle?.x ?? gun.muzzle?.x);
  const my = Number(gun.baseMuzzle?.y ?? gun.muzzle?.y);
  const muzzleX = Number.isFinite(mx) ? mx : 170;
  const muzzleY = Number.isFinite(my) ? my : 24;
  const visual = [];
  const add = (id, x, y, w, h, color, r = 2) => {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
    visual.push({ x, y, w, h, color, r, attachmentId: id });
  };
  const { rail, under, mag, stock, receiver } = m;

  for (const id of idsSafe) {
    switch (id) {
      // 枪口组件从枪管末端往前延伸，底边与枪管中心线对齐。
      case 'suppressor':
        add(id, muzzleX - 4, muzzleY - 4, 18, 8, '#333c49');
        add(id, muzzleX - 2, muzzleY - 2, 14, 2, '#8c9aaa');
        add(id, muzzleX + 8, muzzleY - 3, 2, 6, '#202a35');
        break;
      case 'glock_suppressor':
        add(id, muzzleX - 3, muzzleY - 3, 19, 6, '#283441');
        add(id, muzzleX - 1, muzzleY - 1, 15, 2, '#9aa9b8');
        break;
      case 'mp5_integral':
        add(id, muzzleX - 5, muzzleY - 4, 17, 8, '#293745');
        add(id, muzzleX - 3, muzzleY - 1, 12, 2, '#758899');
        break;
      case 'awp_suppressor':
        add(id, muzzleX - 7, muzzleY - 5, 28, 10, '#273342');
        add(id, muzzleX - 5, muzzleY - 2, 23, 2, '#8191a2');
        break;
      case 'pistol_compensator':
        add(id, muzzleX - 2, muzzleY - 3, 8, 6, '#323e4c');
        add(id, muzzleX + 2, muzzleY - 2, 2, 4, '#a9b7c4');
        break;
      case 'muzzle_brake':
        add(id, muzzleX - 3, muzzleY - 4, 9, 8, '#303945');
        add(id, muzzleX - 1, muzzleY - 3, 2, 6, '#a5b1bd');
        break;
      // 光学件下沿直接落在该枪导轨线上；AWP 的固定镜体作为基础机匣的一部分，4x 模块覆在同一安装位。
      case 'red_dot':
        add(id, rail.x - 8, rail.y - 7, 16, 7, '#242d38');
        add(id, rail.x - 4, rail.y - 10, 8, 3, '#ffb14a');
        add(id, rail.x - 2, rail.y - 9, 4, 2, '#91d5ee');
        break;
      case 'scope_4x':
        if (preset === 'AWP') {
          add(id, rail.x - 23, rail.y - 10, 44, 10, '#25303e', 4);
          add(id, rail.x - 20, rail.y - 7, 5, 5, '#8fcce8', 2);
          add(id, rail.x + 15, rail.y - 7, 5, 5, '#8fcce8', 2);
        } else {
          add(id, rail.x - 17, rail.y - 10, 34, 10, '#25303e', 4);
          add(id, rail.x - 14, rail.y - 7, 4, 4, '#8fcce8', 2);
          add(id, rail.x + 10, rail.y - 7, 4, 4, '#8fcce8', 2);
        }
        break;
      // 下挂设备顶部和护木底部轻微重叠，视觉上会“贴”在枪上，而不是悬空。
      case 'angled_grip':
        add(id, under.x - 4, under.y - 1, 9, 12, '#313b47');
        add(id, under.x - 3, under.y + 2, 3, 7, '#778594');
        add(id, under.x + 1, under.y + 5, 3, 4, '#202a35');
        break;
      case 'laser_sight':
        add(id, under.x - 14, under.y - 1, 13, 5, '#2d3946');
        add(id, under.x - 4, under.y, 3, 3, '#db514b');
        break;
      case 'flashlight':
        add(id, under.x - 19, under.y - 1, 15, 6, '#394653');
        add(id, under.x - 6, under.y, 3, 4, '#d6e8ed');
        break;
      // 弹匣扩容从原弹匣底部向下延长，前两像素重叠，避免与原弹匣脱节。
      case 'extended_mag':
        add(id, mag.x - 6, mag.y - 2, 12, 13, '#424d5a');
        add(id, mag.x - 3, mag.y, 2, 9, '#9aa8b5');
        break;
      case 'pistol_extended_mag':
        add(id, mag.x - 5, mag.y - 2, 10, 10, '#394756');
        add(id, mag.x - 2, mag.y, 2, 6, '#a3b0bd');
        break;
      // 枪托配件只画缓冲垫/后托板，不再把整块枪托放到握把附近。
      case 'tactical_stock':
        add(id, stock.x - 2, stock.y - 8, 5, 16, '#394655');
        add(id, stock.x - 3, stock.y - 5, 2, 10, '#8995a1');
        break;
      // 穿甲弹属于弹药配置：在机匣附近给一个小型黄铜/红铜识别块，不再漂浮到整枪最下方。
      case 'ap_round':
        add(id, receiver.x - 3, receiver.y + 3, 6, 5, '#d46d43');
        add(id, receiver.x - 2, receiver.y + 4, 2, 3, '#e2bd76');
        break;
    }
  }
  return { ids: idsSafe, parts: visual };
}

export function resolveGunBuild(gun) {
  const input = gun || GUN_PRESETS['AK-47'];
  const isPreset = !!input.basePreset && !!GUN_PRESETS[input.basePreset];
  const basePreset = isPreset ? input.basePreset : (GUN_PRESETS[input.name] ? input.name : null);
  const baseStats = basePreset === 'Glock 17' ? PISTOL_STATS : (basePreset ? (WEAPON_STATS[basePreset] ?? DEFAULT_STATS) : DEFAULT_STATS);
  const modParts = attachmentParts({ ...input, basePreset: basePreset || input.name }, input.attachments || []);
  const mods = {};
  for (const id of modParts.ids) {
    for (const [key, value] of Object.entries(GUN_ATTACHMENTS[id].mods || {})) {
      if (key.endsWith('Mul')) mods[key] = (mods[key] ?? 1) * value;
      else mods[key] = (mods[key] ?? 0) + value;
    }
  }
  const stats = { ...baseStats };
  for (const key of ['damage', 'rpm', 'spread', 'reload', 'range', 'recoil']) {
    const mk = `${key}Mul`;
    if (mods[mk] != null) stats[key] *= mods[mk];
  }
  if (mods.magAdd) stats.mag = Math.max(1, Math.round(stats.mag + mods.magAdd));
  stats.damage = Math.round(stats.damage * 10) / 10;
  stats.rpm = Math.round(stats.rpm);
  stats.spread = +stats.spread.toFixed(3);
  stats.reload = +stats.reload.toFixed(2);
  stats.range = Math.round(stats.range);
  stats.recoil = +stats.recoil.toFixed(3);
  stats.soundRadiusMul = mods.soundRadiusMul ?? 1;
  stats.suppressionRadiusMul = mods.suppressionRadiusMul ?? 1;
  stats.soundIntensityMul = mods.soundIntensityMul ?? 1;
  const attachmentColors = normalizeAttachmentColors(input.attachmentColors);
  const coloredIds = new Set();
  // 每个配件的首个主结构使用自定义色，其余高光/玻璃/螺丝保持对比色，避免整块糊成一个颜色。
  const visualParts = modParts.parts.map((part) => {
    const color = attachmentColors[part.attachmentId];
    if (color && !coloredIds.has(part.attachmentId)) {
      coloredIds.add(part.attachmentId);
      return { ...part, color };
    }
    return { ...part };
  });
  const baseMuzzle = { ...(input.baseMuzzle || input.muzzle || { x: 170, y: 24 }) };
  const muzzleSuppressor = modParts.ids.some((id) => ['suppressor', 'mp5_integral', 'awp_suppressor', 'glock_suppressor'].includes(id));
  const runtimeMuzzle = { ...baseMuzzle };
  if (muzzleSuppressor) runtimeMuzzle.x += modParts.ids.includes('awp_suppressor') ? 21 : modParts.ids.includes('glock_suppressor') ? 16 : modParts.ids.includes('suppressor') ? 14 : 12;
  return {
    ...input,
    name: basePreset || input.name || '自定义主武器',
    customName: input.customName || '',
    basePreset: basePreset || input.basePreset || null,
    attachments: modParts.ids,
    attachmentColors,
    baseParts: (input.baseParts || input.parts || []).filter((p) => !p.attachmentId).map((p) => ({ ...p })),
    baseMuzzle: { ...baseMuzzle },
    parts: [...(input.baseParts || input.parts || []).filter((p) => !p.attachmentId).map((p) => ({ ...p })), ...visualParts],
    muzzle: runtimeMuzzle,
    stats,
    attachmentBonuses: attachmentBonusLines(modParts.ids),
    attachmentVisualParts: visualParts,
  };
}

export const RETICLE_KEY = 'contra-custom-reticle-v1';
export const DEFAULT_RETICLE = Object.freeze({ style: 'classic', color: '#ffb14a', size: 8, gap: 4 });
let reticleCacheRaw;
let reticleCache = { ...DEFAULT_RETICLE };
let reticleCacheReady = false;
export function loadReticleSettings() {
  if (reticleCacheReady) return reticleCache;
  let raw = null;
  try { raw = localStorage.getItem(RETICLE_KEY); } catch { /* ignore */ }
  reticleCacheRaw = raw;
  reticleCacheReady = true;
  try {
    const o = JSON.parse(raw || '{}') || {};
    reticleCache = {
      style: ['classic', 'dot', 'plus', 'bracket', 'circle'].includes(o.style) ? o.style : DEFAULT_RETICLE.style,
      color: /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : DEFAULT_RETICLE.color,
      size: Math.max(4, Math.min(18, Number(o.size) || DEFAULT_RETICLE.size)),
      gap: Math.max(2, Math.min(10, Number(o.gap) || DEFAULT_RETICLE.gap)),
    };
  } catch { reticleCache = { ...DEFAULT_RETICLE }; }
  return reticleCache;
}
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === RETICLE_KEY || e.key === null) reticleCacheReady = false; });

export function saveReticleSettings(value) {
  const next = { ...DEFAULT_RETICLE, ...(value || {}) };
  try { localStorage.setItem(RETICLE_KEY, JSON.stringify(next)); reticleCacheRaw = JSON.stringify(next); reticleCacheReady = true; reticleCache = { ...DEFAULT_RETICLE, ...next }; return true; }
  catch { return false; }
}


// 每种枪型保留一份独立 DIY 蓝图：换枪不会把上一把的颜色/配件/握点覆盖掉。
export const GUN_BUILDS_KEY = 'contra-gun-builds-v1';
const PRIMARY_GUN_KEY = 'contra-gun-primary';
function validGunBlueprint(g) {
  return !!g && Array.isArray(g.parts) && g.parts.length > 0
    && !!g.grips?.front && !!g.grips?.rear && !!g.muzzle && Number(g.meterScale) > 0;
}
function normalizeAttachmentColors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [id, color] of Object.entries(value)) {
    if (Object.prototype.hasOwnProperty.call(GUN_ATTACHMENTS, id) && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) out[id] = color;
  }
  return out;
}
function toGunBlueprint(gun) {
  const input = gun || {};
  const preset = GUN_PRESETS[input.basePreset] ? input.basePreset : (GUN_PRESETS[input.name] ? input.name : null);
  const rawParts = Array.isArray(input.baseParts) ? input.baseParts : (Array.isArray(input.parts) ? input.parts.filter((p) => !p.attachmentId) : []);
  return {
    name: preset || input.name || '自定义主武器',
    customName: String(input.customName || '').slice(0, 24),
    basePreset: preset,
    meterScale: Number(input.meterScale) > 0 ? Number(input.meterScale) : METER_SCALE,
    parts: rawParts.map((p) => ({ ...p })),
    grips: { front: { ...(input.grips?.front || { x: 129, y: 27 }) }, rear: { ...(input.grips?.rear || { x: 71, y: 42 }) } },
    muzzle: { ...(input.baseMuzzle || input.muzzle || { x: 176, y: 27 }) },
    attachments: Array.isArray(input.attachments) ? [...input.attachments] : [],
    attachmentColors: normalizeAttachmentColors(input.attachmentColors),
  };
}
function readGunProfiles() {
  try {
    const o = JSON.parse(localStorage.getItem(GUN_BUILDS_KEY) || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}
export function loadGunBlueprint(basePreset) {
  const key = GUN_PRESETS[basePreset] ? basePreset : 'AK-47';
  const profiles = readGunProfiles();
  const saved = profiles[key];
  if (validGunBlueprint(saved)) return toGunBlueprint({ ...saved, basePreset: key, name: key });
  // 迁移旧存档：如果当前主武器就是所选枪型，也把旧的单槽配置识别为该枪型配置。
  try {
    const active = JSON.parse(localStorage.getItem(PRIMARY_GUN_KEY) || 'null');
    const activeBase = active?.basePreset || (GUN_PRESETS[active?.name] ? active.name : null);
    if (activeBase === key && validGunBlueprint(active)) return toGunBlueprint({ ...active, basePreset: key, name: key });
  } catch { /* 忽略损坏存档 */ }
  return toGunBlueprint({ ...GUN_PRESETS[key], basePreset: key, name: key, attachments: [] });
}
export function loadGunBuild(basePreset) { return resolveGunBuild(loadGunBlueprint(basePreset)); }
export function saveGunBuild(gun) {
  try {
    const blueprint = toGunBlueprint(gun);
    if (!blueprint.basePreset || !validGunBlueprint(blueprint)) return false;
    // 用解析后的兼容列表规范化存档，防止旧存档或手改 JSON 造成同槽重复配件。
    blueprint.attachments = resolveGunBuild(blueprint).attachments;
    const profiles = readGunProfiles();
    profiles[blueprint.basePreset] = blueprint;
    localStorage.setItem(GUN_BUILDS_KEY, JSON.stringify(profiles));
    return true;
  } catch { return false; }
}
export function saveActiveGunBuild(gun) {
  try {
    const blueprint = toGunBlueprint(gun);
    if (!blueprint.basePreset || !validGunBlueprint(blueprint)) return false;
    if (!saveGunBuild(blueprint)) return false;
    if (blueprint.basePreset === 'Glock 17') return true; // 副武器有独立蓝图，不覆盖主武器槽
    localStorage.setItem(PRIMARY_GUN_KEY, JSON.stringify(blueprint));
    return true;
  } catch { return false; }
}

// 从 localStorage 读取当前主武器;旧版单槽存档会自动迁移到该枪型的独立蓝图。
// ⚠️ stats 永远按枪名从 WEAPON_STATS 刷新(旧存档里烤着过时的音效/数值词条;
//    自定义枪=未知名字 → DEFAULT_STATS 兜底)
export function loadSavedGun() {
  try {
    const raw = localStorage.getItem(PRIMARY_GUN_KEY);
    if (!raw) return loadGunBuild('AK-47');
    const g = JSON.parse(raw);
    if (!validGunBlueprint(g) || g.basePreset === 'Glock 17' || g.name === 'Glock 17') return loadGunBuild('AK-47');
    const normalized = toGunBlueprint({ ...g, basePreset: g.basePreset || (GUN_PRESETS[g.name] ? g.name : null) });
    const resolved = resolveGunBuild(normalized);
    // 写入新 profile 存档，方便首次换枪后仍能找回这一把的 DIY 配置。
    saveGunBuild(normalized);
    return resolved;
  } catch {
    return loadGunBuild('AK-47');
  }
}

// ---- 装备系统(纸娃娃挂点式):头盔挂头部局部空间,防弹衣挂躯干局部空间 ----
// parts 坐标:200px = 1m,原点 = 对应身体部件中心(头圆心 / 躯干中心)
// 头半径 30px;躯干 60×104px。⚠️ 必须左右对称——头部/躯干局部空间不随朝向镜像。
export const EQUIP_SLOTS = {
  head: { label: '头盔', key: 'contra-equip-head' },
  torso: { label: '防弹衣', key: 'contra-equip-torso' },
};

export const EQUIP_PRESETS = {
  helmet_military: {
    name: '军用钢盔', slot: 'head', defense: 0.35, meterScale: 200,
    parts: [
      { x: -34, y: -46, w: 68, h: 32, color: '#7c8f4e', r: 14 },  // 盔壳(橄榄绿)
      { x: -38, y: -18, w: 76, h: 9,  color: '#5d6e3a', r: 4 },   // 盔沿
      { x: -26, y: -43, w: 40, h: 8,  color: '#93a765', r: 4 },   // 盔顶高光
    ],
  },
  helmet_fast: {
    name: 'FAST战术盔', slot: 'head', defense: 0.4, meterScale: 200,
    parts: [
      { x: -6,  y: -54, w: 12, h: 10, color: '#4a556a', r: 2 },   // NVG座
      { x: -35, y: -48, w: 70, h: 36, color: '#7d8ba0', r: 13 },  // 盔壳(蓝灰)
      { x: -38, y: -16, w: 76, h: 8,  color: '#59657a', r: 4 },   // 盔沿
      { x: -39, y: -40, w: 12, h: 8,  color: '#59657a', r: 3 },   // 左导轨
      { x: 27,  y: -40, w: 12, h: 8,  color: '#59657a', r: 3 },   // 右导轨
      { x: -26, y: -45, w: 36, h: 7,  color: '#98a7bd', r: 3 },   // 盔顶高光
    ],
  },
  helmet_swat: {
    name: '特警盔', slot: 'head', defense: 0.4, meterScale: 200,
    parts: [
      { x: -34, y: -48, w: 68, h: 38, color: '#3a3f47', r: 13 },  // 盔壳(黑)
      { x: -28, y: -18, w: 56, h: 20, color: '#23272d', r: 9 },   // 面罩框
      { x: -25, y: -15, w: 50, h: 14, color: '#59c2ff', r: 6 },   // 面罩玻璃(亮)
      { x: -24, y: -45, w: 34, h: 6,  color: '#596069', r: 3 },   // 顶部高光
    ],
  },
  helmet_heavy: {
    name: '重装钢盔', slot: 'head', defense: 0.5, meterScale: 200,
    parts: [
      { x: -36, y: -50, w: 72, h: 40, color: '#8a93a3', r: 12 },  // 盔壳(亮钢)
      { x: -6,  y: -50, w: 12, h: 38, color: '#a3adbd', r: 5 },   // 中央脊
      { x: -40, y: -14, w: 80, h: 10, color: '#6b7484', r: 4 },   // 宽盔沿
      { x: -28, y: -38, w: 5,  h: 5,  color: '#4f5866', r: 2 },   // 铆钉×4
      { x: 23,  y: -38, w: 5,  h: 5,  color: '#4f5866', r: 2 },
      { x: -28, y: -24, w: 5,  h: 5,  color: '#4f5866', r: 2 },
      { x: 23,  y: -24, w: 5,  h: 5,  color: '#4f5866', r: 2 },
    ],
  },
  vest_light: {
    name: '轻型防弹背心', slot: 'torso', defense: 0.25, meterScale: 200,
    parts: [
      { x: -34, y: -46, w: 68, h: 92, color: '#7c8f4e', r: 10 },  // 主体(橄榄绿)
      { x: -34, y: -46, w: 68, h: 12, color: '#93a765', r: 5 },   // 领口
      { x: -3,  y: -34, w: 6,  h: 78, color: '#5d6e3a', r: 3 },   // 前拉链
      { x: -29, y: -8,  w: 25, h: 23, color: '#5d6e3a', r: 4 },   // 左弹匣袋
      { x: 4,   y: -8,  w: 25, h: 23, color: '#5d6e3a', r: 4 },   // 右弹匣袋
      { x: -34, y: 36,  w: 68, h: 12, color: '#4a5530', r: 4 },   // 腰封
      { x: -7,  y: 38,  w: 14, h: 8,  color: '#c9a227', r: 2 },   // 金色扣
    ],
  },
  vest_swat: {
    name: '特警背心', slot: 'torso', defense: 0.4, meterScale: 200,
    parts: [
      { x: -12, y: -48, w: 8,  h: 22, color: '#23272d', r: 3 },   // 左肩带
      { x: 4,   y: -48, w: 8,  h: 22, color: '#23272d', r: 3 },   // 右肩带
      { x: -36, y: -48, w: 72, h: 96, color: '#3a3f47', r: 8 },   // 主体(黑)
      { x: -36, y: -48, w: 72, h: 12, color: '#4f5866', r: 5 },   // 领口
      { x: -30, y: -28, w: 60, h: 6,  color: '#23272d', r: 3 },   // MOLLE ×3
      { x: -30, y: -8,  w: 60, h: 6,  color: '#23272d', r: 3 },
      { x: -30, y: 12,  w: 60, h: 6,  color: '#23272d', r: 3 },
      { x: -27, y: 24,  w: 23, h: 18, color: '#4f5866', r: 3 },   // 腰袋×2
      { x: 4,   y: 24,  w: 23, h: 18, color: '#4f5866', r: 3 },
    ],
  },
  vest_heavy: {
    name: '重型防弹衣', slot: 'torso', defense: 0.5, meterScale: 200,
    parts: [
      { x: -12, y: -50, w: 8,  h: 24, color: '#59657a', r: 3 },   // 肩带×2
      { x: 4,   y: -50, w: 8,  h: 24, color: '#59657a', r: 3 },
      { x: -38, y: -50, w: 76, h: 100, color: '#7d8ba0', r: 8 },  // 主体(蓝灰)
      { x: -38, y: -50, w: 76, h: 13, color: '#59657a', r: 5 },   // 领口
      { x: -30, y: -40, w: 60, h: 62, color: '#98a7bd', r: 6 },   // 前插板(亮钢)
      { x: -29, y: 28,  w: 25, h: 18, color: '#59657a', r: 3 },   // 腰袋×2
      { x: 4,   y: 28,  w: 25, h: 18, color: '#59657a', r: 3 },
      { x: -38, y: 42,  w: 76, h: 12, color: '#4f5866', r: 4 },   // 腰封
      { x: -8,  y: 44,  w: 16, h: 8,  color: '#c9a227', r: 2 },   // 金扣
    ],
  },
  vest_recon: {
    name: '侦察背心', slot: 'torso', defense: 0.2, meterScale: 200,
    parts: [
      { x: -32, y: -44, w: 64, h: 88, color: '#b89968', r: 10 },  // 主体(沙色)
      { x: -32, y: -44, w: 64, h: 11, color: '#cbb083', r: 5 },   // 领口
      { x: -26, y: -12, w: 18, h: 21, color: '#9a7f52', r: 3 },   // 弹匣袋×2
      { x: -4,  y: -12, w: 18, h: 21, color: '#9a7f52', r: 3 },
      { x: 14,  y: -36, w: 11, h: 19, color: '#3a3f47', r: 2 },   // 电台
      { x: 22,  y: -48, w: 3,  h: 14, color: '#23272d', r: 1 },   // 天线
      { x: -32, y: 34,  w: 64, h: 10, color: '#9a7f52', r: 4 },   // 腰带
    ],
  },
};

// 全新存档(从未在设计器里穿戴过)的出厂默认装备
export const DEFAULT_EQUIP = { head: 'helmet_military', torso: 'vest_light' };

export function loadEquip(slot) {
  const fallback = () => {
    const p = EQUIP_PRESETS[DEFAULT_EQUIP[slot]];
    return p ? { ...p } : null;
  };
  try {
    const raw = localStorage.getItem(`contra-equip-${slot}`);
    if (!raw) return fallback();                       // 从没动过 → 出厂默认穿戴
    const eq = JSON.parse(raw);
    if (!eq || !Array.isArray(eq.parts)) return fallback();
    if (!eq.parts.length) return null;                 // 编辑器里明确"脱下"(空 parts)
    return eq;
  } catch {
    return fallback();
  }
}

export function saveEquip(slot, data) {
  try {
    if (data) localStorage.setItem(`contra-equip-${slot}`, JSON.stringify(data));
    else localStorage.removeItem(`contra-equip-${slot}`);
  } catch { /* 忽略 */ }
}

// ---- 素材库(装备工坊抠好的 PNG,键 -> dataURL) ----
// 装备 parts 支持 {img: 素材id, x, y, w, h, rot} 图片零件,drawEquip 渲染时按 id 取图
export function loadAssets() {
  try { return JSON.parse(localStorage.getItem('contra-assets') || '{}'); }
  catch { return {}; }
}

export function saveAssets(assets) {
  try { localStorage.setItem('contra-assets', JSON.stringify(assets)); return true; }
  catch { return false; } // 超出 localStorage 配额等
}

