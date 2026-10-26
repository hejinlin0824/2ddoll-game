// 主动式布娃娃主角(Active Ragdoll):
// 躯干是主碰撞体,直接做速度控制(平台跳跃手感);
// 四肢通过带限位的旋转关节挂在躯干上,每帧用关节电机做 PD 伺服
// 追踪"姿态目标角"—— 跑步循环/跳跃/下落/下蹲都是一组目标角,
// 物理引擎负责所有中间过渡、惯性甩动和落地时的物理抖动。
// 按 R 关掉全部电机 = 纯布娃娃(瘫倒),E 复位。
import { Box, Circle, Vec2, RevoluteJoint } from 'planck';
import { CAT, groundYAt } from '../world/level.js';
import { particles, addDecal, bloodJet } from '../systems/fx.js';
import { loadSavedGun, loadEquip, loadAssets, loadGunBuild, GUN_PRESETS, PISTOL_STATS, DEFAULT_STATS } from '../domain/gunPresets.js';
import { computeGunMods, rollAffixes, loadGunAffixes, saveGunAffixes } from '../domain/affixes.js';
import { loadAppearance, appearancePalette, appearanceRevision } from '../domain/appearance.js';
import { equipmentPartCenter } from '../domain/equipmentGeometry.js';
import { RIG_DIMS as D, RIG_ANCHORS as A, DEFAULT_RIG_POSE } from '../domain/rigGeometry.js';

// Rig dimensions/anchors are shared with the operator studio's Canvas2D reference preview.

const COLOR = {
  skin: '#e2b088', skinDark: '#b8885f',
  shirt: '#35495b', shirtDark: '#263747',
  pants: '#3a66b0', pantsDark: '#2a4a80',
  boot: '#2b2b33', bootDark: '#1f1f26',
  bandana: '#d8302c', bandanaDark: '#a32220',
  gun: '#3c4048', wood: '#7a4a26',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (x) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const shadeKit = (hex, amount) => { const n=parseInt(hex.slice(1),16); return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(v*amount))).toString(16).padStart(2,'0')).join(''); };

export class Player {
  // opts.palette: 覆盖配色(敌兵换绿头巾/深色裤,和主角区分)
  // opts.loadout: 固定穿戴(敌兵穿预设原画,和玩家自定义装备解耦)
  // opts.gunDef: 指定枪械定义;NPC 在构造前选好内置枪,不读取玩家设计器存档。
  // opts.persistPlayerData: 是否读取/写入玩家专属 localStorage 数据,默认 true。NPC 必须显式传 false。
  constructor(world, spawn, opts = {}) {
    this.world = world;
    this.spawn = { x: spawn.x, y: spawn.y };
    this.events = [];
    this.loadoutOpt = opts.loadout || null;
    this.gunDefOpt = opts.gunDef || null;
    this.persistPlayerData = opts.persistPlayerData !== false;
    this.useAppearance = !opts.palette; // 程序化外观只给主角；敌人由各自 palette 驱动
    this.appearance = this.persistPlayerData && this.useAppearance ? loadAppearance() : null;
    this._appearanceRevision = appearanceRevision();
    this.C = { ...COLOR, ...(opts.palette || {}), ...(this.appearance ? appearancePalette(this.appearance) : {}) };
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
    // 圆顶圆底跳跃撞平台边角会顺滑滑开、蹲姿/跑动也不会被直角卡住。
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
    this.lastStairVerticalSign = 0;
    this.crouch = false;   // S 按住:下蹲(低姿态)
    this.crouched = false; // 当前碰撞体状态(true = 矮胶囊已换上)
    this.roping = false;   // 绳降中(敌人专用):双手举过头抓绳
    this.deadCorpse = false; // 真死了(区别 R 键测试布娃娃):残肢需要静置休眠
    this.ragdoll = false;
    this.phase = 0;          // 跑步循环相位
    this.coyote = 0;         // 离地宽限
    this.jumpBuf = 0;        // 跳跃预输入
    this.fireCd = 0;
    this.recoilT = 0;
    this.grenadeCd = 0; // 手雷冷却(无限雷,冷却 3.2s 一颗 —— 简单直接的成长感留给词条)
    this.throwT = 0;    // 投掷挥臂动画(0.28s)
    this.fallVy = 0;
    this.t = 0;

    // 熟练度属于玩家档案。NPC 使用独立默认值,绝不读取或覆盖玩家存档。
    if (this.persistPlayerData) {
      try {
        this.skill = clamp(parseFloat(localStorage.getItem('contra-skill')) || 0.15, 0.1, 1);
      } catch {
        this.skill = 0.15;
      }
    } else {
      this.skill = 0.15;
    }
    this.heat = 0;
    this.weapon = 'rifle'; // rifle=主武器(双手) | pistol=副武器(单手手枪)

    // 玩家使用设计器保存的枪;NPC 必须由创建方显式传入内置预设枪。
    // persistPlayerData=false 时的兜底也只选内置预设,不触碰玩家自定义存档。
    const firstPresetGun = Object.values(GUN_PRESETS)[0];
    this.gunDef = this.gunDefOpt
      ? { ...this.gunDefOpt }
      : (this.persistPlayerData ? loadSavedGun() : { ...firstPresetGun });
    // 手枪是独立模块蓝图；NPC 只拿默认轮廓，绝不读玩家的手枪涂装/配件存档。
    this.sidearmDef = this.persistPlayerData
      ? loadGunBuild('Glock 17')
      : { ...GUN_PRESETS['Glock 17'], parts: GUN_PRESETS['Glock 17'].parts.map((p) => ({ ...p })), attachments: [] };

    // 主武器词条存档仅属于玩家。NPC 使用空词条,避免读写玩家主武器成长数据。
    if (this.persistPlayerData) {
      this.gunDef.affixes = loadGunAffixes() || rollAffixes('gun', 'rare');
      saveGunAffixes(this.gunDef.affixes);
    } else {
      this.gunDef.affixes = [];
    }
    this.gunMods = computeGunMods(this.gunDef.affixes);
    // 消音器按枪型分别保存；手枪、MP5/SMG、AWP/狙击枪可单独安装/关闭。
    this.suppressors = Object.create(null);
    if (this.persistPlayerData) {
      try {
        const saved = JSON.parse(localStorage.getItem('contra-suppressors') || '{}');
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) this.suppressors = saved;
      } catch { /* 损坏的消音器存档退回关闭状态 */ }
    }
    this.gunAngle = 0;            // 枪的世界指向角
    this._limbsMirrored = false;  // 面朝左时肘/膝限位要镜像
    this.moveMul = 1;             // 移速加成(装备词条)

    // NPC 的固定 loadout 优先;NPC 没有 loadout 时不从玩家存档读取装备。
    if (this.loadoutOpt) {
      this.loadout = {
        head: this.loadoutOpt.head ? { ...this.loadoutOpt.head } : null,
        torso: this.loadoutOpt.torso ? { ...this.loadoutOpt.torso } : null,
      };
    } else if (this.persistPlayerData) {
      this.loadout = { head: loadEquip('head'), torso: loadEquip('torso') };
    } else {
      this.loadout = { head: null, torso: null };
    }

