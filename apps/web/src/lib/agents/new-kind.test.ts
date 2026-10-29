/**
 * The "New kind" form's pure half: the declaration it builds, the kernel's sentence it shows, and the one call it makes.
 *
 * Names are invented and written inline (a test in apps/web may not import `fixtures/names.ts`).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { jobBody } from '@braindog/kernel';

import { kindsIn } from '../record/jobs.ts';
import {
  FILE_TOOLS,
  PERMISSIONS,
  RECORD_TOOLS,
  TURNS_MOST,
  blankKind,
  fileKind,
  kindBody,
  kindFault,
  kindFaultAt,
  kindId,
  kindProposal,
  PRESETS,
  presetOf,
  slotParts,
  slotsOf,
  withPreset,
  words,
  type KindDraft,
} from './new-kind.ts';

/** A plain draft: a prompt with one slot, a repository, two tools and a command. */
function draft(over: Partial<KindDraft> = {}): KindDraft {
  const prompt = 'Read the notes in %repo_name% and propose one tidy change.';
  return { ...blankKind(), title: 'Tidy the lantern notes', prompt, args: slotsOf(prompt), repo: 'lantern-notes', tools: ['Read', `${'mcp__braindog__'}propose`], commands: 'git log', ...over };
}

const checked = (d: KindDraft) => jobBody({ id: `job.${kindId(d.title)}`, body: kindBody(d) as unknown as Record<string, unknown> });

test('slotsOf derives an argument from each %slot% and keeps a label already typed', () => {
  assert.deepEqual(slotsOf('Open %repo_name% today'), [{ id: 'repo_name', label: 'Repo name', max: 64 }]);
  const kept = slotsOf('Open %repo_name% for %ticket%', [{ id: 'repo_name', label: 'Which folder', max: 20 }]);
  assert.deepEqual(kept, [
    { id: 'repo_name', label: 'Which folder', max: 20 },
    { id: 'ticket', label: 'Ticket', max: 64 },
  ]);
  assert.deepEqual(slotsOf('No slots any more', kept), []);
});

test('kindId is the kernel grammar, from a title', () => {
  assert.equal(kindId('Tidy the lantern notes'), 'tidy-the-lantern-notes');
  assert.equal(kindId('  42 Café runs!  '), 'cafe-runs');
  assert.equal(kindId('!!!'), '');
  assert.match(kindId('A'.repeat(80)), /^[a-z][a-z0-9_-]{0,31}$/u);
});

test("a plain draft's body passes the kernel's check, its command a named Bash tool", () => {
  assert.equal(checked(draft()), null);
  assert.equal(kindFault(draft()), null);
  assert.deepEqual(kindBody(draft()).tools, ['Read', 'mcp__braindog__propose', 'Bash(git log)']);
  assert.equal(kindBody(draft()).writes, undefined);
});

