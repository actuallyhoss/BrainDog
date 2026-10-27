/**
 * What a session is given, capped and this project first: the pure rules `context` sends its lists, open
 * questions, decisions, rules and people through (`context-caps.ts`). No list over five in the brief answer, this
 * project's rows before the others, the counts and the one call for the rest, `full` keeping twenty and twenty, the last
 * three decided as lines, and a rule older than ten newer learnings still on the card. Every row is made up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { card } from '../src/card.ts';
import { BRIEF_ROWS, capRegister, decidedHere, newest, peopleHere, projectWaiting, restCall, rulesOf } from '../src/context-caps.ts';
import type { Brief, Context } from '../src/index.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const row = (spoken: string, fields: Record<string, unknown> = {}, scope: Brief['scope'] = 'project'): Brief => ({ spoken, version: 1, scope, state: null, ...fields });
const many = (prefix: string, n: number, scope: Brief['scope']): Brief[] => Array.from({ length: n }, (_, i) => row(`${prefix}#${String(i + 1)}`, { label: `${prefix} ${String(i + 1)}` }, scope));

test('NO LIST IS OVER FIVE in the brief answer, and this project\'s rows come before the ones that apply everywhere', () => {
  const capped = capRegister(many('kiln', 12, 'project'), many('all', 30, 'global'), { register: 'credentials' });
  assert.equal(capped.rows.length + capped.inherited.length, BRIEF_ROWS);
  assert.deepEqual(capped.rows.map((r) => r.spoken), ['kiln#1', 'kiln#2', 'kiln#3', 'kiln#4', 'kiln#5']);
  assert.deepEqual(capped.inherited, []);
  const few = capRegister(many('kiln', 2, 'project'), many('all', 30, 'global'), { register: 'credentials' });
  assert.deepEqual([...few.rows, ...few.inherited].map((r) => r.spoken), ['kiln#1', 'kiln#2', 'all#1', 'all#2', 'all#3']);
});

test('THE COUNTS AND THE CALL: how many here and everywhere, how many more, and the one call that lists them', () => {
  const capped = capRegister(many('kiln', 3, 'project'), many('all', 163, 'global'), { register: 'credentials' });
  assert.equal(capped.here, 3);
  assert.equal(capped.everywhere, 163);
  assert.equal(capped.more, 161);
  assert.equal(capped.rest, 'list({ register: "credentials" })');
  assert.equal(capped.rest, restCall('credentials'));
  assert.equal(capped.truncated, true);
  /* A READ THE STORE STOPPED SHORT IS COUNTED BY THE STORE, so "161 more" is every key, not the ones read. */
  const short = capRegister(many('kiln', 3, 'project'), many('all', 21, 'global'), { register: 'credentials', counted: { everywhere: 163 } });
  assert.equal(short.more, 161);
  const all = capRegister(many('kiln', 2, 'project'), many('all', 1, 'global'), { register: 'skills' });
  assert.deepEqual([all.more, all.rest, all.truncated], [0, null, false]);
});

test('MOST RECENTLY USED FIRST: the newest of a row\'s times leads, and rows never used keep the record\'s order', () => {
  const rows = many('all', 8, 'global');
  const used = new Map<string, (string | null)[]>([
    ['all#6', ['2026-10-01T10:00:00Z', null]],
    ['all#3', ['2026-09-01T10:00:00Z', '2026-10-05T08:00:00Z']],
    ['all#8', ['2026-10-02T00:00:00Z']],
  ]);
  const capped = capRegister([], rows, { register: 'skills', used: (r) => used.get(r.spoken) ?? [] });
  assert.deepEqual(capped.inherited.map((r) => r.spoken), ['all#3', 'all#8', 'all#6', 'all#1', 'all#2']);
  assert.equal(newest([null, undefined, '2026-01-02', '2026-01-01']), '2026-01-02');
  assert.equal(newest([]), '');
});

