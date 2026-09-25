/**
 * The sample's row names put where a live tab keeps the record's, for a test that asks the mirror about a row by name.
 *
 * A TEST IMPORTS THIS FOR ITS SIDE EFFECT AND NOTHING SHIPPED MAY. `where.ts`, `remote.ts` and the new-row form read a
 * ref's names from `held.ts`'s `TITLES`, which only a walk of the record fills, so `thing is Kiln` is a question about
 * the record's projects and never about the sample's. The mirror's tests ask about the sample's projects on purpose, and
 * this is how they say so: before this file the same answer came from `ROWS` in every tab, the live ones included.
 *
 * `data.ts` still fills `REGISTERS` and `PAGES` itself while it ships; wave C1 moves that copy here too.
 */

import { REGISTERS, ROWS } from '../data.ts';
import { TITLES } from '../held.ts';

for (const [register, rows] of Object.entries(ROWS)) {
  const title = REGISTERS[register]?.title;
  TITLES.set(register, new Map(rows.map((e) => [e.seq, title === undefined ? '' : String(e.fields[title] ?? '')])));
}
