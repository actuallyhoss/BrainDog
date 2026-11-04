/**
 * The signed-in reads the app's first screens make: `boot` and what the root layout asks beside it, and the home page's
 * reads. ONE LIST, SO THE DEPLOY'S SMOKE AND THE APP CANNOT DRIFT.
 *
 * WHY IT EXISTS. His Usage broke on a commit whose deploy was green, because no step of a deploy opened a record. The
 * smoke (`apps/worker/scripts/smoke.mjs`) now asks a canary record every read in this list with its token, and a 500 on
 * any is red. A read the app's front door makes and this list lacks is a read a deploy can break unseen, so
 * `first-draw.test.ts` reads the route loaders and the home page's readers for the client methods they name, and goes
 * red on a name that is neither here nor in `AFTER_DRAW`.
 *
 * PLAIN DATA, NOTHING IMPORTED. The smoke loads this file with Node's own type stripping on the deploy runner, outside
 * the web build, so it may hold only erasable types and no `$lib` path.
 *
 * `/account/usage` IS NOT HERE. It is the account's door, answered for a browser session, and a record's token never
 * opens it; the smoke says so in its own line rather than asking it and calling the refusal a fault.
 */

/**
 * How the smoke names what a read is about, since a canary record is asked without knowing what it holds:
 *
 *   - `bare`: nothing; the read is asked as it stands.
 *   - `list`: one of the record's lists, the first `boot` names that holds rows (or the first at all).
 *   - `pack`: the first add-on `packs` answers as switched on.
 *   - `page`: the first page `pages` answers.
 *   - `row`: the first row `list` answered, by its list and number.
 *   - `body`: a page body of one table over the list `list` would name, which `today` and `previewPage` draw and never install.
 *   - `every`: every list the reader may read at once (`{ every: true }`), which `schemas` answers.
 */
export type FirstAsk = 'bare' | 'list' | 'pack' | 'page' | 'row' | 'body' | 'every';

/** One read of the first screens. `post` is the verb the client sends it with, which the test holds to the client. */
export interface FirstRead {
  readonly method: string;
  readonly ask: FirstAsk;
  readonly post: boolean;
  /** Which screen asks it, and when, in the words the smoke prints. */
  readonly by: string;
}

/** The reads, in the order a first draw makes them: what later ones are named from comes first. */
export const FIRST_DRAW: readonly FirstRead[] = [
  { method: 'boot', ask: 'bare', post: false, by: 'the root layout, before the first paint' },
  { method: 'version', ask: 'bare', post: false, by: "the root layout, on a host older than boot's slash" },
  { method: 'packs', ask: 'bare', post: false, by: "the root layout, for a record's currency and voice on an older host" },
  { method: 'pages', ask: 'bare', post: false, by: "Home, finding the record's own home page" },
  { method: 'schema', ask: 'list', post: false, by: "the root layout, reading a list's money fields" },
  { method: 'schemas', ask: 'every', post: false, by: "the root layout, every list's declaration asked beside boot" },
  { method: 'list', ask: 'list', post: false, by: "the root layout and Home, reading a list's rows" },
  { method: 'packConfig', ask: 'pack', post: false, by: "the root layout, reading a plugin's currency" },
  { method: 'page', ask: 'page', post: false, by: "Home, drawing the record's own home page" },
  { method: 'get', ask: 'row', post: false, by: 'Home, naming the agent run a block shows' },
  { method: 'today', ask: 'body', post: true, by: 'Home, drawing Today where no home page is declared' },
  { method: 'previewPage', ask: 'body', post: true, by: 'Home, drawing Today on a host older than `today`' },
  { method: 'whatsNew', ask: 'bare', post: false, by: 'Home, asking what is new before each read of its page' },
];

/**
 * Client methods the scanned files name that are not first-draw reads, each with why. A write is never one, and a read
 * made only after a person does something is not one either.
 */
export const AFTER_DRAW: Readonly<Record<string, string>> = {
  previewChange: 'Needs you, when a proposed change is opened, never the front door',
  engineHealth: "Home's engine line, asked only where Slash has a model behind it, and a refusal or an older host draws nothing",
  slashStatus: "Home's engine line, the month's spend beside the model's health, asked only where Slash has a model behind it",
  widgetSuggest: "Today's last cell, what Slash would add, asked apart once Today has drawn, and no offer draws nothing",
  sharedOut: "Today's one line about what is shared out, asked for an owner once Today has drawn, and nothing shared draws nothing",
};

/**
 * The files whose reads are the first screens', repo-relative under `apps/web/src`. Every route loader is read as
 * well, found by its name, so a loader added anywhere is held to this list without being named here.
 */
export const READERS: readonly string[] = [
  'lib/record/boot-live.ts',
  'lib/voice.svelte.ts',
  'lib/home/Home.svelte',
  'lib/home/today-read.ts',
  'lib/record/page-live.ts',
  'routes/decide/[id]/proposed.ts',
];

/**
 * The client methods a source file names: `client.list(`, `client.call<T>('previewPage'`, and the chained
 * `createClient({ ... }).version()` the root layout makes.
 */
export function methodsIn(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/\bclient\.(\w+)\s*(?:<[^()]*>)?\(/g)) if (m[1] !== 'call') found.add(m[1]!);
  for (const m of source.matchAll(/\.call\s*(?:<[^()]*>)?\(\s*'(\w+)'/g)) found.add(m[1]!);
  for (const m of source.matchAll(/createClient\(\{[^}]*\}\)\s*\.(\w+)\(/g)) found.add(m[1]!);
  return [...found].sort();
}
