/**
 * A status no retry mends is final and uncounted, and a key that is there and will not open is a throw before any POST.
 * The host's half; the Worker's is `apps/worker/test/slash-key-status.test.ts`.
 *
 * THE STATUS. The retry default made every status that is not `ok` a plain throw, which `answer` settles as
 * `UNREACHABLE` and `serveAsks` asks again. Right for a 429 or a 503, which the next rung may find mended; wrong for a 400
 * (a model name the provider does not know), a 401 (a key that is wrong or expired) and a 404 (a wrong `SLASH_ENDPOINT`
 * path), which answer the same on every rung. A probe measured each of those as eight keyed posts over about 266
 * minutes, ending "could not be reached" about a provider that answered all eight.
 *
 * THE KEY. `endpointOptionsOf`'s `own()` answered `null` for a grant labelled `slash` that would not open, and
 * `post` then sent with no `authorization`. The Worker checks the label and not the opening, so a `KEK` changed under a
 * record sent eight anonymous POSTs to the owner's provider. `keyRequired` is the Worker's switch for the rule tier `b`
 * already keeps; the self-host passes none, because its keyless local model is the product working.
 *
 * THE REAL `endpointInference` AND THE REAL `createSlash`, reached by relative paths as `slash-answers-unreachable.test.ts`
 * reaches them, because which throws carry which mark is this host's decision and how each is settled is the package's.
 *
 * THE KEY IS HIS OWN KEY NOW: the grant he picked by id, opened through `slashOwnInference`,
 * which always requires it. No label chooses a key any more, so the cases that opened the
 * grant labelled `slash` open his instead, and the findings hold on that path unchanged.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { endpointInference, slashFromEnv, slashInferenceOf, slashOwnInference, type SlashHostDeps } from '../src/slash.ts';
import { createSlash } from '../../slash/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const FAKE_KEY = 'fake-key-for-tests-only';
const URL_ = 'https://gateway.example.test/v1/chat/completions';
const RATE = { rule: 'rate', step: 0, question: 'What rate applies to Gold?', shape: 'number' as const };
const CALL = { model: 'glm-5.3-flash', messages: [], maxTokens: 10, jsonSchema: {} };
const HIS_GRANT = { id: 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE', label: 'model provider', kind: 'api_token', revoked_at: null };
/** His own key as Settings saves it, at the address `URL_` is the chat-completions path of. */
const OWN = { provider: 'openai' as const, base_url: 'https://gateway.example.test/v1', model: 'his-model', grant_id: HIS_GRANT.id };

function endpoint(answer: () => Response) {
  const sent: { authorization: string | null }[] = [];
  return {
    sent,
    send: async (_url: URL, init: RequestInit) => {
      sent.push({ authorization: new Headers(init.headers).get('authorization') });
      return answer();
    },
  };
}

const status = (n: number) => (): Response => new Response(`{"error":"no, ${FAKE_KEY}"}`, { status: n });

