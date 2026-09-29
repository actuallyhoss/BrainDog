/**
 * What is true on launch day and not before, one flag per fact.
 *
 * Every sentence that differs before and after launch reads one of these, so nothing else on the site
 * knows the date and the owner's word flips one line. They stay `false` until he gives it. The
 * production vars that mirror `signup` and `billing`, and
 * a test holds each pair equal.
 */
export const LAUNCH = {
  signup: false, // a stranger can make a hosted record at SIGNUP
  billing: false, // the Hosted price is charged
  repo: false, // the GitHub repository is public (the owner)
  cli: false, // the CLI is on npm under the name the docs print
  render: false, // braindog-render is on npm
  legal: false, // the owner's Terms, Privacy and processing texts are in apps/site/legal/
} as const;

export type LaunchFlag = keyof typeof LAUNCH;
