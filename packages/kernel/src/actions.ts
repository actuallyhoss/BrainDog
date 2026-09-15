/**
 * Scheduled actions: the runner that drains `pull`, `call` and `poll` (`loop/DIRECTION.md` §0b).
 *
 * `call` is an outbound POST a schedule fires. `poll` fetches an endpoint on a schedule and acts through a
 * rule when the answer changes. `pull` is `25-CONNECTORS`'s fetch of something you already own. All three
 * are declared inside an `ingest`, armed as a schedule row of their own kind, and fired into ONE outbox
 * kind, `pull.fetch`.
 *
 * THE RECORD NEVER MAKES THE CALL. This file builds the request, and the host's executor sends it, so there
 * is no network here: `runActions` takes the executor as an argument. The request names the key by its id
 * and label and never carries it, and the answer that comes back carries no key either. The host resolves
 * the key by reference, outside the record, and nothing here can be handed one.
 *
 * FIVE RULES THE OWNER SET, AND WHERE EACH ONE HOLDS.
 *
 *   1 · Fifteen minutes, or a provider's own higher floor, refused at declaration: `declare.ts`.
 *   2 · Jitter is arithmetic over the record, the pack and the action, never random: `actionJitterMs`.
 *   3 · The install diff names every host and how often: `@braindog/declare`'s `calls_out`.
 *   4 · A 401 or a 403 is never retried. The row pauses, an event says so, the owner is told through the one
 *       notification path, and only `resumeAction` starts it again: `finishAction`.
 *   5 · Every run is metered from the first: one `pull` event per run, carrying runs, requests, bytes, run
 *       time and failures, and the project it ran for or `global`: `meter`.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './migrate.ts';
import type { Ack, OutboxRow } from './outbox.ts';
import { FLOOR_MS, intervalMs, jitterMs } from './pull.ts';
import type { Drained } from './schedule.ts';

/** The three kinds this runner claims. */
export const ACTION_KINDS = ['pull', 'call', 'poll'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** How long one request may take, and how much of an answer is read. `42 §4.7`'s defaults for a fetch. */
export const ACTION_TIMEOUT_MS = 10_000;
export const ACTION_MAX_BYTES = 2_000_000;

/** A declaration this runner reads: the keys of an ingest that a scheduled action uses. */
export type ActionDecl = {
  ingest: string;
  channel: string;
  /** A literal `https://` address. `{since}` and `{until}` may stand in its path and query. */
  url?: string;
  /** `call` and `poll`: the key's vault label. `pull`: the grant's id, as `25 §9` has it. */
  grant?: string;
  every: string;
  floor?: string;
  /** The project this action runs for. Absent is the whole record, which the meter calls `global`. */
  project?: string;
  /** `call` only: the JSON it posts, string leaves substituted and nothing evaluated. */
  body?: Record<string, unknown>;
  /** `pull` only, `42 §4.7`: where it fetches when it does not say `url:`. */
  fetch?: { base?: string; path?: string };
  extract?: Record<string, unknown>;
  writes?: { register?: string };
};

/** One request, as the host's executor receives it. There is no key in it, only the name of one. */
export type ActionRequest = {
  job: string;
  channel: ActionKind;
  ingest: string;
  method: 'GET' | 'POST';
  url: string;
  /** The origin the declaration names. The executor refuses any other, including one a redirect names. */
  origin: string;
  headers: Record<string, string>;
  body?: string;
  /** Which key to send, by reference. The executor opens it outside the record, or sends nothing. */
  grant: { id: string; label: string } | null;
  timeoutMs: number;
  maxBytes: number;
};

/** What the executor answers: the provider's status and body, or why it sent nothing or stopped. */
export type ActionAnswer =
  | { status: number; body: string; bytes: number; ms: number; requests: number }
  | {
      refused: { code: 'PULL_ORIGIN_REFUSED' | 'PULL_PROVIDER_UNAVAILABLE' | 'PULL_REQUEST_REFUSED' | 'WRONG_KEY'; fix: string };
      bytes: number;
      ms: number;
      requests: number;
    };

export type Execute = (request: ActionRequest) => Promise<ActionAnswer>;

/** What one pass did, counted. */
export type ActionsRun = {
  /** Schedule rows claimed and fired into the outbox. */
  fired: number;
  /** Requests handed to the executor. */
  ran: number;
  ok: number;
  /** A `poll` whose answer changed, which is the only kind of answer that reaches a rule. */
  changed: number;
  paused: number;
  /** Failures that walk the outbox's ladder: a 429, a 5xx, a timeout, the network. */
  failed: number;
  /** Failures that do not: an origin refused, an answer over the cap, any other 4xx. */
  refused: number;
  /** Jobs whose declaration had gone by the time they ran. */
  dropped: number;
};

export type ActionDeps = {
  sql: Sql;
  recordId: string;
  nowMs: number;
  mint: () => string;
  /** The one insertion path to the outbox, for `pull.fetch`. */
  enqueue: (payload: unknown) => string;
  /** The existing notification path, urgent: a `note` event, one push an hour, and the email. */
  notify: (said: { actor: string; say: string; because?: string }) => void;
  /** Finish a leased job. `failed` walks the ladder. */
  ack: (args: Ack) => Result<null>;
  /** The active declaration of this action, and the pack it came from, or `null` when it is gone or turned off. */
  lookup: (ingest: string) => { decl: ActionDecl; pack: string | null } | null;
  /** Hand an answer to the ingest pipeline as this one declaration's arrival, so a write fires its rules. */
  arrive: (decl: ActionDecl, body: string, sha256: string) => Result<unknown>;
};

/* ── the jitter ─────────────────────────────────────────────────────────── */

/**
 * A stable offset, from the record, the pack and the action.
 *
 * THE SAME ARITHMETIC AS A CONNECTOR'S, over one more name. Two packs that both declare an action called
 * `balance` land on different offsets, and the same action in the same pack on the same record lands on
 * the same one every time, which is what makes a gap somebody asks about a gap with a reason.
 */
export function actionJitterMs(recordId: string, pack: string | null, action: string, everyMs: number): number {
  return jitterMs(recordId, `${pack ?? ''}${action}`, everyMs);
}

/* ── firing a row ───────────────────────────────────────────────────────── */

type Key = { id: string; label: string };

/** The key a scheduled action names, by label or id, and never one that was revoked. The row, never its bytes. */
export function keyNamed(sql: Sql, name: string | undefined): Key | null {
  if (name === undefined || name === '') return null;
  return (
    sql.one<Key>(
      'SELECT id, label FROM grant WHERE (label = ? OR id = ?) AND revoked_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1',
      name,
      name,
    ) ?? null
  );
}

/** Pause the row an action runs from, and say so once through the notification path. */
function pause(deps: ActionDeps, kind: string, ingest: string, say: string): void {
  deps.sql.exec("UPDATE schedule SET state = 'paused' WHERE kind = ? AND key = ?", kind, ingest);
  deps.notify({
    actor: `ingest:${ingest}`,
    say,
    because: 'A scheduled action whose key is refused or gone is never retried. It runs again when somebody resumes it.',
  });
}

/**
 * A `call` or `poll` row fires: queue one request, and say when the next one is due.
 *
 * A DECLARATION THAT IS GONE ENDS THE ROW. Retiring it, uninstalling its pack and turning its pack off all
 * retire the declaration, so the row goes `done` here and nothing re-arms it; turning the pack back on arms
 * it again (`research-modular.md` §1.2).
 *
 * ONE REQUEST IN FLIGHT PER ACTION. A job still pending, leased or waiting on its retry is the run that
 * this fire would duplicate, so the fire queues nothing and only re-arms. That is what keeps a provider
 * that is down for a day from receiving a second request every interval on top of the ladder's.
 */
export function fireAction(deps: ActionDeps, row: { id: string; kind: string; key: string }): number | null | 'kept' {
  const found = deps.lookup(row.key);
  if (!found || found.decl.channel !== row.kind) return null;
  const { decl, pack } = found;
  const every = Math.max(intervalMs(decl.every) ?? FLOOR_MS, FLOOR_MS);

  const key = keyNamed(deps.sql, decl.grant);
  if (!key) {
    deps.sql.exec("UPDATE schedule SET state = 'paused' WHERE id = ?", row.id);
    deps.notify({
      actor: `ingest:${row.key}`,
      say: `${row.key} is paused: the key "${decl.grant ?? ''}" it sends is not in the vault.`,
      because: 'Bind the key, then resume the action.',
    });
    return 'kept';
  }

  const busy = deps.sql.one(
    `SELECT 1 AS x FROM outbox WHERE kind = 'pull.fetch' AND state IN ('pending', 'leased', 'failed')
     AND json_extract(payload, '$.channel') = ? AND json_extract(payload, '$.ingest') = ? LIMIT 1`,
    row.kind,
    row.key,
  );
  if (!busy) deps.enqueue({ channel: row.kind, ingest: row.key, grant: key.id });

  return deps.nowMs + every + actionJitterMs(deps.recordId, pack, row.key, every);
}

/* ── building the request ───────────────────────────────────────────────── */

const TIME = /\{(since|until)(?::(date|instant|epoch_s|epoch_ms))?\}/g;

/** `{since}` and `{until}`, substituted. Nothing else in the text is read. */
function fill(text: string, edges: { since: number; until: number }, encode: boolean): string {
  return text.replace(TIME, (_all, name: 'since' | 'until', format: string | undefined) => {
    const ms = edges[name];
    const said =
      format === 'date' ? instant(ms).slice(0, 10) : format === 'epoch_s' ? String(Math.floor(ms / 1000)) : format === 'epoch_ms' ? String(ms) : instant(ms);
    return encode ? encodeURIComponent(said) : said;
  });
}

function fillBody(node: unknown, edges: { since: number; until: number }): unknown {
  if (typeof node === 'string') return fill(node, edges, false);
  if (Array.isArray(node)) return node.map((v) => fillBody(v, edges));
  if (node !== null && typeof node === 'object')
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, fillBody(v, edges)]));
  return node;
}

