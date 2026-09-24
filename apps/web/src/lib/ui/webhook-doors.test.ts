/**
 * The webhook doors screen: what the list reads, what each press sends, what each answer becomes, and the address
 * built from the path the record answers.
 *
 * THE SCREEN IT REPLACES COULD MINT FOR ONE DOOR. `shortcut-door.ts` sent `{ ingest: 'bank-from-out-sms' }` on every
 * press and spelled the address with that id in it, so a record declaring a door for anything else got a bank's
 * address or nothing. Measured before this file existed: the two-door test below, pointed at the old module's
 * `saidOf`, built `/in/webhook/<rec>/bank-from-out-sms/<token>` for a `stripe-events` mint and failed.
 *
 * THE ANSWERS ARE THE RECORD'S OWN, or the shapes agreed with it. Every refusal is one `ingestMint` in
 * `packages/record/src/index.ts` writes, with its code and its sentence; `doors` answers
 * `[{ id, description, verify, held, register }]` and the mint `{ ingest, token, rec, path }`, which a record-side
 * change lands in the same wave, so both are held here by doubles.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Fetch } from '../record/boot-live.ts';
import { copy } from '../copy.ts';
import { asksFirst, callerAt, doorUrl, doorsOf, listDoors, mintDoor, saidOf, type Call } from './webhook-doors.ts';

const BASE = 'https://app.brain.dog';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
/** The shape `webhookSecret()` mints, base64url. Invented. */
const TOKEN = 'Hq3v9XzR0bWm1sLkT7eYpA2cNuJd5fGi8oQ4tVxK6aE';
const pathOf = (ingest: string) => `/in/webhook/${REC}/${ingest}/${TOKEN}`;

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Sent = { path: string; method: string; body: unknown };

function host(answer: (() => Response) | null): { io: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ path: new URL(String(url)).pathname, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  }) as Fetch;
  return { io, sent };
}

/** A caller double: answers each method by name and writes down what it was asked. */
function caller(answers: Record<string, unknown>): { call: Call; asked: [string, unknown][] } {
  const asked: [string, unknown][] = [];
  const call: Call = async (name, args = {}) => {
    asked.push([name, args]);
    const a = answers[name];
    return typeof a === 'function' ? (a as (x: unknown) => never)(args) : (a as never);
  };
  return { call, asked };
}

const TWO = [
  { id: 'stripe-events', description: 'Payments reported by the card processor', verify: { kind: 'path' }, held: false, register: 'payments' },
  { id: 'build-results', description: 'Results posted by the build server', verify: { kind: 'path' }, held: true, register: 'builds' },
];

test('TWO DECLARED DOORS ARE TWO ROWS, each read from the record and named by its own description', async () => {
  const { call, asked } = caller({ doors: { ok: true, value: TWO } });
  const listed = await listDoors(call);
  assert.deepEqual(asked, [['doors', {}]]);
  assert.deepEqual(listed, {
    kind: 'doors',
    doors: [
      { id: 'stripe-events', name: 'Payments reported by the card processor', register: 'payments', mintable: true, held: false },
      { id: 'build-results', name: 'Results posted by the build server', register: 'builds', mintable: true, held: true },
    ],
  });
});

test('EACH PRESS MINTS FOR THE DOOR IT SITS ON, and the address is the path the record answered', async () => {
  const { call, asked } = caller({
    ingestMint: (args: { ingest: string }) => ({ ok: true, value: { ingest: args.ingest, token: TOKEN, rec: REC, path: pathOf(args.ingest) } }),
  });
  for (const door of TWO) {
    assert.deepEqual(await mintDoor(call, BASE, door.id), { kind: 'minted', token: TOKEN, url: `${BASE}${pathOf(door.id)}` });
  }
  assert.deepEqual(asked, [
    ['ingestMint', { ingest: 'stripe-events' }],
    ['ingestMint', { ingest: 'build-results' }],
  ]);
});

test('ONE PRESS THROUGH THE CLIENT IS ONE POST AT /api/ingestMint, and nothing else', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { ingest: 'stripe-events', token: TOKEN, rec: REC, path: pathOf('stripe-events') } }));
  const said = await mintDoor(callerAt(BASE, io), BASE, 'stripe-events');
  assert.deepEqual(sent, [{ path: '/api/ingestMint', method: 'POST', body: { ingest: 'stripe-events' } }]);
  assert.deepEqual(said, { kind: 'minted', token: TOKEN, url: `${BASE}${pathOf('stripe-events')}` });
});

