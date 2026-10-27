/**
 * ROADMAP, SLASH ON YOUR MACHINE AND THE DATED TASKS ARE PART OF WORK AND JOBS ON YOUR MACHINE NOW (the add-ons pass of
 * 27 October, row 7). A record that holds the old add-on is carried over by the night's own update, asks nothing, and
 * keeps its tasks, its page and its approved job.
 *
 * Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { handedOf, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { updateFirstParty, type QuietAddon, type QuietPort } from '@braindog/seed/packs/quiet';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY_VERSIONS, NOW, agentsPackDocument, firstPartyManifest } from '../src/index.ts';
import { dayOf, moduleDocument } from '../src/usecases/install.ts';

type Body = Record<string, unknown>;
const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel, sql: NodeSql): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
  detached: Object.fromEntries(k.detached().map((d) => [d.id, { was: d.was, body: d.body }])),
  handed: handedOf(sql.all<{ manifest: string }>('SELECT manifest FROM pack').map((r) => r.manifest)),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));
const fieldsOf = (k: Kernel, list: string): string[] => {
  const d = (k.declarations() as { id: string; body: unknown }[]).find((x) => x.id === `register.${list}`);
  const body = (typeof d?.body === 'string' ? JSON.parse(d.body) : d?.body) as { fields: { id: string }[] };
  return body.fields.map((f) => f.id);
};

async function put(k: Kernel, sql: NodeSql, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k, sql));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

const documentFor = (k: Kernel, id: string): Body | null =>
  moduleDocument(null, id, { today: TODAY, holds: new Set([...held(k), ...firstPartyManifest(id as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]) });

function portOf(k: Kernel, sql: NodeSql): QuietPort & { asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    held: () => k.packs().map((p) => ({ id: p.id, version: p.version, on: true })),
    document: (id) => documentFor(k, id),
    plan: async (doc) => {
      const pack = await normalise(doc, { kind: 'local' });
      if (!pack.ok) return pack as never;
      return { ok: true, value: await plan(pack.value, stateOf(k, sql)) };
    },
    install: async (doc, planHash) => {
      const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
      return install(pack, await plan(pack, stateOf(k, sql)), hostFor(k), planHash);
    },
    asking: () => false,
    propose: (q) => {
      asked.push(q);
      return k.propose(q, 'p_1');
    },
  };
}

const file = (path: string): Body => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Body;
const ROADMAP = (): Body => file('../../../packs/roadmap/roadmap.pack.json');
const JOBS = (): Body => file('../../../packs/job-starter/job-starter.pack.json');
const SLASH = (): Body => file('../../../packs/slash-desk/slash-desk.pack.json');
const WORK_BEFORE = (): Body => ({ ...file('./fixtures/released/work-1.18.0.json'), seeds: undefined });
const ROADMAP_BEFORE = (): Body => file('./fixtures/released/roadmap-1.1.0.json');

/** The add-ons this build ships, as the catalogue lends them: each at the version a record holds it, to the version shipped. */
const lent = (id: string, title: string, from: string, doc: Body): QuietAddon => ({ id, title, from, to: String(doc.version), doc });

const pageIds = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'page').map((d) => d.id).sort();
const ownerOf = (k: Kernel, id: string): string | undefined => (k.declarations() as { id: string; pack_id?: string | null }[]).find((d) => d.id === id)?.pack_id ?? undefined;

async function withWorkBefore(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of ['portfolio', 'people']) await put(k, sql, documentFor(k, m));
  await put(k, sql, WORK_BEFORE());
  return { k, sql };
}

test('A RECORD HOLDING ROADMAP IS HANDED ITS PAGE BY WORK IN THE NIGHT, asks nothing, and keeps its tasks and its page', async () => {
  const { k, sql } = await withWorkBefore();
  await put(k, sql, ROADMAP_BEFORE());
  for (const [what, by] of [['Cut the specimen page', '2026-10-02'], ['Kiln delivery', '2026-10-09']] as const) value(k.create('tasks', { what, state: 'open', by }, OWNER));
  assert.ok(pageIds(k).includes('page.roadmap'));
  assert.equal(k.packs().find((p) => p.id === 'work')?.version, '1.18.0');

  const port = { ...portOf(k, sql), addons: () => [lent('roadmap', 'Roadmap', '1.1.0', ROADMAP())] };
  const steps = await updateFirstParty(port);
  assert.equal(steps.find((s) => s.pack === 'roadmap')?.did, 'updated', JSON.stringify(steps));
  assert.equal(steps.find((s) => s.pack === 'work')?.did, 'updated', JSON.stringify(steps));
  assert.deepEqual(port.asked, []);
  assert.equal(k.packs().find((p) => p.id === 'work')?.version, FIRST_PARTY_VERSIONS.work);
  assert.equal(k.packs().find((p) => p.id === 'roadmap')?.version, '2.0.0');
  assert.ok(pageIds(k).includes('page.roadmap'), 'the page went with Roadmap');
  assert.equal(ownerOf(k, 'page.roadmap'), 'work', 'Work holds the page now');
  assert.equal((k.get('tasks#1') as { fields: { what: string } }).fields.what, 'Cut the specimen page');
  assert.equal(k.count('tasks'), 2);
  sql.close();
});

