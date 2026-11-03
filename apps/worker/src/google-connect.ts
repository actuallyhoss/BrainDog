/**
 * Connect Google: one Google account per record, read only, synced every 15 minutes into the add-ons that already
 * hold mail, events and people. `/api/google*` and the record's alarm.
 *
 * THE FLOW IS GOOGLE'S OWN WEB FLOW, authorization code with PKCE, `access_type=offline` and `prompt=consent` so Google
 * hands a refresh token every time, and `include_granted_scopes`. It starts at `/api/google/connect`, a top-level page
 * load from the app with the browser session, and comes back to `/api/google/callback`, the one redirect URI to register.
 * The state, the PKCE verifier, the record's name in the path and where to go afterwards ride in one short-lived
 * `__Host-` cookie, `SameSite=Lax` because the way back is a navigation from Google, as `google.ts`'s sign-in does it.
 *
 * THE REFRESH TOKEN NEVER LEAVES THE HOST. The callback hands the code to the record's object, which swaps it at Google
 * with the client secret, seals the refresh token at once and keeps only the sealed bytes, in the object's own storage
 * beside the alarm's notes. It is sealed under a key drawn from the record's CONNECTOR key (HKDF, `google-connect` as
 * its info, AES-256-GCM with the record id in the additional data): the key a scheduled run may open and nothing else,
 * unwrapped under `env.KEK` only for the one sync, and zero-filled after. A root key rotation re-wraps the connector key,
 * not this, so it keeps opening. No answer, no row, no note and no log ever holds the token; an agent cannot ask for it,
 * because nothing answers with it.
 *
 * WHAT IT WRITES IS WHAT THE ADD-ONS ALREADY TAKE. Mail goes through the Gmail add-on's own door (`gmail_in`), as the
 * same lines its Apps Script posts, so its list, pages, questions, Today widgets and people-meeting see nothing new.
 * Events go into the Calendar add-on's list under the very key its ICS reader uses (the event's iCalendar id, and the
 * day for one time of a repeating event), so the two never write the same event twice.
 *
 * NOBODY IS ADDED TO PEOPLE FOR BEING IN GOOGLE CONTACTS (`meetContact` in the kernel). A card holding one of his own
 * addresses is his, a card somebody kept already answers to fills in what they lack, and a card is a new person only
 * when they are of use: a mail thread both of them wrote in, a small meeting together, or a name the record already
 * says. The rest is left out, and the sync's line says how many of each.
 *
 * ITS OWN FILE, free of `cloudflare:`, so it is read in Node. Nothing here logs a value.
 */

import { grantKey, openSealed, seal } from '@braindog/host';
import { appNext } from '@braindog/host/auth';
import { keyOf } from '@braindog/kernel';
import type { CallContext, RecordApi } from '@braindog/record';

import { unwrap, type KeyStore } from './keys.ts';

/* ── what is asked of Google ─────────────────────────────────────────────── */

export const GOOGLE_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const PEOPLE = 'https://people.googleapis.com/v1/people/me/connections';

/** The routes, and the one method each answers. */
export const CONNECT_ROUTES = {
  '/api/google': 'GET',
  '/api/google/connect': 'GET',
  '/api/google/callback': 'GET',
  '/api/google/disconnect': 'POST',
  '/api/google/sync': 'POST',
} as const;
export type ConnectPath = keyof typeof CONNECT_ROUTES;

export const servesConnect = (pathname: string): ConnectPath | null => {
  const p = pathname.replace(/\/+$/, '');
  return Object.hasOwn(CONNECT_ROUTES, p) ? (p as ConnectPath) : null;
};

/** Every 15 minutes, as the Apps Script ran. */
export const SYNC_EVERY_MS = 15 * 60_000;
/** How long somebody has to finish at Google. */
const STATE_LIFE_S = 600;
const STATE_COOKIE = '__Host-bd_gc';

/** Whether this deployment has both halves of a Google client. */
export const connectOn = (env: { GOOGLE_CLIENT_ID?: string | undefined; GOOGLE_CLIENT_SECRET?: string | undefined }): boolean =>
  (env.GOOGLE_CLIENT_ID ?? '').trim() !== '' && (env.GOOGLE_CLIENT_SECRET ?? '').trim() !== '';

/* ── the start and the way back ──────────────────────────────────────────── */

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const fromB64url = (text: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};
const fresh = (): string => b64url(crypto.getRandomValues(new Uint8Array(32)));
const textOf = (b64: string): string => {
  const bytes = fromB64url(b64);
  return bytes === null ? '' : new TextDecoder().decode(bytes);
};

