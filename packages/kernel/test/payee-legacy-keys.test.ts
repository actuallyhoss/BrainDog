/**
 * A payee stored under the key it had before the shop name was read by itself (`bank:wwwtalabat`) is still the one a
 * new text means (`WWW.TALABAT.COM` is `bank:talabat` now): the old key is tried when the new one misses, and the new
 * key is not trusted onto the row by a bank text. Nothing stored is rewritten.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Met, type WriteContext } from '../src/index.ts';
import { bankKey, legacyBankKey, legacyKeysOf } from '../src/identity-keys.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const OWNER: WriteContext = { actor: 'p_owner' };

const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    org: { name: 'name', keys: 'keys', kind: 'kind', domain: 'domain', merged_into: 'merged_into', met: 'met' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'kind', type: 'enum', values: ['company', 'merchant', 'other'] },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  },
} as never;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('THE OLD KEY OF A PAYEE IS THE ONE IT HAD BEFORE, and none where nothing changed', () => {
  assert.equal(bankKey('WWW.TALABAT.COM'), 'bank:talabat');
  assert.equal(legacyBankKey('WWW.TALABAT.COM'), 'bank:wwwtalabat');
  assert.notEqual(legacyBankKey('HSBC CARD 7731 POS 55 KFC'), null);
  assert.equal(legacyBankKey('TALABAT'), null);
  assert.deepEqual(legacyKeysOf({ keys: ['bank:WWW.TALABAT.COM', 'domain:acme.example'] }), ['bank:wwwtalabat']);
});

test('AN ORGANISATION HOLDING bank:wwwtalabat IS THE ONE A NEW TALABAT TEXT MEETS, and gains the new key beside the old', async () => {
  const k: Kernel = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([ORGS]));
  const held = value<{ id: string }>(k.create('organisations', { name: 'Talabat', keys: ['bank:wwwtalabat'] }, OWNER));
  for (const said of ['bank:WWW.TALABAT.COM', 'bank:TALABAT', 'bank:GEIDEA*TALABAT 0423 CAIRO EG']) {
    const met = value<Met>(k.meet({ kind: 'organisation', name: 'Talabat', keys: [said], source: 'bank text' }, OWNER));
    assert.equal(met.row?.id, held.id, said);
    assert.equal(met.created, false, said);
  }
  /* NOTHING STORED WAS REWRITTEN, and no second organisation was made. */
  assert.deepEqual(k.get(held.id)?.fields.keys, ['bank:wwwtalabat']);
});
