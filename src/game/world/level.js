// 关卡地形:静态刚体 + 视差背景绘制
import { Box, Vec2 } from 'planck';
import { createRaidTraversalStairs, RAID_STAIR_OPENING } from '../domain/raidLayout.js';

export const CAT = { GROUND: 0x1, PLAYER: 0x2, LIMB: 0x4 };

// rects 以中心点 + 尺寸表示(米),type: ground=地表 / plat=悬浮平台
export const LEVEL = {
  bounds: { left: -12, right: 78 },
  spawn: { x: 0, y: 0 },
  rects: [],
};

// ---- 每关地形布局:主地表(90m)+ 各自的立体结构 ----
// 每关的 G 各自展开成独立对象(共享同一引用的话,一处原地改字段五关全被污染)
const ground90 = () => ({ x: 33, y: -1.5, w: 90, h: 3, type: 'ground', destructible: false }); // 共用主地表
export const LAYOUTS = {
  // 野外·月夜:开局制空台 + 中路台阶掩体 + 右缘投放场断崖
  wild: [
    ground90(),
    { x: 1.8, y: 2.1, w: 3.2, h: 0.5, type: 'plat' },
    { x: 7, y: 2.4, w: 3.6, h: 0.5, type: 'plat' },
    { x: 13.5, y: 3.8, w: 3.2, h: 0.5, type: 'plat' },
    { x: 20, y: 2.8, w: 3.6, h: 0.5, type: 'plat' },
    { x: 26.5, y: 0.5, w: 3, h: 1, type: 'ground' },
    { x: 30.2, y: 1.0, w: 3.4, h: 2, type: 'ground' },
    { x: 36.5, y: 0.3, w: 2.2, h: 0.6, type: 'ground' },
    { x: 40, y: 2.6, w: 4, h: 0.5, type: 'plat' },
    { x: 44.5, y: 0.35, w: 2.2, h: 0.7, type: 'ground' },
    { x: 47.5, y: 4.0, w: 3.4, h: 0.5, type: 'plat' },
    { x: 54, y: 2.4, w: 3.6, h: 0.5, type: 'plat' },
    { x: 60.5, y: 0.4, w: 3, h: 0.8, type: 'ground' },
    { x: 68.5, y: 0.9, w: 3, h: 1.6, type: 'ground' },
    // 战术掩体带：矮掩体能蹲伏遮挡，箱体可打碎；保留原有高台和守军点。
    { x: 4.8, y: 0.75, w: 2.6, h: 1.5, type: 'cover' },
    { x: 10.5, y: 0.52, w: 1.8, h: 1.04, type: 'crate' },
    { x: 23.6, y: 0.75, w: 2.2, h: 1.5, type: 'cover' },
    { x: 39.0, y: 0.75, w: 1.5, h: 1.5, type: 'steel' },
    { x: 51.3, y: 0.54, w: 2.8, h: 1.08, type: 'crate' },
    { x: 64.0, y: 0.75, w: 2.4, h: 1.5, type: 'cover' },
  ],
  // 屋顶·黎明:开阔长视线,双层高楼台塔(狙击对射),掩体极少 —— 走位就是命
  roof: [
    ground90(),
    { x: 4, y: 3.2, w: 5, h: 0.5, type: 'plat' },
    { x: 12, y: 4.6, w: 4.4, h: 0.5, type: 'plat' },
    { x: 19, y: 2.6, w: 3, h: 0.5, type: 'plat' },
    { x: 26.5, y: 0.5, w: 3, h: 1, type: 'ground' },
    { x: 35, y: 4.2, w: 5, h: 0.5, type: 'plat' },
    { x: 43, y: 2.6, w: 3.4, h: 0.5, type: 'plat' },
    { x: 50, y: 4.6, w: 4.4, h: 0.5, type: 'plat' },
    { x: 58, y: 2.6, w: 3, h: 0.5, type: 'plat' },
    { x: 66, y: 1.2, w: 4, h: 1.6, type: 'concrete' },
    // 屋顶不是全程裸奔：掩体错列放置，形成短冲刺线和可争夺的高位射界。
    { x: 8.8, y: 0.78, w: 2.0, h: 1.56, type: 'steel' },
    { x: 23.4, y: 0.75, w: 2.4, h: 1.5, type: 'cover' },
    { x: 31.0, y: 0.52, w: 1.8, h: 1.04, type: 'crate' },
    { x: 46.8, y: 0.75, w: 2.5, h: 1.5, type: 'concrete' },
    { x: 61.0, y: 0.52, w: 1.8, h: 1.04, type: 'crate' },
  ],
  // 港区·仓库:巷战 —— 掩体群密布(矮墙卡视线),平台少而碎,中近距离遭遇
  room: [
    ground90(),
    { x: 6, y: 0.4, w: 2.4, h: 0.8, type: 'concrete' },
    { x: 11, y: 2.4, w: 3, h: 0.5, type: 'plat' },
    { x: 16.5, y: 0.35, w: 2, h: 0.7, type: 'steel' },
    { x: 22, y: 0.45, w: 2.4, h: 0.9, type: 'crate' },
    { x: 27, y: 2.2, w: 3.4, h: 0.5, type: 'plat' },
    { x: 26.5, y: 0.5, w: 3, h: 1, type: 'concrete' },
    { x: 33, y: 0.35, w: 2, h: 0.7, type: 'steel' },
    { x: 38.5, y: 2.6, w: 3.6, h: 0.5, type: 'plat' },
    { x: 44, y: 0.4, w: 2.4, h: 0.8, type: 'concrete' },
    { x: 49.5, y: 0.35, w: 2, h: 0.7, type: 'steel' },
    { x: 55, y: 2.2, w: 3.4, h: 0.5, type: 'plat' },
    { x: 61, y: 0.5, w: 2.4, h: 1, type: 'crate' },
    { x: 67, y: 0.4, w: 3, h: 0.8, type: 'concrete' },
    // 港区仓库：将原有障碍视觉区分为混凝土柱/货箱，并补上近身掩体。
    { x: 3.6, y: 0.75, w: 1.7, h: 1.5, type: 'crate' },
    { x: 14.3, y: 0.56, w: 1.6, h: 1.12, type: 'steel' },
    { x: 35.4, y: 0.75, w: 1.8, h: 1.5, type: 'cover' },
    { x: 52.6, y: 0.75, w: 2.0, h: 1.5, type: 'crate' },
    { x: 64.0, y: 0.75, w: 1.7, h: 1.5, type: 'steel' },
  ],
  // 港口仓储·夜：长货柜巷道 + 分层吊机栈道 + 可破坏集装箱，不与剿匪建筑共享布局。
  port: [
    ground90(),
    // 地面码头：蓝色/锈红集装箱组成多条绕行线，箱体可被逐块打穿。
    { x: 5.5, y: 0.85, w: 5.8, h: 1.7, type: 'container', destructible: true },
    { x: 11.7, y: 0.85, w: 5.6, h: 1.7, type: 'container-red', destructible: true },
    { x: 23.0, y: 0.82, w: 4.8, h: 1.64, type: 'container', destructible: true },
    { x: 29.0, y: 0.82, w: 4.8, h: 1.64, type: 'container-red', destructible: true },
    { x: 41.5, y: 0.85, w: 6.2, h: 1.7, type: 'container', destructible: true },
    { x: 49.0, y: 0.85, w: 6.2, h: 1.7, type: 'container-red', destructible: true },
    { x: 63.0, y: 0.82, w: 4.8, h: 1.64, type: 'container', destructible: true },
    { x: 69.0, y: 0.82, w: 4.8, h: 1.64, type: 'container-red', destructible: true },
    // 第二层货柜与平台：高低错位，允许跳上集装箱，也可以从下方绕过。
    { x: 18.0, y: 2.45, w: 5.2, h: 1.6, type: 'container', destructible: true },
    { x: 36.8, y: 2.45, w: 5.0, h: 1.6, type: 'container-red', destructible: true },
    { x: 57.5, y: 2.45, w: 5.2, h: 1.6, type: 'container', destructible: true },
    // 吊机横梁与维护栈道（钢结构不易破坏），作为远程火力点和垂直机动路线。
    { x: 9.0, y: 4.15, w: 7.8, h: 0.34, type: 'steel', destructible: false },
    { x: 28.0, y: 5.2, w: 8.0, h: 0.34, type: 'steel', destructible: false },
    { x: 48.0, y: 4.45, w: 8.5, h: 0.34, type: 'steel', destructible: false },
    { x: 67.0, y: 5.3, w: 7.4, h: 0.34, type: 'steel', destructible: false },
    { x: 8.1, y: 2.85, w: 0.38, h: 5.9, type: 'steel', destructible: false },
    { x: 27.0, y: 2.6, w: 0.38, h: 7.0, type: 'steel', destructible: false },
    { x: 47.0, y: 2.55, w: 0.38, h: 6.3, type: 'steel', destructible: false },
    { x: 66.0, y: 2.6, w: 0.38, h: 7.2, type: 'steel', destructible: false },
    // 码头设备与矮掩体：既能遮蔽，也能被爆炸/子弹拆除。
    { x: 2.8, y: 0.55, w: 1.2, h: 1.1, type: 'crate', destructible: true },
    { x: 20.5, y: 0.52, w: 1.5, h: 1.04, type: 'steel', destructible: true },
    { x: 38.8, y: 0.58, w: 1.4, h: 1.16, type: 'crate', destructible: true },
    { x: 59.8, y: 0.52, w: 1.5, h: 1.04, type: 'steel', destructible: true },
    { x: 76.0, y: 0.55, w: 1.1, h: 1.1, type: 'crate', destructible: true },
  ],
  // 沙丘·正午:起伏沙脊(宽矮坡)+ 稀疏高岩 —— 人海冲锋,几乎无遮蔽
  desert: [
    ground90(),
    { x: 8, y: 1.1, w: 6, h: 1.2, type: 'rock' },
    { x: 18, y: 2.2, w: 5, h: 1.4, type: 'rock' },
    { x: 28, y: 0.8, w: 4, h: 0.8, type: 'rock' },
    { x: 36, y: 2.6, w: 3.6, h: 0.5, type: 'plat' },
    { x: 45, y: 1.4, w: 6, h: 1.2, type: 'rock' },
    { x: 55, y: 2.4, w: 4, h: 0.5, type: 'plat' },
    { x: 63, y: 1.2, w: 5, h: 1.1, type: 'rock' },
    { x: 70, y: 2.3, w: 3.4, h: 0.5, type: 'plat' },
    // 沙丘：自然沙脊作为高差，散布低矮沙袋提供临时防线，但不会把战场封死。
    { x: 3.8, y: 0.75, w: 2.3, h: 1.5, type: 'cover' },
    { x: 34.0, y: 0.54, w: 2.2, h: 1.08, type: 'crate' },
    { x: 57.6, y: 0.75, w: 2.6, h: 1.5, type: 'cover' },
  ],
  // 海岛·澜:棕榈跳台 + 浅滩石 —— 跳跃节奏关,平台间要跳
  tropic: [
    ground90(),
    { x: 5.5, y: 1.9, w: 2.6, h: 0.5, type: 'plat' },
    { x: 10.5, y: 3.1, w: 2.4, h: 0.5, type: 'plat' },
    { x: 15.5, y: 2.2, w: 2.6, h: 0.5, type: 'plat' },
    { x: 21, y: 0.5, w: 3, h: 1, type: 'rock' },
    { x: 26.5, y: 3.2, w: 2.4, h: 0.5, type: 'plat' },
    { x: 31.5, y: 2.1, w: 2.6, h: 0.5, type: 'plat' },
    { x: 37, y: 0.4, w: 2.6, h: 0.8, type: 'rock' },
    { x: 43.5, y: 3.0, w: 2.4, h: 0.5, type: 'plat' },
    { x: 49, y: 1.9, w: 2.6, h: 0.5, type: 'plat' },
    { x: 55, y: 0.45, w: 2.6, h: 0.9, type: 'rock' },
    { x: 61, y: 3.1, w: 2.4, h: 0.5, type: 'plat' },
    { x: 66.5, y: 2.0, w: 2.8, h: 0.5, type: 'plat' },
    // 海岛：岩石岛礁与漂流木箱交替，维持跳台节奏同时给地面战留出喘息位。
    { x: 3.0, y: 0.52, w: 1.6, h: 1.04, type: 'rock' },
    { x: 23.9, y: 0.75, w: 1.9, h: 1.5, type: 'crate' },
    { x: 40.6, y: 0.52, w: 2.0, h: 1.04, type: 'rock' },
    { x: 58.0, y: 0.54, w: 2.1, h: 1.08, type: 'crate' },
  ],
  // 剿匪行动·多层建筑：屋顶绳降进入，逐层清理到地面。墙体为可破坏 tile，
  // 门/灯保留单体刚体，门可用 E 打开或被子弹击毁，灯被击毁后环境光同步熄灭。
  raid: (() => {
    const floor = (x, y, w) => ({ x, y, w, h: 0.5, type: 'concrete', destructible: false });
    const wall = (x, floorTop, width = 0.28, height = 2.9) => ({
      x, y: floorTop + height / 2, w: width, h: height, type: 'wall', destructible: true,
    });
    const partition = (x, floorTop, id) => [
      wall(x - 1.35, floorTop, 0.28, 2.65),
      wall(x + 1.35, floorTop, 0.28, 2.65),
      { x, y: floorTop + 2.9, w: 3.0, h: 0.45, type: 'wall', destructible: true },
      { x, y: floorTop + 1.02, w: 2.42, h: 2.04, type: 'door', doorId: id, interactive: true, destructible: true, hp: 130, maxHp: 130, doorOpen: false, doorAngle: 0, hingeSide: 'left' },
    ];
    const lamp = (x, floorTop, id) => ({
      x, y: floorTop + 3.05, w: 0.68, h: 0.18, type: 'lamp', lampId: id,
      raidFloorId: Math.round(floorTop / 3.5), interactive: true, destructible: true, hp: 8, maxHp: 8,
    });
    const crate = (x, floorTop, type = 'crate') => ({ x, y: floorTop + 0.52, w: 1.0, h: 1.04, type, destructible: true });
    const floorSpan = (top) => [
      floor(RAID_STAIR_OPENING.left / 2, top, RAID_STAIR_OPENING.left),
      floor((74 + RAID_STAIR_OPENING.right) / 2, top, 74 - RAID_STAIR_OPENING.right),
    ];
    return [
      ground90(),
      // 入口配电柜位于地面入口侧，整栋楼清剿后也可在此发出撤离信号。
      { x: 2.5, y: 1.15, w: 0.46, h: 0.82, type: 'breaker', breakerId: 'main', raidFloorId: 0, interactive: true, destructible: false, sensor: true },
      // 二层 COMMS 机柜里放着本章真正要回收的失联名单；感应体不占用走廊碰撞空间。
      { x: 34.3, y: 4.2, w: 0.62, h: 0.74, type: 'intel', intelId: 'missing-list', raidFloorId: 1, interactive: true, destructible: false, sensor: true, intelSecured: false },
      // 四层统一保留同一条中央楼梯井。屋顶插入点在井道左侧，沿屋顶可直接抵达楼梯入口。
      ...floorSpan(10.25),
      ...floorSpan(6.75),
      ...floorSpan(3.25),
      // 建筑外侧可破坏墙柱；中央井道和回撤路线保持连续畅通。
      wall(0.25, 0, 0.5, 10.5), wall(73.75, 0, 0.5, 10.5),
      ...partition(11, 0, 'g-01'), ...partition(29, 0, 'g-02'), ...partition(42, 0, 'g-03'), ...partition(61, 0, 'g-04'),
      ...partition(17, 3.5, 'f1-01'), ...partition(37, 3.5, 'f1-02'), ...partition(58, 3.5, 'f1-03'),
      ...partition(23, 7, 'f2-01'), ...partition(43, 7, 'f2-02'), ...partition(62, 7, 'f2-03'),
      // 照明和掩体避开楼梯井，避免灯体、箱体压住上下楼梯的落点。
      ...[4, 19, 34, 57, 67].map((x, i) => lamp(x, 0, `g-lamp-${i}`)),
      ...[6, 28, 64, 66].map((x, i) => lamp(x, 3.5, `f1-lamp-${i}`)),
      ...[6, 31, 57, 68].map((x, i) => lamp(x, 7, `f2-lamp-${i}`)),
      ...createRaidTraversalStairs(),
      ...[crate(7, 0), crate(36, 0, 'steel'), crate(58, 0), crate(9, 3.5, 'steel'), crate(28, 3.5), crate(64, 3.5), crate(9, 7), crate(34, 7, 'steel'), crate(38, 7)],
    ];
  })(),
 };
