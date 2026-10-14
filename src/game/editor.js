// 枪械设计器:拼部件 + 标记前后手握点与枪口,保存到 localStorage 供游戏读取
import {
  PART_TYPES, GUN_PRESETS, METER_SCALE,
  EQUIP_PRESETS, EQUIP_SLOTS, loadEquip, saveEquip,
} from './gunPresets.js';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const toastEl = document.getElementById('toast');

let parts = [];                       // {x,y,w,h,color}
let grips = { front: { x: 129, y: 27 }, rear: { x: 71, y: 42 } };
let muzzle = { x: 176, y: 27 };
let selected = -1;                    // 选中部件下标;'front' | 'rear' | 'muzzle' 为标记
let drag = null;                      // {kind, idx, ox, oy}

// ---- 初始化:草稿 > 预设 ----
(function init() {
  try {
    const raw = localStorage.getItem('contra-gun-draft');
    if (raw) {
      const g = JSON.parse(raw);
      if (Array.isArray(g.parts)) { parts = g.parts; grips = g.grips; muzzle = g.muzzle; return; }
    }
  } catch { /* 忽略 */ }
  loadPreset('AK-47');
})();

function loadPreset(name) {
  const g = GUN_PRESETS[name];
  parts = g.parts.map((p) => ({ ...p }));
  grips = { front: { ...g.grips.front }, rear: { ...g.grips.rear } };
  muzzle = { ...g.muzzle };
  selected = -1;
  saveDraft();
  draw();
}

function saveDraft() {
  try { localStorage.setItem('contra-gun-draft', JSON.stringify({ parts, grips, muzzle })); } catch { /* 忽略 */ }
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.style.opacity = 0), 1800);
}

// ---- 工具栏 ----
const presetSel = document.getElementById('preset');
for (const name of Object.keys(GUN_PRESETS)) {
  const o = document.createElement('option');
  o.value = name; o.textContent = `预设:${name}`;
  presetSel.appendChild(o);
}
presetSel.onchange = () => loadPreset(presetSel.value);

const palette = document.getElementById('palette');
for (const [type, def] of Object.entries(PART_TYPES)) {
  const b = document.createElement('button');
  b.textContent = `+ ${def.label}`;
  b.onclick = () => {
    parts.push({ x: 380, y: 110, w: def.w, h: def.h, color: def.color });
    selected = parts.length - 1;
    saveDraft(); draw(); renderProps();
  };
  palette.appendChild(b);
}

document.getElementById('save').onclick = () => {
  if (!parts.length) { toast('画布是空的,先拼一把枪'); return; }
  try {
    localStorage.setItem('contra-gun-primary', JSON.stringify({
      name: '自定义主武器', meterScale: METER_SCALE, parts, grips, muzzle,
    }));
    toast('已保存!切回游戏页即可看到新枪(开着会自动生效)');
  } catch { toast('保存失败:浏览器存储不可用'); }
};

document.getElementById('clear').onclick = () => { parts = []; selected = -1; saveDraft(); draw(); renderProps(); };
document.getElementById('reset').onclick = () => loadPreset(presetSel.value || 'AK-47');

// ---- 属性面板 ----
const propsEl = document.getElementById('props');
function renderProps() {
  if (selected < 0 || !parts[selected]) {
    propsEl.innerHTML = '<span style="opacity:0.5">点击画布里的部件编辑属性</span>';
    return;
  }
  const p = parts[selected];
  propsEl.innerHTML = '';
  const mk = (label, key, type = 'number', step = 2) => {
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.type = type; i.value = p[key];
    if (type === 'number') i.step = step;
    i.oninput = () => {
      const v = type === 'number' ? parseFloat(i.value) || 0 : i.value;
      p[key] = Math.max(2, v);
      saveDraft(); draw();
    };
    l.appendChild(i);
    propsEl.appendChild(l);
  };
  mk('X', 'x'); mk('Y', 'y'); mk('宽', 'w'); mk('高', 'h');
  const cl = document.createElement('label');
  cl.textContent = '颜色';
  const ci = document.createElement('input');
  ci.type = 'color'; ci.value = p.color;
  ci.oninput = () => { p.color = ci.value; saveDraft(); draw(); };
  cl.appendChild(ci);
  propsEl.appendChild(cl);
  const dup = document.createElement('button');
  dup.textContent = '复制';
  dup.onclick = () => { parts.push({ ...p, x: p.x + 12, y: p.y + 12 }); selected = parts.length - 1; saveDraft(); draw(); renderProps(); };
  const del = document.createElement('button');
  del.textContent = '删除';
  del.onclick = () => { parts.splice(selected, 1); selected = -1; saveDraft(); draw(); renderProps(); };
  propsEl.appendChild(dup);
  propsEl.appendChild(del);
}

