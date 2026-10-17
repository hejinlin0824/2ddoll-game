// 背包 UI v2:居中卡片,左侧已装备区 / 右侧背包(按类别分组)。
// 指针拖拽:背包物品拖到对应装备位 = 穿戴(原穿戴件自动回背包);
//          已装备物品拖回背包 = 卸下;拖出面板外 = 丢到地面(词缀/耐久完整保留)。
// 工坊页:选中装备修复/强化/锻造/三合一;三档宝箱开箱。
// 经济与存档逻辑全在 inventory.js,本层只管展示与交互。
import {
  invGet, invEquipped, invSetEquipped, invRepair, invRepairCost,
  invUpgrade, invUpgradeCost, invUpgradeRate, invForge, invBreakthrough,
  invAbsorb, invDecompose, invIsFull, invUsedCount, BP_CAP, invTakeItem, BOXES, invOpenBox,
} from '../domain/inventory.js';
import { QUALITY } from '../domain/gunPresets.js';
import { itemTitle, AFFIX_BY_ID } from '../domain/affixes.js';
import { beep, noiseBurst, uiSfx } from '../systems/audio.js';

const QLABEL = { broken: '破损', normal: '普通', fine: '优良', rare: '稀有', epic: '高级', legendary: '传说' };
const SLABEL = { head: '头盔', body: '防弹衣', gun: '武器词条' };

let open = false;
let tab = 'equip';          // 'equip' | 'shop'
let sel = new Set();        // 突破选择
let combineMode = false;
let shopSelId = null;       // 工坊选中物品
let onChanged = null;       // 穿戴/吸取变动后由 main 注入(同步玩家外观/耐久/主武器词条)
let gunInfo = () => ({ main: '主武器', side: '手枪', weapon: 'rifle' });

export function bpInit(cb) { onChanged = cb; }
export function bpSetGunInfo(fn) { gunInfo = fn; }
export function bpIsOpen() { return open; }

export function bpToggle() {
  open = !open;
  if (open) { tab = 'equip'; combineMode = false; sel.clear(); }
  render();
}
export function bpClose() { if (open) { open = false; combineMode = false; sel.clear(); render(); } }

const q = (it) => QUALITY[it.quality] || { color: '#aab0b8', label: it.quality };
const durPct = (it) => Math.max(0, Math.min(1, it.maxDur ? it.dur / it.maxDur : 0));

function affixLines(it) {
  return (it.affixes || []).map((a) => {
    const def = AFFIX_BY_ID[a.id];
    return def ? `<div class="iaff">${def.label} · ${def.fmt(a.v)}</div>` : '';
  }).join('');
}

// 物品卡内容(equip 页与工坊列表共用);枪词条材料无耐久概念
function cardHtml(it) {
  const qc = q(it);
  const isGun = it.slot === 'gun';
  const pct = durPct(it);
  const name = isGun
    ? `${it.gunName || '武器'}词条`
    : itemTitle(it.affixes || [], SLABEL[it.slot] || it.slot);
  return `
    <div class="ic-icon ${it.slot === 'head' ? 'ic-helm' : 'ic-vest'}" style="border-color:${qc.color}66">
      ${it.slot === 'head'
        ? `<div class="ic-helm-shape" style="background:${qc.color}"></div>`
        : `<div class="ic-vest-shape" style="background:${qc.color}"></div>`}
    </div>
    <div class="ic-info">
      <div class="ic-name" style="color:${qc.color}">${name}</div>
      ${isGun ? '' : `<div class="ic-dur"><div style="width:${pct * 100}%;background:${pct > 0.3 ? '#7ec97e' : '#e0713c'}"></div></div>`}
      <div class="ic-sub">${isGun ? '材料 · 吸取进主武器' : `${QLABEL[it.quality]} · 耐久 ${Math.ceil(it.dur)}/${Math.ceil(it.maxDur)}`}${it.equipped ? ' · <span style="color:#ffb84d">已装备</span>' : ''}</div>
      ${affixLines(it)}
    </div>`;
}

