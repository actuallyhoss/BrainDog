/**
 * A REPEATING LINE IS NEVER LEFT PAID AND UNMOVED (repeat-next-80b-82).
 *
 * Batch 80 gave `payment-matches` a second step that kept a payment on the repeating line it paid, "Last paid" and
 * "Last amount", and left "Next" where it was, since no run can be handed the day after. A line left so read late once
 * its day passed (`repeating-overdue` judges a line with "Last paid" by its "Next") and next month's payment, more
 * than ten days from the day the line still named, no longer found it.
 *
 * THE STEP IS HELD, AND THE SCRIPT WRITES BOTH OR NEITHER. Read here on a real record: the rule starts one script and
 * a line a payment fits is found, said and left whole; the script, handed the day the walk steps to (`cycleOn`), moves
 * "Next" and keeps the payment in one write, so the line is not late and next month's payment finds it; handed no
 * day it writes nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, firstPartyDocument, gbp } from '../src/index.ts';
import { MONEY_AUTOMATIONS, SETTLE_LINE_SCRIPT } from '../src/modules/money/rules.ts';
import { cycleOn } from '../src/modules/money/scripts/settle.js';

type Fields = Record<string, unknown>;
const OWNER = { actor: 'p_1' };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};
const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

type Ctx = { input: unknown; record: unknown; update: (spoken: string, patch: Fields, version: number) => void; log: (...words: string[]) => void };
type Run = (c: Ctx) => Promise<{ ask?: unknown } | null>;

/** 10 October 2026, nine days after the line's day: late, if anything had kept a payment on it and left the day. */
const TENTH = Date.UTC(2026, 9, 10, 12);
const LINE = { what: 'Northgate Estates', direction: 'out', amount: gbp(400_000), every: 'monthly', next_due: '2026-10-01', state: 'live' };

