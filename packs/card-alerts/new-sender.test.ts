/**
 * Mail a stranger signs for their own address files nothing until a person says yes to that address.
 *
 * THROUGH THE REAL MAIL DOOR: `serveIngest`, its own DKIM check, the record's `arrive`, with the Card alerts file as it
 * ships, whose mail patterns read only the words. `verified` says the sender is who its `From:` says and nothing about
 * whether it is the bank. Before this, a body saying "Your card ending 4471 was debited GBP 9999.00 at ATTACKER LTD",
 * signed by the attacker's own domain, wrote that debit to the ledger at `exact` with nobody asked.
 *
 * Every domain, digit and amount is made up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { serveIngest, type IngestDoor } from '../../packages/host/src/ingest.ts';
import { keyed, published, sign, type Signer } from '../../packages/host/test/dkim-sign.ts';
import { confirmedSender, namesSender } from '../../packages/kernel/src/ingest.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 8, 20, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };
const CHARGE = (amount: string, shop = 'ATTACKER LTD'): string => `Your card ending 4471 was debited GBP ${amount} at ${shop} on 18/09/26.`;

type Api = Awaited<ReturnType<typeof createRecordApi>>;
const said = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: unknown; refusal?: unknown };
  assert.ok(x.ok, JSON.stringify(x.refusal));
  return x.value as T;
};

async function put(api: Api, doc: unknown): Promise<void> {
  const { diff } = said<{ diff: { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

async function stand(): Promise<{ api: Api; sql: NodeSql; door: IngestDoor; post: (signer: Signer, from: string, body: string) => Promise<void> }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_1', 'owner@owner.example', 'The owner')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_1', '*', 'owner')");
  for (const id of FIRST_PARTY) await put(api, firstPartyDocument(id));
  await put(api, JSON.parse(readFileSync(new URL('./card-alerts.pack.json', import.meta.url), 'utf8')));
  said(
    api.kernel.create('accounts', { name: 'Company card', kind: 'card', balance: { amount: 0, currency: 'GBP' }, as_of: '2026-09-20', liquid: false, last4: '4471' } as never, {
      actor: 'p_1',
      principal: { kind: 'person' },
    } as never),
  );
  const signers: Signer[] = [];
  const door: IngestDoor = {
    verify: async () => null,
    arrive: async (a) => api.arrive(a as never),
    limit: async () => null,
    inbound: async () => api.kernel.identity()?.id ?? 'rec',
    dkim: (name) => published(...signers)(name),
  };
  let n = 0;
  const post = async (signer: Signer, from: string, body: string): Promise<void> => {
    signers.push(signer);
    const raw = await sign(`From: ${from}\r\nSubject: note ${++n}\r\n\r\n${body}\r\n`, signer);
    const res = await serveIngest(new Request('https://x/in/email/a-mailbox-token-of-some-length', { method: 'POST', body: raw }), door);
    assert.equal(res.status, 202);
  };
  return { api, sql, door, post };
}

const ledger = (sql: NodeSql): string[] => sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'transactions' AND deleted_at IS NULL").map((r) => r.fields);
const lastInbox = (sql: NodeSql): { state: string; reason: string | null } => sql.one<{ state: string; reason: string | null }>('SELECT state, reason FROM inbox_raw ORDER BY rowid DESC LIMIT 1')!;
const openQuestions = (sql: NodeSql): { id: string; body: string }[] => sql.all<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE body_kind = 'rowset' AND status = 'open'");

test('A STRANGER SIGNING FOR THEIR OWN DOMAIN FILES NOTHING, AND THE QUESTION NAMES WHO', async () => {
  const { sql, post } = await stand();
  await post(await keyed('evil.example'), 'Anyone <bot@evil.example>', CHARGE('9999.00'));
  assert.equal(lastInbox(sql).state, 'proposed');
  assert.match(lastInbox(sql).reason ?? '', /Nobody has said yes to this sender/);
  assert.deepEqual(ledger(sql), []);
  const [asked] = openQuestions(sql);
  assert.equal((JSON.parse(asked!.body) as { sender: string }).sender, 'bot@evil.example');
  const event = sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'suggest' ORDER BY rowid DESC LIMIT 1");
  assert.match(event!.note, /from bot@evil\.example, which is new here/);
});

test('A FLOOD FROM ONE ADDRESS IS ONE CARD, AND A SECOND ADDRESS IS ITS OWN', async () => {
  const { sql, post } = await stand();
  const evil = await keyed('evil.example');
  for (const [i, amount] of ['1.00', '2.00', '3.00'].entries()) await post(evil, 'bot@evil.example', CHARGE(amount, `SHOP ${i}`));
  assert.equal(openQuestions(sql).length, 1);
  await post(evil, 'other@evil.example', CHARGE('4.00', 'SHOP 9'));
  assert.equal(openQuestions(sql).length, 2);
  assert.deepEqual(ledger(sql), []);
});

test('A YES FILES IT, AND LATER MAIL FROM THAT ADDRESS, AND NOBODY ELSE AT THE DOMAIN', async () => {
  const { api, sql, post } = await stand();
  const bank = await keyed('bank.example');
  await post(bank, 'Bank <alerts@bank.example>', CHARGE('12.00', 'FIRST SHOP'));
  const [asked] = openQuestions(sql);
  said(await api.decide({ id: asked!.id, decide: { option: 'accept' } } as never, owner));
  assert.equal(ledger(sql).length, 1);
  assert.ok(confirmedSender(sql, 'alerts@bank.example', 'bank-card-out'));

  await post(bank, 'Bank <alerts@bank.example>', CHARGE('13.00', 'SECOND SHOP'));
  assert.equal(lastInbox(sql).state, 'matched');
  assert.equal(ledger(sql).length, 2);

  await post(bank, 'Bank <someone-else@bank.example>', CHARGE('14.00', 'THIRD SHOP'));
  assert.equal(lastInbox(sql).state, 'proposed');
  assert.equal(ledger(sql).length, 2);
});

test('A NO FILES NOTHING, AND THE NEXT MAIL ASKS AGAIN', async () => {
  const { api, sql, post } = await stand();
  const evil = await keyed('evil.example');
  await post(evil, 'bot@evil.example', CHARGE('5.00'));
  said(await api.decide({ id: openQuestions(sql)[0]!.id, decide: { option: 'reject', reason: 'not mine' } } as never, owner));
  assert.deepEqual(ledger(sql), []);
  assert.equal(confirmedSender(sql, 'bot@evil.example', 'bank-card-out'), false);
  await post(evil, 'bot@evil.example', CHARGE('6.00', 'NEW SHOP'));
  assert.equal(lastInbox(sql).state, 'proposed');
  assert.deepEqual(ledger(sql), []);
});

test('A RECORD THAT ALREADY FILED MAIL FROM AN ADDRESS IS NOT ASKED AGAIN', async () => {
  const { api, sql, post } = await stand();
  /* AS A MESSAGE FILED BEFORE THIS QUESTION WAS: a pattern read it and wrote the row, and the arrival has its receipt. */
  said(api.kernel.arrive({ channel: 'email', headers: { from: 'Bank <alerts@bank.example>' }, body: CHARGE('20.00', 'OLD SHOP'), sha256: 'filed-before' } as never));
  assert.equal(ledger(sql).length, 1);
  await post(await keyed('bank.example'), 'Bank <alerts@bank.example>', CHARGE('21.00', 'NEWER SHOP'));
  assert.equal(lastInbox(sql).state, 'matched');
  assert.equal(ledger(sql).length, 2);
});

