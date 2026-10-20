// 空中单位:武装直升机母体机(Gunship)+ 自杀式无人机(Drone)。
// 母体机 = 带"骨骼"的关节机体:机身/尾梁/起落橇/主旋翼/尾旋翼全部是独立刚体,
// 用带限位的 RevoluteJoint 挂接(主/尾旋翼是电机关节,常转)—— 和主角布娃娃同一套思路,
// 飞行 = 每步对机身做速度控制(P 控制器追悬停锚点)+ 俯仰角速度 PD,尾梁/橇自然甩动。
// 被击落时所有部件 gravityScale 置 1、旋翼电机减速,整机翻滚坠地爆炸。
// 无人机 = 纯算法实体(无刚体):接近 → 距离内俯冲(一发即碎,撞到玩家自爆)。
// 命中判定:弹丸系统是纯数学 zoneAt/hit 契约(不走 planck 碰撞),空中单位直接实现同一契约。
import { Box, Circle, Vec2, RevoluteJoint } from 'planck';
import { LEVEL, groundYAt, CAT } from '../world/level.js';
import { burst, debris, particles } from '../systems/fx.js';
import { hasLOS } from '../systems/combat.js';
import { Dummy } from './enemies.js';
import { beep, playSample } from '../systems/audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 空中单位碰撞层:只与地形碰撞(坠落要砸在地上),不与角色/肢体纠缠;旋翼不参与碰撞
const AIR = 0x8;
const FILTER = { filterCategoryBits: AIR, filterMaskBits: CAT.GROUND, filterGroupIndex: -7 };
const NOHIT = { filterCategoryBits: AIR, filterMaskBits: 0, filterGroupIndex: -7 };

// 母体机机炮/火箭弹词条(敌方弹丸在 game.js 统一打 ENEMY_DMG_MUL 折扣)
const GUNSHIP_GUN = {
  damage: 7.5, muzzleVel: 46, range: 22, armorDmgMul: 1.4,
  sfx: { f0: 190, f1: 45, dur: 0.12, vol: 0.13, noise: 0.15, cutoff: 640 },
};
const GUNSHIP_ROCKET = {
  damage: 24, muzzleVel: 24, range: 30, armorDmgMul: 1, rocket: true,
  sfx: { f0: 110, f1: 35, dur: 0.3, vol: 0.12, noise: 0.18, cutoff: 480 },
};

// 视线检测统一引 combat.js 的 hasLOS(全项目唯一实现,别再拷贝第三份)

export class Gunship {
  // opts: { enemies(注册表引用,放无人机用), hp }
  constructor(world, spawn, opts = {}) {
    this.world = world;
    this.audioType = 'gunship';
    this.enemies = opts.enemies || [];
    this.maxHp = opts.hp || 240;
    this.hp = this.maxHp;
    this.alive = true;
    this.destroyed = false;
    this.airUnit = true;      // 波次出怪上限不占地面名额
    this.barW = 120;          // 头顶血条比小兵宽
    this.barDy = 1.55;        // 血条悬在旋翼上方
    this.radius = 1.6;        // 狙击 hitscan 近似半径
    this.flashT = 0;
    this.events = [];
    this.state = 'enter';     // enter → combat →(被击落)坠落
    this.t = 0;
    this.side = 1;            // 悬停走位在玩家哪一侧
    this.sideT = 5;
    this.fireT = 2.2;         // 入场后缓一拍再开火
    this.burstLeft = 0; this.burstCd = 0;
    this.rocketT = 4.5; this.rocketSalvo = 0; this.rocketCd = 0;
    this.droneT = 3.5;        // 入场 3.5s 后开始放无人机
    this.smokeT = 0;
    this.crashStillT = 0;     // 坠落中近静止计时(橇着地撑住机身的兜底爆)
    this.rotorSpd = -26;
    this.face = -1;           // 机头朝向:1 = 右,-1 = 左(从右缘入场,先朝玩家)
    this.pushX = 0; this.pushY = 0; // 子弹击退的速度偏移(速度控制会覆盖,单独积累衰减)
    this.build(Vec2(spawn.x, spawn.y));
  }

