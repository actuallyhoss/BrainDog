/**
 * Card alerts as a pack file: a card alert naming the card's last four digits, read into Money's `transactions`, by
 * mail or by a text message a phone Shortcut posts.
 *
 * THE FOUR PATTERNS WERE money-core's OWN until 3.0.0, `MONEY_INGESTS` and their `-sms` twins in
 * `packages/seed/src/modules/money.ts`, spread into every first-party document by `INGESTS` in
 * `packages/seed/src/index.ts`. So every record set up with Money carried an English bank alert's wording and a text
 * door for it, whether its owner banked by card, by cash or not at all, and a bank SMS pattern is exactly the kind of use
 * case the shell may not carry. They are this file now, and a record takes them by installing it.
 *
 * THE SAME READINGS, WITH ONE THING TAKEN OUT: THE CURRENCY FALLBACK. money-core's patterns fell back on `GBP` when a
 * message printed no code, which is a currency nobody chose written into every record. On a record the readers are
 * wired into, `scanMoney` takes the code the alert prints beside the figure, and since 1.3.0 a figure printed with none
 * is in the currency of the card the digits found, which somebody did choose: the card's own.
 *
 * ON money-core 3.0.0 OR LATER, AND NOT BEFORE, because a money-core before 3.0.0 declares these four ids itself and
 * the two would collide on the record.
 *
 * EVERY LINE BELOW IS BUILT FOR THE TEST, AND SAYS SO HERE BECAUSE THE BANK'S OWN PACK HOLDS ONLY ITS OWN WORDING. These
 * two sentences are no bank's: `loop/research-bank-real.md` found none of a hundred real texts written this way, so there
 * is no real line to scrub. The card digits, the merchants, the amounts and the days are made up, save two public shop
 * names, Chillout and Talabat, whose spellings 1.2.0's test holds. The person named is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import type { Arrived, Kernel } from '../../packages/kernel/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 8, 20, 12);
const TODAY = '2026-09-20';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[]; adds: { id: string }[] };
type Body = Record<string, unknown>;

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./card-alerts.pack.json', import.meta.url);
const file = (): Body & { declarations: Body[] } => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;

/** The four, spelled out, so a pattern lost from the file fails here rather than being counted away. */
const FOUR = ['ingest.bank-card-in', 'ingest.bank-card-in-sms', 'ingest.bank-card-out', 'ingest.bank-card-out-sms'];

const DIGITS = '4471';
const CHARGE = `Your card ending ${DIGITS} was debited GBP 42.99 at FENWICK CLOUD on 18/09/26. If this was not you, call us.`;
const CREDIT = `Your card ending ${DIGITS} was credited GBP 5,005.00 from ALDER REALTY on 29/08/26.`;

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

async function put(api: Api, doc: unknown): Promise<void> {
  const diff = await planOf(api, doc);
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/**
 * The record a person has once they install every first-party pack and then this file, THROUGH `createRecordApi`,
 * because the near rule needs `@braindog/extract`'s `isDuplicate`, the dates need `scanDates` and the money needs
 * `scanMoney`, which only the record hands down. `withPack` false is the same record without it.
 */
async function withReaders(withPack = true): Promise<{ api: Api; sql: NodeSql; card: string }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) await put(api, firstPartyDocument(id));
  if (withPack) await put(api, file());
  const card = said<{ id: string }>(
    api.kernel.create('accounts', { name: 'Company card', kind: 'card', balance: { amount: 0, currency: 'GBP' }, as_of: TODAY, liquid: false, last4: DIGITS } as never, { actor: 'p_1' }),
  ).id;
  return { api, sql, card };
}

const mail = (k: Kernel, body: string, sha256: string): Arrived =>
  said<Arrived>(k.arrive({ channel: 'email', headers: { From: 'alerts@bank.example', Subject: 'Card transaction' }, body, sha256 }));

/* THROUGH A TWIN'S DOOR, VERIFIED, which is how the host hands the record a text whose path token checked out. */
const text = (k: Kernel, ingest: string, body: string, sha256: string): Arrived =>
  said<Arrived>(k.arrive({ channel: 'webhook', ingest, body, sha256, verified: true }));

/** Money's own payee field (money-core 3.10.0), which every bank door writes and none lays. */
const moneysPayee = (): unknown =>
  ((firstPartyDocument('money-core') as { declarations: { register?: string; fields?: { id: string }[] }[] }).declarations
    .find((d) => d.register === 'transactions')?.fields ?? []).find((f) => f.id === 'counterparty_text');

