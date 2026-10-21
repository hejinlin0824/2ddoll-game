// 枪械设计器：几何部件 + 真实配件槽 + 颜色工作台 + 可旋转缩放预览。
import {
  PART_TYPES, GUN_PRESETS, METER_SCALE,
  EQUIP_PRESETS, EQUIP_SLOTS, loadEquip, saveEquip,
  GUN_ATTACHMENTS, compatibleAttachments, resolveGunBuild, loadGunBlueprint, saveActiveGunBuild,
  loadReticleSettings, saveReticleSettings, DEFAULT_RETICLE,
} from '../game/domain/gunPresets.js';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const toastEl = document.getElementById('toast');
let parts = [];
let grips = { front: { x: 129, y: 27 }, rear: { x: 71, y: 42 } };
let muzzle = { x: 176, y: 27 };
let selected = -1;
let drag = null;
let basePreset = 'AK-47';
let customName = '';
let attachments = [];
let attachmentColors = {};
let previewRotation = 0;
let previewDrag = null;

(function init() {
  try {
    const raw = localStorage.getItem('contra-gun-draft') || localStorage.getItem('contra-gun-primary');
    if (raw) {
      const g = JSON.parse(raw);
      if (Array.isArray(g.parts) && g.parts.length && g.grips?.front && g.grips?.rear && g.muzzle) {
        parts = g.parts.map((p) => ({ ...p }));
        grips = { front: { ...g.grips.front }, rear: { ...g.grips.rear } };
        muzzle = { ...g.muzzle };
        basePreset = GUN_PRESETS[g.basePreset] ? g.basePreset : (GUN_PRESETS[g.name] ? g.name : 'AK-47');
        attachments = Array.isArray(g.attachments) ? [...g.attachments] : [];
        attachmentColors = g.attachmentColors && typeof g.attachmentColors === 'object' ? { ...g.attachmentColors } : {};
        customName = typeof g.customName === 'string' ? g.customName.slice(0, 24) : '';
        return;
      }
    }
  } catch { /* 忽略损坏草稿 */ }
  const g = GUN_PRESETS['AK-47'];
  basePreset = 'AK-47';
  parts = g.parts.map((p) => ({ ...p }));
  grips = { front: { ...g.grips.front }, rear: { ...g.grips.rear } };
  muzzle = { ...g.muzzle };
  attachments = [];
  attachmentColors = {};
})();

function loadPreset(name) {
  const safeName = Object.prototype.hasOwnProperty.call(GUN_PRESETS, name) ? name : 'AK-47';
  const g = loadGunBlueprint(safeName);
  basePreset = safeName;
  parts = g.parts.map((p) => ({ ...p }));
  grips = { front: { ...g.grips.front }, rear: { ...g.grips.rear } };
  muzzle = { ...g.muzzle };
  attachments = Array.isArray(g.attachments) ? [...g.attachments] : [];
  attachmentColors = g.attachmentColors && typeof g.attachmentColors === 'object' ? { ...g.attachmentColors } : {};
  customName = g.customName || '';
  const nameInput = document.getElementById('weaponName');
  if (nameInput) nameInput.value = customName;
  selected = -1;
  const presetSel = document.getElementById('preset');
  if (presetSel) presetSel.value = basePreset;
  saveDraft(); draw(); renderProps(); renderAttachmentCatalog(); renderWeaponStats(); renderPreview(); renderPresetCards(); updateActiveGunInfo();
}

function saveDraft() {
  try {
    localStorage.setItem('contra-gun-draft', JSON.stringify({
      name: basePreset, customName: document.getElementById('weaponName')?.value?.trim() || customName, basePreset, parts, grips, muzzle, attachments, attachmentColors,
      reticle: loadReticleSettings(),
    }));
  } catch { /* 忽略 */ }
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.style.opacity = 0), 1800);
}