  // ---- 骨骼装配:机身 + 尾梁(带垂尾) + 起落橇 + 主旋翼 + 尾旋翼 ----
  build(at) {
    const w = this.world;
    const part = (pos, gravityFree = true) => {
      const b = w.createBody({ type: 'dynamic', position: pos, gravityScale: gravityFree ? 0 : 1 });
      return b;
    };
    this.fuselage = part(at);
    this.fuselage.createFixture(new Box(0.85, 0.3), { density: 3, friction: 0.4, ...FILTER });
    this.tail = part(Vec2(at.x - 1.45, at.y + 0.02));
    this.tail.createFixture(new Box(0.65, 0.06), { density: 0.6, friction: 0.4, ...FILTER });
    this.tail.createFixture(new Box(0.05, 0.2, Vec2(-0.62, 0.18), 0), { density: 0.6, friction: 0.4, ...FILTER }); // 垂尾
    this.skid = part(Vec2(at.x, at.y - 0.42));
    this.skid.createFixture(new Box(0.62, 0.035), { density: 0.5, friction: 0.6, ...FILTER }); // 橇条
    this.skid.createFixture(new Box(0.035, 0.14, Vec2(-0.42, 0.11), 0), { density: 0.5, friction: 0.6, ...FILTER });
    this.skid.createFixture(new Box(0.035, 0.14, Vec2(0.42, 0.11), 0), { density: 0.5, friction: 0.6, ...FILTER });
    this.rotor = part(Vec2(at.x + 0.05, at.y + 0.42));
    this.rotor.createFixture(new Box(1.15, 0.025), { density: 0.15, friction: 0.2, ...NOHIT });
    this.tailRotor = part(Vec2(at.x - 2.05, at.y + 0.18));
    this.tailRotor.createFixture(new Circle(0.05), { density: 0.15, friction: 0.2, ...NOHIT });
    this.allBodies = [this.fuselage, this.tail, this.skid, this.rotor, this.tailRotor];

    const lim = (lo, hi, torque = 0) => ({
      enableLimit: true, lowerAngle: lo, upperAngle: hi,
      enableMotor: torque > 0, maxMotorTorque: torque, motorSpeed: 0,
    });
    this.j = {
      tail: w.createJoint(new RevoluteJoint(lim(-0.1, 0.1), this.fuselage, this.tail, Vec2(at.x - 0.8, at.y))),
      skid: w.createJoint(new RevoluteJoint(lim(-0.08, 0.08), this.fuselage, this.skid, Vec2(at.x, at.y - 0.3))),
      rotor: w.createJoint(new RevoluteJoint(
        { enableMotor: true, maxMotorTorque: 90, motorSpeed: this.rotorSpd },
        this.fuselage, this.rotor, Vec2(at.x + 0.05, at.y + 0.42))),
      tailRotor: w.createJoint(new RevoluteJoint(
        { enableMotor: true, maxMotorTorque: 6, motorSpeed: 42 },
        this.tail, this.tailRotor, Vec2(at.x - 2.05, at.y + 0.18))),
    };
    this.fuselage.setAngularVelocity(0);
  }

  get x() { return this.fuselage.getPosition().x; }
  get y() { return this.fuselage.getPosition().y; }

  // 局部 → 世界(机炮口/火箭巢/投放口用);x 先乘 face,机头翻向时喷口跟着翻
  localToWorld(lx, ly) {
    const p = this.fuselage.getPosition(), a = this.fuselage.getAngle();
    const cs = Math.cos(a), sn = Math.sin(a);
    const mx = lx * this.face;
    return [p.x + cs * mx - sn * ly, p.y + sn * mx + cs * ly];
  }

  // 弹丸契约:机身/尾梁判 'body'(金属无部位倍率、无护甲);旋翼不判定(子弹从桨缝穿过)。
  // 判定在"机头朝右"的 sprite 局部空间做(x 乘 face 镜像)—— 尾梁画在哪边,判定就落在哪边
  zoneAt(px, py) {
    // 坠落中(!alive)/已坠毁:不可再被命中(它没有 corpseHit,弹丸尸体分支会 TypeError)
    if (this.destroyed || !this.alive) return null;
    const p = this.fuselage.getPosition(), a = this.fuselage.getAngle();
    const c0 = Math.cos(a), s0 = Math.sin(a);
    const wx = px - p.x, wy = py - p.y;
    const lx = (c0 * wx + s0 * wy) * this.face;
    const ly = -s0 * wx + c0 * wy;
    if (Math.abs(lx) <= 0.95 && Math.abs(ly) <= 0.4) return 'body';
    if (lx <= -0.7 && lx >= -2.25 && Math.abs(ly - 0.02) <= 0.17) return 'body'; // 尾梁 + 垂尾根
    return null;
  }

