/**
 * The nightly walk: one cron invocation, every record, and what it says when a record's copy failed.
 *
 * THE WALK IS TESTED APART FROM THE PLATFORM for the same reason `alarm.ts` is: a Durable Object
 * cannot be started in a bare Node process, and the half worth testing is not the platform's. What
 * can be wrong here is paging that stops early, one record's failure taking the other twenty-nine
 * with it, and a night that failed reporting nothing — and all three are in the twenty lines the
 * walk is, over two injected functions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fleetFailure, nightlyWalk } from '../src/nightly.ts';

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

  assert.equal(fleetFailure({ records: 0, backups: 0, failed: 0, ms: 1 }), null, 'a deployment with no records is not a failure');
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