// ---- 画布交互 ----
function hitTest(mx, my) {
  // 标记优先
  for (const [kind, g] of [['front', grips.front], ['rear', grips.rear], ['muzzle', muzzle]]) {
    if (Math.hypot(mx - g.x, my - g.y) < 12) return { kind, idx: -1 };
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) return { kind: 'part', idx: i };
  }
  return null;
}

cv.addEventListener('mousedown', (e) => {
  const r = cv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const hit = hitTest(mx, my);
  if (!hit) { selected = -1; draw(); renderProps(); return; }
  selected = hit.idx;
  const g = hit.kind === 'front' ? grips.front : hit.kind === 'rear' ? grips.rear : hit.kind === 'muzzle' ? muzzle : parts[hit.idx];
  drag = { kind: hit.kind, idx: hit.idx, ox: mx - g.x, oy: my - g.y };
  draw(); renderProps();
});

cv.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const r = cv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const g = drag.kind === 'front' ? grips.front : drag.kind === 'rear' ? grips.rear : drag.kind === 'muzzle' ? muzzle : parts[drag.idx];
  if (!g) return;
  g.x = Math.round((mx - drag.ox) / 2) * 2;
  g.y = Math.round((my - drag.oy) / 2) * 2;
  if (drag.kind === 'part') { draw(); if (selected === drag.idx) renderProps(); }
  else draw();
});

window.addEventListener('mouseup', () => {
  if (drag) { drag = null; saveDraft(); }
});

// ---- 绘制 ----
function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < cv.width; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); }
  for (let y = 0; y < cv.height; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); }
  // 标尺(1m = 200px,横向)
  ctx.strokeStyle = 'rgba(232,160,76,0.5)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(20, cv.height - 14);
  ctx.lineTo(220, cv.height - 14);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(232,160,76,0.7)';
  ctx.font = '11px sans-serif';
  ctx.fillText('1m', 108, cv.height - 3);

  // 部件
  parts.forEach((p, i) => {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, 3);
    ctx.fill();
    if (i === selected) {
      ctx.strokeStyle = '#ff9a3c';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
    }
  });

  drawMarker(grips.front, '#ff9a3c', '前手(副手)');
  drawMarker(grips.rear, '#4d9fff', '后手(瞄准手)');
  drawMuzzleMarker(muzzle);
}

function drawMarker(g, color, label) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(g.x, g.y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(g.x, g.y, 11, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '12px sans-serif';
  ctx.fillText(label, g.x + 14, g.y + 4);
}

function drawMuzzleMarker(g) {
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.x, g.y - 9); ctx.lineTo(g.x + 9, g.y); ctx.lineTo(g.x, g.y + 9); ctx.lineTo(g.x - 9, g.y);
  ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(g.x - 1.5, g.y - 1.5, 3, 3);
  ctx.font = '12px sans-serif';
  ctx.fillText('枪口', g.x + 13, g.y - 6);
}

draw();
renderProps();

// ---- 装备定制(头盔/防弹衣):部件画在身体局部空间,穿上后游戏内跟随身体 ----
const eqcv = document.getElementById('eqcv');
const eqctx = eqcv.getContext('2d');
const eqPresetSel = document.getElementById('eq-preset');
const eqDefenseInput = document.getElementById('eq-defense');
const slotBtns = {
  head: document.getElementById('eq-slot-head'),
  torso: document.getElementById('eq-slot-torso'),
};

let eqSlot = 'head';
let eqParts = [];
let eqDefense = 0.35;
let eqSelected = -1;
let eqDrag = null;

function eqRefreshPresets() {
  eqPresetSel.innerHTML = '';
  const cur = document.createElement('option');
  cur.value = '__current';
  cur.textContent = '(当前穿戴)';
  eqPresetSel.appendChild(cur);
  for (const [k, p] of Object.entries(EQUIP_PRESETS)) {
    if (p.slot !== eqSlot) continue;
    const o = document.createElement('option');
    o.value = k;
    o.textContent = `预设:${p.name}`;
    eqPresetSel.appendChild(o);
  }
}