/** A real Slash on its own SQLite, and its ledger. */
function slash() {
  const sql = openSqlite();
  const engine = createSlash({ sql, clock: fixedClock(NOW), inference: { complete: async () => assert.fail('the fallback was asked') }, record: {} as never });
  const rows = () => sql.all<{ model: string; status: string; code: string | null }>('SELECT model, status, code FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));
  return { engine, rows, close: () => sql.close() };
}

/** The Worker's shape of deps: the keychain holding the grant he picked, opened by `open`, over `send`. */
const keychain = (send: SlashHostDeps['send'], open: SlashHostDeps['openKey'], extra: Partial<SlashHostDeps> = {}): SlashHostDeps => ({
  grants: () => [HIS_GRANT],
  openKey: open,
  send,
  ...extra,
});
const CONFIG = slashFromEnv({ SLASH_ENDPOINT: URL_ }, { operatorKey: false });

/* ── the two kinds of status ─────────────────────────────────────────────── */

/* THE MESSAGE IS UNCHANGED FOR EVERY STATUS, because the record's own model reads any throw as "the rules speak" and
   `test/slash.test.ts` holds that sentence; what differs is the mark. */
test('408, 425, 429 AND 5XX ARE THE PLAIN THROW THE LADDER ASKS AGAIN; 400, 401, 403 AND 404 CARRY THE STATUS AS FINAL', async () => {
  const marks: Record<string, unknown> = {};
  for (const n of [400, 401, 403, 404, 408, 425, 429, 500, 503]) {
    const net = endpoint(status(n));
    try {
      await endpointInference({ url: URL_, key: async () => FAKE_KEY, send: net.send }).complete(CALL);
      marks[n] = 'resolved';
    } catch (e) {
      const { refused, answered } = e as { refused?: unknown; answered?: unknown };
      marks[n] = { message: (e as Error).message, refused, answered };
    }
  }
  const plain = (n: number) => ({ message: `The Slash endpoint answered ${n}.`, refused: undefined, answered: undefined });
  const final = (n: number) => ({ message: `The Slash endpoint answered ${n}.`, refused: n, answered: undefined });
  assert.deepEqual(marks, {
    400: final(400),
    401: final(401),
    403: final(403),
    404: final(404),
    408: plain(408),
    425: plain(425),
    429: plain(429),
    500: plain(500),
    503: plain(503),
  });
});

/* ── what the package makes of them ──────────────────────────────────────── */

test('A 401 ON HIS OWN KEY IS ONE POST, SETTLED UNDER THE DASH, and the sentence names the key and the status', async () => {
  const s = slash();
  try {
    const net = endpoint(status(401));
    const inference = slashOwnInference(OWN, keychain(net.send, async () => FAKE_KEY))!;
    const out = await s.engine.answer(RATE, inference as never);
    assert.equal(net.sent.length, 1);
    assert.equal(net.sent[0]!.authorization, `Bearer ${FAKE_KEY}`);
    /* ANY CODE BUT `UNREACHABLE` IS ONE `serveAsks` ACKS `done`, so this is what keeps the ladder from asking again. */
    assert.equal(codeOf(out), 'PULL_REQUEST_REFUSED', fixOf(out));
    assert.equal(fixOf(out), 'rule.rate asked Slash at step 1, and the provider refused your own key for Slash (401), so the run stopped there rather than ask it again.');
    assert.deepEqual(s.rows(), [{ model: '-', status: 'error', code: 'PULL_REQUEST_REFUSED' }]);
    assert.equal(s.engine.status().asks.used, 0);
    assert.doesNotMatch(fixOf(out), new RegExp(FAKE_KEY), 'the key is in the sentence');
  } finally {
    s.close();
  }
});

test('A 400 AND A 404 ARE FINAL TOO, and the sentence names the status and says why it was not asked again', async () => {
  for (const n of [400, 404]) {
    const s = slash();
    try {
      const net = endpoint(status(n));
      const out = await s.engine.answer(RATE, slashOwnInference(OWN, keychain(net.send, async () => FAKE_KEY)) as never);
      assert.equal(codeOf(out), 'PULL_REQUEST_REFUSED', fixOf(out));
      assert.equal(
        fixOf(out),
        `rule.rate asked Slash at step 1, and the provider answered ${n} with no completion, which asking again would not change, so the run stopped there.`,
      );
      assert.deepEqual(s.rows(), [{ model: '-', status: 'error', code: 'PULL_REQUEST_REFUSED' }]);
    } finally {
      s.close();
    }
  }
});

test('A 503 IS STILL UNREACHABLE, and so still the one code the ladder asks again', async () => {
  const s = slash();
  try {
    const out = await s.engine.answer(RATE, slashOwnInference(OWN, keychain(endpoint(status(503)).send, async () => FAKE_KEY)) as never);
    assert.equal(codeOf(out), 'UNREACHABLE', fixOf(out));
  } finally {
    s.close();
  }
});

/* ── a key that will not open ────────────────────────────────────────────── */

test('HIS OWN KEY THAT WILL NOT OPEN SENDS NOTHING AND WRITES NO LEDGER ROW, whatever keyRequired says', async () => {
  const s = slash();
  try {
    const net = endpoint(status(401));
    const inference = slashOwnInference(OWN, keychain(net.send, async () => null))!;
    await assert.rejects(inference.complete(CALL), (e: unknown) => {
      assert.equal((e as { sent?: unknown }).sent, false, 'the throw does not say that nothing was sent');
      return true;
    });
    const out = await s.engine.answer(RATE, inference as never);
    assert.equal(net.sent.length, 0, `${net.sent.length} POSTs with no authorization`);
    assert.ok(!out.ok);
    /* NOTHING WAS SENT, SO NOTHING IS BILLED OR RECORDED AS AN OUTAGE: the hold is released, which is the no-key case's
       ledger (`docs/46` §5.2, "writes no ledger row"). */
    assert.deepEqual(s.rows(), []);
  } finally {
    s.close();
  }
});

test('HIS OWN KEY REVOKED AFTER THE ADAPTER WAS BUILT IS A THROW TOO, and not a keyless POST', async () => {
  const net = endpoint(status(401));
  let grants: (typeof HIS_GRANT)[] = [HIS_GRANT];
  const inference = slashOwnInference(OWN, { grants: () => grants, openKey: async () => FAKE_KEY, send: net.send })!;
  grants = [];
  await assert.rejects(inference.complete(CALL));
  assert.equal(net.sent.length, 0);
});

test("WITH keyRequired, THIS HOST'S OWN ENDPOINT WITH NO OPERATOR KEY IS A THROW, and not a keyless POST", async () => {
  const net = endpoint(status(401));
  const inference = slashInferenceOf(CONFIG, { grants: () => [], openKey: async () => FAKE_KEY, send: net.send, keyRequired: true })!;
  await assert.rejects(inference.complete(CALL));
  assert.equal(net.sent.length, 0);
});

/* THE SELF-HOST'S LOCAL MODEL, WHICH IS WHY THE RULE IS AN OPTION AND NOT THE DEFAULT: no operator key, and a server on
   the owner's own machine that asks for none. */
test('WITHOUT keyRequired, THE HOST ENDPOINT WITH NO OPERATOR KEY IS ONE KEYLESS POST, as a local model on a self-host needs', async () => {
  const net = endpoint(() => new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":4}' } }] }), { status: 200 }));
  const inference = slashInferenceOf(CONFIG, { grants: () => [], openKey: async () => null, send: net.send })!;
  await inference.complete(CALL);
  assert.deepEqual(net.sent, [{ authorization: null }]);
});
