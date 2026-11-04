/**
 * The conformance suite's frame: what a host hands a case, what a case hands back, and the one assert both hosts use.
 *
 * ONE LIST OF CASES, RUN ON BOTH HOSTS, so the self-host (`node:sqlite`, `apps/selfhost`) and the Cloud (the Durable
 * Object's SQLite, `apps/worker`) cannot drift apart without a case saying so (`33 §3`, F30 of the finish queue). Each
 * case is given a fresh `Host`, the port exactly as that host builds it for a record (the guard in front, the host's own
 * transactions behind), and the host's own alarm. It asserts what the contract says, and hands back a TRACE: what it
 * saw, as plain JSON. The runners write each host's traces to `_results/<host>.json`, and `compare.run.ts` holds the two
 * equal case by case, so a difference nobody thought to assert is still caught.
 *
 * NOTHING HERE IMPORTS `node:`, because the same file is bundled into a Durable Object on workerd by
 * `apps/worker/test/conformance.run.ts`. The assert is this file's own rather than `node:assert` for the same reason,
 * and both hosts use it, so a case cannot pass on one host because that host's assert is looser.
 *
 * A CASE THAT ONE HOST IS KNOWN TO FAIL says so in `drift`, with the host and why. It still runs there, as a `todo`, so
 * the report shows the drift on every run without turning the suite red; it must pass on the other host. Taking a
 * `drift` off is the fix landing.
 */

import { mapDriverMessage, type Scheduler, type Sql } from '@braindog/ports';

/** The two hosts. The Durable Object is the reference (`33 §3`): where they differ, its answer is the contract. */
export const HOSTS = ['node:sqlite', 'durable-object'] as const;
export type HostName = (typeof HOSTS)[number];

/** What a case is given: one fresh, empty database behind the host's own port, and the host's own alarm. */
export type Host = {
  readonly name: HostName;
  /** The port as the host builds it for a record: `openSqlite` on the self-host, `guardedSql` on the Worker. */
  readonly sql: Sql;
  /** The host's own alarm: `nodeScheduler` on the self-host, `alarmScheduler` over `ctx.storage` on the Worker. */
  readonly scheduler: Scheduler;
  /** How many times `scheduler.wake()` has rung since this host was made. */
  wakes(): number;
};

/** The four methods of `33 §3`. A skip is never an assertion. */
export interface Assert {
  ok(v: unknown, msg: string): void;
  equal(a: unknown, b: unknown, msg: string): void;
  deepEqual(a: unknown, b: unknown, msg: string): void;
  fail(msg: string): never;
}

/** What a case saw, as plain JSON: equal on both hosts or `compare.run.ts` says where they part. */
export type Trace = Record<string, unknown>;

export type Area = 'values' | 'guard' | 'transactions' | 'search' | 'limits' | 'driver' | 'record' | 'versions' | 'outbox' | 'migrations';

export type Case = {
  /** Kebab case, stable: the results files and the compare are keyed by it. */
  id: string;
  area: Area;
  /** What the case holds, in one sentence, for the report. */
  says: string;
  /** A host known to answer differently, and why. The case runs there as a `todo`. */
  drift?: { host: HostName; why: string };
  run(host: Host, t: Assert): Trace | Promise<Trace>;
};

/** One case's outcome on one host, as both runners write it. */
export type Outcome = { id: string; status: 'pass' | 'fail'; trace: unknown; message?: string };

/** A failed assertion, told from a case that threw by its name. */
export class Failed extends Error {
  override readonly name = 'ConformanceFailed';
}

/**
 * A value as JSON can carry it and a reader can tell apart: a `Uint8Array` is `{ bytes }`, an `ArrayBuffer` is
 * `{ arraybuffer }` (so the BLOB shape is part of the comparison, `storageSql`'s `bytesIn`), a bigint, a non-finite
 * number and minus zero are named, and object keys are sorted so key order is not a difference.
 */
export function plainJson(v: unknown): unknown {
  if (v instanceof Uint8Array) return { bytes: Array.from(v) };
  if (v instanceof ArrayBuffer) return { arraybuffer: Array.from(new Uint8Array(v)) };
  if (typeof v === 'bigint') return { bigint: v.toString() };
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { number: String(v) };
    if (Object.is(v, -0)) return { number: '-0' };
    return v;
  }
  if (v === undefined) return { undefined: true };
  if (Array.isArray(v)) return v.map(plainJson);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v).sort()) out[key] = plainJson((v as Record<string, unknown>)[key]);
    return out;
  }
  return v;
}

/** A value in a failure sentence, cut so a 4 MB string does not become the message. */
const show = (v: unknown): string => {
  let s: string;
  try {
    s = JSON.stringify(plainJson(v)) ?? String(v);
  } catch {
    s = String(v);
  }
  return s.length > 400 ? `${s.slice(0, 400)}... (${s.length} characters)` : s;
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(plainJson(a)) === JSON.stringify(plainJson(b));

/** The assert both hosts run under. */
export const portableAssert: Assert = {
  ok(v, msg) {
    if (!v) throw new Failed(msg);
  },
  equal(a, b, msg) {
    if (!Object.is(a, b)) throw new Failed(`${msg}: got ${show(a)}, wanted ${show(b)}`);
  },
  deepEqual(a, b, msg) {
    if (!same(a, b)) throw new Failed(`${msg}: got ${show(a)}, wanted ${show(b)}`);
  },
  fail(msg): never {
    throw new Failed(msg);
  },
};

/** Two traces equal as `compare.run.ts` reads them. */
export const sameTrace = same;

/**
 * What a throw was, as one of the port's thirteen codes.
 *
 * BY NAME AND NOT `instanceof`, because the Worker's bundle and a test process can each hold their own copy of the
 * class. A driver error the guard did not name goes through `mapDriverMessage`, which is how the port would read it.
 */
export function thrownCode(e: unknown): string {
  const code = e instanceof Error && e.name === 'SqlError' ? (e as unknown as { code?: unknown }).code : undefined;
  if (typeof code === 'string') return code;
  return mapDriverMessage(e instanceof Error ? e.message : String(e));
}

/** `'ok'`, or the code of what `fn` threw. */
export function codeOf(fn: () => unknown): string {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return thrownCode(e);
  }
}

/** One case on one host, never throwing: a failed assert and an unexpected throw both come back as `fail`. */
export async function runCase(c: Case, host: Host, t: Assert = portableAssert): Promise<Outcome> {
  try {
    const trace = plainJson(await c.run(host, t));
    return { id: c.id, status: 'pass', trace };
  } catch (e) {
    const message =
      e instanceof Failed
        ? e.message
        : `${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}${e instanceof Error && e.stack ? `\n${e.stack.split('\n').slice(1, 6).join('\n')}` : ''}`;
    return { id: c.id, status: 'fail', trace: null, message };
  }
}

/** The `todo` reason for a case on a host, or `undefined` when the case must pass there. */
export const todoOn = (c: Case, host: HostName): string | undefined =>
  c.drift && c.drift.host === host ? `known drift on ${host}: ${c.drift.why}` : undefined;
