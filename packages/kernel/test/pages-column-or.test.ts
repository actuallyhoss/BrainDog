/**
 * A column may name a second field to read where its first holds nothing: `{ field: 'payee', or: 'what' }`.
 *
 * A bank's line has the words the bank wrote and, once somebody is known for it, a clean name. A column that reads the
 * name alone is blank on every line nobody was matched to, and one that reads the bank's words alone never shows the
 * name. `or:` is checked as `field:` is, at the install (a string) and at the read (a field the list declares), and
 * the entry a host draws carries both, so the host can fall back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import type { Declaration } from '../src/declare.ts';
import type { PageBlock } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };

const LINES: Declaration = {
  id: 'register.lines',
  kind: 'register',
  body: {
    id: 'lines',
    name: 'Lines',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'payee', type: 'text' },
      { id: 'note', type: 'text' },
    ],
  },
};

const page = (blocks: unknown[]): Declaration => ({
  id: 'page.ledger',
  kind: 'page',
  body: { page: 'ledger', title: 'Ledger', requires: ['register.lines'], blocks } as never,
});

const table = (columns: unknown[]) => ({ kind: 'table', source: 'register.lines', columns });

const opened = async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([LINES]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { sql, k };
};

test('a table column that falls back from one field to another installs', async () => {
  const { sql, k } = await opened();
  const out = await k.install([page([table([{ field: 'payee', or: 'what' }])])]);
  assert.ok(out.ok, JSON.stringify(out));
  sql.close();
});

test('an or: that is not a field name is refused in the words a field: is refused in', async () => {
  const { sql, k } = await opened();
  for (const or of [5, '', null]) {
    const asField = await k.install([page([table([{ field: or }])])]);
    const asOr = await k.install([page([table([{ field: 'payee', or }])])]);
    assert.ok(!asField.ok && !asOr.ok, `or: ${JSON.stringify(or)} installed`);
    const said = (asOr as { refusal?: { code: string; fix: string } }).refusal;
    assert.deepEqual(said, (asField as { refusal?: unknown }).refusal, 'the two are refused in different words');
    assert.equal(said?.code, 'DECLARATION_INVALID');
    assert.equal(said?.fix, `page.ledger.blocks[0] names ${JSON.stringify(or)} as a column, and a column names a field.`);
  }
  sql.close();
});

test('an or: naming a field nobody declared is refused at the read as a field: is', async () => {
  const { sql, k } = await opened();
  assert.ok(k.create('lines', { what: 'CARD 4421 TESCO' }, OWNER).ok);
  const asField = k.block(table([{ field: 'what' }, { field: 'nobody' }]) as PageBlock);
  const asOr = k.block(table([{ field: 'what', or: 'nobody' }]) as PageBlock);
  assert.equal(asOr.refusals.length, 1, JSON.stringify(asOr.refusals));
  assert.deepEqual(asOr.refusals, asField.refusals);
  assert.equal(asOr.refusals[0]!.code, 'FIELD_UNKNOWN');
  assert.equal(asOr.refusals[0]!.fix, 'lines has no field called nobody.');
  assert.deepEqual(asOr.rows ?? [], [], 'a refused block drew its entries');
  sql.close();
});

test('a column with both draws its entries carrying both fields', async () => {
  const { sql, k } = await opened();
  assert.ok(k.create('lines', { what: 'CARD 4421 TESCO STORES', payee: 'Tesco', note: 'weekly shop' }, OWNER).ok);
  assert.ok(k.create('lines', { what: 'FPS 00231 UNKNOWN' }, OWNER).ok);
  const out = k.block(table([{ field: 'payee', or: 'what' }]) as PageBlock);
  assert.deepEqual(out.refusals, [], JSON.stringify(out.refusals));
  const rows = (out.rows ?? []) as { fields: Record<string, unknown> }[];
  assert.equal(rows.length, 2);
  const named = rows.find((r) => r.fields.payee === 'Tesco');
  assert.ok(named, JSON.stringify(rows));
  assert.equal(named.fields.what, 'CARD 4421 TESCO STORES');
  const bare = rows.find((r) => r.fields.what === 'FPS 00231 UNKNOWN');
  assert.ok(bare, JSON.stringify(rows));
  assert.ok(bare.fields.payee === undefined || bare.fields.payee === null, 'the unmatched line holds a name');
  sql.close();
});

test("a card's trend column, which names a figure and no field, takes no or:", async () => {
  const { sql, k } = await opened();
  const cards = { kind: 'cards', source: 'register.lines', columns: [{ field: 'what', as: 'title' }, { metric: 'lines-by-week:{{what}}', as: 'trend', or: 'what' }] };
  const out = await k.install([page([cards])]);
  assert.ok(!out.ok, 'a figure column with or: installed');
  const said = JSON.stringify(out);
  assert.match(said, /DECLARATION_INVALID/);
  assert.match(said, /or:/);
  sql.close();
});
