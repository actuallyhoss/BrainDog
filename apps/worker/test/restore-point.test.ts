/**
 * A deploy's restore point (LCH-C06 jobs 3 and 4): `src/restore-point.ts`'s walk, the `before-deploy` label's seven days
 * in `copies.ts`, and `/account/ops/restore-point` through the Worker as it ships (`cloud-harness.ts`).
 *
 * WHAT THIS HOLDS. Check mode opens every record somebody wrote in the last seven days and copies nothing; a real run
 * copies exactly those, under the commit; a record that cannot be opened is a `failed`, a 500, and the walk goes on;
 * the door answers counts and never a record's id; and nothing but the operator key opens it, a session cookie included.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BEFORE_DEPLOY_KEPT, cloudSnapshots } from '../src/copies.ts';
import { labelOf, readAsk, restorePoint, sayTally, type PointAnswer, type RecordPage } from '../src/restore-point.ts';
import { prefixOf, type Dump } from '../src/snapshots.ts';
import { bucket, cloud, recordStorage } from './cloud-harness.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;

/** A Directory of `ids`, paged `size` at a time, its cursor the last id of a full page as `listRecords` answers. */
const pages =
  (ids: string[], size: number) =>
  async (cursor?: string): Promise<RecordPage> => {
    const from = cursor === undefined ? 0 : ids.indexOf(cursor) + 1;
    const page = ids.slice(from, from + size);
    return page.length === size ? { ids: page, cursor: page.at(-1) } : { ids: page };
  };

test('THE LABEL AND THE BODY: the commit\'s first seven characters, and a sentence for anything else', () => {
  assert.equal(labelOf('1A2B3C4D5E6F'.toLowerCase()), 'before-deploy-1a2b3c4');
  assert.equal(labelOf(undefined), 'before-deploy');
  assert.deepEqual(readAsk({ commit: 'ABCDEF1234', check: true }), { ok: true, value: { check: true, commit: 'abcdef1234' } });
  assert.deepEqual(readAsk({}), { ok: true, value: { check: false } });
  for (const [body, at] of [[null, 'body'], [[], 'body'], [{ commit: 'main' }, 'commit'], [{ commit: 'abc' }, 'commit'], [{ check: 'yes' }, 'check'], [{ cursor: '' }, 'cursor']] as const) {
    const out = readAsk(body);
    assert.equal(out.ok, false, JSON.stringify(body));
    if (!out.ok) {
      assert.equal(out.at, at);
      assert.doesNotMatch(out.fix, /—/u, 'no em dash in a sentence a person reads');
    }
  }
});

test('CHECK OPENS THE RECORDS WRITTEN IN SEVEN DAYS AND COPIES NOTHING; A REAL RUN COPIES EXACTLY THOSE', async () => {
  const written = new Set(['r1', 'r3']);
  const asked: { record: string; since: string; label: string; check: boolean }[] = [];
  const point = async (record: string, ask: { since: string; label: string; check: boolean }): Promise<PointAnswer> => {
    asked.push({ record, ...ask });
    if (!written.has(record)) return { written: false };
    return ask.check ? { written: true } : { written: true, copied: `${ask.label}-2026-10-09` };
  };
  const deps = { records: pages(['r1', 'r2', 'r3', 'r4'], 500), point, now: () => NOW };

  const checked = await restorePoint(deps, { check: true, commit: 'abcdef1' });
  assert.deepEqual(checked, { mode: 'check', label: 'before-deploy-abcdef1', asked: 4, records: 2, opened: 2, copied: 0, failed: 0 });
  assert.ok(asked.every((a) => a.check), 'check mode asked a record to copy');
  assert.equal(asked[0]?.since, new Date(NOW - 7 * DAY).toISOString(), 'seven days back from now');
  assert.match(sayTally(checked), /^Checked: 2 records written in the last 7 days, 2 opened, 0 failed, nothing copied\.$/u);

  asked.length = 0;
  const taken = await restorePoint(deps, { check: false, commit: 'abcdef1' });
  assert.deepEqual(taken, { mode: 'take', label: 'before-deploy-abcdef1', asked: 4, records: 2, opened: 2, copied: 2, failed: 0 });
  assert.ok(asked.every((a) => !a.check && a.label === 'before-deploy-abcdef1'));
});

