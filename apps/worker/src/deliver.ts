/**
 * The other end of the outbox: the one place in the hosted product that talks to the world.
 *
 * THE RECORD MAKES NO OUTBOUND CALL, and this file is the reason that sentence is true rather than
 * aspirational. A record writes a row and rings a doorbell; the Worker leases the row, does the I/O
 * with its own bindings, and acks. Everything that needs a credential, a network, or a retry that
 * outlives a request happens here and nowhere below it.
 *
 * IT IMPORTS NOTHING FROM `cloudflare:`, for the same reason `alarm.ts` does not: the platform's
 * contribution is two functions, and everything that can be wrong — a kind nothing handles, a URL a
 * stranger supplied, a failure reported as a success — is in the lines below, and those run in a
 * bare Node process against an object literal.
 *
 * A FAILURE THROWS AND IS NEVER SWALLOWED. The retry ladder is the record's: `ackOutbox` walks it,
 * counts the attempt, and opens a suggestion at the ceiling. A deliverer that caught its own errors
 * and decided when to try again would be the second ladder `09-ALARMS` spends a paragraph
 * forbidding, and the two would disagree on the day it mattered.
 *
 * AND NOTHING IT LOGS CARRIES A PAYLOAD. A digest is somebody's overdue invoices and a webhook body
 * is whatever they put in it; an error line that quoted either has published it to wherever logs go.
 * The kind, the id and the message the transport gave are the whole of what is safe to say.
 */

import { grantAad, grantKey, openSealed } from '@braindog/host';
import type { LeasedSeal, OutboxKind, OutboxRow } from '@braindog/kernel';
import { fixOf, type Result } from '@braindog/ports';

import { unwrap, type KeyStore } from './keys.ts';
import { pushHeaders, type PushSend, type Vapid } from './vapid.ts';

/** One message as Email Service takes it: `to` is one address or up to fifty, and `from` is required. */
export type Mail = { from: string; to: string | string[]; subject: string; text: string };

/** The key a post names, opened, or the sentence that says why it was not. Never both, and the secret never logged. */
export type Opened = { ok: true; secret: Uint8Array } | { ok: false; why: string };

/** Open the key a leased `notify.webhook` names, under that job's lease and no other. */
export type OpenPostKey = (job: OutboxRow, grant: string) => Promise<Opened>;

/** What the platform contributes, and not one thing more. Every one is injected so every one can be faked. */
export type Transports = {
  /** Cloudflare's `send_email` binding, or anything with the same one method. */
  email?: ((message: Mail) => Promise<void>) | undefined;
  /**
   * The address notification mail is sent from: `MAIL_FROM`, else `AUTH_MAIL_FROM`, on a domain Email Service sends
   * for. Blank or absent, and no notification mail is sent, because Email Service refuses a message without one.
   */
  from?: string | undefined;
  /** `fetch`, narrowed to what a webhook needs: the address, the raw body, and the headers that go with it. */
  post?: ((url: string, body: string, headers: Record<string, string>) => Promise<{ ok: boolean; status: number }>) | undefined;
  /** How a named signing key is opened. Absent, and a post that names one is refused rather than sent bare. */
  open?: OpenPostKey | undefined;
  /**
   * Web Push: the VAPID pair as `vapidKeys` read it, the contact address the token names, the POST, and the endpoint
   * the leased job rings (`leasedTarget`). Absent when this deployment has no keys, and then `delivers` never leases a
   * push. A string in place of the pair is the sentence `vapidKeys` refused it with, and every push dead-letters with
   * that sentence rather than a 403.
   */
  push?: { vapid: Vapid | string; subject: string; send: PushSend; target: PushTargetOf } | undefined;
};

/**
 * The header a signed post carries: `sha256=` and the lower-case hex HMAC-SHA256 of the raw body, keyed by the secret.
 *
 * THE SHAPE THIS PRODUCT'S OWN INBOUND `verify: hmac_sha256` READS (`packages/host/src/ingest.ts` takes the prefix off
 * and compares hex), so one record can take another record's digest as a verified arrival. `49 §5.12` names it.
 */
export const SIGNATURE_HEADER = 'x-braindog-signature';

/** Email Service's own ceiling for `to`, `cc` and `bcc` together. More owners than this is a dead letter that says so. */
const MAX_RECIPIENTS = 50;

/**
 * What a delivered job hands back for its ack, for the one kind that has something to say: a push service that
 * answered 404 or 410 has no such subscription any more, and `51 §5` has the ack carry `{ gone: true }` so the record
 * drops the row. Every other delivery resolves with nothing.
 */
export type Delivered = { gone: true };

/** A deliverer as `pump` takes it: what the ack should carry, or nothing. */
export type Deliver = (job: OutboxRow) => Promise<Delivered | undefined>;

