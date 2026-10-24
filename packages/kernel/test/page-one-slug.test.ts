/**
 * A page somebody wrote is read without filling a page for every row of every template (scope 2026-10-24 A9): a read of
 * the Agents page on his record filled one page for each of 908 runs to find its own, 1,410 ms of the record's time.
 *
 * WHAT HOLDS IT: the written page read alone is the page read with every page resolved for it, and a template's own
 * page and a slug nobody holds are still found among them all, as before. The lists are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 24, 12);
const OWNER = { actor: 'p_1' };

const KITES: Declaration = {
  id: 'register.kites',
  kind: 'register',
  body: { id: 'kites', name: 'Kites', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};
const KITE_PAGE: Declaration = {
  id: 'page.kite',
  kind: 'page',
  body: { page: 'kite', title: '{{name}}', for: { register: 'kites' }, blocks: [{ kind: 'note', body: 'A kite.' }] } as never,
};
const SHED: Declaration = {
  id: 'page.shed',
  kind: 'page',
  body: { page: 'shed', title: 'Shed', blocks: [{ kind: 'table', source: 'register.kites', columns: [{ field: 'name', label: 'Name' }] }] } as never,
};

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([KITES, KITE_PAGE, SHED]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const name of ['Red one', 'Box kite', 'Delta']) assert.ok(k.create('kites', { name }, OWNER).ok);
  return { sql, k };
}

test('A WRITTEN PAGE IS READ AS IT WAS, and the same as when every page is resolved for it', async () => {
  const { sql, k } = await record();
  const alone = k.page('shed');
  const walked = k.pageWalk().page('shed');
  assert.ok(alone.ok, JSON.stringify(alone));
  assert.deepEqual(alone, walked);
  sql.close();
});

test("A TEMPLATE'S PAGE AND A SLUG NOBODY HOLDS ARE STILL FOUND AMONG THEM ALL", async () => {
  const { sql, k } = await record();
  const kite = k.page('box-kite');
  assert.ok(kite.ok, JSON.stringify(kite));
  const none = k.page('nowhere');
  assert.equal(!none.ok && 'refusal' in none && none.refusal.code, 'PAGE_UNKNOWN');
  assert.deepEqual(!none.ok && 'refusal' in none ? none.refusal.allowed : null, ['shed']);
  sql.close();
});