/** The address an action calls, or `null` when it declares none this runner can call. */
export function addressOf(decl: ActionDecl): string | null {
  if (typeof decl.url === 'string') return decl.url;
  if (typeof decl.fetch?.base === 'string' && typeof decl.fetch.path === 'string') return `${decl.fetch.base.replace(/\/$/, '')}${decl.fetch.path}`;
  return null;
}

/** The origin of an address, or `null` when it is not an https one. */
export function originOf(address: string): string | null {
  try {
    const url = new URL(address);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** A job the runner can send, with what it needs to finish it. */
export type Ready = { job: OutboxRow; decl: ActionDecl; request: ActionRequest; host: string };

/**
 * A leased job becomes a request, or is finished here because it cannot become one.
 *
 * THE KEY IS LOOKED UP BY ITS ID AND ITS LABEL AND NOTHING ELSE. `grant` in the request is a reference the
 * host resolves, and the columns this reads are the two a person already sees on the vault screen.
 */
export function prepareAction(deps: ActionDeps, job: OutboxRow): Ready | null {
  let payload: { channel?: string; ingest?: string; grant?: string };
  try {
    payload = JSON.parse(job.payload) as typeof payload;
  } catch {
    payload = {};
  }
  const ingest = payload.ingest ?? '';
  const channel = (payload.channel ?? 'pull') as ActionKind;
  const found = ingest ? deps.lookup(ingest) : null;
  const address = found ? addressOf(found.decl) : null;
  const origin = address ? originOf(address) : null;

  if (!found || found.decl.channel !== channel || !address || !origin) {
    const why = !found || found.decl.channel !== channel
      ? `${ingest} is no longer declared, or its pack is off, so nothing was sent.`
      : `${ingest} declares no https address this runner can call, so nothing was sent.`;
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
    meter(deps, { ingest, channel, host: null, project: found?.decl.project, status: null, outcome: 'dropped', requests: 0, bytes: 0, ms: 0, failures: 0 }, why);
    return null;
  }

  const { decl } = found;
  const host = new URL(address).host;
  /* THE KEY THE FIRE NAMED, BY ID. A key revoked between the fire and the run is a key that is gone, and
     sending the request without it would be a request the provider answers 401 to anyway. */
  const named = payload.grant ?? decl.grant;
  const key = named === undefined ? null : keyNamed(deps.sql, named);
  if (named !== undefined && !key) {
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
    pause(deps, channel, ingest, `${ingest} is paused: the key it sends to ${host} is gone.`);
    meter(deps, { ingest, channel, host, project: decl.project, status: null, outcome: 'paused', requests: 0, bytes: 0, ms: 0, failures: 1 }, `${ingest} did not run: the key it sends to ${host} is gone.`);
    return null;
  }

  const row = deps.sql.one<{ payload: string }>('SELECT payload FROM schedule WHERE kind = ? AND key = ?', channel, ingest);
  let since: number | null = null;
  try {
    const said = row ? (JSON.parse(row.payload) as { since?: unknown }).since : undefined;
    since = typeof said === 'string' ? Date.parse(said) : null;
  } catch {
    since = null;
  }
  const every = Math.max(intervalMs(decl.every) ?? FLOOR_MS, FLOOR_MS);
  const edges = { since: since !== null && Number.isFinite(since) ? since : deps.nowMs - every, until: deps.nowMs };

  /* SUBSTITUTED AFTER THE ORIGIN, so a value can never become part of the host. The declaration check
     already refused a host with a brace in it; this is the same rule held at run time. */
  const rest = address.slice(origin.length);
  const url = `${origin}${fill(rest, edges, true)}`;
  const method = channel === 'call' ? 'POST' : 'GET';
  const body = channel === 'call' && decl.body !== undefined ? JSON.stringify(fillBody(decl.body, edges)) : undefined;

  return {
    job,
    decl,
    host,
    request: {
      job: job.id,
      channel,
      ingest,
      method,
      url,
      origin,
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body }),
      grant: key,
      timeoutMs: ACTION_TIMEOUT_MS,
      maxBytes: ACTION_MAX_BYTES,
    },
  };
}