test('`full` KEEPS TWENTY AND TWENTY, as context always sent', () => {
  const capped = capRegister(many('kiln', 25, 'project'), many('all', 40, 'global'), { register: 'credentials', format: 'full' });
  assert.equal(capped.rows.length, 20);
  assert.equal(capped.inherited.length, 20);
  assert.equal(capped.more, 25);
});

test('THIS PROJECT\'S QUESTIONS COME FIRST, with how many are here counted; outside any project the order is kept', () => {
  const qs = [
    { id: 'q1', question: 'Rename the glaze list?', project: 'things#2' },
    { id: 'q2', question: 'Merge two kiln logs?', projects: ['things#1'] },
    { id: 'q3', question: 'Archive last year?' },
    { id: 'q4', question: 'Fire on Friday?', project: 'things#1' },
  ];
  const here = projectWaiting(qs, 'things#1');
  assert.deepEqual(here.waiting.map((q) => q.id), ['q2', 'q4', 'q1', 'q3']);
  assert.equal(here.here, 2);
  assert.deepEqual(projectWaiting(qs, 'things#1', 3).waiting.map((q) => q.id), ['q2', 'q4', 'q1']);
  const nowhere = projectWaiting(qs, null);
  assert.deepEqual([nowhere.waiting.map((q) => q.id), nowhere.here], [['q1', 'q2', 'q3', 'q4'], 0]);
});

test('THE LAST THREE DECIDED HERE are lines a person reads, newest first, and nothing decided elsewhere', () => {
  const decided = [
    { choice: 'Keep the old kiln log', decided_at: '2026-09-20T12:00:00Z', project: 'things#1' },
    { choice: 'Fire cone 6 — never cone 10', decided_at: '2026-10-02T09:00:00Z', project: 'things#1' },
    { choice: 'Move the shop', decided_at: '2026-10-08T09:00:00Z', project: 'things#2' },
    { choice: 'Weigh glaze dry', decided_at: '2026-10-01T09:00:00Z', projects: ['things#1'] },
    { choice: 'Buy a scale', decided_at: '2026-08-01T09:00:00Z', project: 'things#1' },
    { choice: '   ', decided_at: '2026-10-09T09:00:00Z', project: 'things#1' },
  ];
  assert.deepEqual(decidedHere(decided, 'things#1'), ['Decided 2 Oct: Fire cone 6, never cone 10', 'Decided 1 Oct: Weigh glaze dry', 'Decided 20 Sep: Keep the old kiln log']);
  assert.deepEqual(decidedHere(decided, null), []);
  assert.deepEqual(decidedHere(decided, 'things#2', 3), ['Decided 8 Oct: Move the shop']);
});

test('THE FIVE PEOPLE LAST IN TOUCH, never the record\'s own, then how many in all', () => {
  const people = [
    { name: 'Owner', in_touch: '2026-10-09', self: true },
    ...['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus'].map((name, i) => ({ name, in_touch: `2026-10-0${String(i + 1)}`, self: false })),
  ];
  const got = peopleHere(people);
  assert.deepEqual(got.people.map((p) => p.name), ['Gus', 'Flo', 'Ed', 'Di', 'Cy']);
  assert.equal(got.total, 7);
  assert.equal(peopleHere(people, 5, 40).total, 40);
});

const ctx = (over: Partial<Context> = {}): Context => ({
  session: { spoken: 'S6', state: 'active' },
  project: { spoken: 'things#1', name: 'Kiln', mark: null, hue: null, how: 'repo' },
  ambiguous: [],
  handoff: null,
  live: { same_repo: [], elsewhere: [] },
  waiting: [],
  registers: [],
  people: [],
  self: null,
  organisations: [],
  faded: 0,
  signs: [],
  next: 'Call context.',
  ...over,
});
const lesson = (n: number, kind: string, day: string, scope: Brief['scope'] = 'global'): Brief => row(`learnings#${String(n)}`, { lesson: `Lesson ${String(n)} holds.`, kind, created_at: day }, scope);

