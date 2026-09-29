/**
 * The briefing, as text: its order, its cap, what it never prints, and a record with modules switched off.
 *
 * PURE, SO NO HOST. The hooks test sends a briefing through a real socket; here every shape `context` can
 * take is built by hand, including ones a seeded record would never produce.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Attached, Brief, Context } from '@braindog/client';

import { MAX_CHARS, MAX_LINES, TWO_SESSIONS, ago, briefing } from '../src/brief.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const SENTINEL = 'FAKE-VALUE-never-printed-9e2a';

const row = (spoken: string, scope: Brief['scope'], fields: Record<string, unknown>): Brief => ({ spoken, version: 1, scope, state: null, ...fields });

const full = (): Context => ({
  session: { spoken: 'S47', state: 'active' },
  project: { spoken: 'things#1', name: 'BrainDog', mark: 'B', hue: 210, how: 'remote' },
  ambiguous: [],
  handoff: { from: 'S45', age_s: 3 * 3600, next: 'Wire the device routes into the self-host.', tried: ['Reading the claim from the cookie.'], head: 'a1b2c3d' },
  live: {
    same_repo: [{ spoken: 'S46', state: 'active', doing: 'Money page', agent: 'claude', repo: 'braindog', project: 'things#1', stale: false, age_s: 240 }],
    elsewhere: [{ spoken: 'S12', state: 'active', doing: 'Elsewhere', agent: 'codex', repo: 'site', project: null, stale: false, age_s: 60 }],
  },
  waiting: [
    { id: 'SG12', question: 'Keep the address field?' },
    { id: 'SG14', question: 'Promote LN7 to every project?' },
  ],
  registers: [
    { id: 'tasks', name: 'Tasks', rows: [row('tasks#41', 'project', { what: 'Ship the hooks' })], inherited: [], truncated: false },
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

const attached = (context: Context | undefined, resumed = false): Attached => ({
  session: { id: 'e_1', seq: 47, state: 'active', version: 1, fields: {} },
  spoken: 'S47',
  resumed,
  project: 'things#1',
  ...(context === undefined ? {} : { context }),
});

const AT = { repo: 'braindog', host: 'STUDIO-PC' };

test('THE BRIEFING IS IN THE OWNER’S ORDER: who and where, the handoff, who else is here, what waits, then what applies', () => {
  const text = briefing(attached(full()), AT, 4);
  const order = [
    'BrainDog: S47 started in braindog on STUDIO-PC. Project: BrainDog.',
    'Last handoff (S45, 3 hours ago): Wire the device routes into the self-host.',
    '  Already tried: Reading the claim from the cookie.',
    '  HEAD has moved 4 commits since then. Re-read before trusting it.',
    'Also live in this repo: S46 "Money page", seen 4 minutes ago.',
    `  ${TWO_SESSIONS}`,
    'Waiting on the owner (2):',
    '  SG12 Keep the address field?',
    '  The owner answers these in the app. Do not decide for them.',
    'Open in Tasks (1 of 1): tasks#41 Ship the hooks.',
    'People on this project: people#4 Ada Lovelace.',
    'Learnings here (1 shown, 2 faded):',
    'Keys you may use here, by name: Stripe test (this project); Cloudflare account (everywhere). A value is never shown here.',
    'Skills: review-pr (this project).',
    'Start from the handoff S45 left',
  ];
  let from = -1;
  for (const part of order) {
    const at = text.indexOf(part);
    assert.ok(at > from, `"${part}" is missing or out of order in:\n${text}`);
    from = at;
  }
  assert.equal(text.split('\n').at(-1), full().next);
  assert.ok(!text.includes('S12'), 'a run in another repository is not this working tree');
});

test('TWO SESSIONS IN ONE WORKING TREE are said word for word, and never when this run is alone', () => {
  assert.ok(briefing(attached(full()), AT, undefined).includes(TWO_SESSIONS));
  const alone = { ...full(), live: { same_repo: [], elsewhere: full().live.elsewhere } };
  assert.ok(!briefing(attached(alone), AT, undefined).includes('Two sessions'));
});

test('A RUN THAT STOPPED IS NOT A COLLISION: idle after its end hook, waiting on a handoff, or stale', () => {
  const s46 = full().live.same_repo[0]!;
  for (const run of [{ ...s46, state: 'idle' }, { ...s46, state: 'handoff' }, { ...s46, stale: true }]) {
    const text = briefing(attached({ ...full(), live: { same_repo: [run], elsewhere: [] } }), AT, undefined);
    assert.ok(!text.includes(TWO_SESSIONS) && !text.includes('Also live in this repo'), `${String(run.state)} ${String(run.stale)} was said as live`);
  }
});

test('NO VALUE IS EVER PRINTED: a key is its label, and nothing that is not a string is read', () => {
  const text = briefing(attached(full()), AT, undefined);
  assert.ok(!text.includes(SENTINEL), 'a field of a key other than its label reached the briefing');
  assert.ok(!text.includes('sealed') && !text.includes('[object'), 'a sealed-state projection reached the briefing');
});

test('AT MOST FORTY LINES AND THREE THOUSAND CHARACTERS, keeping the warning, the questions and the next step', () => {
  const long = 'word '.repeat(200);
  const many: Context = {
    ...full(),
    handoff: { ...full().handoff!, next: long, tried: [long, long, long, long] },
    waiting: Array.from({ length: 8 }, (_, i) => ({ id: `SG${String(i + 1)}`, question: long })),
    registers: Array.from({ length: 30 }, (_, i) => ({
      id: `r${String(i)}`,
      name: `Register ${String(i)}`,
      rows: Array.from({ length: 20 }, (_, j) => row(`r${String(i)}#${String(j + 1)}`, 'project', { what: long })),
      inherited: [],
      truncated: true,
    })),
    people: Array.from({ length: 10 }, (_, i) => row(`people#${String(i)}`, 'project', { name: long })),
  };
  const text = briefing(attached(many), AT, null);
  const lines = text.split('\n');
  assert.ok(lines.length <= MAX_LINES, `${String(lines.length)} lines`);
  assert.ok(text.length <= MAX_CHARS, `${String(text.length)} characters`);
  assert.match(lines[0]!, /^BrainDog: S47 started/);
  assert.equal(lines.at(-1), full().next);
  assert.ok(text.includes(TWO_SESSIONS));
  assert.ok(text.includes('Do not decide for them.'));
  assert.ok(text.includes('left out. Call context for all of it.'));
});

test('A RECORD WITH ITS MODULES SWITCHED OFF still briefs: no people, no keys, no skills, no learnings, no rows', () => {
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
  assert.deepEqual(briefing(attached(bare, true), { repo: null, host: 'box' }, undefined).split('\n'), [
    'BrainDog: S47 resumed in a folder outside any repository on box. No project here, so only what applies everywhere is shown.',
    bare.next,
  ]);
  /* A register the pack declares, present but empty, prints nothing either. */
  const empty = { ...bare, registers: [{ id: 'credentials', name: 'Keys', rows: [], inherited: [], truncated: false }] };
  assert.ok(!briefing(attached(empty), AT, undefined).includes('Keys'));
  /* And a host older than `context` sends none. */
  assert.match(briefing(attached(undefined), AT, undefined), /^BrainDog: S47 started in braindog on STUDIO-PC\.[^\n]*\nThis host sends no briefing\./);
});

test('a tie between projects is said, and HEAD that git cannot count is said plainly', () => {
  const tie = { ...full(), project: null, ambiguous: ['things#1', 'things#2'] };
  const text = briefing(attached(tie), AT, null);
  assert.ok(text.includes('This folder matches things#1 and things#2. Global until one of them lists it.'));
  assert.ok(text.includes('  HEAD is not where it was then. Re-read before trusting it.'));
  assert.deepEqual([ago(5), ago(60), ago(7_200), ago(86_400 * 3)], ['just now', '1 minute ago', '2 hours ago', '3 days ago']);
});
