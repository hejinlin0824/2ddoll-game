// 枪械数据格式(设计器与游戏共用):
// {
//   name, meterScale (px/米), parts: [{x,y,w,h,color}],   // 全部在"设计坐标"(px,x向枪口,y向下)
//   grips: { front: {x,y}, rear: {x,y} },                 // 前手捏握点 / 后手枪把握点
//   muzzle: {x,y}                                          // 枪口(子弹出发点)
// }
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

export const GUN_PRESETS = {
  'AK-47': {
    name: 'AK-47', meterScale: METER_SCALE,
    parts: [
      { x: 8,   y: 22, w: 56, h: 12, color: '#8a5a30' }, // 枪托
      { x: 60,  y: 20, w: 55, h: 18, color: '#565f6d' }, // 机匣
      { x: 66,  y: 38, w: 10, h: 20, color: '#8a5a30' }, // 握把
      { x: 84,  y: 38, w: 16, h: 22, color: '#434852' }, // 弹匣
      { x: 112, y: 20, w: 34, h: 14, color: '#6b4a2e' }, // 护木
      { x: 115, y: 24, w: 58, h: 7,  color: '#4a525e' }, // 枪管
      { x: 150, y: 15, w: 6,  h: 11, color: '#4a525e' }, // 准星
    ],
    grips: { front: { x: 129, y: 27 }, rear: { x: 71, y: 42 } },
    muzzle: { x: 176, y: 27 },
  },
  'M4A1': {
    name: 'M4A1', meterScale: METER_SCALE,
    parts: [
      { x: 8,   y: 21, w: 52, h: 14, color: '#4a525e' }, // 枪托
      { x: 58,  y: 20, w: 50, h: 18, color: '#565f6d' }, // 机匣
      { x: 64,  y: 38, w: 10, h: 18, color: '#434852' }, // 握把
      { x: 80,  y: 38, w: 14, h: 20, color: '#565f6d' }, // 弹匣
      { x: 106, y: 20, w: 40, h: 13, color: '#4a525e' }, // 护木
      { x: 112, y: 24, w: 52, h: 6,  color: '#4a525e' }, // 枪管
      { x: 68,  y: 10, w: 30, h: 9,  color: '#2f3542' }, // 瞄具
    ],
    grips: { front: { x: 126, y: 26 }, rear: { x: 69, y: 41 } },
    muzzle: { x: 166, y: 27 },
  },
  '狙击枪': {
    name: '狙击枪', meterScale: METER_SCALE,
    parts: [
      { x: 6,   y: 22, w: 50, h: 14, color: '#6b4a2e' }, // 枪托
      { x: 54,  y: 22, w: 50, h: 16, color: '#4d5a68' }, // 机匣
      { x: 59,  y: 38, w: 10, h: 18, color: '#6b4a2e' }, // 握把
      { x: 80,  y: 38, w: 12, h: 15, color: '#434852' }, // 弹匣
      { x: 64,  y: 5,  w: 36, h: 11, color: '#2f3542' }, // 瞄具
      { x: 104, y: 26, w: 76, h: 6,  color: '#4a525e' }, // 枪管
      { x: 96,  y: 22, w: 14, h: 5,  color: '#4a525e' }, // 上护木
    ],
    grips: { front: { x: 122, y: 29 }, rear: { x: 64, y: 41 } },
    muzzle: { x: 182, y: 29 },
  },
};

// 从 localStorage 读取玩家设计的主武器;无效则回退 AK-47
export function loadSavedGun() {
  try {
    const raw = localStorage.getItem('contra-gun-primary');
    if (!raw) return { ...GUN_PRESETS['AK-47'] };
    const g = JSON.parse(raw);
    if (!g || !Array.isArray(g.parts) || !g.parts.length || !g.grips?.front || !g.grips?.rear || !g.muzzle || !(g.meterScale > 0)) {
      return { ...GUN_PRESETS['AK-47'] };
    }
    return g;
  } catch {
    return { ...GUN_PRESETS['AK-47'] };
  }
}

