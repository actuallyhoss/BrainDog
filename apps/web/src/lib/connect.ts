/**
 * Reaching a record at an address, and the five different things that can happen.
 *
 * WHY THIS IS NOT `packages/client`. That package does exactly this and is the right module for it,
 * and `lib/data/call.ts` has already settled why the app does not import it: `50 §1` closes the web
 * app's import list, `apps/web/package.json` declares no edge to `@braindog/client`, and `graph`
 * reports an undeclared import for one whatever the comment above it says. So this file mirrors the
 * client's contract rather than borrowing it — same path, same header, same `UNREACHABLE` for the
 * same four socket failures — and the day the app is allowed that dependency this becomes a wrapper
 * over it and loses nothing.
 *
 * NOTHING HERE THROWS. A refusal is a value in this codebase, absolutely, and a sign-in screen is
 * the worst place to break that: every one of the five answers below is something the reader has to
 * be told apart from the other four, and an exception collapses four of them into "it failed".
 *
 * AND NOTHING HERE LOGS. The token is an argument, it goes into one header, and it is never written
 * to a console, a URL, a query string or a returned sentence. `12 §6` keeps a credential out of
 * anything that persists; a browser console persists.
 */

/**
 * WHERE THE CONNECTION LIVES: NOWHERE. It is held for the length of one attempt and dropped.
 *
 * THE ALTERNATIVE WAS `pref.ts`, AND IT LOST ON THE LINE THAT DEFINES THE MECHANISM. `12 §3` gives a
 * person in a browser a session cookie that is `HttpOnly`, `Secure`, `SameSite=Lax`, thirty days and
 * rotating — and `HttpOnly` exists for exactly one purpose, which is that script cannot read it.
 * `bd_pref` is the opposite of that by construction: `app.html` parses it in an inline script before
 * first paint, which is the whole reason it is a cookie rather than `localStorage`. Putting a bearer
 * in the one cookie the product deliberately made script-readable would be the specified mechanism
 * inverted. `localStorage` and `sessionStorage` fail the same test one step later, and `19 §5`'s
 * state table has no row for either.
 *
 * AND `50 §1` ALREADY SAID SO IN ONE CLAUSE: under Refuses, "A bearer token — the app never holds
 * one". The designed exchange is `POST /auth/token` (`49 §5.7`): the token goes to the host once,
 * the host mints the session, and the browser is left holding a cookie it cannot read. That route
 * is unbuilt on both hosts, so what is left is the honest half of it — present the credential, read
 * the answer, keep nothing.
 *
 * WHAT THE SCREEN DOES INSTEAD is say what it reached and leave the field on screen. Nothing is
 * remembered between visits, and the screen says that rather than implying a session it has not
 * got. The address is not remembered either: it is unsaved text under `19 §5`'s last row, and the
 * one place it must never go is the URL, which is where `/vault`'s rule already points.
 */
export type Connection = {
  /** `https://brain.dog` or `http://127.0.0.1:8787`. `/api/boot` is appended to it. */
  base: string;
  /** Absent, or empty, on a self-host started without `BRAINDOG_TOKEN`. */
  token?: string | undefined;
};

/** `30 §6`'s shape, in the three fields a screen has a use for. */
export type Refusal = { code: string; fix: string; at?: string | undefined };

/**
 * What `boot` answers. `packages/record`'s own `Boot`, restated because this file may not import it.
 *
 * `registers` IS EMPTY ON A RECORD THAT HAS JUST BEEN CREATED, and that is a record. Reading an
 * empty list as "this is not a record" would refuse every fresh self-host on its first day, which
 * is precisely the deployment this screen exists for.
 */
type Boot = { registers: { id: string; name: string; count: number }[]; now: string };

/**
 * The five answers.
 *
 * FOUR OF THEM ARE FAILURES AND THEY ARE FOUR DIFFERENT REPAIRS: fix the address, start the record,
 * fix the credential, point at the right thing. One "Sign-in failed" for all four is a screen that
 * knows which of the four it is and will not say.
 */
