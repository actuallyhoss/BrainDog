/**
 * What every agent is told, on Agents: the record's `learnings` as one line a lesson with its because, in the record's
 * order, no id drawn, a foot only for counts above nought, and nothing at all at nought or on a host without the read.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { LESSONS_ASKED, LESSONS_HEADING, lessonsOf, lessonsTile, loadLessons } from './told.ts';

const ULID = '01J9Z3K4M5N6P7Q8R9S0T1V2W3';
const row = (spoken: string, lesson: string, because: string | null, kind = 'method') => ({
  spoken,
  lesson,
  because,
  kind,
  topic: null,
  where: 'everywhere',
  confirmed_on: null,
  made: '2026-10-12',
});
const KILN = row('LN14', 'Run the kiln tests with the old Node.', 'The new one breaks the database tests.');
const GLAZE = row('LN9', 'Glaze names are said in full on the shelf page.', null);
const STUDIO = row('LN3', 'The studio closes on Fridays.', 'Orders sent then wait until Monday.', 'fact');
const answer = (rows: unknown[], more: { truncated?: unknown; faded?: unknown; replaced?: unknown } = {}) => ({
  ok: true as const,
  value: { rows, truncated: false, faded: 0, replaced: 0, ...more },
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test("THE RECORD'S ORDER IS KEPT, one line a lesson with its because, and no id is drawn", () => {
  const tile = lessonsTile(lessonsOf(answer([STUDIO, KILN, GLAZE])));
  assert.deepEqual(tile, {
    heading: 'What every agent is told',
    lines: [
      { lesson: STUDIO.lesson, because: STUDIO.because },
      { lesson: KILN.lesson, because: KILN.because },
      { lesson: GLAZE.lesson, because: null },
    ],
    foot: '',
  });
  assert.equal(tile?.heading, LESSONS_HEADING);
  const said = JSON.stringify(tile);
  for (const spoken of ['LN14', 'LN9', 'LN3']) assert.ok(!said.includes(spoken), `${spoken} is drawn`);
});

test('THE FOOT NAMES ONLY THE COUNTS ABOVE NOUGHT, and "and more" when the record holds more', () => {
  const foot = (more: Parameters<typeof answer>[1]) => lessonsTile(lessonsOf(answer([KILN], more)))?.foot;
  assert.equal(foot({ replaced: 2, faded: 3, truncated: true }), '2 replaced, 3 faded, and more');
  assert.equal(foot({ replaced: 2 }), '2 replaced');
  assert.equal(foot({ faded: 1 }), '1 faded');
  assert.equal(foot({ truncated: true }), 'and more');
  assert.equal(foot({}), '');
  /* A BAD COUNT IS NOUGHT, and only `true` is more. */
  assert.equal(foot({ replaced: -1, faded: 1.5, truncated: 'yes' }), '');
  /* MORE THAN SIX SENT IS SIX DRAWN, and the rest is "and more". */
  const many = lessonsTile(lessonsOf(answer(Array.from({ length: LESSONS_ASKED + 2 }, (_, i) => row(`LN${String(i)}`, `Lesson ${String(i)}.`, null)))));
  assert.equal(many?.lines.length, LESSONS_ASKED);
  assert.equal(many?.foot, 'and more');
});

test('NOUGHT DRAWS NOTHING, even with counts, and a lesson the screen cannot say is dropped', () => {
  assert.deepEqual(lessonsOf(answer([])), { rows: [], truncated: false, faded: 0, replaced: 0 });
  assert.equal(lessonsTile(lessonsOf(answer([]))), null);
  assert.equal(lessonsTile(lessonsOf(answer([], { replaced: 2, faded: 3 }))), null);
  assert.equal(lessonsTile(null), null);
  const found = lessonsOf(answer([null, 'kiln', { spoken: 'LN1' }, { ...KILN, lesson: ULID }, { ...GLAZE, lesson: '  ' }, { ...STUDIO, lesson: 'Fridays — closed', because: ULID }]));
  assert.deepEqual(found?.rows, [{ lesson: 'Fridays, closed', because: null }]);
});

test('A REFUSAL IS NULL, and so is an answer of another shape', () => {
  assert.equal(lessonsOf({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } }), null);
  assert.equal(lessonsOf({ ok: true, value: { rows: 'many' } }), null);
  assert.equal(lessonsOf({ ok: true, value: null }), null);
  assert.equal(lessonsOf(null), null);
});

test('THROUGH THE CLIENT: it asks for six, never throws, and a host without the read draws nothing', async () => {
  assert.equal(await loadLessons('http://record.test', async () => json(404, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No.' } })), null);
  assert.equal(await loadLessons('http://record.test', async () => Promise.reject(new Error('offline'))), null);
  assert.equal(await loadLessons('http://record.test', async () => new Response('<html>', { status: 200 })), null);
  let sent: { url: string; body: unknown } | null = null;
  const found = await loadLessons('http://record.test', async (url, init) => {
    sent = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null };
    return json(200, answer([KILN]));
  });
  assert.ok(sent, 'the read left the screen');
  const got = sent as { url: string; body: unknown };
  assert.equal(new URL(got.url).pathname, '/api/learnings');
  /* A READ GOES AS A GET, its count in the query; were it ever sent as a body, the body says it. */
  const asked = new URL(got.url).searchParams.get('limit') ?? (got.body as { limit?: unknown } | null)?.limit;
  assert.equal(String(asked), String(LESSONS_ASKED));
  assert.deepEqual(found?.rows, [{ lesson: KILN.lesson, because: KILN.because }]);
});

const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

test('THE TILE IS THE ONE TILE WITH ITS ICON, HAS NO BORDER OR SHADOW, NOTHING TO PRESS, AND ITS WORDS ARE 15 OR MORE', () => {
  const part = readFileSync(new URL('./Told.svelte', import.meta.url), 'utf8');
  const style = /<style>([\s\S]*)<\/style>/u.exec(part)![1]!;
  /* THROUGH `Tile` (today F19): the heading in the tile's own head, with its icon. */
  assert.match(part, /<Tile icon="skill" title=\{tile\.heading\}/u);
  assert.doesNotMatch(style, /box-shadow|gradient|backdrop-filter/u);
  assert.doesNotMatch(style.replace(/@media \(forced-colors: active\)[\s\S]*$/u, ''), /\bborder:/u);
  for (const size of style.matchAll(/font-size: ([^;]+);/gu)) assert.match(size[1]!, /^var\(--fs-body(, 15px)?\)$/u);
  assert.doesNotMatch(bare(part), /—|<button|<a\b|onclick/u);
  assert.doesNotMatch(bare(part), /\bspoken\b/u, 'the spoken id is never drawn');
});
