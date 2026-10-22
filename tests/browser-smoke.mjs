import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
  });
  await page.addInitScript(() => localStorage.setItem('contra-scene', 'raid'));
  const response = await page.goto('http://127.0.0.1:5199/game.html', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  assert(!!response && response.status() === 200, `game.html response status: ${response?.status() ?? 'no response'}`);
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__game === 'function' && typeof window.__lighting === 'function', { timeout: 10000 });
  await page.waitForTimeout(800);
  const boot = await page.evaluate(() => ({
    title: document.title,
    canvases: document.querySelectorAll('canvas').length,
    scene: window.__lighting().scene,
    renderError: window.__lastRenderError?.msg || null,
    renderLayerErrors: window.__renderLayerErrors || null,
    raidVisionError: window.__raidVisionError || null,
    frameError: window.__lastFrameError?.msg || null,
  }));
  assert(boot.canvases >= 1, 'game canvas was not created');
  assert(boot.scene === 'raid', `raid scene did not initialize: ${boot.scene}`);
  for (const key of ['renderError', 'renderLayerErrors', 'raidVisionError', 'frameError']) {
    if (boot[key] && (key !== 'renderLayerErrors' || Object.keys(boot[key]).length)) {
      failures.push(`${key}: ${JSON.stringify(boot[key])}`);
    }
  }

  // Leave the menu if it is open; wait for the insertion animation before moving the test actor.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3600);

  await page.keyboard.press('n');
  await page.waitForTimeout(80);
  let state = await page.evaluate(() => window.__lighting());
  assert(state.nightVision === true, 'N did not enable night vision');
  await page.keyboard.press('n');
  await page.keyboard.press('l');
  await page.waitForTimeout(80);
  state = await page.evaluate(() => window.__lighting());
  assert(state.nightVision === false, 'N did not disable night vision');
  assert(state.flashlightOn === true, 'L did not enable the flashlight');
  await page.keyboard.press('l');

  // Move the complete ragdoll rigid-body set beside a door, keeping joint-relative poses intact.
  await page.evaluate(() => {
    const player = window.__game().player;
    const p = player.torso.getPosition();
    const dx = 9.2 - p.x, dy = 1.0 - p.y;
    for (const body of player.allBodies) {
      const q = body.getPosition();
      body.setTransform({ x: q.x + dx, y: q.y + dy }, body.getAngle());
      body.setLinearVelocity({ x: 0, y: 0 });
      body.setAngularVelocity(0);
    }
  });
  await page.keyboard.press('e');
  await page.waitForTimeout(650);
  let doors = await page.evaluate(() => window.__level().filter((r) => r.type === 'door'));
  const openDoor = doors.find((r) => r.doorId === 'g-01');
  assert(openDoor?.doorOpen === true, 'E did not open the nearest raid door');
  assert((openDoor?.doorAngle || 0) > 0.8, 'door opening animation did not advance');

  // Move beside the main breaker and verify E toggles the same power state the renderer uses.
  await page.evaluate(() => {
    const player = window.__game().player;
    const p = player.torso.getPosition();
    const dx = 3.6 - p.x, dy = 1.0 - p.y;
    for (const body of player.allBodies) {
      const q = body.getPosition();
      body.setTransform({ x: q.x + dx, y: q.y + dy }, body.getAngle());
      body.setLinearVelocity({ x: 0, y: 0 });
      body.setAngularVelocity(0);
    }
  });
  await page.keyboard.press('e');
  await page.waitForTimeout(120);
  state = await page.evaluate(() => window.__lighting());
  assert(state.powerOn === false, 'E at main breaker did not cut building power');
  await page.keyboard.press('e');
  await page.waitForTimeout(120);
  state = await page.evaluate(() => window.__lighting());
  assert(state.powerOn === true, 'main breaker did not restore power');

  await page.waitForTimeout(500);
  const finalState = await page.evaluate(() => ({
    lighting: window.__lighting(),
    renderError: window.__lastRenderError?.msg || null,
    renderLayerErrors: window.__renderLayerErrors || null,
    raidVisionError: window.__raidVisionError || null,
    frameError: window.__lastFrameError?.msg || null,
  }));
  for (const key of ['renderError', 'renderLayerErrors', 'raidVisionError', 'frameError']) {
    if (finalState[key] && (key !== 'renderLayerErrors' || Object.keys(finalState[key]).length)) {
      failures.push(`${key}: ${JSON.stringify(finalState[key])}`);
    }
  }
  console.log('HERO browser smoke diagnostics:', JSON.stringify({ boot, finalState }, null, 2));
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('PASS: production build; npx vite /game.html; zero page/console errors; NVG, flashlight, door and breaker interactions.');
} finally {
  await browser.close();
}
