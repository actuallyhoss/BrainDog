/**
 * A Ledger entry, a bill, a repeating line and an instalment take their account's book.
 *
 * EVERY MONEY LIST CARRIES AN OPTIONAL LINK TO A BOOK, AND UNTIL NOW NOTHING FILLED IT. A book's page reads the field on
 * each list, since a filter cannot follow an entry to its account's book, so an entry typed in on Acme's account sat
 * in no book and Acme's page left it out. Measured here on a record: Money's own rules, installed from its pack
 * document, started by the write, and the script's declared `source` run as a host's sandbox runs it, the way
 * `money-settle-rule.test.ts` runs `settle`.
 *
 * RED FIRST: with `BOOK_FROM_ACCOUNT_SCRIPT` in no pack document nothing is queued when an entry is made, and its
 * book stays empty.
 *
 * A BILL WAS THE ONE THAT COULD NOT, AND NOW CAN (the tests at the foot): Bills and invoices holds the account a bill is
 * paid from or an invoice into, so `bill-takes-book` files it as the other three rules file theirs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY, NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { OBLIGATIONS_REGISTER } from '../src/modules/money/lists/obligations.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';
import { BOOK_FROM_ACCOUNT_SCRIPT, bookFromAccount } from '../src/modules/money/scripts/book-from-account.js';
import { bankHsbcEgFile } from './pack-files.ts';

type Fields = Record<string, unknown>;
const OWNER = { actor: 'p_1' };
const DAY = 86_400_000;
const CAUSE = 'money.book-from-account';
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

type Update = { op: 'update'; spoken: string; patch: unknown; version: number } | { op: 'create'; register: string; fields: unknown };
type Question = { id: string; cause?: string; body?: { about?: string; options?: { id: string; label: string; because: string; patches?: unknown[] }[] } };

/** A record holding Money as its pack documents say it, a sandbox that runs a queued script's source, and a clock a test moves. */
async function money(docs: unknown[] = ['portfolio', 'people', 'money-core'].map((id) => firstPartyDocument(id, { seeds: [] }))) {
  const sql: NodeSql = openSqlite();
  let now = NOW;
  const k = await openRecord(sql, { now: () => now });
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  for (const doc of docs) {
    const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const made = (list: string, fields: Fields) => value<Entry>(k.create(list, fields, OWNER));
  const log: string[] = [];
  const shaped = (e: Entry) => ({ id: e.id, register: e.register, seq: e.seq!, version: e.version, fields: e.fields });
  /** The script's source run once with `input`, as the host's `ctx` reads and writes: what it asked to change, and what it returned. */
  const run = async (source: string, input: unknown) => {
    const writes: Update[] = [];
    const ctx = {
      input,
      record: {
        get: async (said: string) => {
          const e = k.get(said);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where: unknown, options?: { order?: string } | null) => value<{ rows: Entry[] }>(k.list({ register, where: where as never, ...(options?.order === 'seq' ? { order: [{ field: 'seq', dir: 'asc' as const }] } : {}) })).rows.map(shaped),
      },
      /* `plans_from_names` makes a plan when a part is made, so the sandbox takes a new thing too. */
      write: (register: string, fields: unknown) => void writes.push({ op: 'create', register, fields }),
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: (...words: string[]) => void log.push(words.join(' ')),
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(source)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    const out = (await mod.default(ctx)) as { ask?: unknown } | null;
    return { writes, out };
  };
  const sandbox = async (s: Scripted): Promise<ScriptAnswer> => {
    const { writes, out } = await run(s.scripted.decl.source, s.scripted.input);
    return { writes: writes as never, log: log.join('\n'), usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) } as ScriptAnswer;
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
  /** One night: the clock moves past the script's next turn, the schedule fires, and the run reaches its sandbox. */
  const night = async () => {
    const due = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'script' AND key = 'book_from_account' AND state = 'pending'")?.due_at;
    now = Math.max(now + DAY, due === undefined ? 0 : Date.parse(due)) + 60_000;
    await turn();
  };
  const queued = (): number =>
    sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run'").filter((r) => (JSON.parse(r.payload) as { script: string }).script === 'book_from_account').length;
  const asked = (status: string) => value<Question[]>(k.governance('suggestion', { status, apart: 'with' })).filter((q) => (q.cause ?? '').startsWith(CAUSE));
  const said = (id: string) => sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${id}`)!.to_v;
  const bookOf = (id: string) => k.get(id)!.fields.book ?? null;
  return { k, sql, made, run, turn, night, queued, asked, said, bookOf, log };
}
type Rec = Awaited<ReturnType<typeof money>>;

/** A record as money-core held it before 3.35.0 (24fd3a8d4): no rule files what an account holds when it goes in a book. */
const beforeAccountFiles = (): unknown[] => ['portfolio', 'people', 'money-core'].map((id) => {
  const doc = firstPartyDocument(id, { seeds: [] }) as Fields & { declarations: Fields[] };
  return { ...doc, declarations: doc.declarations.filter((d) => d.rule !== 'account-files-book') };
});

/** Two books, an account in each, and one in no book. */
const books = (r: Rec) => {
  const acme = r.made('books', { name: 'Acme' }).id;
  const home = r.made('books', { name: 'Personal' }).id;
  const account = (name: string, book?: string) => r.made('accounts', { name, kind: 'bank', liquid: true, balance: gbp(1_000_000), as_of: '2026-10-01', ...(book ? { book } : {}) }).id;
  return { acme, home, inAcme: account('Acme current', acme), inNone: account('Old joint') };
};
const entry = (account: string, more: Fields = {}) => ({ what: 'NORTHGATE ESTATES', on: '2026-10-02', direction: 'out', amount: gbp(4_200), account, state: 'cleared', ...more });
const repeat = (account: string, more: Fields = {}) => ({ what: 'Studio rent', direction: 'out', amount: gbp(400_000), every: 'monthly', next_due: '2026-11-01', state: 'live', account, ...more });
const bill = (account: string, more: Fields = {}) => ({ what: 'Studio insurance', direction: 'owed_by_me', amount: gbp(48_000), due: '2026-11-20', state: 'open', account, ...more });
const part = (account: string, more: Fields = {}) => ({ what: 'Laptop, part 2', plan: 'Laptop', direction: 'out', amount: gbp(30_000), due: '2026-11-15', state: 'open', account, ...more });

type Rule = { rule: string; on: { written: { register: string; op: string[]; fields: string[] } }; when: string; steps: { script: { id: string; input: Fields } }[] };
const RULES = MONEY_AUTOMATIONS.filter((a) => typeof a.rule === 'string' && /-takes-book$/u.test(a.rule)) as Rule[];

test('the script and the rules that start it are Money\'s own, and go into its pack document together', () => {
  assert.ok(MONEY_AUTOMATIONS.includes(BOOK_FROM_ACCOUNT_SCRIPT), 'the script is in no pack document');
  const d = BOOK_FROM_ACCOUNT_SCRIPT as Fields;
  assert.deepEqual([d.script, d.pack, d.egress, d.keys], ['book_from_account', 'money-core', [], []]);
  /* ONE RULE FOR EACH LIST THAT HOLDS AN ACCOUNT, Bills and invoices among them (the tests at the foot). */
  assert.deepEqual(RULES.map((r) => r.on.written.register).sort(), ['installments', 'obligations', 'recurring', 'transactions']);
  for (const r of RULES) {
    /* ONLY A WRITE TO THE ACCOUNT, so an edit to an entry's words starts nothing, and neither does the book the script
       itself writes. */
    assert.deepEqual(r.on.written, { register: r.on.written.register, op: ['create', 'update'], fields: ['account'] });
    assert.equal(r.when, 'account is set, book is empty');
    assert.equal(r.steps[0]!.script.id, d.script);
    assert.ok((d.reads as string[]).includes(r.on.written.register) && (d.writes as string[]).includes(r.on.written.register));
  }
  /* IT WRITES NO ACCOUNT AND NO BOOK, only the link on a thing that holds money. */
  assert.ok(!(d.writes as string[]).includes('accounts') && !(d.writes as string[]).includes('books'));
});

test('the decision: each thing with an account in a book and no book of its own takes that book, and nothing else is touched', () => {
  const at = (list: string, n: number, fields: Fields) => ({ list, id: `id${list}${n}`, spoken: `${list}#${n}`, version: 3, fields });
  const inBook = { a_acme: 'b_acme', a_home: 'b_home' };
  const out = bookFromAccount(
    [
      at('transactions', 1, { account: 'a_acme' }),
      at('obligations', 2, { account: 'a_acme' }),
      at('recurring', 3, { account: 'a_home', book: '' }),
      at('installments', 4, { account: 'a_acme', book: null }),
      /* ITS OWN BOOK IS KEPT, even when its account is in another. */
      at('transactions', 5, { account: 'a_acme', book: 'b_home' }),
      /* AN ACCOUNT IN NO BOOK, and no account at all. */
      at('transactions', 6, { account: 'a_none' }),
      at('recurring', 7, {}),
    ],
    inBook,
  );
  assert.deepEqual(out, [
    { id: 'transactions#1', version: 3, fields: { book: 'b_acme' } },
    { id: 'obligations#2', version: 3, fields: { book: 'b_acme' } },
    { id: 'recurring#3', version: 3, fields: { book: 'b_home' } },
    { id: 'installments#4', version: 3, fields: { book: 'b_acme' } },
  ]);
});

test('a Ledger entry, a repeating line and an instalment made on an account in Acme are in Acme, by no hand', async () => {
  const r = await money();
  const b = books(r);
  /* THE ACCOUNT MADE IN ITS BOOK HAS RUN ITS OWN FILING (`account-files-book`, 3.35.0) before anything is made on it. */
  await r.turn();
  const made = [r.made('transactions', entry(b.inAcme)), r.made('recurring', repeat(b.inAcme)), r.made('installments', part(b.inAcme))];
  for (const e of made) assert.equal(r.bookOf(e.id), null, 'a book was typed by the test');
  await r.turn();
  for (const e of made) assert.equal(r.bookOf(e.id), b.acme, `${e.register} is in no book`);
  /* SAID IN NAMES: the thing and the book, never a list's number or an id. */
  const said = r.log.filter((l) => /Acme/u.test(l)).join(' ');
  assert.match(said, /NORTHGATE ESTATES is in Acme, the book its account is in\./u);
  assert.doesNotMatch(said, /—|#\d|\brow\b|01[0-9A-Z]{24}/u);
  /* AND NOTHING ELSE ABOUT THE ENTRY CHANGED. `stays` is read through its category, which it has none of, and `corrects`
     is said empty by the script that asks whether it corrects another (1345790b8). */
  const { book: _b, stays: _s, corrects: _c, ...rest } = r.k.get(made[0]!.id)!.fields;
  assert.deepEqual(rest, made[0]!.fields);
  r.sql.close();
});

test('one with its own book keeps it, and an account in no book fills nothing', async () => {
  const r = await money();
  const b = books(r);
  const own = r.made('transactions', entry(b.inAcme, { book: b.home }));
  assert.equal(r.queued(), 0, 'an entry that names its book started the script');
  const none = r.made('transactions', entry(b.inNone));
  await r.turn();
  assert.equal(r.bookOf(own.id), b.home);
  assert.equal(r.bookOf(none.id), null);
  assert.equal(r.k.get(none.id)!.version, none.version, 'an entry on an account in no book was written');
  r.sql.close();
});

test('an entry moved to an account in a book takes it, and running twice writes nothing the second time', async () => {
  const r = await money();
  const b = books(r);
  const e = r.made('transactions', entry(b.inNone));
  await r.turn();
  value(r.k.update('transactions', e.id, { account: b.inAcme }, OWNER));
  await r.turn();
  assert.equal(r.bookOf(e.id), b.acme);
  const filed = r.k.get(e.id)!;
  /* THE SAME RUN AGAIN, handed what a rule hands: the entry holds its book now, so nothing is asked for. */
  const again = await r.run(String((BOOK_FROM_ACCOUNT_SCRIPT as Fields).source), { register: 'transactions', seq: filed.seq, id: filed.id });
  assert.deepEqual(again.writes, []);
  assert.equal(again.out, null);
  /* A WRITE TO THE BOOK STARTS NOTHING: the rule reads the account alone, so a book taken off by hand stays off. */
  const before = r.queued();
  value(r.k.update('transactions', e.id, { book: null }, OWNER));
  assert.equal(r.queued(), before, 'taking an entry out of its book started the script');
  r.sql.close();
});

/**
 * A BANK'S TEXT WRITES A LEDGER ENTRY WITH ITS ACCOUNT AND NO BOOK, since the bank add-on has no book setting. The
 * rule reads who wrote nothing, so the entry is in its account's book once the write is drained. Driven end to end
 * with the bank file installed, as `bank-pack.test.ts` drives a card charge.
 */
test('a bank text for an account in a book lands in that book', async () => {
  const r = await money([...FIRST_PARTY.map((id) => firstPartyDocument(id)), bankHsbcEgFile()]);
  const acme = r.made('books', { name: 'Acme' }).id;
  const card = r.made('accounts', { name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: '2026-08-01', liquid: false, last4: '2291', book: acme }).id;
  const arrived = value<{ state: string }>(
    r.k.arrive({
      channel: 'email',
      headers: { From: 'alerts@hsbc.example', Subject: 'HSBC' },
      body: 'Your Credit Card ending with *** 2291 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your available limit is EGP 23,715.50',
      sha256: 'book-1',
      verified: true,
    }),
  );
  assert.equal(arrived.state, 'matched');
  await r.turn();
  const rows = value<{ rows: Entry[] }>(r.k.list({ register: 'transactions', limit: 200 })).rows.filter((e) => e.fields.account === card);
  assert.equal(rows.length, 1, 'the text filed no entry on the card');
  assert.equal(rows[0]!.fields.book, acme, 'the bank entry is in no book');
  r.sql.close();
});

/**
 * WHAT WAS THERE BEFORE THE ACCOUNT HAD A BOOK IS OFFERED ONCE, AS A QUESTION THAT SAYS HOW MANY, WHERE IT WAS NOT FILED
 * WHEN THE ACCOUNT WENT IN: an account put in a book since 3.35.0 takes it along at once (`account-files-book`, 24fd3a8d4,
 * held below), so the night's question is for what is left over, and for an account put in a book before that rule. The
 * record here has no such rule, as a record of then had none. Picking "File them" is the change, each at the version the
 * script read; "Leave them" is remembered by the gate, and nothing asks again.
 */
test('an account put in a book takes what it holds at once, leaves a thing with its own book and what is void, and is asked nothing', async () => {
  const r = await money();
  const acme = r.made('books', { name: 'Acme' }).id;
  const home = r.made('books', { name: 'Home' }).id;
  const account = r.made('accounts', { name: 'Acme current', kind: 'bank', liquid: true, balance: gbp(1_000_000), as_of: '2026-10-01' }).id;
  const other = r.made('accounts', { name: 'Old joint', kind: 'bank', liquid: true, balance: gbp(0), as_of: '2026-10-01' }).id;
  const held = [r.made('transactions', entry(account)), r.made('recurring', repeat(account)), r.made('installments', part(account))];
  const own = r.made('transactions', entry(account, { book: home }));
  const voided = r.made('transactions', entry(account, { state: 'void' }));
  const left = r.made('transactions', entry(other));
  await r.turn();
  for (const e of held) assert.equal(r.bookOf(e.id), null, 'filed before its account had a book');

  value(r.k.update('accounts', account, { book: acme }, OWNER));
  await r.turn();
  for (const e of held) assert.equal(r.bookOf(e.id), acme, `${e.register} did not follow its account`);
  assert.equal(r.bookOf(own.id), home, 'a thing that names its book lost it');
  assert.equal(r.bookOf(voided.id), null, 'a void entry was filed');
  assert.equal(r.bookOf(left.id), null, 'an entry on another account was filed');
  assert.ok(r.log.some((l) => l.includes('3 things on Acme current are in Acme now')), r.log.join(' | '));
  assert.deepEqual(r.asked('open'), [], 'it asked about what it had filed');
  r.sql.close();
});

test('what an account already held is counted in one question, and picking File them files each in its account\'s book', async () => {
  const r = await money(beforeAccountFiles());
  const acme = r.made('books', { name: 'Acme' }).id;
  const account = r.made('accounts', { name: 'Acme current', kind: 'bank', liquid: true, balance: gbp(1_000_000), as_of: '2026-10-01' }).id;
  const other = r.made('accounts', { name: 'Old joint', kind: 'bank', liquid: true, balance: gbp(0), as_of: '2026-10-01' }).id;
  const held = [
    r.made('transactions', entry(account)),
    r.made('transactions', entry(account, { what: 'CEDAR LANE BAKERY' })),
    r.made('recurring', repeat(account)),
    r.made('installments', part(account)),
  ];
  const left = r.made('transactions', entry(other));
  await r.turn();
  for (const e of held) assert.equal(r.bookOf(e.id), null);
  assert.deepEqual(r.asked('open'), [], 'a question was asked while no account was in a book');

  value(r.k.update('accounts', account, { book: acme }, OWNER));
  await r.night();
  const open = r.asked('open');
  assert.equal(open.length, 1, JSON.stringify(open));
  const q = open[0]!;
  const question = r.said(q.id).replace(/^"|"$/gu, '');
  assert.equal(question, '2 Ledger entries, 1 repeating line and 1 instalment are in no book, and their account is in one. File each in its account\'s book?');
  assert.equal(q.body?.about, 'Acme');
  const options = q.body?.options ?? [];
  assert.deepEqual(options.map((o) => o.label), ['File them', 'Leave them']);
  assert.equal(options[0]!.patches?.length, 4);
  for (const o of options) {
    assert.notEqual(o.because, o.label);
    assert.doesNotMatch(`${question} ${q.body?.about} ${o.label} ${o.because}`, /—|#\d|\brows?\b|transactions|01[0-9A-Z]{24}/u);
  }
  /* ASKING WROTE NOTHING. */
  for (const e of held) assert.equal(r.bookOf(e.id), null);

  value(r.k.decide(q.id, { decide: { option: options[0]!.id, reason: 'They are the company\'s.' } }, 'p_1'));
  for (const e of held) assert.equal(r.bookOf(e.id), acme, `${e.register} was not filed`);
  assert.equal(r.bookOf(left.id), null, 'an entry on an account in no book was filed');

  await r.night();
  assert.deepEqual(r.asked('open'), [], 'the second night asked again');
  assert.equal(r.sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion WHERE cause LIKE ?', `${CAUSE}%`)!.n, 1);
  r.sql.close();
});

test('what no longer stands is not counted and not filed: a void entry, an ended line, a cancelled or paid part', async () => {
  const r = await money();
  const acme = r.made('books', { name: 'Acme' }).id;
  const account = r.made('accounts', { name: 'Acme current', kind: 'bank', liquid: true, balance: gbp(1_000_000), as_of: '2026-10-01' }).id;
  const stands = [r.made('transactions', entry(account)), r.made('recurring', repeat(account)), r.made('installments', part(account))];
  const gone = [
    r.made('transactions', entry(account, { what: 'CEDAR LANE BAKERY', state: 'void' })),
    r.made('recurring', repeat(account, { what: 'Old desk hire', state: 'ended' })),
    r.made('installments', part(account, { what: 'Laptop, part 3', state: 'cancelled' })),
    r.made('installments', part(account, { what: 'Laptop, part 1', state: 'paid' })),
  ];
  await r.turn();
  value(r.k.update('accounts', account, { book: acme }, OWNER));
  await r.night();
  const q = r.asked('open')[0]!;
  /* THE NUMBER THE BOOK FIGURES SAY (`figures/books.ts`): not void, not ended, open. */
  assert.equal(r.said(q.id).replace(/^"|"$/gu, ''), '1 Ledger entry, 1 repeating line and 1 instalment are in no book, and their account is in one. File each in its account\'s book?');
  const file = q.body!.options!.find((o) => o.label === 'File them')!;
  assert.equal(file.patches?.length, 3);
  value(r.k.decide(q.id, { decide: { option: file.id, reason: 'They are the company\'s.' } }, 'p_1'));
  for (const e of stands) assert.equal(r.bookOf(e.id), acme, `${e.register} was not filed`);
  for (const e of gone) assert.equal(r.bookOf(e.id), null, `${e.register} that no longer stands was filed`);
  r.sql.close();
});

test('an account that holds only what no longer stands is asked nothing', async () => {
  const r = await money();
  const acme = r.made('books', { name: 'Acme' }).id;
  const account = r.made('accounts', { name: 'Acme current', kind: 'bank', liquid: true, balance: gbp(1_000), as_of: '2026-10-01' }).id;
  r.made('transactions', entry(account, { state: 'void' }));
  await r.turn();
  value(r.k.update('accounts', account, { book: acme }, OWNER));
  await r.night();
  assert.deepEqual(r.asked('open'), []);
  r.sql.close();
});

test('Leave them is remembered: the next night asks nothing, and nothing is filed', async () => {
  const r = await money(beforeAccountFiles());
  const acme = r.made('books', { name: 'Acme' }).id;
  const account = r.made('accounts', { name: 'Acme current', kind: 'bank', liquid: true, balance: gbp(1_000), as_of: '2026-10-01' }).id;
  const e = r.made('transactions', entry(account));
  await r.turn();
  value(r.k.update('accounts', account, { book: acme }, OWNER));
  await r.night();
  const q = r.asked('open')[0]!;
  assert.equal(r.said(q.id).replace(/^"|"$/gu, ''), '1 Ledger entry is in no book, and its account is in one. File it in its account\'s book?');
  const leave = q.body!.options!.find((o) => o.label === 'Leave it')!;
  value(r.k.decide(q.id, { decide: { option: leave.id, reason: 'It was personal.' } }, 'p_1'));
  await r.night();
  await r.night();
  assert.deepEqual(r.asked('open'), [], 'the question was asked again after Leave it');
  assert.equal(r.bookOf(e.id), null);
  r.sql.close();
});

test('a record with no book, or with nothing out of its book, is asked nothing', async () => {
  const r = await money();
  const account = r.made('accounts', { name: 'Current', kind: 'bank', liquid: true, balance: gbp(1_000), as_of: '2026-10-01' }).id;
  r.made('transactions', entry(account));
  await r.night();
  assert.deepEqual(r.asked('open'), []);
  const out = await r.run(String((BOOK_FROM_ACCOUNT_SCRIPT as Fields).source), null);
  assert.deepEqual([out.writes, out.out], [[], null]);
  r.sql.close();
});

/**
 * A BILL TAKES ITS ACCOUNT'S BOOK TOO. Bills and invoices holds the account a bill is paid from or an
 * invoice is paid into, optional as it is on an instalment, and `bill-takes-book` is the fourth rule. Until the list
 * held one there was nothing to take a book from, and a bill was in a book only when somebody filed it there.
 */
test('Bills and invoices holds an account, and a rule of its own files a bill by it', () => {
  const account = (OBLIGATIONS_REGISTER.fields as readonly Fields[]).find((f) => f.id === 'account');
  assert.deepEqual(account, { id: 'account', type: 'ref', to: 'accounts', index: true });
  const rule = RULES.find((r) => r.on.written.register === 'obligations');
  assert.equal(rule?.rule, 'bill-takes-book');
});
test('a bill written with an account in book Acme and no book gets book Acme', async () => {
  const r = await money();
  const b = books(r);
  await r.turn();
  const made = r.made('obligations', bill(b.inAcme));
  assert.equal(r.bookOf(made.id), null, 'a book was typed by the test');
  await r.turn();
  assert.equal(r.bookOf(made.id), b.acme, 'the bill is in no book');
  const said = r.log.filter((l) => /Acme/u.test(l)).join(' ');
  assert.match(said, /Studio insurance is in Acme, the book its account is in\./u);
  assert.doesNotMatch(said, /—|#\d|\brow\b|01[0-9A-Z]{24}/u);
  /* AND NOTHING ELSE ABOUT THE BILL CHANGED. */
  const { book: _b, ...rest } = r.k.get(made.id)!.fields;
  assert.deepEqual(rest, made.fields);
  r.sql.close();
});
test('a bill with its own book keeps it, and one on an account in no book, or on no account, is filed in none', async () => {
  const r = await money();
  const b = books(r);
  const own = r.made('obligations', bill(b.inAcme, { book: b.home }));
  const { account: _a, ...bare } = bill(b.inAcme, { what: 'Council tax' });
  const loose = r.made('obligations', bare);
  assert.equal(r.queued(), 0, 'a bill that names its book, or holds no account, started the script');
  const none = r.made('obligations', bill(b.inNone, { what: 'Old joint fee' }));
  await r.turn();
  assert.equal(r.bookOf(own.id), b.home);
  assert.equal(r.bookOf(loose.id), null);
  assert.equal(r.bookOf(none.id), null);
  assert.equal(r.k.get(none.id)!.version, none.version, 'a bill on an account in no book was written');
  /* PUT ON AN ACCOUNT LATER, it takes that account's book then. */
  value(r.k.update('obligations', loose.id, { account: b.inAcme }, OWNER));
  await r.turn();
  assert.equal(r.bookOf(loose.id), b.acme);
  r.sql.close();
});
/** THE NUMBER `bills-in-no-book` SAYS (`figures/books.ts`): open or part paid, never one paid or written off. */
test('the bills an account already held are counted in the one question while they are open or part paid', async () => {
  const r = await money();
  const acme = r.made('books', { name: 'Acme' }).id;
  const account = r.made('accounts', { name: 'Acme current', kind: 'bank', liquid: true, balance: gbp(1_000_000), as_of: '2026-10-01' }).id;
  const stands = [r.made('obligations', bill(account)), r.made('obligations', bill(account, { what: 'Printer lease', state: 'part' })), r.made('transactions', entry(account))];
  const gone = [r.made('obligations', bill(account, { what: 'Old rates', state: 'paid' })), r.made('obligations', bill(account, { what: 'Lost deposit', state: 'written_off' }))];
  await r.turn();
  value(r.k.update('accounts', account, { book: acme }, OWNER));
  await r.night();
  const q = r.asked('open')[0]!;
  assert.equal(r.said(q.id).replace(/^"|"$/gu, ''), '1 Ledger entry and 2 bills and invoices are in no book, and their account is in one. File each in its account\'s book?');
  const file = q.body!.options!.find((o) => o.label === 'File them')!;
  assert.equal(file.patches?.length, 3);
  value(r.k.decide(q.id, { decide: { option: file.id, reason: 'They are the company\'s.' } }, 'p_1'));
  for (const e of stands) assert.equal(r.bookOf(e.id), acme, `${e.register} was not filed`);
  for (const e of gone) assert.equal(r.bookOf(e.id), null, `${e.register} that no longer stands was filed`);
  r.sql.close();
});

/**
 * MORE THAN ONE PAGE, AND MORE THAN ONE BOOK. A script's list is a page of fifty, so sixty entries are two reads, and
 * all sixty are in the one question. The books are named in `about`, and the gate cuts a name too long to fit.
 */
test('sixty entries on one account are all counted, and two books are both named', async () => {
  const r = await money();
  const acme = r.made('books', { name: 'Acme' }).id;
  const long = r.made('books', { name: `Northgate ${'and Sons '.repeat(12)}Holdings` }).id;
  const bank = (name: string) => r.made('accounts', { name, kind: 'bank', liquid: true, balance: gbp(1_000), as_of: '2026-10-01' }).id;
  const [one, two] = [bank('Acme current'), bank('Northgate current')];
  for (let i = 0; i < 60; i++) r.made('transactions', entry(one, { what: `CEDAR LANE ${i}` }));
  r.made('recurring', repeat(two));
  /* MORE ROUNDS SINCE money-core 3.31.0: every entry also starts the match and the posted-line check. */
  await r.turn(12);
  value(r.k.update('accounts', one, { book: acme }, OWNER));
  value(r.k.update('accounts', two, { book: long }, OWNER));
  await r.night();
  const q = r.asked('open')[0]!;
  assert.equal(r.said(q.id).replace(/^"|"$/gu, ''), '60 Ledger entries and 1 repeating line are in no book, and their accounts are in one. File each in its account\'s book?');
  assert.equal(q.body?.options?.[0]?.patches?.length, 61);
  assert.match(q.body?.about ?? '', /^Acme and 1 more$/u);
  r.sql.close();
});

/**
 * MORE THAN ONE OPTION MAY CARRY IS ASKED IN TURN. "File them" carries at most the two hundred changes the gate lets one
 * option carry; it asked for up to nine hundred, so a record with more than two hundred entries in no book had every
 * nightly run refused and was asked nothing. The first two hundred are asked, and what is left is asked the night after.
 */
test('two hundred and five entries are asked two hundred at a time, and the five left are asked the next night', async () => {
  const r = await money(beforeAccountFiles());
  const acme = r.made('books', { name: 'Acme' }).id;
  const account = r.made('accounts', { name: 'Acme current', kind: 'bank', liquid: true, balance: gbp(1_000), as_of: '2026-10-01' }).id;
  for (let i = 0; i < 205; i++) r.made('transactions', entry(account, { what: `CEDAR LANE ${i}` }));
  /* MORE ROUNDS SINCE money-core 3.31.0: every entry also starts the match and the posted-line check. */
  await r.turn(20);
  value(r.k.update('accounts', account, { book: acme }, OWNER));
  await r.night();
  const q = r.asked('open')[0]!;
  assert.ok(q, 'the run was refused and asked nothing');
  assert.equal(r.said(q.id).replace(/^"|"$/gu, ''), '205 Ledger entries are in no book, and their account is in one. File each in its account\'s book?');
  const file = q.body!.options!.find((o) => o.label === 'File them')!;
  assert.equal(file.patches?.length, 200);
  assert.equal(file.because, 'The first 200 take the book their account is in, and you are asked about the other 5 after.');
  value(r.k.decide(q.id, { decide: { option: file.id, reason: 'They are the company\'s.' } }, 'p_1'));
  await r.night();
  const next = r.asked('open');
  assert.equal(next.length, 1);
  assert.equal(next[0]!.body?.options?.[0]?.patches?.length, 5);
  r.sql.close();
});

test('the night sweep asks about every entry of an account in a book, even more than fifty with their days out of row order', async () => {
  const r = await money();
  const b = books(r);
  /* 120 entries on an account in no book, made on days that do not follow the order they were made in, so the Ledger's
     own order (by day) is not row number order. */
  const made = Array.from({ length: 120 }, (_, i) => {
    const day = String(((i * 37) % 28) + 1).padStart(2, '0');
    return r.made('transactions', entry(b.inNone, { on: `2026-09-${day}`, what: `Payment ${i}` }));
  });
  await r.turn(12);
  value(r.k.update('accounts', b.inNone, { book: b.acme }, OWNER));
  await r.night();
  const open = r.asked('open');
  assert.equal(open.length, 1, JSON.stringify(open));
  assert.equal(open[0]!.body?.options?.[0]?.patches?.length, made.length, 'entries were skipped when the Ledger was read past fifty');
  r.sql.close();
});
