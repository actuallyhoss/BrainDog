/**
 * The generator: one seed colour in, a coherent theme out, in-gamut sRGB, with a proof.
 *
 * Contrast-driven, not lightness-driven, for the reason 28 §3 gives: BrainDog already has a
 * refusal gate, so generating by lightness and validating by contrast builds a loop that can fail
 * with no path forward. Generate BY contrast and the checks the generator drives become
 * tautologies. Only the checks it cannot drive — separability, ladder monotonicity — can fail.
 */

import {
  clipped,
  contrast,
  fromHex,
  gamutMap,
  quantise,
  rgbToLch,
  rgbToOklab,
  rgbToCielab,
  separation,
  solveL,
  toHex,
  type Deficiency,
  type Lch,
  type Rgb,
} from './color.ts';

export type Scheme = 'dark' | 'light';

export const SURFACES = ['sunk', 'bg', 's1', 's2', 's3'] as const;
export const INKS = ['ink', 'ink2', 'dim', 'faint'] as const;

/**
 * Four, not three, and this is the reversal the whole palette turns on.
 *
 * 28 §3 step 5 has `info` resolve to `accent`, which spends no generated colour and is the right
 * default for a theme whose accent is arbitrary. It is the wrong default HERE: BrainDog's accent is
 * its mark, the mark is red, and `danger` is anchored at 27. `info` resolving to `accent` therefore
 * puts two of the four intent words on one hue and the generator refuses the house theme — which is
 * the generator being right about a rule and wrong about the product.
 *
 * So `info` is a role. It costs one generated colour and one -fill, and it buys back the ability to
 * paint the product in its own colour.
 */
export const INTENTS = ['earn', 'warn', 'danger', 'info'] as const;

export type Role =
  | (typeof SURFACES)[number]
  | (typeof INKS)[number]
  | 'line'
  | 'edge'
  | (typeof INTENTS)[number]
  | 'earn-fill'
  | 'warn-fill'
  | 'danger-fill'
  | 'info-fill'
  | 'accent'
  | 'accent-edge'
  | 'accent-hover'
  | 'accent-press'
  | 'accent-text'
  | 'accent-ink'
  | 'focus-in'
  | 'focus-out';

export type Palette = Record<Role, string>;

export type Profile = {
  id: string;
  /** Contrast targets for the ink ramp, descending. 13 §7: the house aims well past AA's 4.5. */
  ink: [number, number, number, number];
  /** The load-bearing boundary. 1.4.11 asks 3; a profile may ask more. */
  edge: number;
  /** Intent-as-text floor, and the -fill floor. */
  intentText: number;
  intentFill: number;
  /** Mark constants: every identity hue at this (L, C) is in gamut and >= 3:1 on every surface. */
  mark: Record<Scheme, { L: number; C: number }>;
  /**
   * The surface ladder, if this profile needs its own.
   *
   * A FLOOR IS ONLY A FLOOR IF IT IS REACHABLE. High contrast asks 16:1 for `ink`, and the generator
   * solves ink against the WORST surface — `s3` in dark. On the house ladder `s3` is L 0.302, and
   * pure white measures 13.51:1 against it: so `ink` came out `#ffffff`, the solver returned the
   * best it could, and nothing said the target had been missed by two and a half. The validator was
   * hard-coded to AA and could not see it.
   *
   * So the mode that exists for readers who need the most help gets a ladder its own numbers can be
   * met on: the same five rungs, closer together and darker, which is what "high contrast" means
   * about surfaces as well as about ink.
   */
  ladder?: Record<Scheme, Record<(typeof SURFACES)[number], number>>;
  /** The most chroma a surface may carry, per scheme. Omitted, it is 0.01 in dark and 0.014 in light. */
  groundC?: Record<Scheme, number>;
  /** The chroma ladder the separability search walks, and the contrast grid it walks it against. */
  chromaLadder: number[];
  targetGrid: number[];
  fillChroma: number;
  /** Where a chip or a bar wants to sit, per scheme, when the 3:1 floor leaves it room. */
  fillL: Record<Scheme, number>;
  /**
   * Where each intent WANTS to sit, per scheme, when separability leaves it a choice.
   *
   * Without this the search returns the first clearing palette, which is an arbitrary one: the
   * first run of this generator produced a pale pink `bad` in dark and a near-black `bad` in light,
   * both of which cleared every floor and neither of which is a colour anyone would call "overdue".
   * A contrast floor says what is legal. It does not say what is good, and a generator that only
   * knows the floor will happily ship the worst legal answer.
   *
   * `bad` is weighted hardest to move (`weight` below) because in this product red is not a
   * decoration: the mark is red, `danger`'s hue anchor is 27, and they are the same hue by design.
   * Red always means *this is owed, this is late, this is wrong*, so it is the intent least free to
   * drift.
   */
  prefer: Record<Scheme, Record<(typeof INTENTS)[number], number>>;
  weight: Record<(typeof INTENTS)[number], number>;
};

