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
 * size, at most `HELD_PER_RECORD` waiting for one record, `HELD_PER_DOOR` for one door, `HELD_PER_PLACE` from one place
 * for one record, `HELD_PER_PLACE_MOST` from one place in all and `HELD_MOST` for the deployment. Past any, 503 as
 * before, and nothing already waiting is ever pushed out for a new arrival (RE1).
 * AND ONLY AT A DOOR THE DIRECTORY KNOWS, WITH THAT DOOR'S OWN TOKEN (`holds`, RD1): the Directory learns what verifies
 * each door from the record's own answers while it is up (`learning`), so junk at a made-up door is never kept.
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
 * The most kept arrivals waiting for one record from one place (an IPv4 address, an IPv6 /64) (SEC7, and RD14 of the
 * review of 30 Oct). It was one count across every record, so a sender that posts for many people from a few addresses
 * (Zapier, IFTTT, a bank's gateway) had its eleventh arrival in a long outage refused for everybody. Counted per record,
 * one person's door filling up never shuts another's. What a stranger could fill it with is the real token alone now
 * (`holds`, RD1), so this is the guard on a token that leaked, not on junk.
 */
export const HELD_PER_PLACE = 10;

/**
 * The most kept arrivals waiting from one place across every record (RE1 of the review of 30 Oct, e): a tenth of the
 * deployment's room, so one address that knows fifty records' doors cannot fill all of it, and a gateway posting for five
 * people through a long outage still fits.
 */
export const HELD_PER_PLACE_MOST = 50;

/**
 * The most kept arrivals waiting at one door of a record (sec-follow M6): a token that leaked for one door, or a door
 * signed in a header that anybody can claim to sign, fills that door's share and never the whole record's, so his bank
 * door keeps room while another door is flooded.
 */
export const HELD_PER_DOOR = 30;

/** What the Directory keeps for a door signed in a header (`hmac_sha256`, `stripe`), in place of a token's digest. */
export const SIGNED_DOOR = 'signed';

/** The door's own ceiling for a webhook (`WEBHOOK_LIMIT` in `@braindog/host`'s `ingest.ts`): a bigger body is its 413. */
const HOLD_LIMIT = 1_048_576;

/** Seconds before each try, by how many have failed; the last repeats. The queue's ceiling is twelve hours. */
export const HELD_STEPS_S: readonly number[] = [30, 120, 600, 1800, 3600, 10_800, 21_600, 43_200];

/** After this many failed tries the operator is mailed: the record has been unable to take arrivals for hours. */
export const HELD_TELL_AFTER = 6;

/** A kept arrival still waiting this long after it was kept is given up on, with a mail: a week. */
export const HELD_OLDEST_MS = 7 * 86_400_000;

/**
 * How long a given-up arrival is kept for the operator to read, after which the nightly sweep deletes it: thirty days, the
 * same as a deleted record's final copy. It was kept for ever, so a sealed bank text outlived any reason to look at it.
 */
export const HELD_GAVE_UP_MS = 30 * 86_400_000;

/** Every prefix a record's kept arrivals sit under, waiting or given up, so a deletion empties both (`destroy.ts`). */
export const heldPrefixes = (record: string): string[] => [`${HELD_WAIT}${record}/`, `${HELD_GAVE_UP}${record}/`];

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
type Ringing = { next: number; tries: number; kept: number; from?: string | undefined; door?: string | undefined; signed?: boolean | undefined };

/**
 * `from` is the place it came from, as a digest (`placeOf`), so the bucket counts by place and never holds an address;
 * `door` the door it came to, as a digest (`doorOf`); `signed` that it came signed in a header, for the operator's reading
 * only: the hold cannot check the signature, so it earns the arrival nothing (RE1).
 */
const ringing = (r: Ringing): Record<string, string> => ({
  next: String(r.next),
  tries: String(r.tries),
  kept: String(r.kept),
  ...(r.from === undefined ? {} : { from: r.from }),
  ...(r.door === undefined ? {} : { door: r.door }),
  ...(r.signed === true ? { signed: '1' } : {}),
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
   * Whether the Directory holds this record now and knows this door by what verifies it (`doorHolds`), asked before
   * anything is kept (SEC7, RD1). A 503 is kept whatever the URL says, because the record that would check it is the one
   * that cannot answer, so this is the one check a stranger's post meets first. `sign` is the SHA-256 hex of the URL's
   * token, or `SIGNED_DOOR` for a request signed in a header. It asked only whether the record was held, and a junk
   * token at a made-up door name was kept as surely as his bank's text: his record id is in the URL his phone posts to.
   * A record nobody holds, a door the Directory was never told of, a token that is not the door's, and a Directory that
   * cannot say all keep nothing.
   */
  holds: (rec: string, ingest: string, sign: string) => Promise<boolean>;
  /**
   * Tell the Directory what verifies a door, as the record has just answered it (`door$`): a token's digest,
   * `SIGNED_DOOR`, or `null` for a door that is gone or verified by nothing. Asked on the door's first ask while the
   * record is up, so the Directory learns each door from its own traffic and follows a token minted again. Absent, it
   * learns nothing and keeps only what it was already told. The record also tells all its doors at once from its alarm,
   * once a deploy and after a mint (`Record$` `#doors`, DR1), so a door is known before its first arrival.
   */
  learn?: (rec: string, ingest: string, sign: string | null) => Promise<unknown>;
  /** The request's `waitUntil`, so the Directory is told after the arrival is answered and never before (RE8). */
  later?: (work: Promise<unknown>) => void;
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
  const first = await serveIngest(again(request.url, [...request.headers], bytes), learning(deps.door(), deps));
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
  /* AND ONLY FOR A DOOR THE DIRECTORY KNOWS, BY WHAT VERIFIES IT, asked now (RD1): the token's digest must be the one
     the record last answered for this door, or the door one signed in a header. During a Directory fault ten made-up ids
     filled the whole deployment's room, so one that cannot answer keeps nothing, and the sender hears 503 as before. */
  const sign = path?.channel === 'webhook' && path.token !== undefined ? await digest(utf8(path.token)) : SIGNED_DOOR;
  let known = false;
  try {
    known = path?.channel === 'webhook' && (await deps.holds(rec, path.ingest, sign));
  } catch {
    known = false;
  }
  if (!known) {
    op({ op: 'door', held: false, rec, why: 'unknown' }, 'error');
    return second;
  }
  const kept = await hold(deps, rec, request.url, [...request.headers], bytes, await placeOf(request.headers.get('cf-connecting-ip') ?? ''), {
    door: await doorOf(rec, path?.channel === 'webhook' ? path.ingest : ''),
    signed: sign === SIGNED_DOOR,
  });
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

/**
 * What the Directory was last told of each door from this isolate, and when, so a door's every arrival is not one more
 * call. Each is good for `TOLD_FOR_MS` only (RE8): it was kept for the isolate's life, so a door whose row another isolate
 * dropped (gone, `close`, a Directory restore) and that came back with the same digest was never taught again here, and
 * the hold kept nothing for it through an outage.
 */
const told = new Map<string, { sign: string | null; at: number }>();
/** At most this many doors remembered in one isolate; past it the memory starts again. */
const TOLD_MOST = 1000;
/** How long one telling is trusted before the Directory is told again. */
export const TOLD_FOR_MS = 5 * 60_000;
/** How long a door with no `waitUntil` waits on the Directory before it goes on without it. */
const LEARN_WAIT_MS = 300;

/** What verifies a door, as the Directory keeps it (`door$`): a token's digest, `SIGNED_DOOR`, or `null` for nothing. */
async function signOf(v: Awaited<ReturnType<IngestDoor['verify']>>): Promise<string | null | undefined> {
  if (v === null) return null;
  /* A DOOR SWITCHED OFF IS ANSWERED 410 AND NEVER HELD, and on again it is the same door: nothing is learned from it. */
  if (v.off === true) return undefined;
  if (v.kind === 'path') return 'sha256' in v ? v.sha256.toLowerCase() : await digest(utf8(v.token));
  if (v.kind === 'hmac_sha256' || v.kind === 'stripe') return SIGNED_DOOR;
  return null;
}

/**
 * The door, telling the Directory what verifies each door the record answers for (RD1), so the hold can keep only an
 * arrival with the door's own token when the record cannot answer. A failure to tell is never the arrival's: it is
 * logged and the door goes on.
 */
function learning(door: IngestDoor, deps: HeldDeps): IngestDoor {
  const learn = deps.learn;
  if (learn === undefined) return door;
  return {
    ...door,
    verify: async (ask) => {
      const v = await door.verify(ask);
      const rec = ask.rec;
      if (rec === undefined) return v;
      try {
        const sign = await signOf(v);
        const key = `${rec}/${ask.ingest}`;
        const now = (deps.now ?? Date.now)();
        const last = told.get(key);
        if (sign !== undefined && (last === undefined || last.sign !== sign || now - last.at > TOLD_FOR_MS)) {
          if (told.size >= TOLD_MOST) told.clear();
          told.set(key, { sign, at: now });
          /* NEVER ON THE ARRIVAL'S PATH (RE8): a Directory that is slow or hung held up the real webhook while it was
             told. Handed to `waitUntil` where there is one, and otherwise waited on for a moment at most. A telling that
             fails is forgotten, so the next arrival tells it again. */
          const telling = learn(rec, ask.ingest, sign).catch((e: unknown) => {
            if (told.get(key)?.at === now) told.delete(key);
            op({ op: 'door', learned: false, rec, error: e instanceof Error ? e.message : String(e) }, 'error');
          });
          if (deps.later !== undefined) deps.later(telling);
          else await Promise.race([telling, sleep(LEARN_WAIT_MS)]);
        }
      } catch (e) {
        op({ op: 'door', learned: false, rec, error: e instanceof Error ? e.message : String(e) }, 'error');
      }
      return v;
    },
  };
}

/** The place an address stands for (`ipBucket`: an IPv6 address as its /64), as a short digest, so no address is kept. */
async function placeOf(ip: string): Promise<string> {
  return (await digest(utf8(`held-place:${ipBucket(ip)}`))).slice(0, 24);
}

/** The door an arrival came to, as a short digest, so the bucket counts by door and names no door in its metadata. */
async function doorOf(rec: string, ingest: string): Promise<string> {
  return (await digest(utf8(`held-door:${rec}/${ingest}`))).slice(0, 24);
}

/** Keep one arrival and ring for it: `true` once it is in the bucket, whether or not the ring went. */
async function hold(
  deps: HeldDeps,
  rec: string,
  url: string,
  headers: [string, string][],
  bytes: Uint8Array,
  from: string,
  at: { door: string; signed: boolean },
): Promise<boolean> {
  const bucket = deps.bucket;
  if (bucket === undefined || !deps.secret) return false;
  const now = (deps.now ?? Date.now)();
  try {
    /* THE SAME REQUEST KEPT TWICE IS ONE KEY: his two devices post every text, and the second one is the same arrival. */
    const key = `${HELD_WAIT}${rec}/${await digest(concat(utf8(url), bytes))}.held`;
    /* A LISTING SHORTER THAN ITS LIMIT IS THE WHOLE OF IT, so the record's own count is read off the same page. */
    const waiting = await bucket.list({ prefix: HELD_WAIT, limit: HELD_MOST, include: ['customMetadata'] });
    /* ONE ALREADY KEPT IS TAKEN, AND LEFT AS IT IS (RE2 of the review of 30 Oct, e): its chain is still ringing, so the
       second device hears 202 even when the record is full, and the kept one's ring is not started again. */
    if (waiting.objects.some((o) => o.key === key)) {
      op({ op: 'door', held: true, rec, again: true }, 'error');
      return true;
    }
    if (waiting.objects.length >= HELD_MOST) {
      op({ op: 'door', held: false, rec, why: 'full' }, 'error');
      return false;
    }
    /* A FULL RECORD, DOOR OR PLACE REFUSES THE NEW ARRIVAL, AND NOTHING WAITING IS EVER PUSHED OUT (RE1, RE2). A full one
       made room for an arrival "signed in a header" by moving his oldest unsigned one to `gave-up` (sec-follow M6), but
       the hold cannot check a signature, because the record that holds the secret is the one that is down: any header
       named `*signature*` passed, so a stranger with his record id pushed his bank texts out one post at a time, a mail
       each. And it made room before the place cap refused the post, so the cap stopped nothing. Every refusal is now
       checked before anything is kept, and what is kept stays until the door takes it or says it never will. */
    const mine = waiting.objects.filter((o) => o.key.startsWith(`${HELD_WAIT}${rec}/`));
    if (mine.length >= HELD_PER_RECORD) {
      op({ op: 'door', held: false, rec, why: 'record-full' }, 'error');
      return false;
    }
    if (mine.filter((o) => o.customMetadata?.['door'] === at.door).length >= HELD_PER_DOOR) {
      op({ op: 'door', held: false, rec, why: 'door-full' }, 'error');
      return false;
    }
    /* ONE PLACE, ONE RECORD (RD14): a gateway posting for many people fills only each person's own share. */
    if (mine.filter((o) => o.customMetadata?.['from'] === from).length >= HELD_PER_PLACE) {
      op({ op: 'door', held: false, rec, why: 'place-full' }, 'error');
      return false;
    }
    /* AND ONE PLACE, THE DEPLOYMENT (RE1): counted per record alone, one address filled the whole room across fifty
       records' signed doors. */
    if (waiting.objects.filter((o) => o.customMetadata?.['from'] === from).length >= HELD_PER_PLACE_MOST) {
      op({ op: 'door', held: false, rec, why: 'place-most' }, 'error');
      return false;
    }
    const envelope: Envelope = {
      url,
      headers: headers.filter(([k]) => !UNKEPT.has(k.toLowerCase())),
      body: base64(bytes),
      at: new Date(now).toISOString(),
      from,
      door: at.door,
      ...(at.signed ? { signed: true } : {}),
    };
    await bucket.put(key, await seal(deps.secret, utf8(JSON.stringify(envelope))), {
      customMetadata: ringing({ next: now + stepOf(0) * 1000, tries: 0, kept: now, from, door: at.door, signed: at.signed }),
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
  /* A DOOR THAT THREW RINGS AGAIN AS A 503 WOULD. It needs no Response to say so: this is a queue's consumer, nobody is
     waiting on an answer, and one built here would be an answer without `no-store`. */
  let answer: Response | null = null;
  try {
    answer = await serveIngest(again(envelope.url, envelope.headers, unbase64(envelope.body)), unlimited(deps.door()));
  } catch {
    /* Said as `status` below. */
  }
  const status = answer?.status ?? 503;
  if (status === 202) {
    await bucket.delete(message.held);
    const late = Math.round(((deps.now ?? Date.now)() - Date.parse(envelope.at)) / 1000);
    op({ op: 'door', delivered: true, rec, tries: message.tries + 1, late_s: Number.isFinite(late) ? late : null });
    return 'delivered';
  }
  if (status === 503 || status === 429) {
    const now = (deps.now ?? Date.now)();
    const kept = Date.parse(envelope.at);
    /* A WEEK IS LONG ENOUGH: a record that has refused every ring for seven days is not going to be reset back to health
       by the next one, and what it holds is the deployment's room for every other record's outage. */
    if (Number.isFinite(kept) && now - kept > HELD_OLDEST_MS) return giveUp(deps, bucket, message.held, sealed, rec, 'too-old');
    const tries = message.tries + 1;
    const after = Number(answer?.headers.get('retry-after') ?? '');
    const delay = Math.min(Math.max(1, Math.round(status === 429 && Number.isFinite(after) && after > 0 ? after : stepOf(tries))), 43_200);
    await deps.queue.send({ held: message.held, tries }, { delaySeconds: delay });
    /* THE OBJECT SAYS WHEN ITS NEXT RING IS DUE, so the sweep leaves a live chain alone. Put after the ring is queued:
       a put that fails costs at most one extra ring from the sweep, which the door's dedupe stores once.

       ONLY OVER THE OBJECT THIS RING READ (second review of 30 October, Q3): his two devices post the same text, so two
       chains ring one key, and a ring that got 503 while the other landed it and deleted the object put it back here,
       to ring for a week and end as a mail about nothing. The put holds only while the object is the one read (R2's
       `etagMatches`, which fails on an object deleted since); one gone or kept again since is left as it is, and the
       ring just queued finds it gone or rings the new one. A bucket that says no etag is read again first. */
    const meta = ringing({ next: now + delay * 1000, tries, kept: Number.isFinite(kept) ? kept : now, from: envelope.from, door: envelope.door, signed: envelope.signed });
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
    op({ op: 'door', waiting: true, rec, tries, status }, 'error');
    if (tries === HELD_TELL_AFTER) await deps.tell?.({ why: 'waiting', rec });
    return 'waiting';
  }
  /* ANY OTHER ANSWER IS THE DOOR SAYING IT NEVER WILL: gone (404), switched off (410), too big (413). */
  return giveUp(deps, bucket, message.held, sealed, rec, `status-${String(status)}`);
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
  /* AND A GIVEN-UP ARRIVAL PAST ITS THIRTY DAYS GOES, apart from the ringing, so a bucket that will not list does not stop
     the rings above. */
  try {
    const gone = await pruneGaveUp(bucket, now);
    if (gone > 0) op({ op: 'door', pruned: gone });
  } catch (e) {
    op({ op: 'door', pruned: false, error: e instanceof Error ? e.message : String(e) }, 'error');
  }
  return rung;
}

/**
 * Deletes every given-up arrival older than `HELD_GAVE_UP_MS`, across every page of the listing, and answers how many.
 * Their keys carry no metadata, so the age is when the object was written, which is when it was given up on.
 */
export async function pruneGaveUp(bucket: HeldBucket, now: number): Promise<number> {
  const old: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: HELD_GAVE_UP, ...(cursor === undefined ? {} : { cursor }) });
    for (const o of page.objects) if (now - o.uploaded.getTime() > HELD_GAVE_UP_MS) old.push(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  for (const key of old) await bucket.delete(key);
  return old.length;
}

/* ── the pieces ───────────────────────────────────────────────────────────── */

type Envelope = { url: string; headers: [string, string][]; body: string; at: string; from?: string; door?: string; signed?: boolean };

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
