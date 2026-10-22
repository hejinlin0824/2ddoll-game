// 魂斗罗风格 2D 布娃娃射击 —— 主循环
import { World, Vec2 } from 'planck';
import { W, H, PPM, STEP } from './core/config.js';
import { LEVEL, buildLevel, setActiveLayout, setSceneTheme, groundYAt, drawSky, drawParallax, drawBuildingInterior, drawTerrain, drawForeground, destroyRect } from './world/level.js';
import { Player } from './entities/player.js';
import { loadSavedGun, loadEquip, QUALITY, loadReticleSettings } from './domain/gunPresets.js';
import { computeArmorMods, computeGunMods, itemTitle, AFFIX_BY_ID, loadGunAffixes } from './domain/affixes.js';
import { WeaponWheel } from './ui/wheel.js';
import { Dummy } from './entities/enemies.js';
import { Gunship } from './entities/airunit.js';
import { throwGrenade, stepGrenades, drawGrenades, clearGrenades } from './entities/grenade.js';
import { WaveDirector } from './domain/waves.js';
import { invLoad, invEquipped, invIsFull, invAddCoins } from './domain/inventory.js';
import { bpInit, bpToggle, bpIsOpen, bpClose, bpWire, bpSetGunInfo } from './ui/backpack.js';
import { corpseInit, corpseIsOpen, openCorpse, closeCorpse } from './ui/corpse.js';
import { menuInit, menuIsOpen, menuShow, menuToggle, helpIsOpen, helpClose } from './ui/menu.js';
import { initAudio, beep, gunSynth, noiseBurst, setMuffle, getActx, playReloadSound, playRadioVoice, playFootstep, playMovementSound, playImpactSound, playExplosion, playRocketLaunch, updateAircraftLoop, stopAllWorldLoops, updateSceneAmbience } from './systems/audio.js';
import { updateStatusPanel, streakShow, streakHide, lootToast } from './systems/hud.js';
import { feel, addTrauma, hitStop, killSlow, addStreak, resetStreak, tickFeel } from './systems/feel.js';
import { input, mouse, attachInput, bindCamera } from './systems/input.js';
import { cam, w2s, makeW2S, aimWorld, updateCamera, camKick, clamp, lerp } from './systems/camera.js';
import { bullets, spawnBullet, castRay, rayAABB, alertEnemiesNear, applyHitscanDamage, stepBullets, onEnemyDied, stepPickups, damageTerrain } from './systems/combat.js';
import { createRaidState, resetRaidState, emitRaidNoise, raidShotProfile, beginRaidIncident, updateRaid, floorForY, floorLabel, RAID_FLOORS } from './systems/raid.js';
import { lightingState, resetLightingState, updateLighting, drawLighting, lightLevelAt, toggleBuildingPower, toggleNightVision as toggleNightVisionMode, toggleFlashlight as toggleFlashlightMode } from './systems/lighting.js';
import { raidVisionProfile } from './domain/raidVisibility.js';
import { particles, beams, debris, decals, floaters, flash, burst, rings, explosion, spawnHelmetDebris, spawnVestDebris, addDecal, gibBurst, stepFx, decayTimers, setGhost, setHitFlash, ghostT, hitFlashT } from './systems/fx.js';

// webfont 预载:canvas 里的伤害数字/横幅要用,首帧前触发下载(失败静默回退系统字体)
if (document.fonts?.load) {
  ['900 24px "ZCOOL QingKe HuangYou"', '900 24px "ZCOOL KuaiLe"', '400 14px "Noto Sans SC"']
    .forEach((f) => document.fonts.load(f).catch(() => {}));
}


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
let levelBodies = buildLevel(world);
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
let respawnFx = null; // 玩家重生/手动复位的轻量战术部署效果(真实时间计时)
const raidState = createRaidState((localStorage.getItem('contra-scene') || 'wild') === 'raid');
let raidIntro = null; // 剿匪行动：开局/重生的屋顶绳降动画
const raidInsertionAudioEmitter = { kind: 'raid-insertion' }; // 稳定对象:WebAudio 循环声按发声实体缓存
let raidInsertionAudioActive = false;

// ---- 实体注册 / 波次 / 玩家复位 ----
export const enemies = []; // 敌人注册表
const ENEMY_DMG_MUL = 0.35; // 敌方子弹伤害统一打折(玩家血条 30 才有意义)
// 开场守军:布在平台/台阶/掩体上的驻防小队(不重生)。清掉守军后波次才会开始 —— 推进有层次。
// y = 该立足面的"波次地面高"(平台顶 + 0.72,与地面刷新同一套偏移);每关布防不同
const GARRISONS = {
  wild: [
    { x: 14.2, y: 4.77, behavior: 'guard' },
    { x: 20.5, y: 3.77, behavior: 'patrol', min: -1.3, max: 1.3 },
    { x: 27.5, y: 1.72, behavior: 'guard' },
    { x: 45, y: 1.42, behavior: 'guard' },
  ],
  roof: [
    { x: 5.5, y: 3.97, behavior: 'patrol', min: -1.6, max: 1.6 },
    { x: 13.5, y: 5.37, behavior: 'guard' },   // 高塔狙击位
    { x: 36.5, y: 4.97, behavior: 'guard' },
    { x: 51.5, y: 5.37, behavior: 'patrol', min: -1.5, max: 1.5 },
    { x: 67, y: 1.97, behavior: 'guard' },
  ],
  room: [
    { x: 6.5, y: 1.17, behavior: 'guard' },
    { x: 12, y: 3.17, behavior: 'patrol', min: -1, max: 1 },
    { x: 23, y: 1.22, behavior: 'guard' },
    { x: 45, y: 1.17, behavior: 'guard' },
    { x: 55.5, y: 2.97, behavior: 'patrol', min: -1.2, max: 1.2 },
  ],
  port: [
    { x: 14.5, y: 1.6, behavior: 'patrol', min: -1.3, max: 1.3, role: 'rusher' },
    { x: 25.5, y: 4.7, behavior: 'guard', role: 'support' },
    { x: 34.5, y: 1.7, behavior: 'guard', role: 'rifleman' },
    { x: 43.0, y: 3.4, behavior: 'patrol', min: -1.1, max: 1.1, role: 'rifleman' },
    { x: 53.0, y: 1.6, behavior: 'guard', role: 'veteran' },
    { x: 68.0, y: 4.8, behavior: 'guard', role: 'support' },
  ],
  desert: [
    { x: 9.5, y: 1.87, behavior: 'patrol', min: -2, max: 2 },
    { x: 19.5, y: 2.97, behavior: 'guard' },
    { x: 46.5, y: 2.17, behavior: 'patrol', min: -2, max: 2 },
    { x: 64.5, y: 1.97, behavior: 'guard' },
  ],
  tropic: [
    { x: 11.5, y: 3.87, behavior: 'guard' },
    { x: 16.5, y: 2.97, behavior: 'patrol', min: -1, max: 1 },
    { x: 32.5, y: 2.87, behavior: 'guard' },
    { x: 50, y: 2.67, behavior: 'patrol', min: -1, max: 1 },
    { x: 67.5, y: 2.77, behavior: 'guard' },
  ],
  raid: [
    { x: 7.6, y: 0, floor: 0, face: 1, behavior: 'patrol', min: -1.7, max: 1.7, role: 'rifleman' },
    { x: 21.5, y: 0, floor: 0, face: -1, behavior: 'guard', role: 'support' },
    { x: 37.4, y: 0, floor: 0, face: 1, behavior: 'patrol', min: -1.5, max: 1.5, role: 'rusher' },
    { x: 66.5, y: 0, floor: 0, face: -1, behavior: 'guard', role: 'rifleman' },
    { x: 8.2, y: 3.5, floor: 1, face: 1, behavior: 'guard', role: 'rifleman' },
    { x: 25.5, y: 3.5, floor: 1, face: -1, behavior: 'patrol', min: -1.2, max: 1.2, role: 'rusher' },
    { x: 47.5, y: 3.5, floor: 1, face: 1, behavior: 'guard', role: 'support' },
    { x: 68.3, y: 3.5, floor: 1, face: -1, behavior: 'patrol', min: -1.2, max: 1.2, role: 'rifleman' },
    { x: 9.3, y: 7, floor: 2, face: -1, behavior: 'patrol', min: -1.5, max: 1.5, role: 'rifleman' },
    { x: 31.5, y: 7, floor: 2, face: -1, behavior: 'guard', role: 'support' },
    { x: 51.7, y: 7, floor: 2, face: 1, behavior: 'guard', role: 'rifleman' },
    { x: 68.4, y: 7, floor: 2, face: -1, behavior: 'patrol', min: -1.1, max: 1.1, role: 'rusher' },
    { x: 28.5, y: 10.5, floor: 3, face: 1, behavior: 'guard', role: 'rifleman' },
    { x: 61.5, y: 10.5, floor: 3, face: -1, behavior: 'patrol', min: -1.3, max: 1.3, role: 'support' },
  ],
};
function spawnGarrisons(sceneId = (localStorage.getItem('contra-scene') || 'wild')) {
  enemies.length = 0;
  // custom 自建关卡的守军坐标没有逐点校准,该模式从第一波运输机开始。
  if (sceneId === 'custom') return;
  for (const g of (GARRISONS[sceneId] || GARRISONS.wild)) {
    enemies.push(new Dummy(world, { x: g.x, y: g.y }, {
      behavior: g.behavior, min: g.min, max: g.max, face: g.face,
      role: g.role, raidMode: sceneId === 'raid', raidFloorId: g.floor,
      sightRange: g.sightRange || 10.8, isReinforcement: false,
      quality: 'normal', armorMul: 0, respawn: false,
    }));
  }
}
spawnGarrisons();
if (raidState.enabled) {
  beginRaidRappel();
  // 已保存为剿匪行动时，首帧就把镜头放在屋顶插入点，避免先闪出野外原点。
  cam.x = 4.2; cam.y = 12.1; cam.zoom = 1;
}

