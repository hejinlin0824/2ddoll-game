// 敌人 = AI 驱动的 Player 实例(照抄主角的骨骼/物理/姿态管线,由"虚拟手柄"输入驱动):
// 主角踩过的坑(卡地面/关节限位/姿势伺服/曲线弹道)全部自动继承 —— 敌人天生就是关节小人。
// 行为:巡航(边界来回)/驻扎(站岗)/警戒(玩家 12m 交战,保持 6~10m 走位,点射)。
// 伤害:部位倍率 头×2/身×1/腿×0.2;头盔/背心消耗品先扣耐久,归零 → 布娃娃倒地(受击方向)。
import { Player } from './player.js';
import { Vec2 } from 'planck';
import { QUALITY, ARMOR_BASE_DUR, loadSavedGun, EQUIP_PRESETS } from './gunPresets.js';

const ALERT_R = 12, DEALERT_R = 16;
// 绿头巾敌兵配色(和主角区分)
const ENEMY_PALETTE = {
  pants: '#4a4030', pantsDark: '#38311f',
  bandana: '#3f6b3a', bandanaDark: '#2d5029',
  skin: '#c89568', skinDark: '#9a7454',
};

export class Dummy {
  // opts: { behavior: 'patrol'|'guard', min, max(巡逻边界,相对出生点), quality }
  constructor(world, spawn, opts = {}) {
    this.world = world;
    this.spawn = { x: spawn.x, y: spawn.y };
    this.behavior = opts.behavior || 'guard';
    this.min = opts.min ?? -5;
    this.max = opts.max ?? 5;
    this.quality = opts.quality || 'normal';
    this.maxHp = 30;
    this.events = [];       // 对外事件(main 消费:开枪/死亡/重生)
    this.alive = true;
    this.hp = this.maxHp;
    this.face = -1;
    this.alert = false;
    this.patrolDir = 1;
    this.respawnT = 0;
    this.fireT = 1.2 + Math.random();
    this.burstLeft = 0; this.burstCd = 0;
    this.ai = { left: false, right: false, down: false, fire: false, jumpPressed: false, aim: null };
    this.spawnEnemy();
  }

  spawnEnemy() {
    this.p = new Player(this.world, Vec2(this.spawn.x, this.spawn.y), {
      palette: ENEMY_PALETTE,
      // 固定穿预设原画装备(不读 localStorage,和玩家自定义装备解耦)
      loadout: { head: EQUIP_PRESETS.helmet_military, torso: EQUIP_PRESETS.vest_light },
    });
    this.p.gunDef = loadSavedGun();
    this.p.ammo = this.p.gunDef.stats.mag;
    this.hp = this.maxHp;
    this.resetArmor();
  }

  resetArmor() {
    const q = QUALITY[this.quality];
    this.armor = {
      head: { dur: ARMOR_BASE_DUR.head * q.durMul, max: ARMOR_BASE_DUR.head * q.durMul, quality: this.quality },
      body: { dur: ARMOR_BASE_DUR.body * q.durMul, max: ARMOR_BASE_DUR.body * q.durMul, quality: this.quality },
    };
  }

  get x() { return this.p.torso.getPosition().x; }
  get y() { return this.p.torso.getPosition().y; }
  get radius() { return 0.4; }

  zoneAt(px, py) {
    const t = this.p.torso.getPosition();
    const dx = px - t.x, dy = py - t.y;
    if (Math.abs(dx) <= 0.16 && Math.abs(dy - 0.53) <= 0.17) return 'head';
    if (Math.abs(dx) <= 0.17 && Math.abs(dy) <= 0.29) return 'body';
    if (Math.abs(dx) <= 0.15 && dy <= -0.29 && dy >= -0.83) return 'legs';
    return null;
  }

  // 击中部位:有甲先扣耐久(承伤=伤害),归零报碎;无甲扣血。dir = 子弹方向(死亡布娃娃受力)
  hit(zone, dmg, dir) {
    if (!this.alive) return null;
    let broke = null;
    const armor = this.armor[zone];
    if (armor && armor.dur > 0) {
      armor.dur = Math.max(0, armor.dur - dmg);
      if (armor.dur === 0) broke = zone;
      return { broke, absorbed: true };
    }
    this.hurt(dmg, dir);
    return { broke: null, absorbed: false };
  }

