/**
 * Scripts: every installed script and where it stands, as one page every record can open (C33, 24 October).
 *
 * IT WAS A SCREEN BUILT BY HAND (`apps/web/src/routes/scripts/+page.svelte`, 109 lines over the record's `scripts` read),
 * and is a declared page now, drawn by the one page reader, so a person changes it by saying so and an agent reads and
 * proposes it as any other page (`braindog page pull scripts`).
 *
 * DRAWN FROM ONE NAME THE KERNEL ANSWERS AND NOTHING ELSE: the built-in source `scripts`, each installed script with
 * what starts it, where it stands and this month's runs (`packages/kernel/src/sources/scripts.ts`). No list and no
 * figure, so the page leans on no register and every record that holds it can draw it, whatever else it installs.
 *
 * IN PEOPLE, AS HEALTH IS (`health.ts`), BECAUSE PEOPLE IS THE ADD-ON NEARLY EVERY RECORD HOLDS. A record without it is
 * drawn the same body by `/scripts` itself, through `@braindog/seed/packs/scripts`, until the record keeps one.
 *
 * ONE TABLE OF ROWS, A ROW A SCRIPT: its name, what starts it ("Runs every day and when an automation starts it") and
 * where it stands ("Last ran 2 hours ago", "Paused"), each said by the host from the row as the old list said them
 * (`apps/web/src/lib/record/scripts.ts` `scriptOf`). A row opens the script's own page, where its facts, recent runs,
 * versions and Resume are. Eleven tiles each with a six-field table were a page to scroll, not a list to scan.
 *
 * NOT ON THE RAIL. The rail is the seven places; Scripts is reached from Automations and the palette.
 */

import type { SeedPage } from './base.ts';

/** The one source the page reads, by the name the kernel answers it under. */
export const SCRIPTS_SOURCE = 'scripts';

export const SCRIPTS_PAGES: Record<string, SeedPage> = {
  scripts: {
    page: 'scripts',
    title: 'Scripts',
    icon: 'code',
    pack: 'core',
    blocks: [
      /* THE PAGE'S LINE, as every page opens on one (`calm-pages.test.ts`). `/scripts` says its own over it, from the rows:
         how many, how much they ran this month, and what has stopped (`routes/scripts/reading.ts`). */
      { kind: 'note', lead: true, span: 12, body: 'Every script on this record, and where it stands.' },
      {
        kind: 'table',
        key: 'scripts',
        span: 12,
        source: SCRIPTS_SOURCE,
        columns: [
          { field: 'title', label: 'Script' },
          { field: 'every', label: 'Runs' },
          { field: 'last_at', label: 'Where it stands' },
        ],
        empty: 'No scripts yet. A script is a short program an agent writes and you accept.',
      },
    ],
  },
};
