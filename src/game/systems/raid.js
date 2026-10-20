// 剿匪行动：局部警戒、视野/听力、消音器声源、无线电增援与楼层清剿。
// 本模块不创建物理实体；所有增援仍由 game.js 装配，避免 systems 反向依赖装配根。
import { hasLOS } from './combat.js';

export const RAID_FLOORS = [
  { id: 0, name: '一层 / GROUND', top: 0 },
  { id: 1, name: '二层 / LEVEL 02', top: 3.5 },
  { id: 2, name: '三层 / LEVEL 03', top: 7 },
  { id: 3, name: '屋顶 / ROOFTOP', top: 10.5 },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let noiseSeq = 0;
let incidentSeq = 0;

// Player/Dummy 的躯干中心比脚底高约 0.9m。
export function floorForY(y) {
  const feetY = y - 0.9;
  let best = RAID_FLOORS[0], delta = Infinity;
  for (const floor of RAID_FLOORS) {
    const d = Math.abs(feetY - floor.top);
    if (d < delta) { best = floor; delta = d; }
  }
  return best.id;
}
export function floorLabel(id) { return RAID_FLOORS.find((f) => f.id === id)?.name || '一层 / GROUND'; }

export function createRaidState(enabled = false) {
  return {
    enabled,
    floorId: 3,
    noises: [],
    incidents: [],
    activeIncident: null,
    awareness: 0,
    message: enabled ? '屋顶插入待命' : '',
    messageT: enabled ? 3.2 : 0,
    clearedFloors: Object.create(null),
    nextDispatchT: 0,
    rappelDone: false,
  };
}

export function resetRaidState(state, enabled) {
  state.enabled = !!enabled;
  state.floorId = 3;
  state.noises.length = 0;
  state.incidents.length = 0;
  state.activeIncident = null;
  state.awareness = 0;
  state.message = enabled ? '屋顶插入待命' : '';
  state.messageT = enabled ? 3.2 : 0;
  state.clearedFloors = Object.create(null);
  state.nextDispatchT = 0;
  state.rappelDone = false;
}

export function emitRaidNoise(state, event = {}) {
  if (!state?.enabled || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return null;
  const radius = Math.max(0.5, Number(event.radius) || 0.5);
  const noise = {
    id: ++noiseSeq,
    x: event.x, y: event.y,
    floorId: Number.isInteger(event.floorId) ? event.floorId : floorForY(event.y),
    radius,
    intensity: clamp(Number(event.intensity) || 0.3, 0.05, 1.4),
    kind: event.kind || 'movement',
    faction: event.faction || 'player',
    age: 0,
    life: Math.max(0.16, Math.min(0.9, Number(event.life) || 0.42)),
  };
  state.noises.push(noise);
  // 音效是脉冲，不积攒长历史；高射速也有硬上限。
  if (state.noises.length > 36) state.noises.splice(0, state.noises.length - 36);
  return noise.id;
}

export function raidShotProfile(weaponName = '', suppressed = false, weapon = 'rifle') {
  const n = String(weaponName).toLowerCase();
  const pistol = weapon === 'pistol' || n.includes('手枪') || n.includes('pistol');
  const sniper = /awp|狙击|sniper/.test(n);
  const smg = /mp5|smg|冲锋/.test(n);
  const shotgun = /霰弹|shotgun/.test(n);
  if (suppressed) return { radius: sniper ? 5.5 : smg ? 4.8 : 5.2, intensity: 0.58 };
  if (sniper) return { radius: 42, intensity: 1.25 };
  if (shotgun) return { radius: 30, intensity: 1.2 };
  if (smg) return { radius: 22, intensity: 0.9 };
  if (pistol) return { radius: 15, intensity: 0.72 };
  return { radius: 27, intensity: 1 };
}

function announce(state, message, duration = 2.4) {
  state.message = message;
  state.messageT = Math.max(state.messageT || 0, duration);
}

function incidentForCaller(state, caller) {
  const floorId = Number.isInteger(caller.raidFloorId) ? caller.raidFloorId : floorForY(caller.y);
  return state.incidents.find((incident) => incident.floorId === floorId && Math.hypot(caller.x - incident.x, caller.y - incident.y) <= incident.radius * 1.15);
}

function enrollLocalGuards(incident, enemies, caller) {
  for (const e of enemies) {
    if (!e?.raidMode || !e.alive || e.destroyed || e.airUnit) continue;
    const floorId = Number.isInteger(e.raidFloorId) ? e.raidFloorId : floorForY(e.y);
    if (floorId !== incident.floorId) continue;
    if (Math.hypot(e.x - incident.x, (e.y - incident.y) * 0.65) > incident.radius) continue;
    e.alarmZoneId = incident.id;
    e.alertTo();
    e.suspicion = 1;
    e.suspicious = false;
    e.lastKnown = { x: caller.x, y: caller.y };
    e.searchT = 4;
    e.supportCalled = true; // 同一片区域不会每名守军都再呼叫一轮增援。
    e.supportCallT = -1;
  }
}

// 无线电呼叫创建局部警戒事件；只有事件半径内、同楼层的守军加入战斗。
// 其他楼层/远处守军不会被全图 alertEnemiesNear 连锁拉起。
export function beginRaidIncident(state, caller, enemies) {
  if (!state?.enabled || !caller?.alive) return null;
  let incident = incidentForCaller(state, caller);
  if (incident) {
    caller.alarmZoneId = incident.id;
    caller.supportCalled = true;
    enrollLocalGuards(incident, enemies, caller);
    state.activeIncident = incident;
    return null;
  }
  const floorId = Number.isInteger(caller.raidFloorId) ? caller.raidFloorId : floorForY(caller.y);
  const roll = Math.random();
  const response = roll < 0.36 ? 'infantry' : roll < 0.65 ? 'helicopter' : 'combined';
  incident = {
    id: `raid-${++incidentSeq}`,
    x: caller.x, y: caller.y, floorId, radius: 17,
    response, age: 0, created: true,
  };
  state.incidents.push(incident);
  state.activeIncident = incident;
  caller.alarmZoneId = incident.id;
  caller.supportCalled = true;
  enrollLocalGuards(incident, enemies, caller);
  announce(state, response === 'infantry' ? '无线电增援：武装小队正在靠近'
    : response === 'helicopter' ? '无线电增援：空中威胁已响应'
      : '无线电增援：地面小队与直升机已响应', 3.4);
  return { ...incident };
}

function hearingFloorScale(sourceFloor, guardFloor) {
  const delta = Math.abs(sourceFloor - guardFloor);
  return delta === 0 ? 1 : delta === 1 ? 0.38 : 0.12;
}

function isFloorLit(rects, floorId, x) {
  return rects.some((r) => r.type === 'lamp' && r.raidFloorId === floorId && Math.abs(r.x - x) < 8.5);
}

export function updateRaid(dt, opts = {}) {
  const { state, player, enemies, playerAlive, rects = [] } = opts;
  if (!state?.enabled || !player || !enemies) return state;
  state.messageT = Math.max(0, state.messageT - dt);
  state.nextDispatchT = Math.max(0, state.nextDispatchT - dt);
  // 菜单/死亡期间暂停感知，但声音脉冲仍按时间过期，避免重新部署时消费旧枪声。
  for (const n of state.noises) n.age += dt;
  state.noises = state.noises.filter((n) => n.age < n.life);
  if (!playerAlive) return state; // 菜单/死亡期间暂停潜行感知与无线电计时。

  const pp = player.torso.getPosition();
  state.floorId = floorForY(pp.y);
  let maxAwareness = 0;

  for (const e of enemies) {
    if (!e?.raidMode || !e.alive || e.destroyed || e.airUnit) continue;
    const ep = e.p?.torso?.getPosition?.() || { x: e.x, y: e.y };
    const floorId = Number.isInteger(e.raidFloorId) ? e.raidFloorId : floorForY(ep.y);
    const sameFloor = floorId === state.floorId;

    // 声音以一次性脉冲被每名守军消费；跨楼层明显衰减，不会整栋楼瞬间集体开火。
    for (const n of state.noises) {
      if (n.id <= (e.raidNoiseSeen || 0)) continue;
      e.raidNoiseSeen = n.id;
      if (e.alert && e.alarmZoneId && state.incidents.some((it) => it.id === e.alarmZoneId)) continue;
      const scale = hearingFloorScale(n.floorId, floorId);
      const dist = Math.hypot(ep.x - n.x, (ep.y - n.y) * 0.72);
      const radius = n.radius * scale;
      if (dist > radius) continue;
      // 同一房间声音清楚；隔墙会衰减，不会把整栋建筑当成完全开放的走廊。
      const soundClear = hasLOS(ep.x, ep.y + 0.32, n.x, n.y + 0.18);
      const occlusion = soundClear ? 1 : 0.36;
      const factionScale = n.faction === 'enemy'
        ? (n.kind === 'radio' ? 0.10 : 0.24)
        : 1;
      const power = n.intensity * (1 - dist / radius) * scale * occlusion * factionScale;
      const loudPlayerShot = n.faction !== 'enemy' && n.kind === 'gunshot' && n.intensity >= 0.9;
      // 大声枪响在近距离能够直接暴露位置；消音枪只积累较慢的怀疑值。
      const gain = power * (loudPlayerShot ? 1.15 : n.kind === 'gunshot' ? 0.52 : 0.42);
      e.suspicion = clamp((e.suspicion || 0) + gain, 0, 1);
      e.lastKnown = { x: n.x, y: n.y };
      e.searchT = Math.max(e.searchT || 0, 2.7 + power * 1.6);
      if (loudPlayerShot && power > 0.56) e.suspicion = Math.max(e.suspicion, 1);
      if (e.suspicion >= 0.28 && !e.alert) e.suspicious = true;
    }

    // 视野只发生在同楼层；真实地形/门会遮挡 LOS。下蹲、熄灯与距离共同影响发现速度。
    if (!e.alert && sameFloor) {
      const dx = pp.x - ep.x, dy = pp.y - ep.y;
      const dist = Math.hypot(dx, dy);
      const baseRange = e.sightRange || 10.5;
      const lit = isFloorLit(rects, floorId, pp.x);
      const range = baseRange * (lit ? 1 : 0.72) * (player.crouch ? 0.62 : 1);
      const facing = e.face || -1;
      const inCone = dx * facing >= -dist * 0.18 && Math.abs(dy) < Math.max(1.25, dist * 0.55);
      const clear = dist < 1.45 || (dist <= range && inCone && hasLOS(ep.x, ep.y + 0.48, pp.x, pp.y + 0.32));
      if (clear && dist <= range) {
        const nearFactor = 0.24 + (1 - dist / range) * 0.86;
        const crouchMul = player.crouch ? 0.42 : 1;
        e.suspicion = clamp((e.suspicion || 0) + dt * nearFactor * crouchMul, 0, 1);
        e.lastKnown = { x: pp.x, y: pp.y };
        e.searchT = Math.max(e.searchT || 0, 1.6);
        if (e.suspicion > 0.22) e.suspicious = true;
      }
    }

    // 看见尸体的守军会先怀疑；近距离停留则发现尸体并升级警戒。
    if (!e.alert) {
      for (const corpse of enemies) {
        if (!corpse || corpse === e || corpse.alive || corpse.destroyed || corpse.airUnit || !corpse.raidMode) continue;
        const cf = Number.isInteger(corpse.raidFloorId) ? corpse.raidFloorId : floorForY(corpse.y);
        if (cf !== floorId) continue;
        const dx = corpse.x - ep.x, dy = corpse.y - ep.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 4.2 || dx * (e.face || -1) < -dist * 0.25) continue;
        if (hasLOS(ep.x, ep.y + 0.45, corpse.x, corpse.y + 0.25)) {
          e.suspicion = clamp((e.suspicion || 0) + dt * (dist < 1.8 ? 0.8 : 0.2), 0, 1);
          e.lastKnown = { x: corpse.x, y: corpse.y };
          e.searchT = Math.max(e.searchT || 0, 2.5);
          if (e.suspicion > 0.22) e.suspicious = true;
        }
      }
    }

    if (!e.alert) {
      if ((e.suspicion || 0) >= 1) {
        e.alertTo();
        e.lastKnown = { x: pp.x, y: pp.y };
        e.supportCallT = 1.25;
        e.supportCalled = false;
        announce(state, '目标暴露 · 守军正在呼叫增援', 2.4);
      } else if (e.suspicious) {
        e.searchT = Math.max(0, (e.searchT || 0) - dt);
        if (e.searchT <= 0) {
          e.suspicion = Math.max(0, e.suspicion - dt * 0.10);
          if (e.suspicion < 0.12) e.suspicious = false;
        }
      } else {
        e.suspicion = Math.max(0, (e.suspicion || 0) - dt * 0.025);
      }
    }

    if (e.alert && !e.supportCalled) {
      if (!Number.isFinite(e.supportCallT) || e.supportCallT < 0) e.supportCallT = 1.25;
      e.supportCallT -= dt;
      if (e.supportCallT <= 0) {
        e.supportCalled = true;
        e.events.push({ type: 'callSupport', x: ep.x, y: ep.y, raidFloorId: floorId });
        emitRaidNoise(state, { x: ep.x, y: ep.y, floorId, radius: 10.5, intensity: 0.9, kind: 'radio', faction: 'enemy', life: 0.35 });
      }
    }
    maxAwareness = Math.max(maxAwareness, e.alert ? 1 : (e.suspicion || 0));
  }

  state.awareness = maxAwareness;

  // 每个事件区域独立清算；不在其 alarmZoneId 里的远处守军保持原有状态。
  for (let i = state.incidents.length - 1; i >= 0; i--) {
    const incident = state.incidents[i];
    incident.age += dt;
    const anyAlive = enemies.some((e) => e.alarmZoneId === incident.id && e.alive && !e.destroyed);
    if (!anyAlive) {
      state.incidents.splice(i, 1);
      announce(state, '警戒区已清空 · 前方守军尚未惊动', 3.6);
      for (const e of enemies) {
        if (e.alarmZoneId === incident.id) {
          e.alarmZoneId = null;
          e.supportCalled = false;
          e.supportCallT = -1;
        }
      }
    }
  }
  state.activeIncident = state.incidents.length ? state.incidents[state.incidents.length - 1] : null;

  // 楼层清剿进度只统计原始守军，不将之后的随机支援误算成永无止境的驻军。
  for (const floor of RAID_FLOORS) {
    if (state.clearedFloors[floor.id]) continue;
    const floorGuards = enemies.filter((e) => e.raidMode && !e.isReinforcement && !e.airUnit && e.raidFloorId === floor.id);
    if (floorGuards.length && floorGuards.every((e) => !e.alive || e.destroyed)) {
      state.clearedFloors[floor.id] = true;
      announce(state, `${floor.name} · 楼层已清剿`, 2.8);
    }
  }
  return state;
}