function render() {
  const bp = document.getElementById('bp');
  if (!bp) return;
  bp.style.display = open ? 'flex' : 'none';
  if (!open) return;
  const inv = invGet();
  document.getElementById('bpCoins').textContent = inv.coins;
  document.getElementById('bpCount').textContent = `${invUsedCount()}/${BP_CAP}`;
  document.getElementById('tabEquip').classList.toggle('on', tab === 'equip');
  document.getElementById('tabShop').classList.toggle('on', tab === 'shop');
  document.getElementById('pageEquip').style.display = tab === 'equip' ? '' : 'none';
  document.getElementById('pageShop').style.display = tab === 'shop' ? '' : 'none';
  if (tab === 'equip') renderEquip(inv); else renderShop(inv);
}

// ---- 装备页 ----
function renderEquip(inv) {
  const gi = gunInfo();
  document.getElementById('eqGun1').innerHTML = `<span class="eq-k ${gi.weapon === 'rifle' ? 'on' : ''}">${gi.main}</span><span class="eq-t">主武器</span>`;
  document.getElementById('eqGun2').innerHTML = `<span class="eq-k ${gi.weapon === 'pistol' ? 'on' : ''}">手枪</span><span class="eq-t">副武器</span>`;

  for (const slot of ['head', 'body']) {
    const el = document.getElementById('eq' + slot);
    const it = invEquipped(slot);
    el.dataset.slot = slot;
    el.style.setProperty('--qc', it ? q(it).color : 'transparent');
    el.classList.toggle('filled', !!it);
    el.innerHTML = it
      ? cardHtml(it)
      : `<div class="eq-empty">${SLABEL[slot]}<span>拖入穿戴</span></div>`;
    if (it) wireDrag(el, it, 'eq', () => render());
  }

  const grids = { head: document.getElementById('bagHead'), body: document.getElementById('bagBody'), gun: document.getElementById('bagGun') };
  for (const g of Object.values(grids)) g.innerHTML = '';
  const bag = inv.items.filter((it) => !it.equipped);
  let shown = 0;
  for (const it of bag) {
    const card = document.createElement('div');
    card.className = 'ic-card';
    card.style.setProperty('--qc', q(it).color);
    card.style.borderColor = q(it).color + '77';
    card.innerHTML = cardHtml(it) + '<button class="ic-drop" title="分解">♻</button>';
    card.querySelector('.ic-drop').onclick = (e) => {
      e.stopPropagation();
      decomposeItem(it, card);
    };
    wireDrag(card, it, 'bag', () => render());
    grids[it.slot].appendChild(card);
    shown++;
  }
  if (!shown) {
    grids.head.innerHTML = '<span class="bag-empty">背包空空 —— 杀敌搜尸、或去工坊开箱</span>';
  }
}

// 两步确认分解(防手滑):第一次点变色"确认",再点真分解得金币
function decomposeItem(it, cardEl) {
  const btn = cardEl.querySelector('.ic-drop');
  if (btn.dataset.armed) {
    const r = invDecompose(it.id);
    toast(r.msg);
    onChanged && onChanged();
    render();
  } else {
    btn.dataset.armed = '1';
    btn.textContent = '得?';
    btn.classList.add('armed');
    setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = '♻'; btn.classList.remove('armed'); } }, 1600);
  }
}

// ---- 指针拖拽( Pointer Events,鼠标/触屏通吃)----
let drag = null; // { item, from, ghost, sx, sy, moved }
function wireDrag(el, item, from, after) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { item, from, after, sx: e.clientX, sy: e.clientY, moved: false, ghost: null, el };
    e.preventDefault();
  });
}