test('A HOST TYPED WITH A TRAILING SLASH STILL BUILDS ONE ADDRESS, because `//in/webhook` is a path neither door parses', () => {
  assert.equal(doorUrl(`${BASE}/`, pathOf('x')), `${BASE}${pathOf('x')}`);
  assert.equal(doorUrl(`${BASE}//`, pathOf('x')), `${BASE}${pathOf('x')}`);
});

test('A MINT ANSWERED WITHOUT A USABLE PATH SHOWS THE TOKEN AND NO ADDRESS, because it is still the only copy', () => {
  /* WHAT `ingestMint` ANSWERED BEFORE THIS WAVE: `{ ingest, token }`, no path. And a path starting `//` is read as a
     different host by anything that follows it, so it is not offered as this record's address. */
  for (const value of [
    { ingest: 'x', token: TOKEN },
    { ingest: 'x', token: TOKEN, rec: REC, path: '' },
    { ingest: 'x', token: TOKEN, rec: REC, path: 'in/webhook/x' },
    { ingest: 'x', token: TOKEN, rec: REC, path: '//elsewhere.example/in/webhook' },
  ])
    assert.deepEqual(saidOf({ ok: true, value }, BASE), { kind: 'minted', token: TOKEN, url: null }, JSON.stringify(value));
});

test('A SUCCESS WITH NO TOKEN IN IT IS A REFUSAL WITH A SENTENCE, not an address ending in undefined', () => {
  const said = saidOf({ ok: true, value: { ingest: 'x', rec: REC, path: '/in/webhook/x/' } }, BASE);
  assert.deepEqual(said, { kind: 'refused', fix: copy.doorsNoToken });
  /* AN EMPTY TOKEN IS THE SAME ANSWER. The checker took the `=== ''` guard out of the old `saidOf` and every test still
     passed, so the screen could have offered an address ending in a bare slash and nothing would have said so. */
  assert.equal(saidOf({ ok: true, value: { ingest: 'x', token: '', rec: REC, path: pathOf('x') } }, BASE).kind, 'refused');
});

test('A HELD TOKEN ASKS BEFORE IT IS REPLACED, and a door with none mints on the first press', () => {
  const listed = doorsOf({ ok: true, value: TWO });
  assert.ok(listed.kind === 'doors');
  assert.deepEqual(listed.doors.map(asksFirst), [false, true]);
  /* `held` IS TRUE OR IT IS NOT. A host that answers `1` or `"yes"` has not said a token is held in the shape agreed,
     and a confirm on a door with nothing to lose is a press the person learns to click through. */
  const odd = doorsOf({ ok: true, value: [{ ...TWO[0], held: 'yes' }] });
  assert.ok(odd.kind === 'doors' && odd.doors[0]?.held === false);
});

test('A DOOR CHECKED SOME OTHER WAY HAS NO MINT, because `ingestMint` could only refuse it', () => {
  const listed = doorsOf({ ok: true, value: [{ id: 'signed', description: 'Signed events', verify: { kind: 'hmac' }, held: false, register: 'events' }, { id: 'flat', description: 'Flat', verify: 'path', held: false, register: null }] });
  assert.ok(listed.kind === 'doors');
  assert.deepEqual(listed.doors.map((d) => d.mintable), [false, true]);
  assert.equal(listed.doors[1]?.register, null);
});

test('A DOOR WITH NO DESCRIPTION IS NAMED BY ITS ID, and a row with no id is left out', () => {
  const listed = doorsOf({ ok: true, value: [{ id: 'bare', verify: { kind: 'path' } }, { description: 'Nameless' }, null, 'text'] });
  assert.deepEqual(listed, { kind: 'doors', doors: [{ id: 'bare', name: 'bare', register: null, mintable: true, held: false }] });
});

test('NONE DECLARED IS AN EMPTY LIST, which the screen draws as its empty state and not as a bank', () => {
  assert.deepEqual(doorsOf({ ok: true, value: [] }), { kind: 'doors', doors: [] });
});

