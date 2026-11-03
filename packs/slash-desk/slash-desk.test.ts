/**
 * Slash on your machine: one job kind that composes a page on a machine the owner enrolled, reading the record through
 * its own door and proposing, and writing nothing.
 *
 * THE KIND IS WHAT THE OWNER APPROVES, and these tests read it as it ships: the kernel's own lint passes it, its prompt
 * holds no key, its tools are the record's read tools and `propose` and nothing that runs a command or opens a file, it
 * asks as every job does and never skips, and no run of it is started before the install that approves it.
 *
 * Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { agentsPackDocument, firstPartyDocument } from '../../packages/seed/src/index.ts';
import { JOB_FILE_TOOLS, JOB_MCP_PREFIX } from '../../packages/kernel/src/jobs.ts';
import { looksLikeCredential } from '../../packages/kernel/src/coerce.ts';
import { jobCard, jobFault } from '../../packages/declare/src/job.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const KIND = 'job.slash-desk';

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[] };
type Decl = Record<string, unknown> & { job: string; prompt: string; tools: string[]; turns: number; permission: string };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./slash-desk.pack.json', import.meta.url);
/** THE KIND LIVES IN JOBS ON YOUR MACHINE NOW (`job-starter` 1.1.0); this add-on is the old id, which hands it there. */
const HOME = new URL('../job-starter/job-starter.pack.json', import.meta.url);
const file = (): Record<string, unknown> => JSON.parse(readFileSync(HOME, 'utf8')) as Record<string, unknown>;
const retired = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;
const kind = (): Decl => {
  const decl = (file().declarations as Record<string, unknown>[]).find((d) => d.job === 'slash-desk') as Decl | undefined;
  assert.ok(decl, 'Jobs on your machine ships the kind');
  return decl;
};

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/** A fresh record with Agents and what it links to, and this add-on when `withPack` says so. */
async function record(withPack = true): Promise<{ api: Api; sql: NodeSql }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  said(
    await api.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF',
      slug: 'loom',
      name: 'Loom',
      tz: 'Europe/Lisbon',
      locale: 'en',
      owner: { id: 'p_1', email: 'tove@example.test', name: 'Tove' },
    }),
  );
  for (const id of ['portfolio', 'people']) await put(api, firstPartyDocument(id, { seeds: [] }));
  await put(api, agentsPackDocument());
  if (withPack) await put(api, file());
  return { api, sql };
}

test('the kind is one of Jobs on your machine, and the old id says it is part of it and hands the job there', () => {
  const doc = file();
  assert.equal(doc.pack, 'job-starter');
  assert.equal(doc.title, 'Jobs on your machine');
  const decl = kind();
  assert.equal(decl.title, 'Compose a page on your machine');
  assert.deepEqual(decl.args, [{ id: 'page', label: 'Page', max: 64 }]);
  const old = retired();
  assert.equal(old.pack, 'slash-desk');
  assert.equal(old.version, '2.0.1');
  assert.match(String(old.summary), /^Now part of Jobs on your machine/u);
  assert.deepEqual(old.declarations, []);
  assert.deepEqual(old.hands, { 'job.slash-desk': 'job-starter' });
});

test("the kernel's own lint passes the kind", () => {
  const decl = kind();
  assert.equal(jobFault({ id: KIND, body: decl as never }), null);
});

test('the prompt names no key and reads as no credential', () => {
  const { prompt } = kind();
  assert.equal(looksLikeCredential(prompt), false);
  assert.doesNotMatch(prompt, /\b(keys?|tokens?|secrets?|passwords?|vault|credentials?)\b/iu);
  assert.match(prompt, /%page%/u, 'the page the owner picked is the one it reads');
  assert.match(prompt, /\bpropose\b/u);
  assert.match(prompt, /Write nothing else/u);
});

test("its tools are the record's read tools and propose, with no shell and no file", () => {
  const { tools } = kind();
  for (const tool of tools) {
    assert.ok(tool.startsWith(JOB_MCP_PREFIX), `${tool} is one of the record's own tools`);
    assert.ok(!tool.startsWith('Bash'), `${tool} runs no command`);
    assert.ok(!(JOB_FILE_TOOLS as readonly string[]).includes(tool), `${tool} opens no file`);
  }
  const names = tools.map((t) => t.slice(JOB_MCP_PREFIX.length)).sort();
  assert.deepEqual(names, ['context', 'get', 'list', 'propose', 'record_index', 'schema', 'search']);
  for (const writes of ['create', 'update', 'log', 'handoff', 'meet', 'triage'])
    assert.ok(!names.includes(writes), `${writes} would write, and this kind writes nothing`);
});

test('it asks as every job does, works in no folder, writes no file, and takes at most thirty turns', () => {
  const decl = kind();
  assert.equal(decl.permission, 'dontAsk');
  assert.equal(decl.repo, undefined);
  assert.notEqual(decl.writes, true);
  assert.equal(decl.turns, 30);
  const card = jobCard(decl);
  assert.equal(card?.repo, null);
  assert.equal(card?.writes, false);
  assert.deepEqual(card?.asks, [{ id: 'page', label: 'Page' }]);
});

test('no run of the kind starts before the install that approves it', async () => {
  const { api, sql } = await record(false);
  const before = (await api.createJob({ kind: KIND, args: { page: 'Kiln firings' } } as never, owner)) as Out;
  assert.equal(before.ok, false);
  assert.equal(before.refusal?.code, 'DECLARATION_UNKNOWN');
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM job')?.n, 0);

  /* A plan read and not approved installs nothing: an install with a hash the plan never answered is refused. */
  const doc = file();
  said(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
  const forged = (await api.installPack({ doc, source: { kind: 'local' }, planHash: '0:nothing' } as never, owner)) as Out;
  assert.equal(forged.ok, false);
  const still = (await api.createJob({ kind: KIND, args: { page: 'Kiln firings' } } as never, owner)) as Out;
  assert.equal(still.refusal?.code, 'DECLARATION_UNKNOWN');
});

test('installed, a press starts one run that waits for a machine', async () => {
  const { api, sql } = await record();
  const row = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'job' AND superseded_at IS NULL", KIND);
  assert.ok(row, 'the install keeps the kind');

  const started = said<{ id: string }>(await api.createJob({ kind: KIND, args: { page: 'Kiln firings' } } as never, owner));
  const job = sql.one<{ status: string; args: string }>('SELECT status, args FROM job WHERE id = ?', started.id);
  assert.equal(job?.status, 'queued', 'it waits for a machine and runs nowhere until one claims it');
  assert.deepEqual(JSON.parse(job?.args ?? '{}'), { page: 'Kiln firings' });

  /* NOTHING ELSE STARTED ONE: the press made one row and the install made none. */
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM job')?.n, 1);

  /* A PAGE IS ONE LINE, as the kind says, and longer is refused in the label the owner reads. */
  const long = (await api.createJob({ kind: KIND, args: { page: 'x'.repeat(65) } } as never, owner)) as Out;
  assert.equal(long.ok, false);
  assert.match(long.refusal?.fix ?? '', /^Page /u);
});

test('an agent never starts one', async () => {
  const { api } = await record();
  const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write' } } as never;
  const got = (await api.createJob({ kind: KIND, args: { page: 'Kiln firings' } } as never, agent)) as Out;
  assert.equal(got.ok, false);
});
