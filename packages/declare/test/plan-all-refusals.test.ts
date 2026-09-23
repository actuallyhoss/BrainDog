/**
 * An arrangement planned pack by pack, each against the record as the ones before it leave it
 * (`loop/research-batch-forty-four-audit.md` finding 3).
 *
 * THE ARRANGER FILED WHAT THE ACCEPT REFUSED, HALF-WAY. `planAll` in `@braindog/record` asked each pack `unresolvedFault`
 * and `conflictFault`, and neither `dependents` nor `extends[].refusal`, and carried `{ id, version }` and the pack's
 * file forward as the state the next pack is planned against. The audit measured, through `propose` and `decide`:
 *
 *     base 2.0.0, leaf 1.1.0     filed   accept PACK_REQUIRED "leaf 1.0.0 needs base ^1.0.0 ... Update leaf ... first"
 *     leaf 1.1.0, base 2.0.0     filed   accept ok
 *     plus, then quux            filed   accept PROVIDES_CONFLICT "folk has a field called domain already ..."
 *     plus, then folk 2.0.0      filed   accept PROVIDES_CONFLICT "... you added one with that id already"
 *
 * `declare` now answers the three questions that needs: `installFault` is every refusal `install` reads off a diff,
 * `plannedState` is the record as an install leaves it, and `installOrder` puts a pack after the one it has to wait for.
 * The fold is held to the kernel here: the state `plannedState` says and the state a real install leaves are compared
 * row for row, since a fold that is only close is the defect this file is about.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installFault, installOrder, normalise, plan, plannedState, type Diff, type Installed, type Pack } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const packOf = async (doc: unknown): Promise<Pack> => said<Pack>(await normalise(doc));

const doc = (pack: string, version: string, requires: Record<string, string> = {}, more: Record<string, unknown> = {}) => ({
  pack,
  version,
  summary: `${pack}.`,
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: requires },
  ...more,
});

/* ── the held range, on a record built by hand ── */

const list = (id: string) => ({ register: id, name: id, title: 'name', fields: [{ id: 'name', type: 'text', required: true }] });
const BASE = (version: string) => doc('base', version, {}, { declarations: [list('bases')] });
const LEAF = (version: string, range: string) => doc('leaf', version, { base: range }, { declarations: [list('leaves')] });

/** base 1.0.0 and leaf 1.0.0 on `^1.0.0`, as `arrange-held.mts` held them. */
async function held(): Promise<Installed> {
  const rows: Installed['declarations'] = [];
  for (const [p, id] of [
    [await packOf(BASE('1.0.0')), 'base'],
    [await packOf(LEAF('1.0.0', '^1.0.0')), 'leaf'],
  ] as const)
    for (const d of p.declarations) rows.push({ id: d.id, version: 1, kind: d.kind, pack_id: id, body: d.canonical, checksum: d.id });
  return {
    format: 1,
    primitives: 1,
    record_version: 4,
    packs: [
      { id: 'base', version: '1.0.0', requires: {} },
      { id: 'leaf', version: '1.0.0', requires: { base: '^1.0.0' } },
    ],
    declarations: rows,
    rows: {},
  };
}

test('installFault says what install says: base 2.0.0 under leaf 1.0.0 on ^1.0.0 is PACK_REQUIRED before anything is filed', async () => {
  const diff = await plan(await packOf(BASE('2.0.0')), await held());
  const fault = installFault(await packOf(BASE('2.0.0')), diff);
  assert.equal(fault?.code, 'PACK_REQUIRED');
  assert.equal(fault?.at, 'dependents.leaf');
});

