import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS as SEED } from '@braindog/seed';

import type { Fields, RegisterDecl } from '../record/schema.ts';
import { shapeOf } from './board.ts';
import {
  agentSaid,
  drawnBand,
  holdOf,
  inWhose,
  lateBy,
  sentenceOf,
  staleOf,
  statsOf,
  tierColumns,
  tierCounts,
  tierReading,
  tierTones,
  whoseCounts,
} from './work-tiles.ts';

const shape = shapeOf(SEED.tasks as unknown as RegisterDecl);
const TODAY = '2026-09-29';
const ME = 7;
const mine = (owner: number) => owner === ME;

let n = 0;
const task = (fields: Fields) => ({ seq: ++n, fields: { what: `Task ${n}`, state: 'open', ...fields } });

test('a task is the agent’s that names one, the reader’s that nobody holds, and another person’s by its owner', () => {
  assert.equal(holdOf({ agent: 'claude' }, shape, mine), 'agent');
  assert.equal(holdOf({ agent: '  ' }, shape, mine), 'you');
  assert.equal(holdOf({}, shape, mine), 'you');
  assert.equal(holdOf({ owner: ME }, shape, mine), 'you');
  assert.equal(holdOf({ owner: 3 }, shape, mine), 'other');
  assert.equal(inWhose({ owner: 3 }, shape, 'yours', mine), false);
  assert.equal(inWhose({ owner: 3 }, shape, 'all', mine), true);
  assert.equal(inWhose({ agent: 'codex' }, shape, 'agents', mine), true);
});

test('the toolbar counts open work only, and a task another person holds is in All but not in Yours', () => {
  const rows = [task({}), task({ agent: 'claude' }), task({ owner: 3 }), task({ state: 'done' }), { seq: -1, fields: { what: 'typed', state: 'open' } }];
  assert.deepEqual(whoseCounts(rows, shape, mine), { yours: 1, agents: 1, all: 3 });
});

test('an agent’s task waiting on review is drawn with the agents, and says it needs you', () => {
  const f: Fields = { state: 'review', agent: 'claude' };
  assert.equal(drawnBand(f, shape, TODAY), 'agent');
  assert.equal(drawnBand({ state: 'review' }, shape, TODAY), 'waiting');
  assert.deepEqual(agentSaid(f, shape), { words: 'waits on your review', tone: 'danger' });
  assert.deepEqual(agentSaid({ state: 'blocked', agent: 'codex' }, shape), { words: 'blocked', tone: 'warn' });
  assert.deepEqual(agentSaid({ state: 'open', agent: 'codex' }, shape), { words: 'queued', tone: '' });
  assert.deepEqual(agentSaid({ state: 'doing', agent: 'codex' }, shape), { words: 'working', tone: 'live' });
  /* LATE WHOEVER HOLDS IT: the day still comes first. */
  assert.equal(drawnBand({ state: 'review', agent: 'claude', by: '2026-09-01' }, shape, TODAY), 'overdue');
});

test('the sentence names the late ones first and in red, then the day, then the review', () => {
  const rows = [
    task({ by: '2026-09-20' }),
    task({ by: '2026-09-28' }),
    task({ by: TODAY }),
    task({}),
    task({ state: 'review', agent: 'claude' }),
    task({ by: '2026-09-01', agent: 'codex' }),
  ];
  const st = statsOf(rows, shape, TODAY, mine);
  assert.deepEqual(st, { yours: 4, late: 2, today: 1, reviews: ['claude'] });
  assert.deepEqual(sentenceOf(st), { text: '2 of your 4 are late and 1 is due today; claude waits on your review.', needs: '2 of your 4 are late' });
  assert.deepEqual(sentenceOf({ yours: 50, late: 1, today: 0, reviews: [] }), { text: '1 of your 50 is late.', needs: '1 of your 50 is late' });
});

test('with nothing late, the review is what needs you, and with nothing at all there is no sentence', () => {
  assert.deepEqual(sentenceOf({ yours: 3, late: 0, today: 1, reviews: [] }), { text: 'Nothing of yours is late. 1 is due today.', needs: '' });
  assert.deepEqual(sentenceOf({ yours: 3, late: 0, today: 0, reviews: ['claude', 'codex'] }), {
    text: 'Nothing of yours is late. Claude and codex wait on your review.',
    needs: 'Claude and codex wait on your review',
  });
  assert.deepEqual(sentenceOf({ yours: 0, late: 0, today: 0, reviews: ['cursor'] }), {
    text: 'Nothing of yours is open. Cursor waits on your review.',
    needs: 'Cursor waits on your review',
  });
  assert.equal(sentenceOf({ yours: 0, late: 0, today: 0, reviews: [] }), null);
});

