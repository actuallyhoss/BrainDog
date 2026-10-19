/**
 * The card's two late lines (AGT-C18 part B, AGT-C14 build 3): how many things went stale where the session stands, and
 * which two lessons Learned leads with.
 *
 * THE NUMBER WAS COUNTED AND NEVER SHOWN. `context` sends `stale` on every call and the card said nothing of it, so no
 * session started knowing there was anything to clear. More says it first, with the read that names each thing and the
 * call that clears it, and says nothing when the count is zero or the context carries none.
 *
 * LEARNED IS THE LESSON THAT MATTERS, NOT THE LAST ONE WRITTEN: a method before a fact, this project's before the ones
 * that apply everywhere, then the newest. Every context here is drawn by hand; the names are made up (DIRECTION 27).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { card, CARD_MOST, learnedFirst, wordCount } from '../src/card.ts';
import type { Brief, Context } from '../src/index.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const MORE = 'call context for the full picture';

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

const row = (spoken: string, fields: Record<string, unknown>, scope: Brief['scope'] = 'project'): Brief => ({ spoken, version: 1, scope, state: null, ...fields });
const reg = (id: string, rows: Brief[], inherited: Brief[] = []): Context['registers'][number] => ({ id, name: id, rows, inherited, truncated: false });
const draw = (c: Context) => card(c, {}, NOW).card;

/** A slot's body by its label, or `null` when the card has no such line. */
const slot = (said: string, label: string): string | null => {
  const line = said.split('\n').find((l) => l.startsWith(`${label} `));
  return line === undefined ? null : line.slice(9);
};

const lesson = (spoken: string, said: string, kind: string | undefined, created_at: string | undefined, scope: Brief['scope'] = 'project'): Brief =>
  row(spoken, { lesson: said, ...(kind === undefined ? {} : { kind }), ...(created_at === undefined ? {} : { created_at }) }, scope);

/* ── the one number ────────────────────────────────────────────────────── */

test('THE STALE COUNT IS IN THE FULL CONTEXT, not the brief: More is the one call', () => {
  assert.equal(draw(ctx({ stale: 4 })), `This session, working on Kiln\nMore     ${MORE}`);
  assert.equal(slot(draw(ctx({ stale: 1 })), 'More'), MORE);
});

test('THE OTHER COUNTS ARE NOT IN THE BRIEF EITHER: More names no key and no skill', () => {
  const keys = reg('credentials', [row('credentials#1', { label: 'Kiln deploy' }), row('credentials#2', { label: 'Kiln mail' })]);
  const skills = reg('skills', [row('skills#1', { name: 'glaze' })]);
  const handoff = { from: 'S6', next: 'Fire the test tiles.', age_s: 600, tried: ['a cooler kiln', 'a longer soak'], head: null };
  const more = slot(draw(ctx({ stale: 4, handoff, registers: [keys, skills] })), 'More');
  assert.equal(more, MORE);
});

