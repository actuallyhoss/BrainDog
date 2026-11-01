/**
 * Slash's press on the Worker, held and settled in the ledger every other ask of his is spent from, and under the operator's
 * ceiling, carried from the record to the host that ships it. The daily look it wakes is the background's and spends none of his.
 *
 * WHY THIS FILE EXISTS AFTER `packages/record/test/slash-press-cap.test.ts`. `d16d9d35` taught the record to hold a press
 * and a first plan through a `slashMeter`, and proved it with the host's `slashRecordMeter` over the package's own
 * ledger. But the record asks the meter only when the host passes one, and neither host did: `grep -rn slashMeter apps`
 * found nothing. So on the Worker as it shipped a press was still asked of the operator's Workers AI with no `call` row
 * and no look at `ask_cap` or `SLASH_INCLUDED_MONTH_NEURONS` (`1cdc6721`).
 *
 * DRIVEN THROUGH THE BUNDLE, `src/index.ts` as it ships, over the cloud harness: the owner signs in, presses at
 * `/api/slashPropose`, and the rows are read out of the object's own storage. A test of `slashRecordMeter` alone would
 * be green while `Record$.#open` still handed the record nothing, which is the gap this file is for.
 *
 * THE CLOCK IS MOCKED, because a press on a record younger than two weeks asks no model at all (`noticeUsage`'s `quiet`),
 * and the Worker's clock is `Date.now()`. The binding is a local function and no test here spends a neuron.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const OWNER = 'ada@example.test';
const SLUG = 'pressing';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

/* 232 NEURONS IS THE PACKAGE'S WORST CALL (`slash-operator-cap.test.ts`), so 696 is a ceiling of three asks. */
const THREE_ASKS = '696';

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
type Filed = { by: string; dropped: string[] };

