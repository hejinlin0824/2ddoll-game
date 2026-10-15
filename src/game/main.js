// 魂斗罗风格 2D 布娃娃射击 —— 主循环
import { World, Vec2 } from 'planck';
import { LEVEL, buildLevel, groundYAt, drawSky, drawParallax, drawTerrain, drawForeground } from './level.js';
import { Player } from './player.js';
import { loadSavedGun, EQUIP_PRESETS, QUALITY } from './gunPresets.js';
import { computeArmorMods, itemTitle, AFFIX_BY_ID } from './affixes.js';
import { WeaponWheel } from './wheel.js';
import { Dummy } from './enemies.js';
import { WaveDirector } from './waves.js';
import { invLoad, invGet, invEquipped, invSetEquipped, invSave, invAddCoins, invAddDrop, invIsFull, invInsertItem } from './inventory.js';
import { bpInit, bpToggle, bpIsOpen, bpClose, bpWire, bpSetWorldDrop, bpSetGunInfo } from './backpack.js';
import { menuInit, menuIsOpen, menuShow, menuToggle } from './menu.js';

// webfont 预载:canvas 里的伤害数字/横幅要用,首帧前触发下载(失败静默回退系统字体)
if (document.fonts?.load) {
  ['900 24px "ZCOOL QingKe HuangYou"', '900 24px "ZCOOL KuaiLe"', '400 14px "Noto Sans SC"']
    .forEach((f) => document.fonts.load(f).catch(() => {}));
}
import { QUALITY as Q } from './gunPresets.js';

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
const floaters = [];   // 受击数字
const pickups = [];    // 掉落物:金币 / 0 耐久装备
const decals = [];     // 地面痕迹:弹孔/血渍(容量上限 FIFO)
let ghostT = 0;        // 护甲碎裂白闪+重影

// ---- 手感层状态(全部走真实时间,在 frame() 里衰减)----
let hitStopT = 0;      // 顿帧:世界近冻结(重击/击杀)
let killSlowT = 0;     // 击杀慢动作:0.32× 速
let slowCd = 0;        // 慢动作冷却(防止连续击杀把游戏锁在慢动作里)
let trauma = 0;        // 屏幕震动 trauma(0~1,实际抖动 = trauma²)
let lowHpA = 0;        // 低血量表现强度(平滑)
let heartT = 0;        // 心跳相位
let streak = 0;        // 连杀计数(3s 窗口)
let streakT = 0;
let fullMsgT = 0;      // "背包已满"提示节流
const addTrauma = (x) => { trauma = Math.min(1, trauma + x); };
function hitStop(d) { hitStopT = Math.max(hitStopT, d); }
// 慢放不再是每杀都送:连杀满 5 或清场最后一杀才触发(普通击杀只有顿帧+震动+爆浆)
function killSlow(dur = 0.45) {
  if (slowCd > 0) return;
  slowCd = 1.6;
  killSlowT = Math.max(killSlowT, dur);
}
// 玩家装备视觉/耐久绑定到背包里的"已装备"实例
const VISUAL = () => ({ head: EQUIP_PRESETS.helmet_military, body: EQUIP_PRESETS.vest_light });
invLoad();                  // 背包存档(首次自动发新手装)
syncArmorFromInventory();   // 玩家外观/耐久绑定到已装备实例
bpInit(() => syncArmorFromInventory()); // 背包里装备/修复/升级后同步到玩家
bpSetWorldDrop((item) => { // 背包拖出丢弃 = 完整物品(词缀/耐久保留)落回世界
  const p = player.torso.getPosition();
  pickups.push({
    type: 'armorRef', item, slot: item.slot, quality: item.quality,
    x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + 0.5,
    vx: (Math.random() - 0.5) * 3.2, vy: 4.5, t: 0,
  });
});
bpWire(); // ★ 绑定合成/背包按钮事件(漏掉这行合成按钮就是死的)
bpSetGunInfo(() => ({ main: player.gunDef?.name || '主武器', side: '手枪', weapon: player.weapon }));
menuInit({
  beep,
  noiseBurst,
  onSlam: () => { addTrauma(0.45); menuFlashT = 0.22; }, // 真空门全开瞬间:震屏 + 白光掠过
}); // 主菜单:背景=实时场景,进入时先开缝、停顿、再哗然划开

function syncArmorFromInventory() {
  const h = invEquipped('head'), b = invEquipped('body');
  pstate.armorHead = h;
  pstate.armorBody = b;
  player.loadout.head = h ? VISUAL().head : null;
  player.loadout.torso = b ? VISUAL().body : null;
  player.armorQuality = { head: h?.quality ?? null, body: b?.quality ?? null };
  // 词条聚合:防具词缀 → 玩家属性(HP上限/移速/吸血/掉率/金币/近战)
  const mh = h ? computeArmorMods('head', h.affixes || []) : null;
  const mb = b ? computeArmorMods('body', b.affixes || []) : null;
  player.armorMods = { head: mh, body: mb };
  player.armorLifestealPct = (mh?.lifesteal || 0) + (mb?.lifesteal || 0);
  player.dropRatePct = (mh?.dropRatePct || 0) + (mb?.dropRatePct || 0);
  player.coinGainPct = (mh?.coinGainPct || 0) + (mb?.coinGainPct || 0);
  player.meleeDmgMul = 1 + ((mh?.meleeDmgPct || 0) + (mb?.meleeDmgPct || 0)) / 100;
  player.meleeLsPct = (mb?.meleeLifesteal || 0);
  player.healOnKill = (mh?.healOnKill || 0) + (mb?.healOnKill || 0);
  pstate.maxHp = 30 + (mh?.hpMaxFlat || 0) + (mb?.hpMaxFlat || 0);
  pstate.hp = Math.min(pstate.hp, pstate.maxHp);
}
window.__game = () => ({ player, world, input, bullets, beams, debris, floaters, pickups, cam, wheel, enemies, pstate, waves, decals }); // 调试句柄
window.__actx = () => actx; // 调试:声音问题先看 state('suspended' = 自动播放策略拦住)
window.__feel = () => ({ hitStopT, killSlowT, trauma, streak, streakT, lowHpA, timeScale, menu: menuIsOpen() }); // 调试:手感层状态

// 枪械设计器保存后,游戏页实时换枪/换装(storage 事件跨标签页触发)
window.addEventListener('storage', (e) => {
  if (e.key === 'contra-gun-primary' && player.weapon === 'rifle') {
    player.gunDef = loadSavedGun();
    player.gunMods = computeGunMods(player.gunDef.affixes || []);
  }
  if (e.key === 'contra-equip-head' || e.key === 'contra-equip-torso') {
    player.reloadLoadout();
  }
});

const cam = { x: LEVEL.spawn.x, y: 3.4, shake: 0, zoom: 1, scoped: 0 };

