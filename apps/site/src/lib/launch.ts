/**
 * What is true on launch day and not before, one flag per fact.
 *
 * Every sentence that differs before and after launch reads one of these, so nothing else on the site
 * knows the date and the owner's word flips one line. Each stays `false` until he gives it. Two mirror
 * production's Worker vars (`apps/worker/wrangler.jsonc`), and `claims.test.ts` holds each pair equal:
 * `signup` is `SIGNUP` being `open`, and `billing` is `BILLING` being `live`.
 *
 * SIGN-UP OPENED ON HIS WORD ON 8 OCTOBER (DIRECTION §42, "open to strangers now"). Billing did not: charging
 * money is a separate word, so it stays off or in test mode and `billing` stays `false`.
 */
export const LAUNCH = {
  signup: true, // a stranger can make a hosted record at SIGNUP
  billing: false, // the Hosted price is charged
  repo: false, // the GitHub repository is public (the owner)
  cli: false, // the CLI is on npm under the name the docs print
  render: false, // braindog-render is on npm
  legal: false, // the owner's Terms, Privacy and processing texts are in apps/site/legal/
  public: false, // the site is public: the changelog and its feed are shown
} as const;

export type LaunchFlag = keyof typeof LAUNCH;

/**
 * The addresses held until the site is public, his word on W.170: "we didnt even deploy publically yet. remove
 * those changelog". The source stays (`routes/changelog/entries.ts`); only what a visitor can reach is held.
 *
 * A HELD ADDRESS ANSWERS 404 AND WRITES NO FILE, so the site's own 404 page answers it the way it answers any miss
 * (`not_found_handling` in `wrangler.jsonc`). `nav.ts` drops it from the header, the footer, the 404's list and the
 * sitemap, and `svelte.config.js` lets the prerender pass over a 404 here and nowhere else.
 */
export const HELD = ['/changelog', '/changelog.xml'] as const;

/** Whether the changelog and its feed are held from visitors, for this set of flags. */
export const held = (launch: { public: boolean } = LAUNCH): boolean => !launch.public;
