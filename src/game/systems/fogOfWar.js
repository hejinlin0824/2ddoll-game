// World-space fog of war for the multi-storey raid.
// Unseen geometry is rendered as a quiet floorplan; dynamic units only render inside live sight.
// Low-resolution world-space mask is intentionally upscaled with smoothing; it keeps the fog soft and inexpensive.
const WORLD = Object.freeze({ minX: -12, maxX: 78, minY: -4, maxY: 17, pixelsPerMeter: 6 });
const VIEW_RADIUS = 8.0;
const RAY_COUNT = 88;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let sceneId = null;
let exploredCanvas = null, exploredCtx = null;
let visibleCanvas = null, visibleCtx = null;
let fogCanvas = null, fogCtx = null;
let visiblePixels = null;
let blockerSource = null, blockerLength = -1, blockers = [];

const width = () => Math.round((WORLD.maxX - WORLD.minX) * WORLD.pixelsPerMeter);
const height = () => Math.round((WORLD.maxY - WORLD.minY) * WORLD.pixelsPerMeter);
const texPoint = (x, y) => [(x - WORLD.minX) * WORLD.pixelsPerMeter, (WORLD.maxY - y) * WORLD.pixelsPerMeter];

function ensureCanvases() {
  if (typeof document === 'undefined') return false;
  if (!exploredCanvas) {
    exploredCanvas = document.createElement('canvas');
    visibleCanvas = document.createElement('canvas');
    fogCanvas = document.createElement('canvas');
    exploredCtx = exploredCanvas.getContext('2d', { willReadFrequently: true });
    visibleCtx = visibleCanvas.getContext('2d', { willReadFrequently: true });
    fogCtx = fogCanvas.getContext('2d');
  }
  if (!exploredCtx || !visibleCtx || !fogCtx) return false;
  const w = width(), h = height();
  for (const canvas of [exploredCanvas, visibleCanvas, fogCanvas]) {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  return true;
}

function isVisionBlocker(r) {
  if (!r || !Number.isFinite(r.x + r.y + r.w + r.h)) return false;
  // Keep all doors in the cache; whether a door blocks sight changes as it animates.
  return r.type === 'wall' || r.type === 'door' || r.type === 'steel'
    || r.type === 'crate' || r.type === 'cover' || r.type === 'sandbag'
    || r.type === 'timber' || r.type === 'container' || r.type === 'container-red'
    || r.type === 'concrete' || r.type === 'ground' || r.type === 'plat' || r.type === 'stair';
}

function rayAABB(x, y, dx, dy, r) {
  let tMin = 0, tMax = Infinity;
  for (const [o, d, c, half] of [
    [x, dx, r.x, r.w / 2],
    [y, dy, r.y, r.h / 2],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o - c) > half) return Infinity;
      continue;
    }
    let t1 = (c - half - o) / d;
    let t2 = (c + half - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }
  return tMin;
}

function getBlockers(rects) {
  if (rects !== blockerSource || rects.length !== blockerLength) {
    blockerSource = rects;
    blockerLength = rects.length;
    blockers = rects.filter(isVisionBlocker);
  }
  return blockers;
}

function makeVisibilityPolygon(player, rects) {
  const p = player?.torso?.getPosition?.();
  if (!p || !Number.isFinite(p.x + p.y)) return null;
  const blocking = getBlockers(rects);
  const points = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (i / RAY_COUNT) * Math.PI * 2;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let distance = VIEW_RADIUS;
    for (const r of blocking) {
      if (r.type === 'door' && (r.doorOpen || (r.doorAngle || 0) > 0.10)) continue;
      const hit = rayAABB(p.x, p.y + 0.12, dx, dy, r);
      if (hit > 0.045 && hit < distance) distance = Math.max(0.08, hit - 0.035);
    }
    points.push({ x: p.x + dx * distance, y: p.y + 0.12 + dy * distance });
  }
  return { origin: { x: p.x, y: p.y + 0.12 }, points };
}

