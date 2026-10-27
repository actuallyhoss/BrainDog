/**
 * A record lints its own pages: each page it can draw is drawn on its own data, render's rules read it, and
 * the sign `pages-clean` is filed with the findings as its facts. The red record is what his project notes printed on
 * 7 October (`evidence-own-record.md` 2.1): a figure the record has no answer for, a chips figure in braces, a run's
 * handle and an ISO instant, all in one project's note.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, lintAnswer, lintRound, pagesCleanReading, pagesToLint, ROUND_PAGES, type CallContext } from '../src/index.ts';
import { leadDrawn, unworded } from '../src/page-lint.ts';
import type { PageResult } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 3);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;
const DECLS = [
  decl('register', 'projects', {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'note', type: 'text' },
    ],
  }),
  decl('page', 'project', {
    page: 'project',
    title: '{{name}}',
    for: { register: 'projects' },
    requires: ['register.projects'],
    blocks: [{ kind: 'note', document: true, heading: 'Notes', body: '{{note}}' }],
  }),
];

const RAW = [
  'Earning {{revenue.monthly}} a month.',
  '',
  '```chips',
  'money | {{revenue.monthly}} | monthly, trailing',
  '```',
  '',
  'The last run, S731, ended 2026-10-07T12:00:00Z.',
].join('\n');

async function record(note: string) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const made = (await api.create({ register: 'projects', fields: { name: 'Kiln', note } }, owner)) as { ok: boolean };
  assert.ok(made.ok, JSON.stringify(made));
  return { sql, api };
}

const sign = (api: Awaited<ReturnType<typeof createRecordApi>>) => {
  const read = api.kernel.signs();
  assert.ok(read.ok, JSON.stringify(read));
  const s = read.value.signs.find((x) => x.sign === 'pages-clean');
  assert.ok(s, 'pages-clean is on the list');
  return s;
};

test('A NOTE THAT PRINTS THREE RAW THINGS IS THREE FINDINGS, named by page and part, and the sign reads red', async () => {
  const { sql, api } = await record(RAW);
  const ran = await api.lintTick();
  /* THE CHIP WHOSE FIGURE HAS NO ANSWER IS DROPPED BY THE RENDERER NOW (html.ts `drawnRows`), so its braces are
     never printed and are no finding: three, where his 7 October note counted four. */
  assert.deepEqual(ran, { ran: true, state: 'red', findings: 3, pages: 1 });
  const s = sign(api);
  assert.equal(s.state, 'red');
  /* AND THE PAGES CENSUS BESIDE THE LINT (PGS-A01 step 5): the note's `{{revenue.monthly}}` names nothing on this
     record, so the census counts the page once more and its fact names the path, ahead of the lint's three. */
  assert.equal(s.value, 4);
  assert.equal(s.said, '1 page prints a path that names nothing: Kiln. 1 page prints something raw: Kiln.');
  assert.equal(s.facts[0], 'Kiln prints {{revenue.monthly}}, naming nothing.');
  const lint = s.facts.slice(1);
  assert.deepEqual(
    lint.map((f) => f.split(':')[0]),
    ['Kiln, Notes', 'Kiln, Notes', 'Kiln, Notes'],
    'each finding names the page and the part',
  );
  const facts = lint.join('\n');
  for (const said of ['placeholder', 'an id where a name goes', 'a raw time']) assert.match(facts, new RegExp(said));
  /* NOTHING RAW IN THE LINT'S FINDINGS THEMSELVES: no handle, no instant, no braces, no slug. */
  assert.doesNotMatch(`${s.said}\n${facts}`, /S731|2026-10-07T|\{\{|kiln\b|—/);
  /* ONCE A DAY: the same day's tick does not read again. */
  assert.deepEqual(await api.lintTick(), { ran: false, why: 'today' });
  sql.close();
});

test('A CLEAN RECORD READS GREEN', async () => {
  const { sql, api } = await record('Earning well this month. The kiln is fired on Fridays.');
  assert.deepEqual(await api.lintTick(), { ran: true, state: 'green', findings: 0, pages: 1 });
  const s = sign(api);
  assert.equal(s.state, 'green');
  assert.equal(s.said, 'The one page read prints clean: headings and notes.');
  sql.close();
});

