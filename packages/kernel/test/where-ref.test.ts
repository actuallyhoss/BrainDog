/**
 * A ref in a `where:`, asked of the record itself rather than through the agent's tool.
 *
 * THE APP READS THROUGH THIS TOO. `packages/mcp/test/list-ref.test.ts` holds the agent's `list`, and
 * the defect it was written for lived here: `predicateOf` sent a tree through `resolveRelative`,
 * which resolves `day` and `instant` leaves and nothing else, so `{field: 'thing', is: 'things#1'}`
 * reached SQL as the string and matched no row, while the sentence resolved a title and refused an
 * id. Measured over the seed before the repair: the tree with the spoken id and the tree with the
 * name answered ok with 0 rows on a project with 14 tasks, and the sentence with the spoken id was
 * refused `REF_UNKNOWN`. A page block, a metric and a digest section read the same function.
 *
 * AND A RULE MUST STILL INSTALL OVER A ROW NOBODY HAS WRITTEN YET. `unreadWhere` lets `REF_UNKNOWN`
 * through so `when: thing is Launch` can wait for Launch; the tree form refuses a missing ref now,
 * so the exemption has to hold for it as well, and the last test drives the rule firing once the
 * row exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const JOBS: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things' },
      { id: 'also', type: 'list', of: 'ref', to: 'things' },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

async function record(...more: Declaration[]): Promise<{ k: Kernel; kiln: string; marlow: string }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([THINGS, JOBS, ...more]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made = (register: string, fields: Record<string, unknown>): string => {
    const out = k.create(register, fields as never, { actor: 'p_1' }) as { ok: boolean; value: { id: string }; refusal?: unknown };
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.id;
  };
  const kiln = made('things', { name: 'Kiln' });
  const marlow = made('things', { name: 'Marlow' });
  made('jobs', { what: 'Glaze', thing: kiln, also: [marlow] });
  made('jobs', { what: 'Fire', thing: kiln });
  made('jobs', { what: 'Invoice', thing: marlow, also: [kiln] });
  return { k, kiln, marlow };
}

const whats = (out: unknown): string[] | string => {
  const x = out as { ok: boolean; value: { rows: { fields: { what: string } }[] }; refusal?: { code: string } };
  return x.ok ? x.value.rows.map((r) => r.fields.what).sort() : (x.refusal?.code ?? '?');
};

test('a ref leaf reads a spoken id, a title and a row id, in the tree and in the sentence', async () => {
  const { k, kiln } = await record();
  const kilns = ['Fire', 'Glaze'];
  const forms: unknown[] = [
    { field: 'thing', is: 'things#1' },
    { field: 'thing', is: 'Kiln' },
    { field: 'thing', is: kiln },
    { field: 'thing', in: ['things#1'] },
    { any: [{ field: 'thing', is: 'things#1' }] },
    'thing is things#1',
    'thing is Kiln',
    `thing is ${kiln}`,
  ];
  for (const where of forms) assert.deepEqual(whats(k.list({ register: 'jobs', where: where as never })), kilns, JSON.stringify(where));

  assert.deepEqual(whats(k.list({ register: 'jobs', where: { field: 'thing', not: 'things#1' } as never })), ['Invoice']);
  assert.deepEqual(whats(k.list({ register: 'jobs', where: 'thing is not things#1' })), ['Invoice']);
  assert.deepEqual(whats(k.list({ register: 'jobs', where: { field: 'also', has: 'things#1' } as never })), ['Invoice']);
  assert.deepEqual(whats(k.list({ register: 'jobs', where: 'also has things#1' })), ['Invoice']);
});

test('a ref naming no row is REF_UNKNOWN, and a row of another register is REF_REGISTER_MISMATCH', async () => {
  const { k } = await record();
  for (const where of [{ field: 'thing', is: 'Nowhere' }, { field: 'thing', in: ['things#1', 'things#99'] }, 'thing is things#99'])
    assert.equal(whats(k.list({ register: 'jobs', where: where as never })), 'REF_UNKNOWN', JSON.stringify(where));
  for (const where of [{ field: 'thing', is: 'jobs#1' }, 'thing is jobs#1'])
    assert.equal(whats(k.list({ register: 'jobs', where: where as never })), 'REF_REGISTER_MISMATCH', JSON.stringify(where));
});

test('a rule whose tree names a row not yet written still installs, and fires once the row exists', async () => {
  const rule: Declaration = {
    id: 'rule.launch',
    kind: 'rule',
    body: { rule: 'launch', register: 'jobs', when: { field: 'thing', is: 'Launch' }, then: [{ tag: 'launch' }] } as never,
  };
  const { k } = await record(rule);
  const launch = (k.create('things', { name: 'Launch' } as never, { actor: 'p_1' }) as { value: { id: string } }).value.id;
  const job = k.create('jobs', { what: 'Announce', thing: launch } as never, { actor: 'p_1' }) as { ok: boolean; value: { fields: { tags?: string[] } } };
  assert.ok(job.ok);
  assert.deepEqual(job.value.fields.tags, ['launch']);
});
