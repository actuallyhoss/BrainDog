/**
 * An agent's `propose` answer and its briefing say names, never an id or an address ("the
 * MCP answers in those names, so an agent never meets a raw id or a duplicate person").
 *
 * THE SENTENCES COME FROM ELSEWHERE: a question is the agent's own words or the record's, a step is what the last run
 * left, a person's name is what the record kept when it met them by mail. Each can carry a row id, a handle with no
 * words, a person's id, a path, a machine's name or a mail address. What is tested is that the tool layer says each by
 * name, with a handle beside the name where there is one to act on, and never the address at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Look } from '../src/brief.ts';
import { nameOnly, plainOf, proposedBrief, ruledBrief, unaddressed } from '../src/brief.ts';
import { briefed } from '../src/briefing.ts';
import { tools } from '../src/index.ts';
import { stub } from './stub.ts';

const ROW = '01M345FTM0D4F495AW6K6NDA09';
const OTHER = '01M345FTM0D4F495AW6K6NDA10';
const agent = { who: 'agent' };

/** What a person reads must never carry, each with what it is. */
const NEVER: readonly [RegExp, string][] = [
  [/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+\.[\p{L}]/u, 'a mail address'],
  [/\b[0-9A-HJKMNP-TV-Z]{26}\b/u, 'a row id'],
  [/\b[pt]_[A-Za-z0-9]+/u, "a person's or a token's id"],
  [/\.local\b/u, "a machine's own name"],
  [/~\/|\/Users\//u, 'a path'],
];
const clean = (said: string, where: string) => {
  for (const [re, what] of NEVER) assert.doesNotMatch(said, re, `${where} carried ${what}: ${said}`);
};

const look: Look = {
  now: Date.UTC(2026, 9, 6),
  decl: (r) => (r === 'people' ? ({ id: 'people', name: 'People', one: 'person', fields: [] } as never) : undefined),
  title: (h) => ({ 'people#3': 'Joaquin Herrera', 'people#9': 'joaquin@lanternfish.example', [ROW]: 'Joaquin Herrera (people#3)', P6: 'Teodor Vance' })[h],
  actor: (by) => (by === 'p_1' ? 'Mara' : 'Someone'),
  decider: 'Mara',
};

test('AN ADDRESS BESIDE A NAME GOES AND THE NAME STAYS; ONE ALONE IS SOMEONE, and names nobody', () => {
  assert.equal(unaddressed('Reply to Jo <jo@kiln.example> about the proof'), 'Reply to Jo about the proof');
  assert.equal(unaddressed('Reply to jo@kiln.example about the proof'), 'Reply to someone about the proof');
  assert.equal(unaddressed('Pellucid Repos (58213407+PellucidGit@users.noreply.github.com) pushed'), 'Pellucid Repos pushed');
  assert.equal(unaddressed('write to mailto:jo@kiln.example'), 'write to someone');
  assert.equal(unaddressed('Due on 6 Oct at 10:00 @ the studio'), 'Due on 6 Oct at 10:00 @ the studio', 'an at sign alone is not an address');
  for (const step of ['Pin node@24.13.0 before the tests', 'Bump @braindog/mcp@0.3.1', 'Meet at 3@4.5pm'])
    assert.equal(unaddressed(step), step, 'a version is not an address');
  assert.equal(unaddressed('Mail jo@KILN.CO.UK.'), 'Mail someone.');
  assert.equal(nameOnly('Jo Park <jo@kiln.example>'), 'Jo Park');
  assert.equal(nameOnly('jo@kiln.example'), null);
  assert.equal(nameOnly('Jo Park'), 'Jo Park');
});

test('A QUESTION IS SAID IN NAMES, each handle beside its words, and a row whose words are an address by its kind', () => {
  const said = plainOf(`Merge people#9 into ${ROW}? Asked by p_1 on Maras-MacBook-Pro.local about joaquin@lanternfish.example, from ~/.claude.json`, look);
  assert.equal(said, 'Merge the person people#9 into Joaquin Herrera (people#3)? Asked by Mara on MacBook about someone, from .claude.json');
  clean(said, 'the question');
});

test("PROPOSE'S ANSWER SAYS THE QUESTION IN NAMES, with its own handle to act on", async () => {
  const proposal = { question: `Is joaquin@lanternfish.example the same person as ${ROW}?`, body_kind: 'note', body: {} };
  const { surface } = stub({
    boot: (async () => ({ ok: true, value: { me: { level: 'owner', name: 'Mara' }, registers: [{ id: 'people', name: 'People' }] } })) as never,
    get: (async () => ({ ok: true, value: { id: ROW, register: 'people', seq: 3, version: 1, state: null, fields: { name: 'Joaquin Herrera' } } })) as never,
    schema: (async () => ({ ok: true, value: { id: 'people', name: 'People', title: 'name', seq_prefix: 'P', fields: [{ id: 'name', type: 'text' }] } })) as never,
    propose: (async () => ({ ok: true, value: { id: 'SG7', question: proposal.question } })) as never,
  });
  const said = await tools(surface).answer('propose', proposal, agent);
  assert.match(said.text ?? '', /^Asked Mara: Is someone the same person as Joaquin Herrera \(P3\)\? \(SG7\)\nMara decides in BrainDog\.\nReceipt: To take it back, call propose with withdraw "SG7"\.$/u);
  clean(said.text ?? '', 'the propose answer');
});

test('A FILED OR LANDED ANSWER IS IN NAMES TOO', () => {
  const filed = ruledBrief({ filed: { id: 'SG8', question: `Add jo@kiln.example to people as ${OTHER}?`, why: 'Asked by p_1.' } }, ['people'], look);
  assert.match(filed, /^Filed for Mara to decide: Add someone to people as an entry you cannot open\? \(SG8\)\nAsked by Mara\./u);
  clean(filed, 'a filed answer');
  clean(proposedBrief({ id: 'SG9', decide: 'https://brain.dog/mara/decide/SG9' }, 'Link Jo <jo@kiln.example> to people#3?', look), 'a proposal');
});

test('THE BRIEFING SAYS PEOPLE BY NAME, and a step, a question or a learning never carries an address or an id', () => {
  const { text, value } = briefed({
    look,
    home: null,
    context: {
      session: { spoken: 'S6' },
      project: { spoken: 'things#1', name: 'Lanternfish' },
      handoff: { from: 'S5', next: `Write to joaquin@lanternfish.example about ${ROW}`, age_s: 3_600, tried: ['Mailed jo@kiln.example'] },
      waiting: [{ id: 'SG7', question: 'Is Joaquin Herrera <joaquin@lanternfish.example> the same person as people#3?' }],
      people: [
        { spoken: 'P6', name: 'Teodor Vance <teo@lanternfish.example>', role: 'client' },
        { spoken: 'P7', name: 'jo@kiln.example' },
        { spoken: 'P8', name: 'Wren', org: 'P6' },
      ],
      live: { same_repo: [{ spoken: 'S4', agent: 'claude', doing: 'Mailing jo@kiln.example from /Users/mara/Developer', age_s: 60 }] },
    },
  });
  clean(text, 'the briefing');
  const kept = value as { handoff: { next: string; tried: string[] }; waiting: { shown: { question: string }[] } };
  for (const s of [kept.handoff.next, ...kept.handoff.tried, ...kept.waiting.shown.map((q) => q.question)]) assert.doesNotMatch(s, NEVER[0]![0], `the briefing's value carried an address: ${s}`);
});

test('OPEN WORK IN THE BRIEFING SAYS NO ADDRESS, though a task is worded with one', () => {
  const tasks = { id: 'tasks', name: 'Tasks', one: 'task', title: 'title', hand: 'owner', fields: [{ id: 'title', type: 'text' }] };
  const { text } = briefed({
    look: { ...look, decl: (r) => (r === 'tasks' ? (tasks as never) : look.decl(r)) },
    home: null,
    context: {
      session: { spoken: 'S6' },
      registers: [{ id: 'tasks', rows: [{ spoken: 'T4', title: 'Reply to jo@kiln.example about node@24.13.0' }] }],
    },
  });
  assert.match(text, /Reply to someone about node@24\.13\.0/u);
  clean(text, 'the open work');
});

test('AN ADDRESS AT A MACHINE, OR WRITTEN OUT TO DODGE A SCRAPER, IS STILL AN ADDRESS', () => {
  assert.equal(unaddressed('Ask jo@localhost about the build'), 'Ask someone about the build');
  assert.equal(unaddressed('Mail jo@10.0.0.1.'), 'Mail someone.');
  assert.equal(unaddressed('Write to jo [at] x.io first'), 'Write to someone first');
  assert.equal(unaddressed('Write to jo (AT) kiln [dot] example first'), 'Write to someone first');
  assert.equal(nameOnly('Jo Park <jo@localhost>'), 'Jo Park');
  assert.equal(nameOnly('jo [at] x.io'), null);
  for (const step of ['Pin node@24.13.0 before the tests', 'Bump @braindog/mcp@0.3.1', 'Meet at 3@4.5pm', 'Meet (at) noon', 'Due at 10:00 @ the studio'])
    assert.equal(unaddressed(step), step, 'a version, a time or a word is not an address');
});
