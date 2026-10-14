// 魂斗罗风格 2D 布娃娃射击 —— 主循环
import { World, Vec2 } from 'planck';
import { LEVEL, buildLevel, groundYAt, drawSky, drawParallax, drawTerrain } from './level.js';
import { Player } from './player.js';
import { loadSavedGun } from './gunPresets.js';

const W = 1280, H = 720;
const PPM = 52;          // 像素/米
const STEP = 1 / 60;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;
if (!ctx.roundRect) {
  ctx.roundRect = function (x, y, w, h, r) {
    const rr = typeof r === 'number' ? r : Math.min(w, h) / 2;
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}

// ---- 世界 ----
const world = new World(Vec2(0, -30));
const levelBodies = buildLevel(world);
// 注意:Player.build 内部会在 spawn 基础上再抬 0.9m,这里传原始地面高度
let player = new Player(world, Vec2(LEVEL.spawn.x, LEVEL.spawn.y));
window.__game = () => ({ player, world, input, bullets }); // 调试句柄

// 枪械设计器保存后,游戏页实时换枪/换装(storage 事件跨标签页触发)
window.addEventListener('storage', (e) => {
  if (e.key === 'contra-gun-primary' && player.weapon === 'rifle') {
    player.gunDef = loadSavedGun();
  }
  if (e.key === 'contra-equip-head' || e.key === 'contra-equip-torso') {
    player.reloadLoadout();
  }
});

const cam = { x: LEVEL.spawn.x, y: 3.4, shake: 0 };

// ---- 输入 ----
const input = { left: false, right: false, down: false, fire: false, jumpPressed: false };
const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyS: 'down', ArrowDown: 'down',
  Space: 'fire',
};
window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) {
    if (e.code === 'Space') e.preventDefault();
    if (KEYMAP[e.code] === 'left' || KEYMAP[e.code] === 'right') input[KEYMAP[e.code]] = true;
    else input[KEYMAP[e.code]] = true;
  }
  if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) input.jumpPressed = true;
  if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyR') player.setRagdoll(!player.ragdoll);
  if (e.code === 'KeyE') resetPlayer();
  if (e.code === 'KeyB') debugDraw = !debugDraw;
  if (e.code === 'KeyQ') player.setWeapon(player.weapon === 'rifle' ? 'pistol' : 'rifle');
  if (e.code === 'Digit1') player.setWeapon('rifle');
  if (e.code === 'Digit2') player.setWeapon('pistol');
  initAudio();
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
window.addEventListener('blur', () => {
  input.left = input.right = input.down = input.fire = false;
});

// ---- 鼠标瞄准(canvas 是 object-fit:contain,要算黑边偏移)----
const mouse = { x: 0, y: 0, active: false };
function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / W, r.height / H);
  const cx = (e.clientX - r.left - (r.width - W * scale) / 2) / scale;
  const cy = (e.clientY - r.top - (r.height - H * scale) / 2) / scale;
  return { x: (cx - W / 2) / PPM + cam.x, y: (H * 0.60 - cy) / PPM + cam.y };
}
canvas.addEventListener('mousemove', (e) => {
  const p = toWorld(e);
  mouse.x = p.x; mouse.y = p.y; mouse.active = true;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const p = toWorld(e);
  mouse.x = p.x; mouse.y = p.y; mouse.active = true;
  input.fire = true;
  initAudio();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });

function resetPlayer() {
  player.destroy();
  player = new Player(world, Vec2(LEVEL.spawn.x, LEVEL.spawn.y));
}

// ---- 极简音效(WebAudio 合成,无素材)----
let actx = null;
function initAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* 无音频 */ } }
}
function beep(f0, f1, dur, type = 'square', vol = 0.08) {
  if (!actx) return;
  try {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, actx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), actx.currentTime + dur);
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch { /* 忽略 */ }
}
// 噪声爆音:给枪声"砰"的力度
function noiseBurst(dur = 0.05, vol = 0.08, cutoff = 1200) {
  if (!actx) return;
  try {
    const n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = actx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(actx.destination);
    src.start();
  } catch { /* 忽略 */ }
}

// ---- 子弹 / 粒子 ----
const bullets = [];
const particles = [];
let flashT = 0, flashPos = { x: 0, y: 0 }, flashR = 26;

function spawnBullet(x, y, dx, dy, weapon) {
  const rifle = weapon === 'rifle';
  const v0 = rifle ? 6 : 4;
  bullets.push({
    x, y, px: x, py: y, vx: dx * v0, vy: dy * v0, life: 1.3,
    rifle, maxSp: rifle ? 34 : 22,
  });
  // 弹壳
  const m = player.muzzle();
  particles.push({
    x: m.x - dx * 0.15, y: m.y, vx: -dx * 2 + (Math.random() - 0.5), vy: 3 + Math.random() * 2,
    life: 0.7, size: 2.6, color: '#d9a83c', grav: 1,
  });
}
function burst(x, y, n, color, speed = 4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s,
      life: 0.35 + Math.random() * 0.3, size: 2 + Math.random() * 2.5,
      color, grav: 1,
    });
  }
}