test('A RECORD HOLDING WORK ALONE GETS THE TIMELINE FROM WORK, and nothing it had is touched', async () => {
  const { k, sql } = await withWorkBefore();
  value(k.create('tasks', { what: 'Kiln delivery', state: 'open', by: '2026-10-09' }, OWNER));
  assert.ok(!pageIds(k).includes('page.roadmap'));
  const port = portOf(k, sql);
  const steps = await updateFirstParty(port);
  assert.equal(steps.find((s) => s.pack === 'work')?.did, 'updated', JSON.stringify(steps));
  assert.deepEqual(port.asked, []);
  assert.ok(pageIds(k).includes('page.roadmap'));
  assert.equal(k.count('tasks'), 1);
  sql.close();
});

async function withJobs(slash: boolean, jobs: boolean): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of ['portfolio', 'people', 'work']) await put(k, sql, documentFor(k, m));
  await put(k, sql, agentsPackDocument());
  const all = JOBS() as Body & { declarations: Body[] };
  const kind = all.declarations.find((d) => d.job === 'slash-desk')!;
  if (jobs) await put(k, sql, { ...all, version: '1.0.1', title: 'Starter jobs', declarations: all.declarations.filter((d) => d.job !== 'slash-desk') });
  if (slash) await put(k, sql, { pack: 'slash-desk', version: '1.0.1', title: 'Slash on your machine', summary: 'Composes a page on your machine.', author: 'BrainDog', license: 'Apache-2.0', requires: { format: 1, primitives: 1, packs: { agents: '^1.0.0' } }, declarations: [kind] });
  return { k, sql };
}

const jobsHeld = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'job').map((d) => d.id).sort();

test('A RECORD HOLDING SLASH ON YOUR MACHINE AND STARTER JOBS KEEPS THE JOB, now from Jobs on your machine, and asks nothing', async () => {
  const { k, sql } = await withJobs(true, true);
  assert.ok(jobsHeld(k).includes('job.slash-desk'));
  const port = { ...portOf(k, sql), addons: () => [lent('job-starter', 'Starter jobs', '1.0.1', JOBS()), lent('slash-desk', 'Slash on your machine', '1.0.1', SLASH())] };
  const steps = await updateFirstParty(port);
  assert.equal(steps.find((s) => s.pack === 'slash-desk')?.did, 'updated', JSON.stringify(steps));
  assert.equal(steps.find((s) => s.pack === 'job-starter')?.did, 'updated', JSON.stringify(steps));
  assert.deepEqual(port.asked, []);
  assert.deepEqual(jobsHeld(k), ['job.inbox-triage', 'job.repo-status', 'job.slash-desk', 'job.week-in-review']);
  assert.equal(ownerOf(k, 'job.slash-desk'), 'job-starter');
  assert.equal(k.packs().find((p) => p.id === 'job-starter')?.version, '1.1.0');
  sql.close();
});

test('A RECORD HOLDING SLASH ON YOUR MACHINE ALONE KEEPS THE JOB when the old id says it is part of Jobs on your machine', async () => {
  const { k, sql } = await withJobs(true, false);
  const port = { ...portOf(k, sql), addons: () => [lent('slash-desk', 'Slash on your machine', '1.0.1', SLASH())] };
  const steps = await updateFirstParty(port);
  assert.equal(steps.find((s) => s.pack === 'slash-desk')?.did, 'updated', JSON.stringify(steps));
  assert.deepEqual(port.asked, []);
  assert.deepEqual(jobsHeld(k), ['job.slash-desk']);
  sql.close();
});

test('A RECORD HOLDING STARTER JOBS ALONE IS NOT GIVEN A NEW KIND OF JOB BY THE NIGHT: it waits for the person', async () => {
  const { k, sql } = await withJobs(false, true);
  const port = { ...portOf(k, sql), addons: () => [lent('job-starter', 'Starter jobs', '1.0.1', JOBS())] };
  const steps = await updateFirstParty(port);
  const step = steps.find((s) => s.pack === 'job-starter');
  assert.ok(step?.did === 'updated' || step?.did === 'refused', JSON.stringify(steps));
  if (step?.did === 'refused') assert.ok(!jobsHeld(k).includes('job.slash-desk'), 'a refused update still gave the record a kind of job');
  assert.deepEqual(port.asked, []);
  sql.close();
});

test('THE OLD IDS SAY WHAT THEY ARE NOW PART OF', () => {
  assert.match(String(ROADMAP().summary), /^Now part of Work/u);
  assert.match(String(SLASH().summary), /^Now part of Jobs on your machine/u);
  assert.equal(JOBS().title, 'Jobs on your machine');
});