export const HOUSE_PROFILE: Profile = {
  id: 'house',
  ink: [12, 8, 6, 4.5],
  edge: 3,
  intentText: 4.5,
  intentFill: 3,
  mark: { dark: { L: 0.72, C: 0.12 }, light: { L: 0.55, C: 0.09 } },
  chromaLadder: [0.16, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.09, 0.08],
  targetGrid: [4.5, 5.5, 7, 9, 12, 15, 18],
  // THE ALARM IS LOUDER THAN THE BRAND, and this is the one place that is arranged rather than
  // hoped for. The mark sits at chroma 0.18; the fill band sits at 0.233 — the product's original,
  // fully saturated red — so the dark `danger` chip is always a step more insistent than the accent
  // it shares a hue with. Green and amber gamut-clamp below the band on their own, which is why one
  // pair of numbers serves all four.
  fillChroma: 0.233,
  fillL: { dark: 0.623, light: 0.56 },
  /**
   * DARKER AND COOLER THAN THE DEFAULT LADDER. The default puts dark `bg` at L 0.241, a warm
   * charcoal. The house sits where the product it is measured against sits, `bg` at L 0.168, and
   * the note on `LADDER` calling 0.168 an OLED test pattern was written about a warm hue: at 165,
   * with the chroma capped, it reads as near-black glass and the cards on it read as cards. Light
   * keeps the default rungs. `groundC` holds the light tint to 0.006, because 0.014 at hue 165 is
   * mint.
   */
  ladder: {
    dark: { sunk: 0.15, bg: 0.168, s1: 0.2, s2: 0.23, s3: 0.262 },
    light: { sunk: 0.938, bg: 0.962, s1: 0.988, s2: 0.994, s3: 0.999 },
  },
  groundC: { dark: 0.01, light: 0.006 },
  prefer: {
    dark: { earn: 7, warn: 8.5, danger: 5, info: 6 },
    light: { earn: 4.5, warn: 7, danger: 5.5, info: 5.5 },
  },
  weight: { earn: 1, warn: 1, danger: 2.5, info: 1 },
};

/**
 * High-contrast is the house seed through a profile, not a second seed and not a dialect key
 * (28 §3.1). It is never refused and never auto-corrected: if the floor fails, the validator is wrong.
 */
export const HIGH_CONTRAST_PROFILE: Profile = {
  id: 'high-contrast',
  ink: [16, 12.5, 9.5, 7],
  edge: 4.5,
  /**
   * 5, not 7 — and this is a finding rather than a compromise.
   *
   * Raising the intent floor to 7:1 in the LIGHT scheme drives amber and red so far down the
   * lightness axis that both bottom out against the sRGB gamut at low chroma, and the generator
   * measured them 9.2 apart to a protanope: below the floor, in the one theme that exists to serve
   * readers who need the most help. High contrast is a property of ink on surface and of
   * boundaries. Forcing it onto the intent hues as well makes the four intents LESS
   * distinguishable, not more, which is the opposite of what the mode is for.
   */
  intentText: 5,
  /**
   * A tighter, darker ladder, so `ink: 16` is a floor rather than an aspiration.
   *
   * Dark `s3` comes down from L 0.302 to 0.244, which puts pure white just past 16:1 against it — the
   * generator's own target, met with a little to spare. Light `sunk` goes up from 0.938 to 0.965 for
   * the same reason in the other direction. The five rungs stay five and stay ordered: the elevation
   * ladder still reads, it reads over a shorter distance, and a shorter distance between surfaces is
   * what a high-contrast mode wants anyway — the boundary does the separating, not the fill.
   */
  ladder: {
    dark: { sunk: 0.178, bg: 0.202, s1: 0.216, s2: 0.230, s3: 0.244 },
    light: { sunk: 0.965, bg: 0.978, s1: 0.988, s2: 0.994, s3: 0.999 },
  },
  intentFill: 4.5,
  mark: { dark: { L: 0.78, C: 0.13 }, light: { L: 0.46, C: 0.11 } },
  chromaLadder: [0.18, 0.16, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1],
  targetGrid: [5, 6, 7, 8.5, 10, 12, 14],
  fillChroma: 0.21,
  fillL: { dark: 0.66, light: 0.5 },
  prefer: {
    dark: { earn: 8.5, warn: 10, danger: 7, info: 8 },
    light: { earn: 5, warn: 7, danger: 5.5, info: 6 },
  },
  weight: { earn: 1, warn: 1, danger: 2.5, info: 1 },
};

