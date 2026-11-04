/**
 * What starts `script.close_account` (the rules): an account whose status becomes Closed.
 *
 * `money-close-account.test.ts` MEASURES THE DECISION AND THE SCRIPT, HANDED THEIR INPUT BY THE TEST. This measures who
 * hands it on a record: Money's own rule (`account-closed` in `MONEY_AUTOMATIONS`) and the automation started on the
 * answer (`account-moved`), installed from Money's pack document, with the script's declared `source` run as a host's
 * sandbox runs it, the way `money-settle-rule.test.ts` runs Money's other rule script.
 *
 * RED FIRST: with `CLOSE_ACCOUNT_SCRIPT` in no pack document there is no `script.close_account` on the record and no
 * rule, so an account closed with money on it queues nothing, asks nothing, and its money leaves Cash now in silence.
 *
 * THREE TESTS HERE ARE `todo`, AND EACH SAYS WHAT IT WAITS FOR. They are written whole and run every time, so the day
 * the record hands a script's question to `onDecided` with its account as the row, and a run is handed one account's
 * rolled amount, they pass and the `todo` comes off. NONE OF THE THREE HAS EVER PASSED, so each is a reading of what
 * the wiring should do and not yet a measurement of it. Until they do, Money holds the three declarations and ships
 * none (the first test), and this file installs them itself.
 *
 * LANDED WITH BATCH 62'S INTEGRATION: the script reads the account from the list and number a rule hands (the fourth
 * test, which was the fourth `todo`), and a question a script filed reaches `onDecided` about its script.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { CLOSE_ACCOUNT_AUTOMATIONS, MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';
import { CLOSE_ACCOUNT_SCRIPT } from '../src/modules/money/scripts/close-account.js';

type Fields = Record<string, unknown>;
const OWNER = { actor: 'p_1' };
const usd = (amount: number) => ({ amount, currency: 'USD' });
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
type Question = { id: string; cause?: string; body?: { about?: string; options?: { id: string; label: string; because: string; patches?: unknown[] }[] } };
type Auto = { rule?: string; on: Fields; when?: string; steps: { script: { id: string; input: Fields } }[] };
const auto = (rule: string) => CLOSE_ACCOUNT_AUTOMATIONS.find((a) => a.rule === rule) as Auto | undefined;

/**
 * A record holding Money as its pack document says it with the three closing declarations beside it, three accounts,
 * and a sandbox that runs a queued script's declared source.
 */
