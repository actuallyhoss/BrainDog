/**
 * A pack's theme, checked where the pack comes in: at plan and at install (`45 §5.6`).
 *
 * THE KERNEL CHECKS A THEME'S SHAPE AND STOPS THERE, ON PURPOSE. `themeBody` in `kernel/src/declare.ts` answers what a
 * parser can (a colour outside the grammar, an alpha, a grey seed) and says the palette checks belong in the pass that
 * calls `build`. Nothing called it: a pack whose theme set `faint` on the ground planned and installed `ok` on both
 * hosts (`loop/research-hardening.md` §2.4). `@braindog/theme` is the one solver, and `31 §2`'s boundary table has
 * `record` orchestrate it beside `declare`, because neither of those two may import the other.
 *
 * EVERY DOOR A PACK COMES IN BY READS THROUGH `normaliseChecked`: `planPack`, `installPack`, `setDeclaration` (one
 * declaration set from the app, wrapped as a pack), the arranger's `packOf` and the use-case planner. A palette refused
 * at one door and admitted at another is a theme that is not portable, which is the reason `28 §4.5` gives for a floor
 * refusing rather than correcting, so every door reads this one function and answers in the same words.
 *
 * WHAT IS CHECKED IS WHAT WOULD BE DRAWN. The palette is solved from the declaration's seed under the house profile and
 * the high-contrast one, its `roles` overrides are laid over each solved palette, and `checkScheme` runs on both schemes
 * of both, with `checkElevation` after. The first refusal answers, with the finding's own code and its `at`
 * (`theme.<id>.roles.<scheme>.<role>`, `39 §6.2`). Check L is not run, for the reason `@braindog/theme`'s `record.ts`
 * gives: a theme is one `@layer theme` block and cannot reach the forced-colours boundary, which the document holds.
 */

import type { Refusal, Result } from '@braindog/ports';
import { normalise, type Pack, type PackSource } from '@braindog/declare';
import type { Built, Finding, Role, Scheme, Seed } from '@braindog/theme';

/**
 * THE THEME PACKAGE IS LOADED WHEN A THEME ARRIVES, NOT WHEN THE RECORD OPENS. Its `index.ts` solves the shipped
 * palettes (`HOUSE`, `HIGH_CONTRAST` and the alpha pair) as it loads, and the record is opened on every cold start of
 * both hosts while no shipped pack carries a theme. So nothing here imports it at the top: the first pack that declares
 * a theme pays for the load, and every later one finds it in the module cache.
 */
type Theme = typeof import('@braindog/theme');
const load = (): Promise<Theme> => import('@braindog/theme');

const SCHEMES: readonly Scheme[] = ['dark', 'light'];

/**
 * THE MOST `theme` DECLARATIONS ONE PACK MAY CARRY, because each is solved twice (once per profile) and a solve is the
 * generator's whole search. The planner reads a document an agent's proposal carries, so without a ceiling the work a
 * plan does is whatever the file asks for. A record is drawn in one theme at a time, so a pack offering a few looks fits
 * under it and a pack of many is several packs.
 */
const THEMES_PER_PACK = 4;

/** One override as it will ship, and the chroma the gamut took off the colour the author wrote. */
type Override = { hex: string; lost: number };

/** The two palettes a theme is drawn in, each with the declaration's overrides laid over it. */
export type ThemeBuilt = { house: Built; contrast: Built };

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * `declare`'s `normalise`, and then every `theme` declaration in the pack checked as it would be drawn.
 *
 * THE SAME SIGNATURE AS `normalise`, so a door changes one name and nothing else, and a door that forgets to change it
 * is visible by the name it still calls.
 */
export async function normaliseChecked(doc: unknown, source: PackSource = { kind: 'local' }): Promise<Result<Pack>> {
  const pack = await normalise(doc, source);
  if (!pack.ok) return pack;
  const fault = await themeFault(pack.value);
  return fault === null ? pack : { ok: false, refusal: fault };
}

/**
 * The first refusal any `theme` declaration in an already normalised pack earns, or `null`.
 *
 * FOR THE ONE DOOR THAT IS HANDED A PACK RATHER THAN A DOCUMENT: a shared use-case file is normalised inside `declare`'s
 * `readShared`, so the planner that reads one asks this of the pack it gets back.
 */
