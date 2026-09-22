/**
 * His iOS Shortcut posting one `From HSBC:` SMS body at a self-host, over a real socket, with the path token the
 * record minted.
 *
 * MEASURED BEFORE `arrivalDoor` CHANGED, against this same server: the right token, posted at
 * `/in/webhook/<this record>/bank-from-out-sms/<token>`, answered 404 and stored nothing, because the door answered
 * `null` for every path that named a record. The self-host's own shape, `/in/webhook/<ingest>`, has no segment a token
 * can ride in, so the only URL the Shortcut could use landed `untriaged` however right its token was. A person moving
 * from the Cloud had no URL to paste at all: the Cloud's is `/in/webhook/<rec>/<ingest>/<token>` (`cloudIngest` in
 * `apps/worker/src/route.ts`), and it was a 404 here.
 *
 * EVERY AMOUNT, DATE, ACCOUNT DIGIT AND WORDING BELOW IS INVENTED, in the shape
 * `packages/host/test/ingest-shortcut.test.ts` already uses. None of it is a real message.
 *
 * THE TOKEN IS MINTED BY THE RECORD, through `ingestMint`, and never written here: the door is handed nothing but what
 * the record answers, so a match below is the record's digest and the door's comparison and nothing this file holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CallContext } from '@braindog/record';
import { MONEY_INGESTS, day, installSeed } from '@braindog/seed';

import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

/** A withdrawal of EGP 2,500.00 from the account ending 327, in `bank-from-out`'s wording. Invented. */
const SMS = 'From HSBC: 16AUG26 ATM Cash Withdrawal from 042-118***-327 EGP 2500.00- Your available balance is EGP 31,040.25';

/**
 * `bank-from-out`'s webhook twin, built the way `MONEY_SMS_INGESTS` in `packages/seed/src/modules/money.ts` builds it:
 * the mail pattern, carried by a webhook, verified by a path token. Written out because the seed's index does not export
 * the twins yet, and a copy of one spread is less to drift than a path into another package's source.
 */
const TWIN = { ...MONEY_INGESTS['bank-from-out']!, ingest: 'bank-from-out-sms', channel: 'webhook', verify: { kind: 'path' } };

type Running = Awaited<ReturnType<typeof start>>;

async function host(): Promise<{ running: Running; port: number; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-shortcut-'));
  const running = await start({ file: join(dir, 'record.brain'), port: 0, pollMs: 0 });
  const k = running.api.kernel;
  assert.ok(k.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await installSeed(k)).ok);
  assert.ok((await k.install([{ id: 'ingest.bank-from-out-sms', kind: 'ingest', body: TWIN as never }])).ok);
  const made = k.create(
    'accounts',
    { name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: true, last4: '327' },
    { actor: 'p_seed' },
  );
  assert.ok(made.ok, JSON.stringify(made));
  return { running, port: (running.server.address() as { port: number }).port, dir };
}

const stop = async (made: { running: Running; dir: string }): Promise<void> => {
  await made.running.close();
  rmSync(made.dir, { recursive: true, force: true });
};

/** The token the mint shows once, which is what he would paste into the Shortcut. */
async function minted(running: Running): Promise<string> {
  const out = await running.api.ingestMint({ ingest: 'bank-from-out-sms' }, OWNER);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.token;
}

const send = (port: number, path: string, body: string): Promise<Response> =>
  fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', body });

const stored = (running: Running) =>
  running.sql.all<{ state: string; channel: string }>('SELECT state, channel FROM inbox_raw ORDER BY rowid').map((r) => ({ state: r.state, channel: r.channel }));

const withdrawals = (running: Running): number => running.api.kernel.count('transactions');

test('WITH THE MINTED TOKEN IN THE CLOUD\'S SHAPE, THE SMS LANDS matched AND WRITES THE WITHDRAWAL', async () => {
  const made = await host();
  try {
    const token = await minted(made.running);
    const before = withdrawals(made.running);
    const out = await send(made.port, `/in/webhook/${REC}/bank-from-out-sms/${token}`, SMS);
    assert.equal(out.status, 202);
    assert.equal(await out.text(), '', 'the `/api` fallback answered, not the arrival door');
    assert.deepEqual(stored(made.running), [{ state: 'matched', channel: 'webhook' }]);
    assert.equal(withdrawals(made.running), before + 1, 'the withdrawal was not written');
  } finally {
    await stop(made);
  }
});

test('WITH A WRONG TOKEN, THE SAME SMS IS STORED untriaged AND WRITES NOTHING', async () => {
  const made = await host();
  try {
    await minted(made.running);
    const before = withdrawals(made.running);
    const out = await send(made.port, `/in/webhook/${REC}/bank-from-out-sms/tk_shortcut_not_the_one_he_was_shown`, SMS);
    assert.equal(out.status, 202, 'a wrong token is a row somebody can look at, not a refusal nobody sees');
    assert.deepEqual(stored(made.running), [{ state: 'untriaged', channel: 'webhook' }]);
    assert.equal(withdrawals(made.running), before);
  } finally {
    await stop(made);
  }
});

test('WITH NO TOKEN SEGMENT, THE SELF-HOST\'S OWN SHAPE BEHAVES AS IT DID: stored untriaged, nothing written', async () => {
  const made = await host();
  try {
    await minted(made.running);
    const before = withdrawals(made.running);
    const out = await send(made.port, '/in/webhook/bank-from-out-sms', SMS);
    assert.equal(out.status, 202);
    assert.deepEqual(stored(made.running), [{ state: 'untriaged', channel: 'webhook' }]);
    assert.equal(withdrawals(made.running), before);
  } finally {
    await stop(made);
  }
});

test('AND A RECORD THAT IS NOT THIS ONE IS A 404, with the right token and nothing stored', async () => {
  const made = await host();
  try {
    const token = await minted(made.running);
    const out = await send(made.port, `/in/webhook/rec_01JZ8QK3F7R2M9V4XN6TCB5HAE/bank-from-out-sms/${token}`, SMS);
    assert.equal(out.status, 404);
    assert.equal(await out.text(), '');
    assert.deepEqual(stored(made.running), []);
  } finally {
    await stop(made);
  }
});

test('AND AN INGEST THAT READS NO TOKEN KEEPS THE ONE URL IT HAD: its five-segment shape is a 404', async () => {
  const made = await host();
  try {
    /* `bank-from-out` IS A MAIL PATTERN AND NOT A WEBHOOK, so it has no webhook URL at all. What this checks is a
       webhook declaring no `verify:`, and the seed carries none, so one is installed beside the twin. */
    const { verify: _verify, ...plain } = TWIN;
    assert.ok((await made.running.api.kernel.install([{ id: 'ingest.plain-sms', kind: 'ingest', body: { ...plain, ingest: 'plain-sms' } as never }])).ok);
    const out = await send(made.port, `/in/webhook/${REC}/plain-sms/tk_any_token_at_all`, SMS);
    assert.equal(out.status, 404);
    assert.deepEqual(stored(made.running), []);
  } finally {
    await stop(made);
  }
});