async function money() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const doc = firstPartyDocument(id, { seeds: [] }) as { declarations?: Fields[] };
    if (id === 'money-core') doc.declarations = [...(doc.declarations ?? []), ...CLOSE_ACCOUNT_AUTOMATIONS];
    const pack = value<Pack>(await normalise(doc as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const made = (list: string, fields: Fields) => value<Entry>(k.create(list, fields, OWNER));
  const book = made('books', { name: 'Personal' }).id;
  const open = (name: string, balance: unknown, more: Fields = {}) => made('accounts', { name, kind: 'bank', liquid: true, balance, as_of: '2026-09-01', book, ...more });
  const hsbc = open('HSBC (USD)', usd(120_000));
  const savings = open('Savings', usd(900_000));
  open('Current', gbp(500_000));
  const close = (account: Entry) => value<Entry>(k.update('accounts', account.id, { state: 'closed' }, OWNER));

  const log: string[] = [];
  const shaped = (e: Entry) => ({ id: e.id, register: e.register, seq: e.seq!, version: e.version, fields: e.fields });
  const sandbox = async (s: Scripted): Promise<ScriptAnswer> => {
    const writes: Fields[] = [];
    const ctx = {
      input: s.scripted.input,
      tz: 'UTC',
      now: () => new Date(NOW).toISOString(),
      record: {
        get: async (said: string) => {
          const e = k.get(said);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where?: unknown) => value<{ rows: Entry[] }>(k.list({ register, ...(where === undefined ? {} : { where: where as never }) })).rows.map(shaped),
      },
      write: (register: string, fields: Fields) => void writes.push({ op: 'create', register, fields }),
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: (...words: string[]) => void log.push(words.join(' ')),
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    const out = (await mod.default(ctx)) as { ask?: unknown } | null;
    return { writes: writes as never, log: log.join('\n'), usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) };
  };
  const execute = (async () => {
    throw new Error('no call is taken here');
  }) as never;
  /** The schedule and then the outbox: how a run reaches its steps, and a script its sandbox. */
  const turn = async (rounds = 3) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions(execute, { script: sandbox, limit: 50 });
    }
  };
  const queued = (): Queued[] => sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run' ORDER BY rowid").map((r) => JSON.parse(r.payload) as Queued);
  const asked = (status = 'open') => value<Question[]>(k.governance('suggestion', { status, apart: 'with' })).filter((q) => q.cause?.startsWith('money.close-account.'));
  /** What was asked, in its words: the `suggest` event's `to_v`, the only copy. */
  const said = (id: string) => sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${id}`)!.to_v.replace(/^"|"$/gu, '');
  const moves = () => value<{ rows: Entry[] }>(k.list({ register: 'transactions', where: { field: 'transfer', is: true } as never })).rows;
  const answer = (q: Question, label: string) => {
    const picked = q.body!.options!.find((o) => o.label === label)!;
    assert.ok(picked, `"${label}" is not an answer of ${JSON.stringify(q.body?.options?.map((o) => o.label))}`);
    value(k.decide(q.id, { decide: { option: picked.id, reason: 'Closing it.' } }, 'p_1'));
  };
  return { k, made, open, hsbc, savings, close, turn, queued, asked, said, moves, answer, log };
}

test('Money holds the script and its two rules whole, and ships none of them yet', () => {
  /* NOT IN WHAT MONEY SHIPS, as `settle` was kept out until a rule could start it: a script an owner approves and
     nothing can finish is a line in the approval for nothing a person can reach. This test turns over the day the
     three join `MONEY_AUTOMATIONS`. */
  for (const d of CLOSE_ACCOUNT_AUTOMATIONS) assert.ok(!MONEY_AUTOMATIONS.includes(d), `${String(d.rule ?? d.script)} is shipped before an answer to move can be acted on`);
  assert.ok(CLOSE_ACCOUNT_AUTOMATIONS.includes(CLOSE_ACCOUNT_SCRIPT), 'the script is not beside the rules that start it');

  const closed = auto('account-closed');
  assert.ok(closed, 'no rule starts the script');
  /* ONLY A CHANGE OF STATUS, so an edit to an account's name starts nothing, and an account typed in already closed
     (an import of an old one) asks nothing. */
  assert.deepEqual(closed.on, { written: { register: 'accounts', op: ['update'], fields: ['state'] } });
  assert.equal(closed.when, 'state is closed');
  assert.equal(closed.steps[0]!.script.id, CLOSE_ACCOUNT_SCRIPT.script);

  const moved = auto('account-moved');
  assert.ok(moved, 'nothing acts on the answer');
  /* NO `option`, since an answer to move is named after the account it moves to. */
  assert.deepEqual(moved.on, { decided: { about: `script.${CLOSE_ACCOUNT_SCRIPT.script}` } });
  assert.deepEqual(moved.steps[0]!.script.input, { answer: '{{trigger.option}}', on: '{{trigger.day}}' });
});

test('installed with Money, the record takes the script and both rules', async () => {
  const m = await money();
  const ids = new Set((m.k.declarations() as { id: string }[]).map((d) => d.id));
  for (const id of ['script.close_account', 'rule.account-closed', 'rule.account-moved']) assert.ok(ids.has(id), `${id} is not on the record`);
});

test('closing an account starts the script once, handed the account, and nothing else about an account starts it', async () => {
  const m = await money();
  /* AN EDIT TO ITS NAME, and an account typed in already closed, start nothing. */
  value(m.k.update('accounts', m.savings.id, { name: 'Rainy day' }, OWNER));
  m.open('Old dollars', usd(5_000), { state: 'closed' });
  await m.k.drain();
  /* NOT `book_from_account`, WHICH AN ACCOUNT PUT IN A BOOK STARTS SINCE 3.35.0 (24fd3a8d4), and is no part of closing. */
  const closing = () => m.queued().filter((q) => q.script !== 'book_from_account');
  assert.deepEqual(closing(), []);

  m.close(m.hsbc);
  await m.k.drain();
  /* THE ACCOUNT BY ITS IDENTITY, which is what a script step always hands: nothing a step fills says "accounts#1". */
  assert.deepEqual(closing(), [{ script: 'close_account', version: 1, input: { id: m.hsbc.id, register: 'accounts', seq: m.hsbc.seq } }]);
  assert.equal(m.k.get(m.hsbc.id)!.fields.state, 'closed');
});

/** The one open question about closing `account`, after the run that asks it. */
const askedAbout = async (m: Awaited<ReturnType<typeof money>>, account: Entry): Promise<Question> => {
  m.close(account);
  await m.turn();
  const open = m.asked();
  assert.equal(open.length, 1, `closing asked ${open.length} questions: ${m.log.join(' ')}`);
  assert.equal(open[0]!.cause, `money.close-account.accounts#${account.seq}`);
  return open[0]!;
};

