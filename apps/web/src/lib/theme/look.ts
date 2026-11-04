/**
 * The look editor's arithmetic (`21 §6`): a draft, the palettes it draws, the three ways a colour is changed,
 * and the contrast gate that says in words whether everybody can still read it.
 *
 * ONE SOLVER, THE RECORD'S. Every palette here is `@braindog/theme`'s `build`, under the house profile and the
 * high-contrast one, with the draft's changed colours laid over each, which is exactly what the record's install check
 * (`packages/record/src/theme-check.ts`) solves and checks. A look the gate here passes is a look the install passes,
 * because the gate ends by running the same `checkScheme` and `checkElevation` on the same two palettes.
 *
 * A CHANGE IS AN OVERRIDE AND NOTHING ELSE. The seed stays what the editor opened with, so the generator's search runs
 * once per session and not once per press, and a draft saved with two colours changed is a declaration with two roles
 * under `roles`, which is the smallest thing that says what the person did.
 *
 * PLAIN NODE LOADS THIS FILE: no runes, no `$lib`, relative `.ts` imports only.
 */

import {
  build,
  checkElevation,
  checkScheme,
  contrast,
  fromHex,
  gamutMap,
  HIGH_CONTRAST_PROFILE,
  HOUSE_PROFILE,
  HOUSE_SEED,
  inGamut,
  INKS,
  INTENT_TEXT,
  INTENTS,
  lchToRgb,
  refusals,
  relLuminance,
  rgbToCielab,
  rgbToLch,
  SURFACES,
  toHex,
  type Built,
  type Finding,
  type Lch,
  type Profile,
  type Role,
  type Scheme,
  type Seed,
} from '@braindog/theme';

import type { Look } from './draw.ts';

export type { Role, Scheme };

export const SCHEMES: readonly Scheme[] = ['light', 'dark'];

/** Each meaning as it is read: for red that is its words, `danger-text`, while `danger` is the dot and the badge. */
const WORDS = INTENTS.map((k) => INTENT_TEXT[k]);

const FILLS = ['earn-fill', 'warn-fill', 'danger-fill', 'info-fill'] as const satisfies readonly Role[];

/** Every colour the editor lists, in the order a person meets them: the grounds, the text, the lines, the meanings, the accent. */
export const ROLES: readonly Role[] = [
  ...SURFACES,
  ...INKS,
  'line',
  'edge',
  ...INTENTS,
  'danger-text',
  ...FILLS,
  'accent',
  'accent-edge',
  'accent-hover',
  'accent-press',
  'accent-text',
  'accent-ink',
  'focus-in',
  'focus-out',
];

export type Corners = 'square' | 'soft' | 'round';
export type Density = 'compact' | 'comfortable' | 'roomy';

/**
 * The three corner sets, in pixels, for `scale.radius`. SOFT IS THE HOUSE'S OWN (`HOUSE_SEED.radius`), so a person who
 * never touches Corners saves the corners the product already has.
 */
export const CORNERS: Record<Corners, { sm: number; md: number; lg: number }> = {
  square: { sm: 2, md: 3, lg: 4 },
  soft: { sm: HOUSE_SEED.radius.sm, md: HOUSE_SEED.radius.md, lg: HOUSE_SEED.radius.lg },
  round: { sm: 10, md: 14, lg: 20 },
};

/**
 * `tokens.css`'s row heights by density, for the specimen, which draws the rows the saved look will draw.
 *
 * THE TOKENS ARE 36, 44 AND 52 (`--row-h` on `:root` and under `data-density`), and this said 32, 36 and 44, so a look
 * saved at Comfortable drew every row 8 pixels shorter than the house does, and the specimen showed rows nobody else
 * saw. `look.test.ts` holds the two equal by reading `tokens.css`.
 */
export const ROW_H: Record<Density, number> = { compact: 36, comfortable: 44, roomy: 52 };

