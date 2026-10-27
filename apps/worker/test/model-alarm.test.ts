/**
 * A model that does not answer is told to the operator, in the provider's own words.
 *
 * MEASURED BEFORE THIS FILE: on his record the night's `infer.resolve` failed eight times as "No model answered for
 * 'glm-5.3-flash': the provider did not answer", filed as a question to him, and the platform's own sentence was thrown
 * away in `inference.ts`, so nobody could say whether the route table, the gateway or the account was at fault. No mail
 * went: the operator was mailed for `crash` and `refuse` only.
 *
 * NOW: each failed call reaches `onFail` once with the provider's message scrubbed and cut; the record object writes one
 * `op: 'model'` line at error level and mails "BrainDog model" through the Directory's window, one a quarter hour.
 * A schema break mails at the third in a row, a call on the owner's own key is logged and never mailed, and a budget
 * refusal is no failure at all.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import { workerSlashModel, type ModelFail } from '../src/slash.ts';
import { cloud } from './cloud-harness.ts';

const FLASH = '@cf/zai-org/glm-5.3-flash';
const PROMPT = 'Ada wrote: my card ending 7731 was charged twice';
const noGrants = () => ({ kernel: { grants: () => [] } }) as never;
/* WHAT A PROVIDER MAY QUOTE BACK FROM THE CALL'S HEADERS, each of which must be cut before the log line or the mail. */
const SECRETS = ['cfut_9aZ3kQ', 'sk-ant-api03-Xy7', 'AKIA2EXAMPLE7KEY9Q', 'hunter22'];
const KEYS = [`Authorization: Bearer ${SECRETS[0]}`, `API key provided: ${SECRETS[1]}`, `aws ${SECRETS[2]}`, `"x-api-key": "${SECRETS[3]}"`];
const leaked = (said: string): string[] => SECRETS.filter((k) => said.includes(k));

/** Workers AI throwing what a provider throws when it refuses: a code, the account, and the request quoted back. */
const throwingAi = () => {
  let runs = 0;
  return {
    runs: () => runs,
    AI: {
      run: async (_model: string, inputs: Record<string, unknown>) => {
        runs++;
        throw new Error(`5016: AiError: account 0123456789abcdef0123456789abcdef with ${KEYS.join(' ')} refused the request ${JSON.stringify(inputs['messages'])}`);
      },
    },
  };
};