function go(to: string, cookies: readonly string[]): Response {
  const headers = new Headers({ location: to, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

const stateCookie = (value: string, age: number): string => `${STATE_COOKIE}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;

/** What the start kept for the way back. */
export type Held = { state: string; verifier: string; slug: string | null; next: string };

export function heldOf(request: Request): Held | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== STATE_COOKIE) continue;
    const [state, verifier, slug, next] = part.slice(at + 1).trim().split('.');
    if (!state || !verifier) return null;
    const name = textOf(slug ?? '');
    return { state, verifier, slug: /^[a-z0-9-]{1,64}$/.test(name) ? name : null, next: textOf(next ?? '') };
  }
  return null;
}

/** The record's name the way back should be answered under: the one the start was made under. */
export const callbackSlug = (request: Request): string | null => heldOf(request)?.slug ?? null;

/** The address the app's page lives at under a record's name, as `apps/web/src/lib/at.ts` draws it. */
const pageAt = (origin: string, slug: string | null, next: string): string => `${origin}${slug === null ? '' : `/${slug}`}${next}`;

/** `/api/google/connect`: to Google, with the cookie that remembers this start. */
export async function startConnect(request: Request, door: { origin: string; clientId: string; slug: string | null; email?: string | undefined }): Promise<Response> {
  const url = new URL(request.url);
  const state = fresh();
  const verifier = fresh();
  const next = appNext(url.searchParams.get('next')) ?? '/settings/ingest';
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const to = new URL(AUTHORIZE);
  to.search = new URLSearchParams({
    client_id: door.clientId,
    redirect_uri: `${door.origin}/api/google/callback`,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    ...(door.email ? { login_hint: door.email } : {}),
  }).toString();
  const enc = (s: string): string => b64url(new TextEncoder().encode(s));
  return go(to.toString(), [stateCookie(`${state}.${verifier}.${enc(door.slug ?? '')}.${enc(next)}`, STATE_LIFE_S)]);
}

/** Why a connect ended where it did, as `?google=` says it on the app's page. */
export type ConnectSaid = 'connected' | 'cancelled' | 'failed' | 'scopes' | 'off';

/**
 * `/api/google/callback`: the code is checked against the cookie and handed to the record, which swaps and seals it.
 * Whatever happens the cookie goes, so one start is answered once.
 */
export async function finishConnect(
  request: Request,
  door: { origin: string; keep: (code: string, verifier: string, redirect: string) => Promise<ConnectSaid> },
): Promise<Response> {
  const url = new URL(request.url);
  const held = heldOf(request);
  const forget = stateCookie('', 0);
  const back = (said: ConnectSaid): Response => {
    const next = held?.next || '/settings/ingest';
    const sep = next.includes('?') ? '&' : '?';
    return go(`${pageAt(door.origin, held?.slug ?? null, next)}${sep}google=${said}`, [forget]);
  };
  if (url.searchParams.has('error')) return back('cancelled');
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (held === null || code === '' || code.length > 2048 || state !== held.state) return back('failed');
  return back(await door.keep(code, held.verifier, `${door.origin}/api/google/callback`));
}

/* ── Google's token endpoint ─────────────────────────────────────────────── */

export type Client = { id: string; secret: string };
export type Send = (input: string, init?: RequestInit) => Promise<Response>;

/** What a code swaps for: the refresh token (sealed at once by the caller), the address and the scopes granted. */
export type Swapped = { refresh: string; access: string; email: string; scopes: string[] };

export async function swapCode(client: Client, code: string, verifier: string, redirect: string, send: Send): Promise<Swapped | ConnectSaid> {
  let answer: Response;
  try {
    answer = await send(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
    });
  } catch {
    return 'failed';
  }
  if (!answer.ok) return 'failed';
  const body = (await answer.json().catch(() => null)) as { refresh_token?: unknown; access_token?: unknown; scope?: unknown } | null;
  if (typeof body?.refresh_token !== 'string' || typeof body.access_token !== 'string') return 'failed';
  const scopes = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [];
  /* EVERY SCOPE ASKED, OR NOTHING KEPT: Google lets a person untick boxes on its screen, and a half connection would
     read as broken later. The token is revoked so Google does not list an app that holds nothing. */
  if (!GOOGLE_SCOPES.every((s) => scopes.includes(s))) {
    await revokeToken(body.refresh_token, send);
    return 'scopes';
  }
  let email = '';
  try {
    const who = await send(USERINFO, { headers: { authorization: `Bearer ${body.access_token}` } });
    if (who.ok) email = String(((await who.json()) as { email?: unknown }).email ?? '').trim();
  } catch {
    email = '';
  }
  return { refresh: body.refresh_token, access: body.access_token, email, scopes };
}

/** A fresh access token, or why there is none: `gone` when Google no longer honours the refresh token. */
export async function accessOf(client: Client, refresh: string, send: Send): Promise<string | 'gone' | 'failed'> {
  try {
    const answer = await send(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: refresh, grant_type: 'refresh_token' }),
    });
    const body = (await answer.json().catch(() => null)) as { access_token?: unknown; error?: unknown } | null;
    if (answer.ok && typeof body?.access_token === 'string') return body.access_token;
    return body?.error === 'invalid_grant' ? 'gone' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Revoke at Google. A token Google already forgot is revoked too, as far as anybody can tell. */
export async function revokeToken(token: string, send: Send): Promise<boolean> {
  try {
    const answer = await send(REVOKE, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
    return answer.ok || answer.status === 400;
  } catch {
    return false;
  }
}

/* ── the sealed token ────────────────────────────────────────────────────── */

/** The connector key as the record keeps it (`kernel.connectorWrapping`). */
export type ConnectorWrapping = { wrapped: Uint8Array; nonce: Uint8Array; kek_id: string };
/** The refresh token as it is kept: sealed bytes and their nonce, base64url. */
export type SealedToken = { nonce: string; box: string };

const INFO = 'google-connect';
const aadOf = (record: string): string => `${record}\u001f${INFO}\u001f1`;

async function boxKey(store: KeyStore, record: string, wrapping: ConnectorWrapping) {
  const dek = await unwrap(store, record, 'connector', { wrapped: wrapping.wrapped, nonce: wrapping.nonce, kek_id: wrapping.kek_id, wrapped_by: 'kek' });
  if (!dek) return null;
  try {
    return await grantKey(dek, INFO);
  } finally {
    dek.fill(0);
  }
}

export async function sealToken(store: KeyStore, record: string, wrapping: ConnectorWrapping, token: string): Promise<SealedToken | null> {
  const key = await boxKey(store, record, wrapping);
  if (!key) return null;
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(token);
  const box = await seal(key, nonce, aadOf(record), bytes);
  bytes.fill(0);
  return { nonce: b64url(nonce), box: b64url(box) };
}

export async function openToken(store: KeyStore, record: string, wrapping: ConnectorWrapping, kept: SealedToken): Promise<string | null> {
  const key = await boxKey(store, record, wrapping);
  const nonce = fromB64url(kept.nonce);
  const box = fromB64url(kept.box);
  if (!key || !nonce || !box) return null;
  const opened = await openSealed(key, nonce, aadOf(record), box);
  if (opened === null) return null;
  const out = new TextDecoder().decode(opened);
  opened.fill(0);
  return out;
}

/* ── what the record object keeps ────────────────────────────────────────── */

/** One storage key, beside the alarm's notes. Never a row: a row is read by agents. */
export const CONNECTION_KEY = 'google.connection';

export type Connection = {
  v: 1;
  email: string;
  scopes: string[];
  token: SealedToken;
  since: number;
  /** When the next sync is due. */
  due: number;
  /** Set when Google stopped honouring the token: the one line the page says, and no sync runs until he connects again. */
  broken?: string | undefined;
  last?: { at: number; said: string; ok: boolean } | undefined;
  gmail?: { history?: string | undefined; open?: Record<string, string> | undefined; pending?: string[] | undefined } | undefined;
  calendar?: { sync?: string | undefined; full?: number | undefined; name?: string | undefined } | undefined;
  /** `full` is when the whole book was last read, and `whole` is set while one is read a page at a time. */
  contacts?: { sync?: string | undefined; page?: string | undefined; full?: number | undefined; whole?: boolean | undefined } | undefined;
  /**
   * Who he was in touch with, as the passes saw it, for the people rule: an address's key to the last day he wrote to
   * it (`sent`), it wrote to him as a person and not a list or a machine (`heard`), or the two were on a small meeting
   * (`met`). Kept for the look-back window and no more.
   */
  touch?: Touch | undefined;
  /** The addresses the account sends as (Gmail's send-as list), read once a day: his own, never anybody to add. */
  own?: { list: string[]; at: number } | undefined;
};

export type Touch = { sent?: Record<string, string> | undefined; heard?: Record<string, string> | undefined; met?: Record<string, string> | undefined };

/** What the app is told: never the token, never a Google id. */
export type Status = {
  on: boolean;
  connected: boolean;
  email?: string;
  since?: string;
  last?: { at: string; said: string; ok: boolean };
  broken?: string;
  mail: boolean;
  events: boolean;
  owner: boolean;
};

export function statusOf(conn: Connection | null, facts: { on: boolean; mail: boolean; events: boolean; owner: boolean }): Status {
  if (conn === null) return { ...facts, connected: false };
  return {
    ...facts,
    connected: true,
    email: conn.email,
    since: new Date(conn.since).toISOString(),
    ...(conn.last ? { last: { at: new Date(conn.last.at).toISOString(), said: conn.last.said, ok: conn.last.ok } } : {}),
    ...(conn.broken ? { broken: conn.broken } : {}),
  };
}

export const BROKEN_GONE =
  'Google stopped letting BrainDog read this account, so nothing new comes in. Connect Google again. (While the Google app is in Testing, Google ends this every 7 days.)';

/* ── reading from Google ─────────────────────────────────────────────────── */

class Fault extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Google answered ${String(status)}`);
    this.status = status;
  }
}