/* ── the file ────────────────────────────────────────────────────────────────────────────────────────────────────── */

/* 1.2.0 IS A MINOR STEP: each wording keeps the shop or the sender as printed in `counterparty_text`, which money-core
   3.10.0 declares on its ledger, so the floor moves to 3.10.0 and the pack lays nothing. Laid by the pack, even in
   Money's own shape, the ledger was staged as the record's own list, and a record that took the pack on an older Money
   was refused money-core 3.10.0 itself ("register.transactions was written in this record"), so the field is Money's
   alone.
   1.3.0 IS A MINOR STEP ON THE SAME FLOOR: a figure with no code is in the card's own currency, and each lookup says it
   finds a card, finds only a card, and reads a card's digits as one or more values, for a card the bank replaced. */
test('THE FILE IS card-alerts 1.3.0, on money-core 3.10.0 or later, with the two wordings and their twins', async () => {
  const doc = file();
  assert.deepEqual([doc.pack, doc.version], ['card-alerts', '1.3.1']);
  assert.equal(doc.extends, undefined, 'the payee field is Money\'s, and a pack laying it blocks Money\'s own update');
  assert.deepEqual((doc.requires as { packs: unknown }).packs, { 'money-core': '>=3.10.0 <4.0.0' });
  assert.deepEqual(doc.declarations.map((d) => `ingest.${String(d.ingest)}`).sort(), FOUR);
  /* EACH TWIN IS ITS MAIL PATTERN BEHIND A PATH TOKEN, and nothing else, so a wording fixed in one is fixed in both. */
  for (const twin of doc.declarations.filter((d) => d.channel === 'webhook')) {
    const mailed = doc.declarations.find((d) => `${String(d.ingest)}-sms` === twin.ingest);
    assert.ok(mailed, `${String(twin.ingest)} has no mail pattern`);
    assert.deepEqual(twin.verify, { kind: 'path' });
    const { ingest: _t, channel: _c, verify: _v, ...rest } = twin;
    const { ingest: _m, channel: _n, ...same } = mailed;
    assert.deepEqual(rest, same, `${String(twin.ingest)} reads differently from its mail pattern`);
  }
  /* NO CURRENCY IS WRITTEN IN: an alert is read in the code it prints, or else in its card's. */
  for (const d of doc.declarations) {
    const extract = d.extract as { amount?: { money?: Body }; account?: { lookup?: Body } };
    assert.ok(extract.amount?.money, `${String(d.ingest)} reads no amount`);
    assert.deepEqual(extract.amount.money.currency, { of: 'account', field: 'balance' }, `${String(d.ingest)} falls back on a currency nobody chose`);
    const lookup = extract.account?.lookup;
    assert.deepEqual([lookup?.says, lookup?.where, lookup?.split], ['card', 'kind is card', true], `${String(d.ingest)} does not say it finds only a card`);
  }
  assert.ok(!JSON.stringify(doc).includes('"GBP"'), 'a currency nobody chose is written into the file');
  const opened = said<{ pack: { manifest: { pack: string } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.equal(opened.pack.manifest.pack, 'card-alerts');
});

test('BEFORE THE PACK: a record with every first-party pack declares none of the four and leaves a card alert untriaged', async () => {
  const { api, sql } = await withReaders(false);
  const ids = api.kernel.declarations().map((d) => d.id);
  assert.deepEqual(FOUR.filter((id) => ids.includes(id)), [], 'a first-party pack still declares a card alert');
  const out = mail(api.kernel, CHARGE, 'before-the-pack');
  assert.deepEqual([out.state, out.ingest], ['untriaged', null]);
  assert.equal(await api.ingestVerify({ ingest: 'bank-card-out-sms' }), null, 'a text door is open with nothing installed');
  sql.close();
});

test('INSTALLED FROM THE FILE: four patterns, nothing refused, and the text doors answer', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) await put(api, firstPartyDocument(id));
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.adds.map((a) => a.id).sort(), FOUR);
  await put(api, file());
  assert.equal(api.kernel.packs().find((p) => p.id === 'card-alerts')?.version, '1.3.1');
  /* A TWIN WITH NO TOKEN MINTED IS A DOOR THAT MATCHES NOTHING YET, which is `none` and not `null`. */
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-card-out-sms' }), { kind: 'none' });
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-card-in-sms' }), { kind: 'none' });
  sql.close();
});

