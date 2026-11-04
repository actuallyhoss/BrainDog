/**
 * Health: the record's vital signs, as one page every record can open (when a check fails, the app
 * says so).
 *
 * DRAWN FROM TWO NAMES THE KERNEL ANSWERS AND NOTHING ELSE: the built-in page source `signs` (each vital sign with its
 * name, its state and its sentence, `packages/kernel/src/pages.ts`) and the built-in figure `green-days`
 * (`packages/kernel/src/built-in-figures.ts`). No list, no figure of its own, so the page leans on no register and every
 * record that holds it can draw it, whatever else it installs. Nothing here knows whose record it is.
 *
 * IN PEOPLE, BECAUSE PEOPLE IS THE ADD-ON NEARLY EVERY RECORD HOLDS: onboarding installs it for the person's own row even
 * where the use case names no module (`usecases/student.ts`). Which add-on every record holds is still an open question
 * of the scope (its unknowns), and moving the page is one `pack:` and a version.
 *
 * ONLY BLOCK KINDS THAT EXIST, AND NO LOOK OF ITS OWN (the unit's critic, rule 7): a lead sentence and three groups of
 * cards. The strip of the last seven days, and anything drawn only for Health, wait for a board he has said yes to.
 *
 * NOT ON THE RAIL. The rail is the seven places; Health is reached from the health sentence in Settings,
 * whose red signs link here (`apps/web/src/routes/settings/[area]/health.ts`), and from the page resource agents read.
 *
 * TODAY'S LINE IS NOT DECLARED HERE. One line on Today while a sign is red, gated on `signs-red` above 0, is `signsLine`
 * in `apps/web/src/lib/home/default-home.ts` (`area-proof-a.md`).
 */

import type { SeedPage } from './base.ts';

/** The one source and the one figure the page reads, by the names the kernel answers them under. */
export const HEALTH_SOURCE = 'signs';
export const HEALTH_FIGURES = ['green-days'] as const;

/**
 * A group of signs in one state: the state's word as the heading, and under it each sign by its name with its sentence.
 *
 * THE STATE IS A WORD, AND RED A WORD AND A MARK. The source hands a sign's state as `green`, `red` or
 * `none`, which is the machine's word and not a person's, so each state is its own block with a heading that says it
 * ("Needs a look", "All good", "Not checked yet") and a glyph beside the heading. A red sign is never told by colour alone.
 *
 * `none` IS NEVER GREEN. A sign with nothing to judge by yet is under Not read yet, with its dashed circle, and never
 * under Alive: a record nobody has read is not well, it is unread.
 *
 * NO `order:` AND NO `limit:`. The signs come in the kernel's own order, the same signs in the same places on every
 * record, and every one in the group is drawn. A group holding no sign is not drawn, so a record with nothing red shows
 * no empty Needs a look.
 */
const group = (state: 'red' | 'green' | 'none', heading: string, icon: string, most?: number): Record<string, unknown> => ({
  kind: 'cards',
  heading,
  icon,
  span: 12,
  ...(most === undefined ? {} : { most }),
  source: HEALTH_SOURCE,
  where: `state is ${state}`,
  columns: [
    { field: 'name', as: 'title' },
    /* THE SIGN'S OWN SENTENCE, under its name in the quieter voice, since it says what was read and when. */
    { field: 'said', as: 'reply' },
  ],
});

export const HEALTH_PAGES: Record<string, SeedPage> = {
  health: {
    page: 'health',
    title: 'Health',
    icon: 'heart-pulse',
    pack: 'core',
    blocks: [
      /* NO LINE OVER THE PAGE, SINCE core 1.3.1 (3 Nov, "i dont like those briefs at all, remove them"): "3 things need a
         look." counted Needs a look under it, which names each one. From core 1.0.0 three notes on `signs-red` said it. */
      /* HOW MUCH THE LINE HAS NOT SEEN IS THE "Not checked yet" GROUP'S, AND SAID ONCE (31 October, AG25): "12 checks
         have not run yet." stood over that group, which names every one of them again. */
      /* AND WHERE THE TIDYING IS DONE: what went stale and what is here twice is counted in Settings, Tidy up, which
         links back here, so the two counts are never read as one. */
      {
        kind: 'note',
        span: 12,
        body: 'What went stale or is here twice is cleared in [Tidy up](/settings/tidy).',
      },
      /* RED FIRST, since that is what the page is opened for, then what is alive, then what has not been read. */
      group('red', 'Needs a look', 'octagon-alert'),
      group('green', 'All good', 'circle-check'),
      /* FOLDED AT SIX AS ALL GOOD IS, SINCE core 1.3.0 (the lists review, L39): it drew every card (finish F54) so they
         added up to a count over them, and that count went (AG25); nine open cards beside All good's six read as the
         page's main business. "Show all 9" says how many. */
      group('none', 'Not checked yet', 'circle-dashed'),
      /* HOW LONG IT HAS HELD, from `green-days`: days running, to yesterday, with every watched sign green (the seven-day
         hold's count, `hold.ts`). NOT "NOTHING WAS RED": the hold watches ten of the signs, and a day an automation sign
         read red still counts, so "nothing has been red" was said of days with a red sign on this page. Drawn only
         while there is a run to speak of. Said up to yesterday, because today is not over and a sign red this morning
         does not undo the days before it. TWO NOTES AND NOT `day(s)`: only a lead note has its `(s)` settled
         (`apps/web/src/lib/record/page-live.ts`, `leadOf`), so a plain note would print "4 day(s)" as written. */
      {
        kind: 'note',
        span: 12,
        when: { metric: 'green-days', is: 1 },
        body: 'Every check passed yesterday.',
      },
      {
        kind: 'note',
        span: 12,
        when: { metric: 'green-days', gt: 1 },
        body: 'Every check has passed for {{green-days}} days, up to yesterday.',
      },
    ],
  },
};
