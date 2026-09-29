/**
 * An agent's keys over HTTP: `POST /api/vault/deposit` and `POST /api/vault/open`, the half both hosts share.
 * `12 §6`, ADR-062.
 *
 * THE BEARER IS A VAULT GRANT, EXCEPT THAT A LOGIN TOKEN MAY ADD A KEY. It is checked with the record's `vaultGrant`
 * first, which never accepts a login token, so the bearer an agent uses for everything else opens no key. Only at
 * `/api/vault/deposit`, and only on a host that wires `token` and `depositByToken`, a bearer that is not a vault grant
 * is then asked as the host asks any `/api` bearer, and a `write` token's key is deposited as a NEW key in its run's
 * project. Replacing a value still needs a vault grant or the owner, which the record
 * decides, so a login token that leaks can add a key and never swap one. `/api/vault/open` takes a vault grant only.
 *
 * NO VALUE IS NAMED HERE. The body is parsed and handed whole to the host's own vault module, `vault.ts` in the
 * self-host or the Worker, which is where a plaintext may exist: it seals or opens the value and builds the answer.
 *
 * NOTHING HERE LOGS.
 */

import type { Refusal, Result } from '@braindog/ports';

import { httpStatus } from './index.ts';
import { sessionOf, type SessionHints } from './session.ts';

/** The record's `VaultGrant`, as this package sees it without importing the kernel. */
export type VaultGrantSeen = { handle: string; scope: string; person: string; expires: string };

/** One checked request: the grant, the run the caller names, and the body, unread. */
export type VaultAsk = { grant: VaultGrantSeen; hints: SessionHints; body: Record<string, unknown> };

/** One checked deposit by an agent's login token: the context the host built for it, the run's hints, and the body. */
export type VaultTokenAsk<C> = { ctx: C; hints: SessionHints; body: Record<string, unknown> };

/**
 * A host's half. `C` is the host's call context, which this package names without importing the record.
 *
 * `token` AND `depositByToken` COME TOGETHER OR NOT AT ALL. A host with neither is the door as it always was: a vault
 * grant or nothing.
 */
export type VaultDoor<C = never> = {
  /** The record's `vaultGrant`: in process on the self-host, over RPC on the Worker. */
  grant(bearer: string): Promise<Result<VaultGrantSeen>>;
  /**
   * An agent's login token, checked as the host checks any `/api` bearer: the context it builds, or a refusal. Asked
   * only at the deposit door and only for a bearer `grant` did not take. The whole request is handed over, because a
   * host's bearer check reads its headers, and its body is still unread.
   */
  token?: ((request: Request) => Promise<Result<C>>) | undefined;
  /** The host's vault step. Absent where the host holds no key store, and then both doors answer `NOT_IN_THIS_BUILD`. */
  keys?:
    | {
        deposit(ask: VaultAsk): Promise<Result<unknown>>;
        open(ask: VaultAsk): Promise<Response>;
        /** The deposit for a login token, which the host hands the record with `agentDeposit` set. */
        depositByToken?: ((ask: VaultTokenAsk<C>) => Promise<Result<unknown>>) | undefined;
      }
    | undefined;
};

