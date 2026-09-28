/**
 * His iOS Shortcut posting one `From HSBC:` SMS body at `/in/*`, through a real record holding the money pack.
 *
 * `loop/research-switch-matrix.md` brief 2. The bank patterns read his real bodies (71 of 74 exact,
 * `loop/research-bank-real.md`); what was missing is a door the Shortcut can reach that files anything. Every
 * amount, date, account digit and wording below is invented, in the shape `packages/record/test/money-ipn.test.ts`
 * already uses.
 *
 * MEASURED AT HEAD `1c9bb0f0` BEFORE ANYTHING WAS WRITTEN, with the door wired as `apps/worker/src/route.ts` wires it
 * (`verify` asks the record's `ingestVerify`, `arrive` drops the URL's ingest id): the SMS posted at
 * `/in/webhook/<rec>/bank-from-out/<token>` answered 404, because every `bank-*` pattern is `channel: email` and
 * `ingestVerify` answers `null` for anything that is not a webhook. Posted at a webhook ingest declared beside them it
 * answered 202 and was stored `untriaged`, because `ingestVerify` answers `{ kind: 'none' }` for every webhook ingest.
 * And a declaration carrying `verify: { kind: 'hmac_sha256' }`, or `verify:` on an email ingest, installed without a
 * word, because nothing in `declare.ts` read the key: a person could believe an ingest was verified that never was.
 *
 * MEASURED AGAIN AT `15a6aa33`, AFTER `ef182a6c` PUT `verify: { kind: path }` IN THE GRAMMAR: the right token, posted
 * through that same door at a twin declaring it, was still stored `untriaged`. The door compared the segment in the
 * clear against a token the record could not answer with, because it keeps none, so `ingestVerify` said `none` and
 * the earlier cut of this file had to hold the token in its own door to show a match at all. Now the record keeps the
 * mint's digest, the door digests the segment before it compares, and the door below holds nothing: it passes the
 * record's answer through, which is exactly what the Worker does.
 *
 * WHAT THIS FILE STILL DOES NOT HOLD. A self-host refuses the five-segment shape outright (`apps/selfhost/src/server.ts`,
 * `arrivalDoor`, and its test at `:232`), and its own three-segment shape carries no token, so on the self-host his
 * Shortcut has no URL a path token can ride in yet; that door is `apps/selfhost`'s to open. The mint is routed now,
 * as the ADMIN write `/api/ingestMint`, and (8) drives it from the request a browser would send to the SMS it matches.
 *
 * THE BANK'S PATTERNS ARE ITS PACK FILE'S, INSTALLED ON TOP OF THE SEED. The sample carried the twelve until
 * 25 September, for this file among others; `record()` now installs `packs/bank-hsbc-eg/bank-hsbc-eg.pack.json` itself
 * (`seed/test/pack-files.ts`), and (7) holds that the seed alone ships no text door at all since money-core 3.0.0.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRecordApi, type CallContext } from '@braindog/record';
import type { Kernel } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi, serveIngest, type IngestDoor } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, day, installSeed } from '../../seed/src/index.ts';
import { HSBC_EG_INGESTS, HSBC_EG_SMS_INGESTS, bankDeclarations } from '../../seed/test/pack-files.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

/** `money-ipn.test.ts`'s own `bank-from-out` wording: a withdrawal of EGP 2,500.00 from the account ending 846. */
const SMS = 'From HSBC: 16AUG26 ATM Cash Withdrawal from 310-527***-846 EGP 2500.00- Your available balance is EGP 31,040.25';

/** A second withdrawal in the same wording, so a test can post two debits that are not one arrival twice. */
const SMS_AGAIN = 'From HSBC: 17AUG26 ATM Cash Withdrawal from 310-527***-846 EGP 1200.00- Your available balance is EGP 29,840.25';

