/**
 * The one provisioning mistake that cannot be undone: a record made before `KEK` was bound.
 *
 * A RECORD IS GIVEN ITS THREE KEYS ONCE, in the same transaction that creates it, and never again.
 * `createRecord` writes `vault_key` with `ON CONFLICT (purpose) DO NOTHING` on purpose, because a
 * second create carrying fresh keys would overwrite the record DEK and make every sealed grant
 * unopenable. The consequence at the other end of that rule is the thing tested here: a record
 * provisioned while `env.KEK` is unbound reads, writes and signs people in, and can never seal a
 * grant, run a connector, hold a model key or sign an export. Binding `KEK` an hour later does not
 * give it keys. The only repair is to throw the record away and provision again.
 *
 * SO THE DEPLOYMENT SAYS NO, AND SAYS THE ORDER. What is held here is the guard itself, its
 * sentence, its deliberate opt-in, and that `provision()` consults it before the Directory has
 * written a person or claimed a name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { KEYLESS_ON_PURPOSE, keylessRefusal } from '../src/keyless.ts';
import type { KeyStore } from '../src/keys.ts';

/** A store is a thing with `current` and `byId`; the guard only ever asks whether there is one. */
const STORE = { current: () => Promise.resolve({ kekId: 'feedfacefeedface', key: null as never }), byId: () => Promise.resolve(null) } as KeyStore;

const source = () => readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('WITH NO KEY STORE BOUND, PROVISIONING IS REFUSED, and the refusal names the order', () => {
  const said = keylessRefusal(null, undefined);
  assert.ok(said, 'a record was provisioned with no key store and nothing said so');
  assert.equal(said.code, 'NOT_IN_THIS_BUILD');
  assert.equal(said.at, 'KEK');
  assert.match(said.fix, /\bKEK\b/, 'the refusal does not name the binding that is missing');
  assert.match(said.fix, /before|first/i, 'the refusal does not say which comes first');
  assert.match(said.fix, /PROVISION_WITHOUT_KEYS/, 'the refusal does not say how a keyless record is made on purpose');
});

test('and with one bound it is not, which is every ordinary provisioning', () => {
  assert.equal(keylessRefusal(STORE, undefined), null);
  assert.equal(keylessRefusal(STORE, KEYLESS_ON_PURPOSE), null, 'a bound key store was ignored because the opt-in was set');
});

test('A KEYLESS RECORD IS STILL POSSIBLE, and only for somebody who wrote down that they meant it', () => {
  // A test host that never seals anything is a legitimate deployment. It is not the default one.
  assert.equal(keylessRefusal(null, KEYLESS_ON_PURPOSE), null);
  assert.equal(keylessRefusal(null, '  YES  '), null, 'the opt-in is read off a deployment var, where whitespace and case are not a decision');
});

test('and anything else fails CLOSED, because a mistyped opt-in must not be the permanent mistake', () => {
  for (const said of ['', ' ', 'no', 'true', '1', 'yes please', 'yep'])
    assert.ok(keylessRefusal(null, said), `${JSON.stringify(said)} was taken as the opt-in`);
});

test('THE GUARD RUNS BEFORE THE DIRECTORY WRITES ANYTHING, so a refused provisioning leaves no half-made person', () => {
  /* `prepare` mints the owner as a `dir_person` row and claims the slug. Refusing after it would
     leave the address known to a Directory that names no record for it, which is the second half of
     the same ordering bug. */
  const text = source();
  const provision = text.slice(text.indexOf('async function provision('));
  const guarded = provision.indexOf('keylessRefusal(');
  const prepared = provision.indexOf('directory.prepare(');
  assert.ok(guarded > 0, 'provisioning does not consult the keyless guard at all');
  assert.ok(prepared > 0 && guarded < prepared, 'provisioning writes to the Directory before it decides whether the record can have keys');

  /* AND THE ANSWER IS RETURNED, WHICH THE TWO LINES ABOVE DO NOT SAY. Measured: changing the wiring
     to `if (keyless && false) return ...` left all six tests in this file green, because nothing
     here calls `provision()` — it is module-private, and reaching it needs a Directory stub and a
     Record stub. So the shape is read instead: the name the guard answers into is the name the
     refusal is returned under, on the statement immediately after. A guard whose answer is computed
     and dropped is the keyless record with an extra line of code in front of it. */
  assert.match(
    provision,
    /const (\w+) = keylessRefusal\([^)]*\);\s*if \(\1\) return \{ ok: false, refusal: \1 \};/,
    'provisioning asks the keyless guard and does not return what it answers',
  );
});

test('and the opt-in is a declared binding rather than a string read out of nowhere', () => {
  const text = source();
  assert.match(text, /PROVISION_WITHOUT_KEYS\?: string;/, 'the opt-in is not declared on Env, so a deployment cannot be typechecked against it');
  assert.equal((text.match(/env\.PROVISION_WITHOUT_KEYS\b/g) ?? []).length, 1, 'something other than provisioning reads the keyless opt-in');
});