// ---- 工具栏与零件 ----
const weaponNameEl = document.getElementById('weaponName');
if (weaponNameEl) weaponNameEl.value = customName;
const presetSel = document.getElementById('preset');
for (const name of Object.keys(GUN_PRESETS)) {
  const o = document.createElement('option');
  o.value = name; o.textContent = `枪型基底:${name}`;
  presetSel.appendChild(o);
}
presetSel.value = basePreset;
function renderPresetCards() {
  const root = document.getElementById('presetCards');
  if (!root) return;
  root.replaceChildren();
  const meta = {
    'AK-47': ['突击步枪', '大威力 · 后坐较强', '⌁'],
    'M4A1': ['突击步枪', '稳定 · 连射顺手', '╱'],
    'MP5': ['冲锋枪', '高射速 · 近距离', '≋'],
    'AWP': ['狙击步枪', '高伤害 · 低弹容量', '⌖'],
    '霰弹枪': ['霰弹枪', '近距离 · 多弹丸', '▤'],
    'Glock 17': ['副武器', '轻型手枪 · 独立保存', '⌑'],
  };
  for (const name of Object.keys(GUN_PRESETS)) {
    const [type, desc, glyph] = meta[name] || ['自定义枪型', '模块化蓝图', '⌁'];
    const b = document.createElement('button'); b.type = 'button'; b.className = 'gun-card' + (name === basePreset ? ' active' : '');
    b.setAttribute('aria-pressed', name === basePreset ? 'true' : 'false');
    const mini = document.createElement('span'); mini.className = 'gun-mini'; mini.textContent = glyph;
    const copy = document.createElement('span'); const strong = document.createElement('b'); strong.textContent = name;
    const small = document.createElement('small'); small.textContent = `${type} · ${desc}`; copy.append(strong, small); b.append(mini, copy);
    b.onclick = () => { if (presetSel.value !== name) { presetSel.value = name; presetSel.dispatchEvent(new Event('change')); } else loadPreset(name); };
    root.appendChild(b);
  }
}
function updateActiveGunInfo() {
  const name = document.getElementById('activeWeaponName');
  const hint = document.getElementById('activeWeaponHint');
  const count = document.getElementById('activeAttachmentCount');
  if (name) name.textContent = customName || basePreset;
  if (hint) hint.textContent = basePreset === 'Glock 17' ? '副武器蓝图 · 独立存档，不覆盖主武器' : `${basePreset} · 当前工作蓝图`;
  if (count) count.textContent = `${attachments.length} 个配件`;
  const modulePaint = document.getElementById('paintModule');
  if (modulePaint) modulePaint.value = attachments.map((id) => attachmentColors[id]).find(Boolean) || '#394756';
  document.querySelectorAll('.gun-card').forEach((el) => { const active = el.querySelector('b')?.textContent === basePreset; el.classList.toggle('active', active); el.setAttribute('aria-pressed', active ? 'true' : 'false'); });
}
presetSel.onchange = () => loadPreset(presetSel.value);
renderPresetCards();
updateActiveGunInfo();

const palette = document.getElementById('palette');
for (const [type, def] of Object.entries(PART_TYPES)) {
  const b = document.createElement('button');
  b.textContent = `+ ${def.label}`;
  b.onclick = () => {
    parts.push({ x: 380, y: 110, w: def.w, h: def.h, color: def.color });
    selected = parts.length - 1;
    saveDraft(); draw(); renderProps(); renderPreview();
  };
  palette.appendChild(b);
}

document.getElementById('save').onclick = () => {
  if (!parts.length) { toast('画布是空的，先拼一把枪'); return; }
  try {
    const blueprint = {
      name: basePreset, customName: document.getElementById('weaponName')?.value?.trim() || '', basePreset, meterScale: METER_SCALE,
      parts: parts.map((p) => ({ ...p })), grips: { front: { ...grips.front }, rear: { ...grips.rear } }, muzzle: { ...muzzle },
      attachments: [...attachments], attachmentColors: { ...attachmentColors },
    };
    saveReticleSettings(readReticleControls());
    if (!saveActiveGunBuild(blueprint)) throw new Error('unable to save gun blueprint');
    saveDraft();
    toast('已保存到游戏：当前枪型、独立配件配置、涂装与准星已应用');
  } catch { toast('保存失败：浏览器存储不可用'); }
};

document.getElementById('clear').onclick = () => { parts = []; selected = -1; saveDraft(); draw(); renderProps(); renderPreview(); };
document.getElementById('reset').onclick = () => loadPreset(presetSel.value || basePreset || 'AK-47');