export type Seed = {
  /** The interactive hue. Refused below chroma 0.02: there is no hue to build from. */
  accent: string;
  /** The hue every surface and every ink carries a whisper of. A number, or the accent's. */
  neutralHue: number | 'from-accent';
  space: number;
  radius: { sm: number; md: number; lg: number };
  density: 'compact' | 'comfortable' | 'roomy';
};

/** Hue anchors, 28 §3 step 5. `danger` sits at 27 — which is where the BrainDog red already is. */
export const INTENT_HUE: Record<(typeof INTENTS)[number], number> = {
  earn: 145,
  warn: 75,
  danger: 27,
  /**
   * 264 is not a taste call. 27, 75 and 145 are all in the warm half of the circle, so the widest
   * unspent arc is the cool one, and its middle is the farthest an intent can get from every hue
   * that already means something — which is what leaves the search room to place a red accent
   * beside a red `danger` without the two colliding.
   */
  info: 264,
};

/**
 * The mark. One value, used by the logo, the favicon and the seed, so the brand cannot drift.
 *
 * It was #F42A2A — a fire-engine red at chroma 0.233 — and it was toned down by a third, because a
 * whole product painted in the loudest red the display can make reads as an emergency rather than
 * as a brand. Same hue, so nothing about the identity moves; less chroma, so the saturated red is
 * free to mean only one thing. The old value did not go away: it is the ALARM now, the band the
 * `danger` chip is struck from, one step louder than the mark by construction (see `fillChroma`).
 */
export const BRAND_RED = '#CF413A';

export type Built = {
  id: string;
  /**
   * The profile it was solved against — the object, not its id.
   *
   * IT WAS A STRING, AND THAT IS WHY THE VALIDATOR COULD NOT READ ITS FLOORS. `Profile` declares
   * `ink`, `edge`, `intentText` and `intentFill`, and `HIGH_CONTRAST_PROFILE` raises every one of
   * them — and `checks.ts` hard-coded the house numbers, so a regression dropping high-contrast
   * `edge` from 4.5 to 3.1, or `ink` from 16 to 4.6, was refused by nothing. In the one theme that
   * exists for readers who need the most help.
   */
  profile: Profile;
  seed: Seed;
  schemes: Record<Scheme, Palette>;
  /**
   * How much chroma the gamut mapper took off each role, as a fraction of what was asked for.
   *
   * IT IS RECORDED AT THE MOMENT IT HAPPENS, because that is the only moment the answer exists. Once
   * a colour is a hex it is inside sRGB by construction, so asking a hex whether it is in gamut is
   * asking whether a number between 0 and 1 is between 0 and 1 — which is what check J did, over
   * every value, without ever being false. What CAN be wrong is that the emitted colour is a clipped
   * version of the one the palette was solved as: every contrast figure in this package is computed
   * against the clipped one while the palette is reasoned about as the other.
   */
  clipped: Record<Scheme, Partial<Record<Role, number>>>;
  /** (L, C) per scheme for an identity accent's `oklch(L C h)` — 13 §2.1b. */
  mark: Record<Scheme, { L: number; C: number }>;
  /** The elevation ladder, three levels, fixed geometry, alphas per scheme (28 §1). */
  elevation: Record<Scheme, [string, string, string]>;
  radius: { sm: number; md: number; lg: number };
  space: number;
  density: Seed['density'];
};

/**
 * A colour as it ships, and a note of what the gamut cost it.
 *
 * BY THE HEX IT PRODUCED, not by the role that asked for it. `hex` is called from thirty places
 * inside `buildScheme` and threading a second output through all of them would be the change rather
 * than the fix; the palette is a map from role to hex, so a lookup the other way is enough. Two
 * roles landing on one hex take the larger cost, which is the conservative direction.
 */
