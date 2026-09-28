/**
 * An owner's own keys, from the app: `POST /api/keys/put` and `POST /api/keys/open`, the half both hosts share.
 * `12 §6`, ADR-062.
 *
 * THIS IS THE VAULT DOORS' RULE INVERTED, NOT THE VAULT DOORS RELAXED. `/api/vault/*` takes a vault grant's bearer
 * and refuses any request carrying an `Origin`, because a page has no business holding one, and that rule is
 * untouched. This is a second door with a different credential: a browser session, no bearer at all, and an
 * `Origin` this host answers for. The two share nothing but the host step behind them, so weakening one is not a
 * way to reach the other.
 *
 * THE ORDER: the method, then a bearer, then the origin, then the body. A bearer is refused
 * `NEEDS_BROWSER_SESSION` whatever it is, the server key included, because what is missing is a person in a
 * browser and not a wider token: telling somebody to go and get a bigger bearer would be a wrong sentence and a
 * wasted afternoon. A request with no `Origin`, or one this host does not answer for, is refused: that is the half
 * of CSRF that does not depend on the browser (`12 §8`), and it is why this door can take a cookie at all.
 *
 * WHO THE SESSION IS STAYS THE RECORD'S QUESTION. This hands the context it was given to the host's own key step,
 * which calls the record, whose `vault(ctx)` gate wants an owner, no token, and a proof under fifteen minutes old.
 *
 * NO VALUE IS NAMED HERE, as in `vault.ts`. The body is parsed and handed whole to the host's key module, which is
 * where a plaintext may exist. NOTHING HERE LOGS.
 *
 * NOR THE VAULT PASSPHRASE, which the body also carries while the vault is behind one (`12 §6`, "The optional second
 * factor"). The host's key module hands it to `unlockedKey` (`passphrase.ts`), whose step the record's `unlockVault`
 * calls after the vault gate, and the record is told only whether it opened the record key.
 */

import type { Refusal, Result } from '@braindog/ports';

import { httpStatus } from './index.ts';
import { sessionOf, type SessionHints } from './session.ts';
import { retryAfter, VAULT_HEADERS } from './vault.ts';

/** One checked request: the session as the host resolved it, the run the caller names, and the body, unread. */
export type KeysAsk<C> = { ctx: C; hints: SessionHints; body: Record<string, unknown> };

/**
 * A host's half, over whatever context that host resolves a session to.
 *
 * `origins` IS THE ORIGINS THIS HOST ANSWERS FOR, and an empty set closes the door: a host that cannot say what
 * its own address is cannot tell a page of its own from a page somewhere else.
 */
export type KeysDoor<C> = {
  origins: ReadonlySet<string>;
  /** The host's key step. Absent where the host holds no key store, and then both doors answer `NOT_IN_THIS_BUILD`. */
  keys?: { put(ask: KeysAsk<C>): Promise<Result<unknown>>; open(ask: KeysAsk<C>): Promise<Response> } | undefined;
};

/** Which of the record's two data keys sealed a key's bytes (`12 §6`). */
export type SealedUnder = 'record' | 'connector';

/**
 * Which key a deposit asks to be sealed under: `record` for one a person uses, `connector` for one a scheduled
 * connector opens on its own. Unsaid is `record`, as it always was.
 *
 * READ HERE, BY BOTH HOSTS' DEPOSIT STEPS, AND NOT BY THE RECORD ALONE, because the choice changes which key the host
 * unwraps to seal, and a value the host cannot read is refused before any key is touched.
 *
 * NOT FROM AN AGENT'S LOGIN TOKEN. That door adds a key for the run to use and nothing else (`loop/finish/agents.md`
 * C1), and a key a scheduled run can open without a person present is the owner's to add, from the app, or an agent's
 * holding a vault grant. So the connector path stays behind a vault grant or a browser session.
 */
