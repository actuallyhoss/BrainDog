/**
 * A self-host with a model does not send a secret field's value to that model: audit forty-six §1.
 *
 * WHAT THE AUDIT MEASURED, THROUGH A REAL `start`. `eb1a131b` turned `answersSpark` on for every self-host with a
 * model, and the kernel filled `set_var`'s `to` from the whole row. Over a list whose `pin` is a secret, `set_var: { to:
 * '{{trigger.row.pin}}' }` then `{{vars.p}}` in the question installed, and the model's request body held "What rate
 * applies to Rent, given hunter2?"; `set_var` to `{{trigger.row}}` sent the row's JSON with `pin` in it. These are the
 * probe's two cases, each twice: once as the owner would write it, which the install must now refuse, and once written
 * into the table past the lint, as a rule an earlier build let in would sit there, which the runner must now clean.
 *
 * RED BEFORE THE REPAIR, MEASURED ON 23 SEPTEMBER with `packages/kernel/src/flow.ts` and `flow-lint.ts` as they stood:
 * four tests, four fail. Both installs read `null` where they expect `DECLARATION_INVALID`, and both stored rules sent
 * one request whose body held `hunter2`.
 *
 * `hunter2` IS PUT IN BY SQL, as `packages/kernel/test/flow-waits.test.ts` puts it, because no door writes a plaintext
 * into a secret field: in use the field holds a vault grant's id, and that id is what would have left. The model is the
 * only double, as in `spark-answers.test.ts`, whose stack this is, cut down to what a question needs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF';
const SECRET = 'hunter2';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'pin', type: 'secret' },
    ],
  } as never,
};

const WRITTEN = { written: { register: 'obligations', op: ['create'] } };

/** The probe's two rules: a variable set from the secret field, and one set from the whole row. */
const CASES = [
  { name: 'set_var to {{trigger.row.pin}}', to: '{{trigger.row.pin}}' },
  { name: 'set_var to {{trigger.row}}', to: '{{trigger.row}}' },
];
const body = (to: string) => ({
  rule: 'rate',
  on: WRITTEN,
  once_per: ['entry'],
  steps: [
    { set_var: { name: 'p', to } },
    { ask_spark: { question: 'What rate applies to {{what}}, given {{vars.p}}?', as: 'rate', shape: 'number' } },
  ],
});

type Refused = { ok: boolean; refusal?: { code: string; fix: string } };

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-spark-secret-'));
  const store = await openKeyStore(join(dir, 'kek.key'));
  const sent: string[] = [];
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: randomBytes(32).toString('base64url'),
    sessionKey: new Uint8Array(randomBytes(32)),
    keys: store,
    pollMs: 0,
    spark: {
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'llama3',
      /* EVERY REQUEST BODY IS KEPT, since the body is what leaves the machine for wherever `SPARK_ENDPOINT` points. */
      send: async (_url: URL, init: RequestInit) => {
        sent.push(String(init.body));
        return new Response(
          JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"answer":4.25}' } }], usage: { prompt_tokens: 300, completion_tokens: 8 } }),
          { status: 200 },
        );
      },
    },
  });
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
  assert.ok((await running.api.kernel.install([OBLIGATIONS])).ok);

  return {
    running,
    sent,
    /** A row written, its `pin` put in by SQL before the drain takes the run, then the brief's `drain`, `poll`, `drain`. */
    async write(what: string) {
      const row = running.api.kernel.create('obligations', { what }, { actor: owner });
      assert.ok(row.ok, JSON.stringify(row));
      running.sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', ?) WHERE id = ?", SECRET, row.value.id);
      await running.drain();
      await running.poll();
      await running.drain();
    },
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

for (const c of CASES) {
  test(`${c.name}, THEN {{vars.p}} IN A QUESTION TO SPARK, IS REFUSED AT INSTALL, naming the step that set it`, async () => {
    const s = await stack();
    try {
      const out = (await s.running.api.kernel.install([{ id: 'rule.rate', kind: 'rule' as const, body: body(c.to) as never }])) as Refused;
      assert.equal(out.ok ? null : out.refusal?.code, 'DECLARATION_INVALID', 'the rule installed');
      assert.match(out.refusal?.fix ?? '', /steps\[0\]/);
    } finally {
      await s.close();
    }
  });

  test(`${c.name}, STORED PAST THE LINT, ASKS THE MODEL WITH NO REQUEST BODY HOLDING THE SECRET`, async () => {
    const s = await stack();
    try {
      /* A RULE THAT INSTALLS, with the same trigger and version, whose body is then replaced in the table: a run reads
         its steps from the row it pinned (`flow.ts`'s `pinned`), so this is the rule an earlier build would have left. */
      const plain = { rule: 'rate', on: WRITTEN, once_per: ['entry'], steps: [{ ask_spark: { question: 'What rate applies to {{what}}?', as: 'rate', shape: 'number' } }] };
      const installed = (await s.running.api.kernel.install([{ id: 'rule.rate', kind: 'rule' as const, body: plain as never }])) as Refused;
      assert.ok(installed.ok, installed.refusal?.fix);
      s.running.sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify(body(c.to)));

      await s.write('Rent');

      assert.equal(s.sent.length, 1, `${s.sent.length} model calls for one question`);
      for (const sent of s.sent) assert.ok(!sent.includes(SECRET), `a request body held the secret: ${sent}`);
      /* AND THE QUESTION STILL WENT, with the hole where the value was, so the case is not green by asking nothing. */
      assert.ok(s.sent[0]!.includes('What rate applies to Rent, given '), s.sent[0]);
    } finally {
      await s.close();
    }
  });
}
