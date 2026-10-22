/**
 * The sealer setup sync seals with (`sealer.ts`): a file sealed under the sync key opens only under that key and at the
 * key it was kept at, the key's copy opens only with the passphrase it was sealed under, and a version is the same for
 * the same bytes on every machine and tells the host nothing.
 *
 * PBKDF2 at 600,000 rounds takes a moment, so the passphrase tests derive as few keys as they need.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  IV_BYTES,
  KEY_BYTES,
  keyAad,
  keyFromText,
  keyText,
  MAGIC,
  newSyncKey,
  open,
  passphraseFault,
  readWrapped,
  ROUNDS,
  seal,
  TAG_BYTES,
  unwrapKey,
  versionOf,
  wrapKey,
} from '../src/sealer.ts';

const KEY = Buffer.alloc(KEY_BYTES, 7);
const OTHER = Buffer.alloc(KEY_BYTES, 9);
const BYTES = Buffer.from('SHOP_URL=https://shop.example\nnot a secret, but sealed all the same\n', 'utf8');
const PASSPHRASE = 'a lantern by the harbour wall';

test('A FILE SEALED UNDER THE KEY OPENS UNDER IT, AT THE KEY IT WAS KEPT AT, AND NOWHERE ELSE', () => {
  const sealed = seal(KEY, 'carry/4/0123456789abcdef01234567', BYTES);
  assert.ok(sealed.subarray(0, 4).equals(MAGIC), 'it starts BDS1');
  assert.equal(sealed.length, MAGIC.length + IV_BYTES + BYTES.length + TAG_BYTES);
  assert.ok(open(KEY, 'carry/4/0123456789abcdef01234567', sealed)?.equals(BYTES));
  assert.equal(open(OTHER, 'carry/4/0123456789abcdef01234567', sealed), null, 'another key');
  assert.equal(open(KEY, 'carry/5/0123456789abcdef01234567', sealed), null, 'moved to another thing');
  assert.equal(open(KEY, 'carry/4/fedcba9876543210fedcba98', sealed), null, 'moved to another version');
  /* NOT A BYTE OF IT IS IN THE CLEAR. */
  assert.ok(!sealed.includes(Buffer.from('shop.example')), 'the bytes showed through');
});

test('A CHANGED, CUT OR FOREIGN FILE DOES NOT OPEN, and the same bytes seal differently each time', () => {
  const sealed = seal(KEY, 'sync/x', BYTES);
  for (const at of [0, 5, MAGIC.length + IV_BYTES + 3, sealed.length - 1]) {
    const changed = Buffer.from(sealed);
    changed[at] = (changed[at] ?? 0) ^ 1;
    assert.equal(open(KEY, 'sync/x', changed), null, `a byte changed at ${String(at)}`);
  }
  assert.equal(open(KEY, 'sync/x', sealed.subarray(0, sealed.length - 1)), null, 'cut short');
  assert.equal(open(KEY, 'sync/x', Buffer.alloc(10)), null, 'too short to be one');
  assert.equal(open(KEY, 'sync/x', Buffer.concat([Buffer.from('BDS2'), sealed.subarray(4)])), null, 'another format');
  assert.ok(!seal(KEY, 'sync/x', BYTES).equals(seal(KEY, 'sync/x', BYTES)), 'a fresh IV each time');
  assert.ok(open(KEY, 'sync/x', seal(KEY, 'sync/x', Buffer.alloc(0)))?.equals(Buffer.alloc(0)), 'an empty file seals too');
});

test('A KEY THAT IS NOT 32 BYTES SEALS NOTHING, and the sentence quotes none of it', () => {
  const short = Buffer.from('0123456789abcdef', 'utf8');
  assert.throws(
    () => seal(short, 'sync/x', BYTES),
    (e: Error) => /not 32 bytes/u.test(e.message) && !e.message.includes('0123456789abcdef'),
  );
  assert.equal(open(short, 'sync/x', seal(KEY, 'sync/x', BYTES)), null);
});