// 场景 → 布局(custom 关卡由 loadCustomLevel 接管)
const savedScene = localStorage.getItem('contra-scene') || 'wild';
LEVEL.spawn = savedScene === 'raid' ? { x: 4.2, y: 10.5 } : { x: 0, y: 0 };
LEVEL.rects = (LAYOUTS[savedScene] || LAYOUTS.wild).slice();

// 块耐久:按面积算(平台 3.6x0.5 ≈ 72HP,步枪 3~4 发打穿);主地表不可破坏
export function ensureRectHp(r) {
  if (r.maxHp == null) {
    r.maxHp = Math.round(r.w * r.h * 40);
    r.hp = r.maxHp;
    r.destructible = r.destructible !== false; // 归一:默认可破坏,仅显式 false 例外
  }
  return r;
}

const TILE = 0.25; // 可破坏块的细分粒度(米):碎块更小更密,弹坑更细腻(耐久按面积自动缩放)

export function buildLevel(world) {
  const bodies = [];
  // 先把可破坏块替换成 0.25m tile 网格(tile 也是小 rect,所有遍历点零改动),
  // 子弹命中某 tile 只碎那一片 —— 局部弹坑,而不是整块消失
  for (let i = LEVEL.rects.length - 1; i >= 0; i--) {
    const r = LEVEL.rects[i];
    if (r.destructible === false || r.interactive) continue;
    const cols = Math.max(1, Math.round(r.w / TILE));
    const rows = Math.max(1, Math.round(r.h / TILE));
    const tw = r.w / cols, th = r.h / rows;
    const isContainer = r.type === 'container' || r.type === 'container-red';
    // 破坏仍按小 tile 结算，但视觉使用完整货柜的统一坐标网格；打碎某块后只留下真正缺口，不出现满屏小方格边线。
    const visualGroup = isContainer ? { x: r.x, y: r.y, w: r.w, h: r.h, type: r.type } : null;
    for (let c = 0; c < cols; c++) {
      for (let ro = 0; ro < rows; ro++) {
        LEVEL.rects.push({
          x: r.x - r.w / 2 + tw * (c + 0.5),
          y: r.y - r.h / 2 + th * (ro + 0.5),
          w: tw, h: th, type: r.type, destructible: true,
          ...(visualGroup ? { visualGroup } : {}),
        });
      }
    }
    LEVEL.rects.splice(i, 1);
  }
  for (const r of LEVEL.rects) {
    ensureRectHp(r);
    const b = world.createBody({ type: 'static', position: Vec2(r.x, r.y) });
    b.createFixture(new Box(r.w / 2, r.h / 2), {
      isSensor: !!r.sensor,
      friction: 0.4,
      filterCategoryBits: CAT.GROUND,
      filterMaskBits: 0xffff,
    });
    r.body = b; // 破坏时 destroyBody 用(rect 与 body 同生命周期)
    bodies.push(b);
  }
  return bodies;
}

