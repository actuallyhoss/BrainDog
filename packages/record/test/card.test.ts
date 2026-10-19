/**
 * The card the record composes (AGT-B07), held to its shape and its size.
 *
 * THE BRIEF IS FIVE SHORT TRUE LINES, NAMES FIRST (batch 108): who and where, then `Next`, `Waiting`, `Learned` and
 * `More`, each left out when it has nothing but the first and last, with a `Signs` line only when a sign names this
 * project, the same-tree line after line one and the older-command line last, only when true. Each line is about 100
 * characters or fewer and none is an id. A step is checked before it is acted on when it is a day old or another run
 * left it; questions that read the same are one; names print as written; control characters never reach the terminal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { card, CARD_MOST, OLDER, plainly, TWO_SESSIONS, wordCount, type CardAt } from '../src/card.ts';
import type { Brief, Context, LiveBrief } from '../src/index.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const HOUR = 3_600;
const ORDER = ['Also', 'Next', 'Signs', 'Waiting', 'Learned', 'More', 'Update'] as const;
const MORE = 'call context for the full picture';

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

/** The card's rules, whatever it says: the order, the size, a line under about 100 characters, no em dash, no control. */
function shaped(said: string): Map<string, string> {
  assert.ok(wordCount(said) <= CARD_MOST, `the card is ${String(wordCount(said))} words:\n${said}`);
  assert.doesNotMatch(said, /[\x00-\x09\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩]/u, 'a control character reached the card');
  assert.doesNotMatch(said, /—/u, 'an em dash reached the card');
  const slots = slotsOf(said);
  const labels = slots.map(([label]) => label);
  assert.deepEqual(labels, ORDER.filter((l) => labels.includes(l)), `the slots are out of order: ${labels.join(', ')}`);
  for (const [label, body] of slots) if (label !== 'Also' && label !== 'Update') assert.ok([...body].length <= 91, `${label} is past 100 characters: ${body}`);
  return new Map(slots);
}

/* ── the fresh record and line one ─────────────────────────────────────── */

test('A FRESH RECORD IS LINE ONE AND MORE, and every line with nothing to say is left out', () => {
  const fresh = card(ctx(), {}, NOW);
  assert.equal(fresh.card, `This session, no project yet: say which with handoff\nMore     ${MORE}`);
  assert.equal(fresh.next, null);
  assert.equal(fresh.words, wordCount(fresh.card));
  assert.equal(draw(ctx({ session: run, project: project('Kiln') })), `This session, working on Kiln\nMore     ${MORE}`);
});

test('LINE ONE SAYS WHO AND WHERE BY NAME: the app on the machine as a person names it, then the project, no run, no branch', () => {
  const at: CardAt = { agent: 'claude', host: 'Adas-MacBook-Pro.local', branch: 'feature/specimen' };
  assert.equal(draw(ctx({ session: run, project: project('Kiln') }), at).split('\n')[0], 'Claude Code on MacBook, working on Kiln');
  assert.equal(draw(ctx({ session: run }), { device: 'Studio Mac' }).split('\n')[0], 'This session on Studio Mac, no project yet: say which with handoff');
  assert.equal(draw(ctx({ session: run, ambiguous: ['things#1', 'things#2'] }), at).split('\n')[0], 'Claude Code on MacBook, no project yet: 2 match this folder, say which with handoff');
  assert.doesNotMatch(draw(ctx({ session: run }), at), /Adas-MacBook-Pro|S6|branch/u, 'a machine, a run id or a branch was said');
});

test("LINE ONE SAYS THE PROJECT'S NAME AS A PERSON READS IT, never its folder, an address, a machine or an id", () => {
  const head = (name: string) => draw(ctx({ session: run, project: project(name) })).split('\n')[0];
  assert.equal(head('/Users/ada/Code/kiln'), 'This session, working on kiln');
  assert.equal(head('Kiln <ada@kiln.example>'), 'This session, working on Kiln');
  assert.equal(head('Kiln on Adas-MacBook-Pro.local'), 'This session, working on Kiln on MacBook');
  assert.equal(head('ada@kiln.example'), 'This session, working in a project with no name');
});