/** A record holding Money as its pack document says it, on a day of the test's choosing. */
async function money(now = TENTH) {
  const sql = openSqlite();
  const clock = fixedClock(now);
  const k = await openRecord(sql, clock);
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const made = (list: string, fields: Fields) => value<Entry>(k.create(list, fields, OWNER));
  const book = made('books', { name: 'Personal' }).id;
  const account = made('accounts', { name: 'Current', kind: 'bank', liquid: true, balance: gbp(1_000_000), as_of: '2026-10-01', book }).id;
  const paid = (on: string, amount = 400_000) => made('transactions', { what: 'NORTHGATE ESTATES', on, direction: 'out', amount: gbp(amount), account, book, state: 'cleared' });

  const log: string[] = [];
  const shaped = (e: Entry) => ({ id: e.id, register: e.register, seq: e.seq!, version: e.version, fields: e.fields });
  /** A script's text run as a plain module over the record, its writes kept for the caller to hand on or to make. */
  const ran = async (source: string, input: unknown) => {
    const writes: { op: 'update'; spoken: string; patch: Fields; version: number }[] = [];
    const ctx: Ctx = {
      input,
      record: {
        get: async (said: string) => {
          const e = k.get(said);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, where: where as never })).rows.map(shaped),
      },
      update: (spoken, patch, version) => void writes.push({ op: 'update', spoken, patch, version }),
      log: (...words) => void log.push(words.join(' ')),
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(source)}`)) as { default: Run };
    return { out: await mod.default(ctx), writes };
  };
  /** The rule's own runs: the schedule and then the outbox. */
  const turn = async (rounds = 4) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions((async () => {
        throw new Error('no call is taken here');
      }) as never, {
        script: (async (s: { scripted: { input: unknown; decl: { source: string } } }) => {
          const { out, writes } = await ran(s.scripted.decl.source, s.scripted.input);
          return { writes, log: log.join('\n'), usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) };
        }) as never,
        limit: 50,
      });
    }
  };
  /** The held script, started as a host that can work out the day would start it, and its writes made on the record. */
  const mark = async (payment: string, next?: string | null) => {
    const { out, writes } = await ran(SETTLE_LINE_SCRIPT.source, { payment, ...(next === undefined ? {} : { next }) });
    for (const w of writes) value(k.update('recurring', k.get(w.spoken)!.id, w.patch, OWNER));
    return { out, writes };
  };
  /* THE RUNS AFTER SET-UP: an outbox row stays, done, and the account made in its book above ran one (3.35.0, 24fd3a8d4). */
  let settledUp = 0;
  const queued = (): string[] => sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run' ORDER BY rowid").slice(settledUp).map((r) => (JSON.parse(r.payload) as { script: string }).script);
  const asked = (): string[] => sql.all<{ opened_by: string }>("SELECT opened_by FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => r.opened_by);
  /** `repeating-overdue` as Money declares it: how many matched lines are past their day, or no value. */
  const late = (): number | null => {
    const read = k.metric(METRICS['repeating-overdue'] as never);
    assert.ok(read.ok, sayOf(read));
    return (read.value as { value: number | null }).value;
  };
  /* THE ACCOUNT MADE IN ITS BOOK ABOVE RUNS `book_from_account` (3.35.0, 24fd3a8d4): done before a test reads what a payment starts. */
  await turn();
  settledUp = sql.all<{ n: number }>("SELECT rowid AS n FROM outbox WHERE kind = 'script.run'").length;
  log.length = 0;
  return { k, clock, made, paid, turn, mark, queued, asked, late, log };
}

const RULE = MONEY_AUTOMATIONS.find((a) => a.rule === 'payment-matches') as { steps: { script: { id: string } }[] } | undefined;
const fieldsOf = (k: Kernel, id: string) => k.get(id)!.fields;

test('a line a payment fits is found and said, and nothing on it is written: it is not read late, and no "Last paid" stands beside an unmoved "Next"', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  const before = m.k.get(line.id)!.version;
  m.paid('2026-09-28');
  await m.k.drain();
  /* AND `replace_posted` SINCE money-core 3.31.0: every cleared line asks whether it is the real charge for one posted. */
  assert.deepEqual(m.queued(), ['match_payment', 'settle_matched_line', 'replace_posted']);
  await m.turn();
  const f = fieldsOf(m.k, line.id);
  assert.deepEqual([f.next_due, f.last_paid ?? null, f.last_amount ?? null, m.k.get(line.id)!.version], ['2026-10-01', null, null, before], m.log.join(' | '));
  assert.ok(m.log.some((l) => l.includes('This payment is for Northgate Estates, due 1 October.')), m.log.join(' | '));
  /* NINE DAYS PAST ITS DAY AND NOT COUNTED LATE: the sign judges a line a payment was kept on, and none was. WHAT IS
     LEFT IS THE ONE QUESTION A LINE PAST ITS DAY WAS ALWAYS ASKED, `recurring-missed`, once for that day. */
  assert.equal(m.late(), null);
  assert.deepEqual(m.asked(), ['rule:recurring-missed']);
});

test('and next month\'s payment still finds it, once its day is moved', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  m.paid('2026-09-28');
  await m.turn();
  value(m.k.update('recurring', line.id, { next_due: '2026-11-01' }, OWNER));
  m.log.length = 0;
  m.paid('2026-10-30');
  await m.turn();
  assert.ok(m.log.some((l) => l.includes('This payment is for Northgate Estates, due 1 November.')), m.log.join(' | '));
  assert.equal(m.late(), null);
});

test('what batch 80 wrote is the harm: "Last paid" with "Next" left reads late, and next month\'s payment finds nothing', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  value(m.k.update('recurring', line.id, { last_paid: '2026-09-28', last_amount: gbp(400_000) }, OWNER));
  assert.equal(m.late(), 1);
  m.paid('2026-10-30');
  await m.turn();
  assert.ok(m.log.some((l) => l.includes('Nothing open to NORTHGATE ESTATES falls within ten days of 30 October')), m.log.join(' | '));
});

test('handed no day, a day that is not one, or a day no later than the line\'s, the script writes nothing', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  const pay = m.paid('2026-09-28');
  await m.turn();
  for (const next of [undefined, null, '', 'next month', '2026-10-01', '2026-09-01']) {
    const got = await m.mark(pay.id, next as never);
    assert.deepEqual(got.writes, [], `handed ${String(next)}`);
  }
  const f = fieldsOf(m.k, line.id);
  assert.deepEqual([f.next_due, f.last_paid ?? null], ['2026-10-01', null]);
  assert.ok(m.log.some((l) => l === 'This repeating line was handed no day to move to, so nothing on it changed.'), m.log.join(' | '));
});

test('a bill is still marked by its link alone, and the held script says nothing for it', async () => {
  const m = await money();
  const bill = m.made('obligations', { what: 'Northgate Estates', direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open' });
  const pay = m.paid('2026-09-28');
  await m.turn();
  assert.deepEqual([fieldsOf(m.k, pay.id).settles, fieldsOf(m.k, bill.id).state], [bill.id, 'paid'], m.log.join(' | '));
  m.log.length = 0;
  assert.deepEqual((await m.mark(pay.id, '2026-11-01')).writes, []);
  assert.deepEqual(m.log, []);
});