/** Workers AI's `run` in the chat shape, answering an empty draft every time, and counted. */
const fakeAi = () => {
  let runs = 0;
  return {
    runs: () => runs,
    AI: {
      run: async () => {
        runs++;
        return { choices: [{ message: { role: 'assistant', content: '{"drafts":[]}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 700, completion_tokens: 60 } };
      },
    },
  };
};

const TASKS = {
  register: 'tasks',
  name: 'Tasks',
  title: 'what',
  search: ['what'],
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['open', 'done'] },
  ],
  state: 'state',
  done: ['done'],
};

test('A PRESS ON THE WORKER WRITES A LEDGER ROW AND IS REFUSED PAST THE OPERATOR CEILING, and a read after it is refused too', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const ai = fakeAi();
  const c = await cloud({ SLASH_ENDPOINT: '', AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes', SLASH_INCLUDED_MONTH_NEURONS: THREE_ASKS });
  await c.provision(REC, SLUG, OWNER);
  const post = async (method: string, body: object, cookie: string): Promise<Out> =>
    (await (await c.ask(`/api/${method}`, { method: 'POST', cookie, body: JSON.stringify(body) })).json()) as Out;

  /* THE PROBE'S RECORD: one list and one open row, written on day one. */
  const early = await c.signIn(OWNER);
  const declared = await post('setDeclaration', { body: TASKS }, early);
  assert.ok(declared.ok, JSON.stringify(declared));
  const made = await post('create', { register: 'tasks', fields: { what: 'Invoice Acme', state: 'open' } }, early);
  assert.ok(made.ok, JSON.stringify(made));
  /* THE OWNER'S OWN USE ON FIVE DAYS, so Slash asks its model of a record past its fortnight (HD.410): the first row
     edited by hand on four more days, and left as it was. */
  for (const [i, day] of [3, 5, 7, 9].entries()) {
    t.mock.timers.setTime(T0 + day * DAY);
    const kept = await post('update', { register: 'tasks', seq: 1, patch: { what: i % 2 === 0 ? 'Invoice Acme.' : 'Invoice Acme' } }, await c.signIn(OWNER));
    assert.ok(kept.ok, JSON.stringify(kept));
    /* AND THE YOUNG RECORD'S LOOK THAT WRITE WOKE IS LET FINISH, or it would read the clock moved on below. */
    await c.settle();
  }

  /* AND THE CLOCK PAST SLASH'S FIRST FORTNIGHT, with a fresh sign-in, because a press is an owner's write. */
  t.mock.timers.setTime(T0 + 20 * DAY);
  const cookie = await c.signIn(OWNER);
  const presses: Filed[] = [];
  for (let i = 0; i < 5; i++) {
    const out = await post('slashPropose', {}, cookie);
    assert.ok(out.ok, JSON.stringify(out));
    presses.push(out.value as Filed);
  }

  /* THE LOOK THE PRESSES WOKE IS THE ALARM'S: a request asks whether it is due (`slashDue`) and sets the alarm for now. */
  await c.wake(REC);

  /* SIX ASKS AND NOT FIVE: the first request past the fortnight also wakes Slash's daily look (its alarm, set by the
     request), which drafts through the same `slashFile` and so is the same unmetered call. RED BEFORE THE METER WAS
     PASSED, measured: 6 binding calls under a ceiling of 3, one per press and one for the look, and the
     `call` table not even created, because nothing had built the engine that owns it. */
  assert.equal(ai.runs(), 4, `5 presses and the daily look under a ceiling of three asks made ${ai.runs()} included calls`);
  const rows = c.storages
    .get(REC)!
    .sql.exec('SELECT kind, model, tokens_in, tokens_out, neurons, status, code, question FROM slash_call ORDER BY id')
    .toArray() as { kind: string; model: string; tokens_in: number; tokens_out: number; neurons: number; status: string; code: string | null; question: string }[];
  /* AND EACH ASK TURNED AWAY PAST THE CEILING LEAVES ITS ROW UNDER `-` (model-sign-49), never an included call. */
  const turned = rows.filter((r) => r.model === '-');
  assert.ok(turned.length > 0 && turned.every((r) => r.status === 'refused' && r.code === 'SLASH_BUDGET_SPENT' && r.neurons === 0), JSON.stringify(turned));
  const calls = rows.filter((r) => r.model !== '-');
  assert.equal(calls.length, 4, JSON.stringify(rows));
  /* THE THREE ARE HIS PRESSES, AND THE DAILY LOOK IS BESIDE THEM AND NOT ONE OF THEM (ceiling-split-55-56). The look asks
     a model on the first press of the day (cloud-background-54) and was counted as one of the three the ceiling lets
     through, so a person got two. It is a background ask, held to the ceiling over the background's own count. */
  assert.deepEqual(calls.map((r) => r.question).sort(), ["Slash's daily look", "Slash's press", "Slash's press", "Slash's press"], JSON.stringify(calls));
  for (const r of calls) {
    assert.deepEqual([r.kind, r.model, r.status, r.code], [r.question === "Slash's daily look" ? 'pattern' : 'read', 'glm-5.3-flash', 'ok', null]);
    /* PRICED AT THE INCLUDED MODEL'S RATE, the one the package prices the door's asks at, never 0. */
    assert.ok(r.tokens_in > 0 && r.tokens_out > 0, JSON.stringify(r));
    assert.equal(r.neurons, Math.round((r.tokens_in * 13_636) / 1e6 + (r.tokens_out * 45_455) / 1e6));
  }

  /* THE PRESS PAST THE CEILING STILL ANSWERS, drafted by the rules, and says why the model was not asked. */
  const last = presses.at(-1)!;
  assert.equal(last.by, 'rules');
  assert.ok(last.dropped.some((d) => d.startsWith("This month's Slash questions are used until 2026-10-01.")), JSON.stringify(last.dropped));

  /* AND ONE NUMBER FOR BOTH: the presses spent the month a person's read at the palette is spent from. */
  const read = (await (await c.ask('/api/slash/read', { method: 'POST', cookie, body: JSON.stringify({ question: 'What is still open?' }) })).json()) as Out;
  assert.equal(read.refusal?.code, 'SLASH_BUDGET_SPENT', JSON.stringify(read));
  assert.equal(ai.runs(), 4, 'the read after the presses reached the binding');
});