/* ── what each wording writes ────────────────────────────────────────────────────────────────────────────────────── */

test('A CHARGE AND A CREDIT BECOME ROWS at exact, each in its own direction, on the card its digits name', async () => {
  const { api, sql, card } = await withReaders();
  const k = api.kernel;
  const before = k.count('transactions');

  const out = mail(k, CHARGE, 'charge');
  assert.deepEqual([out.state, out.ingest, out.confidence], ['matched', 'bank-card-out', 'exact'], out.reason);
  const charge = k.get(out.wrote[0]!)!.fields;
  assert.deepEqual(
    [charge.what, charge.counterparty_text, charge.direction, charge.on, charge.account, charge.amount],
    ['FENWICK CLOUD', 'FENWICK CLOUD', 'out', '2026-09-18', card, { amount: 4_299, currency: 'GBP' }],
    'the card digits were read as the amount, or the money is not in minor units',
  );

  const back = mail(k, CREDIT, 'credit');
  assert.deepEqual([back.state, back.ingest, back.confidence], ['matched', 'bank-card-in', 'exact'], back.reason);
  const paid = k.get(back.wrote[0]!)!.fields;
  assert.deepEqual([paid.what, paid.counterparty_text, paid.direction, paid.on, paid.amount], ['ALDER REALTY', 'ALDER REALTY', 'in', '2026-08-29', { amount: 500_500, currency: 'GBP' }]);

  assert.equal(k.count('transactions'), before + 2);
  sql.close();
});

/**
 * THE CODE THE ALERT PRINTS FIRST, AND THE CARD'S OWN WHEN IT PRINTS NONE. Until 1.3.0 an alert with no code waited for
 * a person; now it is in the currency the card is kept in, so an Egyptian card's alert files in Egyptian pounds and a
 * sterling card's in sterling, and neither is a currency the pack picked.
 */
