/**
 * The `project` kind (C28, C29): parts of a project's shape declared on the page about its row, which the record
 * answers as the block and its `when:` and the host draws from its own read of the project.
 *
 * THE KIND IS REGISTERED BEFORE THE KERNEL LOADS, where the registry does not hold it already, for the reason
 * `kind-lanes.test.ts` gives. EACH TEST DRIVES A REAL RECORD over `node:sqlite`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '../src/index.ts';
import type { PageBlock } from '../src/pages.ts';
import { BLOCK_KIND_MODULES } from '../src/kinds/index.ts';
import { PROJECT_PARTS, project } from '../src/kinds/project.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

BLOCK_KIND_MODULES.project ??= project;

const { openRecord } = await import('../src/index.ts');

const NOW = Date.UTC(2026, 9, 24, 12);

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', blocks } as never,
});

const refusalOf = (out: { ok: boolean }) => (!out.ok && 'refusal' in out ? (out as { refusal: { code: string; fix: string; at?: string } }).refusal : null);

test('every part of the shape installs, alone or beside others, and is answered as the block with its parts', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const rows = [['hero'], ['path', 'money'], ['what-is-open', 'who-is-on-it', 'runs-on', 'agents-here']];
  assert.deepEqual(rows.flat().sort(), [...PROJECT_PARTS].sort(), 'a part of the shape is in no row');
  assert.equal(refusalOf(await k.install([pageOf(...rows.map((parts) => ({ kind: 'project', parts, heading: parts.join(' and '), span: 12 })))])), null, 'a row of the shape was refused at install');
  for (const parts of rows) {
    const read = k.block({ kind: 'project', parts } as unknown as PageBlock);
    assert.deepEqual(read.refusals, [], parts.join());
    assert.deepEqual(read.parts, parts, 'the parts did not ride on the answer to the host');
    assert.deepEqual(read.rows, []);
  }
  sql.close();
});

test('a part the shape does not have, one named twice, or none, is refused with the parts named', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const parts of [['hero-band'], [], ['path', 'path'], 'hero']) {
    const refused = refusalOf(await k.install([pageOf({ kind: 'project', parts })]));
    assert.equal(refused?.code, 'DECLARATION_INVALID', JSON.stringify(parts));
    assert.match(refused?.at ?? '', /parts$/u);
  }
  assert.match(refusalOf(await k.install([pageOf({ kind: 'project', parts: ['hero-band'] })]))?.fix ?? '', /hero, path, money/u);
  sql.close();
});

test('a bare row installs and is refused when it is read, as every kind is', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.equal(refusalOf(await k.install([pageOf({ kind: 'project' })])), null);
  assert.equal(k.block({ kind: 'project' } as unknown as PageBlock).refusals[0]?.at, 'parts');
  sql.close();
});

test('a row reads no list, and parts is refused on any other kind', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.match(refusalOf(await k.install([pageOf({ kind: 'project', parts: ['what-is-open'], source: 'register.tasks' })]))?.at ?? '', /source$/u);
  assert.equal(refusalOf(await k.install([pageOf({ kind: 'note', body: 'x', parts: ['hero'] })]))?.code, 'DECLARATION_INVALID');
  sql.close();
});
