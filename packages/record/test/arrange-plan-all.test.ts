/**
 * What `propose` files for an arrangement is what the accept does (the arranger's half; `declare`'s
 * `plan-all-refusals.test.ts` holds the three functions this reads).
 *
 * THE ARRANGER FILED WHAT THE ACCEPT REFUSED, HALF-WAY, and said an update was not taken when it was. `planAll` asked
 * each pack `unresolvedFault` and `conflictFault` and nothing else `install` refuses, carried `{ id, version }` and the
 * pack's file forward as the next pack's record, planned in the order it was given, and put every `kept` entry in the
 * step's `keeps`, a rebased one included. Measured before the fix:
 *
 *     base 2.0.0, leaf 1.1.0       filed   accept PACK_REQUIRED "... Update leaf ... first"
 *     plus, then quux              filed   accept PROVIDES_CONFLICT "folk has a field called domain already ..."
 *     plus, then folk 2.0.0        filed   accept PROVIDES_CONFLICT "... you added one with that id already"
 *     quux alone, plus installed   filed   accept PROVIDES_CONFLICT
 *     folk 1.1.0 over what plus laid   filed as keeps ["register.folk"], installed its field
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type CatalogueEntry } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
type Step = { pack: string; from?: string; version: string; adds: string[]; changes?: string[]; keeps?: string[] };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const head = (pack: string, version: string, packs: Record<string, string> = {}) => ({
  pack,
  version,
  summary: `${pack}.`,
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs },
});
const list = (pack: string, register: string, more: Record<string, unknown>[] = []) => ({
  register,
  name: register,
  title: 'name',
  pack,
  fields: [{ id: 'name', type: 'text', required: true }, ...more],
});
const BASE = (version: string) => ({ ...head('base', version), declarations: [list('base', 'bases')] });
const LEAF = (version: string, range: string) => ({ ...head('leaf', version, { base: range }), declarations: [list('leaf', 'leaves')] });
const FOLK = (version: string, more: Record<string, unknown>[] = []) => ({ ...head('folk', version), declarations: [list('folk', 'folk', more)] });
const LAYS = (pack: string, type: string) => ({ ...head(pack, '1.0.0'), extends: { 'register.folk': { fields: [{ id: 'domain', type }] } } });

/** A record whose catalogue offers whatever `offered` holds at the time it is asked. */
async function recordOf(offered: Record<string, unknown>) {
  const catalogue: CatalogueEntry[] = Object.keys(offered).map((id) => ({ id, kind: 'pack', title: id, summary: id, modules: [], doc: () => offered[id] as never }));
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)), catalogue });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 's', name: 'S', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } });
  const take = async (body: Record<string, unknown>, kind = 'pack'): Promise<Out> => {
    const filed = (await api.propose({ question: 'Take it?', body_kind: kind, body } as never, owner)) as Out;
    if (!filed.ok) return filed;
    return (await api.decide({ id: (filed.value as { id: string }).id, decide: { option: 'accept', reason: 'x' } } as never, owner)) as Out;
  };
  /* THE PROPOSAL ALONE, so a refusal here is the arranger's and not the accept's. */
  const ask = async (body: Record<string, unknown>, kind = 'pack'): Promise<Out> => (await api.propose({ question: 'Take it?', body_kind: kind, body } as never, owner)) as Out;
  const planOf = async (body: Record<string, unknown>, kind = 'pack') => {
    const filed = value<{ id: string }>(await api.propose({ question: 'Plan it?', body_kind: kind, body } as never, owner));
    return value<{ id: string; body: { packs?: { install?: string[] }; plan?: Step[] } }>(await api.governance({ id: filed.id }, owner));
  };
  return { api, sql, take, ask, planOf };
}

test('BASE 2.0.0 WITH LEAF 1.1.0 IS FILED IN THE ORDER THAT INSTALLS, whichever order the proposal named them in', async () => {
  for (const order of [['base', 'leaf'], ['leaf', 'base']]) {
    const offered: Record<string, unknown> = { base: BASE('1.0.0'), leaf: LEAF('1.0.0', '^1.0.0') };
    const { api, sql, take, planOf } = await recordOf(offered);
    for (const id of ['base', 'leaf']) value(await take({ install: id }));
    offered.base = BASE('2.0.0');
    offered.leaf = LEAF('1.1.0', '>=1.0.0 <3.0.0');
    const row = await planOf({ why: ['x'], packs: { install: order } }, 'arrange');
    assert.deepEqual(row.body.packs?.install, ['leaf', 'base'], `named ${order.join(', ')}`);
    assert.deepEqual(row.body.plan?.map((s) => s.pack), ['leaf', 'base']);
    value(await api.decide({ id: row.id, decide: { option: 'accept', reason: 'x' } } as never, owner));
    assert.deepEqual(api.kernel.packs().map((p) => `${p.id} ${p.version}`).sort(), ['base 2.0.0', 'leaf 1.1.0']);
    sql.close();
  }
});

