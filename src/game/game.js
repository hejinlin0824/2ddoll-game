// 魂斗罗风格 2D 布娃娃射击 —— 主循环
import { World, Vec2 } from 'planck';
import { LEVEL, buildLevel, groundYAt, drawSky, drawParallax, drawTerrain, drawForeground } from './world/level.js';
import { Player } from './entities/player.js';
import { loadSavedGun, EQUIP_PRESETS, QUALITY } from './domain/gunPresets.js';
import { computeArmorMods, computeGunMods, itemTitle, AFFIX_BY_ID, loadGunAffixes } from './domain/affixes.js';
import { WeaponWheel } from './ui/wheel.js';
import { Dummy } from './entities/enemies.js';
import { WaveDirector } from './domain/waves.js';
import { invLoad, invEquipped, invIsFull, invAddCoins } from './domain/inventory.js';
import { bpInit, bpToggle, bpIsOpen, bpClose, bpWire, bpSetGunInfo } from './ui/backpack.js';
import { corpseInit, corpseIsOpen, openCorpse, closeCorpse } from './ui/corpse.js';
import { menuInit, menuIsOpen, menuShow, menuToggle, helpIsOpen, helpClose } from './ui/menu.js';
import { initAudio, beep, gunSynth, noiseBurst, setMuffle, getActx } from './systems/audio.js';
import { updateStatusPanel, streakShow, streakHide, lootToast } from './systems/hud.js';
import { feel, addTrauma, hitStop, killSlow, addStreak, resetStreak, tickFeel } from './systems/feel.js';
import { input, mouse, attachInput, bindCamera } from './systems/input.js';
import { cam, w2s, makeW2S, aimWorld, updateCamera, camKick, clamp, lerp } from './systems/camera.js';
import { bullets, spawnBullet, castRay, alertEnemiesNear, applyHitscanDamage, stepBullets, onEnemyDied, stepPickups } from './systems/combat.js';
import { particles, beams, debris, decals, floaters, flash, burst, spawnHelmetDebris, spawnVestDebris, addDecal, gibBurst, stepFx, decayTimers, setGhost, setHitFlash, ghostT, hitFlashT } from './systems/fx.js';

// webfont 预载:canvas 里的伤害数字/横幅要用,首帧前触发下载(失败静默回退系统字体)
if (document.fonts?.load) {
  ['900 24px "ZCOOL QingKe HuangYou"', '900 24px "ZCOOL KuaiLe"', '400 14px "Noto Sans SC"']
    .forEach((f) => document.fonts.load(f).catch(() => {}));
}