test('ONLY AN EXACT TEST ON THE ADDRESS NAMES A SENDER, AND A DISPLAY NAME NEVER DOES', () => {
  assert.equal(namesSender({ field: 'from_domain', is: 'bank.example' } as never), true);
  assert.equal(namesSender({ field: 'from_address', in: ['a@bank.example'] } as never), true);
  assert.equal(namesSender({ all: [{ field: 'body', contains: 'x' }, { field: 'from_domain', is: 'bank.example' }] } as never), true);
  /* `From: "bank.example" <bot@evil.example>`, signed by evil.example, is verified, and each of these is true of it. */
  assert.equal(namesSender({ field: 'from', is: 'alerts@bank.example' } as never), true);
  assert.equal(namesSender({ field: 'from', contains: 'bank.example' } as never), false);
  assert.equal(namesSender({ field: 'from_domain', contains: 'bank' } as never), false);
  assert.equal(namesSender({ any: [{ field: 'from_domain', is: 'bank.example' }, { field: 'body', contains: 'x' }] } as never), false);
  assert.equal(namesSender({ field: 'body', contains: 'x' } as never), false);
});

test('A STRANGER REPEATING A ROW WRITES NOTHING ONTO IT, AND ASKS NOTHING', async () => {
  const { api, sql, post } = await stand();
  said(api.kernel.arrive({ channel: 'email', headers: { from: 'Bank <alerts@bank.example>' }, body: CHARGE('30.00', 'SAME SHOP'), sha256: 'the-real-one' } as never));
  const before = ledger(sql);
  await post(await keyed('evil.example'), 'bot@evil.example', `${CHARGE('30.00', 'SAME SHOP')} Reference 12345. Available balance GBP 1.00.`);
  assert.equal(lastInbox(sql).state, 'skipped');
  assert.deepEqual(ledger(sql), before);
  assert.deepEqual(openQuestions(sql), []);
});

test('A WEBHOOK DOOR IS NOT ASKED: ITS TOKEN NAMES ITS ONE SENDER', async () => {
  const { api, sql } = await stand();
  said(await api.arrive({ channel: 'webhook', ingest: 'bank-card-out-sms', headers: {}, body: CHARGE('7.00', 'TEXT SHOP'), sha256: 'a-text', verified: true } as never));
  assert.equal(lastInbox(sql).state, 'matched');
  assert.equal(ledger(sql).length, 1);
});