/** The kinds this host can actually deliver. A kind absent from it dead-letters with a sentence. */
export const DELIVERS: OutboxKind[] = ['notify.email', 'notify.webhook'];

/**
 * `DELIVERS`, plus `notify.push` when this deployment holds both VAPID halves.
 *
 * BOTH OR NEITHER, AND NEITHER IS TODAY. The public key is a var declared empty in `wrangler.jsonc` and the private
 * key is a secret he puts in by hand, so for a while one will be set without the other. Leasing a push then would walk
 * each one up the ladder to a dead letter; not leasing it leaves the row `pending`, which is what an unkeyed deployment
 * has always done with a push, and it goes the day the second half is set. Whether the two halves are a pair is
 * `vapidKeys`' question, asked when a push is delivered, because this answer is read on every pass and costs nothing.
 */
export function delivers(env: { VAPID_PUBLIC?: string | undefined; VAPID_PRIVATE?: string | undefined }): OutboxKind[] {
  const keyed = (env.VAPID_PUBLIC ?? '').trim() !== '' && (env.VAPID_PRIVATE ?? '').trim() !== '';
  return keyed ? [...DELIVERS, 'notify.push'] : DELIVERS;
}

/**
 * A URL a webhook may be posted to.
 *
 * HTTPS AND A PUBLIC HOST. The URL comes out of a declaration somebody wrote, and a declaration is
 * data — so `http://` would send a customer's digest in the clear, and `http://169.254.169.254/`
 * would ask this Worker to fetch the platform's own metadata service and post the answer somewhere.
 * That is server-side request forgery through a feature, and the check belongs where the request is
 * made rather than where the declaration is read.
 */
