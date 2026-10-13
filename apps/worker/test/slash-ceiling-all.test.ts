/**
 * Every way the Worker reaches Workers AI, held under the operator's ceiling at once, driven through the bundle.
 *
 * EVERY DOOR THAT ENDS AT THE BINDING. Before this the press, the first plan and the daily look asked the record's model with no
 * meter beside it, so at `SLASH_INCLUDED_MONTH_NEURONS: '0'`, which `wrangler.jsonc` documents as "turns every ask away",
 * five presses and one daily look made 6 binding calls. `70e45882` passed `workerSlashMeter` to the record, and the
 * probe re-run afterwards was still red, 6 calls, because the probe builds the record as `index.ts` did BEFORE
 * that commit and never loads the bundle. So the case below asks the bundle itself, over every door a person can reach
 * that ends at the binding: the press, the daily look it wakes, the first plan, a read and a propose at the palette.
 * `grep -rn "aiInference\|includedInference\|includedModel\|env.AI" apps/worker/src` finds no other caller: the embeddings
 * in `inference.ts` have none, a script's sandbox is handed `RECORD` alone (`script.ts`), and an automation's question
 * and `proposePattern` go through the engine `operatorCeiling` wraps (`slash-operator-cap.test.ts` case 3 holds the first).
 * RED WITHOUT THE METER, measured by taking the `slashMeter` line out of `Record$.#open`: 7 binding calls
 * at a ceiling of 0 (5 presses, the look, the plan), and the two palette doors refused.
 *
 * A PRESS AT THE WORST CALL. The ceiling turns neurons into asks at the package's worst call, 232 (`worstAsk`), and a press was
 * held only by `INCLUDED_NEURONS_PER_CALL`, 2,500, while its input is the record's own reading and grows with it. A probe
 * measured a record of 300 lists: a prompt of 52,310 bytes, a worst case of 272 neurons, counted as one ask of 232.
 * The record's two asks are now held to the same worst call the ceiling counts them at. RED BEFORE THAT, measured:
 * this file 1 pass, 1 fail, "a press may spend 274 neurons and the ceiling counts every call at 232".
 *
 * THE LOOK IS A BACKGROUND ASK THE WORKER COUNTS. `workerSlashMeter` had a `hold` and no `background`, so the record
 * answered "This host cannot count an ask against the background allowance" and the daily look and every skill draft fell
 * to the rules on every Cloud record, at any ceiling. The last three cases hold the other side: under the ceiling the look
 * reaches the binding once and leaves a `look` row that spends the background's month and none of his; on his own key the
 * ceiling does not bind and only the share does; a skill draft is counted the same way. RED BEFORE `background`, measured:
 * 0 `look` rows after the look ran, and `meter.background` undefined in the two cases that ask the meter itself.
 *
 * THE CLOCK IS MOCKED, because a press on a record younger than two weeks asks no model at all, and the Worker's clock
 * is `Date.now()`. The binding is a local function and no test here spends a neuron.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { workerSlashMeter } from '../src/slash-meter.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF';
const OWNER = 'ada@example.test';
const SLUG = 'ceiling';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

/** Workers AI's `run` in the chat shape, answering an empty draft, and keeping each call's worst case as `aiInference` reckons it. */
const fakeAi = () => {
  const worst: number[] = [];
  return {
    worst,
    AI: {
      run: async (_model: string, inputs: { messages: { content: string }[]; max_tokens: number }) => {
        const tokens = inputs.messages.reduce((n, m) => n + Math.ceil(new TextEncoder().encode(m.content).length / 4), 0);
        worst.push(Math.ceil((tokens * 13_636 + inputs.max_tokens * 45_455) / 1_000_000));
        return { choices: [{ message: { role: 'assistant', content: '{"drafts":[]}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 700, completion_tokens: 60 } };
      },
    },
  };
};

const listOf = (id: string) => ({
  register: id,
  name: id,
  title: 'what',
  fields: [{ id: 'what', type: 'text', required: true }, ...Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, type: 'text' }))],
});

/** A record of `lists` lists, one row in each, written on day one, and a cookie from day twenty, past Slash's first fortnight. */
async function recordOver(t: TestContext, neurons: string, lists: number, guide = false) {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const ai = fakeAi();
  const c = await cloud({ SLASH_ENDPOINT: '', AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes', SLASH_INCLUDED_MONTH_NEURONS: neurons });
  await c.provision(REC, SLUG, OWNER);
  const post = async (method: string, body: object, cookie: string): Promise<Out> =>
    (await (await c.ask(`/api/${method}`, { method: 'POST', cookie, body: JSON.stringify(body) })).json()) as Out;
  const early = await c.signIn(OWNER);
  if (guide) {
    const filed = await post('propose', { question: 'Install usecase-guide?', body_kind: 'pack', body: { install: 'usecase-guide' } }, early);
    assert.ok(filed.ok, JSON.stringify(filed));
    const accepted = await post('decide', { id: (filed.value as { id: string }).id, decide: { option: 'accept', reason: 'a first plan needs its lists' } }, early);
    assert.ok(accepted.ok, JSON.stringify(accepted));
  }
  for (let i = 0; i < lists; i++) {
    const declared = await post('setDeclaration', { body: listOf(`list_${i}`) }, early);
    assert.ok(declared.ok, JSON.stringify(declared));
    const made = await post('create', { register: `list_${i}`, fields: { what: `row ${i}` } }, early);
    assert.ok(made.ok, JSON.stringify(made));
  }
  t.mock.timers.setTime(T0 + 20 * DAY);
  const cookie = await c.signIn(OWNER);
  return { ai, c, cookie, post: (method: string, body: object) => post(method, body, cookie) };
}

type Call = { question: string; purpose: string; spends: string; status: string; model: string; code: string | null };
const CALLS = 'SELECT question, purpose, spends, status, model, code FROM slash_call ORDER BY ts, id';

/**
 * Slash's ledger once the daily look has finished with it. THE LOOK IS NOT AWAITED BY THE REQUEST THAT WAKES IT
 * (`ctx.waitUntil`, which the harness drops), and it now holds a row while it works, so a count read straight after the
 * answer can catch that hold in flight. Read until `ready` and nothing is pending, five turns running. Real timers: only
 * `Date` is mocked.
 */
async function ledger(c: Awaited<ReturnType<typeof cloud>>, ready: (rows: Call[]) => boolean = () => true): Promise<Call[]> {
  const read = (): Call[] => {
    try {
      return (c.storages.get(REC)!.sql.exec(CALLS).toArray() as Call[]).map((r) => ({ ...r }));
    } catch (e) {
      if (/no such table/iu.test(e instanceof Error ? e.message : String(e))) return [];
      throw e;
    }
  };
  let rows = read();
  for (let turn = 0, still = 0; turn < 600 && still < 5; turn++) {
    await new Promise((done) => setTimeout(done, 5));
    const next = read();
    still = ready(next) && !next.some((r) => r.code === 'SLASH_PENDING') && JSON.stringify(next) === JSON.stringify(rows) ? still + 1 : 0;
    rows = next;
  }
  return rows;
}

test('AT A CEILING OF 0 NOTHING REACHES THE BINDING: five presses, the daily look, a first plan, a read and a propose at the palette', async (t) => {
  const { ai, c, cookie, post } = await recordOver(t, '0', 1, true);
  const presses: Out[] = [];
  for (let i = 0; i < 5; i++) presses.push(await post('slashPropose', {}));
  const formed = await post('slashForm', { usecase: 'guide', said: 'I am opening a small bakery.' });
  const doors: Out[] = [];
  for (const door of ['read', 'propose'])
    doors.push((await (await c.ask(`/api/slash/${door}`, { method: 'POST', cookie, body: JSON.stringify({ question: 'What is still open?' }) })).json()) as Out);

  /* THE COUNT FIRST, so a red run says how many calls got through before it says which door let them. */
  assert.equal(ai.worst.length, 0, `the operator turned every ask away and the Worker made ${ai.worst.length} Workers AI calls`);
  /* EVERY DOOR STILL ANSWERS IN ITS OWN WORDS: the press is drafted by the rules, the plan is the use case's own, and
     the palette is refused with the ceiling's code. */
  for (const out of presses) assert.equal((out.value as { by?: string } | undefined)?.by, 'rules', JSON.stringify(out));
  assert.deepEqual(formed.value, { formed: false, why: 'spent', detail: (formed.value as { detail?: string } | undefined)?.detail }, JSON.stringify(formed));
  for (const out of doors) assert.equal(out.refusal?.code, 'SLASH_BUDGET_SPENT', JSON.stringify(out));
});

test('A PRESS NEVER SPENDS MORE THAN THE ASK THE CEILING COUNTS IT AS: on 300 lists the model is not asked, on 1 it is', async (t) => {
  const { ai, c, post } = await recordOver(t, '900000', 300);
  const out = await post('slashPropose', {});
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal((out.value as { by: string }).by, 'rules');
  for (const w of ai.worst) assert.ok(w <= 232, `a press may spend ${w} neurons and the ceiling counts every call at 232`);
  assert.equal(ai.worst.length, 0, 'the press and the daily look on 300 lists are both past 232, so neither is sent');
  /* AND NOTHING LEFT BEHIND IN THE LEDGER: a call never sent is released, so it spends none of the month's asks. */
  const rows = await ledger(c);
  assert.equal(rows.length, 0, JSON.stringify(rows));
  assert.equal(ai.worst.length, 0, 'the look finished after the press and was sent past 232');
  t.mock.timers.reset();

  /* THE CONTROL: an ordinary record's press is still asked of the model, so the cap is not a switch that turned it off. */
  const small = await recordOver(t, '900000', 1);
  assert.ok((await small.post('slashPropose', {})).ok);
  assert.ok(small.ai.worst.length >= 1, 'a press on a record of one list never reached the model');
  for (const w of small.ai.worst) assert.ok(w <= 232, `a press may spend ${w} neurons`);
});


test("UNDER THE CEILING THE DAILY LOOK ASKS THE BINDING ONCE, and its row spends the background's month and none of his", async (t) => {
  const { ai, c, post } = await recordOver(t, '900000', 1);
  /* ANY REQUEST PAST THE FORTNIGHT WAKES THE LOOK (`slashLook` beside every request), and this one is no press. */
  const made = await post('create', { register: 'list_0', fields: { what: 'a second one' } });
  assert.ok(made.ok, JSON.stringify(made));

  const rows = await ledger(c, (now) => now.some((r) => r.question === "Slash's daily look"));
  const looks = rows.filter((r) => r.question === "Slash's daily look");
  assert.deepEqual(looks, [{ question: "Slash's daily look", purpose: 'look', spends: 'background', status: 'ok', model: 'glm-5.3-flash', code: null }], JSON.stringify(rows));
  /* ONE BINDING CALL FOR EACH ROW THAT NAMES A MODEL, so nothing reached Workers AI beside the ledger. */
  assert.equal(ai.worst.length, rows.length, `${ai.worst.length} Workers AI calls and ${rows.length} rows: ${JSON.stringify(rows)}`);
  assert.equal(rows.filter((r) => r.spends === 'person').length, 0, `the look spent one of his asks: ${JSON.stringify(rows)}`);
  for (const w of ai.worst) assert.ok(w <= 232, `a background ask may spend ${w} neurons and the ceiling counts every call at 232`);
});

const INCLUDED = { AI: fakeAi().AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' };
const noGrants = () => ({ kernel: { grants: () => [] } }) as never;
const clock = { now: () => T0 + 20 * DAY };

test("ON HIS OWN KEY ONLY THE SHARE BINDS: a ceiling of 0 turns the included model's look away and not his key's", async () => {
  const sql = openSqlite();
  const meter = workerSlashMeter({ ...INCLUDED, SLASH_INCLUDED_MONTH_NEURONS: '0' }, noGrants, { sql, clock });
  assert.ok(meter.background, 'the Worker cannot count a background ask, so the look asks nothing');

  const turned = await meter.background('look');
  assert.equal(!turned.ok && turned.refusal.code, 'SLASH_BUDGET_SPENT', JSON.stringify(turned));
  assert.doesNotMatch(!turned.ok ? turned.refusal.fix : '', /cannot count|doubtful names/u);
  assert.equal(sql.all("SELECT 1 FROM slash_call WHERE model <> '-'").length, 0, 'an ask turned away at the ceiling was held anyway');

  sql.exec("UPDATE slash_settings SET tier = 'b' WHERE singleton = 1");
  const own = await meter.background('look');
  assert.ok(own.ok, JSON.stringify(own));
  own.value.settle({ usage: { in: 100, out: 10 } });
  const rows = sql.all<{ purpose: string; spends: string; neurons: number }>("SELECT purpose, spends, neurons FROM slash_call WHERE model <> '-'").map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ purpose: 'look', spends: 'background', neurons: rows[0]?.neurons ?? -1 }]);
});

test("A SKILL DRAFT IS A BACKGROUND ASK TOO: held under the ceiling, turned away at it, and never one of his asks", async () => {
  const sql = openSqlite();
  const meter = workerSlashMeter(INCLUDED, noGrants, { sql, clock });
  const held = await meter.background?.('skill');
  assert.ok(held?.ok, JSON.stringify(held));
  held.value.settle({ usage: { in: 100, out: 10 } });
  const rows = sql.all<{ question: string; purpose: string; spends: string }>('SELECT question, purpose, spends FROM slash_call').map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ question: "Slash's skill draft", purpose: 'look', spends: 'background' }]);

  const none = workerSlashMeter({ ...INCLUDED, SLASH_INCLUDED_MONTH_NEURONS: '0' }, noGrants, { sql: openSqlite(), clock });
  const turned = await none.background?.('skill');
  assert.equal(turned !== undefined && !turned.ok && turned.refusal.code, 'SLASH_BUDGET_SPENT', JSON.stringify(turned));
});
