/**
 * One bank's alert wordings as a pack file: HSBC Egypt's mails and texts read into Money's `transactions`.
 *
 * THE DOCUMENT WAS A FUNCTION IN `packages/seed`. `bankHsbcEgPack` in `packages/seed/src/packs/bank-hsbc-eg.ts` built
 * it in code, so the shell carried one person's bank as TypeScript, which nothing in `packages/` may do.
 * It is now `bank-hsbc-eg.pack.json`, installed through the record's own `planPack` and `installPack`. The builder went
 * once the import resolved the pack by id from the catalogue, and until then the first test
 * held the file to what it built, byte for byte in meaning; they were still equal when it was deleted. The file is the
 * only copy now.
 *
 * THE TESTS ARE THE ONES THAT READ THE BANK'S LINES, MOVED FROM `packages/seed/test` (`bank-hsbc-eg.test.ts`,
 * `bank-not-mine.test.ts` and the HSBC half of `money-bank.test.ts`), and they now stand on the file. Those three
 * forwarded into the sample record, which carried the twelve patterns only so that they had something to forward into;
 * here the record is the one a person has when they install this pack, the first-party packs and then this file.
 *
 * EVERY MOVEMENT BELOW IS THE BANK'S OWN WORDING, SCRUBBED (1.7.0). Each is one of the shapes his real messages take, word
 * for word as `loop/research-bank-real.md` records them from a hundred of his forwarded texts: the card alert with three
 * stars before the digits and its full stop after the shop, the InstaPay transfer printing eight stars, four digits and
 * its closing sentence, the `From HSBC:` line with its branch code, three stars, three digits and the sign glued to the
 * figure. The values in them are changed: the digits, the branch code, the amounts, the days, the references and the
 * names are made up, and none of them is anybody's. The two public shop names, Chillout and Talabat, stay, because how
 * the bank spells a shop is what 1.6.0's tests hold. The bodies themselves were never kept in the tree, so no line here
 * can be one of his. The lines that are not one of those movements are built for the test and say so where they stand:
 * the account line with no sign or a spaced one, the balance message, `packs/card-alerts`' two generic sentences, the
 * texts at the door that are not the bank's, and the two lines carrying both signs.
 *
 * RED FIRST, MEASURED. With no file, twelve of the thirteen failed ENOENT, and the thirteenth is the
 * one that holds a record with every first-party pack to leaving this bank's card alert `untriaged`, so nothing here
 * passes because money-core already reads the line. With `SIGNED_DEBIT` taken out of `bank-from-in`'s `none:` in the
 * file, two failed: the builder comparison, since removed, and the claims test on the line carrying both glued signs,
 * so the claims test is asked of the file and not of the builder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { keyOf, openRecord, type Arrived, type Kernel } from '../../packages/kernel/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 8, 3, 12);
const TODAY = '2026-09-03';
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
const PACK_FILE = new URL('./bank-hsbc-eg.pack.json', import.meta.url);
const file = (): Body & { declarations: Body[] } => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;

/** The door the Shortcut posts every text to, read off the file: the one twin the other six name as their `door:`. */
const door = (): string => String(file().declarations.find((d) => typeof d.door === 'string')!.door);

/**
 * The six wordings and their twins, the balance message and its twin (1.4.0), and the door's catch-all: fifteen, spelled
 * out so a pattern lost from the file fails here.
 */
const FIFTEEN = [
  'ingest.bank-balance', 'ingest.bank-balance-sms', 'ingest.bank-card-used', 'ingest.bank-card-used-sms', 'ingest.bank-from-in', 'ingest.bank-from-in-sms',
  'ingest.bank-from-out', 'ingest.bank-from-out-sms', 'ingest.bank-from-unsure', 'ingest.bank-from-unsure-sms',
  'ingest.bank-ipn-in', 'ingest.bank-ipn-in-sms', 'ingest.bank-ipn-out', 'ingest.bank-ipn-out-sms', 'ingest.bank-not-mine-sms',
];

/* ── the lines, the bank's own wording with the values changed ───────────────────────────────────────────────────── */

const CARD_DIGITS = '2291';
/** THE CURRENT ACCOUNT, PRINTED TWO WAYS: four digits behind eight stars in an InstaPay text, the last three of them after a branch code on a `From HSBC:` line. */
const ACCOUNT_FOUR = '0918';
const ACCOUNT_THREE = '918';

/** Shape one: a credit-card purchase. The date is DD/MM/YYYY and the merchant ends at a full stop. */
const charged = (limit: string, on = '14/08/2026'): string =>
  `Your Credit Card ending with *** ${CARD_DIGITS} has been used for EGP 1,284.50 on ${on} at CEDAR LANE BAKERY. Your available limit is EGP ${limit}`;
const CARD = charged('23,715.50');

/**
 * Shape two: an InstaPay transfer, both directions and the purchase, which names its payee after `from`. The reference is
 * eight hex digits and the closing sentence follows it.
 */
const ipn = (verb: string, amount: string, on: string, payee: string, reference: string): string =>
  `Your HSBC Account ********${ACCOUNT_FOUR} was ${verb} for EGP ${amount} on ${on} ${payee} with reference ${reference}. For further details, please contact HSBC`;
const IPN_OUT = ipn('debited with IPN outward transfer', '3,250.00', '07-08-2026 16:42', 'to MARLOW JOINERY', '9c4e1f7a');
const IPN_IN = ipn('credited with IPN inward transfer', '12,400.00', '11-08-2026 08:05', 'from quill.harbour@instapay', '5d0b33e8');
const IPN_BUY = ipn('debited with IPN purchase', '615.75', '19-08-2026 21:10', 'from GRANARY MARKET', '0f7d2c91');

/** Shape three: the general account line. A day like 16AUG26, the account boxed after its branch code, a sign glued to the figure. */
const ACCOUNT_LINE = `310-554***-${ACCOUNT_THREE}`;
const withdrew = (day: string, balance: string): string =>
  `From HSBC: ${day} ATM Cash Withdrawal from ${ACCOUNT_LINE} EGP 2500.00- Your available balance is EGP ${balance}`;
