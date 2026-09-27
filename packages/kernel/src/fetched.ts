/**
 * A page of a connector run, written. `47 §5.1` step 6.9, `43 §4.4`.
 *
 * ONE ARRIVAL, MANY ROWS — which is the whole difference from `ingest.ts`'s `arrive`. An email is
 * one payload about one thing; a page of Stripe charges is one payload about five hundred. The
 * bytes are stored once, the rows are written one at a time against the same dedupe key, and one
 * receipt names every id the page wrote. Two receipts per page, or one raw per row, and *what did
 * that run actually do* stops having an answer.
 *
 * THE REGISTER IS READ OFF THE RECORD'S OWN DECLARATION AND NEVER OFF THE CALLER. The runner hands
 * over an outbox id and rows; this file reads the ingest out of that row's payload and the register
 * out of the installed declaration. A connector that could name the register it was writing to
 * would be a connector that could write anywhere, and the runner is the part of this system that
 * talks to a stranger's API.
 *
 * A PAGE THAT ARRIVED BEFORE WRITES NOTHING AND IS NOT AN ERROR. `inbox_raw` is unique on
 * `(channel, sha256)`, so a lease that expired mid-run and a second host that re-fetched page three
 * write one raw row between them — and the rows are skipped rather than written twice, because a
 * retry is the ordinary case and not the exceptional one.
 *
 * AND A `needs-review` ROW IS COUNTED, NEVER WRITTEN (`47 §5.1` step 6.8). A row the extractor
 * could not read a date or an amount out of is a number nobody agreed to; it goes in the receipt's
 * confidence and stays out of the register.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { existingRow, routeTo, type Confidence, type IngestDeps } from './ingest.ts';
import { instant } from './migrate.ts';
import { keepCursor } from './pull.ts';
import { attempt } from './tx.ts';

/** One extracted row, as `43 §4.1` hands it over. */
export type PulledRow = {
  fields: Record<string, unknown>;
  confidence: Confidence;
  outcome: Record<string, string>;
};

/** One page, as `47 §4.4`'s `PullPage` puts it on the wire. */
export type PulledPage = {
  outbox: string;
  /** Which page of this run, from one. Only ever read back in a note. */
  n: number;
  raw: {
    sha256: string;
    headers: Record<string, string>;
    bytes: number;
    /** Kept only for a page somebody has to look at. A page that passed is its hash and its size. */
    body: string | null;
    state: 'matched' | 'review';
    reason?: string;
  };
  rows: PulledRow[];
  /** Stored on the schedule row verbatim, so a resumed run reads back exactly what it left. */
  cursor: unknown;
};

export type PageDeps = IngestDeps;

/** One bucketed reading, as `47 §4.4` hands it over. The series' KIND is the declaration's, never a column. */
export type MetricPoint = { series: string; grain: string; at: string; value: number; unit: string; n: number | null };

/** What a page did: rows written, and rows a register already had or would not take. */
export type PageWrote = { wrote: number; kept: number };

const LOWEST: Readonly<Record<Confidence, number>> = { 'needs-review': 0, proposed: 1, exact: 2 };

/**
 * The page's confidence, which is its WORST row's and not its average.
 *
 * `43` MAKES A DECLARATION'S `writes.confidence` A CEILING AND NEVER A VALUE, so a page of four
 * hundred exact rows and one the extractor guessed at is a page with a guess in it. Reporting the
 * majority would put the guess behind a number that says everything was read cleanly.
 */
const worstOf = (rows: readonly PulledRow[], ceiling: Confidence): Confidence => {
  let held = LOWEST[ceiling];
  for (const row of rows) held = Math.min(held, LOWEST[row.confidence]);
  return (['needs-review', 'proposed', 'exact'] as const)[held] ?? 'needs-review';
};

/**
 * One page into the record. `47 §5.1` step 6.9.
 *
 * IN ONE TRANSACTION WITH ITS RAW, because the raw is what makes a written row explicable. A page
 * whose rows landed and whose bytes did not is five hundred entries nobody can trace to anything,
 * and a page whose bytes landed and whose rows did not is a connector that looks like it ran.
 */