test('only the two permissions are offered, and a skipped one is refused in the kernel sentence', () => {
  assert.deepEqual([...PERMISSIONS], ['dontAsk', 'acceptEdits']);
  const skipped = draft({ permission: 'bypassPermissions' as never });
  const kernel = checked(skipped);
  assert.ok(kernel);
  assert.equal(kernel.at, 'permission');
  assert.equal(kindFault(skipped), kernel.fix.split('job.tidy-the-lantern-notes').join(words.thisKind));
  assert.match(kindFault(skipped) ?? '', /^This kind would skip the run's permissions/u);
});

test("a refusal is drawn under the form's own field: no tools under the commands, a slot's label under the prompt", () => {
  const none = draft({ tools: [], commands: '' });
  assert.equal(checked(none)?.at, 'tools');
  assert.equal(kindFaultAt(none)?.at, 'commands');
  const long = draft({ args: [{ id: 'repo_name', label: 'x'.repeat(41), max: 64 }] });
  assert.equal(checked(long)?.at, 'args[0].label');
  assert.equal(kindFaultAt(long)?.at, 'prompt');
  assert.equal(kindFaultAt(draft({ permission: 'bypassPermissions' as never }))?.at, 'permission');
});

test('accept edits sets writes, which the kernel requires', () => {
  const edits = draft({ permission: 'acceptEdits', writes: false });
  assert.equal(kindBody(edits).writes, true);
  assert.equal(kindFault(edits), null);
});

test(`turns past ${TURNS_MOST} are refused`, () => {
  assert.equal(TURNS_MOST, 40);
  assert.equal(kindFault(draft({ turns: 40 })), null);
  assert.match(kindFault(draft({ turns: 41 })) ?? '', /turns/u);
});

test('each file tool is taken and Write is refused', () => {
  for (const tool of FILE_TOOLS) assert.equal(kindFault(draft({ tools: [tool] })), null, tool);
  assert.match(kindFault(draft({ tools: ['Write'] })) ?? '', /Write/u);
});

test("the record tools offered are mcp's own reading tools and propose", () => {
  const source = readFileSync(new URL('../../../../../packages/mcp/src/index.ts', import.meta.url), 'utf8');
  const list = source.slice(source.indexOf('export const TOOLS'), source.indexOf('\n];', source.indexOf('export const TOOLS')));
  const tools = [...list.matchAll(/^ {4}name: '([a-z_]+)',[\s\S]*?^ {4}writes: (true|false),/gmu)].map((m) => ({ name: m[1], writes: m[2] === 'true' }));
  assert.ok(tools.length > 10);
  const offered = tools.filter((t) => !t.writes || t.name === 'propose').map((t) => `mcp__braindog__${t.name}`);
  assert.deepEqual([...RECORD_TOOLS].sort(), offered.sort());
  for (const tool of RECORD_TOOLS) assert.equal(kindFault(draft({ tools: [tool] })), null, tool);
});

test('an accepted change of the proposal reads back as one kind "Run a job" offers', () => {
  const d = draft({ permission: 'acceptEdits' });
  const kinds = kindsIn([{ body_kind: 'change', resolved_as: 'addressed', body: kindProposal(d).body }]);
  assert.equal(kinds.length, 1);
  assert.deepEqual(kinds[0], {
    id: 'job.tidy-the-lantern-notes',
    title: 'Tidy the lantern notes',
    repo: 'lantern-notes',
    args: [{ id: 'repo_name', label: 'Repo name', max: 64 }],
    writes: true,
  });
  assert.equal(kindProposal(d).body.from_version, 0);
  assert.equal(kindProposal(d).body_kind, 'change');
});

/** A fetch that answers every call with `value`, and keeps the URL and body of each. */
function fakeFetch(value: unknown) {
  const calls: { url: string; body: string }[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : '' });
    return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { io, calls };
}

test('fileKind posts propose once, never decides, and answers the question it opened', async () => {
  const { io, calls } = fakeFetch({ id: 'q_lantern_one' });
  const out = await fileKind('https://record.example', draft(), io);
  assert.deepEqual(out, { kind: 'filed', question: 'q_lantern_one' });
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.url ?? '', /propose/u);
  assert.ok(!calls.some((c) => /decide/u.test(c.url)));
  const sent = JSON.parse(calls[0]?.body ?? '{}') as { body_kind?: string; body?: { declaration_id?: string } };
  assert.equal(sent.body_kind, 'change');
  assert.equal(sent.body?.declaration_id, 'job.tidy-the-lantern-notes');
});

test('a prompt holding a key-shaped string sends nothing', async () => {
  const { io, calls } = fakeFetch({ id: 'q_never' });
  const key = 'gh' + 'p_' + 'Q7'.repeat(18);
  const out = await fileKind('https://record.example', draft({ prompt: `Use ${key} to read %repo_name%` }), io);
  assert.equal(out.kind, 'refused');
  assert.match(out.kind === 'refused' ? out.fix : '', /looks like a key/u);
  assert.equal(calls.length, 0);
});

test('EACH OF THE THREE WAYS TO START IS A KIND THE RECORD TAKES, and a choice changed by hand is none of them', () => {
  assert.equal(PRESETS.length, 3);
  for (const p of PRESETS) {
    const d = withPreset({ ...blankKind(), title: 'Read the lantern notes', prompt: 'Read the notes and say what changed.' }, p);
    assert.equal(kindFaultAt(d), null, `${p.label}: ${kindFaultAt(d)?.fix}`);
    assert.equal(presetOf(d), p.id);
  }
  const looked = withPreset(blankKind(), PRESETS[0]!);
  assert.equal(presetOf({ ...looked, permission: 'acceptEdits' }), null);
  assert.equal(words.send, 'Save job');
});

test('a slot shown as it is typed is set apart from the words round it, so it reads as code and not a lost template', () => {
  assert.deepEqual(slotParts(words.promptHelp), [
    { text: 'Write ', slot: false },
    { text: '{client}', slot: true },
    { text: ' where a name changes each run.', slot: false },
  ]);
  assert.deepEqual(slotParts('No slot here.'), [{ text: 'No slot here.', slot: false }]);
});
