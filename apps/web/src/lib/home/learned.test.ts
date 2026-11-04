/**
 * What your answers taught, on Home: the record's `learned` as three lines in its own words and a count of the rest,
 * nothing at all at nought or on a host that does not answer the read, and the tile reached by a dynamic import only.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { LEARNED_HEADING, LEARNED_SHOWN, learnedOf, learnedTile, loadLearned, readLearned } from './learned.ts';

const ULID = '01J9Z3K4M5N6P7Q8R9S0T1V2W3';
const SARA = { kind: 'same', line: 'Sara in the Kiln notes is Sara Haddad.', at: '2026-10-12T09:00:00.000Z' };
const FUND = { kind: 'place', line: 'Bills from the print shop go under Kiln rebuild.', at: '2026-10-11T09:00:00.000Z' };
const OMAR = { kind: 'same', line: 'Omar at the gallery is Omar Nasr.', at: 1_760_000_000_000 };
const LATE = { kind: 'place', line: 'The studio rent is paid on the first.', at: null };
const answer = (rows: unknown[], more: unknown = 0) => ({ ok: true as const, value: { rows, more } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('THREE LINES IN THE RECORD\'S WORDS, then "and N more" counting the lines past three and what it held back', () => {
  const tile = learnedTile(learnedOf(answer([SARA, FUND, OMAR, LATE], 5)));
  assert.equal(LEARNED_SHOWN, 3);
  assert.deepEqual(tile, { heading: 'What your answers taught', lines: [SARA.line, FUND.line, OMAR.line], more: 'and 6 more' });
  assert.equal(tile?.heading, LEARNED_HEADING);
  /* THREE OR FEWER, AND NONE HELD BACK: no count. */
  assert.equal(learnedTile(learnedOf(answer([SARA, FUND, OMAR])))?.more, '');
  assert.deepEqual(learnedTile(learnedOf(answer([SARA])))?.lines, [SARA.line]);
  /* ONLY WHAT THE RECORD HELD BACK: still counted. */
  assert.equal(learnedTile(learnedOf(answer([SARA], 2)))?.more, 'and 2 more');
});

test('NOUGHT DRAWS NOTHING: no teachings is no tile, and so is none', async () => {
  assert.deepEqual(learnedOf(answer([])), { rows: [], more: 0 });
  assert.equal(learnedTile(learnedOf(answer([]))), null);
  assert.equal(learnedTile(learnedOf(answer([], 4))), null);
  assert.equal(learnedTile(null), null);
  assert.equal(await readLearned(async () => answer([])), null);
});

test('A REFUSAL ANSWERS NULL, and so does a method the host does not know, a call that threw and an answer of another shape', async () => {
  assert.equal(await readLearned(async () => ({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called learned.' } })), null);
  assert.equal(await readLearned(async () => ({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No.' } })), null);
  assert.equal(await readLearned(async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), null);
  assert.equal(await readLearned(async () => Promise.reject(new Error('offline'))), null);
  assert.equal(await readLearned(async () => ({ ok: true, value: { rows: 'many' } })), null);
  assert.equal(await readLearned(async () => ({ ok: true, value: null })), null);
  /* IT ASKS FOR THE RECORD'S OWN READ BY ITS NAME, and takes nothing. */
  const asked: unknown[] = [];
  const got = await readLearned(async (name, args) => {
    asked.push([name, args]);
    return answer([SARA]);
  });
  assert.deepEqual(asked, [['learned', {}]]);
  assert.equal(got?.rows.length, 1);
});

test('A LINE THE SCREEN CANNOT SAY IS DROPPED: no line, a line that is an id; an em dash is said plainly; a bad count is none', () => {
  const found = learnedOf(answer([null, 'Sara', { kind: 'same' }, { ...SARA, line: ULID }, { ...FUND, line: '  ' }, { ...OMAR, line: 'Omar — the gallery' }], 'lots'));
  assert.deepEqual(found?.rows.map((r) => r.line), ['Omar, the gallery']);
  assert.equal(found?.more, 0);
  /* WHEN IT WAS LEARNED IS KEPT AS AN INSTANT, and is not drawn. */
  assert.equal(found?.rows[0]?.at, new Date(OMAR.at).toISOString());
  assert.equal(learnedOf(answer([LATE]))?.rows[0]?.at, null);
  for (const line of learnedTile(found)?.lines ?? []) assert.ok(!line.includes('—'));
});

test('THROUGH THE CLIENT: a host without the read draws nothing, and a host with it is read', async () => {
  assert.equal(await loadLearned('http://record.test', async () => json(404, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No.' } })), null);
  assert.equal(await loadLearned('http://record.test', async () => Promise.reject(new Error('offline'))), null);
  assert.equal(await loadLearned('http://record.test', async () => new Response('<html>', { status: 200 })), null);
  /* THE CLIENT ASKS ONLY WHAT ITS TABLE NAMES: before the route is in it the read never leaves the screen. */
  let sent = '';
  const found = await loadLearned('http://record.test', async (url) => {
    sent = String(url);
    return json(200, answer([SARA]));
  });
  if (sent !== '') {
    assert.equal(new URL(sent).pathname, '/api/learned');
    assert.equal(found?.rows[0]?.line, SARA.line);
  } else assert.equal(found, null);
});

const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const home = bare(readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8'));
const health = bare(readFileSync(new URL('../../routes/settings/[area]/areas/Health.svelte', import.meta.url), 'utf8'));

test('SETTINGS › HEALTH REACHES THE PART BY A DYNAMIC IMPORT ONLY, with the quick parts ahead of the long walk, and Today not at all', () => {
  for (const name of ['learned', 'Learned']) {
    assert.doesNotMatch(health, new RegExp(`^\\s*import (?!type\\b)[^;]*from '[^']*/${name}(\\.svelte|\\.ts)';$`, 'mu'), `${name} is imported with Settings`);
    assert.doesNotMatch(home, new RegExp(`/${name}(\\.svelte|\\.ts)'`, 'u'), `Today reaches ${name}`);
  }
  assert.match(health, /import\('\$lib\/home\/learned\.ts'\)/u);
  assert.match(health, /import\('\$lib\/home\/Learned\.svelte'\)/u);
  assert.match(health, /const found = await m\.loadLearned\(base, io\);\s*if \(here\) learned = found && found\.rows\.length > 0 \? \{ found, Part: part\.default \} : null;/u);
  assert.equal(health.split('<learned.Part').length - 1, 1, 'the part is drawn once');
  assert.ok(health.indexOf('<learned.Part') < health.indexOf('<faults.Part'), 'it stands with the quick parts, and the long walk lands last');
});

test('THE TILE IS FLAT, HAS NO BORDER OR SHADOW, AND ITS WORDS ARE 15 OR MORE', () => {
  const part = readFileSync(new URL('./Learned.svelte', import.meta.url), 'utf8');
  const style = /<style>([\s\S]*)<\/style>/u.exec(part)![1]!;
  assert.match(style, /\.learned \{[^}]*border-radius: var\(--r-tile, 16px\);/u);
  assert.doesNotMatch(style, /box-shadow|gradient|backdrop-filter/u);
  assert.doesNotMatch(style.replace(/@media \(forced-colors: active\)[\s\S]*$/u, ''), /\bborder:/u);
  for (const size of style.matchAll(/font-size: ([^;]+);/gu)) assert.match(size[1]!, /^var\(--fs-body(, 15px)?\)$/u);
  assert.doesNotMatch(bare(part), /—/u);
});
