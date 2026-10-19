/**
 * The card's Learned and More slots after AGT-B09. Learned leads with the record's own rules, each cut at sixty
 * characters, with "and N more rules" when `context` found more, then the lessons that matter most. More says how many
 * there are by count, the Home page and the call, and names no key and no skill. Every context here is drawn by hand;
 * the names are made up (DIRECTION 27).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { card } from '../src/card.ts';
import type { Brief, Context } from '../src/index.ts';

const NOW = Date.UTC(2026, 9, 9, 9);

const ctx = (over: Partial<Context> & { rules?: { rows: Brief[]; more: number } } = {}): Context => ({
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
const row = (spoken: string, fields: Record<string, unknown>, scope: Brief['scope'] = 'project'): Brief => ({ spoken, version: 1, scope, state: null, ...fields });
const reg = (id: string, rows: Brief[], inherited: Brief[] = [], counts: { here?: number; everywhere?: number } = {}): Context['registers'][number] => ({ id, name: id, rows, inherited, truncated: false, ...counts });
const slot = (said: string, label: string): string | null => {
  const line = said.split('\n').find((l) => l.startsWith(`${label} `));
  return line === undefined ? null : line.slice(9);
};
const draw = (c: Context, at: Parameters<typeof card>[1] = {}) => card(c, at, NOW).card;

const rule = (n: number, lesson: string, scope: Brief['scope'] = 'global'): Brief => row(`learnings#${String(n)}`, { lesson, kind: 'rule', created_at: `2026-10-0${String(n)}` }, scope);

test('LEARNED IS THE ONE SHORTEST OF THE RULES context found and the lessons that stand, cut to a line', () => {
  const long = rule(1, 'Every estimate a person gives is divided by four before it goes on a plan.');
  const short = rule(2, 'Art is drawn at sixteen pixels and doubled.');
  const fact = row('learnings#9', { lesson: 'The kiln room is on the second floor.', kind: 'fact', created_at: '2026-10-09' });
  const said = slot(draw(ctx({ registers: [reg('learnings', [fact])], rules: { rows: [long, short], more: 2 } })), 'Learned');
  assert.equal(said, 'The kiln room is on the second floor.');
  assert.ok([...said!].length <= 91, said!);
});

test('WITHOUT A RULES ANSWER the card finds the rules among the learnings it was sent, and says the shortest', () => {
  const everywhere = rule(3, 'Money is minor units plus a currency.');
  const here = rule(1, 'Weigh glaze dry, never wet.', 'project');
  const method = row('learnings#5', { lesson: 'Log every cone.', kind: 'method', created_at: '2026-10-08' });
  const said = slot(draw(ctx({ registers: [reg('learnings', [here, method], [everywhere])] })), 'Learned');
  assert.equal(said, 'Log every cone.');
});

test('A RULE IS NEVER SAID TWICE, once as a rule and again as a lesson', () => {
  const r = rule(1, 'Never add two currencies.');
  const said = slot(draw(ctx({ registers: [reg('learnings', [r])], rules: { rows: [r], more: 0 } })), 'Learned');
  assert.equal(said, 'Never add two currencies.');
});

test('MORE SAYS THE COUNTS context capped the lists with, and names no key and no skill', () => {
  const keys = reg('credentials', [row('credentials#1', { label: 'Kiln deploy' })], [row('credentials#2', { label: 'Mail relay' }, 'global')], { here: 3, everywhere: 163 });
  const skills = reg('skills', [row('skills#1', { name: 'glaze-check' })], [], { here: 1, everywhere: 40 });
  const learned = row('learnings#1', { lesson: 'Rebase before review.', topic: 'glaze-check', kind: 'fact' });
  const drawn = draw(ctx({ registers: [keys, skills, reg('learnings', [learned])] }));
  assert.equal(slot(drawn, 'More'), 'call context for the full picture');
  assert.doesNotMatch(drawn, /Kiln deploy|Mail relay|glaze-check/u, 'More named a key or a skill');
});

test('MORE IS THE ONE CALL FOR THE FULL PICTURE: the Home page is in `context`, not in the brief', () => {
  assert.equal(slot(draw(ctx(), { home: 'Studio' }), 'More'), 'call context for the full picture');
  assert.equal(slot(draw(ctx()), 'More'), 'call context for the full picture');
});