  hurt(dmg, dir) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp <= 0) this.die(dir || { x: this.face, y: 0.2 });
  }

  knockback(vx, vy) {
    const v = this.p.torso.getLinearVelocity();
    this.p.torso.setLinearVelocity(Vec2(v.x + vx, v.y + vy));
  }

  // 死亡:布娃娃倒地(Player.setRagdoll 自带关节瘫软),掉落由事件抛给 main
  die(dir) {
    this.alive = false;
    this.respawnT = 3.5;
    this.p.setRagdoll(true);
    const v = this.p.torso.getLinearVelocity();
    this.p.torso.setLinearVelocity(Vec2(dir.x * 3 + v.x, dir.y * 1.5 + 2.5));
    const drops = [];
    for (const slot of ['head', 'body']) {
      if (Math.random() < 0.5) drops.push({ slot, quality: this.quality });
    }
    this.events.push({ type: 'died', x: this.x, y: this.y, coins: 3 + Math.floor(Math.random() * 6), drops });
  }

  // 尸体受击:子弹继续推动布娃娃
  corpseHit(dir, power = 2.2) {
    if (this.alive) return;
    const v = this.p.torso.getLinearVelocity();
    this.p.torso.setLinearVelocity(Vec2(v.x + dir.x * power, v.y + dir.y * power + 0.5));
  }

  // AI:合成虚拟手柄驱动内部 Player
  update(dt, player, playerAlive) {
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) { this.spawnEnemy(); this.events.push({ type: 'respawn', x: this.spawn.x, y: this.spawn.y }); }
      return;
    }
    const ai = this.ai;
    ai.left = ai.right = ai.down = ai.fire = false;
    ai.jumpPressed = false;

    const tp = this.p.torso.getPosition();
    const pp = player ? player.torso.getPosition() : tp;
    const dist = Math.hypot(pp.x - tp.x, pp.y - tp.y);
    if (playerAlive && dist < ALERT_R) this.alert = true;
    else if (!playerAlive || dist > DEALERT_R) this.alert = false;

    let vx = 0;
    if (this.alert && playerAlive) {
      this.face = pp.x >= tp.x ? 1 : -1;
      ai.aim = { x: pp.x + (Math.random() - 0.5) * 0.7, y: pp.y + (Math.random() - 0.5) * 0.5 };
      // 走位:保持 6~10m
      if (dist > 10) vx = this.face * 1.7;
      else if (dist < 5) vx = -this.face * 1.2;
      // 点射:1.5s 一轮,一轮 2~4 发
      this.fireT -= dt;
      if (this.fireT <= 0) { this.burstLeft = 2 + Math.floor(Math.random() * 3); this.fireT = 1.5 + Math.random(); }
      if (this.burstLeft > 0) {
        this.burstCd -= dt;
        if (this.burstCd <= 0) { ai.fire = true; this.burstLeft--; this.burstCd = 0.13; }
      }
    } else if (this.behavior === 'patrol') {
      const target = this.spawn.x + (this.patrolDir > 0 ? this.max : this.min);
      if ((this.patrolDir > 0 && tp.x >= target) || (this.patrolDir < 0 && tp.x <= target)) this.patrolDir *= -1;
      vx = this.patrolDir * 1.1;
      this.face = this.patrolDir;
    }

    if (vx < -0.05) ai.left = true;
    if (vx > 0.05) ai.right = true;

    this.p.update(dt, ai);
    // 内部 Player 的开枪/换弹事件转发给 main(子弹以 enemy 阵营生成)
    for (const ev of this.p.events) this.events.push(ev);
  }

  // ---- 绘制:委托内部 Player(同款关节小人) ----
  draw(c, w2s, ppm, time) {
    this.p.draw(c, w2s, ppm, time);
  }
}