test('NOTHING IS SAID OF IT at zero, with no count, or with a count that is not a whole number above zero', () => {
  const bare = `This session, working on Kiln\nMore     ${MORE}`;
  assert.equal(draw(ctx({ stale: 0 })), bare);
  assert.equal(draw(ctx()), bare);
  for (const odd of [-2, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(draw(ctx({ stale: odd })), bare, `stale ${String(odd)} was printed`);
  assert.equal(draw(ctx({ stale: '4' as unknown as number })), bare);
});

test('THE CARD IS STILL AT MOST 150 WORDS WITH IT, on a record with every slot full', () => {
  const long = 'Read the whole firing log before changing a schedule, because one short cone reading says nothing about the batch and the last three reversions all came from acting on one.';
  const full = ctx({
    stale: 4,
    handoff: { from: 'S5', next: `${long} ${long}`, age_s: 90_000, tried: ['a', 'b', 'c'], head: null },
    signs: [1, 2, 3, 4].map((n) => ({ name: `Sign ${String(n)}`, said: long })),
    waiting: [1, 2, 3, 4].map((n) => ({ id: `q${String(n)}`, question: `${long} Number ${String(n)}?` })),
    registers: [
      reg('learnings', [1, 2, 3].map((n) => lesson(`learnings#${String(n)}`, `${long} Lesson ${String(n)}.`, 'method', `2026-10-0${String(n)}T08:00:00.000Z`))),
      reg('credentials', [row('credentials#1', { label: 'Kiln deploy' })]),
    ],
  });
  const drawn = card(full, {}, NOW);
  assert.ok(drawn.words <= CARD_MOST, `the card is ${String(drawn.words)} words:\n${drawn.card}`);
  assert.equal(drawn.words, wordCount(drawn.card));
  /* A small card with the number is under the size and says it whole. */
  assert.ok(wordCount(draw(ctx({ stale: 4 }))) <= CARD_MOST);
});

/* ── which lessons Learned leads with ──────────────────────────────────── */

const DAY = (d: string) => `${d}T08:00:00.000Z`;

test('A METHOD OUTRANKS A FACT, however new the fact: one from last month leads one from today', () => {
  const fact = lesson('learnings#2', 'The kiln room is on the second floor.', 'fact', DAY('2026-10-09'));
  const method = lesson('learnings#1', 'Read the firing log before changing a schedule.', 'method', DAY('2026-09-09'));
  assert.ok(learnedFirst(method, fact) < 0);
  assert.ok(learnedFirst(fact, method) > 0);
  assert.equal(slot(draw(ctx({ registers: [reg('learnings', [fact, method])] })), 'Learned'), 'The kiln room is on the second floor.');
});

test("AMONG TWO METHODS THE PROJECT'S WINS over the one that applies everywhere, however new that one is", () => {
  const everywhere = lesson('learnings#7', 'Money is minor units plus a currency.', 'method', DAY('2026-10-09'), 'global');
  const here = lesson('learnings#3', 'Weigh glaze dry, never wet.', 'method', DAY('2026-08-01'));
  assert.ok(learnedFirst(here, everywhere) < 0);
  assert.ok(learnedFirst(everywhere, here) > 0);
  /* The kind is read before the place: a method from everywhere still leads a fact of this project. */
  const hereFact = lesson('learnings#4', 'The glaze room has no scale.', 'fact', DAY('2026-10-09'));
  assert.ok(learnedFirst(everywhere, hereFact) < 0);
  const drawn = draw(ctx({ registers: [reg('learnings', [hereFact], [everywhere])] }));
  assert.equal(slot(drawn, 'Learned'), 'The glaze room has no scale.');
  assert.equal(slot(draw(ctx({ registers: [reg('learnings', [hereFact, here], [everywhere])] })), 'Learned'), 'Weigh glaze dry, never wet.');
});

test('THEN THE NEWEST FIRST, and two the record gives no day for stay as it sent them', () => {
  const older = lesson('learnings#1', 'Fire test tiles first.', 'method', DAY('2026-09-01'));
  const newer = lesson('learnings#2', 'Log every cone.', 'method', DAY('2026-10-01'));
  assert.ok(learnedFirst(newer, older) < 0);
  assert.ok(learnedFirst(older, newer) > 0);
  assert.equal(learnedFirst(older, older), 0);
  assert.equal(slot(draw(ctx({ registers: [reg('learnings', [older, newer])] })), 'Learned'), 'Log every cone.');
  const a = lesson('learnings#3', 'First as sent.', 'method', undefined);
  const b = lesson('learnings#4', 'Second as sent.', 'method', undefined);
  assert.equal(learnedFirst(a, b), 0);
  /* One with no day beside one with a day is the older, so the order holds whatever the mix. */
  assert.ok(learnedFirst(a, newer) > 0);
  assert.ok(learnedFirst(newer, a) < 0);
  assert.equal(slot(draw(ctx({ registers: [reg('learnings', [a, b])] })), 'Learned'), 'First as sent.');
});

test('A LEARNING WITH NO KIND SORTS AS A FACT, and so does one whose kind is no kind the list keeps', () => {
  const bare = lesson('learnings#1', 'The door sticks.', undefined, DAY('2026-10-09'));
  const odd = lesson('learnings#2', 'The lamp flickers.', 'hunch', DAY('2026-10-08'));
  const fact = lesson('learnings#3', 'The shelf holds forty tiles.', 'fact', DAY('2026-10-07'));
  const method = lesson('learnings#4', 'Count tiles before loading.', 'method', DAY('2026-01-01'));
  assert.ok(learnedFirst(method, bare) < 0);
  assert.ok(learnedFirst(method, odd) < 0);
  /* Beside a fact it is ranked by the day alone. */
  assert.ok(learnedFirst(bare, fact) < 0);
  assert.ok(learnedFirst(fact, odd) > 0);
  assert.deepEqual([fact, odd, method, bare].sort(learnedFirst).map((r) => r.spoken), ['learnings#4', 'learnings#1', 'learnings#2', 'learnings#3']);
});

test('LEARNED STILL LEAVES OUT A LESSON THAT NO LONGER STANDS', () => {
  const gone = { ...lesson('learnings#1', 'Soak for an hour.', 'method', DAY('2026-10-09')), state: 'superseded' };
  const facts = [1, 2, 3].map((n) => lesson(`learnings#${String(n + 1)}`, `Fact ${String(n)}.`, 'fact', DAY(`2026-10-0${String(n)}`)));
  const drawn = draw(ctx({ stale: 4, registers: [reg('learnings', [gone, ...facts])] }));
  assert.equal(slot(drawn, 'Learned'), 'Fact 3.');
  assert.equal(slot(drawn, 'More'), MORE);
  assert.doesNotMatch(drawn, /Soak/u);
});
