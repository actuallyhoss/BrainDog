/**
 * The agents pack: it installs through the pack path, each register refuses what the plan says it
 * refuses, a project's skill hides the global one of the same name, no key row holds a value, and a
 * run in a demo project's folder is placed in that project.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { normalise, type Pack } from '@braindog/declare';
import { KEYS_IN_TEXT, openRecord, type Kernel, type WriteContext } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { BUILT_IN_FIGURES, DOOR_FIGURE_SIGNS, type TidyReading } from '../../kernel/src/built-in-figures.ts';
import { TIDY_LINE_DDL } from '../../kernel/src/tidy.ts';
import { markDoor } from '../../kernel/src/door.ts';

import { AGENTS_PACK, AGENTS_PAGES, AGENTS_REGISTERS, NOW, ROWS, RUNS, agentsPackDocument, declarations, installAgentsPack, installSeed } from '../src/index.ts';
import * as AGENTS_MODULE from '../src/packs/agents.ts';
import { MODULE_CHANGES } from '../src/changelog.ts';

/** One version's note, found by the version it is for, so a later version does not move what a test reads. */
const noted = (version: string): { version: string; notes: string } => {
  const note = MODULE_CHANGES.agents.find((c) => c.version === version);
  assert.ok(note, `Agents has no note for ${version}`);
  return note;
};

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
  assert.deepEqual(AGENTS_PACK.manifest, { id: 'agents', version: '1.34.0', requires: [] });
  const pack = value<Pack>(await normalise(agentsPackDocument()));
  assert.equal(pack.manifest.pack, 'agents');
  assert.equal(pack.manifest.version, '1.34.0');
  assert.deepEqual([...pack.manifest.provides].sort(), PROVIDES);
});

/* THE VERSION SHIPPED IS THE VERSION SAID (agents-pack-49): the changelog's newest agents entry is the manifest's, so
   the add-on's page never draws a version with no notes, and its notes name what the page gained and no word a person
   should not read. */
