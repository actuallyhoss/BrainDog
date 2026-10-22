/**
 * The agents pack: it installs through the pack path, each register refuses what the plan says it
 * refuses, a project's skill hides the global one of the same name, no key row holds a value, and a
 * run in a demo project's folder is placed in that project.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { normalise, type Pack } from '@braindog/declare';
import { KEYS_IN_TEXT, openRecord, type Kernel, type WriteContext } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { BUILT_IN_FIGURES, DOOR_FIGURE_SIGNS, type TidyReading } from '../../kernel/src/built-in-figures.ts';
import { TIDY_LINE_DDL } from '../../kernel/src/tidy.ts';
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
  assert.deepEqual(AGENTS_PACK.manifest, { id: 'agents', version: '1.14.0', requires: ['register.things'] });
  const pack = value<Pack>(await normalise(agentsPackDocument()));
  assert.equal(pack.manifest.pack, 'agents');
  assert.equal(pack.manifest.version, '1.14.0');
  assert.deepEqual([...pack.manifest.provides].sort(), PROVIDES);
});

/* THE VERSION SHIPPED IS THE VERSION SAID (agents-pack-49): the changelog's newest agents entry is the manifest's, so
   the add-on's page never draws a version with no notes, and its notes name what the page gained and no word a person
   should not read. */
