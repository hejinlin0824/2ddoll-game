import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const failures = [];
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
  if (!response || response.status() !== 200) {
    failures.push(`game.html response status: ${response?.status() ?? 'no response'}`);
  }
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(1800);
  const state = await page.evaluate(() => ({
    title: document.title,
    canvases: document.querySelectorAll('canvas').length,
    renderError: window.__lastRenderError?.msg || null,
    renderLayerErrors: window.__renderLayerErrors || null,
    raidVisionError: window.__raidVisionError || null,
    frameError: window.__lastFrameError?.msg || null,
  }));
  if (state.canvases < 1) failures.push('game canvas was not created');
  for (const key of ['renderError', 'renderLayerErrors', 'raidVisionError', 'frameError']) {
    if (state[key] && (key !== 'renderLayerErrors' || Object.keys(state[key]).length)) {
      failures.push(`${key}: ${JSON.stringify(state[key])}`);
    }
  }
  console.log('HERO browser smoke diagnostics:', JSON.stringify(state, null, 2));
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('PASS: npx vite serves /game.html; no page errors or console errors.');
} finally {
  await browser.close();
}
