/**
 * Where a project stands is said, by somebody or by what happened on it (REC-C16 job 1, and REC-C08 step 6; portfolio
 * 1.16.0).
 *
 * HIS RECORD WAS A DASH. A project page's Where it stands read four typed fields, health, progress, aim and agent, and
 * nothing in the product fills them, so on every imported project the tile was a dash and nothing else. Since 1.16.0
 * the card is drawn only while one of the four is said, and otherwise the same heading draws the project's own figures:
 * what was worked on this week, beside At a glance's Open straight above. That is the default until his second sitting
 * proposes a health and an aim for each project, and nothing is written without his yes.
 *
 * AND PROJECTS SAYS HOW MANY SAY WHAT THEY EARN. The split of what each one earns is hidden while none says, so a record
 * where nobody had said read nothing about earnings at all. One line now stands beside it, counted and never summed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, installSeed } from '../src/index.ts';
import { PORTFOLIO_PAGES } from '../src/modules/portfolio.ts';

const PERSON = { actor: 'p_1' };

const DAY = 86_400_000;

/** The record's clock, kept so a test can write a task on a day before today. */
let clock = fixedClock(NOW);

async function seeded(): Promise<Kernel> {
  clock = fixedClock(NOW);
  const k = await openRecord(openSqlite(), clock);
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const opened = (k: Kernel, slug: string): PageResult => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  return out.value;
};

type Drawn = PageResult['blocks'][number] & { readings?: { metric: string; label?: string; reading: { value: unknown } | null }[]; body?: string; values?: Record<string, unknown> };

/** Every block under `heading`, drawn or not, so a test can say which one of a pair the record drew. */
const headed = (p: PageResult, heading: string): Drawn[] => p.blocks.filter((b) => b.heading === heading) as Drawn[];

/** The slug of the page a project was given, found by its title. */
const pageOf = (k: Kernel, name: string): string => {
  const page = (k.pages() as unknown as { slug: string; title: string }[]).find((p) => p.title === name);
  assert.ok(page, `${name} has no page`);
  return page.slug;
};

const reading = (b: Drawn | undefined, metric: string): unknown => b?.readings?.find((r) => r.metric.startsWith(metric))?.reading?.value;

test('A PROJECT NOBODY HAS DESCRIBED SAYS WHERE IT STANDS FROM ITS TASKS: 2 open, 2 changed this week, and no dash', async () => {
  const k = await seeded();
  const made = k.create('things', { name: 'Harbour', lane: 'building' }, PERSON);
  assert.ok(made.ok, sayOf(made));
  const spoken = `things#${made.value.seq}`;
  for (const what of ['Ship the first build', 'Write the store listing']) assert.ok(k.create('tasks', { what, thing: spoken, state: 'open' }, PERSON).ok);

  const page = opened(k, pageOf(k, 'Harbour'));
  const stands = headed(page, 'Where it stands');
  assert.deepEqual(stands.map((b) => [b.kind, b.drawn !== false]), [['cards', false], ['stat', true]], 'the typed card is drawn over a project nobody described');
  const figures = stands[1]!;
  assert.deepEqual(figures.refusals, [], JSON.stringify(figures.refusals));
  assert.equal(reading(figures, 'project-moved-7d'), 2, 'the two tasks written this week');

  const glance = page.blocks.find((b) => b.heading === 'At a glance') as Drawn;
  assert.equal(reading(glance, 'project-open'), 2, 'At a glance does not read 2 open');
  /* OPEN IS SAID ONCE, by At a glance, and not again under Where it stands. */
  assert.ok(!(figures.readings ?? []).some((r) => r.metric.startsWith('project-open')), 'Open is said twice');
});

test('ONCE SOMEBODY SAYS HOW IT IS GOING, THE CARD IS DRAWN in place of the figures', async () => {
  const k = await seeded();
  const made = k.create('things', { name: 'Harbour', lane: 'building' }, PERSON);
  assert.ok(made.ok, sayOf(made));
  assert.ok(k.update('things', `things#${made.value.seq}`, { health: 'at_risk' }, PERSON).ok);

  const stands = headed(opened(k, pageOf(k, 'Harbour')), 'Where it stands');
  assert.deepEqual(stands.map((b) => [b.kind, b.drawn !== false]), [['cards', true], ['stat', false]]);
  assert.deepEqual((stands[0] as Drawn & { rows: { fields: Record<string, unknown> }[] }).rows.map((r) => r.fields.health), ['at_risk']);
});

test('THE TEMPLATE SAYS IT IN ONE HEADING, the card first, each on its own clause', () => {
  const blocks = PORTFOLIO_PAGES.project!.blocks as { heading?: string; kind: string; when?: { metric?: string; gt?: number; is?: number } }[];
  const stands = blocks.filter((b) => b.heading === 'Where it stands');
  assert.deepEqual(stands.map((b) => [b.kind, b.when]), [
    ['cards', { metric: 'project-said:{{name}}', gt: 0 }],
    ['stat', { metric: 'project-said:{{name}}', is: 0 }],
  ]);
});

test('THE FIGURES ARE WHAT CHANGED THIS WEEK AND HOW LONG SINCE IT WAS LAST WORKED, in that order', () => {
  const blocks = PORTFOLIO_PAGES.project!.blocks as { key?: string; cells?: { metric: string; label: string }[] }[];
  const figures = blocks.find((b) => b.key === 'stands-figures');
  assert.deepEqual(figures?.cells?.map((c) => [c.metric, c.label]), [
    ['project-moved-7d:{{name}}', 'Changed this week'],
    ['project-worked:{{name}}', 'Last worked'],
  ]);
});

