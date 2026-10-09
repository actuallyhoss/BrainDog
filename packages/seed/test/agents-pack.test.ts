/**
 * The agents pack: it installs through the pack path, each register refuses what the plan says it
 * refuses, a project's skill hides the global one of the same name, no key row holds a value, and a
 * run in a demo project's folder is placed in that project.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Pack } from '@braindog/declare';
import { KEYS_IN_TEXT, openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { DOOR_FIGURE_SIGNS } from '../../kernel/src/built-in-figures.ts';
import { markDoor } from '../../kernel/src/door.ts';

import { AGENTS_PACK, AGENTS_PAGES, AGENTS_REGISTERS, NOW, ROWS, RUNS, agentsPackDocument, declarations, installAgentsPack, installSeed } from '../src/index.ts';
import * as AGENTS_MODULE from '../src/packs/agents.ts';
import { MODULE_CHANGES } from '../src/changelog.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const codeOf = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string } };
  return x.ok ? 'accepted' : (x.refusal?.code ?? 'conflict');
};

async function empty(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

async function seeded(): Promise<{ k: Kernel; sql: NodeSql }> {
  const out = await empty();
  value(await installSeed(out.k));
  return out;
}

/** A row with one field left out, which is what missing means: a field sent as undefined is malformed. */
const without = (fields: Record<string, unknown>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).filter(([k]) => k !== key));

const names = (rows: { fields: Record<string, unknown> }[], field = 'name') => rows.map((r) => String(r.fields[field])).sort();

/* ── it installs ─────────────────────────────────────────────────────────── */

test('THE PACK IS A LEGAL PACK, with the manifest the plan gives it', async () => {
  assert.deepEqual(AGENTS_PACK.manifest, { id: 'agents', version: '1.10.0', requires: ['register.things'] });
  const pack = value<Pack>(await normalise(agentsPackDocument()));
  assert.equal(pack.manifest.pack, 'agents');
  assert.equal(pack.manifest.version, '1.10.0');
  assert.deepEqual([...pack.manifest.provides].sort(), PROVIDES);
});

/* THE VERSION SHIPPED IS THE VERSION SAID (agents-pack-49): the changelog's newest agents entry is the manifest's, so
   the add-on's page never draws 1.10.0 with no notes, and its notes name the plain-text keys line and no word a person
   should not read. */
test('THE NEWEST CHANGE NOTE IS 1.10.0, and it says what Needs a look holds', () => {
  const newest = MODULE_CHANGES.agents[0]!;
  assert.equal(newest.version, AGENTS_PACK.manifest.version);
  assert.match(newest.notes, /Needs a look/);
  assert.match(newest.notes, /written in plain text/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)/.test(newest.notes), 'the note says "row", an em dash or "(s)"');
});

const PROVIDES = [
  'metric.agent-card-words',
  'metric.agent-door-builds-behind',
  'metric.agent-door-called',
  'metric.agent-door-internal',
  'metric.agent-hook-slowest',
  'metric.keys-by-week',
  'metric.keys-expired',
  'metric.keys-nowhere',
  'metric.keys-sealed',
  'metric.learnings-active',
  'metric.learnings-by-week',
  'metric.learnings-faded',
  'metric.runs-earlier',
  'metric.runs-heard-today',
  'metric.runs-left-next',
  'metric.runs-today',
  'metric.runs-unplaced',
  'metric.skill-learnings',
  'metric.skills-active',
  'metric.tools-by-week',
  'metric.tools-unseen',
  'page.agents',
  'page.run',
  'page.skill',
  'register.credentials',
  'register.learnings',
  'register.skills',
  'register.tools',
];

test('THE SEED INSTALLS IT THROUGH THE PACK PATH, and the record says so', async () => {
  const { k, sql } = await seeded();
  /* It asks for a list (`register.things`), not a pack, so the `pack` row's `requires` names no pack. */
  assert.deepEqual({ ...k.packs().find((p) => p.id === 'agents') }, { id: 'agents', version: '1.10.0', requires: {} });
  assert.deepEqual([...k.packClaims('agents')].sort(), PROVIDES);
  for (const id of Object.keys(AGENTS_REGISTERS)) assert.equal(k.count(id), ROWS[id]?.length, `${id} lost rows`);
  assert.equal(k.get('LN7')?.fields.supersedes, k.get('LN6')?.id, 'a learning names the one it replaces by its row');
  sql.close();
});

test('it refuses a record with no projects register, and installs nothing', async () => {
  const { k, sql } = await empty();
  assert.equal(codeOf(await installAgentsPack(k)), 'DEPENDENCY_UNRESOLVED');
  assert.equal(k.register('learnings'), undefined);
  assert.deepEqual(k.packs(), []);
  sql.close();
});

test('IT NEEDS NO PEOPLE: a record with projects and nothing else takes it, and its rows', async () => {
  // Every module can be switched off, People included, and nothing in this pack points at a person.
  const { k, sql } = await empty();
  value(await k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(k));
  assert.equal(k.register('people'), undefined);
  value(k.create('things', { name: 'Kiln', lane: 'earning', folders: ['/Users/studio/Code/kiln-type'] }, { actor: 'p_seed' }));
  value(k.create('learnings', { lesson: 'A lesson with no person in it.', because: 'Written on a record whose People module is switched off.', kind: 'fact', project: 'things#1' }, { actor: 'p_seed' }));
  value(k.create('credentials', { label: 'A key', opens: 'Something on Kiln', kind: 'note', project: 'things#1' }, { actor: 'p_seed' }));
  assert.equal(k.resolveProject({ cwd: '/Users/studio/Code/kiln-type' }).project?.spoken, 'things#1');
  sql.close();
});