const FROM_OUT = withdrew('16AUG26', '31,040.25');
const FROM_PLUS = `From HSBC: 01AUG26 Deposit Interest ${ACCOUNT_LINE} EGP 418.62+ Your available balance is EGP 33,540.25`;
/* BUILT FOR THE TEST: the account line with no sign, with a spaced hyphen, and with neither but a sentence that prints one. */
const FROM_IN = `From HSBC: 01AUG26 Deposit Interest to ${ACCOUNT_LINE} EGP 418.62 Your available balance is EGP 33,540.25`;
const FROM_SPACED = `From HSBC: 01AUG26 Transfer from NADIA FARID to ${ACCOUNT_LINE} EGP 418.62 - Your available balance is EGP 33,540.25`;
const NO_SIGN = `From HSBC: 18AUG26 Card Payment ${ACCOUNT_LINE} EGP 1,200.00 Your available balance is EGP 30,000.00`;
/** Shape four (1.4.0), BUILT FOR THE TEST: a message that prints a balance and moves nothing, in the account line's own day and account. */
const BALANCE = `HSBC: 21AUG26 Your account ${ACCOUNT_LINE} available balance is EGP 30,512.40`;

/**
 * The two generic card sentences, `packs/card-alerts`' since money-core 3.0.0 and BUILT FOR THE TEST, so no bank pattern
 * is seen claiming a line that is the card alerts' to read.
 */
const CHARGE = 'HSBC: Your card ending 4471 was debited GBP 42.99 at FENWICK CLOUD on 18/09/26. If this was not you, call us.';
const CREDIT = 'HSBC: Your card ending 4471 was credited GBP 5,005.00 from ALDER REALTY on 29/08/26.';

/* ── the record ──────────────────────────────────────────────────────────────────────────────────────────────────── */

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

async function put(api: Api, doc: unknown): Promise<void> {
  const diff = await planOf(api, doc);
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/** The accounts the invented digits name: a card, and a current account the transfers and the account line land on. */
function accounts(k: Kernel): { card: string; current: string } {
  const made = (fields: Body): string => said<{ id: string }>(k.create('accounts', fields as never, { actor: 'p_1' })).id;
  return {
    card: made({ name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: TODAY, liquid: false, last4: CARD_DIGITS }),
    /* BOTH PRINTINGS ON ONE ACCOUNT, parted by a comma, which the lookup's `split` (1.7.0) reads as two values. */
    current: made({ name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: TODAY, liquid: true, last4: `${ACCOUNT_FOUR},${ACCOUNT_THREE}` }),
  };
}

/**
 * The record a person has once they install this pack, THROUGH `createRecordApi`, because the near rule needs
 * `@braindog/extract`'s `isDuplicate` and the dates need `scanDates`, which only the record hands down. `withPack`
 * false is the same record without it, for the red probe.
 */
async function withReaders(withPack = true): Promise<{ api: Api; sql: NodeSql; card: string; current: string }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) await put(api, firstPartyDocument(id));
  if (withPack) await put(api, file());
  return { api, sql, ...accounts(api.kernel) };
}

/**
 * The same record on a BARE KERNEL, installed through the same planner. What a pattern CLAIMS is decided before any
 * reader runs, and a bare kernel reads only its own four day formats and no second figure in a slice, so a claim that
 * names exactly the fields a bare kernel cannot read is a claim that read everything else.
 */
async function bare(keep?: string): Promise<{ k: Kernel; sql: NodeSql; card: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) await put(api, firstPartyDocument(id));
  await put(api, file());
  await k.reload();
  if (keep !== undefined) {
    const others = k.declarations().filter((d) => d.kind === 'ingest' && d.id !== keep).map((d) => d.id);
    said(await k.retire(others));
  }
  return { k, sql, ...accounts(k) };
}

const mail = (k: Kernel, body: string, sha256: string): Arrived =>
  said<Arrived>(k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'HSBC' }, body, sha256 }));

/* THROUGH THE SHORTCUT'S DOOR, VERIFIED, which is how the host hands the record a text whose path token checked out. */
const text = (k: Kernel, body: string, sha256: string): Arrived => said<Arrived>(k.arrive({ channel: 'webhook', ingest: door(), body, sha256, verified: true }));

/** Money's own payee field (money-core 3.10.0), which a bank door lays field for field or not at all. */
const moneysPayee = (): unknown =>
  ((firstPartyDocument('money-core') as { declarations: { register?: string; fields?: { id: string }[] }[] }).declarations
    .find((d) => d.register === 'transactions')?.fields ?? []).find((f) => f.id === 'counterparty_text');

/* ── the file ────────────────────────────────────────────────────────────────────────────────────────────────────── */

/* 1.4.0 IS A MINOR STEP (contracts §7.6): two patterns added for a message that only prints a balance, which
   write money-core 3.0.0's `balances`; the balance a `From HSBC:` line prints lands in 3.0.0's `balance_after`; and each
   merchant name loses its acquirer's prefix (`strip`). So the floor moves to 3.0.0, the first Money with both lists.
   1.3.1 IS KEPT BESIDE THIS FILE as `bank-hsbc-eg-1.3.1.json`, byte for byte as it shipped, because the tests that drive a
   record on money-core 1.8.0 taking the bank's wordings need the last version that installs there.
   1.5.0 ADDS A TITLE AND A `changes` LINE and nothing a record reads.
   1.6.0 IS A MINOR STEP: the card charge and the two InstaPay wordings keep the payee as printed in `counterparty_text`,
   which money-core 3.10.0 declares on its ledger, so the floor moves to 3.10.0 and the pack lays nothing. Laid by the
   pack, even in Money's own shape, the ledger was staged as the record's own list, and a record that took the pack on
   an older Money was refused money-core 3.10.0 itself.
   1.7.0 IS A MINOR STEP, ON THE SAME FLOOR: no money form names a currency of its own any more (twenty-two said GBP,
   so a figure printed with no code filed in sterling), each takes its account's; each lookup says whether it finds a
   card or an account, a card's finds only a card, and every lookup reads an account's digits as one or more values;
   the account line keys its near rule on the balance it prints, and InstaPay on its reference, which the pack lays as
   `hsbc_reference`. ITS OWN FIELD AND NOT A SHARED ONE, the way Mercury lays `mercury_id`: a field of a common id laid by
   a bank door is the 1.6.0 lesson above, refused the day Money or a second bank declares it too. */
