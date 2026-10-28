/**
 * Slash's two page rules asking the one recommender (`design-agent.ts` `recommend`): a page for somebody
 * or something that keeps coming up (`slash.ts` `entityDrafts`), and a page for a list that grows (`noticeUsage`).
 *
 * WHAT THESE HOLD. Whether a thing has a page is read off the pages as drawn: a project whose page was made from a
 * template, a page per project titled by a field and not by any name, has a page, and is not offered a second. The old
 * rule read titles and addresses only, and on a real record two projects with a page were each offered one. A project
 * with no page at all is still drafted. A list a page draws whole is not offered one; a page made for one entry of it is
 * that entry's and not the list's. And the counts both rules cross are the recommender's own, with no second copy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { openRecord, type Declaration } from '../../kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { GROWS, NAMED_PAGE, namedHasPage, recommend } from '../src/design-agent.ts';
import { ENTITY_PAGE, entityDrafts, noticeUsage, readUsage, type PageUse, type Usage } from '../src/slash.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const DAY = 86_400_000;

/** Projects, by `scopes:`, each with a state its page can lead on. */
const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['live', 'parked'], label: 'State' },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};
const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'thing', type: 'ref', to: 'things' }] } as never,
};
/** ONE PAGE PER LIVE PROJECT, titled by the project's name through the template, over its list. A parked one has none. */
const PROJECT: Declaration = {
  id: 'page.project',
  kind: 'page',
  body: {
    page: 'project',
    title: 'About {{name}}',
    for: { register: 'things', where: 'state is live' },
    nav: { section: 'Projects', order: 10 },
    requires: ['register.things', 'register.tasks'],
    blocks: [{ kind: 'table', source: 'register.tasks', where: 'thing is {{name}}', span: 12 }],
  } as never,
};

/** Three projects each named by `NAMED_PAGE.linked` tasks: two live, so drawn from the template, and one parked. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 60 * DAY);
  const k = await openRecord(sql, clock);
  const put = await k.install([THINGS, TASKS, PROJECT]);
  assert.ok(put.ok, JSON.stringify(put));
  const make = (list: string, fields: Record<string, unknown>) => {
    const got = k.create(list, fields as never, { actor: 'p_1' });
    assert.ok(got.ok, JSON.stringify(got));
    return got.value as { id: string };
  };
  for (const [name, state] of [['Kiln', 'live'], ['Portage', 'live'], ['Halden', 'parked']] as const) {
    const thing = make('things', { name, state });
    for (let i = 0; i < NAMED_PAGE.linked; i++) make('tasks', { what: `${name} step ${i + 1}`, thing: thing.id });
  }
  /* FIVE DAYS OF THE OWNER'S OWN USE, so Slash advises the record (HD.410). */
  for (const d of [50, 40, 30, 20]) {
    clock.set(NOW - d * DAY);
    make('tasks', { what: `Kept on day ${d}` });
  }
  clock.set(NOW);
  return { sql, k, clock };
}

test('a project with a page made from the project template is not offered a page, and one with no page still is', async () => {
  const { sql, k, clock } = await record();
  /* THE RECORD AS DRAWN: two pages from the template, neither titled by its project's bare name. */
  const drawn = k.pages().filter((p) => p.about !== null);
  assert.deepEqual(drawn.map((p) => [p.title, p.about?.seq]), [['About Kiln', 1], ['About Portage', 2]]);

  const usage = readUsage(sql, k, clock.now());
  assert.deepEqual((usage.entities ?? []).map((e) => e.name).sort(), ['Halden', 'Kiln', 'Portage'], 'all three crossed the line');
  /* THE READING CARRIES THE PAGES DRAWN FOR THEM, each saying the entry it is for and the lists it reads. */
  assert.deepEqual(
    (usage.made ?? []).map((p) => [p.title, p.row, p.registers]),
    [
      ['About Kiln', { list: 'things', seq: 1 }, ['things', 'tasks']],
      ['About Portage', { list: 'things', seq: 2 }, ['things', 'tasks']],
    ],
  );
  assert.ok(usage.pages.every((p) => p.row === undefined), 'the pages somebody wrote are as they were: a page for one entry is not judged as a page of the record');

  const drafts = entityDrafts(usage);
  assert.deepEqual(drafts.map((d) => d.question), ['Give Halden a page of its own? 3 things here name it, and it has no page yet.']);
  assert.deepEqual(
    noticeUsage(usage, []).drafts.filter((d) => d.question.startsWith('Give ')).map((d) => d.key),
    ['pages:page.halden'],
    'and so through the look',
  );
  sql.close();
});

