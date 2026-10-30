/**
 * Report keys: a token a project holds so it can send its own rows, and do nothing else.
 *
 * A PROJECT REPORTS, AND IT READS NOTHING. A service that posts its sign-ups every hour needs a credential
 * it can keep in its environment, and a write token is a key to the whole record: every list, every
 * figure, every person. A report key is an ordinary agent token (`write`, minted by an owner) whose label
 * binds it to one register and to the fields it always carries, so the record can refuse it everywhere
 * except `report`, and write only what the binding allows.
 *
 * THE BINDING IS THE LABEL, and only `createReportKey` writes one. `createToken` refuses a label that begins
 * `report:`, so no token becomes a report key by accident, and a label is fixed for a token's life. The
 * record names no use case: the register and the fixed fields come from whoever minted the key.
 *
 * PURE, so the web app can read a key's binding from the token listing with the same function the record
 * enforces it with.
 */

/** What every report key's label begins with. */
export const REPORT_PREFIX = 'report:';

/** What a job's own bearer is labelled with before its job's id (`claimJob`, the kernel's `jobs.ts`): no other key may begin so. */
export const JOB_PREFIX = 'job:';

/** The most rows one `report` call writes. A batch past it is refused whole. */
export const REPORT_ROWS_MOST = 100;

/**
 * The most one `report` call weighs, as the JSON of its rows. A hundred readings of a name, a number and a unit are a few
 * kilobytes; a key kept in a project's environment is the credential most likely to leak, and nothing else held what one
 * call could write, so a single row of five megabytes went in.
 */
export const REPORT_BYTES_MOST = 256 * 1024;

/**
 * The rows one report key may send in a minute, counted in a window its first report opens. `tools/gates/budgets.json`'s
 * `report.rowsPerMinute` holds the same number, and `guards` fails when the two differ.
 *
 * A LEAKED KEY WAS EVERY ROW THE RECORD COULD HOLD: a hundred a call, as often as it liked. Six hundred is a reading every
 * tenth of a second, far past a project that reports its own numbers, and a limit on one that is misused.
 */
export const REPORT_ROWS_PER_MINUTE = 600;
/** The window `REPORT_ROWS_PER_MINUTE` is counted over. */
export const REPORT_WINDOW_MS = 60_000;

/** The most fields a key fixes. Each is a value the project cannot change. */
export const REPORT_FIXED_MOST = 8;

/** The longest name a key is given. */
export const REPORT_NAME_MOST = 80;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** What a report key is bound to. */
export type ReportBinding = {
  /** The one register it writes rows to. */
  register: string;
  /** Fields every row it writes carries, over anything the project sent for them. */
  fixed?: Record<string, Json>;
  /** A field filled with the moment the row arrived, when the project sent no value for it. */
  stamp?: string;
  /** What the owner called it: the project that holds it, usually. */
  name?: string;
};

/** The label a key with this binding carries. Compact JSON, keys in one order, so a label is stable. */
export function reportLabel(binding: ReportBinding): string {
  const out: Record<string, Json> = { register: binding.register };
  if (binding.fixed !== undefined && Object.keys(binding.fixed).length > 0) out.fixed = binding.fixed;
  if (binding.stamp !== undefined) out.stamp = binding.stamp;
  if (binding.name !== undefined && binding.name !== '') out.name = binding.name;
  return `${REPORT_PREFIX}${JSON.stringify(out)}`;
}

const IDENT = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * The binding a label carries, or `null` when the label is not a report key's.
 *
 * A LABEL THAT BEGINS `report:` AND DOES NOT PARSE IS STILL A REPORT KEY'S, bound to nothing. It answers a
 * binding whose register no register can be named, so the key is refused everywhere, `report` included,
 * rather than falling back to being an ordinary write token.
 */
export function reportBindingOf(label: string | null | undefined): ReportBinding | null {
  if (typeof label !== 'string' || !label.startsWith(REPORT_PREFIX)) return null;
  const broken: ReportBinding = { register: '' };
  let said: unknown;
  try {
    said = JSON.parse(label.slice(REPORT_PREFIX.length));
  } catch {
    return broken;
  }
  if (said === null || typeof said !== 'object' || Array.isArray(said)) return broken;
  const o = said as Record<string, unknown>;
  if (typeof o.register !== 'string' || !IDENT.test(o.register)) return broken;
  const out: ReportBinding = { register: o.register };
  if (o.fixed !== undefined) {
    if (o.fixed === null || typeof o.fixed !== 'object' || Array.isArray(o.fixed)) return broken;
    out.fixed = o.fixed as Record<string, Json>;
  }
  if (o.stamp !== undefined) {
    if (typeof o.stamp !== 'string' || !IDENT.test(o.stamp)) return broken;
    out.stamp = o.stamp;
  }
  if (typeof o.name === 'string') out.name = o.name;
  return out;
}

/**
 * The fields one reported row is written with.
 *
 * WHAT THE KEY FIXES WINS, because a project reporting for itself cannot say it is another project. The
 * stamp is filled only when the project sent nothing for it, so a project that knows when its number was
 * true says so. `now` is the record's instant, and a `day` field takes its date.
 */
export function reportedFields(
  binding: ReportBinding,
  sent: Record<string, Json>,
  now: string,
  stampType?: string,
): Record<string, Json> {
  const fields: Record<string, Json> = { ...sent, ...(binding.fixed ?? {}) };
  if (binding.stamp !== undefined && (fields[binding.stamp] === undefined || fields[binding.stamp] === null))
    fields[binding.stamp] = stampType === 'day' ? now.slice(0, 10) : now;
  return fields;
}

/** The rows one `report` call carries: `{ rows: [...] }`, or one row's fields as the whole body. */
export function reportedRows(args: unknown): Record<string, Json>[] | null {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return null;
  const a = args as Record<string, unknown>;
  if (Array.isArray(a.rows)) {
    if (!a.rows.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r))) return null;
    return a.rows as Record<string, Json>[];
  }
  return [a as Record<string, Json>];
}