/**
 * The density a saved row height is nearest to. A look saved before `ROW_H` met the tokens holds 32, 36 or 44, and is
 * read by the height it draws, so saving it again changes no row by more than the 4 pixels 32 moves.
 */
export function densityOf(row: number | null): Density {
  if (row === null) return 'comfortable';
  if (row < (ROW_H.compact + ROW_H.comfortable) / 2) return 'compact';
  if (row > (ROW_H.comfortable + ROW_H.roomy) / 2) return 'roomy';
  return 'comfortable';
}

export type Draft = {
  /** The seed's accent: a colour code or an `oklch(...)`, as the declaration will carry it. */
  accent: string;
  neutralHue: Seed['neutralHue'];
  /** The colours the person changed, per scheme. Everything else is the solve's. */
  roles: Record<Scheme, Partial<Record<Role, string>>>;
  corners: Corners;
  density: Density;
};

/** The two palettes a seed solves to before anything is laid over them. */
export type Base = { house: Built; contrast: Built };

/** A draft drawn: the two palettes with the changes laid over each. */
export type Drawn = { house: Built; contrast: Built };

const HEX = /^#?([0-9A-Fa-f]{6})$/u;

/** A colour code as a person typed it, as the record stores it, or `null` when it is not one. */
export function hexOf(typed: string): string | null {
  const m = HEX.exec(typed.trim());
  return m ? `#${m[1]!.toUpperCase()}` : null;
}

/**
 * The palettes a seed solves to, or `null` when the generator refuses the seed.
 *
 * `build` THROWS for a seed that is almost grey and for one that leaves no separable set of meanings, and a throw is
 * not how a screen answers, so it is caught and said as `lookNoHue` by the caller.
 */
export function baseOf(accent: string, neutralHue: Seed['neutralHue']): Base | null {
  const seed: Seed = { ...HOUSE_SEED, accent, neutralHue };
  try {
    return { house: build(seed, HOUSE_PROFILE, 'own'), contrast: build(seed, HIGH_CONTRAST_PROFILE, 'own') };
  } catch {
    return null;
  }
}

/**
 * One palette with the draft's changes laid over it, as `theme-check.ts`'s `laid` does.
 *
 * A CHANGED ROLE LOSES ITS `clipped` FIGURE, because a colour code is inside sRGB by construction and the figure
 * measured a colour that is no longer in the palette.
 */
function laid(built: Built, roles: Draft['roles']): Built {
  const schemes = { light: { ...built.schemes.light }, dark: { ...built.schemes.dark } };
  const clipped = { light: { ...built.clipped.light }, dark: { ...built.clipped.dark } };
  for (const scheme of SCHEMES)
    for (const [role, hex] of Object.entries(roles[scheme]) as [Role, string][]) {
      schemes[scheme][role] = hex;
      delete clipped[scheme][role];
    }
  return { ...built, schemes, clipped };
}

export const drawOf = (base: Base, draft: Draft): Drawn => ({ house: laid(base.house, draft.roles), contrast: laid(base.contrast, draft.roles) });

/**
 * The look a draft draws, in `Boot.theme`'s shape, so a save can be drawn at once without waiting for the next `boot`.
 *
 * BY THE NAMES THE PAGE PAINTS WITH (SPEC 1.10): the solved frame over the solver's own roles, so the record's red fill
 * reaches every button, and the corners as the three radii a look moves (`--r-xs`, `--r-pop`, `--r-tile`). The solver's
 * roles travel too, because `draftFrom` re-seeds from the light `accent`; nothing paints with them.
 */
export function lookFrom(drawn: Drawn, draft: Draft): Look {
  const r = CORNERS[draft.corners];
  const scale = { 'r-xs': `${r.sm}px`, 'r-pop': `${r.md}px`, 'r-tile': `${r.lg}px`, 'row-h': `${ROW_H[draft.density]}px` };
  return {
    light: { ...drawn.house.schemes.light, ...drawn.house.frame.light, ...scale },
    dark: { ...drawn.house.schemes.dark, ...drawn.house.frame.dark, ...scale },
  };
}

