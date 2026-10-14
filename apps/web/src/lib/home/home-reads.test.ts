/**
 * WHAT TODAY DRAWS AROUND ITS PAGE, AND IN WHAT ORDER (`homeReads` in `Home.svelte`): the briefing first, the page,
 * and who was matched as the board's last line. The briefing was mounted on Today as it was (`Today.svelte`), which
 * the front door reaches only at `/?classic`, so the Today a record opens on showed none.
 *
 * THE HELPER IS RUN, NOT READ. A component does not load under `node --test`, so the part's module script, which
 * imports nothing, is lifted out of the file, its types are taken off and it is imported as it stands. What is asserted
 * is the function the template draws from.
 *
 * THE REST IS A TEXT TEST OVER THE PARTS, as `home-mark-static.test.ts` is: that each read is fetched when it is asked
 * for and never with the screen, that the page read waits on neither, and that no address draws the briefing twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = (at: string): string => readFileSync(new URL(at, import.meta.url), 'utf8');

/** A part without its comments, so a comment quoting a call cannot fail or pass a check. */
const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

const raw = source('./Home.svelte');
const home = bare(raw);
const door = bare(source('../../routes/+page.svelte'));
const classic = bare(source('./Today.svelte'));

type Reads = (briefing: number, matched: number) => string[];

/** Home's module script, run as it is written. */
async function helper(): Promise<Reads> {
  const found = /<script module lang="ts">([\s\S]*?)<\/script>/u.exec(raw);
  assert.ok(found, 'Home.svelte has no module script to hold homeReads');
  assert.doesNotMatch(bare(found[1]!), /\bimport\b/u, 'the module script imports something, so it is not run alone');
  const js = stripTypeScriptTypes(found[1]!);
  const m = (await import(`data:text/javascript,${encodeURIComponent(js)}`)) as { homeReads?: Reads };
  assert.equal(typeof m.homeReads, 'function', 'Home.svelte exports no homeReads');
  return m.homeReads!;
}

test('the briefing is first, then the page, then who was matched', async () => {
  const homeReads = await helper();
  assert.deepEqual(homeReads(3, 2), ['briefing', 'page', 'matched']);
  assert.deepEqual(homeReads(7, 0), ['briefing', 'page']);
  assert.deepEqual(homeReads(0, 1), ['page', 'matched']);
});

test('a record with neither draws its page and nothing around it', async () => {
  const homeReads = await helper();
  assert.deepEqual(homeReads(0, 0), ['page']);
  /* A COUNT THAT IS NOT ONE IS NONE: a read still out, or an answer that was no list. */
  assert.deepEqual(homeReads(Number.NaN, -1), ['page']);
  assert.deepEqual(homeReads(undefined as unknown as number, null as unknown as number), ['page']);
});

test('the template draws from the helper, each part once and keyed, so a read landing late moves nothing drawn', () => {
  assert.match(home, /\{#each homeReads\([^)]*\) as part \(part\)\}/u);
  assert.equal(home.split('<brief.Part').length - 1, 1, 'the briefing is drawn once');
  assert.equal(home.split('<matched.Part').length - 1, 1, 'who was matched is drawn once');
  assert.equal(home.split('<PageView').length - 1, 1, 'the page is drawn once');
  const order = ["part === 'briefing'", '<brief.Part', '<PageView', '<WantMore', '<matched.Part'].map((mark) => home.indexOf(mark));
  assert.ok(order.every((at) => at > 0), 'a part is missing from the template');
});

test("THE PAGE'S OWN SENTENCE STAYS UNDER THE HEAD: the reader draws the briefing under it, and Home only where no reader does", () => {
  /* Handed to the reader only while it draws the blocks and there is a card, so no empty row opens the board. */
  assert.match(home, /<PageView [^>]*opens=\{paged && brief && brief\.cards\.length > 0 \? briefed : undefined\}/u);
  assert.match(home, /\{#if !paged\}\{@render briefed\(\)\}\{\/if\}/u, 'the briefing is drawn twice, or not at all without a reader');
  assert.match(home, /const paged = \$derived\(reader && drawn\?\.from === 'live'\);/u);
  const body = readFileSync(new URL('../page/PageBody.svelte', import.meta.url), 'utf8');
  /* Under the headline when the headline is what a reader meets first, else over the first block: never both. */
  assert.match(body, /const opensAt = \$derived\(opens && !arranging && headline && reading\[0\] === headline \? headline\.at : -1\);/u);
  assert.equal(body.split('{@render opens()}').length - 1, 2);
  assert.match(body, /\{#if opens && opensAt === at\}/u);
  assert.match(body, /\{#if opens && opensAt < 0\}/u);
  /* And who wrote it goes with the cards. */
  assert.match(home, /<brief\.Part cards=\{brief\.cards\} foot=\{brief\.foot\} \/>/u);
});

test('neither read comes with the screen: each is fetched when asked for, parts and all', () => {
  for (const name of ['briefing', 'Briefing', 'matched', 'Matched']) {
    assert.doesNotMatch(home, new RegExp(`^\\s*import (?!type\\b)[^;]*from '[^']*/${name}(\\.svelte|\\.ts)';$`, 'mu'), `${name} is imported with the screen`);
  }
  assert.match(home, /import\('\.\/briefing\.ts'\)/u);
  assert.match(home, /import\('\.\/Briefing\.svelte'\)/u);
  assert.match(home, /import\('\.\/matched\.ts'\)/u);
  assert.match(home, /import\('\.\/Matched\.svelte'\)/u);
});

test('the page read waits on neither', () => {
  const body = /async function readBody\([\s\S]*?\n {2}\}\n/u.exec(home);
  assert.ok(body, 'readBody is gone');
  assert.doesNotMatch(body[0], /riefing|atched/u, 'the page read reads the briefing or the matches itself');
  const reread = /async function reread\(\)[\s\S]*?\n {2}\}\n/u.exec(home);
  assert.ok(reread, 'reread is gone');
  assert.doesNotMatch(reread[0], /riefing|atched/u);
  assert.doesNotMatch(home, /await\s+around\b|await\s+brief\b|await\s+matched\b/u);
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
