import { cases } from './copy/cases.ts';
import { DESKTOP_NOTARIZED } from './desktop.ts';

/**
 * The pages written for one kind of person that a visitor reaches; the rest are in `HELD`. /for/teams IS BACK (1 Nov):
 * it was held from 23 October while brain.dog held invitations, and teams are open now, on any plan while billing is off.
 */
export const FOR_SHOWN: readonly string[] = ['/for/founders', '/for/teams'];

/**
 * What is true on launch day and not before, one flag per fact.
 *
 * Every sentence that differs before and after launch reads one of these, so nothing else on the site
 * knows the date and the owner's word flips one line. Each stays `false` until that word is given. Two mirror
 * production's Worker vars (`apps/worker/wrangler.jsonc`), and `claims.test.ts` holds each pair equal:
 * `signup` is `SIGNUP` being `open` or `invite` (a stranger reaches sign-up either way), and `billing` is `BILLING` being `live`.
 *
 * SIGN-UP OPENED TO STRANGERS ON 8 OCTOBER. Billing did not: charging
 * money is a separate word, so it stays off or in test mode and `billing` stays `false`.
 */
export const LAUNCH = {
  signup: true, // a stranger can make a hosted record at SIGNUP
  invite: true, // sign-up is by invite (SIGNUP=invite): every start button says "Get early access"
  billing: false, // the Hosted price is charged
  extra: false, // extra usage past the allowance is sold: production sets STRIPE_PRICE_EXTRA and STRIPE_METER_EXTRA, with billing live
  repo: false, // the GitHub repository is public (the owner)
  cli: false, // the CLI is on npm under the name the docs print
  render: false, // braindog-render is on npm
  legal: true, // the owner's Terms, Privacy and processing texts are in force (approved 22 October)
  public: false, // the site is public: the changelog and its feed are shown
} as const;

export type LaunchFlag = keyof typeof LAUNCH;

/**
 * The addresses held until the site is public. The changelog and its feed since W.170, because the site was not
 * deployed publicly yet, and the packs with the site's design ("Packs and the
 * changelog stay held"), the Mac download until a signed build exists, and the pages for personal records, students
 * and new projects (20 October: the slogan is about a business, and those pull the other way), and the page for
 * teams while inviting people is held (22 October). The pricing page
 * came back on 20 October as the one-plan early access page with no prices. The sources stay (`routes/changelog/entries.ts`, the catalogue `routes/packs/` reads); only
 * what a visitor can reach is held. A pack's own page (`/packs/<id>`) is never prerendered while `/packs` is held.
 *
 * A HELD ADDRESS ANSWERS 404 AND WRITES NO FILE, so the site's own 404 page answers it the way it answers any miss
 * (`not_found_handling` in `wrangler.jsonc`). `nav.ts` drops it from the header, the footer, the 404's list and the
 * sitemap, and `svelte.config.js` lets the prerender pass over a 404 here and nowhere else.
 */
export const HELD: readonly string[] = [
  '/changelog',
  '/changelog.xml',
  '/packs',
  /* THE MAC DOWNLOAD UNTIL A NOTARISED DMG IS PUBLISHED (`desktop.ts`, set by `tools/desktop/release.mjs --publish`). */
  ...(DESKTOP_NOTARIZED ? [] : ['/download']),
  ...Object.values(cases.drawn.moreFor)
    .map((more) => more.href)
    .filter((href) => !FOR_SHOWN.includes(href)),
];

/** Whether the changelog, its feed and the packs are held from visitors, for this set of flags. */
export const held = (launch: { public: boolean } = LAUNCH): boolean => !launch.public;
