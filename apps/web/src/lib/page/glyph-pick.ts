/**
 * The glyphs a tile may wear, by group, for the picker in the block editor (PGS-A19): pure, so the reading is tested
 * without a component, and `GlyphPicker.svelte` is runes and markup over it.
 *
 * THE GROUPS ARE THE RENDERER'S OWN, `glyphGroups` in `braindog-render`, each headed by its `GROUP_SAYS` line, never a
 * second list here. A typed word narrows them over each glyph's name and every alias that stands for it, so `invoice`
 * finds `receipt-text` and `cake` finds `gift`.
 *
 * ONLY A NAME AN `icon:` CAN BE WRITTEN AS. The kernel installs a block's icon when it is lower-case letters, digits and
 * dashes (`declare.ts`), so the shell's spellings with a capital (`arrowUp`) are never offered: each has a lower-case
 * name for the same glyph in the set.
 *
 * ONE PICTURE ONCE. The shell's group is the app's own names, each another name for a core glyph, so it would draw
 * the core's pictures a second time under other names. It is not drawn as a group: its names are aliases here, and
 * `home` typed in the field finds `house`.
 */

import { ALIASES } from 'braindog-render/glyphs';
import { GLYPH_NAMES } from 'braindog-render/glyphs/names';
import { GLYPH_GROUPS, GROUP_SAYS, glyphGroups, type GlyphGroup } from 'braindog-render';

/** The words the picker says. The icon field's own are in `BlockEditor.svelte`, which loads this file only to pick. */
export const GLYPH_WORDS = {
  find: 'Find an icon',
  findHint: 'rocket, money, calendar',
  picked: 'Chosen',
  all: 'Icons',
  nothing: (word: string): string => `No icon is called ${word}. Try a shorter word.`,
} as const;

/** One glyph as the picker draws it: its name, and the other words that stand for it. */
export type PickGlyph = { name: string; aka: readonly string[] };

/** The groups the picker draws, the renderer's order without the shell's (see above). */
export const PICK_GROUPS: readonly GlyphGroup[] = GLYPH_GROUPS.filter((g) => g !== 'shell');

/** One group as the picker draws it: its heading and its glyphs. */
export type PickGroup = { group: GlyphGroup; heading: string; glyphs: readonly PickGlyph[] };

const WRITABLE = /^[a-z][a-z0-9-]{0,31}$/u;

/* Every alias by the glyph it stands for, read once. */
let akaBy: ReadonlyMap<string, readonly string[]> | undefined;
const akaOf = (name: string): readonly string[] => {
  if (!akaBy) {
    const out = new Map<string, string[]>();
    for (const [word, glyph] of Object.entries(ALIASES)) {
      const held = out.get(glyph);
      if (held) held.push(word);
      else out.set(glyph, [word]);
    }
    akaBy = out;
  }
  return akaBy.get(name) ?? [];
};

/** A typed word as the names are spelled: lower case, its spaces as dashes. */
const asName = (query: string): string => query.trim().toLowerCase().replace(/\s+/gu, '-');

/** The heading a group is drawn under: the renderer's line, its first letter up. */
const headingOf = (group: GlyphGroup): string => {
  const says = GROUP_SAYS[group];
  return says.charAt(0).toUpperCase() + says.slice(1);
};

/**
 * The groups the picker draws for `query`: every group when it is empty, else the groups holding a glyph whose name or
 * one of whose aliases holds the word, each with only those glyphs. A glyph appears once, in the first group that
 * holds it.
 */
export function pickerGroups(query = ''): readonly PickGroup[] {
  const word = asName(query);
  const groups = glyphGroups();
  const seen = new Set<string>();
  const out: PickGroup[] = [];
  for (const group of PICK_GROUPS) {
    const glyphs: PickGlyph[] = [];
    for (const name of groups[group]) {
      if (!WRITABLE.test(name) || seen.has(name)) continue;
      seen.add(name);
      const aka = akaOf(name);
      if (word !== '' && !name.includes(word) && !aka.some((a) => a.toLowerCase().includes(word))) continue;
      glyphs.push({ name, aka });
    }
    if (glyphs.length > 0) out.push({ group, heading: headingOf(group), glyphs });
  }
  return out;
}

/** Every glyph the picker draws for `query`, one list in the groups' order, which is the order the arrow keys walk. */
export const pickerOrder = (groups: readonly PickGroup[]): readonly string[] => groups.flatMap((g) => g.glyphs.map((x) => x.name));

/** The renderer's names and then every alias not already one, in the order the kernel's copy keeps them. */
export const rendererGlyphList = (): readonly string[] => {
  const names = [...GLYPH_NAMES];
  const held = new Set(names);
  return [...names, ...Object.keys(ALIASES).filter((a) => !held.has(a))];
};

/**
 * Whether a copy of the list (the kernel's `GLYPH_LIST`, which may not import the renderer) holds the renderer's names
 * and aliases word for word and in order. Passed in, so the app's chunk never carries the kernel's copy.
 */
export function glyphListsAgree(copy: readonly string[]): boolean {
  const own = rendererGlyphList();
  return copy.length === own.length && copy.every((name, i) => name === own[i]);
}
