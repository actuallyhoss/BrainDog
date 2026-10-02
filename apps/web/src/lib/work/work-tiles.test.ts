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
