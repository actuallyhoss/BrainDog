/**
 * A choice an update takes off a closed list stays only where a row holds it (`loop/research-batch-forty-eight-audit.md`
 * finding 4).
 *
 * THE LIST'S ROW COUNT STOOD IN FOR THE HOLDERS. `plan` laid a value back whenever `installed.rows[list] > 0`, so a
 * Personal record whose three People rows were all Family was filed as keeping Agency (Personal's word for `registrar`),
 * and Decide said "People keeps the choice Agency for Role, which this update takes off, because it holds 3 rows that
 * may use it" (`decide-personal.mts` and `keeps-people.mts` in the audit's probes). None of the three held it. The
 * reason for keeping a value, that a row holding it could not be edited once it went, is a reason only for a row that
 * holds it.
 *
 * SO THE PLAN IS HANDED A COUNT PER VALUE (`Installed.holding`), one `GROUP BY` for each list it takes a value off, and
 * keeps a value only where the count is above zero. Taking a value off when nothing holds it is what the update asked
 * for. A record that cannot count (`holding` absent, or `null` for a list) keeps every value, as before, because the
 * other side of that line is an edit refused `ENUM_VALUE_UNKNOWN` (`update-keeps-value.test.ts`).
 *
 * `holdingOf` BELOW IS THE QUERY THE RECORD'S `installedState` IS TO USE, run here against a real kernel's `entry`
 * table, so the query is tested and not only the rule.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, plannedState, type Diff, type Host, type Installed, type Pack } from '../src/index.ts';
import type { Kernel } from '@braindog/kernel';
import { createRecordApi } from '../../record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../seed/src/index.ts';

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Field = { id: string; type: string; values?: string[]; labels?: Record<string, string>; [k: string]: unknown };

/* ── plan alone, over a record built by hand ── */

const FIELDS = (): Field[] => [
  { id: 'name', type: 'text', required: true },
  { id: 'lane', type: 'enum', values: ['building', 'earning'], labels: { building: 'Building', earning: 'Earning' } },
  { id: 'note', type: 'text' },
];
const WITHOUT_EARNING = () => FIELDS().map((f) => (f.id === 'lane' ? { ...f, values: ['building', 'parked'], labels: { building: 'Building', parked: 'Parked' } } : f));

const DOC = (version: string, fields = FIELDS(), seeds?: unknown[]) => ({
  pack: 'mini',
  version,
  summary: 'Projects.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'things', name: 'Projects', title: 'name', fields: [...fields, ...(seeds === undefined ? [] : [{ id: 'tags', type: 'list', of: 'text' }])] }],
  ...(seeds === undefined ? {} : { seeds }),
});

const packOf = async (doc: unknown): Promise<Pack> => said<Pack>(await normalise(doc));

/** mini 1.0.0 installed, with five rows in its list and `holding` as the record would count them. */
async function recordAt(holding: Installed['holding']): Promise<Installed> {
  const d = (await packOf(DOC('1.0.0'))).declarations[0]!;
  return {
    format: 1,
    primitives: 1,
    record_version: 3,
    packs: [{ id: 'mini', version: '1.0.0' }],
    declarations: [{ id: d.id, version: 1, kind: d.kind, pack_id: 'mini', body: d.canonical, checksum: 'c' }],
    rows: { things: 5 },
    ...(holding === undefined ? {} : { holding }),
  };
}

test('A VALUE NO ROW HOLDS IS TAKEN OFF, as the update asked, though the list holds five rows', async () => {
  const diff = await plan(await packOf(DOC('1.1.0', WITHOUT_EARNING())), await recordAt(() => ({ lane: { building: 5 } })));
  assert.deepEqual(diff.stays, [], 'earning was kept on the list count alone');
  assert.deepEqual(diff.changes.map((c) => c.id), ['register.things']);
});

test('A VALUE ONE ROW HOLDS STAYS, and the plan says how many rows hold it beside how many the list has', async () => {
  const diff = await plan(await packOf(DOC('1.1.0', WITHOUT_EARNING())), await recordAt(() => ({ lane: { building: 4, earning: 1 } })));
  assert.deepEqual(
    diff.stays.map(({ id, values, rows, holding }) => ({ id, values, rows, holding })),
    [{ id: 'register.things', values: ['lane.earning'], rows: 5, holding: { 'lane.earning': 1 } }],
  );
});

test('the record is asked once for the list, and only about the fields that lose a value', async () => {
  const asked: [string, readonly string[]][] = [];
  await plan(await packOf(DOC('1.1.0', WITHOUT_EARNING())), await recordAt((list, fields) => (asked.push([list, fields]), { lane: { earning: 2 } })));
  assert.deepEqual(asked, [['things', ['lane']]]);
});

/* GREEN BEFORE AND AFTER, and kept so: a record that cannot count keeps the value, which is the side of the line where no
   edit is refused. */
test('a record that cannot count the list keeps every value, as before', async () => {
  for (const holding of [undefined, () => null]) {
    const diff = await plan(await packOf(DOC('1.1.0', WITHOUT_EARNING())), await recordAt(holding));
    assert.deepEqual(diff.stays.map(({ values, rows, holding: h }) => ({ values, rows, h })), [{ values: ['lane.earning'], rows: 5, h: undefined }]);
  }
});