type Get = (url: string) => Promise<Record<string, unknown>>;

function getter(access: string, send: Send): Get & { calls: () => number } {
  let n = 0;
  const get = async (url: string): Promise<Record<string, unknown>> => {
    n += 1;
    const answer = await send(url, { headers: { authorization: `Bearer ${access}`, accept: 'application/json' } });
    if (!answer.ok) throw new Fault(answer.status);
    return ((await answer.json()) ?? {}) as Record<string, unknown>;
  };
  return Object.assign(get, { calls: () => n });
}

const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);

/** A day and a wall time in a zone, as the add-ons write them. */
function wallIn(ms: number, zone: string): { day: string; time: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  }
  const p = (t: string): string => parts.find((x) => x.type === t)?.value ?? '00';
  return { day: `${p('year')}-${p('month')}-${p('day')}`, time: `${p('hour')}:${p('minute')}` };
}

/* ── Gmail ───────────────────────────────────────────────────────────────── */

const LOOK_BACK_DAYS = 14;
/** Mails read a run. Each is one or two calls to Google, so a run stays far under the platform's subrequests. */
const MAIL_MOST = 60;
const OPEN_MOST = 200;
const PENDING_MOST = 300;

/* The same reading as the Apps Script and the hourly script (`packs/gmail`): this only hints, `gmail.js` decides. */
const BILLERS =
  /(^|\.)(stripe\.com|paypal\.com|paddle\.com|apple\.com|google\.com|microsoft\.com|amazon\.[a-z.]+|aws\.amazon\.com|adobe\.com|netflix\.com|spotify\.com|uber\.com|airbnb\.com|github\.com|vercel\.com|cloudflare\.com|digitalocean\.com|heroku\.com|godaddy\.com|namecheap\.com|squarespace\.com|shopify\.com|wix\.com|notion\.so|figma\.com|slack\.com|zoom\.us|dropbox\.com|atlassian\.com|openai\.com|anthropic\.com|xero\.com|intuit\.com|quickbooks\.com|freshbooks\.com|waveapps\.com|chargebee\.com|recurly\.com|gocardless\.com|wise\.com|revolut\.com|vodafone\.[a-z.]+|etisalat\.[a-z.]+|orange\.[a-z.]+)$/i;
const BILLING_SENDER = /^(billing|invoices?|receipts?|payments?|accounts?|statements?|orders?)[@+.-]/i;
const AMOUNT =
  /([$€£¥₹]\s?\d[\d,]*(\.\d{1,2})?|\b(usd|eur|gbp|egp|aed|sar|cad|aud|inr|jpy|chf)\s?\d[\d,]*(\.\d{1,2})?|\d[\d,]*(\.\d{1,2})?\s?(usd|eur|gbp|egp|aed|sar|cad|aud|inr|jpy|chf)\b)/i;

const looksLikeNewsletter = (text: string, address: string): boolean =>
  /^(news|newsletters?|marketing|promo(tions)?|offers|deals|digest|weekly|editor|community)[@+.-]/i.test(address) ||
  /\b(newsletter|unsubscribe|weekly digest|this week in|% off|flash sale|webinar)\b/i.test(text);

