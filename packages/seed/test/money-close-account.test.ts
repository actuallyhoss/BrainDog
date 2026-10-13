/**
 * Closing an account (REC-B15 step 3), one test an effect.
 *
 * `closeAccount` IS THE DECISION AND `run` IS THE SCRIPT ROUND IT, and both are measured, as `money-settle.test.ts`
 * measures Money's other rule script: the decision on plain fields, and the script as a host's sandbox runs it, its
 * declared `source` imported as a module and handed a `ctx`. So a `source` that left `closeAccount` out of its text
 * fails here.
 *
 * RED FIRST: with no `scripts/close-account.js` the file does not load.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { CLOSE_ACCOUNT_SCRIPT, closeAccount, type Closed } from '../src/modules/money/scripts/close-account.js';

type Fields = Record<string, unknown>;
const usd = (amount: number) => ({ amount, currency: 'USD' });
const account = (seq: number, name: string, balance: { amount: number; currency: string }, more: Fields = {}) => ({
  id: `e_accounts_${seq}`,
  spoken: `accounts#${seq}`,
  version: 3,
  fields: { name, kind: 'bank', liquid: true, balance, as_of: '2026-10-01', state: 'open', ...more } as Fields,
});
const hsbc = (more: Fields = {}) => account(3, 'HSBC (USD)', usd(120_000), more);
const savings = (more: Fields = {}) => account(5, 'Savings', usd(900_000), more);
const ON = '2026-10-13';
const CLOSE = [{ id: 'accounts#3', version: 3, fields: { state: 'closed' } }];

const asked = (out: Closed) => {
  assert.ok('ask' in out, `no question came back: ${JSON.stringify(out)}`);
  assert.ok(!('writes' in out), 'a question came with a change beside it');
  return out.ask;
};

test('an account at nought closes with no question', () => {
  const out = closeAccount(hsbc({ balance: usd(0) }), { on: ON, others: [savings()] });
  assert.deepEqual(out, { writes: CLOSE, legs: [], said: 'HSBC (USD) is closed.' });
});

test('an account that still holds money asks once, in two answers', () => {
  const ask = asked(closeAccount(hsbc(), { on: ON, others: [savings()] }));
  assert.equal(ask.question, 'HSBC (USD) still holds $1,200.00. Move it to another account, or close it as it stands?');
  assert.equal(ask.cause, 'money.close-account.accounts#3');
  assert.equal(ask.about, 'HSBC (USD)');
  assert.deepEqual(ask.options.map((o) => o.label), ['Move it to Savings', 'Close it as it stands']);
});

test('moving is the two legs of one move, and closing as it stands is one change the gate can make', () => {
  const [move, close] = asked(closeAccount(hsbc(), { on: ON, others: [savings()] })).options;
  assert.deepEqual(move!.legs, [
    { what: 'To Savings', on: ON, direction: 'out', amount: usd(120_000), account: 'e_accounts_3', transfer: true, state: 'cleared' },
    { what: 'From HSBC (USD)', on: ON, direction: 'in', amount: usd(120_000), account: 'e_accounts_5', transfer: true, state: 'cleared' },
  ]);
  /* THE MOVE CARRIES NO PATCHES, since an answer's patches change what is there and cannot add a movement: a pick that
     closed the account at the gate and wrote no legs would lose the money. Its close waits in `then`, for the run. */
  assert.equal(move!.patches, undefined);
  assert.deepEqual(move!.then, CLOSE);
  assert.equal(move!.because, '$1,200.00 goes to Savings on 13 October as one move, and HSBC (USD) is closed.');
  assert.deepEqual(close!.patches, CLOSE);
  assert.equal(close!.legs, undefined);
  assert.equal(close!.because, 'It is closed with $1,200.00 still on it, and nothing is moved.');
});

test('what the record rolls it to is what is asked about, not the balance somebody typed', () => {
  const ask = asked(closeAccount(hsbc(), { on: ON, others: [savings()], holds: 4_550 }));
  assert.equal(ask.question, 'HSBC (USD) still holds $45.50. Move it to another account, or close it as it stands?');
  assert.deepEqual((ask.options[0]!.legs![0] as Fields).amount, usd(4_550));
  /* ROLLED TO NOUGHT, a typed balance of 1,200.00 asks nothing. */
  assert.ok('writes' in closeAccount(hsbc(), { on: ON, others: [savings()], holds: 0 }));
});

