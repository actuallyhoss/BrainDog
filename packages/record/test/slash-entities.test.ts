/**
 * Slash drafting a page for a person, an organisation or a project that keeps coming up (`slash.ts` `entitiesOf`,
 * `entityDrafts`): five or more dated `met` lines, or three or more rows in other lists pointing at it, and no page of its
 * own yet (DIRECTION §38).
 *
 * WHAT THESE HOLD. The reading counts met lines and the rows that name each row, from the lists the caller reads, and
 * leaves out examples and rows folded into another. A draft is a page that opens on a lead line from the row itself,
 * its card, and the lists that name it filtered to it, held to `calmFaults` before it is filed. A name a page already has,
 * or that a `where:` cannot say, is not drafted; and a young record is watched, not advised.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../../kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { calmFaults, ENTITY_PAGE, entityDrafts, noticeUsage, readUsage, type EntityUse, type Usage } from '../src/slash.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const DAY = 86_400_000;

/** People as a record from before the keys holds them: read by the list's name (`roles.ts` `LEGACY`). */
const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', label: 'Email' },
      { id: 'role', type: 'enum', values: ['client', 'contractor'], label: 'Role' },
      { id: 'met', type: 'list', of: 'text', label: 'Met' },
      { id: 'merged_into', type: 'ref', to: 'people' },
      { id: 'in_touch', type: 'day', label: 'Last in touch' },
      { id: 'tags', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
    ],
  } as never,
};

/** Tasks naming one person each, and Deals naming several. */
const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'who', type: 'ref', to: 'people' }, { id: 'tags', type: 'list', of: 'text' }] } as never,
};
const DEALS: Declaration = {
  id: 'register.deals',
  kind: 'register',
  body: { id: 'deals', name: 'Deals', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'with', type: 'list', of: 'ref', to: 'people' }] } as never,
};

const lines = (n: number): string[] => Array.from({ length: n }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')} · commit in kiln-site`);

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 60 * DAY);
  const k = await openRecord(sql, clock);
  const put = await k.install([PEOPLE, TASKS, DEALS]);
  assert.ok(put.ok, JSON.stringify(put));
  const make = (list: string, fields: Record<string, unknown>) => {
    const got = k.create(list, fields as never, { actor: 'p_1' });
    assert.ok(got.ok, JSON.stringify(got));
    return got.value as { id: string };
  };
  const ada = make('people', { name: 'Ada Lovelace', role: 'client', met: lines(6), in_touch: '2026-09-30' });
  const bo = make('people', { name: 'Bo Chen', role: 'contractor', met: lines(1) });
  const cy = make('people', { name: 'Cy Park', met: lines(4) });
  /* FOLDED INTO ADA: its met lines are hers, and it earns no page of its own. Folded as every merge is, by a decision. */
  const folded = make('people', { name: 'Ada Lovelace', met: lines(7) }) as { id: string; version: number };
  const merge = k.propose({ question: 'Are these two Ada?', body_kind: 'rowset', body: { register: 'people', rows: [{ at: k.nameOf(folded.id), version: folded.version, patch: { merged_into: ada.id } }] } }, 'p_1');
  assert.ok(merge.ok, JSON.stringify(merge));
  const took = k.decide(merge.value.id, { decide: { option: 'accept', reason: 'the same' } }, 'p_1');
  assert.ok(took.ok, JSON.stringify(took));
  /* MET ONLY BY AN ADDRESS: the reading goes to a model whole, so it is not read (`scrub.ts`). */
  make('people', { name: 'ines.duarte@orchardline.example', met: lines(8) });
  /* THE RECORD'S OWN PERSON is in every commit, and is not somebody met. */
  make('people', { name: 'Mara Lindqvist', self: true, met: lines(12) });
  /* AN EXAMPLE A PACK SEEDED is nobody anyone met. */
  make('people', { name: 'Sample Client', met: lines(9), tags: ['example'] });
  for (const what of ['Fix the gutter', 'Quote the roof']) make('tasks', { what, who: bo.id });
  make('deals', { what: 'Kiln retainer', with: [bo.id, ada.id] });
  /* EXAMPLES NAMING CY name nobody, so they do not lift him over the line. */
  for (const what of ['Sample one', 'Sample two', 'Sample three']) make('tasks', { what, who: cy.id, tags: ['example'] });
  clock.set(NOW);
  return { sql, k, clock };
}

