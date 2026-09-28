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
import { ERASE_CHECK_MS, fleetFailure, nightlyWalk, reconcileErase, type EraseRow } from '../src/nightly.ts';
import type { OpFields } from '../src/oplog.ts';
import { prefixOf } from '../src/snapshots.ts';

const ids = (n: number, from = 0): string[] => Array.from({ length: n }, (_, i) => `rec_${String(from + i).padStart(4, '0')}`);

/** The walk's lines, collected in order with their level, as `op()` would write them. */
function heard() {
  const lines: { fields: OpFields; level: 'info' | 'error' }[] = [];
  return { lines, speak: (fields: OpFields, level: 'info' | 'error') => void lines.push({ fields, level }) };
}

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
  const { lines, speak } = heard();
  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(3) }),
    snapshot: (record) =>
      record === 'rec_0001'
        ? Promise.reject(new Error('the bucket said no'))
        : Promise.resolve({ key: `${record}/snapshots/x`, bytes: 10, rows: 2 }),
    speak,
    now: () => 0,
  });

  assert.equal(out.records, 3);
  assert.equal(out.backups, 2, 'the two that worked were still taken');
  assert.equal(out.failed, 1);
  const errors = lines.filter((l) => l.level === 'error');
  assert.equal(errors.length, 2, 'the record that failed, and the closing line as a problem');
  assert.equal(errors[0]?.fields.rec, 'rec_0001');
  assert.equal(errors[0]?.fields.backup, 'failed', 'the alert query `op=walk backup=failed` would not find it');
  assert.match(String(errors[0]?.fields.why), /the bucket said no/u);
  assert.equal(lines.at(-1)?.fields.op, 'walk.done');
  assert.equal(lines.at(-1)?.fields.backups_failed, 1, 'the closing line is where the alert query looks');
  assert.equal(lines.at(-1)?.level, 'error', 'a night with a failure is in the error stream, not only the log');
});

test('A WALK WITH NO RECORDS SAYS SO RATHER THAN SAYING NOTHING', async () => {
  // An empty Directory and a Directory that failed to answer look identical in a log that only
  // prints per-record lines. The closing line is written on every night, so a night with zero
  // records is a fact somebody can read the morning after.
  const { lines, speak } = heard();
  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: [] }),
    snapshot: () => assert.fail('nothing to snapshot'),
    speak,
    now: () => 0,
  });

  assert.equal(out.records, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.fields.op, 'walk.done');
  assert.equal(lines[0]?.fields.records, 0);
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

  assert.equal(fleetFailure({ records: 0, backups: 0, failed: 0, stragglers: 0, eraseOpen: 0, expired: 0, expiryFailed: 0, ms: 1 }), null, 'a deployment with no records is not a failure');
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
  const { lines, speak } = heard();
  const tonight = T0 + (FINAL_KEPT_DAYS + 1) * DAY;
  const asked: number[] = [];

  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: [] }),
    snapshot: () => assert.fail('no open record was listed'),
    closed: (cutoff, cursor) => (asked.push(cutoff), Promise.resolve(d.closedBefore(cutoff, cursor, 1))),
    expire: (record) => expireFinal(blobs, record),
    speak,
    now: () => tonight,
  });

  assert.equal(asked[0], tonight - FINAL_KEPT_MS, 'the cutoff is not tonight less the final copy\'s days');
  assert.ok(![...blobs.held].some((k) => k.startsWith(prefixOf(early))), 'the early record left something behind');
  assert.ok(blobs.held.has(final(late)), 'a final copy went before its thirty days were up');
  assert.ok(blobs.held.has(`${prefixOf(open)}latest.brainl.age`), 'an open record lost a copy');
  assert.equal(out.expired, 3);
  assert.equal(out.expiryFailed, 0);
  assert.equal(lines.at(-1)?.fields.expired_objects, 3);
  assert.equal(lines.at(-1)?.fields.expiry_failed, 0);
});

test('AN EXPIRY THAT FAILS IS LOUD, THE REST STILL EXPIRE, AND IT DOES NOT MAKE THE NIGHT RED', async () => {
  // The same rule as a copy that failed: counted, named with its reason, repeated in the closing line, and not fatal.
  // A refused delete leaves a copy a day longer than promised, which is a line to read in the morning; it is not the
  // deployment failing, and the records that did get their copy must not be reported as a night that copied nothing.
  const { d, early, late, keys } = deleted();
  const blobs = bucket(keys, early);
  const { lines, speak } = heard();
  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(1) }),
    snapshot: (record) => Promise.resolve({ key: record, bytes: 1, rows: 1 }),
    closed: (cutoff, cursor) => Promise.resolve(d.closedBefore(cutoff, cursor)),
    expire: (record) => expireFinal(blobs, record),
    speak,
    now: () => T0 + 60 * DAY,
  });

  assert.equal(out.expiryFailed, 1);
  assert.equal(out.expired, 1, 'the late record was not expired because the early one failed');
  assert.ok(![...blobs.held].some((k) => k.startsWith(prefixOf(late))));
  const errors = lines.filter((l) => l.level === 'error');
  assert.equal(errors[0]?.fields.rec, early);
  assert.match(String(errors[0]?.fields.why), /the bucket said no/u);
  assert.equal(errors.at(-1)?.fields.expiry_failed, 1);
  assert.equal(fleetFailure(out), null);
});

