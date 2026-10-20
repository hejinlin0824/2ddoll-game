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
// 突破概率人话(与 inventory.js BT_RATE 对应):详情页"突破"操作行里展示
const BT_DESC = {
  broken: '这件 90% 升档,失败掉一条词条',
  normal: '这件 90% 升档,失败掉一条词条',
  fine: '这件 90% 升档,失败掉一条词条',
  rare: '这件 90% 升档,失败掉一条词条',
  epic: '高级→传说只有 10% 升,80% 不变,10% 失败掉词条',
};

let open = false;
let tab = 'equip';          // 'equip' | 'shop'
let inventoryFilter = 'all'; // 'all' | 'head' | 'body' | 'gun'
let inventorySort = 'quality'; // 'quality' | 'name' | 'durability'
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
  if (open) {
    tab = 'equip'; combineMode = false; sel.clear();
    inventoryFilter = 'all'; inventorySort = 'quality';
    const search = document.getElementById('bpSearch'); if (search) search.value = '';
    const sort = document.getElementById('bpSort'); if (sort) sort.value = 'quality';
  }
  render();
}
export function bpClose() { if (open) { open = false; combineMode = false; sel.clear(); render(); } }

const q = (it) => QUALITY[it.quality] || { color: '#aab0b8', label: it.quality };
const durPct = (it) => Math.max(0, Math.min(1, it.maxDur ? it.dur / it.maxDur : 0));

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function affixLines(it) {
  return (it.affixes || []).map((a) => {
    const def = AFFIX_BY_ID[a.id];
    return def
      ? `<div class="iaff">${escapeHTML(def.label)} · ${escapeHTML(def.fmt(a.v))}</div>`
      : '';
  }).join('');
}

