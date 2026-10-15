// 武器/装备轮盘(GTA5/RDR2 风格 radial wheel):
// - 按住 Tab 唤起,世界进入子弹时间:主循环把真实 dt 乘 timeScale(≈0.08)再喂物理,
//   世界全员慢动作;轮盘自己的动画走真实 dt(「菜单拥有自己的时钟」),所以 UI 跟手。
// - 无光标扇区选择:不做像素级 hit-test,鼠标相对轮盘中心的方位角决定高亮扇区,
//   轮盘中心留死区;光标隐藏(css cursor:none),方向即选择。
// - T 键切换 武器/装备 两层;当前在用/穿戴的项带「当前」徽标,
//   悬停它 = 卸下,悬停其他 = 选中;松开 Tab 应用高亮项,左键立即应用并收起,全部实时生效。
import { GUN_PRESETS, EQUIP_PRESETS, saveEquip } from '../domain/gunPresets.js';

const TAU = Math.PI * 2;
// 未穿戴的显式存档(空 parts):区别于"从没存过"(后者 loadEquip 会回退出厂默认)
const EMPTY_EQUIP = (slot) => ({ slot, name: '未穿戴', defense: 0, meterScale: 200, parts: [] });

// 手枪没有设计器数据(程序化绘制),轮盘预览用一份固定小件
const PISTOL_PARTS = [
  { x: -24, y: -9, w: 46, h: 11, r: 3 },  // 套筒
  { x: -19, y: 2,  w: 14, h: 17, r: 2 },  // 握把
  { x: -2,  y: 2,  w: 12, h: 4,  r: 2 },  // 护圈
];

// 防弹盾牌(副手持盾):设计坐标 200px = 1m
const SHIELD_PARTS = [
  { x: -14, y: -62, w: 28, h: 124, r: 12, color: '#9fb0c4' }, // 盾体(亮钢)
  { x: -21, y: -54, w: 8,  h: 108, r: 4,  color: '#6b7484' }, // 侧沿
  { x: -8,  y: -36, w: 16, h: 22,  r: 3,  color: '#59c2ff' }, // 观察窗
  { x: -8,  y: 22,  w: 16, h: 8,   r: 3,  color: '#6b7484' }, // 铆钉排
];

const R0 = 64, R1 = 182;      // 扇环内/外半径
const DEAD = 36;              // 中心死区(像素):太靠近中心不算选择

export class WeaponWheel {
  // getPlayer 是函数:主循环里 resetPlayer 会整体重建 player,轮盘必须跟着拿最新的
  constructor(getPlayer, sfx = {}) {
    this.getPlayer = getPlayer;
    this.sfx = sfx;
    this.open = false;
    this.mode = 'weapons';    // 'weapons' | 'gear'
    this.hover = -1;          // 高亮扇区下标;-1 = 无(死区内)
    this.t = 0;               // 开合动画 0..1(真实时间驱动)
    this.timeScale = 1;       // 世界时间缩放,主循环每帧向 targetScale 拉近
    this.mx = 0; this.my = 0; // 鼠标(画布坐标)
  }

  get targetScale() { return this.open ? 0.08 : 1; }
  get p() { return this.getPlayer(); }

  openWheel() {
    this.open = true;
    this.mode = 'weapons';
    this.hover = -1;
    this.sfx.open?.();
  }
  forceClose() { this.open = false; this.hover = -1; }    // 失焦等异常路径,不应用选择
  release() { if (this.open) { this.applyHovered(); this.open = false; this.hover = -1; } }  // 松开 Tab
  confirm() { if (this.open) { this.applyHovered(); this.open = false; this.hover = -1; } }  // 左键立即确认
  toggleMode() {
    this.mode = this.mode === 'weapons' ? 'gear' : 'weapons';
    this.hover = -1;
    this.sfx.tick?.();
  }

  setMouse(cx, cy) {
    this.mx = cx; this.my = cy;   // 坐标永远记着(开轮盘后第一次动鼠标即可命中)
    if (!this.open) return;       // 轮盘关着不做扇区判定,否则平时动鼠标会一直嘀嘀响
    this.updateHover();
  }

