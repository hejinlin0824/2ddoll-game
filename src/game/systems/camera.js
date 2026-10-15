// 相机系统:跟随/开镜变焦/防线 + trauma 震动(trauma² × 平滑噪声,含微旋转)。
// 噪声偏移每帧算好 cam.oX/oY/oR,渲染与世界坐标共用(狙击镜自建相机天然无震动)。
import { LEVEL } from '../world/level.js';
import { mouse } from './input.js';
import { feel } from './feel.js';

export const cam = { x: 0, y: 3.4, zoom: 1, scoped: 0, oX: 0, oY: 0, oR: 0 };

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 分层正弦伪噪声:输出约 ±1 的平滑曲线(比随机抖动高级,不会闪烁)
export const nz = (t) => Math.sin(t) * 0.55 + Math.sin(t * 2.17 + 1.3) * 0.28 + Math.sin(t * 4.9 + 2.1) * 0.17;

// 世界坐标 -> 屏幕:参数化工厂,主视图(cam)与狙击镜内视图(放大镜自建相机)共用同一份公式,
// 改偏移/缩放规则只动这一处。camO.oX/oY 是 trauma 震动偏移(镜内相机没有,自然为 0)
export function makeW2S(camO, W, H, PPM) {
  const z = camO.zoom;
  const ox = camO.oX || 0, oy = camO.oY || 0;
  return (wx, wy) => [
    (wx - camO.x) * PPM * z + W / 2 + ox,
    H * 0.60 - (wy - camO.y) * PPM * z + oy,
  ];
}
export function w2s(wx, wy, W, H, PPM) { return makeW2S(cam, W, H, PPM)(wx, wy); }

// 准星当前指的世界点:每帧用画布坐标 + 当前相机实时重算。
// 不能存世界快照 —— 相机一动快照就过时,开镜时误差会被放大。
export function aimWorld(W, H, PPM) {
  if (!mouse.active) return null;
  const z = cam.zoom;
  return {
    x: (mouse.cx - W / 2) / (PPM * z) + cam.x,
    y: cam.y + (H * 0.6 - mouse.cy) / (PPM * z),
  };
}

export function updateCamera(dt, player, input, W, H, PPM) {
  const p = player.torso.getPosition();
  // 防线:相机一旦混入非有限值就会永久 NaN 并拖崩整条渲染链 —— 立即复位并留诊断
  if (!Number.isFinite(cam.x + cam.y + cam.zoom + cam.scoped) || !Number.isFinite(p.x + p.y)) {
    window.__camDiag = {
      cam: { x: cam.x, y: cam.y, zoom: cam.zoom, scoped: cam.scoped },
      player: { x: p.x, y: p.y, angle: player.torso.getAngle() },
      vel: player.torso.getLinearVelocity(),
      at: new Date().toISOString(),
    };
    cam.x = Number.isFinite(p.x) ? p.x : LEVEL.spawn.x;
    cam.y = 3.4; cam.zoom = 1; cam.scoped = 0;
  }
  let tx = p.x + player.facing * 1.4;
  let ty = Math.max(3.4, p.y + 0.6);
  // 狙击开镜:平滑变焦,视点向准星偏移
  const scoped = player.weapon === 'rifle' && player.gunDef.stats?.mode === 'hitscan' && !player.ragdoll ? 1 : 0;
  cam.scoped += (scoped - cam.scoped) * (1 - Math.exp(-7 * dt));
  cam.zoom += ((1 + 0.05 * cam.scoped) - cam.zoom) * (1 - Math.exp(-9 * dt)); // 主视图微变焦,倍率在放大镜里
  if (cam.scoped > 0.02 && mouse.active) {
    // 开镜 = 把准星的"屏幕位置"平移到屏幕中心。
    // ⚠️ 平移量必须用鼠标的画布坐标算(它不随相机变),
    //    用世界坐标追会形成"相机移动→世界点再变"的无限漂移。
    const offX = (mouse.cx - W / 2) / (PPM * cam.zoom);
    const offY = (H * 0.6 - mouse.cy) / (PPM * cam.zoom);
    tx = lerp(tx, tx + offX, cam.scoped);
    ty = lerp(ty, ty + offY, cam.scoped);
  }
  const k = 1 - Math.exp(-6 * dt);
  cam.x = lerp(cam.x, tx, k);
  cam.y = lerp(cam.y, ty, k);
  const half = W / 2 / PPM / cam.zoom;
  cam.x = clamp(cam.x, LEVEL.bounds.left + half, LEVEL.bounds.right - half);

  // trauma 震动:trauma² 曲线(小震细腻大震夸张)+ 平滑噪声
  feel.trauma = Math.max(0, feel.trauma - dt * 1.5);
  const sh = feel.trauma * feel.trauma;
  const tn = performance.now() / 1000;
  cam.oX = sh * 16 * nz(tn * 11.3);
  cam.oY = sh * 11 * nz(tn * 13.7 + 41);
  cam.oR = sh * 0.02 * nz(tn * 9.1 + 83);
}
