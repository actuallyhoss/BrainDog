/**
 * WHAT TODAY READS BESIDE ITS PAGE: the briefing, and nothing of the record's housekeeping.
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
  assert.match(area, /\{:else if area === 'tidy'\}\s*\{#await import\('\.\/areas\/Health\.svelte'\) then \{ default: Health \}\}<Health \{shell\} \{area\} \/>\{\/await\}/u);
});

test('NO MORE FOLD AT THE FOOT OF TODAY (frame A): the briefing is neither asked nor drawn, and the page is drawn once', () => {
  /* The desk opens on what needs you, not on the briefing (roadmap slice 1a): the reader is handed no `opens`. */
  assert.doesNotMatch(home, /<PageView [^>]*opens=/u);
  assert.doesNotMatch(home, /<brief\.Part|class="more-body"|moreOpen/u);
  assert.doesNotMatch(home, /import\('\.\/(?:briefing\.ts|Briefing\.svelte)'\)/u);
  /* ONE READER, in one snippet: the board's and a kept page's props differ, so it is written twice under one `{#if}`,
     and the snippet is rendered once on each side of the board's `{#if}`. */
  const reader = /\{#snippet readerPart\(\)\}([\s\S]*?)\{\/snippet\}/u.exec(home)?.[1] ?? '';
  assert.equal(home.split('<PageView').length - 1, reader.split('<PageView').length - 1, 'the page is drawn only in its snippet');
  assert.match(reader, /\{#if board\}\s*<PageView [^>]*\/>\s*\{:else\}\s*<PageView [^>]*\/>\s*\{\/if\}/u, 'the page is drawn once');
  assert.match(home, /\{#if board\}[\s\S]*?<Board [^\n]*>\{@render readerPart\(\)\}<\/Board>[\s\S]*?\{:else\}\s*\{@render readerPart\(\)\}\s*\{\/if\}/u);
  assert.equal(home.split('{@render readerPart()}').length - 1, 2);
  const body = readFileSync(new URL('../page/PageBody.svelte', import.meta.url), 'utf8');
  /* The reader still takes what a kept page opens its board with, under the headline or over the first block. */
  assert.match(body, /const opensAt = \$derived\(opens && !arranging && headline && reading\[0\] === headline \? headline\.at : -1\);/u);
  assert.equal(body.split('{@render opens()}').length - 1, 2);
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

test('ONE TODAY: the old one is gone, so `/?classic` is an address somebody kept and it opens Home', () => {
  /* THE DOOR READS NO `classic`, and Home is the last branch alone. */
  assert.doesNotMatch(door, /searchParams\.has\('classic'\)/u);
  assert.doesNotMatch(door, /Today\.svelte/u);
  assert.match(door, /\{:else\}\s*<Home \{data\} \/>\s*\{\/if\}/u);
  assert.equal(door.split('<Home').length - 1, 1);
});