    // ---- 武器词条状态:弹药/换弹/盾牌/近战 ----
    this.ammo = this.stats().mag;
    this.reloadT = 0;
    this.reloadTotalT = 0;
    this.meleeT = 0;
    this.shield = false;
    this.shieldHp = 100;
    if (this.persistPlayerData) {
      try {
        const hp = parseFloat(localStorage.getItem('contra-shield-hp'));
        this.shieldHp = clamp(Number.isFinite(hp) ? hp : 100, 0, 100);
        if (localStorage.getItem('contra-shield') === '1' && this.shieldHp > 0) {
          this.shield = true;
          this.weapon = 'pistol'; // 盾牌只能配手枪
          this.ammo = this.stats().mag; // 装载存档盾牌后武器变为手枪,同步弹匣容量
        }
      } catch {
        this.shieldHp = 100;
      }
    }
    this.pose = { ...DEFAULT_RIG_POSE };
  }

  // 当前武器的属性(基础词条 + 主武器词缀聚合);手枪不 tgt 主武器词缀。
  // HUD 每帧、开火每发都读 —— 记忆化:换枪或外部重算 gunMods(新对象)时自动失效
  stats() {
    const m = this.weapon === 'rifle' ? this.gunMods : null;
    if (this._statsCache && this._statsW === this.weapon && this._statsM === m) return this._statsCache;
    const base = this.weapon === 'rifle' ? this.gunDef?.stats : (this.sidearmDef?.stats || PISTOL_STATS);
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
  // ---- 以下属性 = 防具词缀(armorMods,由 syncArmorFromInventory 绑定)+ 枪词缀(gunMods,仅持主武器时)合并 ----
  // 做成 getter 是因为切枪不重跑 sync;枪侧/防具侧各自聚合后在这里相加(近战为乘区合并)
  get meleeDmgMul() {
    const armor = 1 + ((this.armorMods?.head?.meleeDmgPct || 0) + (this.armorMods?.body?.meleeDmgPct || 0)) / 100;
    const gun = this.weapon === 'rifle' ? 1 + (this.gunMods?.meleeDmgPct || 0) / 100 : 1;
    return armor * gun;
  }
  get coinGainPct() {
    return (this.armorMods?.head?.coinGainPct || 0) + (this.armorMods?.body?.coinGainPct || 0)
      + (this.weapon === 'rifle' ? (this.gunMods?.coinGainPct || 0) : 0);
  }
  get dropRatePct() {
    return (this.armorMods?.head?.dropRatePct || 0) + (this.armorMods?.body?.dropRatePct || 0)
      + (this.weapon === 'rifle' ? (this.gunMods?.dropRatePct || 0) : 0);
  }
  // 复仇(背水):低血量增伤,消费在 game.js(弹丸/hitscan/近战按 pstate.hp<35% 生效)
  get lowHpDmgPct() {
    return (this.armorMods?.body?.lowHpDmgPct || 0)
      + (this.weapon === 'rifle' ? (this.gunMods?.lowHpDmgPct || 0) : 0);
  }

  ammoInfo() {
    const st = this.stats();
    return { ammo: this.ammo, mag: st.mag, reloadT: this.reloadT, reloadTotalT: this.reloadTotalT };
  }

  // 手动 / 自动换弹共用状态入口。弹药为无限储备、仅管理当前弹匣。
  reload() {
    if (this.ragdoll || this.reloadT > 0) return false;
    const st = this.stats();
    if (this.ammo >= st.mag) return false;
    this.reloadT = Math.max(0.25, st.reload);
    this.reloadTotalT = this.reloadT;
    this.reloadWeaponName = this.weapon === 'rifle' ? (this.gunDef?.name || '自定义枪') : '手枪';
    this.events.push({ type: 'reload', manual: true, weapon: this.weapon, weaponName: this.reloadWeaponName });
    return true;
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
    if (on) { this.reloadT = 0; this.reloadTotalT = 0; this.reloadWeaponName = ''; } // 进入失控态时取消动作,避免换弹计时被 ragdoll 分支冻结。
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
      // ★ 换"死亡小盒"碰撞体:全身胶囊是给站姿设计的(四肢全在包络里),
      // 躺倒后它变成一根 1.24m 的横棍,把四肢从包络里往外挤、再顶着地面 ——
      // 求解器两头打架,就是尸体在地上抖来抖去的根因。死时只留包躯干本体的小盒。
      this.swapTorsoCapsule(0);
      // 挨了一枪的感觉:给一记冲量+角速度,让布娃娃真的瘫倒
      this.grounded = false;
      this.torso.applyLinearImpulse(
        Vec2(this.facing * 2.2 + (Math.random() - 0.5), 2.4),
        this.torso.getPosition());
      this.torso.setAngularVelocity(-this.facing * (3 + Math.random() * 3));
    } else {
      // 复位:恢复到当前姿态对应的胶囊高度(蹲着复活也是跪姿高度)
      this.swapTorsoCapsule(this.crouched ? 0.34 : 0.62);
      // 电机重新接上时压制角速度,避免从地上"弹射起身"
      this.torso.setAngularVelocity(clamp(this.torso.getAngularVelocity(), -2.5, 2.5));
    }
  }

  // 换躯干碰撞体:H>0 = 竖胶囊(半高 H,带上下圆帽,包络到脚/头);
  // H=0 = "死亡小盒"(只包躯干本体 0.30×0.52,四肢交给自己的地面碰撞)
  swapTorsoCapsule(H) {
    const t = this.torso;
    for (let f = t.getFixtureList(); f;) {
      const next = f.getNext();
      t.destroyFixture(f);
      f = next;
    }
    const def = {
      density: 5, friction: 0.02, restitution: 0,
      filterCategoryBits: CAT.PLAYER, filterMaskBits: CAT.GROUND,
    };
    if (H > 0) {
      t.createFixture(new Box(D.torso.w / 2, H), def);
      t.createFixture(new Circle(Vec2(0, H), D.torso.w / 2), def);
      t.createFixture(new Circle(Vec2(0, -H), D.torso.w / 2), def);
    } else {
      t.createFixture(new Box(D.torso.w / 2, D.torso.h / 2), def);
    }
  }

  // 下蹲(骑士跪)↔ 站立:换躯干碰撞体(全身高胶囊 half 0.62 ↔ 跪姿矮胶囊 0.34)。
  // 蹲下 = 换矮胶囊后自然下坠 0.28m 坐进跪姿;起身 = 先把全身整体上移 0.28 再换高胶囊
  // (坑 13:必须整体平移,只挪躯干会被关节拽飞;不先抬高则高胶囊插地被求解器弹飞)。
  // 空中同样成立:蹲姿起跳/被击退离地后 crouch 自动变 false,起身必须照抬 ——
  // 原来带 grounded 条件,空中起身高胶囊下半截插进地里,落地瞬间被弹飞
  applyCrouch(on) {
    if (this.crouched === on) return;
    this.crouched = on;
    if (!on) {
      for (const b of this.allBodies) {
        const p = b.getPosition();
        b.setTransform(Vec2(p.x, p.y + 0.28), b.getAngle());
      }
    }
    this.swapTorsoCapsule(on ? 0.34 : 0.62);
  }

  // ---- 死亡动作:按受击部位给不同肢体群冲量 + 随机量 ----
  // 电机全关后关节都会摆到限位(所以以前每次都折叠成一样的坐姿),
  // 死亡瞬间给各肢体差异化的初速度,限位停的位置就每次都不一样了。
  // 必须在 setRagdoll(true) 之后调用(电机已关、肢体已开地面碰撞)
  // ---- 断肢:击杀时撕掉关节,部件作为自由刚体飞出去 ----
  // 零件仍在 allBodies 且肢体层已开地面碰撞(见 setRagdoll),绘制/落地弹跳全自动;
  // 只能在 setRagdoll(true) 之后调用。按部位决定撕哪里 + 概率,同一部位多次触发也不会重复
  dismember(dir, zone) {
    const parts = new Set();
    if (zone === 'head') {
      parts.add('neck'); // 爆头必断头
      if (Math.random() < 0.5) parts.add(Math.random() < 0.5 ? 'shF' : 'shB');
    } else if (zone === 'legs') {
      parts.add(Math.random() < 0.5 ? 'hipF' : 'hipB');
      if (Math.random() < 0.3) parts.add(Math.random() < 0.5 ? 'hipF' : 'hipB');
    } else {
      if (Math.random() < 0.45) parts.add(Math.random() < 0.5 ? 'shF' : 'shB');
      if (Math.random() < 0.22) parts.add(Math.random() < 0.5 ? 'hipF' : 'hipB');
    }
    for (const jn of parts) {
      const j = this.j[jn];
      if (!j) continue;
      const a = j.getAnchorA(); // 断口(世界坐标)
      this.world.destroyJoint(j);
      delete this.j[jn];
      // 级联撕掉下游关节(肩→肘、髋→膝):两截连着飞的话,膝/肘限位(必须保持弯曲)
      // 和"躺平"的静止构型永远打架,求解器每步都打 —— 就是残肢在地上抖的根因;
      // 撕成独立单盒后躺平即静止
      const distal = { shF: 'elF', shB: 'elB', hipF: 'kneeF', hipB: 'kneeB' }[jn];
      if (distal && this.j[distal]) {
        this.world.destroyJoint(this.j[distal]);
        delete this.j[distal];
      }
      // 断口大喷溅 + 颈动脉式持续喷血(发射器挂躯干上,尸体翻滚断口跟着走)
      for (let i = 0; i < 22; i++) {
        particles.push({
          x: a.x, y: a.y,
          vx: dir.x * (1.5 + Math.random() * 5.5) + (Math.random() - 0.5) * 2.8,
          vy: 1.5 + Math.random() * 4.8,
          life: 0.5 + Math.random() * 0.55, size: 2.2 + Math.random() * 2.6,
          color: Math.random() < 0.7 ? '#c41e12' : '#e8382a', grav: 1.25,
        });
      }
      // 断口局部坐标(关节锚在躯干局部系):颈 (0,0.30) / 肩 (0,0.20) / 髋 (0,-0.24)
      const local = jn === 'neck' ? { x: 0, y: 0.30 }
        : (jn === 'hipF' || jn === 'hipB') ? { x: 0, y: -0.24 } : { x: 0, y: 0.20 };
      bloodJet(this.torso, local.x, local.y, dir.x || this.facing, 0.5, jn === 'neck' ? 1.3 : 1.0);
      const gy = groundYAt(a.x, a.y);
      if (gy > -50) addDecal('blood', a.x + (Math.random() - 0.5) * 0.6, gy - 0.02, 0, 0.28 + Math.random() * 0.2);
      // 断肢甩出 + 旋转(级联撕关节后是独立单盒,躺平即静止)
      const piece = jn === 'neck' ? this.head
        : jn === 'hipF' ? this.legUF : jn === 'hipB' ? this.legUB
        : jn === 'shF' ? this.armUF : this.armUB;
      const v = piece.getLinearVelocity();
      piece.setLinearVelocity(Vec2(v.x + dir.x * (2 + Math.random() * 3), v.y + 2.5 + Math.random() * 2.5));
      piece.setAngularVelocity((Math.random() - 0.5) * 14);
      // 阻尼:飞行前段不受影响,落地弹两下就停 —— tile 接缝的微振动被阻尼吃掉
      piece.setLinearDamping(1.4);
      piece.setAngularDamping(1.8);
    }
  }

  deathImpulse(dir, zone) {
    this.deadCorpse = true; // 标记真死(R 键测试布娃娃不置位):updateCommon 走静置休眠
    this.dismember(dir, zone); // 先断肢(断口坐标按死亡瞬间的关节位置取)
    const d = dir || { x: this.facing, y: 0.2 };
    const kick = (b, ix, iy) => {
      if (!b) return;
      const v = b.getLinearVelocity();
      b.setLinearVelocity(Vec2(v.x + ix, v.y + iy));
    };
    const R = (a, b) => a + Math.random() * (b - a);
    // 躯干:沿弹道倒 + 随机翻转(幅度/方向每尸体不同,1/4 概率反向滚)
    const tv = this.torso.getLinearVelocity();
    this.torso.setLinearVelocity(Vec2(tv.x + d.x * R(1.5, 3), tv.y + R(1.5, 2.6)));
    this.torso.setAngularVelocity((d.x >= 0 ? -1 : 1) * R(2.5, 6) * (Math.random() < 0.25 ? -0.5 : 1));
    if (zone === 'head') {
      // 爆头:头猛地后甩,双臂张开上扬,身体后仰折
      kick(this.head, d.x * R(4, 7), R(2, 3.6));
      kick(this.armUF, d.x * R(2.5, 5), R(2, 4));
      kick(this.armUB, d.x * R(2.5, 5), R(2, 4));
      kick(this.armLF, d.x * R(1, 3), R(1, 3));
      kick(this.armLB, d.x * R(1, 3), R(1, 3));
    } else if (zone === 'legs') {
      // 腿部中弹:下盘被扫飞,上身前扑或后仰(随机),头滞后甩
      kick(this.legUF, d.x * R(3, 6), R(-0.5, 1.5));
      kick(this.legLF, d.x * R(4, 7), R(0, 2));
      kick(this.legUB, d.x * R(3, 6), R(-0.5, 1.5));
      kick(this.legLB, d.x * R(4, 7), R(0, 2));
      kick(this.head, d.x * R(0.5, 2), R(0.5, 2));
      if (Math.random() < 0.5) this.torso.setAngularVelocity(-this.torso.getAngularVelocity());
    } else {
      // 躯干中弹:双臂乱甩,头一歪,就地软倒
      kick(this.armUF, d.x * R(2, 4.5), R(1.5, 3.5));
      kick(this.armUB, -d.x * R(2, 4.5), R(1, 3));
      kick(this.armLF, d.x * R(1.5, 3.5), R(1, 2.5));
      kick(this.armLB, -d.x * R(1.5, 3.5), R(1, 2.5));
      kick(this.head, d.x * R(1.5, 3.5), R(0.8, 2.2));
    }
    // 腿部再加一层全随机:谁也别想摆出同款坐姿
    for (const b of [this.legUF, this.legLF, this.legUB, this.legLB]) {
      kick(b, R(-1.6, 1.6), R(0, 2));
    }
  }

  // 瞄准方向在左半边时,枪械贴图需要垂直镜像(否则弹匣会翻到上面)
  get gunMirrored() { return Math.cos(this.gunAngle) < 0; }

  reloadLoadout() {
    // 固定 loadout 的 NPC 不能被 storage 事件替换成玩家装备。
    if (!this.persistPlayerData) return;
    this.loadout = { head: loadEquip('head'), torso: loadEquip('torso') };
  }

  // 总减伤 = 已穿戴设计装备的基础防御 + 背包防具"铁壁"词条。
  // armorBaseDefensePct / armorDefensePct 均以百分数百分点储存(如 35 + 5 = 40)。
  // getter 返回 0~0.8 的比例值;入伤结算和 HUD 使用相同单位。
  get defense() {
    const basePct = Number(this.armorBaseDefensePct) || 0;
    const affixPct = Number(this.armorDefensePct) || 0;
    const ratio = (basePct + affixPct) / 100;
    return Math.max(0, Math.min(0.8, ratio));
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
  gunPoint(gp, gunDef = this.gunDef) {
    const g = gunDef || this.gunDef;
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

  suppressorSlot() {
    if (this.weapon === 'pistol') {
      const sidearmParts = Array.isArray(this.sidearmDef?.attachments) ? this.sidearmDef.attachments : [];
      return sidearmParts.some((id) => ['suppressor', 'glock_suppressor'].includes(id)) ? 'pistol' : null;
    }
    const g = this.gunDef || {};
    const name = String(g.basePreset || g.name || '');
    const attachments = Array.isArray(g.attachments) ? g.attachments : [];
    // 模块枪：只有实际安装了消音模块才启用该枪型的消音器开关。
    const installed = attachments.some((id) => ['suppressor', 'mp5_integral', 'awp_suppressor', 'glock_suppressor'].includes(id));
    if (installed) return name || 'custom-rifle';
    // 旧存档兼容：历史 MP5/AWP 仍可使用原来的消音器切换状态。
    return /MP5|SMG|冲锋|AWP|狙击|sniper/i.test(name) ? name : null;
  }

  isSuppressorOn() {
    const slot = this.suppressorSlot();
    return !!slot && this.suppressors?.[slot] === true;
  }

  toggleSuppressor() {
    const slot = this.suppressorSlot();
    if (!slot) {
      this.events.push({ type: 'suppressor', ok: false, on: false, weaponName: this.weapon === 'rifle' ? (this.gunDef?.name || '主武器') : '当前武器' });
      return false;
    }
    this.suppressors[slot] = !this.suppressors[slot];
    if (this.persistPlayerData) {
      try { localStorage.setItem('contra-suppressors', JSON.stringify(this.suppressors)); } catch { /* 忽略存储不可用 */ }
    }
    this.events.push({ type: 'suppressor', ok: true, on: this.suppressors[slot], slot, weaponName: slot === 'pistol' ? '手枪' : slot });
    return true;
  }

  setWeapon(w) {
    if (w === this.weapon) return;
    if (w === 'rifle' && this.shield) this.setShield(false); // 盾牌只能配手枪
    this.weapon = w;
    this.recoilT = 0;
    this.ammo = this.stats().mag; // 换枪满弹匣
    this.reloadT = 0;
    this.reloadTotalT = 0;
  }

  // ---- 防弹盾牌:举盾时只能用手枪;盾面挡敌方子弹,耐久打光会碎 ----
  setShield(on) {
    if (this.shield === on) return;
    this.shield = on;
    if (on) {
      // 碎过的盾重新架起时修好(盾耐久存在档里,不重置的话该存档的盾永久是 0)
      this.shieldHp = 100;
      if (this.persistPlayerData) {
        try { localStorage.setItem('contra-shield-hp', String(this.shieldHp)); } catch { /* 忽略 */ }
      }
    }
    if (on && this.weapon !== 'pistol') {
      this.weapon = 'pistol';
      this.recoilT = 0;
      this.ammo = this.stats().mag;
      this.reloadT = 0;
      this.reloadTotalT = 0;
    }
    if (this.persistPlayerData) {
      try { localStorage.setItem('contra-shield', on ? '1' : '0'); } catch { /* 忽略 */ }
    }
    this.events.push({ type: 'shield', on });
  }

  damageShield(dmg) {
    if (!this.shield || this.shieldHp <= 0) return false;
    this.shieldHp = Math.max(0, this.shieldHp - dmg);
    if (this.persistPlayerData) {
      try { localStorage.setItem('contra-shield-hp', String(this.shieldHp)); } catch { /* 忽略 */ }
    }
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

  // ---- 手雷(F):朝瞄准点抛出,冷却 3.2s;抛物线初速 = 距离定速 + 上抛补偿 ----
  // aim = 鼠标世界坐标(input.js 直传);近战/换弹中不拦(互不吞输入,手感优先)
  grenade(aim) {
    if (this.ragdoll || this.grenadeCd > 0) return false;
    const hand = this.armLF.getWorldPoint(Vec2(0, -D.foreArm.h / 2));
    let dx = (aim?.x ?? hand.x + this.facing * 5) - hand.x;
    let dy = (aim?.y ?? hand.y + 0.5) - hand.y;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    const sp = clamp(L * 1.9, 8, 15); // 近处轻抛远处全力,4~8m 都顺手
    this.grenadeCd = 3.2;
    this.throwT = 0.28;
    this.events.push({ type: 'grenade', x: hand.x, y: hand.y - 0.1, vx: dx * sp, vy: dy * sp + 3.4 });
    return true;
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

  // 沿世界 -y 检查脚下地面(站立时躯干中心离地约 0.8m)
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

  // Resolve the supporting ramp from authored endpoints rather than whichever overlapping
  // fixture Planck happens to report first. At a switchback landing, two ramps meet at the
  // same point; retain the prior vertical travel intent so reversing horizontal direction
  // selects the *next* flight instead of climbing back up the ramp we just descended.
  getStandingStairRampAngle(direction = 0, preferredVerticalSign = 0) {
    const p = this.torso.getPosition();
    let best = null;
    for (let body = this.world.getBodyList(); body; body = body.getNext()) {
      const data = body.getUserData?.();
      if (data?.type !== 'stairRamp'
          || !Number.isFinite(data.xStart) || !Number.isFinite(data.xEnd)
          || !Number.isFinite(data.lowerTop) || data.xStart === data.xEnd) continue;
      const minX = Math.min(data.xStart, data.xEnd);
      const maxX = Math.max(data.xStart, data.xEnd);
      if (p.x < minX - 0.36 || p.x > maxX + 0.36) continue;
      const t = (p.x - data.xStart) / (data.xEnd - data.xStart);
      const surfaceY = data.lowerTop + t * 3.5;
      const verticalGap = p.y - surfaceY;
      // A standing rig's torso center is roughly 0.7-0.9m above the stair surface.
      if (verticalGap < 0.18 || verticalGap > 1.25) continue;
      const angle = body.getAngle();
      const gapError = Math.abs(verticalGap - 0.78);
      const verticalIntent = direction === 0 ? 0 : Math.sign(direction * Math.tan(angle));
      const intentMatch = preferredVerticalSign !== 0 && verticalIntent === preferredVerticalSign;
      const score = gapError - (intentMatch ? 0.24 : 0);
      if (!best || score < best.score) best = { angle, score };
    }
    return best?.angle ?? null;
  }

  // 姿态目标:全部按"朝右"局部空间给出,施加时乘 facing
  poseTargets(input, speed) {
    const t = {
      torso: 0, neck: 0,
      hipF: 0.05, kneeF: -0.08, hipB: -0.05, kneeB: -0.12,
      shF: 0.15, elF: 0.55, shB: -0.2, elB: 0.5,
    };
    const ph = this.phase;

    if (this.roping) {
      // 绳降:双手举过头抓绳,双腿微屈绷紧(敌人滑降专用,主角不会进这个态)
      t.torso = 0; t.neck = 0.08;
      t.shF = 2.9;  t.elF = 0.06;
      t.shB = 2.75; t.elB = 0.12;
      t.hipF = 0.35; t.kneeF = -0.75;
      t.hipB = -0.2; t.kneeB = -0.55;
    } else if (this.crouch) {
      // 骑士跪:前腿踩地支撑(大腿抬平、小腿竖直),后腿膝跪地、小腿反折贴地;
      // 手臂不覆盖 —— 照常持枪/瞄准(用户指定:只改腿部)
      const br = Math.sin(this.t * 2.2) * 0.02;
      t.torso = -0.04 + br; t.neck = 0.1;
      t.hipF = 1.5;  t.kneeF = -1.45;
      t.hipB = -0.5; t.kneeB = -2.25;
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
    if (input.fire && !this.crouch && this.grounded === false) { t.shF = 1.48; t.elF = 0.1; }

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
    // 投雷挥臂:近臂从肩上向前下方甩(出手那一下要看得见)
    if (this.throwT > 0) {
      const k = Math.sin((1 - this.throwT / 0.28) * Math.PI);
      t.shF = 2.6 - 1.7 * k; t.elF = Math.max(0.05, 0.9 - 0.85 * k);
    }

    // 换弹动作:远侧手离开护木/枪身,伸向弹匣区域,停留一下后回到握点。
    // 用三段式动作曲线而不是随机摆臂,既可读又不会影响枪口/弹道方向。
    if (this.reloadT > 0 && this.reloadTotalT > 0 && !this.shield && !this.roping) {
      const p = clamp(1 - this.reloadT / this.reloadTotalT, 0, 1);
      const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
      const reach = p < 0.24 ? smooth(p / 0.24)
        : p < 0.72 ? 1
          : 1 - smooth((p - 0.72) / 0.28);
      t.shB = lerp(t.shB, this.weapon === 'rifle' ? 0.72 : 0.95, reach);
      t.elB = lerp(t.elB, this.weapon === 'rifle' ? 1.18 : 1.28, reach);
      t.torso += Math.sin(p * Math.PI) * 0.035;
    }
    return t;
  }

  servo(joint, target, kp, maxSpeed) {
    const err = target - joint.getJointAngle();
    joint.setMotorSpeed(clamp(err * kp, -maxSpeed, maxSpeed));
  }

  update(dt, input) {
    this.t += dt;
    // ★ 事件不在生产端清空:keydown 里直调 melee()/grenade() push 的事件发生在帧间,
    // 下一帧 update 开头清掉 = 静默丢失(近战伤害曾整条失效)。改由消费端(game.js)清。
    if (this.ragdoll) { this.updateCommon(dt); return; }

    const torso = this.torso;
    const v = torso.getLinearVelocity();

    // ---- 移动 ----
    this.wasGrounded = this.grounded;
    this.grounded = this.checkGrounded();
    // Stabilize only while supported by the raid's inclined ramp. On flat ground and in free
    // ragdoll motion, keep the original physics feel; this prevents the torso capsule rolling
    // sideways and becoming wedged on the uphill collision surface.
    const supportRampAngle = this.grounded ? this.getStandingStairRampAngle() : null;
    if (supportRampAngle !== null) {
      const angleError = wrapPi(torso.getAngle());
      const angularVelocity = torso.getAngularVelocity();
      torso.setAngularVelocity(clamp(-angleError * 7 - angularVelocity * 0.65, -5.5, 5.5));
    }
    this.coyote = this.grounded ? 0.1 : Math.max(0, this.coyote - dt);
    this.jumpBuf = input.jumpPressed ? 0.12 : Math.max(0, this.jumpBuf - dt);

    this.crouch = input.down && this.grounded;
    if (this.crouch !== this.crouched) this.applyCrouch(this.crouch);
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

    const stairRampAngle = this.grounded
      ? this.getStandingStairRampAngle(dir, this.lastStairVerticalSign)
      : null;
    const speed = (this.crouch ? 1.6 : 4.6) * (1 + (this.moveSpeedPct || 0) / 100);
    let targetVx = dir * speed;
    // 移动方向上有墙就不再硬塞速度,否则会和碰撞求解器打架,把角色弹飞
    if (dir !== 0) {
      const p = torso.getPosition();
      const self = this.selfSet || (this.selfSet = new Set(this.allBodies));
      let blocked = false;
      this.world.rayCast(p, Vec2(p.x + dir * 0.34, p.y), (fixture) => {
        const body = fixture.getBody();
        if (self.has(body)) return -1;
        // This probe only checks level geometry. NPCs, loose debris and other dynamic bodies
        // must not behave like invisible walls or prevent the operator from passing a stair landing.
        if (body.getType() !== 'static') return -1;
        // The horizontal probe intersects the side of an uphill stair ramp even though the ramp
        // is the walkable floor. Ignore that specially tagged inclined surface, but keep real walls.
        if (body.getUserData()?.type === 'stairRamp') return -1;
        blocked = true;
        return 0;
      });
      if (blocked) targetVx = 0;
    }
    const k = this.grounded ? 0.4 : 0.14;
    // Follow the ramp tangent while moving along the continuous stair collider. A horizontal-only
    // controller can press the torso capsule into an incline until collision resolution stalls it.
    const onRampAndMoving = stairRampAngle !== null && dir !== 0;
    const targetVy = onRampAndMoving
      ? clamp(targetVx * Math.tan(stairRampAngle), -7, 7)
      : v.y;
    if (onRampAndMoving && Math.abs(targetVy) > 0.35) {
      this.lastStairVerticalSign = Math.sign(targetVy);
    }
    // 速度限幅:即使被边角蹭到也不会被高速弹飞
    torso.setLinearVelocity(Vec2(
      clamp(lerp(v.x, targetVx, k), -9, 9),
      clamp(lerp(v.y, targetVy, onRampAndMoving ? k : 0), -22, 13)));
    const vy = torso.getLinearVelocity().y;

    // 落地检测(fallVy 归零前判断)
    const landed = this.grounded && !this.wasGrounded;
    if (landed && this.fallVy < -5) {
      const p = torso.getPosition();
      this.events.push({ type: 'land', x: p.x, y: p.y - 0.7, hard: this.fallVy < -12 });
    }
    if (this.grounded) this.fallVy = 0; else this.fallVy = Math.min(this.fallVy, vy);

    if (this.jumpBuf > 0 && this.coyote > 0 && !this.crouch && !sniper) {
      // 全身一起起跳(四肢通过关节拖拽会偷走躯干动量,单给躯干加速度跳不高)
      for (const b of this.allBodies) b.setLinearVelocity(Vec2(b.getLinearVelocity().x, 13));
      this.jumpBuf = 0; this.coyote = 0; this.grounded = false;
      this.events.push({ type: 'jump' });
    }

    // 跑步相位推进 + 脚步尘土
    const sp = Math.abs(torso.getLinearVelocity().x);
    if (this.grounded && sp > 0.5) {
      const prev = this.phase;
      // 跑动使用较自然的步频；蹲伏时步幅和落脚频率更慢，供潜行声音系统降低音量/警觉半径。
      this.phase += dt * (this.crouch ? (sp * 1.1 + 1.65) : (sp * 2.25 + 1.6));
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) {
        const p = torso.getPosition();
        this.events.push({ type: 'step', x: p.x + this.facing * 0.1, y: p.y - 0.78, stealth: this.crouch });
      }
    } else if (sp <= 0.5 && this.grounded) {
      this.phase = 0;
    }

    // ---- 开火 ----
    this.fireCd -= dt;
    this.recoilT = Math.max(0, this.recoilT - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.heat = Math.max(0, this.heat - dt * (0.35 + 0.4 * this.skill));
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        this.reloadTotalT = 0;
        this.ammo = this.stats().mag;
        this.events.push({ type: 'reloaded', weaponName: this.reloadWeaponName || (this.weapon === 'rifle' ? (this.gunDef?.customName || this.gunDef?.name || '自定义枪') : (this.sidearmDef?.customName || '手枪')) });
        this.reloadWeaponName = '';
      }
    }
    if (input.fire && this.fireCd <= 0 && this.reloadT <= 0 && this.meleeT <= 0) {
      const st = this.stats();
      const rifle = this.weapon === 'rifle';
      const gunDir = this.armLF.getWorldVector(Vec2(0, -1));
      const muzzle = rifle
        ? this.gunPoint(this.gunDef.muzzle)
        : this.gunPoint(this.sidearmDef?.muzzle || { x: 98, y: 18 }, this.sidearmDef);
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
          this.reload(); // 打空自动换弹,与 R 手动换弹共用同一动画/音效入口
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
            weapon: this.weapon, weaponName: rifle ? (this.gunDef?.name || '自定义枪') : '手枪', stats: st, parts, suppressed: this.isSuppressorOn(),
          });
          // 熟练度成长 + 后坐力热量积累(词条 recoil 缩放);localStorage 每 10 发存一次(同步 IO 别太频)
          this.heat = Math.min(1, this.heat + 0.26 * st.recoil * (1.25 - 0.5 * this.skill) * (this.gunMods?.heatMul || 1));
          this.skill = Math.min(1, this.skill + 0.006);
          this._shotN = (this._shotN || 0) + 1;
          if (this.persistPlayerData && this._shotN % 10 === 0) {
            try { localStorage.setItem('contra-skill', String(this.skill)); } catch { /* 忽略 */ }
          }
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
        // 持枪手保持枪把握点;换弹时远手暂时脱离前握点做弹匣操作。
        this.ikArm(this.j.shF, this.j.elF, S, this.gunPoint(this.gunDef.grips.rear), kpArm, mirror);
        if (this.reloadT > 0) {
          this.servo(this.j.shB, fc * cur.shB, kp, maxW);
          this.servo(this.j.elB, fc * cur.elB, kp, maxW);
        } else {
          this.ikArm(this.j.shB, this.j.elB, S, this.gunPoint(this.gunDef.grips.front), kpArm - 1, mirror);
        }
      } else {
        // 未瞄准:枪垂在身前;换弹阶段远手同样离开护木,结束后恢复 IK 握点。
        this.servo(this.j.shF, fc * cur.shF, kp, maxW);
        this.servo(this.j.elF, fc * cur.elF, kp, maxW);
        if (this.reloadT > 0) {
          this.servo(this.j.shB, fc * cur.shB, kp, maxW);
          this.servo(this.j.elB, fc * cur.elB, kp, maxW);
        } else {
          this.ikArm(this.j.shB, this.j.elB, S, this.gunPoint(this.gunDef.grips.front), kpArm - 1, mirror);
        }
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

    // 躯干直立 PD(下蹲时目标角带一点前倾)。
    // 全身胶囊的转动惯量比小方块大一个量级,参数相应加大
    const errA = fc * cur.torso - torso.getAngle();
    const w = torso.getAngularVelocity();
    torso.applyTorque(clamp(110 * errA - 9 * w, -90, 90));

    this.updateCommon(dt);
  }

  updateCommon(dt) {
    const p = this.torso.getPosition();
    if (p.y < -8) { this.events.push({ type: 'fell' }); return; }
    // 卡地保险丝:从躯干中心正下方 ray 0.5m,命中距离 < 0.1 = 真卡进地形,0.5s 复位。
    // 旧实现 groundYAt(x, p.y+0.5) 会把"头顶 0.8m 内的台阶/平台顶"误当地表 ——
    // 从矮台阶旁走过(x≈26 顶面 1.0 的地块)就被判沉地,0.5s 后莫名传送回重生点(用户实测毙过)
    let hitD = Infinity;
    const self = this.selfSet || (this.selfSet = new Set(this.allBodies));
    this.world.rayCast(p, Vec2(p.x, p.y - 0.5), (fixture, _pt, _n, fr) => {
      if (self.has(fixture.getBody())) return -1;
      hitD = Math.min(hitD, fr * 0.5);
      return fr;
    });
    if (hitD < 0.1) {
      this.sunkT = (this.sunkT || 0) + dt;
      if (this.sunkT > 0.5) { this.sunkT = 0; this.events.push({ type: 'fell' }); }
    } else {
      this.sunkT = 0;
    }
    // 阵亡尸体静置休眠:残肢在 tile 接缝上会被静态块夹住永抖,速度近零持续 0.45s
    // (或死亡后 1.4s 兜底)→ 全身 setActive(false) 定格;R 键测试布娃娃不受影响
    if (this.ragdoll && this.deadCorpse && !this.settled) {
      this.deadT = (this.deadT || 0) + dt;
      let still = true;
      for (const b of this.allBodies) {
        const v = b.getLinearVelocity();
        if (v.x * v.x + v.y * v.y > 0.09 || Math.abs(b.getAngularVelocity()) > 0.35) { still = false; break; }
      }
      this.restT = still ? (this.restT || 0) + dt : 0;
      if (this.restT > 0.45 || (this.deadT || 0) > 1.4) {
        this.settled = true;
        for (const b of this.allBodies) {
          b.setLinearVelocity(Vec2(0, 0));
          b.setAngularVelocity(0);
          b.setActive(false);
        }
      }
    }
  }

  muzzle() {
    if (this.weapon === 'rifle') {
      const m = this.gunPoint(this.gunDef.muzzle);
      const gd = this.armLF.getWorldVector(Vec2(0, -1));
      return { x: m.x, y: m.y, dx: gd.x, dy: gd.y };
    }
    const m = this.gunPoint(this.sidearmDef?.muzzle || { x: 98, y: 18 }, this.sidearmDef);
    return { x: m.x, y: m.y, dx: Math.cos(this.gunAngle), dy: Math.sin(this.gunAngle) };
  }

  // ---- 绘制(世界坐标 -> 屏幕由 w2s 提供,ppm 为像素/米)----
  draw(ctx, w2s, ppm, time) {
    if (this.persistPlayerData && this.useAppearance && this._appearanceRevision !== appearanceRevision()) {
      this.appearance = loadAppearance();
      this.C = { ...COLOR, ...appearancePalette(this.appearance) };
      this._appearanceRevision = appearanceRevision();
    }
    const P = (b) => w2s(b.getPosition().x, b.getPosition().y);
    const R = (b) => -b.getAngle(); // 屏幕 y 翻转,角度取反

    const cap = (b, d, color, wGrow = 0) => {
      const [x, y] = P(b);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(R(b));
      const w = (d.w + wGrow) * ppm, h = d.h * ppm;
      const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      grad.addColorStop(0, shadeKit(color, 0.58));
      grad.addColorStop(0.16, shadeKit(color, 0.82));
      grad.addColorStop(0.46, color);
      grad.addColorStop(0.73, shadeKit(color, 1.12));
      grad.addColorStop(1, shadeKit(color, 0.66));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) / 2 * 0.32);
      ctx.fill();
      ctx.strokeStyle = 'rgba(5,10,16,0.62)';
      ctx.lineWidth = Math.max(0.65, Math.min(1.4, ppm * 0.018));
      ctx.stroke();
      // Short seam at the proximal end; remains attached when the physics joint swings.
      ctx.strokeStyle = 'rgba(226,236,239,0.15)';
      ctx.lineWidth = Math.max(0.5, Math.min(1, ppm * 0.012));
      ctx.beginPath(); ctx.moveTo(-w * 0.28, -h * 0.30); ctx.lineTo(w * 0.28, -h * 0.30); ctx.stroke();
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

    const armorPad = (b, d, kind) => {
      if (!this.appearance) return;
      const allowed = this.appearance.pads === 'full'
        || (kind === 'knee' && this.appearance.pads === 'knees');
      if (!allowed) return;
      const [x,y]=P(b);ctx.save();ctx.translate(x,y);ctx.rotate(R(b));
      // Pads are anchored close to the anatomical joint, rather than floating at segment centers.
      if(kind==='shoulder')ctx.translate(0,-d.h*ppm*.29);
      else if(kind==='elbow')ctx.translate(0,d.h*ppm*.36);
      else if(kind==='knee')ctx.translate(0,d.h*ppm*.40);
      const widthFactor = kind==='shoulder'?1.08:kind==='elbow'?.88:.82;
      const heightFactor = kind==='shoulder'?.42:kind==='elbow'?.30:.28;
      const w=d.w*ppm*widthFactor,h=d.h*ppm*heightFactor,ac=this.appearance.armorColor||'#263744';
      const grad=ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);
      grad.addColorStop(0,shadeKit(ac,.62));grad.addColorStop(.38,shadeKit(ac,1.32));grad.addColorStop(1,shadeKit(ac,.74));
      ctx.fillStyle=grad;ctx.strokeStyle='#080f16';ctx.lineWidth=Math.max(1,Math.min(1.6,ppm*.024));
      ctx.beginPath();ctx.roundRect(-w/2,-h/2,w,h,Math.min(w,h)*.30);ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(231,239,242,.25)';ctx.lineWidth=Math.max(.5,Math.min(1,ppm*.014));
      ctx.beginPath();ctx.moveTo(-w*.28,-h*.18);ctx.lineTo(w*.28,-h*.18);ctx.stroke();
      ctx.strokeStyle=this.appearance.accentColor||'#ffb34d';ctx.lineWidth=Math.max(.7,Math.min(1.2,ppm*.019));
      ctx.beginPath();ctx.moveTo(-w*.24,h*.15);ctx.lineTo(w*.24,h*.15);ctx.stroke();ctx.restore();
    };
    const hand = (fb) => {
      const [x, y] = P(fb);
      ctx.save(); ctx.translate(x, y); ctx.rotate(R(fb));
      const gy = D.foreArm.h * 0.5 * ppm;
      const glove = this.appearance?.armorColor ? shadeKit(this.appearance.armorColor, 0.70) : '#202831';
      const gw = Math.max(4.8, Math.min(7.5, ppm * 0.14));
      const gh = Math.max(4, Math.min(6.5, ppm * 0.12));
      ctx.fillStyle = glove; ctx.strokeStyle = '#080e14';
      ctx.lineWidth = Math.max(0.65, Math.min(1.1, ppm * 0.016));
      ctx.beginPath(); ctx.roundRect(-gw / 2, gy - gh * 0.50, gw, gh, Math.min(2, gh * .25)); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(224,233,237,.27)'; ctx.lineWidth = Math.max(.5, Math.min(.9, ppm * .011));
      ctx.beginPath(); ctx.moveTo(-gw*.20,gy-gh*.10);ctx.lineTo(gw*.20,gy-gh*.10);ctx.stroke();
      ctx.restore();
    };

    // Cosmetic kit components are painted directly in each live bone's local Canvas2D space.

    // 装备:在对应身体部件的局部空间里绘制(纸娃娃挂点式)
    // parts 支持两种零件:矩形 {x,y,w,h,color,r} / 图片 {img:素材id,x,y,w,h,rot}
    const assetImgs = new Map(); // 素材图缓存(id -> HTMLImageElement)
    const assetImage = (id) => {
      if (assetImgs.has(id)) return assetImgs.get(id);
      // 装备素材库是玩家自定义数据;NPC 不读取它,避免外观被玩家工坊内容污染。
      const src = this.persistPlayerData ? loadAssets()[id] : null;
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
            // New payloads store top-left; legacy studio image payloads stored center x/y.
            // Resolve through one shared helper so existing player equipment stays aligned.
            const pivot = equipmentPartCenter(eq, p);
            ctx.translate(pivot.x, pivot.y);
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
        // 换弹可视化:非霰弹枪在中段暂时露出空弹匣井,弹匣离膛后下移再插回。
        // 使用设计坐标锚定在前后握点之间,预设枪和大多数自制枪都能自然对齐。
        if (this.reloadT > 0 && this.reloadTotalT > 0 && g.name !== '霰弹枪') {
          const rp = clamp(1 - this.reloadT / this.reloadTotalT, 0, 1);
          if (rp >= 0.2 && rp <= 0.79) {
            const eject = rp < 0.38 ? (rp - 0.2) / 0.18 : rp < 0.58 ? 1 : (0.79 - rp) / 0.21;
            const span = Math.max(1, g.grips.front.x - g.grips.rear.x);
            const mx = span * 0.35;
            const my = g.name === 'AWP' ? 0 : g.name === 'M4A1' ? 5 : 7;
            const mw = Math.max(8, Math.min(15, span * 0.22));
            const mh = Math.max(13, Math.min(22, mw * 1.38));
            ctx.fillStyle = 'rgba(9,13,20,0.96)';
            ctx.fillRect(mx - mw * 0.46, my - mh * 0.25, mw * 0.94, mh * 0.92);
            ctx.strokeStyle = 'rgba(255,177,74,0.58)';
            ctx.lineWidth = 1 / k;
            ctx.strokeRect(mx - mw * 0.46, my - mh * 0.25, mw * 0.94, mh * 0.92);
            ctx.save();
            ctx.translate(mx, my + mh * 0.42 + eject * 15);
            ctx.rotate((this.gunMirrored ? -1 : 1) * eject * 0.22);
            ctx.fillStyle = '#424b58';
            ctx.fillRect(-mw * 0.42, -mh * 0.22, mw * 0.84, mh * 0.9);
            ctx.fillStyle = '#69798c';
            ctx.fillRect(-mw * 0.32, -mh * 0.16, mw * 0.64, 2 / k);
            ctx.strokeStyle = 'rgba(4,7,12,0.95)';
            ctx.lineWidth = 1 / k;
            ctx.strokeRect(-mw * 0.42, -mh * 0.22, mw * 0.84, mh * 0.9);
            ctx.restore();
          }
        }
        ctx.restore();
        return;
      }
      // 副武器：与主武器共享同一种侧视蓝图绘制，配件/涂装会在游戏内真实显示。
      const g = this.sidearmDef || GUN_PRESETS['Glock 17'];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-this.gunAngle);
      const k = ppm / (g.meterScale || 200);
      ctx.scale(k, k);
      if (this.gunMirrored) ctx.scale(1, -1);
      ctx.translate(-g.grips.rear.x, -g.grips.rear.y);
      const rp = this.reloadT > 0 && this.reloadTotalT > 0
        ? clamp(1 - this.reloadT / this.reloadTotalT, 0, 1) : 0;
      for (const part of (g.parts || [])) {
        ctx.save();
        if (part.component === 'magazine' && rp >= 0.24 && rp <= 0.78) {
          const detach = rp < 0.4 ? (rp - 0.24) / 0.16 : rp < 0.58 ? 1 : (0.78 - rp) / 0.20;
          ctx.translate(0, detach * 13);
          ctx.rotate((this.gunMirrored ? -1 : 1) * detach * 0.12);
        }
        ctx.fillStyle = part.color || '#394451';
        ctx.beginPath(); ctx.roundRect(part.x, part.y, part.w, part.h, Math.min(3, part.h / 2)); ctx.fill();
        ctx.strokeStyle = part.attachmentId ? 'rgba(255,177,74,.8)' : 'rgba(15,12,8,.55)';
        ctx.lineWidth = Math.max(0.7, 1.3 / k); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    };

    // 远侧肢体(暗色)→ 躯干 → 头 → 近侧腿 → 枪 → 近侧臂
    cap(this.armUB, D.upperArm, this.C.shirtDark || this.C.skinDark);
    armorPad(this.armUB,D.upperArm,'shoulder');
    armorPad(this.armUB,D.upperArm,'elbow');
    cap(this.armLB, D.foreArm, this.C.shirtDark || this.C.shirt || this.C.skinDark);
    hand(this.armLB);
    boot(this.legLB, this.C.pantsDark, this.C.bootDark);
    cap(this.legUB, D.thigh, this.C.pantsDark);
    armorPad(this.legUB,D.thigh,'knee');

    // Backpack is attached behind the torso pivot, not a screen-space decoration.
    if (this.appearance && this.appearance.backpack && this.appearance.backpack !== 'none') {
      // In the side-view game the pack must read as a narrow rear-mounted object,
      // not a second torso. A small overlap at the rear edge keeps it attached while
      // leaving the front armor plate and belt unobscured.
      const [bx,by]=P(this.torso);
      const bw=(this.appearance.backpack==='radio'?.12:.16)*ppm;
      const bh=(this.appearance.backpack==='radio'?.34:.40)*ppm;
      ctx.save();ctx.translate(bx,by);ctx.rotate(R(this.torso));
      ctx.translate(-this.facing*(D.torso.w*.50*ppm+bw*.24),-.03*ppm);
      const pack= this.appearance.armorColor||'#263744';
      ctx.fillStyle=shadeKit(pack,.58);ctx.strokeStyle='#080e14';ctx.lineWidth=Math.max(.8,Math.min(1.3,ppm*.022));
      ctx.beginPath();ctx.roundRect(-bw/2,-bh/2,bw,bh,bw*.14);ctx.fill();ctx.stroke();
      ctx.fillStyle=shadeKit(pack,1.18);ctx.beginPath();ctx.roundRect(-bw*.32,-bh*.34,bw*.64,bh*.27,bw*.08);ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(228,237,240,.22)';ctx.lineWidth=Math.max(.5,Math.min(.9,ppm*.013));
      ctx.beginPath();ctx.moveTo(-bw*.25,-bh*.22);ctx.lineTo(-bw*.25,bh*.30);ctx.moveTo(bw*.25,-bh*.22);ctx.lineTo(bw*.25,bh*.30);ctx.stroke();
      if(this.appearance.backpack==='radio'){
        ctx.fillStyle='#4d5e67';ctx.fillRect(-bw*.10,-bh*.62,bw*.20,bh*.38);
        ctx.strokeStyle=this.appearance.accentColor||'#ffb34d';ctx.lineWidth=Math.max(.6,ppm*.012);
        ctx.beginPath();ctx.moveTo(0,-bh*.58);ctx.lineTo(bw*.25,-bh*.88);ctx.stroke();
      }
      ctx.restore();
    }
    // 躯干基底与模块化载具：始终锚定 torso 刚体局部空间
    {
      const [x, y] = P(this.torso);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(R(this.torso));
      {
        // 基础作战服与接缝细节
        const w = D.torso.w * ppm, h = D.torso.h * ppm;
        ctx.fillStyle = this.C.shirt || this.C.skin;
        ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.42); ctx.fill();
        ctx.strokeStyle = 'rgba(15,22,30,0.78)'; ctx.lineWidth = Math.max(1.5, ppm * 0.055);
        ctx.beginPath(); ctx.moveTo(-w * 0.36, -h * 0.28); ctx.lineTo(w * 0.34, h * 0.08); ctx.stroke();
        ctx.strokeStyle = 'rgba(222,232,236,0.13)'; ctx.lineWidth = Math.max(0.7, ppm * 0.018);
        ctx.beginPath(); ctx.moveTo(-w * 0.28, -h * 0.36); ctx.lineTo(-w * 0.22, h * 0.25); ctx.moveTo(w * 0.28, -h * 0.34); ctx.lineTo(w * 0.21, h * 0.25); ctx.stroke();
        ctx.fillStyle = this.C.shirtDark || '#263747';
        ctx.fillRect(-w / 2, h * 0.32, w, h * 0.12);
      }

      // When a visual kit is selected, do not double-stack the old editor's armor mesh.
      // The real loadout remains intact for defense/durability; only its legacy appearance is suppressed.
      if (!this.appearance && this.loadout.torso) drawEquip(this.loadout.torso);
      // Anatomy-locked modular carrier: procedural plates, webbing and pouches follow the torso joint.
      if (this.appearance) {
        const a=this.appearance,w=D.torso.w*ppm,h=D.torso.h*ppm,armor=a.armorColor||'#263744',accent=a.accentColor||'#ffb34d';
        const hi=shadeKit(armor,1.35),lo=shadeKit(armor,.58);
        if(a.kitStyle!=='slick'){
          ctx.fillStyle=lo;ctx.strokeStyle='#0a1118';ctx.lineWidth=1.5;ctx.beginPath();
          if(a.kitStyle==='chest'){ctx.moveTo(-w*.43,-h*.22);ctx.lineTo(-w*.34,h*.36);ctx.lineTo(w*.32,h*.36);ctx.lineTo(w*.43,-h*.22);ctx.lineTo(w*.28,-h*.38);ctx.lineTo(-w*.28,-h*.38);}
          else{ctx.moveTo(-w*.40,-h*.27);ctx.lineTo(-w*.34,h*.34);ctx.lineTo(-w*.23,h*.43);ctx.lineTo(w*.23,h*.43);ctx.lineTo(w*.34,h*.34);ctx.lineTo(w*.40,-h*.27);ctx.lineTo(w*.23,-h*.40);ctx.lineTo(-w*.23,-h*.40);}
          ctx.closePath();ctx.fill();ctx.stroke();
          ctx.fillStyle=armor;ctx.beginPath();ctx.roundRect(-w*.28,-h*.35,w*.56,h*.66,w*.08);ctx.fill();
          ctx.strokeStyle='rgba(235,243,246,.18)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-w*.27,-h*.31);ctx.lineTo(-w*.27,h*.27);ctx.moveTo(w*.27,-h*.31);ctx.lineTo(w*.27,h*.27);ctx.stroke();
          ctx.fillStyle=hi;ctx.beginPath();ctx.roundRect(-w*.17,-h*.25,w*.34,h*.12,w*.025);ctx.fill();ctx.strokeStyle='#101923';ctx.stroke();
          ctx.fillStyle=accent;ctx.fillRect(-w*.11,-h*.21,w*.10,Math.max(1.5,ppm*.012));
          ctx.fillStyle='#dbe4e7';ctx.font='bold '+Math.max(5,ppm*.075)+'px sans-serif';ctx.fillText('H-01',-w*.01,-h*.16);
          const n=a.kitStyle==='plate'?3:4;
          for(let i=0;i<n;i++){const px=-w*.31+i*w*(a.kitStyle==='plate'?.21:.22);ctx.fillStyle=lo;ctx.beginPath();ctx.roundRect(px,-h*.06,w*.19,h*.22,w*.025);ctx.fill();ctx.strokeStyle='#0a1118';ctx.stroke();ctx.fillStyle=hi;ctx.fillRect(px+w*.04,-h*.015,w*.11,Math.max(1,ppm*.012));if(a.kitStyle==='plate'){ctx.fillStyle=accent;ctx.fillRect(px+w*.03,h*.13,w*.13,Math.max(1,ppm*.018));}}
          ctx.strokeStyle=hi;ctx.lineWidth=Math.max(1.2,ppm*.025);ctx.beginPath();ctx.moveTo(-w*.37,h*.26);ctx.lineTo(-w*.27,h*.31);ctx.moveTo(w*.37,h*.26);ctx.lineTo(w*.27,h*.31);ctx.stroke();
        }
        ctx.fillStyle=lo;ctx.fillRect(-w*.48,h*.31,w*.96,h*.12);ctx.strokeStyle='#080e14';ctx.lineWidth=1;ctx.strokeRect(-w*.48,h*.31,w*.96,h*.12);
        ctx.fillStyle=hi;ctx.beginPath();ctx.roundRect(-w*.09,h*.315,w*.18,h*.10,2);ctx.fill();ctx.strokeStyle='#0a1118';ctx.stroke();ctx.fillStyle=accent;ctx.fillRect(-w*.025,h*.34,w*.05,Math.max(1,ppm*.012));
      }
      // The real inventory armor was rendered underneath the cosmetic carrier.
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

    // 头部与装饰：程序化头型、头发、护目镜与头盔都锚定 head 刚体
    {
      const [x, y] = P(this.head);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(R(this.head));
      {
        const r = D.headR * ppm;
        // 脖子(随头旋转,始终连接头与颈关节锚点;画在身体 -y 方向,朝向躯干)
        ctx.strokeStyle = this.C.skin; ctx.lineWidth = 0.078 * ppm; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0.03 * ppm);
        ctx.lineTo(0, 0.19 * ppm);
        ctx.stroke();
        const look = this.appearance || { hairStyle: 'short', hairColor: '#202733', faceShape: 'round', eyeColor: '#222222', headwear: 'bandana' };
        const backX = -this.facing;
        // 长发/马尾/丸子头位于脸后方绘制，但始终锚定物理头部，转身时不会脱节。
        ctx.fillStyle = look.hairColor || '#202733';
        if (look.hairStyle === 'long') {
          ctx.beginPath(); ctx.moveTo(backX * r * 0.38, -r * 0.62); ctx.quadraticCurveTo(backX * r * 1.18, -r * 0.12, backX * r * 0.96, r * 1.20); ctx.quadraticCurveTo(backX * r * 0.44, r * 1.28, backX * r * 0.34, r * 0.42); ctx.closePath(); ctx.fill();
        } else if (look.hairStyle === 'ponytail') {
          ctx.beginPath(); ctx.ellipse(backX * r * 1.08, -r * 0.12, r * 0.28, r * 0.74, backX * -0.23, 0, Math.PI * 2); ctx.fill();
        } else if (look.hairStyle === 'bun') {
          ctx.beginPath(); ctx.arc(backX * r * 0.54, -r * 0.72, r * 0.30, 0, Math.PI * 2); ctx.fill();
        }
        // 脸型是纯视觉形状；Planck 物理头仍使用原来的圆形碰撞体。
        ctx.fillStyle = this.C.skin;
        ctx.beginPath();
        if (look.faceShape === 'angular') {
          ctx.moveTo(-r * 0.78, -r * 0.42); ctx.quadraticCurveTo(0, -r * 1.12, r * 0.78, -r * 0.42);
          ctx.lineTo(r * 0.68, r * 0.30); ctx.lineTo(r * 0.18, r * 0.92); ctx.quadraticCurveTo(0, r * 1.05, -r * 0.22, r * 0.82); ctx.lineTo(-r * 0.74, r * 0.26); ctx.closePath(); ctx.fill();
        } else if (look.faceShape === 'oval') {
          ctx.ellipse(0, 0, r * 0.86, r * 1.02, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        }
        // 短发/寸头/侧剃/刺发等均是程序绘制，没有贴图依赖。
        ctx.fillStyle = look.hairColor || '#202733';
        if (look.hairStyle === 'spiky') {
          ctx.beginPath(); ctx.moveTo(-r * 0.94, -r * 0.30); ctx.lineTo(-r * 0.68, -r * 0.98); ctx.lineTo(-r * 0.30, -r * 0.66); ctx.lineTo(r * 0.08, -r * 1.10); ctx.lineTo(r * 0.35, -r * 0.64); ctx.lineTo(r * 0.72, -r * 0.90); ctx.lineTo(r * 0.97, -r * 0.18); ctx.quadraticCurveTo(0, -r * 0.62, -r * 0.94, -r * 0.30); ctx.closePath(); ctx.fill();
        } else if (look.hairStyle === 'buzz') {
          ctx.beginPath(); ctx.ellipse(0, -r * 0.38, r * 0.92, r * 0.48, 0, Math.PI, Math.PI * 2); ctx.fill();
        } else {
          ctx.beginPath(); ctx.moveTo(-r, -r * 0.02); ctx.quadraticCurveTo(-r * 0.9, -r * 1.05, 0, -r * 0.98); ctx.quadraticCurveTo(r * 0.92, -r * 0.98, r, -r * 0.05); ctx.quadraticCurveTo(r * 0.35, -r * 0.44, -r, -r * 0.02); ctx.closePath(); ctx.fill();
          if (look.hairStyle === 'undercut') { ctx.fillStyle = this.C.skinDark; ctx.fillRect(backX * r * 0.68 - r * 0.10, -r * 0.10, r * 0.20, r * 0.53); }
        }
        if (look.hairStyle === 'bun') { ctx.fillStyle = look.hairColor || '#202733'; ctx.beginPath(); ctx.arc(-this.facing * r * 0.46, -r * 0.78, r * 0.22, 0, Math.PI * 2); ctx.fill(); }
        // 头带 / 通讯耳机由选项控制；不影响真正装备槽里的头盔属性。
        // A full helmet hides the bandana; never let an old tail poke through the shell.
        if (look.headwear === 'bandana' && (!this.appearance || this.appearance.helmetStyle === 'none')) {
          ctx.fillStyle = this.C.bandana; ctx.beginPath();
          ctx.roundRect(-r * 0.98, -r * 0.54, r * 1.96, r * 0.28, [r * 0.2, r * 0.2, r * 0.08, r * 0.08]); ctx.fill();
          const flap = Math.sin(time * 8) * 1.7;
          ctx.strokeStyle = this.C.bandana; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-this.facing * r * 0.78, -r * 0.40); ctx.quadraticCurveTo(-this.facing * r * 1.55, -r * 0.55 + flap, -this.facing * r * 2.0, -r * 0.12 + flap); ctx.stroke();
        } else if (look.headwear === 'headset') {
          ctx.fillStyle = '#252e39'; ctx.beginPath(); ctx.arc(-this.facing * r * 0.78, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = this.C.accent || '#d99447'; ctx.fillRect(-this.facing * r * 0.92 - 1, -1, 4, 3);
        }
        // Keep the true armor data for stats, but avoid drawing the legacy helmet beneath the new shell.
        if (!this.appearance && this.loadout.head) drawEquip(this.loadout.head);
        // Modular helmet and eyewear are procedural parts attached to the live head transform.
        if(this.appearance&&this.appearance.helmetStyle&&this.appearance.helmetStyle!=='none'){
          const hs=this.appearance.helmetStyle,ac=this.appearance.armorColor||'#263744',hi=shadeKit(ac,1.35);
          ctx.fillStyle=ac;ctx.strokeStyle='#0a1118';ctx.lineWidth=Math.max(1.1,r*.12);ctx.beginPath();
          if(hs==='cap'){ctx.moveTo(-r*.92,-r*.2);ctx.quadraticCurveTo(-r*.72,-r*1.12,r*.1,-r*1.05);ctx.quadraticCurveTo(r*.83,-r*.96,r*.95,-r*.18);ctx.lineTo(r*.55,-r*.12);ctx.lineTo(-r*.65,-r*.1);}
          else{ctx.moveTo(-r*.98,-r*.08);ctx.lineTo(-r*.85,-r*.66);ctx.quadraticCurveTo(-r*.35,-r*1.18,r*.35,-r*.98);ctx.quadraticCurveTo(r*.91,-r*.75,r*.92,-r*.1);ctx.lineTo(r*.58,-r*.02);ctx.lineTo(-r*.72,-r*.02);}
          ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(240,246,248,.24)';ctx.lineWidth=Math.max(.8,r*.06);ctx.beginPath();ctx.moveTo(-r*.62,-r*.68);ctx.quadraticCurveTo(0,-r*.96,r*.56,-r*.63);ctx.stroke();
          if(hs!=='cap'){ctx.fillStyle=hi;ctx.beginPath();ctx.roundRect(-r*.98,-r*.18,r*.35,r*.55,r*.12);ctx.fill();ctx.stroke();ctx.beginPath();ctx.roundRect(r*.60,-r*.18,r*.35,r*.55,r*.12);ctx.fill();ctx.stroke();}
        }
        // 侧视只显一只眼：白色眼白 + 可配置虹膜 + 瞳孔，尺寸随屏幕缩放而收敛。
        const ex = this.facing * r * 0.43, ey = r * 0.08;
        ctx.fillStyle = '#f5f0e8'; ctx.beginPath(); ctx.ellipse(ex, ey, Math.max(1.25, r * 0.22), Math.max(1.05, r * 0.15), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = look.eyeColor || '#222222'; ctx.beginPath(); ctx.arc(ex + this.facing * r * 0.045, ey, Math.max(0.85, r * 0.105), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b1018'; ctx.beginPath(); ctx.arc(ex + this.facing * r * 0.06, ey, Math.max(0.55, r * 0.06), 0, Math.PI * 2); ctx.fill();
        // Draw the lenses last so that the eye is visibly behind the tactical eyewear.
        if (this.appearance?.eyewear && this.appearance.eyewear !== 'none') {
          const clear = this.appearance.eyewear === 'clear';
          const gx = this.facing * r * 0.36, gy = r * 0.055;
          const gw = r * 0.72, gh = r * 0.30;
          ctx.fillStyle = clear ? 'rgba(171,215,224,0.56)' : '#243b48';
          ctx.strokeStyle = '#0a1118'; ctx.lineWidth = Math.max(0.8, r * 0.07);
          ctx.beginPath(); ctx.roundRect(gx - gw / 2, gy - gh / 2, gw, gh, gh * 0.24); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = this.appearance.accentColor || '#ffb34d';
          ctx.lineWidth = Math.max(0.6, r * 0.045);
          ctx.beginPath(); ctx.moveTo(gx - gw * 0.31, gy - gh * 0.10); ctx.lineTo(gx + gw * 0.31, gy - gh * 0.10); ctx.stroke();
          ctx.strokeStyle = 'rgba(231,239,242,0.30)'; ctx.lineWidth = Math.max(0.5, r * 0.035);
          ctx.beginPath(); ctx.moveTo(gx - gw * 0.23, gy + gh * 0.20); ctx.lineTo(gx + gw * 0.20, gy + gh * 0.20); ctx.stroke();
        }
      }
      // The real inventory helmet was rendered underneath the cosmetic shell.
      ctx.restore();
    }

    boot(this.legLF, this.C.pants, this.C.boot);
    cap(this.legUF, D.thigh, this.C.pants);
    armorPad(this.legUF,D.thigh,'knee');
    gun();
    cap(this.armUF, D.upperArm, this.C.shirt || this.C.skin);
    armorPad(this.armUF,D.upperArm,'shoulder');
    armorPad(this.armUF,D.upperArm,'elbow');
    cap(this.armLF, D.foreArm, this.C.shirtDark || this.C.shirt || this.C.skin);
    hand(this.armLF);

    // 轻量战术换弹指示:在操作员头部上方显示渐进式进度,不使用 DOM/滤镜动画。
    if (this.reloadT > 0 && this.reloadTotalT > 0) {
      const [rx, ry] = P(this.head);
      const progress = clamp(1 - this.reloadT / this.reloadTotalT, 0, 1);
      const bw = 70 * (ppm / 52), bh = Math.max(3, 3.5 * (ppm / 52));
      const by = ry - 24 * (ppm / 52);
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = 'rgba(5,10,18,0.78)';
      ctx.fillRect(rx - bw / 2, by, bw, bh + 10 * (ppm / 52));
      ctx.strokeStyle = 'rgba(255,177,74,0.72)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx - bw / 2, by, bw, bh + 10 * (ppm / 52));
      ctx.fillStyle = '#ffb14a';
      ctx.fillRect(rx - bw / 2 + 2, by + 2, (bw - 4) * progress, Math.max(1, bh - 1));
      ctx.fillStyle = '#ffe4b4';
      ctx.font = `700 ${Math.max(8, 9 * (ppm / 52))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('RELOADING', rx, by + 9 * (ppm / 52));
      ctx.restore();
    }
  }
}
