// 皮肤工坊:上传手绘六件套(头/躯干/大臂/小臂/大腿/小腿)→ 自动抠白底 + 裁边 → 组装预览 → 存档。
// 处理管线与存储都在 domain/skin.js;本层只管交互与预览。
// 容差/保留内部白调节会对最近一次上传的原图实时重处理(原图留在内存 rawImgs 里)。
import {
  SKIN_PARTS, SKIN_LABEL, loadSkin, saveSkin, clearSkin, processSkinImage,
} from '../game/domain/skin.js';

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.style.opacity = 0), 2200);
}

// 六件套的画法提示与身体尺寸(与 player.js 的 D 对齐,预览按 2 倍 PPM 组装)
const HINTS = {
  head: '头:画正面或朝右侧面,头顶朝上。上屏直径仅 ~16px,五官画大',
  torso: '躯干:正面或朝右侧面站姿;头盔/防弹衣会叠画在外面',
  upperArm: '大臂:竖直,上端=肩、下端=肘;左右臂共用一张',
  foreArm: '小臂:竖直,上端=肘、下端=手;可以把手画进去(程序小手会自动隐藏)',
  thigh: '大腿:竖直,上端=髋、下端=膝;左右腿共用一张',
  calf: '小腿:竖直,上端=膝、下端=脚;鞋就画在小腿下端',
};
const DIMS = { // 部件包围盒(米) — 与 player.js D 一致
  head: { w: 0.30, h: 0.30 }, torso: { w: 0.30, h: 0.52 },
  upperArm: { w: 0.09, h: 0.26 }, foreArm: { w: 0.08, h: 0.24 },
  thigh: { w: 0.115, h: 0.28 }, calf: { w: 0.095, h: 0.26 },
};

const slots = {};   // part -> { src, w, h }(已处理成品,存档格式)
const rawImgs = {}; // part -> HTMLImageElement(最近一次上传的原图,重处理用)
const pvImgs = {};  // part -> HTMLImageElement(已处理成品的解码缓存,预览用)

// ---- 初始化:读档 ----
(function init() {
  const s = loadSkin();
  if (s) for (const p of SKIN_PARTS) if (s.parts[p]?.src) slots[p] = { src: s.parts[p].src };
})();

// ---- 六槽位 UI ----
const slotsEl = $('slots');
const fileInputs = {};
for (const part of SKIN_PARTS) {
  const card = document.createElement('div');
  card.className = 'slot';
  card.innerHTML = `
    <div class="name">${SKIN_LABEL[part]}</div>
    <div class="hint">${HINTS[part]}</div>
    <canvas class="pv" width="220" height="110"></canvas>
    <div class="btns">
      <button data-a="up">${slots[part] ? '重新上传' : '上传图片'}</button>
      <button data-a="del" class="del">清除</button>
    </div>`;
  const fi = document.createElement('input');
  fi.type = 'file';
  fi.accept = 'image/*';
  fi.style.display = 'none';
  card.appendChild(fi);
  fileInputs[part] = fi;
  card.querySelector('[data-a=up]').onclick = () => fi.click();
  card.querySelector('[data-a=del]').onclick = () => {
    delete slots[part]; delete rawImgs[part];
    redrawSlot(part);
    toast(`已清除${SKIN_LABEL[part]}(游戏里用回程序绘制)`);
  };
  fi.onchange = () => {
    const f = fi.files && fi.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => uploadFromURL(part, rd.result);
    rd.readAsDataURL(f);
    fi.value = '';
  };
  card.dataset.part = part;
  slotsEl.appendChild(card);
}

// ---- 上传 → 抠白 → 裁边(核心路径;原图留底,调参时可重处理) ----
function uploadFromURL(part, url) {
  const im = new Image();
  im.onload = () => {
    rawImgs[part] = im;
    const r = processSkinImage(im, currentOpts());
    if (!r.ok) { toast(`${SKIN_LABEL[part]}:${r.msg}`); return; }
    slots[part] = { src: r.dataURL, w: r.w, h: r.h };
    redrawSlot(part);
    toast(`${SKIN_LABEL[part]} 完成 · 抠除背景 ${r.removedPct}% · ${r.w}×${r.h}px`);
  };
  im.onerror = () => toast('图片读取失败');
  im.src = url;
}
function reprocessAll() {
  for (const part of Object.keys(rawImgs)) {
    const r = processSkinImage(rawImgs[part], currentOpts());
    if (r.ok) { slots[part] = { src: r.dataURL, w: r.w, h: r.h }; }
    redrawSlot(part);
  }
}
function currentOpts() {
  return { tol: +$('tol').value, connected: $('keepInner').checked };
}

// ---- 单槽预览(棋盘格上 contain 居中) ----
function redrawSlot(part) {
  const card = slotsEl.querySelector(`.slot[data-part=${part}]`);
  const cv = card.querySelector('.pv');
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  const s = slots[part];
  card.querySelector('[data-a=up]').textContent = s ? '重新上传' : '上传图片';
  if (!s) {
    c.strokeStyle = 'rgba(244,233,216,0.25)';
    c.setLineDash([5, 4]);
    c.strokeRect(24, 15, cv.width - 48, cv.height - 30);
    c.setLineDash([]);
    c.fillStyle = 'rgba(244,233,216,0.4)';
    c.font = '11px "Noto Sans SC"';
    c.textAlign = 'center';
    c.fillText('空(用程序绘制)', cv.width / 2, cv.height / 2 + 4);
    drawAssembled();
    return;
  }
  let im = pvImgs[part];
  if (!im || im.__src !== s.src) {
    im = new Image();
    im.src = s.src;
    im.__src = s.src;
    pvImgs[part] = im;
  }
  const paint = () => {
    if (!im.complete || !im.naturalWidth) { im.onload = paint; return; }
    const k = Math.min((cv.width - 20) / im.naturalWidth, (cv.height - 16) / im.naturalHeight);
    c.drawImage(im, (cv.width - im.naturalWidth * k) / 2, (cv.height - im.naturalHeight * k) / 2,
      im.naturalWidth * k, im.naturalHeight * k);
    drawAssembled();
  };
  paint();
}

