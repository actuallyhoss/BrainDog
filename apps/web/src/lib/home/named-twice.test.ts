/**
 * May be one, on Home: the record's `namedTwice` as at most three pairs by name with the record's reason, a count of
 * the rest, nothing at all at nought or on a host that does not answer the read, and one press that files the question
 * on Decide and carries the record's own sentence when it does not.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { copy } from '../copy.ts';
import { NAMED_ASKED, NAMED_HEADING, NAMED_SHOWN, askSame, askSameAt, loadNamedTwice, namedOf, namedTile, readNamedTwice } from './named-twice.ts';

const ULID = '01J9Z3K4M5N6P7Q8R9S0T1V2W3';
const side = (name: unknown, seq: unknown = 4) => ({ name, register: 'Studios', seq });
const pairWith = (pair: string, a: unknown, b: unknown, more: Record<string, unknown> = {}) => ({
  pair,
  kind: 'org',
  how: 'name',
  a: side(a),
  b: side(b, 9),
  evidence: `Both are called ${String(a)}.`,
  score: 0.7,
  can: true,
  ...more,
});
const MARROW = pairWith('p-marrow', 'Marrow Press', 'Marrow Press Ltd');
const JUNIPER = pairWith('p-juniper', 'Juniper Hall', 'The Juniper Hall');
const LANTERN = pairWith('p-lantern', 'Lantern rebuild', 'Lantern Rebuild', { kind: 'proj' });
const QUILL = pairWith('p-quill', 'Quillfield', 'Quill Field');
const OTTER = pairWith('p-otter', 'Otterbay Co', 'Otterbay');
const answer = (pairs: unknown[]) => ({ ok: true as const, value: { pairs } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('A PAIR IS SAID BY ITS TWO NAMES WITH THE RECORD\'S REASON UNDER THEM, and kind, how and score are never drawn', () => {
  const tile = namedTile(namedOf(answer([MARROW])));
  assert.deepEqual(tile, {
    heading: 'May be one',
    lines: [{ pair: 'p-marrow', text: 'Marrow Press and Marrow Press Ltd', why: 'Both are called Marrow Press.', can: true }],
    more: '',
  });
  assert.equal(tile?.heading, NAMED_HEADING);
});

test('AT MOST THREE LINES, then "and 2 more" for the rest', () => {
  assert.equal(NAMED_SHOWN, 3);
  const tile = namedTile(namedOf(answer([MARROW, JUNIPER, LANTERN, QUILL, OTTER])));
  assert.deepEqual(tile?.lines.map((l) => l.pair), ['p-marrow', 'p-juniper', 'p-lantern']);
  assert.equal(tile?.more, 'and 2 more');
  assert.equal(namedTile(namedOf(answer([MARROW, JUNIPER, LANTERN])))?.more, '');
});

test('A PAIR THE SCREEN CANNOT SAY IS DROPPED: a raw id for a name, no name, no handle; an em dash is said plainly', () => {
  const found = namedOf(
    answer([
      null,
      'Marrow',
      pairWith('p-id', ULID, 'Marrow Press'),
      pairWith('p-blank', 'Juniper Hall', '  '),
      { ...JUNIPER, pair: '' },
      { ...JUNIPER, pair: undefined },
      { ...LANTERN, b: null },
      pairWith('p-dash', 'Quillfield — north', 'Quill Field'),
    ]),
  );
  assert.deepEqual(found?.map((p) => p.pair), ['p-dash']);
  assert.equal(found?.[0]?.a.name, 'Quillfield, north');
  for (const line of namedTile(found)?.lines ?? []) assert.ok(!line.text.includes('—') && !line.why.includes('—'));
});

test('CAN FALSE DRAWS NO PRESS: the line is said with no button', () => {
  const tile = namedTile(namedOf(answer([{ ...MARROW, can: false }, { ...JUNIPER, can: 'yes' }])));
  assert.deepEqual(tile?.lines.map((l) => l.can), [false, false]);
  const part = readFileSync(new URL('./NamedTwice.svelte', import.meta.url), 'utf8');
  assert.match(part, /\{:else if line\.can\}\s*<Button/u, 'the button is drawn only when the record can ask');
});

test('NOUGHT AND A REFUSAL DRAW NOTHING: ROUTE_UNKNOWN, NOT_IN_THIS_BUILD, a refusal, a throw, another shape', async () => {
  assert.equal(namedTile(namedOf(answer([]))), null);
  assert.equal(namedTile(null), null);
  assert.equal(await readNamedTwice(async () => answer([])), null);
  assert.equal(await readNamedTwice(async () => ({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called namedTwice.' } })), null);
  assert.equal(await readNamedTwice(async () => ({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No.' } })), null);
  assert.equal(await readNamedTwice(async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), null);
  assert.equal(await readNamedTwice(async () => Promise.reject(new Error('offline'))), null);
  assert.equal(await readNamedTwice(async () => ({ ok: true, value: { pairs: 'many' } })), null);
  assert.equal(await readNamedTwice(async () => ({ ok: true, value: null })), null);
  /* IT ASKS FOR THE RECORD'S OWN READ BY ITS NAME, with the limit, and takes nothing. */
  const asked: unknown[] = [];
  const got = await readNamedTwice(async (name, args) => {
    asked.push([name, args]);
    return answer([MARROW]);
  });
  assert.deepEqual(asked, [['namedTwice', { limit: NAMED_ASKED }]]);
  assert.equal(NAMED_ASKED, 10);
  assert.equal(got?.lines.length, 1);
});