export async function themeFault(pack: Pack): Promise<Refusal | null> {
  const themes = pack.declarations.filter((decl) => decl.kind === 'theme').length;
  if (themes > THEMES_PER_PACK)
    return {
      code: 'PACK_MALFORMED',
      fix: `${pack.manifest.pack} declares ${themes} themes, and a pack declares at most ${THEMES_PER_PACK}. A record is drawn in one; ship the others as packs of their own.`,
      at: 'declarations',
    };
  for (const decl of pack.declarations) {
    if (decl.kind !== 'theme') continue;
    const solved = await solve(decl.id, decl.body);
    if (solved === null) continue;
    if (!solved.ok) return 'refusal' in solved ? solved.refusal : null;
    const theme = await load();
    for (const [built, high] of [
      [solved.value.house, false],
      [solved.value.contrast, true],
    ] as const) {
      const found = [...SCHEMES.flatMap((scheme) => theme.checkScheme(built, scheme)), ...theme.checkElevation(built)];
      const first = theme.refusals(found)[0];
      if (first) return refusalOf(first, high);
    }
  }
  return null;
}

/**
 * An installed `theme` declaration built into the two palettes it is drawn in, the build `themeFault` checks.
 *
 * `null` WHEN IT CANNOT BE BUILT: a body the kernel's `themeBody` refuses, or a seed the generator refuses. A
 * declaration that reached the record passed both, so a caller drawing one meets `null` only for a row written before
 * this check existed, and draws the house theme for it.
 */
export async function themeBuilt(id: string, body: unknown): Promise<ThemeBuilt | null> {
  const solved = await solve(id, body);
  return solved !== null && solved.ok ? solved.value : null;
}

/**
 * The declaration's seed and overrides, solved, or the refusal the generator gave, or `null`.
 *
 * `null` IS A BODY THIS PASS DOES NOT ANSWER FOR: a seed or a role that is not a colour the dialect reads, a key under
 * `roles` that is not a scheme, a `{{config:<key>}}` not filled yet. Each of those is the kernel's `themeBody`, which
 * refuses it at install at its own path and in its own words; a second sentence for the same fault here would be two
 * answers about one line of a pack.
 */
async function solve(id: string, body: unknown): Promise<Result<ThemeBuilt> | null> {
  if (!isMap(body) || !isMap(body.seed)) return null;
  const accent = body.seed.accent;
  if (typeof accent !== 'string') return null;
  /* `from-accent` WHEN IT IS NOT SAID, which is `39 §4.1`: "neutralHue = accent hue unless `neutral_hue` was a
     number". */
  const hue = body.seed.neutral_hue;
  let neutralHue: Seed['neutralHue'];
  if (hue === undefined || hue === 'from-accent') neutralHue = 'from-accent';
  else if (typeof hue === 'number' && Number.isInteger(hue) && hue >= 0 && hue <= 360) neutralHue = hue;
  else return null;

  const theme = await load();
  try {
    theme.parseColour(accent);
  } catch {
    return null;
  }

  /* THE SCALE IS THE HOUSE'S, AND NOTHING CHECKED HERE READS IT. `extends: house` inherits the house seed's scale
     (`39 §4.1`), and spacing, radii and density reach no colour, so the solved roles are the same whatever the body's
     `scale` says. The kernel checks the scale's shape. */
  const name = id.startsWith('theme.') ? id.slice('theme.'.length) : id;
  const from: Seed = { ...theme.HOUSE_SEED, accent, neutralHue };
  let house: Built;
  let contrast: Built;
  try {
    house = theme.build(from, theme.HOUSE_PROFILE, name);
    contrast = theme.build(from, theme.HIGH_CONTRAST_PROFILE, name);
  } catch (e) {
    return { ok: false, refusal: thrown(id, e instanceof Error ? e.message : String(e)) };
  }

  const over: Record<Scheme, Map<Role, Override>> = { dark: new Map(), light: new Map() };
  const roles = body.roles;
  if (roles !== undefined) {
    if (!isMap(roles)) return null;
    for (const [scheme, map] of Object.entries(roles)) {
      if ((scheme !== 'dark' && scheme !== 'light') || !isMap(map)) return null;
      for (const [role, value] of Object.entries(map)) {
        if (typeof value !== 'string') return null;
        /**
         * A ROLE THE PALETTE DOES NOT HAVE IS REFUSED HERE, because nothing else can. The kernel leaves the names to
         * the package that owns them (`themeBody`: its own list was stale in one of two places), and laid over a palette
         * that has no such role an override would install and paint nothing, which is a change that says it happened
         * and did not.
         */
        if (!Object.hasOwn(house.schemes[scheme], role))
          return {
            ok: false,
            refusal: {
              code: 'THEME_VALUE_INVALID',
              fix: `${role} is not a role a theme can set. Name one of the roles the palette has, such as ink, bg or accent.`,
              at: `${id}.roles.${scheme}.${role}`,
              allowed: Object.keys(house.schemes[scheme]),
            },
          };
        let hex: string;
        try {
          hex = theme.toHex(theme.parseColour(value));
        } catch {
          return null;
        }
        over[scheme].set(role as Role, { hex, lost: lostOf(theme, value) });
      }
    }
  }
  return { ok: true, value: { house: laid(house, over), contrast: laid(contrast, over) } };
}