/* ── The three ways to change a colour ───────────────────────────────────── */

export type Nudge = 'darker' | 'lighter' | 'duller' | 'richer' | 'warmer' | 'cooler';
export const NUDGES: readonly Nudge[] = ['darker', 'lighter', 'duller', 'richer', 'warmer', 'cooler'];

/**
 * The hues a Warmer and a Cooler press walk toward: an orange and a blue. WORDS AND NOT DEGREES, because a person
 * knows which of two colours is warmer and nobody knows what 40 degrees of hue is.
 */
const WARM = 50;
const COOL = 240;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** One step of hue toward a target, the short way round the wheel. */
function toward(h: number, target: number, step: number): number {
  const gap = ((target - h + 540) % 360) - 180;
  if (Math.abs(gap) <= step) return target;
  return (h + Math.sign(gap) * step + 360) % 360;
}

const hexFrom = (c: Lch): string => toHex(lchToRgb(gamutMap(c)));

/**
 * A colour nudged one step, and still a colour a screen can show.
 *
 * THE STEP IS SMALL ON PURPOSE: a press should be visible and never a different colour, and six presses should be a
 * decision. Richer can ask for a chroma no screen shows, and the gamut mapper takes it back to the most there is.
 */
export function nudge(hex: string, how: Nudge): string {
  const c = rgbToLch(fromHex(hex));
  const next: Lch = { ...c };
  if (how === 'darker') next.L = clamp(c.L - 0.03, 0, 1);
  else if (how === 'lighter') next.L = clamp(c.L + 0.03, 0, 1);
  else if (how === 'duller') next.C = Math.max(0, c.C * 0.8 - 0.004);
  else if (how === 'richer') next.C = c.C * 1.2 + 0.01;
  else next.H = toward(c.H, how === 'warmer' ? WARM : COOL, 10);
  return hexFrom(next);
}

/**
 * The Pick grid's rows, lightest first, and its columns, dullest first. SEVEN ACROSS because seven cells of 44 pixels
 * and their gaps fit a 390 screen inside its gutters, and an eighth made the row scroll sideways.
 */
const GRID_L = [0.95, 0.87, 0.79, 0.71, 0.63, 0.55, 0.47, 0.39, 0.31, 0.22];
const GRID_C = [0, 0.04, 0.08, 0.12, 0.16, 0.2, 0.25];

export type Cell = { row: number; col: number; hex: string } | null;

/**
 * The OKLCH grid at a colour's hue: lightness down, richness across, and `null` where the colour is outside what a
 * screen can show. ABSENT AND NOT CLIPPED, because a clipped cell paints the same as its neighbour and offers a choice
 * that is not one.
 */
export function gridOf(hex: string): Cell[][] {
  const H = rgbToLch(fromHex(hex)).H;
  return GRID_L.map((L, row) => GRID_C.map((C, col) => (inGamut(lchToRgb({ L, C, H })) ? { row, col, hex: hexFrom({ L, C, H }) } : null)));
}

export const GRID_ROWS = GRID_L.length;
export const GRID_COLS = GRID_C.length;

/* ── The gate ─────────────────────────────────────────────────────────────── */

export type Verdict = 'fails' | 'tight' | 'fine';

/** How far over its floor a pair must be to be Fine rather than Tight: one reader's worse screen, roughly. */
const TIGHT = 1.1;

export type Pair = {
  kind: 'contrast' | 'grey';
  scheme: Scheme;
  /** Whether the pair was read in the high-contrast palette, which has higher floors. */
  more: boolean;
  role: Role;
  ground: Role;
  verdict: Verdict;
  /** How the pair reads against its floor, 1 being exactly on it. Orders the list; never shown. */
  margin: number;
  /** Whether the text in the pair is drawn as text, so the sample is words rather than a bar. */
  text: boolean;
};