// ---- 输入 ----
const input = { left: false, right: false, down: false, fire: false, jumpPressed: false };
const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyS: 'down', ArrowDown: 'down',
  Space: 'fire',
};
window.addEventListener('keydown', (e) => {
  const pauseKey = e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyM';
  if (bpIsOpen() && pauseKey) return; // 背包开着:Esc 归背包关背包,其余暂停键忽略
  if (menuIsOpen()) {
    // 主菜单/暂停期间:再按暂停键 = 开门继续战斗;其余按键全部吞掉(防背后开枪/切武器)
    if (pauseKey && !e.repeat) { e.preventDefault(); menuToggle(); initAudio(); }
    if (e.code === 'Tab') e.preventDefault();
    return;
  }
  if (pauseKey && !e.repeat) {
    if (wheel.open) wheel.forceClose();
    menuToggle(); // 暂停 = 主菜单合门,世界进入慢速待机
    initAudio();
    return;
  }
  // Tab = 武器轮盘:必须 preventDefault,否则浏览器焦点会切走
  if (e.code === 'Tab') {
    e.preventDefault();
    if (!e.repeat && !wheel.open) wheel.openWheel();
    initAudio();
    return;
  }
  if (wheel.open && e.code === 'KeyT') { e.preventDefault(); wheel.toggleMode(); return; }
  if (KEYMAP[e.code]) {
    if (e.code === 'Space') e.preventDefault();
    if (KEYMAP[e.code] === 'left' || KEYMAP[e.code] === 'right') input[KEYMAP[e.code]] = true;
    else input[KEYMAP[e.code]] = true;
  }
  if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) input.jumpPressed = true;
  if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyV') player.melee(); // 近战:枪托/盾牌冲撞
  if (e.code === 'KeyG') {
    if (wheel.open) wheel.forceClose();
    bpToggle();
    initAudio();
    return;
  }
  if (e.code === 'KeyR') player.setRagdoll(!player.ragdoll);
  if (e.code === 'KeyE') resetPlayer();
  if (e.code === 'KeyB') debugDraw = !debugDraw;
  if (e.code === 'KeyQ') player.setWeapon(player.weapon === 'rifle' ? 'pistol' : 'rifle');
  if (e.code === 'Digit1') player.setWeapon('rifle');
  if (e.code === 'Digit2') player.setWeapon('pistol');
  initAudio();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') { if (wheel.open) wheel.release(); return; }
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
});
window.addEventListener('blur', () => {
  input.left = input.right = input.down = input.fire = false;
  wheel.forceClose(); // 失焦必须收起,否则子弹时间卡住
});

// ---- 鼠标瞄准(canvas 是 object-fit:contain,要算黑边偏移)----
const mouse = { x: 0, y: 0, active: false };
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / W, r.height / H);
  return {
    cx: (e.clientX - r.left - (r.width - W * scale) / 2) / scale,
    cy: (e.clientY - r.top - (r.height - H * scale) / 2) / scale,
  };
}
function toWorld(e) {
  const { cx, cy } = toCanvas(e);
  return { x: (cx - W / 2) / PPM + cam.x, y: (H * 0.60 - cy) / PPM + cam.y };
}
canvas.addEventListener('mousemove', (e) => {
  const p = toWorld(e);
  mouse.x = p.x; mouse.y = p.y; mouse.active = true;
  const c = toCanvas(e);
  mouse.cx = c.cx; mouse.cy = c.cy; // 画布坐标:开镜相机平移量用它算(屏幕点不随相机漂移)
  wheel.setMouse(c.cx, c.cy); // 轮盘吃画布坐标(扇区选择)
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (wheel.open) { wheel.confirm(); initAudio(); return; } // 左键 = 立即应用并收起,不开火
  const p = toWorld(e);
  mouse.x = p.x; mouse.y = p.y; mouse.active = true;
  input.fire = true;
  initAudio();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });

function resetPlayer() {
  player.destroy();
  player = new Player(world, Vec2(LEVEL.spawn.x, LEVEL.spawn.y));
  Object.assign(pstate, freshPstate()); // 复位血量与护甲耐久
  streak = 0; streakT = 0; streakHide(); // 死亡清空连杀
}

// ---- 极简音效(WebAudio 合成,无素材)----
let actx = null;
let master = null, muffle = null; // 主链:master → 低通闷化 → 扬声器(低血量时压截止频率)
function initAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* 无音频 */ } }
  if (actx && !master) {
    master = actx.createGain();
    muffle = actx.createBiquadFilter();
    muffle.type = 'lowpass'; muffle.frequency.value = 16000;
    master.connect(muffle); muffle.connect(actx.destination);
  }
  // 自动播放策略:即使在手势里创建,Context 也可能停在 suspended,必须显式恢复
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
}
const outNode = () => master || actx.destination;
function beep(f0, f1, dur, type = 'square', vol = 0.08, at = 0) {
  if (!actx) return;
  try {
    const t0 = actx.currentTime + at;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(outNode());
    o.start(t0); o.stop(t0 + dur);
  } catch { /* 忽略 */ }
}
// ---- 枪声合成器(三层:低频thump + 主体crack + 噪声爆,参数来自武器词条,音色分明)----
function gunSynth(s, volMul = 1) {
  if (!s || !actx) return;
  // 低频 thump:力量感
  beep(s.f0 * 0.55, s.f1 * 0.55, s.dur * 1.25, 'sine', s.vol * 0.85 * volMul);
  // 主体 crack
  beep(s.f0 * 1.7, s.f1 * 1.15, s.dur * 0.65, 'square', s.vol * 0.65 * volMul);
  // 噪声爆
  noiseBurst(s.dur * 0.55, s.noise * volMul, s.cutoff);
}

