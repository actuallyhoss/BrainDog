/**
 * The starter use cases and the arranger (`loop/research-spark.md` §3, §4): each carried pack installs on
 * an empty record once its modules are in, the voice lands in the record as settings, and sentences a
 * person could type land on the use case they describe, the same way every time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODULES, install, normalise, plan, voiceOf, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY, NOW, firstPartyDocument } from '../src/index.ts';
import { MODULE_ORDER, USE_CASES, arrange, listsOf, modulesFor, pagesOf, useCase, useCaseDocument } from '../src/usecases/index.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

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

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

async function put(k: Kernel, doc: unknown): Promise<{ ok: boolean }> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  return install(pack, diff, hostFor(k), diff.planHash) as Promise<{ ok: boolean }>;
}

test('THE MODULES A USE CASE MAY NAME ARE THE FIRST-PARTY PACKS, in install order', () => {
  assert.deepEqual([...MODULES], [...MODULE_ORDER]);
  assert.deepEqual(MODULE_ORDER.filter((id) => id !== 'agents'), [...FIRST_PARTY]);
});

test('EACH CARRIED PACK INSTALLS ON AN EMPTY RECORD after its modules, with its example rows and its voice', async () => {
  for (const u of USE_CASES) {
    const doc = useCaseDocument(u.usecase);
    if (!doc) {
      assert.equal(u.pack, null);
      continue;
    }
    const { k, sql } = await record();
    for (const id of modulesFor(u)) if (id !== 'agents') value(await put(k, firstPartyDocument(id)));
    value(await put(k, doc));
    for (const list of listsOf(u)) assert.ok(k.count(list.id) >= 1, `${u.usecase}: ${list.id} has its example row`);
    const settings = value<{ values: Record<string, unknown> }>(k.packConfig(`usecase-${u.usecase}`));
    assert.deepEqual(voiceOf(settings.values), u.voice, `${u.usecase}: the record holds the voice`);
    sql.close();
  }
});

test('A CARRIED PACK WITHOUT ITS MODULES IS REFUSED, naming what to install', async () => {
  const founder = useCase('founder')!;
  const { k, sql } = await record();
  const out = (await put(k, useCaseDocument('founder'))) as { ok: boolean; refusal?: { code: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'REGISTER_UNRESOLVED');
  assert.ok(founder.modules.includes('portfolio'));
  sql.close();
});

test('THE PROPOSAL SAYS WHICH PAGES AND SECTIONS IT MAKES', () => {
  assert.deepEqual(pagesOf(useCase('student')!), [{ page: 'studies', title: 'Studies', section: 'Studies' }]);
  assert.deepEqual(pagesOf(useCase('founder')!), [{ page: 'dashboard', title: 'Dashboard', section: 'Dashboard' }]);
  assert.deepEqual(pagesOf(useCase('team')!), [
    { page: 'board', title: 'Board', section: 'Board' },
    { page: 'agent-work', title: 'Agent work', section: 'Board' },
  ]);
  assert.deepEqual(pagesOf(useCase('guide')!), [{ page: 'guide', title: 'Guide', section: 'Guide' }]);
  assert.deepEqual(pagesOf(useCase('business')!), []);
  assert.deepEqual(modulesFor(useCase('student')!, ['people']), ['people']);
  assert.deepEqual(modulesFor(useCase('founder')!, ['estate']), ['portfolio', 'people', 'money-core', 'estate', 'work']);
});

const SENTENCES: [string, string | null][] = [
  ["I'm a student at Leeds, studying biology", 'student'],
  ['homework and exams', 'student'],
  ['I need to keep track of my coursework and deadlines for uni', 'student'],
  ['Revising for my GCSEs', 'student'],
  ['Writing my dissertation this semester', 'student'],
  ['my PhD thesis and the lectures I teach', 'student'],
  ['college assignments', 'student'],
  ['A levels, three subjects, and a tutor on Tuesdays', 'student'],
  ['I study part time while working', 'student'],
  ['school', 'student'],
  ["I'm a solo founder running two companies", 'founder'],
  ['I run BrainDog and a couple of side projects, and I want dashboards for their MRR', 'founder'],
  ['startup metrics and runway', 'founder'],
  ['my apps report signups and churn', 'founder'],
  ['bootstrapped SaaS, three products', 'founder'],
  ['indie hacker with several businesses', 'founder'],
  ['I want analytics across my organisations and their balances', 'founder'],
  ['co-founder of a startup', 'founder'],
  ['revenue and users for each of my products', 'founder'],
  ['I launched two apps this year', 'founder'],
  ['I run a design studio', 'business'],
  ['I freelance and send invoices to clients', 'business'],
  ['a small business with domains and hosting', 'business'],
  ['consulting, with a retainer and an accountant', 'business'],
  ['I run a shop and pay VAT', 'business'],
  ['agency work for customers', 'business'],
  ['bookkeeping for my business', 'business'],
  ['a type foundry', 'business'],
  ['freelancer', 'business'],
  ['subscriptions and contractors', 'business'],
  ['', null],
  ['hello', null],
  ['a garden', null],
  ['my cat', null],
  ['Je suis étudiant', null],
  ['classes', 'student'],
  ['Dashboard', 'founder'],
  ['STUDENT', 'student'],
  ['side-projects', null],
  ['my running club', null],
  ['I run the product team at a 200-person company and our agents take tickets', 'team'],
  ['a product manager with a backlog and two-week sprints', 'team'],
  ['our engineering team lives in Jira and wants agents on the tickets', 'team'],
  ['Tasks for a small team', 'team'],
  ['kanban for my squad', 'team'],
  ['standups and a roadmap for the department', 'team'],
  ['agentic task list for an enterprise', 'team'],
  ['my team', 'team'],
  ['issues and assignees', 'team'],
  ['we plan in cycles', 'team'],
  ["I want to start a podcast and don't know where to begin", 'guide'],
  ['A new project', 'guide'],
  ['starting a newsletter from scratch', 'guide'],
  ['I have an idea for a YouTube channel', 'guide'],
  ['writing my first novel, step by step', 'guide'],
  ['getting started with a charity event', 'guide'],
  ['I want a checklist and milestones for my passion project', 'guide'],
  ['a band', 'guide'],
  ['where to start with a blog', 'guide'],
  ["I'm starting something new", 'guide'],
];

test('SIXTY SENTENCES LAND ON THE USE CASE THEY DESCRIBE', () => {
  for (const [said, want] of SENTENCES) assert.equal(arrange(said).pick?.usecase ?? null, want, JSON.stringify(said));
});

test('THE SAME WORDS ALWAYS RANK THE SAME, and each reason is a phrase of what was typed', () => {
  for (const [said] of SENTENCES) {
    const a = arrange(said);
    assert.deepEqual(arrange(said), a);
    for (const r of a.ranked) for (const w of r.why) assert.equal(said.slice(w.at, w.at + w.text.length), w.text);
  }
  const mixed = arrange('a student who freelances for clients on the side');
  assert.deepEqual(
    mixed.ranked.map((r) => [r.usecase.usecase, r.score]),
    [['student', 1], ['business', 1], ['founder', 0], ['team', 0], ['guide', 0]].sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][],
  );
});