  hit(zone, dmg, dir, armorMul = 1) {
    if (!this.alive) return null;
    this.flashT = 0.12;
    const kb = Math.min(2.4, 0.5 + dmg * 0.06);
    this.pushX += dir.x * kb;
    this.pushY += dir.y * kb * 0.6 + kb * 0.1;
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp <= 0) this.shotDown(dir);
    return { broke: null, absorbed: false };
  }

  hurt(dmg) { this.hit('body', dmg, { x: 0, y: 0.3 }); }
  knockback() {} // 近战冲撞:空中重甲不退
  alertTo() {}

  // 被击落:全体部件恢复重力、旋翼电机衰减,翻滚坠地(落地爆炸在 update 坠落分支)
  shotDown(dir) {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'falling';
    for (const b of this.allBodies) b.setGravityScale(1);
    const v = this.fuselage.getLinearVelocity();
    this.fuselage.setLinearVelocity(Vec2(v.x + dir.x * 2.5, v.y - 0.5));
    this.fuselage.setAngularVelocity(dir.x >= 0 ? -2.4 : 2.4);
    this.pushX = this.pushY = 0;
    beep(95, 38, 0.7, 'sawtooth', 0.09); // 击落长鸣
    // 母体机阵亡,麾下无人机狂暴化:跳过接近直接俯冲
    for (const d of this.enemies) {
      if (d.owner === this && d.alive) d.enraged = true;
    }
    this.events.push({ type: 'killed', x: this.x, y: this.y, coins: 16 + Math.floor(Math.random() * 9), big: true });
  }

  destroy() {
    for (const b of this.allBodies) this.world.destroyBody(b);
  }

  fireAt(pp, pv) {
    const [mx, my] = this.localToWorld(0.95, -0.08);
    let tx = pp.x + pv.x * 0.18 - mx, ty = pp.y + pv.y * 0.18 - my;
    const a = Math.atan2(ty, tx) + (Math.random() - 0.5) * 0.11;
    this.events.push({
      type: 'shot', x: mx, y: my, stats: GUNSHIP_GUN, weaponName: '直升机机炮', soundSource: 'helicopter',
      parts: [{ dx: Math.cos(a), dy: Math.sin(a), damage: GUNSHIP_GUN.damage }],
    });
  }

  fireRocket(pp, pv) {
    const [mx, my] = this.localToWorld(0.28, -0.4);
    let tx = pp.x + pv.x * 0.3 - mx, ty = pp.y + pv.y * 0.3 - my;
    const a = Math.atan2(ty, tx) + (Math.random() - 0.5) * 0.05;
    this.events.push({
      type: 'shot', x: mx, y: my, stats: GUNSHIP_ROCKET, weaponName: '火箭弹', soundSource: 'rocket',
      parts: [{ dx: Math.cos(a), dy: Math.sin(a), damage: GUNSHIP_ROCKET.damage }],
    });
    burst(mx, my, 6, '#cfd2d8', 3);
  }

  update(dt, player, playerAlive) {
    if (this.destroyed) return;
    this.flashT = Math.max(0, this.flashT - dt);
    const f = this.fuselage, fp = f.getPosition();

    // ---- 坠落:旋翼减速、拖黑烟,触地爆 ----
    if (!this.alive) {
      this.rotorSpd = Math.max(3, this.rotorSpd * (1 - 1.6 * dt));
      this.j.rotor.setMotorSpeed(this.rotorSpd);
      this.j.tailRotor.setMotorSpeed(Math.max(5, 42 * (1 - 1.6 * dt)));
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.045;
        const [ex, ey] = this.localToWorld(-0.3, 0.35);
        particles.push({ x: ex, y: ey, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random(), life: 0.8, size: 4.5, color: '#2c2c2c', grav: -0.8 });
        if (Math.random() < 0.5) particles.push({ x: ex, y: ey, vx: (Math.random() - 0.5) * 2, vy: 1.5, life: 0.3, size: 3, color: '#ff8030', grav: 0 });
      }
      const gy = groundYAt(fp.x, fp.y);
      // 近静止兜底:起落橇(+0.14 支柱)先着地会把机身撑在 gy+0.91m,
      // "机身离地 0.45m"条件永远不满足 —— 残骸停在橇上,旋翼电机一直转、
      // 机身被反扭矩顶着永抖(P1 实测复现)。坠落中连续 0.5s 速度≈0 视为坠地,照爆
      const fv = f.getLinearVelocity();
      this.crashStillT = Math.hypot(fv.x, fv.y) < 0.6 ? this.crashStillT + dt : 0;
      if (fp.y - 0.45 <= gy || this.crashStillT > 0.5) {
        // 坠地爆炸:大 blast(范围伤害)+ 烧痕 + 残骸飞溅,然后销毁刚体(防泄漏)
        // 爆心贴机身(橇停时机身悬在 gy+0.91,不能还按 gy+0.4 埋进地里炸)
        const by = Math.max(gy + 0.45, Math.min(fp.y, gy + 0.8));
        this.events.push({ type: 'blast', x: fp.x, y: by, dmg: 13, r: 3.6, big: true });
        for (let i = 0; i < 10; i++) {
          debris.push({
            type: 'shard', color: i % 3 ? '#3c4430' : '#5a6446',
            w: 3 + Math.random() * 5, h: 2 + Math.random() * 4,
            x: fp.x, y: by - 0.1, vx: (Math.random() - 0.5) * 10, vy: 3 + Math.random() * 6,
            va: (Math.random() - 0.5) * 18, angle: Math.random() * 3, life: 1.4, max: 1.4,
          });
        }
        this.destroy();
        this.destroyed = true;
      }
      return;
    }

    this.t += dt;
    this.pushX *= 1 - Math.min(1, 6 * dt);
    this.pushY *= 1 - Math.min(1, 6 * dt);

    // 旋翼与发动机持续声由 game.js 的 updateAircraftLoop 统一处理，避免与合成哔声叠加。

    // 受损冒烟:半血以下灰烟,两成血以下黑烟带火
    const hpr = this.hp / this.maxHp;
    if (hpr < 0.5) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = hpr < 0.2 ? 0.06 : 0.12;
        const [ex, ey] = this.localToWorld(-0.3, 0.35);
        particles.push({ x: ex, y: ey, vx: (Math.random() - 0.5) * 1.2, vy: 1.2 + Math.random(), life: 0.7, size: hpr < 0.2 ? 4 : 3, color: hpr < 0.2 ? '#3a3a3a' : '#777777', grav: -0.6 });
      }
    }

    // 机头永远面向玩家(0.4m 死区:玩家在头顶正上/正下时不动向上次朝向,防抖)
    if (player) {
      const ppx = player.torso.getPosition().x;
      if (ppx > fp.x + 0.4) this.face = 1;
      else if (ppx < fp.x - 0.4) this.face = -1;
    }

    // ---- 悬停锚点:玩家侧向 6m / 头顶 4m,随地面高度起伏 ----
    const bx = LEVEL.bounds;
    this.sideT -= dt;
    if (this.sideT <= 0) { this.sideT = 4 + Math.random() * 3; this.side *= -1; }
    let ax = 40, ay = 7;
    if (player) {
      const pp = player.torso.getPosition();
      ax = clamp(pp.x + this.side * 6.2, bx.left + 5, bx.right - 4);
      ay = clamp(Math.max(pp.y + 4.0, groundYAt(ax) + 3.4), 4.4, 10.5);
    }
    ax += Math.sin(this.t * 0.6) * 1.2;
    ay += Math.sin(this.t * 1.7) * 0.35;
    if (this.state === 'enter' && Math.hypot(ax - fp.x, ay - fp.y) < 1.4) this.state = 'combat';

    // 速度控制(P 控制器)+ 击退偏移;俯仰 = 朝速度方向点头,靠角速度 PD 平滑
    let tvx = (ax - fp.x) * 1.4 + this.pushX, tvy = (ay - fp.y) * 1.8 + this.pushY;
    const maxV = this.state === 'enter' ? 7 : 4.2;
    const spT = Math.hypot(tvx, tvy);
    if (spT > maxV) { tvx *= maxV / spT; tvy *= maxV / spT; }
    f.setLinearVelocity(Vec2(tvx, tvy));
    const v = f.getLinearVelocity();
    const tilt = clamp(-v.x * 0.05, -0.2, 0.2) + Math.sin(this.t * 1.3) * 0.02;
    f.setAngularVelocity(clamp((tilt - f.getAngle()) * 6, -1.4, 1.4));

    // ---- 武器:机炮点射 + 火箭齐射(要有视线,踉跄玩家照样打) ----
    if (this.state === 'combat' && player && playerAlive && !player.ragdoll) {
      const pp = player.torso.getPosition();
      const pv = player.torso.getLinearVelocity();
      const d = Math.hypot(pp.x - fp.x, pp.y - fp.y);
      const los = hasLOS(fp.x, fp.y - 0.3, pp.x, pp.y + 0.3);
      this.fireT -= dt;
      if (this.burstLeft > 0) {
        this.burstCd -= dt;
        if (this.burstCd <= 0) {
          this.burstCd = 0.085;
          this.burstLeft--;
          if (d < 17 && los) this.fireAt(pp, pv);
        }
      } else if (this.fireT <= 0 && d < 16 && los) {
        this.burstLeft = 7 + Math.floor(Math.random() * 4);
        this.fireT = 1.5 + Math.random() * 0.9;
      }
      this.rocketT -= dt;
      if (this.rocketT <= 0 && d < 20 && d > 3.5) {
        this.rocketT = 5.5 + Math.random() * 2;
        this.rocketSalvo = 2;
        this.rocketCd = 0;
      }
      if (this.rocketSalvo > 0) {
        this.rocketCd -= dt;
        if (this.rocketCd <= 0) { this.rocketCd = 0.35; this.rocketSalvo--; this.fireRocket(pp, pv); }
      }
    }

    // ---- 释放无人机:肚子里每 6.5s 放 2 架,场上自有存量上限 3 ----
    this.droneT -= dt;
    if (this.droneT <= 0 && playerAlive) {
      this.droneT = 6.5;
      const owned = this.enemies.filter((e) => e.owner === this && e.alive).length;
      for (let i = owned; i < Math.min(3, owned + 2); i++) {
        const [mx, my] = this.localToWorld(-0.2, -0.55);
        this.enemies.push(new Drone(mx, my - 0.3, this));
        beep(340, 720, 0.16, 'sine', 0.045); // 投放音
        burst(mx, my, 4, '#9fb0c4', 2);
      }
    }
  }

  // ---- 绘制:整机画在"机身局部空间"里 —— 平移到机身 → 转世界角 → scale(face,1) 镜像 →
  // 以米为单位作画。各部件读物理局部位姿画回原位,机头翻向由一次镜像统一完成:
  // 尾梁/橇/旋翼/机炮/座舱全部跟着翻,机头永远指向玩家。----
  draw(c, w2s, ppm, time) {
    if (this.destroyed) return;
    const fp = this.fuselage.getPosition(), fa = this.fuselage.getAngle();
    const [fx, fy] = w2s(fp.x, fp.y);
    // 部件物理位姿 → 机身局部空间(位置逆旋转、角度取相对角)
    const localOf = (b) => {
      const p = b.getPosition(), a = b.getAngle();
      const rx = p.x - fp.x, ry = p.y - fp.y;
      const c0 = Math.cos(fa), s0 = Math.sin(fa);
      return { x: c0 * rx + s0 * ry, y: -s0 * rx + c0 * ry, a: a - fa };
    };

    c.save();
    if (this.flashT > 0.01) {
      c.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);
      c.filter = `brightness(${(1 + 2.2 * Math.min(1, this.flashT / 0.12)).toFixed(2)})`;
    }
    c.translate(fx, fy);
    c.scale(1, -1);           // 世界 y 向上 → canvas y 向下(旧版逐点 w2s 的翻转,现集中一次)
    c.rotate(fa);             // 已翻 y,直接用世界角
    c.scale(this.face, 1);    // 朝向镜像:局部 +x 永远是机头
    c.scale(ppm, ppm);        // 此后全部用米作单位(线宽同),且是"世界上方向上"的局部系

    // 旋翼轴 + 主旋翼桨盘(机身系:侧视 = 特别扁的椭圆,不随桨叶自转)
    {
      const R = localOf(this.rotor);
      c.strokeStyle = '#2c3222'; c.lineWidth = 0.07; c.lineCap = 'round';
      c.beginPath(); c.moveTo(R.x, R.y - 0.16); c.lineTo(R.x, R.y - 0.02); c.stroke();
      c.fillStyle = 'rgba(28, 32, 24, 0.10)';
      c.strokeStyle = 'rgba(28, 32, 24, 0.18)'; c.lineWidth = 0.03;
      c.beginPath(); c.ellipse(R.x, R.y, 1.25, 0.26, 0, 0, Math.PI * 2);
      c.fill(); c.stroke();
    }

    // 尾梁(独立刚体,带限位会甩)+ 垂尾
    {
      const T = localOf(this.tail);
      c.save();
      c.translate(T.x, T.y);
      c.rotate(T.a);
      c.strokeStyle = '#3c4430'; c.lineWidth = 0.13; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0.7, 0); c.lineTo(-0.7, 0); c.stroke();
      c.fillStyle = '#4a5238';
      c.beginPath(); c.moveTo(-0.5, 0.02); c.lineTo(-0.72, 0.42); c.lineTo(-0.72, -0.04); c.closePath(); c.fill();
      c.restore();
    }

    // 尾旋翼(竖直平面旋翼,侧视近整圆;挂在尾梁末端刚体上,画回机身系)
    {
      const TR = localOf(this.tailRotor);
      c.save();
      c.translate(TR.x, TR.y);
      c.rotate(TR.a);
      c.fillStyle = 'rgba(28, 32, 24, 0.15)';
      c.beginPath(); c.arc(0, 0, 0.23, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#23271c'; c.lineWidth = 0.045; c.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const aa = (i * Math.PI);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(aa) * 0.25, Math.sin(aa) * 0.25); c.stroke();
      }
      c.restore();
    }

    // 起落橇(独立刚体)
    {
      const K = localOf(this.skid);
      c.save();
      c.translate(K.x, K.y);
      c.rotate(K.a);
      c.strokeStyle = '#2e3326'; c.lineWidth = 0.06; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-0.62, -0.02); c.lineTo(0.62, -0.02); c.stroke();
      for (const lx of [-0.42, 0.42]) {
        c.beginPath(); c.moveTo(lx, 0.09); c.lineTo(lx - 0.08, -0.02); c.stroke();
      }
      c.restore();
    }

    // 机身(多边形圆润轮廓)+ 机腹阴影 + 武器短翼 + 座舱玻璃 + 舱门线 + 机鼻机炮
    {
      const pts = [
        [0.88, 0.02], [0.78, 0.22], [0.3, 0.31], [-0.5, 0.3], [-0.85, 0.18],
        [-0.85, -0.14], [-0.4, -0.3], [0.35, -0.3], [0.8, -0.18],
      ];
      c.fillStyle = '#4d5638';
      c.beginPath();
      pts.forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
      c.closePath(); c.fill();
      // 机腹阴影
      c.fillStyle = 'rgba(35, 40, 26, 0.55)';
      c.beginPath();
      [[-0.82, -0.1], [-0.4, -0.28], [0.35, -0.28], [0.78, -0.15]]
        .forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
      c.closePath(); c.fill();
      // 武器短翼
      c.fillStyle = '#414a30';
      c.beginPath();
      [[0.08, -0.06], [0.46, -0.06], [0.44, -0.2], [0.08, -0.16]]
        .forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
      c.closePath(); c.fill();
      // 座舱玻璃(斜切梯队风挡 + 高光)
      const cp = [[0.42, 0.29], [0.72, 0.24], [0.86, 0.05], [0.86, -0.04], [0.42, 0.05]];
      c.fillStyle = '#a9c8e2';
      c.beginPath();
      cp.forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
      c.closePath(); c.fill();
      c.strokeStyle = '#2c3222'; c.lineWidth = 0.024;
      c.beginPath();
      cp.forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
      c.closePath(); c.stroke();
      c.strokeStyle = 'rgba(240, 248, 255, 0.65)'; c.lineWidth = 0.032;
      c.beginPath(); c.moveTo(0.52, 0.24); c.lineTo(0.62, 0.02); c.stroke();
      // 舱门描线
      c.strokeStyle = '#333b25'; c.lineWidth = 0.024;
      c.beginPath(); c.moveTo(-0.1, 0.28); c.lineTo(-0.1, -0.26); c.stroke();
      // 机鼻机炮
      c.strokeStyle = '#262b1e'; c.lineWidth = 0.09; c.lineCap = 'butt';
      c.beginPath(); c.moveTo(0.72, -0.08); c.lineTo(1.12, -0.08); c.stroke();
    }

    // 主旋翼桨叶(机身系:方位角随电机旋转,但桨尖永远压进扁椭圆 = 侧视透视;
    // 不能画进"随桨轴自转的坐标系",否则扁椭圆会跟着桨叶一起转歪)
    {
      const R = localOf(this.rotor);
      c.strokeStyle = '#20241a'; c.lineWidth = 0.085; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const th = R.a + (i * Math.PI * 2) / 3;
        c.beginPath(); c.moveTo(R.x, R.y);
        c.lineTo(R.x + Math.cos(th) * 1.18, R.y + Math.sin(th) * 0.26);
        c.stroke();
      }
      c.fillStyle = '#2c3222';
      c.beginPath(); c.arc(R.x, R.y, 0.09, 0, Math.PI * 2); c.fill();
    }

    c.filter = 'none';
    c.restore();
  }
}

