/**
 * One webhook door, several patterns: a pattern may say `door: <ingest id>`, and an arrival named for that door is
 * offered the door's own pattern and then every pattern naming it.
 *
 * ONE ADDRESS READ ONE WORDING, AND HIS PHONE SENDS SIX. An arrival named for an ingest was offered that ingest's
 * pattern and no other (`arrive-ingest.test.ts` holds why), so the Shortcut that posts his bank's texts needed six
 * branches chosen by a phrase, one URL each, and a text sent down the wrong branch was stored `untriaged` and filed as
 * nothing. Measured at HEAD before this change: the first test below came back `untriaged` with no row, and every
 * `door:` in the install cases installed clean and did nothing, because no check read the key.
 *
 * WHAT DID NOT MOVE, AND IS HELD HERE SO IT CANNOT. The token is the named door's: an arrival nothing verified is
 * offered no pattern and starts no automation. A pattern that names no door is never offered a named arrival. And
 * the door's own pattern goes first whatever the declaration order, because its sender is the one the URL vouched for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { UNVERIFIED } from '../src/ingest.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const REGISTER = (id: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: {
    id,
    name: id,
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
});

/* EACH PATTERN WRITES INTO A REGISTER OF ITS OWN, so the counts say whose extraction ran and not only which name came
   back on the receipt. `word` is the one phrase the pattern asks for, so a body picks its patterns by what it says. */
const HOOK = (ingest: string, word: string, register: string, more: Record<string, unknown> = {}): Declaration => ({
  id: `ingest.${ingest}`,
  kind: 'ingest',
  body: {
    ingest,
    channel: 'webhook',
    verify: { kind: 'path' },
    match: { all: [{ field: 'body', contains: word }] },
    extract: { merchant: { text: { between: ['You ', ' EGP'] } }, amount: { money: { after: 'EGP', currency: 'EGP' } } },
    writes: { register, confidence: 'exact' },
    dedupe: ['merchant'],
    on_conflict: 'skip',
    ...more,
  } as never,
});

const why = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  return x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`;
};

async function record(decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([REGISTER('one'), REGISTER('two'), REGISTER('three'), ...decls]);
  assert.ok(installed.ok, why(installed));
  return { k, sql };
}

const arrived = (r: unknown): Arrived => {
  assert.ok((r as { ok: boolean }).ok, why(r));
  return (r as { value: Arrived }).value;
};

const written = (k: Kernel): Record<string, number> => ({ one: k.count('one'), two: k.count('two'), three: k.count('three') });

const refused = async (decls: Declaration[]): Promise<{ code?: string; at?: string; fix?: string }> => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([REGISTER('one'), REGISTER('two'), ...decls]);
  sql.close();
  assert.equal(out.ok, false, 'installed clean, so the door names nothing anybody checked');
  return (out as { refusal: { code: string; at?: string; fix: string } }).refusal;
};

test('AN ARRIVAL NAMED FOR A DOOR IS FILED BY A PATTERN NAMING THAT DOOR, when only that pattern reads it', async () => {
  const { k, sql } = await record([HOOK('a', 'paid', 'one'), HOOK('b', 'withdrew', 'two', { door: 'a' })]);
  const out = arrived(k.arrive({ channel: 'webhook', ingest: 'a', body: 'You withdrew EGP 300.00 today.', sha256: 'd1', verified: true }));

  assert.equal(out.state, 'matched', `the text was ${out.state} at the door b names`);
  assert.equal(out.ingest, 'b');
  assert.deepEqual(written(k), { one: 0, two: 1, three: 0 });
  sql.close();
});

test('THE DOOR\'S OWN PATTERN GOES FIRST, though the one naming it was declared before it and reads the same text', async () => {
  const { k, sql } = await record([HOOK('b', 'paid', 'two', { door: 'a' }), HOOK('a', 'paid', 'one')]);
  const out = arrived(k.arrive({ channel: 'webhook', ingest: 'a', body: 'You paid EGP 120.00 today.', sha256: 'd2', verified: true }));

  assert.equal(out.ingest, 'a', `${out.ingest} filed a text its own door's pattern reads`);
  assert.deepEqual(written(k), { one: 1, two: 0, three: 0 });
  sql.close();
});

test('A PATTERN THAT NAMES NO DOOR IS NEVER OFFERED A NAMED ARRIVAL, though it is declared first and reads the text', async () => {
  const { k, sql } = await record([HOOK('c', 'refund', 'three'), HOOK('a', 'paid', 'one'), HOOK('b', 'withdrew', 'two', { door: 'a' })]);
  const out = arrived(k.arrive({ channel: 'webhook', ingest: 'a', body: 'You refund EGP 40.00 today.', sha256: 'd3', verified: true }));

  assert.equal(out.ingest, null, `${out.ingest} was offered an arrival its sender never vouched for`);
  assert.equal(out.state, 'untriaged');
  assert.deepEqual(written(k), { one: 0, two: 0, three: 0 });
  sql.close();
});

test('A PATTERN THAT NAMES A DOOR IS STILL A DOOR OF ITS OWN, and an arrival named for it is not handed back to the door', async () => {
  const { k, sql } = await record([HOOK('a', 'paid', 'one'), HOOK('b', 'withdrew', 'two', { door: 'a' })]);
  const out = arrived(k.arrive({ channel: 'webhook', ingest: 'b', body: 'You paid EGP 120.00 today.', sha256: 'd4', verified: true }));

  assert.equal(out.ingest, null, 'naming a door is one way, so a token for b buys no write under a');
  assert.deepEqual(written(k), { one: 0, two: 0, three: 0 });
  sql.close();
});

