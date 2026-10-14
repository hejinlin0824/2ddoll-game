// 关卡地形:静态刚体 + 视差背景绘制
import { Box, Vec2 } from 'planck';

export const CAT = { GROUND: 0x1, PLAYER: 0x2, LIMB: 0x4 };

// rects 以中心点 + 尺寸表示(米),type: ground=地表 / plat=悬浮平台
export const LEVEL = {
  bounds: { left: -12, right: 78 },
  spawn: { x: 0, y: 0 },
  rects: [
    { x: 33, y: -1.5, w: 90, h: 3, type: 'ground' },
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

export function buildLevel(world) {
  const bodies = [];
  for (const r of LEVEL.rects) {
    const b = world.createBody({ type: 'static', position: Vec2(r.x, r.y) });
    b.createFixture(new Box(r.w / 2, r.h / 2), {
      friction: 0.4,
      filterCategoryBits: CAT.GROUND,
      filterMaskBits: 0xffff,
    });
    bodies.push(b);
  }
  return bodies;
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

// ---- 绘制 ----
// 山脊伪随机(固定种子,稳定画面)
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

export function drawSky(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1c2a4d');
  g.addColorStop(0.55, '#3d5480');
  g.addColorStop(1, '#c97a4a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 太阳
  ctx.fillStyle = 'rgba(255, 214, 150, 0.9)';
  ctx.beginPath();
  ctx.arc(W * 0.72, H * 0.62, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 214, 150, 0.18)';
  ctx.beginPath();
  ctx.arc(W * 0.72, H * 0.62, 78, 0, Math.PI * 2);
  ctx.fill();
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
  drawRidge(ctx, W, H, RIDGE_FAR, 340, H * 0.66, 150, '#2f3c5f', camX * ppm * 0.15);
  drawRidge(ctx, W, H, RIDGE_NEAR, 260, H * 0.74, 110, '#26314c', camX * ppm * 0.3 + 130);
  // 丛林剪影
  drawRidge(ctx, W, H, RIDGE_NEAR, 90, H * 0.82, 60, '#1b2438', camX * ppm * 0.5 + 40);
}

export function drawTerrain(ctx, rects, w2s, ppm) {
  for (const r of rects) {
    const [sx, sy] = w2s(r.x - r.w / 2, r.y + r.h / 2);
    const w = r.w * ppm, h = r.h * ppm;
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
