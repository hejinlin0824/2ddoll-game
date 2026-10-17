// 音频系统:WebAudio 全链路 —— 主链 master → 低通闷化(muffle)→ 扬声器。
// 合成音效:beep(振荡器)/ gunSynth(三层枪声:thump+crack+噪声爆,参数来自武器词条)。
// 低血量时 setMuffle(x) 压低截止频率(世界变闷)。零业务依赖,纯平台层。
let actx = null;
let master = null, muffle = null;

export function initAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* 无音频 */ } }
  if (actx && !master) {
    master = actx.createGain();
    muffle = actx.createBiquadFilter();
    muffle.type = 'lowpass'; muffle.frequency.value = 16000;
    master.connect(muffle); muffle.connect(actx.destination);
  }
  // 自动播放策略:即使在手势里创建,Context 也可能停在 suspended,必须显式恢复
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
}

const outNode = () => master || actx.destination;

// ---- UI 实录音效(Kenney UI Pack,CC0,public/ui/kenney/*.ogg)----
// 按钮点击/切换用真实采样,比合成 beep 更"成品";缺失/解码失败自动静默
const uiBufs = {};
let uiLoaded = false;
async function loadUiSounds() {
  if (uiLoaded || !actx) return;
  uiLoaded = true;
  for (const name of ['click-a', 'click-b', 'switch-a', 'switch-b', 'tap-a', 'tap-b']) {
    try {
      const res = await fetch(`./ui/kenney/${name}.ogg`);
      if (!res.ok) continue;
      uiBufs[name] = await actx.decodeAudioData(await res.arrayBuffer());
    } catch { /* 缺文件/格式不支持:静默回退合成音 */ }
  }
}
export function uiSfx(kind = 'click-a', vol = 0.35) {
  if (!actx) return 0;
  loadUiSounds();
  const buf = uiBufs[kind];
  if (!buf) return 0; // 没加载好就无声(首次点击的加载是异步的,第二次起有声)
  try {
    const src = actx.createBufferSource();
    src.buffer = buf;
    const g = actx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(outNode());
    src.start();
    return 1;
  } catch { return 0; }
}

export function getActx() { return actx; }

// f1 结频 / dur 时长 / at 延迟秒(心跳的双响用)
export function beep(f0, f1, dur, type = 'square', vol = 0.08, at = 0) {
  if (!actx) return;
  try {
    const t0 = actx.currentTime + at;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(outNode());
    o.start(t0); o.stop(t0 + dur);
  } catch { /* 忽略 */ }
}

// 三层枪声合成器(低频 thump + 主体 crack + 噪声爆),s = 武器词条的 sfx 域
export function gunSynth(s, volMul = 1) {
  if (!s || !actx) return;
  beep(s.f0 * 0.55, s.f1 * 0.55, s.dur * 1.25, 'sine', s.vol * 0.85 * volMul);
  beep(s.f0 * 1.7, s.f1 * 1.15, s.dur * 0.65, 'square', s.vol * 0.65 * volMul);
  noiseBurst(s.dur * 0.55, s.noise * volMul, s.cutoff);
}

// 噪声爆音:给枪声/气流"砰"的力度(缓冲只合成一次复用,每枪新建会造成 GC 卡顿)
let noiseBuf = null;
export function noiseBurst(dur = 0.05, vol = 0.08, cutoff = 1200) {
  if (!actx) return;
  try {
    if (!noiseBuf) {
      const n = Math.floor(actx.sampleRate * 0.4);
      noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = clamp(0.4 / dur, 0.25, 4); // 同一缓冲用播放速率近似不同时长
    const f = actx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    src.connect(f).connect(g).connect(outNode());
    src.start();
    src.stop(actx.currentTime + dur);
  } catch { /* 忽略 */ }
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 低血量闷化:x ∈ 0~1(0 = 清亮,1 = 全闷)
export function setMuffle(x) {
  if (muffle && actx) muffle.frequency.setTargetAtTime(700 + (1 - x) * 15300, actx.currentTime, 0.09);
}