test('the tiers are red only when the first one says urgent, then ink and greys a step apart', () => {
  assert.deepEqual(tierTones(['urgent', 'high', 'normal', 'low'], {}), ['danger', 'ink', 'g2', 'g3']);
  assert.deepEqual(tierTones(['p1', 'p2', 'p3'], { p1: 'First', p2: 'Second', p3: 'Third' }), ['ink', 'g2', 'g3']);
});

test('open work by tier, yours against the agents’, with the unranked last and only when there are some', () => {
  const rows = [
    task({ priority: 'urgent', agent: 'claude', state: 'review' }),
    task({ priority: 'urgent', agent: 'codex' }),
    task({ priority: 'urgent' }),
    task({ priority: 'high' }),
    task({}),
    task({ priority: 'low', state: 'done' }),
  ];
  const t = tierCounts(rows, shape, mine)!;
  assert.deepEqual(
    t.parts.map((p) => [p.value, p.yours, p.agents, p.review, p.tone]),
    [
      ['urgent', 1, 2, 1, 'danger'],
      ['high', 1, 0, 0, 'ink'],
      ['normal', 0, 0, 0, 'g2'],
      ['low', 0, 0, 0, 'g3'],
      [null, 1, 0, 0, 'g4'],
    ],
  );
  assert.equal(t.yours, 3);
  assert.equal(t.agents, 2);
  assert.equal(t.people, false);
  assert.equal(tierReading(t), 'Agents hold 2 of the 3 urgent tasks. One of them waits on your review.');
  assert.equal(tierCounts(rows, { ...shape, priority: null }, mine), null);
});

test('the tier reading says who holds the top tier in each case, and falls to the next tier when it is empty', () => {
  const part = (value: string | null, yours: number, agents: number, review = 0) => ({ value, label: value ?? 'unranked', yours, agents, review, tone: 'ink' as const });
  const chart = (...parts: ReturnType<typeof part>[]) => ({ parts, people: false, yours: 0, agents: 0 });
  assert.equal(tierReading(chart(part('urgent', 3, 0))), 'All 3 urgent tasks are yours.');
  assert.equal(tierReading(chart(part('urgent', 1, 0))), 'The one urgent task is yours.');
  assert.equal(tierReading(chart(part('urgent', 0, 2, 2))), 'Agents hold all 2 urgent tasks. 2 of them wait on your review.');
  assert.equal(tierReading(chart(part('urgent', 0, 1, 1))), 'An agent holds the one urgent task. It waits on your review.');
  assert.equal(tierReading(chart(part('urgent', 0, 0), part('high', 2, 3))), 'Nothing is urgent. The most pressing are 5 high.');
  assert.equal(tierReading(chart(part('urgent', 0, 0), part(null, 4, 0))), 'Nothing open is ranked yet.');
});

test('the two waffles take columns so they stand about as tall, and scale past 200 squares', () => {
  assert.deepEqual(tierColumns(50, 78), { yours: 10, agents: 16, scale: 1 });
  assert.deepEqual(tierColumns(3, 0), { yours: 3, agents: 1, scale: 1 });
  const big = tierColumns(1000, 1000);
  assert.equal(big.scale, 0.1);
  assert.ok(big.yours * 8 >= 100 && big.agents * 8 >= 100);
});

test('a task that has not changed in 90 days has not moved, and finished ones never count', () => {
  const a = task({});
  const b = task({});
  const c = task({ state: 'done' });
  const moved = new Map([
    [a.seq, '2026-06-01T10:00:00Z'],
    [b.seq, '2026-09-01T10:00:00Z'],
    [c.seq, '2026-01-01T10:00:00Z'],
  ]);
  const s = staleOf([a, b, c], shape, (seq) => moved.get(seq), TODAY);
  assert.deepEqual([...s.seqs], [a.seq]);
  assert.equal(s.since, '2026-07-01');
});

test('lateness is said in days', () => {
  assert.equal(lateBy('2026-09-28', TODAY), '1 day late');
  assert.equal(lateBy('2026-09-24', TODAY), '5 days late');
});
