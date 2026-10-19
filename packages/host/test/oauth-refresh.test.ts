/**
 * The refresh grant: a code gets a bearer and a refresh token, a refresh gets the bearer back with a new refresh token,
 * the one just replaced still works for a short grace, and a replay after the grace ends the whole family.
 * Invented names only; the store is the record's own `answerOAuth` over a tiny in-memory SQL.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { OAuthAnswers, OAuthCall, RefreshRow } from '@braindog/record/oauth';

import { challengeOf, serveOAuthDoor, sealBearer, type OAuthDeps, type OAuthStore } from '../src/oauth.ts';

const ISSUER = 'https://brain.example';
const VERIFIER = 'v'.repeat(50);
const BEARER = 'bd_invented_bearer';
const DAY = 86_400_000;

/** Only the refresh and code ops, kept in maps, with the same compare-and-set and grace rules the SQL has. */
function store(clock: { now: number }): OAuthStore {
  const codes = new Map<string, { request: { client_id: string; redirect_uri: string; challenge: string; scope: string }; record: string; bearer_sealed: string; expires: number; code_hash: string }>();
  const families = new Map<string, RefreshRow>();
  const answer = (call: OAuthCall): OAuthAnswers[OAuthCall['op']] => {
    switch (call.op) {
      case 'code':
        codes.set(call.row.code_hash, call.row);
        return 'ok';
      case 'redeem': {
        const row = codes.get(call.code_hash) ?? null;
        codes.delete(call.code_hash);
        return row;
      }
      case 'family':
        families.set(call.row.id, call.row);
        return 'ok';
      case 'refresh_get': {
        for (const row of families.values()) {
          if (row.expires <= clock.now || row.ends <= clock.now) continue;
          if (row.cur_hash === call.hash) return { ...row, which: 'current' as const };
          if (row.prev_hash === call.hash) {
            if (row.prev_until > clock.now) return { ...row, which: 'previous' as const };
            families.delete(row.id);
            return null;
          }
        }
        return null;
      }
      case 'refresh_rotate': {
        const row = families.get(call.id);
        if (row === undefined || row.cur_hash !== call.expect_cur) return false;
        families.set(call.id, { ...row, ...call.next, expires: Math.min(call.next.expires, row.ends) });
        return true;
      }
      case 'refresh_drop':
        families.delete(call.id);
        return 'ok';
      default:
        return null;
    }
  };
  return (async (call: OAuthCall) => answer(call)) as OAuthStore;
}

async function signedIn(clock: { now: number }, extra: Partial<OAuthDeps> = {}) {
  const s = store(clock);
  const deps: OAuthDeps = { issuer: ISSUER, store: s, now: () => clock.now, address: null, consent: () => '/', approver: async () => ({ ok: false, status: 401, say: 'no' }), ...extra };
  const token = (fields: Record<string, string>) =>
    serveOAuthDoor(new Request(`${ISSUER}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }), deps).then((r) => r as Response);
  const code = 'c'.repeat(43);
  const digest = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await s({
    op: 'code',
    row: { code_hash: await digest(code), request: { client_id: 'bdc_invented', redirect_uri: 'https://app.example/cb', challenge: await challengeOf(VERIFIER), scope: 'read' }, record: 'rec_invented', bearer_sealed: await sealBearer(BEARER, code), expires: clock.now + 60_000 },
  });
  const first = await token({ grant_type: 'authorization_code', code, code_verifier: VERIFIER, client_id: 'bdc_invented' });
  assert.equal(first.status, 200);
  return { token, first: (await first.json()) as { access_token: string; refresh_token: string; expires_in: number } };
}

test('a code answers a bearer and a refresh token, and a refresh answers the same bearer and a new refresh token', async () => {
  const clock = { now: 1_800_000_000_000 };
  const { token, first } = await signedIn(clock);
  assert.equal(first.access_token, BEARER);
  assert.ok(first.refresh_token);
  clock.now += 30 * DAY;
  const again = await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: 'bdc_invented' });
  assert.equal(again.status, 200);
  const body = (await again.json()) as { access_token: string; refresh_token: string };
  assert.equal(body.access_token, BEARER);
  assert.notEqual(body.refresh_token, first.refresh_token);
});

test('a client that retries with the token just replaced is not logged out, and gets a token that works', async () => {
  const clock = { now: 1_800_000_000_000 };
  const { token, first } = await signedIn(clock);
  await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  clock.now += 30_000;
  const retry = await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(retry.status, 200);
  const { refresh_token } = (await retry.json()) as { refresh_token: string };
  assert.equal((await token({ grant_type: 'refresh_token', refresh_token })).status, 200);
});

test('the token just replaced is refused after its grace, and so is an app a refresh was never given to', async () => {
  const clock = { now: 1_800_000_000_000 };
  const { token, first } = await signedIn(clock);
  await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  clock.now += 10 * 60_000;
  assert.equal((await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token })).status, 400);
  assert.equal((await token({ grant_type: 'refresh_token', refresh_token: 'x'.repeat(43) })).status, 400);
});

test('ninety days unused ends the family, and a removed app ends it at once', async () => {
  const clock = { now: 1_800_000_000_000 };
  const unused = await signedIn(clock);
  clock.now += 91 * DAY;
  assert.equal((await unused.token({ grant_type: 'refresh_token', refresh_token: unused.first.refresh_token })).status, 400);

  const removed = await signedIn(clock, { alive: async () => false });
  assert.equal((await removed.token({ grant_type: 'refresh_token', refresh_token: removed.first.refresh_token })).status, 400);
});
