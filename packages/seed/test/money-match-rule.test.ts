/**
 * What starts `script.match_payment` (the rules): a cleared Ledger entry that settles nothing.
 *
 * `money-match-payment.test.ts` MEASURES THE DECISION AND THE SCRIPT, HANDED THEIR INPUT BY THE TEST. This measures the
 * chain on a record, as `money-settle-rule.test.ts` does for `settle`: Money's own rules installed from its pack
 * document, started by the write, and each script's declared `source` run as a host's sandbox runs it. So a payment
 * typed with nothing in "Settles" ends with its bill paid, or its instalment paid, by no hand.
 *
 * RED FIRST: with `payment-matches` out of `MONEY_AUTOMATIONS` a cleared payment queues nothing and its bill stays open.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';
import { MATCH_PAYMENT_SCRIPT } from '../src/modules/money/scripts/match-payment.js';

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
type Asked = { id: string; cause: string | null; opened_by: string; body: string };

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
  const bill = (more: Fields = {}) => made('obligations', { what: 'Northgate Estates', direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open', ...more });

  const log: string[] = [];
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
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<{ ask?: unknown } | null> };
    const out = await mod.default(ctx);
    return { writes: writes as never, log: log.join('\n'), usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) } as never;
  };
  const execute = (async () => {
    throw new Error('no call is taken here');
  }) as never;
  /** The schedule and then the outbox, enough rounds for a link written by one script to start the next. */
  const turn = async (rounds = 4) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions(execute, { script: sandbox, limit: 50 });
    }
  };
  const queued = (): Queued[] => sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run' ORDER BY rowid").map((r) => JSON.parse(r.payload) as Queued);
  const asked = (): Asked[] => sql.all<Asked>("SELECT id, cause, opened_by, body FROM suggestion WHERE status = 'open' ORDER BY rowid");
  /* THE ACCOUNT MADE IN ITS BOOK ABOVE RUNS `book_from_account` (3.35.0, 24fd3a8d4): done before a test reads what a payment starts. */
  await turn();
  log.length = 0;
  return { k, made, paid, bill, turn, queued, asked, log };
}

const RULE = MONEY_AUTOMATIONS.find((a) => a.rule === 'payment-matches') as { on: Fields; when: string; steps: { script: { id: string; input: Fields } }[] } | undefined;

test('the script and the rule that starts it are Money\'s own, and go into its pack document together', () => {
  assert.ok(MONEY_AUTOMATIONS.includes(MATCH_PAYMENT_SCRIPT), 'the script is in no pack document');
  assert.ok(RULE, 'no rule starts the script');
  assert.deepEqual(RULE.on, { written: { register: 'transactions', op: ['create', 'update'], fields: ['state', 'settles'] } });
  assert.equal(RULE.when, 'state is cleared, settles is empty');
  assert.equal(RULE.steps[0]!.script.id, MATCH_PAYMENT_SCRIPT.script);
});

test('a cleared payment that names nothing is linked to the one bill it paid, and the bill is marked paid', async () => {
  const m = await money();
  const theBill = m.bill();
  const pay = m.paid(400_000, '2026-09-28');
  await m.k.drain();
  /* AND `replace_posted` SINCE money-core 3.31.0: every cleared line asks whether it is the real charge for one posted. */
  assert.deepEqual(m.queued().map((q) => q.script), ['match_payment', 'settle_matched_line', 'replace_posted']);
  await m.turn();
  assert.equal(m.k.get(pay.id)!.fields.settles, theBill.id, m.log.join(' | '));
  const f = m.k.get(theBill.id)!.fields;
  assert.deepEqual([f.state, f.settled], ['paid', '2026-09-28'], m.log.join(' | '));
  assert.deepEqual(m.asked(), []);
});

test('a payment that names its bill already starts no search, and one not cleared starts none until it clears', async () => {
  const m = await money();
  const theBill = m.bill();
  m.paid(400_000, '2026-09-28', { settles: theBill.id });
  const pending = m.paid(400_000, '2026-09-29', { state: 'pending', what: 'SOMEBODY ELSE' });
  await m.k.drain();
  /* AND `replace_posted` SINCE money-core 3.31.0: every cleared line asks whether it is the real charge for one posted. */
  assert.deepEqual(m.queued().map((q) => q.script), ['settle', 'replace_posted']);
  value(m.k.update('transactions', pending.id, { state: 'cleared' }, OWNER));
  await m.k.drain();
  assert.deepEqual(m.queued().map((q) => q.script), ['settle', 'replace_posted', 'match_payment', 'settle_matched_line', 'replace_posted']);
});

test('a payment that fits one instalment writes Paid by, and the instalment is marked paid', async () => {
  const m = await money();
  const part = m.made('installments', { what: 'Northgate Estates', plan: 'Flat', direction: 'out', amount: gbp(250_000), due: '2026-09-30', state: 'open' });
  const pay = m.paid(250_000, '2026-09-28');
  await m.turn();
  const f = m.k.get(part.id)!.fields;
  assert.deepEqual([f.paid_by, f.state, f.settled], [pay.id, 'paid', '2026-09-28'], m.log.join(' | '));
});

