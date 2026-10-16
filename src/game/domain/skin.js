// 皮肤领域层:玩家自绘皮肤 + 装备外观 DIY(头/躯干/大臂/小臂/大腿/小腿 + 头盔/防弹衣)。
// 存档 'contra-skin' = { version: 2, parts: { head: {src, ox, oy, scale}, ... } }
// src = **已抠底、已裁边、已转正**的 PNG dataURL —— 处理发生在皮肤工坊上传时,游戏端只消费。
// ox/oy/scale = 用户微调(部件标准框内,米,y 向下与图片一致);v1 存档没有这些字段,默认 0/0/1。
// 渲染约定(player.draw):图片竖直摆放,上端 = 根(头顶/肩/髋),下端 = 端(下巴/手/脚);
// 头/躯干/头盔/防弹衣随朝向左右镜像(与 drawEquip 同款纸娃娃翻转),四肢不翻。
// 头盔/防弹衣是**装备外观层**:只在真的穿戴着对应护甲时显示,替代视觉预设(数值仍走背包装备)。
// 敌人不吃皮肤(opts.palette 传入的 Dummy 在 player.draw 里跳过)。
export const SKIN_PARTS = ['head', 'torso', 'upperArm', 'foreArm', 'thigh', 'calf', 'helmet', 'vest'];
export const SKIN_LABEL = {
  head: '头', torso: '躯干', upperArm: '大臂', foreArm: '小臂', thigh: '大腿', calf: '小腿',
  helmet: '头盔(外观)', vest: '防弹衣(外观)',
};
// 部件标准框(米):贴图适配进这个框,再乘用户缩放。
// ⚠️ 框是"视觉框"不是物理碰撞盒 —— 刻意比碰撞盒大并让相邻框**互相搭接**(头/躯干伸进对方
// 0.02~0.06m、四肢子段伸过关节 0.02~0.04m),否则拆掉护甲后部件之间会露出天生空挡
// (碰撞盒之间本来就有缝,原程序小人靠"脖子"笔画遮缝,皮肤没有)。
// base 六件的框心仍在对应刚体的质心;anchor 表示装备外观画在哪个身体的局部空间。
// 游戏与工坊预览/编辑器共用这一份 —— 不错位、不偏移的根基就是"只有一个尺寸事实源"。
export const SKIN_BOX = {
  head: { w: 0.36, h: 0.36 },     // 方框:方/圆头图填满后底缘 +0.35,与躯干顶(0.68/2=0.34)只差半像素
  torso: { w: 0.32, h: 0.68 },    // ±0.34:上接头、下盖髋(髋 -0.24)
  upperArm: { w: 0.10, h: 0.30 }, // 质心 +0.07 → 框 +0.22..-0.08:上段伸过肩关节,被躯干盖住
  foreArm: { w: 0.09, h: 0.30, tip: 0.03 }, // 质心 -0.18 → 框 -0.03..-0.33;tip=身体末端(手/枪握点)距框底 0.03
  thigh: { w: 0.14, h: 0.32 },   // 质心 -0.38 → 框 -0.22..-0.54:上端伸过髋关节(-0.24);宽度用户嫌细加过一档
  calf: { w: 0.13, h: 0.30, tip: 0.02 },   // 质心 -0.65 → 框 -0.50..-0.80;tip=脚底(落地)距框底 0.02
  helmet: { w: 0.40, h: 0.32, anchor: 'head' },  // 锚在头部局部空间,框中心=头圆心
  vest: { w: 0.36, h: 0.60, anchor: 'torso' },   // 锚在躯干局部空间,框中心=躯干中心
};
// 贴图适配基准(米/像素,不含用户 scale;调用处必须再乘 ppm/mEPPM/PPM2),返回 {sx, sy}:
// - **四肢 = 拉伸填充**:不管画多细都撑满部件框的宽和高 —— 简笔画细线条腿按长度定标会渲染成
//   1~2px 的细线(用户实测"腿太细、小腿看不见"毙过);比例画得接近框则几乎无变形。
// - 头/躯干/头盔/背心 = 按长度定标(高度填满,宽度随素材钳制):躯干框竖长,contain 会把方形
//   躯干压成 1/3 高(用户实测毙过),拉伸又会把宽躯干压窄,长度定标是这两者间的正确解。
export function skinFitScale(part, iw, ih) {
  const b = SKIN_BOX[part];
  if (SKIN_END_ANCHORED[part] || part === 'upperArm' || part === 'thigh') {
    return { sx: b.w / iw, sy: b.h / ih }; // 拉伸填充(foreArm/calf 含在 END_ANCHORED 里)
  }
  const s = Math.min(b.h / ih, ((part === 'head' ? 1.8 : 2.2) * b.w) / iw);
  return { sx: s, sy: s };
}
// 端点锚定件(foreArm/calf):图片**底边**对齐身体末端而不是居中 ——
// 小臂底端=手=枪的握把(枪系统锚定在 armLF 刚体末端),小腿底端=脚底=落地点。
// 手画在小臂素材最下端,自动握在握把上(用户实测:居中时手飘到撞针那头,毙过)。
export const SKIN_END_ANCHORED = { foreArm: true, calf: true };
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
  try { localStorage.setItem(KEY, JSON.stringify(s)); __rawCache = null; imgCache = {}; return true; } catch { return false; }
}
export function clearSkin() {
  try { localStorage.removeItem(KEY); } catch { /* 忽略 */ }
  __rawCache = null; imgCache = {};
}