test('INSTALL ORDER PUTS BASE AFTER THE LEAF THAT LEANS ON IT, and each step then plans clean against the one before', async () => {
  const installed = await held();
  const base = await packOf(BASE('2.0.0'));
  const leaf = await packOf(LEAF('1.1.0', '>=1.0.0 <3.0.0'));
  const coming = [base, leaf].map((p) => ({ id: p.manifest.pack, version: p.manifest.version, requires: p.manifest.requires.packs }));
  assert.deepEqual(installOrder(coming, installed), ['leaf', 'base']);
  assert.deepEqual(installOrder([...coming].reverse(), installed), ['leaf', 'base']);

  const first = await plan(leaf, installed);
  assert.equal(installFault(leaf, first), null);
  const after = plannedState(installed, leaf, first);
  /* THE RANGE TRAVELS WITH THE ROW, or base 2.0.0 is planned against a leaf that asks nothing of it. */
  assert.deepEqual(after.packs.find((p) => p.id === 'leaf'), { id: 'leaf', version: '1.1.0', requires: { base: '>=1.0.0 <3.0.0' } });
  const second = await plan(base, after);
  assert.deepEqual(second.dependents, [{ id: 'leaf', version: '1.1.0', range: '>=1.0.0 <3.0.0', ok: true, was: true }]);
  assert.equal(installFault(base, second), null);
});

test('a leaf that needs the new base waits for it, and a pair no order installs is left as given', async () => {
  const installed = await held();
  const base = { id: 'base', version: '2.0.0', requires: {} };
  /* LEAF'S HELD RANGE TAKES 2.0.0, SO BASE MAY GO FIRST, and leaf 1.1.0 needs it to. */
  const open = { ...installed, packs: installed.packs.map((p) => (p.id === 'leaf' ? { ...p, requires: { base: '>=1.0.0' } } : p)) };
  assert.deepEqual(installOrder([{ id: 'leaf', version: '1.1.0', requires: { base: '^2.0.0' } }, base], open), ['base', 'leaf']);
  /* HELD LEAF REFUSES 2.0.0 AND THE NEW LEAF NEEDS IT: neither can go first. */
  assert.deepEqual(installOrder([base, { id: 'leaf', version: '1.1.0', requires: { base: '^2.0.0' } }], installed), ['base', 'leaf']);
});

/*
 * A COLOUR A SETTING PUTS INTO A BODY IS ONE MORE REFUSAL THE DIFF ALONE DECIDES. The checker of this change found it
 * left in `install` after the approvals, so `installFault` answered `null` for a pack whose chosen `shade: '#ff00aa'`
 * the accept then refused `COLOUR_OUTSIDE_THEME` (`config.test.ts` drives the install half).
 */
test('installFault refuses a colour a chosen setting writes into a body, as install does', async () => {
  const pack = await packOf(
    doc('shady', '1.0.0', {}, {
      config: { shade: { type: 'text', default: 'plain' } },
      declarations: [{ register: 'shades', name: 'Shades', title: 'name', fields: [{ id: 'name', type: 'text', required: true, label: '{{config:shade}}' }] }],
    }),
  );
  const bare: Installed = { format: 1, primitives: 1, record_version: 1, packs: [], declarations: [], rows: {}, config: { shady: { shade: '#ff00aa' } } };
  const fault = installFault(pack, await plan(pack, bare));
  assert.equal(fault?.code, 'COLOUR_OUTSIDE_THEME');
  assert.equal(fault?.at, 'register.shades.fields[0].label');
});

/* ── what extends lays, through the record, held to the kernel ── */

const FOLK = (version: string, fields: Record<string, unknown>[] = []) =>
  doc('folk', version, {}, { declarations: [{ register: 'folk', name: 'Folk', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, ...fields] }] });
const LAYING = (pack: string, type: string) => doc(pack, '1.0.0', {}, { extends: { 'register.folk': { fields: [{ id: 'domain', type }] } } });

type Api = Awaited<ReturnType<typeof createRecordApi>>;

async function recordWithFolk(): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)) });
  said(await put(api, FOLK('1.0.0')));
  said(api.kernel.create('folk', { name: 'Ada' }, { actor: 'p_1' }));
  return { api, close: () => sql.close() };
}