function paintVisibility(ctx, polygon) {
  ctx.clearRect(0, 0, width(), height());
  if (!polygon) return;
  const [ox, oy] = texPoint(polygon.origin.x, polygon.origin.y);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  for (const p of polygon.points) {
    const [x, y] = texPoint(p.x, p.y);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function rebuildFogTexture() {
  fogCtx.save();
  fogCtx.setTransform(1, 0, 0, 1, 0, 0);
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.globalAlpha = 1;
  fogCtx.clearRect(0, 0, width(), height());
  fogCtx.fillStyle = 'rgba(2,7,12,0.975)';
  fogCtx.fillRect(0, 0, width(), height());
  // Visited space keeps only a dark, schematic trace. Its dynamic contents are still hidden.
  fogCtx.globalCompositeOperation = 'destination-out';
  fogCtx.globalAlpha = 0.075;
  fogCtx.drawImage(exploredCanvas, 0, 0);
  // Current line-of-sight is clear, while the persistent explored mask is left intact.
  fogCtx.globalAlpha = 1;
  fogCtx.drawImage(visibleCanvas, 0, 0);
  fogCtx.restore();
  try { visiblePixels = visibleCtx.getImageData(0, 0, width(), height()).data; }
  catch { visiblePixels = null; }
}

export function resetFogOfWar(scene = 'wild') {
  sceneId = scene || 'wild';
  blockerSource = null;
  blockerLength = -1;
  blockers = [];
  visiblePixels = null;
  if (!ensureCanvases()) return;
  exploredCtx.clearRect(0, 0, width(), height());
  visibleCtx.clearRect(0, 0, width(), height());
  fogCtx.clearRect(0, 0, width(), height());
}

export function updateFogOfWar({ scene = 'wild', player, rects = [] } = {}) {
  const nextScene = scene || 'wild';
  if (sceneId !== nextScene) resetFogOfWar(nextScene);
  if (nextScene !== 'raid' || !ensureCanvases()) return;
  const polygon = makeVisibilityPolygon(player, rects);
  paintVisibility(visibleCtx, polygon);
  exploredCtx.save();
  exploredCtx.globalCompositeOperation = 'source-over';
  exploredCtx.globalAlpha = 1;
  exploredCtx.drawImage(visibleCanvas, 0, 0);
  exploredCtx.restore();
  rebuildFogTexture();
}

export function isWorldCurrentlyVisible(x, y) {
  if (sceneId !== 'raid') return true;
  if (!visiblePixels || !Number.isFinite(x + y)) return true;
  const [tx, ty] = texPoint(x, y);
  const ix = Math.floor(tx), iy = Math.floor(ty);
  if (ix < 0 || iy < 0 || ix >= width() || iy >= height()) return false;
  return visiblePixels[(iy * width() + ix) * 4 + 3] > 12;
}

export function drawFogOfWar(ctx, { scene = 'wild', cam, w2s, ppm, W, H } = {}) {
  if (scene !== 'raid' || !fogCanvas || !w2s || !cam || !Number.isFinite(ppm) || ppm <= 0) return;
  const left = Math.max(WORLD.minX, cam.x - W / (2 * ppm));
  const right = Math.min(WORLD.maxX, cam.x + W / (2 * ppm));
  const top = Math.min(WORLD.maxY, cam.y + H * 0.60 / ppm);
  const bottom = Math.max(WORLD.minY, cam.y - H * 0.40 / ppm);
  if (right <= left || top <= bottom) return;
  const [sx, sy] = w2s(left, top);
  const [ex, ey] = w2s(right, bottom);
  const sourceX = (left - WORLD.minX) * WORLD.pixelsPerMeter;
  const sourceY = (WORLD.maxY - top) * WORLD.pixelsPerMeter;
  const sourceW = (right - left) * WORLD.pixelsPerMeter;
  const sourceH = (top - bottom) * WORLD.pixelsPerMeter;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogCanvas, sourceX, sourceY, sourceW, sourceH, sx, sy, ex - sx, ey - sy);
  ctx.restore();
}

export function getFogDiagnostics() {
  return {
    scene: sceneId,
    viewRadius: VIEW_RADIUS,
    rayCount: RAY_COUNT,
    visited: !!exploredCanvas,
    visiblePixelCount: visiblePixels ? visiblePixels.reduce((n, alpha, i) => n + (i % 4 === 3 && alpha > 12 ? 1 : 0), 0) : 0,
  };
}
