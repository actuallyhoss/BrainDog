/**
 * The headline line on each page, written by the model overnight, and the page quality bar a described page is repaired to.
 *
 * WHAT THESE HOLD. Once a day `slashTick` asks the model for one line a page, in ONE ask on the background allowance and
 * never one of the person's own; a page whose figures have not moved since its line is not asked about; a line is kept
 * only when it is short, says no number it was not handed and none of the system's words; and the page read carries it
 * on the lead note only while the figures still hold. The daily look's own draft is on the background allowance too, so
 * Free's asks are the person's alone. `calmFaults` is the bar `describe`'s repair loop mends a drafted page to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calmFaults, createRecordApi, headlineFault, HEADLINE_MOST, type CallContext, type HeadlineInput, type SlashHeld, type SlashMeter, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
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

const DONE_STEPS = {
  id: 'metric.done-steps',
  kind: 'metric' as const,
  body: { metric: 'done-steps', name: 'Done steps', source: 'register.tasks', where: 'state is done', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

/** A page in the rail opening on a lead line from two figures, and one with no lead note, which is never asked about. */
const DESK = {
  id: 'page.desk',
  kind: 'page' as const,
  body: {
    page: 'desk',
    title: 'Launch desk',
    nav: { section: 'Work', order: 10 },
    requires: ['register.tasks'],
    blocks: [
      { kind: 'note', lead: true, span: 12, body: '{{done-steps}} of {{tasks.count}} step(s) are done.' },
      { kind: 'table', span: 12, source: 'register.tasks', empty: 'No steps yet.' },
    ],
  } as never,
};
const PLAIN = {
  id: 'page.plain',
  kind: 'page' as const,
  body: { page: 'plain', title: 'Plain', nav: { section: 'Work', order: 20 }, requires: ['register.tasks'], blocks: [{ kind: 'table', span: 12, source: 'register.tasks', empty: 'None.' }] } as never,
};

/** A meter keeping which allowance each ask was held against. */
const meterOf = (opts: { background?: boolean } = {}) => {
  const rows: { kind: string; state: 'held' | 'settled' | 'released' }[] = [];
  const held = (kind: string): { ok: true; value: SlashHeld } => {
    const row: (typeof rows)[number] = { kind, state: 'held' };
    rows.push(row);
    return { ok: true, value: { settle: () => void (row.state = 'settled'), release: () => void (row.state = 'released') } };
  };
  const meter: SlashMeter = {
    hold: async (kind) => held(kind),
    ...(opts.background === false ? {} : { background: async (kind) => held(`background:${kind}`) }),
  };
  return { rows, meter };
};

/** A model that drafts nothing and answers each page `line(page)` as its headline, keeping what it was handed. */
const writing = (line: (page: HeadlineInput['pages'][number]) => string) => {
  const heard: HeadlineInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    headline: async (input) => {
      heard.push(input);
      return { lines: Object.fromEntries(input.pages.map((p) => [p.page, line(p)])) };
    },
  };
  return { heard, model };
};

async function record(model: SlashModel, slashMeter?: SlashMeter) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock, slashModel: model, ...(slashMeter ? { slashMeter } : {}) });
  assert.ok((await api.kernel.install([TASKS, DONE_STEPS, DESK, PLAIN])).ok);
  value(await api.create({ register: 'tasks', fields: { what: 'Sample the fit', state: 'open' } }, OWNER));
  value(await api.create({ register: 'tasks', fields: { what: 'Cut the pattern', state: 'done' } }, OWNER));
  clock.set(T0 + 20 * DAY);
  return { sql, clock, api };
}

type Block = { kind: string; body?: string; said?: string };
const lead = async (api: Awaited<ReturnType<typeof record>>['api']): Promise<Block> => value<{ blocks: Block[] }>(await api.page({ slug: 'desk' }, OWNER)).blocks[0]!;

