// 装备工坊:抠图台(点色抠背景/橡皮擦/撤销) + 穿戴台(素材拖到小人身上,保存后游戏内实时生效)
// 素材存 localStorage 'contra-assets'(id -> dataURL);穿戴走 contra-equip-head/torso,
// parts 支持 {img: 素材id, x, y, w, h, rot} 图片零件(坐标 = 身体局部空间,200px = 1m)。
import { loadAssets, saveAssets, loadEquip, saveEquip } from '../game/domain/gunPresets.js';
import { EQUIPMENT_COORDINATE_SPACE, equipmentPartToStudio, equipmentPartToStorage } from '../game/domain/equipmentGeometry.js';

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.style.opacity = 0), 2200);
}

// ============ ① 抠图台 ============
const edcv = $('edcv');
const ectx = edcv.getContext('2d');
const edOff = document.createElement('canvas'); // 原生分辨率工作画布
const octx = edOff.getContext('2d', { willReadFrequently: true });
let ed = { has: false, w: 0, h: 0, disp: 1, undo: [], tool: 'picker' };

function edRefresh() {
  ectx.clearRect(0, 0, edcv.width, edcv.height);
  ectx.drawImage(edOff, 0, 0, ed.w * ed.disp, ed.h * ed.disp);
}
function edPushUndo() {
  ed.undo.push(octx.getImageData(0, 0, ed.w, ed.h));
  if (ed.undo.length > 8) ed.undo.shift();
  $('undo').disabled = false;
}

function edLoad(dataURL) {
  const im = new Image();
  im.onload = () => {
    const cap = 512;
    const k = Math.min(1, cap / Math.max(im.naturalWidth, im.naturalHeight));
    ed.w = Math.max(1, Math.round(im.naturalWidth * k));
    ed.h = Math.max(1, Math.round(im.naturalHeight * k));
    edOff.width = ed.w; edOff.height = ed.h;
    octx.clearRect(0, 0, ed.w, ed.h);
    octx.drawImage(im, 0, 0, ed.w, ed.h);
    ed.origData = octx.getImageData(0, 0, ed.w, ed.h); // 还原基准
    ed.disp = Math.min(edcv.width / ed.w, edcv.height / ed.h, 1);
    ed.undo = [];
    $('undo').disabled = true;
    $('reset').disabled = false;
    $('saveAsset').disabled = false;
    ed.has = true;
    edRefresh();
    toast(`已加载 ${im.naturalWidth}×${im.naturalHeight}${k < 1 ? `(缩放到 ${ed.w}×${ed.h})` : ''} · 已自动去底,可用取色/橡皮擦补`);
    autoKey();          // 四角取色去底
    borderFlood(16);    // 渐变背景边缘扩散(带全局保护,前景漏进来也吃不掉)
  };
  im.src = dataURL;
}

const colorDist = (d, i, r, g, b) => {
  const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

// 抠色:(ex,ey) = 画布坐标。connected = 只抠连通区域(洪水填充),否则全局同色
function keyOut(ex, ey, tol, connected) {
  if (!ed.has) return;
  const ix = Math.floor(ex / ed.disp), iy = Math.floor(ey / ed.disp);
  if (ix < 0 || iy < 0 || ix >= ed.w || iy >= ed.h) return;
  const start = octx.getImageData(ix, iy, 1, 1).data;
  if (start[3] === 0) return;
  const img = octx.getImageData(0, 0, ed.w, ed.h);
  const d = img.data;
  const [r, g, b] = [start[0], start[1], start[2]];
  edPushUndo();
  let n = 0;
  if (connected) {
    const stack = [[ix, iy]];
    const seen = new Uint8Array(ed.w * ed.h);
    seen[iy * ed.w + ix] = 1;
    while (stack.length) {
      const [x, y] = stack.pop();
      const i = (y * ed.w + x) * 4;
      if (d[i + 3] === 0 || colorDist(d, i, r, g, b) > tol) continue;
      d[i + 3] = 0; n++;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= ed.w || ny >= ed.h) continue;
        const k = ny * ed.w + nx;
        if (!seen[k]) { seen[k] = 1; stack.push([nx, ny]); }
      }
    }
  } else {
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] !== 0 && colorDist(d, i, r, g, b) <= tol) { d[i + 3] = 0; n++; }
    }
  }
  octx.putImageData(img, 0, 0);
  edRefresh();
  toast(`已抠除 ${n} 像素`);
}

