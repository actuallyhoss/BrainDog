/**
 * A founder's project, organisation and person pages end with where each was seen (ENG-B03 'Seen').
 *
 * THE `about` READ WAS DRAWN ONLY IN THE PALETTE. It answers the notes, runs and rows that name one thing, newest first
 * (`packages/record/src/methods/about.ts`), and no page about a project, an organisation or a person said it. This file
 * holds the section the app draws it under, `panel: seen`, last on each of the three, and the kernel's own word for it:
 * admitted on a page per row, refused with its own sentence on a page about no row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_1' };
const SEEN = { kind: 'section', heading: 'Where it was seen', icon: 'history', span: 12, panel: 'seen' };

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

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** A fresh founder record made the way onboarding makes one (`founder-home-quiet.test.ts`). */
async function founder(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: true }));
  return { k, sql };
}

type Drawn = { kind: string; heading?: string; panel?: string; added?: string; refusals?: { code: string; fix: string; at?: string }[] };

/** The page made from `template` for the row named `name`, read as the app reads it. */
function pageOf(k: Kernel, template: string, name: string): Drawn[] {
  const found = k.pages().find((p) => p.template === template && p.title === name) ?? k.pages().find((p) => p.template === template);
  assert.ok(found, `no page is made from ${template}: ${k.pages().map((p) => `${p.slug} (${p.template})`).join(', ')}`);
  return value<{ blocks: Drawn[] }>(k.page(found.slug)).blocks;
}

test('THE PROJECT PAGE ENDS WITH WHERE IT WAS SEEN, and People’s pages for an organisation and a person are laid it last', () => {
  const pack = useCase('founder')!.pack!;
  const project = (pack.declarations as { page?: string; blocks?: Record<string, unknown>[] }[]).find((d) => d.page === 'project');
  assert.ok(project?.blocks, 'the founder declares the project page');
  assert.deepEqual(project.blocks.at(-1), SEEN, 'the last block of the project page');
  assert.equal(project.blocks.filter((b) => b.panel === 'seen').length, 1, 'said once');

  const adds = (pack as { adds?: { page: string; after?: string; block: Record<string, unknown> }[] }).adds ?? [];
  for (const page of ['page.relation', 'page.someone']) {
    const laid = adds.filter((a) => a.page === page && a.block.panel === 'seen');
    assert.deepEqual(laid, [{ page, after: 'Notes', block: SEEN }], `${page} is laid the section once, after Notes`);
  }
  /* LAST AMONG THE ADDITIONS, so each addition before keeps its number (`adds.page.portfolio.4`, `adds.page.estate.5`). */
  assert.deepEqual(adds.slice(-2).map((a) => a.page), ['page.relation', 'page.someone']);
});

test('ON A FRESH FOUNDER RECORD a project’s, an organisation’s and a person’s page each end with the section, admitted', async () => {
  const { k, sql } = await founder();
  const org = value<{ id: string }>(k.create('organisations', { name: 'Harbour Studio', kind: 'company' }, OWNER));
  value(k.create('people', { name: 'Ada Brightwell', org: org.id }, OWNER));
  for (const [template, name] of [['project', ''], ['relation', 'Harbour Studio'], ['someone', 'Ada Brightwell']] as const) {
    const blocks = pageOf(k, template, name);
    const last = blocks.at(-1)!;
    assert.equal(last.kind, 'section', `${template} ends with ${last.heading ?? last.kind}`);
    assert.equal(last.heading, 'Where it was seen', template);
    assert.equal(last.panel, 'seen', `${template} hands the panel back`);
    assert.deepEqual(last.refusals ?? [], [], `${template} refused the panel on a page per row`);
    if (template !== 'project') assert.equal(last.added, 'usecase-founder', `${template} is laid it by the founder`);
    const astray = blocks.filter((b) => (b.refusals ?? []).some((r) => r.at === 'panel'));
    assert.deepEqual(astray.map((b) => b.heading), [], `${template} refused a panel`);
  }
  sql.close();
});

/** A one-page pack over one list, its page a page per row or about no row, ending with the section. */
const ONE_PAGE = (perRow: boolean) => ({
  pack: 'seen-check',
  version: '1.0.0',
  summary: 'A list of jobs and a page that says where one was seen.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    { register: 'jobs', name: 'Jobs', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
    {
      page: 'job',
      title: perRow ? '{{what}}' : 'Jobs',
      ...(perRow ? { for: { register: 'jobs' } } : {}),
      requires: ['register.jobs'],
      blocks: [{ kind: 'table', heading: 'Jobs', source: 'register.jobs', columns: [{ field: 'what' }] }, SEEN],
    },
  ],
});

/** The refusal the first step that refuses gives, or `null` where the pack installed. */
async function refusalOf(k: Kernel, doc: unknown): Promise<{ code: string; fix: string; at?: string } | null> {
  type R = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
  const normal = (await normalise(doc, { kind: 'local' })) as R;
  if (!normal.ok) return normal.refusal!;
  const diff = await plan(normal.value as Pack, stateOf(k));
  const done = (await install(normal.value as Pack, diff, hostFor(k), diff.planHash)) as R;
  return done.ok ? null : done.refusal!;
}

test('THE KERNEL ADMITS panel: seen ON A PAGE PER ROW and refuses it on a page about no row, in its own sentence', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const astray = await refusalOf(k, ONE_PAGE(false));
  assert.ok(astray, 'a page about no row took a panel about one row');
  assert.equal(astray.code, 'DECLARATION_INVALID');
  assert.match(astray.fix, /panel: seen draws a part of one row's page, and this page is about no row/u);
  assert.match(astray.at ?? '', /panel$/u);
  assert.equal(await refusalOf(k, ONE_PAGE(true)), null, 'a page per row takes it');
  sql.close();
});
