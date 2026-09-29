/**
 * A figure takes `reads` as `list` does, so a ref in its `where` into a list the caller cannot read names no row (the
 * fuller fix of a hidden list read through a figure).
 *
 * WHAT WAS MEASURED BEFORE THIS. `metric(decl)` resolved every ref against the whole record: a figure over Jobs whose
 * `where` named a client by title or by `clients#1` counted that client's jobs whoever asked, because it took no second
 * argument. The record's door made up for it by listing twice and answering `FORBIDDEN` for a hidden list, in words that
 * were not `list`'s. Handed the same `reads`, the figure and the list now agree on the same rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const reg = (id: string, name: string, fields: Record<string, unknown>[], title = 'what') => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields: [{ id: title, type: 'text', required: true }, ...fields] } as never,
});

const figure = (where: string) =>
  ({ metric: 'client-jobs', name: 'Jobs for a client', source: 'register.jobs', where, value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' }) as unknown as MetricDecl;

test('A FIGURE HANDED reads COUNTS WHAT list COUNTS FOR THE SAME CALLER, and without it counts what it always did', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([reg('clients', 'Clients', [], 'name'), reg('jobs', 'Jobs', [{ id: 'client', type: 'ref', to: 'clients' }])])).ok);
  const harrow = k.create('clients', { name: 'Harrow Divorce Case' }, { actor: 'p_owner' });
  assert.ok(harrow.ok);
  assert.ok(k.create('jobs', { what: 'Draft the petition', client: harrow.value.id }, { actor: 'p_owner' }).ok);

  const hidden = (register: string): boolean => register !== 'clients';
  for (const where of ['client is Harrow Divorce Case', 'client is clients#1', 'client is Nobody At All', 'client is clients#9']) {
    const listed = k.list({ register: 'jobs', where, reads: hidden });
    assert.ok(listed.ok, `${where}: ${JSON.stringify(listed)}`);
    const counted = k.metric(figure(where), { reads: hidden });
    assert.ok(counted.ok, `${where}: ${JSON.stringify(counted)}`);
    assert.equal(counted.value.value, listed.value.matched, `${where}: the figure and the list disagree for a caller who cannot read Clients`);
    assert.equal(counted.value.value, 0, where);
  }

  /* The owner, who reads every list, is answered as before. */
  const whole = k.metric(figure('client is Harrow Divorce Case'));
  assert.ok(whole.ok, JSON.stringify(whole));
  assert.equal(whole.value.value, 1);
  sql.close();
});
