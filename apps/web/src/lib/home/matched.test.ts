/**
 * Matched for you: the record's own folds as lines a person can read, one sentence for the board, and the batch an
 * Undo would take, held and not yet pressed.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { MATCHED_SHOWN, matchedLine, matchedRows, matchedShown, readMatched, undoOf } from './matched.ts';

const B1 = '01JA7ZK3Q4M8N2P5R6S7T8V9W0';
const B2 = '01JA7ZK3Q4M8N2P5R6S7T8V9W1';
const fold = (from: unknown, name: unknown, batch: unknown = B1, at: unknown = '2026-10-13T09:30:00.000Z', evidence: unknown = 'The same name and the same handle, adalovelace.') => ({
  from,
  into: { name, seq: 12 },
  evidence,
  at,
  batch,
});
const answer = (matches: unknown) => ({ ok: true as const, value: { matches } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('A FOLD IS ONE SENTENCE IN NAMES, ITS EVIDENCE, WHEN, AND THE BATCH ITS UNDO TAKES', () => {
  const rows = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance', 'T. Vance'], 'Teodor Vance', B2, '2026-10-12T18:00:00.000Z', 'Both wrote from the same handle.')]));
  assert.deepEqual(rows, [
    { key: `${B1}:0`, line: 'A. Lovelace was matched to Ada Lovelace.', evidence: 'The same name and the same handle, adalovelace.', when: '2026-10-13T09:30:00.000Z', batch: B1 },
    { key: `${B2}:1`, line: 'Teo Vance and T. Vance were matched to Teodor Vance.', evidence: 'Both wrote from the same handle.', when: '2026-10-12T18:00:00.000Z', batch: B2 },
  ]);
});

test('TWO WHO GO BY ONE NAME ARE SAID AS THAT, never "Ada is now Ada"', () => {
  const [two, three, mixed] = matchedRows(answer([fold(['Ada Lovelace'], 'Ada Lovelace'), fold(['ada lovelace', 'Ada Lovelace '], 'Ada Lovelace'), fold(['Ada Lovelace', 'A. Lovelace'], 'Ada Lovelace')]));
  assert.equal(two!.line, 'Two called Ada Lovelace are now one.');
  assert.equal(three!.line, 'Three called Ada Lovelace are now one.');
  assert.equal(mixed!.line, 'Ada Lovelace and A. Lovelace were matched to Ada Lovelace.');
});

test('MANY FOLDED AT ONCE ARE THREE NAMES AND A COUNT, so the sentence stays one line', () => {
  const [row] = matchedRows(answer([fold(['Ann One', 'Ann Two', 'Ann Three', 'Ann Four', 'Ann Five'], 'Ann Whole')]));
  assert.equal(row!.line, 'Ann One, Ann Two, Ann Three and 2 others were matched to Ann Whole.');
  const [four] = matchedRows(answer([fold(['Ann One', 'Ann Two', 'Ann Three', 'Ann Four'], 'Ann Whole')]));
  assert.equal(four!.line, 'Ann One, Ann Two, Ann Three and 1 other were matched to Ann Whole.');
});

test('NO ID IS EVER IN WHAT A PERSON READS: the batch is a handle beside the words, never in them', () => {
  const rows = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', B2)]));
  for (const r of rows) {
    for (const said of [r.line, r.evidence]) {
      assert.doesNotMatch(said, /[0-9A-HJKMNP-TV-Z]{26}/u);
      assert.doesNotMatch(said, /#\d|\bseq\b/u);
      assert.doesNotMatch(said, /—/u);
    }
  }
  assert.equal(matchedLine(rows), '2 people matched for you');
});

test('A FOLD WITH NOBODY TO NAME IS DROPPED, and words are trimmed', () => {
  const rows = matchedRows(
    answer([
      fold([], 'Ada Lovelace'),
      fold(['A. Lovelace'], ''),
      fold(['A. Lovelace'], 7),
      fold('A. Lovelace', 'Ada Lovelace'),
      null,
      'x',
      fold([' A. Lovelace ', 4, ''], '  Ada Lovelace ', B2, 'not a time', 9),
    ]),
  );
  assert.deepEqual(rows, [{ key: `${B2}:0`, line: 'A. Lovelace was matched to Ada Lovelace.', evidence: '', when: null, batch: B2 }]);
});

test('A RECORD WITHOUT THE METHOD ANSWERS NOTHING, and so does one that keeps nobody', () => {
  for (const code of ['NOT_IN_THIS_BUILD', 'ROUTE_UNKNOWN', 'FORBIDDEN', 'UNREACHABLE']) assert.deepEqual(matchedRows({ ok: false, refusal: { code, fix: 'No.' } }), []);
  for (const odd of [null, undefined, 'x', {}, { ok: true }, { ok: true, value: null }, { ok: true, value: { matches: 'none' } }, answer([])]) assert.deepEqual(matchedRows(odd), []);
});

test('FIVE ARE SHOWN AND THE REST ARE COUNTED, while the line counts them all', () => {
  const rows = matchedRows(answer(Array.from({ length: 8 }, (_, i) => fold([`Old ${i}`], `Kept ${i}`, `${B1.slice(0, 25)}${i}`))));
  assert.equal(MATCHED_SHOWN, 5);
  assert.equal(rows.length, 8);
  const { shown, more } = matchedShown(rows);
  assert.deepEqual(shown.map((r) => r.line), [0, 1, 2, 3, 4].map((i) => `Old ${i} was matched to Kept ${i}.`));
  assert.equal(more, 3);
  assert.deepEqual(matchedShown(rows.slice(0, 5)), { shown: rows.slice(0, 5), more: 0 });
  assert.equal(matchedLine(rows), '8 people matched for you');
  assert.equal(new Set(rows.map((r) => r.key)).size, 8);
});

test('THE LINE: one person, N people, and nothing for none', () => {
  const rows = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', B2), fold(['M. Okafor'], 'Mara Okafor', B2)]));
  assert.equal(matchedLine([]), null);
  assert.equal(matchedLine(rows.slice(0, 1)), 'One person matched for you');
  assert.equal(matchedLine(rows), '3 people matched for you');
});

test('THIS WEEK IS SAID ONLY WHEN EVERY ONE OF THEM WAS THIS WEEK', () => {
  const now = Date.parse('2026-10-14T12:00:00.000Z');
  const week = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', B2, '2026-10-08T12:00:00.000Z')]));
  assert.equal(matchedLine(week, now), '2 people matched for you this week');
  const older = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', B2, '2026-09-01T12:00:00.000Z')]));
  assert.equal(matchedLine(older, now), '2 people matched for you');
  const undated = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace', B1, null)]));
  assert.equal(matchedLine(undated, now), 'One person matched for you');
});

test('UNDO NAMES THE BATCH THE RECORD TAKES, and nothing for a fold that came with none', () => {
  const [row, bare] = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', '')]));
  assert.deepEqual(undoOf(row!), { batch: B1 });
  assert.equal(bare!.batch, '');
  assert.equal(undoOf(bare!), null);
});

test('THE READ NEVER FAILS THE SCREEN: a host without the call, a refusal and a dead line all answer nobody', async () => {
  const none = { ok: true, value: [] };
  const absent = async () => json(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog has no such read yet.', at: 'matched' } });
  assert.deepEqual(await readMatched('http://record.test', absent), none);
  assert.deepEqual(await readMatched('http://record.test', async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), none);
  assert.deepEqual(await readMatched('http://record.test', async () => Promise.reject(new Error('offline'))), none);
  const got = await readMatched('http://record.test', async () => json(200, answer([fold(['A. Lovelace'], 'Ada Lovelace')])));
  assert.deepEqual(got.value.map((r) => r.line), ['A. Lovelace was matched to Ada Lovelace.']);
});

test('NO UNDO IS DRAWN YET: the record cannot give two back from a match, so the tile only lists', () => {
  const part = readFileSync(new URL('./Matched.svelte', import.meta.url), 'utf8');
  const markup = part.slice(part.indexOf('</script>'), part.indexOf('<style>'));
  assert.doesNotMatch(markup, /undo/iu);
  assert.doesNotMatch(part, /undo-write|undoChange|undoApply/u);
  assert.match(part, /data-matched/u);
});
