/**
 * A lookup's three optional keys at install (REC-A02 step 8): `says`, the noun its question uses; `where`, a filter over
 * the list; `split`, a field holding several values parted by commas.
 *
 * BEFORE: every key beside `register` and `by` was refused as one that "would install and do nothing", so an add-on could
 * not say a text's digits are a card's, keep a card text off a current account that ends alike, or keep a replaced card's
 * old digits beside its new ones. Now each installs, and each is held to its shape: a filter naming no field of the list
 * would install and then admit nothing, so every text would wait for an account it could never read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { ACCOUNTS, CARD, LEDGER, NOW } from './ingest-tail-kit.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

async function install(...decls: Declaration[]): Promise<{ ok: boolean; code?: string; at?: string; fix?: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([ACCOUNTS, LEDGER, ...decls]);
  sql.close();
  return out.ok ? { ok: true } : { ok: false, ...(out as { refusal: { code: string; at?: string; fix: string } }).refusal };
}

test('SAYS, WHERE AND SPLIT INSTALL, the filter as a sentence or as a tree', async () => {
  assert.deepEqual(await install(CARD({}, { says: 'card', where: 'kind is card', split: true })), { ok: true });
  assert.deepEqual(await install(CARD({}, { where: { field: 'kind', is: 'card' } })), { ok: true });
  assert.deepEqual(await install(CARD({}, { says: undefined, where: undefined, split: false })), { ok: true });
});

test('EACH IS HELD TO ITS SHAPE, and the refusal names the key', async () => {
  for (const [lookup, key] of [
    [{ says: '' }, 'says'],
    [{ says: 42 }, 'says'],
    [{ says: 'a card, or two' }, 'says'],
    [{ says: 'x'.repeat(25) }, 'says'],
    [{ split: 'yes' }, 'split'],
    [{ where: 7 }, 'where'],
    [{ where: '' }, 'where'],
  ] as const) {
    const out = await install(CARD({}, lookup));
    assert.equal(out.ok, false, `${JSON.stringify(lookup)} installed`);
    assert.equal(out.code, 'EXTRACTOR_UNKNOWN', JSON.stringify(out));
    assert.equal(out.at, `ingest.bank-sms.extract.account.lookup.${key}`, JSON.stringify(out));
  }
});

test('A FILTER IS READ AGAINST THE LIST IT FILTERS, so one naming no field of it is refused, not installed silent', async () => {
  const wrong = await install(CARD({}, { where: 'colour is red' }));
  assert.equal(wrong.ok, false, 'a filter over a field Accounts does not have installed');
  assert.match(wrong.at ?? '', /^ingest\.bank-sms\.extract\.account\.lookup\.where/u);
  const value = await install(CARD({}, { where: 'kind is boat' }));
  assert.equal(value.ok, false, 'a filter for a value the field cannot hold installed');
});

test('ANY OTHER KEY IS STILL ONE THAT WOULD DO NOTHING, and is refused as before', async () => {
  const out = await install(CARD({}, { nickname: 'card' }));
  assert.equal(out.ok, false);
  assert.equal(out.code, 'EXTRACTOR_UNKNOWN');
  assert.match(out.fix ?? '', /takes register, by, says, where, split, after, before, between/u);
});
