/**
 * A card's fact over a figure: `{ metric: 'project-open:{{name}}', as: 'fact', label: 'Open' }` on a cards block,
 * read once a card with the hole filled from the card's own row, so a list of projects says how many things each has open.
 *
 * WHAT WAS MEASURED BEFORE IT: a cards block could name a figure only as its trend or its when, so every fact on a project
 * card was a field somebody typed, and on a record nobody typed them the list said nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARD_FIGURE_FACTS_MOST, cardFactFault, cardFactsOver, factsOf, figureNamed } from '../src/card-facts.ts';
import type { Entry } from '../src/index.ts';
import type { MetricDecl, Reading } from '../src/metrics.ts';
import type { PageBlock, PageDeps } from '../src/pages.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const [ONE, TWO, THREE] = PROJECTS;

const row = (name: string, n: number): Entry => ({
  id: `p_${n}`,
  register: 'things',
  seq: n,
  fields: { name },
  state: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
});

const CARDS = [row(ONE, 1), row(TWO, 2), row(THREE, 3)];

const decl = (metric: string, more: Partial<MetricDecl> = {}): MetricDecl =>
  ({ metric, name: metric, source: 'register.tasks', where: 'thing is {{it}}, state is open', value: { count: 'id' }, ...more }) as unknown as MetricDecl;

const reading = (value: number | null, more: Partial<Reading> = {}): { ok: true; value: Reading } => ({
  ok: true,
  value: { value, unit: null, rows: value ?? 0, held: 0, delta: null, why: '', met: null, refusals: [], ...more } as Reading,
});

/* Open things a project, by the name its filled `where` holds: ONE 4, TWO nought, THREE 2. */
const OPEN: Record<string, number> = { [ONE]: 4, [TWO]: 0, [THREE]: 2 };
const nameIn = (d: MetricDecl): string => {
  const where = String((d as { where?: unknown }).where ?? '');
  return Object.keys(OPEN).find((n) => where.includes(`thing is ${n}`)) ?? '';
};

const deps = (figures: Record<string, MetricDecl>, read: PageDeps['read']): Pick<PageDeps, 'metric' | 'read'> => ({
  metric: (id) => figures[id] ?? null,
  read,
});

const cards = (columns: NonNullable<PageBlock['columns']>): PageBlock => ({ kind: 'cards', source: 'register.things', columns }) as PageBlock;

test('a figure counting open things gives each project card its own number', () => {
  const block = cards([{ field: 'name', as: 'title' }, { field: '', metric: 'project-open:{{name}}', as: 'fact', label: 'Open' }]);
  const got = factsOf(deps({ 'project-open': decl('project-open') }, (d) => reading(OPEN[nameIn(d)] ?? null)), block, CARDS);
  assert.deepEqual(got, { facts: [[4], [0], [2]] }, 'a project with nothing open says nought, which it read, not nothing');
});

test('a card whose figure reads nothing, is refused or cannot be filled says nothing, never nought', () => {
  const block = cards([
    { field: '', metric: 'project-open:{{name}}', as: 'fact', label: 'Open' },
    { field: '', metric: 'project-open:{{owner}}', as: 'fact', label: 'Theirs' },
    { field: '', metric: 'nobody-declared', as: 'fact', label: 'Lost' },
  ]);
  const read: PageDeps['read'] = (d) => (nameIn(d) === TWO ? { ok: false, error: { code: 'METRIC_UNKNOWN', fix: 'refused' } } : reading(nameIn(d) === THREE ? null : 4)) as never;
  const got = factsOf(deps({ 'project-open': decl('project-open') }, read), block, CARDS);
  assert.deepEqual(got.facts, [
    [4, null, null],
    [null, null, null],
    [null, null, null],
  ]);
});

test('money is carried with its currency, and two currencies are never added into one fact', () => {
  const block = cards([{ field: '', metric: 'project-owed:{{name}}', as: 'fact', label: 'Owed' }]);
  const read: PageDeps['read'] = (d) => {
    const n = nameIn(d);
    if (n === ONE) return reading(125000, { unit: 'usd' });
    if (n === TWO)
      return reading(null, {
        unit: null,
        parts: [
          { currency: 'USD', amount: 100 },
          { currency: 'EUR', amount: 200 },
        ] as never,
      });
    return reading(null);
  };
  const got = factsOf(deps({ 'project-owed': decl('project-owed', { value: { sum: 'amount' } } as never) }, read), block, CARDS);
  assert.deepEqual(got.facts, [[{ amount: 125000, currency: 'USD' }], [null], [null]]);
});

test('a figure read in parts is no one number a card', () => {
  const block = cards([{ field: '', metric: 'project-open:{{name}}', as: 'fact', label: 'Open' }]);
  const got = factsOf(deps({ 'project-open': decl('project-open', { group_by: 'state' } as never) }, () => reading(4)), block, CARDS);
  assert.deepEqual(got.facts, [[null], [null], [null]]);
});

