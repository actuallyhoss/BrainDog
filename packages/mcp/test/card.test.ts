/**
 * The card `context` opens with, held to its shape and its size.
 *
 * FIVE SLOTS, IN ONE ORDER, EACH LEFT OUT WHEN IT HAS NOTHING: who and where, then `Next`, `Waiting`, `Learned` and
 * `More`. At most three things a slot and 1,500 characters in all, every line cut at a word. A step is checked before
 * it is acted on when it is a day old or another run left it; questions that read the same once their ids are set
 * aside are one; the two newest learnings are the ones said; the machine is said as a person names it.
 *
 * AND ON A RECORD LIKE THE OWNER'S, THE WHOLE ANSWER IS UNDER 1,500 TOKENS. Measured there before the card, `context`
 * alone was 16.6 KB: forty-one keys and the skills that apply everywhere, each listed whole. So the seed is grown here
 * to that shape (keys, tools, fifty learnings, a queue with three alike) and the text is counted with the estimator the
 * tool list is held to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { briefed, CARD_MOST } from '../src/briefing.ts';
import type { Decl, Look } from '../src/brief.ts';
import { tools } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { tokenBudget } from './tokens.ts';

const NOW = Date.UTC(2026, 8, 22, 9);
const LABELS = ['Next', 'Waiting', 'Who', 'Learned', 'More'] as const;
const HOUR = 3_600;

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

/** The things a slot names: its parts between dots, less the count of the rest and the call that opens them. */
const thingsIn = (body: string): string[] =>
  body
    .replace(/^\d[\d,]* on [^:]+: /u, '')
    .split(' · ')
    .filter((part) => !/^\d[\d,]* more$/u.test(part) && !part.startsWith('call '));

