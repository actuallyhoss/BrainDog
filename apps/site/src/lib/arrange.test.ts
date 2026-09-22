/**
 * The drawn app on the home page, held to the application it is a drawing of.
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
type Row = { cells: readonly string[]; fields?: readonly (readonly [string, string])[] };
type List = { name: string; columns: readonly string[]; rows: readonly Row[] };
type Soon = { heading: string; list: string; rows: readonly number[] };
type Case = { id: string; label: string; glyph: string; holds: readonly string[]; tiles: readonly Tile[]; lists: readonly List[]; soon: Soon };

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
  /* The rail's own rows, and the three the drawn app adds around them: Decide under Home, Automations
     at the foot, and the back link on a row's page. */
  for (const name of new Set([...Object.values(RAIL), 'decide', 'refresh', 'back'] as const)) {
    const m = new RegExp(`^\\s+${name}: '([^']+)'`, 'm').exec(app);
    if (!m) wrong.push(`${name} is not in the app's icons.ts`);
    else if (m[1] !== PATHS[name]) wrong.push(`${name} differs from the app's path`);
  }
  assert.equal(wrong.length, 0, wrong.join('\n'));
});

/**
 * A LIST THAT OPENS IS ONE THE RAIL NAMES, AND EVERY ROW FILLS ITS COLUMNS.
 *
 * The rail makes a name a button only when `lists` has rows under that exact name, so a list named
 * anything else would be rows nobody can reach. A row with fewer cells than its list has columns
 * would draw a table with a hole in it and a row page with a field whose value is missing.
 */
test('every list the drawn app opens is on its rail, and every row fills its columns', async () => {
  const wrong: string[] = [];
  for (const c of await loadCases()) {
    for (const l of c.lists) {
      if (!c.holds.includes(l.name)) wrong.push(`the ${c.id} case opens a list called "${l.name}" that its rail does not name`);
      if (l.rows.length === 0) wrong.push(`the ${c.id} list "${l.name}" has no rows to draw`);
      for (const row of l.rows) {
        if (row.cells.length !== l.columns.length || row.cells.some((cell) => !cell.trim())) {
          wrong.push(`a row of the ${c.id} list "${l.name}" does not fill its ${l.columns.length} columns: ${row.cells.join(' | ')}`);
        }
      }
    }
  }
  assert.equal(wrong.length, 0, `the drawn app has lists it cannot draw:\n  - ${wrong.join('\n  - ')}`);
});

/**
 * HOME'S TABLE READS ROWS THAT ARE THERE.
 *
 * `soon` names a list and a handful of its rows by index. `Arrange.svelte` draws nothing for a list
 * it cannot find and skips an index with no row behind it, so either mistake would not fail loudly:
 * Home would quietly lose its table, or draw fewer rows than its heading promises, and the empty
 * page under three tiles is exactly what the first screenshot of this drawing showed.
 */
test('every case draws a table on Home, from rows its lists really have', async () => {
  const wrong: string[] = [];
  for (const c of await loadCases()) {
    const list = c.lists.find((l) => l.name === c.soon?.list);
    if (!c.soon?.heading.trim()) wrong.push(`the ${c.id} case has no heading over its Home table`);
    else if (!list) wrong.push(`the ${c.id} case's Home table reads "${c.soon.list}", which is not a list it opens`);
    else if (c.soon.rows.length === 0) wrong.push(`the ${c.id} case's Home table names no rows`);
    else for (const r of c.soon.rows) if (!list.rows[r]) wrong.push(`the ${c.id} case's Home table names row ${r} of ${list.name}, which has ${list.rows.length}`);
  }
  assert.equal(wrong.length, 0, `Home's table would draw short:\n  - ${wrong.join('\n  - ')}`);
});

/**
 * A STATE THE DRAWN APP SHOWS IS THE WORD THE RECORD SHOWS FOR IT.
 *
 * The rows are copied from the seed by hand, and a state is the one cell a hand gets wrong without
 * noticing, because the seed writes the value (`doing`, `review`) and the app draws its label. The
 * Team rail had `Doing`, `Open` and `Review` down its Tickets, and a team's record says `In
 * progress`, `To do` and `In review`: `labels` in `team.ts` renames all three. New project had its
 * one choice as `Open`, where `guide.ts` labels that value `To make`. Every column headed `State` is
 * read against the list's `state` field, with the use case's `labels` laid over the field's own the
 * way `apps/web/src/lib/voice.ts` `relabel` lays them, and a value with no label at all drawn as the
 * value in words.
 */
test('every state the drawn app shows is the label the record gives that value', { skip: existsSync(USECASES) ? false : 'packages/seed is not readable from here' }, async () => {
  type Field = { id: string; values?: readonly string[]; labels?: Readonly<Record<string, string>> };
  type Body = Record<string, unknown> & { fields?: readonly Field[] };
  type Seeded = { usecase: string; labels: Record<string, string>; pack: { declarations?: readonly Body[] } | null };
  const seed = (await import(new URL('index.ts', USECASES).href)) as { useCase: (id: string) => Seeded | undefined };
  const share = (await import(new URL('share.ts', USECASES).href)) as { modulesToInstall: (u: Seeded) => readonly string[] };
  const packs = (await import(new URL('../packs/first-party.ts', USECASES).href)) as {
    firstPartyDocument: (id: string) => { declarations: readonly Body[] };
  };
  const words = (v: string): string => (v.charAt(0).toUpperCase() + v.slice(1)).replaceAll('_', ' ');

  const wrong: string[] = [];
  let read = 0;
  for (const c of await loadCases()) {
    const u = seed.useCase(c.id);
    if (!u) continue;
    const registers = [...share.modulesToInstall(u).flatMap((id) => packs.firstPartyDocument(id).declarations), ...(u.pack?.declarations ?? [])].filter(
      (d) => typeof d.register === 'string' && d.page === undefined && d.rule === undefined,
    );
    for (const l of c.lists) {
      const at = l.columns.indexOf('State');
      if (at < 0) continue;
      const d = registers.findLast((r) => (u.labels[r.register as string] ?? r.name ?? r.register) === l.name);
      const field = d?.fields?.find((f) => f.id === 'state');
      if (!d || !field?.values) {
        wrong.push(`the ${c.id} list "${l.name}" has a State column and the seed has no list by that name with a state field`);
        continue;
      }
      const said = new Set(field.values.map((v) => u.labels[`${String(d.register)}.state.${v}`] ?? field.labels?.[v] ?? words(v)));
      for (const row of l.rows) {
        read++;
        const cell = row.cells[at] ?? '';
        if (!said.has(cell)) wrong.push(`the ${c.id} list "${l.name}" draws "${row.cells[0]}" as "${cell}", and the record says one of: ${[...said].join(', ')}`);
      }
    }
  }
  assert.ok(read > 0, 'no drawn list has a State column, so this check read nothing');
  assert.equal(wrong.length, 0, `the drawn app says a state the app never would:\n  - ${wrong.join('\n  - ')}`);
});