const cost = new Map<string, number>();

const hex = (c: Lch) => {
  const out = toHex(quantise(c));
  const lost = clipped(c);
  if (lost > (cost.get(out) ?? 0)) cost.set(out, lost);
  return out;
};

/**
 * The dialect's whole colour grammar: `#RRGGBB`, `#RGB`, or `oklch(L C H)`. No alpha (28 §1).
 *
 * AND THE `#` BRANCH CHECKED NOTHING, SO THE SENTENCE ABOVE WAS THE ONLY PLACE THE RULE EXISTED.
 * It tested the first character and handed the rest to `fromHex`, which slices at fixed offsets:
 * `#ff0000ff` came back `ok` with the alpha silently dropped, and `#12345` came back `ok` read as
 * three bytes off the wrong boundaries. The document says "No alpha" and the code accepted it. It
 * is reachable through the accent preference, which is re-applied from storage on every load, so a
 * value stored once by a build that was looser is a colour nobody chose.
 *
 * THE OUTPUT CHECK COULD NOT SEE IT: the theme's check O reads the RE-SERIALISED colour, which is
 * always six clean digits whatever went in.
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseColour(s: string): Rgb {
  const t = s.trim();
  if (t.startsWith('#')) {
    if (!HEX.test(t)) throw new Error(`THEME_VALUE_INVALID — "${s}" is not a colour this dialect accepts.`);
    return fromHex(t);
  }
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(t);
  if (!m) throw new Error(`THEME_VALUE_INVALID — "${s}" is not a colour this dialect accepts.`);
  return quantise(gamutMap({ L: Number(m[1]), C: Number(m[2]), H: Number(m[3]) }));
}

const rgb = (s: string) => parseColour(s);

/** Step 0. Below chroma 0.02 the hue angle is numerically unstable — two greys can be 180 apart. */
export function normalise(seed: string): Lch {
  const c = rgbToLch(rgb(seed));
  if (c.C < 0.02)
    throw new Error(
      `theme — the seed ${seed} is almost grey, so there is no hue to build from. Pick a colour with some chroma in it.`,
    );
  return c;
}

/**
 * Step 1. The ladder is NOT evenly spaced, and that is the whole of it.
 *
 * `sunk` is the canvas the application chrome sits on, and `bg` is the panel the work sits in. The
 * gap between those two is large; every step above `bg` is small. An evenly-spaced ladder makes
 * five greys that all read as "a box", which is what a screen full of boxes is made of. One decisive
 * lift and then near-nothing makes the work surface the thing you look at, and leaves hierarchy
 * inside it to space and type weight rather than to more grey.
 *
 * Light has no headroom above white, so the canvas moves down instead of the panel moving up. Same
 * shape, same monotonic ladder (check H), opposite anchor (39 D2).
 */
const LADDER: Record<Scheme, Record<(typeof SURFACES)[number], number>> = {
  /* Warm olive-charcoal, and the rail is the darkest thing on screen.
     MEASURED AND MOVED: the first dark ladder put `bg` at L 0.168, relative luminance 0.0050. The
     cards on it were fine — 0.0174, within a rounding step of what a good dark product uses — but
     the canvas under them was three times too dark, which is the difference between a warm dark
     room and an OLED test pattern. The bottom of the ladder came up; the top barely moved. */
  dark: { sunk: 0.205, bg: 0.241, s1: 0.263, s2: 0.284, s3: 0.302 },
  // Cream, and cards go to near-white on it. `sunk` is the rail; `bg` is where the work sits.
  light: { sunk: 0.938, bg: 0.962, s1: 0.988, s2: 0.994, s3: 0.999 },
};

function ground(
  scheme: Scheme,
  hue: number,
  chroma: number,
  rungs?: Record<(typeof SURFACES)[number], number>,
  cap?: number,
): Record<(typeof SURFACES)[number], string> {
  /**
   * A VISIBLE amount of hue, not a whisper.
   *
   * Capping the surfaces at 0.008 chroma is what makes a neutral read as neutral, and a page of
   * neutral grey is a page that could belong to anything. Cream is a colour, and it is the single
   * cheapest thing a product can do to stop looking like every other dark dashboard.
   */
  const C = Math.min(chroma, cap ?? (scheme === 'light' ? 0.014 : 0.01));
  const rung = rungs ?? LADDER[scheme];
  return {
    sunk: hex({ L: rung.sunk, C, H: hue }),
    bg: hex({ L: rung.bg, C, H: hue }),
    s1: hex({ L: rung.s1, C, H: hue }),
    s2: hex({ L: rung.s2, C, H: hue }),
    s3: hex({ L: rung.s3, C, H: hue }),
  };
}

