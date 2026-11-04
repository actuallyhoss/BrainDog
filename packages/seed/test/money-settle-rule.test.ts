/**
 * What starts `script.settle` (the rule): a Ledger entry that names a bill in "Settles".
 *
 * `money-settle.test.ts` MEASURES THE DECISION AND THE SCRIPT, HANDED THEIR INPUT BY THE TEST. This measures who hands
 * it on a record: Money's own rule (`payment-settles` in `MONEY_AUTOMATIONS`), installed from Money's pack document,
 * started by the write, and the script's declared `source` run as a host's sandbox runs it, the way
 * `follow-ups.test.ts` runs Work's. So "Paid so far" is filled by the record here and by no hand, once the script reads
 * the ids the rule hands (the last test).
 *
 * RED FIRST: with `SETTLE_SCRIPT` in no pack document there is no `script.settle` on the record and no rule, so a
 * payment that names its bill queues nothing and the bill stays open with no "Paid so far".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';
import { SETTLE_SCRIPT } from '../src/modules/money/scripts/settle.js';

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

type Queued = { script: string; input: Fields };

/** A record holding Money as its pack document says it, and a sandbox that runs a queued script's declared source. */
async function money() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const made = (list: string, fields: Fields) => value<Entry>(k.create(list, fields, OWNER));
  const book = made('books', { name: 'Personal' }).id;
  const account = made('accounts', { name: 'Current', kind: 'bank', liquid: true, balance: gbp(1_000_000), as_of: '2026-10-01', book }).id;
  const paid = (amount: number, on: string, more: Fields = {}) => made('transactions', { what: 'NORTHGATE ESTATES', on, direction: 'out', amount: gbp(amount), account, book, state: 'cleared', ...more });
  const bill = (more: Fields = {}) => made('obligations', { what: 'Studio rent', direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open', ...more });

  const log: string[] = [];
  /** As the host's `ctx.record` reads: one thing by its handle or its id, with the list it is in, and a list by one field. */
  const shaped = (e: Entry) => ({ id: e.id, register: e.register, seq: e.seq!, version: e.version, fields: e.fields });
  const sandbox = async (s: Scripted): Promise<ScriptAnswer> => {
    const writes: { op: 'update'; spoken: string; patch: unknown; version: number }[] = [];
    const ctx = {
      input: s.scripted.input,
      record: {
        get: async (said: string) => {
          const e = k.get(said);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, where: where as never })).rows.map(shaped),
      },
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: (...words: string[]) => void log.push(words.join(' ')),
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    await mod.default(ctx);
    return { writes: writes as never, log: log.join('\n'), usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 } };
  };
  const execute = (async () => {
    throw new Error('no call is taken here');
  }) as never;
  /** The schedule and then the outbox: how a run reaches its steps, and a script its sandbox. */
  const turn = async (rounds = 2) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions(execute, { script: sandbox, limit: 50 });
    }
  };
  /* THE RUNS AFTER SET-UP: an outbox row stays, done, and the account made in its book above ran one (3.35.0, 24fd3a8d4). */
  let settledUp = 0;
  const queued = (): Queued[] => sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run' ORDER BY rowid").slice(settledUp).map((r) => JSON.parse(r.payload) as Queued);
  /* THE ACCOUNT MADE IN ITS BOOK ABOVE RUNS `book_from_account` (3.35.0, 24fd3a8d4): done before a test reads what a payment starts. */
  await turn();
  settledUp = sql.all<{ n: number }>("SELECT rowid AS n FROM outbox WHERE kind = 'script.run'").length;
  log.length = 0;
  return { k, paid, bill, turn, queued, log };
}

/** What a test reads of a bill: its status, "Paid so far" and "Paid on", an empty one as `null`. */
const read = (k: Kernel, id: string) => {
  const f = k.get(id)!.fields;
  return [f.state, f.paid_so_far ?? null, f.settled ?? null];
};

const RULE = MONEY_AUTOMATIONS.find((a) => a.rule === 'payment-settles') as { on: Fields; when: string; steps: { script: { id: string; input: Fields } }[] } | undefined;

/** The three tests at the foot of this file stand on the rule starting whatever a payment's status (`settles is set` alone, batch 62). */
const WIDE = {};