/** And its `bank-from-in` wording: EGP 418.62 of interest into the same account. */
const CREDIT = 'From HSBC: 01AUG26 Deposit Interest 310-527***-846 EGP 418.62+ Your available balance is EGP 33,540.25';

/**
 * The pack's webhook twins, as declarations. `record()` installs the pack's file, so installing them again here
 * changes nothing, and the tests that do so still say which twins each one leans on.
 */
const twins = (...ids: string[]) =>
  ids.map((id) => ({ id: `ingest.${id}`, kind: 'ingest' as const, body: HSBC_EG_SMS_INGESTS[id]! as never }));

type Api = Awaited<ReturnType<typeof createRecordApi>>;

/** The seed, and the bank's pack file on it unless `bank` is false, and the current account the invented lines name. */
async function record(bank = true): Promise<{ k: Kernel; sql: ReturnType<typeof openSqlite>; api: Api }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const k = api.kernel;
  assert.ok((await installSeed(k)).ok);
  if (bank) {
    const put = await k.install(bankDeclarations());
    assert.ok(put.ok, JSON.stringify(put));
  }
  const made = k.create(
    'accounts',
    { name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: true, last4: '846' },
    { actor: 'p_seed' },
  );
  assert.ok(made.ok, JSON.stringify(made));
  return { k, sql, api };
}

/**
 * The Worker's door over one record, and nothing more. `verify` passes the record's answer through untouched, which
 * is `arrivals` in `apps/worker/src/index.ts`: the door holds no token, so whatever matches is the record's doing.
 */
function door(api: Api): IngestDoor {
  return {
    verify: async (ask) => (ask.rec === REC ? api.ingestVerify({ ingest: ask.ingest }) : null),
    arrive: (arrival) => api.arrive({ channel: arrival.channel, headers: arrival.headers, body: arrival.body, sha256: arrival.sha256, verified: arrival.verified }),
    limit: async () => null,
  };
}

/** The token the mint shows once, which is what he would paste into the Shortcut. */
async function minted(api: Api, ingest: string): Promise<string> {
  const out = await api.ingestMint({ ingest }, OWNER);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.token;
}

const post = (d: IngestDoor, path: string, body: string) => serveIngest(new Request(`https://in.example${path}`, { method: 'POST', body }), d);

const stored = (sql: Sql) => sql.all<{ state: string; channel: string }>('SELECT state, channel FROM inbox_raw').map((r) => ({ state: r.state, channel: r.channel }));

test('(1) AT THE MAIL PATTERN\'S ID, THE SMS IS A 404: no mail pattern is a webhook, so there is no door to post at', async () => {
  const { sql, api } = await record();
  const out = await post(door(api), `/in/webhook/${REC}/bank-from-out/tk_any_token_at_all`, SMS);
  assert.equal(out.status, 404);
  assert.deepEqual(stored(sql), []);
  sql.close();
});

test('(2) WITH THE MINTED TOKEN, THE SMS LANDS matched AND WRITES THE WITHDRAWAL', async () => {
  const { k, sql, api } = await record();
  const put = await k.install(twins('bank-from-out-sms', 'bank-from-in-sms', 'bank-from-unsure-sms'));
  assert.ok(put.ok, JSON.stringify(put));
  const token = await minted(api, 'bank-from-out-sms');
  const before = k.count('transactions');
  const out = await post(door(api), `/in/webhook/${REC}/bank-from-out-sms/${token}`, SMS);
  assert.equal(out.status, 202);
  assert.equal(await out.text(), '', 'the answer said something about what the bytes did');
  assert.deepEqual(stored(sql), [{ state: 'matched', channel: 'webhook' }]);
  assert.equal(k.count('transactions'), before + 1, 'the withdrawal was not written');

  /* ONE TWIN'S URL IS THE DOOR FOR ALL OF THEM, because neither host hands the URL's ingest id to `arrive`: a credit
     posted at the withdrawal's URL is claimed by `bank-from-in-sms`, which is what lets his one Shortcut post every
     message to one address with one token. */
  const credit = await post(door(api), `/in/webhook/${REC}/bank-from-out-sms/${token}`, CREDIT);
  assert.equal(credit.status, 202);
  const claimed = sql.one<{ ingest_id: string }>('SELECT r.ingest_id FROM ingest_receipt r JOIN inbox_raw i ON i.id = r.raw_id WHERE i.body = ?', CREDIT);
  assert.equal(claimed?.ingest_id, 'bank-from-in-sms');
  sql.close();
});

