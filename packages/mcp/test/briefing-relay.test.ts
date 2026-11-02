/**
 * The door prints the record's card and composes none (jobs 3 and 4): "the same card from context".
 *
 * A BRIEFING WITH A CARD IS THAT CARD, BYTE FOR BYTE, then the lines that are not a card (open work, the Home page,
 * the habits). A BRIEFING WITH NONE, from a host too old to send one, is one line naming the record and the call that
 * has the rest. Nothing in the text is the door's own slot: no `Next` unless the record's card has one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { briefed, connectedLine } from '../src/briefing.ts';
import type { Decl, Look } from '../src/brief.ts';

const TASKS = { id: 'tasks', name: 'Tasks', one: 'task', title: 'title', hand: 'owner', fields: [{ id: 'title', type: 'text' }] } as unknown as Decl;
const look: Look = { now: Date.UTC(2026, 9, 6), decl: (r) => (r === 'tasks' ? TASKS : undefined), title: () => undefined, actor: (b) => b, decider: 'Ada' };

/** A context with something for every slot a door once drew: a step, questions, people, learnings, runs and signs. */
const FULL: Record<string, unknown> = {
  session: { spoken: 'S6' },
  project: { spoken: 'things#1', name: 'Kiln' },
  handoff: { from: 'S5', next: 'Kern the lowercase pairs.', age_s: 3_600, tried: ['Autokern'] },
  waiting: [{ id: 'SG7', question: 'Does Kiln licence per seat?' }],
  people: [{ spoken: 'P2', name: 'Teodor Vance', role: 'client' }],
  live: { same_repo: [{ spoken: 'S4', agent: 'claude', age_s: 60, doing: 'Proofing' }], elsewhere: [] },
  signs: [{ name: 'Backups', said: 'The last copy is a week old.' }],
  registers: [{ id: 'tasks', rows: [{ spoken: 'tasks#4', title: 'Send the specimen to the foundry' }], inherited: [] }],
  next: 'Kern the lowercase pairs.',
};

/** A slot a card says, at the start of a line: what only a card composer writes. */
const SLOT = /^(Next|Waiting|Who|Learned|More|Also|Signs|Decided|Update)\s{2,}/mu;

test('A BRIEFING WITH A CARD PRINTS IT BYTE FOR BYTE, names as written and the layout kept', () => {
  const card = 'BrainDog · run S6 · Claude Code on MacBook · project Kiln\nNext     Ask Zoë Müller and سارة about the kerning (S5, 1h ago, check before acting)\nMore     1 dead end · call context';
  const out = briefed({ context: { ...FULL, card, card_next: 'Next     Ask Zoë Müller' }, look, home: null });
  assert.equal(out.card, card);
  assert.equal(out.value.card, card);
  assert.ok(out.text.startsWith(`${card}\n`), out.text);
  assert.equal(out.value.card_next, 'Next     Ask Zoë Müller');
  /* WHAT FOLLOWS IS NOT A CARD: the open work and the habits, and never a second Next, Who or a run said again. */
  const after = out.text.slice(card.length + 1);
  assert.doesNotMatch(after, SLOT, `the door drew a slot after the record's card: ${after}`);
  assert.doesNotMatch(after, /Two sessions|Red on this record|BrainDog · /u, after);
  assert.match(after, /^Open here · Tasks · 1$/mu);
  assert.match(after, /Send the specimen to the foundry/u);
});

test('A CARD WITH NO NEXT LINE IS PRINTED WITH NONE, though the context holds a step', () => {
  const card = 'BrainDog · run S6 · project Kiln\nMore     call context';
  const out = briefed({ context: { ...FULL, card }, look, home: null });
  assert.equal(out.card, card);
  assert.doesNotMatch(out.text, /^Next\s/mu, 'the door said a Next the record left out');
  assert.equal(out.text.split('\n').filter((l) => SLOT.test(l)).length, 1, out.text);
});

test('A BRIEFING WITH NO CARD IS ONE LINE NAMING THE RECORD, and nothing composed in its place', () => {
  const out = briefed({ context: FULL, look, home: { slug: 'home', title: 'Studio' }, record: { name: 'Kiln Studio', slug: 'kiln' } });
  assert.equal(out.card, 'Connected to Kiln Studio. Call context.');
  assert.equal(out.value.card, out.card);
  assert.equal(out.text.split('\n')[0], out.card);
  assert.doesNotMatch(out.text, SLOT, `the door composed a slot: ${out.text}`);
  assert.doesNotMatch(out.text, /BrainDog · |Two sessions|Red on this record|Teodor Vance|Does Kiln licence/u, out.text);
  assert.equal(out.value.card_next, undefined);
});

test('THE RECORD IS SAID BY ITS NAME, then its slug, never an id, and BrainDog when nothing names it', () => {
  assert.equal(connectedLine({ name: 'Kiln Studio', slug: 'kiln' }), 'Connected to Kiln Studio. Call context.');
  assert.equal(connectedLine({ slug: 'kiln' }), 'Connected to kiln. Call context.');
  assert.equal(connectedLine('Kiln'), 'Connected to Kiln. Call context.');
  assert.equal(connectedLine({ name: '01J9ZK6Q3W8X4Y5Z6A7B8C9D0E', slug: 'kiln' }), 'Connected to kiln. Call context.');
  assert.equal(connectedLine(undefined, { record: { name: 'Kiln' } }), 'Connected to Kiln. Call context.');
  assert.equal(connectedLine(undefined), 'Connected to BrainDog. Call context.');
  assert.equal(briefed({ context: {}, look, home: null }).card, 'Connected to BrainDog. Call context.');
});

test('AN AGENT ACTING FOR A COLLEAGUE IS TOLD WHAT IT CAN REACH, once, after the card or in the plan as its record drew it', () => {
  const reach = 'You act for Sam and can view Kiln. Amounts are hidden from you.';
  const card = 'BrainDog · run S6 · project Kiln\nMore     call context';
  const out = briefed({ context: { ...FULL, card, reach }, look, home: null });
  assert.equal(out.value.reach, reach);
  assert.equal(out.text.split('\n')[card.split('\n').length], reach, out.text);
  /* A PLAN SAYS IT ITSELF, as its Reach line, so the door does not say it twice. */
  const planned = briefed({ context: { ...FULL, card, reach, plan: `${card}\nReach    ${reach}`, plan_card: card }, look, home: null });
  assert.equal(planned.text.split('\n').filter((l) => l.includes(reach)).length, 1, planned.text);
  assert.equal(planned.value.reach, reach);
  /* AND NOBODY ELSE IS TOLD ANY. */
  assert.equal(briefed({ context: { ...FULL, card }, look, home: null }).value.reach, undefined);
});