function beginRaidRappel() {
  raidIntro = null;
  if (!raidState.enabled || !player?.allBodies?.length) return;
  const lift = 3.8;
  const highPose = player.allBodies.map((body) => {
    const p = body.getPosition();
    return { body, x: p.x, y: p.y + lift, a: body.getAngle() };
  });
  for (const pose of highPose) {
    pose.body.setTransform(Vec2(pose.x, pose.y), pose.a);
    pose.body.setLinearVelocity(Vec2(0, 0));
    pose.body.setAngularVelocity(0);
  }
  player.roping = true;
  const torso = player.torso.getPosition();
  raidIntro = { t: 0, duration: 2.15, lift, highPose, heliX: torso.x, heliY: torso.y + 2.55 };
  raidState.message = '直升机绳降 · 屋顶插入';
  raidState.messageT = 3.0;
  raidState.rappelDone = false;
}

function advanceRaidRappel(dt, advance = true) {
  if (!raidIntro) return;
  if (advance) raidIntro.t = Math.min(raidIntro.duration, raidIntro.t + dt);
  const u = clamp(raidIntro.t / raidIntro.duration, 0, 1);
  const eased = 1 - Math.pow(1 - u, 2.2);
  const offset = -raidIntro.lift * eased;
  for (const pose of raidIntro.highPose) {
    pose.body.setTransform(Vec2(pose.x, pose.y + offset), pose.a);
    pose.body.setLinearVelocity(Vec2(0, 0));
    pose.body.setAngularVelocity(0);
  }
  if (u >= 1) {
    player.roping = false;
    raidIntro = null;
    raidState.rappelDone = true;
    raidState.message = '屋顶已着陆 · 选择潜行或强攻';
    raidState.messageT = 3.2;
    floaters.push({ x: player.torso.getPosition().x, y: player.torso.getPosition().y + 1.7, vy: 0.45, age: 0, text: 'INSERTION COMPLETE', color: '#ffb14a', size: 17, bold: true, life: 1.4, max: 1.4 });
  }
}

function createWaveDirector() {
  return new WaveDirector(world, {
  onEvent: (ev) => {
    const p = player.torso.getPosition();
    if (ev.type === 'wave') {
      const phaseLabel = ev.phase === 'air-assault' ? '空地联合攻势'
        : ev.phase === 'surge' ? '增援潮'
          : '标准推进';
      floaters.push({ x: p.x, y: p.y + 2.1, vy: 1.1, age: 0, text: `—— 第 ${ev.wave} 波 · ${phaseLabel} · ${ev.count} 人 ——`, color: ev.phase === 'surge' ? '#ff9152' : '#ffb14a', size: 24, bold: true, font: 'hy', life: 1.8, max: 1.8 });
      beep(330, 660, 0.18, 'square', 0.07);
    } else if (ev.type === 'gunship') {
      floaters.push({ x: p.x, y: p.y + 2.6, vy: 0.9, age: 0, text: '⚠ 武装直升机来袭 ⚠', color: '#ff5b4a', size: 30, bold: true, font: 'hy', life: 2.4, max: 2.4 });
      beep(420, 300, 0.35, 'square', 0.07);
      beep(420, 300, 0.35, 'square', 0.07, 0.45); // 双音警报
    } else if (ev.type === 'allclear') {
      floaters.push({ x: p.x, y: p.y + 2.1, vy: 0.9, age: 0, text: '全部清场!你赢了 🎉', color: '#ffd24a', size: 28, bold: true, font: 'hy', life: 3, max: 3 });
      beep(523, 1046, 0.4, 'square', 0.09);
    }
  },
  });
}
let waves = createWaveDirector();

function resetPlayer() {
  player.destroy();
  player = new Player(world, Vec2(LEVEL.spawn.x, LEVEL.spawn.y));
  Object.assign(pstate, freshPstate()); // 复位基础状态
  syncArmorFromInventory(); // 重生必须重绑装备:否则词缀(HP上限/防御/吸血…)全部静默失效
  pstate.hp = pstate.maxHp; // 装备属性同步完成后再满血复活,包含生命上限词条
  resetStreak(); // 死亡清空连杀
  const sp = player.torso.getPosition();
  respawnFx = { x: sp.x, y: sp.y, t: 0, duration: 1.12 };
  if (raidState.enabled) beginRaidRappel();
}