/* ── each register refuses what the plan says it refuses ─────────────────── */

const AS = { actor: 'p_seed' };

test('learnings: a lesson needs the failure behind it, and a move out of the past is proposed', async () => {
  const { k, sql } = await seeded();
  const ok = { lesson: 'A lesson long enough.', because: 'A failure described in enough words to check.', kind: 'fact' };
  assert.equal(codeOf(k.create('learnings', without(ok, 'because'), AS)), 'REQUIRED_MISSING');
  assert.equal(codeOf(k.create('learnings', { ...ok, because: 'Too short.' }, AS)), 'OUT_OF_BOUNDS');
  assert.equal(codeOf(k.create('learnings', { ...ok, lesson: 'Short.' }, AS)), 'OUT_OF_BOUNDS');
  assert.equal(codeOf(k.create('learnings', { ...ok, kind: 'rumour' }, AS)), 'ENUM_VALUE_UNKNOWN');
  // Superseding needs a reason, and bringing a superseded learning back is the owner's.
  assert.equal(codeOf(k.update('learnings', 'LN1', { state: 'superseded' }, AS)), 'REQUIRED_MISSING');
  assert.equal(codeOf(k.update('learnings', 'LN6', { state: 'active' }, AS)), 'FORBIDDEN');
  sql.close();
});

test('skills: the text and its version change only by an accepted proposal', async () => {
  const { k, sql } = await seeded();
  const ok = { name: 'draft-release', trigger: 'Before tagging a release.', body: '# Draft a release' };
  assert.equal(codeOf(k.create('skills', without(ok, 'body'), AS)), 'REQUIRED_MISSING');
  assert.equal(codeOf(k.create('skills', { ...ok, name: 'n'.repeat(65) }, AS)), 'OUT_OF_BOUNDS');
  assert.equal(codeOf(k.update('skills', 'skills#1', { body: '# Something else' }, AS)), 'FORBIDDEN');
  assert.equal(codeOf(k.update('skills', 'skills#1', { rev: 4 }, AS)), 'FORBIDDEN');
  // What is not guarded still moves.
  value(k.update('skills', 'skills#1', { trigger: 'Before merging any branch.' }, AS));
  sql.close();
});

test('keys: the sealed value is the vault’s, and a key typed into a field is refused', async () => {
  const { k, sql } = await seeded();
  const ok = { label: 'Kestrel ingest', opens: 'Error reports from kiln.example', kind: 'api_token', project: 'things#1' };
  assert.equal(codeOf(k.create('credentials', { ...ok, value: 'g_01J0000000000000000000000' }, AS)), 'IMMUTABLE_FIELD');
  assert.equal(codeOf(k.create('credentials', without(ok, 'kind'), AS)), 'REQUIRED_MISSING');
  // Built at run time, so no line of this file holds a key-shaped string whole.
  const shaped = ['sk', '_live_', 'FAKE0NOT0A0REAL0KEY0FOR0TESTS'].join('');
  assert.equal(codeOf(k.create('credentials', { ...ok, where: shaped }, AS)), 'VALUE_MALFORMED');
  assert.equal(codeOf(k.create('credentials', { ...ok, opens: `Deploys, with ${shaped}` }, AS)), 'VALUE_MALFORMED');
  sql.close();
});

test('tools: an MCP server says how it starts, and each transport what it needs', async () => {
  const { k, sql } = await seeded();
  const refusal = (fields: Record<string, unknown>) => {
    const out = k.create('tools', { name: 'probe', ...fields }, AS) as { ok: boolean; refusal?: { code: string; at?: string } };
    return out.ok ? 'accepted' : `${out.refusal?.code} at ${out.refusal?.at}`;
  };
  assert.equal(refusal({ kind: 'mcp' }), 'REQUIRED_MISSING at transport');
  assert.equal(refusal({ kind: 'mcp', transport: 'stdio' }), 'REQUIRED_MISSING at command');
  assert.equal(refusal({ kind: 'mcp', transport: 'http' }), 'REQUIRED_MISSING at endpoint');
  assert.equal(refusal({ kind: 'plugin' }), 'ENUM_VALUE_UNKNOWN at kind');
  // A command line has no transport, and is not asked for one.
  assert.equal(refusal({ kind: 'cli', command: 'probe' }), 'accepted');
  sql.close();
});

/* ── nearer wins ─────────────────────────────────────────────────────────── */

test('A PROJECT’S SKILL HIDES THE GLOBAL ONE OF THE SAME NAME, and only in that project', async () => {
  const { k, sql } = await seeded();

  const kiln = value<{ rows: { fields: Record<string, unknown> }[]; inherited: { fields: Record<string, unknown> }[] }>(k.inScope('skills', 'things#1'));
  assert.deepEqual(names(kiln.rows), ['review-pr']);
  assert.equal(kiln.rows[0]?.fields.rev, 2, 'Kiln should see its own review, version 2');
  assert.ok(!names(kiln.inherited).includes('review-pr'), 'the global review showed through on Kiln');
  assert.ok(names(kiln.inherited).includes('log-handoff'), 'Kiln lost the global skills it does not replace');

  // Portage has no review of its own, so it inherits the global one.
  const portage = value<{ rows: { fields: Record<string, unknown> }[]; inherited: { fields: Record<string, unknown> }[] }>(k.inScope('skills', 'things#3'));
  assert.deepEqual(names(portage.rows), ['reconcile-invoice']);
  assert.ok(names(portage.inherited).includes('review-pr'));

  // Tools follow the same rule, and keys add up rather than hide.
  const tools = value<{ inherited: { fields: Record<string, unknown> }[] }>(k.inScope('tools', 'things#1'));
  assert.ok(!names(tools.inherited).includes('fenwick'));
  const keys = value<{ rows: { fields: Record<string, unknown> }[]; inherited: { fields: Record<string, unknown> }[] }>(k.inScope('credentials', 'things#1'));
  assert.equal(keys.rows.length, 2);
  assert.equal(keys.inherited.length, ROWS.credentials!.filter((r) => r.project === null).length);
  sql.close();
});

