// HERO 音频系统：原创合成 WAV + Web Audio 程序化兜底。
// 分层总线：master -> low-health muffle -> destination；世界声音支持距离衰减与左右声像。
// 声音素材在 public/audio/*.wav，由本项目的 generate_sfx.py 程序合成，无外部运行时依赖。
let actx = null;
let master = null, muffle = null;
const uiBufs = Object.create(null);
const sfxBufs = Object.create(null);
let uiLoaded = false;
let sfxLoadPromise = null;
let noiseBuf = null;
let activeVoices = 0;
const MAX_SFX_VOICES = 54;
const loopVoices = new Map();
let ambientVoice = null;
let ambientScene = '';
const footstepTimes = new WeakMap();
const impactTimes = new WeakMap();
const impactTypeLastAt = new Map();
const radioLastAt = new Map();
let radioGlobalLastAt = -Infinity;

const SFX_FILES = {
  'gun-ak': 'gun-ak.wav',
  'gun-m4': 'gun-m4.wav',
  'gun-awp': 'gun-awp.wav',
  'gun-smg': 'gun-smg.wav',
  'gun-shotgun': 'gun-shotgun.wav',
  'gun-pistol': 'gun-pistol.wav',
  'gun-heli': 'gun-heli.wav',
  'gun-echo': 'gun-echo.wav',
  'rocket-launch': 'rocket-launch.wav',
  'explosion-small': 'explosion-small.wav',
  'explosion-large': 'explosion-large.wav',
  'impact-armor': 'impact-armor.wav',
  'impact-flesh': 'impact-flesh.wav',
  'ricochet': 'ricochet.wav',
  // Keep every runtime request tied to a checked-in file. Surface character is refined by pitch/volume.
  'footstep-dirt': 'footstep-dirt.wav',
  'footstep-metal': 'footstep-metal.wav',
  'jump': 'jump.wav',
  'land': 'land.wav',
  'reload-rifle-start': 'reload-rifle-start.wav',
  'reload-rifle-end': 'reload-rifle-end.wav',
  'reload-shotgun-start': 'reload-shotgun-start.wav',
  'reload-shotgun-end': 'reload-shotgun-end.wav',
  'radio-alert': 'radio-alert.wav',
  'enemy-grunt': 'enemy-grunt.wav',
  'player-grunt': 'player-grunt.wav',
  'enemy-death': 'enemy-death.wav',
  'drone-dive': 'drone-dive.wav',
  'helicopter-loop': 'helicopter-loop.wav',
  'ambient-wild': 'ambient-wild.wav',
  'ambient-roof': 'ambient-roof.wav',
  'ambient-room': 'ambient-room.wav',
  'ambient-desert': 'ambient-desert.wav',
  'ambient-tropic': 'ambient-tropic.wav',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randomBetween = (a, b) => a + Math.random() * (b - a);
const outNode = () => master || actx?.destination;

export function initAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return; }
  }
  if (actx && !master) {
    master = actx.createGain();
    master.gain.value = 0.86;
    muffle = actx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 16000;
    master.connect(muffle);
    muffle.connect(actx.destination);
  }
  // 浏览器要求用户手势后恢复 Context；不在模块加载时自动播放。
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  loadUiSounds();
  preloadGameAudio();
}

export function setMasterVolume(v) {
  if (master && actx) master.gain.setTargetAtTime(clamp(Number(v) || 0, 0, 1), actx.currentTime, 0.04);
}

export function getActx() { return actx; }

