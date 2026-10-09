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

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
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

/* ── the line beside what each one earns ────────────────────────────────── */

/** The line as the Overview drew it: the one note that counts the projects saying what they earned. */
const earnsLine = (p: PageResult): Drawn[] => (p.blocks as Drawn[]).filter((b) => b.kind === 'note' && typeof b.body === 'string' && b.body.includes('say what they earned'));

test('PROJECTS SAYS HOW MANY OF THOSE IN PLAY SAY WHAT THEY EARNED, a count of each and never a sum', async () => {
  const k = await seeded();
  const lines = earnsLine(opened(k, 'portfolio'));
  /* DECLARED TWICE, open while short and folded when long, and the record draws exactly one. */
  assert.equal(lines.length, 2);
  const drawn = lines.filter((b) => b.drawn !== false);
  assert.equal(drawn.length, 1, 'the line is drawn once');
  assert.equal(drawn[0]!.body, '{{projects-earning-said}} of {{projects-live}} projects in play say what they earned in a year');
  assert.deepEqual(drawn[0]!.refusals ?? [], []);
  /* THE SAMPLE'S THREE IN PLAY EACH SAY, in whatever currency: "3 of 3". */
  assert.deepEqual(drawn[0]!.values, { 'projects-earning-said': 3, 'projects-live': 3 });
});

test('WITH NONE SAYING, THE LINE STANDS ALONE and the split stays hidden', async () => {
  const k = await seeded();
  /* EVERY PROJECT IN PLAY FORGETS WHAT IT EARNED, as on an imported record where nobody has said. */
  const listed = k.list({ register: 'things', limit: 100 });
  assert.ok(listed.ok, sayOf(listed));
  const earning = listed.value.rows.filter((r) => r.fields.revenue !== undefined && r.fields.revenue !== null);
  assert.ok(earning.length > 0, 'the sample says what some projects earn');
  for (const row of earning) assert.ok(k.update('things', `things#${row.seq}`, { revenue: null }, PERSON).ok);
  const page = opened(k, 'portfolio');
  const line = earnsLine(page).filter((b) => b.drawn !== false);
  assert.equal(line.length, 1, 'the line went with the split');
  /* "0 of 3", WHICH IS A SENTENCE A PERSON CAN ACT ON, where the page said nothing about earnings at all. */
  assert.deepEqual(line[0]!.values, { 'projects-earning-said': 0, 'projects-live': 3 });
  const split = (page.blocks as Drawn[]).filter((b) => b.heading === 'What each one earns' && b.drawn !== false);
  assert.deepEqual(split, [], 'the split is drawn over nothing');
});
