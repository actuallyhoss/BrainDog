/**
 * One Analytics Engine point per request, written after the answer has gone (`51 §5.18`, `08 §5`, `loop/finish/ops.md`
 * OPS-23).
 *
 * WHAT A POINT CARRIES IS THE SHAPE OF A REQUEST AND NEVER ITS CONTENT. Five blobs, named for `08 §5`'s columns: which
 * door it came in by (`kind`), from what kind of client (`surface`), the record method it asked for (`tool`), how it
 * ended (`outcome`), and the record it was for, hashed (`record`). One double: how long the answer took. No field
 * value, query, prompt, payload, email or name is ever read into one, and `tools/gates/telemetry-allowlist.mjs` fails
 * the build on a point that carries anything else or on a second place that writes one.
 *
 * THE OUTCOME IS THE REFUSAL'S CODE WHEN THE ANSWER NAMES ONE, AND THE STATUS CLASS OTHERWISE. `08 §5` wrote the column
 * as `ok`, `refused` or `error`, and the brief asked for the code and the class both. A code already implies its status
 * (`httpStatus` in `@braindog/host` maps one to the other), so one column holds both without a sixth blob: `2xx` is
 * `ok`, a code is `refused` and says which, and `5xx` with no code is an `error` the refusal envelope did not name.
 *
 * THE RECORD IS HASHED UNDER A KEY THAT CHANGES EVERY MONTH (his H12). HKDF over `SESSION_SECRET`, with the month and
 * the record id in the info, cut to sixteen hex characters. Inside one month the same record gives the same hash, so
 * "how many distinct records called `ingest` this week" has an answer; across months it does not, so no record can be
 * followed through the three months Analytics Engine keeps, and without the secret no hash maps back to an id. No new
 * secret: the one that already signs sessions is the root, and HKDF's info keeps this key apart from every other key
 * derived from it. Without `SESSION_SECRET` no point is written at all, because a hash with no secret behind it is the
 * record id in a thin disguise.
 *
 * ONLY A RECORD THE REQUEST NAMES ITSELF. A bearer carries its record id in front of the dot (`recordOf` in
 * `route.ts`), which costs nothing to read. A browser's request names a slug or nothing, and resolving that would be a
 * Directory round trip on every request for the sake of a count, so its `record` is empty.
 *
 * NOTHING HERE MAY TURN AN ANSWER INTO A FAILURE. The point is written inside `ctx.waitUntil` after the response has
 * been returned, every step is inside one `try`, and a point that cannot be made is dropped without a word: telemetry
 * that could fail a request, or fill the logs about itself, would cost more than the counts it keeps.
 *
 * UNBOUND IS OFF. `TELEMETRY` stays commented in `wrangler.jsonc` until his H5, and with no binding this returns before
 * it reads anything, so the code ships dark.
 */

import { ROUTES } from '@braindog/host';

import { appPath, recordOf, servesAccount, servesApi, servesAuth, servesIn, servesMcp, servesOAuth, servesOAuthMeta } from './route.ts';

/**
 * The blobs of one point, in `51 §4.3`'s order, each position named for one of `08 §5`'s blob columns.
 *
 * `telemetry-allowlist` READS THESE NAMES, so a position added here must be a column of that table first.
 */
export type Blobs = [kind: string, surface: string, tool: string, outcome: string, record: string];

/** The doubles of one point, each position named for one of `08 §5`'s double columns. */
export type Doubles = [ms: number];

/** What this reads of the Worker's environment: the dataset, and the secret the monthly key is derived from. */
export type TelemetryEnv = { TELEMETRY?: AnalyticsEngineDataset; SESSION_SECRET?: string };

/**
 * The record methods by name, so `tool` is only ever a word this host routes.
 *
 * THE PATH IS THE CALLER'S TEXT. `/api/<anything>` reaches the router, and a segment copied into a blob unchecked would
 * be whatever a caller typed there, which is a value by another road. A name not in `ROUTES` is written as empty.
 */
const METHODS = new Set(ROUTES.map((route) => route.name));

/** A refusal code's shape: upper case and underscores, as every code in `10 §7` is. Anything else is not kept. */
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

/** The longest error answer whose code is kept, in characters. A refusal is a few hundred; a longer one is not parsed. */
const CODE_TEXT_MOST = 16_384;

