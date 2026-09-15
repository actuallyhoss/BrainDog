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
 *   4 · A 401 or a 403 is never retried, and neither is a key the host could not open (`WRONG_KEY`). The row
 *       pauses, an event says so, the owner is told through the one notification path, and only `resumeAction`
 *       starts it again: `finishAction`.
 *   5 · Every run is metered from the first: one `pull` event per run, carrying runs, requests, bytes, run
 *       time and failures, and the project it ran for or `global`: `meter`. The pass hands each run back in
 *       `usage`, for the host to add to the Directory's ledger. A host that finds the plan's limit reached
 *       answers `held` instead of sending, and the action waits for the next month with an event that says so.
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
  | {
      status: number;
      body: string;
      bytes: number;
      ms: number;
      requests: number;
      /**
       * Set when the host sent nothing because the account is at its plan's monthly limit: `status` is 0 and
       * every count is 0. THE HOST ASKS BEFORE THE RUN STARTS, because the allowance is the Directory's and the
       * record cannot see it. `until` is when the action may run again, and `say` is the one sentence its event
       * carries.
       */
      held?: { until: number; say: string };
    }
  | {
      refused: { code: 'PULL_ORIGIN_REFUSED' | 'PULL_PROVIDER_UNAVAILABLE' | 'PULL_REQUEST_REFUSED' | 'WRONG_KEY'; fix: string };
      bytes: number;
      ms: number;
      requests: number;
    };

export type Execute = (request: ActionRequest) => Promise<ActionAnswer>;

/**
 * One run's usage, as its `pull` event wrote it. What a host hands the Directory's ledger.
 *
 * `event` is the event's id, which is what makes counting it twice count it once.
 */
export type Metered = {
  event: string;
  at: string;
  ingest: string;
  channel: string;
  scope: string;
  outcome: 'ok' | 'changed' | 'unchanged' | 'paused' | 'failed' | 'refused' | 'dropped' | 'held';
  usage: { runs: number; requests: number; bytes: number; ms: number; failures: number; held: number };
};

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
  /** Runs the host held because the account reached its plan's limit. Nothing was sent for these. */
  held: number;
  /** Every run this pass metered, in order. The host adds each to the Directory's ledger. */
  usage: Metered[];
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
export function prepareAction(deps: ActionDeps, job: OutboxRow): Ready | Metered {
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
    return meter(deps, { ingest, channel, host: null, project: found?.decl.project, status: null, outcome: 'dropped', requests: 0, bytes: 0, ms: 0, failures: 0 }, why);
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
    return meter(deps, { ingest, channel, host, project: decl.project, status: null, outcome: 'paused', requests: 0, bytes: 0, ms: 0, failures: 1 }, `${ingest} did not run: the key it sends to ${host} is gone.`);
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
  outcome: Metered['outcome'];
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
export function meter(deps: Pick<ActionDeps, 'sql' | 'mint' | 'nowMs'>, usage: Usage, say: string): Metered {
  const event = deps.mint();
  const at = instant(deps.nowMs);
  const scope = usage.project ?? 'global';
  /* A RUN THAT NEVER STARTED IS NOT A RUN. A job whose pack was turned off, or one the plan's limit held, sent
     nothing, so it counts nothing against the allowance. It is still an event, so it is never silent. */
  const counted = {
    runs: usage.outcome === 'dropped' || usage.outcome === 'held' ? 0 : 1,
    requests: usage.requests,
    bytes: usage.bytes,
    ms: usage.ms,
    failures: usage.failures,
    held: usage.outcome === 'held' ? 1 : 0,
  };
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'pull', ?, 'declaration', ?, ?)",
    event,
    at,
    `ingest:${usage.ingest}`,
    `declaration:ingest.${usage.ingest}`,
    JSON.stringify({ channel: usage.channel, host: usage.host, status: usage.status, outcome: usage.outcome, scope, usage: counted }),
    say.slice(0, 280),
  );
  return { event, at, ingest: usage.ingest, channel: usage.channel, scope, outcome: usage.outcome, usage: counted };
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
 * `WRONG_KEY` PAUSES TOO. The host holds no key store, or the key did not open on it, so nothing was sent and
 * nothing would be sent next time. The row pauses with the executor's sentence; the key is not marked stale.
 *
 * ANYTHING ELSE IS REFUSED AND NOT RETRIED: an origin the host would not call, an answer over the cap, any
 * other 4xx. Retrying those sends the same wrong request again.
 */
