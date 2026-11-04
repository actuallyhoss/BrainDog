/**
 * Slash drafts from a description, tries each draft with `previewChange`, and hands what the record refused back to be
 * mended.
 *
 * BEFORE THIS, ONE ASK WITH NO GRAMMAR IN IT, AND WHATEVER PASSED `fromModel` WAS FILED. A page naming a block kind the
 * record has not got reached Decide and was found wrong when the owner accepted it, and the model was told to write in
 * grammars nothing sent it. These cases hold the path that replaced it: the grammars in the input, every draft drawn
 * before it is filed, at most `SLASH_REPAIRS_MOST` repair asks after the first, each one held and settled like any ask,
 * and `slashDraft`, which answers the same drafts and files nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, SAMPLE_ROWS_MOST, SLASH_REPAIRS_MOST, type CallContext, type SlashHeld, type SlashMeter, type SlashModel, type SlashModelInput } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

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
type Drafted = {
  by: string;
  drafts: { question: string; change: { to: { id: string } }; rows: Record<string, Record<string, unknown>[]>; preview: { pages: { id: string; blocks: { rows?: { fields: Record<string, unknown> }[] }[] }[] } }[];
  dropped: string[];
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};

/** A desk whose one block is a kind no record draws: the lint refuses it, and `previewChange` answers that refusal. */
const WRONG = { id: 'page.desk', kind: 'page', body: { page: 'desk', title: 'Desk', requires: ['register.tasks'], blocks: [{ kind: 'nope', span: 12 }] } };
/** The same desk, mended. */
const RIGHT = {
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.tasks'], blocks: [{ kind: 'note', lead: true, span: 12, body: '{{tasks.count}} step(s) so far.' }, { kind: 'table', span: 12, source: 'register.tasks', empty: 'No steps yet.' }] },
};
const drafted = (to: unknown, rows?: unknown) => ({ drafts: [{ question: 'A desk for my launch?', body_kind: 'change', body: { to }, ...(rows === undefined ? {} : { rows }) }] });

/** A model that keeps what it was handed and answers with `answer(input)`. */
const listening = (answer: (input: SlashModelInput) => unknown) => {
  const heard: SlashModelInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async (input) => {
      heard.push(input);
      return answer(input);
    },
  };
  return { heard, model };
};

/** A meter with room for every ask, keeping how each was settled. */
const counting = () => {
  const rows: { kind: string; state: 'held' | 'settled' | 'released' }[] = [];
  const meter: SlashMeter = {
    hold: async (kind) => {
      const row: (typeof rows)[number] = { kind, state: 'held' };
      rows.push(row);
      const held: SlashHeld = { settle: () => void (row.state = 'settled'), release: () => void (row.state = 'released') };
      return { ok: true, value: held };
    },
  };
  return { rows, meter };
};

async function record(model?: SlashModel, slashMeter?: SlashMeter) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock, ...(model ? { slashModel: model } : {}), ...(slashMeter ? { slashMeter } : {}) });
  assert.ok((await api.kernel.install([TASKS])).ok);
  value(await api.create({ register: 'tasks', fields: { what: 'Sample the fit', state: 'open' } }, OWNER));
  clock.set(T0 + 20 * DAY);
  return { sql, api };
}

const suggestions = (sql: ReturnType<typeof openSqlite>): number => sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')?.n ?? 0;

test('A MODEL THAT ANSWERS ONE WRONG PAGE AND THEN ITS REPAIR FILES ONE PAGE THAT PREVIEWS CLEAN, in two asks both settled', async () => {
  const { heard, model } = listening((input) => drafted(input.repair === undefined ? WRONG : RIGHT));
  const { rows, meter } = counting();
  const { api, sql } = await record(model, meter);
  const out = value<Filed>(await api.slashPropose({ asked: 'A desk for my launch, with every step on it.' }, OWNER));

  assert.equal(heard.length, 2, `${heard.length} asks for one wrong page and its repair`);
  /* THE REPAIR CARRIES THE DRAFT AS IT WAS ANSWERED AND WHY IT WAS REFUSED, the path naming the declaration. */
  const repair = heard[1]!.repair;
  assert.ok(repair, 'the second ask carried no repair');
  assert.equal(repair.drafts.length, 1);
  assert.ok(repair.refusals.length > 0 && repair.refusals.every((r) => r.at.startsWith('page.desk')), JSON.stringify(repair.refusals));
  assert.deepEqual(out.filed.map((f) => [f.question, f.by]), [['A desk for my launch?', 'test model']]);
  assert.deepEqual(out.dropped, []);
  assert.deepEqual(rows.map((r) => [r.kind, r.state]), [['draft', 'settled'], ['draft', 'settled']]);
  sql.close();
});