test('the script and the rule that starts it are Money\'s own, and go into its pack document together', () => {
  assert.ok(MONEY_AUTOMATIONS.includes(SETTLE_SCRIPT), 'the script is in no pack document');
  assert.ok(RULE, 'no rule starts the script');
  /* ONLY A WRITE TO "Settles" OR TO THE STATUS, so an edit to a payment's words starts nothing. */
  assert.deepEqual(RULE.on, { written: { register: 'transactions', op: ['create', 'update'], fields: ['settles', 'state'] } });
  /* WHATEVER ITS STATUS (batch 62), so a payment made void starts the count that reopens its bill. */
  assert.equal(RULE.when, 'settles is set');
  assert.equal(RULE.steps[0]!.script.id, SETTLE_SCRIPT.script);
  /* A BILL HAS NO NEXT DAY, so none is handed: `next` is a repeating line's, and nothing links a payment to one yet. */
  assert.deepEqual(Object.keys(RULE.steps[0]!.script.input), ['payment', 'item']);
});

test('a Ledger entry written with its bill in Settles starts the script once, handed the payment and the bill', async () => {
  const m = await money();
  const theBill = m.bill();
  const pay = m.paid(150_000, '2026-09-28', { settles: theBill.id });
  await m.k.drain();
  /* `settle` ONCE; BESIDE IT SINCE money-core 3.31.0, the check every cleared line starts for a line posted for it. */
  assert.deepEqual(m.queued().filter((q) => q.script === 'settle'), [{ script: 'settle', version: 1, input: { id: pay.id, register: 'transactions', seq: pay.seq, payment: pay.id, item: theBill.id } }]);
  assert.deepEqual(m.queued().map((q) => q.script), ['settle', 'replace_posted']);
});

test('an entry that gains Settles later starts it then, and an edit to its words starts nothing more', async () => {
  const m = await money();
  const theBill = m.bill();
  const pay = m.paid(150_000, '2026-09-28');
  await m.turn();
  /* `settle` ALONE IS COUNTED: since match-payment-78 a cleared payment that names no bill starts the search for one
     (`payment-matches`, measured in `money-match-rule.test.ts`), which finds none here, the bill being named otherwise. */
  const settles = () => m.queued().filter((q) => q.script === 'settle');
  assert.deepEqual(settles(), [], 'a payment that names no bill started the script');
  value(m.k.update('transactions', pay.id, { settles: theBill.id }, OWNER));
  await m.turn();
  assert.equal(settles().length, 1);
  value(m.k.update('transactions', pay.id, { what: 'NORTHGATE ESTATES LTD' }, OWNER));
  await m.turn();
  assert.equal(settles().length, 1, 'an edit to the words started the script again');
});

test('money that has not cleared pays nothing, and pays the day it clears', async () => {
  const m = await money();
  const theBill = m.bill();
  const pay = m.paid(150_000, '2026-09-28', { settles: theBill.id, state: 'pending' });
  await m.turn();
  /* WHETHER THE RULE WAITS FOR THE MONEY OR THE SCRIPT DOES, the bill is what says nothing was paid. */
  const waiting = m.k.get(theBill.id)!;
  assert.deepEqual([waiting.fields.state, waiting.fields.paid_so_far, waiting.version], ['open', undefined, theBill.version], m.log.join(' '));
  value(m.k.update('transactions', pay.id, { state: 'cleared' }, OWNER));
  await m.turn();
  const f = m.k.get(theBill.id)!.fields;
  assert.deepEqual([f.state, f.paid_so_far], ['part', gbp(150_000)], m.log.join(' '));
});

/**
 * THE END OF THE CHAIN. The rule hands the entry and its bill by their ids, the only name a step can fill in, and
 * `run` in `scripts/settle.js` reads a thing by its id as well as by its handle (batch 60): before that it logged "The
 * script was handed no payment" and the bill stayed open.
 */
