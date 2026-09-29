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
 * message printed no code, which is a currency nobody chose written into every record. On
 * a record the readers are wired into, `scanMoney` takes the code the bank prints beside the figure, so a message that
 * prints one reads as before, and one that prints none goes to a person instead of being filed in a currency guessed
 * for it.
 *
 * ON money-core 3.0.0 OR LATER, AND NOT BEFORE, because a money-core before 3.0.0 declares these four ids itself and
 * the two would collide on the record.
 *
 * EVERY LINE BELOW IS INVENTED: the card digits, the merchants, the amounts and the days are made up.
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

/* ── the file ────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('THE FILE IS card-alerts 1.1.0, on money-core 3.0.0 or later, with the two wordings and their twins', async () => {
  const doc = file();
  assert.deepEqual([doc.pack, doc.version], ['card-alerts', '1.1.0']);
  assert.deepEqual((doc.requires as { packs: unknown }).packs, { 'money-core': '>=3.0.0 <4.0.0' });
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
  /* NO CURRENCY IS WRITTEN IN, so an alert is read in the code it prints or not read at all. */
  for (const d of doc.declarations) {
    const amount = (d.extract as { amount?: { money?: Body } }).amount?.money;
    assert.ok(amount, `${String(d.ingest)} reads no amount`);
    assert.equal(amount.currency, undefined, `${String(d.ingest)} falls back on a currency nobody chose`);
  }
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
  assert.equal(api.kernel.packs().find((p) => p.id === 'card-alerts')?.version, '1.1.0');
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
    [charge.what, charge.direction, charge.on, charge.account, charge.amount],
    ['FENWICK CLOUD', 'out', '2026-09-18', card, { amount: 4_299, currency: 'GBP' }],
    'the card digits were read as the amount, or the money is not in minor units',
  );

  const back = mail(k, CREDIT, 'credit');
  assert.deepEqual([back.state, back.ingest, back.confidence], ['matched', 'bank-card-in', 'exact'], back.reason);
  const paid = k.get(back.wrote[0]!)!.fields;
  assert.deepEqual([paid.what, paid.direction, paid.on, paid.amount], ['ALDER REALTY', 'in', '2026-08-29', { amount: 500_500, currency: 'GBP' }]);

  assert.equal(k.count('transactions'), before + 2);
  sql.close();
});

test('THE CODE THE ALERT PRINTS IS THE ONE READ, and an alert that prints none goes to a person', async () => {
  const { api, sql } = await withReaders();
  const k = api.kernel;
  const before = k.count('transactions');
  const euro = mail(k, `Your card ending ${DIGITS} was debited EUR 12.50 at CEDAR LANE BAKERY on 17/09/26.`, 'euro');
  assert.deepEqual([euro.state, euro.ingest], ['matched', 'bank-card-out'], euro.reason);
  assert.deepEqual(k.get(euro.wrote[0]!)!.fields.amount, { amount: 1_250, currency: 'EUR' });

  const bare = mail(k, `Your card ending ${DIGITS} was debited 12.50 at CEDAR LANE BAKERY on 16/09/26.`, 'no-code');
  assert.equal(bare.ingest, 'bank-card-out');
  assert.equal(bare.state, 'review', `an amount with no currency was ${bare.state}: ${bare.reason}`);
  assert.equal(k.count('transactions'), before + 1, 'an amount with no currency was written in one somebody guessed');
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

/* ── the Shortcut's door ─────────────────────────────────────────────────────────────────────────────────────────── */

test('A TEXT POSTED AT A TWIN IS READ AS ITS MAIL PATTERN READS IT', async () => {
  const { api, sql, card } = await withReaders();
  const k = api.kernel;
  const out = text(k, 'bank-card-out-sms', CHARGE, 'charge-text');
  assert.deepEqual([out.state, out.ingest, out.confidence], ['matched', 'bank-card-out-sms', 'exact'], out.reason);
  const row = k.get(out.wrote[0]!)!.fields;
  assert.deepEqual([row.what, row.direction, row.account, row.amount], ['FENWICK CLOUD', 'out', card, { amount: 4_299, currency: 'GBP' }]);
  const back = text(k, 'bank-card-in-sms', CREDIT, 'credit-text');
  assert.deepEqual([back.state, back.ingest], ['matched', 'bank-card-in-sms'], back.reason);
  sql.close();
});
