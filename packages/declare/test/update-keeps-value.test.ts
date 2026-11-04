/**
 * A value an update takes off a closed list, while the list holds rows.
 *
 * NOTHING SAID NO, AND THE ROW COULD NOT BE EDITED AFTERWARDS. A probe, People 1.0.0 with a row holding
 * `role: registrar`, then People as 2.0.0 with `registrar` taken off `role`:
 *
 *     WITH ROW people 2.0.0 without registrar: ok
 *       kept [] changes ["register.people"]
 *     DIFF warnings [] misreads [] orphans 0 retypes [] direction upgrade
 *     EDIT note on that row ENUM_VALUE_UNKNOWN: role has no value registrar.
 *
 * An edit to a row's `note` refused over a field the edit never touched. `movedFields` saw the value go, and only
 * `misreadsOf` asked it, about declarations that read the value and never about rows that hold it. It sits in front of
 * every move that sheds a studio word from a first-party list: `registrar` out of People first.
 *
 * SO THE VALUE STAYS, BY LIST AND NOT BY ROW. The plan is handed a row count per list (`census()`), not per value, and
 * counting values is an edit to the record's `installedState`, a larger change. By list is the conservative
 * side of the line: a record keeps a word nobody used, which costs one entry in a picker, where the other side is the
 * refused edit above. A list with no rows loses the value, as it always did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../seed/src/index.ts';
import { peopleBefore } from './people-before.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Field = { id: string; type: string; values?: string[]; labels?: Record<string, string>; [k: string]: unknown };
type Doc = { version: string; declarations: Record<string, unknown>[]; seeds?: unknown[]; [k: string]: unknown };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

async function recordOf(docs: readonly unknown[]): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)) });
  for (const doc of docs) await put(api, doc);
  return { api, close: () => sql.close() };
}

async function planOf(api: Api, doc: unknown): Promise<Diff> {
  return said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
}

async function put(api: Api, doc: unknown): Promise<Diff> {
  const diff = await planOf(api, doc);
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
  return diff;
}

const roleOf = (api: Api): Field => {
  const body = JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.people')!.body) as { fields: Field[] };
  return body.fields.find((f) => f.id === 'role')!;
};

/** People as `version`, with `registrar` taken off `role` and `more` fields after its own. */
const people = (version: string, more: Field[] = []): Doc => {
  const d = structuredClone(firstPartyDocument('people')) as unknown as Doc;
  d.version = version;
  d.declarations = d.declarations.map((x) =>
    x.register === 'people' && Array.isArray(x.fields)
      ? { ...x, fields: [...(x.fields as Field[]).map((f) => (f.id === 'role' ? { ...f, values: f.values!.filter((v) => v !== 'registrar') } : f)), ...more] }
      : x,
  );
  return d;
};

test('People 2.0.0 without registrar keeps it on a list whose rows may hold it, and a row holding it can still be edited', async () => {
  const { api, close } = await recordOf(FIRST_PARTY.map((id) => (id === 'people' ? peopleBefore() : firstPartyDocument(id))));
  const row = said<{ id: string }>(api.kernel.create('people', { name: 'Nordhaven', role: 'registrar' }, { actor: 'p_1' }));
  const diff = await put(api, people('2.0.0'));
  said(api.kernel.update('people', row.id, { note: 'Renews in October' }, { actor: 'p_1' }));
  assert.equal(api.kernel.get(row.id)!.fields.role, 'registrar');
  const role = roleOf(api);
  assert.deepEqual(role.values, ['client', 'contractor', 'accountant', 'collaborator', 'other', 'cofounder', 'partner', 'staff', 'registrar'], 'registrar came back ahead of the update’s own values');
  assert.deepEqual(diff.stays.map((s) => [s.id, s.values]), [['register.people', ['role.registrar']]], 'the plan did not say it keeps the value');
  close();
});

test('a People list with no rows takes 2.0.0 without registrar, as it always did', async () => {
  const bare = structuredClone(peopleBefore()) as unknown as Doc;
  bare.seeds = [];
  const { api, close } = await recordOf([firstPartyDocument('portfolio'), bare]);
  assert.equal(api.kernel.count('people'), 0);
  const next = people('2.0.0');
  next.seeds = [];
  const diff = await put(api, next);
  assert.ok(!roleOf(api).values!.includes('registrar'));
  assert.deepEqual(diff.stays, []);
  close();
});

test('the value kept stays across the next update of People, which changes the list again', async () => {
  const { api, close } = await recordOf(FIRST_PARTY.map((id) => (id === 'people' ? peopleBefore() : firstPartyDocument(id))));
  said(api.kernel.create('people', { name: 'Nordhaven', role: 'registrar' }, { actor: 'p_1' }));
  await put(api, people('2.0.0'));
  const diff = await put(api, people('2.1.0', [{ id: 'pronouns', label: 'Pronouns', type: 'text' }]));
  assert.deepEqual(diff.conflicts, []);
  const body = JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.people')!.body) as { fields: Field[] };
  assert.ok(body.fields.some((f) => f.id === 'pronouns'));
  assert.ok(roleOf(api).values!.includes('registrar'), 'the second update dropped the value the first one kept');
  close();
});

/* ── plan alone, over a record built by hand ── */

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

