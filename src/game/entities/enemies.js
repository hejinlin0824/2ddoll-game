// 敌人 = AI 驱动的 Player 实例(照抄主角的骨骼/物理/姿态管线,由"虚拟手柄"输入驱动):
// 主角踩过的坑(卡地面/关节限位/姿势伺服/曲线弹道)全部自动继承 —— 敌人天生就是关节小人。
// 行为:巡航(边界来回)/驻扎(站岗)/警戒(玩家 12m 交战,保持 6~10m 走位,点射)。
// 伤害:部位倍率 头×2/身×1/腿×0.2;头盔/背心消耗品先扣耐久,归零 → 布娃娃倒地(受击方向)。
import { Player } from './player.js';
import { Vec2 } from 'planck';
import { QUALITY, ARMOR_BASE_DUR, GUN_PRESETS, EQUIP_PRESETS } from '../domain/gunPresets.js';
import { LEVEL } from '../world/level.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const ALERT_R = 12, DEALERT_R = 16;
const POISE_MAX = 8; // 韧性条上限(普通兵):约 3 发肉击或 5 发甲击必踉跄
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
    this.maxHp = 10; // 普通小兵脆一点,玩家打起来爽
    this.respawn = opts.respawn !== false; // 波次模式 false:死亡后由波次管理器清理
    this.armorMul = opts.armorMul ?? 1;
    this.excludeGun = opts.excludeGun || null; // 不与玩家撞枪
    this.flashT = 0;     // 受击闪白
    this.events = [];       // 对外事件(main 消费:开枪/死亡/重生)
    this.alive = true;
    this.hp = this.maxHp;
    this.face = -1;
    this.alert = false;
    this.patrolDir = 1;
    this.respawnT = 0;
    this.fireT = 1.2 + Math.random();
    this.burstLeft = 0; this.burstCd = 0;
    this.strafeFlip = 1; // 走位方向翻转(虽然用处所有 || 1 兜底,但显式初始化不欠账)
    this.deadT = 0;      // 波次模式尸体存留计时
    this.poise = 0;      // 韧性条:连续受击积累,满了踉跄(确定性规则,不是随机踉跄)
    this.staggerT = 0;   // 踉跄剩余时间:站不稳、开不了枪
    this.freezeT = 0;    // 个体顿帧剩余时间:只冻这一个,世界照常跑(见 freezeHit/pinFrozen)
    this.frozen = null;  // 冻结瞬间的全身刚体位姿快照
    this.ai = { left: false, right: false, down: false, fire: false, jumpPressed: false, aim: null };
    this.spawnEnemy();
  }

  spawnEnemy(pos) {
    // 必须销毁旧实例的刚体,否则每次死亡重生都泄漏 10 体+9 关节,越玩越卡
    if (this.p) this.p.destroy();
    const at = pos || Vec2(this.spawn.x, this.spawn.y);
    this.p = new Player(this.world, at, {
      palette: ENEMY_PALETTE,
      // 固定穿预设原画装备(不读 localStorage,和玩家自定义装备解耦)
      loadout: { head: EQUIP_PRESETS.helmet_military, torso: EQUIP_PRESETS.vest_light },
    });
    // 随机一把枪:不再和玩家用同一把(内置预设池里抽)
    const pool = Object.keys(GUN_PRESETS).filter((n) => n !== this.excludeGun);
    this.gunName = pool[Math.floor(Math.random() * pool.length)];
    this.p.gunDef = { ...GUN_PRESETS[this.gunName] };
    this.p.ammo = this.p.gunDef.stats.mag;
    this.hp = this.maxHp;
    this.stuckT = 0;
    this.alive = true;   // ★ 之前漏了这行:重生后 alive 一直是 false,敌人永久脑死亡冻在原地
    this.respawnT = 0;
    this.freezeT = 0;    // 重生不许继承旧尸的冻结(位姿快照对新刚体是传送门)
    this.frozen = null;
    this.resetArmor();
  }

  resetArmor() {
    const q = QUALITY[this.quality];
    this.armor = {
      head: { dur: ARMOR_BASE_DUR.head * q.durMul * this.armorMul, max: ARMOR_BASE_DUR.head * q.durMul * this.armorMul, quality: this.quality },
      body: { dur: ARMOR_BASE_DUR.body * q.durMul * this.armorMul, max: ARMOR_BASE_DUR.body * q.durMul * this.armorMul, quality: this.quality },
    };
  }

  get x() { return this.p.torso.getPosition().x; }
  get y() { return this.p.torso.getPosition().y; }
  get radius() { return 0.4; }

  zoneAt(px, py) {
    const t = this.p.torso.getPosition();
    // 世界 → 躯干局部坐标(随躯干旋转):布娃娃倾斜/倒地时部位判定跟着转,不再硬套固定盒
    const a = this.p.torso.getAngle();
    const c = Math.cos(a), s = Math.sin(a);
    const wx = px - t.x, wy = py - t.y;
    const dx = c * wx + s * wy;
    const dy = -s * wx + c * wy;
    if (Math.abs(dx) <= 0.16 && Math.abs(dy - 0.53) <= 0.17) return 'head';
    if (Math.abs(dx) <= 0.17 && Math.abs(dy) <= 0.29) return 'body';
    if (Math.abs(dx) <= 0.15 && dy <= -0.29 && dy >= -0.83) return 'legs';
    return null;
  }

  // 视线检测(slab 法射线 vs 地形盒):无视线不开枪 —— 以前会朝着山体傻射
  hasLOS(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    for (const r of LEVEL.rects) {
      let tmin = 0, tmax = Infinity, blocked = true;
      const axes = [[x0, dx, r.x, r.w / 2], [y0, dy, r.y, r.h / 2]];
      for (const [o, d, cc, h] of axes) {
        if (Math.abs(d) < 1e-9) {
          if (Math.abs(o - cc) > h) { blocked = false; break; }
        } else {
          let t1 = (cc - h - o) / d, t2 = (cc + h - o) / d;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { blocked = false; break; }
        }
      }
      if (blocked && tmin > 0.02 && tmin < 1) return false; // 交点落在线段内 = 被挡
    }
    return true;
  }

  // 击中部位:有甲先扣耐久(承伤=伤害×破甲倍率),归零报碎;无甲扣血。dir = 子弹方向(死亡布娃娃受力)
  // 受击反馈(确定性,调研结论:踉跄规则要可预期,玩家潜意识讨厌纯随机):
  //  每发都有的:闪白 + 沿弹道击退 + 打断瞄准;韧性条满 → 踉跄(站不稳开不了枪 0.45s)
  //  爆头夸张化:双倍韧性 + 更久闪白(奖励精确射击)
  hit(zone, dmg, dir, armorMul = 1) {
    if (!this.alive) return null;
    const head = zone === 'head';
    this.flashT = head ? 0.22 : 0.14; // 受击闪白(爆头更久)
    this.alert = true; // 疼痛警觉:挨打立知有敌
    let broke = null;
    // 沿弹道击退:每发都推一下布娃娃(肉击全额,甲击减半 —— 打甲上闷响,打肉上踉跄)
    const kb = (head ? 1.6 : 1) * Math.min(2.2, 0.5 + dmg * 0.12);
    const v = this.p.torso.getLinearVelocity();
    this.p.torso.setLinearVelocity(Vec2(v.x + dir.x * kb, v.y + dir.y * kb * 0.5 + (head ? 0.8 : 0.3)));
    const armor = this.armor[zone];
    if (armor && armor.dur > 0) {
      armor.dur = Math.max(0, armor.dur - dmg * armorMul); // 破甲词条:对耐久伤害加倍
      if (armor.dur === 0) broke = zone;
      this.poise += dmg * 0.5 * (head ? 1.5 : 1);
      this.fireT = Math.max(this.fireT, 0.22); // 打断瞄准(被压制)
      if (this.poise >= POISE_MAX) this.stumble(dir);
      return { broke, absorbed: true };
    }
    this.poise += dmg * (head ? 2 : 1);
    if (this.poise >= POISE_MAX) this.stumble(dir);
    this.hurt(dmg, dir, zone);
    return { broke: null, absorbed: false };
  }

  // 踉跄:韧性条满触发,确定性 —— 连续命中 3~4 发必踉跄,期间开不了枪站不稳
  stumble(dir) {
    this.poise = 0;
    this.staggerT = 0.45;
    this.burstLeft = 0;
    this.fireT = Math.max(this.fireT, 0.7);
    const v = this.p.torso.getLinearVelocity();
    this.p.torso.setLinearVelocity(Vec2(v.x + dir.x * 3.2, v.y + 1.6));
  }

  hurt(dmg, dir, zone) {
    if (!this.alive) return;
    this.flashT = 0.09; // 受击闪白(近战/枪击通用)
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp <= 0) this.die(dir || { x: this.face, y: 0.2 }, zone);
  }

  knockback(vx, vy) {
    const v = this.p.torso.getLinearVelocity();
    this.p.torso.setLinearVelocity(Vec2(v.x + vx, v.y + vy));
  }

  // 死亡:布娃娃倒地(Player.setRagdoll 自带关节瘫软),掉落由事件抛给 main
  die(dir, zone) {
    this.alive = false;
    this.respawnT = this.respawn ? 3.5 : 0;
    this.p.setRagdoll(true);
    const v = this.p.torso.getLinearVelocity();
    this.p.torso.setLinearVelocity(Vec2(dir.x * 3 + v.x, dir.y * 1.5 + 2.5));
    const drops = [];
    for (const slot of ['head', 'body']) {
      if (Math.random() < 0.5) drops.push({ slot, quality: this.quality });
    }
    // zone/dir 给 main 的手感层:爆头击杀顿帧更狠、爆浆沿弹道方向喷
    this.events.push({ type: 'died', x: this.x, y: this.y, zone, dir, coins: 3 + Math.floor(Math.random() * 6), drops });
  }

  // 尸体受击:子弹继续推动布娃娃
  corpseHit(dir, power = 2.2) {
    if (this.alive) return;
    const v = this.p.torso.getLinearVelocity();
    this.p.torso.setLinearVelocity(Vec2(v.x + dir.x * power, v.y + dir.y * power + 0.5));
  }

  // 被枪声/队友传唤点名:进入战斗状态(主动跑向交战距离,不再站桩等你走近)
  alertTo() {
    if (!this.alive) return;
    this.alert = true;
    this.flashT = Math.max(this.flashT, 0.12); // 惊觉一颤
  }

  // ---- 个体顿帧:受击/被击杀时只定格这一个敌人,世界照常跑 ----
  // 原理:抓下全身刚体的位姿+速度快照,期间 game.js 在每次 world.step 后用
  // pinFrozen() 回填 —— 物理照算,但它的姿态纹丝不动;到点释放,击退/坠亡接着演。
  freezeHit(dur) {
    this.freezeT = Math.max(this.freezeT, dur);
    const bodies = this.p.allBodies;
    if (!this.frozen || this.frozen.length !== bodies.length) {
      this.frozen = bodies.map(() => ({ x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0 }));
    }
    bodies.forEach((b, i) => {
      const f = this.frozen[i];
      const p = b.getPosition(), v = b.getLinearVelocity();
      f.x = p.x; f.y = p.y; f.a = b.getAngle();
      f.vx = v.x; f.vy = v.y; f.w = b.getAngularVelocity();
    });
  }

  // world.step 之后由 game.js 调:把刚被物理推进的位姿摁回快照(等效这一具暂停模拟)
  pinFrozen() {
    if (!this.frozen) return;
    const bodies = this.p.allBodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i], f = this.frozen[i];
      b.setTransform(Vec2(f.x, f.y), f.a);
      b.setLinearVelocity(Vec2(f.vx, f.vy));
      b.setAngularVelocity(f.w);
    }
  }

  // AI:合成虚拟手柄驱动内部 Player
  update(dt, player, playerAlive) {
    // 个体顿帧:定格期间 AI/计时器/电机伺服全停(位姿由 pinFrozen 每步回填,物理在 world.step 照算)
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      return;
    }
    // 地图边界:活人/尸体都不许走出地图(击退/巡逻越界一律拦回)
    {
      const tp0 = this.p.torso.getPosition();
      const bL = LEVEL.bounds.left + 0.6, bR = LEVEL.bounds.right - 0.6;
      if (tp0.x < bL || tp0.x > bR) {
        this.p.torso.setPosition(Vec2(clamp(tp0.x, bL, bR), tp0.y));
        const v = this.p.torso.getLinearVelocity();
        this.p.torso.setLinearVelocity(Vec2(clamp(v.x, -2, 2), v.y));
      }
    }
    if (!this.alive) {
      if (this.respawn) {
        this.respawnT -= dt;
        if (this.respawnT <= 0) {
          // 出生点若被玩家/其他敌人占着,向远离玩家一侧偏移,避免重叠弹射
          let sx = this.spawn.x;
          if (player) {
            const pdx = player.torso.getPosition().x - sx;
            if (Math.abs(pdx) < 1.6) sx -= Math.sign(pdx || 1) * 2.2;
          }
          this.spawnEnemy({ x: sx, y: this.spawn.y });
          this.events.push({ type: 'respawn', x: sx, y: this.spawn.y });
        }
        return;
      }
      // 波次模式:尸体保留 6 秒(布娃娃残响),之后销毁刚体并标记,由 main 移出注册表
      this.deadT = (this.deadT || 0) + dt;
      if (this.deadT > 6 && !this.destroyed) {
        this.destroyed = true;
        this.p.destroy();
      }
      return;
    }
    const ai = this.ai;
    ai.left = ai.right = ai.down = ai.fire = false;
    ai.jumpPressed = false;
    this.flashT = Math.max(0, (this.flashT || 0) - dt);

    const tp = this.p.torso.getPosition();
    const pp = player ? player.torso.getPosition() : tp;
    const dist = Math.hypot(pp.x - tp.x, pp.y - tp.y);
    // 交战粘性:进入战斗后保持警戒直到玩家倒下 —— 否则"远处点名"会被距离条件立刻覆盖
    // (敌人要跑步穿过大半张地图来交战,途中距离始终 > DEALERT_R,不能拿它当解除条件)
    if (!playerAlive) this.alert = false;
    else if (!this.alert && dist < ALERT_R) this.alert = true;
    this.staggerT = Math.max(0, this.staggerT - dt);
    this.poise = Math.max(0, this.poise - dt * 3); // 韧性缓慢恢复(停火 2.7s 清空)

    let vx = 0;
    if (this.alert && playerAlive) {
      this.face = pp.x >= tp.x ? 1 : -1;
      ai.aim = { x: pp.x + (Math.random() - 0.5) * 0.7, y: pp.y + (Math.random() - 0.5) * 0.5 };
      const sf = this.strafeFlip || 1;
      const los = this.hasLOS(tp.x, tp.y + 0.45, pp.x, pp.y + 0.45); // 胸口高度对射视线
      if (this.staggerT > 0) {
        vx = -this.face * 0.5; // 踉跄:控制不住往后倒
      } else if (dist > 12 || !los) {
        vx = this.face * 2.4; // 冲锋:直奔 12m 交战线;失去视线也逼近(贴近了往往绕出障碍)
      } else if (dist > 10) {
        vx = this.face * 1.7 * sf; // 走位:保持 6~10m(卡墙换边时方向翻转)
      } else if (dist < 5) {
        vx = -this.face * 1.2 * sf;
      }
      // 点射:1.5s 一轮,一轮 2~4 发;交战距离(≤12m)+ 有视线才开火,踉跄中打不了
      this.fireT -= dt;
      if (this.fireT <= 0 && this.staggerT <= 0 && dist <= 12 && los) {
        this.burstLeft = 2 + Math.floor(Math.random() * 3);
        this.fireT = 1.5 + Math.random();
      }
      if (this.burstLeft > 0) {
        if (!los) this.burstLeft = 0; // 射击中途视线断了:立即停手,不往墙上糊子弹
        else {
          this.burstCd -= dt;
          if (this.burstCd <= 0) { ai.fire = true; this.burstLeft--; this.burstCd = 0.13; }
        }
      }
      // 玩家在近处的高台上:起跳去够(以前只有卡墙才跳,永远趴在高台下面挨不着)
      if (this.staggerT <= 0 && this.p.grounded && pp.y > tp.y + 0.9 && dist < 3.4) ai.jumpPressed = true;
    } else if (this.behavior === 'patrol') {
      const target = this.spawn.x + (this.patrolDir > 0 ? this.max : this.min);
      // 提前 0.3m 掉头(滞后):防止在边界处来回抖动
      if ((this.patrolDir > 0 && tp.x >= target - 0.3) || (this.patrolDir < 0 && tp.x <= target + 0.3)) this.patrolDir *= -1;
      vx = this.patrolDir * 1.1;
      this.face = this.patrolDir;
    }

    if (vx < -0.05) ai.left = true;
    if (vx > 0.05) ai.right = true;

    // 卡墙检测:想走但实际速度≈0 → 跳一下脱困 + 掉头(巡逻换向 / 战斗换边)
    const avx = Math.abs(this.p.torso.getLinearVelocity().x);
    if ((ai.left || ai.right) && avx < 0.25) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 0.8) {
        this.stuckT = 0;
        ai.jumpPressed = true; // 跳可脱困卡台阶/卡边角,对边界抖动也无害
        if (this.alert) this.strafeFlip = -(this.strafeFlip || 1);
        else this.patrolDir *= -1;
      }
    } else this.stuckT = 0;

    this.p.update(dt, ai);
    // 内部 Player 的开枪/换弹事件转发给 main(子弹以 enemy 阵营生成)
    for (const ev of this.p.events) this.events.push(ev);
  }

  // ---- 绘制:委托内部 Player(同款关节小人);受击时闪白+抖动 ----
  draw(c, w2s, ppm, time) {
    if (this.flashT > 0.01) {
      c.save();
      c.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);
      this.p.draw(c, w2s, ppm, time);
      this.p.drawFlash(c, w2s, Math.min(0.9, this.flashT / 0.14));
      c.restore();
    } else {
      this.p.draw(c, w2s, ppm, time);
    }
  }
}
