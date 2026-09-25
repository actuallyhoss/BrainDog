/**
 * The operator's ceiling on the included model, and the two ledger faults beside it (`loop/research-batch-sixty-audit.md`
 * findings 1, 4 and 5, the audit's probes S1, S3 and S4 carried into this suite).
 *
 * FINDING 1, SEV 1. `4e701b15` switched the included model on in both environments, so a record's asks spend the
 * operator's Workers AI. The only monthly bound was `settings.ask_cap`, which is the record owner's to type: S1 saved
 * `ask_cap: 1_000_000_000` through the door's engine and 200 reads all reached the binding, `{ answered: 200, runs: 200 }`.
 * The ceiling is now a Worker var, `SLASH_INCLUDED_MONTH_NEURONS`, turned into asks at the package's worst call, and the
 * Worker holds every record's engine under it: a save above it is refused, and a cap already stored above it no longer
 * lets an ask through.
 *
 * FINDING 4. S3: tier `byo` with `model: glm-5.3-flash` on a Worker with no endpoint ran on the binding and the ledger
 * priced it `neurons: 0`.
 *
 * FINDING 5. S4: one binding throw was priced 9 and counted on a read, and settled under `-`, priced 0 and uncounted on an
 * automation's answer, which the ladder then asked again. Both are settled under the model's name now, priced by the
 * package's one rule and counted.
 *
 * RED BEFORE THE REPAIR, MEASURED ON 24 SEPTEMBER: 8 tests, 1 pass, 7 fail. Case 7 passed before and after, which is its
 * job: an owner's lower cap still lowers.
 *
 * THE BINDING IS A LOCAL FUNCTION, as in `slash-included.test.ts`. No test here spends a neuron.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { workerSlashAnswers, workerSlashDoor } from '../src/slash.ts';

const OWNER = { principal: { kind: 'person' as const, id: 'p_owner', level: 'owner' as const } };
const ASK = { run: 'run_1', step: 0, rule: 'rate', question: 'What rate applies?', shape: 'number' as const };
const T0 = Date.UTC(2026, 8, 24, 9);
const PREDICATE = '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}';

/** Workers AI's `run` in the chat shape, answering `answer` every time, or throwing when `fail` is set. */
const fakeAi = (answer: string, fail = false) => {
  let runs = 0;
  return {
    runs: () => runs,
    AI: {
      run: async () => {
        runs++;
        if (fail) throw new Error('InferenceUpstreamError: 3043 internal server error');
        return { choices: [{ message: { role: 'assistant', content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 700, completion_tokens: 60 } };
      },
    },
  };
};

/** Production's Slash vars after `4e701b15`, with the ceiling as the test sets it, or as `wrangler.jsonc` leaves it unset. */
const prod = (ai: ReturnType<typeof fakeAi>, neurons?: string) => ({
  SLASH_ENDPOINT: '',
  AI: ai.AI,
  AI_GATEWAY: 'braindog',
  SLASH_INCLUDED: 'yes',
  ...(neurons === undefined ? {} : { SLASH_INCLUDED_MONTH_NEURONS: neurons }),
});

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

async function withEngine(ai: ReturnType<typeof fakeAi>, neurons?: string) {
  const clock = fixedClock(T0);
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Invoice Acme', state: 'open' } }, OWNER)).ok);
  const engine = (await workerSlashDoor(prod(ai, neurons), () => api, { sql: own, clock }, new Set()).engine!())!;
  assert.ok(engine, 'the door built no engine over the included model');
  const done = () => (sql.close(), own.close());
  return { clock, sql, own, api, engine, done };
}

/* 232 NEURONS IS THE PACKAGE'S WORST CALL: a propose, 12,000 tokens in and 1,500 out at 13,636 and 45,455 a million, is
   231.8. So 2,320 neurons is ten asks, and the default of 900,000 is 3,879. */
const TEN_ASKS = '2320';

test('S1 (1) AN OWNER CANNOT RAISE THE CAP PAST THE OPERATOR: ask_cap 1,000,000,000 is refused and names the ceiling', async () => {
  const ai = fakeAi(PREDICATE);
  const { engine, done } = await withEngine(ai);
  const set = engine.configure({ ask_cap: 1_000_000_000 }, OWNER) as Refused;
  /* RED: `{ ok: true }`, the audit's `saved: true`. */
  assert.equal(set.ok, false, 'an owner saved a cap a billion asks high');
  assert.equal(set.refusal?.code, 'VALUE_MALFORMED');
  assert.match(set.refusal?.fix ?? '', /3,879/u);
  /* AND THE CEILING ITSELF IS A CAP AN OWNER MAY SAVE, and anything under it. */
  assert.ok((engine.configure({ ask_cap: 3_879 }, OWNER) as Refused).ok);
  assert.equal((engine.configure({ ask_cap: 3_880 }, OWNER) as Refused).ok, false);
  done();
});

test('S1 (2) A CAP ALREADY STORED ABOVE THE CEILING DOES NOT LET AN ASK THROUGH: ten asks run, the eleventh is refused before the binding', async () => {
  const ai = fakeAi(PREDICATE);
  const { own, engine, done } = await withEngine(ai, TEN_ASKS);
  /* WRITTEN AS A RECORD SAVED BEFORE THIS REPAIR HOLDS IT, past the door that now refuses it. */
  own.exec('UPDATE settings SET ask_cap = 1000000000 WHERE singleton = 1');
  let answered = 0;
  for (let i = 0; i < 12; i++) if (((await engine.read(`open tasks ${i}`, OWNER)) as Refused).ok) answered++;
  /* RED: 12 and 12, the ceiling was the owner's number. */
  assert.equal(ai.runs(), 10, `${ai.runs()} included calls ran under a ceiling of ten`);
  assert.equal(answered, 10);
  const last = (await engine.read('one more', OWNER)) as Refused;
  assert.equal(last.refusal?.code, 'SLASH_BUDGET_SPENT');
  assert.match(last.refusal?.fix ?? '', /2026-10-01/u);
  /* AND `status` SAYS THE CAP THAT BINDS, not the billion. */
  assert.equal((engine.status() as Status).asks.cap, 10);
  done();
});

test("S1 (3) AN AUTOMATION'S QUESTION IS HELD UNDER THE SAME CEILING, in the run's own sentence", async () => {
  const clock = fixedClock(T0);
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const ai = fakeAi('{"answer":4.25}');
  const answer = workerSlashAnswers(prod(ai, '464'), () => api, { sql: own, clock })!;
  const codes: string[] = [];
  for (let i = 0; i < 3; i++) {
    const out = (await answer(ASK)) as Refused;
    codes.push(out.ok ? 'ok' : (out.refusal?.code ?? '?'));
    if (!out.ok) assert.match(out.refusal?.fix ?? '', /^rule\.rate asked Slash at step 1/u);
  }
  /* RED: three `ok` and three runs. */
  assert.deepEqual(codes, ['ok', 'ok', 'SLASH_BUDGET_SPENT']);
  assert.equal(ai.runs(), 2);
  sql.close();
  own.close();
});

test('S1 (4) THE VAR IS READ WHOLE OR NOT AT ALL: 0 turns the included model off, and a value that is not a count is the default', async () => {
  const off = fakeAi(PREDICATE);
  const zero = await withEngine(off, '0');
  assert.equal(((await zero.engine.read('open tasks', OWNER)) as Refused).refusal?.code, 'SLASH_BUDGET_SPENT');
  assert.equal(off.runs(), 0);
  zero.done();
  /* A TYPO IS NOT "NO CEILING": `lots`, `-5` and `1e9x` each leave the default, which a save one past it shows. */
  for (const bad of ['lots', '-5', '1e9x', '']) {
    const { engine, done } = await withEngine(fakeAi(PREDICATE), bad);
    assert.equal((engine.configure({ ask_cap: 3_880 }, OWNER) as Refused).ok, false, `SLASH_INCLUDED_MONTH_NEURONS=${JSON.stringify(bad)} lifted the ceiling`);
    done();
  }
});

test('S1 (5) BOTH ENVIRONMENTS DECLARE THE CEILING, at the default the Worker falls back on', async () => {
  const checker = '../scripts/provision-check.mjs' as string;
  const { stripJsonc } = (await import(checker)) as { stripJsonc: (text: string) => string };
  const config = JSON.parse(stripJsonc(readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8'))) as {
    env: Record<string, { vars?: Record<string, unknown> }>;
  };
  for (const name of ['alpha', 'production'])
    assert.equal(config.env[name]?.vars?.['SLASH_INCLUDED_MONTH_NEURONS'], '900000', `env.${name} does not declare the ceiling`);
});

/* THE RENAME (DIRECTION 31) CARRIES THE VALUES, NOT ONLY THE NAMES. `src/slash.ts` reads `SLASH_INCLUDED` and
   `SLASH_INCLUDED_MONTH_NEURONS`, so an environment still declaring the old names deploys with the included model off,
   silently: his "yes" of 24 September stops holding without an error anywhere. The model's vars are found by their
   suffixes rather than by the old prefix, so this file holds no name the product no longer has.
   RED BEFORE THE RENAME, MEASURED ON 25 SEPTEMBER: 10 tests, 9 pass, this one failing on `env.alpha` with the three
   model vars under the old prefix and none under `SLASH_`. */
test('S1 (5b) BOTH ENVIRONMENTS DECLARE THE INCLUDED MODEL UNDER SLASH_ NAMES ALONE, still on and still at 900000', async () => {
  const checker = '../scripts/provision-check.mjs' as string;
  const { stripJsonc } = (await import(checker)) as { stripJsonc: (text: string) => string };
  const config = JSON.parse(stripJsonc(readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8'))) as {
    env: Record<string, { vars?: Record<string, unknown> }>;
  };
  for (const name of ['alpha', 'production']) {
    const vars = config.env[name]?.vars ?? {};
    assert.deepEqual(
      Object.keys(vars).filter((k) => /^[A-Z]+_(ENDPOINT|INCLUDED|INCLUDED_MONTH_NEURONS|MODEL|KEY)$/.test(k)).sort(),
      ['SLASH_ENDPOINT', 'SLASH_INCLUDED', 'SLASH_INCLUDED_MONTH_NEURONS'],
      `env.${name} declares the model under another name`,
    );
    assert.equal(vars['SLASH_INCLUDED'], 'yes', `env.${name} turned the included model off`);
    assert.equal(vars['SLASH_INCLUDED_MONTH_NEURONS'], '900000', `env.${name} moved the ceiling`);
  }
});

test('S3 (6) TIER byo ON THE INCLUDED MODEL IS PRICED, because it runs on the operator account', async () => {
  const ai = fakeAi(PREDICATE);
  const { own, engine, done } = await withEngine(ai);
  assert.ok((engine.configure({ tier: 'byo', model: 'glm-5.3-flash' }, OWNER) as Refused).ok);
  assert.ok(((await engine.read('open tasks', OWNER)) as Refused).ok);
  assert.equal(ai.runs(), 1);
  const rows = own.all<{ tier: string; neurons: number }>('SELECT tier, neurons FROM call').map((r) => ({ ...r }));
  /* RED: `neurons: 0`. 700 in and 60 out is 12.3. */
  assert.deepEqual(rows, [{ tier: 'byo', neurons: 12 }]);
  done();
});

test('S1 (7) AN OWNER WHO LOWERS THE CAP STILL LOWERS IT: at ask_cap 3 the fourth read is refused', async () => {
  const ai = fakeAi(PREDICATE);
  const { engine, done } = await withEngine(ai);
  assert.ok((engine.configure({ ask_cap: 3 }, OWNER) as Refused).ok);
  for (let i = 0; i < 4; i++) await engine.read(`open tasks ${i}`, OWNER);
  assert.equal(ai.runs(), 3);
  done();
});

/* ADDED BY THE CHECKER, AND RED BEFORE ITS REPAIR: `{ used: 2, cap: 10 }` with every ask refused. Where the ceiling is the
   cap `status` names, the count under it has to be the ceiling's too: the package counts tier `a` and the guard `b` and
   `byo`, so an owner who moved from `a` to `byo` in the month was shown 2 of 10 used by a host refusing the ninth ask. */
test('S1 (9) WHERE THE CEILING IS THE CAP STATUS NAMES, THE COUNT IS THE CEILING\'S, across a tier moved mid-month', async () => {
  const ai = fakeAi(PREDICATE);
  const { own, engine, done } = await withEngine(ai, TEN_ASKS);
  own.exec('UPDATE settings SET ask_cap = 1000000000 WHERE singleton = 1');
  for (let i = 0; i < 8; i++) await engine.read(`open tasks ${i}`, OWNER);
  assert.ok((engine.configure({ tier: 'byo', model: 'glm-5.3-flash' }, OWNER) as Refused).ok);
  own.exec('UPDATE settings SET ask_cap = 1000000000 WHERE singleton = 1');
  for (let i = 0; i < 3; i++) await engine.read(`more tasks ${i}`, OWNER);
  assert.equal(ai.runs(), 10);
  const { asks } = engine.status() as Status;
  assert.deepEqual({ used: asks.used, cap: asks.cap }, { used: 10, cap: 10 }, 'status did not say the asks the ceiling refuses on');
  done();
});

test('S4 (8) ONE BINDING THROW, ONE SETTLEMENT: the read and the answer both keep the model, are priced by one rule and are counted', async () => {
  const ai = fakeAi('', true);
  const { clock, api, own, engine, done } = await withEngine(ai);
  await engine.read('open tasks', OWNER);
  const own2 = openSqlite();
  const answer = workerSlashAnswers(prod(ai), () => api, { sql: own2, clock })!;
  const out = (await answer(ASK)) as Refused;
  /* STILL `UNREACHABLE`, SO THE LADDER MAY ASK AGAIN, and each rung is now an ask the caps see. */
  assert.equal(out.refusal?.code, 'UNREACHABLE');
  type Row = { model: string; tokens_in: number; tokens_out: number; neurons: number; code: string | null };
  const sel = 'SELECT model, tokens_in, tokens_out, neurons, code FROM call';
  for (const [path, rows, sql] of [
    ['read', own.all<Row>(sel), own],
    ['answer', own2.all<Row>(sel), own2],
  ] as const) {
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    /* RED ON THE ANSWER: `{ model: '-', neurons: 0 }`. */
    assert.equal(row.model, 'glm-5.3-flash', `the ${path} row was settled under ${row.model}`);
    assert.equal(row.code, 'UNREACHABLE');
    assert.equal(row.tokens_out, 0);
    assert.equal(row.neurons, Math.round((row.tokens_in * 13_636) / 1e6), `the ${path} row was priced off the rule`);
    const counted = sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM call WHERE tier = 'a' AND model <> '-'")!.n;
    assert.equal(counted, 1, `the ${path} row is not an ask any count reads`);
  }
  assert.equal((engine.status() as Status).asks.used, 1);
  own2.close();
  done();
});
