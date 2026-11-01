/**
 * A link to one page that anybody holding it may read: the token both hosts sign and check, the door that reads it,
 * and the step that turns the record's `openShare` answer into a link
 * (`docs/51-SPEC-WORKER.md` §5.6).
 *
 * THE RECORD NEVER HOLDS THE KEY. A link's token is `<record id>.<claim>.<mac>`: the claim is `{ id, slug, exp }`
 * written as JCS and then base64url, and the MAC is HMAC-SHA-256 over `<record id>.<claim>` under a key derived from
 * the host's root key with the info `braindog/share`, the way `auth.ts` derives the Directory's session key with
 * `braindog/session`. A key derived for this one job is a key whose leak says nothing about the root or the sessions.
 * The record writes `share.open` when the owner opens a link and `share.close` when it is closed, and it is the record
 * that says whether a link still opens anything; this file says only whether the bytes are ones this host signed.
 *
 * EVERY REFUSAL IS ONE 404 WITH NO BODY. A closed link, an expired one, one flipped byte, a record this host does not
 * hold, a page the owner can no longer read and a record that refused for any other reason all answer the same way, so
 * a stranger holding a link learns from the answer that it does not open and nothing else. The one other answer is the
 * 429 of a link read too often, which is given only after the MAC has been checked, so it tells nothing to somebody who
 * does not already hold a good link.
 *
 * NOTHING HERE IMPORTS `limits.ts`. That file reads `ROUTES` from `index.ts` as it loads, and `index.ts` re-exports this
 * one, so an import here would be a cycle that throws depending on which module a host happens to load first. The
 * limit is the host's to ask, through `SharedDoor.spend`.
 */

import { jcs } from '@braindog/kernel';
import type { Refusal, Result } from '@braindog/ports';

import type { Handler } from './index.ts';

/** The HKDF info a share key is derived under: one key for this job and no other. */
export const SHARE_INFO = 'braindog/share';

/**
 * The longest token this host reads, checked before any byte is decoded or hashed.
 *
 * A token is a record id, a claim holding an id of at most `ID_MOST` characters, a slug of at most `SLUG_MOST` and an
 * instant, written as base64url, and a MAC, so every token this host mints fits under it. The header is a stranger's,
 * and this is the ceiling on the work one of them buys.
 */
export const SHARE_TOKEN_MOST = 1024;

/** The longest share id and slug a claim may carry. The record mints both, so anything longer was not minted here. */
const ID_MOST = 64;
const SLUG_MOST = 200;

/** What a link says, signed: the share's id, the page's slug, and when it stops opening, in whole seconds since 1970. */
export type ShareClaim = { id: string; slug: string; exp: number };

/** A link read back and found to be one this host signed: its claim, and the record it names. */
export type SharedLink = ShareClaim & { record: string };

/**
 * The context a host hands the record for a link it has checked.
 *
 * THE PRINCIPAL IS THE LINK AND NOT A PERSON, `{ kind: 'share' }` as `packages/record`'s `Principal` names it. The
 * record admits it to `sharedPage` and to nothing else, and reads the page as the owner who opened the link could read
 * it now. Written here structurally, as `limits.ts` writes its door, so this package names no type of the record's.
 */
export type ShareContext = { principal: { kind: 'share'; id: string; slug: string } };

/** What the record answers `openShare` with, before the host signs it. */
export type ShareOpened = { id: string; slug: string; expires_at: string };

/**
 * `openShare` as the owner receives it: the link, once. Show it once, and keep it nowhere.
 *
 * THE HOST ADDS `token` AND `url`, because the host holds the key and the record does not. The record's own answer is
 * `ShareOpened`, and a record that cannot be signed for is refused before it writes (`NO_SHARE_KEY`).
 */
export type ShareLink = ShareOpened & { token: string; url: string };

/** `shares`: one link the record opened, open or closed, and never its token. */
export type ShareRow = { id: string; slug: string; title: string; opened_at: string; expires_at: string; closed_at: string | null; money?: boolean };

/** `closeShare`: the link that no longer opens anything. */
export type ShareClosed = { id: string; closed_at: string };

/**
 * What a host that holds no key to sign with answers `openShare`, before the record is asked, so no `share.open` is
 * written for a link nobody could be handed.
 */
export const NO_SHARE_KEY: Refusal = {
  code: 'NOT_IN_THIS_BUILD',
  fix: 'This BrainDog holds no key to sign a shared link with, so no link was made.',
  at: 'host',
};

/** What the owner is told when the record's answer is not one this host can sign, which the record never sends. */
const UNSIGNED: Refusal = {
  code: 'NOT_IN_THIS_BUILD',
  fix: 'This BrainDog opened a link it could not sign, so there is nothing to share. Close it under shared links and share the page again.',
  at: 'host',
};

/**
 * The share key, by HKDF-SHA-256 with the info `braindog/share`, from the root key's bytes or another host secret.
 *
 * THE SAME DERIVATION AS `deriveSessionKey` WITH ITS OWN INFO, and a copy of the material is zero-filled once it is
 * imported, as there. The caller's bytes are left as they came.
 */
