/**
 * A field an owner or an agent added to a pack's list, and the pack's next version that changes the same list.
 *
 * EVERY LATER UPDATE OF THE LIST WAS REFUSED. A run through `createRecordApi`: every first-party pack
 * installed, `domains` appended to `register.things` by `setDeclaration`, then portfolio one minor step up with a
 * `launched` field of its own. The plan answered `conflicts [{"id":"register.things","pack":"(this record)","changed":
 * true}]` and the install `PROVIDES_CONFLICT`, "leave portfolio at 1.4.0". Adding a field is the ordinary way a
 * record grows, so one added field locked the list's pack for good.
 *
 * SO AN EDIT THAT ONLY ADDS IS REBASED. When the owner's list is the body the edit started from plus fields and enum
 * values that body lacks, the update's new body is staged as the pack's, the owner's additions are laid over it as the
 * live row, and the plan names the list as kept with what it added. A removal, a retype, a renamed list, and a field id
 * the update brings under the owner's own name all stay conflicts.
 *
 * THE FIRST TEST IS THE RECORD'S OWN PATH, not a hand-built `Installed`: a probe that wrote the edited row without the
 * superseded pack row reached the "written from nothing" arm and quoted the wrong refusal, which is how the first
 * account of this lock came to be wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { conflictFault, install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Doc = { version: string; declarations: Record<string, unknown>[] };
type Field = { id: string; type: string; [k: string]: unknown };

const CURRENT = FIRST_PARTY_VERSIONS.portfolio;
const [major, minor] = CURRENT.split('.').map(Number) as [number, number];
const step = (n: number) => `${major}.${minor + n}.0`;

/** Portfolio `n` minor steps up, with `fields` appended to `things`. */
const portfolio = (n: number, fields: Field[]): Doc => {
  const d = structuredClone(firstPartyDocument('portfolio')) as unknown as Doc;
  d.version = step(n);
  d.declarations = d.declarations.map((x) => (x.register === 'things' && Array.isArray(x.fields) ? { ...x, fields: [...(x.fields as Field[]), ...fields] } : x));
  return d;
};

const DOMAINS: Field = { id: 'domains', label: 'Domains', type: 'list', of: 'text' };
const LAUNCHED: Field = { id: 'launched', label: 'Launched', type: 'day' };