export function finishAction(deps: ActionDeps, ready: Ready, answer: ActionAnswer, hash: string): Metered {
  const { job, decl, request, host } = ready;
  const { ingest, channel } = request;

  /* HELD AT THE PLAN'S LIMIT: nothing was sent. The job is finished, the action waits until `until` (or later,
     if it was already due later), and the event carries the host's one sentence. It is not paused, so nobody
     has to resume it: it runs again on its own when the month turns. */
  if ('held' in answer && answer.held !== undefined) {
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
    deps.sql.exec(
      "UPDATE schedule SET due_at = MAX(due_at, ?) WHERE kind = ? AND key = ? AND state = 'pending'",
      instant(answer.held.until),
      channel,
      ingest,
    );
    return meter(deps, { ingest, channel, host, project: decl.project, status: null, outcome: 'held', requests: 0, bytes: 0, ms: 0, failures: 0 }, answer.held.say);
  }

  const base = { ingest, channel, host, project: decl.project, requests: answer.requests, bytes: answer.bytes, ms: answer.ms };
  const status = 'status' in answer ? answer.status : null;

  if (status === 401 || status === 403) {
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
    if (request.grant) deps.sql.exec('UPDATE grant SET stale_at = ? WHERE id = ?', instant(deps.nowMs), request.grant.id);
    pause(deps, channel, ingest, `${ingest} is paused: ${host} refused the key "${request.grant?.label ?? 'none'}" with ${status}.`);
    return meter(deps, { ...base, status, outcome: 'paused', failures: 1 }, `${ingest} stopped: ${host} answered ${status} to the key "${request.grant?.label ?? 'none'}". It will not retry until somebody resumes it.`);
  }

  /* THE HOST COULD NOT OPEN THE KEY: it holds no key store yet, or the key does not open on it. Nothing was sent,
     and the next interval would send nothing again, so the action pauses the way a refused key does, with the
     executor's sentence. The key is NOT marked stale, because no provider ever saw it. */
  if ('refused' in answer && answer.refused.code === 'WRONG_KEY') {
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
    pause(deps, channel, ingest, `${ingest} is paused. ${answer.refused.fix}`);
    return meter(deps, { ...base, status: null, outcome: 'paused', failures: 1 }, `${ingest} stopped. ${answer.refused.fix} It will not retry until somebody resumes it.`);
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
    return meter(deps, { ...base, status, outcome, failures: outcome === 'refused' ? 1 : 0 }, say);
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
    return meter(deps, { ...base, status, outcome: 'failed', failures: 1 }, `${ingest} failed and will try again later. ${why}`);
  }

  deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
  return meter(deps, { ...base, status, outcome: 'refused', failures: 1 }, `${ingest} was not retried. ${why}`);
}

/* ── the pass ───────────────────────────────────────────────────────────── */

