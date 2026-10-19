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
 * THE ONE THING THIS FILE ADDS IS A VERDICT, AND IT HAS TO. The mail path believes the top `Authentication-Results` in
 * the head, because on the self-host that line is written by the forwarder the person chose. Email Routing writes no
 * such line into what it hands a Worker (measured by others and filed as cloudflare/workerd#6740: no
 * `Authentication-Results`, no `Received-SPF`, and an `ARC-Authentication-Results` with no verdicts in it), so the top
 * line of a message arriving here would be one the SENDER typed, and `dkim=pass header.d=hsbc.example` costs a forger
 * one line. So the DKIM signatures are checked here, against keys looked up in DNS, and this host's own line is put on
 * top of the message before the mail path reads it. Whatever a sender wrote below it is never read.
 *
 * DKIM AND NOT SPF, because the Worker is not told the connecting address SPF is a question about. That is the same
 * outcome the self-host reaches for forwarded mail by another road (`forwarderPassed` in `packages/host/src/ingest.ts`):
 * a message is believed when a domain aligned with its `From:` signed it.
 *
 * NOTHING HERE LOGS, for the reason `ingest.ts` gives: the sender is a stranger, and the mailbox's local part is the
 * record's secret.
 */

import { EMAIL_LIMIT, serveIngest, type IngestDoor } from '@braindog/host';

import { bodyUpTo, FILE_MOST, fileKey, sha256Of, sniff, type FileBucket } from './files.ts';

/** The name this host signs its verdicts with. Any fixed name serves: the mail path reads the top line, not its author. */
const AUTHSERV = 'braindog';

/** At most this many signatures are checked on one message, so a head of a thousand signatures is a thousand ignored. */
const SIGNATURES_MOST = 5;

/**
 * Room kept under the mail ceiling for this host's own line. Five verdicts, each a domain of at most 253 characters and
 * a selector of at most 253, fit inside it, so a message that fits here always fits the mail path's own count.
 */
const STAMP_ROOM = 4_096;

/** The largest message this handler reads. Anything larger is refused before a byte of it is read. */
export const MAIL_MOST = EMAIL_LIMIT - STAMP_ROOM;

/** The TXT strings at a DNS name: `[]` for a name with none, `null` when DNS could not be asked. */
export type TxtLookup = (name: string) => Promise<string[] | null>;

/**
 * Take one message from Email Routing into the record its address names.
 *
 * WHAT THE SENDER HEARS IS THE MAIL PATH'S ANSWER IN SMTP'S WORDS. A stored message is accepted. A mailbox nobody
 * minted, or one that was revoked, is refused permanently, in the same words either way, as the HTTP door answers both
 * 404. A message over the ceiling is refused permanently. A spent budget or a record that could not store it throws,
 * which fails the delivery rather than accepting it, so the message is not taken and then lost.
 */