/** The card's rules, whatever it says: the order, the size, three things a slot, and no word cut in half. */
function shaped(card: string): Map<string, string> {
  assert.ok(card.length <= CARD_MOST, `the card is ${String(card.length)} characters`);
  const slots = slotsOf(card);
  const labels = slots.map(([label]) => label);
  assert.deepEqual(labels, LABELS.filter((l) => labels.includes(l)), `the slots are out of order: ${labels.join(', ')}`);
  for (const [label, body] of slots) {
    assert.ok(thingsIn(body).length <= 3, `${label} names ${String(thingsIn(body).length)} things: ${body}`);
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

const card = (context: Record<string, unknown>, mine: Record<string, unknown> = {}) => briefed({ context, look, mine, home: null }).card;
const run = { spoken: 'S6' };
const step = (from: string, age_s: number) => ({ from, next: 'Sign off instances 4 to 6 once the mastering pass lands.', age_s });

test('AN EMPTY SLOT IS LEFT OUT: a record with nothing to say is the header alone', () => {
  assert.equal(card({}), 'BrainDog · no run yet · no project');
  assert.equal(card({ session: run, project: { spoken: 'things#1', name: 'Kiln' } }), 'BrainDog · run S6 · project Kiln');
});

test('THE MACHINE IS SAID AS A PERSON NAMES IT, never by the name it gives itself', () => {
  const said = card({ session: run }, { agent: 'claude', cwd: '/Users/ada/Code/kiln', host: 'Adas-MacBook-Pro.local' });
  assert.equal(said, 'BrainDog · run S6 · no project · Claude Code on MacBook');
});

test('A STEP IS CHECKED BEFORE IT IS ACTED ON when it is a day old or another run left it, and taken as it stands when it is the caller\'s own and fresh', () => {
  const next = (handoff: Record<string, unknown>) => shaped(card({ session: run, handoff })).get('Next') ?? '';
  assert.doesNotMatch(next(step('S6', 2 * HOUR)), /check before acting/u);
  assert.match(next(step('S6', 2 * HOUR)), /^Sign off instances 4 to 6 once the mastering pass lands\. \(S6, 2h ago\)$/u);
  assert.match(next(step('S6', 26 * HOUR)), /\(S6, 1d ago, check before acting\)$/u);
  assert.match(next(step('S5', HOUR)), /\(S5, 1h ago, check before acting\)$/u);
});

test('QUESTIONS THAT READ THE SAME ARE ONE, three a slot, and the count is of the things that differ', () => {
  const waiting = [
    { id: 'SG73', question: 'bank-ipn-out-sms could not read account out of this one. Accept it into transactions, or fix the pattern?' },
    { id: 'SG72', question: 'bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern?' },
    { id: 'SG71', question: 'Bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern?' },
    { id: 'SG70', question: 'Change tools#8 to how fly is set up on this Mac?' },
    { id: 'SG69', question: 'Does Kiln licence per seat, per product, or one flat studio price?' },
    { id: 'SG68', question: 'Does Tallow get retired, or parked for another year?' },
  ];
  const body = shaped(card({ session: run, waiting }, {})).get('Waiting') ?? '';
  assert.match(body, /^4 on Ada: bank-ipn-out-sms could not read account out of this one\. [^·]*\.\.\. \(3 alike\) · Change/u);
  assert.equal(thingsIn(body).length, 3);
  assert.match(body, / · 1 more$/u);
});

test('THE TWO NEWEST LEARNINGS ARE SAID, this project\'s before those that apply everywhere', () => {
  const lesson = (n: number) => ({ spoken: `LN${String(n)}`, lesson: `Lesson ${String(n)} is what a session would otherwise get wrong.` });
  const registers = [{ id: 'learnings', rows: [lesson(2), lesson(9), lesson(4)], inherited: [lesson(12), lesson(11)] }];
  const body = shaped(card({ session: run, registers })).get('Learned') ?? '';
  assert.equal(body, 'Lesson 9 is what a session would otherwise get wrong. · Lesson 4 is what a session would otherwise get wrong.');
});

test('A LONG SLOT IS CUT AT A WORD, and the card never passes its size', () => {
  const long = 'Rebuild the specimen page from the new outline, then run every proof again and send the ones that pass to the foundry. '.repeat(6);
  const waiting = Array.from({ length: 30 }, (_, i) => ({ id: `SG${String(i + 1)}`, question: `${String(i)} ${long}` }));
  const registers = [{ id: 'learnings', rows: Array.from({ length: 8 }, (_, i) => ({ spoken: `LN${String(i + 1)}`, lesson: long })), inherited: [] }];
  shaped(card({ session: run, handoff: { from: 'S5', next: long, age_s: 3 * 86_400, tried: ['one', 'two'] }, waiting, registers }));
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

  /* THE OWNER'S SHAPE: forty keys and ten tools that apply everywhere, fifty learnings, and a queue with three alike. */
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
  assert.equal(said.split('\n')[0], 'BrainDog · run S6 · project Kiln · Claude Code on MacBook');
  assert.doesNotMatch(text, /Studio-MacBook/u, 'the machine was said by its own name');
  assert.match(slots.get('Next') ?? '', /check before acting\)$/u, "another run's step a fortnight old was not marked to check");
  assert.match(slots.get('Waiting') ?? '', /: bank-card-used-sms could not read account out of this one\. [^·]*\(3 alike\) · /u);
  assert.match(slots.get('Learned') ?? '', /^Lesson 49 of the card test\. · Lesson 48 of the card test\.$/u);

  /* A KEPT LIST IS A COUNT AND THIS PROJECT'S ROWS: the forty keys that apply everywhere are a number, not forty lines,
     and the number says it is a floor where the record stopped counting them. */
  const keys = result.structuredContent.registers.find((r) => r.id === 'credentials') as { rows: unknown[]; everywhere?: number; more?: boolean } | undefined;
  assert.ok(keys && (keys.everywhere ?? 0) >= 20 && keys.more === true && keys.rows.length <= 10, JSON.stringify(keys));
  assert.match(slots.get('More') ?? '', /^\d+\+ learnings, .*\b\d+\+ keys by name\b/u);
  assert.doesNotMatch(text, /Deploy key \d+/u, 'a key that applies everywhere was listed by name');
  assert.doesNotMatch(text, /tool-\d+/u, 'a tool was listed as work');
  sql.close();
});
