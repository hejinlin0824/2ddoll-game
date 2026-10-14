// 主动式布娃娃主角(Active Ragdoll):
// 躯干是主碰撞体,直接做速度控制(平台跳跃手感);
// 四肢通过带限位的旋转关节挂在躯干上,每帧用关节电机做 PD 伺服
// 追踪"姿态目标角"—— 跑步循环/跳跃/下落/趴下都是一组目标角,
// 物理引擎负责所有中间过渡、惯性甩动和落地时的物理抖动。
// 按 R 关掉全部电机 = 纯布娃娃(瘫倒),E 复位。
import { Box, Circle, Vec2, RevoluteJoint } from 'planck';
import { CAT, groundYAt } from './level.js';
import { loadSavedGun, loadEquip } from './gunPresets.js';

const D = {
  torso: { w: 0.30, h: 0.52 },
  headR: 0.15,
  upperArm: { w: 0.09, h: 0.26 },
  foreArm: { w: 0.08, h: 0.24 },
  thigh: { w: 0.115, h: 0.28 },
  calf: { w: 0.095, h: 0.26 },
  gunLen: 0.36,
};

// 骨架锚点(躯干局部坐标,朝右为 +x)
const A = {
  shoulder: { x: 0, y: 0.20 },
  neck: { x: 0, y: 0.30 },
  hip: { x: 0, y: -0.24 },
};

