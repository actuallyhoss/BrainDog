/**
 * `braindog tidy [--ask]`: how many things with no place look like they belong to a project and how many lessons two
 * projects learned twice, said a line each under what is stale, and `--ask` putting each clean-up on Decide as one
 * question (AGT-D04 job 6).
 *
 * THE CLIENT IS A STAND-IN, handed to the command as `tidy.test.ts`'s stub host would answer it, because the four calls
 * are this batch's (scope-ask, learning-promote) and the real client refuses a call its route table has no row for
 * before sending it. What is under test is the command: which calls it makes, in what order, and what it prints.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Result } from '@braindog/ports';

import type { AgentIo } from '../src/skills.ts';
import { readAsked, readScopes, readTwice, sortLines, tidyCommand, type Caller } from '../src/tidy.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** `scopeProposals` as its task names it: a list a line, each with the question's words and its rows. */
const SCOPES = {
  lists: [
    { list: 'keys', name: 'Keys', count: 52, line: 'Move 52 keys to the projects they belong to?', rows: [{ title: 'Lantern deploy token', project: 'Lantern', reasons: ['Used by 4 runs in Lantern in the last 90 days'] }], truncated: false },
    { list: 'tools', name: 'Tools', count: 1, line: 'Move 1 tool to the project it belongs to?', rows: [{ title: 'Harbor preview', project: 'Harbor', reasons: ['Its config came from Harbor'] }], truncated: false },
  ],
};

/** `learningsTwice` as its task names it: the pairs by name and project. */
const TWICE = {
  pairs: [
    { topic: 'Deploys', older: { title: 'Tail the logs before a deploy', project: 'Harbor' }, newer: { title: 'Read the logs before you deploy', project: 'Lantern' } },
    { topic: 'Tests', older: { title: 'Pin Node for SQLite tests', project: 'Orchard' }, newer: { title: 'Pin the Node version for SQLite', project: 'Quill' } },
  ],
  count: 2,
};

const STALE = { lines: [], count: 0 };

const SORTED = ['52 keys look like they belong to a project.', '1 of your tools looks like it belongs to a project.', '2 lessons were learned twice, in two projects.'];

const ok = (value: unknown): Result<unknown> => ({ ok: true, value });
const no = (code: string, fix: string): Result<unknown> => ({ ok: false, refusal: { code, fix } }) as Result<unknown>;
const OLDER = (name: string): Result<unknown> => no('ROUTE_UNKNOWN', `There is no method called ${name}.`);

/** A client that answers each call from `answers`, an older record for any it is not given, and keeps every call made. */
function standIn(answers: Record<string, Result<unknown>>) {
  const calls: string[] = [];
  const make = (): Caller => ({
    call: async (name) => {
      calls.push(name);
      return answers[name] ?? OLDER(name);
    },
  });
  return { make, calls };
}

