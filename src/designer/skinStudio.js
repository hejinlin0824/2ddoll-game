// HERO Character Lab — 轻量外观工坊。程序化外观与旧版自绘部件分离，保留 contra-skin 存档。
import {
  SKIN_PARTS, SKIN_LABEL, SKIN_BOX, SKIN_END_ANCHORED, skinFitScale, loadSkin, saveSkin, clearSkin, processSkinImage, orientSkinImage,
} from '../game/domain/skin.js';
import { loadAppearance, saveAppearance, clearAppearance, DEFAULT_APPEARANCE } from '../game/domain/appearance.js';

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// Appearance settings retain the same storage schema used by Player rendering.
const APP_DRAFT_KEY = 'contra-appearance-draft-v2';
const APP_PROFILE_KEY = 'contra-appearance-profiles-v1';
const appPanel = $('appearancePanel');
const appPreview = $('appearancePreview');
const appCtx = appPreview?.getContext('2d');
const appInputs = [...(appPanel?.querySelectorAll('[data-app]') || [])];
const COLORS = {
  hairColor: ['#202733','#35271f','#604330','#ad8660','#d5c6a7','#a45a62','#637eaa','#ece6dc'],
  skinTone: ['#f0cfb2','#d9a781','#c89572','#a66f50','#764a35','#4d332b'],
  eyeColor: ['#67c9ff','#438e78','#8ea9ff','#7b573d','#b65b48','#252b32'],
  shirtColor: ['#35495b','#263b2f','#60513a','#2e3138','#554257','#8d3f38','#c2c8c7','#d0b887'],
  pantsColor: ['#34465a','#2c3a2b','#6b5c41','#232a32','#51424c','#b2a68c'],
  bootColor: ['#1b222b','#3e352c','#5a4a34','#313c41','#a89b84'],
  bandanaColor: ['#d96b3b','#34465a','#263b2f','#9e3740','#d0b887','#252b32'],
  accentColor: ['#d99447','#5db8d3','#7dbf78','#d95c54','#cf69b5','#e4dfd0','#252b32'],
};
const PROFILES = {
  recon: { hairStyle:'undercut', hairColor:'#202733', faceShape:'angular', skinTone:'#c89572', eyeColor:'#67c9ff', shirtColor:'#263b2f', pantsColor:'#2c3a2b', bootColor:'#1b222b', bandanaColor:'#34465a', headwear:'headset', accentColor:'#d99447' },
  urban: { hairStyle:'short', hairColor:'#35271f', faceShape:'oval', skinTone:'#d9a781', eyeColor:'#438e78', shirtColor:'#2e3138', pantsColor:'#34465a', bootColor:'#1b222b', bandanaColor:'#252b32', headwear:'headset', accentColor:'#5db8d3' },
  desert: { hairStyle:'buzz', hairColor:'#604330', faceShape:'angular', skinTone:'#a66f50', eyeColor:'#7b573d', shirtColor:'#60513a', pantsColor:'#6b5c41', bootColor:'#5a4a34', bandanaColor:'#d96b3b', headwear:'bandana', accentColor:'#d99447' },
  jungle: { hairStyle:'ponytail', hairColor:'#202733', faceShape:'oval', skinTone:'#c89572', eyeColor:'#438e78', shirtColor:'#263b2f', pantsColor:'#2c3a2b', bootColor:'#313c41', bandanaColor:'#263b2f', headwear:'bandana', accentColor:'#7dbf78' },
  night: { hairStyle:'short', hairColor:'#202733', faceShape:'round', skinTone:'#d9a781', eyeColor:'#67c9ff', shirtColor:'#35495b', pantsColor:'#232a32', bootColor:'#1b222b', bandanaColor:'#34465a', headwear:'none', accentColor:'#d99447' },
};
const deepCopy = (o) => JSON.parse(JSON.stringify(o));
function readAppForm() {
  const out = {};
  for (const el of appInputs) out[el.dataset.app] = el.value;
  return { ...DEFAULT_APPEARANCE, ...out };
}
function setAppForm(data) {
  const next = { ...DEFAULT_APPEARANCE, ...(data || {}) };
  for (const el of appInputs) if (next[el.dataset.app] != null) el.value = next[el.dataset.app];
  updateAppearanceUi();
}
function syncAppearanceChoices() {
  const a = readAppForm();
  document.querySelectorAll('[data-app-choice]').forEach((el) => {
    const selected = a[el.dataset.appChoice] === el.dataset.value;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  document.querySelectorAll('[data-app-color][data-color]').forEach((el) => {
    const active = (a[el.dataset.appColor] || '').toLowerCase() === el.dataset.color.toLowerCase();
    el.classList.toggle('selected', active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-slot-label]').forEach((el) => {
    const p = readAppProfiles()[el.dataset.slotLabel];
    el.textContent = p ? (p.name || '已保存') : '空槽';
  });
  const currentPreset = Object.entries(PROFILES).find(([, p]) => Object.keys(p).every((k) => p[k] === a[k]))?.[0];
  document.querySelectorAll('[data-app-profile]').forEach((el) => el.classList.toggle('selected', el.dataset.appProfile === currentPreset));
}
function saveAppearanceDraft() {
  try { localStorage.setItem(APP_DRAFT_KEY, JSON.stringify(readAppForm())); } catch { /* private mode */ }
}
function updateAppearanceUi() {
  syncAppearanceChoices();
  drawAppearancePreview();
  saveAppearanceDraft();
}
function rr(c, x, y, w, h, r, color) {
  c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}
function drawAppearancePreview() {
  if (!appCtx || !appPreview) return;
  const a = readAppForm(), c = appCtx, W = appPreview.width, H = appPreview.height;
  c.clearRect(0, 0, W, H);
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#17293c'); bg.addColorStop(.58, '#0b1724'); bg.addColorStop(1, '#070d14'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(127,178,255,.11)'; c.lineWidth = 1;
  for (let x = 18; x < W; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 18; y < H; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.fillStyle = 'rgba(255,177,74,.06)'; c.fillRect(16, 16, W - 32, H - 32);
  const cx = W * .50, ground = H * .82;
  c.strokeStyle = 'rgba(255,177,74,.36)'; c.beginPath(); c.moveTo(28, ground); c.lineTo(W - 28, ground); c.stroke();
  // Shadow and boots
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx + 4, ground + 5, 72, 12, 0, 0, Math.PI * 2); c.fill();
  rr(c, cx - 40, ground - 22, 35, 15, 4, a.bootColor); rr(c, cx + 14, ground - 22, 36, 15, 4, a.bootColor);
  // Legs with knees and cargo pockets
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = a.pantsColor; c.lineWidth = 25; c.beginPath(); c.moveTo(cx - 19, ground - 34); c.lineTo(cx - 26, ground - 82); c.lineTo(cx - 16, ground - 130); c.stroke();
  c.beginPath(); c.moveTo(cx + 28, ground - 34); c.lineTo(cx + 31, ground - 82); c.lineTo(cx + 18, ground - 130); c.stroke();
  rr(c, cx - 37, ground - 87, 21, 22, 3, a.pantsColor); rr(c, cx + 20, ground - 88, 21, 22, 3, a.pantsColor);
  c.strokeStyle = 'rgba(235,242,248,.22)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 23, ground - 91); c.lineTo(cx - 21, ground - 75); c.moveTo(cx + 28, ground - 92); c.lineTo(cx + 29, ground - 76); c.stroke();
  // Torso, oriented to the right like the in-game side view
  rr(c, cx - 34, ground - 216, 70, 93, 13, a.shirtColor);
  rr(c, cx - 25, ground - 205, 56, 62, 8, '#263343');
  rr(c, cx - 21, ground - 199, 49, 20, 4, a.accentColor);
  rr(c, cx - 20, ground - 173, 22, 20, 3, a.shirtColor); rr(c, cx + 5, ground - 173, 22, 20, 3, a.shirtColor);
  c.strokeStyle = 'rgba(255,255,255,.23)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 29, ground - 192); c.lineTo(cx + 28, ground - 192); c.stroke();
  // Arms and gloves
  c.strokeStyle = a.shirtColor; c.lineWidth = 17; c.beginPath(); c.moveTo(cx - 24, ground - 205); c.lineTo(cx - 44, ground - 163); c.lineTo(cx + 5, ground - 147); c.stroke();
  c.strokeStyle = a.skinTone; c.lineWidth = 12; c.beginPath(); c.moveTo(cx + 1, ground - 150); c.lineTo(cx + 30, ground - 154); c.stroke();
  c.strokeStyle = a.shirtColor; c.lineWidth = 17; c.beginPath(); c.moveTo(cx + 28, ground - 205); c.lineTo(cx + 47, ground - 170); c.lineTo(cx + 40, ground - 149); c.stroke();
  rr(c, cx + 32, ground - 157, 17, 12, 4, '#202a34');
  // Neck and face
  rr(c, cx - 10, ground - 251, 26, 27, 6, a.skinTone);
  const hx = cx + 4, hy = ground - 270;
  c.fillStyle = a.skinTone; c.beginPath();
  if (a.faceShape === 'angular') { c.moveTo(hx - 24, hy - 17); c.lineTo(hx - 14, hy - 33); c.lineTo(hx + 15, hy - 31); c.lineTo(hx + 26, hy - 13); c.lineTo(hx + 20, hy + 9); c.lineTo(hx + 4, hy + 23); c.lineTo(hx - 13, hy + 12); c.closePath(); c.fill(); }
  else c.ellipse(hx, hy, a.faceShape === 'round' ? 25 : 21, 29, 0, 0, Math.PI * 2), c.fill();
  // Back hair and style details
  c.fillStyle = a.hairColor;
  if (a.hairStyle === 'long') { c.beginPath(); c.moveTo(hx - 18, hy - 23); c.quadraticCurveTo(hx - 37, hy + 4, hx - 26, hy + 37); c.lineTo(hx - 14, hy + 36); c.lineTo(hx - 8, hy - 3); c.closePath(); c.fill(); }
  if (a.hairStyle === 'ponytail') { c.beginPath(); c.ellipse(hx - 28, hy + 8, 8, 25, -.18, 0, Math.PI * 2); c.fill(); }
  if (a.hairStyle === 'bun') { c.beginPath(); c.arc(hx - 8, hy - 25, 8, 0, Math.PI * 2); c.fill(); }
  if (a.hairStyle === 'spiky') { c.beginPath(); c.moveTo(hx - 22, hy - 9); c.lineTo(hx - 17, hy - 36); c.lineTo(hx - 4, hy - 25); c.lineTo(hx + 4, hy - 39); c.lineTo(hx + 17, hy - 25); c.lineTo(hx + 23, hy - 11); c.closePath(); c.fill(); }
  else { c.beginPath(); c.ellipse(hx, hy - 16, 24, a.hairStyle === 'buzz' ? 8 : 15, 0, Math.PI, Math.PI * 2); c.fill(); }
  if (a.hairStyle === 'undercut') rr(c, hx - 17, hy - 4, 5, 24, 2, '#3c4650');
  // Eye and brow, side profile
  c.strokeStyle = '#1a2028'; c.lineWidth = 2; c.beginPath(); c.moveTo(hx + 8, hy - 3); c.lineTo(hx + 17, hy - 4); c.stroke();
  c.fillStyle = '#f5f0e8'; c.beginPath(); c.ellipse(hx + 12, hy + 3, 5.6, 3.4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = a.eyeColor; c.beginPath(); c.arc(hx + 14, hy + 3, 2.6, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0b1018'; c.beginPath(); c.arc(hx + 14.8, hy + 3, 1.2, 0, Math.PI * 2); c.fill();
  // Headwear
  if (a.headwear === 'bandana') { rr(c, hx - 22, hy - 18, 44, 8, 3, a.bandanaColor); c.strokeStyle = a.bandanaColor; c.lineWidth = 3; c.beginPath(); c.moveTo(hx - 16, hy - 12); c.quadraticCurveTo(hx - 36, hy - 7, hx - 29, hy + 2); c.stroke(); }
  else if (a.headwear === 'headset') { c.strokeStyle = '#242e39'; c.lineWidth = 5; c.beginPath(); c.arc(hx - 2, hy - 3, 24, Math.PI * 1.03, Math.PI * 1.9); c.stroke(); rr(c, hx - 23, hy - 1, 9, 18, 4, '#2b3949'); rr(c, hx - 24, hy + 9, 12, 5, 2, a.accentColor); }
  // Labels
  c.textAlign = 'left'; c.fillStyle = '#ffb14a'; c.font = '700 12px sans-serif'; c.fillText('OPERATOR / LIVE PREVIEW', 20, 28);
  c.fillStyle = 'rgba(218,232,246,.72)'; c.font = '10px sans-serif'; c.fillText('程序化外观 · 物理骨架不变', 20, 46);
  c.textAlign = 'center'; c.fillStyle = '#e8eef5'; c.font = '700 12px sans-serif'; c.fillText(`${hairLabel(a.hairStyle)} / ${faceLabel(a.faceShape)}`, W / 2, H - 34);
  c.fillStyle = 'rgba(218,232,246,.55)'; c.font = '10px sans-serif'; c.fillText('颜色与造型会同步至游戏内角色', W / 2, H - 18);
}
function hairLabel(v) { return ({ short:'短发', buzz:'寸头', ponytail:'马尾', bun:'丸子头', long:'长发', spiky:'碎刺发', undercut:'侧剃' })[v] || '短发'; }
function faceLabel(v) { return ({ oval:'椭圆脸', round:'圆脸', angular:'棱角脸' })[v] || '椭圆脸'; }
function readAppProfiles() {
  try { const o = JSON.parse(localStorage.getItem(APP_PROFILE_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
  catch { return {}; }
}
function writeAppProfiles(o) { try { localStorage.setItem(APP_PROFILE_KEY, JSON.stringify(o)); return true; } catch { return false; } }
function applyProfile(name) { if (!PROFILES[name]) return; setAppForm(PROFILES[name]); toast(`已预览「${({recon:'夜幕侦察',urban:'城市行动',desert:'沙漠突击',jungle:'丛林潜入',night:'标准夜战'})[name]}」`); }

// Simple option buttons mirror the real fields; every selection immediately updates the character preview.
document.querySelectorAll('[data-app-choice]').forEach((el) => el.addEventListener('click', () => {
  const target = appInputs.find((input) => input.dataset.app === el.dataset.appChoice);
  if (!target) return; target.value = el.dataset.value; updateAppearanceUi();
}));
document.querySelectorAll('[data-app-profile]').forEach((el) => el.addEventListener('click', () => applyProfile(el.dataset.appProfile)));
document.querySelectorAll('[data-app-color][data-color]').forEach((el) => el.addEventListener('click', () => {
  const target = appInputs.find((input) => input.dataset.app === el.dataset.appColor);
  if (!target) return; target.value = el.dataset.color; updateAppearanceUi();
}));
for (const el of appInputs) el.addEventListener('input', updateAppearanceUi);
document.querySelectorAll('[data-look-tab]').forEach((el) => el.addEventListener('click', () => {
  const tab = el.dataset.lookTab;
  document.querySelectorAll('[data-look-tab]').forEach((b) => b.classList.toggle('active', b === el));
  document.querySelectorAll('[data-look-panel]').forEach((p) => p.hidden = p.dataset.lookPanel !== tab);
}));
$('openAppearance')?.addEventListener('click', () => $('appearancePanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
$('appearanceReset')?.addEventListener('click', () => setAppForm(DEFAULT_APPEARANCE));
$('appearanceSave')?.addEventListener('click', () => {
  const ok = saveAppearance(readAppForm());
  if (!ok) { toast('保存失败：浏览器存储不可用'); return; }
  try { localStorage.removeItem(APP_DRAFT_KEY); } catch { /* ignore */ }
  toast('外观已应用到游戏角色');
});
function randomizeAppearance() {
  const a = readAppForm();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  a.hairStyle = pick(['short','buzz','ponytail','bun','long','spiky','undercut']);
  a.faceShape = pick(['oval','round','angular']); a.headwear = pick(['none','bandana','headset']);
  for (const k of Object.keys(COLORS)) a[k] = pick(COLORS[k]);
  setAppForm(a); toast('随机造型已生成，满意后点击「保存并应用」');
}
$('appearanceRandom')?.addEventListener('click', randomizeAppearance);
$('appearanceRandomTop')?.addEventListener('click', randomizeAppearance);
document.querySelectorAll('[data-slot-save]').forEach((el) => el.addEventListener('click', () => {
  const slot = el.dataset.slotSave, profiles = readAppProfiles();
  profiles[slot] = { name: `造型 ${slot}`, appearance: readAppForm() };
  if (!writeAppProfiles(profiles)) { toast('造型槽保存失败'); return; }
  syncAppearanceChoices(); toast(`已保存造型 ${slot}`);
}));
document.querySelectorAll('[data-slot-load]').forEach((el) => el.addEventListener('click', () => {
  const slot = el.dataset.slotLoad, p = readAppProfiles()[slot];
  if (!p?.appearance) { toast(`造型 ${slot} 还是空的`); return; }
  setAppForm(p.appearance); toast(`已载入造型 ${slot}，点击保存并应用即可进入游戏`);
}));
(function initAppearance() {
  let initial = loadAppearance();
  try { const draft = JSON.parse(localStorage.getItem(APP_DRAFT_KEY) || 'null'); if (draft && typeof draft === 'object') initial = { ...initial, ...draft }; } catch { /* ignore */ }
  setAppForm(initial);
})();

const HINTS = {
  head: '头:画正面或朝右侧面。标记:头顶→下巴',
  torso: '躯干:正面或朝右侧面站姿。标记:颈→腰',
  upperArm: '大臂。标记:肩端→肘端(左右臂共用一张)',
  foreArm: '小臂,手可以画进去。标记:肘端→手端',
  thigh: '大腿。标记:髋端→膝端(左右腿共用一张)',
  calf: '小腿,鞋画在下端。标记:膝端→脚端',
  helmet: '头盔外观:画朝右或正面,盔顶朝上。仅戴盔时显示,替代预设钢盔',
  vest: '防弹衣外观:画正面或朝右,领口朝上。仅穿甲时显示,替代预设背心',
};

const slots = {};   // part -> { src, ox, oy, scale }(与存档同构)
const pvImgs = {};  // part -> HTMLImageElement(解码缓存,预览/编辑用)

(function init() {
  const s = loadSkin();
  if (s) for (const p of SKIN_PARTS) if (s.parts[p]?.src) slots[p] = { ox: 0, oy: 0, scale: 1, ...s.parts[p] };
})();

function imgOf(part) {
  const s = slots[part];
  if (!s) return null;
  let im = pvImgs[part];
  if (!im || im.__src !== s.src) {
    im = new Image();
    im.src = s.src;
    im.__src = s.src;
    pvImgs[part] = im;
  }
  return im;
}

// ---- 六+二槽位卡片 ----
const slotsEl = $('slots');
for (const part of SKIN_PARTS) {
  const card = document.createElement('div');
  card.className = 'slot';
  card.dataset.part = part;
  const isEquip = part === 'helmet' || part === 'vest';
  card.innerHTML = `
    <div class="name">${SKIN_LABEL[part]}${isEquip ? '<span class="tag">叠在皮肤外</span>' : ''}</div>
    <div class="hint">${HINTS[part]}</div>
    <canvas class="pv" width="220" height="104"></canvas>
    <div class="btns">
      <button data-a="up">上传</button>
      <button data-a="edit">微调</button>
      <button data-a="del" class="del">清除</button>
    </div>`;
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
  card.appendChild(fi);
  card.querySelector('[data-a=up]').onclick = () => fi.click();
  card.querySelector('[data-a=edit]').onclick = () => { if (slots[part]) openEditor(part); else toast('先上传一张'); };
  card.querySelector('[data-a=del]').onclick = () => {
    delete slots[part];
    redrawSlot(part);
    toast(`已清除${SKIN_LABEL[part]}`);
  };
  fi.onchange = () => {
    const f = fi.files && fi.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => uploadFromURL(part, rd.result);
    rd.readAsDataURL(f);
    fi.value = '';
  };
  slotsEl.appendChild(card);
}

// ---- 上传 → 抠白 → 裁边 → 直接进编辑器(标记转正/微调) ----
function uploadFromURL(part, url) {
  const im = new Image();
  im.onload = () => {
    rawKeep[part] = im; // 原图留底:调容差/模式时重处理(端点转正后清除,转正不可重放)
    const r = processSkinImage(im, currentOpts());
    if (!r.ok) { toast(`${SKIN_LABEL[part]}:${r.msg}`); return; }
    slots[part] = { src: r.dataURL, ox: 0, oy: 0, scale: 1 };
    toast(`${SKIN_LABEL[part]} 已抠底(${r.w}×${r.h}px) — 在编辑器里标记上下端/微调位置`);
    redrawSlot(part);
    openEditor(part);
  };
  im.onerror = () => toast('图片读取失败');
  im.src = url;
}
function currentOpts() {
  return { tol: +$('tol').value, connected: $('keepInner').checked };
}
function reprocessAll() {
  for (const part of SKIN_PARTS) {
    if (!slots[part] || !rawKeep[part]) continue;
    const r = processSkinImage(rawKeep[part], currentOpts());
    if (r.ok) slots[part] = { ...slots[part], src: r.dataURL };
    redrawSlot(part);
  }
}
const rawKeep = {}; // part -> 原图(调容差重处理用;转正过的件重处理会回到未转正状态,需重新标记)

// ---- 单槽缩略预览 ----
function redrawSlot(part) {
  const card = slotsEl.querySelector(`.slot[data-part=${part}]`);
  const cv = card.querySelector('.pv');
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  const s = slots[part];
  card.querySelector('[data-a=up]').textContent = s ? '重传' : '上传';
  if (!s) {
    c.strokeStyle = 'rgba(244,233,216,0.25)';
    c.setLineDash([5, 4]);
    c.strokeRect(24, 14, cv.width - 48, cv.height - 28);
    c.setLineDash([]);
    c.fillStyle = 'rgba(244,233,216,0.4)';
    c.font = '11px "Noto Sans SC"';
    c.textAlign = 'center';
    c.fillText('空(用程序绘制)', cv.width / 2, cv.height / 2 + 4);
    drawAssembled();
    return;
  }
  const im = imgOf(part);
  const paint = () => {
    if (!im.complete || !im.naturalWidth) { im.onload = paint; return; }
    const k = Math.min((cv.width - 20) / im.naturalWidth, (cv.height - 14) / im.naturalHeight);
    c.drawImage(im, (cv.width - im.naturalWidth * k) / 2, (cv.height - im.naturalHeight * k) / 2,
      im.naturalWidth * k, im.naturalHeight * k);
    const xf = slots[part];
    if (xf.ox || xf.oy || xf.scale !== 1) {
      c.fillStyle = 'rgba(232,160,76,0.85)';
      c.font = '10px "Noto Sans SC"';
      c.textAlign = 'right';
      c.fillText(`×${xf.scale.toFixed(2)} ${+xf.ox.toFixed(2)},${+xf.oy.toFixed(2)}`, cv.width - 8, cv.height - 6);
    }
    drawAssembled();
  };
  paint();
}

// ---- 编辑器弹层:标记上下端(转正) / 拖动微调 / 缩放 ----
const modal = $('modal'), mCv = $('mCv'), mCtx = mCv.getContext('2d');
let ed = null; // { part, img, xf, markA, markB, mode, dragPt }
let mEPPM = 200; // 编辑器像素/米(按部件框自适应)

function openEditor(part) {
  const im = imgOf(part);
  if (!im) return;
  ed = { part, img: im, xf: { ...slots[part] }, markA: null, markB: null, mode: 'drag' };
  setMode('mark'); // 新上传的素材第一件事:标记上下端
  $('mTitle').textContent = SKIN_LABEL[part];
  $('mScale').value = Math.round(ed.xf.scale * 100);
  $('mScaleV').textContent = ed.xf.scale.toFixed(2) + '×';
  updateHint();
  modal.style.display = 'flex';
  renderEditor();
}
function setMode(m) {
  ed.mode = m;
  $('mDrag').classList.toggle('on', m === 'drag');
  $('mMark').classList.toggle('on', m === 'mark');
  updateHint();
}
function updateHint() {
  const markHelp = {
    head: '点 头顶 → 再点 下巴', torso: '点 颈口 → 再点 腰口',
    upperArm: '点 肩端 → 再点 肘端', foreArm: '点 肘端 → 再点 手端',
    thigh: '点 髋端 → 再点 膝端', calf: '点 膝端 → 再点 脚端',
    helmet: '盔形对称可跳过;歪了就点 盔顶 → 再点 盔沿', vest: '领口对称可跳过;歪了就点 领口 → 再点 下摆',
  }[ed.part];
  $('mHint').textContent = ed.mode === 'mark'
    ? `标记模式:${markHelp}(两次点击,素材自动转正)`
    : '拖动模式:按住图片拖动微调位置;滚轮/滑条缩放 —— 虚线框是部件标准框,和游戏里一模一样';
}
function renderEditor() {
  const W = mCv.width, H = mCv.height;
  mCtx.clearRect(0, 0, W, H);
  const box = SKIN_BOX[ed.part];
  mEPPM = Math.min(W / (box.w * 1.7), H / (box.h * 1.7));
  const cx = W / 2, cy = H / 2;
  // 身体参照(与游戏同源:头=圆 r0.15 / 躯干=0.30×0.52,画在部件自己的局部空间)
  mCtx.save();
  mCtx.translate(cx, cy);
  mCtx.fillStyle = 'rgba(226,176,136,0.20)';
  const gbox = box.anchor === 'head' || ed.part === 'head' ? SKIN_BOX.head : SKIN_BOX.torso;
  if ((gbox === SKIN_BOX.head)) {
    mCtx.beginPath(); mCtx.arc(0, 0, (gbox.w / 2) * mEPPM, 0, Math.PI * 2); mCtx.fill();
  } else if (!['upperArm', 'foreArm', 'thigh', 'calf'].includes(ed.part)) {
    mCtx.beginPath(); mCtx.roundRect(-(gbox.w / 2) * mEPPM, -(gbox.h / 2) * mEPPM, gbox.w * mEPPM, gbox.h * mEPPM, 8); mCtx.fill();
  }
  mCtx.restore();
  // 部件标准框(虚线):游戏里贴图 contain 进这个框
  mCtx.strokeStyle = 'rgba(232,160,76,0.8)';
  mCtx.setLineDash([6, 4]);
  mCtx.strokeRect(cx - (box.w * mEPPM) / 2, cy - (box.h * mEPPM) / 2, box.w * mEPPM, box.h * mEPPM);
  mCtx.setLineDash([]);
  mCtx.fillStyle = 'rgba(232,160,76,0.75)';
  mCtx.font = '11px "Noto Sans SC"';
  mCtx.fillText('↑上端(根)', cx - (box.w * mEPPM) / 2, cy - (box.h * mEPPM) / 2 - 6);
  // 末端锚定线(foreArm/calf):小臂底=手=枪握点,小腿底=脚底 —— 图的底边要贴这条线
  const tipY = cy + (box.h / 2 - (box.tip || 0)) * mEPPM;
  if (SKIN_END_ANCHORED[ed.part]) {
    mCtx.strokeStyle = '#57d05f';
    mCtx.setLineDash([3, 3]);
    mCtx.beginPath();
    mCtx.moveTo(cx - box.w * mEPPM * 0.85, tipY);
    mCtx.lineTo(cx + box.w * mEPPM * 0.85, tipY);
    mCtx.stroke();
    mCtx.setLineDash([]);
    mCtx.fillStyle = '#57d05f';
    mCtx.font = '10px "Noto Sans SC"';
    mCtx.textAlign = 'center';
    mCtx.fillText(ed.part === 'foreArm' ? '↑手/枪握点对齐这条线' : '↑脚底对齐这条线', cx, tipY + 14);
  }
  // 贴图(与 player.js skinCap 同一套适配数学:四肢拉伸填充/其余长度定标 + 端点锚定/居中)
  const im = ed.img;
  if (im.complete && im.naturalWidth) {
    const f = skinFitScale(ed.part, im.naturalWidth, im.naturalHeight);
    const s0x = f.sx * mEPPM * ed.xf.scale, s0y = f.sy * mEPPM * ed.xf.scale;
    const dw = im.naturalWidth * s0x, dh = im.naturalHeight * s0y;
    const dx = cx - dw / 2 + ed.xf.ox * mEPPM;
    const dy = (SKIN_END_ANCHORED[ed.part] ? tipY - dh : cy - dh / 2) + ed.xf.oy * mEPPM;
    mCtx.drawImage(im, dx, dy, dw, dh);
    ed._fit = { s0x, s0y, dx, dy }; // 供命中/逆变换
  }
  // 标记点
  const drawPt = (p, color, label) => {
    if (!p) return;
    mCtx.fillStyle = color;
    mCtx.beginPath(); mCtx.arc(p[0], p[1], 6, 0, Math.PI * 2); mCtx.fill();
    mCtx.fillStyle = '#fff';
    mCtx.font = 'bold 10px "Noto Sans SC"';
    mCtx.fillText(label, p[0] + 8, p[1] - 6);
  };
  drawPt(ed.markA, '#57d05f', '上');
  drawPt(ed.markB, '#e0523c', '下');
}
function cvPos(e) {
  const r = mCv.getBoundingClientRect();
  const k = mCv.width / r.width;
  return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
}
mCv.addEventListener('pointerdown', (e) => {
  if (!ed) return;
  const [x, y] = cvPos(e);
  if (ed.mode === 'mark') {
    if (!ed.markA) { ed.markA = [x, y]; toast('已标记上端 — 再点下端'); }
    else if (!ed.markB) {
      ed.markB = [x, y];
      applyMark();
    }
    renderEditor();
    return;
  }
  // 拖动:记住起点
  ed.dragPt = [x - ed.xf.ox * mEPPM, y - ed.xf.oy * mEPPM];
  mCv.setPointerCapture(e.pointerId);
});
mCv.addEventListener('pointermove', (e) => {
  if (!ed || ed.mode !== 'drag' || !ed.dragPt) return;
  const [x, y] = cvPos(e);
  ed.xf.ox = (x - ed.dragPt[0]) / mEPPM;
  ed.xf.oy = (y - ed.dragPt[1]) / mEPPM;
  renderEditor();
});
mCv.addEventListener('pointerup', () => { if (ed) ed.dragPt = null; });
mCv.addEventListener('wheel', (e) => {
  if (!ed) return;
  e.preventDefault();
  setScale(ed.xf.scale * (e.deltaY < 0 ? 1.06 : 1 / 1.06));
}, { passive: false });
function setScale(v) {
  ed.xf.scale = Math.min(2.2, Math.max(0.4, v));
  $('mScale').value = Math.round(ed.xf.scale * 100);
  $('mScaleV').textContent = ed.xf.scale.toFixed(2) + '×';
  renderEditor();
}
function applyMark() {
  const { s0x, s0y, dx, dy } = ed._fit || {};
  if (!s0x) return;
  // 屏幕 → 源图像素坐标(宽高各自逆变换,适配拉伸填充)
  const toImg = (p) => [(p[0] - dx) / s0x, (p[1] - dy) / s0y];
  const [ax, ay] = toImg(ed.markA);
  const [bx, by] = toImg(ed.markB);
  const r = orientSkinImage(ed.img, ax, ay, bx, by);  if (!r.ok) { toast(r.msg); ed.markA = ed.markB = null; renderEditor(); return; }
  slots[ed.part] = { src: r.dataURL, ox: 0, oy: 0, scale: 1 };
  delete rawKeep[ed.part]; // 已转正,不再参与"调容差重处理"(那会丢掉转正)
  const im = imgOf(ed.part);
  ed.img = im; ed.xf = { ox: 0, oy: 0, scale: 1 };
  ed.markA = ed.markB = null;
  $('mScale').value = 100; $('mScaleV').textContent = '1.00×';
  setMode('drag');
  redrawSlot(ed.part);
  renderEditor();
  toast(`已转正(旋转 ${r.rotatedDeg}°) — 现在可拖动微调`);
}
$('mMark').onclick = () => { if (ed) { ed.markA = ed.markB = null; setMode('mark'); renderEditor(); } };
$('mDrag').onclick = () => { if (ed) setMode('drag'); };
$('mScale').oninput = () => { if (ed) setScale(+$('mScale').value / 100); };
$('mReset').onclick = () => {
  if (!ed) return;
  ed.xf = { ox: 0, oy: 0, scale: 1 };
  $('mScale').value = 100; $('mScaleV').textContent = '1.00×';
  renderEditor();
};
$('mOk').onclick = () => {
  if (!ed) return;
  const p = ed.part;
  slots[p] = { src: slots[p].src, ...ed.xf };
  modal.style.display = 'none';
  ed = null;
  redrawSlot(p);
  toast(`${SKIN_LABEL[p]} 微调已应用`);
};
$('mClose').onclick = () => {
  if (!ed) return;
  const p = ed.part;
  slots[p] = { src: slots[p].src, ...ed.xf }; // 关闭也保留微调
  modal.style.display = 'none';
  ed = null;
  redrawSlot(p);
};

// ---- 组装预览:站立小人(含头盔/防弹衣外观层) ----
const acv = $('assembled');
const actx = acv.getContext('2d');
const PPM2 = 104;
function drawAssembled() {
  const W = acv.width, H = acv.height;
  actx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2 - 4;
  const drawPart = (x, y, angle, part, dark) => {
    const box = SKIN_BOX[part];
    actx.save();
    actx.translate(x, y);
    actx.rotate(-angle);
    const bw = box.w * PPM2, bh = box.h * PPM2;
    actx.strokeStyle = 'rgba(232,160,76,0.5)';
    actx.setLineDash([4, 3]);
    actx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    actx.setLineDash([]);
    const im = imgOf(part);
    if (im && im.complete && im.naturalWidth) {
      const xf = slots[part];
      const f = skinFitScale(part, im.naturalWidth, im.naturalHeight);
      const dw = im.naturalWidth * f.sx * PPM2 * (xf.scale || 1);
      const dh = im.naturalHeight * f.sy * PPM2 * (xf.scale || 1);
      const dy = SKIN_END_ANCHORED[part] ? (SKIN_BOX[part].h / 2 - (SKIN_BOX[part].tip || 0)) * PPM2 - dh : -dh / 2;
      if (dark) actx.filter = 'brightness(0.72) saturate(0.85)';
      actx.drawImage(im, -dw / 2 + (xf.ox || 0) * PPM2, dy + (xf.oy || 0) * PPM2, dw, dh);
      actx.filter = 'none';
    } else {
      actx.fillStyle = 'rgba(244,233,216,0.14)';
      actx.fillRect(-bw / 2, -bh / 2, bw, bh);
    }
    actx.restore();
  };
  const sway = 0.14;
  drawPart(cx - 0.10 * PPM2, cy - 0.07 * PPM2, sway, 'upperArm', true);
  drawPart(cx - 0.115 * PPM2, cy + 0.15 * PPM2, sway, 'foreArm', true);
  drawPart(cx - 0.075 * PPM2, cy + 0.38 * PPM2, 0, 'thigh', true);
  drawPart(cx - 0.075 * PPM2, cy + 0.65 * PPM2, 0, 'calf', true);
  drawPart(cx, cy, 0, 'torso', false);
  drawPart(cx, cy - 0.53 * PPM2, 0, 'head', false);
  drawPart(cx + 0.075 * PPM2, cy + 0.38 * PPM2, 0, 'thigh', false);
  drawPart(cx + 0.075 * PPM2, cy + 0.65 * PPM2, 0, 'calf', false);
  drawPart(cx + 0.10 * PPM2, cy - 0.07 * PPM2, -sway, 'upperArm', false);
  drawPart(cx + 0.115 * PPM2, cy + 0.15 * PPM2, -sway, 'foreArm', false);
  drawPart(cx, cy - 0.53 * PPM2, 0, 'helmet', false); // 装备外观层:叠在头/躯干外
  drawPart(cx, cy, 0, 'vest', false);
  actx.strokeStyle = 'rgba(126,201,126,0.3)';
  actx.beginPath();
  actx.moveTo(20, cy + 0.78 * PPM2);
  actx.lineTo(W - 20, cy + 0.78 * PPM2);
  actx.stroke();
}

// ---- 参数与按钮 ----
$('tol').oninput = () => { $('tolV').textContent = $('tol').value; };
$('tol').onchange = reprocessAll;
$('keepInner').onchange = reprocessAll;
$('bSave').onclick = saveAll;
$('bPlay').onclick = () => { saveAll(); location.href = './game.html'; };
$('bClearAll').onclick = () => {
  clearSkin();
  for (const p of SKIN_PARTS) delete slots[p];
  for (const p of SKIN_PARTS) redrawSlot(p);
  toast('已全部清除,游戏里回到程序绘制');
};
function saveAll() {
  const parts = {};
  for (const p of SKIN_PARTS) if (slots[p]) parts[p] = { src: slots[p].src, ox: +slots[p].ox.toFixed(3), oy: +slots[p].oy.toFixed(3), scale: +slots[p].scale.toFixed(3) };
  if (!Object.keys(parts).length) { clearSkin(); toast('没有皮肤部件,已清档(游戏用程序绘制)'); return; }
  const ok = saveSkin({ version: 2, parts });
  toast(ok ? `已保存 ${Object.keys(parts).length} 件 — 切到游戏页即刻生效` : '保存失败:浏览器存储不可用/超出配额');
}
SKIN_PARTS.forEach(redrawSlot);

// ---- 调试/自动化钩子 ----
window.__skinTest = (part, drawFn, w = 240, h = 300) => {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, w, h);
  drawFn(c, w, h);
  const im = new Image();
  im.onload = () => {
    const r = processSkinImage(im, currentOpts());
    if (r.ok) { slots[part] = { src: r.dataURL, ox: 0, oy: 0, scale: 1 }; redrawSlot(part); }
  };
  im.src = cv.toDataURL('image/png');
  return true;
};
// 端点标记直调(自动化测试用,坐标 = 源图像素)
window.__skinMark = (part, ax, ay, bx, by) => {
  const im = imgOf(part);
  const r = orientSkinImage(im, ax, ay, bx, by);
  if (r.ok) { slots[part] = { src: r.dataURL, ox: 0, oy: 0, scale: 1 }; redrawSlot(part); }
  return r;
};
window.__skinXf = (part, xf) => { if (slots[part]) Object.assign(slots[part], xf); redrawSlot(part); };
window.__skinInfo = (part) => {
  const im = imgOf(part);
  return im && im.naturalWidth ? { w: im.naturalWidth, h: im.naturalHeight, inSlots: !!slots[part] } : null;
};
// 通用抠白处理钩子:url 加载 → 抠白底+裁边 → 返回 PNG dataURL(不动存档)
window.__skinProcess = (url, opts = {}) => new Promise((resolve) => {
  const im = new Image();
  im.onload = () => {
    const r = processSkinImage(im, opts);
    resolve(r.ok ? r.dataURL : null);
  };
  im.onerror = () => resolve(null);
  im.src = url;
});
window.__skinSave = () => { document.getElementById('bSave').click(); return localStorage.getItem('contra-skin')?.length || 0; };