// ---- 运输直升机:纯脚本实体(无物理刚体)----
// 波次投兵的"自然刷新":从右缘飞入 → 悬停在投放点 → 放绳,士兵一个个从绳上滑降到地面
// → 卸完货掉头飞走。不可被攻击(纯运载工具,高空中),绳索画到每个仍在滑降的士兵手上。
export class TransportHeli {
  // opts: { enemies, count, roles(本波兵种队列), spec(品质/护甲), excludeGun, dropX }
  constructor(world, opts = {}) {
    this.world = world;
    this.audioType = 'transport';
    this.enemies = opts.enemies || [];
    this.spec = opts.spec || {};
    this.excludeGun = opts.excludeGun || null;
    this.payload = opts.count || 4;
    this.roles = Array.isArray(opts.roles) ? opts.roles.slice() : [];
    this.deployed = 0;
    this.dropX = opts.dropX ?? (LEVEL.bounds.right - 6 - Math.random() * 3);
    this.alt = 7.6;
    this.x = LEVEL.bounds.right + 7;
    this.y = this.alt;
    this.state = 'in';       // in → drop → out
    this.t = 0;
    this.dropT = 0;
    this.face = -1;
    this.rotorA = 0;
    this.airUnit = true; this.noBar = true;
    this.alive = true; this.destroyed = false;
    this.radius = 0;         // 不可命中
    this.events = [];
  }