// ---- 简化的配件选择：默认只显示当前枪型兼容模块，并按槽位过滤 ----
let attachmentFilter = 'all';
function renderAttachmentCatalog() {
  const root = document.getElementById('attachmentCatalog');
  if (!root) return;
  root.replaceChildren();
  const compatible = new Set(compatibleAttachments(basePreset).map((a) => a.id));
  const filterButtonSet = document.querySelectorAll('[data-attachment-filter]');
  filterButtonSet.forEach((b) => b.classList.toggle('active', b.dataset.attachmentFilter === attachmentFilter));
  const list = Object.values(GUN_ATTACHMENTS).filter((def) => compatible.has(def.id)).filter((def) => {
    if (attachmentFilter === 'all') return true;
    if (attachmentFilter === '下挂') return ['下挂', '护木'].includes(def.slot);
    return def.slot === attachmentFilter;
  });
  if (!list.length) {
    const empty = document.createElement('div'); empty.className = 'attachment-summary';
    empty.textContent = '这个枪型在当前槽位没有可用模块。换一个分类试试。'; root.appendChild(empty); return;
  }
  for (const def of list) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'attachment-chip';
    const active = attachments.includes(def.id); button.classList.toggle('active', active);
    button.title = `${def.slot} · ${def.bonus}`;
    const img = document.createElement('img'); img.src = `./art/attachments/${def.icon}.svg`; img.alt = ''; img.draggable = false;
    img.onerror = () => { img.hidden = true; };
    const labels = document.createElement('span'); labels.className = 'attachment-chip-copy';
    const strong = document.createElement('b'); strong.textContent = def.label;
    const small = document.createElement('small'); small.textContent = `${def.slot} · ${def.bonus}`;
    labels.append(strong, small);
    const mark = document.createElement('span'); mark.className = 'attachment-check'; mark.textContent = active ? '已装 ✓' : '＋ 装配';
    button.append(img, labels, mark);
    button.onclick = () => {
      if (active) attachments = attachments.filter((id) => id !== def.id);
      else {
        // 一个槽位只允许一件，装新配件时自动替换原槽位模块。
        const slotIds = new Set(Object.values(GUN_ATTACHMENTS).filter((a) => a.slot === def.slot).map((a) => a.id));
        attachments = attachments.filter((id) => !slotIds.has(id)); attachments.push(def.id);
      }
      attachments = attachments.filter((id) => compatible.has(id));
      saveDraft(); renderAttachmentCatalog(); renderWeaponStats(); renderPreview(); updateActiveGunInfo();
    };
    root.appendChild(button);
  }
  const count = document.createElement('div'); count.className = 'attachment-summary';
  count.textContent = `当前 ${attachments.length} / ${compatible.size} 个兼容模块已安装 · 点击卡片即可装配或卸下`;
  root.appendChild(count);
}
document.querySelectorAll('[data-attachment-filter]').forEach((b) => b.addEventListener('click', () => {
  attachmentFilter = b.dataset.attachmentFilter || 'all'; renderAttachmentCatalog();
}));

function currentResolved() {
  return resolveGunBuild({ name: basePreset, basePreset, meterScale: METER_SCALE, parts, grips, muzzle, attachments, attachmentColors });
}
function renderWeaponStats() {
  const root = document.getElementById('weaponStatsPreview');
  if (!root) return;
  const r = currentResolved(), s = r.stats;
  root.replaceChildren();
  const stats = [
    ['单发伤害', `${s.damage}`], ['射速', `${s.rpm} RPM`], ['弹匣', `${s.mag} 发`],
    ['散布', `${s.spread}`], ['换弹', `${s.reload.toFixed(2)} s`], ['后坐', `${s.recoil}`], ['射程', `${s.range} m`],
  ];
  for (const [label, value] of stats) {
    const cell = document.createElement('div'); cell.className = 'stat-cell';
    const span = document.createElement('span'); span.textContent = label;
    const b = document.createElement('b'); b.textContent = value;
    cell.append(span, b); root.appendChild(cell);
  }
  const bonus = document.createElement('div'); bonus.className = 'attachment-summary';
  bonus.textContent = r.attachmentBonuses.length ? `当前模块：${r.attachmentBonuses.map((x) => x.label).join(' · ')}` : '当前未安装模块配件';
  root.appendChild(bonus);
}