test('the answer handed back makes the writes: the legs and the close, or the close alone', () => {
  const moved = closeAccount(hsbc(), { on: ON, others: [savings()], answer: 'Move it to Savings' });
  assert.ok('writes' in moved, JSON.stringify(moved));
  assert.deepEqual(moved.writes, CLOSE);
  assert.equal(moved.legs.length, 2);
  assert.equal(moved.said, '$1,200.00 moved from HSBC (USD) to Savings, and HSBC (USD) is closed.');
  const stood = closeAccount(hsbc(), { on: ON, others: [savings()], answer: 'Close it as it stands' });
  assert.deepEqual(stood, { writes: CLOSE, legs: [], said: 'HSBC (USD) is closed as it stands, with $1,200.00 still on it.' });
  const other = closeAccount(hsbc(), { on: ON, others: [savings()], answer: 'Later' });
  assert.deepEqual(other, { nothing: '"Later" is not one of the answers, so HSBC (USD) stays as it was.' });
});

test('two currencies are never added: money moves only to an open account in the same one', () => {
  const pounds = account(6, 'Current', gbp(500_000));
  const shut = account(7, 'Old dollars', usd(0), { state: 'closed' });
  const ask = asked(closeAccount(hsbc(), { on: ON, others: [pounds, shut, hsbc()] }));
  assert.equal(ask.question, 'HSBC (USD) still holds $1,200.00, and no other open account is in USD. Close it as it stands?');
  assert.deepEqual(ask.options.map((o) => [o.label, o.patches]), [['Close it as it stands', CLOSE], ['Leave it open', undefined]]);
});

test('several accounts in its currency are each an answer, and the question is still one', () => {
  const ask = asked(closeAccount(hsbc(), { on: ON, others: [savings(), account(8, 'Wise', usd(10))] }));
  assert.deepEqual(ask.options.map((o) => o.label), ['Move it to Savings', 'Move it to Wise', 'Close it as it stands']);
  assert.equal((ask.options[1]!.legs![1] as Fields).account, 'e_accounts_8');
});

test('an account that owes says so, and the move runs the other way', () => {
  const card = account(3, 'Amex', usd(-5_000), { kind: 'card' });
  const ask = asked(closeAccount(card, { on: ON, others: [savings()] }));
  assert.equal(ask.question, 'Amex still owes $50.00. Move it to another account, or close it as it stands?');
  assert.deepEqual(ask.options[0]!.legs!.map((l) => [l.what, l.direction, l.account, l.amount]), [
    ['To Amex', 'out', 'e_accounts_5', usd(5_000)],
    ['From Savings', 'in', 'e_accounts_3', usd(5_000)],
  ]);
});

test('a currency with no sign is said by its code, and one with no hundredths has none', () => {
  const egp = closeAccount(account(3, 'CIB', { amount: 120_050, currency: 'EGP' }), { on: ON, others: [] });
  assert.match(asked(egp).question, /^CIB still holds EGP 1,200\.50, and no other open account is in EGP\./);
  const jpy = closeAccount(account(3, 'Mizuho', { amount: 1_200, currency: 'JPY' }), { on: ON, others: [] });
  assert.match(asked(jpy).question, /^Mizuho still holds JPY 1,200, /);
});

test('an account already closed is not closed again', () => {
  assert.deepEqual(closeAccount(hsbc({ state: 'closed', balance: usd(0) }), { on: ON, others: [] }), { nothing: 'HSBC (USD) is already closed.' });
  /* CLOSED BY HAND WITH MONEY ON IT, the question is still asked, and no answer writes a status it already has. */
  const ask = asked(closeAccount(hsbc({ state: 'closed' }), { on: ON, others: [savings()] }));
  assert.deepEqual(ask.options.map((o) => o.patches ?? o.then), [[], undefined]);
});