test('A RULE OLDER THAN TEN NEWER LEARNINGS STILL REACHES THE CARD, read from every learning before the five are cut', () => {
  const rule = row('learnings#1', { lesson: 'Divide every estimate by four.', kind: 'rule', created_at: '2026-01-01' }, 'global');
  /* LONGER THAN THE RULE, since Learned says the shortest learning that applies: the rule reaches the card as a candidate
     and wins by being the shortest, where a shorter lesson would rightly have been said in its place. */
  const newer = Array.from({ length: 10 }, (_, i) =>
    row(`learnings#${String(i + 2)}`, { lesson: `Lesson ${String(i + 2)} holds, and it runs longer than the rule does.`, kind: 'fact', created_at: `2026-10-${String(i + 10).padStart(2, '0')}` }, 'global'),
  ).reverse();
  const all = [...newer, rule];
  const capped = capRegister([], all, { register: 'learnings', used: (r) => [typeof r.created_at === 'string' ? r.created_at : null] });
  assert.ok(!capped.inherited.includes(rule), 'the five shown are the newest, the rule among none of them');
  const rules = rulesOf(all, 'things#1');
  assert.deepEqual(rules.rows.map((r) => r.spoken), ['learnings#1']);
  const registers: Context['registers'] = [{ id: 'learnings', name: 'Learnings', rows: capped.rows, inherited: capped.inherited, truncated: capped.truncated, ...{ here: capped.here, everywhere: capped.everywhere } }];
  const drawn = card({ ...ctx({ registers }), ...{ rules } }, {}, NOW).card;
  const learned = drawn.split('\n').find((l) => l.startsWith('Learned '));
  assert.ok(learned?.slice(9).startsWith('Divide every estimate by four.'), drawn);
  /* THE CARD IS FIVE SHORT LINES, so More no longer counts what is behind it: it points at the whole picture. */
  assert.match(drawn, /\nMore {5}call context for the full picture$/u);
});

test('RULES: up to three of kind rule, this project\'s first, the newest next, and how many more', () => {
  const rows = [
    row('learnings#1', { kind: 'rule', created_at: '2026-10-01' }, 'global'),
    row('learnings#2', { kind: 'rule', created_at: '2026-09-01' }, 'project'),
    row('learnings#3', { kind: 'fact', created_at: '2026-10-09' }, 'project'),
    row('learnings#4', { kind: 'rule', created_at: '2026-10-05' }, 'global'),
    { ...row('learnings#5', { kind: 'rule', created_at: '2026-10-08' }, 'project'), state: 'superseded' },
    row('learnings#6', { kind: 'rule', created_at: '2026-01-01' }, 'global'),
  ];
  const got = rulesOf(rows, 'things#1');
  assert.deepEqual(got.rows.map((r) => r.spoken), ['learnings#2', 'learnings#4', 'learnings#1']);
  assert.equal(got.more, 1);
  assert.deepEqual(rulesOf(rows, null).rows.map((r) => r.spoken), ['learnings#4', 'learnings#1', 'learnings#2']);
});

test('ON A RECORD THE SIZE OF HIS, the capped answer is under 1,500 tokens where twenty and twenty were not', () => {
  const lists: [string, number, number][] = [['credentials', 3, 163], ['skills', 2, 60], ['learnings', 4, 40], ['tools', 1, 30]];
  const shaped = (format: 'brief' | 'full') =>
    lists.map(([id, here, everywhere]) => {
      const c = capRegister(many(id, here, 'project'), many(id, everywhere, 'global'), { register: id, format });
      return { id, name: id, rows: c.rows, inherited: c.inherited, here: c.here, everywhere: c.everywhere, more: c.more, rest: c.rest, truncated: c.truncated };
    });
  const tokens = (v: unknown): number => Math.ceil(JSON.stringify(v).length / 4);
  assert.ok(tokens(shaped('brief')) < 1_500, `brief answer is ${String(tokens(shaped('brief')))} tokens`);
  assert.ok(tokens(shaped('full')) > tokens(shaped('brief')) * 3);
});