function eqLoad(slot, presetKey) {
  eqSlot = slot;
  slotBtns.head.classList.toggle('active', slot === 'head');
  slotBtns.torso.classList.toggle('active', slot === 'torso');
  eqRefreshPresets();
  let data;
  if (presetKey && presetKey !== '__current' && EQUIP_PRESETS[presetKey]) {
    data = EQUIP_PRESETS[presetKey];
    eqPresetSel.value = presetKey;
  } else {
    data = loadEquip(slot);
    eqPresetSel.value = '__current';
  }
  eqParts = data ? data.parts.map((p) => ({ ...p })) : [];
  eqDefense = data?.defense ?? 0.3;
  eqDefenseInput.value = eqDefense;
  eqSelected = -1;
  eqDraw();
}

function eqSave() {
  if (!eqParts.length) { saveEquip(eqSlot, null); toast(`已脱下${EQUIP_SLOTS[eqSlot].label}`); return; }
  saveEquip(eqSlot, {
    name: `自定义${EQUIP_SLOTS[eqSlot].label}`,
    slot: eqSlot,
    defense: parseFloat(eqDefenseInput.value) || 0,
    meterScale: METER_SCALE,
    parts: eqParts,
  });
  toast(`已穿上${EQUIP_SLOTS[eqSlot].label}!切回游戏页即可看到`);
}

document.getElementById('eq-save').onclick = eqSave;
document.getElementById('eq-clear').onclick = () => { eqParts = []; eqSave(); eqDraw(); };
slotBtns.head.onclick = () => eqLoad('head');
slotBtns.torso.onclick = () => eqLoad('torso');
eqPresetSel.onchange = () => eqLoad(eqSlot, eqPresetSel.value);
eqDefenseInput.oninput = () => { eqDefense = parseFloat(eqDefenseInput.value) || 0; };

function eqHit(mx, my) {
  for (let i = eqParts.length - 1; i >= 0; i--) {
    const p = eqParts[i];
    if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) return i;
  }
  return -1;
}

eqcv.addEventListener('mousedown', (e) => {
  const r = eqcv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  eqSelected = eqHit(mx, my);
  if (eqSelected >= 0) {
    const p = eqParts[eqSelected];
    eqDrag = { idx: eqSelected, ox: mx - p.x, oy: my - p.y };
  }
  eqDraw();
});

eqcv.addEventListener('mousemove', (e) => {
  if (!eqDrag) return;
  const r = eqcv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const p = eqParts[eqDrag.idx];
  if (!p) return;
  p.x = Math.round((mx - eqDrag.ox) / 2) * 2;
  p.y = Math.round((my - eqDrag.oy) / 2) * 2;
  eqDraw();
});

window.addEventListener('mouseup', () => { if (eqDrag) { eqDrag = null; saveDraft(); } });

function eqDraw() {
  const W = eqcv.width, H = eqcv.height, cx = W / 2, cy = H / 2 + 10;
  eqctx.clearRect(0, 0, W, H);
  eqctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let x = 0; x < W; x += 20) { eqctx.beginPath(); eqctx.moveTo(x, 0); eqctx.lineTo(x, H); eqctx.stroke(); }
  for (let y = 0; y < H; y += 20) { eqctx.beginPath(); eqctx.moveTo(0, y); eqctx.lineTo(W, y); eqctx.stroke(); }

  // 身体参考轮廓
  eqctx.fillStyle = 'rgba(226, 176, 136, 0.35)';
  if (eqSlot === 'head') {
    eqctx.beginPath(); eqctx.arc(cx, cy, 30, 0, Math.PI * 2); eqctx.fill();
    eqctx.fillStyle = 'rgba(0,0,0,0.35)';
    eqctx.font = '11px sans-serif';
    eqctx.fillText('头部(半径 30px)', cx - 55, cy + 52);
  } else {
    eqctx.beginPath(); eqctx.roundRect(cx - 30, cy - 52, 60, 104, 10); eqctx.fill();
    eqctx.beginPath(); eqctx.arc(cx, cy - 82, 30, 0, Math.PI * 2); eqctx.fill();
    eqctx.fillStyle = 'rgba(0,0,0,0.35)';
    eqctx.font = '11px sans-serif';
    eqctx.fillText('躯干(60×104px)', cx - 52, cy + 66);
  }

  eqParts.forEach((p, i) => {
    eqctx.fillStyle = p.color;
    eqctx.beginPath();
    eqctx.roundRect(p.x + cx, p.y + cy, p.w, p.h, 4);
    eqctx.fill();
    if (i === eqSelected) {
      eqctx.strokeStyle = '#ff9a3c';
      eqctx.lineWidth = 2;
      eqctx.strokeRect(p.x + cx - 3, p.y + cy - 3, p.w + 6, p.h + 6);
    }
  });
}

eqLoad('head');
