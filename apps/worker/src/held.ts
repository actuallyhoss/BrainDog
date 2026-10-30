/**
 * The arrival door's hold: a webhook arrival the record could not take right now is kept, and sent again until it lands.
 *
 * WHAT WAS SEEN: on 29 October at 09:00:34Z a bank text posted by his phone's Shortcut was answered 503. The record's
 * object was busy in a long alarm, the platform reset it, and the door said "send it again later", which is right for a
 * bank's server and wrong for a Shortcut: it does not send again. Nothing was stored and nothing said so. The text was
 * lost.
 *
 * SO A 503 IS NO LONGER THE LAST WORD FOR A WEBHOOK THAT NAMES ITS RECORD. The door is asked once more after a short
 * pause, because a reset object answers the next call from a fresh instance; if it still cannot take it, the request is
 * kept in the bucket, sealed, and the sender hears 202. The queue sends it again on a widening ladder (half a minute,
 * then minutes, then hours), and the nightly cron puts back on the queue anything the queue lost. It is never dropped:
 * a kept arrival leaves the bucket only when the door has taken it, or moves to `held/gave-up/` when the door has said it
 * never will (gone, switched off, too big), and both are lines in the log and the second a mail to the operator.
 *
 * THE WHOLE REQUEST IS KEPT AND REPLAYED THROUGH `serveIngest`, not a parsed arrival. The record may not have been able
 * to say what verifies this door (that was the call that failed on 29 October), so nothing was verified yet; the replay
 * runs the same door with the same checks, and an arrival that was never verifiable is stored as unverified, as it
 * would have been. `kernel.arrive` is idempotent on the channel and the bytes' hash, so a replay of an arrival that
 * did land, or two copies of one replayed together, store it once.
 *
 * SEALED, BECAUSE THE URL CARRIES THE DOOR'S TOKEN AND THE BODY IS A BANK TEXT. AES-GCM under a key derived from
 * `SESSION_SECRET`: the bucket alone reads as nothing. A deployment with no secret, or no bucket, holds nothing and
 * answers 503 as before. A secret rotated while something waits makes it unreadable, and it moves to `gave-up` with a
 * mail, which is the one way a kept arrival can be lost, and it says so.
 *
 * BOUNDED: only a POST to `/in/webhook/<rec>/<ingest>[/<token>]` whose record id is well formed, at most the door's own
 * size, at most `HELD_PER_RECORD` waiting for one record and `HELD_MOST` for the deployment. Past either, 503 as before.
 * A request signed with its time (Stripe's `t=`) is never kept: its sender retries a 503, and a late replay would fail
 * the signature's window. An arrival still waiting `HELD_OLDEST_MS` after it was kept moves to `gave-up` with a mail, so
 * a record that will never take arrivals cannot fill the deployment's room.
 */

import { serveIngest, servesIngest, type IngestDoor } from '@braindog/host';

import { ipBucket } from '@braindog/record/directory';

import { bodyUpTo } from './files.ts';
import { op } from './oplog.ts';
import { isRecordId } from './route.ts';

/** Where a kept arrival waits, by record, and where one the door will never take is put for the operator. */
export const HELD_WAIT = 'held/wait/';
export const HELD_GAVE_UP = 'held/gave-up/';

/** The most kept arrivals waiting for one record, and for the deployment. */
export const HELD_PER_RECORD = 50;
export const HELD_MOST = 500;
/**
 * The most kept arrivals waiting from one place (an IPv4 address, an IPv6 /64), across every record (SEC7). His phone
 * and his bank's gateway each post from a handful of places; a stranger filling his fifty slots during an outage needs
 * five places at least, and every one of them a place that cannot fill anybody else's too.
 */
export const HELD_PER_PLACE = 10;

/** The door's own ceiling for a webhook (`WEBHOOK_LIMIT` in `@braindog/host`'s `ingest.ts`): a bigger body is its 413. */
const HOLD_LIMIT = 1_048_576;