// 破坏一块地形(tile 或整块):从 rects 移除 + 销毁刚体(调用方负责特效/音效)
export function destroyRect(r) {
  const i = LEVEL.rects.indexOf(r);
  if (i >= 0) LEVEL.rects.splice(i, 1);
  if (r.body) { try { r.body.getWorld().destroyBody(r.body); } catch { /* 已销毁 */ } }
  r.body = null;
}

// ---- 自定义关卡(设计器产物):激活时替换地形 ----
export function loadCustomLevel() {
  try { return JSON.parse(localStorage.getItem('contra-level-custom') || 'null'); } catch { return null; }
}
export function activateCustomLevel(on) { localStorage.setItem('contra-level-active', on ? '1' : '0'); }
export function isCustomActive() {
  // 场景选择键是唯一事实来源:选中"野外"时陈旧的 active flag 不算数。
  // 守卫必须在这里(消费点之前)做 —— menu.js 的 flag 对齐在 import 顺序上晚于本模块,靠不住
  const scene = localStorage.getItem('contra-scene') || 'wild';
  if (scene !== 'custom') return false;
  const c = loadCustomLevel();
  return !!c && Array.isArray(c.rects) && localStorage.getItem('contra-level-active') === '1';
}
function customRects() {
  const c = loadCustomLevel();
  if (!c || !Array.isArray(c.rects)) return null;
  // 先校验所有矩形,避免损坏/不完整的 localStorage 存档生成 NaN 刚体。
  const validRect = (r) => r && ['x', 'y', 'w', 'h'].every((k) =>
    typeof r[k] === 'number' && Number.isFinite(r[k])) && r.w > 0 && r.h > 0;
  if (!c.rects.every(validRect)) return null;
  // v1 存左下角,v2 起存中心点;旧档按绘制意图迁移。
  const toCenter = (r) => (c.version >= 2 ? r : { ...r, x: r.x + r.w / 2, y: r.y + r.h / 2 });
  return [
    { x: 33, y: -1.5, w: 90, h: 3, type: 'ground', destructible: false },
    ...c.rects.map((r) => {
      const t = toCenter(r);
      return { x: t.x, y: t.y, w: t.w, h: t.h, type: r.type || 'plat', destructible: true };
    }),
  ];
}
function applyCustomIfActive() {
  if (!isCustomActive()) return;
  LEVEL.rects = customRects() || LEVEL.rects;
}
applyCustomIfActive();

// 游戏内无刷新切换场景:替换地形数据,由装配根重建物理刚体。
export function setActiveLayout(id) {
  LEVEL.spawn = id === 'raid' ? { x: 4.2, y: 10.5 } : { x: 0, y: 0 };
  if (id === 'custom') {
    const rects = customRects();
    if (!rects) return false;
    LEVEL.rects = rects;
    return true;
  }
  const src = LAYOUTS[id] || LAYOUTS.wild;
  LEVEL.rects = src.map((r) => {
    const copy = { ...r };
    delete copy.body; delete copy.hp; delete copy.maxHp;
    return copy;
  });
  return true;
}

// 找 x 处最高的可行走表面(y 越小越高…… 世界 y 向上,返回该点的地面高度)
export function groundYAt(x, belowY = Infinity) {
  let best = -Infinity;
  for (const r of LEVEL.rects) {
    if (Math.abs(x - r.x) > r.w / 2 + 0.2) continue;
    const top = r.y + r.h / 2;
    if (top <= belowY + 0.3 && top > best) best = top;
  }
  return best === -Infinity ? 0 : best;
}

