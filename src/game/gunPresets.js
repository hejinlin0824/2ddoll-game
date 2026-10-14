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
      { x: 58,  y: 1,  w: 22, h: 13, color: '#3a3f47', r: 3 },  // 红点镜
      { x: 61,  y: 4,  w: 5,  h: 8,  color: '#59c2ff', r: 2 },  // 镜片(亮)
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
};

// 把词条挂到预设枪上;存档里没词条的按名字回填,对不上给兜底
for (const [k, g] of Object.entries(GUN_PRESETS)) g.stats = WEAPON_STATS[k] ?? { ...DEFAULT_STATS };

// 从 localStorage 读取玩家设计的主武器;无效则回退 AK-47。
// ⚠️ stats 永远按枪名从 WEAPON_STATS 刷新(旧存档里烤着过时的音效/数值词条;
//    自定义枪=未知名字 → DEFAULT_STATS 兜底)
export function loadSavedGun() {
  const withStats = (g) => ({ ...g, stats: { ...(WEAPON_STATS[g.name] ?? DEFAULT_STATS) } });
  try {
    const raw = localStorage.getItem('contra-gun-primary');
    if (!raw) return withStats(GUN_PRESETS['AK-47']);
    const g = JSON.parse(raw);
    if (!g || !Array.isArray(g.parts) || !g.parts.length || !g.grips?.front || !g.grips?.rear || !g.muzzle || !(g.meterScale > 0)) {
      return withStats(GUN_PRESETS['AK-47']);
    }
    return withStats(g);
  } catch {
    return withStats(GUN_PRESETS['AK-47']);
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