test('a bill paid short stays part paid with the sum, and the payment that reaches the amount closes it', async () => {
  const m = await money();
  const theBill = m.bill();
  m.paid(150_000, '2026-09-28', { settles: theBill.id });
  await m.turn();
  const short = m.k.get(theBill.id)!.fields;
  assert.deepEqual([short.state, short.paid_so_far, short.settled], ['part', gbp(150_000), undefined], m.log.join(' '));
  /* AND THE POSTED-LINE CHECK'S ONE LINE, SINCE money-core 3.31.0: no line posted for this payment. */
  /* THE POSTED-LINE CHECK SAYS NOTHING when no line posted for you is the same money: an ordinary payment leaves no note. */
  assert.deepEqual(m.log, ['Studio rent is part paid: GBP 1,500 of GBP 4,000.']);

  m.paid(250_000, '2026-10-02', { settles: theBill.id });
  await m.turn();
  const closed = m.k.get(theBill.id)!.fields;
  assert.deepEqual([closed.state, closed.settled, closed.paid_so_far], ['paid', '2026-10-02', gbp(400_000)]);
});

/**
 * THE SUM LEAVES OUT MONEY THAT HAS NOT MOVED. The rule starts nothing for a pending entry, and `run` in
 * `scripts/settle.js` counts cleared entries alone: summing every entry that named the bill, GBP 1,500 cleared beside
 * GBP 1,500 pending and GBP 1,000 void marked a GBP 4,000 bill paid in full.
 */
test('a pending or void entry that names the same bill is not counted as paid', async () => {
  const m = await money();
  const theBill = m.bill();
  m.paid(150_000, '2026-09-27', { settles: theBill.id, state: 'pending' });
  m.paid(100_000, '2026-09-27', { settles: theBill.id, state: 'void' });
  m.paid(150_000, '2026-09-28', { settles: theBill.id });
  await m.turn();
  const f = m.k.get(theBill.id)!.fields;
  assert.deepEqual([f.state, f.paid_so_far, f.settled], ['part', gbp(150_000), undefined], m.log.join(' '));
});

/**
 * PAID IS WHAT A PAYMENT DID, SO A PAYMENT TAKEN BACK UNPAYS (batch 62). Measured before: a bill closed by one cleared
 * payment stayed paid, with its day and its sum, after that payment was made void, because the rule started nothing
 * for a void entry and the script changed nothing on a bill that was not open.
 */
test('a bill its one payment paid is open again when that payment is made void', WIDE, async () => {
  const m = await money();
  const theBill = m.bill();
  const pay = m.paid(400_000, '2026-10-01', { settles: theBill.id });
  await m.turn();
  assert.deepEqual(read(m.k, theBill.id), ['paid', gbp(400_000), '2026-10-01'], m.log.join(' '));

  value(m.k.update('transactions', pay.id, { state: 'void' }, OWNER));
  await m.turn();
  assert.deepEqual(read(m.k, theBill.id), ['open', null, null], m.log.join(' '));
  assert.equal(m.log.at(-1), 'Studio rent is open again, since its payment was made void.');
});

test('a bill two payments paid reads the other payment\'s sum when one is made void', WIDE, async () => {
  const m = await money();
  const theBill = m.bill();
  m.paid(150_000, '2026-09-28', { settles: theBill.id });
  await m.turn();
  const second = m.paid(250_000, '2026-10-02', { settles: theBill.id });
  await m.turn();
  assert.deepEqual(read(m.k, theBill.id), ['paid', gbp(400_000), '2026-10-02'], m.log.join(' '));

  value(m.k.update('transactions', second.id, { state: 'void' }, OWNER));
  await m.turn();
  assert.deepEqual(read(m.k, theBill.id), ['part', gbp(150_000), null], m.log.join(' '));
  assert.equal(m.log.at(-1), 'Studio rent is part paid, GBP 1,500 of GBP 4,000, since one of its payments was made void.');
});

test('started twice for one void payment, the script writes the bill once', WIDE, async () => {
  const m = await money();
  const theBill = m.bill();
  const pay = m.paid(400_000, '2026-10-01', { settles: theBill.id });
  await m.turn();
  value(m.k.update('transactions', pay.id, { state: 'void' }, OWNER));
  await m.turn();
  const once = m.k.get(theBill.id)!.version;
  /* A SECOND WRITE TO THE STATUS starts the rule again: pending is not cleared either, and the bill is as it was left. */
  value(m.k.update('transactions', pay.id, { state: 'pending' }, OWNER));
  await m.turn();
  value(m.k.update('transactions', pay.id, { state: 'void' }, OWNER));
  await m.turn();
  assert.equal(m.k.get(theBill.id)!.version, once, m.log.join(' '));
  assert.deepEqual(read(m.k, theBill.id), ['open', null, null]);
});