test('THE FILE IS bank-hsbc-eg 1.7.0, on money-core 3.10.0 or later before 4.0.0, with the fifteen', () => {
  const doc = file();
  assert.deepEqual([doc.pack, doc.version], ['bank-hsbc-eg', '1.7.0']);
  assert.deepEqual(doc.extends, { 'register.transactions': { fields: [{ id: 'hsbc_reference', label: 'HSBC reference', type: 'text' }] } }, 'the pack lays more than its reference, or lays the payee Money declares');
  assert.equal((moneysPayee() as { type?: string } | undefined)?.type, 'text', 'Money declares no payee field to write');
  const frozen = JSON.parse(readFileSync(new URL('./bank-hsbc-eg-1.3.1.json', import.meta.url), 'utf8')) as { version: string; requires: { packs: unknown } };
  assert.deepEqual([frozen.version, frozen.requires.packs], ['1.3.1', { 'money-core': '>=1.8.0 <4.0.0' }]);
  assert.deepEqual((doc.requires as { packs: unknown }).packs, { 'money-core': '>=3.10.0 <4.0.0' });
  assert.deepEqual(doc.declarations.map((d) => `ingest.${String(d.ingest)}`).sort(), FIFTEEN);
});

/** Every value form in one pattern's `extract`, however deep a `first:` or an `nth:` holds it. */
function formsIn(node: unknown, key: string, out: Body[] = []): Body[] {
  if (Array.isArray(node)) for (const n of node) formsIn(n, key, out);
  else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key && v !== null && typeof v === 'object' && !Array.isArray(v)) out.push(v as Body);
      formsIn(v, key, out);
    }
  }
  return out;
}

/**
 * THE TWENTY-TWO ARE GONE AND NOTHING TOOK THEIR PLACE. Read off the file, so a pattern added later with a currency
 * written in fails here and not on somebody's ledger. The account is the one the lookup found, and `balance` is the field
 * on it that carries a currency, so a figure with no code is in the account's money: Egyptian pounds on an Egyptian
 * account, dollars on a dollar one.
 */
test('NO MONEY FORM NAMES A CURRENCY: each takes its account\'s, and each lookup says what it finds', () => {
  const doc = file();
  const moneys = doc.declarations.flatMap((d) => formsIn(d.extract, 'money'));
  assert.equal(moneys.length, 22, 'a money form was lost or added without this test seeing it');
  for (const m of moneys) assert.deepEqual(m.currency, { of: 'account', field: 'balance' }, `a money form reads ${JSON.stringify(m.currency)}`);
  assert.ok(!JSON.stringify(doc).includes('"GBP"'), 'a currency nobody chose is still written into the file');
  for (const d of doc.declarations) {
    const card = String(d.ingest).startsWith('bank-card-used');
    for (const lookup of formsIn(d.extract, 'lookup')) {
      assert.equal(lookup.says, card ? 'card' : 'account', `${String(d.ingest)} says it finds ${String(lookup.says)}`);
      assert.equal(lookup.where, card ? 'kind is card' : undefined, `${String(d.ingest)} filters the accounts by ${String(lookup.where)}`);
      assert.equal(lookup.split, true, `${String(d.ingest)} reads one printing of an account's digits`);
    }
  }
  /* THE KEYS EACH NEAR RULE COMPARES. A key added without the field it names would compare an absent value, and absent
     is never equal, so every second copy would be kept. */
  const keys = Object.fromEntries(doc.declarations.filter((d) => d.dedupe && !Array.isArray(d.dedupe)).map((d) => [d.ingest, (d.dedupe as { near: { on: string[] } }).near.on]));
  for (const [ingest, on] of Object.entries(keys)) {
    const expected = ingest.startsWith('bank-card-used') ? ['amount', 'account', 'available'] : ingest.startsWith('bank-ipn-') ? ['amount', 'account', 'hsbc_reference'] : ['amount', 'account', 'balance_after'];
    assert.deepEqual(on, expected, ingest);
    const extract = doc.declarations.find((d) => d.ingest === ingest)!.extract as Body;
    for (const field of on) assert.ok(field in extract, `${ingest} compares ${field} and never reads it`);
  }
});

test('BEFORE THE PACK: a record with every first-party pack leaves the bank\'s card alert untriaged', async () => {
  const { api, sql } = await withReaders(false);
  const ids = api.kernel.declarations().map((d) => d.id);
  assert.deepEqual(FIFTEEN.filter((id) => ids.includes(id)), [], 'money-core still declares one of this bank\'s wordings');
  const out = mail(api.kernel, CARD, 'before-the-pack');
  assert.deepEqual([out.state, out.ingest], ['untriaged', null]);
  sql.close();
});

test('INSTALLED FROM THE FILE: fifteen patterns, nothing refused, and the same file opens as an add-on from disk', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) await put(api, firstPartyDocument(id));
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.adds.map((a) => a.id).sort(), FIFTEEN);
  await put(api, file());
  assert.equal(api.kernel.packs().find((p) => p.id === 'bank-hsbc-eg')?.version, '1.7.0');
  const opened = said<{ pack: { manifest: { pack: string } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.equal(opened.pack.manifest.pack, 'bank-hsbc-eg');
  sql.close();
});

/* ── what each wording writes, with the readers wired ────────────────────────────────────────────────────────────── */

const rowsOn = (k: Kernel, account: string): Body[] =>
  said<{ rows: { fields: Body }[] }>(k.list({ register: 'transactions', limit: 200 })).rows.map((r) => r.fields).filter((f) => f.account === account);

test('THE CARD ALERT BECOMES A ROW at exact: the merchant between `at` and the full stop, the figure and not the limit', async () => {
  const { api, sql, card } = await withReaders();
  const out = mail(api.kernel, CARD, 'card');
  assert.deepEqual([out.state, out.ingest, out.confidence], ['matched', 'bank-card-used', 'exact'], out.reason);
  const row = api.kernel.get(out.wrote[0]!)!.fields;
  assert.deepEqual(
    [row.what, row.direction, row.on, row.account, row.amount, row.available],
    ['CEDAR LANE BAKERY', 'out', '2026-08-14', card, { amount: 128_450, currency: 'EGP' }, { amount: 2_371_550, currency: 'EGP' }],
  );
  sql.close();
});

/**
 * TWO CHARGES OF ONE AMOUNT AT ONE SHOP ON ONE DAY ARE TWO ROWS, and one alert sent twice is one. A hundred real texts
 * held such a pair, and the near rule skipped the second as `transactions#N already says this.`;
 * the limits they print differ by exactly the charge, so `bank-card-used` reads the limit and compares it.
 */
