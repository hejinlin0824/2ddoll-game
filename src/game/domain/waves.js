// 波次管理器:敌人从地图最右侧刷新,按波次推进
// 第 1 波 5 人、每波 +1、上限 10;最多 15 波;难度从无甲到全套金装
// 空中部队:第 4 波起每 4 波(+终波)来一架武装直升机母体机,自带无人机编队
import { Gunship, TransportHeli } from '../entities/airunit.js';

const SPAWN_X = 74.5;      // 地图右缘(边界 78,留 3.5m)
const SPAWN_GAP = 0.55;    // 出怪间隔(秒):避免同点重叠弹射
const INTER_WAVE = 2.2;    // 波间休整
const MAX_WAVE = 15;

// ---- 每关玩法规则:母体机节奏 / 每架投兵数 / 品质提速 / 人海 ----
export const SCENE_RULES = {
  wild: { gunshipEvery: 4, batch: 4 },                          // 标准:4 波一架
  roof: { gunshipEvery: 3, batch: 3 },                          // 屋顶:制空压制,空袭每 3 波
  room: { gunshipEvery: 6, batch: 2, qualityRush: 2 },          // 巷战:精锐提前 2 波到场
  desert: { gunshipEvery: 4, batch: 4, swarm: true, cap: 13 },  // 沙丘:人海,出怪上限 13
  tropic: { gunshipEvery: 5, batch: 5, cap: 9 },                // 海岛:大批少次,一次压 5 人
};

// 波次 → 品质/护甲强度(rush = 品质提速波数,港区巷战用)
function waveSpec(w, rush = 0) {
  w += rush;
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
    const aliveN = enemies.filter((e) => e.alive).length;             // 清波判定:含空中单位
    const capN = enemies.filter((e) => e.alive && !e.airUnit).length; // 出怪上限:空中单位不占地面名额

    if (this.heli && this.heli.destroyed) this.heli = null;
    const rule = SCENE_RULES[localStorage.getItem('contra-scene') || 'wild'] || SCENE_RULES.wild;

    if (this.queue > 0) {
      // 出怪 = 运输直升机投送:一架一批,飞入 → 放绳滑降 → 离场后下一批。
      // 没有凭空刷新 —— 士兵全部从绳索上滑下来(用户指定);批大小随关卡规则变化
      this.spawnT -= dt;
      if (this.spawnT <= 0 && capN < (rule.cap || 10) && !this.heli) {
        const batch = Math.min(rule.batch, this.queue);
        this.queue -= batch;
        this.spawnT = 2.6 + batch * 0.5; // 该机卸货+离场的大致耗时,到点视情况派下一架
        this.heli = new TransportHeli(this.world, {
          enemies, count: batch,
          spec: waveSpec(this.wave, rule.qualityRush || 0),
          excludeGun: player ? player.gunDef?.name : null,
        });
        enemies.push(this.heli);
      }
      // 队列还有但直升机在场 → 等它离场(时间到了自然派下一架)
      if (this.heli) return;
      if (this.queue > 0) return;
    }

    // 队列空:全部清场(或开局休整)后进入下一波
    if (aliveN === 0) {
      this.restT -= dt;
      if (this.restT <= 0) this.start(enemies);
    } else {
      this.restT = Math.min(this.restT, INTER_WAVE);
    }
  }

  start(enemies = []) {
    this.wave++;
    if (this.wave > MAX_WAVE) {
      this.done = true;
      this.onEvent({ type: 'allclear' });
      return;
    }
    // 母体机波:节奏随关卡(wild/沙丘 4 波 / 屋顶 3 波 / 港区 6 波)+ 终波必来
    const every = (SCENE_RULES[localStorage.getItem('contra-scene') || 'wild'] || SCENE_RULES.wild).gunshipEvery;
    if (this.wave >= every && this.wave % every === 0 || this.wave === MAX_WAVE) {
      enemies.push(new Gunship(this.world, { x: SPAWN_X + 9, y: 9 }, {
        enemies,
        hp: 130 + this.wave * 14,
      }));
      this.queue = Math.min(8, 2 + this.wave);
      this.spawnT = 2.0; // 让母体机先入场,地面兵随后
      this.onEvent({ type: 'gunship', wave: this.wave });
    } else {
      const rule = SCENE_RULES[localStorage.getItem('contra-scene') || 'wild'] || SCENE_RULES.wild;
      this.queue = Math.min(rule.cap || 10, 4 + this.wave);
      this.spawnT = 0.4;
    }
    this.onEvent({ type: 'wave', wave: this.wave, count: this.queue });
  }

}

export { MAX_WAVE, SPAWN_X };