function hitTerrain(x, y) {
  for (const r of LEVEL.rects) {
    if (Math.abs(x - r.x) < r.w / 2 && Math.abs(y - r.y) < r.h / 2) return true;
  }
  return false;
}

// ---- HUD ----
const hud = {
  state: document.getElementById('hud-state'),
  ragdoll: document.getElementById('hud-ragdoll'),
};

let debugDraw = false;

// ---- 世界坐标 -> 屏幕 ----
function w2s(wx, wy) {
  return [
    (wx - cam.x) * PPM + W / 2 + (cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 14 : 0),
    H * 0.60 - (wy - cam.y) * PPM + (cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 14 : 0),
  ];
}

// ---- 物理步进 ----
function step(dt) {
  input.aim = mouse.active ? { x: mouse.x, y: mouse.y } : null;
  player.update(dt, input);
  input.jumpPressed = false;

  for (const ev of player.events) {
    if (ev.type === 'shot') {
      const rifle = ev.weapon === 'rifle';
      spawnBullet(ev.x, ev.y, ev.dx, ev.dy, ev.weapon);
      flashT = 0.07; flashPos = { x: ev.x, y: ev.y };
      flashR = rifle ? 38 : 27;
      cam.shake = Math.min(0.6, cam.shake + (rifle ? 0.22 : 0.09));
      if (rifle) { beep(520, 80, 0.13, 'square', 0.09); noiseBurst(0.07, 0.11, 900); }
      else { beep(950, 160, 0.09, 'square', 0.06); noiseBurst(0.045, 0.06, 1600); }
    } else if (ev.type === 'jump') {
      burst(ev.x ?? player.torso.getPosition().x, groundYAt(player.torso.getPosition().x, player.torso.getPosition().y), 6, '#9a8a70', 2.5);
      beep(260, 540, 0.14, 'square', 0.05);
    } else if (ev.type === 'land') {
      burst(ev.x, ev.y, ev.hard ? 14 : 7, '#9a8a70', ev.hard ? 5 : 3);
      if (ev.hard) cam.shake = 0.5;
      beep(150, 60, 0.1, 'sine', 0.07);
    } else if (ev.type === 'step') {
      burst(ev.x, ev.y, 2, '#8a7a60', 1.4);
    } else if (ev.type === 'fell') {
      resetPlayer();
    }
  }

  // 子弹:加速 + 碰撞(高速时补测中点防穿透)
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.px = b.x; b.py = b.y;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < b.maxSp) {
      const k = Math.min(b.maxSp, sp + 1400 * dt) / sp;
      b.vx *= k; b.vy *= k;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    const hitNow = hitTerrain(b.x, b.y) || (sp > 14 && hitTerrain((b.px + b.x) / 2, (b.py + b.y) / 2));
    if (hitNow) {
      burst((b.px + b.x) / 2, (b.py + b.y) / 2, 5, '#ffd77a', 3.5);
      bullets.splice(i, 1);
      continue;
    }
    if (b.life <= 0) bullets.splice(i, 1);
  }

  // 粒子(弹壳/尘土落到地面弹一下)
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy -= 22 * dt * (p.grav ?? 1);
    const gy = groundYAt(p.x, p.y + 0.5);
    if ((p.grav ?? 1) && p.vy < 0 && p.y <= gy) {
      p.y = gy;
      p.vy *= -0.35; p.vx *= 0.6;
      if (Math.abs(p.vy) < 0.6) { p.vy = 0; p.grav = 0; p.vx *= 0.5; }
    }
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  if (particles.length > 300) particles.splice(0, particles.length - 300);

  flashT = Math.max(0, flashT - dt);
  cam.shake = Math.max(0, cam.shake - dt * 2.2);

  world.step(dt, 8, 3);
}

