/**
 * The card the record composes (AGT-B07), held to its shape and its size.
 *
 * LINE ONE, THEN THE SLOTS IN ONE ORDER, EACH LEFT OUT WHEN IT HAS NOTHING: who and where, then `Next`, `Signs`,
 * `Waiting`, `Learned` and `More`, with the same-tree line before them and the older-command line after them only when
 * each is true. At most three things a slot, about 120 words and never more than 150. A step is checked before it is
 * acted on when it is a day old or another run left it; questions that read the same are one; names print as written;
 * control characters never reach the terminal. No Who slot.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { card, CARD_AIM, CARD_MOST, OLDER, TWO_SESSIONS, wordCount, type CardAt } from '../src/card.ts';
import type { Brief, Context, LiveBrief } from '../src/index.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const HOUR = 3_600;
const ORDER = ['Also', 'Next', 'Signs', 'Waiting', 'Learned', 'More', 'Update'] as const;

/** A context with nothing in it, and what a case adds. */
const ctx = (over: Partial<Context> = {}): Context => ({
  session: null,
  project: null,
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

const run = { spoken: 'S6', state: 'active' };
const project = (name: string): Context['project'] => ({ spoken: 'things#1', name, mark: null, hue: null, how: 'repo' });
const step = (from: string, age_s: number, next = 'Sign off instances 4 to 6 once the mastering pass lands.') => ({ from, next, age_s, tried: [], head: null });
const row = (spoken: string, fields: Record<string, unknown>): Brief => ({ spoken, version: 1, scope: 'project', state: null, ...fields });
const reg = (id: string, rows: Brief[], name = id): Context['registers'][number] => ({ id, name, rows, inherited: [], truncated: false });
const other = (spoken: string, over: Partial<LiveBrief> = {}): LiveBrief => ({
  spoken, state: 'active', doing: null, agent: 'claude', repo: 'kiln', project: null, stale: false, quiet: false, age_s: 300, ...over,
});

const draw = (c: Context, at: CardAt = {}) => card(c, at, NOW).card;

/** The card's lines after line one, as `[label, body]`, each held to the column the labels make. */
function slotsOf(said: string): [string, string][] {
  return said
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
    .replace(/^\d[\d,]* (?:on [^:]+|read red): /u, '')
    .split(' · ')
    .filter((part) => !/^\d[\d,]* more$/u.test(part) && !part.startsWith('call '));

/** The card's rules, whatever it says: the order, the size, three things a slot, no Who, no em dash, no control. */
function shaped(said: string): Map<string, string> {
  assert.ok(wordCount(said) <= CARD_MOST, `the card is ${String(wordCount(said))} words:\n${said}`);
  assert.doesNotMatch(said, /[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u, 'a control character reached the card');
  assert.doesNotMatch(said, /—/u, 'an em dash reached the card');
  const slots = slotsOf(said);
  const labels = slots.map(([label]) => label);
  assert.ok(!labels.includes('Who'), 'the card has a Who slot');
  assert.deepEqual(labels, ORDER.filter((l) => labels.includes(l)), `the slots are out of order: ${labels.join(', ')}`);
  for (const [label, body] of slots) if (label !== 'Also') assert.ok(thingsIn(body).length <= 3, `${label} names ${String(thingsIn(body).length)} things: ${body}`);
  return new Map(slots);
}

/* ── the fresh record and line one ─────────────────────────────────────── */

test('A FRESH RECORD IS LINE ONE AND MORE, and every slot with nothing to say is left out', () => {
  const fresh = card(ctx(), {}, NOW);
  assert.equal(fresh.card, 'BrainDog · no run yet · no project\nMore     call context');
  assert.equal(fresh.next, null);
  assert.equal(fresh.words, wordCount(fresh.card));
  assert.equal(draw(ctx({ session: run, project: project('Kiln') })), 'BrainDog · run S6 · project Kiln\nMore     call context');
});

test('LINE ONE SAYS WHO AND WHERE: the run, the app on the machine as a person names it, the project, the branch', () => {
  const at: CardAt = { agent: 'claude', host: 'Adas-MacBook-Pro.local', branch: 'feature/specimen' };
  assert.equal(draw(ctx({ session: run, project: project('Kiln') }), at).split('\n')[0], 'BrainDog · run S6 · Claude Code on MacBook · project Kiln · branch feature/specimen');
  assert.equal(draw(ctx({ session: run }), { device: 'Studio Mac' }).split('\n')[0], 'BrainDog · run S6 · on Studio Mac · no project');
  assert.doesNotMatch(draw(ctx(), at), /Adas-MacBook-Pro/u, 'the machine was said by its own name');
});

test("LINE ONE SAYS THE PROJECT'S NAME AS A PERSON READS IT, never its folder, an address, a machine or an id", () => {
  const head = (name: string) => draw(ctx({ session: run, project: project(name) })).split('\n')[0];
  assert.equal(head('/Users/ada/Code/kiln'), 'BrainDog · run S6 · project kiln');
  assert.equal(head('Kiln <ada@kiln.example>'), 'BrainDog · run S6 · project Kiln');
  assert.equal(head('Kiln on Adas-MacBook-Pro.local'), 'BrainDog · run S6 · project Kiln on MacBook');
  assert.equal(head('ada@kiln.example'), 'BrainDog · run S6 · a project with no name');
});

/* ── the slots ─────────────────────────────────────────────────────────── */

test("A STEP IS CHECKED BEFORE IT IS ACTED ON when it is a day old or another run left it, and taken as it stands when it is the caller's own and fresh", () => {
  const next = (handoff: Context['handoff'], at: CardAt = {}) => shaped(draw(ctx({ session: run, handoff }), at)).get('Next') ?? '';
  assert.equal(next(step('S6', 2 * HOUR)), 'Sign off instances 4 to 6 once the mastering pass lands. (S6, 2h ago)');
  assert.match(next(step('S6', 26 * HOUR)), /\(S6, 1d ago, check before acting\)$/u);
  assert.match(next(step('S5', HOUR)), /\(S5, 1h ago, check before acting\)$/u);
  assert.match(next(step('S5', HOUR), { ahead: 3 }), /\(S5, 1h ago, 3 commits since, check before acting\)$/u);
  assert.doesNotMatch(next(step('S5', HOUR), { ahead: 12_000 }), /commits since/u, 'a count past 9,999 was printed');
});

test('THE NEXT LINE ALONE is what a session reads after it compacts, and nothing when there is no step', () => {
  const drawn = card(ctx({ session: run, handoff: step('S5', HOUR) }), {}, NOW);
  assert.equal(drawn.next, 'Next     Sign off instances 4 to 6 once the mastering pass lands. (S5, 1h ago, check before acting)');
  assert.ok(drawn.card.includes(drawn.next!));
  assert.equal(card(ctx({ session: run }), {}, NOW).next, null);
});

test('A ROW HANDED TO THIS AGENT LEADS Next, and the handoff keeps its place beside it', () => {
  const work = reg('tasks', [row('tasks#4', { title: 'Proof the italic', agent: 'claude' }), row('tasks#5', { title: 'Not for this agent', agent: 'codex' })], 'Tasks');
  const body = shaped(draw(ctx({ session: run, handoff: step('S5', HOUR), registers: [work] }), { agent: 'claude' })).get('Next') ?? '';
  assert.match(body, /^Proof the italic \(tasks#4, handed to you\) · Sign off instances/u);
  assert.doesNotMatch(body, /Not for this agent/u);
});

test('QUESTIONS THAT READ THE SAME ARE ONE, three a slot, and the count is of the things that differ', () => {
  const waiting = [
    { id: 'SG73', question: 'bank-ipn-out-sms could not read account out of this one. Accept it into transactions, or fix the pattern?' },
    { id: 'SG72', question: 'bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern?' },
    { id: 'SG71', question: 'Bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern?' },
    { id: 'SG70', question: 'Change tools#8 to how fly is set up in ~/.claude.json on Adas-MacBook-Pro.local?' },
    { id: 'SG69', question: 'Does Kiln licence per seat, per product, or one flat studio price?' },
  ];
  const body = shaped(draw(ctx({ session: run, waiting, registers: [reg('tools', [], 'Tools')] }), { decider: 'Ada', waiting: 7 })).get('Waiting') ?? '';
  assert.match(body, /^6 on Ada: bank-ipn-out-sms could not read account out of this one\. · bank-card-used-sms could not read account out of this one\. \(2 like this\) · Change one of Tools to how fly is set up in \.claude\.json on MacBook\?$/u);
  assert.doesNotMatch(body, /tools#8|~\/|Adas-/u, 'an id, a path or a network name reached a question');
});

test('THE TWO NEWEST LEARNINGS ARE SAID, and the rest are a count in More beside the keys and skills', () => {
  const lesson = (n: number) => row(`learnings#${String(n)}`, { lesson: `Lesson ${String(n)} is what a session would otherwise get wrong.` });
  const keys = reg('credentials', [row('credentials#1', { label: 'Deploy key' }), row('credentials#2', { label: 'Mail key' })]);
  const slots = shaped(draw(ctx({ session: run, registers: [reg('learnings', [lesson(9), lesson(4), lesson(2)]), keys] })));
  assert.equal(slots.get('Learned'), 'Lesson 9 is what a session would otherwise get wrong. · Lesson 4 is what a session would otherwise get wrong.');
  assert.equal(slots.get('More'), '3 learnings · 2 keys by name · call context');
  assert.doesNotMatch(draw(ctx({ session: run, registers: [keys] })), /Deploy key/u, 'a key was listed by name');
});

test('ANOTHER RUN WORKING IN THIS TREE is one line before Next with the sentence word for word, and the caller is never one', () => {
  const live = { same_repo: [other('S6'), other('S5', { doing: 'Kerning pass' }), other('S4', { quiet: true })], elsewhere: [] };
  const slots = shaped(draw(ctx({ session: run, live, handoff: step('S5', HOUR) })));
  assert.equal(slots.get('Also'), `Kerning pass (S5, Claude Code, 5m ago) is working in this repository too. ${TWO_SESSIONS}`);
  assert.equal(draw(ctx({ session: run, live: { same_repo: [other('S6')], elsewhere: [] } })), 'BrainDog · run S6 · no project\nMore     call context');
});

test('THE RED SIGNS ARE ONE LINE, by name, with the sentence when only one is red, and no line when none is', () => {
  const one = shaped(draw(ctx({ session: run, signs: [{ name: 'Bank texts filing', said: 'No bank text has filed in three days' }] })));
  assert.equal(one.get('Signs'), '1 read red: Bank texts filing. No bank text has filed in three days.');
  const signs = ['Bank texts filing', 'Briefing is true', 'Agents were given tools', 'Mail arriving'].map((name) => ({ name, said: `${name} is red.` }));
  assert.equal(shaped(draw(ctx({ session: run, signs }))).get('Signs'), '4 read red: Bank texts filing · Briefing is true · Agents were given tools · 1 more');
  assert.ok(!shaped(draw(ctx({ session: run }))).has('Signs'));
});

test('AN OLDER COMMAND GETS ONE LINE AT THE END, and a build of the same day, or a checkout, gets none', () => {
  const said = shaped(draw(ctx({ session: run }), { build: '2026.10.01+1a2b3c4', min_cli: '2026.10.07' }));
  assert.equal(said.get('Update'), `This command is older than the record (built 8 days ago). ${OLDER}`);
  assert.ok(!shaped(draw(ctx({ session: run }), { build: '2026.10.07+1a2b3c4', min_cli: '2026.10.07' })).has('Update'));
  assert.ok(!shaped(draw(ctx({ session: run }), { build: 'checkout', min_cli: '2026.10.07' })).has('Update'));
  assert.ok(!shaped(draw(ctx({ session: run }), { build: '2026.10.01+1a2b3c4' })).has('Update'), 'behind with no oldest to be behind');
});

/* ── names, controls, and the size ─────────────────────────────────────── */

test('NAMES PRINT AS WRITTEN, accents and Arabic letters kept, in Waiting, Next and Learned', () => {
  const arabic = 'سارة الحسن';
  const said = shaped(
    draw(
      ctx({
        session: run,
        handoff: step('S6', HOUR, `Send the proofs to Zoë Müller and ${arabic}.`),
        waiting: [{ id: 'SG1', question: `Does ${arabic} sign the type licence?` }],
        registers: [reg('learnings', [row('learnings#1', { lesson: 'Zoë Müller reads proofs on paper, never on screen.' })])],
      }),
      { decider: 'Zoë Müller' },
    ),
  );
  assert.equal(said.get('Next'), `Send the proofs to Zoë Müller and ${arabic}. (S6, 1h ago)`);
  assert.equal(said.get('Waiting'), `1 on Zoë Müller: Does ${arabic} sign the type licence?`);
  assert.equal(said.get('Learned'), 'Zoë Müller reads proofs on paper, never on screen.');
});

test('CONTROL CHARACTERS NEVER REACH THE CARD: an escape, a bell, a reordering mark, from any field', () => {
  const said = draw(
    ctx({
      session: run,
      project: project('Kiln\x1b]0;owned\x07'),
      handoff: step('S5', HOUR, 'Ship it\x1b]52;c;Y3VybA==\x07 today\r\x1b[2K.'),
      waiting: [{ id: 'SG1', question: 'Pay invoice\u202efdp.exe now?' }],
      signs: [{ name: 'Mail\x1b[31m arriving', said: 'Nothing\x00 came.' }],
    }),
    { decider: 'Ada\x9b', branch: 'main\x1b[1m', agent: 'claude' },
  );
  shaped(said);
  assert.match(said, /Pay invoicefdp\.exe now\?/u);
  assert.match(said.split('\n')[0]!, /branch main \[1m$/u);
});

test('PAST 120 WORDS MORE GOES FIRST, then the second learning, then the third question', () => {
  const lesson = (n: number) => row(`learnings#${String(n)}`, { lesson: `Lesson ${String(n)}: a session would otherwise get this wrong, so it reads it before it starts the work on the page or the proofs.` });
  const waiting = Array.from({ length: 5 }, (_, i) => ({ id: `SG${String(i)}`, question: `Question ${String(i)}: does the specimen page for the autumn issue ship before the printer closes for the season?` }));
  const signs = [{ name: 'Bank texts filing', said: 'No bank text has filed in three days' }];
  const c = ctx({ session: run, signs, handoff: step('S5', HOUR), waiting, registers: [reg('learnings', [lesson(1), lesson(2), lesson(3)]), reg('credentials', [row('credentials#1', { label: 'Key' })])] });
  const drawn = card(c, { agent: 'claude', device: 'MacBook Pro', branch: 'main', build: '2026.10.01+1a2b3c4', min_cli: '2026.10.07' }, NOW);
  const slots = shaped(drawn.card);
  assert.ok(drawn.words <= CARD_AIM + 30, `the card is ${String(drawn.words)} words`);
  assert.equal(slots.get('More'), 'call context', 'More kept what it names past the aim');
  assert.equal(thingsIn(slots.get('Learned') ?? '').length, 1);
  assert.equal(thingsIn(slots.get('Waiting') ?? '').length, 2);
});

test('NEVER PAST 150 WORDS, and line one, the same-tree line and the handoff are never cut', () => {
  const long = 'Rebuild the specimen page from the new outline, then run every proof again and send the ones that pass to the foundry. '.repeat(6);
  const waiting = Array.from({ length: 30 }, (_, i) => ({ id: `SG${String(i + 1)}`, question: `${String(i)} ${long}` }));
  const learnings = reg('learnings', Array.from({ length: 8 }, (_, i) => row(`learnings#${String(i + 1)}`, { lesson: long })));
  const work = reg('tasks', Array.from({ length: 4 }, (_, i) => row(`tasks#${String(i + 1)}`, { title: long, agent: 'claude' })));
  const signs = Array.from({ length: 5 }, (_, i) => ({ name: `Sign ${String(i)} ${long}`, said: long }));
  const live = { same_repo: [other('S4', { doing: long }), other('S3', { doing: long })], elsewhere: [] };
  const c = ctx({ session: run, project: project('Kiln'), handoff: { ...step('S5', 3 * 86_400, long), tried: ['one', 'two'] }, waiting, live, signs, registers: [learnings, work] });
  const drawn = card(c, { agent: 'claude', host: 'Adas-MacBook-Pro.local', branch: 'main', build: '2026.10.01+1a2b3c4', min_cli: '2026.10.07' }, NOW);
  const slots = shaped(drawn.card);
  assert.ok(drawn.words <= CARD_MOST, `the card is ${String(drawn.words)} words`);
  assert.equal(drawn.card.split('\n')[0], 'BrainDog · run S6 · Claude Code on MacBook · project Kiln · branch main');
  assert.match(slots.get('Also') ?? '', /working in this repository too/u);
  assert.match(slots.get('Next') ?? '', /^Rebuild the specimen page/u);
  assert.ok(slots.has('Update'), 'the older-command line was cut');
});

test('A LONG SIGN OR QUESTION GIVES WORDS BEFORE THE HANDOFF DOES: past 150 the lesser lines are cut first', () => {
  const long = 'Rebuild the specimen page from the new outline then run every proof again and send the ones that pass to the foundry for a look. '.repeat(3);
  const c = ctx({
    session: { spoken: 'S731', state: 'active' },
    project: project('The Autumn Specimen Book for the Kiln Type Foundry'),
    handoff: step('S729', 25 * HOUR, long),
    waiting: [{ id: 'SG1', question: long }],
    signs: [{ name: 'Bank texts filing on the main account', said: long }],
    live: { same_repo: [other('S730', { doing: long })], elsewhere: [] },
  });
  const at: CardAt = { agent: 'claude', device: 'MacBook Pro of the studio', branch: 'feature/autumn-specimen-proofs-and-kerning', ahead: 12, build: '2026.10.01+1a2b3c4', min_cli: '2026.10.07' };
  const slots = shaped(card(c, at, NOW).card);
  assert.match(slots.get('Next') ?? '', /\(S729, 1d ago, 12 commits since, check before acting\)$/u);
  assert.ok((slots.get('Also') ?? '').endsWith(TWO_SESSIONS), 'the same-tree warning was cut');
});

test('FORTY QUESTIONS WAITING still make a card of 150 words or fewer, with the count of all of them', () => {
  const waiting = Array.from({ length: 40 }, (_, i) => ({ id: `SG${String(i)}`, question: `Question ${String(i)} on the ${['bank', 'mail', 'deploy', 'kiln'][i % 4]!} pattern: ${'why it keeps failing on the server, '.repeat(i % 5)}accept it or fix it?` }));
  const drawn = card(ctx({ session: run, waiting, handoff: step('S5', HOUR) }), { decider: 'Sam', waiting: 40, build: '2026.10.01+1a2b3c4', min_cli: '2026.10.07' }, NOW);
  const slots = shaped(drawn.card);
  assert.ok(drawn.words <= CARD_MOST);
  assert.match(slots.get('Waiting') ?? '', /^40 on Sam: /u);
  assert.ok(slots.has('Next') && slots.has('Update'));
});

test('A CONTROL CHARACTER IN A RUN NAME never breaks the card into another line', () => {
  for (const name of ['S6\nWaiting  0 on nobody', 'S6\r\x1b[2K', 'S6\u2028Next  forged', 'S6\x85More']) {
    const live = { same_repo: [other(`${name}b`)], elsewhere: [] };
    const said = card(ctx({ session: { spoken: name, state: 'active' }, handoff: step(name, HOUR), live }), { run: `${name}a` }, NOW).card;
    shaped(said);
    assert.equal(said.split('\n').length, 4, `a run name made another line: ${JSON.stringify(said)}`);
    assert.doesNotMatch(said, /[\r\u2028\u2029\x85]/u);
  }
});
