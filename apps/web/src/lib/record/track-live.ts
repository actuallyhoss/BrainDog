/**
 * One thread on `/t/<track>`, read from the record, with the sample when there is none.
 *
 * A ROUTE-ONLY MODULE, like `row-live.ts`: the client carries the route table as a value.
 *
 * THE SCREEN NEVER ASKED. Every block on it came from the built-in sample whatever record was open,
 * so a person signed into their own record opened a thread and read another business's updates under
 * their own thread's name. Nothing was added to the record to fix that: `tracks`, `updates`, `tasks`
 * and `things` are declared registers and `session` is the kernel's own, so all five are already
 * readable through `list`.
 *
 * `UNREACHABLE` and `UNAUTHORIZED` mean there is no record here, and the screen reads the sample as
 * it always did. Any other refusal is the record's own sentence: a record without the work pack has
 * no `tracks` at all, and being told so is the honest answer to an address that names one.
 *
 * THE ROWS ARE HANDED BACK WHOLE AND FILTERED ON THE SCREEN, through the same helpers the sample
 * goes through (`healthOf`, `updatesIn`, `runsIn`). One derivation serves both sources, which is the
 * only way the `not_expected` rule and the newest-wins ordering cannot drift between them. Filtering
 * here instead would be a second implementation of the thing `tracks.test.ts` exists to protect.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { noRecord } from './device.ts';
import { entryOf, refMapOf, targetsOf, type RecordRow, type RefMap } from './remote.ts';
import type { Entry } from './schema.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/** The registers a thread is drawn from. `session` is the kernel's; the rest are the work pack's. */
const READS = ['tracks', 'updates', 'tasks', 'things', 'session'] as const;

/** Everything the screen draws, as rows it already knows how to read. */
export type Thread = {
  tracks: Entry[];
  updates: Entry[];
  tasks: Entry[];
  things: Entry[];
  session: Entry[];
};

export type Opened =
  | { from: 'live'; thread: Thread; now: number }
  | { from: 'sample' }
  | { from: 'refused'; fix: string };

/** As many rows as the record will send in one page. The walk pages to the end. */
const PER_PAGE = 500;

function missed(out: object): Opened {
  if (!('refusal' in out)) return { from: 'refused', fix: 'The thread changed while it was being read.' };
  const refusal = out.refusal as { code: string; fix: string };
  return noRecord(refusal.code) ? { from: 'sample' } : { from: 'refused', fix: refusal.fix };
}

export type TrackReader = { read(): Promise<Opened> };

/**
 * A thread reader for one tab.
 *
 * A REF ARRIVES AS THE TARGET ROW'S ULID and the screen works in numbers: it asks whether an update's
 * `track` is this thread's, and draws a task's project by number. So each register a ref points at is
 * walked once and kept, the way `row-live.ts` keeps its maps, and `entryOf` turns every ref into the
 * number a person says before the rows leave this file.
 *
 * A RUN'S `project` IS NOT A REF. The kernel declares it `text` holding the project's spoken id,
 * `things#1`, so it passes through untouched and `runsIn` matches on it exactly as it always has.
 */
export function trackReader(base: string, io?: Fetch): TrackReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const walked = new Map<string, RecordRow[]>();
  const maps = new Map<string, RefMap>();

  /** Every row of one register, paged to the end. Kept, so a register two refs point at is read once. */
  async function walk(register: string): Promise<RecordRow[] | Opened> {
    const kept = walked.get(register);
    if (kept) return kept;
    const rows: RecordRow[] = [];
    let cursor: string | null = null;
    do {
      const out = await client.list({ register, limit: PER_PAGE, ...(cursor === null ? {} : { cursor }) });
      if (!out.ok) return missed(out);
      rows.push(...(out.value.rows as RecordRow[]));
      cursor = out.value.cursor;
    } while (cursor !== null);
    walked.set(register, rows);
    return rows;
  }

  async function mapOf(register: string): Promise<RefMap | null> {
    const kept = maps.get(register);
    if (kept) return kept;
    const rows = await walk(register);
    /* A REGISTER THIS READER MAY NOT LIST IS LEFT OUT, and the refs pointing at it draw as the id
       they arrived as rather than as a number from another record. */
    if (!Array.isArray(rows)) return null;
    const map = refMapOf(register, rows);
    maps.set(register, map);
    return map;
  }

  return {
    async read() {
      const thread: Thread = { tracks: [], updates: [], tasks: [], things: [], session: [] };
      for (const register of READS) {
        const rows = await walk(register);
        if (!Array.isArray(rows)) return rows;
        const refs = new Map<string, RefMap>();
        for (const target of targetsOf(register)) {
          const map = await mapOf(target);
          if (map) refs.set(target, map);
        }
        thread[register] = rows.map((r) => entryOf(register, r, refs));
      }
      /* THE READER'S CLOCK, because these are this record's rows and not the sample's frozen day. An
         update's age and whether a run is working now are both measured from it. */
      return { from: 'live', thread, now: Date.now() };
    },
  };
}