// ---- 相机 ----
function updateCamera(dt) {
  const p = player.torso.getPosition();
  const tx = p.x + player.facing * 1.4;
  const ty = Math.max(3.4, p.y + 0.6);
  const k = 1 - Math.exp(-6 * dt);
  cam.x = lerp(cam.x, tx, k);
  cam.y = lerp(cam.y, ty, k);
  const half = W / 2 / PPM;
  cam.x = clamp(cam.x, LEVEL.bounds.left + half, LEVEL.bounds.right - half);
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- 渲染 ----
function render(time) {
  drawSky(ctx, W, H);
  drawParallax(ctx, W, H, cam.x, PPM);
  drawTerrain(ctx, LEVEL.rects, w2s, PPM);

  // 角色影子
  {
    const p = player.torso.getPosition();
    const gy = groundYAt(p.x, p.y);
    const [sx, sy] = w2s(p.x, gy);
    const h = clamp(1 - (p.y - 0.8 - gy) / 4, 0.25, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.28 * h})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy + 3, 26 * h, 6 * h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 子弹曳光:沿速度反向的渐变拖尾,越快越长(主武器更粗更长)
  for (const b of bullets) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const len = Math.min(sp * 0.055, b.rifle ? 2.2 : 1.6);
    const [x1, y1] = w2s(b.x - (b.vx / sp) * len, b.y - (b.vy / sp) * len);
    const [x2, y2] = w2s(b.x, b.y);
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, 'rgba(255, 200, 100, 0)');
    g.addColorStop(0.65, 'rgba(255, 225, 150, 0.7)');
    g.addColorStop(1, 'rgba(255, 255, 240, 1)');
    ctx.strokeStyle = g;
    ctx.lineWidth = b.rifle ? 4.5 : 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // 亮芯
    const [cx, cy] = w2s(b.x - (b.vx / sp) * len * 0.3, b.y - (b.vy / sp) * len * 0.3);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = b.rifle ? 1.8 : 1.4;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
  }

  player.draw(ctx, w2s, PPM, time);

  // 鼠标准星(期望瞄准点)
  if (mouse.active) {
    const [mx, my] = w2s(mouse.x, mouse.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.moveTo(mx - 14, my); ctx.lineTo(mx - 4, my);
    ctx.moveTo(mx + 4, my); ctx.lineTo(mx + 14, my);
    ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my - 4);
    ctx.moveTo(mx, my + 4); ctx.lineTo(mx, my + 14);
    ctx.stroke();
  }

  // 炮口火光
  if (flashT > 0) {
    const [fx, fy] = w2s(flashPos.x, flashPos.y);
    const a = flashT / 0.07;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, flashR);
    g.addColorStop(0, `rgba(255,240,180,${a})`);
    g.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(fx, fy, flashR, 0, Math.PI * 2); ctx.fill();
  }

  // 粒子
  for (const p of particles) {
    const [x, y] = w2s(p.x, p.y);
    ctx.globalAlpha = clamp(p.life * 3, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // 物理调试视图
  if (debugDraw) drawDebug();

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawDebug() {
  const bodies = [...levelBodies, ...player.allBodies];
  for (const b of bodies) {
    const isPlayer = b === player.torso;
    for (let f = b.getFixtureList(); f; f = f.getNext()) {
      const shape = f.getShape();
      ctx.strokeStyle = isPlayer ? '#ff5b5b' : b.getType() === 'static' ? '#59c2ff' : '#ffd166';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (shapeGetType(shape) === 'circle') {
        const c = b.getWorldPoint(shape.m_p || { x: 0, y: 0 });
        const [x, y] = w2s(c.x, c.y);
        ctx.arc(x, y, shape.m_radius * PPM, 0, Math.PI * 2);
      } else {
        const verts = shape.m_vertices;
        verts.forEach((v, i) => {
          const wp = b.getWorldPoint(v);
          const [x, y] = w2s(wp.x, wp.y);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.stroke();
    }
  }
}
function shapeGetType(shape) { return shape.m_type || (shape.getType ? shape.getType() : 'polygon'); }

// ---- 主循环(固定物理步长)----
let acc = 0, last = performance.now(), fpsN = 0, fpsT = 0, fps = 60;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.1);
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 4) { step(STEP); acc -= STEP; n++; }
  updateCamera(dt);
  render(now / 1000);

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  const heatBar = '▮'.repeat(Math.round(player.heat * 6)) + '▯'.repeat(6 - Math.round(player.heat * 6));
  const stateTxt = player.ragdoll ? '布娃娃' : player.prone ? '趴下' : player.grounded ? (Math.abs(player.torso.getLinearVelocity().x) > 0.5 ? '奔跑' : '站立') : player.torso.getLinearVelocity().y > 1 ? '上升' : '下落';
  const defPct = Math.round(Math.min(0.8, player.defense) * 100);
  hud.state.textContent = `${stateTxt} · ${player.weapon === 'rifle' ? '主武器' : '手枪'} · 熟练度 ${Math.round(player.skill * 100)}% · 防御 ${defPct}% · 后坐力 ${heatBar} · ${fps} FPS · B 调试视图`;
  hud.ragdoll.textContent = player.ragdoll ? '布娃娃模式(按 E 复位)' : '';
  hud.ragdoll.style.display = player.ragdoll ? 'block' : 'none';

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
