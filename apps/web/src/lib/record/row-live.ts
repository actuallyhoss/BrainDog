/**
 * One row on `/r/<register>/<seq>`, read from the record, with the sample when there is none.
 *
 * A ROUTE-ONLY MODULE, like `history-live.ts`: the client carries the route table as a value.
 *
 * `UNREACHABLE` and `UNAUTHORIZED` mean there is no record here, and the page reads the sample as it
 * always did. Any other refusal is the record's own sentence. A row the record does not hold is
 * `entry: null`, never the sample's row of the same number.
 *
 * THE DECLARATION IS THE SEED'S COPY, as it is for the list (`remote.ts` says why and what pins it).
 * The answer is turned into the app's `Entry` by `entryOf`, so every helper the page already calls
 * (`display`, `readableFields`, `toneOf`) reads a live row the way it reads a sample one.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { noRecord } from './device.ts';
import { entryOf, namesOf, refMapOf, targetsOf, type Names, type RecordRow, type RefMap } from './remote.ts';
import type { Entry } from './schema.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/**
 * `names` IS WHAT THE RECORD CALLS THE ROWS THIS ONE POINTS AT, and it travels with the row because
 * the page draws every field through `display`: without it a live `ref` was drawn as the sample's
 * row of the same number, which is another record's name under this record's field.
 */
export type Got =
  | { from: 'live'; entry: Entry | null; names: Names }
  | { from: 'sample' }
  | { from: 'refused'; fix: string };

function missed(out: object): Got {
  if (!('refusal' in out)) return { from: 'refused', fix: 'The row changed while it was being read.' };
  const refusal = out.refusal as { code: string; fix: string };
  return noRecord(refusal.code) ? { from: 'sample' } : { from: 'refused', fix: refusal.fix };
}

export type RowReader = { read(register: string, seq: number): Promise<Got> };

/**
 * A row reader for one tab.
 *
 * A REF ARRIVES AS THE TARGET ROW'S ULID, and the page draws it by number, so each register a ref
 * points at is walked once and kept, the way the list keeps its maps. A register this reader may
 * not list is left out, and its refs draw as the id they arrived as rather than as a wrong name.
 */
export function rowReader(base: string, io?: Fetch): RowReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const maps = new Map<string, RefMap>();

  async function mapOf(register: string): Promise<RefMap | null> {
    const kept = maps.get(register);
    if (kept) return kept;
    const rows: RecordRow[] = [];
    let cursor: string | null = null;
    do {
      const out = await client.list({ register, limit: 500, ...(cursor === null ? {} : { cursor }) });
      if (!out.ok) return null;
      rows.push(...(out.value.rows as RecordRow[]));
      cursor = out.value.cursor;
    } while (cursor !== null);
    const map = refMapOf(register, rows);
    maps.set(register, map);
    return map;
  }

  return {
    async read(register, seq) {
      /* A PENDING ROW HAS NO NUMBER THE RECORD COULD HOLD, so nothing is asked and the tab's own row is drawn. */
      if (!Number.isInteger(seq) || seq < 1) return { from: 'sample' };
      const got = await client.get(register, seq);
      if (!got.ok) return missed(got);
      if (got.value === null) return { from: 'live', entry: null, names: new Map() };
      const refs = new Map<string, RefMap>();
      for (const target of targetsOf(register)) {
        const map = await mapOf(target);
        if (map) refs.set(target, map);
      }
      return { from: 'live', entry: entryOf(register, got.value as RecordRow, refs), names: namesOf(refs) };
    },
  };
}
