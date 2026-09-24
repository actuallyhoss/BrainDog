/**
 * A kept figure whose `where` names a field after `, or` still reads that field, and `plan` has to see it.
 *
 * THE SENTENCE LEARNED `, or` (M4 wave two brief 7) AND `readsField` STILL SPLIT IT ON THE COMMA ALONE. Each piece is
 * asked which field it begins with, and the piece after the comma began with the word `or`, which names no field, so the
 * field after it was never counted. Measured before the repair, with the owner's `spent-30d` edited to
 * `direction is out, or transfer is true` and money-mini 1.1.0 taking `transfer` off the list: `diff.conflicts` was `[]`,
 * the plan installed, and the figure would then refuse every read with `FIELD_UNKNOWN`, which is the failure
 * `plan-kept.test.ts` exists to prevent for the same figure written with a plain comma.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, plan, type Installed, type Pack } from '../src/index.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const FIELDS = () => [
  { id: 'what', type: 'text', required: true },
  { id: 'amount', type: 'decimal' },
  { id: 'direction', label: 'Which way', type: 'enum', values: ['in', 'out'] },
  { id: 'transfer', label: 'Between your own accounts', type: 'bool', default: false },
  { id: 'note', type: 'text' },
];

const SPENT = { metric: 'spent-30d', name: 'Spent, 30 days', source: 'register.transactions', where: 'transfer is false, direction is out', value: { sum: 'amount' }, format: 'decimal', target: { lte: 1500 }, window: '30d', compare: 'previous' };

const DOC = (version: string, fields = FIELDS()) => ({
  pack: 'money-mini',
  version,
  summary: 'What went out.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'transactions', name: 'Transactions', title: 'what', fields }, SPENT],
});

const packOf = async (doc: ReturnType<typeof DOC>): Promise<Pack> => value<Pack>(await normalise(doc));

/** 1.0.0 installed, with the owner's `spent-30d` rewritten to `where`, as `setDeclaration` leaves an edit. */
async function recordWith(where: string): Promise<Installed> {
  const first = await packOf(DOC('1.0.0'));
  const detached: Record<string, { was: string; body: string }> = {};
  const declarations = first.declarations.map((d) => {
    if (d.id !== 'metric.spent-30d') return { id: d.id, version: 1, kind: d.kind, pack_id: 'money-mini' as string | null, body: d.canonical, checksum: `c-${d.id}` };
    detached[d.id] = { was: 'money-mini', body: d.canonical };
    return { id: d.id, version: 2, kind: d.kind, pack_id: null, body: JSON.stringify({ ...(JSON.parse(d.canonical) as object), where }), checksum: `e-${d.id}` };
  });
  return { format: 1, primitives: 1, record_version: 9, packs: [{ id: 'money-mini', version: '1.0.0' }], declarations, rows: { transactions: 40 }, detached };
}

const conflictsWhen = async (where: string, without: string) => {
  const next = await packOf(DOC('1.1.0', FIELDS().filter((f) => f.id !== without)));
  return (await plan(next, await recordWith(where))).conflicts.map((c) => [c.id, c.field]);
};

test('A FIELD NAMED AFTER `, or` IS READ, by its id and by its label, and taking it off is a conflict', async () => {
  for (const where of ['direction is out, or transfer is true', 'which way is out, or between your own accounts is true', 'direction is out, OR transfer is true'])
    assert.deepEqual(await conflictsWhen(where, 'transfer'), [['metric.spent-30d', 'transfer']], where);
});

test('AND THE FIELD BEFORE THE `or` IS STILL READ, and a field the sentence does not name is still no conflict', async () => {
  assert.deepEqual(await conflictsWhen('direction is out, or transfer is true', 'direction'), [['metric.spent-30d', 'direction']]);
  assert.deepEqual(await conflictsWhen('direction is out, or transfer is true', 'note'), []);
  /* `or` BETWEEN ONE FIELD'S VALUES IS NOT THE SEPARATOR, so the value after it is still a value of `direction`. */
  assert.deepEqual(await conflictsWhen('direction is in or out, note is empty', 'transfer'), []);
});