test('A TEMPLATE PAST TWENTY-FOUR PAGES IS READ AT ITS NEWEST, OLDEST AND MIDDLE; a written page always', () => {
  const page = (i: number) => ({ slug: `run-${i}`, title: `Run ${i}`, template: 'run', about: { register: 'runs', seq: i, updated_at: `2026-10-${String(i).padStart(2, '0')}` } });
  const picked = pagesToLint([{ slug: 'desk', title: 'Desk', template: null, about: null }, ...Array.from({ length: 30 }, (_, i) => page(i + 1))]);
  assert.deepEqual(picked.map((p) => p.title), ['Desk', 'Run 30', 'Run 1', 'Run 16']);
  assert.equal(pagesToLint(Array.from({ length: 24 }, (_, i) => page(i + 1))).length, 24);
});

test('NOTHING TO READ IS NOTHING TO JUDGE BY, and a round the budget cut says so', () => {
  assert.equal(pagesCleanReading({ findings: [], pages: 0, unread: 0, withFindings: [], cells: 0, cut: [] }).state, 'none');
  assert.equal(pagesCleanReading({ findings: [], pages: 3, unread: 2, withFindings: [], cells: 0, cut: [] }).said, 'All 3 pages read print clean: headings and notes. 2 more were not reached in this round.');
});

test('A ROUND STOPS AT ROUND_PAGES UNDER A CLOCK THAT STANDS STILL, as a Worker’s does', () => {
  const clean = { title: 'Desk', blocks: [] } as unknown as PageResult;
  const listed = Array.from({ length: ROUND_PAGES + 3 }, (_, i) => ({ slug: `p${i}`, title: `Page ${i}`, template: null, about: null }));
  let drawn = 0;
  const round = lintRound({ pages: () => listed, page: () => (drawn++, { ok: true, value: clean }), questionsOpen: () => 0, now: () => 0 });
  assert.equal(drawn, ROUND_PAGES);
  assert.equal(round.pages, ROUND_PAGES);
  assert.equal(round.unread, 3);
});

test('A PAGE THAT WILL NOT DRAW IS A FINDING, refused or thrown, and the round reads on', () => {
  const listed = (slug: string, title: string) => ({ slug, title, template: null, about: null });
  const clean = { title: 'Desk', blocks: [] } as unknown as PageResult;
  const round = lintRound({
    pages: () => [listed('gone', 'Ledger'), listed('boom', 'Money'), listed('desk', 'Desk')],
    page: (slug) => {
      if (slug === 'boom') throw new Error('no such table: entry');
      return slug === 'gone' ? { ok: false } : { ok: true, value: clean };
    },
    questionsOpen: () => {
      throw new Error('unreadable');
    },
    now: () => 0,
  });
  assert.deepEqual(round.findings.map((f) => [f.page, f.rule]), [['Ledger', 'no-draw'], ['Money', 'no-draw']]);
  assert.deepEqual(round.withFindings, ['Ledger', 'Money']);
  assert.equal(round.pages, 3);
  const r = pagesCleanReading(round);
  assert.equal(r.state, 'red');
  assert.doesNotMatch(r.facts.join('\n'), /no such table|gone|boom/);
});

test("A PART IS NAMED IN PLAIN WORDS: a heading's apostrophe is never printed as an entity", () => {
  const page = { title: 'Kiln', blocks: [{ kind: 'note', heading: "Kiln's notes", body: 'Ended 2026-10-07T12:00:00Z.', document: true }] } as unknown as PageResult;
  const found = lintAnswer(page, null);
  assert.ok(found.length > 0);
  assert.equal(found[0]!.part, "Kiln's notes");
});

/* ── a table's cells ───────────────────────────── */

