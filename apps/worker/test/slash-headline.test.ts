/**
 * A page's whole look on the Worker, through the record's own step: the daily look (`slashLook`, the
 * record's `slashTick`) asks the included model for each page's line and how it is arranged, and what comes back is the
 * record's look.
 *
 * BEFORE THIS, THE CLOUD ASKED UNDER `LINES`, a schema that declared `lines` and nothing in them, so a model holding to it
 * had nowhere to put a lead, a hide or a next, and Today on brain.dog was never arranged as a self-host's is. And the
 * test here called `workerSlashModel` alone, so it passed while the record's step never asked. Now it goes through the
 * step on the meter the Worker hands the record (`slash-meter.ts`), so it cannot pass while the ask is off.
 *
 * The binding is a local function and the endpoint a test double; nothing leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLASH_BRIEF_INSTRUCTIONS, SLASH_COMPOSE_INSTRUCTIONS } from '@braindog/host/slash';
import { createRecordApi, HEADLINE_ANSWER_TOKENS, type CallContext, type HeadlineInput } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { LOOK, slashLook, workerSlashModel } from '../src/slash.ts';
import { workerSlashMeter } from '../src/slash-meter.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'state', type: 'enum', values: ['open', 'done'] }], state: 'state', done: ['done'] } as never,
};

/** A page with a lead line, what is finished, what is open and all of it. Open is not the first part, so naming it leads. */
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
      { kind: 'table', heading: 'Finished', span: 12, source: 'register.tasks', where: 'state is done' },
      { kind: 'table', heading: 'Open', span: 12, source: 'register.tasks', where: 'state is open' },
      { kind: 'table', heading: 'Every step', span: 12, source: 'register.tasks', columns: [{ field: 'what' }] },
    ],
  } as never,
};

type Asked = HeadlineInput['pages'][number];
type Drawn = { key?: string; kind: string; heading?: string; drawn?: boolean; said?: string };
type Run = { model: string; system: string; input: unknown; schema: unknown; maxTokens: unknown; effort: unknown };

/** The key the ask handed for the part under this heading. */
const keyOf = (p: Asked, heading: string): string => (p.blocks ?? []).find((b) => b.heading === heading)?.key ?? assert.fail(`${heading} was not handed`);

/**
 * Workers AI's `run`, answering by the instructions it was sent: the pages' looks by `look`, Today's cards with none, and
 * the daily look's drafts with none.
 */
