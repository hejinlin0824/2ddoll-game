// 关卡地形:静态刚体 + 视差背景绘制
import { Box, Vec2 } from 'planck';

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
    { x: 66, y: 1.2, w: 4, h: 1.6, type: 'ground' },
  ],
  // 港区·仓库:巷战 —— 掩体群密布(矮墙卡视线),平台少而碎,中近距离遭遇
  room: [
    ground90(),
    { x: 6, y: 0.4, w: 2.4, h: 0.8, type: 'ground' },
    { x: 11, y: 2.4, w: 3, h: 0.5, type: 'plat' },
    { x: 16.5, y: 0.35, w: 2, h: 0.7, type: 'ground' },
    { x: 22, y: 0.45, w: 2.4, h: 0.9, type: 'ground' },
    { x: 27, y: 2.2, w: 3.4, h: 0.5, type: 'plat' },
    { x: 26.5, y: 0.5, w: 3, h: 1, type: 'ground' },
    { x: 33, y: 0.35, w: 2, h: 0.7, type: 'ground' },
    { x: 38.5, y: 2.6, w: 3.6, h: 0.5, type: 'plat' },
    { x: 44, y: 0.4, w: 2.4, h: 0.8, type: 'ground' },
    { x: 49.5, y: 0.35, w: 2, h: 0.7, type: 'ground' },
    { x: 55, y: 2.2, w: 3.4, h: 0.5, type: 'plat' },
    { x: 61, y: 0.5, w: 2.4, h: 1, type: 'ground' },
    { x: 67, y: 0.4, w: 3, h: 0.8, type: 'ground' },
  ],
  // 沙丘·正午:起伏沙脊(宽矮坡)+ 稀疏高岩 —— 人海冲锋,几乎无遮蔽
  desert: [
    ground90(),
    { x: 8, y: 1.1, w: 6, h: 1.2, type: 'ground' },
    { x: 18, y: 2.2, w: 5, h: 1.4, type: 'ground' },
    { x: 28, y: 0.8, w: 4, h: 0.8, type: 'ground' },
    { x: 36, y: 2.6, w: 3.6, h: 0.5, type: 'plat' },
    { x: 45, y: 1.4, w: 6, h: 1.2, type: 'ground' },
    { x: 55, y: 2.4, w: 4, h: 0.5, type: 'plat' },
    { x: 63, y: 1.2, w: 5, h: 1.1, type: 'ground' },
    { x: 70, y: 2.3, w: 3.4, h: 0.5, type: 'plat' },
  ],
  // 海岛·澜:棕榈跳台 + 浅滩石 —— 跳跃节奏关,平台间要跳
  tropic: [
    ground90(),
    { x: 5.5, y: 1.9, w: 2.6, h: 0.5, type: 'plat' },
    { x: 10.5, y: 3.1, w: 2.4, h: 0.5, type: 'plat' },
    { x: 15.5, y: 2.2, w: 2.6, h: 0.5, type: 'plat' },
    { x: 21, y: 0.5, w: 3, h: 1, type: 'ground' },
    { x: 26.5, y: 3.2, w: 2.4, h: 0.5, type: 'plat' },
    { x: 31.5, y: 2.1, w: 2.6, h: 0.5, type: 'plat' },
    { x: 37, y: 0.4, w: 2.6, h: 0.8, type: 'ground' },
    { x: 43.5, y: 3.0, w: 2.4, h: 0.5, type: 'plat' },
    { x: 49, y: 1.9, w: 2.6, h: 0.5, type: 'plat' },
    { x: 55, y: 0.45, w: 2.6, h: 0.9, type: 'ground' },
    { x: 61, y: 3.1, w: 2.4, h: 0.5, type: 'plat' },
    { x: 66.5, y: 2.0, w: 2.8, h: 0.5, type: 'plat' },
  ],
};
// 场景 → 布局(custom 关卡由 loadCustomLevel 接管)
const savedScene = localStorage.getItem('contra-scene') || 'wild';
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
  // 先把可破坏块替换成 0.5m tile 网格(tile 也是小 rect,所有遍历点零改动),
  // 子弹命中某 tile 只碎那一片 —— 局部弹坑,而不是整块消失
  for (let i = LEVEL.rects.length - 1; i >= 0; i--) {
    const r = LEVEL.rects[i];
    if (r.destructible === false) continue;
    const cols = Math.max(1, Math.round(r.w / TILE));
    const rows = Math.max(1, Math.round(r.h / TILE));
    const tw = r.w / cols, th = r.h / rows;
    for (let c = 0; c < cols; c++) {
      for (let ro = 0; ro < rows; ro++) {
        LEVEL.rects.push({
          x: r.x - r.w / 2 + tw * (c + 0.5),
          y: r.y - r.h / 2 + th * (ro + 0.5),
          w: tw, h: th, type: r.type, destructible: true,
        });
      }
    }
    LEVEL.rects.splice(i, 1);
  }
  for (const r of LEVEL.rects) {
    ensureRectHp(r);
    const b = world.createBody({ type: 'static', position: Vec2(r.x, r.y) });
    b.createFixture(new Box(r.w / 2, r.h / 2), {
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
  const scene = localStorage.getItem('contra-scene');
  if (scene && scene !== 'custom') return false;
  const c = loadCustomLevel();
  return !!c && Array.isArray(c.rects) && localStorage.getItem('contra-level-active') === '1';
}
function applyCustomIfActive() {
  if (!isCustomActive()) return;
  const c = loadCustomLevel();
  // v1 存的是左下角(与消费端错位的旧格式),v2 起存中心点;旧档按绘制意图转一次
  const toCenter = (r) => (c.version >= 2 ? r : { ...r, x: r.x + r.w / 2, y: r.y + r.h / 2 });
  // 固定主地表(防掉深渊)+ 用户画的块(全部可破坏)
  LEVEL.rects = [
    { x: 33, y: -1.5, w: 90, h: 3, type: 'ground', destructible: false },
    ...c.rects.map((r) => {
      const t = toCenter(r);
      return { x: t.x, y: t.y, w: t.w, h: t.h, type: t.type || 'plat', destructible: true };
    }),
  ];
}
applyCustomIfActive();

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
  localStorage.setItem('contra-scene', id);
}

const bgImgs = {};
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
  desert: { dir: 'bg/desert', scale: 2.0, files: { sky: 'clouds.png', far: 'far.png', near: 'dunes.png', trees: 'bush.png', fore: 'bush.png' } },
  tropic: { dir: 'bg/tropic', scale: 2.0, files: { sky: 'sky.png', far: 'ridge.png', near: 'palms.png', trees: 'grass.png', fore: 'grass.png' } },
};
const curSet = BG_SETS[savedScene] || BG_SETS.wild;
for (const [k, f] of Object.entries(curSet.files)) {
  const im = new Image();
  im.src = `${curSet.dir}/${f}`;
  bgImgs[k] = im;
}
const BG_SCALE = curSet.scale; // 素材层放大倍数(随关卡素材分辨率不同)
// 染色缓存:素材层 × 主题 → 离屏 canvas(滤镜只跑一次,平铺时零开销)
let tintCache = {};
function tinted(key) {
  const img = bgImgs[key];
  if (!img.complete || !img.naturalWidth) return null;
  const id = themeId + ':' + key;
  if (tintCache[id]) return tintCache[id];
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cc = cv.getContext('2d');
  cc.filter = currentTheme().filter;
  cc.drawImage(img, 0, 0);
  cc.filter = 'none';
  tintCache[id] = cv;
  return cv;
}
// 横向平铺绘制(带视差偏移;sky 层不染色,其余走主题染色)
function drawTiled(c, key, W, H, offset, alpha = 1) {
  const img = key === 'sky' ? bgImgs.sky : tinted(key);
  if (!img) return;
  const w = (img.width || img.naturalWidth) * BG_SCALE;
  let sx = ((offset % w) + w) % w;
  c.globalAlpha = alpha;
  for (let x = -sx; x < W; x += w) c.drawImage(img, x, 0, w, H);
  c.globalAlpha = 1;
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
  drawTiled(ctx, 'fore', W, H, camX * PPM_FG, curSet.foreAlpha ?? 0.85);
}
const PPM_FG = 52 * 1.15;

export function drawTerrain(ctx, rects, w2s, ppm) {
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
    if (r.type === 'ground') {
      ctx.fillStyle = '#4a3524';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#3e7a3c';
      ctx.fillRect(sx, sy, w, Math.min(10, h * 0.16));
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(sx, sy + 10, w, 3);
    } else {
      ctx.fillStyle = '#5b4a33';
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = '#7a6446';
      ctx.fillRect(sx, sy, w, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(sx, sy + h - 3, w, 3);
    }
  }
}