// 玩家装备视觉/耐久绑定到背包里的"已装备"实例;防具词缀聚合为玩家属性
function syncArmorFromInventory() {
  const h = invEquipped('head'), b = invEquipped('body');
  pstate.armorHead = h;
  pstate.armorBody = b;

  // 外观从设计器存档加载;背包槽位决定是否穿戴。
  // 设计器的 defense 是比例值(0~0.8),防具词条的 defenseFlat 是百分数(如 +5)。
  // 在这里统一转换成百分数百分点,供 Player.defense 汇总,避免两种单位直接相加。
  const headVisual = h ? loadEquip('head') : null;
  const torsoVisual = b ? loadEquip('torso') : null;
  player.loadout.head = headVisual;
  player.loadout.torso = torsoVisual;
  const baseDefenseRatio = (eq) => {
    const value = Number(eq?.defense);
    return Number.isFinite(value) ? Math.max(0, Math.min(0.8, value)) : 0;
  };
  player.armorBaseDefensePct = Math.round(
    (baseDefenseRatio(headVisual) + baseDefenseRatio(torsoVisual)) * 1000
  ) / 10;

  player.armorQuality = { head: h?.quality ?? null, body: b?.quality ?? null };
  const mh = h ? computeArmorMods('head', h.affixes || []) : null;
  const mb = b ? computeArmorMods('body', b.affixes || []) : null;
  player.armorMods = { head: mh, body: mb };
  player.armorDefensePct = (mh?.defenseFlat || 0) + (mb?.defenseFlat || 0); // 铁壁词条:百分数百分点
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

// 运行时更换战区,不用 location.reload:遮罩覆盖期间重建世界实体/地形/波次与背景。
function switchScene(sceneId) {
  if (!sceneId) return;
  raidIntro = null;
  if (raidInsertionAudioActive) { updateAircraftLoop(raidInsertionAudioEmitter, 0, 0, 0, 0, false, 'transport', 0); raidInsertionAudioActive = false; }
  // 先校验/准备布局,自定义地图存档异常时不要先销毁当前战场。
  if (!setActiveLayout(sceneId)) return false;
  // 先关闭所有持有旧实体引用的浮层/轮盘,再销毁旧物理世界中的刚体。
  wheel.forceClose();
  stopAllWorldLoops();
  bpClose();
  closeCorpse();
  clearGrenades(world);
  try { player.destroy(); } catch { /* 之后会统一清理 world */ }
  let body = world.getBodyList();
  while (body) {
    const next = body.getNext();
    try { world.destroyBody(body); } catch { /* 切关时尽力清理 */ }
    body = next;
  }

  // 清空跨场景的临时实体和特效,避免旧战区的子弹/尸体/飘字留在新地图。
  enemies.length = 0;
  pickups.length = 0;
  bullets.length = 0;
  particles.length = 0;
  beams.length = 0;
  debris.length = 0;
  decals.length = 0;
  floaters.length = 0;
  rings.length = 0;
  flash.t = 0;
  setGhost(0); setHitFlash(0);
  feel.hitStopT = 0; feel.killSlowT = 0; feel.slowCd = 0; feel.trauma = 0; feel.lowHpA = 0; feel.heartT = 0;
  resetStreak();

  setSceneTheme(sceneId === 'custom' ? 'wild' : sceneId);
  localStorage.setItem('contra-scene', sceneId);
  resetLightingState(sceneId);
  levelBodies = buildLevel(world);
  player = new Player(world, Vec2(LEVEL.spawn.x, LEVEL.spawn.y));
  Object.assign(pstate, freshPstate());
  syncArmorFromInventory();
  pstate.hp = pstate.maxHp;
  resetRaidState(raidState, sceneId === 'raid');
  spawnGarrisons(sceneId);
  if (raidState.enabled) beginRaidRappel();
  waves = createWaveDirector();

  cam.x = sceneId === 'raid' ? 4.2 : 0; cam.y = sceneId === 'raid' ? 12.1 : 3.4; cam.zoom = 1; cam.scoped = 0;
  cam.oX = 0; cam.oY = 0; cam.oR = 0; cam.kx = 0; cam.ky = 0;
  input.left = input.right = input.down = input.fire = input.jumpPressed = false;
  mouse.active = false;
  respawnFx = { x: LEVEL.spawn.x, y: LEVEL.spawn.y + 1, t: 0, duration: 0.85 };
  acc = 0;
  lastMenuRender = 0;
  return true;
}

function setDoorSensor(door, sensor) {
  const fixture = door?.body?.getFixtureList?.();
  if (fixture?.setSensor) fixture.setSensor(!!sensor);
  door.doorSensor = !!sensor;
}

function updateRaidDoorAnimations(dt) {
  if (!raidState.enabled) return;
  const p = player.torso.getPosition();
  for (const door of LEVEL.rects) {
    if (door.type !== 'door' || !door.body) continue;
    let angle = door.doorAngle || 0;
    angle = door.doorOpen ? Math.min(Math.PI / 2, angle + dt * 2.8) : Math.max(0, angle - dt * 2.8);
    if (!door.doorOpen && angle < 0.09) {
      const occupiesOpening = Math.abs(p.x - door.x) < door.w * 0.5 + 0.22
        && Math.abs(p.y - door.y) < door.h * 0.5 + 0.25;
      if (occupiesOpening) angle = 0.12; // Do not close a solid door through the player's body.
      else angle = 0;
    }
    door.doorAngle = angle;
    setDoorSensor(door, door.doorOpen || angle > 0.09);
    if (angle === 0) door.body.setTransform(Vec2(door.x, door.y), 0);
  }
}

function interactWithRaidDoor() {
  if (!raidState.enabled) return false;
  const p = player.torso.getPosition();
  let nearest = null, best = Infinity;
  for (const r of LEVEL.rects) {
    if (!['door', 'breaker'].includes(r.type) || !r.body) continue;
    const d = Math.hypot(p.x - r.x, (p.y - r.y) * 0.72);
    if (d < best) { best = d; nearest = r; }
  }
  if (nearest && best < 1.85) {
    const { x, y } = nearest;
    if (nearest.type === 'breaker') {
      const powerOn = toggleBuildingPower();
      emitRaidNoise(raidState, { x, y, floorId: floorForY(y), radius: 7.5, intensity: 0.42, kind: 'breaker', faction: 'player' });
      floaters.push({ x, y: y + 0.9, vy: 0.55, age: 0, text: powerOn ? '主电源恢复 · 主照明启动' : '主电源切断 · 应急照明启动', color: powerOn ? '#ffcb79' : '#ff756b', size: 15, bold: true, life: 1.25, max: 1.25 });
      beep(powerOn ? 310 : 210, powerOn ? 520 : 120, 0.14, 'triangle', 0.06);
      return true;
    }
    nearest.doorOpen = !nearest.doorOpen;
    nearest.doorAngle = nearest.doorAngle || 0;
    if (nearest.doorOpen) setDoorSensor(nearest, true);
    emitRaidNoise(raidState, { x, y, floorId: floorForY(y), radius: nearest.doorOpen ? 5.2 : 4.6, intensity: 0.30, kind: 'door', faction: 'player' });
    floaters.push({ x, y: y + 0.9, vy: 0.55, age: 0, text: nearest.doorOpen ? '门正在开启' : '门正在关闭', color: '#ffcb79', size: 16, bold: true, life: 0.9, max: 0.9 });
    beep(nearest.doorOpen ? 190 : 250, nearest.doorOpen ? 310 : 170, 0.11, 'triangle', 0.045);
  } else {
    floaters.push({ x: p.x, y: p.y + 1.2, vy: 0.35, age: 0, text: '附近没有可交互的门或配电箱', color: '#bdc8d7', size: 12, life: 0.75, max: 0.75 });
  }
  // 剿匪行动里 E 专用于门/配电箱交互，避免误把玩家重置回屋顶。
  return true;
}

function spawnRaidReinforcements(caller) {
  const packet = beginRaidIncident(raidState, caller, enemies);
  if (!packet) return null;
  const floorId = packet.floorId;
  const floorY = [0, 3.5, 7, 10.5][floorId] ?? 0;
  const side = caller.x < 37 ? 1 : -1;
  const spawned = [];
  if (packet.response === 'infantry' || packet.response === 'combined') {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const spawnX = clamp(packet.x + side * (12.5 + i * 1.2), 2.1, 71.9);
      const role = i === 0 ? 'rusher' : (i === count - 1 ? 'support' : 'rifleman');
      const d = new Dummy(world, { x: spawnX, y: floorY }, {
        behavior: 'patrol', min: -1.0, max: 1.0, face: -side, patrolDir: -side,
        role, quality: 'fine', armorMul: 0.2, respawn: false,
        raidMode: true, raidFloorId: floorId, sightRange: 11.2, isReinforcement: true,
      });
      d.isReinforcement = true;
      d.alarmZoneId = packet.id;
      d.supportCalled = true;
      d.lastKnown = { x: player.torso.getPosition().x, y: player.torso.getPosition().y };
      d.suspicion = 1; d.suspicious = false; d.alertTo();
      enemies.push(d); spawned.push(d);
    }
  }
  if (packet.response === 'helicopter' || packet.response === 'combined') {
    const edgeX = side > 0 ? 75.2 : -9.5;
    const heli = new Gunship(world, { x: edgeX, y: Math.max(6.8, floorY + 6.8) }, { enemies, hp: 150 });
    heli.raidMode = true;
    heli.raidFloorId = floorId;
    heli.isReinforcement = true;
    heli.alarmZoneId = packet.id;
    heli.responseSide = -side;
    enemies.push(heli); spawned.push(heli);
  }
  const p = player.torso.getPosition();
  emitRaidNoise(raidState, { x: packet.x, y: packet.y, floorId, radius: 13, intensity: 1.0, kind: 'radio', faction: 'enemy', life: 0.5 });
  floaters.push({ x: p.x, y: p.y + 2.3, vy: 0.75, age: 0, text: packet.response === 'infantry' ? '增援小队正在接近' : packet.response === 'helicopter' ? '空中增援已响应' : '地面与空中增援已响应', color: '#ff6d59', size: 18, bold: true, life: 1.7, max: 1.7 });
  beep(360, 250, 0.18, 'square', 0.055);
  return { packet, spawned };
}

function drawRaidVision(c, w2sC, ppmZ, time, VW = W, VH = H) {
  if (!raidState.enabled) return;

  // 视野锥只是提示层，不能因为某个敌人数据异常而中断整个渲染帧。
  // 所有射线/楼层坐标先在 save() 之前计算，Canvas 状态不会被错误数据污染。
  try {
    const RAY_STEPS = 14;
    const playerPos = player.torso.getPosition();
    const playerFloorId = floorForY(playerPos.y);
    const illumination = lightLevelAt(playerPos.x, playerPos.y + 0.32, LEVEL.rects, lightingState, { forAI: true });
    const blockersByFloor = new Map(RAID_FLOORS.map((floor) => [floor.id, LEVEL.rects.filter((r) =>
      r && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)
      && r.y + r.h / 2 >= floor.top - 0.30 && r.y - r.h / 2 <= floor.top + 3.30
    )]));

    const rayToBlocker = (x, y, dx, dy, range, blockers) => {
      let best = range;
      for (const r of blockers) {
        const hit = rayAABB(x, y, dx, dy, r);
        if (Number.isFinite(hit) && hit > 0.02 && hit < best) best = hit;
      }
      return best;
    };

    for (const e of enemies) {
      if (!e.raidMode || !e.alive || e.destroyed || e.airUnit || e.alert) continue;

      let view;
      try {
        const p = e.p?.torso?.getPosition?.() || { x: e.x, y: e.y };
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        const floorId = Number.isInteger(e.raidFloorId) ? e.raidFloorId : floorForY(p.y);
        const floor = RAID_FLOORS.find((f) => f.id === floorId);
        if (!floor || floorId !== playerFloorId) continue;

        const floorBottom = floor.top + 0.035;
        const floorCeiling = floor.top + 3.0;
        const [, clipY0] = w2sC(0, floorCeiling);
        const [, clipY1] = w2sC(0, floorBottom);
        const clipTop = Math.max(0, Math.min(clipY0, clipY1));
        const clipBottom = Math.min(VH, Math.max(clipY0, clipY1));
        if (![clipTop, clipBottom].every(Number.isFinite) || clipBottom <= clipTop) continue;

        const profile = raidVisionProfile({
          sightRange: e.sightRange || 10.5, suspicious: e.suspicious,
          crouch: player.crouch, illumination,
        });
        const range = profile.range;
        const centerAngle = (e.face || -1) > 0 ? 0 : Math.PI;
        const spread = profile.halfAngle;
        const origin = { x: p.x, y: p.y + 0.42 };
        const [ox, oy] = w2sC(origin.x, origin.y);
        if (![ox, oy].every(Number.isFinite)) continue;
        const blockers = blockersByFloor.get(floorId) || [];
        const points = [];
        for (let i = 0; i <= RAY_STEPS; i++) {
          const a = centerAngle - spread + (2 * spread * i / RAY_STEPS);
          const dx = Math.cos(a), dy = Math.sin(a);
          const dist = rayToBlocker(origin.x, origin.y, dx, dy, range, blockers);
          points.push(w2sC(origin.x + dx * dist, origin.y + dy * dist));
        }
        if (points.some((pt) => !pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1]))) continue;
        view = { e, ox, oy, points, clipTop, clipBottom };
      } catch (err) {
        window.__raidVisionError = String(err?.stack || err);
        continue;
      }

      // 严格成对 save/restore。这个 HUD 层即使绘制失败，也不能留下楼层 clip
      // 把后续地形、角色或武器轮盘永久裁切掉。
      c.save();
      try {
        c.beginPath(); c.rect(0, view.clipTop, VW, view.clipBottom - view.clipTop); c.clip();
        c.fillStyle = view.e.suspicious ? 'rgba(255,177,74,0.075)' : 'rgba(255,205,122,0.014)';
        c.beginPath(); c.moveTo(view.ox, view.oy);
        for (const [px, py] of view.points) c.lineTo(px, py);
        c.closePath(); c.fill();
        c.strokeStyle = view.e.suspicious ? 'rgba(255,177,74,0.26)' : 'rgba(255,205,122,0.055)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(view.ox, view.oy); c.lineTo(view.points[0][0], view.points[0][1]);
        c.moveTo(view.ox, view.oy); c.lineTo(view.points[view.points.length - 1][0], view.points[view.points.length - 1][1]);
        c.moveTo(view.points[0][0], view.points[0][1]);
        for (let i = 1; i < view.points.length; i++) c.lineTo(view.points[i][0], view.points[i][1]);
        c.stroke();
        if (view.e.suspicious) {
          c.fillStyle = `rgba(255,177,74,${0.3 + 0.12 * Math.sin(time * 6 + view.e.x)})`;
          c.beginPath(); c.arc(view.ox, view.oy - 10, 2.8, 0, Math.PI * 2); c.fill();
        }
      } catch (err) {
        window.__raidVisionError = String(err?.stack || err);
      } finally {
        c.restore();
      }
    }
  } catch (err) {
    // 视野提示绘制失败不应阻止 drawTerrain / render 的其余层继续绘制。
    window.__raidVisionError = String(err?.stack || err);
  }
}

