// HUD 系统:左上角色面板 / 连杀公告(滚轮数字)/ 拾取 toast / 伤害飘字标签。
// 纯 DOM 层:游戏状态通过参数传入,不持有世界引用。
import { QUALITY } from '../domain/gunPresets.js';
import { invEquipped } from '../domain/inventory.js';
import { itemTitle, AFFIX_BY_ID } from '../domain/affixes.js';

const QLABEL = { broken: '破损', normal: '普通', fine: '优良', rare: '稀有', epic: '高级', legendary: '传说' };
const SLOT_LABEL = { head: '头盔', body: '防弹衣' };

// ---- 左上角角色面板(DOM 引用缓存:面板每 5 帧刷一次,别每次都 getElementById)----
const PNL_IDS = ['pnlHp', 'pnlHpText', 'pnlHelm', 'pnlVest', 'pnlHelmBar', 'pnlVestBar', 'pnlHelmText', 'pnlVestText', 'pnlMain', 'pnlSide'];
let PNL = null;
function pnl() {
  if (!PNL) PNL = Object.fromEntries(PNL_IDS.map((id) => [id, document.getElementById(id)]));
  return PNL;
}
export function updateStatusPanel(pstate, player) {
  const el = pnl();
  if (!el.pnlHp) return;
  const hpPct = Math.max(0, pstate.hp / pstate.maxHp) * 100;
  el.pnlHp.style.width = hpPct + '%';
  el.pnlHpText.textContent = `${Math.ceil(pstate.hp)}/${pstate.maxHp}`;
  const h = invEquipped('head'), b = invEquipped('body');
  const hq = h ? QUALITY[h.quality] : null, bq = b ? QUALITY[b.quality] : null;
  el.pnlHelm.style.width = (h ? Math.max(0, h.dur / h.maxDur) * 100 : 0) + '%';
  el.pnlVest.style.width = (b ? Math.max(0, b.dur / b.maxDur) * 100 : 0) + '%';
  el.pnlHelmBar.style.borderColor = hq ? hq.color : 'rgba(244,233,216,0.25)';
  el.pnlVestBar.style.borderColor = bq ? bq.color : 'rgba(244,233,216,0.25)';
  el.pnlHelmText.textContent = h ? `${QLABEL[h.quality]} 盔 ${Math.ceil(h.dur)}` : '无头盔';
  el.pnlVestText.textContent = b ? `${QLABEL[b.quality]} 甲 ${Math.ceil(b.dur)}` : '无护甲';
  el.pnlMain.textContent = player.weapon === 'rifle' ? (player.gunDef?.name || '主武器') : '手枪';
  el.pnlMain.style.opacity = player.weapon === 'rifle' ? 1 : 0.45;
  el.pnlSide.style.opacity = player.weapon === 'pistol' ? 1 : 0.45;
}

// ---- 连杀计数(里程牌 + 滚轮数字)----
// 调研结论:里程碑公告放顶部居中(DMC 式持续量表才挂角落);等级越高颜色越热
const STREAK_LABEL = (n) => n >= 10 ? '天下无双' : n >= 7 ? '杀神' : n === 6 ? '六连杀' : n === 5 ? '五连杀' : n === 4 ? '四连杀' : n === 3 ? '三连杀' : '双杀';
const STREAK_TIER = (n) => n >= 10 ? { c: '#ff5b4a', glow: '#ff8a5c' } : n >= 7 ? { c: '#ff9a3c', glow: '#ffb14a' } : n >= 5 ? { c: '#ffc21c', glow: '#ffd24a' } : { c: '#ffe9a8', glow: '#fff2cc' };
const odoEl = () => document.getElementById('streakOdo');
let STREAK = null, STREAK_LBL = null; // 连杀公告的容器/文字缓存
export function streakShow(n) {
  if (!STREAK) STREAK = document.getElementById('streak');
  const box = STREAK;
  if (!box) return;
  const tier = STREAK_TIER(n);
  if (!STREAK_LBL) STREAK_LBL = document.getElementById('streakLabel');
  const lbl = STREAK_LBL;
  lbl.textContent = STREAK_LABEL(n);
  lbl.style.color = tier.c;
  lbl.style.textShadow = `0 0 18px ${tier.glow}88, 0 2px 10px rgba(0,0,0,0.8)`;
  // 滚轮数字:固定位数(补零),每位一根竖排 0-9 胶片,换数时 translateY 滚动
  const odo = odoEl();
  const str = String(Math.min(99, n)).padStart(2, '0');
  while (odo.children.length < str.length) {
    const col = document.createElement('span');
    col.className = 'odo-col' + (odo.children.length === 0 ? ' dim' : '');
    const strip = document.createElement('span');
    strip.className = 'odo-strip';
    strip.innerHTML = '0123456789'.split('').map((d) => `<div>${d}</div>`).join(''); // 竖排胶片
    col.appendChild(strip);
    odo.appendChild(col);
  }
  [...odo.children].forEach((col, i) => {
    col.querySelector('.odo-strip').style.transform = `translateY(-${+str[i]}em)`;
    col.style.color = i === 0 && +str[i] === 0 ? '' : tier.c;
    col.classList.toggle('dim', +str[i] === 0 && i === 0); // 前导零淡化
  });
  box.classList.remove('show', 'big');
  void box.offsetWidth; // 重置动画
  box.classList.add('show');
  if (n % 5 === 0) box.classList.add('big'); // 里程碑:整块弹大
}
export function streakHide() {
  if (!STREAK) STREAK = document.getElementById('streak');
  if (STREAK) STREAK.classList.remove('show');
}

// ---- 拾取 toast:右下角品质卡,2s 消失(刷宝的爽点在捡到那一眼)----
export function lootToast(item) {
  const box = document.getElementById('lootToasts');
  if (!box) return;
  const q = QUALITY[item.quality] || { color: '#aab0b8', label: item.quality };
  const el = document.createElement('div');
  el.className = 'loot-card';
  el.style.borderColor = q.color;
  el.style.boxShadow = `0 0 14px ${q.color}55, inset 0 0 22px ${q.color}18`;
  const lines = (item.affixes || []).map((a) => {
    const def = AFFIX_BY_ID[a.id];
    return def ? `<div class="loot-affix">${def.label} · ${def.fmt(a.v)}</div>` : '';
  }).join('');
  el.innerHTML = `
    <div class="loot-title" style="color:${q.color}">${itemTitle(item.affixes || [], SLOT_LABEL[item.slot] || item.slot)}</div>
    <div class="loot-q">${q.label}${item.dur <= 0 ? ' · 耐久 0(待修复)' : ''}</div>
    ${lines}`;
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 2000);
}