/**
 * What each colour is read against, and how much it owes.
 *
 * THE SAME PAIRS AND FLOORS `checks.ts` MEASURES, one row per colour: checks A and C (the inks, faint at the large-text
 * floor), B and G (accent text and the four meanings as text), D (edges and chips), E's ring and R (the accent as a fill)
 * against every ground, and Q (each accent state against its own label). The floors come from the palette's own
 * profile, so the high-contrast palette is held to its higher ones.
 */
function asks(profile: Profile): { role: Role; floor: number; grounds: readonly Role[]; text: boolean }[] {
  const surfaces: readonly Role[] = SURFACES;
  const label: readonly Role[] = ['accent-ink'];
  return [
    ...INKS.map((ink, i) => ({ role: ink as Role, floor: ink === 'faint' ? 3 : (profile.ink[i] ?? 4.5), grounds: surfaces, text: true })),
    { role: 'accent-text', floor: profile.intentText, grounds: surfaces, text: true },
    ...INTENTS.map((intent) => ({ role: INTENT_TEXT[intent] as Role, floor: profile.intentText, grounds: surfaces, text: true })),
    { role: 'edge', floor: profile.edge, grounds: surfaces, text: false },
    { role: 'accent-edge', floor: profile.edge, grounds: surfaces, text: false },
    ...FILLS.map((fill) => ({ role: fill as Role, floor: profile.intentFill, grounds: surfaces, text: false })),
    { role: 'danger', floor: profile.intentFill, grounds: surfaces, text: false },
    { role: 'focus-in', floor: 3, grounds: surfaces, text: false },
    { role: 'accent', floor: 3, grounds: surfaces, text: false },
    { role: 'accent', floor: 4.5, grounds: label, text: false },
    { role: 'accent-hover', floor: 4.5, grounds: label, text: false },
    { role: 'accent-press', floor: 4.5, grounds: label, text: false },
  ];
}

const ratio = (a: string, b: string): number => contrast(fromHex(a), fromHex(b));

const verdictOf = (margin: number): Verdict => (margin < 1 ? 'fails' : margin < TIGHT ? 'tight' : 'fine');

/** The floor a pair owes, found again from its row, for a fix to aim at. */
function floorOf(pair: Pair): number {
  const profile = pair.more ? HIGH_CONTRAST_PROFILE : HOUSE_PROFILE;
  const ask = asks(profile).find((a) => a.role === pair.role && a.grounds.includes(pair.ground));
  return ask?.floor ?? 4.5;
}

/** How far apart two meanings are in grey, as CIELAB lightness, below which a reader without colour cannot tell them. */
const GREY_FAILS = 3;
const GREY_FINE = 6;

const greyOf = (hex: string): number => rgbToCielab(fromHex(hex)).L;

/**
 * Every pair a draft is read by, worst first.
 *
 * THE HIGH-CONTRAST PALETTE IS READ ONLY WHERE THE PERSON CHANGED SOMETHING. Its own solve clears its own floors, so a
 * pair there can fail only because a changed colour was laid over it, and listing the rest would put every pair on the
 * screen twice for a palette most people never turn on.
 *
 * AND THE MEANINGS ARE READ IN GREY WHERE ONE WAS CHANGED. `21 §6` asks that the four meanings stay separable in
 * greyscale; a meaning is never colour alone on screen (a glyph and a word ride with it), so this is held to the
 * colours a person moved, and a pair the solver itself set close is not laid at their door.
 */
