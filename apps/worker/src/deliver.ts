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
 * counts the attempt, and raises a fault at the ceiling. A deliverer that caught its own errors
 * and decided when to try again would be the second ladder `09-ALARMS` spends a paragraph
 * forbidding, and the two would disagree on the day it mattered.
 *
 * AND NOTHING IT LOGS CARRIES A PAYLOAD. A digest is somebody's overdue invoices and a webhook body
 * is whatever they put in it; an error line that quoted either has published it to wherever logs go.
 * The kind, the id and the message the transport gave are the whole of what is safe to say.
 */

import { grantAad, grantKey, openSealed } from '@braindog/host';
import { refusedHost } from '@braindog/host/actions';
import type { LeasedSeal, OutboxKind, OutboxRow } from '@braindog/kernel';
import { fixOf, type Result } from '@braindog/ports';

import { unwrap, type KeyStore } from './keys.ts';
import { SENDER_NAME, recordLetter } from './mail.ts';
import { PUSH_BODY_HEADERS, encryptPush, pushHeaders, type PushSend, type Vapid } from './vapid.ts';
import { apnsKeyed, apnsPayload, isApns, sendApns, type Apns, type ApnsSend } from './apns.ts';

/**
 * One message as Email Service takes it: `to` is one address or up to fifty, and `from` is required. The text and the
 * HTML say the same thing, drawn by `recordLetter` in the page every BrainDog mail wears.
 */
export type Mail = { from: { email: string; name: string }; to: string | string[]; subject: string; text: string; html: string };

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
  /** Where a reader may write with a question, named in the mail's footer: `SUPPORT_ADDRESS`. Blank, and it names none. */
  support?: string | undefined;
  /**
   * Where this record opens in the app, `https://<PUBLIC_HOST>/<slug>`, asked only when a mail is sent: the start of a
   * notice's button and of the footer's Notification settings. Absent or `null`, and the mail has neither.
   */
  app?: (() => Promise<string | null>) | undefined;
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
  /**
   * APNs, for the iPhone app's rows in `push_sub` (`apns://…`, `apns.ts`): the key as `apnsKeys` read it, the POST, and
   * the same addresser as Web Push. Absent when this deployment has no APNs key, and then a phone's push is passed over
   * (sent nothing, counted nothing) rather than walked to a dead letter; a browser's push is unaffected either way.
   */
  apns?: { key: Apns | string; send: ApnsSend; target: PushTargetOf } | undefined;
  /**
   * Counts one job this host sent, in the account's ledger and never against its allowance: `Record$.countDelivery` on
   * the Worker. Asked only once a send has succeeded; absent, nothing is counted.
   */
  counted?: ((job: OutboxRow) => Promise<unknown>) | undefined;
  /**
   * Deletes one of this record's files by its SHA-256, for an `erase.r2` job: `BLOBS.delete(fileKey(record, sha256))`
   * on the Worker (`files.ts`). Absent when the deployment has no bucket, and then an erasure dead-letters saying so,
   * because a file an erasure named and nobody deleted is exactly what must not pass as done. `page` names a visual's
   * page instead, kept beside the files under `pages/`.
   */
  erase?: ((sha256: string, page?: boolean) => Promise<void>) | undefined;
};

/**
 * A job that was sent, counted.
 *
 * AFTER THE SEND AND NEVER INSTEAD OF IT, AND IT NEVER THROWS. The job was sent, so a count that failed must not fail the
 * job: the ladder would send it again, and the person would get the same mail twice for the sake of a number. A job
 * that sent nothing (a push whose subscription is gone, a person who unsubscribed) is not counted, because counting it
 * would say something was delivered that was not. The line names the kind and the id and nothing of the payload.
 */
async function count(transports: Transports, job: OutboxRow): Promise<void> {
  if (!transports.counted) return;
  try {
    await transports.counted(job);
  } catch (e) {
    console.error(`deliveries: ${job.kind} ${job.id} was sent and not counted: ${e instanceof Error ? e.message : String(e)}`);
  }
}

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