// 物品卡内容(equip 页与工坊列表共用);枪词条材料无耐久概念。
// 主信息单独包裹，操作栏由 .ic-card 放在下一行，避免按钮挤占词条文本宽度。
function cardHtml(it) {
  const qc = q(it);
  const isGun = it.slot === 'gun';
  const pct = durPct(it);
  const name = isGun
    ? `${it.gunName || '武器'}词条`
    : itemTitle(it.affixes || [], SLABEL[it.slot] || it.slot);
  const icon = isGun
    ? '<div class="ic-gun-shape"></div>'
    : it.slot === 'head'
      ? '<div class="ic-helm-shape"></div>'
      : '<div class="ic-vest-shape"></div>';
  const type = isGun ? 'WEAPON AFFIX' : it.slot === 'head' ? 'HEADGEAR' : 'BODY ARMOR';
  const sub = isGun
    ? '材料 · 吸取进主武器'
    : `${QLABEL[it.quality] || it.quality} · 耐久 ${Math.ceil(it.dur)}/${Math.ceil(it.maxDur)}`;
  return `
    <div class="ic-main">
      <div class="ic-icon ${isGun ? 'ic-gun' : it.slot === 'head' ? 'ic-helm' : 'ic-vest'}" style="--qc:${qc.color};border-color:${qc.color}66">${icon}</div>
      <div class="ic-info">
        <div class="ic-type">${type}</div>
        <div class="ic-name" title="${escapeHTML(name)}" style="color:${qc.color}">${escapeHTML(name)}</div>
        ${isGun ? '' : `<div class="ic-dur"><div style="width:${pct * 100}%;background:${pct > 0.3 ? '#7ec97e' : '#e0713c'}"></div></div>`}
        <div class="ic-sub">${escapeHTML(sub)}${it.equipped ? ' · <span class="ic-state">已装备</span>' : ''}</div>
        ${affixLines(it)}
      </div>
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
  document.getElementById('tabEquip').setAttribute('aria-selected', String(tab === 'equip'));
  document.getElementById('tabShop').setAttribute('aria-selected', String(tab === 'shop'));
  document.getElementById('pageEquip').style.display = tab === 'equip' ? '' : 'none';
  document.getElementById('pageShop').style.display = tab === 'shop' ? '' : 'none';
  if (tab === 'equip') renderEquip(inv); else renderShop(inv);
}

// ---- 装备页 ----
function renderEquip(inv) {
  const gi = gunInfo();
  document.getElementById('eqGun1').innerHTML = `<span class="eq-k ${gi.weapon === 'rifle' ? 'on' : ''}">${escapeHTML(gi.main)}</span><span class="eq-t">主武器</span>`;
  document.getElementById('eqGun2').innerHTML = `<span class="eq-k ${gi.weapon === 'pistol' ? 'on' : ''}">手枪</span><span class="eq-t">副武器</span>`;

  for (const slot of ['head', 'body']) {
    const el = document.getElementById('eq' + slot);
    const it = invEquipped(slot);
    el.dataset.slot = slot;
    el.style.setProperty('--qc', it ? q(it).color : 'transparent');
    el.classList.toggle('filled', !!it);
    el.innerHTML = it
      ? cardHtml(it) + '<button class="eq-x" title="脱下放回背包">卸下</button>'
      : `<div class="eq-empty">${SLABEL[slot]}<span>拖入穿戴 / 点背包里的「穿」</span></div>`;
    wireDrag(el, it, 'eq', () => render());
    if (it) {
      el.querySelector('.eq-x').onclick = (e) => {
        e.stopPropagation();
        if (invIsFull()) { toast('背包已满,先分解或突破腾格子'); return; }
        invSetEquipped(it.id, false);
        toast(`已脱下${SLABEL[slot]}`);
        onChanged && onChanged();
        render();
      };
    }
  }

  const grids = {
    head: document.getElementById('bagHead'),
    body: document.getElementById('bagBody'),
    gun: document.getElementById('bagGun'),
  };
  for (const grid of Object.values(grids)) grid.innerHTML = '';

  const bag = inv.items.filter((it) => !it.equipped);
  const categoryCounts = {
    head: bag.filter((it) => it.slot === 'head').length,
    body: bag.filter((it) => it.slot === 'body').length,
    gun: bag.filter((it) => it.slot === 'gun').length,
  };
  const filterCounts = {
    all: bag.length,
    head: categoryCounts.head,
    body: categoryCounts.body,
    gun: categoryCounts.gun,
  };
  for (const [key, id] of Object.entries({
    all: 'bpFilterAllCount', head: 'bpFilterHeadCount',
    body: 'bpFilterBodyCount', gun: 'bpFilterGunCount',
  })) {
    const node = document.getElementById(id);
    if (node) node.textContent = filterCounts[key];
  }
  const resultCount = document.getElementById('bpResultCount');
  const searchInput = document.getElementById('bpSearch');
  const query = (searchInput?.value || '').trim().toLocaleLowerCase('zh-CN');
  const qualityRank = { broken: 0, normal: 1, fine: 2, rare: 3, epic: 4, legendary: 5 };
  const itemName = (it) => it.slot === 'gun'
    ? `${it.gunName || '武器'}词条`
    : itemTitle(it.affixes || [], SLABEL[it.slot] || it.slot);
  const searchableText = (it) => [
    itemName(it), it.gunName || '', QLABEL[it.quality] || it.quality || '',
    SLABEL[it.slot] || it.slot || '',
    ...(it.affixes || []).flatMap((a) => {
      const def = AFFIX_BY_ID[a.id];
      return def ? [def.label, def.fmt(a.v)] : [a.id, String(a.v)];
    }),
  ].join(' ').toLocaleLowerCase('zh-CN');

  let visibleItems = bag.filter((it) => {
    const typeMatches = inventoryFilter === 'all' || it.slot === inventoryFilter;
    const textMatches = !query || searchableText(it).includes(query);
    return typeMatches && textMatches;
  });
  visibleItems.sort((a, b) => {
    if (inventorySort === 'name') {
      return itemName(a).localeCompare(itemName(b), 'zh-CN');
    }
    if (inventorySort === 'durability') {
      // 装备耐久从低到高，方便优先找到需要维修的物品；武器词条材料放在最后。
      if (a.slot === 'gun' && b.slot !== 'gun') return 1;
      if (b.slot === 'gun' && a.slot !== 'gun') return -1;
      return durPct(a) - durPct(b);
    }
    return (qualityRank[b.quality] ?? -1) - (qualityRank[a.quality] ?? -1)
      || itemName(a).localeCompare(itemName(b), 'zh-CN');
  });
  if (resultCount) resultCount.textContent = String(visibleItems.length);

  document.querySelectorAll('[data-bp-filter]').forEach((button) => {
    const active = button.dataset.bpFilter === inventoryFilter;
    button.classList.toggle('on', active);
    button.setAttribute('aria-pressed', String(active));
  });
  // 只展示确实有匹配物品的分类；搜索结果为空时展示统一空状态，
  // 避免库存中其他分类残留“该分类暂无符合条件的物资”的占位卡。
  const visibleBySlot = Object.fromEntries(
    ['head', 'body', 'gun'].map((slot) => [
      slot,
      visibleItems.filter((it) => it.slot === slot),
    ]),
  );
  document.querySelectorAll('.bp-cat-section').forEach((section) => {
    const category = section.dataset.category;
    section.hidden = !(visibleBySlot[category]?.length);
  });

  const emptyResult = document.getElementById('bpNoResults');
  if (emptyResult) {
    emptyResult.hidden = visibleItems.length > 0;
    emptyResult.textContent = bag.length === 0
      ? '物资仓库暂无库存。搜刮敌人尸体，或前往改装工坊开启补给箱。'
      : '没有找到符合条件的物资。请尝试其他关键词或筛选条件。';
  }

  // 分类标题中的数字始终显示该分类的实际库存数，不随搜索结果变化。
  document.querySelectorAll('#pageEquip .bp-cat').forEach((el, i) => {
    const key = ['head', 'body', 'gun'][i];
    const label = ['头盔', '防弹衣', '武器词条'][i];
    if (key) el.innerHTML = `${label}<span class="bp-cat-count">${categoryCounts[key]}</span>`;
  });

  for (const slot of ['head', 'body', 'gun']) {
    const categoryItems = visibleBySlot[slot];
    if (!categoryItems.length) continue;
    for (const it of categoryItems) {
      const card = document.createElement('div');
      card.className = 'ic-card';
      card.style.setProperty('--qc', q(it).color);
      card.style.borderColor = q(it).color + '77';
      // 快捷操作：穿戴/吸取/分解；拖拽作为另一条操作路径保留。
      const canWear = it.slot !== 'gun';
      const canSuck = !!(it.affixes || []).length && (it.slot === 'gun' || invEquipped(it.slot));
      card.innerHTML = cardHtml(it) + `
        <div class="ic-ops">
          ${canWear ? '<button class="op-wear" title="换上这件，原装备自动回背包">穿戴</button>' : ''}
          <button class="op-suck" ${canSuck ? '' : 'disabled'} title="把这件的词条合并进你装备中的${it.slot === 'gun' ? '主武器' : SLABEL[it.slot]}，然后这件消失">吸取</button>
          <button class="op-cut" title="分解成金币">分解</button>
        </div>`;
      card.querySelector('.op-wear')?.addEventListener('click', (e) => {
        e.stopPropagation();
        invSetEquipped(it.id, true);
        toast(`已换上${SLABEL[it.slot] || '装备'}，原装备回背包`);
        onChanged && onChanged();
        render();
      });
      card.querySelector('.op-suck')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = invAbsorb(it.id);
        toast(r.msg);
        if (r.ok) onChanged && onChanged();
        render();
      });
      const cutBtn = card.querySelector('.op-cut');
      cutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        twoStepConfirm(cutBtn, () => {
          const r = invDecompose(it.id);
          toast(r.msg);
          onChanged && onChanged();
          render();
        });
      });
      // 普通点击进入工坊查看详情；快捷按钮操作不会触发跳转。
      card.addEventListener('click', (e) => {
        if (!lastClickWasPlain) return;
        if (e.target.closest('.ic-ops') || e.target.closest('.ic-drop')) return;
        tab = 'shop';
        shopSelId = it.id;
        render();
      });
      wireDrag(card, it, 'bag', () => render());
      grids[slot].appendChild(card);
    }
  }
}

// 两步确认(防手滑):第一次点变色"确认?",1.6s 内再点才执行
function twoStepConfirm(btn, fire) {
  if (btn.dataset.armed) {
    delete btn.dataset.armed;
    fire();
  } else {
    btn.dataset.armed = '1';
    const old = btn.textContent;
    btn.textContent = '确认?';
    btn.style.borderColor = '#e0713c';
    btn.style.color = '#ff9a6c';
    setTimeout(() => {
      if (btn.isConnected && btn.dataset.armed) {
        delete btn.dataset.armed;
        btn.textContent = old;
        btn.style.borderColor = '';
        btn.style.color = '';
      }
    }, 1600);
  }
}

// ---- 指针拖拽( Pointer Events,鼠标/触屏通吃)----
let drag = null; // { item, from, ghost, sx, sy, moved }
let lastClickWasPlain = false; // 最近一次 pointerup 是"没挪动的纯点击"(click 跳工坊用)
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
  lastClickWasPlain = !d.moved; // 纯点击:随后的 click 事件据此决定要不要跳工坊
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
  const selItem = invItemSafe(shopSelId);
  for (const it of items) {
    const chip = document.createElement('button');
    chip.className = 'shop-chip' + (it.id === shopSelId ? ' sel' : '');
    chip.style.borderColor = q(it).color + (it.id === shopSelId ? '' : '55');
    if (it.id === shopSelId) chip.style.boxShadow = `0 0 8px ${q(it).color}66`;
    chip.textContent = `${itemTitle(it.affixes || [], SLABEL[it.slot])}${it.equipped ? ' ·装备中' : ''}`;
    // 突破选材模式:只有与"基准件"同槽同品质的可选,其余灰掉(以前全部能点,选完才报错)
    if (combineMode && selItem) {
      const ok = it.slot === selItem.slot && it.quality === selItem.quality && !it.equipped;
      chip.style.opacity = ok || sel.has(it.id) ? '' : '0.28';
      if (!ok && !sel.has(it.id)) chip.disabled = true;
    }
    chip.onclick = () => {
      if (combineMode) { toggleCombinePick(it.id); }
      else { shopSelId = it.id; }
      render();
    };
    if (combineMode && sel.has(it.id)) chip.classList.add('picked');
    list.appendChild(chip);
  }
  if (combineMode) {
    const hint = document.createElement('div');
    hint.className = 'shop-hint';
    hint.textContent = `挑选素材:${sel.size}/3 —— 只有点亮的(同种类同品质)可选`;
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
    // 每个操作一行:名称 + 一句话人话说明 + 右侧费用按钮(不再是一排长标签按钮)
    detail.innerHTML = `
      <div class="ic-card static" style="border-color:${qc.color}88">${cardHtml(it)}</div>
      ${it.slot === 'gun' ? '' : `
      <div class="op-row">
        <div class="op-main"><div class="op-name">🔧 修复</div><div class="op-desc">补满耐久,1 金币 1 点 —— 耐久归零的护甲不再挡子弹,记得修</div></div>
        <button class="op-go plain" id="opRepair" ${rc === 0 ? 'disabled' : ''}>${rc === 0 ? '无需修复' : `修 · ${rc} 金`}</button>
      </div>`}
      <div class="op-row">
        <div class="op-main"><div class="op-name">⬆ 强化</div><div class="op-desc">品质直接升一档(耐久上限跟着涨),有成功率,失败金币不退${ur !== undefined ? ` —— 当前 ${Math.round(ur * 100)}%` : ''}</div></div>
        <button class="op-go" id="opUpgrade" ${uc === undefined ? 'disabled' : ''}>${uc === undefined ? '已到顶' : `升到${QLABEL[nextQuality(it.quality)] || 'MAX'} · ${uc} 金`}</button>
      </div>
      ${it.slot === 'gun' ? '' : `
      <div class="op-row">
        <div class="op-main"><div class="op-name">🔨 锻造</div><div class="op-desc">耐久上限 ×1.5,可以重复锻 —— 想要打不烂的甲就靠它</div></div>
        <button class="op-go plain" id="opForge">锻 · 25 金</button>
      </div>`}
      <div class="op-row">
        <div class="op-main"><div class="op-name">✨ 吸取词条</div><div class="op-desc">把这件的词条合并进${it.slot === 'gun' ? '主武器' : `你装备中的${SLABEL[it.slot]}`}(同词条数值相加),然后这件消失</div></div>
        <button class="op-go plain" id="opAbsorb" ${canAbsorb ? '' : 'disabled'}>${canAbsorb ? '吸取' : (it.equipped ? '装备中不可' : '先穿一件')}</button>
      </div>
      <div class="op-row" style="border-color:${combineMode ? 'var(--amber-2)' : 'var(--line)'}">
        <div class="op-main"><div class="op-name">⚡ 突破</div><div class="op-desc">3 件同种类同品质合成 1 件:词条取三件中最强的。${BT_DESC[it.quality] || ''}</div></div>
        <button class="op-go" id="opBreak">${combineMode ? '选材中…' : '挑素材'}</button>
      </div>
      ${combineMode ? `
      <div class="bt-bar">
        <span class="bt-n">素材 ${sel.size}/3 ${sel.size === 3 ? '· 可以突破了!' : '· 在上面列表点选'}</span>
        <button class="op-go" id="btCancel" style="background:none;color:var(--text-dim);border:1px solid var(--line)">取消</button>
        <button class="op-go" id="btGo" ${sel.size === 3 ? '' : 'disabled'}>⚡ 突破!</button>
      </div>` : ''}`;
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
        combineMode = true;
        sel.clear();
        render();
      };
      if (combineMode) {
        detail.querySelector('#btCancel').onclick = () => { combineMode = false; sel.clear(); render(); };
        detail.querySelector('#btGo').onclick = () => {
          const r = invBreakthrough([...sel]);
          toast(r.msg);
          if (r.ok) { combineMode = false; sel.clear(); shopSelId = r.item.id; onChanged && onChanged(); }
          render();
        };
      }
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
  document.getElementById('bpSearch')?.addEventListener('input', () => render());
  document.getElementById('bpSort')?.addEventListener('change', (e) => {
    inventorySort = e.target.value || 'quality';
    render();
  });
  document.querySelectorAll('[data-bp-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      inventoryFilter = button.dataset.bpFilter || 'all';
      render();
    });
  });
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