test('(3) WITH A WRONG TOKEN, THE SAME SMS IS STORED untriaged AND WRITES NOTHING', async () => {
  const { k, sql, api } = await record();
  assert.ok((await k.install(twins('bank-from-out-sms'))).ok);
  await minted(api, 'bank-from-out-sms');
  const before = k.count('transactions');
  const out = await post(door(api), `/in/webhook/${REC}/bank-from-out-sms/tk_shortcut_not_the_one_he_was_shown`, SMS);
  assert.equal(out.status, 202, 'a wrong token is a row somebody can look at, not a refusal nobody sees');
  assert.deepEqual(stored(sql), [{ state: 'untriaged', channel: 'webhook' }]);
  assert.equal(k.count('transactions'), before);
  sql.close();
});

test('(4) A TOKEN THAT WAS ROTATED AWAY IS A WRONG TOKEN, and so is the digest of the right one sent as the segment', async () => {
  const { k, sql, api } = await record();
  assert.ok((await k.install(twins('bank-from-out-sms'))).ok);
  const before = k.count('transactions');
  const old = await minted(api, 'bank-from-out-sms');
  await minted(api, 'bank-from-out-sms');
  const held = await api.ingestVerify({ ingest: 'bank-from-out-sms' });
  assert.equal(held?.kind, 'path');
  /* THE DIGEST IS NOT A PASSWORD. A copy of the record hands somebody the digest, and posting it as the segment must
     not verify, which it would if the door compared the segment against what the record keeps without digesting it. */
  const leaked = held !== null && 'sha256' in held ? held.sha256 : '';
  assert.ok((await post(door(api), `/in/webhook/${REC}/bank-from-out-sms/${old}`, SMS)).status === 202);
  assert.ok((await post(door(api), `/in/webhook/${REC}/bank-from-out-sms/${leaked}`, SMS_AGAIN)).status === 202);
  assert.deepEqual(stored(sql), [
    { state: 'untriaged', channel: 'webhook' },
    { state: 'untriaged', channel: 'webhook' },
  ]);
  assert.equal(k.count('transactions'), before);
  sql.close();
});

test('(5) BEFORE ANYTHING IS MINTED, THE RIGHT-SHAPED URL STILL LANDS untriaged, because the record has nothing to compare', async () => {
  const { k, sql, api } = await record();
  assert.ok((await k.install(twins('bank-from-out-sms'))).ok);
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'none' });
  const out = await post(door(api), `/in/webhook/${REC}/bank-from-out-sms/tk_shortcut_0b7e4c19d2a85f36e1c07a9b4d58f2e6`, SMS);
  assert.equal(out.status, 202);
  assert.deepEqual(stored(sql), [{ state: 'untriaged', channel: 'webhook' }]);
  sql.close();
});