test('every agents register has rows at a project and rows everywhere', () => {
  for (const id of Object.keys(AGENTS_REGISTERS)) {
    const rows = ROWS[id] ?? [];
    assert.ok(rows.some((r) => typeof r.project === 'number'), `${id} has no project rows`);
    assert.ok(rows.some((r) => r.project === null), `${id} has no global rows`);
  }
});

/* ── keys ────────────────────────────────────────────────────────────────── */

test('NO KEY ROW HOLDS A VALUE, in the seed or in the record', async () => {
  for (const row of ROWS.credentials ?? []) assert.equal('value' in row, false, `${String(row.label)} names a sealed value`);
  const { k, sql } = await seeded();
  const out = value<{ rows: { fields: Record<string, unknown> }[] }>(k.list({ register: 'credentials', limit: 100 }));
  assert.equal(out.rows.length, ROWS.credentials?.length);
  for (const row of out.rows) assert.equal(row.fields.value, undefined, `${String(row.fields.label)} holds a value`);
  assert.equal(sql.all('SELECT 1 FROM grant').length, 0, 'the seed sealed something');
  sql.close();
});

/* ── the pages ───────────────────────────────────────────────────────────── */

type Drawn = { heading?: string; kind: string; rows: { fields: Record<string, unknown> }[]; matched: number; refusals: unknown[]; scopes?: (string | null)[]; inherited?: number; history?: { text: string }[]; body?: string };

const opened = (k: Kernel, slug: string): Drawn[] => value<{ blocks: Drawn[] }>(k.page(slug)).blocks;
const headed = (blocks: Drawn[], heading: string): Drawn => {
  const found = blocks.find((b) => b.heading === heading);
  assert.ok(found, `no block headed ${heading}`);
  return found;
};

test('/p/agents: the runs grouped, what a run asked first, then working, today and earlier, and what they added', async () => {
  const { k, sql } = await seeded();
  /* A RUN THAT STOPPED YESTERDAY WITH A NEXT STEP, and one still marked active that nobody closed, both Earlier; and a
     question a run asked beside one a rule put, so Needs you is the run's alone. */
  const yesterday = new Date(NOW - 26 * 3_600_000).toISOString();
  value(k.create('session', { doing: 'Stopped yesterday', agent: 'codex', state: 'idle', next: 'Pick the review up again.' } as never, { actor: 'p_seed', stamp: { last_seen: yesterday } }));
  value(k.create('session', { doing: 'Left open since yesterday', agent: 'claude', state: 'active' } as never, { actor: 'p_seed', stamp: { last_seen: yesterday } }));
  const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };
  value(k.propose({ question: 'Retire the old Fenwick key?', body_kind: 'options', body: OPTIONS }, 'S1'));
  value(k.propose({ question: 'Raise the retainer?', body_kind: 'options', body: OPTIONS }, 'agent:codex'));
  value(k.propose({ question: 'A rule asks about a bill', body_kind: 'options', body: OPTIONS }, 'rule:bills'));
  value(k.propose({ question: 'Slash asks about a page', body_kind: 'options', body: OPTIONS }, 'slash'));
  const all = opened(k, 'agents');
  for (const b of all) assert.deepEqual(b.refusals, [], `${b.heading}: ${JSON.stringify(b.refusals)}`);
  /* THE GROUPS OF RUNS, without the day's lanes over them, which are headed Today as the runs that stopped today are. */
  const blocks = all.filter((b) => b.kind !== 'lanes');

  const groups = blocks.filter((b) => ['Needs you', 'Working', 'Today', 'Earlier'].includes(String(b.heading))).map((b) => b.heading);
  assert.deepEqual(groups, ['Needs you', 'Working', 'Today', 'Earlier'], 'the runs are not grouped in the order the direction gives');

  const asked = (headed(blocks, 'Needs you') as Drawn & { queue?: { question?: string }[] }).queue ?? [];
  assert.deepEqual(asked.map((q) => q.question).sort(), ['Raise the retainer?', 'Retire the old Fenwick key?'], 'Needs you holds a question no run asked');

  const seen = (a: (typeof RUNS)[number], z: (typeof RUNS)[number]) => String(z.last_seen).localeCompare(String(a.last_seen));
  const today = (r: (typeof RUNS)[number]) => String(r.last_seen).slice(0, 10) === new Date(NOW).toISOString().slice(0, 10);
  const working = RUNS.filter((r) => r.state === 'active' && today(r)).sort(seen);
  assert.deepEqual(headed(blocks, 'Working').rows.map((r) => r.fields.doing), working.map((r) => r.doing), 'a stopped run is listed as working, or the order is not by last seen');
  const stopped = RUNS.filter((r) => (r.state === 'idle' || r.state === 'handoff') && today(r)).sort(seen);
  assert.ok(stopped.length > 0, 'the seed has no run that stopped today');
  assert.deepEqual(headed(blocks, 'Today').rows.map((r) => r.fields.doing), stopped.map((r) => r.doing), 'a run that stopped today is missing, or a working one is listed');
  assert.deepEqual([...headed(blocks, 'Earlier').rows.map((r) => String(r.fields.doing))].sort(), ['Left open since yesterday', 'Stopped yesterday'], 'a run last heard from yesterday is not under Earlier');
  /* EVERY LIVE RUN UNDER EXACTLY ONE HEADING. */
  const drawn = ['Working', 'Today', 'Earlier'].flatMap((h) => headed(blocks, h).rows.map((r) => String(r.fields.doing)));
  assert.equal(new Set(drawn).size, drawn.length, `a run is under two headings: ${drawn.join(', ')}`);
  /* THE NEXT STEP A STOPPED RUN LEFT IS ON ITS CARD. */
  assert.ok(headed(blocks, 'Today').rows.some((r) => typeof r.fields.next === 'string' && r.fields.next !== ''), 'Today drops the next step a run left');
  assert.ok(blocks.some((b) => b.kind === 'agents'), 'the page lost what the brain learned');

  /* THE RUNS AND NOTHING ELSE: what the brain holds is four lists with pages of their own, and Where they left off is
     Today and Earlier. */
  const headings = blocks.map((b) => b.heading);
  for (const gone of ['Waiting on you', 'Working now', 'Where they left off', 'What the brain holds', 'Growth', 'Learnings', 'Skills'])
    assert.ok(!headings.includes(gone), `${gone} is still on the agents page`);
  /* AND NO PART SAYS IT IS EMPTY: the line is the one place the page says what is quiet. */
  const said = (AGENTS_PAGES.agents!.blocks as { lead?: boolean; empty?: string; heading?: string }[]).filter((b) => !b.lead && b.empty !== undefined);
  assert.deepEqual(said.map((b) => b.heading), [], 'a block on the agents page draws its own empty line');
  /* THE WORD ON SCREEN IS RUN, never session. */
  for (const b of AGENTS_PAGES.agents!.blocks as { heading?: string; body?: string }[]) assert.doesNotMatch(`${b.heading ?? ''} ${b.body ?? ''}`, /session/iu);
  sql.close();
});

