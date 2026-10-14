/**
 * Slash's press and its first plan, held to the same monthly cap and settled in the same ledger as every other ask.
 *
 * WHAT WAS MEASURED BEFORE THIS FILE. A record 20 days old over the Worker's own included model: 25 presses made 25
 * model calls, and nothing anywhere counted them. `slashFile` asked `model.draft` whenever a model was configured, and
 * `slashForm` asked `model.form` again after every answer it could not file, and neither wrote a `call` row or read
 * `ask_cap`. Each draft is up to 2,048 tokens out on the operator's account.
 *
 * THE LAST CASE IS THE WHOLE PATH, with the host's meter (`packages/host/src/slash-ask.ts` `slashRecordMeter`) over the package's own
 * ledger, so "the same cap" is measured against the engine's `status()` and its own refusal of a read, not a fake's count.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUseCase, useCasePack } from '@braindog/declare';

import { createRecordApi, type CallContext, type CatalogueEntry, type SlashHeld, type SlashMeter, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { slashRecordMeter } from '../../host/src/slash-ask.ts';
import { createSlash } from '../../slash/src/index.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Filed = { by: string; filed: { id: string }[]; dropped: string[] };

/** The measured record: one list, one open row, and the clock moved past Slash's first fortnight. */
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

/** A model that counts what it is asked and answers `answer` to both asks. */
const counting = (answer: unknown) => {
  const asked: string[] = [];
  const model: SlashModel = {
    name: 'included',
    draft: async () => (asked.push('draft'), answer),
    form: async () => (asked.push('form'), answer),
  };
  return { asked, model };
};

/**
 * A meter the size of `cap`, keeping every hold it grants and what each was settled with. It refuses in the sentence the
 * host's meter writes, so the case below can hold the record to passing it on.
 */
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

async function pressRecord(model: SlashModel, slashMeter?: SlashMeter) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock, slashModel: model, ...(slashMeter ? { slashMeter } : {}) });
  assert.ok((await api.kernel.install([TASKS])).ok);
  value(await api.create({ register: 'tasks', fields: { what: 'Invoice Acme', state: 'open' } }, OWNER));
  /* THE OWNER'S OWN USE ON FIVE DAYS, so Slash advises a record past its fortnight (HD.410). */
  for (const [i, day] of [3, 5, 7, 9].entries()) {
    clock.set(T0 + day * DAY);
    value(api.kernel.update('tasks', 'tasks#1', { what: i % 2 === 0 ? 'Invoice Acme.' : 'Invoice Acme' }, { actor: 'p_owner', version: i + 1 }));
  }
  clock.set(T0 + 20 * DAY);
  return { sql, clock, api };
}

test('A PRESS IS HELD BEFORE THE MODEL IS ASKED: 25 presses at a cap of 3 are 3 model calls, each settled with what it cost', async () => {
  const { asked, model } = counting({ drafts: [] });
  const { rows, meter } = fakeMeter(3);
  const { sql, api } = await pressRecord(model, meter);
  const outs: Filed[] = [];
  for (let i = 0; i < 25; i++) outs.push(value<Filed>(await api.slashPropose({}, OWNER)));
  assert.equal(asked.length, 3, `25 presses at a cap of 3 made ${asked.length} model calls`);
  assert.deepEqual(rows.map((r) => [r.kind, r.state]), [['draft', 'settled'], ['draft', 'settled'], ['draft', 'settled']]);
  /* PRICED ON WHAT WAS SENT AND WHAT CAME BACK, never nothing: the reading the model is handed is not free. */
  assert.ok(rows.every((r) => (r.usage?.in ?? 0) > 0 && (r.usage?.out ?? 0) > 0 && r.code === undefined), JSON.stringify(rows));
  /* THE PRESS STILL ANSWERS once the month is spent: the rules draft, and the owner is told why the model did not. */
  const last = outs.at(-1)!;
  assert.equal(last.by, 'rules');
  assert.ok(last.dropped.includes("This month's Slash asks are spent until 1 October. Slash's own rules drafted these."), JSON.stringify(last.dropped));
  sql.close();
});

