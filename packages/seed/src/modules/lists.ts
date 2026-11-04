/**
 * What the first-party modules bring, by list, and which list plays each part the first run reads by, as
 * `@braindog/seed/packs/lists`, with no document behind it.
 *
 * THE APP'S FIRST OPEN READ EVERY MODULE'S DOCUMENT TO LEARN A FEW NAMES. A line about an add-on ("Added Accounts, FX and
 * Books") asked `firstPartyModule` (`module-info.ts`) for the lists a module brings, and Today asked `moduleDocument` which
 * list plays `meets`, and each of those builds every module's document, the sample's example rows and the Agents pack
 * with it: about sixty kilobytes on a phone before the first screen, for six short lists and four names.
 *
 * IT LIVES BESIDE THE MODULES, because it names them and their lists: a file the core ships may not spell either
 * (`tools/gates/core-names.mjs`).
 *
 * SO THEY ARE WRITTEN HERE, AND THE DOCUMENTS STILL SAY THEM. `test/module-lists.test.ts` reads each module's document the
 * way the two readers did, and is red the day a list moves, is added or plays another part without this file following.
 */

import { MODULE_NAMES } from '../usecases/names.ts';

/** The lists each first-party module declares, in the order its document declares them, by module id. */
const BROUGHT: readonly { pack: string; lists: readonly string[] }[] = [
  { pack: 'portfolio', lists: ['things', 'stages', 'datapoints', 'kpis'] },
  { pack: 'people', lists: ['people', 'organisations'] },
  { pack: 'money-core', lists: ['obligations', 'accounts', 'fx', 'categories', 'filing_rules', 'transactions', 'payee_names', 'recurring', 'plans', 'installments', 'balances', 'snapshots', 'books'] },
  { pack: 'estate', lists: ['services'] },
  { pack: 'work', lists: ['tracks', 'updates', 'tasks'] },
  { pack: 'agents', lists: ['learnings', 'skills', 'credentials', 'tools'] },
];

export const MODULE_LISTS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(BROUGHT.map((b) => [b.pack, b.lists]));

/** The lists the first-party module `id` brings, or `undefined` for a use case's pack or anybody else's. */
export const listsOfModule = (id: string): readonly string[] | undefined => (Object.hasOwn(MODULE_LISTS, id) ? MODULE_LISTS[id] : undefined);

/** What a person calls the first-party module `id` (Money, not `money-core`), or `undefined` for any other pack. */
export const moduleNamed = (id: string): string | undefined => (Object.hasOwn(MODULE_LISTS, id) ? (MODULE_NAMES[id] ?? id) : undefined);

/** A part the first run reads a list by. */
export type Part = 'meets' | 'projects' | 'hand' | 'rates';

/**
 * The list that plays each part in the modules this build ships: the first list whose declaration says `meets:`,
 * `hand:` or `rates:`, in module order, and for `projects` the list the people's `projects` part links to.
 */
export const PLAYED_BY: Readonly<Record<Part, string>> = { meets: 'people', projects: 'things', hand: 'tasks', rates: 'fx' };
