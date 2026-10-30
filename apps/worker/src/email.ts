/**
 * Mail sent to a record's mailbox on the Cloud: the Worker's `email()` handler.
 *
 * THE SAME DOOR AS A FORWARDER'S POST, AND NOT A SECOND ONE. A self-host has no MX and takes a message over
 * `POST /in/email/<token>` (`49 §13` #3); the Cloud has Email Routing, which hands this Worker the message itself.
 * Both end in `serveIngest`, so the budget, the size ceiling, the token lookup, the MIME reading, the attachments and
 * the record's `arrive` are one code path, and a message the Cloud takes is stored exactly as the same bytes posted
 * would be. The token is the mailbox's local part: `<token>@<the mail domain>` is the address, where the HTTP door's
 * is `https://<host>/in/email/<token>`.
 *
 * THE ONE THING THIS FILE ADDS IS A VERDICT, AND IT HAS TO. Email Routing writes no `Authentication-Results` into what
 * it hands a Worker (measured by others and filed as cloudflare/workerd#6740: no `Authentication-Results`, no
 * `Received-SPF`, and an `ARC-Authentication-Results` with no verdicts in it), so any such line in a message arriving
 * here is one the SENDER typed, and `dkim=pass header.d=hsbc.example` costs a forger one line. So the DKIM signatures
 * are checked here (`packages/host/src/dkim.ts`), against keys looked up in DNS, and the answer is handed to the mail
 * path beside the bytes. Nothing a sender wrote is ever read as a verdict. The Cloud's `POST /in/email/<token>` is
 * handed no verdict and no way to make one, so mail posted there is stored unverified and no pattern files it (SEC1).
 *
 * DKIM AND NOT SPF, because the Worker is not told the connecting address SPF is a question about. That is the same
 * outcome the self-host reaches for forwarded mail by another road (`forwarderPassed` in `packages/host/src/ingest.ts`):
 * a message is believed when a domain aligned with its `From:` signed it.
 *
 * NOTHING HERE LOGS, for the reason `ingest.ts` gives: the sender is a stranger, and the mailbox's local part is the
 * record's secret.
 */

import { EMAIL_LIMIT, serveIngest, verdictValue, type IngestDoor, type TxtLookup } from '@braindog/host';

import { bodyUpTo, FILE_MOST, fileKey, sha256Of, sniff, type FileBucket } from './files.ts';

/**
 * Room kept under the mail ceiling for this host's own line. Five verdicts, each a domain of at most 253 characters and
 * a selector of at most 253, fit inside it, so a message that fits here always fits the mail path's own count.
 */
const STAMP_ROOM = 4_096;

/** The largest message this handler reads. Anything larger is refused before a byte of it is read. */
export const MAIL_MOST = EMAIL_LIMIT - STAMP_ROOM;

export type { TxtLookup };

/**
 * WHAT TAKING A MESSAGE USES OF Email Routing's own: the part of `ForwardableEmailMessage` read here, written out so this
 * module is checked under Node's types with its tests (the Worker's `index.ts` hands over the whole object).
 */
export interface InboundMail {
  readonly to: string;
  readonly rawSize: number;
  readonly raw: ReadableStream<Uint8Array>;
  setReject(reason: string): void;
}

/**
 * Take one message from Email Routing into the record its address names.
 *
 * WHAT THE SENDER HEARS IS THE MAIL PATH'S ANSWER IN SMTP'S WORDS. A stored message is accepted. A mailbox nobody
 * minted, or one that was revoked, is refused permanently, in the same words either way, as the HTTP door answers both
 * 404. A message over the ceiling is refused permanently. A spent budget or a record that could not store it throws,
 * which fails the delivery rather than accepting it, so the message is not taken and then lost.
 */
