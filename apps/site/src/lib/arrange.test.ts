/**
 * The miniature band 0001 draws, held to the application it is a miniature of.
 *
 * THE SWITCHER USED TO BE A LIST OF NAMES BESIDE GREY SQUARES, and `Arrange.svelte` said why at its
 * `.mark` rule: there was no glyph to draw for a row that was only a name. There is one. Every page
 * and list the rail names is declared in `packages/seed` with an `icon:`, and the app's rail draws
 * that icon beside it. So the drawing now draws the same one, and these checks are what stop it
 * drawing a plausible one instead. A glyph picked by eye would look right and be wrong in a way no
 * reader could report, because the reader has not yet seen the app it is wrong about.
 *
 * IT SITS IN `src/lib` BESIDE `claims.test.ts` FOR THE SAME REASON THAT FILE GIVES: `test/` belongs
 * to another agent, and the package's `test` script globs `test/*.test.ts` only. Run it as
 * `node --test --experimental-strip-types "apps/site/src/lib/*.test.ts"`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { PATHS } from './icons.ts';
import { RAIL } from './rail.ts';

const REPO = new URL('../../../../', import.meta.url);
const USECASES = new URL('packages/seed/src/usecases/', REPO);
const APP_ICONS = new URL('apps/web/src/lib/ui/icons.ts', REPO);

/** What this file reads out of `copy.ts`, written out so a change of shape fails at the cast. */
type Tile = { title: string; value: string; note?: string };
type Case = { id: string; label: string; glyph: string; holds: readonly string[]; tiles: readonly Tile[] };

const loadCases = async (): Promise<readonly Case[]> => {
  const { site } = (await import('./copy.ts')) as unknown as { site: { arrange: { cases: readonly Case[] } } };
  return site.arrange.cases;
};

const known = (name: string): boolean => Object.hasOwn(PATHS, name);

test('every case names a glyph the site can draw and two or three tiles to draw on its page', async () => {
  const wrong: string[] = [];
  for (const c of await loadCases()) {
    if (typeof c.glyph !== 'string' || !known(c.glyph)) {
      wrong.push(`the ${c.id} case names the glyph ${JSON.stringify(c.glyph)}, and icons.ts draws no glyph by that name`);
    }
    const tiles = Array.isArray(c.tiles) ? c.tiles : [];
    if (tiles.length < 2 || tiles.length > 3) {
      wrong.push(`the ${c.id} case has ${tiles.length} tiles; the miniature is laid out for two or three`);
    }
    for (const t of tiles) {
      if (!t.title?.trim() || !t.value?.trim()) wrong.push(`a tile in the ${c.id} case has an empty title or value`);
    }
  }
  assert.equal(wrong.length, 0, `copy.ts does not give the miniature what it draws:\n  - ${wrong.join('\n  - ')}`);
});

/**
 * THE RAIL'S GLYPHS ARE THE SEED'S, name for name, per use case.
 *
 * `RAIL` is one map for all five cases, which is only right while no name means two different
 * pages. `Projects` is in Personal and in Solo founder and is `thing` in both; the check below
 * reads each case against its own setup, so the day a name drifts apart the map goes red rather
 * than drawing one case's glyph in the other.
 *
 * WHAT COUNTS AS A NAME'S ICON is the same set `test/content.test.ts` counts as shipped: the use
 * case's Home page, the pages and lists its own pack declares, and every page and list of each
 * first-party module it installs, with list names put through that use case's `labels`.
 */
test('every row the rail draws carries the icon the seed declares for it', { skip: existsSync(USECASES) ? false : 'packages/seed is not readable from here' }, async () => {
  type Body = Record<string, unknown>;
  type Seeded = { usecase: string; labels: Record<string, string>; pack: { declarations?: readonly Body[] } | null };
  const seed = (await import(new URL('index.ts', USECASES).href)) as { useCase: (id: string) => Seeded | undefined };
  const share = (await import(new URL('share.ts', USECASES).href)) as { modulesToInstall: (u: Seeded) => readonly string[] };
  const packs = (await import(new URL('../packs/first-party.ts', USECASES).href)) as {
    firstPartyDocument: (id: string) => { declarations: readonly Body[] };
  };

  const iconsOf = (u: Seeded): Map<string, string> => {
    const icons = new Map<string, string>();
    const take = (d: Body): void => {
      if (typeof d.icon !== 'string') return;
      const register = typeof d.register === 'string' ? d.register : null;
      if (register !== null && d.page === undefined && d.rule === undefined) {
        icons.set(u.labels[register] ?? (typeof d.name === 'string' ? d.name : register), d.icon);
      }
      if (typeof d.page === 'string' && d.for === undefined && typeof d.title === 'string') icons.set(d.title, d.icon);
    };
    for (const id of share.modulesToInstall(u)) packs.firstPartyDocument(id).declarations.forEach(take);
    /* The use case's own pack goes last, because it is what the app draws when both declare a name. */
    (u.pack?.declarations ?? []).forEach(take);
    return icons;
  };

  const wrong: string[] = [];
  for (const c of await loadCases()) {
    const u = seed.useCase(c.id);
    if (!u) {
      wrong.push(`the seed declares no use case called "${c.id}"`);
      continue;
    }
    const icons = iconsOf(u);
    for (const name of c.holds) {
      const drawn = RAIL[name];
      const declared = icons.get(name);
      if (drawn === undefined) wrong.push(`the ${c.id} rail names "${name}" and rail.ts gives it no glyph`);
      else if (drawn !== declared) wrong.push(`the ${c.id} rail draws "${name}" as ${drawn}, and the seed declares ${declared ?? 'no icon'}`);
    }
  }
  assert.equal(wrong.length, 0, `${wrong.length} row(s) of the drawn rail are not the app's:\n  - ${wrong.join('\n  - ')}`);
});

/**
 * A GLYPH THE RAIL SHARES WITH THE APP IS THE APP'S PATH, byte for byte. `icons.ts` says its glyphs
 * are copied and not redrawn; this is the check that makes that sentence true rather than hoped.
 */
test('every glyph the rail draws is the path the app draws under that name', { skip: existsSync(APP_ICONS) ? false : 'apps/web is not readable from here' }, () => {
  const app = readFileSync(APP_ICONS, 'utf8');
  const wrong: string[] = [];
  for (const name of new Set(Object.values(RAIL))) {
    const m = new RegExp(`^\\s+${name}: '([^']+)'`, 'm').exec(app);
    if (!m) wrong.push(`${name} is not in the app's icons.ts`);
    else if (m[1] !== PATHS[name]) wrong.push(`${name} differs from the app's path`);
  }
  assert.equal(wrong.length, 0, wrong.join('\n'));
});
