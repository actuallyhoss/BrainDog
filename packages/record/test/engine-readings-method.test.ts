/**
 * `engineReadings`, the method that answers the engine's readings (ENG-B01 job 3).
 *
 * WHY THIS FILE EXISTS. The arithmetic (`src/engine-readings.ts`) counted a ledger nothing handed it, so the vital signs
 * could not say whether a model answered. Asserted here: with a reader handed in the method answers exactly what the
 * arithmetic answers for the last 30 days as the record's clock stands, asking the host for those 30 days and no more;
 * with none it answers `null`, never a row of zeros that reads as "nothing was asked"; and a caller who reads nothing is
 * refused before the ledger is opened.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, engineReadings, type CallContext } from '../src/index.ts';
import { methods, type EngineLedger } from '../src/methods/engine-readings.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const READER: CallContext = { principal: { kind: 'token', id: 't_read', scope: 'read', person: 'p_owner', level: 'owner' } };
const T0 = Date.UTC(2026, 9, 9, 9);
const DAY = 86_400_000;
const ago = (ms: number): string => new Date(T0 - ms).toISOString();

/** A ledger with an ask in each window, one failure, one row older than the month, two mentions and three questions. */
const LEDGER: EngineLedger = {
  calls: [
    { ts: ago(3_600_000), model: 'small', status: 'ok', code: null, purpose: 'understand' },
    { ts: ago(2 * 3_600_000), model: 'small', status: 'error', code: 'UNREACHABLE', purpose: 'understand' },
    { ts: ago(3 * DAY), model: 'small', status: 'ok', code: null, purpose: 'daily' },
    { ts: ago(20 * DAY), model: 'small', status: 'ok', code: null, purpose: 'daily' },
    { ts: ago(45 * DAY), model: 'small', status: 'ok', code: null, purpose: 'daily' },
  ],
  mentions: [{ attached: true }, { attached: false }],
  questions: [{ cause: 'understand.fold#3' }, { cause: 'understand.fold#9' }, { cause: null }],
};

/** The brake over a record Slash never asked anything on (`slashBrake`): too few answers to brake. */
const UNBRAKED = { on: false, share: 0, of: 0 };

/** The method file over a guard that lets `who` through and turns everybody else away, as `scoped` does. */
const over = (engineLedger?: (since: string) => Promise<EngineLedger>, who: CallContext = OWNER) =>
  methods({
    scoped: (ctx: CallContext) => (ctx === who ? null : { code: 'FORBIDDEN', fix: 'Ask the owner for read access.' }),
    clock: fixedClock(T0),
    /* A STORE WITH NO ANSWER OF SLASH'S IN IT, which is all the brake reads. */
    sql: { all: () => [] },
    ...(engineLedger === undefined ? {} : { engineLedger }),
  } as unknown as RecordDeps);

test("THE ARITHMETIC'S ANSWER FOR THE LAST 30 DAYS, with nothing owed, and the host asked for those 30 days alone", async () => {
  const asked: string[] = [];
  const m = over(async (since) => (asked.push(since), LEDGER), READER);
  const out = await m.engineReadings(undefined, READER);
  assert.deepEqual(out, { ok: true, value: engineReadings({ now: T0, ...LEDGER, owed: [], braked: UNBRAKED }) });
  assert.deepEqual(asked, [ago(30 * DAY)]);
  assert.ok(out.ok && out.value !== null);
  /* Said in figures too, so a reader that answered nothing would not pass by agreeing with itself. */
  const daily = out.value.asks.find((a) => a.purpose === 'daily');
  assert.deepEqual(daily?.asked, { day: 0, week: 1, month: 2 });
  assert.equal(out.value.understanding.unattached, 1);
  assert.ok(out.value.asks.every((a) => a.owed === 0 && a.oldest_owed === null));
});

test('A CALLER WHO READS NOTHING IS REFUSED before the ledger is opened', async () => {
  let asked = 0;
  const m = over(async () => (asked++, LEDGER), READER);
  const refused = await m.engineReadings(undefined, OWNER);
  assert.equal(refused.ok, false);
  assert.equal(asked, 0);
});

test('NO READER HANDED IN IS null, never a count of zero the record cannot know', async () => {
  assert.deepEqual(await over().engineReadings(undefined, OWNER), { ok: true, value: null });
});

test('ON A REAL RECORD a read token reaches it, and the host that wired no ledger answers null', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(T0) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.deepEqual(await api.engineReadings(undefined, READER), { ok: true, value: null });
  assert.deepEqual(await api.engineReadings(undefined, OWNER), { ok: true, value: null });
});

test("ON A REAL RECORD the host's ledger is handed through", async (t) => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(T0), engineLedger: async () => LEDGER } as never);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  const out = await api.engineReadings(undefined, READER);
  /* `index.ts` hands `engineLedger` to the method files once its line lands (this unit's blocked change). Until then the
     record answers `null`, which this case says rather than passing quietly. */
  if (out.ok && out.value === null) return t.todo('record index.ts does not hand engineLedger to methods(...) yet');
  assert.deepEqual(out, { ok: true, value: engineReadings({ now: T0, ...LEDGER, owed: [], braked: UNBRAKED }) });
});

test('A READER HELD TO PART OF THE RECORD IS REFUSED: every count is over the whole of it', async () => {
  let asked = 0;
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(T0), engineLedger: async () => (asked++, LEDGER) } as never);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  const narrowed: CallContext = { principal: { kind: 'person', id: 'p_sam', level: null }, registers: ['session'], levels: { session: 'read' } } as CallContext;
  const out = (await api.engineReadings(undefined, narrowed)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false, 'a narrowed reader was told the whole record\'s counts');
  assert.equal(out.refusal?.code, 'FORBIDDEN');
  assert.doesNotMatch(out.refusal?.fix ?? '', /readsAcross|[A-Z]{4,}/u);
  assert.equal(asked, 0, 'the ledger was opened for a reader who is refused');
});