function kindOf(subject: string, snippet: string, address: string): string {
  const text = `${subject} ${snippet}`;
  const domain = address.split('@')[1] ?? '';
  const known = BILLERS.test(domain) || BILLING_SENDER.test(address);
  const amount = AMOUNT.test(text);
  if (/\binvoice\b/i.test(subject) || (/\binvoice\b/i.test(snippet) && (amount || known))) return 'bill';
  if (/\b(amount due|payment due|due date|pay by|your bill|bill is ready|new bill|statement is ready|renewal notice|payment failed)\b/i.test(text) && (amount || known)) return 'bill';
  if (/\b(receipt|order confirm\w*|your order|order (no|number|#)|payment received|thanks for your (order|purchase|payment)|we received your payment)\b/i.test(text) && (amount || known))
    return 'receipt';
  if (/\b(invitation|invite|meeting|appointment|booking|reservation|interview|deadline|rsvp)\b/i.test(text)) return 'date';
  return 'none';
}

function parseAddress(raw: string): { name: string; address: string } {
  const s = raw.trim();
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(s);
  if (m) return { name: (m[1] ?? '').trim(), address: (m[2] ?? '').trim().toLowerCase() };
  return { name: '', address: s.toLowerCase() };
}

const decode = (s: string): string => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** One line, at most n characters, and none of the words the door reads the lines by. */
function clean(s: string, n: number): string {
  const one = s.replace(/[\r\n\t]+/g, ' ').replace(/gmail\.[a-z]+=/gi, '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

type Mail = {
  id: string;
  thread: string;
  out: boolean;
  name: string;
  address: string;
  /** Who he wrote to, for one he sent: every address on To and Cc. */
  to: string[];
  /** Whether he wrote in the thread after this one came in. */
  answered: boolean;
  subject: string;
  snippet: string;
  at: number;
  unread: boolean;
  reply: boolean;
  person: boolean;
  kind: string;
  link: string;
};

/** The body the Gmail add-on's door reads, line for line what its Apps Script posts. */
export function mailBody(m: Mail, zone: string): string {
  return [
    'BrainDog Gmail 1',
    `gmail.message= ${m.id}`,
    `gmail.thread= ${m.thread}`,
    `gmail.direction= ${m.out ? 'sent' : 'received'}`,
    `gmail.name= ${m.name}`,
    `gmail.address= ${m.address}`,
    `gmail.subject= ${m.subject}`,
    `gmail.day= ${wallIn(m.at, zone).day}`,
    `gmail.at= ${new Date(m.at).toISOString()}`,
    `gmail.unread= ${m.unread ? 'yes' : 'no'}`,
    `gmail.reply= ${m.reply ? 'yes' : 'no'}`,
    `gmail.person= ${m.person ? 'yes' : 'no'}`,
    `gmail.kind= ${m.kind}`,
    `gmail.link= ${m.link}`,
    `gmail.snippet= ${m.snippet}`,
    'gmail.end',
    '',
  ].join('\n');
}

const HEADERS = ['From', 'To', 'Cc', 'Subject', 'Date', 'List-Unsubscribe', 'List-Id', 'Precedence', 'Auto-Submitted'];

/** Every address in a header that may list several (`"Lovelace, Ada" <ada@x.com>, bob@y.com`), lower case. */
const addressesIn = (text: string): string[] => [...new Set([...text.matchAll(/[^\s<>()[\]"',;:]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/giu)].map((m) => m[0].toLowerCase()))];

async function readMail(get: Get, id: string, me: string): Promise<Mail | null> {
  const q = new URLSearchParams({ format: 'metadata' });
  for (const h of HEADERS) q.append('metadataHeaders', h);
  const m = await get(`${GMAIL}/messages/${encodeURIComponent(id)}?${q}`);
  const labels = (Array.isArray(m.labelIds) ? m.labelIds : []).map(String);
  const h: Record<string, string> = {};
  const payload = (m.payload ?? {}) as { headers?: unknown };
  for (const x of arr(payload.headers)) h[str(x.name).toLowerCase()] = str(x.value);
  const out = labels.includes('SENT');
  const from = parseAddress(h['from'] ?? '');
  const to = parseAddress((h['to'] ?? '').split(',')[0] ?? '');
  const other = out ? to : from;
  if (!other.address || (!out && other.address === me)) return null;
  const subject = clean(h['subject'] || '(no subject)', 200);
  const snippet = clean(decode(str(m.snippet)), 160);
  const bulk =
    Boolean(h['list-unsubscribe'] || h['list-id']) ||
    /bulk|list|junk/i.test(h['precedence'] ?? '') ||
    /auto/i.test(h['auto-submitted'] ?? '') ||
    /no-?reply|do-?not-?reply|notifications?@|mailer-daemon|bounce/i.test(other.address) ||
    labels.some((l) => /^CATEGORY_(PROMOTIONS|SOCIAL|UPDATES|FORUMS)$/.test(l));
  const newsletter =
    Boolean(h['list-id']) ||
    /bulk|list/i.test(h['precedence'] ?? '') ||
    labels.some((l) => /^CATEGORY_(PROMOTIONS|SOCIAL|FORUMS)$/.test(l)) ||
    looksLikeNewsletter(`${subject} ${snippet}`, other.address);
  const thread = str(m.threadId);
  const unread = !out && labels.includes('UNREAD') && labels.includes('INBOX');
  const replied = !out && !bulk && labels.includes('INBOX') && (await answered(get, thread, id, me));
  const reply = !out && !bulk && labels.includes('INBOX') && !replied;
  return {
    id,
    thread,
    out,
    name: clean(other.name || other.address, 120),
    address: other.address,
    to: out ? addressesIn(`${h['to'] ?? ''}, ${h['cc'] ?? ''}`).filter((a) => a !== me) : [],
    answered: replied,
    subject,
    snippet,
    at: Number(m.internalDate) || Date.now(),
    unread,
    reply,
    person: !bulk,
    kind: out ? 'none' : newsletter ? 'list' : kindOf(subject, snippet, other.address),
    link: `https://mail.google.com/mail/?authuser=${encodeURIComponent(me)}#all/${thread}`,
  };
}

/** Whether he wrote in the thread after this mail arrived. */
async function answered(get: Get, thread: string, id: string, me: string): Promise<boolean> {
  const t = await get(`${GMAIL}/threads/${encodeURIComponent(thread)}?format=metadata&metadataHeaders=From`);
  let after = false;
  for (const x of arr(t.messages)) {
    if (x.id === id) {
      after = true;
      continue;
    }
    if (!after) continue;
    const from = arr(((x.payload ?? {}) as { headers?: unknown }).headers).find((y) => str(y.name).toLowerCase() === 'from');
    if (from && parseAddress(str(from.value)).address === me) return true;
  }
  return false;
}

export type Writer = {
  zone: string;
  /** The Gmail add-on is on: mail goes through its door. */
  mail: boolean;
  /** The Calendar add-on is on; `invites` when its list holds who invited and the answer (2.1.0). */
  events: boolean;
  invites: boolean;
  /** Mail into the Gmail add-on's door, as a verified arrival. `true` when it was taken. */
  arrive(body: string): Promise<boolean>;
  /** The Calendar add-on's rows from a day on, by key. */
  heldEvents(fromDay: string): Promise<Map<string, { seq: number; version: number; fields: Record<string, unknown> }>>;
  addEvent(fields: Record<string, unknown>): Promise<void>;
  changeEvent(seq: number, version: number, patch: Record<string, unknown>): Promise<void>;
  /**
   * One Google Contacts card, for the people rule (`meetContact` in the kernel): folded into him, filled in on somebody
   * kept, added when they are of use, or left out. Says which.
   */
  contact(said: ContactSaid): Promise<ContactDid>;
};

/** A card as the Contacts pass hands it on, with what the passes saw of the two of them. */
export type ContactSaid = { name?: string; emails: string[]; phones: string[]; own: string[]; use?: 'mail' | 'event'; day?: string };
export type ContactDid = 'self' | 'matched' | 'added' | 'skipped';

/* ── who he is in touch with ─────────────────────────────────────────────── */

/** The most addresses each kind of touch keeps, the newest. */
const TOUCH_MOST = 500;
/** A meeting of more people than this, him included, is a mass invite and says nothing about who he knows. */
const MEETING_MOST = 10;

/** `map` with an address's key moved to `day` when that is later. An address that is no address is left out. */
function touched(map: Record<string, string> | undefined, address: string, day: string): Record<string, string> {
  const out = { ...(map ?? {}) };
  const key = keyOf('email', address);
  if (key !== null && (out[key] ?? '') < day) out[key] = day;
  return out;
}

/** `map` without the days before `from`, and only its newest `TOUCH_MOST`. */
const pruned = (map: Record<string, string> | undefined, from: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(map ?? {})
      .filter(([, day]) => day >= from)
      .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
      .slice(0, TOUCH_MOST),
  );

/**
 * What a mail says about who he is in touch with. One he sent says he wrote to everybody on it; one that came in from a
 * person (not a list, a notification or a no-reply address) says they wrote to him, and one he answered in its thread
 * says he wrote back.
 */
function touchMail(t: Touch, m: Mail, day: string): Touch {
  if (m.out) return { ...t, sent: m.to.reduce((map, a) => touched(map, a, day), t.sent) };
  if (!m.person) return t;
  return { ...t, heard: touched(t.heard, m.address, day), ...(m.answered ? { sent: touched(t.sent, m.address, day) } : {}) };
}

/** What an event says: everybody else on a meeting of at most `MEETING_MOST` people that he is on and did not decline. */
function touchEvent(t: Touch, e: Record<string, unknown>, day: string): Touch {
  const people = arr(e.attendees).filter((a) => a.resource !== true);
  const self = people.find((a) => a.self === true);
  if (e.status === 'cancelled' || self === undefined || self.responseStatus === 'declined' || people.length < 2 || people.length > MEETING_MOST) return t;
  return { ...t, met: people.filter((a) => a.self !== true).reduce((map, a) => touched(map, str(a.email), day), t.met) };
}

/**
 * What the passes saw of a card's addresses within the window: `mail` when he wrote to one and it wrote to him, else
 * `event` when they met, and the latest such day, never later than today (a meeting ahead is not a day in touch yet).
 */
function seenOf(t: Touch, emails: readonly string[], from: string, today: string): { use?: 'mail' | 'event'; day?: string } {
  let use: 'mail' | 'event' | undefined;
  let day = '';
  for (const e of emails) {
    const key = keyOf('email', e);
    if (key === null) continue;
    const sent = t.sent?.[key] ?? '';
    const heard = t.heard?.[key] ?? '';
    const met = t.met?.[key] ?? '';
    if (sent >= from && heard >= from) {
      use = 'mail';
      for (const d of [sent, heard]) if (d > day) day = d;
    }
    if (met >= from) {
      use ??= 'event';
      const d = met > today ? today : met;
      if (d > day) day = d;
    }
  }
  return { ...(use === undefined ? {} : { use }), ...(day === '' ? {} : { day }) };
}

async function gmailPass(get: Get, conn: Connection, w: Writer, now: number): Promise<string> {
  const me = conn.email.toLowerCase();
  const st = { ...(conn.gmail ?? {}) };
  const open: Record<string, string> = { ...(st.open ?? {}) };
  const want = new Set<string>(st.pending ?? []);
  let history = st.history;

  if (history !== undefined) {
    try {
      const touched = new Set<string>();
      let page = '';
      let newest = history;
      for (let i = 0; i < 5; i++) {
        const q = new URLSearchParams({ startHistoryId: history, maxResults: '500' });
        for (const t of ['messageAdded', 'labelAdded', 'labelRemoved']) q.append('historyTypes', t);
        if (page) q.set('pageToken', page);
        const h = await get(`${GMAIL}/history?${q}`);
        for (const item of arr(h.history))
          for (const k of ['messagesAdded', 'labelsAdded', 'labelsRemoved'])
            for (const x of arr(item[k])) {
              const msg = (x.message ?? {}) as { id?: unknown; threadId?: unknown };
              if (typeof msg.id === 'string') want.add(msg.id);
              if (typeof msg.threadId === 'string') touched.add(msg.threadId);
            }
        newest = str(h.historyId) || newest;
        page = str(h.nextPageToken);
        if (!page) break;
      }
      /* A REPLY IS A NEW MAIL IN THE THREAD, so every mail still waiting in a thread that moved is read again. */
      for (const [id, thread] of Object.entries(open)) if (touched.has(thread)) want.add(id);
      history = newest;
    } catch (e) {
      /* TOO OLD FOR GOOGLE'S HISTORY (a week or so): read the window again from the start. */
      if (!(e instanceof Fault) || e.status !== 404) throw e;
      history = undefined;
    }
  }
  if (history === undefined) {
    const profile = await get(`${GMAIL}/profile`);
    const q = new URLSearchParams({ q: `newer_than:${String(LOOK_BACK_DAYS)}d -in:spam -in:trash -in:chats`, maxResults: '100' });
    let page = '';
    for (let i = 0; i < 2; i++) {
      if (page) q.set('pageToken', page);
      const listed = await get(`${GMAIL}/messages?${q}`);
      for (const x of arr(listed.messages)) if (typeof x.id === 'string') want.add(x.id);
      page = str(listed.nextPageToken);
      if (!page) break;
    }
    history = str(profile.historyId) || undefined;
  }

  const queue = [...want];
  const later = queue.slice(MAIL_MOST);
  let told = 0;
  const since = now - LOOK_BACK_DAYS * 86_400_000;
  for (const id of queue.slice(0, MAIL_MOST)) {
    let mail: Mail | null;
    try {
      mail = await readMail(get, id, me);
    } catch (e) {
      /* GONE FROM GMAIL FOR GOOD: nothing more to say about it. */
      if (e instanceof Fault && (e.status === 404 || e.status === 400)) {
        delete open[id];
        continue;
      }
      throw e;
    }
    if (mail === null) continue;
    /* OLDER THAN THE WINDOW AND NOT ONE STILL WAITING: left alone, as the Apps Script leaves it. */
    if (mail.at < since && !Object.hasOwn(open, id)) continue;
    if (mail.at >= since) conn.touch = touchMail(conn.touch ?? {}, mail, wallIn(mail.at, w.zone).day);
    if (!(await w.arrive(mailBody(mail, w.zone)))) {
      later.push(id);
      continue;
    }
    told += 1;
    if (mail.unread || mail.reply) open[id] = mail.thread;
    else delete open[id];
  }
  const kept = Object.entries(open).slice(-OPEN_MOST);
  conn.gmail = { history, open: Object.fromEntries(kept), pending: later.slice(0, PENDING_MOST) };
  return told === 0 ? 'no new mail' : `${String(told)} ${told === 1 ? 'mail' : 'mails'}`;
}

/* ── Calendar ────────────────────────────────────────────────────────────── */

const BEHIND_DAYS = 7;
const AHEAD_DAYS = 60;
const FULL_EVERY_MS = 24 * 3_600_000;

const RESPONSE: Record<string, string> = { needsAction: 'waiting', accepted: 'yes', declined: 'no', tentative: 'maybe' };

type When = { date?: unknown; dateTime?: unknown; timeZone?: unknown };

/** One event as the Calendar add-on keeps it, keyed as its ICS reader keys it, or `null` for one it would not keep. */
function eventFields(e: Record<string, unknown>, zone: string, calName: string, invites: boolean): { key: string; fields: Record<string, unknown> } | null {
  const uid = str(e.iCalUID) || str(e.id);
  if (!uid) return null;
  const start = (e.start ?? {}) as When;
  const end = (e.end ?? {}) as When;
  const allDay = typeof start.date === 'string';
  const startMs = allDay ? Date.parse(`${String(start.date)}T00:00:00Z`) : Date.parse(str(start.dateTime));
  if (!Number.isFinite(startMs)) return null;
  const wall = allDay ? { day: String(start.date), time: '' } : wallIn(startMs, zone);
  /* ONE TIME OF A REPEATING EVENT IS `uid@day of the time it was first set for`, as `calendar.js` keys it. */
  const original = (e.originalStartTime ?? null) as When | null;
  let key = uid;
  if (str(e.recurringEventId) && original) {
    const o = typeof original.date === 'string' ? String(original.date) : wallIn(Date.parse(str(original.dateTime)), zone).day;
    key = `${uid}@${o}`;
  }
  const endMs = typeof end.dateTime === 'string' ? Date.parse(end.dateTime) : NaN;
  const fields: Record<string, unknown> = {
    key,
    what: clean(str(e.summary) || 'Busy', 200),
    day: wall.day,
    time: allDay ? null : wall.time,
    until: allDay || !Number.isFinite(endMs) ? null : wallIn(endMs, zone).time,
    all_day: allDay,
    starts: allDay ? null : new Date(startMs).toISOString(),
    place: clean(str(e.location), 200) || null,
    calendar: calName || null,
    gone: e.status === 'cancelled',
  };
  if (invites) {
    const self = arr(e.attendees).find((a) => a.self === true);
    const organizer = (e.organizer ?? {}) as { self?: unknown; displayName?: unknown; email?: unknown };
    const invited = self !== undefined && organizer.self !== true;
    fields.invite = invited;
    fields.organiser = invited ? clean(str(organizer.displayName) || str(organizer.email), 120) || null : null;
    fields.response = invited ? (RESPONSE[str(self.responseStatus)] ?? 'waiting') : null;
    fields.link = str(e.htmlLink) || null;
  }
  return { key, fields };
}

async function calendarPass(get: Get, conn: Connection, w: Writer, now: number): Promise<string> {
  const st = { ...(conn.calendar ?? {}) };
  const full = st.sync === undefined || (st.full ?? 0) + FULL_EVERY_MS <= now;
  const fromDay = wallIn(now - BEHIND_DAYS * 86_400_000, w.zone).day;
  const toDay = wallIn(now + AHEAD_DAYS * 86_400_000, w.zone).day;
  const seen = new Map<string, Record<string, unknown>>();
  let zone = w.zone;
  let name = st.name ?? conn.email;
  let sync: string | undefined;

  const read = async (base: URLSearchParams): Promise<void> => {
    let page = '';
    for (let i = 0; i < 6; i++) {
      const q = new URLSearchParams(base);
      if (page) q.set('pageToken', page);
      const got = await get(`${CALENDAR}?${q}`);
      zone = str(got.timeZone) || zone;
      name = str(got.summary) || name;
      for (const e of arr(got.items)) {
        const one = eventFields(e, zone, name, w.invites);
        if (one) seen.set(one.key, one.fields);
        if (one && typeof one.fields.day === 'string') conn.touch = touchEvent(conn.touch ?? {}, e, one.fields.day);
      }
      page = str(got.nextPageToken);
      sync = str(got.nextSyncToken) || sync;
      if (!page) break;
    }
  };

  let whole = full;
  if (!full) {
    try {
      await read(new URLSearchParams({ syncToken: st.sync ?? '', singleEvents: 'true', maxResults: '250' }));
    } catch (e) {
      /* A SYNC TOKEN GOOGLE NO LONGER KNOWS: read the window whole. */
      if (!(e instanceof Fault) || e.status !== 410) throw e;
      whole = true;
      seen.clear();
    }
  }
  if (whole)
    await read(
      new URLSearchParams({
        singleEvents: 'true',
        maxResults: '250',
        timeMin: new Date(now - BEHIND_DAYS * 86_400_000).toISOString(),
        timeMax: new Date(now + AHEAD_DAYS * 86_400_000).toISOString(),
      }),
    );

  const held = await w.heldEvents(fromDay);
  let wrote = 0;
  for (const [key, fields] of seen) {
    const day = String(fields.day);
    const row = held.get(key);
    if (day < fromDay || day > toDay) {
      /* OUT OF THE WINDOW NOW: a held one moved away is marked gone, nothing new is added. */
      if (row && row.fields.gone !== true) {
        await w.changeEvent(row.seq, row.version, { gone: true });
        wrote += 1;
      }
      continue;
    }
    if (!row) {
      if (fields.gone === true) continue;
      await w.addEvent(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)));
      wrote += 1;
      continue;
    }
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      const was = row.fields[k];
      if ((was === undefined || was === null) && (v === null || v === undefined)) continue;
      if (was !== v) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) continue;
    await w.changeEvent(row.seq, row.version, patch);
    wrote += 1;
  }
  /* READ WHOLE, AN EVENT OF THIS CALENDAR NO LONGER THERE IS GONE, as the ICS reader marks it. Only rows of this
     calendar, so another calendar's ICS rows are left to their own reader. */
  if (whole)
    for (const [key, row] of held) {
      if (seen.has(key) || row.fields.gone === true || row.fields.calendar !== name) continue;
      await w.changeEvent(row.seq, row.version, { gone: true });
      wrote += 1;
    }
  conn.calendar = { sync: sync ?? st.sync, full: whole ? now : st.full, name };
  return wrote === 0 ? 'calendar up to date' : `${String(wrote)} ${wrote === 1 ? 'event' : 'events'}`;
}

/* ── Contacts ────────────────────────────────────────────────────────────── */

/** The most cards one run looks at; the rest wait for the next, from the page it stopped on. */
const CARDS_MOST = 400;

/**
 * The addresses his account goes by: the one connected, and Gmail's send-as list, read once a day. A list that cannot be
 * read keeps the last one, and is tried again the next day.
 */
async function ownOf(get: Get, conn: Connection, now: number): Promise<string[]> {
  if (conn.own === undefined || conn.own.at + FULL_EVERY_MS <= now) {
    try {
      const got = await get(`${GMAIL}/settings/sendAs`);
      const list = arr(got.sendAs).map((x) => str(x.sendAsEmail).trim().toLowerCase()).filter((a) => a.includes('@'));
      conn.own = { list: [...new Set(list)].slice(0, 20), at: now };
    } catch {
      conn.own = { list: conn.own?.list ?? [], at: now };
    }
  }
  return [...new Set([conn.email.trim().toLowerCase(), ...conn.own.list])].filter((a) => a.includes('@'));
}

/**
 * Google Contacts, for the people rule: each card is handed on with every address and phone it holds and what the other
 * passes saw of the two of them (`seenOf`), and the record decides (`meetContact`). A card is never a person for being a
 * card. THE WHOLE BOOK IS READ AGAIN ONCE A DAY, so a card left out yesterday is looked at again once he has written to
 * them; between, only the cards Google says changed.
 */
async function contactsPass(get: Get, conn: Connection, w: Writer, now: number): Promise<string> {
  const st = { ...(conn.contacts ?? {}) };
  let page = st.page ?? '';
  let sync = st.sync;
  let whole = st.whole === true;
  if (page === '' && (sync === undefined || (st.full ?? 0) + FULL_EVERY_MS <= now)) {
    sync = undefined;
    whole = true;
  }
  const from = wallIn(now - LOOK_BACK_DAYS * 86_400_000, w.zone).day;
  const today = wallIn(now, w.zone).day;
  conn.touch = { sent: pruned(conn.touch?.sent, from), heard: pruned(conn.touch?.heard, from), met: pruned(conn.touch?.met, from) };
  const touch = conn.touch;
  let own: string[] | null = null;
  const did = { self: 0, matched: 0, added: 0, skipped: 0 };
  let looked = 0;
  const base = (): URLSearchParams => {
    const q = new URLSearchParams({ personFields: 'names,emailAddresses,phoneNumbers', pageSize: '200', requestSyncToken: 'true' });
    if (sync) q.set('syncToken', sync);
    if (page) q.set('pageToken', page);
    return q;
  };
  for (let i = 0; i < 3; i++) {
    let got: Record<string, unknown>;
    try {
      got = await get(`${PEOPLE}?${base()}`);
    } catch (e) {
      /* AN EXPIRED SYNC TOKEN: start over from the first page, the whole book. */
      if (e instanceof Fault && (e.status === 410 || e.status === 400) && (sync || page)) {
        sync = undefined;
        page = '';
        whole = true;
        continue;
      }
      throw e;
    }
    for (const p of arr(got.connections)) {
      if (((p.metadata ?? {}) as { deleted?: unknown }).deleted === true) continue;
      const emails = arr(p.emailAddresses).map((x) => str(x.value).trim()).filter((e) => e.includes('@'));
      const phones = arr(p.phoneNumbers).map((x) => str(x.canonicalForm).trim() || str(x.value).trim()).filter((n) => n !== '');
      if (emails.length === 0 && phones.length === 0) continue;
      own ??= await ownOf(get, conn, now);
      const name = clean(str(arr(p.names)[0]?.displayName), 120);
      did[await w.contact({ ...(name ? { name } : {}), emails, phones, own, ...seenOf(touch, emails, from, today) })] += 1;
      looked += 1;
    }
    page = str(got.nextPageToken);
    if (!page) {
      sync = str(got.nextSyncToken) || sync;
      if (whole) st.full = now;
      whole = false;
      break;
    }
    if (looked >= CARDS_MOST) break;
  }
  conn.contacts = { sync, ...(page ? { page } : {}), ...(st.full === undefined ? {} : { full: st.full }), ...(whole ? { whole: true } : {}) };
  return contactsLine(did);
}

/** The Contacts pass's line: who the cards turned out to be, so nobody is added without the sync saying so. */
export function contactsLine(did: Record<ContactDid, number>): string {
  const matched = did.self + did.matched;
  if (matched + did.added + did.skipped === 0) return 'contacts up to date';
  const left = did.skipped === 0 ? '' : `, ${String(did.skipped)} ${did.skipped === 1 ? 'contact' : 'contacts'} not added`;
  return `${String(matched)} ${matched === 1 ? 'person' : 'people'} matched, ${String(did.added)} added${left}`;
}

/* ── one sync ────────────────────────────────────────────────────────────── */

/**
 * One sync of a connection, changing `conn` in place: Gmail, then Calendar, then Contacts, each on its own so one that
 * fails does not stop the others. `access` is a fresh access token; the refresh token is not here.
 */
export async function syncOnce(conn: Connection, access: string, w: Writer, send: Send, now: number): Promise<void> {
  const get = getter(access, send);
  const said: string[] = [];
  let ok = true;
  const part = async (name: string, run: () => Promise<string>): Promise<void> => {
    try {
      said.push(await run());
    } catch (e) {
      ok = false;
      said.push(`${name} did not answer${e instanceof Fault ? ` (${String(e.status)})` : ''}`);
    }
  };
  if (w.mail) await part('Gmail', () => gmailPass(get, conn, w, now));
  if (w.events) await part('Calendar', () => calendarPass(get, conn, w, now));
  await part('Contacts', () => contactsPass(get, conn, w, now));
  conn.last = { at: now, said: said.join(', '), ok };
  conn.due = now + SYNC_EVERY_MS;
}

/* ── what the sync writes through ────────────────────────────────────────── */

/** The lists this sync fills itself, whose rows never say he knows somebody: the Gmail add-on's mail, the Calendar's events. */
const OWN_LISTS = ['gmail_mail', 'events'] as const;

/**
 * What the sync writes through: the add-ons' own door and lists, and the people rule, as the system. HERE AND NOT IN THE
 * RECORD'S OBJECT, so the one the alarm runs is the one `node --test` runs (`test/google-people.test.ts`).
 */
export function googleWriter(api: RecordApi): Writer {
  const sys: CallContext = { principal: { kind: 'system', id: 'google' } };
  const events = api.kernel.register('events');
  const hasField = (id: string): boolean => events?.fields.some((f) => f.id === id) === true;
  return {
    zone: api.kernel.identity()?.tz ?? 'UTC',
    mail: api.kernel.register('gmail_mail') !== undefined,
    events: hasField('key'),
    invites: hasField('response') && hasField('organiser'),
    arrive: async (body) => {
      const bytes = new TextEncoder().encode(body);
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const out = await api.arrive({ channel: 'webhook', headers: { 'content-type': 'text/plain; charset=utf-8' }, body, sha256, verified: true, ingest: 'gmail_in' });
      return out.ok;
    },
    heldEvents: async (fromDay) => {
      const held = new Map<string, { seq: number; version: number; fields: Record<string, unknown> }>();
      let cursor: string | null = null;
      for (let i = 0; i < 20; i++) {
        const page = await api.list({ register: 'events', where: { all: [{ field: 'day', gte: fromDay }] }, limit: 200, cursor }, sys);
        if (!page.ok) break;
        for (const r of page.value.rows) if (r.seq !== null && typeof r.fields.key === 'string') held.set(r.fields.key, { seq: r.seq, version: r.version, fields: r.fields });
        cursor = page.value.cursor;
        if (cursor === null) break;
      }
      return held;
    },
    addEvent: async (fields) => {
      await api.create({ register: 'events', fields: fields as never }, sys);
    },
    changeEvent: async (seq, version, patch) => {
      await api.update({ register: 'events', seq, version, patch: patch as never }, sys);
    },
    contact: async (said) => {
      const out = await api.meetContact({ ...said, skip: [...OWN_LISTS], source: 'Google Contacts' }, sys);
      return out.ok ? out.value.did : 'skipped';
    },
  };
}
