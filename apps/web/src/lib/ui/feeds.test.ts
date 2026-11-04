/**
 * WHAT COMES IN NAMES WHAT FEEDS THE RECORD.
 *
 * WHAT WAS WRONG. Settings › What comes in said "Nothing feeds your BrainDog yet" while card texts were posted to one of
 * its web addresses and filed into the Ledger every hour, and Arrivals on Today showed 15 (`settings-ingest-390-light.png`).
 * The tile listed only the scheduled fetches, and with none it said nothing fed the record.
 *
 * THE LIST IS TRIED AS A FUNCTION, and the screen's use of it read from its markup, as `segmented.test.ts` reads markup.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedsOf } from './webhook-doors.ts';
import { settle } from '../data/read.ts';

const NOW = Date.UTC(2026, 9, 24, 19);
const door = (id: string, name: string, lastArrival: string | null) => ({ id, name, lastArrival });

test('the address card texts are posted to is named, with how long ago the last one came, newest first', () => {
  const feeds = feedsOf(
    [door('mail-in', 'Mail forwarded to this record', '2026-10-20T09:00:00.000Z'), door('bank-from-out-sms', 'Card texts', '2026-10-24T14:00:00.000Z'), door('kiln', 'Readings from the kiln', null)],
    NOW,
  );
  assert.deepEqual(
    feeds.map((f) => [f.name, f.said]),
    [
      ['Card texts', 'Last arrival 5 hours ago'],
      ['Mail forwarded to this record', 'Last arrival 4 days ago'],
    ],
  );
});

test('an empty list of scheduled fetches says nothing feeds the record only when nothing else does', () => {
  const actions = readFileSync(new URL('../page/panels/Actions.svelte', import.meta.url), 'utf8');
  assert.match(actions, /project === null && rows\.length === 0 && !others\}/u, 'Nothing feeds is said over the feeds');
  const ingest = readFileSync(new URL('../../routes/settings/[area]/areas/Ingest.svelte', import.meta.url), 'utf8');
  assert.match(ingest, /\{#each feeds as feed \(feed\.id\)\}/u, 'the feeds are not listed');
  /* A DOORS READ REFUSED, as a reader without ADMIN is, holds `null`, which is what the screen asks: nothing is known. */
  assert.equal(settle({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'no' } }).value, null);
  /* AND EVERY OTHER WAY IN THE SCREEN LISTS (`wayRows`) IS SOMETHING THAT FEEDS IT too, and until those are read (d7c351ebe) nothing is said. */
  assert.match(ingest, /<Actions project=\{null\} others=\{!waysRead \|\| feeds\.length > 0 \|\| wayRows\.length > 0 \|\| !anOwner \|\| doors\.value === null\} \/>/u);
});
