/**
 * STUDIES, TEAM TASK LIST AND STARTING A PROJECT ARE PART OF STUDENT, TEAM BOARD AND THE NEW PROJECT GUIDE NOW. A record that holds the starter as it stood before is updated on its own, asks nothing, and
 * keeps every row and page it had. "Before" is this build's document with exactly what the fold added taken out.
 *
 * Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { handedOf, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { updateFirstParty, type QuietPort } from '@braindog/seed/packs/quiet';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, agentsPackDocument, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

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

/** What each fold added, to be taken out for "before": the list, the field, and the version it was released at. */
const FOLDS: Record<string, { before: string; list?: string; field?: [string, string]; rows: [string, Body][] }> = {
  student: { before: '1.5.1', list: 'course_reads', field: ['assignments', 'mark'], rows: [['courses', { name: 'Biology' }], ['assignments', { what: 'Cell essay', state: 'doing' }]] },
  team: { before: '2.28.0', field: ['cycles', 'retro'], rows: [['cycles', { name: 'Cycle 9', state: 'active' }]] },
  guide: { before: '1.6.1', field: ['steps', 'why'], rows: [['milestones', { what: 'Ten people try it' }], ['steps', { what: 'Ask a friend', state: 'to_do' }]] },
};

function earlier(id: string): Body {
  const { before, list, field } = FOLDS[id]!;
  const doc = structuredClone(carriedDocument(useCase(id)!, TODAY)!) as Body & { declarations: Body[]; config?: Record<string, unknown> };
  doc.declarations = doc.declarations.filter((d) => d.register !== list);
  if (field) for (const d of doc.declarations) if (d.register === field[0]) d.fields = (d.fields as { id: string }[]).filter((f) => f.id !== field[1]);
  if (list) for (const key of Object.keys(doc.config ?? {})) if (key.includes(list)) delete doc.config![key];
  return { ...doc, version: before, seeds: undefined };
}

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

for (const id of Object.keys(FOLDS)) {
  test(`A RECORD HOLDING ${id.toUpperCase()} AS IT WAS UPDATES ON ITS OWN, asks nothing, and keeps its rows and pages`, async () => {
    const u = useCase(id)!;
    const { before, list, field, rows } = FOLDS[id]!;
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    for (const m of modulesFor(u, ['people', ...u.modules])) if (m !== 'agents') await put(k, sql, documentFor(k, m));
    if (held(k).includes('things')) await put(k, sql, agentsPackDocument());
    await put(k, sql, earlier(id));
    if (list) assert.ok(!held(k).includes(list), 'the record starts without the list the fold brings');
    if (field) assert.ok(!fieldsOf(k, field[0]).includes(field[1]), 'and without the field');
    for (const [register, fields] of rows) value(k.create(register, fields, OWNER));
    const pages = (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'page').map((d) => d.id);
    assert.equal(k.packs().find((p) => p.id === `usecase-${id}`)?.version, before);

    const port = portOf(k, sql);
    const steps = await updateFirstParty(port);
    assert.deepEqual(steps.find((s) => s.pack === `usecase-${id}`), { pack: `usecase-${id}`, from: before, to: u.version, did: 'updated' }, JSON.stringify(steps));
    assert.deepEqual(port.asked, [], 'nothing was lost, so nothing was asked');

    if (list) assert.ok(held(k).includes(list), `${list} came`);
    if (field) assert.ok(fieldsOf(k, field[0]).includes(field[1]), `${field[1]} came`);
    for (const [register] of rows) assert.ok(k.count(register) >= 1, `${register} kept its rows`);
    const now = new Set((k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'page').map((d) => d.id));
    for (const p of pages) assert.ok(now.has(p), `${p} is still there`);
    sql.close();
  });
}

for (const id of ['studies', 'team-board', 'new-project']) {
  test(`${id.toUpperCase()} STAYS INSTALLABLE, IS IN NO LISTING, AND SAYS WHAT IT IS PART OF NOW`, () => {
    const file = JSON.parse(readFileSync(new URL(`../../../packs/${id}/${id}.pack.json`, import.meta.url), 'utf8')) as { summary: string; unlisted?: boolean };
    const listed = JSON.parse(readFileSync(new URL('../../../packs/listed.json', import.meta.url), 'utf8')) as { packs: string[]; usecases: string[] };
    assert.ok(file.unlisted === true);
    assert.ok(![...listed.packs, ...listed.usecases].includes(id));
    assert.match(file.summary, /^Now part of /u);
  });
}
