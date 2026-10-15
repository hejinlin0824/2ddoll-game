// 手感层状态机:顿帧/击杀慢放/trauma 震动/低血量/心跳/连杀窗口 —— 全部走真实时间。
// 世界时停时它们照常走(step 的缩放 dt 不经过这里,由 game.js 的 frame 每帧调 tick)。
import { beep } from './audio.js';
import { streakShow, streakHide } from './hud.js';

export const feel = {
  hitStopT: 0,   // 顿帧:世界近冻结(重击/击杀)
  killSlowT: 0,  // 击杀慢动作:0.32× 速
  slowCd: 0,     // 慢放冷却(防止连续击杀把游戏锁在慢动作里)
  trauma: 0,     // 屏幕震动 trauma(0~1,实际抖动 = trauma²)
  lowHpA: 0,     // 低血量表现强度(平滑)
  heartT: 0,     // 心跳相位
  streak: 0,     // 连杀计数(3s 窗口)
  streakT: 0,
  fullMsgT: 0,   // "背包已满"提示节流
  menuFlashT: 0, // 主菜单开门"哗"瞬间的白光掠过
};

export const addTrauma = (x) => { feel.trauma = Math.min(1, feel.trauma + x); };
export function hitStop(d) { feel.hitStopT = Math.max(feel.hitStopT, d); }
// 慢放不再是每杀都送:连杀满 5 或清场最后一杀才触发(普通击杀只有顿帧+震动+爆浆)
export function killSlow(dur = 0.45) {
  if (feel.slowCd > 0) return;
  feel.slowCd = 1.6;
  feel.killSlowT = Math.max(feel.killSlowT, dur);
}

// 连杀:3s 窗口内累计;死亡清空
export function addStreak() {
  feel.streak++; feel.streakT = 3.0;
  streakShow(feel.streak);
  beep(520 + Math.min(feel.streak, 12) * 65, 900 + Math.min(feel.streak, 12) * 65, 0.1, 'square', 0.05);
  return feel.streak;
}
export function resetStreak() {
  feel.streak = 0; feel.streakT = 0;
  streakHide();
}

// 每帧(真实 dt):衰减计时器 + 低血量平滑 + 心跳
export function tickFeel(dt, pstate, playerRagdoll) {
  const f = feel;
  f.hitStopT = Math.max(0, f.hitStopT - dt);
  f.killSlowT = Math.max(0, f.killSlowT - dt);
  f.slowCd = Math.max(0, f.slowCd - dt);
  f.fullMsgT = Math.max(0, f.fullMsgT - dt);
  f.menuFlashT = Math.max(0, f.menuFlashT - dt);
  if (f.streakT > 0) {
    f.streakT -= dt;
    if (f.streakT <= 0 && f.streak > 0) resetStreak();
  }
  // 低血量:平滑强度 + 心跳相位(节拍随强度加快)。死亡后立即熄灭(红晕心跳不挂着)
  const living = pstate.hp > 0 && !playerRagdoll;
  const hpR = Math.max(0, Math.min(1, pstate.hp / pstate.maxHp));
  const target = living && hpR < 0.35 ? 1 - hpR / 0.35 : 0;
  f.lowHpA += (target - f.lowHpA) * (1 - Math.exp(-4 * dt));
  if (f.lowHpA > 0.03) {
    const prev = f.heartT;
    f.heartT += dt * (1.15 + f.lowHpA * 1.1);
    if (Math.floor(f.heartT) > Math.floor(prev)) { // 整拍触发:咚·哒 双响
      const v = 0.04 + 0.09 * f.lowHpA;
      beep(62, 38, 0.1, 'sine', v);
      beep(55, 34, 0.09, 'sine', v * 0.7, 0.15);
    }
  }
  return f;
}