test('TWO CHARGES OF THE SAME AMOUNT AT THE SAME SHOP ON THE SAME DAY ARE TWO ROWS, told apart by the limit each leaves', async () => {
  const { api, sql, card } = await withReaders();
  assert.equal(mail(api.kernel, charged('23,715.50'), 'card-1').state, 'matched');
  const second = mail(api.kernel, charged('22,431.00'), 'card-2');
  assert.deepEqual([second.state, second.ingest], ['matched', 'bank-card-used'], second.reason);
  assert.equal(rowsOn(api.kernel, card).length, 2);
  sql.close();
});

test('AND THE SAME ALERT SENT AGAIN IS STILL ONE ROW, because it prints the same limit', async () => {
  const { api, sql, card } = await withReaders();
  assert.equal(mail(api.kernel, charged('23,715.50'), 'card-1').state, 'matched');
  /* DIFFERENT BYTES, THE SAME MESSAGE: a forwarded copy carries the forward's own line above it, so the raw's hash does
     not catch it and the dedupe has to. */
  const again = mail(api.kernel, `Fwd: ${charged('23,715.50')}`, 'card-1-fwd');
  assert.equal(again.state, 'skipped', `a resend was ${again.state}: ${again.reason}`);
  /* THE SKIP SAYS WHICH ROW IT REPEATS, by the shop, the figure and the day, so it is never silent (1.7.0's kernel). */
  assert.match(again.reason ?? '', /^Looks like a repeat of CEDAR LANE BAKERY, /u);
  assert.equal(rowsOn(api.kernel, card).length, 1);
  sql.close();
});

test('THE TRANSFERS AND THE ACCOUNT LINE WRITE THEIR ROWS, each in its own direction on the account its digits name', async () => {
  const { api, sql, current } = await withReaders();
  for (const [body, ingest, direction, amount] of [
    [IPN_OUT, 'bank-ipn-out', 'out', 325_000],
    [IPN_IN, 'bank-ipn-in', 'in', 1_240_000],
    [IPN_BUY, 'bank-ipn-out', 'out', 61_575],
    [FROM_OUT, 'bank-from-out', 'out', 250_000],
    [FROM_PLUS, 'bank-from-in', 'in', 41_862],
  ] as const) {
    const out = mail(api.kernel, body, `row-${ingest}-${amount}`);
    assert.deepEqual([out.state, out.ingest], ['matched', ingest], `${body.slice(0, 40)}: ${out.reason}`);
    const row = api.kernel.get(out.wrote[0]!)!.fields;
    assert.deepEqual([row.direction, row.account, row.amount], [direction, current, { amount, currency: 'EGP' }], body.slice(0, 40));
  }
  sql.close();
});

/* THE BALANCE A `From HSBC:` LINE PRINTS IS THE ACCOUNT'S BALANCE AFTER THE MOVEMENT, which Cash now restarts the account
   from; a card's available limit stays `available`, since a limit is not what an account holds. */
test('A MESSAGE THAT ONLY PRINTS A BALANCE IS A BALANCE CHECK (1.4.0), and a movement line keeps its balance on the row', async () => {
  const { api, sql, current } = await withReaders();
  const moved = mail(api.kernel, FROM_OUT, 'from-out-balance');
  assert.deepEqual(api.kernel.get(moved.wrote[0]!)!.fields.balance_after, { amount: 3_104_025, currency: 'EGP' });
  const out = mail(api.kernel, BALANCE, 'balance-only');
  assert.deepEqual([out.state, out.ingest, out.confidence], ['matched', 'bank-balance', 'exact'], out.reason);
  const check = api.kernel.get(out.wrote[0]!)!;
  assert.equal(check.register, 'balances');
  assert.deepEqual([check.fields.account, check.fields.balance, check.fields.as_of], [current, { amount: 3_051_240, currency: 'EGP' }, '2026-08-21']);
  /* THE SAME MESSAGE AGAIN IS THE SAME CHECK. */
  assert.equal(mail(api.kernel, BALANCE, 'balance-only-again').state, 'skipped');
  sql.close();
});

test('AN ACQUIRER\'S PREFIX COMES OFF THE MERCHANT (1.4.0): a card charge at FAWRY*Vodafone files as Vodafone', async () => {
  const { api, sql } = await withReaders();
  const out = mail(api.kernel, CARD.replace('CEDAR LANE BAKERY', 'FAWRY*Vodafone'), 'card-fawry');
  assert.deepEqual([out.state, out.ingest], ['matched', 'bank-card-used'], out.reason);
  assert.equal(api.kernel.get(out.wrote[0]!)!.fields.what, 'Vodafone');
  sql.close();
});

/* ── two like movements, and one movement told twice (1.7.0) ──────────────────────────────────────────────────────── */

/**
 * TWO EQUAL WITHDRAWALS ARE TWO ROWS WHEN EACH PRINTS ITS OWN BALANCE. The account line's near rule read the amount,
 * the account, a day either side and the start of the description, and two cash withdrawals of one amount on one day
 * share all four, so the second was skipped as already said. The balance each prints is what the account held after it,
 * and two movements never leave one balance, so the rule reads it too (H.792). A day apart is checked as well, because
 * it is the case the near rule's day window was written for.
 */
test('TWO EQUAL WITHDRAWALS FROM ONE ACCOUNT, EACH PRINTING ITS OWN BALANCE, ARE TWO ROWS, on one day and a day apart', async () => {
  const { api, sql, current } = await withReaders();
  for (const [body, sha] of [
    [withdrew('16AUG26', '31,040.25'), 'atm-1'],
    [withdrew('16AUG26', '28,540.25'), 'atm-2'],
    [withdrew('17AUG26', '26,040.25'), 'atm-3'],
  ] as const) {
    const out = mail(api.kernel, body, sha);
    assert.deepEqual([out.state, out.ingest], ['matched', 'bank-from-out'], `${sha}: ${out.reason}`);
  }
  const egp = (amount: number) => ({ amount, currency: 'EGP' });
  assert.deepEqual(
    rowsOn(api.kernel, current).map((r) => JSON.stringify([r.on, r.amount, r.balance_after])).sort(),
    [
      ['2026-08-16', egp(250_000), egp(2_854_025)],
      ['2026-08-16', egp(250_000), egp(3_104_025)],
      ['2026-08-17', egp(250_000), egp(2_604_025)],
    ].map((r) => JSON.stringify(r)).sort(),
  );
  /* AND ONE OF THEM SENT AGAIN IS STILL ONE: same balance, same everything. */
  const again = mail(api.kernel, `Fwd: ${withdrew('16AUG26', '28,540.25')}`, 'atm-2-fwd');
  assert.equal(again.state, 'skipped', `a resend was ${again.state}: ${again.reason}`);
  assert.equal(rowsOn(api.kernel, current).length, 3);
  sql.close();
});