/**
 * THE DAY AS LANES, SINCE 1.8.0: the last 24 hours, one lane for each run from when it started to when it was last heard
 * from, the working ones toned, under the page's line and over the groups. Read off a seeded record's page answer, so
 * the block is declared against the field the kernel really keeps (`started`, its migration 26).
 */
test("TODAY'S LANES ARE THE RUNS OF THE LAST 24 HOURS, each from its start to when it was last heard from", async () => {
  const { k, sql } = await seeded();
  type Lanes = Drawn & { lanes?: { title: string; start: string; end: string | null; tone?: string; href?: string }[]; window?: { from: string; to: string } };
  const declared = AGENTS_PAGES.agents!.blocks as { kind: string; lead?: boolean; heading?: string; limit?: number }[];
  assert.deepEqual(declared.map((b) => (b.lead ? 'line' : b.kind)).slice(0, 3), ['line', 'line', 'lanes'], 'the lanes are not the first tile under the line');
  assert.equal(declared.find((b) => b.kind === 'lanes')?.limit, undefined, 'lanes refuse a limit');

  const block = opened(k, 'agents').find((b) => b.kind === 'lanes') as Lanes | undefined;
  assert.ok(block, 'the agents page draws no lanes on a record with runs heard from today');
  assert.equal(block.heading, 'Today');
  assert.deepEqual(block.refusals, [], JSON.stringify(block.refusals));
  /* EVERY RUN THAT OVERLAPS THE DAY, a finished one included, in the order they started; one that ended before is out. */
  const from = NOW - 24 * 3_600_000;
  const inDay = RUNS.filter((r) => Date.parse(String(r.last_seen)) >= from).sort((a, z) => String(a.started).localeCompare(String(z.started)));
  assert.ok(inDay.length >= 3 && inDay.length < RUNS.length, 'the seed needs runs inside the day and outside it');
  assert.deepEqual(
    block.lanes?.map((l) => ({ title: l.title, start: l.start, end: l.end, tone: l.tone })),
    inDay.map((r) => ({ title: r.doing, start: r.started, end: r.last_seen, tone: r.state === 'active' ? 'info' : undefined })),
  );
  for (const l of block.lanes ?? []) {
    assert.ok(Date.parse(l.start) < Date.parse(String(l.end)), `${l.title} ends before it starts`);
    assert.match(String(l.href), /^\/r\/session\/\d+$/u, `${l.title} opens no run`);
  }
  assert.equal(Date.parse(block.window!.to) - Date.parse(block.window!.from), 24 * 3_600_000);
  /* AND THE FIGURE IT IS DRAWN ON COUNTS THE RUNS HEARD FROM TODAY, so a day nobody worked draws no empty track. */
  const today = new Date(NOW).toISOString().slice(0, 10);
  const read = k.metric(k.metricDecl('runs-heard-today')!);
  assert.ok(read.ok, JSON.stringify(read));
  assert.equal(read.value.value, RUNS.filter((r) => String(r.last_seen).slice(0, 10) === today).length);
  assert.deepEqual((AGENTS_PAGES.agents!.blocks as { kind: string; when?: unknown }[]).find((b) => b.kind === 'lanes')?.when, { metric: 'runs-heard-today', gt: 0 });
  sql.close();
});

/** AND ON A DAY NO RUN WAS HEARD FROM THE TILE IS LEFT OUT, the same record read three days on: no empty track. */
test("TODAY'S LANES ARE NOT DRAWN ON A DAY NO RUN WAS HEARD FROM", async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await installSeed(k));
  const lanes = (): Drawn & { drawn?: boolean } => opened(k, 'agents').find((b) => b.kind === 'lanes')!;
  assert.notEqual(lanes().drawn, false, 'the sample has runs heard from today');
  clock.advance(3 * 24 * 3_600_000);
  assert.equal(lanes().drawn, false, 'a quiet day draws the lanes');
  assert.deepEqual(lanes().refusals, []);
  sql.close();
});

