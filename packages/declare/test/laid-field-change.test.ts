/**
 * A pack may change a field it laid on another pack's list, and no field it did not lay (`loop/finish/defects.md` DEF-7
 * and L3). Before it, project-brief's next version could not relabel its own `summary`: the list it extends is staged
 * with no pack, so the plan saw `summary` as the list's and refused `PROVIDES_CONFLICT`.
 *
 * THE RECORD'S OWN PATH, for `pack-extends.test.ts`'s reason: which pack laid which field is read off the `pack` row's
 * stored manifest (`kernel.packs()`'s `laid`), and only the record has one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Diff } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, PAGES, firstPartyDocument } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
type Field = { id: string; type: string; label?: string; [k: string]: unknown };
type Brief = { version: string; extends: Record<string, { fields: Field[] }>; [k: string]: unknown };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown): Refusal => {
  const x = r as Out;
  assert.ok(!x.ok, 'it was accepted');
  return x.refusal!;
};

const BRIEF = new URL('../../../packs/project-brief/project-brief.pack.json', import.meta.url);
/** project-brief as it ships, at `version`, with `change` made to the fields it lays on Projects. */
const brief = (version = '1.0.0', change: (fields: Field[]) => Field[] = (f) => f): Brief => {
  const doc = JSON.parse(readFileSync(BRIEF, 'utf8')) as Brief;
  const things = doc.extends['register.things']!;
  return { ...doc, version, extends: { ...doc.extends, 'register.things': { ...things, fields: change(things.fields) } } };
};
const relabelled = (fields: Field[]): Field[] => fields.map((f) => (f.id === 'summary' ? { ...f, label: 'In one line' } : f));

/**
 * A fresh record holding every module `page.project` itself requires, the page laid on top as the starter lays it:
 * the project template reads tasks, money and services at once, so it sits in none of the five first-party packs
 * and none of their pack rows carry it (`packages/seed/src/packs/first-party.ts`, `crossPack`).
 */
async function portfolio(): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 27, 12)) });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id, { seeds: [] })));
  said(await api.kernel.install([{ id: 'page.project', kind: 'page', body: PAGES.project as never }]));
  return { api, close: () => sql.close() };
}
const planOf = async (api: Api, doc: unknown): Promise<Diff> => said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
async function put(api: Api, doc: unknown): Promise<Out> {
  const planned = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;
  if (!planned.ok) return planned;
  const diff = (planned.value as { diff: Diff }).diff;
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}
const things = (api: Api): Field[] => (JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.things')!.body) as { fields: Field[] }).fields;

test('the pack row says what the pack laid, by list, and a pack that laid nothing says nothing', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  assert.deepEqual(api.kernel.packs().find((p) => p.id === 'project-brief')?.laid, { 'register.things': ['summary', 'plan', 'blockers'] });
  assert.equal(api.kernel.packs().find((p) => p.id === 'portfolio')?.laid, undefined);
  close();
});

test('project-brief relabelling the field it laid plans clean and installs, and the row written under it keeps its value', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const made = said<{ id: string }>(api.kernel.create('things', { name: 'Kiln', lane: 'earning', summary: 'A type foundry' }, { actor: 'p_1' }));
  const next = brief('1.1.0', relabelled);
  const diff = await planOf(api, next);
  assert.deepEqual(diff.extends.map((e) => [e.id, e.adds, e.refusal?.code ?? null]), [['register.things', ['summary'], null]]);
  said(await put(api, next));
  assert.deepEqual(things(api).map((f) => f.id).slice(-3), ['summary', 'plan', 'blockers'], 'the changed field moved');
  assert.equal(things(api).find((f) => f.id === 'summary')?.label, 'In one line');
  assert.equal(api.kernel.get(made.id)!.fields.summary, 'A type foundry');
  close();
});

test("changing a field Portfolio declares itself is still refused, in today's sentence", async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const r = refusal(await put(api, brief('1.1.0', (fields) => [...fields, { id: 'name', label: 'Name', type: 'url' }])));
  assert.equal(r.code, 'PROVIDES_CONFLICT');
  assert.equal(r.at, 'extends.register.things.fields.name');
  assert.match(r.fix, /^things has a field called name already, and project-brief lays one of its own under that id\./u);
  close();
});

test('a field two packs laid is neither one\'s to change', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const summary = brief().extends['register.things']!.fields.find((f) => f.id === 'summary')!;
  said(
    await put(api, {
      pack: 'one-liners',
      version: '1.0.0',
      summary: 'A line on each project.',
      author: 'Halden',
      license: 'MIT',
      requires: { format: 1, primitives: 1, packs: {} },
      extends: { 'register.things': { fields: [summary] } },
      declarations: [{ page: 'one-liners', title: 'One liners', requires: ['register.things'], blocks: [{ kind: 'table', heading: 'Every line', source: 'register.things', columns: [{ field: 'name' }, { field: 'summary' }] }] }],
    }),
  );
  const r = refusal(await put(api, brief('1.1.0', relabelled)));
  assert.equal(r.code, 'PROVIDES_CONFLICT');
  assert.equal(r.at, 'extends.register.things.fields.summary');
  close();
});
