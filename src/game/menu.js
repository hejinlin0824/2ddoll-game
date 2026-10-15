// 主菜单:背景就是即将进入的游戏场景(canvas 实时渲染,世界 0.3× 慢速待机演示)。
// 左半毛玻璃 = 标题 + 场景选择 + 按钮;右半毛玻璃 = 选中场景的名称与简介。
// 点「进入战场」:以屏幕中线为界,左半向左、右半向右滑出 —— 像两扇门打开,露出战场。
// 未来加场景 = 在 SCENES 加一条数据(等 level.js 支持多关卡生成后接 activated 钩子)。
import { bpToggle } from './backpack.js';

const SCENES = [
  { id: 'wild', name: '野外 · 月夜', desc: '山谷哨卡 · 敌军从东线推进', ready: true },
  { id: 'roof', name: '屋顶 · 黎明', desc: '敬请期待', ready: false },
  { id: 'room', name: '室内 · 仓库', desc: '敬请期待', ready: false },
];

let open = true;
let scene = SCENES[0];
let leaveT = null;
let sfx = () => {};            // main 注入 beep
let boom = () => {};           // main 注入 noiseBurst(开门"哗"的气流声)
let onSlam = () => {};         // main 注入:全开瞬间的震屏+闪光(真空门效果的一部分)
let started = false;           // false = 从未进过战场(开始);true = 战斗中回菜单(继续)

export function menuIsOpen() { return open; }

// 暂停键唯一入口:菜单开着 → 开门继续战斗;关着 → 合门暂停
export function menuToggle() { if (open) start(false); else menuShow(); }

export function menuInit(opts = {}) {
  sfx = opts.beep || sfx;
  boom = opts.noiseBurst || boom;
  onSlam = opts.onSlam || onSlam;
  build();
}

// 回主菜单(M/Esc):两扇门从两侧合拢 —— 暂停时长得一模一样,只是"进入战场"变成"继续战斗"
export function menuShow() {
  const m = document.getElementById('menu');
  if (!m || open) return;
  open = true;
  clearTimeout(leaveT);
  const left = m.querySelector('.menu-left'), right = m.querySelector('.menu-right');
  document.getElementById('menuSeam').style.opacity = '0';
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
  };
  requestAnimationFrame(anim);
  sfx(340, 520, 0.12, 'sine', 0.05);
}

function start(alsoGear) {
  const m = document.getElementById('menu');
  if (!m || !open) return;
  open = false;
  started = true;
  const left = m.querySelector('.menu-left'), right = m.querySelector('.menu-right');
  const seam = document.getElementById('menuSeam');
  // 真空门三段式:先开一条缝(沉重)→ 停顿蓄力(门缝漏光)→ 哗一声朝两边彻底划开
  const GAP = 6;        // 第一段只开 6%
  const T_A = 0.34, T_B = 0.5, T_C = 0.86; // 秒:A 开缝 / B 停顿 / C 全开
  const t0 = performance.now();
  sfx(75, 55, 0.32, 'sawtooth', 0.035); // 开缝:沉重的摩擦声
  const anim = (now) => {
    const t = (now - t0) / 1000;
    if (t < T_A) {
      // A:慢推开一条缝(easeOutSine,带一点卡顿抖动)
      const p = 1 - Math.cos((t / T_A) * Math.PI / 2);
      const jitter = Math.sin(t * 60) * 0.35 * (1 - p);
      const off = GAP * p + jitter;
      left.style.transform = `translateX(${(-off).toFixed(2)}%)`;
      right.style.transform = `translateX(${off.toFixed(2)}%)`;
      seam.style.opacity = '0.25';
    } else if (t < T_B) {
      // B:停顿蓄力 —— 门缝里光越来越亮,世界屏息
      const p = (t - T_A) / (T_B - T_A);
      left.style.transform = `translateX(${-GAP}%)`;
      right.style.transform = `translateX(${GAP}%)`;
      seam.style.opacity = (0.25 + p * 0.75).toFixed(2);
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
  if (alsoGear) setTimeout(() => bpToggle(), 1050); // 装备整备:进门后直接开背包
}

function build() {
  const wrap = document.getElementById('menuScenes');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const s of SCENES) {
    const el = document.createElement('button');
    el.className = 'scene-card' + (s === scene ? ' sel' : '') + (s.ready ? '' : ' locked');
    el.innerHTML = `<span class="sc-dot"></span><span class="sc-name">${s.name}</span><span class="sc-desc">${s.desc}</span>`;
    el.onclick = () => {
      if (!s.ready) return;
      scene = s;
      document.getElementById('menuSceneName').textContent = s.name;
      document.getElementById('menuSceneDesc').textContent = s.desc;
      wrap.querySelectorAll('.scene-card').forEach((c) => c.classList.remove('sel'));
      el.classList.add('sel');
      sfx(520, 760, 0.07, 'square', 0.04);
    };
    wrap.appendChild(el);
  }
  document.getElementById('menuStart').onclick = () => start(false);
  document.getElementById('menuGear').onclick = () => start(true);
  document.body.classList.add('in-menu');
}
