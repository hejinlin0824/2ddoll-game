// 程序化角色外观：不依赖图片素材，颜色/发型/脸型全部叠加在现有主动布娃娃骨架上。
// 当前外观档案保存程序化装备结构与配色；旧 contra-skin 位图系统已从 dev 移除。
const KEY = 'contra-appearance-v1';
const DEFAULTS = Object.freeze({
  hairStyle: 'short', hairColor: '#202733', faceShape: 'oval', kitStyle: 'plate', helmetStyle: 'highcut', eyewear: 'goggles', pads: 'full', backpack: 'assault', armorColor: '#263744',
  skinTone: '#c89572', eyeColor: '#67c9ff',
  shirtColor: '#35495b', pantsColor: '#34465a', bootColor: '#1b222b',
  bandanaColor: '#d96b3b', headwear: 'bandana', accentColor: '#d99447',
});
const HAIR = new Set(['short', 'buzz', 'ponytail', 'bun', 'long', 'spiky', 'undercut']);
const FACE = new Set(['round', 'oval', 'angular']);
const HEADWEAR = new Set(['none', 'bandana', 'headset']);
const KIT = new Set(['plate', 'chest', 'slick']);
const HELMET = new Set(['highcut', 'full', 'cap', 'none']);
const EYEWEAR = new Set(['goggles', 'clear', 'none']);
const PADS = new Set(['full', 'knees', 'none']);
const PACK = new Set(['assault', 'radio', 'none']);
const HEX = /^#[0-9a-f]{6}$/i;
let rawCache = undefined;
let valueCache = { ...DEFAULTS };
let revision = 0;
function safeHex(value, fallback) { return typeof value === 'string' && HEX.test(value) ? value : fallback; }
export function loadAppearance() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* private mode */ }
  if (raw === rawCache) return valueCache;
  rawCache = raw;
  let input = {};
  try { input = JSON.parse(raw || '{}') || {}; } catch { input = {}; }
  valueCache = {
    hairStyle: HAIR.has(input.hairStyle) ? input.hairStyle : DEFAULTS.hairStyle,
    hairColor: safeHex(input.hairColor, DEFAULTS.hairColor),
    faceShape: FACE.has(input.faceShape) ? input.faceShape : DEFAULTS.faceShape,
    skinTone: safeHex(input.skinTone, DEFAULTS.skinTone),
    eyeColor: safeHex(input.eyeColor, DEFAULTS.eyeColor),
    shirtColor: safeHex(input.shirtColor, DEFAULTS.shirtColor),
    pantsColor: safeHex(input.pantsColor, DEFAULTS.pantsColor),
    bootColor: safeHex(input.bootColor, DEFAULTS.bootColor),
    bandanaColor: safeHex(input.bandanaColor, DEFAULTS.bandanaColor),
    headwear: HEADWEAR.has(input.headwear) ? input.headwear : DEFAULTS.headwear,
    kitStyle: KIT.has(input.kitStyle) ? input.kitStyle : DEFAULTS.kitStyle,
    helmetStyle: HELMET.has(input.helmetStyle) ? input.helmetStyle : DEFAULTS.helmetStyle,
    eyewear: EYEWEAR.has(input.eyewear) ? input.eyewear : DEFAULTS.eyewear,
    pads: PADS.has(input.pads) ? input.pads : DEFAULTS.pads,
    backpack: PACK.has(input.backpack) ? input.backpack : DEFAULTS.backpack,
    armorColor: safeHex(input.armorColor, DEFAULTS.armorColor),
    accentColor: safeHex(input.accentColor, DEFAULTS.accentColor),
  };
  return valueCache;
}
export function saveAppearance(value) {
  const next = { ...DEFAULTS, ...(value || {}) };
  // Reuse loader normalization by round-tripping through the same persisted format.
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    rawCache = undefined;
    valueCache = loadAppearance();
    revision++;
    return true;
  } catch { return false; }
}
export function clearAppearance() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  rawCache = undefined; valueCache = { ...DEFAULTS }; revision++;
}
export function appearanceRevision() { return revision; }
window.addEventListener('storage', (e) => {
  if (e.key === KEY || e.key === null) { rawCache = undefined; revision++; }
});

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * amount)));
  return '#' + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function appearancePalette(a = loadAppearance()) {
  return {
    skin: a.skinTone, skinDark: shade(a.skinTone, 0.70),
    shirt: a.shirtColor, shirtDark: shade(a.shirtColor, 0.72),
    pants: a.pantsColor, pantsDark: shade(a.pantsColor, 0.72),
    boot: a.bootColor, bootDark: shade(a.bootColor, 0.70),
    bandana: a.bandanaColor, bandanaDark: shade(a.bandanaColor, 0.72),
    wood: a.accentColor,
    armor: a.armorColor || '#263744', armorDark: shade(a.armorColor || '#263744', 0.62), armorHi: shade(a.armorColor || '#263744', 1.38),
  };
}
export { DEFAULTS as DEFAULT_APPEARANCE, KEY as APPEARANCE_STORAGE_KEY };
