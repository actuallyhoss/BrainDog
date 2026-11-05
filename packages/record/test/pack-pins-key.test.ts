/**
 * An approval that says a key goes to one host holds it there, whichever door it was pressed through.
 *
 * The plan prints "This key will be sent to X only from now on." beside a key whose keychain entry names no host, and the
 * owner approves that line. `pinHost` ran only for a `change` or a `pattern` on Decide. Installing an add-on is the other
 * door to the same line, and it wrote nothing: measured, the entry still said "the shop test account" after the press, so
 * the next add-on could carry the key to another host, on a line that said it would not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { testSigner } from '../../kernel/test/signer.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const KEY = { label: 'shop', opens: 'the shop test account', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' };
const carrier = (pack: string, url: string) => ({
  pack,
  version: '1.0.0',
  summary: 'Carries it.',
  author: 'Someone',
  license: 'MIT',
  declarations: [{ ingest: `${pack}-poll`, channel: 'call', url, every: '1h', grant: 'shop', body: { text: 'up' } }],
  seeds: [],
});
type Planned = { ok: boolean; value: { diff: { planHash: string; approve: string[] } }; refusal?: { fix: string } };

test('AN INSTALL HOLDS THE KEY TO THE HOST ITS LINE NAMED, and only a press that said so', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 10, 5, 12)), sign: testSigner() });
  assert.ok(api.kernel.bindGrant(KEY as never, 'p_1').ok);
  const doc = carrier('carrier', 'https://shop.example/in');
  const planned = (await api.planPack({ doc }, owner)) as unknown as Planned;
  assert.ok(planned.ok, planned.refusal?.fix);
  assert.ok(planned.value.diff.approve.some((l) => l.includes('This key will be sent to shop.example only from now on.')), JSON.stringify(planned.value.diff.approve));
  const opens = () => sql.one<{ opens: string }>("SELECT opens FROM grant WHERE label = 'shop'")?.opens;
  assert.equal(opens(), KEY.opens, 'the plan alone wrote the entry');
  const put = (await api.installPack({ doc, planHash: planned.value.diff.planHash, approve: planned.value.diff.approve }, owner)) as unknown as { ok: boolean; refusal?: { fix: string } };
  assert.ok(put.ok, put.refusal?.fix);
  assert.equal(opens(), 'shop.example');

  /* AND AN ENTRY THAT ALREADY NAMES A HOST IS NEVER MOVED BY ANOTHER ADD-ON'S PRESS. */
  const other = carrier('other-carrier', 'https://collector.example/in');
  const again = (await api.planPack({ doc: other }, owner)) as unknown as Planned;
  assert.ok(again.ok, again.refusal?.fix);
  const second = await api.installPack({ doc: other, planHash: again.value.diff.planHash, approve: again.value.diff.approve }, owner);
  if ((second as { ok: boolean }).ok) assert.equal(opens(), 'shop.example');
  sql.close();
});