/* ── the lines ─────────────────────────────────────────────────────────── */

test('A STEP IS CHECKED BEFORE IT IS ACTED ON when it is a day old or another run left it, and said by app and age, never by run id', () => {
  const next = (handoff: Context['handoff'], at: CardAt = {}) => shaped(draw(ctx({ session: run, handoff }), at)).get('Next') ?? '';
  assert.equal(next(step('S6', 2 * HOUR)), 'Sign off instances 4 to 6 once the mastering pass lands. (2h ago)');
  assert.match(next(step('S6', 26 * HOUR)), /\(1d ago, check before acting\)$/u);
  assert.match(next(step('S5', HOUR)), /\(1h ago, check before acting\)$/u);
  assert.match(next({ ...step('S5', HOUR), agent: 'claude' }), /\(Claude Code, 1h ago, check before acting\)$/u);
  assert.doesNotMatch(next(step('S5', HOUR, 'Finish it (S5) now.')), /S5/u, 'a run id reached Next');
});

test('THE NEXT LINE ALONE is what a session reads after it compacts, whole and with its handles, and nothing when there is no step', () => {
  const drawn = card(ctx({ session: run, handoff: step('S5', HOUR) }), {}, NOW);
  assert.equal(drawn.next, 'Next     Sign off instances 4 to 6 once the mastering pass lands. (S5, 1h ago, check before acting)');
  assert.ok(drawn.card.includes('Sign off instances 4 to 6 once the mastering pass lands.'));
  assert.equal(card(ctx({ session: run }), {}, NOW).next, null);
});

test('A ROW HANDED TO THIS AGENT LEADS Next, by its words and not its handle', () => {
  const work = reg('tasks', [row('tasks#4', { title: 'Proof the italic', agent: 'claude' }), row('tasks#5', { title: 'Not for this agent', agent: 'codex' })], 'Tasks');
  const body = shaped(draw(ctx({ session: run, handoff: step('S5', HOUR), registers: [work] }), { agent: 'claude' })).get('Next') ?? '';
  assert.equal(body, 'Proof the italic (handed to you)');
});

