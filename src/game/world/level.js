// 关卡地形:静态刚体 + 视差背景绘制
import { Box, Vec2 } from 'planck';

export const CAT = { GROUND: 0x1, PLAYER: 0x2, LIMB: 0x4 };

// rects 以中心点 + 尺寸表示(米),type: ground=地表 / plat=悬浮平台
export const LEVEL = {
  bounds: { left: -12, right: 78 },
  spawn: { x: 0, y: 0 },
  rects: [
    { x: 33, y: -1.5, w: 90, h: 3, type: 'ground', destructible: false },
    { x: 26.5, y: 0.5, w: 3, h: 1, type: 'ground' },
    { x: 30.2, y: 1.0, w: 3.4, h: 2, type: 'ground' },
    { x: 7, y: 2.4, w: 3.6, h: 0.5, type: 'plat' },
    { x: 13.5, y: 3.8, w: 3.2, h: 0.5, type: 'plat' },
    { x: 20, y: 2.8, w: 3.6, h: 0.5, type: 'plat' },
    { x: 40, y: 2.6, w: 4, h: 0.5, type: 'plat' },
    { x: 47.5, y: 4.0, w: 3.4, h: 0.5, type: 'plat' },
    { x: 54, y: 2.4, w: 3.6, h: 0.5, type: 'plat' },
  ],
};

// 块耐久:按面积算(平台 3.6x0.5 ≈ 72HP,步枪 3~4 发打穿);主地表不可破坏
export function ensureRectHp(r) {
  if (r.maxHp == null) {
    r.maxHp = Math.round(r.w * r.h * 40);
    r.hp = r.maxHp;
    r.destructible = r.destructible !== false; // 归一:默认可破坏,仅显式 false 例外
  }
  return r;
}

export function buildLevel(world) {
  const bodies = [];
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

// 破坏一块地形:从 rects 移除 + 销毁刚体(调用方负责特效/音效)
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
  const c = loadCustomLevel();
  return !!c && Array.isArray(c.rects) && localStorage.getItem('contra-level-active') === '1';
}
function applyCustomIfActive() {
  const c = loadCustomLevel();
  if (!c || !Array.isArray(c.rects) || localStorage.getItem('contra-level-active') !== '1') return;
  // 固定主地表(防掉深渊)+ 用户画的块(全部可破坏)
  LEVEL.rects = [
    { x: 33, y: -1.5, w: 90, h: 3, type: 'ground', destructible: false },
    ...c.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, type: r.type || 'plat', destructible: true })),
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
const bgImgs = {};
for (const [k, f] of Object.entries({
  sky: 'bg/mountains-bg.png', far: 'bg/mountains-far.png',
  near: 'bg/mountains-near.png', trees: 'bg/trees.png', fore: 'bg/foreground-trees.png',
})) {
  const im = new Image();
  im.src = f;
  bgImgs[k] = im;
}
const BG_SCALE = 4.5; // 160px 高的像素图层放大到全屏(720/160)
// 横向平铺绘制(带视差偏移)
function drawTiled(c, img, W, H, offset, alpha = 1) {
  if (!img.complete || !img.naturalWidth) return;
  const w = img.width * BG_SCALE;
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
  if (!SKY || SKY.width !== W || SKY.height !== H) {
    SKY = document.createElement('canvas');
    SKY.width = W; SKY.height = H;
    const c = SKY.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c2a4d');
    g.addColorStop(0.55, '#3d5480');
    g.addColorStop(1, '#c97a4a');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  ctx.drawImage(SKY, 0, 0);
  drawTiled(ctx, bgImgs.sky, W, H, camX * 4, 1); // 素材天空层(星星/云)
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
  drawTiled(ctx, bgImgs.far, W, H, camX * ppm * 0.06, 0.95);   // 远山
  drawTiled(ctx, bgImgs.near, W, H, camX * ppm * 0.18, 1);     // 近山
  drawTiled(ctx, bgImgs.trees, W, H, camX * ppm * 0.34, 1);    // 树林
  // 夜色压暗(素材是黄昏色调,压成夜晚氛围)
  ctx.fillStyle = 'rgba(16,24,52,0.34)';
  ctx.fillRect(0, 0, W, H);
}

// 前景树剪影(世界绘制完成后调用,增加纵深)
export function drawForeground(ctx, W, H, camX) {
  drawTiled(ctx, bgImgs.fore, W, H, camX * PPM_FG, 0.85);
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