  get gx() { return this.x; }
  get gy() { return this.y; }

  zoneAt() { return null; } // 运输机在高空,不可被攻击
  hit() { return null; }
  hurt() {}
  knockback() {}
  alertTo() {}

  update(dt, player, playerAlive) {
    this.t += dt;
    this.rotorA -= 30 * dt;
    if (this.state === 'in') {
      this.x -= 15 * dt;
      if (this.x <= this.dropX) { this.x = this.dropX; this.state = 'drop'; this.dropT = 0.7; }
    } else if (this.state === 'drop') {
      this.y = this.alt + Math.sin(this.t * 1.6) * 0.18; // 悬停微浮沉
      this.dropT -= dt;
      if (this.dropT <= 0 && this.deployed < this.payload) {
        const role = this.roles[this.deployed] || 'rifleman';
        this.deployed++;
        this.dropT = 0.5;
        // 放一个士兵:从机腹挂绳滑降；本波角色队列随运输机逐个落地。
        const d = new Dummy(this.world, {
          x: this.x + (Math.random() - 0.5) * 0.9,
          y: this.y - 0.6,
        }, {
          behavior: 'patrol', min: -66, max: 3,
          quality: this.spec.quality, armorMul: this.spec.armorMul,
          role,
          respawn: false, excludeGun: this.excludeGun, roped: true,
        });
        this.enemies.push(d);
      }
      // 货卸完且绳上没有活人(死尸已脱绳坠地,不算占绳)→ 收绳离场
      const sliding = this.enemies.some((e) => e.roped && !e.destroyed);
      if (this.deployed >= this.payload && !sliding && this.dropT <= -0.6) {
        this.state = 'out';
        this.face = 1;
      }
    } else {
      this.x += 16 * dt;
      this.y += 1.2 * dt;
      if (this.x > LEVEL.bounds.right + 9) { this.alive = false; this.destroyed = true; }
    }
  }

