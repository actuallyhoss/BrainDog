/**
 * Where the record met one thing, as the page's "Where it was seen" says it (`seen.ts`): the lines and their days, the
 * cut at eight with "and N more", and every answer that draws nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEEN_SHOWN, readSeen, seenDay, seenLines, seenOf, type Call } from './seen.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const ROW = { register: 'contacts', seq: 4 };

const answer = (seen: { at: string; where: string }[], also: string[] = []) => ({
  ok: true,
  value: { is: { kind: 'person', name: 'Sara Idris', also, links: [], seen, register: 'contacts', seq: 4 }, candidates: [] },
});

/** A call that answers `out` and keeps what it was asked. */
const asked = (out: unknown) => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const call: Call = async (name, args) => {
    calls.push({ name, args });
    return out;
  };
  return { call, calls };
};

test('ASKED BY THE ROW, and each place is one line: the day, then the record\'s own words', async () => {
  const { call, calls } = asked(
    answer([
      { at: '2026-09-02T08:00:00.000Z', where: 'Runs: Weekly sync' },
      { at: '2026-10-03T10:00:00.000Z', where: 'Notes: Spoke to Sara at Northbank about the renewal' },
    ]),
  );
  const found = await readSeen(call, ROW);
  assert.deepEqual(calls, [{ name: 'about', args: { row: { register: 'contacts', seq: 4 } } }]);
  assert.equal(found?.name, 'Sara Idris');
  const out = seenLines(found, NOW);
  /* NEWEST FIRST, whatever order the record answered in. */
  assert.deepEqual(out.lines, ['3 Oct · Notes: Spoke to Sara at Northbank about the renewal', '2 Sep · Runs: Weekly sync']);
  assert.equal(out.also, null);
  assert.equal(out.more, null);
});

test('THE DAY IN THE READER\'S WORDS, with its year only when it is not this year', () => {
  assert.equal(seenDay('2026-10-03', NOW), '3 Oct');
  assert.equal(seenDay('2025-12-31', NOW), '31 Dec 2025');
  assert.equal(seenDay('2026-01-01 09:00:00', NOW), '1 Jan', 'the record\'s clock as SQLite writes it');
  assert.equal(seenDay('soon', NOW), '');
  const out = seenLines(seenOf(answer([{ at: '2025-03-09T00:00:00Z', where: 'Notes: Kickoff' }])), NOW);
  assert.deepEqual(out.lines, ['9 Mar 2025 · Notes: Kickoff']);
});

test('ANOTHER NAME IS SAID ONCE, under the places', () => {
  const one = seenLines(seenOf(answer([{ at: '2026-10-03T00:00:00Z', where: 'Notes: Kickoff' }], ['Sara I.'])), NOW);
  assert.equal(one.also, 'Also known as Sara I.');
  const two = seenLines(seenOf(answer([{ at: '2026-10-03T00:00:00Z', where: 'Notes: Kickoff' }], ['Sara I.', 'S. Idris', 'Sara Idris'])), NOW);
  assert.equal(two.also, 'Also known as Sara I. and S. Idris.', 'its own name is not another name');
});

test('EIGHT PLACES, THEN "and N more"', () => {
  const seen = Array.from({ length: 12 }, (_, n) => ({ at: `2026-08-${String(n + 10).padStart(2, '0')}T00:00:00Z`, where: `Notes: Call ${n + 1}` }));
  const found = seenOf(answer(seen));
  assert.equal(found?.places.length, SEEN_SHOWN);
  assert.equal(found?.more, 4);
  const out = seenLines(found, NOW);
  assert.equal(out.lines.length, 8);
  assert.equal(out.lines[0], '21 Aug · Notes: Call 12');
  assert.equal(out.more, 'and 4 more');
  /* EXACTLY EIGHT has no rest to count. */
  assert.equal(seenLines(seenOf(answer(seen.slice(0, 8))), NOW).more, null);
});

test('SEEN NOWHERE DRAWS NOTHING', () => {
  assert.equal(seenOf(answer([])), null);
  assert.deepEqual(seenLines(null, NOW), { lines: [], also: null, more: null });
  assert.equal(seenOf({ ok: true, value: { is: null, candidates: [] } }), null, 'nothing the reader may read answers');
});

test('A REFUSAL, A HOST WITH NO `about`, AND A CALL THAT THREW ALL ANSWER NULL', async () => {
  assert.equal(await readSeen(asked({ ok: false, refusal: { code: 'FORBIDDEN', message: 'No.' } }).call, ROW), null);
  assert.equal(await readSeen(asked({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', message: 'No such call.' } }).call, ROW), null);
  assert.equal(await readSeen(async () => { throw new Error('offline'); }, ROW), null);
  assert.equal(await readSeen(asked(undefined).call, ROW), null);
});

test('TWO CANDIDATES AND NO ONE THING DRAW NOTHING: the panel never picks', async () => {
  const two = {
    ok: true,
    value: {
      is: null,
      candidates: [
        { kind: 'person', name: 'Sara Idris', also: [], seen: ['Notes: Kickoff'], register: 'contacts', seq: 4 },
        { kind: 'person', name: 'Sara Ahmed', also: [], seen: ['Notes: Lunch'], register: 'contacts', seq: 9 },
      ],
    },
  };
  assert.equal(await readSeen(asked(two).call, ROW), null);
});

test('NO ID, NO ADDRESS, NO EM DASH in a line a person reads', () => {
  const found = seenOf(
    answer([
      { at: '2026-10-05T00:00:00Z', where: 'Notes: 01J9ZQ4M5N6P7Q8R9S0T1V2W3X' },
      { at: '2026-10-04T00:00:00Z', where: 'Notes: See https://example.com/brief' },
      { at: '2026-10-03T00:00:00Z', where: 'Notes — Kickoff' },
      { at: 'never', where: 'Notes: Undated' },
    ]),
  );
  const out = seenLines(found, NOW);
  assert.deepEqual(out.lines, ['3 Oct · Notes, Kickoff']);
  for (const line of out.lines) assert.doesNotMatch(line, /—/u);
});