/* THE EXAMPLES A PLAN WRITES ARE NOT IN THE TABLE YET. `plannedState` counts a seeded list's rows from its seeds, so the
   next pack in the same arrangement would read rows and ask the table, which holds none of them, and take off a value
   the examples are about to be written under. The kernel's stage check refuses that half-way through the accept. */
test('a list this plan seeds cannot be counted from the table, so the state after it says so', async () => {
  const pack = await packOf(DOC('1.0.0', FIELDS(), [{ register: 'things', fields: { name: 'Kiln', lane: 'earning' } }]));
  const empty: Installed = { format: 1, primitives: 1, record_version: 1, packs: [], declarations: [], rows: {}, holding: () => ({}) };
  const next = plannedState(empty, pack, await plan(pack, empty));
  assert.equal(next.rows.things, 1);
  assert.equal(next.holding?.('things', ['lane']), null, 'the seeded list was counted from a table its examples are not in yet');
});

/* ── a real record: first-party People, and People 2.0.0 without `registrar` ── */

/**
 * How many live rows hold each value of each of `fields` on `list`, by field then value: ONE `GROUP BY` per list. A
 * `list<enum>` field is an array in `fields`, so each element is its own value, counted once per row.
 */
const holdingOf =
  (sql: NodeSql) =>
  (list: string, fields: readonly string[]): Record<string, Record<string, number>> => {
    const out: Record<string, Record<string, number>> = {};
    if (fields.length === 0) return out;
    for (const r of sql.all<{ field: string; v: unknown; n: number }>(
      `SELECT j.key AS field, k.value AS v, count(DISTINCT entry.id) AS n
         FROM entry, json_each(entry.fields) AS j, json_each(CASE WHEN j.type = 'array' THEN j.value ELSE json_array(j.value) END) AS k
        WHERE entry.register = ? AND entry.deleted_at IS NULL AND j.key IN (${fields.map(() => '?').join(', ')}) AND k.type = 'text'
        GROUP BY field, v`,
      list,
      ...fields,
    ))
      (out[r.field] ??= {})[String(r.v)] = Number(r.n);
    return out;
  };

const stateOf = (k: Kernel, sql: NodeSql): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  detached: Object.fromEntries(k.detached().map((d) => [d.id, { was: d.was, body: d.body }])),
  holding: holdingOf(sql),
});

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

/** People as 2.0.0 with `registrar` taken off `role`. */
const people2 = (): unknown => {
  const d = structuredClone(firstPartyDocument('people')) as unknown as { version: string; declarations: Record<string, unknown>[] };
  d.version = '2.0.0';
  d.declarations = d.declarations.map((x) =>
    x.register === 'people' && Array.isArray(x.fields) ? { ...x, fields: (x.fields as Field[]).map((f) => (f.id === 'role' ? { ...f, values: f.values!.filter((v) => v !== 'registrar') } : f)) } : x,
  );
  return d;
};

async function peopleWith(roles: readonly string[]): Promise<{ k: Kernel; sql: NodeSql; ids: string[]; diff: Diff; next: Pack }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)) });
  const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' } } as const;
  /* WITHOUT THEIR EXAMPLES, which are rows too and hold roles of their own: the rows below are the whole list. */
  for (const id of ['portfolio', 'people'] as const) {
    const doc = { ...(firstPartyDocument(id) as unknown as Record<string, unknown>), seeds: [] };
    const d = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
    said(await api.installPack({ doc, source: { kind: 'local' }, planHash: d.planHash, approve: d.approve } as never, owner));
  }
  const k = api.kernel;
  const ids = roles.map((role, i) => said<{ id: string }>(k.create('people', { name: `P${i}`, role }, { actor: 'p_1' })).id);
  const next = said<Pack>(await normalise(people2(), { kind: 'local' }));
  return { k, sql, ids, diff: await plan(next, stateOf(k, sql)), next };
}

const roleValues = (k: Kernel): string[] =>
  (JSON.parse(k.declarations().find((d) => d.id === 'register.people')!.body) as { fields: Field[] }).fields.find((f) => f.id === 'role')!.values!;

test('THREE CLIENT ROWS AND NO REGISTRAR: the update takes registrar off, installs, and every row still edits', async () => {
  const { k, sql, ids, diff, next } = await peopleWith(['client', 'client', 'client']);
  assert.equal(k.census().people, 3);
  assert.deepEqual(diff.stays, [], 'registrar was kept for three rows none of which holds it');
  said(await install(next, diff, hostFor(k), diff.planHash, diff.approve));
  assert.ok(!roleValues(k).includes('registrar'));
  for (const id of ids) said(k.update('people', id, { note: 'Renews in October' }, { actor: 'p_1' }));
  sql.close();
});

test('ONE REGISTRAR ROW OF TWO: registrar stays, counted as one holder of two rows, and that row still edits', async () => {
  const { k, sql, ids, diff, next } = await peopleWith(['registrar', 'client']);
  assert.deepEqual(
    diff.stays.map(({ id, values, rows, holding }) => ({ id, values, rows, holding })),
    [{ id: 'register.people', values: ['role.registrar'], rows: 2, holding: { 'role.registrar': 1 } }],
  );
  said(await install(next, diff, hostFor(k), diff.planHash, diff.approve));
  assert.ok(roleValues(k).includes('registrar'));
  said(k.update('people', ids[0]!, { note: 'Renews in October' }, { actor: 'p_1' }));
  sql.close();
});
