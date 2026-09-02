/**
 * The generator: one seed colour in, a coherent theme out, in-gamut sRGB, with a proof.
 *
 * Contrast-driven, not lightness-driven, for the reason 28 §3 gives: BrainDog already has a
 * refusal gate, so generating by lightness and validating by contrast builds a loop that can fail
 * with no path forward. Generate BY contrast and the checks the generator drives become
 * tautologies. Only the checks it cannot drive — separability, ladder monotonicity — can fail.
 */

import {
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
export const INTENTS = ['earn', 'warn', 'danger'] as const;

export type Role =
  | (typeof SURFACES)[number]
  | (typeof INKS)[number]
  | 'line'
  | 'edge'
  | (typeof INTENTS)[number]
  | 'earn-fill'
  | 'warn-fill'
  | 'danger-fill'
  | 'accent'
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
   * decoration: #F42A2A is the mark, `danger`'s hue anchor is 27, and they are the same hue. Red
   * always means *this is owed, this is late, this is wrong*, so it is the intent least free to drift.
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
  // The fill band IS the mark. #F42A2A is oklch(0.623 0.233 27.4), and `danger`'s hue anchor is 27,
  // so putting the band at that lightness and that chroma makes the chip which means "overdue" the
  // BrainDog red itself, to the byte, in the dark scheme. Green and amber gamut-clamp below it on
  // their own, which is why one pair of numbers serves all three.
  fillChroma: 0.233,
  fillL: { dark: 0.623, light: 0.56 },
  prefer: {
    dark: { earn: 7, warn: 8.5, danger: 5 },
    light: { earn: 4.5, warn: 7, danger: 5.5 },
  },
  weight: { earn: 1, warn: 1, danger: 2.5 },
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
  intentFill: 4.5,
  mark: { dark: { L: 0.78, C: 0.13 }, light: { L: 0.46, C: 0.11 } },
  chromaLadder: [0.18, 0.16, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1],
  targetGrid: [5, 6, 7, 8.5, 10, 12, 14],
  fillChroma: 0.21,
  fillL: { dark: 0.66, light: 0.5 },
  prefer: {
    dark: { earn: 8.5, warn: 10, danger: 7 },
    light: { earn: 5, warn: 7, danger: 5.5 },
  },
  weight: { earn: 1, warn: 1, danger: 2.5 },
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
export const INTENT_HUE: Record<(typeof INTENTS)[number], number> = { earn: 145, warn: 75, danger: 27 };

/** The mark, at full strength. The one colour that is neither a role nor an identity accent. */
export const BRAND_RED = '#F42A2A';

export type Built = {
  id: string;
  profile: string;
  seed: Seed;
  schemes: Record<Scheme, Palette>;
  /** (L, C) per scheme for an identity accent's `oklch(L C h)` — 13 §2.1b. */
  mark: Record<Scheme, { L: number; C: number }>;
  /** The elevation ladder, three levels, fixed geometry, alphas per scheme (28 §1). */
  elevation: Record<Scheme, [string, string, string]>;
  radius: { sm: number; md: number; lg: number };
  space: number;
  density: Seed['density'];
};

const hex = (c: Lch) => toHex(quantise(c));

/** The dialect's whole colour grammar: `#RRGGBB`, `#RGB`, or `oklch(L C H)`. No alpha (28 §1). */
export function parseColour(s: string): Rgb {
  const t = s.trim();
  if (t.startsWith('#')) return fromHex(t);
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

/** Step 1. Dark ascends from a floor; light anchors at the TOP and descends (39 D2). */
function ground(scheme: Scheme, hue: number, chroma: number): Record<(typeof SURFACES)[number], string> {
  const C = Math.min(chroma, 0.008); // a whisper of hue, never a coloured surface
  if (scheme === 'dark') {
    const bg = 0.16;
    const step = 0.028;
    return {
      sunk: hex({ L: bg - step, C, H: hue }),
      bg: hex({ L: bg, C, H: hue }),
      s1: hex({ L: bg + step, C, H: hue }),
      s2: hex({ L: bg + step * 2, C, H: hue }),
      s3: hex({ L: bg + step * 3, C, H: hue }),
    };
  }
  const top = 0.99;
  const step = 0.022;
  return {
    s3: hex({ L: top, C, H: hue }),
    s2: hex({ L: top - step, C, H: hue }),
    s1: hex({ L: top - step * 2, C, H: hue }),
    bg: hex({ L: top - step * 3, C, H: hue }),
    sunk: hex({ L: top - step * 4, C, H: hue }),
  };
}

/** The worst ground a foreground role ever sits on. Solve there and every other surface follows. */
const worstOf = (scheme: Scheme, g: Record<string, string>) => rgb(scheme === 'light' ? g.sunk! : g.s3!);
const away = (scheme: Scheme): 'up' | 'down' => (scheme === 'dark' ? 'up' : 'down');

/** Check F compares the four intent words, and `info` resolves to `accent` — 13 §2.3. */
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
const HUE_FLOOR = 20;
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

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
  const g = ground(scheme, nHue, acc.C);
  const worst = worstOf(scheme, g);
  const dir = away(scheme);

  /* 2 · ink ramp — tinted ink, never coloured ink */
  const Cink = Math.min(acc.C * 0.12, 0.02);
  const [ink, ink2, dim, faint] = profile.ink.map((t) => hex(solveL(t, Cink, nHue, worst, dir))) as [
    string, string, string, string,
  ];

  /* 3 · boundaries. `line` is decorative with no floor, but must not be confusable with `edge`. */
  const edgeC = solveL(profile.edge, Cink, nHue, worst, dir);
  const lineL = scheme === 'dark' ? edgeC.L - 0.07 : edgeC.L + 0.07;
  const edge = hex(edgeC);
  const line = hex({ L: lineL, C: Cink, H: nHue });

  /* 4 · accent. The fill is the seed; the text role is solved, and may sit well above 4.5. */
  const accent = hex(gamutMap(acc));
  let accentText = '';
  for (const t of [4.5, 5, 5.5, 6, 7, 8, 9]) {
    const cand = solveL(t, Math.min(acc.C, 0.16), acc.H, worst, dir);
    // check K: hue alone may not encode meaning — the link must differ from ink in lightness too.
    if (Math.abs(rgbToCielab(quantise(cand)).L - rgbToCielab(rgb(ink)).L) >= 8) {
      accentText = hex(cand);
      break;
    }
  }
  if (!accentText) accentText = hex(solveL(9, Math.min(acc.C, 0.16), acc.H, worst, dir));
  // The theme's own darkest neutral is tried before pure black, so a primary control reads as part
  // of the same warm palette rather than as a hole punched in it. Falls through to black if neither
  // clears — the label on a control is never allowed to be the thing that fails.
  const accentInk =
    [ink, g.sunk, '#FFFFFF', '#000000'].find((c) => contrast(rgb(c), rgb(accent)) >= 4.5) ?? '#000000';

  /* 5 · intents. Solved for text, then SEARCHED for separability — searched, never repaired.
     There is no "retry once with relaxed chroma": a two-stage grid over chroma and contrast
     targets, taking the FIRST palette that clears check F, so the answer is the most saturated
     one that works rather than the first one that happens to (39 D4). */
  const accentRgb = quantise(gamutMap(acc));
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
  const cost = (tE: number, tW: number, tD: number, C: number) =>
    profile.weight.earn * Math.abs(tE - want.earn) +
    profile.weight.warn * Math.abs(tW - want.warn) +
    profile.weight.danger * Math.abs(tD - want.danger) +
    (profile.chromaLadder[0]! - C) * 40;

  let chosen: Record<(typeof INTENTS)[number], string> | null = null;
  let chosenCost = Infinity;
  let best = { worst: -1, pair: '' };
  for (const C of profile.chromaLadder)
    for (const tEarn of profile.targetGrid)
      for (const tWarn of profile.targetGrid)
        for (const tDanger of profile.targetGrid) {
          const c = cost(tEarn, tWarn, tDanger, C);
          if (c >= chosenCost) continue;
          const earn = candidate(tEarn, C, INTENT_HUE.earn);
          const warn = candidate(tWarn, C, INTENT_HUE.warn);
          const danger = candidate(tDanger, C, INTENT_HUE.danger);
          // An intent that has bottomed out against the gamut is achromatic, and an achromatic
          // intent is not a colour — it is ink. The first run of this generator returned pure black
          // for `good` in the high-contrast light scheme, which passed every contrast floor and was
          // indistinguishable from body text.
          if (Math.min(earn.C, warn.C, danger.C) < 0.045) continue;
          const set = [quantise(earn), quantise(warn), quantise(danger), accentRgb];
          const sep = separable(set, 10);
          if (sep.worst > best.worst)
            best = { worst: sep.worst, pair: `${INTENT_NAMES[sep.pair[0]]}/${INTENT_NAMES[sep.pair[1]]}` };
          if (sep.ok) {
            chosen = { earn: hex(earn), warn: hex(warn), danger: hex(danger) };
            chosenCost = c;
          }
        }
  if (!chosen)
    throw new Error(
      `INTENT_INSEPARABLE — in ${scheme}, the best palette on the search grid gets ${best.pair} only ` +
        `${best.worst.toFixed(1)} apart to a dichromat. Four intents need at least 10. ` +
        `Move the accent hue, or widen the profile's chroma ladder.`,
    );

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
    'earn-fill': fill(INTENT_HUE.earn),
    'warn-fill': fill(INTENT_HUE.warn),
    'danger-fill': fill(INTENT_HUE.danger),
    accent,
    'accent-text': accentText,
    'accent-ink': accentInk,
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
  return {
    id,
    profile: profile.id,
    seed,
    schemes: { dark: buildScheme(seed, profile, 'dark'), light: buildScheme(seed, profile, 'light') },
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
export function nextAccentHue(existing: number[], profile: Profile = HOUSE_PROFILE): number {
  const defs: Deficiency[] = ['protan', 'deutan', 'tritan'];
  const swatches = (h: number) =>
    (['dark', 'light'] as Scheme[]).map((s) => quantise({ L: profile.mark[s].L, C: profile.mark[s].C, H: h }));

  let best = 0;
  let bestScore = -1;
  for (let h = 0; h < 360; h += 1) {
    if (Object.values(INTENT_HUE).some((anchor) => hueGap(h, anchor) < HUE_FLOOR)) continue;
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