test("THE KEY'S COPY OPENS WITH ITS PASSPHRASE, for its own record alone, and the passphrase is read in NFC", () => {
  const key = newSyncKey();
  assert.equal(key.length, KEY_BYTES);
  const copy = wrapKey(key, PASSPHRASE, 'the-bench');
  assert.deepEqual([copy.v, copy.kdf, copy.rounds], [1, 'pbkdf2-sha256', ROUNDS]);
  /* AS THE RECORD KEEPS IT: JSON, read back as a copy. */
  const kept = readWrapped(JSON.parse(JSON.stringify(copy)));
  assert.ok(kept !== null);
  assert.ok(unwrapKey(kept, PASSPHRASE, 'the-bench')?.equals(key));
  assert.equal(unwrapKey(kept, `${PASSPHRASE}.`, 'the-bench'), null, 'a wrong passphrase');
  assert.equal(unwrapKey(kept, PASSPHRASE, 'another-record'), null, "another record's copy");
  assert.ok(!JSON.stringify(copy).includes(key.toString('hex')) && !JSON.stringify(copy).includes(key.toString('base64')), 'the key in the clear');

  /* "CAFÉ" TYPED AS ONE CHARACTER OR AS E AND AN ACCENT IS ONE PASSPHRASE. */
  const composed = 'caf\u00e9 by the harbour';
  const decomposed = 'cafe\u0301 by the harbour';
  const accented = wrapKey(key, composed, 'the-bench');
  assert.ok(unwrapKey(accented, decomposed, 'the-bench')?.equals(key));
});

test('A COPY OUT OF SHAPE IS NO COPY: another version, another derivation, rounds a host could stall on, a cut field', () => {
  const copy = { v: 1, kdf: 'pbkdf2-sha256', rounds: ROUNDS, salt: Buffer.alloc(16, 1).toString('base64'), iv: Buffer.alloc(12, 2).toString('base64'), ct: Buffer.alloc(48, 3).toString('base64') };
  assert.ok(readWrapped(copy) !== null);
  for (const bad of [
    { ...copy, v: 2 },
    { ...copy, kdf: 'scrypt' },
    { ...copy, rounds: 1_000 },
    { ...copy, rounds: 50_000_000 },
    { ...copy, rounds: 600_000.5 },
    { ...copy, salt: Buffer.alloc(8).toString('base64') },
    { ...copy, iv: Buffer.alloc(16).toString('base64') },
    { ...copy, ct: Buffer.alloc(40).toString('base64') },
    { ...copy, ct: 'not base64!' },
    null,
    'a string',
  ])
    assert.equal(readWrapped(bad), null, JSON.stringify(bad));
});

test('A NEW PASSPHRASE IS 12 TO 1,024 CHARACTERS, counted as a person counts them', () => {
  assert.match(passphraseFault('short one') ?? '', /at least 12 characters/u);
  assert.equal(passphraseFault('twelve chars'), null);
  assert.match(passphraseFault('x'.repeat(1_025)) ?? '', /at most 1024 characters/u);
  /* Eleven letters with one accent written as two code points is still eleven characters. */
  assert.match(passphraseFault('cafe\u0301 harbou') ?? '', /at least/u);
});

test('THE KEY AS A STORE KEEPS IT: 64 hex characters, read back only when it is exactly that', () => {
  assert.equal(keyText(KEY), '07'.repeat(32));
  assert.ok(keyFromText(keyText(KEY))?.equals(KEY));
  assert.ok(keyFromText(`${keyText(KEY)}\n`)?.equals(KEY), 'a line break a store adds');
  for (const bad of [null, '', '07'.repeat(31), '07'.repeat(33), 'AB'.repeat(32), 'zz'.repeat(32)]) assert.equal(keyFromText(bad), null, String(bad));
  assert.equal(keyAad('the-bench'), 'braindog-sync-key:the-bench');
});

test('A VERSION IS THE SAME FOR THE SAME BYTES, differs by key, label and bytes, and is no plain hash of them', () => {
  const v = versionOf(KEY, 'carry/4', BYTES);
  assert.match(v, /^[0-9a-f]{24}$/u);
  assert.equal(versionOf(KEY, 'carry/4', Buffer.from(BYTES)), v, 'the same bytes, the same version');
  assert.notEqual(versionOf(OTHER, 'carry/4', BYTES), v, 'another key');
  assert.notEqual(versionOf(KEY, 'carry/5', BYTES), v, 'another thing');
  assert.notEqual(versionOf(KEY, 'carry/4', Buffer.concat([BYTES, Buffer.from('x')])), v, 'other bytes');
  /* A HOST THAT GUESSES THE BYTES CANNOT CHECK ITS GUESS against the version. */
  assert.ok(!createHash('sha256').update(BYTES).digest('hex').startsWith(v));
});