// 一键去底:取四角第一个非透明像素的颜色全局抠掉(常规"纯色背景图"直接成品)
function autoKey() {
  if (!ed.has) return;
  const d = octx.getImageData(0, 0, ed.w, ed.h).data;
  for (const [px, py] of [[2, 2], [ed.w - 3, 2], [2, ed.h - 3], [ed.w - 3, ed.h - 3]]) {
    const i = (py * ed.w + px) * 4;
    if (d[i + 3] > 0) {
      keyOut(px / ed.disp, py / ed.disp, 42, false);
      return;
    }
  }
  toast('四角已是透明,不需要去底');
}

// 渐变背景模式:边框上"接近边框主色"的像素先做种子,然后每个像素和
// 已抠掉的相邻像素比颜色(滚动参考)走渐变;另加全局保护:
// 离边框主色太远的颜色(前景本体,比如白色头盔)即使轮廓有缺口漏进来也吃不掉
function borderFlood(localTol) {
  if (!ed.has) return;
  const img = octx.getImageData(0, 0, ed.w, ed.h);
  const d = img.data;
  edPushUndo();
  const bg = new Uint8Array(ed.w * ed.h);
  const seedTol = Math.max(24, localTol * 1.5);
  const guardTol = Math.max(70, localTol * 4.5); // 全局保护圈:前景色离背景主色远,漏进来也安全
  // 1) 边框主色
  let ar = 0, ag = 0, ab = 0, an = 0;
  const border = [];
  for (let x = 0; x < ed.w; x++) { border.push([x, 0], [x, ed.h - 1]); }
  for (let y = 1; y < ed.h - 1; y++) { border.push([0, y], [ed.w - 1, y]); }
  for (const [x, y] of border) {
    const i = (y * ed.w + x) * 4;
    if (d[i + 3] > 8) { ar += d[i]; ag += d[i + 1]; ab += d[i + 2]; an++; }
  }
  if (!an) { toast('画面为空'); return; }
  ar /= an; ag /= an; ab /= an;
  const distToBg = (i) => Math.sqrt((d[i] - ar) ** 2 + (d[i + 1] - ag) ** 2 + (d[i + 2] - ab) ** 2);
  // 2) 种子:边框上颜色接近主色的像素
  const stack = [];
  for (const [x, y] of border) {
    const k = y * ed.w + x;
    const i = k * 4;
    if (bg[k] || d[i + 3] === 0) continue;
    if (distToBg(i) <= seedTol) { bg[k] = 1; d[i + 3] = 0; stack.push([x, y]); }
  }
  // 3) 洪水:滚动参考色扩散 + 全局保护圈
  let n = stack.length;
  while (stack.length) {
    const [x, y] = stack.pop();
    const i = (y * ed.w + x) * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2]; // 自己的原始色仍在(RGB 不清),作滚动参考
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= ed.w || ny >= ed.h) continue;
      const k = ny * ed.w + nx;
      if (bg[k]) continue;
      const ni = k * 4;
      if (distToBg(ni) > guardTol) continue; // 前景保护:离背景主色太远的不碰
      if (Math.sqrt((d[ni] - r) ** 2 + (d[ni + 1] - g) ** 2 + (d[ni + 2] - b) ** 2) <= localTol) {
        bg[k] = 1; d[ni + 3] = 0; n++; stack.push([nx, ny]);
      }
    }
  }
  octx.putImageData(img, 0, 0);
  edRefresh();
  toast(`渐变去底:已抠除 ${n} 像素(可重复点击逐步推进,手滑点撤销)`);
}

function eraseAt(ex, ey, radius) {
  if (!ed.has) return;
  const ix = ex / ed.disp, iy = ey / ed.disp;
  const r = radius / ed.disp;
  edPushUndo();
  const img = octx.getImageData(0, 0, ed.w, ed.h);
  const d = img.data;
  for (let y = Math.max(0, Math.floor(iy - r)); y < Math.min(ed.h, iy + r); y++) {
    for (let x = Math.max(0, Math.floor(ix - r)); x < Math.min(ed.w, ix + r); x++) {
      if (Math.hypot(x - ix, y - iy) <= r) d[(y * ed.w + x) * 4 + 3] = 0;
    }
  }
  octx.putImageData(img, 0, 0);
  edRefresh();
}