attachInput({ W, H, PPM, canvas, wheel, bpIsOpen, helpIsOpen, helpClose, bpToggle, menuIsOpen, menuToggle, getPlayer: () => player, resetPlayer, interact: interactWithRaidDoor, toggleDebug: () => { debugDraw = !debugDraw; },
  toggleNightVision: () => {
    const on = toggleNightVisionMode();
    const p = player.torso.getPosition();
    floaters.push({ x: p.x, y: p.y + 1.45, vy: 0.3, age: 0, text: on ? '夜视仪已启动' : '夜视仪已关闭', color: on ? '#a8e59c' : '#bdc8d7', size: 14, bold: true, life: 1, max: 1 });
    beep(on ? 520 : 350, on ? 760 : 240, 0.08, 'sine', 0.04);
  },
  toggleFlashlight: () => {
    const wasOn = lightingState.flashlightOn;
    const empty = !wasOn && lightingState.flashlightBattery <= 0.5;
    const on = toggleFlashlightMode();
    const p = player.torso.getPosition();
    const message = empty ? '手电电量耗尽' : on ? '战术手电已开启' : '战术手电已关闭';
    floaters.push({ x: p.x, y: p.y + 1.45, vy: 0.3, age: 0, text: message, color: empty ? '#ff756b' : on ? '#cfe8ff' : '#bdc8d7', size: 13, bold: true, life: 1, max: 1 });
    beep(on ? 410 : 270, on ? 560 : 170, 0.07, 'triangle', 0.035);
  },
  initAudio,
  corpseNearby: () => !!corpseNearby(), corpseOpen: () => { const c = corpseNearby(); if (c) openCorpse(c); },
  corpseIsOpen, corpseClose: closeCorpse });
bindCamera(cam);
menuInit({ beep, noiseBurst, initAudio, onSceneChange: switchScene, onSlam: () => { addTrauma(0.45); feel.menuFlashT = 0.22; } }); // 主菜单:背景=实时场景,真空门三段式
bpSetGunInfo(() => ({ main: player.gunDef?.customName || player.gunDef?.name || '主武器', side: '手枪', weapon: player.weapon }));

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
    // 通过统一同步入口刷新:保留背包是否穿戴的约束,同时读取设计器保存的最新外观。
    syncArmorFromInventory();
  }
});
// 弹丸/特效/痕迹已抽至 systems/combat.js 与 systems/fx.js
// ---- HUD ----
const hud = {
  state: document.getElementById('hud-state'),
  ragdoll: document.getElementById('hud-ragdoll'),
};

let debugDraw = false;
let raidHudStamp = 0;
function updateRaidHUD(now) {
  const root = document.getElementById('raidHud');
  if (!root) return;
  const display = raidState.enabled ? 'flex' : 'none';
  if (root.style.display !== display) root.style.display = display;
  if (!raidState.enabled || now - raidHudStamp < 140) return;
  raidHudStamp = now;
  const active = raidState.activeIncident;
  const profile = raidShotProfile(player.weapon === 'pistol' ? '手枪' : (player.gunDef?.name || '主武器'), player.isSuppressorOn(), player.weapon);
  const mode = active ? 'alarm' : raidState.awareness > 0.22 ? 'search' : 'stealth';
  if (root.dataset.mode !== mode) root.dataset.mode = mode;
  const status = raidState.messageT > 0 ? raidState.message : active ? '局部增援交战中' : raidState.awareness > 0.22 ? '守军正在搜索' : '未暴露 · 可以潜行';
  const set = (id, value) => { const el = document.getElementById(id); if (el && el.textContent !== value) el.textContent = value; };
  set('raidMissionStatus', status);
  set('raidFloorText', floorLabel(raidState.floorId));
  const shotStats = player.stats();
  const soundMul = player.isSuppressorOn() ? (shotStats.suppressionRadiusMul ?? 1) : (shotStats.soundRadiusMul ?? 1);
  set('raidNoiseText', `声源 ${(profile.radius * soundMul).toFixed(1)}m · ${player.isSuppressorOn() ? '消音器 ON' : '标准枪声'}`);
  set('raidIncidentText', active ? `支援事件 ${raidState.incidents.length} · ${active.response.toUpperCase()}` : `已清理楼层 ${Object.values(raidState.clearedFloors).filter(Boolean).length}/4`);
  const fill = document.getElementById('raidAlertFill');
  if (fill) fill.style.width = `${Math.round(clamp(raidState.awareness, 0, 1) * 100)}%`;
}

