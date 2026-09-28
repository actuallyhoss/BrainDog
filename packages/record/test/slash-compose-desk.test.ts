/**
 * A launch desk described to Slash, drafted, refused, repaired and drawn before anybody is asked
 * (`loop/finish/pages.md` PGS-23 and C3, `loop/DIRECTION.md` §28's measure of done: the desk rebuilt by describing it).
 *
 * THE DESK IN `packs/launch-desk` WAS WRITTEN BY AN AGENT AS JSON AND FED BACK (`packages/mcp/test/compose-page.test.ts`),
 * so "by describing it" was never measured. Here the model is a stub whose answers are fixed, because what is measured is
 * the record's half: what it sends the model, which of the model's faults it catches before the owner sees anything, how
 * it hands them back, and what it files once the repair draws clean. Whether a real model writes this desk from a
 * sentence is the owner's own acceptance, a desk described to Slash on brain.dog (`pages.md` §5, item 3).
 *
 * THE FIRST ANSWER CARRIES TWO FAULTS A MODEL MAKES: a card's colour named by a field the list does not have (`colour`
 * where the parts carry `hue`), and a path filtered by a field no step has (`stage`). Both are refused on the blocks
 * that name them when the draft is drawn, so both go back in one repair, and the second answer mends both.
 *
 * THE COST IS DESCRIBED TOO, AS A SCRIPT ON A CLOCK. The pack adds a price check's costs with a script a rule starts on
 * each write (`packs/launch-desk/cost.js`), and a description may not build that: from a description Slash builds a
 * script that runs only on its clock (`describedScript` in `packages/record/src/slash.ts`), since a rule handing rows to
 * code is the shape the audit's finding 14 filed. So the described desk carries the same source under `runs.every`, and
 * its costs are added on that clock rather than the moment one is typed. The last case holds the rule-started form to
 * being dropped with the record's own sentence.
 *
 * Every row here is invented, for a small product launch in parts. Nothing names a person, a label or a place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createRecordApi, type CallContext, type SlashModel, type SlashModelInput } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const NOW = Date.UTC(2026, 8, 25, 12);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Block = { kind: string; heading?: string; refusals?: { code: string; fix: string }[]; rows?: { fields: Record<string, unknown> }[]; short_now?: boolean[] };
type Page = { id: string; title: string; about: string | null; blocks: Block[] };
type Drafted = {
  by: string;
  drafts: { question: string; change: { to: { declarations?: { id: string }[] } }; rows: Record<string, Record<string, unknown>[]>; preview: { pages: Page[] } }[];
  dropped: string[];
};
type Filed = { by: string; filed: { id: string; question: string; by: string }[]; skipped: { question: string; why: string }[]; dropped: string[] };

/** The pack's own cost script, which adds every check's costs when it is handed no row, as a run on a clock is. */
const COST = readFileSync(new URL('../../../packs/launch-desk/cost.js', import.meta.url), 'utf8');

/* ── the desk a model describes ─────────────────────────────────────────────────────────────────── */

const PARTS = {
  id: 'register.parts',
  kind: 'register',
  body: {
    id: 'parts',
    name: 'Parts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'what', type: 'text' },
      { id: 'big', type: 'bool' },
      { id: 'hue', type: 'int', min: 0, max: 359 },
      { id: 'picture', type: 'file' },
    ],
  },
};

const STEPS = {
  id: 'register.steps',
  kind: 'register',
  body: {
    id: 'steps',
    name: 'Steps',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'part', type: 'ref', to: 'parts' },
      { id: 'done', type: 'bool', default: false },
      { id: 'priority', type: 'enum', values: ['essential', 'should', 'nice'] },
      { id: 'rank', type: 'int' },
      { id: 'due', type: 'day' },
    ],
    steps: { of: 'part', done: 'done', order: 'rank' },
  },
};

