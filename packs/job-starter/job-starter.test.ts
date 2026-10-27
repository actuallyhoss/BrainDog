/**
 * Jobs on your machine (Starter jobs): four kinds of job a person gets by installing one add-on, each approved once in Decide.
 *
 * WHAT IT IS FOR. A record could queue a run on its owner's machine and no add-on declared a single kind, so the sheet
 * "Run a job" had nothing to offer on a fresh record. This file is the first way a stranger reaches a real run: three
 * `job` declarations that only read and propose, installed through the same Decide press as every other add-on.
 *
 * WHAT IS HELD HERE. Each kind passes the declare package's own lint (`jobFault`, which is the kernel's); none skips
 * its permissions, changes a file or names a tool that files or writes; the install waits in Decide and, until it is
 * accepted, no kind can be started by anybody; once accepted each one can; and a copy of a kind that would skip its
 * permissions is refused, by the lint and at the proposal.
 *
 * RED FIRST, MEASURED: with no `job-starter.pack.json` this file failed at its first read, ENOENT, before a test ran.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { jobCard, jobFault } from '../../packages/declare/src/job.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import { createRecordApi, type CallContext, type CatalogueEntry } from '../../packages/record/src/index.ts';

const TEXT = readFileSync(new URL('job-starter.pack.json', import.meta.url), 'utf8');
type Kind = { args?: unknown[]; job: string; title: string; prompt: string; repo?: string; tools: string[]; turns: number; permission: string; writes?: boolean };
const PACK = JSON.parse(TEXT) as { pack: string; version: string; title: string; summary: string; declarations: Kind[] };
const KINDS = PACK.declarations;
const IDS = ['week-in-review', 'inbox-triage', 'repo-status', 'slash-desk'];

const NOW = Date.UTC(2026, 9, 14, 9);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = (r: Out): string => (r.ok ? 'went through' : `${r.refusal?.code} at ${r.refusal?.at}: ${r.refusal?.fix}`);

/** A fresh record whose catalogue offers `doc` as `job-starter`, as Browse offers the file the catalogue published. */
async function recordOf(doc: unknown = PACK) {
  const catalogue: CatalogueEntry[] = [{ id: 'job-starter', kind: 'pack', title: PACK.title, summary: PACK.summary, modules: [], doc: () => doc as never }];
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogue });
  assert.ok(api.kernel.createRecord({ id: REC, slug: 'kiln', name: 'Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  const ask = async (): Promise<Out> => (await api.propose({ question: 'Add Starter jobs?', body_kind: 'pack', body: { install: 'job-starter' } } as never, owner)) as Out;
  const accept = async (filed: Out): Promise<Out> =>
    (await api.decide({ id: (filed.value as { id: string }).id, decide: { option: 'accept', reason: 'Three jobs to try.' } } as never, owner)) as Out;
  const start = async (kind: string): Promise<Out> => (await api.createJob({ kind, ...(kind === 'job.slash-desk' ? { args: { page: 'Kiln firings' } } : {}) } as never, owner)) as Out;
  return { sql, api, ask, accept, start };
}

/** The kinds the record holds and may start, by declaration id. */
const kindsOn = (sql: NodeSql): string[] => sql.all<{ id: string }>("SELECT id FROM declaration WHERE kind = 'job' AND retired = 0 ORDER BY id").map((r) => r.id);

/* ── Red first ─────────────────────────────────────────────────────────────────────────────────── */

test('A FRESH RECORD HOLDS NO KIND OF JOB, so "Run a job" has nothing to offer before this add-on', async () => {
  const { sql, start } = await recordOf();
  assert.deepEqual(kindsOn(sql), []);
  for (const id of IDS) {
    const out = await start(`job.${id}`);
    assert.equal(out.refusal?.code, 'DECLARATION_UNKNOWN', said(out));
  }
  sql.close();
});

/* ── The file ──────────────────────────────────────────────────────────────────────────────────── */

test('THE FILE READS AS A RECORD READS IT, and holds the four kinds and nothing else', async () => {
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'job-starter');
  assert.equal(file.value.pack.manifest.version, '1.1.0');
  assert.equal(PACK.title, 'Jobs on your machine');
  assert.deepEqual(KINDS.map((k) => k.job), IDS);
  assert.ok(KINDS.every((k) => Object.keys(k).includes('job')), 'a declaration here is not a job');
});

test('EACH KIND PASSES THE LINT, under the kernel name rule, and its card reads as Decide shows it', () => {
  for (const k of KINDS) {
    assert.match(k.job, /^[a-z][a-z0-9-]{0,31}$/u, `${k.job} is lower case with a hyphen at most`);
    assert.equal(jobFault({ id: `job.${k.job}`, body: k as never }), null, `job.${k.job}: ${JSON.stringify(jobFault({ id: `job.${k.job}`, body: k as never }))}`);
    const card = jobCard(k);
    assert.ok(card);
    assert.equal(card.permissionSays, 'Uses only the tools listed, and asks nothing.');
    assert.equal(card.writes, false);
    assert.deepEqual(card.asks, k.job === 'slash-desk' ? [{ id: 'page', label: 'Page' }] : [], 'a starter kind asks a person for nothing before it runs, but the page the composer reads');
  }
});

test('NO KIND SKIPS ASKING, CHANGES A FILE OR FILES ANYTHING ITSELF: each one reads and proposes', () => {
  /* THE RECORD'S TOOLS THAT CHANGE IT. `propose` changes nothing; the owner decides in BrainDog. */
  const changing = ['create', 'update', 'triage', 'log', 'handoff', 'meet'].map((t) => `mcp__braindog__${t}`);
  for (const k of KINDS) {
    assert.equal(k.permission, 'dontAsk', `${k.job} asks some other way`);
    assert.notEqual(k.writes, true, `${k.job} says it changes files`);
    assert.ok(k.tools.includes('mcp__braindog__propose'), `${k.job} has no way to propose`);
    assert.deepEqual(k.tools.filter((t) => changing.includes(t)), [], `${k.job} names a tool that changes the record`);
    assert.ok(!k.tools.includes('Bash'), `${k.job} runs any command`);
    assert.match(k.prompt, /propose/u, `${k.job}'s prompt never says to propose`);
    assert.match(k.prompt, /decide/u, `${k.job}'s prompt never leaves the decision to the owner`);
    assert.doesNotMatch(`${k.title} ${k.prompt}`, /—/u, 'an em dash in words a person reads');
  }
  assert.doesNotMatch(`${PACK.title} ${PACK.summary}`, /—/u);
});

test('ONLY repo-status WORKS IN A REPOSITORY, and only with the file tools and two git commands that read', () => {
  const [week, inbox, repo] = KINDS as [Kind, Kind, Kind, Kind];
  assert.equal(week.repo, undefined);
  assert.equal(inbox.repo, undefined);
  assert.equal(week.turns, 8);
  assert.equal(inbox.turns, 8);
  assert.equal(repo.repo, 'project', 'the name each machine maps with braindog runner repos add project <folder>');
  assert.deepEqual(repo.tools, ['Read', 'Grep', 'Glob', 'Bash(git log:*)', 'Bash(git status:*)', 'mcp__braindog__propose']);
  for (const k of [week, inbox]) assert.ok(k.tools.every((t) => t.startsWith('mcp__braindog__')), `${k.job} reaches past the record`);
});

/* ── Approved once, in Decide ──────────────────────────────────────────────────────────────────── */

test('INSTALLING IT WAITS IN DECIDE, AND NO KIND CAN BE STARTED UNTIL THE OWNER ACCEPTS; then each one can', async () => {
  const { sql, ask, accept, start } = await recordOf();
  const filed = await ask();
  assert.ok(filed.ok, said(filed));
  const waiting = sql.one<{ status: string }>("SELECT status FROM suggestion WHERE body_kind = 'pack'");
  assert.equal(waiting?.status, 'open', 'the install did not wait for the owner');

  /* WAITING, RUNNABLE BY NONE. */
  assert.deepEqual(kindsOn(sql), []);
  for (const id of IDS) assert.equal((await start(`job.${id}`)).refusal?.code, 'DECLARATION_UNKNOWN', `job.${id} could start before the yes`);

  const done = await accept(filed);
  assert.ok(done.ok, said(done));
  assert.deepEqual(kindsOn(sql), IDS.map((id) => `job.${id}`).sort());
  for (const id of IDS) {
    const out = await start(`job.${id}`);
    assert.ok(out.ok, `job.${id}: ${said(out)}`);
  }
  const queued = sql.all<{ kind: string; status: string }>('SELECT kind, status FROM job ORDER BY kind').map((r) => `${r.kind} ${r.status}`);
  assert.deepEqual(queued, ['job.inbox-triage queued', 'job.repo-status queued', 'job.slash-desk queued', 'job.week-in-review queued']);
  sql.close();
});

/* ── What no kind may do ───────────────────────────────────────────────────────────────────────── */

test('A COPY OF A KIND THAT SKIPS ITS PERMISSIONS IS REFUSED, by the lint and at the proposal, and nothing is filed', async () => {
  const skipping = { ...KINDS[0]!, permission: 'bypassPermissions' };
  const fault = jobFault({ id: 'job.week-in-review', body: skipping as never });
  assert.equal(fault?.code, 'DECLARATION_INVALID');
  assert.equal(fault?.at, 'permission');
  assert.match(fault?.fix ?? '', /skip the run's permissions/u);

  const { sql, ask } = await recordOf({ ...PACK, declarations: [skipping, ...KINDS.slice(1)] });
  const out = await ask();
  assert.equal(out.ok, false, 'a kind that skips its permissions was filed for the owner to accept');
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID', said(out));
  assert.match(out.refusal?.fix ?? '', /skip the run's permissions/u, said(out));
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE body_kind = 'pack'")?.n, 0);
  assert.deepEqual(kindsOn(sql), []);
  sql.close();
});
