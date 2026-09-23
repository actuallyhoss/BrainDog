/**
 * The nightly walk: one cron invocation, every record, and what it says when a record's copy failed.
 *
 * THE WALK IS TESTED APART FROM THE PLATFORM for the same reason `alarm.ts` is: a Durable Object
 * cannot be started in a bare Node process, and the half worth testing is not the platform's. What
 * can be wrong here is paging that stops early, one record's failure taking the other twenty-nine
 * with it, and a night that failed reporting nothing, and all three are in the twenty lines the
 * walk is, over two injected functions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '@braindog/record/directory';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { FINAL_KEPT_DAYS, FINAL_KEPT_MS, expireFinal } from '../src/destroy.ts';
import { fleetFailure, nightlyWalk } from '../src/nightly.ts';
import { prefixOf } from '../src/snapshots.ts';

const ids = (n: number, from = 0): string[] => Array.from({ length: n }, (_, i) => `rec_${String(from + i).padStart(4, '0')}`);

test('EVERY PAGE IS WALKED, AND THE TALLY IS WHAT THE DIRECTORY LISTED', async () => {
  // `53 §5.1` verify step: `walk.done.records` equals the count `listRecords` returned. A walk that
  // stopped at the first page would back up the first five hundred records for ever and never say
  // which ones it had missed, because the count it logged would be the count it walked.
  const done: string[] = [];
  const out = await nightlyWalk({
    records: (cursor) =>
      Promise.resolve(cursor === undefined ? { ids: ids(3), cursor: 'more' } : { ids: ids(2, 3) }),
    snapshot: (record) => (done.push(record), Promise.resolve({ key: `${record}/snapshots/x`, bytes: 10, rows: 2 })),
    now: () => 0,
  });

  assert.deepEqual(done, ids(5));
  assert.equal(out.records, 5);
  assert.equal(out.backups, 5);
  assert.equal(out.failed, 0);
});

test('A RECORD WHOSE COPY FAILED IS LOUD, AND THE WALK CARRIES ON', async () => {
  // A backup that quietly does not happen is the worst bug this subsystem can have, so the failure
  // is counted, named in an error line with the reason, and repeated in the closing `walk.done`
  // line that `53 §2.3`'s alert query reads. And it is not fatal: stopping would mean one record
  // with a full bucket decides that nobody else gets a copy tonight either.
  const moaned: string[] = [];
  const said: string[] = [];
  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(3) }),
    snapshot: (record) =>
      record === 'rec_0001'
        ? Promise.reject(new Error('the bucket said no'))
        : Promise.resolve({ key: `${record}/snapshots/x`, bytes: 10, rows: 2 }),
    say: (line) => said.push(line),
    moan: (line) => moaned.push(line),
    now: () => 0,
  });

  assert.equal(out.records, 3);
  assert.equal(out.backups, 2, 'the two that worked were still taken');
  assert.equal(out.failed, 1);
  assert.equal(moaned.length, 2, 'the record that failed, and the closing line repeated as a problem');
  assert.match(moaned[0] ?? '', /rec_0001/u);
  assert.match(moaned[0] ?? '', /the bucket said no/u);
  assert.match(moaned.at(-1) ?? '', /backups_failed=1/u, 'a night with a failure is in the error stream, not only the log');
  assert.match(said.at(-1) ?? '', /backups_failed=1/u, 'the closing line is where the alert query looks');
});

test('A WALK WITH NO RECORDS SAYS SO RATHER THAN SAYING NOTHING', async () => {
  // An empty Directory and a Directory that failed to answer look identical in a log that only
  // prints per-record lines. The closing line is written on every night, so a night with zero
  // records is a fact somebody can read the morning after.
  const said: string[] = [];
  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: [] }),
    snapshot: () => assert.fail('nothing to snapshot'),
    say: (line) => said.push(line),
    now: () => 0,
  });

  assert.equal(out.records, 0);
  assert.equal(said.length, 1);
  assert.match(said[0] ?? '', /records=0/u);
});

test('A NIGHT THAT COPIED NOTHING IS THE DEPLOYMENT, AND IT IS SAID DIFFERENTLY', async () => {
  // The two failures that look alike in a count and are not alike at all. One record over the
  // ceiling is a record to fix and the other twenty-nine have their copy; every record failing is
  // the bucket, the binding or the recipient, and nobody has a copy of anything. Only the second
  // one is worth making the cron invocation itself red.
  const all = await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(3) }),
    snapshot: () => Promise.reject(new Error('no bucket')),
    now: () => 0,
  });
  assert.match(fleetFailure(all) ?? '', /all 3 records failed/u);

  const one = await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(3) }),
    snapshot: (record) =>
      record === 'rec_0000' ? Promise.reject(new Error('over the ceiling')) : Promise.resolve({ key: record, bytes: 1, rows: 1 }),
    now: () => 0,
  });
  assert.equal(fleetFailure(one), null, 'one record over the ceiling made the whole night red');

  assert.equal(fleetFailure({ records: 0, backups: 0, failed: 0, expired: 0, expiryFailed: 0, ms: 1 }), null, 'a deployment with no records is not a failure');
});

test('A CURSOR THAT DOES NOT MOVE IS STOPPED, rather than paging for ever', async () => {
  // Measured against the shape of the Directory's keyset cursor: it is the last id of the page, so
  // the same cursor twice means the page did not advance. It cannot be known until it repeats, so
  // the second page is walked and the third is not: four records here, not an invocation the
  // platform kills at thirty seconds and the operator reads as a timeout.
  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(2), cursor: 'stuck' }),
    snapshot: (record) => Promise.resolve({ key: record, bytes: 1, rows: 1 }),
    now: () => 0,
  });
  assert.equal(out.records, 4, 'the repeated cursor was followed past the page that repeated it');
});

/* ── a deleted record's final copy, expired ───────────────────────────── */