test('A HOST WITHOUT THE READ SAYS SO IN ONE SENTENCE, rather than the client\'s "There is no method called doors."', async () => {
  const fix = 'There is no method called doors.';
  assert.deepEqual(doorsOf({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix } }), { kind: 'refused', fix: copy.doorsNoRead });
  assert.deepEqual(doorsOf({ ok: true, value: { doors: [] } }), { kind: 'refused', fix: copy.doorsNoRead });
});

test('A STALE OR MISSING SIGN-IN IS signin, with the record\'s sentence verbatim, on the list and on the press', async () => {
  const fix = 'Sign in again to make a webhook token.';
  assert.deepEqual(saidOf({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix } }, BASE), { kind: 'signin', fix });
  assert.deepEqual(doorsOf({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix } }), { kind: 'signin', fix });
});

test('A DOOR THE RECORD NO LONGER DECLARES IS THE RECORD\'S OWN SENTENCE, which says what is missing', () => {
  const fix = 'This record declares no ingest called stripe-events.';
  assert.deepEqual(saidOf({ ok: false, refusal: { code: 'DECLARATION_UNKNOWN', fix } }, BASE), { kind: 'refused', fix });
});

test('NO SIGN-IN IS signin AND NO HOST IS A REFUSAL, with no slug in the address as with one', async () => {
  /* BOTH WERE THE SAMPLE when the address named no record, and the screen drew the demo's sentence about having no
     account. There is no sample now (`DIRECTION.md` §26), so the answer no longer depends on the address. */
  const fix = 'Sign in to this record first.';
  assert.deepEqual(saidOf({ ok: false, refusal: { code: 'UNAUTHORIZED', fix } }, BASE), { kind: 'signin', fix });
  assert.deepEqual(doorsOf({ ok: false, refusal: { code: 'UNAUTHORIZED', fix } }), { kind: 'signin', fix });
  assert.deepEqual(doorsOf({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'Nothing answered.' } }), { kind: 'refused', fix: 'Nothing answered.' });
  /* Through the real client: a fetch that throws is its `UNREACHABLE`, and the sentence it writes is the one shown. */
  const thrown = await mintDoor(callerAt(BASE, host(null).io), BASE, 'stripe-events');
  assert.equal(thrown.kind, 'refused');
  assert.match(thrown.kind === 'refused' ? thrown.fix : '', /could not be reached/u);
});

test('THE SCREEN SAYS NOTHING ABOUT A DEMO, because there is none', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  assert.doesNotMatch(readFileSync(join(here, 'WebhookDoors.svelte'), 'utf8'), /notOnDemo|'sample'/u);
  assert.doesNotMatch(readFileSync(join(here, 'webhook-doors.ts'), 'utf8'), /'sample'|noRecord/u);
});

test('THE MODULE HOLDING THE ONLY COPY OF THE TOKEN NEITHER LOGS NOR KEEPS IT', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of ['webhook-doors.ts', 'WebhookDoors.svelte']) {
    const source = readFileSync(join(here, file), 'utf8');
    assert.doesNotMatch(source, /console\.|localStorage|sessionStorage|indexedDB/u, `${file} logs or stores`);
  }
});

test('NO USE CASE IS SPELLED IN THE SCREEN OR ITS WORDS (`DIRECTION.md` §22)', () => {
  /* THE OLD SCREEN WAS A BANK'S. Its id, its recipe and its title named one sender on one phone, so a record with any
     other door read a section about texts from a bank. The words for this section are every `doors*` key. */
  const here = dirname(fileURLToPath(import.meta.url));
  const words = Object.entries(copy)
    .filter(([key]) => key.startsWith('doors'))
    .map(([, v]) => (typeof v === 'function' ? (v as (s: string) => string)('a list') : String(v)))
    .join('\n');
  assert.ok(words.length > 0, 'no doors* words in copy');
  const sources: [string, string][] = [
    ['copy doors*', words],
    ['webhook-doors.ts', readFileSync(join(here, 'webhook-doors.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')],
    ['WebhookDoors.svelte', readFileSync(join(here, 'WebhookDoors.svelte'), 'utf8').replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//gu, '')],
  ];
  for (const [name, source] of sources)
    assert.doesNotMatch(source, /bank|iphone|shortcut|bank-from-out-sms|\bsms\b/iu, `${name} names a use case`);
  assert.equal(Object.keys(copy).some((k) => k.startsWith('shortcut')), false, 'a shortcut* key is left in copy');
});