test('A MODEL THAT STAYS WRONG FILES NOTHING AND SAYS WHY, after the first ask and every repair, and no more', async () => {
  const { heard, model } = listening(() => drafted(WRONG));
  const { rows, meter } = counting();
  const { api, sql } = await record(model, meter);
  const out = value<Filed>(await api.slashPropose({ asked: 'A desk for my launch.' }, OWNER));

  assert.equal(heard.length, 1 + SLASH_REPAIRS_MOST, `a press asked the model ${heard.length} times`);
  assert.equal(rows.length, 1 + SLASH_REPAIRS_MOST, 'an ask was not held in the ledger');
  assert.deepEqual(out.filed, []);
  assert.equal(suggestions(sql), 0);
  assert.ok(out.dropped.some((d) => d.startsWith('"A desk for my launch?" was dropped, because BrainDog refused it: ')), JSON.stringify(out.dropped));
  assert.ok(out.dropped.includes('The model proposed nothing Slash could use, so nothing was drafted from what you described.'), JSON.stringify(out.dropped));
  sql.close();
});

test('slashDraft ANSWERS THE DRAFTS WITH THEIR ROWS AND WHAT THEY DREW, and files and keeps nothing', async () => {
  const sample = Array.from({ length: SAMPLE_ROWS_MOST + 1 }, (_, i) => ({ what: `Sample ${i}`, state: 'open' }));
  const { heard, model } = listening(() => drafted(RIGHT, { tasks: sample, 'no such list!': [{ what: 'x' }] }));
  const { api, sql } = await record(model);
  const out = value<Drafted>(await api.slashDraft({ asked: '  A desk for my launch.  ' }, OWNER));

  /* THE GRAMMARS A DESCRIPTION IS DRAFTED IN ARE IN WHAT THE MODEL IS SENT, beside the words, trimmed. */
  assert.equal(heard[0]!.asked, 'A desk for my launch.');
  assert.deepEqual(Object.keys(heard[0]!.grammar ?? {}).sort(), ['design', 'ingest', 'metric', 'page', 'register', 'rule']);
  assert.deepEqual(heard[0]!.kinds, ['change']);

  assert.equal(out.by, 'test model');
  assert.equal(out.drafts.length, 1);
  const [d] = out.drafts;
  assert.equal(d!.change.to.id, 'page.desk');
  /* AT MOST FIVE SAMPLE ROWS A LIST, and a list id no list could have is not carried at all. */
  assert.deepEqual(Object.keys(d!.rows), ['tasks']);
  assert.equal(d!.rows.tasks!.length, SAMPLE_ROWS_MOST);
  assert.equal(d!.preview.pages[0]?.id, 'page.desk');
  /* THE SECOND BLOCK, under the lead line a good page opens on. */
  const drawn = (d!.preview.pages[0]?.blocks[1]?.rows ?? []).map((r) => r.fields.what);
  assert.ok(drawn.includes('Sample 0'), `the preview did not draw the sample rows: ${JSON.stringify(drawn)}`);

  /* NOTHING FILED AND NOTHING KEPT: no question, no page, and the one row the record had. */
  assert.equal(suggestions(sql), 0);
  assert.equal(api.kernel.count('tasks'), 1);
  assert.equal(((await api.page({ slug: 'desk' }, OWNER)) as Out).ok, false, 'the drafted page was kept');
  sql.close();
});

test('A MODEL-MADE DRAFT PASSES THE DESIGN CHECK, mended when it painted its own colour, AND SAYS WHAT IT COST', async () => {
  const code = (colour: string) => `<p style="color:${colour}">x</p><script>braindog.on(function (d) { if (d.rows.length === 0) return; });</script>`;
  const page = (colour: string) => ({
    id: 'page.desk',
    kind: 'page',
    body: {
      page: 'desk',
      title: 'Desk',
      requires: ['register.tasks'],
      blocks: [
        { kind: 'note', lead: true, span: 12, body: '{{tasks.count}} step(s) so far.' },
        { kind: 'drawn', heading: 'Steps', span: 12, source: 'register.tasks', columns: [{ field: 'what' }], code: code(colour) },
      ],
    },
  });
  const { heard, model } = listening((input) => drafted(input.repair === undefined ? page('#ff0000') : page('var(--ink)')));
  const { api, sql } = await record(model);
  const out = value<Drafted & { cost?: { asks: number; said: string } }>(await api.slashDraft({ asked: 'A desk with a drawing of the steps.' }, OWNER));
  assert.equal(heard.length, 2, 'the colour was not handed back to be mended');
  assert.ok(heard[1]!.repair!.refusals.some((r) => /would not read in both light and dark/u.test(r.fix)), JSON.stringify(heard[1]!.repair!.refusals));
  assert.equal(out.drafts.length, 1);
  assert.equal(out.cost?.asks, 2);
  assert.equal(out.cost?.said, "This cost about 2 of the month's asks of the model.");
  sql.close();
});

