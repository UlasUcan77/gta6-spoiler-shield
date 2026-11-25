/*
 * GTA VI Spoiler Shield — keyword matcher.
 *
 * Pure logic with no DOM or chrome.* dependencies, so it runs both in the
 * content script and in Node (tests). Exposed as `globalThis.GVSMatcher`.
 */
(function (root) {
  'use strict';

  // Separators allowed between tokens of a keyword: "GTA 6", "GTA-6", "GTA_6", "GTA.6", "GTA6".
  const SEP = '[\\s\\u00A0\\-_.·:]*';

  // Core terms: the game itself. Always on while the shield is enabled.
  const CORE_PATTERNS = [
    // GTA 6 / GTA VI / GTA6 / #GTAVI / GTA-6 / "GTA ⅥI" style unicode roman numeral
    'gta' + SEP + '(?:6|vi|\\u2165)',
    // Grand Theft Auto 6 / VI
    'grand' + SEP + 'theft' + SEP + 'auto' + SEP + '(?:6|vi|\\u2165)',
    // Common hashtags / slang
    'gtavi',
    'gta6',
    'sixth' + SEP + 'gta',
  ];

  // Deep-spoiler terms: setting, characters and places revealed in marketing.
  // These are optional because some of them (e.g. "Vice City") also refer to
  // older titles.
  const DEEP_TERMS = [
    'Leonida',
    'Vice City',
    'Port Gellhorn',
    'Grassrivers',
    'Mount Kalaga',
    'Leonida Keys',
    'Jason Duval',
    'Lucia Caminos',
    'Cal Hampton',
    'Boobie Ike',
    "Dre'Quan Priest",
    'DreQuan Priest',
    'Real Dimez',
    'Raul Bautista',
    'Brian Heder',
  ];

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Turn a plain user keyword into a tolerant pattern ("vice city" ≈ "Vice-City" ≈ "ViceCity"). */
  function keywordToPattern(keyword) {
    const cleaned = String(keyword || '').trim();
    if (!cleaned) return null;
    const parts = cleaned.split(/[\s \-_.]+/).filter(Boolean).map(escapeRegExp);
    if (!parts.length) return null;
    // Allow the apostrophe in names like Dre'Quan to be any quote mark or missing.
    return parts.join(SEP).replace(/'/g, "['\\u2019\\u2018`]?");
  }

  /**
   * Build a matcher.
   * @param {{deepSpoilers?: boolean, customKeywords?: string[]}} opts
   * @returns {{test(text: string): boolean, find(text: string): string|null, source: string}}
   */
  function createMatcher(opts) {
    const options = opts || {};
    const patterns = CORE_PATTERNS.slice();
    if (options.deepSpoilers !== false) {
      for (const term of DEEP_TERMS) {
        const p = keywordToPattern(term);
        if (p) patterns.push(p);
      }
    }
    for (const term of options.customKeywords || []) {
      const p = keywordToPattern(term);
      if (p) patterns.push(p);
    }

    // Letter/number boundaries that also work for non-ASCII text (Turkish, etc.).
    const source = '(?<![\\p{L}\\p{N}])(?:' + patterns.join('|') + ')(?![\\p{L}\\p{N}])';
    const re = new RegExp(source, 'iu');

    function normalize(text) {
      // Strip zero-width characters people use to dodge filters ("G​TA 6").
      return String(text || '').replace(/[​-‍⁠﻿­]/g, '');
    }

    return {
      source,
      test(text) {
        if (!text) return false;
        return re.test(normalize(text));
      },
      find(text) {
        if (!text) return null;
        const m = normalize(text).match(re);
        return m ? m[0] : null;
      },
    };
  }

  const api = { createMatcher, keywordToPattern, CORE_PATTERNS, DEEP_TERMS };
  root.GVSMatcher = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
