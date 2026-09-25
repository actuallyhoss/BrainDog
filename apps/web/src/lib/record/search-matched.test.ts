/**
 * The count beside the hits, which is what stops `/search` printing the record's ceiling as a total.
 *
 * `loop/research-at-scale.md`, *Wrong, not slow* 3, driven at the owner's size: searching `revenue`
 * drew **100** beside the heading and **"All 100 in Datapoints"** beside the group while **140** rows
 * matched, counted against the record file itself. `the` matched 304 and said 100; `bake` matched 577
 * and said 100. The clamp in `fts.ts` is not the fault. The fault is that the record answered a bare
 * array, and a full page of a hundred is character-for-character the answer to a query with exactly a
 * hundred matches, so `groupsOf` had nothing to count but what it had been handed.
 *
 * SO THE TEST THAT MATTERS IS THE FIRST ONE: a hundred hits arriving beside a count of a hundred and
 * forty must draw a hundred and forty. The second is the other half of the same promise, because a
 * record that does not send a count must still answer exactly what it answered before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { REGISTERS } from './api.ts';
import { answered, groupsOf, searcher, type Fetch } from './search-live.ts';

const BASE = 'http://record.test';

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** A hundred hits in one list and six in another, the shape `/search?q=revenue` met. */
const HITS = [
  ...Array.from({ length: 94 }, (_, i) => ({ register: 'obligations', seq: i + 1, title: `Monthly revenue, project ${i + 1}`, rank: -100 + i })),
  ...Array.from({ length: 6 }, (_, i) => ({ register: 'people', seq: i + 1, title: `Revenue owner ${i + 1}`, rank: -6 + i })),
];

/** Answers `/api/search` with `value`, and everything else with nothing to find. */
function host(value: unknown): Fetch {
  return (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    if (at.pathname === '/api/search') return json({ ok: true, value });
    return json({ ok: true, value: at.pathname === '/api/boot' ? {} : [] });
  }) as Fetch;
}

test("THE COUNT ON SCREEN IS THE RECORD'S COUNT, and not the page the record was able to send", async () => {
  const out = await searcher(BASE, host({ hits: HITS, matched: { obligations: 140, people: 6 } })).find('revenue');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;

  /* WHAT THE GROUP HEADING AND ITS DOOR PRINT. `copy.allIn(140, 'Obligations')` reads "All 140 in
     Obligations", which is a true sentence about a door that opens on all 140; at 94 it was a false
     one about a list the reader had no way to know was cut. */
  assert.deepEqual(
    out.value.groups.map((g) => [g.kind, g.total]),
    [
      [REGISTERS.obligations!.name, 140],
      [REGISTERS.people!.name, 6],
    ],
  );
  /* AND THE NUMBER OVER THE WHOLE SCREEN, which is the sum of the groups and used to be the length
     of the page. `PageHead count={found.total}` is where the measured 100 was read. */
  assert.equal(out.value.total, 146);
  /* The page itself is unchanged: a hundred hits is what the record's ceiling allows, and saying so
     is the job of the count rather than of a shorter list. */
  assert.equal(out.value.hits.length, 100);
  assert.equal(out.value.groups[0]!.hits.length, 94);
});

test('a record that sends no count is answered exactly as it was', async () => {
  /* Every record built before `fts.ts`'s `searchMatched` reaches the route sends the bare array, and
     a self-host serves its own built app, so the two drift apart between updates. Inventing a number
     for that record would be the defect again with a different arithmetic. */
  const out = await searcher(BASE, host(HITS)).find('revenue');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(
    out.value.groups.map((g) => [g.kind, g.total]),
    [
      [REGISTERS.obligations!.name, 94],
      [REGISTERS.people!.name, 6],
    ],
  );
  assert.equal(out.value.total, 100, 'the count of what arrived, which is all a bare array can say');
});

test('a count that is not a finite number is not a count', () => {
  /* A tally that arrives as a string, a null or a NaN leaves its group counting what arrived, which
     is the same path as a record that said nothing. Coercing it would put `NaN` on a screen. */
  assert.deepEqual(answered([{ register: 'obligations', seq: 1, title: 'x' }]).matched, null, 'an array carries no count');
  assert.deepEqual(answered({ hits: [], matched: { a: 3, b: '4', c: null, d: Number.NaN } }).matched, { a: 3 });
  assert.deepEqual(answered({ hits: [] }).matched, {}, 'a record that sent hits and no tallies claims nothing');
  assert.deepEqual(answered('not an answer at all'), { hits: [], matched: null });
});

test('a count for a list that matched nothing is not a group, so the page stays the answer', () => {
  /* `matched` is read per group rather than iterated: a register the ceiling cut out of the page
     entirely has no hits to draw, and a heading with a count and no rows under it is a worse screen
     than one that says less. The door on each group it DID draw opens on that list's whole count. */
  const out = groupsOf('revenue', [{ register: 'obligations', seq: 1, title: 'Monthly revenue' }], undefined, { obligations: 140, datapoints: 1224 });
  assert.deepEqual(
    out.groups.map((g) => [g.kind, g.total, g.href]),
    [[REGISTERS.obligations!.name, 140, '/r/obligations?q=revenue']],
  );
  assert.equal(out.total, 140);
});