export function postable(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  /* THE TRAILING DOT IS THE SAME NAME. `localhost.` and `metadata.google.internal.` are the fully
     qualified forms of the two names this function exists to block, and a string compare that did
     not strip it blocked neither. */
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return null;
  /* The literal forms of "this machine" and "the network next door". A name that RESOLVES to one of
     these is not caught here and cannot be: the platform's own egress rules are the layer for that,
     and pretending otherwise would be a check that reads as a guarantee. */
  if (/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return null;
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return null;
  /* AND AN IPv6 LITERAL IS NORMALISED BEFORE IT IS COMPARED. `[::ffff:127.0.0.1]` reaches loopback
     and is not the string `[::1]`; `[::]` routes there on most stacks. Any literal that is
     unspecified, loopback, or a v4-mapped address goes nowhere. */
  if (host.startsWith('[')) {
    const inner = host.slice(1, -1);
    if (inner === '::1' || inner === '::' || inner === '') return null;
    const mapped = /^::ffff:([0-9a-f:.]+)$/.exec(inner)?.[1];
    if (mapped) return null;
    /* Link-local `fe80::/10` and the retired site-local `fec0::/10` together are `fe80::/9`, and `fc00::/7` is unique-local. */
    if (/^(?:fe[89a-f][0-9a-f]:|fc|fd)/.test(inner)) return null;
  }
  return url.toString();
}

/** A field out of a payload, or `null` — never a throw, because a bad payload is a dead letter. */
const read = (payload: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Who a `notify.email` goes to: one address, or a list of them, or `null` for nobody.
 *
 * THE KERNEL WRITES A LIST. `digest.ts` queues `to: deps.owners()` and so does an urgent notice, and this read a
 * string: every digest email it was ever handed came out as `''` and dead-lettered as having no recipient. A list
 * with a blank or a non-string in it is refused whole, because mailing the rest would be a guess about who was meant.
 */
const recipients = (v: unknown): string | string[] | null => {
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.every((to): to is string => typeof to === 'string' && to.trim() !== '') ? v : null;
};

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** `sha256=<hex>` over exactly these bytes. The body is signed as it is sent, and never re-serialised first. */
async function signed(secret: Uint8Array, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `sha256=${hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))}`;
}

const b64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/**
 * The record's half of opening a post's key: which record it is, and the seal its lease earned. Over RPC on the
 * Worker, as `Record$.sealFor`, because the record holds the lease and the vault and the Worker holds the KEK.
 */
export type SealAsk = (args: { outbox: string; leasedUntil: string; grant: string }) => Promise<Result<{ record: string; seal: LeasedSeal }>>;

/**
 * An opener over the record's `sealedGrant` and this host's key store.
 *
 * THE LEASE IS THE AUTHORITY, not the Worker's say-so. The record checks that the job is still leased to this holder
 * and that its payload names this key, and only then hands back sealed bytes; the Worker unwraps them with the KEK the
 * record never sees (ADR-062). The store is asked for lazily, because a malformed `KEK` throws, and a throw at the top
 * of `drainOutbox` would stop every email in the pass for the sake of one signed post.
 */
export function leasedOpener(ask: SealAsk, store: () => Promise<KeyStore | null>): OpenPostKey {
  return async (job, grant) => {
    const keys = await store();
    if (!keys) return { ok: false, why: 'This deployment has no key store, so no signing key can be opened.' };
    const out = await ask({ outbox: job.id, leasedUntil: job.leasedUntil, grant });
    if (!out.ok) return { ok: false, why: fixOf(out) };
    const { record, seal } = out.value;
    const dek = await unwrap(keys, record, seal.dek.purpose, {
      wrapped: b64(seal.dek.wrapped),
      nonce: b64(seal.dek.nonce),
      kek_id: seal.dek.kek_id,
      wrapped_by: 'kek',
    });
    if (!dek) return { ok: false, why: `The key "${grant}" is wrapped by a root key this deployment does not hold.` };
    try {
      const plain = await openSealed(
        await grantKey(dek, seal.grant.grant_id),
        b64(seal.grant.nonce),
        grantAad(record, seal.grant.grant_id, String(seal.grant.version)),
        b64(seal.grant.ciphertext),
      );
      /* A FAILED DECRYPT SAYS ONE THING, as `sealing.ts` says: which of a wrong key, a wrong AAD or a tampered tag it
         was is information about the key hierarchy that the reader of a dead letter has no use for. */
      return plain ? { ok: true, secret: plain } : { ok: false, why: `The key "${grant}" did not open.` };
    } finally {
      dek.fill(0);
    }
  };
}

/**
 * The record's half of addressing a push: the endpoint behind the subscription a leased job names, or `null` when its
 * person has since unsubscribed. Over RPC on the Worker, as `Record$.pushTargetFor`, because the record holds the lease
 * and `push_sub`, and the endpoint never travels in the job (`packages/kernel/src/push.ts`).
 */
export type PushTargetAsk = (args: { outbox: string; leasedUntil: string }) => Promise<Result<{ id: string; endpoint: string } | null>>;

/** The endpoint one leased push rings, or `null` for nobody. A refusal throws its sentence, which is the dead letter's. */
export type PushTargetOf = (job: OutboxRow) => Promise<string | null>;

/**
 * An addresser over the record's `pushTarget`, which checks the lease as `sealedGrant` checks it for a key.
 *
 * THE REFUSAL IS A FAILURE AND NOT A SKIP. A lease that lapsed while the Worker held it, or one another pass has since
 * taken, is a job somebody else may be sending right now, so it is acked as failed and the fence in `ackOutbox` decides
 * whether that answer still counts. A skip acked `done` would close a job this pass did not send.
 */
export function leasedTarget(ask: PushTargetAsk): PushTargetOf {
  return async (job) => {
    const out = await ask({ outbox: job.id, leasedUntil: job.leasedUntil });
    if (!out.ok) throw new Error(fixOf(out));
    return out.value?.endpoint ?? null;
  };
}

/**
 * The deliverer `pump` takes: each kind this host serves, with what its ack should carry.
 *
 * ONE KIND HAS SOMETHING TO SAY, and `pump` passes it to `ackOutbox` as `result`: a push the service answered 404 or 410
 * for comes back `{ gone: true }`, and the record deletes that subscription in the ack's transaction. Every other kind
 * resolves with nothing, and its ack is the plain `done` it always was.
 */
export function makeDeliver(transports: Transports): Deliver {
  return async (job: OutboxRow): Promise<Delivered | undefined> => {
    const payload = read(job.payload);
    /* A PAYLOAD THIS HOST CANNOT READ IS A DEAD LETTER, not a crash and not a silent success. It
       walks the ladder like any other failure and ends as a suggestion somebody can answer. */
    if (!payload) throw new Error(`a ${job.kind} payload this host cannot read`);

    if (job.kind === 'notify.email') {
      if (!transports.email) throw new Error('this deployment has no email transport');
      /* NO SENDER, NO SEND. Measured at afb3b1b2, the message went to `EMAIL.send` with no `from`, which Email Service
         refuses as `E_FIELD_MISSING`, so the sentence here is the one that names the repair. */
      const from = (transports.from ?? '').trim();
      if (from === '')
        throw new Error('this deployment has no sender for notification mail: set MAIL_FROM to an address on a domain Email Service sends for');
      const to = recipients(payload.to);
      const subject = text(payload.subject);
      if (!to || !subject) throw new Error('a notify.email needs a recipient and a subject');
      if (Array.isArray(to) && to.length > MAX_RECIPIENTS)
        throw new Error(`a notify.email goes to at most ${MAX_RECIPIENTS} addresses, and this one names ${to.length}`);
      await transports.email({ from, to, subject, text: text(payload.text) });
      return;
    }

    if (job.kind === 'notify.webhook') {
      if (!transports.post) throw new Error('this deployment has no outbound http');
      const url = postable(text(payload.url));
      if (!url) throw new Error('a webhook goes to an https address on a public host');
      const body = text(payload.body);
      const headers: Record<string, string> = {};
      /* A NAMED KEY SIGNS THE POST OR NOTHING IS POSTED. A key that is gone, revoked, wrapped by a root key this
         deployment lacks, or behind an opener that threw is a dead letter with the reason in it; posting the body bare
         would hand the owner's rows to a receiver that was promised a signature. A payload that names no key is a
         declaration that chose an unsigned post (`webhook.grant` is optional, `09 §6`), and it goes as it always did. */
      const grant = text(payload.grant);
      if (grant !== '') {
        if (!transports.open) throw new Error(`this deployment cannot open the key "${grant}" that signs this post, so nothing was posted`);
        let opened: Opened;
        try {
          opened = await transports.open(job, grant);
        } catch (e) {
          opened = { ok: false, why: e instanceof Error ? e.message : String(e) };
        }
        if (!opened.ok) {
          /* THE REFUSAL SENTENCE ALONE REACHES THE ERROR, taken out by name so no path from the secret to a message exists. */
          const why = opened.why;
          throw new Error(`${why} So nothing was posted.`);
        }
        try {
          headers[SIGNATURE_HEADER] = await signed(opened.secret, body);
        } finally {
          opened.secret.fill(0);
        }
      }
      const out = await transports.post(url, body, headers);
      /* THE STATUS IS THE ANSWER. A deliverer that treated 500 as delivered would ack a job that
         never arrived, and the row would be `done` for ever with nothing on the other end. */
      if (!out.ok) throw new Error(`the endpoint answered ${out.status}`);
      return;
    }

    if (job.kind === 'notify.push') {
      if (!transports.push) throw new Error('this deployment has no VAPID keys, so it sends no push: set VAPID_PUBLIC and VAPID_PRIVATE');
      const { vapid, subject, send, target } = transports.push;
      if (typeof vapid === 'string') throw new Error(vapid);
      /* ONE SUBSCRIPTION PER JOB, NAMED BY ID (`51 §5`, `payload.sub`), because the ack says whether THAT phone is gone.
         The job carries the id and never the endpoint: the outbox travels in every `.brain` file and `push_sub` does
         not, so the address is asked of the record under this job's lease. W58-3 read `sub.endpoint` here while W58-2's
         kernel wrote `sub.id`, and every push the kernel queued dead-lettered as an address that was not https
         (`test/push-deliver.test.ts`, measured before this line). */
      const sub = payload.sub;
      /* A PAYLOAD WITH NO `sub` AT ALL IS ONE AN OLDER BUILD QUEUED, `{ title, url }`, and records already hold them:
         they sat `pending` because nothing leased a push. The kernel reads one as nobody to ring (`pushSubOf`), and so
         does this. It threw here at first, and `test/push-deliver.test.ts` measured `failed: 1` for one such row, which
         at the eighth attempt is a "could not be delivered" item in Decide for each of them on the day the keys are set.
         A `sub` that is there and names no id is not that, and stays the dead letter below. */
      if (sub === undefined) return;
      const id = sub && typeof sub === 'object' ? text((sub as Record<string, unknown>).id) : '';
      if (id === '') throw new Error('a notify.push names the subscription it rings, by id, and this one names none');
      /* NOBODY LEFT TO RING IS DELIVERED. The person unsubscribed, or was erased, after the job was queued. */
      const address = await target(job);
      if (address === null) return;
      /* The endpoint was written by a browser and stored by the record, so it is data somebody else supplied, and it
         goes through the same `postable()` as a webhook: a push to the metadata service is still a request to it. */
      const endpoint = postable(address);
      if (!endpoint) throw new Error('a push goes to an https address on a public host');
      /* NOTHING FROM THE PAYLOAD BUT THE ID, AND NOTHING FROM THE RECORD BUT THE ADDRESS: the push has no body (`vapid.ts`). */
      const { status } = await send(endpoint, await pushHeaders(vapid, endpoint, subject));
      if (status >= 200 && status < 300) return;
      /* 404 AND 410 ARE THE SERVICE SAYING THE SUBSCRIPTION IS GONE (RFC 8030 §7.3): the app was removed, the
         permission revoked, the browser reset. Retrying that eight times is eight requests to be told the same, so it
         is delivered, with the one fact the record needs to stop asking. A 403, a 429 or a 5xx says nothing about the
         phone and fails as any other post does. */
      if (status === 404 || status === 410) return { gone: true };
      throw new Error(`the push service answered ${status}`);
    }

    /* NOTHING HERE DELIVERS THIS KIND, said out loud. Silently acking it would make the outbox
       claim the work was done; retrying it eight times would be eight hours of pretending. The
       ladder's ceiling opens a suggestion, and the sentence names the kind. */
    throw new Error(`nothing in this deployment delivers a ${job.kind}`);
  };
}