const W = 1280, H = 720;
const PPM = 52;          // 像素/米
const STEP = 1 / 60;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;
// 狙击放大镜离屏画布(准星处的圆形倍率视野)
const SCV = 448;
const scopeCv = document.createElement('canvas');
scopeCv.width = SCV; scopeCv.height = SCV;
const sctx = scopeCv.getContext('2d');
if (!ctx.roundRect) {
  ctx.roundRect = function (x, y, w, h, r) {
    const rr = typeof r === 'number' ? r : Math.min(w, h) / 2;
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}

// ---- 世界 ----
const world = new World(Vec2(0, -30));
const levelBodies = buildLevel(world);
// 注意:Player.build 内部会在 spawn 基础上再抬 0.9m,这里传原始地面高度
let player = new Player(world, Vec2(LEVEL.spawn.x, LEVEL.spawn.y));
// 武器/装备轮盘:按住 Tab 唤起 + 子弹时间;player 会被 resetPlayer 整体重建,传取值函数
const wheel = new WeaponWheel(() => player, {
  open: () => beep(180, 420, 0.12, 'sine', 0.05),
  tick: () => beep(760, 760, 0.03, 'square', 0.025),
  on: () => beep(340, 720, 0.09, 'square', 0.05),
  off: () => beep(520, 210, 0.1, 'square', 0.045),
});
// 玩家生命(护甲耐久改绑背包装备实例,见 syncArmorFromInventory)
const pstate = { hp: 30, maxHp: 30, deadT: 0 };
function freshPstate() { return { hp: 30, maxHp: 30, deadT: 0 }; }
const pickups = [];    // 掉落物:金币 / 0 耐久装备

// ---- 实体注册 / 波次 / 玩家复位 ----
export const enemies = []; // 敌人注册表
const ENEMY_DMG_MUL = 0.35; // 敌方子弹伤害统一打折(玩家血条 30 才有意义)
const waves = new WaveDirector(world, {
  onEvent: (ev) => {
    const p = player.torso.getPosition();
    if (ev.type === 'wave') {
      floaters.push({ x: p.x, y: p.y + 2.1, vy: 1.1, age: 0, text: `—— 第 ${ev.wave} 波 · ${ev.count} 人 ——`, color: '#ffb14a', size: 24, bold: true, font: 'hy', life: 1.6, max: 1.6 });
      beep(330, 660, 0.18, 'square', 0.07);
    } else if (ev.type === 'allclear') {
      floaters.push({ x: p.x, y: p.y + 2.1, vy: 0.9, age: 0, text: '全部清场!你赢了 🎉', color: '#ffd24a', size: 28, bold: true, font: 'hy', life: 3, max: 3 });
      beep(523, 1046, 0.4, 'square', 0.09);
    }
  },
});

function resetPlayer() {
  player.destroy();
  player = new Player(world, Vec2(LEVEL.spawn.x, LEVEL.spawn.y));
  Object.assign(pstate, freshPstate()); // 复位血量与护甲耐久
  syncArmorFromInventory(); // 重生必须重绑装备:否则词缀(HP上限/防御/吸血…)全部静默失效
  resetStreak(); // 死亡清空连杀
}

// 玩家装备视觉/耐久绑定到背包里的"已装备"实例;防具词缀聚合为玩家属性
const VISUAL = () => ({ head: EQUIP_PRESETS.helmet_military, body: EQUIP_PRESETS.vest_light });
function syncArmorFromInventory() {
  const h = invEquipped('head'), b = invEquipped('body');
  pstate.armorHead = h;
  pstate.armorBody = b;
  player.loadout.head = h ? VISUAL().head : null;
  player.loadout.torso = b ? VISUAL().body : null;
  player.armorQuality = { head: h?.quality ?? null, body: b?.quality ?? null };
  const mh = h ? computeArmorMods('head', h.affixes || []) : null;
  const mb = b ? computeArmorMods('body', b.affixes || []) : null;
  player.armorMods = { head: mh, body: mb };
  player.armorDefensePct = (mh?.defenseFlat || 0) + (mb?.defenseFlat || 0); // 铁壁:百分比减伤(player.defense)
  player.armorLifestealPct = (mh?.lifesteal || 0) + (mb?.lifesteal || 0);
  player.meleeLsPct = (mb?.meleeLifesteal || 0); // 汲血:近战命中回血(仅 body)
  player.healOnKill = (mh?.healOnKill || 0) + (mb?.healOnKill || 0);
  // dropRatePct/coinGainPct/meleeDmgMul/lowHpDmgPct 是 Player 的 getter(枪+防具合并),不在这里赋值
  // HP 上限 = (基础 + 生命的词条固定值) × (壁垒百分比);最大 120 防极端堆叠
  const hpPct = (mh?.hpMaxPct || 0) + (mb?.hpMaxPct || 0);
  pstate.maxHp = Math.round(Math.min(120, (30 + (mh?.hpMaxFlat || 0) + (mb?.hpMaxFlat || 0)) * (1 + hpPct / 100)));
  pstate.hp = Math.min(pstate.hp, pstate.maxHp);
}
invLoad();                  // 背包存档(首次自动发新手装)
syncArmorFromInventory();   // 玩家外观/耐久绑定到已装备实例
// 背包/搜尸里 穿戴/吸取/突破 变动后的统一同步:防具属性 + 主武器槽位词条(吸取材料会改它)
function onInvChanged() {
  syncArmorFromInventory();
  const aff = loadGunAffixes() || [];
  player.gunDef.affixes = aff;
  player.gunMods = computeGunMods(aff);
}
bpInit(onInvChanged);
corpseInit(onInvChanged);
bpWire(); // ★ 绑定背包按钮事件(漏掉这行按钮就是死的)
attachInput({ W, H, PPM, canvas, wheel, bpIsOpen, helpIsOpen, helpClose, bpToggle, menuIsOpen, menuToggle, getPlayer: () => player, resetPlayer, toggleDebug: () => { debugDraw = !debugDraw; }, initAudio,
  corpseNearby: () => !!corpseNearby(), corpseOpen: () => { const c = corpseNearby(); if (c) openCorpse(c); },
  corpseIsOpen, corpseClose: closeCorpse });
bindCamera(cam);
menuInit({ beep, noiseBurst, initAudio, onSlam: () => { addTrauma(0.45); feel.menuFlashT = 0.22; } }); // 主菜单:背景=实时场景,真空门三段式
bpSetGunInfo(() => ({ main: player.gunDef?.name || '主武器', side: '手枪', weapon: player.weapon }));

// 枪械设计器保存后,游戏页实时换枪/换装(storage 事件跨标签页触发)
window.addEventListener('storage', (e) => {
  if (e.key === 'contra-gun-primary') {
    // 词缀跟着"主武器槽位"走(contra-gun-affixes),设计器换枪不重掷
    const affixes = loadGunAffixes() || [];
    player.gunDef = loadSavedGun();
    player.gunDef.affixes = affixes;
    player.gunMods = computeGunMods(affixes);
  }
  if (e.key === 'contra-equip-head' || e.key === 'contra-equip-torso') {
    player.reloadLoadout();
  }
});
// 弹丸/特效/痕迹已抽至 systems/combat.js 与 systems/fx.js
// ---- HUD ----
const hud = {
  state: document.getElementById('hud-state'),
  ragdoll: document.getElementById('hud-ragdoll'),
};

let debugDraw = false;

// ---- 世界坐标 -> 屏幕(狙击开镜时整体按 cam.zoom 放大)----
// 震动不再随机抖:trauma² × 平滑噪声,每帧算好 cam.oX/oY/oR,全画面共用(带轻微旋转让打击更"沉")
// ---- 物理步进 ----
// 依赖包:系统模块通过它访问世界状态(装配根组装一次;player 用 getter 防复位换实例)
const C = {
  get player() { return player; },
  enemies, pstate, pickups, particles,
  groundYAt, bounds: LEVEL.bounds, QUALITY,
  invAddCoins, syncArmorFromInventory, setHitFlash, addDecal,
};
window.__game = () => ({ player, world, input, bullets, beams, debris, floaters, pickups, cam, wheel, enemies, pstate, waves, decals, particles }); // 调试句柄
window.__combat = { spawnBullet, stepBullets, applyHitscanDamage, onEnemyDied, stepPickups, alertEnemiesNear }; // 调试:命中管线直调
window.__corpse = { nearby: () => corpseNearby(), open: openCorpse, close: closeCorpse, isOpen: corpseIsOpen }; // 调试:搜尸管线直调
window.__actx = getActx; // 调试:声音问题先看 state('suspended' = 自动播放策略拦住)
window.__feel = () => ({ ...feel, timeScale, menu: menuIsOpen() }); // 调试:手感层状态
window.__level = () => LEVEL.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, hp: r.hp ?? null, max: r.maxHp ?? null })); // 调试:地形块耐久
// 尸体搜索:最近的可搜尸体(1.35m 内,有战利品未销毁)
function corpseNearby() {
  const p = player.torso.getPosition();
  let best = null, bd = 1.35;
  for (const e of enemies) {
    if (e.alive || e.destroyed || !e.loot) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function step(dt) {
  input.aim = aimWorld(W, H, PPM);
  if (wheel.open || bpIsOpen() || corpseIsOpen() || menuIsOpen()) {
    // 轮盘/背包/搜尸/主菜单期间禁火;主菜单还锁走位(待机演示画面)
    input.fire = false;
    if (menuIsOpen()) { input.left = input.right = input.down = false; }
  }
  if (corpseIsOpen()) {
    // 尸体没了(被回收/超时)或走远了 → 自动收起搜尸面板
    const c = corpseNearby();
    if (!c) closeCorpse();
  }
  player.update(dt, input);
  input.jumpPressed = false;

  for (const ev of player.events) {
    if (ev.type === 'shot') {
      const st = ev.stats;
      // 复仇词条:低血量(<35%,与红晕阈值一致)时玩家输出提升
      const lowMul = (pstate.hp < pstate.maxHp * 0.35 && player.lowHpDmgPct) ? 1 + player.lowHpDmgPct / 100 : 1;
      for (const pt of ev.parts) spawnBullet(ev.x, ev.y, pt.dx, pt.dy, st, pt.damage * lowMul);
      // 弹壳(每次扣扳机一枚,霰弹枪也只掉一枚)
      const m = player.muzzle();
      particles.push({
        x: m.x - ev.parts[0].dx * 0.15, y: m.y, vx: -ev.parts[0].dx * 2 + (Math.random() - 0.5), vy: 3 + Math.random() * 2,
        life: 0.7, size: 2.6, color: '#d9a83c', grav: 1,
      });
      flash.t = 0.07; flash.x = ev.x; flash.y = ev.y;
      flash.ang = Math.atan2(ev.parts[0].dy, ev.parts[0].dx);
      flash.r = st.damage >= 25 ? 38 : 30;
      addTrauma(0.035 + 0.02 * st.recoil); // 开枪:与武器后坐词条挂钩的轻震
      camKick(ev.parts[0].dx, ev.parts[0].dy, (1.6 + 3.2 * st.recoil) * (1.25 - 0.5 * player.skill), st.recoil); // 方向性后坐:小拳快回(重量感,不抢准星)
      alertEnemiesNear(enemies, { x: ev.x, y: ev.y }, 26); // 枪声传唤 26m 内的敌人
      gunSynth(st.sfx); // 每把枪自己的音色词条
    } else if (ev.type === 'hitscanShot') {
      const st = ev.stats;
      const d = ev.parts[0];
      const tEnd = castRay(ev.x, ev.y, d.dx, d.dy, st.range);
      const ex = ev.x + d.dx * tEnd, ey = ev.y + d.dy * tEnd;
      beams.push({ x1: ev.x, y1: ev.y, x2: ex, y2: ey, life: 0.16, max: 0.16 });
      burst(ex, ey, 10, '#cfe8ff', 5);
      flash.t = 0.09; flash.x = ev.x; flash.y = ev.y; flash.r = 48;
      flash.ang = Math.atan2(ev.parts[0].dy, ev.parts[0].dx);
      addTrauma(0.22); // 狙击:大震
      camKick(d.dx, d.dy, (1.6 + 3.2 * st.recoil) * 1.25 * (1.25 - 0.5 * player.skill), st.recoil); // 狙:单发重拳(钳制内读重量)
      alertEnemiesNear(enemies, { x: ev.x, y: ev.y }, 40); // 狙击枪声更响,传唤更远
      gunSynth(st.sfx);
      beep(2400, 200, 0.16, 'square', 0.045); // 高频"滋"的激光层
      if (pstate.hp < pstate.maxHp * 0.35 && player.lowHpDmgPct) ev.parts[0].damage *= 1 + player.lowHpDmgPct / 100;
      applyHitscanDamage(C, ev, tEnd);
    } else if (ev.type === 'melee') {
      beep(ev.shield ? 170 : 240, ev.shield ? 80 : 110, 0.12, 'square', 0.07);
      // 挥击弧线刮风尘土
      const baseA = Math.atan2(ev.dy, ev.dx);
      for (let i = 0; i < 8; i++) {
        const a = baseA + (i / 7 - 0.5) * 1.6;
        particles.push({
          x: ev.x + Math.cos(a) * 0.9, y: ev.y + Math.sin(a) * 0.9,
          vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 + 1,
          life: 0.25, size: 2.5, color: '#cfd6e4', grav: 0.4,
        });
      }
      // 敌人:扇形伤害(真实伤害:枪托 20 / 盾撞 35);盾牌冲撞额外大击退
      const lowMul = (pstate.hp < pstate.maxHp * 0.35 && player.lowHpDmgPct) ? 1 + player.lowHpDmgPct / 100 : 1;
      const dmg = (ev.shield ? 35 : 20) * (player.meleeDmgMul || 1) * lowMul;
      const reach = 1.5;
      for (const e of enemies) {
        const dx = e.x - ev.x, dy = e.y - ev.y;
        const dist = Math.hypot(dx, dy);
        if (dist > reach) continue;
        if ((dx * ev.dx + dy * ev.dy) / (dist || 1) < 0.35) continue; // 约 ±70° 扇形
        e.hurt?.(dmg);
        e.knockback?.(dx / dist * (ev.shield ? 9 : 3.5), ev.shield ? 4 : 2);
        addTrauma(0.1);
        e.freezeHit?.(0.025); // 近战命中:短促顿挫(只顿挨打的人)
        // 汲血词条:近战命中回血
        if (player.meleeLsPct) pstate.hp = Math.min(pstate.maxHp, pstate.hp + player.meleeLsPct);
      }
    } else if (ev.type === 'reload') {
      beep(300, 170, 0.09, 'square', 0.045);
    } else if (ev.type === 'reloaded') {
      beep(480, 720, 0.07, 'square', 0.045);
    } else if (ev.type === 'shield') {
      ev.on ? beep(230, 470, 0.12, 'sine', 0.06) : beep(470, 190, 0.1, 'sine', 0.05);
    } else if (ev.type === 'jump') {
      burst(ev.x ?? player.torso.getPosition().x, groundYAt(player.torso.getPosition().x, player.torso.getPosition().y), 6, '#9a8a70', 2.5);
      beep(260, 540, 0.14, 'square', 0.05);
    } else if (ev.type === 'land') {
      burst(ev.x, ev.y, ev.hard ? 14 : 7, '#9a8a70', ev.hard ? 5 : 3);
      if (ev.hard) { addTrauma(0.25); hitStop(0.03); }
      beep(150, 60, 0.1, 'sine', 0.07);
    } else if (ev.type === 'step') {
      burst(ev.x, ev.y, 2, '#8a7a60', 1.4);
    } else if (ev.type === 'fell') {
      resetPlayer();
    }
  }

  stepBullets(dt, C); // 弹丸碰撞/部位倍率/护甲吸收/击杀(systems/combat.js)
  stepFx(dt); // 粒子/光束/碎片/痕迹/飘字(systems/fx.js)
  stepPickups(dt, C); // 磁吸/拾取/背包满拦截(systems/combat.js)
  // 波次推进 + 敌人更新 + 开火事件(敌人是 AI 驱动的 Player 实例,开枪走同一套弹道管线)
  // 主菜单待机时 playerAlive=false:敌人不警戒不射击,纯巡逻当背景演示
  const playerAlive = !menuIsOpen() && pstate.hp > 0 && !player.ragdoll;
  waves.update(dt, enemies, player, playerAlive);
  for (const e of enemies) {
    e.update(dt, player, playerAlive);
    for (const ev of e.events) {
      if (ev.type === 'shot') {
        for (const pt of ev.parts) spawnBullet(ev.x, ev.y, pt.dx, pt.dy, ev.stats, pt.damage * ENEMY_DMG_MUL, 'enemy');
        flash.t = 0.05; flash.x = ev.x; flash.y = ev.y; flash.r = 20;
        flash.ang = Math.atan2(ev.parts[0].dy, ev.parts[0].dx);
        gunSynth(ev.stats?.sfx, 0.55);
      } else if (ev.type === 'died') {
        onEnemyDied(C, ev, e); // 击杀结算:个体顿帧/爆浆/传唤/连杀/掉落/回血(systems/combat.js)
      } else if (ev.type === 'respawn') {
        beep(300, 600, 0.15, 'sine', 0.04);
      }
    }
    e.events.length = 0;
  }
  // 清理已销毁刚体的敌人(波次模式的尸体 6 秒后回收)
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].destroyed) enemies.splice(i, 1);
  }

  world.step(dt, 8, 3);
  // 个体顿帧回填:物理步进后把冻结敌人的位姿摁回快照 —— 只冻它一个,世界照常
  for (const e of enemies) {
    if (e.freezeT > 0) e.pinFrozen();
  }
}

