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

import { inQuietHours, ownersPushSubs, quietOf, type Instr, type Profile, type QuietWindow } from '@braindog/kernel';
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

/**
 * AN APPLE DEVICE TOKEN IS AN ENDPOINT TOO (apps plan M4, 3 Nov): the iPhone app registers the token Apple gave it as
 * `apns://<production|sandbox>/<bundle id>/<hex token>` over its app session, through this same call, so it lands in
 * `push_sub` beside the browsers and every rule that picks who a push rings (owners, the person named, `push.off`, quiet
 * hours, one an hour) holds for the phone as it does for a browser, with no table of its own. It carries no keys: Apple
 * is reached with the deployment's own key (`apps/worker/src/apns.ts`), and nothing is encrypted to the phone. The
 * deliverer tells the two apart by the scheme.
 */
export const APNS_ENDPOINT = /^apns:\/\/(production|sandbox)\/[A-Za-z0-9.-]{1,155}\/[0-9a-f]{64,200}$/u;

/** An endpoint as the record keeps it, or `null`. */
function endpointOf(value: unknown): string | null {
  if (typeof value === 'string' && APNS_ENDPOINT.test(value)) return value;
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
    return no('VALUE_MALFORMED', `endpoint is an https address of at most ${ENDPOINT_MOST} characters, with no user or password in it, or an app's apns:// device token.`, { at: 'endpoint' });
  const keys = given.keys;
  /* A PHONE'S TOKEN HAS NO KEYS, and one sent with keys is a browser's subscription pasted into the wrong shape. */
  if (APNS_ENDPOINT.test(endpoint)) {
    if (keys !== undefined && keys !== null) return no('FIELD_UNKNOWN', 'An apns:// endpoint is an Apple device token and takes no keys.', { at: 'keys' });
    return ok({ endpoint, p256dh: '', auth: '' });
  }
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

/** The states of an instruction that ring a phone: it finished, or it needs him. */
export const FINISH_STATES = ['done', 'needs_you'] as const;

export type FinishPush = 'sent' | 'off' | 'not_pushed' | 'not_this_state' | 'short' | 'quiet' | 'told' | 'no_phone';

/** What `tellFinished` reads, so the rule is testable without a worker. */
export type FinishDeps = {
  sql: Sql;
  /** The kernel's queue (`kernel.outbox`): one `notify.push` row per phone. */
  outbox: (kind: 'notify.push', payload: unknown) => void;
  nowMs: number;
  /** The record's zone. */
  tz: string;
};

/** The window the push is held by: the agent's own quiet hours when its row has them, else the record's. */
function windowOf(sql: Sql, profile: Profile): { window: QuietWindow; tz: string | null } {
  if (profile.quiet !== null) return { window: { from: profile.quiet.from, to: profile.quiet.to }, tz: profile.quiet.zone ?? null };
  return { window: quietOf(sql.one<{ quiet: string | null }>('SELECT quiet FROM record WHERE singleton = 1')?.quiet), tz: null };
}

/** The handle an instruction's push is told once under. It names the row and the state, never a word anybody said. */
export const finishCause = (i: Pick<Instr, 'row' | 'state'>): string => `instruction.${i.row}.${i.state}`;

/**
 * An instruction reached Done or Needs you: ring his phones once, if the agent's settings row says so.
 *
 *   - ON FINISH. `off` rings nothing. `told` rings for any instruction he gave. `long` rings for Done only after the
 *     run held it `notify.minutes` or more, and always for Needs you, which waits on him however short it was.
 *   - `by` IS THE CHANNEL. Only `push` rings; `needs_you` leaves it to the Needs you list in the app.
 *   - QUIET HOURS HOLD IT, the row's own or else the record's, as every notice is held. Nothing is queued to go later.
 *   - ONCE PER INSTRUCTION STATE. The cause rides the queued row, a handle as `asked.<cause>` is, and a row already
 *     carrying it, sent or not, answers `told`.
 *   - CONTENT-FREE. The payload is `{ sub: { id }, cause, open }` and nothing else, `open` being a path in the record:
 *     no instruction text, reply, project or name reaches the outbox, which travels in every backup. The Worker
 *     encrypts only that path to the phone, so a tap opens Decide or Agents.
 *   - A RECORD NOBODY SUBSCRIBED A PHONE ON queues nothing.
 *
 * It never fails the reply: the caller keeps the instruction's answer whatever this says.
 */
export function tellFinished(deps: FinishDeps, i: Pick<Instr, 'row' | 'state' | 'taken_at'>, profile: Profile): FinishPush {
  if (!(FINISH_STATES as readonly string[]).includes(i.state)) return 'not_this_state';
  if (profile.notify.on === 'off') return 'off';
  if (profile.notify.by !== 'push') return 'not_pushed';
  if (profile.notify.on === 'long' && i.state === 'done') {
    const took = i.taken_at === null ? 0 : deps.nowMs - Date.parse(i.taken_at);
    if (!(took >= (profile.notify.minutes ?? 0) * 60_000)) return 'short';
  }
  const { window, tz } = windowOf(deps.sql, profile);
  if (inQuietHours(deps.nowMs, tz ?? deps.tz, window)) return 'quiet';
  /* AN AGENT'S PUSH IS `agents`, so an owner who turned that kind off on their phones is not rung (`push.off`). */
  const subs = ownersPushSubs(deps.sql, 'agents');
  if (subs.length === 0) return 'no_phone';
  const cause = finishCause(i);
  const told = deps.sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'notify.push' AND json_extract(payload, '$.cause') = ?", cause)?.n ?? 0;
  if (Number(told) > 0) return 'told';
  /* AND WHERE IT OPENS: Needs you is answered in Decide, and Done is read on Agents. A path, never a word. */
  const open = i.state === 'needs_you' ? '/decide' : '/p/agents';
  for (const id of subs) deps.outbox('notify.push', { sub: { id }, cause, open, kind: 'agents' });
  return 'sent';
}
