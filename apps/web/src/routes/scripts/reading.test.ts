/**
 * `/scripts`'s sentence and each script's recent-runs line: the month's runs are the rows' own counts, red is said only
 * for a paused script or a refused last run, and a script with no recent run has no chart.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Run, Script } from '../../lib/record/scripts.ts';
import { plain, recentOf, sentenceOf, toneOf } from './reading.ts';

type Row = Pick<Script, 'title' | 'status' | 'last' | 'month'>;
const row = (over: Partial<Row>): Row => ({
  title: 'FX rate',
  status: 'on',
  last: { at: '2026-09-29T08:00:00Z', version: 1, outcome: 'ok', say: '' },
  month: { runs: 10, ok: 10, refused: 0 },
  ...over,
});

const ran = (outcome: string): Run => ({ id: outcome, at: '2026-09-29T08:00:00Z', version: 1, outcome, say: '', log: null });

test('the sentence counts the scripts and this month’s runs from the rows, and is calm when nothing is wrong', () => {
  const said = sentenceOf([row({}), row({ title: 'Invoices', month: { runs: 31, ok: 31, refused: 0 } })]);
  assert.ok(said);
  assert.equal(plain(said), '2 scripts, 41 runs this month.');
  assert.equal(said.some((p) => p.tone === 'needs'), false);
  assert.equal(plain(sentenceOf([row({ month: { runs: 0, ok: 0, refused: 0 } })]) ?? []), '1 script, no runs this month.');
  assert.equal(sentenceOf([]), null);
});

test('a paused script and a refused last run are the red phrases, and a paused one is not said twice', () => {
  const said = sentenceOf([
    row({ status: 'paused', last: { at: '2026-09-29T08:00:00Z', version: 1, outcome: 'refused', say: '' } }),
    row({ title: 'Invoices', last: { at: '2026-09-29T08:00:00Z', version: 2, outcome: 'refused', say: '' } }),
    row({ title: 'Digest', month: { runs: 1, ok: 1, refused: 0 } }),
  ]);
  assert.ok(said);
  assert.equal(plain(said), '3 scripts, 21 runs this month; 1 is paused, and Invoices was refused on its last run.');
  assert.deepEqual(
    said.filter((p) => p.tone === 'needs').map((p) => p.text),
    ['1 is paused', 'Invoices was refused on its last run'],
  );
});

test('the recent runs are a count of those that went through, and none is no chart', () => {
  assert.deepEqual(recentOf({ recent: [ran('ok'), ran('ok'), ran('refused'), ran('ok'), ran('ok')] }), {
    total: 5,
    ok: 4,
    said: '4 of the last 5 runs went through; 1 was refused.',
  });
  assert.equal(recentOf({ recent: [ran('ok'), ran('ok')] })?.said, 'All 2 recent runs went through.');
  assert.equal(recentOf({ recent: [ran('held')] })?.said, 'Its one recent run did not go through.');
  assert.equal(recentOf({ recent: [] }), null);
});

test('each outcome has one tone, red only for a refusal or a failure', () => {
  assert.equal(toneOf('ok'), 'done');
  assert.equal(toneOf('refused'), 'bad');
  assert.equal(toneOf('failed'), 'bad');
  assert.equal(toneOf('held'), 'warn');
  assert.equal(toneOf('dropped'), 'quiet');
});
