// 特效系统:粒子/弹壳/碎片/地面痕迹/受击飘字/狙击光束 + 枪口火舌与护甲碎裂的计时器。
// 生成器(burst/gibBurst/...)给战斗层调用;stepFx 由 game.js 的 step 每个物理步驱动。
import { groundYAt, LEVEL } from '../world/level.js';
import { QUALITY } from '../domain/gunPresets.js';

export const particles = [];  // 粒子(弹壳/尘土/血雾)
export const debris = [];     // 护甲碎片:头盔击飞 / 背心碎裂 / 爆浆碎肉
export const decals = [];     // 地面痕迹:弹孔/血渍(容量上限 FIFO)
export const floaters = [];   // 受击数字(果冻动画)
export const beams = [];      // 狙击 hitscan 光束(视觉)
// 枪口火舌 / 护甲碎裂白闪 / 玩家受击红闪 的计时器(渲染消费)
export const flash = { t: 0, x: 0, y: 0, r: 26, ang: 0 };
export let ghostT = 0;
export let hitFlashT = 0;
export function setGhost(t) { ghostT = t; }
export function setHitFlash(t) { hitFlashT = t; }

export function burst(x, y, n, color, speed = 4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s,
      life: 0.35 + Math.random() * 0.3, size: 2 + Math.random() * 2.5,
      color, grav: 1,
    });
  }
}

// ---- 地面痕迹:弹孔 / 血渍(FIFO 上限,防止长局堆积)----
export function addDecal(kind, x, y, ang, size) {
  decals.push({ kind, x, y, ang, size, life: 9, max: 9 });
  if (decals.length > 90) decals.shift();
}

// ---- 护甲碎片:头盔击飞 / 背心碎裂(品质色)----
export function spawnHelmetDebris(x, y, quality) {
  debris.push({
    type: 'helmet', color: QUALITY[quality]?.color ?? '#aab0b8',
    x, y, vx: (Math.random() - 0.5) * 4, vy: 4.5 + Math.random() * 2,
    va: (Math.random() - 0.5) * 14, angle: 0, life: 2.6, max: 2.6,
  });
}
export function spawnVestDebris(x, y, quality) {
  const col = QUALITY[quality]?.color ?? '#aab0b8';
  for (let i = 0; i < 7; i++) {
    debris.push({
      type: 'shard', color: col, w: 3 + Math.random() * 6, h: 3 + Math.random() * 6,
      x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.4,
      vx: (Math.random() - 0.5) * 5, vy: 1.5 + Math.random() * 3.5,
      va: (Math.random() - 0.5) * 16, angle: Math.random() * 3, life: 2, max: 2,
    });
  }
}

// ---- 击杀爆浆:血雾粒子 + 大块碎肉(复用碎片旋转矩形)+ 地面血渍 ----
export function gibBurst(x, y, dir) {
  const cols = ['#c9563c', '#a83a28', '#e06a50'];
  for (let i = 0; i < 18; i++) {
    particles.push({
      x, y: y + 0.2,
      vx: dir.x * (2 + Math.random() * 5) + (Math.random() - 0.5) * 4,
      vy: dir.y * 3 + 2 + Math.random() * 5,
      life: 0.5 + Math.random() * 0.4, size: 2.2 + Math.random() * 2.6,
      color: cols[i % 3], grav: 1,
    });
  }
  for (let i = 0; i < 4; i++) {
    debris.push({
      type: 'shard', color: '#7d2a1e', w: 4 + Math.random() * 5, h: 3 + Math.random() * 4,
      x, y: y + 0.2,
      vx: dir.x * (1.5 + Math.random() * 3) + (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3.5,
      va: (Math.random() - 0.5) * 18, angle: Math.random() * 3, life: 1.4, max: 1.4,
    });
  }
  addDecal('blood', x, groundYAt(x, y) + 0.02, 0, 0.3 + Math.random() * 0.25);
}

// 物理步进(dt = 世界时间):粒子弹跳/碎片/痕迹淡出/飘字果冻上浮/光束衰减
let sweepT = 0.3; // 悬空贴花扫描计时
export function stepFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy -= 22 * dt * (p.grav ?? 1);
    const gy = groundYAt(p.x, p.y + 0.5);
    if ((p.grav ?? 1) && p.vy < 0 && p.y <= gy) {
      p.y = gy;
      p.vy *= -0.35; p.vx *= 0.6;
      if (Math.abs(p.vy) < 0.6) { p.vy = 0; p.grav = 0; p.vx *= 0.5; }
    }
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  if (particles.length > 300) particles.splice(0, particles.length - 300);

  for (let i = beams.length - 1; i >= 0; i--) {
    beams[i].life -= dt;
    if (beams[i].life <= 0) beams.splice(i, 1);
  }

  for (let i = debris.length - 1; i >= 0; i--) {
    const p = debris[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 18 * dt;
    p.angle += p.va * dt;
    const gy = groundYAt(p.x, p.y + 0.2);
    if (p.y <= gy && p.vy < 0) { p.y = gy; p.vy *= -0.35; p.vx *= 0.7; p.va *= 0.6; }
    p.life -= dt;
    if (p.life <= 0) debris.splice(i, 1);
  }

  for (let i = decals.length - 1; i >= 0; i--) {
    decals[i].life -= dt;
    if (decals[i].life <= 0) decals.splice(i, 1);
  }
  // 悬空贴花兜底:地形被啃穿后,残留在已消失 tile 上的弹孔/血渍要跟着消失。
  // 销毁时的即时清理(damageTerrain)有时序漏网,这里每 0.3s 全量校验一次宿主
  sweepT -= dt;
  if (sweepT <= 0) {
    sweepT = 0.3;
    for (let i = decals.length - 1; i >= 0; i--) {
      const d = decals[i];
      const host = LEVEL.rects.some((t) => Math.abs(d.x - t.x) <= t.w / 2 + 0.08 && Math.abs(d.y - t.y) <= t.h / 2 + 0.08);
      if (!host) decals.splice(i, 1);
    }
  }

  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.age += dt;
    f.x += (f.vx || 0) * dt;
    f.y -= (f.vy || 0) * dt;
    f.vy = Math.max(0.4, f.vy - 2.2 * dt);
    f.life -= dt;
    if (f.life <= 0) floaters.splice(i, 1);
  }
}

// 计时器衰减(真实时间,由 game.js 每帧调;渲染层读这些值画遮罩)
export function decayTimers(dt) {
  flash.t = Math.max(0, flash.t - dt);
  hitFlashT = Math.max(0, hitFlashT - dt);
  ghostT = Math.max(0, ghostT - dt); // 护甲碎裂白闪必须衰减,否则整屏常白
}
