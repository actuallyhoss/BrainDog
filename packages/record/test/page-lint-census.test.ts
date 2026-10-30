/**
 * The sign "Pages draw without errors" with the pages census beside it: how many pages have a refused block,
 * how many print a path that named nothing, how many the record does not hold, and how many suggested pages wait.
 * Red on the first two, with the pages named; green over an empty census; and exactly the lint's reading without one.
 * Then the record's own census, read as the system, filed through the kernel and read back with its counts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, lintRound, pagesCleanReading, type CallContext, type PageLintRound } from '../src/index.ts';
import type { PageCensus, PagesCensus } from '../src/methods/pages-census.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 3);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const system: CallContext = { principal: { kind: 'system', id: 'signs' } } as CallContext;

const CLEAN: PageLintRound = { findings: [], pages: 3, unread: 0, withFindings: [], cells: 0, cut: [] };

const row = (title: string, also: Partial<PageCensus> = {}): PageCensus => ({
  slug: title.toLowerCase(),
  title,
  held: 'stored',
  blocks: 2,
  drawn: 2,
  refused: [],
  unresolved: [],
  glyphs_unknown: [],
  dashes: 0,
  ...also,
});

const censusOf = (pages: PageCensus[]): PagesCensus => ({
  pages,
  totals: {
    pages: pages.length,
    refused: pages.filter((p) => p.refused.length > 0).length,
    unresolved: pages.filter((p) => p.unresolved.length > 0).length,
    dashed: 0,
    dashes: 0,
    glyphs_unknown: 0,
    undrawn: [],
    unread: 0,
  },
});

test('ONE REFUSED BLOCK AND ONE PATH THAT NAMED NOTHING READ RED, with both pages named and the worst said first', () => {
  const census = censusOf([
    row('Usage', { refused: [{ n: 1, code: 'SOURCE_UNKNOWN' }] }),
    row('Plan', { unresolved: ['revenue.monthly'] }),
    row('Desk'),
    row('Garden', { held: 'web' }),
  ]);
  const r = pagesCleanReading(CLEAN, census, 2);
  assert.equal(r.state, 'red');
  assert.equal(r.value, 2);
  assert.deepEqual(r.counts, { refused_pages: 1, unnamed_pages: 1, missing_pages: 1, suggested_waiting: 2 });
  assert.equal(
    r.said,
    '1 page shows a block that could not be read: Usage. 1 page prints a path that names nothing: Plan. This BrainDog does not hold 1 page. 2 suggested pages wait.',
  );
  assert.deepEqual(r.facts, ['Usage: a block could not be read.', 'Plan prints {{revenue.monthly}}, naming nothing.']);
  /* A refusal's code is the record's, never a person's words. */
  assert.doesNotMatch(`${r.said}\n${r.facts.join('\n')}`, /SOURCE_UNKNOWN|—/);
});

test("TWO PAGES WITH REFUSED BLOCKS ARE SAID AS ONE SENTENCE beside the lint's own findings, which keep their place", () => {
  const census = censusOf([row('Usage', { refused: [{ n: 0, code: 'FORBIDDEN' }, { n: 2, code: 'FORBIDDEN' }] }), row('Plan', { refused: [{ n: 0, code: 'FORBIDDEN' }] })]);
  const round: PageLintRound = { ...CLEAN, findings: [{ page: 'Kiln', part: 'Notes', rule: 'placeholder', said: 'a placeholder where a number goes.' }], withFindings: ['Kiln'] };
  const r = pagesCleanReading(round, census);
  assert.equal(r.state, 'red');
  assert.equal(r.value, 3, 'the lint finding and the two pages');
  assert.equal(r.said, '2 pages show a block that could not be read: Usage, Plan. 1 page prints something raw: Kiln.');
  assert.deepEqual(r.facts, ['Usage: 2 blocks could not be read.', 'Plan: a block could not be read.', 'Kiln, Notes: a placeholder where a number goes.']);
  assert.equal('suggested_waiting' in r.counts!, false, 'a count nobody made is left out, never said as nought');
});

test('AN EMPTY CENSUS READS GREEN, with its four counts at nought', () => {
  const r = pagesCleanReading(CLEAN, censusOf([row('Desk'), row('Plan')]), 0);
  assert.equal(r.state, 'green');
  assert.equal(r.value, 0);
  assert.equal(r.said, 'All 3 pages read print clean: headings and notes.');
  assert.deepEqual(r.counts, { refused_pages: 0, unnamed_pages: 0, missing_pages: 0, suggested_waiting: 0 });
  /* What is said and not judged stays green. */
  const told = pagesCleanReading(CLEAN, censusOf([row('Garden', { held: 'web' })]), 1);
  assert.equal(told.state, 'green');
  assert.equal(told.said, 'All 3 pages read print clean: headings and notes. This BrainDog does not hold 1 page. 1 suggested page waits.');
});

test('NO CENSUS READS EXACTLY AS TODAY', () => {
  const rounds: PageLintRound[] = [
    CLEAN,
    { ...CLEAN, pages: 0 },
    { ...CLEAN, findings: [{ page: 'Kiln', part: 'Kiln', rule: 'no-draw', said: 'This page could not be drawn.' }], withFindings: ['Kiln'] },
  ];
  for (const round of rounds) {
    const r = pagesCleanReading(round);
    assert.equal('counts' in r, false);
    assert.deepEqual(pagesCleanReading(round, undefined, 4), r);
  }
  assert.deepEqual(pagesCleanReading(CLEAN), { state: 'green', value: 0, said: 'All 3 pages read print clean: headings and notes.', facts: [] });
});

test("THE RECORD'S OWN CENSUS, read as the system, is filed through the kernel and read back with its counts", async () => {
  const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install([
    decl('register', 'projects', { id: 'projects', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
    decl('page', 'desk', { page: 'desk', title: 'Desk', requires: ['register.projects'], blocks: [{ kind: 'table', source: 'register.projects' }] }),
    decl('page', 'plan', { page: 'plan', title: 'Plan', blocks: [{ kind: 'note', heading: 'Plan', body: 'We earn {{nowhere.monthly}} a month.' }] }),
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok(((await api.create({ register: 'projects', fields: { name: 'Kiln' } }, owner)) as { ok: boolean }).ok);
  const census = await api.pagesCensus(undefined, system);
  assert.ok(census.ok, JSON.stringify(census));
  const round = lintRound({ pages: () => api.kernel.pages(), page: (slug) => api.kernel.page(slug), questionsOpen: () => null, now: () => 0 });
  const reading = pagesCleanReading(round, census.value, 0);
  assert.equal(reading.state, 'red', reading.said);
  assert.match(reading.said, /^1 page prints a path that names nothing: Plan\./);
  const filed = api.kernel.signRead('pages-clean', reading);
  assert.ok(filed.ok, JSON.stringify(filed));
  const read = api.kernel.signs();
  assert.ok(read.ok);
  const s = read.value.signs.find((x) => x.sign === 'pages-clean')!;
  assert.equal(s.state, 'red');
  assert.equal(s.said, reading.said);
  assert.deepEqual(s.counts, { refused_pages: 0, unnamed_pages: 1, missing_pages: 0, suggested_waiting: 0 });
  sql.close();
});