test('THE PRESS FILES ONE QUESTION AND ANSWERS ITS HANDLE, or carries the record\'s own sentence', async () => {
  const sent: unknown[] = [];
  assert.deepEqual(
    await askSame(async (name, args) => {
      sent.push([name, args]);
      return { ok: true, value: { question: 'q-41' } };
    }, 'p-marrow'),
    { ok: true, question: 'q-41' },
  );
  assert.deepEqual(sent, [['askNamedSame', { pair: 'p-marrow' }]]);
  const fix = 'That pair was already put to you on Decide.';
  assert.deepEqual(await askSame(async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix } }), 'p-marrow'), { ok: false, fix });
  /* NO SENTENCE, ANOTHER SHAPE OR A THROW: the plain one that nothing was saved. */
  assert.deepEqual(await askSame(async () => ({ ok: false, refusal: {} }), 'p'), { ok: false, fix: copy.recordNotReached });
  assert.deepEqual(await askSame(async () => ({ ok: true, value: {} }), 'p'), { ok: false, fix: copy.recordNotReached });
  assert.deepEqual(await askSame(async () => Promise.reject(new Error('offline')), 'p'), { ok: false, fix: copy.recordNotReached });
});

test('THROUGH THE CLIENT: a host without the read draws nothing, and a press on it saves nothing', async () => {
  assert.equal(await loadNamedTwice('http://record.test', async () => json(404, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No.' } })), null);
  assert.equal(await loadNamedTwice('http://record.test', async () => Promise.reject(new Error('offline'))), null);
  assert.equal(await loadNamedTwice('http://record.test', async () => new Response('<html>', { status: 200 })), null);
  /* THE CLIENT ASKS ONLY WHAT ITS TABLE NAMES: before the route is in it the read never leaves the screen. */
  let path = '';
  const found = await loadNamedTwice('http://record.test', async (url) => {
    path = new URL(String(url)).pathname;
    return json(200, answer([MARROW]));
  });
  if (path !== '') assert.equal(found?.lines[0]?.text, 'Marrow Press and Marrow Press Ltd');
  else assert.equal(found, null);
  const out = await askSameAt('http://record.test', 'p-marrow', async () => Promise.reject(new Error('offline')));
  assert.equal(out.ok, false);
});

const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

test('THE TILE IS FLAT, HAS NO BORDER OR SHADOW, ITS WORDS ARE 15 OR MORE, AND ITS PRESS LEADS TO DECIDE', () => {
  const part = readFileSync(new URL('./NamedTwice.svelte', import.meta.url), 'utf8');
  const style = /<style>([\s\S]*)<\/style>/u.exec(part)![1]!;
  assert.match(style, /\.named \{[^}]*border-radius: var\(--r-tile, 16px\);/u);
  assert.doesNotMatch(style, /box-shadow|gradient|backdrop-filter/u);
  assert.doesNotMatch(style.replace(/@media \(forced-colors: active\)[\s\S]*$/u, ''), /\bborder:/u);
  for (const size of style.matchAll(/font-size: ([^;]+);/gu)) assert.match(size[1]!, /^var\(--t-(row|base)(, 15px)?\)$/u);
  assert.doesNotMatch(bare(part), /—/u);
  assert.match(part, /'Ask me on Decide'/u);
  assert.match(part, /'On Decide'/u);
  assert.match(part, /href=\{at\(`\/decide\/\$\{encodeURIComponent\(question\)\}`\)\}/u);
  assert.match(part, /class="n-on tap"/u, 'the link has the 44 hit box');
});

const home = bare(readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8'));

test('HOME REACHES THE TILE BY A DYNAMIC IMPORT ONLY, and draws it once, last, after what the answers taught', () => {
  for (const name of ['named-twice', 'NamedTwice']) {
    assert.doesNotMatch(home, new RegExp(`^\\s*import (?!type\\b)[^;]*from '[^']*/${name}(\\.svelte|\\.ts)';$`, 'mu'), `${name} is imported with the screen`);
  }
  assert.match(home, /import\('\.\/named-twice\.ts'\)/u);
  assert.match(home, /import\('\.\/NamedTwice\.svelte'\)/u);
  assert.match(home, /const found = await m\.loadNamedTwice\(base\);\s*if \(here\) named = found && found\.lines\.length > 0 \? \{ found, Part: part\.default \} : null;/u);
  assert.equal(home.split('<named.Part').length - 1, 1, 'the tile is drawn once');
  assert.ok(home.indexOf('<named.Part') > home.indexOf('<learned.Part'), 'it comes after what the answers taught');
});