/** The worst ground a foreground role ever sits on. Solve there and every other surface follows. */
const worstOf = (scheme: Scheme, g: Record<string, string>) => rgb(scheme === 'light' ? g.sunk! : g.s3!);
const away = (scheme: Scheme): 'up' | 'down' => (scheme === 'dark' ? 'up' : 'down');

/** The words check F names in its refusal, in INTENTS order. */
const INTENT_NAMES = ['good', 'warn', 'bad', 'info'] as const;

/**
 * Two intents may not share a hue, whatever the arithmetic says.
 *
 * This clause was added because the generator disagreed with the design. Asked to build the house
 * theme on the BrainDog red as its accent, it succeeded: `info` came out as the mark and `bad` as a
 * pale tint of it, and every delta-E cleared 10, because delta-E 2000 counts lightness and two reds
 * thirty L* apart are numerically far apart.
 *
 * They are not far apart to a reader. BrainDog's intents are 12px chips compared non-adjacently and
 * from memory — a `warn` chip on row 3 against a `bad` chip on row 41 (28 §4.3). That is
 * categorical naming, and the category a person stores is the hue. Twenty degrees is the same floor
 * 28 §3.2 already puts between an identity mark and an intent, for the same reason.
 */
/**
 * The least two intent hues may be apart, and the arc between two.
 *
 * EXPORTED, because the validator needs the same number. The generator refuses a palette whose
 * intents are within twenty degrees regardless of delta-E — the note below records paying to learn
 * why: `info` came out as the mark and `bad` as a pale tint of it, and every delta-E cleared 10,
 * because delta-E 2000 counts lightness. The validator knew only the delta-E half, so a third-party
 * theme was ACCEPTED at install on exactly the palette this generator will not produce.
 */
export const HUE_FLOOR = 20;
export const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

function separable(candidates: Rgb[], floor: number): { ok: boolean; worst: number; pair: [number, number] } {
  let worst = Infinity;
  let pair: [number, number] = [0, 1];
  const defs: Deficiency[] = ['protan', 'deutan', 'tritan'];
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      if (hueGap(rgbToLch(candidates[i]!).H, rgbToLch(candidates[j]!).H) < HUE_FLOOR)
        return { ok: false, worst: 0, pair: [i, j] };
      for (const d of defs) {
        const de = separation(candidates[i]!, candidates[j]!, d);
        if (de < worst) {
          worst = de;
          pair = [i, j];
        }
      }
    }
  return { ok: worst >= floor, worst, pair };
}

