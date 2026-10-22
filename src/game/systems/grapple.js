// Grappling hook: latch onto the first solid world surface along the cursor ray,
// then reel the active-ragdoll torso toward the anchor using physical force.
import { Vec2 } from 'planck';

export const GRAPPLE_MAX_RANGE = 16;
export const GRAPPLE_REEL_SPEED = 4.8;
export const GRAPPLE_MAX_ACCEL = 42;

const HOOKABLE = new Set([
  'ground', 'plat', 'stair', 'concrete', 'wall', 'door',
  'steel', 'crate', 'cover', 'sandbag', 'timber',
  'container', 'container-red',
]);

function rayAABB(x, y, dx, dy, rect) {
  let tMin = 0, tMax = Infinity;
  for (const [o, d, c, half] of [
    [x, dx, rect.x, rect.w / 2],
    [y, dy, rect.y, rect.h / 2],
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

export function findGrappleAnchor(origin, target, rects = [], maxRange = GRAPPLE_MAX_RANGE) {
  if (![origin?.x, origin?.y, target?.x, target?.y].every(Number.isFinite)) return null;
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const aimDistance = Math.hypot(dx, dy);
  if (aimDistance < 0.75) return null;
  const range = Math.min(GRAPPLE_MAX_RANGE, Math.max(0, maxRange), aimDistance);
  if (range < 0.75) return null;
  const ux = dx / aimDistance, uy = dy / aimDistance;
  let nearest = null;
  for (const rect of rects) {
    if (!rect || !HOOKABLE.has(rect.type)) continue;
    if (rect.type === 'door' && (rect.doorOpen || (rect.doorAngle || 0) > 0.10)) continue;
    const distance = rayAABB(origin.x, origin.y, ux, uy, rect);
    if (!Number.isFinite(distance) || distance < 0.28 || distance > range) continue;
    if (!nearest || distance < nearest.distance) {
      nearest = {
        x: origin.x + ux * Math.max(0.2, distance - 0.055),
        y: origin.y + uy * Math.max(0.2, distance - 0.055),
        distance,
        rect,
      };
    }
  }
  return nearest;
}

export function createGrappleState() {
  return { active: false, anchor: null, ropeLength: 0, age: 0, cooldown: 0, lastMiss: false };
}

export function releaseGrapple(state, cooldown = 0.18) {
  if (!state) return;
  state.active = false;
  state.anchor = null;
  state.ropeLength = 0;
  state.age = 0;
  state.cooldown = Math.max(state.cooldown || 0, cooldown);
}

export function fireGrapple(state, { player, target, rects = [] } = {}) {
  if (!state || !player?.torso || player.ragdoll) return false;
  if (state.active) {
    releaseGrapple(state, 0.12);
    return false; // Ctrl-click while attached is a deliberate release.
  }
  if ((state.cooldown || 0) > 0) return false;
  const p = player.torso.getPosition();
  const anchor = findGrappleAnchor(p, target, rects);
  if (!anchor) {
    state.lastMiss = true;
    state.cooldown = 0.12;
    return false;
  }
  state.active = true;
  state.anchor = { x: anchor.x, y: anchor.y };
  state.ropeLength = Math.max(0.8, Math.hypot(anchor.x - p.x, anchor.y - p.y));
  state.age = 0;
  state.lastMiss = false;
  return true;
}

export function stepGrapple(state, dt, player) {
  if (!state) return;
  const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
  state.cooldown = Math.max(0, (state.cooldown || 0) - step);
  if (!state.active) return;
  if (!player?.torso || player.ragdoll || !state.anchor) {
    releaseGrapple(state, 0.3);
    return;
  }
  state.age += step;
  if (state.age > 3.0) {
    releaseGrapple(state, 0.24);
    return;
  }
  const p = player.torso.getPosition();
  const dx = state.anchor.x - p.x, dy = state.anchor.y - p.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.78) {
    releaseGrapple(state, 0.28);
    return;
  }
  const ux = dx / distance, uy = dy / distance;
  state.ropeLength = Math.max(0.72, state.ropeLength - GRAPPLE_REEL_SPEED * step);
  const stretch = distance - state.ropeLength;
  if (stretch <= 0) return;
  const v = player.torso.getLinearVelocity();
  const radialSpeed = v.x * ux + v.y * uy;
  const desiredSpeed = Math.min(10.2, Math.max(2.0, (distance - 0.45) * 1.6));
  const accel = Math.max(0, Math.min(GRAPPLE_MAX_ACCEL, (desiredSpeed - radialSpeed) * 6.5 + stretch * 10));
  if (accel <= 0) return;
  const mass = Math.max(0.1, player.torso.getMass());
  player.torso.applyForceToCenter(Vec2(ux * mass * accel, uy * mass * accel), true);
}

export function drawGrapple(ctx, state, player, w2s, ppm) {
  if (!state?.active || !state.anchor || !player?.torso) return;
  const p = player.torso.getPosition();
  const from = w2s(p.x, p.y + 0.18);
  const to = w2s(state.anchor.x, state.anchor.y);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(10,20,30,0.88)';
  ctx.lineWidth = Math.max(3, ppm * 0.07);
  ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,177,74,0.92)';
  ctx.lineWidth = Math.max(1.2, ppm * 0.024);
  ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();
  ctx.fillStyle = '#ffd39a';
  ctx.strokeStyle = '#16232e';
  ctx.lineWidth = Math.max(1, ppm * 0.025);
  ctx.beginPath(); ctx.arc(to[0], to[1], Math.max(3, ppm * 0.085), 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