// ---- 涂装：整枪主色、辅色与零件单独颜色均保留在 base parts 存档里 ----
document.getElementById('applyPaintMain')?.addEventListener('click', () => {
  const color = document.getElementById('paintMain').value;
  for (const p of parts) if (p.w * p.h >= 150) p.color = color;
  saveDraft(); draw(); renderProps(); renderPreview(); toast('已应用机匣主色');
});
document.getElementById('applyPaintAccent')?.addEventListener('click', () => {
  const color = document.getElementById('paintAccent').value;
  for (const p of parts) if (p.w * p.h < 150) p.color = color;
  saveDraft(); draw(); renderProps(); renderPreview(); toast('已应用小部件点缀色');
});
document.getElementById('applyPaintModule')?.addEventListener('click', () => {
  if (!attachments.length) { toast('先安装一个配件，再调整配件颜色'); return; }
  const color = document.getElementById('paintModule')?.value || '#394756';
  for (const id of attachments) attachmentColors[id] = color;
  saveDraft(); renderAttachmentCatalog(); renderWeaponStats(); renderPreview();
  toast(`已为当前 ${attachments.length} 个配件应用自定义颜色`);
});

document.getElementById('weaponName')?.addEventListener('input', () => { customName = document.getElementById('weaponName').value.slice(0,24); saveDraft(); renderPreview(); updateActiveGunInfo(); });

// ---- 准星全局配置：编辑器预览和游戏主准星共享同一个存档键 ----
const reticleEls = {
  style: document.getElementById('reticleStyle'), color: document.getElementById('reticleColor'),
  size: document.getElementById('reticleSize'), gap: document.getElementById('reticleGap'),
};
function updateReticleControls() {
  const r = loadReticleSettings();
  if (reticleEls.style) reticleEls.style.value = r.style;
  if (reticleEls.color) reticleEls.color.value = r.color;
  if (reticleEls.size) reticleEls.size.value = r.size;
  if (reticleEls.gap) reticleEls.gap.value = r.gap;
}
function readReticleControls() {
  return {
    style: reticleEls.style?.value || DEFAULT_RETICLE.style,
    color: reticleEls.color?.value || DEFAULT_RETICLE.color,
    size: +(reticleEls.size?.value || DEFAULT_RETICLE.size),
    gap: +(reticleEls.gap?.value || DEFAULT_RETICLE.gap),
  };
}
function applyReticleSettings() {
  saveReticleSettings(readReticleControls()); renderPreview();
}
for (const el of Object.values(reticleEls)) el?.addEventListener('input', () => { applyReticleSettings(); renderReticleSample(); });
updateReticleControls();
document.querySelectorAll('[data-reticle-preset]').forEach((b) => b.addEventListener('click', () => {
  if (reticleEls.style) reticleEls.style.value = b.dataset.reticlePreset;
  applyReticleSettings(); renderReticleSample();
}));
// Progressive disclosure: keep routine modifications visible, keep geometry editing tucked away.
document.querySelectorAll('[data-work-tab]').forEach((b) => b.addEventListener('click', () => {
  const id = b.dataset.workTab;
  document.querySelectorAll('[data-work-tab]').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('[data-work-pane]').forEach((pane) => pane.hidden = pane.dataset.workPane !== id);
  if (id === 'reticle') renderReticleSample();
}));
const paintProfiles = {
  night: ['#303944','#d99447'], olive: ['#46513b','#b5a071'], arctic: ['#b6c5ce','#5db8d3'], desert: ['#977a52','#d6b77a'],
};
document.querySelectorAll('[data-paint-profile]').forEach((b) => b.addEventListener('click', () => {
  const p = paintProfiles[b.dataset.paintProfile]; if (!p) return;
  document.querySelectorAll('[data-paint-profile]').forEach((x) => x.classList.toggle('active', x === b));
  const main = document.getElementById('paintMain'), accent = document.getElementById('paintAccent');
  if (main) { main.value = p[0]; document.getElementById('applyPaintMain')?.click(); }
  if (accent) { accent.value = p[1]; document.getElementById('applyPaintAccent')?.click(); }
}));
document.getElementById('resetView')?.addEventListener('click', () => {
  if (zoomEl) zoomEl.value = '100'; if (rotationEl) rotationEl.value = '0'; previewRotation = 0; renderPreview();
});

