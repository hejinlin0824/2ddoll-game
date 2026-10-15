// 战斗系统:弹丸生命周期(曲线变速/碰撞/部位倍率/护甲吸收/击杀结算)+ 狙击 hitscan + 视线传唤。
// stepBullets(dt, C) 由 game.js 的 step 每个物理步驱动;C = 依赖包(装配根组装一次)。
import { LEVEL, ensureRectHp, destroyRect } from '../world/level.js';
import { invEquipped, invSave, invIsFull, invInsertItem, invAddDrop } from '../domain/inventory.js';
import { burst, debris, floaters, spawnHelmetDebris, spawnVestDebris, gibBurst, setGhost } from './fx.js';
import { feel, addTrauma, hitStop, killSlow, addStreak, resetStreak } from './feel.js';
import { beep } from './audio.js';
import { lootToast } from './hud.js';

export const bullets = [];

// st = 武器词条;faction = 'player' | 'enemy'
export function spawnBullet(x, y, dx, dy, st, damage, faction = 'player') {
  const maxSp = st.muzzleVel;
  const life = (st.range * 1.7) / maxSp; // 曲线变速下飞行 ~0.9 倍射程
  bullets.push({
    x, y, px: x, py: y, vx: dx * maxSp * 0.3, vy: dy * maxSp * 0.3,
    age: 0, rampT: life * 0.42,
    life,
    rifle: st.damage >= 18,            // 曳光粗细
    maxSp, damage, faction,
    armorMul: st.armorDmgMul ?? 1,     // 破甲词条:对护甲耐久的伤害倍率(出厂定格,命中端用)
  });
}

function hitTerrainRect(x, y) {
  for (const r of LEVEL.rects) {
    if (Math.abs(x - r.x) < r.w / 2 && Math.abs(y - r.y) < r.h / 2) return r;
  }
  return null;
}
window.__hitTest = (x, y) => { const r = hitTerrainRect(x, y); return r ? { x: r.x, y: r.y, hp: r.hp ?? null, destructible: !!r.destructible } : null; };
// 子弹破坏地形(tile):命中 tile 扣血,归零碎裂(从世界移除+碎片飞溅);
// 溢出伤害沿弹道继续啃穿相邻 tile —— 打出真实的弹坑,而不是整块消失。不可破坏块只冒尘。
function damageTerrain(r, damage, x, y, dir, depth = 0) {
  if (!r.destructible) { burst(x, y, 2, '#8a7c66', 2); return; }
  ensureRectHp(r);
  r.hp -= damage;
  if (r.hp <= 0) {
    // 碎裂:碎块飞溅 + 尘土 + 小震
    const n = Math.min(8, Math.round(r.w * r.h * 6) + 3);
    for (let i = 0; i < n; i++) {
      debris.push({
        type: 'shard', color: i % 3 ? '#5b4a33' : '#7a6446',
        w: 2 + Math.random() * 4, h: 2 + Math.random() * 4,
        x: x + (Math.random() - 0.5) * r.w, y: y + (Math.random() - 0.5) * r.h,
        vx: (Math.random() - 0.5) * 6 + (dir?.x || 0) * 2, vy: 1.5 + Math.random() * 4,
        va: (Math.random() - 0.5) * 16, angle: Math.random() * 3, life: 1.4, max: 1.4,
      });
    }
    burst(x, y, 5, '#8a7c66', 3);
    addTrauma(0.08);
    beep(140, 60, 0.12, 'sawtooth', 0.06);
    destroyRect(r);
    // 溢出伤害沿弹道啃相邻 tile(打穿薄墙的感觉)
    const overflow = -r.hp;
    if (overflow >= 6 && depth < 3 && dir) {
      const nx = x + dir.x * 0.4, ny = y + dir.y * 0.4;
      const next = LEVEL.rects.find((t) => t !== r && t.destructible &&
        Math.abs(nx - t.x) <= t.w / 2 + 0.05 && Math.abs(ny - t.y) <= t.h / 2 + 0.05);
      if (next) damageTerrain(next, overflow, nx, ny, dir, depth + 1);
    }
  } else {
    burst(x, y, 3, '#6b5a40', 2.5); // 打在块上的碎屑
  }
}

