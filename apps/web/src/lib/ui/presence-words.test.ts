import { test } from 'node:test';
import assert from 'node:assert/strict';

import { presenceOf, WORKING_MS as KERNEL_WORKING_MS } from '@braindog/kernel';

import { liveOf } from './face.ts';
import { PRESENCE_WORDS, WORKING_MS, presenceSaid, ringOf, type RunPresence } from './presence-words.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const MIN = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString();

/** A run's row as a page or the Agents settings hold it: its state, and fields with or without a `last_seen`. */
const row = (state: string, heard: number | null, more: Record<string, unknown> = {}) => ({
  state,
  fields: { doing: 'Tidying the Larkspur invoices', state, ...more, ...(heard === null ? {} : { last_seen: iso(NOW - heard * MIN) }) },
});

const SIX: readonly [RunPresence, ReturnType<typeof row>][] = [
  ['working', row('active', 2)],
  ['quiet', row('idle', 3)],
  ['left', row('handoff', 4, { next: 'Send the Larkspur quote' })],
  ['ended', row('done', 5)],
  ['stopped', row('abandoned', 700)],
  ['before', row('done', null, { seen_before: iso(NOW - 90 * 24 * 60 * MIN) })],
];

test('SIX WORDS: each run reads its own, from the row a page holds', () => {
  for (const [word, r] of SIX) assert.equal(presenceSaid(r.state, r.fields, NOW), word, word);
  assert.deepEqual(
    SIX.map(([w]) => PRESENCE_WORDS[w]),
    ['Working now', 'Gone quiet', 'Left a step', 'Ended', 'Stopped', 'From before'],
  );
});

test('AN IMPORTED RUN WITH NO last_seen reads From before, whatever its state says', () => {
  for (const state of ['active', 'idle', 'done', 'abandoned', 'handoff'])
    assert.equal(PRESENCE_WORDS[presenceSaid(state, { state, seen_before: '2026-03-02T09:00:00Z' }, NOW)], 'From before', state);
  assert.equal(presenceSaid('active', { last_seen: '' }, NOW), 'before', 'an empty last_seen is no last_seen');
});

test('A HANDOFF reads Left a step, never Stopped, and a finished run reads Ended', () => {
  assert.equal(PRESENCE_WORDS[presenceSaid('handoff', row('handoff', 600).fields, NOW)], 'Left a step');
  assert.equal(PRESENCE_WORDS[presenceSaid('done', row('done', 1).fields, NOW)], 'Ended');
  /* THE STATE FROM THE FIELDS when the column is not handed, as a page's row holds it. */
  assert.equal(presenceSaid(undefined, row('handoff', 1).fields, NOW), 'left');
  assert.equal(presenceSaid(null, row('done', 1).fields, NOW), 'ended');
});

test('THE KERNEL\'S OWN RULE: said here as presenceOf says it, state by state and at the fifteen-minute edge', () => {
  assert.equal(WORKING_MS, KERNEL_WORKING_MS);
  const rows = [
    ...SIX.map(([, r]) => r),
    row('active', 14),
    row('active', 15),
    row('active', 16),
    row('idle', 1),
    row('', 1),
    row('something-else', 1),
    row('active', -1),
  ];
  for (const r of rows) {
    assert.equal(presenceSaid(r.state, r.fields, NOW), presenceOf({ state: r.state, fields: r.fields as never }, NOW), JSON.stringify(r));
    /* The fields alone, as a reader handed no column. */
    assert.equal(presenceSaid(undefined, r.fields, NOW), presenceOf({ fields: r.fields as never }, NOW), `fields alone: ${JSON.stringify(r)}`);
  }
});

test('THE RING STAYS THE FACE\'S THREE, and matches liveOf for the run it is drawn for', () => {
  assert.deepEqual(
    SIX.map(([w]) => ringOf(w)),
    ['working', 'quiet', 'stopped', 'stopped', 'stopped', 'stopped'],
  );
  /* ONLY AN ACTIVE RUN HAS A RING: handed its state, a quiet idle run draws none, as liveOf draws it. */
  for (const r of [row('active', 2), row('active', 40), row('idle', 3), row('handoff', 1), row('done', 1), row('abandoned', 700)]) {
    const p = presenceSaid(r.state, r.fields, NOW);
    assert.equal(ringOf(p, r.state), liveOf(r.state, p !== 'working'), JSON.stringify(r));
  }
});

test('THE WORDS ARE PLAIN: no em dash, no state id, each its own', () => {
  const words = Object.values(PRESENCE_WORDS);
  assert.equal(new Set(words).size, 6);
  for (const w of words) {
    assert.ok(!w.includes('—'), w);
    assert.match(w, /^[A-Z][a-z ]+$/u, w);
    assert.ok(!/handoff|abandoned|active|idle/u.test(w.toLowerCase()), w);
  }
});
