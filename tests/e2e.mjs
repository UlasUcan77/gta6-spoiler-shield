// End-to-end test: loads the real unpacked extension into Chrome for Testing
// with Puppeteer and checks it against small fixture pages.
//
//   npm run test:e2e
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FEED = `<!doctype html><html><head><meta charset="utf-8"><title>My feed</title></head><body>
<ytd-rich-item-renderer id="v1"><div id="thumb"></div><h3>GTA 6 ENDING EXPLAINED</h3></ytd-rich-item-renderer>
<ytd-rich-item-renderer id="v2"><div id="thumb"></div><h3>Minecraft calculator build</h3></ytd-rich-item-renderer>
<article data-testid="tweet" id="t1"><div><span>Lucia Caminos in the last mission 😭</span></div></article>
<article data-testid="tweet" id="t2"><div><span>Just shipped a Chrome extension</span></div></article>
<shreddit-post id="r1"><a><h3>Grand Theft Auto VI megathread</h3></a></shreddit-post>
<div class="card" id="c1"><img alt="GTA VI cover art" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><span>Cover</span></div>
<p id="p1">Early players say the twist with Jason Duval is wild.</p>
<p id="p2">Nothing to see here, just GTA V nostalgia.</p>
<textarea id="ta">GTA 6 typed by the user</textarea>
<div id="feed"></div>
</body></html>`;

const SPOILER_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>GTA 6 full walkthrough</title></head>
<body><video id="vid" muted loop></video><p>Chapter one…</p></body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.url.startsWith('/spoiler')) res.end(SPOILER_PAGE);
  else res.end(FEED);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [ROOT],
  // Ubuntu 24.04 runners block Chrome's user-namespace sandbox, so CI runs without it.
  args: ['--no-first-run', '--lang=en-US', ...(process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [])],
});

let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log('  ✔', name);
  } catch (err) {
    failures++;
    console.log('  ✘', name, '\n     ', err.message);
  }
}

try {
  const swTarget = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('src/background.js'),
    { timeout: 15000 },
  );
  const extId = new URL(swTarget.url()).host;
  console.log('extension loaded:', extId);

  const page = await browser.newPage();
  const blockedIds = () => page.$$eval('.gvs-blocked', (els) => els.map((e) => e.id).sort());

  await step('blocks spoilers on load and leaves the rest alone', async () => {
    await page.goto(base + '/feed', { waitUntil: 'load' });
    await sleep(500);
    assert.deepEqual(await blockedIds(), ['c1', 'p1', 'r1', 't1', 'v1']);
  });

  await step('ignores text the user types in form fields', async () => {
    assert.equal(await page.$eval('#ta', (e) => e.classList.contains('gvs-blocked')), false);
  });

  await step('blocks content added later (infinite scroll)', async () => {
    await page.evaluate(() => {
      const a = document.createElement('article');
      a.id = 'live';
      a.innerHTML = '<p>#GTAVI leaks thread 🧵</p>';
      document.getElementById('feed').append(a);
    });
    await sleep(200);
    assert.ok((await blockedIds()).includes('live'));
  });

  await step('click reveals a card instead of following it', async () => {
    await page.click('#v1');
    assert.ok(await page.$eval('#v1', (e) => e.classList.contains('gvs-revealed')));
  });

  await step('popup renders, is localized and shows the page count', async () => {
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
    await sleep(300);
    const title = await popup.$eval('h1', (e) => e.textContent);
    assert.equal(title, 'GTA VI Spoiler Shield');
    // Switch to "Hide" mode and turn deep spoilers off from the popup UI.
    await popup.click('[data-mode="hide"]');
    await popup.click('label.row:first-of-type');
    await sleep(300);
    const stored = await popup.evaluate(() => chrome.storage.sync.get(null));
    assert.equal(stored.mode, 'hide');
    assert.equal(stored.deepSpoilers, false);
    await popup.close();
  });

  await step('settings apply live: hide mode + deep spoilers off', async () => {
    await page.bringToFront();
    await sleep(300);
    const ids = await blockedIds();
    assert.ok(!ids.includes('t1'), 'Lucia Caminos is a deep term, should be unblocked');
    assert.ok(!ids.includes('p1'), 'Jason Duval is a deep term, should be unblocked');
    assert.equal(await page.$eval('#r1', (e) => getComputedStyle(e).display), 'none');
  });

  await step('full-page warning covers spoiler pages and pauses video', async () => {
    const p2 = await browser.newPage();
    await p2.goto(base + '/spoiler', { waitUntil: 'load' });
    await sleep(400);
    assert.ok(await p2.$('#gvs-page-shield'), 'shield is shown');
    const paused = await p2.evaluate(async () => {
      const v = document.getElementById('vid');
      try { await v.play(); } catch { /* no source */ }
      return v.paused;
    });
    assert.equal(paused, true);
    await p2.close();
  });

  await step('allowlisted sites are left untouched', async () => {
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
    await popup.evaluate(() => chrome.storage.sync.set({ allowlist: ['127.0.0.1'] }));
    await popup.close();
    await page.reload({ waitUntil: 'load' });
    await sleep(400);
    assert.deepEqual(await blockedIds(), []);
  });

  await step('turning the shield off unblocks everything', async () => {
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
    await popup.evaluate(() => chrome.storage.sync.set({ allowlist: [], enabled: true, mode: 'blur', deepSpoilers: true }));
    await sleep(300);
    await page.bringToFront();
    assert.ok((await blockedIds()).length >= 5, 'blocked again after allowlist removed');
    await popup.evaluate(() => chrome.storage.sync.set({ enabled: false }));
    await sleep(300);
    assert.deepEqual(await blockedIds(), []);
    await popup.close();
  });
} finally {
  await browser.close();
  server.close();
}

if (failures) {
  console.log(`\n${failures} e2e check(s) failed`);
  process.exit(1);
}
console.log('\nall e2e checks passed');