/**
 * WORKING IS THE KERNEL'S, SINCE 1.9.0: active and heard from inside fifteen minutes (`sessions.working`), counted by the
 * built-in `runs-working`. The pack's own clause said today, so the owner's record read four agents working while two of
 * the four were last heard from hours before. A run quiet for twenty minutes is not working, nor one left since
 * yesterday, and the line counts the runs the cards draw.
 */
test('WORKING NOW IS THE RUNS HEARD FROM IN THE LAST FIFTEEN MINUTES, and the line counts the same runs', async () => {
  const { k, sql } = await seeded();
  /* PLANTED AS THE SEED PLANTS A RUN, with the field only the record writes stamped (`openRun` in `src/index.ts`). */
  const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
  value(k.create('session', { doing: 'Quiet for twenty minutes', agent: 'codex', state: 'active' } as never, { actor: 'p_seed', stamp: { last_seen: ago(20) } }));
  value(k.create('session', { doing: 'Left open since yesterday', agent: 'claude', state: 'active' } as never, { actor: 'p_seed', stamp: { last_seen: ago(26 * 60) } }));

  const doing = headed(opened(k, 'agents'), 'Working').rows.map((r) => String(r.fields.doing));
  for (const quiet of ['Quiet for twenty minutes', 'Left open since yesterday']) assert.ok(!doing.includes(quiet), `${quiet} is working now: ${doing.join(', ')}`);
  /* THE SEED'S TWO ACTIVE RUNS WERE HEARD FROM THREE AND TWELVE MINUTES AGO. */
  assert.deepEqual([...doing].sort(), RUNS.filter((r) => r.state === 'active').map((r) => String(r.doing)).sort(), 'a run heard from inside fifteen minutes is not working now');
  const read = k.metric(k.metricDecl('runs-working')!);
  assert.ok(read.ok, JSON.stringify(read));
  assert.equal(read.value.value, doing.length, 'the line counts a run the cards do not draw');
  sql.close();
});

test('THE ADD-ON HOLDS NO CLOCK OF ITS OWN: the cards read `sessions.working` and the line `runs-working`', () => {
  assert.deepEqual(Object.keys(AGENTS_MODULE).filter((name) => /WORKING/u.test(name)), [], 'the pack still exports its own clause for working');
  assert.equal(JSON.stringify(agentsPackDocument()).includes('agents-working'), false, 'the pack still declares or reads its own working figure');
  const blocks = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; source?: string; where?: unknown; when?: { metric?: string }; lead?: boolean; body?: string }[];
  const working = blocks.find((b) => b.heading === 'Working');
  assert.equal(working?.source, 'sessions.working');
  assert.equal(working?.where, undefined, 'the working source takes no clause');
  assert.equal(working?.when?.metric, 'runs-working');
  const lines = blocks.filter((b) => b.kind === 'note' && b.lead === true);
  assert.equal(lines.length, 2);
  for (const line of lines) assert.equal(line.when?.metric, 'runs-working', `${line.body} is not held to the record's count`);
  assert.match(lines[0]!.body!, /^\{\{runs-working\}\} agent\(s\) working now/u);
});

test('A SKILL IN USE HAS A PAGE: its trigger, then its versions; a retired one has none', async () => {
  const { k, sql } = await seeded();
  const slugs = k.pages().map((p) => p.slug);
  assert.ok(slugs.includes('reconcile-invoice'), slugs.join(', '));
  assert.ok(!slugs.includes('chase-invoice'), 'the retired skill has a page');

  const [trigger, versions] = opened(k, 'reconcile-invoice');
  const row = ROWS.skills!.find((r) => r.name === 'reconcile-invoice')!;
  assert.equal(trigger?.body, row.trigger);
  assert.equal(versions?.kind, 'diff');
  assert.deepEqual(versions?.refusals, []);
  assert.deepEqual(versions?.history?.map((v) => v.text), [row.body], 'a seeded skill has one version, the text it holds');
  sql.close();
});

test('A RUN HAS A PAGE, named by what it was doing, whose one section asks the host for what it did', async () => {
  const { k, sql } = await seeded();
  value(k.create('session', { doing: 'Tidy the release notes', agent: 'claude', state: 'idle' } as never, { actor: 'p_seed' }));
  const page = k.pages().find((p) => p.title === 'Tidy the release notes');
  assert.ok(page, k.pages().map((p) => p.title).join(', '));
  const [section, ...rest] = opened(k, page.slug);
  assert.equal(section?.kind, 'section');
  assert.equal(section?.heading, 'What it did');
  assert.equal((section as { panel?: unknown }).panel, 'run');
  assert.deepEqual(rest, []);
  /* NO RAIL ENTRY PER RUN: the page carries no `nav`. */
  assert.equal((AGENTS_PAGES.run as { nav?: unknown }).nav, undefined);
  sql.close();
});

test('TWO SKILLS OF ONE NAME ARE TWO PAGES A READER CAN TELL APART: the global one at its name, a project’s at its name and project', async () => {
  const { k, sql } = await seeded();
  const pages = k.pages();
  const slugs = pages.map((p) => p.slug);
  assert.ok(slugs.includes('review-pr') && slugs.includes('review-pr-kiln'), slugs.join(', '));
  assert.ok(!slugs.some((slug) => /^review-pr-[0-9]+$/.test(slug)), slugs.join(', '));
  const global = ROWS.skills!.find((r) => r.name === 'review-pr' && r.project === null)!;
  const kiln = ROWS.skills!.find((r) => r.name === 'review-pr' && r.project !== null)!;
  assert.equal(opened(k, 'review-pr')[0]?.body, global.trigger);
  assert.equal(opened(k, 'review-pr-kiln')[0]?.body, kiln.trigger);
  sql.close();
});

