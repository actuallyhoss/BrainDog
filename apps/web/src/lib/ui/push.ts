/**
 * The phone half of Web Push, without a browser: the host's public key as the bytes `pushManager.subscribe` takes,
 * whether a toggle is drawn at all, and what turning it on or off sends and says.
 *
 * A HOST WITH NO KEY DRAWS NOTHING, NOT A DISABLED SWITCH. The Worker adds `notify.push` to `DELIVERS` only when both VAPID
 * keys are set, and until the owner sets them nothing would ever be delivered. A toggle that turns on and
 * then never rings is a control that writes nothing, which is what `09`'s notifications screen was rewritten to stop.
 *
 * NOTHING HERE THROWS AT THE SCREEN. Blocked notifications are the most common thing a person meets on this row, and the
 * browser reports them two ways: `requestPermission` answering `denied`, and `subscribe` throwing `NotAllowedError` with
 * the permission reading `granted` (Brave with push messaging off, or a site setting changed between the two calls).
 * Both come back as the same sentence, and every other failure as a sentence of its own.
 *
 * PURE, SO `node --test` CAN IMPORT IT. The browser is reached only through `Ports` and the `fetch` handed to `hostKey`,
 * which the component fills in. The words are `copy.ts`'s `push*` keys, which is where `dead-copy` can see whether a
 * route renders them; they lived here while `copy.ts` belonged to other work.
 */

import { copy } from '../copy.ts';
import type { Call } from './webhook-doors.ts';

/**
 * The host's VAPID public key, from `GET <apiBase>/api/push/key`, or `null` for every way there is not one.
 *
 * `/api` IS PART OF THE ADDRESS, AS IT IS FOR EVERY METHOD. `apiBase` is the origin or the record's `/app/<slug>`, and the
 * Worker's `servesPushKey` matches `/api/push/key` only. This asked `<apiBase>/push/key` at first, which on brain.dog is
 * not the Worker's route, and since every miss below is `null`, the row was drawn for nobody and nothing said so.
 *
 * `{ key: string | null }` IS THE WHOLE ANSWER, and `null` is a host whose keys are not set. A 404 is a host
 * that predates the route, a thrown fetch is no host reached, and a 200 that is not JSON is a static host, where
 * `adapter-static`'s fallback answers every address with the shell. All of them draw no row, so none is told apart.
 *
 * A STRING AND NOT A CHECKED KEY. Whether it is a P-256 point is `keyBytes`'s question, asked by `offerOf`, so a host
 * variable holding the wrong key is refused in one place however it arrived.
 */
export async function hostKey(base: string, get: (url: string) => Promise<Response> = (u) => fetch(u, { credentials: 'same-origin' })): Promise<string | null> {
  try {
    const res = await get(`${base}/api/push/key`);
    /* THE BODY IS READ EVEN WHEN IT IS NOT WANTED. A refusal left unread stays an open request in Chromium for as long
       as the page lives, and every host but the Worker refuses this route: the a11y gate waited on `networkidle` for
       `/app/settings/notifications` until it timed out, which turned CI 35927285626 red. Measured in a probe beside the
       gate's own server: the record answered 404 in 15 ms and the browser still held the request open eight seconds on. */
    const text = await res.text();
    if (!res.ok) return null;
    const body = JSON.parse(text) as { key?: unknown } | null;
    return typeof body?.key === 'string' ? body.key : null;
  } catch {
    return null;
  }
}

/**
 * The host's public key as the bytes `applicationServerKey` takes, or `null` for anything that is not one.
 *
 * ONLY AN UNCOMPRESSED P-256 POINT: 65 bytes, the first `0x04`. That is what RFC 8292 has a VAPID public key be, and the
 * push service refuses a subscription made with anything else, after the browser has already said yes. The likely
 * mix-up is the record's own signing key, which is also a base64url public key on the host, 32 bytes of Ed25519.
 *
 * BASE64URL, AND ONLY THAT ALPHABET. A person pastes the key into a host variable, so surrounding space and trailing `=`
 * are forgiven, but `+` and `/` are refused: a key in the other alphabet is a key somebody converted by hand, and
 * guessing which characters they meant is how two different keys come to read as one.
 */