test('A RECORD THAT THROWS IS ONE FAILED, SAID WITH ITS REASON, AND THE WALK GOES ON', async () => {
  const lines: string[] = [];
  const out = await restorePoint(
    {
      records: pages(['r1', 'r2', 'r3'], 500),
      point: async (record) => {
        if (record === 'r2') throw new Error('This build cannot open the record.');
        return { written: true };
      },
      failed: (record, why) => lines.push(`${record}: ${why}`),
      now: () => NOW,
    },
    { check: true },
  );
  assert.equal(out.failed, 1);
  assert.equal(out.opened, 2, 'the records after the broken one were not asked');
  assert.deepEqual(lines, ['r2: This build cannot open the record.']);
});

test('PAGED: a spent budget answers a cursor at a page\'s end, and asking again with it finishes the walk', async () => {
  const ids = Array.from({ length: 10 }, (_, i) => `r${String(i).padStart(2, '0')}`);
  let clock = NOW;
  const seen: string[] = [];
  const deps = {
    records: pages(ids, 4),
    point: async (record: string): Promise<PointAnswer> => (seen.push(record), { written: true }),
    now: () => (clock += 1_000),
    budgetMs: 500,
  };
  const first = await restorePoint(deps, { check: true });
  assert.equal(first.cursor, 'r03');
  assert.equal(first.asked, 4);
  assert.match(sayTally(first), /More to walk\.$/u);
  let cursor: string | undefined = first.cursor;
  while (cursor !== undefined) cursor = (await restorePoint(deps, { check: true, cursor })).cursor;
  assert.deepEqual(seen, ids, 'every record asked once, in order');
});

test('A CURSOR THAT DOES NOT MOVE ENDS THE WALK, so a Directory answering one page twice cannot hold the request', async () => {
  let calls = 0;
  const out = await restorePoint(
    { records: async () => (calls++, { ids: ['r1'], cursor: 'r1' }), point: async () => ({ written: false }), now: () => NOW },
    { check: true },
  );
  assert.equal(calls, 2);
  assert.equal(out.cursor, undefined);
});

test('COPIES: a before-deploy copy is kept seven days and is never among the thirty a hand-taken copy shares', async () => {
  const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
  const blobs = bucket();
  let clock = NOW;
  const dump = async (at: string, bookmark: string | undefined): Promise<Dump> => ({ text: '{}\n', rows: 1, at, ...(bookmark ? { bookmark } : {}) });
  const port = cloudSnapshots(blobs as never, recordStorage(), dump, { record: REC, now: () => clock });
  await port.take('before-deploy-abcdef1');
  await port.take('now');
  clock += 6 * DAY;
  await port.take('before-deploy-1234567');
  assert.equal(blobs.keys(prefixOf(REC)).length, 3, 'a copy six days old went');
  clock += 2 * DAY;
  /* EIGHT DAYS ON, the next copy of any label prunes the first restore point and keeps the second and the hand-taken one. */
  await port.take('now');
  const left = (await port.list()).map((c) => c.id).sort();
  assert.deepEqual(left, ['before-deploy-1234567-2026-10-15', 'now-2026-10-09', 'now-2026-10-17']);
  assert.ok(BEFORE_DEPLOY_KEPT === 7 * DAY);
});

const OPERATOR = 'an-operator-key-for-these-tests-only-0123456789';
const USED = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HA1';
const IDLE = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HA2';

