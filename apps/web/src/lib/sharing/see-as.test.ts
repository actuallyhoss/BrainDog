/**
 * See as: the header goes on every call to this origin's record and nowhere else, and a change the
 * host refused for See as is said with the person's name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSeenAs, seeing, SEE_AS_HEADER } from './see-as.svelte.ts';

const ORIGIN = 'https://brain.dog';
const PRIYA = { id: 'p_pri', name: 'Priya' };

function host(answer: (url: string, init: RequestInit | undefined) => Response) {
  const seen: { url: string; as: string | null }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, as: new Headers(init?.headers).get(SEE_AS_HEADER) });
    return answer(url, init);
  }) as typeof fetch;
  return { f, seen };
}

test("THE HEADER GOES ON THIS ORIGIN'S RECORD CALLS ONLY, and only while somebody is seen as", async () => {
  const { f, seen } = host(() => new Response('{"ok":true,"value":1}', { status: 200 }));
  let as: typeof PRIYA | null = PRIYA;
  const wrapped = seeing(f, () => as, () => ORIGIN);
  await wrapped(`${ORIGIN}/app/kiln/api/list?register=tasks`);
  await wrapped(`${ORIGIN}/auth/methods`);
  await wrapped('https://elsewhere.example/api/boot');
  as = null;
  await wrapped(`${ORIGIN}/api/boot`);
  assert.deepEqual(
    seen.map((s) => s.as),
    ['p_pri', null, null, null],
  );
});

test("A CHANGE REFUSED FOR SEE AS IS SAID WITH THEIR NAME, and any other refusal is the record's own", async () => {
  const preview = { ok: false, refusal: { code: 'FORBIDDEN', fix: "You're seeing the record as somebody else. Exit See as to change things.", at: 'preview' } };
  const other = { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner can do that.', at: 'principal' } };
  const { f } = host((url) => new Response(JSON.stringify(url.endsWith('/update') ? preview : other), { status: 403 }));
  const wrapped = seeing(f, () => PRIYA, () => ORIGIN);
  const said = await (await wrapped(`${ORIGIN}/api/update`, { method: 'POST', body: '{}' })).json();
  assert.equal(said.refusal.fix, "You're seeing as Priya. Exit to change things.");
  assert.equal(said.refusal.code, 'FORBIDDEN');
  const kept = await (await wrapped(`${ORIGIN}/api/vault`, { method: 'POST', body: '{}' })).json();
  assert.equal(kept.refusal.fix, 'Only an owner can do that.');
});

test('WHO IS READ FROM THE TAB, and anything malformed there names nobody', () => {
  const store = (raw: string | null) => ({ getItem: () => raw, setItem: () => undefined, removeItem: () => undefined });
  assert.deepEqual(readSeenAs(store(JSON.stringify(PRIYA))), PRIYA);
  assert.equal(readSeenAs(store(null)), null);
  assert.equal(readSeenAs(store('{not json')), null);
  assert.equal(readSeenAs(store(JSON.stringify({ id: 'x'.repeat(65), name: 'Long' }))), null);
  assert.equal(readSeenAs(null), null);
});
