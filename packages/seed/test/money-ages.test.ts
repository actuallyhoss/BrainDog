/**
 * A balance's age is what the bank last said, and a row's currency comes from its account, as
 * money-core 3.16.0 declares them, read through the kernel on a record that installed Money the way a person does.
 *
 * RED FIRST: with `cash-as-of` back on `{ min: 'as_of' }` and `balances-stale` on `as_of before -7d`, the second test
 * reads the account as out of date after the bank said its balance today; with the book's cards back on
 * `stale: { field: 'as_of', after: '7d' }`, the card keeps the typed day; with `currency_from` off the Ledger's amount, a
 * bare amount is refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, NOW, RULES, day, firstPartyDocument } from '../src/index.ts';
import { MONEY_PAGES } from '../src/modules/money/index.ts';

const OWNER = { actor: 'p_1' };
const egp = (amount: number) => ({ amount, currency: 'EGP' });

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
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

/** A record holding money-core as the pack document says it, with no example rows. */
async function moneyCore(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

/** One book, Personal, with an account in EGP whose balance was typed thirty days ago. */
async function oldAccount(): Promise<{ k: Kernel; account: string; book: string }> {
  const k = await moneyCore();
  const book = value<{ id: string }>(k.create('books', { name: 'Personal' }, OWNER)).id;
  const made = value<{ id: string }>(k.create('accounts', { name: 'HSBC (EGP)', kind: 'bank', liquid: true, balance: egp(1_000_000), as_of: day(-30), book }, OWNER));
  return { k, account: made.id, book };
}

const read = (k: Kernel, id: string): number | null => {
  const out = k.metric(METRICS[id] as never);
  assert.ok(out.ok, sayOf(out));
  return out.value.value as number | null;
};

const epochDay = (d: string): number => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

type Drawn = { heading?: string; body?: string; drawn?: boolean; rows?: { fields: Record<string, unknown> }[]; refusals?: unknown[] };
const blocksOf = (k: Kernel, slug: string): Drawn[] => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  return (out.value as { blocks: Drawn[] }).blocks;
};
const bookSlug = (k: Kernel): string => {
  const page = (k.pages() as { slug: string; title: string }[]).find((p) => p.title === '{{name}}' || p.slug.includes('personal'));
  assert.ok(page, 'the book Personal has no page');
  return page.slug;
};

test('NO MONEY FIGURE, RULE OR CARD READS THE TYPED DAY FOR AN AGE: each reads the roll, which a bank message moves', () => {
  for (const [id, m] of Object.entries(METRICS)) {
    if (m.source !== 'register.accounts') continue;
    const v = m.value as Record<string, unknown>;
    for (const word of ['min', 'max', 'age']) assert.notEqual(v[word], 'as_of', `${id} reads the typed day as an age`);
    assert.ok(!/\bas_of (before|after|at)/u.test(String(m.where ?? '')), `${id} counts accounts by their typed day`);
  }
  for (const [id, r] of Object.entries(RULES)) if (r.register === 'accounts') assert.ok(!/\bas_of\b/u.test(String(r.when)), `${id} tells by the typed day`);
  assert.ok(!('cash-stale' in RULES), 'cash-stale still tells of a typed day a week old');
  for (const [slug, page] of Object.entries(MONEY_PAGES))
    for (const b of page.blocks as { kind?: string; source?: string; stale?: { figure?: string } }[])
      if (b.kind === 'cards' && b.source === 'register.accounts' && b.stale)
        assert.equal(b.stale.figure, 'account-ages', `${slug}: an account card is dated by the day somebody typed`);
});