/**
 * THE SAME ALERT AGAIN. A signed mail stays signed when it is sent on, so a new envelope is new bytes and the arrival's hash
 * does not know it, and an SMS door hears whatever the token's holder posts. While the row stands the dedupe holds. These
 * are the ways round it: the row was deleted, and a pattern that keys on no day the words hold.
 */
test('THE SAME WORDS FROM THE SAME SENDER ARE HELD, NOT FILED AGAIN, THOUGH THE ROW THEY MADE IS GONE', async () => {
  const { api, sql, post } = await stand();
  const bank = await keyed('bank.example');
  await post(bank, 'Bank <alerts@bank.example>', CHARGE('12.00', 'FIRST SHOP'));
  const [asked] = openQuestions(sql);
  said(await api.decide({ id: asked!.id, decide: { option: 'accept' } } as never, owner));
  assert.equal(ledger(sql).length, 1);

  /* NEW BYTES, THE ROW STILL THERE: as ever, the row's own dedupe sets it aside. */
  await post(bank, 'Bank <alerts@bank.example>', CHARGE('12.00', 'FIRST SHOP'));
  assert.equal(lastInbox(sql).state, 'skipped');
  assert.equal(ledger(sql).length, 1);

  /* HE DELETED IT AS WRONG, AND IT COMES AGAIN, spaced differently: nothing goes back on the ledger, and it waits to be looked at. */
  sql.exec("UPDATE entry SET deleted_at = '2026-09-20T12:00:00.000Z' WHERE register = 'transactions'");
  await post(bank, 'Bank <alerts@bank.example>', ` ${CHARGE('12.00', 'FIRST SHOP')}\r\n\r\n`);
  assert.equal(lastInbox(sql).state, 'review');
  assert.match(lastInbox(sql).reason ?? '', /same words from this sender/u);
  assert.deepEqual(ledger(sql), []);

  /* ANOTHER ADDRESS SAYING THE SAME WORDS IS NOT A REPEAT, and is asked about as any new address is. Nor is another amount. */
  await post(bank, 'Bank <someone-else@bank.example>', CHARGE('12.00', 'FIRST SHOP'));
  assert.equal(lastInbox(sql).state, 'proposed');
  await post(bank, 'Bank <alerts@bank.example>', CHARGE('12.50', 'FIRST SHOP'));
  assert.equal(lastInbox(sql).state, 'matched');
  assert.equal(ledger(sql).length, 1);
});

test('A TEXT PASTED AGAIN AT THE SMS DOOR IS HELD; ONE NOBODY VERIFIED MAKES NO REPEAT OF THE REAL ONE; PAST THE WINDOW IT IS NEW', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_1', 'owner@owner.example', 'The owner')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_1', '*', 'owner')");
  for (const id of FIRST_PARTY) await put(api, firstPartyDocument(id));
  said(api.kernel.create('accounts', { name: 'Company card', kind: 'card', balance: { amount: 0, currency: 'GBP' }, as_of: '2026-09-20', liquid: false } as never, { actor: 'p_1', principal: { kind: 'person' } } as never));
  /* A BANK WHOSE TEXT HOLDS NO DAY AND A PATTERN WITH NO KEY, so nothing but the words can tell. A person's own pattern can be this. */
  await put(api, {
    pack: 'plain-bank',
    version: '1.0.0',
    title: 'Plain bank',
    author: 'Nobody',
    license: 'MIT',
    summary: 'Texts with no day in them.',
    declarations: [
      {
        ingest: 'plain-bank-sms',
        channel: 'webhook',
        verify: { kind: 'path' },
        match: { field: 'body', contains: 'spent' },
        extract: { what: { text: { after: ' at ' } }, amount: { money: { after: 'spent ', currency: 'GBP' } } },
        writes: { register: 'transactions', confidence: 'exact', set: { direction: 'out', state: 'cleared', on: '2026-09-20', account: 'accounts#1' } },
        on_conflict: 'new',
      },
    ],
  });
  const text = 'You spent GBP 40.00 at A SHOP';
  const arrive = async (sha256: string, verified = true) =>
    said<{ state: string; wrote: unknown[] }>(await api.arrive({ channel: 'webhook', ingest: 'plain-bank-sms', body: text, sha256, verified } as never));
  /* A FORGERY FIRST: stored, read by nobody, and the genuine text after it still files. */
  assert.equal((await arrive('a'.repeat(64), false)).state, 'untriaged');
  const first = await arrive('b'.repeat(64));
  assert.ok(first.state !== 'untriaged' && first.state !== 'review', JSON.stringify(first));
  const before = ledger(sql).length;
  assert.equal((await arrive('c'.repeat(64))).state, 'review');
  assert.equal(ledger(sql).length, before, 'a repeat writes nothing');
  clock.advance(31 * 86_400_000);
  assert.notEqual((await arrive('d'.repeat(64))).state, 'review');
});