const CHECKS = {
  id: 'register.checks',
  kind: 'register',
  body: {
    id: 'checks',
    name: 'Price check',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'price', type: 'decimal', min: 0 },
      { id: 'making', type: 'decimal', min: 0 },
      { id: 'packing', type: 'decimal', min: 0 },
      { id: 'sending', type: 'decimal', min: 0 },
      { id: 'cost', type: 'decimal' },
      { id: 'least', type: 'decimal' },
    ],
  },
};

/** The costs added up, on a clock: what a description may build (the header). `runs` is the one thing that differs. */
const costScript = (runs: Record<string, unknown>) => ({
  id: 'script.cost',
  kind: 'script',
  body: { script: 'cost', title: 'Add what making, packing and sending one cost', runs, egress: [], keys: [], reads: ['checks'], writes: ['checks'], source: COST },
});

/**
 * The Desk: the next move, the parts as cards in their own colours, and the open steps on the days they are due. `mended`
 * false is the model's first answer, with its two faults in the first two blocks.
 */
const desk = (mended: boolean) => ({
  id: 'page.desk',
  kind: 'page',
  body: {
    page: 'desk',
    title: 'Desk',
    nav: { section: 'Launch', order: 10, tabs: true },
    layout: { rail: 4 },
    requires: ['register.parts', 'register.steps'],
    blocks: [
      {
        kind: 'steps',
        span: 12,
        heading: 'Next move',
        source: 'register.steps',
        ...(mended ? {} : { where: 'stage is open' }),
        first: 1,
        columns: [{ field: 'what' }, { field: 'part' }],
        order: [{ field: 'rank', dir: 'asc' }],
        empty: 'No step is open.',
      },
      {
        kind: 'cards',
        span: 12,
        source: 'register.parts',
        lead: true,
        columns: [
          { field: 'name', as: 'title' },
          { field: 'what', as: 'next' },
          { field: mended ? 'hue' : 'colour', as: 'hue' },
          { field: 'picture', as: 'picture' },
        ],
        order: [{ field: 'seq', dir: 'asc' }],
        empty: 'No parts yet.',
      },
      {
        kind: 'calendar',
        span: 12,
        heading: 'Due',
        source: 'register.steps',
        where: 'done is not true',
        columns: [{ field: 'what' }, { field: 'due' }],
        back: 0,
        ahead: 2,
      },
    ],
  },
});

/** A page per part, its path with an essentials view. */
const PART = {
  id: 'page.part',
  kind: 'page',
  body: {
    page: 'part',
    title: '{{name}}',
    for: { register: 'parts' },
    nav: { section: 'Launch', order: 20, tabs: true },
    requires: ['register.parts', 'register.steps'],
    blocks: [
      { kind: 'note', body: '{{what}}' },
      {
        kind: 'steps',
        span: 12,
        heading: 'The path',
        source: 'register.steps',
        where: 'part is {{name}}',
        first: 5,
        short: { where: 'priority is essential', label: 'Essentials' },
        columns: [{ field: 'what' }, { field: 'priority' }],
        order: [{ field: 'rank', dir: 'asc' }],
        empty: 'No steps for this part yet.',
      },
    ],
  },
};

/** The price check, typed into and read back with the cost the script adds. */
const NUMBERS = {
  id: 'page.numbers',
  kind: 'page',
  body: {
    page: 'numbers',
    title: 'Numbers',
    nav: { section: 'Launch', order: 90, tabs: true },
    requires: ['register.checks'],
    blocks: [
      { kind: 'inputs', register: 'checks', heading: 'The price check', columns: [{ field: 'price' }, { field: 'making' }, { field: 'packing' }, { field: 'sending' }], row: 'checks#1' },
      { kind: 'table', span: 12, heading: 'What one costs', source: 'register.checks', columns: [{ field: 'what' }, { field: 'price' }, { field: 'cost' }] },
    ],
  },
};