/* ── finishing a run ────────────────────────────────────────────────────── */

type Usage = {
  ingest: string;
  channel: string;
  host: string | null;
  project: string | undefined;
  status: number | null;
  outcome: 'ok' | 'changed' | 'unchanged' | 'paused' | 'failed' | 'refused' | 'dropped';
  requests: number;
  bytes: number;
  ms: number;
  failures: number;
};

/**
 * The run, metered: one `pull` event, whatever happened.
 *
 * FROM THE FIRST RUN, because a meter that starts when billing starts has no history to bill against.
 * `to_v` carries `runs · requests · bytes · ms · failures` and the scope, which is the action's project or
 * `global`, so a per-account ledger in the Directory can sum these without reading anything else. No key,
 * no body and no header is in it: a host, a status and five numbers.
 */
export function meter(deps: Pick<ActionDeps, 'sql' | 'mint' | 'nowMs'>, usage: Usage, say: string): void {
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'pull', ?, 'declaration', ?, ?)",
    deps.mint(),
    instant(deps.nowMs),
    `ingest:${usage.ingest}`,
    `declaration:ingest.${usage.ingest}`,
    JSON.stringify({
      channel: usage.channel,
      host: usage.host,
      status: usage.status,
      outcome: usage.outcome,
      scope: usage.project ?? 'global',
      usage: { runs: 1, requests: usage.requests, bytes: usage.bytes, ms: usage.ms, failures: usage.failures },
    }),
    say.slice(0, 280),
  );
}

