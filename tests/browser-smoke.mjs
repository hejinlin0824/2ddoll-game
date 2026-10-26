import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5199';
const failures = [];
const badResponses = [];
const failedRequests = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
try {
  // Smoke the rebuilt procedural operator armory. Selection redraws the Canvas2D rig,
  // and Apply persists the same schema consumed by Player in the game.
  const appearancePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  appearancePage.on('pageerror', (error) => failures.push(`skin-studio pageerror: ${error.stack || error.message}`));
  appearancePage.on('console', (message) => { if (message.type() === 'error') failures.push(`skin-studio console.error: ${message.text()}`); });
  const appearanceResponse = await appearancePage.goto(`${baseURL}/skin-studio.html`, { waitUntil: 'networkidle', timeout: 30000 });
  assert(!!appearanceResponse && appearanceResponse.status() === 200, `skin-studio.html response status: ${appearanceResponse?.status() ?? 'no response'}`);
  await appearancePage.waitForSelector('#preview');
  await appearancePage.waitForTimeout(150);
  const previewBefore = await appearancePage.locator('#preview').evaluate((cv) => cv.toDataURL());
  await appearancePage.locator('[data-field="kitStyle"][data-value="chest"]').click();
  await appearancePage.locator('[data-field="helmetStyle"][data-value="full"]').click();
  await appearancePage.locator('[data-color-input="armorColor"]').evaluate((el) => { el.value = '#4b5b67'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const previewAfter = await appearancePage.locator('#preview').evaluate((cv) => cv.toDataURL());
  assert(previewAfter !== previewBefore, 'modular kit selections did not redraw the Canvas2D preview');
  await appearancePage.locator('#apply').click();
  const appearanceSaved = await appearancePage.evaluate(() => JSON.parse(localStorage.getItem('contra-appearance-v1') || 'null'));
  assert(appearanceSaved?.kitStyle === 'chest', 'kit style was not persisted');
  assert(appearanceSaved?.helmetStyle === 'full', 'helmet style was not persisted');
  assert(appearanceSaved?.armorColor === '#4b5b67', 'armor color was not persisted');
  const cleanCanvasPng = await appearancePage.locator('#preview').evaluate((cv) => cv.toDataURL('image/png'));
  await writeFile('artifacts/skin-studio-rig.png', Buffer.from(cleanCanvasPng.split(',')[1], 'base64'));
  // Capture the surrounding control panel separately; avoid sticky-header overlays contaminating canvas-only art.
  await appearancePage.locator('.panel').first().screenshot({ path: 'artifacts/skin-kit-detail.png' });
  const savedProfile = await appearancePage.evaluate(() => JSON.parse(localStorage.getItem('contra-appearance-v1') || 'null'));
  assert(savedProfile?.backpack && savedProfile?.pads, 'modular equipment fields missing from appearance save');
  const skinGamePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  skinGamePage.on('pageerror', (error) => failures.push('operator kit game pageerror: ' + (error.stack || error.message)));
  skinGamePage.on('response', (r) => { if (r.status() >= 400) badResponses.push({ status: r.status(), url: r.url() }); });
  skinGamePage.on('requestfailed', (r) => failedRequests.push({ url: r.url(), error: r.failure()?.errorText || 'unknown' }));
  skinGamePage.on('console', (message) => { if (message.type() === 'error') failures.push('operator kit game console.error: ' + message.text()); });
  await skinGamePage.addInitScript((appearanceJson) => {
    localStorage.setItem('contra-appearance-v1', appearanceJson);
    localStorage.setItem('contra-scene', 'wild');
  }, JSON.stringify(appearanceSaved));
  const skinGameResponse = await skinGamePage.goto(baseURL + '/game.html', { waitUntil: 'networkidle', timeout: 30000 });
  assert(!!skinGameResponse && skinGameResponse.status() === 200, 'operator kit game page returned ' + (skinGameResponse?.status() ?? 'no response'));
  await skinGamePage.waitForFunction(() => typeof window.__game === 'function', undefined, { timeout: 10000 });
  // Click the actual deployment control; a bare Enter can be swallowed by the menu/focus layer.
  await skinGamePage.locator('#menuStart').click();
  await skinGamePage.waitForFunction(() => !document.body.classList.contains('in-menu'), undefined, { timeout: 8000 });
  await skinGamePage.waitForTimeout(450); // Let the leave transition clear before capturing the live operator.
  const gameAppearance = await skinGamePage.evaluate(() => JSON.parse(localStorage.getItem('contra-appearance-v1') || 'null'));
  const liveAppearance = await skinGamePage.evaluate(() => {
    const p = window.__game()?.player;
    return p?.appearance ? {
      kitStyle: p.appearance.kitStyle, helmetStyle: p.appearance.helmetStyle,
      eyewear: p.appearance.eyewear, pads: p.appearance.pads, backpack: p.appearance.backpack,
      torsoPosition: p.torso.getPosition().clone ? {
        x: p.torso.getPosition().x, y: p.torso.getPosition().y,
      } : null,
    } : null;
  });
  assert(gameAppearance?.kitStyle === 'chest' && gameAppearance?.helmetStyle === 'full',
    'game did not retain the new procedural appearance configuration');
  assert(liveAppearance?.kitStyle === 'chest' && liveAppearance?.helmetStyle === 'full',
    'live Player did not load the new modular appearance configuration: ' + JSON.stringify(liveAppearance));
  await skinGamePage.locator('#game').screenshot({ path: 'artifacts/skin-game-rig.png' });
  await skinGamePage.close();
  await appearancePage.close();

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
    roofCoverCount: window.__level().filter((r) => ['steel', 'crate', 'concrete'].includes(r.type)
      && r.y > 10.5 && (r.x < 45 || r.x > 55)).length,
    roofGuardCount: window.__game().enemies.filter((e) => e.raidMode && e.raidFloorId === 3 && !e.isReinforcement && e.alive).length,
    stairwellEnemies: window.__game().enemies.filter((e) => e.raidMode && e.alive && e.p)
      .map((e) => e.p.torso.getPosition().x).filter((x) => x >= 46.15 && x <= 53.85),
    campaign: window.__raid().campaign,
    dialogueElements: !!(document.getElementById('raidDialogue') && document.getElementById('raidMissionStatus')),
    intelTerminals: window.__level().filter((r) => r.type === 'intel').map((r) => ({ x: r.x, y: r.y, id: r.intelId, sensor: r.sensor })),
    intelObjective: /COMMS/.test(document.getElementById('raidMissionStatus')?.textContent || ''),
    stairLandings: [10.25, 6.75, 3.25].map((y) => window.__level()
      .filter((r) => r.type === 'concrete' && Math.abs(r.y - y) < 0.01)
      .map((r) => ({ left: +(r.x - r.w / 2).toFixed(3), right: +(r.x + r.w / 2).toFixed(3) }))),
  }));
  assert(boot.canvases >= 1, 'game canvas was not created');
  assert(boot.fog?.scene === 'raid' && boot.fog.visiblePixelCount > 100, 'raid fog of war did not reveal a local visibility region');
  assert(boot.stairCount === 60, `raid traversal stairs missing: ${boot.stairCount}`);
  assert(boot.roofCoverCount >= 5, `roof combat space is still empty: ${boot.roofCoverCount} cover pieces`);
  assert(boot.roofGuardCount >= 3, `roof insertion lacks a readable first engagement: ${boot.roofGuardCount} guards`);
  assert(boot.stairwellEnemies.length === 0, `raiders spawned into the reserved stair route: ${JSON.stringify(boot.stairwellEnemies)}`);
  for (const [i, spans] of boot.stairLandings.entries()) {
    assert(spans.length === 2 && spans[0].left === 0 && spans[0].right === 47
      && spans[1].left === 53 && spans[1].right === 74,
      `raid floor ${i + 1} does not leave the shared 6m stair opening: ${JSON.stringify(spans)}`);
  }
  assert(!boot.campaign?.completed, 'raid campaign should start incomplete');
  assert(boot.intelTerminals.length === 1 && boot.intelTerminals[0].id === 'missing-list'
    && boot.intelTerminals[0].sensor && boot.intelTerminals[0].x > 30 && boot.intelTerminals[0].x < 37,
    `missing-persons intel terminal should be discoverable without blocking movement: ${JSON.stringify(boot.intelTerminals)}`);
  assert(boot.intelObjective || !boot.campaign?.intelSecured, 'campaign HUD should indicate COMMS evidence before it is collected');
  assert(boot.dialogueElements, 'raid campaign HUD/dialogue elements are missing');
  assert(boot.scene === 'raid', `raid scene did not initialize: ${boot.scene}`);
  for (const key of ['renderError', 'renderLayerErrors', 'raidVisionError', 'frameError']) {
    if (boot[key] && (key !== 'renderLayerErrors' || Object.keys(boot[key]).length)) {
      failures.push(`${key}: ${JSON.stringify(boot[key])}`);
    }
  }

  // Exercise the real hitscan implementation in Chromium with isolated fake targets.
  // Targets live outside the visible level so the feedback sprites cannot pollute the visual screenshot.
  await page.waitForFunction(() => typeof window.__combat?.applyHitscanDamage === 'function', undefined, { timeout: 10000 });
  const hitscanCheck = await page.evaluate(() => {
    const makeTarget = (x, zone, alive = true) => {
      const hits = [];
      return {
        x, y: 100, radius: 0.4, zone, alive, hits,
        zoneAt: () => zone,
        hit(hitZone, damage, dir, armorMul) {
          hits.push({ zone: hitZone, damage, dir, armorMul });
          return { broke: null, absorbed: true };
        },
      };
    };
    const head = makeTarget(1003, 'head');
    const body = makeTarget(1006, 'body');
    const beyondRange = makeTarget(1030, 'body');
    const dead = makeTarget(1002, 'body', false);
    const behind = makeTarget(998, 'body');
    const C = {
      enemies: [body, beyondRange, behind, dead, head],
      player: { lifestealPct: 0, torso: { getPosition: () => ({ x: 1000, y: 100 }) } },
      pstate: { hp: 30, maxHp: 30 },
      particles: [],
    };
    window.__combat.applyHitscanDamage(C, {
      x: 1000, y: 100,
      parts: [{ dx: 1, dy: 0, damage: 10 }],
      stats: { range: 20, armorDmgMul: 1.5, falloff: 0.5 },
    }, 20);
    return {
      head: head.hits,
      body: body.hits,
      beyondRange: beyondRange.hits,
      dead: dead.hits,
      behind: behind.hits,
    };
  });
  assert(hitscanCheck.head.length === 1
    && hitscanCheck.head[0].zone === 'head'
    && hitscanCheck.head[0].damage === 20
    && hitscanCheck.head[0].armorMul === 1.5,
    `hitscan head-zone damage/armor contract failed: ${JSON.stringify(hitscanCheck)}`);
  assert(hitscanCheck.body.length === 1
    && hitscanCheck.body[0].damage === 5
    && hitscanCheck.body[0].armorMul === 1.5,
    `hitscan target ordering/falloff contract failed: ${JSON.stringify(hitscanCheck)}`);
  assert(hitscanCheck.beyondRange.length === 0 && hitscanCheck.dead.length === 0 && hitscanCheck.behind.length === 0,
    `hitscan must ignore dead, behind-muzzle, and out-of-range targets: ${JSON.stringify(hitscanCheck)}`);

  // Leave the menu if it is open; wait for the insertion animation before moving the test actor.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3600);
  const openingBriefing = await page.evaluate(() => ({
    campaign: window.__raid().campaign,
    objective: document.getElementById('raidMissionStatus')?.textContent || '',
    dialogueVisible: getComputedStyle(document.getElementById('raidDialogue')).display !== 'none',
    dialogueText: document.getElementById('raidDialogueText')?.textContent || '',
  }));
  assert(openingBriefing.campaign?.stage === 'assault', `campaign did not advance after roof insertion: ${JSON.stringify(openingBriefing.campaign)}`);
  assert(openingBriefing.dialogueVisible && /夜幕|失联名单/.test(openingBriefing.dialogueText),
    `opening radio briefing did not appear: ${JSON.stringify(openingBriefing)}`);
  assert(/目标 01\/04/.test(openingBriefing.objective), `initial mission objective missing: ${openingBriefing.objective}`);
  const firstRadioLine = openingBriefing.dialogueText;
  await page.waitForTimeout(6200);
  const heldRadioLine = await page.evaluate(() => document.getElementById('raidDialogueText')?.textContent || '');
  assert(heldRadioLine === firstRadioLine, `radio text disappeared before acknowledgement: ${heldRadioLine}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction((previous) => (window.__raid().campaign.activeDialogue?.text || '') !== previous,
    firstRadioLine, { timeout: 2500 });
  const secondRadioLine = await page.evaluate(() => window.__raid().campaign.activeDialogue?.text || '');
  await page.keyboard.press('Enter');
  await page.waitForFunction((previous) => (window.__raid().campaign.activeDialogue?.text || '') !== previous,
    secondRadioLine, { timeout: 2500 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__raid().campaign.activeDialogue, undefined, { timeout: 2500 });

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
  // Dispatch the real canvas input path at an exact world-space target. This avoids test flakiness
  // from moving the OS cursor while the follow camera is still easing after the deterministic teleport.
  const grappleCheck = await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(rect.width / 1280, rect.height / 720);
    const { cam, input } = window.__game();
    const target = { x: 30, y: 1.0 };
    const cx = (target.x - cam.x) * 52 * cam.zoom + 640 + (cam.oX || 0);
    const cy = 432 - (target.y - cam.y) * 52 * cam.zoom + (cam.oY || 0);
    const clientX = rect.left + (rect.width - 1280 * scale) / 2 + cx * scale;
    const clientY = rect.top + (rect.height - 720 * scale) / 2 + cy * scale;
    input.fire = false;
    canvas.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, button: 0, ctrlKey: true, clientX, clientY,
    }));
    const state = window.__grapple.state();
    const fireHeld = input.fire;
    window.__grapple.release();
    return { ...state, fireHeld, target, clientX, clientY, cam: { x: cam.x, y: cam.y, zoom: cam.zoom } };
  });
  assert(grappleCheck.active, `Ctrl-click did not latch the grappling hook: ${JSON.stringify(grappleCheck)}`);
  assert(!grappleCheck.fireHeld, 'Ctrl-click accidentally fired the weapon');

  // Start on the actual floor landing, not on the first stair tread. This verifies that the
  // player can discover/enter the stair flight as well as climb it with hold-W + movement.
  const stairFlights = [
    { floor: 'ground-to-level-2', x: 53.25, y: 0.9, direction: 'left', targetY: 4.25 },
    { floor: 'level-2-to-level-3', x: 46.75, y: 4.4, direction: 'right', targetY: 7.75 },
    { floor: 'level-3-to-roof', x: 53.25, y: 7.9, direction: 'left', targetY: 11.25 },
  ];
  for (const flight of stairFlights) {
    await page.evaluate((route) => {
      const { player, input } = window.__game();
      const p = player.torso.getPosition();
      const dx = route.x - p.x, dy = route.y - p.y;
      for (const body of player.allBodies) {
        const q = body.getPosition();
        body.setTransform({ x: q.x + dx, y: q.y + dy }, body.getAngle());
        body.setLinearVelocity({ x: 0, y: 0 });
        body.setAngularVelocity(0);
      }
      player.grounded = true;
      input.fire = false;
      input.left = route.direction === 'left';
      input.right = route.direction === 'right';
      // Verify the continuous collision ramp works with normal movement alone; no repeated jumps.
      input.jumpHeld = false;
      input.jumpPressed = false;
    }, flight);
    try {
      await page.waitForFunction((targetY) => {
        const { player } = window.__game();
        return player.torso.getPosition().y > targetY && player.grounded;
      }, flight.targetY, { timeout: 8000 });
    } catch (error) {
      const diagnostic = await page.evaluate((route) => {
        const g = window.__game();
        const { player, input } = g;
        const p = player.torso.getPosition();
        const v = player.torso.getLinearVelocity();
        const rampAngle = player.getStandingStairRampAngle?.() ?? null;
        const walkingSpeed = (player.crouch ? 1.6 : 4.6) * (1 + (player.moveSpeedPct || 0) / 100);
        const intendedVx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const rayHits = [];
        const downHits = [];
        const dir = route.direction === 'left' ? -1 : 1;
        const describeBody = (body) => {
          const bp = body.getPosition();
          const data = body.getUserData?.();
          return {
            type: body.getType?.(),
            position: { x: bp.x, y: bp.y },
            angle: body.getAngle?.(),
            userData: data && typeof data === 'object'
              ? { type: data.type, stairRampId: data.stairRampId }
              : data ?? null,
          };
        };
        g.world.rayCast({ x: p.x, y: p.y }, { x: p.x, y: p.y - 0.92 }, (fixture) => {
          downHits.push(describeBody(fixture.getBody()));
          return -1;
        });
        const playerBodies = new Set(player.allBodies);
        const touchingContacts = [];
        let contact = g.world.getContactList?.();
        while (contact) {
          const a = contact.getFixtureA?.().getBody?.();
          const b = contact.getFixtureB?.().getBody?.();
          if (contact.isTouching?.() && (playerBodies.has(a) || playerBodies.has(b))) {
            touchingContacts.push({ a: describeBody(a), b: describeBody(b) });
          }
          contact = contact.getNext?.();
        }
        g.world.rayCast({ x: p.x, y: p.y }, { x: p.x + dir * 0.34, y: p.y }, (fixture) => {
          const body = fixture.getBody();
          const bp = body.getPosition();
          const data = body.getUserData?.();
          rayHits.push({
            bodyType: body.getType?.(),
            bodyPosition: { x: bp.x, y: bp.y },
            bodyAngle: body.getAngle?.(),
            userData: data && typeof data === 'object'
              ? { type: data.type, stairRampId: data.stairRampId }
              : data ?? null,
            categoryBits: fixture.getFilterData?.()?.categoryBits,
            maskBits: fixture.getFilterData?.()?.maskBits,
          });
          return -1;
        });
        const nearStaticBodies = [];
        let body = g.world.getBodyList();
        while (body) {
          const bp = body.getPosition();
          if (body.getType?.() === 'static' && Math.abs(bp.x - p.x) < 1.25 && Math.abs(bp.y - p.y) < 1.5) {
            const data = body.getUserData?.();
            nearStaticBodies.push({
              position: { x: bp.x, y: bp.y }, angle: body.getAngle?.(),
              userData: data && typeof data === 'object'
                ? { type: data.type, stairRampId: data.stairRampId }
                : data ?? null,
            });
          }
          body = body.getNext();
        }
        return {
          route,
          position: { x: p.x, y: p.y, torsoAngle: player.torso.getAngle(), angularVelocity: player.torso.getAngularVelocity() },
          velocity: { x: v.x, y: v.y },
          rampControl: { rampAngle, intendedVx: intendedVx * walkingSpeed, expectedTangentVy: rampAngle === null ? null : intendedVx * walkingSpeed * Math.tan(rampAngle) },
          stairRampContactStats: g.world.__raidStairRampContactStats ? { ...g.world.__raidStairRampContactStats } : null,
          grounded: player.grounded,
          rayGrounded: player.checkGrounded(),
          input: { left: input.left, right: input.right, jumpHeld: input.jumpHeld, jumpPressed: input.jumpPressed },
          downHits,
          touchingContacts,
          rayHits,
          nearStaticBodies,
          ramps: window.__level().filter((r) => r.type === 'stairRamp')
            .map((r) => ({ id: r.stairRampId, x: r.x, y: r.y, w: r.w, h: r.h, angle: r.angle })),
          scene: localStorage.getItem('contra-scene'),
          introActive: !!window.__raid()?.rappel,
        };
      }, flight);
      throw new Error(`${flight.floor} stair traversal timeout: ${JSON.stringify(diagnostic)}; ${error.message}`);
    }
    const climb = await page.evaluate(() => {
      const { player, input } = window.__game();
      const p = player.torso.getPosition();
      input.left = false;
      input.right = false;
      input.jumpHeld = false;
      input.jumpPressed = false;
      return { x: p.x, y: p.y, grounded: player.grounded };
    });
    assert(climb.y > flight.targetY, `${flight.floor} stair flight failed: ${JSON.stringify(climb)}`);
    assert(flight.direction === 'left' ? climb.x < flight.x : climb.x > flight.x,
      `${flight.floor} did not move in the direction of its switchback: ${JSON.stringify(climb)}`);
  }

  const stairTraffic = await page.evaluate(() => window.__game().enemies
    .filter((e) => e.raidMode && e.alive && e.p)
    .map((e) => e.p.torso.getPosition().x)
    .filter((x) => x >= 46.15 && x <= 53.85));
  assert(stairTraffic.length === 0, `AI entered/camped in the stair route during traversal: ${JSON.stringify(stairTraffic)}`);

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

  // Full wave/transport delivery + real enemy armor/death loot + inventory economy loop.
  const gameplayPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  gameplayPage.on('pageerror', (error) => failures.push('gameplay pageerror: ' + (error.stack || error.message)));
  gameplayPage.on('response', (r) => { if (r.status() >= 400) badResponses.push({ status: r.status(), url: r.url() }); });
  gameplayPage.on('requestfailed', (r) => failedRequests.push({ url: r.url(), error: r.failure()?.errorText || 'unknown' }));
  gameplayPage.on('console', (message) => {
    if (message.type() === 'error') failures.push('gameplay console.error: ' + message.text());
  });
  await gameplayPage.addInitScript(() => localStorage.setItem('contra-scene', 'wild'));
  const gameplayResponse = await gameplayPage.goto(baseURL + '/game.html', { waitUntil: 'networkidle', timeout: 30000 });
  assert(!!gameplayResponse && gameplayResponse.status() === 200, 'wild gameplay page response status: ' + (gameplayResponse?.status() ?? 'no response'));
  await gameplayPage.waitForFunction(() => typeof window.__game === 'function' && typeof window.__combat === 'object', undefined, { timeout: 10000 });
  await gameplayPage.evaluate(() => {
    const g = window.__game();
    // Keep the real AI/physics/event loop running, but prevent a long automated scenario from
    // ending because of incidental enemy fire. These are test-fixture values, not game-code edits.
    g.pstate.maxHp = 9999;
    g.pstate.hp = 9999;
    window.__waveTestInitialEnemies = new Set(g.enemies);
    window.__waveTestFlights = [];
    const w = g.waves;
    w.queue = 0;
    w.roleQueue = [];
    w.heli = null;
    w.done = false;
    w.restT = 999;
  });
  await gameplayPage.keyboard.press('Enter');
  await gameplayPage.waitForFunction(() => !window.__feel().menu, undefined, { timeout: 8000 });
  await gameplayPage.waitForTimeout(150);

  const waveStart = await gameplayPage.evaluate(() => {
    const g = window.__game();
    const w = g.waves;
    w.wave = 3;
    w.queue = 0;
    w.roleQueue = [];
    w.heli = null;
    w.restT = 999;
    w.done = false;
    const before = new Set(g.enemies);
    w.start(g.enemies); // Actual WaveDirector starts wave 4 under wild-scene rules.
    window.__waveTestGunship = g.enemies.find((e) => !before.has(e) && e.audioType === 'gunship');
    return {
      wave: w.wave,
      queue: w.queue,
      queuedRoles: w.roleQueue.length,
      gunship: window.__waveTestGunship && {
        hp: window.__waveTestGunship.hp,
        maxHp: window.__waveTestGunship.maxHp,
        alive: window.__waveTestGunship.alive,
        airUnit: window.__waveTestGunship.airUnit,
      },
      scene: window.__lighting().scene,
    };
  });
  assert(waveStart.wave === 4 && waveStart.queue === 6 && waveStart.queuedRoles === 6,
    'wave-4 launch did not schedule 6 troops: ' + JSON.stringify(waveStart));
  assert(waveStart.scene === 'wild', 'wave e2e page is not using wild-scene rules: ' + JSON.stringify(waveStart));
  assert(waveStart.gunship?.alive && waveStart.gunship?.airUnit && waveStart.gunship.maxHp === 186,
    'wave 4 did not create the expected live gunship: ' + JSON.stringify(waveStart));

  // Track real TransportHeli instances as they enter, unload their payloads, and leave the map.
  await gameplayPage.waitForFunction(() => {
    const g = window.__game();
    const h = g.waves.heli;
    if (h?.audioType === 'transport' && !window.__waveTestFlights.includes(h)) window.__waveTestFlights.push(h);
    return window.__waveTestFlights.length >= 1 && window.__waveTestFlights[0].deployed >= 1;
  }, undefined, { timeout: 18000 });
  const firstFlight = await gameplayPage.evaluate(() => {
    const h = window.__waveTestFlights[0];
    const g = window.__game();
    const troops = g.enemies.filter((e) => !window.__waveTestInitialEnemies.has(e) && !e.airUnit && e.quality === 'fine');
    return {
      state: h.state, payload: h.payload, deployed: h.deployed,
      flightX: h.x, dropX: h.dropX,
      ropedTroops: troops.filter((e) => e.roped && e.alive).length,
      troopsSeen: troops.length,
    };
  });
  assert(firstFlight.payload === 4 && firstFlight.deployed >= 1 && firstFlight.ropedTroops >= 1,
    'transport flight did not physically deploy a roped troop: ' + JSON.stringify(firstFlight));

  await gameplayPage.waitForFunction(() => {
    const g = window.__game();
    const h = g.waves.heli;
    if (h?.audioType === 'transport' && !window.__waveTestFlights.includes(h)) window.__waveTestFlights.push(h);
    const flights = window.__waveTestFlights;
    const allFlightsComplete = flights.length >= 2 && flights.every((f) =>
      f.deployed === f.payload && f.state === 'out' && f.destroyed);
    return g.waves.queue === 0 && g.waves.heli === null && allFlightsComplete;
  }, undefined, { timeout: 30000 });
  const deliveryReport = await gameplayPage.evaluate(() => {
    const g = window.__game();
    const flights = window.__waveTestFlights.map((h) => ({
      payload: h.payload, deployed: h.deployed, state: h.state, destroyed: h.destroyed,
      sceneQuality: h.spec.quality, armorMul: h.spec.armorMul,
    }));
    const troops = g.enemies.filter((e) => !window.__waveTestInitialEnemies.has(e) && !e.airUnit && e.quality === 'fine');
    return {
      wave: g.waves.wave, queue: g.waves.queue,
      flights,
      troopCount: troops.length,
      landedTroops: troops.filter((e) => !e.roped && !e.destroyed).length,
      armoredTroops: troops.filter((e) => e.armor?.body?.dur > 0).length,
      troopDurability: troops.map((e) => ({ alive: e.alive, bodyDur: e.armor?.body?.dur, bodyMax: e.armor?.body?.max, hp: e.hp, quality: e.quality })),
    };
  });
  assert(deliveryReport.flights.length === 2
    && deliveryReport.flights[0].payload === 4 && deliveryReport.flights[0].deployed === 4
    && deliveryReport.flights[1].payload === 2 && deliveryReport.flights[1].deployed === 2,
    'wave 4 did not deliver its 4+2 transport batches: ' + JSON.stringify(deliveryReport));
  assert(deliveryReport.flights.every((f) => f.state === 'out' && f.destroyed),
    'one or more transports failed to finish their departure lifecycle: ' + JSON.stringify(deliveryReport.flights));
  assert(deliveryReport.troopCount === 6 && deliveryReport.landedTroops >= 4 && deliveryReport.armoredTroops >= 1,
    'transported troops did not survive/land with the expected gear: ' + JSON.stringify(deliveryReport));

  // Use an actual transported Dummy with real armor state. Damage drains armor before HP;
  // breaking armor must not spill excess damage into HP; only the next hit should kill it.
  const armorKill = await gameplayPage.evaluate(() => {
    const g = window.__game();
    const troop = g.enemies.find((e) => !window.__waveTestInitialEnemies.has(e)
      && !e.airUnit && e.quality === 'fine' && e.alive && e.armor?.body?.dur > 2);
    if (!troop) return { error: 'no live fine-quality transported troop with body armor', troopCount: g.enemies.length };
    troop.roped = false;
    troop.p.roping = false;
    const hp0 = troop.hp;
    const armor0 = troop.armor.body.dur;
    const firstDamage = Math.min(2, armor0 * 0.2);
    const first = troop.hit('body', firstDamage, { x: 1, y: 0 }, 1);
    const hpAfterFirst = troop.hp;
    const armorAfterFirst = troop.armor.body.dur;
    const breakDamage = armorAfterFirst + 1;
    const second = troop.hit('body', breakDamage, { x: 1, y: 0 }, 1);
    const hpAfterBreak = troop.hp;
    const armorAfterBreak = troop.armor.body.dur;
    const killDamage = troop.hp + 1;
    const third = troop.hit('body', killDamage, { x: 1, y: 0 }, 1);
    window.__lootTestTarget = troop;
    window.__lootCoinsBaseline = JSON.parse(localStorage.getItem('contra-inv') || 'null')?.coins ?? 30;
    return {
      hp0, armor0, firstDamage, firstAbsorbed: first?.absorbed, hpAfterFirst, armorAfterFirst,
      secondAbsorbed: second?.absorbed, secondBroke: second?.broke, hpAfterBreak, armorAfterBreak,
      thirdAbsorbed: third?.absorbed, aliveAfterKill: troop.alive,
      lootSlots: Object.keys(troop.loot || {}),
      lootQuality: troop.loot && Object.fromEntries(Object.entries(troop.loot).map(([k, v]) => [k, v.quality])),
      lootAffixCounts: troop.loot && Object.fromEntries(Object.entries(troop.loot).map(([k, v]) => [k, v.affixes?.length || 0])),
      deathEventsQueued: troop.events.some((ev) => ev.type === 'died'),
      deathCoins: troop.events.find((ev) => ev.type === 'died')?.coins ?? null,
      deathPosition: { x: troop.x, y: troop.y },
    };
  });
  assert(!armorKill.error
    && armorKill.firstAbsorbed === true
    && armorKill.hpAfterFirst === armorKill.hp0
    && armorKill.armorAfterFirst < armorKill.armor0,
    'real enemy armor did not absorb the initial hit: ' + JSON.stringify(armorKill));
  assert(armorKill.secondAbsorbed === true && armorKill.secondBroke === 'body'
    && armorKill.hpAfterBreak === armorKill.hp0 && armorKill.armorAfterBreak === 0,
    'body armor break spilled into HP or failed to consume durability: ' + JSON.stringify(armorKill));
  assert(armorKill.aliveAfterKill === false && armorKill.deathEventsQueued
    && armorKill.lootSlots?.length === 3 && armorKill.lootSlots.includes('gun')
    && armorKill.lootSlots.includes('head') && armorKill.lootSlots.includes('body')
    && armorKill.deathCoins >= 3 && armorKill.deathCoins <= 8,
    'real enemy death/loot contract failed: ' + JSON.stringify(armorKill));

  await gameplayPage.waitForFunction(() => {
    const t = window.__lootTestTarget;
    return t && t.events.length === 0 && window.__game().pickups.some((pk) => pk.type === 'coin');
  }, undefined, { timeout: 8000 });
  await gameplayPage.evaluate(() => {
    const g = window.__game();
    const e = window.__lootTestTarget;
    const p = g.player.torso.getPosition();
    const dx = e.x - p.x, dy = e.y - p.y;
    for (const body of g.player.allBodies) {
      const q = body.getPosition();
      body.setTransform({ x: q.x + dx, y: q.y + dy }, body.getAngle());
      body.setLinearVelocity({ x: 0, y: 0 });
      body.setAngularVelocity(0);
    }
    const pos = g.player.torso.getPosition();
    const coin = g.pickups.find((pk) => pk.type === 'coin');
    if (coin) {
      // Keep one actual death-drop coin at the actor's feet so the real magnet/pickup/save code
      // can be observed deterministically; the other generated coins remain untouched.
      coin.x = pos.x; coin.y = pos.y + 0.1; coin.vx = 0; coin.vy = 0;
    }
  });
  await gameplayPage.waitForFunction(() => {
    const inv = JSON.parse(localStorage.getItem('contra-inv') || 'null');
    return inv && inv.coins > (window.__lootCoinsBaseline ?? 30);
  }, undefined, { timeout: 5000 });
  const postPickupCoins = await gameplayPage.evaluate(() => JSON.parse(localStorage.getItem('contra-inv') || 'null').coins);
  assert(postPickupCoins > 30,
    'death-drop coins did not enter the persistent economy: baseline=30, after=' + postPickupCoins);

  // Use the actual proximity/Tab corpse flow and real loot-taking buttons.
  // Pin the player bodies only during this deterministic UI assertion: starting exactly at
  // the corpse allows the real Tab proximity route to open, while physics can't eject it mid-click.
  await gameplayPage.evaluate(() => window.__game().player.allBodies.forEach((b) => b.setActive(false)));
  await gameplayPage.keyboard.press('Tab');
  await gameplayPage.waitForFunction(() => {
    const el = document.getElementById('corpse');
    return el && el.style.display !== 'none' && el.querySelectorAll('.cp-row').length === 3;
  }, undefined, { timeout: 4000 });
  for (const slot of ['body', 'gun', 'head']) {
    await gameplayPage.locator('#corpse .cp-take[data-k="' + slot + '"]').waitFor({ state: 'visible', timeout: 4000 });
    await gameplayPage.locator('#corpse .cp-take[data-k="' + slot + '"]').click({ timeout: 5000 });
    await gameplayPage.waitForFunction((k) => window.__lootTestTarget?.lootTaken?.[k] === true, slot, { timeout: 4000 });
  }
  const lootedInventory = await gameplayPage.evaluate(() => {
    const inv = JSON.parse(localStorage.getItem('contra-inv') || 'null');
    return {
      coins: inv.coins,
      itemCount: inv.items.length,
      unEquipped: inv.items.filter((it) => !it.equipped).map((it) => ({ id: it.id, slot: it.slot, quality: it.quality, affixes: it.affixes?.length || 0 })),
      lootTaken: { ...window.__lootTestTarget.lootTaken },
    };
  });
  assert(lootedInventory.unEquipped.some((it) => it.slot === 'body')
    && lootedInventory.unEquipped.some((it) => it.slot === 'head')
    && lootedInventory.unEquipped.some((it) => it.slot === 'gun')
    && ['body', 'head', 'gun'].every((slot) => lootedInventory.lootTaken[slot] === true),
    'corpse loot was not transferred into the persistent inventory: ' + JSON.stringify(lootedInventory));

  await gameplayPage.keyboard.press('Escape'); // Close corpse panel without opening the pause menu.
  await gameplayPage.evaluate(() => window.__game().player.allBodies.forEach((b) => b.setActive(true)));
  await gameplayPage.keyboard.press('g');
  await gameplayPage.waitForFunction(() => document.getElementById('bp')?.style.display === 'flex', undefined, { timeout: 4000 });
  await gameplayPage.locator('#bagBody .ic-card').first().waitFor({ state: 'visible', timeout: 4000 });
  const bodyItemBeforeDecompose = await gameplayPage.evaluate(() => {
    const inv = JSON.parse(localStorage.getItem('contra-inv') || 'null');
    const expected = window.__lootTestTarget?.loot?.body?.affixes || [];
    return inv.items.find((it) => it.slot === 'body' && !it.equipped
      && Array.isArray(it.affixes) && it.affixes.length === expected.length
      && expected.every((a, i) => it.affixes[i]?.id === a.id && it.affixes[i]?.v === a.v)) || null;
  });
  assert(bodyItemBeforeDecompose?.affixes?.length === 2,
    'the exact corpse-looted armor (matched by affixes) is missing before decompose: ' + JSON.stringify(bodyItemBeforeDecompose));
  const coinsBeforeDecompose = await gameplayPage.evaluate(() => JSON.parse(localStorage.getItem('contra-inv') || 'null').coins);
  const expectedDecomposeValue = ({ broken: 5, normal: 12, fine: 25, rare: 50, epic: 100, legendary: 200 }[bodyItemBeforeDecompose?.quality] ?? 10)
    + (bodyItemBeforeDecompose?.affixes?.length || 0) * 10;
  const bodyCardForDecompose = gameplayPage.locator('#bagBody .ic-card[data-item-id="' + bodyItemBeforeDecompose?.id + '"]');
  await bodyCardForDecompose.waitFor({ state: 'visible', timeout: 4000 });
  await bodyCardForDecompose.locator('.op-cut').click();
  await bodyCardForDecompose.locator('.op-cut').click();
  await gameplayPage.waitForFunction((before) => {
    const inv = JSON.parse(localStorage.getItem('contra-inv') || 'null');
    return inv && inv.items.every((it) => it.id !== before) && inv.coins > 0;
  }, bodyItemBeforeDecompose?.id, { timeout: 4000 });
  const coinsAfterDecompose = await gameplayPage.evaluate(() => JSON.parse(localStorage.getItem('contra-inv') || 'null').coins);
  assert(coinsAfterDecompose >= coinsBeforeDecompose + expectedDecomposeValue,
    'decomposing real corpse loot did not return its configured value: ' + JSON.stringify({ coinsBeforeDecompose, coinsAfterDecompose, expectedDecomposeValue }));

  await gameplayPage.locator('#tabShop').click();
  const itemsBeforeBox = await gameplayPage.evaluate(() => JSON.parse(localStorage.getItem('contra-inv') || 'null').items.length);
  const coinsBeforeBox = await gameplayPage.evaluate(() => JSON.parse(localStorage.getItem('contra-inv') || 'null').coins);
  assert(coinsBeforeBox >= 50, 'economy loop did not accrue enough coins for the starter supply box: ' + coinsBeforeBox);
  await gameplayPage.locator('#boxRow .box-card button').first().click();
  await gameplayPage.waitForFunction(({ coins, count }) => {
    const inv = JSON.parse(localStorage.getItem('contra-inv') || 'null');
    return inv && inv.coins === coins - 50 && inv.items.length === count + 1;
  }, { coins: coinsBeforeBox, count: itemsBeforeBox }, { timeout: 5000 });
  const economyEnd = await gameplayPage.evaluate(() => {
    const inv = JSON.parse(localStorage.getItem('contra-inv') || 'null');
    return { coins: inv.coins, itemCount: inv.items.length };
  });
  await gameplayPage.screenshot({ path: 'artifacts/gameplay-economy.png', fullPage: true });
  await gameplayPage.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await gameplayPage.waitForFunction(() => typeof window.__game === 'function', undefined, { timeout: 10000 });
  const economyReload = await gameplayPage.evaluate(() => {
    const inv = JSON.parse(localStorage.getItem('contra-inv') || 'null');
    return { coins: inv.coins, itemCount: inv.items.length };
  });
  assert(economyReload.coins === economyEnd.coins && economyReload.itemCount === economyEnd.itemCount,
    'inventory/coins did not persist after a real page reload: ' + JSON.stringify({ economyEnd, economyReload }));

  // Capture four lighting states at the same world position and viewport; the tests compare game pixels only.
  const lightingPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  lightingPage.on('pageerror', (error) => failures.push('lighting pageerror: ' + (error.stack || error.message)));
  lightingPage.on('response', (r) => { if (r.status() >= 400) badResponses.push({ status: r.status(), url: r.url() }); });
  lightingPage.on('requestfailed', (r) => failedRequests.push({ url: r.url(), error: r.failure()?.errorText || 'unknown' }));
  lightingPage.on('console', (message) => {
    if (message.type() === 'error') failures.push('lighting console.error: ' + message.text());
  });
  await lightingPage.addInitScript(() => localStorage.setItem('contra-scene', 'raid'));
  const lightingResponse = await lightingPage.goto(baseURL + '/game.html', { waitUntil: 'networkidle', timeout: 30000 });
  assert(!!lightingResponse && lightingResponse.status() === 200,
    'lighting comparison page response status: ' + (lightingResponse?.status() ?? 'no response'));
  await lightingPage.waitForFunction(() => typeof window.__game === 'function' && typeof window.__lighting === 'function', undefined, { timeout: 10000 });
  await lightingPage.keyboard.press('Enter');
  await lightingPage.waitForFunction(() => !window.__feel().menu && !window.__raid().rappel, undefined, { timeout: 10000 });
  const teleportToBreaker = async () => lightingPage.evaluate(() => {
    const g = window.__game();
    const p = g.player.torso.getPosition();
    const dx = 3.6 - p.x, dy = 1.0 - p.y;
    for (const body of g.player.allBodies) {
      const q = body.getPosition();
      body.setTransform({ x: q.x + dx, y: q.y + dy }, body.getAngle());
      body.setLinearVelocity({ x: 0, y: 0 });
      body.setAngularVelocity(0);
    }
    g.player.facing = 1;
  });
  await teleportToBreaker();
  await lightingPage.waitForTimeout(450);
  const lightingSnapshots = [];
  const captureLighting = async (name) => {
    await lightingPage.waitForTimeout(350);
    const diagnostics = await lightingPage.evaluate(() => {
      const canvas = document.getElementById('game');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const game = window.__game();
      const state = window.__lighting();
      const pos = game.player.torso.getPosition();
      const cam = game.cam;
      const ppm = 52 * cam.zoom;
      // Measure a local circular ROI in front of the operator where the flashlight cone should land;
      // a full-screen mean can hide useful local illumination in a mostly black stealth scene.
      const targetWorldX = pos.x + Math.cos(state.flashlightAngle) * 3.2;
      const targetWorldY = pos.y + 0.1 + Math.sin(state.flashlightAngle) * 3.2;
      const targetPixelX = Math.round((targetWorldX - cam.x) * ppm + canvas.width / 2);
      const targetPixelY = Math.round(canvas.height * 0.60 - (targetWorldY - cam.y) * ppm);
      const localRadius = Math.round(1.15 * ppm);
      const values = [], green = [], localValues = [];
      let dark = 0, bright = 0, n = 0;
      for (let y = 36; y < canvas.height - 24; y += 6) {
        for (let x = 36; x < canvas.width - 24; x += 6) {
          const i = (y * canvas.width + x) * 4;
          const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          values.push(l);
          if (Math.hypot(x - targetPixelX, y - targetPixelY) <= localRadius) localValues.push(l);
          if (l < 42) dark++;
          if (l > 160) bright++;
          if (g > r * 1.12 && g > b * 1.12) green.push(1);
          n++;
        }
      }
      values.sort((a, b) => a - b);
      localValues.sort((a, b) => a - b);
      const mean = values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
      const localMean = localValues.reduce((sum, v) => sum + v, 0) / Math.max(1, localValues.length);
      const p = (sample, q) => sample[Math.min(sample.length - 1, Math.floor(sample.length * q))] || 0;
      return {
        state,
        player: { x: +pos.x.toFixed(3), y: +pos.y.toFixed(3), facing: game.player.facing },
        camera: { x: +cam.x.toFixed(3), y: +cam.y.toFixed(3), zoom: cam.zoom },
        flashlightROI: {
          centerPx: { x: targetPixelX, y: targetPixelY },
          radiusPx: localRadius,
          samples: localValues.length,
          meanLuma: +localMean.toFixed(2),
          median: +p(localValues, 0.5).toFixed(2),
          p90: +p(localValues, 0.9).toFixed(2),
        },
        renderErrors: {
          render: window.__lastRenderError?.msg || null,
          frame: window.__lastFrameError?.msg || null,
          layers: window.__renderLayerErrors || null,
          raidVision: window.__raidVisionError || null,
        },
        pixels: {
          samples: n,
          meanLuma: +mean.toFixed(2),
          p10: +p(values, 0.1).toFixed(2), median: +p(values, 0.5).toFixed(2), p90: +p(values, 0.9).toFixed(2),
          darkRatio: +(dark / Math.max(1, n)).toFixed(4),
          brightRatio: +(bright / Math.max(1, n)).toFixed(4),
          greenDominance: +(green.length / Math.max(1, n)).toFixed(4),
        },
      };
    });
    await lightingPage.locator('#game').screenshot({ path: 'artifacts/lighting-' + name + '.png' });
    lightingSnapshots.push({ name, ...diagnostics });
    for (const [key, value] of Object.entries(diagnostics.renderErrors)) {
      if (value && (key !== 'layers' || Object.keys(value).length)) failures.push('lighting ' + name + ' ' + key + ': ' + JSON.stringify(value));
    }
    return diagnostics;
  };
  const powered = await captureLighting('powered');
  assert(powered.state.powerOn && !powered.state.flashlightOn && !powered.state.nightVision,
    'powered lighting baseline is not clean: ' + JSON.stringify(powered.state));
  await lightingPage.keyboard.press('e');
  await lightingPage.waitForFunction(() => window.__lighting().powerOn === false, undefined, { timeout: 4000 });
  const blackout = await captureLighting('blackout');
  assert(!blackout.state.powerOn && !blackout.state.flashlightOn && !blackout.state.nightVision,
    'blackout state has unexpected light modes: ' + JSON.stringify(blackout.state));
  await lightingPage.keyboard.press('l');
  await lightingPage.waitForFunction(() => window.__lighting().flashlightOn === true, undefined, { timeout: 4000 });
  const flashlight = await captureLighting('flashlight');
  assert(!flashlight.state.powerOn && flashlight.state.flashlightOn && !flashlight.state.nightVision,
    'flashlight comparison state is incorrect: ' + JSON.stringify(flashlight.state));
  await lightingPage.keyboard.press('l');
  await lightingPage.waitForFunction(() => window.__lighting().flashlightOn === false, undefined, { timeout: 4000 });
  await lightingPage.keyboard.press('n');
  await lightingPage.waitForFunction(() => window.__lighting().nightVision === true, undefined, { timeout: 4000 });
  const nightVision = await captureLighting('night-vision');
  assert(!nightVision.state.powerOn && !nightVision.state.flashlightOn && nightVision.state.nightVision,
    'night-vision comparison state is incorrect: ' + JSON.stringify(nightVision.state));
  assert(blackout.pixels.meanLuma < powered.pixels.meanLuma,
    'blackout should visibly darken the same viewpoint: powered=' + powered.pixels.meanLuma + ', blackout=' + blackout.pixels.meanLuma);
  assert(flashlight.pixels.meanLuma > blackout.pixels.meanLuma,
    'flashlight should lift detail relative to blackout: flashlight=' + flashlight.pixels.meanLuma + ', blackout=' + blackout.pixels.meanLuma);
  assert(flashlight.flashlightROI.meanLuma > blackout.flashlightROI.meanLuma + 2,
    'flashlight cone did not improve local target readability: flashlight=' + flashlight.flashlightROI.meanLuma + ', blackout=' + blackout.flashlightROI.meanLuma);
  assert(nightVision.pixels.greenDominance > blackout.pixels.greenDominance,
    'night vision should shift the frame toward green: nvg=' + nightVision.pixels.greenDominance + ', blackout=' + blackout.pixels.greenDominance);
  await writeFile('artifacts/lighting-comparison.json', JSON.stringify({
    note: 'Canvas-only, same viewport and world position; pixel statistics sample every 6px excluding outer UI margins.',
    snapshots: lightingSnapshots,
    assertions: {
      blackoutDarkerThanPowered: blackout.pixels.meanLuma < powered.pixels.meanLuma,
      flashlightLiftsBlackout: flashlight.pixels.meanLuma > blackout.pixels.meanLuma,
      flashlightLiftsLocalROI: flashlight.flashlightROI.meanLuma > blackout.flashlightROI.meanLuma + 2,
      nightVisionGreenerThanBlackout: nightVision.pixels.greenDominance > blackout.pixels.greenDominance,
    },
  }, null, 2));
  console.log('HERO wave/loot/economy regression:', JSON.stringify({
    waveStart, firstFlight, deliveryReport, armorKill, postPickupCoins,
    lootedInventory, coinsBeforeDecompose, expectedDecomposeValue, coinsAfterDecompose,
    coinsBeforeBox, economyEnd, economyReload,
  }, null, 2));
  console.log('HERO four-state lighting comparison:', JSON.stringify(lightingSnapshots.map((s) => ({
    name: s.name, state: s.state, player: s.player, camera: s.camera, pixels: s.pixels,
  })), null, 2));

  // Restore a mid-mission checkpoint in a clean browser context: cleared floors must remain empty,
  // the evidence state and elapsed time must survive, and the player must appear near the next goal.
  const resumePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  resumePage.on('pageerror', (error) => failures.push(`checkpoint pageerror: ${error.stack || error.message}`));
  resumePage.on('response', (r) => { if (r.status() >= 400) badResponses.push({ status: r.status(), url: r.url() }); });
  resumePage.on('console', (message) => { if (message.type() === 'error') failures.push(`checkpoint console.error: ${message.text()}`); });
  await resumePage.addInitScript(() => {
    localStorage.setItem('contra-scene', 'raid');
    localStorage.setItem('contra-raid-checkpoint-v1', JSON.stringify({
      version: 1, campaign: '夜幕行动：失联名单', stage: 'assault',
      clearedFloors: { 3: true, 2: true, 1: true, 0: false },
      intelSecured: true, elapsedSeconds: 73.2,
    }));
  });
  const resumeResponse = await resumePage.goto(baseURL + '/game.html', { waitUntil: 'networkidle', timeout: 30000 });
  assert(!!resumeResponse && resumeResponse.status() === 200, 'checkpoint game page returned ' + (resumeResponse?.status() ?? 'no response'));
  await resumePage.waitForFunction(() => typeof window.__raid === 'function' && typeof window.__game === 'function'
    && window.__raid().campaign.stage === 'assault', undefined, { timeout: 10000 });
  const resumeState = await resumePage.evaluate(() => {
    const raid = window.__raid();
    const p = window.__game().player.torso.getPosition();
    return {
      stage: raid.campaign.stage,
      clearedFloors: { ...raid.clearedFloors },
      intelSecured: raid.campaign.intelSecured,
      elapsedSeconds: raid.campaign.elapsedSeconds,
      position: { x: p.x, y: p.y },
      rappel: raid.rappel,
      dialogue: raid.campaign.activeDialogue?.text || '',
      unclearedFloorGuards: window.__game().enemies
        .filter((e) => e.raidMode && !e.isReinforcement && [1, 2, 3].includes(e.raidFloorId))
        .map((e) => e.raidFloorId),
    };
  });
  assert(resumeState.stage === 'assault', 'checkpoint stage was not restored: ' + JSON.stringify(resumeState));
  assert(resumeState.clearedFloors[3] && resumeState.clearedFloors[2] && resumeState.clearedFloors[1] && !resumeState.clearedFloors[0],
    'checkpoint did not preserve floor progress: ' + JSON.stringify(resumeState.clearedFloors));
  assert(resumeState.intelSecured && resumeState.elapsedSeconds >= 73.2, 'checkpoint lost evidence or elapsed time: ' + JSON.stringify(resumeState));
  assert(Math.abs(resumeState.position.x - 53.5) < 0.6 && resumeState.position.y < 1.6,
    'player did not resume on the ground-floor objective approach: ' + JSON.stringify(resumeState.position));
  assert(!resumeState.rappel, 'resumed campaign should not replay rooftop insertion');
  assert(/进度已恢复/.test(resumeState.dialogue), 'resume radio line was not restored: ' + resumeState.dialogue);
  assert(resumeState.unclearedFloorGuards.length === 0,
    'garrisons from previously cleared floors respawned: ' + JSON.stringify(resumeState.unclearedFloorGuards));
  await resumePage.close();

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
