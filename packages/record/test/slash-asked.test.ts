/**
 * Slash builds figures, and hears a description (`loop/research-dynamic-layouts.md` §6 brief D2, `loop/DIRECTION.md` §28).
 *
 * TWO DOORS WERE SHUT AT `6eda2f46`, AND THIS FILE IS WHAT WAS SEEN THROUGH EACH BEFORE IT OPENED.
 *
 * A METRIC WAS DROPPED. A page that opens on "1 of 2 steps are done" needs a figure to say, and `BUILDS` held a register, an
 * ingest, a rule and a page, so a model that drafted the figure with the page had it dropped in Slash's own words:
 * "Proposal 1 was a change to a metric, and Slash changes only a register, an ingest, a rule or a page." The page that
 * would have said it could be filed, and it answered nothing where the figure should be.
 *
 * THE OWNER COULD NOT SAY WHAT THEY WANTED. `draft` was handed how the record is used and nothing the owner typed:
 * `slashPropose({ asked })` was refused `ARGS_UNKNOWN` by the record's `stray` check, and a model reading `input.asked` was
 * a type error (`SlashModelInput` had no such key). A young record, the one most likely to want a page built, never
 * reached the model at all, because the press waits a fortnight before it reads habits.
 *
 * AND THE NEW PATH SPENDS WHAT THE OLD ONE SPENDS. A description is the owner asking, so it reaches the model on a record
 * of any age, the way `slashForm` does; that is exactly why it must be held and settled like every other press. The last
 * cases drive it at a cap of nothing, through a fake meter and then through the package's own ledger.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, SLASH_ASKED_MOST, type CallContext, type CatalogueEntry, type CatalogueOffer, type SlashHeld, type SlashMeter, type SlashModel, type SlashModelInput } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { slashRecordMeter } from '../../host/src/slash-ask.ts';
import { SLASH_INSTRUCTIONS } from '../../host/src/slash.ts';
import { createSlash } from '../../slash/src/index.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Filed = { by: string; filed: { id: string; question: string; by: string }[]; skipped: { question: string; why: string }[]; dropped: string[] };

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

/** The figure a sentence says: how many tasks are done. */
const DONE_STEPS = {
  id: 'metric.done-steps',
  kind: 'metric',
  body: {
    metric: 'done-steps',
    name: 'Done steps',
    source: 'register.tasks',
    where: 'state is done',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};

/** The page that says it, opening on a sentence written from the figure. */
const DESK = {
  id: 'page.desk',
  kind: 'page',
  body: {
    page: 'desk',
    title: 'Desk',
    nav: { section: 'Work', order: 10 },
    requires: ['register.tasks'],
    blocks: [
      { kind: 'note', span: 12, body: '{{done-steps}} of {{tasks.count}} steps are done.' },
      { kind: 'table', span: 12, source: 'register.tasks', empty: 'No steps yet.' },
    ],
  },
};

const DESCRIBED = 'A desk for my launch: a sentence saying how many steps are done, and the steps under it.';

/** A model that keeps what it was handed and answers `answer`. */
const listening = (answer: unknown) => {
  const heard: SlashModelInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async (input) => {
      heard.push(input);
      return answer;
    },
  };
  return { heard, model };
};

/** A meter the size of `cap`, as `slash-press-cap.test.ts` builds it, keeping every hold and how it was settled. */
const fakeMeter = (cap: number) => {
  const rows: { kind: string; state: 'held' | 'settled' | 'released'; usage?: { in: number; out: number }; code?: string | undefined }[] = [];
  const meter: SlashMeter = {
    hold: async (kind) => {
      if (rows.filter((r) => r.state !== 'released').length >= cap)
        return { ok: false, refusal: { code: 'SLASH_BUDGET_SPENT', fix: "This month's Slash asks are spent until 1 October." } };
      const row: (typeof rows)[number] = { kind, state: 'held' };
      rows.push(row);
      const held: SlashHeld = {
        settle: (outcome) => {
          row.state = 'settled';
          row.usage = outcome.usage;
          row.code = outcome.code;
        },
        release: () => {
          row.state = 'released';
        },
      };
      return { ok: true, value: held };
    },
  };
  return { rows, meter };
};

