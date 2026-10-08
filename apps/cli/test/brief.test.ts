/**
 * The card, as text: its five slots and their order, its caps, what it never prints, and a record with modules off.
 *
 * PURE, SO NO HOST. The hooks test sends a card through a real socket; here every shape `context` can take is built
 * by hand, including ones a seeded record would never produce.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Attached, Brief, Context } from '@braindog/client';

import { MAX_CHARS, PER_SLOT, TWO_SESSIONS, ago, asked, briefing, briefingOf, nextLine, questionOf, since, words, type Where } from '../src/brief.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const SENTINEL = 'FAKE-VALUE-never-printed-9e2a';

const row = (spoken: string, scope: Brief['scope'], fields: Record<string, unknown>): Brief => ({ spoken, version: 1, scope, state: null, ...fields });

const full = (): Context => ({
  session: { spoken: 'S47', state: 'active' },
  project: { spoken: 'things#1', name: 'BrainDog', mark: 'B', hue: 210, how: 'remote' },
  ambiguous: [],
  handoff: { from: 'S45', age_s: 3 * 3600, next: 'Wire the device routes into the self-host.', tried: ['Reading the claim from the cookie.'], head: 'a1b2c3d' },
  live: {
    same_repo: [{ spoken: 'S46', state: 'active', doing: 'Money page', agent: 'claude', repo: 'braindog', project: 'things#1', stale: false, quiet: false, age_s: 240 }],
    elsewhere: [{ spoken: 'S12', state: 'active', doing: 'Elsewhere', agent: 'codex', repo: 'site', project: null, stale: false, quiet: false, age_s: 60 }],
  },
  waiting: [
    { id: 'SG12', question: 'Keep the address field?' },
    { id: 'SG14', question: 'Promote LN7 to every project?' },
  ],
  registers: [
    { id: 'tasks', name: 'Tasks', rows: [row('tasks#41', 'project', { what: 'Ship the hooks' })], inherited: [], truncated: false },
    { id: 'tools', name: 'Tools', rows: [], inherited: [row('tools#21', 'global', { name: 'braindog' })], truncated: false },
    { id: 'learnings', name: 'Learnings', rows: [row('LN7', 'project', { lesson: 'Run the gates after the build, never beside it.' })], inherited: [], truncated: false },
    {
      id: 'credentials',
      name: 'Keys',
      rows: [row('credentials#3', 'project', { label: 'Stripe test', opens: 'the test dashboard', note: SENTINEL, value: { sealed: true, opened: 2, last_opened: null, last_by: SENTINEL } })],
      inherited: [row('credentials#9', 'global', { label: 'Cloudflare account', value: { sealed: true, opened: 0, last_opened: null, last_by: null } })],
      truncated: false,
    },
    { id: 'skills', name: 'Skills', rows: [row('skills#2', 'project', { name: 'review-pr', trigger: 'Before a merge' })], inherited: [], truncated: false },
  ],
  people: [row('people#4', 'project', { name: 'Ada Lovelace' })],
  faded: 2,
  next: 'Start from the handoff S45 left, and call handoff with your own next step before you stop.',
});

const attached = (context: Context | undefined, o: { resumed?: boolean; agent?: string } = {}): Attached => ({
  session: { id: 'e_1', seq: 47, state: 'active', version: 1, fields: o.agent === undefined ? {} : { agent: o.agent } },
  spoken: 'S47',
  resumed: o.resumed ?? false,
  project: 'things#1',
  ...(context === undefined ? {} : { context }),
});

const AT: Where = { repo: 'braindog', host: 'STUDIO-PC', device: 'MacBook', agent: 'Claude Code' };

test('THE CARD IS FIVE SLOTS IN ORDER: who and where, the next step, what waits, what was learned, and what is on demand', () => {
  assert.deepEqual(briefing(attached(full()), AT, 4).split('\n'), [
    'BrainDog · run S47 · project BrainDog · Claude Code on MacBook',
    `Also     Money page (S46, Claude Code, 4m ago) is working in this repository too. ${TWO_SESSIONS}`,
    'Next     Wire the device routes into the self-host. (S45, 3h ago, 4 commits since, check before acting)',
    'Waiting  2 on the owner: Keep the address field? · Promote LN7 to every project?',
    'Learned  Run the gates after the build, never beside it.',
    'More     1 dead end · 2 keys by name · 1 skill · call context',
  ]);
});

test('NONE OF THE OLD INVENTORY: no hostname, no "everywhere", no tools as open work, no key or skill by name, no rule repeated', () => {
  const text = briefing(attached(full()), AT, undefined);
  for (const gone of ['STUDIO-PC', 'everywhere', 'Open in', 'Tools', 'tools#21', 'Stripe test', 'Cloudflare account', 'review-pr', 'Ada Lovelace', 'Do not decide', full().next])
    assert.equal(text.includes(gone), false, `"${gone}" is still in:\n${text}`);
  assert.ok(!text.includes('S12'), 'a run in another repository is not this working tree');
  assert.ok(!/\u2014/u.test(text), 'an em dash reached the card');
});

test('TWO SESSIONS IN ONE WORKING TREE are said word for word, and never about the caller itself, a run that stopped or one gone quiet', () => {
  assert.ok(briefing(attached(full()), AT, undefined).includes(TWO_SESSIONS));
  const s46 = full().live.same_repo[0]!;
  const self = { ...s46, spoken: 'S47', doing: 'this very session' };
  /* Quiet as the record works it out, at fifteen minutes (`WORKING_MS`); and `stale` alone, at forty-five, from a host older than `quiet`. */
  const { quiet: _, ...older } = { ...s46, stale: true };
  for (const runs of [[self], [{ ...s46, state: 'idle' }], [{ ...s46, state: 'handoff' }], [{ ...s46, quiet: true }], [older as typeof s46], []]) {
    const text = briefing(attached({ ...full(), live: { same_repo: runs, elsewhere: [] } }), AT, undefined);
    assert.ok(!text.includes(TWO_SESSIONS) && !text.startsWith('Also') && !text.includes('\nAlso'), `${JSON.stringify(runs)} was said as a second session:\n${text}`);
  }
  /* Four at once: three named, the rest counted, and the sentence still whole. */
  const four = ['S50', 'S51', 'S52', 'S53'].map((spoken, i) => ({ ...s46, spoken, doing: `Job ${String(i)}` }));
  const line = briefing(attached({ ...full(), live: { same_repo: four, elsewhere: [] } }), AT, undefined).split('\n')[1]!;
  assert.equal(line, `Also     Job 0 (S50, Claude Code, 4m ago) · Job 1 (S51, Claude Code, 4m ago) · Job 2 (S52, Claude Code, 4m ago) and 1 more are working in this repository too. ${TWO_SESSIONS}`);
});

