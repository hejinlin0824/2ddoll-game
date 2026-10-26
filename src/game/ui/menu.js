// 主菜单：NIGHTFALL 行动启动台。真实游戏 Canvas 作为动态背景，
// 左侧承载 HERO 品牌与主要操作，右侧显示当前战区简报，底部选择战区。
// 场景切换仍走 game.js 注入的原地重建回调；所有玩家存档键与玩法模块保持不变。
import { bpToggle } from './backpack.js';
import { uiSfx } from '../systems/audio.js';
import { loadCustomLevel, isCustomActive, activateCustomLevel, setSceneTheme } from '../world/level.js';

const customData = loadCustomLevel();
const hasCustom = !!customData && Array.isArray(customData.rects);
// 每关:独立素材包 + 独立地形布局 + 独立玩法规则(见 level.js LAYOUTS / waves.js SCENE_RULES)
const SCENES = [
  { id: 'wild', name: '野外 · 月夜', desc: '标准攻势 · 高低平台与掩体', ready: true },
  { id: 'roof', name: '屋顶 · 黎明', desc: '制空压制 · 高位狙击对射', ready: true },
  { id: 'room', name: '港区 · 仓库', desc: '近距离巷战 · 精锐提前出现', ready: true },
  { id: 'port', name: '港口仓储 · 夜', desc: '货柜迷宫 · 起重机平台 · 可破坏集装箱', ready: true },
  { id: 'desert', name: '沙丘 · 正午', desc: '人海冲锋 · 稀疏掩体与沙脊', ready: true },
  { id: 'tropic', name: '海岛 · 澜', desc: '跳跃推进 · 滩头平台战', ready: true },
  { id: 'raid', name: '剿匪行动 · 多层建筑', desc: '屋顶绳降 · 潜行清剿 · 局部增援', ready: true },
  { id: 'custom', name: '我的关卡', desc: hasCustom ? '部署你的自定义战场' : '先去战场编辑器绘制地图', ready: hasCustom },
];

// 生成图裁切后的素材只用于主菜单情报/战区卡，不替换游戏内视差背景与物理世界。
const SCENE_ART = {
  wild: './bg/mountains-far.png',
  roof: './art/scenes/city.webp',
  room: './art/scenes/industrial.webp',
  port: './art/maps/port/port-card.webp',
  desert: './art/scenes/desert.webp',
  tropic: './art/scenes/tropical.webp',
  raid: './art/scenes/interior.webp',
  custom: null,
};
const SCENE_THREAT = {
  wild: './art/portraits/enemy-rifleman.png',
  roof: './art/portraits/enemy-ghillie.png',
  room: './art/portraits/enemy-heavy.png',
  port: './art/portraits/enemy-commander.png',
  desert: './art/portraits/enemy-rifleman.png',
  tropic: './art/portraits/enemy-ghillie.png',
  raid: './art/portraits/enemy-commander.png',
  custom: null,
};

const BRIEFING = {
  wild:   { code: 'OP-01 / WILDERNESS', number: '01', assault: '标准推进', air: '直升机 + 无人机', terrain: '平台 / 箱体掩护', loot: '15 波 · 品质递增' },
  roof:   { code: 'OP-02 / ROOFTOP', number: '02', assault: '高位交火', air: '高频空袭', terrain: '高台 / 长射线', loot: '15 波 · 高风险' },
  room:   { code: 'OP-03 / DOCKYARD', number: '03', assault: '精锐突入', air: '低频投放', terrain: '密集箱体 / 窄通道', loot: '精锐提前出现' },
  port:   { code: 'OP-04 / NIGHT PORT', number: '04', assault: '货柜巷道交战', air: '吊机高点与偶发机炮', terrain: '可破坏集装箱 / 金属栈道', loot: '横向推进 · 高低路线' },
  desert: { code: 'OP-05 / DUNES', number: '05', assault: '人海冲锋', air: '运输机批次投放', terrain: '沙脊 / 开阔地', loot: '高密度战利品' },
  tropic: { code: 'OP-06 / ISLAND', number: '06', assault: '滩头推进', air: '多兵批次投放', terrain: '岩台 / 连续跳台', loot: '机动路线优先' },
  raid: { code: 'OP-07 / BUILDING RAID', number: '07', assault: '潜入后局部警报', air: '按敌方无线电呼叫响应', terrain: '四层建筑 / 可破坏墙门灯', loot: '逐层清剿 · 选择潜行或强攻' },
  custom: { code: 'OP-X / USER THEATER', number: 'X', assault: '自定义遭遇', air: '按关卡配置', terrain: '玩家绘制布局', loot: '按波次递增' },
};