// ---- 素材背景(CC0: ansimuz "Mountain at Dusk" 视差包,public/bg/) ----
// ---- 场景主题:同一套山峦素材,不同调色板 + 染色滤镜(离屏缓存,切主题零成本)----
// sky = 天空渐变三档;filter = 对素材层的 canvas 滤镜;dusk = 压暗色/强度
export const THEMES = {
  wild: {
    label: '月夜',
    sky: ['#1c2a4d', '#3d5480', '#c97a4a'],
    filter: 'none',
    duskColor: 'rgba(16,24,52,0.34)',
  },
  roof: {
    label: '黎明',
    sky: ['#2a1830', '#8a4350', '#f0a05e'],
    filter: 'brightness(1.02) saturate(1.3) hue-rotate(-14deg)',
    duskColor: 'rgba(70,30,40,0.16)',
  },
  room: {
    label: '仓库',
    sky: ['#161032', '#5a3860', '#c97a4a'],
    filter: 'saturate(1.05)',
    duskColor: 'rgba(30,15,40,0.22)',
  },
  port: {
    label: '港口仓储 · 夜',
    sky: ['#07131f', '#1d3a50', '#db8955'],
    filter: 'brightness(0.86) saturate(0.9)',
    duskColor: 'rgba(4,12,20,0.18)',
  },
  desert: {
    label: '正午',
    sky: ['#7ea4d8', '#d8c9a8', '#f0dcb0'],
    filter: 'none',
    duskColor: 'rgba(200, 160, 90, 0.10)',
  },
  tropic: {
    label: '澜',
    sky: ['#9cc4e0', '#5a90c0', '#2a5a8a'],
    filter: 'brightness(0.92) saturate(0.95)',
    duskColor: 'rgba(20, 50, 90, 0.14)',
  },
  raid: {
    label: '剿匪行动',
    sky: ['#070d16', '#192637', '#3d5365'],
    filter: 'brightness(0.62) saturate(0.72) hue-rotate(-8deg)',
    duskColor: 'rgba(3,8,14,0.68)',
  },
};
let themeId = (() => {
  const t = localStorage.getItem('contra-scene');
  return (t && THEMES[t]) ? t : 'wild';
})();
export function currentTheme() { return THEMES[themeId] || THEMES.wild; }
export function setSceneTheme(id) {
  if (!THEMES[id]) return;
  themeId = id;
  SKY = null;          // 天空离屏缓存按主题重建
  tintCache = {};      // 图层染色缓存重建
  activateBackgroundSet(id); // 切场景同步切换背景图层
  localStorage.setItem('contra-scene', id);
}

let bgImgs = {};
let curSet = null;
let BG_SCALE = 4.5;
const bgImgCache = new Map();
// 每关一套图层:dir(公共目录)+ 各槽文件名 + layerScale(素材层高 → 全屏的放大倍数;
// 160px 层 = 4.5,360px 层 = 2.0,324px 层 = 2.22)
// foreAlpha = 前景剪影层透明度:前景画在玩家之后,素材内容越"重"就要越透 ——
// city 的 front.png 内容密(底部 30% 高度都是建筑街景),0.85 会糊住玩家膝盖以下
const BG_SETS = {
  wild: { dir: 'bg', scale: 4.5, files: { sky: 'mountains-bg.png', far: 'mountains-far.png', near: 'mountains-near.png', trees: 'trees.png', fore: 'foreground-trees.png' } },
  roof: { dir: 'bg', scale: 4.5, files: { sky: 'mountains-bg.png', far: 'mountains-far.png', near: 'mountains-near.png', trees: 'trees.png', fore: 'foreground-trees.png' } },
  // 港区(city 包):不设 fore 槽 —— 任何画在玩家之后的前景素材都会糊到人身上
  // (用户两次实测毙掉:整屏的 fore.png 直接盖死全场;换底部剪影 front.png 半透明仍挡腿)。
  // front.png 只走 trees 槽(画在玩家后面),港区等于没有前景层 —— 宁缺毋滥
  room: { dir: 'bg/city', scale: 2.22, files: { sky: 'clouds.png', far: 'far.png', near: 'mid.png', trees: 'front.png' } },
  // 港口新背景：来自本轮已有生成图裁切的独立 16:9 全景，只作远景天空/城市层。
  port: { dir: 'art/maps/port', scale: 1.0, foreAlpha: 0, files: { sky: 'port-background.webp' } },
  desert: { dir: 'bg/desert', scale: 2.0, files: { sky: 'clouds.png', far: 'far.png', near: 'dunes.png', trees: 'bush.png', fore: 'bush.png' } },
  tropic: { dir: 'bg/tropic', scale: 2.0, files: { sky: 'sky.png', far: 'ridge.png', near: 'palms.png', trees: 'grass.png', fore: 'grass.png' } },
  raid: { dir: 'bg/city', scale: 2.22, files: { sky: 'clouds.png', far: 'far.png', near: 'mid.png', trees: 'front.png' } },
};
function activateBackgroundSet(id) {
  const sceneId = BG_SETS[id] ? id : 'wild';
  curSet = BG_SETS[sceneId] || BG_SETS.wild;
  if (!bgImgCache.has(sceneId)) {
    const loaded = {};
    for (const [k, f] of Object.entries(curSet.files)) {
      const im = new Image();
      im.decoding = 'async';
      im.src = `${curSet.dir}/${f}`;
      loaded[k] = im;
    }
    bgImgCache.set(sceneId, loaded);
  }
  bgImgs = bgImgCache.get(sceneId);
  BG_SCALE = curSet.scale;
}
activateBackgroundSet(themeId); // 场景切换复用已加载的 Image,避免刷新页面重新请求素材
// 染色缓存:素材层 × 主题 → 离屏 canvas(滤镜只跑一次,平铺时零开销)
let tintCache = {};
function tinted(key) {
  // 不是每个场景都有 fore / trees 等所有图层;可选图层缺失必须视为正常情况。
  const img = bgImgs?.[key];
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const id = themeId + ':' + key;
  if (tintCache[id]) return tintCache[id];
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cc = cv.getContext('2d');
  if (!cc) return null;
  cc.filter = currentTheme().filter;
  cc.drawImage(img, 0, 0);
  cc.filter = 'none';
  tintCache[id] = cv;
  return cv;
}
// 横向平铺绘制(带视差偏移;sky 层不染色,其余走主题染色)
function drawTiled(c, key, W, H, offset, alpha = 1) {
  const img = key === 'sky' ? bgImgs?.sky : tinted(key);
  if (!img) return;
  // Image 尚未加载/加载失败时宽度可能为 0;避免非法 drawImage 与零步长循环。
  const sourceW = img.naturalWidth || img.width || 0;
  if (!Number.isFinite(sourceW) || sourceW <= 0 || !Number.isFinite(BG_SCALE) || BG_SCALE <= 0) return;
  const w = sourceW * BG_SCALE;
  if (!Number.isFinite(w) || w <= 0) return;
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  let sx = ((safeOffset % w) + w) % w;
  const prevAlpha = c.globalAlpha;
  c.globalAlpha = prevAlpha * Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  try {
    for (let x = -sx; x < W; x += w) c.drawImage(img, x, 0, w, H);
  } finally {
    c.globalAlpha = prevAlpha;
  }
}

// ---- 绘制 ----
function ridge(n, seed) {
  const a = [];
  let s = seed;
  for (let i = 0; i <= n; i++) {
    s = (s * 16807) % 2147483647;
    a.push(0.35 + (s / 2147483647) * 0.65);
  }
  return a;
}
const RIDGE_FAR = ridge(80, 1234567);
const RIDGE_NEAR = ridge(80, 7654321);

// 天空是静态的:预渲染到离屏画布,每帧只 drawImage(每帧新建渐变对象会积累 GC 卡顿)
let SKY = null;
export function drawSky(ctx, W, H, camX = 0) {
  const th = currentTheme();
  if (!SKY || SKY.width !== W || SKY.height !== H || SKY._theme !== themeId) {
    SKY = document.createElement('canvas');
    SKY.width = W; SKY.height = H; SKY._theme = themeId;
    const c = SKY.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(0.55, th.sky[1]);
    g.addColorStop(1, th.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  ctx.drawImage(SKY, 0, 0);
  drawTiled(ctx, 'sky', W, H, camX * 4, 1); // 素材天空层(星星/云)
}

function drawRidge(ctx, W, H, heights, segW, baseY, amp, color, shift) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-segW, H);
  const off = ((shift % segW) + segW) % segW;
  const i0 = Math.floor(shift / segW);
  for (let sx = -off, i = i0; sx < W + segW; sx += segW, i++) {
    const h = heights[((i % heights.length) + heights.length) % heights.length];
    ctx.lineTo(sx, baseY - h * amp);
    ctx.lineTo(sx + segW / 2, baseY - h * amp * 0.55);
  }
  ctx.lineTo(W + segW, H);
  ctx.closePath();
  ctx.fill();
}

export function drawParallax(ctx, W, H, camX, ppm) {
  drawTiled(ctx, 'far', W, H, camX * ppm * 0.06, 0.95);   // 远山
  drawTiled(ctx, 'near', W, H, camX * ppm * 0.18, 1);     // 近山
  drawTiled(ctx, 'trees', W, H, camX * ppm * 0.34, 1);    // 树林
  // 氛围压暗(颜色/强度随主题:月夜冷蓝 / 黎明暖 / 仓库深青)
  ctx.fillStyle = currentTheme().duskColor;
  ctx.fillRect(0, 0, W, H);
}

