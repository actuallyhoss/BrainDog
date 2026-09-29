/**
 * A keyless `fx` or `people` the record ALREADY holds beside a list declaring the role, from before the guard
 * (`keylessBeside`), is told what an installed list can do when its own update is refused.
 *
 * THE GUARD'S SENTENCE IS FOR A LIST ARRIVING. "Install fx under another id" is right for a keyless `fx` somebody is
 * about to add, and it was the sentence measured on the record that had one already: `rates` declaring `rates:`, an
 * `fx` of money-core's shape beside it put there before the guard, and the next update of `fx` refused with a fix an
 * installed list cannot follow, since a declaration's id is what it is and nothing renames one. The arriving case keeps
 * its sentence (`roles-keyless-second.test.ts`). The record here is made the way it was made then, by writing the `fx`
 * row under the guard rather than through it, since no install path lets it in now.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

type Out = { ok: boolean; refusal?: { code: string; fix: string; at?: string } };

const register = (id: string, fields: object[], more: Record<string, unknown> = {}): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title: (fields[0] as { id: string }).id, ...more, fields } }) as never;

const RATE_FIELDS = [
  { id: 'currency', type: 'text', required: true },
  { id: 'base', type: 'text', required: true },
  { id: 'rate', type: 'decimal', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
];
const RATES = register('rates', RATE_FIELDS, { rates: { currency: 'currency', base: 'base', rate: 'rate', as_of: 'as_of' } });
const PEOPLE_FIELDS = (self: string) => [
  { id: 'name', type: 'text', required: true },
  { id: 'email', type: 'email' },
  { id: 'handles', type: 'list', of: 'text' },
  { id: 'met', type: 'list', of: 'text' },
  { id: 'merged_into', type: 'ref', to: self },
];
const CONTACTS = register('contacts', PEOPLE_FIELDS('contacts'), { meets: { name: 'name', email: 'email', handles: 'handles', met: 'met', merged_into: 'merged_into' } });

/** The declaring list installed, then the keyless one written straight into the table, as it stood before the guard. */
async function heldBeside(declaring: Declaration, keyless: Declaration, pack: string | null): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const first = await openRecord(sql, fixedClock(NOW));
  const out = (await first.install([declaring])) as Out;
  assert.ok(out.ok, `${out.refusal?.code}: ${out.refusal?.fix}`);
  sql.exec(
    'INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at) VALUES (?, 1, ?, ?, ?, ?, 0, NULL, ?)',
    keyless.id,
    keyless.kind,
    pack,
    JSON.stringify(keyless.body),
    'held-before-the-guard',
    new Date(NOW).toISOString(),
  );
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

test('THE OWNER\'S OWN fx, HELD BESIDE rates, IS TOLD TO MOVE ITS ROWS AND RETIRE IT, not to install it under another id', async () => {
  const { k, sql } = await heldBeside(RATES, register('fx', RATE_FIELDS), null);
  const out = (await k.install([register('fx', [...RATE_FIELDS, { id: 'source', type: 'text' }])])) as Out;
  sql.close();
  assert.equal(out.ok, false, 'the update kept a second holder of the rates');
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(
    out.refusal?.fix,
    'register.fx has sat beside register.rates, which holds the rates, since before one list was held to them, so it holds rates no figure converts by, and this change keeps it there. Move its rows into rates, then retire register.fx.',
  );
  assert.doesNotMatch(out.refusal?.fix ?? '', /under another id/u);
});

test('A PACK\'S fx HELD BESIDE rates IS TOLD TO MOVE ITS ROWS AND LEAVE fx OUT OF THE PACK\'S NEXT VERSION', async () => {
  const { k, sql } = await heldBeside(RATES, register('fx', RATE_FIELDS), 'fxer');
  const update = { ...register('fx', [...RATE_FIELDS, { id: 'source', type: 'text' }]), pack: 'fxer' };
  const out = k.lint([update]);
  sql.close();
  assert.equal(out?.code, 'DECLARATION_INVALID');
  assert.equal(
    out?.fix,
    'register.fx has sat beside register.rates, which holds the rates, since before one list was held to them, so it holds rates no figure converts by, and this change keeps it there. Move its rows into rates, then update fxer to a version that leaves fx out.',
  );
});

test('A people HELD BESIDE A LIST DECLARING meets: IS TOLD THE SAME, in the people\'s words', async () => {
  const { k, sql } = await heldBeside(CONTACTS, register('people', PEOPLE_FIELDS('people')), null);
  const out = k.lint([register('people', [...PEOPLE_FIELDS('people'), { id: 'note', type: 'text' }])]);
  sql.close();
  assert.equal(
    out?.fix,
    'register.people has sat beside register.contacts, which holds the people meet writes, since before one list was held to them, so it holds people meet never finds, and this change keeps it there. Move its rows into contacts, then retire register.people.',
  );
});

test('A KEYLESS fx ARRIVING BESIDE rates KEEPS THE ARRIVING SENTENCE', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([RATES])).ok);
  const out = k.lint([register('fx', RATE_FIELDS)]);
  sql.close();
  assert.match(out?.fix ?? '', /Install fx under another id/u);
});