let open = true;
const savedScene = localStorage.getItem('contra-scene');
let scene = SCENES.find((x) => x.id === savedScene && x.ready) || SCENES[0];
activateCustomLevel(scene.id === 'custom'); // 选中态与激活 flag 对齐(防存档清了 flag 还开着)
if (scene.id !== 'custom') setSceneTheme(scene.id); // 主题场景:调色板与存档对齐
let leaveT = null;
let sceneSwitchT = null;
let sceneSwitchPending = false;
let gearT = null;              // 「装备整备」的开背包定时器(1s 内回菜单要取消,见 start/menuShow)
let sfx = () => {};            // main 注入 UI 音效兜底
let boom = () => {};           // main 注入 noiseBurst(开门"哗"的气流声)
let onSlam = () => {};         // main 注入：菜单离场瞬间的轻震屏与闪光
let bootAudio = () => {};      // main 注入 initAudio:菜单按钮点击就是用户手势,在这里启动音频链
let onSceneChange = null;      // main 注入:原地重建物理场景,不要硬刷新整页
let started = false;           // false = 从未进过战场(开始);true = 战斗中回菜单(继续)

const RAID_CAMPAIGN_TITLE = '夜幕行动：失联名单';
const RAID_CHECKPOINT_KEY = 'contra-raid-checkpoint-v1';
const RAID_RESULT_KEY = 'contra-raid-campaign-v1';

function readRaidProgress() {
  let checkpoint = null, result = null;
  try { checkpoint = JSON.parse(localStorage.getItem(RAID_CHECKPOINT_KEY) || 'null'); } catch { /* corrupted save */ }
  try { result = JSON.parse(localStorage.getItem(RAID_RESULT_KEY) || 'null'); } catch { /* corrupted result */ }
  if (result?.version === 1 && result?.campaign === RAID_CAMPAIGN_TITLE && result.completed === true) {
    return { completed: true, hasCheckpoint: false, status: '第一章已完成 · 失联名单已封存', startLabel: '再次部署' };
  }
  if (checkpoint?.version !== 1 || checkpoint?.campaign !== RAID_CAMPAIGN_TITLE
      || !['insertion', 'assault', 'extract'].includes(checkpoint.stage)) {
    return { completed: false, hasCheckpoint: false, status: '行动记录待建立 · 从屋顶绳降开始', startLabel: '开始剿匪' };
  }

  const cleared = checkpoint.clearedFloors || {};
  const clearCount = [3, 2, 1, 0].filter((id) => cleared[id] === true).length;
  let next = '目标：屋顶插入与清剿';
  if (checkpoint.stage === 'extract') next = '下一步：地面入口配电柜撤离';
  else if (!cleared[3]) next = '下一步：肃清屋顶守军';
  else if (!cleared[2]) next = '下一步：清理三层';
  else if (!cleared[1]) next = '下一步：清理二层 COMMS 区';
  else if (!checkpoint.intelSecured) next = '下一步：回收 COMMS 终端名单';
  else if (!cleared[0]) next = '下一步：清理地面入口';
  else next = '下一步：返回配电柜呼叫撤离';
  return {
    completed: false,
    hasCheckpoint: true,
    status: `进度已保存 · 已清理 ${clearCount}/4 层 · ${next}`,
    startLabel: '继续剿匪',
  };
}

export function menuIsOpen() { return open; }
export function helpIsOpen() { const h = document.getElementById('help'); return !!h && h.classList.contains('show'); }
export function helpClose() { closeHelp(); }

// 暂停键唯一入口:菜单开着 → 开门继续战斗;关着 → 合门暂停
export function menuToggle() { if (open) start(false); else menuShow(); }

export function menuInit(opts = {}) {
  sfx = opts.beep || sfx;
  boom = opts.noiseBurst || boom;
  onSlam = opts.onSlam || onSlam;
  bootAudio = opts.initAudio || bootAudio;
  onSceneChange = opts.onSceneChange || onSceneChange;
  build();
}

// 回作战台：内容分层入场，底下 Canvas 保持轻量实时演示。
export function menuShow() {
  bootAudio();
  const m = document.getElementById('menu');
  if (!m || open) return;
  open = true;
  clearTimeout(leaveT); leaveT = null;
  clearTimeout(gearT); gearT = null;
  clearTimeout(slamT); slamT = null;
  m.classList.remove('menu-departing', 'menu-entering');
  m.style.display = 'grid';
  m.style.pointerEvents = '';
  updateSceneBriefing(scene);
  const label = document.getElementById('menuStartLabel');
  if (label && scene.id !== 'raid') label.textContent = started ? '继续战斗' : '部署突击';
  document.body.classList.add('in-menu');
  void m.offsetWidth;
  m.classList.add('menu-entering');
  setTimeout(() => m.classList.remove('menu-entering'), 1100);
  sfx(320, 560, 0.11, 'triangle', 0.035);
}

