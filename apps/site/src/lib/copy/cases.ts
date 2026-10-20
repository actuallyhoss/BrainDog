/**
 * The words of the drawn record on the pages written for each kind of person (`routes/for/`).
 *
 * THE PAGES INSIDE IT ARE NOT HERE. Each kind of person's example record is dialect text in
 * `lib/examples/`, drawn by `braindog-render` exactly as a record's page is, so the words on those
 * pages are the example's own. What is here is the frame round them: what a screen reader calls the
 * drawing, the Page and Source switch, the answers on Needs you, the caption, and the
 * link from each case to the page written for that person.
 */
export const cases = {
  drawn: {
    /* THE PAGE AND SOURCE SWITCH. Source is the page's dialect text as it is written, which is the
       same text a record's page is made of (docs/05 §2), and `view` names the pair. */
    view: 'Show this page as',
    page: 'Page',
    source: 'Source',
    /* What a screen reader hears beside the count on Needs you, the screen once called Decide (LAUNCH.md 103). */
    needYou: (n: number) => (n === 1 ? '1 needs you' : `${n} need you`),
    /* THE ANSWERS ON NEEDS YOU, as `apps/web`'s Needs you screen says them. Nothing is sent anywhere: the
       answer changes this drawing and nothing else. `chose` is for a question whose options are
       not Accept and Reject. */
    accepted: 'Accepted by you',
    rejected: 'Rejected by you',
    chose: (label: string) => `You chose ${label}`,
    /* THE PAGE WRITTEN FOR EACH KIND OF PERSON, by the example's id (`lib/examples/types.ts`). The
       addresses are the site's own prerendered pages under `/for/`. */
    moreFor: {
      personal: { href: '/for/personal', label: 'More for personal records' },
      student: { href: '/for/students', label: 'More for students' },
      founder: { href: '/for/founders', label: 'More for founders' },
      team: { href: '/for/teams', label: 'More for teams' },
      project: { href: '/for/new-projects', label: 'More for new projects' },
    },
  },
} as const;
