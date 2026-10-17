// 主菜单:背景就是即将进入的游戏场景(canvas 实时渲染,世界 0.3× 慢速待机演示)。
// 左半毛玻璃 = 标题 + 场景选择 + 按钮;右半毛玻璃 = 选中场景的名称与简介。
// 点「进入战场」:以屏幕中线为界,左半向左、右半向右滑出 —— 像两扇门打开,露出战场。
// 未来加场景 = 在 SCENES 加一条数据(等 level.js 支持多关卡生成后接 activated 钩子)。
import { bpToggle } from './backpack.js';
import { uiSfx } from '../systems/audio.js';
import { loadCustomLevel, isCustomActive, activateCustomLevel, setSceneTheme } from '../world/level.js';

const hasCustom = !!loadCustomLevel();
// 每关:独立素材包 + 独立地形布局 + 独立玩法规则(见 level.js LAYOUTS / waves.js SCENE_RULES)
const SCENES = [
  { id: 'wild', name: '野外 · 月夜', desc: '标准攻势 · 攻防兼备', ready: true },
  { id: 'roof', name: '屋顶 · 黎明', desc: '制空压制 · 空袭频繁', ready: true },
  { id: 'room', name: '港区 · 仓库', desc: '巷战 · 精锐提前到场', ready: true },
  { id: 'desert', name: '沙丘 · 正午', desc: '人海冲锋 · 几乎无遮蔽', ready: true },
  { id: 'tropic', name: '海岛 · 澜', desc: '跳跃节奏 · 滩头遭遇', ready: true },
  { id: 'custom', name: '我的关卡', desc: hasCustom ? '自己画的战场' : '先去战场编辑器画一个', ready: hasCustom },
];

let open = true;
const savedScene = localStorage.getItem('contra-scene');
let scene = SCENES.find((x) => x.id === savedScene && x.ready) || SCENES[0];
activateCustomLevel(scene.id === 'custom'); // 选中态与激活 flag 对齐(防存档清了 flag 还开着)
if (scene.id !== 'custom') setSceneTheme(scene.id); // 主题场景:调色板与存档对齐
let leaveT = null;
let gearT = null;              // 「装备整备」的开背包定时器(1s 内回菜单要取消,见 start/menuShow)
let sfx = () => {};            // main 注入 beep
let boom = () => {};           // main 注入 noiseBurst(开门"哗"的气流声)
let onSlam = () => {};         // main 注入:全开瞬间的震屏+闪光(真空门效果的一部分)
let bootAudio = () => {};      // main 注入 initAudio:菜单按钮点击就是用户手势,在这里启动音频链
let started = false;           // false = 从未进过战场(开始);true = 战斗中回菜单(继续)

export function menuIsOpen() { return open; }
export function helpIsOpen() { const h = document.getElementById('help'); return !!h && h.classList.contains('show'); }
export function helpClose() { closeHelp(); }

// 暂停键唯一入口:菜单开着 → 开门继续战斗;关着 → 合门暂停
export function menuToggle() { if (open) start(false); else menuShow(); }

export function menuInit(opts = {}) {
  sfx = opts.beep || sfx;
  boom = opts.noiseBurst || boom;
  onSlam = opts.onSlam || onSlam;
  bootAudio = opts.initAudio || bootAudio;
  build();
}

// 回主菜单(M/Esc):两扇门从两侧合拢 —— 暂停时长得一模一样,只是"进入战场"变成"继续战斗"
export function menuShow() {
  bootAudio();
  const m = document.getElementById('menu');
  if (!m || open) return;
  open = true;
  clearTimeout(leaveT);
  clearTimeout(gearT); gearT = null; // 还没弹的"装备整备"背包别再弹(玩家已经回菜单了)
  const left = m.querySelector('.menu-left'), right = m.querySelector('.menu-right');
  document.getElementById('menuSeam').style.opacity = '1'; // 斜切边光影:菜单常开时常亮
  document.getElementById('menuStart').textContent = started ? '继 续 战 斗' : '进 入 战 场';
  m.style.display = 'flex';
  document.body.classList.add('in-menu');
  const t0 = performance.now(), D = 700;
  const anim = (now) => {
    if (!open) return;
    const p = Math.min(1, (now - t0) / D);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic 合门
    left.style.transform = `translateX(${(-103 + 103 * e).toFixed(2)}%)`;
    right.style.transform = `translateX(${(103 - 103 * e).toFixed(2)}%)`;
    if (p < 1) requestAnimationFrame(anim);
    else {
      // 门已合拢:竖直形态 morph 回黄金比例斜切,斜切光影淡入
      document.getElementById('menu').classList.remove('opening');
      document.getElementById('menuSeam').style.opacity = '1';
    }
  };
  requestAnimationFrame(anim);
  sfx(340, 520, 0.12, 'sine', 0.05);
}

