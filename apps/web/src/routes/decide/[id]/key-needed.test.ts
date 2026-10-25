/**
 * Keeping a key an arrangement needs, from Decide (`key-needed.ts`), with the Keychain behind a passphrase.
 *
 * AUDIT 40-42 FINDING 8: the typed key was emptied before the request, so a locked Keychain's first refusal, the one that
 * asks for the passphrase, threw the key away and left the person a passphrase field and nothing to send with it. These
 * hold the order the Keys screen keeps: the passphrase is emptied before the request leaves, the key only after the
 * record kept it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { asksOpens, blankForm, keep, ready, type KeyClient, type KeyForm } from './key-needed.ts';
import type { Need } from './arranged.ts';

const KEY = 'sk_test_51abc';
const NEED: Need = { label: 'Stripe', opens: 'api.stripe.com', scheduled: true, held: 'none' };

type Args = Parameters<KeyClient['putKey']>[0];
type Answer = Awaited<ReturnType<KeyClient['putKey']>>;

const ASKS = { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'Type the keychain password to keep a key.', at: 'passphrase' } } as Answer;
const WRONG = { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'That passphrase did not open the Keychain.', at: 'passphrase' } } as Answer;
const KEPT = { ok: true, value: { credential: 'cred_1', label: 'Stripe', version: 1, rotated: false } } as Answer;

/** A client that answers in turn, and remembers what each request carried and what the form held while it was out. */
function stub(form: KeyForm, ...answers: Answer[]) {
  const sent: Args[] = [];
  const during: KeyForm[] = [];
  const client: KeyClient = {
    putKey: async (args) => {
      sent.push(args);
      during.push({ ...form });
      return answers.shift() ?? KEPT;
    },
  };
  return { client, sent, during };
}

test('A LOCKED KEYCHAIN’S FIRST REFUSAL KEEPS THE KEY TYPED and asks for the passphrase', async () => {
  const form = { ...blankForm(), value: KEY };
  const s = stub(form, ASKS);
  const out = await keep(NEED, form, s.client);
  assert.deepEqual(out, { ok: false, said: 'Type the keychain password to keep a key.' });
  assert.equal(form.value, KEY, 'the refusal threw the typed key away');
  assert.equal(form.locked, true, 'the passphrase field was not asked for');
  assert.equal(s.sent[0]?.value, KEY);
  assert.equal('passphrase' in (s.sent[0] ?? {}), false, 'a passphrase was sent before one was asked for');
  assert.equal(ready(NEED, form), false, 'the press is open before the passphrase is typed');
});

test('THE SECOND TRY SENDS THE SAME KEY WITH THE PASSPHRASE, empties the passphrase before it leaves and the key after', async () => {
  const form = { ...blankForm(), value: KEY };
  const s = stub(form, ASKS, KEPT);
  await keep(NEED, form, s.client);
  form.passphrase = 'correct horse';
  assert.equal(ready(NEED, form), true);
  const out = await keep(NEED, form, s.client);
  assert.deepEqual(out, { ok: true });
  assert.deepEqual(s.sent[1], { label: 'Stripe', value: KEY, opens: 'api.stripe.com', sealed_under: 'connector', passphrase: 'correct horse' });
  assert.equal(s.during[1]?.passphrase, '', 'the passphrase sat in the form while the request was out');
  assert.equal(s.during[1]?.value, KEY);
  assert.equal(form.value, '', 'the key stayed in the form after the record kept it');
});

test('A WRONG PASSPHRASE EMPTIES ONLY THE PASSPHRASE: the key is still there for the next try', async () => {
  const form = { ...blankForm(), value: KEY, locked: true, passphrase: 'wrong' };
  const s = stub(form, WRONG);
  const out = await keep(NEED, form, s.client);
  assert.deepEqual(out, { ok: false, said: 'That passphrase did not open the Keychain.' });
  assert.equal(form.value, KEY);
  assert.equal(form.passphrase, '');
  assert.equal(form.locked, true);
});

test('WHAT IT OPENS is the arrangement’s when it said one, the person’s when it could not, and none for a person’s key', async () => {
  const unsaid: Need = { ...NEED, opens: '' };
  assert.equal(asksOpens(unsaid), true);
  assert.equal(asksOpens({ ...unsaid, held: 'person' }), false);
  const form = { ...blankForm(), value: KEY };
  assert.equal(ready(unsaid, form), false, 'sent without saying what it opens');
  form.opens = '  hooks.example.com ';
  const s = stub(form, KEPT);
  await keep(unsaid, form, s.client);
  assert.equal(s.sent[0]?.opens, 'hooks.example.com');
  assert.equal(form.opens, '');
});

test('THE COMPONENT KEEPS THROUGH key-needed.ts and never empties the key itself', () => {
  const text = readFileSync(new URL('./KeyNeeded.svelte', import.meta.url), 'utf8');
  const script = text.match(/<script lang="ts">([\s\S]*?)<\/script>/u)?.[1] ?? '';
  assert.match(script, /from '\.\/key-needed\.ts'/u);
  assert.doesNotMatch(script, /\bvalue\s*=\s*''/u, 'KeyNeeded.svelte empties the key on its own again');
  assert.doesNotMatch(script, /putKey\(/u, 'KeyNeeded.svelte sends the key on its own again');
});