// ---- 组装预览:站立小人,比例/布局与游戏内一致(2 倍 PPM 看得清) ----
const acv = $('assembled');
const actx = acv.getContext('2d');
const PPM2 = 104;
function drawAssembled() {
  const W = acv.width, H = acv.height;
  actx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2 - 6; // 躯干中心
  const partBox = (x, y, angle, d, part, dark) => {
    actx.save();
    actx.translate(x, y);
    actx.rotate(-angle); // 与游戏渲染一致:屏幕角 = -物理角
    const im = pvImgs[part];
    const bw = d.w * PPM2, bh = d.h * PPM2;
    actx.strokeStyle = 'rgba(232,160,76,0.75)';
    actx.setLineDash([4, 3]);
    actx.strokeRect(-bw / 2, -bh / 2, bw, bh); // 部件标准框:贴图会 contain 进这个框
    actx.setLineDash([]);
    if (im && im.complete && im.naturalWidth) {
      const s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
      if (dark) actx.filter = 'brightness(0.72) saturate(0.85)';
      actx.drawImage(im, -im.naturalWidth * s / 2, -im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
      actx.filter = 'none';
    } else {
      actx.fillStyle = 'rgba(244,233,216,0.18)';
      actx.fillRect(-bw / 2, -bh / 2, bw, bh);
    }
    actx.restore();
  };
  // 站姿:与 player.js 锚点对齐(shoulder 0.20 / hip -0.24 / 头心 0.53,脚下 -0.78)
  const sway = 0.14; // 手臂微张更自然
  partBox(cx - 0.10 * PPM2, cy - 0.07 * PPM2, sway, DIMS.upperArm, 'upperArm', true);   // 左大臂(远,压暗)
  partBox(cx - 0.115 * PPM2, cy + 0.15 * PPM2, sway, DIMS.foreArm, 'foreArm', true);    // 左小臂
  partBox(cx - 0.075 * PPM2, cy + 0.38 * PPM2, 0, DIMS.thigh, 'thigh', true);           // 左大腿
  partBox(cx - 0.075 * PPM2, cy + 0.65 * PPM2, 0, DIMS.calf, 'calf', true);             // 左小腿
  partBox(cx, cy, 0, DIMS.torso, 'torso', false);                                        // 躯干
  partBox(cx, cy - 0.53 * PPM2, 0, DIMS.head, 'head', false);                            // 头
  partBox(cx + 0.075 * PPM2, cy + 0.38 * PPM2, 0, DIMS.thigh, 'thigh', false);          // 右大腿
  partBox(cx + 0.075 * PPM2, cy + 0.65 * PPM2, 0, DIMS.calf, 'calf', false);            // 右小腿
  partBox(cx + 0.10 * PPM2, cy - 0.07 * PPM2, -sway, DIMS.upperArm, 'upperArm', false); // 右大臂
  partBox(cx + 0.115 * PPM2, cy + 0.15 * PPM2, -sway, DIMS.foreArm, 'foreArm', false);  // 右小臂
  // 地面参考线
  actx.strokeStyle = 'rgba(126,201,126,0.3)';
  actx.beginPath();
  actx.moveTo(20, cy + 0.78 * PPM2);
  actx.lineTo(W - 20, cy + 0.78 * PPM2);
  actx.stroke();
}
SKIN_PARTS.forEach(redrawSlot); // 首绘:必须在 drawAssembled 定义之后(TDZ)

// ---- 参数与按钮 ----
$('tol').oninput = () => { $('tolV').textContent = $('tol').value; };
$('tol').onchange = reprocessAll;
$('keepInner').onchange = reprocessAll;
$('bSave').onclick = saveAll;
$('bPlay').onclick = () => { saveAll(); location.href = './game.html'; };
$('bClearAll').onclick = () => {
  clearSkin();
  for (const p of SKIN_PARTS) { delete slots[p]; delete rawImgs[p]; }
  SKIN_PARTS.forEach(redrawSlot);
  toast('已全部清除,游戏里回到程序绘制');
};
function saveAll() {
  const parts = {};
  for (const p of SKIN_PARTS) if (slots[p]) parts[p] = { src: slots[p].src };
  if (!Object.keys(parts).length) { clearSkin(); toast('没有皮肤部件,已清档(游戏用程序绘制)'); return; }
  const ok = saveSkin({ version: 1, parts });
  toast(ok ? `已保存 ${Object.keys(parts).length} 件 — 切到游戏页即刻生效` : '保存失败:浏览器存储不可用/超出配额');
}

// 调试/自动化入口:注入合成图(白底 canvas)走完整上传管线
window.__skinTest = (part, drawFn, w = 240, h = 300) => {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, w, h);
  drawFn(c, w, h);
  uploadFromURL(part, cv.toDataURL('image/png'));
  return true;
};
