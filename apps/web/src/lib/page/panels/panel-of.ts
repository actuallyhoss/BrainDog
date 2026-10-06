/**
 * Which host panel a block carries under it: the project's scheduled actions, the key its numbers are sent with, what
 * an agent run did with its Undo, or none.
 *
 * `panel: run` IS A RUN'S PAGE (`RunPanel.svelte`), drawn for one row of the list of runs: what the run did, in plain
 * lines, and Undo this run (DIRECTION §37). Only a page drawn for a run draws it; under any other row it draws nothing.
 *
 * A PANEL IS NAMED, NOT FOUND BY ITS HEADING. The reader drew Resume and the report key under any section whose heading
 * was the exact English "Runs on", and the report key and the poll form under "Send numbers here". Renaming a section,
 * which a person or Slash may now do, or a pack speaking in another voice, took both away with no word said. A
 * section now says `panel: actions` or `panel: reporting`, and the kernel admits that key only on a page drawn for a
 * row (`for:`), which is the row the panel is about.
 *
 * NO HEADING IS READ ANY MORE. The two old headings were read where no `panel` was said, until every first-party
 * declaration named its panel; since portfolio's project template and founder 1.8.0 do, a section that names
 * none draws none. A record still on an older version draws its sections without the panel until it takes the update,
 * which is offered and never forced.
 *
 * PURE, AND NODE LOADS IT: no import at all.
 */

/** The panels the host draws: a project's scheduled actions, the key a row's numbers are sent with, and a run's changes. */
export type Panel = 'actions' | 'reporting' | 'run';

/* A `Set`, so a `panel:` of `constructor` names nothing. */
const PANELS: ReadonlySet<string> = new Set<Panel>(['actions', 'reporting', 'run']);

/** The panel `block` asks for, or `null`. Only a section carries one. */
export function panelOf(block: { kind: string; heading?: string | undefined }): Panel | null {
  if (block.kind !== 'section') return null;
  /* THE PAGE READ CARRIES EVERY KEY IT DOES NOT NARROW (`page-live.ts` `blockOf`), so the key is on the block as the
     record stored it, and the app's block type does not name it. */
  const named = (block as { panel?: unknown }).panel;
  return typeof named === 'string' && PANELS.has(named) ? (named as Panel) : null;
}