export function buildScheme(seed: Seed, profile: Profile, scheme: Scheme): Palette {
  const acc = normalise(seed.accent);
  const nHue = seed.neutralHue === 'from-accent' ? acc.H : seed.neutralHue;

  /* 1 · ground */
  const g = ground(scheme, nHue, acc.C, profile.ladder?.[scheme], profile.groundC?.[scheme]);
  const worst = worstOf(scheme, g);
  const dir = away(scheme);

  /* 2 · ink ramp. Tinted toward the GROUND, not toward the accent: warm paper wants warm ink, and
     ink that leans toward a red accent comes out pink. */
  const Cink = 0.012;
  const [ink, ink2, dim, faint] = profile.ink.map((t) => hex(solveL(t, Cink, nHue, worst, dir))) as [
    string, string, string, string,
  ];

  /* 3 · boundaries. `edge` is load-bearing at 3:1; `line` is decorative and has no floor at all.
     `line` is solved as a RATIO AGAINST THE PANEL rather than as an offset from `edge`, and it is
     deliberately near-invisible — 1.45:1, which is a hairline you notice only when you look for it.
     Deriving it from `edge` made every divider in the product a quarter as strong as a load-bearing
     border, which is how a dense screen turns into a grid of visible boxes. A separator's job is to
     be findable, not to be seen. */
  const edge = hex(solveL(profile.edge, Cink, nHue, worst, dir));
  /* 1.55, not 1.35. With no shadow anywhere in the system a border IS the boundary, so it has to be
     seen rather than merely found — a thin olive hairline that says "this is a card", not a
     suggestion of one. Flat and confident beats soft and vague. */
  const line = hex(solveL(1.55, Cink, nHue, rgb(g.bg), dir));

  /* 4 · the accent FILL. The text role waits until after the intents, and step 6 says why. */
  const accent = hex(gamutMap(acc));
  // The theme's own darkest neutral is tried before pure black, so a primary control reads as part
  // of the same warm palette rather than as a hole punched in it. Falls through to black if neither
  // clears — the label on a control is never allowed to be the thing that fails.
  const accentInk =
    [ink, g.sunk, '#FFFFFF', '#000000'].find((c) => contrast(rgb(c), rgb(accent)) >= 4.5) ?? '#000000';

  /* 4b · THE ACCENT'S TWO INTERACTION STATES, solved here rather than mixed at the call site.
     A component reaching for `color-mix(in srgb, var(--accent) 90%, var(--sunk))` writes one
     formula that does OPPOSITE things in the two schemes: `sunk` is a pale surface in light and a
     dark one in dark, so the same line lightens the button under a white label in one scheme and
     darkens it in the other. Measured on the real palette, that hover state was 4.16 against its
     own label in light and 5.42 in dark — a control failing AA at exactly the moment somebody is
     about to press it, in one scheme only, which is the kind of bug that survives review forever.

     The direction is not a taste: it is AWAY FROM THE LABEL. `accentInk` is already solved to clear
     4.5 against `accent`, so hover and press step the accent's lightness further from it and keep
     the hue and chroma, and each is checked rather than assumed. A state that cannot clear the
     floor falls back to the accent itself — an interaction with no colour change is worse than an
     interaction, and much better than an unreadable one. */
  const inkIsLight = rgbToLch(rgb(accentInk)).L > 0.5;
  const stepped = (delta: number): string => {
    const away = inkIsLight ? -delta : delta;
    return hex(gamutMap({ ...acc, L: Math.min(0.98, Math.max(0.02, acc.L + away)) }));
  };
  const clears = (c: string) => contrast(rgb(c), rgb(accentInk)) >= 4.5;
  const accentHover = [stepped(0.05), stepped(0.07), stepped(0.09)].find(clears) ?? accent;
  const accentPress = [stepped(0.1), stepped(0.13), stepped(0.16)].find(clears) ?? accentHover;

  /* 4c · THE BOUNDARY OF A FILLED CONTROL, for the same reason and by the same argument.
     SC 1.4.11 asks 3:1 on the visual boundary of a component, and an accent fill cannot be
     guaranteed it: measured on the house palette, `accent` is 2.88:1 against `s3` in dark and
     `accent-press` is 1.88:1. The button knew that — its own comment says the border is what makes
     the boundary legal — and then drew that border as `color-mix(in srgb, var(--accent) 72%,
     var(--sunk))`, which is the same one-formula-two-schemes mistake as the hover state: 1.91:1
     against `s3` in dark at rest and 1.33:1 on hover. The boundary was the failing part.

     So it is solved here, against the WORST surface, in the accent's own hue, so a primary control
     still reads as one shape rather than as a fill inside a grey outline. Falling back to `edge`,
     which is already proven at the same floor, because a boundary that cannot be legal in the
     accent's hue must still be legal. */
  const accentEdge =
    [acc.C, acc.C * 0.6, Cink]
      .map((C) => hex(solveL(profile.edge, C, acc.H, worst, dir)))
      .find((c) => contrast(rgb(c), worst) >= 3) ?? edge;

  /* 5 · intents. Solved for text, then SEARCHED for separability — searched, never repaired.
     There is no "retry once with relaxed chroma": a two-stage grid over chroma and contrast
     targets, taking the FIRST palette that clears check F, so the answer is the most saturated
     one that works rather than the first one that happens to (39 D4). */
  const solved = new Map<string, Lch>();
  const candidate = (t: number, C: number, H: number) => {
    const key = `${t}|${C}|${H}`;
    let v = solved.get(key);
    if (!v) {
      v = solveL(Math.max(t, profile.intentText), C, H, worst, dir);
      solved.set(key, v);
    }
    return v;
  };

  const want = profile.prefer[scheme];
  const cost = (t: Record<(typeof INTENTS)[number], number>, C: number) =>
    INTENTS.reduce((sum, k) => sum + profile.weight[k] * Math.abs(t[k] - want[k]), 0) +
    (profile.chromaLadder[0]! - C) * 40;

  let chosen: Record<(typeof INTENTS)[number], string> | null = null;
  let chosenCost = Infinity;
  let best = { worst: -1, pair: '' };

  // The set is the four INTENT WORDS and nothing else. The accent is deliberately not a member:
  // it shares `danger`'s hue by design, and an accent is chrome — it never appears as a row's
  // verdict, so it is never the thing a reader has to tell a `bad` chip apart from.
  for (const C of profile.chromaLadder)
    for (const tEarn of profile.targetGrid)
      for (const tWarn of profile.targetGrid)
        for (const tDanger of profile.targetGrid)
          for (const tInfo of profile.targetGrid) {
            const t = { earn: tEarn, warn: tWarn, danger: tDanger, info: tInfo };
            const c = cost(t, C);
            if (c >= chosenCost) continue;
            const solvedSet = INTENTS.map((k) => candidate(t[k], C, INTENT_HUE[k]));
            // An intent that has bottomed out against the gamut is achromatic, and an achromatic
            // intent is not a colour — it is ink. The first run of this generator returned pure
            // black for `good` in the high-contrast light scheme, which passed every contrast floor
            // and was indistinguishable from body text.
            if (Math.min(...solvedSet.map((s) => s.C)) < 0.045) continue;
            const sep = separable(solvedSet.map(quantise), 10);
            if (sep.worst > best.worst)
              best = { worst: sep.worst, pair: `${INTENT_NAMES[sep.pair[0]]}/${INTENT_NAMES[sep.pair[1]]}` };
            if (sep.ok) {
              chosen = Object.fromEntries(INTENTS.map((k, i) => [k, hex(solvedSet[i]!)])) as Record<
                (typeof INTENTS)[number],
                string
              >;
              chosenCost = c;
            }
          }
  if (!chosen)
    throw new Error(
      `INTENT_INSEPARABLE — in ${scheme}, the best palette on the search grid gets ${best.pair} only ` +
        `${best.worst.toFixed(1)} apart to a dichromat. Four intents need at least 10. ` +
        `Move the accent hue, or widen the profile's chroma ladder.`,
    );

  /* 6 · the accent AS TEXT — solved last, because it has to keep clear of two colours rather than
     one, and the second is not known until the intents are.

     Check K's rule is that hue alone may never encode meaning, so a link has to differ from body
     ink in LIGHTNESS. In this theme it has to differ from `danger` too, and for a stronger reason:
     the accent and `danger` are the same hue by design, and solving both against the same ground at
     similar contrast targets put them on the same value — a link and an overdue figure rendering to
     one colour, in the scheme where the product is read most. So the search walks upward until the
     candidate is 8 L* clear of both. Falling back to the top of the range rather than refusing:
     an unreadable link is a floor, and this is a collision. */
  const accentText = (() => {
    const AC = Math.min(acc.C, 0.16);
    const clear = (c: string, of: string) =>
      Math.abs(rgbToCielab(rgb(c)).L - rgbToCielab(rgb(of)).L) >= 8;
    /* THE LADDER STARTS AT THE PROFILE'S FLOOR, not at AA's. It began at 4.5 whatever the profile
       asked, so in high contrast — where a coloured text role needs 5 — the first candidate that
       cleared the lightness collisions was already below the floor, and the search returned it. The
       validator was hard-coded to 4.5 and agreed. */
    for (const t of [profile.intentText, 5.5, 6, 7, 8, 9, 11, 13].filter((x, i, a) => a.indexOf(x) === i && x >= profile.intentText)) {
      const cand = hex(solveL(t, AC, acc.H, worst, dir));
      if (clear(cand, ink) && clear(cand, chosen.danger)) return cand;
    }
    return hex(solveL(9, AC, acc.H, worst, dir));
  })();

  /* -fill variants: chips and bars. Free to carry more chroma than the text role, because a chip
     is a shape and not a paragraph. Each aims at the scheme's fill band and is pushed away from the
     ground only if it fails the 3:1 floor there — solving for exactly 3:1 instead produces the
     darkest legal chip, which is how `bad` ended up two shades off the mark it is meant to echo. */
  const fill = (h: number) => {
    const band = gamutMap({ L: profile.fillL[scheme], C: profile.fillChroma, H: h });
    return contrast(quantise(band), worst) >= profile.intentFill
      ? hex(band)
      : hex(solveL(profile.intentFill, profile.fillChroma, h, worst, dir));
  };

  return {
    ...g,
    ink,
    ink2,
    dim,
    faint,
    line,
    edge,
    earn: chosen.earn,
    warn: chosen.warn,
    danger: chosen.danger,
    info: chosen.info,
    'earn-fill': fill(INTENT_HUE.earn),
    'warn-fill': fill(INTENT_HUE.warn),
    'danger-fill': fill(INTENT_HUE.danger),
    'info-fill': fill(INTENT_HUE.info),
    accent,
    'accent-edge': accentEdge,
    'accent-text': accentText,
    'accent-ink': accentInk,
    'accent-hover': accentHover,
    'accent-press': accentPress,
    /* The ring is two tones, nine apart, so it survives on every surface in both schemes. */
    'focus-in': ink,
    'focus-out': g.bg,
  };
}