// 用户微调变换(v1 存档/缺字段 → 全默认)
export function skinXf(part) {
  const p = loadSkin()?.parts?.[part];
  return { ox: p?.ox || 0, oy: p?.oy || 0, scale: p?.scale || 1 };
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
window.__skin = { skinImg, skinXf, loadSkin }; // 调试句柄

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

// ---- 端点标记转正(皮肤工坊用):用户点"上端(根)→下端(端)"两个点,素材自动旋转成
// 上端在上、下端在下 —— 支持任意角度素材(躺着画的、照片拍歪的),转完重裁边。
// (ax,ay)/(bx,by) = 上端/下端在**源图像素坐标**里的位置
export function orientSkinImage(src, ax, ay, bx, by) {
  const iw = src.naturalWidth || src.width;
  const ih = src.naturalHeight || src.height;
  if (!iw || !ih) return { ok: false, msg: '图片为空' };
  const vx = bx - ax, vy = by - ay;
  if (Math.hypot(vx, vy) < Math.min(iw, ih) * 0.12) return { ok: false, msg: '两个标记点太近,再分远一点' };
  const th = Math.atan2(vx, vy); // 旋成 A→B 指向图片下方(+y)
  const diag = Math.ceil(Math.hypot(iw, ih)) + 4;
  const cv = document.createElement('canvas');
  cv.width = diag; cv.height = diag;
  const c = cv.getContext('2d');
  c.translate(diag / 2, diag / 2);
  c.rotate(th);
  c.drawImage(src, -iw / 2, -ih / 2);
  // 转完重裁透明边(+2px)
  const d = c.getImageData(0, 0, diag, diag).data;
  let x0 = diag, y0 = diag, x1 = -1, y1 = -1;
  for (let y = 0; y < diag; y++) for (let x = 0; x < diag; x++) {
    if (d[(y * diag + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { ok: false, msg: '转正后什么都没剩?' };
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2);
  x1 = Math.min(diag - 1, x1 + 2); y1 = Math.min(diag - 1, y1 + 2);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(cv, -x0, -y0);
  return { ok: true, dataURL: out.toDataURL('image/png'), w: out.width, h: out.height, rotatedDeg: +(th * 180 / Math.PI).toFixed(1) };
}
