/**
 * Which host panel a block carries under it: the project's scheduled actions, the key its numbers are sent with, or
 * none (`loop/finish/pages.md` R3, contracts §4.3).
 *
 * A PANEL IS NAMED, NOT FOUND BY ITS HEADING. The reader drew Resume and the report key under any section whose heading
 * was the exact English "Runs on", and the report key and the poll form under "Send numbers here". Renaming a section,
 * which a person or Slash may now do, or a pack speaking in another voice, took both away with no word said. A
 * section now says `panel: actions` or `panel: reporting`, and the kernel admits that key only on a page drawn for a
 * row (`for:`), which is the row the panel is about.
 *
 * THE TWO OLD HEADINGS ARE STILL READ, AND ONLY WHERE NO `panel` IS SAID, for declarations written before the key: his
 * record keeps its sections until it takes the seed's new versions. Nothing new relies on them, and they go once every
 * first-party declaration names its panel (PGS-22).
 *
 * PURE, AND NODE LOADS IT: relative `.ts` imports only.
 */

import { copy } from '../../copy.ts';
import { words as actionWords } from '../../record/actions.ts';

/** The panels the host draws. `actions` carries the report key beside what the project runs on, as it always has. */
export type Panel = 'actions' | 'reporting';

/* A `Set`, so a `panel:` of `constructor` names nothing. */
const PANELS: ReadonlySet<string> = new Set<Panel>(['actions', 'reporting']);

/** The panel `block` asks for, or `null`. Only a section carries one. */
export function panelOf(block: { kind: string; heading?: string | undefined }): Panel | null {
  if (block.kind !== 'section') return null;
  /* THE PAGE READ CARRIES EVERY KEY IT DOES NOT NARROW (`page-live.ts` `blockOf`), so the key is on the block as the
     record stored it, and the app's block type does not name it. */
  const named = (block as { panel?: unknown }).panel;
  if (named !== undefined) return typeof named === 'string' && PANELS.has(named) ? (named as Panel) : null;
  if (block.heading === actionWords.runsOn) return 'actions';
  if (block.heading === copy.reportHeading) return 'reporting';
  return null;
}