test('slashDraft HANDS THE MODEL THE PAGE A DESCRIPTION IS ABOUT, and refuses one she cannot open before anything is asked', async () => {
  const { heard, model } = listening(() => ({ drafts: [] }));
  const { api, sql } = await record(model);
  assert.ok((await api.kernel.install([RIGHT] as never)).ok);

  value(await api.slashDraft({ asked: 'Put the open steps first.', page: 'desk' }, OWNER));
  assert.equal(heard[0]!.page?.id, 'page.desk');
  assert.equal((heard[0]!.page?.body as { page?: string }).page, 'desk');

  const nowhere = (await api.slashDraft({ asked: 'Put the open steps first.', page: 'nowhere' }, OWNER)) as Out;
  assert.equal(nowhere.refusal?.code, 'PAGE_UNKNOWN', JSON.stringify(nowhere));
  assert.equal(heard.length, 1, 'a page nobody can open reached the model');
  sql.close();
});

test('A PAGE THE RECORD HOLDS NONE OF YET IS DRAFTED FROM THE BODY THE SCREEN BUILT (Today, Decide), and a held one never is', async () => {
  const { heard, model } = listening(() => ({ drafts: [] }));
  const { api, sql } = await record(model);
  const built = { page: 'today', title: 'Today', blocks: [{ kind: 'note', span: 12, body: 'Morning.' }] };

  value(await api.slashDraft({ asked: 'Put what is late first.', page: 'home', body: built }, OWNER));
  assert.equal(heard[0]!.page?.id, 'page.home');
  assert.deepEqual(heard[0]!.page?.body, { ...built, page: 'home' }, 'the draft starts from the body built');
  assert.equal(((await api.page({ slug: 'home' }, OWNER)) as Out).ok, false, 'drafting kept a page');

  /* HELD, IT IS READ AS THE RECORD HOLDS IT, whatever body the screen sends. */
  assert.ok((await api.kernel.install([RIGHT] as never)).ok);
  value(await api.slashDraft({ asked: 'Put the open steps first.', page: 'desk', body: built }, OWNER));
  assert.equal((heard[1]!.page?.body as { title?: string }).title, 'Desk');

  const refusal = async (args: unknown) => ((await api.slashDraft(args as never, OWNER)) as Out).refusal;
  assert.equal((await refusal({ asked: 'A desk.', page: 'home', body: 'Today' }))?.at, 'body');
  assert.equal((await refusal({ asked: 'A desk.', body: built }))?.at, 'page');
  assert.equal(heard.length, 2, 'a refused body reached the model');
  sql.close();
});

test('A DRAFT OVER A BUILT BODY IS HELD ONLY TO WHAT IT MADE WORSE: Today greets with no figure, and adding a block to it is no fault', async () => {
  const built = { page: 'today', title: 'Today', requires: ['register.tasks'], blocks: [{ kind: 'note', lead: true, span: 12, body: 'Good morning.' }] };
  const table = { kind: 'table', span: 12, heading: 'Open steps', source: 'register.tasks', empty: 'No steps yet.' };
  const { model } = listening((input) => drafted({ id: 'page.home', kind: 'page', body: { ...(input.page!.body as object), blocks: [...built.blocks, table] } }));
  const { api, sql } = await record(model);
  const got = value<Drafted>(await api.slashDraft({ asked: 'Show my open steps.', page: 'home', body: built }, OWNER));
  assert.equal(got.drafts.length, 1, JSON.stringify(got.dropped));
  assert.equal(got.drafts[0]!.change.to.id, 'page.home');
  /* THE SAME DRAFT WITH NO BUILT BODY BEHIND IT is a new page, and opening on no figure is its own fault. */
  const bare = await record(listening(() => drafted({ id: 'page.fresh', kind: 'page', body: { ...built, page: 'fresh', blocks: [...built.blocks, table] } })).model);
  const none = value<Drafted>(await bare.api.slashDraft({ asked: 'Show my open steps.' }, OWNER));
  assert.equal(none.drafts.length, 0);
  assert.match(none.dropped.join(' '), /opens with one lead sentence/u);
  sql.close();
  bare.sql.close();
});

