/**
 * The one light read of people's faces and organisations' logos: each row that holds a picture, by its name and the
 * picture alone, and for an organisation the bank lines it was met by, which its payments name it by.
 *
 * LOADED BY `import()` from `pictures.svelte.ts` the first time a face or a payment is drawn, so the client it reads
 * with is never in what the frame loads first. A few fields a row and only the rows holding a picture, so a record of
 * three hundred people with ten photos answers ten short rows.
 */

import { createClient } from '@braindog/client';

import { apiBase } from '../at.ts';
import { keptBy, learnFaces } from './pictures.svelte.ts';

/** The most rows the read walks: two pages, well past the people anybody keeps a photo of. */
const MOST = 1000;

/** Reads every face or logo `lists` keep, and learns them by name; a list it may not read says nothing. */
export async function readFaces(lists: readonly string[], base: string = apiBase()): Promise<void> {
  const client = createClient({ base });
  await Promise.all(
    lists.map(async (register) => {
      const kept = keptBy(register);
      if (kept === null || !kept.title) return;
      const { title, field, merged, keys } = kept;
      const rows: { fields?: Record<string, unknown> }[] = [];
      let cursor: string | null = null;
      do {
        const got = await client.list({
          register,
          where: { field, present: true },
          fields: [title, field, ...(merged ? [merged] : []), ...(keys ? [keys] : [])],
          limit: 500,
          ...(cursor === null ? {} : { cursor }),
        });
        if (!got.ok) return;
        rows.push(...(got.value.rows as { fields?: Record<string, unknown> }[]));
        cursor = got.value.cursor;
      } while (cursor !== null && rows.length < MOST);
      learnFaces(register, rows, cursor === null);
    }),
  );
}
