/**
 * Which installed look a person is drawn in, and the looks Appearance offers them.
 *
 * A RECORD MAY HOLD SEVERAL `theme` DECLARATIONS AND NOBODY CHOSE. With more than one installed, `boot` drew the
 * record's own (the one set from Appearance, with no pack behind it) and otherwise the first by id, so an add-on that
 * carried a look was a look nobody could put on. The pick is the person's `look.theme`: `house` is the house look on
 * purpose, an installed theme's id is that theme, and anything else (absent, or a theme since uninstalled) is the old
 * rule, so a record nobody has picked in draws exactly what it drew before.
 *
 * PURE, AND THE RECORD WIRES IT: `themeInstalled` reads `themeFor`, `setPref` reads `lookThemeFault`, and `boot`
 * answers `looksOf` beside `theme`. Nothing here reads a database or loads `@braindog/theme`.
 */

import type { Refusal } from '@braindog/ports';

/** The word for the house look, picked on purpose: no installed theme is drawn, whatever the record holds. */
export const LOOK_THEME_HOUSE = 'house';

/** A live `theme` declaration as `kernel.declarations()` answers it: `pack_id` null is the record's own. */
export type ThemeRow = { id: string; pack_id: string | null; body: string; checksum: string };

/** One look Appearance lists: its name, and whether it is the record's own or an add-on's (`pack` is that add-on). */
export type LookOffer = { id: string; name: string; from: 'own' | 'pack'; pack?: string };

/* FIRST BY ID, whatever order the rows came in, so the fallback is the same on every host and in every test. */
const byId = <T extends { id: string }>(rows: readonly T[]): T[] => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * The theme a person is drawn in, or `null` for the house look.
 *
 * `house` IS AN ANSWER, the house look on purpose. An installed theme's id is that theme. Anything else is today's
 * rule: the record's own first, since it is the owner's answer to how the record looks, then the first by id.
 */
export function themeFor<T extends ThemeRow>(themes: readonly T[], pick: string | undefined): T | null {
  if (pick === LOOK_THEME_HOUSE) return null;
  const sorted = byId(themes);
  const picked = pick === undefined ? undefined : sorted.find((t) => t.id === pick);
  return picked ?? sorted.find((t) => t.pack_id === null) ?? sorted[0] ?? null;
}

/**
 * Why a value cannot be a person's `look.theme`, or `null` when it can: `house`, or the id of a theme installed now.
 *
 * THE REFUSAL NAMES EVERY WORD IT TAKES, as the other `look.*` keys do, so the next send is one of them.
 */
export function lookThemeFault(value: unknown, ids: readonly string[]): Refusal | null {
  if (typeof value === 'string' && (value === LOOK_THEME_HOUSE || ids.includes(value))) return null;
  const allowed = [LOOK_THEME_HOUSE, ...byId(ids.map((id) => ({ id }))).map((t) => t.id)];
  return {
    code: 'VALUE_MALFORMED',
    fix: `look.theme is ${allowed.join(', ')}, or null to take it away.`,
    at: 'value',
    allowed,
  };
}

/* A LOOK'S NAME, from its own body when it says one, then the add-on's name the caller knows, then the add-on's slug
   in words ("night-shift" reads "Night shift"), so a person is never handed a bare id. */
const nameIn = (body: string): string | undefined => {
  try {
    const name = (JSON.parse(body) as { name?: unknown } | null)?.name;
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined;
  } catch {
    return undefined;
  }
};
const words = (slug: string): string => {
  const said = slug.split(/[-_.]+/u).filter(Boolean).join(' ');
  return said === '' ? slug : said[0]!.toUpperCase() + said.slice(1);
};

/**
 * The looks a record holds, in the order Appearance lists them: the record's own first, then each add-on's by id.
 * House and High contrast are the app's own and are not here. `packs` is each add-on's name by its id, when the caller
 * has them.
 */
export function looksOf(themes: readonly ThemeRow[], packs: Readonly<Record<string, string>> = {}): LookOffer[] {
  const sorted = byId(themes);
  const own = sorted.filter((t) => t.pack_id === null);
  const fromPacks = sorted.filter((t) => t.pack_id !== null);
  return [
    ...own.map((t): LookOffer => ({ id: t.id, name: nameIn(t.body) ?? 'Your own look', from: 'own' })),
    ...fromPacks.map((t): LookOffer => {
      const pack = t.pack_id as string;
      return { id: t.id, name: nameIn(t.body) ?? packs[pack] ?? words(pack), from: 'pack', pack };
    }),
  ];
}