const page = (over: Partial<PageUse>): PageUse => ({ slug: 'p', title: 'P', titled: true, pack: null, registers: [], opens30: 0, openDays30: 0, opens90: 0, lastOpened: null, declaredAt: '2026-01-01', ...over });

/** A reading of a record old enough to be advised, holding one list that grows. */
const reading = (over: Partial<Usage> = {}): Usage => ({
  at: new Date(NOW).toISOString(),
  firstWrite: '2026-01-01T00:00:00.000Z',
  ageDays: 270,
  listening: { pages: false, lists: false },
  lists: [{ id: 'visits', name: 'Visits', pack: null, rows: 40, added30: GROWS.rows, addedDays30: GROWS.days, writes90: 0, reads90: 0, agentWrites30: 0, declaredAt: '2026-01-01' }],
  pages: [],
  agents: [],
  packs: [],
  speaking: null,
  writes: { all30: 0, agents30: 0, agents90: 0 },
  tone: null,
  skills: null,
  ...over,
});
const pagesAsked = (usage: Usage): string[] => noticeUsage(usage, []).drafts.filter((d) => d.question.startsWith('Give ')).map((d) => d.question);

test('a list that grows is offered a page only while no page draws it whole', () => {
  assert.deepEqual(pagesAsked(reading()), ['Give Visits a page of its own? It grew by 5 in the last thirty days, and no page shows it yet.']);
  assert.deepEqual(pagesAsked(reading({ pages: [page({ slug: 'calls', title: 'Calls', registers: ['visits'] })] })), [], 'a page of its own, whatever it is called');
  /* A PAGE MADE FOR ONE ENTRY READS THE LIST AND IS NOT THE LIST'S PAGE. */
  assert.equal(pagesAsked(reading({ made: [page({ slug: 'ada', title: 'Ada', registers: ['visits'], row: { list: 'people', seq: 1 } })] })).length, 1);
  /* ONE SHORT OF EITHER COUNT IS NOT GROWING. */
  const [visits] = reading().lists;
  assert.deepEqual(pagesAsked(reading({ lists: [{ ...visits!, added30: GROWS.rows - 1 }] })), []);
  assert.deepEqual(pagesAsked(reading({ lists: [{ ...visits!, addedDays30: GROWS.days - 1 }] })), []);
});

test('the counts the two rules cross are the recommender\'s, and there is no second copy', () => {
  assert.equal(ENTITY_PAGE, NAMED_PAGE, 'one object under two names');
  const source = readFileSync(new URL('../src/slash.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\{\s*met:\s*\d/u, 'no count of times met is written in slash.ts');
  assert.doesNotMatch(source, /const GROWS\b/u, 'no count of entries gained is written in slash.ts');
  assert.match(source, /import \{[^}]*\bGROWS\b[^}]*\bNAMED_PAGE\b[^}]*\} from '\.\/design-agent\.ts'/u);
  /* AND WHAT IS DRAFTED IS WHAT THE RECOMMENDER OFFERS: the same things, by the same reading of "has a page". */
  const kiln = { kind: 'project' as const, list: 'things', listName: 'Projects', seq: 3, name: 'Kiln', title: 'name', met: 0, linked: NAMED_PAGE.linked, links: [], facts: [], lead: { field: 'state', label: 'state' } };
  const made = page({ slug: 'kiln-2', title: 'Project', registers: ['things'], row: { list: 'things', seq: 3 } });
  assert.equal(entityDrafts(reading({ entities: [kiln] })).length, 1);
  assert.deepEqual(entityDrafts(reading({ entities: [kiln], made: [made] })), []);
  assert.deepEqual(entityDrafts(reading({ entities: [{ ...kiln, linked: NAMED_PAGE.linked - 1 }] })), [], 'under the line, whoever read it in');
  const drawn = [{ slug: made.slug, title: made.title, lists: made.registers, row: made.row! }];
  assert.ok(namedHasPage(drawn, kiln));
  assert.deepEqual(recommend({ nowMs: NOW, pages: drawn, named: [kiln] }), []);
});