test('THE QUESTIONS WAIT ON A PERSON BY NAME, and read as words: no network name, no path, and a handle the context can name said by name', () => {
  const waiting = [
    { id: 'SG70', question: 'Change tools#21 to how fly-prism is set up in ~/.claude.json on Maras-MacBook-Pro.local?' },
    { id: 'SG12', question: 'Keep the address field?' },
  ];
  const c = { ...full(), waiting };
  const line = (o: { decider?: string | null } = {}) => briefing(attached(c), AT, undefined, o).split('\n').find((l) => l.startsWith('Waiting'))!;
  assert.equal(line({ decider: 'Sam' }), 'Waiting  2 on Sam: Change braindog to how fly-prism is set up in .claude.json on MacBook? · Keep the address field?');
  /* The record named nobody, or did not answer: the role, never an id. */
  assert.ok(line().startsWith('Waiting  2 on the owner: '), line());
  assert.ok(line({ decider: null }).startsWith('Waiting  2 on the owner: '), line({ decider: null }));
  /* A handle the context cannot name stays a handle; a step left for the next run keeps its paths, and loses only the
     machine's network name. */
  assert.ok(briefing(attached({ ...c, waiting: [{ id: 'SG1', question: 'Close tasks#999?' }] }), AT, undefined).includes('Waiting  1 on the owner: Close tasks#999?'));
  const step = { ...full().handoff!, next: 'Run the tests in apps/cli on DESKTOP-4F2K9QX, then tools#21.' };
  assert.ok(nextLine(attached({ ...full(), handoff: step }), undefined)!.startsWith('Next     Run the tests in apps/cli on Windows PC, then tools#21. (S45'));
});