export function gate(drawn: Drawn, draft: Draft): Pair[] {
  const out: Pair[] = [];
  for (const [built, more] of [
    [drawn.house, false],
    [drawn.contrast, true],
  ] as const)
    for (const scheme of SCHEMES) {
      const p = built.schemes[scheme];
      const changed = draft.roles[scheme];
      for (const ask of asks(built.profile)) {
        let worst: { ground: Role; margin: number } | null = null;
        for (const ground of ask.grounds) {
          if (more && !Object.hasOwn(changed, ask.role) && !Object.hasOwn(changed, ground)) continue;
          const margin = ratio(p[ask.role], p[ground]) / ask.floor;
          if (worst === null || margin < worst.margin) worst = { ground, margin };
        }
        if (worst) out.push({ kind: 'contrast', scheme, more, role: ask.role, ground: worst.ground, verdict: verdictOf(worst.margin), margin: worst.margin, text: ask.text });
      }
      if (more) continue;
      for (const [i, a] of WORDS.entries())
        for (const b of WORDS.slice(i + 1)) {
          if (!Object.hasOwn(changed, a) && !Object.hasOwn(changed, b)) continue;
          const apart = Math.abs(greyOf(p[a]) - greyOf(p[b]));
          const margin = apart / GREY_FAILS;
          const verdict: Verdict = apart < GREY_FAILS ? 'fails' : apart < GREY_FINE ? 'tight' : 'fine';
          /* THE CHANGED ONE IS THE ONE ASKED TO MOVE: the other is where the solver put it. */
          const role = Object.hasOwn(changed, a) ? a : b;
          out.push({ kind: 'grey', scheme, more: false, role, ground: role === a ? b : a, verdict, margin, text: true });
        }
    }
  return out.sort((x, y) => x.margin - y.margin);
}

/**
 * What the record's own check would refuse that no pair above names: two meanings a colour-blind reader cannot tell
 * apart, grounds out of order, a link told from text by hue alone. The same `checkScheme` and `checkElevation` the
 * install runs, on the same two palettes, so nothing the gate lets through is refused at Save.
 */
const PAIRED = new Set(['A', 'B', 'C', 'D', 'E', 'G', 'Q', 'R']);

export type Refused = { code: string; role: Role | null };

