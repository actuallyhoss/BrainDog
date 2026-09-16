/**
 * Buckets of time, as `08 §2.1` names them: `day`, `week`, `month`, `quarter` and `year`.
 *
 * ONE SET OF KEYS FOR BOTH ENGINES. A grouped figure is read by the record in SQL and by the sample
 * in the browser, and a bar labelled June has to hold the same rows in both. So the key a day falls
 * in, where a bucket starts, and the bucket after it are written once, here, and the browser imports
 * them rather than keeping a copy that could drift.
 *
 * A KEY IS TEXT THAT ORDERS LIKE THE TIME IT NAMES: `2026-09-17`, the Monday `2026-09-14`, `2026-09`,
 * `2026-Q3` and `2026`. Everything is UTC, because `resolveDay` is, and a bucket computed in another
 * zone would name a day the predicate resolves differently.
 */

export const BUCKETS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const isBucket = (v: unknown): v is Bucket => (BUCKETS as readonly unknown[]).includes(v);

const DAY_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The bucket a day (or an instant, by its UTC day) falls in, or `null` when the text is not a date. */
export function bucketOf(text: string, bucket: Bucket): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(text);
  if (!m) return null;
  const [y, mo, d] = [m[1]!, m[2]!, m[3]!];
  if (bucket === 'day') return `${y}-${mo}-${d}`;
  if (bucket === 'month') return `${y}-${mo}`;
  if (bucket === 'year') return y;
  if (bucket === 'quarter') return `${y}-Q${Math.floor((Number(mo) - 1) / 3) + 1}`;
  /* THE MONDAY ON OR BEFORE, which is ISO 8601's first day of a week. */
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const back = (new Date(ms).getUTCDay() + 6) % 7;
  return iso(ms - back * DAY_MS);
}

/** The first day of a bucket, as `YYYY-MM-DD`. */
export function bucketStart(key: string, bucket: Bucket): string {
  if (bucket === 'day' || bucket === 'week') return key;
  if (bucket === 'month') return `${key}-01`;
  if (bucket === 'year') return `${key}-01-01`;
  const [y, q] = key.split('-Q');
  return `${y}-${String((Number(q) - 1) * 3 + 1).padStart(2, '0')}-01`;
}

/** The bucket after this one. */
export function nextBucket(key: string, bucket: Bucket): string {
  const start = bucketStart(key, bucket);
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  if (bucket === 'day') return iso(Date.UTC(y, m - 1, d + 1));
  if (bucket === 'week') return iso(Date.UTC(y, m - 1, d + 7));
  const months = bucket === 'month' ? 1 : bucket === 'quarter' ? 3 : 12;
  return bucketOf(iso(Date.UTC(y, m - 1 + months, 1)), bucket)!;
}

/** The bucket this many steps away, forwards or back. */
export function shiftBucket(key: string, bucket: Bucket, by: number): string {
  let at = key;
  if (by >= 0) for (let i = 0; i < by; i++) at = nextBucket(at, bucket);
  else for (let i = 0; i > by; i--) at = bucketOf(iso(Date.parse(`${bucketStart(at, bucket)}T00:00:00Z`) - DAY_MS), bucket)!;
  return at;
}

/**
 * Every bucket from the first key to the last, both included, at most `cap` of them.
 *
 * A MISSING BUCKET IS A GAP, NOT A ZERO (`08 §2.1`), so the walk fills the run between the first and
 * last bucket that hold rows, and a caller marks the ones nothing fell in. Past the cap it keeps the
 * latest, because the buckets walk the contiguous run from now backwards (`08 §2.4`).
 */
export function bucketRun(first: string, last: string, bucket: Bucket, cap = 50): { keys: string[]; more: number } {
  const keys: string[] = [];
  for (let at = first; at <= last; at = nextBucket(at, bucket)) keys.push(at);
  return keys.length > cap ? { keys: keys.slice(-cap), more: keys.length - cap } : { keys, more: 0 };
}

/** How many groups a grouped figure draws, `08 §2.1`'s cap. */
export const GROUP_CAP = 50;
