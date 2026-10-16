// 尸体搜索(暗黑式搜尸):玩家站在尸体上按 Tab 打开敌人的装备栏,
// 逐件拿走 武器词条/头盔/护甲 进背包 —— 它们是 吸取/突破/分解 的原料,也可直接穿戴。
// 拿走即从尸体战利品表里标记;尸体消失或走远自动关面板。
import { invIsFull, invAddItem } from '../domain/inventory.js';
import { AFFIX_BY_ID } from '../domain/affixes.js';
import { QUALITY } from '../domain/gunPresets.js';
import { beep } from '../systems/audio.js';

const QLABEL = { broken: '破损', normal: '普通', fine: '优良', rare: '稀有', epic: '高级', legendary: '传说' };
const ROW_LABEL = { gun: '武器词条', head: '头盔', body: '护甲' };

let open = false;
let target = null;   // 敌人实例({ loot, lootTaken })
let onChanged = null; // game.js 注入:背包变动后同步玩家属性/主武器词条

export function corpseIsOpen() { return open; }
export function corpseInit(cb) { onChanged = cb; }
export function openCorpse(enemy) {
  if (!enemy || !enemy.loot) return;
  target = enemy;
  open = true;
  render();
  beep(320, 520, 0.08, 'square', 0.04);
}
export function closeCorpse() {
  if (!open) return;
  open = false;
  target = null;
  render();
}

function affixLines(affixes) {
  return (affixes || []).map((a) => {
    const def = AFFIX_BY_ID[a.id];
    return def ? `<div class="cp-aff">${def.label} · ${def.fmt(a.v)}</div>` : '';
  }).join('');
}

function render() {
  const el = document.getElementById('corpse');
  if (!el) return;
  if (!open || !target) { el.style.display = 'none'; return; }
  const { loot, lootTaken } = target;
  const q = QUALITY[loot.gun.quality] || { color: '#aab0b8', label: loot.gun.quality };
  el.style.display = 'flex';
  const rows = ['gun', 'head', 'body'].map((k) => {
    const it = loot[k];
    const taken = lootTaken[k];
    const qc = QUALITY[it.quality]?.color || '#aab0b8';
    const name = k === 'gun' ? `${it.name} 的词条` : `${QLABEL[it.quality] || it.quality}${ROW_LABEL[k]}`;
    return `
      <div class="cp-row ${taken ? 'taken' : ''}" style="border-color:${qc}55">
        <div class="cp-info">
          <div class="cp-name" style="color:${qc}">${name}${taken ? '<span class="cp-done">已拿走</span>' : ''}</div>
          ${affixLines(it.affixes)}
        </div>
        ${taken ? '' : `<button class="cp-take" data-k="${k}">拿走</button>`}
      </div>`;
  }).join('');
  el.innerHTML = `
    <div class="cp-card">
      <div class="cp-head"><span>🔍 搜索敌尸</span><button id="cpClose">✕</button></div>
      <div class="cp-rows">${rows}</div>
      <div class="cp-hint">Tab / Esc 关闭 · 拿走的装备进背包:可直接穿戴,或作为 吸取词条 / 突破 / 分解 的原料</div>
    </div>`;
  el.querySelector('#cpClose').onclick = closeCorpse;
  el.querySelectorAll('.cp-take').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.k;
      if (lootTaken[k]) return;
      if (invIsFull()) { beep(240, 160, 0.12, 'square', 0.05); toastMsg('背包已满!先分解或突破腾格子'); return; }
      const it = loot[k];
      invAddItem(k, it.quality, undefined, it.affixes.map((a) => ({ ...a })), k === 'gun' ? { gunName: it.name } : undefined);
      lootTaken[k] = true;
      beep(520, 880, 0.08, 'square', 0.05);
      onChanged && onChanged();
      render();
    };
  });
}

function toastMsg(msg) {
  const el = document.getElementById('cpToast');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = 1;
  clearTimeout(toastMsg._t);
  toastMsg._t = setTimeout(() => (el.style.opacity = 0), 1800);
}
