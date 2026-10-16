// 皮肤领域层:玩家自绘皮肤六件套(头/躯干/大臂/小臂/大腿/小腿)。
// 存档 'contra-skin' = { version: 1, parts: { head: {src}, ... } }
// src = **已抠底、已裁边**的 PNG dataURL —— 处理发生在皮肤工坊上传时,游戏端只消费不处理。
// 渲染约定(player.draw):图片竖直摆放,上端 = 根(头顶/肩/髋),下端 = 端(下巴/手/脚);
// 头/躯干随朝向左右镜像(与 drawEquip 同款纸娃娃翻转),四肢不翻。
// 敌人不吃皮肤(opts.palette 传入的 Dummy 在 player.draw 里跳过)。
export const SKIN_PARTS = ['head', 'torso', 'upperArm', 'foreArm', 'thigh', 'calf'];
export const SKIN_LABEL = {
  head: '头', torso: '躯干', upperArm: '大臂', foreArm: '小臂', thigh: '大腿', calf: '小腿',
};
const KEY = 'contra-skin';

export function loadSkin() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === __rawCache) return __skinCache; // 每帧读档的快速路径:字符串没变就不重新 JSON.parse
    const s = JSON.parse(raw || 'null');
    __rawCache = raw; __skinCache = s && s.parts ? s : null;
    return __skinCache;
  } catch { return null; }
}
let __rawCache; let __skinCache;
export function saveSkin(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); imgCache = {}; return true; } catch { return false; }
}
export function clearSkin() {
  try { localStorage.removeItem(KEY); } catch { /* 忽略 */ }
  imgCache = {};
}

// ---- 游戏端图像缓存(part -> HTMLImageElement;同标签页重存/跨标签页 storage 都会失效) ----
let imgCache = {};
window.addEventListener('storage', (e) => { if (e.key === KEY) imgCache = {}; });
// 返回"已就绪"的贴图;解码未完成的帧返回 null(调用方回退程序绘制,就绪后自然出现)
export function skinImg(part) {
  const src = loadSkin()?.parts?.[part]?.src;
  if (!src) return null;
  let im = imgCache[part];
  if (!im || im.__src !== src) {
    im = new Image();
    im.src = src;
    im.__src = src;
    imgCache[part] = im;
  }
  return im.complete && im.naturalWidth ? im : null;
}

// ---- 上传处理管线(皮肤工坊用):抠白底 + 自动裁边,纯 canvas 无依赖 ----
// 白底判定:取四边不透明像素的平均色当背景参考(抗纸面偏色);
// 默认"边缘连通"模式 —— 只抠与画面边缘连通的背景白,角色内部的白(脸/衣)保留;
// 全局模式则整图抠白(想要"镂空线稿"效果用)。
// 近白抗锯齿边做软过渡,避免贴到夜色背景上留白圈。
const PROC_MAX = 256; // 处理/存储的最长边(上屏最大才 ~28px,256 足够且省 localStorage)

export function processSkinImage(source, opts = {}) {
  const tol = opts.tol ?? 34;              // 抠色容差(与背景平均色的距离)
  const connected = opts.connected !== false; // true=只抠边缘连通(默认,保护内部白)
  // 1) 归一尺寸
  const iw = source.naturalWidth || source.width;
  const ih = source.naturalHeight || source.height;
  if (!iw || !ih) return { ok: false, msg: '图片为空' };
  const k = Math.min(1, PROC_MAX / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(source, 0, 0, w, h);
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  // 2) 背景参考色 = 四边不透明像素均值
  let br = 0, bg = 0, bb = 0, bn = 0;
  const isBorder = (x, y) => x === 0 || y === 0 || x === w - 1 || y === h - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isBorder(x, y)) continue;
    const i = (y * w + x) * 4;
    if (d[i + 3] > 8) { br += d[i]; bg += d[i + 1]; bb += d[i + 2]; bn++; }
  }
  if (!bn) return { ok: false, msg: '画面为空(全透明?)' };
  br /= bn; bg /= bn; bb /= bn;
  const dist = (i) => Math.sqrt((d[i] - br) ** 2 + (d[i + 1] - bg) ** 2 + (d[i + 2] - bb) ** 2);
  const soft = tol * 0.9; // 容差~1.9×容差 之间按距离衰减 alpha(抗锯齿软边)
  const setAlpha = (i, a) => { d[i + 3] = Math.min(d[i + 3], Math.round(a)); };
  let removed = 0;
  if (connected) {
    // 边缘连通洪水:从四边的"接近背景色"像素出发,只沿背景色蔓延
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!isBorder(x, y)) continue;
      const kk = y * w + x, i = kk * 4;
      if (d[i + 3] === 0) { seen[kk] = 1; continue; }
      if (dist(i) <= tol) { seen[kk] = 1; setAlpha(i, 0); removed++; stack.push(kk); }
    }
    while (stack.length) {
      const kk = stack.pop();
      const x = kk % w, y = (kk / w) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (seen[nk]) continue;
        seen[nk] = 1;
        const i = nk * 4;
        if (d[i + 3] === 0) continue;
        const dd = dist(i);
        if (dd > soft * 2.1) continue; // 离背景太远 = 前景,不碰
        if (dd <= tol) { setAlpha(i, 0); removed++; }
        else setAlpha(i, d[i + 3] * ((dd - tol) / soft)); // 软边
        stack.push(nk);
      }
    }
  } else {
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const dd = dist(i);
      if (dd <= tol) { setAlpha(i, 0); removed++; }
      else if (dd < tol + soft) setAlpha(i, d[i + 3] * ((dd - tol) / soft));
    }
  }
  // 3) 自动裁边:alpha>8 的包围盒 + 2px 边距
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { ok: false, msg: '抠完什么都没剩 —— 检查容差(画面主体被当成背景色了?)' };
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2);
  x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(h - 1, y1 + 2);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d').putImageData(img, -x0, -y0);
  return {
    ok: true, dataURL: out.toDataURL('image/png'),
    w: cw, h: ch, removedPct: +(100 * removed / (w * h)).toFixed(1),
  };
}