const RAW_AT = '2026-10-06T19:07:01.610Z';
const tools = (rows: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  ({
    page: 'kiln',
    title: 'Kiln',
    blocks: [
      {
        kind: 'table',
        heading: 'Tools and servers',
        source: 'tools',
        columns: [{ field: 'name' }, { field: 'seen', label: 'Last seen' }],
        rows: rows.map((fields, i) => ({ id: `t${i}`, register: 'tools', seq: i + 1, fields })),
        matched: rows.length,
        ...extra,
      },
    ],
  }) as unknown as PageResult;

const roundOf = (answer: PageResult, typesOf?: (register: string) => Record<string, string> | null) =>
  lintRound({
    pages: () => [{ slug: 'kiln', title: 'Kiln', template: null, about: null }],
    page: () => ({ ok: true, value: answer }),
    questionsOpen: () => 0,
    now: () => 0,
    ...(typesOf ? { typesOf } : {}),
  });

test('A RAW TIME IN A TABLE CELL TURNS THE ROUND RED, named by the column; the same time in an instant column does not', () => {
  const answer = tools([{ name: 'Wrangler', seen: RAW_AT }]);
  const red = roundOf(answer, () => ({ name: 'text', seen: 'text' }));
  assert.deepEqual(red.findings.map((f) => [f.page, f.part, f.rule]), [['Kiln', 'Tools and servers, Last seen', 'raw-instant']]);
  const r = pagesCleanReading(red);
  assert.equal(r.state, 'red');
  assert.equal(r.facts[0], 'Kiln, Tools and servers, Last seen: Prints a raw time where a date in words goes.');
  assert.doesNotMatch(`${r.said}\n${r.facts.join('\n')}`, /2026-10-06T|\btools\b|\brows?\b|—/);

  /* THE WEB SAYS AN INSTANT IN WORDS (`since()`), so a column typed as one prints nothing raw. */
  const typed = roundOf(answer, () => ({ name: 'text', seen: 'instant' }));
  assert.deepEqual(typed.findings, []);
  assert.equal(typed.cells, 1);
  const g = pagesCleanReading(typed);
  assert.equal(g.state, 'green');
  assert.equal(g.said, 'The one page read prints clean: headings, notes and table cells.');
});

test("A COMPUTED SOURCE IS TYPED BY ITS ANSWER: a run's handle in a text column is a finding, in a run column it is not", () => {
  const runsOn = (used_by: string) =>
    ({
      page: 'braindog',
      title: 'BrainDog',
      blocks: [{ kind: 'table', heading: 'Tools and servers', source: 'runs_on', columns: [{ field: 'name' }, { field: 'used_by' }], rows: [{ id: 'x', register: 'runs_on', seq: null, fields: { name: 'Wrangler', used_by: 'S731' } }], matched: 1, types: { name: 'text', used_by } }],
    }) as unknown as PageResult;
  /* NO DECLARATIONS ARE ASKED: the answer's own types are enough, and `used_by` with no label is said in words. */
  assert.deepEqual(lintAnswer(runsOn('text'), null).map((f) => [f.part, f.rule]), [['Tools and servers, Used by', 'raw-id']]);
  assert.deepEqual(lintAnswer(runsOn('run'), null), []);
});

test('A CELL WHOSE TYPE IS NOT KNOWN IS NOT READ, and the sign then names only what it read', () => {
  const round = roundOf(tools([{ name: 'Wrangler', seen: RAW_AT }]));
  assert.deepEqual(round.findings, []);
  assert.equal(round.cells, 0);
  assert.equal(pagesCleanReading(round).said, 'The one page read prints clean: headings and notes.');
  /* A WHOLE ULID IN A COLUMN NO LIST DECLARES IS DRAWN AS NOTHING by the web, so it is not a finding; in a text column it prints. */
  const id = tools([{ name: 'Wrangler', seen: '01JZ8QK3F7R2M9V4XN6TCB5HAD' }]);
  assert.deepEqual(roundOf(id, () => ({ name: 'text' })).findings, []);
  assert.deepEqual(roundOf(id, () => ({ name: 'text', seen: 'text' })).findings.map((f) => f.rule), ['raw-id']);
});

test('SIXTY ROWS ARE READ FIFTY, and the facts say the rest were not', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ name: `Tool ${i + 1}`, seen: i === 55 ? RAW_AT : 'Friday' }));
  const round = roundOf(tools(rows), () => ({ name: 'text', seen: 'text' }));
  /* THE RAW TIME IS IN THE FIFTY-SIXTH, past what was read: not found, and said as not read. */
  assert.deepEqual(round.findings, []);
  assert.equal(round.cells, 50);
  assert.deepEqual(round.cut, [{ page: 'Kiln', part: 'Tools and servers', read: 50, held: 60 }]);
  const r = pagesCleanReading(round);
  assert.equal(r.state, 'green');
  assert.deepEqual(r.facts, ['Kiln, Tools and servers: only the first 50 of 60 were read.']);
  /* AND ON A RED ROUND THE CUT STILL HAS ITS LINE beside the findings. */
  const red = pagesCleanReading(roundOf(tools(rows.map((x, i) => (i < 10 ? { ...x, seen: RAW_AT } : x))), () => ({ name: 'text', seen: 'text' })));
  assert.equal(red.state, 'red');
  assert.equal(red.facts.at(-1), 'Kiln, Tools and servers: only the first 50 of 60 were read.');
});

