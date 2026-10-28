/**
 * A look that fails on the Worker is seen: counted where the engine's readings count a failed background
 * ask, with the provider's words in Health, and nothing thrown out of the alarm. And the operator's second provider is
 * watched as the first is, so a 401 from it ends the walk and is asked once.
 *
 * BEFORE THIS, `slashLook` WROTE ONE CONSOLE LINE AND WENT ON: the record swallows a model that failed ("the rules
 * speak"), the meter settled the hold with no words, and a tick that threw left nothing at all, so a dead look was
 * invisible in Health. Every model here is a local function; nothing leaves the machine, and the keys are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { engineLedgerRead } from '@braindog/host';
import { createRecordApi, type CallContext } from '@braindog/record';
import { engineHealth } from '@braindog/slash';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { lookWords, slashLook, workerSlashEngine, workerSlashModel } from '../src/slash.ts';
import { workerSlashMeter } from '../src/slash-meter.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const T0 = Date.UTC(2026, 9, 15, 9);
const ADDRESS = 'https://gateway.ai.example.test/v1/acct-quill/braindog';
const LEAKED = 'sk-test-0123456789abcdef';

/** Workers AI's `run`, throwing the platform's own sentence, an address and a key in it as a provider may quote them. */
const failingAi = () => {
  const runs: string[] = [];
  return {
    runs,
    AI: {
      run: async (model: string) => {
        runs.push(model);
        throw new Error(`upstream 503 from ${ADDRESS}: the model is overloaded (key ${LEAKED})`);
      },
    },
  };
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'state', type: 'enum', values: ['open', 'done'] }], state: 'state', done: ['done'] } as never,
};

/** A page with a lead line over a figure, so the look has a page to compose and asks its model. */
const DESK = {
  id: 'page.desk',
  kind: 'page' as const,
  body: {
    page: 'desk',
    title: 'Launch desk',
    nav: { section: 'Work', order: 10 },
    requires: ['register.tasks'],
    blocks: [
      { kind: 'note', lead: true, span: 12, body: '{{tasks.count}} step(s) in all.' },
      { kind: 'table', heading: 'Open', span: 12, source: 'register.tasks', where: 'state is open' },
    ],
  } as never,
};

type Reading = { purpose: string; asked: { day: number }; answered: number; last_error: { at: string; code: string } | null };