test('A PROJECT PAGE SAYS WHAT IT RUNS ON: its own keys, tools and skills, then the ones from everywhere', async () => {
  const { k, sql } = await seeded();
  const blocks = opened(k, 'kiln');
  /* UNDER MORE ABOUT KILN SINCE work 1.15.0, one tile with its history, notes and money, where it was a folded Runs on. */
  assert.ok(blocks.some((b) => b.kind === 'section' && b.heading === 'More about Kiln'));
  const said = (heading: string, field: string) => {
    const b = headed(blocks, heading);
    assert.deepEqual(b.refusals, [], `${heading}: ${JSON.stringify(b.refusals)}`);
    return b.rows.map((r, i) => `${String(r.fields[field])} @ ${b.scopes?.[i] ?? 'everywhere'}`);
  };
  const skills = said('Skills', 'name');
  assert.ok(skills.includes('review-pr @ Kiln') && !skills.includes('review-pr @ everywhere'), skills.join(', '));
  assert.ok(!skills.some((s) => s.startsWith('chase-invoice')), 'a retired skill is listed');
  /* THREE OF EACH ON THE PAGE SINCE work 1.15.0, a part of More about Kiln, the project's own first: the ones from
     everywhere come after them, read here with room for all of them. */
  const keys = said('Keys', 'name');
  const everywhere = (key: string): boolean => key.endsWith('@ everywhere');
  const first = keys.findIndex(everywhere);
  assert.ok(keys.length > 0 && (first < 0 || keys.slice(first).every(everywhere)), keys.join(', '));
  const all = k.block({ ...(headed(blocks, 'Keys') as unknown as Record<string, unknown>), limit: 20, rows: undefined, matched: undefined, scopes: undefined } as never);
  assert.ok(all.rows.some((r, i) => r.fields.name === 'Nordhaven API' && (all.scopes?.[i] ?? 'everywhere') === 'everywhere'), 'the keys from everywhere are not read after the project’s own');
  assert.ok(said('Tools and servers', 'name').includes('fenwick @ Kiln'));
  sql.close();
});

test('the People page lists the newest person first, with where they were met', async () => {
  const { k, sql } = await seeded();
  /* BY ITS HEADING, since people 2.4.0 opens the page on its one line. */
  const everyone = headed(opened(k, 'people'), 'Everyone');
  assert.deepEqual(everyone.refusals, []);
  assert.equal(everyone.rows[0]?.fields.name, ROWS.people!.at(-1)?.name);
  sql.close();
});

/* ── where a run is ──────────────────────────────────────────────────────── */

test('A RUN WORKING IN A DEMO PROJECT’S FOLDER IS PLACED IN THAT PROJECT', async () => {
  const { k, sql } = await seeded();
  const at = (where: Parameters<Kernel['resolveProject']>[0]) => k.resolveProject(where).project;

  assert.deepEqual(at({ cwd: '/Users/studio/Code/kiln-type/sources/roman' }), { id: k.get('things#1')!.id, spoken: 'things#1', how: 'folder' });
  // Portage's folder is a Windows path, written with backslashes and read in any case.
  const backslash = String.fromCharCode(92);
  assert.equal(at({ cwd: ['d:', 'studio', 'Portage', 'newsletter'].join(backslash) })?.spoken, 'things#3');
  assert.equal(at({ remote: 'git@git.kiln.example:type/kiln-site.git' })?.spoken, 'things#1');
  assert.equal(at({ repo: 'portage' })?.spoken, 'things#3');
  assert.equal(at({ cwd: '/Users/studio/Downloads' }), null, 'a folder no project lists is global');
  sql.close();
});

/* ── what to put right in the keys and tools, and the door's signs (1.10.0) ── */

const reading = (k: Kernel, id: string): number | null => {
  const decl = k.metricDecl(id);
  assert.ok(decl, `${id} is not declared on the record`);
  const r = k.metric(decl);
  assert.ok(r.ok, JSON.stringify(r));
  return r.value.value as number | null;
};

const DAY_MS = 86_400_000;
const isoAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();
const dayOf = (days: number) => isoAgo(-days).slice(0, 10);

/**
 * EACH CLAUSE READ OVER THE SEED'S ROWS, then over rows planted to move it: a key sealed leaves the keys kept nowhere,
 * a key past its day is counted only while live, a tool is unseen by its last sighting or, never seen, by when it was
 * written, and a run in no project counts only inside two weeks.
 */