test('THE NEWEST CHANGE NOTE IS 1.34.0, the manifest\'s, and says no line of counts; 1.30.0 still says What changed', () => {
  const newest = MODULE_CHANGES.agents[0]!;
  assert.equal(newest.version, '1.34.0');
  assert.equal(newest.version, AGENTS_PACK.manifest.version);
  assert.match(newest.notes, /no longer open on a line of counts/);
  assert.match(noted('1.32.0').notes, /no longer needs Projects/);
  assert.match(noted('1.30.0').notes, /What changed/);
  assert.match(noted('1.29.0').notes, /Keychain/);
  assert.match(noted('1.28.0').notes, /Runs on your machine/);
  assert.match(noted('1.28.0').notes, /API token/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

/* A TOOL AND A KEY ARE SAID IN WORDS SINCE 1.28.0: their pages read "Transport: Stdio" and "Kind: Api token", the stored
   values with a capital. The values stay; a tool's every one has a label, and a key's kinds are said by the app, since a
   label map naming `api_token` is refused as a secret in a pack. */
test('EVERY TOOL TRANSPORT AND KIND HAS A LABEL, none is the stored value, and a key\'s kinds carry no label map', () => {
  const fieldOf = (register: string, id: string) =>
    (AGENTS_PACK.registers[register]!.fields as readonly { id: string; label: string; values?: readonly string[]; labels?: Readonly<Record<string, string>> }[]).find((f) => f.id === id)!;
  for (const [register, id] of [['tools', 'transport'], ['tools', 'kind']] as const) {
    const f = fieldOf(register, id);
    for (const v of f.values ?? []) {
      assert.ok(f.labels?.[v], `${register}.${id} says ${v} raw`);
      assert.notEqual(f.labels![v], v, `${register}.${id} says ${v} as it is stored`);
    }
  }
  assert.equal(fieldOf('tools', 'transport').label, 'How it runs');
  assert.deepEqual(fieldOf('tools', 'transport').labels, { stdio: 'Runs on your machine', http: 'Reached over the web' });
  assert.equal(fieldOf('credentials', 'kind').labels, undefined);
});

test('THE 1.27.0 NOTE says the runs are headed Working now', () => {
  const newest = noted('1.27.0');
  assert.match(newest.notes, /Working now/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.26.0 NOTE says keys past their day plainly', () => {
  const newest = noted('1.26.0');
  assert.match(newest.notes, /Keys past their day/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.25.0 NOTE says the first line counts open and quiet runs too', () => {
  const newest = noted('1.25.0');
  assert.match(newest.notes, /open and quiet/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.24.0 NOTE says what is accepted unchanged', () => {
  const newest = noted('1.24.0');
  assert.match(newest.notes, /unchanged/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.22.0 NOTE says Vault is now Keychain', () => {
  const newest = noted('1.22.0');
  assert.match(newest.notes, /Keychain/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.20.0 NOTE says the runs open now are headed Open now', () => {
  const newest = noted('1.20.0');
  assert.match(newest.notes, /Open now/);
  assert.match(newest.notes, /Quiet/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.19.0 NOTE says Nobody working right now', () => {
  const newest = noted('1.19.0');
  assert.match(newest.notes, /Nobody working right now/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.18.0 NOTE says a key in the vault says Locked value', () => {
  const newest = noted('1.18.0');
  assert.match(newest.notes, /Locked value/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.17.0 NOTE says the page reads like a list of runs', () => {
  const newest = noted('1.17.0');
  assert.match(newest.notes, /At work, Up next and Recent runs/);
  assert.match(newest.notes, /Needs you only/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.16.0 NOTE says the page opens on who is at work on what', () => {
  const newest = noted('1.16.0');
  assert.match(newest.notes, /who is at work and on what/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.15.0 NOTE says who the questions on Agents were asked by', () => {
  const newest = noted('1.15.0');
  assert.match(newest.notes, /Your agents asked/);
  assert.ok(newest.notes.length <= 500, 'a change note is at most 500 characters');
  assert.ok(!/\brows?\b|—|\(s\)|\bsessions?\b|handoff/iu.test(newest.notes), 'the note says "row", "session", "handoff", an em dash or "(s)"');
});

test('THE 1.14.0 NOTE names what the page opens on and the tiles it gained', () => {
  const newest = noted('1.14.0');
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
  assert.deepEqual(versions.slice(0, 26), ['1.34.0', '1.33.0', '1.32.0', '1.31.0', '1.30.0', '1.29.0', '1.28.0', '1.27.0', '1.26.0', '1.25.0', '1.24.0', '1.23.0', '1.22.0', '1.21.0', '1.20.0', '1.19.0', '1.18.0', '1.17.0', '1.16.0', '1.15.0', '1.14.0', '1.13.0', '1.12.0', '1.11.0', '1.10.0', '1.9.0']);
  assert.equal(new Set(versions).size, versions.length, 'a version is noted twice');
  assert.equal(
    noted('1.13.0').notes,
    'Agents has a new page, How the brain changed, opened from What the brain learned. It says how many learnings arrived this month, how many skills changed and how many have faded, draws both week by week once there are three weeks, and lists what changed with the failure that taught it. Faded lists what nobody confirmed in ninety days. A learning can be a rule, and a skill, tool or key added twice is one. Needs a look says what is here twice, what was tidied this week and what is still stale.',
  );
  assert.equal(
    noted('1.12.0').notes,
    'A Working card on Agents is titled by the agent, with what it said it is doing under its name, or nothing when it has not said. It no longer shows a next step, which is under Left for the next run. Today and Earlier now list a run that finished, so a run that ended properly is no longer missing from the page. They leave out helpers and runs that wrote nothing, and each card says the agent, what it said it was doing, its project and when it was last heard from.',
  );
  assert.equal(
    noted('1.11.0').notes,
    'Agents shows Left for the next run under Working: each step a run left that nobody has taken, with who left it and when. A step more than a week old, or one a later run passed over, says it was left earlier. The line at the top counts the same steps, so it no longer counts a step that was already picked up. Runs from before today are folded under Earlier, with how many there are, until you open it.',
  );
  assert.equal(
    noted('1.10.0').notes,
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
  assert.deepEqual({ ...k.packs().find((p) => p.id === 'agents') }, { id: 'agents', version: '1.34.0', requires: {} });
  assert.deepEqual([...k.packClaims('agents')].sort(), PROVIDES);
  for (const id of Object.keys(AGENTS_REGISTERS)) assert.equal(k.count(id), ROWS[id]?.length, `${id} lost rows`);
  assert.equal(k.get('LN7')?.fields.supersedes, k.get('LN6')?.id, 'a learning names the one it replaces by its row');
  sql.close();
});

/* SINCE 1.32.0 (31f31f175) AGENTS STANDS WITHOUT PROJECTS, BY SAYING WHAT THE RECORD HOLDS: the document asked with no
   `holds` keeps its links, as the sample's seed takes it, and that one is refused whole with the list it names. */
test('THE WHOLE DOCUMENT IS REFUSED ON A RECORD WITH NO PROJECTS AND INSTALLS NOTHING, and the one cut for that record goes in', async () => {
  const { k, sql } = await empty();
  assert.equal(codeOf(await installAgentsPack(k)), 'REGISTER_UNRESOLVED');
  assert.equal(k.register('learnings'), undefined);
  assert.deepEqual(k.packs(), []);
  const cut = value<Pack>(await normalise(agentsPackDocument({ holds: [] })));
  assert.ok(!JSON.stringify(cut.declarations.map((d) => d.body)).includes('"to":"things"'), 'a link to Projects stayed on a record without them');
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

/**
 * THE AGENTS PAGE AS 1.16.0 DECLARED IT, to the letter, kept as a file (`fixtures/agents-page-1.16.0.json`, written off
 * the module as 1.16.0 was released). 1.17.0 made the page a runs console and took most of its blocks away, so the
 * versions under it are read off this, and the cards Earlier drew are still read by the record in the test of what a
 * card says.
 */
const BLOCKS_16 = JSON.parse(readFileSync(new URL('./fixtures/agents-page-1.16.0.json', import.meta.url), 'utf8')) as Record<string, unknown>[];

/** The two lines the page declares, one drawn: how many are at work and how many steps are up next, or nobody (1.19.0's words). */
/* THREE SINCE 1.25.0 (Q4 of 29 October): the runs open and quiet are counted beside the ones working, so "Nobody working
   right now" never stands alone over runs heard just now. */
const LINES = [
  '{{runs-working}} working, {{runs-waiting}} open and quiet, {{handoffs-open}} step(s) up next',
  'Nobody working right now, {{runs-waiting}} open and quiet, {{handoffs-open}} step(s) up next',
  'Nobody working right now. {{handoffs-open}} step(s) up next',
];
/** The line 1.19.0 to 1.24.0 drew with nobody working, which 1.25.0 still draws with no run open. */
const NOBODY_19 = LINES[2]!;
const headed = (blocks: Drawn[], heading: string): Drawn => {
  const found = blocks.find((b) => b.heading === heading);
  assert.ok(found, `no block headed ${heading}`);
  return found;
};

test('/p/agents: a runs console, the line, Tell an agent, At work, Up next and Recent runs, then a foot of doors', async () => {
  const { k, sql } = await seeded();
  /* A RUN THAT STOPPED YESTERDAY WITH A NEXT STEP, one still marked active that nobody closed, and questions a run and a
     rule asked: none of them is a block of the page since 1.17.0. The runs are the host's rows, and each question lives
     in Needs you only. */
  const yesterday = new Date(NOW - 26 * 3_600_000).toISOString();
  value(k.create('session', { doing: 'Stopped yesterday', agent: 'codex', state: 'idle', next: 'Pick the review up again.' } as never, { actor: 'p_seed', stamp: { last_seen: yesterday } }));
  value(k.create('session', { doing: 'Left open since yesterday', agent: 'claude', state: 'active' } as never, { actor: 'p_seed', stamp: { last_seen: yesterday } }));
  const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };
  value(k.propose({ question: 'Retire the old Fenwick key?', body_kind: 'options', body: OPTIONS }, 'S1'));
  value(k.propose({ question: 'A rule asks about a bill', body_kind: 'options', body: OPTIONS }, 'rule:bills'));
  const all = opened(k, 'agents');
  for (const b of all) assert.deepEqual(b.refusals, [], `${b.heading}: ${JSON.stringify(b.refusals)}`);

  /* THE PARTS, IN THIS ORDER, each the whole row, each the host's panel. */
  const sections = (AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; panel?: string; span?: number; box?: boolean; fold?: boolean }[]).filter((b) => b.kind === 'section');
  assert.deepEqual(
    sections.map((b) => [b.heading, b.panel, b.span]),
    [
      ['Tell an agent', 'instruct', 12],
      ['Working now', 'presence', 12],
      ['Up next', 'left-steps', 12],
      ['Recent runs', 'run-list', 12],
      ['Accepted unchanged', 'kept', 12],
    ],
    'the page is not the line, the box and the three lists, in that order',
  );
  assert.ok(!sections.some((b) => b.box === true || b.fold === true), 'a part is boxed or folded');

  /* NO QUEUE, NO CARDS, NO LANES AND NO LOG: what runs asked is Needs you's, and the runs are the host's rows. */
  for (const kind of ['queue', 'cards', 'lanes', 'agents', 'feed']) assert.equal(all.filter((b) => b.kind === kind).length, 0, `the page still draws a ${kind} block`);
  const headings = all.map((b) => b.heading);
  /* WORKING NOW IS NOT GONE SINCE 1.27.0: it heads the runs open now again, as Today does, and is the section above. */
  for (const gone of ['Your agents asked', 'Needs you', 'Needs a look', 'Earlier', 'What the brain learned', 'Machines and profiles', 'Left for the next run', 'Today’s runs', 'Waiting on you'])
    assert.ok(!headings.includes(gone), `${gone} is still on the agents page`);

  /* THE LINE COUNTS THE RUNS AT WORK BY THE RAIL'S CLOCK. */
  const today = (r: (typeof RUNS)[number]) => String(r.last_seen).slice(0, 10) === new Date(NOW).toISOString().slice(0, 10);
  assert.equal(reading(k, 'runs-working'), RUNS.filter((r) => r.state === 'active' && today(r)).length, 'a stopped run is counted as working');

  /* AND NO PART SAYS IT IS EMPTY OF ITS OWN: the line and the host's panels say what is quiet. */
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
test("RECENT RUNS IS THE HOST'S, OVER NO LANES OF THE PAGE'S OWN, and the runs heard from today are still counted", async () => {
  const declared = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; when?: unknown; box?: boolean }[];
  assert.equal(declared.filter((b) => b.kind === 'lanes').length, 0, 'the page still declares lanes');
  /* HEADED Today’s runs FROM 1.14.0 TO 1.16.0; RECENT RUNS SINCE 1.17.0, the host's rows of the last runs of every day. */
  assert.deepEqual(declared.find((b) => b.heading === 'Recent runs'), { kind: 'section', heading: 'Recent runs', icon: 'clock', span: 12, panel: 'run-list' });
  assert.equal(declared.filter((b) => b.heading === 'Today' || b.heading === 'Today’s runs').length, 0, 'a second tile is headed Today');
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

test('THE ADD-ON HOLDS NO CLOCK OF ITS OWN: At work is the record\'s `presence`, and no line counts over it', () => {
  assert.deepEqual(Object.keys(AGENTS_MODULE).filter((name) => /WORKING/u.test(name)), [], 'the pack still exports its own clause for working');
  assert.equal(JSON.stringify(agentsPackDocument()).includes('agents-working'), false, 'the pack still declares or reads its own working figure');
  const blocks = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; source?: string; where?: unknown; when?: { metric?: string }; lead?: boolean; body?: string }[];
  const working = blocks.find((b) => b.heading === 'Working now') as { kind: string; panel?: string; source?: string; where?: unknown; when?: unknown } | undefined;
  assert.deepEqual([working?.kind, working?.panel, working?.source], ['section', 'presence', undefined], 'At work is not the runs open now');
  assert.equal(working?.where, undefined, 'the working source takes no clause');
  assert.equal(working?.when, undefined, 'a section\'s when: would hide the steps under it');
  /* NO LINE OF COUNTS SINCE 1.34.0 (3 Nov, "i dont like those briefs at all, remove them"): the three lines 1.25.0
     drew over At work and Up next counted what those count themselves, so no note leads the page. */
  assert.deepEqual(blocks.filter((b) => b.kind === 'note' && b.lead === true), []);
  for (const l of LINES) assert.equal(blocks.some((b) => b.body === l), false, `the page still says ${l}`);
});

/**
 * LEFT FOR THE NEXT RUN, SINCE 1.11.0 (AGT-C12 job c): the steps runs left and nobody has taken, read from the record's
 * own `handoffs.open`, the read a new run is handed its step from. The line counts the same steps (`handoffs-open`).
 * As 1.13.0 declared it, cards a step; the host's since 1.14.0 (`panel: left-steps`), one line a step, beside At work
 * (as `BLOCKS_16` holds it); headed Up next and the whole row since 1.17.0.
 */
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

/* UP NEXT SINCE 1.17.0: the same panel the whole row, under At work, where five twelfths beside it wrapped a step to six lines. */
const STEPS_17 = { kind: 'section', heading: 'Up next', icon: 'arrow', span: 12, panel: 'left-steps' };

test('UP NEXT IS THE HOST’S over the steps nobody has taken, the whole row under At work and over Recent runs', () => {
  const blocks = AGENTS_PAGES.agents!.blocks as { kind: string; heading?: string; source?: string; span?: number }[];
  const at = blocks.findIndex((b) => b.heading === 'Up next');
  assert.ok(at > 0, 'no block is headed Up next');
  assert.deepEqual(blocks[at], STEPS_17);
  assert.deepEqual([blocks[at - 1]!.heading, blocks[at - 1]!.span], ['Working now', 12], 'the steps are not right under Working now, the whole row');
  assert.deepEqual([blocks[at + 1]!.kind, blocks[at + 1]!.heading], ['section', 'Recent runs'], 'the steps are not right over the runs');
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

  /* NOTHING LEFT: no step, and the figure reads nought. */
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
  /* THE FIGURE AND THE STEPS AGREE: one figure, the record's. NO LINE SAYS IT SINCE 1.34.0: Up next counts itself. */
  assert.equal(reading(k, 'handoffs-open'), 2);
  assert.equal(drawn.matched, 2);
  assert.deepEqual(lines(), [], 'the page still opens on a line of counts');
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

test('A RUN IS SAID BY WHAT IT DID: the page draws no card of one, a finished run is counted, a helper and an empty run are not, and no card prints a path', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(k));
  const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
  const HOUR = 60;
  const WEEK = 7 * 24 * HOUR;
  /* PLANTED AS THE SEED PLANTS A RUN, the fields only the record writes stamped (`openRun` in `src/index.ts`). */
  const run = (fields: Record<string, unknown>, stamp: Record<string, unknown>) => value(k.create('session', fields as never, { actor: 'p_seed', stamp } as never));
  const PATHS = '/Users/x/work/batch.workflow.js wf_01ABC';
  run({ doing: 'Claude run', agent: 'claude', state: 'active' }, { last_seen: ago(3), wrote: 1 });
  run({ doing: 'Fixing the invoice totals', agent: 'codex', state: 'active' }, { last_seen: ago(5), wrote: 4 });
  run({ doing: PATHS, agent: 'claude', state: 'active', next: 'Run work/batch.workflow.js again for wf_01ABC' }, { last_seen: ago(7), wrote: 2 });
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
  const role = (b: Card, as: string) => (b.columns ?? []).filter((c) => c.as === as).map((c) => c.field);

  /* NO CARD OF A RUN ON THE PAGE SINCE 1.17.0: At work is the host's live part (`panel: presence`) and the runs that
     stopped are the host's rows under Recent runs (`panel: run-list`), which title a run by what it did as these cards did. */
  assert.equal(page.filter((b) => b.kind === 'cards').length, 0, 'the page still draws cards of runs');
  assert.equal((page.find((b) => b.heading === 'Working now') as Card & { panel?: string }).panel, 'presence');

  /* THE FIGURE STILL COUNTS THE RUN THAT ENDED TODAY AND WROTE, not the one that wrote nothing, nor the helper, nor a working run. */
  assert.equal(reading(k, 'runs-today'), 1, 'the figure of the runs that stopped today counts other runs');

  /* THE CARDS 1.16.0 DREW UNDER EARLIER, read as the record reads them still: the eight that ended last week, six drawn,
     the latest first, all eight counted, and what each said with nothing where the words are a path. */
  const earlier = k.block(BLOCKS_16.find((b) => b.kind === 'cards' && b.where === AGENTS_MODULE.RUNS_EARLIER) as never) as unknown as Card;
  assert.deepEqual(role(earlier, 'who'), ['agent']);
  assert.deepEqual([role(earlier, 'reply'), role(earlier, 'scope')], [['doing_said'], ['project']]);
  assert.deepEqual(earlier.rows.map((r) => r.fields.doing), week.slice(0, 6));
  assert.deepEqual(earlier.rows.map((r) => r.fields.doing_said), week.slice(0, 6).map((d) => (d.includes('/') ? '' : d)));
  assert.deepEqual([earlier.matched, reading(k, 'runs-earlier')], [8, 8], 'the runs of other days are not counted');

  /* AND NOTHING A CARD DRAWS IS A PATH OR AN ID, as the columns name them. */
  const drawn = [earlier].flatMap((b) => b.rows.flatMap((r) => (b.columns ?? []).map((c) => String(r.fields[c.field] ?? ''))));
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
 * learned that opens it, and Needs a look's line of what is here twice (`stale-rows-same`). Taken out again
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
 * AND THE PAGE AS IT STOOD BEFORE THE UI PASS OF 20 OCTOBER (agents F7): the lanes over the last 24 hours with no
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
/** AND 1.15.0 AS IT WAS CUT: three lines on the machines at work, where 1.16.0 names who is at work on what. */
const LINES_15: Loose[] = [
  { kind: 'note', lead: true, span: 12, when: { metric: 'machines-working', gt: 1 }, body: '{{runs-working}} at work on {{machines-working}} machines, {{runs-waiting}} waiting on you, {{handoffs-open}} step(s) left for the next run' },
  { kind: 'note', lead: true, span: 12, when: { metric: 'machines-working', is: 1 }, body: '{{runs-working}} at work on one machine, {{runs-waiting}} waiting on you, {{handoffs-open}} step(s) left for the next run' },
  { kind: 'note', lead: true, span: 12, when: { metric: 'machines-working', is: 0 }, body: 'No agent is at work right now, {{runs-waiting}} waiting on you, {{handoffs-open}} step(s) left for the next run' },
];
/** AND 1.18.0 AS IT WAS CUT, under every older version: the line with nobody working says Nobody at work, where 1.19.0 says Nobody working right now. */
const NOBODY_18 = 'Nobody at work. {{handoffs-open}} step(s) up next';
/** AND 1.19.0 AS IT WAS CUT, under every older version: the runs open now headed At work, where 1.20.0 heads them Open now. */
const OPEN_NOW = '"heading":"Open now"';
/** 1.20.0 AS IT WAS CUT: a learning arrived this month by the day the record wrote it alone, and each card on How the
    brain changed carried what taught it under its line. */
const BECAUSE_20 = { field: 'because', as: 'reply' };
/** 1.21.0 AS IT WAS CUT: the Keys list, its count and the notes about a key said vault, and linked to /vault. */
const WORDS_21: [string, string][] = [
  ['sealed in the Keychain or kept somewhere named', 'sealed in the vault or kept somewhere named'],
  ['Keys sealed in the Keychain', 'Keys sealed in the vault'],
  ['[Add it in the Keychain](/keychain)', '[Add it in the vault](/vault)'],
  ['[Add them in the Keychain](/keychain)', '[Add them in the vault](/vault)'],
  ['Move it to the Keychain.', 'Move it to the vault.'],
  ['Move each to the Keychain.', 'Move each to the vault.'],
];
/** Agents 1.22.0's lists: 1.28.0's with no `account` field on Keys. */
const registers22 = (): typeof AGENTS_REGISTERS => {
  /* WITHOUT 1.28.0'S LABELS, which came after: a tool's kinds and how it runs said in words, and Transport's own name. */
  /* AS THE MODULE HELD THEM IN 1.28.0: by id, the id first, without the `tags` every list is given when it is declared. */
  let text = JSON.stringify(
    Object.fromEntries(
      doc28().declarations.flatMap((d) => {
        if (typeof d.register !== 'string') return [];
        const { register, ...rest } = d;
        return [[register, { id: register, ...rest, fields: (rest.fields as unknown[]).slice(0, -1) }]];
      }),
    ),
  );
  for (const labels of LABELS_28) text = text.split(labels).join('');
  const regs = JSON.parse(text.replace('"label":"How it runs"', '"label":"Transport"')) as typeof AGENTS_REGISTERS;
  const credentials = regs.credentials!;
  return { ...regs, credentials: { ...credentials, fields: credentials.fields.filter((f) => f.id !== 'account') } };
};
/** 1.24.0'S TWO SECTIONS, by their keys and the page each stands on: Accepted unchanged on Agents, Over time on How the brain changed. */
const ADDED_24: [string, string][] = [
  ['agents', 'kept'],
  ['brain', 'timeline'],
];
/** 1.26.0'S WORDS, now and as 1.25.0 said them: keys past their day as a sentence, unused tools in words, and How the
    brain changed's line saying how many learnings are in use beside how many arrived (round 1030, Q55). */
const WORDS_26: [string, string][] = [
  [
    JSON.stringify({ kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-expired', is: 1 }, body: '1 key is past its day. Renew or retire it.' }) +
      ',' +
      JSON.stringify({ kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-expired', gt: 1 }, body: '{{keys-expired}} keys are past their day. Renew or retire each.' }),
    JSON.stringify({ kind: 'note', tone: 'warn', span: 12, when: { metric: 'keys-expired', gt: 0 }, body: 'Keys past their day: {{keys-expired}}. Renew or retire each.' }),
  ],
  ['{{tools-unseen}} tool(s) not used for a month. Retire any you no longer need.', 'Tools not seen in a month: {{tools-unseen}}. Retire any you no longer use.'],
  [
    '{{learnings-arrived}} learning(s) arrived this month, {{learnings-active}} in use in all, {{skills-changed}} skill(s) changed, {{learnings-faded}} faded',
    '{{learnings-arrived}} learning(s) arrived this month, {{skills-changed}} skill(s) changed, {{learnings-faded}} faded',
  ],
  [
    'Nothing new this month, {{learnings-active}} learning(s) in use in all, {{skills-changed}} skill(s) changed, {{learnings-faded}} faded',
    'No learning arrived this month, {{skills-changed}} skill(s) changed, {{learnings-faded}} faded',
  ],
];
/** 1.25.0'S FIRST LINE, now and as 1.24.0 said it: the runs open and quiet counted beside the ones working (Q4). */
const LINES_25 = [
  { kind: 'note', lead: true, span: 12, when: { metric: 'runs-working', gt: 0 }, body: '{{runs-working}} working, {{runs-waiting}} open and quiet, {{handoffs-open}} step(s) up next' },
  { kind: 'note', lead: true, span: 12, when: { all: [{ metric: 'runs-working', is: 0 }, { metric: 'runs-waiting', gt: 0 }] }, body: 'Nobody working right now, {{runs-waiting}} open and quiet, {{handoffs-open}} step(s) up next' },
  { kind: 'note', lead: true, span: 12, when: { all: [{ metric: 'runs-working', is: 0 }, { metric: 'runs-waiting', is: 0 }] }, body: 'Nobody working right now. {{handoffs-open}} step(s) up next' },
];
const LINES_24 = [
  { kind: 'note', lead: true, span: 12, when: { metric: 'runs-working', gt: 0 }, body: '{{runs-working}} at work, {{handoffs-open}} step(s) up next' },
  { kind: 'note', lead: true, span: 12, when: { metric: 'runs-working', is: 0 }, body: 'Nobody working right now. {{handoffs-open}} step(s) up next' },
];
/** 1.28.0'S LABELS, each as it sits in a field: a tool's kinds and how a tool runs, said in words. A key's kinds are said by
    the app (`enumWords`): a label map naming `api_token` is refused as a secret in a pack. */
const LABELS_28 = [
  ',"labels":{"mcp":"MCP server","cli":"Command line","integration":"Integration"}',
  ',"labels":{"stdio":"Runs on your machine","http":"Reached over the web"}',
];
/** Agents 1.27.0, which is 1.28.0 with no labels on those three fields and a tool's transport labelled Transport. */
/**
 * AGENTS 1.28.0 AS IT SHIPPED (6cffdb14f), FROZEN AT THE MARK BELOW. Every version under it is worked back from this and
 * not from today's document, which moved past it on 1 November: each later version would otherwise have to undo all
 * that came after it, and a change to a page that no version under 1.28.0 knows of broke all of them at once.
 */
const doc28 = (): { version: string; declarations: Record<string, unknown>[] } =>
  JSON.parse(readFileSync(new URL('./fixtures/agents-1.28.0.json', import.meta.url), 'utf8')) as { version: string; declarations: Record<string, unknown>[] };
/** One kind of 1.28.0's parts, by its name in the order it declares them, as the module held them then. */
const partsOf28 = (kind: 'page' | 'metric'): [string, Record<string, unknown>][] =>
  doc28().declarations.flatMap((d) => (typeof d[kind] === 'string' ? [[d[kind] as string, d] as [string, Record<string, unknown>]] : []));
const doc27 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc28();
  let text = JSON.stringify(doc.declarations);
  for (const labels of LABELS_28) {
    assert.equal(text.split(labels).length, 2, `doc27 was handed a document without ${labels}`);
    text = text.split(labels).join('');
  }
  assert.equal(text.split('"label":"How it runs"').length, 2, 'doc27 was handed a document whose transport is not How it runs');
  return { ...doc, version: '1.27.0', declarations: JSON.parse(text.replace('"label":"How it runs"', '"label":"Transport"')) as Record<string, unknown>[] };
};
/** 1.27.0'S HEADING, now and as 1.26.0 said it: the runs open now headed Working now, as Today heads them. */
const WORKING_NOW = '"heading":"Working now"';
/** Agents 1.26.0, which is 1.27.0 with the runs open now headed Open now. */
const doc26 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc27();
  const text = JSON.stringify(doc.declarations);
  assert.equal(text.split(WORKING_NOW).length, 2, 'doc26 was handed a document that does not head one tile Working now');
  return { ...doc, version: '1.26.0', declarations: JSON.parse(text.replace(WORKING_NOW, OPEN_NOW)) as Record<string, unknown>[] };
};
/** Agents 1.25.0, which is 1.26.0 in 1.25.0's words. */
const doc25 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc26();
  let text = JSON.stringify(doc.declarations);
  for (const [now, was] of WORDS_26) {
    assert.ok(text.includes(now), `doc25 was handed a document that does not say ${now}`);
    text = text.split(now).join(was);
  }
  return { ...doc, version: '1.25.0', declarations: JSON.parse(text) as Record<string, unknown>[] };
};
/** Agents 1.24.0, which is 1.25.0 with the first line as two notes on the runs working alone. */
const doc24 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc25();
  const now = LINES_25.map((l) => JSON.stringify(l)).join(',');
  const text = JSON.stringify(doc.declarations);
  assert.ok(text.includes(now), 'doc24 was handed a document whose first line is not 1.25.0\'s');
  return { ...doc, version: '1.24.0', declarations: JSON.parse(text.split(now).join(LINES_24.map((l) => JSON.stringify(l)).join(','))) as Record<string, unknown>[] };
};
/** Agents 1.23.0, which is 1.24.0 without Accepted unchanged and Over time. */
const doc23 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc24();
  const declarations = doc.declarations.map((d) => {
    const keys = ADDED_24.filter(([page]) => page === d.page).map(([, key]) => key);
    if (keys.length === 0) return d;
    const blocks = d.blocks as { key?: string }[];
    for (const key of keys) assert.ok(blocks.some((b) => b.key === key), `doc23 was handed a document whose ${String(d.page)} page has no ${key}`);
    return { ...d, blocks: blocks.filter((b) => !keys.includes(b.key ?? '')) };
  });
  return { ...doc, version: '1.23.0', declarations };
};
/** Agents 1.22.0, which is 1.23.0 with no `account` field on Keys. */
const doc22 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc23();
  const declarations = doc.declarations.map((d) => {
    if (d.register !== 'credentials') return d;
    const fields = d.fields as { id: string }[];
    assert.ok(fields.some((f) => f.id === 'account'), 'doc22 was handed a document whose Keys has no account field');
    return { ...d, fields: fields.filter((f) => f.id !== 'account') };
  });
  return { ...doc, version: '1.22.0', declarations };
};
const doc21 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc22();
  let text = JSON.stringify(doc.declarations);
  for (const [now, was] of WORDS_21) {
    assert.ok(text.includes(now), `doc21 was handed a document that does not say "${now}"`);
    text = text.split(now).join(was);
  }
  return { ...doc, version: '1.21.0', declarations: JSON.parse(text) as Record<string, unknown>[] };
};
const doc20 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc21();
  const back = (b: Record<string, unknown>): Record<string, unknown> => {
    if (b.key !== 'changed' && b.key !== 'faded-learnings') return b;
    const columns = b.columns as Record<string, unknown>[];
    return { ...b, columns: [columns[0], BECAUSE_20, ...columns.slice(1)] };
  };
  const declarations = doc.declarations.map((d) =>
    d.metric === 'learnings-arrived'
      ? { ...d, where: 'created_at after -30d' }
      : d.page === 'brain'
        ? { ...d, blocks: (d.blocks as Record<string, unknown>[]).map(back) }
        : d,
  );
  return { ...doc, version: '1.20.0', declarations };
};
const doc19 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc20();
  assert.equal(JSON.stringify(doc.declarations).split(OPEN_NOW).length, 2, 'doc19 was handed a document that is not 1.20.0');
  return { ...doc, version: '1.19.0', declarations: JSON.parse(JSON.stringify(doc.declarations).replace(OPEN_NOW, '"heading":"At work"')) };
};
const doc18 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc19();
  assert.ok(JSON.stringify(doc.declarations).includes(JSON.stringify(NOBODY_19)), 'doc18 was handed a document that is not 1.19.0');
  return { ...doc, version: '1.18.0', declarations: JSON.parse(JSON.stringify(doc.declarations).replace(JSON.stringify(NOBODY_19), JSON.stringify(NOBODY_18))) };
};
/** AND 1.17.0 AS IT WAS CUT: a key's value headed Sealed value, where 1.18.0 says Locked value. */
const doc17 = (): { version: string; declarations: Record<string, unknown>[] } => {
  const doc = doc18();
  assert.ok(JSON.stringify(doc.declarations).includes('"label":"Locked value"'), 'doc17 was handed a document that is not 1.18.0');
  return { ...doc, version: '1.17.0', declarations: JSON.parse(JSON.stringify(doc.declarations).replace('"label":"Locked value"', '"label":"Sealed value"')) };
};
/**
 * AND 1.16.0 AS IT WAS CUT, put back first of all: 1.17.0 took most of the page's blocks away and renamed two more, so the
 * page is put back whole from the file it was written to (`BLOCKS_16`), and only the page: no list, field or figure moved.
 */
const back17 = (blocks: Loose[]): Loose[] => {
  assert.ok(blocks.some((b) => b.heading === 'Up next'), 'back17 was handed a page that is not 1.17.0');
  return structuredClone(BLOCKS_16);
};
const as16 = (declarations: Record<string, unknown>[]): Record<string, unknown>[] =>
  declarations.map((d) => (d.page === 'agents' ? { ...d, blocks: back17(d.blocks as Loose[]) } : d));
const back16 = (blocks: Loose[]): Loose[] =>
  (blocks.some((b) => b.heading === 'Up next') ? back17(blocks) : blocks).flatMap((b) => (b.lead === true && (b.when as { metric?: string } | undefined)?.metric === 'runs-working' ? ((b.when as { gt?: number }).gt === 0 ? LINES_15 : []) : [b]));
const as15 = (declarations: Record<string, unknown>[]): Record<string, unknown>[] =>
  declarations.map((d) => (d.page === 'agents' ? { ...d, blocks: back16(d.blocks as Loose[]) } : d));
/** AND 1.14.0 AS IT WAS CUT: the queue of what runs asked headed Needs you, where 1.15.0 heads it Your agents asked. */
const back15 = (blocks: Loose[]): Loose[] => back16(blocks).map((b) => (b.kind === 'queue' && b.heading === 'Your agents asked' ? { ...b, heading: 'Needs you' } : b));
const as14 = (declarations: Record<string, unknown>[]): Record<string, unknown>[] =>
  declarations.map((d) => (d.page === 'agents' ? { ...d, blocks: back15(d.blocks as Loose[]) } : d));
/** The two lines 1.16.0 declares, one drawn: who is at work on what, or nobody. */
const LINES_16 = [
  '{{runs-working.names}} is at work. {{runs-waiting}} run(s) are waiting for your reply, {{handoffs-open}} step(s) left for the next run',
  'No agent is at work right now. {{runs-waiting}} run(s) are waiting for your reply, {{handoffs-open}} step(s) left for the next run',
];
const back14 = (blocks: Loose[]): Loose[] => {
  const out: Loose[] = [];
  for (const b of back15(blocks)) {
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
  const doc = { declarations: before13((doc17() as { declarations: Record<string, unknown>[] }).declarations) };
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
  assert.equal(mark(partsOf28('page').filter(([slug]) => slug !== 'agents' && slug !== 'brain')), 'c0ba8121ad6e909f', 'a skill’s page or a run’s is changed');
  assert.equal(mark(listsBefore13(JSON.parse(JSON.stringify(registers22()).replace('"label":"Locked value"', '"label":"Sealed value"').replace('sealed in the Keychain or kept somewhere named', 'sealed in the vault or kept somewhere named')))), 'dd24d88e551ccf5d', 'a list or a field is changed');
  /* WITHOUT 1.13.0'S FOUR, which came last of the figures this add-on writes itself and before the door's. */
  const figures12 = Object.fromEntries(
    partsOf28('metric')
      .filter(([id]) => !FIGURES_13.includes(id))
      /* THE UI PASS OF 21 OCTOBER COUNTS EVERY KEY NOT RETIRED, as the Vault does; put the live-only clause back. */
      .map(([id, f]) => [id, id === 'keys-nowhere' ? { ...f, where: 'state is live, value is empty, where is empty' } : id === 'keys-sealed' ? { ...f, name: 'Keys sealed in the vault' } : f]),
  );
  assert.equal(mark({ ...figures12, ...FIGURES_11 }), 'f59d74ab2bdc01ce', 'a figure went or is changed');
  assert.equal(partsOf28('metric').length, 25, 'a figure went or came');
  /* `runs-left-next` STAYS DECLARED, for an agent that reads it, though no block draws on it. */
  assert.ok(AGENTS_MODULE.AGENTS_METRICS['runs-left-next']);
  assert.equal(JSON.stringify(AGENTS_PAGES.agents!.blocks).includes('runs-left-next'), false, 'the page still counts steps its own way');
});

/**
 * EARLIER WAS A FOLD OF ITS OWN FROM 1.11.0 TO 1.16.0, and What the brain learned another: three folded tiles of one
 * weight at the foot. Since 1.17.0 nothing is folded: the runs of other days are Recent runs' rows and door, and the
 * foot is one line of doors that is drawn on a quiet record too.
 */
test('NOTHING IS FOLDED SINCE 1.17.0, and the foot is one line of doors, How the brain changed first', async () => {
  const blocks = AGENTS_PAGES.agents!.blocks as { kind: string; key?: string; heading?: string; fold?: boolean; box?: boolean; body?: string; when?: unknown }[];
  assert.equal(blocks.filter((b) => b.fold === true || b.box === true).length, 0, 'a part of the page is folded or boxed');
  /* THE FOOT: after Recent runs and, since 1.24.0, Accepted unchanged under it, one line, drawn on a quiet record too,
     its first door How the brain changed. */
  const runs = blocks.findIndex((b) => b.heading === 'Recent runs');
  assert.equal(blocks[runs + 1]!.key, 'kept', 'Accepted unchanged is not right under Recent runs');
  const foot = blocks[runs + 2]!;
  assert.deepEqual([foot.kind, foot.key, foot.when], ['note', 'brain-link', undefined]);
  assert.deepEqual(
    [...String(foot.body).matchAll(/\]\(([^)]+)\)/gu)].map((m) => m[1]),
    ['/p/brain', '/r/learnings', '/r/skills', '/r/tools', '/keychain'],
  );
  /* AFTER IT ONLY THE KEY AND TOOL LINES, each drawn only while its figure is above nought. */
  for (const b of blocks.slice(runs + 3)) assert.deepEqual([b.kind, typeof b.when], ['note', 'object'], 'something but a warning line follows the foot');
  /* A FRESH RECORD DRAWS THE FOOT AND NO WARNING. */
  const fresh = await empty();
  value(await fresh.k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(fresh.k));
  const page = opened(fresh.k, 'agents') as (Drawn & { drawn?: boolean; key?: string })[];
  const drawnFoot = page.find((b) => b.key === 'brain-link');
  assert.ok(drawnFoot && drawnFoot.drawn !== false, 'the foot is not drawn on a quiet record');
  assert.deepEqual(page.filter((b) => b.kind === 'note' && !(b as { lead?: boolean }).lead && b.key !== 'brain-link' && b.drawn !== false), [], 'a warning is drawn on a fresh record');
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
   `batch6Back` puts back, and again for the redesign (agents F7, SF12; it was 37af65a2925448e1): the lanes
   today's alone with no cards under them, the scope with no label, and the key lines one for one and one for many,
   which `uiPassBack` puts back, and again for the control room (agents and MCP plan §7.1; it was c616a819e2f84bb8): the
   box to tell an agent in and Working as the host's live runs, which `controlRoomBack` puts back, and again for the
   runs list (it was e051523f0cd521af): Today’s runs holding every run with Undo as the host's `panel: run-list`, which
   `runsListBack` puts back. */
test('AGENTS 1.13.0 DECLARES WHAT IT DID WHEN IT WAS CUT, and 1.12.0 under it is as it was', () => {
  const doc = doc17() as { version: string; declarations: Record<string, unknown>[] };
  assert.equal(mark(as13(doc.declarations)), '6d4c197a9e3586aa', 'something 1.13.0 declared is changed beside what 1.14.0 moved');
  assert.equal(mark(before13(doc.declarations)), '42ceb4a21591e2e8', 'something 1.12.0 declared is changed beside what 1.13.0 put in');
  assert.equal(doc.declarations.length - before13(doc.declarations).length, 5, '1.13.0 put in a page and four figures');
});

/* WHAT 1.14.0 DECLARES, AS ONE MARK, and 1.13.0 under it read with what 1.14.0 moved put back (`back14`): the line on the
   machines at work, At work beside the steps, the steps, the day and the machines as the host's. A change before 1.14.0
   is released sets the mark again and says what moved; one after it is a version with a mark of its own. */
const MARK_14 = '44814963f8550841';
test('AGENTS 1.14.0 DECLARES WHAT IT DID WHEN IT WAS CUT, and moved no list, field or figure', () => {
  const doc = doc17() as { version: string; declarations: Record<string, unknown>[] };
  assert.equal(mark(as14(doc.declarations)), MARK_14, 'something 1.14.0 declared is changed beside what 1.15.0 moved');
  assert.equal(as13(doc.declarations).length, doc.declarations.length, '1.14.0 put in or took out a declaration');
  for (const [i, d] of doc.declarations.entries()) if (d.page !== 'agents') assert.equal(mark(d), mark(as13(doc.declarations)[i]), `${String(d.id ?? d.metric ?? d.page)} changed`);
});

/* WHAT 1.15.0 DECLARES, AS ONE MARK: 1.14.0 with the queue of what runs asked headed Your agents asked (`back15`). */
const MARK_15 = '2b5602af7bd88e59';
test('AGENTS 1.15.0 DECLARES WHAT IT DID WHEN IT WAS CUT, and moved no list, field or figure', () => {
  const doc = doc17() as { version: string; declarations: Record<string, unknown>[] };
  assert.equal(mark(as15(doc.declarations)), MARK_15, 'something 1.15.0 declared is changed beside what 1.16.0 moved');
  assert.equal(as14(doc.declarations).length, doc.declarations.length, '1.15.0 put in or took out a declaration');
});

/* WHAT 1.16.0 DECLARES, AS ONE MARK: 1.15.0 with the line naming who is at work on what (`back16`), read with the page
   1.17.0 took apart put back (`back17`). */
const MARK_16 = 'ba20285de8c8400c';
test('AGENTS 1.16.0 DECLARES WHAT IT DID WHEN IT WAS CUT, and moved no list, field or figure', () => {
  const doc = doc17() as { version: string; declarations: Record<string, unknown>[] };
  assert.equal(mark(as16(doc.declarations)), MARK_16, 'something 1.16.0 declared is changed beside what 1.17.0 moved');
  assert.equal(as15(doc.declarations).length, doc.declarations.length, '1.16.0 put in or took out a declaration');
  for (const [i, d] of doc.declarations.entries()) if (d.page !== 'agents') assert.equal(mark(d), mark(as15(doc.declarations)[i]), `${String(d.id ?? d.metric ?? d.page)} changed`);
});

/* WHAT 1.17.0 DECLARES, AS ONE MARK: the runs console (`back17` puts 1.16.0's page back). A change before 1.17.0 is
   released sets the mark again and says what moved; one after it is a version with a mark of its own. */
const MARK_17 = 'aee177d1b677edf3';
test('AGENTS 1.17.0 DECLARES WHAT IT DID WHEN IT WAS CUT, and moved no list, field or figure', () => {
  const doc = doc17() as { version: string; declarations: Record<string, unknown>[] };
  assert.equal(doc.version, '1.17.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_17, 'the Agents add-on changed what it declares with no new version');
  assert.equal(as16(doc.declarations).length, doc.declarations.length, '1.17.0 put in or took out a declaration');
  for (const [i, d] of doc.declarations.entries()) if (d.page !== 'agents') assert.equal(mark(d), mark(as16(doc.declarations)[i]), `${String(d.id ?? d.metric ?? d.page)} changed`);
});

/* WHAT 1.18.0 DECLARES, AS ONE MARK: 1.17.0 with a key's value headed Locked value (`doc17` puts Sealed value back). */
const MARK_18 = 'd39b5d923b195fd1';
test('AGENTS 1.18.0 DECLARES WHAT IT DID WHEN IT WAS CUT, and changed one heading only', () => {
  const doc = doc18();
  assert.equal(doc.version, '1.18.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_18, 'the Agents add-on changed what it declares with no new version');
  const was = doc17().declarations;
  assert.equal(was.length, doc.declarations.length, '1.18.0 put in or took out a declaration');
  assert.equal(doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).length, 1, '1.18.0 changed more than the list of keys');
});

/* WHAT 1.19.0 DECLARES, AS ONE MARK: 1.18.0 with the line with nobody working in its new words (`doc18` puts them back). */
const MARK_19 = '03bffb36eb12f3ae';
test('AGENTS 1.19.0 DECLARES WHAT IT DID WHEN IT WAS CUT, and changed the Agents page only', () => {
  const doc = doc19();
  assert.equal(doc.version, '1.19.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_19, 'the Agents add-on changed what it declares with no new version');
  const was = doc18().declarations;
  assert.equal(was.length, doc.declarations.length, '1.19.0 put in or took out a declaration');
  assert.deepEqual(doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page), ['agents'], '1.19.0 changed more than the Agents page');
});

/* WHAT 1.20.0 DECLARES, AS ONE MARK: 1.19.0 with the runs open now headed Open now (`doc19` puts At work back). a review (`agents-390-light.png`): "Nobody working right now." over a tile called At work holding
   three quiet runs. */
const MARK_20 = 'cdd44094356440d8';
test('AGENTS 1.20.0 HEADS THE RUNS OPEN NOW OPEN NOW, and changed that heading only', () => {
  const doc = doc20();
  assert.equal(doc.version, '1.20.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_20, 'the Agents add-on changed what it declares with no new version');
  const blocks = (doc.declarations.find((d) => d.page === 'agents')!.blocks ?? []) as { heading?: string; panel?: string }[];
  assert.deepEqual(blocks.filter((b) => b.panel === 'presence').map((b) => b.heading), ['Open now'], 'the runs open and quiet are under a tile called At work');
  const was = doc19().declarations;
  assert.equal(was.length, doc.declarations.length, '1.20.0 put in or took out a declaration');
  assert.deepEqual(doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page), ['agents'], '1.20.0 changed more than the Agents page');
});

/* WHAT 1.21.0 DECLARES, AS ONE MARK: 1.20.0 with a learning arriving this month by its own day too, and How the brain
   changed's cards each a learning's one line (`doc20` puts both back). a review (Y29,
   `brain-390-light-full.png`): "4 learnings arrived this month" over four learnings dated 28 and 29 August, their
   bodies printing code. */
const MARK_21 = '68aebe4d4dbf3368';
test('AGENTS 1.21.0 COUNTS A LEARNING BY ITS OWN DAY TOO AND SHOWS ITS ONE LINE, and changed those only', () => {
  const doc = doc21();
  assert.equal(doc.version, '1.21.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_21, 'the Agents add-on changed what it declares with no new version');
  const brain = (partsOf28('page').find(([slug]) => slug === 'brain')![1] as unknown as { blocks: { key?: string; columns?: { field: string }[] }[] }).blocks;
  for (const key of ['changed', 'faded-learnings'])
    assert.equal(brain.find((b) => b.key === key)!.columns!.some((c) => c.field === 'because'), false, `${key} prints what taught a learning`);
  const was = doc20().declarations;
  assert.equal(was.length, doc.declarations.length, '1.21.0 put in or took out a declaration');
  assert.deepEqual(
    doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page ?? d.metric),
    ['learnings-arrived', 'brain'],
    '1.21.0 changed more than the figure and the page',
  );
});

/* WHAT 1.22.0 DECLARES, AS ONE MARK: 1.21.0 with the Keys list, its count and the notes about a key in the words Keychain and
   /keychain (`doc21` puts vault and /vault back). Vault is now Keychain: words only, no list, field or figure goes. */
const MARK_22 = '6fdd920b1de29525';
test('AGENTS 1.22.0 SAYS KEYCHAIN WHERE 1.21.0 SAID VAULT, and changed those words only', () => {
  const doc = doc22();
  assert.equal(doc.version, '1.22.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_22, 'the Agents add-on changed what it declares with no new version');
  const was = doc21().declarations;
  assert.equal(was.length, doc.declarations.length, '1.22.0 put in or took out a declaration');
  assert.deepEqual(
    doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page ?? d.metric ?? d.register),
    ['credentials', 'keys-sealed', 'agents'],
    '1.22.0 changed more than the Keys list, its count and the Agents page',
  );
});

/* WHAT 1.23.0 DECLARES, AS ONE MARK: 1.22.0 with Keys saying which account a key is for (`doc22` takes it away), a text
   field that is never secret, as a keychain item names its account. No list, field or figure goes. */
const MARK_23 = 'bf08c50a4214038a';
test('AGENTS 1.23.0 GIVES A KEY ITS ACCOUNT, and changed the Keys list only', async () => {
  const doc = doc23();
  assert.equal(doc.version, '1.23.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_23, 'the Agents add-on changed what it declares with no new version');
  const was = doc22().declarations;
  assert.equal(was.length, doc.declarations.length, '1.23.0 put in or took out a declaration');
  assert.deepEqual(
    doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page ?? d.metric ?? d.register),
    ['credentials'],
    '1.23.0 changed more than the Keys list',
  );
  const account = (AGENTS_REGISTERS.credentials!.fields as { id: string; type: string; max?: number }[]).find((f) => f.id === 'account');
  assert.deepEqual(account && { type: account.type, max: account.max }, { type: 'text', max: 280 }, 'the account is not a plain text field');

  /* AND A KEY KEEPS ITS ACCOUNT, while a value shaped like a key is refused there as in every text field. */
  const { k, sql } = await seeded();
  const made = value<{ id: string }>(k.create('credentials', { label: 'Mail login', opens: 'mail.example', kind: 'password', account: 'nadia@example.com' }, { actor: 'p_seed' }));
  assert.equal(k.get(made.id)?.fields.account, 'nadia@example.com');
  const shaped = k.create('credentials', { label: 'Other login', opens: 'other.example', kind: 'api_token', account: 'sk_live_51HxQwErTyUiOpAsDfGhJkLzXcVbNm1234567890abcd' }, { actor: 'p_seed' });
  assert.equal(shaped.ok, false, 'an account shaped like a key was kept');
  sql.close();
});

/* WHAT 1.24.0 DECLARES, AS ONE MARK: 1.23.0 with Accepted unchanged on Agents and Over time on How the brain changed
   (`doc23` takes both away), each a section the host draws. No list, field or figure goes. */
const MARK_24 = '8d0db59cbe536d16';
test('AGENTS 1.24.0 ADDS ACCEPTED UNCHANGED AND OVER TIME, and changed those two pages only', () => {
  const doc = doc24();
  assert.equal(doc.version, '1.24.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_24, 'the Agents add-on changed what it declares with no new version');
  const was = doc23().declarations;
  assert.equal(was.length, doc.declarations.length, '1.24.0 put in or took out a declaration');
  assert.deepEqual(
    doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page ?? d.metric ?? d.register),
    ['agents', 'brain'],
    '1.24.0 changed more than the Agents page and How the brain changed',
  );
});

/* WHAT 1.25.0 DECLARES, AS ONE MARK: 1.24.0 with the first line counting the runs open and quiet beside the ones working
   (`doc24` puts the two old notes back). Words only: no list, field or figure goes. */
const MARK_25 = 'f5dc972f3a40c3ea';
test('AGENTS 1.25.0 COUNTS THE RUNS OPEN AND QUIET IN THE FIRST LINE, and changed the Agents page only', () => {
  const doc = doc25();
  assert.equal(doc.version, '1.25.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_25, 'the Agents add-on changed what it declares with no new version');
  const was = doc24().declarations;
  assert.equal(was.length, doc.declarations.length, '1.25.0 put in or took out a declaration');
  assert.deepEqual(doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page ?? d.metric ?? d.register), ['agents'], '1.25.0 changed more than the Agents page');
});

/* WHAT 1.26.0 DECLARES, AS ONE MARK: 1.25.0 with keys past their day and unused tools said in sentences, and How the
   brain changed saying how many learnings are in use (`doc25` puts 1.25.0's words back). No list, field or figure goes. */
const MARK_26 = 'fa4e81a08546eb82';
test('AGENTS 1.26.0 SAYS KEYS PAST THEIR DAY AND LEARNINGS IN USE IN WORDS, and changed those two pages only', () => {
  const doc = doc26();
  assert.equal(doc.version, '1.26.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_26, 'the Agents add-on changed what it declares with no new version');
  const was = doc25().declarations;
  assert.equal(was.length, doc.declarations.length, '1.26.0 put in or took out a declaration');
  assert.deepEqual(
    doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page ?? d.metric ?? d.register),
    ['agents', 'brain'],
    '1.26.0 changed more than the Agents page and How the brain changed',
  );
});

/* WHAT 1.27.0 DECLARES, AS ONE MARK: 1.26.0 with the runs open now headed Working now, as Today heads them (`doc26`
   puts Open now back; the recheck of 30 October, 26). No list, field or figure goes. */
const MARK_27 = '6246ac0d01ef5b63';
test('AGENTS 1.27.0 HEADS THE RUNS WORKING NOW, as Today does, and changed that heading only', () => {
  const doc = doc27();
  assert.equal(doc.version, '1.27.0', 'a new version takes a mark of its own beside this one');
  assert.equal(mark(doc.declarations), MARK_27, 'the Agents add-on changed what it declares with no new version');
  const was = doc26().declarations;
  assert.equal(was.length, doc.declarations.length, '1.27.0 put in or took out a declaration');
  assert.deepEqual(
    doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page ?? d.metric ?? d.register),
    ['agents'],
    '1.27.0 changed more than the Agents page',
  );
});

/* WHAT 1.28.0 DECLARES, AS ONE MARK: 1.27.0 with a tool's transport said as How it runs, Runs on your machine or Reached
   over the web, a tool's kind as MCP server or Command line, and a key's kind as the Keychain says it (`doc27` takes the
   labels off). Words only: no value, list, field or figure goes. */
const MARK_28 = '07b1f98a44d50d80';
test('AGENTS 1.28.0 SAYS HOW A TOOL RUNS AND ITS KIND IN WORDS, and changed Tools only (a key\'s kind is said by the app)', () => {
  const doc = doc28();
  assert.equal(doc.version, '1.28.0', 'the frozen 1.28.0 is not 1.28.0');
  assert.equal(mark(doc.declarations), MARK_28, 'the frozen 1.28.0 is not what shipped');
  const was = doc27().declarations;
  assert.equal(was.length, doc.declarations.length, '1.28.0 put in or took out a declaration');
  assert.deepEqual(
    doc.declarations.filter((d, i) => mark(d) !== mark(was[i])).map((d) => d.page ?? d.metric ?? d.register),
    ['tools'],
    '1.28.0 changed more than Tools',
  );
});

/* WHAT THE NEWEST VERSION DECLARES, AS ONE MARK: a change to what Agents declares takes a new version, and that version a
   mark here. 1.34.0 (7438cc7e8) is the newest; each before it is in `changelog.ts`. */
const MARK_NOW = 'cb9b9c129afc7c60';
test('WHAT AGENTS DECLARES IS WHAT ITS VERSION SAYS: 1.34.0, at its mark', () => {
  const doc = agentsPackDocument() as { version: string; declarations: Record<string, unknown>[] };
  assert.equal(doc.version, '1.34.0', 'a new version takes a mark of its own here');
  assert.equal(mark(doc.declarations), MARK_NOW, 'the Agents add-on changed what it declares with no new version');
});

test('A LEARNING BROUGHT IN THIS MONTH WITH AN OLD DAY OF ITS OWN DID NOT ARRIVE THIS MONTH', async () => {
  const { k } = await seeded();
  const figure = () => value<{ value: number }>(k.metric(k.metricDecl('learnings-arrived')!)).value;
  const before = figure();
  const learn = (lesson: string, confirmed_on?: string) =>
    value(k.create('learnings', { lesson, because: 'An invented failure that taught this lesson, long enough.', kind: 'fact', ...(confirmed_on ? { confirmed_on } : {}) }, { actor: 'p_seed' }));
  learn('An invented lesson confirmed long before it was imported.', '2025-08-28');
  assert.equal(figure(), before, 'an August learning imported now was counted as arriving');
  learn('An invented lesson written today with no day of its own.');
  assert.equal(figure(), before + 1);
});

/* THE SKILLS THAT CHANGED, SINCE 1.13.0 (AGT-C17 job c): two figures over the record's log, each skill that took a
   version counted once, said in the line of How the brain changed as a clause of its own and drawn as the chart's
   second series, on the learnings' weeks. A version is taken only by an accepted proposal, so that is how this takes one. */
test('A SKILL THAT TOOK A VERSION IS COUNTED AND DRAWN BESIDE THE LEARNINGS, BY WEEK, with no line saying it', async () => {
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
  /* NO LINE SAYS IT SINCE 1.34.0: the chart's second series counts the skills, and the page opens on no line. */
  for (const key of ['line', 'line-quiet']) assert.equal(page.find((b) => b.key === key), undefined, `the page still has its ${key}`);

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
     (project-own-cards-72): the ones from everywhere followed them here until then, the same three under
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
test('THE KEYS AND TOOLS TO PUT RIGHT ARE LINES AT THE FOOT, each drawn only while its figure is above nought', async () => {
  const declared = AGENTS_PAGES.agents!.blocks as { kind: string; key?: string; heading?: string; box?: boolean; fold?: boolean; tone?: string; when?: { metric?: string }; body?: string }[];
  /* NO TILE HEADED Needs a look SINCE 1.17.0: the four lines of 1.10.0 are loose at the foot, under the doors, and the
     lines of what the record tidies on its own (tidied, stale, here twice) are off the page. */
  assert.equal(declared.filter((b) => b.heading === 'Needs a look').length, 0, 'Needs a look is still a tile');
  const foot = declared.findIndex((b) => b.key === 'brain-link');
  /* THE KEY LINES ARE A PAIR EACH: one for one and one for many. Keys past their day too, since 1.26.0. */
  const PAIRS: readonly string[] = ['keys-nowhere', 'keys-expired', 'keys-in-text'];
  const LINES = NOTES.flatMap((m) => (PAIRS.includes(m) ? [m, m] : [m]));
  assert.deepEqual(declared.slice(foot + 1).map((b) => b.when?.metric), LINES, 'the lines are not at the foot, or not in order');
  for (const gone of ['tidied-week', 'gone-stale', 'stale-rows-same']) assert.equal(noteOn(declared as Drawn[], gone), undefined, `${gone} still nags on the page`);
  for (const metric of NOTES) {
    const pair = PAIRS.includes(metric);
    const note = declared.find((b) => b.kind === 'note' && b.when?.metric === metric && !(b.when as { is?: number }).is)!;
    assert.deepEqual(note.when, { metric, gt: pair ? 1 : 0 });
    assert.equal(note.tone, 'warn', `${metric}'s line is not toned`);
    assert.ok(note.body?.includes(`{{${metric}}}`), `${metric}'s line does not say its number`);
    assert.doesNotMatch(String(note.body), /—|credential|session|\brow\b/iu, `${metric}'s line reads as the machine`);
    /* RIGHT FOR ONE (agents-pack-49): its figure's name, the number, then what to do, so "1 key(s) are past their day"
       is never said. Filled as the host fills it, with one and with many. */
    const name = metric === 'keys-in-text' ? KEYS_IN_TEXT.name : String(AGENTS_MODULE.AGENTS_METRICS[metric]?.name);
    /* THE KEY LINES SAY IT PLAINLY SINCE THE UI PASS: "2 keys have no value. Add them in the Keychain", the way a link. */
    /* UNUSED TOOLS ARE A SENTENCE SINCE 1.26.0 (round 1030): the number, then what it counts, then what to do. */
    if (pair) assert.ok(!note.body?.includes('(s)'), `${metric}'s line says (s)`);
    else if (metric === 'tools-unseen') assert.ok(note.body?.startsWith(`{{${metric}}} tool(s) `), `${metric}'s line does not lead with its number`);
    else assert.ok(note.body?.startsWith(`${name}: `), `${metric}'s line does not lead with its figure's name`);
    for (const n of [1, 3]) {
      const said = String(note.body).replaceAll(`{{${metric}}}`, String(n));
      assert.doesNotMatch(said, /\d+ \w+\(s\) (?:are|is|were|was|hold|holds|have|has)\b/u, `${metric}'s line reads wrong for ${n}: ${said}`);
      assert.match(said, /(?:\.|\]\(\/keychain\))$/u, `${metric}'s line is not a sentence`);
    }
  }
  const bodies = (metric: string) => declared.filter((b) => b.kind === 'note' && b.when?.metric === metric).map((b) => [b.when, b.body]);
  assert.deepEqual(bodies('keys-nowhere'), [
    [{ metric: 'keys-nowhere', is: 1 }, '1 key has no value. [Add it in the Keychain](/keychain)'],
    [{ metric: 'keys-nowhere', gt: 1 }, '{{keys-nowhere}} keys have no value. [Add them in the Keychain](/keychain)'],
  ]);
  assert.deepEqual(bodies('keys-expired'), [
    [{ metric: 'keys-expired', is: 1 }, '1 key is past its day. Renew or retire it.'],
    [{ metric: 'keys-expired', gt: 1 }, '{{keys-expired}} keys are past their day. Renew or retire each.'],
  ]);
  assert.deepEqual(bodies('keys-in-text'), [
    [{ metric: 'keys-in-text', is: 1 }, 'A key is written in plain text in 1 place. Move it to the Keychain.'],
    [{ metric: 'keys-in-text', gt: 1 }, 'Keys are written in plain text in {{keys-in-text}} places. Move each to the Keychain.'],
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
  fresh.sql.close();
});

/**
 * THE STALE LINE, SINCE 1.11.0, TWO LINES IN WORDS SINCE 1.13.0: Needs a look says what the record
 * cleared this week and what is still stale, each finder by finder (`.names`), over the record's own `tidied-week` and
 * `gone-stale`, and each line is drawn only while its own figure is above nought.
 */
test('WHAT WAS TIDIED AND WHAT IS STALE ARE THE RECORD’S FIGURES, said finder by finder, and no line of the Agents page since 1.17.0', async () => {
  /* ON THE PAGE FROM 1.11.0 TO 1.16.0 under Needs a look; off it since 1.17.0, where on his record they were the record
     tidying itself and read as nagging. The figures stay, for Today's tidy line and any agent that reads them. */
  assert.ok(!JSON.stringify(AGENTS_PAGES.agents!.blocks).includes('tidied-week'), 'the page still says what was tidied');
  assert.ok(!JSON.stringify(AGENTS_PAGES.agents!.blocks).includes('gone-stale'), 'the page still says what is stale');
  for (const id of ['gone-stale', 'tidied-week']) {
    assert.ok(Object.hasOwn(BUILT_IN_FIGURES, id), `${id} is not a figure the record holds`);
    assert.equal(AGENTS_MODULE.AGENTS_METRICS[id], undefined, `${id} is declared twice`);
  }

  /* A FRESH RECORD HAS NOTHING STALE AND NOTHING TIDIED: neither figure names anything. */
  const fresh = await empty();
  value(await fresh.k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(fresh.k));
  for (const id of ['tidied-week', 'gone-stale']) assert.equal(named(fresh.k, id), undefined, `${id} names something on a fresh record`);
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
  assert.equal(reading(k, 'gone-stale'), 0);
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