// ---- 世界坐标(狙击开镜时整体按 cam.zoom 放大)----
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
window.__raid = () => ({ ...raidState, incidents: raidState.incidents.map((i) => ({ ...i })), rappel: !!raidIntro }); // 剿匪行动调试状态
window.__lighting = () => ({ ...lightingState }); // 调试：光照、电力、夜视与手电状态
window.__combat = { spawnBullet, stepBullets, applyHitscanDamage, onEnemyDied, stepPickups, alertEnemiesNear }; // 调试:命中管线直调
window.__corpse = { nearby: () => corpseNearby(), open: openCorpse, close: closeCorpse, isOpen: corpseIsOpen }; // 调试:搜尸管线直调
window.__actx = getActx; // 调试:声音问题先看 state('suspended' = 自动播放策略拦住)
window.__feel = () => ({ ...feel, timeScale, menu: menuIsOpen() }); // 调试:手感层状态
window.__level = () => LEVEL.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, hp: r.hp ?? null, max: r.maxHp ?? null, type: r.type, doorId: r.doorId ?? null, doorOpen: r.doorOpen ?? false, doorAngle: r.doorAngle ?? 0, breakerId: r.breakerId ?? null })); // 调试:地形/门/配电柜状态
window.__spawnGunship = (hp = 260) => { // 调试:直接召一架母体机(从右缘飞入)
  enemies.push(new Gunship(world, { x: LEVEL.bounds.right - 2, y: 9.5 }, { enemies, hp }));
}; // 调试:空中部队管线直调
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
  updateLighting(dt, { scene: localStorage.getItem('contra-scene') || 'wild', player, aim: mouse });
  updateRaidDoorAnimations(dt);
  input.aim = aimWorld(W, H, PPM);
  // 屋顶插入时复用声音系统已有的运输机循环声；暂停菜单时静音并在离开场景时清理。
  const insertionListener = player.torso.getPosition();
  if (raidIntro && raidState.enabled && !menuIsOpen()) {
    const heliY = Number.isFinite(raidIntro.heliY) ? raidIntro.heliY : insertionListener.y + 2.55;
    updateAircraftLoop(raidInsertionAudioEmitter, raidIntro.heliX, heliY, insertionListener.x, insertionListener.y, true, 'transport', 0.9);
    raidInsertionAudioActive = true;
  } else if (raidInsertionAudioActive) {
    updateAircraftLoop(raidInsertionAudioEmitter, 0, 0, insertionListener.x, insertionListener.y, false, 'transport', 0);
    raidInsertionAudioActive = false;
  }
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
  const rappelAtStart = !!raidIntro;
  if (raidIntro) {
    input.left = input.right = input.down = input.fire = false;
    input.jumpPressed = false;
  }
  player.update(dt, input);
  if (raidIntro) advanceRaidRappel(dt, !menuIsOpen());
  input.jumpPressed = false;

  for (const ev of player.events) {
    if (rappelAtStart) continue; // 绳降动画期间不消费射击/近战等输入事件
    if (ev.type === 'grenade') {
      // 抛雷:实体由 grenade 模块管理,起爆结算走 handleDetonation(step 里驱动)
      throwGrenade(world, ev.x, ev.y, ev.vx, ev.vy);
      emitRaidNoise(raidState, { x: ev.x, y: ev.y, floorId: floorForY(ev.y), radius: 4.5, intensity: 0.22, kind: 'grenade-pin' });
    } else if (ev.type === 'shot') {
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
      // 剿匪行动需要建筑/楼层保持稳定：相机后坐会让整栋楼随每发子弹左右游移。
      // 角色与武器本身仍保留动画后坐；其他普通战区继续使用原来的镜头手感。
      if (!raidState.enabled) {
        addTrauma(0.035 + 0.02 * st.recoil);
        camKick(ev.parts[0].dx, ev.parts[0].dy, (1.6 + 3.2 * st.recoil) * (1.25 - 0.5 * player.skill), st.recoil);
      }
      if (raidState.enabled) {
        const sound = raidShotProfile(ev.weaponName, !!ev.suppressed, ev.weapon);
        const radiusMul = ev.suppressed ? (st.suppressionRadiusMul ?? 1) : (st.soundRadiusMul ?? 1);
        const intensityMul = ev.suppressed ? (st.soundIntensityMul ?? 1) : 1;
        emitRaidNoise(raidState, { x: ev.x, y: ev.y, floorId: floorForY(ev.y), radius: sound.radius * radiusMul, intensity: sound.intensity * intensityMul, kind: 'gunshot' });
      } else alertEnemiesNear(enemies, { x: ev.x, y: ev.y }, 26); // 传统模式沿用范围传唤
      { const lp = player.torso.getPosition();
        gunSynth(st.sfx, ev.suppressed ? 0.48 : 1, { weaponName: ev.weaponName, x: ev.x, y: ev.y, listenerX: lp.x, listenerY: lp.y, source: 'player', maxDistance: ev.suppressed ? 12 : 28, distantTail: false });
      } // 消音只缩小传播范围并压低近场响度，不改变弹道伤害
    } else if (ev.type === 'hitscanShot') {
      const st = ev.stats;
      const d = ev.parts[0];
      const tEnd = castRay(ev.x, ev.y, d.dx, d.dy, st.range);
      const ex = ev.x + d.dx * tEnd, ey = ev.y + d.dy * tEnd;
      beams.push({ x1: ev.x, y1: ev.y, x2: ex, y2: ey, life: 0.16, max: 0.16 });
      burst(ex, ey, 10, '#cfe8ff', 5);
      flash.t = ev.suppressed ? 0.045 : 0.09; flash.x = ev.x; flash.y = ev.y; flash.r = ev.suppressed ? 18 : 48;
      flash.ang = Math.atan2(ev.parts[0].dy, ev.parts[0].dx);
      // 剿匪行动关闭开枪造成的整屏震动，防止建筑轮廓跟着狙击枪左右晃。
      if (!raidState.enabled) {
        addTrauma(0.22);
        camKick(d.dx, d.dy, (1.6 + 3.2 * st.recoil) * 1.25 * (1.25 - 0.5 * player.skill), st.recoil);
      }
      if (raidState.enabled) {
        const sound = raidShotProfile(ev.weaponName, !!ev.suppressed, ev.weapon);
        const radiusMul = ev.suppressed ? (st.suppressionRadiusMul ?? 1) : (st.soundRadiusMul ?? 1);
        const intensityMul = ev.suppressed ? (st.soundIntensityMul ?? 1) : 1;
        emitRaidNoise(raidState, { x: ev.x, y: ev.y, floorId: floorForY(ev.y), radius: sound.radius * radiusMul, intensity: sound.intensity * intensityMul, kind: 'gunshot' });
      } else alertEnemiesNear(enemies, { x: ev.x, y: ev.y }, 40); // 狙击枪声更响,传统模式传唤更远
      { const lp = player.torso.getPosition();
        gunSynth(st.sfx, ev.suppressed ? 0.4 : 1, { weaponName: ev.weaponName, x: ev.x, y: ev.y, listenerX: lp.x, listenerY: lp.y, source: 'player', maxDistance: ev.suppressed ? 12 : 28, distantTail: false });
      }
      beep(2400, 200, 0.16, 'square', ev.suppressed ? 0.014 : 0.045); // 消音狙击保留极轻微的弹道裂响
      if (pstate.hp < pstate.maxHp * 0.35 && player.lowHpDmgPct) ev.parts[0].damage *= 1 + player.lowHpDmgPct / 100;
      applyHitscanDamage(C, ev, tEnd);
    } else if (ev.type === 'melee') {
      if (raidState.enabled) emitRaidNoise(raidState, { x: ev.x, y: ev.y, floorId: floorForY(ev.y), radius: ev.shield ? 7.5 : 4.5, intensity: ev.shield ? 0.5 : 0.22, kind: 'melee' });
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
        { const lp = player.torso.getPosition();
          playImpactSound(ev.shield ? 'armor' : 'flesh', { x: e.x, y: e.y, listenerX: lp.x, listenerY: lp.y, volume: ev.shield ? 0.48 : 0.40, maxDistance: 5, emitter: e, source: 'player', distantTail: false });
        }
        e.knockback?.(dx / dist * (ev.shield ? 9 : 3.5), ev.shield ? 4 : 2);
        addTrauma(0.1);
        e.freezeHit?.(0.025); // 近战命中:短促顿挫(只顿挨打的人)
        // 汲血词条:近战命中回血
        if (player.meleeLsPct) pstate.hp = Math.min(pstate.maxHp, pstate.hp + player.meleeLsPct);
      }
    } else if (ev.type === 'reload') {
      { const lp = player.torso.getPosition(); playReloadSound('start', ev.weaponName || (ev.weapon === 'pistol' ? '手枪' : player.gunDef?.name), { x: lp.x, y: lp.y, listenerX: lp.x, listenerY: lp.y, source: 'player', volume: 0.68 }); }
    } else if (ev.type === 'reloaded') {
      { const lp = player.torso.getPosition(); playReloadSound('end', ev.weaponName || (player.weapon === 'rifle' ? (player.gunDef?.name || '自定义枪') : '手枪'), { x: lp.x, y: lp.y, listenerX: lp.x, listenerY: lp.y, source: 'player', volume: 0.62 }); }
    } else if (ev.type === 'suppressor') {
      if (ev.ok) {
        const profile = raidShotProfile(ev.weaponName, ev.on, player.weapon);
        const text = ev.on ? `消音器已开启 · 声源约 ${profile.radius.toFixed(1)}m` : '消音器已关闭';
        floaters.push({ x: player.torso.getPosition().x, y: player.torso.getPosition().y + 1.45, vy: 0.4, age: 0, text, color: ev.on ? '#9cd7c0' : '#d3dce7', size: 13, bold: true, life: 1.2, max: 1.2 });
      } else {
        floaters.push({ x: player.torso.getPosition().x, y: player.torso.getPosition().y + 1.2, vy: 0.3, age: 0, text: '当前武器不支持消音器', color: '#d3a48b', size: 12, life: 0.9, max: 0.9 });
      }
      beep(ev.ok && ev.on ? 520 : 320, ev.ok && ev.on ? 860 : 220, 0.08, 'triangle', 0.035);
    } else if (ev.type === 'shield') {
      ev.on ? beep(230, 470, 0.12, 'sine', 0.06) : beep(470, 190, 0.1, 'sine', 0.05);
    } else if (ev.type === 'jump') {
      if (raidState.enabled) emitRaidNoise(raidState, { x: ev.x ?? player.torso.getPosition().x, y: player.torso.getPosition().y, floorId: floorForY(player.torso.getPosition().y), radius: 8.5, intensity: 0.46, kind: 'jump' });
      burst(ev.x ?? player.torso.getPosition().x, groundYAt(player.torso.getPosition().x, player.torso.getPosition().y), 6, '#9a8a70', 2.5);
      { const lp = player.torso.getPosition(); playMovementSound('jump', { x: lp.x, y: lp.y, listenerX: lp.x, listenerY: lp.y, volume: 0.3 }); }
    } else if (ev.type === 'land') {
      if (raidState.enabled) emitRaidNoise(raidState, { x: ev.x, y: ev.y, floorId: floorForY(ev.y), radius: ev.hard ? 13 : 6.5, intensity: ev.hard ? 0.82 : 0.32, kind: ev.hard ? 'hard-land' : 'land' });
      burst(ev.x, ev.y, ev.hard ? 14 : 7, '#9a8a70', ev.hard ? 5 : 3);
      if (ev.hard) { addTrauma(0.25); hitStop(0.03); }
      { const lp = player.torso.getPosition(); playMovementSound('land', { x: ev.x, y: ev.y, listenerX: lp.x, listenerY: lp.y, volume: ev.hard ? 0.75 : 0.44 }); }
    } else if (ev.type === 'step') {
      if (raidState.enabled) emitRaidNoise(raidState, { x: ev.x, y: ev.y, floorId: floorForY(ev.y), radius: player.crouch ? 1.8 : 4.2, intensity: player.crouch ? 0.08 : 0.24, kind: player.crouch ? 'sneak-step' : 'step' });
      burst(ev.x, ev.y, 2, '#8a7a60', 1.4);
      { const lp = player.torso.getPosition(); playFootstep({ x: ev.x, y: ev.y, listenerX: lp.x, listenerY: lp.y, emitter: player, source: 'player', volume: 0.38 }); }
    } else if (ev.type === 'fell') {
      resetPlayer();
    }
  }
  player.events.length = 0; // 消费后清空(生产端 update 不再清:帧间 keydown 直调 melee/grenade 的事件要活到这一步)

  stepBullets(dt, C); // 弹丸碰撞/部位倍率/护甲吸收/击杀(systems/combat.js)
  const nade = stepGrenades(dt); // 手雷引信(起爆点交给 handleDetonation)
  if (nade) handleDetonation(nade.x, nade.y);
  stepFx(dt); // 粒子/光束/碎片/痕迹/飘字(systems/fx.js)
  stepPickups(dt, C); // 磁吸/拾取/背包满拦截(systems/combat.js)
  // 波次推进 + 敌人更新 + 开火事件(敌人是 AI 驱动的 Player 实例,开枪走同一套弹道管线)
  // 主菜单待机时 playerAlive=false:敌人不警戒不射击,纯巡逻当背景演示
  const playerAlive = !menuIsOpen() && !raidIntro && pstate.hp > 0 && !player.ragdoll;
  if (raidState.enabled) updateRaid(dt, { state: raidState, player, enemies, playerAlive, rects: LEVEL.rects });
  waves.update(dt, enemies, player, playerAlive);
  for (const e of enemies) {
    const preUpdateSet = raidState.enabled && raidState.activeIncident ? new Set(enemies) : null;
    e.update(dt, player, playerAlive);
    // 守军若在战斗中真的穿过楼梯井/坠到另一层，更新其感知楼层；空中/坠落中则保留最近的有效楼层。
    if (raidState.enabled && e.raidMode && !e.airUnit && e.alive) {
      const liveFloor = floorForY(e.y);
      const floorTop = [0, 3.5, 7, 10.5][liveFloor] ?? 0;
      if (Math.abs((e.y - 0.9) - floorTop) < 0.95) e.raidFloorId = liveFloor;
    }
    // Gunship 会稍后生成无人机；任何在局部支援事件里出现的子实体都继承同一个清算 ID。
    if (preUpdateSet && raidState.activeIncident) {
      for (const newborn of enemies) {
        if (preUpdateSet.has(newborn) || newborn.alarmZoneId) continue;
        newborn.isReinforcement = true; newborn.raidMode = true;
        newborn.raidFloorId = raidState.activeIncident.floorId;
        newborn.alarmZoneId = raidState.activeIncident.id;
        newborn.supportCalled = true;
        if (newborn.alertTo) newborn.alertTo();
      }
    }
    const listenerPos = player.torso.getPosition();
    if (e.audioType === 'gunship' || e.audioType === 'transport') {
      if (e.destroyed) updateAircraftLoop(e, 0, 0, listenerPos.x, listenerPos.y, false, e.audioType, 0);
      else {
        const rotorPower = e.alive === false ? clamp(Math.abs(e.rotorSpd ?? 0) / 26, 0.08, 1) : 1;
        updateAircraftLoop(e, e.x, e.y, listenerPos.x, listenerPos.y, true, e.audioType, rotorPower);
      }
    }
    for (const ev of e.events) {
      const evx = Number.isFinite(ev.x) ? ev.x : e.x;
      const evy = Number.isFinite(ev.y) ? ev.y : e.y;
      const soundOpts = { x: evx, y: evy, listenerX: listenerPos.x, listenerY: listenerPos.y, emitter: e, source: 'enemy', maxDistance: 46 }; 
      if (ev.type === 'shot') {
        if (raidState.enabled && !e.airUnit) emitRaidNoise(raidState, { x: ev.x, y: ev.y, floorId: Number.isInteger(e.raidFloorId) ? e.raidFloorId : floorForY(ev.y), radius: 8.5, intensity: 0.48, kind: 'enemy-fire', faction: 'enemy', life: 0.24 });
        for (const pt of ev.parts) spawnBullet(ev.x, ev.y, pt.dx, pt.dy, ev.stats, pt.damage * ENEMY_DMG_MUL, 'enemy');
        flash.t = 0.05; flash.x = ev.x; flash.y = ev.y; flash.r = 20;
        flash.ang = Math.atan2(ev.parts[0].dy, ev.parts[0].dx);
        if (ev.soundSource === 'rocket') playRocketLaunch({ ...soundOpts, volume: 0.6, maxDistance: 40 });
        else gunSynth(ev.stats?.sfx, ev.soundSource === 'helicopter' ? 0.86 : 0.55, { ...soundOpts, weaponName: ev.weaponName || e.gunName || 'AK-47', source: ev.soundSource || 'enemy', maxDistance: ev.soundSource === 'helicopter' ? 48 : 44, echoTail: !ev.soundSource || ev.soundSource === 'enemy' });
      } else if (ev.type === 'reload') {
        playReloadSound('start', ev.weaponName || e.gunName || 'M4A1', { ...soundOpts, volume: 0.30 });
      } else if (ev.type === 'reloaded') {
        playReloadSound('end', ev.weaponName || e.gunName || 'M4A1', { ...soundOpts, volume: 0.27 });
      } else if (ev.type === 'step') {
        playFootstep({ ...soundOpts, volume: 0.19 });
      } else if (ev.type === 'jump') {
        playMovementSound('jump', { ...soundOpts, volume: 0.16 });
      } else if (ev.type === 'land') {
        playMovementSound('land', { ...soundOpts, volume: ev.hard ? 0.42 : 0.24 });
      } else if (ev.type === 'alert') {
        if (e.alive) playRadioVoice('alert', { ...soundOpts, volume: 0.28, maxDistance: 27 });
      } else if (ev.type === 'callSupport') {
        if (raidState.enabled && e.alive) {
          playRadioVoice('alert', { ...soundOpts, volume: 0.38, maxDistance: 30, distantTail: false });
          spawnRaidReinforcements(e);
        }
        playRadioVoice('alert', { ...soundOpts, volume: 0.48, maxDistance: 30 });
      } else if (ev.type === 'hurt') {
        if (!ev.armored) playRadioVoice('hurt', { ...soundOpts, volume: 0.23, maxDistance: 21 });
      } else if (ev.type === 'droneShatter') {
        playImpactSound('armor', { ...soundOpts, volume: 0.36, maxDistance: 30, source: 'enemy' });
      } else if (ev.type === 'died') {
        playRadioVoice('death', { ...soundOpts, volume: 0.31, maxDistance: 25 });
        if (raidState.enabled && e.raidMode) emitRaidNoise(raidState, { x: ev.x, y: ev.y, floorId: Number.isInteger(e.raidFloorId) ? e.raidFloorId : floorForY(ev.y), radius: 4.5, intensity: 0.18, kind: 'body-fall', faction: 'player', life: 0.25 });
        onEnemyDied(C, ev, e); // 击杀结算;剿匪模式的警觉由听力/尸体发现决定
      } else if (ev.type === 'blast') {
        // 空中单位爆炸(无人机自爆/母体机坠毁):复合特效 + 范围伤害(吃玩家防御)
        explosion(ev.x, ev.y, ev.big);
        addTrauma(ev.big ? 0.5 : 0.22);
        playExplosion(!!ev.big, { ...soundOpts, volume: ev.big ? 0.88 : 0.57, maxDistance: 52 });
        const bp = player.torso.getPosition();
        const bd = Math.hypot(bp.x - ev.x, bp.y - ev.y);
        if (!player.ragdoll && pstate.hp > 0 && bd < ev.r) {
          const pdmg = ev.dmg * (1 - Math.min(0.8, player.defense));
          pstate.hp = Math.max(0, pstate.hp - pdmg);
          C.setHitFlash(0.3);
          floaters.push({ x: bp.x, y: bp.y + 0.6, vy: 2.3, age: 0, text: String(Math.round(pdmg * 10) / 10), color: '#ff5b4a', size: 17, bold: false, life: 0.72, max: 0.72 });
          const kv = player.torso.getLinearVelocity();
          player.torso.setLinearVelocity(Vec2(kv.x + (bp.x - ev.x) / (bd || 1) * 6, kv.y + 3)); // 冲击波掀飞
          if (pstate.hp <= 0) {
            player.setRagdoll(true);
            player.deathImpulse?.({ x: (bp.x - ev.x) / (bd || 1), y: 0.4 }, 'body'); // 被炸飞的方向
            pstate.deadT = 2.5; resetStreak(); addTrauma(0.5); hitStop(0.12);
          }
        }
      } else if (ev.type === 'killed') {
        // 机械击杀结算:金币雨 + 连杀(机械不走血肉管线,没有顿帧/爆浆)
        const coinN = Math.round(ev.coins * (1 + (player.coinGainPct || 0) / 100));
        for (let ci = 0; ci < coinN; ci++) {
          pickups.push({ type: 'coin', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 11, vy: 4.5 + Math.random() * 6, t: Math.random() * 6 });
        }
        addStreak();
        if (ev.big) addTrauma(0.3);
      } else if (ev.type === 'respawn') {
        beep(300, 600, 0.15, 'sine', 0.04);
      }
    }
    e.events.length = 0;
  }
  // 清理已销毁刚体的敌人(波次模式的尸体 20 秒后回收)
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].destroyed) enemies.splice(i, 1);
  }

  world.step(dt, 8, 3);
  // 个体顿帧回填:物理步进后把冻结敌人的位姿摁回快照 —— 只冻它一个,世界照常
  for (const e of enemies) {
    if (e.freezeT > 0) e.pinFrozen();
  }
}

