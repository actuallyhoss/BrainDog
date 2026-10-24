/**
 * The card `context` opens with, held to its shape and its size.
 *
 * THE BRIEF IS FIVE SHORT LINES, EACH LEFT OUT WHEN IT HAS NOTHING: who and where, then `Also`, `Next`, `Signs`, `Waiting`,
 * `Learned`, `More` and `Update`, the record's order (`packages/record/src/card.ts`). No Who slot: the critic cut it, and
 * `context` prints the record's card, which has none. At most three things a slot and 1,500 characters in all, every
 * line cut at a word. This package composes no card (AGT-B07): the rules for each slot are the record's, held in
 * `packages/record/test/card.test.ts`, and a context with no card is one line, held in `briefing-relay.test.ts`.
 *
 * AND ON A RECORD LIKE THE OWNER'S, THE WHOLE ANSWER IS UNDER 1,500 TOKENS. Measured there before the card, `context`
 * alone was 16.6 KB: forty-one keys and the skills that apply everywhere, each listed whole. So the seed is grown here
 * to that shape (keys, tools, fifty learnings, a queue with three alike) and the text is counted with the estimator the
 * tool list is held to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { briefed } from '../src/briefing.ts';
import type { Decl, Look } from '../src/brief.ts';
import { tools } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { tokenBudget } from './tokens.ts';

const NOW = Date.UTC(2026, 8, 22, 9);
const LABELS = ['Also', 'Next', 'Signs', 'Waiting', 'Learned', 'More', 'Update'] as const;
const HOUR = 3_600;
/** The most characters the card says, the cap the record's card holds as well as its 150 words. */
const CARD_MOST = 1_500;

/** The card's lines after the header, as `[label, body]`, each held to the column the labels make. */
function slotsOf(card: string): [string, string][] {
  return card
    .split('\n')
    .slice(1)
    .map((line) => {
      const m = /^(\S+) +(.*)$/u.exec(line);
      assert.ok(m, `a card line is not a slot: ${line}`);
      assert.equal(line.indexOf(m[2]!), 9, `the slot ${m[1]!} is out of the column: ${line}`);
      return [m[1]!, m[2]!];
    });
}