/**
 * TWO EQUAL TRANSFERS TO ONE PERSON A DAY APART ARE TWO ROWS, told apart by the reference each prints. An InstaPay text
 * prints no balance, so before 1.7.0 the second of two rent payments, or two equal top-ups, read as the first said again.
 * The reference is the bank's own name for the one transfer, so the same transfer by mail and by text still meet on it.
 */
test('TWO EQUAL INSTAPAY TRANSFERS TO ONE PERSON A DAY APART ARE TWO ROWS, each keeping its own reference', async () => {
  const { api, sql, current } = await withReaders();
  const first = mail(api.kernel, IPN_OUT, 'ipn-day-1');
  const second = mail(api.kernel, ipn('debited with IPN outward transfer', '3,250.00', '08-08-2026 10:15', 'to MARLOW JOINERY', 'b71d0e23'), 'ipn-day-2');
  for (const out of [first, second]) assert.deepEqual([out.state, out.ingest], ['matched', 'bank-ipn-out'], out.reason);
  assert.deepEqual(rowsOn(api.kernel, current).map((r) => [r.on, r.what, r.hsbc_reference]).sort(), [
    ['2026-08-07', 'MARLOW JOINERY', '9c4e1f7a'],
    ['2026-08-08', 'MARLOW JOINERY', 'b71d0e23'],
  ]);
  sql.close();
});

/**
 * THE MAIL AND THE TEXT OF ONE MOVEMENT ARE ONE ROW, in each of the three shapes. HSBC sends both, and a person who
 * forwards the mail and has the Shortcut post the text hands the record the same movement twice, under two patterns and
 * through two doors. Each pair agrees on the limit, the reference or the balance it prints, so the second is skipped. The
 * text of the transfer is cut inside its closing sentence, as a text can be, and still meets the mail on its reference.
 */
test('THE MAIL AND THE TEXT OF ONE MOVEMENT ARE ONE ROW: a card charge, an InstaPay transfer and an account line', async () => {
  const { api, sql, card, current } = await withReaders();
  const k = api.kernel;
  const cut = IPN_OUT.slice(0, IPN_OUT.indexOf('. For') + 12);
  for (const [mailed, texted, ingest] of [
    [CARD, CARD, 'bank-card-used'],
    [IPN_OUT, cut, 'bank-ipn-out'],
    [FROM_OUT, FROM_OUT, 'bank-from-out'],
  ] as const) {
    const first = mail(k, mailed, `mail-${ingest}`);
    assert.deepEqual([first.state, first.ingest], ['matched', ingest], first.reason);
    const second = text(k, texted, `text-${ingest}`);
    assert.equal(second.ingest, `${ingest}-sms`, `the text of ${ingest} was claimed by ${second.ingest}`);
    assert.equal(second.state, 'skipped', `the text of ${ingest} was ${second.state}: ${second.reason}`);
  }
  assert.equal(rowsOn(k, card).length, 1);
  assert.equal(rowsOn(k, current).length, 2);
  sql.close();
});

/**
 * A FIGURE WITH NO CURRENCY CODE IS IN ITS ACCOUNT'S CURRENCY, which is what the twenty-two GBP fallbacks were there
 * for and got wrong: they filed it in sterling whatever the account held. The lines are the bank's own card alert with
 * the codes taken out. A dollar card is the second half, so a fixed Egyptian pound could not pass where sterling failed.
 */
test('A TEXT WITH NO CURRENCY CODE FILES IN ITS ACCOUNT\'S CURRENCY: Egyptian pounds on the Egyptian card, dollars on the dollar card', async () => {
  const { api, sql, card } = await withReaders();
  const k = api.kernel;
  const pounds = mail(k, CARD.replaceAll('EGP ', ''), 'card-no-code');
  assert.deepEqual([pounds.state, pounds.ingest], ['matched', 'bank-card-used'], pounds.reason);
  const row = k.get(pounds.wrote[0]!)!.fields;
  assert.deepEqual([row.account, row.amount, row.available], [card, { amount: 128_450, currency: 'EGP' }, { amount: 2_371_550, currency: 'EGP' }]);
  /* AND THROUGH THE SHORTCUT'S DOOR, where his texts arrive: the card's next charge and a transfer off the current account. */
  const texted = text(k, charged('22,431.00', '15/08/2026').replaceAll('EGP ', ''), 'card-no-code-text');
  assert.deepEqual([texted.state, texted.ingest], ['matched', 'bank-card-used-sms'], texted.reason);
  assert.deepEqual(k.get(texted.wrote[0]!)!.fields.amount, { amount: 128_450, currency: 'EGP' });
  const sent = text(k, IPN_OUT.replace('EGP ', ''), 'ipn-no-code-text');
  assert.deepEqual([sent.state, sent.ingest], ['matched', 'bank-ipn-out-sms'], sent.reason);
  assert.deepEqual(k.get(sent.wrote[0]!)!.fields.amount, { amount: 325_000, currency: 'EGP' });

  const dollars = said<{ id: string }>(
    k.create('accounts', { name: 'Dollar card', kind: 'card', balance: { amount: 0, currency: 'USD' }, as_of: TODAY, liquid: false, last4: '7310' } as never, { actor: 'p_1' }),
  ).id;
  const onDollars = (amount: string, limit: string, shop: string): string =>
    `Your Credit Card ending with *** 7310 has been used for ${amount} on 20/08/2026 at ${shop}. Your available limit is ${limit}`;
  const usd = mail(k, onDollars('85.00', '4,915.00', 'HARBOUR BOOKS'), 'usd-no-code');
  assert.deepEqual([usd.state, usd.ingest], ['matched', 'bank-card-used'], usd.reason);
  const spent = k.get(usd.wrote[0]!)!.fields;
  assert.deepEqual([spent.account, spent.amount, spent.available], [dollars, { amount: 8_500, currency: 'USD' }, { amount: 491_500, currency: 'USD' }]);

  /* AND A CODE THE TEXT PRINTS STILL WINS: the account's currency is the third place to look, not the first. */
  const printed = mail(k, onDollars('EGP 500.00', 'USD 4,905.00', 'CEDAR LANE BAKERY'), 'usd-card-egp-code');
  assert.deepEqual([printed.state, k.get(printed.wrote[0]!)?.fields.amount], ['matched', { amount: 50_000, currency: 'EGP' }], printed.reason);
  sql.close();
});

