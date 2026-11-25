// Renders README / Chrome Web Store images into docs/images with Puppeteer.
//   node scripts/screenshots.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'images');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const target = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
  if (!target.startsWith(ROOT) || !fs.existsSync(target)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', TYPES[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [ROOT], args: ['--lang=en-US'] });
try {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  // 1. Demo feed, blurred (1280x800 — Web Store screenshot size)
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(base + '/demo/', { waitUntil: 'networkidle0' });
  await sleep(500);
  await page.evaluate(() => {
    document.querySelector('.controls').style.position = 'static';
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: path.join(OUT, 'feed-blur.png') });

  // 2. Scrolled to social + forum section
  await page.evaluate(() => document.querySelectorAll('h2')[1].scrollIntoView());
  await sleep(200);
  await page.screenshot({ path: path.join(OUT, 'feed-social.png') });

  // 3. Page shield
  await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById('btn-page').click(); });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'page-shield.png') });

  // 4. Popup (rendered inside a 1280x800 frame for the store, plus a tight crop for the README)
  const popup = await browser.newPage();
  await popup.setViewport({ width: 340, height: 640, deviceScaleFactor: 2 });
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.evaluate(() => chrome.storage.local.set({ totalBlocked: 1287 }));
  await sleep(400);
  const box = await (await popup.$('.popup')).boundingBox();
  await popup.screenshot({ path: path.join(OUT, 'popup.png'), clip: { x: 0, y: 0, width: 340, height: Math.ceil(box.height) } });

  // 5. Store screenshot: popup on a branded backdrop
  const popupPng = fs.readFileSync(path.join(OUT, 'popup.png')).toString('base64');
  const iconPng = fs.readFileSync(path.join(ROOT, 'icons', 'icon128.png')).toString('base64');
  const stage = await browser.newPage();
  await stage.setViewport({ width: 1280, height: 800 });
  await stage.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;display:flex;align-items:center;justify-content:center;gap:72px;
    font-family:'Segoe UI',system-ui,sans-serif;color:#f4f2ff;background:#0d0b1a;
    background-image:radial-gradient(800px 500px at 0% 0%,rgba(236,72,153,.35),transparent 60%),radial-gradient(800px 500px at 100% 100%,rgba(34,211,238,.25),transparent 60%)">
    <div style="max-width:520px">
      <img src="data:image/png;base64,${iconPng}" width="96" height="96" style="border-radius:22px">
      <h1 style="font-size:56px;line-height:1.05;margin:24px 0 16px;letter-spacing:-.02em">Play it fresh.<br>No spoilers.</h1>
      <p style="font-size:22px;line-height:1.5;color:#c4c1dc;margin:0">Blur or hide GTA VI spoilers on YouTube, X, Reddit, TikTok, Google and every other site. Your choice, one click to reveal.</p>
    </div>
    <img src="data:image/png;base64,${popupPng}" style="width:340px;border-radius:18px;box-shadow:0 40px 100px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.1)">
  </body></html>`);
  await sleep(200);
  await stage.screenshot({ path: path.join(OUT, 'store-popup.png') });

  // 6. Small promo tile 440x280
  await stage.setViewport({ width: 440, height: 280 });
  await stage.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
    font-family:'Segoe UI',system-ui,sans-serif;color:#fff;background:#0d0b1a;
    background-image:radial-gradient(300px 200px at 0% 0%,rgba(236,72,153,.45),transparent 70%),radial-gradient(300px 200px at 100% 100%,rgba(34,211,238,.3),transparent 70%)">
    <img src="data:image/png;base64,${iconPng}" width="96" height="96" style="border-radius:22px">
    <div style="font-size:30px;font-weight:800;letter-spacing:-.01em">Spoiler Shield</div>
    <div style="font-size:16px;color:#d4d1ea">GTA VI spoiler blocker</div>
  </body></html>`);
  await sleep(200);
  await stage.screenshot({ path: path.join(OUT, 'promo-small-440x280.png') });

  console.log('images written to', OUT);
} finally {
  await browser.close();
  server.close();
}