/**
 * The kinds this host can actually deliver. A kind absent from it dead-letters with a sentence.
 *
 * `erase.r2` IS ONE SINCE THE FILE STORE: an erasure queues one row per file its subject's rows held
 * (`kernel/src/erase.ts`), and before this the rows sat `pending` for ever while the nightly walk put them back, so the
 * bytes of an erased person's receipt stayed in the bucket.
 */
export const DELIVERS: OutboxKind[] = ['notify.email', 'notify.webhook', 'erase.r2'];

/**
 * `DELIVERS`, plus `notify.push` when this deployment holds both VAPID halves.
 *
 * BOTH OR NEITHER, AND NEITHER IS TODAY. The public key is a var declared empty in `wrangler.jsonc` and the private
 * key is a secret he puts in by hand, so for a while one will be set without the other. Leasing a push then would walk
 * each one up the ladder to a dead letter; not leasing it leaves the row `pending`, which is what an unkeyed deployment
 * has always done with a push, and it goes the day the second half is set. Whether the two halves are a pair is
 * `vapidKeys`' question, asked when a push is delivered, because this answer is read on every pass and costs nothing.
 */
export function delivers(env: {
  VAPID_PUBLIC?: string | undefined;
  VAPID_PRIVATE?: string | undefined;
  APNS_KEY_ID?: string | undefined;
  APNS_TEAM_ID?: string | undefined;
  APNS_KEY?: string | undefined;
}): OutboxKind[] {
  /* OR AN APNs KEY (apps plan M4): a deployment that rings only iPhones leases a push too. Whichever half a row needs and
     this deployment lacks, that row is passed over in `makeDeliver`, never dead-lettered. */
  const keyed = ((env.VAPID_PUBLIC ?? '').trim() !== '' && (env.VAPID_PRIVATE ?? '').trim() !== '') || apnsKeyed(env);
  return keyed ? [...DELIVERS, 'notify.push'] : DELIVERS;
}

/**
 * What a record on this deployment is told it can have delivered: `delivers`, and `infer.prose` where a model answers it.
 *
 * `delivers` IS WHAT `pump` LEASES AND THIS IS WHAT THE RECORD QUEUES FOR, and for one kind the two differ. A digest
 * declaring `prose: slash` queues its `infer.prose` row only when the record's list names that kind
 * (`packages/kernel/src/digest.ts`), and otherwise goes at once as figures; but `makeDeliver` has no branch that asks a
 * model, so the pump must never lease one, or every digest would walk the ladder on "nothing in this deployment
 * delivers a infer.prose". The row is served by the alarm's model pass instead (`serveModelJobs`,
 * `packages/host/src/model-jobs.ts`), which leases it by kind, so a Worker with a model hands this list to the record and
 * keeps `delivers` for the pump. The row is queued by the alarm's own drain and served by the same alarm's model pass,
 * so the bell it rings in between is one.
 *
 * `infer.draft` IS NOT HERE AND NEED NOT BE: the kernel queues a draft whatever the list says, and the list only rings
 * the doorbell, which would buy a pump pass that leases nothing for every write while a draft waited on the alarm.
 * `answered` is whether this Worker has a model at all, the fact `/api/version`'s `slash` reads.
 */
