/**
 * `braindog-render/glyphs`: the glyph set as data, for the app, the site and both renderers alike.
 *
 * THIS ENTRY IMPORTS `core.ts` AND NOTHING ELSE WITH PATHS IN IT. The set arrives through `loadSet`, a
 * dynamic import, so a bundler splits it into its own chunk and the shell's entry carries only the
 * glyphs the shell draws (research-modules §1.3). A static re-export of `SET` from here would undo that
 * silently: every file would still typecheck and the entry chunk would carry all 251.
 *
 * Path data from Lucide, ISC License; see `NOTICE` beside this file.
 */

export { CORE } from './core.ts';
export type { CoreGlyph } from './core.ts';
export type { SetGlyph } from './set.ts';
export { ALIASES, SHELL, SPELLINGS, canonical } from './aliases.ts';

/** The rest of the set, fetched the first time a document names a glyph the core does not hold. */
export function loadSet(): Promise<Readonly<Record<string, string>>> {
  return import('./set.ts').then((m) => m.SET);
}
