import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5199';
const failures = [];
const badResponses = [];
const failedRequests = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
try {
  // Smoke the operator appearance page before game boot. The preview must react immediately,
  // and the explicit Apply action must persist to the storage key consumed by Player.
  const appearancePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  appearancePage.on('pageerror', (error) => failures.push(`skin-studio pageerror: ${error.stack || error.message}`));
  appearancePage.on('console', (message) => {
    if (message.type() === 'error') failures.push(`skin-studio console.error: ${message.text()}`);
  });
  const appearanceResponse = await appearancePage.goto(`${baseURL}/skin-studio.html`, { waitUntil: 'networkidle', timeout: 30000 });
  assert(!!appearanceResponse && appearanceResponse.status() === 200, `skin-studio.html response status: ${appearanceResponse?.status() ?? 'no response'}`);
  await appearancePage.waitForSelector('#appearancePreview');
  await appearancePage.waitForTimeout(150);
  const previewBefore = await appearancePage.locator('#appearancePreview').evaluate((cv) => cv.toDataURL());
  await appearancePage.locator('[data-app-choice="hairStyle"][data-value="spiky"]').click();
  const previewAfter = await appearancePage.locator('#appearancePreview').evaluate((cv) => cv.toDataURL());
  assert(previewAfter !== previewBefore, 'hairstyle selection did not redraw the appearance preview');
  assert((await appearancePage.locator('#appearanceStageStatus').innerText()).includes('尚未应用'), 'appearance draft state did not update');
  await appearancePage.locator('#appearanceSave').click();
  const appearanceSaved = await appearancePage.evaluate(() => JSON.parse(localStorage.getItem('contra-appearance-v1') || 'null'));
  assert(appearanceSaved?.hairStyle === 'spiky', 'appearance Apply did not save the selected hairstyle');
  await appearancePage.screenshot({ path: 'artifacts/skin-studio.png', fullPage: true });

  // Regression: legacy image-part x/y are CENTER coordinates in old studio saves.
  // New saves serialize TOP-LEFT coordinates under an explicit schema marker.
  const equipmentPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  equipmentPage.on('pageerror', (error) => failures.push(`asset-studio pageerror: ${error.stack || error.message}`));
  equipmentPage.on('console', (message) => {
    if (message.type() === 'error') failures.push(`asset-studio console.error: ${message.text()}`);
  });
  await equipmentPage.addInitScript(() => {
    const assetSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#ffb14a"/></svg>';
    const dataURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(assetSvg);
    localStorage.setItem('contra-assets', JSON.stringify({ alignment_test_asset: dataURL }));
    localStorage.setItem('contra-equip-head', JSON.stringify({
      slot: 'head', name: 'legacy alignment fixture', meterScale: 200,
      parts: [{ img: 'alignment_test_asset', x: 10, y: -5, w: 20, h: 10, rot: 0 }],
    }));
  });
  const equipmentResponse = await equipmentPage.goto(`${baseURL}/asset-studio.html`, { waitUntil: 'networkidle', timeout: 30000 });
  assert(!!equipmentResponse && equipmentResponse.status() === 200, `asset-studio.html response status: ${equipmentResponse?.status() ?? 'no response'}`);
  await equipmentPage.waitForFunction(() => typeof window.__studio === 'object', undefined, { timeout: 10000 });
  const legacyPlaced = await equipmentPage.evaluate(() => window.__studio.getState().placed.head[0]);
  assert(legacyPlaced?.x === 10 && legacyPlaced?.y === -5, `legacy equipment pivot moved on load: ${JSON.stringify(legacyPlaced)}`);
  await equipmentPage.evaluate(() => window.__studio.save());
  const migratedEquipment = await equipmentPage.evaluate(() => JSON.parse(localStorage.getItem('contra-equip-head') || 'null'));
  assert(migratedEquipment?.coordinateSpace === 'top-left-v2', 'equipment save missing the coordinate-space version marker');
  assert(migratedEquipment?.parts?.[0]?.x === 0 && migratedEquipment?.parts?.[0]?.y === -10,
    `saved image part is not top-left normalized: ${JSON.stringify(migratedEquipment?.parts?.[0])}`);
  await equipmentPage.screenshot({ path: 'artifacts/asset-studio.png', fullPage: true });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error.message}`));
  page.on('response', (response) => { if (response.status() >= 400) badResponses.push({ status: response.status(), url: response.url() }); });
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
  });
  await page.addInitScript(() => localStorage.setItem('contra-scene', 'raid'));
  const response = await page.goto(`${baseURL}/game.html`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  assert(!!response && response.status() === 200, `game.html response status: ${response?.status() ?? 'no response'}`);
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__game === 'function' && typeof window.__lighting === 'function' && typeof window.__fog === 'object' && typeof window.__grapple === 'object', undefined, { timeout: 10000 });
  await page.waitForTimeout(800);
  const boot = await page.evaluate(() => ({
    title: document.title,
    canvases: document.querySelectorAll('canvas').length,
    scene: window.__lighting().scene,
    renderError: window.__lastRenderError?.msg || null,
    renderLayerErrors: window.__renderLayerErrors || null,
    raidVisionError: window.__raidVisionError || null,
    frameError: window.__lastFrameError?.msg || null,
    fog: window.__fog.state(),
    stairCount: window.__level().filter((r) => r.type === 'stair').length,
  }));
  assert(boot.canvases >= 1, 'game canvas was not created');
  assert(boot.fog?.scene === 'raid' && boot.fog.visiblePixelCount > 100, 'raid fog of war did not reveal a local visibility region');
  assert(boot.stairCount === 21, `raid traversal stairs missing: ${boot.stairCount}`);
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

  // Ctrl-click should launch a grappling hook toward the cursor and must not fire the weapon.
  await page.evaluate(() => {
    const player = window.__game().player;
    const dx = 20 - player.torso.getPosition().x, dy = 1.0 - player.torso.getPosition().y;
    for (const body of player.allBodies) {
      const q = body.getPosition();
      body.setTransform({ x: q.x + dx, y: q.y + dy }, body.getAngle());
      body.setLinearVelocity({ x: 0, y: 0 });
      body.setAngularVelocity(0);
    }
  });
  await page.waitForTimeout(450);
  const canvasBox = await page.locator('#game').boundingBox();
  const aimPoint = await page.evaluate(() => {
    const { cam } = window.__game();
    const cx = (30 - cam.x) * 52 * cam.zoom + 640 + (cam.oX || 0);
    const cy = 432 - (1.0 - cam.y) * 52 * cam.zoom + (cam.oY || 0);
    return { cx, cy };
  });
  const scale = Math.max(canvasBox.width / 1280, canvasBox.height / 720);
  const clickX = canvasBox.x + (canvasBox.width - 1280 * scale) / 2 + aimPoint.cx * scale;
  const clickY = canvasBox.y + (canvasBox.height - 720 * scale) / 2 + aimPoint.cy * scale;
  await page.mouse.click(clickX, clickY, { modifiers: ['Control'] });
  await page.waitForFunction(() => window.__grapple.state().active, undefined, { timeout: 1200 });
  const grappleCheck = await page.evaluate(() => ({ active: window.__grapple.state().active, fireHeld: window.__game().input.fire }));
  assert(grappleCheck.active, 'Ctrl-click did not latch the grappling hook');
  assert(!grappleCheck.fireHeld, 'Ctrl-click accidentally fired the weapon');
  await page.evaluate(() => window.__grapple.release());

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
    fog: window.__fog.state(),
    grapple: window.__grapple.state(),
    stairCount: window.__level().filter((r) => r.type === 'stair').length,
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
  if (badResponses.length) failures.push(`HTTP errors: ${JSON.stringify(badResponses)}`);
  if (failedRequests.length) failures.push(`Failed requests: ${JSON.stringify(failedRequests)}`);
  console.log('HERO browser smoke diagnostics:', JSON.stringify({ boot, finalState, badResponses, failedRequests }, null, 2));
  if (failures.length) throw new Error(failures.join('\n'));
  await page.screenshot({ path: 'artifacts/game.png', fullPage: true });
  await appearancePage.close();
  await equipmentPage.close();
  console.log('PASS: appearance preview/apply; equipment migration; production game render; raid FOW, stair route, Ctrl-click grapple, NVG, flashlight, door and breaker interactions.');
} finally {
  await browser.close();
}
