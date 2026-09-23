/**
 * A phone asking to be told: the record's half of `push_sub` (migration 14), `subscribePush` and `unsubscribePush`.
 *
 * EACH PERSON'S OWN. A subscription is kept against the person who sent it and taken away only by them, so naming
 * somebody else's endpoint removes nothing: `removed: false`, the same answer as an endpoint nobody holds, which tells
 * a caller nothing about whether anybody does. Who a push goes to is the kernel's question (`packages/kernel/src/push.ts`).
 *
 * WHAT A BROWSER HANDS OVER IS TAKEN AS IT HANDS IT OVER. `PushSubscription.toJSON()` is `{ endpoint, expirationTime,
 * keys: { p256dh, auth } }`, so the app sends that object and nothing is reshaped on the way. `expirationTime` is taken
 * and not kept: every push service in use sends `null`, and a subscription that does lapse answers 404 or 410, which
 * deletes the row anyway.
 *
 * AN ENDPOINT IS CHECKED FOR SHAPE HERE AND FOR REACH WHERE IT IS POSTED TO. `https:` and no credentials is what the
 * record can say about an address; whether it is a public host is the deliverer's check, made on the request itself
 * (`postable` in `apps/worker/src/deliver.ts`), because a name that resolves somewhere private is invisible from here.
 *
 * PURE OVER THE `Sql` PORT, AND THE CALLER HOLDS THE TRANSACTION, because a save is two statements: the row, and the
 * trim that keeps one person's list short.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

/**
 * The most subscriptions one person keeps. The newest are kept and the oldest dropped, because a browser that loses its
 * subscription makes a new endpoint without telling anybody, and the old one is only ever found dead by a push. A person
 * who never receives one (anybody who is not an owner, today) would otherwise grow the table on every reinstall.
 */
export const PUSH_SUBS_MOST = 10;

/** Longer than any push service's endpoint (FCM, Mozilla, Apple and WNS are all under 500 characters). */
const ENDPOINT_MOST = 2048;

/** What `subscribePush` takes, and what `PushSubscription.toJSON()` gives. */
const TAKES = ['endpoint', 'expirationTime', 'keys'] as const;

export type PushSub = { endpoint: string; p256dh: string; auth: string };

/** base64url with no padding or with its own, as browsers write it, decoded; `null` for anything else. */
function bytesOf(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(text)) return null;
  const plain = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  try {
    const raw = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** An endpoint as the record keeps it, or `null`. */
function endpointOf(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > ENDPOINT_MOST) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  /* A PASSWORD IN AN ADDRESS IS A PASSWORD IN THE DATABASE, and no push service mints one. */
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hostname === '') return null;
  return value;
}

/**
 * The subscription a browser sent, or the refusal that names what is wrong with it.
 *
 * THE KEYS ARE CHECKED BY LENGTH, since that is what a mistake changes. `p256dh` is an uncompressed P-256 point, 65
 * bytes led by `0x04`; `auth` is 16 bytes (RFC 8291 §3). A key pasted into the wrong field, or one clipped in transit,
 * is refused now rather than failing to encrypt on the day a push first carries a body.
 */
export function readPushSub(args: unknown): Result<PushSub> {
  if (args === null || typeof args !== 'object' || Array.isArray(args))
    return no('REQUIRED_MISSING', 'Send the subscription the browser gave: { endpoint, keys: { p256dh, auth } }.', { at: 'endpoint' });
  const given = args as Record<string, unknown>;
  const stray = Object.keys(given).find((k) => !(TAKES as readonly string[]).includes(k));
  if (stray !== undefined)
    return no('FIELD_UNKNOWN', `${stray} is not something this call takes. It takes ${TAKES.join(', ')}.`, { at: stray, allowed: [...TAKES] });
  if (given.endpoint === undefined) return no('REQUIRED_MISSING', "endpoint is the push service's address the browser gave.", { at: 'endpoint' });
  const endpoint = endpointOf(given.endpoint);
  if (endpoint === null)
    return no('VALUE_MALFORMED', `endpoint is an https address of at most ${ENDPOINT_MOST} characters, with no user or password in it.`, { at: 'endpoint' });
  const keys = given.keys;
  if (keys === undefined || keys === null) return no('REQUIRED_MISSING', 'keys is { p256dh, auth }, as the browser gave them.', { at: 'keys' });
  if (typeof keys !== 'object' || Array.isArray(keys)) return no('VALUE_MALFORMED', 'keys is { p256dh, auth }, as the browser gave them.', { at: 'keys' });
  const { p256dh, auth, ...more } = keys as Record<string, unknown>;
  const extra = Object.keys(more)[0];
  if (extra !== undefined) return no('FIELD_UNKNOWN', `keys.${extra} is not a key a subscription has. It has p256dh and auth.`, { at: `keys.${extra}`, allowed: ['p256dh', 'auth'] });
  const point = typeof p256dh === 'string' ? bytesOf(p256dh) : null;
  if (point === null || point.length !== 65 || point[0] !== 4)
    return no('VALUE_MALFORMED', "keys.p256dh is the browser's public key: 65 bytes, base64url.", { at: 'keys.p256dh' });
  const secret = typeof auth === 'string' ? bytesOf(auth) : null;
  if (secret === null || secret.length !== 16)
    return no('VALUE_MALFORMED', 'keys.auth is the 16-byte secret the browser gave, base64url.', { at: 'keys.auth' });
  return ok({ endpoint, p256dh: p256dh as string, auth: auth as string });
}

/**
 * Keep one, for one person. The same endpoint again is the same row with the keys it sent this time, and its time
 * moved to now, so the trim below counts it as the newest: it is the browser saying it is still there.
 */
export function savePushSub(sql: Sql, mint: () => string, person: string, sub: PushSub, at: string): { endpoint: string; at: string } {
  sql.exec(
    `INSERT INTO push_sub (id, person_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (person_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`,
    mint(),
    person,
    sub.endpoint,
    sub.p256dh,
    sub.auth,
    at,
  );
  sql.exec(
    `DELETE FROM push_sub WHERE person_id = ? AND id NOT IN
       (SELECT id FROM push_sub WHERE person_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)`,
    person,
    person,
    PUSH_SUBS_MOST,
  );
  return { endpoint: sub.endpoint, at };
}

/** Take one away, if this person holds it. */
export function dropPushSub(sql: Sql, person: string, endpoint: string): boolean {
  const held = sql.one<{ n: number }>('SELECT count(*) AS n FROM push_sub WHERE person_id = ? AND endpoint = ?', person, endpoint)?.n ?? 0;
  if (Number(held) > 0) sql.exec('DELETE FROM push_sub WHERE person_id = ? AND endpoint = ?', person, endpoint);
  return Number(held) > 0;
}
