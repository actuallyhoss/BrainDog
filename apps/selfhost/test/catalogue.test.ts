/**
 * What this self-host offers to install by proposal (`catalogue.ts`, `loop/research-spark.md` S12).
 *
 * EVERY ENTRY IS A PROPOSAL THAT CAN BE FILED ON A FRESH RECORD. A pack whose plan refuses on an empty record is
 * on offer and cannot be asked for, and an agent would learn that one refusal at a time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { seedCatalogue } from '../src/catalogue.ts';
import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const agent: CallContext = { principal: { kind: 'token', id: 't', scope: 'propose', person: 'p_1', level: 'owner' } };

test('EVERY PACK AND USE CASE ON OFFER FILES AS A PROPOSAL ON A FRESH RECORD, modules first', async () => {
  const catalogue = seedCatalogue();
  assert.ok(catalogue.some((e) => e.kind === 'usecase'));
  for (const entry of catalogue) {
    const sql = openSqlite();
    const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17)), catalogue });
    const filed = await api.propose({ question: `Install ${entry.id}?`, body_kind: 'pack', body: { install: entry.id } } as never, agent);
    assert.ok(filed.ok, `${entry.id}: ${JSON.stringify(filed)}`);
    const row = await api.governance({ id: (filed as { value: { id: string } }).value.id }, agent);
    const body = (row as unknown as { value: { body: { packs: { install: string[] } } } }).value.body;
    assert.equal(body.packs.install.at(-1), entry.id);
    sql.close();
  }
});