/**
 * A record with one open task and one done, `ageDays` old. With `growing`, five more tasks written on three separate days in
 * the last month, so the rules draft "Give Tasks a page of its own?" and there is something a description must not file.
 */
async function record(model: SlashModel, ageDays: number, slashMeter?: SlashMeter, growing = false) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock, slashModel: model, ...(slashMeter ? { slashMeter } : {}) });
  assert.ok((await api.kernel.install([TASKS])).ok);
  value(await api.create({ register: 'tasks', fields: { what: 'Sample the fit', state: 'open' } }, OWNER));
  value(await api.create({ register: 'tasks', fields: { what: 'Pick a name', state: 'done' } }, OWNER));
  if (growing)
    for (const [i, day] of [ageDays - 3, ageDays - 3, ageDays - 2, ageDays - 2, ageDays - 1].entries()) {
      clock.set(T0 + day * DAY);
      value(await api.create({ register: 'tasks', fields: { what: `Later step ${i}`, state: 'open' } }, OWNER));
    }
  clock.set(T0 + ageDays * DAY);
  return { sql, clock, api };
}

/* ── a figure, built ────────────────────────────────────────────────────── */

test('A MODEL THAT DRAFTS A FIGURE WITH THE PAGE THAT SAYS IT HAS BOTH FILED AS ONE CHANGE, and accepting it makes the sentence speak', async () => {
  const { model } = listening({
    drafts: [
      { question: 'Count the done steps?', body_kind: 'change', body: { to: DONE_STEPS } },
      { question: 'A desk that says how far along you are?', body_kind: 'change', body: { to: { declarations: [DONE_STEPS, DESK] } } },
    ],
  });
  const { api, sql } = await record(model, 20);
  const out = value<Filed>(await api.slashPropose({}, OWNER));
  assert.deepEqual(out.dropped, []);
  assert.deepEqual(out.filed.map((f) => [f.question, f.by]), [
    ['Count the done steps?', 'test model'],
    ['A desk that says how far along you are?', 'test model'],
  ]);
  const rows = sql.all<{ body_kind: string; opened_by: string; status: string }>('SELECT body_kind, opened_by, status FROM suggestion ORDER BY opened_at');
  assert.deepEqual(rows.map((r) => [r.body_kind, r.opened_by, r.status]), [['change', 'slash', 'open'], ['change', 'slash', 'open']]);

  /* NOTHING IS MADE BY ASKING: the figure is not declared until the owner accepts. */
  assert.equal(api.kernel.metricDecl('done-steps'), null);
  value(await api.decide({ id: out.filed[1]!.id, decide: { option: 'accept', reason: 'yes, that is the desk' } }, OWNER));
  const page = value<{ blocks: { kind: string; values?: Record<string, unknown>; refusals?: unknown[] }[] }>(await api.page({ slug: 'desk' }, OWNER));
  assert.deepEqual(page.blocks[0]!.values, { 'done-steps': 1, 'tasks.count': 2 }, JSON.stringify(page.blocks[0]));
  sql.close();
});

test('A THEME, A DIGEST OR A BLOCK IS STILL DROPPED, in the sentence that now names the metric among what Slash builds', async () => {
  const { model } = listening({ drafts: [{ question: 'Change the theme?', body_kind: 'change', body: { to: { id: 'theme.dark', kind: 'theme', body: {} } } }] });
  const { api, sql } = await record(model, 20);
  const out = value<Filed>(await api.slashPropose({}, OWNER));
  assert.ok(
    out.dropped.includes('Proposal 1 was a change to a theme, and Slash changes only a register, an ingest, a rule, a metric or a page.'),
    JSON.stringify(out.dropped),
  );
  sql.close();
});

