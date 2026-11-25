# Chrome Web Store listing (copy-paste kit)

Everything needed to submit at https://chrome.google.com/webstore/devconsole

## Package
`dist/gta6-spoiler-shield-v1.0.0.zip` (build it with `npm run build`, or download it from the GitHub release).

## Store listing tab

**Name** (from manifest): GTA VI Spoiler Shield

**Summary** (from manifest, max 132 chars):
Blur or hide GTA VI spoilers everywhere: YouTube, X, Reddit, TikTok, Google, news sites and more. Play it fresh.

**Category:** Productivity (alternative: Fun)

**Language:** English (Turkish is included through `_locales/tr`)

**Description:**
```
GTA VI is out and the internet is one big spoiler. Spoiler Shield covers GTA VI content before you see it, so you can play the story fresh.

WHAT IT DOES
• Blurs or hides posts, videos, search results and comments that mention GTA VI
• Works on YouTube, X/Twitter, Reddit, TikTok, Twitch, Discord, Google, Facebook, Instagram, Threads, Bluesky, Mastodon and every other website
• Covers the whole card (a tweet, a video tile, a Reddit post), not just the word
• One click reveals a single item, so you stay in control
• Full-page warning for pages and videos that are entirely about the game. The video stays paused
• Deep spoilers mode also catches character names, cities and places from the game
• Smart matching: GTA 6, GTA VI, GTA6, #GTAVI, Grand Theft Auto VI… without touching GTA V or GTA IV
• Add your own keywords, or right-click any selected text to block it
• Allow specific sites, pause for an hour, or toggle with Alt+Shift+G
• English and Turkish interface

PRIVACY
No data collection, no analytics, no network requests. Everything runs locally in your browser. Open source: https://github.com/UlasUcan77/gta6-spoiler-shield

Unofficial fan-made tool. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive.
```

**Graphic assets** (in `docs/images/`):
- Store icon 128×128: `icons/icon128.png`
- Screenshots 1280×800: `feed-blur.png`, `feed-social.png`, `page-shield.png`, `store-popup.png`
- Small promo tile 440×280: `promo-small-440x280.png`

## Privacy tab

**Single purpose:**
Hide or blur web content that mentions GTA VI so users can avoid spoilers.

**Permission justifications:**
- `storage`: Saves the user's settings (on/off, blur or hide, custom keywords, allowed sites) and a local counter of blocked items.
- `contextMenus`: Adds a right-click item that lets the user add the selected text as a custom spoiler keyword.
- Host permission (content script on all http/https sites): Spoilers can appear on any website. The content script reads page text locally to detect spoilers and restyles matching elements. No page data leaves the browser.

**Remote code:** No, I am not using remote code.

**Data usage:** Do not tick any data type. Certify the three statements (no selling, no unrelated use, no creditworthiness).

**Privacy policy URL:**
https://github.com/UlasUcan77/gta6-spoiler-shield/blob/main/PRIVACY.md

## Distribution tab
Visibility: Public · Regions: All regions · Free
