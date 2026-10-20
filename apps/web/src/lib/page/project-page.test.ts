import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../record/fixtures/fill.ts';
import { moreSaid, onProject, PLAN_BY_DATE } from './project-page.ts';

/* THE SEED'S PROJECT PAGE AS IT IS DECLARED, by kind, area and list (`portfolio.ts` `page.project`). */
type B = { kind: string; heading?: string; register?: string; area?: string; lead?: boolean; box?: boolean; fold?: boolean; span?: number; drawn?: boolean; total?: number; key?: string };
const PAGE: B[] = [
  { kind: 'note', lead: true, drawn: true },
  { kind: 'queue', heading: 'Waiting on you', drawn: true },
  { kind: 'stat', heading: 'At a glance', area: 'rail', drawn: true },
  { kind: 'cards', heading: 'Where it stands', register: 'things', area: 'rail', drawn: true },
  { kind: 'todo', heading: 'Handed back or blocked', register: 'tasks', area: 'rail', drawn: true },
  { kind: 'roadmap', heading: 'The plan', register: 'tasks', drawn: true, key: 'plan' },
  { kind: 'section', heading: 'More about Kiln', box: true, drawn: true },
  { kind: 'feed', heading: 'What changed', span: 6, drawn: true },
  { kind: 'cards', heading: 'Agents', register: 'session', span: 6, drawn: true },
  { kind: 'note', heading: 'Notes', drawn: true },
  { kind: 'series', heading: 'Money by month', drawn: true },
  { kind: 'table', heading: 'Bills and invoices', register: 'obligations', total: 9, span: 6, drawn: true },
  { kind: 'cards', heading: 'Keeping it alive', register: 'services', total: 7, span: 6, drawn: true },
  { kind: 'section', heading: 'Runs on', box: true, drawn: true },
];

test('A PROJECT SAYS EACH THING ONCE: the sentence, the rail, the series and the runs go, the questions stay (proj F1)', () => {
  const got = onProject(PAGE, 'things');
  const drawn = got.filter((b) => b.drawn !== false).map((b) => b.heading ?? b.kind);
  assert.deepEqual(drawn, ['Waiting on you', 'More about Kiln', 'Bills and invoices', 'Keeping it alive', 'Notes', 'What changed', PLAN_BY_DATE, 'Runs on']);
});

test('MORE ABOUT IS FOLDED, AND THE PLAN IS INSIDE IT AS PLAN BY DATE, keyed anew so no look lifts it (proj F1, F3)', () => {
  const got = onProject(PAGE, 'things');
  const more = got.find((b) => b.heading === 'More about Kiln')!;
  assert.equal(more.fold, true);
  const plan = got.filter((b) => b.heading === PLAN_BY_DATE);
  assert.equal(plan.length, 1, 'the plan is drawn once');
  assert.notEqual(plan[0]!.key, 'plan');
  assert.ok(got.indexOf(plan[0]!) > got.indexOf(more));
  assert.equal(moreSaid(got), 'Bills and invoices 9, keeping it alive 7, notes, what changed, plan by date');
});