const fakeAi = (look: (page: Asked) => unknown) => {
  const runs: Run[] = [];
  return {
    runs,
    AI: {
      run: async (model: string, inputs: Record<string, unknown>) => {
        const messages = inputs['messages'] as { role: string; content: string }[];
        const system = messages[0]!.content;
        const input = JSON.parse(messages[1]!.content) as unknown;
        const schema = (inputs['response_format'] as { json_schema?: { schema?: unknown } } | undefined)?.json_schema?.schema;
        runs.push({ model, system, input, schema, maxTokens: inputs['max_tokens'], effort: inputs['reasoning_effort'] });
        const answer =
          system === SLASH_COMPOSE_INSTRUCTIONS
            ? { lines: Object.fromEntries((input as HeadlineInput).pages.filter((p) => p.page === 'desk').map((p) => [p.page, look(p)])) }
            : system === SLASH_BRIEF_INSTRUCTIONS
              ? { cards: [] }
              : { drafts: [] };
        return { choices: [{ message: { role: 'assistant', content: JSON.stringify(answer) }, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 30 } };
      },
    },
  };
};

/** A record on the Worker's own model and meter, as `index.ts` builds it: Slash's ledger in its own store here. */
async function cloudRecord(env: Record<string, unknown>) {
  const sql = openSqlite();
  const own = openSqlite();
  const clock = fixedClock(T0);
  let api!: Awaited<ReturnType<typeof createRecordApi>>;
  const slashModel = workerSlashModel(env, () => api, { store: () => own });
  api = await createRecordApi({ sql, clock, ...(slashModel ? { slashModel } : {}), slashMeter: workerSlashMeter(env, () => api, { sql: own, clock }) });
  assert.ok((await api.kernel.install([TASKS, DESK])).ok);
  for (const what of ['Sample the fit', 'Press the seams']) value(await api.create({ register: 'tasks', fields: { what, state: 'done' } }, OWNER));
  value(await api.create({ register: 'tasks', fields: { what: 'Cut the pattern', state: 'open' } }, OWNER));
  clock.set(T0 + 20 * DAY);
  const looks = () => api.kernel.declarations().filter((d) => d.kind === 'look');
  const page = async () => value<{ blocks: Drawn[]; look?: { by?: string; lead?: string; hide?: string[] } }>(await api.page({ slug: 'desk' }, OWNER));
  const close = () => (sql.close(), own.close());
  return { api, own, looks, page, close };
}

const switchedOn = (ai: ReturnType<typeof fakeAi>) => ({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' });

test('THE DAILY LOOK ARRANGES A PAGE ON THE CLOUD: the compose answer\'s lead and part left out reach the record\'s look', async () => {
  let lead = '';
  let hidden = '';
  const ai = fakeAi((p) => {
    lead = keyOf(p, 'Open');
    hidden = keyOf(p, 'Every step');
    return { headline: `{{${p.figures[0]!.id}}} steps on the desk, and the pattern is next to cut.`, lead, hide: [hidden] };
  });
  const { api, own, looks, page, close } = await cloudRecord(switchedOn(ai));
  try {
    await slashLook(api, { sql: own });
    /* ASKED UNDER THE COMPOSE INSTRUCTIONS AND THE LOOK'S OWN SCHEMA, once, on the included model. */
    const composed = ai.runs.filter((r) => r.system === SLASH_COMPOSE_INSTRUCTIONS);
    assert.equal(composed.length, 1, 'the record\'s step never asked for the pages\' looks');
    assert.equal(composed[0]!.model, '@cf/zai-org/glm-5.3-flash');
    assert.deepEqual(composed[0]!.schema, LOOK, 'the look was not asked under its own schema');
    /* WITH ROOM FOR THE ANSWER THE RECORD SIZED THE ASK TO AND AS MUCH AGAIN FOR THE MODEL'S THINKING, which it was told to
       keep low: on 23 October the ask's thinking at its default and an answer for every page ran its 2,048 out. */
    assert.ok(Number(composed[0]!.maxTokens) >= 2 * HEADLINE_ANSWER_TOKENS, `the ask's ceiling was ${String(composed[0]!.maxTokens)}`);
    assert.equal(composed[0]!.effort, 'low');
    assert.ok((composed[0]!.input as HeadlineInput).pages.some((p) => p.page === 'desk'), 'the desk was not handed');
    /* AND WHAT IT ANSWERED IS THE RECORD'S LOOK, written by Slash. */
    assert.equal(looks().length, 1, 'no look was written from the answer');
    const body = JSON.parse(looks()[0]!.body as unknown as string) as { by: string; lead?: string; hide?: string[] };
    assert.equal(body.by, 'slash');
    assert.equal(body.lead, lead);
    assert.deepEqual(body.hide, [hidden]);
    const read = await page();
    assert.equal(read.look?.by, 'slash');
    assert.equal(read.blocks.find((b) => b.heading === 'Every step')?.drawn, false, 'the part left out was drawn');
    assert.equal(read.blocks.filter((b) => b.kind !== 'note' && b.drawn !== false)[0]?.heading, 'Open', 'Open does not lead');
    assert.equal(read.blocks.find((b) => b.kind === 'note')?.said, '3 steps on the desk, and the pattern is next to cut.');
    /* ON THE BACKGROUND'S MONTH, through the meter: the pages' looks are one answered ask, never one of his. */
    const rows = own.all<{ purpose: string; status: string; spends: string }>("SELECT purpose, status, spends FROM slash_call WHERE purpose = 'headline' ORDER BY rowid");
    assert.ok(rows.some((r) => r.status === 'ok' && r.spends === 'background'), JSON.stringify(rows));
  } finally {
    close();
  }
});

test('THE SCHEMA SAYS EVERY PART THE RECORD READS, and nothing it does not', () => {
  const page = (LOOK as { properties: { lines: { additionalProperties: { anyOf: { type: string; properties?: Record<string, unknown> }[] } } } }).properties.lines.additionalProperties.anyOf;
  assert.deepEqual(page.map((p) => p.type), ['string', 'object'], 'a page is a bare line or its whole look');
  assert.deepEqual(Object.keys(page[1]!.properties ?? {}).sort(), ['group', 'headline', 'hide', 'lead', 'next', 'order']);
  assert.deepEqual((LOOK as { required: string[] }).required, ['lines']);
});

test('WITH THE INCLUDED MODEL OFF THE STEP ASKS NOTHING: no run, no look, and the page keeps its rules', async () => {
  const ai = fakeAi(() => assert.fail('a page was asked about with no model'));
  const { api, own, looks, page, close } = await cloudRecord({ AI: ai.AI, AI_GATEWAY: 'braindog' });
  try {
    await slashLook(api, { sql: own });
    assert.equal(ai.runs.length, 0);
    assert.equal(looks().length, 0);
    assert.equal((await page()).look?.by === 'slash', false);
  } finally {
    close();
  }
});

/* ── his own key, asked directly: the same instructions on his provider's wire ─────────────────────────────────── */

const FAKE_KEK = '0'.repeat(64);
const GRANT = 'g_his';
const HIS_TOKEN = 'provider-token-for-this-test';
const BASE = 'https://gateway.example.test/v1';
const INPUT: HeadlineInput = {
  today: '2026-10-02',
  pages: [{ page: 'money', title: 'Money', rules: 'Two bills are due this week.', figures: [{ id: 'bills-due', value: '2', change: '+1' }] }],
};
const LINES = '{"lines":{"money":"{{bills-due}} bills are due this week."}}';
const hisKeychain = () => ({ kernel: { grants: () => [{ id: GRANT, label: 'model provider', kind: 'api_token', revoked_at: null }] } }) as never;

/** Slash's own store, set to his key. */
const hisStore = () => {
  const store = openSqlite();
  store.exec('CREATE TABLE slash_settings (singleton INTEGER PRIMARY KEY, tier TEXT, model TEXT, grant_id TEXT, ask_cap INTEGER, updated_at TEXT)');
  store.exec('CREATE TABLE slash_meta (key TEXT PRIMARY KEY, value TEXT)');
  store.exec("INSERT INTO slash_settings VALUES (1, 'b', 'his-model', ?, 80, '2026-10-01T09:00:00.000Z')", GRANT);
  store.exec("INSERT INTO slash_meta VALUES ('own.provider', 'openai'), ('own.base_url', ?)", BASE);
  return store;
};

test('HIS OWN KEY IS TOLD THE COMPOSE INSTRUCTIONS TOO, and a model to ask is never the included one there', async () => {
  const ai = fakeAi(() => null);
  const store = hisStore();
  const sent: string[] = [];
  const model = workerSlashModel({ ...switchedOn(ai), KEK: FAKE_KEK }, hisKeychain, {
    store: () => store,
    send: async (_url, init) => {
      sent.push((JSON.parse(String(init.body)) as { messages: { content: string }[] }).messages[0]!.content);
      return new Response(JSON.stringify({ choices: [{ message: { content: LINES } }] }), { status: 200 });
    },
    open: () => async () => HIS_TOKEN,
  });
  assert.deepEqual(await model!.headline!(INPUT), JSON.parse(LINES));
  assert.deepEqual(sent, [SLASH_COMPOSE_INSTRUCTIONS]);
  assert.equal(ai.runs.length, 0, 'the included model wrote a look for a record set to its own key');
  store.close();
});