test('WAITING IS A COUNT AND THE TOP ONE IN PLAIN WORDS: questions that read the same are one, no id, path or network name', () => {
  const waiting = [
    { id: 'SG73', question: 'bank-ipn-out-sms could not read account out of this one. Accept it into transactions, or fix the pattern?' },
    { id: 'SG72', question: 'bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern?' },
    { id: 'SG71', question: 'Bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern?' },
    { id: 'SG70', question: 'Change tools#8 to how fly is set up in ~/.claude.json on Adas-MacBook-Pro.local?' },
    { id: 'SG69', question: 'Does Kiln licence per seat, per product, or one flat studio price?' },
  ];
  const body = shaped(draw(ctx({ session: run, waiting, registers: [reg('tools', [], 'Tools')] }), { decider: 'Ada', waiting: 7 })).get('Waiting') ?? '';
  assert.equal(body, '6 on Ada, first: bank-ipn-out-sms could not read account out of this one.');
  const here = shaped(draw(ctx({ session: run, waiting: [waiting[3]!], waiting_here: 2, registers: [reg('tools', [], 'Tools')] }))).get('Waiting') ?? '';
  assert.equal(here, '2 on the owner, first: Change one of Tools to how fly is set up in .claude.json on MacBook?');
  assert.doesNotMatch(here, /tools#8|~\/|Adas-|SG\d/u, 'an id, a path or a network name reached a question');
});

test('LEARNED IS THE ONE SHORTEST LEARNING, and More is the one call for the rest, naming no key and no skill', () => {
  const lesson = (n: number, said: string) => row(`learnings#${String(n)}`, { lesson: said });
  const keys = reg('credentials', [row('credentials#1', { label: 'Deploy key' }), row('credentials#2', { label: 'Mail key' })]);
  const learnings = reg('learnings', [lesson(9, 'Lesson nine is long enough to be the longer one.'), lesson(4, 'Lesson four is short.'), lesson(2, 'Lesson two is a middle one.')]);
  const slots = shaped(draw(ctx({ session: run, registers: [learnings, keys] })));
  assert.equal(slots.get('Learned'), 'Lesson four is short.');
  assert.equal(slots.get('More'), MORE);
  assert.doesNotMatch(draw(ctx({ session: run, registers: [keys] })), /Deploy key/u, 'a key was listed by name');
  assert.ok(!shaped(draw(ctx({ session: run }))).has('Learned'), 'a record with no learning drew the line');
});

test('WHAT WAS DECIDED IS IN THE FULL CONTEXT, not the brief', () => {
  const decided = ['Decided 12 Oct: Ship the beta first', 'Decided 9 Oct: Yes: Keep the old price'];
  assert.ok(!shaped(draw(ctx({ session: run, decided }))).has('Decided'));
});

test('ANOTHER RUN WORKING IN THIS TREE is one line after line one with the sentence word for word, and the caller is never one', () => {
  const live = { same_repo: [other('S6'), other('S5', { doing: 'Kerning pass' }), other('S4', { quiet: true })], elsewhere: [] };
  const slots = shaped(draw(ctx({ session: run, live, handoff: step('S5', HOUR) })));
  assert.equal(slots.get('Also'), `Kerning pass (S5, Claude Code, 5m ago) is working in this repository too. ${TWO_SESSIONS}`);
  assert.equal(draw(ctx({ session: run, live: { same_repo: [other('S6')], elsewhere: [] } })), `This session, no project yet: say which with handoff\nMore     ${MORE}`);
});

test('A RED SIGN IS A LINE ONLY WHEN IT NAMES THIS PROJECT, and none when it is about the whole record', () => {
  const signs = [{ name: 'Kiln mail arriving', said: 'No Kiln mail has come in three days.' }, { name: 'Bank texts filing', said: 'No bank text has filed in three days' }];
  assert.equal(shaped(draw(ctx({ session: run, project: project('Kiln'), signs }))).get('Signs'), '1 read red here: Kiln mail arriving');
  assert.ok(!shaped(draw(ctx({ session: run, project: project('Specimen'), signs }))).has('Signs'), 'a sign about another project was said');
  assert.ok(!shaped(draw(ctx({ session: run, signs }))).has('Signs'), 'a sign was said with no project');
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
  assert.equal(said.get('Next'), `Send the proofs to Zoë Müller and ${arabic}. (1h ago)`);
  assert.equal(said.get('Waiting'), `1 on Zoë Müller, first: Does ${arabic} sign the type licence?`);
  assert.equal(said.get('Learned'), 'Zoë Müller reads proofs on paper, never on screen.');
});

test('CONTROL CHARACTERS NEVER REACH THE CARD: an escape, a bell, a reordering mark, from any field', () => {
  const said = draw(
    ctx({
      session: run,
      project: project('Kiln\x1b]0;owned\x07'),
      handoff: step('S5', HOUR, 'Ship it\x1b]52;c;Y3VybA==\x07 today\r\x1b[2K.'),
      waiting: [{ id: 'SG1', question: 'Pay invoice‮fdp.exe now?' }],
    }),
    { decider: 'Ada\x9b', agent: 'claude' },
  );
  shaped(said);
  assert.match(said, /Pay invoicefdp\.exe now\?/u);
  assert.match(said.split('\n')[0]!, /^Claude Code, working on Kiln/u);
});

test('NEVER PAST THE MOST WORDS, each brief line is about 100 characters, and the same-tree line and the older-command line are kept', () => {
  const long = 'Rebuild the specimen page from the new outline, then run every proof again and send the ones that pass to the foundry. '.repeat(6);
  const waiting = Array.from({ length: 30 }, (_, i) => ({ id: `SG${String(i + 1)}`, question: `${String(i)} ${long}` }));
  const learnings = reg('learnings', Array.from({ length: 8 }, (_, i) => row(`learnings#${String(i + 1)}`, { lesson: long })));
  const work = reg('tasks', Array.from({ length: 4 }, (_, i) => row(`tasks#${String(i + 1)}`, { title: long, agent: 'claude' })));
  const signs = Array.from({ length: 5 }, (_, i) => ({ name: `Kiln sign ${String(i)} ${long}`, said: long }));
  const live = { same_repo: [other('S4', { doing: long })], elsewhere: [] };
  const c = ctx({ session: run, project: project('Kiln'), handoff: { ...step('S5', 3 * 86_400, long), tried: ['one', 'two'] }, waiting, live, signs, registers: [learnings, work] });
  const drawn = card(c, { agent: 'claude', host: 'Adas-MacBook-Pro.local', branch: 'main', build: '2026.10.01+1a2b3c4', min_cli: '2026.10.07' }, NOW);
  const slots = shaped(drawn.card);
  assert.ok(drawn.words <= CARD_MOST, `the card is ${String(drawn.words)} words`);
  assert.equal(drawn.card.split('\n')[0], 'Claude Code on MacBook, working on Kiln');
  assert.match(slots.get('Also') ?? '', /working in this repository too/u);
  assert.match(slots.get('Next') ?? '', /^Proof|^Rebuild the specimen page/u);
  assert.ok(slots.has('Update'), 'the older-command line was cut');
});

test('FORTY QUESTIONS WAITING are one line: the count of all of them and the top one', () => {
  const waiting = Array.from({ length: 40 }, (_, i) => ({ id: `SG${String(i)}`, question: `Question ${String(i)} on the ${['bank', 'mail', 'deploy', 'kiln'][i % 4]!} pattern: ${'why it keeps failing on the server, '.repeat(i % 5)}accept it or fix it?` }));
  const drawn = card(ctx({ session: run, waiting, handoff: step('S5', HOUR) }), { decider: 'Mara', waiting: 40, build: '2026.10.01+1a2b3c4', min_cli: '2026.10.07' }, NOW);
  const slots = shaped(drawn.card);
  assert.ok(drawn.words <= CARD_MOST);
  assert.match(slots.get('Waiting') ?? '', /^40 on Mara, first: /u);
  assert.ok(slots.has('Next') && slots.has('Update'));
});

test('A CONTROL CHARACTER IN A RUN NAME never breaks the card into another line', () => {
  for (const name of ['S6\nWaiting  0 on nobody', 'S6\r\x1b[2K', 'S6 Next  forged', 'S6\x85More']) {
    const live = { same_repo: [other(`${name}b`)], elsewhere: [] };
    const said = card(ctx({ session: { spoken: name, state: 'active' }, handoff: step(name, HOUR), live }), { run: `${name}a` }, NOW).card;
    shaped(said);
    assert.equal(said.split('\n').length, 4, `a run name made another line: ${JSON.stringify(said)}`);
    assert.doesNotMatch(said, /[\r  \x85]/u);
  }
});

test('AN ID THE CALLER CANNOT READ IS "an entry you cannot see", never a row, and one it can read is its name', () => {
  const id = '01J9Z3K8QW4V6X2N5R7T0Y1B3C';
  const said = plainly(`Close ${id} once the proof is back?`, ctx(), true);
  assert.equal(said, 'Close an entry you cannot see once the proof is back?');
  assert.doesNotMatch(said, /\brows?\b|—/u);
  assert.equal(plainly(`Close ${id}?`, ctx(), true, { named: (x) => (x === id ? 'Proof the italic' : null) }), 'Close Proof the italic?');
});
