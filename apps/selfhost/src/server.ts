/**
 * The self-host: one Node process, one file, the same record.
 *
 * IT IS NOT A CUT-DOWN VERSION. `01-ARCHITECTURE` §4 makes the self-host the same code as the hosted
 * product with a different storage adapter underneath — the packages are identical, and everything
 * in this file is the two things a platform actually differs on: where the bytes live, and how a
 * request arrives. If a route ever appears here and not in the Worker, one of them is a different
 * product.
 *
 * THIS FILE IS ALLOWED TO KNOW IT IS NODE. That is the other side of the line the `stack` gate draws
 * across `packages/**`: the kernel may not ask which runtime it is in, and a host must.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { argv, env, exit } from 'node:process';

import { handlersFor, httpStatus, serveApi, type Handler } from '@braindog/host';
import type { OutboxKind, OutboxRow } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '@braindog/record';
import type { Param, Refusal, Row, Scheduler, Sql } from '@braindog/ports';

/** The `Sql` port over `node:sqlite`. The one thing this file exists to supply. */
export function openSqlite(path: string): Sql & { close(): void } {
  /* FOREIGN KEYS OFF, and it is not a preference. `node:sqlite` defaults this ON and a Durable
     Object leaves SQLite's default OFF — so `decision.supersedes REFERENCES decision(id)` is
     enforced here and nowhere else, which is a behavioural fork between the two hosts on the write
     path. The DDL's own comment beside that column says "documentary; not enforced". */
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/**
 * Who is asking.
 *
 * ONE USER, and the token is the whole of the check — `30-BLUEPRINT` §10's `BRAINDOG_TOKEN` row: a
 * self-host is one person's record on one machine, so there is no directory, no invitation and no
 * second level. What there IS is the same `CallContext` the hosted product builds, so every
 * permission check below this line is the same code.
 */
/** A credential this record does not know, or none where one is needed. 401 — `49 §5.4` step 1. */
const UNKNOWN: Refusal = { code: 'UNAUTHORIZED', fix: 'This record does not know that credential.', at: 'authorization' };

/** A credential it knows, belonging to somebody it does not. 403, and the Worker says the same. */
const OFF: Refusal = { code: 'FORBIDDEN', fix: 'This credential does not reach this record.', at: 'principal' };

/**
 * A record whose every owner is suspended.
 *
 * IT IS NOT THE CALLER'S FAULT AND THE SENTENCE SAYS SO. Answering 403 "this credential does not
 * reach this record" to an operator holding the right shared secret, on loopback, is the least
 * actionable thing this server can say — the credential is perfect and the record is the problem.
 * `49 §5.1` step 5.3 calls a record that cannot be brought up `sick`, with a `{ code, fix }`, at 503.
 */
const NOBODY: Refusal = {
  code: 'SCHEMA_UNAVAILABLE',
  fix: 'Every owner of this record is suspended, so nobody may act on it. Un-suspend one.',
  at: 'record',
};

async function contextFor(
  request: Request,
  token: string | undefined,
  api: Awaited<ReturnType<typeof createRecordApi>>,
): Promise<CallContext | Refusal> {
  /**
   * WHAT WAS ACTUALLY PRESENTED, and `undefined` when that is nothing.
   *
   * `headers.get` RETURNS `''` FOR A HEADER WITH NO VALUE, and `'' !== undefined` — so a bare
   * `Authorization:` line read as a credential. That is one byte, and it walked straight through the
   * check that had just been added to stop exactly this: a request carrying nothing minted an owner
   * bearer that works from anywhere for thirty days. `Authorization: Bearer` did it too, because the
   * strip needs whitespace after `Bearer` to match, so the word itself became the credential.
   *
   * TRIMMED AND EMPTIED TO `undefined` HERE, ONCE, so nothing below has to remember.
   */
  const raw = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const sent = raw ? raw : undefined;

  /* AN AGENT TOKEN IS TRIED FIRST, and it is the same table and the same check the Worker uses. A
     self-host that recognised only one shared string would be a deployment where an agent cannot be
     given less than everything — which is the difference between a scope and a password. */
  /* AND IT IS NOT THE SHARED SECRET. `includes('.')` is how this tells an agent token from the one
     shared secret, and a secret like `s3cr3t.v2` took this branch, failed `verifyToken`, and was
     refused — locking the owner out of their own machine with a status that explains nothing. The
     shared secret is one exact string; anything else with a dot in it is an agent token. */
  if (sent?.includes('.') && sent !== token) {
    const seen = await api.kernel.verifyToken(sent, 'api');
    if (!seen.ok) return UNKNOWN;

    /* THE PERSON'S LEVEL COMES FROM THE RECORD, never from a constant. `owner` here meant a token
       belonging to a colleague invited at `read` came back as an owner — and that a token outlived
       the removal of the person who holds it, which is the one thing this whole path exists to
       prevent. */
    const held = api.kernel.access(seen.value.person_id);
    /* NOT ON THIS RECORD IS 403, and a credential this record does not know is 401. They were one
       answer, so revoking somebody's membership and sending a bearer nobody minted looked the same
       to a client — and only one of the two is worth retrying with a different credential. */
    if (!held) return OFF;
    return {
      principal: {
        kind: 'token',
        id: seen.value.id,
        scope: seen.value.scope,
        person: seen.value.person_id,
        level: held.level,
      },
      ...(held.registers === null ? {} : { registers: held.registers }),
      ...(Object.keys(held.levels).length === 0 ? {} : { levels: held.levels }),
    };
  }

  /* A BEARER THAT DID NOT VERIFY IS REFUSED, and does not fall through to the branch below. It
     used to: revoking a scoped token PROMOTED it, because the same header that had been a `read`
     agent became an unauthenticated request and an unauthenticated request was the owner. */
  if (sent?.includes('.') && sent !== token) return UNKNOWN;

  /* AND THEN THE ONE SHARED SECRET, which is what a single-person deployment on one machine has
     instead of a sign-in. `undefined` and not falsy: an empty `BRAINDOG_TOKEN` in a compose file is
     a value somebody set, and reading it as "no token wanted" opens the server rather than locking
     it. */
  if (token !== undefined && sent !== token) return UNKNOWN;

  /* AND SOMETHING THAT MATCHED NOTHING IS REFUSED, rather than treated as nothing. `49 §5.4` step 1:
     a credential that is neither `config.token` nor a token row nor a device grant is 401. It used
     to fall through to the branch below — so `Authorization: x` on a self-host with no shared secret
     was the owner, which is the same hole as the empty header and reads even less like one. */
  if (sent !== undefined && sent !== token) return UNKNOWN;

  /* A RECORD WITH NO ELIGIBLE OWNER REFUSES, rather than inventing one. The fallback to a constant is
     right for a file nobody has created — that is what `braindog dev` and every test against an
     empty file open — and wrong the moment there IS a record: it would hand `owner` to a person id
     no `member` row names, on a record whose own tables say every owner is suspended. */
  const who = api.kernel.created() ? api.kernel.ownerId() : 'p_self';
  if (!who) return NOBODY;

  /* AND WHETHER ANYTHING WAS PRESENTED TRAVELS WITH IT. Reading and writing as the owner without a
     credential is the documented shape of a single-person deployment; minting a bearer that outlives
     the machine is not, and `createToken` is the one method that can tell the difference only if it
     is told. */
  return { principal: { kind: 'person', id: who, level: 'owner' }, credentialed: sent !== undefined };
}

/**
 * What delivers one outbox job. The self-host's whole outbound surface, in one function.
 *
 * A record makes no outbound call, so somebody has to — and on a self-host that somebody is this
 * process, after the transaction committed. It returns nothing on success and throws on failure,
 * because the retry ladder is the record's and a deliverer that decided its own retries would be the
 * second ladder [09-ALARMS] spends a paragraph forbidding.
 */
export type Deliver = (job: OutboxRow) => Promise<void>;

export type Started = Awaited<ReturnType<typeof start>>;

/**
 * The `Scheduler` port over `setTimeout`.
 *
 * IDENTICAL SEMANTICS TO THE DURABLE OBJECT'S ALARM, which is the point: one alarm, always set to
 * the earliest pending row or not set at all. The Worker gets that from the platform and this gets
 * it from a timer, and the code above the port cannot tell.
 *
 * `wake()` IS NOT A NO-OP HERE. An earlier way of thinking about this made it one — the poller
 * shares the process, so what is there to wake? — and that is exactly wrong: sharing a process is
 * not being woken, and a job that waits fifteen seconds for the next tick when the record already
 * knows it is there is fifteen seconds of latency nobody chose.
 */
function nodeScheduler(run: () => Promise<void>, poll: () => Promise<void>): Scheduler & { stop(): void } {
  /* Node's timer overflows past 2^31 ms and fires IMMEDIATELY, which for a yearly renewal reminder
     would be a notification a year early rather than a year late. Clamped, and re-armed on arrival. */
  const CEILING_MS = 2 ** 31 - 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let at: number | null = null;
  let stopped = false;

  const clear = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    at = null;
  };

  return {
    get: () => Promise.resolve(at),
    set(atMs: number) {
      if (stopped) return Promise.resolve();
      if (timer) clearTimeout(timer);
      at = atMs;
      const delay = Math.min(Math.max(0, atMs - Date.now()), CEILING_MS);
      timer = setTimeout(() => {
        timer = null;
        at = null;
        void run();
      }, delay);
      timer.unref?.();
      return Promise.resolve();
    },
    clear: () => (clear(), Promise.resolve()),
    wake: () => (stopped ? Promise.resolve() : poll()),
    stop() {
      stopped = true;
      clear();
    },
  };
}