// ---- 手雷起爆结算:特效 + 对敌范围伤害(部位管线) + 掀飞 + 炸地形弹坑 + 震屏 ----
// 玩家不自伤(友军雷不炸主人,扔脚边清怪是常用操作);尸体也吃冲量(炸飞尸块的爽点)
function handleDetonation(x, y) {
  const R = 3.2;
  explosion(x, y, true);
  addTrauma(0.34);
  { const lp = player.torso.getPosition(); playExplosion(true, { x, y, listenerX: lp.x, listenerY: lp.y, volume: 0.86, maxDistance: 52 }); }
  for (const e of enemies) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > R) continue;
    const dir = { x: (e.x - x) / (d || 1), y: (e.y - y) / (d || 1) * 0.6 + 0.55 };
    if (!e.alive) { e.corpseHit?.(dir, 4.5); continue; } // 尸体:只掀不伤
    const dmg = 42 * (1 - 0.65 * (d / R)); // 贴脸 42,边缘 ~15
    e.hit('body', dmg, dir, 1.15);         // 走部位管线:护甲/踉跄/受击反馈全都有
    e.knockback?.(dir.x * 6.5, 5.5);       // 冲击波掀飞
  }
  // 地形:爆心 1.9m 内的可破坏 tile 各吃一发(越近越狠)—— 炸出真实弹坑
  for (const r of [...LEVEL.rects]) {
    if (!r.destructible) continue;
    const dx = Math.max(Math.abs(r.x - x) - r.w / 2, 0);
    const dy = Math.max(Math.abs(r.y - y) - r.h / 2, 0);
    const d = Math.hypot(dx, dy);
    if (d <= 1.9) damageTerrain(r, 60 * (1 - 0.55 * (d / 1.9)), r.x, r.y, { x: 0, y: -1 });
  }
  if (raidState.enabled) emitRaidNoise(raidState, { x, y, floorId: floorForY(y), radius: 36, intensity: 1.4, kind: 'explosion', faction: 'player', life: 0.75 });
  else alertEnemiesNear(enemies, { x, y }, 22); // 传统模式的爆炸声传唤
}