test('(6) verify: IS READ WHERE IT IS WRITTEN: a path token on a webhook, and nothing else installs', async () => {
  const { k, sql } = await record();
  const refused = async (body: Record<string, unknown>, why: RegExp) => {
    const { pack: _pack, ...base } = HSBC_EG_INGESTS['bank-from-out']!;
    const put = (await k.install([{ id: 'ingest.probe', kind: 'ingest', body: { ...base, ingest: 'probe', ...body } as never }])) as {
      ok: boolean;
      refusal?: { code: string; fix: string; at?: string };
    };
    assert.equal(put.ok, false, `${JSON.stringify(body)} installed`);
    assert.equal(put.refusal?.at, 'verify');
    assert.match(put.refusal?.fix ?? '', why);
  };
  await refused({ channel: 'email', verify: { kind: 'path' } }, /only a webhook/u);
  /* A signature with no key behind it (DOR-3): the HMAC is built now, and one naming no vault label verifies nothing. */
  await refused({ channel: 'webhook', verify: { kind: 'hmac_sha256', header: 'x-signature' } }, /names no key/u);
  await refused({ channel: 'webhook', verify: { kind: 'path', token: 'tk_written_into_the_declaration' } }, /never in a declaration/u);
  await refused({ channel: 'webhook', verify: 'path' }, /\{ kind: path \}/u);
  assert.ok((await k.install(twins('bank-from-out-sms'))).ok, 'the one shape that is built was refused');
  sql.close();
});

test('(7) THE SEED SHIPS NO TEXT DOOR: a record set up with money-core has none until a pack brings one', async () => {
  /* money-core's CARD TWINS LEFT FOR `packs/card-alerts` AT 3.0.0, as the bank's left for its own pack before them, so
     a record the seed alone set up answers no text message at all, and each door arrives with the pack that holds it. */
  const { k, sql, api } = await record(false);
  assert.equal(await api.ingestVerify({ ingest: 'bank-card-out-sms' }), null, 'the seed alone carries the card alerts\' door');
  assert.equal(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), null, 'the seed alone carries the bank pack\'s door');
  assert.deepEqual(k.declarations().filter((d) => d.kind === 'ingest' && d.id.endsWith('-sms')).map((d) => d.id), []);
  /* AND WITH THE PACK, ITS SIX TWINS AND THE DOOR'S CATCH-ALL BESIDE THEM. */
  const withBank = await record();
  assert.deepEqual(await withBank.api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'none' });
  assert.equal(
    withBank.k.declarations().filter((d) => d.kind === 'ingest' && d.id.endsWith('-sms')).length,
    Object.keys(HSBC_EG_SMS_INGESTS).length + 1,
  );
  withBank.sql.close();
  sql.close();
});

test('(8) /api/ingestMint IS AN ADMIN WRITE, and the token it answers is the one the door then matches', async () => {
  /* RED BEFORE THE ROW: `serveApi` answered 404 `ROUTE_UNKNOWN`, so the mint was reachable from a test and from
     nothing a person could open. */
  const route = ROUTES.find((r) => r.name === 'ingestMint') ?? assert.fail('ingestMint is not routed');
  assert.deepEqual([route.group, route.writes], ['ADMIN', true]);

  const { k, sql, api } = await record();
  const handlers = handlersFor(api);
  const call = async (ctx: CallContext) => {
    const res = await serveApi(new Request('https://x/api/ingestMint', { method: 'POST', body: JSON.stringify({ ingest: 'bank-from-out-sms' }) }), handlers, ctx);
    return { status: res.status, body: (await res.json()) as { ok: boolean; value?: { ingest: string; token: string }; refusal?: { code: string } } };
  };
  const agent = await call({ principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_owner', level: 'owner' } });
  assert.deepEqual([agent.status, agent.body.refusal?.code], [403, 'NEEDS_BROWSER_SESSION']);

  const session = await call({ ...OWNER, credentialed: true, provedAt: NOW - 60_000 });
  assert.equal(session.status, 200, JSON.stringify(session.body));
  const token = session.body.value!.token;
  const before = k.count('transactions');
  const out = await post(door(api), `/in/webhook/${REC}/bank-from-out-sms/${token}`, SMS);
  assert.equal(out.status, 202);
  assert.deepEqual(stored(sql), [{ state: 'matched', channel: 'webhook' }]);
  assert.equal(k.count('transactions'), before + 1);
  sql.close();
});
