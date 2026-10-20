/**
 * What comes in: each way in by the channel the record keeps, its last arrival, and a fortnight of arrivals on the
 * reader's own clock.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFileSync } from 'node:fs';

import { EVERYDAY, SOURCE_DAYS, countSaid, drawsLine, lastSaid, nothingEver, quietWords, sourcesOf } from './sources.ts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOON = at(2026, 10, 7);
const iso = (ms: number) => new Date(ms).toISOString();

test('a new record says the three everyday ways in, with nothing through them', () => {
  const out = sourcesOf([], NOON);
  assert.deepEqual(out.map((s) => s.channel), [...EVERYDAY]);
  assert.deepEqual(out.map((s) => s.name), ['Mail', 'Texts and apps', 'Agents']);
  assert.ok(out.every((s) => s.last === null && s.total === 0 && s.days.length === SOURCE_DAYS));
  assert.equal(lastSaid(out[0]!, () => 'x'), 'Nothing has come in this way yet');
  assert.equal(countSaid(0), 'None in 14 days');
});

test('arrivals are counted by the day they came, today last, and the newest way in leads', () => {
  const lines = [
    { channel: 'webhook', ts: iso(at(2026, 10, 7, 9)) },
    { channel: 'webhook', ts: iso(at(2026, 10, 6, 9)) },
    { channel: 'webhook', ts: iso(at(2026, 10, 1, 9)) },
    { channel: 'email', ts: iso(at(2026, 10, 2, 9)) },
    { channel: 'email', ts: iso(at(2026, 9, 1, 9)) },
    { channel: 'paste', ts: iso(at(2026, 10, 3, 9)) },
    { channel: 'api', ts: 'not a time' },
  ];
  const out = sourcesOf(lines, NOON);
  assert.deepEqual(out.map((s) => s.channel), ['webhook', 'paste', 'email', 'api']);
  const texts = out[0]!;
  assert.equal(texts.total, 3);
  assert.equal(texts.days.at(-1), 1, 'today is the last day');
  assert.equal(texts.days.at(-2), 1);
  assert.equal(texts.days.at(-7), 1);
  assert.equal(texts.last, iso(at(2026, 10, 7, 9)));
  assert.ok(drawsLine(texts));
  const mail = out.find((s) => s.channel === 'email')!;
  assert.equal(mail.total, 1, 'a month-old arrival is past the fortnight');
  assert.equal(mail.last, iso(at(2026, 10, 2, 9)));
  assert.equal(drawsLine(mail), false, 'one day is a count, not a line');
  assert.equal(out.find((s) => s.channel === 'api')?.last, null, 'a time that will not read is no last arrival');
  assert.equal(countSaid(1200), '1,200 in 14 days');
});

test('an inbox nothing has ever reached is one fact, told by the record\'s own tally', () => {
  const none = { waiting: 0, filed: 0, archived: 0 };
  const quiet = sourcesOf([], NOON);
  assert.equal(nothingEver(none, quiet, 0), true);
  assert.equal(nothingEver(none, null, 0), true, 'the tally is the count of every arrival; the ways in only cover a fortnight');
  /* ANYTHING THAT EVER CAME IS NOT "NOTHING YET": something filed last year, something waiting, or a way in with an arrival. */
  assert.equal(nothingEver({ ...none, filed: 3 }, quiet, 0), false);
  assert.equal(nothingEver({ ...none, archived: 1 }, quiet, 0), false);
  assert.equal(nothingEver({ ...none, waiting: 1 }, quiet, 0), false);
  assert.equal(nothingEver(none, quiet, 2), false);
  assert.equal(nothingEver(none, sourcesOf([{ channel: 'email', ts: iso(at(2026, 10, 6)) }], NOON), 0), false);
  /* A RECORD THAT ANSWERED NO TALLY IS NOT SAID TO BE EMPTY: a quiet fortnight is not nothing yet. */
  assert.equal(nothingEver(null, quiet, 0), false);
  assert.doesNotMatch(`${quietWords.title} ${quietWords.why} ${quietWords.add}`, /—|\brow\b|entity/u);
});

test('the page draws that inbox as one tile, in place of the two tiles and the empty state under them', () => {
  const src = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/gu, '');
  const markup = src.slice(src.indexOf('<div class="page">'), src.indexOf('{#snippet settledSeries()}'));
  const never = markup.indexOf('{:else if never}');
  const board = markup.indexOf('<div class="inbox">');
  assert.ok(never > 0 && board > never, 'the one tile is not chosen before the board');
  const one = markup.slice(never, markup.indexOf('{:else}', never));
  assert.equal(one.match(/<Empty\b/gu)?.length, 1);
  assert.doesNotMatch(one, /<Tile\b/u, 'the one tile still draws the ways in or the rules beside it');
  assert.match(one, /title=\{quietWords\.title\} body=\{quietWords\.why\}/u);
  assert.match(one, /<Button weight="primary" href="\/settings\/ingest">\{quietWords\.add\}<\/Button>/u, "the one thing to do is the primary (first F13)");
  /* IT WAITS FOR THE TALLY, so the cleared inbox is never drawn first and swapped a moment later. */
  assert.match(markup, /\{:else if INBOX\.length === 0 && !tallied\}\s*<Waiting \/>\s*\{:else if never\}/u);
  assert.match(src, /const never = \$derived\(patterns\.length === 0 && nothingEver\(tally, ways, INBOX\.length\)\);/u);
});