/** Two records, one written by its owner today and one whose every row is a month old. */
async function fleet(extra: Record<string, unknown> = {}) {
  const c = await cloud({ PROVISION_KEY: OPERATOR, ...extra });
  await c.provision(USED, 'studio', 'ada@example.test');
  await c.provision(IDLE, 'attic', 'bo@example.test');
  c.storages.get(IDLE)?.sql.exec('UPDATE event SET ts = ?', new Date(Date.now() - 30 * DAY).toISOString() as never);
  const door = async (body: unknown, auth: { bearer?: string; cookie?: string } = { bearer: OPERATOR }) => {
    const res = await c.ask('/account/ops/restore-point', { method: 'POST', body: JSON.stringify(body), ...auth });
    return { status: res.status, out: (await res.json()) as { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string } } };
  };
  return { ...c, door };
}

test('THE DOOR: check opens the record in use and copies nothing; a real run copies it under the commit', async () => {
  const c = await fleet();
  /* EVERY ROW OF BOTH RECORDS, so check mode writing anywhere in a record, an event included, is seen. */
  const rows = (id: string): string => {
    const sql = c.storages.get(id)?.sql;
    const tables = (sql?.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").toArray() ?? []) as { name: string }[];
    return JSON.stringify(tables.map(({ name }) => [name, sql?.exec(`SELECT * FROM "${name}"`).toArray()]));
  };
  /* OPENED ONCE FIRST, so what a first open writes is not taken for what check mode wrote. */
  await c.door({ check: true });
  const before = c.blobs.keys().length;
  const stored = [rows(USED), rows(IDLE)];
  const checked = await c.door({ check: true, commit: 'abcdef1234' });
  assert.equal(checked.status, 200, JSON.stringify(checked.out));
  assert.equal(checked.out.value?.['records'], 1, 'the idle record counted, or the used one did not');
  assert.equal(checked.out.value?.['opened'], 1);
  assert.equal(checked.out.value?.['copied'], 0);
  assert.equal(c.blobs.keys().length, before, 'check mode wrote to the bucket');
  assert.deepEqual([rows(USED), rows(IDLE)], stored, 'check mode wrote to a record');

  const taken = await c.door({ commit: 'abcdef1234' });
  assert.equal(taken.status, 200, JSON.stringify(taken.out));
  assert.equal(taken.out.value?.['copied'], 1);
  assert.match(String(taken.out.value?.['said']), /^Restore point before-deploy-abcdef1: 1 record written in the last 7 days, 1 copied, 0 failed\.$/u);
  assert.ok(c.blobs.keys(prefixOf(USED)).some((k) => k.includes('/before-deploy-abcdef1-')), 'no copy under the commit');
  assert.equal(c.blobs.keys(prefixOf(IDLE)).length, 0, 'the idle record was copied');
  const said = JSON.stringify([checked.out, taken.out]);
  for (const id of [USED, IDLE, 'studio', 'attic']) assert.ok(!said.includes(id), `the answer names ${id}`);
});

test('THE DOOR: a record this build cannot open is a failed and a 500', async () => {
  const c = await fleet();
  const broken = c.record(USED) as unknown as { restorePoint: () => Promise<never> };
  broken.restorePoint = async () => {
    throw new Error('This build cannot open the record.');
  };
  const out = await c.door({ check: true });
  assert.equal(out.status, 500);
  assert.equal(out.out.ok, false);
  assert.equal(out.out.value?.['failed'], 1);
});

test('THE DOOR: only the operator key opens it; a session cookie, another key and none are refused', async () => {
  const c = await fleet();
  const cookie = await c.signIn('ada@example.test');
  assert.equal((await c.door({ check: true }, { cookie })).status, 401);
  assert.equal((await c.door({ check: true }, { bearer: 'not-the-operator-key-but-just-as-long-0123456789' })).status, 401);
  assert.equal((await c.door({ check: true }, {})).status, 401);
  assert.equal((await c.door({ commit: 'main' })).status, 400);
  const get = await c.ask('/account/ops/restore-point', { bearer: OPERATOR });
  assert.equal(get.status, 405);
  const none = await cloud();
  assert.equal((await none.ask('/account/ops/restore-point', { method: 'POST', body: '{}', bearer: OPERATOR })).status, 404, 'a host with no operator key has the door');
});
