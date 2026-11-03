/**
 * `/scripts`'s sentence and each script's recent-runs line: the month's runs are the rows' own counts, red is said only
 * for a paused script or a refused last run, and a script with no recent run has no chart.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Run } from '../../lib/record/scripts.ts';
import { plain, recentOf, sentenceOf, toneOf, troubleOf, words, type SaidRow } from './reading.ts';

type Row = SaidRow;
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
  assert.equal(plain(said), '2 scripts ran 41 times this month.');
  assert.equal(said.some((p) => p.tone === 'needs'), false);
  assert.equal(plain(sentenceOf([row({ month: { runs: 0, ok: 0, refused: 0 } })]) ?? []), '1 script, not run this month.');
  assert.equal(sentenceOf([]), null);
});

test('a paused script and a refused last run are the red phrases, and a paused one is not said twice', () => {
  const said = sentenceOf([
    row({ status: 'paused', last: { at: '2026-09-29T08:00:00Z', version: 1, outcome: 'refused', say: '' } }),
    row({ title: 'Invoices', last: { at: '2026-09-29T08:00:00Z', version: 2, outcome: 'refused', say: '' } }),
    row({ title: 'Digest', month: { runs: 1, ok: 1, refused: 0 } }),
  ]);
  assert.ok(said);
  assert.equal(plain(said), '3 scripts ran 21 times this month; 1 is paused, and Invoices was refused on its last run.');
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

/* ── the declared page's rows ── */

test('a row of the page’s scripts block says what starts it and where it stands, as the old list did', async () => {
  const { scriptOf } = await import('../../lib/record/scripts.ts');
  const NOW = Date.parse('2026-09-29T10:00:00Z');
  const ok = scriptOf({ script: 'fx', title: 'FX rate', status: 'on', every: '1d', rule: true, last_at: '2026-09-29T08:00:00Z', last: 'ok', said: '' }, NOW);
  assert.equal(ok.script, 'fx');
  assert.equal(ok.title, 'FX rate');
  assert.equal(ok.what, 'Every day · by automation');
  assert.match(ok.said, /^Last ran /u);
  assert.equal(ok.tone, undefined);
  assert.deepEqual(
    { said: scriptOf({ script: 'fx', status: 'paused', every: '1h' }, NOW).said, tone: scriptOf({ script: 'fx', status: 'paused' }, NOW).tone },
    { said: 'Paused', tone: 'warn' },
  );
  const refused = scriptOf({ script: 'fx', status: 'on', last_at: '2026-09-29T08:00:00Z', last: 'refused' }, NOW);
  assert.deepEqual({ said: refused.said, tone: refused.tone }, { said: 'Refused on its last run', tone: 'bad' });
  /* A FIELD OUT OF SHAPE IS NOTHING: no run nobody made, no id that is not one. */
  const odd = scriptOf({ script: 7, last_at: 3, status: 'maybe' }, NOW);
  assert.equal(odd.script, '');
  assert.equal(odd.said, 'Not run yet');
});

test('the screen draws the declared page through the one reader, and says no line of counts in the head', async () => {
  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(screen, /<PageView slug=\{SLUG\} got=\{drawn\} mode="home" unfolded \{reread\} \/>/u, 'every script is drawn, none folded');
  assert.match(screen, /from '@braindog\/seed\/packs\/scripts'/u);
  /* NO LINE OF COUNTS SINCE 3 Nov ("i dont like those briefs at all, remove them"): each row says its runs. */
  assert.doesNotMatch(screen, /sentenceOf\(rows\)/u);
  assert.doesNotMatch(screen, /HubRows/u, 'the list is the page’s table now, not rows built by hand');
});

/* SAY WHAT THE MONTH COUNTS: Scripts said 64 runs where Automations said 42, and both read as
   the same count. A script runs on its own clock, on a door's arrival and when an automation starts it, and Automations
   counts only the last, so the sentence names what started the runs it counts. */
test('the month says what started the runs it counts, from what starts each script that ran', () => {
  const clock = { every: '1d', door: null, rule: false };
  const rule = { every: null, door: null, rule: true };
  const both = { every: '1d', door: null, rule: true };
  const door = { every: null, door: 'kiln-orders', rule: false };
  assert.equal(plain(sentenceOf([row({ runs: clock }), row({ title: 'Glaze log', runs: rule })]) ?? []), '2 scripts ran 20 times this month, on their clocks and when an automation started one.');
  assert.equal(plain(sentenceOf([row({ runs: rule })]) ?? []), '1 script ran 10 times this month, when an automation started it.');
  assert.equal(plain(sentenceOf([row({ runs: both })]) ?? []), '1 script ran 10 times this month, on its clock and when an automation started it.');
  assert.equal(plain(sentenceOf([row({ runs: door }), row({ title: 'Glaze log', runs: door })]) ?? []), '2 scripts ran 20 times this month, as something arrived.');
  /* A SCRIPT THAT DID NOT RUN SAYS NOTHING OF WHAT STARTS IT, and a month with no runs says no more than that. */
  assert.equal(plain(sentenceOf([row({ runs: clock }), row({ title: 'Glaze log', runs: rule, month: { runs: 0, ok: 0, refused: 0 } })]) ?? []), '2 scripts ran 10 times this month, on their clocks.');
  assert.equal(plain(sentenceOf([row({ runs: rule, month: { runs: 0, ok: 0, refused: 0 } })]) ?? []), '1 script, not run this month.');
});

/* ONE SCRIPTS LIST: `/p/scripts` drew the same scripts again, so the page's address goes to
   the screen, as `/p/activity` goes to `/audit`. Read as text: the route's load imports `$lib`, which node cannot. */
test('the Scripts page is the Scripts screen: its address goes there', async () => {
  const { readFileSync } = await import('node:fs');
  const route = readFileSync(new URL('../p/[slug]/+page.ts', import.meta.url), 'utf8');
  assert.match(route, /SCREENS[^=]*=\s*\{[^}]*\bscripts: '\/scripts'/u);
});

/* THE PASS OF 27 OCTOBER: the script refused on its last run sat ninth, folded under "9 more". */
test('a refused last run sorts first, then a paused script, then the rest', () => {
  const rows = [
    { title: 'Fine', status: 'on', last: 'ok' },
    { title: 'Paused', status: 'paused', last: 'refused' },
    { title: 'Refused', status: 'on', last: 'refused' },
    { title: 'Failed', status: 'on', last: 'failed' },
  ];
  const sorted = [...rows].sort((a, b) => troubleOf(a) - troubleOf(b));
  assert.deepEqual(sorted.map((r) => r.title), ['Refused', 'Failed', 'Paused', 'Fine']);
});

/* THE PASS OF 27 OCTOBER: the key named pale bars over five dark ones. */
test('the bars\' key says only the bars that are drawn', () => {
  assert.equal(words.legend(5, 5), 'One bar for each of its last 5 runs.');
  assert.equal(words.legend(5, 0), 'One bar for each of its last 5 runs; a pale bar did not go through.');
  assert.equal(words.legend(5, 3), 'One bar for each of its last 5 runs; dark bars went through, pale ones did not.');
  assert.equal(words.legend(1, 1), 'One bar for its last run.');
});