async function put(api: Api, d: unknown): Promise<Out> {
  const planned = (await api.planPack({ doc: d, source: { kind: 'local' } } as never, owner)) as Out;
  if (!planned.ok) return planned;
  const diff = (planned.value as { diff: Diff }).diff;
  return (await api.installPack({ doc: d, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/** The record's state as its own `installedState` reads it, less what no step here asks. */
const stateOf = (api: Api): Installed => ({
  format: 1,
  primitives: 1,
  record_version: api.kernel.version(),
  packs: api.kernel.packs(),
  declarations: api.kernel.declarations() as Installed['declarations'],
  rows: api.kernel.census(),
  config: api.kernel.packSettings(),
  detached: Object.fromEntries(api.kernel.detached().map((d) => [d.id, { was: d.was, body: d.body }])),
});

const rowsOf = (s: Installed) => s.declarations.map((d) => ({ id: d.id, pack_id: d.pack_id, body: d.body }));

test('PLANNED STATE IS THE STATE THE INSTALL LEAVES: a list another pack laid on, with no pack and detached from its own', async () => {
  const { api, close } = await recordWithFolk();
  const plus = await packOf(LAYING('plus', 'text'));
  const before = stateOf(api);
  const planned = plannedState(before, plus, await plan(plus, before));
  said(await put(api, LAYING('plus', 'text')));
  const real = stateOf(api);
  assert.deepEqual(rowsOf(planned), rowsOf(real));
  assert.deepEqual(planned.detached, real.detached);
  assert.deepEqual(planned.packs.map((p) => [p.id, p.version, p.requires]), real.packs.map((p) => [p.id, p.version, p.requires]));
  close();
});

test('PLUS THEN QUUX: the second pack laying domain is refused at the plan, in the words the accept used', async () => {
  const { api, close } = await recordWithFolk();
  const plus = await packOf(LAYING('plus', 'text'));
  const quux = await packOf(LAYING('quux', 'int'));
  const before = stateOf(api);
  const after = plannedState(before, plus, await plan(plus, before));
  const fault = installFault(quux, await plan(quux, after));
  /* WHAT THE ARRANGER SAW, carrying the file alone: a folk with no domain, and a clean plan. */
  assert.equal(installFault(quux, await plan(quux, before)), null);
  said(await put(api, LAYING('plus', 'text')));
  const accept = await put(api, LAYING('quux', 'int'));
  assert.equal(accept.ok, false);
  assert.deepEqual(fault, accept.refusal);
  close();
});

test('PLUS THEN FOLK 2.0.0: an update declaring the field plus laid is the conflict the accept met, planned before it is filed', async () => {
  const { api, close } = await recordWithFolk();
  const plus = await packOf(LAYING('plus', 'text'));
  const folk = await packOf(FOLK('2.0.0', [{ id: 'domain', type: 'int' }]));
  const before = stateOf(api);
  const after = plannedState(before, plus, await plan(plus, before));
  const planned = await plan(folk, after);
  assert.deepEqual((await plan(folk, before)).conflicts, [], 'the fold the arranger carried saw no conflict');
  said(await put(api, LAYING('plus', 'text')));
  const real = said<{ diff: Diff }>(await api.planPack({ doc: FOLK('2.0.0', [{ id: 'domain', type: 'int' }]), source: { kind: 'local' } } as never, owner)).diff;
  assert.deepEqual(planned.conflicts, real.conflicts);
  assert.deepEqual(planned.conflicts, [{ id: 'register.folk', pack: '(this record)', changed: true, field: 'domain' }]);
  close();
});

test('planned state holds for a value an update keeps under its pack, and for a list rebased over what another pack laid', async () => {
  const { api, close } = await recordWithFolk();
  const kind = (values: string[]) => ({ id: 'kind', type: 'enum', values });
  said(await put(api, FOLK('1.1.0', [kind(['kin', 'friend'])])));
  said(api.kernel.create('folk', { name: 'Bo', kind: 'friend' }, { actor: 'p_1' }));
  for (const next of [FOLK('1.2.0', [kind(['kin'])]), LAYING('plus', 'text'), FOLK('1.3.0', [kind(['kin']), { id: 'born', type: 'day' }])]) {
    const pack = await packOf(next);
    const before = stateOf(api);
    const planned = plannedState(before, pack, await plan(pack, before));
    said(await put(api, next));
    const real = stateOf(api);
    assert.deepEqual(rowsOf(planned), rowsOf(real), `${pack.manifest.pack} ${pack.manifest.version}`);
    assert.deepEqual(planned.detached, real.detached, `${pack.manifest.pack} ${pack.manifest.version}`);
  }
  close();
});