/**
 * A solved palette with the author's overrides laid over it, and the gamut's cost of each override recorded where
 * check J reads it.
 *
 * `clipped` IS REWRITTEN FOR AN OVERRIDDEN ROLE, not kept. It holds what the gamut took off the role the generator
 * solved, and the override replaced that colour, so the old figure would have been check J measuring a colour that is
 * no longer in the palette.
 */
function laid(built: Built, over: Record<Scheme, Map<Role, Override>>): Built {
  const schemes = { dark: { ...built.schemes.dark }, light: { ...built.schemes.light } };
  const clipped = { dark: { ...built.clipped.dark }, light: { ...built.clipped.light } };
  for (const scheme of SCHEMES)
    for (const [role, o] of over[scheme]) {
      schemes[scheme][role] = o.hex;
      if (o.lost > 0) clipped[scheme][role] = o.lost;
      else delete clipped[scheme][role];
    }
  return { ...built, schemes, clipped };
}

/**
 * The chroma the gamut mapper takes off an override, by `@braindog/theme`'s own measure.
 *
 * ONLY AN `oklch(L C H)` CAN LOSE ANY. A hex is inside sRGB by construction, so it ships as written. The numbers are
 * read after `parseColour` has accepted the value, so the three are there and are numbers.
 */
function lostOf(theme: Theme, value: string): number {
  const said = value.trim();
  if (!said.toLowerCase().startsWith('oklch')) return 0;
  const [L, C, H] = said
    .slice(said.indexOf('(') + 1, said.lastIndexOf(')'))
    .trim()
    .split(/\s+/u)
    .map(Number);
  if (L === undefined || C === undefined || H === undefined) return 0;
  return theme.clipped({ L, C, H });
}

/**
 * A finding as the refusal a door answers with.
 *
 * THE FINDING'S OWN SENTENCE, without the `theme: ` its author wrote for a theme editor's log. In the high-contrast
 * palette it says so first, because the floors there are higher and a sentence asking 16:1 of an ink with no word of
 * why reads as a mistake.
 */
function refusalOf(f: Finding, highContrast: boolean): Refusal {
  const said = bare(f.fix ?? `check ${f.check} failed in ${f.scheme}.`);
  return {
    /* EVERY REFUSING FINDING IN `checks.ts` CARRIES A CODE; `Finding.code` is optional for the passes and warnings, and
       this default is only what the type asks for. */
    code: f.code ?? 'THEME_VALUE_INVALID',
    fix: highContrast ? `In high contrast, ${said}` : upper(said),
    ...(f.at === undefined ? {} : { at: f.at }),
  };
}

/**
 * What the generator threw, as a refusal.
 *
 * `build` THROWS FOR TWO THINGS A SEED CAN DO: be almost grey (its `normalise`, whose floor is stricter than the
 * kernel's `achromatic`, which catches a hex only when its three channels are equal) and leave no separable set of
 * intents on the search grid (`INTENT_INSEPARABLE: ...`). A message led by a code keeps that code; any other is the
 * seed's value refused. Both point at the seed, which is the only thing in the declaration either can be repaired by.
 */
function thrown(id: string, message: string): Refusal {
  const led = /^([A-Z][A-Z_]+): ([\s\S]+)$/u.exec(message);
  const code = led && CODES.has(led[1]!) ? led[1]! : 'THEME_VALUE_INVALID';
  const said = led && CODES.has(led[1]!) ? led[2]! : message;
  return { code, fix: upper(bare(said)), at: code === 'THEME_VALUE_INVALID' ? `${id}.seed.accent` : `${id}.seed` };
}

/** The codes a finding carries (`Finding.code`), which are the only ones a thrown message may lead with. */
const CODES = new Set(['CONTRAST_FLOOR', 'INTENT_INSEPARABLE', 'THEME_LADDER_ORDER', 'THEME_VALUE_INVALID']);

const PREFIX = 'theme: ';
const bare = (s: string): string => (s.startsWith(PREFIX) ? s.slice(PREFIX.length) : s);
const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