test('THE NEWEST CHANGE NOTE IS 1.14.0, and it names what the page opens on and the tiles it gained', () => {
  const newest = MODULE_CHANGES.agents[0]!;
  assert.equal(newest.version, '1.14.0');
  assert.equal(newest.version, AGENTS_PACK.manifest.version);
  assert.match(newest.notes, /how many are at work, on how many machines and how many wait on you/);
  assert.match(newest.notes, /At work/);
  assert.match(newest.notes, /Left for the next run/);
  assert.match(newest.notes, /Machines and profiles/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

/* A VERSION SAID IS NEVER SAID AGAIN IN OTHER WORDS: 1.10.0 is on records, so its note stays as it was written, the
   plain-text keys line and all, and 1.11.0, 1.12.0, 1.13.0 and 1.14.0 are notes beside it, 1.11.0's, 1.12.0's and
   1.13.0's as they were written too. */
test('THE 1.10.0 TO 1.13.0 NOTES ARE AS THEY WERE WRITTEN, with 1.14.0 beside them and not in their place', () => {
  const versions = MODULE_CHANGES.agents.map((c) => c.version);
  assert.deepEqual(versions.slice(0, 6), ['1.14.0', '1.13.0', '1.12.0', '1.11.0', '1.10.0', '1.9.0']);
  assert.equal(new Set(versions).size, versions.length, 'a version is noted twice');
  assert.equal(
    MODULE_CHANGES.agents[1]!.notes,
    'Agents has a new page, How the brain changed, opened from What the brain learned. It says how many learnings arrived this month, how many skills changed and how many have faded, draws both week by week once there are three weeks, and lists what changed with the failure that taught it. Faded lists what nobody confirmed in ninety days. A learning can be a rule, and a skill, tool or key added twice is one. Needs a look says what is here twice, what was tidied this week and what is still stale.',
  );
  assert.equal(
    MODULE_CHANGES.agents[2]!.notes,
    'A Working card on Agents is titled by the agent, with what it said it is doing under its name, or nothing when it has not said. It no longer shows a next step, which is under Left for the next run. Today and Earlier now list a run that finished, so a run that ended properly is no longer missing from the page. They leave out helpers and runs that wrote nothing, and each card says the agent, what it said it was doing, its project and when it was last heard from.',
  );
  assert.equal(
    MODULE_CHANGES.agents[3]!.notes,
    'Agents shows Left for the next run under Working: each step a run left that nobody has taken, with who left it and when. A step more than a week old, or one a later run passed over, says it was left earlier. The line at the top counts the same steps, so it no longer counts a step that was already picked up. Runs from before today are folded under Earlier, with how many there are, until you open it.',
  );
  assert.equal(
    MODULE_CHANGES.agents[4]!.notes,
    'Agents shows Needs a look under the runs when a key holds no value and says nowhere it is kept, a key is past its day, a tool was not seen in a month, or a key is written in plain text where a key should not be. Each line names what it counts, then the number, then what to do. What the brain learned is folded until you open it, and Agents counts how the agent door is used.',
  );
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
  'metric.learnings-arrived',
  'metric.learnings-by-week',
  'metric.learnings-charted',
  'metric.learnings-faded',
  'metric.runs-earlier',
  'metric.runs-heard-today',
  'metric.runs-left-next',
  'metric.runs-today',
  'metric.runs-unplaced',
  'metric.skill-learnings',
  'metric.skills-active',
  'metric.skills-changed',
  'metric.skills-changed-by-week',
  'metric.tools-by-week',
  'metric.tools-unseen',
  'page.agents',
  'page.brain',
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
  assert.deepEqual({ ...k.packs().find((p) => p.id === 'agents') }, { id: 'agents', version: '1.14.0', requires: {} });
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

test('/p/agents: the runs grouped, what a run asked first, then at work, today and earlier, and what they added', async () => {
  const { k, sql } = await seeded();
  /* A RUN THAT STOPPED YESTERDAY WITH A NEXT STEP, and one still marked active that nobody closed, both Earlier, beside
     the seed's two that finished yesterday (a finished run is listed since 1.12.0); and a question a run asked beside
     one a rule put, so Needs you is the run's alone. */
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
  /* THE GROUPS OF RUNS. The page declares no lanes since 1.14.0: the day is the host's, under Today’s runs. */
  const blocks = all;
  assert.equal(all.filter((b) => b.kind === 'lanes').length, 0, 'the page still declares lanes of its own');

  const groups = blocks.filter((b) => ['Needs you', 'At work', 'Today’s runs', 'Earlier'].includes(String(b.heading))).map((b) => b.heading);
  assert.deepEqual(groups, ['Needs you', 'At work', 'Today’s runs', 'Earlier'], 'the runs are not grouped in the order the direction gives');

  const asked = (headed(blocks, 'Needs you') as Drawn & { queue?: { question?: string }[] }).queue ?? [];
  assert.deepEqual(asked.map((q) => q.question).sort(), ['Raise the retainer?', 'Retire the old Fenwick key?'], 'Needs you holds a question no run asked');

  const seen = (a: (typeof RUNS)[number], z: (typeof RUNS)[number]) => String(z.last_seen).localeCompare(String(a.last_seen));
  const today = (r: (typeof RUNS)[number]) => String(r.last_seen).slice(0, 10) === new Date(NOW).toISOString().slice(0, 10);
  const working = RUNS.filter((r) => r.state === 'active' && today(r)).sort(seen);
  /* AT WORK IS THE HOST'S LIVE PART SINCE THE CONTROL ROOM (`panel: presence`, agents and MCP plan §7.1): the runs open
     now are read from the record's `presence`, not drawn as rows of the page, and the line counts the runs at work. */
  assert.equal((headed(blocks, 'At work') as Drawn & { panel?: string }).panel, 'presence', 'At work is not the runs open now');
  assert.equal(reading(k, 'runs-working'), working.length, 'a stopped run is counted as working');
  /* THE RUNS OF TODAY ARE THE HOST'S, SINCE 1.14.0 (`panel: run-list`): the day as lanes a kind of agent and every run
     under it, so no declared block stands under the heading to draw them a second time. */
  const day = headed(all, 'Today’s runs') as Drawn & { panel?: string };
  assert.equal(day.panel, 'run-list', 'Today’s runs is not the host’s list of runs');
  assert.equal(all[all.indexOf(day) + 1]!.kind, 'section', 'a block stands under Today’s runs');
  /* EARLIER IS A FOLD SINCE 1.11.0: its heading counts the runs and the cards right under it are the runs. */
  const fold = headed(blocks, 'Earlier');
  const earlier = blocks[blocks.indexOf(fold) + 1]!;
  const before = RUNS.filter((r) => !today(r)).map((r) => String(r.doing));
  assert.ok(before.length > 0, 'the seed has no run that finished before today');
  assert.deepEqual([fold.kind, fold.matched, earlier.kind, earlier.heading], ['section', 2 + before.length, 'cards', undefined], 'Earlier is not a counted heading over its cards');
  assert.deepEqual([...earlier.rows.map((r) => String(r.fields.doing))].sort(), ['Left open since yesterday', 'Stopped yesterday', ...before].sort(), 'a run last heard from yesterday is not under Earlier');
  /* EVERY RUN UNDER EXACTLY ONE HEADING, the finished ones too. */
  const drawn = [earlier].flatMap((b) => b.rows.map((r) => String(r.fields.doing)));
  assert.equal(new Set(drawn).size, drawn.length, `a run is under two headings: ${drawn.join(', ')}`);
  /* THE NEXT STEP A RUN LEFT IS SAID ONCE, under Left for the next run, and on no run's card since 1.12.0. */
  const declared = AGENTS_PAGES.agents!.blocks as { kind: string; source?: string; columns?: { field: string }[] }[];
  for (const b of declared.filter((d) => d.kind === 'cards' && d.source !== 'handoffs.open'))
    assert.ok(!(b.columns ?? []).some((c) => c.field === 'next'), 'a run\'s card carries a next step');
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
 * THE DAY AS LANES, SINCE 1.8.0, AND THE HOST'S SINCE 1.14.0: the declared lanes drew a lane a run, forty bars on a busy
 * day, and stood under Today’s runs over the host's own list of the same runs. The host draws the day now, a lane a kind
 * of agent over the list (`agentDay` in `apps/web/src/lib/record/all-runs.ts`), and the page declares none. The figure
 * the lanes were drawn on stays, for an agent that reads it, and counts the runs heard from today.
 */
test("TODAY'S RUNS IS THE HOST'S, OVER NO LANES OF THE PAGE'S OWN, and the runs heard from today are still counted", async () => {
  const declared = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; when?: unknown; box?: boolean }[];
  assert.equal(declared.filter((b) => b.kind === 'lanes').length, 0, 'the page still declares lanes');
  assert.deepEqual(declared.find((b) => b.heading === 'Today’s runs'), { kind: 'section', heading: 'Today’s runs', icon: 'clock', span: 12, panel: 'run-list' });
  assert.equal(declared.filter((b) => b.heading === 'Today').length, 0, 'a second tile is headed Today');
  const { k, sql } = await seeded();
  const today = new Date(NOW).toISOString().slice(0, 10);
  const read = k.metric(k.metricDecl('runs-heard-today')!);
  assert.ok(read.ok, JSON.stringify(read));
  assert.equal(read.value.value, RUNS.filter((r) => String(r.last_seen).slice(0, 10) === today).length);
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

  /* THE SEED'S TWO ACTIVE RUNS WERE HEARD FROM THREE AND TWELVE MINUTES AGO, and the two planted here are not working.
     The runs themselves are the host's live part since the control room (`panel: presence`), read from `presence`. */
  const read = k.metric(k.metricDecl('runs-working')!);
  assert.ok(read.ok, JSON.stringify(read));
  assert.equal(read.value.value, RUNS.filter((r) => r.state === 'active').length, 'a run quiet for twenty minutes or left since yesterday is counted working');
  sql.close();
});

test('THE ADD-ON HOLDS NO CLOCK OF ITS OWN: At work is the record\'s `presence` and the line the record\'s counts', () => {
  assert.deepEqual(Object.keys(AGENTS_MODULE).filter((name) => /WORKING/u.test(name)), [], 'the pack still exports its own clause for working');
  assert.equal(JSON.stringify(agentsPackDocument()).includes('agents-working'), false, 'the pack still declares or reads its own working figure');
  const blocks = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; source?: string; where?: unknown; when?: { metric?: string }; lead?: boolean; body?: string }[];
  const working = blocks.find((b) => b.heading === 'At work') as { kind: string; panel?: string; source?: string; where?: unknown; when?: unknown } | undefined;
  assert.deepEqual([working?.kind, working?.panel, working?.source], ['section', 'presence', undefined], 'At work is not the runs open now');
  assert.equal(working?.where, undefined, 'the working source takes no clause');
  assert.equal(working?.when, undefined, 'a section\'s when: would hide the steps under it');
  const lines = blocks.filter((b) => b.kind === 'note' && b.lead === true);
  /* THREE SINCE 1.14.0, ON THE MACHINES AT WORK, so exactly one is drawn: many, one, or none. */
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.when), [
    { metric: 'machines-working', gt: 1 },
    { metric: 'machines-working', is: 1 },
    { metric: 'machines-working', is: 0 },
  ]);
  /* EVERY NUMBER THE RECORD'S: at work and waiting by the rail's clock, and what was left the steps nobody has taken. */
  assert.deepEqual(lines.map((l) => l.body), [
    '{{runs-working}} at work on {{machines-working}} machines, {{runs-waiting}} waiting on you, {{handoffs-open}} step(s) left for the next run',
    '{{runs-working}} at work on one machine, {{runs-waiting}} waiting on you, {{handoffs-open}} step(s) left for the next run',
    'No agent is at work right now, {{runs-waiting}} waiting on you, {{handoffs-open}} step(s) left for the next run',
  ]);
});

/**
 * LEFT FOR THE NEXT RUN, SINCE 1.11.0 (AGT-C12 job c): the steps runs left and nobody has taken, read from the record's
 * own `handoffs.open`, the read a new run is handed its step from. The line counts the same steps (`handoffs-open`).
 * As 1.13.0 declared it, cards a step; the host's since 1.14.0 (`panel: left-steps`), one line a step, beside At work.
 */
const STEPS_14 = { kind: 'section', heading: 'Left for the next run', icon: 'arrow', span: 5, panel: 'left-steps' };
const STEPS = {
  kind: 'cards',
  heading: 'Left for the next run',
  icon: 'arrow',
  span: 12,
  source: 'handoffs.open',
  columns: [
    { field: 'next', as: 'title' },
    { field: 'agent', label: 'Left by', as: 'who' },
    { field: 'left_at', label: 'Left', as: 'when' },
    { field: 'mark', label: 'Status', as: 'fact' },
  ],
  limit: 6,
  when: { metric: 'handoffs-open', gt: 0 },
};

test('LEFT FOR THE NEXT RUN IS THE HOST’S over the steps nobody has taken, beside At work and before Today’s runs', () => {
  const blocks = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; source?: string; span?: number }[];
  const at = blocks.findIndex((b) => b.heading === 'Left for the next run');
  assert.ok(at > 0, 'no block is headed Left for the next run');
  assert.deepEqual(blocks[at], STEPS_14);
  /* BESIDE AT WORK: seven parts of the row and five, so the two read as one row. */
  assert.equal(blocks[at - 1]!.heading, 'At work', 'the steps are not right after At work');
  assert.equal(blocks[at - 1]!.span! + blocks[at]!.span!, 12, 'At work and the steps are not one row');
  assert.deepEqual([blocks[at + 1]!.kind, blocks[at + 1]!.heading], ['section', 'Today’s runs'], 'the steps are not right over the day’s runs');
  /* THE PANEL READS THE STEPS ITSELF, so no declared block reads them a second time. */
  assert.equal(blocks.filter((b) => b.source === 'handoffs.open').length, 0);
});

/** A small list a run can write to, so the record opens a run for it as it does for any agent. */
const CHORES = { id: 'register.chores', kind: 'register', body: { id: 'chores', name: 'Chores', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } };

/** An agent's write, as its token and its client say it. */
const by = (client_id: string, agent: string, repo: string): WriteContext => ({
  actor: `agent:${agent}`,
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, agent, client: agent === 'codex' ? 'codex' : 'claude-code', repo },
});

test('THE STEPS A RUN LEFT ARE DRAWN AND COUNTED AS ONE: the step first, who left it, and left earlier once a week has gone', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([...declarations().filter((d) => d.id === 'register.things'), CHORES as never]));
  value(await installAgentsPack(k));
  type Line = Drawn & { drawn?: boolean; lead?: boolean; values?: Record<string, unknown> };
  const lines = () => (opened(k, 'agents') as Line[]).filter((b) => b.kind === 'note' && b.lead === true);
  /* THE READ `panel: left-steps` MAKES (`apps/web/src/lib/page/panels/StepsPanel.svelte`): the open steps, the newest first. */
  const steps = () =>
    k.block({ kind: 'cards', source: 'handoffs.open', columns: [{ field: 'next', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'left_at', as: 'when' }, { field: 'mark' }], limit: 50 } as never) as unknown as Line;

  /* NOTHING LEFT: no step, and the line that is drawn reads nought, which the host leaves out of the sentence. */
  assert.equal(steps().rows.length, 0, 'a step is read where none was left');
  assert.equal(reading(k, 'handoffs-open'), 0);

  const leave = (client: string, agent: string, repo: string, next: string) => {
    const ctx = by(client, agent, repo);
    value(k.create('chores', { what: `Work of ${client}` } as never, ctx));
    const run = k.findRun({ client_id: client }, 't_1')!;
    value(k.update('session', `S${String(run.seq)}`, { next } as never, ctx));
    value(k.endRun(ctx, {}));
  };
  leave('c1', 'claude', 'kiln', 'Check the refund hook');
  clock.advance(8 * DAY_MS);
  leave('c2', 'codex', 'portage', 'Wire the rates page');

  const drawn = steps();
  assert.deepEqual(drawn.refusals ?? [], []);
  /* THE NEWEST FIRST, each by the agent's name and never a handle, and the one a week old says it was left earlier. */
  assert.deepEqual(
    drawn.rows.map((r) => [r.fields.next, r.fields.mark]),
    [
      ['Wire the rates page', 'next'],
      ['Check the refund hook', 'earlier'],
    ],
  );
  for (const r of drawn.rows) {
    assert.equal(typeof r.fields.agent, 'string');
    assert.doesNotMatch(String(r.fields.agent), /^S\d+$|^[0-9A-HJKMNP-TV-Z]{26}$/u, 'who left a step is said as a handle');
    assert.ok(typeof r.fields.left_at === 'string' && r.fields.left_at !== '');
  }
  /* THE LINE AND THE STEPS AGREE: one figure, the record's, and nobody is at work, so the quiet line is the one drawn. */
  assert.equal(reading(k, 'handoffs-open'), 2);
  assert.equal(drawn.matched, 2);
  const [many, one, quiet] = lines();
  assert.equal(many!.drawn, false);
  assert.equal(one!.drawn, false);
  assert.notEqual(quiet!.drawn, false);
  assert.equal(quiet!.body, 'No agent is at work right now, {{runs-waiting}} waiting on you, {{handoffs-open}} step(s) left for the next run');
  assert.equal(quiet!.values?.['handoffs-open'], 2);
  sql.close();
});

