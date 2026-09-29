/**
 * The words of the drawn app on the home page, the one that lies across the hero's bottom edge.
 *
 * THE PAGES INSIDE IT ARE NOT HERE. Each kind of person's example record is dialect text in
 * `lib/examples/`, drawn by `braindog-render` exactly as a record's page is, so the words on those
 * pages are the example's own. What is here is the frame round them: what a screen reader calls the
 * window and its parts, the Page and Source switch, the answers on Decide, the caption, and the
 * link from each case to the page written for that person.
 */
export const cases = {
  drawn: {
    /* What a screen reader calls the window, its row of tabs, its rail and the phone's bar. */
    window: 'A drawing of the app',
    tabs: 'Who the record is for',
    rail: 'Pages',
    bar: 'Record',
    /* THE PAGE AND SOURCE SWITCH. Source is the page's dialect text as it is written, which is the
       same text a record's page is made of (docs/05 §2), and `view` names the pair. */
    view: 'Show this page as',
    page: 'Page',
    source: 'Source',
    /* The phone's fourth tab, and what its list of the other pages is called, as `apps/web` says both. */
    more: 'More',
    morePages: 'More pages',
    /* THE RAIL'S ASK FIELD AND ITS AGENTS, in the new app's words (SYSTEM §5). Both are drawn, not pressed. */
    ask: 'Ask, add or find',
    working: 'Working now',
    toDecide: (n: number) => `${n} to decide`,
    /* THE ANSWERS ON DECIDE, as `apps/web`'s Decide screen says them. Nothing is sent anywhere: the
       answer changes this drawing and nothing else. `chose` is for a question whose options are
       not Accept and Reject. */
    accepted: 'Accepted by you',
    rejected: 'Rejected by you',
    chose: (label: string) => `You chose ${label}`,
    /* THE LINE UNDER THE WINDOW. A drawing of an app looks like a picture of one, so it says both
       that it can be pressed and what it is: an example, drawn by the renderer a record uses. */
    caption:
      'An example record, drawn by BrainDog’s own renderer. Pick who it is for, open a page, or answer a question. ' +
      'Every page shows its source.',
    /* THE PAGE WRITTEN FOR EACH KIND OF PERSON, by the example's id (`lib/examples/types.ts`). The
       addresses are the site's own prerendered pages under `/for/` (SIT-15). */
    moreFor: {
      personal: { href: '/for/personal', label: 'More for personal records' },
      student: { href: '/for/students', label: 'More for students' },
      founder: { href: '/for/founders', label: 'More for founders' },
      team: { href: '/for/teams', label: 'More for teams' },
      project: { href: '/for/new-projects', label: 'More for new projects' },
    },
  },
} as const;