test('THE KEYS, TOOLS AND RUNS FIGURES COUNT WHAT EACH CLAUSE SAYS, over the seed and over planted rows', async () => {
  const { k, sql } = await seeded();
  const keys = ROWS.credentials ?? [];
  const live = keys.filter((r) => r.state === 'live');
  assert.equal(reading(k, 'keys-sealed'), 0, 'the seed seals nothing');
  const nowhere = live.filter((r) => r.where === undefined).length;
  assert.ok(nowhere > 0, 'the seed has no live key kept nowhere');
  assert.equal(reading(k, 'keys-nowhere'), nowhere);
  assert.equal(reading(k, 'keys-expired'), live.filter((r) => typeof r.expires === 'string' && r.expires < dayOf(0)).length);
  const unseen = (ROWS.tools ?? []).filter((r) => r.state === 'active' && Date.parse(String(r.seen)) < NOW - 30 * DAY_MS).length;
  assert.equal(reading(k, 'tools-unseen'), unseen);
  assert.equal(reading(k, 'runs-unplaced'), RUNS.filter((r) => Date.parse(String(r.last_seen)) > NOW - 14 * DAY_MS && !r.project).length);

  /* SEALED, AS THE VAULT DOOR LEAVES A ROW: its `value` names a grant. A live key sealed is no longer kept nowhere; a
     stale one sealed is still sealed, as the Vault's "sealed here" counts every key but the retired; a retired one is
     not. */
  const rowOf = (label: string) => value<{ rows: { id: string }[] }>(k.list({ register: 'credentials', where: `label is "${label}"`, limit: 1 })).rows[0]!.id;
  const seal = (id: string) => sql.exec("UPDATE entry SET fields = json_set(fields, '$.value', 'g_test') WHERE id = ?", id);
  seal(rowOf('Ledger Post sending key'));
  seal(rowOf('Fenwick deploy key'));
  assert.equal(reading(k, 'keys-sealed'), 2, 'a stale or live key sealed was not counted');
  const retired = value<{ id: string }>(k.create('credentials', { label: 'Retired sealed', opens: 'Nothing', kind: 'api_token', state: 'retired' }, AS));
  seal(retired.id);
  assert.equal(reading(k, 'keys-sealed'), 2, 'a retired key sealed was counted, which the Vault does not');
  assert.equal(reading(k, 'keys-nowhere'), nowhere - 1, 'a sealed key is still counted as kept nowhere');

  /* PAST ITS DAY: live and expired counts; retired and expired does not. */
  value(k.create('credentials', { label: 'Old token', opens: 'Nothing now', kind: 'api_token', where: 'The studio safe', expires: dayOf(-3) }, AS));
  value(k.create('credentials', { label: 'Retired token', opens: 'Nothing', kind: 'api_token', where: 'The studio safe', expires: dayOf(-3), state: 'retired' }, AS));
  assert.equal(reading(k, 'keys-expired'), 1);

  /* UNSEEN: seen forty days ago; never seen and written forty days ago; never seen and written today, which is not. */
  value(k.create('tools', { name: 'old-cli', kind: 'cli', command: 'old', seen: isoAgo(40) }, AS));
  const never = value<{ id: string }>(k.create('tools', { name: 'never-cli', kind: 'cli', command: 'never' }, AS));
  value(k.create('tools', { name: 'new-cli', kind: 'cli', command: 'new' }, AS));
  sql.exec('UPDATE entry SET created_at = ? WHERE id = ?', isoAgo(40), never.id);
  assert.equal(reading(k, 'tools-unseen'), unseen + 2);

  /* A RUN IN NO PROJECT: two days ago counts, twenty days ago does not. */
  value(k.create('session', { doing: 'Outside every project', agent: 'claude', state: 'idle' } as never, { actor: 'p_seed', stamp: { last_seen: isoAgo(2) } }));
  value(k.create('session', { doing: 'Long ago, outside', agent: 'claude', state: 'idle' } as never, { actor: 'p_seed', stamp: { last_seen: isoAgo(20) } }));
  assert.equal(reading(k, 'runs-unplaced'), 1);
  sql.close();
});

const NOTES = ['keys-nowhere', 'keys-expired', 'tools-unseen', 'keys-in-text'] as const;

type Note = Drawn & { drawn?: boolean; when?: { metric?: string }; values?: Record<string, unknown> };
const noteOn = (blocks: Drawn[], metric: string): Note | undefined => (blocks as Note[]).find((b) => b.kind === 'note' && b.when?.metric === metric);

/**
 * NEEDS A LOOK, SINCE 1.10.0: one boxed tile under the runs, its four lines each drawn only while its figure is above
 * nought, closed by the folded section over what the brain learned, so the page still shows six tiles before its fold.
 */