export async function deriveShareKey(material: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(material);
  const base = await crypto.subtle.importKey('raw', copy, 'HKDF', false, ['deriveBits']);
  copy.fill(0);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(SHARE_INFO) },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/** The share key as an HMAC key. A copy is imported, so the caller's bytes are never handed to the platform. */
const macKey = (key: Uint8Array) => crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

/** Bytes as base64url with no padding, which is what a token is written in. */
const b64url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * base64url with no padding back to bytes, or `null` for text that is not that.
 *
 * ONLY THE ONE SPELLING `b64url` WRITES. The last character of a 32-byte MAC carries two bits no byte uses, so four
 * spellings decode to the same bytes, and without this a link whose last character was changed to another of them
 * would still open. A token this host did not write character for character is one it does not read.
 */
const fromB64url = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return b64url(bytes) === text ? bytes : null;
  } catch {
    return null;
  }
};

/** A record id as a token may carry one. The MAC is what proves it; this only keeps a stranger's text short and plain. */
const RECORD = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A link's token for one share on one record.
 *
 * THE RECORD ID IS UNDER THE MAC, so a claim signed for one record cannot be moved in front of another's id, and the
 * claim is JCS so the bytes signed are the bytes any host would write for the same three values.
 */
export async function shareToken(key: Uint8Array, record: string, claim: ShareClaim): Promise<string> {
  const said = b64url(new TextEncoder().encode(jcs({ id: claim.id, slug: claim.slug, exp: claim.exp })));
  const signed = `${record}.${said}`;
  const mac = await crypto.subtle.sign('HMAC', await macKey(key), new TextEncoder().encode(signed));
  return `${signed}.${b64url(new Uint8Array(mac))}`;
}

/** Whether a parsed claim is exactly the three values a token carries, each of the shape the record mints. */
const isClaim = (x: unknown): x is ShareClaim => {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const c = x as Record<string, unknown>;
  const keys = Object.keys(c).sort();
  return (
    keys.length === 3 &&
    keys[0] === 'exp' &&
    keys[1] === 'id' &&
    keys[2] === 'slug' &&
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    c.id.length <= ID_MOST &&
    typeof c.slug === 'string' &&
    c.slug.length > 0 &&
    c.slug.length <= SLUG_MOST &&
    typeof c.exp === 'number' &&
    Number.isSafeInteger(c.exp) &&
    c.exp > 0
  );
};

/**
 * A token read back: the link it names, or `null` for anything that is not a live link this key signed.
 *
 * THE MAC IS CHECKED BEFORE THE CLAIM IS PARSED, so nothing a stranger wrote is read as JSON until the host knows it
 * wrote it. `crypto.subtle.verify` compares in time that does not depend on where the bytes differ. `now` is epoch
 * milliseconds, the host's clock, handed in; a link whose `exp` has come is `null` like any other that does not open.
 */
export async function readShareToken(key: Uint8Array, token: string, now: number): Promise<SharedLink | null> {
  if (token.length > SHARE_TOKEN_MOST) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [record, said, mac] = parts as [string, string, string];
  if (!RECORD.test(record)) return null;
  const sent = fromB64url(mac);
  if (sent === null || fromB64url(said) === null) return null;
  const good = await crypto.subtle.verify('HMAC', await macKey(key), sent, new TextEncoder().encode(`${record}.${said}`));
  if (!good) return null;
  const bytes = fromB64url(said);
  if (bytes === null) return null;
  let claim: unknown;
  try {
    claim = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    return null;
  }
  if (!isClaim(claim) || claim.exp * 1000 <= now) return null;
  return { record, id: claim.id, slug: claim.slug, exp: claim.exp };
}

/**
 * The token an `Authorization: Share <token>` header carries, or `null` for any other header or none.
 *
 * THE SCHEME IS READ BEFORE ANY BEARER IS, on both hosts: each reads any `Authorization` header as a bearer, and a link
 * is not one, so a `Share` header that reached the bearer path would be answered 401 as a token nobody minted.
 */
export function shareOf(authorization: string | null): string | null {
  return /^Share[ \t]+(\S+)[ \t]*$/i.exec(authorization ?? '')?.[1] ?? null;
}

/** Whether a path is the one a link reads, `/api/sharedPage`. A link opens that method and no other. */
export const servesShared = (pathname: string): boolean => /^\/+api\/+sharedPage\/*$/.test(pathname);

/** Whether a request is the owner opening a link, `POST /api/openShare`, whose answer a host signs. */
export const opensShare = (method: string, pathname: string): boolean => method === 'POST' && /^\/+api\/+openShare\/*$/.test(pathname);

/** The one answer to a link that does not open: 404, no body, and `no-store` as every answer on `/api/*` carries. */
export const sharedNone = (): Response => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });

/** What a host hands the door: its key, whether it holds a record, its read limit, its clock and the record's answer. */
export type SharedDoor = {
  /** The share key, or `null` on a host that holds none, where every link is the 404. */
  key: () => Promise<Uint8Array | null>;
  /** Whether this host holds that record now. Asked after the MAC, so a stranger's record id never addresses anything. */
  knows: (record: string) => Promise<boolean>;
  /**
   * Spend one read of the host's read budget against `key`, and answer `null` to go on or the 429 to send.
   *
   * THE KEY IS `share:<id>`, WHICH IS `limitKey`'s SHAPE FOR THIS PRINCIPAL (`limits.ts`), so a link is counted as one
   * caller reading the owner's record: a link posted somewhere public spends its own budget and never the owner's.
   */
  spend: (key: string) => Promise<Response | null>;
  now: () => number;
  /** The record's answer to `sharedPage` for this context: the Worker forwards it, the self-host serves it. */
  answer: (record: string, ctx: ShareContext, request: Request) => Promise<Response>;
};

/**
 * `GET` or `POST /api/sharedPage` with `Authorization: Share <token>`: the page the link opens, or the one 404.
 *
 * THE ORDER IS THE WHOLE OF IT. The path first, so a link sent anywhere else opens nothing; then the key; then the MAC
 * and the expiry; then whether this host holds the record, so an id nobody holds wakes nothing; then the read budget;
 * and only then the record, which decides whether the link is still open and what the page holds. Whatever the record
 * answers other than a 200 is the same 404.
 */
export async function serveShared(request: Request, token: string, door: SharedDoor): Promise<Response> {
  if (!servesShared(new URL(request.url).pathname) || (request.method !== 'GET' && request.method !== 'POST')) return sharedNone();
  const key = await door.key();
  if (key === null) return sharedNone();
  const link = await readShareToken(key, token, door.now());
  if (link === null || !(await door.knows(link.record))) return sharedNone();
  const wait = await door.spend(`share:${link.id}`);
  if (wait !== null) return wait;
  const out = await door.answer(link.record, { principal: { kind: 'share', id: link.id, slug: link.slug } }, request);
  return out.status === 200 ? out : sharedNone();
}

/** What a host signs a link with: its share key, the record the link is for, and the origin the app is served from. */
export type ShareSigner = { key: Uint8Array; record: string; origin: string };

/** Whether the record's answer is the one `openShare` gives, which is all a host signs. */
const isOpened = (x: unknown): x is ShareOpened => {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.slug === 'string' && typeof o.expires_at === 'string' && Number.isFinite(Date.parse(o.expires_at));
};

/**
 * The record's `openShare` answer with the link signed into it: `token`, and `url`, which is `<origin>/s#<token>`.
 *
 * THE TOKEN RIDES IN THE FRAGMENT, NEVER THE PATH. A browser sends no fragment to any server, so the secret is in no
 * access log, no proxy's and no Worker's, and the page reads it and wipes it from the address bar, as an invite does;
 * it reaches a host only as `Authorization: Share <token>` on `/api/sharedPage`.
 *
 * A REFUSAL PASSES THROUGH UNCHANGED, and the link expires when the record's `share.open` says it does, to the second
 * below it, so the host and the record never disagree about the day a link stops. An empty origin writes the address
 * from the root, `/s#<token>`, which the app reads against its own.
 */
export async function linkOpened(out: Result<unknown>, by: ShareSigner): Promise<Result<ShareLink>> {
  if (!out.ok) return out;
  if (!isOpened(out.value)) return { ok: false, refusal: UNSIGNED };
  const { id, slug, expires_at } = out.value;
  const token = await shareToken(by.key, by.record, { id, slug, exp: Math.floor(Date.parse(expires_at) / 1000) });
  return { ok: true, value: { id, slug, expires_at, token, url: `${by.origin}/s#${token}` } };
}

/**
 * `handlersFor`'s table with `openShare` answered as a link: refused before the record writes when there is no key, and
 * signed after it answers when there is.
 *
 * FOR A HOST THAT CALLS THE RECORD IN ITS OWN PROCESS, the self-host. The Worker answers `openShare` inside the record's
 * Durable Object, where the key is not, so it signs the object's answer at its door with `linkOpened` instead, and both
 * make the same link. A table with no `openShare` row is handed back as it came.
 *
 * WHO IS ASKING IS SAID BEFORE WHAT THIS HOST LACKS. With no key, the record's `shareable` (a read, the same ADMIN guard)
 * is asked first, so a token or a member is refused as every ADMIN method refuses them, and only the owner learns that
 * this host makes no links.
 */
export function withShareLinks(handlers: Record<string, Handler>, signer: () => Promise<ShareSigner | null>): Record<string, Handler> {
  const open = handlers.openShare;
  if (open === undefined) return handlers;
  return {
    ...handlers,
    openShare: async (args, ctx) => {
      const by = await signer();
      if (by === null) {
        const asked = handlers.shareable === undefined ? null : await handlers.shareable({}, ctx);
        if (asked !== null && !asked.ok) return asked;
        return { ok: false, refusal: NO_SHARE_KEY };
      }
      return linkOpened(await open(args, ctx), by);
    },
  };
}
