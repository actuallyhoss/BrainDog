/**
 * The page's head as a record reads it: a page declaring `header:` installs, and its read answers the head's
 * parts resolved, the action cut to the reader's level as a block's actions are, through `kernel.page`'s `level`.
 * Invented list, page and words throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

const CRATES: Declaration = {
  id: 'register.crates',
  kind: 'register',
  body: { id: 'crates', name: 'Crates', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const HOLD: Declaration = {
  id: 'page.hold',
  kind: 'page',
  body: {
    page: 'hold',
    title: 'Hold',
    requires: ['register.crates'],
    header: { kicker: 'Below deck', action: { verb: 'row.create', label: 'Add a crate' }, back: { list: 'crates' } },
    blocks: [{ kind: 'table', source: 'register.crates', columns: [{ field: 'what' }] }],
  } as Declaration['body'],
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([CRATES, HOLD]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return k;
}

test('A PAGE WITH A HEAD INSTALLS AND ITS READ ANSWERS THE HEAD, the list it goes back to named by its name', async () => {
  const k = await record();
  const read = k.page('hold', undefined, { level: 'write' });
  assert.ok(read.ok, JSON.stringify(read));
  const head = read.value.head as { kicker?: string; back?: { href: string; label: string }; action?: { verb: string; label: string } };
  assert.equal(head.kicker, 'Below deck');
  assert.deepEqual(head.back, { href: '/r/crates', label: 'Crates' });
  assert.equal(head.action?.verb, 'row.create');
  assert.equal(head.action?.label, 'Add a crate');
});

test('A READER WHOSE LEVEL DOES NOT REACH THE HEAD ACTION IS SENT THE HEAD WITHOUT IT', async () => {
  const k = await record();
  const read = k.page('hold');
  assert.ok(read.ok, JSON.stringify(read));
  const head = read.value.head as { kicker?: string; action?: unknown };
  assert.equal(head.kicker, 'Below deck');
  assert.equal(head.action, undefined);
});