test("A RUN'S PROJECT IS DRAWN BY ITS NAME, so its spoken id in the cell is no finding; a secret is drawn as dots", () => {
  const runs = (fields: Record<string, unknown>) =>
    ({
      page: 'kiln',
      title: 'Kiln',
      blocks: [{ kind: 'table', heading: 'Runs', source: 'session', columns: [{ field: 'title' }, { field: 'project' }, { field: 'token' }], rows: [{ id: 'r', register: 'session', seq: 1, fields }], matched: 1 }],
    }) as unknown as PageResult;
  const types = () => ({ title: 'text', project: 'text', token: 'secret' });
  assert.deepEqual(lintAnswer(runs({ title: 'Ledger sync', project: 'projects#7', token: '01JZ8QK3F7R2M9V4XN6TCB5HAD' }), null, types), []);
  /* AND THE SAME SPOKEN ID IN ANY OTHER TEXT CELL STILL PRINTS RAW. */
  assert.deepEqual(lintAnswer(runs({ title: 'projects#7' }), null, types).map((f) => [f.part, f.rule]), [['Runs, Title', 'raw-id']]);
});

/* ── what his record showed on 24 October: 20 findings, 12 of them the lint's own ───────────────────────── */

test('A BLOCK NAMES ITS LIST register.<id>, and the cells are typed by the list it names, so a declared time is not raw', () => {
  const byId = (register: string) => (register === 'tools' ? { name: 'text', seen: 'instant' } : null);
  const answer = tools([{ name: 'Wrangler', seen: RAW_AT }]);
  (answer.blocks[0] as unknown as { source: string }).source = 'register.tools';
  assert.deepEqual(lintAnswer(answer, null, byId), [], 'a declared instant read as raw');
  /* A COMPUTED SOURCE OVER ONE LIST'S ROWS is typed by that list. */
  (answer.blocks[0] as unknown as { source: string }).source = 'tools.working';
  assert.deepEqual(lintAnswer(answer, null, byId), []);
  /* AND A TIME IN A TEXT COLUMN OF IT IS STILL RAW. */
  assert.deepEqual(lintAnswer(answer, null, () => ({ name: 'text', seen: 'text' })).map((f) => f.rule), ['raw-instant']);
});

test('A LEAD IS READ AS THE WEB DRAWS IT: the model line when sent, else without the clauses whose figure did not read', () => {
  const body = 'Cash is {{cash-now}} across {{cash-accounts}} accounts. {{late.first}} is {{bad:late}}: {{late.first_amount}}, due {{ago:late.first_due}}.';
  assert.equal(leadDrawn(body, { 'cash-now': 12, 'cash-accounts': 2 }), 'Cash is {{cash-now}} across {{cash-accounts}} accounts.');
  assert.equal(leadDrawn(body, {}, 'EGP 12 on hand.'), 'EGP 12 on hand.');
  const lead = (said?: string) =>
    ({ page: 'money', title: 'Money', blocks: [{ kind: 'note', lead: true, body, values: { 'cash-now': 12, 'cash-accounts': 2 }, ...(said ? { said } : {}), rows: [], matched: 0 }] }) as unknown as PageResult;
  assert.deepEqual(lintAnswer(lead(), null), []);
  assert.deepEqual(lintAnswer(lead('EGP 12 on hand.'), null), []);
  /* A NOTE THAT IS NOT A LEAD IS READ WHOLE, as it is drawn whole. */
  const whole = { page: 'money', title: 'Money', blocks: [{ kind: 'note', body, values: {}, rows: [], matched: 0 }] } as unknown as PageResult;
  assert.deepEqual(lintAnswer(whole, null).map((f) => f.rule), ['placeholder']);
});

test('A CLOSED VALUE WITH NO NAME IS A KEY ONLY WHERE IT DOES NOT READ AS A WORD: vm and tier2 are, claude and owed_to_me are not', () => {
  assert.deepEqual(['vm', 'mrr', 'tier2', 'claude', 'daily', 'owed_to_me', 'contractor'].filter(unworded), ['vm', 'mrr', 'tier2']);
});

test("A PERSON'S PROJECTS, A LIST OF REFS, ARE DRAWN BY THEIR NAMES: the record types a list by what it holds", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const people = decl('register', 'people', { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'projects', type: 'list', of: 'ref', to: 'projects', label: 'Met in' }] });
  const page = decl('page', 'everyone', { page: 'everyone', title: 'Everyone', blocks: [{ kind: 'table', heading: 'Everyone', span: 12, source: 'register.people', columns: [{ field: 'name' }, { field: 'projects' }] }] });
  assert.ok((await api.kernel.install([...DECLS, people, page])).ok);
  const kiln = api.kernel.create('projects', { name: 'Kiln' }, { actor: 'p_1' });
  assert.ok(kiln.ok);
  assert.ok(api.kernel.create('people', { name: 'Mara', projects: [kiln.value.id] }, { actor: 'p_1' }).ok);
  const ran = await api.lintTick();
  assert.ok(ran.ran);
  assert.equal(ran.ran && ran.findings, 0, 'a list of refs read as raw ids');
  sql.close();
});