/**
 * An answer comes back, and the run is finished in one transaction.
 *
 * 401 AND 403 PAUSE. They are facts about the key, and eight exponential retries against somebody's auth
 * endpoint is how an account gets locked. The row pauses, the key is marked stale, the event says so, the
 * owner is told, and the job is `done` so the ladder never sees it.
 *
 * 2XX IS A RUN. A `poll` compares the hash of the answer with the last one it kept and hands the answer to
 * the ingest pipeline only when it differs, so its rule fires on a change and on nothing else; the first
 * answer is a change. A `pull` hands every answer on. A `call` keeps nothing of the answer.
 *
 * 429, 5XX, A TIMEOUT AND THE NETWORK WALK THE LADDER, by acking the job `failed`: the outbox's backoff,
 * doubling minutes, and at the eighth failure a dead letter a person sees. Every rung is an event.
 *
 * ANYTHING ELSE IS REFUSED AND NOT RETRIED: an origin the host would not call, an answer over the cap, a
 * key the host could not open, any other 4xx. Retrying those sends the same wrong request again.
 */
export function finishAction(deps: ActionDeps, ready: Ready, answer: ActionAnswer, hash: string): Usage['outcome'] {
  const { job, decl, request, host } = ready;
  const { ingest, channel } = request;
  const base = { ingest, channel, host, project: decl.project, requests: answer.requests, bytes: answer.bytes, ms: answer.ms };
  const status = 'status' in answer ? answer.status : null;

  if (status === 401 || status === 403) {
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
    if (request.grant) deps.sql.exec('UPDATE grant SET stale_at = ? WHERE id = ?', instant(deps.nowMs), request.grant.id);
    pause(deps, channel, ingest, `${ingest} is paused: ${host} refused the key "${request.grant?.label ?? 'none'}" with ${status}.`);
    meter(deps, { ...base, status, outcome: 'paused', failures: 1 }, `${ingest} stopped: ${host} answered ${status} to the key "${request.grant?.label ?? 'none'}". It will not retry until somebody resumes it.`);
    return 'paused';
  }

  if (status !== null && status >= 200 && status < 300 && 'body' in answer) {
    const row = deps.sql.one<{ id: string; payload: string }>('SELECT id, payload FROM schedule WHERE kind = ? AND key = ?', channel, ingest);
    let kept: Record<string, unknown> = {};
    try {
      kept = row ? (JSON.parse(row.payload) as Record<string, unknown>) : {};
    } catch {
      kept = {};
    }
    const changed = channel === 'poll' ? kept.seen !== hash : channel === 'pull';
    let outcome: Usage['outcome'] = channel === 'poll' ? (changed ? 'changed' : 'unchanged') : 'ok';
    let say = channel === 'poll'
      ? changed ? `${ingest} polled ${host}, and the answer changed.` : `${ingest} polled ${host}, and the answer is the same.`
      : channel === 'call' ? `${ingest} called ${host}, and it answered ${status}.` : `${ingest} fetched from ${host}.`;

    if (changed && decl.writes?.register !== undefined && decl.extract !== undefined) {
      /* A POLL'S ARRIVALS ARE KEYED BY RUN, so an answer that goes A, B and back to A is three changes and
         not a redelivery of the first. A PULL'S ARE KEYED BY CONTENT, so the same page twice is one row. */
      const sha = channel === 'poll' ? `${ingest}:${hash}:${job.id}` : `${ingest}:${hash}`;
      const arrived = deps.arrive(decl, answer.body, sha);
      if (!arrived.ok) {
        outcome = 'refused';
        say = `${ingest} ran, and its answer could not be written: ${'refusal' in arrived ? arrived.refusal.fix : 'the record refused it'}`;
      }
    }

    if (row)
      deps.sql.exec(
        'UPDATE schedule SET payload = ? WHERE id = ?',
        JSON.stringify({ ...kept, since: instant(deps.nowMs), ...(channel === 'poll' ? { seen: hash } : {}) }),
        row.id,
      );
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
    meter(deps, { ...base, status, outcome, failures: outcome === 'refused' ? 1 : 0 }, say);
    return outcome;
  }

  const transient =
    status === 429 || (status !== null && status >= 500) || ('refused' in answer && answer.refused.code === 'PULL_PROVIDER_UNAVAILABLE');
  const why =
    'refused' in answer
      ? `${answer.refused.code}: ${answer.refused.fix}`
      : transient
        ? `PULL_PROVIDER_UNAVAILABLE: ${host} answered ${String(status)}.`
        : `PULL_REQUEST_REFUSED: ${host} answered ${String(status)}, which this action does not expect.`;

  if (transient) {
    deps.ack({ id: job.id, state: 'failed', error: why, leasedUntil: job.leasedUntil });
    meter(deps, { ...base, status, outcome: 'failed', failures: 1 }, `${ingest} failed and will try again later. ${why}`);
    return 'failed';
  }

  deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
  meter(deps, { ...base, status, outcome: 'refused', failures: 1 }, `${ingest} was not retried. ${why}`);
  return 'refused';
}