/**
 * A CARD ALERT IS NEVER FILED ON AN ACCOUNT, however its digits end: the lookup on a card wording reads only rows whose
 * kind is card (`where:`). Without it a current account ending in the card's four digits was a second candidate, and
 * the alert waited as though the record could not tell a card from an account; on a record holding only the account it
 * filed the charge there.
 */
test('A CARD ALERT FILES ONLY ON A CARD: an account ending in the same digits is never its account', async () => {
  const { api, sql, card } = await withReaders();
  const k = api.kernel;
  const savings = said<{ id: string }>(
    k.create('accounts', { name: 'Cairo savings', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: TODAY, liquid: true, last4: CARD_DIGITS } as never, { actor: 'p_1' }),
  ).id;
  const out = mail(k, CARD, 'card-beside-savings');
  assert.deepEqual([out.state, out.ingest], ['matched', 'bank-card-used'], out.reason);
  assert.equal(k.get(out.wrote[0]!)!.fields.account, card);

  /* THE CARD GONE FROM THE DIGITS, the account is still not a candidate, so the next charge waits for a person. */
  const held = k.get(card)!;
  said(k.update('accounts', card, { last4: '0000' } as never, { actor: 'p_1', version: held.version }));
  const next = mail(k, charged('22,431.00'), 'card-no-card');
  assert.notEqual(next.state, 'matched', `a card charge was filed on an account: ${next.reason}`);
  assert.deepEqual([rowsOn(k, card).length, rowsOn(k, savings).length], [1, 0]);
  sql.close();
});

/* ── the payee, kept as printed (1.6.0) ─────────────────────────────────────────────────────────────────────────────── */

/**
 * ONE CAFE, FIVE SPELLINGS, in the shapes the bank prints them: as itself, and behind each of the four acquirers' prefixes
 * the alerts carry. `what` is the name with the prefix off, as since 1.4.0; `counterparty_text` is the name as printed,
 * prefix and case and all, because folding them into one payee key is the kernel's (`keyOf('bank', ...)`), and a person
 * looking at why two payments were matched sees what the bank wrote. Amounts and limits differ so no two are one alert.
 */
const CHILLOUT = ['CHILLOUT', 'GEIDEA*CHILLOUT', 'PAYMOB-CHILLOUT', 'FAWRY*Chillout', 'KASHIER*CHILLOUT'] as const;
const chargedAt = (merchant: string, n: number): string =>
  `Your Credit Card ending with *** ${CARD_DIGITS} has been used for EGP ${85 + n}.00 on 14/08/2026 at ${merchant}. Your available limit is EGP ${19_000 + n * 100}.00`;

test('A CARD CHARGE KEEPS THE PAYEE AS PRINTED: five spellings of one cafe, each with its prefix, and the description with the prefixes it strips taken off', async () => {
  const { api, sql, card } = await withReaders();
  const got = CHILLOUT.map((merchant, n) => {
    const out = mail(api.kernel, chargedAt(merchant, n), `chillout-${n}`);
    assert.deepEqual([out.state, out.ingest], ['matched', 'bank-card-used'], `${merchant}: ${out.reason}`);
    const row = api.kernel.get(out.wrote[0]!)!.fields;
    assert.equal(row.account, card);
    return [row.what, row.counterparty_text];
  });
  assert.deepEqual(got, [
    ['CHILLOUT', 'CHILLOUT'],
    ['CHILLOUT', 'GEIDEA*CHILLOUT'],
    /* `strip:` CUTS THE PREFIXES IT LISTS LETTER FOR LETTER, star included, so a bare hyphen after PAYMOB is not one of
       them and stays in the description. The payee is kept whole either way, and the kernel's key folds it. */
    ['PAYMOB-CHILLOUT', 'PAYMOB-CHILLOUT'],
    ['Chillout', 'FAWRY*Chillout'],
    ['CHILLOUT', 'KASHIER*CHILLOUT'],
  ]);
  sql.close();
});

test('A SHOP NAMED TWO WAYS IS KEPT BOTH WAYS: Talabat and talabat.com, each as the alert printed it', async () => {
  const { api, sql } = await withReaders();
  const got = ['TALABAT', 'talabat.com'].map((merchant, n) => {
    const out = mail(api.kernel, chargedAt(merchant, 10 + n), `talabat-${n}`);
    assert.deepEqual([out.state, out.ingest], ['matched', 'bank-card-used'], `${merchant}: ${out.reason}`);
    const row = api.kernel.get(out.wrote[0]!)!.fields;
    return [row.what, row.counterparty_text];
  });
  assert.deepEqual(got, [
    ['TALABAT', 'TALABAT'],
    ['talabat.com', 'talabat.com'],
  ]);
  sql.close();
});

/**
 * AN INSTAPAY TRANSFER NAMES A PERSON, NOT A SHOP: outward to the full name the receiving bank holds, in capitals and
 * often four names long, and inward from the sender's InstaPay address. Both are kept as printed; whether that person is
 * somebody in the record is one question for the owner, never a person made here.
 */
test('AN INSTAPAY TRANSFER KEEPS THE NAME OR ADDRESS IT PRINTS, in each direction, and a purchase its shop', async () => {
  const { api, sql } = await withReaders();
  const out = IPN_OUT.replace('MARLOW JOINERY', 'NOURA SAMIR ABDEL HAMID');
  const back = IPN_IN.replace('quill.harbour@instapay', 'noura.samir@instapay');
  const got = [
    [out, 'ipn-name-out'],
    [back, 'ipn-name-in'],
    [IPN_BUY, 'ipn-name-buy'],
  ].map(([body, sha]) => {
    const arrived = mail(api.kernel, body!, sha!);
    assert.equal(arrived.state, 'matched', `${sha}: ${arrived.reason}`);
    const row = api.kernel.get(arrived.wrote[0]!)!.fields;
    return [row.direction, row.what, row.counterparty_text];
  });
  assert.deepEqual(got, [
    ['out', 'NOURA SAMIR ABDEL HAMID', 'NOURA SAMIR ABDEL HAMID'],
    ['in', 'noura.samir@instapay', 'noura.samir@instapay'],
    ['out', 'GRANARY MARKET', 'GRANARY MARKET'],
  ]);
  sql.close();
});

test('A `From HSBC:` LINE NAMES NO PAYEE, so it keeps none: a cash withdrawal is not a shop', async () => {
  const { api, sql } = await withReaders();
  const out = mail(api.kernel, FROM_OUT, 'from-out-payee');
  assert.equal(out.state, 'matched', out.reason);
  assert.equal(api.kernel.get(out.wrote[0]!)!.fields.counterparty_text, undefined);
  sql.close();
});