/** Which of the two doors a path is, or `null`. */
export function servesVault(pathname: string): 'deposit' | 'open' | null {
  const hit = /^\/+api\/+vault\/+(deposit|open)\/*$/.exec(pathname)?.[1];
  return hit === 'deposit' || hit === 'open' ? hit : null;
}

/** A deposited value is at most 64 KiB, and the rest of a body is a label and a sentence. */
const BODY_LIMIT = 70_000;

type Header = readonly [string, string];

/* One caller's answer and never a cache's. */
export const VAULT_HEADERS: readonly Header[] = [
  ['content-type', 'application/json; charset=utf-8'],
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

function reply(status: number, payload: object, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...VAULT_HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal, extra: readonly Header[] = []): Response => reply(status, { ok: false, refusal: refused }, extra);

/**
 * A refusal's wait, in the `Retry-After` header a client already reads, as `serveApi` sends it on every route.
 *
 * THE KEY DOORS ANSWER `RATE_LIMITED` TOO, once the vault passphrase has been tried too often (`12 §6`, "The optional
 * second factor"), and its `retry_after` was only in the body here, where every other route also puts it in the header.
 */
export const retryAfter = (out: Result<unknown>): readonly Header[] => {
  const wait = !out.ok && 'refusal' in out ? out.refusal.retry_after : undefined;
  return typeof wait === 'number' && Number.isSafeInteger(wait) && wait > 0 ? [['retry-after', String(wait)]] : [];
};

/** A result as the door answers it, with the status every other route gives it. */
export const vaultReply = (out: Result<unknown>): Response => reply(httpStatus(out), out, retryAfter(out));

/**
 * Answer one of the two doors.
 *
 * THE ORDER: the method, then a page, then the bearer, then the grant, and only then the body. A request with no
 * vault grant has no body read at all, and a host with no key store says so only to a caller holding one. A login
 * token at the deposit door takes the grant's place in that order, and the body is still read only after it.
 */
export async function serveVault<C = never>(request: Request, door: VaultDoor<C>): Promise<Response> {
  const which = servesVault(new URL(request.url).pathname);
  if (which === null) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'The key doors are /api/vault/deposit and /api/vault/open.' });
  if (request.method !== 'POST')
    return refusal(405, { code: 'ROUTE_UNKNOWN', fix: `/api/vault/${which} takes a POST.` }, [['allow', 'POST']]);

  /* A TERMINAL SENDS NO `Origin` AND A BROWSER ALWAYS DOES ON A POST. A page has no business holding a vault grant, its
     own origin's included, so any page is refused. */
  if (request.headers.get('origin') !== null)
    return refusal(403, { code: 'FORBIDDEN', fix: 'Keys are deposited and read from a terminal, never from a web page.', at: 'origin' });

  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (bearer === undefined)
    return refusal(
      401,
      {
        code: 'UNAUTHORIZED',
        fix: 'A key door takes a vault grant as its bearer, and the deposit door takes a login token too. Run braindog login <host> --vault <project>.',
        at: 'authorization',
      },
      [['www-authenticate', 'Bearer']],
    );
  const grant = await door.grant(bearer);
  /* A LOGIN TOKEN IS ASKED ONLY WHEN THE BEARER IS NO VAULT GRANT, ONLY AT THE DEPOSIT DOOR, AND ONLY ON A HOST THAT
     WIRED BOTH HALVES. When it is refused too, the answer is the grant's refusal, as it always was: nothing here can
     tell which of the two a stranger meant to send, and the door's first sentence is about the vault grant. */
  const byToken = which === 'deposit' ? door.keys?.depositByToken : undefined;
  let agent: { ctx: C } | null = null;
  if (!grant.ok) {
    const seen = byToken !== undefined && door.token !== undefined ? await door.token(request) : null;
    if (seen === null || !seen.ok) return vaultReply(grant);
    agent = { ctx: seen.value };
  }

  if (!door.keys)
    return refusal(501, { code: 'NOT_IN_THIS_BUILD', fix: 'This host holds no key store yet, so it keeps no keys for agents.', at: 'keys' });

  if ((request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return refusal(400, { code: 'BODY_MALFORMED', fix: `/api/vault/${which} takes a JSON object, sent as application/json.` });
  const raw = await request.text();
  if (raw.length > BODY_LIMIT) return refusal(400, { code: 'BODY_MALFORMED', fix: 'A key is at most 64 KiB.', at: 'value' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    /* JSON.parse's message quotes the text around the fault, and the text is a key. */
    body = null;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    return refusal(400, { code: 'BODY_MALFORMED', fix: `/api/vault/${which} takes a JSON object, sent as application/json.` });

  const hints = sessionOf(request.headers);
  if (agent !== null || !grant.ok)
    return agent !== null && byToken !== undefined
      ? vaultReply(await byToken({ ctx: agent.ctx, hints, body: body as Record<string, unknown> }))
      : vaultReply(grant);
  const ask: VaultAsk = { grant: grant.value, hints, body: body as Record<string, unknown> };
  return which === 'deposit' ? vaultReply(await door.keys.deposit(ask)) : door.keys.open(ask);
}