/** Workers AI answering prose where JSON was pinned, which is a schema break the platform billed. */
const proseAi = { run: async () => ({ choices: [{ message: { role: 'assistant', content: 'not json' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 3 } }) };

test('A THROW REACHES onFail ONCE, with the phrase, the provider id and its own words scrubbed of the prompt and cut', async () => {
  const ai = throwingAi();
  const fails: ModelFail[] = [];
  const model = workerSlashModel({ AI: ai.AI, SLASH_INCLUDED: 'yes' }, noGrants, { onFail: (f) => fails.push(f) });
  await assert.rejects(model!.draft({ said: PROMPT } as never));
  assert.equal(ai.runs(), 1);
  assert.equal(fails.length, 1);
  const [fail] = fails;
  assert.equal(fail!.model, 'glm-5.3-flash');
  assert.equal(fail!.provider, FLASH);
  assert.equal(fail!.why, 'the provider did not answer');
  assert.equal(fail!.sent, true);
  assert.equal(fail!.whose, 'operator');
  assert.match(fail!.raw, /^5016: AiError: account \[cut\] with Authorization: \[cut\] \[cut\] API key provided: \[cut\] aws \[cut\] "x-api-key": \[cut\] refused the request/u);
  assert.ok(!fail!.raw.includes('7731') && !fail!.raw.includes('Ada wrote'), fail!.raw);
  assert.deepEqual(leaked(fail!.raw), [], fail!.raw);
  assert.ok(fail!.raw.length <= 300);
});

test('A SCHEMA BREAK COUNTS ITS STREAK, and a hook that throws never takes the call down with it', async () => {
  const fails: ModelFail[] = [];
  const model = workerSlashModel({ AI: proseAi, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' }, noGrants, {
    onFail: (f) => {
      fails.push(f);
      throw new Error('the hook broke');
    },
  });
  for (let i = 0; i < 3; i++) await assert.rejects(model!.draft({} as never), (e: Error) => !/the hook broke/u.test(e.message));
  assert.deepEqual(fails.map((f) => [f.why, f.streak]), [['schema', 1], ['schema', 2], ['schema', 3]]);
});

test('A BUDGET REFUSAL IS NOT A FAILURE: nothing sent, nothing told', async () => {
  const ai = throwingAi();
  const fails: ModelFail[] = [];
  const model = workerSlashModel({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes', SLASH_INCLUDED_MONTH_NEURONS: '0' } as never, noGrants, {
    onFail: (f) => fails.push(f),
  });
  /* A READING FAR PAST THE PER-ASK CEILING, which `aiInference` refuses before it calls. */
  await assert.rejects(model!.draft({ said: 'x'.repeat(400_000) } as never));
  assert.equal(ai.runs(), 0);
  assert.deepEqual(fails, []);
});

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAG';
const OWNER = 'ada@example.test';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1, 9);

/** Every JSON line the Worker writes while `fn` runs, parsed, with the console method it went to as `console`. */
async function lines(fn: () => Promise<unknown>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const methods = ['log', 'info', 'warn', 'error'] as const;
  const kept = methods.map((m) => console[m]);
  for (const m of methods)
    console[m] = (...args: unknown[]) => {
      try {
        out.push({ ...(JSON.parse(String(args[0])) as Record<string, unknown>), console: m });
      } catch {
        /* Not a line of ours. */
      }
    };
  try {
    await fn();
  } finally {
    methods.forEach((m, i) => (console[m] = kept[i]!));
  }
  return out;
}

async function pressing(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const ai = throwingAi();
  const sent: Record<string, unknown>[] = [];
  const c = await cloud({
    SLASH_ENDPOINT: '',
    AI: ai.AI,
    SLASH_INCLUDED: 'yes',
    OPS_ALERT_TO: 'ops@example.test',
    MAIL_FROM: 'hello@brain.example.test',
    EMAIL: { send: async (m: Record<string, unknown>) => void sent.push(m) },
  });
  /* THE DIRECTORY'S KEY-VALUE HALF, which the harness's storage leaves out and `alertDue` reads. */
  const kv = new Map<string, unknown>();
  Object.assign(c.dirStorage, { get: async (k: string) => kv.get(k), put: async (k: string, v: unknown) => void kv.set(k, v) });
  await c.provision(REC, 'alarm', OWNER);
  const early = await c.signIn(OWNER);
  const post = async (method: string, body: object, cookie: string) =>
    (await (await c.ask(`/api/${method}`, { method: 'POST', cookie, body: JSON.stringify(body) })).json()) as { ok: boolean };
  assert.ok((await post('setDeclaration', { body: { register: 'notes', name: 'notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } }, early)).ok);
  assert.ok((await post('create', { register: 'notes', fields: { what: PROMPT } }, early)).ok);
  /* THE OWNER'S OWN USE ON FIVE DAYS, so Slash asks its model of a record past its fortnight (HD.410). */
  for (const day of [3, 5, 7, 9]) {
    t.mock.timers.setTime(T0 + day * DAY);
    const kept = await post('create', { register: 'notes', fields: { what: `Kept on day ${day}` } }, await c.signIn(OWNER));
    assert.ok(kept.ok, JSON.stringify(kept));
    /* AND THE YOUNG RECORD'S LOOK THAT WRITE WOKE IS LET FINISH, or it would read the clock moved on below. */
    await c.settle();
  }
  t.mock.timers.setTime(T0 + 20 * DAY);
  const cookie = await c.signIn(OWNER);
  return { ai, sent, kv, press: () => post('slashPropose', {}, cookie) };
}

test('ON THE RECORD: a throw is one model line and one claimed mail, and a second throw inside the window mails nothing', async (t) => {
  const { ai, sent, kv, press } = await pressing(t);
  const said = await lines(async () => {
    await press();
    await press();
    /* `waitUntil` in the harness drops its promise, so the mail is let finish. */
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.ok(ai.runs() >= 2, `the press never reached the model (${ai.runs()} runs)`);
  const model = said.filter((l) => l['op'] === 'model');
  assert.equal(model.length, ai.runs(), 'one line a failed call');
  assert.equal(model[0]!['console'], 'error', 'a model that did not answer is an error line');
  assert.equal(model[0]!['rec'], REC);
  assert.equal(model[0]!['why'], 'the provider did not answer');
  assert.match(String(model[0]!['raw']), /^5016: AiError/u);
  assert.ok(!JSON.stringify(model).includes('7731'), 'a person\'s words reached the log');

  assert.equal(sent.length, 1, 'one mail a quarter hour');
  assert.equal(sent[0]!['subject'], 'BrainDog model');
  assert.equal(sent[0]!['to'], 'ops@example.test');
  assert.ok(String(sent[0]!['text']).includes('model: glm-5.3-flash'));
  assert.ok(!String(sent[0]!['text']).includes('5016'), 'raw stays in the log');
  assert.deepEqual(leaked(JSON.stringify(said)), [], 'a key reached the log');
  assert.deepEqual(leaked(JSON.stringify(sent)), [], 'a key reached the mail');
  assert.ok(typeof kv.get('ops-alert:model') === 'number', 'the Directory\'s window was not claimed');
});
