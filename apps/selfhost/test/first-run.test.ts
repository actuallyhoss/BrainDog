import { test } from 'node:test';
import assert from 'node:assert/strict';

import { claimUrl, degradeLines, setupLine } from '../src/first-run.ts';

const dir = (passkey: boolean, email: string | null) =>
  ({
    one: (q: string) => (q.includes('dir_passkey') ? (passkey ? { x: 1 } : undefined) : email ? { email } : undefined),
  }) as never;

test('THE SETUP LINE CARRIES A CLAIM LINK ONLY UNTIL THE OWNER HAS A PASSKEY', async () => {
  const auth = async () => ({ status: 200, mail: { claimToken: 'tok' } });
  const line = await setupLine({ dir: dir(false, 'ada@example.com'), auth, origin: 'http://localhost:8080', signInOff: null });
  assert.match(line ?? '', /http:\/\/localhost:8080\/signin#claim=tok/);
  assert.equal(claimUrl('http://x', 'a'), 'http://x/signin#claim=a');
  assert.equal(await setupLine({ dir: dir(true, 'ada@example.com'), auth, origin: 'http://x', signInOff: null }), null);
  assert.equal(await setupLine({ dir: dir(false, null), auth, origin: 'http://x', signInOff: null }), null);
});

test('AN OPEN LOOPBACK HOST SAYS WHERE TO OPEN AND MINTS NOTHING', async () => {
  const auth = async () => assert.fail('no link is minted');
  const line = await setupLine({ dir: dir(false, 'a@b.c'), auth, origin: 'http://localhost:8080', signInOff: 'open' });
  assert.match(line ?? '', /open http:\/\/localhost:8080/);
});

test('EACH SERVICE THAT IS OFF IS A PLAIN LINE, NEVER AN ERROR', () => {
  const off = degradeLines({}, false).join('\n');
  for (const word of ['mail: off', 'model: off', 'billing: off', 'turnstile: off']) assert.ok(off.includes(word), word);
  const on = degradeLines({ SLASH_FALLBACK_ENDPOINT: 'https://m', SLASH_FALLBACK_MODEL: 'm', SLASH_FALLBACK_KEY: 'k' }, true).join('\n');
  assert.ok(!on.includes('mail: off') && !on.includes('model: off'));
});
