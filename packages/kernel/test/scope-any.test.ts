/**
 * A parameter inside a sentence's `, or` group is not the figure's scope, and `fill` took it for one.
 *
 * THE SENTENCE LEARNED `, or` (M4 wave two brief 7) AND `scopeOf` STILL SPLIT IT ON THE COMMA. It keeps the clauses that
 * carry `{{it}}` as `within`, which is right for a conjunction and wrong for an alternative: under an "or" the parameter
 * widens the rows rather than cutting the register down, which is exactly why the tree form's `any` branch answers
 * nothing. Measured before the repair, over the five obligations below with Halden as the parameter:
 *
 *   party is {{it}}, or state is paid    rows 2, held 1     a reading that holds fewer rows than it matched
 *   state is paid, or party is {{it}}    FIELD_UNKNOWN      `within` was ` or party is Halden`, and `or party` is no field
 *
 * The first draws a tile whose `held` is under its `rows`, which contradicts itself; the second refuses a figure the
 * sentence reads perfectly well. The sentence form now answers what the tree form answers, and `held` is the register.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fill, openRecord, type Declaration, type Kernel, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'text', index: true },
      { id: 'state', type: 'enum', values: ['open', 'part', 'paid'], index: true },
    ],
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS])).ok);
  for (const row of [
    { what: 'Invoice 41', party: 'Halden', state: 'open' },
    { what: 'Invoice 46', party: 'Ravensworth', state: 'open' },
    { what: 'Illustration', party: 'Okonkwo', state: 'open' },
    { what: 'Tax', party: 'HMRC', state: 'open' },
    { what: 'Invoice 38', party: 'Ravensworth', state: 'paid' },
  ])
    assert.ok(k.create('obligations', row, { actor: 'p_1' }).ok);
  return { k, sql };
}

const BASE = { name: 'Held', source: 'register.obligations', value: { count: 'id' }, target: { lte: 9 }, window: '30d', compare: 'none', format: 'int' } as const;

const filled = (where: string, param: string) => fill({ ...BASE, metric: 'm', where } as MetricDecl, null, param) as MetricDecl;

function reading(k: Kernel, where: string, param: string): Reading {
  const r = k.metric(filled(where, param)) as { ok: boolean; value: Reading; refusal?: { code: string; fix: string } };
  assert.ok(r.ok, r.ok ? '' : `${where}: ${r.refusal?.code}: ${r.refusal?.fix}`);
  return r.value;
}

test('A PARAMETER ON EITHER SIDE OF `, or` CUTS NO SCOPE, so held is the register and never under rows', async () => {
  const { k, sql } = await record();
  for (const where of ['party is {{it}}, or state is paid', 'state is paid, or party is {{it}}']) {
    assert.equal(filled(where, 'Halden').within, undefined, `${where}: an alternative is not a scope`);
    const r = reading(k, where, 'Halden');
    assert.equal(r.rows, 2, `${where}: Halden own obligation and the paid one`);
    assert.equal(r.held, 5, `${where}: the whole register, as the tree form's \`any\` answers`);
  }
  sql.close();
});

test('AND `or` BETWEEN ONE FIELD’S VALUES IS STILL A CONJUNCT, so the parameter beside it still narrows', async () => {
  /* The separator is the comma followed by `or`, never the word alone: `state is open or paid` is one clause, and a
     repair that looked for ` or ` anywhere would have widened every shipped figure written that way. */
  const { k, sql } = await record();
  const where = 'party is {{it}}, state is open or paid';
  assert.equal(filled(where, 'Ravensworth').within, 'party is Ravensworth');
  const r = reading(k, where, 'Ravensworth');
  assert.equal(r.rows, 2);
  assert.equal(r.held, 2, 'the parameter is still the scope of a conjunction');
  sql.close();
});
