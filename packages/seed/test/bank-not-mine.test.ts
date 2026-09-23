/**
 * A text posted to the bank's door that is not the bank's is skipped with a reason, not left in the inbox as work.
 *
 * ONE IN FOUR OF HIS FORWARDED TEXTS IS NOT A MOVEMENT. His Shortcut posts every text his phone receives from a
 * short list of senders to one URL, and the old tool's live inbox for 28 August to 18 September held 26 skipped beside
 * 84 parsed: verification codes, shop promotions, delivery notices, and the bank's own marketing
 * (`loop/research-legacy-keeps.md` section 1). This pack's `skip:` lists hang off its patterns, so they only ever
 * reached a text some pattern had already matched, and an arrival no pattern matches is stored `untriaged` by rule.
 * Measured at HEAD before the catch-all, with the four bodies below: all four came back `untriaged`, a badge of four
 * for texts nobody has to read.
 *
 * WHAT MUST NOT MOVE WITH IT. A card alert posted to the same door still files, and a line in the bank's own movement
 * wording that no pattern reads still waits for a person: `bank-from-out` says a `From HSBC:` line no sign pattern takes
 * "goes to a person as `untriaged`", and a catch-all that swallowed it would file a real movement as a stranger's text.
 * Mail is not touched either, because a forwarding address serves the whole record and a mail catch-all would skip
 * every other pack's unread mail as not the bank's.
 *
 * THE BODIES ARE INVENTED, in the shapes `loop/research-bank-real.md` counted. None of his texts is quoted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Arrived, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY, NOW, day, firstPartyDocument } from '../src/index.ts';
import { HSBC_EG_SMS_DOOR, HSBC_EG_SMS_INGESTS, bankHsbcEgPack } from '../src/packs/bank-hsbc-eg.ts';

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

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const installed: Installed = {
    format: 1,
    primitives: 1,
    record_version: k.version(),
    packs: k.packs(),
    declarations: k.declarations() as Installed['declarations'],
    rows: k.census(),
  };
  const diff = await plan(pack, installed);
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/* THE RECORD A PERSON HAS WHEN THEY INSTALL THE PACK: the first-party packs, then this one on top, and the card the
   alert below names, so a card alert has an account to file against. */
async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const id of FIRST_PARTY) await put(k, firstPartyDocument(id));
  await put(k, bankHsbcEgPack());
  value(k.create('accounts', { name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: false, last4: '6180' }, { actor: 'p_seed' }));
  return { k, sql };
}

/* THROUGH THE SHORTCUT'S DOOR, VERIFIED, which is how the host hands the record a text whose path token checked out. */
const text = (k: Kernel, body: string, sha256: string): Arrived =>
  value<Arrived>(k.arrive({ channel: 'webhook', ingest: HSBC_EG_SMS_DOOR, body, sha256, verified: true }));

const NOT_THE_BANKS: Record<string, string> = {
  'a verification code': 'Your verification code is 482913. Do not share it with anyone. It expires in 10 minutes.',
  'a shop promotion': 'CEDAR LANE BAKERY: 20% off every loaf this weekend with code BREAD20. Reply STOP to opt out.',
  'a delivery notice': 'Your parcel 7Q4-118 from Marlow Joinery is out for delivery today between 14:00 and 18:00.',
  /* THE BANK'S OWN MARKETING SENDER, which names the card and a currency amount, as the two in his window did. */
  "the bank's promotion": 'HSBC: Enjoy 0% instalments for 6 months on purchases over EGP 5,000 with your HSBC Credit Card. T&Cs apply.',
};

const CARD_ALERT = 'Your Credit Card ending with *** 6180 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your available limit is EGP 23,715.50';

/* THE BANK'S OWN LINE WITH NO SIGN AGAINST THE FIGURE AT ALL, which `bank-from-out`, `bank-from-in` and
   `bank-from-unsure` each refuse because each asks for a sign. It is the shape a new wording from the bank takes. */