// ---- 装备系统(纸娃娃挂点式):头盔挂头部局部空间,防弹衣挂躯干局部空间 ----
// parts 坐标:200px = 1m,原点 = 对应身体部件中心(头圆心 / 躯干中心)
// 头半径 30px;躯干 60×104px
export const EQUIP_SLOTS = {
  head: { label: '头盔', key: 'contra-equip-head' },
  torso: { label: '防弹衣', key: 'contra-equip-torso' },
};

export const EQUIP_PRESETS = {
  helmet_military: {
    name: '军用头盔', slot: 'head', defense: 0.35, meterScale: 200,
    parts: [
      { x: -34, y: -48, w: 68, h: 34, color: '#6e8048', r: 12 },  // 盔壳(橄榄绿)
      { x: -37, y: -20, w: 74, h: 9,  color: '#2f3a26', r: 4 },   // 盔沿(深)
      { x: -28, y: -45, w: 56, h: 10, color: '#87995e', r: 5 },   // 盔顶高光
    ],
  },
  helmet_fast: {
    name: '快速头盔', slot: 'head', defense: 0.4, meterScale: 200,
    parts: [
      { x: -36, y: -50, w: 72, h: 42, color: '#5d6b7a', r: 10 },  // 盔壳(蓝灰)
      { x: -39, y: -16, w: 78, h: 9,  color: '#39424d', r: 4 },   // 盔沿
      { x: 28,  y: -44, w: 9,  h: 32, color: '#39424d', r: 3 },   // 侧导轨
      { x: -30, y: -47, w: 42, h: 8,  color: '#78859a', r: 4 },   // 盔顶高光
    ],
  },
  vest_light: {
    name: '轻型防弹背心', slot: 'torso', defense: 0.25, meterScale: 200,
    parts: [
      { x: -36, y: -46, w: 72, h: 92, color: '#6e8048', r: 10 },  // 主体(橄榄绿)
      { x: -36, y: -46, w: 72, h: 10, color: '#849661', r: 5 },   // 领口
      { x: -30, y: -10, w: 27, h: 24, color: '#55663c', r: 4 },   // 左弹匣袋
      { x: 3,   y: -10, w: 27, h: 24, color: '#55663c', r: 4 },   // 右弹匣袋
      { x: -5,  y: -46, w: 10, h: 92, color: '#55663c' },         // 中缝
    ],
  },
  vest_heavy: {
    name: '重型防弹衣', slot: 'torso', defense: 0.45, meterScale: 200,
    parts: [
      { x: -40, y: -50, w: 80, h: 98, color: '#5d6b7a', r: 10 },  // 主体(蓝灰)
      { x: -40, y: -50, w: 80, h: 12, color: '#78859a', r: 5 },   // 领口
      { x: -33, y: -12, w: 30, h: 28, color: '#464f5c', r: 4 },   // 弹匣袋 x2
      { x: 3,   y: -12, w: 30, h: 28, color: '#464f5c', r: 4 },
      { x: -33, y: 24,  w: 66, h: 16, color: '#464f5c', r: 4 },   // 腰封
      { x: 26,  y: -50, w: 10, h: 98, color: '#464f5c' },         // 侧板
    ],
  },
};

export function loadEquip(slot) {
  try {
    const raw = localStorage.getItem(`contra-equip-${slot}`);
    if (!raw) return null;
    const eq = JSON.parse(raw);
    if (!eq || !Array.isArray(eq.parts) || !eq.parts.length) return null;
    return eq;
  } catch {
    return null;
  }
}

export function saveEquip(slot, data) {
  try {
    if (data) localStorage.setItem(`contra-equip-${slot}`, JSON.stringify(data));
    else localStorage.removeItem(`contra-equip-${slot}`);
  } catch { /* 忽略 */ }
}
