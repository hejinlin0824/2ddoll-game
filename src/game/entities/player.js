// 主动式布娃娃主角(Active Ragdoll):
// 躯干是主碰撞体,直接做速度控制(平台跳跃手感);
// 四肢通过带限位的旋转关节挂在躯干上,每帧用关节电机做 PD 伺服
// 追踪"姿态目标角"—— 跑步循环/跳跃/下落/趴下都是一组目标角,
// 物理引擎负责所有中间过渡、惯性甩动和落地时的物理抖动。
// 按 R 关掉全部电机 = 纯布娃娃(瘫倒),E 复位。
import { Box, Circle, Vec2, RevoluteJoint } from 'planck';
import { CAT, groundYAt } from '../world/level.js';
import { loadSavedGun, loadEquip, loadAssets, PISTOL_STATS, DEFAULT_STATS } from '../domain/gunPresets.js';
import { computeGunMods, rollAffixes } from '../domain/affixes.js';

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
  // opts.palette: 覆盖配色(敌兵换绿头巾/深色裤,和主角区分)
  // opts.loadout: 固定穿戴(敌兵穿预设原画,不读 localStorage —— 和玩家自定义装备解耦)
  constructor(world, spawn, opts = {}) {
    this.world = world;
    this.spawn = { x: spawn.x, y: spawn.y };
    this.events = [];
    this.C = { ...COLOR, ...(opts.palette || {}) };
    this.loadoutOpt = opts.loadout || null;
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
    // 主武器词条:没有就掷一对(持久化在枪数据里,换枪/重设计会重掷)
    if (!this.gunDef.affixes?.length) {
      try {
        this.gunDef.affixes = rollAffixes('gun', 'rare');
        localStorage.setItem('contra-gun-primary', JSON.stringify(this.gunDef));
      } catch { /* 忽略 */ }
    }
    this.gunMods = computeGunMods(this.gunDef.affixes || []);
    this.gunAngle = 0;            // 枪的世界指向角
    this._limbsMirrored = false;  // 面朝左时肘/膝限位要镜像
    this.moveMul = 1;             // 移速加成(装备词缀)
    this.loadout = this.loadoutOpt
      ? { head: { ...this.loadoutOpt.head }, torso: { ...this.loadoutOpt.torso } }
      : { head: loadEquip('head'), torso: loadEquip('torso') }; // 穿戴
    // ---- 武器词条状态:弹药/换弹/盾牌/近战 ----
    this.ammo = this.stats().mag;
    this.reloadT = 0;
    this.meleeT = 0;
    this.shield = false;
    try {
      const hp = parseFloat(localStorage.getItem('contra-shield-hp'));
      this.shieldHp = clamp(Number.isFinite(hp) ? hp : 100, 0, 100);
      if (localStorage.getItem('contra-shield') === '1' && this.shieldHp > 0) {
        this.shield = true;
        this.weapon = 'pistol'; // 盾牌只能配手枪
      }
    } catch { this.shieldHp = 100; }
    this.pose = { torso: 0, neck: 0, shF: 0.15, elF: 0.55, shB: -0.2, elB: 0.5,
      hipF: 0.05, kneeF: -0.08, hipB: -0.05, kneeB: -0.12 };
  }

  // 当前武器的属性(基础词条 + 主武器词缀聚合);手枪不 tgt 主武器词缀。
  // HUD 每帧、开火每发都读 —— 记忆化:换枪或外部重算 gunMods(新对象)时自动失效
  stats() {
    const m = this.weapon === 'rifle' ? this.gunMods : null;
    if (this._statsCache && this._statsW === this.weapon && this._statsM === m) return this._statsCache;
    const base = this.weapon === 'rifle' ? this.gunDef?.stats : PISTOL_STATS;
    const s = { ...(base || DEFAULT_STATS) };
    if (m) {
      s.damage = Math.round(s.damage * m.dmgMul * 10) / 10;
      s.rpm = Math.round(s.rpm * m.rpmMul);
      s.mag = Math.max(1, Math.round(s.mag + m.magFlat));
      s.spread = +(s.spread * m.spreadMul).toFixed(2);
      s.reload = +(s.reload * m.reloadMul).toFixed(2);
      s.range = Math.round(s.range * m.rangeMul);
      s.armorDmgMul = m.armorDmgMul;
    }
    this._statsW = this.weapon;
    this._statsM = m;
    return (this._statsCache = s || DEFAULT_STATS);
  }

  // 吸血总百分比(主武器词缀 + 防具词缀)
  get lifestealPct() {
    return (this.gunMods?.lifesteal || 0) + (this.armorLifestealPct || 0);
  }
  get moveSpeedPct() {
    const m = this.armorMods || {};
    return (m.head?.moveSpeedPct || 0) + (m.body?.moveSpeedPct || 0);
  }

  ammoInfo() {
    const st = this.stats();
    return { ammo: this.ammo, mag: st.mag, reloadT: this.reloadT };
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

  // 百分比减伤 = 防具"铁壁"词条聚合(syncArmorFromInventory 写入;结算端钳 0~0.8)。
  // loadout 里是视觉预设,从来没有 defense 字段,别再读它
  get defense() {
    return (this.armorDefensePct || 0) / 100;
  }

  // 受击闪白:整具布娃娃罩白色半透明(近战/枪击命中反馈用)
  drawFlash(ctx, w2s, alpha) {
    if (alpha <= 0) return;
    const dims = [D.torso, { w: D.headR * 2, h: D.headR * 2 },
      D.upperArm, D.foreArm, D.upperArm, D.foreArm, D.thigh, D.calf, D.thigh, D.calf];
    this.allBodies.forEach((b, i) => {
      const d = dims[i];
      const [x, y] = w2s(b.getPosition().x, b.getPosition().y);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-b.getAngle());
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.85, alpha)})`;
      if (i === 1) {
        ctx.beginPath(); ctx.arc(0, 0, d.w / 2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.roundRect(-d.w / 2, -d.h / 2, d.w, d.h, d.w / 2 * 0.9); ctx.fill();
      }
      ctx.restore();
    });
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
    if (w === 'rifle' && this.shield) this.setShield(false); // 盾牌只能配手枪
    this.weapon = w;
    this.recoilT = 0;
    this.ammo = this.stats().mag; // 换枪满弹匣
    this.reloadT = 0;
  }

  // ---- 防弹盾牌:举盾时只能用手枪;盾面挡敌方子弹,耐久打光会碎 ----
  setShield(on) {
    if (this.shield === on) return;
    this.shield = on;
    if (on) {
      // 碎过的盾重新架起时修好(盾耐久存在档里,不重置的话该存档的盾永久是 0)
      this.shieldHp = 100;
      try { localStorage.setItem('contra-shield-hp', String(this.shieldHp)); } catch { /* 忽略 */ }
    }
    if (on && this.weapon !== 'pistol') {
      this.weapon = 'pistol';
      this.recoilT = 0;
      this.ammo = this.stats().mag;
      this.reloadT = 0;
    }
    try { localStorage.setItem('contra-shield', on ? '1' : '0'); } catch { /* 忽略 */ }
    this.events.push({ type: 'shield', on });
  }

  damageShield(dmg) {
    if (!this.shield || this.shieldHp <= 0) return false;
    this.shieldHp = Math.max(0, this.shieldHp - dmg);
    try { localStorage.setItem('contra-shield-hp', String(this.shieldHp)); } catch { /* 忽略 */ }
    if (this.shieldHp <= 0) this.setShield(false); // 碎了
    return true;
  }

  // 盾牌阻挡盒(世界坐标):盾面垂直于威胁方向,g = 威胁方向单位向量
  shieldOBB() {
    const p = this.torso.getPosition();
    const gx = Math.cos(this.gunAngle), gy = Math.sin(this.gunAngle);
    return { x: p.x + gx * 0.5, y: p.y + gy * 0.5 + 0.05, gx, gy, ht: 0.07, hw: 0.34 };
  }

  // ---- 近战(V):枪托前捅;举盾时是盾牌冲撞,带击退 ----
  melee() {
    // 换弹不阻塞近战(否则按 V 经常被无声吞掉,手感极差)
    if (this.ragdoll || this.meleeT > 0) return;
    this.meleeT = 0.32;
    const p = this.torso.getPosition();
    this.events.push({
      type: 'melee', shield: this.shield,
      x: p.x + this.facing * 0.3, y: p.y,
      dx: Math.cos(this.gunAngle), dy: Math.sin(this.gunAngle),
    });
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

    // 举盾:副手(远臂)前举托盾
    if (this.shield) { t.shB = 1.15; t.elB = 0.3; }
    // 近战突刺:枪托前捅 / 盾牌冲撞(出手快,收手慢)
    if (this.meleeT > 0) {
      const lunge = Math.sin((1 - this.meleeT / 0.32) * Math.PI);
      if (this.shield) {
        t.shB = 1.15 + 0.75 * lunge; t.elB = Math.max(0.05, 0.3 - 0.25 * lunge);
        t.torso = -0.07 * lunge;
      } else {
        t.shF = 1.55; t.elF = 0.04;
        t.torso = -0.09 * lunge;
      }
    }
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
    const sniper = this.weapon === 'rifle' && this.gunDef.stats?.mode === 'hitscan';
    this.sniperStance = sniper;
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (sniper) dir = 0; // 狙击站桩:持栓动枪时不能移动
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
    this.gunAngle = (this.aimAlpha != null ? this.aimAlpha
      : Math.atan2(gd0.y, gd0.x));
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

    const speed = (this.prone ? 1.9 : 4.6) * (1 + (this.moveSpeedPct || 0) / 100);
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

    if (this.jumpBuf > 0 && this.coyote > 0 && !this.prone && !sniper) {
      // 全身一起起跳(四肢通过关节拖拽会偷走躯干动量,单给躯干加速度跳不高)
      for (const b of this.allBodies) b.setLinearVelocity(Vec2(b.getLinearVelocity().x, 13));
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
    this.meleeT = Math.max(0, this.meleeT - dt);
    this.heat = Math.max(0, this.heat - dt * (0.35 + 0.4 * this.skill));
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        this.ammo = this.stats().mag;
        this.events.push({ type: 'reloaded' });
      }
    }
    if (input.fire && this.fireCd <= 0 && this.reloadT <= 0 && this.meleeT <= 0) {
      const st = this.stats();
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
        if (this.ammo <= 0) {
          this.reloadT = st.reload; // 打空自动换弹
          this.events.push({ type: 'reload' });
        } else {
          this.fireCd = 60 / st.rpm;
          this.ammo--;
          this.recoilT = 0.08;
          // 散布:后坐力热量越高越散;熟练度越高压制越好;词条 spread 是相对系数
          const spread = (0.012 + 0.075 * this.heat) * (1.35 - 0.75 * this.skill) * st.spread;
          const baseA = Math.atan2(dir.y, dir.x); // 无后坐力上抬,弹道即光标方向
          const parts = [];
          for (let i = 0; i < st.pellets; i++) {
            // 多弹丸(霰弹枪):扇形均布 + 各自抖动,pelletSpread 决定散射半角;
            // 伤害归一:整枪基础伤害 = 1,弹丸均分(部位倍率在命中端结算)
            const arc = st.pellets > 1 ? (i / (st.pellets - 1) - 0.5) * 2 * (st.pelletSpread ?? 0.12) : 0;
            const a = baseA + arc + (Math.random() + Math.random() - 1) * spread * 0.5;
            parts.push({ dx: Math.cos(a), dy: Math.sin(a), damage: st.damage }); // 每颗弹丸 = 武器伤害×部位倍率(命中端结算)
          }
          this.events.push({
            type: st.mode === 'hitscan' ? 'hitscanShot' : 'shot',
            x: muzzle.x, y: muzzle.y,
            weapon: this.weapon, stats: st, parts,
          });
          // 熟练度成长 + 后坐力热量积累(词条 recoil 缩放);localStorage 每 10 发存一次(同步 IO 别太频)
          this.heat = Math.min(1, this.heat + 0.26 * st.recoil * (1.25 - 0.5 * this.skill) * (this.gunMods?.heatMul || 1));
          this.skill = Math.min(1, this.skill + 0.006);
          this._shotN = (this._shotN || 0) + 1;
          if (this._shotN % 10 === 0) { try { localStorage.setItem('contra-skill', String(this.skill)); } catch { /* 忽略 */ } }
          // 后坐力:熟练度高时对枪口上跳/推背的控制更好;词条 recoil 放大
          const kick = (rifle ? 1.15 : 0.7) * st.recoil * (1.25 - 0.5 * this.skill);
          torso.applyLinearImpulse(Vec2(-this.facing * kick, 0), torso.getPosition());
        }
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
      ctx.fillStyle = this.C.skin;
      ctx.beginPath(); ctx.arc(0, D.foreArm.h / 2 * ppm, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    // 装备:在对应身体部件的局部空间里绘制(纸娃娃挂点式)
    // parts 支持两种零件:矩形 {x,y,w,h,color,r} / 图片 {img:素材id,x,y,w,h,rot}
    const assetImgs = new Map(); // 素材图缓存(id -> HTMLImageElement)
    const assetImage = (id) => {
      if (assetImgs.has(id)) return assetImgs.get(id);
      const src = loadAssets()[id];
      if (!src) { assetImgs.set(id, null); return null; }
      const im = new Image();
      im.src = src; // 异步解码,未就绪的帧先跳过,就绪后自然出现
      assetImgs.set(id, im);
      return im;
    };
    const drawEquip = (eq) => {
      if (!eq?.parts?.length) return;
      const k = ppm / (eq.meterScale || 200);
      ctx.save();
      ctx.scale(k, k);
      // 纸娃娃镜像:朝左时装备整体左右翻转(图片零件有方向性,不翻会"背对"朝向)
      if (this.facing === -1) ctx.scale(-1, 1);
      ctx.strokeStyle = 'rgba(15,12,8,0.45)';
      ctx.lineWidth = 1.5 / k; // 描边固定屏幕 1.5px,不被设计坐标缩放变细
      for (const p of eq.parts) {
        if (p.img) {
          const im = assetImage(p.img);
          if (im && im.complete && im.naturalWidth) {
            ctx.save();
            ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
            ctx.rotate(p.rot || 0);
            const cr = p.crop;
            if (cr && cr.sw > 0 && cr.sh > 0) ctx.drawImage(im, cr.sx, cr.sy, cr.sw, cr.sh, -p.w / 2, -p.h / 2, p.w, p.h);
            else ctx.drawImage(im, -p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
          }
          continue;
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(p.x, p.y, p.w, p.h, p.r ?? 4);
        ctx.fill();
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
          ctx.strokeStyle = 'rgba(15,12,8,0.45)'; // 深描边,夜色背景下枪身轮廓才看得清
          ctx.lineWidth = 1.5 / k;
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      // 副武器:手枪(锚定手部,x 向枪口)。滑套画在轴线上方(-y),
      // 朝左时垂直镜像保证滑套永远朝上 —— 不镜像的话往右打手枪会上下颠倒
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-this.gunAngle);
      if (this.gunMirrored) ctx.scale(1, -1);
      const L = 0.24 * ppm;
      const sh = 0.07 * ppm;
      const gw = D.foreArm.h * ppm * 0.8;
      ctx.fillStyle = this.C.gun;
      ctx.fillRect(-gw * 0.35, -sh, gw * 0.7 + L * 0.6, sh); // 滑套
      ctx.fillStyle = '#2f333b';
      ctx.fillRect(gw * 0.25, -sh * 0.9, L * 0.28, sh * 0.9); // 套筒前段
      ctx.fillStyle = this.C.wood;
      ctx.fillRect(-gw * 0.32, 0, gw * 0.52, L * 0.42);       // 握把(轴线下)
      ctx.strokeStyle = 'rgba(15,12,8,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-gw * 0.35, -sh, gw * 0.7 + L * 0.6, sh);
      ctx.strokeRect(-gw * 0.32, 0, gw * 0.52, L * 0.42);
      ctx.restore();
    };

    // 远侧肢体(暗色)→ 躯干 → 头 → 近侧腿 → 枪 → 近侧臂
    cap(this.armUB, D.upperArm, this.C.skinDark);
    cap(this.armLB, D.foreArm, this.C.skinDark);
    hand(this.armLB);
    boot(this.legLB, this.C.pantsDark, this.C.bootDark);
    cap(this.legUB, D.thigh, this.C.pantsDark);

    // 躯干
    {
      const [x, y] = P(this.torso);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(R(this.torso));
      const w = D.torso.w * ppm, h = D.torso.h * ppm;
      ctx.fillStyle = this.C.skin;
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

    // 防弹盾牌:副手前举的大板盾,轻微朝瞄准方向倾斜;耐久低出现裂纹
    if (this.shield && this.shieldHp > 0) {
      const hw = this.armLB.getWorldPoint(Vec2(0, -D.foreArm.h / 2));
      const [hx, hy] = w2s(hw.x, hw.y);
      const gx = Math.cos(this.gunAngle), gy = Math.sin(this.gunAngle);
      ctx.save();
      ctx.translate(hx + gx * 0.07 * ppm, hy + gy * 0.07 * ppm);
      ctx.rotate(clamp(-this.gunAngle * 0.35, -0.55, 0.55));
      const w = 0.30 * ppm, h = 0.74 * ppm;
      ctx.fillStyle = '#9fb0c4';
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, [w * 0.32, w * 0.32, w * 0.5, w * 0.5]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,12,8,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 观察窗
      ctx.fillStyle = '#59c2ff';
      ctx.beginPath();
      ctx.roundRect(-w * 0.22, -h * 0.34, w * 0.44, h * 0.12, 2.5);
      ctx.fill();
      // 加强筋
      ctx.strokeStyle = 'rgba(70,82,100,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.18); ctx.lineTo(0, h * 0.3);
      ctx.stroke();
      // 耐久裂纹(低于 60% 越来越碎)
      if (this.shieldHp < 60) {
        const k = 1 - this.shieldHp / 60;
        ctx.strokeStyle = `rgba(20,22,30,${0.35 + 0.4 * k})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.3, h * 0.1);
        ctx.lineTo(w * 0.1, h * 0.24);
        ctx.lineTo(-w * 0.12, h * 0.38);
        if (k > 0.5) { ctx.moveTo(w * 0.3, -h * 0.2); ctx.lineTo(-w * 0.02, -h * 0.02); }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 头 + 红头巾
    {
      const [x, y] = P(this.head);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(R(this.head));
      const r = D.headR * ppm;
      // 脖子(随头旋转,始终连接头与颈关节锚点;画在身体 -y 方向,朝向躯干)
      ctx.strokeStyle = this.C.skin; ctx.lineWidth = 0.078 * ppm; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0.03 * ppm);
      ctx.lineTo(0, 0.33 * ppm);
      ctx.stroke();
      ctx.fillStyle = this.C.skin;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      // 头巾(头顶 2/5)
      ctx.fillStyle = this.C.bandana;
      ctx.beginPath();
      ctx.roundRect(-r, -r, r * 2, r * 0.85, [r, r, r * 0.3, r * 0.3]);
      ctx.fill();
      // 飘带(脑后,随时间摆动)
      const flap = Math.sin(time * 8) * 2.5;
      ctx.strokeStyle = this.C.bandana; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
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

    boot(this.legLF, this.C.pants, this.C.boot);
    cap(this.legUF, D.thigh, this.C.pants);
    gun();
    cap(this.armUF, D.upperArm, this.C.skin);
    cap(this.armLF, D.foreArm, this.C.skin);
    hand(this.armLF);
  }
}