// 前景树剪影(世界绘制完成后调用,增加纵深);透明度随素材"重量"每关可调(BG_SETS.foreAlpha)
export function drawForeground(ctx, W, H, camX) {
  // room / raid / port intentionally have no separate foreground sprite. Do not call tinted('fore')
  // for a missing layer: render() previously caught that TypeError and reset the entire canvas,
  // which made those scenes look like a black screen while DOM HUD continued to update.
  if (!curSet || !bgImgs?.fore) return;
  const alpha = curSet.foreAlpha ?? 0.85;
  if (!Number.isFinite(alpha) || alpha <= 0) return;
  drawTiled(ctx, 'fore', W, H, camX * PPM_FG, alpha);
}
const PPM_FG = 52 * 1.15;

// 剿匪行动室内底图：实体墙之前绘制，房间有窗带、结构柱、线槽与墙板，不再是空旷平台。
// 装饰只用基本 Canvas primitives，不创建离屏图层/渐变，不增加每帧 GC 压力。
export function drawBuildingInterior(ctx, w2s, ppm, time = 0, lighting = null) {
  if (themeId !== 'raid') return;
  const rect = (x0, y0, x1, y1, color) => {
    const [sx, sy] = w2s(x0, y1);
    const [ex, ey] = w2s(x1, y0);
    if (ex < -8 || sx > 1290 || ey < -8 || sy > 730) return;
    ctx.fillStyle = color;
    ctx.fillRect(sx, sy, ex - sx, ey - sy);
  };
  // 四层室内墙面；屋顶层也画护墙与设备平台，避免看起来像漂浮在天空里的小人。
  for (let floor = 0; floor < 3; floor++) {
    const base = floor * 3.5;
    rect(0.5, base + 0.18, 73.5, base + 3.30, floor % 2 ? '#182331' : '#141f2b');
    rect(0.5, base + 3.12, 73.5, base + 3.28, '#394450'); // ceiling beam
    rect(0.5, base + 0.32, 73.5, base + 0.42, '#263746'); // cable raceway
    for (let x = 2.5; x < 74; x += 5.5) {
      rect(x, base + 0.42, x + 0.09, base + 3.10, 'rgba(86,106,124,0.42)');
      rect(x + 0.14, base + 0.55, x + 0.19, base + 2.98, 'rgba(5,10,17,0.46)');
    }
    // 窗户/射击狭缝：冷蓝玻璃 + 边框 + 竖向分隔线。
    for (let x = 4 + (floor % 2) * 2; x < 72; x += 11.5) {
      rect(x, base + 1.72, x + 3.0, base + 2.58, '#0b1723');
      rect(x + 0.08, base + 1.80, x + 2.92, base + 2.50, '#1c3446');
      rect(x + 0.12, base + 2.35, x + 2.88, base + 2.40, 'rgba(135,184,205,0.48)');
      rect(x + 1.44, base + 1.78, x + 1.52, base + 2.52, '#0b121b');
    }
    // 墙上配电柜/设备箱与管道，让长走廊有比例尺和战术细节。
    for (let x = 7 + (floor % 2) * 3; x < 71; x += 17.5) {
      rect(x, base + 0.62, x + 1.25, base + 1.42, '#273847');
      rect(x + 0.12, base + 0.72, x + 1.13, base + 1.32, '#101922');
      rect(x + 0.2, base + 1.15, x + 0.68, base + 1.20, '#d68b3c');
      rect(x + 0.84, base + 0.82, x + 0.91, base + 1.02, '#6da8b6');
    }
    // 灯被击毁后仍保留天花灯槽，但不再画发光核心；灯源与碰撞物件共用 rect 数据。
    const activeLamps = LEVEL.rects.filter((r) => r.type === 'lamp' && r.raidFloorId === floor);
    for (const lamp of activeLamps) {
      const pulse = 0.84 + Math.sin(time * 2.6 + lamp.x) * 0.04;
      if (lighting?.powerOn !== false) {
        rect(lamp.x - 0.8, base + 2.78, lamp.x + 0.8, base + 2.84, `rgba(255,174,86,${0.10 * pulse})`);
        rect(lamp.x - 0.30, base + 2.78, lamp.x + 0.30, base + 2.82, `rgba(255,190,116,${0.58 * pulse})`);
      } else {
        rect(lamp.x - 0.3, base + 2.78, lamp.x + 0.3, base + 2.82, 'rgba(95,28,34,0.42)');
      }
    }
  }
  // Room identities: framed safety placards, faded wall art, ventilation grilles, racks and service monitors.
  // These are pure set dressing (no fixtures), deliberately varied by floor so the building is readable as places.
  const roomProps = [
    [
      { x: 8.6, label: 'GENERATOR', kind: 'monitor', accent: '#ffb14a' },
      { x: 21.4, label: 'SECURITY', kind: 'poster', accent: '#b36e49' },
      { x: 35.4, label: 'OPS  /  A', kind: 'monitor', accent: '#7fb2c9' },
      { x: 55.8, label: 'ARMORY', kind: 'rack', accent: '#b7a77b' },
      { x: 68.5, label: 'EXIT  G', kind: 'vent', accent: '#8cce97' },
    ],
    [
      { x: 11.2, label: 'LAB  /  02', kind: 'poster', accent: '#7fb2c9' },
      { x: 23.2, label: 'STORAGE', kind: 'rack', accent: '#b7a77b' },
      { x: 34.5, label: 'COMMS', kind: 'monitor', accent: '#7fb2c9' },
      { x: 46.3, label: 'CAUTION', kind: 'poster', accent: '#ffb14a' },
      { x: 68.9, label: 'LOCKER', kind: 'vent', accent: '#8cce97' },
    ],
    [
      { x: 9.5, label: 'ARCHIVE', kind: 'rack', accent: '#b7a77b' },
      { x: 21.2, label: 'CONTROL', kind: 'monitor', accent: '#7fb2c9' },
      { x: 33.0, label: 'OBSERVATION', kind: 'poster', accent: '#b36e49' },
      { x: 44.8, label: 'RESTRICTED', kind: 'poster', accent: '#ffb14a' },
      { x: 56.2, label: 'HVAC', kind: 'vent', accent: '#8cce97' },
      { x: 67.1, label: 'ROOF ACCESS', kind: 'monitor', accent: '#7fb2c9' },
    ],
  ];
  for (let floor = 0; floor < roomProps.length; floor++) {
    const base = floor * 3.5;
    for (const prop of roomProps[floor]) {
      const x = prop.x;
      if (prop.kind === 'poster') {
        rect(x - 0.62, base + 1.72, x + 0.62, base + 2.52, '#070f18');
        rect(x - 0.54, base + 1.80, x + 0.54, base + 2.44, '#263543');
        rect(x - 0.45, base + 2.34, x + 0.45, base + 2.38, prop.accent);
        rect(x - 0.38, base + 1.91, x + 0.28, base + 2.22, '#101d29');
        rect(x - 0.32, base + 1.96, x + 0.20, base + 2.00, prop.accent);
        rect(x - 0.08, base + 2.02, x - 0.02, base + 2.18, '#7e929e');
        rect(x + 0.07, base + 2.04, x + 0.13, base + 2.17, '#7e929e');
      } else if (prop.kind === 'monitor') {
        rect(x - 0.72, base + 1.75, x + 0.72, base + 2.43, '#080f17');
        rect(x - 0.63, base + 1.83, x + 0.63, base + 2.34, '#253a49');
        rect(x - 0.54, base + 2.23, x + 0.44, base + 2.27, prop.accent);
        rect(x - 0.48, base + 1.94, x + 0.05, base + 1.98, '#73909f');
        rect(x - 0.48, base + 2.04, x + 0.32, base + 2.08, '#4d6879');
        rect(x + 0.42, base + 1.90, x + 0.48, base + 2.12, prop.accent);
      } else if (prop.kind === 'vent') {
        rect(x - 0.63, base + 1.95, x + 0.63, base + 2.40, '#09121b');
        rect(x - 0.56, base + 2.01, x + 0.56, base + 2.34, '#2d3e4c');
        for (let i = 0; i < 5; i++) rect(x - 0.48, base + 2.05 + i * 0.052, x + 0.48, base + 2.068 + i * 0.052, '#71838e');
        rect(x + 0.38, base + 2.08, x + 0.47, base + 2.15, prop.accent);
      } else if (prop.kind === 'rack') {
        rect(x - 0.64, base + 0.62, x + 0.64, base + 2.48, '#09111a');
        rect(x - 0.56, base + 0.70, x - 0.49, base + 2.40, '#647583');
        rect(x + 0.49, base + 0.70, x + 0.56, base + 2.40, '#647583');
        for (let shelf = 0; shelf < 4; shelf++) {
          const y = base + 0.78 + shelf * 0.40;
          rect(x - 0.49, y, x + 0.49, y + 0.045, '#8798a2');
          for (let item = 0; item < 3; item++) {
            const ix = x - 0.40 + item * 0.28;
            rect(ix, y + 0.07, ix + 0.16, y + 0.32, shelf % 2 ? '#344b59' : '#3d4944');
            rect(ix, y + 0.29, ix + 0.16, y + 0.32, prop.accent);
          }
        }
      }
      const [tx, ty] = w2s(x, base + (prop.kind === 'rack' ? 2.60 : 1.64));
      if (tx > -80 && tx < 1360 && ty > -24 && ty < 760) {
        ctx.save();
        ctx.font = `700 ${Math.max(7, Math.min(10, ppm * 0.18))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = prop.accent;
        ctx.globalAlpha = 0.78;
        ctx.fillText(prop.label, tx, ty);
        ctx.restore();
      }
    }
  }

  // Stairway identity plates: tell the player which floor is reachable before committing to a drop.
  const stairSigns = [
    { x: 49.6, base: 0, label: 'UP  /  LEVEL 02', direction: 1 },
    { x: 49.6, base: 3.5, label: 'DOWN  /  GROUND', direction: -1 },
    { x: 29.7, base: 3.5, label: 'UP  /  LEVEL 03', direction: 1 },
    { x: 29.7, base: 7, label: 'DOWN  /  LEVEL 02', direction: -1 },
    { x: 15.9, base: 7, label: 'UP  /  ROOF', direction: 1 },
  ];
  for (const sign of stairSigns) {
    const y0 = sign.base + 1.72, y1 = sign.base + 2.34;
    rect(sign.x - 0.98, y0, sign.x + 0.98, y1, '#07111a');
    rect(sign.x - 0.91, y0 + 0.07, sign.x + 0.91, y1 - 0.07, '#1d2b38');
    rect(sign.x - 0.87, y0 + 0.08, sign.x - 0.82, y1 - 0.08, '#ffb14a');
    const [sx, sy] = w2s(sign.x + 0.65, sign.base + 2.03);
    ctx.save();
    ctx.strokeStyle = '#ffb14a';
    ctx.lineWidth = Math.max(1.2, ppm * 0.025);
    ctx.beginPath();
    ctx.moveTo(sx, sy + sign.direction * ppm * 0.075);
    ctx.lineTo(sx, sy - sign.direction * ppm * 0.075);
    ctx.moveTo(sx - ppm * 0.055, sy - sign.direction * ppm * 0.015);
    ctx.lineTo(sx, sy - sign.direction * ppm * 0.075);
    ctx.lineTo(sx + ppm * 0.055, sy - sign.direction * ppm * 0.015);
    ctx.stroke();
    ctx.font = `700 ${Math.max(7, Math.min(9, ppm * 0.17))}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d6e0e8';
    ctx.globalAlpha = 0.94;
    ctx.fillText(sign.label, sx - ppm * 0.54, sy + ppm * 0.10);
    ctx.restore();
  }

  // 屋顶设备基座与矮护墙，屋顶的可视区域保持在建筑风格内。
  rect(0.5, 10.55, 73.5, 13.8, '#111b27');
  rect(0.5, 10.55, 73.5, 10.72, '#3a4652');
  for (let x = 3; x < 72; x += 8.5) {
    rect(x, 10.78, x + 1.8, 11.42, '#222f3b');
    rect(x + 0.12, 10.94, x + 1.68, 11.00, '#647887');
  }
  // Rooftop stair landing marker, mounted above the stair opening rather than painted on the floor slab.
  rect(18.55, 11.34, 20.52, 12.02, '#07111a');
  rect(18.63, 11.42, 20.44, 11.94, '#1d2b38');
  rect(18.68, 11.48, 18.74, 11.88, '#ffb14a');
  const [roofSignX, roofSignY] = w2s(19.58, 11.70);
  ctx.save();
  ctx.font = `700 ${Math.max(7, Math.min(9, ppm * 0.17))}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d6e0e8';
  ctx.globalAlpha = 0.94;
  ctx.fillText('DOWN / LEVEL 03', roofSignX, roofSignY);
  ctx.restore();

  // 房间内的微弱环境反光/尘埃是固定少量 primitive，不用粒子系统持续造粒子。
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#6d91aa';
  ctx.lineWidth = Math.max(1, ppm * 0.018);
  const sweep = (time * 9) % 74;
  const [sx, sy] = w2s(sweep, 0.5);
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 18, sy - 2); ctx.stroke();
  ctx.restore();
}

// Fog-only structural schematic: characters/furniture disappear outside current vision,
 // while floor openings, room partitions and stair shafts remain navigable from their outline.
export function drawRaidFloorplan(ctx, w2s, ppm, isVisible = () => false) {
  if (themeId !== 'raid' || typeof w2s !== 'function') return;
  const drawSegment = (x0, y0, x1, y1) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(length / 0.26));
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps, tm = (t0 + t1) / 2;
      const wx = x0 + (x1 - x0) * tm, wy = y0 + (y1 - y0) * tm;
      if (isVisible(wx, wy)) continue;
      const [ax, ay] = w2s(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0);
      const [bx, by] = w2s(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.globalAlpha = 0.66;
  ctx.strokeStyle = '#8daebe';
  ctx.lineWidth = Math.max(1, ppm * 0.018);
  const floors = [
    { y: 10.5, spans: [[0, RAID_STAIR_OPENING.left], [RAID_STAIR_OPENING.right, 74]], partitions: [] },
    { y: 7, spans: [[0, RAID_STAIR_OPENING.left], [RAID_STAIR_OPENING.right, 74]], partitions: [23, 43, 62] },
    { y: 3.5, spans: [[0, RAID_STAIR_OPENING.left], [RAID_STAIR_OPENING.right, 74]], partitions: [17, 37, 58] },
    { y: 0, spans: [[0, 74]], partitions: [11, 29, 42, 61] },
  ];
  for (const floor of floors) {
    for (const [x0, x1] of floor.spans) drawSegment(x0, floor.y, x1, floor.y);
    for (const x of floor.partitions) {
      drawSegment(x - 1.35, floor.y, x - 1.35, floor.y + 2.65);
      drawSegment(x + 1.35, floor.y, x + 1.35, floor.y + 2.65);
      drawSegment(x - 1.21, floor.y, x - 1.21, floor.y + 2.04);
      drawSegment(x + 1.21, floor.y, x + 1.21, floor.y + 2.04);
      drawSegment(x - 1.21, floor.y + 2.04, x + 1.21, floor.y + 2.04);
      ctx.strokeStyle = '#bea575';
      ctx.globalAlpha = 0.72;
      drawSegment(x - 1.21, floor.y + 0.10, x + 1.21, floor.y + 0.10);
      ctx.strokeStyle = '#8daebe';
      ctx.globalAlpha = 0.66;
    }
  }
  // Ghost the stair treads too, so a player can locate the return route through darkness.
  for (const r of LEVEL.rects) {
    if (r.type !== 'stair' || isVisible(r.x, r.y)) continue;
    drawSegment(r.x - r.w / 2, r.y + r.h / 2, r.x + r.w / 2, r.y + r.h / 2);
  }
  ctx.restore();
}

export function drawTerrain(ctx, rects, w2s, ppm, time = 0, lighting = null) {
  // Continuous handrails make the narrow switchback treads read as a deliberate route, not random ledges.
  const stairGroups = new Map();
  for (const r of rects) if (r.type === 'stair' && r.stairId) {
    if (!stairGroups.has(r.stairId)) stairGroups.set(r.stairId, []);
    stairGroups.get(r.stairId).push(r);
  }
  ctx.save();
  ctx.lineCap = 'round';
  for (const group of stairGroups.values()) {
    group.sort((a, b) => a.stairStep - b.stairStep);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      group.forEach((r, i) => {
        const [x, y] = w2s(r.x + side * Math.max(0.18, r.w * 0.38), r.y + 0.68);
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'rgba(11,20,29,0.88)'; ctx.lineWidth = Math.max(3, ppm * 0.075); ctx.stroke();
      ctx.strokeStyle = 'rgba(113,137,153,0.75)'; ctx.lineWidth = Math.max(1.2, ppm * 0.028); ctx.stroke();
    }
    for (let i = 0; i < group.length; i += 2) {
      const r = group[i];
      for (const side of [-1, 1]) {
        const [x1, y1] = w2s(r.x + side * Math.max(0.18, r.w * 0.38), r.y + 0.10);
        const [x2, y2] = w2s(r.x + side * Math.max(0.18, r.w * 0.38), r.y + 0.68);
        ctx.strokeStyle = 'rgba(91,113,128,0.78)'; ctx.lineWidth = Math.max(1, ppm * 0.028);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
  }
  ctx.restore();
  for (const r of rects) {
    const [sx, sy] = w2s(r.x - r.w / 2, r.y + r.h / 2);
    const w = r.w * ppm, h = r.h * ppm;
    // 受损裂纹:耐久低于一半出现,越低越密
    if (r.maxHp && r.hp < r.maxHp * 0.6) {
      const dmg = 1 - r.hp / r.maxHp;
      ctx.strokeStyle = `rgba(20,14,8,${0.25 + dmg * 0.5})`;
      ctx.lineWidth = 1.5;
      const n = 2 + Math.round(dmg * 4);
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const rx = sx + ((k * 37 + 13) % 100) / 100 * w;
        const ry = sy + ((k * 53 + 29) % 100) / 100 * h;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + (k % 2 ? 8 : -6), ry + (k % 3 ? 5 : -4));
        ctx.lineTo(rx + (k % 2 ? 14 : -10), ry + (k % 3 ? 2 : 8));
      }
      ctx.stroke();
    }
    // Material pass: same collision/HP model, stronger visual readability between cover, cargo and terrain.
    // Destructible blocks are split into small tiles upstream, so effects stay local when shot apart.
    if (r.type === 'ground') {
      ctx.fillStyle = '#4a3524';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#3e7a3c';
      ctx.fillRect(sx, sy, w, Math.min(10, h * 0.16));
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(sx, sy + Math.min(10, h * 0.16), w, Math.min(3, h * 0.08));
    } else if (r.type === 'cover' || r.type === 'sandbag') {
      ctx.fillStyle = '#4a5142';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#68725a';
      ctx.fillRect(sx, sy, w, Math.max(2, Math.min(4, h * 0.18)));
      ctx.fillStyle = 'rgba(20,25,20,0.24)';
      ctx.fillRect(sx, sy + h * 0.52, w, Math.max(1, h * 0.08));
      ctx.strokeStyle = 'rgba(20,25,18,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx + w * 0.5, sy + h * 0.14); ctx.lineTo(sx + w * 0.5, sy + h * 0.48); ctx.stroke();
    } else if (r.type === 'crate' || r.type === 'timber') {
      ctx.fillStyle = '#68462c';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#9a7046';
      ctx.fillRect(sx, sy, w, Math.max(2, Math.min(3, h * 0.16)));
      ctx.strokeStyle = 'rgba(30,21,13,0.46)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 1, sy + 1, Math.max(0, w - 2), Math.max(0, h - 2));
      if (w > 7 && h > 7) {
        ctx.beginPath(); ctx.moveTo(sx + 2, sy + 2); ctx.lineTo(sx + w - 2, sy + h - 2);
        ctx.moveTo(sx + w - 2, sy + 2); ctx.lineTo(sx + 2, sy + h - 2); ctx.stroke();
      }
    } else if (r.type === 'steel') {
      ctx.fillStyle = '#3b4652';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#758596';
      ctx.fillRect(sx, sy, w, Math.max(2, Math.min(3, h * 0.14)));
      ctx.fillStyle = 'rgba(10,16,23,0.3)';
      ctx.fillRect(sx + w * 0.78, sy, Math.max(1, w * 0.12), h);
      if (w > 8 && h > 8) {
        ctx.fillStyle = '#bcc7d2';
        ctx.fillRect(sx + 2, sy + 2, 2, 2);
      }
    } else if (r.type === 'container' || r.type === 'container-red') {
      const base = r.type === 'container-red' ? '#63423b' : '#294c5d';
      const lip = r.type === 'container-red' ? '#9b6752' : '#5f8797';
      const group = r.visualGroup;
      if (group) {
        // 片段绘制裁切到当前可破坏 tile；竖向筋线按整个货柜对齐，顶部/底部包边只在外沿出现。
        const [gx, gy] = w2s(group.x - group.w / 2, group.y + group.h / 2);
        const gw = group.w * ppm, gh = group.h * ppm;
        const topTile = Math.abs((r.y + r.h / 2) - (group.y + group.h / 2)) < 0.14;
        const bottomTile = Math.abs((r.y - r.h / 2) - (group.y - group.h / 2)) < 0.14;
        const leftTile = Math.abs((r.x - r.w / 2) - (group.x - group.w / 2)) < 0.14;
        const rightTile = Math.abs((r.x + r.w / 2) - (group.x + group.w / 2)) < 0.14;
        ctx.save();
        ctx.beginPath(); ctx.rect(sx, sy, w, h); ctx.clip();
        ctx.fillStyle = base; ctx.fillRect(sx, sy, w, h);
        ctx.fillStyle = 'rgba(7,14,22,0.12)'; ctx.fillRect(sx, sy + h * 0.72, w, h * 0.28);
        ctx.strokeStyle = 'rgba(3,10,17,0.45)'; ctx.lineWidth = 1;
        const ribStep = Math.max(10, ppm * 0.42);
        for (let rx = gx + ribStep; rx < gx + gw - 2; rx += ribStep) {
          ctx.beginPath(); ctx.moveTo(rx, gy + 2); ctx.lineTo(rx, gy + gh - 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(164,195,207,0.20)'; ctx.beginPath(); ctx.moveTo(rx + 1, gy + 2); ctx.lineTo(rx + 1, gy + gh - 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(3,10,17,0.45)';
        }
        if (topTile) { ctx.fillStyle = lip; ctx.fillRect(gx, gy, gw, Math.max(2, ppm * 0.055)); }
        if (bottomTile) { ctx.fillStyle = 'rgba(7,14,22,0.45)'; ctx.fillRect(gx, gy + gh - Math.max(2, ppm * 0.07), gw, Math.max(2, ppm * 0.07)); }
        if (leftTile || rightTile) {
          const bx = leftTile ? gx + 4 : gx + gw - 7;
          ctx.fillStyle = 'rgba(203,220,228,0.56)';
          ctx.fillRect(bx, gy + gh * 0.20, 3, Math.max(3, gh * 0.12));
          ctx.fillRect(bx, gy + gh * 0.67, 3, Math.max(3, gh * 0.12));
          ctx.fillStyle = 'rgba(10,18,25,0.55)';
          ctx.fillRect(bx + (leftTile ? 3 : -2), gy + gh * 0.20, 2, Math.max(3, gh * 0.12));
          ctx.fillRect(bx + (leftTile ? 3 : -2), gy + gh * 0.67, 2, Math.max(3, gh * 0.12));
        }
        ctx.restore();
      } else {
        ctx.fillStyle = base; ctx.fillRect(sx, sy, w, h);
        ctx.fillStyle = lip; ctx.fillRect(sx, sy, w, Math.max(1.5, Math.min(3, h * 0.12)));
        ctx.fillStyle = 'rgba(7,14,22,0.24)'; ctx.fillRect(sx, sy + h * 0.84, w, h * 0.16);
        ctx.strokeStyle = 'rgba(3,10,17,0.52)'; ctx.lineWidth = 1;
        if (w > 6 && h > 4) { for (let rx = sx + w * 0.18; rx < sx + w; rx += Math.max(4, w * 0.28)) { ctx.beginPath(); ctx.moveTo(rx, sy + h * 0.12); ctx.lineTo(rx, sy + h * 0.88); ctx.stroke(); } }
      }
    } else if (r.type === 'stair') {
      // Narrow anti-slip steel treads inside each 3.5m stair shaft.
      ctx.fillStyle = '#283746'; ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#8797a3'; ctx.fillRect(sx, sy, w, Math.max(1.5, Math.min(3, h * 0.22)));
      ctx.fillStyle = 'rgba(255,177,74,0.78)'; ctx.fillRect(sx + w * 0.08, sy + Math.max(1, h * 0.22), w * 0.84, Math.max(1, h * 0.11));
      ctx.strokeStyle = 'rgba(6,13,21,0.70)'; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
    } else if (r.type === 'concrete') {
      ctx.fillStyle = '#535b63';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#7b858c';
      ctx.fillRect(sx, sy, w, Math.max(2, Math.min(3, h * 0.13)));
      ctx.fillStyle = 'rgba(18,23,28,0.22)';
      ctx.fillRect(sx, sy + h * 0.78, w, h * 0.22);
    } else if (r.type === 'wall') {
      ctx.fillStyle = '#3b4653';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = 'rgba(138,157,174,0.48)';
      ctx.fillRect(sx, sy, w, Math.max(1, Math.min(3, h * 0.1)));
      ctx.fillStyle = 'rgba(8,13,20,0.40)';
      ctx.fillRect(sx + w * 0.82, sy, Math.max(1, w * 0.18), h);
      if (w > 10 && h > 7) {
        ctx.strokeStyle = 'rgba(8,14,20,0.38)'; ctx.lineWidth = 1;
        ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);
      }
    } else if (r.type === 'door') {
      // A closed door fills the opening. While swinging, perspective compresses its width around the hinge.
      const angle = Math.max(0, Math.min(Math.PI / 2, r.doorAngle || 0));
      const openWidth = Math.max(2, w * Math.cos(angle));
      const hingeLeft = r.hingeSide !== 'right';
      const hx = hingeLeft ? sx : sx + w;
      const edgeX = hingeLeft ? hx + openWidth : hx - openWidth;
      const skew = Math.sin(angle) * h * 0.10;
      const topEdgeY = sy + skew;
      ctx.fillStyle = '#253646';
      ctx.beginPath(); ctx.moveTo(hx, sy); ctx.lineTo(edgeX, topEdgeY); ctx.lineTo(edgeX, sy + h - skew); ctx.lineTo(hx, sy + h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7f8f9a'; ctx.lineWidth = Math.max(1, ppm * 0.035); ctx.stroke();
      ctx.strokeStyle = '#405567'; ctx.lineWidth = Math.max(2, ppm * 0.08);
      ctx.beginPath(); ctx.moveTo(hx + (hingeLeft ? 1 : -1), sy + h * 0.1); ctx.lineTo(edgeX, topEdgeY + h * 0.1); ctx.stroke();
      const handleX = hx + (edgeX - hx) * 0.78;
      const handleY = sy + h * 0.50;
      ctx.fillStyle = '#d99a4b'; ctx.fillRect(handleX - Math.max(1, ppm * 0.025), handleY, Math.max(2, ppm * 0.055), Math.max(2, ppm * 0.085));
      if (angle < 0.08) { ctx.fillStyle = 'rgba(255,177,74,0.14)'; ctx.fillRect(sx + w * 0.06, sy + h * 0.12, w * 0.08, h * 0.76); }
    } else if (r.type === 'lamp') {
      const sway = Math.sin(time * 1.65 + r.x * 0.73);
      const flicker = 0.92 + 0.055 * Math.sin(time * 7.1 + r.x) + 0.025 * Math.sin(time * 13.4 + r.x * 0.3);
      ctx.save();
      ctx.translate(sx + w / 2, sy + h / 2); ctx.rotate(sway * 0.035);
      // Short suspension stem anchors each fixture to the ceiling beam.
      ctx.strokeStyle = 'rgba(113,130,143,0.85)'; ctx.lineWidth = Math.max(1, ppm * 0.025);
      ctx.beginPath(); ctx.moveTo(0, -h * 0.5); ctx.lineTo(0, -h * 1.55); ctx.stroke();
      ctx.fillStyle = '#222f3b'; ctx.fillRect(-w / 2, -h / 2, w, h);
      if (lighting?.powerOn !== false) {
        ctx.fillStyle = `rgba(246,186,108,${Math.max(0.55, flicker)})`; ctx.fillRect(-w * 0.32, -h * 0.30, w * 0.64, h * 0.60);
        ctx.fillStyle = `rgba(255,180,86,${0.18 * flicker})`; ctx.fillRect(-w * 0.95, -h * 1.0, w * 1.9, h * 1.2);
      } else {
        ctx.fillStyle = 'rgba(110,48,52,0.48)'; ctx.fillRect(-w * 0.32, -h * 0.30, w * 0.64, h * 0.60);
      }
      ctx.restore();
    } else if (r.type === 'intel') {
      const secured = !!r.intelSecured;
      const pulse = 0.58 + Math.sin(time * 4.2) * 0.18;
      ctx.fillStyle = '#14232f'; ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#304657'; ctx.fillRect(sx + w * 0.08, sy + h * 0.06, w * 0.84, h * 0.16);
      ctx.strokeStyle = secured ? '#8cce97' : '#7fb2c9';
      ctx.lineWidth = Math.max(1, ppm * 0.025); ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);
      ctx.fillStyle = secured ? '#8cce97' : `rgba(255,177,74,${pulse})`;
      ctx.fillRect(sx + w * 0.73, sy + h * 0.11, w * 0.12, h * 0.07);
      ctx.fillStyle = '#476579';
      for (let i = 0; i < 3; i++) ctx.fillRect(sx + w * 0.15, sy + h * (0.38 + i * 0.15), w * (i === 1 ? 0.42 : 0.62), Math.max(1, h * 0.045));
      ctx.fillStyle = secured ? '#8cce97' : '#ffcb79';
      ctx.fillRect(sx + w * 0.15, sy + h * 0.83, w * 0.70, Math.max(1, h * 0.06));
    } else if (r.type === 'breaker') {
      ctx.fillStyle = '#1c2935'; ctx.fillRect(sx, sy, w, h);
      ctx.strokeStyle = '#8196a4'; ctx.lineWidth = Math.max(1, ppm * 0.025); ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);
      ctx.fillStyle = lighting?.powerOn === false ? '#ff665d' : '#ffb14a';
      ctx.fillRect(sx + w * 0.18, sy + h * 0.16, w * 0.64, h * 0.13);
      ctx.fillStyle = '#526575'; ctx.fillRect(sx + w * 0.2, sy + h * 0.4, w * 0.6, h * 0.45);
      ctx.fillStyle = lighting?.powerOn === false ? '#ff665d' : '#8cce97';
      ctx.fillRect(sx + w * 0.56, sy + h * 0.44, w * 0.16, h * 0.34);
    } else if (r.type === 'rock') {
      ctx.fillStyle = '#665e52';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#82796a';
      ctx.beginPath(); ctx.moveTo(sx, sy + Math.min(4, h * 0.22));
      ctx.lineTo(sx + w * 0.34, sy); ctx.lineTo(sx + w, sy + Math.min(2, h * 0.12));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(20,18,16,0.2)';
      ctx.fillRect(sx, sy + h * 0.72, w, h * 0.28);
    } else {
      // Default platform: weathered timber/metal lip.
      ctx.fillStyle = '#4f493d';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#94805e';
      ctx.fillRect(sx, sy, w, Math.max(2, Math.min(4, h * 0.15)));
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(sx, sy + h - Math.max(2, Math.min(3, h * 0.12)), w, Math.max(2, Math.min(3, h * 0.12)));
    }
  }
}