/** The card's rules, whatever it says: the order, the size, three things a slot, and no word cut in half. */
function shaped(card: string): Map<string, string> {
  assert.ok(card.length <= CARD_MOST, `the card is ${String(card.length)} characters`);
  const slots = slotsOf(card);
  const labels = slots.map(([label]) => label);
  assert.deepEqual(labels, LABELS.filter((l) => labels.includes(l)), `the slots are out of order: ${labels.join(', ')}`);
  for (const [label, body] of slots) {
    for (const cut of body.matchAll(/(\S*)\.\.\./gu)) assert.ok(cut[1] === '' || /[\p{L}\p{N})?!"']$/u.test(cut[1]!), `a word was cut in ${label}: ${body}`);
  }
  return new Map(slots);
}

/* ── the card alone, over a context built here ────────────────────────────── */

const LEARNINGS: Decl = {
  id: 'learnings',
  name: 'Learnings',
  title: 'lesson',
  fields: [
    { id: 'lesson', type: 'text' },
    { id: 'confirmed_on', type: 'day' },
  ],
} as Decl;

const look: Look = {
  now: NOW,
  decl: (register) => (register === 'learnings' ? LEARNINGS : undefined),
  title: () => undefined,
  actor: (by) => by,
  decider: 'Ada',
};

const run = { spoken: 'S6' };
const step = (from: string, age_s: number) => ({ from, next: 'Sign off instances 4 to 6 once the mastering pass lands.', age_s });

/* THE CASES THAT HELD THE CARD THIS PACKAGE COMPOSED (an empty slot left out, the head's project and machine, a step
   checked before acting, questions alike counted once, the two newest learnings, a long slot cut at a word) moved with
   the composer to the record (AGT-B07). What holds here is that a context with none composes none. */
test('A CONTEXT WITH NO CARD COMPOSES NONE: one line, whatever else it sends', () => {
  const said = briefed({ context: { session: run, project: { spoken: 'things#1', name: 'Kiln' }, handoff: step('S5', HOUR), waiting: [{ id: 'SG69', question: 'Does Kiln licence per seat?' }] }, look, home: null }).card;
  assert.equal(said, 'Connected to BrainDog. Call context.');
});

/* ── on a record the size of the owner's ──────────────────────────────────── */

const agent = {
  principal: { kind: 'token', id: 't_card', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'card', cwd: '/Users/studio/Code/kiln-type', host: 'Studio-MacBook-Pro.local', agent: 'claude' },
} as CallContext;

test('ON A RECORD LIKE THE OWNER\'S, context is a card and a few lines, under 1,500 tokens', async (t) => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await installSeed(api.kernel);
  const mcp = tools(api);

  /* THE OWNER'S SHAPE: forty keys and ten tools that apply everywhere, fifty learnings, and a queue with two alike. The
     same question asked twice by one run is one question (its cause joins them), so three asked read two alike. */
  for (let i = 0; i < 40; i++)
    assert.ok(api.kernel.create('credentials', { label: `Deploy key ${String(i)}`, opens: `Deploys service ${String(i)}`, kind: 'api_token' }, { actor: 'p_seed' }).ok);
  for (let i = 0; i < 10; i++) assert.ok(api.kernel.create('tools', { name: `tool-${String(i)}`, kind: 'cli' }, { actor: 'p_seed' }).ok);
  for (let i = 0; i < 50; i++) {
    const made = await mcp.call('create', { register: 'learnings', fields: { lesson: `Lesson ${String(i)} of the card test.`, because: 'A session would otherwise get this wrong.', kind: 'fact', project: 'things#1' } }, agent);
    assert.ok(made.ok, JSON.stringify(made));
  }
  for (const question of [
    'Does the specimen page ship before the September issue?',
    'bank-ipn-out-sms could not read account out of this one. Accept it into transactions, or fix the pattern?',
    'bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern?',
    'bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern?',
  ]) {
    const asked = await mcp.call('propose', { question, body_kind: 'options', body: { options: [{ id: 'yes', label: 'Yes', because: 'It is ready.' }, { id: 'no', label: 'No', because: 'It is not.' }] } }, agent);
    assert.ok(asked.ok, JSON.stringify(asked));
  }

  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'context', arguments: {} } }, api, { ...agent })) as Reply;
  assert.ok('result' in reply);
  const result = reply.result as { content: { text: string }[]; structuredContent: { card: string; registers: { id: string; rows: unknown[]; everywhere?: number }[] } };
  const text = result.content[0]!.text;
  const tokens = tokenBudget(text);
  t.diagnostic(`context: ${String(tokens)} tokens, ${String(text.length)} characters; the whole answer ${String(JSON.stringify(result.structuredContent).length)} characters`);
  assert.ok(tokens < 1_500, `context is ${String(tokens)} tokens:\n${text}`);

  const { card: said } = result.structuredContent;
  assert.ok(text.startsWith(said), 'the text does not open with the card');
  const slots = shaped(said);
  assert.equal(said.split('\n')[0], 'Claude Code on MacBook, working on Kiln');
  assert.doesNotMatch(text, /Studio-MacBook/u, 'the machine was said by its own name');
  /* THE CARD IS THE RECORD'S (AGT-B07), whose rules its own tests hold: a step left more than a week ago is not handed
     over, so the seed's fortnight-old one is no Next, and the question asked twice by one run is said once. The task the
     seed hands to claude is Next, since the briefing carries the field Tasks' hand.agent names (worker-door-tests-44). */
  assert.doesNotMatch(slots.get('Next') ?? '', /Sign off instances/u, `a step a fortnight old was handed over: ${slots.get('Next') ?? ''}`);
  assert.match(slots.get('Next') ?? '', /^Variable axis QA on the new cut \(handed to you\)/u);
  const waiting = slots.get('Waiting') ?? '';
  /* WHAT COSTS MOST TO LEAVE WAITING LEADS (AGT-C08, `govern.ts` `order: 'wait'`), not the newest: by Decide's own rank
     the seed's change to Kiln and Portage is said before the four questions this run asked a moment ago. */
  /* THIS PROJECT'S COUNT IS SAID BESIDE ALL OF THEM when fewer wait here (scope D9). */
  assert.match(waiting, /^\d+ (?:here of \d+ )?on [^,]+, first: Update Kiln’s note and move Portage to earning\?$/u);
  /* LEARNED IS THE SEED'S TWO METHODS, though fifty facts were written after them: a method comes before a fact, and
     `context` now cuts what it hands in that order (`learnedSorted`), where it used to hand the twenty last changed. */
  /* AND THE PLAN'S CARD LEADS WITH A LESSON THAT HELD (`lessonsHeld`, plan §3.2 row 8): a method before a fact. */
  assert.match(slots.get('Learned') ?? '', /^Run the mastering pass before signing off an axis instance\.$/u);

  /* A KEPT LIST IS A COUNT AND THIS PROJECT'S ROWS: the forty keys that apply everywhere are a number, not forty lines,
     and the number says it is a floor where the record stopped counting them. */
  const keys = result.structuredContent.registers.find((r) => r.id === 'credentials') as { rows: unknown[]; everywhere?: number; more?: boolean } | undefined;
  assert.ok(keys && (keys.everywhere ?? 0) >= 20 && keys.more === true && keys.rows.length <= 10, JSON.stringify(keys));
  /* NO MORE LINE: this is context, and every cut section of the plan ends with the call that reads the rest (plan §3.2). */
  assert.equal(slots.get('More'), undefined, 'context told the agent to call context');
  assert.doesNotMatch(text, /Deploy key \d+/u, 'a key that applies everywhere was listed by name');
  assert.doesNotMatch(text, /tool-\d+/u, 'a tool was listed as work');
  sql.close();
});

