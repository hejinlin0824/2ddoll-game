// HERO's shared light field: visual light pools, darkness and per-frame light queries for stealth AI.
// Kept renderer-agnostic so the same pass is used by the main view and the sniper scope.
import { RAID_FLOOR_COUNT, RAID_FLOOR_HEIGHT, raidFloorBand, rectIntersectsRaidFloor } from '../domain/raidVisibility.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const lightingState = {
  scene: localStorage.getItem('contra-scene') || 'wild',
  powerOn: true,
  nightVision: false,
  flashlightOn: false,
  flashlightBattery: 100,
  flashlightX: 0,
  flashlightY: 0,
  flashlightAngle: 0,
};

let maskCanvas = null;
let maskCtx = null;

export function resetLightingState(scene = 'wild') {
  lightingState.scene = scene || 'wild';
  lightingState.powerOn = true;
  lightingState.nightVision = false;
  lightingState.flashlightOn = false;
  lightingState.flashlightBattery = 100;
  lightingState.flashlightX = 0;
  lightingState.flashlightY = 0;
  lightingState.flashlightAngle = 0;
}

export function toggleBuildingPower() {
  lightingState.powerOn = !lightingState.powerOn;
  return lightingState.powerOn;
}

export function toggleNightVision() {
  lightingState.nightVision = !lightingState.nightVision;
  return lightingState.nightVision;
}

export function toggleFlashlight() {
  if (!lightingState.flashlightOn && lightingState.flashlightBattery <= 0.5) return false;
  lightingState.flashlightOn = !lightingState.flashlightOn;
  return lightingState.flashlightOn;
}

export function updateLighting(dt, { scene, player, aim } = {}) {
  if (scene && scene !== lightingState.scene) resetLightingState(scene);
  const d = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  if (lightingState.flashlightOn) {
    lightingState.flashlightBattery = Math.max(0, lightingState.flashlightBattery - d * 1.25);
    if (lightingState.flashlightBattery <= 0) lightingState.flashlightOn = false;
  } else {
    lightingState.flashlightBattery = Math.min(100, lightingState.flashlightBattery + d * 0.24);
  }
  if (player?.torso) {
    const p = player.torso.getPosition();
    lightingState.flashlightX = p.x;
    lightingState.flashlightY = p.y + 0.1;
    // Aim the flashlight toward the cursor; use facing as a safe fallback before the first mouse move.
    if (aim?.active && Number.isFinite(aim.x) && Number.isFinite(aim.y)
      && Math.hypot(aim.x - lightingState.flashlightX, aim.y - lightingState.flashlightY) > 0.15) {
      lightingState.flashlightAngle = Math.atan2(aim.y - lightingState.flashlightY, aim.x - lightingState.flashlightX);
    } else {
      lightingState.flashlightAngle = player.facing < 0 ? Math.PI : 0;
    }
  }
}

