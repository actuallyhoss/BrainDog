/**
 * SEC6 (security review of 30 Oct): CHANGING THE SIGN-IN EMAIL TOLD ANYBODY WITH A SESSION WHO HAS AN ACCOUNT, AND MAILED
 * ANY ADDRESS WITH NO LIMIT OF ITS OWN. `{ email: X }` answered "Another account already signs in with that address" when
 * X had an account and sent X a letter when it did not; only the 120-a-minute IP limit stood in the way. Now both are the
 * same answer, a taken address is mailed nothing, and each ask spends the asker's budget and the address's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 30, 12);

function setup() {
  const d = createDirectory(openSqlite(), fixedClock(NOW), { mac: new Uint8Array(32).fill(7), rp: { id: 'studio.example', origin: 'https://studio.example' }, magic: true });
  const ada = d.person$('ada@example.com', 'Ada');
  const bo = d.person$('bo@example.com', 'Bo');
  assert.ok(ada.ok && bo.ok);
  return { d, ada: (ada.value as { id: string }).id };
}

test('SEC6: AN ADDRESS ANOTHER ACCOUNT HOLDS IS ANSWERED LIKE ANY OTHER, AND GETS NO LINK', async () => {
  const { d, ada } = setup();
  const taken = await d.emailAsk(ada, 'bo@example.com');
  const free = await d.emailAsk(ada, 'nobody@example.com');
  assert.ok(taken.ok && free.ok, 'one of the two was refused, which says which address has an account');
  assert.equal(taken.value.token, null, 'a link was minted for an address somebody else signs in with');
  assert.equal(typeof free.value.token, 'string');
});

const limited = (r: { ok: boolean }): boolean => !r.ok && 'refusal' in r && (r as { refusal: { code: string } }).refusal.code === 'RATE_LIMITED';

test('SEC6: ONE ADDRESS IS ASKED FOR AT MOST THREE TIMES AN HOUR, WHOEVER HOLDS IT', async () => {
  const free = setup();
  for (let i = 0; i < 3; i++) assert.ok((await free.d.emailAsk(free.ada, 'victim@example.com')).ok, `ask ${i + 1}`);
  assert.ok(limited(await free.d.emailAsk(free.ada, 'victim@example.com')));
  /* THE SAME FOR A TAKEN ADDRESS, so the refusal says nothing about who holds it. */
  const taken = setup();
  for (let i = 0; i < 3; i++) assert.ok((await taken.d.emailAsk(taken.ada, 'bo@example.com')).ok, `ask ${i + 1}`);
  assert.ok(limited(await taken.d.emailAsk(taken.ada, 'bo@example.com')));
});

test("SEC6: A PERSON'S ASKS ARE AT MOST FIVE AN HOUR, whichever addresses they name", async () => {
  const { d, ada } = setup();
  for (let i = 0; i < 5; i++) assert.ok((await d.emailAsk(ada, `new-${i}@example.com`)).ok, `ask ${i + 1}`);
  assert.ok(limited(await d.emailAsk(ada, 'one-more@example.com')));
});
