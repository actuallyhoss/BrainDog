/**
 * `headline-agrees` (EXP-E07): a number in a header that names questions, arrivals or agents equals `waiting()`, and a
 * header says nothing needs the reader only when no question and nothing in the inbox waits. A function now, held here;
 * the page lint (PRF-A04) runs it over every header later.
 *
 * The cases are the four headers on the owner's record on 7 October, which said "nothing", 25, 25 and 4 working.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { headlineAgrees, headlineFault, HOME_PAGE, homeRulesLine, type HeadlinePage } from '../src/headlines.ts';
import type { WaitingNow } from '../src/waiting.ts';

const HIS: WaitingNow = { questions: 25, late: 10, hard: 22, inbox: 32, working: 1 };

test('THE FOUR HEADERS OF 7 OCTOBER: the calm line and the four working are refused, the 25s agree', () => {
  assert.deepEqual(
    headlineAgrees('Nothing needs you, and four agents are working.', HIS).map((d) => [d.names, d.wrote, d.is]),
    [
      ['agents', 4, 1],
      ['nothing', 0, 57],
    ],
  );
  assert.deepEqual(headlineAgrees('Twenty-five questions wait on you. One of them is hard to undo.', HIS), []);
  assert.deepEqual(headlineAgrees('Twenty-five questions wait on you.', { ...HIS, questions: 5 }).map((d) => [d.wrote, d.is]), [[25, 5]]);
  assert.deepEqual(headlineAgrees('25 questions wait on you, ten of them for over two weeks.', HIS), []);
  assert.deepEqual(headlineAgrees('1 agent working now', HIS), []);
  assert.deepEqual(headlineAgrees('4 agents working now', HIS).map((d) => d.said), ['4 agents']);
});

test('A COUNT IN WORDS OR DIGITS, A WORD OR TWO BEFORE WHAT IT COUNTS, AND THE INBOX BY EITHER NAME', () => {
  assert.deepEqual(headlineAgrees('Seven open questions wait on you.', HIS).map((d) => [d.wrote, d.is]), [[7, 25]]);
  assert.deepEqual(headlineAgrees('32 arrivals wait to be filed.', HIS), []);
  assert.deepEqual(headlineAgrees('3 things wait in your inbox.', HIS).map((d) => [d.names, d.wrote, d.is]), [['inbox', 3, 32]]);
  assert.deepEqual(headlineAgrees('No agent is working.', HIS).map((d) => [d.names, d.wrote]), [['agents', 0]]);
  /* AN INBOX THE READER IS NOT TOLD ABOUT IS NOT CHECKED. */
  assert.deepEqual(headlineAgrees('3 arrivals wait.', { ...HIS, inbox: null }), []);
});

test('THE CALM LINE, IN ANY USE CASE’S WORDS, ONLY WHEN NOTHING WAITS', () => {
  const calm: WaitingNow = { questions: 0, late: 0, hard: 0, inbox: 0, working: 0 };
  for (const line of ['Nothing needs you right now.', 'Nothing waits on you.', 'Nothing needs your call. Back to building.']) {
    assert.deepEqual(headlineAgrees(line, calm), [], line);
    assert.equal(headlineAgrees(line, { ...calm, inbox: 2 }).length, 1, line);
    assert.equal(headlineAgrees(line, { ...calm, questions: 1 }).length, 1, line);
  }
});

test('HOME’S RULES LINE ALWAYS AGREES, and a model’s line that says "Nothing needs you" beside 25 is not kept', () => {
  for (const [needs, late, working, inbox] of [
    [25, 10, 1, 32],
    [0, 0, 0, 32],
    [0, 0, 3, 0],
    [1, 0, 0, 0],
  ] as const) {
    const waits: WaitingNow = { questions: needs, late, hard: 0, inbox, working };
    assert.deepEqual(headlineAgrees(homeRulesLine(needs, late, working, inbox), waits), []);
  }
  const page: HeadlinePage = {
    page: HOME_PAGE,
    title: 'Today',
    rules: homeRulesLine(25, 0, 1, 32),
    figures: [
      { id: 'needs-you', value: '25' },
      { id: 'late', value: '0' },
      { id: 'working', value: '1' },
      { id: 'inbox', value: '32' },
    ],
  };
  assert.match(headlineFault('Nothing needs you, and 1 agent is working.', page) ?? '', /not what waits/u);
  assert.equal(headlineFault('25 questions wait on you, and 1 agent is working.', page), null);
});
