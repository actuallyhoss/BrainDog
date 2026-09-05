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

import type { OutboxKind, OutboxRow } from '@braindog/kernel';

/** What the platform contributes, and not one thing more. Both are injected so both can be faked. */
export type Transports = {
  /** Cloudflare's `send_email` binding, or anything with the same one method. */
  email?: ((message: { to: string; subject: string; text: string }) => Promise<void>) | undefined;
  /** `fetch`, narrowed to what a webhook needs. */
  post?: ((url: string, body: string) => Promise<{ ok: boolean; status: number }>) | undefined;
};

export type Deliver = (job: OutboxRow) => Promise<void>;

/** The kinds this host can actually deliver. A kind absent from it dead-letters with a sentence. */
export const DELIVERS: OutboxKind[] = ['notify.email', 'notify.webhook'];

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
    if (/^(?:fe80|fc|fd)/.test(inner)) return null;
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

export function makeDeliver(transports: Transports): Deliver {
  return async (job: OutboxRow): Promise<void> => {
    const payload = read(job.payload);
    /* A PAYLOAD THIS HOST CANNOT READ IS A DEAD LETTER, not a crash and not a silent success. It
       walks the ladder like any other failure and ends as a suggestion somebody can answer. */
    if (!payload) throw new Error(`a ${job.kind} payload this host cannot read`);

    if (job.kind === 'notify.email') {
      if (!transports.email) throw new Error('this deployment has no email transport');
      const to = text(payload.to);
      const subject = text(payload.subject);
      if (!to || !subject) throw new Error('a notify.email needs a recipient and a subject');
      await transports.email({ to, subject, text: text(payload.text) });
      return;
    }

    if (job.kind === 'notify.webhook') {
      if (!transports.post) throw new Error('this deployment has no outbound http');
      const url = postable(text(payload.url));
      if (!url) throw new Error('a webhook goes to an https address on a public host');
      const out = await transports.post(url, text(payload.body));
      /* THE STATUS IS THE ANSWER. A deliverer that treated 500 as delivered would ack a job that
         never arrived, and the row would be `done` for ever with nothing on the other end. */
      if (!out.ok) throw new Error(`the endpoint answered ${out.status}`);
      return;
    }

    /* NOTHING HERE DELIVERS THIS KIND, said out loud. Silently acking it would make the outbox
       claim the work was done; retrying it eight times would be eight hours of pretending. The
       ladder's ceiling opens a suggestion, and the sentence names the kind. */
    throw new Error(`nothing in this deployment delivers a ${job.kind}`);
  };
}