  // ---- 轮盘内容(每次现查现构建:便宜,且天然跟随实时状态) ----
  items() {
    const p = this.p;
    if (this.mode === 'weapons') {
      const list = Object.values(GUN_PRESETS).map((g) => ({
        name: g.name,
        sub: g.stats.mode === 'hitscan' ? (`🎯 狙击镜 · ${g.stats.damage} 伤 · 一击必杀`) : (`${g.stats.damage} 伤 · ${g.stats.rpm} 发/分`), // 词条一览
        src: g, parts: g.parts, kind: 'gun',
        current: p.weapon === 'rifle' && p.gunDef.name === g.name,
      }));
      list.push({
        name: '手枪', sub: '常备 · 副武器', src: null, parts: PISTOL_PARTS, kind: 'pistol',
        current: p.weapon === 'pistol' && !p.shield,
      });
      list.push({
        name: '防弹盾牌', sub: `耐久 ${Math.round(p.shieldHp)}`, src: null, parts: SHIELD_PARTS, kind: 'shield',
        current: p.shield,
      });
      return list;
    }
    const list = [];
    for (const slot of ['head', 'torso']) {
      for (const eq of Object.values(EQUIP_PRESETS)) {
        if (eq.slot !== slot) continue;
        list.push({
          name: eq.name, sub: `防御 ${Math.round(eq.defense * 100)}%`,
          src: eq, parts: eq.parts, kind: slot,
          current: p.loadout[slot]?.name === eq.name,
        });
      }
      list.push({
        name: slot === 'head' ? '脱下头盔' : '脱下防弹衣', sub: '无护甲',
        src: null, parts: null, kind: 'bare', slot,
        current: p.loadout[slot] == null,
      });
    }
    return list;
  }

  // 扇区角度:武器层 = 整圆 6 等份,从正上方开始顺时针;
  // 装备层 = 上下半圆各 5 份:上半=头盔,下半=防弹衣(带水平分割线)
  sector(i, n) {
    if (this.mode === 'weapons') {
      const seg = TAU / n;
      return [-Math.PI / 2 + i * seg, -Math.PI / 2 + (i + 1) * seg];
    }
    const seg = Math.PI / 5;
    return i < 5 ? [Math.PI + i * seg, Math.PI + (i + 1) * seg] : [(i - 5) * seg, (i - 4) * seg];
  }

  itemAt(angle) {
    if (this.mode === 'weapons') {
      const seg = TAU / this.items().length;
      const norm = ((angle + Math.PI / 2) % TAU + TAU) % TAU;
      return Math.min(this.items().length - 1, Math.floor(norm / seg));
    }
    const seg = Math.PI / 5;
    return angle < 0
      ? Math.min(4, Math.max(0, Math.floor((angle + Math.PI) / seg)))
      : 5 + Math.min(4, Math.floor(angle / seg));
  }

  updateHover() {
    const dx = this.mx - this.cx, dy = this.my - this.cy;
    if (Math.hypot(dx, dy) < DEAD) {
      if (this.hover !== -1) this.hover = -1;
      return;
    }
    // 注意画布 y 向下,atan2 出来的角直接就是"屏幕方位角"
    const idx = this.itemAt(Math.atan2(dy, dx));
    if (idx !== this.hover) { this.hover = idx; this.sfx.tick?.(); }
  }
  get cx() { return 640; }  // 轮盘固定屏幕中心(画布 1280×720)
  get cy() { return 360; }

  applyHovered() {
    if (this.hover < 0) return;
    const item = this.items()[this.hover];
    if (!item) return;
    const p = this.p;
    const deep = (o) => JSON.parse(JSON.stringify(o));
    try {
      if (item.kind === 'gun') {
        if (item.current) { p.setWeapon('pistol'); this.sfx.off?.(); return; } // 卸下主武器 = 收起,改用常备手枪
        localStorage.setItem('contra-gun-primary', JSON.stringify(deep(item.src)));
        // 主武器槽位词缀跟着人走:带到新枪上重新聚合(否则旧枪 mods 静默跨枪继承)
        const affixes = p.gunDef?.affixes || loadGunAffixes() || [];
        p.gunDef = deep(item.src);
        p.gunDef.affixes = affixes;
        p.gunMods = computeGunMods(affixes);
        p.setWeapon('rifle');
        this.sfx.on?.();
      } else if (item.kind === 'pistol') {
        if (!item.current) { p.setShield(false); p.setWeapon('pistol'); this.sfx.on?.(); }
      } else if (item.kind === 'shield') {
        // 举盾 = 收起主武器改用手枪;卸盾 = 恢复双手
        p.setShield(!item.current);
        item.current ? this.sfx.off?.() : this.sfx.on?.();
      } else if (item.kind === 'head' || item.kind === 'torso') {
        if (item.current) {  // 卸下:写显式"未穿戴",别删键(删键会回退出厂默认)
          saveEquip(item.kind, EMPTY_EQUIP(item.kind));
          p.loadout[item.kind] = null;
          this.sfx.off?.();
        } else {
          saveEquip(item.kind, deep(item.src));
          p.loadout[item.kind] = deep(item.src);
          this.sfx.on?.();
        }
      } else if (item.kind === 'bare') {
        if (!item.current) {
          saveEquip(item.slot, EMPTY_EQUIP(item.slot));
          p.loadout[item.slot] = null;
          this.sfx.off?.();
        }
      }
    } catch { /* 存储不可用:游戏内仍然实时生效 */ }
  }

  update(dt) { // 真实时间:开合缓动
    this.t += ((this.open ? 1 : 0) - this.t) * (1 - Math.exp(-14 * dt));
  }