// 角色面板已抽至 systems/hud.js(updateStatusPanel)
// ---- 渲染 ----
// 世界绘制(主视图与狙击放大镜共用,只差相机/画布/倍率)
// 敌人小血条:头顶一条,活着才显示;空中单位可自定义宽度/高度偏移(无人机不画)
function drawEnemyBars(c, enemies, w2sC, scale) {
  const k = scale / 52; // 随缩放/分辨率归一
  for (const e of enemies) {
    if (!e.alive || e.noBar) continue;
    const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
    const [bx, by] = w2sC(e.x, e.y + (e.barDy ?? 1.04));
    const w = (e.barW || 46) * k, h = 5 * k;
    c.fillStyle = 'rgba(10, 10, 14, 0.55)';
    c.fillRect(bx - w / 2 - 1, by - h / 2 - 1, w + 2, h + 2);
    c.fillStyle = ratio > 0.5 ? '#7ac74f' : ratio > 0.25 ? '#ffd166' : '#ff5b4a';
    c.fillRect(bx - w / 2, by - h / 2, w * ratio, h);
  }
}

function drawRespawnFx(c, w2sC, ppmZ, time, frontLayer) {
  const fx = respawnFx;
  if (!fx) return;
  const p = clamp(fx.t / fx.duration, 0, 1);
  const fade = Math.pow(1 - p, 1.25);
  const [x, y] = w2sC(fx.x, fx.y);
  const z = ppmZ / PPM;
  c.save();
  c.globalCompositeOperation = 'screen';
  if (!frontLayer) {
    // 从地面向上掠过的短光柱:只画一次简洁渐变,不生成大量粒子。
    const beam = c.createLinearGradient(x, y - 105 * z, x, y + 42 * z);
    beam.addColorStop(0, 'rgba(255,177,74,0)');
    beam.addColorStop(0.42, `rgba(255,177,74,${0.12 * fade})`);
    beam.addColorStop(1, 'rgba(255,177,74,0)');
    c.fillStyle = beam;
    c.fillRect(x - 17 * z, y - 105 * z, 34 * z, 150 * z);
  }
  const r = (0.28 + p * 1.42) * ppmZ;
  c.strokeStyle = `rgba(255,190,105,${(0.85 * fade).toFixed(3)})`;
  c.lineWidth = Math.max(1, 2.2 * z);
  c.setLineDash([7 * z, 5 * z]);
  c.lineDashOffset = -p * 42 * z;
  c.beginPath();
  c.ellipse(x, y + 0.22 * ppmZ, r, Math.max(5, r * 0.23), 0, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  if (frontLayer && p < 0.78) {
    const a = (1 - p / 0.78) * 0.85;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = a;
    c.fillStyle = '#ffd9a0';
    c.font = `700 ${Math.max(9, 11 * z)}px sans-serif`;
    c.textAlign = 'center';
    c.fillText('HERO  /  REDEPLOYED', x, y - 68 * z);
    c.fillStyle = 'rgba(255,177,74,0.7)';
    c.fillRect(x - 44 * z, y - 60 * z, 88 * z, Math.max(1, z));
  }
  c.restore();
}

function drawWorld(c, camO, VW, VH, ppmZ, time) {
  const zl = ppmZ / PPM; // 像素尺寸随倍率缩放
  const z = zl;
  const w2sC = makeW2S(camO, VW, VH, PPM); // 与 camera.js 同一份公式(狙击镜内视图也走这里)
  drawSky(c, VW, VH);
  drawParallax(c, VW, VH, camO.x, PPM);
  if (raidState.enabled) drawBuildingInterior(c, w2sC, ppmZ, time, lightingState);
  if (raidState.enabled) drawRaidVision(c, w2sC, ppmZ, time, VW, VH);
  drawTerrain(c, LEVEL.rects, w2sC, ppmZ, time, lightingState);
  if (raidIntro) {
    const rp = player.torso.getPosition();
    const u = clamp(raidIntro.t / raidIntro.duration, 0, 1);
    const heliFade = clamp((1 - u) / 0.18, 0, 1);
    const [rx, ry] = w2sC(raidIntro.heliX, raidIntro.heliY);
    const [tx, ty] = w2sC(rp.x, rp.y + 0.52);
    // 绳索 + 快速绘制的运输直升机剪影；不创建实体/贴图，绳降时才绘制。
    c.save();
    c.globalAlpha = clamp((1 - u) * 5, 0, 1);
    c.strokeStyle = 'rgba(225,232,240,0.82)'; c.lineWidth = Math.max(1.2, ppmZ * 0.025); c.setLineDash([7, 5]);
    c.beginPath(); c.moveTo(rx, ry + 9); c.lineTo(tx, ty); c.stroke(); c.setLineDash([]);
    const hs = Math.max(0.58, Math.min(1.1, ppmZ / 52));
    c.globalAlpha = heliFade;
    c.translate(rx, ry - 3 * hs);
    c.scale(hs, hs);
    const rotor = Math.sin(time * 76) * 5;
    c.fillStyle = '#101b27'; c.strokeStyle = '#708497'; c.lineWidth = 1.5;
    // tail boom
    c.beginPath(); c.moveTo(-20, 0); c.lineTo(-45, -4); c.lineTo(-50, -1); c.lineTo(-24, 5); c.closePath(); c.fill(); c.stroke();
    // tail fin and tail rotor
    c.fillStyle = '#263747'; c.beginPath(); c.moveTo(-47, -4); c.lineTo(-43, -13); c.lineTo(-38, -4); c.closePath(); c.fill();
    c.strokeStyle = '#b1bdc8'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-48, -7); c.lineTo(-48, 5); c.moveTo(-54, -1); c.lineTo(-42, -1); c.stroke();
    // main fuselage
    c.fillStyle = '#182633'; c.strokeStyle = '#8193a0'; c.lineWidth = 1.7;
    c.beginPath(); c.moveTo(-25, -2); c.quadraticCurveTo(-19, -12, -5, -12); c.lineTo(12, -10); c.quadraticCurveTo(27, -6, 28, 1); c.lineTo(19, 6); c.lineTo(-16, 6); c.closePath(); c.fill(); c.stroke();
    // cockpit glass + cargo-door details
    c.fillStyle = '#6fa0b5'; c.beginPath(); c.moveTo(13, -8); c.lineTo(23, -5); c.lineTo(24, 0); c.lineTo(12, 0); c.closePath(); c.fill();
    c.fillStyle = '#314a5b'; c.fillRect(-11, -8, 16, 11);
    c.strokeStyle = '#a4b4c0'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-4, -7); c.lineTo(-4, 2); c.moveTo(4, -7); c.lineTo(4, 2); c.stroke();
    // rotor mast + animated blades
    c.strokeStyle = '#90a0ad'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -11); c.lineTo(0, -17); c.stroke();
    c.strokeStyle = 'rgba(190,205,215,0.88)'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-37, -17 + rotor * 0.18); c.lineTo(37, -17 - rotor * 0.18); c.stroke();
    // landing skids
    c.strokeStyle = '#82929e'; c.lineWidth = 2; c.beginPath(); c.moveTo(-17, 9); c.lineTo(18, 9); c.moveTo(-14, 5); c.lineTo(-18, 9); c.moveTo(14, 5); c.lineTo(18, 9); c.stroke();
    // insertion lamp flashes at a restrained rate
    if (Math.sin(time * 5.8) > 0.25) { c.fillStyle = '#ffb14a'; c.beginPath(); c.arc(-17, -2, 2.1, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }

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
    } else if (d.kind === 'scorch') { // 爆炸焦痕:黑芯 + 暗棕外晕;淡出曲线比弹孔早(前 1/3 保持,后 2/3 渐隐)
      const fade = clamp(d.life / d.max * 3, 0, 1);
      const r = Math.max(2, d.size * ppmZ);
      c.globalAlpha = 0.6 * fade;
      c.fillStyle = '#191512';
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.35 * fade;
      c.fillStyle = '#3a2c1e';
      c.beginPath(); c.arc(0, 0, r * 1.6, 0, Math.PI * 2); c.fill();
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
  drawGrenades(c, w2sC, ppmZ, time); // 手雷(引信读秒弧 + 红灯急闪)

  // 可搜尸体标记:还有战利品没拿走的尸体,头顶一枚下沉闪烁的三角(不抢眼,找得到)
  for (const e of enemies) {
    if (e.alive || e.destroyed || e.airUnit || !e.loot) continue;
    const left = ['gun', 'head', 'body'].filter((k) => e.loot[k] && !e.lootTaken[k]).length;
    if (!left) continue;
    const [mx, my] = w2sC(e.x, e.y + 1.35 + Math.sin(time * 3 + e.x) * 0.08);
    const a = 0.55 + 0.35 * Math.sin(time * 4 + e.x);
    c.fillStyle = `rgba(255, 210, 110, ${(a * 0.9).toFixed(2)})`;
    c.beginPath();
    c.moveTo(mx - 6 * zl, my - 8 * zl);
    c.lineTo(mx + 6 * zl, my - 8 * zl);
    c.lineTo(mx, my + 2 * zl);
    c.closePath(); c.fill();
    c.fillStyle = `rgba(255, 240, 200, ${(a * 0.5).toFixed(2)})`;
    c.font = `bold ${Math.round(10 * zl)}px sans-serif`; c.textAlign = 'center';
    c.fillText('Tab', mx, my + 14 * zl);
    c.textAlign = 'left';
  }

  // 子弹曳光:沿速度反向的渐变拖尾,越快越长(主武器更粗更长;火箭弹粗橙尾焰)
  for (const b of bullets) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const len = Math.min(sp * 0.055, b.rocket ? 2.6 : b.rifle ? 2.2 : 1.6);
    const [x1, y1] = w2sC(b.x - (b.vx / sp) * len, b.y - (b.vy / sp) * len);
    const [x2, y2] = w2sC(b.x, b.y);
    const g = c.createLinearGradient(x1, y1, x2, y2);
    if (b.rocket) {
      g.addColorStop(0, 'rgba(255, 90, 30, 0)');
      g.addColorStop(0.6, 'rgba(255, 140, 50, 0.75)');
      g.addColorStop(1, 'rgba(255, 220, 130, 0.95)');
    } else {
      g.addColorStop(0, 'rgba(255, 200, 100, 0)');
      g.addColorStop(0.65, 'rgba(255, 225, 150, 0.7)');
      g.addColorStop(1, 'rgba(255, 255, 240, 1)');
    }
    c.strokeStyle = g;
    c.lineWidth = (b.rocket ? 8 : b.rifle ? 4.5 : 3.5) * zl; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    // 亮芯
    const [cx, cy] = w2sC(b.x - (b.vx / sp) * len * 0.3, b.y - (b.vy / sp) * len * 0.3);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = (b.rocket ? 2.6 : b.rifle ? 1.8 : 1.4) * zl;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(x2, y2); c.stroke();
  }

  // 爆炸冲击波环:外环亮 + 内环淡,随扩张变粗后消散
  for (const r of rings) {
    const a = r.life / r.max;
    const [rx, ry] = w2sC(r.x, r.y);
    c.strokeStyle = `rgba(${r.color},${(a * 0.75).toFixed(2)})`;
    c.lineWidth = (1.5 + 5 * a) * zl;
    c.beginPath(); c.arc(rx, ry, r.r * ppmZ, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = `rgba(255,255,255,${(a * 0.35).toFixed(2)})`;
    c.lineWidth = 1.2 * zl;
    c.beginPath(); c.arc(rx, ry, r.r * 0.82 * ppmZ, 0, Math.PI * 2); c.stroke();
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

  // 复活先出现短促的战术重部署扫描，再让角色从淡影进入实态。
  if (respawnFx) drawRespawnFx(c, w2sC, ppmZ, time, false);
  c.save();
  if (respawnFx && respawnFx.t < 0.38) c.globalAlpha = 0.12 + 0.88 * clamp(respawnFx.t / 0.38, 0, 1);
  player.draw(c, w2sC, ppmZ, time);
  c.restore();
  if (respawnFx) drawRespawnFx(c, w2sC, ppmZ, time, true);

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
  // Lighting is part of the world pass so the scope and main view share the same light field.
  drawLighting(c, { state: lightingState, rects: LEVEL.rects, w2s: w2sC, ppm: ppmZ, W: VW, H: VH, time, flash, rings });
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
    const ret = loadReticleSettings();
    const size = ret.size, gap = ret.gap;
    ctx.save(); ctx.strokeStyle = ret.color; ctx.fillStyle = ret.color; ctx.lineWidth = 1.5;
    if (ret.style === 'dot') {
      ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill();
    } else if (ret.style === 'circle') {
      ctx.beginPath(); ctx.arc(mx, my, size * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx, my, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (ret.style === 'bracket') {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(mx + sx * gap, my + sy * gap); ctx.lineTo(mx + sx * gap, my + sy * (gap + size));
        ctx.moveTo(mx + sx * gap, my + sy * gap); ctx.lineTo(mx + sx * (gap + size), my + sy * gap); ctx.stroke();
      }
    } else {
      if (ret.style === 'classic') { ctx.beginPath(); ctx.arc(mx, my, size, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath();
      ctx.moveTo(mx - gap - size, my); ctx.lineTo(mx - gap, my);
      ctx.moveTo(mx + gap, my); ctx.lineTo(mx + gap + size, my);
      ctx.moveTo(mx, my - gap - size); ctx.lineTo(mx, my - gap);
      ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + gap + size);
      ctx.stroke();
    }
    ctx.restore();
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

  // 前景图层是可选的：港口/室内/剿匪场景没有 fore.png，不应让此层错误中断整帧。
  try { drawForeground(ctx, W, H, cam.x); }
  catch (err) {
    window.__renderLayerErrors ||= {};
    window.__renderLayerErrors.foreground = String(err && err.stack || err);
  }
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
let lastMenuRender = 0; // 主菜单后面的真实战场预览降至 30 FPS,交互 UI 仍保持 rAF 流畅度
// 子弹时间:轮盘打开时世界只走 8% 速度,指数平滑过渡;轮盘动画走真实 dt
let timeScale = 1;
function frame(now) {
  let dt = STEP;
  try {
    // 按当前战区维持一个低音量环境底床；素材仍在异步解码时会在后续帧自动重试。
    let audioScene = 'wild';
    try { audioScene = localStorage.getItem('contra-scene') || 'wild'; } catch {}
    updateSceneAmbience(audioScene);
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
      if (pstate.deadT <= 0) resetPlayer();
    }
    wheel.update(dt); // 「菜单拥有自己的时钟」:UI 永远实时,世界慢动作
    updateCamera(dt, player, input, W, H, PPM);
    if (respawnFx) {
      respawnFx.t += dt;
      if (respawnFx.t >= respawnFx.duration) respawnFx = null;
    }
    // 菜单背景是真实运行的游戏场景;毛玻璃下 30 FPS 足够表现动势,可显著降低 Canvas/模糊合成负担。
    const inMenuPreview = menuIsOpen();
    if (!inMenuPreview || now - lastMenuRender >= 1000 / 30) {
      // 世界绘制与轮盘 UI 分开保护：地形/视野等视觉层出错时，Tab 轮盘仍可绘制。
      try {
        render(now / 1000);
      } catch (err) {
        window.__lastRenderError = { msg: String(err && err.stack || err), at: new Date().toISOString() };
        // 不能把一帧中已经成功画出的内容清空后留下整屏黑色。
        // 发生意外异常时重置 Canvas 状态，再画一个可读的背景/地形保底层，下一帧继续恢复完整画面。
        canvas.width = W;
        canvas.height = H;
        ctx.imageSmoothingEnabled = true;
        ctx.fillStyle = '#07101a'; ctx.fillRect(0, 0, W, H);
        try { drawSky(ctx, W, H); } catch {}
        try { drawParallax(ctx, W, H, cam.x, PPM); } catch {}
        try { drawTerrain(ctx, LEVEL.rects, makeW2S(cam, W, H, PPM), PPM * cam.zoom); } catch {}
        ctx.fillStyle = 'rgba(255,177,74,.9)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('渲染保护已触发 · window.__lastRenderError', 14, H - 14);
      }
      try {
        wheel.draw(ctx);
      } catch (err) {
        window.__wheelDrawError = String(err && err.stack || err);
      }
      if (inMenuPreview) lastMenuRender = now;
    }
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
  const stateTxt = player.ragdoll ? '失控' : player.crouch ? '下蹲' : player.grounded ? (Math.abs(player.torso.getLinearVelocity().x) > 0.5 ? '奔跑' : '站立') : player.torso.getLinearVelocity().y > 1 ? '上升' : '下落';
  const defPct = Math.round(Math.min(0.8, player.defense) * 100);
  const ammo = player.ammoInfo();
  const ammoTxt = ammo.reloadT > 0 ? '换弹中…' : `弹药 ${ammo.ammo}/${ammo.mag}`;
  const hudTxt = `${stateTxt} · ${player.weapon === 'rifle' ? '主武器' : player.shield ? '手枪+盾' : '手枪'} · ${ammoTxt} · HP ${Math.ceil(pstate.hp)} · 盔 ${Math.ceil((invEquipped('head')?.dur) ?? 0)} · 甲 ${Math.ceil((invEquipped('body')?.dur) ?? 0)} · 熟练度 ${Math.round(player.skill * 100)}% · 防御 ${defPct}% · 后坐力 ${heatBar} · ${fps} FPS · R 换弹 · X 消音器 · E 交互/复位 · B 调试视图`;
  if (hudTxt !== hud._last) { hud.state.textContent = hudTxt; hud._last = hudTxt; } // 脏检查,避免每帧 DOM 写入
  hud.ragdoll.textContent = player.ragdoll ? '失控倒地 · 按 E 起身' : '';
  hud.ragdoll.style.display = player.ragdoll ? 'block' : 'none';
  updateRaidHUD(now);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
window.__frame = frame; // 调试:后台标签页 rAF 会整体暂停(AGENT.md 坑 7),可手动推帧
// 调试:确定性批量推帧(后台标签页验证用)——__frame(0) 的 dt 恒为 0 不会推进,用这个
window.__frameN = (n) => { for (let i = 0; i < n; i++) frame(last + (1000 / 60) * (i + 1)); };
