/**
 * A plan that retires a list holding rows, taken on his press and never by itself.
 *
 * `install` refused such a plan `WOULD_ORPHAN` ("there are 41 rows in it. Move them first.") and nothing showed him the
 * removal, so an add-on update that dropped a list he had used could never be taken. Retiring takes nothing: the
 * declaration goes and the rows stay. So the plan now carries the step, `{ retire, rows, stays: true }` and its sentence,
 * and `install` takes it when the caller says he pressed it (`retireWithRows`, which `--force` is). Without it the
 * refusal stands word for word, and so does every other refusal with it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, installFault, normalise, plan, type Diff, type Host, type Installed, type Pack } from '../src/index.ts';

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.equal(x.ok, false, 'it installed');
  return x.refusal!;
};

const INVOICES = [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'text' }];

/* Version 1.0.0 of an invented studio add-on held Invoices and Services; 1.1.0 stops declaring Services. */
const DOC = (over: Record<string, unknown> = {}) => ({
  pack: 'kiln-books',
  version: '1.1.0',
  summary: 'What a small studio bills.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'invoices', name: 'Invoices', title: 'what', fields: INVOICES }],
  ...over,
});

const body = (id: string, name: string, fields: unknown[]) => JSON.stringify({ id, name, title: 'what', fields });

const held = (rows: Record<string, number>, invoices: unknown[] = INVOICES): Installed => ({
  format: 1,
  primitives: 1,
  record_version: 7,
  packs: [{ id: 'kiln-books', version: '1.0.0' }],
  declarations: [
    { id: 'register.invoices', version: 1, kind: 'register', pack_id: 'kiln-books', body: body('invoices', 'Invoices', invoices), checksum: 'a' },
    { id: 'register.services', version: 1, kind: 'register', pack_id: 'kiln-books', body: body('services', 'Services', [{ id: 'what', type: 'text' }]), checksum: 'b' },
  ],
  rows,
});

/* A host whose lists hold rows and whose retire only marks, as the kernel's does: nothing it is handed deletes a row. */
function fakeHost(rows: Record<string, number>): Host & { log: string[]; rows: Record<string, number> } {
  const log: string[] = [];
  return {
    log,
    rows,
    count: (register) => rows[register] ?? 0,
    stage: async (batch) => (log.push(`stage:${batch.length}`), { ok: true, value: () => (log.push('install'), { ok: true, value: null }) }),
    transaction: (fn) => fn(),
    reload: () => log.push('reload'),
    retire: (ids) => (log.push(`retire:${ids.join(',')}`), { ok: true, value: null }),
    seed: (register) => (log.push(`seed:${register}`), { ok: true, value: { id: 'x' } }),
    remember: (row) => log.push(`pack:${row.id}@${row.version}`),
    forget: (id) => log.push(`forget:${id}`),
    claimed: () => [],
  };
}

const packOf = async (over: Record<string, unknown> = {}): Promise<Pack> => value<Pack>(await normalise(DOC(over)));

test('THE PLAN SAYS THE REMOVAL: the list, how many rows, that they stay, and the sentence', async () => {
  const diff = await plan(await packOf(), held({ invoices: 3, services: 41 }));
  assert.equal(diff.orphans, 41);
  assert.deepEqual(diff.removals, [
    { retire: 'services', name: 'Services', rows: 41, stays: true, line: 'Retires Services. Your 41 items stay, and the list can be put back.' },
  ]);

  const one = await plan(await packOf(), held({ invoices: 3, services: 1 }));
  assert.equal(one.removals?.[0]?.line, 'Retires Services. Your 1 item stays, and the list can be put back.');
});

test('A LIST RETIRED EMPTY IS NO REMOVAL, and a plan that retires nothing reads as it did', async () => {
  const empty = await plan(await packOf(), held({ invoices: 3 }));
  assert.equal(empty.orphans, 0);
  assert.equal('removals' in empty, false, 'an empty list was shown as a removal');
  assert.ok(empty.retires.some((r) => r.id === 'register.services'), 'the empty list stopped retiring');

  const first = await plan(await packOf(), { format: 1, primitives: 1, record_version: 1, packs: [], declarations: [], rows: {} });
  assert.equal('removals' in first, false);
});

