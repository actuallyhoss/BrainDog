/**
 * Every address the site links to, in one place.
 *
 * `APP` is the app, on its own name, `app.brain.dog`, at its root (`apps/worker/wrangler.jsonc`, `PUBLIC_HOST`): a
 * record is `app.brain.dog/<slug>`, and the bare name opens the record the person was last on. Absolute, because a
 * sign-in or a device start on any other name is refused at `origin`, and `brain.dog/app` is only the 308 that sends an
 * old link there. Every link under it carries `rel="external"`, because the prerender crawler
 * would otherwise try to follow it. `test/one-origin.test.mjs` reads production's `PUBLIC_HOST` and holds the two equal.
 */
export const APP = 'https://app.brain.dog';
export const SIGNIN = `${APP}/signin`;
export const SIGNUP = `${APP}/signup`;
export const SOURCE: string | null = 'https://github.com/actuallyhoss/BrainDog';

/* The site's own pages. A header or footer link to one shows only once its route exists, which
   `nav.ts` reads from the tree, so naming an address here draws nothing by itself. */
export const DOCS = '/docs';
/** The add-on store. It was `/packs` until 3 November; `static/_redirects` sends the old address here. */
export const ADDONS = '/addons';
/** The store's old name, kept for `copy.ts`, which passes every address on. */
export const PACKS = ADDONS;
export const SUPPORT = '/support';
export const SECURITY = '/security';
/**
 * The owner's texts, each a page of `routes/legal/[name]` (its `NAMES`), drawn once `LAUNCH.legal` is on. The sitemap
 * names them then, as the footer links two of them.
 */
export const LEGAL_TEXTS: readonly string[] = ['/legal/terms', '/legal/privacy', '/legal/processing'];
/** A status page, which the owner has not named yet, so nothing links to one. */
export const STATUS: string | null = null;

/** The skill an agent installs, served from `static/agents/`. */
export const SKILL = '/agents/braindog/SKILL.md';
/** Where an MCP client connects: `servesMcp` in `apps/worker/src/route.ts`, with OAuth. */
export const MCP = 'https://app.brain.dog/mcp';
/** The changelog's Atom feed, prerendered beside the page. */
export const FEED = '/changelog.xml';

/**
 * The support address a person writes to. The owner's decision now routes `support@brain.dog`: every reader (mail footers, Settings > About, `/support` here and
 * `security.txt`'s Contact) shows it, and this stays equal to the Worker's `SUPPORT_ADDRESS` in
 * `apps/worker/wrangler.jsonc`'s production environment, the one source for the app and the mail.
 */
export const SUPPORT_EMAIL = 'support@brain.dog';

/** The build instructions, which is what a self-hoster is actually sent to. */
export const BUILD: string | null = null;
/** The command line's install line, as `apps/cli/README.md` gives it. */
export const CLI_INSTALL = 'curl -fsSL https://brain.dog/cli/install.sh | sh';
