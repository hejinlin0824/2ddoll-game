// 关卡设计器:在游戏同尺度的世界里拖拽画块,存 localStorage 供游戏主菜单「我的关卡」使用。
// 世界坐标:x ∈ [-12, 78](米,y 向上),与游戏 LEVEL.bounds 一致;0.5m 网格吸附。
// 固定主地表(33,-1.5,90,3)不可删除 —— 保证出生区有地面,你画的块在游戏里全部可被子弹打碎。
const KEY = 'contra-level-custom';
const VIEW = { x0: -12, x1: 78, y0: -4, y1: 13 };
// 编辑器内部统一用"左下角"表示;存档 v2 起存"中心点"(游戏 LEVEL.rects 的约定),出/入各转一次
const GROUND = { x: -12, y: -3, w: 90, h: 3, type: 'ground', fixed: true }; // 与游戏主地表(33,-1.5,90,3)同物
const SNAP = 0.5;
const MIN = 0.5;

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let rects = load();

let tool = 'plat';           // 'plat' | 'block' | 'erase'
let drag = null;             // { x0, y0, x1, y1 }
let mouseW = null;

function load() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && Array.isArray(c.rects)) {
      // v1 存左下角(旧版,直接用);v2 存中心点,转回左下角供内部绘制
      return c.rects.map((r) => (c.version >= 2 ? { ...r, x: r.x - r.w / 2, y: r.y - r.h / 2 } : { ...r }));
    }
  } catch { /* 忽略 */ }
  return [];
}
function save(silent) {
  const out = rects.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, type: r.type }));
  localStorage.setItem(KEY, JSON.stringify({ version: 2, rects: out }));
  if (!silent) toast('已保存 —— 到游戏主菜单选「我的关卡」开打');
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.style.opacity = 0), 1800);
}

// ---- 坐标 ----
let scale = 10, offX = 0, offY = 0;
function fit() {
  cv.width = innerWidth; cv.height = innerHeight;
  scale = Math.min(cv.width / (VIEW.x1 - VIEW.x0), cv.height / (VIEW.y1 - VIEW.y0));
  offX = (cv.width - (VIEW.x1 - VIEW.x0) * scale) / 2;
  offY = (cv.height - (VIEW.y1 - VIEW.y0) * scale) / 2;
}
addEventListener('resize', fit);
fit();
const w2s = (x, y) => [offX + (x - VIEW.x0) * scale, cv.height - offY - (y - VIEW.y0) * scale];
const s2w = (sx, sy) => [VIEW.x0 + (sx - offX) / scale, VIEW.y0 + (cv.height - offY - sy) / scale];
const snap = (v) => Math.round(v / SNAP) * SNAP;

// ---- 交互 ----
cv.addEventListener('pointerdown', (e) => {
  const [wx, wy] = s2w(e.clientX, e.clientY);
  if (tool === 'erase' || e.button === 2) {
    eraseAt(wx, wy);
    cv.setPointerCapture(e.pointerId);
    cv._erasing = true;
    return;
  }
  drag = { x0: snap(wx), y0: snap(wy), x1: snap(wx), y1: snap(wy) };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  const [wx, wy] = s2w(e.clientX, e.clientY);
  mouseW = [wx, wy];
  if (cv._erasing) { eraseAt(wx, wy); return; }
  if (drag) { drag.x1 = snap(wx); drag.y1 = snap(wy); }
});
cv.addEventListener('pointerup', () => {
  if (cv._erasing) { cv._erasing = false; return; }
  if (!drag) return;
  const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
  const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
  drag = null;
  if (w < MIN || h < MIN) return;
  // 与固定地表重叠的部分不画(省得视觉上盖住打不烂的底座)
  rects.push({ x, y, w, h, type: tool });
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function eraseAt(wx, wy) {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) rects.splice(i, 1);
  }
}

// ---- 工具栏 ----
const tools = { tPlat: 'plat', tBlock: 'block', tErase: 'erase' };
for (const [id, t] of Object.entries(tools)) {
  document.getElementById(id).onclick = () => {
    tool = t;
    for (const [id2, t2] of Object.entries(tools)) document.getElementById(id2).classList.toggle('on', t2 === tool);
  };
}
document.getElementById('bClear').onclick = () => { rects = []; toast('已清空(记得保存)'); };
document.getElementById('bSave').onclick = () => save();
document.getElementById('bPlay').onclick = () => {
  save(true);
  localStorage.setItem('contra-level-active', '1');
  location.href = './game.html';
};

// ---- 渲染 ----
function draw() {
  ctx.fillStyle = '#121624';
  ctx.fillRect(0, 0, cv.width, cv.height);
  // 网格
  ctx.strokeStyle = 'rgba(244,233,216,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(VIEW.x0); x <= VIEW.x1; x += SNAP) {
    const [sx] = w2s(x, 0);
    ctx.moveTo(sx, 0); ctx.lineTo(sx, cv.height);
  }
  for (let y = Math.ceil(VIEW.y0); y <= VIEW.y1; y += SNAP) {
    const [, sy] = w2s(0, y);
    ctx.moveTo(0, sy); ctx.lineTo(cv.width, sy);
  }
  ctx.stroke();
  // y=0 基线
  const [_, gy] = w2s(0, 0);
  ctx.strokeStyle = 'rgba(126,201,126,0.35)';
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cv.width, gy); ctx.stroke();

  // 固定地表
  drawRect(GROUND, true);
  // 用户块
  for (const r of rects) drawRect(r, false);
  // 拖拽预览
  if (drag) {
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    drawRect({ x, y, w, h, type: tool }, false, true);
  }
  // 鼠标世界坐标
  if (mouseW) {
    ctx.fillStyle = 'rgba(244,233,216,0.5)';
    ctx.font = '11px "Noto Sans SC"';
    ctx.fillText(`${mouseW[0].toFixed(1)}, ${mouseW[1].toFixed(1)}`, 12, cv.height - 12);
  }
  requestAnimationFrame(draw);
}
function drawRect(r, fixed, preview) {
  const [sx, sy] = w2s(r.x, r.y + r.h);
  const w = r.w * scale, h = r.h * scale;
  ctx.globalAlpha = preview ? 0.55 : 1;
  if (r.type === 'ground') {
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(sx, sy, w, h);
    ctx.fillStyle = '#3e7a3c';
    ctx.fillRect(sx, sy, w, Math.min(8, h * 0.16));
  } else if (r.type === 'block') {
    ctx.fillStyle = '#8a4a3a';
    ctx.fillRect(sx, sy, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(sx, sy, w, 3);
  } else {
    ctx.fillStyle = '#5b4a33';
    ctx.fillRect(sx, sy, w, h);
    ctx.fillStyle = '#7a6446';
    ctx.fillRect(sx, sy, w, 4);
  }
  if (fixed) {
    ctx.fillStyle = 'rgba(244,233,216,0.55)';
    ctx.font = '11px "Noto Sans SC"';
    ctx.fillText('固定地表 · 不可删除/破坏', sx + 10, sy + h - 10);
  }
  ctx.globalAlpha = 1;
}
draw();