test('THE NIGHT WRITES ONE LINE A PAGE IN ONE BACKGROUND ASK, the page read carries it while its figures hold, and a still page is not asked again', async () => {
  /* THE LINE IS WRITTEN FROM WHAT THE MODEL IS HANDED, so the night after a figure moves it says the new one. */
  const { heard, model } = writing((p) => `${p.figures[0]!.value} of ${p.figures[1]!.value} steps done; the fit is next.`);
  const { rows, meter } = meterOf();
  const { api, clock, sql } = await record(model, meter);

  const first = await api.slashTick();
  assert.ok(first.ran);
  /* ONE ASK, FOR THE ONE PAGE WITH A LEAD NOTE, handed its title, the rules' own line and each figure as it reads. */
  assert.equal(heard.length, 1);
  assert.equal(heard[0]!.pages.length, 1);
  const { blocks, rows: handed, ...desk } = heard[0]!.pages[0]!;
  assert.deepEqual(desk, {
    page: 'desk',
    title: 'Launch desk',
    rules: '1 of 2 steps are done.',
    figures: [
      { id: 'done-steps', value: '1' },
      { id: 'tasks.count', value: '2' },
    ],
  });
  /* AND WHAT ITS LOOK IS MADE OF, in the same ask (`compose-look.ts`): its blocks by key, the lead note first, and the
     rows it draws by handle beside the title a person reads. */
  assert.deepEqual(blocks?.map((b) => [b.kind, b.lead === true, typeof b.key]), [['note', true, 'string'], ['table', false, 'string']]);
  assert.deepEqual(handed, [
    { row: 'tasks#2', title: 'Cut the pattern' },
    { row: 'tasks#1', title: 'Sample the fit' },
  ]);
  /* BOTH THE LOOK'S DRAFT AND THE HEADLINES ARE THE BACKGROUND ALLOWANCE'S, each named, and not one of the person's asks
     was held. */
  assert.deepEqual(rows.map((r) => [r.kind, r.state]), [['background:look', 'settled'], ['background:headline', 'settled']]);

  const said = await lead(api);
  assert.equal(said.said, '1 of 2 steps done; the fit is next.');
  assert.deepEqual(api.kernel.prefsOf('slash')['headline.desk'], { text: '1 of 2 steps done; the fit is next.', day: '2026-09-21', basis: (api.kernel.prefsOf('slash')['headline.desk'] as { basis: string }).basis });
  assert.equal(value<{ blocks: Block[] }>(await api.page({ slug: 'plain' }, OWNER)).blocks.some((b) => 'said' in b), false);

  /* THE NEXT NIGHT, NOTHING MOVED: the look asks, the headlines do not. */
  clock.set(T0 + 21 * DAY);
  assert.ok((await api.slashTick()).ran);
  assert.equal(heard.length, 1, 'a page whose figures did not move was asked about again');

  /* A FIGURE MOVES: the line is no longer sent, the rules speak, and the next night writes a new one. */
  value(await api.create({ register: 'tasks', fields: { what: 'Box quote', state: 'open' } }, OWNER));
  assert.equal((await lead(api)).said, undefined, 'a line written from other figures was sent');
  clock.set(T0 + 22 * DAY);
  assert.ok((await api.slashTick()).ran);
  assert.equal(heard.length, 2);
  assert.equal(heard[0]!.pages[0]!.figures[1]!.value, '2');
  assert.equal(heard[1]!.pages[0]!.figures[1]!.value, '3');
  assert.equal((await lead(api)).said, '1 of 3 steps done; the fit is next.');
  sql.close();
});