test('WHAT THE MODEL IS TOLD NAMES A METRIC AMONG WHAT A CHANGE BUILDS, and says what to do with a description', () => {
  /* ONE LINE READS THE CHANGE KINDS, AND BOTH HOSTS SEND IT: `endpointModel` here and the Worker's included model
     (`apps/worker/src/slash.ts`) ask with this same text. */
  const said = SLASH_INSTRUCTIONS.split('\n');
  const change = said.find((l) => l.startsWith('change builds'));
  assert.ok(change?.includes('one register, ingest, rule, metric or page'), change);
  assert.ok(change?.includes('grammar/metric'), change);
  const asked = said.find((l) => l.includes('`asked`'));
  assert.ok(asked, 'nothing in the instructions reads `asked`');
  for (const word of ['change', 'grammar/register', 'grammar/page', 'grammar/rule', '{"declarations":[...]}']) assert.ok(asked.includes(word), `${word} is not in: ${asked}`);
  assert.ok(!SLASH_INSTRUCTIONS.includes('—'), 'an em dash in what the model is told');
});

/* ── a description, heard ───────────────────────────────────────────────── */

test('WHAT THE OWNER TYPED REACHES THE MODEL AS `asked`, on a record two days old that the press alone leaves to the rules', async () => {
  const { heard, model } = listening({ drafts: [{ question: 'A desk that says how far along you are?', body_kind: 'change', body: { to: { declarations: [DONE_STEPS, DESK] } } }] });
  const { api, sql } = await record(model, 2);

  /* THE CONTROL: a plain press on a young record asks no model, as it always has. */
  const pressed = value<Filed>(await api.slashPropose({}, OWNER));
  assert.equal(heard.length, 0);
  assert.equal(pressed.by, 'rules');

  const out = value<Filed>(await api.slashPropose({ asked: `  ${DESCRIBED}  ` }, OWNER));
  assert.equal(heard.length, 1);
  assert.equal(heard[0]!.asked, DESCRIBED, 'the description is handed on trimmed, and whole');
  assert.ok(heard[0]!.kinds.includes('change'));
  assert.equal(out.by, 'test model');
  assert.deepEqual(out.filed.map((f) => f.question), ['A desk that says how far along you are?']);
  sql.close();
});

test('A DESCRIPTION FILES ONLY WHAT THE MODEL DRAFTED FROM IT: a model that fails leaves Decide as it was, where a plain press falls to the rules', async () => {
  const failing: SlashModel = { name: 'test model', draft: async () => { throw new Error('upstream 503'); } };
  const { api, sql } = await record(failing, 20, undefined, true);
  const described = value<Filed>(await api.slashPropose({ asked: DESCRIBED }, OWNER));
  assert.deepEqual(described.filed, []);
  assert.deepEqual(described.dropped, ['The model did not answer, so nothing was drafted from what you described.']);

  /* THE CONTROL: the same record, pressed plainly, files the rules' page for the growing list. */
  const pressed = value<Filed>(await api.slashPropose({}, OWNER));
  assert.equal(pressed.by, 'rules');
  assert.ok(pressed.filed.some((f) => f.question.startsWith('Give Tasks a page of its own?')), JSON.stringify(pressed));
  sql.close();
});

/**
 * THE CATALOGUE'S UPDATE AND A USE CASE'S GROWTH ARE THE OTHER TWO THINGS A PRESS FILES, and the case above cannot see
 * them: it hands the record neither a catalogue nor offers. With both guards in `slashFile` deleted, every case in this
 * file still passed (a load hook rewrote `described === undefined` out of each, on 25 September), so a description could
 * have filed "Update Bookshelf" and "Add Jobs" in the slots it was pressed for with nothing here going red.
 */
