import { loadAppearance, saveAppearance, clearAppearance, DEFAULT_APPEARANCE } from '../game/domain/appearance.js';

const $ = (id) => document.getElementById(id);
const PRESETS = {
  night: { kitStyle:'plate', helmetStyle:'highcut', eyewear:'goggles', pads:'full', backpack:'assault', shirtColor:'#283b35', pantsColor:'#29372f', armorColor:'#202a32', accentColor:'#ffb34d', bootColor:'#1b222b', skinTone:'#c89572', hairStyle:'undercut', headwear:'headset' },
  urban: { kitStyle:'plate', helmetStyle:'full', eyewear:'clear', pads:'full', backpack:'radio', shirtColor:'#35495b', pantsColor:'#2b394b', armorColor:'#3e505d', accentColor:'#72cde3', bootColor:'#222831', skinTone:'#d9a781', hairStyle:'buzz', headwear:'headset' },
  desert: { kitStyle:'chest', helmetStyle:'cap', eyewear:'goggles', pads:'knees', backpack:'assault', shirtColor:'#5c5946', pantsColor:'#645b49', armorColor:'#5a5947', accentColor:'#d4b17a', bootColor:'#5a4a34', skinTone:'#a66f50', hairStyle:'short', headwear:'bandana' },
  jungle: { kitStyle:'plate', helmetStyle:'highcut', eyewear:'none', pads:'full', backpack:'radio', shirtColor:'#283b35', pantsColor:'#29372f', armorColor:'#39463b', accentColor:'#91bc8b', bootColor:'#1b2923', skinTone:'#c89572', hairStyle:'ponytail', headwear:'headset' },
  breach: { kitStyle:'plate', helmetStyle:'full', eyewear:'goggles', pads:'full', backpack:'assault', shirtColor:'#292e36', pantsColor:'#222831', armorColor:'#30363d', accentColor:'#d16d5c', bootColor:'#1b222b', skinTone:'#d9a781', hairStyle:'buzz', headwear:'headset' },
  ghost: { kitStyle:'slick', helmetStyle:'highcut', eyewear:'clear', pads:'none', backpack:'none', shirtColor:'#a4aaa5', pantsColor:'#222831', armorColor:'#777d78', accentColor:'#d4d7d2', bootColor:'#313c41', skinTone:'#c89572', hairStyle:'short', headwear:'none' },
};
const COLOR_KEYS = ['shirtColor','pantsColor','armorColor','accentColor'];
const defaults = { ...DEFAULT_APPEARANCE, kitStyle:'plate', helmetStyle:'highcut', eyewear:'goggles', pads:'full', backpack:'assault', armorColor:'#263744' };
let draft = { ...defaults, ...loadAppearance() };
let applied = { ...draft };
let activePreset = 'night';
const canvas = $('preview'), ctx = canvas.getContext('2d');
const profilesKey = 'contra-appearance-profiles-v1';
const valid = (v, arr) => arr.includes(v);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
function toast(message){const e=$('toast');e.textContent=message;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2100);}
function setStatus(text){$('status').innerHTML='● '+text+'<br>外观不影响碰撞与伤害数值';}
function shade(hex,k){const n=parseInt((hex||'#33404b').slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.round(clamp(v*k,0,255)).toString(16).padStart(2,'0')).join('');}
function path(points,fill,stroke='#111820',lw=3){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.lineJoin='round';ctx.stroke();}}
function line(points,color,width=2){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
function round(x,y,w,h,r,fill,stroke='#111820',lw=2){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
function draw(){const a=draft,c=ctx,W=canvas.width,H=canvas.height;c.clearRect(0,0,W,H);c.save();c.scale(W/520,H/720);
  const bg=c.createLinearGradient(0,0,0,720);bg.addColorStop(0,'#1a2b38');bg.addColorStop(.55,'#101b26');bg.addColorStop(1,'#090f16');c.fillStyle=bg;c.fillRect(0,0,520,720);
  const glow=c.createRadialGradient(258,310,10,258,310,300);glow.addColorStop(0,'#617c8b26');glow.addColorStop(1,'#09101800');c.fillStyle=glow;c.fillRect(0,0,520,720);
  c.strokeStyle='#9db5c510';c.lineWidth=1;for(let x=20;x<520;x+=26){c.beginPath();c.moveTo(x,0);c.lineTo(x,720);c.stroke()}for(let y=20;y<720;y+=26){c.beginPath();c.moveTo(0,y);c.lineTo(520,y);c.stroke()}
  c.fillStyle='#080d14aa';c.fillRect(24,86,2,520);c.fillRect(494,86,2,520);c.fillStyle=a.accentColor;c.fillRect(24,86,34,3);c.fillRect(462,86,34,3);
  c.fillStyle='#05090e99';c.beginPath();c.ellipse(269,622,115,19,0,0,Math.PI*2);c.fill();line([[25,632],[495,632]],'#52677766',1);
  const shirt=a.shirtColor,pants=a.pantsColor,armor=a.armorColor,accent=a.accentColor,skin=a.skinTone,boot=a.bootColor;
  const shirtHi=shade(shirt,1.24),shirtLo=shade(shirt,.62),pantsLo=shade(pants,.64),armorHi=shade(armor,1.42),armorLo=shade(armor,.55),skinLo=shade(skin,.68);
  // pack is deliberately behind the body, so it reads as a real attachment rather than a floating badge.
  if(a.backpack!=='none'){round(196,267,a.backpack==='radio'?31:43,106,9,a.backpack==='radio'?'#293944':'#26343d');round(200,281,34,37,5,armorLo);line([[207,275],[207,363],[227,363]],'#8595a04d',3);if(a.backpack==='radio'){round(211,240,14,48,3,'#465a62');line([[218,242],[224,218],[232,210]],accent,2);}}
  // boots + legs, with clean silhouettes and consistent outline thickness.
  path([[223,446],[249,448],[248,510],[260,565],[292,585],[296,600],[239,600],[227,584],[211,525]],pants,'#0a1118',4);
  path([[270,447],[294,449],[298,500],[308,545],[330,574],[329,592],[279,592],[267,567],[260,514]],pantsLo,'#0a1118',4);
  round(236,580,59,24,6,boot);round(278,570,55,25,6,boot);line([[242,594],[285,594]],'#d3d8d733',2);line([[286,585],[325,585]],'#d3d8d733',2);
  round(229,476,32,33,6,armor,'#0c141c',3);round(272,473,31,33,6,armor,'#0c141c',3);
  line([[236,483],[253,483],[253,501]],accent,2);line([[279,481],[295,481],[295,500]],accent,2);
  if(a.pads!=='none'){round(228,475,34,31,6,armorHi,'#0a1118',3);round(270,472,34,31,6,armorHi,'#0a1118',3);line([[235,486],[253,486]],accent,2);line([[277,483],[295,483]],accent,2);}
  // far arm, shoulder and elbow.
  ctx.save();ctx.translate(208,311);ctx.rotate(-.15);round(-14,0,28,78,12,shirtLo);round(-15,10,30,28,7,armorLo);ctx.restore();
  // torso uniform is tapered and has panel seams, avoiding the old flat rectangle silhouette.
  path([[218,252],[292,252],[307,285],[299,371],[284,414],[223,411],[205,366],[207,286]],shirt,'#0a1118',5);
  path([[222,263],[248,257],[247,391],[227,389],[215,351]],shirtHi,'#18242d',1.5);
  line([[213,291],[218,355],[231,385]],'#d6e0e21c',2);line([[288,273],[296,315],[284,389]],'#02080d77',3);
  // modular carrier / chest rig.
  if(a.kitStyle==='plate'){
    path([[218,270],[290,270],[294,329],[282,373],[226,371],[214,329]],armor,'#0a1118',4);
    path([[226,278],[283,278],[285,322],[273,350],[232,350],[222,322]],armorHi,'#0d151d',2);
    path([[235,286],[273,286],[278,321],[270,340],[238,340],[230,320]],armorLo,null);
    line([[229,279],[229,320],[237,340]],'#d7e2e230',2);line([[282,279],[282,319],[273,340]],'#f1f5f515',2);
    round(236,294,37,19,3,'#202c36','#0c131b',1);c.fillStyle=accent;c.fillRect(240,299,12,3);c.fillStyle='#d9e1e7';c.font='bold 7px system-ui';c.fillText('H / 01',254,306);
    for(let i=0;i<3;i++){round(222+i*20,339,17,27,3,armorLo,'#0a1118',2);line([[226+i*20,345],[235+i*20,345]],'#d8e1e22e',1);round(224+i*20,365,13,5,2,accent,'#0a1118',1);}
    line([[218,283],[229,286],[232,301]],'#cbd7dc5c',3);line([[286,283],[278,286],[275,301]],'#cbd7dc5c',3);
  }else if(a.kitStyle==='chest'){
    path([[218,271],[289,271],[291,324],[278,352],[227,350],[215,321]],armor,'#0a1118',4);
    line([[223,276],[231,345]],accent,4);line([[281,276],[273,345]],accent,4);
    for(let i=0;i<4;i++){round(220+i*17,309,15,25,3,armorLo,'#0a1118',2);line([[224+i*17,315],[231+i*17,315]],'#dce4e52c',1);}
    round(241,279,25,19,3,armorHi);line([[246,286],[260,286]],accent,2);
  }else{
    path([[220,274],[288,274],[288,337],[276,357],[229,357],[217,337]],armor,'#0a1118',4);
    line([[229,281],[231,345]],'#c6d0d52c',2);line([[278,281],[276,345]],'#c6d0d52c',2);
    round(240,298,28,28,5,armorLo);line([[244,303],[264,303]],accent,2);
  }
  // shoulder armor, sling and radio/utility details.
  if(a.pads==='full'){round(201,270,35,28,8,armorHi,'#0a1118',3);line([[207,279],[230,279]],accent,2);round(286,268,33,27,8,armorHi,'#0a1118',3);line([[292,277],[314,277]],accent,2);}
  line([[206,287],[225,324],[218,354]],'#b9c7cd68',3);
  round(240,382,42,14,3,armorLo);round(254,385,14,9,2,'#111a22',accent,1);line([[260,387],[260,392]],accent,2);
  // near arm + gloves.
  ctx.save();ctx.translate(301,304);ctx.rotate(.28);round(-12,0,25,81,10,shirt);round(-13,5,27,26,7,armor);line([[-7,12],[7,12]],accent,2);round(-12,64,25,18,5,boot);ctx.restore();
  // neck and face, drawn with graphic shadows rather than a bare circle.
  round(245,224,27,35,7,skinLo);c.fillStyle=skin;c.beginPath();c.moveTo(238,183);c.quadraticCurveTo(239,158,261,157);c.quadraticCurveTo(286,158,288,182);c.lineTo(282,211);c.lineTo(265,228);c.lineTo(246,215);c.closePath();c.fill();line([[246,208],[263,220],[281,205]],skinLo,2);
  // hair silhouette behind helmet.
  c.fillStyle=a.hairColor||'#202733';c.beginPath();c.ellipse(261,174,25,24,0,Math.PI,Math.PI*2);c.fill();
  // head gear options are different silhouettes, not merely a color swap.
  if(a.helmetStyle==='highcut'||a.helmetStyle==='full'){
    path([[235,180],[237,161],[247,146],[266,143],[284,153],[290,171],[283,178],[278,164],[246,164],[243,180]],armorHi,'#0a1118',4);
    line([[240,161],[251,151],[269,150],[282,159]],'#e0e6e633',2);round(238,166,9,17,3,armorLo);round(279,165,11,18,3,armorLo);
    if(a.helmetStyle==='full')path([[237,173],[290,173],[283,198],[269,207],[250,201]],armor,'#0a1118',3);
    else {round(281,174,13,11,3,armorLo);line([[287,180],[300,190],[300,197]],accent,2);}
  }else if(a.helmetStyle==='cap'){path([[237,174],[240,158],[253,151],[272,153],[285,166],[298,172],[274,176],[246,174]],armorHi,'#0a1118',3);}
  if(a.eyewear!=='none'){round(271,178,18,10,3,a.eyewear==='goggles'?'#263a45':'#a8c7ce88','#0a1118',2);line([[273,181],[285,181]],accent,1.5);line([[289,182],[295,180]],'#101820',2);}
  // face eye and nose are oriented to the right.
  c.fillStyle='#f1f0e6';c.beginPath();c.ellipse(279,190,4,2.5,0,0,Math.PI*2);c.fill();c.fillStyle=a.eyeColor||'#67c9ff';c.beginPath();c.arc(281,190,1.8,0,Math.PI*2);c.fill();path([[287,194],[295,198],[286,201]],skinLo,null);line([[274,208],[283,209]],'#6f3d35',1.5);
  // belt, thigh rig and pouch silhouette.
  round(215,408,81,16,3,armorLo,'#0a1118',3);round(248,410,15,12,2,armorHi);c.fillStyle=accent;c.fillRect(253,413,5,3);
  round(218,420,24,24,3,armor,'#0a1118',2);round(246,420,20,28,3,armorLo,'#0a1118',2);round(272,420,18,21,3,armor,'#0a1118',2);
  line([[224,425],[235,425]],'#e1e6e62e',1);line([[251,426],[260,426]],'#e1e6e62e',1);
  // shoulder patches, radio mic, high visibility ID tab.
  round(288,287,12,17,3,armorLo);c.fillStyle=accent;c.fillRect(291,291,6,2);c.fillRect(291,296,6,2);
  c.fillStyle='#dfe7e9';c.font='bold 8px system-ui';c.fillText('01',293,309);
  // reticle and silhouette scale markings.
  c.strokeStyle='#a7c0d01c';c.lineWidth=1;c.beginPath();c.arc(260,340,178,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(72,340);c.lineTo(448,340);c.moveTo(260,126);c.lineTo(260,638);c.stroke();
  c.fillStyle='#a5b8c7';c.font='10px system-ui';c.fillText('FIG. 01  /  OPERATOR KIT',30,681);c.textAlign='right';c.fillStyle=accent;c.fillText('CANVAS / MODULAR LAYERS',490,681);c.restore();
  $('readChest').textContent=a.kitStyle==='plate'?'PLATE CARRIER':a.kitStyle==='chest'?'CHEST RIG':'SLICK CARRIER';$('readHead').textContent=a.helmetStyle.toUpperCase();$('readColor').textContent=activePreset.toUpperCase();$('kitName').textContent=(activePreset==='breach'?'BREACHER':activePreset==='ghost'?'GHOST':activePreset==='desert'?'HUNTER':activePreset==='jungle'?'RECON':'RAIDER')+' / 01';
}
function setDraft(next){draft={...draft,...next};activePreset=Object.keys(PRESETS).find(k=>Object.entries(PRESETS[k]).every(([p,v])=>draft[p]===v))||'custom';syncUi();draw();try{localStorage.setItem('contra-appearance-draft-v2',JSON.stringify(draft));}catch{}setStatus('草稿已更新');}
function syncUi(){document.querySelectorAll('[data-field]').forEach(b=>b.classList.toggle('active',draft[b.dataset.field]===b.dataset.value));document.querySelectorAll('[data-color-group]').forEach(g=>g.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('active',(draft[g.dataset.colorGroup]||'').toLowerCase()===b.dataset.color.toLowerCase())));document.querySelectorAll('[data-color-input]').forEach(i=>i.value=draft[i.dataset.colorInput]||'#ffffff');document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===activePreset));document.querySelectorAll('[data-slot-label]').forEach(e=>e.textContent=readSlots()[e.dataset.slotLabel]?.name||'空槽');}
function readSlots(){try{return JSON.parse(localStorage.getItem(profilesKey)||'{}')||{}}catch{return {}}}
function writeSlots(v){try{localStorage.setItem(profilesKey,JSON.stringify(v));return true}catch{return false}}
function applyPreset(key){setDraft(PRESETS[key]||PRESETS.night);activePreset=key;syncUi();draw();}
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
document.querySelectorAll('[data-field]').forEach(b=>b.addEventListener('click',()=>setDraft({[b.dataset.field]:b.dataset.value})));
document.querySelectorAll('[data-color-group]').forEach(g=>g.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>setDraft({[g.dataset.colorGroup]:b.dataset.color}))));
document.querySelectorAll('[data-color-input]').forEach(i=>i.addEventListener('input',()=>setDraft({[i.dataset.colorInput]:i.value})));
function randomize(){const pick=a=>a[Math.floor(Math.random()*a.length)];const a={...draft};for(const k of COLOR_KEYS)a[k]=pick(k==='shirtColor'?['#283b35','#35495b','#5c5946','#292e36','#a4aaa5']:k==='pantsColor'?['#29372f','#2b394b','#645b49','#222831']:k==='armorColor'?['#202a32','#3e505d','#5a5947','#777d78']:['#ffb34d','#72cde3','#91bc8b','#d16d5c','#d4d7d2']);a.kitStyle=pick(['plate','chest','slick']);a.helmetStyle=pick(['highcut','full','cap','none']);a.eyewear=pick(['goggles','clear','none']);a.pads=pick(['full','knees','none']);a.backpack=pick(['assault','radio','none']);setDraft(a);toast('已生成新装备组合');}
$('random').onclick=randomize;$('random2').onclick=randomize;
$('reset').onclick=()=>{setDraft({...DEFAULT_APPEARANCE,kitStyle:'plate',helmetStyle:'highcut',eyewear:'goggles',pads:'full',backpack:'assault',armorColor:'#263744'});toast('当前草稿已重置');};
$('apply').onclick=()=>{const ok=saveAppearance(draft);if(!ok){toast('保存失败：浏览器本地存储不可用');return;}applied={...draft};try{localStorage.removeItem('contra-appearance-draft-v2')}catch{}setStatus('已应用到游戏');toast('装备外观已保存；返回游戏后生效');};
document.querySelectorAll('[data-slot-save]').forEach(b=>b.onclick=()=>{const s=readSlots(),k=b.dataset.slotSave;s[k]={name:'已保存 · '+new Date().toLocaleDateString(),appearance:{...draft}};if(!writeSlots(s)){toast('槽位保存失败');return;}syncUi();toast('造型 '+k+' 已保存');});
document.querySelectorAll('[data-slot-load]').forEach(b=>b.onclick=()=>{const s=readSlots()[b.dataset.slotLoad];if(!s?.appearance){toast('该造型槽为空');return;}setDraft(s.appearance);toast('造型已载入草稿，请保存并应用');});
try{const d=JSON.parse(localStorage.getItem('contra-appearance-draft-v2')||'null');if(d)draft={...draft,...d};}catch{}
activePreset=Object.keys(PRESETS).find(k=>Object.entries(PRESETS[k]).every(([p,v])=>draft[p]===v))||'night';syncUi();draw();
window.__operatorStudio={getDraft:()=>({...draft}),render:draw,applyPreset};