const packOf = async (doc: unknown): Promise<Pack> => said<Pack>(await normalise(doc));

const WITHOUT_EARNING = () => FIELDS().map((f) => (f.id === 'lane' ? { ...f, values: ['building', 'parked'], labels: { building: 'Building', parked: 'Parked' } } : f));

/** mini 1.0.0 installed under the pack's own name, with `rows` rows in its list. */
async function recordAt(rows: number, extra: Installed['declarations'] = []): Promise<Installed> {
  const d = (await packOf(DOC('1.0.0'))).declarations[0]!;
  return {
    format: 1,
    primitives: 1,
    record_version: 3,
    packs: [{ id: 'mini', version: '1.0.0' }],
    declarations: [{ id: d.id, version: 1, kind: d.kind, pack_id: 'mini', body: d.canonical, checksum: 'c' }, ...extra],
    rows: { things: rows },
  };
}

test('the value is laid back after the update’s own values, with the label the list had for it', async () => {
  const diff = await plan(await packOf(DOC('1.1.0', WITHOUT_EARNING())), await recordAt(5));
  assert.deepEqual(diff.stays.map((s) => [s.id, s.values, s.rows]), [['register.things', ['lane.earning'], 5]]);
  const lane = (JSON.parse(diff.stays[0]!.body!) as { fields: Field[] }).fields.find((f) => f.id === 'lane')!;
  assert.deepEqual(lane.values, ['building', 'parked', 'earning']);
  assert.deepEqual(lane.labels, { building: 'Building', parked: 'Parked', earning: 'Earning' });
});

/* ONE ROW, UNDER THE PACK, and not the pack's body then the kept list with no pack after it. Staged with no pack the list
   read as changed in the app, and the next update of the pack was filed for Decide as keeping the owner's edit
   (`pack-extends.test.ts`). */
test('install stages the list with the value kept as the pack’s own body of it, in one row', async () => {
  const next = await packOf(DOC('1.1.0', WITHOUT_EARNING()));
  const diff = await plan(next, await recordAt(5));
  const batches: { id: string; pack?: string; lane: unknown }[][] = [];
  const host: Host = {
    count: () => 0,
    stage: async (batch) => (
      batches.push(batch.map((x) => ({ id: x.id, ...(x.pack === undefined ? {} : { pack: x.pack }), lane: ((x.body as { fields: Field[] }).fields ?? []).find((f) => f.id === 'lane')?.values }))),
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
  said(await install(next, diff, host, diff.planHash));
  assert.deepEqual(batches, [[{ id: 'register.things', pack: 'mini', lane: ['building', 'parked', 'earning'] }]]);
});

test('a page the owner changed that asks for the value is not refused over it, because the value stays', async () => {
  const page = { page: 'earning', title: 'Earning', blocks: [{ kind: 'table', heading: 'Earning', source: 'register.things', where: 'lane is earning', columns: [{ field: 'name' }] }] };
  const first = (await packOf(DOC('1.0.0', FIELDS(), [page]))).declarations.find((d) => d.id === 'page.earning')!;
  const installed = await recordAt(5, [{ id: first.id, version: 2, kind: first.kind, pack_id: null, body: JSON.stringify({ ...JSON.parse(first.canonical), title: 'Mine' }), checksum: 'p' }]);
  installed.detached = { [first.id]: { was: 'mini', body: first.canonical } };
  const withRows = await plan(await packOf(DOC('1.1.0', WITHOUT_EARNING(), [page])), installed);
  assert.deepEqual(withRows.conflicts, []);
  /* AND WITH NO ROWS THE VALUE GOES, so the page asking for it is the conflict it always was. */
  const empty = await plan(await packOf(DOC('1.1.0', WITHOUT_EARNING(), [page])), { ...installed, rows: { things: 0 } });
  assert.deepEqual(empty.conflicts, [{ id: 'page.earning', pack: '(this record)', reads: 'register.things', field: 'lane', value: 'earning' }]);
});

test('a list the owner added to keeps the value too, laid into the rebased body', async () => {
  const d = (await packOf(DOC('1.0.0'))).declarations[0]!;
  const edited = JSON.parse(d.canonical) as { fields: Field[] };
  const installed: Installed = {
    format: 1,
    primitives: 1,
    record_version: 3,
    packs: [{ id: 'mini', version: '1.0.0' }],
    declarations: [{ id: d.id, version: 2, kind: d.kind, pack_id: null, body: JSON.stringify({ ...edited, fields: [...edited.fields, { id: 'domain', type: 'url' }] }), checksum: 'e' }],
    rows: { things: 5 },
    detached: { [d.id]: { was: 'mini', body: d.canonical } },
  };
  const diff = await plan(await packOf(DOC('1.1.0', WITHOUT_EARNING())), installed);
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.stays.map((s) => [s.id, s.values, s.body]), [['register.things', ['lane.earning'], undefined]]);
  const rebased = JSON.parse(diff.kept[0]!.rebased!) as { fields: Field[] };
  assert.deepEqual(rebased.fields.map((f) => f.id), ['name', 'lane', 'note', 'domain']);
  assert.deepEqual(rebased.fields.find((f) => f.id === 'lane')!.values, ['building', 'parked', 'earning']);
});