test('A FILE NAMED .local IS A FILE, NOT A MACHINE, and a path on Windows is its file’s name as one on a Mac is', () => {
  /* The step an agent acts on keeps its file names: `.env.local` read as ".this machine" once. */
  const step = (next: string) => nextLine(attached({ ...full(), handoff: { ...full().handoff!, next } }), undefined)!;
  assert.ok(step('Copy .env.local to the worker, then read ~/.claude/settings.local.json and config.local.yaml.').startsWith('Next     Copy .env.local to the worker, then read ~/.claude/settings.local.json and config.local.yaml. (S45'));
  assert.ok(step('Deploy from Maras-MacBook-Pro.local.').startsWith('Next     Deploy from MacBook. (S45'));
  const waiting = [{ id: 'SG9', question: 'Change tools#999 to how fenwick is set up in C:\\Users\\sam\\.claude.json, or in .\\setup.ps1?' }];
  const line = briefing(attached({ ...full(), waiting }), AT, undefined).split('\n').find((l) => l.startsWith('Waiting'))!;
  assert.equal(line, 'Waiting  1 on the owner: Change tools#999 to how fenwick is set up in .claude.json, or in setup.ps1?');
});

test('A QUESTION THAT FITS IS SAID WHOLE, one that is only ids still waits, and the record’s count of them all is the count', () => {
  const waiting = [
    { id: 'SG3', question: 'Ledger Post, sending plan was due 4 days ago, GBP 39.00. Did it go through?' },
    { id: 'SG2', question: 'SG12' },
    { id: 'SG1', question: 'Import bank_statements.csv?' },
    { id: 'SG0', question: 'Import card_statements.csv?' },
  ];
  const line = (o: { waiting?: number } = {}) => briefing(attached({ ...full(), waiting }), AT, undefined, { decider: 'Sam', ...o }).split('\n').find((l) => l.startsWith('Waiting'))!;
  assert.equal(line(), 'Waiting  4 on Sam: Ledger Post, sending plan was due 4 days ago, GBP 39.00. Did it go through? · SG12 · Import bank_statements.csv?');
  /* `context` sends the newest eight; the record counted thirty, so four distinct and the twenty-six it could not show. */
  assert.ok(line({ waiting: 30 }).startsWith('Waiting  30 on Sam: Ledger Post'), line({ waiting: 30 }));
});

test('NO VALUE IS EVER PRINTED: keys are a count, and nothing that is not a string is read', () => {
  const text = briefing(attached(full()), AT, undefined);
  assert.ok(!text.includes(SENTINEL), 'a field of a key reached the card');
  assert.ok(!text.includes('sealed') && !text.includes('[object'), 'a sealed-state projection reached the card');
});

test('THE NEXT STEP CARRIES ITS AGE AND AUTHOR, and says check before acting when it is old or another run left it', () => {
  const handoff = (h: Partial<NonNullable<Context['handoff']>>, live: Context['live'] = { same_repo: [], elsewhere: [] }) =>
    nextLine(attached({ ...full(), live, handoff: { ...full().handoff!, tried: [], ...h } }), undefined);
  /* The author's app comes from the run while it is live, here or elsewhere. */
  const elsewhere = { spoken: 'S45', state: 'idle', doing: null, agent: 'claude', repo: 'braindog', project: null, stale: true, quiet: true, age_s: 9_000 };
  assert.equal(handoff({ from: 'S45' }, { same_repo: [], elsewhere: [elsewhere] }), 'Next     Wire the device routes into the self-host. (S45, Claude Code, 3h ago, check before acting)');
  /* The caller's own step, an hour old, needs no checking; a day and a second later, it does. */
  assert.equal(handoff({ from: 'S47', age_s: 3_600 }), 'Next     Wire the device routes into the self-host. (S47, 1h ago)');
  assert.equal(handoff({ from: 'S47', age_s: 86_401 }), 'Next     Wire the device routes into the self-host. (S47, 1d ago, check before acting)');
  /* A step the record already names the agent of, which a later host may send. */
  const named = { ...full().handoff!, from: 'S47', age_s: 60, agent: 'codex' } as NonNullable<Context['handoff']>;
  assert.equal(nextLine(attached({ ...full(), handoff: named }), null), 'Next     Wire the device routes into the self-host. (S47, Codex, 1m ago, HEAD moved)');
  /* A step with no stop gets one; no handoff is no Next line at all. */
  assert.equal(handoff({ from: 'S47', age_s: 30, next: 'Ship it' }), 'Next     Ship it. (S47, just now)');
  assert.equal(nextLine(attached({ ...full(), handoff: null }), undefined), null);
});