/** The rows the model proposes so the preview draws something: two parts, their steps, and one price check. */
const ROWS = {
  parts: [
    { name: 'Product', what: 'The first piece', big: true, hue: 210 },
    { name: 'Box', what: 'What it ships in', hue: 30 },
  ],
  steps: [
    { what: 'Cut the pattern', part: 'parts#1', done: true, priority: 'essential', rank: 1, due: '2026-09-10' },
    { what: 'Sample the fit', part: 'parts#1', done: false, priority: 'essential', rank: 2, due: '2026-10-05' },
    { what: 'Box quote', part: 'parts#2', done: false, priority: 'should', rank: 3, due: '2026-10-12' },
  ],
  checks: [{ what: 'First price', price: 1000, making: 200, packing: 50, sending: 50 }],
};

const QUESTION = 'A launch desk, built as you described it?';

/**
 * The model's answer: the whole desk as one change, filed under the Desk's name, since a bundle filed under a list's
 * name may carry no other list (`govern.ts` `namesFault`).
 */
const answer = (mended: boolean, runs: Record<string, unknown> = { every: '1h' }) => ({
  drafts: [
    {
      question: QUESTION,
      body_kind: 'change',
      body: { declaration_id: 'page.desk', to: { declarations: [PARTS, STEPS, CHECKS, costScript(runs), desk(mended), PART, NUMBERS] } },
      rows: ROWS,
    },
  ],
});

const DESCRIBED =
  'A desk for launching a thing in parts: each part with its own colour and picture and its next step, a path of steps per part with the essential ones first, the open steps on a calendar by the day they are due, and a price check that adds what making, packing and sending one cost.';

/** A model that keeps what it was handed and answers the first ask with the faults and a repair with them mended. */
const stub = (first: () => unknown = () => answer(false)) => {
  const heard: SlashModelInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async (input) => {
      heard.push(input);
      return input.repair === undefined ? first() : answer(true);
    },
  };
  return { heard, model };
};

async function record(model: SlashModel) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), slashModel: model });
  return { sql, api };
}

const suggestions = (sql: ReturnType<typeof openSqlite>): number => sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')?.n ?? 0;

/* ── the tests ──────────────────────────────────────────────────────────────────────────────────── */

test('A DESCRIBED DESK WITH TWO FAULTS IS REFUSED ON BOTH, REPAIRED IN ONE ASK, AND DRAWN WHOLE BEFORE ANYTHING IS FILED', async () => {
  const { heard, model } = stub();
  const { sql, api } = await record(model);
  const out = value<Drafted>(await api.slashDraft({ asked: DESCRIBED }, OWNER));

  /* THE WORDS AND THE GRAMMARS THE DESK IS WRITTEN IN WENT TO THE MODEL, and one repair after the first answer. */
  assert.equal(heard.length, 2, `${heard.length} asks for one faulty desk and its repair`);
  assert.equal(heard[0]!.asked, DESCRIBED);
  for (const grammar of ['page', 'register', 'metric']) assert.ok(Object.hasOwn(heard[0]!.grammar ?? {}, grammar), `no ${grammar} grammar in the input`);

  /* BOTH FAULTS WENT BACK IN THE ONE REPAIR, each at the block of the Desk that made it, in the record's own sentence. */
  const repair = heard[1]!.repair;
  assert.ok(repair, 'the second ask carried no repair');
  assert.equal(repair.drafts.length, 1);
  const said = JSON.stringify(repair.refusals);
  assert.ok(repair.refusals.every((r) => r.at.startsWith('page.desk.blocks[')), said);
  assert.ok(repair.refusals.some((r) => r.at.startsWith('page.desk.blocks[0]') && /\bstage\b/u.test(r.fix)), `the path's where was not refused: ${said}`);
  assert.ok(repair.refusals.some((r) => r.at.startsWith('page.desk.blocks[1]') && /\bcolour\b/u.test(r.fix)), `the card's colour was not refused: ${said}`);

  /* ONE DRAFT, DRAWN CLEAN: every page of it, every block, over the model's rows. */
  assert.equal(out.by, 'test model');
  assert.deepEqual(out.dropped, []);
  assert.equal(out.drafts.length, 1);
  const [draft] = out.drafts;
  assert.deepEqual(
    (draft!.change.to.declarations ?? []).map((d) => d.id),
    ['register.parts', 'register.steps', 'register.checks', 'script.cost', 'page.desk', 'page.part', 'page.numbers'],
  );
  const pages = draft!.preview.pages;
  assert.deepEqual(pages.map((p) => p.id), ['page.desk', 'page.part', 'page.numbers']);
  for (const page of pages) page.blocks.forEach((b, i) => assert.deepEqual(b.refusals ?? [], [], `${page.id}.blocks[${i}] (${b.kind}) was refused`));

  /* WHAT THE REPAIR MENDED IS DRAWN: each part in its colour, and the open steps on their days, earliest first. */
  const [deskPage, partPage] = pages as [Page, Page, Page];
  const cards = deskPage.blocks.find((b) => b.kind === 'cards')!;
  assert.deepEqual((cards.rows ?? []).map((r) => [r.fields.name, r.fields.hue]), [
    ['Product', 210],
    ['Box', 30],
  ]);
  assert.deepEqual((deskPage.blocks.find((b) => b.kind === 'calendar')!.rows ?? []).map((r) => r.fields.what), ['Sample the fit', 'Box quote']);
  /* AND THE PAGE PER PART OVER THE FIRST PART, its essential step in the short view. */
  assert.deepEqual([partPage.title, partPage.about], ['Product', 'parts#1']);
  const path = partPage.blocks.find((b) => b.kind === 'steps')!;
  assert.deepEqual((path.rows ?? []).map((r) => r.fields.what), ['Sample the fit']);
  assert.deepEqual(path.short_now, [true]);

  /* NOTHING FILED AND NOTHING KEPT. */
  assert.equal(suggestions(sql), 0);
  assert.equal(api.kernel.declarations().some((d) => d.id === 'register.parts' || d.id === 'page.desk' || d.id === 'script.cost'), false, 'a draft was kept');
  sql.close();
});