const ELEVATION: Record<Scheme, [number, number, number]> = {
  dark: [0.44, 0.52, 0.62],
  light: [0.07, 0.1, 0.14],
};

export function build(seed: Seed, profile: Profile = HOUSE_PROFILE, id = 'house'): Built {
  const ladder = (s: Scheme): [string, string, string] => {
    const a = ELEVATION[s];
    return [
      `0 1px 2px rgb(0 0 0 / ${a[0]})`,
      `0 2px 4px rgb(0 0 0 / ${a[1]}), 0 6px 14px rgb(0 0 0 / ${(a[1] * 0.7).toFixed(3)})`,
      `0 4px 8px rgb(0 0 0 / ${a[2]}), 0 16px 40px rgb(0 0 0 / ${(a[2] * 0.7).toFixed(3)})`,
    ];
  };
  const schemes = { dark: buildScheme(seed, profile, 'dark'), light: buildScheme(seed, profile, 'light') };
  const lostIn = (p: Palette): Partial<Record<Role, number>> => {
    const out: Partial<Record<Role, number>> = {};
    for (const [role, value] of Object.entries(p)) {
      const lost = cost.get(value) ?? 0;
      if (lost > 0) out[role as Role] = lost;
    }
    return out;
  };

  return {
    id,
    profile,
    seed,
    schemes,
    clipped: { dark: lostIn(schemes.dark), light: lostIn(schemes.light) },
    mark: profile.mark,
    elevation: { dark: ladder('dark'), light: ladder('light') },
    radius: seed.radius,
    space: seed.space,
    density: seed.density,
  };
}