test('A LINE IS KEPT ONLY WHEN IT IS SHORT, SAYS NO NUMBER IT WAS NOT HANDED, AND NAMES NONE OF THE SYSTEM’S WORDS', async () => {
  for (const [line, why] of [
    ['3 of 2 steps are done.', /said 3, which none of its figures holds/u],
    ['1 row of your list is done.', /system's words/u],
    ['x'.repeat(HEADLINE_MOST + 1), /longer than 140/u],
    ['Done: {{done-steps}}.', /not one plain sentence/u],
    ['**1** of 2 steps are done.', /not one plain sentence/u],
    ['One of three steps is done.', /said 3, which none of its figures holds/u],
  ] as const) {
    const { model } = writing(() => line);
    const { api, sql } = await record(model, meterOf().meter);
    const out = await api.slashTick();
    assert.ok(out.ran);
    assert.ok(out.dropped.some((d) => why.test(d) && d.endsWith('Its own line stands.')), JSON.stringify(out.dropped));
    assert.equal((await lead(api)).said, undefined);
    assert.equal(api.kernel.prefsOf('slash')['headline.desk'], undefined);
    sql.close();
  }
  /* AND THE NUMBERS ARE READ AS NUMBERS: a figure written with its grouping or its currency is the figure. */
  const page = { page: 'money', title: 'Money', rules: 'Cash is GBP 33,850.00.', figures: [{ id: 'cash-now', value: 'GBP 33,850.00', change: '+8%' }] };
  assert.equal(headlineFault('£33,850 in hand, up 8% on a month ago.', page), null);
  assert.match(headlineFault('£33,851 in hand.', page) ?? '', /said 33851/u);
  /* AND IN WORDS: a count written out is the count, and one the figures do not hold is refused as a digit is. */
  assert.equal(headlineFault('Eight percent up on a month ago.', page), null);
  assert.match(headlineFault('Up eight percent, two months running.', page) ?? '', /said 2/u);
});

test('A METER THAT CANNOT COUNT A BACKGROUND ASK SPENDS NONE OF HIS: the look falls to the rules and no headline is written', async () => {
  const { heard, model } = writing(() => 'One step of two is done.');
  const { rows, meter } = meterOf({ background: false });
  const { api, sql } = await record(model, meter);
  const out = await api.slashTick();
  assert.ok(out.ran);
  assert.equal(rows.length, 0, 'the look spent one of the person’s asks');
  assert.equal(heard.length, 0);
  assert.ok(out.by === 'rules');
  assert.ok(out.dropped.some((d) => /background allowance/u.test(d) && /rules drafted these/u.test(d)), JSON.stringify(out.dropped));
  assert.ok(out.dropped.some((d) => /No page's headline was written/u.test(d)), JSON.stringify(out.dropped));
  /* THE OWNER'S OWN PRESS IS STILL HIS ASK, held as it always was. */
  value(await api.slashPropose({}, OWNER));
  assert.deepEqual(rows.map((r) => r.kind), ['draft']);
  sql.close();
});

/* ── the page quality bar ───────────────────────────────────────────────── */

const page = (blocks: Record<string, unknown>[], was?: Record<string, unknown>[]) => ({ id: 'page.desk', blocks: blocks as never[], ...(was ? { was } : {}) });
const LEAD = { kind: 'note', lead: true, span: 12, body: '{{tasks.count}} step(s) so far.' };

test('A GOOD PAGE HAS NO CALM FAULT, and each way a page falls short is named at the block that does', () => {
  assert.deepEqual(calmFaults([page([LEAD, { kind: 'stat', span: 4, heading: 'Done', icon: 'check' }, { kind: 'table', span: 8, source: 'register.tasks', empty: 'None yet.' }])]), []);

  /* NO LEAD LINE, OR ONE WITH NO FIGURE IN IT. */
  for (const first of [{ kind: 'table', source: 'register.tasks', empty: 'x' }, { kind: 'note', lead: true, body: 'Welcome.' }, { kind: 'note', body: '{{tasks.count}}' }])
    assert.deepEqual(calmFaults([page([first])]).map((f) => f.at), ['page.desk.blocks[0]'], JSON.stringify(first));

  /* A ROW THAT LEAVES A HOLE: 4 and then an 12 that will not fit beside it. The last row may be short. */
  const holed = calmFaults([page([LEAD, { kind: 'stat', span: 4 }, { kind: 'table', span: 12, source: 'register.tasks', empty: 'x' }, { kind: 'stat', span: 4 }])]);
  assert.deepEqual(holed.map((f) => f.at), ['page.desk.blocks[1]']);
  assert.match(holed[0]!.fix, /4 of 12 wide/u);
  /* MEASURED AS DRAWN: a table of five columns cannot be 6 wide, so 6 + 6 is a 10 and then a 6. A block not drawn is not in a row. */
  const five = Array.from({ length: 5 }, (_, i) => ({ field: `f${i}` }));
  assert.equal(calmFaults([page([LEAD, { kind: 'table', span: 6, columns: five, source: 'register.tasks', empty: 'x' }, { kind: 'stat', span: 6 }])]).length, 1);
  assert.deepEqual(calmFaults([page([LEAD, { kind: 'stat', span: 4, drawn: false }, { kind: 'stat', span: 12 }])]), []);

  /* A LIST WITH NOTHING TO SAY WHEN EMPTY; `when:` WILL DO INSTEAD. */
  assert.deepEqual(calmFaults([page([LEAD, { kind: 'table', source: 'register.tasks' }])]).map((f) => f.at), ['page.desk.blocks[1]']);
  assert.deepEqual(calmFaults([page([LEAD, { kind: 'table', source: 'register.tasks', when: { metric: 'done-steps', gt: 0 } }])]), []);

  /* MORE THAN SIX BEFORE THE FIRST SECTION, and the system's words in a heading. */
  const busy = [LEAD, ...Array.from({ length: 6 }, () => ({ kind: 'stat', span: 4 })), { kind: 'stat', span: 4 }, { kind: 'stat', span: 4 }];
  assert.ok(calmFaults([page(busy)]).some((f) => f.at === 'page.desk.blocks[6]' && /draws 9 blocks/u.test(f.fix)));
  assert.deepEqual(calmFaults([page([LEAD, { kind: 'section', heading: 'More', fold: true }, ...busy.slice(1)])]).filter((f) => /blocks before/u.test(f.fix)), []);
  assert.deepEqual(calmFaults([page([LEAD, { kind: 'stat', span: 12, heading: 'Rows in your list' }])]).map((f) => f.at), ['page.desk.blocks[1].heading']);

  /* A PAGE THAT ALREADY STOOD IS HELD ONLY TO WHAT THE DRAFT MADE WORSE. */
  const old = [{ kind: 'table', span: 12, source: 'register.tasks', empty: 'x' }];
  assert.deepEqual(calmFaults([page([...old, { kind: 'stat', span: 12, heading: 'Done' }], old)]), []);
  assert.equal(calmFaults([page([...old, { kind: 'table', span: 12, source: 'register.tasks' }], old)]).length, 1);
});