test('A MODEL THAT THREW IS SETTLED AND COUNTED; ONE THAT WAS NEVER SENT IS RELEASED', async () => {
  const unreached: SlashModel = { name: 'included', draft: async () => { throw new Error('InferenceUpstreamError: 3043'); } };
  const a = fakeMeter(5);
  const one = await pressRecord(unreached, a.meter);
  value(await one.api.slashPropose({}, OWNER));
  assert.deepEqual(a.rows.map((r) => [r.state, r.code, r.usage!.in > 0, r.usage!.out]), [['settled', 'UNREACHABLE', true, 0]]);
  one.sql.close();

  /* THE HOST'S OWN MARK FOR A CALL THAT NEVER LEFT (`apps/worker/src/slash.ts` `NotSent`, the package's `sent: false`). */
  const unsent: SlashModel = { name: 'included', draft: async () => { throw Object.assign(new Error('over the ceiling'), { sent: false }); } };
  const b = fakeMeter(5);
  const two = await pressRecord(unsent, b.meter);
  value(await two.api.slashPropose({}, OWNER));
  assert.deepEqual(b.rows.map((r) => r.state), ['released']);
  two.sql.close();

  /* AND ONE THAT ANSWERED WHAT THE HOST COULD NOT READ (`@braindog/host/slash` `SlashAnsweredError`) keeps the host's count. */
  const unreadable: SlashModel = { name: 'included', draft: async () => { throw Object.assign(new Error('not JSON'), { answered: true, usage: { in: 700, out: 60 } }); } };
  const c = fakeMeter(5);
  const three = await pressRecord(unreadable, c.meter);
  value(await three.api.slashPropose({}, OWNER));
  assert.deepEqual(c.rows.map((r) => [r.state, r.code, r.usage]), [['settled', 'PROPOSAL_SCHEMA', { in: 700, out: 60 }]]);
  three.sql.close();
});

/* ── the first plan ─────────────────────────────────────────────────────── */

const manifest = (pack: string) => ({ pack, version: '1.0.0', summary: `${pack}.`, author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} } });
const STUDY = (() => {
  const u = normaliseUseCase({
    usecase: 'study',
    version: '1.0.0',
    title: 'Study',
    summary: 'Study.',
    author: 'BrainDog',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    signals: ['study'],
    modules: [],
    voice: { home: 'Study' },
    pack: {
      ...manifest('usecase-study'),
      declarations: [
        { register: 'courses', name: 'Courses', title: 'what', pack: 'usecase-study', fields: [{ id: 'what', type: 'text', required: true }] },
        { page: 'study', title: 'Study', nav: { section: 'Study', order: 10 }, requires: ['register.courses'], blocks: [{ kind: 'table', source: 'register.courses', span: 12, empty: 'Nothing yet.' }] },
      ],
    },
  });
  assert.ok(u.ok);
  return useCasePack(u.value)!;
})();
const STUDY_ENTRY: CatalogueEntry = {
  id: 'usecase-study',
  kind: 'usecase',
  title: 'Study',
  summary: 'Study.',
  modules: [],
  doc: () => STUDY,
  forms: { what: 'the courses of a study plan', question: 'Start your study plan with these courses?', why: 'You said what you are studying.', lists: [{ register: 'courses', least: 1, most: 3, fields: { what: { text: 80, required: true } } }] },
};