export type Attempt =
  | {
      kind: 'reached';
      /** How many registers this caller may read. Zero is legal and means a new record. */
      registers: number;
      /** Their rows, added up. */
      rows: number;
      /** ISO 8601, UTC: the day the record thinks it is, which is not always the reader's. */
      now: string;
      /** Whether a credential was presented at all, so the screen can say which door opened. */
      credentialed: boolean;
    }
  | {
      kind: 'not-an-address' | 'silent' | 'refused' | 'not-a-record';
      refusal: Refusal;
      /** A second fact, when there is one that is true rather than guessed. */
      also?: string | undefined;
    };

/**
 * How long to wait before calling it silence.
 *
 * A PORT THAT DROPS PACKETS NEVER REFUSES THE SOCKET, so without this the button stays pressed for
 * the operating system's own timeout — minutes on some machines — with the screen saying nothing.
 * A wrong address is the commonest thing to type here and it must not be the slowest to answer.
 */
const PATIENCE_MS = 8000;

/** `http` and `https` only. `file:` and `ftp:` parse as URLs and reach no record. */
function addressOf(base: string): URL | null {
  const text = base.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
}

/**
 * The answer, if it is a record's.
 *
 * THE SHAPE IS CHECKED RATHER THAN ASSUMED, which is the same argument `packages/client` makes one
 * layer down: a proxy, a login wall or a different product's API can answer 200 with JSON, and the
 * first thing that reads a field off it fails somewhere unrelated and blames the wrong screen.
 */
function bootOf(value: unknown): Boot | null {
  if (value === null || typeof value !== 'object') return null;
  const it = value as { registers?: unknown; now?: unknown };
  if (typeof it.now !== 'string' || !Array.isArray(it.registers)) return null;
  for (const row of it.registers) {
    if (row === null || typeof row !== 'object') return null;
    const one = row as { id?: unknown; name?: unknown; count?: unknown };
    if (typeof one.id !== 'string' || typeof one.name !== 'string' || typeof one.count !== 'number') return null;
  }
  return it as Boot;
}

/** A refusal the host sent, if what came back is one. */
function refusalIn(body: unknown): Refusal | null {
  if (body === null || typeof body !== 'object') return null;
  const it = body as { ok?: unknown; refusal?: unknown };
  if (it.ok !== false || it.refusal === null || typeof it.refusal !== 'object') return null;
  const said = it.refusal as { code?: unknown; fix?: unknown; at?: unknown };
  if (typeof said.code !== 'string' || typeof said.fix !== 'string') return null;
  return { code: said.code, fix: said.fix, ...(typeof said.at === 'string' ? { at: said.at } : {}) };
}

/**
 * Try to reach the record at `base`, presenting `token` if there is one.
 *
 * `fetch` AND `origin` ARE INJECTABLE so a test needs no socket and no browser. `origin` is the
 * address this page was served from, and it is not decoration: a browser can only read a record
 * that has said it may, and today neither host says it — so a cross-origin attempt fails at the
 * socket and the reason is not the one a reader would guess from silence.
 */