export function sealedUnderOf(body: Record<string, unknown>, agentDeposit = false): Result<SealedUnder> {
  const said = body.sealed_under;
  if (said === undefined || said === 'record') return { ok: true, value: 'record' };
  if (said !== 'connector')
    return {
      ok: false,
      refusal: {
        code: 'ENUM_VALUE_UNKNOWN',
        fix: 'A key is sealed for you to use (record) or for a scheduled connector (connector).',
        at: 'sealed_under',
        allowed: ['record', 'connector'],
      },
    };
  if (agentDeposit)
    return {
      ok: false,
      refusal: {
        code: 'FORBIDDEN',
        fix: 'A login token adds a key for its run to use. A key for a scheduled connector needs a vault grant (braindog login <host> --vault <project>) or the owner on the Keys screen.',
        at: 'sealed_under',
      },
    };
  return { ok: true, value: 'connector' };
}

/**
 * Which data key a seal target or a sealed read names: `connector` only when the record says so outright.
 *
 * READ OFF THE OBJECT RATHER THAN ITS TYPE, because the record's `SealTarget` and `OpenedForGrant` name the key they
 * hand out and, until the record says which of its two keys that is, every one of them is the record key. A target
 * that says nothing is unwrapped as it always was.
 */
export const purposeOf = (x: object): SealedUnder => ((x as { purpose?: unknown }).purpose === 'connector' ? 'connector' : 'record');

/** Which of the two doors a path is, or `null`. */
export function servesKeys(pathname: string): 'put' | 'open' | null {
  const hit = /^\/+api\/+keys\/+(put|open)\/*$/.exec(pathname)?.[1];
  return hit === 'put' || hit === 'open' ? hit : null;
}

/** A value is at most 64 KiB, and the rest of a body is a label and a sentence. The vault doors' limit. */
const BODY_LIMIT = 70_000;

type Header = readonly [string, string];

function reply(status: number, payload: object, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...VAULT_HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal, extra: readonly Header[] = []): Response => reply(status, { ok: false, refusal: refused }, extra);

/** A result as the door answers it, with the status every other route gives it. */
export const keysReply = (out: Result<unknown>): Response => reply(httpStatus(out), out, retryAfter(out));

/** The one sentence every bearer gets here, and it is the record's own. */
const NO_BEARER: Refusal = {
  code: 'NEEDS_BROWSER_SESSION',
  fix: 'Open this from the app; a token cannot reach the vault.',
  at: 'principal',
};

/** Answer one of the two doors, for the session this host has already resolved. */
export async function serveKeys<C>(request: Request, door: KeysDoor<C>, ctx: C): Promise<Response> {
  const which = servesKeys(new URL(request.url).pathname);
  if (which === null) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'The app key doors are /api/keys/put and /api/keys/open.' });
  if (request.method !== 'POST')
    return refusal(405, { code: 'ROUTE_UNKNOWN', fix: `/api/keys/${which} takes a POST.` }, [['allow', 'POST']]);

  /* A BEARER OF ANY KIND, BEFORE ANYTHING ELSE. The server key makes the owner on a self-host and would otherwise
     pass every check below it, so the header is what is refused rather than the principal behind it. */
  if (request.headers.get('authorization') !== null) return refusal(403, NO_BEARER);

  /* AND THE PAGE HAS TO BE THIS HOST'S. Every browser sends `Origin` on a POST, so a request with none is not a
     page, and a page somewhere else is the thing a session cookie cannot be allowed to serve. */
  const origin = request.headers.get('origin');
  if (origin === null || !door.origins.has(origin))
    return refusal(403, { code: 'FORBIDDEN', fix: 'Keys are put in and read from this app, in a browser, on this address.', at: 'origin' });

  if (!door.keys)
    return refusal(501, { code: 'NOT_IN_THIS_BUILD', fix: 'This host holds no key store yet, so it keeps no keys.', at: 'keys' });

  if ((request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return refusal(400, { code: 'BODY_MALFORMED', fix: `/api/keys/${which} takes a JSON object, sent as application/json.` });
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
    return refusal(400, { code: 'BODY_MALFORMED', fix: `/api/keys/${which} takes a JSON object, sent as application/json.` });

  const ask: KeysAsk<C> = { ctx, hints: sessionOf(request.headers), body: body as Record<string, unknown> };
  return which === 'put' ? keysReply(await door.keys.put(ask)) : door.keys.open(ask);
}