test('WHAT A PERSON HANDED TO THIS AGENT LEADS THE NEXT SLOT, with its handle, and the handoff keeps a place beside it', () => {
  const tasks = Array.from({ length: 4 }, (_, i) => row(`tasks#${String(i + 1)}`, 'project', { what: `Task ${String(i + 1)}`, agent: 'claude' }));
  const c: Context = { ...full(), handoff: { ...full().handoff!, tried: [] }, registers: [{ id: 'tasks', name: 'Tasks', rows: tasks, inherited: [], truncated: false }] };
  const text = briefing(attached(c, { agent: 'claude' }), AT, undefined);
  assert.ok(text.includes('Next     Task 1 (tasks#1, handed to you) · Task 2 (tasks#2, handed to you) · Wire the device routes'), text);
  assert.ok(text.includes('More     2 more handed to you · call context'), text);
  /* Another agent's rows are not this one's. */
  assert.ok(!briefing(attached(c, { agent: 'codex' }), AT, undefined).includes('handed to you'));
});

test('QUESTIONS THAT READ THE SAME, ONCE IDS AND CASE ARE SET ASIDE, ARE ONE, with how many there are', () => {
  const same = 'bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern.';
  const waiting = [
    { id: 'SG73', question: 'bank-ipn-out-sms could not read account out of this one. Accept it into transactions, or fix the pattern.' },
    { id: 'SG72', question: same },
    { id: 'SG71', question: same.toUpperCase() },
    { id: 'SG70', question: 'Change tools#8 to how fly-prism is set up?' },
    { id: 'SG69', question: 'Change tools#9 to how fly-prism is set up?' },
  ];
  assert.deepEqual(asked(waiting).map((a) => a.count), [1, 2, 2]);
  const line = briefing(attached({ ...full(), waiting }), AT, undefined).split('\n').find((l) => l.startsWith('Waiting'))!;
  /* Each is its first sentence, the question: how to answer it is Decide's to show. */
  assert.equal(
    line,
    'Waiting  3 on the owner: bank-ipn-out-sms could not read account out of this one. · bank-card-used-sms could not read account out of this one. (2 like this) · Change tools#8 to how fly-prism is set up? (2 like this)',
  );
  /* Clipped at a word, never inside one. */
  const long = { id: 'SG1', question: `Renew ${'the domain and the mail and the site '.repeat(4)}before Thursday?` };
  const cut = briefing(attached({ ...full(), waiting: [long] }), AT, undefined).split('\n').find((l) => l.startsWith('Waiting'))!;
  assert.match(cut, /^Waiting {2}1 on the owner: Renew the domain .*[a-z]…$/u);
  assert.ok([...cut.slice('Waiting  1 on the owner: '.length)].length <= 90, cut);
  /* A stop too early to end a question is not taken for its end. */
  assert.deepEqual(
    ['Pay Dr. Okafor for the March session? It is the second reminder.', 'e.g. this one?', 'One. Two.'].map(questionOf),
    ['Pay Dr. Okafor for the March session?', 'e.g. this one?', 'One. Two.'],
  );
});