test('AN ACCOUNT TYPED THIRTY DAYS AGO IS NAMED, AND LEAVES THE LINE THE DAY A BANK MESSAGE SAYS ITS BALANCE', async () => {
  const { k, account } = await oldAccount();
  assert.equal(read(k, 'balances-stale'), 1);
  assert.equal(read(k, 'cash-as-of'), epochDay(day(-30)));
  assert.equal(read(k, 'statement-oldest-days'), 30);

  /* MONEY SAYS IT UNDER ITS HERO (in Heads up until money-core 3.34.0), AND THE BOOK'S ACCOUNTS CARDS NAME THE ACCOUNT
     WITH ITS DAY: Last confirmed is off Money
     since money-where-it-went-100, and each account's last confirmed day is on its book's page. */
  const before = blocksOf(k, 'money');
  assert.notEqual(before.find((b) => String(b.body).startsWith('Oldest balance'))?.drawn, false, 'the old balance is not said');
  const tile = blocksOf(k, bookSlug(k)).find((b) => b.heading === 'Accounts');
  assert.ok(tile && tile.drawn !== false, "the book's Accounts cards are not drawn");
  assert.deepEqual(tile.rows?.map((r) => [r.fields.name, r.fields.as_of]), [['HSBC (EGP)', day(-30)]]);
  const card = () => blocksOf(k, bookSlug(k)).find((b) => b.heading === 'Accounts')?.rows?.[0]?.fields.as_of;
  assert.equal(card(), day(-30));

  /* A BANK MESSAGE FILES A MOVEMENT THAT PRINTS THE BALANCE AFTER IT. The account's typed day is untouched. */
  value(k.create('transactions', { on: day(0), what: 'Card payment', direction: 'out', amount: egp(5_000), balance_after: egp(995_000), account, state: 'cleared' }, OWNER));
  assert.equal(k.get(account)!.fields.as_of, day(-30), 'the account row was written');
  assert.equal(read(k, 'balances-stale'), 0);
  assert.equal(read(k, 'cash-as-of'), epochDay(day(0)));
  assert.equal(read(k, 'statement-oldest-days'), 0);
  /* THE OLD BALANCE'S LINE GOES WITH IT, and with it its Update balances: the box that took today's balance is off Money,
    and that line opens the same form. */
  assert.equal(blocksOf(k, 'money').find((b) => String(b.body).startsWith('Oldest balance'))?.drawn, false, 'the old balance is said with nothing old');
  assert.equal(card(), day(0), "the book's card keeps the typed day");
});

test('A BALANCE CHECK IS A STATEMENT TOO, and only an account none has confirmed this week is counted', async () => {
  const { k, account, book } = await oldAccount();
  value(k.create('balances', { account, balance: egp(990_000), as_of: day(-1), source: 'Counted' }, OWNER));
  assert.equal(read(k, 'balances-stale'), 0);
  assert.equal(read(k, 'cash-as-of'), epochDay(day(-1)));
  /* A SECOND ACCOUNT TYPED TEN DAYS AGO, which nothing has said since, is the one the line counts. */
  value(k.create('accounts', { name: 'Cash box', kind: 'cash', liquid: true, balance: egp(20_000), as_of: day(-10), book }, OWNER));
  assert.equal(read(k, 'balances-stale'), 1);
  assert.equal(read(k, 'cash-as-of'), epochDay(day(-10)));
  /* EACH ACCOUNT ON ITS BOOK'S CARDS, in the order they were made, as Money's Last confirmed cards were. */
  assert.deepEqual(blocksOf(k, bookSlug(k)).find((b) => b.heading === 'Accounts')?.rows?.map((r) => [r.fields.name, r.fields.as_of]), [['HSBC (EGP)', day(-1)], ['Cash box', day(-10)]]);
});

test('A LEDGER AMOUNT WITH NO CURRENCY TAKES ITS ACCOUNT’S, and a row’s currency never changes once kept', async () => {
  const { k, account } = await oldAccount();
  const made = value<{ id: string; fields: Record<string, unknown> }>(k.create('transactions', { on: day(0), what: 'Card payment', direction: 'out', amount: { amount: 97_999 }, account, state: 'cleared' }, OWNER));
  assert.deepEqual(k.get(made.id)!.fields.amount, egp(97_999));

  /* ITS OWN CODE IS KEPT AS WRITTEN, and changing it afterwards is refused with the way to do it. */
  const usd = value<{ id: string }>(k.create('transactions', { on: day(0), what: 'Card payment', direction: 'out', amount: { amount: 2_000, currency: 'USD' }, account, state: 'cleared' }, OWNER));
  assert.deepEqual(k.get(usd.id)!.fields.amount, { amount: 2_000, currency: 'USD' });
  const moved = k.update('transactions', usd.id, { amount: egp(2_000) }, OWNER) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(moved.ok, false, 'a row changed its currency');
  assert.equal(moved.refusal?.code, 'CURRENCY_FIXED');

  /* A BALANCE CHECK AND AN INSTALMENT TAKE THE ACCOUNT'S TOO. */
  const check = value<{ id: string }>(k.create('balances', { account, balance: { amount: 900_000 }, as_of: day(0) }, OWNER));
  assert.deepEqual(k.get(check.id)!.fields.balance, egp(900_000));
  const part = value<{ id: string }>(k.create('installments', { what: 'Laptop', plan: 'Laptop', direction: 'out', amount: { amount: 150_000 }, due: day(20), account }, OWNER));
  assert.deepEqual(k.get(part.id)!.fields.amount, egp(150_000));
});
