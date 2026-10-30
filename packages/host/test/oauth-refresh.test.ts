/**
 * The refresh grant with one-hour keys (sharing plan 2.9): Allow's token is the parent, sealed and never sent; a code
 * gets a one-hour child of it and a refresh token; a refresh gets a new child and a new refresh token, the one just
 * replaced still working for a short grace, and a replay after the grace ends the whole family. Removing the app
 * revokes the parent, which ends its children at their next call and the family at its next refresh.
 *
 * The children are the record's own (`createRecordApi`'s host-only `mintChild`) on one clock with the door. The OAuth
 * store is a map with the same compare-and-set and grace rules the SQL has. Invented names only.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRecordApi } from '@braindog/record';
import type { OAuthAnswers, OAuthCall, RefreshRow } from '@braindog/record/oauth';

import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { challengeOf, serveOAuthDoor, sealBearer, type OAuthDeps, type OAuthStore } from '../src/oauth.ts';

const ISSUER = 'https://brain.example';
const VERIFIER = 'v'.repeat(50);
const OWNER = 'p_owner';
const RECORD = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const START = Date.UTC(2026, 9, 20, 12);
const DAY = 86_400_000;

/** Only the refresh and code ops, kept in maps, with the same compare-and-set and grace rules the SQL has. */
function store(clock: { now: () => number }): OAuthStore {
  const codes = new Map<string, { request: { client_id: string; redirect_uri: string; challenge: string; scope: string }; record: string; bearer_sealed: string; expires: number; code_hash: string }>();
  const families = new Map<string, RefreshRow>();
  /* The tokens a family left behind, newest last, as `oauth_refresh_old` keeps them. */
  const left = new Map<string, string[]>();
  const drop = (id: string) => {
    families.delete(id);
    left.delete(id);
  };
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
          if (row.expires <= clock.now() || row.ends <= clock.now()) continue;
          if (row.cur_hash === call.hash) return { ...row, which: 'current' as const };
          if (row.prev_hash === call.hash) {
            if (row.prev_until > clock.now()) return { ...row, which: 'previous' as const };
            drop(row.id);
            return null;
          }
        }
        for (const [id, hashes] of left) if (hashes.includes(call.hash)) drop(id);
        return null;
      }
      case 'refresh_rotate': {
        const row = families.get(call.id);
        if (row === undefined || row.cur_hash !== call.expect_cur) return false;
        families.set(call.id, { ...row, ...call.next, expires: Math.min(call.next.expires, row.ends) });
        const pushed = [row.prev_hash, row.cur_hash].filter((h): h is string => h !== null && h !== call.next.cur_hash && h !== call.next.prev_hash);
        left.set(call.id, [...(left.get(call.id) ?? []), ...pushed].slice(-8));
        return true;
      }
      case 'refresh_retry': {
        const row = families.get(call.id);
        return row !== undefined && row.prev_hash === call.hash && row.prev_until > clock.now() && (call.expect_cur === undefined || row.cur_hash === call.expect_cur);
      }
      case 'refresh_drop':
        drop(call.id);
        return 'ok';
      default:
        return null;
    }
  };
  return (async (call: OAuthCall) => answer(call)) as OAuthStore;
}

type Answer = { access_token: string; refresh_token?: string; expires_in: number; error?: string };