const COLOR = {
  skin: '#e2b088', skinDark: '#b8885f',
  pants: '#3a66b0', pantsDark: '#2a4a80',
  boot: '#2b2b33', bootDark: '#1f1f26',
  bandana: '#d8302c', bandanaDark: '#a32220',
  gun: '#3c4048', wood: '#7a4a26',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (x) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.spawn = { x: spawn.x, y: spawn.y };
    this.events = [];
    this.build();
  }

  build() {
    const w = this.world;
    const s = this.spawn;
    this.spawn.y0 = s.y + 0.9; // 躯干中心出生高度(脚底离地一点,落地即站稳)
    const c = (ox, oy) => Vec2(s.x + ox, this.spawn.y0 + oy);

    const limb = (pos, d, density, angularDamping = 0.08) => {
      const b = w.createBody({ type: 'dynamic', position: pos, angularDamping });
      b.createFixture(new Box(d.w / 2, d.h / 2), {
        density,
        friction: 0.6,
        filterCategoryBits: CAT.LIMB,
        filterMaskBits: 0, // 受控时四肢不与世界碰撞,避免卡脚;纯布娃娃模式再打开
      });
      return b;
    };

    // 躯干:主碰撞体 = 覆盖全身的竖胶囊(方盒 + 上下圆),
    // 包络从脚底(-0.78)到头顶(+0.78)。
    // 这样角色永远"站在碰撞体上":不会双腿插进地里、
    // 圆顶圆底跳跃撞平台边角会顺滑滑开、趴下/跑动也不会被直角卡住。
    this.torso = w.createBody({ type: 'dynamic', position: c(0, 0), angularDamping: 0.1 });
    const torsoFixtureDef = {
      density: 5, friction: 0.02, restitution: 0,
      filterCategoryBits: CAT.PLAYER, filterMaskBits: CAT.GROUND,
    };
    this.torso.createFixture(new Box(D.torso.w / 2, 0.62), torsoFixtureDef);
    this.torso.createFixture(new Circle(Vec2(0, 0.62), D.torso.w / 2), torsoFixtureDef);
    this.torso.createFixture(new Circle(Vec2(0, -0.62), D.torso.w / 2), torsoFixtureDef);

    // 头(圆)
    this.head = w.createBody({ type: 'dynamic', position: c(0, A.neck.y + 0.08 + D.headR), angularDamping: 0.08 });
    this.head.createFixture(new Circle(D.headR), {
      density: 5, friction: 0.4,
      filterCategoryBits: CAT.LIMB, filterMaskBits: 0,
    });

    // 四肢(F=近侧持枪手,B=远侧)
    this.armUF = limb(c(A.shoulder.x, A.shoulder.y - D.upperArm.h / 2), D.upperArm, 4);
    this.armLF = limb(c(A.shoulder.x, A.shoulder.y - D.upperArm.h - D.foreArm.h / 2), D.foreArm, 4);
    this.armUB = limb(c(A.shoulder.x, A.shoulder.y - D.upperArm.h / 2), D.upperArm, 4);
    this.armLB = limb(c(A.shoulder.x, A.shoulder.y - D.upperArm.h - D.foreArm.h / 2), D.foreArm, 4);
    this.legUF = limb(c(A.hip.x, A.hip.y - D.thigh.h / 2), D.thigh, 5);
    this.legLF = limb(c(A.hip.x, A.hip.y - D.thigh.h - D.calf.h / 2), D.calf, 5);
    this.legUB = limb(c(A.hip.x, A.hip.y - D.thigh.h / 2), D.thigh, 5);
    this.legLB = limb(c(A.hip.x, A.hip.y - D.thigh.h - D.calf.h / 2), D.calf, 5);

    const elbowF = { x: A.shoulder.x, y: A.shoulder.y - D.upperArm.h };
    const kneeF = { x: A.hip.x, y: A.hip.y - D.thigh.h };
    const V = (p) => Vec2(s.x + p.x, this.spawn.y0 + p.y);
    const J = (o) => ({ enableLimit: true, enableMotor: true, ...o });

    this.j = {
      neck: w.createJoint(new RevoluteJoint(
        J({ lowerAngle: -0.28, upperAngle: 0.28, maxMotorTorque: 5 }),
        this.torso, this.head, V(A.neck))),
      shF: w.createJoint(new RevoluteJoint(
        J({ lowerAngle: -3.0, upperAngle: 3.0, maxMotorTorque: 11 }),
        this.torso, this.armUF, V(A.shoulder))),
      elF: w.createJoint(new RevoluteJoint(
        J({ lowerAngle: 0.02, upperAngle: 2.4, maxMotorTorque: 7 }),
        this.armUF, this.armLF, V(elbowF))),
      shB: w.createJoint(new RevoluteJoint(
        J({ lowerAngle: -3.0, upperAngle: 3.0, maxMotorTorque: 11 }),
        this.torso, this.armUB, V(A.shoulder))),
      elB: w.createJoint(new RevoluteJoint(
        J({ lowerAngle: 0.02, upperAngle: 2.4, maxMotorTorque: 7 }),
        this.armUB, this.armLB, V(elbowF))),
      hipF: w.createJoint(new RevoluteJoint(
        J({ lowerAngle: -1.7, upperAngle: 1.9, maxMotorTorque: 30 }),
        this.torso, this.legUF, V(A.hip))),
      kneeF: w.createJoint(new RevoluteJoint(
        J({ lowerAngle: -2.4, upperAngle: -0.02, maxMotorTorque: 22 }),
        this.legUF, this.legLF, V(kneeF))),
      hipB: w.createJoint(new RevoluteJoint(
        J({ lowerAngle: -1.7, upperAngle: 1.9, maxMotorTorque: 30 }),
        this.torso, this.legUB, V(A.hip))),
      kneeB: w.createJoint(new RevoluteJoint(
        J({ lowerAngle: -2.4, upperAngle: -0.02, maxMotorTorque: 22 }),
        this.legUB, this.legLB, V(kneeF))),
    };

    this.allBodies = [this.torso, this.head, this.armUF, this.armLF, this.armUB,
      this.armLB, this.legUF, this.legLF, this.legUB, this.legLB];
    this.limbBodies = this.allBodies.filter((b) => b !== this.torso);

    // 运行状态
    this.facing = 1;
    this.grounded = false;
    this.wasGrounded = false;
    this.prone = false;
    this.ragdoll = false;
    this.phase = 0;          // 跑步循环相位
    this.coyote = 0;         // 离地宽限
    this.jumpBuf = 0;        // 跳跃预输入
    this.fireCd = 0;
    this.recoilT = 0;
    this.fallVy = 0;
    this.t = 0;

    // 熟练度系统:开枪成长;后坐力热量越高散布越大,熟练度越高压制越好
    try { this.skill = clamp(parseFloat(localStorage.getItem('contra-skill')) || 0.15, 0.1, 1); } catch { this.skill = 0.15; }
    this.heat = 0;
    this.weapon = 'rifle'; // rifle=主武器(双手,用设计器里的枪) | pistol=副武器(单手手枪)
    this.gunDef = loadSavedGun(); // 设计器数据
    this.gunAngle = 0;            // 枪的世界指向角
    this._limbsMirrored = false;  // 面朝左时肘/膝限位要镜像
    this.loadout = { head: loadEquip('head'), torso: loadEquip('torso') }; // 穿戴
    this.pose = { torso: 0, neck: 0, shF: 0.15, elF: 0.55, shB: -0.2, elB: 0.5,
      hipF: 0.05, kneeF: -0.08, hipB: -0.05, kneeB: -0.12 };
  }

  destroy() {
    for (const b of this.allBodies) this.world.destroyBody(b);
  }

  reset() {
    this.destroy();
    this.build();
  }

  setRagdoll(on) {
    this.ragdoll = on;
    for (const j of Object.values(this.j)) j.enableMotor(!on);
    for (const b of this.limbBodies) {
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        // planck 的 setFilterData 是整体替换,三个字段必须一起传,
        // 否则 categoryBits 变 undefined、碰撞全部失效
        f.setFilterData({ categoryBits: CAT.LIMB, maskBits: on ? CAT.GROUND : 0, groupIndex: 0 });
        f.refilter();
      }
    }
    if (on) {
      // 挨了一枪的感觉:给一记冲量+角速度,让布娃娃真的瘫倒
      this.grounded = false;
      this.torso.applyLinearImpulse(
        Vec2(this.facing * 2.2 + (Math.random() - 0.5), 2.4),
        this.torso.getPosition());
      this.torso.setAngularVelocity(-this.facing * (3 + Math.random() * 3));
    } else {
      // 电机重新接上时压制角速度,避免从地上"弹射起身"
      this.torso.setAngularVelocity(clamp(this.torso.getAngularVelocity(), -2.5, 2.5));
    }
  }

  // 瞄准方向在左半边时,枪械贴图需要垂直镜像(否则弹匣会翻到上面)
  get gunMirrored() { return Math.cos(this.gunAngle) < 0; }

  reloadLoadout() {
    this.loadout = { head: loadEquip('head'), torso: loadEquip('torso') };
  }

  get defense() {
    return (this.loadout.head?.defense || 0) + (this.loadout.torso?.defense || 0);
  }

  // 枪械设计坐标(px,原点=后手握点/枪把,瞄准手就握在这)→ 世界坐标(米)
  gunPoint(gp) {
    const g = this.gunDef;
    const dy = (this.gunMirrored ? -1 : 1) * (gp.y - g.grips.rear.y) / g.meterScale;
    const dx = (gp.x - g.grips.rear.x) / g.meterScale;
    const cos = Math.cos(this.gunAngle), sin = Math.sin(this.gunAngle);
    const o = this.gunAnchor || { x: 0, y: 0 };
    return { x: o.x + dx * cos + dy * sin, y: o.y + dx * sin - dy * cos };
  }

  // 两段式 IK:肩关节/肘关节追踪目标点(mirror=面朝左,肘弯方向镜像)
  ikArm(shJ, elJ, S, T, kp, mirror = false) {
    const L1 = D.upperArm.h, L2 = D.foreArm.h;
    let d = clamp(Math.hypot(T.x - S.x, T.y - S.y), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.03);
    const beta = Math.atan2(T.y - S.y, T.x - S.x);
    const theta = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const d1 = beta + (mirror ? theta : -theta); // 两种朝向都取"肘在下"的一侧
    const ex = S.x + Math.cos(d1) * L1, ey = S.y + Math.sin(d1) * L1;
    const d2 = Math.atan2(T.y - ey, T.x - ex);
    this.servo(shJ, wrapPi(d1 + Math.PI / 2 - this.torso.getAngle()), kp, 24);
    const bend = wrapPi(d2 - d1);
    this.servo(elJ, mirror ? clamp(bend, -2.3, -0.02) : clamp(bend, 0.02, 2.3), kp - 2, 22);
  }

  setWeapon(w) {
    if (w === this.weapon) return;
    this.weapon = w;
    this.recoilT = 0;
  }

  // 面朝左时,肘/膝的弯曲方向镜像,关节限位要跟着翻,
  // 否则左向姿态的弯腿/弯臂全部被限位顶成"反关节"
  setLimbMirror(m) {
    if (this._limbsMirrored === m) return;
    this._limbsMirrored = m;
    this.j.elF.setLimits(...(m ? [-2.4, -0.02] : [0.02, 2.4]));
    this.j.elB.setLimits(...(m ? [-2.4, -0.02] : [0.02, 2.4]));
    this.j.kneeF.setLimits(...(m ? [-0.02, 2.4] : [-2.4, -0.02]));
    this.j.kneeB.setLimits(...(m ? [-0.02, 2.4] : [-2.4, -0.02]));
  }

  // 沿世界 -y 打一条射线检测地面(站立时躯干中心离地约 0.8m)
  checkGrounded() {
    const p = this.torso.getPosition();
    const len = 0.92;
    let hit = false;
    const self = this.selfSet || (this.selfSet = new Set(this.allBodies));
    this.world.rayCast(p, Vec2(p.x, p.y - len), (fixture) => {
      if (self.has(fixture.getBody())) return -1;
      hit = true;
      return 0;
    });
    return hit;
  }

  // 姿态目标:全部按"朝右"局部空间给出,施加时乘 facing
  poseTargets(input, speed) {
    const t = {
      torso: 0, neck: 0,
      hipF: 0.05, kneeF: -0.08, hipB: -0.05, kneeB: -0.12,
      shF: 0.15, elF: 0.55, shB: -0.2, elB: 0.5,
    };
    const ph = this.phase;

    if (this.prone) {
      t.torso = -1.32; t.neck = 0.7;
      const wig = Math.sin(this.t * 7) * 0.07 * (speed > 0.2 ? 1 : 0);
      t.hipF = -0.22 + wig; t.kneeF = -0.06;
      t.hipB = -0.38 - wig; t.kneeB = -0.06;
      t.shF = 2.85; t.elF = 0.05;
      t.shB = 2.3; t.elB = 0.4;
    } else if (!this.grounded) {
      if (this.fallVy > 0.5) { // 上升:收腿举臂
        t.hipF = 0.55; t.kneeF = -1.15;
        t.hipB = -0.35; t.kneeB = -0.45;
        t.shF = 1.2; t.elF = 0.15;
        t.shB = -0.9; t.elB = 0.7;
      } else {                 // 下落:张腿乱挥
        t.hipF = 0.15; t.kneeF = -0.35;
        t.hipB = -0.5; t.kneeB = -0.9;
        t.shF = 1.35; t.elF = 0.1;
        t.shB = -1.4; t.elB = 0.9;
      }
    } else if (speed > 0.5) {  // 跑步循环
      t.hipF = 0.85 * Math.sin(ph);
      t.hipB = 0.85 * Math.sin(ph + Math.PI);
      t.kneeF = -0.08 - 1.35 * (1 + Math.cos(ph)) / 2;
      t.kneeB = -0.08 - 1.35 * (1 + Math.cos(ph + Math.PI)) / 2;
      t.shB = -0.55 * Math.sin(ph) - 0.1;
      t.elB = 0.5;
      if (!input.fire) { t.shF = 0.45 * Math.sin(ph + Math.PI) - 0.1; t.elF = 0.6; }
      else { t.shF = 1.48; t.elF = 0.1; }
    } else if (input.fire) {   // 站立射击:举枪
      t.shF = 1.48; t.elF = 0.1;
    }

    // 空中开火同样举枪瞄准
    if (input.fire && !this.prone && this.grounded === false) { t.shF = 1.48; t.elF = 0.1; }
    return t;
  }

  servo(joint, target, kp, maxSpeed) {
    const err = target - joint.getJointAngle();
    joint.setMotorSpeed(clamp(err * kp, -maxSpeed, maxSpeed));
  }

  update(dt, input) {
    this.t += dt;
    this.events.length = 0;
    if (this.ragdoll) { this.updateCommon(dt); return; }

    const torso = this.torso;
    const v = torso.getLinearVelocity();

    // ---- 移动 ----
    this.wasGrounded = this.grounded;
    this.grounded = this.checkGrounded();
    this.coyote = this.grounded ? 0.1 : Math.max(0, this.coyote - dt);
    this.jumpBuf = input.jumpPressed ? 0.12 : Math.max(0, this.jumpBuf - dt);

    this.prone = input.down && this.grounded;
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) this.facing = dir;

    // 鼠标瞄准:枪臂直指光标,角色面向光标一侧
    this.aimAlpha = null;
    if (input.aim) {
      const S = this.torso.getWorldPoint(Vec2(0, A.shoulder.y));
      this.aimAlpha = Math.atan2(input.aim.y - S.y, input.aim.x - S.x);
      this.facing = input.aim.x >= S.x ? 1 : -1;
    }
    // 枪的当前指向角(瞄准时=光标方向,否则=前臂甩动方向)
    const gd0 = this.armLF.getWorldVector(Vec2(0, -1));
    this.gunAngle = this.aimAlpha != null ? this.aimAlpha : Math.atan2(gd0.y, gd0.x);
    // facing 已被鼠标瞄准覆盖,此处才是最终朝向 —— 限位跟随最终朝向
    this.setLimbMirror(this.facing === -1);

    // 枪锚点:双手都握在标记点上(把枪"往怀里拉",而不是伸直手臂去够)
    if (this.weapon === 'rifle' && this.aimAlpha != null) {
      const g = this.gunDef;
      const S = this.torso.getWorldPoint(Vec2(0, A.shoulder.y));
      const L1 = D.upperArm.h, L2 = D.foreArm.h;
      const reach = L1 + L2 - 0.03; // 副手最大可达距离
      const fr = Math.hypot(g.grips.front.x - g.grips.rear.x, g.grips.front.y - g.grips.rear.y) / g.meterScale;
      const hold = clamp(reach - fr, 0.28, reach - 0.05)
        - (this.recoilT > 0 ? 0.05 : 0); // 开火瞬间枪往怀里顶一下
      this.gunAnchor = {
        x: S.x + Math.cos(this.gunAngle) * hold,
        y: S.y + Math.sin(this.gunAngle) * hold,
      };
    } else {
      const hand = this.armLF.getWorldPoint(Vec2(0, -D.foreArm.h / 2));
      this.gunAnchor = { x: hand.x, y: hand.y };
    }

    const speed = this.prone ? 1.9 : 4.6;
    let targetVx = dir * speed;
    // 移动方向上有墙就不再硬塞速度,否则会和碰撞求解器打架,把角色弹飞
    if (dir !== 0) {
      const p = torso.getPosition();
      const self = this.selfSet || (this.selfSet = new Set(this.allBodies));
      let blocked = false;
      this.world.rayCast(p, Vec2(p.x + dir * 0.34, p.y), (fixture) => {
        if (self.has(fixture.getBody())) return -1;
        blocked = true;
        return 0;
      });
      if (blocked) targetVx = 0;
    }
    const k = this.grounded ? 0.4 : 0.14;
    // 速度限幅:即使被边角蹭到也不会被高速弹飞
    torso.setLinearVelocity(Vec2(
      clamp(lerp(v.x, targetVx, k), -9, 9),
      clamp(v.y, -22, 13)));
    const vy = torso.getLinearVelocity().y;

    // 落地检测(fallVy 归零前判断)
    const landed = this.grounded && !this.wasGrounded;
    if (landed && this.fallVy < -5) {
      const p = torso.getPosition();
      this.events.push({ type: 'land', x: p.x, y: p.y - 0.7, hard: this.fallVy < -12 });
    }
    if (this.grounded) this.fallVy = 0; else this.fallVy = Math.min(this.fallVy, vy);

    if (this.jumpBuf > 0 && this.coyote > 0 && !this.prone) {
      torso.setLinearVelocity(Vec2(torso.getLinearVelocity().x, 11));
      this.jumpBuf = 0; this.coyote = 0; this.grounded = false;
      this.events.push({ type: 'jump' });
    }

    // 跑步相位推进 + 脚步尘土
    const sp = Math.abs(torso.getLinearVelocity().x);
    if (this.grounded && !this.prone && sp > 0.5) {
      const prev = this.phase;
      this.phase += dt * (sp * 3.0 + 2.0);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) {
        const p = torso.getPosition();
        this.events.push({ type: 'step', x: p.x + this.facing * 0.1, y: p.y - 0.78 });
      }
    } else if (sp <= 0.5 && this.grounded) {
      this.phase = 0;
    }

    // ---- 开火 ----
    this.fireCd -= dt;
    this.recoilT = Math.max(0, this.recoilT - dt);
    this.heat = Math.max(0, this.heat - dt * (0.35 + 0.4 * this.skill));
    if (input.fire && this.fireCd <= 0) {
      const rifle = this.weapon === 'rifle';
      const gunDir = this.armLF.getWorldVector(Vec2(0, -1));
      const hand = this.armLF.getWorldPoint(Vec2(0, -D.foreArm.h / 2));
      const pistolLen = 0.22;
      const muzzle = rifle
        ? this.gunPoint(this.gunDef.muzzle)
        : { x: hand.x + gunDir.x * pistolLen, y: hand.y + gunDir.y * pistolLen };
      let ready;
      let dir;
      if (this.aimAlpha != null) {
        // 主武器:枪的方向就是光标方向(枪锚点随瞄准实时定位),随时可射
        ready = true;
        const dx = input.aim.x - muzzle.x, dy = input.aim.y - muzzle.y;
        const L = Math.hypot(dx, dy);
        dir = L > 0.25 ? { x: dx / L, y: dy / L } : { x: Math.cos(this.gunAngle), y: Math.sin(this.gunAngle) };
      } else {
        ready = gunDir.x * this.facing > 0.9;
        dir = { x: gunDir.x, y: gunDir.y };
      }
      if (ready) {
        this.fireCd = rifle ? 1 / 8.5 : 1 / 4;
        this.recoilT = 0.08;
        // 散布:后坐力热量越高越散;熟练度越高压制越好
        const spread = (0.012 + 0.075 * this.heat) * (1.35 - 0.75 * this.skill);
        const a = Math.atan2(dir.y, dir.x) + (Math.random() + Math.random() - 1) * spread;
        this.events.push({
          type: 'shot', x: muzzle.x, y: muzzle.y,
          dx: Math.cos(a), dy: Math.sin(a),
          weapon: this.weapon,
        });
        // 熟练度成长 + 后坐力热量积累
        this.heat = Math.min(1, this.heat + (rifle ? 0.3 : 0.22) * (1.25 - 0.5 * this.skill));
        this.skill = Math.min(1, this.skill + 0.006);
        try { localStorage.setItem('contra-skill', String(this.skill)); } catch { /* 忽略 */ }
        // 后坐力:熟练度高时对枪口上跳/推背的控制更好;主武器更沉
        const kick = (rifle ? 1.15 : 0.7) * (1.25 - 0.5 * this.skill);
        torso.applyLinearImpulse(Vec2(-this.facing * kick, 0), torso.getPosition());
      }
    }

    // ---- 姿态伺服 ----
    const tgt = this.poseTargets(input, sp);
    const cur = this.pose;
    const sm = 1 - Math.exp(-14 * dt); // 目标角平滑,防姿态突跳
    for (const key of Object.keys(cur)) cur[key] = lerp(cur[key], tgt[key], sm);

    const fc = this.facing;
    const kp = 15, maxW = 18;
    this.servo(this.j.neck, fc * cur.neck, kp, maxW);
    if (this.weapon === 'rifle') {
      // 主武器:双臂 IK 握在标记点上 —— 瞄准手(近臂)微弯握枪把,副手伸向前握点
      const S = this.torso.getWorldPoint(Vec2(0, A.shoulder.y));
      const kpArm = 16;
      const mirror = this.facing === -1;
      if (this.aimAlpha != null) {
        this.ikArm(this.j.shF, this.j.elF, S, this.gunPoint(this.gunDef.grips.rear), kpArm, mirror);
        this.ikArm(this.j.shB, this.j.elB, S, this.gunPoint(this.gunDef.grips.front), kpArm - 1, mirror);
      } else {
        // 未瞄准:枪垂在身前,双臂保持弯姿
        this.servo(this.j.shF, fc * cur.shF, kp, maxW);
        this.servo(this.j.elF, fc * cur.elF, kp, maxW);
        this.ikArm(this.j.shB, this.j.elB, S, this.gunPoint(this.gunDef.grips.front), kpArm - 1, mirror);
      }
    } else if (this.aimAlpha != null) {
      // 手枪:单手伸直指向光标
      const tu = wrapPi(Math.PI / 2 + this.aimAlpha - torso.getAngle()
        + (this.recoilT > 0 ? -0.3 * fc * (1.3 - 0.6 * this.skill) : 0));
      this.servo(this.j.shF, tu, kp + 4, 26);
      this.servo(this.j.elF, 0.0, kp, 22);
      this.servo(this.j.shB, fc * cur.shB, kp, maxW);
      this.servo(this.j.elB, fc * cur.elB, kp, maxW);
    } else {
      this.servo(this.j.shF, fc * (cur.shF + (this.recoilT > 0 ? -0.25 : 0)), kp, 22);
      this.servo(this.j.elF, fc * (cur.elF + (this.recoilT > 0 ? 0.35 : 0)), kp, 22);
      this.servo(this.j.shB, fc * cur.shB, kp, maxW);
      this.servo(this.j.elB, fc * cur.elB, kp, maxW);
    }
    this.servo(this.j.hipF, fc * cur.hipF, kp + 4, maxW);
    this.servo(this.j.kneeF, fc * cur.kneeF, kp, maxW);
    this.servo(this.j.hipB, fc * cur.hipB, kp + 4, maxW);
    this.servo(this.j.kneeB, fc * cur.kneeB, kp, maxW);

    // 躯干直立 PD(趴下时目标角为躺倒角)。
    // 全身胶囊的转动惯量比小方块大一个量级,参数相应加大
    const errA = fc * cur.torso - torso.getAngle();
    const w = torso.getAngularVelocity();
    torso.applyTorque(clamp(110 * errA - 9 * w, -90, 90));

    this.updateCommon(dt);
  }

  updateCommon(dt) {
    const p = this.torso.getPosition();
    if (p.y < -8) { this.events.push({ type: 'fell' }); return; }
    // 保险丝:躯干中心正常最低也躺在地表 0.15m 之上,
    // 若贴近/低于地表,说明卡进了地形里,持续 0.5s 自动复位
    const surf = groundYAt(p.x, p.y + 0.5);
    if (p.y < surf + 0.04) {
      this.sunkT = (this.sunkT || 0) + dt;
      if (this.sunkT > 0.5) { this.sunkT = 0; this.events.push({ type: 'fell' }); }
    } else {
      this.sunkT = 0;
    }
  }

  muzzle() {
    if (this.weapon === 'rifle') {
      const m = this.gunPoint(this.gunDef.muzzle);
      const gd = this.armLF.getWorldVector(Vec2(0, -1));
      return { x: m.x, y: m.y, dx: gd.x, dy: gd.y };
    }
    const gunDir = this.armLF.getWorldVector(Vec2(0, -1));
    const hand = this.armLF.getWorldPoint(Vec2(0, -D.foreArm.h / 2));
    return {
      x: hand.x + gunDir.x * 0.22, y: hand.y + gunDir.y * 0.22,
      dx: gunDir.x, dy: gunDir.y,
    };
  }

  // ---- 绘制(世界坐标 -> 屏幕由 w2s 提供,ppm 为像素/米)----
  draw(ctx, w2s, ppm, time) {
    const P = (b) => w2s(b.getPosition().x, b.getPosition().y);
    const R = (b) => -b.getAngle(); // 屏幕 y 翻转,角度取反

    const cap = (b, d, color, wGrow = 0) => {
      const [x, y] = P(b);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(R(b));
      ctx.fillStyle = color;
      const w = (d.w + wGrow) * ppm, h = d.h * ppm;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) / 2 * 0.92);
      ctx.fill();
      ctx.restore();
    };

    const boot = (calfBody, pants, dark) => {
      const [x, y] = P(calfBody);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(R(calfBody));
      const w = D.calf.w * ppm, h = D.calf.h * ppm;
      ctx.fillStyle = pants;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h * 0.62, w / 2 * 0.9); ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.roundRect(-w / 2 - 1, -h * 0.5 + h * 0.55, w + 3.5, h * 0.47, [w * 0.5, w * 0.7, w * 0.7, w * 0.5]); ctx.fill();
      ctx.restore();
    };

    const hand = (fb) => {
      const [x, y] = P(fb);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(R(fb));
      ctx.fillStyle = COLOR.skin;
      ctx.beginPath(); ctx.arc(0, D.foreArm.h / 2 * ppm, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    // 装备:在对应身体部件的局部空间里绘制(纸娃娃挂点式)
    const drawEquip = (eq) => {
      if (!eq?.parts?.length) return;
      const k = ppm / (eq.meterScale || 200);
      ctx.save();
      ctx.scale(k, k);
      for (const p of eq.parts) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(p.x, p.y, p.w, p.h, p.r ?? 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15,12,8,0.4)'; // 深描边让装备轮廓从背景里跳出来
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    };

    const gun = () => {
      const hand = this.armLF.getWorldPoint(Vec2(0, -D.foreArm.h / 2));
      const [x, y] = w2s(hand.x, hand.y);
      if (this.weapon === 'rifle') {
        // 主武器:按设计器数据绘制,原点=枪把(瞄准手握点)
        // 瞄准左半边时沿枪管轴镜像,保证弹匣永远垂向下方
        const g = this.gunDef;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-this.gunAngle);
        const k = ppm / g.meterScale;
        ctx.scale(k, k);
        if (this.gunMirrored) ctx.scale(1, -1);
        ctx.translate(-g.grips.rear.x, -g.grips.rear.y);
        for (const p of g.parts) {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.roundRect(p.x, p.y, p.w, p.h, 3);
          ctx.fill();
        }
        ctx.restore();
        return;
      }
      // 副武器:手枪(锚定手部,+y 沿枪口方向,小一号)
      ctx.save();
      ctx.translate(x, y); ctx.rotate(-this.gunAngle);
      const L = 0.22 * ppm;
      const w = D.foreArm.h * ppm * 0.8;
      ctx.fillStyle = COLOR.wood;
      ctx.fillRect(-w * 0.7, -2, w * 1.0, L * 0.38);
      ctx.fillStyle = COLOR.gun;
      ctx.fillRect(-w * 0.5, -1, w * 0.75, L);
      ctx.fillRect(-w * 0.9, L * 0.45, w * 1.6, 2.6);
      ctx.restore();
    };

    // 远侧肢体(暗色)→ 躯干 → 头 → 近侧腿 → 枪 → 近侧臂
    cap(this.armUB, D.upperArm, COLOR.skinDark);
    cap(this.armLB, D.foreArm, COLOR.skinDark);
    hand(this.armLB);
    boot(this.legLB, COLOR.pantsDark, COLOR.bootDark);
    cap(this.legUB, D.thigh, COLOR.pantsDark);

    // 躯干
    {
      const [x, y] = P(this.torso);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(R(this.torso));
      const w = D.torso.w * ppm, h = D.torso.h * ppm;
      ctx.fillStyle = COLOR.skin;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.42); ctx.fill();
      // 弹药带
      ctx.strokeStyle = '#5a4632'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-w * 0.4, -h * 0.32); ctx.lineTo(w * 0.42, h * 0.05); ctx.stroke();
      ctx.strokeStyle = '#3d2f21'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-w * 0.42, h * 0.02); ctx.lineTo(w * 0.4, h * 0.38); ctx.stroke();
      // 腰带
      ctx.fillStyle = '#603a1e';
      ctx.fillRect(-w / 2, h * 0.32, w, h * 0.12);
      drawEquip(this.loadout.torso);
      ctx.restore();
    }

    // 头 + 红头巾
    {
      const [x, y] = P(this.head);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(R(this.head));
      const r = D.headR * ppm;
      // 脖子(随头旋转,始终连接头与颈关节锚点;画在身体 -y 方向,朝向躯干)
      ctx.strokeStyle = COLOR.skin; ctx.lineWidth = 0.078 * ppm; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0.03 * ppm);
      ctx.lineTo(0, 0.33 * ppm);
      ctx.stroke();
      ctx.fillStyle = COLOR.skin;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      // 头巾(头顶 2/5)
      ctx.fillStyle = COLOR.bandana;
      ctx.beginPath();
      ctx.roundRect(-r, -r, r * 2, r * 0.85, [r, r, r * 0.3, r * 0.3]);
      ctx.fill();
      // 飘带(脑后,随时间摆动)
      const flap = Math.sin(time * 8) * 2.5;
      ctx.strokeStyle = COLOR.bandana; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-this.facing * r * 0.8, -r * 0.4);
      ctx.quadraticCurveTo(-this.facing * r * 1.7, -r * 0.7 + flap, -this.facing * r * 2.3, -r * 0.15 + flap * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-this.facing * r * 0.8, -r * 0.3);
      ctx.quadraticCurveTo(-this.facing * r * 1.6, -r * 0.1 - flap, -this.facing * r * 2.1, -r * 0.55 - flap);
      ctx.stroke();
      // 眼睛
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(this.facing * r * 0.42, r * 0.05, 1.7, 0, Math.PI * 2); ctx.fill();
      drawEquip(this.loadout.head);
      ctx.restore();
    }

    boot(this.legLF, COLOR.pants, COLOR.boot);
    cap(this.legUF, D.thigh, COLOR.pants);
    gun();
    cap(this.armUF, D.upperArm, COLOR.skin);
    cap(this.armLF, D.foreArm, COLOR.skin);
    hand(this.armLF);
  }
}