function start(alsoGear) {
  bootAudio();
  const m = document.getElementById('menu');
  if (!m || !open) return;
  open = false;
  started = true;
  const left = m.querySelector('.menu-left'), right = m.querySelector('.menu-right');
  const seam = document.getElementById('menuGlow'); // 开门辉光 = 竖缝(原版视觉)
  // 第一段:斜切 morph 回竖直(clip-path 过渡,门板不动)—— 斜线直接横移会显得错乱,
  // morph 完成后再跑原版的三段式竖直开门
  m.classList.add('opening');
  // 真空门三段式:先开一条缝(沉重)→ 停顿蓄力(门缝漏光)→ 哗一声朝两边彻底划开
  const GAP = 6;        // 第一段只开 6%
  const T_M = 0.22;                       // 斜切 → 竖直 morph 时长
  const T_A = 0.34, T_B = 0.5, T_C = 0.86; // 秒:A 开缝 / B 停顿 / C 全开(均从 morph 结束起算)
  const t0 = performance.now() + T_M * 1000; // 动画时钟延后一个 morph 期
  sfx(75, 55, 0.32, 'sawtooth', 0.035); // 开缝:沉重的摩擦声
  const anim = (now) => {
    const t = (now - t0) / 1000;
    if (t < 0) { requestAnimationFrame(anim); return; } // morph 中,门板保持合拢
    if (t < T_A) {
      // A:慢推开一条缝(easeOutSine,带一点卡顿抖动)
      const p = 1 - Math.cos((t / T_A) * Math.PI / 2);
      const jitter = Math.sin(t * 60) * 0.35 * (1 - p);
      const off = GAP * p + jitter;
      left.style.transform = `translateX(${(-off).toFixed(2)}%)`;
      right.style.transform = `translateX(${off.toFixed(2)}%)`;
      seam.style.opacity = '0.9';
    } else if (t < T_B) {
      // B:停顿蓄力 —— 门缝里光越来越亮,世界屏息
      const p = (t - T_A) / (T_B - T_A);
      left.style.transform = `translateX(${-GAP}%)`;
      right.style.transform = `translateX(${GAP}%)`;
      seam.style.opacity = (0.9 + p * 0.1).toFixed(2);
      if (!anim.charged) { anim.charged = true; sfx(160, 430, 0.16, 'sine', 0.045); } // 蓄力上扬音
    } else if (t < T_C) {
      // C:哗!easeIn 慢起快走 —— 真空被撕开,门朝两边砸开
      if (!anim.slammed) {
        anim.slammed = true;
        onSlam(); // 震屏 + 白光(main 侧)
        boom(0.32, 0.15, 1000); // 气流爆音
        seam.style.opacity = '0';
      }
      const p = (t - T_B) / (T_C - T_B);
      const e = p * p * p; // easeInCubic:起步沉,收尾飞快
      const off = GAP + (103 - GAP) * e;
      left.style.transform = `translateX(${(-off).toFixed(2)}%)`;
      right.style.transform = `translateX(${off.toFixed(2)}%)`;
    } else {
      m.style.display = 'none';
      left.style.transform = right.style.transform = '';
      seam.style.opacity = '0';
      sfx(64, 30, 0.4, 'sine', 0.11); // 落锁闷响
      return;
    }
    requestAnimationFrame(anim);
  };
  requestAnimationFrame(anim);
  clearTimeout(leaveT);
  leaveT = setTimeout(() => document.body.classList.remove('in-menu'), Math.round(T_B * 1000) + 120); // 门划开的同时 HUD 淡入
  if (alsoGear) {
    clearTimeout(gearT);
    gearT = setTimeout(() => {
      gearT = null;
      if (!open && !helpIsOpen()) bpToggle(); // 触发前再校验:玩家若已回菜单/开帮助就不弹
    }, 1050); // 装备整备:进门后直接开背包
  }
}

function build() {
  const wrap = document.getElementById('menuScenes');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const s of SCENES) {
    const el = document.createElement('button');
    el.className = 'scene-card' + (s === scene ? ' sel' : '') + (s.ready ? '' : ' locked');
    const num = String(SCENES.indexOf(s) + 1).padStart(2, '0');
    const desc = s.ready ? s.desc : '未解锁';
    el.innerHTML = `<span class="sc-num">${num}</span><span class="sc-name">${s.name}</span><span class="sc-desc">${desc}</span>`;
    el.onclick = () => {
      if (!s.ready) return;
      bootAudio();
      activateCustomLevel(s.id === 'custom');
      // 每关地形/素材/玩法都不同 —— 切换 = 存档 + 重载(关卡刚体在创建时按布局生成)
      if (s.id !== 'custom') setSceneTheme(s.id);
      scene = s;
      localStorage.setItem('contra-scene', s.id);
      if (!uiSfx('switch-a')) sfx(520, 760, 0.07, 'square', 0.04);
      setTimeout(() => location.reload(), 260);
    };
    wrap.appendChild(el);
  }
  document.getElementById('menuStart').onclick = () => { uiSfx('click-b', 0.4); start(false); };
  document.getElementById('menuHelp').onclick = () => {
    bootAudio();
    uiSfx('tap-a');
    const h = document.getElementById('help');
    h.style.display = 'flex';
    h.classList.add('show');
  };
  document.getElementById('helpClose').onclick = () => closeHelp();
  document.getElementById('menuGear').onclick = () => { uiSfx('click-a'); start(true); };
  document.body.classList.add('in-menu');
}

function closeHelp() {
  const h = document.getElementById('help');
  if (!h) return;
  h.classList.remove('show');
  setTimeout(() => { h.style.display = 'none'; }, 220);
}