function rayAABB(x, y, dx, dy, r) {
  let tmin = 0, tmax = Infinity;
  for (const [o, d, c, h] of [[x, dx, r.x, r.w / 2], [y, dy, r.y, r.h / 2]]) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o - c) > h) return Infinity;
    } else {
      let t1 = (c - h - o) / d, t2 = (c + h - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

function blocksLight(r) {
  if (!r || (r.type === 'door' && (r.doorOpen || (r.doorAngle || 0) > 0.10))) return false;
  return r.type === 'wall' || r.type === 'door' || r.type === 'steel'
    || r.type === 'crate' || r.type === 'container' || r.type === 'container-red'
    || (r.type === 'concrete' && r.h > 0.8);
}

function lightBlocked(x0, y0, x1, y1, rects) {
  const dx = x1 - x0, dy = y1 - y0;
  for (const r of rects) {
    if (!blocksLight(r)) continue;
    const t = rayAABB(x0, y0, dx, dy, r);
    if (t > 0.025 && t < 0.98) return true;
  }
  return false;
}

const floorIdAt = (y) => {
  const feet = y - 0.9;
  let id = 0, best = Infinity;
  for (let i = 0; i < RAID_FLOOR_COUNT; i++) {
    const d = Math.abs(feet - i * RAID_FLOOR_HEIGHT);
    if (d < best) { best = d; id = i; }
  }
  return id;
};

function ambientFloorLights() {
  // Emergency fittings are part of the building, not destructible gameplay objects.
  return [0, 1, 2].flatMap((floor) => [4.0, 36.5, 69.0].map((x) => ({
    x, y: floor * RAID_FLOOR_HEIGHT + 2.9, radius: 2.7, strength: 0.18,
    color: '255,66,50', floor, type: 'emergency',
  })));
}

function collectSources(state, rects, time, flash, rings) {
  const sources = [];
  for (const r of rects) {
    if (r.type !== 'lamp' || r.hp <= 0) continue;
    if (state.powerOn) {
      // Two slow oscillations read as a hanging fixture gently swaying and an old ballast flickering.
      const sway = Math.sin(time * 1.65 + r.x * 0.73);
      const flicker = 0.92 + 0.055 * Math.sin(time * 7.1 + r.x) + 0.025 * Math.sin(time * 13.4 + r.x * 0.3);
      sources.push({
        x: r.x + sway * 0.075, y: r.y - 0.22 + sway * 0.045,
        radius: 5.2, strength: clamp(flicker, 0.76, 1),
        color: '255,173,85', floor: r.raidFloorId ?? floorIdAt(r.y), type: 'lamp', id: r.lampId,
      });
    }
  }
  if (!state.powerOn) sources.push(...ambientFloorLights());
  if (state.flashlightOn && state.flashlightBattery > 0) {
    sources.push({
      x: state.flashlightX, y: state.flashlightY, radius: 6.2,
      strength: 0.74 * clamp(state.flashlightBattery / 12, 0.2, 1),
      color: '205,225,255', floor: floorIdAt(state.flashlightY),
      type: 'flashlight', angle: state.flashlightAngle, cone: 0.46,
    });
  }
  if (flash?.t > 0 && Number.isFinite(flash.x) && Number.isFinite(flash.y)) {
    sources.push({
      x: flash.x, y: flash.y, radius: 2.4 + (flash.r || 25) / 70,
      strength: clamp(flash.t / 0.09, 0, 1), color: '255,194,112',
      floor: floorIdAt(flash.y), type: 'muzzle',
    });
  }
  for (const ring of rings || []) {
    if (ring.life <= 0) continue;
    sources.push({
      x: ring.x, y: ring.y, radius: clamp(2.3 + (ring.r || 0) * 0.55, 2.3, 4.8),
      strength: clamp((ring.life / (ring.max || 0.42)) * 0.46, 0, 0.46),
      color: ring.color || '255,185,105', floor: floorIdAt(ring.y), type: 'explosion',
    });
  }
  return sources;
}

// Returns an approximate physical illumination in [0, 1] for NPC perception and debug tooling.
// Walls block light. NVG affects only the wearer/render pass and deliberately does not help NPCs.
export function lightLevelAt(x, y, rects = [], state = lightingState, { forAI = true } = {}) {
  if (state.scene !== 'raid') return state.scene === 'desert' || state.scene === 'tropic' ? 0.9 : 0.72;
  const floor = floorIdAt(y);
  let level = state.powerOn ? 0.20 : 0.055;
  for (const r of rects) {
    if (r.type !== 'lamp' || !state.powerOn || r.hp <= 0) continue;
    if ((r.raidFloorId ?? floorIdAt(r.y)) !== floor) continue;
    const dx = x - r.x, dy = y - r.y;
    const dist = Math.hypot(dx, dy);
    const radius = 5.2;
    if (dist >= radius || lightBlocked(r.x, r.y - 0.2, x, y, rects)) continue;
    level = Math.max(level, 0.20 + 0.78 * Math.pow(1 - dist / radius, 0.72));
  }
  if (!state.powerOn) {
    for (const light of ambientFloorLights()) {
      if (light.floor !== floor) continue;
      const dist = Math.hypot(x - light.x, y - light.y);
      if (dist < light.radius && !lightBlocked(light.x, light.y, x, y, rects)) {
        level = Math.max(level, 0.12 + light.strength * (1 - dist / light.radius));
      }
    }
  }
  if (state.flashlightOn && state.flashlightBattery > 0) {
    const dx = x - state.flashlightX, dy = y - state.flashlightY;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const delta = Math.atan2(Math.sin(angle - state.flashlightAngle), Math.cos(angle - state.flashlightAngle));
    if (dist < 6.2 && Math.abs(delta) < 0.46 && !lightBlocked(state.flashlightX, state.flashlightY, x, y, rects)) {
      level = Math.max(level, 0.18 + 0.82 * (1 - dist / 6.2));
    }
  }
  return clamp(level, 0.025, 1);
}

function ensureMask(W, H) {
  if (!maskCanvas) {
    maskCanvas = document.createElement('canvas');
    maskCtx = maskCanvas.getContext('2d');
  }
  if (!maskCtx) return null;
  if (maskCanvas.width !== W || maskCanvas.height !== H) {
    maskCanvas.width = W;
    maskCanvas.height = H;
  }
  return maskCtx;
}

function worldBlockers(source, rects, floorScoped = false) {
  const reach = source.radius + 1.2;
  return rects.filter((r) => blocksLight(r)
    && (!floorScoped || rectIntersectsRaidFloor(r, source.floor))
    && Math.hypot(r.x - source.x, r.y - source.y) < reach + Math.hypot(r.w, r.h) * 0.5);
}

function clipToRaidFloor(ctx, source, w2s, W, H) {
  if (!Number.isInteger(source.floor)) return false;
  const band = raidFloorBand(source.floor);
  const [, y0] = w2s(0, band.minY);
  const [, y1] = w2s(0, band.maxY);
  if (![y0, y1].every(Number.isFinite)) return false;
  const top = Math.max(0, Math.min(y0, y1));
  const bottom = Math.min(H, Math.max(y0, y1));
  if (bottom <= top) return false;
  ctx.beginPath();
  ctx.rect(0, top, W, bottom - top);
  ctx.clip();
  return true;
}

function clipLightPolygon(ctx, source, blockers, w2s, ppm, W, H) {
  const [cx, cy] = w2s(source.x, source.y);
  const angles = source.cone ? 30 : 38;
  const points = [];
  const start = source.cone ? source.angle - source.cone : 0;
  const span = source.cone ? source.cone * 2 : Math.PI * 2;
  for (let i = 0; i <= angles; i++) {
    const a = start + span * i / angles;
    const dx = Math.cos(a), dy = Math.sin(a);
    let distance = source.radius;
    for (const r of blockers) {
      const hit = rayAABB(source.x, source.y, dx, dy, r);
      if (hit > 0.025 && hit < distance) distance = hit;
    }
    points.push(w2s(source.x + dx * distance, source.y + dy * distance));
  }
  ctx.beginPath();
  if (source.cone) ctx.moveTo(cx, cy);
  else ctx.moveTo(points[0][0], points[0][1]);
  for (const p of points) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.clip();
  const radius = source.radius * ppm;
  return { cx, cy, radius, points };
}

function paintSource(ctx, source, rects, w2s, ppm, W, H, mode, floorScoped = false) {
  const [cx, cy] = w2s(source.x, source.y);
  const radius = source.radius * ppm;
  if (radius < 2 || cx < -radius || cy < -radius || cx > W + radius || cy > H + radius) return;
  ctx.save();
  if (floorScoped && !clipToRaidFloor(ctx, source, w2s, W, H)) { ctx.restore(); return; }
  const blockers = worldBlockers(source, rects, floorScoped);
  clipLightPolygon(ctx, source, blockers, w2s, ppm, W, H);
  if (mode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
    const gradient = ctx.createRadialGradient(cx, cy, Math.max(1, radius * 0.03), cx, cy, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${0.93 * source.strength})`);
    gradient.addColorStop(0.46, `rgba(255,255,255,${0.80 * source.strength})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.globalCompositeOperation = 'screen';
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(${source.color},${0.16 * source.strength})`);
    gradient.addColorStop(0.3, `rgba(${source.color},${0.09 * source.strength})`);
    gradient.addColorStop(1, `rgba(${source.color},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    // Tiny bloom at the fitting makes the lamp read as an actual luminous object.
    if (source.type === 'lamp' || source.type === 'emergency') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.42 * source.strength;
      ctx.fillStyle = source.type === 'emergency' ? '#ff5343' : '#ffd29a';
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, ppm * 0.085), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

export function drawLighting(ctx, { state = lightingState, rects = [], w2s, ppm, W, H, time = 0, flash, rings = [] } = {}) {
  if (!w2s || !Number.isFinite(ppm) || ppm <= 0) return;
  const raid = state.scene === 'raid';
  const sources = collectSources(state, rects, time, flash, rings);
  // Outdoor scenes keep their current ambient grade; lights from weapons/explosions still bloom.
  if (!raid) {
    if (state.nightVision) {
      ctx.save(); ctx.fillStyle = 'rgba(91,143,77,0.10)'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    for (const source of sources) {
      if (source.type === 'lamp' || source.type === 'emergency') continue;
      paintSource(ctx, source, rects, w2s, ppm, W, H, 'glow');
    }
    return;
  }
  const mctx = ensureMask(W, H);
  if (!mctx) return;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, W, H);
  const darkness = state.nightVision ? 0.13 : state.powerOn ? 0.30 : 0.82;
  mctx.fillStyle = `rgba(2,6,11,${darkness})`;
  mctx.fillRect(0, 0, W, H);
  for (const source of sources) paintSource(mctx, source, rects, w2s, ppm, W, H, 'erase', true);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(maskCanvas, 0, 0, W, H);
  if (state.nightVision) {
    ctx.fillStyle = 'rgba(91,143,77,0.18)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  for (const source of sources) {
    // Night vision should read as a single clean image, not green plus every lamp/flashlight bloom.
    if (state.nightVision && ['lamp', 'emergency', 'flashlight'].includes(source.type)) continue;
    paintSource(ctx, source, rects, w2s, ppm, W, H, 'glow', true);
  }
}