test('A FIRST PLAN IS HELD TOO: an answer that forms nothing is asked again only while the month has asks left', async () => {
  const { asked, model } = counting('Here is your plan!');
  const { rows, meter } = fakeMeter(2);
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(T0), catalogue: [STUDY_ENTRY], slashModel: model, slashMeter: meter });
  const put = value<{ id: string }>(await api.propose({ question: 'Set up?', body_kind: 'pack', body: { install: 'usecase-study' } }, OWNER));
  value(await api.decide({ id: put.id, decide: { option: 'accept', reason: 'yes' } }, OWNER));

  const whys: string[] = [];
  for (let i = 0; i < 5; i++) whys.push(value<{ formed: boolean; why: string }>(await api.slashForm({ usecase: 'study', said: 'I am learning Spanish.' }, OWNER)).why);
  assert.equal(asked.length, 2, `five plans at a cap of 2 made ${asked.length} model calls`);
  assert.deepEqual(whys, ['invalid', 'invalid', 'spent', 'spent', 'spent']);
  assert.deepEqual(rows.map((r) => [r.kind, r.state]), [['form', 'settled'], ['form', 'settled']]);
  const detail = value<{ detail?: string }>(await api.slashForm({ usecase: 'study', said: 'I am learning Spanish.' }, OWNER)).detail;
  assert.equal(detail, "This month's Slash asks are spent until 1 October.");
  sql.close();
});

/* ── the whole path: the host's meter over the package's own ledger ─────── */

test('THE SAME CAP AND THE SAME LEDGER AS A READ: presses spend the month, are priced, and a read after them is refused', async () => {
  const { asked, model } = counting({ drafts: [] });
  const own = openSqlite();
  const clock = fixedClock(T0 + 20 * DAY);
  let reads = 0;
  const engine = createSlash({
    sql: own,
    clock,
    inference: { complete: async () => (reads++, { text: '{}', usage: { in: 1, out: 1 } }) },
    record: new Proxy({}, { get: () => { throw new Error('the record was read after the cap was spent'); } }) as never,
  });
  value(engine.configure({ ask_cap: 3 }, OWNER));
  /* THE INCLUDED MODEL'S ROUTING NAME AND ITS RATE (`packages/slash/src/prompts.ts` `MODELS`), as the Worker would pass them. */
  const meter = slashRecordMeter({ sql: own, clock, engine: async () => engine, model: 'glm-5.3-flash', rate: { in: 13_636, out: 45_455 } });

  const { sql, api } = await pressRecord(model, meter);
  for (let i = 0; i < 25; i++) value(await api.slashPropose({}, OWNER));

  assert.equal(asked.length, 3, `25 presses at ask_cap 3 made ${asked.length} included calls`);
  assert.equal(engine.status().asks.used, 3, 'the presses were not counted where every other ask is');
  const rows = own.all<{ kind: string; tier: string; model: string; tokens_in: number; tokens_out: number; neurons: number; status: string; code: string | null }>(
    "SELECT kind, tier, model, tokens_in, tokens_out, neurons, status, code FROM slash_call WHERE model <> '-' ORDER BY id",
  );
  assert.equal(rows.length, 3);
  /* AND THE TWENTY-TWO PRESSES PAST THE CAP, EACH ITS OWN TURNED-AWAY ROW UNDER `-` (model-sign-49). */
  assert.equal(own.one<{ n: number }>("SELECT COUNT(*) AS n FROM slash_call WHERE model = '-' AND status = 'refused' AND code = 'SLASH_BUDGET_SPENT'")?.n, 22);
  for (const r of rows) {
    assert.deepEqual([r.kind, r.tier, r.model, r.status, r.code], ['read', 'a', 'glm-5.3-flash', 'ok', null]);
    assert.equal(r.neurons, Math.round((r.tokens_in * 13_636) / 1e6 + (r.tokens_out * 45_455) / 1e6));
    assert.ok(r.tokens_in > 0 && r.tokens_out > 0);
  }

  /* AND THE READ THAT COMES AFTER IS THE PACKAGE'S OWN REFUSAL, before its model or the record is touched. */
  const read = (await engine.read('open tasks', OWNER)) as Out;
  assert.equal(read.refusal?.code, 'SLASH_BUDGET_SPENT');
  assert.equal(reads, 0);
  sql.close();
  own.close();
});
