'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatcher, keywordToPattern } = require('../src/matcher.js');

const core = createMatcher({ deepSpoilers: false });
const deep = createMatcher({ deepSpoilers: true });

test('matches the common ways people write the title', () => {
  const hits = [
    'GTA 6 is finally out!',
    'gta6 ending explained',
    'GTA VI review: a masterpiece',
    'GTAVI speedrun world record',
    '#GTA6 trending',
    '#GTAVI',
    'GTA-6 leaks',
    'GTA_VI mods',
    'gta.6',
    'Grand Theft Auto VI launch trailer',
    'grand theft auto 6 ending',
    'Grand-Theft-Auto-VI',
    'GTA 6’nın sonu çok şaşırtıcı', // Turkish suffix after apostrophe
    'GTA 6 hikayesi', // separated by space
    '(GTA 6)',
    '"GTA VI"',
    'G​TA 6 hidden with a zero-width space',
    'GTA 6 with a no-break space',
  ];
  for (const text of hits) assert.ok(core.test(text), `should match: ${text}`);
});

test('does not match other games or unrelated words', () => {
  const misses = [
    'GTA V is still great',
    'GTA 5 online update',
    'GTA IV remaster rumours',
    'GTA San Andreas',
    'GTA 60fps patch',
    'GTA VII when?',
    'gta vice city stories', // older title, not matched by core list
    'Vigilante 6',
    'agta6x',
    'regatta 6 boats',
    'I love pasta 6 times a week',
    '',
  ];
  for (const text of misses) assert.equal(core.test(text), false, `should not match: ${text}`);
});

test('deep spoiler list covers characters and places, and can be turned off', () => {
  for (const text of ['Jason Duval and Lucia Caminos', 'Welcome to Leonida', 'port gellhorn map', 'Vice-City beach', 'DreQuan Priest', 'Dre’Quan Priest']) {
    assert.ok(deep.test(text), `deep should match: ${text}`);
  }
  assert.equal(core.test('Welcome to Leonida'), false);
  assert.equal(core.test('Jason Duval'), false);
});

test('custom keywords are tolerant of separators and case', () => {
  const m = createMatcher({ deepSpoilers: false, customKeywords: ['secret ending', 'Trevor', '  ', ''] });
  assert.ok(m.test('The SECRET-ENDING is wild'));
  assert.ok(m.test('secretending'));
  assert.ok(m.test('Trevor returns?!'));
  assert.equal(m.test('Trevors'), false, 'respects word boundaries');
});

test('custom keywords with regex characters are escaped', () => {
  const m = createMatcher({ deepSpoilers: false, customKeywords: ['c++ (leak)', 'a.b'] });
  assert.ok(m.test('new c++ (leak) found'));
  assert.equal(m.test('aXb'), false);
});

test('find returns the matched fragment', () => {
  assert.equal(core.find('Watch the GTA VI trailer'), 'GTA VI');
  assert.equal(core.find('nothing here'), null);
});

test('keywordToPattern ignores empty input', () => {
  assert.equal(keywordToPattern(''), null);
  assert.equal(keywordToPattern('   '), null);
  assert.equal(keywordToPattern(null), null);
});
