/**
 * Every address the site links to, in one place.
 *
 * `APP` is the app, served on this site's own name (`wrangler.jsonc`). Every link under it carries
 * `rel="external"`, because the prerender crawler would otherwise follow it into a path this build
 * does not own and stop the build.
 */
export const APP = '/app';
export const SIGNIN = `${APP}/signin`;
export const SIGNUP = `${APP}/signup`;
export const SOURCE: string | null = 'https://github.com/actuallyhoss/BrainDog';

/* The site's own pages. A header or footer link to one shows only once its route exists, which
   `nav.ts` reads from the tree, so naming an address here draws nothing by itself. */
export const DOCS = '/docs';
export const PACKS = '/packs';
export const SUPPORT = '/support';
export const SECURITY = '/security';
/** A status page, which the owner has not named yet, so nothing links to one. */
export const STATUS: string | null = null;

/** The skill an agent installs, served from `static/agents/`. */
export const SKILL = '/agents/braindog/SKILL.md';
/** Where an MCP client connects: `servesMcp` in `apps/worker/src/route.ts`, with OAuth from AGT-3. */
export const MCP = 'https://brain.dog/mcp';
/** The changelog's Atom feed, prerendered beside the page. */
export const FEED = '/changelog.xml';

/**
 * The support address a person writes to. `decisions.md` item 14 (SIT-4, contracts §12.2 O12/X39) now
 * routes `support@brain.dog`: every reader (mail footers, Settings > About, `/support` here and
 * `security.txt`'s Contact) shows it, and this stays equal to the Worker's `SUPPORT_ADDRESS` in
 * `apps/worker/wrangler.jsonc`'s production environment, the one source for the app and the mail.
 */
export const SUPPORT_EMAIL = 'support@brain.dog';

/** The build instructions, which is what a self-hoster is actually sent to. */
export const BUILD: string | null = null;
/** The command line's install line, as `apps/cli/README.md` gives it. */
export const CLI_INSTALL = 'curl -fsSL https://brain.dog/cli/install.sh | sh';
