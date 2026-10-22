// 输入系统:键盘/鼠标状态与坐标换算。监听器在 attach 时安装,
// 游戏对象(轮盘/背包/菜单/玩家)通过 hooks 回调访问 —— 输入层不 import 业务模块。
export const input = { left: false, right: false, down: false, fire: false, jumpPressed: false };
export const mouse = { x: 0, y: 0, cx: 0, cy: 0, active: false };

const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyS: 'down', ArrowDown: 'down',
  Space: 'fire',
};

// canvas 是 object-fit:contain,要算黑边偏移
export function toCanvas(e, W, H) {
  const r = e.target.getBoundingClientRect();
  const scale = Math.max(r.width / W, r.height / H); // canvas 是 object-fit:cover,取大边并做裁切偏移
  return {
    cx: (e.clientX - r.left - (r.width - W * scale) / 2) / scale,
    cy: (e.clientY - r.top - (r.height - H * scale) / 2) / scale,
  };
}

// camRef 由 camera 系统注入(避免 input → camera → input 的环)
let camRef = null;
export function bindCamera(cam) { camRef = cam; }
export function toWorld(e, W, H, PPM) {
  const { cx, cy } = toCanvas(e, W, H);
  return { x: (cx - W / 2) / PPM + camRef.x, y: (H * 0.60 - cy) / PPM + camRef.y };
}

// hooks: { W,H,PPM, canvas, wheel, bpIsOpen, menuIsOpen, menuToggle, getPlayer, resetPlayer, isDebug()|toggleDebug(), initAudio }
export function attachInput(hooks) {
  const { canvas, wheel } = hooks;
  window.addEventListener('keydown', (e) => {
    const pauseKey = e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyM';
    if (hooks.helpIsOpen && hooks.helpIsOpen()) { // 说明面板开着:Esc 只关面板
      if (pauseKey && !e.repeat) { e.preventDefault(); hooks.helpClose(); }
      return;
    }
    if (hooks.bpIsOpen() && pauseKey) return; // 背包开着:Esc 归背包关背包,其余暂停键忽略
    if (hooks.corpseIsOpen && hooks.corpseIsOpen()) {
      if (!e.repeat) { e.preventDefault(); hooks.corpseClose(); } // 搜尸面板:任意暂停键/Tab 关闭
      return;
    }
    if (hooks.menuIsOpen()) {
      // 主菜单/暂停期间:暂停键或 Enter/空格继续;其余按键全部吞掉(防背后开枪/切武器)
      if ((pauseKey || e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
        e.preventDefault(); hooks.menuToggle(); hooks.initAudio();
      }
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      return;
    }
    if (pauseKey && !e.repeat) {
      if (wheel.open) wheel.forceClose();
      hooks.menuToggle(); // 暂停 = 主菜单合门,世界进入慢速待机
      hooks.initAudio();
      return;
    }
    // Tab:站在尸体上 = 搜尸;否则 = 武器轮盘(必须 preventDefault,否则浏览器焦点切走)
    if (e.code === 'Tab') {
      e.preventDefault();
      if (hooks.corpseNearby && hooks.corpseNearby()) { hooks.corpseOpen(); hooks.initAudio(); return; }
      if (!e.repeat && !wheel.open) wheel.openWheel();
      hooks.initAudio();
      return;
    }
    if (wheel.open && e.code === 'KeyT') { e.preventDefault(); wheel.toggleMode(); return; }
    if (KEYMAP[e.code]) {
      if (e.code === 'Space') e.preventDefault();
      input[KEYMAP[e.code]] = true;
    }
    if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) input.jumpPressed = true;
    if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyN') { hooks.toggleNightVision?.(); hooks.initAudio(); return; } // N: 夜视仪
    if (e.code === 'KeyL') { hooks.toggleFlashlight?.(); hooks.initAudio(); return; } // L: 战术手电筒
    if (e.code === 'KeyV') hooks.getPlayer().melee(); // 近战:枪托/盾牌冲撞
    if (e.code === 'KeyF') { // 手雷:朝鼠标位置抛(冷却中静默失败,HUD 上看得到读条)
      const ok = hooks.getPlayer().grenade?.({ x: mouse.x, y: mouse.y });
      if (ok) hooks.initAudio();
    }
    if (e.code === 'KeyG') {
      if (wheel.open) wheel.forceClose();
      hooks.bpToggle();
      hooks.initAudio();
      return;
    }
    if (e.code === 'KeyR') {
      const p = hooks.getPlayer();
      // R 换弹;Shift+R 保留开发用的纯布娃娃测试入口。
      if (e.shiftKey) p.setRagdoll(!p.ragdoll);
      else p.reload?.();
    }
    if (e.code === 'KeyE') {
      const handled = hooks.interact && hooks.interact();
      if (!handled) hooks.resetPlayer();
    }
    if (e.code === 'KeyX') hooks.getPlayer().toggleSuppressor?.();
    if (e.code === 'KeyB') hooks.toggleDebug();
    if (e.code === 'KeyQ') hooks.getPlayer().setWeapon(hooks.getPlayer().weapon === 'rifle' ? 'pistol' : 'rifle');
    if (e.code === 'Digit1') hooks.getPlayer().setWeapon('rifle');
    if (e.code === 'Digit2') hooks.getPlayer().setWeapon('pistol');
    hooks.initAudio();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Tab') { if (wheel.open) wheel.release(); return; }
    if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
  });
  window.addEventListener('blur', () => {
    input.left = input.right = input.down = input.fire = false;
    wheel.forceClose(); // 失焦必须收起,否则子弹时间卡住
  });

  canvas.addEventListener('mousemove', (e) => {
    const p = toWorld(e, hooks.W, hooks.H, hooks.PPM);
    mouse.x = p.x; mouse.y = p.y; mouse.active = true;
    const c = toCanvas(e, hooks.W, hooks.H);
    mouse.cx = c.cx; mouse.cy = c.cy; // 画布坐标:开镜相机平移量用它算(屏幕点不随相机漂移)
    wheel.setMouse(c.cx, c.cy); // 轮盘吃画布坐标(扇区选择)
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (wheel.open) { wheel.confirm(); hooks.initAudio(); return; } // 左键 = 立即应用并收起,不开火
    const p = toWorld(e, hooks.W, hooks.H, hooks.PPM);
    mouse.x = p.x; mouse.y = p.y; mouse.active = true;
    input.fire = true;
    hooks.initAudio();
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
}