// 兼容现有 gameplay/UI 事件使用的短提示音 API；新枪声不再依赖它，但盾牌/心跳等事件仍需要。
export function beep(f0, f1, dur, type = 'square', vol = 0.08, at = 0) {
  if (!actx) return;
  const duration = clamp(Number(dur) || 0.08, 0.012, 2.0);
  const bus = createVoiceBus({}, 1);
  if (!bus) return;
  try {
    const t0 = actx.currentTime + Math.max(0, Number(at) || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, Number(f0) || 440), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, Number(f1) || 220), t0 + duration);
    g.gain.setValueAtTime(clamp(Number(vol) || 0, 0, 0.8), t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);
    o.connect(g).connect(bus.input);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch {} bus.finish(); };
    o.start(t0); o.stop(t0 + duration);
  } catch { bus.finish(); }
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SFX HTTP ${res.status}: ${url}`);
  const data = await res.arrayBuffer();
  return await actx.decodeAudioData(data);
}

async function loadUiSounds() {
  if (uiLoaded || !actx) return;
  uiLoaded = true;
  for (const name of ['click-a', 'click-b', 'switch-a', 'switch-b', 'tap-a', 'tap-b']) {
    try { uiBufs[name] = await fetchBuffer(`./ui/kenney/${name}.ogg`); }
    catch { /* 素材缺失时静默回退，UI 不能因音频失败报错 */ }
  }
}

export function preloadGameAudio() {
  if (!actx) return Promise.resolve(false);
  if (sfxLoadPromise) return sfxLoadPromise;
  sfxLoadPromise = (async () => {
    await Promise.all(Object.entries(SFX_FILES).map(async ([name, file]) => {
      try { sfxBufs[name] = await fetchBuffer(`./audio/${file}`); }
      catch { /* 保留程序化合成兜底 */ }
    }));
    return Object.keys(sfxBufs).length > 0;
  })();
  return sfxLoadPromise;
}

export function uiSfx(kind = 'click-a', vol = 0.35) {
  if (!actx) return 0;
  loadUiSounds();
  const buf = uiBufs[kind];
  if (!buf) return 0; // 资源未载入时由调用方的 beep 兜底
  if (activeVoices >= MAX_SFX_VOICES) return 1;
  try {
    const src = actx.createBufferSource();
    src.buffer = buf;
    const g = actx.createGain();
    g.gain.value = clamp(vol, 0, 1);
    src.connect(g).connect(outNode());
    activeVoices++;
    src.onended = () => { activeVoices = Math.max(0, activeVoices - 1); try { src.disconnect(); g.disconnect(); } catch {} };
    src.start();
    return 1;
  } catch { return 0; }
}

// 世界坐标声场：按距离衰减，并按声源相对于玩家的横向位置分配左右声像。
function spatialInfo(opts = {}) {
  const { x, y, listenerX, listenerY } = opts;
  if (![x, y, listenerX, listenerY].every(Number.isFinite)) return { attenuation: 1, pan: 0, distance: 0 };
  const dx = x - listenerX, dy = y - listenerY;
  const distance = Math.hypot(dx, dy);
  const maxDistance = Math.max(1, opts.maxDistance ?? 42);
  if (distance >= maxDistance) return { attenuation: 0, pan: clamp(dx / (maxDistance * 0.36), -1, 1), distance };
  // 近处保留冲击力，远处快速退低；比单纯线性淡出更自然。
  const attenuation = clamp(1 / (1 + distance * 0.075 + distance * distance * 0.0016), 0, 1);
  return { attenuation, pan: clamp(dx / (maxDistance * 0.36), -1, 1), distance };
}

function createVoiceBus(opts = {}, baseVolume = 1) {
  if (!actx || activeVoices >= MAX_SFX_VOICES) return null;
  const sp = spatialInfo(opts);
  if (sp.attenuation <= 0.001) return null;
  try {
    const gain = actx.createGain();
    gain.gain.value = clamp(baseVolume * sp.attenuation, 0, 1.3);
    let panner = null;
    if (typeof actx.createStereoPanner === 'function') {
      panner = actx.createStereoPanner();
      panner.pan.value = sp.pan;
      gain.connect(panner).connect(outNode());
    } else gain.connect(outNode());
    activeVoices++;
    let finished = false;
    return {
      input: gain,
      distance: sp.distance,
      finish() {
        if (finished) return;
        finished = true;
        activeVoices = Math.max(0, activeVoices - 1);
        try { gain.disconnect(); panner?.disconnect(); } catch {}
      },
    };
  } catch { return null; }
}

export function playSample(name, opts = {}) {
  if (!actx) return false;
  const buf = sfxBufs[name];
  if (!buf) return false;
  const sp = spatialInfo(opts);
  if (sp.attenuation <= 0.001 || activeVoices >= MAX_SFX_VOICES) return true; // 已处理但被距离/发声预算裁剪
  const bus = createVoiceBus(opts, opts.volume ?? 0.48);
  if (!bus) return true;
  try {
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = clamp(opts.pitch ?? randomBetween(0.965, 1.035), 0.78, 1.24);
    src.connect(bus.input);
    const now = actx.currentTime;
    src.onended = () => { bus.finish(); try { src.disconnect(); } catch {} };
    src.start(now + Math.max(0, opts.delay || 0));
    if (opts.echoTail === true && opts.source === 'enemy' && sp.distance > 12 && opts.distantTail !== false && Math.random() < 0.24) {
      // 少量远处尾音，避免每颗子弹都拖一条回声导致轰鸣。
      const delay = 0.09 + Math.min(0.1, sp.distance * 0.002);
      if (sfxBufs['gun-echo'] && activeVoices < MAX_SFX_VOICES - 2) {
        const echoBus = createVoiceBus({ ...opts, volume: (opts.volume ?? 0.48) * 0.13, delay: undefined }, (opts.volume ?? 0.48) * 0.13);
        if (echoBus) {
          const echo = actx.createBufferSource(); echo.buffer = sfxBufs['gun-echo']; echo.playbackRate.value = randomBetween(0.76, 0.90);
          const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1900;
          echo.connect(f).connect(echoBus.input);
          echo.onended = () => { echoBus.finish(); try { echo.disconnect(); f.disconnect(); } catch {} };
          echo.start(now + delay);
        }
      }
    }
    return true;
  } catch { bus.finish(); return false; }
}

// 音色的核心不是单一频率，而是低频压力波、清脆枪口裂响、宽频枪声主体与轻微机械尾声。
// s 仍消费 gunPresets.js 内每把枪的 sfx 参数；未知/自定义枪自动退回合成音。
function resolveGunSample(weaponName = '', source = '') {
  const n = String(weaponName || '').toLowerCase();
  if (source === 'helicopter' || n.includes('机炮') || n.includes('heli')) return 'gun-heli';
  if (n.includes('awp') || n.includes('狙击')) return 'gun-awp';
  if (n.includes('霰弹') || n.includes('shotgun')) return 'gun-shotgun';
  if (n.includes('mp5') || n.includes('smg')) return 'gun-smg';
  if (n.includes('m4')) return 'gun-m4';
  if (n.includes('ak')) return 'gun-ak';
  if (n.includes('手枪') || n.includes('pistol')) return 'gun-pistol';
  return '';
}

export function gunSynth(s, volMul = 1, opts = {}) {
  if (!s || !actx) return false;
  const sample = resolveGunSample(opts.weaponName, opts.source);
  const volume = (opts.volume ?? 0.78) * clamp(volMul, 0, 1.5);
  if (sample && playSample(sample, { ...opts, volume, maxDistance: opts.maxDistance ?? 46 })) return true;
  const bus = createVoiceBus(opts, volume);
  if (!bus) return false;
  const t0 = actx.currentTime;
  const variation = randomBetween(0.94, 1.06);
  const baseDur = clamp(s.dur || 0.12, 0.045, 0.5);
  const finalDur = baseDur * randomBetween(0.9, 1.08);
  // 4 层各自结束后再释放总线；不能只等待最后创建的短高频噪声，
  // 否则低频主体会在几十毫秒后被提前切掉（采样尚未解码时尤其明显）。
  let remainingLayers = 4;
  const finishLayer = () => {
    remainingLayers--;
    if (remainingLayers <= 0) bus.finish();
  };
  const addTone = (f0, f1, dur, type, peak, at = 0) => {
    const o = actx.createOscillator(), g = actx.createGain();
    const st = t0 + at, end = st + dur;
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, f0 * variation), st);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * variation), end);
    g.gain.setValueAtTime(0.0001, st);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), st + Math.min(0.004, dur * 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g).connect(bus.input);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch {} finishLayer(); };
    o.start(st); o.stop(end);
  };
  const addNoise = (dur, peak, cutoff, highpass = false, at = 0) => {
    if (!noiseBuf) {
      const n = Math.floor(actx.sampleRate * 0.4);
      noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = clamp(0.4 / dur, 0.25, 4);
    const f = actx.createBiquadFilter(); f.type = highpass ? 'highpass' : 'lowpass'; f.frequency.value = cutoff;
    const g = actx.createGain(); const st = t0 + at, end = st + dur;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), st + Math.min(0.0025, dur * 0.1));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(f).connect(g).connect(bus.input);
    src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch {} finishLayer(); };
    src.start(st); src.stop(end);
  };
  try {
    // 低频压力波，音量低于主体但决定武器重量。
    addTone(Math.max(48, s.f0 * 0.45), Math.max(36, s.f1 * 0.8), finalDur * 1.08, 'sine', clamp((s.vol || 0.1) * 1.8, 0.07, 0.27));
    // 中高频瞬态，给步枪/手枪更清楚的“啪”；低音武器则更短更暗。
    addTone(Math.max(110, s.f0 * 1.85), Math.max(70, s.f1 * 1.6), finalDur * 0.55, 'sawtooth', clamp((s.vol || 0.1) * 1.55, 0.06, 0.23));
    addNoise(finalDur * 0.68, clamp((s.noise || 0.1) * 1.85, 0.07, 0.26), s.cutoff || 1000, false, 0);
    addNoise(Math.min(0.035, finalDur * 0.25), clamp((s.noise || 0.1) * 0.72, 0.025, 0.10), 5200, true, 0);
    return true;
  } catch { bus.finish(); return false; }
}

export function noiseBurst(dur = 0.05, vol = 0.08, cutoff = 1200, opts = {}) {
  if (!actx) return;
  const bus = createVoiceBus(opts, 1);
  if (!bus) return;
  try {
    if (!noiseBuf) {
      const n = Math.floor(actx.sampleRate * 0.4);
      noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = clamp(0.4 / dur, 0.25, 4);
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = actx.createGain(); const t = actx.currentTime;
    g.gain.setValueAtTime(Math.max(0.0001, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus.input);
    src.onended = () => { bus.finish(); try { src.disconnect(); f.disconnect(); g.disconnect(); } catch {} };
    src.start(); src.stop(t + dur);
  } catch { bus.finish(); }
}

function fallbackClick(opts, strong = false) {
  if (!actx) return;
  const vol = (opts.volume ?? 0.32);
  noiseBurst(strong ? 0.055 : 0.03, vol * 0.27, strong ? 1700 : 2800, opts);
  const f = strong ? 420 : 920;
  beep(f * randomBetween(0.94, 1.06), f * (strong ? 0.42 : 1.38), strong ? 0.075 : 0.045, strong ? 'triangle' : 'square', vol * 0.16);
}

export function playReloadSound(phase = 'start', weaponName = '', opts = {}) {
  const shotgun = String(weaponName).includes('霰弹') || String(weaponName).toLowerCase().includes('shotgun');
  const name = `reload-${shotgun ? 'shotgun' : 'rifle'}-${phase === 'end' ? 'end' : 'start'}`;
  const v = opts.source === 'enemy' ? 0.30 : (opts.volume ?? 0.58);
  if (!playSample(name, { ...opts, volume: v, maxDistance: opts.maxDistance ?? 32 })) fallbackClick({ ...opts, volume: v }, phase === 'end');
}

export function playRadioVoice(kind = 'alert', opts = {}) {
  if (!actx) return;
  const now = actx.currentTime;
  const k = kind === 'death' ? 'death' : kind === 'hurt' ? 'hurt' : 'alert';
  const gap = k === 'hurt' ? 0.22 : 0.55;
  // 死亡呼声优先级高于同一物理步里的受击短呼，不能被上一条 hurt 的全局节流吞掉。
  if (now - (radioLastAt.get(k) ?? -Infinity) < gap || (k !== 'death' && now - radioGlobalLastAt < 0.13)) return;
  radioLastAt.set(k, now); radioGlobalLastAt = now;
  const name = k === 'hurt' ? 'enemy-grunt' : k === 'death' ? 'enemy-death' : 'radio-alert';
  const vol = opts.source === 'player' ? 0.42 : (opts.volume ?? (k === 'alert' ? 0.32 : 0.38));
  if (!playSample(name, { ...opts, volume: vol, maxDistance: opts.maxDistance ?? 24, pitch: randomBetween(0.94, 1.07), distantTail: false })) {
    // 低资源/素材加载失败时，保留低保真的无线电短呼与静电门限。
    noiseBurst(0.04, vol * 0.22, 3300, opts);
    beep(k === 'death' ? 190 : k === 'hurt' ? 260 : 440,
      k === 'death' ? 90 : k === 'hurt' ? 150 : 660, k === 'death' ? 0.16 : 0.09,
      'triangle', vol * 0.22);
  }
}

let playerHurtLastAt = -Infinity;
export function playPlayerHurt(opts = {}) {
  if (!actx) return;
  const now = actx.currentTime;
  if (now - playerHurtLastAt < 0.48) return;
  playerHurtLastAt = now;
  if (!playSample('player-grunt', { ...opts, volume: opts.volume ?? 0.28, maxDistance: opts.maxDistance ?? 18, source: 'player', distantTail: false })) {
    // 素材加载失败时轻量回退，不用尖锐高频提示音掩盖战斗。
    noiseBurst(0.065, 0.035, 850, opts);
  }
}

export function playFootstep(opts = {}) {
  if (!actx) return;
  const now = actx.currentTime;
  const emitter = opts.emitter;
  if (emitter && (typeof emitter === 'object' || typeof emitter === 'function')) {
    // 避免物理步抖动导致脚步音重复触发；脚步节奏由角色步态相位控制。
    const minGap = opts.source === 'enemy' ? 0.17 : 0.16;
    const last = footstepTimes.get(emitter) ?? -Infinity;
    if (now - last < minGap) return;
    footstepTimes.set(emitter, now);
  }
  const scene = opts.scene || (() => { try { return localStorage.getItem('contra-scene') || 'wild'; } catch { return 'wild'; } })();
  // 依场景选地面：野外/沙地用泥土，屋顶用柔化金属，室内与剿匪建筑用混凝土。
  let surface = opts.material;
  if (!surface) {
    if (scene === 'roof' || scene === 'port') surface = 'metal';
    else if (scene === 'room' || scene === 'raid') surface = 'concrete';
    else surface = 'dirt';
  }
  if (!['dirt', 'concrete', 'metal'].includes(surface)) surface = 'dirt';
  // 当前仓库只有泥土/金属两个原始采样；混凝土复用泥土采样并降低音高，避免请求不存在的变体文件。
  const names = surface === 'metal' ? ['footstep-metal'] : ['footstep-dirt'];
  const chosen = 0;
  const isEnemy = opts.source === 'enemy';
  const requested = opts.volume ?? (isEnemy ? 0.18 : 0.22);
  const sneaking = !!(opts.stealth || opts.crouching || opts.emitter?.crouch);
  const sneakScale = sneaking ? 0.52 : 1;
  // 调低基础声压；金属脚步额外削一点，防止齿音刺耳。声音半径也比枪声短很多。
  const surfaceScale = surface === 'metal' ? 0.86 : 1;
  const vol = clamp(requested * (isEnemy ? 0.42 : 0.34) * sneakScale * surfaceScale, 0.008, 0.13);
  const maxDistance = opts.maxDistance ?? (isEnemy ? 13 : 10);
  // 若文件仍在异步解码中，宁可暂时不播，也不要退回原先粗糙、偏响的宽带噪声。
  playSample(names[chosen], {
    ...opts,
    volume: vol,
    maxDistance,
    pitch: surface === 'concrete' ? randomBetween(0.90, 0.99) : randomBetween(0.93, 1.08),
    distantTail: false,
    echoTail: false,
  });
}

export function playMovementSound(kind = 'land', opts = {}) {
  const name = kind === 'jump' ? 'jump' : 'land';
  const vol = opts.volume ?? (kind === 'land' ? 0.5 : 0.3);
  if (!playSample(name, { ...opts, volume: vol, maxDistance: opts.maxDistance ?? 24, distantTail: false })) {
    if (kind === 'land') noiseBurst(0.075, vol * 0.2, 750, opts);
    else beep(240, 520, 0.1, 'triangle', vol * 0.16);
  }
}

export function playImpactSound(kind = 'armor', opts = {}) {
  // 同一目标在散弹/自动武器下可能连续多帧被多枚弹丸命中；对同一发声实体
  // 做短节流，保留不同敌人的命中声，不把高射速变成刺耳的连续叮声。
  const emitter = opts.emitter;
  const now = actx?.currentTime ?? 0;
  if (kind === 'ricochet') {
    if (now - (impactTypeLastAt.get(kind) ?? -Infinity) < 0.06) return;
    impactTypeLastAt.set(kind, now);
  }
  if (emitter && (typeof emitter === 'object' || typeof emitter === 'function')) {
    if (now - (impactTimes.get(emitter) ?? -Infinity) < 0.045) return;
    impactTimes.set(emitter, now);
  }
  const name = kind === 'flesh' ? 'impact-flesh' : kind === 'ricochet' ? 'ricochet' : 'impact-armor';
  const vol = opts.volume ?? (kind === 'flesh' ? 0.28 : 0.34);
  if (!playSample(name, { ...opts, volume: vol, maxDistance: opts.maxDistance ?? 26, distantTail: false })) {
    if (kind === 'flesh') noiseBurst(0.045, vol * 0.22, 900, opts);
    else beep(kind === 'ricochet' ? 1700 : 1150, kind === 'ricochet' ? 2400 : 720, 0.055, 'triangle', vol * 0.18);
  }
}

export function playExplosion(big = false, opts = {}) {
  const name = big ? 'explosion-large' : 'explosion-small';
  const vol = opts.volume ?? (big ? 0.88 : 0.57);
  if (!playSample(name, { ...opts, volume: vol, maxDistance: opts.maxDistance ?? 55, distantTail: false })) {
    noiseBurst(big ? 0.42 : 0.18, big ? 0.11 : 0.075, big ? 520 : 1000, opts);
    if (big) beep(70, 30, 0.45, 'sawtooth', 0.09);
  }
}

export function playRocketLaunch(opts = {}) {
  if (!playSample('rocket-launch', { ...opts, volume: opts.volume ?? 0.52, maxDistance: opts.maxDistance ?? 40 })) {
    noiseBurst(0.22, 0.07, 700, opts);
    beep(120, 70, 0.19, 'sawtooth', 0.06);
  }
}

// 直升机旋翼/发动机作为一个可循环声源，按每架飞机的位置、距离和坠落状态更新。
// 每架机只创建一个 AudioBufferSource，绝不在每帧重新创建振荡器或噪声节点。
export function updateAircraftLoop(id, x, y, listenerX, listenerY, active = true, kind = 'gunship', intensity = 1) {
  if (!actx || !id) return;
  if (!active || !sfxBufs['helicopter-loop']) { if (!active) stopAircraftLoop(id); return; }
  let voice = loopVoices.get(id);
  if (!voice) {
    try {
      const src = actx.createBufferSource(); src.buffer = sfxBufs['helicopter-loop']; src.loop = true;
      src.playbackRate.value = kind === 'transport' ? 0.92 : 1.0;
      const filter = actx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = kind === 'transport' ? 1250 : 1950;
      const gain = actx.createGain(); gain.gain.value = 0.0001;
      let panner = null;
      if (typeof actx.createStereoPanner === 'function') {
        panner = actx.createStereoPanner(); panner.pan.value = 0;
        src.connect(filter).connect(gain).connect(panner).connect(outNode());
      } else src.connect(filter).connect(gain).connect(outNode());
      src.start();
      voice = { src, filter, gain, panner, lastSet: -Infinity, stopping: false };
      loopVoices.set(id, voice);
    } catch { return; }
  }
  if (voice.stopping) return;
  const sp = spatialInfo({ x, y, listenerX, listenerY, maxDistance: kind === 'transport' ? 48 : 44 });
  const kindVol = kind === 'transport' ? 0.42 : 0.56;
  const target = sp.attenuation * kindVol * clamp(intensity, 0, 1.2);
  if (voice.panner) voice.panner.pan.setTargetAtTime(sp.pan, actx.currentTime, 0.12);
  // 约每 90ms 更新一次 AudioParam，避免 60FPS 下持续排入自动化事件。
  if (actx.currentTime - voice.lastSet > 0.09) {
    const rpm = clamp(intensity, 0, 1);
    const nominalRate = kind === 'transport' ? 0.92 : 1.0;
    const nominalCutoff = kind === 'transport' ? 1250 : 1950;
    voice.src.playbackRate.setTargetAtTime(nominalRate * (0.68 + rpm * 0.32), actx.currentTime, 0.18);
    voice.filter.frequency.setTargetAtTime(nominalCutoff * (0.64 + rpm * 0.36), actx.currentTime, 0.18);
    voice.gain.gain.setTargetAtTime(target, actx.currentTime, 0.16);
    voice.lastSet = actx.currentTime;
  }
}

export function stopAircraftLoop(id) {
  const voice = loopVoices.get(id);
  if (!voice || voice.stopping || !actx) return;
  voice.stopping = true;
  try {
    voice.gain.gain.setTargetAtTime(0.0001, actx.currentTime, 0.055);
    voice.src.stop(actx.currentTime + 0.24);
  } catch {}
  setTimeout(() => {
    try { voice.src.disconnect(); voice.filter.disconnect(); voice.gain.disconnect(); voice.panner?.disconnect(); } catch {}
    loopVoices.delete(id);
  }, 300);
}

export function stopAllWorldLoops() {
  for (const id of loopVoices.keys()) stopAircraftLoop(id);
}

const AMBIENCE_SCENES = {
  wild: 'ambient-wild', custom: 'ambient-wild', roof: 'ambient-roof',
  room: 'ambient-room', port: 'ambient-room', desert: 'ambient-desert', tropic: 'ambient-tropic',
};

// 轻量环境底噪：每次仅有一个场景循环，换图用 0.25~0.4s 交叉淡入淡出。
// 每帧调用是安全的；同一场景会快速返回，不会反复创建音频节点。
export function updateSceneAmbience(scene = 'wild') {
  if (!actx) return;
  const key = Object.hasOwn(AMBIENCE_SCENES, scene) ? scene : 'wild';
  const name = AMBIENCE_SCENES[key];
  if (ambientScene === key && ambientVoice && !ambientVoice.stopping) return;
  const buf = sfxBufs[name];
  if (!buf) return; // 素材还在异步解码；下一帧会重试，不影响游戏。
  const old = ambientVoice;
  try {
    const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = actx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = key === 'room' ? 1750 : key === 'port' ? 2500 : 5200;
    const gain = actx.createGain(); gain.gain.setValueAtTime(0.0001, actx.currentTime);
    src.connect(filter).connect(gain).connect(outNode());
    const voice = { src, filter, gain, stopping: false };
    src.onended = () => {
      try { src.disconnect(); filter.disconnect(); gain.disconnect(); } catch {}
      if (ambientVoice === voice) ambientVoice = null;
    };
    src.start();
    gain.gain.setTargetAtTime(0.105, actx.currentTime, 0.22);
    ambientVoice = voice; ambientScene = key;
    if (old) {
      old.stopping = true;
      try {
        old.gain.gain.cancelScheduledValues(actx.currentTime);
        old.gain.gain.setTargetAtTime(0.0001, actx.currentTime, 0.075);
        old.src.stop(actx.currentTime + 0.42);
      } catch {}
    }
  } catch { /* 环境层是装饰性声音，创建失败不影响核心音效 */ }
}

// 低血量闷化：x ∈ 0~1（0 = 清亮，1 = 全闷）
export function setMuffle(x) {
  if (muffle && actx) muffle.frequency.setTargetAtTime(700 + (1 - x) * 15300, actx.currentTime, 0.09);
}
