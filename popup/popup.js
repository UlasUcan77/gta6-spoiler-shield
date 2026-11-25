'use strict';

const DEFAULTS = {
  enabled: true,
  mode: 'blur',
  deepSpoilers: true,
  pageShield: true,
  customKeywords: [],
  allowlist: [],
  pausedUntil: 0,
};

const $ = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || '';

let settings = { ...DEFAULTS };
let tabInfo = null; // { id, host, count, active }

/* ---------------------------------------------------------------- i18n */
for (const el of document.querySelectorAll('[data-i18n]')) {
  const text = t(el.dataset.i18n);
  if (text) el.textContent = text;
}
document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0];

/* ---------------------------------------------------------- helpers */
const cleanHost = (h) => String(h || '').replace(/^www\./, '').toLowerCase();

function isAllowed(host) {
  const hh = cleanHost(host);
  return settings.allowlist.some((a) => {
    const x = cleanHost(a);
    return x && (hh === x || hh.endsWith('.' + x));
  });
}

function isPaused() {
  return settings.pausedUntil > Date.now();
}

async function save(patch) {
  settings = { ...settings, ...patch };
  await chrome.storage.sync.set(patch);
  render();
}

/* ----------------------------------------------------------- render */
function render() {
  $('enabled').checked = settings.enabled;

  const paused = isPaused();
  const allowed = tabInfo && isAllowed(tabInfo.host);
  const on = settings.enabled && !paused && !allowed;

  $('status-card').classList.toggle('is-off', !on);
  let status = t(on ? 'popupShieldOn' : 'popupShieldOff');
  if (settings.enabled && paused) {
    const time = new Date(settings.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    status = t('popupPaused', [time]);
  } else if (settings.enabled && allowed) {
    status = t('popupAllowed');
  }
  $('status-text').textContent = status;

  for (const b of document.querySelectorAll('[data-mode]')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === settings.mode));
  }
  $('deepSpoilers').checked = settings.deepSpoilers;
  $('pageShield').checked = settings.pageShield;

  if (document.activeElement !== $('customKeywords')) {
    $('customKeywords').value = settings.customKeywords.join('\n');
  }

  $('pause').textContent = t(paused ? 'popupResume' : 'popupPause');
  $('pause').classList.toggle('active', paused);
  $('pause').disabled = !settings.enabled;

  const supported = Boolean(tabInfo && tabInfo.host);
  $('allow-site').disabled = !supported;
  $('allow-site').textContent = t(allowed ? 'popupBlockSite' : 'popupAllowSite');
  $('allow-site').classList.toggle('active', Boolean(allowed));
  $('reveal-all').disabled = !supported || !tabInfo.count;
  $('page-count').textContent = supported ? String(tabInfo.count || 0) : '–';
}

/* ----------------------------------------------------------- events */
$('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked, pausedUntil: 0 }));

for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => save({ mode: b.dataset.mode }));
}

$('deepSpoilers').addEventListener('change', (e) => save({ deepSpoilers: e.target.checked }));
$('pageShield').addEventListener('change', (e) => save({ pageShield: e.target.checked }));

$('save-keywords').addEventListener('click', async () => {
  const seen = new Set();
  const list = $('customKeywords').value
    .split('\n')
    .map((s) => s.trim().slice(0, 80))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  await save({ customKeywords: list.slice(0, 200) });
  const btn = $('save-keywords');
  btn.textContent = t('popupSaved');
  setTimeout(() => { btn.textContent = t('popupSave'); }, 1200);
});

$('pause').addEventListener('click', () => {
  save({ pausedUntil: isPaused() ? 0 : Date.now() + 60 * 60 * 1000 });
});

$('allow-site').addEventListener('click', () => {
  if (!tabInfo || !tabInfo.host) return;
  const host = cleanHost(tabInfo.host);
  const allowlist = isAllowed(host)
    ? settings.allowlist.filter((a) => {
        const x = cleanHost(a);
        return !(host === x || host.endsWith('.' + x));
      })
    : [...settings.allowlist, host];
  save({ allowlist });
});

$('reveal-all').addEventListener('click', async () => {
  if (!tabInfo) return;
  try { await chrome.tabs.sendMessage(tabInfo.id, { type: 'gvs:revealAll' }); } catch { /* ignore */ }
  window.close();
});

/* ------------------------------------------------------------- boot */
async function loadTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'gvs:status' }, { frameId: 0 });
    if (res) tabInfo = { id: tab.id, host: res.host, count: res.count, active: res.active };
  } catch {
    tabInfo = null; // chrome:// pages, Web Store, PDF viewer…
  }
}

(async () => {
  const [stored, local] = await Promise.all([
    chrome.storage.sync.get(DEFAULTS),
    chrome.storage.local.get({ totalBlocked: 0 }),
  ]);
  settings = { ...DEFAULTS, ...stored };
  $('total-count').textContent = Number(local.totalBlocked).toLocaleString();
  render();
  await loadTab();
  render();
})();

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.totalBlocked) {
    $('total-count').textContent = Number(changes.totalBlocked.newValue || 0).toLocaleString();
  }
  if (area === 'sync') {
    for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
    // Give the content script a moment to re-scan, then refresh the per-page count.
    setTimeout(async () => { await loadTab(); render(); }, 250);
    render();
  }
});
