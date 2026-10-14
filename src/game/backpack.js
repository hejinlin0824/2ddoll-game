// 背包 UI:装备实例管理(装备/卸下/修复/升级/合成/锻造)。
// DOM 面板挂在 game.html 的 #bp 上;经济逻辑全在 inventory.js。
import { invGet, invEquipped, invSetEquipped, invRepair, invRepairCost, invUpgrade, invUpgradeCost, invForge, invCombine } from './inventory.js';
import { QUALITY } from './gunPresets.js';

const QLABEL = { broken: '破损', normal: '普通', fine: '优良', rare: '稀有', epic: '高级', legendary: '传说' };
const SLABEL = { head: '头盔', body: '防弹衣' };

let open = false;
let sel = new Set();      // 合成选择
let combineMode = false;
let onChanged = null;     // 穿戴变化后由 main 注入(同步玩家外观/耐久引用)

export function bpInit(cb) { onChanged = cb; }
export function bpIsOpen() { return open; }

export function bpToggle() {
  open = !open;
  if (!open) { combineMode = false; sel.clear(); }
  render();
}

export function bpClose() { if (open) { open = false; combineMode = false; sel.clear(); render(); } }

function slotLabel(s) { return SLABEL[s] || s; }

function render() {
  const bp = document.getElementById('bp');
  if (!bp) return;
  bp.style.display = open ? 'flex' : 'none';
  if (!open) return;
  const inv = invGet();
  document.getElementById('bpCoins').textContent = inv.coins;

  const grid = document.getElementById('bpGrid');
  grid.innerHTML = '';
  const items = [...inv.items].sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));

  if (!items.length) { grid.innerHTML = '<span style="font-size:12px;opacity:0.5">背包是空的 —— 打敌人捡装备</span>'; }

  for (const it of items) {
    const q = QUALITY[it.quality] || { color: '#aab0b8', label: it.quality };
    const card = document.createElement('div');
    card.className = 'bp-card';
    card.style.borderColor = q.color + (sel.has(it.id) ? '' : '88');
    if (sel.has(it.id)) card.style.boxShadow = `0 0 10px ${q.color}88`;
    const eq = it.equipped;
    const pct = Math.max(0, Math.min(1, it.dur / it.maxDur));

    const icon = document.createElement('div');
    icon.className = 'bp-icon';
    icon.style.borderColor = q.color;
    if (it.slot === 'head') {
      icon.innerHTML = `<div style="width:26px;height:15px;border-radius:13px 13px 3px 3px;background:${q.color}"></div>`;
    } else {
      icon.innerHTML = `<div style="width:22px;height:28px;border-radius:4px;background:${q.color}"></div>`;
    }
    card.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'bp-info';
    info.innerHTML = `
      <div style="color:${q.color}">${QLABEL[it.quality] || it.quality}${eq ? ' · <span style="color:#ffb84d">已装备</span>' : ''}</div>
      <div>${slotLabel(it.slot)}</div>
      <div class="bp-dur"><div style="width:${pct * 100}%;background:${pct > 0.3 ? '#7ec97e' : '#e0713c'}"></div></div>
      <div style="opacity:0.7">${Math.ceil(it.dur)}/${Math.ceil(it.maxDur)}</div>`;
    card.appendChild(info);

    const btns = document.createElement('div');
    btns.className = 'bp-btns';
    const mk = (label, fn, disabled, style) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = !!disabled;
      if (style) b.style.cssText = style;
      b.onclick = (ev) => { ev.stopPropagation(); const r = fn(); if (r && r.msg) toast(r.msg); render(); onChanged && onChanged(); };
      btns.appendChild(b);
      return b;
    };
    mk(eq ? '卸下' : '装备', () => { invSetEquipped(it.id, !eq); return { msg: eq ? '已卸下' : '已装备' }; });
    const rc = invRepairCost(it.id);
    mk(`修 ${rc}`, () => invRepair(it.id), rc === 0);
    const uc = invUpgradeCost(it.quality);
    mk(`升 ${uc}`, () => invUpgrade(it.id), uc === undefined);
    mk('锻 25', () => invForge(it.id));
    card.appendChild(btns);

    card.onclick = () => {
      if (!combineMode) return;
      if (sel.has(it.id)) sel.delete(it.id);
      else if (sel.size < 3) sel.add(it.id);
      render();
    };
    grid.appendChild(card);
  }

  // 合成按钮状态
  const cb = document.getElementById('bpCombine');
  const selItems = [...sel].map((x) => invGet().items.find((it) => it.id === x)).filter(Boolean);
  const can = combineMode && selItems.length === 3 &&
    selItems.every((it) => it.slot === selItems[0].slot && it.quality === selItems[0].quality);
  cb.textContent = combineMode ? `合成${selItems.length}/3` : '合成(3 件同品质)';
  cb.disabled = !(combineMode && can);
}

// 合成按钮/选择模式
export function bpWire() {
  document.getElementById('bpCombine').onclick = () => {
    if (!combineMode) { combineMode = true; sel.clear(); render(); return; }
    const ids = [...sel];
    const r = invCombine(ids);
    toast(r.msg);
    if (r.ok) { combineMode = false; sel.clear(); }
    render();
    onChanged && onChanged();
  };
}

function toast(msg) {
  const t = document.getElementById('bpToast');
  if (!t) return;
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.style.opacity = 0), 2000);
}