export function keyBytes(key: string | null | undefined): Uint8Array<ArrayBuffer> | null {
  if (typeof key !== 'string') return null;
  const k = key.trim().replace(/=+$/u, '');
  if (!/^[A-Za-z0-9_-]+$/u.test(k)) return null;
  let text: string;
  try {
    text = atob(k.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (k.length % 4)) % 4));
  } catch {
    return null;
  }
  if (text.length !== 65 || text.charCodeAt(0) !== 0x04) return null;
  const bytes = new Uint8Array(new ArrayBuffer(65));
  for (let i = 0; i < 65; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** What this browser has, read by the component from `navigator` and `window`. */
export type Can = { worker: boolean; push: boolean; notify: boolean };

/** Whether the row is drawn: `null` draws nothing, `can: false` draws the one sentence, `can: true` the toggle. */
export type Offer = null | { can: false; line: string } | { can: true; key: Uint8Array<ArrayBuffer> };

export function offerOf(key: string | null | undefined, can: Can): Offer {
  const bytes = keyBytes(key);
  if (bytes === null) return null;
  /* SAFARI ON AN IPHONE HAS NO `PushManager` UNTIL THE SITE IS ADDED TO THE HOME SCREEN, and there the manifest's
     `standalone` is what makes it an app that may be told. So a missing one is said, not hidden: it is the single step
     that turns this row into a working one on that phone. */
  if (!can.worker || !can.push || !can.notify) return { can: false, line: copy.pushUnsupported };
  return { can: true, key: bytes };
}

/**
 * Where the toggle starts: whether this browser holds a subscription, and the line to show before any press.
 *
 * `held` IS THE COMPONENT'S READ OF THE REGISTRATION THAT ALREADY EXISTS, and it may reject: `getRegistration` and
 * `getSubscription` are both promises the browser can refuse. The component chained them with no `catch`, so a refusal
 * was an unhandled rejection and a row with no line. Here it is a sentence and the switch reads off.
 */
export async function startOf(permission: string, held: () => Promise<boolean>): Promise<{ on: boolean; line: string }> {
  /* BLOCKED IS SAID BEFORE THE PRESS, AND WITHOUT THE READ. Once a person has blocked the site, `requestPermission`
     answers `denied` without asking, so the first press would be a refusal nobody saw a question for. */
  if (permission === 'denied') return { on: false, line: copy.pushDenied };
  try {
    return { on: await held(), line: '' };
  } catch {
    return { on: false, line: copy.pushUnread };
  }
}

/** A browser subscription, as much of `PushSubscription` as this module reads. */
export type Sub = {
  endpoint: string;
  options?: { applicationServerKey?: ArrayBuffer | null };
  toJSON(): { endpoint?: string; keys?: Record<string, string> };
  unsubscribe(): Promise<boolean>;
};

/** As much of `PushManager` as this module reads. */
export type Manager = {
  getSubscription(): Promise<Sub | null>;
  subscribe(o: { userVisibleOnly: boolean; applicationServerKey: BufferSource }): Promise<Sub>;
};

/**
 * What a press reaches the browser and the record through.
 *
 * `manager` REGISTERS THE WORKER AND WAITS FOR IT TO BE ACTIVE. `subscribe` on a registration whose worker is still
 * installing fails in Chrome with "no active Service Worker", so the component's `manager` answers after `ready`.
 */
export type Ports = { permission(): Promise<string>; manager(): Promise<Manager>; call: Call };

/** What a press says. Every arm but `on` and `off` is a sentence rather than a failure. */
export type Said =
  | { kind: 'on' }
  | { kind: 'off' }
  | { kind: 'sent'; line: string }
  | { kind: 'denied'; line: string }
  | { kind: 'failed'; line: string }
  | { kind: 'signin'; fix: string }
  | { kind: 'refused'; fix: string };

const same = (a: ArrayBuffer | null | undefined, b: Uint8Array): boolean => {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
};

/**
 * Ask, subscribe, and hand the record the address.
 *
 * A RECORD THAT DOES NOT TAKE THE ADDRESS GETS THE BROWSER'S SUBSCRIPTION TAKEN BACK. Left in place, `getSubscription`
 * answers it on the next visit, the row reads on, and the record has no row to push to: a device that believes it will
 * be told and never is. When this was written the host table had no `subscribePush`, so that was every press.
 */
export async function turnOn(ports: Ports, key: Uint8Array<ArrayBuffer>): Promise<Said> {
  let permission: string;
  try {
    permission = await ports.permission();
  } catch {
    permission = 'denied';
  }
  if (permission === 'denied') return { kind: 'denied', line: copy.pushDenied };
  if (permission !== 'granted') return { kind: 'denied', line: copy.pushDismissed };

  let sub: Sub;
  try {
    const m = await ports.manager();
    const held = await m.getSubscription();
    /* ONE HELD UNDER ANOTHER KEY IS DROPPED FIRST. The host's key changed, and `subscribe` with a different key over an
       existing subscription throws `InvalidStateError` rather than replacing it. */
    if (held && same(held.options?.applicationServerKey, key)) sub = held;
    else {
      if (held) await held.unsubscribe();
      sub = await m.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }
  } catch (e) {
    return (e as { name?: unknown })?.name === 'NotAllowedError' ? { kind: 'denied', line: copy.pushDenied } : { kind: 'failed', line: copy.pushNoService };
  }

  const json = sub.toJSON();
  const address = { endpoint: sub.endpoint, keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' } };
  let said: Said;
  try {
    const out = await ports.call('subscribePush', address);
    said = out.ok ? { kind: 'on' } : refusedAs(out);
  } catch {
    said = { kind: 'refused', fix: copy.pushNotSent };
  }
  if (said.kind !== 'on') await sub.unsubscribe().catch(() => false);
  return said;
}

/**
 * Drop this browser's subscription, then tell the record.
 *
 * THE BROWSER FIRST, AND ITS ANSWER IS THE WHOLE ANSWER. Once the subscription is gone the push service answers 410 for
 * its endpoint and the record deletes the row itself (`51 §5`), so the record's half is tidying and not the thing that
 * makes the device quiet. A record offline at the moment of the press must not leave a phone that is still rung.
 */
export async function turnOff(ports: Ports): Promise<Said> {
  let held: Sub | null = null;
  try {
    held = await (await ports.manager()).getSubscription();
  } catch {
    return { kind: 'failed', line: copy.pushNoService };
  }
  if (!held) return { kind: 'off' };
  const endpoint = held.endpoint;
  await held.unsubscribe().catch(() => false);
  await ports.call('unsubscribePush', { endpoint }).catch(() => null);
  return { kind: 'off' };
}

type Refused = Exclude<Awaited<ReturnType<Call>>, { ok: true }>;

/**
 * A refusal as this row says it, in `webhook-doors.ts`'s two arms, and `ROUTE_UNKNOWN` as a host that predates it.
 *
 * A 401 IS A PERSON NOT SIGNED IN, WHATEVER THE ADDRESS. With no slug it used to be the sample, and the row answered it
 * with the demo's sentence about having no account; there is no sample now, so it is `signin` with
 * the record's own sentence, as a stale sign-in already was.
 *
 * `UNREACHABLE` IS `pushNotSent`, THE SENTENCE A THROWN CALL ALREADY SAID. The client's own is a status and a parse
 * ("200 with a body that is not JSON"), which is true and gives a person nothing to do.
 */
function refusedAs(out: Refused): Said {
  if (!('refusal' in out)) return { kind: 'refused', fix: copy.pushNotSent };
  const { code, fix } = out.refusal;
  if (code === 'ROUTE_UNKNOWN') return { kind: 'refused', fix: copy.pushNoRoute };
  if (code === 'UNREACHABLE') return { kind: 'refused', fix: copy.pushNotSent };
  if (code === 'UNAUTHORIZED' || code === 'NEEDS_BROWSER_SESSION') return { kind: 'signin', fix };
  return { kind: 'refused', fix };
}

/**
 * The words the test press says, here and not in `copy.ts` while that file is other work's. Plain, and naming only
 * the person's own devices: nothing of the record is in a test push, so nothing of it is in what the press says.
 */
export const testWords = {
  send: 'Send a test notification',
  pressing: 'Sending the test',
  sent: (devices: number): string => `Sent to ${devices} ${devices === 1 ? 'device' : 'devices'}. It should arrive within a minute.`,
  /* THE PRESS IS DRAWN ONLY WHILE THIS DEVICE IS ON, so none on the record is the dead subscription the test is for. */
  none: 'Nothing was sent: the record holds no device of yours. Turn notifications off and on again here.',
  noRoute: 'This record cannot send a test yet, so nothing was sent.',
  notReached: 'The record was not reached, so nothing was sent. Try again once you are online.',
} as const;

/**
 * Ring each of this person's own devices once (`pushTest`, REC-A15), and say how many.
 *
 * THE COUNT IS THE RECORD'S, worded here. A press inside a minute is the record's `RATE_LIMITED`, and its `fix` already
 * says when the next may go, so it is said as it came. Through `call` until the client names `pushTest` itself.
 */
export async function sendTest(call: Call): Promise<Said> {
  try {
    const out = await call('pushTest');
    /* NOT `refusedAs`'s two sentences, which say nothing was turned on: a test press turns nothing on. */
    if (!out.ok && 'refusal' in out && out.refusal.code === 'ROUTE_UNKNOWN') return { kind: 'refused', fix: testWords.noRoute };
    if (!out.ok && (!('refusal' in out) || out.refusal.code === 'UNREACHABLE')) return { kind: 'refused', fix: testWords.notReached };
    if (!out.ok) return refusedAs(out);
    /* THE RECORD'S OWN SENTENCE WHEN IT SENT ONE, these words for a record that answered the count alone. */
    const value = out.value as { devices?: unknown; line?: unknown } | null;
    if (typeof value?.devices !== 'number') return { kind: 'refused', fix: testWords.notReached };
    if (value.devices === 0) return { kind: 'failed', line: testWords.none };
    return { kind: 'sent', line: typeof value.line === 'string' && value.line !== '' ? value.line : testWords.sent(value.devices) };
  } catch {
    return { kind: 'refused', fix: testWords.notReached };
  }
}