test('THE CODE THE ALERT PRINTS IS THE ONE READ, and an alert that prints none is in its card\'s currency', async () => {
  const { api, sql, card } = await withReaders();
  const k = api.kernel;
  const euro = mail(k, `Your card ending ${DIGITS} was debited EUR 12.50 at CEDAR LANE BAKERY on 17/09/26.`, 'euro');
  assert.deepEqual([euro.state, euro.ingest], ['matched', 'bank-card-out'], euro.reason);
  assert.deepEqual(k.get(euro.wrote[0]!)!.fields.amount, { amount: 1_250, currency: 'EUR' });

  const sterling = mail(k, `Your card ending ${DIGITS} was debited 12.50 at CEDAR LANE BAKERY on 16/09/26.`, 'no-code');
  assert.deepEqual([sterling.state, sterling.ingest], ['matched', 'bank-card-out'], sterling.reason);
  assert.deepEqual([k.get(sterling.wrote[0]!)!.fields.account, k.get(sterling.wrote[0]!)!.fields.amount], [card, { amount: 1_250, currency: 'GBP' }]);

  const pounds = said<{ id: string }>(
    k.create('accounts', { name: 'Cairo card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: TODAY, liquid: false, last4: '7702' } as never, { actor: 'p_1' }),
  ).id;
  const egp = mail(k, 'Your card ending 7702 was debited 979.99 at TALABAT on 15/09/26.', 'no-code-egp');
  assert.deepEqual([egp.state, egp.ingest], ['matched', 'bank-card-out'], egp.reason);
  assert.deepEqual([k.get(egp.wrote[0]!)!.fields.account, k.get(egp.wrote[0]!)!.fields.amount], [pounds, { amount: 97_999, currency: 'EGP' }]);
  sql.close();
});

/**
 * A CARD ALERT IS NEVER FILED ON AN ACCOUNT, however its digits end (`where: kind is card`). A current account ending
 * 4471 beside the card made two candidates and the alert waited; with only the account, the charge was filed on it.
 */
test('A CARD ALERT FILES ONLY ON A CARD: an account ending in the same digits is never its account', async () => {
  const { api, sql, card } = await withReaders();
  const k = api.kernel;
  const current = said<{ id: string }>(
    k.create('accounts', { name: 'Current account', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: TODAY, liquid: true, last4: DIGITS } as never, { actor: 'p_1' }),
  ).id;
  const out = mail(k, CHARGE, 'charge-beside-account');
  assert.deepEqual([out.state, out.ingest], ['matched', 'bank-card-out'], out.reason);
  assert.equal(k.get(out.wrote[0]!)!.fields.account, card);

  said(k.update('accounts', card, { last4: '0000' } as never, { actor: 'p_1', version: k.get(card)!.version }));
  const next = mail(k, CREDIT, 'credit-no-card');
  assert.notEqual(next.state, 'matched', `a card alert was filed on an account: ${next.reason}`);
  const on = (account: string) => said<{ rows: { fields: Body }[] }>(k.list({ register: 'transactions', limit: 200 })).rows.filter((r) => r.fields.account === account).length;
  assert.deepEqual([on(card), on(current)], [1, 0]);
  sql.close();
});

/**
 * THE MAIL AND THE TEXT OF ONE ALERT ARE ONE ROW: the same amount, card, day and shop, through two doors. These
 * sentences print no balance or limit, so two equal charges at one shop within a day of each other still read as one
 * alert said twice, and the second is skipped with its reason; the bank's own pack, whose alerts print a limit, keeps
 * both (`packs/bank-hsbc-eg`).
 */
test('THE MAIL AND THE TEXT OF ONE ALERT ARE ONE ROW', async () => {
  const { api, sql, card } = await withReaders();
  const k = api.kernel;
  assert.equal(mail(k, CHARGE, 'charge-mail').state, 'matched');
  const texted = text(k, 'bank-card-out-sms', CHARGE, 'charge-text-too');
  assert.deepEqual([texted.ingest, texted.state], ['bank-card-out-sms', 'skipped'], texted.reason);
  const rows = said<{ rows: { fields: Body }[] }>(k.list({ register: 'transactions', limit: 200 })).rows.filter((r) => r.fields.account === card);
  assert.equal(rows.length, 1);
  sql.close();
});

test('A MESSAGE NAMING BOTH VERBS IS CLAIMED BY NEITHER, and a refund, a PIN reminder and a balance are skipped', async () => {
  const { api, sql } = await withReaders();
  const k = api.kernel;
  const before = k.count('transactions');
  /* A WRONG SIGN AT exact IS THE WORST THIS LAYER CAN DO, since nothing downstream doubts an exact row, so each pattern
     refuses the other's verb and a message carrying both lands untriaged, where a person reads it. */
  const both = mail(k, `Your card ending ${DIGITS} was debited GBP 42.99 at FENWICK CLOUD on 18/09/26, and credited GBP 1.00 from ALDER REALTY on 18/09/26.`, 'both');
  assert.deepEqual([both.state, both.ingest], ['untriaged', null]);

  for (const [what, body] of [
    ['a refund', `Your card ending ${DIGITS} was debited GBP 42.99 at FENWICK CLOUD on 18/09/26. This reverses a refund.`],
    ['a PIN reminder', `Your card ending ${DIGITS} was debited GBP 0.00 at your bank on 18/09/26. Keep your PIN safe.`],
    ['a balance', `Your card ending ${DIGITS} was credited GBP 10.00 from SAVINGS on 18/09/26. Your balance is GBP 10.00.`],
  ] as const) {
    const out = mail(k, body, `skip-${what}`);
    assert.equal(out.state, 'skipped', `${what} was ${out.state}: ${out.reason}`);
  }
  assert.equal(k.count('transactions'), before, 'a message that is not one movement wrote a row');
  sql.close();
});

test('THE SAME ALERT FORWARDED AGAIN IS ONE ROW, because the near key reads the amount, the card, the day and the merchant', async () => {
  const { api, sql, card } = await withReaders();
  const k = api.kernel;
  assert.equal(mail(k, CHARGE, 'charge-1').state, 'matched');
  /* DIFFERENT BYTES, THE SAME MESSAGE: a forwarded copy carries the forward's own line above it, so the raw's hash does
     not catch it and the dedupe has to. */
  const again = mail(k, `Fwd: ${CHARGE}`, 'charge-1-fwd');
  assert.equal(again.state, 'skipped', `a resend was ${again.state}: ${again.reason}`);
  const rows = said<{ rows: { fields: Body }[] }>(k.list({ register: 'transactions', limit: 200 })).rows.filter((r) => r.fields.account === card);
  assert.equal(rows.length, 1);
  sql.close();
});

/* ── the payee, kept as printed (1.2.0) ─────────────────────────────────────────────────────────────────────────────── */

/**
 * ONE CAFE, FIVE SPELLINGS, as an Egyptian card alert prints them: as itself and behind each acquirer's prefix. This
 * pack strips nothing, so `what` and `counterparty_text` are both the name as printed; folding the five into one payee is
 * the kernel's key (`keyOf('bank', ...)`), which takes the prefixes off there, once, for every bank door. Each charge has
 * its own amount, so the near rule sees five payments and not one alert sent five times.
 */
const CHILLOUT = ['CHILLOUT', 'GEIDEA*CHILLOUT', 'PAYMOB-CHILLOUT', 'FAWRY*Chillout', 'KASHIER*CHILLOUT'] as const;
const spentAt = (merchant: string, n: number): string => `Your card ending ${DIGITS} was debited EGP ${85 + n}.00 at ${merchant} on 1${n}/09/26.`;

test('EACH ALERT KEEPS THE PAYEE AS PRINTED: five spellings of one cafe, Talabat two ways, and a sender by name', async () => {
  const { api, sql } = await withReaders();
  const k = api.kernel;
  const payees = [...CHILLOUT, 'TALABAT', 'talabat.com'].map((merchant, n) => {
    const out = mail(k, spentAt(merchant, n), `payee-${n}`);
    assert.deepEqual([out.state, out.ingest], ['matched', 'bank-card-out'], `${merchant}: ${out.reason}`);
    const row = k.get(out.wrote[0]!)!.fields;
    assert.equal(row.what, merchant);
    return row.counterparty_text;
  });
  assert.deepEqual(payees, [...CHILLOUT, 'TALABAT', 'talabat.com']);

  /* A CREDIT FROM A PERSON, in the capitals and the four names a transfer prints: the sender is the payee. */
  const back = mail(k, `Your card ending ${DIGITS} was credited EGP 1,500.00 from NOURA SAMIR ABDEL HAMID on 19/09/26.`, 'payee-person');
  assert.deepEqual([back.state, back.ingest], ['matched', 'bank-card-in'], back.reason);
  assert.equal(k.get(back.wrote[0]!)!.fields.counterparty_text, 'NOURA SAMIR ABDEL HAMID');
  sql.close();
});

/**
 * NO BANK DOOR LAYS THE PAYEE, so a record that takes card alerts and a bank's own pack holds one field, Money's, and not
 * a refusal: two packs laying `counterparty_text` in two shapes was `PROVIDES_CONFLICT` for the second.
 */
test('BESIDE ANOTHER BANK DOOR: the payee field is Money\'s once and both packs install', async () => {
  const { api, sql } = await withReaders();
  const hsbc = JSON.parse(readFileSync(new URL('../bank-hsbc-eg/bank-hsbc-eg.pack.json', import.meta.url), 'utf8')) as Body;
  /* THE BANK'S PACK LAYS ITS OWN REFERENCE SINCE 1.7.0, under its own id, and still not the payee. */
  const laid = ((hsbc.extends as Record<string, { fields: Body[] }> | undefined)?.['register.transactions']?.fields ?? []).map((f) => f.id);
  assert.deepEqual([laid, file().extends], [['hsbc_reference'], undefined], 'a bank door lays the payee field again');
  await put(api, hsbc);
  const ledger = api.kernel.declarations().find((d) => d.id === 'register.transactions');
  /* THE BODY IS STORED AS ITS JSON TEXT. */
  const body = (typeof ledger?.body === 'string' ? JSON.parse(ledger.body) : ledger?.body) as { fields?: Body[] } | undefined;
  assert.deepEqual((body?.fields ?? []).filter((f) => f.id === 'counterparty_text'), [moneysPayee()]);
  sql.close();
});

/* ── the Shortcut's door ─────────────────────────────────────────────────────────────────────────────────────────── */

test('A TEXT POSTED AT A TWIN IS READ AS ITS MAIL PATTERN READS IT', async () => {
  const { api, sql, card } = await withReaders();
  const k = api.kernel;
  const out = text(k, 'bank-card-out-sms', CHARGE, 'charge-text');
  assert.deepEqual([out.state, out.ingest, out.confidence], ['matched', 'bank-card-out-sms', 'exact'], out.reason);
  const row = k.get(out.wrote[0]!)!.fields;
  assert.deepEqual([row.what, row.counterparty_text, row.direction, row.account, row.amount], ['FENWICK CLOUD', 'FENWICK CLOUD', 'out', card, { amount: 4_299, currency: 'GBP' }]);
  const back = text(k, 'bank-card-in-sms', CREDIT, 'credit-text');
  assert.deepEqual([back.state, back.ingest], ['matched', 'bank-card-in-sms'], back.reason);
  sql.close();
});
