/**
 * One JSON line for the operator, the shape every Worker log line takes (`53 §2.3`, `loop/finish/ops.md` 4.0 F).
 *
 * PROSE COULD NOT BE QUERIED. The Worker's lines were sentences (`fetch: ...`, `auth: signin refused (...)`), and the
 * five alerts `53 §2.3` names are saved Workers Logs queries over fields: `op=refuse`, `op=outbox state=dead`,
 * `op=walk backup=failed`. A query cannot be written against a sentence, so every line is one JSON object with `op`
 * first, `crash.ts`'s shape in `@braindog/host`, and the fields after it are what the line is about.
 *
 * A LINE CARRIES THE CODE, THE ID AND THE SHAPE, NEVER A PERSON'S WORDS (12 §8, 35 §2): never an email, a field value,
 * a prompt or a payload. That is the caller's to keep, because only the caller knows what a value is; what this module
 * adds is a floor under a caller who slips. An address that reaches a string field is replaced before the line is
 * written, and a string is cut at `TEXT_MOST` characters, so a thrown sentence that quoted a row cannot carry the row
 * whole into wherever logs go.
 *
 * `op` NEVER THROWS. A line is written beside an answer, inside a catch or on the way out of an alarm, and a log that
 * could fail would turn the thing it reports into a second failure. A line that cannot be written is dropped.
 *
 * NO IMPORT AT ALL, and nothing from `cloudflare:`, so `mail.ts`, `cut-off.ts` and `route.ts` stay loadable in a bare
 * Node process and their tests read the lines this writes.
 */

/** What a line may carry beside its `op`: a code, an id, a count, a flag, or nothing. */
export type OpValue = string | number | boolean | null;

/** A line: its `op`, then its fields. */
export type OpFields = { op: string } & Record<string, OpValue>;

/**
 * The most characters one string field keeps.
 *
 * A CEILING PER FIELD, so one line is bounded by the fields its caller named: a `fix` sentence is about 130 characters
 * and a driver's reason a little more, and a thrown message that embedded a request body is cut here.
 */
const TEXT_MOST = 300;

/* AN ADDRESS, BY ITS SHAPE: something, an at sign, a dotted name. Wide on purpose: a false match costs a word in a log
   line, and a miss costs a person's address in every copy of the logs. */
const ADDRESS = /[^\s@<>"'`,;:()[\]]+@[^\s@<>"'`,;:()[\]]+\.[^\s@<>"'`,;:()[\]]+/gu;

const scrub = (value: OpValue): OpValue => {
  if (typeof value !== 'string') return value;
  const kept = value.replace(ADDRESS, '[an address]');
  return kept.length > TEXT_MOST ? `${kept.slice(0, TEXT_MOST)}...` : kept;
};

/**
 * Write one line: `info` to `console.log`, `error` to `console.error`, which is the level Workers Logs files it under.
 *
 * `op` IS WRITTEN FIRST AND ONCE. The object is built with `op` as its first key and every other field after it, so a
 * field named `op` in the rest cannot move it or write a second one.
 */
export function op(fields: { op: string } & Record<string, OpValue>, level: 'info' | 'error' = 'info'): void {
  try {
    const line: Record<string, OpValue> = { op: fields.op };
    for (const [key, value] of Object.entries(fields)) if (key !== 'op') line[key] = scrub(value);
    const text = JSON.stringify(line);
    if (level === 'error') console.error(text);
    else console.log(text);
  } catch {
    /* Nothing else to do with it: see the header. */
  }
}

/**
 * The door a path came through, as a crash's line and a limit name it: `/api/<method>`, `/mcp`, or the first segment.
 *
 * NEVER THE WHOLE PATH. A path can hold a secret (`/in/email/<token>`, `/auth/claim/<token>`) or a name a person chose
 * (`/app/<slug>/...`), and a log line holds neither. A method name is this build's own word, so it is kept; the slug in
 * front of a record's API is dropped, because the door under it is the same one.
 */
export function doorPath(pathname: string): string {
  if (/^\/+mcp\/*$/u.test(pathname)) return '/mcp';
  const api = /^\/+(?:app\/+[^/]+\/+)?api(?:\/+([^/]*))?(?:\/|$)/u.exec(pathname);
  if (api !== null) return api[1] !== undefined && /^[A-Za-z]{1,64}$/u.test(api[1]) ? `/api/${api[1]}` : '/api';
  const first = /^\/+([^/]+)/u.exec(pathname)?.[1];
  return first !== undefined && /^[A-Za-z.-]{1,32}$/u.test(first) ? `/${first}` : '/';
}

/** One outbox row as its ack left it: what the `outbox` line is made of. */
export type AckedRow = { kind: string; state: string; attempts: number; payload: string };

/**
 * The `outbox` line for one ack (`53 §2.3`): `rec`, `kind`, `state` (`done`, `failed` or `dead`), `attempts`, and for a
 * connector's `pull.fetch` its `ingest` and the provider's `http` status, which the dead-outbox and connector-paused
 * alerts read. `ok: false` with the refusal's `code` is an ack the record refused (a lease that was over), whose row is
 * still somebody else's.
 *
 * `http` IS A STATUS THE PROVIDER ANSWERED, from the run's own refusal (`found` on `PULL_AUTH_REJECTED` and its
 * siblings, `packages/connect/src/status.ts`), or `null` when the run failed before any answer or did not fail. The
 * `ingest` is the declaration's id, never the payload around it, which holds the sealed grant.
 */
export function outboxFields(rec: string | null, row: AckedRow, acked: { ok: true } | { ok: false; code: string }, result: unknown): OpFields {
  const line: OpFields = { op: 'outbox', rec, kind: row.kind, state: row.state, attempts: row.attempts, ok: acked.ok };
  if (!acked.ok) line.code = acked.code;
  if (row.kind !== 'pull.fetch') return line;
  line.ingest = ingestOf(row.payload);
  line.http = statusOf(result);
  return line;
}

/** The ingest a `pull.fetch` payload names, or `null`. Only the id is read out of it. */
function ingestOf(payload: string): string | null {
  try {
    const ingest = (JSON.parse(payload) as { ingest?: unknown } | null)?.ingest;
    return typeof ingest === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/u.test(ingest) ? ingest : null;
  } catch {
    return null;
  }
}

/** The HTTP status a connector's run was refused with, when its refusal carries one. */
function statusOf(result: unknown): number | null {
  const error = typeof result === 'object' && result !== null ? (result as { error?: unknown }).error : undefined;
  const found = typeof error === 'object' && error !== null ? (error as { found?: unknown }).found : undefined;
  return typeof found === 'number' && Number.isInteger(found) && found >= 100 && found <= 599 ? found : null;
}