// 射线 vs 轴对齐盒(slab 法),返回最近入射距离,不相交返回 Infinity
export function rayAABB(x, y, dx, dy, r) {
  let tmin = 0, tmax = Infinity;
  const axes = [[x, dx, r.x, r.w / 2], [y, dy, r.y, r.h / 2]];
  for (const [o, d, c, h] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o - c) > h) return Infinity;
    } else {
      let t1 = (c - h - o) / d, t2 = (c + h - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// 狙击 hitscan:射线终点 = 地形
export function castRay(x, y, dx, dy, range) {
  let best = range;
  for (const r of LEVEL.rects) {
    const t = rayAABB(x, y, dx, dy, r);
    if (t < best) best = t;
  }
  return Math.max(0, best);
}

// 惊动范围内的敌人(枪声/惨叫传唤):打远处的兵,他一队的都会动起来
export function alertEnemiesNear(enemies, pos, r) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.x - pos.x, e.y - pos.y) < r) e.alertTo();
  }
}

// 命中反馈(弹丸与狙击 hitscan 共用一条管线):
// 材质分化特效 + 受击飘字 + 碎甲飞 debris + 吸血结算。dmg = 已乘部位倍率的最终伤害
function hitFeedback(C, e, zone, res, x, y, dir, dmg) {
  const player = C.player, pstate = C.pstate;
  // 命中分化:甲上火花+金属叮(闷),肉上血雾(脆)—— 反馈通道按材质分层
  if (res.absorbed) {
    burst(x, y, 5, '#ffe9a8', 3.6);
    C.particles.push({ x, y, vx: -dir.x * 2 + (Math.random() - 0.5), vy: 1 + Math.random() * 2, life: 0.3, size: 2, color: '#fff6d8', grav: 0.5 });
    beep(1500, 950, 0.05, 'square', 0.04);
  } else {
    burst(x, y, 4, zone === 'head' ? '#ffd77a' : '#c9563c', 3);
    for (let bi = 0; bi < 2; bi++) {
      C.particles.push({ x, y, vx: dir.x * (1.5 + Math.random() * 2), vy: dir.y * 2 + Math.random(), life: 0.32, size: 2.2, color: '#a83a28', grav: 1 });
    }
  }
  // 受击数字:护甲灰 / 普通红 / 爆头金粗
  const shown = Math.round(dmg * 10) / 10;
  if (res.absorbed) floaters.push({ x: x + (Math.random() - 0.5) * 0.12, y, vy: 2 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 1.4, rot: (Math.random() - 0.5) * 0.3, age: 0, text: String(shown), color: '#dfe6f2', size: 17, bold: false, life: 0.66, max: 0.66 });
  else floaters.push({ x: x + (Math.random() - 0.5) * 0.15, y, vy: (zone === 'head' ? 3.1 : 2.4) + Math.random() * 0.9, vx: (Math.random() - 0.5) * 1.8, rot: (Math.random() - 0.5) * 0.3, age: 0, text: (zone === 'head' ? '爆头 ' : '') + String(shown), color: zone === 'head' ? '#ffc21c' : '#ff5b4a', size: zone === 'head' ? 30 : 21, bold: true, life: zone === 'head' ? 0.9 : 0.78, max: zone === 'head' ? 0.9 : 0.78 });
  if (res.broke === 'head') {
    spawnHelmetDebris(e.x, e.y - 0.4, e.armor.head.quality); // 头盔被击飞
    beep(520, 170, 0.16, 'square', 0.08);
  }
  if (res.broke === 'body') {
    spawnVestDebris(e.x, e.y, e.armor.body.quality); // 背心碎裂
    beep(320, 120, 0.2, 'square', 0.08);
  }
  // 吸血词条:按造成伤害回血(护甲吸收的部分减半)
  const lsPct = player.lifestealPct || 0;
  if (lsPct > 0) pstate.hp = Math.min(pstate.maxHp, pstate.hp + dmg * (res.absorbed ? 0.5 : 1) * (lsPct / 100));
}