test('A DOOR THAT IS NOT INSTALLED, OR NOT A WEBHOOK, OR TAKES NO TOKEN, IS REFUSED AT INSTALL', async () => {
  const mail: Declaration = { ...HOOK('m', 'paid', 'one'), body: { ...(HOOK('m', 'paid', 'one').body as object), channel: 'email', verify: undefined } as never };
  const open: Declaration = { ...HOOK('o', 'paid', 'one'), body: { ...(HOOK('o', 'paid', 'one').body as object), verify: undefined } as never };

  const ghost = await refused([HOOK('a', 'paid', 'one'), HOOK('b', 'withdrew', 'two', { door: 'ghost' })]);
  assert.deepEqual([ghost.code, ghost.at], ['DECLARATION_INVALID', 'door'], ghost.fix);
  assert.match(ghost.fix ?? '', /ghost/u);

  const byMail = await refused([mail, HOOK('b', 'withdrew', 'two', { door: 'm' })]);
  assert.deepEqual([byMail.code, byMail.at], ['DECLARATION_INVALID', 'door'], byMail.fix);

  const noToken = await refused([open, HOOK('b', 'withdrew', 'two', { door: 'o' })]);
  assert.deepEqual([noToken.code, noToken.at], ['DECLARATION_INVALID', 'door'], noToken.fix);

  /* THE PATTERN ITSELF HAS TO ARRIVE BY WEBHOOK, since a door is a URL and an email pattern is offered mail only. */
  const mailNaming: Declaration = { ...HOOK('b', 'withdrew', 'two'), body: { ...(HOOK('b', 'withdrew', 'two').body as object), channel: 'email', verify: undefined, door: 'a' } as never };
  const wrongSide = await refused([HOOK('a', 'paid', 'one'), mailNaming]);
  assert.deepEqual([wrongSide.code, wrongSide.at], ['DECLARATION_INVALID', 'door'], wrongSide.fix);

  /* BY ITS OWN SENTENCE, NOT THE GHOST'S. With the type check taken out, `door: 7` was still refused at `door`, as "no
     ingest 7 is installed", so the code and the key alone held nothing (measured). */
  const notText = await refused([HOOK('a', 'paid', 'one'), HOOK('b', 'withdrew', 'two', { door: 7 })]);
  assert.deepEqual([notText.code, notText.at], ['DECLARATION_INVALID', 'door'], notText.fix);
  assert.match(notText.fix ?? '', /7 is not one/u);
});

test('AN ARRIVAL NAMED FOR A DOOR WITH A WRONG TOKEN IS OFFERED NO PATTERN AND STARTS NOTHING, as before doors', async () => {
  const heard: Declaration = { id: 'rule.heard', kind: 'rule', body: { rule: 'heard', on: { arrival: { channel: 'webhook' } }, steps: [{ notify: { say: 'Arrived' } }] } as never };
  const { k, sql } = await record([HOOK('a', 'paid', 'one'), HOOK('b', 'withdrew', 'two', { door: 'a' }), heard]);
  const out = arrived(k.arrive({ channel: 'webhook', ingest: 'a', body: 'You withdrew EGP 300.00 today.', sha256: 'd6', verified: false }));
  await k.drain();

  assert.deepEqual([out.ingest, out.state, out.reason], [null, 'untriaged', UNVERIFIED]);
  assert.deepEqual(written(k), { one: 0, two: 0, three: 0 });
  assert.deepEqual(sql.all("SELECT id FROM automation_run WHERE rule = 'heard'"), [], 'an arrival nothing verified started a run');

  /* AND THE RULE IS ONE THAT HEARS, or the empty list above is about a rule that never runs. */
  arrived(k.arrive({ channel: 'webhook', ingest: 'a', body: 'You withdrew EGP 300.00 today.', sha256: 'd6-real', verified: true }));
  await k.drain();
  assert.equal(sql.all("SELECT id FROM automation_run WHERE rule = 'heard'").length, 1, 'the verified arrival started no run either');
  assert.deepEqual(written(k), { one: 0, two: 1, three: 0 });
  sql.close();
});

test('HSBC EGYPT\'S SIX TEXT TWINS SHARE ONE DOOR: a card text posted to bank-from-out-sms is filed by the card twin', async () => {
  /* THE BANK'S PACK FILE ON THE SEED, since the sample stopped carrying its twelve (`seed/test/pack-files.ts`): with
     the seed alone this text arrived at a door the record did not have. */
  const { installSeed, day } = await import('../../seed/src/index.ts');
  const { HSBC_EG_SMS_INGESTS, bankDeclarations } = await import('../../seed/test/pack-files.ts');
  const twins = Object.values(HSBC_EG_SMS_INGESTS) as unknown as { ingest: string; door?: string }[];
  assert.deepEqual(twins.filter((t) => t.door === undefined).map((t) => t.ingest), ['bank-from-out-sms'], 'more than one twin is its own door');
  assert.equal(twins.filter((t) => t.door === 'bank-from-out-sms').length, 5);

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, why(seeded));
  const bank = await k.install(bankDeclarations());
  assert.ok(bank.ok, why(bank));
  const card = k.create('accounts', { name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: false, last4: '9052' }, { actor: 'p_seed' });
  assert.ok(card.ok, why(card));

  /* INVENTED VALUES IN THE BANK'S OWN WORDS, the card wording `packages/seed/test/money-bank.test.ts` forwards by mail. */
  const text = 'Your Credit Card ending with *** 9052 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your available limit is EGP 23,715.50';
  const out = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-from-out-sms', body: text, sha256: 'hsbc-card-door', verified: true }));
  assert.deepEqual([out.state, out.ingest, out.confidence], ['matched', 'bank-card-used-sms', 'exact'], out.reason);
  sql.close();
});