test('the reading counts met lines and the rows naming each person, and leaves out examples and folded rows', async () => {
  const { sql, k, clock } = await record();
  const usage = readUsage(sql, k, clock.now());
  const names = (usage.entities ?? []).map((e) => e.name);
  assert.deepEqual(names, ['Ada Lovelace', 'Bo Chen'], 'Cy has four met lines and only examples naming him; the folded row, the example and the record\'s own person are nobody');
  const ada = usage.entities!.find((e) => e.name === 'Ada Lovelace')!;
  assert.equal(ada.kind, 'person');
  assert.equal(ada.met, 6);
  assert.equal(ada.linked, 1);
  const bo = usage.entities!.find((e) => e.name === 'Bo Chen')!;
  assert.equal(bo.linked, ENTITY_PAGE.linked);
  assert.deepEqual(
    bo.links.map((l) => [l.list, l.field, l.many, l.rows]),
    [
      ['tasks', 'who', false, 2],
      ['deals', 'with', true, 1],
    ],
  );
  assert.deepEqual(ada.lead, { field: 'in_touch', label: 'Last in touch' });
  assert.deepEqual(bo.lead, { field: 'role', label: 'Role' }, 'Bo holds no day he was last in touch, so his page leads on what he is');
  assert.deepEqual(
    bo.facts.map((f) => [f.field, f.as]),
    [
      ['email', 'fact'],
      ['role', 'fact'],
      ['in_touch', 'when'],
    ],
    'never the met lines, the fold or the tags',
  );

  /* A LIST THE CALLER CANNOT READ NAMES NOBODY: Bo's tasks drop out, and with them his page. */
  const held = readUsage(sql, k, clock.now(), new Map(), null, (list) => list !== 'tasks');
  assert.deepEqual((held.entities ?? []).map((e) => e.name), ['Ada Lovelace']);
  sql.close();
});

