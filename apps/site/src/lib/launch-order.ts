/**
 * The order of launch, as a rule (LCH-A02, H.14: LAUNCH.legal is flipped so /legal/<name> goes live before sign-up
 * opens). One function over a Worker environment's vars and the site's launch flags, answering every rule the
 * pair breaks, one plain line each, and nothing when the order holds.
 *
 * THE RULES. Sign-up open needs the legal pages live and a bot check keyed (`TURNSTILE_SITE_KEY`, the page's half; the
 * secret is a secret and no config holds it). Billing live needs both prices and a sign-up that is not closed, or nobody
 * can reach a plan to pay for. The legal pages live need the texts finished: no `[owner:` marker left in
 * `apps/site/legal/`.
 *
 * THE MODES ARE READ AS THE WORKER READS THEM (`signupMode` and `billingMode` in `apps/worker/src/launch.ts`): trimmed,
 * exact, and anything else is `closed` or `off`. Repeated here and not imported, because the site does not reach into
 * the Worker's source.
 */

/**
 * The vars of a Worker environment this rule reads, as the parsed `wrangler.jsonc` holds them. NAMED, NOT LOOKED UP BY
 * STRING, so no var name is a string value in this file (`tools/gates/core-names.mjs`).
 */
export type LaunchVars = {
  readonly SIGNUP?: string | undefined;
  readonly BILLING?: string | undefined;
  readonly TURNSTILE_SITE_KEY?: string | undefined;
  readonly STRIPE_PRICE_HOSTED?: string | undefined;
  readonly STRIPE_PRICE_PLUS?: string | undefined;
};

/** The site's flags this rule reads (`LAUNCH` in `launch.ts`). */
export type LaunchFlags = { readonly legal: boolean };

const said = (value: string | undefined): string => (value ?? '').trim();

/** How many `[owner:` markers the legal texts still hold: the places a text still waits on its final wording. */
export const ownerMarkers = (texts: readonly string[]): number => texts.reduce((n, text) => n + text.split('[owner:').length - 1, 0);

/**
 * Every rule of the launch order that `vars` and `launch` break, in plain lines, or `[]` when the order holds.
 * `markers` is `ownerMarkers` of the legal texts, read by the caller, so this stays a rule over values.
 */
export function launchOrder(vars: LaunchVars, launch: LaunchFlags, markers = 0): string[] {
  const out: string[] = [];
  const signup = said(vars.SIGNUP);
  const closed = signup !== 'open' && signup !== 'invite';
  if (signup === 'open') {
    if (!launch.legal)
      out.push('Sign-up is open before the legal pages are live. Set LAUNCH.legal to true first, so /legal/<name> goes live before sign-up opens.');
    if (said(vars.TURNSTILE_SITE_KEY) === '')
      out.push('Sign-up is open with no bot check. Put TURNSTILE_SITE_KEY in the config, and the TURNSTILE_SECRET secret, before SIGNUP is open.');
  }
  if (said(vars.BILLING) === 'live') {
    const prices = { STRIPE_PRICE_HOSTED: vars.STRIPE_PRICE_HOSTED, STRIPE_PRICE_PLUS: vars.STRIPE_PRICE_PLUS };
    const missing = Object.entries(prices).flatMap(([key, value]) => (said(value) === '' ? [key] : []));
    if (missing.length > 0) out.push(`Billing is live without ${missing.join(' and ')}. Set both prices before BILLING is live.`);
    if (closed) out.push('Billing is live while sign-up is closed, so nobody can reach a plan to pay for. Set SIGNUP to invite or open first.');
  }
  if (launch.legal && markers > 0)
    out.push(`LAUNCH.legal is true while the legal texts still hold ${markers} [owner: ${markers === 1 ? 'marker' : 'markers'}. Finish them in apps/site/legal/ first.`);
  return out;
}