  // ---- 渲染(画布坐标 1280×720) ----
  draw(ctx) {
    if (this.t < 0.02) return;
    const t = this.t < 0.5 ? 2 * this.t * this.t : 1 - (-2 * this.t + 2) ** 2 / 2; // easeInOut
    const CX = this.cx, CY = this.cy;
    const items = this.items();

    // 全屏压暗 + 子弹时间冷色调
    ctx.fillStyle = `rgba(5,8,18,${0.36 * t})`;
    ctx.fillRect(0, 0, 1280, 720);

    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(t, t);
    ctx.translate(-CX, -CY);
    ctx.globalAlpha = t;

    // 轮盘底衬
    const glow = ctx.createRadialGradient(CX, CY, R0 * 0.4, CX, CY, R1 * 1.25);
    glow.addColorStop(0, 'rgba(30,44,80,0.5)');
    glow.addColorStop(1, 'rgba(30,44,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(CX - R1 * 1.3, CY - R1 * 1.3, R1 * 2.6, R1 * 2.6);

    const gear = this.mode === 'gear';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const hovered = i === this.hover;
      const [a0, a1] = this.sector(i, items.length);
      const r1 = R1 + (hovered ? 7 : 0);
      // 扇环
      ctx.beginPath();
      ctx.arc(CX, CY, r1, a0, a1);
      ctx.arc(CX, CY, R0, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = hovered ? 'rgba(255,168,66,0.30)'
        : item.current ? 'rgba(88,130,200,0.22)' : 'rgba(14,20,36,0.74)';
      ctx.fill();
      ctx.strokeStyle = hovered ? '#ffb84d'
        : item.current ? 'rgba(120,165,235,0.55)' : 'rgba(150,170,210,0.22)';
      ctx.lineWidth = hovered ? 2 : 1;
      ctx.stroke();

      // 内容(扇区质心方向)
      const am = (a0 + a1) / 2;
      const pr = (R0 + r1) / 2;
      const px = CX + Math.cos(am) * pr, py = CY + Math.sin(am) * pr;

      if (item.parts) {
        this.drawPartsMini(ctx, item.parts, px, py - 8, 62, 32);
      } else { // 脱下:斜杠圆圈图标
        ctx.strokeStyle = hovered ? '#ffb84d' : 'rgba(200,210,230,0.5)';
        ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(px, py - 10, 13, 0, TAU); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 9, py - 19); ctx.lineTo(px + 9, py - 1);
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = hovered ? '#ffe9c4' : 'rgba(232,228,216,0.92)';
      ctx.font = `${gear ? 10.5 : 12}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(item.name, px, py + 18);
      ctx.fillStyle = 'rgba(232,228,216,0.5)';
      ctx.font = '9px "Microsoft YaHei", sans-serif';
      ctx.fillText(item.sub, px, py + 30);
      if (item.current) { // 「当前」徽标
        ctx.fillStyle = '#ffb84d';
        ctx.beginPath();
        ctx.roundRect(px - 15, py + 34, 30, 13, 7);
        ctx.fill();
        ctx.fillStyle = '#241a08';
        ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
        ctx.fillText('当前', px, py + 43.5);
      }
    }

    // 装备层的上下半圆分割线
    if (gear) {
      ctx.strokeStyle = 'rgba(150,170,210,0.30)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(CX + R0, CY); ctx.lineTo(CX + R1 + 7, CY);
      ctx.moveTo(CX - R1 - 7, CY); ctx.lineTo(CX - R0, CY);
      ctx.stroke();
    }

    // 中心毂
    ctx.beginPath(); ctx.arc(CX, CY, R0 - 8, 0, TAU);
    ctx.fillStyle = 'rgba(10,14,26,0.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,170,210,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0e6d2';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.fillText(gear ? '装 备' : '武 器', CX, CY - 6);
    ctx.fillStyle = 'rgba(232,228,216,0.55)';
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.fillText('[T] 切换', CX, CY + 13);
    ctx.fillText('松开 Tab 装备', CX, CY + 27);

    // 高亮项的操作提示(卸下 / 选中)
    if (this.hover >= 0) {
      const item = items[this.hover];
      const act = item.kind === 'pistol' && item.current ? '常备武器'
        : item.kind === 'bare' ? (item.current ? '未穿戴' : `选中 · ${item.name}`)
        : item.current ? `卸下 · ${item.name}` : `选中 · ${item.name}`;
      ctx.fillStyle = '#ffb84d';
      ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
      ctx.fillText(act, CX, CY + R1 + 34);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 设计坐标零件缩略图:按包围盒缩放进扇区
  drawPartsMini(ctx, parts, cx, cy, boxW, boxH) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of parts) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h);
    }
    const s = Math.min(boxW / (x1 - x0), boxH / (y1 - y0));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    ctx.strokeStyle = 'rgba(8,8,14,0.6)';
    ctx.lineWidth = 1.2 / s;
    for (const p of parts) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, Math.min(3, (p.r ?? 2)));
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