function io(): AgentIo & { lines: string[]; said: string[]; answered: unknown[] } {
  const lines: string[] = [];
  const said: string[] = [];
  const answered: unknown[] = [];
  return {
    env: { BRAINDOG_HOST: 'http://127.0.0.1:9', BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.tidy', XDG_CONFIG_HOME: '/nonexistent' },
    cwd: '/nonexistent',
    home: '/nonexistent',
    out: (l) => void lines.push(l),
    say: (l) => void said.push(l),
    answer: (a) => void answered.push(a),
    headers: async () => ({ 'x-braindog-session': 'S7' }),
    lines,
    said,
    answered,
  };
}

/** Nothing a person reads holds an id, a file path or an em dash. */
function plain(lines: string[]): void {
  for (const l of lines) {
    assert.doesNotMatch(l, /—/u, `${l} holds an em dash`);
    assert.doesNotMatch(l, /\b[0-9A-HJKMNP-TV-Z]{26}\b/u, `${l} holds an id`);
    assert.doesNotMatch(l, /\b(keys|tools)#|\/src\//u, `${l} holds a handle or a path`);
  }
}

test('THE COUNTS ARE SAID A LINE A LIST AND ONE FOR THE LESSONS, one in the singular, and nothing at all at nought', () => {
  assert.deepEqual(sortLines(readScopes(SCOPES), readTwice(TWICE)), SORTED);
  assert.deepEqual(sortLines(readScopes({ lists: [{ ...SCOPES.lists[0], count: 1 }] }), readTwice({ pairs: [TWICE.pairs[0]] })), [
    '1 of your keys looks like it belongs to a project.',
    '1 lesson was learned twice, in two projects.',
  ]);
  /* A name that starts with a capitalised word keeps it; a list that proposes nothing, or has no name, is not a line. */
  assert.deepEqual(sortLines(readScopes([{ name: 'CRM notes', rows: [{}, {}] }, { name: 'Skills', count: 0 }, { count: 4 }]), null), ['2 CRM notes look like they belong to a project.']);
  assert.deepEqual(sortLines(readScopes({ lists: [] }), readTwice({ pairs: [] })), []);
  assert.deepEqual(sortLines(readScopes(null), readTwice('none')), []);
  assert.deepEqual(readTwice({ pairs: TWICE.pairs }).pairs, [['Harbor', 'Lantern'], ['Orchard', 'Quill']]);
});

test('WHAT A WRITE FILED IS READ A QUESTION A LINE: the record’s words when it sends them, and never the question’s handle', () => {
  const asked = readAsked({ asked: [{ question: { id: '01JABCDEFGHJKMNPQRSTVWXYZ0', title: 'Move 3 skills to the projects they belong to?' } }, { question: '01JABCDEFGHJKMNPQRSTVWXYZ1', line: 'Retire them, keep them, or leave them?', opened: false }, 7] }, () => '');
  assert.deepEqual(asked, [
    { said: 'Move 3 skills to the projects they belong to?', again: false },
    { said: 'Retire them, keep them, or leave them?', again: true },
  ]);
  /* A question with no words of its own and none to fall back on is not a line. */
  assert.deepEqual(readAsked({ asked: [{ question: '01JABCDEFGHJKMNPQRSTVWXYZ2' }] }, () => ''), []);
});

test('BRAINDOG TIDY SAYS HOW MANY, THEN HOW TO ASK: three reads, no write, exit 0, and every answer under its call’s name', async () => {
  const c = standIn({ stale: ok(STALE), scopeProposals: ok(SCOPES), learningsTwice: ok(TWICE) });
  const one = io();
  assert.equal(await tidyCommand([], one, c.make), 0, one.said.join('\n'));
  assert.deepEqual(c.calls, ['stale', 'scopeProposals', 'learningsTwice']);
  assert.deepEqual(one.lines, ['Nothing is stale.', '', ...SORTED, 'Ask about them with braindog tidy --ask.']);
  assert.deepEqual(one.said, []);
  /* UNTOUCHED: the very answers the record gave, in the order the calls were made. */
  assert.deepEqual(one.answered, [{ value: { stale: STALE, scopeProposals: SCOPES, learningsTwice: TWICE } }]);
  plain(one.lines);

  /* NOTHING AT NOUGHT: no count line, no hint, and not even the blank line under what is stale. */
  const calm = standIn({ stale: ok(STALE), scopeProposals: ok({ lists: [] }), learningsTwice: ok({ pairs: [], count: 0 }) });
  const two = io();
  assert.equal(await tidyCommand([], two, calm.make), 0);
  assert.deepEqual(two.lines, ['Nothing is stale.']);
});

test('BRAINDOG TIDY --ask CALLS BOTH WRITES AND SAYS EACH QUESTION FILED, with where to answer it, by name and never by id', async () => {
  const filed = { asked: [{ list: 'keys', question: '01JABCDEFGHJKMNPQRSTVWXYZ3', rows: 52 }, { list: 'tools', question: '01JABCDEFGHJKMNPQRSTVWXYZ4', rows: 1, opened: false }, { list: 'keys', question: '01JABCDEFGHJKMNPQRSTVWXYZ5', rows: 3 }] };
  const promoted = { asked: [{ question: '01JABCDEFGHJKMNPQRSTVWXYZ6' }, { question: '01JABCDEFGHJKMNPQRSTVWXYZ7', projects: ['Orchard', 'Quill'] }] };
  const c = standIn({ stale: ok(STALE), scopeProposals: ok(SCOPES), learningsTwice: ok(TWICE), proposeScopes: ok(filed), promoteLearnings: ok(promoted) });
  const one = io();
  assert.equal(await tidyCommand(['--ask'], one, c.make), 0, one.said.join('\n'));
  /* `boot` is the fold's read of which lists say what makes two things the same; this stand-in is older than it. */
  assert.deepEqual(c.calls, ['stale', 'scopeProposals', 'learningsTwice', 'proposeScopes', 'promoteLearnings', 'boot']);
  assert.deepEqual(one.lines, [
    'Nothing is stale.',
    '',
    ...SORTED,
    'Asked on Decide: Move 52 keys to the projects they belong to?',
    'Already on Decide: Move 1 tool to the project it belongs to?',
    'Asked on Decide: One more question about your keys.',
    'Asked on Decide: Harbor and Lantern learned the same thing. Keep it once, for everywhere?',
    'Asked on Decide: Orchard and Quill learned the same thing. Keep it once, for everywhere?',
  ]);
  plain(one.lines);
  assert.deepEqual(one.answered, [{ value: { stale: STALE, scopeProposals: SCOPES, learningsTwice: TWICE, proposeScopes: filed, promoteLearnings: promoted } }]);

  /* At nought the writes still go, since a question about stranded rows is the record's to find, and they file nothing. */
  const calm = standIn({ stale: ok(STALE), scopeProposals: ok({ lists: [] }), learningsTwice: ok({ pairs: [] }), proposeScopes: ok({ asked: [] }), promoteLearnings: ok({ asked: [] }) });
  const two = io();
  assert.equal(await tidyCommand(['--ask'], two, calm.make), 0);
  assert.deepEqual(two.lines, ['Nothing is stale.', '', 'Nothing to ask about.']);
});

test('A RECORD OLDER THAN THE NEW CALLS IS SAID IN ONE LINE AND THE COMMAND STILL EXITS 0, with and without --ask', async () => {
  for (const code of ['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']) {
    for (const args of [[], ['--ask']]) {
      const c = standIn({ stale: ok(STALE), scopeProposals: no(code, 'No such call.'), learningsTwice: no(code, 'No such call.') });
      const one = io();
      assert.equal(await tidyCommand(args, one, c.make), 0, `${code} ${args.join(' ')}`);
      /* A WRITE IS SENT ONLY BEHIND A READ THAT ANSWERED; `--ask` reads the index for the fold too, and stops there. */
      assert.deepEqual(c.calls, ['stale', 'scopeProposals', 'learningsTwice', ...(args.length > 0 ? ['boot'] : [])]);
      assert.deepEqual(one.lines, ['Nothing is stale.', '', 'This BrainDog cannot say yet what looks like it belongs to a project, or which lessons were learned twice. It will once it is updated.']);
      assert.deepEqual(one.said, []);
      assert.deepEqual(one.answered, [{ value: { stale: STALE } }]);
    }
  }
  /* One read answered and the other not: the one that answered is said, and the other in its own sentence. */
  const half = standIn({ stale: ok(STALE), learningsTwice: ok(TWICE) });
  const one = io();
  assert.equal(await tidyCommand([], one, half.make), 0);
  assert.deepEqual(one.lines, ['Nothing is stale.', '', '2 lessons were learned twice, in two projects.', 'Ask about them with braindog tidy --ask.', 'This BrainDog cannot say yet what looks like it belongs to a project. It will once it is updated.']);
  /* The reads answer and the writes are older: the counts, and one line saying nothing could be asked, still exit 0. */
  const reads = standIn({ stale: ok(STALE), scopeProposals: ok(SCOPES), learningsTwice: ok(TWICE) });
  const two = io();
  assert.equal(await tidyCommand(['--ask'], two, reads.make), 0);
  assert.deepEqual(two.lines.slice(2), [...SORTED, 'This BrainDog cannot put these on Decide yet. It will once it is updated.']);
  /* A record with no `stale` has neither of the newer calls, so it is asked nothing else. */
  const old = standIn({});
  const three = io();
  assert.equal(await tidyCommand(['--ask'], three, old.make), 0);
  assert.deepEqual(old.calls, ['stale']);
  assert.deepEqual(three.lines, ['This BrainDog is older than this command and cannot say what is stale yet. It will once it is updated.']);
});

test('A WRITE THE RECORD REFUSES IS SAID BY ITS FIX after everything read, and what was filed still says where', async () => {
  const fix = 'Only a person may ask this. Sign in as yourself with braindog login, and ask again.';
  const c = standIn({ stale: ok(STALE), scopeProposals: ok(SCOPES), learningsTwice: ok(TWICE), proposeScopes: no('FORBIDDEN', fix), promoteLearnings: ok({ asked: [{ question: '01JABCDEFGHJKMNPQRSTVWXYZ8' }] }) });
  const one = io();
  assert.equal(await tidyCommand(['--ask'], one, c.make), 1);
  assert.deepEqual(one.lines.slice(2), [...SORTED, 'Asked on Decide: Harbor and Lantern learned the same thing. Keep it once, for everywhere?']);
  assert.deepEqual(one.said, [fix]);
  assert.deepEqual(one.answered.at(-1), { refusal: { code: 'FORBIDDEN', fix } });
});

test('WHAT THE RECORD SAYS IS SCRUBBED for the terminal, and the answer handed on is left exactly as it came', async () => {
  const loud = { lists: [{ list: 'keys', name: 'Keys\u001b[2J', count: 2, line: 'Move 2 keys\u0007?' }] };
  const c = standIn({ stale: ok(STALE), scopeProposals: ok(loud), learningsTwice: ok({ pairs: [] }), proposeScopes: ok({ asked: [{ list: 'keys', question: '01JABCDEFGHJKMNPQRSTVWXYZ9' }] }), promoteLearnings: ok({ asked: [] }) });
  const one = io();
  assert.equal(await tidyCommand(['--ask'], one, c.make), 0);
  // eslint-disable-next-line no-control-regex
  for (const line of one.lines) assert.doesNotMatch(line, /[\u0000-\u0008\u000b-\u001f\u007f]/u, `${JSON.stringify(line)} carries a control character`);
  assert.equal((one.answered[0] as { value: { scopeProposals: unknown } }).value.scopeProposals, loud);
});

test('ONLY A PERSON TYPING --ask ASKS: no hook and no install step passes it, so nothing files these questions by itself', () => {
  for (const file of ['hooks.ts', 'install.ts']) {
    const source = readFileSync(join(SRC, file), 'utf8');
    assert.doesNotMatch(source, /tidy/u, `${file} runs braindog tidy`);
  }
});

/** The index and the declarations the fold reads: Tools and Skills say what makes two the same, Notes does not. */
const BOOT = { registers: [{ id: 'tools', name: 'Tools' }, { id: 'skills', name: 'Skills' }, { id: 'notes', name: 'Notes' }] };
const DECLS: Record<string, unknown> = {
  tools: { id: 'tools', name: 'Tools', same: { fields: ['name'], within: 'project' } },
  skills: { id: 'skills', name: 'Skills', same: { fields: ['name'], within: 'project', keep: 'oldest' } },
  notes: { id: 'notes', name: 'Notes' },
};

/** A stand-in that answers the fold's calls by list, from `held` (each list's numbers) and `fold` (the press's answer). */
function foldIn(held: Record<string, number[]>, fold: (register: string) => Result<unknown> = () => ok({ question: '01JABCDEFGHJKMNPQRSTVWXYZA' })) {
  const calls: [string, string | undefined][] = [];
  const make = (): Caller => ({
    call: async (name, args) => {
      const register = typeof args?.register === 'string' ? args.register : undefined;
      calls.push([name, register]);
      if (name === 'stale') return ok(STALE);
      if (name === 'scopeProposals') return ok({ lists: [] });
      if (name === 'learningsTwice') return ok({ pairs: [] });
      if (name === 'proposeScopes' || name === 'promoteLearnings') return ok({ asked: [] });
      if (name === 'boot') return ok(BOOT);
      if (name === 'schema') return ok(DECLS[register ?? '']);
      if (name === 'heldTwice') return ok(register && register in held ? { seqs: held[register] } : null);
      if (name === 'askFoldTwice') return fold(register ?? '');
      return OLDER(name);
    },
  });
  return { make, calls };
}

test('--ask FILES ONE FOLD QUESTION A LIST THAT HOLDS A PAIR, in its own words, and the answer handed on by list', async () => {
  const c = foldIn({ tools: [2, 5, 7, 9], skills: [3, 4] });
  const one = io();
  assert.equal(await tidyCommand(['--ask'], one, c.make), 0, one.said.join('\n'));
  /* Notes says no `same:`, so it is never asked which of its things are here twice. */
  assert.deepEqual(c.calls.filter(([n]) => n === 'heldTwice' || n === 'askFoldTwice'), [['heldTwice', 'tools'], ['askFoldTwice', 'tools'], ['heldTwice', 'skills'], ['askFoldTwice', 'skills']]);
  assert.deepEqual(one.lines, ['Nothing is stale.', '', 'Asked on Decide: 4 tools may be here twice. Keep one of each?', 'Asked on Decide: 2 skills may be here twice. Keep one of each?']);
  plain(one.lines);
  const doc = (one.answered[0] as { value: Record<string, unknown> }).value;
  assert.deepEqual(doc.heldTwice, { tools: { seqs: [2, 5, 7, 9] }, skills: { seqs: [3, 4] } });
  assert.deepEqual(Object.keys(doc.askFoldTwice as object), ['tools', 'skills']);
});

test('NO PAIR, NO FOLD QUESTION, and nothing of the fold is read or filed without --ask', async () => {
  const none = foldIn({ tools: [], skills: [] });
  const one = io();
  assert.equal(await tidyCommand(['--ask'], one, none.make), 0);
  assert.equal(none.calls.filter(([n]) => n === 'heldTwice').length, 2);
  assert.equal(none.calls.filter(([n]) => n === 'askFoldTwice').length, 0);
  assert.deepEqual(one.lines, ['Nothing is stale.', '', 'Nothing to ask about.']);

  const bare = foldIn({ tools: [2, 5] });
  const two = io();
  assert.equal(await tidyCommand([], two, bare.make), 0);
  assert.deepEqual(bare.calls.map(([n]) => n), ['stale', 'scopeProposals', 'learningsTwice']);
  assert.ok(!two.lines.some((l) => l.includes('here twice')));
});

test('A FOLD THE RECORD REFUSES IS SAID BY ITS FIX; one with nothing left twice, or a record too old to fold, is no failure', async () => {
  const fix = 'Folding what is here twice changes many things at once, and only a person decides that, signed in. Open the list in the app.';
  const refusedHere = foldIn({ tools: [2, 5] }, () => no('NEEDS_BROWSER_SESSION', fix));
  const one = io();
  assert.equal(await tidyCommand(['--ask'], one, refusedHere.make), 1);
  assert.deepEqual(one.said, [fix]);

  const gone = foldIn({ tools: [2, 5] }, () => no('ALREADY_KNOWN', 'Nothing in Tools is here twice, so nothing was asked.'));
  const two = io();
  assert.equal(await tidyCommand(['--ask'], two, gone.make), 0);
  assert.deepEqual(two.said, []);

  const older = foldIn({ tools: [2, 5] }, () => no('NOT_IN_THIS_BUILD', 'This BrainDog cannot fold what is here twice in Tools yet.'));
  const three = io();
  assert.equal(await tidyCommand(['--ask'], three, older.make), 0);
  assert.ok(three.lines.includes('This BrainDog cannot put these on Decide yet. It will once it is updated.'));
});