// 角色面板已抽至 systems/hud.js(updateStatusPanel)
// ---- 渲染 ----
// 世界绘制(主视图与狙击放大镜共用,只差相机/画布/倍率)
// 敌人小血条:头顶一条,活着才显示
function drawEnemyBars(c, enemies, w2sC, scale) {
  const k = scale / 52; // 随缩放/分辨率归一
  for (const e of enemies) {
    if (!e.alive) continue;
    const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
    const [bx, by] = w2sC(e.x, e.y + 1.04);
    const w = 46 * k, h = 5 * k;
    c.fillStyle = 'rgba(10, 10, 14, 0.55)';
    c.fillRect(bx - w / 2 - 1, by - h / 2 - 1, w + 2, h + 2);
    c.fillStyle = ratio > 0.5 ? '#7ac74f' : ratio > 0.25 ? '#ffd166' : '#ff5b4a';
    c.fillRect(bx - w / 2, by - h / 2, w * ratio, h);
  }
}

function drawWorld(c, camO, VW, VH, ppmZ, time) {
  const zl = ppmZ / PPM; // 像素尺寸随倍率缩放
  const z = zl;
  const w2sC = makeW2S(camO, VW, VH, PPM); // 与 camera.js 同一份公式(狙击镜内视图也走这里)
  drawSky(c, VW, VH);
  drawParallax(c, VW, VH, camO.x, PPM);
  drawTerrain(c, LEVEL.rects, w2sC, ppmZ);

  // 地面痕迹:弹孔(带亮边)/ 血渍(暗红椭圆),后半段生命淡出
  for (const d of decals) {
    const [dx, dy] = w2sC(d.x, d.y);
    const fade = clamp(d.life / d.max * 1.8, 0, 1);
    c.save();
    c.translate(dx, dy);
    if (d.kind === 'hole') {
      const r = Math.max(1.6, d.size * ppmZ);
      c.globalAlpha = 0.75 * fade;
      c.fillStyle = '#14161c';
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.4 * fade;
      c.strokeStyle = '#3d4454';
      c.lineWidth = 1;
      c.beginPath(); c.arc(0, 0, r * 1.6, 0, Math.PI * 2); c.stroke();
    } else { // blood:size = 米(0.3~0.55)
      c.globalAlpha = 0.55 * fade;
      c.fillStyle = '#5d1812';
      c.beginPath();
      c.ellipse(0, 0, d.size * ppmZ, d.size * ppmZ * 0.3, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  c.globalAlpha = 1;

  // 掉落物:品质光柱 + 金币(旋转金闪)/ 迷你盔甲(具体形状,非文字)
  for (const pk of pickups) {
    const [px, py] = w2sC(pk.x, pk.y);
    const qc = QUALITY[pk.quality]?.color ?? '#9fb0c4';

    if (pk.type !== 'coin') {
      // 品质光柱:对应颜色的垂直光束,让玩家远远看出品质
      const bh = 78;
      const grad = c.createLinearGradient(px, py - bh, px, py + 8);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.55, qc + '59');
      grad.addColorStop(1, qc + 'cc');
      c.fillStyle = grad;
      c.fillRect(px - 9, py - bh, 18, bh + 8);
    }

    if (pk.type === 'coin') {
      const spin = Math.abs(Math.sin(pk.t * 4 + pk.x * 7));
      const bob = Math.sin(pk.t * 3 + pk.x * 5) * 2.5;
      c.fillStyle = 'rgba(255, 210, 74, 0.16)';
      c.beginPath(); c.arc(px, py + bob, 11, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffd24a';
      c.beginPath(); c.ellipse(px, py + bob, 6.5 * spin + 1.2, 6.5, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#a87808'; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(px, py + bob, 6.5 * spin + 1.2, 6.5, 0, 0, Math.PI * 2); c.stroke();
    } else {
      const bob = Math.sin(pk.t * 2.6 + pk.x * 3) * 2;
      c.save();
      c.translate(px, py + bob);
      c.strokeStyle = 'rgba(15,12,8,0.5)'; c.lineWidth = 1.5;
      if (pk.slot === 'head') {
        // 迷你钢盔:圆顶 + 盔沿
        c.fillStyle = '#4a5a3a';
        c.beginPath(); c.arc(0, 2, 11, Math.PI, 0); c.closePath(); c.fill();
        c.fillStyle = '#2f3a26';
        c.beginPath(); c.roundRect(-13, 1, 26, 5, 2); c.fill();
        c.strokeStyle = 'rgba(15,12,8,0.5)';
        c.beginPath(); c.arc(0, 2, 11, Math.PI, 0); c.stroke();
      } else {
        // 迷你防弹衣:主体 + 领口 + 两格弹匣袋
        c.fillStyle = '#3d4652';
        c.beginPath(); c.roundRect(-13, -14, 26, 27, 5); c.fill();
        c.fillStyle = qc;
        c.beginPath(); c.roundRect(-13, -14, 26, 9, [5, 5, 0, 0]); c.fill();
        c.fillStyle = qc + 'cc';
        c.beginPath(); c.roundRect(-8, -2, 7, 8, 2); c.fill();
        c.beginPath(); c.roundRect(1, -2, 7, 8, 2); c.fill();
        c.strokeStyle = 'rgba(15,12,8,0.5)';
        c.beginPath(); c.roundRect(-13, -14, 26, 27, 5); c.stroke();
      }
      c.restore();
    }
  }

  // 角色影子
  {
    const p = player.torso.getPosition();
    const gy = groundYAt(p.x, p.y);
    const [sx, sy] = w2sC(p.x, gy);
    const h = clamp(1 - (p.y - 0.8 - gy) / 4, 0.25, 1);
    c.fillStyle = `rgba(0,0,0,${0.28 * h})`;
    c.beginPath();
    c.ellipse(sx, sy + 3 * zl, 26 * h * zl, 6 * h * zl, 0, 0, Math.PI * 2);
    c.fill();
  }

  // 敌人
  for (const e of enemies) e.draw(c, w2sC, ppmZ, time);
  drawEnemyBars(c, enemies, w2sC, PPM * camO.zoom);

  // 子弹曳光:沿速度反向的渐变拖尾,越快越长(主武器更粗更长)
  for (const b of bullets) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const len = Math.min(sp * 0.055, b.rifle ? 2.2 : 1.6);
    const [x1, y1] = w2sC(b.x - (b.vx / sp) * len, b.y - (b.vy / sp) * len);
    const [x2, y2] = w2sC(b.x, b.y);
    const g = c.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, 'rgba(255, 200, 100, 0)');
    g.addColorStop(0.65, 'rgba(255, 225, 150, 0.7)');
    g.addColorStop(1, 'rgba(255, 255, 240, 1)');
    c.strokeStyle = g;
    c.lineWidth = (b.rifle ? 4.5 : 3.5) * zl; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    // 亮芯
    const [cx, cy] = w2sC(b.x - (b.vx / sp) * len * 0.3, b.y - (b.vy / sp) * len * 0.3);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = (b.rifle ? 1.8 : 1.4) * zl;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(x2, y2); c.stroke();
  }

  // 狙击 hitscan 光束:亮蓝白三层,快速衰减(很有动感的那种)
  for (const bm of beams) {
    const a = bm.life / bm.max;
    const [x1, y1] = w2sC(bm.x1, bm.y1), [x2, y2] = w2sC(bm.x2, bm.y2);
    c.lineCap = 'round';
    c.strokeStyle = `rgba(120,190,255,${0.22 * a})`;
    c.lineWidth = 12 * zl;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = `rgba(190,230,255,${0.7 * a})`;
    c.lineWidth = 4.5 * zl;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = `rgba(255,255,255,${0.95 * a})`;
    c.lineWidth = 1.6 * zl;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }

  // 受击数字(漫画果冻风:弹出过冲→回弹→淡出,描边)
  for (const f of floaters) {
    const [fx, fy] = w2sC(f.x, f.y);
    const a = f.age / f.max;
    let sc;
    if (a < 0.16) sc = 0.3 + (a / 0.16) * 1.15;                // 快速弹出
    else if (a < 0.38) sc = 1.45 - ((a - 0.16) / 0.22) * 0.45; // 过冲拉回
    else sc = 1.0 - Math.max(0, a - 0.75) * 0.8;
    c.save();
    c.translate(fx, fy);
    c.rotate(f.rot || 0);
    c.scale(sc, sc);
    c.globalAlpha = clamp((f.life / f.max) * 1.9, 0, 1);
    const fam = f.font === 'hy'
      ? '"ZCOOL QingKe HuangYou", "Microsoft YaHei", sans-serif'
      : '"ZCOOL KuaiLe", "Comic Sans MS", "Microsoft YaHei", sans-serif';
    c.font = `${f.bold ? '900 ' : '800 '}${Math.round(f.size * zl)}px ${fam}`;
    c.textAlign = 'center';
    c.lineWidth = Math.max(3, f.size * zl * 0.22);
    c.strokeStyle = 'rgba(18,14,8,0.95)';
    c.strokeText(f.text, 0, 0);
    c.fillStyle = f.color;
    c.fillText(f.text, 0, 0);
    c.restore();
  }
  c.globalAlpha = 1;
  c.textAlign = 'left';

  player.draw(c, w2sC, ppmZ, time);

  // 枪口火舌(动态:三层焰瓣沿枪口方向,长度随机抖动,越衰减越短)
  if (flash.t > 0) {
    const [fx, fy] = w2sC(flash.x, flash.y);
    const a = flash.t / 0.07;
    c.save();
    c.translate(fx, fy);
    c.rotate(-flash.ang);
    const L = flash.r * zl * (1.0 + Math.random() * 0.5) * (0.55 + a * 0.45);
    const Wd = flash.r * zl * 0.30;
    // 外层橙焰
    c.fillStyle = `rgba(255,130,30,${0.55 * a})`;
    c.beginPath();
    c.moveTo(0, -Wd);
    c.quadraticCurveTo(L * 0.55, -Wd * 0.75, L, 0);
    c.quadraticCurveTo(L * 0.55, Wd * 0.75, 0, Wd);
    c.closePath(); c.fill();
    // 中层黄焰
    c.fillStyle = `rgba(255,205,80,${0.8 * a})`;
    c.beginPath();
    c.moveTo(0, -Wd * 0.62);
    c.quadraticCurveTo(L * 0.4, -Wd * 0.45, L * 0.72, 0);
    c.quadraticCurveTo(L * 0.4, Wd * 0.45, 0, Wd * 0.62);
    c.closePath(); c.fill();
    // 白芯
    c.fillStyle = `rgba(255,255,230,${0.95 * a})`;
    c.beginPath();
    c.moveTo(0, -Wd * 0.3);
    c.quadraticCurveTo(L * 0.3, -Wd * 0.2, L * 0.5, 0);
    c.quadraticCurveTo(L * 0.3, Wd * 0.2, 0, Wd * 0.3);
    c.closePath(); c.fill();
    // 上下侧瓣小火花
    c.fillStyle = `rgba(255,170,60,${0.5 * a})`;
    c.beginPath();
    c.moveTo(-L * 0.04, -Wd * 0.85); c.lineTo(L * 0.14, -Wd * 1.1); c.lineTo(L * 0.16, -Wd * 0.62);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(-L * 0.04, Wd * 0.85); c.lineTo(L * 0.14, Wd * 1.1); c.lineTo(L * 0.16, Wd * 0.62);
    c.closePath(); c.fill();
    c.restore();
    // 光晕(圆形,不随焰瓣旋转)
    c.fillStyle = `rgba(255,190,90,${0.22 * a})`;
    c.beginPath(); c.arc(fx, fy, flash.r * zl * 0.9, 0, Math.PI * 2); c.fill();
  }

  // 粒子
  for (const p of particles) {
    const [x, y] = w2sC(p.x, p.y);
    c.globalAlpha = clamp(p.life * 3, 0, 1);
    c.fillStyle = p.color;
    const s = p.size * zl;
    c.fillRect(x - s / 2, y - s / 2, s, s);
  }
  c.globalAlpha = 1;
  // 护甲碎片
  for (const d2 of debris) {
    const [x, y] = w2sC(d2.x, d2.y);
    c.save();
    c.translate(x, y);
    c.rotate(d2.angle);
    c.globalAlpha = clamp(d2.life / d2.max * 1.6, 0, 1);
    c.fillStyle = d2.color;
    if (d2.type === 'helmet') {
      const r = ppmZ * 0.17;
      c.beginPath(); c.arc(0, r * 0.2, r, Math.PI, 0); c.fill();
      c.fillRect(-r * 1.06, r * 0.12, r * 2.12, r * 0.28);
    } else {
      c.fillRect(-d2.w / 2, -d2.h / 2, d2.w, d2.h);
    }
    c.restore();
  }
}

function render(time) {
  // trauma 旋转:整幅画面绕中心微倾(全屏遮罩层不参与旋转)
  ctx.save();
  if (cam.oR) { ctx.translate(W / 2, H / 2); ctx.rotate(cam.oR); ctx.translate(-W / 2, -H / 2); }
  drawWorld(ctx, cam, W, H, PPM * cam.zoom, time);

  // 鼠标准星(期望瞄准点);开镜时由放大镜接管
  const aimP = aimWorld(W, H, PPM);
  if (aimP && cam.scoped < 0.5) {
    const [mx, my] = w2s(aimP.x, aimP.y, W, H, PPM);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.moveTo(mx - 14, my); ctx.lineTo(mx - 4, my);
    ctx.moveTo(mx + 4, my); ctx.lineTo(mx + 14, my);
    ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my - 4);
    ctx.moveTo(mx, my + 4); ctx.lineTo(mx, my + 14);
    ctx.stroke();
  }

  // 狙击放大镜:准星处的圆形倍率视野。
  // 距玩家越远镜内越模糊+越灰蒙 —— 模拟枪械有效射程与侦察极限
  if (aimP && cam.scoped > 0.03) {
    const a = Math.min(1, cam.scoped * 1.4);
    const R = Math.round(H * 0.3); // 随画布高度缩放(写死会在大窗口里变成小圆圈)
    const px = clamp(mouse.cx, R + 6, W - R - 6);
    const py = clamp(mouse.cy, R + 6, H - R - 6);
    const MAG = 2.6;
    const pp = player.torso.getPosition();
    const dist = Math.hypot(aimP.x - pp.x, aimP.y - pp.y);
    const blurPx = clamp((dist - 16) * 0.09, 0, 3.2); // 16m 内清晰,越远越糊
    const scopeCam = { x: aimP.x, y: aimP.y, zoom: MAG, shake: 0, oX: cam.kx * 0.5, oY: cam.ky * 0.5 }; // 镜内吃一半后坐:2.6x 放大下同样像素感知更猛
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, SCV, SCV);
    sctx.filter = blurPx > 0.25 ? `blur(${blurPx.toFixed(2)}px)` : 'none';
    drawWorld(sctx, scopeCam, SCV, SCV, PPM * MAG, time);
    sctx.filter = 'none';

    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(scopeCv, px - R, py - R, R * 2, R * 2);
    // 距离雾霾
    ctx.fillStyle = `rgba(150,168,205,${clamp((dist - 14) * 0.007, 0, 0.26)})`;
    ctx.fillRect(px - R, py - R, R * 2, R * 2);
    // 镜内十字 + 密位 + 红点
    ctx.strokeStyle = 'rgba(24,28,36,0.9)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(px - R, py); ctx.lineTo(px - 12, py);
    ctx.moveTo(px + 12, py); ctx.lineTo(px + R, py);
    ctx.moveTo(px, py - R); ctx.lineTo(px, py - 12);
    ctx.moveTo(px, py + 12); ctx.lineTo(px, py + R);
    for (let i = 1; i <= 4; i++) {
      const o = i * 22;
      ctx.moveTo(px + o, py - 4); ctx.lineTo(px + o, py + 4);
      ctx.moveTo(px - o, py - 4); ctx.lineTo(px - o, py + 4);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,72,72,0.95)';
    ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 双层镜圈(锐利,不参与模糊)
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(8,10,16,0.95)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(px, py, R + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,214,235,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, R + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 前景树剪影(纵深)
  drawForeground(ctx, W, H, cam.x);
  ctx.restore(); // trauma 旋转结束(以下都是屏幕空间遮罩)

  // 玩家受击红闪
  if (hitFlashT > 0) {
    ctx.fillStyle = `rgba(200,40,30,${0.3 * (hitFlashT / 0.3)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // 主菜单大门全开瞬间:白光掠过(真空被撕开的一闪)
  if (feel.menuFlashT > 0) {
    ctx.fillStyle = `rgba(225,235,255,${0.38 * (feel.menuFlashT / 0.22)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // 护甲碎裂:白闪 + 重影
  if (ghostT > 0) {
    const ga = ghostT / 0.18;
    ctx.fillStyle = `rgba(255,255,255,${0.42 * ga})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 * ga;
    ctx.drawImage(canvas, 7, 0);
    ctx.drawImage(canvas, -7, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 物理调试视图
  if (debugDraw) drawDebug();

  // vignette(静态,缓存渐变对象)
  if (!VIGNETTE) {
    VIGNETTE = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    VIGNETTE.addColorStop(0, 'rgba(0,0,0,0)');
    VIGNETTE.addColorStop(1, 'rgba(0,0,0,0.35)');
  }
  ctx.fillStyle = VIGNETTE;
  ctx.fillRect(0, 0, W, H);

  // 低血量:边缘红雾随心跳脉动(lowHpA 在 frame() 里平滑,心跳相位驱动呼吸)
  if (feel.lowHpA > 0.02) {
    if (!REDVIG) {
      REDVIG = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.92);
      REDVIG.addColorStop(0, 'rgba(160,10,10,0)');
      REDVIG.addColorStop(1, 'rgba(160,10,10,0.9)');
    }
    const pulse = 0.72 + 0.28 * Math.sin(feel.heartT * Math.PI * 2);
    ctx.globalAlpha = clamp(feel.lowHpA * 0.5 * pulse, 0, 0.85);
    ctx.fillStyle = REDVIG;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}
let VIGNETTE = null;
let REDVIG = null;

function drawDebug() {
  const bodies = [...levelBodies, ...player.allBodies];
  for (const b of bodies) {
    const isPlayer = b === player.torso;
    for (let f = b.getFixtureList(); f; f = f.getNext()) {
      const shape = f.getShape();
      ctx.strokeStyle = isPlayer ? '#ff5b5b' : b.getType() === 'static' ? '#59c2ff' : '#ffd166';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (shapeGetType(shape) === 'circle') {
        const c = b.getWorldPoint(shape.m_p || { x: 0, y: 0 });
        const [x, y] = w2s(c.x, c.y, W, H, PPM);
        ctx.arc(x, y, shape.m_radius * PPM, 0, Math.PI * 2);
      } else {
        const verts = shape.m_vertices;
        verts.forEach((v, i) => {
          const wp = b.getWorldPoint(v);
          const [x, y] = w2s(wp.x, wp.y, W, H, PPM);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.stroke();
    }
  }
}
function shapeGetType(shape) { return shape.m_type || (shape.getType ? shape.getType() : 'polygon'); }

// ---- 主循环(固定物理步长)----
let acc = 0, last = performance.now(), fpsN = 0, fpsT = 0, fps = 60;
// 子弹时间:轮盘打开时世界只走 8% 速度,指数平滑过渡;轮盘动画走真实 dt
let timeScale = 1;
function frame(now) {
  let dt = STEP;
  try {
    dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.1);
    if (!Number.isFinite(dt) || dt < 0) dt = STEP; // 极端时间戳防线

    // ---- 手感层(真实时间:衰减/低血量/心跳)----
    const F = tickFeel(dt, pstate, player.ragdoll);
    decayTimers(dt); // 火舌/红闪/白闪计时器也走真实时间(慢动作里火舌不会虚胖 12 倍)
    setMuffle(F.lowHpA); // 低血量闷化(音频系统)

    // ---- 子弹时间合成:菜单待机 > 轮盘/背包/搜尸 > 顿帧 > 击杀慢放 > 正常 ----
    let tsTarget = menuIsOpen() ? 0.3 : (wheel.open || bpIsOpen() || corpseIsOpen()) ? 0.08 : 1;
    if (feel.killSlowT > 0) tsTarget = Math.min(tsTarget, 0.32);
    if (feel.hitStopT > 0) {
      timeScale = Math.min(timeScale, 0.02); // 顿帧:入要快(硬切),出靠下面的平滑爬回
    } else {
      timeScale += (tsTarget - timeScale) * (1 - Math.exp(-9 * dt));
    }
    wheel.timeScale = timeScale; // 回写供 __game() 调试读取
    // 钳制累积器:某帧掉帧太狠时把旧账丢掉,防止"每帧追满 4 步"的持续追赶卡顿
    acc = Math.min(acc + dt * timeScale, 0.1);
    let n = 0;
    while (acc >= STEP && n < 4) { step(STEP); acc -= STEP; n++; }
    if (pstate.deadT > 0) {
      pstate.deadT -= dt;
      if (pstate.deadT <= 0) { resetPlayer(); Object.assign(pstate, freshPstate()); }
    }
    wheel.update(dt); // 「菜单拥有自己的时钟」:UI 永远实时,世界慢动作
    updateCamera(dt, player, input, W, H, PPM);
    render(now / 1000);
    wheel.draw(ctx);
    canvas.style.cursor = wheel.open ? 'none' : '';
  } catch (err) {
    // 渲染/物理异常不能杀死主循环(rAF 只在帧尾续register),记下诊断继续跑
    window.__lastFrameError = { msg: String(err && err.stack || err), at: new Date().toISOString() };
  }

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  // 左上角角色面板(头像/HP/护甲/装备栏)
  if (fpsN % 5 === 0) updateStatusPanel(pstate, player);

  const heatBar = '▮'.repeat(Math.round(player.heat * 6)) + '▯'.repeat(6 - Math.round(player.heat * 6));
  const stateTxt = player.ragdoll ? '布娃娃' : player.prone ? '趴下' : player.grounded ? (Math.abs(player.torso.getLinearVelocity().x) > 0.5 ? '奔跑' : '站立') : player.torso.getLinearVelocity().y > 1 ? '上升' : '下落';
  const defPct = Math.round(Math.min(0.8, player.defense) * 100);
  const ammo = player.ammoInfo();
  const ammoTxt = ammo.reloadT > 0 ? '换弹中…' : `弹药 ${ammo.ammo}/${ammo.mag}`;
  const hudTxt = `${stateTxt} · ${player.weapon === 'rifle' ? '主武器' : player.shield ? '手枪+盾' : '手枪'} · ${ammoTxt} · HP ${Math.ceil(pstate.hp)} · 盔 ${Math.ceil((invEquipped('head')?.dur) ?? 0)} · 甲 ${Math.ceil((invEquipped('body')?.dur) ?? 0)} · 熟练度 ${Math.round(player.skill * 100)}% · 防御 ${defPct}% · 后坐力 ${heatBar} · ${fps} FPS · B 调试视图`;
  if (hudTxt !== hud._last) { hud.state.textContent = hudTxt; hud._last = hudTxt; } // 脏检查,避免每帧 DOM 写入
  hud.ragdoll.textContent = player.ragdoll ? '布娃娃模式(按 E 复位)' : '';
  hud.ragdoll.style.display = player.ragdoll ? 'block' : 'none';

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
window.__frame = frame; // 调试:后台标签页 rAF 会整体暂停(AGENT.md 坑 7),可手动推帧
// 调试:确定性批量推帧(后台标签页验证用)——__frame(0) 的 dt 恒为 0 不会推进,用这个
window.__frameN = (n) => { for (let i = 0; i < n; i++) frame(last + (1000 / 60) * (i + 1)); };
