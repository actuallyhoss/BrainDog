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
 * WHAT THIS FILE DOES NOT HOLD, said here because it is the half of the brief this build cannot give. The door
 * compares the path token IN THE CLEAR (`packages/host/src/ingest.ts`, `hook`: `sameSecret(path.token, v.token)`), and
 * the record has no table for a secret of its own (`history-cursor.ts`'s header), so a record that keeps only the
 * token's digest has nothing the door can compare. The door below therefore holds the token itself, which is the one
 * piece a host would take from the record once `hook` digests the segment before comparing it. And a self-host refuses
 * the five-segment shape outright (`apps/selfhost/src/server.ts`, `arrivalDoor`, and its test at `:232`), so on the
 * self-host his Shortcut has no URL a path token can ride in at all.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRecordApi } from '@braindog/record';
import type { Kernel } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';

import { serveIngest, type IngestDoor } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, day, installSeed } from '../../seed/src/index.ts';
import { MONEY_INGESTS } from '../../seed/src/modules/money.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** Invented, and never a credential anywhere: the token a mint would show him once. */
const TOKEN = 'tk_shortcut_0b7e4c19d2a85f36e1c07a9b4d58f2e6';

/** `money-ipn.test.ts`'s own `bank-from-out` wording: a withdrawal of EGP 2,500.00 from the account ending 327. */
const SMS = 'From HSBC: 16AUG26 ATM Cash Withdrawal from 042-118***-327 EGP 2500.00- Your available balance is EGP 31,040.25';

/** And its `bank-from-in` wording: EGP 418.62 of interest into the same account. */
const CREDIT = 'From HSBC: 01AUG26 Deposit Interest 042-118***-327 EGP 418.62+ Your available balance is EGP 33,540.25';

/**
 * The webhook twin of one `bank-*` pattern, as the Shortcut's door would declare it.
 *
 * BUILT HERE AND NOT READ FROM THE PACK, because the pack cannot carry one in this build: `INGESTS` in
 * `packages/seed/src/index.ts` is the only road from `money.ts` into the pack, and `money-ipn.test.ts` holds every key
 * of `MONEY_INGESTS` to a wording it drives by mail. What is taken from the pack is everything but the channel, so the
 * twin reads exactly what the mail pattern reads.
 */
const twin = (of: string) => {
  const { pack: _pack, ...body } = MONEY_INGESTS[of]!;
  return { id: `ingest.${of}-sms`, kind: 'ingest' as const, body: { ...body, ingest: `${of}-sms`, channel: 'webhook', verify: { kind: 'path' } } as never };
};

async function record(): Promise<{ k: Kernel; sql: ReturnType<typeof openSqlite>; api: Awaited<ReturnType<typeof createRecordApi>> }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const k = api.kernel;
  assert.ok((await installSeed(k)).ok);
  const made = k.create(
    'accounts',
    { name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: true, last4: '327' },
    { actor: 'p_seed' },
  );
  assert.ok(made.ok, JSON.stringify(made));
  return { k, sql, api };
}

/**
 * The Worker's door over one record. `token` is what a host would hold for a declared ingest; `null` is the host as
 * both are wired today, which answers whatever the record says.
 */
function door(api: Awaited<ReturnType<typeof createRecordApi>>, token: string | null): IngestDoor {
  return {
    verify: async (ask) => {
      if (ask.rec !== REC) return null;
      const said = await api.ingestVerify({ ingest: ask.ingest });
      return said === null || token === null ? said : { kind: 'path', token };
    },
    arrive: (arrival) => api.arrive({ channel: arrival.channel, headers: arrival.headers, body: arrival.body, sha256: arrival.sha256, verified: arrival.verified }),
    limit: async () => null,
  };
}

const post = (d: IngestDoor, path: string, body: string) => serveIngest(new Request(`https://in.example${path}`, { method: 'POST', body }), d);

const stored = (sql: Sql) => sql.all<{ state: string; channel: string }>('SELECT state, channel FROM inbox_raw').map((r) => ({ state: r.state, channel: r.channel }));

test('(1) AT THE MAIL PATTERN\'S ID, THE SMS IS A 404: no bank pattern is a webhook, so there is no door to post at', async () => {
  const { sql, api } = await record();
  const out = await post(door(api, TOKEN), `/in/webhook/${REC}/bank-from-out/${TOKEN}`, SMS);
  assert.equal(out.status, 404);
  assert.deepEqual(stored(sql), []);
  sql.close();
});