test('A DESCRIPTION FILES NEITHER A CATALOGUE UPDATE NOR A USE CASE GROWING, which the same record pressed plainly files both of', async () => {
  const BOOKS = { register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
  const shelf = (version: string) => ({ pack: 'bookshelf', version, summary: 'Books.', author: 'Halden', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, declarations: [BOOKS] });
  const small = (pack: string, declarations: unknown[]) => ({ pack, version: '1.0.0', summary: pack, author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, declarations });
  const count = (metric: string, where: string) => ({ metric, name: metric, source: 'register.stages', where, value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' });
  const STAGES = { register: 'stages', name: 'Stages', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'state', type: 'enum', values: ['open', 'reached'] }] };
  const GROW = 'The idea stage is done. Add Jobs so it can be run?';
  const catalogue: CatalogueEntry[] = [
    { id: 'jobs', kind: 'pack', title: 'Jobs', summary: 'Jobs.', modules: [], version: '1.0.0', doc: () => small('jobs', [{ register: 'jobs', name: 'Jobs', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }]) },
    {
      id: 'usecase-trial',
      kind: 'usecase',
      title: 'Trial',
      summary: 'Stages.',
      modules: [],
      version: '1.0.0',
      doc: () => small('usecase-trial', [STAGES, count('left', 'state is not reached'), count('reached', 'state is reached')]),
      grows: { when: [{ metric: 'left', is: 0 }, { metric: 'reached', gt: 0 }], install: ['jobs'], question: GROW, why: 'Every stage is reached.' },
    },
  ];
  const offers: CatalogueOffer[] = [
    { id: 'bookshelf', title: 'Bookshelf', from: '1.0.0', to: '1.1.0', body: { install: 'bookshelf', doc: shelf('1.1.0') }, signedBy: '0123456789abcdef', installedSignedBy: null, rotated: false, hostsAdded: [], removed: [], changesKnown: true },
  ];
  const { model } = listening({ drafts: [] });
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(T0), slashModel: model, catalogue, catalogueOffers: async () => offers });
  for (const body of [{ install: 'bookshelf', doc: shelf('1.0.0') }, { install: 'usecase-trial' }]) {
    const put = value<{ id: string }>(await api.propose({ question: `Install ${body.install}?`, body_kind: 'pack', body }, OWNER));
    value(await api.decide({ id: put.id, decide: { option: 'accept', reason: 'yes' } } as never, OWNER));
  }
  value(await api.create({ register: 'stages', fields: { what: 'Say what it is', state: 'reached' } }, OWNER));

  const described = value<Filed>(await api.slashPropose({ asked: DESCRIBED }, OWNER));
  assert.deepEqual(described.filed, [], JSON.stringify(described.filed));

  /* THE CONTROL: the same record, pressed plainly, files both, so the description above had them to file and did not. */
  const pressed = value<Filed>(await api.slashPropose({}, OWNER));
  assert.ok(pressed.filed.some((f) => f.question === GROW), JSON.stringify(pressed.filed));
  assert.ok(pressed.filed.some((f) => /^Update Bookshelf from 1\.0\.0 to 1\.1\.0\?/u.test(f.question)), JSON.stringify(pressed.filed));
  sql.close();
});

test('WITH NO MODEL, A DESCRIPTION IS SAID TO NEED ONE, and nothing is filed in its name', async () => {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  value(await api.create({ register: 'tasks', fields: { what: 'Sample the fit', state: 'open' } }, OWNER));
  clock.set(T0 + 20 * DAY);
  const out = value<Filed>(await api.slashPropose({ asked: DESCRIBED }, OWNER));
  assert.deepEqual(out.filed, []);
  assert.deepEqual(out.dropped, ['Slash builds from a description only with a model, and this BrainDog has none set up, so nothing was drafted from it.']);
  sql.close();
});

test('A DESCRIPTION IS TEXT OF A SENTENCE OR A FEW, refused by name when it is not', async () => {
  const { heard, model } = listening({ drafts: [] });
  const { api, sql } = await record(model, 20);
  for (const asked of [42, '   ', 'x'.repeat(SLASH_ASKED_MOST + 1)]) {
    const out = (await api.slashPropose({ asked } as never, OWNER)) as Out;
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED', JSON.stringify(out));
    assert.equal(out.refusal?.at, 'asked');
  }
  assert.equal(heard.length, 0, 'a refused description reached the model');
  value(await api.slashPropose({ asked: 'x'.repeat(SLASH_ASKED_MOST) }, OWNER));
  assert.equal(heard.length, 1);
  sql.close();
});

