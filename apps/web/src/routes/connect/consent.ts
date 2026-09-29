/**
 * The consent screen an app's sign-in lands on: what it reads, which records it offers,
 * and what its two presses send, with no runes.
 *
 * PURE, SO `node --test` CAN IMPORT IT, for the reason `lib/record/device.ts` gives. The fetch is handed in.
 *
 * THE HOST'S DOORS, NOT THE RECORD'S. `GET /oauth/request`, `POST /oauth/approve` and `POST /oauth/deny` are the
 * authorization server's (`packages/host/src/oauth.ts`), at the root of the origin the app is served from and under no
 * record, as `/account/records` is (`lib/record/switcher.ts`). Approve is refused from any other origin and without a
 * browser session proved in the last fifteen minutes, and the session is the cookie this page's fetch carries.
 *
 * THEIR ERRORS ARE OAUTH'S OWN, `{ error, error_description }` (RFC 6749 §5.2), never a record's refusal, and the
 * description is already a sentence written for the person at this screen. So it is drawn as it came.
 */

import { copy } from '../../lib/copy.ts';
import type { Result } from '../../lib/data/read.ts';

/** A key's scope, in the ladder's order: each opens what the one before it does. */
export type Scope = 'read' | 'propose' | 'write';
const SCOPES: readonly Scope[] = ['read', 'propose', 'write'];
const isScope = (x: unknown): x is Scope => typeof x === 'string' && (SCOPES as readonly string[]).includes(x);

/** One held sign-in, as `GET /oauth/request` answers it (`Consent` in `packages/host/src/oauth.ts`). */
export type Consent = {
  request: string;
  client_name: string;
  redirect_host: string;
  /** The most the app asked for, or `null` when it asked for no scope in particular. */
  scope: Scope | null;
  /** What the person may allow, in the ladder's order, never empty. */
  offers: Scope[];
  /** The one chosen before the person chooses: `propose` or less, because an agent proposes and a person decides. */
  suggested: Scope;
};

/** What the screen draws: the request to answer, or the host's sentence for why there is none to answer any more. */
export type Asked = { held: Consent } | { gone: string };

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** OAuth's own sentence in an error body, or `null` when the body is not one. */
function oauthSaid(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const said = (body as { error_description?: unknown }).error_description;
  return typeof said === 'string' && said.trim() !== '' ? said : null;
}

/** A held request as the host answered it, or `null` for anything that is not one. */
function consentOf(body: unknown): Consent | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const offers = Array.isArray(b.offers) ? b.offers.filter(isScope) : [];
  if (typeof b.request !== 'string' || typeof b.client_name !== 'string' || typeof b.redirect_host !== 'string') return null;
  if (!isScope(b.suggested) || offers.length === 0) return null;
  return { request: b.request, client_name: b.client_name, redirect_host: b.redirect_host, scope: isScope(b.scope) ? b.scope : null, offers, suggested: b.suggested };
}

/**
 * `GET /oauth/request?request=<id>`: the sign-in waiting for this person, or the host's sentence for why it is not.
 *
 * AN ENDED SIGN-IN IS AN ANSWER, NOT A REFUSAL. Ten minutes pass, or the other tab already allowed it, and the host
 * says so in words (`REQUEST_GONE`); that is a designed state of this screen and not a failure of it. Only a host that
 * could not be reached, or answered in no shape OAuth writes, is the read failing.
 */
export async function readConsent(io: Fetch, id: string): Promise<Result<Asked>> {
  let res: Response;
  try {
    res = await io(`/oauth/request?request=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
  } catch (e) {
    return { ok: false, refusal: { code: 'UNREACHABLE', fix: copy.readOffline, detail: e instanceof Error ? e.message : String(e) } };
  }
  const body: unknown = await res.json().catch(() => undefined);
  const held = res.ok ? consentOf(body) : null;
  if (held !== null) return { ok: true, value: { held } };
  const said = oauthSaid(body);
  if (said !== null && res.status < 500) return { ok: true, value: { gone: said } };
  return { ok: false, refusal: { code: 'UNREACHABLE', fix: copy.readOffline, detail: `The host answered ${res.status} without a sign-in to show.` } };
}

/** A record the person may connect an app to: its address name and the name it calls itself. */
export type Choice = { slug: string; name: string };

/** As much of the shell as the choice reads: the record open in this tab, and the person with the records they reach. */
export type ShellSeen = {
  index: { slug: string; name: string };
  me: { owner: boolean; level: string; records: readonly { slug: string; name: string; level: string | null }[] };
};

/**
 * The records this screen offers: the one the address names, or every record this person owns.
 *
 * ONLY AN OWNER'S, because only an owner may mint a key (`createToken` is ADMIN), and the host's approve door asks the
 * record itself, which refuses anybody else. Offering a record that will refuse wastes the one press that matters.
 *
 * UNDER A SLUG, THAT RECORD AND NO OTHER, the record the session names. The address was chosen, so the
 * screen does not offer to connect the app somewhere else instead.
 */
export function choicesOf(shell: ShellSeen, here: string | null): Choice[] {
  const owns = shell.me.owner || shell.me.level === 'owner';
  if (here !== null) return owns ? [{ slug: here, name: shell.index.name }] : [];
  const owned = shell.me.records.filter((r) => r.level === 'owner').map((r) => ({ slug: r.slug, name: r.name }));
  if (owned.length > 0) return owned;
  /* THE ACCOUNT'S LIST COULD NOT BE READ, and the record open in this tab is still one the person owns. */
  return owns && shell.index.slug !== '' ? [{ slug: shell.index.slug, name: shell.index.name }] : [];
}

/** What a press came to: the app's own address to go back to, or the host's sentence and whether signing in again is the fix. */
export type Sent = { ok: true; to: string } | { ok: false; say: string; signIn: boolean };

/** An address the browser may be sent to: a whole `https:` or `http:` URL, which is all the host ever answers with. */
function isAddress(to: string): boolean {
  try {
    const url = new URL(to);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * `POST /oauth/approve { request, record, scope }` or `POST /oauth/deny { request }`, as JSON, so the host answers
 * `{ redirect }` rather than a page: the address the app is waiting at, with its code or its refusal.
 *
 * A 401 IS "SIGN IN AGAIN": no session in this browser, or one proved longer ago than the fifteen minutes an app's
 * ninety days are worth. The host's sentence says which.
 */
export async function answer(io: Fetch, door: 'approve' | 'deny', body: Readonly<Record<string, string>>): Promise<Sent> {
  let res: Response;
  try {
    res = await io(`/oauth/${door}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, say: copy.readOffline, signIn: false };
  }
  const said: unknown = await res.json().catch(() => undefined);
  const to = res.ok && typeof said === 'object' && said !== null ? (said as { redirect?: unknown }).redirect : undefined;
  if (typeof to === 'string' && isAddress(to)) return { ok: true, to };
  return { ok: false, say: oauthSaid(said) ?? copy.consentFailed, signIn: res.status === 401 };
}
