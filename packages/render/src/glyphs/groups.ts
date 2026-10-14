/**
 * `braindog-render/glyphs/groups`: every glyph name by the group the registry already keeps it in, and the names a
 * row's mark may use, for an agent and Slash to pick a mark from without guessing one the set does not draw.
 *
 * THE GROUPS ARE THE REGISTRY'S OWN, never a second list. `names.ts` builds `GLYPH_NAMES` from three layers: the
 * shell's own names (`APP`), the core's Lucide names drawn on every page (`core.ts`) and the rest of the set
 * (`set.ts`). This file reads them back from what is exported: the core is `CORE`'s keys, the shell's are the names
 * `SHELL` spells another way, and the set is every name left. A glyph added to `core.ts` or `set.ts` is a name of
 * `GLYPH_NAMES` by `names.ts`'s own `satisfies`, and so it is here, in its group, with no edit to this file.
 *
 * NO SET PATHS. `set.ts` stays behind `loadSet`'s dynamic import, for the reason `index.ts` gives: this file imports
 * the core, which the shell's entry already carries, and the set's names arrive through `names.ts`, which has none.
 *
 * A MARK IS WHAT `isMark` SAYS, so a control (a cross, a pencil, a chevron) is never offered, under any of its names.
 */

import { SHELL } from './aliases.ts';
import { CORE } from './core.ts';
import { GLYPH_NAMES, isMark } from './names.ts';

/** The registry's three layers, in the order an agent should reach for them: the core draws at once, the set loads. */
export const GLYPH_GROUPS = ['core', 'set', 'shell'] as const;

export type GlyphGroup = (typeof GLYPH_GROUPS)[number];

/** What each group is, in words, for the line the grammar says it on. */
export const GROUP_SAYS: Readonly<Record<GlyphGroup, string>> = {
  core: 'drawn at once on every page',
  set: 'the rest of the set, drawn once the page has fetched it',
  shell: "the app's own names, each another name for a core glyph",
};

const inCore = (name: string): boolean => Object.hasOwn(CORE, name);
const inShell = (name: string): boolean => Object.hasOwn(SHELL, name) && !inCore(name);

/** The group a registered name sits in. A name that is no glyph has none. */
export function groupOf(name: string): GlyphGroup | undefined {
  if (!GLYPH_NAMES.has(name)) return undefined;
  return inCore(name) ? 'core' : inShell(name) ? 'shell' : 'set';
}

const byGroup = (keep: (name: string) => boolean): Readonly<Record<GlyphGroup, readonly string[]>> => {
  const out: Record<GlyphGroup, string[]> = { core: [], set: [], shell: [] };
  /* The core in `core.ts`'s own order; the other two in the order `GLYPH_NAMES` holds them. */
  for (const name of Object.keys(CORE)) if (GLYPH_NAMES.has(name) && keep(name)) out.core.push(name);
  for (const name of GLYPH_NAMES) {
    const group = groupOf(name);
    if (group !== undefined && group !== 'core' && keep(name)) out[group].push(name);
  }
  return out;
};

/** Every glyph name by its group, the controls among them. */
export const glyphGroups = (): Readonly<Record<GlyphGroup, readonly string[]>> => byGroup(() => true);

/** The names a row's mark may use, by group: every glyph `isMark` passes, so no control. */
export const markGroups = (): Readonly<Record<GlyphGroup, readonly string[]>> => byGroup(isMark);

/** The names a row's mark may use, one list in the groups' order. */
export const markGlyphs = (): readonly string[] => {
  const groups = markGroups();
  return GLYPH_GROUPS.flatMap((group) => groups[group]);
};