// ---- 预览：拖拽旋转、滚轮缩放，预览变换不写回真实握点坐标 ----
const previewCv = document.getElementById('previewCv');
const previewCtx = previewCv?.getContext('2d');
const zoomEl = document.getElementById('viewZoom');
const rotationEl = document.getElementById('viewRotation');
const zoomValueEl = document.getElementById('zoomValue');
const rotationValueEl = document.getElementById('rotationValue');
function refreshPreviewLabels() {
  if (zoomValueEl && zoomEl) zoomValueEl.textContent = `${zoomEl.value}%`;
  if (rotationValueEl && rotationEl) rotationValueEl.textContent = `${rotationEl.value}°`;
}
function drawReticle(c, x, y, settings, scale = 1) {
  if (!settings) return;
  const size = settings.size * scale, gap = settings.gap * scale;
  c.save(); c.strokeStyle = settings.color; c.fillStyle = settings.color; c.lineWidth = Math.max(1, 1.4 * scale);
  if (settings.style === 'dot') { c.beginPath(); c.arc(x, y, Math.max(1.5, 2 * scale), 0, Math.PI * 2); c.fill(); }
  else if (settings.style === 'circle') { c.beginPath(); c.arc(x, y, size * 0.7, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(x, y, Math.max(1, scale), 0, Math.PI * 2); c.fill(); }
  else if (settings.style === 'bracket') {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { c.beginPath(); c.moveTo(x + sx * gap, y + sy * gap * .6); c.lineTo(x + sx * gap, y + sy * (gap + size)); c.moveTo(x + sx * gap, y + sy * gap * .6); c.lineTo(x + sx * (gap + size * .55), y + sy * gap * .6); c.stroke(); }
  } else {
    if (settings.style === 'classic') { c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(x - gap - size, y); c.lineTo(x - gap, y); c.moveTo(x + gap, y); c.lineTo(x + gap + size, y); c.moveTo(x, y - gap - size); c.lineTo(x, y - gap); c.moveTo(x, y + gap); c.lineTo(x, y + gap + size); c.stroke();
    if (settings.style === 'dot') { c.beginPath(); c.arc(x, y, 1.5 * scale, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
}
function renderPreview() {
  if (!previewCv || !previewCtx) return;
  const c = previewCtx, W = previewCv.width, H = previewCv.height;
  c.clearRect(0, 0, W, H);
  const grad = c.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#111d2b'); grad.addColorStop(1, '#070c13'); c.fillStyle = grad; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(127,178,255,.07)'; c.lineWidth = 1;
  for (let x = 0; x < W; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  refreshPreviewLabels();
  const gun = currentResolved();
  const all = gun.parts || [];
  if (all.length) {
    const minX = Math.min(...all.map((p) => p.x)); const minY = Math.min(...all.map((p) => p.y));
    const maxX = Math.max(...all.map((p) => p.x + p.w)); const maxY = Math.max(...all.map((p) => p.y + p.h));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const baseFit = Math.min((W - 120) / Math.max(1, maxX - minX), (H - 56) / Math.max(1, maxY - minY));
    const zoom = (+(zoomEl?.value || 100)) / 100;
    const angle = (+(rotationEl?.value || previewRotation * 180 / Math.PI)) * Math.PI / 180;
    c.save(); c.translate(W * .48, H * .52); c.rotate(angle); c.scale(baseFit * zoom, baseFit * zoom); c.translate(-cx, -cy);
    for (const p of all) {
      c.fillStyle = p.color; c.beginPath(); c.roundRect(p.x, p.y, p.w, p.h, Math.min(3, p.h / 2)); c.fill();
      c.strokeStyle = p.attachmentId ? 'rgba(255,177,74,.85)' : 'rgba(0,0,0,.75)'; c.lineWidth = Math.max(0.6, 1.4 / (baseFit * zoom)); c.stroke();
    }
    // 枪口高亮与短促指示线
    c.strokeStyle = '#ffd27a'; c.lineWidth = Math.max(1, 1.4 / (baseFit * zoom));
    c.beginPath(); c.moveTo(gun.muzzle.x, gun.muzzle.y - 8); c.lineTo(gun.muzzle.x, gun.muzzle.y + 8); c.stroke();
    c.restore();
  }
  c.fillStyle = 'rgba(202,220,239,.72)'; c.font = '11px sans-serif'; c.fillText(`${basePreset} · ${attachments.length} 模块`, 12, 18);
  drawReticle(c, W - 56, 48, loadReticleSettings(), 1);
  renderReticleSample();
  updateActiveGunInfo();
}
function renderReticleSample() {
  const cv = document.getElementById('reticleSample');
  const c = cv?.getContext('2d'); if (!cv || !c) return;
  const W = cv.width, H = cv.height;
  c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0,0,0,H); g.addColorStop(0,'#152536'); g.addColorStop(1,'#08111b'); c.fillStyle=g; c.fillRect(0,0,W,H);
  c.strokeStyle='rgba(125,168,210,.10)'; c.lineWidth=1;
  for(let x=0;x<W;x+=20){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();}
  for(let y=0;y<H;y+=20){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
  c.strokeStyle='rgba(204,220,235,.18)'; c.beginPath();c.moveTo(W/2,20);c.lineTo(W/2,H-20);c.moveTo(20,H/2);c.lineTo(W-20,H/2);c.stroke();
  drawReticle(c,W/2,H/2,loadReticleSettings(),1.5);
  c.fillStyle='rgba(215,230,243,.66)';c.font='10px sans-serif';c.textAlign='center';c.fillText('实机准星预览',W/2,H-10);
  const s = document.getElementById('reticleSizeValue'), gap = document.getElementById('reticleGapValue');
  if(s) s.textContent = String(reticleEls.size?.value || DEFAULT_RETICLE.size);
  if(gap) gap.textContent = String(reticleEls.gap?.value || DEFAULT_RETICLE.gap);
  document.querySelectorAll('[data-reticle-preset]').forEach((b) => b.classList.toggle('active', b.dataset.reticlePreset === (reticleEls.style?.value || 'classic')));
}
if (previewCv) {
  previewCv.addEventListener('pointerdown', (e) => { previewDrag = { x: e.clientX, rotation: +(rotationEl?.value || 0) }; previewCv.setPointerCapture?.(e.pointerId); });
  previewCv.addEventListener('pointermove', (e) => {
    if (!previewDrag || !rotationEl) return;
    const v = Math.max(-180, Math.min(180, previewDrag.rotation + (e.clientX - previewDrag.x) * .65));
    rotationEl.value = String(Math.round(v)); previewRotation = v * Math.PI / 180; renderPreview();
  });
  const stopPreviewDrag = () => { previewDrag = null; };
  previewCv.addEventListener('pointerup', stopPreviewDrag); previewCv.addEventListener('pointercancel', stopPreviewDrag);
  previewCv.addEventListener('wheel', (e) => {
    if (!zoomEl) return; e.preventDefault();
    zoomEl.value = String(Math.max(+zoomEl.min, Math.min(+zoomEl.max, +zoomEl.value + (e.deltaY < 0 ? 5 : -5)))); renderPreview();
  }, { passive: false });
}
zoomEl?.addEventListener('input', renderPreview);
rotationEl?.addEventListener('input', () => { previewRotation = (+rotationEl.value) * Math.PI / 180; renderPreview(); });

// ---- 部件属性面板 ----
const propsEl = document.getElementById('props');
function renderProps() {
  if (selected < 0 || !parts[selected]) {
    propsEl.innerHTML = '<span style="opacity:0.5">点击画布里的部件编辑属性</span>';
    return;
  }
  const p = parts[selected]; propsEl.innerHTML = '';
  const mk = (label, key, type = 'number', step = 2) => {
    const l = document.createElement('label'); l.textContent = label;
    const i = document.createElement('input'); i.type = type; i.value = p[key];
    if (type === 'number') i.step = step;
    i.oninput = () => {
      if (type === 'number') p[key] = Math.max(2, parseFloat(i.value) || 0); else p[key] = i.value;
      saveDraft(); draw(); renderPreview();
    };
    l.appendChild(i); propsEl.appendChild(l);
  };
  mk('X', 'x'); mk('Y', 'y'); mk('宽', 'w'); mk('高', 'h');
  mk('颜色', 'color', 'color');
  const dup = document.createElement('button'); dup.textContent = '复制';
  dup.onclick = () => { parts.push({ ...p, x: p.x + 12, y: p.y + 12 }); selected = parts.length - 1; saveDraft(); draw(); renderProps(); renderPreview(); };
  const del = document.createElement('button'); del.textContent = '删除';
  del.onclick = () => { parts.splice(selected, 1); selected = -1; saveDraft(); draw(); renderProps(); renderPreview(); };
  propsEl.append(dup, del);
}

function hitTest(mx, my) {
  for (const [kind, g] of [['front', grips.front], ['rear', grips.rear], ['muzzle', muzzle]]) if (Math.hypot(mx - g.x, my - g.y) < 12) return { kind, idx: -1 };
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) return { kind: 'part', idx: i }; }
  return null;
}
cv.addEventListener('mousedown', (e) => {
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const hit = hitTest(mx, my);
  if (!hit) { selected = -1; draw(); renderProps(); return; }
  selected = hit.idx;
  const g = hit.kind === 'front' ? grips.front : hit.kind === 'rear' ? grips.rear : hit.kind === 'muzzle' ? muzzle : parts[hit.idx];
  drag = { kind: hit.kind, idx: hit.idx, ox: mx - g.x, oy: my - g.y };
  draw(); renderProps();
});
cv.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const g = drag.kind === 'front' ? grips.front : drag.kind === 'rear' ? grips.rear : drag.kind === 'muzzle' ? muzzle : parts[drag.idx];
  if (!g) return;
  g.x = Math.round((mx - drag.ox) / 2) * 2; g.y = Math.round((my - drag.oy) / 2) * 2;
  draw(); renderPreview();
});
window.addEventListener('mouseup', () => { if (drag) { drag = null; saveDraft(); renderWeaponStats(); renderAttachmentCatalog(); } });

function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let x = 0; x < cv.width; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); }
  for (let y = 0; y < cv.height; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(232,160,76,0.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(20, cv.height - 14); ctx.lineTo(220, cv.height - 14); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(232,160,76,0.7)'; ctx.font = '11px sans-serif'; ctx.fillText('1m', 108, cv.height - 3);
  parts.forEach((p, i) => {
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(15,12,8,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (i === selected) { ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6); }
  });
  drawMarker(grips.front, '#ff9a3c', '前手(副手)'); drawMarker(grips.rear, '#4d9fff', '后手(瞄准手)'); drawMuzzleMarker(muzzle);
}
function drawMarker(g, color, label) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(g.x, g.y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(g.x, g.y, 11, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color; ctx.font = '12px sans-serif'; ctx.fillText(label, g.x + 14, g.y + 4);
}
function drawMuzzleMarker(g) {
  ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.x, g.y - 9); ctx.lineTo(g.x + 9, g.y); ctx.lineTo(g.x, g.y + 9); ctx.lineTo(g.x - 9, g.y); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#ffd24a'; ctx.fillRect(g.x - 1.5, g.y - 1.5, 3, 3); ctx.font = '12px sans-serif'; ctx.fillText('枪口', g.x + 13, g.y - 6);
}

renderAttachmentCatalog();
renderWeaponStats();
renderPreview();
renderReticleSample();
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
  if (!eqParts.length) {
    // 存空 parts = 明确"脱下"(区别于从没保存过 → 游戏里穿出厂默认装备)
    saveEquip(eqSlot, { slot: eqSlot, name: '未穿戴', defense: 0, meterScale: METER_SCALE, parts: [] });
    toast(`已脱下${EQUIP_SLOTS[eqSlot].label}`);
    return;
  }
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
    if (p.img) {
      // 工坊图片零件:编辑器里画占位框(游戏内才是真图)
      eqctx.setLineDash([4, 3]);
      eqctx.strokeStyle = 'rgba(140,190,255,0.8)';
      eqctx.lineWidth = 1.5;
      eqctx.strokeRect(p.x + cx, p.y + cy, p.w, p.h);
      eqctx.setLineDash([]);
      eqctx.fillStyle = 'rgba(140,190,255,0.85)';
      eqctx.font = '10px sans-serif';
      eqctx.fillText('图', p.x + cx + p.w / 2 - 5, p.y + cy + p.h / 2 + 3);
    } else {
      eqctx.fillStyle = p.color;
      eqctx.beginPath();
      eqctx.roundRect(p.x + cx, p.y + cy, p.w, p.h, 4);
      eqctx.fill();
      eqctx.strokeStyle = 'rgba(15,12,8,0.45)'; // 与游戏内渲染一致
      eqctx.lineWidth = 1.5;
      eqctx.stroke();
    }
    if (i === eqSelected) {
      eqctx.strokeStyle = '#ff9a3c';
      eqctx.lineWidth = 2;
      eqctx.strokeRect(p.x + cx - 3, p.y + cy - 3, p.w + 6, p.h + 6);
    }
  });
}

eqLoad('head');

