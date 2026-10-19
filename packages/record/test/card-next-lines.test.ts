/**
 * The card's Next slot says what is true about the step (AGT-B08 job 4, with AGT-C05's card line), on `card()` itself.
 *
 * The record works out `next_lines`, `also_here` and `handoff.earlier`, and the card read none of them: it printed its
 * own wording of the step with "N dead ends" in More, so a session was never told "Nothing was handed over", who took
 * the step, what was tried, who else is here by name, or that older steps wait. Here each is handed in by hand, as
 * `briefing` sends them, and the card is held to print the first of the record's lines as one short line with no run id,
 * `card_next` the whole of them, and the card at most 130 words.
 * Every name is made up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { card, CARD_MOST, TWO_SESSIONS, wordCount, type CardAt } from '../src/card.ts';
import type { Brief, Context, LiveBrief } from '../src/index.ts';
import { TREE_WARNING, TRIED_MOST, type AlsoHere } from '../src/same-tree.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const HOUR = 3_600;

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

const STEP = 'Fire the test tiles before the glaze order goes out.';
const handoff = (over: Partial<NonNullable<Context['handoff']>> = {}): NonNullable<Context['handoff']> => ({
  from: 'S5', agent: 'claude', age_s: HOUR, next: STEP, tried: [], head: null, ...over,
});
const LEFT = `${STEP} Left by Claude (S5) 1h ago. Check before acting.`;

const row = (spoken: string, fields: Record<string, unknown>): Brief => ({ spoken, version: 1, scope: 'project', state: null, ...fields });
const reg = (id: string, rows: Brief[], name = id): Context['registers'][number] => ({ id, name, rows, inherited: [], truncated: false });
const working = (spoken: string, doing: string | null = null): LiveBrief => ({
  spoken, state: 'active', doing, agent: 'claude', repo: 'kiln', project: null, stale: false, quiet: false, age_s: 120,
});
const also = (runs: AlsoHere['runs'], more = 0): AlsoHere => ({ warning: TREE_WARNING, runs, more, lines: [TREE_WARNING, 'Also here: (as the record says it).'] });

const draw = (c: Context, at: CardAt = {}) => card(c, at, NOW);
const slot = (said: string, label: string): string | null => {
  const line = said.split('\n').find((l) => l.slice(0, 9).trim() === label);
  return line === undefined ? null : line.slice(9);
};

test("THE RECORD'S FIRST NEXT LINE IS THE BRIEF'S, with no run id and 'Left by' whole, and `card_next` keeps them all", () => {
  const c = ctx({ handoff: handoff({ tried: ['a cooler kiln'] }), next_lines: [LEFT, 'Tried: a cooler kiln'] });
  const drawn = draw(c);
  assert.match(slot(drawn.card, 'Next') ?? '', /^Fire the test tiles .* Left by Claude 1h ago\. Check before acting\.$/u);
  assert.doesNotMatch(drawn.card, /S5/u);
  /* NOT THE OLD WORDING beside it, and the compaction line is the same line. */
  assert.doesNotMatch(drawn.card, /\(S5, /u);
  assert.equal(drawn.next, `Next     ${LEFT} · Tried: a cooler kiln`);
  /* WHAT WAS TRIED IS SAID IN NEXT, so More no longer counts dead ends. */
  assert.doesNotMatch(drawn.card, /dead end/u);
});

test('NO STEP: the record says nothing was handed over and who was last here; a taken step is said as taken, never offered', () => {
  const last = 'Nothing was handed over. Last here: Claude (S4), 2h ago, at 5a57ba2.';
  assert.equal(slot(draw(ctx({ next_lines: [last] })).card, 'Next'), 'Nothing was handed over. Last here: Claude, 2h ago, at 5a57ba2.');
  const took = `Codex (S8) took this 3 min ago: ${STEP}`;
  const drawn = draw(ctx({ next_lines: [took] })).card;
  assert.equal(slot(drawn, 'Next'), `Codex took this 3 min ago: ${STEP}`);
  assert.doesNotMatch(drawn, /Left by|check before acting/iu);
});

test('NOTHING TRUE TO SAY, NO NEXT LINE: no lines and no step leave Next out, as before', () => {
  for (const c of [ctx(), ctx({ next_lines: [] }), ctx({ next_lines: ['  ', '\u0007'] })]) {
    const drawn = draw(c);
    assert.equal(slot(drawn.card, 'Next'), null, drawn.card);
    assert.equal(drawn.next, null);
  }
});

