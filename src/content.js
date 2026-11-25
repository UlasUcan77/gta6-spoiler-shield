/*
 * GTA VI Spoiler Shield — content script.
 *
 * Watches the page for text, titles, alt texts and aria-labels that mention
 * GTA VI, and blurs (or hides) the smallest sensible "card" around them:
 * a tweet, a YouTube video tile, a Reddit post, a search result, a paragraph…
 */
(() => {
  'use strict';
  if (window.__gvsLoaded) return;
  window.__gvsLoaded = true;

  const M = globalThis.GVSMatcher;
  const api = globalThis.chrome;
  const isTop = window.top === window;

  const DEFAULTS = {
    enabled: true,
    mode: 'blur', // 'blur' | 'hide'
    deepSpoilers: true,
    pageShield: true,
    customKeywords: [],
    allowlist: [],
    pausedUntil: 0,
  };

  // Site-specific "cards". The nearest matching ancestor of a spoiler wins.
  const SITE_CONTAINERS = [
    // YouTube
    'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
    'ytd-grid-video-renderer', 'ytd-reel-item-renderer', 'ytd-playlist-renderer',
    'ytd-compact-playlist-renderer', 'ytd-radio-renderer', 'ytd-compact-radio-renderer',
    'ytd-channel-renderer', 'ytd-comment-thread-renderer', 'ytd-comment-view-model',
    'ytd-post-renderer', 'ytd-backstage-post-thread-renderer', 'ytd-notification-renderer',
    'yt-lockup-view-model', 'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2',
    'ytd-reel-video-renderer', 'ytd-movie-renderer',
    // X / Twitter
    'article[data-testid="tweet"]', '[data-testid="trend"]', '[data-testid="UserCell"]',
    // Reddit (new + old)
    'shreddit-post', 'shreddit-comment', 'reddit-pdp-right-rail-post',
    '[data-testid="search-post-unit"]', 'div.thing > .entry',
    // TikTok
    '[data-e2e="recommend-list-item-container"]', '[data-e2e="search_top-item"]',
    '[data-e2e="user-post-item"]',
    // Twitch
    '[data-a-target="video-tower-card"]', '.chat-line__message',
    // Discord
    'li[id^="chat-messages-"]',
    // Google search / news
    '.MjjYud', 'g-inner-card', '.g',
    // Generic social cards (Facebook, Instagram, Threads, Bluesky, Mastodon, news sites)
    '[role="article"]', 'article',
  ].join(',');

  const GENERIC_CONTAINERS = 'li, [role="listitem"], tr, figure, [class*="card" i], [class*="post" i]';
  const SMALL_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, blockquote, figcaption, dd, dt, td, th, summary, label, a';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'TEMPLATE', 'svg', 'CODE', 'PRE', 'HEAD', 'TITLE']);
  const MAX_CARD_TEXT = 6000;

  let settings = { ...DEFAULTS };
  let matcher = M.createMatcher(settings);
  let active = false;
  let ready = false;
  let pauseTimer = null;
  let blockedCount = 0;
  let pendingTotal = 0;
  const blocked = new Set();
  const revealedPages = new Set();

  const msg = (key, fallback) => {
    try { return (api && api.i18n && api.i18n.getMessage(key)) || fallback; } catch { return fallback; }
  };
  const LABEL = msg('blockedLabel', '🛡️ GTA VI content blocked — click to reveal');

  /* ---------------------------------------------------------------- state */

  function hostAllowed() {
    const host = location.hostname.replace(/^www\./, '');
    return (settings.allowlist || []).some((h) => {
      const a = String(h).trim().replace(/^www\./, '');
      return a && (host === a || host.endsWith('.' + a));
    });
  }

  function computeActive() {
    clearTimeout(pauseTimer);
    const paused = settings.pausedUntil && settings.pausedUntil > Date.now();
    if (paused) {
      pauseTimer = setTimeout(applySettings, Math.min(settings.pausedUntil - Date.now() + 50, 2 ** 31 - 1));
    }
    return Boolean(settings.enabled) && !paused && !hostAllowed();
  }

  function applySettings() {
    matcher = M.createMatcher(settings);
    unblockAll();
    removePageShield();
    active = computeActive();
    document.documentElement.classList.toggle('gvs-hide-mode', settings.mode === 'hide');
    if (active) {
      fullScan();
      checkPage();
    }
    reportCount();
  }

  /* ------------------------------------------------------------ blocking */

  function pickContainer(el) {
    if (!el || el === document.body || el === document.documentElement) return null;

    const site = el.closest(SITE_CONTAINERS);
    if (site && site !== document.body && site.textContent.length <= MAX_CARD_TEXT * 3) return site;

    const generic = el.closest(GENERIC_CONTAINERS);
    if (generic && generic !== document.body && generic.textContent.length <= MAX_CARD_TEXT) return generic;

    const small = el.closest(SMALL_BLOCKS);
    if (small && small !== document.body) return small;

    return el;
  }

  function block(el, hit) {
    if (!el || el.classList.contains('gvs-blocked')) return;
    if (el.closest('#gvs-page-shield')) return;
    // Never block an ancestor of something already blocked twice: reuse the outer card.
    if (el.closest('.gvs-blocked')) return;

    // Direct text children cannot be blurred separately from the overlay label,
    // so small text blocks get an inline blur instead of a card overlay.
    const hasDirectText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.nodeValue.trim());
    el.classList.add('gvs-blocked', hasDirectText ? 'gvs-inline' : 'gvs-card');
    el.setAttribute('data-gvs-label', LABEL);
    if (el.hasAttribute('title')) el.setAttribute('data-gvs-title', el.getAttribute('title'));
    el.setAttribute('title', LABEL);
    if (hit) el.setAttribute('data-gvs-hit', hit);
    if (!hasDirectText) {
      try {
        if (getComputedStyle(el).position === 'static') el.classList.add('gvs-rel');
      } catch { /* detached */ }
    }
    blocked.add(el);
    blockedCount++;
    pendingTotal++;
    scheduleReport();
  }

  function unblock(el) {
    el.classList.remove('gvs-blocked', 'gvs-inline', 'gvs-card', 'gvs-rel', 'gvs-revealed');
    el.removeAttribute('data-gvs-label');
    el.removeAttribute('data-gvs-hit');
    if (el.getAttribute('title') === LABEL) {
      if (el.hasAttribute('data-gvs-title')) el.setAttribute('title', el.getAttribute('data-gvs-title'));
      else el.removeAttribute('title');
    }
    el.removeAttribute('data-gvs-title');
    blocked.delete(el);
  }

  function unblockAll() {
    for (const el of Array.from(blocked)) unblock(el);
    blockedCount = 0;
  }

  function elementText(el) {
    let text = el.textContent || '';
    for (const node of el.querySelectorAll('[aria-label],[title],img[alt]')) {
      text += ' ' + (node.getAttribute('aria-label') || '') + ' ' + (node.getAttribute('alt') || '');
      const t = node.getAttribute('title');
      if (t && t !== LABEL) text += ' ' + t;
    }
    return text;
  }

  /** Re-check cards whose content changed (YouTube & co. recycle DOM nodes). */
  function recheck(el) {
    if (!el.isConnected) { blocked.delete(el); return; }
    if (!matcher.test(elementText(el))) {
      unblock(el);
      blockedCount = Math.max(0, blockedCount - 1);
      reportCount();
    }
  }

  function skipElement(el) {
    if (!el || SKIP_TAGS.has(el.tagName)) return true;
    if (el.isContentEditable) return true;
    if (el.closest('.gvs-blocked, #gvs-page-shield, [contenteditable=""], [contenteditable="true"]')) return true;
    return false;
  }

  function handleText(node) {
    const value = node.nodeValue;
    if (!value || value.length < 3) return;
    const hit = matcher.find(value);
    if (!hit) return;
    const parent = node.parentElement;
    if (skipElement(parent)) return;
    block(pickContainer(parent), hit);
  }

  function handleAttributes(el) {
    if (el.nodeType !== 1 || skipElement(el)) return;
    for (const attr of ['aria-label', 'title', 'alt']) {
      const v = el.getAttribute(attr);
      if (v && v !== LABEL) {
        const hit = matcher.find(v);
        if (hit) { block(pickContainer(el), hit); return; }
      }
    }
  }

  function scan(root) {
    if (!active || !root) return;
    if (root.nodeType === 3) { handleText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && SKIP_TAGS.has(root.tagName)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) handleText(n);

    if (root.nodeType === 1) handleAttributes(root);
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll('[aria-label],[title],img[alt]')) handleAttributes(el);
    }
  }

  function fullScan() {
    scan(document.documentElement);
  }

  /* --------------------------------------------------------- page shield */

  function pageText() {
    const og = document.querySelector('meta[property="og:title"]');
    let path = '';
    try { path = decodeURIComponent(location.pathname).replace(/[-_/+]+/g, ' '); } catch { path = location.pathname; }
    return [document.title, og && og.getAttribute('content'), path].filter(Boolean).join(' \n ');
  }

  function isOwnSearch() {
    // Don't shield a results page for something the user searched for themselves.
    let q = '';
    try { q = decodeURIComponent(location.search.replace(/\+/g, ' ')); } catch { q = location.search; }
    return matcher.test(q);
  }

  function checkPage() {
    if (!isTop || !active || !settings.pageShield) { removePageShield(); return; }
    const key = location.href.split('#')[0];
    if (revealedPages.has(key)) return;
    const hit = matcher.find(pageText());
    if (hit && !isOwnSearch()) showPageShield(key, hit);
    else removePageShield();
  }

  function showPageShield(key, hit) {
    if (document.getElementById('gvs-page-shield')) return;
    const shield = document.createElement('div');
    shield.id = 'gvs-page-shield';
    shield.setAttribute('role', 'dialog');
    shield.setAttribute('aria-modal', 'true');

    const card = document.createElement('div');
    card.className = 'gvs-ps-card';

    const icon = document.createElement('div');
    icon.className = 'gvs-ps-icon';
    icon.textContent = '🛡️';

    const h = document.createElement('h2');
    h.textContent = msg('pageShieldTitle', 'Spoiler zone ahead');

    const p = document.createElement('p');
    p.textContent = msg('pageShieldBody', 'This page looks like it is about GTA VI. Spoiler Shield covered it so nothing slips through.');

    const tag = document.createElement('code');
    tag.textContent = msg('pageShieldMatched', 'Matched') + ': “' + hit + '”';

    const row = document.createElement('div');
    row.className = 'gvs-ps-row';

    const back = document.createElement('button');
    back.className = 'gvs-ps-primary';
    back.textContent = msg('pageShieldBack', 'Get me out of here');
    back.addEventListener('click', () => {
      if (history.length > 1) history.back();
      else location.href = 'about:blank';
    });

    const show = document.createElement('button');
    show.className = 'gvs-ps-ghost';
    show.textContent = msg('pageShieldShow', 'Show the page anyway');
    show.addEventListener('click', () => {
      revealedPages.add(key);
      removePageShield();
    });

    row.append(back, show);
    card.append(icon, h, p, tag, row);
    shield.append(card);
    (document.body || document.documentElement).append(shield);
    document.documentElement.classList.add('gvs-page-locked');
    for (const media of document.querySelectorAll('video, audio')) {
      try { media.pause(); } catch { /* ignore */ }
    }
  }

  function removePageShield() {
    const el = document.getElementById('gvs-page-shield');
    if (el) el.remove();
    document.documentElement.classList.remove('gvs-page-locked');
  }

  /* ------------------------------------------------------------- events */

  // Clicking a blocked card reveals it instead of following the (spoiler) link.
  const swallow = (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const b = t.closest('.gvs-blocked:not(.gvs-revealed)');
    if (!b) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') b.classList.add('gvs-revealed');
  };
  for (const type of ['click', 'auxclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
    window.addEventListener(type, swallow, true);
  }

  const pendingRecheck = new Set();
  let recheckScheduled = false;

  const observer = new MutationObserver((mutations) => {
    if (!active) return;
    let titleChanged = false;
    for (const m of mutations) {
      const target = m.target;
      // Ignore our own label/title writes.
      if (m.type === 'attributes' && m.attributeName === 'title' &&
          (target.getAttribute('title') === LABEL || m.oldValue === LABEL)) continue;
      const owner = target.nodeType === 1 ? target : target.parentElement;
      if (owner) {
        if (owner.closest && owner.closest('#gvs-page-shield')) continue;
        if (owner.tagName === 'TITLE' || (owner.closest && owner.closest('title'))) titleChanged = true;
        const card = owner.closest && owner.closest('.gvs-blocked');
        if (card) pendingRecheck.add(card);
      }
      if (m.type === 'childList') {
        for (const n of m.addedNodes) scan(n);
      } else if (m.type === 'characterData') {
        handleText(target);
      } else if (m.type === 'attributes') {
        handleAttributes(target);
      }
    }
    if (pendingRecheck.size && !recheckScheduled) {
      recheckScheduled = true;
      setTimeout(() => {
        recheckScheduled = false;
        for (const el of pendingRecheck) recheck(el);
        pendingRecheck.clear();
      }, 150);
    }
    if (titleChanged) checkPage();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'title', 'alt'],
    attributeOldValue: true,
  });

  // While the page shield is up, keep videos (e.g. a YouTube trailer) paused.
  window.addEventListener('play', (e) => {
    if (document.documentElement.classList.contains('gvs-page-locked') && e.target && e.target.pause) {
      e.target.pause();
    }
  }, true);

  // SPA navigation (YouTube, X, Reddit…).
  let lastUrl = location.href;
  const onNavigate = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    removePageShield();
    setTimeout(checkPage, 300);
  };
  window.addEventListener('popstate', onNavigate);
  window.addEventListener('yt-navigate-finish', onNavigate);
  setInterval(onNavigate, 1000);

  /* ------------------------------------------------------- reporting */

  let reportTimer = null;
  function scheduleReport() {
    if (reportTimer) return;
    reportTimer = setTimeout(() => { reportTimer = null; reportCount(); }, 400);
  }

  function reportCount() {
    if (!api || !api.runtime || !api.runtime.id) return;
    const added = pendingTotal;
    pendingTotal = 0;
    try {
      api.runtime.sendMessage({ type: 'gvs:count', count: isTop ? blockedCount : undefined, active, added }).catch(() => {});
    } catch { /* extension reloaded */ }
  }

  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isTop || !message) return;
      if (message.type === 'gvs:status') {
        sendResponse({ count: blockedCount, host: location.hostname, active });
      } else if (message.type === 'gvs:revealAll') {
        for (const el of blocked) el.classList.add('gvs-revealed');
        sendResponse({ ok: true });
      }
    });
  }

  /* ------------------------------------------------------------ boot */

  function boot(stored) {
    settings = { ...DEFAULTS, ...(stored || {}) };
    ready = true;
    applySettings();
  }

  if (api && api.storage && api.storage.sync) {
    api.storage.sync.get(DEFAULTS).then(boot, () => boot(DEFAULTS));
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !ready) return;
      for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
      applySettings();
    });
  } else {
    // Demo / test environment without extension APIs.
    boot(globalThis.GVS_DEMO_SETTINGS || DEFAULTS);
  }

  // Expose a tiny hook for the demo page and tests.
  globalThis.__gvs = {
    get count() { return blockedCount; },
    update(next) { settings = { ...settings, ...next }; applySettings(); },
    rescan: fullScan,
  };
})();
