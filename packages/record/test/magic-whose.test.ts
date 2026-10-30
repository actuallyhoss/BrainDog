/**
 * Whose account a sign-in link opens, asked before the press and spending nothing (`magic.whose`).
 *
 * LOGIN CSRF: a stranger's own link, sent as `/signin#magic=…`, put a signed-out reader into the stranger's record with
 * one press, and what they typed next landed there. The screen now says the link's address before the button, and this
 * is the question it asks: the address to the link's holder, the one failure body to anything else, and the link still
 * good to spend afterwards.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 30, 12);
const NOT_YOU = { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' };

function setup() {
  const d = createDirectory(openSqlite(), fixedClock(NOW), { mac: new Uint8Array(32).fill(7), rp: { id: 'studio.example', origin: 'https://studio.example' }, magic: true }, { sells: false });
  const made = d.person$('ada@example.com', 'Ada');
  assert.ok(made.ok);
  return d;
}

test('A LINK SAYS WHOSE ACCOUNT IT OPENS, AND IS STILL GOOD TO SPEND', async () => {
  const d = setup();
  const sent = await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: '203.0.113.1' });
  assert.equal(sent.status, 200);
  const linkToken = sent.status === 200 && sent.mail && 'linkToken' in sent.mail ? sent.mail.linkToken : assert.fail('no link');

  const whose = await d.auth({ flow: 'magic.whose', linkToken, ip: '203.0.113.2' });
  assert.equal(whose.status, 200);
  assert.deepEqual(whose.status === 200 ? whose.body : null, { email: 'ada@example.com' });
  /* Asking twice spends nothing. */
  assert.equal((await d.auth({ flow: 'magic.whose', linkToken, ip: '203.0.113.2' })).status, 200);

  const spent = await d.auth({ flow: 'magic.redeem', linkToken, ip: '203.0.113.2' });
  assert.equal(spent.status, 200, 'asking whose it was spent the link');
  const after = await d.auth({ flow: 'magic.whose', linkToken, ip: '203.0.113.3' });
  assert.equal(after.status, 401);
  assert.deepEqual('refusal' in after ? after.refusal : null, NOT_YOU);
});

test('A TOKEN NOBODY MINTED, OR ONE OF THE WRONG KIND, IS THE ONE FAILURE BODY', async () => {
  const d = setup();
  for (const call of [
    { flow: 'magic.whose' as const, linkToken: 'x'.repeat(43), ip: '203.0.113.9' },
    { flow: 'magic.whose' as const, linkToken: 'short', ip: '203.0.113.9' },
    { flow: 'magic.whose' as const, claimToken: 'y'.repeat(43), ip: '203.0.113.9' },
  ]) {
    const out = await d.auth(call);
    assert.equal(out.status, 401, JSON.stringify(call));
    assert.deepEqual('refusal' in out ? out.refusal : null, NOT_YOU);
  }
});