// 狙击沿途伤害:第一个命中的敌人全额,之后按词条 falloff 逐个衰减。
// 与弹丸同一条管线:部位倍率/护甲吸收(吃破甲词条)/击退踉跄/受击反馈全都有
// (此前直呼 hurt() 把这些全绕过了 —— AWP 无视护甲、无爆头反馈)
export function applyHitscanDamage(C, ev, maxT) {
  const d = ev.parts[0];
  const hits = [];
  for (const e of C.enemies) {
    if (!e.alive) continue;
    const rx = e.x - ev.x, ry = e.y - ev.y;
    const t = rx * d.dx + ry * d.dy;                    // 沿线投影
    const off = Math.abs(-rx * d.dy + ry * d.dx);       // 到线距离
    if (t > 0 && t < Math.min(maxT, ev.stats.range) && off < (e.radius ?? 0.35)) {
      hits.push({ e, t });
    }
  }
  hits.sort((a, b) => a.t - b.t);
  let mult = 1;
  for (const h of hits) {
    const e = h.e;
    const hx = ev.x + d.dx * h.t, hy = ev.y + d.dy * h.t;
    const zone = e.zoneAt(hx, hy) || 'body';            // 射线在敌人身上的落点定部位
    const dir = { x: d.dx, y: d.dy };
    const zmul = zone === 'head' ? 2 : zone === 'body' ? 1 : 0.2; // 部位倍率与弹丸一致
    const dmg = ev.parts[0].damage * zmul * mult;
    const res = e.hit(zone, dmg, dir, ev.stats.armorDmgMul ?? 1) ?? { broke: null, absorbed: false };
    hitFeedback(C, e, zone, res, hx, hy, dir, dmg);
    mult *= ev.stats.falloff ?? 0.55;
  }
}

// 玩家受击部位判定(随躯干旋转到局部坐标:趴下/倾斜时判定跟着姿态走,和敌人 zoneAt 同款)
function playerZoneAt(player, px, py) {
  const h = player.head.getPosition();
  if (Math.hypot(px - h.x, py - h.y) <= 0.18) return 'head'; // 头是独立刚体,世界坐标圆判定天然随姿态
  const t = player.torso.getPosition();
  const a = player.torso.getAngle();
  const c = Math.cos(a), s = Math.sin(a);
  const wx = px - t.x, wy = py - t.y;
  const dx = c * wx + s * wy;
  const dy = -s * wx + c * wy;
  if (Math.abs(dx) <= 0.17 && Math.abs(dy) <= 0.29) return 'body';
  if (Math.abs(dx) <= 0.15 && dy <= -0.29 && dy >= -0.82) return 'legs';
  return null;
}