/**
 * AND THE FIVE ARE ONE PAYEE ONCE THE KERNEL FOLDS THEM, which is why they are kept as printed. The normaliser is the
 * kernel's (contract 17, `keyOf`), one for every bank door.
 */
test('THE FIVE SPELLINGS FOLD TO ONE PAYEE KEY, and Talabat\'s two to another', () => {
  for (const spellings of [CHILLOUT, ['TALABAT', 'talabat.com']]) {
    const keys = new Set(spellings.map((spelling) => keyOf('bank', spelling)));
    assert.equal(keys.size, 1, `${spellings.join(', ')} made ${[...keys].join(', ')}`);
    assert.notEqual([...keys][0], null);
  }
  assert.notEqual(keyOf('bank', 'CHILLOUT'), keyOf('bank', 'TALABAT'));
});

/* ── what each wording claims, on a bare kernel ──────────────────────────────────────────────────────────────────── */

/**
 * The fields a held arrival's reason says it could not read, or `null` when the reason is not that sentence.
 *
 * A BARE KERNEL READS LESS SINCE 1.7.0, AND WHAT IT READS IS THE KERNEL'S TO SAY. The transfer prints the account behind
 * eight stars, which only the record's literal rule reads, and a figure with no currency of the pattern's own is read in
 * the account's, which the kernel resolves; so on a bare kernel the account and the amount may be unread beside the day.
 * What a claim test holds is the claim, and that nothing it names is a field the line plainly gives a bare kernel.
 *
 * THE REASON SAYS THE ADD-ON BY ITS TITLE AND THE FIELDS BY THEIR LABELS (REC-A03), so it is read back as those: which
 * pattern claimed the line is `Arrived.ingest`'s to say, and the sentence carries no id. An install that kept no title
 * on the add-on's row (`normalise` in `packages/declare` drops `title` today) says "The pattern", and never the id.
 */
const unreadIn = (reason: string | null | undefined): string[] | null =>
  /^(?:HSBC Egypt alerts|The pattern) could not read (.+) out of this one\.$/u.exec(reason ?? '')?.[1]?.split(/, | and /u) ?? null;

test('AN INSTAPAY TRANSFER IS CLAIMED BY ITS OWN PATTERN IN EACH DIRECTION, and a bare kernel stops at the date it cannot read', async () => {
  const { k, sql } = await bare();
  const before = k.count('transactions');
  for (const [body, sha, ingest] of [
    [IPN_OUT, 'ipn-out', 'bank-ipn-out'],
    [IPN_IN, 'ipn-in', 'bank-ipn-in'],
    [IPN_BUY, 'ipn-buy', 'bank-ipn-out'],
  ] as const) {
    const out = mail(k, body, sha);
    assert.equal(out.ingest, ingest, `${sha} was claimed by ${out.ingest}`);
    assert.equal(out.state, 'review', `${sha}: ${out.reason}`);
    const unread = unreadIn(out.reason);
    assert.ok(unread?.includes('date'), `${sha} read the day a bare kernel cannot: ${out.reason}`);
    for (const field of unread!) assert.ok(['account', 'amount', 'date'].includes(field), `${sha} could not read ${field}, which the line gives: ${out.reason}`);
  }
  assert.equal(k.count('transactions'), before, 'a transfer with no date wrote a row');
  sql.close();
});

test('THE `From HSBC:` LINE IS CLAIMED BY ITS SIGN: a glued `-` is the debit, a glued `+` the credit, a spaced one a person\'s, and none nobody\'s', async () => {
  const { k, sql } = await bare();
  const before = k.count('transactions');
  const debit = mail(k, FROM_OUT, 'from-out');
  assert.deepEqual([debit.ingest, debit.state], ['bank-from-out', 'review'], debit.reason);
  const claimed = (reason: string | null | undefined, ingest: string): void => {
    const unread = unreadIn(reason);
    /* THE SECOND FIGURE AND THE `16AUG26` DAY ARE THE TWO A BARE KERNEL CANNOT READ, and the rest follow the account. */
    assert.ok(unread?.includes('amount') && unread.includes('date'), `${ingest} read what a bare kernel cannot: ${reason}`);
    for (const field of unread!) assert.ok(['account', 'amount', 'balance after', 'date'].includes(field), `${ingest} could not read ${field}, which the line gives: ${reason}`);
  };
  claimed(debit.reason, 'bank-from-out');
  const credit = mail(k, FROM_PLUS, 'from-plus');
  assert.deepEqual([credit.ingest, credit.state], ['bank-from-in', 'review'], credit.reason);
  claimed(credit.reason, 'bank-from-in');
  /* A HYPHEN THAT DOES NOT TOUCH THE FIGURE MAY BE THE BANK'S SIGN OR A SEPARATOR, and one line cannot say which. */
  const spaced = mail(k, FROM_SPACED, 'from-spaced');
  assert.deepEqual([spaced.ingest, spaced.state], ['bank-from-unsure', 'review'], spaced.reason);
  /* A LINE WITH NO SIGN SAYS NOTHING ABOUT ITS DIRECTION, so no pattern claims it and it goes to a person. */
  const unsigned = mail(k, FROM_IN, 'from-in');
  assert.deepEqual([unsigned.ingest, unsigned.state], [null, 'untriaged'], unsigned.reason);
  assert.equal(k.count('transactions'), before, 'a bare kernel wrote a row it could not read');

  /* AND `MMM` STILL MEANS `MM` THEN `M`: the month name is `MON`, and a pattern written the obvious way is refused. */
  const mmm = (await k.install([
    {
      id: 'ingest.hsbc-from',
      kind: 'ingest',
      body: {
        ingest: 'hsbc-from',
        channel: 'email',
        match: { all: [{ field: 'body', contains: 'from hsbc:' }] },
        extract: { what: { text: { after: 'From HSBC: ' } }, on: { date: { format: 'DDMMMYY', after: 'From HSBC: ' } } },
        writes: { register: 'transactions', confidence: 'exact' },
        on_conflict: 'skip',
      } as never,
    },
  ])) as Out;
  assert.equal(mmm.refusal?.code, 'DATE_FORMAT_INVALID');
  sql.close();
});

