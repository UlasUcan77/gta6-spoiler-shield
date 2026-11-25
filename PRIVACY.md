# Privacy Policy — GTA VI Spoiler Shield

_Last updated: 25 November 2026_

GTA VI Spoiler Shield does **not** collect, transmit, sell or share any personal data.

## What the extension reads
To find spoilers, the extension reads the text, titles, image alt texts and aria-labels of the pages you visit.
This happens **entirely inside your browser**. Page content is never stored and never sent anywhere.

## What the extension stores
Using Chrome's built-in `chrome.storage`:

| Data | Where | Why |
| --- | --- | --- |
| Your settings (on/off, blur/hide, toggles, your own keywords, allowed sites, pause time) | `chrome.storage.sync` | So your preferences follow your Chrome profile |
| A single number: how many items were blocked in total | `chrome.storage.local` | Shown in the popup |

Nothing else is stored. There are no analytics, no trackers, no remote code and no network requests of any kind.

## Permissions
- **storage** — save the settings above.
- **contextMenus** — the right-click "Block … as a spoiler keyword" item.
- **Access to all sites (content script)** — spoilers can appear on any website, so the blocker needs to run on every page. It only reads and restyles the page locally.

## Contact
Open an issue at https://github.com/UlasUcan77/gta6-spoiler-shield/issues
