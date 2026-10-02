/**
 * The figures a record has without a pack declaring them: `questions-open`, how many questions are waiting.
 *
 * WHAT WAS MEASURED BEFORE IT: Money's 'Waiting on you' could not be gated with `when:`, because every figure reads a
 * list and the questions are not rows of one, so on an empty record the tile drew its cleared line to nobody.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countOpenQuestions } from '../src/govern.ts';
import { BUILT_IN_FIGURES, builtInFigure } from '../src/built-in-figures.ts';
import { registersOfBlock, WHOLE_RECORD, type PageBlock } from '../src/pages.ts';
import { openRecord, type Declaration, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 86_400_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };

const WAITING = { kind: 'note', heading: 'Waiting on you', body: '{{questions-open}} question(s) waiting.', when: { metric: 'questions-open', gt: 0 } } as PageBlock;

test('A PAGE GATES A BLOCK ON THE OPEN QUESTIONS with no figure declared, and it draws once one is asked', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);

  const empty = k.block(WAITING);
  assert.equal(empty.drawn, false, 'the tile drew on a record nobody had asked anything of');
  assert.deepEqual(empty.refusals, []);

  const asked = value<{ id: string }>(k.propose({ question: 'Raise the retainer?', body_kind: 'options', body: OPTIONS }, 'slash'));
  value(k.propose({ question: 'Pay the bill?', body_kind: 'options', body: OPTIONS }, 'slash'));
  const two = k.block(WAITING);
  assert.notEqual(two.drawn, false);
  assert.equal(two.values?.['questions-open'], 2, 'the heading cannot say how many');

  /* A STAT READS IT AS IT READS ANY FIGURE, and it is the queue's own count: a question put off is not waiting. */
  const stat = k.block({ kind: 'stat', cells: [{ metric: 'questions-open' }] });
  assert.equal(stat.readings?.[0]?.reading?.value, 2);
  value(k.decide(asked.id, { defer: { until: new Date(NOW + 3 * DAY).toISOString(), why: 'after the quarter closes' } }, 'p_1'));
  const read = value<Reading>(k.metric(BUILT_IN_FIGURES['questions-open']!));
  assert.equal(read.value, 1);
  assert.equal(read.value, countOpenQuestions({ sql, nowMs: clock.now() }), 'the figure and the queue count two different things');
  assert.equal(read.met, false, 'a question waiting is not the figure on its target');
  sql.close();
});

test('A DECLARED FIGURE OF THE SAME NAME WINS, so nothing built in takes a name from a pack', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const own: Declaration = {
    id: 'metric.questions-open',
    kind: 'metric',
    body: { metric: 'questions-open', name: 'Mine', source: 'register.things', value: { count: 'id' }, format: 'int', target: { lte: 0 }, window: '7d', compare: 'none' } as never,
  };
  const things: Declaration = { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Things', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never };
  value(await k.install([things, own]));
  value(k.create('things', { what: 'one' }, { actor: 'p_1' }));
  value(k.create('things', { what: 'two' }, { actor: 'p_1' }));
  value(k.create('things', { what: 'three' }, { actor: 'p_1' }));
  assert.equal(k.block({ kind: 'stat', cells: [{ metric: 'questions-open' }] }).readings?.[0]?.reading?.value, 3);
  sql.close();
});

test('THE COUNT IS A FACT ABOUT THE WHOLE RECORD, so a block gated on it is held as the queue is', () => {
  assert.equal(builtInFigure('constructor'), null);
  assert.deepEqual(registersOfBlock(WAITING, () => null), [WHOLE_RECORD]);
});

test('AND IT NAMES THE WHOLE RECORD TO WHOEVER ASKS WHICH LISTS IT READS, so the record does not answer a member the count', async () => {
  const { figureLists } = await import('../src/money-figures.ts');
  assert.deepEqual(figureLists(BUILT_IN_FIGURES['questions-open']!), [WHOLE_RECORD]);
});
