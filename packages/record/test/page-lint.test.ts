/**
 * A record lints its own pages (PRF-A04): each page it can draw is drawn on its own data, render's rules read it, and
 * the sign `pages-clean` is filed with the findings as its facts. The red record is what his project notes printed on
 * 7 October (`evidence-own-record.md` 2.1): a figure the record has no answer for, a chips figure in braces, a run's
 * handle and an ISO instant, all in one project's note.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, lintAnswer, lintRound, pagesCleanReading, pagesToLint, type CallContext } from '../src/index.ts';
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

test('A NOTE THAT PRINTS FOUR RAW THINGS IS FOUR FINDINGS, named by page and part, and the sign reads red', async () => {
  const { sql, api } = await record(RAW);
  const ran = await api.lintTick();
  assert.deepEqual(ran, { ran: true, state: 'red', findings: 4, pages: 1 });
  const s = sign(api);
  assert.equal(s.state, 'red');
  assert.equal(s.value, 4);
  assert.equal(s.said, '1 page prints something raw: Kiln.');
  assert.deepEqual(
    s.facts.map((f) => f.split(':')[0]),
    ['Kiln, Notes', 'Kiln, Notes', 'Kiln, Notes', 'Kiln, Notes'],
    'each finding names the page and the part',
  );
  const facts = s.facts.join('\n');
  for (const said of ['placeholder', 'braces', 'an id where a name goes', 'a raw time']) assert.match(facts, new RegExp(said));
  /* NOTHING RAW IN THE FINDINGS THEMSELVES: no handle, no instant, no braces, no slug. */
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
  assert.equal(s.said, 'The one page read prints clean.');
  sql.close();
});

test('A TEMPLATE PAST TWENTY-FOUR PAGES IS READ AT ITS NEWEST, OLDEST AND MIDDLE; a written page always', () => {
  const page = (i: number) => ({ slug: `run-${i}`, title: `Run ${i}`, template: 'run', about: { register: 'runs', seq: i, updated_at: `2026-10-${String(i).padStart(2, '0')}` } });
  const picked = pagesToLint([{ slug: 'desk', title: 'Desk', template: null, about: null }, ...Array.from({ length: 30 }, (_, i) => page(i + 1))]);
  assert.deepEqual(picked.map((p) => p.title), ['Desk', 'Run 30', 'Run 1', 'Run 16']);
  assert.equal(pagesToLint(Array.from({ length: 24 }, (_, i) => page(i + 1))).length, 24);
});

test('NOTHING TO READ IS NOTHING TO JUDGE BY, and a round the budget cut says so', () => {
  assert.equal(pagesCleanReading({ findings: [], pages: 0, unread: 0, withFindings: [] }).state, 'none');
  assert.equal(pagesCleanReading({ findings: [], pages: 3, unread: 2, withFindings: [] }).said, 'All 3 pages read print clean. 2 more were not reached in this round.');
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