  draw(c, w2s, ppm, time) {
    if (this.destroyed) return;
    const u = ppm;
    // 绳索:连到每个仍在滑降的士兵(画在机身之下)
    for (const e of this.enemies) {
      if (!e.roped || e.destroyed) continue;
      const hp = e.p.torso.getPosition();
      const [rx, ry] = w2s(this.x, this.y - 0.55);
      const [hx, hy] = w2s(hp.x, hp.y + 0.5);
      c.strokeStyle = 'rgba(210, 220, 235, 0.75)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(rx, ry);
      c.quadraticCurveTo((rx + hx) / 2 + 3, (ry + hy) / 2, hx, hy); c.stroke();
    }
    const [bx, by] = w2s(this.x, this.y);
    c.save();
    c.translate(bx, by);
    c.scale(1, -1);        // 世界 y 向上 → canvas y 向下(Gunship 同款教训,漏了就是上下颠倒)
    c.scale(this.face, 1);
    c.scale(u, u);
    // 主旋翼桨盘(扁椭圆)+ 桨叶
    c.fillStyle = 'rgba(28, 32, 24, 0.10)';
    c.beginPath(); c.ellipse(0.05, 0.42, 1.35, 0.28, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#20241a'; c.lineWidth = 0.085; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const th = this.rotorA + (i * Math.PI * 2) / 3;
      c.beginPath(); c.moveTo(0.05, 0.42);
      c.lineTo(0.05 + Math.cos(th) * 1.28, 0.42 + Math.sin(th) * 0.28); c.stroke();
    }
    // 机身(运输机:方正机舱 + 大开侧门)+ 尾梁 + 垂尾 + 尾旋翼
    const pts = [
      [1.0, 0.05], [0.92, 0.3], [0.25, 0.38], [-0.6, 0.36], [-0.98, 0.22],
      [-0.98, -0.18], [-0.5, -0.36], [0.3, -0.36], [0.9, -0.22],
    ];
    c.fillStyle = '#3f4a35';
    c.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(30, 36, 24, 0.5)';
    c.beginPath();
    [[-0.95, -0.12], [-0.5, -0.34], [0.3, -0.34], [0.85, -0.2]]
      .forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
    c.closePath(); c.fill();
    // 座舱玻璃
    const cp = [[0.5, 0.35], [0.82, 0.3], [0.95, 0.1], [0.95, 0.0], [0.5, 0.12]];
    c.fillStyle = '#a9c8e2';
    c.beginPath();
    cp.forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
    c.closePath(); c.fill();
    // 开着的侧门(暗舱口,士兵从这里出来)
    c.fillStyle = 'rgba(12, 15, 10, 0.85)';
    c.beginPath();
    c.roundRect(-0.42, -0.26, 0.72, 0.56, 0.05); c.fill();
    // 尾梁 + 垂尾
    c.strokeStyle = '#3c4430'; c.lineWidth = 0.13; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-0.95, 0.05); c.lineTo(-1.75, 0.05); c.stroke();
    c.fillStyle = '#4a5238';
    c.beginPath(); c.moveTo(-1.5, 0.07); c.lineTo(-1.72, 0.5); c.lineTo(-1.72, 0.02); c.closePath(); c.fill();
    // 尾旋翼
    c.fillStyle = 'rgba(28, 32, 24, 0.15)';
    c.beginPath(); c.arc(-1.78, 0.2, 0.22, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#23271c'; c.lineWidth = 0.045;
    for (let i = 0; i < 2; i++) {
      const aa = this.rotorA * 1.6 + i * Math.PI;
      c.beginPath(); c.moveTo(-1.78, 0.2); c.lineTo(-1.78 + Math.cos(aa) * 0.24, 0.2 + Math.sin(aa) * 0.24); c.stroke();
    }
    // 起落橇
    c.strokeStyle = '#2e3326'; c.lineWidth = 0.06;
    c.beginPath(); c.moveTo(-0.6, -0.45); c.lineTo(0.6, -0.45); c.stroke();
    c.beginPath(); c.moveTo(-0.42, -0.36); c.lineTo(-0.5, -0.45); c.stroke();
    c.beginPath(); c.moveTo(0.42, -0.36); c.lineTo(0.5, -0.45); c.stroke();
    c.restore();
  }
}