test('A CONTEXT DRAWN WITH A STEP AND NO LINES still reads: the brief says app and age, `card_next` keeps "Tried:" cut to its size', () => {
  const long = Array.from({ length: 12 }, (_, i) => `a kiln schedule number ${String(i + 1)}.`);
  const drawn = draw(ctx({ handoff: handoff({ tried: ['a cooler kiln', 'a longer soak.'] }) })).card;
  assert.match(slot(drawn, 'Next') ?? '', /^Fire the test tiles .*\(Claude Code, 1h ago, check before acting\)$/u);
  assert.match(draw(ctx({ handoff: handoff({ tried: ['a cooler kiln', 'a longer soak.'] }) })).next ?? '', /\(S5, Claude Code, 1h ago, check before acting\) · Tried: a cooler kiln; a longer soak$/u);
  assert.doesNotMatch(drawn, /dead end/u);
  const cut = (draw(ctx({ handoff: handoff({ tried: long }) })).next ?? '').split(' · ').at(-1)!;
  assert.ok(cut.startsWith('Tried: a kiln schedule number 1;') && cut.endsWith('…'), cut);
  assert.ok([...cut].length <= TRIED_MOST, `${String([...cut].length)} characters: ${cut}`);
});

test('OLDER STEPS LEFT HERE ARE COUNTED IN `card_next`, with the read that lists them', () => {
  assert.equal(draw(ctx({ handoff: handoff({ earlier: 2 }), next_lines: [LEFT] })).next, `Next     ${LEFT} · 2 older steps were left here: read braindog:handoffs`);
  assert.match(draw(ctx({ handoff: handoff({ earlier: 1 }) })).next ?? '', / · 1 older step was left here: read braindog:handoffs$/u);
  for (const earlier of [0, -1, 1.5]) assert.doesNotMatch(draw(ctx({ handoff: handoff({ earlier }), next_lines: [LEFT] })).card, /older step/u);
});

test('WHO ELSE IS HERE IS SAID AFTER THE WARNING, by name, three at most and then how many more', () => {
  const four = also([{ name: 'Claude (S4)', doing: 'Glazing the tiles' }, { name: 'Codex (S3)', doing: null }, { name: 'Claude (S2)', doing: null }, { name: 'Claude (S1)', doing: null }], 2);
  const line = slot(draw(ctx({ also_here: four, live: { same_repo: [working('S9', 'Somebody else')], elsewhere: [] } })).card, 'Also');
  assert.equal(line, `${TWO_SESSIONS} Also here: Claude (S4), Glazing the tiles; Codex (S3); Claude (S2), and 3 more.`);
  /* THE RECORD SAID NOBODY SHARES THIS TREE, so a run in a folder of the same name on another machine warns nobody. */
  assert.equal(slot(draw(ctx({ also_here: null, live: { same_repo: [working('S9')], elsewhere: [] } })).card, 'Also'), null);
  /* AND A CONTEXT DRAWN WITHOUT IT reads its runs as before. */
  assert.match(slot(draw(ctx({ live: { same_repo: [working('S9')], elsewhere: [] } })).card, 'Also') ?? '', /working in this repository too/u);
});

test('WITH ALL OF IT ON A FULL RECORD the card stays at 130 words, and line one and the warning are never cut', () => {
  const long = 'Read the whole firing log before changing a schedule, because one short cone reading says nothing about the batch.';
  const lines = [LEFT, 'Tried: a cooler kiln; a longer soak; a second thermocouple'];
  const c = ctx({
    handoff: handoff({ tried: ['a cooler kiln', 'a longer soak', 'a second thermocouple'], earlier: 3 }),
    next_lines: lines,
    also_here: also([{ name: 'Claude (S4)', doing: 'Glazing the tiles for the spring order' }, { name: 'Codex (S3)', doing: long }], 5),
    signs: [1, 2, 3, 4].map((n) => ({ name: `Sign ${String(n)}`, said: long })),
    waiting: [1, 2, 3, 4].map((n) => ({ id: `q${String(n)}`, question: `${long} Number ${String(n)}?` })),
    registers: [
      reg('learnings', [1, 2, 3].map((n) => row(`learnings#${String(n)}`, { lesson: `${long} Lesson ${String(n)}.` }))),
      reg('tasks', [1, 2, 3, 4].map((n) => row(`tasks#${String(n)}`, { title: `${long} Task ${String(n)}`, agent: 'claude' }))),
    ],
  });
  const drawn = draw(c, { agent: 'claude', device: 'MacBook Pro', branch: 'main' });
  assert.ok(drawn.words <= CARD_MOST, `the card is ${String(drawn.words)} words:\n${drawn.card}`);
  assert.equal(drawn.words, wordCount(drawn.card));
  assert.equal(drawn.card.split('\n')[0], 'Claude Code on MacBook Pro, working on Kiln');
  assert.ok((slot(drawn.card, 'Also') ?? '').startsWith(`${TWO_SESSIONS} Also here: Claude (S4)`), drawn.card);
  assert.match(slot(drawn.card, 'Next') ?? '', /^Fire the test tiles .* Left by Claude 1h ago\. Check before acting\.$/u);
  assert.ok((drawn.next ?? '').endsWith(`${lines.join(' · ')} · 3 older steps were left here: read braindog:handoffs`), String(drawn.next));
  assert.doesNotMatch(drawn.card, /dead end/u);
});