// 子弹主循环。C(依赖包):{ player, enemies, pstate, syncArmorFromInventory }
export function stepBullets(dt, C) {
  const player = C.player; const enemies = C.enemies; const pstate = C.pstate; // 每步重读(resetPlayer 换实例)
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.px = b.x; b.py = b.y;
    // 曲线变速:初速 30%,随飞行时间加速到满速 —— 越飞越快,越打越有劲儿
    b.age += dt;
    const f = Math.min(1, b.age / b.rampT);
    const targetSp = b.maxSp * (0.3 + 0.7 * f * Math.sqrt(f));
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0.001 && targetSp > sp) {
      const k = targetSp / sp;
      b.vx *= k; b.vy *= k;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    // ---- 命中判定(优先级:盾牌 > 尸体 > 部位 > 地形) ----
    let consumed = false;
    const midX = (b.px + b.x) / 2, midY = (b.py + b.y) / 2;
    // 盾牌阻挡:只有敌方子弹会被玩家盾牌挡
    if (b.faction !== 'player' && player.shield && player.shieldHp > 0) {
      const obb = player.shieldOBB();
      let blocked = false;
      for (const [qx, qy] of [[b.x, b.y], [midX, midY]]) {
        const rx = qx - obb.x, ry = qy - obb.y;
        const depth = rx * obb.gx + ry * obb.gy;
        const across = -rx * obb.gy + ry * obb.gx;
        if (Math.abs(depth) < obb.ht && Math.abs(across) < obb.hw) {
          burst(qx, qy, 6, '#bfd2e8', 3);
          beep(720, 290, 0.06, 'square', 0.05);
          player.damageShield(b.damage ?? 10);
          blocked = true;
          break;
        }
      }
      if (blocked) { bullets.splice(i, 1); continue; }
    }
    // 尸体阻挡:双方子弹都会被尸体拦下并推动尸体(直到自然消失)
    for (const e of enemies) {
      if (e.alive) continue;
      const dz = e.zoneAt(b.x, b.y) || e.zoneAt(midX, midY);
      if (dz) {
        e.corpseHit({ x: b.vx / (sp || 1), y: b.vy / (sp || 1) }, b.faction === 'player' ? 2.2 : 1.2);
        burst(b.x, b.y, 3, '#c9563c', 2.5);
        bullets.splice(i, 1); consumed = true; break;
      }
    }
    if (consumed) continue;
    if (b.faction === 'player') {
      // 玩家子弹 vs 敌人部位(手臂不判定,子弹穿过)
      for (const e of enemies) {
        const zone = e.zoneAt(b.x, b.y) || e.zoneAt(midX, midY);
        if (!zone) continue;
        const mult = zone === 'head' ? 2 : zone === 'body' ? 1 : 0.2;
        const bdir = { x: b.vx / (sp || 1), y: b.vy / (sp || 1) };
        const dmg = b.damage * mult;
        const res = e.hit(zone, dmg, bdir, b.armorMul ?? 1); // 破甲词条随弹丸生效
        hitFeedback(C, e, zone, res, b.x, b.y, bdir, dmg);   // 反馈与狙击共用一条管线
        bullets.splice(i, 1); consumed = true; break;
      }
    } else {
      // 敌方子弹 vs 玩家(有护甲先扣耐久,归零击飞/碎裂+白闪重影;无甲按部位倍率扣血)
      const zone = playerZoneAt(player, b.x, b.y) || playerZoneAt(player, midX, midY);
      if (zone) {
        const mult = zone === 'head' ? 2 : zone === 'body' ? 1 : 0.2;
        const dmg = b.damage * mult;
        const item = zone !== 'legs' ? invEquipped(zone) : null;
        if (item && item.dur > 0) {
          item.dur = Math.max(0, Math.round((item.dur - dmg) * 10) / 10);
          burst(b.x, b.y, 4, '#9fb0c4', 3);
          beep(720, 300, 0.06, 'square', 0.05);
          floaters.push({ x: b.x + (Math.random() - 0.5) * 0.12, y: b.y, vy: 2 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 1.4, rot: (Math.random() - 0.5) * 0.3, age: 0, text: String(Math.round(dmg * 10) / 10), color: '#dfe6f2', size: 15, bold: false, life: 0.62, max: 0.62 });
          if (item.dur === 0) { // 护甲碎裂:白闪+重影,装备进背包等修复
            item.equipped = false;
            invSave();
            C.syncArmorFromInventory();
            setGhost(0.18); // 一瞬发蒙:快闪即收,不常驻
            addTrauma(0.35);
            const pp = player.torso.getPosition();
            if (zone === 'head') spawnHelmetDebris(pp.x, pp.y + 0.35, item.quality);
            else spawnVestDebris(pp.x, pp.y, item.quality);
            beep(500, 170, 0.18, 'square', 0.08);
          }
          invSave();
        } else {
          // 敌方子弹:玩家防御(0~0.8)减免后扣血
          const pdmg = b.damage * mult * (1 - Math.min(0.8, player.defense));
          pstate.hp = Math.max(0, pstate.hp - pdmg);
          C.setHitFlash(0.3);
          addTrauma(0.18);
          floaters.push({ x: b.x + (Math.random() - 0.5) * 0.15, y: b.y, vy: 2.3 + Math.random() * 0.9, vx: (Math.random() - 0.5) * 1.6, rot: (Math.random() - 0.5) * 0.34, age: 0, text: String(Math.round(pdmg * 10) / 10), color: '#ff5b4a', size: 17, bold: false, life: 0.72, max: 0.72 });
          burst(b.x, b.y, 5, '#c9563c', 3.5);
          beep(180, 80, 0.12, 'sawtooth', 0.06);
          if (pstate.hp <= 0 && !player.ragdoll) {
            player.setRagdoll(true); // 倒地
            pstate.deadT = 2.5;
            resetStreak();
            addTrauma(0.5);
            beep(120, 40, 0.5, 'sawtooth', 0.1);
          }
        }
        bullets.splice(i, 1); consumed = true;
      }
    }
    if (consumed) continue;
    let rect = hitTerrainRect(b.x, b.y);
    if (!rect && sp > 14) rect = hitTerrainRect((b.px + b.x) / 2, (b.py + b.y) / 2);
    if (rect) {
      const hx = (b.px + b.x) / 2, hy = (b.py + b.y) / 2;
      burst(hx, hy, 5, '#ffd77a', 3.5);
      // 弹孔 + 扬尘:打进地形留下痕迹(FIFO 上限)
      C.addDecal('hole', hx, hy, Math.atan2(b.vy, b.vx), 0.05 + Math.random() * 0.03);
      for (let di = 0; di < 3; di++) {
        C.particles.push({ x: hx, y: hy, vx: (Math.random() - 0.5) * 3 - b.vx * 0.05, vy: 1 + Math.random() * 2.5, life: 0.4 + Math.random() * 0.25, size: 2 + Math.random() * 2, color: '#8a7c66', grav: 0.9 });
      }
      damageTerrain(rect, b.damage, hx, hy, { x: b.vx / (sp || 1), y: b.vy / (sp || 1) }); // 打哪碎哪 + 溢出啃穿
      bullets.splice(i, 1);
      continue;
    }
    if (b.life <= 0) bullets.splice(i, 1);
  }
}