let slamT = null;

function start(alsoGear) {
  if (sceneSwitchPending) return;
  bootAudio();
  const m = document.getElementById('menu');
  if (!m || !open) return;
  open = false;
  started = true;
  m.classList.remove('menu-entering');
  m.classList.add('menu-departing');
  m.style.pointerEvents = 'none';
  // UI 内容先脱离视线，随后让真实战场完整露出；避免再驱动两扇全屏模糊门。
  clearTimeout(slamT);
  slamT = setTimeout(() => {
    slamT = null;
    if (open) return;
    onSlam();
    boom(0.22, 0.12, 900);
  }, 205);
  clearTimeout(leaveT);
  leaveT = setTimeout(() => {
    leaveT = null;
    if (open) return;
    m.style.display = 'none';
    m.classList.remove('menu-departing');
    m.style.pointerEvents = '';
    document.body.classList.remove('in-menu');
  }, 560);
  if (alsoGear) {
    clearTimeout(gearT);
    gearT = setTimeout(() => {
      gearT = null;
      if (!open && !helpIsOpen()) bpToggle();
    }, 1050);
  }
}

function updateSceneBriefing(s) {
  const data = BRIEFING[s?.id] || BRIEFING.wild;
  const put = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  put('menuSceneName', s?.name || SCENES[0].name);
  put('menuSceneDesc', s?.desc || SCENES[0].desc);
  put('menuSceneCode', data.code);
  put('menuSceneNumber', data.number);
  put('menuIntelAssault', data.assault);
  put('menuIntelAir', data.air);
  put('menuIntelTerrain', data.terrain);
  put('menuIntelLoot', data.loot);
  if (s?.id === 'raid') {
    const progress = readRaidProgress();
    const progressLabel = document.querySelector('.mission-secure');
    if (progressLabel) progressLabel.textContent = started && !progress.completed
      ? progress.status.replace(/^进度已保存/, '当前行动')
      : progress.status;
    put('menuStartLabel', progress.completed ? '再次部署'
      : started ? '继续战斗'
        : progress.hasCheckpoint ? '继续剿匪' : '开始剿匪');
  } else {
    put('menuStartLabel', started ? '继续战斗' : '部署突击');
    const progressLabel = document.querySelector('.mission-secure');
    if (progressLabel) progressLabel.textContent = '战术数据已同步';
  }
  // Static enemy artwork is briefing-only; living enemies still use the active ragdoll rig.
  const threatArt = document.getElementById('menuThreatArt');
  const threatSrc = SCENE_THREAT[s?.id] || null;
  if (threatArt) {
    if (threatSrc) {
      if (threatArt.getAttribute('src') !== threatSrc) threatArt.setAttribute('src', threatSrc);
      threatArt.hidden = false;
    } else {
      threatArt.removeAttribute('src');
      threatArt.hidden = true;
    }
  }
  const menuRoot = document.getElementById('menu');
  if (menuRoot) menuRoot.dataset.scene = s?.id || 'wild';
  document.querySelectorAll('#menuScenes .scene-card').forEach((el) => {
    const active = el.dataset.scene === s?.id;
    el.classList.toggle('sel', active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
    const mark = el.querySelector('.sc-select-mark');
    if (mark && !el.classList.contains('locked')) mark.textContent = active ? '当前战区' : '选择战区';
  });
  const right = document.querySelector('.menu-right');
  if (right) {
    right.classList.remove('brief-update');
    void right.offsetWidth;
    right.classList.add('brief-update');
    setTimeout(() => right.classList.remove('brief-update'), 520);
  }
}

function build() {
  const wrap = document.getElementById('menuScenes');
  if (!wrap) return;
  wrap.innerHTML = '';
  SCENES.forEach((s, index) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'scene-card' + (s.id === scene.id ? ' sel' : '') + (s.ready ? '' : ' locked');
    el.dataset.scene = s.id;
    el.style.setProperty('--card-i', String(index));
    el.setAttribute('aria-pressed', s.id === scene.id ? 'true' : 'false');
    el.disabled = !s.ready;
    el.setAttribute('aria-label', `${s.name}，${s.ready ? (s.id === scene.id ? '当前选中' : '选择战区') : '尚未创建自定义地图'}`);
    const num = s.id === 'custom' ? 'X' : String(index + 1).padStart(2, '0');
    const desc = s.ready ? s.desc : '先创建你的战场';
    const art = document.createElement('span');
    art.className = 'sc-art';
    art.setAttribute('aria-hidden', 'true');
    art.dataset.scene = s.id;
    const image = SCENE_ART[s.id];
    if (image) art.style.backgroundImage = `linear-gradient(180deg,rgba(5,9,16,.04),rgba(5,9,16,.2)),url("${image}")`;
    const number = document.createElement('span');
    number.className = 'sc-num'; number.textContent = num;
    const copy = document.createElement('span'); copy.className = 'sc-copy';
    const name = document.createElement('span'); name.className = 'sc-name'; name.textContent = s.name;
    const summary = document.createElement('span'); summary.className = 'sc-desc'; summary.textContent = desc;
    const mark = document.createElement('span'); mark.className = 'sc-select-mark'; mark.textContent = s.id === scene.id ? '当前战区' : (s.ready ? '选择战区' : '未创建');
    copy.append(name, summary, mark);
    el.append(art, number, copy);
    el.onclick = () => {
      if (!s.ready || sceneSwitchPending) return;
      bootAudio();
      if (s.id === scene.id) { updateSceneBriefing(s); return; } // 不重载已选中的地图,避免无意义卡顿
      const previousSceneId = scene.id;
      activateCustomLevel(s.id === 'custom');
      // 更新选择态与存档;实际地形/背景/波次由主装配根在过渡结束时原地重建。
      scene = s;
      localStorage.setItem('contra-scene', s.id);
      updateSceneBriefing(s);
      if (!uiSfx('switch-a')) sfx(520, 760, 0.07, 'square', 0.04);
      const transition = document.getElementById('sceneTransition');
      if (transition) {
        transition.classList.add('active');
        transition.setAttribute('aria-hidden', 'false');
        const code = transition.querySelector('[data-deploy-code]');
        if (code) code.textContent = (BRIEFING[s.id] || BRIEFING.wild).code;
      }
      wrap.classList.add('switching');
      sceneSwitchPending = true;
      const startBtn = document.getElementById('menuStart');
      if (startBtn) startBtn.disabled = true;
      clearTimeout(sceneSwitchT);
      sceneSwitchT = setTimeout(() => {
        try {
          const ok = onSceneChange ? onSceneChange(s.id) : (location.reload(), true);
          if (ok === false) {
            // 地图存档校验失败时回滚菜单选择与持久化状态,不让 UI 假装切关成功。
            scene = SCENES.find((item) => item.id === previousSceneId) || SCENES[0];
            localStorage.setItem('contra-scene', scene.id);
            activateCustomLevel(scene.id === 'custom');
            updateSceneBriefing(scene);
            if (!uiSfx('switch-b')) sfx(240, 180, 0.12, 'square', 0.04);
          }
        } catch (err) {
          window.__lastSceneSwitchError = String(err && err.stack || err);
          scene = SCENES.find((item) => item.id === previousSceneId) || SCENES[0];
          localStorage.setItem('contra-scene', scene.id);
          activateCustomLevel(scene.id === 'custom');
          updateSceneBriefing(scene);
        } finally {
          if (transition) {
            transition.classList.remove('active');
            transition.setAttribute('aria-hidden', 'true');
          }
          wrap.classList.remove('switching');
          sceneSwitchPending = false;
          if (startBtn) startBtn.disabled = false;
          sceneSwitchT = null;
        }
      }, 360);
    };
    wrap.appendChild(el);
  });
  updateSceneBriefing(scene);
  document.getElementById('menuStart').onclick = () => { uiSfx('click-b', 0.4); start(false); };
  document.getElementById('menuHelp').onclick = () => {
    bootAudio();
    uiSfx('tap-a');
    const h = document.getElementById('help');
    h.style.display = 'flex';
    h.classList.add('show');
  };
  document.getElementById('helpClose').onclick = () => closeHelp();
  document.getElementById('menuGear').onclick = () => { uiSfx('click-a'); start(true); };
  document.body.classList.add('in-menu');
  const menu = document.getElementById('menu');
  if (menu) {
    menu.classList.add('menu-entering');
    setTimeout(() => menu.classList.remove('menu-entering'), 900);
  }
}

function closeHelp() {
  const h = document.getElementById('help');
  if (!h) return;
  h.classList.remove('show');
  setTimeout(() => { h.style.display = 'none'; }, 220);
}