test('a field added to Projects through setDeclaration survives a portfolio update that adds a field of its own', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)) });
  const k = api.kernel;
  for (const id of FIRST_PARTY) {
    const doc = firstPartyDocument(id);
    const planned = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
    said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  }

  const live = k.declarations().find((d) => d.id === 'register.things')!;
  const b = JSON.parse(live.body) as { fields: Field[] };
  said(await api.setDeclaration({ body: { register: 'things', ...b, fields: [...b.fields, DOMAINS] }, version: live.version } as never, owner));
  assert.deepEqual(k.detached().map((d) => [d.id, d.was]), [['register.things', 'portfolio']], 'the edit lost the record of whose list it was');
  const made = said<{ id: string }>(k.create('things', { name: 'acme.example', lane: 'earning', domains: ['acme.example'] }, { actor: 'p_1' }));

  const next = portfolio(1, [LAUNCHED]);
  const planned = said<{ diff: Diff }>(await api.planPack({ doc: next, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(planned.diff.conflicts, [], 'an added field locked the list against its pack');
  assert.deepEqual(planned.diff.kept.map((x) => [x.id, x.adds]), [['register.things', ['domains']]]);
  said(await api.installPack({ doc: next, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));

  assert.equal(k.packStates().find((p) => p.id === 'portfolio')?.version, step(1));
  const after = k.declarations().find((d) => d.id === 'register.things')!;
  const ids = (JSON.parse(after.body) as { fields: Field[] }).fields.map((f) => f.id);
  assert.ok(ids.includes('launched') && ids.includes('domains'), `things holds ${ids.join(', ')}`);
  assert.equal(after.pack_id, null, 'the owner’s list became the pack’s, and a later uninstall could take domains');
  /* THE DETACHED RECORD MOVES TO THE NEW PACK BODY, or the next update compares against the old one and reads the
     pack's own `launched` as a field the owner added. */
  const detached = k.detached().find((d) => d.id === 'register.things')!;
  assert.equal(detached.was, 'portfolio');
  assert.ok((JSON.parse(detached.body) as { fields: Field[] }).fields.some((f) => f.id === 'launched'));
  assert.ok(!(JSON.parse(detached.body) as { fields: Field[] }).fields.some((f) => f.id === 'domains'));

  said(k.update('things', made.id, { launched: '2026-09-01' }, { actor: 'p_1' }));
  const row = k.get(made.id)!;
  assert.deepEqual([row.fields.domains, row.fields.launched], [['acme.example'], '2026-09-01']);

  /* AND THE ONE AFTER THAT, which is the lock measured: not one update let through, every update. */
  const again = portfolio(2, [LAUNCHED, { id: 'stage', type: 'text' }]);
  const second = said<{ diff: Diff }>(await api.planPack({ doc: again, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(second.diff.conflicts, []);
  said(await api.installPack({ doc: again, source: { kind: 'local' }, planHash: second.diff.planHash, approve: second.diff.approve } as never, owner));
  const third = (JSON.parse(k.declarations().find((d) => d.id === 'register.things')!.body) as { fields: Field[] }).fields.map((f) => f.id);
  assert.deepEqual(third.slice(-3), ['launched', 'stage', 'domains']);
  sql.close();
});

/* ── plan alone, over a record built by hand the way `detached()` answers ── */

const FIELDS = (): Field[] => [
  { id: 'name', type: 'text', required: true },
  { id: 'lane', type: 'enum', values: ['building', 'earning'], labels: { building: 'Building', earning: 'Earning' } },
  { id: 'note', type: 'text' },
];

const DOC = (version: string, fields = FIELDS(), extra: Record<string, unknown>[] = []) => ({
  pack: 'mini',
  version,
  summary: 'Projects.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'things', name: 'Projects', title: 'name', fields }, ...extra],
});

const packOf = async (doc: unknown): Promise<Pack> => {
  const r = (await normalise(doc)) as { ok: boolean; value: Pack };
  assert.ok(r.ok);
  return r.value;
};

/** mini 1.0.0 installed, and `register.things` edited to `edit` of its body, as `setDeclaration` leaves it. */
async function recordWith(edit: (b: { fields: Field[] } & Record<string, unknown>) => Record<string, unknown>): Promise<Installed> {
  const first = await packOf(DOC('1.0.0'));
  const d = first.declarations[0]!;
  return {
    format: 1,
    primitives: 1,
    record_version: 3,
    packs: [{ id: 'mini', version: '1.0.0' }],
    declarations: [{ id: d.id, version: 2, kind: d.kind, pack_id: null, body: JSON.stringify(edit(JSON.parse(d.canonical))), checksum: 'e' }],
    rows: { things: 5 },
    detached: { [d.id]: { was: 'mini', body: d.canonical } },
  };
}

const plus = (...more: Field[]) => (b: { fields: Field[] } & Record<string, unknown>) => ({ ...b, fields: [...b.fields, ...more] });

test('an added enum value is laid over the update’s values, with its label', async () => {
  const installed = await recordWith((b) => ({
    ...b,
    fields: b.fields.map((f) => (f.id === 'lane' ? { ...f, values: [...(f.values as string[]), 'sold'], labels: { ...(f.labels as object), sold: 'Sold' } } : f)),
  }));
  const next = await packOf(DOC('1.1.0', [...FIELDS().map((f) => (f.id === 'lane' ? { ...f, values: ['building', 'earning', 'parked'] } : f)), { id: 'since', type: 'day' }]));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.conflicts, []);
  const kept = diff.kept[0]!;
  assert.deepEqual(kept.adds, ['lane.sold']);
  const lane = (JSON.parse(kept.rebased!) as { fields: Field[] }).fields.find((f) => f.id === 'lane')!;
  assert.deepEqual(lane.values, ['building', 'earning', 'parked', 'sold']);
  assert.deepEqual(lane.labels, { building: 'Building', earning: 'Earning', sold: 'Sold' });
});

test('install stages the pack’s new body and then the owner’s rebased one, so the owner’s row stays detached from it', async () => {
  const installed = await recordWith(plus(DOMAINS));
  const next = await packOf(DOC('1.1.0', [...FIELDS(), LAUNCHED]));
  const diff = await plan(next, installed);
  const batches: { id: string; pack?: string; fields: string[] }[][] = [];
  const host: Host = {
    count: () => 0,
    stage: async (batch) => (
      batches.push(batch.map((x) => ({ id: x.id, ...(x.pack === undefined ? {} : { pack: x.pack }), fields: ((x.body as { fields: Field[] }).fields ?? []).map((f) => f.id) }))),
      { ok: true, value: () => ({ ok: true, value: null }) }
    ),
    transaction: (fn) => fn(),
    reload: () => undefined,
    retire: () => ({ ok: true, value: null }),
    seed: () => ({ ok: true, value: { id: 'x' } }),
    remember: () => undefined,
    forget: () => undefined,
    claimed: () => [],
  };
  const put = await install(next, diff, host, diff.planHash);
  assert.ok(put.ok);
  assert.deepEqual(batches, [
    [
      { id: 'register.things', pack: 'mini', fields: ['name', 'lane', 'note', 'launched'] },
      { id: 'register.things', fields: ['name', 'lane', 'note', 'launched', 'domains'] },
    ],
  ]);
});

test('a page the update stages over its own new field is not refused because the owner’s older row lacks it', async () => {
  const installed = await recordWith(plus(DOMAINS));
  const page = { page: 'projects', title: 'Projects', blocks: [{ kind: 'table', heading: 'All', source: 'register.things', columns: [{ field: 'name' }, { field: 'launched' }] }] };
  const diff = await plan(await packOf(DOC('1.1.0', [...FIELDS(), LAUNCHED], [page])), installed);
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.kept.map((x) => x.id), ['register.things']);
});

test('a field the update brings under the owner’s own id stays a conflict, and names the field', async () => {
  const installed = await recordWith(plus(DOMAINS));
  const next = await packOf(DOC('1.1.0', [...FIELDS(), { id: 'domains', type: 'text' }]));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.conflicts, [{ id: 'register.things', pack: '(this record)', changed: true, field: 'domains' }]);
  assert.deepEqual(diff.kept, []);
  assert.equal(
    conflictFault(diff)?.fix,
    'mini 1.1.0 adds a field called domains to register.things, and you added one with that id already. Two fields cannot share an id, so for now, leave mini at 1.0.0.',
  );
});

test('an owner who took a field off, retyped one or renamed the list is still refused, as before', async () => {
  const next = await packOf(DOC('1.1.0', [...FIELDS(), LAUNCHED]));
  for (const edit of [
    (b: { fields: Field[] } & Record<string, unknown>) => ({ ...b, fields: b.fields.filter((f) => f.id !== 'note') }),
    (b: { fields: Field[] } & Record<string, unknown>) => ({ ...b, fields: b.fields.map((f) => (f.id === 'note' ? { ...f, type: 'document' } : f)) }),
    (b: { fields: Field[] } & Record<string, unknown>) => ({ ...b, name: 'My projects', fields: [...b.fields, DOMAINS] }),
    (b: { fields: Field[] } & Record<string, unknown>) => ({ ...b, fields: b.fields.map((f) => (f.id === 'lane' ? { ...f, values: ['building'] } : f)) }),
  ]) {
    const diff = await plan(next, await recordWith(edit));
    assert.deepEqual(diff.conflicts, [{ id: 'register.things', pack: '(this record)', changed: true }]);
  }
});

/* THE TWO GUARDS A REBASE STILL OWES THE ROWS AND THE OWNER'S PAGES. A review of this change removed each in turn and
   the five tests above stayed green, so a rebase that forgot either would have gone through unnoticed. */

test('a field the update retypes under rows is still a retype when the owner only added to the list', async () => {
  const installed = await recordWith(plus(DOMAINS));
  const diff = await plan(await packOf(DOC('1.1.0', FIELDS().map((f) => (f.id === 'note' ? { ...f, type: 'int' } : f)))), installed);
  assert.deepEqual(diff.kept.map((x) => [x.id, x.adds]), [['register.things', ['domains']]]);
  assert.deepEqual(diff.retypes, [{ id: 'register.things', field: 'note', from: 'text', to: 'int', rows: 5 }]);
});

test('a page the owner changed that reads a field the update takes off a rebased list is refused', async () => {
  const page = (fields: string[]) => ({ page: 'projects', title: 'Projects', blocks: [{ kind: 'table', heading: 'All', source: 'register.things', columns: fields.map((field) => ({ field })) }] });
  const first = await packOf(DOC('1.0.0', FIELDS(), [page(['name', 'note'])]));
  const installed = await recordWith(plus(DOMAINS));
  const p = first.declarations.find((d) => d.id === 'page.projects')!;
  installed.declarations.push({ id: p.id, version: 2, kind: p.kind, pack_id: null, body: JSON.stringify({ ...JSON.parse(p.canonical), title: 'Mine' }), checksum: 'p' });
  installed.detached![p.id] = { was: 'mini', body: p.canonical };
  const diff = await plan(await packOf(DOC('1.1.0', FIELDS().filter((f) => f.id !== 'note'), [page(['name'])])), installed);
  assert.deepEqual(diff.conflicts, [{ id: 'page.projects', pack: '(this record)', reads: 'register.things', field: 'note' }]);
});