const NO_SIGN = 'From HSBC: 18AUG26 Card Payment 042-118***-327 EGP 1,200.00 Your available balance is EGP 30,000.00';

const states = (sql: NodeSql): Record<string, number> =>
  Object.fromEntries(sql.all<{ state: string; n: number }>('SELECT state, count(*) AS n FROM inbox_raw GROUP BY state ORDER BY state').map((r) => [r.state, r.n]));

test('TEXTS THAT ARE NOT THE BANK\'S ARE SKIPPED AT THE DOOR, with a reason, and none is left in the inbox', async () => {
  const { k, sql } = await record();
  const out = Object.entries(NOT_THE_BANKS).map(([what, body]) => [what, text(k, body, `not-mine-${what}`)] as const);
  assert.deepEqual(states(sql), { skipped: 4 }, 'the inbox holds texts that are not the bank\'s');
  for (const [what, arrived] of out) assert.deepEqual([arrived.state, arrived.reason], ['skipped', 'Not a message from the bank'], what);
  sql.close();
});

test('AND WHAT IS THE BANK\'S STILL FILES OR WAITS: a card alert at the door is written, a line nothing reads is a person\'s', async () => {
  const { k, sql } = await record();
  const card = text(k, CARD_ALERT, 'card-at-door');
  assert.deepEqual([card.state, card.ingest], ['matched', 'bank-card-used-sms'], card.reason);

  const unread = text(k, NO_SIGN, 'no-sign-at-door');
  assert.deepEqual([unread.state, unread.ingest], ['untriaged', null], `a bank line nothing reads was ${unread.state}: ${unread.reason}`);

  /* MAIL IS OFFERED EVERY MAIL PATTERN ON THE RECORD, so a mail catch-all would decide other packs' mail too. */
  const mail = value<Arrived>(k.arrive({ channel: 'email', headers: { From: 'news@shop.example' }, body: NOT_THE_BANKS['a shop promotion']!, sha256: 'mail-promo' }));
  assert.equal(mail.state, 'untriaged', 'unread mail was decided by the bank pack');
  sql.close();
});

/**
 * THE KERNEL HAS NO PRIORITY, ONLY AN ORDER, AND THE ORDER MOVES. The door's own pattern is offered first and then
 * every pattern naming it in the order `SELECT ... FROM declaration` returns them, which is the order their rows were
 * written; a pattern updated by a later version of the pack is a new row, so it sorts after a catch-all written before
 * it. Measured with the catch-all's `match:` removed: after an update that changed only `bank-card-used-sms`'s
 * description, the next card alert was claimed by the catch-all. So the catch-all is not last by position: it refuses
 * every text carrying a phrase one of the twins requires, which makes the two sets disjoint whatever order they are
 * offered in. This holds that for every twin, so a new wording that requires none of the phrases fails here and not on
 * his phone.
 */
test('THE CATCH-ALL CANNOT TAKE A TEXT A TWIN READS, whatever order the record offers them in', () => {
  const declarations = (bankHsbcEgPack() as { declarations: Record<string, unknown>[] }).declarations;
  const catchAll = declarations.filter((d) => d.door === HSBC_EG_SMS_DOOR && !Object.hasOwn(HSBC_EG_SMS_INGESTS, d.ingest as string));
  assert.equal(catchAll.length, 1, 'the pack declares no catch-all at its door');
  /* FIELD AND PHRASE TOGETHER, because a twin requiring `from hsbc:` in some other field than the one the catch-all
     refuses it in would leave both free to take the same body. */
  const refused = ((catchAll[0]!.match as { none?: { field: string; contains: string }[] }).none ?? []).map((p) => `${p.field}:${p.contains}`);

  for (const twin of Object.values(HSBC_EG_SMS_INGESTS)) {
    const required = ((twin.match as { all?: { field?: string; contains?: string }[] }).all ?? []).filter((p) => p.contains !== undefined).map((p) => `${p.field}:${p.contains}`);
    assert.ok(required.some((phrase) => refused.includes(phrase)), `${twin.ingest} requires no phrase the catch-all refuses`);
  }
});