/** A record with its owner, the token Allow would have minted, its code held, and the door wired to the record's children. */
async function signedIn() {
  const clock = fixedClock(START);
  const api = await createRecordApi({ sql: openSqlite(), clock });
  const made = api.kernel.createRecord({ id: RECORD, slug: 'orchardline', name: 'Orchardline', tz: 'UTC', locale: 'en', owner: { id: OWNER } });
  assert.ok(made.ok);
  const minted = await api.kernel.createToken(OWNER, { scope: 'read', label: 'Invented app', days: 365 });
  assert.ok(minted.ok);
  const parent = minted.value;

  const s = store(clock);
  const deps: OAuthDeps = {
    issuer: ISSUER,
    store: s,
    now: () => clock.now(),
    address: null,
    consent: () => '/',
    approver: async () => ({ ok: false, status: 401, say: 'no' }),
    /* As both hosts wire it: the record's host-only `mintChild`, and `null` when the parent no longer works. */
    child: async (bearer, minutes) => {
      const out = await api.mintChild(bearer, { minutes });
      if (out.ok) return { bearer: out.value.bearer, expires_at: out.value.expires_at };
      if ('refusal' in out && out.refusal.at === 'parent') return null;
      throw new Error('the record could not mint');
    },
  };
  const token = async (fields: Record<string, string>): Promise<{ status: number; body: Answer }> => {
    const res = (await serveOAuthDoor(
      new Request(`${ISSUER}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }),
      deps,
    )) as Response;
    return { status: res.status, body: (await res.json()) as Answer };
  };
  const code = 'c'.repeat(43);
  const digest = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await s({
    op: 'code',
    row: { code_hash: await digest(code), request: { client_id: 'bdc_invented', redirect_uri: 'https://app.example/cb', challenge: await challengeOf(VERIFIER), scope: 'read' }, record: RECORD, bearer_sealed: await sealBearer(parent.bearer, code), expires: clock.now() + 60_000 },
  });
  const redeem = () => token({ grant_type: 'authorization_code', code, code_verifier: VERIFIER, client_id: 'bdc_invented' });
  const works = async (bearer: string) => (await api.kernel.verifyToken(bearer, 'mcp')).ok;
  const remove = () => api.kernel.revokeToken(OWNER, parent.id);
  return { clock, api, parent, token, redeem, works, remove };
}

async function firstAnswer(t: Awaited<ReturnType<typeof signedIn>>): Promise<Answer & { refresh_token: string }> {
  const first = await t.redeem();
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.refresh_token);
  return first.body as Answer & { refresh_token: string };
}

test('A CODE ANSWERS A ONE-HOUR CHILD, never the parent, and a refresh token', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  assert.equal(first.expires_in, 3600);
  assert.notEqual(first.access_token, t.parent.bearer, 'the app was handed the parent');
  assert.ok(await t.works(first.access_token));
  const seen = await t.api.kernel.verifyToken(first.access_token, 'mcp');
  assert.ok(seen.ok);
  assert.equal(seen.value.id, t.parent.id, 'the app is not one agent across its hourly keys');
  assert.equal(seen.value.scope, 'read');

  t.clock.advance(3600_000);
  assert.equal(await t.works(first.access_token), false, 'a child outlived its hour');
  assert.ok(await t.works(t.parent.bearer), 'the parent ended with its child');
});

test('A REFRESH ANSWERS A NEW CHILD and a new refresh token, and the app lists as one key', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  t.clock.advance(30 * DAY);
  const again = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: 'bdc_invented' });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.expires_in, 3600);
  assert.notEqual(again.body.access_token, first.access_token);
  assert.notEqual(again.body.access_token, t.parent.bearer);
  assert.notEqual(again.body.refresh_token, first.refresh_token);
  assert.ok(await t.works(again.body.access_token));
  assert.equal(await t.works(first.access_token), false);

  const listed = t.api.kernel.listTokens();
  assert.equal(listed.length, 1, 'a child was listed as a key of its own');
  assert.equal(listed[0]!.children?.length, 2);
});

test('a client that retries with the token just replaced is not logged out, and gets a token that works', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  t.clock.advance(30_000);
  const retry = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(retry.status, 200);
  assert.ok(await t.works(retry.body.access_token));
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: retry.body.refresh_token! })).status, 200);
});

test('the token just replaced is refused after its grace, and so is an app a refresh was never given to', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  t.clock.advance(10 * 60_000);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token })).status, 400);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: 'x'.repeat(43) })).status, 400);
});

test('ninety days unused ends the family', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  t.clock.advance(91 * DAY);
  const late = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(late.status, 400);
  assert.equal(late.body.error, 'invalid_grant');
});

test('A REMOVED APP: its child is refused at its next call, and its refresh answers invalid_grant, for good', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  assert.ok(await t.works(first.access_token));
  t.remove();
  assert.equal(await t.works(first.access_token), false, "a removed app's key still worked");

  const refused = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error, 'invalid_grant');
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token })).status, 400, 'the family outlived the app');
});

test('an app removed between Allow and the code gets invalid_grant, and no key', async () => {
  const t = await signedIn();
  t.remove();
  const late = await t.redeem();
  assert.equal(late.status, 400);
  assert.equal(late.body.error, 'invalid_grant');
  assert.equal(late.body.access_token, undefined);
});

/* THE TOKEN JUST REPLACED, PRESENTED AGAIN INSIDE ITS GRACE, MOVES NOTHING. It rotated the family for whoever presented
   it, so a copy replayed within the two minutes took the family over: the app's own new token was then refused and the
   replayer held the only working one. Now the retry is handed the token the first answer gave, and the app keeps it. */
test('A REPLAY OF THE TOKEN JUST REPLACED does not take the family over, and the app keeps refreshing', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  const app = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(app.status, 200);
  t.clock.advance(30_000);
  const replay = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.refresh_token, app.body.refresh_token, 'the replay was handed a token of its own');
  /* The app's token is still the family's, and moves it on. */
  const next = await t.token({ grant_type: 'refresh_token', refresh_token: app.body.refresh_token! });
  assert.equal(next.status, 200, JSON.stringify(next.body));
  assert.ok(await t.works(next.body.access_token));
  /* And the old token, presented once more after the family moved on, is a copy in two hands: refused, and the family
     ends with it (RD4). */
  t.clock.advance(10_000);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token })).status, 400);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: next.body.refresh_token! })).status, 400, 'the family outlived a replay');
});

/* RD4: A REPLAY INSIDE THE GRACE HANDS OVER THE CURRENT TOKEN, so the thief refreshed twice to push the app's copy out of
   the one remembered slot, and the app's next refresh was a plain refusal that left the thief the family. */
test('RD4: A THIEF WHO ROLLS PAST THE REPLACED TOKEN LOSES THE FAMILY when the app comes back with its copy', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  const app = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(app.status, 200);
  t.clock.advance(20_000);
  const stolen = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(stolen.status, 200);
  const r3 = await t.token({ grant_type: 'refresh_token', refresh_token: stolen.body.refresh_token! });
  const r4 = await t.token({ grant_type: 'refresh_token', refresh_token: r3.body.refresh_token! });
  assert.equal(r4.status, 200);
  t.clock.advance(10 * 60_000);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: app.body.refresh_token! })).status, 400);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: r4.body.refresh_token! })).status, 400, 'the thief kept the family');
});

/* RE3: SEVERAL CALLS HITTING EXPIRY TOGETHER present one token: the first rotates and the rest are retries. Answered once,
   the third ended the family and the app was signed out. */
test('RE3: EVERY RETRY INSIDE THE GRACE IS ANSWERED WHILE THE FAMILY HAS NOT MOVED; once it moves, the replaced token ends it', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  const app = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
  assert.equal(app.status, 200);
  for (let i = 0; i < 3; i++) {
    t.clock.advance(5_000);
    const retry = await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token });
    assert.equal(retry.status, 200, `retry ${i + 2} signed the app out`);
    assert.equal(retry.body.refresh_token, app.body.refresh_token);
  }
  const next = await t.token({ grant_type: 'refresh_token', refresh_token: app.body.refresh_token! });
  assert.equal(next.status, 200);
  t.clock.advance(5_000);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token })).status, 400);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: next.body.refresh_token! })).status, 400, 'the family outlived a replay after it moved');
});

test('RE3: THREE REFRESHES OF ONE TOKEN AT ONCE all answer, and the family carries on', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  const all = await Promise.all([0, 1, 2].map(() => t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token })));
  for (const a of all) assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(new Set(all.map((a) => a.body.refresh_token)).size, 1);
  t.clock.advance(3600_000);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: all[2]!.body.refresh_token! })).status, 200);
});

/* TWO TABS OF ONE APP REFRESHING AT THE SAME MOMENT both hold the same token; neither is signed out, and both carry on
   with the one token the family has. */
test('TWO REFRESHES OF ONE TOKEN AT ONCE both answer, with the same new token, and the family carries on', async () => {
  const t = await signedIn();
  const first = await firstAnswer(t);
  const [a, b] = await Promise.all([
    t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token }),
    t.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token }),
  ]);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(a.body.refresh_token, b.body.refresh_token);
  assert.ok(await t.works(a.body.access_token));
  assert.ok(await t.works(b.body.access_token));
  t.clock.advance(3600_000);
  assert.equal((await t.token({ grant_type: 'refresh_token', refresh_token: b.body.refresh_token! })).status, 200);
});