/**
 * WHOSE CARD IT IS AND WHAT IT SAID, SINCE 1.12.0 (AGT-C12 job c, "An Agents page with no dead runs"). On the owner's
 * record Working held four cards with one name, the record's own for a run nobody had named, and one of them printed
 * file paths; and Today and Earlier read only the runs not finished, so a run that ended properly was on neither.
 * A card is titled by the agent now, with what it said it is doing under that or nothing, and the two groups read the
 * list of runs, the finished ones too, without the helpers and the runs that wrote nothing.
 */

/** What reads as a file path, a host, a workflow's handle, a run's handle or a row's id: nothing a card may print. */
const NOT_FOR_A_CARD = /[/\\]|\.(?:ts|js|mjs|md|json)\b|\bwf_\w+|\b[0-9A-HJKMNP-TV-Z]{26}\b|^S\d+$|\b[\w-]+\.(?:local|internal|dev|com)\b/u;

test('A CARD IS THE AGENT AND WHAT IT SAID: a finished run is under Today or Earlier, a helper and an empty run under neither, and no card prints a path', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(k));
  const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
  const HOUR = 60;
  const WEEK = 7 * 24 * HOUR;
  /* PLANTED AS THE SEED PLANTS A RUN, the fields only the record writes stamped (`openRun` in `src/index.ts`). */
  const run = (fields: Record<string, unknown>, stamp: Record<string, unknown>) => value(k.create('session', fields as never, { actor: 'p_seed', stamp } as never));
  const PATHS = '/Users/x/loop/batch.workflow.js wf_01ABC';
  run({ doing: 'Claude run', agent: 'claude', state: 'active' }, { last_seen: ago(3), wrote: 1 });
  run({ doing: 'Fixing the invoice totals', agent: 'codex', state: 'active' }, { last_seen: ago(5), wrote: 4 });
  run({ doing: PATHS, agent: 'claude', state: 'active', next: 'Run loop/batch.workflow.js again for wf_01ABC' }, { last_seen: ago(7), wrote: 2 });
  run({ doing: 'Closing the books', agent: 'claude', state: 'done' }, { last_seen: ago(2 * HOUR), wrote: 3 });
  run({ doing: 'Ended today and wrote nothing', agent: 'claude', state: 'done' }, { last_seen: ago(2 * HOUR), wrote: 0 });
  run({ doing: 'A helper that ended today', agent: 'claude', state: 'done' }, { last_seen: ago(2 * HOUR), wrote: 2, parent: 'S1' });
  const week = ['Tidying the rates', 'Writing the specimen copy', 'Checking the refund hook', 'packages/seed/src/packs/agents.ts', 'Reading the ledger', 'Sorting the keys', 'Drafting the chaser', 'Kerning the lowercase'];
  week.forEach((doing, i) => run({ doing, agent: i % 2 ? 'codex' : 'claude', state: 'done' }, { last_seen: ago(WEEK + i * HOUR), wrote: 1 }));
  run({ doing: 'Ended last week and wrote nothing', agent: 'codex', state: 'abandoned' }, { last_seen: ago(WEEK), wrote: 0 });
  run({ doing: 'A helper of last week', agent: 'codex', state: 'done' }, { last_seen: ago(WEEK), wrote: 5, parent: 'S2' });

  type Card = Drawn & { drawn?: boolean; where?: string; columns?: { field: string; as?: string }[] };
  const page = opened(k, 'agents') as Card[];
  for (const b of page) assert.deepEqual(b.refusals, [], `${String(b.heading)}: ${JSON.stringify(b.refusals)}`);
  const cards = page.filter((b) => b.kind === 'cards');
  const group = (heading: string) => cards.find((b) => b.heading === heading)!;
  const role = (b: Card, as: string) => (b.columns ?? []).filter((c) => c.as === as).map((c) => c.field);

  /* AT WORK IS NO CARD SINCE THE CONTROL ROOM: the runs open now are the host's live part (`panel: presence`), which
     words each run from the record's `presence` (`apps/web/src/lib/record/instruct.ts`). */
  assert.equal(group('At work'), undefined, 'At work is drawn as cards');
  assert.equal((page.find((b) => b.heading === 'At work') as Card & { panel?: string }).panel, 'presence');

  /* TODAY IS THE LANES SINCE THE UI PASS OF 20 OCTOBER: no card of a run that stopped today, and the figure still
     counts the run that ended today and wrote, not the one that wrote nothing, nor the helper, nor a working run. */
  assert.ok(!cards.some((b) => b.where === AGENTS_MODULE.RUNS_TODAY), 'a card of the runs that stopped today is still drawn');
  assert.equal(reading(k, 'runs-today'), 1, 'the figure of the runs that stopped today counts other runs');

  /* EARLIER: the eight that ended last week, six drawn, the latest first, and all eight counted on the fold. */
  const fold = page.findIndex((b) => b.kind === 'section' && b.heading === 'Earlier');
  const earlier = page[fold + 1]!;
  assert.deepEqual(role(earlier, 'who'), ['agent']);
  assert.deepEqual([role(earlier, 'reply'), role(earlier, 'scope')], [['doing_said'], ['project']]);
  assert.deepEqual(earlier.rows.map((r) => r.fields.doing), week.slice(0, 6));
  /* What it said, and nothing where the words are a path: the fourth of them. */
  assert.deepEqual(earlier.rows.map((r) => r.fields.doing_said), week.slice(0, 6).map((d) => (d.includes('/') ? '' : d)));
  assert.deepEqual([page[fold]!.matched, earlier.matched, reading(k, 'runs-earlier')], [8, 8, 8], 'Earlier does not count the runs it leaves undrawn');

  /* AND NOTHING A CARD DRAWS IS A PATH OR AN ID: every cell of every card on the page, as the columns name them. */
  const drawn = cards.flatMap((b) => b.rows.flatMap((r) => (b.columns ?? []).map((c) => String(r.fields[c.field] ?? ''))));
  assert.ok(drawn.length > 20, 'the cards drew nothing to read');
  for (const text of drawn) assert.doesNotMatch(text, NOT_FOR_A_CARD, `a card prints ${text}`);
  sql.close();
});