/**
 * The two R2 methods expiry uses, over a sorted Map, paged three keys at a time so a one-page reader is caught. `fail`
 * names a record whose delete the bucket refuses.
 */
function bucket(keys: string[], fail?: string) {
  const held = new Set(keys);
  return {
    held,
    list(options?: { prefix?: string; cursor?: string }) {
      const all = [...held].filter((k) => k.startsWith(options?.prefix ?? '')).sort();
      const from = Number(options?.cursor ?? 0);
      const objects = all.slice(from, from + 3).map((key) => ({ key, size: 1 }));
      return Promise.resolve(from + 3 < all.length ? { objects, truncated: true, cursor: String(from + 3) } : { objects, truncated: false });
    },
    delete(doomed: string | string[]) {
      const list = typeof doomed === 'string' ? [doomed] : doomed;
      if (fail && list.some((k) => k.startsWith(prefixOf(fail)))) return Promise.reject(new Error('the bucket said no'));
      for (const key of list) held.delete(key);
      return Promise.resolve();
    },
  };
}

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 3, 17);

/** Three records on a real Directory: one closed at T0, one closed ten days later, one open, each with a final copy. */
function deleted() {
  const clock = fixedClock(T0);
  const d = createDirectory(openSqlite(), clock);
  assert.ok(d.person$('ada@example.com').ok);
  const make = (slug: string): string => {
    const made = d.provision({ slug, email: 'ada@example.com' });
    return made.ok ? made.value.record : assert.fail(JSON.stringify(made));
  };
  const early = make('early');
  const late = make('late');
  const open = make('still-open');
  assert.ok(d.close(early).ok);
  clock.advance(10 * DAY);
  assert.ok(d.close(late).ok);
  const final = (r: string) => `${prefixOf(r)}final-2026-09-01.brainl.age`;
  /* AND THE TWO OBJECTS §5 MEASURED A DELETE LEAVING BEHIND, on the early record, because every record deleted before
     the sweep existed is closed with exactly those in its prefix. */
  const leftover = [`${prefixOf(early)}nightly-2026-08-31.brainl.age`, `${prefixOf(early)}latest.brainl.age`];
  return { d, early, late, open, final, leftover, keys: [final(early), final(late), `${prefixOf(open)}latest.brainl.age`, ...leftover] };
}