/** Seconds before each try, by how many have failed; the last repeats. The queue's ceiling is twelve hours. */
export const HELD_STEPS_S: readonly number[] = [30, 120, 600, 1800, 3600, 10_800, 21_600, 43_200];

/** After this many failed tries the operator is mailed: the record has been unable to take arrivals for hours. */
export const HELD_TELL_AFTER = 6;

/** A kept arrival still waiting this long after it was kept is given up on, with a mail: a week. */
export const HELD_OLDEST_MS = 7 * 86_400_000;

/** How long the door waits before its second ask. */
const SECOND_ASK_MS = 500;

/** The queue message for one kept arrival. */
export type HeldMessage = { held: string; tries: number };

/** Whether a queue message is a kept arrival's, and not a record's doorbell. */
export const isHeld = (body: unknown): body is HeldMessage =>
  typeof body === 'object' && body !== null && typeof (body as { held?: unknown }).held === 'string' && (body as { held: string }).held.startsWith(HELD_WAIT);

/**
 * The bucket calls this file makes. Structural, as `snapshots.ts`'s `Blobs` is, so the tests' fake fits. A put with
 * `onlyIf` that does not hold writes nothing and answers `null`, as R2's does.
 */
export type HeldBucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; etag?: string } | null>;
  put(key: string, value: Uint8Array, options?: { customMetadata?: Record<string, string>; onlyIf?: { etagMatches?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options: {
    prefix: string;
    limit?: number;
    cursor?: string;
    include?: 'customMetadata'[];
  }): Promise<{ objects: { key: string; uploaded: Date; customMetadata?: Record<string, string> }[]; truncated: boolean; cursor?: string }>;
};

/**
 * What a kept object says of its own ring, in the bucket's metadata, so the nightly sweep can tell a chain that is
 * still ringing from one the queue lost without opening the seal: `next` is when the next ring is due (ms), `tries`
 * how many have failed, `kept` when it was first kept (ms).
 */
type Ringing = { next: number; tries: number; kept: number; from?: string | undefined };

/** `from` is the place it came from, as a digest (`placeOf`), so the bucket counts by place and never holds an address. */
const ringing = (r: Ringing): Record<string, string> => ({
  next: String(r.next),
  tries: String(r.tries),
  kept: String(r.kept),
  ...(r.from === undefined ? {} : { from: r.from }),
});

function ringingOf(meta: Record<string, string> | undefined): Ringing | null {
  if (meta === undefined) return null;
  const next = Number(meta['next']);
  const tries = Number(meta['tries']);
  const kept = Number(meta['kept']);
  return Number.isFinite(next) && Number.isFinite(tries) && Number.isFinite(kept) ? { next, tries, kept } : null;
}

export type HeldDeps = {
  /**
   * Whether the Directory holds this record now (`knows`), asked before anything is kept (SEC7). A 503 is kept whatever
   * the URL says, because the record that would check it is the one that cannot answer, so this is the one check a
   * stranger's post meets first: an id nobody holds is never kept, and a Directory that cannot say keeps nothing.
   */
  knows: (rec: string) => Promise<boolean>;
  bucket: HeldBucket | undefined;
  /** `SESSION_SECRET`; the seal's key is derived from it and never stored. */
  secret: string | undefined;
  queue: { send(body: HeldMessage, options?: { delaySeconds?: number }): Promise<unknown> };
  /** The door as the Worker builds it for a request: a fresh one each time it is asked. */
  door: () => IngestDoor;
  now?: () => number;
  /** The operator's mail (`opsAlert`), for an arrival still waiting after `HELD_TELL_AFTER` tries or given up on. */
  tell?: (fields: { why: string; rec: string }) => Promise<unknown>;
  pause?: (ms: number) => Promise<void>;
};

/* ── the door ─────────────────────────────────────────────────────────────── */

/**
 * `/in/*`, served as `serveIngest` serves it, with a webhook the record could not take kept rather than refused.
 */
export async function serveHeld(request: Request, deps: HeldDeps): Promise<Response> {
  const path = request.method === 'POST' ? servesIngest(new URL(request.url).pathname) : null;
  const rec = path !== null && path.channel === 'webhook' ? path.rec : undefined;
  if (rec === undefined || !isRecordId(rec) || deps.bucket === undefined || !deps.secret) return serveIngest(request, deps.door());
  const said = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(said) && said > HOLD_LIMIT) return serveIngest(request, deps.door());
  /* READ AS IT COMES AND STOPPED PAST THE DOOR'S OWN CEILING (SEC7). A chunked body says no length, and it was read
     whole, up to the runtime's hundred megabytes, before the budget, the token or the 404 the door asks first. */
  const bytes = await bodyUpTo(request.body, HOLD_LIMIT);
  if (bytes === null) return tooLarge();
  const first = await serveIngest(again(request.url, [...request.headers], bytes), deps.door());
  if (first.status !== 503) return first;
  /* THE SECOND ASK SPENDS NO SECOND BUDGET: it is the same arrival, already counted at the door. */
  await (deps.pause ?? sleep)(SECOND_ASK_MS);
  const second = await serveIngest(again(request.url, [...request.headers], bytes), unlimited(deps.door()));
  if (second.status !== 503) return second;
  /* A REQUEST SIGNED WITH THE TIME IS NEVER KEPT, and its sender hears 503 as before. Stripe signs `t=` into its
     header and the door checks it against now within five minutes, so a replay from the bucket ten minutes on reads
     as forged and is stored unverified, while Stripe, told 202, has stopped trying. Told 503, Stripe tries again for
     three days with a fresh signature, which is the delivery this would have broken. */
  if (timeSigned(request.headers)) {
    op({ op: 'door', held: false, rec, why: 'time-signed' }, 'error');
    return second;
  }
  /* ONLY WHAT A DOOR COULD TAKE IS KEPT (SEC7): a URL with its token in it, or one signed in a header, as a signed
     door's sender signs it. A post to `/in/webhook/<rec>/<anything>` with neither is junk the record would refuse, and
     kept it filled his room while he was down. */
  if ((path?.channel === 'webhook' ? path.token : undefined) === undefined && !headerSigned(request.headers)) {
    op({ op: 'door', held: false, rec, why: 'unsigned' }, 'error');
    return second;
  }
  /* AND ONLY FOR A RECORD THE DIRECTORY HOLDS, asked now: during a Directory fault ten made-up ids filled the whole
     deployment's room. One that cannot answer keeps nothing, and the sender hears 503 and tries again. */
  let known = false;
  try {
    known = await deps.knows(rec);
  } catch {
    known = false;
  }
  if (!known) {
    op({ op: 'door', held: false, rec, why: 'unknown' }, 'error');
    return second;
  }
  const kept = await hold(deps, rec, request.url, [...request.headers], bytes, await placeOf(request.headers.get('cf-connecting-ip') ?? ''));
  return kept ? new Response(null, { status: 202, headers: { 'cache-control': 'no-store' } }) : second;
}