export async function attempt(
  base: string,
  token: string,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
  origin: string | null = pageOrigin(),
): Promise<Attempt> {
  const url = addressOf(base);
  if (!url)
    return {
      kind: 'not-an-address',
      refusal: {
        code: 'VALUE_MALFORMED',
        at: 'base',
        fix: 'That is not an address. A record is at something like http://127.0.0.1:8787 or https://brain.dog.',
      },
    };

  const at = url.host;
  /* THE SAME TRIM AND THE SAME PATH THE CLIENT USES, so one record answers one address whether the
     caller is this screen, an agent or the CLI. A base with a trailing slash is the same base. */
  const call = `${`${url.origin}${url.pathname}`.replace(/\/+$/, '')}/api/boot`;

  /* AND THE CREDENTIAL IS SENT ONLY IF THERE IS ONE. `Authorization:` with nothing after it is a
     header a self-host reads as a credential it does not know, so an empty field would be refused
     by the one deployment that is meant to accept it. `server.ts` records that this cost an owner
     their own machine once, from the other side of the same line. */
  const sent = token.trim();

  let res: Response;
  try {
    res = await doFetch(call, {
      method: 'GET',
      headers: sent ? { authorization: `Bearer ${sent}` } : {},
      signal: AbortSignal.timeout(PATIENCE_MS),
    });
  } catch (e) {
    const timedOut = (e as { name?: string } | null)?.name === 'TimeoutError';
    /* WHY THE SOCKET FAILED IS THE HALF A READER CANNOT SEE, and cross-origin is the one cause that
       looks identical to a record that is not running. Said only when it is true of this address. */
    const elsewhere = origin !== null && origin !== url.origin;
    return {
      kind: 'silent',
      refusal: {
        code: 'UNREACHABLE',
        at: 'base',
        fix: `Nothing answered at ${at}. Check the record is running and that the port is the one it printed when it started.`,
      },
      ...(timedOut
        ? { also: 'It did not answer within eight seconds, so something is at that address and it is not answering.' }
        : elsewhere
          ? {
              also: `This page was served from ${origin}, and a record at another address does not yet let a browser read it. Open the app from the record's own address.`,
            }
          : {}),
    };
  }

  /**
   * THE BODY IS READ ONCE AND IS ALLOWED TO BE NOTHING.
   *
   * `30 §6` says a 401 is "401 with an empty body", and the self-host in this tree sends the
   * envelope with it. Both are legal answers to the same question, so the status is read before the
   * body: parsing first would turn a spec-conformant empty 401 into "this is not a record", which
   * is the one wrong thing to tell somebody whose credential is the problem.
   */
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }

  const said = refusalIn(body);

  /* A ROUTE TABLE WITH NO `boot` IN IT IS NOT A RECORD. It speaks the envelope, so it is not
     silence, and it refuses the one method every client calls first, so it is not a credential
     problem either: it is something else at that address. */
  if (said && said.code === 'ROUTE_UNKNOWN')
    return {
      kind: 'not-a-record',
      refusal: {
        code: 'UNREACHABLE',
        at: 'base',
        fix: `Something answered at ${at} and it does not hold a record.`,
      },
    };

  if (said || res.status === 401 || res.status === 403)
    return {
      kind: 'refused',
      /* THE RECORD'S OWN SENTENCE, VERBATIM, because it is already in the house voice and it is the
         only party that knows which of its several refusals this is. Ours is the fallback for the
         empty-bodied 401 the contract allows. */
      refusal: said ?? { code: 'UNAUTHORIZED', at: 'authorization', fix: 'This record does not know that credential.' },
      ...(sent
        ? {
            /* NOT A GUESS ABOUT THIS HOST — a fact about every self-host started without a shared
               secret, which is a supported configuration and the likeliest reason a correct-looking
               credential is refused. `server.ts`: anything presented that is not the one string is
               401, and with no string set that is everything. */
            also: 'A record started without BRAINDOG_TOKEN refuses every credential it is offered, so if this is one of those, leave the token empty.',
          }
        : {}),
    };

  const value = body !== null && typeof body === 'object' && (body as { ok?: unknown }).ok === true
    ? bootOf((body as { value?: unknown }).value)
    : null;

  if (!value)
    return {
      kind: 'not-a-record',
      refusal: {
        code: 'UNREACHABLE',
        at: 'base',
        fix: `Something answered at ${at} and it is not a record. Check the address is the record's and not another thing on the same machine.`,
      },
    };

  return {
    kind: 'reached',
    registers: value.registers.length,
    rows: value.registers.reduce((n, r) => n + r.count, 0),
    now: value.now,
    credentialed: sent !== '',
  };
}

/** Where this page came from, or `null` off a browser. `location` is not global under `node --test`. */
function pageOrigin(): string | null {
  const here = (globalThis as { location?: { origin?: string } }).location;
  return typeof here?.origin === 'string' ? here.origin : null;
}
