// HERO Character Lab — 轻量外观工坊。程序化外观与旧版自绘部件分离，保留 contra-skin 存档。
import {
  SKIN_PARTS, SKIN_LABEL, SKIN_BOX, SKIN_END_ANCHORED, skinFitScale, loadSkin, saveSkin, clearSkin, processSkinImage, orientSkinImage,
} from '../game/domain/skin.js';
import { RIG_DIMS, RIG_ANCHORS, DEFAULT_RIG_POSE, segmentCenterFromCanvasTop, segmentTipFromCanvasTop } from '../game/domain/rigGeometry.js';
import { loadAppearance, saveAppearance, clearAppearance, DEFAULT_APPEARANCE } from '../game/domain/appearance.js';

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// Appearance settings retain the same storage schema used by Player rendering.
const APP_DRAFT_KEY = 'contra-appearance-draft-v2';
const APP_PROFILE_KEY = 'contra-appearance-profiles-v1';
const appPanel = $('appearancePanel');
const appPreview = $('appearancePreview');
const appCtx = appPreview?.getContext('2d');
const appInputs = [...(appPanel?.querySelectorAll('[data-app]') || [])];
const COLORS = {
  hairColor: ['#202733','#35271f','#604330','#ad8660','#d5c6a7','#a45a62','#637eaa','#ece6dc'],
  skinTone: ['#f0cfb2','#d9a781','#c89572','#a66f50','#764a35','#4d332b'],
  eyeColor: ['#67c9ff','#438e78','#8ea9ff','#7b573d','#b65b48','#252b32'],
  shirtColor: ['#35495b','#263b2f','#60513a','#2e3138','#554257','#8d3f38','#c2c8c7','#d0b887'],
  pantsColor: ['#34465a','#2c3a2b','#6b5c41','#232a32','#51424c','#b2a68c'],
  bootColor: ['#1b222b','#3e352c','#5a4a34','#313c41','#a89b84'],
  bandanaColor: ['#d96b3b','#34465a','#263b2f','#9e3740','#d0b887','#252b32'],
  accentColor: ['#d99447','#5db8d3','#7dbf78','#d95c54','#cf69b5','#e4dfd0','#252b32'],
};
const PROFILES = {
  recon: { hairStyle:'undercut', hairColor:'#202733', faceShape:'angular', skinTone:'#c89572', eyeColor:'#67c9ff', shirtColor:'#263b2f', pantsColor:'#2c3a2b', bootColor:'#1b222b', bandanaColor:'#34465a', headwear:'headset', accentColor:'#d99447' },
  urban: { hairStyle:'short', hairColor:'#35271f', faceShape:'oval', skinTone:'#d9a781', eyeColor:'#438e78', shirtColor:'#2e3138', pantsColor:'#34465a', bootColor:'#1b222b', bandanaColor:'#252b32', headwear:'headset', accentColor:'#5db8d3' },
  desert: { hairStyle:'buzz', hairColor:'#604330', faceShape:'angular', skinTone:'#a66f50', eyeColor:'#7b573d', shirtColor:'#60513a', pantsColor:'#6b5c41', bootColor:'#5a4a34', bandanaColor:'#d96b3b', headwear:'bandana', accentColor:'#d99447' },
  jungle: { hairStyle:'ponytail', hairColor:'#202733', faceShape:'oval', skinTone:'#c89572', eyeColor:'#438e78', shirtColor:'#263b2f', pantsColor:'#2c3a2b', bootColor:'#313c41', bandanaColor:'#263b2f', headwear:'bandana', accentColor:'#7dbf78' },
  night: { hairStyle:'short', hairColor:'#202733', faceShape:'round', skinTone:'#d9a781', eyeColor:'#67c9ff', shirtColor:'#35495b', pantsColor:'#232a32', bootColor:'#1b222b', bandanaColor:'#34465a', headwear:'none', accentColor:'#d99447' },
};
const deepCopy = (o) => JSON.parse(JSON.stringify(o));
function readAppForm() {
  const out = {};
  for (const el of appInputs) out[el.dataset.app] = el.value;
  return { ...DEFAULT_APPEARANCE, ...out };
}
function setAppForm(data) {
  const next = { ...DEFAULT_APPEARANCE, ...(data || {}) };
  for (const el of appInputs) if (next[el.dataset.app] != null) el.value = next[el.dataset.app];
  updateAppearanceUi();
}
function syncAppearanceChoices() {
  const a = readAppForm();
  document.querySelectorAll('[data-app-choice]').forEach((el) => {
    const selected = a[el.dataset.appChoice] === el.dataset.value;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  document.querySelectorAll('[data-app-color][data-color]').forEach((el) => {
    const active = (a[el.dataset.appColor] || '').toLowerCase() === el.dataset.color.toLowerCase();
    el.classList.toggle('selected', active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-slot-label]').forEach((el) => {
    const p = readAppProfiles()[el.dataset.slotLabel];
    el.textContent = p ? (p.name || '已保存') : '空槽';
  });
  const currentPreset = Object.entries(PROFILES).find(([, p]) => Object.keys(p).every((k) => p[k] === a[k]))?.[0];
  document.querySelectorAll('[data-app-profile]').forEach((el) => el.classList.toggle('selected', el.dataset.appProfile === currentPreset));
}
function saveAppearanceDraft() {
  try { localStorage.setItem(APP_DRAFT_KEY, JSON.stringify(readAppForm())); } catch { /* private mode */ }
}
function updateAppearanceUi() {
  syncAppearanceChoices();
  drawAppearancePreview();
  saveAppearanceDraft();
  setAppearanceStageStatus('预览已更新 · 尚未应用', 'draft');
}
function setAppearanceStageStatus(label, state = 'saved') {
  const el = $('appearanceStageStatus');
  if (!el) return;
  el.dataset.state = state;
  const text = el.querySelector('span');
  if (text) text.textContent = label;
}
function rr(c, x, y, w, h, r, color) {
  c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}
function drawAppearancePreview() {
  if (!appCtx || !appPreview) return;
  const a = readAppForm(), c = appCtx;
  const W = appPreview.width, H = appPreview.height;
  c.clearRect(0, 0, W, H);
  c.save(); c.scale(W / 420, H / 600);

  // Hangar-like character presentation stage, deliberately asset-free.
  const bg = c.createLinearGradient(0, 0, 0, 600);
  bg.addColorStop(0, '#122435'); bg.addColorStop(.48, '#0a1723'); bg.addColorStop(1, '#060b12');
  c.fillStyle = bg; c.fillRect(0, 0, 420, 600);
  const glow = c.createRadialGradient(218, 270, 8, 218, 270, 250);
  glow.addColorStop(0, 'rgba(105,146,174,.22)'); glow.addColorStop(.58, 'rgba(64,99,126,.07)'); glow.addColorStop(1, 'rgba(4,9,15,0)');
  c.fillStyle = glow; c.fillRect(0, 0, 420, 600);
  c.strokeStyle = 'rgba(126,171,205,.065)'; c.lineWidth = 1;
  for (let x = 20; x < 420; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 600); c.stroke(); }
  for (let y = 24; y < 600; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(420, y); c.stroke(); }
  c.fillStyle = 'rgba(4,9,15,.38)';
  c.beginPath(); c.moveTo(0,0); c.lineTo(72,0); c.lineTo(101,445); c.lineTo(0,485); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(420,0); c.lineTo(356,0); c.lineTo(330,440); c.lineTo(420,485); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,177,74,.16)'; c.fillRect(24,66,45,2); c.fillRect(351,66,45,2);
  c.strokeStyle = 'rgba(129,168,198,.15)'; c.beginPath(); c.moveTo(0,482); c.lineTo(420,482); c.moveTo(0,510); c.lineTo(420,510); c.moveTo(40,600); c.lineTo(154,482); c.moveTo(380,600); c.lineTo(276,482); c.stroke();
  const floor = c.createLinearGradient(0,482,0,600); floor.addColorStop(0,'rgba(24,40,53,.65)'); floor.addColorStop(1,'rgba(5,10,16,.95)');
  c.fillStyle=floor; c.fillRect(0,482,420,118);
  c.strokeStyle='rgba(255,177,74,.24)'; c.beginPath(); c.moveTo(22,512); c.lineTo(398,512); c.stroke();
  c.fillStyle='rgba(255,177,74,.10)'; c.fillRect(29,519,48,2); c.fillRect(343,519,48,2);
  c.strokeStyle='rgba(127,178,255,.10)';
  for(const r of [86,118,151]){c.beginPath();c.ellipse(218,280,r*.66,r,0,0,Math.PI*2);c.stroke();}
  c.setLineDash([3,7]); c.strokeStyle='rgba(255,177,74,.19)'; c.beginPath(); c.moveTo(218,80); c.lineTo(218,501); c.stroke(); c.setLineDash([]);

  const box=(x,y,w,h,r,fill,stroke,lw=1)=>{
    c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}
    if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}
  };
  const path=(fn,fill,stroke='#101923',lw=3)=>{
    c.beginPath();fn();c.fillStyle=fill;c.fill();
    if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.lineJoin='round';c.lineCap='round';c.stroke();}
  };
  const line=(x1,y1,x2,y2,color,width=1)=>{
    c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();
  };
  const stroke=(fn,color,width)=>{
    c.beginPath();fn();c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();
  };
  const apparel=(base,x1=165,x2=250)=>{
    const g=c.createLinearGradient(x1,0,x2,0);
    g.addColorStop(0,'rgba(0,0,0,.30)');g.addColorStop(.42,base);g.addColorStop(.72,'rgba(255,255,255,.10)');g.addColorStop(1,'rgba(0,0,0,.23)');return g;
  };
  const pants=apparel(a.pantsColor,164,247), shirt=apparel(a.shirtColor,172,244);
  const skin=c.createLinearGradient(197,0,247,0);
  skin.addColorStop(0,'rgba(35,17,11,.30)');skin.addColorStop(.42,a.skinTone);skin.addColorStop(.70,'rgba(255,226,194,.20)');skin.addColorStop(1,'rgba(46,24,16,.26)');
  const dark='#0a121a', plate='#273744', plateHi='#3b4e5c';

  // Ground contact and far leg.
  c.fillStyle='rgba(0,0,0,.46)';c.beginPath();c.ellipse(218,507,82,12,0,0,Math.PI*2);c.fill();
  path(()=>{c.moveTo(183,326);c.quadraticCurveTo(200,329,211,344);c.lineTo(201,386);c.quadraticCurveTo(190,419,198,478);c.lineTo(180,488);c.quadraticCurveTo(169,449,174,416);c.lineTo(166,369);c.closePath();},pants,dark,4);
  path(()=>{c.moveTo(207,329);c.quadraticCurveTo(226,330,235,350);c.lineTo(239,386);c.quadraticCurveTo(235,415,239,475);c.lineTo(218,486);c.quadraticCurveTo(210,442,211,415);c.lineTo(198,369);c.closePath();},pants,dark,4);
  // Utility pockets, knee pads, gaiters, treaded boots.
  box(169,381,25,30,3,'#293b4a',dark,2);box(216,379,25,31,3,'#324452',dark,2);
  line(173,388,190,388,'rgba(213,226,235,.25)',1.2);line(220,387,237,387,'rgba(213,226,235,.26)',1.2);
  line(181,395,181,405,'rgba(4,9,14,.5)',1);line(228,394,228,405,'rgba(4,9,14,.5)',1);
  box(169,420,22,22,5,'#1a2835',dark,2);box(211,421,24,24,5,'#192734',dark,2);
  line(172,425,188,425,'rgba(255,255,255,.13)',1);line(214,426,232,426,'rgba(255,255,255,.14)',1);
  box(177,467,23,22,4,'#17232e',dark,3);box(218,466,25,23,4,'#17232e',dark,3);
  path(()=>{c.moveTo(169,484);c.lineTo(197,481);c.lineTo(208,491);c.lineTo(206,501);c.lineTo(169,501);c.lineTo(163,496);c.closePath();},'#253541','#080f16',3);
  path(()=>{c.moveTo(215,483);c.lineTo(240,481);c.lineTo(258,491);c.lineTo(259,501);c.lineTo(216,501);c.lineTo(209,496);c.closePath();},'#293a47','#080f16',3);
  line(165,500,207,500,'#080d12',3);line(211,500,260,500,'#080d12',3);
  for(let i=0;i<3;i++){line(178+i*5,488,182+i*5,492,'rgba(224,233,239,.55)',1.2);line(225+i*5,488,229+i*5,492,'rgba(224,233,239,.55)',1.2);}
  box(175,489,12,3,1,a.accentColor,null);box(226,489,13,3,1,a.accentColor,null);

  // Neck, combat shirt and layered plate carrier.
  box(201,177,23,31,5,skin,dark,2.5);
  path(()=>{c.moveTo(197,199);c.lineTo(218,197);c.quadraticCurveTo(235,202,241,220);c.lineTo(235,267);c.quadraticCurveTo(234,291,221,330);c.lineTo(183,331);c.quadraticCurveTo(176,300,174,274);c.lineTo(174,230);c.quadraticCurveTo(179,209,197,199);c.closePath();},shirt,dark,4);
  path(()=>{c.moveTo(184,208);c.lineTo(198,201);c.lineTo(213,207);c.lineTo(210,219);c.lineTo(193,223);c.lineTo(181,218);c.closePath();},'#3b4d5c',dark,2.5);
  path(()=>{c.moveTo(198,201);c.lineTo(214,202);c.lineTo(224,212);c.lineTo(215,219);c.lineTo(203,214);c.closePath();},'#222f3b',dark,2.5);
  line(191,208,204,216,'rgba(226,235,242,.27)',1.4);
  path(()=>{c.moveTo(190,216);c.lineTo(213,214);c.lineTo(229,225);c.lineTo(230,270);c.lineTo(218,292);c.lineTo(190,286);c.lineTo(183,263);c.closePath();},plate,dark,3);
  path(()=>{c.moveTo(194,220);c.lineTo(211,220);c.lineTo(223,230);c.lineTo(222,262);c.lineTo(213,276);c.lineTo(194,271);c.lineTo(189,247);c.closePath();},plateHi,'#172530',2);
  line(195,225,217,229,'rgba(231,239,245,.32)',1.4);line(193,233,222,236,'rgba(5,11,17,.7)',2);line(191,239,222,242,'rgba(5,11,17,.7)',2);
  for(let row=0;row<3;row++)for(let col=0;col<4;col++)box(194+col*6,231+row*6,3.4,2.2,1.1,'rgba(163,184,198,.52)',null);
  box(192,252,9,18,2,'#172632',dark,1.5);box(203,254,9,18,2,'#172632',dark,1.5);box(214,253,9,18,2,'#172632',dark,1.5);
  line(194,255,199,255,'rgba(255,255,255,.24)',1);line(205,257,210,257,'rgba(255,255,255,.24)',1);line(216,256,221,256,'rgba(255,255,255,.24)',1);
  box(179,279,17,20,3,'#263845',dark,2);box(181,282,13,4,1,a.accentColor,null);
  line(184,303,227,303,'rgba(8,13,19,.75)',4);
  path(()=>{c.moveTo(179,317);c.lineTo(224,317);c.lineTo(228,331);c.lineTo(183,335);c.closePath();},'#172631',dark,2.5);
  box(203,316,12,9,2,'#354857',dark,1.5);box(226,318,15,20,2,'#263745',dark,2);line(229,322,238,322,'rgba(255,255,255,.25)',1);

  // Rear arm and a neutral carbine silhouette to give the preview its field-ready pose.
  stroke(()=>{c.moveTo(188,216);c.quadraticCurveTo(179,231,192,247);c.lineTo(223,252);},dark,24);
  stroke(()=>{c.moveTo(188,216);c.quadraticCurveTo(179,231,192,247);c.lineTo(223,252);},a.shirtColor,18);
  path(()=>{c.moveTo(220,228);c.lineTo(231,224);c.lineTo(244,230);c.lineTo(241,240);c.lineTo(228,241);c.closePath();},'#222f3b','#090f16',2.5);
  box(235,225,51,13,3,'#303e4a','#090f16',2);box(242,222,30,4,1,'#202d38','#080e14',1.5);line(244,221,273,221,'#9aabb7',1);
  box(283,227,40,8,2,'#263641','#080e14',2);for(let i=0;i<5;i++)line(289+i*6,228,289+i*6,234,'rgba(182,198,208,.40)',1);
  box(320,229,25,3,1,'#121d27','#080e14',1);box(342,226,7,8,1,'#344654','#080e14',1.4);
  path(()=>{c.moveTo(254,237);c.lineTo(269,237);c.lineTo(273,254);c.lineTo(260,257);c.closePath();},'#1d2a35','#080e14',2);
  path(()=>{c.moveTo(241,236);c.lineTo(250,235);c.lineTo(250,242);c.lineTo(244,246);c.closePath();},'#273643','#080e14',2);
  stroke(()=>{c.moveTo(214,216);c.quadraticCurveTo(227,224,238,236);c.quadraticCurveTo(251,235,263,232);},dark,24);
  stroke(()=>{c.moveTo(214,216);c.quadraticCurveTo(227,224,238,236);c.quadraticCurveTo(251,235,263,232);},shirt,18);
  line(223,222,235,234,'rgba(232,239,244,.2)',2);box(256,226,15,12,3,'#273845','#0b141d',2);line(261,228,267,234,'rgba(222,232,239,.26)',1);
  box(229,231,12,10,3,'#425565','#111c26',1.5);line(231,234,238,237,'rgba(255,255,255,.24)',1);

  // Side-profile face. Facial shape and eye/hair colors follow the live customization fields.
  const hx=216,hy=151;
  if(a.hairStyle==='long')path(()=>{c.moveTo(hx-17,hy-15);c.quadraticCurveTo(hx-32,hy+1,hx-27,hy+34);c.lineTo(hx-15,hy+38);c.lineTo(hx-8,hy+7);c.closePath();},a.hairColor,dark,2);
  if(a.hairStyle==='ponytail')path(()=>{c.moveTo(hx-16,hy-14);c.quadraticCurveTo(hx-34,hy-2,hx-30,hy+10);c.quadraticCurveTo(hx-27,hy+17,hx-35,hy+28);c.quadraticCurveTo(hx-21,hy+25,hx-17,hy+13);c.closePath();},a.hairColor,dark,2);
  if(a.hairStyle==='bun'){c.fillStyle=a.hairColor;c.beginPath();c.ellipse(hx-8,hy-26,9,8,-.25,0,Math.PI*2);c.fill();c.strokeStyle=dark;c.lineWidth=2;c.stroke();}
  path(()=>{
    c.moveTo(hx-17,hy-21);
    if(a.faceShape==='angular'){c.lineTo(hx+4,hy-27);c.lineTo(hx+19,hy-18);c.lineTo(hx+24,hy-2);c.lineTo(hx+32,hy+6);c.lineTo(hx+25,hy+12);c.lineTo(hx+22,hy+24);c.lineTo(hx+5,hy+31);c.lineTo(hx-12,hy+22);c.lineTo(hx-19,hy+4);}
    else if(a.faceShape==='round'){c.bezierCurveTo(hx-3,hy-32,hx+17,hy-27,hx+23,hy-10);c.quadraticCurveTo(hx+28,hy+1,hx+33,hy+6);c.lineTo(hx+26,hy+12);c.quadraticCurveTo(hx+24,hy+28,hx+7,hy+30);c.quadraticCurveTo(hx-13,hy+27,hx-18,hy+8);}
    else{c.bezierCurveTo(hx-3,hy-32,hx+16,hy-28,hx+23,hy-12);c.lineTo(hx+32,hy+5);c.lineTo(hx+25,hy+11);c.quadraticCurveTo(hx+22,hy+26,hx+7,hy+29);c.quadraticCurveTo(hx-11,hy+25,hx-17,hy+8);}
    c.closePath();
  },skin,dark,3);
  c.fillStyle=a.skinTone;c.beginPath();c.ellipse(hx-12,hy+3,6,8,0,0,Math.PI*2);c.fill();c.strokeStyle='rgba(47,26,20,.55)';c.lineWidth=1.2;c.beginPath();c.arc(hx-13,hy+3,3,Math.PI*1.45,Math.PI*.55);c.stroke();
  line(hx+9,hy-4,hx+20,hy-4,'#38251f',2.2);
  c.fillStyle='#f0e8dc';c.beginPath();c.ellipse(hx+19,hy+1,5,3,0,0,Math.PI*2);c.fill();
  c.fillStyle=a.eyeColor;c.beginPath();c.arc(hx+21,hy+1,2.2,0,Math.PI*2);c.fill();c.fillStyle='#0a1118';c.beginPath();c.arc(hx+21.6,hy+1,1,0,Math.PI*2);c.fill();
  stroke(()=>{c.moveTo(hx+26,hy+3);c.lineTo(hx+29,hy+7);c.lineTo(hx+24,hy+8);},'rgba(70,38,28,.68)',1.2);line(hx+15,hy+17,hx+24,hy+17,'rgba(65,34,26,.6)',1.2);
  if(a.hairStyle==='spiky')path(()=>{c.moveTo(hx-21,hy-8);c.lineTo(hx-23,hy-27);c.lineTo(hx-10,hy-19);c.lineTo(hx-5,hy-35);c.lineTo(hx+5,hy-22);c.lineTo(hx+13,hy-29);c.lineTo(hx+21,hy-14);c.lineTo(hx+23,hy-8);c.closePath();},a.hairColor,dark,2.3);
  else path(()=>{c.moveTo(hx-21,hy-8);c.quadraticCurveTo(hx-27,hy-29,hx-7,hy-32);c.quadraticCurveTo(hx+11,hy-35,hx+22,hy-16);c.lineTo(hx+22,hy-10);c.lineTo(hx+10,hy-15);c.quadraticCurveTo(hx-5,hy-21,hx-21,hy-8);c.closePath();},a.hairColor,dark,2.3);
  if(a.hairStyle==='buzz'){c.fillStyle='rgba(255,255,255,.13)';c.beginPath();c.ellipse(hx+1,hy-25,15,4,0,0,Math.PI*2);c.fill();}
  if(a.hairStyle==='undercut'){box(hx-17,hy-5,8,23,2,'#303b45',dark,1.2);for(let y=hy;y<hy+13;y+=4)line(hx-16,y,hx-11,y,'rgba(217,230,239,.4)',.8);}
  if(a.headwear==='bandana'){
    path(()=>{c.moveTo(hx-22,hy-20);c.lineTo(hx+17,hy-24);c.lineTo(hx+23,hy-16);c.lineTo(hx-20,hy-12);c.closePath();},a.bandanaColor,'#121a22',2);
    line(hx-10,hy-17,hx+14,hy-20,'rgba(255,255,255,.22)',1);
    path(()=>{c.moveTo(hx-18,hy-13);c.quadraticCurveTo(hx-31,hy-8,hx-28,hy+5);c.lineTo(hx-23,hy+3);c.lineTo(hx-20,hy-5);c.closePath();},a.bandanaColor,'#121a22',1.5);
  }else if(a.headwear==='headset'){
    stroke(()=>{c.arc(hx-2,hy-3,25,Math.PI*1.02,Math.PI*1.86);},'#202d38',5);
    box(hx-24,hy-5,10,18,3,'#2d3d4b','#0b141d',2);box(hx-23,hy+1,8,7,2,a.accentColor,'#111c26',1);
    stroke(()=>{c.moveTo(hx-18,hy+9);c.quadraticCurveTo(hx-9,hy+16,hx-2,hy+12);},'#6c8293',1.4);
  }
  // Final silhouette anchors and clothing accents.
  line(182,223,189,246,'rgba(226,236,242,.18)',1.5);box(182,242,10,15,2,'#202f3b','#0b141d',1.5);line(184,246,190,246,'rgba(255,255,255,.2)',1);
  box(181,307,12,8,2,'#3a4e5d','#101820',1.2);box(185,335,9,13,2,'#1d2a35','#0a1119',1.5);box(224,339,9,13,2,'#1d2a35','#0a1119',1.5);
  c.strokeStyle='rgba(255,177,74,.55)';c.lineWidth=1;c.beginPath();c.moveTo(218,88);c.lineTo(218,102);c.moveTo(218,458);c.lineTo(218,472);c.moveTo(105,285);c.lineTo(117,285);c.moveTo(319,285);c.lineTo(331,285);c.stroke();
  c.restore();
}
function hairLabel(v) { return ({ short:'短发', buzz:'寸头', ponytail:'马尾', bun:'丸子头', long:'长发', spiky:'碎刺发', undercut:'侧剃' })[v] || '短发'; }
function faceLabel(v) { return ({ oval:'椭圆脸', round:'圆脸', angular:'棱角脸' })[v] || '椭圆脸'; }
function readAppProfiles() {
  try { const o = JSON.parse(localStorage.getItem(APP_PROFILE_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
  catch { return {}; }
}
function writeAppProfiles(o) { try { localStorage.setItem(APP_PROFILE_KEY, JSON.stringify(o)); return true; } catch { return false; } }
function applyProfile(name) { if (!PROFILES[name]) return; setAppForm(PROFILES[name]); toast(`已预览「${({recon:'夜幕侦察',urban:'城市行动',desert:'沙漠突击',jungle:'丛林潜入',night:'标准夜战'})[name]}」`); }

// Simple option buttons mirror the real fields; every selection immediately updates the character preview.
document.querySelectorAll('[data-app-choice]').forEach((el) => el.addEventListener('click', () => {
  const target = appInputs.find((input) => input.dataset.app === el.dataset.appChoice);
  if (!target) return; target.value = el.dataset.value; updateAppearanceUi();
}));
document.querySelectorAll('[data-app-profile]').forEach((el) => el.addEventListener('click', () => applyProfile(el.dataset.appProfile)));
document.querySelectorAll('[data-app-color][data-color]').forEach((el) => el.addEventListener('click', () => {
  const target = appInputs.find((input) => input.dataset.app === el.dataset.appColor);
  if (!target) return; target.value = el.dataset.color; updateAppearanceUi();
}));
for (const el of appInputs) el.addEventListener('input', updateAppearanceUi);
document.querySelectorAll('[data-look-tab]').forEach((el) => el.addEventListener('click', () => {
  const tab = el.dataset.lookTab;
  document.querySelectorAll('[data-look-tab]').forEach((b) => b.classList.toggle('active', b === el));
  document.querySelectorAll('[data-look-panel]').forEach((p) => p.hidden = p.dataset.lookPanel !== tab);
}));
$('openAppearance')?.addEventListener('click', () => $('appearancePanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
$('appearanceReset')?.addEventListener('click', () => setAppForm(DEFAULT_APPEARANCE));
$('appearanceSave')?.addEventListener('click', () => {
  const ok = saveAppearance(readAppForm());
  if (!ok) { toast('保存失败：浏览器存储不可用'); return; }
  try { localStorage.removeItem(APP_DRAFT_KEY); } catch { /* ignore */ }
  setAppearanceStageStatus('已应用到游戏角色', 'saved');
  toast('外观已应用到游戏角色');
});
function randomizeAppearance() {
  const a = readAppForm();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  a.hairStyle = pick(['short','buzz','ponytail','bun','long','spiky','undercut']);
  a.faceShape = pick(['oval','round','angular']); a.headwear = pick(['none','bandana','headset']);
  for (const k of Object.keys(COLORS)) a[k] = pick(COLORS[k]);
  setAppForm(a); toast('随机造型已生成，满意后点击「保存并应用」');
}
$('appearanceRandom')?.addEventListener('click', randomizeAppearance);
$('appearanceRandomTop')?.addEventListener('click', randomizeAppearance);
document.querySelectorAll('[data-slot-save]').forEach((el) => el.addEventListener('click', () => {
  const slot = el.dataset.slotSave, profiles = readAppProfiles();
  profiles[slot] = { name: `造型 ${slot}`, appearance: readAppForm() };
  if (!writeAppProfiles(profiles)) { toast('造型槽保存失败'); return; }
  syncAppearanceChoices(); toast(`已保存造型 ${slot}`);
}));
document.querySelectorAll('[data-slot-load]').forEach((el) => el.addEventListener('click', () => {
  const slot = el.dataset.slotLoad, p = readAppProfiles()[slot];
  if (!p?.appearance) { toast(`造型 ${slot} 还是空的`); return; }
  setAppForm(p.appearance); toast(`已载入造型 ${slot}，点击保存并应用即可进入游戏`);
}));
(function initAppearance() {
  let initial = loadAppearance();
  try { const draft = JSON.parse(localStorage.getItem(APP_DRAFT_KEY) || 'null'); if (draft && typeof draft === 'object') initial = { ...initial, ...draft }; } catch { /* ignore */ }
  setAppForm(initial);
  setAppearanceStageStatus('已载入保存的外观', 'saved');
})();

const HINTS = {
  head: '头:画正面或朝右侧面。标记:头顶→下巴',
  torso: '躯干:正面或朝右侧面站姿。标记:颈→腰',
  upperArm: '大臂。标记:肩端→肘端(左右臂共用一张)',
  foreArm: '小臂,手可以画进去。标记:肘端→手端',
  thigh: '大腿。标记:髋端→膝端(左右腿共用一张)',
  calf: '小腿,鞋画在下端。标记:膝端→脚端',
  helmet: '头盔外观:画朝右或正面,盔顶朝上。仅戴盔时显示,替代预设钢盔',
  vest: '防弹衣外观:画正面或朝右,领口朝上。仅穿甲时显示,替代预设背心',
};

const slots = {};   // part -> { src, ox, oy, scale }(与存档同构)
const pvImgs = {};  // part -> HTMLImageElement(解码缓存,预览/编辑用)

(function init() {
  const s = loadSkin();
  if (s) for (const p of SKIN_PARTS) if (s.parts[p]?.src) slots[p] = { ox: 0, oy: 0, scale: 1, ...s.parts[p] };
})();

function imgOf(part) {
  const s = slots[part];
  if (!s) return null;
  let im = pvImgs[part];
  if (!im || im.__src !== s.src) {
    im = new Image();
    im.src = s.src;
    im.__src = s.src;
    pvImgs[part] = im;
  }
  return im;
}

// ---- 六+二槽位卡片 ----
const slotsEl = $('slots');
for (const part of SKIN_PARTS) {
  const card = document.createElement('div');
  card.className = 'slot';
  card.dataset.part = part;
  const isEquip = part === 'helmet' || part === 'vest';
  card.innerHTML = `
    <div class="name">${SKIN_LABEL[part]}${isEquip ? '<span class="tag">叠在皮肤外</span>' : ''}</div>
    <div class="hint">${HINTS[part]}</div>
    <canvas class="pv" width="220" height="104"></canvas>
    <div class="btns">
      <button data-a="up">上传</button>
      <button data-a="edit">微调</button>
      <button data-a="del" class="del">清除</button>
    </div>`;
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
  card.appendChild(fi);
  card.querySelector('[data-a=up]').onclick = () => fi.click();
  card.querySelector('[data-a=edit]').onclick = () => { if (slots[part]) openEditor(part); else toast('先上传一张'); };
  card.querySelector('[data-a=del]').onclick = () => {
    delete slots[part];
    redrawSlot(part);
    toast(`已清除${SKIN_LABEL[part]}`);
  };
  fi.onchange = () => {
    const f = fi.files && fi.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => uploadFromURL(part, rd.result);
    rd.readAsDataURL(f);
    fi.value = '';
  };
  slotsEl.appendChild(card);
}

// ---- 上传 → 抠白 → 裁边 → 直接进编辑器(标记转正/微调) ----
function uploadFromURL(part, url) {
  const im = new Image();
  im.onload = () => {
    rawKeep[part] = im; // 原图留底:调容差/模式时重处理(端点转正后清除,转正不可重放)
    const r = processSkinImage(im, currentOpts());
    if (!r.ok) { toast(`${SKIN_LABEL[part]}:${r.msg}`); return; }
    slots[part] = { src: r.dataURL, ox: 0, oy: 0, scale: 1 };
    toast(`${SKIN_LABEL[part]} 已抠底(${r.w}×${r.h}px) — 在编辑器里标记上下端/微调位置`);
    redrawSlot(part);
    openEditor(part);
  };
  im.onerror = () => toast('图片读取失败');
  im.src = url;
}
function currentOpts() {
  return { tol: +$('tol').value, connected: $('keepInner').checked };
}
function reprocessAll() {
  for (const part of SKIN_PARTS) {
    if (!slots[part] || !rawKeep[part]) continue;
    const r = processSkinImage(rawKeep[part], currentOpts());
    if (r.ok) slots[part] = { ...slots[part], src: r.dataURL };
    redrawSlot(part);
  }
}
const rawKeep = {}; // part -> 原图(调容差重处理用;转正过的件重处理会回到未转正状态,需重新标记)

// ---- 单槽缩略预览 ----
function redrawSlot(part) {
  const card = slotsEl.querySelector(`.slot[data-part=${part}]`);
  const cv = card.querySelector('.pv');
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  const s = slots[part];
  card.querySelector('[data-a=up]').textContent = s ? '重传' : '上传';
  if (!s) {
    c.strokeStyle = 'rgba(244,233,216,0.25)';
    c.setLineDash([5, 4]);
    c.strokeRect(24, 14, cv.width - 48, cv.height - 28);
    c.setLineDash([]);
    c.fillStyle = 'rgba(244,233,216,0.4)';
    c.font = '11px "Noto Sans SC"';
    c.textAlign = 'center';
    c.fillText('空(用程序绘制)', cv.width / 2, cv.height / 2 + 4);
    drawAssembled();
    return;
  }
  const im = imgOf(part);
  const paint = () => {
    if (!im.complete || !im.naturalWidth) { im.onload = paint; return; }
    const k = Math.min((cv.width - 20) / im.naturalWidth, (cv.height - 14) / im.naturalHeight);
    c.drawImage(im, (cv.width - im.naturalWidth * k) / 2, (cv.height - im.naturalHeight * k) / 2,
      im.naturalWidth * k, im.naturalHeight * k);
    const xf = slots[part];
    if (xf.ox || xf.oy || xf.scale !== 1) {
      c.fillStyle = 'rgba(232,160,76,0.85)';
      c.font = '10px "Noto Sans SC"';
      c.textAlign = 'right';
      c.fillText(`×${xf.scale.toFixed(2)} ${+xf.ox.toFixed(2)},${+xf.oy.toFixed(2)}`, cv.width - 8, cv.height - 6);
    }
    drawAssembled();
  };
  paint();
}

// ---- 编辑器弹层:标记上下端(转正) / 拖动微调 / 缩放 ----
const modal = $('modal'), mCv = $('mCv'), mCtx = mCv.getContext('2d');
let ed = null; // { part, img, xf, markA, markB, mode, dragPt }
let mEPPM = 200; // 编辑器像素/米(按部件框自适应)

function openEditor(part) {
  const im = imgOf(part);
  if (!im) return;
  ed = { part, img: im, xf: { ...slots[part] }, markA: null, markB: null, mode: 'drag' };
  setMode('mark'); // 新上传的素材第一件事:标记上下端
  $('mTitle').textContent = SKIN_LABEL[part];
  $('mScale').value = Math.round(ed.xf.scale * 100);
  $('mScaleV').textContent = ed.xf.scale.toFixed(2) + '×';
  updateHint();
  modal.style.display = 'flex';
  renderEditor();
}
function setMode(m) {
  ed.mode = m;
  $('mDrag').classList.toggle('on', m === 'drag');
  $('mMark').classList.toggle('on', m === 'mark');
  updateHint();
}
function updateHint() {
  const markHelp = {
    head: '点 头顶 → 再点 下巴', torso: '点 颈口 → 再点 腰口',
    upperArm: '点 肩端 → 再点 肘端', foreArm: '点 肘端 → 再点 手端',
    thigh: '点 髋端 → 再点 膝端', calf: '点 膝端 → 再点 脚端',
    helmet: '盔形对称可跳过;歪了就点 盔顶 → 再点 盔沿', vest: '领口对称可跳过;歪了就点 领口 → 再点 下摆',
  }[ed.part];
  $('mHint').textContent = ed.mode === 'mark'
    ? `标记模式:${markHelp}(两次点击,素材自动转正)`
    : '拖动模式:按住图片拖动微调位置;滚轮/滑条缩放 —— 虚线框是部件标准框,和游戏里一模一样';
}
function renderEditor() {
  const W = mCv.width, H = mCv.height;
  mCtx.clearRect(0, 0, W, H);
  const box = SKIN_BOX[ed.part];
  mEPPM = Math.min(W / (box.w * 1.7), H / (box.h * 1.7));
  const cx = W / 2, cy = H / 2;
  // 身体参照(与游戏同源:头=圆 r0.15 / 躯干=0.30×0.52,画在部件自己的局部空间)
  mCtx.save();
  mCtx.translate(cx, cy);
  mCtx.fillStyle = 'rgba(226,176,136,0.20)';
  const gbox = box.anchor === 'head' || ed.part === 'head' ? SKIN_BOX.head : SKIN_BOX.torso;
  if ((gbox === SKIN_BOX.head)) {
    mCtx.beginPath(); mCtx.arc(0, 0, (gbox.w / 2) * mEPPM, 0, Math.PI * 2); mCtx.fill();
  } else if (!['upperArm', 'foreArm', 'thigh', 'calf'].includes(ed.part)) {
    mCtx.beginPath(); mCtx.roundRect(-(gbox.w / 2) * mEPPM, -(gbox.h / 2) * mEPPM, gbox.w * mEPPM, gbox.h * mEPPM, 8); mCtx.fill();
  }
  mCtx.restore();
  // 部件标准框(虚线):游戏里贴图 contain 进这个框
  mCtx.strokeStyle = 'rgba(232,160,76,0.8)';
  mCtx.setLineDash([6, 4]);
  mCtx.strokeRect(cx - (box.w * mEPPM) / 2, cy - (box.h * mEPPM) / 2, box.w * mEPPM, box.h * mEPPM);
  mCtx.setLineDash([]);
  mCtx.fillStyle = 'rgba(232,160,76,0.75)';
  mCtx.font = '11px "Noto Sans SC"';
  mCtx.fillText('↑上端(根)', cx - (box.w * mEPPM) / 2, cy - (box.h * mEPPM) / 2 - 6);
  // 末端锚定线(foreArm/calf):小臂底=手=枪握点,小腿底=脚底 —— 图的底边要贴这条线
  const tipY = cy + (box.h / 2 - (box.tip || 0)) * mEPPM;
  if (SKIN_END_ANCHORED[ed.part]) {
    mCtx.strokeStyle = '#57d05f';
    mCtx.setLineDash([3, 3]);
    mCtx.beginPath();
    mCtx.moveTo(cx - box.w * mEPPM * 0.85, tipY);
    mCtx.lineTo(cx + box.w * mEPPM * 0.85, tipY);
    mCtx.stroke();
    mCtx.setLineDash([]);
    mCtx.fillStyle = '#57d05f';
    mCtx.font = '10px "Noto Sans SC"';
    mCtx.textAlign = 'center';
    mCtx.fillText(ed.part === 'foreArm' ? '↑手/枪握点对齐这条线' : '↑脚底对齐这条线', cx, tipY + 14);
  }
  // 贴图(与 player.js skinCap 同一套适配数学:四肢拉伸填充/其余长度定标 + 端点锚定/居中)
  const im = ed.img;
  if (im.complete && im.naturalWidth) {
    const f = skinFitScale(ed.part, im.naturalWidth, im.naturalHeight);
    const s0x = f.sx * mEPPM * ed.xf.scale, s0y = f.sy * mEPPM * ed.xf.scale;
    const dw = im.naturalWidth * s0x, dh = im.naturalHeight * s0y;
    const dx = cx - dw / 2 + ed.xf.ox * mEPPM;
    const dy = (SKIN_END_ANCHORED[ed.part] ? tipY - dh : cy - dh / 2) + ed.xf.oy * mEPPM;
    mCtx.drawImage(im, dx, dy, dw, dh);
    ed._fit = { s0x, s0y, dx, dy }; // 供命中/逆变换
  }
  // 标记点
  const drawPt = (p, color, label) => {
    if (!p) return;
    mCtx.fillStyle = color;
    mCtx.beginPath(); mCtx.arc(p[0], p[1], 6, 0, Math.PI * 2); mCtx.fill();
    mCtx.fillStyle = '#fff';
    mCtx.font = 'bold 10px "Noto Sans SC"';
    mCtx.fillText(label, p[0] + 8, p[1] - 6);
  };
  drawPt(ed.markA, '#57d05f', '上');
  drawPt(ed.markB, '#e0523c', '下');
}
function cvPos(e) {
  const r = mCv.getBoundingClientRect();
  const k = mCv.width / r.width;
  return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
}
mCv.addEventListener('pointerdown', (e) => {
  if (!ed) return;
  const [x, y] = cvPos(e);
  if (ed.mode === 'mark') {
    if (!ed.markA) { ed.markA = [x, y]; toast('已标记上端 — 再点下端'); }
    else if (!ed.markB) {
      ed.markB = [x, y];
      applyMark();
    }
    renderEditor();
    return;
  }
  // 拖动:记住起点
  ed.dragPt = [x - ed.xf.ox * mEPPM, y - ed.xf.oy * mEPPM];
  mCv.setPointerCapture(e.pointerId);
});
mCv.addEventListener('pointermove', (e) => {
  if (!ed || ed.mode !== 'drag' || !ed.dragPt) return;
  const [x, y] = cvPos(e);
  ed.xf.ox = (x - ed.dragPt[0]) / mEPPM;
  ed.xf.oy = (y - ed.dragPt[1]) / mEPPM;
  renderEditor();
});
mCv.addEventListener('pointerup', () => { if (ed) ed.dragPt = null; });
mCv.addEventListener('wheel', (e) => {
  if (!ed) return;
  e.preventDefault();
  setScale(ed.xf.scale * (e.deltaY < 0 ? 1.06 : 1 / 1.06));
}, { passive: false });
function setScale(v) {
  ed.xf.scale = Math.min(2.2, Math.max(0.4, v));
  $('mScale').value = Math.round(ed.xf.scale * 100);
  $('mScaleV').textContent = ed.xf.scale.toFixed(2) + '×';
  renderEditor();
}
function applyMark() {
  const { s0x, s0y, dx, dy } = ed._fit || {};
  if (!s0x) return;
  // 屏幕 → 源图像素坐标(宽高各自逆变换,适配拉伸填充)
  const toImg = (p) => [(p[0] - dx) / s0x, (p[1] - dy) / s0y];
  const [ax, ay] = toImg(ed.markA);
  const [bx, by] = toImg(ed.markB);
  const r = orientSkinImage(ed.img, ax, ay, bx, by);  if (!r.ok) { toast(r.msg); ed.markA = ed.markB = null; renderEditor(); return; }
  slots[ed.part] = { src: r.dataURL, ox: 0, oy: 0, scale: 1 };
  delete rawKeep[ed.part]; // 已转正,不再参与"调容差重处理"(那会丢掉转正)
  const im = imgOf(ed.part);
  ed.img = im; ed.xf = { ox: 0, oy: 0, scale: 1 };
  ed.markA = ed.markB = null;
  $('mScale').value = 100; $('mScaleV').textContent = '1.00×';
  setMode('drag');
  redrawSlot(ed.part);
  renderEditor();
  toast(`已转正(旋转 ${r.rotatedDeg}°) — 现在可拖动微调`);
}
$('mMark').onclick = () => { if (ed) { ed.markA = ed.markB = null; setMode('mark'); renderEditor(); } };
$('mDrag').onclick = () => { if (ed) setMode('drag'); };
$('mScale').oninput = () => { if (ed) setScale(+$('mScale').value / 100); };
$('mReset').onclick = () => {
  if (!ed) return;
  ed.xf = { ox: 0, oy: 0, scale: 1 };
  $('mScale').value = 100; $('mScaleV').textContent = '1.00×';
  renderEditor();
};
$('mOk').onclick = () => {
  if (!ed) return;
  const p = ed.part;
  slots[p] = { src: slots[p].src, ...ed.xf };
  modal.style.display = 'none';
  ed = null;
  redrawSlot(p);
  toast(`${SKIN_LABEL[p]} 微调已应用`);
};
$('mClose').onclick = () => {
  if (!ed) return;
  const p = ed.part;
  slots[p] = { src: slots[p].src, ...ed.xf }; // 关闭也保留微调
  modal.style.display = 'none';
  ed = null;
  redrawSlot(p);
};

// ---- 组装预览:站立小人(含头盔/防弹衣外观层) ----
const acv = $('assembled');
const actx = acv.getContext('2d');
const PPM2 = 104;
function drawAssembled() {
  const W = acv.width, H = acv.height;
  actx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2 - 4;
  const ppm = PPM2;
  const drawPart = (x, y, angle, part, dark) => {
    const box = SKIN_BOX[part];
    actx.save();
    actx.translate(x, y);
    actx.rotate(-angle);
    const bw = box.w * ppm, bh = box.h * ppm;
    actx.strokeStyle = 'rgba(232,160,76,0.5)';
    actx.setLineDash([4, 3]);
    actx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    actx.setLineDash([]);
    const im = imgOf(part);
    if (im && im.complete && im.naturalWidth) {
      const xf = slots[part];
      const f = skinFitScale(part, im.naturalWidth, im.naturalHeight);
      const dw = im.naturalWidth * f.sx * ppm * (xf.scale || 1);
      const dh = im.naturalHeight * f.sy * ppm * (xf.scale || 1);
      const dy = SKIN_END_ANCHORED[part] ? (SKIN_BOX[part].h / 2 - (SKIN_BOX[part].tip || 0)) * ppm - dh : -dh / 2;
      if (dark) actx.filter = 'brightness(0.72) saturate(0.85)';
      actx.drawImage(im, -dw / 2 + (xf.ox || 0) * ppm, dy + (xf.oy || 0) * ppm, dw, dh);
      actx.filter = 'none';
    } else {
      actx.fillStyle = 'rgba(244,233,216,0.14)';
      actx.fillRect(-bw / 2, -bh / 2, bw, bh);
    }
    actx.restore();
  };

  // Same anchor chain as Player.build(): the old preview shifted left/right limbs by
  // arbitrary ±0.075–0.115m offsets, so a correctly aligned part appeared misplaced.
  const joint = (x, y) => ({ x: cx + x * ppm, y: cy - y * ppm });
  const segment = (root, angle, length) => segmentCenterFromCanvasTop(root, angle, length, ppm);
  const tip = (root, angle, length) => segmentTipFromCanvasTop(root, angle, length, ppm);
  const pose = DEFAULT_RIG_POSE;
  const shoulder = joint(RIG_ANCHORS.shoulder.x, RIG_ANCHORS.shoulder.y);
  const hip = joint(RIG_ANCHORS.hip.x, RIG_ANCHORS.hip.y);
  const headCenter = joint(0, RIG_ANCHORS.neck.y + 0.08 + RIG_DIMS.headR);

  const farUpper = segment(shoulder, pose.shB, RIG_DIMS.upperArm.h);
  const farElbow = tip(shoulder, pose.shB, RIG_DIMS.upperArm.h);
  const farForeAngle = pose.shB + pose.elB;
  const farFore = segment(farElbow, farForeAngle, RIG_DIMS.foreArm.h);
  const nearUpper = segment(shoulder, pose.shF, RIG_DIMS.upperArm.h);
  const nearElbow = tip(shoulder, pose.shF, RIG_DIMS.upperArm.h);
  const nearForeAngle = pose.shF + pose.elF;
  const nearFore = segment(nearElbow, nearForeAngle, RIG_DIMS.foreArm.h);

  const farThigh = segment(hip, pose.hipB, RIG_DIMS.thigh.h);
  const farKnee = tip(hip, pose.hipB, RIG_DIMS.thigh.h);
  const farCalfAngle = pose.hipB + pose.kneeB;
  const farCalf = segment(farKnee, farCalfAngle, RIG_DIMS.calf.h);
  const nearThigh = segment(hip, pose.hipF, RIG_DIMS.thigh.h);
  const nearKnee = tip(hip, pose.hipF, RIG_DIMS.thigh.h);
  const nearCalfAngle = pose.hipF + pose.kneeF;
  const nearCalf = segment(nearKnee, nearCalfAngle, RIG_DIMS.calf.h);

  // Draw order mirrors the game: far-side parts, torso + vest, head + helmet,
  // near-side legs, then the near-side arms.
  drawPart(farUpper.x, farUpper.y, pose.shB, 'upperArm', true);
  drawPart(farFore.x, farFore.y, farForeAngle, 'foreArm', true);
  drawPart(farCalf.x, farCalf.y, farCalfAngle, 'calf', true);
  drawPart(farThigh.x, farThigh.y, pose.hipB, 'thigh', true);
  drawPart(cx, cy, pose.torso, 'torso', false);
  drawPart(cx, cy, pose.torso, 'vest', false);
  drawPart(headCenter.x, headCenter.y, pose.neck, 'head', false);
  drawPart(headCenter.x, headCenter.y, pose.neck, 'helmet', false);
  drawPart(nearCalf.x, nearCalf.y, nearCalfAngle, 'calf', false);
  drawPart(nearThigh.x, nearThigh.y, pose.hipF, 'thigh', false);
  drawPart(nearUpper.x, nearUpper.y, pose.shF, 'upperArm', false);
  drawPart(nearFore.x, nearFore.y, nearForeAngle, 'foreArm', false);

  actx.strokeStyle = 'rgba(126,201,126,0.3)';
  actx.beginPath();
  actx.moveTo(20, cy + 0.80 * ppm);
  actx.lineTo(W - 20, cy + 0.80 * ppm);
  actx.stroke();
}

// ---- 参数与按钮 ----
$('tol').oninput = () => { $('tolV').textContent = $('tol').value; };
$('tol').onchange = reprocessAll;
$('keepInner').onchange = reprocessAll;
$('bSave').onclick = saveAll;
$('bPlay').onclick = () => { saveAll(); location.href = './game.html'; };
$('bClearAll').onclick = () => {
  clearSkin();
  for (const p of SKIN_PARTS) delete slots[p];
  for (const p of SKIN_PARTS) redrawSlot(p);
  toast('已全部清除,游戏里回到程序绘制');
};
function saveAll() {
  const parts = {};
  for (const p of SKIN_PARTS) if (slots[p]) parts[p] = { src: slots[p].src, ox: +slots[p].ox.toFixed(3), oy: +slots[p].oy.toFixed(3), scale: +slots[p].scale.toFixed(3) };
  if (!Object.keys(parts).length) { clearSkin(); toast('没有皮肤部件,已清档(游戏用程序绘制)'); return; }
  const ok = saveSkin({ version: 2, parts });
  toast(ok ? `已保存 ${Object.keys(parts).length} 件 — 切到游戏页即刻生效` : '保存失败:浏览器存储不可用/超出配额');
}
SKIN_PARTS.forEach(redrawSlot);

// ---- 调试/自动化钩子 ----
window.__skinTest = (part, drawFn, w = 240, h = 300) => {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, w, h);
  drawFn(c, w, h);
  const im = new Image();
  im.onload = () => {
    const r = processSkinImage(im, currentOpts());
    if (r.ok) { slots[part] = { src: r.dataURL, ox: 0, oy: 0, scale: 1 }; redrawSlot(part); }
  };
  im.src = cv.toDataURL('image/png');
  return true;
};
// 端点标记直调(自动化测试用,坐标 = 源图像素)
window.__skinMark = (part, ax, ay, bx, by) => {
  const im = imgOf(part);
  const r = orientSkinImage(im, ax, ay, bx, by);
  if (r.ok) { slots[part] = { src: r.dataURL, ox: 0, oy: 0, scale: 1 }; redrawSlot(part); }
  return r;
};
window.__skinXf = (part, xf) => { if (slots[part]) Object.assign(slots[part], xf); redrawSlot(part); };
window.__skinInfo = (part) => {
  const im = imgOf(part);
  return im && im.naturalWidth ? { w: im.naturalWidth, h: im.naturalHeight, inSlots: !!slots[part] } : null;
};
// 通用抠白处理钩子:url 加载 → 抠白底+裁边 → 返回 PNG dataURL(不动存档)
window.__skinProcess = (url, opts = {}) => new Promise((resolve) => {
  const im = new Image();
  im.onload = () => {
    const r = processSkinImage(im, opts);
    resolve(r.ok ? r.dataURL : null);
  };
  im.onerror = () => resolve(null);
  im.src = url;
});
window.__skinSave = () => { document.getElementById('bSave').click(); return localStorage.getItem('contra-skin')?.length || 0; };