test('A WALK WITH NO EXPIRY WIRED SAYS NOTHING ABOUT EXPIRY, rather than a zero that reads as one that ran', async () => {
  // `expired_objects: 0` in the closing line would be read the morning after as "nothing was due", when the truth is
  // that nothing was asked. The same holds for stragglers, open erasures and the ladder.
  const { lines, speak } = heard();
  const out = await nightlyWalk({ records: () => Promise.resolve({ ids: [] }), snapshot: () => assert.fail('none'), speak, now: () => 0 });
  const done = lines.at(-1)?.fields ?? {};
  for (const field of ['expired_objects', 'stragglers', 'erase_open', 'lapsed']) assert.ok(!(field in done), `${field} was said by a walk that never ran it`);
  assert.equal(out.expired, 0);
});

/* ── the re-wrap, the erasures and the ops record's note ─────────────── */

test('A STRAGGLER IS COUNTED, A RE-WRAP THAT THROWS IS ONE TOO, AND NEITHER COSTS THE RECORD ITS COPY', async () => {
  // `53 §2.3`'s KEK alert reads `stragglers` from the closing line. A deployment whose root key is not keys throws for
  // every record, and that must read as every record a straggler with a reason, not as a rotation that finished.
  const { lines, speak } = heard();
  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(3) }),
    snapshot: (record) => Promise.resolve({ key: record, bytes: 1, rows: 1 }),
    rewrap: (record) => (record === 'rec_0001' ? Promise.resolve('straggler') : record === 'rec_0002' ? Promise.reject(new Error('not keys')) : Promise.resolve('ok')),
    speak,
    now: () => 0,
  });
  assert.equal(out.stragglers, 2);
  assert.equal(out.backups, 3, 'a straggler lost its copy');
  const walk = lines.filter((l) => l.fields.op === 'walk');
  assert.deepEqual(walk.map((l) => l.fields.kek), ['ok', 'straggler', 'failed']);
  assert.equal(lines.at(-1)?.fields.stragglers, 2);
});

test('AN ERASED OBJECT STILL IN THE BUCKET IS PUT BACK ONCE AND COUNTED OPEN, AND ONE THAT IS GONE IS NOT', () => {
  // `53 §5.1` step 3d. The done row stays inside the thirty days whatever happens next, so a key already waiting again
  // must not be queued a second time, or each night adds a row until a delete finally takes.
  const now = T0 + 2 * DAY;
  const at = (ms: number) => new Date(ms).toISOString();
  const rows: EraseRow[] = [
    { id: 'o1', state: 'done', created: at(now - DAY), erase: 'e1', key: 'rec_x/still-there' },
    { id: 'o2', state: 'done', created: at(now - DAY), erase: 'e1', key: 'rec_x/gone' },
    { id: 'o3', state: 'done', created: at(now - DAY), erase: 'e1', key: 'rec_x/waiting' },
    { id: 'o4', state: 'pending', created: at(now - 60_000), erase: 'e1', key: 'rec_x/waiting' },
    { id: 'o5', state: 'dead', created: at(now - DAY), erase: 'e1', key: 'rec_x/dead' },
    { id: 'o6', state: 'failed', created: at(now - 2 * DAY), erase: 'e1', key: 'rec_x/late' },
    { id: 'o7', state: 'done', created: at(now - ERASE_CHECK_MS - DAY), erase: 'e0', key: 'rec_x/old' },
  ];
  const held = new Set(['rec_x/still-there', 'rec_x/waiting', 'rec_x/old']);
  const queued: string[] = [];
  return reconcileErase(
    rows,
    (key) => Promise.resolve(held.has(key)),
    (again) => (queued.push(...again.map((r) => r.key)), Promise.resolve()),
    now,
  ).then((open) => {
    assert.deepEqual(queued, ['rec_x/still-there'], 'only the done erasure whose object is still there goes back');
    assert.equal(open, 3, 'the one put back, the dead one and the late one are open; the fresh pending one is not');
  });
});

test('THE NIGHT IS ONE NOTE IN THE OPS RECORD, AND A NOTE THAT FAILS IS A LINE AND NOT THE END', async () => {
  const notes: string[] = [];
  await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(2) }),
    snapshot: (record) => Promise.resolve({ key: record, bytes: 1, rows: 1 }),
    note: (text) => (notes.push(text), Promise.resolve()),
    now: () => T0,
  });
  assert.deepEqual(notes, ['walk 2026-09-01 · 2 records · 0 stragglers · 0 failed · 0 open']);

  const { lines, speak } = heard();
  const out = await nightlyWalk({
    records: () => Promise.resolve({ ids: ids(1) }),
    snapshot: (record) => Promise.resolve({ key: record, bytes: 1, rows: 1 }),
    note: () => Promise.reject(new Error('no such record')),
    speak,
    now: () => T0,
  });
  assert.equal(out.backups, 1);
  assert.equal(lines.at(-1)?.fields.note, 'failed');
  assert.equal(lines.at(-1)?.level, 'error');
});