/**
 * NO WORDING IS CLAIMED BY TWO PATTERNS, so the order they are declared in decides nothing. Each pattern on a record of
 * its own, the rest retired, because `arrive` takes the first pattern that matches and so can only ever report one.
 */
test('NO WORDING IS CLAIMED BY TWO PATTERNS, and a line with both glued signs is claimed by none', async () => {
  const mails = FIFTEEN.filter((id) => !id.endsWith('-sms'));
  const bodies = {
    CARD, IPN_OUT, IPN_IN, IPN_BUY, FROM_OUT, FROM_IN, FROM_PLUS, FROM_SPACED, CHARGE, CREDIT, BALANCE,
    BOTH: `From HSBC: 01AUG26 Deposit Interest ${ACCOUNT_LINE} EGP 418.62+ Your available balance is EGP 2500.00- Your available balance is EGP 1.00`,
    PLUS_AND_SPACED: `From HSBC: 01AUG26 Deposit Interest ${ACCOUNT_LINE} EGP 418.62+ Your available balance is EGP 2500.00 - Your available balance is EGP 1.00`,
  };
  const claims = new Map<string, string[]>(Object.keys(bodies).map((name) => [name, []]));
  for (const id of mails) {
    const { k, sql } = await bare(id);
    for (const [name, body] of Object.entries(bodies)) if (mail(k, body, `alone-${id}-${name}`).ingest === id.slice('ingest.'.length)) claims.get(name)!.push(id);
    sql.close();
  }
  for (const [name, by] of claims) if (!['BOTH', 'PLUS_AND_SPACED'].includes(name)) assert.ok(by.length <= 1, `${name} is claimed by ${by.join(' and ')}`);
  assert.deepEqual(claims.get('BOTH'), [], 'a line with both glued signs was claimed');
  assert.deepEqual(claims.get('PLUS_AND_SPACED'), ['ingest.bank-from-in'], 'a glued `+` beside a spaced hyphen was not the credit\'s alone');
});

/* ── the Shortcut's door ─────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * ONE IN FOUR OF THE TEXTS A SHORTCUT FORWARDS IS NOT A MOVEMENT: verification codes, shop promotions, delivery notices
 * and the bank's own marketing. Measured before the catch-all with the
 * four bodies below: all four `untriaged`, a badge of four for texts nobody has to read.
 */
const NOT_THE_BANKS: Record<string, string> = {
  'a verification code': 'Your verification code is 482913. Do not share it with anyone. It expires in 10 minutes.',
  'a shop promotion': 'CEDAR LANE BAKERY: 20% off every loaf this weekend with code BREAD20. Reply STOP to opt out.',
  'a delivery notice': 'Your parcel 7Q4-118 from Marlow Joinery is out for delivery today between 14:00 and 18:00.',
  "the bank's promotion": 'HSBC: Enjoy 0% instalments for 6 months on purchases over EGP 5,000 with your HSBC Credit Card. T&Cs apply.',
};

const states = (sql: NodeSql): Record<string, number> =>
  Object.fromEntries(sql.all<{ state: string; n: number }>('SELECT state, count(*) AS n FROM inbox_raw GROUP BY state ORDER BY state').map((r) => [r.state, r.n]));

test('TEXTS THAT ARE NOT THE BANK\'S ARE SKIPPED AT THE DOOR, with a reason, and none is left in the inbox', async () => {
  const { k, sql } = await bare();
  const out = Object.entries(NOT_THE_BANKS).map(([what, body]) => [what, text(k, body, `not-mine-${what}`)] as const);
  assert.deepEqual(states(sql), { skipped: 4 }, 'the inbox holds texts that are not the bank\'s');
  for (const [what, arrived] of out) assert.deepEqual([arrived.state, arrived.reason], ['skipped', 'Not a message from the bank'], what);
  sql.close();
});

/* WITH THE READERS, AS PRODUCTION HAS THEM: a bare kernel reads a figure in the account's currency only as far as the
   kernel takes it, and what this holds is the door, not the reading. */
test('AND WHAT IS THE BANK\'S STILL FILES OR WAITS: a card alert at the door is written, a line nothing reads is a person\'s', async () => {
  const { api, sql } = await withReaders();
  const k = api.kernel;
  const card = text(k, CARD, 'card-at-door');
  assert.deepEqual([card.state, card.ingest], ['matched', 'bank-card-used-sms'], card.reason);
  const unread = text(k, NO_SIGN, 'no-sign-at-door');
  assert.deepEqual([unread.state, unread.ingest], ['untriaged', null], `a bank line nothing reads was ${unread.state}: ${unread.reason}`);
  /* MAIL IS OFFERED EVERY MAIL PATTERN ON THE RECORD, so a mail catch-all would decide other packs' mail too. */
  const promo = said<Arrived>(k.arrive({ channel: 'email', headers: { From: 'news@shop.example' }, body: NOT_THE_BANKS['a shop promotion']!, sha256: 'mail-promo' }));
  assert.equal(promo.state, 'untriaged', 'unread mail was decided by the bank pack');
  sql.close();
});

/**
 * THE KERNEL HAS NO PRIORITY, ONLY AN ORDER, AND THE ORDER MOVES: a pattern a later version changes is a new row and
 * sorts after a catch-all written before it. Measured with the catch-all's `match:` removed, an update that changed only
 * `bank-card-used-sms`'s description sent the next card alert to the catch-all. So it refuses every phrase one of the
 * twins requires, which makes the two sets disjoint whatever order they are offered in, and this holds it for each twin.
 */
test('THE CATCH-ALL CANNOT TAKE A TEXT A TWIN READS, whatever order the record offers them in', () => {
  const declarations = file().declarations;
  const twins = declarations.filter((d) => d.channel === 'webhook' && d.ingest !== 'bank-not-mine-sms');
  const catchAll = declarations.filter((d) => d.ingest === 'bank-not-mine-sms');
  assert.equal(catchAll.length, 1, 'the pack declares no catch-all at its door');
  assert.equal(catchAll[0]!.door, door());
  const refused = ((catchAll[0]!.match as { none?: { field: string; contains: string }[] }).none ?? []).map((p) => `${p.field}:${p.contains}`);
  assert.equal(twins.length, 7);
  for (const twin of twins) {
    const required = ((twin.match as { all?: { field?: string; contains?: string }[] }).all ?? []).filter((p) => p.contains !== undefined).map((p) => `${p.field}:${p.contains}`);
    assert.ok(required.some((phrase) => refused.includes(phrase)), `${String(twin.ingest)} requires no phrase the catch-all refuses`);
  }
});
