/**
 * `ran` on `/healthz` is said only over a night that ran whole (audit-35).
 *
 * BEFORE THIS, THE NIGHT SAID IT RAN WHEN IT DID NOT: when the walk reached no record at all, when the deleted records'
 * copies would not expire, when keys stayed under an old root key, when erasures stayed open or the install counts were
 * not written (the night kept none of them), and for a day and two hours after a walk that threw, because the night
 * before it was still the last one kept. Each case is one test here, through `nightSaid`, and the two that live in the
 * cron are driven through the bundled Worker.
 *
 * AND A STRANGER READS NO COUNT: `records` and `backups` are how many people have a record here, so `/healthz` says
 * `reached` and the number stays in the Directory.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NIGHT_FRESH_MS, nightSaid, type Night } from '../src/health.ts';

const NOW = Date.parse('2026-10-09T06:00:00.000Z');
const WHOLE: Night = {
  at: '2026-10-09T03:04:00.000Z',
  records: 40,
  backups: 40,
  backups_failed: 0,
  directory: 'ok',
  expiry_failed: 0,
  stragglers: 0,
  erase_open: 0,
  counts_written: true,
};
const said = (night: Night) => nightSaid(night, NOW);

test('A WHOLE NIGHT RAN, and a stranger reads that it reached records, never how many', () => {
  assert.deepEqual(said(WHOLE), {
    at: WHOLE.at,
    reached: true,
    backups_failed: 0,
    expiry_failed: 0,
    stragglers: 0,
    erase_open: 0,
    counts_written: true,
    directory: 'ok',
    ran: true,
  });
  assert.equal(nightSaid(null, NOW), null, 'no night told yet is null, not a night that failed');
});

test('A WALK THAT REACHED NO RECORD DID NOT RUN, whatever else it says', () => {
  const out = said({ ...WHOLE, records: 0, backups: 0 });
  assert.deepEqual([out?.reached, out?.ran], [false, false]);
});

test('EXPIRY THAT FAILED, KEYS LEFT UNDER AN OLD ROOT KEY, OR ERASURES LEFT OPEN: the night did not run whole', () => {
  assert.equal(said({ ...WHOLE, expiry_failed: 1 })?.ran, false, 'a deleted record kept its copies past their day');
  assert.equal(said({ ...WHOLE, stragglers: 2 })?.ran, false, 'a record kept its keys under an old root key');
  assert.equal(said({ ...WHOLE, erase_open: 1 })?.ran, false, 'an erased file is still in the bucket');
});

test('COUNTS NOT WRITTEN IS A NIGHT THAT DID NOT RUN WHOLE; COUNTS NOT ASKED FOR ARE NOT A FAILURE', () => {
  assert.equal(said({ ...WHOLE, counts_written: false })?.ran, false);
  const { counts_written: _, ...uncounted } = WHOLE;
  const out = said(uncounted);
  assert.equal(out?.ran, true);
  assert.equal(out !== null && 'counts_written' in out, false, 'a walk that counted nothing says nothing about counts');
});

test('A NIGHT KEPT BY AN OLDER BUILD CANNOT SAY IT RAN WHOLE: what it does not carry is unknown, not 0', () => {
  const older: Night = { at: WHOLE.at, records: 40, backups: 40, backups_failed: 0, directory: 'ok' };
  assert.deepEqual(said(older), {
    at: WHOLE.at,
    reached: true,
    backups_failed: 0,
    expiry_failed: null,
    stragglers: null,
    erase_open: null,
    directory: 'ok',
    ran: false,
  });
});

test('A NIGHT THAT STOPPED DID NOT RUN, and says so at once, not a day later', () => {
  const stopped: Night = { at: '2026-10-09T03:01:00.000Z', records: 0, backups: 0, backups_failed: 0, directory: 'ok', stopped: true };
  const out = said(stopped);
  assert.deepEqual([out?.stopped, out?.ran], [true, false]);
  /* EVEN WITH EVERY OTHER FIELD WHOLE: a stopped walk is not a night, whatever its counts. */
  assert.equal(said({ ...WHOLE, stopped: true })?.ran, false);
});

test('A STALE NIGHT, OR ONE WHOSE TIME IS NOT A DATE, DID NOT RUN LAST NIGHT', () => {
  assert.equal(nightSaid(WHOLE, Date.parse(WHOLE.at) + NIGHT_FRESH_MS - 1)?.ran, true);
  assert.equal(nightSaid(WHOLE, Date.parse(WHOLE.at) + NIGHT_FRESH_MS)?.ran, false);
  assert.equal(said({ ...WHOLE, at: 'last night' })?.ran, false);
});

test('ONLY THE NAMED FIELDS GO OUT: whatever else the Directory kept stays there', () => {
  const kept = { ...WHOLE, why: 'rec_01J8ZC0000000000000000000X would not copy', host: 'brain.example.test' } as Night;
  const out = said(kept) as Record<string, unknown>;
  assert.deepEqual(Object.keys(out).sort(), ['at', 'backups_failed', 'counts_written', 'directory', 'erase_open', 'expiry_failed', 'ran', 'reached', 'stragglers']);
});

test('THE CRON: a whole night ran, then a walk that throws is kept as a night that stopped, and `ran` is false at once', async () => {
  const { cloud } = await import('./cloud-harness.ts');
  const c = await cloud();
  const kv = new Map<string, unknown>();
  Object.assign(c.dirStorage, { get: async (k: string) => kv.get(k), put: async (k: string, v: unknown) => void kv.set(k, v) });
  await c.provision('rec_01JZ8QK3F7R2M9V4XN6TCB5HAJ', 'nightly', 'ada@example.test');
  const scheduled = (c.bundle.default as unknown as { scheduled(c: object, env: object, ctx: object): Promise<void> }).scheduled;
  const quietly = async (fn: () => Promise<unknown>) => {
    const kept = [console.log, console.error];
    console.log = console.error = () => {};
    try {
      return await fn();
    } finally {
      [console.log, console.error] = kept as [typeof console.log, typeof console.error];
    }
  };
  const night = async () => ((await (await c.ask('/healthz')).json()) as { night: Record<string, unknown> }).night;

  await quietly(() => scheduled({}, c.env, { waitUntil: () => {} }));
  assert.equal((await night())['ran'], true, JSON.stringify(kv.get('ops-night')));

  /* THE DIRECTORY'S PAGE OF RECORDS THROWS, so the walk throws, after last night's `ran: true` was kept. */
  const directory = c.directory as unknown as Record<string, unknown>;
  const throwing = new Proxy(directory, {
    get: (target, key) => {
      if (key === 'listRecords') return async () => { throw new Error('the page of records would not come'); };
      const value = target[key as string];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  const env = { ...c.env, DIRECTORY: { idFromName: (n: string) => n, get: () => throwing } };
  await quietly(() => assert.rejects(scheduled({}, env, { waitUntil: () => {} }), /would not come/u));
  const after = await night();
  assert.deepEqual([after['stopped'], after['reached'], after['ran']], [true, false, false], JSON.stringify(after));
});
