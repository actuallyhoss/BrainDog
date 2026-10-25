/**
 * A project card's who and when from the record's one figure (the audit of 25 October, Z7): Projects said "Worked on 4
 * days ago" of a project Today said "Claude worked on it 20 minutes ago" of, because Projects read the tasks and Today the
 * runs. Both read `project-worked` now, which reads them together, and draw it through `withWorked` and `lifeOf`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { workedAtOf } from '../record/page-live.ts';
import { WORKED_FIGURE, projectsTile } from './default-home.ts';
import { lifeOf, withWorked } from './project-cards.ts';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const DAY = 86_400_000;

test("TODAY'S PROJECTS READ THE RECORD'S ONE FIGURE OF WHEN EACH WAS WORKED ON, the one Projects' cards read", () => {
  const tile = projectsTile({ register: 'things', title: 'name', name: 'Projects' }) as unknown as { columns?: readonly { metric?: string; as?: string }[] };
  const when = tile.columns?.find((c) => c.as === 'when');
  assert.equal(when?.metric, `${WORKED_FIGURE}:{{name}}`, 'Today read the runs alone');
});

test('A RUN TWENTY MINUTES AGO IS SAID THE SAME ON EVERY CARD, and a task written last is said with no agent', () => {
  const entries = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
  const whens = [
    { value: 0, met: true, at: ago(20 * MIN), by: 'claude' },
    { value: 4, met: true, at: ago(4 * DAY), by: null },
    { value: 4, met: true },
  ].map(workedAtOf);
  assert.equal(whens[2], null, 'a reading with no moment said one');
  const cards = withWorked(
    [1, 2, 3].map((seq) => ({ seq, worked: null, last: null, moved: null })),
    entries,
    whens,
    NOW,
  );
  assert.deepEqual(
    cards.map((c) => lifeOf(c, [])?.said ?? null),
    ['Worked on 20 minutes ago', 'Worked on 4 days ago', null],
    'the card did not say the figure',
  );
  assert.deepEqual(
    cards.map((c) => c.told ?? false),
    [true, true, false],
    'a card the figure read nothing for would not fall back on the runs read beside it',
  );
});

test('PAST ITS THIRTY DAYS A PROJECT IS QUIET, whoever worked on it last', () => {
  const [quiet] = withWorked([{ seq: 5, worked: null, last: null, moved: null }], [{ seq: 5 }], [workedAtOf({ value: 40, met: false, at: ago(40 * DAY), by: 'codex' })], NOW);
  const life = quiet ? lifeOf(quiet, []) : null;
  assert.equal(life?.kind, 'worked');
  assert.match(life?.said ?? '', /^Quiet for /u);
});