/** The first sixteen of a SHA-256 over a thing as JSON: what a version held, kept as a mark and not as a copy. */
const mark = (x: unknown): string => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

/**
 * WHAT 1.11.0 DREW WHERE 1.12.0 DRAWS OTHERWISE, to the letter: Working, Today, Earlier's fold and its cards, and the
 * two figures those were drawn on. Kept here so the test below can put them back and read 1.11.0's own mark.
 */
const STOPPED_11 = [
  { field: 'doing', as: 'title' },
  { field: 'agent', as: 'who' },
  { field: 'project', label: 'Project', as: 'scope' },
  { field: 'next', label: 'Next', as: 'fact' },
  { field: 'last_seen', as: 'when' },
];
const TODAY_11 = 'state is idle or handoff, last_seen is today';
const EARLIER_11 = 'last_seen before today';
const BLOCKS_11 = {
  working: { kind: 'cards', heading: 'Working', icon: 'session', span: 12, source: 'sessions.working', columns: STOPPED_11, limit: 12, when: { metric: 'runs-working', gt: 0 } },
  today: { kind: 'cards', heading: 'Today', icon: 'flag', span: 12, source: 'sessions.live', where: TODAY_11, columns: STOPPED_11, limit: 8, when: { metric: 'runs-today', gt: 0 } },
  fold: { kind: 'section', heading: 'Earlier', icon: 'history', span: 12, fold: true, source: 'sessions.live', where: EARLIER_11, limit: 1, when: { metric: 'runs-earlier', gt: 0 } },
  earlier: { kind: 'cards', span: 12, source: 'sessions.live', where: EARLIER_11, columns: STOPPED_11, limit: 6, when: { metric: 'runs-earlier', gt: 0 } },
};
const COUNTED = { value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' };
const FIGURES_11: Record<string, unknown> = {
  'runs-today': { metric: 'runs-today', name: 'Runs that stopped today', source: 'register.session', where: TODAY_11, ...COUNTED },
  'runs-earlier': { metric: 'runs-earlier', name: 'Runs last heard from before today', source: 'register.session', where: `state is active or idle or handoff, ${EARLIER_11}`, ...COUNTED },
};

/**
 * WHAT 1.13.0 PUT IN (AGT-C17 jobs b and c): the page How the brain changed, the four figures it is said and drawn on
 * (the learnings that arrived, and the skills that changed over the record's log), and the line under What the brain
 * learned that opens it, and Needs a look's line of what is here twice (AGT-C18, `stale-rows-same`). Taken out again
 * here, so the marks 1.12.0 and the versions under it were cut with are still read off what the add-on declares today.
 */
const FIGURES_13 = ['learnings-arrived', 'learnings-charted', 'skills-changed', 'skills-changed-by-week'];

/**
 * AND WHAT 1.13.0 PUT IN THE LISTS (AGT-C13 e, AGT-D15 1, AGT-B09 4): `same:` on all four, the kind `rule` with its
 * label, and the four-part test after what learnings hold. Taken out the same way, each key back where it stood. AND
 * `role:` on all four and `fade:` on learnings (agents-by-role-101), so a renamed list is still found by its part.
 */
const HOLDS_12 = 'what an agent found out the hard way, with the failure that taught it';
const listBefore13 = <T extends Record<string, unknown>>(list: T): T => {
  const { same: _same, role: _role, fade: _fade, ...rest } = list as Record<string, unknown>;
  if (_same === undefined) return list;
  const fields = (rest.fields as Record<string, unknown>[]).map((f) => {
    if (rest.holds !== undefined && list.title === 'lesson' && f.id === 'kind') {
      const { labels: _labels, ...kind } = f;
      return { ...kind, values: ['method', 'fact'] };
    }
    return f;
  });
  return { ...rest, ...(list.title === 'lesson' ? { holds: HOLDS_12 } : {}), fields } as unknown as T;
};
const listsBefore13 = (lists: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> =>
  Object.fromEntries(Object.entries(lists).map(([id, list]) => [id, listBefore13(list)]));

/**
 * AND THE STALE LINE AS 1.11.0 WROTE IT, one line of two bare counts, which 1.13.0 made two lines in words (AGT-C18 item
 * 5): put back in the place of the first of the two, and the second taken out.
 */
const STALE_11 = { kind: 'note', tone: 'warn', span: 12, when: { metric: 'gone-stale', gt: 0 }, body: 'Things gone stale: {{gone-stale}}. Tidied this week: {{tidied-week}}.' };
const staleBefore13 = (blocks: { key?: string; when?: { metric?: string } }[]): unknown[] =>
  blocks.flatMap((b) => (b.when?.metric === 'tidied-week' ? [STALE_11] : b.when?.metric === 'gone-stale' ? [] : [b]));

/**
 * AND THE PAGE AS IT STOOD BEFORE BATCH 6 (Agents 1.13.0's own change, the look of Agents): the day's lanes and the runs
 * that stopped today as two tiles both headed Today, the lanes first under the line and the runs between Left for the
 * next run and Needs a look; the agent the card's title where it is now the card's mark (`as: 'who'`) and the project
 * headed Project; and the line for keys with no value in the words of its figure. Put back, so every mark of 1.12.0 and
 * the versions under it is still read off what the add-on declares today.
 */
type Loose = Record<string, unknown>;

/**
 * AND THE PAGE AS IT STOOD BEFORE THE UI PASS OF 20 OCTOBER (agents F7, SF12): the lanes over the last 24 hours with no
 * `where`, the cards of the runs that stopped today under them, "on" as the scope's label, and the key lines as one
 * note each with "(s)". Put back first, so `batch6Back` reads the page batch 6 left.
 */
const ON = (columns: Loose[]): Loose[] => columns.map((c) => (c.field === 'project' && c.as === 'scope' && c.label === undefined ? { field: 'project', label: 'on', as: 'scope' } : c));
const uiPassBack = (blocks: Loose[]): Loose[] => {
  const out: Loose[] = [];
  for (const b of blocks) {
    const metric = (b.when as { metric?: string; is?: number } | undefined)?.metric;
    const one = (b.when as { is?: number } | undefined)?.is === 1;
    if ((metric === 'keys-nowhere' || metric === 'keys-in-text') && one) continue;
    if (metric === 'keys-nowhere') out.push({ ...b, when: { metric, gt: 0 }, body: '{{keys-nowhere}} key(s) with no value. Add the value in the vault.' });
    else if (metric === 'keys-in-text') out.push({ ...b, when: { metric, gt: 0 }, body: 'Keys written in plain text: {{keys-in-text}} place(s). Move each to the vault.' });
    else if (b.kind === 'lanes') {
      const { where: _w, ...rest } = b;
      out.push(rest);
      out.push({
        kind: 'cards',
        span: 12,
        source: 'register.session',
        where: AGENTS_MODULE.RUNS_TODAY,
        columns: [{ field: 'agent', as: 'who' }, { field: 'doing_said', as: 'reply' }, { field: 'project', label: 'on', as: 'scope' }, { field: 'last_seen', as: 'when' }],
        order: [{ field: 'last_seen', dir: 'desc' }],
        limit: 8,
        when: { metric: 'runs-today', gt: 0 },
      });
    } else out.push(Array.isArray(b.columns) && b.kind === 'cards' ? { ...b, columns: ON(b.columns as Loose[]) } : b);
  }
  return out;
};
/**
 * AND THE PAGE AS IT STOOD BEFORE THE CONTROL ROOM (agents and MCP plan §7.1): no box to tell an agent in, and Working
 * the cards over `sessions.working` where it is now the host's `panel: presence`. Put back first of all, so `uiPassBack`
 * reads the page the UI pass left.
 */
const WORKING_CARDS = {
  kind: 'cards',
  heading: 'Working',
  icon: 'session',
  span: 12,
  source: 'sessions.working',
  columns: [
    { field: 'agent', as: 'who' },
    { field: 'doing_said', as: 'reply' },
    { field: 'project', as: 'scope' },
    { field: 'last_seen', as: 'when' },
  ],
  limit: 12,
  when: { metric: 'runs-working', gt: 0 },
};
/** AND BEFORE THE RUNS LIST: Today’s runs without the host's `panel: run-list`, shut while no run was heard from today. */
const runsListBack = (blocks: Loose[]): Loose[] =>
  blocks.map((b) => {
    if (b.kind !== 'section' || b.heading !== 'Today’s runs') return b;
    const { panel: _panel, ...rest } = b;
    return { ...rest, when: { metric: 'runs-heard-today', gt: 0 } };
  });
const controlRoomBack = (blocks: Loose[]): Loose[] =>
  blocks.filter((b) => b.panel !== 'instruct').map((b) => (b.panel === 'presence' ? WORKING_CARDS : b));
const columnsBefore6 = (columns: Loose[]): Loose[] =>
  columns.map((c) => (c.field === 'agent' && c.as === 'who' && c.label === undefined ? { ...c, as: 'title' } : c.field === 'project' && c.label === 'on' ? { ...c, label: 'Project' } : c));
const batch6Back = (blocks: Loose[]): Loose[] => {
  const kept = blocks.filter((b) => !(b.kind === 'section' && b.heading === 'Today’s runs'));
  const lanes = kept.find((b) => b.kind === 'lanes')!;
  const stopped = kept.find((b) => b.kind === 'cards' && b.where === AGENTS_MODULE.RUNS_TODAY)!;
  const { kind: _lk, ...lanesRest } = lanes;
  const { kind: _ck, ...stoppedRest } = stopped;
  const lanesBack = { kind: 'lanes', heading: 'Today', icon: 'clock', ...lanesRest };
  const stoppedBack = { kind: 'cards', heading: 'Today', icon: 'flag', ...stoppedRest, columns: columnsBefore6(stoppedRest.columns as Loose[]) };
  const out: Loose[] = [];
  for (const b of kept) {
    if (b === lanes || b === stopped) continue;
    if (b.kind === 'queue' && b.heading === 'Needs you') out.push(lanesBack);
    if (b.kind === 'section' && b.heading === 'Needs a look') out.push(stoppedBack);
    out.push(
      Array.isArray(b.columns) && b.kind === 'cards'
        ? { ...b, columns: columnsBefore6(b.columns as Loose[]) }
        : (b.when as { metric?: string } | undefined)?.metric === 'keys-nowhere'
          ? { ...b, body: 'Keys with no value and nowhere they are kept: {{keys-nowhere}}. Seal each in the vault or say where it lives.' }
          : b,
    );
  }
  return out;
};

/**
 * AND THE PAGE AS 1.13.0 DECLARED IT, put back first of all, so every mark of 1.13.0 and the versions under it is read
 * off what the add-on declares today: the line two notes on `runs-working`, Working the whole row where At work is seven
 * parts, the steps as cards where they are the host's `panel: left-steps`, Today’s runs a box over the declared lanes, and
 * no Machines and profiles at the foot.
 */
const LINES_13 = [
  { kind: 'note', lead: true, span: 12, when: { metric: 'runs-working', gt: 0 }, body: '{{runs-working}} agent(s) working now, {{handoffs-open}} step(s) left for the next run' },
  { kind: 'note', lead: true, span: 12, when: { metric: 'runs-working', is: 0 }, body: 'No agent is working right now, and {{handoffs-open}} step(s) left for the next run' },
];
const LANES_13 = {
  kind: 'lanes',
  span: 12,
  source: 'register.session',
  where: 'last_seen is today',
  columns: [{ field: 'doing' }, { field: 'started' }, { field: 'last_seen' }, { field: 'state' }],
  tones: { active: 'info' },
  hours: 24,
  when: { metric: 'runs-heard-today', gt: 0 },
};
const back14 = (blocks: Loose[]): Loose[] => {
  const out: Loose[] = [];
  for (const b of blocks) {
    const metric = (b.when as { metric?: string } | undefined)?.metric;
    if (b.lead === true && metric === 'machines-working') {
      if ((b.when as { gt?: number }).gt === 1) out.push(...LINES_13);
    } else if (b.kind === 'section' && b.heading === 'At work') out.push({ kind: 'section', heading: 'Working', icon: 'session', span: 12, panel: 'presence' });
    else if (b.kind === 'section' && b.heading === 'Left for the next run') out.push(STEPS);
    else if (b.kind === 'section' && b.heading === 'Today’s runs') out.push({ kind: 'section', heading: 'Today’s runs', icon: 'clock', span: 12, box: true, panel: 'run-list' }, LANES_13);
    else if (b.kind === 'section' && b.heading === 'Machines and profiles') continue;
    else out.push(b);
  }
  return out;
};
const as13 = (declarations: Record<string, unknown>[]): Record<string, unknown>[] =>
  declarations.map((d) => (d.page === 'agents' ? { ...d, blocks: back14(d.blocks as Loose[]) } : d));

const before13 = (declarations: Record<string, unknown>[]): Record<string, unknown>[] =>
  as13(declarations)
    .filter((d) => d.page !== 'brain' && !FIGURES_13.includes(String(d.metric)))
    .map((d) =>
      d.page === 'agents'
        ? { ...d, nav: (({ place: _place, ...rest }) => rest)(d.nav as Record<string, unknown>), blocks: staleBefore13((batch6Back(uiPassBack(controlRoomBack(runsListBack(d.blocks as Loose[])))) as { key?: string; when?: { metric?: string } }[]).filter((b) => b.key !== 'brain-link' && b.when?.metric !== 'stale-rows-same')) }
        : d.metric === 'keys-nowhere'
          ? { ...d, where: 'state is live, value is empty, where is empty' }
          : listBefore13(d),
    );

test('1.12.0 TAKES NOTHING AWAY: with Working, Today, Earlier and their two figures put back, the add-on declares what 1.11.0 did, to the letter', () => {
  type Block = { kind: string; heading?: string };
  const doc = { declarations: before13((agentsPackDocument() as { declarations: Record<string, unknown>[] }).declarations) };
  let swapped = 0;
  const back = doc.declarations.map((d) => {
    if (typeof d.metric === 'string' && FIGURES_11[d.metric]) return swapped++, FIGURES_11[d.metric];
    if (d.page !== 'agents') return d;
    const blocks = d.blocks as Block[];
    const fold = blocks.findIndex((b) => b.kind === 'section' && b.heading === 'Earlier');
    return {
      ...d,
      blocks: blocks.map((b, i) => {
        if (b.kind === 'cards' && b.heading === 'Working') return swapped++, BLOCKS_11.working;
        if (b.kind === 'cards' && b.heading === 'Today') return swapped++, BLOCKS_11.today;
        if (i === fold) return swapped++, BLOCKS_11.fold;
        if (i === fold + 1) return swapped++, BLOCKS_11.earlier;
        return b;
      }),
    };
  });
  assert.equal(swapped, 6, 'one of the four blocks or two figures 1.12.0 changed is gone');
  /* THE MARK 1.11.0 WAS CUT WITH, as its own test held it: every list, field, figure, page and block it held,
     in its order. So nothing but those six moved, and the page gained no block and lost none. */
  assert.equal(mark(back), 'b016697e2d276cbe', 'something 1.11.0 declared is changed beside Working, Today, Earlier and their two figures');
  /* AND UNDER IT 1.10.0, THE VERSION ON RECORDS, by the marks taken off its released page. From 1.11.0's blocks put
     back: without the line, which 1.11.0 says over another figure, and without what 1.11.0 put in (the steps, the
     stale line, the fold over Earlier), and with Earlier's cards headed and over Needs a look, as 1.10.0 drew them. */
  type Block10 = Block & { lead?: boolean; where?: string; when?: { metric?: string } };
  const { blocks, ...rest } = back.find((d) => (d as { page?: string }).page === 'agents') as { blocks: Block10[] } & Record<string, unknown>;
  const added = (b: Block10) => b.heading === 'Left for the next run' || b.when?.metric === 'gone-stale' || (b.kind === 'section' && b.heading === 'Earlier');
  const now = blocks.filter((b) => !b.lead && !added(b));
  const cards = now.find((b) => b.kind === 'cards' && b.where === EARLIER_11)!;
  const { kind, ...body } = cards;
  const rest10 = now.filter((b) => b !== cards);
  const box = rest10.findIndex((b) => b.heading === 'Needs a look');
  const kept = [...rest10.slice(0, box), { kind, heading: 'Earlier', icon: 'history', ...body }, ...rest10.slice(box)];
  assert.equal(kept.length, 12, 'a block of 1.10.0 went, or another came');
  assert.equal(mark(kept), '7f805aacdb423834', 'a block 1.10.0 drew is changed');
  assert.equal(mark(rest), 'e3c40dd0030b3e3c', 'the page is named, placed or held to other lists');
  assert.equal(mark(Object.entries(AGENTS_PAGES).filter(([slug]) => slug !== 'agents' && slug !== 'brain')), 'c0ba8121ad6e909f', 'a skill’s page or a run’s is changed');
  assert.equal(mark(listsBefore13(AGENTS_REGISTERS)), 'dd24d88e551ccf5d', 'a list or a field is changed');
  /* WITHOUT 1.13.0'S FOUR, which came last of the figures this add-on writes itself and before the door's. */
  const figures12 = Object.fromEntries(
    Object.entries(AGENTS_MODULE.AGENTS_METRICS)
      .filter(([id]) => !FIGURES_13.includes(id))
      /* THE UI PASS OF 21 OCTOBER (H25) COUNTS EVERY KEY NOT RETIRED, as the Vault does; put the live-only clause back. */
      .map(([id, f]) => [id, id === 'keys-nowhere' ? { ...f, where: 'state is live, value is empty, where is empty' } : f]),
  );
  assert.equal(mark({ ...figures12, ...FIGURES_11 }), 'f59d74ab2bdc01ce', 'a figure went or is changed');
  assert.equal(Object.keys(AGENTS_MODULE.AGENTS_METRICS).length, 25, 'a figure went or came');
  /* `runs-left-next` STAYS DECLARED, for an agent that reads it, though no block draws on it. */
  assert.ok(AGENTS_MODULE.AGENTS_METRICS['runs-left-next']);
  assert.equal(JSON.stringify(AGENTS_PAGES.agents!.blocks).includes('runs-left-next'), false, 'the page still counts steps its own way');
});

/**
 * EARLIER UNDER A FOLD OF ITS OWN, SINCE 1.11.0: Left for the next run was a seventh tile before the fold and a page
 * shows six (`calm-pages.test.ts`), so the runs of other days are folded, a press away, with how many on the heading.
 * What each of them left is said above, by the steps themselves. OVER THE LIST OF RUNS SINCE 1.12.0, so a run that
 * finished is counted and drawn, the latest first.
 */
test('EARLIER IS FOLDED UNDER ITS OWN HEADING, which counts the runs, and Left for the next run stays above every fold', async () => {
  const blocks = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; icon?: string; fold?: boolean; source?: string; where?: string; order?: unknown; limit?: number; when?: unknown }[];
  const at = blocks.findIndex((b) => b.heading === 'Earlier');
  assert.deepEqual(blocks[at], { kind: 'section', heading: 'Earlier', icon: 'history', span: 12, fold: true, source: 'register.session', where: AGENTS_MODULE.RUNS_EARLIER, limit: 1, when: { metric: 'runs-earlier', gt: 0 } });
  /* THE CARDS UNDER IT ARE THE SAME RUNS, with no heading of their own, and the next section ends the fold. */
  const cards = blocks[at + 1]!;
  assert.deepEqual([cards.kind, cards.heading, cards.icon, cards.source, cards.where, cards.limit], ['cards', undefined, undefined, 'register.session', AGENTS_MODULE.RUNS_EARLIER, 6]);
  assert.deepEqual(cards.order, [{ field: 'last_seen', dir: 'desc' }]);
  assert.deepEqual(cards.when, { metric: 'runs-earlier', gt: 0 });
  assert.deepEqual([blocks[at + 2]!.kind, blocks[at + 2]!.heading], ['section', 'What the brain learned']);
  assert.equal(blocks.filter((b) => b.heading === 'Earlier').length, 1, 'Earlier is headed twice');
  /* NOTHING IS FOLDED ABOVE IT, so the steps, the day and the runs of today are read as the page opens. */
  const first = blocks.findIndex((b) => b.kind === 'section' && b.fold === true);
  assert.equal(first, at, 'a fold comes before Earlier');
  for (const open of ['Needs you', 'At work', 'Left for the next run', 'Today’s runs', 'Needs a look']) {
    const i = blocks.findIndex((b) => b.heading === open);
    assert.ok(i >= 0 && i < at, `${open} is under a fold`);
  }
  /* A RECORD WITH NO RUN FROM ANOTHER DAY DRAWS NEITHER THE HEADING NOR THE CARDS. */
  const fresh = await empty();
  value(await fresh.k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(fresh.k));
  const page = opened(fresh.k, 'agents') as (Drawn & { drawn?: boolean })[];
  const fold = page.findIndex((b) => b.heading === 'Earlier');
  assert.deepEqual([page[fold]!.drawn, page[fold + 1]!.drawn], [false, false], 'Earlier is drawn over no run');
  fresh.sql.close();
});

/* WHAT 1.13.0 DECLARES, AS ONE MARK: the add-on is in no table of versions (`pack-versions.test.ts` holds the five
   modules), so this is where a change to its declarations with no new version is seen. A change before 1.13.0 is
   released sets the mark again and says what moved; one after it is 1.14.0 with a mark of its own.

   AND 1.12.0'S OWN MARK BESIDE IT, read with what 1.13.0 put in taken out (`before13`): the page, its two figures and
   the line that opens it, and in the lists `same:`, the kind `rule` and the four-part test. So 1.13.0 added those and
   moved nothing 1.12.0 declared. The mark was set again for the lists' part (it was c5d81d3045627de5 with the page
   alone), since 1.13.0 is not released, and again for the skills that changed beside the learnings (AGT-C17 job c:
   two figures over the record's log, a second series on the chart and a clause in the line; it was 7c0c9cb8f919f32f),
   and again for Needs a look's line of what is here twice (tidy-rows-same-92, AGT-C18; it was 421923fd971c9103), and
   again for the stale line made two lines in words (tidied-breakdown-96, AGT-C18 item 5; it was 7bc8400d00577416),
   which `before13` puts back as 1.11.0 wrote it, and again for `role:` on the four lists and `fade:` on learnings
   (agents-by-role-101; it was 111daac7b0d94aee), and again for the Agents page's place on the rail, `nav.place` 60
   (places-and-computed-101; it was a9f073bfd65c161a), which `before13` takes off as it does the rest, and again for the
   look of Agents (batch 6; it was c8e4bf508d3d4bfa): Today’s runs as one tile over the day's lanes and the runs that
   stopped today, the agent as the card's mark and the project said "on", and keys with no value said plainly, which
   `batch6Back` puts back, and again for the UI pass of 20 October (agents F7, SF12; it was 37af65a2925448e1): the lanes
   today's alone with no cards under them, the scope with no label, and the key lines one for one and one for many,
   which `uiPassBack` puts back, and again for the control room (agents and MCP plan §7.1; it was c616a819e2f84bb8): the
   box to tell an agent in and Working as the host's live runs, which `controlRoomBack` puts back, and again for the
   runs list (it was e051523f0cd521af): Today’s runs holding every run with Undo as the host's `panel: run-list`, which
   `runsListBack` puts back. */
test('AGENTS 1.13.0 DECLARES WHAT IT DID WHEN IT WAS CUT, and 1.12.0 under it is as it was', () => {
  const doc = agentsPackDocument() as { version: string; declarations: Record<string, unknown>[] };
  assert.equal(mark(as13(doc.declarations)), '6d4c197a9e3586aa', 'something 1.13.0 declared is changed beside what 1.14.0 moved');
  assert.equal(mark(before13(doc.declarations)), '42ceb4a21591e2e8', 'something 1.12.0 declared is changed beside what 1.13.0 put in');
  assert.equal(doc.declarations.length - before13(doc.declarations).length, 5, '1.13.0 put in a page and four figures');
});

/* WHAT 1.14.0 DECLARES, AS ONE MARK, and 1.13.0 under it read with what 1.14.0 moved put back (`back14`): the line on the
   machines at work, At work beside the steps, the steps, the day and the machines as the host's. A change before 1.14.0
   is released sets the mark again and says what moved; one after it is a version with a mark of its own. */
const MARK_14 = '44814963f8550841';
test('AGENTS 1.14.0 DECLARES WHAT IT DID WHEN IT WAS CUT, and moved no list, field or figure', () => {
  const doc = agentsPackDocument() as { version: string; declarations: Record<string, unknown>[] };
  assert.equal(doc.version, '1.14.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_14, 'the Agents add-on changed what it declares with no new version');
  assert.equal(as13(doc.declarations).length, doc.declarations.length, '1.14.0 put in or took out a declaration');
  for (const [i, d] of doc.declarations.entries()) if (d.page !== 'agents') assert.equal(mark(d), mark(as13(doc.declarations)[i]), `${String(d.id ?? d.metric ?? d.page)} changed`);
});

/* THE SKILLS THAT CHANGED, SINCE 1.13.0 (AGT-C17 job c): two figures over the record's log, each skill that took a
   version counted once, said in the line of How the brain changed as a clause of its own and drawn as the chart's
   second series, on the learnings' weeks. A version is taken only by an accepted proposal, so that is how this takes one. */
test('A SKILL THAT TOOK A VERSION IS COUNTED IN THE LINE AND DRAWN BESIDE THE LEARNINGS, BY WEEK', async () => {
  const figures = AGENTS_MODULE.AGENTS_METRICS;
  const CHANGED = { source: 'events.skills', value: { count: 'changed', field: 'rev' }, format: 'int', target: { gte: 0 }, compare: 'none' };
  assert.deepEqual(figures['skills-changed'], { metric: 'skills-changed', name: 'Skills that changed, last 30 days', ...CHANGED, window: '30d' });
  assert.deepEqual(figures['skills-changed-by-week'], {
    metric: 'skills-changed-by-week',
    name: 'Skills that changed, by week',
    ...CHANGED,
    window: '182d',
    group_by: 'at',
    bucket: 'week',
  });
  type Block = { key?: string; body?: string; series?: { metric: string; label?: string }[] };
  const page = AGENTS_PAGES.brain!.blocks as Block[];
  assert.deepEqual(page.find((b) => b.key === 'by-week')!.series, [
    { metric: 'learnings-by-week', label: 'Learnings' },
    { metric: 'skills-changed-by-week', label: 'Skills changed' },
  ]);
  /* A CLAUSE OF ITS OWN IN BOTH LINES, so the writer leaves it out at nought (`leadOf`). */
  for (const key of ['line', 'line-quiet'])
    assert.ok(String(page.find((b) => b.key === key)!.body).split(/,\s+/u).includes('{{skills-changed}} skill(s) changed'), `${key} does not say the skills`);

  const { k, sql } = await seeded();
  assert.equal(reading(k, 'skills-changed'), 0, 'a seeded skill took no version');
  const skill = value<{ rows: { id: string; version: number; fields: Record<string, unknown> }[] }>(k.list({ register: 'skills', limit: 1 })).rows[0]!;
  const rev = Number(skill.fields.rev);
  const asked = value<{ id: string }>(
    k.propose({ question: 'Take the new version?', body_kind: 'rowset', body: { register: 'skills', rows: [{ at: skill.id, version: skill.version, patch: { body: '# Reviewed again', rev: rev + 1 } }] } } as never, 'agent:claude'),
  );
  value(k.decide(asked.id, { decide: { option: 'accept', reason: 'it reads right' } } as never, 'p_seed'));
  assert.equal(k.get(skill.id)?.fields.rev, rev + 1, 'the accepted proposal did not take the version');
  assert.equal(reading(k, 'skills-changed'), 1);
  const weeks = k.metric(k.metricDecl('skills-changed-by-week')!);
  assert.ok(weeks.ok, JSON.stringify(weeks));
  assert.deepEqual(weeks.value.groups?.map((g) => [g.key, g.value]), [[weeks.value.current, 1]]);
  /* AND THE PAGE STILL READS, every block without a refusal. */
  for (const b of opened(k, 'brain')) assert.deepEqual(b.refusals, [], `${(b as { key?: string }).key}: ${JSON.stringify(b.refusals)}`);
  sql.close();
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

test('A PROJECT PAGE SAYS WHAT IT RUNS ON: its own keys, tools and skills, and none of the ones from everywhere', async () => {
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
  /* THREE OF EACH ON THE PAGE SINCE work 1.15.0, a part of More about Kiln, AND THE PROJECT'S OWN ALONE SINCE BATCH 72
     (project-own-cards-72, PGS-C31): the ones from everywhere followed them here until then, the same three under
     every project. Read again with room for all of them, none from everywhere comes. */
  const keys = said('Keys', 'name');
  const everywhere = (key: string): boolean => key.endsWith('@ everywhere');
  assert.ok(keys.length > 0 && !keys.some(everywhere), keys.join(', '));
  const all = k.block({ ...(headed(blocks, 'Keys') as unknown as Record<string, unknown>), limit: 20, rows: undefined, matched: undefined, scopes: undefined } as never);
  assert.ok(all.rows.length > 0 && all.rows.every((_r, i) => (all.scopes?.[i] ?? 'everywhere') !== 'everywhere'), 'a key from everywhere is read under the project’s own');
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
  const nowhere = keys.filter((r) => r.state !== 'retired' && r.where === undefined).length;
  assert.ok(nowhere > 0, 'the seed has no key kept nowhere');
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
  assert.equal(reading(k, 'keys-nowhere'), nowhere - 2, 'a sealed key is still counted as kept nowhere');

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
const noteOn = (blocks: Drawn[], metric: string): Note | undefined => {
  const all = (blocks as Note[]).filter((b) => b.kind === 'note' && b.when?.metric === metric);
  /* A PAIR (one for one, one for many) is read by the one drawn, or the first where neither is. */
  return all.find((b) => b.drawn !== false) ?? all[0];
};

/**
 * NEEDS A LOOK, SINCE 1.10.0: one boxed tile under the runs, its four lines each drawn only while its figure is above
 * nought, closed by the folded section after it, so the page still shows six tiles before its fold. That section was
 * What the brain learned until 1.11.0, when Earlier was folded under one of its own between the two.
 */
test('NEEDS A LOOK HOLDS THE KEYS AND TOOLS TO PUT RIGHT, each line drawn only while its figure is above nought', async () => {
  const declared = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; box?: boolean; fold?: boolean; tone?: string; when?: { metric?: string }; body?: string }[];
  const box = declared.findIndex((b) => b.kind === 'section' && b.heading === 'Needs a look');
  assert.ok(box > 0 && declared[box]!.box === true, 'Needs a look is not a boxed section');
  assert.ok(box > declared.findIndex((b) => b.kind === 'section' && b.heading === 'Today’s runs'), 'Needs a look is above the runs of today');
  /* THE FOUR OF 1.10.0, then the stale line 1.11.0 put under them, two lines since 1.13.0 (their own test is below),
     then 1.13.0's line of what is here twice, with the way to fold it on each list that says what makes two of its rows one. */
  const BOX = [...NOTES, 'tidied-week', 'gone-stale', 'stale-rows-same'];
  assert.deepEqual(
    [...String(noteOn(declared as Drawn[], 'stale-rows-same')?.body).matchAll(/\]\(([^)]+)\)/gu)].map((m) => m[1]),
    ['/r/skills?twice=1', '/r/tools?twice=1', '/r/credentials?twice=1', '/r/learnings?twice=1'],
  );
  /* THE KEY LINES ARE A PAIR EACH SINCE THE UI PASS OF 20 OCTOBER (SF12): one for one and one for many. */
  const LINES = BOX.flatMap((m) => (m === 'keys-nowhere' || m === 'keys-in-text' ? [m, m] : [m]));
  assert.deepEqual(declared.slice(box + 1, box + 1 + LINES.length).map((b) => b.when?.metric), LINES, 'the lines are not in the box, or not in order');
  const closer = declared[box + 1 + LINES.length]!;
  assert.deepEqual([closer.kind, closer.heading, closer.fold], ['section', 'Earlier', true], 'nothing closes the box, so it swallows what follows');
  for (const metric of NOTES) {
    const pair = metric === 'keys-nowhere' || metric === 'keys-in-text';
    const note = declared.find((b) => b.kind === 'note' && b.when?.metric === metric && !(b.when as { is?: number }).is)!;
    assert.deepEqual(note.when, { metric, gt: pair ? 1 : 0 });
    assert.equal(note.tone, 'warn', `${metric}'s line is not toned`);
    assert.ok(note.body?.includes(`{{${metric}}}`), `${metric}'s line does not say its number`);
    assert.doesNotMatch(String(note.body), /—|credential|session|\brow\b/iu, `${metric}'s line reads as the machine`);
    /* RIGHT FOR ONE (agents-pack-49): its figure's name, the number, then what to do, so "1 key(s) are past their day"
       is never said. Filled as the host fills it, with one and with many. */
    const name = metric === 'keys-in-text' ? KEYS_IN_TEXT.name : String(AGENTS_MODULE.AGENTS_METRICS[metric]?.name);
    /* THE KEY LINES SAY IT PLAINLY SINCE THE UI PASS: "2 keys have no value. Add them in the vault", the way a link. */
    if (pair) assert.ok(!note.body?.includes('(s)'), `${metric}'s line says (s)`);
    else assert.ok(note.body?.startsWith(`${name}: `), `${metric}'s line does not lead with its figure's name`);
    for (const n of [1, 3]) {
      const said = String(note.body).replaceAll(`{{${metric}}}`, String(n));
      assert.doesNotMatch(said, /\d+ \w+\(s\) (?:are|is|were|was|hold|holds|have|has)\b/u, `${metric}'s line reads wrong for ${n}: ${said}`);
      assert.match(said, /(?:\.|\]\(\/vault\))$/u, `${metric}'s line is not a sentence`);
    }
  }
  const bodies = (metric: string) => declared.filter((b) => b.kind === 'note' && b.when?.metric === metric).map((b) => [b.when, b.body]);
  assert.deepEqual(bodies('keys-nowhere'), [
    [{ metric: 'keys-nowhere', is: 1 }, '1 key has no value. [Add it in the vault](/vault)'],
    [{ metric: 'keys-nowhere', gt: 1 }, '{{keys-nowhere}} keys have no value. [Add them in the vault](/vault)'],
  ]);
  assert.deepEqual(bodies('keys-in-text'), [
    [{ metric: 'keys-in-text', is: 1 }, 'A key is written in plain text in 1 place. Move it to the vault.'],
    [{ metric: 'keys-in-text', gt: 1 }, 'Keys are written in plain text in {{keys-in-text}} places. Move each to the vault.'],
  ]);

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
 * THE STALE LINE, SINCE 1.11.0 (AGT-C18), TWO LINES IN WORDS SINCE 1.13.0 (item 5): Needs a look says what the record
 * cleared this week and what is still stale, each finder by finder (`.names`), over the record's own `tidied-week` and
 * `gone-stale`, and each line is drawn only while its own figure is above nought.
 */
test('NEEDS A LOOK SAYS WHAT WAS TIDIED THIS WEEK AND WHAT IS STILL STALE, in words, each over its own figure', async () => {
  const declared = AGENTS_PAGES.agents!.blocks as { kind: string; tone?: string; span?: number; when?: unknown; body?: string }[];
  const lines = declared.filter((b) => b.kind === 'note' && /"(?:gone-stale|tidied-week)"/u.test(JSON.stringify(b.when ?? {})));
  assert.deepEqual(lines, [
    { kind: 'note', tone: 'warn', span: 12, when: { metric: 'tidied-week', gt: 0 }, body: 'Tidied this week: {{tidied-week.names}}.' },
    { kind: 'note', tone: 'warn', span: 12, when: { metric: 'gone-stale', gt: 0 }, body: 'Still stale: {{gone-stale.names}}.' },
  ]);
  /* BOTH ARE THE RECORD'S FIGURES, declared by no add-on. */
  for (const id of ['gone-stale', 'tidied-week']) {
    assert.ok(Object.hasOwn(BUILT_IN_FIGURES, id), `${id} is not a figure the record holds`);
    assert.equal(AGENTS_MODULE.AGENTS_METRICS[id], undefined, `${id} is declared twice`);
  }
  for (const line of lines) assert.doesNotMatch(String(line.body), /—|\(s\)|\brow\b|session/iu);

  /* A FRESH RECORD HAS NOTHING STALE AND NOTHING TIDIED: neither line is drawn, and neither figure names anything. */
  const fresh = await empty();
  value(await fresh.k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(fresh.k));
  const page = opened(fresh.k, 'agents');
  for (const id of ['tidied-week', 'gone-stale']) {
    assert.equal(noteOn(page, id)?.drawn, false, `${id}'s line is drawn on a fresh record`);
    assert.deepEqual(noteOn(page, id)?.refusals, []);
    assert.equal(named(fresh.k, id), undefined, `${id} names something on a fresh record`);
  }
  fresh.sql.close();
});

/* WHAT A FIGURE SAYS FINDER BY FINDER, as the record reads it. */
const named = (k: Kernel, id: string): string | undefined => {
  const r = k.metric(k.metricDecl(id)!);
  assert.ok(r.ok, JSON.stringify(r));
  return (r.value as TidyReading).names;
};

/* THE WEEK'S LINE OVER WHAT THE HOURLY PASS KEPT: three steps nobody took closed and forty-one empty runs hidden, the
   larger first, drawn with nothing stale beside it; the stale line is not. */
test('A WEEK THAT CLEARED STEPS AND EMPTY RUNS DRAWS THE TIDIED LINE ALONE, the larger first', async () => {
  const { k, sql } = await empty();
  value(await k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(k));
  const keep = (finder: string, back: number, did: number): void => {
    sql.exec(TIDY_LINE_DDL);
    const at = new Date(NOW - back * DAY_MS).toISOString();
    sql.exec('INSERT INTO tidy_line (finder, day, stale, did, low, at) VALUES (?, ?, 0, ?, 0, ?)', finder, at.slice(0, 10), did, at);
  };
  keep('steps-old', 1, 3);
  keep('runs-empty', 2, 41);
  assert.equal(reading(k, 'tidied-week'), 44);
  assert.equal(named(k, 'tidied-week'), '41 empty runs hidden and 3 steps nobody took closed');
  const page = opened(k, 'agents');
  const tidiedLine = noteOn(page, 'tidied-week')!;
  assert.notEqual(tidiedLine.drawn, false, 'a week that cleared something does not say so');
  assert.deepEqual(tidiedLine.refusals, []);
  assert.equal(tidiedLine.values?.['tidied-week.names'], '41 empty runs hidden and 3 steps nobody took closed');
  assert.equal(reading(k, 'gone-stale'), 0);
  assert.equal(noteOn(page, 'gone-stale')?.drawn, false, 'the stale line is drawn over nothing stale');
  sql.close();
});

/* DRAWN SINCE THE RECORD READS `record.tidy` (`sourceReaders` in `packages/kernel/src/metrics.ts`, landed with batch 85):
   until then `gone-stale` was refused as a source the build does not read, and the line stayed undrawn. */
test('A STEP NOBODY TOOK IN A MONTH DRAWS THE STALE LINE, with its count', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([...declarations().filter((d) => d.id === 'register.things'), CHORES as never]));
  value(await installAgentsPack(k));
  const ctx = by('c1', 'claude', 'kiln');
  value(k.create('chores', { what: 'Work of c1' } as never, ctx));
  value(k.update('session', `S${String(k.findRun({ client_id: 'c1' }, 't_1')!.seq)}`, { next: 'Check the refund hook' } as never, ctx));
  value(k.endRun(ctx, {}));
  clock.advance(31 * DAY_MS);
  assert.equal(reading(k, 'gone-stale'), 1);
  assert.equal(named(k, 'gone-stale'), '1 step nobody took');
  const line = noteOn(opened(k, 'agents'), 'gone-stale')!;
  assert.notEqual(line.drawn, false, 'a step a month old is stale and the line is not drawn');
  assert.deepEqual(line.refusals, []);
  assert.equal((line as { unnamed?: string[] }).unnamed, undefined, 'the line names a figure the record does not hold');
  sql.close();
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
