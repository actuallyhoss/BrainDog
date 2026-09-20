/**
 * One leased outbox row, run. `47 §5.1`.
 *
 * THIS FUNCTION DOES NOT THROW, and that is the seam the whole package is arranged around. Every
 * pure function above it refuses by throwing a `PullError`, because a pure function has nowhere to
 * put a second return; a host draining an outbox must never have to catch, because the one thing
 * worse than a connector that fails is a connector whose failure took the drain loop with it and
 * left four other records unrun. So the refusals are caught here, exactly once, and turned into an
 * outcome, a cursor rule and an ack.
 *
 * THE FIVE OUTCOMES ARE FIVE DIFFERENT REPAIRS AND ARE NOT INTERCHANGEABLE (`47 §5.1` step 7):
 *
 *   - `ok` — the window completed. The watermark moves and the points are written.
 *   - `partial` — a cap was reached with pages left. The window is kept and resumed in a minute.
 *   - `review` — the declaration is wrong. Retrying it is the same wrong request forty more times.
 *   - `failed` — the provider, or the lease, or the key. The ladder retries and tells nobody.
 *   - `paused` — the credential was rejected. The connector stops until a person reconnects it.
 *
 * Fold any two together and one of them is wrong in the expensive direction: a connector paused
 * through a provider's bad afternoon, a dead credential retried for a week, or — the quiet one — a
 * half-fetched day written as if it were a whole one.
 *
 * A SERIES THAT DID NOT FINISH WRITES NOTHING (`§5.1` step 9). A page boundary can split a bucket:
 * eleven of a day's transactions on page one and three on page two, reduced separately, is a `flow`
 * written twice and the second write overwriting the first with the smaller number. So the rows are
 * buffered for the whole run and reduced once, at the end, and a run that ends any way but `ok`
 * throws its buffer away and starts the window again from page one. Register rows are idempotent
 * upserts keyed by their dedupe fields, so they resume mid-window and lose nothing.
 *
 * A PAGE THE EXTRACTOR REFUSED IS NOT AN EMPTY PAGE (step 6.8). `43` answers zero rows and a
 * `reason` for a body it will not read, and read here as an empty page that refusal completed the
 * window and moved the watermark past rows nobody had seen. It goes to `review` with the body kept,
 * which is what the run already did for a review-grade `expect:` and for the same reason: an empty
 * page is a quiet Tuesday and a refused one is a person's afternoon.
 *
 * AND THE PLAINTEXT GRANT NEVER LEAVES THIS FRAME. It is opened at step 2, passed down as an
 * argument, and goes out of scope when the function returns. No `PullResult`, no `applyPull`
 * argument and no event note has a field it could travel in — which is a claim the tests check by
 * grepping the result for the secret rather than by reading this paragraph.
 */

import { readPath, type Json, type Read } from '@braindog/where';

import { applyAuth, grantFields, openSealed, seal, tokenStep } from './auth.ts';
import { firstPage, nextCursor } from './page.ts';
import { probe } from './probe.ts';
import { expect, resolveRequest } from './request.ts';
import { writeSeries } from './series.ts';
import { classify, classifyBody } from './status.ts';
import { nextDue, rfc3339, watermarkAfter, windowFor } from './when.ts';
import { parse, send, timeoutOf } from './wire.ts';
import {
  isSeries, PullError,
  type ConnectDeps, type Cursor, type ExtractedRow, type Failed, type Grain, type Grant,
  type OutboxRow, type PageState, type PullCode, type PullFinish, type PullOutcome,
  type PullResult, type Sealed, type Scalar, type Window,
} from './index.ts';

/** The room a run leaves itself inside the lease: one whole timeout, and ten seconds to finish up. */
const EDGE_SLACK_MS = 10_000;

/** A lease this build set is five minutes (`30 §8`); the fallback matters only for an unreadable one. */
const LEASE_MS = 300_000;

/** `47 §4.1`'s two caps, applied here because `limits` is optional and a missing cap is not no cap. */
const MAX_PAGES = 40;
const ROWS_PER_RUN = 5_000;

/** A `partial` run resumes in a minute rather than at its next slot, which could be a day away. */
const RESUME_MS = 60_000;

const EMPTY_GRANT: Grant = { id: '', version: 0, fields: {} };

/**
 * `TextEncoder`, DECLARED TO RETURN `Bytes`.
 *
 * Node's lib types `encode` as `Uint8Array<ArrayBuffer>` and `@cloudflare/workers-types` types it
 * as `Uint8Array<ArrayBufferLike>`, so this package typechecked under one runtime and not the
 * other for as long as only one of them imported it. The assertion is safe where widening `Bytes`
 * would not be: a `TextEncoder` allocates its own buffer and can never hand back a view onto a
 * `SharedArrayBuffer`, which is the one case `crypto.subtle` refuses.
 */