test('AT MOST THREE ITEMS TO A SLOT AND 1,500 CHARACTERS, keeping the first line, the warning, the next step and the call', () => {
  const long = 'word '.repeat(200);
  const many: Context = {
    ...full(),
    handoff: { ...full().handoff!, next: long, tried: [long, long, long, long] },
    live: { same_repo: Array.from({ length: 5 }, (_, i) => ({ ...full().live.same_repo[0]!, spoken: `S${String(60 + i)}`, doing: long })), elsewhere: [] },
    waiting: Array.from({ length: 8 }, (_, i) => ({ id: `SG${String(i + 1)}`, question: `Question ${String(i + 1)}, ${long}` })),
    registers: [
      { id: 'learnings', name: 'Learnings', rows: Array.from({ length: 9 }, (_, i) => row(`LN${String(i)}`, 'project', { lesson: `Lesson ${String(i)} ${long}` })), inherited: [], truncated: true },
      { id: 'credentials', name: 'Keys', rows: Array.from({ length: 20 }, (_, i) => row(`credentials#${String(i)}`, 'project', { label: long })), inherited: [], truncated: true },
      { id: 'skills', name: 'Skills', rows: Array.from({ length: 20 }, (_, i) => row(`skills#${String(i)}`, 'project', { name: `skill-${String(i)}` })), inherited: [], truncated: true },
    ],
  };
  const text = briefing(attached(many), { ...AT, device: long }, null);
  const lines = text.split('\n');
  assert.ok([...text].length <= MAX_CHARS, `${String([...text].length)} characters`);
  assert.match(lines[0]!, /^BrainDog · run S47 · project BrainDog · Claude Code on word word/u);
  assert.ok(text.includes(TWO_SESSIONS), 'the warning was cut');
  assert.ok(lines.some((l) => l.startsWith('Next     word')), 'the next step was cut');
  assert.match(lines.at(-1)!, /^More {5}.*call context$/u);
  for (const l of lines.slice(1)) assert.ok(l.split(' · ').length <= PER_SLOT + 1, `more than three items: ${l}`);
  assert.ok(lines.some((l) => l.startsWith('Waiting  8 on the owner: ')), 'the count of questions was lost');
  assert.ok(text.includes('4 dead ends') && text.includes('9+ learnings') && text.includes('20+ keys by name'), text);

  /* STILL TOO LONG with every item at its own cap: rows handed over, a long first line and a skill to grow. What goes
     first is a learning, and every slot keeps its count and its first item. */
  const handed = Array.from({ length: 6 }, (_, i) => row(`tasks#${String(i + 1)}`, 'project', { what: `Task ${String(i)} ${long}`, agent: 'claude' }));
  const grown: Context = {
    ...many,
    registers: [
      { id: 'tasks', name: 'Tasks', rows: handed, inherited: [], truncated: false },
      { id: 'learnings', name: 'Learnings', rows: Array.from({ length: 9 }, (_, i) => row(`LN${String(i)}`, 'project', { lesson: `Lesson ${String(i)} ${long}`, topic: 'x'.repeat(60) })), inherited: [], truncated: true },
      { id: 'skills', name: 'Skills', rows: [row('skills#1', 'project', { name: 'x'.repeat(60) })], inherited: [], truncated: false },
    ],
  };
  const tight = briefingOf(`BrainDog · run S47 · ${long}`, grown, null, { own: 'S47', agent: 'claude' });
  assert.ok([...tight].length <= MAX_CHARS, `${String([...tight].length)} characters`);
  const learned = tight.split('\n').find((l) => l.startsWith('Learned'));
  assert.equal(learned?.split(' · ').length, 1, 'the learnings were not the first to go');
  for (const slot of ['Also', 'Next', 'Waiting  8 on the owner', 'More']) assert.ok(tight.split('\n').some((l) => l.startsWith(slot)), `${slot} went: ${tight}`);
  /* A run the cap took off the line is still counted: five runs are the ones named and "and N more". */
  for (const card of [text, tight]) {
    const also = card.split('\n').find((l) => l.startsWith('Also'))!;
    const named = also.split(' · ').length;
    assert.ok(also.includes(` and ${String(5 - named)} more are working`), also);
  }
});

