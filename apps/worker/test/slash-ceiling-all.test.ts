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
 * go through the engine's `embedTexts` (`slash.ts` `embedOver`) on the background allowance and outside this ceiling's
 * counts, a script's sandbox is handed `RECORD` alone (`script.ts`), and an automation's question
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
 * THE BACKGROUND'S ASKS AND HIS ARE HELD TO THE CEILING APART (ceiling-split-55-56). One count held both, so at a ceiling
 * of three the look took one of a person's three, and five background asks left the palette refusing a person who had
 * asked nothing. The last case asks five of them (look, headline, skill, the reading of who is who, look) and then the
 * palette: three are held and two turned away at the background's own count, his count reads 0, and his read answers.
 * RED BEFORE THE SPLIT, measured with the one count put back: "five background asks spent 3 of his asks", and the look
 * after his three reads turned away.
 *
 * AND THE TWO TOGETHER STAY INSIDE THE MONTH'S BUDGET (ceiling-total-57-58). Held apart, each side could spend the whole
 * ceiling, so one record could cost the operator twice the number he set. The joint cases make every call cost its worst,
 * 232 neurons, at a budget of 696: his asks and the background's are asked in turn until both are turned away, and the
 * ledger's bill is never past 696. RED WITHOUT THE JOINT CAP, measured with it switched off: three
 * cases fail, each on a read that was answered past the budget.
 *
 * THE CLOCK IS MOCKED, because a press on a record younger than two weeks asks no model at all, and the Worker's clock
 * is `Date.now()`. The binding is a local function and no test here spends a neuron.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { PURPOSES } from '@braindog/host/infer';
import { HIS_CALL, workerSlashDoor } from '../src/slash.ts';
import { slashDays, workerSlashMeter, workerUnderstandLedger } from '../src/slash-meter.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF';
const OWNER = 'ada@example.test';
const SLUG = 'ceiling';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

/**
 * Workers AI's `run` in the chat shape, answering an empty draft, and keeping each call's worst case as `aiInference`
 * reckons it. AN EMBEDDING IS COUNTED APART (`embeds`), in the shape that model answers in: the alarm's hourly pass sends
 * the record's new words to it, on the background allowance and outside the ceiling (`callsMade`). This fake used to read
 * `messages` off it and throw, so the call was never counted here, and it left a failed row in the ledger.
 */