const utf8 = new TextEncoder() as { encode(input?: string): Uint8Array<ArrayBuffer> };

const hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Whether a read list came back whole, which is the only kind a run may treat as rows. */
const whole = (list: readonly (Json | undefined)[]): list is readonly Json[] => list.every((r) => r !== undefined);

const headersOf = (res: Response): Record<string, string> => {
  const out: Record<string, string> = {};
  res.headers.forEach((value, name) => { out[name] = value; });
  return out;
};

/**
 * The outcome, the ack and the cursor rule for one code. `47 §5.1` step 7's table, as a table.
 *
 * `keep` IS WHETHER THE PAGES THAT PASSED ARE KEPT. Only the two codes that mean *try again shortly*
 * get it: a provider having a bad minute, and a lease that ran out. Every other code means either
 * that the declaration is wrong or that the credential is, and resuming at page nine of a window
 * whose page nine will refuse again is forty pages of nothing at two-minute intervals.
 *
 * `PULL_EXPECT_FAILED` IS THE ONE CODE WITH TWO ROWS, because `on_fail` is the declaration's own
 * choice between *this needs a person* and *this counts against the provider*. The severity travels
 * beside the code rather than on it: a refusal carries where and what, and how loudly to take it is
 * the declaration's business and not the refusal's.
 */
const RULES: Readonly<Record<PullCode, { outcome: PullOutcome; ack: 'done' | 'failed'; keep: boolean }>> = {
  PULL_AUTH_REJECTED: { outcome: 'paused', ack: 'done', keep: false },
  PULL_PROVIDER_UNAVAILABLE: { outcome: 'failed', ack: 'failed', keep: true },
  PULL_LEASE_EDGE: { outcome: 'failed', ack: 'failed', keep: true },
  PULL_REQUEST_REFUSED: { outcome: 'review', ack: 'done', keep: false },
  PULL_ORIGIN_REFUSED: { outcome: 'review', ack: 'done', keep: false },
  PULL_SHAPE_MISMATCH: { outcome: 'review', ack: 'done', keep: false },
  PULL_EXPECT_FAILED: { outcome: 'review', ack: 'done', keep: false },
  WRONG_KEY: { outcome: 'failed', ack: 'failed', keep: false },
};

