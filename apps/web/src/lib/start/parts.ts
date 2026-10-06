/**
 * Which list plays each part the first run reads by, from what the lists declare, never from what they are called.
 *
 * A LIST SAYS WHAT IT PLAYS (`packages/kernel/src/roles.ts`): `meets:` is the people `meet` writes, `rates:` the rates
 * money converts by, `hand:` the work a person or an agent picks up. The projects are the list the people's `projects`
 * part links to. So "where Money is kept" is a list that plays `rates`, not a module the web knows by its id, and a
 * record whose people are in a list called `contacts` is read the same (`tools/gates/web-lists.mjs`).
 *
 * READ OFF THE MODULES THIS BUILD SHIPS (`moduleDocument`), as `lists.ts` reads their fields, and asked of the lists a
 * record holds, so a part is played here only when the record keeps the list that plays it.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screens only call it.
 */

import { MODULE_ORDER } from '@braindog/seed/usecases';
import { moduleDocument } from '@braindog/seed/usecases/install';
import { firstPartyModule } from '@braindog/seed/packs/modules';

/** A part the first run reads a list by. */
export type Part = 'meets' | 'projects' | 'hand' | 'rates';

type Body = Record<string, unknown>;
const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

let known: ReadonlyMap<Part, string> | null = null;

/** The list that plays each part in the modules this build ships, read once. */
function players(): ReadonlyMap<Part, string> {
  if (known !== null) return known;
  const out = new Map<Part, string>();
  for (const id of MODULE_ORDER) {
    const doc = moduleDocument(null, id, { today: '1970-01-01' });
    for (const d of Array.isArray(doc?.declarations) ? (doc.declarations as unknown[]) : []) {
      if (!isMap(d) || typeof d.register !== 'string') continue;
      for (const part of ['meets', 'hand', 'rates'] as const) if (isMap(d[part]) && !out.has(part)) out.set(part, d.register);
      /* THE PROJECTS ARE WHERE THE PEOPLE'S `projects` PART POINTS: the field it names, and the list that field links to. */
      const meets = d.meets;
      if (isMap(meets) && typeof meets.projects === 'string' && Array.isArray(d.fields)) {
        const field = (d.fields as unknown[]).find((f) => isMap(f) && f.id === meets.projects);
        if (isMap(field) && typeof field.to === 'string' && !out.has('projects')) out.set('projects', field.to);
      }
    }
  }
  known = out;
  return known;
}

/** The list that plays `part`, or `null` where no module this build ships declares one. */
export const playedBy = (part: Part): string | null => players().get(part) ?? null;

/** Whether one of `lists` plays `part`. */
export const plays = (lists: Iterable<string>, part: Part): boolean => {
  const by = playedBy(part);
  return by !== null && new Set(lists).has(by);
};

/** The lists the modules `ids` bring, for a record made from them a moment ago and not read back yet. */
export const listsOfModules = (ids: readonly string[]): string[] => ids.flatMap((id) => firstPartyModule(id)?.registers ?? []);

/** The lists a record holds on: every list of every pack that is on, from what `packs` answers. */
export const listsOn = (packs: readonly { disabled_at: string | null; registers?: readonly string[] }[]): string[] =>
  packs.flatMap((p) => (p.disabled_at === null ? (p.registers ?? []) : []));
