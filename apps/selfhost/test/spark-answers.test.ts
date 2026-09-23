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

/** A self-host with a model unless `model` is false, and with a deliverer on every kind when `deliver` says so. */
async function stack(opts: { model?: boolean; deliver?: boolean } = {}) {
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
    ...(opts.model === false
      ? {}
      : {
          spark: {
            url: 'http://127.0.0.1:11434/v1/chat/completions',
            model: 'llama3',
            send: async (_url: URL, init: RequestInit) => {
              sent.push(init);
              return new Response(
                JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"answer":4.25}' } }], usage: { prompt_tokens: 300, completion_tokens: 8 } }),
                { status: 200 },
              );
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

  return {
    running,
    owner,
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