const fakeAi = () => {
  const worst: number[] = [];
  const embeds: string[][] = [];
  return {
    worst,
    embeds,
    AI: {
      run: async (_model: string, inputs: { messages: { content: string }[]; max_tokens: number; text?: string[] }) => {
        if (inputs.text !== undefined) {
          embeds.push(inputs.text);
          return { shape: [inputs.text.length, 4], data: inputs.text.map(() => [0.1, 0.2, 0.3, 0.4]) };
        }
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
  /* THE OWNER'S OWN USE ON FIVE DAYS, so Slash asks its model of a record past its fortnight (HD.410): the first row
     edited by hand on four more days, and left as it was. */
  for (const [i, day] of [3, 5, 7, 9].entries()) {
    t.mock.timers.setTime(T0 + day * DAY);
    const kept = await post('update', { register: 'list_0', seq: 1, patch: { what: i % 2 === 0 ? 'row 0.' : 'row 0' } }, await c.signIn(OWNER));
    assert.ok(kept.ok, JSON.stringify(kept));
    /* AND THE YOUNG RECORD'S LOOK THAT WRITE WOKE IS LET FINISH, or it would read the clock moved on below. */
    await c.settle();
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

test('AT A CEILING OF 0 NO ASK REACHES THE BINDING, only the hourly embedding: five presses, the daily look, a first plan, a read and a propose at the palette', async (t) => {
  const { ai, c, cookie, post } = await recordOver(t, '0', 1, true);
  const presses: Out[] = [];
  for (let i = 0; i < 5; i++) presses.push(await post('slashPropose', {}));
  const formed = await post('slashForm', { usecase: 'guide', said: 'I am opening a small bakery.' });
  const doors: Out[] = [];
  for (const door of ['read', 'propose'])
    doors.push((await (await c.ask(`/api/slash/${door}`, { method: 'POST', cookie, body: JSON.stringify({ question: 'What is still open?' }) })).json()) as Out);
  /* AND THE DAILY LOOK THE REQUESTS WOKE, which is the alarm's (`slashDue`, `wake`). */
  await c.wake(REC);

  /* THE COUNT FIRST, so a red run says how many calls got through before it says which door let them. */
  assert.equal(ai.worst.length, 0, `the operator turned every ask away and the Worker made ${ai.worst.length} Workers AI calls`);
  /* AND THE EMBEDDING IS NOT AN ASK: the hourly pass still sends the record's new words on the background allowance, at
     any ceiling, as this file's header says. It went unseen here while the fake threw on it, so it is counted now. */
  assert.deepEqual(ai.embeds, [['row 0']], 'the embedding the alarm sends is held by the background allowance, not this ceiling');
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
  /* AND THE DAILY LOOK THE PRESS WOKE, which is the alarm's (`slashDue`, `wake`). */
  await c.wake(REC);
  assert.equal((out.value as { by: string }).by, 'rules');
  for (const w of ai.worst) assert.ok(w <= 232, `a press may spend ${w} neurons and the ceiling counts every call at 232`);
  assert.equal(ai.worst.length, 0, 'the press and the daily look on 300 lists are both past 232, so neither is sent');
  /* AND NOTHING LEFT BEHIND IN THE LEDGER: a call never sent is released, so it spends none of the month's asks. */
  const rows = (await ledger(c)).filter((r) => r.purpose !== 'embed');
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
  /* ANY REQUEST PAST THE FORTNIGHT WAKES THE LOOK, and this one is no press: it asks whether the look is due
     (`slashDue`) and sets the alarm for now, and the alarm does the look (`wake`). */
  const made = await post('create', { register: 'list_0', fields: { what: 'a second one' } });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok((await c.wake(REC)) >= 1, 'the request did not wake the alarm for the look');

  const rows = await ledger(c, (now) => now.some((r) => r.question === "Slash's daily look"));
  const looks = rows.filter((r) => r.question === "Slash's daily look");
  assert.deepEqual(looks, [{ question: "Slash's daily look", purpose: 'look', spends: 'background', status: 'ok', model: 'glm-5.3-flash', code: null }], JSON.stringify(rows));
  /* ONE BINDING CALL FOR EACH ROW THAT NAMES A MODEL, so nothing reached Workers AI beside the ledger: the asks and the
     embeddings each to their own rows. */
  const named = rows.filter((r) => r.model !== '-');
  assert.equal(ai.worst.length + ai.embeds.length, named.length, `${ai.worst.length} Workers AI calls, ${ai.embeds.length} embeddings and ${named.length} rows that name a model: ${JSON.stringify(rows)}`);
  assert.equal(ai.worst.length, named.filter((r) => r.purpose !== 'embed').length, JSON.stringify(rows));
  assert.equal(rows.filter((r) => r.spends === 'person').length, 0, `the look spent one of his asks: ${JSON.stringify(rows)}`);
  for (const w of ai.worst) assert.ok(w <= 232, `a background ask may spend ${w} neurons and the ceiling counts every call at 232`);
});

const INCLUDED = { AI: fakeAi().AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' };
/* A RECORD WITH NO GRANTS AND NO PREF SET, which is the switch for Slash reading on its own left on (`slash.reads`). */
const noGrants = () => ({ kernel: { grants: () => [], prefsOf: () => ({}) } }) as never;
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
  assert.deepEqual(rows, [{ question: "Slash's skill draft", purpose: 'skill', spends: 'background' }]);

  const none = workerSlashMeter({ ...INCLUDED, SLASH_INCLUDED_MONTH_NEURONS: '0' }, noGrants, { sql: openSqlite(), clock });
  const turned = await none.background?.('skill');
  assert.equal(turned !== undefined && !turned.ok && turned.refusal.code, 'SLASH_BUDGET_SPENT', JSON.stringify(turned));
});

/* THE PALETTE'S ENGINE AND THE BACKGROUND'S METER OVER ONE LEDGER, as `Record$.#open` builds them over one object's storage. */
const OWNER_CTX = { principal: { kind: 'person' as const, id: 'p_owner', level: 'owner' as const } };
const PREDICATE = '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}';
const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    search: ['what'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};

type Refused = { ok: boolean; refusal?: { code: string; fix: string } };
type Status = { asks: { used: number; cap: number } };

/** The worst ask the ceiling counts every call as, 12,000 tokens in and 1,500 out: 232 neurons on the included model. */
const DEAR = { in: 12_000, out: 1_500 };
const CHEAP = { in: 100, out: 10 };

async function paletteAndBackground(neurons: string, reply = { prompt_tokens: 700, completion_tokens: 60 }) {
  let runs = 0;
  const AI = {
    run: async () => {
      runs++;
      return { choices: [{ message: { role: 'assistant', content: PREDICATE }, finish_reason: 'stop' }], usage: reply };
    },
  };
  const env = { SLASH_ENDPOINT: '', AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes', SLASH_INCLUDED_MONTH_NEURONS: neurons };
  const at = fixedClock(T0 + 20 * DAY);
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock: at });
  assert.ok((await api.kernel.install([TASKS])).ok);
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Invoice Acme', state: 'open' } }, OWNER_CTX)).ok);
  const deps = { sql: own, clock: at };
  const engine = (await workerSlashDoor(env, () => api, deps, new Set()).engine!())!;
  assert.ok(engine, 'the door built no engine over the included model');
  const meter = workerSlashMeter(env, () => api, deps);
  const understand = workerUnderstandLedger(env, () => api, deps);
  /** One background ask, settled as a model that answered where it was held. */
  const background = async (kind: 'look' | 'headline' | 'skill' | 'understand', unreached = false, usage = CHEAP): Promise<Refused> => {
    const held = kind === 'understand' ? await understand.background(kind) : await meter.background!(kind);
    if (held.ok) held.value.settle(unreached ? { usage: { in: 0, out: 0 }, code: 'UNREACHABLE' } : { usage });
    return held;
  };
  /** One background ask held and left in flight: the model has been called and has not answered yet. */
  const inFlight = async (kind: 'look' | 'headline' | 'skill') => meter.background!(kind);
  /** What the month has spent of the included model, his and the background's together, as the ledger bills it. */
  const billed = (): number => own.one<{ n: number | null }>("SELECT SUM(neurons) AS n FROM slash_call WHERE model <> '-'")?.n ?? 0;
  return { engine, background, inFlight, billed, own, at, api, runs: () => runs, done: () => (sql.close(), own.close()) };
}

test('A CEILING OF THREE ASKS, FIVE BACKGROUND ASKS, AND THE PALETTE STILL ANSWERS: the two are counted and held apart', async () => {
  const { engine, background, own, at, runs, done } = await paletteAndBackground('696');
  try {
    /* FIVE OF THE RECORD'S OWN: the look, the headlines, a skill draft, the reading of who is who, and the look again. */
    const asked: Refused[] = [];
    for (const kind of ['look', 'headline', 'skill', 'understand', 'look'] as const) asked.push(await background(kind));
    /* THE BACKGROUND IS HELD TO THE CEILING OVER ITS OWN COUNT: three held, and the two past it turned away unheld. */
    assert.deepEqual(asked.map((a) => a.ok), [true, true, true, false, false], JSON.stringify(asked));
    for (const a of asked.slice(3)) assert.equal(a.refusal?.code, 'SLASH_BUDGET_SPENT', JSON.stringify(a));
    const spends = own.all<{ spends: string; n: number }>("SELECT spends, COUNT(*) AS n FROM slash_call WHERE model <> '-' GROUP BY spends").map((r) => ({ ...r }));
    assert.deepEqual(spends, [{ spends: 'background', n: 3 }]);

    /* AND NONE OF IT WAS HIS: the palette reads no asks used, and a person's read reaches the model. */
    const before = engine.status() as Status;
    assert.deepEqual([before.asks.used, before.asks.cap], [0, 3], `five background asks spent ${before.asks.used} of his asks`);
    const read = (await engine.read('What is still open?', OWNER_CTX)) as Refused;
    assert.ok(read.ok, JSON.stringify(read));
    assert.equal(runs(), 1, 'the read after five background asks never reached the binding');

    /* HIS THREE ARE STILL THREE, and the fourth is the ceiling's refusal. */
    for (let i = 0; i < 2; i++) assert.ok(((await engine.read(`open tasks ${i}`, OWNER_CTX)) as Refused).ok);
    const fourth = (await engine.read('one more', OWNER_CTX)) as Refused;
    assert.equal(fourth.refusal?.code, 'SLASH_BUDGET_SPENT', JSON.stringify(fourth));
    assert.equal(runs(), 3);
    assert.deepEqual((engine.status() as Status).asks, { ...(engine.status() as Status).asks, used: 3, cap: 3 });

    /* THE ACCOUNT'S COPY SAYS THE SAME TWO NUMBERS, one day of three asks of his and three of the record's own. */
    const days = slashDays(own, at.now());
    assert.deepEqual(
      days.map((d) => [d.day, d.asks, d.background]),
      [['2026-09-21', 3, 3]],
      JSON.stringify(days),
    );
    assert.ok(days[0]!.neurons > 0, JSON.stringify(days));
  } finally {
    done();
  }
});

test('HIS ASKS SPENT DO NOT TURN THE BACKGROUND AWAY: three reads at a ceiling of three, and the daily look is still held', async () => {
  const { engine, background, done } = await paletteAndBackground('696');
  try {
    for (let i = 0; i < 3; i++) assert.ok(((await engine.read(`open tasks ${i}`, OWNER_CTX)) as Refused).ok);
    assert.equal(((await engine.read('one more', OWNER_CTX)) as Refused).refusal?.code, 'SLASH_BUDGET_SPENT');
    const look = await background('look');
    assert.ok(look.ok, JSON.stringify(look));
    assert.equal((engine.status() as Status).asks.used, 3, 'the look after his asks moved his count');
  } finally {
    done();
  }
});

test('A BACKGROUND ASK NO MODEL ANSWERED IS STILL THE BACKGROUND\'S: three looks that never reached a model leave his three asks whole', async () => {
  const { engine, own, at, done } = await paletteAndBackground('696');
  try {
    const env = { SLASH_ENDPOINT: '', AI: { run: async () => ({}) }, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes', SLASH_INCLUDED_MONTH_NEURONS: '696' };
    const meter = workerSlashMeter(env, noGrants, { sql: own, clock: at });
    /* THE ROW KEEPS ITS MODEL'S NAME AND SAYS `none` (`@braindog/host` `settled`), so only its purpose says whose it was. */
    for (let i = 0; i < 3; i++) {
      const held = await meter.background!('look');
      assert.ok(held.ok, JSON.stringify(held));
      held.value.settle({ usage: { in: 0, out: 0 }, code: 'UNREACHABLE' });
    }
    const rows = own.all<{ spends: string; purpose: string }>("SELECT spends, purpose FROM slash_call WHERE model <> '-'").map((r) => ({ ...r }));
    assert.deepEqual(rows, Array(3).fill({ spends: 'none', purpose: 'look' }));
    assert.equal((engine.status() as Status).asks.used, 0, 'three looks no model answered were counted as his asks');
    assert.ok(((await engine.read('What is still open?', OWNER_CTX)) as Refused).ok);
    /* AND THE CEILING STILL COUNTS THEM, as the background's: the fourth look is turned away. */
    const fourth = await meter.background!('look');
    assert.equal(!fourth.ok && fourth.refusal.code, 'SLASH_BUDGET_SPENT', JSON.stringify(fourth));
    assert.deepEqual(slashDays(own, at.now()).map((d) => [d.asks, d.background]), [[1, 3]]);
  } finally {
    done();
  }
});

test("THE LOOK, A HEADLINE AND THE READING OF WHO IS WHO EACH LEAVE HIS MONTH WHOLE, answered or not: six of the record's own and his asks read 0", async () => {
  /* A CEILING OF TEN, so nothing here is turned away and every one of the six leaves its row. */
  const { engine, background, own, at, done } = await paletteAndBackground('2320');
  try {
    for (const kind of ['look', 'headline', 'understand'] as const) {
      const answered = await background(kind);
      assert.ok(answered.ok, `${kind}: ${JSON.stringify(answered)}`);
      assert.equal((engine.status() as Status).asks.used, 0, `a ${kind} ask the model answered spent one of his asks`);
      const unreached = await background(kind, true);
      assert.ok(unreached.ok, `${kind}: ${JSON.stringify(unreached)}`);
      assert.equal((engine.status() as Status).asks.used, 0, `a ${kind} ask no model answered spent one of his asks`);
    }
    /* NOT ONE ROW SAYS IT SPENT HIS, and each kind is on the ledger under its own purpose, once answered and once not. */
    const rows = own.all<{ purpose: string; spends: string }>("SELECT purpose, spends FROM slash_call WHERE model <> '-' ORDER BY rowid").map((r) => ({ ...r }));
    assert.deepEqual(
      rows,
      ['look', 'headline', 'understand'].flatMap((purpose) => [
        { purpose, spends: 'background' },
        { purpose, spends: 'none' },
      ]),
      JSON.stringify(rows),
    );
    /* THE ACCOUNT'S COPY SAYS NONE OF HIS AND SIX OF THE RECORD'S OWN, and his first read is his first ask. */
    assert.deepEqual(slashDays(own, at.now()).map((d) => [d.asks, d.background]), [[0, 6]]);
    assert.ok(((await engine.read('What is still open?', OWNER_CTX)) as Refused).ok);
    assert.equal((engine.status() as Status).asks.used, 1);
    assert.deepEqual(slashDays(own, at.now()).map((d) => [d.asks, d.background]), [[1, 6]]);
  } finally {
    done();
  }
});

test('WITH SLASH READING ON ITS OWN SWITCHED OFF NOTHING OF THE BACKGROUND IS HELD, and his own ask is answered: no row, no model, and on again it is held', async () => {
  const { engine, background, own, api, runs, done } = await paletteAndBackground('2320');
  try {
    api.kernel.setPref('slash', 'slash.reads', false);
    for (const kind of ['look', 'headline', 'skill', 'understand'] as const) {
      const off = await background(kind);
      assert.equal(off.refusal?.code, 'FORBIDDEN', `${kind}: ${JSON.stringify(off)}`);
      assert.match(off.refusal?.fix ?? '', /switched off/u);
    }
    assert.equal(own.all('SELECT 1 FROM slash_call').length, 0, 'a background ask switched off left a row');
    /* HIS OWN ASK IS HIS OWN ACT, and the switch is never read for it. */
    assert.ok(((await engine.read('What is still open?', OWNER_CTX)) as Refused).ok);
    assert.equal(runs(), 1);
    assert.equal((engine.status() as Status).asks.used, 1);
    /* ON AGAIN IS READ AT THE NEXT ASK, with no meter rebuilt. */
    api.kernel.setPref('slash', 'slash.reads', true);
    assert.ok((await background('look')).ok);
  } finally {
    done();
  }
});

const SAMPLES = [1, 2, 3].map((n) => ({ id: `raw_${n}`, channel: 'email' as const, ts: '2026-09-20T10:00:00.000Z', from: 'billing@acme.test', subject: `Invoice ${n}`, body: `Invoice ${n} for 120.00 EUR` }));

test("THE RECORD'S OWN DRAFT IS HELD OVER THE BACKGROUND'S COUNT: asked after his three are spent, turned away after the background's three", async () => {
  const { engine, background, own, runs, done } = await paletteAndBackground('696');
  /* THE DOOR'S TYPE NAMES WHAT A PERSON ASKS; the draft is the model-jobs pass's, on the same engine object. */
  const drafts = engine as unknown as { draftPattern: (samples: typeof SAMPLES) => Promise<unknown> };
  try {
    for (let i = 0; i < 3; i++) assert.ok(((await engine.read(`open tasks ${i}`, OWNER_CTX)) as Refused).ok);
    assert.equal(runs(), 3);
    /* HIS MONTH IS SPENT AND THE DRAFT STILL REACHES THE MODEL, whatever it makes of the reply. */
    await drafts.draftPattern(SAMPLES);
    assert.equal(runs(), 4, 'a draft of the record\'s own was turned away because his asks were spent');
    assert.equal((engine.status() as Status).asks.used, 3, 'the draft moved his count');
    /* TWO MORE OF THE BACKGROUND'S REACH ITS THREE, and the next draft asks nothing. */
    assert.ok((await background('look')).ok);
    assert.ok((await background('headline')).ok);
    const turned = (await drafts.draftPattern(SAMPLES)) as Refused;
    assert.equal(turned.refusal?.code, 'SLASH_BUDGET_SPENT', JSON.stringify(turned));
    assert.equal(runs(), 4, 'a draft past the background\'s three reached the binding');
    const n = own.one<{ n: number }>("SELECT COUNT(*) AS n FROM slash_call WHERE model <> '-' AND spends = 'background'")?.n;
    assert.equal(n, 3);
  } finally {
    done();
  }
});

/* ── the two together, inside the month's budget (ceiling-total-57-58) ───────────────────────────────────────────────── */

const DEAR_REPLY = { prompt_tokens: DEAR.in, completion_tokens: DEAR.out };
const BUDGET = 696;

test("HIS ASKS AND THE BACKGROUND'S TOGETHER NEVER SPEND PAST THE MONTH'S BUDGET: every call at its worst, and the bill stops at the ceiling", async () => {
  const { engine, background, billed, runs, done } = await paletteAndBackground(String(BUDGET), DEAR_REPLY);
  try {
    /* THREE CALLS AT THEIR WORST ARE THE WHOLE MONTH, whoever asked: a read, a look, a read. */
    assert.ok(((await engine.read('What is still open?', OWNER_CTX)) as Refused).ok);
    assert.ok((await background('look', false, DEAR)).ok);
    assert.ok(((await engine.read('open tasks', OWNER_CTX)) as Refused).ok);
    assert.equal(runs(), 2);
    assert.ok(billed() > BUDGET - 232 && billed() <= BUDGET, `three calls at their worst billed ${billed()} of ${BUDGET}`);

    /* NEITHER COUNT IS REACHED, his two of three and the background's one of three, AND BOTH ARE TURNED AWAY. */
    for (let i = 0; i < 5; i++) {
      const read = (await engine.read(`one more ${i}`, OWNER_CTX)) as Refused;
      assert.equal(read.refusal?.code, 'SLASH_BUDGET_SPENT', JSON.stringify(read));
      for (const kind of ['look', 'headline', 'skill', 'understand'] as const) {
        const more = await background(kind, false, DEAR);
        assert.equal(more.refusal?.code, 'SLASH_BUDGET_SPENT', `${kind}: ${JSON.stringify(more)}`);
      }
    }
    assert.equal(runs(), 2, 'an ask past the budget reached the binding');
    assert.ok(billed() <= BUDGET, `the month billed ${billed()} neurons against a budget of ${BUDGET}`);

    /* AND HE IS TOLD NO ASKS ARE LEFT, not one of three still to make on a host refusing every one. */
    const { used, cap } = (engine.status() as Status).asks;
    assert.deepEqual([used, cap], [2, 2]);
  } finally {
    done();
  }
});

test('THE BACKGROUND AT ITS WORST CANNOT SPEND THE CEILING TWICE OVER WITH HIM: its three dear asks are the month, and his read is turned away', async () => {
  const { engine, background, billed, runs, done } = await paletteAndBackground(String(BUDGET), DEAR_REPLY);
  try {
    for (const kind of ['look', 'headline', 'skill'] as const) assert.ok((await background(kind, false, DEAR)).ok, kind);
    const read = (await engine.read('What is still open?', OWNER_CTX)) as Refused;
    assert.equal(read.refusal?.code, 'SLASH_BUDGET_SPENT', JSON.stringify(read));
    assert.equal(runs(), 0, 'a read past the budget reached the binding');
    assert.ok(billed() <= BUDGET, `the month billed ${billed()} neurons against a budget of ${BUDGET}`);
  } finally {
    done();
  }
});

test('AN ASK IN FLIGHT IS TAKEN AT ITS WORST UNTIL ITS BILL IS IN: three held and unanswered fill the month, and settled cheap they leave room', async () => {
  const { engine, inFlight, runs, done } = await paletteAndBackground(String(BUDGET));
  try {
    const held = [await inFlight('look'), await inFlight('headline'), await inFlight('skill')];
    assert.deepEqual(held.map((h) => h.ok), [true, true, true], JSON.stringify(held));
    /* NO NEURON IS BILLED YET AND EACH MAY STILL COST 232, so a fourth call could end the month past its budget. */
    const early = (await engine.read('What is still open?', OWNER_CTX)) as Refused;
    assert.equal(early.refusal?.code, 'SLASH_BUDGET_SPENT', JSON.stringify(early));
    assert.equal(runs(), 0);
    /* THE BILLS COME IN SMALL, and the room they did not use is his again. */
    for (const h of held) if (h.ok) h.value.settle({ usage: CHEAP });
    const read = (await engine.read('What is still open?', OWNER_CTX)) as Refused;
    assert.ok(read.ok, JSON.stringify(read));
    assert.equal(runs(), 1);
  } finally {
    done();
  }
});

test('WHOSE A CALL IS COMES FROM THE PURPOSES TABLE: an unanswered call of every purpose is his exactly where the table says a person pays', async () => {
  const { engine, own, at, done } = await paletteAndBackground(String(BUDGET));
  try {
    assert.ok(engine.status());
    const ts = new Date(at.now()).toISOString();
    for (const purpose of Object.keys(PURPOSES))
      own.exec(
        "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, purpose, spends) VALUES (?, ?, 'read', 'a', 'glm-5.3-flash', 0, 0, 0, 0, 'error', 'UNREACHABLE', ?, 'none')",
        `call_${purpose}`,
        ts,
        purpose,
      );
    const his = own.all<{ purpose: string }>(`SELECT purpose FROM slash_call WHERE ${HIS_CALL} ORDER BY purpose`).map((r) => r.purpose);
    const persons = Object.entries(PURPOSES).filter(([, who]) => who.spends === 'person').map(([purpose]) => purpose).sort();
    assert.deepEqual(his, persons);
    assert.deepEqual(persons, ['ask', 'automation', 'plan'], 'the table moved whose asks are a person\'s: read the ceiling\'s counts again');
  } finally {
    done();
  }
});
