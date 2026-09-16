/**
 * The agents pack: it installs through the pack path, each register refuses what the plan says it
 * refuses, a project's skill hides the global one of the same name, no key row holds a value, and a
 * run in a demo project's folder is placed in that project (`loop/research-agent-path.md` §5.2, §6).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { AGENTS_PACK, AGENTS_REGISTERS, NOW, ROWS, RUNS, agentsPackDocument, declarations, installAgentsPack, installSeed } from '../src/index.ts';

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
  assert.deepEqual(AGENTS_PACK.manifest, { id: 'agents', version: '1.0.0', requires: ['register.things'] });
  const pack = value<Pack>(await normalise(agentsPackDocument()));
  assert.equal(pack.manifest.pack, 'agents');
  assert.equal(pack.manifest.version, '1.0.0');
  assert.deepEqual([...pack.manifest.provides].sort(), PROVIDES);
});

const PROVIDES = ['page.agents', 'page.skill', 'register.credentials', 'register.learnings', 'register.skills', 'register.tools'];

test('THE SEED INSTALLS IT THROUGH THE PACK PATH, and the record says so', async () => {
  const { k, sql } = await seeded();
  assert.deepEqual({ ...k.packs().find((p) => p.id === 'agents') }, { id: 'agents', version: '1.0.0' });
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

test('/p/agents: the runs working now, the newest seen first, then what was learned and the skills in use', async () => {
  const { k, sql } = await seeded();
  const blocks = opened(k, 'agents');
  for (const b of blocks) assert.deepEqual(b.refusals, [], `${b.heading}: ${JSON.stringify(b.refusals)}`);

  const live = RUNS.filter((r) => r.state === 'active' || r.state === 'idle').sort((a, z) => String(z.last_seen).localeCompare(String(a.last_seen)));
  assert.deepEqual(headed(blocks, 'Working now').rows.map((r) => r.fields.doing), live.map((r) => r.doing), 'a finished run is listed, or the order is not by last seen');

  const learnings = headed(blocks, 'Learnings');
  assert.equal(learnings.matched, ROWS.learnings!.filter((r) => (r.state ?? 'active') === 'active').length, 'a superseded learning is counted');
  assert.ok(!headed(blocks, 'Skills').rows.some((r) => r.fields.state === 'retired'), 'a retired skill is listed');
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
  assert.ok(blocks.some((b) => b.kind === 'section' && b.heading === 'Runs on'));
  const said = (heading: string, field: string) => {
    const b = headed(blocks, heading);
    assert.deepEqual(b.refusals, [], `${heading}: ${JSON.stringify(b.refusals)}`);
    return b.rows.map((r, i) => `${String(r.fields[field])} @ ${b.scopes?.[i] ?? 'everywhere'}`);
  };
  const skills = said('Skills', 'name');
  assert.ok(skills.includes('review-pr @ Kiln') && !skills.includes('review-pr @ everywhere'), skills.join(', '));
  assert.ok(!skills.some((s) => s.startsWith('chase-invoice')), 'a retired skill is listed');
  assert.ok(said('Keys', 'label').includes('Nordhaven API @ everywhere'));
  assert.ok(said('Tools', 'name').includes('fenwick @ Kiln'));
  sql.close();
});

test('the People page lists the newest person first, with where they were met', async () => {
  const { k, sql } = await seeded();
  const [everyone] = opened(k, 'people');
  assert.deepEqual(everyone?.refusals, []);
  assert.equal(everyone?.rows[0]?.fields.name, ROWS.people!.at(-1)?.name);
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