export async function takeMail(message: ForwardableEmailMessage, door: IngestDoor, lookup: TxtLookup = dohTxt, now: () => number = Date.now): Promise<void> {
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
  const stamp = new TextEncoder().encode(await verdict(raw, lookup, Math.floor(now() / 1000)));
  const bytes = new Uint8Array(stamp.byteLength + raw.byteLength);
  bytes.set(stamp, 0);
  bytes.set(raw, stamp.byteLength);

  /* THE ORIGIN IS NEVER READ: `serveIngest` routes on the path alone, and the mail path reads no request header. */
  const asked = new Request(`https://mail.invalid/in/email/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'message/rfc822' },
    body: bytes,
  });
  const answer = await serveIngest(asked, door);
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
  (blobs: FileBucket | undefined): NonNullable<IngestDoor['keep']> =>
  async ({ rec, bytes }) => {
    if (blobs === undefined || bytes.byteLength === 0 || bytes.byteLength > FILE_MOST) return null;
    const mime = sniff(bytes);
    if (mime === null) return null;
    const sha256 = await sha256Of(bytes);
    await blobs.put(fileKey(rec, sha256), bytes, { httpMetadata: { contentType: mime } });
    return { sha256, mime };
  };

/* ── DKIM (RFC 6376, and RFC 8463 for Ed25519) ───────────────────────────── */

/** One header field as it arrived: its lower-cased name and its lines, line endings taken off. */
type Header = { name: string; lines: string[] };

/**
 * This host's `Authentication-Results` line for a message, CRLF included, ready to go on top of it.
 *
 * EVERY SIGNATURE CHECKED IS REPORTED, pass or not, with the domain that signed it, and the mail path decides from the
 * line whether any pass aligns with the `From:`. A message with no signature says `dkim=none` and is stored unverified.
 */
export async function verdict(raw: Uint8Array, lookup: TxtLookup, nowSeconds: number): Promise<string> {
  const bin = binary(raw);
  const start = bodyAt(bin);
  const head = headers(bin.slice(0, start));
  const body = bin.slice(start);
  const said: string[] = [];
  for (const sig of head.filter((h) => h.name === 'dkim-signature').slice(0, SIGNATURES_MOST)) {
    const one = await checked(sig, head, body, lookup, nowSeconds);
    said.push(one.domain === null ? `dkim=${one.result}` : `dkim=${one.result} header.d=${one.domain} header.s=${one.selector}`);
  }
  return `Authentication-Results: ${AUTHSERV}; ${said.length === 0 ? 'dkim=none' : said.join('; ')}\r\n`;
}

type Checked = { result: 'pass' | 'fail' | 'neutral' | 'temperror' | 'permerror'; domain: string | null; selector: string | null };

/** One signature checked against the head, the body and the key its domain publishes. */
async function checked(sig: Header, head: Header[], body: string, lookup: TxtLookup, nowSeconds: number): Promise<Checked> {
  const tags = tagsOf(unfolded(sig));
  const domain = (tags.d ?? '').toLowerCase();
  const selector = (tags.s ?? '').toLowerCase();
  if (!isName(domain) || !isName(selector)) return { result: 'permerror', domain: null, selector: null };
  const named = { domain, selector };
  const algorithm = (tags.a ?? '').toLowerCase();
  const signed = (tags.h ?? '').split(':').map((h) => h.trim().toLowerCase()).filter((h) => h !== '');
  const [hc = 'simple', bc = 'simple'] = (tags.c ?? 'simple/simple').toLowerCase().split('/');
  if (tags.v !== '1' || (algorithm !== 'rsa-sha256' && algorithm !== 'ed25519-sha256') || !signed.includes('from'))
    return { result: 'permerror', ...named };
  if ((hc !== 'simple' && hc !== 'relaxed') || (bc !== 'simple' && bc !== 'relaxed')) return { result: 'permerror', ...named };
  /* A BODY LENGTH IS REFUSED OUTRIGHT. `l=` signs the first so many bytes and lets anyone append the rest, which is a
     signed bank alert with a stranger's paragraph under it; a signer that uses it is treated as no signature at all. */
  if (tags.l !== undefined) return { result: 'neutral', ...named };
  if (tags.x !== undefined && Number(tags.x) < nowSeconds) return { result: 'fail', ...named };

  const bh = (tags.bh ?? '').replace(/\s+/g, '');
  const hashed = btoa(binary(new Uint8Array(await crypto.subtle.digest('SHA-256', octets(canonicalBody(body, bc === 'relaxed'))))));
  if (hashed !== bh) return { result: 'fail', ...named };

  let txt: string[] | null;
  try {
    txt = await lookup(`${selector}._domainkey.${domain}`);
  } catch {
    txt = null;
  }
  if (txt === null) return { result: 'temperror', ...named };
  const key = tagsOf(txt.join(''));
  const p = (key.p ?? '').replace(/\s+/g, '');
  const kind = (key.k ?? 'rsa').toLowerCase();
  if (p === '' || (key.v !== undefined && key.v !== 'DKIM1')) return { result: 'permerror', ...named };
  if ((algorithm === 'rsa-sha256') !== (kind === 'rsa') || (algorithm === 'ed25519-sha256') !== (kind === 'ed25519'))
    return { result: 'permerror', ...named };

  const data = octets(signedHeaders(head, signed, sig, hc === 'relaxed'));
  const signature = octets(untransferred(tags.b ?? ''));
  try {
    const good =
      kind === 'rsa'
        ? await crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5',
            await crypto.subtle.importKey('spki', octets(untransferred(p)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
            signature,
            data,
          )
        : /* RFC 8463 §3: Ed25519 signs the SHA-256 of the canonical headers, not the headers themselves. */
          await crypto.subtle.verify(
            'Ed25519',
            await crypto.subtle.importKey('raw', octets(untransferred(p)), { name: 'Ed25519' }, false, ['verify']),
            signature,
            new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
          );
    return { result: good ? 'pass' : 'fail', ...named };
  } catch {
    /* A KEY THAT WILL NOT IMPORT IS THE PUBLISHER'S FAULT AND IS NOT A PASS. */
    return { result: 'permerror', ...named };
  }
}

/**
 * The canonical form of the signed headers, then of the signature itself with its `b=` emptied, as one string.
 *
 * A REPEATED NAME IS TAKEN FROM THE BOTTOM UP (RFC 6376 §5.4.2), one instance each time it is listed, and a name listed
 * more often than it appears contributes nothing. That is what makes an extra `From:` added above a signed one visible:
 * the signature covers the bottom one, and the mail path already refuses a message with two.
 */
function signedHeaders(head: Header[], signed: string[], sig: Header, relaxed: boolean): string {
  const used: Record<string, number> = {};
  let out = '';
  for (const name of signed) {
    const all = head.filter((h) => h.name === name);
    const n = used[name] ?? 0;
    const field = all[all.length - 1 - n];
    used[name] = n + 1;
    if (field !== undefined) out += `${canonicalHeader(field, relaxed)}\r\n`;
  }
  const self = canonicalHeader(sig, relaxed);
  const colon = self.indexOf(':');
  /* THE `b=` VALUE IS EMPTIED AND EVERYTHING ELSE IS KEPT, `bh=` included, which is why the tag must follow a `;` or the
     start of the value: `bh=` also ends in `b=`. */
  return out + self.slice(0, colon + 1) + self.slice(colon + 1).replace(/(^|;)([ \t\r\n]*b[ \t\r\n]*=)[^;]*/, '$1$2');
}

/** One header in `simple` or `relaxed` form, with no line ending after it. */
function canonicalHeader(field: Header, relaxed: boolean): string {
  if (!relaxed) return field.lines.join('\r\n');
  const whole = field.lines.join('');
  const colon = whole.indexOf(':');
  return `${field.name}:${whole.slice(colon + 1).replace(/[ \t]+/g, ' ').trim()}`;
}

/**
 * The body in `simple` or `relaxed` form (RFC 6376 §3.4.3, §3.4.4).
 *
 * BARE LINE FEEDS ARE READ AS CRLF, because the signer hashed the message as it went over SMTP, where every line ends in
 * CRLF, and a relay that stored it with bare line feeds changed nothing the signer signed.
 */
function canonicalBody(body: string, relaxed: boolean): string {
  let lines = body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  if (relaxed)
    lines = lines.map((line) => {
      const one = line.replace(/[ \t]+/g, ' ');
      return one.endsWith(' ') ? one.slice(0, -1) : one;
    });
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return relaxed ? '' : '\r\n';
  return `${lines.join('\r\n')}\r\n`;
}

/** A head, as fields in their order, each with the lines it arrived on. */
function headers(bin: string): Header[] {
  const out: Header[] = [];
  for (const piece of bin.split('\n')) {
    const line = piece.endsWith('\r') ? piece.slice(0, -1) : piece;
    if (line === '') continue;
    const last = out[out.length - 1];
    if ((line.startsWith(' ') || line.startsWith('\t')) && last !== undefined) {
      last.lines.push(line);
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    out.push({ name: line.slice(0, colon).trim().toLowerCase(), lines: [line] });
  }
  return out;
}

/** A field's value on one line, folding taken out. */
const unfolded = (field: Header): string => {
  const whole = field.lines.join('');
  return whole.slice(whole.indexOf(':') + 1);
};

/** `k=v; k=v` tags, as a DKIM signature and a DKIM key record both write them. The first of a repeated tag wins. */
function tagsOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (key !== '' && out[key] === undefined) out[key] = part.slice(eq + 1).trim();
  }
  return out;
}

/** Whether text is a dotted DNS name this file will put into a lookup and into a verdict: letters, digits, `-`, `_`. */
function isName(text: string): boolean {
  if (text.length === 0 || text.length > 253) return false;
  return text.split('.').every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9_-]+$/.test(label));
}

/** Base64 with its folding whitespace taken out, as one character per byte, or empty for text that is not base64. */
function untransferred(b64: string): string {
  try {
    return atob(b64.replace(/\s+/g, ''));
  } catch {
    return '';
  }
}

/** Where the body starts: after the first blank line, or the end for a message with none. The mail path splits the same way. */
function bodyAt(raw: string): number {
  const crlf = raw.indexOf('\r\n\r\n');
  const lf = raw.indexOf('\n\n');
  if (crlf === -1 && lf === -1) return raw.length;
  return crlf !== -1 && (lf === -1 || crlf < lf) ? crlf + 4 : lf + 2;
}

/** Bytes as one character per byte, so hashing what was read hashes exactly what arrived. */
function binary(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8_192) out += String.fromCharCode(...bytes.subarray(i, i + 8_192));
  return out;
}

const octets = (bin: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
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
