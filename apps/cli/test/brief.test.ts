/**
 * The start hook's card, as text: the record's own printed as it came, held to the cap, and one line from a host that
 * sends none. This command composes no card (AGT-B07): the slots, their order and their caps are the record's, held in
 * `packages/record/test/card.test.ts`, where the cases that held this command's composer went with it.
 *
 * PURE, SO NO HOST. The hooks test sends a card through a real socket; here every shape `context` can take is built
 * by hand, including ones a seeded record would never produce.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Attached, Brief, Context } from '@braindog/client';

import { MAX_CHARS, ago, briefing, briefingOf, connected, nextLine, words, type Where } from '../src/brief.ts';

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

/* WHAT MOVED TO THE RECORD WITH THE COMPOSER (AGT-B07): the five slots in order, two sessions said word for word, the
   questions by name and in words, a file named .local, a question said whole, the step's age and author, rows handed to
   this agent, questions alike counted once, three items a slot under the cap, and a tie between projects. Each is a case
   of `packages/record/test/card.test.ts` now. What still holds here is below. */

test('A HOST THAT SENDS NO CARD IS ONE LINE, however much its context says, and composes nothing in its place', () => {
  for (const c of [full(), undefined]) {
    const text = briefing(attached(c), AT, 4);
    assert.equal(text, 'Connected to BrainDog. Call context.');
    assert.doesNotMatch(text, /^(Next|Waiting|Also|Learned|More)\s/mu, text);
  }
  assert.equal(briefing(attached(full()), AT, 4, { record: 'Kiln Studio' }), 'Connected to Kiln Studio. Call context.');
  assert.equal(nextLine(attached(full()), 4), null, 'a host with no card has no Next line to give');
  assert.equal(nextLine(attached(undefined), undefined), null);
});

test('NONE OF THE OLD INVENTORY AND NO VALUE: no hostname, no tools as work, no key by name, nothing that is not a string', () => {
  const text = briefing(attached(full()), AT, undefined);
  for (const gone of ['STUDIO-PC', 'everywhere', 'Open in', 'Tools', 'tools#21', 'Stripe test', 'Cloudflare account', 'review-pr', 'Ada Lovelace', 'S12', SENTINEL, 'sealed', '[object', full().next])
    assert.equal(text.includes(gone), false, `"${gone}" is still in:\n${text}`);
  assert.ok(!/\u2014/u.test(text), 'an em dash reached the card');
});

test('THE ONE LINE NAMES THE RECORD, never an id, and BrainDog when nothing names it', () => {
  assert.equal(connected('Kiln Studio'), 'Connected to Kiln Studio. Call context.');
  assert.equal(connected('01J9ZK6Q3W8X4Y5Z6A7B8C9D0E'), 'Connected to BrainDog. Call context.');
  assert.equal(connected(null), 'Connected to BrainDog. Call context.');
  assert.equal(connected('Kiln\u001b[2J'), 'Connected to Kiln [2J. Call context.');
});

test('braindog context PRINTS THE SAME: the record\u2019s card as the start hook does, else the one line', () => {
  const card = 'BrainDog · run S47 · project Kiln\nNext     Ask Zoë Müller and سارة about the kerning. (S45)\nMore     call context';
  const c = { ...full(), card } as Context;
  assert.equal(briefingOf('BrainDog · run S47', c, 4), briefing(attached(c), AT, 4));
  assert.equal(briefingOf('BrainDog · run S47', c, 4), card, 'a name was not printed as written');
  assert.equal(briefingOf('BrainDog · run S47', full(), 4), 'Connected to BrainDog. Call context.');
});

test('A RECORD CARD PAST THE CAP IS HELD TO IT: the first line always, then whole lines while they fit', () => {
  const long = 'word '.repeat(120).trim();
  const card = ['BrainDog · run S47 · project Kiln', ...Array.from({ length: 6 }, (_, i) => `Waiting  ${String(i)} ${long}`)].join('\n');
  const text = briefing(attached({ ...full(), card } as Context), AT, undefined);
  assert.ok([...text].length <= MAX_CHARS, `${String([...text].length)} characters`);
  assert.equal(text.split('\n')[0], 'BrainDog · run S47 · project Kiln');
  for (const line of text.split('\n').slice(1)) assert.ok(line.endsWith('word'), `a line was cut inside: ${line}`);
});

test('THE RECORD’S OWN CARD IS PRINTED AS IT CAME, scrubbed of control characters, and a compaction gets its Next line', () => {
  const card = ['BrainDog · run S47 · project BrainDog · Claude Code · MacBook', 'Next     Cut page answers\u009b2K to block summaries. (S45, Claude Code, 5h ago)', 'More     call context'].join('\n');
  const c = { ...full(), card } as Context;
  assert.equal(briefing(attached(c), AT, 4), 'BrainDog · run S47 · project BrainDog · Claude Code · MacBook\nNext     Cut page answers 2K to block summaries. (S45, Claude Code, 5h ago)\nMore     call context');
  assert.equal(nextLine(attached(c), 4), 'Next     Cut page answers 2K to block summaries. (S45, Claude Code, 5h ago)');
  assert.equal(nextLine(attached({ ...full(), card: 'BrainDog · run S47' } as Context), undefined), null);
  /* A card that is not a line of text is no card, and the host is told the one line. */
  assert.equal(briefing(attached({ ...full(), card: 7 } as unknown as Context), AT, undefined), 'Connected to BrainDog. Call context.');
});

test('A COMPACTION PRINTS THE RECORD’S card_next, scrubbed as the card is; null from it is no step, and without it the card’s Next line', () => {
  const card = ['BrainDog · run S47 · project BrainDog', 'Next     Cut page answers to block summaries. (S45)', 'More     call context'].join('\n');
  const next = 'Next     Cut page answers\u001b[2J to block summaries. (S45) · 12 commits since';
  assert.equal(nextLine(attached({ ...full(), card, card_next: next } as Context), 12), 'Next     Cut page answers [2J to block summaries. (S45) · 12 commits since');
  assert.equal(nextLine(attached({ ...full(), card, card_next: null } as Context), 12), null, 'the record says there is no step');
  assert.equal(nextLine(attached({ ...full(), card } as Context), 12), 'Next     Cut page answers to block summaries. (S45)');
  /* The record's card is the whole card: nothing this command would compose is added, whatever moved. */
  assert.equal(briefing(attached({ ...full(), card, card_next: next } as Context), AT, 12), card);
});

test('words are cut at a word, an em dash becomes a comma, and an age reads as session show says it', () => {
  assert.equal(words('Close a task the moment it is done \u2014 and say how you know.', 200), 'Close a task the moment it is done, and say how you know.');
  assert.equal(words('A range of 10\u201320 stays.', 40), 'A range of 10\u201320 stays.');
  assert.equal(words('one two three four five six', 15), 'one two three…');
  assert.equal(words('averyveryverylongwordwithnospace', 10), 'averyvery…');
  assert.deepEqual([ago(5), ago(60), ago(7_200), ago(86_400 * 3)], ['just now', '1 minute ago', '2 hours ago', '3 days ago']);
});