test('A PAIR NO ORDER INSTALLS IS REFUSED AT THE PROPOSAL, in the words the accept would have used', async () => {
  const offered: Record<string, unknown> = { base: BASE('1.0.0'), leaf: LEAF('1.0.0', '^1.0.0') };
  const { sql, take, ask } = await recordOf(offered);
  for (const id of ['base', 'leaf']) value(await take({ install: id }));
  offered.base = BASE('2.0.0');
  offered.leaf = LEAF('1.1.0', '^1.0.0');
  const out = await ask({ why: ['x'], packs: { install: ['base', 'leaf'] } }, 'arrange');
  assert.equal(out.ok, false, 'filed an arrangement the accept refuses');
  assert.equal(out.refusal?.code, 'PACK_REQUIRED');
  assert.equal(out.refusal?.at, 'body.packs');
  sql.close();
});

test('PLUS THEN QUUX, both laying domain on folk, is refused at the proposal and nothing is filed', async () => {
  const { api, sql, take, ask } = await recordOf({ folk: FOLK('1.0.0'), plus: LAYS('plus', 'text'), quux: LAYS('quux', 'int') });
  value(await take({ install: 'folk' }));
  value(api.kernel.create('folk', { name: 'Ada' }, { actor: 'p_owner' }));
  const out = await ask({ why: ['x'], packs: { install: ['plus', 'quux'] } }, 'arrange');
  assert.equal(out.ok, false, 'filed an arrangement the accept refuses half-way');
  assert.equal(out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.match(out.refusal?.fix ?? '', /folk has a field called domain already/u);
  assert.deepEqual(api.kernel.packs().map((p) => p.id), ['folk']);
  sql.close();
});

test('PLUS THEN FOLK 2.0.0 declaring the field plus lays is refused at the proposal', async () => {
  const offered: Record<string, unknown> = { folk: FOLK('1.0.0'), plus: LAYS('plus', 'text') };
  const { api, sql, take, ask } = await recordOf(offered);
  value(await take({ install: 'folk' }));
  value(api.kernel.create('folk', { name: 'Ada' }, { actor: 'p_owner' }));
  offered.folk = FOLK('2.0.0', [{ id: 'domain', type: 'int' }]);
  const out = await ask({ why: ['x'], packs: { install: ['plus', 'folk'] } }, 'arrange');
  assert.equal(out.ok, false, 'filed an arrangement the accept refuses half-way');
  assert.equal(out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.deepEqual(api.kernel.packs().map((p) => `${p.id} ${p.version}`), ['folk 1.0.0']);
  sql.close();
});

test('ONE PACK LAYING A FIELD ANOTHER ALREADY LAID is refused at the proposal, not at the accept', async () => {
  const { sql, take, ask } = await recordOf({ folk: FOLK('1.0.0'), plus: LAYS('plus', 'text'), quux: LAYS('quux', 'int') });
  for (const id of ['folk', 'plus']) value(await take({ install: id }));
  const out = await ask({ install: 'quux' });
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.equal(out.refusal?.at, 'body.packs');
  sql.close();
});

test('AN UPDATE OF A LIST ANOTHER PACK LAID ON IS FILED AS A CHANGE, since it installs, and not as kept', async () => {
  const offered: Record<string, unknown> = { folk: FOLK('1.0.0'), plus: LAYS('plus', 'text') };
  const { api, sql, take, planOf } = await recordOf(offered);
  for (const id of ['folk', 'plus']) value(await take({ install: id }));
  offered.folk = FOLK('1.1.0', [{ id: 'born', type: 'day' }]);
  const row = await planOf({ install: 'folk' });
  const step = row.body.plan?.find((s) => s.pack === 'folk');
  assert.deepEqual([step?.changes, step?.keeps], [['register.folk'], undefined], JSON.stringify(row.body.plan));
  value(await api.decide({ id: row.id, decide: { option: 'accept', reason: 'x' } } as never, owner));
  const fields = (JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.folk')!.body) as { fields: { id: string }[] }).fields.map((f) => f.id);
  assert.deepEqual(fields, ['name', 'born', 'domain']);
  sql.close();
});
