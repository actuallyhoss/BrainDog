/**
 * One CSV extract at the row cap, and nothing else in the process, so the heap it reports is its own.
 * Spawned by `bench.test.ts` with `--expose-gc`; `43 §7`'s last row.
 */
import { parseDate } from '../src/date.ts';
import { extract, type Declaration, type ExtractCtx } from '../src/pipeline.ts';

const head = 'c0,c1,c2,c3,c4,c5,c6,c7\n';
const line =
  'BEANS COFFEE CAIRO BRANCH,42,125000,EGP,29/08/26,some text value here with more padding to reach a megabyte at the cap,12.50,extra padding column also widened\n';
const body = head + line.repeat(5_000);
/* COLLECT BEFORE THE BASELINE TOO. Without this the baseline includes garbage from module loading and
   from building the body, the collection after the run clears it, and the delta comes out NEGATIVE, which
   is what this read before the cells became slices of the body instead of copies of it. */
const gc = (globalThis as { gc?: () => void }).gc;
gc?.();
const before = process.memoryUsage().heapUsed;

const ctx: ExtractCtx = {
  currencies: { EGP: { exponent: 2 } },
  lookup: () => [],
  exponent: () => 2,
  day: (text, format) => parseDate(text, format) ?? null,
  now: Date.UTC(2026, 8, 19, 12),
  tz: 'UTC',
};
const decl: Declaration = {
  id: 'heap',
  writes: { register: 'txn' },
  fetch: { read: { format: 'csv' } },
  map: {
    a: { path: 'c0', type: 'text' },
    b: { path: 'c1', type: 'int' },
    c: { path: ['c2', 'c3'], type: 'money', minor: true },
    d: { path: 'c4', type: 'day', format: 'DD/MM/YY' },
    e: { path: 'c5', type: 'text' },
    f: { path: 'c6', type: 'decimal' },
  },
};

const got = extract(decl, { id: 'r', ts: '2026-09-19T12:00:00Z', channel: 'email', body }, ctx);
gc?.();
/* The rows stay reachable across the measurement on purpose: this is what the caller is handed. */
const held = process.memoryUsage().heapUsed - before;
process.stdout.write(JSON.stringify({ rows: got.rows.length, bodyBytes: body.length, held }));