test('two bills it could have paid is one question, signed by the script, whose answer carries the link', async () => {
  const m = await money();
  const first = m.bill();
  m.bill({ due: '2026-10-03' });
  const pay = m.paid(400_000, '2026-09-28');
  await m.turn();
  assert.equal(m.k.get(pay.id)!.fields.settles ?? null, null);
  const open = m.asked();
  assert.equal(open.length, 1, m.log.join(' | '));
  assert.match(open[0]!.opened_by, /^script:match_payment/u);
  /* ONE CAUSE A PAYMENT, so the sign of one question per cause holds it to one. */
  assert.equal(open[0]!.cause, `money.match.transactions#${pay.seq}`);
  const body = JSON.parse(open[0]!.body) as { cause?: string; options: { id: string; patches?: { at: string; patch: Fields }[] }[] };
  assert.equal(body.options.length, 3);
  assert.deepEqual(body.options[0]!.patches!.map((p) => p.patch), [{ settles: first.id }]);
  /* AND A SECOND WRITE TO THE PAYMENT'S STATUS ASKS NOTHING NEW. */
  value(m.k.update('transactions', pay.id, { state: 'pending' }, OWNER));
  value(m.k.update('transactions', pay.id, { state: 'cleared' }, OWNER));
  await m.turn();
  assert.equal(m.asked().length, 1);
});

/* A REPEATING LINE IS FOUND AND SAID, AND NOT MARKED: the second step is held (repeat-next-80b-82), and what it would
   do handed a day is read in `money-line-next.test.ts`. */
const LINE = { what: 'Northgate Estates', direction: 'out', amount: gbp(400_000), every: 'monthly', next_due: '2026-10-01', state: 'live' };

test('a bill is marked by its link alone', async () => {
  const m = await money();
  const theBill = m.bill();
  const pay = m.paid(400_000, '2026-09-28');
  await m.turn();
  const f = m.k.get(theBill.id)!.fields;
  assert.deepEqual([m.k.get(pay.id)!.fields.settles, f.state, f.settled, f.paid_so_far ?? f.paid ?? null], [theBill.id, 'paid', '2026-09-28', f.paid_so_far ?? f.paid ?? null]);
  assert.equal(m.log.filter((l) => l.includes('This payment is for')).length >= 1, true);
  assert.deepEqual(m.asked(), []);
});

test('a line among several that fit is still left as it is: nothing asked, nothing marked', async () => {
  const m = await money();
  /* NOT ONE MONEY TWICE: the bill and the line go by two names, and the payment names both. */
  m.bill({ what: 'Northgate rent' });
  const line = m.made('recurring', LINE);
  m.paid(400_000, '2026-09-28', { payee: 'Northgate rent' });
  await m.turn();
  assert.deepEqual(m.asked(), []);
  assert.equal(m.k.get(line.id)!.fields.last_paid ?? null, null);
});

test('an answer that names a bill writes Settles through the gate, and the bill is marked paid with no rule for the answer', async () => {
  const m = await money();
  const first = m.bill();
  m.bill({ due: '2026-10-03' });
  const pay = m.paid(400_000, '2026-09-28');
  await m.turn();
  const q = m.asked()[0]!;
  const body = JSON.parse(q.body) as { options: { id: string; patches?: unknown[] }[] };
  /* EVERY ANSWER BUT "None of these" CARRIES A LINK, so none of them does nothing. */
  assert.deepEqual(body.options.map((o) => [o.id, o.patches?.length ?? 0]), [['obligations-1', 1], ['obligations-2', 1], ['none', 0]]);
  value(m.k.decide(q.id, { decide: { option: 'obligations-1', reason: 'That one.' } } as never, 'p_1'));
  await m.turn();
  const f = m.k.get(first.id)!.fields;
  assert.deepEqual([m.k.get(pay.id)!.fields.settles, f.state, f.settled], [first.id, 'paid', '2026-09-28'], m.log.join(' | '));
});

test('a repeating line among several that fit is no question: picking it would write nothing, so the run says why and asks nothing', async () => {
  const m = await money();
  const theBill = m.bill({ what: 'Northgate rent' });
  m.made('recurring', { what: 'Northgate Estates', direction: 'out', amount: gbp(400_000), every: 'monthly', next_due: '2026-10-01', state: 'live' });
  const pay = m.paid(400_000, '2026-09-28', { payee: 'Northgate rent' });
  await m.turn();
  assert.deepEqual(m.asked(), []);
  assert.ok(m.log.some((l) => l.includes('so nothing was asked')), m.log.join(' | '));
  assert.equal(m.k.get(pay.id)!.fields.settles ?? null, null);
  assert.equal(m.k.get(theBill.id)!.fields.state, 'open');
  /* THE RULE SAYS SO ITSELF: the script handed no such word asks every question it finds. */
  assert.equal(RULE!.steps[0]!.script.input.asks, 'linked');
});

test('a bill and a repeating line under one name are one money twice: the bill takes the payment, and its being paid asks once to move the line on', async () => {
  const m = await money();
  const theBill = m.bill();
  const line = m.made('recurring', LINE);
  const pay = m.paid(400_000, '2026-09-28');
  await m.turn();
  const f = m.k.get(theBill.id)!.fields;
  assert.deepEqual([m.k.get(pay.id)!.fields.settles, f.state], [theBill.id, 'paid'], m.log.join(' | '));
  /* THIS SANDBOX HANDS NO NEXT DAY, so the line is found and nothing is asked: the question is the next file's. */
  assert.ok(m.log.some((l) => l.includes('The host hands no next day')), m.log.join(' | '));
  assert.equal(m.k.get(line.id)!.fields.next_due, '2026-10-01');
});
