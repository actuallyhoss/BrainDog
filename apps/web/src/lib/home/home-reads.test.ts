/**
 * WHAT TODAY READS BESIDE ITS PAGE: the briefing, and nothing of the record's housekeeping (the audit of 22 October, U3).
 *
 * What went stale, who the record matched, what it found wrong in its own pages and notes, what the answers taught, what
 * may be one, what has no colour and the imported rules stood under Today's More, each a read of its own after the page,
 * and the walk of every page and note held his whole record for about ten seconds on an open. They are Settings ›
 * Health now, read only when that area opens (`Health.svelte`), and Today asks none of them.
 *
 * A TEXT TEST OVER THE PARTS, as `home-mark-static.test.ts` is: that the briefing is fetched when it is asked for and
 * never with the screen, that the page read waits on it, that it is drawn once and in More, and that no address draws it
 * twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (at: string): string => readFileSync(new URL(at, import.meta.url), 'utf8');

/** A part without its comments, so a comment quoting a call cannot fail or pass a check. */
const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

const home = bare(source('./Home.svelte'));
const door = bare(source('../../routes/+page.svelte'));
const classic = bare(source('./Today.svelte'));
const health = bare(source('../../routes/settings/[area]/areas/Health.svelte'));
const area = bare(source('../../routes/settings/[area]/+page.svelte'));

/** The record's housekeeping: each reader's module, its part, and the call Health asks it with. */
const HOUSEKEEPING = [
  ['stale', 'Stale', 'readStale'],
  ['matched', 'Matched', 'readMatched'],
  ['text-faults', 'TextFaults', 'textFaultsOnce'],
  ['learned', 'Learned', 'loadLearned'],
  ['named-twice', 'NamedTwice', 'loadNamedTwice'],
  ['hues', 'Hues', 'loadHues'],
  ['imported-rules', 'ImportedRules', 'loadImported'],
] as const;

test('TODAY ASKS NONE OF THE RECORD\'S HOUSEKEEPING: no reader, no part and no call of theirs is in it', () => {
  for (const [file, part, call] of HOUSEKEEPING) {
    assert.doesNotMatch(home, new RegExp(`/${file}\\.ts'`, 'u'), `Today reaches ${file}.ts`);
    assert.doesNotMatch(home, new RegExp(`/${part}\\.svelte'`, 'u'), `Today reaches ${part}.svelte`);
    assert.doesNotMatch(home, new RegExp(`\\b${call}\\(`, 'u'), `Today asks ${call}`);
  }
  assert.doesNotMatch(home, /\bhomeReads\b/u);
});

