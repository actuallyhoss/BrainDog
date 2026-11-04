/**
 * What comes in: each way in by the channel the record keeps, its last arrival, and a fortnight of arrivals on the
 * reader's own clock.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFileSync } from 'node:fs';

import { EVERYDAY, SOURCE_DAYS, countSaid, drawsLine, lastSaid, nothingEver, quietOf, sourcesOf } from './sources.ts';
import { addressCommand } from '../../lib/record/inbound-write.ts';

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
  for (const q of [quietOf('cloud', null), quietOf('self-host', 'echo x')]) assert.doesNotMatch(`${q.title} ${q.why} ${q.add}`, /—|\brow\b|entity/u);
});

test('the page draws that inbox as one tile, in place of the two tiles and the empty state under them', () => {
  const src = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/gu, '');
  const markup = src.slice(src.indexOf('<div class="page">'), src.indexOf('{#snippet settledSeries()}'));
  const never = markup.indexOf('{:else if !refused && never}');
  const board = markup.indexOf('<div class="inbox">');
  assert.ok(never > 0 && board > never, 'the one tile is not chosen before the board');
  const one = markup.slice(never, board);
  assert.equal(one.match(/<Empty\b/gu)?.length, 1);
  assert.doesNotMatch(one, /<Tile\b/u, 'the one tile still draws the ways in or the rules beside it');
  assert.match(one, /title=\{quiet\.title\} body=\{quiet\.why\}/u);
  assert.match(one, /<Button weight="primary" href="\/settings\/ingest">\{quiet\.add\}<\/Button>/u, "the one thing to do is the primary (first F13)");
  /* AND THE ONE STEP TO AN ADDRESS, where it is a command to copy: the tile's hero on a self-host (T22), never folded. */
  assert.match(one, /\{#if quiet\.command\}[\s\S]*?<CodeLine text=\{quiet\.command\} \/>[\s\S]*?<Button weight="quiet" href="\/settings\/ingest">\{quiet\.add\}<\/Button>\s*\{:else\}/u, 'the self-host command is not the hero, or the other ways in are not a quiet press under it');
  /* IT WAITS FOR THE TALLY, so the cleared inbox is never drawn first and swapped a moment later. */
  assert.match(markup, /\{:else if !refused && INBOX\.length === 0 && !tallied\}\s*<Waiting shape="inbox" \/>\s*\{:else if !refused && never\}/u);
  assert.match(src, /const never = \$derived\(patterns\.length === 0 && nothingEver\(tally, ways, INBOX\.length\)\);/u);
});

/* ── the empty Inbox shows the one step to an address ─────────────────────────────── */

test('X25: the empty Inbox says how to get the address, never "this BrainDog\'s address" with no address', () => {
  const cloud = quietOf('cloud', null);
  assert.doesNotMatch(cloud.why, /Forward mail to this BrainDog's address/u);
  assert.match(cloud.why, /What comes in/u, 'the Cloud is not told where the address is made');
  assert.equal(cloud.add, 'Set up an address');
  assert.equal(cloud.command, null);

  const cmd = addressCommand('https://studio.example', 'the-studio');
  assert.equal(cmd, 'echo "https://studio.example/in/email/$(cat ${BRAINDOG_DATA:-/data}/the-studio/inbound.token)"');
  const self = quietOf('self-host', cmd);
  assert.equal(self.command, cmd);
  assert.match(self.why, /address/u);
  assert.equal(self.show, 'Print the address');
  assert.equal(cloud.show, null, 'a hosted record is never shown the command');
  /* A HOST THAT DID NOT SAY WHICH IT IS IS TOLD THE CLOUD'S WAY, which needs no command. */
  assert.equal(quietOf(undefined, cmd).command, null);
});