/* ── the pass ───────────────────────────────────────────────────────────── */

/** What one pass needs, each step in its own transaction. */
export type RunnerSteps = {
  drain: () => Drained;
  lease: (n: number) => OutboxRow[];
  prepare: (job: OutboxRow) => Ready | null;
  finish: (ready: Ready, answer: ActionAnswer, hash: string) => Usage['outcome'];
};

/** The SHA-256 of an answer, hex. What a `poll` compares. */
export async function answerHash(body: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One pass: claim the due rows of the three kinds, lease their jobs, send each through the executor, finish
 * each.
 *
 * THE EXECUTOR RUNS OUTSIDE EVERY TRANSACTION. A request can take ten seconds, and a write lock held across
 * somebody else's API is a record nobody can write to for those ten seconds. The claim and the lease are
 * each one statement, so two passes arriving together find different work or none.
 *
 * AN EXECUTOR THAT THROWS IS THE NETWORK. It is caught, and the run is a transient failure with a sentence
 * that names nothing the executor was holding.
 */
export async function runActions(steps: RunnerSteps, execute: Execute, n = 5): Promise<ActionsRun> {
  const drained = steps.drain();
  const out: ActionsRun = { fired: drained.done, ran: 0, ok: 0, changed: 0, paused: 0, failed: 0, refused: 0, dropped: 0 };

  for (const job of steps.lease(n)) {
    const ready = steps.prepare(job);
    if (!ready) {
      out.dropped++;
      continue;
    }
    const started = Date.now();
    let answer: ActionAnswer;
    try {
      answer = await execute(ready.request);
    } catch {
      answer = {
        refused: { code: 'PULL_PROVIDER_UNAVAILABLE', fix: `${ready.host} could not be reached.` },
        bytes: 0,
        ms: Date.now() - started,
        requests: 1,
      };
    }
    out.ran++;
    const hash = 'body' in answer ? await answerHash(answer.body) : '';
    const outcome = steps.finish(ready, answer, hash);
    if (outcome === 'ok' || outcome === 'unchanged') out.ok++;
    else if (outcome === 'changed') (out.ok++, out.changed++);
    else if (outcome === 'paused') out.paused++;
    else if (outcome === 'failed') out.failed++;
    else if (outcome === 'dropped') out.dropped++;
    else out.refused++;
  }
  return out;
}

/**
 * Start a paused action again, now. The only way one starts again.
 *
 * NOT A REBIND. A key that was refused is still marked stale until somebody binds a new one; resuming says
 * "try again", and if the provider refuses again the action pauses again and the owner is told again.
 */
export function resumeAction(deps: Pick<ActionDeps, 'sql' | 'mint' | 'nowMs'>, ingest: string, actor: string): Result<{ ingest: string; kind: ActionKind }> {
  const row = deps.sql.one<{ id: string; kind: ActionKind }>(
    "SELECT id, kind FROM schedule WHERE kind IN ('pull', 'call', 'poll') AND key = ? AND state = 'paused' ORDER BY kind LIMIT 1",
    ingest,
  );
  if (!row) return no('OUT_OF_BOUNDS', `${ingest} is not paused, so there is nothing to resume.`, { at: 'ingest' });
  deps.sql.exec("UPDATE schedule SET state = 'pending', due_at = ?, attempts = 0 WHERE id = ?", instant(deps.nowMs), row.id);
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'pull', ?, 'declaration', ?)",
    deps.mint(),
    instant(deps.nowMs),
    actor,
    `declaration:ingest.${ingest}`,
    `${ingest} was resumed, and runs now.`,
  );
  return ok({ ingest, kind: row.kind });
}

/** Every origin the active scheduled actions name. The self-host sends to these and to nothing else. */
export function originsOf(decls: readonly ActionDecl[]): string[] {
  const seen = new Set<string>();
  for (const decl of decls) {
    if (!(ACTION_KINDS as readonly string[]).includes(decl.channel)) continue;
    const address = addressOf(decl);
    const origin = address ? originOf(address) : null;
    if (origin) seen.add(origin);
  }
  return [...seen].sort();
}