// 击杀结算(died 事件):手感四件套 + 掉落 + 连杀 —— 由 game.js 的 events 循环调用
export function onEnemyDied(C, ev) {
  const player = C.player; const enemies = C.enemies; const pickups = C.pickups;
  const head = ev.zone === 'head';
  hitStop(head ? 0.085 : 0.055);
  addTrauma(head ? 0.24 : 0.15);
  gibBurst(ev.x, ev.y, ev.dir || { x: 1, y: 0.3 });
  beep(220, 60, 0.3, 'sawtooth', 0.08);
  alertEnemiesNear(enemies, ev, 11); // 死者的惨叫惊动 11m 内的队友
  const streak = addStreak();
  if (streak % 5 === 0) killSlow(0.8); // 慢放只跟每 5 连杀走(用户指定,清场/爆头不再触发)
  // 掉落:金币 3~8(贪婪/掠夺加成)+ 装备(猎手/幸运加成)
  const coinN = Math.round(ev.coins * (1 + (player.coinGainPct || 0) / 100));
  for (let ci = 0; ci < coinN; ci++) {
    pickups.push({ type: 'coin', x: ev.x, y: ev.y - 0.3, vx: (Math.random() - 0.5) * 11, vy: 4.5 + Math.random() * 6, t: Math.random() * 6 });
  }
  const dropCh = 0.5 * (1 + (player.dropRatePct || 0) / 100);
  for (const drop of ev.drops) {
    if (Math.random() > dropCh) continue;
    pickups.push({ type: 'armor', slot: drop.slot, quality: drop.quality, x: ev.x + (Math.random() - 0.5) * 0.6, y: ev.y - 0.3, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 2, t: 0 });
  }
  // 击杀回血(回春词条)
  if (player.healOnKill) {
    C.pstate.hp = Math.min(C.pstate.maxHp, C.pstate.hp + player.healOnKill);
  }
}

