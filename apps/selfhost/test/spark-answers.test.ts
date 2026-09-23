/**
 * The self-host answers an automation's question to Spark: `loop/research-infer-ask-next.md` §2 Brief D.
 *
 * WHAT STOOD BETWEEN THE TWO HALVES. Brief A put the record's switch in (`answersSpark`) and left it off, and Briefs B
 * and C built `@braindog/spark`'s `answer` and `@braindog/host/spark-answers`'s `serveAsks`, and nothing on this host
 * called either. So a self-host with a model refused `ask_spark` at install in the words "no host in this build answers
 * an automation's question to Spark", which was true.
 *
 * THE PASS IS IN `poll` AND NOT IN `act()`. `act()` returns on its first line when `options.actions` is absent, which is
 * every stack below and any embedder, so a pass placed there would leave a record that admits the step and a host that
 * never asks it. None of these stacks passes `actions`, which is how that placement is held.
 *
 * RED BEFORE THE WIRING, MEASURED ON 23 SEPTEMBER with `src/` as it stood at `3d596321`: seven tests, one pass, six
 * fail. The install case read `NOT_IN_THIS_BUILD` where it expects `null`; the answered, the doorbell and the spent cases
 * failed at the same install; and the deliverer on every kind, with a model and without, was handed the queued questions,
 * which is the pump acking each `done` with no text. The host with no model passed before and after, which
 * is its job: it is the line the wiring must not cross.
 *
 * AND EACH LINE OF THE WIRING WAS TAKEN OUT AGAIN, ONE AT A TIME, TO SEE WHICH CASE HOLDS IT. The pass skipped in `poll`:
 * the answered, the doorbell and the spent cases fail. The rule's name dropped from the wire: `grant.read` reads
 * `["system"]` where it expects `["rule:rate"]`. `infer.ask` left off the record's `delivers`: the doorbell case alone
 * fails, since every other case calls `poll` itself. `infer.ask` let back onto the pump's list: the deliverer case
 * without a model alone fails, and the one with a model passes against it (the note above those cases says why).
 *
 * THE MODEL IS THE ONLY DOUBLE: a real `start`, a real socket, a real record on disk and a real key store, as
 * `spark-included-guard.test.ts` builds them. No key is printed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { endpointInference } from '@braindog/host/spark';
import type { OutboxRow } from '@braindog/kernel';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { EVERY_KIND, start } from '../src/server.ts';

const MINUTE = 60_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true }],
  } as never,
};

const KEYS = {
  id: 'register.credentials',
  kind: 'register' as const,
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true, max: 120 },
      { id: 'opens', type: 'text', required: true, max: 280 },
      { id: 'value', type: 'secret' },
    ],
  } as never,
};

/** The brief's rule: ask Spark for a number about the task just written, then say it. */
const RATE = {
  id: 'rule.rate',
  kind: 'rule' as const,
  body: {
    rule: 'rate',
    on: { written: { register: 'tasks', op: ['create'] } },
    once_per: ['entry'],
    steps: [
      { ask_spark: { question: 'What rate applies to {{what}}?', about: ['what'], as: 'rate', shape: 'number' } },
      { notify: { say: 'Rate for {{what}}: {{vars.rate}}' } },
    ],
  } as never,
};

type Refused = { ok: boolean; refusal?: { code: string; fix: string } };
const codeOf = (r: Refused): string | null => (r.ok ? null : (r.refusal?.code ?? 'conflict'));

/** The model's usual answer: the number, and a count that bills a few tokens. */
const RATE_ANSWER = (): Response =>
  new Response(
    JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"answer":4.25}' } }], usage: { prompt_tokens: 300, completion_tokens: 8 } }),
    { status: 200 },
  );

/**
 * A self-host with a model unless `model` is false, and with a deliverer on every kind when `deliver` says so. `answer`
 * replaces what the model says, and `now` pins the record's and Spark's clock so a case can move it.
 */
