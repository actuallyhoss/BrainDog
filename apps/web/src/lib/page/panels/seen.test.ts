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

test('SEEN NOWHERE SAYS ONE SENTENCE, and draws no lines', () => {
  const found = seenOf(answer([], ['Sara I.']));
  assert.deepEqual(found, { name: 'Sara Idris', also: ['Sara I.'], places: [], more: 0 });
  assert.deepEqual(seenLines(found, NOW), { lines: [], also: null, more: null, none: 'Nothing on the record mentions Sara Idris yet.' });
  /* A PLACE THAT IS LEFT OUT LEAVES NOTHING, so it is the same sentence. */
  assert.equal(seenLines(seenOf(answer([{ at: 'never', where: 'Notes: Undated' }])), NOW).none, 'Nothing on the record mentions Sara Idris yet.');
  assert.deepEqual(seenLines(null, NOW), { lines: [], also: null, more: null, none: null });
  assert.equal(seenOf({ ok: true, value: { is: null, candidates: [] } }), null, 'nothing the reader may read answers');
  /* A THING WITH NO NAME is not said by one. */
  assert.equal(seenOf({ ok: true, value: { is: { kind: 'person', name: '', also: [], seen: [] }, candidates: [] } }), null);
  /* PLACES, AND NO SENTENCE. */
  assert.equal(seenLines(seenOf(answer([{ at: '2026-10-03T00:00:00Z', where: 'Notes: Kickoff' }])), NOW).none, null);
});

test('WHAT WAITS ON HIM IS A LINE WITH ITS DAY, as it came', () => {
  const out = seenLines(
    seenOf(
      answer([
        { at: '2026-10-01T00:00:00Z', where: 'Notes: Kickoff' },
        { at: '2026-10-12T08:00:00.000Z', where: "Waiting on you: Renew Quillmark's domain for another year?" },
      ]),
    ),
    NOW,
  );
  assert.deepEqual(out.lines, ["12 Oct · Waiting on you: Renew Quillmark's domain for another year?", '1 Oct · Notes: Kickoff']);
  assert.equal(out.none, null);
});

test('A REFUSAL AND A CANDIDATES ANSWER STILL SAY NOTHING, not the sentence', async () => {
  const refused = await readSeen(asked({ ok: false, refusal: { code: 'FORBIDDEN', message: 'No.' } }).call, ROW);
  assert.deepEqual(seenLines(refused, NOW), { lines: [], also: null, more: null, none: null });
  const two = { ok: true, value: { is: null, candidates: [{ kind: 'person', name: 'Sara Idris', also: [], seen: [], register: 'contacts', seq: 4 }] } };
  assert.equal(seenLines(await readSeen(asked(two).call, ROW), NOW).none, null);
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

test('THE CALL IS EXACTLY THE SHAPE THE ROUTE TAKES: `about`, one `row` of a list and a number, and nothing else', async () => {
  const { call, calls } = asked(answer([]));
  /* A row handed with more than it needs still asks by its list and its number alone. */
  await readSeen(call, { register: 'projects', seq: 7, name: 'Larkspur' } as { register: string; seq: number });
  assert.deepEqual(calls, [{ name: 'about', args: { row: { register: 'projects', seq: 7 } } }]);
  /* Sent as a GET, the row is one JSON query value (`row: 'json'` on the route), and it reads back the same. */
  assert.deepEqual(Object.keys(calls[0]!.args), ['row']);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0]!.args.row)), { register: 'projects', seq: 7 });
});

test('THE ROUTE\'S REFUSAL AT `row` READS NULL, so the panel draws nothing rather than a wrong body', async () => {
  const at = { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'row names a list by its id and one of its rows by its number.', at: 'row' } };
  assert.equal(await readSeen(asked(at).call, { register: 'projects', seq: 7 }), null);
  assert.deepEqual(seenLines(null, NOW), { lines: [], also: null, more: null, none: null });
});