/* ── the spend ──────────────────────────────────────────────────────────── */

test('AT A CAP OF NOTHING A DESCRIPTION REACHES NO MODEL, on a young record and an old one, and is told why', async () => {
  for (const age of [2, 20]) {
    const { heard, model } = listening({ drafts: [] });
    const { rows, meter } = fakeMeter(0);
    const { api, sql } = await record(model, age, meter);
    const outs: Filed[] = [];
    for (let i = 0; i < 5; i++) outs.push(value<Filed>(await api.slashPropose({ asked: DESCRIBED }, OWNER)));
    assert.equal(heard.length, 0, `at a cap of 0 five descriptions on a record ${age} days old made ${heard.length} model calls`);
    assert.deepEqual(rows, []);
    for (const out of outs) {
      assert.deepEqual(out.filed, []);
      assert.deepEqual(out.dropped, ["This month's Slash asks are spent until 1 October. Nothing was drafted from what you described."]);
    }
    sql.close();
  }
});

test('A DESCRIPTION IS HELD, SETTLED AND PRICED ON WHAT IT SENT: the words the owner typed are counted in', async () => {
  const short = fakeMeter(5);
  const a = await record(listening({ drafts: [] }).model, 20, short.meter);
  value(await a.api.slashPropose({ asked: 'A desk.' }, OWNER));
  a.sql.close();

  const long = fakeMeter(5);
  const b = await record(listening({ drafts: [] }).model, 20, long.meter);
  value(await b.api.slashPropose({ asked: 'A desk. '.repeat(100) }, OWNER));
  b.sql.close();

  assert.deepEqual(short.rows.map((r) => [r.kind, r.state, r.code]), [['draft', 'settled', undefined]]);
  assert.deepEqual(long.rows.map((r) => [r.kind, r.state, r.code]), [['draft', 'settled', undefined]]);
  /* 792 MORE BYTES TYPED, trimmed, is 264 more tokens at the record's bytes over three. */
  const more = long.rows[0]!.usage!.in - short.rows[0]!.usage!.in;
  assert.equal(more, 264, `a description 792 bytes longer was billed ${more} tokens more`);
});

test("THROUGH THE PACKAGE'S OWN LEDGER: at ask_cap 0 no description is asked, at 1 the first is asked and counted and the next four are not", async () => {
  for (const cap of [0, 1]) {
    const { heard, model } = listening({ drafts: [] });
    const own = openSqlite();
    const clock = fixedClock(T0 + 2 * DAY);
    const engine = createSlash({
      sql: own,
      clock,
      inference: { complete: async () => ({ text: '{}', usage: { in: 1, out: 1 } }) },
      record: new Proxy({}, { get: () => { throw new Error('the record was read by the package'); } }) as never,
    });
    value(engine.configure({ ask_cap: cap }, OWNER));
    const meter = slashRecordMeter({ sql: own, clock, engine: async () => engine, model: 'glm-5.3-flash', rate: { in: 13_636, out: 45_455 } });

    const { api, sql } = await record(model, 2, meter);
    const outs: Filed[] = [];
    for (let i = 0; i < 5; i++) outs.push(value<Filed>(await api.slashPropose({ asked: DESCRIBED }, OWNER)));
    assert.equal(heard.length, cap, `five descriptions at ask_cap ${cap} made ${heard.length} model calls`);
    assert.equal(engine.status().asks.used, cap);
    assert.deepEqual(own.all<{ status: string }>('SELECT status FROM call').map((r) => r.status), cap === 0 ? [] : ['ok']);
    for (const out of outs.slice(cap)) assert.ok(out.dropped.some((d) => d.endsWith('Nothing was drafted from what you described.')), JSON.stringify(out.dropped));
    sql.close();
    own.close();
  }
});