// 噪声爆音:给枪声"砰"的力度(缓冲只合成一次复用,每枪新建会造成 GC 卡顿)
let noiseBuf = null;
function noiseBurst(dur = 0.05, vol = 0.08, cutoff = 1200) {
  if (!actx) return;
  try {
    if (!noiseBuf) {
      const n = Math.floor(actx.sampleRate * 0.4);
      noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = clamp(0.4 / dur, 0.25, 4); // 同一缓冲用播放速率近似不同时长
    const f = actx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    src.connect(f).connect(g).connect(outNode());
    src.start();
    src.stop(actx.currentTime + dur);
  } catch { /* 忽略 */ }
}

// ---- 子弹 / 粒子 / 碎片 / 敌人 ----
const bullets = [];
const particles = [];
const beams = [];      // 狙击 hitscan 光束(视觉)
const debris = [];     // 护甲碎片:头盔击飞 / 背心碎裂
export const enemies = []; // 敌人注册表 {x,y,radius,hurt,knockback,zoneAt,hit}
let flashT = 0, flashPos = { x: 0, y: 0 }, flashR = 26, flashAng = 0;

// 波次系统:敌人从地图最右侧刷新,按波推进(15 波,难度从无甲到全金装)
const ENEMY_DMG_MUL = 0.35; // 敌方子弹伤害统一打折(玩家血条 30 才有意义)
const waves = new WaveDirector(world, {
  onEvent: (ev) => {
    const p = player.torso.getPosition();
    if (ev.type === 'wave') {
      floaters.push({ x: p.x, y: p.y + 2.1, vy: 1.1, text: `—— 第 ${ev.wave} 波 · ${ev.count} 人 ——`, color: '#ffb14a', size: 24, bold: true, font: 'hy', life: 1.6, max: 1.6 });
      beep(330, 660, 0.18, 'square', 0.07);
    } else if (ev.type === 'allclear') {
      floaters.push({ x: p.x, y: p.y + 2.1, vy: 0.9, text: '全部清场!你赢了 🎉', color: '#ffd24a', size: 28, bold: true, font: 'hy', life: 3, max: 3 });
      beep(523, 1046, 0.4, 'square', 0.09);
    }
  },
});

// 伤害归一:单发基础伤害 = 1(部位倍率在命中时结算:头×2/身×1/腿×0.2/手臂不判定)
// st = 武器词条;faction = 'player' | 'enemy'
function spawnBullet(x, y, dx, dy, st, damage, faction = 'player') {
  const maxSp = st.muzzleVel;
  const life = (st.range * 1.7) / maxSp; // 曲线变速下飞行 ~0.9 倍射程
  bullets.push({
    x, y, px: x, py: y, vx: dx * maxSp * 0.3, vy: dy * maxSp * 0.3,
    age: 0, rampT: life * 0.42,
    life,
    rifle: st.damage >= 18,            // 曳光粗细
    maxSp, damage, faction,
  });
}

let hitFlashT = 0; // 玩家受击红闪 // 玩家受击红闪
let menuFlashT = 0; // 主菜单开门"哗"瞬间的白光掠过

// 护甲碎片:头盔击飞 / 背心碎裂(品质色)
function spawnHelmetDebris(x, y, quality) {
  debris.push({
    type: 'helmet', color: QUALITY[quality]?.color ?? '#aab0b8',
    x, y, vx: (Math.random() - 0.5) * 4, vy: 4.5 + Math.random() * 2,
    va: (Math.random() - 0.5) * 14, angle: 0, life: 2.6, max: 2.6,
  });
}
function spawnVestDebris(x, y, quality) {
  const col = QUALITY[quality]?.color ?? '#aab0b8';
  for (let i = 0; i < 7; i++) {
    debris.push({
      type: 'shard', color: col, w: 3 + Math.random() * 6, h: 3 + Math.random() * 6,
      x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.4,
      vx: (Math.random() - 0.5) * 5, vy: 1.5 + Math.random() * 3.5,
      va: (Math.random() - 0.5) * 16, angle: Math.random() * 3, life: 2, max: 2,
    });
  }
}

// ---- 地面痕迹:弹孔 / 血渍(FIFO 上限,防止长局堆积)----
function addDecal(kind, x, y, ang, size) {
  decals.push({ kind, x, y, ang, size, life: 9, max: 9 });
  if (decals.length > 90) decals.shift();
}

// ---- 击杀爆浆:血雾粒子 + 大块碎肉(复用碎片旋转矩形)+ 地面血渍 ----
function gibBurst(x, y, dir) {
  const cols = ['#c9563c', '#a83a28', '#e06a50'];
  for (let i = 0; i < 18; i++) {
    particles.push({
      x, y: y + 0.2,
      vx: dir.x * (2 + Math.random() * 5) + (Math.random() - 0.5) * 4,
      vy: dir.y * 3 + 2 + Math.random() * 5,
      life: 0.5 + Math.random() * 0.4, size: 2.2 + Math.random() * 2.6,
      color: cols[i % 3], grav: 1,
    });
  }
  for (let i = 0; i < 4; i++) {
    debris.push({
      type: 'shard', color: '#7d2a1e', w: 4 + Math.random() * 5, h: 3 + Math.random() * 4,
      x, y: y + 0.2,
      vx: dir.x * (1.5 + Math.random() * 3) + (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3.5,
      va: (Math.random() - 0.5) * 18, angle: Math.random() * 3, life: 1.4, max: 1.4,
    });
  }
  addDecal('blood', x, groundYAt(x, y) + 0.02, 0, 0.3 + Math.random() * 0.25);
}

// ---- 连杀计数(里程牌 + 滚轮数字)----
// 调研结论:里程碑公告放顶部居中(DMC 式持续量表才挂角落);等级越高颜色越热
const STREAK_LABEL = (n) => n >= 10 ? '天下无双' : n >= 7 ? '杀神' : n === 6 ? '六连杀' : n === 5 ? '五连杀' : n === 4 ? '四连杀' : n === 3 ? '三连杀' : '双杀';
const STREAK_TIER = (n) => n >= 10 ? { c: '#ff5b4a', glow: '#ff8a5c' } : n >= 7 ? { c: '#ff9a3c', glow: '#ffb14a' } : n >= 5 ? { c: '#ffc21c', glow: '#ffd24a' } : { c: '#ffe9a8', glow: '#fff2cc' };
const odoEl = () => document.getElementById('streakOdo');
function streakShow(n) {
  const box = document.getElementById('streak');
  if (!box) return;
  const tier = STREAK_TIER(n);
  const lbl = document.getElementById('streakLabel');
  lbl.textContent = STREAK_LABEL(n);
  lbl.style.color = tier.c;
  lbl.style.textShadow = `0 0 18px ${tier.glow}88, 0 2px 10px rgba(0,0,0,0.8)`;
  // 滚轮数字:固定位数(补零),每位一根竖排 0-9 胶片,换数时 translateY 滚动
  const odo = odoEl();
  const str = String(Math.min(99, n)).padStart(2, '0');
  while (odo.children.length < str.length) {
    const col = document.createElement('span');
    col.className = 'odo-col' + (odo.children.length === 0 ? ' dim' : '');
    const strip = document.createElement('span');
    strip.className = 'odo-strip';
    strip.innerHTML = '0123456789'.split('').map((d) => `<div>${d}</div>`).join(''); // 竖排胶片
    col.appendChild(strip);
    odo.appendChild(col);
  }
  [...odo.children].forEach((col, i) => {
    col.querySelector('.odo-strip').style.transform = `translateY(-${+str[i]}em)`;
    col.style.color = i === 0 && +str[i] === 0 ? '' : tier.c;
    col.classList.toggle('dim', +str[i] === 0 && i === 0); // 前导零淡化
  });
  box.classList.remove('show', 'big');
  void box.offsetWidth; // 重置动画
  box.classList.add('show');
  if (n % 5 === 0) box.classList.add('big'); // 里程碑:整块弹大
}
function streakHide() {
  const box = document.getElementById('streak');
  if (box) box.classList.remove('show');
}

// ---- 拾取 toast:右下角品质卡,2s 消失(刷宝的爽点在捡到那一眼)----
const SLOT_LABEL = { head: '头盔', body: '防弹衣' };
function lootToast(item) {
  const box = document.getElementById('lootToasts');
  if (!box) return;
  const q = QUALITY[item.quality] || { color: '#aab0b8', label: item.quality };
  const el = document.createElement('div');
  el.className = 'loot-card';
  el.style.borderColor = q.color;
  el.style.boxShadow = `0 0 14px ${q.color}55, inset 0 0 22px ${q.color}18`;
  const lines = (item.affixes || []).map((a) => {
    const def = AFFIX_BY_ID[a.id];
    return def ? `<div class="loot-affix">${def.label} · ${def.fmt(a.v)}</div>` : '';
  }).join('');
  el.innerHTML = `
    <div class="loot-title" style="color:${q.color}">${itemTitle(item.affixes || [], SLOT_LABEL[item.slot] || item.slot)}</div>
    <div class="loot-q">${q.label}${item.dur <= 0 ? ' · 耐久 0(待修复)' : ''}</div>
    ${lines}`;
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 2000);
}

// 玩家受击部位判定(随躯干旋转到局部坐标:趴下/倾斜时判定跟着姿态走,和敌人 zoneAt 同款)
function playerZoneAt(px, py) {
  const h = player.head.getPosition();
  if (Math.hypot(px - h.x, py - h.y) <= 0.18) return 'head'; // 头是独立刚体,世界坐标圆判定天然随姿态
  const t = player.torso.getPosition();
  const a = player.torso.getAngle();
  const c = Math.cos(a), s = Math.sin(a);
  const wx = px - t.x, wy = py - t.y;
  const dx = c * wx + s * wy;
  const dy = -s * wx + c * wy;
  if (Math.abs(dx) <= 0.17 && Math.abs(dy) <= 0.29) return 'body';
  if (Math.abs(dx) <= 0.15 && dy <= -0.29 && dy >= -0.82) return 'legs';
  return null;
}

function burst(x, y, n, color, speed = 4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s,
      life: 0.35 + Math.random() * 0.3, size: 2 + Math.random() * 2.5,
      color, grav: 1,
    });
  }
}