test('WITHOUT HIS PRESS IT IS REFUSED EXACTLY AS BEFORE, and nothing is written', async () => {
  const pack = await packOf();
  const diff = await plan(pack, held({ invoices: 3, services: 41 }));
  const host = fakeHost({ invoices: 3, services: 41 });
  for (const out of [await install(pack, diff, host, diff.planHash), await install(pack, diff, host, diff.planHash, [], {}), await install(pack, diff, host, diff.planHash, [], { retireWithRows: false })]) {
    const no = refusal(out);
    assert.equal(no.code, 'WOULD_ORPHAN');
    assert.equal(no.fix, 'kiln-books upgrades away register.services, and there are 41 rows in it. Move them first.');
    assert.equal(no.at, 'register.services');
  }
  assert.deepEqual(host.log, [], 'a refused install wrote something');
  /* And the arranger, which asks the same list before it files anything, still refuses it unpressed. */
  assert.equal(installFault(pack, diff)?.code, 'WOULD_ORPHAN');
  assert.equal(installFault(pack, diff, { retireWithRows: true }), null);
});

test('ON HIS PRESS IT APPLIES: the list is retired, every row stays, and the answer says how many', async () => {
  const pack = await packOf();
  const diff = await plan(pack, held({ invoices: 3, services: 41 }));
  const host = fakeHost({ invoices: 3, services: 41 });
  const done = value<{ retired: number; rows_kept?: Record<string, number> }>(await install(pack, diff, host, diff.planHash, [], { retireWithRows: true }));
  assert.equal(done.retired, 1);
  assert.deepEqual(done.rows_kept, { services: 41 });
  assert.ok(host.log.includes('retire:register.services'), `the list was not retired: ${host.log.join(' ')}`);
  assert.equal(host.count('services'), 41, 'a row went with the list');
  assert.equal(host.log.filter((l) => l.startsWith('seed:')).length, 0);

  /* An update that retires nothing over rows says nothing of kept rows. */
  const quiet = await plan(pack, held({ invoices: 3 }));
  const plain = value<{ rows_kept?: unknown }>(await install(pack, quiet, fakeHost({ invoices: 3 }), quiet.planHash, [], { retireWithRows: true }));
  assert.equal('rows_kept' in plain, false);
});

test('THE PRESS LIFTS WOULD_ORPHAN ONLY: every other refusal stands beside it', async () => {
  const rows = { invoices: 3, services: 41 };
  const pressed = async (pack: Pack, state: Installed, hash?: (d: Diff) => string) => {
    const diff = await plan(pack, state);
    return refusal(await install(pack, diff, fakeHost(rows), hash ? hash(diff) : diff.planHash, [], { retireWithRows: true }));
  };

  assert.equal((await pressed(await packOf(), held(rows), () => '7.stale')).code, 'PLAN_STALE');
  assert.equal((await pressed(await packOf({ requires: { format: 9, primitives: 1, packs: {} } }), held(rows))).code, 'FORMAT_OUT_OF_RANGE');
  assert.equal((await pressed(await packOf({ requires: { format: 1, primitives: 1, packs: { 'kiln-core': '>=2.0.0' } } }), held(rows))).code, 'OUT_OF_BOUNDS');

  /* A rename is the truer sentence than the orphan it also is, pressed or not. */
  const renamed = await packOf({
    declarations: [
      { register: 'invoices', name: 'Invoices', title: 'what', fields: INVOICES },
      { register: 'jobs', name: 'Services', title: 'what', fields: [{ id: 'what', type: 'text' }] },
    ],
  });
  assert.equal((await pressed(renamed, held(rows))).code, 'ID_RENAMED');

  /* And a list that stays and stops reading what its rows hold. */
  const retyped = await packOf({ declarations: [{ register: 'invoices', name: 'Invoices', title: 'what', fields: [INVOICES[0], { id: 'amount', type: 'money' }] }] });
  assert.equal((await pressed(retyped, held(rows))).code, 'FIELD_TYPE_CHANGED');

  const demanded = await packOf({ declarations: [{ register: 'invoices', name: 'Invoices', title: 'what', fields: [INVOICES[0], { id: 'amount', type: 'text', required: true }] }] });
  assert.equal((await pressed(demanded, held(rows))).code, 'REQUIRED_ON_POPULATED');
});