test('SETTINGS › HEALTH ASKS THEM, each with its part when it is asked for, one at a time when the tab is idle', () => {
  for (const [file, part, call] of HOUSEKEEPING) {
    assert.doesNotMatch(health, new RegExp(`^\\s*import (?!type\\b)[^;]*from '[^']*/(${file}\\.ts|${part}\\.svelte)';$`, 'mu'), `${file} is imported with Settings`);
    assert.match(health, new RegExp(`import\\('\\$lib/home/${file}\\.ts'\\)`, 'u'), `Health does not fetch ${file}.ts`);
    assert.match(health, new RegExp(`import\\('\\$lib/home/${part}\\.svelte'\\)`, 'u'), `Health does not fetch ${part}.svelte`);
    assert.match(health, new RegExp(`\\bm\\.${call}\\(base, io\\)`, 'u'), `Health does not ask ${call}`);
  }
  assert.match(health, /for \(const part of parts\) \{\s*await idle\(\);\s*if \(!here \|\| leaving\.signal\.aborted\) break;/u);
  /* AND SETTINGS FETCHES HEALTH ITSELF ONLY WHEN THAT AREA OPENS. */
  assert.match(area, /\{:else if area === 'health'\}\s*\{#await import\('\.\/areas\/Health\.svelte'\) then \{ default: Health \}\}<Health \{shell\} \{area\} \/>\{\/await\}/u);
});

test('THE BRIEFING IS BEHIND MORE: never handed to the reader, and drawn once, in More', () => {
  /* The desk opens on what needs you, not on the briefing (roadmap slice 1a): the reader is handed no `opens`. */
  assert.doesNotMatch(home, /<PageView [^>]*opens=/u);
  assert.equal(home.split('<brief.Part').length - 1, 1, 'the briefing is drawn once');
  assert.equal(home.split('{@render briefed()}').length - 1, 1, 'the briefing is drawn twice, or not at all');
  const more = home.indexOf('class="more-body"');
  assert.ok(more > 0 && home.indexOf('{@render briefed()}') > more, 'the briefing is not inside More');
  assert.equal(home.split('<PageView').length - 1, 1, 'the page is drawn once');
  const body = readFileSync(new URL('../page/PageBody.svelte', import.meta.url), 'utf8');
  /* The reader still takes what a kept page opens its board with, under the headline or over the first block. */
  assert.match(body, /const opensAt = \$derived\(opens && !arranging && headline && reading\[0\] === headline \? headline\.at : -1\);/u);
  assert.equal(body.split('{@render opens()}').length - 1, 2);
});

test('THE BRIEFING IS DRAWN WHILE ITS MODEL IS PAUSED (U2), and its paused foot is not said beside the quiet line (U7)', () => {
  assert.match(home, /const briefShown = \$derived\(\(brief\?\.cards\.length \?\? 0\) > 0\);/u);
  assert.match(home, /const extras = \$derived\(briefShown \? 1 : 0\);/u);
  assert.match(home, /<brief\.Part cards=\{brief\.cards\} foot=\{quiet !== null && brief\.foot === brief\.paused \? null : brief\.foot\} \/>/u);
});

test('the briefing does not come with the screen: it is fetched when asked for, part and all', () => {
  for (const name of ['briefing', 'Briefing']) {
    assert.doesNotMatch(home, new RegExp(`^\\s*import (?!type\\b)[^;]*from '[^']*/${name}(\\.svelte|\\.ts)';$`, 'mu'), `${name} is imported with the screen`);
  }
  assert.match(home, /import\('\.\/briefing\.ts'\)/u);
  assert.match(home, /import\('\.\/Briefing\.svelte'\)/u);
  /* AND IT IS ASKED ONCE THE PAGE'S OWN READ HAS GONE OUT, so the record answers the page first. */
  const effect = home.split('$effect(').slice(1).find((e) => e.includes("tileOnce('briefing', base, ver,"));
  assert.ok(effect, 'no effect asks for the briefing');
  assert.match(effect, /^\(\) => \{\s*if \(data\.refused \|\| !bodyAsked\) return;/u);
});

test('the page read waits on it', () => {
  const body = /async function readBody\([\s\S]*?\n {2}\}\n/u.exec(home);
  assert.ok(body, 'readBody is gone');
  assert.doesNotMatch(body[0], /riefing/u, 'the page read reads the briefing itself');
  const reread = /async function reread\(\)[\s\S]*?\n {2}\}\n/u.exec(home);
  assert.ok(reread, 'reread is gone');
  assert.doesNotMatch(reread[0], /riefing/u);
  assert.doesNotMatch(home, /await\s+brief\b/u);
});

test('no address draws the briefing twice: Today as it was is a screen of its own, and Home is not under it', () => {
  /* THE DOOR DRAWS ONE OR THE OTHER. `/?classic` loads Today as it was and Home is the last branch alone. */
  assert.match(door, /\{:else if page\.url\.searchParams\.has\('classic'\)\}\s*\{#await import\('\$lib\/home\/Today\.svelte'\)/u);
  assert.match(door, /\{:else\}\s*<Home \{data\} \/>\s*\{\/if\}/u);
  assert.equal(door.split('<Home').length - 1, 1);
  /* AND NEITHER SCREEN HOLDS THE OTHER, so one screen is one briefing. */
  assert.doesNotMatch(classic, /Home\.svelte/u);
  assert.doesNotMatch(home, /Today\.svelte/u);
  assert.equal(classic.split('<Briefing ').length - 1, 1);
});