/**
 * Headers that carry a signing time a verifier holds to a window: Stripe's, and the Svix / Standard Webhooks and Slack
 * ones, whose senders all retry a 503 themselves.
 */
const TIMED_HEADERS = new Set(['stripe-signature', 'svix-timestamp', 'webhook-timestamp', 'x-slack-request-timestamp']);

/**
 * Whether a request is signed with its time, so a replay later than the verifier's window would fail its check.
 *
 * ANY HEADER SHAPED AS STRIPE WRITES ONE COUNTS, under whatever name: a door declared `verify: { kind: 'stripe' }` may
 * name its own header, and the record that would say which one is the record that could not answer.
 */
export function timeSigned(headers: Iterable<[string, string]>): boolean {
  for (const [name, value] of headers) {
    if (TIMED_HEADERS.has(name.toLowerCase())) return true;
    if (/(?:^|,)\s*t=\d+\s*(?:,|$)/u.test(value) && /(?:^|,)\s*v\d+=/u.test(value)) return true;
  }
  return false;
}

/** The door's own 413 for a body past the ceiling, in its words (`tooBig` in `@braindog/host`'s `ingest.ts`). */
const tooLarge = (): Response =>
  new Response(JSON.stringify({ ok: false, refusal: { code: 'BODY_MALFORMED', fix: `An arrival on this channel is at most ${HOLD_LIMIT} bytes.`, at: 'body' } }), {
    status: 413,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** Whether a request carries a signature in a header, under any of the names signed doors use. */
const headerSigned = (headers: Headers): boolean => {
  for (const [name, value] of headers) if (/signature|hmac/i.test(name) && value.trim() !== '') return true;
  return false;
};

/** The place an address stands for (`ipBucket`: an IPv6 address as its /64), as a short digest, so no address is kept. */
async function placeOf(ip: string): Promise<string> {
  return (await digest(utf8(`held-place:${ipBucket(ip)}`))).slice(0, 24);
}

/** Keep one arrival and ring for it: `true` once it is in the bucket, whether or not the ring went. */
async function hold(deps: HeldDeps, rec: string, url: string, headers: [string, string][], bytes: Uint8Array, from: string): Promise<boolean> {
  const bucket = deps.bucket;
  if (bucket === undefined || !deps.secret) return false;
  const now = (deps.now ?? Date.now)();
  try {
    /* A LISTING SHORTER THAN ITS LIMIT IS THE WHOLE OF IT, so the record's own count is read off the same page. */
    const waiting = await bucket.list({ prefix: HELD_WAIT, limit: HELD_MOST, include: ['customMetadata'] });
    if (waiting.objects.length >= HELD_MOST) {
      op({ op: 'door', held: false, rec, why: 'full' }, 'error');
      return false;
    }
    const mine = waiting.objects.filter((o) => o.key.startsWith(`${HELD_WAIT}${rec}/`)).length;
    if (mine >= HELD_PER_RECORD) {
      op({ op: 'door', held: false, rec, why: 'record-full' }, 'error');
      return false;
    }
    if (waiting.objects.filter((o) => o.customMetadata?.['from'] === from).length >= HELD_PER_PLACE) {
      op({ op: 'door', held: false, rec, why: 'place-full' }, 'error');
      return false;
    }
    const envelope: Envelope = { url, headers: headers.filter(([k]) => !UNKEPT.has(k.toLowerCase())), body: base64(bytes), at: new Date(now).toISOString(), from };
    /* THE SAME REQUEST KEPT TWICE IS ONE KEY: his two devices post every text, and the second one is the same arrival. */
    const key = `${HELD_WAIT}${rec}/${await digest(concat(utf8(url), bytes))}.held`;
    await bucket.put(key, await seal(deps.secret, utf8(JSON.stringify(envelope))), {
      customMetadata: ringing({ next: now + stepOf(0) * 1000, tries: 0, kept: now, from }),
    });
    op({ op: 'door', held: true, rec, bytes: bytes.byteLength }, 'error');
    try {
      await deps.queue.send({ held: key, tries: 0 }, { delaySeconds: stepOf(0) });
    } catch (e) {
      /* KEPT AND NOT RUNG: the nightly sweep puts it on the queue. The sender is still told it was taken, because it was. */
      op({ op: 'door', rung: false, rec, error: e instanceof Error ? e.message : String(e) }, 'error');
    }
    return true;
  } catch (e) {
    op({ op: 'door', held: false, rec, why: 'bucket', error: e instanceof Error ? e.message : String(e) }, 'error');
    return false;
  }
}

/* ── the queue ────────────────────────────────────────────────────────────── */

/** What became of one try. */
export type Redelivered = 'delivered' | 'waiting' | 'gave-up' | 'gone';

/**
 * One kept arrival, tried again through the door. Throws only when the next try could not be queued, so the queue's
 * own retry carries it.
 */
export async function redeliver(message: HeldMessage, deps: HeldDeps): Promise<Redelivered> {
  const bucket = deps.bucket;
  if (bucket === undefined || !deps.secret) throw new Error('This deployment has no bucket or no SESSION_SECRET, so a kept arrival cannot be read.');
  const rec = recOf(message.held);
  const object = await bucket.get(message.held);
  /* GONE IS DONE: another copy of this message, or the sweep's, already delivered it. */
  if (object === null) return 'gone';
  const sealed = new Uint8Array(await object.arrayBuffer());
  let envelope: Envelope;
  try {
    envelope = JSON.parse(new TextDecoder().decode(await open(deps.secret, sealed))) as Envelope;
  } catch {
    return giveUp(deps, bucket, message.held, sealed, rec, 'unreadable');
  }
  let answer: Response;
  try {
    answer = await serveIngest(again(envelope.url, envelope.headers, unbase64(envelope.body)), unlimited(deps.door()));
  } catch {
    answer = new Response(null, { status: 503 });
  }
  if (answer.status === 202) {
    await bucket.delete(message.held);
    const late = Math.round(((deps.now ?? Date.now)() - Date.parse(envelope.at)) / 1000);
    op({ op: 'door', delivered: true, rec, tries: message.tries + 1, late_s: Number.isFinite(late) ? late : null });
    return 'delivered';
  }
  if (answer.status === 503 || answer.status === 429) {
    const now = (deps.now ?? Date.now)();
    const kept = Date.parse(envelope.at);
    /* A WEEK IS LONG ENOUGH: a record that has refused every ring for seven days is not going to be reset back to health
       by the next one, and what it holds is the deployment's room for every other record's outage. */
    if (Number.isFinite(kept) && now - kept > HELD_OLDEST_MS) return giveUp(deps, bucket, message.held, sealed, rec, 'too-old');
    const tries = message.tries + 1;
    const after = Number(answer.headers.get('retry-after') ?? '');
    const delay = Math.min(Math.max(1, Math.round(answer.status === 429 && Number.isFinite(after) && after > 0 ? after : stepOf(tries))), 43_200);
    await deps.queue.send({ held: message.held, tries }, { delaySeconds: delay });
    /* THE OBJECT SAYS WHEN ITS NEXT RING IS DUE, so the sweep leaves a live chain alone. Put after the ring is queued:
       a put that fails costs at most one extra ring from the sweep, which the door's dedupe stores once.

       ONLY OVER THE OBJECT THIS RING READ (second review of 30 October, Q3): his two devices post the same text, so two
       chains ring one key, and a ring that got 503 while the other landed it and deleted the object put it back here,
       to ring for a week and end as a mail about nothing. The put holds only while the object is the one read (R2's
       `etagMatches`, which fails on an object deleted since); one gone or kept again since is left as it is, and the
       ring just queued finds it gone or rings the new one. A bucket that says no etag is read again first. */
    const meta = ringing({ next: now + delay * 1000, tries, kept: Number.isFinite(kept) ? kept : now, from: envelope.from });
    let marked: unknown;
    try {
      marked =
        typeof object.etag === 'string' && object.etag !== ''
          ? await bucket.put(message.held, sealed, { customMetadata: meta, onlyIf: { etagMatches: object.etag } })
          : (await bucket.get(message.held)) === null
            ? null
            : await bucket.put(message.held, sealed, { customMetadata: meta });
    } catch (e) {
      op({ op: 'door', marked: false, rec, error: e instanceof Error ? e.message : String(e) }, 'error');
    }
    if (marked === null) {
      op({ op: 'door', marked: false, rec, why: 'gone' });
      return 'gone';
    }
    op({ op: 'door', waiting: true, rec, tries, status: answer.status }, 'error');
    if (tries === HELD_TELL_AFTER) await deps.tell?.({ why: 'waiting', rec });
    return 'waiting';
  }
  /* ANY OTHER ANSWER IS THE DOOR SAYING IT NEVER WILL: gone (404), switched off (410), too big (413). */
  return giveUp(deps, bucket, message.held, sealed, rec, `status-${String(answer.status)}`);
}

async function giveUp(deps: HeldDeps, bucket: HeldBucket, key: string, sealed: Uint8Array, rec: string, why: string): Promise<'gave-up'> {
  await bucket.put(`${HELD_GAVE_UP}${key.slice(HELD_WAIT.length)}`, sealed);
  await bucket.delete(key);
  op({ op: 'door', gave_up: true, rec, why }, 'error');
  await deps.tell?.({ why: `gave-up ${why}`, rec });
  return 'gave-up';
}

/**
 * The nightly sweep: every kept arrival whose ring is over an hour late is rung again, on the slow end of the ladder. A
 * message the queue lost, or a ring that never went, is found here. A copy already in flight is harmless: the first to
 * land deletes the object and the other finds it gone. The number rung.
 *
 * A CHAIN STILL RINGING IS LEFT ALONE. Each ring writes on the object when the next is due; the first cut rang every
 * object older than an hour, so a record down for N nights had N+1 chains ringing each of its arrivals. An object with
 * nothing written on it (kept before this, or by a host whose bucket keeps no metadata) is judged by its age as before.
 */
export async function sweepHeld(deps: HeldDeps): Promise<number> {
  const bucket = deps.bucket;
  if (bucket === undefined) return 0;
  const now = (deps.now ?? Date.now)();
  const page = await bucket.list({ prefix: HELD_WAIT, limit: HELD_MOST, include: ['customMetadata'] });
  let rung = 0;
  for (const o of page.objects) {
    const r = ringingOf(o.customMetadata);
    const due = r === null ? o.uploaded.getTime() : r.next;
    if (now - due < 3_600_000) continue;
    await deps.queue.send({ held: o.key, tries: Math.max(HELD_TELL_AFTER, r?.tries ?? 0) }, { delaySeconds: 1 });
    rung += 1;
  }
  if (page.objects.length > 0) op({ op: 'door', swept: rung, waiting: page.objects.length }, rung > 0 ? 'error' : 'info');
  return rung;
}

/* ── the pieces ───────────────────────────────────────────────────────────── */

type Envelope = { url: string; headers: [string, string][]; body: string; at: string; from?: string };

/** Headers the runtime sets for itself, which a rebuilt request must not carry over. */
const UNKEPT = new Set(['host', 'content-length', 'connection', 'transfer-encoding']);

const recOf = (key: string): string => key.slice(HELD_WAIT.length).split('/')[0] ?? '';

const stepOf = (tries: number): number => HELD_STEPS_S[Math.min(tries, HELD_STEPS_S.length - 1)] ?? 43_200;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The door with its budget already spent for this arrival. */
const unlimited = (door: IngestDoor): IngestDoor => ({ ...door, limit: async () => null });

function again(url: string, headers: [string, string][], bytes: Uint8Array): Request {
  return new Request(url, { method: 'POST', headers: headers.filter(([k]) => !UNKEPT.has(k.toLowerCase())), body: bytes });
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function unbase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** AES-256-GCM under HKDF-SHA256(`secret`), the nonce first. */
async function keyOf(secret: string): Promise<Awaited<ReturnType<typeof crypto.subtle.deriveKey>>> {
  const base = await crypto.subtle.importKey('raw', utf8(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8('braindog.held'), info: utf8('kept arrivals') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(secret: string, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(secret), plain));
  return concat(iv, out);
}

export async function open(secret: string, sealed: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.subarray(0, 12) }, await keyOf(secret), sealed.subarray(12)));
}
