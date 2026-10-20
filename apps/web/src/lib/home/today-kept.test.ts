/** `today-kept.ts`: Today opened again draws what it last drew, and asks each tile once a version. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { forgetToday, keepPart, keptPart, tileOnce, TODAY_KEPT_MS } from './today-kept.ts';

const NOON = new Date(2026, 9, 20, 12).getTime();

test('A PART IS DRAWN AGAIN FOR THE SAME QUESTION, the same day and while young, and never for another', () => {
  forgetToday();
  keepPart('body', 'k1', { n: 1 }, NOON);
  assert.deepEqual(keptPart('body', 'k1', NOON + 1000), { n: 1 });
  assert.equal(keptPart('body', 'k2', NOON + 1000), null, 'another voice, other lists');
  assert.equal(keptPart('body', 'k1', NOON + TODAY_KEPT_MS), null, 'too old');
  keepPart('body', 'k1', { n: 2 }, new Date(2026, 9, 20, 23, 59).getTime());
  assert.equal(keptPart('body', 'k1', new Date(2026, 9, 21, 0, 1).getTime()), null, 'past midnight, today is another day');
  forgetToday();
  assert.equal(keptPart('body', 'k1', NOON), null);
});

test('A TILE IS ASKED ONCE A VERSION, again when the version moves, and a throw is not kept', async () => {
  forgetToday();
  let asked = 0;
  const ask = async () => ++asked;
  assert.equal(await tileOnce('handled', 'https://a', '7 0', ask, NOON), 1);
  assert.equal(await tileOnce('handled', 'https://a', '7 0', ask, NOON + 10), 1);
  assert.equal(asked, 1);
  assert.equal(await tileOnce('handled', 'https://a', '8 0', ask, NOON + 20), 2, 'the record moved');
  assert.equal(await tileOnce('handled', 'https://b', '8 0', ask, NOON + 20), 3, 'another record');
  await assert.rejects(tileOnce('learned', 'https://a', '8 0', async () => Promise.reject(new Error('down')), NOON));
  assert.equal(await tileOnce('learned', 'https://a', '8 0', ask, NOON + 30), 4, 'the throw was not kept');
});

test('HOME DRAWS ITS BODY, DESK AND BRIEFING FROM WHAT IT KEPT, and asks each tile through `tileOnce`', () => {
  const home = readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8');
  assert.match(home, /keptPart<KeptBody>\('body', key\)/u);
  assert.match(home, /keptPart<NonNullable<typeof desk>>\('desk', base\)/u);
  for (const tile of ['briefing', 'matched', 'stale', 'desk', 'handled', 'learned', 'lessons', 'named', 'hues', 'imported'])
    assert.match(home, new RegExp(`tileOnce\\('${tile}', base, ver,`, 'u'), `${tile} is asked again at the same version`);
  /* THE KEPT BODY SETTLES THE SCREEN AT ONCE, and the read behind it is not bracketed. */
  assert.match(home, /const at = was \? null : untrack\(opened\);/u);
});
