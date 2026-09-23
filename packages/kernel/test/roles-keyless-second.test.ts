/**
 * One list holds each role in either install order: a keyless `fx` or `people` shaped like the role is refused when it
 * arrives AFTER a list declaring `rates:` or `meets:`, as the declaring list is refused when it arrives after them.
 *
 * MEASURED BEFORE THIS FILE (`research-batch-forty-seven-audit.md` finding 2, `probes/roles-order.mts`): a list
 * declaring `rates:`, then a keyless `fx` of money-core's shape, both installed; a USD to EGP rate written into `fx`
 * left cash saying `missing: ["USD to EGP"]`, because the declaring list is the one read; and the declaring list's
 * next update was then refused, telling its owner to declare `rates:` on `fx`, a list another pack owns. `meets:`
 * then a People-shaped `people` did the same. `roleBody` asked the question only of the list declaring the key, so the
 * order that installs the keyless list second was never asked it. Both cases below failed against that code: the
 * keyless list installed `ok`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

type Out = { ok: boolean; refusal?: { code: string; fix: string; at?: string } };

const register = (id: string, fields: object[], more: Record<string, unknown> = {}): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title: (fields[0] as { id: string }).id, ...more, fields } }) as never;

/** money-core's `fx` fields, which are also the parts of `rates:` by their own names. */
const RATE_FIELDS = [
  { id: 'currency', type: 'text', required: true },
  { id: 'base', type: 'text', required: true },
  { id: 'rate', type: 'decimal', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
];
const RATES_ROLE = { currency: 'currency', base: 'base', rate: 'rate', as_of: 'as_of' };

/** People's fields for a list of the given id, with `merged_into` pointing at that list. */
const PEOPLE_FIELDS = (self: string) => [
  { id: 'name', type: 'text', required: true },
  { id: 'email', type: 'email' },
  { id: 'handles', type: 'list', of: 'text' },
  { id: 'met', type: 'list', of: 'text' },
  { id: 'merged_into', type: 'ref', to: self },
];
const MEETS_ROLE = { name: 'name', email: 'email', handles: 'handles', met: 'met', merged_into: 'merged_into' };

async function record(first: Declaration): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = (await k.install([first])) as Out;
  assert.ok(out.ok, `${out.refusal?.code}: ${out.refusal?.fix}`);
  return { k, sql };
}

test('A KEYLESS fx SHAPED LIKE THE RATES IS REFUSED AFTER A LIST DECLARING rates:, and the declaring list still updates', async () => {
  const { k, sql } = await record(register('rates', RATE_FIELDS, { rates: RATES_ROLE }));
  const fx = (await k.install([register('fx', RATE_FIELDS)])) as Out;
  assert.equal(fx.ok, false, 'fx installed beside the list declaring rates:, and the rates written into it are read by nothing');
  assert.equal(fx.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(fx.refusal?.at, 'id');
  assert.equal(
    fx.refusal?.fix,
    'register.rates already holds the rates, and a keyless fx shaped like them beside it would hold rates no figure converts by. Install fx under another id, or keep the rates in rates.',
  );
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE id = 'register.fx'")?.n, 0, 'the refused fx left a row');

  /* THE HARM THE PROBE MEASURED SECOND: with fx in place, this update was refused and told to declare rates: on fx. */
  const next = (await k.install([register('rates', [...RATE_FIELDS, { id: 'source', type: 'text' }], { rates: RATES_ROLE })])) as Out;
  assert.ok(next.ok, `${next.refusal?.code}: ${next.refusal?.fix}`);

  /* An fx that is not shaped like the rates is somebody's sound effects, and installs beside it as before. */
  const sounds = (await k.install([register('fx', [{ id: 'name', type: 'text', required: true }, { id: 'file', type: 'url' }])])) as Out;
  assert.ok(sounds.ok, `${sounds.refusal?.code}: ${sounds.refusal?.fix}`);
  sql.close();
});

test('A KEYLESS people SHAPED LIKE PEOPLE IS REFUSED AFTER A LIST DECLARING meets:, and meet still writes the declaring list', async () => {
  const { k, sql } = await record(register('contacts', PEOPLE_FIELDS('contacts'), { meets: MEETS_ROLE }));
  const people = (await k.install([register('people', PEOPLE_FIELDS('people'))])) as Out;
  assert.equal(people.ok, false, 'people installed beside the list declaring meets:, and meet never writes it');
  assert.equal(people.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(people.refusal?.at, 'id');
  assert.equal(
    people.refusal?.fix,
    'register.contacts already holds the people meet writes, and a keyless people shaped like them beside it would hold people meet never finds. Install people under another id, or keep the people meet writes in contacts.',
  );
  assert.deepEqual(k.meetsList()?.register, 'contacts');
  const next = (await k.install([register('contacts', [...PEOPLE_FIELDS('contacts'), { id: 'note', type: 'text' }], { meets: MEETS_ROLE })])) as Out;
  assert.ok(next.ok, `${next.refusal?.code}: ${next.refusal?.fix}`);
  sql.close();
});

test('IN ONE BATCH, THE DECLARING LIST AND A KEYLESS ONE SHAPED LIKE THE ROLE ARE REFUSED whichever comes first', async () => {
  for (const batch of [
    [register('rates', RATE_FIELDS, { rates: RATES_ROLE }), register('fx', RATE_FIELDS)],
    [register('fx', RATE_FIELDS), register('rates', RATE_FIELDS, { rates: RATES_ROLE })],
  ]) {
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    const out = (await k.install(batch)) as Out;
    assert.equal(out.ok, false, `${batch.map((d) => d.id).join(' then ')} installed together`);
    assert.equal(out.refusal?.code, 'DECLARATION_INVALID');
    sql.close();
  }
});