function hitTerrain(x, y) {
  for (const r of LEVEL.rects) {
    if (Math.abs(x - r.x) < r.w / 2 && Math.abs(y - r.y) < r.h / 2) return true;
  }
  return false;
}

// 惊动范围内的敌人(枪声/惨叫传唤):智能感的关键 —— 打远处的兵,他一队的都会动起来
function alertEnemiesNear(pos, r) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.x - pos.x, e.y - pos.y) < r) e.alertTo();
  }
}

// 射线 vs 轴对齐盒(slab 法),返回最近入射距离,不相交返回 Infinity
function rayAABB(x, y, dx, dy, r) {
  let tmin = 0, tmax = Infinity;
  const axes = [[x, dx, r.x, r.w / 2], [y, dy, r.y, r.h / 2]];
  for (const [o, d, c, h] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o - c) > h) return Infinity;
    } else {
      let t1 = (c - h - o) / d, t2 = (c + h - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// 狙击 hitscan:射线终点 = 地形(未来再叠加敌人/盾牌遮挡)
function castRay(x, y, dx, dy, range) {
  let best = range;
  for (const r of LEVEL.rects) {
    const t = rayAABB(x, y, dx, dy, r);
    if (t < best) best = t;
  }
  return Math.max(0, best);
}

// 沿途伤害:第一个命中的敌人全额,之后按词条 falloff 逐个衰减(敌人系统接入后生效)
function applyHitscanDamage(ev, maxT) {
  const d = ev.parts[0];
  const hits = [];
  for (const e of enemies) {
    const rx = e.x - ev.x, ry = e.y - ev.y;
    const t = rx * d.dx + ry * d.dy;                    // 沿线投影
    const off = Math.abs(-rx * d.dy + ry * d.dx);       // 到线距离
    if (t > 0 && t < Math.min(maxT, ev.stats.range) && off < (e.radius ?? 0.35)) {
      hits.push({ e, t });
    }
  }
  hits.sort((a, b) => a.t - b.t);
  let mult = 1;
  for (const h of hits) {
    h.e.hurt?.(ev.parts[0].damage * mult); // 伤害归一后 = 1
    mult *= ev.stats.falloff ?? 0.55;
  }
}

// ---- HUD ----
const hud = {
  state: document.getElementById('hud-state'),
  ragdoll: document.getElementById('hud-ragdoll'),
};

let debugDraw = false;

// ---- 世界坐标 -> 屏幕(狙击开镜时整体按 cam.zoom 放大)----
// 震动不再随机抖:trauma² × 平滑噪声,每帧算好 cam.oX/oY/oR,全画面共用(带轻微旋转让打击更"沉")
function w2s(wx, wy) {
  const z = cam.zoom;
  return [
    (wx - cam.x) * PPM * z + W / 2 + cam.oX,
    H * 0.60 - (wy - cam.y) * PPM * z + cam.oY,
  ];
}

// 准星当前指的世界点:每帧用画布坐标 + 当前相机实时重算。
// 不能存世界快照 —— 相机一动快照就过时,开镜时误差会被放大。
function aimWorld() {
  if (!mouse.active) return null;
  const z = cam.zoom;
  return {
    x: (mouse.cx - W / 2) / (PPM * z) + cam.x,
    y: cam.y + (H * 0.6 - mouse.cy) / (PPM * z),
  };
}

// ---- 物理步进 ----
function step(dt) {
  input.aim = aimWorld();
  if (wheel.open || bpIsOpen() || menuIsOpen()) {
    // 轮盘/背包/主菜单期间禁火;主菜单还锁走位(待机演示画面)
    input.fire = false;
    if (menuIsOpen()) { input.left = input.right = input.down = false; }
  }
  player.update(dt, input);
  input.jumpPressed = false;

  for (const ev of player.events) {
    if (ev.type === 'shot') {
      const st = ev.stats;
      for (const pt of ev.parts) spawnBullet(ev.x, ev.y, pt.dx, pt.dy, st, pt.damage);
      // 弹壳(每次扣扳机一枚,霰弹枪也只掉一枚)
      const m = player.muzzle();
      particles.push({
        x: m.x - ev.parts[0].dx * 0.15, y: m.y, vx: -ev.parts[0].dx * 2 + (Math.random() - 0.5), vy: 3 + Math.random() * 2,
        life: 0.7, size: 2.6, color: '#d9a83c', grav: 1,
      });
      flashT = 0.07; flashPos = { x: ev.x, y: ev.y };
      flashAng = Math.atan2(ev.parts[0].dy, ev.parts[0].dx);
      flashR = st.damage >= 25 ? 38 : 30;
      addTrauma(0.035 + 0.02 * st.recoil); // 开枪:与武器后坐词条挂钩的轻震
      alertEnemiesNear({ x: ev.x, y: ev.y }, 26); // 枪声传唤 26m 内的敌人
      gunSynth(st.sfx); // 每把枪自己的音色词条
    } else if (ev.type === 'hitscanShot') {
      const st = ev.stats;
      const d = ev.parts[0];
      const tEnd = castRay(ev.x, ev.y, d.dx, d.dy, st.range);
      const ex = ev.x + d.dx * tEnd, ey = ev.y + d.dy * tEnd;
      beams.push({ x1: ev.x, y1: ev.y, x2: ex, y2: ey, life: 0.16, max: 0.16 });
      burst(ex, ey, 10, '#cfe8ff', 5);
      flashT = 0.09; flashPos = { x: ev.x, y: ev.y }; flashR = 48;
      flashAng = Math.atan2(ev.parts[0].dy, ev.parts[0].dx);
      addTrauma(0.22); // 狙击:大震
      alertEnemiesNear({ x: ev.x, y: ev.y }, 40); // 狙击枪声更响,传唤更远
      gunSynth(st.sfx);
      beep(2400, 200, 0.16, 'square', 0.045); // 高频"滋"的激光层
      applyHitscanDamage(ev, tEnd);
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
      const dmg = (ev.shield ? 35 : 20) * (player.meleeDmgMul || 1);
      const reach = 1.5;
      for (const e of enemies) {
        const dx = e.x - ev.x, dy = e.y - ev.y;
        const dist = Math.hypot(dx, dy);
        if (dist > reach) continue;
        if ((dx * ev.dx + dy * ev.dy) / (dist || 1) < 0.35) continue; // 约 ±70° 扇形
        e.hurt?.(dmg);
        e.knockback?.(dx / dist * (ev.shield ? 9 : 3.5), ev.shield ? 4 : 2);
        addTrauma(0.1); hitStop(0.025); // 近战命中:短促顿挫
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

  // 子弹:加速 + 碰撞(高速时补测中点防穿透)
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.px = b.x; b.py = b.y;
    // 曲线变速:初速 30%,随飞行时间加速到满速 —— 越飞越快,越打越有劲儿
    b.age += dt;
    const f = Math.min(1, b.age / b.rampT);
    const targetSp = b.maxSp * (0.3 + 0.7 * f * Math.sqrt(f));
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0.001 && targetSp > sp) {
      const k = targetSp / sp;
      b.vx *= k; b.vy *= k;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    // ---- 命中判定(优先级:盾牌 > 部位 > 地形) ----
    let consumed = false;
    const midX = (b.px + b.x) / 2, midY = (b.py + b.y) / 2;
    // 盾牌阻挡:只有敌方子弹会被玩家盾牌挡(当前还没有敌人,逻辑先就位)
    if (b.faction !== 'player' && player.shield && player.shieldHp > 0) {
      const obb = player.shieldOBB();
      let blocked = false;
      for (const [qx, qy] of [[b.x, b.y], [(b.px + b.x) / 2, (b.py + b.y) / 2]]) {
        const rx = qx - obb.x, ry = qy - obb.y;
        const depth = rx * obb.gx + ry * obb.gy;
        const across = -rx * obb.gy + ry * obb.gx;
        if (Math.abs(depth) < obb.ht && Math.abs(across) < obb.hw) {
          burst(qx, qy, 6, '#bfd2e8', 3);
          beep(720, 290, 0.06, 'square', 0.05);
          player.damageShield(b.damage ?? 10);
          blocked = true;
          break;
        }
      }
      if (blocked) { bullets.splice(i, 1); continue; }
    }
    // 尸体阻挡:双方子弹都会被尸体拦下并推动尸体(直到自然消失)
    for (const e of enemies) {
      if (e.alive) continue;
      const dz = e.zoneAt(b.x, b.y) || e.zoneAt(midX, midY);
      if (dz) {
        e.corpseHit({ x: b.vx / (sp || 1), y: b.vy / (sp || 1) }, b.faction === 'player' ? 2.2 : 1.2);
        burst(b.x, b.y, 3, '#c9563c', 2.5);
        bullets.splice(i, 1); consumed = true; break;
      }
    }
    if (consumed) continue;
    if (b.faction === 'player') {
      // 玩家子弹 vs 敌人部位(手臂不判定,子弹穿过)
      for (const e of enemies) {
        const zone = e.zoneAt(b.x, b.y) || e.zoneAt(midX, midY);
        if (!zone) continue;
        const mult = zone === 'head' ? 2 : zone === 'body' ? 1 : 0.2;
        const bdir = { x: b.vx / (sp || 1), y: b.vy / (sp || 1) };
        const res = e.hit(zone, b.damage * mult, bdir);
        // 吸血词条:按造成伤害回血(护甲吸收的部分减半)
        const lsPct = (player.lifestealPct || 0);
        if (lsPct > 0) {
          const heal = b.damage * mult * (res.absorbed ? 0.5 : 1) * (lsPct / 100);
          pstate.hp = Math.min(pstate.maxHp, pstate.hp + heal);
        }
        // 命中分化:甲上火花+金属叮(闷),肉上血雾(脆)—— 调研:反馈通道要按材质分层
        if (res.absorbed) {
          burst(b.x, b.y, 5, '#ffe9a8', 3.6);
          particles.push({ x: b.x, y: b.y, vx: -bdir.x * 2 + (Math.random() - 0.5), vy: 1 + Math.random() * 2, life: 0.3, size: 2, color: '#fff6d8', grav: 0.5 });
          beep(1500, 950, 0.05, 'square', 0.04);
        } else {
          burst(b.x, b.y, 4, zone === 'head' ? '#ffd77a' : '#c9563c', 3);
          // 血雾顺弹道喷一小口
          for (let bi = 0; bi < 2; bi++) {
            particles.push({ x: b.x, y: b.y, vx: bdir.x * (1.5 + Math.random() * 2), vy: bdir.y * 2 + Math.random(), life: 0.32, size: 2.2, color: '#a83a28', grav: 1 });
          }
        }
        // 受击数字:护甲灰 / 普通红 / 爆头金粗
        const shown = Math.round(b.damage * mult * 10) / 10;
        if (res.absorbed) floaters.push({ x: b.x + (Math.random() - 0.5) * 0.12, y: b.y, vy: 2 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 1.4, rot: (Math.random() - 0.5) * 0.3, age: 0, text: String(shown), color: '#dfe6f2', size: 17, bold: false, life: 0.66, max: 0.66 });
        else floaters.push({ x: b.x + (Math.random() - 0.5) * 0.15, y: b.y, vy: (zone === 'head' ? 3.1 : 2.4) + Math.random() * 0.9, vx: (Math.random() - 0.5) * 1.8, rot: (Math.random() - 0.5) * 0.3, age: 0, text: (zone === 'head' ? '爆头 ' : '') + String(shown), color: zone === 'head' ? '#ffc21c' : '#ff5b4a', size: zone === 'head' ? 30 : 21, bold: true, life: zone === 'head' ? 0.9 : 0.78, max: zone === 'head' ? 0.9 : 0.78 });
        if (res.broke === 'head') {
          spawnHelmetDebris(e.x, e.y - 0.4, e.armor.head.quality); // 头盔被击飞
          beep(520, 170, 0.16, 'square', 0.08);
        }
        if (res.broke === 'body') {
          spawnVestDebris(e.x, e.y, e.armor.body.quality); // 背心碎裂
          beep(320, 120, 0.2, 'square', 0.08);
        }
        bullets.splice(i, 1); consumed = true; break;
      }
    } else {
      // 敌方子弹 vs 玩家(有护甲先扣耐久,归零击飞/碎裂+白闪重影;无甲按部位倍率扣血)
      const zone = playerZoneAt(b.x, b.y) || playerZoneAt(midX, midY);
      if (zone) {
        const mult = zone === 'head' ? 2 : zone === 'body' ? 1 : 0.2;
        const dmg = b.damage * mult;
        const item = zone !== 'legs' ? invEquipped(zone) : null;
        if (item && item.dur > 0) {
          item.dur = Math.max(0, Math.round((item.dur - dmg) * 10) / 10);
          burst(b.x, b.y, 4, '#9fb0c4', 3);
          beep(720, 300, 0.06, 'square', 0.05);
          floaters.push({ x: b.x + (Math.random() - 0.5) * 0.12, y: b.y, vy: 2 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 1.4, rot: (Math.random() - 0.5) * 0.3, age: 0, text: String(Math.round(dmg * 10) / 10), color: '#dfe6f2', size: 15, bold: false, life: 0.62, max: 0.62 });
          if (item.dur === 0) { // 护甲碎裂:白闪+重影,装备进背包等修复
            item.equipped = false;
            invSave();
            syncArmorFromInventory();
            ghostT = 0.18; // 一瞬发蒙:快闪即收,不常驻
            addTrauma(0.35);
            const pp = player.torso.getPosition();
            if (zone === 'head') spawnHelmetDebris(pp.x, pp.y + 0.35, item.quality);
            else spawnVestDebris(pp.x, pp.y, item.quality);
            beep(500, 170, 0.18, 'square', 0.08);
          }
          invSave();
      } else {
        // 敌方子弹:玩家防御(0~0.8)减免后扣血
        const dmg = b.damage * mult * (1 - Math.min(0.8, player.defense));
        pstate.hp = Math.max(0, pstate.hp - dmg);
          hitFlashT = 0.3;
          addTrauma(0.18);
          floaters.push({ x: b.x + (Math.random() - 0.5) * 0.15, y: b.y, vy: 2.3 + Math.random() * 0.9, vx: (Math.random() - 0.5) * 1.6, rot: (Math.random() - 0.5) * 0.34, age: 0, text: String(Math.round(dmg * 10) / 10), color: '#ff5b4a', size: 17, bold: false, life: 0.72, max: 0.72 });
          burst(b.x, b.y, 5, '#c9563c', 3.5);
          beep(180, 80, 0.12, 'sawtooth', 0.06);
          if (pstate.hp <= 0 && !player.ragdoll) {
            player.setRagdoll(true); // 倒地
            pstate.deadT = 2.5;
            streak = 0; streakT = 0; streakHide();
            addTrauma(0.5);
            beep(120, 40, 0.5, 'sawtooth', 0.1);
          }
        }
        bullets.splice(i, 1); consumed = true;
      }
    }
    if (consumed) continue;
    const hitNow = hitTerrain(b.x, b.y) || (sp > 14 && hitTerrain((b.px + b.x) / 2, (b.py + b.y) / 2));
    if (hitNow) {
      const hx = (b.px + b.x) / 2, hy = (b.py + b.y) / 2;
      burst(hx, hy, 5, '#ffd77a', 3.5);
      // 弹孔 + 扬尘:打进地形留下痕迹(FIFO 上限)
      addDecal('hole', hx, hy, Math.atan2(b.vy, b.vx), 0.05 + Math.random() * 0.03);
      for (let di = 0; di < 3; di++) {
        particles.push({ x: hx, y: hy, vx: (Math.random() - 0.5) * 3 - b.vx * 0.05, vy: 1 + Math.random() * 2.5, life: 0.4 + Math.random() * 0.25, size: 2 + Math.random() * 2, color: '#8a7c66', grav: 0.9 });
      }
      bullets.splice(i, 1);
      continue;
    }
    if (b.life <= 0) bullets.splice(i, 1);
  }

  // 粒子(弹壳/尘土落到地面弹一下)
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy -= 22 * dt * (p.grav ?? 1);
    const gy = groundYAt(p.x, p.y + 0.5);
    if ((p.grav ?? 1) && p.vy < 0 && p.y <= gy) {
      p.y = gy;
      p.vy *= -0.35; p.vx *= 0.6;
      if (Math.abs(p.vy) < 0.6) { p.vy = 0; p.grav = 0; p.vx *= 0.5; }
    }
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  if (particles.length > 300) particles.splice(0, particles.length - 300);

  // 狙击光束衰减
  for (let i = beams.length - 1; i >= 0; i--) {
    beams[i].life -= dt;
    if (beams[i].life <= 0) beams.splice(i, 1);
  }

  // 护甲碎片物理:重力 + 地面弹跳
  for (let i = debris.length - 1; i >= 0; i--) {
    const p = debris[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 18 * dt;
    p.angle += p.va * dt;
    const gy = groundYAt(p.x, p.y + 0.2);
    if (p.y <= gy && p.vy < 0) { p.y = gy; p.vy *= -0.35; p.vx *= 0.7; p.va *= 0.6; }
    p.life -= dt;
    if (p.life <= 0) debris.splice(i, 1);
  }

  // 地面痕迹:慢慢淡去
  for (let i = decals.length - 1; i >= 0; i--) {
    decals[i].life -= dt;
    if (decals[i].life <= 0) decals.splice(i, 1);
  }

  // 掉落物:金币/装备(重力弹地,靠近磁吸,贴身拾取)
  const ppk = player.torso.getPosition();
  const playerAlivePk = pstate.hp > 0 && !player.ragdoll;
  // 受击数字:果冻式上飘(横向随机漂移,上升减速)
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.age += dt;
    f.x += (f.vx || 0) * dt;
    f.y -= (f.vy || 0) * dt;
    f.vy = Math.max(0.4, f.vy - 2.2 * dt);
    f.life -= dt;
    if (f.life <= 0) floaters.splice(i, 1);
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    pk.t += dt;
    const dxp = ppk.x - pk.x, dyp = (ppk.y + 0.1) - pk.y;
    const distP = Math.hypot(dxp, dyp);
    if (playerAlivePk && distP < (pk.type === 'coin' ? 1.2 : 2.0)) { // 金币要走近才吸,装备 2m 就吸
      const k = (2.2 - distP) / 2.2 * 26;
      pk.vx += (dxp / (distP || 1)) * k * dt * 6;
      pk.vy += (dyp / (distP || 1)) * k * dt * 6;
    } else {
      pk.vy -= 16 * dt;
    }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    const gy = groundYAt(pk.x, pk.y + 0.1);
    if (pk.y <= gy && pk.vy < 0) {
      pk.y = gy;
      pk.vy *= (pk.type === 'coin' ? -0.55 : -0.4); // 金币弹弹弹
      pk.vx *= 0.8;
      if (Math.abs(pk.vy) < 0.8) pk.vy = 0;
    }
    if (playerAlivePk && distP < 0.45) { // 拾取
      if (pk.type === 'coin') {
        invAddCoins(1);
        floaters.push({ x: pk.x, y: gy, vy: 1.5, text: '+1', color: '#ffd24a', size: 14, bold: true, life: 0.75, max: 0.75, vx: (Math.random() - 0.5) * 1.2, rot: (Math.random() - 0.5) * 0.2 });
        beep(880, 1320, 0.07, 'square', 0.04);
      } else if (invIsFull()) {
        // 背包满:东西留在地上,提示做节流(不然每帧刷屏)
        if (fullMsgT <= 0) {
          fullMsgT = 1.4;
          floaters.push({ x: pk.x, y: gy + 0.3, vy: 1.6, text: '背包已满!', color: '#ff9a5c', size: 14, bold: true, life: 0.9, max: 0.9 });
          beep(240, 160, 0.12, 'square', 0.05);
        }
        continue; // 不拾取
      } else {
        const it = pk.type === 'armorRef' ? invInsertItem(pk.item) : invAddDrop(pk.slot, pk.quality);
        if (it) lootToast(it); // 右下角品质卡
        floaters.push({ x: pk.x, y: gy, vy: 1.2, text: `拾获 ${pk.slot === 'head' ? '头盔' : '防弹衣'} · ${(QUALITY[pk.quality]?.label || '').toUpperCase()}`, color: QUALITY[pk.quality]?.color ?? '#fff', size: 11, bold: false, life: 1, max: 1 });
        beep(400, 800, 0.1, 'square', 0.05);
      }
      pickups.splice(i, 1);
      continue;
    }
    if (pickups.length > 80 && pk.t > 25) pickups.splice(i, 1); // 数量兜底,金币常驻等玩家
    // 掉落物不许漂出地图
    if (pk.x < LEVEL.bounds.left + 0.5) { pk.x = LEVEL.bounds.left + 0.5; pk.vx = Math.abs(pk.vx) * 0.4; }
    if (pk.x > LEVEL.bounds.right - 0.5) { pk.x = LEVEL.bounds.right - 0.5; pk.vx = -Math.abs(pk.vx) * 0.4; }
  }

  // 波次推进 + 敌人更新 + 开火事件(敌人是 AI 驱动的 Player 实例,开枪走同一套弹道管线)
  // 主菜单待机时 playerAlive=false:敌人不警戒不射击,纯巡逻当背景演示
  const playerAlive = !menuIsOpen() && pstate.hp > 0 && !player.ragdoll;
  waves.update(dt, enemies, player, playerAlive);
  for (const e of enemies) {
    e.update(dt, player, playerAlive);
    for (const ev of e.events) {
      if (ev.type === 'shot') {
        for (const pt of ev.parts) spawnBullet(ev.x, ev.y, pt.dx, pt.dy, ev.stats, pt.damage * ENEMY_DMG_MUL, 'enemy');
        flashT = 0.05; flashPos = { x: ev.x, y: ev.y }; flashR = 20;
        flashAng = Math.atan2(ev.parts[0].dy, ev.parts[0].dx);
        gunSynth(ev.stats?.sfx, 0.55);
      } else if (ev.type === 'died') {
        // 击杀手感:顿帧+震动+爆浆每杀都给;慢放只在连杀满 5(里程碑奖励)或清场最后一杀
        const head = ev.zone === 'head';
        hitStop(head ? 0.085 : 0.055);
        addTrauma(head ? 0.24 : 0.15);
        gibBurst(ev.x, ev.y, ev.dir || { x: 1, y: 0.3 });
        beep(220, 60, 0.3, 'sawtooth', 0.08);
        alertEnemiesNear(ev, 11); // 死者的惨叫惊动 11m 内的队友
        // 连杀:3s 窗口内连续击杀累计,滚轮数字 + 里程碑标签
        streak++; streakT = 3.0;
        streakShow(streak);
        beep(520 + Math.min(streak, 12) * 65, 900 + Math.min(streak, 12) * 65, 0.1, 'square', 0.05);
        const lastAlive = !enemies.some((e) => e.alive);
        if (streak % 5 === 0) killSlow(0.8);
        else if (lastAlive) killSlow(0.5);
        // 掉落:金币 3~8(贪婪/掠夺加成)+ 装备(猎手/幸运加成)
        const coinN = Math.round(ev.coins * (1 + (player.coinGainPct || 0) / 100));
        for (let ci = 0; ci < coinN; ci++) {
          pickups.push({ type: 'coin', x: ev.x, y: ev.y - 0.3, vx: (Math.random() - 0.5) * 11, vy: 4.5 + Math.random() * 6, t: Math.random() * 6 });
        }
        const dropCh = 0.5 * (1 + (player.dropRatePct || 0) / 100);
        for (const drop of ev.drops) {
          if (Math.random() > dropCh) continue;
          pickups.push({ type: 'armor', slot: drop.slot, quality: drop.quality, x: ev.x + (Math.random() - 0.5) * 0.6, y: ev.y - 0.3, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 2, t: 0 });
        }
        // 击杀回血(回春词条)
        if (player.healOnKill) {
          pstate.hp = Math.min(pstate.maxHp, pstate.hp + player.healOnKill);
        }
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

  flashT = Math.max(0, flashT - dt);
  hitFlashT = Math.max(0, hitFlashT - dt);
  ghostT = Math.max(0, ghostT - dt); // 护甲碎裂白闪必须衰减,否则整屏常白
  menuFlashT = Math.max(0, menuFlashT - dt);
  cam.shake = Math.max(0, cam.shake - dt * 2.2);

  world.step(dt, 8, 3);
}

// ---- 左上角角色面板 ----
const QLABEL = { broken: '破损', normal: '普通', fine: '优良', rare: '稀有', epic: '高级', legendary: '传说' };
function updateStatusPanel() {
  const el = (id) => document.getElementById(id);
  if (!el('pnlHp')) return;
  const hpPct = Math.max(0, pstate.hp / pstate.maxHp) * 100;
  el('pnlHp').style.width = hpPct + '%';
  el('pnlHpText').textContent = `${Math.ceil(pstate.hp)}/${pstate.maxHp}`;
  const h = invEquipped('head'), b = invEquipped('body');
  const hq = h ? QUALITY[h.quality] : null, bq = b ? QUALITY[b.quality] : null;
  el('pnlHelm').style.width = (h ? Math.max(0, h.dur / h.maxDur) * 100 : 0) + '%';
  el('pnlVest').style.width = (b ? Math.max(0, b.dur / b.maxDur) * 100 : 0) + '%';
  el('pnlHelmBar').style.borderColor = hq ? hq.color : 'rgba(244,233,216,0.25)';
  el('pnlVestBar').style.borderColor = bq ? bq.color : 'rgba(244,233,216,0.25)';
  el('pnlHelmText').textContent = h ? `${QLABEL[h.quality]} 盔 ${Math.ceil(h.dur)}` : '无头盔';
  el('pnlVestText').textContent = b ? `${QLABEL[b.quality]} 甲 ${Math.ceil(b.dur)}` : '无护甲';
  el('pnlMain').textContent = player.weapon === 'rifle' ? (player.gunDef?.name || '主武器') : '手枪';
  el('pnlMain').style.opacity = player.weapon === 'rifle' ? 1 : 0.45;
  el('pnlSide').style.opacity = player.weapon === 'pistol' ? 1 : 0.45;
}

// ---- 相机 ----
function updateCamera(dt) {
  const p = player.torso.getPosition();
  // 防线:相机一旦混入非有限值就会永久 NaN 并拖崩整条渲染链 —— 立即复位并留诊断
  if (!Number.isFinite(cam.x + cam.y + cam.zoom + cam.scoped) || !Number.isFinite(p.x + p.y)) {
    window.__camDiag = {
      cam: { x: cam.x, y: cam.y, zoom: cam.zoom, scoped: cam.scoped },
      player: { x: p.x, y: p.y, angle: player.torso.getAngle() },
      vel: player.torso.getLinearVelocity(),
      aim: input.aim, mouse: { x: mouse.x, y: mouse.y },
      at: new Date().toISOString(),
    };
    cam.x = Number.isFinite(p.x) ? p.x : LEVEL.spawn.x;
    cam.y = 3.4; cam.zoom = 1; cam.scoped = 0;
  }
  let tx = p.x + player.facing * 1.4;
  let ty = Math.max(3.4, p.y + 0.6);
  // 狙击开镜:平滑变焦,视点向准星偏移
  const scoped = player.weapon === 'rifle' && player.gunDef.stats?.mode === 'hitscan' && !player.ragdoll ? 1 : 0;
  cam.scoped += (scoped - cam.scoped) * (1 - Math.exp(-7 * dt));
  cam.zoom += ((1 + 0.05 * cam.scoped) - cam.zoom) * (1 - Math.exp(-9 * dt)); // 主视图微变焦,倍率在放大镜里
  if (cam.scoped > 0.02 && mouse.active) {
    // 开镜 = 把准星的"屏幕位置"平移到屏幕中心。
    // ⚠️ 平移量必须用鼠标的画布坐标算(它不随相机变),
    //    用世界坐标追会形成"相机移动→世界点再变"的无限漂移。
    const offX = (mouse.cx - W / 2) / (PPM * cam.zoom);
    const offY = (H * 0.6 - mouse.cy) / (PPM * cam.zoom);
    tx = lerp(tx, tx + offX, cam.scoped);
    ty = lerp(ty, ty + offY, cam.scoped);
  }
  const k = 1 - Math.exp(-6 * dt);
  cam.x = lerp(cam.x, tx, k);
  cam.y = lerp(cam.y, ty, k);
  const half = W / 2 / PPM / cam.zoom;
  cam.x = clamp(cam.x, LEVEL.bounds.left + half, LEVEL.bounds.right - half);

  // trauma 震动:trauma² 曲线(小震细腻大震夸张)+ 平滑噪声(比随机抖动高级,不会闪烁)
  trauma = Math.max(0, trauma - dt * 1.5);
  const sh = trauma * trauma;
  const tn = performance.now() / 1000;
  cam.oX = sh * 16 * nz(tn * 11.3);
  cam.oY = sh * 11 * nz(tn * 13.7 + 41);
  cam.oR = sh * 0.02 * nz(tn * 9.1 + 83);
}
// 分层正弦伪噪声:输出约 ±1 的平滑曲线
const nz = (t) => Math.sin(t) * 0.55 + Math.sin(t * 2.17 + 1.3) * 0.28 + Math.sin(t * 4.9 + 2.1) * 0.17;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  const ox = camO.oX || 0, oy = camO.oY || 0; // trauma 震动偏移(狙击镜自建相机无震动)
  const w2sC = (wx, wy) => [
    (wx - camO.x) * PPM * camO.zoom + VW / 2 + ox,
    VH * 0.60 - (wy - camO.y) * PPM * camO.zoom + oy,
  ];
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
      const grad = ctx.createLinearGradient(px, py - bh, px, py + 8);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.55, qc + '59');
      grad.addColorStop(1, qc + 'cc');
      ctx.fillStyle = grad;
      ctx.fillRect(px - 9, py - bh, 18, bh + 8);
    }

    if (pk.type === 'coin') {
      const spin = Math.abs(Math.sin(pk.t * 4 + pk.x * 7));
      const bob = Math.sin(pk.t * 3 + pk.x * 5) * 2.5;
      ctx.fillStyle = 'rgba(255, 210, 74, 0.16)';
      ctx.beginPath(); ctx.arc(px, py + bob, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.ellipse(px, py + bob, 6.5 * spin + 1.2, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a87808'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(px, py + bob, 6.5 * spin + 1.2, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      const bob = Math.sin(pk.t * 2.6 + pk.x * 3) * 2;
      ctx.save();
      ctx.translate(px, py + bob);
      ctx.strokeStyle = 'rgba(15,12,8,0.5)'; ctx.lineWidth = 1.5;
      if (pk.slot === 'head') {
        // 迷你钢盔:圆顶 + 盔沿
        ctx.fillStyle = '#4a5a3a';
        ctx.beginPath(); ctx.arc(0, 2, 11, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2f3a26';
        ctx.beginPath(); ctx.roundRect(-13, 1, 26, 5, 2); ctx.fill();
        ctx.strokeStyle = 'rgba(15,12,8,0.5)';
        ctx.beginPath(); ctx.arc(0, 2, 11, Math.PI, 0); ctx.stroke();
      } else {
        // 迷你防弹衣:主体 + 领口 + 两格弹匣袋
        ctx.fillStyle = '#3d4652';
        ctx.beginPath(); ctx.roundRect(-13, -14, 26, 27, 5); ctx.fill();
        ctx.fillStyle = qc;
        ctx.beginPath(); ctx.roundRect(-13, -14, 26, 9, [5, 5, 0, 0]); ctx.fill();
        ctx.fillStyle = qc + 'cc';
        ctx.beginPath(); ctx.roundRect(-8, -2, 7, 8, 2); ctx.fill();
        ctx.beginPath(); ctx.roundRect(1, -2, 7, 8, 2); ctx.fill();
        ctx.strokeStyle = 'rgba(15,12,8,0.5)';
        ctx.beginPath(); ctx.roundRect(-13, -14, 26, 27, 5); ctx.stroke();
      }
      ctx.restore();
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

  // 敌人
  for (const e of enemies) e.draw(c, w2sC, ppmZ, time);
  drawEnemyBars(c, enemies, w2sC, PPM * camO.zoom);

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
  if (flashT > 0) {
    const [fx, fy] = w2sC(flashPos.x, flashPos.y);
    const a = flashT / 0.07;
    c.save();
    c.translate(fx, fy);
    c.rotate(-flashAng);
    const L = flashR * zl * (1.0 + Math.random() * 0.5) * (0.55 + a * 0.45);
    const Wd = flashR * zl * 0.30;
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
    c.beginPath(); c.arc(fx, fy, flashR * zl * 0.9, 0, Math.PI * 2); c.fill();
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
  const aimP = aimWorld();
  if (aimP && cam.scoped < 0.5) {
    const [mx, my] = w2s(aimP.x, aimP.y);
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
    const scopeCam = { x: aimP.x, y: aimP.y, zoom: MAG, shake: 0 };
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
  if (menuFlashT > 0) {
    ctx.fillStyle = `rgba(225,235,255,${0.38 * (menuFlashT / 0.22)})`;
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
  if (lowHpA > 0.02) {
    if (!REDVIG) {
      REDVIG = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.92);
      REDVIG.addColorStop(0, 'rgba(160,10,10,0)');
      REDVIG.addColorStop(1, 'rgba(160,10,10,0.9)');
    }
    const pulse = 0.72 + 0.28 * Math.sin(heartT * Math.PI * 2);
    ctx.globalAlpha = clamp(lowHpA * 0.5 * pulse, 0, 0.85);
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
        const [x, y] = w2s(c.x, c.y);
        ctx.arc(x, y, shape.m_radius * PPM, 0, Math.PI * 2);
      } else {
        const verts = shape.m_vertices;
        verts.forEach((v, i) => {
          const wp = b.getWorldPoint(v);
          const [x, y] = w2s(wp.x, wp.y);
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

    // ---- 手感层(全部真实时间)----
    hitStopT = Math.max(0, hitStopT - dt);
    killSlowT = Math.max(0, killSlowT - dt);
    slowCd = Math.max(0, slowCd - dt);
    fullMsgT = Math.max(0, fullMsgT - dt);
    if (streakT > 0) {
      streakT -= dt;
      if (streakT <= 0 && streak > 0) { streak = 0; streakHide(); }
    }
    // 低血量:平滑强度 + 心跳相位(节拍随强度加快)+ 音频闷化。死亡后立即熄灭
    const playerLiving = pstate.hp > 0 && !player.ragdoll;
    const hpR = clamp(pstate.hp / pstate.maxHp, 0, 1);
    lowHpA += ((playerLiving && hpR < 0.35 ? 1 - hpR / 0.35 : 0) - lowHpA) * (1 - Math.exp(-4 * dt));
    if (lowHpA > 0.03) {
      const prev = heartT;
      heartT += dt * (1.15 + lowHpA * 1.1);
      if (Math.floor(heartT) > Math.floor(prev)) { // 整拍触发:咚·哒 双响
        const v = 0.04 + 0.09 * lowHpA;
        beep(62, 38, 0.1, 'sine', v);
        beep(55, 34, 0.09, 'sine', v * 0.7, 0.15);
      }
    }
    if (muffle && actx) muffle.frequency.setTargetAtTime(700 + (1 - lowHpA) * 15300, actx.currentTime, 0.09);

    // ---- 子弹时间合成:菜单待机 > 轮盘/背包 > 顿帧 > 击杀慢放 > 正常 ----
    let tsTarget = menuIsOpen() ? 0.3 : (wheel.open || bpIsOpen()) ? 0.08 : 1;
    if (killSlowT > 0) tsTarget = Math.min(tsTarget, 0.32);
    if (hitStopT > 0) {
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
    updateCamera(dt);
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
  if ((fpsN & 5) === 0) updateStatusPanel();

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