test('A RECORD WITH ITS MODULES SWITCHED OFF still briefs: the first line and the call, and nothing for what it lacks', () => {
  const bare: Context = {
    session: { spoken: 'S1', state: 'active' },
    project: null,
    ambiguous: [],
    handoff: null,
    live: { same_repo: [], elsewhere: [] },
    waiting: [],
    registers: [],
    people: [],
    faded: 0,
    next: 'Work from what is open here, and call handoff with the one next step before you stop.',
  };
  assert.deepEqual(briefing(attached(bare, { resumed: true }), { repo: null, host: 'box' }, undefined).split('\n'), ['BrainDog · run S47 · no project · on this machine', 'More     call context']);
  /* A register the pack declares, present but empty, prints nothing either. */
  const empty = { ...bare, registers: [{ id: 'credentials', name: 'Keys', rows: [], inherited: [], truncated: false }] };
  assert.ok(!briefing(attached(empty), AT, undefined).includes('key'));
  /* A host older than `context` sends none, and the card is its first line and the call. */
  assert.equal(briefing(attached(undefined), AT, undefined), 'BrainDog · run S47 · no project · Claude Code on MacBook\nMore     call context');
  assert.equal(nextLine(attached(undefined), undefined), null);
});

test('A TIE BETWEEN PROJECTS is counted, never named by id, and a skill a learning bears on is on demand', () => {
  const tie = { ...full(), project: null, ambiguous: ['things#1', 'things#2'] };
  const head = briefing(attached(tie), AT, null).split('\n')[0]!;
  assert.equal(head, 'BrainDog · run S47 · 2 projects match this folder · Claude Code on MacBook');
  const learnings = { id: 'learnings', name: 'Learnings', rows: [row('LN12', 'project', { lesson: 'Rebase before review.', topic: 'Review-PR ' })], inherited: [], truncated: false };
  const grown = { ...full(), registers: [...full().registers.filter((r) => r.id !== 'learnings'), learnings] };
  assert.ok(briefing(attached(grown), AT, undefined).includes('More     1 dead end · 1 learning for skill review-pr · 2 keys by name · call context'));
});

test('THE RECORD’S OWN CARD IS PRINTED AS IT CAME, scrubbed of control characters, and a compaction gets its Next line', () => {
  const card = ['BrainDog · run S47 · project BrainDog · Claude Code · MacBook', 'Next     Cut page answers\u009b2K to block summaries. (S45, Claude Code, 5h ago)', 'More     call context'].join('\n');
  const c = { ...full(), card } as Context;
  assert.equal(briefing(attached(c), AT, 4), 'BrainDog · run S47 · project BrainDog · Claude Code · MacBook\nNext     Cut page answers 2K to block summaries. (S45, Claude Code, 5h ago)\nMore     call context');
  assert.equal(nextLine(attached(c), 4), 'Next     Cut page answers 2K to block summaries. (S45, Claude Code, 5h ago)');
  assert.equal(nextLine(attached({ ...full(), card: 'BrainDog · run S47' } as Context), undefined), null);
  /* A card that is not a line of text is no card, and the renderer draws one. */
  assert.ok(briefing(attached({ ...full(), card: 7 } as unknown as Context), AT, undefined).startsWith('BrainDog · run S47 · project BrainDog'));
});

test('words are cut at a word, an em dash becomes a comma, and the ages read as the card says them', () => {
  assert.equal(words('Close a task the moment it is done \u2014 and say how you know.', 200), 'Close a task the moment it is done, and say how you know.');
  assert.equal(words('A range of 10\u201320 stays.', 40), 'A range of 10\u201320 stays.');
  assert.equal(words('one two three four five six', 15), 'one two three…');
  assert.equal(words('averyveryverylongwordwithnospace', 10), 'averyvery…');
  assert.deepEqual([since(5), since(60), since(7_200), since(86_400 * 3)], ['just now', '1m ago', '2h ago', '3d ago']);
  assert.deepEqual([ago(5), ago(60), ago(7_200), ago(86_400 * 3)], ['just now', '1 minute ago', '2 hours ago', '3 days ago']);
});