/** What one pass needs, each step in its own transaction. */
export type RunnerSteps = {
  drain: () => Drained;
  lease: (n: number) => OutboxRow[];
  prepare: (job: OutboxRow) => Ready | Metered;
  finish: (ready: Ready, answer: ActionAnswer, hash: string) => Metered;
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
  const out: ActionsRun = { fired: drained.done, ran: 0, ok: 0, changed: 0, paused: 0, failed: 0, refused: 0, dropped: 0, held: 0, usage: [] };

  for (const job of steps.lease(n)) {
    const ready = steps.prepare(job);
    if (!('request' in ready)) {
      out.usage.push(ready);
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
    const hash = 'body' in answer ? await answerHash(answer.body) : '';
    const metered = steps.finish(ready, answer, hash);
    out.usage.push(metered);
    const { outcome } = metered;
    if (outcome === 'held') {
      out.held++;
      continue;
    }
    out.ran++;
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

/* ── the list a person reads ────────────────────────────────────────────── */

type Totals = { runs: number; requests: number; bytes: number; failures: number };

/**
 * One scheduled action, as the record's `actions` read answers it (`loop/research-scheduled-actions.md` §4.6).
 *
 * THE KEY IS ITS LABEL, from the vault's index. Nothing sealed is read to build this, and the run sentences are the
 * `pull` events' own notes, which carry a host, a status and a label and never a value.
 */
export type ActionRow = {
  ingest: string;
  channel: ActionKind;
  /** The project it runs for, or `null` for every project. */
  project: string | null;
  host: string | null;
  every: string;
  key: string | null;
  state: 'pending' | 'firing' | 'paused' | 'done';
  /** When it runs next, while it is pending or firing. A paused or finished action has none. */
  next: string | null;
  last: { at: string; outcome: Metered['outcome']; status: number | null; note: string } | null;
  /** This calendar month so far, UTC. `held` is how many runs the plan's limit held, which count no run. */
  month: Totals & { held: number };
  /** This month by UTC day, from the first to today, oldest first. */
  days: ({ day: string } & Totals)[];
};

const ROW_STATES: readonly string[] = ['pending', 'firing', 'paused', 'done'];

type Run = { status: number | null; outcome: Metered['outcome']; usage: Metered['usage'] };

/** A `pull` event's `to_v`, when `meter` wrote it. Anything else on the same target is not a run. */
function runOf(to_v: string): Run | null {
  try {
    const v = JSON.parse(to_v) as Partial<Run>;
    return typeof v.usage === 'object' && v.usage !== null && typeof v.outcome === 'string' ? (v as Run) : null;
  } catch {
    return null;
  }
}

/**
 * Every active `pull`, `call` and `poll`, with its schedule, its last run and this month's counts.
 *
 * FROM THE RECORD'S OWN ROWS: the declaration, the schedule row it runs from, the key's label, and the `pull` events
 * `meter` wrote. A pack that is off has retired its declarations, so its actions are not in the list.
 */
export function listActions(sql: Sql, nowMs: number): ActionRow[] {
  const today = instant(nowMs);
  const month = today.slice(0, 7);
  const upTo = Number(today.slice(8, 10));

  return sql
    .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
    .map((r) => JSON.parse(r.body) as ActionDecl & { ingest: string })
    .filter((decl) => (ACTION_KINDS as readonly string[]).includes(decl.channel))
    .map((decl): ActionRow => {
      const channel = decl.channel as ActionKind;
      const target = `declaration:ingest.${decl.ingest}`;
      const row = sql.one<{ state: string; due_at: string }>('SELECT state, due_at FROM schedule WHERE kind = ? AND key = ?', channel, decl.ingest);
      const state = row && ROW_STATES.includes(row.state) ? (row.state as ActionRow['state']) : 'done';
      const address = addressOf(decl);

      let last: ActionRow['last'] = null;
      for (const e of sql.all<{ ts: string; to_v: string; note: string | null }>(
        "SELECT ts, to_v, note FROM event WHERE kind = 'pull' AND target = ? AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 20",
        target,
      )) {
        const run = runOf(e.to_v);
        if (run) {
          last = { at: e.ts, outcome: run.outcome, status: run.status ?? null, note: e.note ?? '' };
          break;
        }
      }

      const totals = { runs: 0, requests: 0, bytes: 0, failures: 0, held: 0 };
      const days = Array.from({ length: upTo }, (_, i) => ({ day: `${month}-${String(i + 1).padStart(2, '0')}`, runs: 0, requests: 0, bytes: 0, failures: 0 }));
      for (const e of sql.all<{ ts: string; to_v: string }>(
        "SELECT ts, to_v FROM event WHERE kind = 'pull' AND target = ? AND to_v IS NOT NULL AND ts >= ? ORDER BY rowid",
        target,
        `${month}-01`,
      )) {
        const run = runOf(e.to_v);
        if (!run || e.ts.slice(0, 7) !== month) continue;
        const u = run.usage;
        totals.runs += u.runs ?? 0;
        totals.requests += u.requests ?? 0;
        totals.bytes += u.bytes ?? 0;
        totals.failures += u.failures ?? 0;
        totals.held += u.held ?? 0;
        const day = days[Number(e.ts.slice(8, 10)) - 1];
        if (day) {
          day.runs += u.runs ?? 0;
          day.requests += u.requests ?? 0;
          day.bytes += u.bytes ?? 0;
          day.failures += u.failures ?? 0;
        }
      }

      return {
        ingest: decl.ingest,
        channel,
        project: typeof decl.project === 'string' && decl.project !== '' ? decl.project : null,
        host: address && originOf(address) ? new URL(address).host : null,
        every: decl.every,
        key: decl.grant === undefined || decl.grant === '' ? null : (keyNamed(sql, decl.grant)?.label ?? decl.grant),
        state,
        next: row && (state === 'pending' || state === 'firing') ? row.due_at : null,
        last,
        month: totals,
        days,
      };
    });
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