export async function takeMail(message: InboundMail, door: IngestDoor, lookup: TxtLookup = dohTxt, now: () => number = Date.now): Promise<void> {
  const token = tokenOf(message.to);
  if (token === null) {
    message.setReject('There is no mailbox at this address.');
    return;
  }
  if (message.rawSize > MAIL_MOST) {
    message.setReject('This message is larger than a record takes. The most is 5 MB, attachments included.');
    return;
  }
  const raw = await bodyUpTo(message.raw, MAIL_MOST);
  if (raw === null) {
    message.setReject('This message is larger than a record takes. The most is 5 MB, attachments included.');
    return;
  }
  /* THE VERDICT GOES TO THE MAIL PATH BESIDE THE BYTES AND NOT INSIDE THEM (SEC1). It is still written on top of the
     message, so a person reading the row sees what this host found, but what decides `verified` is the value handed to
     `serveIngest` here, in this process, where no sender can reach. A line in the bytes is a line anyone could have
     typed, the same line `POST /in/email/<token>` takes from a stranger, and a message that began with a folded line
     would have run on into this one. */
  const said = await verdictValue(raw, lookup, Math.floor(now() / 1000));
  const stamp = new TextEncoder().encode(`Authentication-Results: ${said}\r\n`);
  const bytes = new Uint8Array(stamp.byteLength + raw.byteLength);
  bytes.set(stamp, 0);
  bytes.set(raw, stamp.byteLength);

  /* THE ORIGIN IS NEVER READ: `serveIngest` routes on the path alone, and the mail path reads no request header. */
  const asked = new Request(`https://mail.invalid/in/email/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'message/rfc822' },
    body: bytes,
  });
  const answer = await serveIngest(asked, door, { verdict: said });
  if (answer.status === 202) return;
  if (answer.status === 404) {
    message.setReject('There is no mailbox at this address.');
    return;
  }
  if (answer.status === 413) {
    message.setReject('This message is larger than a record takes. The most is 5 MB, attachments included.');
    return;
  }
  throw new Error(`The record could not take this message now (${answer.status}), so it was not accepted.`);
}

/**
 * The mailbox token out of an envelope recipient, or `null` for one that cannot be a token.
 *
 * A `+tag` IS DROPPED, so `<token>+bank@...` reaches the same record: a person can tell their senders apart in their
 * own filters, and base64url never holds a `+`. Anything outside base64url's alphabet is not a token this host minted.
 */
function tokenOf(to: string): string | null {
  const at = to.lastIndexOf('@');
  const local = (at === -1 ? to : to.slice(0, at)).split('+')[0] ?? '';
  return /^[A-Za-z0-9_-]{16,128}$/.test(local) ? local : null;
}

/**
 * The file store's half of the mail door: an attachment kept exactly as `PUT /api/files` would keep it, or `null`.
 *
 * THE SAME RULES AS A PERSON UPLOADING, because a mailbox must not be a side door into the store: the type is read from
 * the bytes and only the six the store takes are kept, at most 2 MB each, under the record's own prefix, where the
 * record's erasure and the nightly sweep already look. The name the sender gave is not part of the key.
 */
export const fileKeeper =
  (blobs: FileBucket | undefined, spend?: (record: string, bytes: number) => Promise<unknown>): NonNullable<IngestDoor['keep']> =>
  async ({ rec, bytes }) => {
    if (blobs === undefined || bytes.byteLength === 0 || bytes.byteLength > FILE_MOST) return null;
    const mime = sniff(bytes);
    if (mime === null) return null;
    const sha256 = await sha256Of(bytes);
    const key = fileKey(rec, sha256);
    if ((await blobs.head(key)) === null) {
      /* NEW BYTES SPEND THE RECORD'S DAY (`ABUSE.uploadDay`) as an upload does: a mailbox anyone can write to is no way
         round what the bucket costs. Over it, the file is not kept and the message still is. */
      if (spend !== undefined && (await spend(rec, bytes.byteLength)) !== null) return null;
      await blobs.put(key, bytes, { httpMetadata: { contentType: mime } });
    }
    return { sha256, mime };
  };

/**
 * TXT records over DNS over HTTPS, from Cloudflare's resolver.
 *
 * A NAME THAT DOES NOT EXIST IS `[]` AND A RESOLVER THAT DID NOT ANSWER IS `null`, because the two mean different
 * things to a sender: no key is a permanent fault in its setup, and no answer is a moment to try again. Four seconds is
 * the most one lookup may take, so five signatures cannot hold a delivery past Email Routing's patience.
 */
export const dohTxt: TxtLookup = async (name) => {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { Status?: number; Answer?: { type?: number; data?: string }[] };
  if (json.Status === 3) return [];
  if (json.Status !== 0) return null;
  return (json.Answer ?? []).filter((a) => a.type === 16 && typeof a.data === 'string').map((a) => unquoted(a.data!));
};

/** One TXT record's data, its quoted strings joined: `"v=DKIM1; p=MIIB" "IjAN..."` is one key. */
function unquoted(data: string): string {
  if (!data.includes('"')) return data;
  let out = '';
  let inside = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i]!;
    if (c === '"') inside = !inside;
    else if (inside && c === '\\' && i + 1 < data.length) out += data[++i];
    else if (inside) out += c;
  }
  return out;
}

/** Whether a message's recipient is the support address, ignoring case. */
export function isSupportMail(to: string, support: string | undefined): boolean {
  const s = support?.trim().toLowerCase() ?? '';
  return s !== '' && to.trim().toLowerCase() === s;
}
