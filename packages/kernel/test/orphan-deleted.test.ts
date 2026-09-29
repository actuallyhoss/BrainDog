/**
 * A deleted row still holds its values, so a field it holds is not left out of the list either.
 *
 * MEASURED BEFORE THIS FILE. The install's orphan check counted live rows only, so: a change dropping `domain` while
 * the row was live was `WOULD_ORPHAN`; the row was deleted; the same change installed; the row was restored, and its
 * JSON was `{"name":"Kiln","domain":"kiln.example"}` under a list with no `domain`. The value was back, carried through
 * every later edit, and no reader could see it: the exact state the check exists to prevent, reached in three ordinary
 * steps.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const NAME = { id: 'name', type: 'text', required: true };
const DOMAIN = { id: 'domain', type: 'text' };

const projects = (fields: Record<string, unknown>[]): Declaration => ({
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields } as never,
});

test('DELETE, DROP, RESTORE: THE DROP IS REFUSED while a deleted row still holds the value', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([projects([NAME, DOMAIN])])).ok);
  const row = k.create('things', { name: 'Kiln', domain: 'kiln.example' }, { actor: 'p_1' }) as { ok: boolean; value: { id: string } };
  assert.ok(row.ok);
  assert.equal(codeOf(await k.install([projects([NAME])])), 'WOULD_ORPHAN');

  assert.ok(k.update('things', row.value.id, { deleted_at: 'now' } as never, { actor: 'p_1' }).ok);
  const out = await k.install([projects([NAME])]);
  assert.equal(codeOf(out), 'WOULD_ORPHAN');
  assert.equal(fixOf(out), '1 row holds domain, a deleted one a restore brings back. Mark it retired rather than leaving it out.');

  /* THE HONEST REMOVAL STILL WORKS, and a restore afterwards brings the value back under a field every reader knows. */
  assert.ok((await k.install([projects([NAME, { ...DOMAIN, retired: true }])])).ok);
  assert.ok(k.update('things', row.value.id, { deleted_at: null } as never, { actor: 'p_1' }).ok);
  assert.equal(k.register('things')?.fields.find((f) => f.id === 'domain')?.retired, true);
});

test('LIVE AND DELETED ROWS ARE COUNTED TOGETHER, and the sentence says how many are deleted', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([projects([NAME, DOMAIN])])).ok);
  for (const name of ['Kiln', 'Loom', 'Anvil']) assert.ok(k.create('things', { name, domain: `${name.toLowerCase()}.example` }, { actor: 'p_1' }).ok);
  const gone = k.list({ register: 'things' }) as { ok: boolean; value: { rows: { id: string }[] } };
  for (const r of gone.value.rows.slice(0, 2)) assert.ok(k.update('things', r.id, { deleted_at: 'now' } as never, { actor: 'p_1' }).ok);
  assert.equal(fixOf(await k.install([projects([NAME])])), '3 rows hold domain, 2 of them deleted ones a restore brings back. Mark it retired rather than leaving it out.');
});
