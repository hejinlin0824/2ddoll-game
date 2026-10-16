// 皮肤工坊 v2:上传手绘(白底)→ 自动抠白/裁边 → 编辑器(标记上下端转正 + 拖动微调 + 缩放)
// → 组装预览 → 存档(contra-skin v2:src + ox/oy/scale)。
// 处理管线/尺寸事实源在 domain/skin.js(SKIN_BOX 与游戏共用,不错位的根基);本层只管交互。
import {
  SKIN_PARTS, SKIN_LABEL, SKIN_BOX, loadSkin, saveSkin, clearSkin, processSkinImage, orientSkinImage,
} from '../game/domain/skin.js';

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.style.opacity = 0), 2200);
}

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
  // 贴图(contain × scale + 拖动偏移;与 player.js skinCap 同一套数学)
  const im = ed.img;
  if (im.complete && im.naturalWidth) {
    const s0 = Math.min((box.w * mEPPM) / im.naturalWidth, (box.h * mEPPM) / im.naturalHeight) * ed.xf.scale;
    const dw = im.naturalWidth * s0, dh = im.naturalHeight * s0;
    const dx = cx - dw / 2 + ed.xf.ox * mEPPM, dy = cy - dh / 2 + ed.xf.oy * mEPPM;
    mCtx.drawImage(im, dx, dy, dw, dh);
    ed._fit = { s0, dx, dy }; // 供命中/逆变换
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
  const { s0, dx, dy } = ed._fit || {};
  if (!s0) return;
  // 屏幕 → 源图像素坐标
  const toImg = (p) => [(p[0] - dx) / s0, (p[1] - dy) / s0];
  const [ax, ay] = toImg(ed.markA);
  const [bx, by] = toImg(ed.markB);
  const r = orientSkinImage(ed.img, ax, ay, bx, by);
  if (!r.ok) { toast(r.msg); ed.markA = ed.markB = null; renderEditor(); return; }
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
      const s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight) * (xf.scale || 1);
      if (dark) actx.filter = 'brightness(0.72) saturate(0.85)';
      actx.drawImage(im, -im.naturalWidth * s / 2 + (xf.ox || 0) * PPM2, -im.naturalHeight * s / 2 + (xf.oy || 0) * PPM2,
        im.naturalWidth * s, im.naturalHeight * s);
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
window.__skinSave = () => { document.getElementById('bSave').click(); return localStorage.getItem('contra-skin')?.length || 0; };