/** Which door a path is, and the method it names when it is the API's. */
function doorOf(pathname: string): { kind: string; tool: string } {
  const app = appPath(pathname);
  const api = app === null ? (servesApi(pathname) ? pathname : null) : servesApi(app.rest) ? app.rest : null;
  if (api !== null) {
    const name = /^\/+api\/+([^/]+)/.exec(api)?.[1] ?? '';
    return { kind: 'api.call', tool: METHODS.has(name) ? name : '' };
  }
  if (app !== null) return { kind: 'page.render', tool: '' };
  if (servesMcp(pathname)) return { kind: 'mcp.call', tool: '' };
  if (servesIn(pathname)) return { kind: 'ingest.arrive', tool: '' };
  if (servesAuth(pathname)) return { kind: 'auth', tool: '' };
  if (servesAccount(pathname)) return { kind: 'account', tool: '' };
  if (servesOAuth(pathname) || servesOAuthMeta(pathname)) return { kind: 'oauth', tool: '' };
  return { kind: 'other', tool: '' };
}

/**
 * What kind of client asked, from the door and the credential only.
 *
 * A BEARER OUTSIDE `/mcp` IS `cli`, because the CLI, an agent's HTTP client and a script all carry the same token and
 * nothing in the request tells them apart without reading more of it than this should.
 */
function surfaceOf(pathname: string, bearer: boolean): string {
  if (servesMcp(pathname)) return 'mcp';
  if (servesIn(pathname)) return 'webhook';
  return bearer ? 'cli' : 'web';
}

/**
 * The refusal code an error answer names, from a copy of its body, or `null` when it names none.
 *
 * ONLY `code`, AND ONLY IF IT HAS A CODE'S SHAPE. The envelope's `fix` is a sentence and can name what the caller sent,
 * so nothing else of the body is kept, and a `code` that is not upper case and underscores is dropped with it.
 */
async function codeOf(copy: Response): Promise<string | null> {
  const text = await copy.text();
  if (text.length > CODE_TEXT_MOST) return null;
  const parsed: unknown = JSON.parse(text);
  const refusal = parsed !== null && typeof parsed === 'object' ? (parsed as { refusal?: unknown }).refusal : undefined;
  const code = refusal !== null && typeof refusal === 'object' ? (refusal as { code?: unknown }).code : undefined;
  return typeof code === 'string' && CODE.test(code) ? code : null;
}

/**
 * The record's hash for this month: HKDF-SHA-256 over `SESSION_SECRET`, with the month and the record id in the info,
 * sixteen hex characters. `month` is `YYYY-MM` in UTC, handed in so a test can name two of them.
 */
export async function recordHash(secret: string, record: string, month: string): Promise<string> {
  const bytes = new TextEncoder();
  const root = await crypto.subtle.importKey('raw', bytes.encode(secret), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: bytes.encode(`braindog/telemetry/${month}/${record}`) },
    root,
    64,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Write this request's point, when `TELEMETRY` is bound and `SESSION_SECRET` is set. For `ctx.waitUntil`: it never
 * rejects.
 *
 * THE COPY OF AN ERROR ANSWER IS TAKEN BEFORE THE FIRST `await`, so it is taken while this function is still running
 * inside `fetch`, before the response is handed back and its body is read by anyone else. It is taken only when it
 * will be read to the end: an unread copy would hold the whole body in memory for as long as the original streams.
 *
 * `ms` IS THE TIME TO THE ANSWER'S HEADERS, measured by the caller around the router. A streamed body is still going
 * when this runs, and waiting for it would keep the invocation alive for a count.
 */
export async function telemetry(env: TelemetryEnv, request: Request, answer: Response, ms: number): Promise<void> {
  try {
    const dataset = env.TELEMETRY;
    const secret = env.SESSION_SECRET ?? '';
    if (dataset === undefined || secret.length < 32) return;
    const json = (answer.headers.get('content-type') ?? '').includes('json');
    const copy = answer.status >= 400 && json && answer.body !== null ? answer.clone() : null;

    const pathname = new URL(request.url).pathname;
    const { kind, tool } = doorOf(pathname);
    const authorization = request.headers.get('authorization');
    const rec = recordOf(authorization);
    const surface = surfaceOf(pathname, /^Bearer\s/i.test(authorization ?? ''));
    const code = copy === null ? null : await codeOf(copy).catch(() => null);
    const outcome = code ?? `${Math.floor(answer.status / 100)}xx`;
    const hash = rec === null ? '' : await recordHash(secret, rec, new Date().toISOString().slice(0, 7));

    const blobs: Blobs = [kind, surface, tool, outcome, hash];
    const doubles: Doubles = [ms];
    dataset.writeDataPoint({ blobs, doubles });
  } catch {
    /* Dropped: see the header. */
  }
}
