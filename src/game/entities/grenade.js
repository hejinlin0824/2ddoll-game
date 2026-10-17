// 玩家手雷:小圆刚体(只撞地形,不与角色/肢体纠缠),拔销 1.5s 引信后起爆。
// 引信哔声随剩余时间加快 + 弹体红灯闪烁(读秒可预期,玩家敢掐雷扔);
// 爆炸结算不走这里 —— 起爆点交回 game.js 的 handleDetonation(伤害/地形/尸体冲量统一在那里,
// 与敌方 blast 事件同一套思路:实体只管物理与视觉,结算归装配根)。
import { Circle, Vec2 } from 'planck';
import { CAT } from '../world/level.js';
import { beep, noiseBurst } from '../systems/audio.js';
import { particles } from '../systems/fx.js';

export const grenades = [];
window.__grenades = grenades; // 调试句柄(同项目 window.__ 系列惯例)

// world 来自 game.js;vx/vy = 抛出初速(方向+力度由 player.grenade 算好)
export function throwGrenade(world, x, y, vx, vy) {
  const b = world.createBody({
    type: 'dynamic', position: Vec2(x, y),
    linearDamping: 0.04, angularDamping: 0.4,
  });
  b.createFixture(new Circle(0.09), {
    density: 3, friction: 0.55, restitution: 0.38,
    filterCategoryBits: CAT.LIMB, filterMaskBits: CAT.GROUND, filterGroupIndex: 0,
  });
  b.setLinearVelocity(Vec2(vx, vy));
  b.setAngularVelocity(-vx * 5); // 顺着抛出方向滚转
  grenades.push({ body: b, fuse: 1.5, beepT: 0.12, trailT: 0 });
  beep(680, 900, 0.06, 'square', 0.04); // 拔销
}

// 每物理步:引信计时/哔声/尾烟;到点销毁刚体并返回爆点(调用方结算)
export function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.fuse -= dt;
    g.beepT -= dt;
    if (g.beepT <= 0) {
      // 哔声间隔随引信收窄:0.12 → 0.06s,最后半秒是急促连响
      g.beepT = Math.max(0.055, g.fuse * 0.28);
      beep(1250, 1250, 0.028, 'square', 0.032);
    }
    g.trailT -= dt;
    if (g.trailT <= 0) {
      g.trailT = 0.06;
      const p = g.body.getPosition();
      particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 0.6, vy: 0.3, life: 0.22, size: 1.6, color: '#9aa4ae', grav: 0 });
    }
    if (g.fuse <= 0) {
      const p = g.body.getPosition();
      try { g.body.getWorld().destroyBody(g.body); } catch { /* 已销毁 */ }
      grenades.splice(i, 1);
      return { x: p.x, y: p.y };
    }
  }
  return null;
}

// 绘制:深绿蛋形弹体 + 保险杆 + 尾部烟迹已在 stepGrenades 里;
// 红灯随引信急闪(频率 8→26Hz),头顶一圈"读秒进度弧"让落点附近的人有得躲
export function drawGrenades(c, w2s, ppm, time) {
  for (const g of grenades) {
    const p = g.body.getPosition();
    const [x, y] = w2s(p.x, p.y);
    const u = ppm;
    c.save();
    c.translate(x, y);
    c.rotate(-g.body.getAngle());
    // 弹体(橄榄绿蛋形)
    c.fillStyle = '#3d4a30';
    c.strokeStyle = '#20281a'; c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(0, 0, 0.105 * u, 0.082 * u, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    // 交叉刻纹
    c.strokeStyle = 'rgba(32,40,26,0.8)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-0.09 * u, 0); c.lineTo(0.09 * u, 0); c.stroke();
    // 保险杆(灰色)
    c.strokeStyle = '#8a929c'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0.06 * u, -0.06 * u); c.quadraticCurveTo(0.14 * u, -0.12 * u, 0.1 * u, -0.16 * u); c.stroke();
    // 引信红灯:急闪
    const blink = Math.sin(time * (8 + (1.5 - g.fuse) * 16)) > 0;
    if (blink) {
      c.fillStyle = '#ff4030';
      c.beginPath(); c.arc(-0.02 * u, -0.09 * u, 0.028 * u, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255, 64, 48, 0.35)';
      c.beginPath(); c.arc(-0.02 * u, -0.09 * u, 0.06 * u, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    // 读秒进度弧(不随弹体旋转):引信剩余比例的开口圆
    const frac = Math.max(0, g.fuse / 1.5);
    c.strokeStyle = frac > 0.33 ? 'rgba(255, 200, 90, 0.85)' : 'rgba(255, 80, 60, 0.95)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y - 0.32 * u, 0.14 * u, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    c.stroke();
  }
}

// 场景重置/玩家重生时清场(reload 场景不需要,页面级重载自然清)
export function clearGrenades(world) {
  for (const g of grenades) { try { world.destroyBody(g.body); } catch { /* 已销毁 */ } }
  grenades.length = 0;
}