function dragMove(e) {
  if (!drag) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 7) return;
    drag.moved = true;
    const src = document.createElement('div');
    src.className = 'drag-ghost';
    src.innerHTML = cardHtml(drag.item);
    src.style.borderColor = q(drag.item).color;
    document.body.appendChild(src);
    drag.ghost = src;
    drag.el.classList.add('dragging');
  }
  drag.ghost.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 8}px)`;
  // 高亮落点:目标装备位 / 背包区
  clearHot();
  const t = document.elementFromPoint(e.clientX, e.clientY);
  if (!t) return;
  const panel = t.closest('.bp-panel');
  if (!panel) return; // 面板外 = 将丢弃,不高亮
  if (drag.from === 'bag') {
    const slotEl = t.closest('.eq-slot.armor');
    if (slotEl && slotEl.dataset.slot === drag.item.slot) slotEl.classList.add('drop-hot');
  } else {
    const bag = t.closest('.bp-bag');
    if (bag) bag.classList.add('drop-hot');
  }
}

function dragUp(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  clearHot();
  if (d.ghost) d.ghost.remove();
  d.el.classList.remove('dragging');
  if (!d.moved) return; // 纯点击,不算拖拽

  const t = document.elementFromPoint(e.clientX, e.clientY);
  const panel = t && t.closest('.bp-panel');
  if (!panel) {
    // 拖出面板不再丢弃(丢弃已移除,改分解);枪词条材料也不可穿戴,拖出无效
    toast('拖出无效 —— 不用的物品用 ♻ 分解换金币');
    d.after && d.after();
    return;
  }
  if (d.from === 'bag') {
    const slotEl = t.closest('.eq-slot.armor');
    if (slotEl && slotEl.dataset.slot === d.item.slot) {
      invSetEquipped(d.item.id, true); // 同槽旧件自动回背包
      toast('已装备');
      onChanged && onChanged();
    }
  } else {
    const bag = t.closest('.bp-bag');
    if (bag) {
      if (invIsFull()) toast('背包已满,无法卸下');
      else { invSetEquipped(d.item.id, false); toast('已卸下'); onChanged && onChanged(); }
    }
  }
  render();
}
function clearHot() {
  document.querySelectorAll('.drop-hot').forEach((el) => el.classList.remove('drop-hot'));
}
window.addEventListener('pointermove', dragMove);
window.addEventListener('pointerup', dragUp);
window.addEventListener('pointercancel', dragUp);

// ---- 工坊页 ----
function renderShop(inv) {
  const list = document.getElementById('shopList');
  list.innerHTML = '';
  const items = [...inv.items].sort((a, b) => (a.equipped === b.equipped ? 0 : a.equipped ? -1 : 1));
  if (!shopSelId && items.length) shopSelId = items[0].id;
  for (const it of items) {
    const chip = document.createElement('button');
    chip.className = 'shop-chip' + (it.id === shopSelId ? ' sel' : '');
    chip.style.borderColor = q(it).color + (it.id === shopSelId ? '' : '55');
    if (it.id === shopSelId) chip.style.boxShadow = `0 0 8px ${q(it).color}66`;
    chip.textContent = `${itemTitle(it.affixes || [], SLABEL[it.slot])}${it.equipped ? ' ·装备中' : ''}`;
    chip.onclick = () => { if (combineMode) toggleCombinePick(it.id); else { shopSelId = it.id; } render(); };
    if (combineMode && sel.has(it.id)) chip.classList.add('picked');
    list.appendChild(chip);
  }
  if (combineMode) {
    const hint = document.createElement('div');
    hint.className = 'shop-hint';
    hint.textContent = `突破选择中:${sel.size}/3(同槽位同品质)`;
    list.appendChild(hint);
  }

  const it = invItemSafe(shopSelId);
  const detail = document.getElementById('shopDetail');
  if (!it) {
      detail.innerHTML = '<div class="eq-empty" style="height:100%">没有可操作的装备</div>';
    } else {
      const qc = q(it);
      const rc = it.slot === 'gun' ? 0 : invRepairCost(it.id);
      const uc = invUpgradeCost(it.quality);
      const ur = invUpgradeRate(it.quality);
      const canAbsorb = !it.equipped && (it.slot === 'gun' || invEquipped(it.slot));
      const absorbLabel = it.slot === 'gun' ? '吸取 → 主武器词条' : `吸取 → 已装备的${SLABEL[it.slot]}`;
      detail.innerHTML = `
        <div class="ic-card static" style="border-color:${qc.color}88">${cardHtml(it)}</div>
        <div class="shop-btns">
          ${it.slot === 'gun' ? '' : `<button id="opRepair" ${rc === 0 ? 'disabled' : ''}>修复 · ${rc} 金</button>`}
          <button id="opUpgrade" ${uc === undefined ? 'disabled' : ''}>强化 → ${QLABEL[nextQuality(it.quality)] || 'MAX'} · ${uc ?? '-'} 金${ur !== undefined ? ` · 成功 ${Math.round(ur * 100)}%` : ''}</button>
          ${it.slot === 'gun' ? '' : '<button id="opForge">锻造 · 25 金 · 耐久上限 ×1.5</button>'}
          <button id="opAbsorb" ${canAbsorb ? '' : 'disabled'} title="把这件的词条合并进目标(同词条数值相加)后消失">${absorbLabel}</button>
          <button id="opBreak">${combineMode ? `确认突破(${sel.size}/3)` : '突破 · 3 件同槽同品质 · 概率升/不变/失败'}</button>
        </div>`;
      if (it.slot !== 'gun') {
        detail.querySelector('#opRepair').onclick = () => act(() => invRepair(it.id));
        detail.querySelector('#opForge').onclick = () => act(() => invForge(it.id));
      }
      detail.querySelector('#opUpgrade').onclick = () => act(() => invUpgrade(it.id));
      detail.querySelector('#opAbsorb').onclick = () => {
        const r = invAbsorb(it.id);
        toast(r.msg);
        if (r.ok) { shopSelId = null; onChanged && onChanged(); }
        render();
      };
      detail.querySelector('#opBreak').onclick = () => {
        if (!combineMode) { combineMode = true; sel.clear(); render(); return; }
        const r = invBreakthrough([...sel]);
        toast(r.msg);
        if (r.ok) { combineMode = false; sel.clear(); shopSelId = r.item.id; onChanged && onChanged(); }
        render();
      };
    }

  // 开箱区
  const boxes = document.getElementById('boxRow');
  boxes.innerHTML = '';
  for (const box of BOXES) {
    const odds = Object.entries(box.odds).sort((a, b) => b[1] - a[1])
      .map(([qq, w]) => `<span style="color:${QUALITY[qq].color}">${QLABEL[qq]} ${w}%</span>`).join(' ');
    const el = document.createElement('div');
    el.className = 'box-card';
    el.style.borderColor = box.color + '88';
    el.innerHTML = `
      <div class="box-name" style="color:${box.color}">📦 ${box.name}</div>
      <div class="box-odds">${odds}</div>
      <button style="border-color:${box.color}">开启 · ${box.cost} 金</button>`;
    el.querySelector('button').onclick = () => {
      const r = invOpenBox(box.id);
      if (!r.ok) { toast(r.msg); return; }
      playBoxAnim(r.item, r.box);
    };
    boxes.appendChild(el);
  }
}

function toggleCombinePick(id) {
  if (sel.has(id)) sel.delete(id);
  else if (sel.size < 3) sel.add(id);
}
function invItemSafe(id) { return invGet().items.find((x) => x.id === id) || null; }
function nextQuality(qq) {
  const order = ['broken', 'normal', 'fine', 'rare', 'epic', 'legendary'];
  return order[order.indexOf(qq) + 1];
}
function act(fn) {
  const r = fn();
  toast(r.msg);
  render();
  onChanged && onChanged();
}

// ---- 页签与按钮绑定 ----
export function bpWire() {
  document.getElementById('tabEquip').onclick = () => { tab = 'equip'; render(); };
  document.getElementById('tabShop').onclick = () => { tab = 'shop'; render(); };
  document.getElementById('bpCloseBtn').onclick = () => bpClose();
  // Esc 归背包自己处理:本监听器先于 input.js 的暂停键注册,必须拦断,
  // 否则"关背包"之后 input.js 又看到背包已关、把同一次 Esc 当暂停键弹主菜单(双触发)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && open) { e.stopImmediatePropagation(); bpClose(); }
  });
}

function toast(msg) {
  const t = document.getElementById('bpToast');
  if (!t) return;
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.style.opacity = 0), 2000);
}


// ---- 开箱动画:箱子开一条缝露出品质光 → 抖动蓄力 → 盖子炸开物品爆出 → 展示 ----
function playBoxAnim(item, box) {
  const qc = QUALITY[item.quality] || { color: '#aab0b8', label: item.quality };
  const root = document.createElement('div');
  root.className = 'box-anim';
  const aff = (item.affixes || []).map((a) => {
    const d = AFFIX_BY_ID[a.id];
    return d ? `<div class="prize-affix">${d.label} · ${d.fmt(a.v)}</div>` : '';
  }).join('');
  root.innerHTML = `
    <div class="beam"></div>
    <div class="box3d">
      <div class="box-lid"></div>
      <div class="box-body"><div class="box-band"></div></div>
      <div class="seam-glow"></div>
    </div>
    <div class="prize" style="--qc: ${qc.color}">
      <div class="prize-name" style="color:${qc.color}">${itemTitle(item.affixes || [], SLABEL[item.slot])}</div>
      <div class="prize-q">${QLABEL[item.quality]} · 耐久 ${Math.ceil(item.dur)}/${Math.ceil(item.maxDur)}</div>
      ${aff}
      <button class="prize-ok" style="border-color:${qc.color}">收入背包</button>
    </div>`;
  document.body.appendChild(root);
  const lid = root.querySelector('.box-lid');
  const glow = root.querySelector('.seam-glow');
  const boxEl = root.querySelector('.box3d');
  const prize = root.querySelector('.prize');
  const beam = root.querySelector('.beam');
  beam.style.setProperty('--qc', qc.color);
  root.style.setProperty('--qc', qc.color);
  beep(box.id === 'gold' ? 140 : box.id === 'silver' ? 170 : 200, 90, 0.2, 'sine', 0.06);
  setTimeout(() => { // 开一条缝,露出品质光
    lid.classList.add('crack');
    glow.classList.add('on');
    if (!uiSfx('click-a')) beep(300, 480, 0.12, 'sine', 0.04);
  }, 350);
  setTimeout(() => { // 抖动蓄力,光越来越烈
    boxEl.classList.add('shaking');
    glow.classList.add('strong');
    let rattles = 0;
    const rv = setInterval(() => { noiseBurst(0.04, 0.05, 900); if (++rattles >= 6) clearInterval(rv); }, 150);
  }, 1050);
  setTimeout(() => { // 哄!盖子炸开,物品爆出
    boxEl.classList.add('burst');
    lid.classList.add('fly');
    glow.classList.remove('strong');
    beam.classList.add('on');
    prize.classList.add('pop');
    noiseBurst(0.4, 0.16, 1400);
    beep(180, 720, 0.35, 'square', 0.08);
    beep(90, 40, 0.5, 'sine', 0.12);
    if (['epic', 'legendary'].includes(item.quality)) beep(880, 1760, 0.5, 'triangle', 0.07);
  }, 2100);
  root.querySelector('.prize-ok').onclick = () => {
    shopSelId = item.id;
    onChanged && onChanged();
    render();
    root.remove();
  };
}
