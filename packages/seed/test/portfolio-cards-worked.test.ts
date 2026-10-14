/**
 * Every project in play says how long since anybody worked on it, on its card on Projects (REC-C16's left part, W096).
 *
 * A QUIET PROJECT WAS SEEN ONLY INSIDE IT. A project page's Where it stands reads `project-last-worked`, the days since
 * the newest write on any of its tasks, and the In play cards on Projects read none of it, so a project nobody had
 * touched for a month looked like every other card. The card's line is "Worked on 2 days ago", or "Quiet for 40 days"
 * in the late tone once the figure misses its target of thirty days, and a project with no task draws no line, never
 * nought.
 *
 * WHAT IS HERE AND WHAT WAITS. The figure, its verdict and its reading for each card's own name are tested on a seeded
 * record now. The column on the card, `{ metric: 'project-last-worked:{{name}}', as: 'when' }`, waits on the kernel:
 * a card takes a figure only as its trend today (`declare.ts`), so the last test is skipped until In play declares it,
 * and then holds the record's answer for each card to the same numbers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fill, openRecord, type Kernel, type MetricDecl, type PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { lintAnswer } from '../../record/src/page-lint.ts';

import { NOW, installSeed } from '../src/index.ts';
import { PORTFOLIO_PAGES } from '../src/modules/portfolio.ts';

const PERSON = { actor: 'p_1' };
const DAY = 86_400_000;
const COLUMN = 'project-last-worked:{{name}}';

let clock = fixedClock(NOW);

/**
 * The sample record with three more projects in play: Harbour, whose task was written two days ago; Quarry, whose task
 * was last written forty days ago; and Lantern, which has no task at all.
 */
async function seeded(): Promise<Kernel> {
  clock = fixedClock(NOW);
  const k = await openRecord(openSqlite(), clock);
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  const project = (name: string): string => {
    const made = k.create('things', { name, lane: 'building' }, PERSON);
    assert.ok(made.ok, sayOf(made));
    return `things#${made.value.seq}`;
  };
  const harbour = project('Harbour');
  const quarry = project('Quarry');
  project('Lantern');
  clock.set(NOW - 40 * DAY);
  assert.ok(k.create('tasks', { what: 'Price the stone', thing: quarry, state: 'open' }, PERSON).ok);
  clock.set(NOW - 2 * DAY);
  assert.ok(k.create('tasks', { what: 'Ship the first build', thing: harbour, state: 'open' }, PERSON).ok);
  clock.set(NOW);
  return k;
}

type Cards = PageResult['blocks'][number] & { rows?: { fields: Record<string, unknown> }[]; whens?: ({ value: number | null; met: boolean | null } | null)[] };

/** Projects as the app reads it, its In play cards, and nothing on it the copy check finds. */
function inPlay(k: Kernel): { page: PageResult; cards: Cards } {
  const out = k.page('portfolio');
  assert.ok(out.ok, sayOf(out));
  const cards = (out.value.blocks as Cards[]).find((b) => b.heading === 'In play' && b.kind === 'cards' && b.drawn !== false);
  assert.ok(cards, 'Projects draws its In play cards');
  assert.deepEqual(cards.refusals ?? [], [], JSON.stringify(cards.refusals));
  return { page: out.value, cards };
}

/** What the card's figure reads for one card: the column's id filled from the card's own name, as a card's trend is. */
function worked(k: Kernel, name: string): { value: number | null; met: boolean | null } {
  const filled = COLUMN.replace('{{name}}', name);
  const at = filled.indexOf(':');
  const decl = k.metricDecl(filled.slice(0, at));
  assert.ok(decl, 'Work declares project-last-worked');
  const read = k.metric(fill(decl, null, filled.slice(at + 1)) as MetricDecl);
  assert.ok(read.ok, sayOf(read));
  return { value: read.value.value, met: read.value.met };
}

const names = (cards: Cards): string[] => (cards.rows ?? []).map((r) => String(r.fields.name));

test('A CARD WHOSE PROJECT HAD A TASK WRITTEN TWO DAYS AGO READS 2 DAYS, and is not quiet', async () => {
  const k = await seeded();
  const { cards } = inPlay(k);
  assert.ok(names(cards).includes('Harbour'), names(cards).join(', '));
  assert.deepEqual(worked(k, 'Harbour'), { value: 2, met: true });
});

test('A CARD WHOSE PROJECT HAS NO TASK READS NO LINE, never a nought that says worked on today', async () => {
  const k = await seeded();
  const { cards } = inPlay(k);
  assert.ok(names(cards).includes('Lantern'));
  const read = worked(k, 'Lantern');
  assert.equal(read.value, null);
  assert.notEqual(read.met, false, 'nothing to read is not late');
});

test('FORTY DAYS WITH NOTHING WRITTEN MISSES THE THIRTY-DAY TARGET, so the card says it is quiet', async () => {
  const k = await seeded();
  assert.deepEqual(worked(k, 'Quarry'), { value: 40, met: false });
  assert.deepEqual(k.metricDecl('project-last-worked')?.target, { lte: 30 });
});

test('PROJECTS LINTS CLEAN with the three projects on it: no id, no time and no em dash a person reads', async () => {
  const k = await seeded();
  assert.deepEqual(lintAnswer(inPlay(k).page, null), []);
});

/* THE CARD ITSELF, once the kernel takes a figure as a card's `when`. Until then In play does not declare the column. */
const declared = (): boolean => {
  return (PORTFOLIO_PAGES.portfolio!.blocks as { heading?: string; columns?: { metric?: string; as?: string }[] }[]).some(
    (b) => b.heading === 'In play' && (b.columns ?? []).some((c) => c.metric === COLUMN && c.as === 'when'),
  );
};

test('EACH CARD IN PLAY CARRIES ITS DAYS, the same numbers the figure reads', { skip: declared() ? false : 'waits on the kernel taking a figure as a card when' }, async () => {
  const k = await seeded();
  const { cards } = inPlay(k);
  const whens = cards.whens ?? [];
  assert.equal(whens.length, (cards.rows ?? []).length, 'one answer a card');
  const by = new Map(names(cards).map((n, i) => [n, whens[i] ?? null]));
  assert.deepEqual(by.get('Harbour'), { value: 2, met: true });
  assert.equal(by.get('Lantern'), null, 'no task draws no line');
  assert.deepEqual(by.get('Quarry'), { value: 40, met: false });
});