/** The kinds a self-host can be asked to deliver. The nine minus nothing: `deliver` decides. */
/**
 * The nine, for a deployment that really can deliver all nine.
 *
 * IT IS A CONVENIENCE AND NEVER A DEFAULT. `start` requires the list from whoever supplies the
 * deliverer, because the only host that can say what it serves is the one holding the transports.
 */
export const EVERY_KIND: OutboxKind[] = [
  'notify.email',
  'notify.push',
  'notify.webhook',
  'pull.fetch',
  'export.r2',
  'erase.r2',
  'infer.embed',
  'infer.prose',
  'infer.draft',
];

export async function start(options: {
  file: string;
  port: number;
  token?: string | undefined;
  /**
   * Which interface to listen on. Defaults to loopback when there is no token, `0.0.0.0` when there
   * is — because "no token" means "one person on one machine", and one machine is `127.0.0.1`.
   */
  host?: string | undefined;
  /** The belt under the doorbell: a tick that catches an abandoned lease. `0` turns it off. */
  pollMs?: number;
} & (
    | {
        /**
         * What this deployment can actually deliver, and the deliverer that does it.
         *
         * THE TWO TRAVEL TOGETHER BECAUSE THE LIST IS A PROPERTY OF THE DELIVERER. This leased all
         * nine kinds and handed each row to whatever function it was given — so a self-host with no
         * model leased its `infer.embed` rows, threw "nothing in this deployment delivers a
         * infer.embed" at each of them eight times, and dead-lettered them with a suggestion asking
         * somebody to decide about work they never asked for. 49 §5.12 note 1 says the opposite in
         * as many words: "a kind not in `kinds` is never leased, so it waits in `pending` until the
         * host can serve it — a self-host with no model never dead-letters an `infer.embed` row",
         * and §9 has the test.
         *
         * A LIST THAT COULD BE OMITTED WOULD DEFAULT TO ONE OF THE TWO FAILURES — deliver nothing
         * silently, or dead-letter everything loudly — so it cannot be omitted. The Worker states
         * the same list as `DELIVERS` and has always leased only that.
         */
        delivers: readonly OutboxKind[];
        deliver: Deliver;
      }
    | {
        /** Omit both and nothing is delivered — jobs queue and wait, which is honest rather than lossy. */
        delivers?: undefined;
        deliver?: undefined;
      }
  )) {
  const sql = openSqlite(options.file);

  /* The alarm and the record refer to each other: the record arms the alarm after every write, and
     the alarm drains the record when it fires. The scheduler is built first and the record is what
     it drains, which is why this one binding is written before the thing it names exists. */
  let api!: Awaited<ReturnType<typeof createRecordApi>>;

  /**
   * Drain everything due, then re-arm.
   *
   * `drain` re-arms in a `finally` of its own, so a handler that throws cannot stop the schedule.
   * The loop back into itself is the batch ceiling: a hundred claimed rows leave the minimum still
   * in the past, and the alarm is set to now.
   */
  const run = async (): Promise<void> => {
    try {
      await api.kernel.drain(scheduler);
    } catch (e) {
      /* The alarm was re-armed before this reached here. Losing the process to an unhandled
         rejection would take the server with it, and the row is still `pending`. */
      console.error('drain:', e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Lease, deliver, ack. One pass.
   *
   * ONE PASS AND NOT A LOOP, because the ack rings the doorbell again when anything is left — so a
   * queue that keeps filling is drained by the doorbell rather than by a `while` nobody can stop.
   */
  const poll = async (): Promise<void> => {
    if (!options.deliver) return;
    let jobs: OutboxRow[];
    try {
      jobs = api.kernel.leaseOutbox(options.delivers, 10);
    } catch (e) {
      console.error('lease:', e instanceof Error ? e.message : String(e));
      return;
    }
    for (const job of jobs) {
      /* THE SUCCESS ACK IS OUTSIDE THE TRY WHOSE CATCH ACKS FAILURE, and the lease goes back with
         the answer. See the note on the Worker's copy: both hosts had the same two shapes. */
      let sent = false;
      let why = '';
      try {
        await options.deliver(job);
        sent = true;
      } catch (e) {
        why = e instanceof Error ? e.message : String(e);
      }

      try {
        api.kernel.ackOutbox(
          sent
            ? { id: job.id, state: 'done', leasedUntil: job.leasedUntil }
            : { id: job.id, state: 'failed', error: why, leasedUntil: job.leasedUntil },
        );
      } catch (e) {
        console.error('ack:', e instanceof Error ? e.message : String(e));
      }
    }

    /* AND THEN THE TAIL, because a failed ack arms a `retry` row and nothing else here would notice.
       Without this an idle record sat with `pendingWork()` reporting work to do and no alarm set:
       the retry waited for an unrelated write, and the fifteen-second belt did not rescue it because
       a lease never takes a `failed` row. */
    if (jobs.length > 0) await api.kernel.tail(scheduler);
  };

  const scheduler = nodeScheduler(run, poll);
  /* WHAT THIS PROCESS CAN ACTUALLY DELIVER. With no `deliver`, nothing leaves — jobs queue and
     wait, which is honest — and the doorbell should not ring about them on every write. */
  api = await createRecordApi({
    sql,
    clock: { now: () => Date.now() },
    scheduler,
    delivers: options.delivers ?? [],
  });

  const refused = api.kernel.refused();
  if (refused) {
    console.error(`${refused.code}: ${refused.fix}`);
    exit(1);
  }

  /* THE WIRING IS SHARED, not copied. Both hosts call `handlersFor`, so a route cannot exist in one
     and not the other — and it throws at start rather than 404ing in production. */
  const handlers = handlersFor(api);

  /* THE BELT UNDER THE DOORBELL. A lost wake costs latency and never a job, because the row is still
     `pending` — and this tick is what makes that true. It is also what recovers a lease abandoned by
     a process that died holding it. */
  const ticker = options.pollMs === 0 ? null : setInterval(() => void poll(), options.pollMs ?? 15_000);
  ticker?.unref?.();

  /* Arm from what the record already holds. A record reopened after a week has reminders whose time
     came while nothing was running, and an alarm nobody set is a schedule that never restarts. */
  await api.kernel.tail(scheduler);

  /* LOOPBACK UNLESS THERE IS A TOKEN. `listen(port)` with no host binds every interface, and the
     no-token case above hands `p_self` at `owner` to whoever asks — so a self-host started with no
     `BRAINDOG_TOKEN`, which is the documented way to start one, served the credential index and the
     whole export to anything that could reach the machine. The two decisions are only safe
     together: no token means one person on one machine, and one machine is `127.0.0.1`.

     A deployment that wants a wider bind says so by setting a token, which is the same sentence
     read from the other end. `BRAINDOG_HOST` is the explicit override for the case in between — a
     container that has a token and needs `0.0.0.0` to be reachable at all. */
  const host = options.host ?? (options.token === undefined ? '127.0.0.1' : '0.0.0.0');
  /* NOTHING A REQUEST CAN DO ENDS THE PROCESS. `void answer(…)` discarded the promise and `answer`
     had no `catch`, so one throw was an unhandled rejection and Node exited — and the first throw is
     before any authentication: `new Request(url, { body })` refuses a body on a GET, so a `GET
     /api/boot` with a `Content-Length` killed the server. A client aborting mid-body did the same.
     The Worker never had this: workerd turns a throw into a 500.

     The 500 says what happened in one sentence and the socket is closed, which is the promise
     `serveApi` makes one layer down and the one this layer was breaking. */
  const server = createServer((req, res) => {
    void answer(req, res, handlers, api, options.token).catch((e: unknown) => {
      const why = e instanceof Error ? e.message : String(e);
      try {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, refusal: { code: 'INTERNAL', fix: `This request could not be read: ${why}.` } }));
      } catch {
        /* The socket is already gone, which is the ordinary case for an aborted request. */
        res.destroy();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(options.port, host, resolve));
  return {
    server,
    api,
    sql,
    scheduler,
    drain: run,
    poll,
    close: () =>
      new Promise<void>((r) => {
        scheduler.stop();
        if (ticker) clearInterval(ticker);
        server.close(() => (sql.close(), r()));
      }),
  };
}

async function answer(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: Record<string, Handler>,
  api: Awaited<ReturnType<typeof createRecordApi>>,
  token: string | undefined,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);

  const url = `http://localhost${req.url ?? '/'}`;
  const request = new Request(url, {
    method: req.method ?? 'GET',
    headers: Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]),
    ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
  });

  const ctx = await contextFor(request, token, api);
  /* AND THE STATUS COMES FROM THE SHARED TABLE. This answered one status for three different facts —
     a credential nobody minted, a credential belonging to somebody who is not on the record, and a
     record with no owner who may act — so a client could not tell which of the three to do something
     about. `httpStatus` is the same function the Worker uses, which is what keeps one record from
     behaving differently depending on where it runs. */
  const out =
    'principal' in ctx
      ? await serveApi(request, handlers, ctx)
      : new Response(JSON.stringify({ ok: false, refusal: ctx }), {
          status: httpStatus({ ok: false, refusal: ctx }),
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        });

  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}