test('LAST WORKED IS THE DAYS SINCE THE NEWEST WRITE ON ANY OF ITS TASKS, read off the record and not a typed day', async () => {
  const k = await seeded();
  const made = k.create('things', { name: 'Harbour', lane: 'building' }, PERSON);
  assert.ok(made.ok, sayOf(made));
  const spoken = `things#${made.value.seq}`;
  /* ONE TASK MADE NINE DAYS AGO, ANOTHER MADE THEN AND MOVED FIVE DAYS LATER: the newest write is four days old. */
  clock.set(NOW - 9 * DAY);
  assert.ok(k.create('tasks', { what: 'Ship the first build', thing: spoken, state: 'open' }, PERSON).ok);
  const moved = k.create('tasks', { what: 'Write the store listing', thing: spoken, state: 'open' }, PERSON);
  assert.ok(moved.ok, sayOf(moved));
  clock.set(NOW - 4 * DAY);
  assert.ok(k.update('tasks', `tasks#${moved.value.seq}`, { state: 'doing' }, PERSON).ok);
  clock.set(NOW);

  const figures = headed(opened(k, pageOf(k, 'Harbour')), 'Where it stands')[1]!;
  assert.notEqual(figures.drawn, false);
  assert.deepEqual(figures.refusals, [], JSON.stringify(figures.refusals));
  assert.equal(reading(figures, 'project-worked'), 4, 'the newest write on its tasks was four days ago');
  assert.equal(reading(figures, 'project-moved-7d'), 1, 'and one task was written this week');

  /* AND A RUN IN IT HEARD FROM TWENTY MINUTES AGO IS NEWER (the audit of 25 October, Z7): Last worked read the tasks
     alone and said four days while Today said twenty minutes. */
  assert.ok(k.create('session', { doing: 'Work', agent: 'claude', state: 'idle' }, { ...PERSON, stamp: { last_seen: new Date(NOW - 20 * 60_000).toISOString(), project: spoken } }).ok);
  const after = headed(opened(k, pageOf(k, 'Harbour')), 'Where it stands')[1]!;
  assert.equal(reading(after, 'project-worked'), 0, 'a run in it twenty minutes ago was left out');
});

test('A PROJECT WITH NO TASK HAS NO LAST WORKED, never a nought that reads as worked on today', async () => {
  const k = await seeded();
  assert.ok(k.create('things', { name: 'Harbour', lane: 'building' }, PERSON).ok);
  const figures = headed(opened(k, pageOf(k, 'Harbour')), 'Where it stands')[1]!;
  assert.deepEqual(figures.refusals, [], JSON.stringify(figures.refusals));
  assert.equal(reading(figures, 'project-worked') ?? null, null);
  assert.equal(reading(figures, 'project-moved-7d'), 0);
});

/* ── the line beside what each one earns ────────────────────────────────── */

/** The line as the Overview drew it: the one note that counts the projects saying what they earned. */
const earnsLine = (p: PageResult): Drawn[] => (p.blocks as Drawn[]).filter((b) => b.kind === 'note' && typeof b.body === 'string' && b.body.includes('say what they earned'));

test('PROJECTS SAYS NO COUNT OF THOSE IN PLAY THAT SAY WHAT THEY EARNED, since the split says it by being drawn', async () => {
  const k = await seeded();
  /* CUT IN BATCH 6: "3 of 3 projects in play say what they earned in a year" sat in a grey box beside the split, and the figure
     stays declared for the split's own gate. */
  assert.equal(earnsLine(opened(k, 'portfolio')).length, 0, 'the line is declared again');
  /* AND SINCE portfolio 1.30.0 NO SPLIT EITHER: the board's Earning, a month says what each brings in, beside its headline. */
  const split = (opened(k, 'portfolio').blocks as Drawn[]).filter((b) => b.heading === 'What each one earns');
  assert.equal(split.length, 0, 'the split of the year each typed is declared again');
  const board = (opened(k, 'portfolio').blocks as (Drawn & { key?: unknown })[]).filter((b) => b.key === 'board' && b.drawn !== false);
  assert.equal(board.length, 1, 'the board is drawn once');
});

test('WITH NONE SAYING, THE LINE GOES WITH THE SPLIT: neither is drawn', async () => {
  const k = await seeded();
  /* EVERY PROJECT IN PLAY FORGETS WHAT IT EARNED, as on an imported record where nobody has said. */
  const listed = k.list({ register: 'things', limit: 100 });
  assert.ok(listed.ok, sayOf(listed));
  const earning = listed.value.rows.filter((r) => r.fields.revenue !== undefined && r.fields.revenue !== null);
  assert.ok(earning.length > 0, 'the sample says what some projects earn');
  for (const row of earning) assert.ok(k.update('things', `things#${row.seq}`, { revenue: null }, PERSON).ok);
  const page = opened(k, 'portfolio');
  const line = earnsLine(page).filter((b) => b.drawn !== false);
  /* SINCE portfolio 1.17.0 THE LINE IS DRAWN ONLY WHILE ONE SAYS: "0 of 3 projects in play say what they earned in a
     year" read as a telling off on a record that never meant to say. */
  assert.equal(line.length, 0, 'the line goes with the split');
  const split = (page.blocks as Drawn[]).filter((b) => b.heading === 'What each one earns' && b.drawn !== false);
  assert.deepEqual(split, [], 'the split is drawn over nothing');
});