async function stack(opts: { model?: boolean; deliver?: boolean; answer?: () => Response; now?: () => number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-spark-answers-'));
  const sessionKey = new Uint8Array(randomBytes(32));
  const store = await openKeyStore(join(dir, 'kek.key'));
  const sent: RequestInit[] = [];
  const delivered: OutboxRow[] = [];
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: randomBytes(32).toString('base64url'),
    sessionKey,
    keys: store,
    pollMs: 0,
    ...(opts.now === undefined ? {} : { now: opts.now }),
    ...(opts.model === false
      ? {}
      : {
          spark: {
            url: 'http://127.0.0.1:11434/v1/chat/completions',
            model: 'llama3',
            send: async (_url: URL, init: RequestInit) => {
              sent.push(init);
              return (opts.answer ?? RATE_ANSWER)();
            },
          },
        }),
    ...(opts.deliver
      ? {
          /* EVERY KIND THE OUTBOX HOLDS, `infer.ask` INCLUDED, which is what an embedder that lists them all hands in. */
          delivers: [...EVERY_KIND, 'infer.ask' as const],
          deliver: async (job: OutboxRow) => void delivered.push(job),
        }
      : {}),
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  const ada = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(ada.ok);
  const owner = ada.value.id;
  const made = await running.api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: owner, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  assert.ok((await running.api.kernel.install([TASKS, KEYS])).ok);

  /** A fresh session for the owner, planted in the Directory as `spark-included-guard.test.ts` plants one. */
  const plant = (): string => {
    const sid = randomBytes(32).toString('base64url');
    const now = Date.now();
    const db = new DatabaseSync(join(dir, 'directory.sqlite'));
    try {
      db.prepare('INSERT INTO dir_session (id_hash, person, record, expires, rotated_at, authed_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(createHmac('sha256', sessionKey).update(`s:${sid}`).digest('hex'), owner, REC, now + 60 * MINUTE, now, now);
    } finally {
      db.close();
    }
    return sid;
  };

  const post = async (path: string, sid: string, body: unknown) => {
    const res = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { cookie: `bd_s=${sid}`, origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as { value?: Record<string, unknown> } | null };
  };

  const run = () =>
    running.sql.one<{ state: string; vars: string; say: string | null }>("SELECT state, vars, say FROM automation_run WHERE rule = 'rate' ORDER BY rowid DESC");
  const reads = () => running.sql.all<{ actor: string }>("SELECT actor FROM event WHERE kind = 'grant.read' ORDER BY rowid").map((e) => e.actor);

  /** A task written, then the brief's drive: `drain`, `poll`, `drain`. */
  const write = async (what: string) => {
    assert.ok(running.api.kernel.create('tasks', { what }, { actor: owner }).ok);
    await running.drain();
    await running.poll();
    await running.drain();
  };

  /* SPARK'S OWN LEDGER, `<dir>/spark.sqlite`, read beside the server and not through it: no door answers a row. */
  const calls = () => {
    const db = new DatabaseSync(join(dir, 'spark.sqlite'), { readOnly: true });
    try {
      return db
        .prepare('SELECT model, tokens_in, tokens_out, status, code FROM call ORDER BY rowid')
        .all()
        .map((r) => ({ ...r }) as { model: string; tokens_in: number; tokens_out: number; status: string; code: string | null });
    } finally {
      db.close();
    }
  };

  return {
    running,
    owner,
    calls,
    sent,
    delivered,
    plant,
    post,
    run,
    reads,
    write,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('WITH A MODEL, A RULE THAT ASKS SPARK INSTALLS, where before this host refused it NOT_IN_THIS_BUILD', async () => {
  const s = await stack();
  try {
    const installed = (await s.running.api.kernel.install([RATE])) as Refused;
    assert.equal(codeOf(installed), null, installed.refusal?.fix);
  } finally {
    await s.close();
  }
});

test("THE QUESTION IS ASKED ONCE, TYPED AS A NUMBER, ON THE OWNER'S KEY OPENED IN THE RULE'S NAME, and the run ends done", async () => {
  const s = await stack();
  try {
    const ada = s.plant();
    const value = ['bd_fake_spark_', randomBytes(24).toString('hex')].join('');
    assert.equal((await s.post('/api/keys/put', ada, { label: 'spark', opens: 'Spark', value })).status, 200, 'the key was not put in');
    assert.ok((await s.running.api.kernel.install([RATE])).ok, 'the rule did not install');

    await s.write('Gold');

    assert.equal(s.sent.length, 1, `${s.sent.length} model calls for one question`);
    const body = JSON.parse(String(s.sent[0]?.body)) as { response_format?: { json_schema?: { schema?: { properties?: { answer?: { type?: string } } } } } };
    assert.equal(body.response_format?.json_schema?.schema?.properties?.answer?.type, 'number');
    const bearer = (s.sent[0]?.headers as Record<string, string> | undefined)?.authorization;
    assert.ok(bearer === `Bearer ${value}`, "the question did not go out on the owner's key");
    const r = s.run();
    assert.equal(r?.state, 'done', r?.say ?? 'no run');
    assert.deepEqual(JSON.parse(r?.vars ?? '{}'), { rate: 4.25 });
    /* SIGNED BY THE RULE AND NOT BY `system`, so the vault's log tells an automation's opening from a scheduled action's. */
    assert.deepEqual(s.reads(), ['rule:rate']);
  } finally {
    await s.close();
  }
});

test('THE DOORBELL RINGS FOR A QUEUED QUESTION, so the drain that queues it has asked it before it returns, with no poll called', async () => {
  const s = await stack();
  try {
    assert.ok((await s.running.api.kernel.install([RATE])).ok, 'the rule did not install');
    assert.ok(s.running.api.kernel.create('tasks', { what: 'Gold' }, { actor: s.owner }).ok);
    await s.running.drain();
    assert.equal(s.sent.length, 1, 'the question waited for a poll nobody rang');
  } finally {
    await s.close();
  }
});

test("AT ask_cap 0 NOTHING IS POSTED, and the run ends on the month's own sentence, not on \"no text\"", async () => {
  const s = await stack();
  try {
    const set = await s.post('/api/spark/settings', s.plant(), { ask_cap: 0 });
    assert.equal(set.status, 200, set.raw);
    assert.ok((await s.running.api.kernel.install([RATE])).ok, 'the rule did not install');

    await s.write('Gold');

    const now = new Date();
    const next = MONTHS[(now.getUTCMonth() + 1) % 12];
    assert.equal(s.sent.length, 0, `${s.sent.length} model calls with the month spent`);
    const r = s.run();
    assert.equal(r?.state, 'failed');
    assert.equal(r?.say, `rule.rate asked Spark at step 1, and this month's asks are spent until 1 ${next}. Raise the monthly limit, or wait.`);
  } finally {
    await s.close();
  }
});

test('WITH NO MODEL, THE RULE IS STILL REFUSED AND A QUEUED QUESTION IS LEFT WHERE IT IS', async () => {
  assert.equal(process.env.SPARK_ENDPOINT ?? '', '', 'SPARK_ENDPOINT is set in this environment, so this case cannot say what a host with none does');
  const s = await stack({ model: false });
  try {
    assert.equal(codeOf((await s.running.api.kernel.install([RATE])) as Refused), 'NOT_IN_THIS_BUILD');
    /* A ROW AN EARLIER HOST QUEUED, written as `enqueue` writes one, so there is something for a pass to lease. */
    s.running.sql.exec(
      "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('j_left', ?, 'infer.ask', ?, 'pending', 0)",
      new Date().toISOString(),
      JSON.stringify({ run: 'r_x', rule: 'rate', step: 0, question: 'Which?', shape: 'text' }),
    );
    await s.running.poll();
    /* SPREAD, because `node:sqlite` answers a row with no prototype and `deepEqual` holds that against a literal. */
    assert.deepEqual(
      { ...s.running.sql.one<{ state: string; attempts: number }>("SELECT state, attempts FROM outbox WHERE id = 'j_left'") },
      { state: 'pending', attempts: 0 },
      'a host with no model leased a question it cannot ask',
    );
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

/* THE CASE WITHOUT A MODEL IS THE ONE THAT HOLDS THE PUMP'S LIST, AND THE CASE WITH ONE DOES NOT. Measured by the checker
   on 23 September with `k !== 'infer.ask'` taken out of the pump's list: the first writing of this case, one job on a host
   with a model, still passed, because `serveAsks` runs first in `poll` and had already leased it. Six jobs, one more than
   the five a pass leases, passed as well: the pass's own `tail` rings the doorbell for the sixth, and the second `poll`
   that rings leases it before the first reaches the pump. On a host with no model nothing leases the question but the
   pump, so that case alone went red. The case with a model stays as the end-to-end reading, not as the guard. */
for (const model of [true, false]) {
  test(`A DELIVERER HANDED EVERY KIND IS NEVER HANDED A QUESTION TO SPARK, ${model ? 'with' : 'without'} a model, which it would ack done with no text`, async () => {
    const s = await stack({ model, deliver: true });
    try {
      /* QUEUED DIRECTLY, so this case needs neither the install nor a run. */
      for (let i = 0; i < 6; i++)
        s.running.sql.exec(
          "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES (?, ?, 'infer.ask', ?, 'pending', 0)",
          `j_pump_${i}`,
          new Date().toISOString(),
          JSON.stringify({ run: 'r_x', rule: 'rate', step: 0, question: 'Which?', shape: 'text' }),
        );
      await s.running.poll();
      assert.deepEqual(
        s.delivered.map((j) => j.kind),
        [],
        'the pump leased a question',
      );
    } finally {
      await s.close();
    }
  });
}

/* ── a model that answered with what this host cannot read ─────────────── */

const HOUR = 60 * MINUTE;

/** The audit's endpoint: a 200 whose completion is 70,000 characters, reporting 16,000 completion tokens. */
const AT_LENGTH = (): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({ answer: 'x'.repeat(70_000) }) } }],
      usage: { prompt_tokens: 415, completion_tokens: 16_000 },
    }),
    { status: 200 },
  );

/* `loop/research-batch-forty-six-audit.md` FINDING 4, THE AUDIT'S PROBE AS A CASE. The host threw `UNREACHABLE` for a 200
   it could not read, the package settled that under `-`, which no count reads, and `RETRIED` asked again: measured by the
   audit, four completions served for one question and four rows under `-` with `tokens_out` 0, until the one-day wait
   (`ASK_SPARK_WAIT_MS`) ended the run. Forty passes six hours apart are ten days, well past that wait, so a ladder that
   still asks again is seen asking. RED ON 23 SEPTEMBER before the repair: four completions served, and four rows
   `{"model":"-","tokens_in":411,"tokens_out":0,"status":"error","code":"UNREACHABLE"}`, the estimate and not the count.
   THE ROW NAMES `llama3`, THE MODEL THIS HOST SENT, AND NOT THE PACKAGE'S SHORT NAME. As wave 47 landed it the row read
   `glm-5.3-flash`: `answer` passes no model to `core.run`, which names the template's, and the host maps that name onto
   `SPARK_MODEL` on the way out, so the ledger named a model nothing was sent. RED ON 23 SEPTEMBER, before the host's
   reply and its throw said what they sent: `{"model":"glm-5.3-flash",...,"code":"PROPOSAL_SCHEMA"}`, the name and the
   code both the ones this case no longer expects. The code is `ANSWER_UNREADABLE`, the answered-unreadable failure's own,
   where wave 47 borrowed `PROPOSAL_SCHEMA`, which `30 §6` files as output that fails its schema, not output never read. */
test('A MODEL THAT ANSWERED AT A LENGTH THIS HOST DOES NOT READ IS ASKED ONCE, and the one row carries its name and its tokens', async () => {
  let now = Date.parse('2026-09-23T12:00:00.000Z');
  const s = await stack({ answer: AT_LENGTH, now: () => now });
  try {
    assert.ok((await s.running.api.kernel.install([RATE])).ok, 'the rule did not install');

    await s.write('Gold');
    for (let pass = 1; pass < 40; pass++) {
      now += 6 * HOUR;
      await s.running.drain();
      await s.running.poll();
      await s.running.drain();
    }

    assert.equal(s.sent.length, 1, `${s.sent.length} completions the endpoint served for one question`);
    assert.deepEqual(s.calls(), [{ model: 'llama3', tokens_in: 415, tokens_out: 16_000, status: 'error', code: 'ANSWER_UNREADABLE' }]);
    const r = s.run();
    assert.equal(r?.state, 'failed');
    assert.equal(
      r?.say,
      'rule.rate asked Spark at step 1, and the model answered with something Spark could not read: The Spark endpoint answered more than Spark reads. The run stopped there rather than ask it again.',
    );
  } finally {
    await s.close();
  }
});

/* THE MARK ITSELF, ON THE HOST'S REAL `endpointInference`. Every throw after a 200 carries `answered: true`, and the
   timeout does too, because the cap is the bound on spend and a model that ran out the clock may have run to the end.
   A `send` that never resolved keeps no mark, which is what keeps an outage off the cap, and so does a status that is
   not `ok` (`loop/research-worker-spark.md` §6 Q8's default): a 503 is the endpoint saying no model ran, and marked, wave
   47 spent an ask on it and ended the run on the first rung. RED ON 23 SEPTEMBER, before wave 47: no throw carried a
   mark, the body that was not JSON threw the parser's own `SyntaxError`, and the timeout threw "The operation was
   aborted due to timeout". The status case was then red the other way, `answered: true`, until Q8's default. */
test('THE HOST MARKS EVERY THROW AFTER THE ENDPOINT ANSWERED, AND THE TIMEOUT, AS ANSWERED, and a refused connection as not', async () => {
  const call = { model: 'glm-5.3-flash', messages: [{ role: 'user' as const, content: 'q' }], maxTokens: 64, jsonSchema: {} };
  const thrown = async (send: (url: URL, init: RequestInit) => Promise<Response>) => {
    try {
      await endpointInference({ url: 'http://127.0.0.1:11434/v1/chat/completions', send, timeoutMs: 20 }).complete(call);
    } catch (e) {
      const { answered, usage } = e as { answered?: unknown; usage?: unknown };
      return { message: (e as Error).message, answered, usage };
    }
    return null;
  };
  const cases = {
    status: await thrown(async () => new Response('busy', { status: 503 })),
    size: await thrown(async () => AT_LENGTH()),
    parse: await thrown(async () => new Response('<html>a proxy page</html>', { status: 200 })),
    /* A 200 WHOSE BODY BREAKS OFF MID-READ, a connection reset after the headers. Without this case the body read's mark
       could be taken off and every other case here stayed green, measured on 23 September by the checker. */
    broke: await thrown(
      async () =>
        new Response(
          new ReadableStream({
            start: (c) => {
              c.enqueue(new TextEncoder().encode('{"choices":'));
              c.error(new Error('socket hang up'));
            },
          }),
          { status: 200 },
        ),
    ),
    timeout: await thrown(
      (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    ),
    refused: await thrown(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    }),
  };
  assert.deepEqual(cases, {
    status: { message: 'The Spark endpoint answered 503.', answered: undefined, usage: undefined },
    size: { message: 'The Spark endpoint answered more than Spark reads.', answered: true, usage: { in: 415, out: 16_000 } },
    parse: { message: 'The Spark endpoint answered with a body that is not JSON.', answered: true, usage: undefined },
    broke: { message: 'The Spark endpoint broke off its answer.', answered: true, usage: undefined },
    timeout: { message: 'The Spark endpoint did not finish answering within 0.02 seconds.', answered: true, usage: undefined },
    refused: { message: 'connect ECONNREFUSED 127.0.0.1:11434', answered: undefined, usage: undefined },
  });
});

/* ── a status that is not `ok` is a model that did not answer ─────────────── */

/** An endpoint that answers `statuses` in turn and then the usual answer. */
const inTurn = (statuses: readonly number[]) => {
  let i = 0;
  return (): Response => {
    const status = statuses[i++];
    return status === undefined ? RATE_ANSWER() : new Response('{"error":"try again"}', { status });
  };
};

/** Forty passes six hours apart after the first write, as the length case above drives the ladder past its one-day wait. */
const ladder = async (s: Awaited<ReturnType<typeof stack>>, tick: () => void): Promise<void> => {
  for (let pass = 1; pass < 40; pass++) {
    tick();
    await s.running.drain();
    await s.running.poll();
    await s.running.drain();
  }
};

/* `loop/research-worker-spark.md` §6 Q8, ITS DEFAULT TAKEN FOR THE OWNER: A NON-2xx STATUS IS NOT AN ANSWER. As wave 47
   landed, the host marked a 503 `answered`, so the package spent an ask on it and `serveAsks` acked the run `done` on
   the first rung. Before wave 47 a 503 was retried uncounted, and that is what this case holds again. RED ON 23
   SEPTEMBER against wave 47's `post` and `answer`: the run read `failed` where this expects `done`, after one call. */
test('A 503 AND THEN A GOOD 200 ENDS THE RUN DONE, on one counted ask, with the 503 settled under the mark for a model not reached', async () => {
  let now = Date.parse('2026-09-23T12:00:00.000Z');
  const s = await stack({ answer: inTurn([503]), now: () => now });
  try {
    assert.ok((await s.running.api.kernel.install([RATE])).ok, 'the rule did not install');

    await s.write('Gold');
    await ladder(s, () => (now += 6 * HOUR));

    const r = s.run();
    assert.equal(r?.state, 'done', r?.say ?? 'no run');
    assert.deepEqual(JSON.parse(r?.vars ?? '{}'), { rate: 4.25 });
    assert.equal(s.sent.length, 2, `${s.sent.length} model calls for one 503 and one answer`);
    assert.deepEqual(
      s.calls().map(({ model, status, code }) => ({ model, status, code })),
      [
        { model: '-', status: 'error', code: 'UNREACHABLE' },
        { model: 'llama3', status: 'ok', code: null },
      ],
    );
  } finally {
    await s.close();
  }
});

/* THE SAME DEFAULT, AT ITS WORST: A PROVIDER THAT ANSWERS 429 ON EVERY RUNG. Each attempt is a row, so the outage is in
   the ledger, and every row is under `-`, which neither count reads. RED ON 23 SEPTEMBER against wave 47: one model call
   in forty passes, the ladder never asking again because the first 429 had already ended the run as a counted ask. */
test('A 429 ON EVERY RUNG SPENDS NOTHING, and the ladder is seen asking again', async () => {
  let now = Date.parse('2026-09-23T12:00:00.000Z');
  const s = await stack({ answer: inTurn(Array.from({ length: 100 }, () => 429)), now: () => now });
  try {
    assert.ok((await s.running.api.kernel.install([RATE])).ok, 'the rule did not install');

    await s.write('Gold');
    await ladder(s, () => (now += 6 * HOUR));

    assert.ok(s.sent.length > 1, `${s.sent.length} model calls: the ladder did not ask again`);
    const rows = s.calls();
    assert.equal(rows.length, s.sent.length, 'a call left no row');
    assert.deepEqual(
      [...new Set(rows.map(({ model, status, code }) => JSON.stringify({ model, status, code })))],
      [JSON.stringify({ model: '-', status: 'error', code: 'UNREACHABLE' })],
      'an attempt was counted',
    );
    assert.notEqual(s.run()?.state, 'done', 'a run nobody answered ended done');
  } finally {
    await s.close();
  }
});
