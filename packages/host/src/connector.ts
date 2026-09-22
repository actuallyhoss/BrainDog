/**
 * The connector runner both hosts wire: one leased `pull.fetch` row, handed to `@braindog/connect`.
 *
 * WHY THIS IS HERE AND NOT IN EITHER APP. The mapping between a leased row and a `runPull` call is
 * the same on the Worker as on the self-host; what differs is the socket, the key store and the
 * clock, and those are arguments. A copy in each app would be two answers to one question, and the
 * one that ran less often would be the one that drifted. `31 §2`: `host` is rank 16 and `connect`
 * is 15, so the edge points down the order, and both packages are platform-neutral — nothing here
 * or below it names `node:` or `cloudflare:`.
 *
 * WHAT THE KERNEL HANDS ACROSS IS A `Paged` AND NOT A REQUEST. `actions.ts` can send one request; a
 * connector pages, and paging is `@braindog/connect`'s. The kernel has already leased the row,
 * resolved the declaration, computed the window and opened the credential under that lease, so what
 * is left here is a seam and nothing else: one shape turned into the other, plus the three things
 * only a host holds — a socket that checks the address it connects to, the root key, and a clock.
 *
 * `runPull` ACKS THE ROW AND THE KERNEL MUST NOT. The ack carries the cursor, the due time and the
 * points a second ack could not reconstruct, so `runActions` deliberately leaves a `Paged` job alone
 * once the runner returns. A runner that forgot to ack would leave the row leased until it lapsed,
 * and the next pass would fetch the same window again.
 *
 * WHAT COMES BACK IS A REPORT AND NOT A METER READING. The host says what it spent; the record
 * decides what that costs, because the rule that a failed run is free belongs beside the other two
 * channels rather than in every host that ever wires this.
 *
 * NO KEY STORE IS A REFUSAL AND NOT AN ABSENCE. A host without one cannot unwrap the connector key,
 * but a declaration saying `auth: { kind: 'none' }` never asks for one and should still run. So a
 * store is always supplied and a missing one answers `null`, which `openSealed` already turns into
 * `WRONG_KEY`: a sentence with a repair in it rather than a crash in a queue consumer.
 *
 * `currencies` AND `lookup` ARE EMPTY HERE ON PURPOSE. `@braindog/connect` reads neither; it passes
 * both into the extractor's context, and the extractor on this host is the record's own, which
 * holds the currency exponents and the register schemas already. Filling them in would be a second
 * copy of facts the record owns, and the two would drift.
 */

import {
  runPull,
  type ConnectDeps,
  type IngestDecl,
  type OutboxRow as PullRow,
  type PullPayload,
  type PullResult,
} from '@braindog/connect';
import { readRows, UNPARSEABLE, type Format, type Read } from '@braindog/extract';
import type { Paged, PagedReport, PagedRun } from '@braindog/kernel';
import { fixOf, type Clock, type Http, type KeyStore } from '@braindog/ports';
import type { RecordApi } from '@braindog/record';

/** A host that holds no root key still runs the connectors that need none. */
const NO_KEYS: KeyStore = {
  current: () => Promise.reject(new Error('this host holds no root key')),
  byId: () => Promise.resolve(null),
};

/**
 * The kernel's leased row, in the shape `@braindog/connect` reads.
 *
 * THE CAST IS THE LAYERING AND NOT A SHORTCUT. The kernel sits below `@braindog/connect` (`31 §2`)
 * and may never import it, so it types the handoff structurally, field for field the same as
 * `PullPayload`. `apps/selfhost/test/connector.test.ts` is where the two are proved to still agree.
 */
const jobOf = (paged: Paged): PullRow<'pull.fetch'> => ({
  id: paged.job.id,
  kind: 'pull.fetch',
  leased_until: paged.job.leasedUntil,
  attempts: paged.job.attempts,
  payload: { ...paged.paged, decl: paged.paged.decl as unknown as IngestDecl } as PullPayload,
});

/**
 * What the run spent, in the units a pass is counted in.
 *
 * `partial` AND `review` ARE NOT FAILURES. One means some pages came back wrong and the rest were
 * written; the other means rows were written and want a person's eye. Both moved the record, so
 * both are `changed`, and the pages that did go wrong are in `failures` where they can be seen.
 */
const reportOf = (out: PullResult): PagedReport => ({
  outcome: out.outcome === 'partial' || out.outcome === 'review' ? 'changed' : out.outcome,
  requests: out.pages,
  bytes: out.bytes,
  ms: out.ms,
  failures: out.warnings.length + (out.error ? 1 : 0),
  say:
    out.error === undefined
      ? `${out.ingest} read ${out.pages} page${out.pages === 1 ? '' : 's'} and wrote ${out.rows} row${out.rows === 1 ? '' : 's'}.`
      : `${out.ingest} stopped at ${out.error.at}: ${out.error.fix}`,
});

/**
 * `42 §4.7`'s four non-JSON page formats, read.
 *
 * THE HOST IS WHERE THE TWO ENDS CAN MEET. The reader is `@braindog/extract`'s, rank 9; the
 * extractor is the record's, rank 7; neither may import the other and this package is rank 16 and
 * may import both (`31 §2`). So the reader is handed down beside the row budget, and a host that
 * did not hand one down would answer the page with a sentence rather than with no rows.
 *
 * `UNPARSEABLE` BECOMES `null` AND NOT A THROW, because a page already paid for should reach a
 * person as *this is not the CSV it said it was* rather than as a stack in a queue consumer.
 */
const pageRows = (body: string, read: { format?: string }): unknown[] | null => {
  const out = readRows(body, (read.format ?? 'json') as Format, read as Read);
  return out === UNPARSEABLE ? null : out;
};

/** The connector runner this host hands `runActions`. */
export function pagedRunner(
  api: Pick<RecordApi, 'kernel'>,
  options: { http: Http; clock: Clock; keys?: KeyStore | undefined },
): PagedRun {
  const deps = (leasedUntil: string, ingest: string): ConnectDeps => ({
    http: options.http,
    clock: options.clock,
    keys: options.keys ?? NO_KEYS,
    extract: (decl, raw, ctx) => api.kernel.extract(decl as never, raw, { ...ctx, rows: pageRows } as never) as never,
    currencies: {},
    lookup: () => [],
    record: {
      applyPull: (page) => {
        const wrote = api.kernel.applyPage(page as never);
        /* A REFUSED PAGE IS A REFUSED RUN AND NOT A SILENT ONE. `runPull` catches this and turns it
           into a `PullResult` with an error on it, which is how it comes back metered.

           `fixOf` AND NOT `wrote.refusal`, because a page can also come back CONFLICTED: a person
           edited the same row while the connector was fetching it. Reading `.refusal` off that is
           how a type assertion becomes `undefined.fix` in a queue consumer. */
        if (!wrote.ok) throw new Error(fixOf(wrote));
        return Promise.resolve(wrote.value);
      },
      ackOutbox: (id, state, result) => {
        /* THE POINTS ARE WRITTEN BEFORE THE ACK. An ack that landed first would finish the row and
           leave the readings it was carrying nowhere, with nothing left to retry them from. */
        if (result && result.points.length > 0) api.kernel.writePoints(ingest, result.points as never);
        api.kernel.ackOutbox({ id, state, leasedUntil, result });
        return Promise.resolve();
      },
    },
  });
  return async (paged) => reportOf(await runPull(jobOf(paged), deps(paged.job.leasedUntil, paged.paged.ingest)));
}
