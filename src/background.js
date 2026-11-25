/*
 * GTA VI Spoiler Shield — service worker.
 * Keeps the toolbar badge in sync, stores lifetime stats, and wires up the
 * context menu + keyboard shortcut.
 */
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

const MENU_ID = 'gvs-add-keyword';

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(null);
  const missing = {};
  for (const [k, v] of Object.entries(DEFAULTS)) if (!(k in current)) missing[k] = v;
  if (Object.keys(missing).length) await chrome.storage.sync.set(missing);

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: chrome.i18n.getMessage('menuAddKeyword') || 'Block “%s” as a spoiler keyword',
      contexts: ['selection'],
    });
  });
  refreshBadgeStyle();
});

chrome.runtime.onStartup.addListener(refreshBadgeStyle);

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const word = info.selectionText.trim().slice(0, 80);
  if (!word) return;
  const { customKeywords = [] } = await chrome.storage.sync.get('customKeywords');
  if (!customKeywords.some((k) => k.toLowerCase() === word.toLowerCase())) {
    await chrome.storage.sync.set({ customKeywords: [...customKeywords, word] });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-shield') return;
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  await chrome.storage.sync.set({ enabled: !enabled, pausedUntil: 0 });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && ('enabled' in changes || 'pausedUntil' in changes)) refreshBadgeStyle();
});

async function refreshBadgeStyle() {
  const { enabled = true, pausedUntil = 0 } = await chrome.storage.sync.get(['enabled', 'pausedUntil']);
  const on = enabled && !(pausedUntil > Date.now());
  await chrome.action.setBadgeBackgroundColor({ color: on ? '#db2777' : '#64748b' });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  if (!on) await chrome.action.setBadgeText({ text: 'off' });
  else await chrome.action.setBadgeText({ text: '' });
}

// Serialize lifetime-counter writes so concurrent tabs don't lose increments.
let statsQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'gvs:count') return;
  const tabId = sender.tab && sender.tab.id;

  if (tabId != null && typeof message.count === 'number') {
    const text = !message.active ? 'off'
      : message.count > 0 ? (message.count > 999 ? '999+' : String(message.count)) : '';
    chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  }

  if (message.added > 0) {
    statsQueue = statsQueue.then(async () => {
      const { totalBlocked = 0 } = await chrome.storage.local.get('totalBlocked');
      await chrome.storage.local.set({ totalBlocked: totalBlocked + message.added });
    }).catch(() => {});
  }
});