test('each person who crossed gets a calm page drafted: a lead line from their own row, their card, and what names them', async () => {
  const { sql, k, clock } = await record();
  const usage = readUsage(sql, k, clock.now());
  const drafts = entityDrafts(usage);
  assert.equal(drafts.length, 2);
  const bo = drafts.find((d) => d.question.startsWith('Give Bo Chen'))!;
  assert.equal(bo.question, 'Give Bo Chen a page of their own? 3 things here name them, and they have no page yet.');
  assert.equal(bo.body_kind, 'arrange');
  const page = (bo.body.pages as { id: string; body: Record<string, unknown> }[])[0]!;
  assert.equal(page.id, 'page.bo-chen');
  assert.equal(page.body.title, 'Bo Chen');
  assert.deepEqual(page.body.requires, ['register.people', 'register.tasks', 'register.deals']);
  const blocks = page.body.blocks as Record<string, unknown>[];
  assert.deepEqual(blocks[0], { kind: 'note', lead: true, span: 12, body: 'Role: {{people#2.role}}' });
  assert.equal(blocks[1]!.where, 'name is Bo Chen');
  assert.deepEqual(
    blocks.slice(2).map((b) => [b.heading, b.where]),
    [
      ['Tasks', 'who is Bo Chen'],
      ['Deals', 'with has Bo Chen'],
    ],
  );
  assert.deepEqual(calmFaults([{ id: page.id, blocks }]), [], 'the page bar a model page is repaired to');
  const ada = drafts.find((d) => d.question.startsWith('Give Ada Lovelace'))!;
  assert.match(ada.question, /You have met them 6 times, and they have no page yet\./u);
  /* NO EM DASH AND NO ID in what a person reads. */
  for (const d of drafts) {
    assert.doesNotMatch(d.question, /—|#\d|people\b/u);
  }
  sql.close();
});

test('the drafts are filed through the look as rule drafts, keyed by the page, and wait on a young record', async () => {
  const { sql, k, clock } = await record();
  const usage = readUsage(sql, k, clock.now());
  const seen = noticeUsage(usage, []);
  assert.deepEqual(
    seen.drafts.filter((d) => d.question.startsWith('Give ')).map((d) => d.key),
    ['pages:page.ada-lovelace', 'pages:page.bo-chen'],
    'a page declined is not asked about again',
  );
  /* A RECORD TWO DAYS OLD IS WATCHED, NOT ADVISED. */
  assert.deepEqual(noticeUsage({ ...usage, ageDays: 2 }, []).drafts, []);
  /* A PARTIAL READING DRAFTS NOTHING. */
  assert.deepEqual(noticeUsage(usage, [], true).drafts, []);
  sql.close();
});

/** A reading with nothing in it but the entities named. */
const reading = (entities: EntityUse[], pages: Usage['pages'] = []): Usage => ({
  at: new Date(NOW).toISOString(),
  firstWrite: '2026-01-01T00:00:00.000Z',
  ageDays: 270,
  listening: { pages: false, lists: false },
  lists: [
    { id: 'things', name: 'Projects', pack: 'portfolio', rows: 4, added30: 0, addedDays30: 0, writes90: 0, reads90: 0, agentWrites30: 0, declaredAt: '2026-01-01' },
    { id: 'tasks', name: 'Tasks', pack: 'work', rows: 9, added30: 0, addedDays30: 0, writes90: 0, reads90: 0, agentWrites30: 0, declaredAt: '2026-01-01' },
  ],
  pages,
  agents: [],
  packs: [],
  speaking: null,
  writes: { all30: 0, agents30: 0, agents90: 0 },
  tone: null,
  skills: null,
  entities,
});

const KILN: EntityUse = {
  kind: 'project',
  list: 'things',
  listName: 'Projects',
  seq: 3,
  name: 'Kiln',
  title: 'name',
  met: 0,
  linked: 5,
  links: [{ list: 'tasks', name: 'Tasks', field: 'thing', many: false, rows: 5 }],
  facts: [{ field: 'state', label: 'State', as: 'fact' }],
  lead: { field: 'state', label: 'state' },
};

test('a project is drafted in the rail beside its list, and a name already a page, or one a where cannot say, is not', () => {
  const projects = { slug: 'projects', title: 'Projects', titled: true, pack: 'portfolio', registers: ['things'], opens30: 0, openDays30: 0, opens90: 0, lastOpened: null, declaredAt: '2026-01-01' };
  const [kiln] = entityDrafts(reading([KILN], [projects]));
  assert.equal(kiln!.question, 'Give Kiln a page of its own? 5 things here name it, and it has no page yet.');
  const body = (kiln!.body.pages as { body: Record<string, unknown> }[])[0]!.body;
  assert.deepEqual(body.nav, { section: 'Projects', order: 60 });
  assert.equal((body.blocks as { body?: string }[])[0]!.body, 'State: {{things#3.state}}');

  assert.deepEqual(entityDrafts(reading([KILN], [{ ...projects, slug: 'kiln-home', title: 'Kiln' }])), [], 'a page called Kiln is its page');
  assert.deepEqual(entityDrafts(reading([{ ...KILN, name: 'Pell, Vine' }])), []);
  assert.deepEqual(entityDrafts(reading([{ ...KILN, name: 'Salt or Pepper' }])), []);
  assert.deepEqual(entityDrafts(reading([{ ...KILN, lead: null }])), [], 'a page with no figure to lead on would fail the bar');
  /* A HEADING IN THE SYSTEM'S WORDS FAILS THE BAR, so the draft is not made rather than filed and refused. */
  assert.deepEqual(entityDrafts(reading([{ ...KILN, links: [{ list: 'tasks', name: 'Reading list', field: 'thing', many: false, rows: 5 }] }])), []);
  /* AT MOST TWO A LOOK. */
  const many = ['Kiln', 'Portage', 'Halden', 'Marsh'].map((name, i) => ({ ...KILN, name, seq: i + 1 }));
  assert.equal(entityDrafts(reading(many)).length, 2);
});