test('A QUESTION THE OWNER DECIDED IN THE PROJECT IS IN THE FULL CONTEXT, not the brief', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await installSeed(api.kernel);
  const mcp = tools(api);
  const options = [{ id: 'renew', label: 'Renew the domain', because: 'Old PDFs point at it.' }, { id: 'lapse', label: 'Let it lapse', because: 'It costs every year.' }];
  const asked = await mcp.call('propose', { question: 'Let kilnfonts.example lapse?', body_kind: 'options', body: { options } }, agent);
  assert.ok(asked.ok, JSON.stringify(asked));
  const id = (asked.value as { id: string }).id;
  const decided = await api.decide({ id, decide: { option: 'renew', reason: 'The PDFs.' } }, { principal: { kind: 'person', id: 'p_seed', level: 'owner' } });
  assert.ok(decided.ok, JSON.stringify(decided));

  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'context', arguments: {} } }, api, { ...agent })) as Reply;
  assert.ok('result' in reply);
  const { card: said } = (reply.result as { structuredContent: { card: string } }).structuredContent;
  assert.ok(!shaped(said).has('Decided'), said);
  sql.close();
});

test('A CONTEXT THAT SENDS THE RECORD\'S CARD IS PRINTED THAT CARD ALONE, never beside the card composed here', () => {
  const recordCard = 'BrainDog · run S6 · Claude Code on MacBook · project Kiln\nNext     Kern the lowercase pairs (S5, 1h ago, check before acting)';
  const context = {
    card: recordCard,
    card_next: 'Kern the lowercase pairs',
    session: run,
    project: { spoken: 'things#1', name: 'Kiln' },
    handoff: step('S5', HOUR),
    waiting: [{ id: 'SG69', question: 'Does Kiln licence per seat?' }],
    live: { same_repo: [{ spoken: 'S5', agent: 'claude', age_s: 60 }] },
    signs: [{ name: 'Backups', said: 'The last copy is a week old.' }],
  };
  const out = briefed({ context, look, mine: { agent: 'claude' }, home: null });
  assert.equal(out.card, recordCard);
  assert.ok(out.text.startsWith(`${recordCard}\n`) || out.text === recordCard, out.text);
  const after = out.text.slice(recordCard.length);
  assert.equal(out.text.split('BrainDog · ').length, 2, `two cards were printed: ${out.text}`);
  assert.doesNotMatch(after, /^(Next|Waiting|Who|Learned|More|Signs|Also)\s/mu, `a slot of the composed card followed the record's: ${after}`);
  assert.doesNotMatch(after, /Two sessions|Red on this record|Sign off instances/u, `the card's own lines were said again: ${after}`);
  assert.equal(out.value.card_next, 'Kern the lowercase pairs');
});