/** The script's own text, run as a sandbox runs it: nothing but `ctx`. */
type Held = { list: string; id: string; spoken: string; version: number; fields: Fields };
const inList = (list: string, a: { id: string; spoken: string; version: number; fields: Fields }): Held => ({ list, ...a });
const matches = (fields: Fields, where: unknown): boolean => {
  if (where === undefined || where === null) return true;
  const w = where as { all?: unknown[]; field?: string; is?: unknown; not?: unknown };
  if (w.all) return w.all.every((x) => matches(fields, x));
  return 'not' in w ? fields[w.field!] !== w.not : fields[w.field!] === w.is;
};
async function ran(rows: Held[], input: Fields) {
  const updates: { spoken: string; patch: unknown; version: number }[] = [];
  const added: { list: string; fields: Fields }[] = [];
  const log: string[] = [];
  const shaped = (r: Held) => ({ id: r.id, seq: Number(r.spoken.split('#')[1]), version: r.version, fields: r.fields });
  const ctx = {
    input,
    tz: 'Africa/Cairo',
    /* 23:30 IN LONDON IS ALREADY THE 14TH IN CAIRO, so a day read off the instant alone would be a day early. */
    now: () => '2026-10-13T22:30:00.000Z',
    record: {
      get: async (spoken: string) => {
        const found = rows.find((r) => r.spoken === spoken);
        return found ? shaped(found) : null;
      },
      list: async (list: string, where: unknown) => rows.filter((r) => r.list === list && matches(r.fields, where)).map(shaped),
    },
    write: (list: string, fields: Fields) => void added.push({ list, fields }),
    update: (spoken: string, patch: unknown, version: number) => void updates.push({ spoken, patch, version }),
    log: (...words: string[]) => void log.push(words.join(' ')),
  };
  const mod = (await import(`data:text/javascript,${encodeURIComponent(CLOSE_ACCOUNT_SCRIPT.source as string)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
  return { out: await mod.default(ctx), updates, added, log };
}
const ACCOUNTS = () => [inList('accounts', hsbc()), inList('accounts', savings())];

test('the script is Money\'s own, fetches nothing, and writes only Accounts and the Ledger', () => {
  assert.equal(CLOSE_ACCOUNT_SCRIPT.script, 'close_account');
  assert.equal(CLOSE_ACCOUNT_SCRIPT.pack, 'money-core');
  assert.deepEqual(CLOSE_ACCOUNT_SCRIPT.egress, []);
  assert.deepEqual(CLOSE_ACCOUNT_SCRIPT.keys, []);
  assert.deepEqual(CLOSE_ACCOUNT_SCRIPT.runs, { rule: true });
  assert.deepEqual(CLOSE_ACCOUNT_SCRIPT.writes, ['accounts', 'transactions']);
});

test('run on an account at nought, the script closes it at the version it read and says so by name', async () => {
  const { out, updates, added, log } = await ran([inList('accounts', hsbc({ balance: usd(0) })), inList('accounts', savings())], { account: 'accounts#3' });
  assert.deepEqual(updates, [{ spoken: 'accounts#3', patch: { state: 'closed' }, version: 3 }]);
  assert.deepEqual(added, []);
  assert.deepEqual(out, { closed: 'accounts#3', moved: 0 });
  assert.deepEqual(log, ['HSBC (USD) is closed.']);
});

test('run on an account that holds money, the script writes nothing and hands back the one question', async () => {
  const { out, updates, added } = await ran(ACCOUNTS(), { account: 'accounts#3' });
  assert.deepEqual([updates, added], [[], []]);
  const ask = (out as { ask: { question: string; cause: string; options: Fields[] } }).ask;
  assert.equal(ask.question, 'HSBC (USD) still holds $1,200.00. Move it to another account, or close it as it stands?');
  /* WHAT THE GATE IS HANDED: a move with no change of its own, and the close with its one. */
  assert.deepEqual(ask.options, [
    { label: 'Move it to Savings', because: '$1,200.00 goes to Savings on 14 October as one move, and HSBC (USD) is closed.' },
    { label: 'Close it as it stands', because: 'It is closed with $1,200.00 still on it, and nothing is moved.', patches: CLOSE },
  ]);
});

test('run with the answer to move, the script writes both legs and the close in one run, dated today where the record is', async () => {
  const { out, updates, added, log } = await ran(ACCOUNTS(), { account: 'accounts#3', answer: 'Move it to Savings', holds: 120_000 });
  assert.deepEqual(added, [
    { list: 'transactions', fields: { what: 'To Savings', on: '2026-10-14', direction: 'out', amount: usd(120_000), account: 'e_accounts_3', transfer: true, state: 'cleared' } },
    { list: 'transactions', fields: { what: 'From HSBC (USD)', on: '2026-10-14', direction: 'in', amount: usd(120_000), account: 'e_accounts_5', transfer: true, state: 'cleared' } },
  ]);
  assert.deepEqual(updates, [{ spoken: 'accounts#3', patch: { state: 'closed' }, version: 3 }]);
  assert.deepEqual(out, { closed: 'accounts#3', moved: 2 });
  assert.deepEqual(log, ['$1,200.00 moved from HSBC (USD) to Savings, and HSBC (USD) is closed.']);
});

test('run twice for one answer, the money is moved once', async () => {
  const leg = { list: 'transactions', id: 'e_transactions_40', spoken: 'transactions#40', version: 1, fields: { what: 'To Savings', on: '2026-10-14', direction: 'out', amount: usd(120_000), account: 'e_accounts_3', transfer: true, state: 'cleared' } };
  const again = await ran([...ACCOUNTS(), leg], { account: 'accounts#3', answer: 'Move it to Savings', holds: 120_000 });
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.updates, [{ spoken: 'accounts#3', patch: { state: 'closed' }, version: 3 }]);
  assert.deepEqual(again.log, ['HSBC (USD) was already moved, and is closed now.']);
  const done = await ran([inList('accounts', hsbc({ state: 'closed' })), inList('accounts', savings()), leg], { account: 'accounts#3', answer: 'Move it to Savings', holds: 120_000 });
  assert.deepEqual([done.out, done.added, done.updates], [null, [], []]);
});

test('run with one account named to take the money, only that one is offered, and a day handed is the day', async () => {
  const wise = inList('accounts', account(8, 'Wise', usd(10)));
  const { out } = await ran([...ACCOUNTS(), wise], { account: 'accounts#3', to: 'accounts#8', on: '2026-10-20' });
  const options = (out as { ask: { options: { label: string; because: string }[] } }).ask.options;
  assert.deepEqual(options.map((o) => o.label), ['Move it to Wise', 'Close it as it stands']);
  assert.match(options[0]!.because, /on 20 October/);
});

test('run with no account, or one that is gone, the script writes nothing and says which', async () => {
  const none = await ran(ACCOUNTS(), {});
  assert.deepEqual([none.out, none.log], [null, ['The script was handed no account, so nothing was closed.']]);
  const gone = await ran(ACCOUNTS(), { account: 'accounts#99' });
  assert.deepEqual([gone.out, gone.log], [null, ['The account is no longer in the record, so nothing was closed.']]);
});

/**
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, so the filter on the Ledger is one the record reads, each leg
 * is a movement the Ledger takes, and the close is a status the list holds.
 */
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

test('on a record, the move is two movements between the two accounts and the account is closed', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const made = (list: string, fields: Fields) => value<Entry>(k.create(list, fields, OWNER));
  const book = made('books', { name: 'Personal' }).id;
  const open = (name: string, balance: unknown, more: Fields = {}) => made('accounts', { name, kind: 'bank', liquid: true, balance, as_of: '2026-10-01', book, ...more });
  const old = open('HSBC (USD)', usd(120_000));
  const to = open('Savings', usd(900_000));
  open('Current', gbp(500_000));
  open('Old dollars', usd(0), { state: 'closed' });

  const shaped = (e: Entry) => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });
  const closeOn = async (input: Fields) => {
    const ctx = {
      input: { account: `accounts#${old.seq}`, ...input },
      tz: 'UTC',
      now: () => '2026-10-13T09:00:00.000Z',
      record: {
        get: async (spoken: string) => {
          const e = spoken === `accounts#${old.seq}` ? k.get(old.id) : null;
          return e ? shaped(e) : null;
        },
        list: async (register: string, where?: unknown) => value<{ rows: Entry[] }>(k.list({ register, ...(where === undefined ? {} : { where: where as never }) })).rows.map(shaped),
      },
      write: (register: string, fields: Fields) => void made(register, fields),
      update: (_spoken: string, patch: Fields, version: number) => void value(k.update('accounts', old.id, patch, { ...OWNER, version })),
      log: () => {},
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(CLOSE_ACCOUNT_SCRIPT.source as string)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    return mod.default(ctx);
  };

  /* ASKED FIRST, with the one other open account in dollars as the place to move to, and nothing written. */
  const first = (await closeOn({})) as { ask: { options: { label: string }[] } };
  assert.deepEqual(first.ask.options.map((o) => o.label), ['Move it to Savings', 'Close it as it stands']);
  assert.equal(k.get(old.id)!.fields.state, 'open');

  assert.deepEqual(await closeOn({ answer: 'Move it to Savings' }), { closed: `accounts#${old.seq}`, moved: 2 });
  assert.equal(k.get(old.id)!.fields.state, 'closed');
  const legs = value<{ rows: Entry[] }>(k.list({ register: 'transactions', where: { field: 'transfer', is: true } as never })).rows;
  assert.deepEqual(
    legs.map((l) => [l.fields.what, l.fields.direction, l.fields.account, l.fields.amount, l.fields.on, l.fields.state]).sort(),
    [
      ['From HSBC (USD)', 'in', to.id, usd(120_000), '2026-10-13', 'cleared'],
      ['To Savings', 'out', old.id, usd(120_000), '2026-10-13', 'cleared'],
    ],
  );
  /* AGAIN, the account is closed and the money was moved: no third movement. */
  assert.equal(await closeOn({ answer: 'Move it to Savings' }), null);
  assert.equal(value<{ rows: Entry[] }>(k.list({ register: 'transactions' })).rows.length, 2);
});

test('an account typed before it had a status is open, and is offered', async () => {
  const bare = inList('accounts', account(5, 'Savings', usd(900_000)));
  delete bare.fields.state;
  const { out } = await ran([inList('accounts', hsbc()), bare], { account: 'accounts#3' });
  assert.equal((out as { ask: { options: { label: string }[] } }).ask.options[0]!.label, 'Move it to Savings');
});