test('A THROWN MODEL COUNTS ONE FAILED LOOK, with the provider\'s words and no address or key, and nothing escapes', async () => {
  const ai = failingAi();
  const env = { AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' };
  const sql = openSqlite();
  const own = openSqlite();
  const clock = fixedClock(T0);
  let api!: Awaited<ReturnType<typeof createRecordApi>>;
  const slashModel = workerSlashModel(env, () => api, { store: () => own });
  assert.ok(slashModel);
  api = await createRecordApi({
    sql,
    clock,
    slashModel,
    slashMeter: workerSlashMeter(env, () => api, { sql: own, clock }),
    engineLedger: engineLedgerRead({ sql: own }),
  });
  assert.ok((await api.kernel.install([TASKS, DESK])).ok);
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Cut the pattern', state: 'open' } }, OWNER)).ok);
  clock.advance(20 * 86_400_000);
  try {
    /* NO STORE HANDED: the one the record's model noted on its ask is the ledger the failure is written in. */
    await assert.doesNotReject(slashLook(api, { clock }));
    assert.ok(ai.runs.length >= 1, 'the look never asked its model');
    const readings = (await api.engineReadings({}, OWNER)) as { ok: boolean; value: { asks: Reading[] } | null };
    assert.ok(readings.ok && readings.value);
    /* THE PAGES' LOOKS ARE THE ASK A YOUNG RECORD'S LOOK MAKES (its drafts wait two weeks), under `headline`, the purpose
       the meter writes them with: one ask, failed, and nothing else counted for it. */
    assert.deepEqual(readings.value.asks.map((a) => a.purpose), ['headline'], JSON.stringify(readings.value.asks));
    const look = readings.value.asks[0]!;
    assert.equal(look.asked.day, 1, 'the failed look was not counted once');
    assert.equal(look.answered, 0);
    assert.equal(look.last_error?.code, 'UNREACHABLE');
    /* HEALTH SAYS WHY, in the provider's words, under the look's own sentence. */
    const health = engineHealth(own, clock, { model: true });
    assert.match(health.lastWords ?? '', /^Today's look failed: /u);
    assert.match(health.lastWords ?? '', /upstream 503 from \[cut\]: the model is overloaded/u);
    assert.doesNotMatch(health.lastWords ?? '', /gateway\.ai\.example\.test|acct-quill/u, 'an address reached Health');
    assert.doesNotMatch(JSON.stringify(own.all('SELECT * FROM slash_call')), new RegExp(LEAKED, 'u'), 'a key reached the ledger');
  } finally {
    sql.close();
    own.close();
  }
});

/**
 * A record on a Durable Object just woken: Slash's ledger made and holding a failed look from last week, and a model
 * whose store nothing has noted yet, as on the first alarm after an eviction.
 */
async function woken(run: (model: string) => Promise<unknown>) {
  const env = { AI: { run }, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' };
  const sql = openSqlite();
  const own = openSqlite();
  const clock = fixedClock(T0);
  let api!: Awaited<ReturnType<typeof createRecordApi>>;
  assert.ok(await workerSlashEngine(env, () => api, { sql: own, clock }));
  own.exec(
    `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, purpose, spends)
     VALUES ('old-look', ?, 'read', 'a', 'glm-5.3-flash', 0, 0, 0, 0, 'error', 'UNREACHABLE', 'an old look', 'headline', 'background')`,
    new Date(T0 - 7 * 86_400_000).toISOString(),
  );
  const slashModel = workerSlashModel(env, () => api, { store: () => own });
  assert.ok(slashModel);
  api = await createRecordApi({ sql, clock, slashModel, slashMeter: workerSlashMeter(env, () => api, { sql: own, clock }) });
  assert.ok((await api.kernel.install([TASKS, DESK])).ok);
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Cut the pattern', state: 'open' } }, OWNER)).ok);
  clock.advance(20 * 86_400_000);
  const rows = () => own.all<{ id: string; purpose: string; code: string; raw: string | null }>('SELECT id, purpose, code, raw FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));
  return { api, own, clock, rows, close: () => (sql.close(), own.close()) };
}

test("A WOKEN OBJECT'S FIRST LOOK GIVES ITS WORDS TO ITS OWN ROWS, never to a failed look from last week", async () => {
  const at = await woken(failingAi().AI.run);
  try {
    await assert.doesNotReject(slashLook(at.api, { clock: at.clock }));
    const rows = at.rows();
    assert.equal(rows.find((r) => r.id === 'old-look')?.raw, null, "last week's look was given today's words");
    const today = rows.filter((r) => r.id !== 'old-look');
    assert.equal(today.length, 1, JSON.stringify(rows));
    assert.match(today[0]!.raw ?? '', /^Today's look failed: upstream 503/u);
  } finally {
    at.close();
  }
});

test('AN ANSWER THE SCHEMA REFUSED IS COUNTED ONCE, as the meter wrote it, and no failed look is added beside it', async () => {
  const reply = { choices: [{ message: { role: 'assistant', content: '{"nothing":true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 5 } };
  const at = await woken(async () => reply);
  /* LAST WEEK'S FAILED LOOK IS TAKEN OUT, so nothing failed is left for the words to go to. */
  at.own.exec("DELETE FROM slash_call WHERE id = 'old-look'");
  try {
    await assert.doesNotReject(slashLook(at.api, { clock: at.clock }));
    const rows = at.rows();
    assert.ok(rows.length >= 1, 'the look never asked its model');
    assert.ok(rows.every((r) => r.purpose !== 'look'), JSON.stringify(rows));
    assert.ok(rows.every((r) => r.code === 'PROPOSAL_SCHEMA'), JSON.stringify(rows));
  } finally {
    at.close();
  }
});

test('A TICK THAT THROWS IS ONE FAILED LOOK A DAY, its newest words kept, and with no ledger it is the log line alone', async () => {
  const own = openSqlite();
  const clock = fixedClock(T0);
  const env = { AI: failingAi().AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' };
  const record = await createRecordApi({ sql: openSqlite(), clock });
  /* THE ENGINE IS BUILT ONCE, as the Worker's first ask builds it, so Slash's ledger exists. */
  assert.ok(await workerSlashEngine(env, () => record, { sql: own, clock }));
  let said = 'the storage was reset at 10.0.0.7:8443';
  const broken = { slashTick: async (): Promise<never> => Promise.reject(new Error(said)) };
  try {
    await assert.doesNotReject(slashLook(broken, { sql: own, clock }));
    clock.advance(60_000);
    said = 'the storage was reset again';
    await assert.doesNotReject(slashLook(broken, { sql: own, clock }));
    const rows = own.all<{ purpose: string; status: string; code: string; spends: string; raw: string }>(
      "SELECT purpose, status, code, spends, raw FROM slash_call WHERE purpose = 'look'",
    );
    assert.deepEqual(
      rows.map((r) => ({ ...r })),
      [{ purpose: 'look', status: 'error', code: 'UNREACHABLE', spends: 'none', raw: "Today's look failed: the storage was reset again" }],
    );
    /* NO LEDGER AT ALL: nothing to write in, and still nothing escapes. */
    await assert.doesNotReject(slashLook(broken));
    await assert.doesNotReject(slashLook(broken, { sql: openSqlite(), clock }));
  } finally {
    own.close();
  }
});

test('THE WORDS ARE FOR A PERSON: every address cut, a key cut, and no dash used as punctuation', () => {
  const words = lookWords(`refused by ${ADDRESS} — bearer ${LEAKED} at 192.168.1.20:443 and api.provider.example`);
  assert.doesNotMatch(words, /example|192\.168|sk-test|—/u, words);
  assert.match(words, /^refused by \[cut\], bearer \[cut\]/u);
});

/* ── the operator's second provider, watched as the first is ──────────────────────────────────────────────────────── */

const FALLBACK_KEY = 'fallback-key-for-this-test-only';
const FALLBACK = {
  SLASH_FALLBACK_URL: 'https://models.example.test/v1',
  SLASH_FALLBACK_MODEL: 'second-chat-model',
  SLASH_FALLBACK_PROVIDER: 'openai',
  SLASH_FALLBACK_KEY: FALLBACK_KEY,
};

test("THE SECOND PROVIDER'S 401 IS ASKED ONCE: the walk reads it off its own wire, ends the run, and no rung asks again", async () => {
  const ai = failingAi();
  const sent: string[] = [];
  const send = async (input: URL): Promise<Response> => {
    sent.push(String(input));
    return new Response(JSON.stringify({ error: { message: 'Incorrect API key provided.' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  };
  const clock = fixedClock(T0);
  const own = openSqlite();
  const record = await createRecordApi({ sql: openSqlite(), clock });
  try {
    const engine = await workerSlashEngine({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes', ...FALLBACK }, () => record, { sql: own, clock, send });
    assert.ok(engine);
    const out = await engine.answer({ rule: 'r_quote', step: 0, question: 'Is the quote ready to send?', shape: 'text' });
    assert.equal(ai.runs.length, 1, 'the included model was asked once');
    assert.equal(sent.length, 1, 'the second provider was asked more than once');
    /* A STATUS NO RETRY MENDS, read off the provider's own wire: never `UNREACHABLE`, which the ladder asks again. */
    assert.equal(out.ok, false);
    assert.equal((out as { refusal: { code: string } }).refusal.code, 'PULL_REQUEST_REFUSED', JSON.stringify(out));
    const rows = own.all<{ candidate: string | null; code: string | null }>("SELECT candidate, code FROM slash_call WHERE kind = 'read' ORDER BY rowid");
    assert.equal(rows.at(-1)?.candidate, 'provider');
    assert.doesNotMatch(JSON.stringify(own.all('SELECT * FROM slash_call')), new RegExp(FALLBACK_KEY, 'u'), 'the key reached the ledger');
  } finally {
    own.close();
  }
});