export function refusedOf(drawn: Drawn): Refused[] {
  const found: Finding[] = [];
  for (const built of [drawn.house, drawn.contrast]) found.push(...SCHEMES.flatMap((s) => checkScheme(built, s)), ...checkElevation(built));
  const seen = new Set<string>();
  const out: Refused[] = [];
  for (const f of refusals(found)) {
    if (PAIRED.has(f.check)) continue;
    const role = f.at ? (f.at.split('.').pop() ?? null) : null;
    const known = role !== null && (ROLES as readonly string[]).includes(role) ? (role as Role) : null;
    const key = `${f.code ?? ''}:${known ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code: f.code ?? 'THEME_VALUE_INVALID', role: known });
  }
  return out;
}

/** Whether a draft may be saved: no pair Fails and the record's own check has nothing left to say. */
export const saveable = (pairs: readonly Pair[], refused: readonly Refused[]): boolean =>
  refused.length === 0 && pairs.every((p) => p.verdict !== 'fails');

export type Fix = { scheme: Scheme; role: Role; hex: string; way: 'darken' | 'lighten' };

/**
 * The one-axis fix for a pair: lightness only, the least move that clears the floor with a little room.
 *
 * THE COLOUR MOVES, NOT THE GROUND, while the colour can reach the floor on its own: the ground is under every other
 * pair too. When it cannot (a quiet text already at white on a pale panel), the ground moves the other way, which is
 * the "Lighten the panel" a person reads.
 */
export function fixOf(pair: Pair, drawn: Drawn): Fix | null {
  const built = pair.more ? drawn.contrast : drawn.house;
  const p = built.schemes[pair.scheme];
  const aim = pair.kind === 'grey' ? null : floorOf(pair) * 1.02;
  const enough = (fg: string, bg: string): boolean =>
    aim === null ? Math.abs(greyOf(fg) - greyOf(bg)) >= GREY_FINE : ratio(fg, bg) >= aim;
  const lighter = pair.kind === 'grey' ? greyOf(p[pair.role]) >= greyOf(p[pair.ground]) : relLuminance(fromHex(p[pair.role])) >= relLuminance(fromHex(p[pair.ground]));

  const walk = (moving: string, still: string, up: boolean, movingIsRole: boolean): string | null => {
    const c = rgbToLch(fromHex(moving));
    for (let L = c.L; L >= 0 && L <= 1; L += up ? 0.005 : -0.005) {
      const hex = hexFrom({ ...c, L });
      if (movingIsRole ? enough(hex, still) : enough(still, hex)) return hex;
    }
    return null;
  };

  const own = walk(p[pair.role], p[pair.ground], lighter, true);
  if (own) return { scheme: pair.scheme, role: pair.role, hex: own, way: lighter ? 'lighten' : 'darken' };
  if (pair.kind === 'grey') return null;
  const ground = walk(p[pair.ground], p[pair.role], !lighter, false);
  return ground ? { scheme: pair.scheme, role: pair.ground, hex: ground, way: lighter ? 'darken' : 'lighten' } : null;
}

/** A draft with one colour set, or put back to the solve's with `null`. */
export function withRole(draft: Draft, scheme: Scheme, role: Role, hex: string | null): Draft {
  const roles = { light: { ...draft.roles.light }, dark: { ...draft.roles.dark } };
  if (hex === null) delete roles[scheme][role];
  else roles[scheme][role] = hex;
  return { ...draft, roles };
}

/* ── Where a draft starts, and what it saves as ──────────────────────────── */

/** The id the editor saves under: one look of the record's own, which a pack's theme never claims. */
export const OWN = 'own';

/**
 * A draft from the look the page is in.
 *
 * `boot` SENDS THE DRAWN COLOURS AND NOT THE DECLARATION, so an installed look is re-seeded from its own light accent
 * over the house grounds, which is the palette an author who set only a seed would have drawn, and the corners and
 * density are read back from what it draws. The drawn colours are not all laid back on as changes: laid over the
 * high-contrast palette too, as every change is, the house profile's values would fail its higher floors. The house
 * look starts from the house seed with nothing changed.
 */
export function draftFrom(look: Look | null): Draft {
  const accent = look?.light.accent ?? HOUSE_SEED.accent;
  const px = (v: string | undefined): number | null => (v && /^\d+px$/u.test(v) ? Number.parseInt(v, 10) : null);
  const md = px(look?.light['r-pop']);
  const corners: Corners = md === null ? 'soft' : md <= CORNERS.square.md ? 'square' : md >= CORNERS.round.md ? 'round' : 'soft';
  const row = px(look?.light['row-h']);
  const density = densityOf(row);
  return { accent, neutralHue: HOUSE_SEED.neutralHue, roles: { light: {}, dark: {} }, corners, density };
}

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * A draft from a pack's `theme` declaration, for Fix and install: the seed, the roles and the scale it said.
 *
 * `null` WHEN THE DOCUMENT HOLDS NO THEME THIS CAN READ. A role value that is an `oklch(...)` rather than a code is
 * converted through the solver's own gamut mapper, which is what the install would draw.
 */
export function draftFromPack(doc: unknown): { draft: Draft; id: string } | null {
  const decls = isMap(doc) && Array.isArray(doc.declarations) ? doc.declarations : [];
  const decl = decls.find((d): d is Record<string, unknown> => isMap(d) && typeof d.theme === 'string');
  const seed = decl && isMap(decl.seed) ? decl.seed : null;
  const accent = seed?.accent;
  if (!decl || !seed || typeof accent !== 'string') return null;
  const hue = seed.neutral_hue;
  const neutralHue: Seed['neutralHue'] = typeof hue === 'number' && Number.isInteger(hue) && hue >= 0 && hue <= 360 ? hue : 'from-accent';
  const roles: Draft['roles'] = { light: {}, dark: {} };
  if (isMap(decl.roles))
    for (const scheme of SCHEMES) {
      const map = decl.roles[scheme];
      if (!isMap(map)) continue;
      for (const [role, value] of Object.entries(map)) {
        if (!(ROLES as readonly string[]).includes(role) || typeof value !== 'string') continue;
        const hex = hexOf(value) ?? oklchHex(value);
        if (hex) roles[scheme][role as Role] = hex;
      }
    }
  const scale: Record<string, unknown> = isMap(decl.scale) ? decl.scale : {};
  const md = isMap(scale.radius) && typeof scale.radius.md === 'number' ? scale.radius.md : null;
  const corners: Corners = md === null ? 'soft' : md <= CORNERS.square.md ? 'square' : md >= CORNERS.round.md ? 'round' : 'soft';
  const density: Density = scale.density === 'compact' || scale.density === 'roomy' ? scale.density : 'comfortable';
  return { draft: { accent, neutralHue, roles, corners, density }, id: String(decl.theme) };
}

/** An `oklch(L C H)` as the code the solver would draw it as, or `null`. */
function oklchHex(value: string): string | null {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/iu.exec(value.trim());
  if (!m) return null;
  return hexFrom({ L: Number.parseFloat(m[1]!), C: Number.parseFloat(m[2]!), H: Number.parseFloat(m[3]!) });
}

/**
 * Every failing pair fixed on its one axis, for Fix and install: the draft with the fixes staged and the colours they
 * moved, so the editor opens with those selected.
 *
 * A FEW ROUNDS AND NOT ONE, because moving a ground to rescue one pair can tip another. It stops the first round with
 * nothing left to fix, and a pair no lightness can rescue is left failing for the person to see.
 */
export function stageFixes(base: Base, start: Draft): { draft: Draft; moved: { scheme: Scheme; role: Role }[] } {
  let draft = start;
  const moved: { scheme: Scheme; role: Role }[] = [];
  for (let round = 0; round < 4; round++) {
    const drawn = drawOf(base, draft);
    const failing = gate(drawn, draft).filter((p) => p.verdict === 'fails');
    if (failing.length === 0) break;
    let changed = false;
    for (const pair of failing) {
      const fix = fixOf(pair, drawOf(base, draft));
      if (!fix) continue;
      draft = withRole(draft, fix.scheme, fix.role, fix.hex);
      if (!moved.some((m) => m.scheme === fix.scheme && m.role === fix.role)) moved.push({ scheme: fix.scheme, role: fix.role });
      changed = true;
    }
    if (!changed) break;
  }
  return { draft, moved };
}

/**
 * The `theme` declaration a draft saves as: the seed it was solved from, the colours the person changed, and the
 * corners and density they chose. `scheme: 'both'` because the editor always edits both.
 */
export function declarationOf(draft: Draft, id: string = OWN): Record<string, unknown> {
  const roles: Record<string, Record<string, string>> = {};
  for (const scheme of SCHEMES) {
    const changed = draft.roles[scheme];
    if (Object.keys(changed).length > 0) roles[scheme] = { ...(changed as Record<string, string>) };
  }
  return {
    theme: id,
    scheme: 'both',
    seed: { accent: draft.accent, neutral_hue: draft.neutralHue },
    ...(Object.keys(roles).length > 0 ? { roles } : {}),
    scale: { radius: { ...CORNERS[draft.corners] }, density: draft.density },
  };
}

const SPACES = [4, 8, 12, 16, 24, 32, 48, 64, 96];
const DENSE: Record<Density, number> = { compact: 0.75, comfortable: 1, roomy: 1.25 };

/** A palette as inline custom properties, for the specimen, which is drawn in the edited look and nothing else. */
export function varsOf(palette: Record<string, string>, draft: Draft): string {
  const r = CORNERS[draft.corners];
  return [
    ...Object.entries(palette).map(([role, value]) => `--${role}: ${value}`),
    `--r-xs: ${r.sm}px`,
    `--r-pop: ${r.md}px`,
    `--r-tile: ${r.lg}px`,
    `--row-h: ${ROW_H[draft.density]}px`,
    /* THE WHOLE SCALE, as the saved density draws it (`data-density` in `style.css`), since the specimen spaces itself by it. */
    ...SPACES.map((px, i) => `--sp-${i + 1}: ${px * DENSE[draft.density]}px`),
  ].join('; ');
}