test('A RECORD CLOSED MORE THAN THIRTY DAYS AGO LOSES WHAT IS LEFT OF IT, AND ONE CLOSED SINCE KEEPS ITS FINAL COPY', async () => {
  // `53 §5.9`'s "by day +30 nothing of the record remains anywhere", on the night it becomes true. The early record was
  // closed 31 days before tonight and the late one 21: the first goes, final copy and pre-sweep leftovers alike, the
  // second keeps its copy for the nine days it is still owed, and the open record is never asked about.
  const { d, early, late, open, final, keys } = deleted();
  const blobs = bucket(keys);
  const said: string[] = [];
  const tonight = T0 + (FINAL_KEPT_DAYS + 1) * DAY;
  const asked: number[] = [];

  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: [] }),
    snapshot: () => assert.fail('no open record was listed'),
    closed: (cutoff, cursor) => (asked.push(cutoff), Promise.resolve(d.closedBefore(cutoff, cursor, 1))),
    expire: (record) => expireFinal(blobs, record),
    say: (line) => said.push(line),
    now: () => tonight,
  });

  assert.equal(asked[0], tonight - FINAL_KEPT_MS, 'the cutoff is not tonight less the final copy\'s days');
  assert.ok(![...blobs.held].some((k) => k.startsWith(prefixOf(early))), 'the early record left something behind');
  assert.ok(blobs.held.has(final(late)), 'a final copy went before its thirty days were up');
  assert.ok(blobs.held.has(`${prefixOf(open)}latest.brainl.age`), 'an open record lost a copy');
  assert.equal(out.expired, 3);
  assert.equal(out.expiryFailed, 0);
  assert.match(said.at(-1) ?? '', /expired_objects=3 expiry_failed=0/u);
});

test('AN EXPIRY THAT FAILS IS LOUD, THE REST STILL EXPIRE, AND IT DOES NOT MAKE THE NIGHT RED', async () => {
  // The same rule as a copy that failed: counted, named with its reason, repeated in the closing line, and not fatal.
  // A refused delete leaves a copy a day longer than promised, which is a line to read in the morning; it is not the
  // deployment failing, and the records that did get their copy must not be reported as a night that copied nothing.
  const { d, early, late, keys } = deleted();
  const blobs = bucket(keys, early);
  const moaned: string[] = [];
  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(1) }),
    snapshot: (record) => Promise.resolve({ key: record, bytes: 1, rows: 1 }),
    closed: (cutoff, cursor) => Promise.resolve(d.closedBefore(cutoff, cursor)),
    expire: (record) => expireFinal(blobs, record),
    moan: (line) => moaned.push(line),
    now: () => T0 + 60 * DAY,
  });

  assert.equal(out.expiryFailed, 1);
  assert.equal(out.expired, 1, 'the late record was not expired because the early one failed');
  assert.ok(![...blobs.held].some((k) => k.startsWith(prefixOf(late))));
  assert.match(moaned[0] ?? '', new RegExp(`${early}.*the bucket said no`, 'u'));
  assert.match(moaned.at(-1) ?? '', /expiry_failed=1/u);
  assert.equal(fleetFailure(out), null);
});

test('A WALK WITH NO EXPIRY WIRED SAYS NOTHING ABOUT EXPIRY, rather than a zero that reads as one that ran', async () => {
  // The Worker's cron does not pass `closed` until W55-7 wires it. `expired_objects=0` in that line would be read the
  // morning after as "nothing was due", when the truth is that nothing was asked.
  const said: string[] = [];
  const out = await nightlyWalk({ records: () => Promise.resolve({ ids: [] }), snapshot: () => assert.fail('none'), say: (l) => said.push(l), now: () => 0 });
  assert.doesNotMatch(said.at(-1) ?? '', /expir/u);
  assert.equal(out.expired, 0);
});