test('(2) WITH THE TOKEN, THE SMS LANDS matched AND WRITES THE WITHDRAWAL', async () => {
  const { k, sql, api } = await record();
  const put = await k.install(['bank-from-out', 'bank-from-in', 'bank-from-unsure'].map(twin));
  assert.ok(put.ok, JSON.stringify(put));
  const before = k.count('transactions');
  const out = await post(door(api, TOKEN), `/in/webhook/${REC}/bank-from-out-sms/${TOKEN}`, SMS);
  assert.equal(out.status, 202);
  assert.equal(await out.text(), '', 'the answer said something about what the bytes did');
  assert.deepEqual(stored(sql), [{ state: 'matched', channel: 'webhook' }]);
  assert.equal(k.count('transactions'), before + 1, 'the withdrawal was not written');

  /* ONE TWIN'S URL IS THE DOOR FOR ALL OF THEM, because neither host hands the URL's ingest id to `arrive`: a credit
     posted at the withdrawal's URL is claimed by `bank-from-in-sms`, which is what lets his one Shortcut post every
     message to one address. */
  const credit = await post(door(api, TOKEN), `/in/webhook/${REC}/bank-from-out-sms/${TOKEN}`, CREDIT);
  assert.equal(credit.status, 202);
  const claimed = sql.one<{ ingest_id: string }>("SELECT r.ingest_id FROM ingest_receipt r JOIN inbox_raw i ON i.id = r.raw_id WHERE i.body = ?", CREDIT);
  assert.equal(claimed?.ingest_id, 'bank-from-in-sms');
  sql.close();
});

test('(3) WITH A WRONG TOKEN, THE SAME SMS IS STORED untriaged AND WRITES NOTHING', async () => {
  const { k, sql, api } = await record();
  assert.ok((await k.install(['bank-from-out'].map(twin))).ok);
  const before = k.count('transactions');
  const out = await post(door(api, TOKEN), `/in/webhook/${REC}/bank-from-out-sms/tk_shortcut_not_the_one_he_was_shown`, SMS);
  assert.equal(out.status, 202, 'a wrong token is a row somebody can look at, not a refusal nobody sees');
  assert.deepEqual(stored(sql), [{ state: 'untriaged', channel: 'webhook' }]);
  assert.equal(k.count('transactions'), before);
  sql.close();
});

test('(4) AS BOTH HOSTS ARE WIRED, THE RIGHT TOKEN STILL LANDS untriaged, because the record answers nothing to compare', async () => {
  const { k, sql, api } = await record();
  assert.ok((await k.install(['bank-from-out'].map(twin))).ok);
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'none' });
  const out = await post(door(api, null), `/in/webhook/${REC}/bank-from-out-sms/${TOKEN}`, SMS);
  assert.equal(out.status, 202);
  assert.deepEqual(stored(sql), [{ state: 'untriaged', channel: 'webhook' }]);
  sql.close();
});

test('(5) verify: IS READ WHERE IT IS WRITTEN: a path token on a webhook, and nothing else installs', async () => {
  const { k, sql } = await record();
  const refused = async (body: Record<string, unknown>, why: RegExp) => {
    const { pack: _pack, ...base } = MONEY_INGESTS['bank-from-out']!;
    const put = (await k.install([{ id: 'ingest.probe', kind: 'ingest', body: { ...base, ingest: 'probe', ...body } as never }])) as {
      ok: boolean;
      refusal?: { code: string; fix: string; at?: string };
    };
    assert.equal(put.ok, false, `${JSON.stringify(body)} installed`);
    assert.equal(put.refusal?.at, 'verify');
    assert.match(put.refusal?.fix ?? '', why);
  };
  await refused({ channel: 'email', verify: { kind: 'path' } }, /only a webhook/u);
  await refused({ channel: 'webhook', verify: { kind: 'hmac_sha256', header: 'x-signature' } }, /hmac_sha256 is not built/u);
  await refused({ channel: 'webhook', verify: { kind: 'path', token: TOKEN } }, /never in a declaration/u);
  await refused({ channel: 'webhook', verify: 'path' }, /\{ kind: path \}/u);
  assert.ok((await k.install([twin('bank-from-out')])).ok, 'the one shape that is built was refused');
  sql.close();
});