/**
 * A row's identity hue: the farthest point from every hue already spent, measured AFTER simulation
 * rather than on the hue circle, and never within 20 degrees of an intent anchor. Deterministic for
 * its inputs; the kernel never computes it, it calls this and freezes the answer at create (28 §3.2).
 *
 * Measured after simulation because the hue circle is not the space the distance lives in: an even
 * spread by degrees put two of the first four marks 3.6 apart to a deuteranope, which is two
 * projects wearing the same colour for one reader in twelve.
 */
export function nextAccentHue(
  existing: number[],
  profile: Profile = HOUSE_PROFILE,
  allow: (h: number) => boolean = () => true,
): number {
  const defs: Deficiency[] = ['protan', 'deutan', 'tritan'];
  const swatches = (h: number) =>
    (['dark', 'light'] as Scheme[]).map((s) => quantise({ L: profile.mark[s].L, C: profile.mark[s].C, H: h }));

  let best = 0;
  let bestScore = -1;
  for (let h = 0; h < 360; h += 1) {
    if (Object.values(INTENT_HUE).some((anchor) => hueGap(h, anchor) < HUE_FLOOR)) continue;
    if (!allow(h)) continue;
    const mine = swatches(h);
    const score = existing.length
      ? Math.min(
          ...existing.flatMap((e) => {
            const theirs = swatches(e);
            return mine.flatMap((m, i) => defs.map((d) => separation(m, theirs[i]!, d)));
          }),
        )
      : Math.min(...Object.values(INTENT_HUE).map((a) => hueGap(h, a)));
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

export const markColour = (hue: number, scheme: Scheme, profile: Profile = HOUSE_PROFILE): string =>
  `oklch(${profile.mark[scheme].L} ${profile.mark[scheme].C} ${hue})`;

export { rgbToOklab };