export async function runPull(job: OutboxRow<'pull.fetch'>, deps: ConnectDeps): Promise<PullResult> {
  const { clock, record } = deps;
  const payload = job.payload;
  const decl = payload.decl;
  const fetch = decl.fetch;
  const tz = payload.record.tz;
  const t0 = clock.now();
  const series = isSeries(decl);

  /* ── 1 · unpack ── */
  const leaseEnds = Date.parse(job.leased_until);
  const edge = (Number.isNaN(leaseEnds) ? t0 + LEASE_MS : leaseEnds) - (timeoutOf(fetch) + EDGE_SLACK_MS);
  const slotAt = Date.parse(payload.slot);
  const slotMs = Number.isNaN(slotAt) ? t0 : slotAt;
  const maxPages = fetch.limits?.max_pages ?? MAX_PAGES;
  const rowsPerRun = fetch.limits?.rows_per_run ?? ROWS_PER_RUN;
  const grain: Grain = fetch.window?.grain ?? 'day';

  let pages = 0;
  let rows = 0;
  let bytes = 0;
  let needsReview = 0;
  let window: Window | null = null;
  let page: PageState | null = null;
  let severity: 'review' | 'fail' = 'review';
  let rotated: Sealed | undefined;
  const warnings: Failed[] = [];
  const buffer: ExtractedRow[] = [];

  /**
   * Everything a run does after its last page, whichever way it ended.
   *
   * ONE EXIT AND ONE ACK. Five outcomes reached from nine places, each acking for itself, is nine
   * chances to leave a leased row un-acked — and a leased row nobody acks is a connector that goes
   * quiet for five minutes and then runs its whole window again.
   */
  const finish = async (
    outcome: PullOutcome,
    ack: 'done' | 'failed',
    cursor: Cursor,
    error?: PullResult['error'],
  ): Promise<PullResult> => {
    const now = clock.now();
    /* A BUCKET REFUSED FOR ITS CURRENCY IS A WARNING AND NOT A FAILURE. The run did what it was
       asked and read what was there; what it will not do is add two currencies and label the
       total with one of them. The warning names the day and the code it found, because the fix
       is either the declaration's unit or the provider's filter and only he can say which. */
    const wrote = outcome === 'ok' ? writeSeries(decl, buffer, tz) : { points: [], mixed: [] };
    const points = wrote.points;
    warnings.push(...wrote.mixed);

    let slot = payload.slot;
    let dueAt: string | null = null;
    if (outcome === 'ok' || outcome === 'review') {
      const next = await nextDue(fetch, slotMs, now, payload.record.id, payload.ingest, tz);
      slot = rfc3339(next.slot);
      dueAt = rfc3339(next.dueAt);
    } else if (outcome === 'partial') {
      dueAt = rfc3339(now + RESUME_MS);
    }
    /* `paused` AND `failed` BOTH ANSWER `null` AND MEAN DIFFERENT THINGS BY IT. A paused row has no
       next attempt at all until a person reconnects it; a failed one has one the record computes,
       because the ladder is the record's state and `max(ladder, notBefore)` needs both halves. */

    const carried: PullFinish = {
      outcome,
      points,
      cursor,
      due_at: dueAt,
      slot,
      warnings,
      needs_review: needsReview,
      ...(error === undefined ? {} : { error }),
      ...(rotated === undefined ? {} : { rotated_grant: rotated }),
    };
    await record.ackOutbox(job.id, ack, carried, error?.code);

    return {
      ingest: payload.ingest,
      outbox: job.id,
      outcome,
      pages,
      rows,
      points: points.length,
      bytes,
      ms: now - t0,
      window: window === null ? null : { since: rfc3339(window.since), until: rfc3339(window.until) },
      cursor,
      warnings,
      ...(error === undefined ? {} : { error }),
    };
  };

  /**
   * The cursor a run that did not complete its window leaves behind (`§5.1` steps 8 and 9).
   *
   * A SERIES RESTARTS THE WINDOW AND A REGISTER RESUMES IT. The buffer that would have made the
   * series' buckets whole went out of scope with the frame that held it, so resuming at page nine
   * would write the last two pages of a day as though they were the day.
   */
  const heldCursor = (at: PageState | null): Cursor =>
    window === null
      ? payload.cursor
      : {
          watermark: payload.cursor.watermark,
          window: {
            since: rfc3339(window.since),
            until: rfc3339(window.until),
            page: series ? null : at,
            n: series ? 0 : pages,
            rows: series ? 0 : rows,
          },
        };

  /**
   * `read.rows` off the body, or the body itself. Not a list is the declaration being wrong.
   *
   * A HOLE IN THE LIST IS A MISMATCH AND NOT AN EMPTY ROW. `readPath` fans out over `[]`, and a fan
   * that reached a key some elements have not got answers a list with `undefined` in it. Passing
   * those on as rows would hand the extractor a gap it would read as a row with nothing in it — a
   * receipt for a row the provider never sent.
   */
  /* `42 §4.7`'s default: a declaration naming no format is answered in JSON, and only JSON has a
     document the conditions, the `expect:`s and the two body-reading paginators can read. */
  const document = (fetch.read?.format ?? 'json') === 'json';

  const listOf = (json: Json, at: string): readonly Json[] => {
    const path = fetch.read?.rows;
    const found: Read = path === undefined ? json : readPath(json, path);
    if (!Array.isArray(found) || !whole(found))
      throw new PullError('PULL_SHAPE_MISMATCH', path === undefined ? `${at}.read` : 'fetch.read.rows', {
        found,
        wanted: 'a list of rows',
      });
    return found;
  };

  try {
    /* ── 2 · open the grant ── */
    let grant = EMPTY_GRANT;
    if (fetch.auth.kind !== 'none') {
      if (payload.grant === null || payload.dek === null)
        throw new PullError('PULL_AUTH_REJECTED', 'grant', { wanted: 'a sealed credential on the job' });
      const plain = await openSealed(payload.grant, payload.dek, payload.record.id, deps.keys);
      grant = { id: payload.grant.grant_id, version: payload.grant.version, fields: grantFields(plain) };
    }

    /* ── 3 · the window ── */
    window = windowFor(fetch, payload.cursor, slotMs, t0, tz);
    /* NOTHING TO FETCH IS `ok` AND NOT A FAILURE. A daily connector caught up at 00:05 has no
       complete bucket it has not already read, and the run that says so asks for nothing. */
    if (window === null) return await finish('ok', 'done', { watermark: payload.cursor.watermark });
    const win: Window = window;

    /* ── 4 · the token step, once for the run and not once per page ── */
    const step = await tokenStep(fetch, grant, deps);
    const token = step.token;
    if (step.rotatedRefreshToken !== null && payload.grant !== null && payload.dek !== null) {
      /* THE ROTATED TOKEN IS RESEALED AT VERSION + 1 AND RIDES THE ACK. A provider that rotates on
         every refresh has just handed us the only credential that still works; losing it between
         here and the transaction is the connector dead until somebody reconnects it by hand. */
      const next = { ...grant.fields, refresh_token: step.rotatedRefreshToken };
      rotated = await seal(
        utf8.encode(JSON.stringify(next)),
        payload.grant.grant_id,
        payload.grant.version + 1,
        payload.dek,
        payload.record.id,
        deps.keys,
      );
    }

    /* ── 5 · the probe, once ── */
    const probed: Record<string, Scalar> = await probe(fetch, grant, token, deps);

    /* ── 6 · the page loop ── */
    const held = payload.cursor.window;
    page = held?.page ?? firstPage(fetch);
    pages = held?.n ?? 0;
    rows = held?.rows ?? 0;

    let capped = false;
    for (;;) {
      if (pages >= maxPages || rows >= rowsPerRun) { capped = true; break; }
      /* THE EDGE IS CHECKED BEFORE A PAGE AND NEVER DURING ONE. A run that began a request it could
         not finish inside its lease has a second host picking the same row up underneath it. */
      if (clock.now() >= edge) throw new PullError('PULL_LEASE_EDGE', 'lease', { found: rfc3339(edge) });

      const n = pages + 1;
      const at = `fetch.page[${n}]`;

      /* 6.1, 6.2 — the request, then the credential onto it and nowhere else. */
      const plain = resolveRequest(fetch, page, grant, probed, win, tz);
      const req = await applyAuth(fetch, grant, plain, token, clock.now());

      /* 6.3, 6.4 — the answer, and what its status means before anything is read from it. */
      const res = await send(req, fetch, deps, at);
      classify(fetch, res, clock.now(), at);

      /* 6.5 — the bytes. */
      const text = await res.text();
      bytes += text.length;
      /* A PAGE IN ONE OF `42 §4.7`'s FOUR OTHER FORMATS HAS NO DOCUMENT, and `null` here is that
         absence rather than a body that said `null`. Everything below that would read one —
         `expect:`, the `on_error` body paths, `cursor_param` and `keyset` — is refused at install
         alongside a non-JSON `format`, so `null` never reaches a reader that would mistake it for
         an answer. The rows come out of the extractor, which is the half that knows the format. */
      const json = document ? parse(text, `${at}.read`) : null;
      const sha256 = await hex(text);
      const answered = headersOf(res);

      /* 6.6 — the body-path conditions, then every `expect:` in order. */
      classifyBody(fetch, json, res.status, win, tz, at);
      const checked = expect(fetch, json, win, tz);
      warnings.push(...checked.warnings);
      if (!checked.ok) {
        severity = checked.severity;
        /* THE PAGE THAT FAILED IS KEPT WHEN A PERSON HAS TO LOOK AT IT, and not when the ladder is
           going to ask for it again in two minutes (`§5.1` step 7's table). A review is somebody's
           desk and needs the evidence; a retry is a body we are about to fetch a second time.
           THE CURSOR DOES NOT MOVE FOR A FAILED PAGE — the load-bearing half of `25 §5.1`. */
        if (checked.severity === 'review')
          await record.applyPull({
            outbox: job.id,
            n,
            raw: { sha256, headers: answered, bytes: text.length, body: text, state: 'review', reason: checked.failed.at },
            rows: [],
            cursor: payload.cursor,
          });
        throw new PullError('PULL_EXPECT_FAILED', checked.failed.at, {
          found: checked.failed.found,
          wanted: checked.failed.wanted,
        });
      }

      /* 6.7 — the list. A non-JSON page's is its extraction's, read below: there is no second
         reader here, because two readers of one page is how a receipt comes to name rows that were
         never written. */
      const list = document ? listOf(json, at) : null;

      /* 6.8 — one extraction per arrival, `n` rows for a pull (`43 §4.1`, `47 §13` D4).
         `maxRows` IS THE WHOLE RUN'S CAP AND NOT WHAT IS LEFT OF IT. `rows_per_run` is checked at
         the top of this loop, which makes it a stop-AFTER cap: a page that takes the total past it
         is accepted whole and the next page is the one that does not happen. Handing the extractor
         the remainder contradicted that, and did it silently, because `43` keeps an over-cap page
         RAW rather than truncating it (`07 §2`): with `rows_per_run: 3`, a second page of three
         rows came back as `rows over cap (3; the cap is 1)`, zero rows, and the run went on to end
         `ok` having written two of the five rows the provider sent. */
      const extraction = deps.extract(
        decl,
        { id: `${job.id}:${n}`, ts: rfc3339(clock.now()), channel: 'pull', headers: answered, body: text },
        { currencies: deps.currencies, lookup: deps.lookup, now: clock.now(), tz, maxRows: rowsPerRun },
      );

      /* AN EXTRACTION THAT READ NOTHING AND SAID WHY IS A REFUSED PAGE AND NOT AN EMPTY ONE, and
         the difference is a day of somebody's revenue. Both extractors a host injects answer zero
         rows and a `reason` for a body they will not read: over the two-megabyte ceiling,
         unparseable in the declared format, no list where the declaration says one is, no `map:`
         to read it with, and more rows than the cap. Read here as an empty page, as it was, a
         refused page took the 6.9 path below: written `matched` with a `null` body, so the rows
         are gone AND there is nothing left to read them out of, the window completed, and the
         watermark moved past a day that was only partly read. A `skipped` extraction is not this:
         declining an arrival is the declaration's own intent and writes nothing on purpose.
         THE PAGE IS KEPT FOR A PERSON, like a review-grade `expect`, and for the same reason. */
      if (extraction.rows.length === 0 && extraction.reason !== undefined) {
        await record.applyPull({
          outbox: job.id,
          n,
          raw: { sha256, headers: answered, bytes: text.length, body: text, state: 'review', reason: extraction.reason },
          rows: [],
          cursor: payload.cursor,
        });
        throw new PullError('PULL_SHAPE_MISMATCH', `${at}.read`, {
          found: extraction.reason,
          wanted: 'a page the extractor could read',
        });
      }

      /* A ROW THE EXTRACTOR COULD NOT READ IS COUNTED AND NEVER WRITTEN. */
      needsReview += extraction.rows.filter((r) => r.confidence === 'needs-review').length;

      /* 6.10 BEFORE 6.9, because the cursor a page is written with is the one it moves TO: written
         with the cursor it was fetched at, a page that landed is a page the next run fetches again. */
      /* A NON-JSON PAGE PAGINATES ON WHAT WAS READ OUT OF IT. `offset` and `page_number` stop on a
         short page or an empty one, which is a count, and the extraction has the same count as the
         body it came from. The three that read a document or a raw row — `cursor_param`, `keyset`
         and any `more:` — are refused at install beside a non-JSON `format`, so the fields below
         stand in for rows nothing reads rather than for rows read wrong. */
      const paged = list ?? extraction.rows.map((r) => r.fields);
      const next = nextCursor(fetch, json, paged, { headers: res.headers, url: req.url }, page, win, tz);

      pages = n;
      rows += extraction.rows.length;
      page = next;

      /* 6.9 — the page, written. A series writes the raw page and buffers its rows. */
      await record.applyPull({
        outbox: job.id,
        n,
        raw: { sha256, headers: answered, bytes: text.length, body: null, state: 'matched' },
        rows: series ? [] : extraction.rows,
        cursor: heldCursor(next),
      });
      if (series) buffer.push(...extraction.rows);

      if (next === null) break;
    }

    /* ── 8 · a cap reached with pages left is `partial`, and the window is kept ── */
    if (capped) return await finish('partial', 'done', heldCursor(page));

    /* ── 9, 10 · the window completed: the points are reduced once and the watermark moves ── */
    return await finish('ok', 'done', { watermark: watermarkAfter(win.until, grain, clock.now(), tz) });
  } catch (e) {
    /* AN EXCEPTION THIS PACKAGE DID NOT RAISE IS THIS REPOSITORY'S BUG and is not a provider's
       behaviour. Folding it into an outcome would retry a `TypeError` on the ladder for a week. */
    if (!(e instanceof PullError)) throw e;

    const rule = RULES[e.code];
    const worst = e.code === 'PULL_EXPECT_FAILED' && severity === 'fail';
    return await finish(
      worst ? 'failed' : rule.outcome,
      worst ? 'failed' : rule.ack,
      rule.keep ? heldCursor(page) : payload.cursor,
      {
        code: e.code,
        at: e.at,
        fix: e.fix,
        ...('found' in e ? { found: e.found } : {}),
        ...(e.wanted === undefined ? {} : { wanted: e.wanted }),
        ...(e.notBefore === undefined ? {} : { notBefore: e.notBefore }),
      },
    );
  }
}
