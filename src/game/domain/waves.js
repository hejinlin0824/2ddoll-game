// 波次管理器:敌人从地图最右侧刷新,按波次推进
// 第 1 波 5 人、每波 +1、上限 10;最多 15 波;难度从无甲到全套金装
import { Dummy } from '../entities/enemies.js';
import { Vec2 } from 'planck';

const SPAWN_X = 74.5;      // 地图右缘(边界 78,留 3.5m)
const SPAWN_GAP = 0.55;    // 出怪间隔(秒):避免同点重叠弹射
const INTER_WAVE = 2.2;    // 波间休整
const MAX_WAVE = 15;

// 波次 → 品质/护甲强度
function waveSpec(w) {
  if (w >= 13) return { quality: 'legendary', armorMul: 1 };
  if (w >= 10) return { quality: 'epic', armorMul: 0.85 };
  if (w >= 7) return { quality: 'rare', armorMul: 0.6 };
  if (w >= 4) return { quality: 'fine', armorMul: 0.35 };
  return { quality: 'normal', armorMul: 0 }; // 前三波无甲
}

export class WaveDirector {
  constructor(world, opts = {}) {
    this.world = world;
    this.onEvent = opts.onEvent || (() => {});
    this.wave = 0;
    this.queue = 0;
    this.spawnT = 0;
    this.restT = 1.6;   // 开局短暂休整后进第一波
    this.done = false;  // 15 波打完
  }

  // 每帧:出怪队列 + 波次推进(enemies = 主注册表,死人由清理逻辑移除)
  update(dt, enemies, player, playerAlive) {
    if (this.done) return;
    const aliveN = enemies.filter((e) => e.alive).length;

    if (this.queue > 0) {
      // 出怪队列:间隔刷新,场上上限 10 人;出生点被活人占着就顺延(不消耗队列)
      this.spawnT -= dt;
      if (this.spawnT <= 0 && aliveN < 10) {
        const sx = SPAWN_X - Math.random() * 2.2;
        let crowded = false;
        for (const o of enemies) {
          if (o.alive && Math.abs(o.x - sx) < 1.2) { crowded = true; break; }
        }
        if (crowded) { this.spawnT = 0.4; return; }
        this.spawnT = SPAWN_GAP;
        this.queue--;
        this.spawnOne(enemies, player, sx);
      }
      return;
    }

    // 队列空:全部清场(或开局休整)后进入下一波
    if (aliveN === 0) {
      this.restT -= dt;
      if (this.restT <= 0) this.start();
    } else {
      this.restT = Math.min(this.restT, INTER_WAVE);
    }
  }

  start() {
    this.wave++;
    if (this.wave > MAX_WAVE) {
      this.done = true;
      this.onEvent({ type: 'allclear' });
      return;
    }
    this.queue = Math.min(10, 4 + this.wave);
    this.spawnT = 0.4;
    this.onEvent({ type: 'wave', wave: this.wave, count: this.queue });
  }

  spawnOne(enemies, player, sx) {
    const spec = waveSpec(this.wave);
    const d = new Dummy(this.world, {
      x: sx ?? SPAWN_X - Math.random() * 2.2,
      y: 0.72,
    }, {
      behavior: 'patrol',
      min: -66,   // 巡逻下限拉到玩家区域:从右缘一路向左推进
      max: 3,
      quality: spec.quality,
      armorMul: spec.armorMul,
      respawn: false, // 波次模式:死了不原地重生,由清理逻辑移除
      excludeGun: player ? player.gunDef?.name : null, // 不和玩家用同一把枪
    });
    enemies.push(d);
  }
}

export { MAX_WAVE, SPAWN_X };
