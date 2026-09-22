/**
 * The Shortcut door's screen: what a press sends, what each answer becomes, and the address built from the token.
 *
 * THE DOOR HAD NO SCREEN. `ingestMint` was routed as an ADMIN write on 22 September (`e20ed683`) and grepped the same
 * day, nothing in `apps/web` called it: the self-host and the Cloud would both take an SMS at
 * `/in/webhook/<rec>/bank-from-out-sms/<token>`, and the only way to get the token was a test or a hand-written POST.
 *
 * THE ANSWERS ARE THE RECORD'S OWN. Every refusal below is one `ingestMint` in `packages/record/src/index.ts` writes,
 * with its code and its sentence, so a mapping that drifts from the record fails here rather than on a phone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Fetch } from '../record/boot-live.ts';
import { SHORTCUT_INGEST, mintShortcut, saidOf, shortcutUrl } from './shortcut-door.ts';

const BASE = 'https://app.brain.dog';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
/** The shape `webhookSecret()` mints, base64url. Invented. */
const TOKEN = 'Hq3v9XzR0bWm1sLkT7eYpA2cNuJd5fGi8oQ4tVxK6aE';

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

test('THE ADDRESS IS THE CLOUD\'S FIVE-SEGMENT SHAPE, which is the one both hosts read a token from', () => {
  assert.equal(shortcutUrl(BASE, REC, TOKEN), `${BASE}/in/webhook/${REC}/bank-from-out-sms/${TOKEN}`);
  /* A HOST TYPED BY HAND CARRIES A TRAILING SLASH, and `//in/webhook` is a path neither door parses. */
  assert.equal(shortcutUrl(`${BASE}/`, REC, TOKEN), `${BASE}/in/webhook/${REC}/bank-from-out-sms/${TOKEN}`);
  assert.equal(SHORTCUT_INGEST, 'bank-from-out-sms');
});

test('ONE PRESS IS ONE POST AT /api/ingestMint NAMING THE SMS INGEST, and nothing else', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { ingest: 'bank-from-out-sms', token: TOKEN, rec: REC } }));
  const said = await mintShortcut(BASE, io);
  assert.deepEqual(sent, [{ path: '/api/ingestMint', method: 'POST', body: { ingest: 'bank-from-out-sms' } }]);
  assert.deepEqual(said, { kind: 'minted', token: TOKEN, url: `${BASE}/in/webhook/${REC}/bank-from-out-sms/${TOKEN}` });
});

test('A MINT ANSWERED WITHOUT THE RECORD\'S ID SHOWS THE TOKEN AND NO ADDRESS, because a guessed id is a 404', () => {
  /* WHAT `ingestMint` ANSWERS TODAY, measured at `e20ed683`: `{ ingest, token }` and no `rec`, and neither `boot` nor
     `whoami` sends the record's id either. An address built with anything else in that segment is refused by both
     doors, so the screen shows the token alone rather than a URL that would never match. */
  assert.deepEqual(saidOf({ ok: true, value: { ingest: 'bank-from-out-sms', token: TOKEN } }, BASE), { kind: 'minted', token: TOKEN, url: null });
  assert.deepEqual(saidOf({ ok: true, value: { ingest: 'bank-from-out-sms', token: TOKEN, rec: '' } }, BASE), { kind: 'minted', token: TOKEN, url: null });
});

test('A SUCCESS WITH NO TOKEN IN IT IS A REFUSAL WITH A SENTENCE, not an address ending in undefined', () => {
  const said = saidOf({ ok: true, value: { ingest: 'bank-from-out-sms' } }, BASE);
  assert.equal(said.kind, 'refused');
  assert.ok(said.kind === 'refused' && !said.fix.includes('undefined'));
  /* AN EMPTY TOKEN IS THE SAME ANSWER. The checker took the `=== ''` guard out of `saidOf` and all eight tests still
     passed, so the screen could have offered an address ending in `/bank-from-out-sms/` and nothing would have said so. */
  assert.equal(saidOf({ ok: true, value: { ingest: 'bank-from-out-sms', token: '', rec: REC } }, BASE).kind, 'refused');
});

test('A STALE OR MISSING SIGN-IN IS signin, with the record\'s sentence verbatim', () => {
  const fix = 'Sign in again to make a webhook token.';
  assert.deepEqual(saidOf({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix } }, BASE), { kind: 'signin', fix });
});

test('AN INGEST THIS RECORD DOES NOT DECLARE IS THE RECORD\'S OWN SENTENCE, which says what is missing', () => {
  const fix = 'This record declares no ingest called bank-from-out-sms.';
  assert.deepEqual(saidOf({ ok: false, refusal: { code: 'DECLARATION_UNKNOWN', fix } }, BASE), { kind: 'refused', fix });
});

test('NO RECORD BEHIND THE PAGE IS THE SAMPLE, the demo\'s one sentence and not a failure', async () => {
  assert.deepEqual(await mintShortcut(BASE, host(null).io), { kind: 'sample' });
  assert.deepEqual(saidOf({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in.' } }, BASE), { kind: 'sample' });
});

test('THE MODULE HOLDING THE ONLY COPY OF THE TOKEN NEITHER LOGS NOR KEEPS IT', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of ['shortcut-door.ts', 'ShortcutDoor.svelte']) {
    const source = readFileSync(join(here, file), 'utf8');
    assert.doesNotMatch(source, /console\.|localStorage|sessionStorage|indexedDB/u, `${file} logs or stores`);
  }
});