test('WHAT slashDraft TAKES IS HELD BEFORE ANY ASK: the words in characters, and nothing it does not take', async () => {
  const { heard, model } = listening(() => ({ drafts: [] }));
  const { api, sql } = await record(model);
  const refused = async (args: unknown): Promise<Out['refusal']> => ((await api.slashDraft(args as never, OWNER)) as Out).refusal;

  assert.equal((await refused({}))?.code, 'REQUIRED_MISSING');
  assert.equal((await refused({ asked: 'A desk.', about: 'desk' }))?.code, 'FIELD_UNKNOWN');
  assert.equal((await refused({ asked: 'A desk.', page: '' }))?.at, 'page');
  /* CHARACTERS ARE CODE POINTS: a thousand letters outside the first plane are two thousand UTF-16 units, and the bound
     is a thousand characters, so they are taken and one more is not. */
  const script = '\u{1D49C}';
  assert.equal((await refused({ asked: script.repeat(1001) }))?.code, 'VALUE_MALFORMED');
  assert.equal(heard.length, 0, 'a refused description reached the model');
  value(await api.slashDraft({ asked: script.repeat(1000) }, OWNER));
  value(await api.slashPropose({ asked: script.repeat(1000) }, OWNER));
  assert.equal(heard.length, 2);
  sql.close();
});

test('NOTHING IS ASKED WHERE NOTHING COULD BE TRIED: no model, or a record with no previewChange, each said in one sentence', async () => {
  const bare = await record();
  const none = value<Drafted>(await bare.api.slashDraft({ asked: 'A desk.' }, OWNER));
  assert.deepEqual(none.dropped, ['Slash builds from a description only with a model, and this BrainDog has none set up, so nothing was drafted from it.']);
  bare.sql.close();

  const { heard, model } = listening(() => drafted(RIGHT));
  const { api, sql } = await record(model);
  /* THE METHOD CALLED ON SOMETHING THAT IS NOT THE RECORD finds no `previewChange` on it, which is a record without one. */
  const out = value<Drafted>(await api.slashDraft.call({} as never, { asked: 'A desk.' }, OWNER));
  assert.equal(heard.length, 0, 'the model was asked for drafts nothing could try');
  assert.deepEqual(out.drafts, []);
  assert.equal(out.dropped.length, 1);
  assert.match(out.dropped[0]!, /cannot draw a change before it lands/u);
  sql.close();
});

test('TRY AGAIN ASKS THE SAME WORDS WITH THE DRAFT TURNED DOWN, answers another, drops the first if it comes back, and files nothing', async () => {
  /* ANOTHER DESK, the second way of drawing the same words: its steps as a board. */
  const OTHER = {
    id: 'page.desk',
    kind: 'page',
    body: { page: 'desk', title: 'Desk', requires: ['register.tasks'], blocks: [{ kind: 'note', lead: true, span: 12, body: '{{tasks.count}} step(s) so far.' }, { kind: 'board', span: 12, source: 'register.tasks', columns: [{ field: 'state' }, { field: 'what' }], empty: 'No steps yet.' }] },
  };
  /* A MODEL THAT ANSWERS THE SAME DESK FIRST, and once it is turned down, that desk again beside another. */
  const { heard, model } = listening((input) =>
    input.declined === undefined
      ? drafted(RIGHT)
      : { drafts: [{ question: 'A desk for my launch?', body_kind: 'change', body: { to: RIGHT } }, { question: 'A desk of my launch as a board?', body_kind: 'change', body: { to: OTHER } }] },
  );
  const { api, sql } = await record(model);
  const asked = 'A desk for my launch, with every step on it.';
  const first = value<Drafted>(await api.slashDraft({ asked }, OWNER));
  assert.equal(first.drafts.length, 1);
  const again = value<Drafted>(await api.slashDraft({ asked, not: first.drafts.map((d) => ({ question: d.question, change: d.change })) } as never, OWNER));

  /* THE SECOND ASK CARRIES WHAT WAS TURNED DOWN, as the model would answer it. */
  assert.equal(heard.length, 2);
  assert.deepEqual(heard[1]!.declined?.map((d) => d.question), ['A desk for my launch?']);
  assert.deepEqual(JSON.parse(JSON.stringify(heard[1]!.declined?.[0]?.body.to)), JSON.parse(JSON.stringify(first.drafts[0]!.change.to)));
  /* AND ANSWERS ONLY THE OTHER: the first, offered again, is left out with a sentence, never drawn. */
  assert.deepEqual(again.drafts.map((d) => d.question), ['A desk of my launch as a board?']);
  assert.notDeepEqual(again.drafts[0]!.change.to, first.drafts[0]!.change.to);
  assert.ok(again.dropped.includes('Proposal 1 was the draft you turned down again, so it was left out.'), JSON.stringify(again.dropped));
  /* NOTHING IS FILED, the first draft no more than the second. */
  assert.equal(suggestions(sql), 0);
  /* A NOT THAT IS NO LIST OF DRAFTS IS REFUSED BEFORE ANY ASK. */
  const bad = (await api.slashDraft({ asked, not: [{ question: 'x' }] } as never, OWNER)) as Out;
  assert.equal(bad.refusal?.at, 'not');
  assert.equal(heard.length, 2);
  sql.close();
});