test('NEEDS A LOOK HOLDS THE KEYS AND TOOLS TO PUT RIGHT, each line drawn only while its figure is above nought', async () => {
  const declared = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; box?: boolean; fold?: boolean; tone?: string; when?: { metric?: string }; body?: string }[];
  const box = declared.findIndex((b) => b.kind === 'section' && b.heading === 'Needs a look');
  assert.ok(box > 0 && declared[box]!.box === true, 'Needs a look is not a boxed section');
  assert.ok(box > declared.findIndex((b) => b.heading === 'Earlier'), 'Needs a look is above the runs');
  assert.deepEqual(declared.slice(box + 1, box + 1 + NOTES.length).map((b) => b.when?.metric), [...NOTES], 'the lines are not in the box, or not in order');
  const closer = declared[box + 1 + NOTES.length]!;
  assert.deepEqual([closer.kind, closer.heading, closer.fold], ['section', 'What the brain learned', true], 'nothing closes the box, so it swallows what follows');
  for (const metric of NOTES) {
    const note = declared.find((b) => b.kind === 'note' && b.when?.metric === metric)!;
    assert.deepEqual(note.when, { metric, gt: 0 });
    assert.equal(note.tone, 'warn', `${metric}'s line is not toned`);
    assert.ok(note.body?.includes(`{{${metric}}}`), `${metric}'s line does not say its number`);
    assert.doesNotMatch(String(note.body), /—|credential|session|\brow\b/iu, `${metric}'s line reads as the machine`);
    /* RIGHT FOR ONE (agents-pack-49): its figure's name, the number, then what to do, so "1 key(s) are past their day"
       is never said. Filled as the host fills it, with one and with many. */
    const name = metric === 'keys-in-text' ? KEYS_IN_TEXT.name : String(AGENTS_MODULE.AGENTS_METRICS[metric]?.name);
    assert.ok(note.body?.startsWith(`${name}: `), `${metric}'s line does not lead with its figure's name`);
    for (const n of [1, 3]) {
      const said = String(note.body).replaceAll(`{{${metric}}}`, String(n));
      assert.doesNotMatch(said, /\d+ \w+\(s\) (?:are|is|were|was|hold|holds|have|has)\b/u, `${metric}'s line reads wrong for ${n}: ${said}`);
      assert.match(said, /\.$/u, `${metric}'s line is not a sentence`);
    }
  }
  assert.equal(
    declared.find((b) => b.kind === 'note' && b.when?.metric === 'keys-in-text')?.body,
    'Keys written in plain text: {{keys-in-text}} place(s). Move each to the vault.',
  );

  /* THE SEED HOLDS LIVE KEYS KEPT NOWHERE, so that line is drawn with its count, and the two quiet ones are not. */
  const { k, sql } = await seeded();
  const blocks = opened(k, 'agents');
  const nowhere = noteOn(blocks, 'keys-nowhere');
  assert.ok(nowhere && nowhere.drawn !== false, 'a record with keys kept nowhere does not say so');
  assert.deepEqual(nowhere.refusals, []);
  /* THE PAGE HANDS THE SENTENCE WITH THE FIGURE'S READING BESIDE IT, and the host fills one into the other. */
  assert.deepEqual(nowhere.values, { 'keys-nowhere': reading(k, 'keys-nowhere') });
  for (const quiet of ['keys-expired', 'tools-unseen', 'keys-in-text']) assert.equal(noteOn(blocks, quiet)?.drawn, false, `${quiet} is drawn at nought`);
  assert.ok(blocks.some((b) => b.kind === 'agents'), 'what the brain learned left the page rather than folding');
  /* AS THE RECORD MARKS IT FOR EVERY READER (`markDrawn`): the box is drawn over the one true line, and a section over
     nothing goes with its lines. */
  const boxOf = (page: Drawn[]) => (page as Note[]).find((b) => b.kind === 'section' && b.heading === 'Needs a look');
  assert.ok(boxOf(blocks) && boxOf(blocks)!.drawn !== false, 'Needs a look is hidden over a line that is true');
  sql.close();

  /* A RECORD WITH PROJECTS, THE ADD-ON AND ONE RUN draws none of them, and reads each red figure as nought. */
  const fresh = await empty();
  value(await fresh.k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(fresh.k));
  value(fresh.k.create('session', { doing: 'One run', agent: 'claude', state: 'idle' } as never, { actor: 'p_seed', stamp: { last_seen: isoAgo(0) } }));
  const quietPage = opened(fresh.k, 'agents');
  for (const metric of NOTES) {
    /* THE KEY SCAN HOLDS NOTHING UNTIL ITS FIRST NIGHT, never a nought it has not read (`key-scan.ts`). */
    assert.equal(reading(fresh.k, metric), metric === 'keys-in-text' ? null : 0, `${metric} is not nought on a fresh record`);
    assert.equal(noteOn(quietPage, metric)?.drawn, false, `${metric}'s line is drawn on a fresh record`);
  }
  assert.equal(boxOf(quietPage)?.drawn, false, 'Needs a look is drawn over nothing on a fresh record');
  fresh.sql.close();
});

/**
 * THE DOOR'S FIGURES, SINCE 1.10.0: each names one of the signs the kernel's `record.door` reads, by the reader's own
 * list, so a sign renamed in the kernel turns this red rather than a figure that reads nothing. Over a week nobody
 * reached the door they read nothing, never nought; one run that said hello and made a call reads one.
 */
test('THE DOOR’S FIGURES EACH READ ONE OF THE DOOR’S SIGNS, nothing over a quiet week and the count once marked', async () => {
  const door = Object.values(AGENTS_MODULE.AGENTS_METRICS).filter((m) => m.source === 'record.door') as ((typeof AGENTS_MODULE.AGENTS_METRICS)[string] & { sign?: string })[];
  assert.deepEqual(door.map((m) => m.metric).sort(), ['agent-card-words', 'agent-door-builds-behind', 'agent-door-called', 'agent-door-internal', 'agent-hook-slowest']);
  for (const m of door) {
    assert.ok((DOOR_FIGURE_SIGNS as readonly unknown[]).includes(m.sign), `${m.metric} names ${String(m.sign)}, which the door does not read`);
    assert.deepEqual([m.format, m.window, m.compare], ['int', '7d', 'none'], m.metric);
  }

  const { k, sql } = await seeded();
  assert.equal(reading(k, 'agent-door-called'), null, 'a door nobody reached read nought');
  markDoor(sql, 'S1', { kind: 'hello', build: '1.0.0' }, NOW - 60_000);
  markDoor(sql, 'S1', { kind: 'called', n: 2 }, NOW - 30_000);
  markDoor(sql, 'S1', { kind: 'hook', ms: 420 }, NOW - 30_000);
  assert.equal(reading(k, 'agent-door-called'), 1);
  assert.equal(reading(k, 'agent-door-internal'), 0, 'a door reached with no failure is a true nought');
  assert.equal(reading(k, 'agent-hook-slowest'), 420);
  /* NO CARD MARK IS POSTED YET, AND THE KERNEL IS NOT HANDED ITS HOST'S BUILD, so both read nothing, never nought. */
  assert.equal(reading(k, 'agent-card-words'), null);
  assert.equal(reading(k, 'agent-door-builds-behind'), null);
  sql.close();
});
