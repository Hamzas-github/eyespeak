const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
};

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const file = path.resolve(root, relative);

    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(file, (statError, stat) => {
      if (statError || !stat.isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Content-Length': stat.size,
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file).pipe(res);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server));
  });
}

async function newPage(browser, baseUrl, suffix = '/eye-tracker-aac.html') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    window.__spoken = [];
    class FakeUtterance {
      constructor(text) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        cancel() {},
        speak(utterance) { window.__spoken.push(utterance.text); },
      },
    });
  });
  const page = await context.newPage();
  await page.goto(baseUrl + suffix, { waitUntil: 'load' });
  return { context, page };
}

async function run() {
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://${host}:${address.port}`;
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  test('loads the main board with four accessible targets', async () => {
    const { context, page } = await newPage(browser, baseUrl);
    assert.equal(await page.locator('.card').count(), 4);
    assert.deepEqual(
      await page.locator('.card').allTextContents(),
      ['✅Yes', '❌No', '🍽️Food & Drink', '🩹Pain & Care'],
    );
    assert.equal(await page.locator('#crumb').textContent(), 'Main board');
    assert.equal(await page.locator('.card[aria-label]').count(), 4);
    await context.close();
  });

  test('navigates into each category and back', async () => {
    const { context, page } = await newPage(browser, baseUrl);
    await page.getByRole('button', { name: 'Food & Drink' }).click();
    assert.equal(await page.locator('#crumb').textContent(), 'Food & Drink');
    assert.equal(await page.locator('.card').count(), 4);
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Pain & Care' }).click();
    assert.equal(await page.locator('#crumb').textContent(), 'Pain & Care');
    assert.equal(await page.getByRole('button', { name: 'I need medication' }).count(), 1);
    await page.getByRole('button', { name: 'Back' }).click();
    assert.equal(await page.locator('#crumb').textContent(), 'Main board');
    await context.close();
  });

  test('click selection speaks and records the phrase', async () => {
    const { context, page } = await newPage(browser, baseUrl);
    await page.getByRole('button', { name: 'Yes' }).click();
    assert.equal(await page.locator('#log li').count(), 1);
    assert.match(await page.locator('#log li').innerText(), /Yes.*touch\/click/s);
    assert.deepEqual(await page.evaluate(() => window.__spoken), ['Yes']);
    await context.close();
  });

  test('keyboard Enter and Space activate focused cards', async () => {
    const first = await newPage(browser, baseUrl);
    const { context, page } = first;
    const noCard = page.getByRole('button', { name: 'No' });
    await noCard.focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.__spoken), ['No']);
    await context.close();

    const second = await newPage(browser, baseUrl);
    await second.page.getByRole('button', { name: 'Yes' }).focus();
    await second.page.keyboard.press('Space');
    assert.deepEqual(await second.page.evaluate(() => window.__spoken), ['Yes']);
    await second.context.close();
  });

  test('camera failure enters a clean mouse-only fallback', async () => {
    const { context, page } = await newPage(browser, baseUrl);
    await page.evaluate(() => { delete window.webgazer; });
    await page.getByRole('button', { name: 'Start camera' }).click();
    await page.getByText(/Camera unavailable/).waitFor();
    assert.equal(await page.locator('#camMount video').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Recalibrate' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Stop' }).count(), 1);
    await context.close();
  });

  test('mouse fallback selects a card after gaze settles', async () => {
    const { context, page } = await newPage(browser, baseUrl);
    await page.evaluate(() => { delete window.webgazer; });
    await page.getByRole('button', { name: 'Start camera' }).click();
    const yes = page.getByRole('button', { name: 'Yes' });
    const box = await yes.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    assert.equal(await yes.evaluate(el => el.classList.contains('gazed')), true);
    assert.equal(await page.locator('#cursor').evaluate(el => getComputedStyle(el).opacity), '1');
    await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(() => window.__spoken), ['Yes']);
    await context.close();
  });

  test('gaze outside the board cannot select a stale card', async () => {
    const { context, page } = await newPage(browser, baseUrl);
    await page.evaluate(() => { delete window.webgazer; });
    await page.getByRole('button', { name: 'Start camera' }).click();
    const yes = page.getByRole('button', { name: 'Yes' });
    const yesBox = await yes.boundingBox();
    await page.mouse.move(yesBox.x + yesBox.width / 2, yesBox.y + yesBox.height / 2);
    await page.waitForTimeout(400);
    await page.mouse.move(10, 10);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.card.gazed').count(), 0);
    assert.ok(
      Number(await page.locator('#cursor').evaluate(el => getComputedStyle(el).opacity)) < 0.01,
      'cursor should be visually hidden outside the board',
    );
    await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(() => window.__spoken), []);
    assert.equal(await page.locator('#log li').count(), 0);
    await context.close();
  });

  test('fallback can stop and restart without breaking selection', async () => {
    const { context, page } = await newPage(browser, baseUrl);
    await page.evaluate(() => { delete window.webgazer; });
    await page.getByRole('button', { name: 'Start camera' }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    assert.equal(await page.getByRole('button', { name: 'Start camera' }).count(), 1);
    await page.getByRole('button', { name: 'Start camera' }).click();
    const no = page.getByRole('button', { name: 'No' });
    const box = await no.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(() => window.__spoken), ['No']);
    await context.close();
  });

  test('built-in pure-logic self-tests pass', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const messages = [];
    page.on('console', message => messages.push(message.text()));
    await page.goto(baseUrl + '/eye-tracker-aac.html?selftest', { waitUntil: 'load' });
    assert.ok(messages.includes('selftest passed'), messages.join('\n'));
    await context.close();
  });

  test('all locally vendored runtime assets are served', async () => {
    const { context, page } = await newPage(browser, baseUrl);
    const assets = [
      '/vendor/webgazer.min.js',
      '/vendor/tasks-vision.js',
      '/vendor/face_landmarker.task',
      '/vendor/mediapipe-wasm/vision_wasm_internal.js',
      '/vendor/mediapipe-wasm/vision_wasm_internal.wasm',
      '/vendor/mediapipe-wasm/vision_wasm_nosimd_internal.js',
      '/vendor/mediapipe-wasm/vision_wasm_nosimd_internal.wasm',
    ];
    const statuses = await page.evaluate(async urls =>
      Promise.all(urls.map(async url => [url, (await fetch(url)).status])), assets);
    assert.deepEqual(statuses, assets.map(asset => [asset, 200]));
    await context.close();
  });

  test('mobile layout keeps the board before the controls', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(baseUrl + '/eye-tracker-aac.html', { waitUntil: 'load' });
    const boardBox = await page.locator('.boardcol').boundingBox();
    const asideBox = await page.locator('aside').boundingBox();
    assert.ok(asideBox.y >= boardBox.y + boardBox.height - 1);
    assert.equal(await page.locator('.card').count(), 4);
    await context.close();
  });

  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (failures) throw new Error(`${failures} test(s) failed`);
  console.log(`\n${tests.length} browser tests passed.`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