const WAITS_DECIDED = "waits for the record to hand a script's question to onDecided with its account as the row";

test('a closed account that still holds money asks once where it goes, by name', async () => {
  const m = await money();
  const q = await askedAbout(m, m.hsbc);
  assert.equal(m.said(q.id), 'HSBC (USD) still holds $1,200.00. Move it to another account, or close it as it stands?');
  assert.equal(q.body?.about, 'HSBC (USD)');
  /* THE OTHER OPEN ACCOUNT IN DOLLARS, and never the one in pounds. */
  assert.deepEqual(q.body?.options?.map((o) => o.label), ['Move it to Savings', 'Close it as it stands']);
  /* ALREADY CLOSED, so closing it as it stands has nothing left to change. */
  assert.equal(q.body?.options?.[1]?.patches, undefined);
  /* AND AN ACCOUNT AT NOUGHT ASKS NOTHING. */
  const empty = m.open('Spare', usd(0));
  m.close(empty);
  await m.turn();
  assert.equal(m.asked().length, 1);
});

test('what the record rolls it to is what is asked about, not the balance somebody typed', { todo: "waits for a run to be handed one account's rolled amount as a whole number (holds)" }, async () => {
  const m = await money();
  /* 200.00 SPENT SINCE THE BALANCE WAS TYPED, so the record rolls 1,200.00 to 1,000.00. */
  m.made('transactions', { what: 'FENWICK CLOUD', on: '2026-09-02', direction: 'out', amount: usd(20_000), account: m.hsbc.id, state: 'cleared' });
  const q = await askedAbout(m, m.hsbc);
  assert.equal(m.said(q.id), 'HSBC (USD) still holds $1,000.00. Move it to another account, or close it as it stands?');
});

test('answering to move writes both legs of one move, once, and the account stays closed', { todo: WAITS_DECIDED }, async () => {
  const m = await money();
  const q = await askedAbout(m, m.hsbc);
  m.answer(q, 'Move it to Savings');
  await m.turn();
  /* RUN AGAIN WITH THE ANSWER, the account by its identity and the day of the decision. */
  assert.deepEqual(m.queued()[1]?.input, { id: m.hsbc.id, register: 'accounts', seq: m.hsbc.seq, answer: 'Move it to Savings', on: '2026-09-03' });
  const legs = () => m.moves().map((l) => [l.fields.what, l.fields.direction, l.fields.account, l.fields.amount, l.fields.on, l.fields.state]).sort();
  const both = [
    ['From HSBC (USD)', 'in', m.savings.id, usd(120_000), '2026-09-03', 'cleared'],
    ['To Savings', 'out', m.hsbc.id, usd(120_000), '2026-09-03', 'cleared'],
  ];
  assert.deepEqual(legs(), both);
  assert.equal(m.k.get(m.hsbc.id)!.fields.state, 'closed');
  /* MORE TURNS WRITE NO SECOND PAIR, and the question is asked no second time. */
  await m.turn();
  assert.deepEqual(legs(), both);
  assert.deepEqual(m.asked(), []);
});

test('a move of the same amount to the same account on another day is not this move, and both legs are still written', { todo: WAITS_DECIDED }, async () => {
  const m = await money();
  /* THE SAME TRANSFER, MADE BY HAND TWO DAYS BEFORE: its two legs are in the Ledger already. */
  const before = { on: '2026-09-01', amount: usd(120_000), transfer: true, state: 'cleared' };
  m.made('transactions', { ...before, what: 'To Savings', direction: 'out', account: m.hsbc.id });
  m.made('transactions', { ...before, what: 'From HSBC (USD)', direction: 'in', account: m.savings.id });
  const q = await askedAbout(m, m.hsbc);
  m.answer(q, 'Move it to Savings');
  await m.turn();
  assert.deepEqual(m.moves().map((l) => [l.fields.what, l.fields.on]).sort(), [
    ['From HSBC (USD)', '2026-09-01'],
    ['From HSBC (USD)', '2026-09-03'],
    ['To Savings', '2026-09-01'],
    ['To Savings', '2026-09-03'],
  ]);
});
