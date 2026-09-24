/**
 * One row on `/r/<register>/<seq>`, read from the record.
 *
 * A ROUTE-ONLY MODULE, like `history-live.ts`: the client carries the route table as a value.
 *
 * EVERY REFUSAL IS THE RECORD'S OWN SENTENCE. `UNREACHABLE` and `UNAUTHORIZED` with no slug used to draw the
 * sample's row of the address's number, another business's row; there is no sample now (DIRECTION 26). A row the
 * record does not hold is `entry: null`, and the LIST's declaration is learned
 * even then, because the screen that says the row is not there has to name the list it is not in.
 *
 * THE DECLARATION IS THE SEED'S COPY, as it is for the list (`remote.ts` says why and what pins it).
 * The answer is turned into the app's `Entry` by `entryOf`, so every helper the page already calls
 * (`display`, `readableFields`, `toneOf`) reads a live row the way it reads a sample one.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { entryOf, learn, namesOf, refMapOf, targetsOf, type Names, type RecordRow, type RefMap } from './remote.ts';
import type { Entry } from './schema.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/**
 * `names` IS WHAT THE RECORD CALLS THE ROWS THIS ONE POINTS AT, and it travels with the row because
 * the page draws every field through `display`: without it a live `ref` was drawn as the sample's
 * row of the same number, which is another record's name under this record's field.
 */
export type Got = { from: 'live'; entry: Entry | null; names: Names } | { from: 'refused'; fix: string };

function missed(out: object): Got {
  if (!('refusal' in out)) return { from: 'refused', fix: 'The row changed while it was being read.' };
  return { from: 'refused', fix: (out.refusal as { fix: string }).fix };
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
  const asked = new Map<string, Promise<void>>();

  async function mapOf(register: string): Promise<RefMap | null> {
    const kept = maps.get(register);
    if (kept) return kept;
    await learn(client.schema, register, asked);
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
      /* A PENDING ROW HAS NO NUMBER THE RECORD COULD HOLD, so nothing is asked: the record holds no row for it, and the
         page draws the tab's own row from `pending` instead. */
      if (!Number.isInteger(seq) || seq < 1) return { from: 'live', entry: null, names: new Map() };
      const got = await client.get(register, seq);
      if (!got.ok) return missed(got);
      /* A USE CASE'S OWN LISTS ARE DECLARED BY THE RECORD ALONE, AND THE ROW'S LIST IS LEARNED WHETHER OR NOT THE ROW IS
         THERE. This `learn` used to sit below the line under it, and a missing row therefore left `REGISTERS[register]`
         empty, which is the one thing the row page reads to name the list. So `/r/courses/9999` on a student record
         answered "There is no list called courses." under a button reading "Back to courses", with `courses` in the rail
         holding rows: the sentence and the button contradicted each other, and the likely reading was that the list had
         been destroyed. `/r/session/9999` was always right ("There is no run #9999.") only because `session` ships in the
         bundle and never needed asking. One schema call, answered once per tab, buys every register that sentence.

         It stays below `get` rather than above it, because a row that IS there needs the declaration just as much and
         pays for it in the same place, and a pending row pays for neither. */
      await learn(client.schema, register, asked);
      /* NO REF WALK FOR A ROW THAT IS NOT THERE: there are no fields to draw, so paging a 400-row target register would
         name refs nobody is going to read.

         COUNTED AGAINST A REAL KERNEL over `node:sqlite`, on the survey's shape (a `Courses` list with one `ref` field,
         a `Teachers` list holding 400 rows), at the foot of `row-live.test.ts`:

             a row that is there     get, schema courses, schema teachers, list teachers    400 rows back
             a row that is not       get, schema courses                                      0 rows back

         So this line is worth two of the four calls and the whole 400-row page, on the one read where every one of them
         is spent naming refs the screen has already decided not to draw. Removing it was measured, not assumed: the
         absent row then makes all four calls and carries the 400 rows. */
      if (got.value === null) return { from: 'live', entry: null, names: new Map() };
      /* Each target walked before the row is turned into an `Entry`, so a ref is drawn as the row's name, not `courses#1`. */
      const refs = new Map<string, RefMap>();
      for (const target of targetsOf(register)) {
        const map = await mapOf(target);
        if (map) refs.set(target, map);
      }
      return { from: 'live', entry: entryOf(register, got.value as RecordRow, refs), names: namesOf(refs) };
    },
  };
}