export function recordDelivers(env: { VAPID_PUBLIC?: string | undefined; VAPID_PRIVATE?: string | undefined }, answered: boolean): OutboxKind[] {
  return answered ? [...delivers(env), 'infer.prose'] : delivers(env);
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

  /* ONE LIST OF WHAT IS PRIVATE, THE ONE EVERY OTHER SEND HOLDS (`refusedHost`). This kept a copy that had fallen behind:
     carrier-grade NAT, where Alibaba's metadata service answers at 100.100.100.200, a metadata address carried inside IPv6
     as NAT64 `[64:ff9b::a9fe:a9fe]`, 6to4 `[2002:a9fe:a9fe::]` or compatible `[::a9fe:a9fe]`, multicast and the reserved
     ranges all passed it. A name that RESOLVES to one of these is not caught here and cannot be: the platform's egress
     rules are the layer for that, and pretending otherwise would be a check that reads as a guarantee. */
  if (refusedHost(url) !== null) return null;
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
 * Worker, as `Record$.sealFor`, because the record holds the lease and the keychain and the Worker holds the KEK.
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
export type PushTargetAsk = (args: { outbox: string; leasedUntil: string }) => Promise<Result<PushAddress | null>>;

/**
 * What a push carries to the phone, encrypted to it: where a tap opens and, when the record named one, the kind of thing
 * it is, one lower-case word (`PUSH_KINDS` in the kernel), so the phone can say "An agent is asking you something".
 */
const bodyOf = (open: string, kind: string | undefined): { open: string; kind?: string } => (kind && /^[a-z]{1,16}$/u.test(kind) ? { open, kind } : { open });

/** One subscription as the record hands it under the lease, and, where the job names one, the app path a tap opens. */
export type PushAddress = { id: string; endpoint: string; open?: string; kind?: string; keys?: { p256dh: string; auth: string } };

/** The address one leased push rings, or `null` for nobody. A refusal throws its sentence, which is the dead letter's. */
export type PushTargetOf = (job: OutboxRow) => Promise<PushAddress | null>;

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
    return out.value ?? null;
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
      /* THE RECORD'S WORDS, DRAWN IN THE HOUSE LETTER: its block dialect as headings, figures and rows in the HTML, and
         as plain lines in the text, each with the footer that says what the mail is. */
      /* AND WHAT IT OPENS: the row's page in the app, the row's own link elsewhere, and the record's Notification
         settings. The record names the row by its path (`/r/<list>/<n>`) and never by an address, so the host is this
         deployment's own. A base that cannot be asked is a mail without the button, never a mail not sent. */
      let base: string | null = null;
      try {
        base = transports.app ? await transports.app() : null;
      } catch {
        base = null;
      }
      const path = text(payload.open);
      const letter = recordLetter(subject, text(payload.text), text(payload.because), transports.support ?? '', {
        ...(base && /^\/r\/[a-z0-9_]{1,64}\/\d{1,12}$/u.test(path) ? { open: `${base}${path}` } : {}),
        ...(text(payload.link) ? { link: text(payload.link), linkLabel: text(payload.link_label) } : {}),
        ...(base ? { settings: `${base}/settings/notifications` } : {}),
      });
      await transports.email({ from: { email: from, name: SENDER_NAME }, to, subject: letter.subject, text: letter.text, html: letter.html });
      await count(transports, job);
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
      await count(transports, job);
      return;
    }

    if (job.kind === 'notify.push') {
      if (!transports.push && !transports.apns) throw new Error('this deployment has no VAPID keys, so it sends no push: set VAPID_PUBLIC and VAPID_PRIVATE');
      const target = (transports.push ?? transports.apns)!.target;
      /* ONE SUBSCRIPTION PER JOB, NAMED BY ID (`51 §5`, `payload.sub`), because the ack says whether THAT phone is gone.
         The job carries the id and never the endpoint: the outbox travels in every `.brain` file and `push_sub` does
         not, so the address is asked of the record under this job's lease. This line once read `sub.endpoint` while the
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
      const found = await target(job);
      if (found === null) return;
      const address = found.endpoint;
      /* AN iPHONE'S TOKEN GOES TO APPLE (`apns.ts`): the fixed line for its kind, where a tap opens, and the BrainDog as
         the thread, which is the record's name in the app's address and nothing it holds. No APNs key here, and the
         phone is passed over: nothing was sent, so nothing is counted and nothing is dead-lettered. */
      if (isApns(address)) {
        if (!transports.apns) {
          console.warn(`deliveries: ${job.id} rings an iPhone and this deployment has no APNs key (APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY)`);
          return;
        }
        const { key } = transports.apns;
        if (typeof key === 'string') throw new Error(key);
        const open = found.open && /^\/[a-z0-9][a-z0-9-]{0,63}(\/[A-Za-z0-9_/-]{0,200})?$/u.test(found.open) ? found.open : null;
        let record: string | null = null;
        try {
          const base = transports.app ? await transports.app() : null;
          record = base ? (new URL(base).pathname.split('/').filter(Boolean)[0] ?? null) : null;
        } catch {
          record = null;
        }
        const sent = await sendApns(key, transports.apns.send, address, apnsPayload({ open, kind: found.kind, record }));
        if (sent === 'gone') return { gone: true };
        await count(transports, job);
        return;
      }
      if (!transports.push) {
        console.warn(`deliveries: ${job.id} rings a browser and this deployment has no VAPID keys`);
        return;
      }
      const { vapid, subject, send } = transports.push;
      if (typeof vapid === 'string') throw new Error(vapid);
      /* The endpoint was written by a browser and stored by the record, so it is data somebody else supplied, and it
         goes through the same `postable()` as a webhook: a push to the metadata service is still a request to it. */
      const endpoint = postable(address);
      if (!endpoint) throw new Error('a push goes to an https address on a public host');
      /* NOTHING FROM THE PAYLOAD BUT THE ID, AND NOTHING FROM THE RECORD BUT THE ADDRESS, AND WHERE A TAP OPENS: an
         app path the record checked (`pushOpenOf`), encrypted to the phone's keys. A job that names none has no body. */
      const headers = await pushHeaders(vapid, endpoint, subject);
      const open = found.open && found.keys && /^\/[a-z0-9][a-z0-9-]{0,63}\/[A-Za-z0-9_/-]{0,200}$/u.test(found.open) ? found.open : null;
      const { status } =
        open && found.keys
          ? await send(endpoint, { ...headers, ...PUSH_BODY_HEADERS }, await encryptPush(found.keys, new TextEncoder().encode(JSON.stringify(bodyOf(open, found.kind)))))
          : await send(endpoint, headers);
      if (status >= 200 && status < 300) {
        await count(transports, job);
        return;
      }
      /* 404 AND 410 ARE THE SERVICE SAYING THE SUBSCRIPTION IS GONE (RFC 8030 §7.3): the app was removed, the
         permission revoked, the browser reset. Retrying that eight times is eight requests to be told the same, so it
         is delivered, with the one fact the record needs to stop asking. A 403, a 429 or a 5xx says nothing about the
         phone and fails as any other post does. */
      if (status === 404 || status === 410) return { gone: true };
      throw new Error(`the push service answered ${status}`);
    }

    /* AN ERASURE'S FILE, DELETED BY ITS HASH (`kernel/src/erase.ts` queues `{ erase, key }`, the key being the file's
       SHA-256). The key is checked before it reaches the bucket, because it becomes part of an object's name and a key
       that is not a hash could name something that is not a file. R2 takes a delete of a key it does not hold without
       complaint, which is right here: a file already gone is a file erased, and the nightly walk checks the bucket
       itself (`nightly.ts` `reconcileErase`). Not counted: an erasure is not a delivery anybody is billed for. */
    if (job.kind === 'erase.r2') {
      if (!transports.erase) throw new Error('this deployment has no bucket to delete the file from: bind BLOBS');
      const key = text(payload.key);
      if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('an erase.r2 names the file it deletes by its SHA-256, and this one does not');
      await transports.erase(key, payload.page === true);
      return;
    }

    /* NOTHING HERE DELIVERS THIS KIND, said out loud. Silently acking it would make the outbox
       claim the work was done; retrying it eight times would be eight hours of pretending. The
       ladder's ceiling raises a fault, and the sentence names the kind. */
    throw new Error(`nothing in this deployment delivers a ${job.kind}`);
  };
}