export function applyPage(deps: PageDeps, page: PulledPage, transaction: <T>(fn: () => T) => T): Result<PageWrote> {
  return attempt(deps.sql, transaction, () => {
    const at = instant(deps.nowMs);

    /* ── whose page this is ── */
    const job = deps.sql.one<{ payload: string; state: string }>(
      'SELECT payload, state FROM outbox WHERE id = ? AND kind = ?',
      page.outbox,
      'pull.fetch',
    );
    if (!job) return no<PageWrote>('OUT_OF_BOUNDS', 'There is no connector run with that id.', { at: 'outbox' });
    /* A PAGE FOR A ROW NOBODY HOLDS IS REFUSED. A lease that expired has a second host running the
       same window; letting the first one keep writing is the double count the lease exists to stop. */
    if (job.state !== 'leased')
      return no<PageWrote>('OUT_OF_BOUNDS', 'That connector run is no longer held, so its pages are not written.', { at: 'outbox' });

    let payload: { ingest?: unknown };
    try {
      payload = JSON.parse(job.payload) as { ingest?: unknown };
    } catch {
      return no<PageWrote>('VALUE_MALFORMED', 'That connector run has a payload this record cannot read.', { at: 'outbox' });
    }
    const ingest = typeof payload.ingest === 'string' ? payload.ingest : null;
    if (ingest === null)
      return no<PageWrote>('VALUE_MALFORMED', 'That connector run names no connector.', { at: 'outbox' });

    const decl = deps.ingests().find((one) => one.ingest === ingest);
    if (!decl) return no<PageWrote>('DECLARATION_UNKNOWN', `There is no connector called ${ingest}.`, { at: 'ingest' });

    /* A FANNED CONNECTOR USED TO BE REFUSED HERE, and the refusal said why: *nothing implements the
       routing; `arrive` reads `writes.register` as a string and so does this file*. `arrive` does
       not any more, so neither does this. `43 §5.1` step 6 routes a ROW, and a page is five hundred
       of them — the same table, read per row, which is what a table keyed on a row's own values
       means when the answer arrives five hundred at a time. */

    /* ── the bytes, first and always ── */
    const raw = deps.mint();
    deps.sql.exec(
      `INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state, reason)
       VALUES (?, ?, 'pull', ?, ?, ?, ?, ?) ON CONFLICT (channel, sha256) DO NOTHING`,
      raw,
      at,
      JSON.stringify(page.raw.headers),
      page.raw.body,
      page.raw.sha256,
      page.raw.state,
      page.raw.reason ?? null,
    );
    const held = deps.sql.one<{ id: string }>("SELECT id FROM inbox_raw WHERE channel = 'pull' AND sha256 = ?", page.raw.sha256);
    /* THESE BYTES ARRIVED BEFORE, so whatever was done with them the first time stands. */
    if (!held || held.id !== raw) {
      keepCursor(deps.sql, ingest, page.cursor);
      return ok<PageWrote>({ wrote: 0, kept: page.rows.length });
    }

    /* ── the rows ── */
    const key = decl.dedupe;
    const conflict = decl.on_conflict ?? 'skip';
    const wrote: string[] = [];
    let kept = 0;

    for (const row of page.rows) {
      if (row.confidence === 'needs-review') { kept += 1; continue; }

      /* A ROUTE MISS KEEPS THE ROW RATHER THAN GUESSING IT INTO THE FIRST TARGET, which is the same
         answer `arrive` gives one row at a time: `07 §2` says a miss lands in `review` rather than
         being guessed, and on a page `kept` is what says so. The count is the report. */
      const routed = routeTo(decl.writes.register, row.fields);
      if ('miss' in routed) { kept += 1; continue; }
      const register = routed.to;

      const existing = existingRow(deps, register, key, row.fields);
      if (existing && conflict === 'skip') { kept += 1; continue; }

      const written = deps.write(
        register,
        existing && conflict === 'update' ? existing.id : null,
        row.fields,
        `ingest:${ingest}`,
      );
      /* A REGISTER'S REFUSAL DOWNGRADES THE ROW AND NOT THE PAGE. Returning it would roll back the
         four hundred rows that were fine along with the bytes that explain them, and the run would
         fetch the same page again next time and refuse it again. The count is what says so. */
      if (!written.ok) { kept += 1; continue; }
      wrote.push(written.value.id);
    }

    /* ── one receipt, naming every id the page wrote ── */
    deps.sql.exec(
      'INSERT INTO ingest_receipt (id, raw_id, ingest_id, wrote, confidence, ts) VALUES (?, ?, ?, ?, ?, ?)',
      deps.mint(),
      raw,
      ingest,
      JSON.stringify(wrote),
      worstOf(page.rows, decl.writes.confidence ?? 'exact'),
      at,
    );

    /* THE CURSOR MOVES WITH EVERY PAGE, through `keepCursor` in `pull.ts`, the file whose `finishPull`
       writes the one a run ends on, so the page and the finish keep one shape on one row. */
    keepCursor(deps.sql, ingest, page.cursor);
    return ok<PageWrote>({ wrote: wrote.length, kept });
  });
}

/**
 * A run's points, upserted. `47 §5.1` step 10, `08 §3`.
 *
 * ONE STATEMENT AND NOT A READ-THEN-WRITE. `metric_point`'s key is the series, the grain and the
 * instant, so a corrected day REPLACES the day it corrects; a run that read the same window twice
 * writes the same row twice and the record holds one. Deciding in TypeScript whether to insert or
 * update would be the same answer with a window between the two halves of it.
 *
 * THE KIND IS NOT HERE AND MUST NOT BE (`25 §8`). Whether two readings of a bucket add or replace
 * is the DECLARATION's fact, applied before a point ever reaches this table; a column here would be
 * the same fact written twice, and the copy that drifts is the one nobody reads.
 */
export function writePoints(sql: Sql, source: string, nowMs: number, points: readonly MetricPoint[]): number {
  const wrote = instant(nowMs);
  for (const p of points)
    sql.exec(
      `INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (series, grain, at) DO UPDATE SET value = excluded.value, unit = excluded.unit,
         n = excluded.n, source = excluded.source, wrote_at = excluded.wrote_at`,
      p.series,
      p.grain,
      p.at,
      p.value,
      p.unit,
      p.n,
      source,
      wrote,
    );
  return points.length;
}
