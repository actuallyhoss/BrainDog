/**
 * A status no retry mends is final and uncounted, and a key that is there and will not open is a throw before any POST.
 * The host's half of `loop/research-batch-forty-nine-audit.md` findings 2 and 4; the Worker's is
 * `apps/worker/test/spark-key-status.test.ts`.
 *
 * FINDING 4, THE STATUS. Q8's default made every status that is not `ok` a plain throw, which `answer` settles as
 * `UNREACHABLE` and `serveAsks` asks again. Right for a 429 or a 503, which the next rung may find mended; wrong for a 400
 * (a model name the provider does not know), a 401 (a key that is wrong or expired) and a 404 (a wrong `SPARK_ENDPOINT`
 * path), which answer the same on every rung. The audit measured each of those as eight keyed posts over about 266
 * minutes, ending "could not be reached" about a provider that answered all eight.
 *
 * FINDING 2, THE KEY. `endpointOptionsOf`'s `own()` answered `null` for a grant labelled `spark` that would not open, and
 * `post` then sent with no `authorization`. The Worker checks the label and not the opening, so a `KEK` changed under a
 * record sent eight anonymous POSTs to the owner's provider. `keyRequired` is the Worker's switch for the rule tier `b`
 * already keeps; the self-host passes none, because its keyless local model is the product working.
 *
 * THE REAL `endpointInference` AND THE REAL `createSpark`, reached by relative paths as `spark-answers-unreachable.test.ts`
 * reaches them, because which throws carry which mark is this host's decision and how each is settled is the package's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { endpointInference, sparkFromEnv, sparkInferenceOf, type SparkHostDeps } from '../src/spark.ts';
import { createSpark } from '../../spark/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const FAKE_KEY = 'fake-key-for-tests-only';
const URL_ = 'https://gateway.example.test/v1/chat/completions';
const RATE = { rule: 'rate', step: 0, question: 'What rate applies to Gold?', shape: 'number' as const };
const CALL = { model: 'glm-5.3-flash', messages: [], maxTokens: 10, jsonSchema: {} };
const SPARK_GRANT = { id: 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE', label: 'spark', revoked_at: null };

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

/** A real Spark on its own SQLite, and its ledger. */
function spark() {
  const sql = openSqlite();
  const engine = createSpark({ sql, clock: fixedClock(NOW), inference: { complete: async () => assert.fail('the fallback was asked') }, record: {} as never });
  const rows = () => sql.all<{ model: string; status: string; code: string | null }>('SELECT model, status, code FROM call ORDER BY rowid').map((r) => ({ ...r }));
  return { engine, rows, close: () => sql.close() };
}

/** The Worker's shape of deps: the vault's `spark` grant, opened by `open`, over `send`. */
const vault = (send: SparkHostDeps['send'], open: SparkHostDeps['openKey'], extra: Partial<SparkHostDeps> = {}): SparkHostDeps => ({
  grants: () => [SPARK_GRANT],
  openKey: open,
  send,
  ...extra,
});
const CONFIG = sparkFromEnv({ SPARK_ENDPOINT: URL_ }, { operatorKey: false });

/* ── the two kinds of status ─────────────────────────────────────────────── */

/* THE MESSAGE IS UNCHANGED FOR EVERY STATUS, because the record's own model reads any throw as "the rules speak" and
   `test/spark.test.ts` holds that sentence; what differs is the mark. */
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
  const plain = (n: number) => ({ message: `The Spark endpoint answered ${n}.`, refused: undefined, answered: undefined });
  const final = (n: number) => ({ message: `The Spark endpoint answered ${n}.`, refused: n, answered: undefined });
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

test('A 401 ON THE VAULT KEY IS ONE POST, SETTLED UNDER THE DASH, and the sentence names the key and the status', async () => {
  const s = spark();
  try {
    const net = endpoint(status(401));
    const inference = sparkInferenceOf(CONFIG, vault(net.send, async () => FAKE_KEY))!;
    const out = await s.engine.answer(RATE, inference as never);
    assert.equal(net.sent.length, 1);
    assert.equal(net.sent[0]!.authorization, `Bearer ${FAKE_KEY}`);
    /* ANY CODE BUT `UNREACHABLE` IS ONE `serveAsks` ACKS `done`, so this is what keeps the ladder from asking again. */
    assert.equal(codeOf(out), 'PULL_REQUEST_REFUSED', fixOf(out));
    assert.equal(fixOf(out), 'rule.rate asked Spark at step 1, and the provider refused the key labelled spark (401), so the run stopped there rather than ask it again.');
    assert.deepEqual(s.rows(), [{ model: '-', status: 'error', code: 'PULL_REQUEST_REFUSED' }]);
    assert.equal(s.engine.status().asks.used, 0);
    assert.doesNotMatch(fixOf(out), new RegExp(FAKE_KEY), 'the key is in the sentence');
  } finally {
    s.close();
  }
});

test('A 400 AND A 404 ARE FINAL TOO, and the sentence names the status and says why it was not asked again', async () => {
  for (const n of [400, 404]) {
    const s = spark();
    try {
      const net = endpoint(status(n));
      const out = await s.engine.answer(RATE, sparkInferenceOf(CONFIG, vault(net.send, async () => FAKE_KEY)) as never);
      assert.equal(codeOf(out), 'PULL_REQUEST_REFUSED', fixOf(out));
      assert.equal(
        fixOf(out),
        `rule.rate asked Spark at step 1, and the provider answered ${n} with no completion, which asking again would not change, so the run stopped there.`,
      );
      assert.deepEqual(s.rows(), [{ model: '-', status: 'error', code: 'PULL_REQUEST_REFUSED' }]);
    } finally {
      s.close();
    }
  }
});

test('A 503 IS STILL UNREACHABLE, and so still the one code the ladder asks again', async () => {
  const s = spark();
  try {
    const out = await s.engine.answer(RATE, sparkInferenceOf(CONFIG, vault(endpoint(status(503)).send, async () => FAKE_KEY)) as never);
    assert.equal(codeOf(out), 'UNREACHABLE', fixOf(out));
  } finally {
    s.close();
  }
});

/* ── a key that will not open ────────────────────────────────────────────── */

test('WITH keyRequired, A spark GRANT THAT WILL NOT OPEN SENDS NOTHING AND WRITES NO LEDGER ROW', async () => {
  const s = spark();
  try {
    const net = endpoint(status(401));
    const inference = sparkInferenceOf(CONFIG, vault(net.send, async () => null, { keyRequired: true }))!;
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

test('WITH keyRequired, A GRANT REVOKED AFTER THE CHECK IS A THROW TOO, and not a keyless POST', async () => {
  const net = endpoint(status(401));
  const inference = sparkInferenceOf(CONFIG, { grants: () => [], openKey: async () => FAKE_KEY, send: net.send, keyRequired: true })!;
  await assert.rejects(inference.complete(CALL));
  assert.equal(net.sent.length, 0);
});

/* THE SELF-HOST'S LOCAL MODEL, WHICH IS WHY THE RULE IS AN OPTION AND NOT THE DEFAULT: no `spark` grant, and a server on
   the owner's own machine that asks for no key. */
test('WITHOUT keyRequired, NO spark GRANT IS ONE KEYLESS POST, as a local model on a self-host needs', async () => {
  const net = endpoint(() => new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":4}' } }] }), { status: 200 }));
  const inference = sparkInferenceOf(CONFIG, { grants: () => [], openKey: async () => null, send: net.send })!;
  await inference.complete(CALL);
  assert.deepEqual(net.sent, [{ authorization: null }]);
});