// 拾取判定(磁吸/拾取/背包满拦截)—— pickups 数组由 game.js 持有传入
export function stepPickups(dt, C) {
  const player = C.player; const pickups = C.pickups; const pstate = C.pstate;
  const ppk = player.torso.getPosition();
  const playerAlivePk = pstate.hp > 0 && !player.ragdoll;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    pk.t += dt;
    const dxp = ppk.x - pk.x, dyp = (ppk.y + 0.1) - pk.y;
    const distP = Math.hypot(dxp, dyp);
    if (playerAlivePk && distP < (pk.type === 'coin' ? 1.2 : 2.0)) { // 金币要走近才吸,装备 2m 就吸
      const k = (2.2 - distP) / 2.2 * 26;
      pk.vx += (dxp / (distP || 1)) * k * dt * 6;
      pk.vy += (dyp / (distP || 1)) * k * dt * 6;
    } else {
      pk.vy -= 16 * dt;
    }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    const gy = C.groundYAt(pk.x, pk.y + 0.1);
    if (pk.y <= gy && pk.vy < 0) {
      pk.y = gy;
      pk.vy *= (pk.type === 'coin' ? -0.55 : -0.4); // 金币弹弹弹
      pk.vx *= 0.8;
      if (Math.abs(pk.vy) < 0.8) pk.vy = 0;
    }
    if (playerAlivePk && distP < 0.45) { // 拾取
      if (pk.type === 'coin') {
        C.invAddCoins(1);
        floaters.push({ x: pk.x, y: gy, vy: 1.5, text: '+1', color: '#ffd24a', size: 14, bold: true, life: 0.75, max: 0.75, vx: (Math.random() - 0.5) * 1.2, rot: (Math.random() - 0.5) * 0.2 });
        beep(880, 1320, 0.07, 'square', 0.04);
      } else if (invIsFull()) {
        // 背包满:东西留在地上,提示做节流(不然每帧刷屏)
        if (feel.fullMsgT <= 0) {
          feel.fullMsgT = 1.4;
          floaters.push({ x: pk.x, y: gy + 0.3, vy: 1.6, text: '背包已满!', color: '#ff9a5c', size: 14, bold: true, life: 0.9, max: 0.9 });
          beep(240, 160, 0.12, 'square', 0.05);
        }
        continue; // 不拾取
      } else {
        const it = pk.type === 'armorRef' ? invInsertItem(pk.item) : invAddDrop(pk.slot, pk.quality);
        if (it) lootToast(it); // 右下角品质卡
        floaters.push({ x: pk.x, y: gy, vy: 1.2, text: `拾获 ${pk.slot === 'head' ? '头盔' : '防弹衣'} · ${C.QUALITY[pk.quality]?.label || ''}`, color: C.QUALITY[pk.quality]?.color ?? '#fff', size: 11, bold: false, life: 1, max: 1 });
        beep(400, 800, 0.1, 'square', 0.05);
      }
      pickups.splice(i, 1);
      continue;
    }
    if (pickups.length > 80 && pk.t > 25) pickups.splice(i, 1); // 数量兜底,金币常驻等玩家
    // 掉落物不许漂出地图
    if (pk.x < C.bounds.left + 0.5) { pk.x = C.bounds.left + 0.5; pk.vx = Math.abs(pk.vx) * 0.4; }
    if (pk.x > C.bounds.right - 0.5) { pk.x = C.bounds.right - 0.5; pk.vx = -Math.abs(pk.vx) * 0.4; }
  }
}