test('a block with no fact over a figure answers nothing, and a block that is not cards reads none', () => {
  const none = deps({}, () => reading(1));
  assert.deepEqual(factsOf(none, cards([{ field: 'name', as: 'title' }, { field: 'stage', as: 'fact' }]), CARDS), {});
  assert.deepEqual(factsOf(none, { kind: 'table', columns: [{ field: '', metric: 'project-open:{{name}}', as: 'fact', label: 'Open' }] } as PageBlock, CARDS), {});
});

test('the figure and the parameter split at the first colon, as a trend names its figure', () => {
  assert.deepEqual(figureNamed('project-open:{{name}}'), { id: 'project-open', param: '{{name}}' });
  assert.deepEqual(figureNamed('project-open:a:b'), { id: 'project-open', param: 'a:b' });
  assert.deepEqual(figureNamed('open-things'), { id: 'open-things', param: null });
});

test('a fact over a figure is admitted on a cards block with a label, and refused anywhere else', () => {
  const good = { metric: 'project-open:{{name}}', as: 'fact', label: 'Open' };
  assert.equal(cardFactFault('page.projects', 'blocks[0]', good, 'cards'), null);
  assert.equal(cardFactFault('page.projects', 'blocks[0]', { field: 'name', as: 'fact' }, 'cards'), null, 'a field fact is not this check’s');
  const off = cardFactFault('page.projects', 'blocks[0]', good, 'table');
  assert.match(off ?? '', /only a card's fact, trend or when reads/);
  assert.match(cardFactFault('page.projects', 'blocks[0]', { ...good, field: 'name' }, 'cards') ?? '', /both a field and a metric/);
  assert.match(cardFactFault('page.projects', 'blocks[0]', { ...good, or: 'stage' }, 'cards') ?? '', /an or:/);
  assert.match(cardFactFault('page.projects', 'blocks[0]', { ...good, edit: true }, 'cards') ?? '', /never typed/);
  assert.match(cardFactFault('page.projects', 'blocks[0]', { ...good, edit: 'yes' }, 'cards') ?? '', /never typed/);
  assert.equal(cardFactFault('page.projects', 'blocks[0]', { ...good, edit: false }, 'cards'), null);
  assert.match(cardFactFault('page.projects', 'blocks[0]', { metric: 'project-open', as: 'fact' }, 'cards') ?? '', /has no label/);
  assert.match(cardFactFault('page.projects', 'blocks[0]', { ...good, label: ' ' }, 'cards') ?? '', /has no label/);
  assert.match(cardFactFault('page.projects', 'blocks[0]', { ...good, metric: 'Open Things:{{name}}' }, 'cards') ?? '', /names a figure by its id/);
  assert.match(cardFactFault('page.projects', 'blocks[0]', { ...good, metric: 7 }, 'cards') ?? '', /names a figure by its id/);
});

test('a fourth fact is refused, figures and fields counted together', () => {
  assert.equal(CARD_FIGURE_FACTS_MOST, 3);
  const three = [
    { field: 'name', as: 'title' },
    { field: 'stage', as: 'fact' },
    { field: 'where', as: 'scope' },
    { metric: 'project-open:{{name}}', as: 'fact', label: 'Open' },
  ];
  assert.equal(cardFactsOver('page.projects', 'blocks[0]', three), null);
  const four = [...three, { metric: 'project-owed:{{name}}', as: 'fact', label: 'Owed' }];
  assert.match(cardFactsOver('page.projects', 'blocks[0]', four) ?? '', /has 4 columns as fact\. .* at most 3 facts/);
  /* A column with no role is the renderer's to place, maybe as the title or the figure, so it is not counted, as `declare.ts` does not. */
  assert.equal(cardFactsOver('page.projects', 'blocks[0]', [{ field: 'name' }, { field: 'amount' }, ...three.slice(1)]), null);
});

test('a figure over a field nobody filled says nothing on the card, never nought', () => {
  const block = cards([{ field: '', metric: 'project-owed:{{name}}', as: 'fact', label: 'Owed' }]);
  const got = factsOf(deps({ 'project-owed': decl('project-owed') }, () => reading(0, { unsaid: true })), block, [CARDS[0]!]);
  assert.deepEqual(got.facts, [[null]]);
});

test('a card reads at most three facts over a figure, in column order', () => {
  const block = cards(['a', 'b', 'c', 'd'].map((k) => ({ field: '', metric: `fig-${k}:{{name}}`, as: 'fact', label: k })));
  const values: Record<string, number> = { 'fig-a': 1, 'fig-b': 2, 'fig-c': 3, 'fig-d': 4 };
  const got = factsOf(deps(Object.fromEntries(Object.keys(values).map((k) => [k, decl(k)])), (d) => reading(values[d.metric] ?? null)), block, [CARDS[0]!]);
  assert.deepEqual(got.facts, [[1, 2, 3]]);
});