// ---- 自杀式无人机:纯算法实体(无刚体)----
// 接近(悬停在玩家上前方)→ 距离内俯冲(直线,啸声)→ 撞玩家自爆 / 撞地碎裂 / 冲过头爬升再来
// 一发即碎:任意伤害命中 shatter(),碎片 + 火花,不走血肉管线
export class Drone {
  constructor(x, y, owner) {
    this.owner = owner || null;
    this.audioType = 'drone';
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 2; this.vy = 1.2;
    this.hp = 1; this.maxHp = 1;
    this.alive = true; this.destroyed = false;
    this.airUnit = true; this.noBar = true; // 一滴血,不画血条
    this.radius = 0.36;
    this.state = 'approach'; // approach | dive | climb
    this.t = Math.random() * 6;
    this.settle = 1.0;       // 进入接近态后缓 1s 再允许俯冲(否则到悬停点瞬间就扎下来)
    this.enraged = false;    // 母体机被击落:跳过接近直接扑
    this.trailT = 0;
    this.flashT = 0;
    this.events = [];
  }

  zoneAt(px, py) {
    if (!this.alive) return null;
    return Math.hypot(px - this.x, py - this.y) <= 0.36 ? 'body' : null;
  }

  hit(zone, dmg, dir) {
    if (this.alive) this.shatter(dir || { x: 0, y: 1 });
    return { broke: null, absorbed: false };
  }
  hurt() { if (this.alive) this.shatter({ x: 0, y: 1 }); }
  knockback() {}
  alertTo() {}

