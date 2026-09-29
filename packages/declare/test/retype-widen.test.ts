/**
 * A closed list opened to text on a record that holds rows.
 *
 * BOTH REFUSALS, MEASURED. One money-core step up whose `holdings.kind` was `text` in place of the four-value `enum`
 * answered `FIELD_TYPE_CHANGED` with the fix "Retire the field and add a new one", from `declare` and again from the
 * kernel. Every stored value was already valid text, so nothing was protected, and the fix would have split one column
 * into two. `updates.by` (`packages/seed/src/modules/work.ts`) could not become open text on any record holding an update.
 *
 * THE KERNEL'S `widens` IS THE ONE ANSWER. The kernel half landed with `packages/kernel/test/retype-widen.test.ts`; this
 * is the `declare` half, and it is driven through the record's own `planPack` and `installPack`, because a plan that
 * lets the widening through while the install still refuses it is the same wall one screen later.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, plan, type Diff, type Installed, type Pack } from '../src/index.ts';
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

/** Work one minor step up, with `by` on `updates` rewritten by `to`. */
const work = (to: (f: Field) => Field): Doc => {
  const d = structuredClone(firstPartyDocument('work')) as unknown as Doc;
  const [major, minor] = FIRST_PARTY_VERSIONS.work.split('.').map(Number) as [number, number];
  d.version = `${major}.${minor + 1}.0`;
  d.declarations = d.declarations.map((x) =>
    x.register === 'updates' && Array.isArray(x.fields) ? { ...x, fields: (x.fields as Field[]).map((f) => (f.id === 'by' ? to(f) : f)) } : x,
  );
  return d;
};

const open = ({ values: _v, labels: _l, ...f }: Field): Field => ({ ...f, type: 'text' });

test('updates.by OPENED FROM A FOUR-VALUE enum TO text INSTALLS over the rows it holds, and a fifth agent can write', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)) });
  const k = api.kernel;
  for (const id of FIRST_PARTY) {
    const doc = firstPartyDocument(id);
    const planned = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
    said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  }
  const track = said<{ id: string }>(k.create('tracks', { name: 'Kiln licence', state: 'open' }, { actor: 'p_1' }));
  said(k.create('updates', { body: 'Licence drafted', health: 'on_track', track: track.id, by: 'claude', at: '2026-09-21T09:00:00Z' }, { actor: 'p_1' }));
  const held = k.count('updates');

  const next = work(open);
  const planned = said<{ diff: Diff }>(await api.planPack({ doc: next, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(planned.diff.retypes, [], 'a widening was planned as a retype');
  said(await api.installPack({ doc: next, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));

  const by = (JSON.parse(k.declarations().find((d) => d.id === 'register.updates')!.body) as { fields: Field[] }).fields.find((f) => f.id === 'by')!;
  assert.equal(by.type, 'text');
  assert.equal(k.count('updates'), held, 'rows were lost on the way');
  said(k.create('updates', { body: 'Gemini read the thread', health: 'on_track', track: track.id, by: 'gemini', at: '2026-09-22T12:00:00Z' }, { actor: 'p_1' }));
  sql.close();
});

/* ── plan alone: which changes over rows are still retypes ─────────────── */

const DOC = (version: string, fields: Field[]) => ({
  pack: 'mini',
  version,
  summary: 'Holdings.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'holdings', name: 'Holdings', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, ...fields] }],
});

const packOf = async (doc: unknown): Promise<Pack> => said<Pack>(await normalise(doc));

async function installedWith(fields: Field[]): Promise<Installed> {
  const first = await packOf(DOC('1.0.0', fields));
  const d = first.declarations[0]!;
  return {
    format: 1,
    primitives: 1,
    record_version: 3,
    packs: [{ id: 'mini', version: '1.0.0' }],
    declarations: [{ id: d.id, version: 1, kind: d.kind, pack_id: 'mini', body: d.canonical, checksum: 'c' }],
    rows: { holdings: 3 },
  };
}

const KIND: Field = { id: 'kind', type: 'enum', values: ['gold', 'certificate', 'policy', 'other'] };
const TAGS: Field = { id: 'marks', type: 'list', of: 'enum', values: ['a', 'b'] };

test('A WIDENING IS NOT IN diff.retypes, and a narrowing or an enum to ref still is', async () => {
  const cases: [Field, Field, Diff['retypes']][] = [
    [KIND, { id: 'kind', type: 'text' }, []],
    [TAGS, { id: 'marks', type: 'list', of: 'text' }, []],
    [KIND, { id: 'kind', type: 'ref', to: 'holdings' }, [{ id: 'register.holdings', field: 'kind', from: 'enum', to: 'ref', rows: 3 }]],
    [{ id: 'kind', type: 'text' }, KIND, [{ id: 'register.holdings', field: 'kind', from: 'text', to: 'enum', rows: 3 }]],
    [TAGS, { id: 'marks', type: 'text' }, [{ id: 'register.holdings', field: 'marks', from: 'list<"enum">', to: 'text', rows: 3 }]],
  ];
  for (const [was, now, retypes] of cases) {
    const diff = await plan(await packOf(DOC('1.1.0', [now])), await installedWith([was]));
    assert.deepEqual(diff.retypes, retypes, `${JSON.stringify(was)} to ${JSON.stringify(now)}`);
  }
});