test('THE SAME DESCRIPTION PRESSED TO FILE PUTS ONE REPAIRED CHANGE IN DECIDE, saying what its cost script does on its own', async () => {
  const { heard, model } = stub();
  const { sql, api } = await record(model);
  const out = value<Filed>(await api.slashPropose({ asked: DESCRIBED }, OWNER));

  assert.equal(heard.length, 2, `${heard.length} asks for one faulty desk and its repair`);
  assert.deepEqual(out.dropped, []);
  assert.equal(out.filed.length, 1, JSON.stringify(out));
  const [filed] = out.filed;
  assert.equal(filed!.by, 'test model');
  /* THE QUESTION IS THE MODEL'S, AND THE RECORD SAYS WHAT THE SCRIPT WILL DO: read and write the checks, on its clock. */
  assert.ok(filed!.question.startsWith(`${QUESTION} `), filed!.question);
  assert.match(filed!.question, /Accepting it lets the script "cost" read your list "checks".* write to your list "checks" every 1h on its own\./u);
  assert.equal(suggestions(sql), 1);
  /* FILED IS NOT INSTALLED: nothing of the desk is on the record until the owner accepts it in Decide. */
  assert.equal(api.kernel.declarations().some((d) => d.id === 'register.parts' || d.id === 'page.desk' || d.id === 'script.cost'), false, 'filing installed the desk');
  sql.close();
});

test('A DESCRIBED COST SCRIPT A RULE WOULD START, AS THE PACK HAS IT, IS DROPPED WITH THE SENTENCE THAT SAYS WHY, and nothing is tried', async () => {
  const { heard, model } = stub(() => answer(true, { rule: true }));
  const { sql, api } = await record(model);
  const out = value<Drafted>(await api.slashDraft({ asked: DESCRIBED }, OWNER));

  /* HELD BEFORE ANY PREVIEW, so no repair is asked for a draft the record will not take from a description. */
  assert.equal(heard.length, 1);
  assert.deepEqual(out.drafts, []);
  assert.ok(
    out.dropped.some((d) => d.includes('script.cost, which a door or a rule would start, and from a description Slash builds a script that runs only on its clock.')),
    JSON.stringify(out.dropped),
  );
  assert.equal(suggestions(sql), 0);
  sql.close();
});