  shatter(dir) {
    this.alive = false;
    this.destroyed = true;
    for (let i = 0; i < 7; i++) {
      debris.push({
        type: 'shard', color: i % 2 ? '#3a4048' : '#6a727c',
        w: 2 + Math.random() * 3, h: 2 + Math.random() * 3,
        x: this.x, y: this.y,
        vx: dir.x * 3 + (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4,
        va: (Math.random() - 0.5) * 20, angle: Math.random() * 3, life: 0.9, max: 0.9,
      });
    }
    burst(this.x, this.y, 8, '#ffd77a', 4);
    if (!this.exploding) this.events.push({ type: 'droneShatter', x: this.x, y: this.y });
    this.events.push({ type: 'killed', x: this.x, y: this.y, coins: 1, big: false });
  }

  update(dt, player, playerAlive) {
    if (!this.alive) return;
    this.t += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const bx = LEVEL.bounds;
    this.x = clamp(this.x, bx.left + 0.5, bx.right - 0.5);
    if (this.y > 11.5) { this.y = 11.5; this.vy = Math.min(0, this.vy); }

    const pp = player ? player.torso.getPosition() : { x: 40, y: 1 };
    const pv = player ? player.torso.getLinearVelocity() : { x: 0, y: 0 };
    const dx = pp.x - this.x, dy = pp.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const steer = (tx, ty, acc, maxV) => {
      this.vx += clamp(tx - this.x, -acc, acc) * dt * 4;
      this.vy += clamp(ty - this.y, -acc, acc) * dt * 4;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > maxV) { this.vx *= maxV / sp; this.vy *= maxV / sp; }
    };

    if (this.state === 'approach') {
      this.settle -= dt;
      const side = this.x >= pp.x ? 1 : -1;
      steer(pp.x + side * 1.7, pp.y + 3.1 + Math.sin(this.t * 2.1) * 0.4, 3.2, 5.2);
      if (playerAlive && this.settle <= 0 && (this.enraged ? dist < 10 : dist < 4.4)) {
        this.state = 'dive';
        const a = Math.atan2(dy + pv.y * 0.2, dx + pv.x * 0.2);
        const ds = this.enraged ? 12.5 : 11;
        this.vx = Math.cos(a) * ds;
        this.vy = Math.sin(a) * ds;
        if (!playSample('drone-dive', { x: this.x, y: this.y, listenerX: pp.x, listenerY: pp.y, volume: 0.54, maxDistance: 26, distantTail: false })) {
          beep(680, 1300, 0.25, 'sawtooth', 0.032); // 资源未加载时的兜底啸声
        }
      }
    } else if (this.state === 'dive') {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.035;
        particles.push({ x: this.x, y: this.y, vx: -this.vx * 0.12, vy: -this.vy * 0.12, life: 0.26, size: 2.4, color: '#ff6a50', grav: 0 });
      }
      if (playerAlive && dist < 0.55) {
        // 自爆:blast 事件由 game.js 结算伤害(吃防御),碎片照常
        this.events.push({ type: 'blast', x: this.x, y: this.y, dmg: 7, r: 1.35, big: false });
        this.exploding = true;
        this.shatter({ x: dx / dist, y: dy / dist });
        return;
      }
      if (this.y <= groundYAt(this.x, this.y) + 0.14) {
        burst(this.x, groundYAt(this.x, this.y) + 0.1, 6, '#8a7c66', 3);
        this.shatter({ x: 0, y: -1 });
        return;
      }
      // 冲过头(没撞到):爬升绕回来
      if (dist > 6.5 && (dx * this.vx + dy * this.vy) < 0) this.state = 'climb';
    } else { // climb
      const side = this.x >= pp.x ? 1 : -1;
      steer(pp.x + side * 2.2, pp.y + 3.4, 2.6, 4.2);
      if (Math.abs(this.x - (pp.x + side * 2.2)) < 1 && Math.abs(this.y - (pp.y + 3.4)) < 0.8) {
        this.state = 'approach';
        this.settle = 0.7;
      }
    }
  }

  draw(c, w2s, ppm, time) {
    if (!this.alive) return;
    const u = ppm;
    const [x, y] = w2s(this.x, this.y);
    const tilt = clamp(this.vx * 0.08, -0.55, 0.55);
    c.save();
    c.translate(x, y);
    c.scale(this.vx >= 0 ? 1 : -1, 1); // 独眼/机身朝飞行方向
    c.rotate(-tilt);
    // 四臂 X + 机身
    c.strokeStyle = '#3a4048'; c.lineWidth = 0.05 * u; c.lineCap = 'round';
    for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      c.beginPath(); c.moveTo(0, 0); c.lineTo(ax * 0.19 * u, ay * 0.13 * u); c.stroke();
    }
    c.fillStyle = '#454c56';
    c.beginPath(); c.ellipse(0, 0, 0.17 * u, 0.115 * u, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2e343c';
    c.beginPath(); c.ellipse(-0.02 * u, 0.03 * u, 0.13 * u, 0.07 * u, 0, 0, Math.PI * 2); c.fill();
    // 四旋翼(高速旋转 → 模糊椭圆盘)
    c.fillStyle = 'rgba(160, 175, 195, 0.32)';
    for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      c.beginPath(); c.ellipse(ax * 0.19 * u, ay * 0.13 * u - 0.02 * u, 0.125 * u, 0.032 * u, 0, 0, Math.PI * 2); c.fill();
    }
    // 独眼(朝向用 tilt 表意):俯冲时更亮更大
    const eyeR = (this.state === 'dive' ? 0.055 : 0.038) * u;
    const glow = c.createRadialGradient(0.1 * u, 0, 0, 0.1 * u, 0, eyeR * 3.2);
    glow.addColorStop(0, this.state === 'dive' ? 'rgba(255, 70, 55, 0.9)' : 'rgba(255, 70, 55, 0.5)');
    glow.addColorStop(1, 'rgba(255, 70, 55, 0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(0.1 * u, 0, eyeR * 3.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = this.state === 'dive' ? '#ff5040' : '#b83528';
    c.beginPath(); c.arc(0.1 * u, 0, eyeR, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}