let lastPt = null;
edcv.addEventListener('mousedown', (e) => {
  const r = edcv.getBoundingClientRect();
  const ex = e.clientX - r.left, ey = e.clientY - r.top;
  if (ed.tool === 'picker') {
    if ($('gradient').checked) borderFlood(Math.max(12, +$('tol').value * 0.4));
    else keyOut(ex, ey, +$('tol').value, $('connected').checked);
  } else { lastPt = [ex, ey]; eraseAt(ex, ey, 14); }
});
edcv.addEventListener('mousemove', (e) => {
  if (ed.tool !== 'eraser' || !lastPt) return;
  const r = edcv.getBoundingClientRect();
  const ex = e.clientX - r.left, ey = e.clientY - r.top;
  const [lx, ly] = lastPt;
  const steps = Math.max(1, Math.hypot(ex - lx, ey - ly) / 6);
  for (let i = 1; i <= steps; i++) eraseAt(lx + (ex - lx) * i / steps, ly + (ey - ly) * i / steps, 14);
  lastPt = [ex, ey];
});
window.addEventListener('mouseup', () => { lastPt = null; });

$('file').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => edLoad(rd.result);
  rd.readAsDataURL(f);
};
$('eraser').onclick = () => { ed.tool = 'eraser'; $('eraser').classList.add('on'); $('picker').classList.remove('on'); };
$('picker').onclick = () => { ed.tool = 'picker'; $('picker').classList.add('on'); $('eraser').classList.remove('on'); };
$('autokey').onclick = autoKey;
$('undo').onclick = () => {
  const im = ed.undo.pop();
  if (!im) return;
  octx.putImageData(im, 0, 0);
  edRefresh();
  $('undo').disabled = ed.undo.length === 0;
};
$('reset').onclick = () => { if (ed.has && ed.origData) { edPushUndo(); octx.putImageData(ed.origData, 0, 0); edRefresh(); } };
$('saveAsset').onclick = () => {
  if (!ed.has) return;
  // 背景残留检测:边缘像素大多不透明 = 背景八成还在
  let opaque = 0, total = 0;
  // 自动裁掉透明边距:素材 = 紧贴内容,摆放坐标才不会整个画布跟着偏
  const img = octx.getImageData(0, 0, ed.w, ed.h);
  const d = img.data;
  for (let x = 0; x < ed.w; x++) { for (const y of [0, ed.h - 1]) { total++; if (d[(y * ed.w + x) * 4 + 3] > 8) opaque++; } }
  for (let y = 0; y < ed.h; y++) { for (const x of [0, ed.w - 1]) { total++; if (d[(y * ed.w + x) * 4 + 3] > 8) opaque++; } }
  let x0 = ed.w, y0 = ed.h, x1 = -1, y1 = -1;
  for (let y = 0; y < ed.h; y++) {
    for (let x = 0; x < ed.w; x++) {
      if (d[(y * ed.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) { toast('画面是全透明的,先抠图或还原'); return; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const crop = document.createElement('canvas');
  crop.width = cw; crop.height = ch;
  crop.getContext('2d').drawImage(edOff, x0, y0, cw, ch, 0, 0, cw, ch);
  const id = 'a' + Date.now().toString(36);
  const assets = loadAssets();
  assets[id] = crop.toDataURL('image/png');
  if (!saveAssets(assets)) { toast('保存失败:浏览器存储空间不足'); return; }
  renderGallery(id);
  toast(`已存入素材库 ${cw}×${ch} 并按标准位置穿上` + (opaque / total > 0.5 ? ' ⚠️ 但边缘大多不透明:背景可能没抠干净!' : ''));
  placed[slot] = []; // 保存新素材 = 替换当前槽位(旧摆放不残留)
  addPlaced(id);
};

// ============ ② 穿戴台 ============
const wcv = $('wcv');
const wctx = wcv.getContext('2d');
const DS = 1.4;                       // 预览缩放(equip 空间 px -> 屏幕 px)
const HEAD = { x: 200, y: 204 };      // 头圆心(屏幕坐标)= 头盔零件原点
const TORSO = { x: 200, y: 310 };     // 躯干中心 = 防弹衣零件原点
let slot = 'head';
let placed = { head: [], torso: [] }; // {id,x,y,w,h,rot} —— equip 局部空间
let sel = -1;
let drag = null;                      // {mode:'move'|'rot', idx, sx, sy, ...}

function slotOrigin() { return slot === 'head' ? HEAD : TORSO; }

function drawCharRef(c) {
  // 简版小人(和游戏内一致的配色,作为摆放参考)
  c.save();
  c.translate(200, 310);
  // 腿
  c.fillStyle = '#2a4a80';
  c.beginPath(); c.roundRect(-24, 73, 18, 76, 8); c.fill();
  c.beginPath(); c.roundRect(6, 73, 18, 76, 8); c.fill();
  c.fillStyle = '#1f1f26';
  c.beginPath(); c.roundRect(-25, 136, 20, 18, 7); c.fill();
  c.beginPath(); c.roundRect(5, 136, 20, 18, 7); c.fill();
  // 躯干(skin) + 弹药带 + 腰带
  c.fillStyle = '#e2b088';
  c.beginPath(); c.roundRect(-42, -73, 84, 146, 34); c.fill();
  c.strokeStyle = '#5a4632'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(-33, -47); c.lineTo(35, -3); c.stroke();
  c.strokeStyle = '#3d2f21';
  c.beginPath(); c.moveTo(-35, -3); c.lineTo(33, 42); c.stroke();
  c.fillStyle = '#603a1e';
  c.fillRect(-42, 45, 84, 18);
  // 手臂(垂在两侧)
  c.fillStyle = '#b8885f';
  c.beginPath(); c.roundRect(-56, -62, 16, 90, 8); c.fill();
  c.beginPath(); c.roundRect(40, -62, 16, 90, 8); c.fill();
  // 头 + 头巾 + 眼
  c.fillStyle = '#e2b088';
  c.beginPath(); c.arc(0, -106, 42, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d8302c';
  c.beginPath(); c.roundRect(-42, -148, 84, 36, [42, 42, 12, 12]); c.fill();
  c.fillStyle = '#222';
  c.beginPath(); c.arc(18, -100, 3.5, 0, Math.PI * 2); c.fill();
  c.restore();
}

function renderWear() {
  const c = wctx;
  c.clearRect(0, 0, wcv.width, wcv.height);
  drawCharRef(c);
  // 槽位锚点十字(装备原点 = 头圆心/躯干中心,摆放坐标相对它)
  c.strokeStyle = 'rgba(255,184,77,0.5)';
  c.lineWidth = 1.2;
  for (const o of [HEAD, TORSO]) {
    c.beginPath();
    c.moveTo(o.x - 10, o.y); c.lineTo(o.x + 10, o.y);
    c.moveTo(o.x, o.y - 10); c.lineTo(o.x, o.y + 10);
    c.stroke();
  }
  for (const s of ['torso', 'head']) { // 头盔最后画(在上一层)
    const o = s === 'head' ? HEAD : TORSO;
    placed[s].forEach((it, i) => {
      const e = croppedImg(it.id);
      // 浅色衬底:没抠干净的深色背景在深色面板里看不出来,衬一层就现形
      c.fillStyle = 'rgba(240,244,255,0.14)';
      c.fillRect(o.x + (it.x - it.w / 2) * DS, o.y + (it.y - it.h / 2) * DS, it.w * DS, it.h * DS);
      if (e.ready && e.im.complete && e.im.naturalWidth) {
        c.save();
        c.translate(o.x + it.x * DS, o.y + it.y * DS);
        c.rotate((it.rot || 0) * Math.PI / 180);
        c.drawImage(e.im, e.sx, e.sy, e.sw, e.sh, -it.w * DS / 2, -it.h * DS / 2, it.w * DS, it.h * DS);
        c.restore();
      }
      if (s === slot && i === sel) {
        // 选中框跟随旋转,和游戏内实际渲染一致
        c.save();
        c.translate(o.x + it.x * DS, o.y + it.y * DS);
        c.rotate((it.rot || 0) * Math.PI / 180);
        c.strokeStyle = '#ffb84d';
        c.lineWidth = 2;
        c.setLineDash([5, 4]);
        c.strokeRect(-it.w * DS / 2, -it.h * DS / 2, it.w * DS, it.h * DS);
        c.setLineDash([]);
        c.restore();
      }
    });
  }
  $('placedInfo').innerHTML = `当前槽位 <b>${slot === 'head' ? '头盔' : '防弹衣'}</b> · 已放 ${placed[slot].length} 件`;
}

function renderGallery(selectId) {
  const g = $('gallery');
  g.innerHTML = '';
  const assets = loadAssets();
  const ids = Object.keys(assets);
  if (!ids.length) { g.innerHTML = '<span style="font-size:11px;opacity:0.5">素材库是空的 —— 左边抠完点「保存为素材」</span>'; return; }
  for (const id of ids) {
    const d = document.createElement('div');
    d.className = 'item' + (id === selectId ? ' sel' : '');
    const im = document.createElement('img');
    im.src = assets[id];
    d.appendChild(im);
    d.title = '点击选中,到小人身上拖放 · 双击删除此素材';
    d.onclick = () => {
      addPlaced(id);
      renderGallery(id);
    };
    d.ondblclick = () => {
      const assets = loadAssets();
      delete assets[id];
      saveAssets(assets);
      imgCache.delete(id);
      cropCache.delete(id); // 裁剪缓存同步清,否则同 id 重建的素材还用旧裁剪框
      // 同步清掉穿戴里引用它的零件
      for (const s of ['head', 'torso']) {
        placed[s] = placed[s].filter((it) => it.id !== id);
        try {
          const eq = JSON.parse(localStorage.getItem(`contra-equip-${s}`) || 'null');
          if (eq?.parts?.some((pt) => pt.img === id)) {
            eq.parts = eq.parts.filter((pt) => pt.img !== id);
            saveEquip(s, eq);
          }
        } catch { /* 忽略 */ }
      }
      renderGallery();
      renderWear();
      toast('素材已删除');
    };
    g.appendChild(d);
  }
}

// 素材图预加载缓存,避免重复 new Image;加载完成自动重绘(图片是异步解码的)
const imgCache = new Map();
function cachedImg(id) {
  if (!imgCache.has(id)) {
    const im = new Image();
    im.onload = () => renderWear();
    im.src = loadAssets()[id] || '';
    imgCache.set(id, im);
  }
  return imgCache.get(id);
}

// 裁剪缓存:算出素材的透明边裁剪区(老素材没裁过边,摆放时统一补裁)
const cropCache = new Map();
function croppedImg(id) {
  if (cropCache.has(id)) return cropCache.get(id);
  const im = cachedImg(id);
  const entry = { im, sx: 0, sy: 0, sw: im.naturalWidth || 0, sh: im.naturalHeight || 0, ready: false, onReady: null };
  cropCache.set(id, entry);
  const compute = () => {
    try {
      if (!im.naturalWidth) { entry.ready = true; return; }
      const k = Math.min(1, 512 / Math.max(im.naturalWidth, im.naturalHeight));
      const c2 = document.createElement('canvas');
      c2.width = Math.max(1, Math.round(im.naturalWidth * k));
      c2.height = Math.max(1, Math.round(im.naturalHeight * k));
      const c2x = c2.getContext('2d');
      c2x.drawImage(im, 0, 0, c2.width, c2.height);
      const d = c2x.getImageData(0, 0, c2.width, c2.height).data;
      let x0 = c2.width, y0 = c2.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c2.height; y++) {
        for (let x = 0; x < c2.width; x++) {
          if (d[(y * c2.width + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 >= 0) {
        entry.sx = x0 / k; entry.sy = y0 / k;
        entry.sw = (x1 - x0 + 1) / k; entry.sh = (y1 - y0 + 1) / k;
      }
      entry.ready = true;
      entry.onReady?.();
      renderWear();
    } catch { entry.ready = true; }
  };
  if (im.complete && im.naturalWidth) compute();
  else im.addEventListener('load', compute);
  return entry;
}

// 标准装备框:与我手绘预设头盔/防弹衣所占区域完全一致。
// 上传素材按此框等比适配(contain + 居中) —— "换贴图"式穿戴,位置天生正确
const SLOT_BOX = {
  head: { x: -38, y: -48, w: 76, h: 40 },
  torso: { x: -38, y: -50, w: 76, h: 100 },
};

function addPlaced(id) {
  const e = croppedImg(id);
  const box = SLOT_BOX[slot];
  // 等比适配进标准框(contain + 居中),和预设头盔/防弹衣的位置完全一致
  const ratio = (e.sh || box.h) / (e.sw || box.w) || 1;
  let w = box.w, h = box.w * ratio;
  if (h > box.h) { h = box.h; w = h / ratio; }
  const it = {
    id, x: box.x + box.w / 2, y: box.y + box.h / 2, w, h, rot: 0, baseW: w,
    crop: { sx: e.sx, sy: e.sy, sw: e.sw, sh: e.sh },
  };
  placed[slot].push(it);
  sel = placed[slot].length - 1;
  if (!e.ready) {
    // 图未就绪时先按标准框占位,裁剪区算完后按内容比例重适配
    e.onReady = () => {
      const r2 = (e.sh || box.h) / (e.sw || box.w) || 1;
      let w2 = box.w, h2 = box.w * r2;
      if (h2 > box.h) { h2 = box.h; w2 = h2 / r2; }
      it.w = w2; it.h = h2; it.baseW = w2;
      it.crop = { sx: e.sx, sy: e.sy, sw: e.sw, sh: e.sh };
      renderWear();
    };
  }
  renderWear();
}
const renderWearCached = renderWear;

// 穿戴台交互:拖动 / 滚轮缩放 / Shift+拖旋转
function hitTest(sx, sy) {
  const o = slotOrigin();
  for (let i = placed[slot].length - 1; i >= 0; i--) {
    const it = placed[slot][i];
    const dx = (sx - o.x) / DS - it.x, dy = (sy - o.y) / DS - it.y;
    const rr = (it.rot || 0) * Math.PI / 180;
    const lx = dx * Math.cos(-rr) - dy * Math.sin(-rr);
    const ly = dx * Math.sin(-rr) + dy * Math.cos(-rr);
    if (Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.h / 2) return i;
  }
  return -1;
}
wcv.addEventListener('mousedown', (e) => {
  const r = wcv.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  sel = hitTest(sx, sy);
  if (sel >= 0) {
    const it = placed[slot][sel];
    drag = e.shiftKey
      ? { mode: 'rot', idx: sel, a0: Math.atan2(sy - slotOrigin().y, sx - slotOrigin().x), r0: it.rot || 0 }
      : { mode: 'move', idx: sel, ox: sx, oy: sy, x0: it.x, y0: it.y };
    syncSliders();
  }
  renderWearCached();
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const r = wcv.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const it = placed[slot][drag.idx];
  if (!it) return;
  if (drag.mode === 'move') {
    it.x = drag.x0 + (sx - drag.ox) / DS;
    it.y = drag.y0 + (sy - drag.oy) / DS;
  } else {
    const a = Math.atan2(sy - slotOrigin().y, sx - slotOrigin().x);
    it.rot = Math.round(drag.r0 + (a - drag.a0) * 180 / Math.PI);
    $('rot').value = Math.max(-180, Math.min(180, it.rot));
  }
  renderWearCached();
});
window.addEventListener('mouseup', () => { drag = null; });
wcv.addEventListener('wheel', (e) => {
  const r = wcv.getBoundingClientRect();
  const hit = hitTest(e.clientX - r.left, e.clientY - r.top);
  if (hit < 0) return;
  e.preventDefault();
  const it = placed[slot][hit];
  const k = e.deltaY < 0 ? 1.08 : 1 / 1.08;
  it.w = Math.max(12, it.w * k);
  it.h = Math.max(12, it.h * k);
  sel = hit;
  syncSliders();
  renderWearCached();
}, { passive: false });

function syncSliders() {
  const it = placed[slot][sel];
  if (!it) return;
  $('scale').value = Math.round(it.w / (it.baseW || it.w) * 100);
  $('rot').value = Math.max(-180, Math.min(180, it.rot || 0));
}
$('scale').oninput = () => {
  const it = placed[slot][sel];
  if (!it) return;
  const base = Math.max(12, it.baseW || it.w);
  const k = +$('scale').value / 100;
  const ratio = it.h / it.w || 1;
  it.w = base * k;
  it.h = base * k * ratio;
  renderWearCached();
};
$('rot').oninput = () => {
  const it = placed[slot][sel];
  if (!it) return;
  it.rot = +$('rot').value;
  renderWearCached();
};
$('fitBox').onclick = () => {
  const it = placed[slot][sel];
  if (!it) return;
  const box = SLOT_BOX[slot];
  const ratio = (it.h || box.h) / (it.w || box.w) || 1;
  let w = box.w, h = box.w * ratio;
  if (h > box.h) { h = box.h; w = h / ratio; }
  it.x = box.x + box.w / 2; it.y = box.y + box.h / 2;
  it.w = w; it.h = h; it.rot = 0; it.baseW = w;
  syncSliders();
  renderWear();
};
$('delPlaced').onclick = () => {
  if (sel < 0) return;
  placed[slot].splice(sel, 1);
  sel = -1;
  renderWearCached();
};

// 槽位切换
function setSlot(s) {
  slot = s;
  sel = -1;
  $('slotHead').classList.toggle('active', s === 'head');
  $('slotTorso').classList.toggle('active', s === 'torso');
  const eq = loadEquip(s);
  $('defense').value = eq?.defense ?? 0.35;
  renderWearCached();
}
$('slotHead').onclick = () => setSlot('head');
$('slotTorso').onclick = () => setSlot('torso');

// 保存:当前槽位的图片零件写入 contra-equip-*(与设计器共用键,游戏实时生效)
$('saveEquip').onclick = () => {
  const parts = placed[slot].map((it) => {
    // 保存时实时取最新裁剪区(图片异步就绪前摆放的零件也能拿到正确 crop)
    const e = croppedImg(it.id);
    const crop = e.ready && e.sw > 0 ? { sx: +e.sx.toFixed(1), sy: +e.sy.toFixed(1), sw: +e.sw.toFixed(1), sh: +e.sh.toFixed(1) } : undefined;
    return {
      ...equipmentPartToStorage(it),
      img: it.id, x: +equipmentPartToStorage(it).x.toFixed(1), y: +equipmentPartToStorage(it).y.toFixed(1), w: +it.w.toFixed(1), h: +it.h.toFixed(1),
      rot: it.rot || 0, crop,
    };
  });
  const label = slot === 'head' ? '头盔' : '防弹衣';
  saveEquip(slot, {
    slot, name: `工坊${label}`, defense: parseFloat($('defense').value) || 0,
    meterScale: 200, coordinateSpace: EQUIPMENT_COORDINATE_SPACE, parts,
  });
  toast(parts.length ? `已穿上工坊${label}!切回游戏页即可看到` : `已保存(空)—— 相当于脱下${label}`);
};
$('clearEquip').onclick = () => {
  placed[slot] = [];
  sel = -1;
  saveEquip(slot, { slot, name: '未穿戴', defense: 0, meterScale: 200, parts: [] });
  renderWearCached();
  toast(`已脱下${slot === 'head' ? '头盔' : '防弹衣'}`);
};

// 打开时载入当前穿戴里的图片零件(矩形零件来自预设,不在工坊里编辑)
function loadCurrent() {
  for (const s of ['head', 'torso']) {
    try {
      const raw = localStorage.getItem(`contra-equip-${s}`);
      if (!raw) continue;
      const eq = JSON.parse(raw);
      placed[s] = (eq?.parts || []).filter((pt) => pt.img).map((pt) => equipmentPartToStudio(eq, pt));
    } catch { /* 忽略 */ }
  }
}

// ---- 调试/自动化钩子 ----
window.__studio = {
  loadImageFromDataURL: edLoad,
  keyOut,
  borderFlood,
  addPlaced,
  saveAsset: () => $('saveAsset').onclick(),
  save: () => $('saveEquip').onclick(),
  getState: () => ({ slot, sel, placed, has: ed.has, assets: Object.keys(loadAssets()) }),
};

loadCurrent();
renderGallery();
setSlot('head');
