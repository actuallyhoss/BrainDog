/**
 * What is true on launch day and not before, one flag per fact.
 *
 * Every sentence that differs before and after launch reads one of these, so nothing else on the site
 * knows the date and the owner's word flips one line. They stay `false` until he gives it. The ops
 * area's sign-up and billing units name the production vars that mirror `signup` and `billing`, and
 * a test holds each pair equal.
 */
export const LAUNCH = {
  signup: false, // a stranger can make a hosted record at SIGNUP (ROADMAP W85, ops area)
  billing: false, // the Hosted price is charged (W82-W84, ops area)
  repo: false, // the GitHub repository is public (W87, the owner)
  cli: false, // the CLI is on npm under the name the docs print (W87-W88)
  render: false, // braindog-render is on npm (W87-W88)
  legal: false, // the owner's Terms, Privacy and processing texts are in apps/site/legal/
} as const;

export type LaunchFlag = keyof typeof LAUNCH;
