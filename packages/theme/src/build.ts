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
  oklabToRgb,
  fromHex,
  gamutMap,
  quantise,
  relLuminance,
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

/**
 * The role each intent is READ in, as words. Three are read in their own name; red is not.
 *
 * 2026-10-02, RED HAS TWO JOBS A STEP APART. As a mark (a late dot, the count on Decide, a badge) it is the mark's own
 * red, `danger`, which a mark needs only 3:1 for and which measures 4.12:1 on the light ground. As words (a late date,
 * the phrase that needs him) it owes 4.5:1, and one red cannot be both the logo's colour and that. So the words have a
 * role of their own, `danger-text`, a step deeper, and everything that measures an intent as text (the search below,
 * checks F, G and K) reads it through this map.
 */
export const INTENT_TEXT = { earn: 'earn', warn: 'warn', danger: 'danger-text', info: 'info' } as const satisfies Record<
  (typeof INTENTS)[number],
  string
>;

export type Role =
  | (typeof SURFACES)[number]
  | (typeof INKS)[number]
  | 'line'
  | 'edge'
  | (typeof INTENTS)[number]
  /* Red as words. `danger` is red as a mark (`INTENT_TEXT` says why there are two). */
  | 'danger-text'
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
  | 'focus-out'
  /* An agent working right now: its ring, its running bar, the "now" line, Slash's
     suggestion lines. NOT AN INTENT: it is a state, never a row's verdict, so check F does not hold it apart from
     `info`. `live` is solved as text, `live-fill` as a mark. */
  | 'live'
  | 'live-fill'
  /* THE BOARD: the page every tile sits on, the tile, and the fill of a control inside or beside one.
     Not rungs of the ladder (check H walks `SURFACES` only): they are what the product paints, at the design's own
     values, and every word and mark is proven on them as on the five (`GROUNDS`). */
  | 'board'
  | 'tile'
  | 'field'
  /* THE WORKING ACCENT: selection, primary buttons, links and charts. Not the brand: `accent` stays the
     mark's red, so a red on screen means one thing. `action` is the fill, `on-action` the label on it, `action-hover`
     the fill under the pointer, the two tints a chosen thing and a stronger one, and `action-text` the accent as
     words, on any ground and on either tint. */
  | 'action'
  | 'action-hover'
  | 'action-tint-1'
  | 'action-tint-2'
  | 'action-text'
  | 'on-action';

export type Palette = Record<Role, string>;

/** Everything a word or a mark is painted on: the five rungs, and the board, the tile and the field. */
export const GROUNDS = [...SURFACES, 'board', 'tile', 'field'] as const satisfies readonly Role[];

/**
 * The generated values that are not colours a theme may set: the row washes and the arrival tint. They carry alpha,
 * which the dialect refuses in a role (`parseColour`: "No alpha"), and a theme has no key for them, the same as
 * elevation. Emitted beside the palette in every scheme block.
 *
 * 2026-10-07, THE GLASS AND THE GROUND'S LIGHT ARE GONE ("no glass, no gradients"). Six values went
 * with them (`glass`, `glass-strong`, `glass-rim`, `glass-hair`, `glass-sat`, `ground-glow`); a host that still names
 * one gets the tile from the skin (`base.css`), and the light falls on nothing.
 */
export const CHROME = ['hover-wash', 'selected', 'arrived-wash'] as const;
export type Chrome = Record<(typeof CHROME)[number], string>;

/** Where a role wants to sit, in OKLCH. `H` omitted is the seed's neutral hue. */
export type Aim = { L: number; C: number; H?: number };

/** A rung of the surface ladder: an OKLab lightness, or a lightness and its own chroma cap. */
export type Rung = number | { L: number; C: number };

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
  ladder?: Record<Scheme, Record<(typeof SURFACES)[number], Rung>>;
  /** The most chroma a surface may carry, per scheme. Omitted, it is 0.01 in dark and 0.014 in light. */
  groundC?: Record<Scheme, number>;
  /**
   * WHERE A ROLE WANTS TO SIT, AND THE FLOOR STILL DECIDES WHERE IT DOES.
   *
   * A design names its inks, its line, its intents and `live` as colours, and a generator
   * that only solves for a ratio lands wherever the ratio lands. An aimed role starts at its aim and is moved along
   * lightness only, holding its hue and chroma, and only as far as its floor on the worst surface asks. So the aim is
   * met exactly wherever the floor allows it, and missed by the least lightness where it does not, and nothing is
   * ever put below a floor to meet one.
   *
   * THE INTENTS ARE STILL SEPARATED. An aimed intent is fixed in the search below and the unaimed ones are searched
   * around it; if no palette on the grid clears check F with the aims held, the aims are dropped and the search runs
   * as it always has.
   */
  aim?: Record<Scheme, Partial<Record<AimRole, Aim>>>;
  /** The chroma ladder the separability search walks, and the contrast grid it walks it against. */
  chromaLadder: number[];
  targetGrid: number[];
  fillChroma: number;
  /** Where a chip or a bar wants to sit, per scheme, when the 3:1 floor leaves it room. */
  fillL: Record<Scheme, number>;
  /**
   * One intent's fill band, where it may not share the others'. Omitted, every fill aims at
   * `fillL`. Either way, a band that misses `intentFill` on the worst surface is solved onto that
   * floor instead.
   */
  fillLOf?: Partial<Record<(typeof INTENTS)[number], Partial<Record<Scheme, number>>>>;
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
  /** The floors the frame is held to (`FrameFloors`, check T), and that high contrast re-solves the frame to. */
  frame: FrameFloors;
};

/**
 * The house's neutral hue, a slate. `HOUSE_SEED` spends it, and a record's own palette keeps it (`record.ts`), because
 * in the design system the ground is the product's and the colour is the record's.
 */
export const HOUSE_NEUTRAL_HUE = 260;

export type AimRole =
  | (typeof INKS)[number]
  | 'line'
  | (typeof INTENTS)[number]
  | 'danger-text'
  | 'live'
  | 'live-fill'
  | 'arrive'
  | 'board'
  | 'tile';

/**
 * The design system's colours, as the generator reads them: every colour it names, in OKLCH, measured off its hex.
 *
 * The inks and the line carry no hue: they take the seed's neutral hue, as the surfaces do, so a record or a pack with
 * its own ground still gets inks leaning with it. The intents and `live` carry the design system's hues, which are not the intent
 * anchors (`INTENT_HUE`): the design system's amber is 52 in light and 65 in dark where the anchor is 75, and its green 155 where
 * the anchor is 145. The anchors stay what identity hues are steered away from; these are what gets painted. Both
 * sit well over `HUE_FLOOR` from `danger`.
 *
 * `faint` aims at `dim`. The design system has no fourth ink ("ink-3 is the lowest text ink"), and `faint` never carries a word
 * here (css-rules' `faint-on-text`), so it is `dim`'s colour held to its own floor.
 *
 * 2026-10-02, TWO LIGHT AIMS MOVED, BECAUSE THE DESIGN SYSTEM'S OWN SENTENCE WAS NOT TRUE OF THEM. It says ink-3 "clears
 * 4.5:1 on `tile` and `ground`", and #6A707B is 4.20:1 on the ground; its red #D92426 is 4.19:1 there. The floor caught
 * both and shipped each at exactly 4.5, which is legal and is also meta text and late dates set at the very edge of AA,
 * on the surface the lists now sit on. So ink-3 aims one step darker in its own hue, #5F6570, 4.95:1, and lands there
 * rather than on its floor. The red splits (`INTENT_TEXT`): its words aim at #C21F22, 5.04:1, and its mark at the house
 * mark itself, #DB2527, which is the seed (`HOUSE_SEED.accent`). #D92426 and #DB2527 were two reds a hair apart,
 * a badge beside the logo that did not quite match it, and the logo keeps its value (SYSTEM 13), so a badge, a late
 * dot and the mark are one colour now. Dark's red already clears 4.5:1 as words, so its two roles are one value.
 *
 * 2026-10-06, THREE LIGHT AIMS MOVED AGAIN, WITH THE GROUND. The light ground came down to give the steps inside a tile
 * room (`HOUSE_PROFILE.ladder`), and every word on the ground lost about four percent of its contrast. Each of the
 * four that had room on purpose keeps it, a step darker in its own hue: ink-2 #484F5A at 6.62:1 (the design system's
 * #4A505B fell just under its 6.5 floor), ink-3 #5C626D at 4.91:1, red words #BD181E at 5.08:1, and green #067342
 * at 4.79:1, where the floor alone would have set green at exactly 4.5.
 *
 * 2026-10-08, LIGHT RED IS THE DEEPER RED, AS A MARK AND AS WORDS. BrainDog red, #CF413A, is the working
 * accent now, so late and "needs you" step a shade deeper to #B3322C, the pressed red, and are one value in both jobs
 * the way dark's red already was. It is not apart from the working red by colour alone and is never asked to be: a late
 * thing carries its word or its mark, and a late bar its hatch (`separation.test.ts`). The mark keeps the logo's red;
 * a badge stopped being the logo on the day the buttons went red.
 *
 * 2026-10-07, THE BOARD AND THE TILE, AT THE ONE-BOARD LOOK'S OWN VALUES: light board #F3F4F6 under a white tile, dark board
 * #0D1014 under #161A20. Each carries its own hue, read off the hex, so the value that ships is the value named. They
 * have no floor to be moved by: both sit inside the band the five rungs already span, so every ink solved on the
 * worst rung clears them too, and check A proves it on them.
 */
const SYSTEM_AIM: Record<Scheme, Partial<Record<AimRole, Aim>>> = {
  light: {
    board: { L: 0.967, C: 0.0029, H: 264.5 }, //  #F3F4F6
    tile: { L: 1, C: 0 }, //                      #FFFFFF
    ink: { L: 0.1779, C: 0.0064, H: 271 }, //    #101114, Look B's ink
    ink2: { L: 0.3699, C: 0.0153, H: 259.8 }, // #3B4048, Look B's ink2
    dim: { L: 0.5362, C: 0.0159, H: 258.4 }, //  #686E77, Look B's muted
    faint: { L: 0.5362, C: 0.0159, H: 258.4 },
    line: { L: 0.9215, C: 0.0058, H: 264.5 }, // #E3E5E9, Look B's rule
    danger: { L: 0.5137, C: 0.1667, H: 27.4 }, //    #B3322C, the deeper red
    'danger-text': { L: 0.5137, C: 0.1667, H: 27.4 }, // #B3322C
    earn: { L: 0.5285, C: 0.1061, H: 154.6 }, //   #2E7D4F, Look B's good
    warn: { L: 0.5198, C: 0.133, H: 52.4 }, //     #A24E00
    live: { L: 0.6206, C: 0.1415, H: 152.7 }, //   #2E9E5B, Look B's live
    'live-fill': { L: 0.6206, C: 0.1415, H: 152.7 },
    arrive: { L: 0.958, C: 0.0202, H: 279.9 }, //  #EEF0FF
  },
  dark: {
    board: { L: 0.1716, C: 0.0097, H: 255.7 }, // #0D1014
    tile: { L: 0.2163, C: 0.0133, H: 258.4 }, //  #161A20
    ink: { L: 0.9484, C: 0.0046, H: 258.3 }, //  #ECEEF1, Look B's ink
    ink2: { L: 0.831, C: 0.0112, H: 256.7 }, //  #C3C8CF, Look B's ink2
    dim: { L: 0.6706, C: 0.0168, H: 257.2 }, //  #8F96A0, Look B's muted
    faint: { L: 0.6706, C: 0.0168, H: 257.2 },
    line: { L: 0.2821, C: 0.0155, H: 252.4 }, // #242A31, Look B's rule
    danger: { L: 0.6876, C: 0.2015, H: 25.7 }, //  #FF5A55
    'danger-text': { L: 0.6876, C: 0.2015, H: 25.7 },
    earn: { L: 0.7439, C: 0.1056, H: 155.3 }, //   #72C08F, Look B's good
    warn: { L: 0.7698, C: 0.1376, H: 64.7 }, //    #F0A04B
    live: { L: 0.6206, C: 0.1415, H: 152.7 }, //   #2E9E5B, Look B's live
    'live-fill': { L: 0.6206, C: 0.1415, H: 152.7 },
    arrive: { L: 0.281, C: 0.0687, H: 279.9 }, //  #23244A
  },
};

export const HOUSE_PROFILE: Profile = {
  id: 'house',
  /* 2026-09-29, THE DESIGN SYSTEM'S OWN FLOORS ("every text pair clears 4.5:1 ... ink-3 is the lowest
     text ink"). This was [14, 9, 6.5, 4.5], a ramp pushed to "the most the validator will accept", and at those floors
     the design system's ink-2 and ink-3 cannot exist: ink-2 measures 6.84:1 on the ground and ink-3 4.20:1. The ramp now sits
     where the design system draws it (`aim` below) and these are the floors under it: ink at 13, which the design system's ink clears on the
     lightest dark surface with room, ink-2 at 6.5, and ink-3 at AA. */
  ink: [13, 6.5, 4.5, 4.5],
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
  // pair of numbers serves all four, bar the light warn fill, which `fillLOf` moves below.
  fillChroma: 0.233,
  fillL: { dark: 0.623, light: 0.56 },
  /* THE LIGHT WARN FILL WAS MUSTARD, AND THE FILL IS THE HALF OF THE WARN PAIR THAT CAN MOVE.
     At the shared light band, 0.56, amber clamps to #9C6900, which the design review read as brown
     on the due-soon dots. A fill only owes 3:1 to the darkest light surface, so warn aims at the
     dark scheme's own band instead: #B37900 against dark's #B47900, one amber in both schemes, 3.11:1 on the cool light `sunk` when solved on 25 September. The warn TEXT role
     stays where check F puts it: with `danger` held at 4.5:1, every lighter warn text measured on
     that day came within 10 of `danger` to a deuteranope (5.7 at 4.5:1, 9.8 at 6:1), so the 7:1
     brown is the lightest warn text the four-intent floor allows, and the tab badge, which is drawn
     in the text role (`TabBar.svelte`), keeps it. 2026-10-02: red's words sit a step deeper now, 5:1
     (`danger-text`), and the same walk lands the warn text on #522400, 11:1 on the ground. */
  fillLOf: { warn: { light: 0.62 } },
  /**
   * DARKER AND COOLER THAN THE DEFAULT LADDER. The default puts dark `bg` at L 0.241, a warm
   * charcoal. The house sits where the product it is measured against sits, `bg` at L 0.168, and
   * the note on `LADDER` calling 0.168 an OLED test pattern was written about a warm hue: at 165,
   * with the chroma capped, it reads as near-black glass and the cards on it read as cards. Light
   * keeps the default rungs. `groundC` holds the light tint to 0.006, because 0.014 at hue 165 is
   * mint.
   */
  /**
   * 2026-09-29, THE DESIGN SYSTEM'S GROUND, TILE AND TILE-2. `sunk` is the ground, the page
   * itself; `bg` is the tile; `s1` is tile-2, the well inside a tile. Each rung carries the design system's own chroma, a cool
   * slate at the seed's neutral hue, which the old flat cap of 0.004 could not reach (the design system's dark tile-2 is 0.0185).
   *
   * THE LIGHT LADDER TURNS OVER AT THE TILE. The tile is white, so nothing can sit above it, and tile-2 is a grey
   * inside it: `s1`, `s2` and `s3` step DOWN from `bg` in light, toward the ground and never onto it, and UP from `bg`
   * in dark. They step away from the tile in both schemes, which is what check H now asks.
   *
   * `s3` IS THE CEILING, BECAUSE TWO FLOORS MEET THERE. In dark, `s3` is the lightest surface, so it is where the
   * accent fill (check R, 3:1) and ink-3 (check A, 4.5:1) are both measured. At L 0.275 the brand red clears 3:1 by
   * 0.04 and the design system's ink-3 clears AA by 0.29, so nothing above it can be lighter. In light `s2` and `s3`
   * share the gap between tile-2 and the ground.
   *
   * 2026-10-02, SO THE DARK LADDER WIDENS DOWNWARD. Under that ceiling the design system's rungs put `s1`, `s2` and
   * `s3` within 0.016 of each other, under one delta-E a step, so a quiet button's hover and a focused row drew
   * nothing in dark, and its ground sat 3.6 delta-E under a tile. The ground and the tile come down, `s1` to `s3`
   * step 0.02 apart, and every rung keeps the design system's lean, chroma about 0.07 of its lightness. Ground to tile
   * is 4.1 delta-E now, tile to well 2.5 and each step above it 1.6, and glass over the ground stands 4.75 off it,
   * with ink-3 on it at 5.69:1. The inks and every intent are solved on `s3`, which did not move, so none of them did.
   *
   * 2026-10-06, AND THE LIGHT LADDER WIDENS THE SAME WAY. Its `s1` to `s3` sat 0.8 and 0.95 delta-E apart, so the
   * hover inside a white tile, the focused question and the chosen segment drew next to nothing in light while they
   * read in dark. The steps live between the tile and the ground and never on it, and there was not room for two
   * steps a reader sees, so the ground comes down to L 0.925 (#E4E6EB) and `s2` and `s3` step 0.02 apart under the
   * tile-2 the design system names (#F2F4F7, which stays). The tile is 5.8 delta-E off the ground, the well 2.8 under
   * the tile, each step under that 1.5 and 1.4, and glass over the ground 4.1 (`GLASS`). The ground is the worst
   * surface in light, so the words on it lost about four percent, and the four aims that had room keep it
   * (`SYSTEM_AIM`). `s3` sits one code value over the ground, as close as it ever was (0.84 delta-E, from 0.81):
   * it is a step inside a tile and never meets the ground there.
   */
  ladder: {
    dark: {
      sunk: { L: 0.105, C: 0.0045 }, //  #030405, under Look B's page; ground to paper must be 4 delta-E
      bg: { L: 0.1983, C: 0.0076 }, //   #131619, Look B's paper
      s1: { L: 0.2335, C: 0.0152 }, //   #181D24, Look B's soft within two code values
      s2: { L: 0.2543, C: 0.0146 }, //   #1F242B, a step on toward Look B's rule
      s3: { L: 0.275, C: 0.0140 }, //    #232930, the ceiling; Look B's rule is a hair above it
    },
    light: {
      sunk: { L: 0.925, C: 0.0065 }, //  #E4E6EB, Look B's rule within a code value
      bg: { L: 1, C: 0 }, //             #FFFFFF, Look B's page
      s1: { L: 0.9665, C: 0.0045 }, //   #F2F4F7, Look B's paper; the well floor is 2.5 delta-E, soft is 2.1
      s2: { L: 0.9465, C: 0.0055 }, //   #EBEDF1, Look B's rule2 within two code values
      s3: { L: 0.9265, C: 0.0062 }, //   #E4E7EB, Look B's rule within a code value
    },
  },
  /* The cap for a rung that gives no chroma of its own, and the inks' default lean (`Cink`). */
  groundC: { dark: 0.02, light: 0.0065 },
  aim: SYSTEM_AIM,
  prefer: {
    dark: { earn: 7, warn: 8.5, danger: 5, info: 6 },
    light: { earn: 4.5, warn: 7, danger: 5.5, info: 5.5 },
  },
  weight: { earn: 1, warn: 1, danger: 2.5, info: 1 },
  /* THE FRAME'S FLOORS (SPEC 1.2): every word at AA, and the body ink at AAA, which the frame clears by three and more
     everywhere (its least is 10.85, on a dark selection). Not the dialect's 13: the frame's dark ink on `tile-2` is
     12.90 and on `nav-selected` 12.03, his values, both far past what a reader needs. The second ink keeps the
     dialect's 6.5. */
  frame: { ink: [7, 6.5, 4.5], text: 4.5, mark: 3, boundary: null },
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
  /* 2026-09-29, THE SAME SHAPE AS THE HOUSE LADDER (the ground lowest, `s1` to `s3` stepping away from the tile), and
     the same closeness it always had. Light's tile is white and its ground only as far below as a 16:1 ink allows;
     dark keeps `s3` at 0.244, where pure white clears 16:1. */
  ladder: {
    dark: { sunk: 0.16, bg: 0.196, s1: 0.212, s2: 0.228, s3: 0.244 },
    light: { sunk: 0.955, bg: 1, s1: 0.985, s2: 0.975, s3: 0.965 },
  },
  groundC: { dark: 0.012, light: 0.005 },
  /* The design system's colours are where high contrast starts too; its higher floors decide how far each one moves.
     EXCEPT LIGHT'S INK, WHICH STARTS DARKER. The house ink already clears 16:1 on this ladder's lightest ground, so a
     floor alone never moved it and the light high-contrast page drew its words in exactly the house ink: the palette
     changed the grounds and the quieter inks and left the one colour a reader turns it on for. Dark's ink is pushed
     to near-white by its floor, so it moves on its own. */
  aim: { dark: SYSTEM_AIM.dark, light: { ...SYSTEM_AIM.light, ink: { L: 0.13, C: 0.008 } } },
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
  /* The dialect's own high-contrast floors, on the frame's names: the three inks at 16, 12.5 and 9.5, every other word
     at 5, a mark and the edge of a floating layer at 4.5. */
  frame: { ink: [16, 12.5, 9.5], text: 5, mark: 4.5, boundary: 4.5 },
};

export type Seed = {
  /** The interactive hue. Refused below chroma 0.02: there is no hue to build from. */
  accent: string;
  /** The hue every surface and every ink carries a whisper of. A number, or the accent's. */
  neutralHue: number | 'from-accent';
  space: number;
  radius: { sm: number; md: number; lg: number };
  density: 'compact' | 'comfortable' | 'roomy';
  /**
   * THE WORKING ACCENT, PINNED, AND ONLY BESIDE THE ACCENT IT WAS CHOSEN WITH.
   *
   * Omitted, `action` is solved from `accent`, which is what a record's own colour asks for: the person picks a
   * green and the buttons, the links, the selection and the charts go green. The house is the one seed whose working
   * colour is not solved from its accent (the accent is the mark's red, the working colour BrainDog red, #CF413A, a
   * named pair with its pressed step), so it names both here.
   *
   * KEYED BY `accent` BECAUSE A SEED IS SPREAD. `{ ...HOUSE_SEED, accent }` is how a look, an environment or a record
   * starts from the house, and a pin that travelled with the spread would keep the house red under every colour
   * anybody chose: the control would report success and paint the same buttons. A pin whose `accent` is not the seed's
   * is ignored, and the action is solved from the colour that is there.
   *
   * `pressed` PINS THE FILL UNDER THE POINTER, per scheme, and only beside the same accent. 2026-10-08:
   * the house's light hover is its pressed red, #B3322C, a named colour rather than a step the generator would pick. A
   * scheme it does not name keeps the solved step, which walks away from the label.
   */
  action?: { accent: string; light: string; dark: string; pressed?: Partial<Record<Scheme, string>> } | undefined;
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
  /** The row washes and the arrival tint, per scheme. Not roles: see `CHROME`. Solved and checked, no longer emitted. */
  chrome: Record<Scheme, Chrome>;
  /** What the stylesheet paints with, per scheme (`FRAME_ROLES`, `frameOf`). */
  frame: Record<Scheme, Frame>;
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
    if (!HEX.test(t)) throw new Error(`THEME_VALUE_INVALID: "${s}" is not a colour this dialect accepts.`);
    return fromHex(t);
  }
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(t);
  if (!m) throw new Error(`THEME_VALUE_INVALID: "${s}" is not a colour this dialect accepts.`);
  return quantise(gamutMap({ L: Number(m[1]), C: Number(m[2]), H: Number(m[3]) }));
}

const rgb = (s: string) => parseColour(s);

/** Step 0. Below chroma 0.02 the hue angle is numerically unstable — two greys can be 180 apart. */
export function normalise(seed: string): Lch {
  const c = rgbToLch(rgb(seed));
  if (c.C < 0.02)
    throw new Error(
      `theme: the seed ${seed} is almost grey, so there is no hue to build from. Pick a colour with some chroma in it.`,
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
  rungs?: Record<(typeof SURFACES)[number], Rung>,
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
  const ladder = rungs ?? LADDER[scheme];
  /* A rung that names its own chroma is capped by the seed's, never raised past it: a near-grey seed still gets a
     near-grey ground. */
  const at = (r: Rung) => (typeof r === 'number' ? { L: r, C, H: hue } : { L: r.L, C: Math.min(chroma, r.C), H: hue });
  return Object.fromEntries(SURFACES.map((s) => [s, hex(at(ladder[s]))])) as Record<(typeof SURFACES)[number], string>;
}

/**
 * The lightest or darkest of the five, by relative luminance: what a foreground role is solved against.
 *
 * READ OFF THE COLOURS, NOT OFF THE NAMES. It was `sunk` in light and `s3` in dark by name, which held while the
 * ladder climbed in both schemes. The design system's light ladder turns over at the tile, and a name-based answer would be one
 * ladder change away from solving every ink against the wrong surface.
 */
const extreme = (g: Record<string, string>, darkest: boolean) =>
  SURFACES.map((s) => rgb(g[s]!)).reduce((a, b) => ((relLuminance(b) < relLuminance(a)) === darkest ? b : a));

/**
 * The worst ground a foreground role ever sits on. Solve there and every other surface follows.
 *
 * THE FIVE SURFACES, AND NOT A ROW'S WASH OVER THEM, which is an open question rather than an oversight. The design system's
 * light wash is darker than its ground, so a selected row's ink-3 meta reads at about 4.0:1 on it. Solving on the
 * washed ground was measured on 2026-09-29 and moves six of the design system's light values (red to #CA0717, amber to #512300),
 * which is a design decision about the wash and not the generator's to take.
 */
const worstOf = (scheme: Scheme, g: Record<string, string>) => extreme(g, scheme === 'light');
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
  /* No more chroma than the ground plus a hair: a warm ink on a grey ground reads as brown. */
  const Cink = Math.min(0.012, (profile.groundC?.[scheme] ?? 0.012) + 0.002);

  /* An aimed role at its aim, or moved along L to its floor against `against`; an unaimed one is `otherwise()`. The
     floor is measured on the quantised colour, which is the one that ships. */
  const aims = profile.aim?.[scheme] ?? {};
  const place = (role: AimRole, floor: number | null, otherwise: () => Lch, against: Rgb = worst): Lch => {
    const a = aims[role];
    if (!a) return otherwise();
    const H = a.H ?? nHue;
    const at = gamutMap({ L: a.L, C: a.C, H });
    return floor === null || contrast(quantise(at), against) >= floor ? at : solveL(floor, a.C, H, against, dir);
  };

  const [ink, ink2, dim, faint] = profile.ink.map((t, i) =>
    hex(place(INKS[i]!, t, () => solveL(t, Cink, nHue, worst, dir))),
  ) as [string, string, string, string];

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
  /* 2026-09-16, back to a hairline: space separates groups now, so a
     line only has to be findable, and 1.55 drew a box around everything. */
  /* 2026-09-29: the design system's line is aimed, and has no floor to be moved by. It measures 1.24:1 on the tile in both
     schemes. */
  const line = hex(place('line', null, () => solveL(1.35, Cink, nHue, rgb(g.bg), dir)));

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

  let best = { worst: -1, pair: '' };

  // The set is the four INTENT WORDS and nothing else. The accent is deliberately not a member:
  // it shares `danger`'s hue by design, and an accent is chrome — it never appears as a row's
  // verdict, so it is never the thing a reader has to tell a `bad` chip apart from.
  /* AN AIMED INTENT IS HELD, and the grid walks only the ones that are not: its target collapses to the one it is
     preferred at, so it adds nothing to the cost and nothing to the search. */
  const search = (held: Partial<Record<(typeof INTENTS)[number], Lch>>) => {
    let found: Record<(typeof INTENTS)[number], string> | null = null;
    let foundCost = Infinity;
    const grid = (k: (typeof INTENTS)[number]) => (held[k] ? [want[k]] : profile.targetGrid);
    for (const C of profile.chromaLadder)
      for (const tEarn of grid('earn'))
        for (const tWarn of grid('warn'))
          for (const tDanger of grid('danger'))
            for (const tInfo of grid('info')) {
              const t = { earn: tEarn, warn: tWarn, danger: tDanger, info: tInfo };
              const c = cost(t, C);
              if (c >= foundCost) continue;
              const solvedSet = INTENTS.map((k) => held[k] ?? candidate(t[k], C, INTENT_HUE[k]));
              // An intent that has bottomed out against the gamut is achromatic, and an achromatic
              // intent is not a colour — it is ink. The first run of this generator returned pure
              // black for `good` in the high-contrast light scheme, which passed every contrast floor
              // and was indistinguishable from body text.
              if (Math.min(...solvedSet.map((s) => s.C)) < 0.045) continue;
              const sep = separable(solvedSet.map(quantise), 10);
              if (sep.worst > best.worst)
                best = { worst: sep.worst, pair: `${INTENT_NAMES[sep.pair[0]]}/${INTENT_NAMES[sep.pair[1]]}` };
              if (sep.ok) {
                found = Object.fromEntries(INTENTS.map((k, i) => [k, hex(solvedSet[i]!)])) as Record<
                  (typeof INTENTS)[number],
                  string
                >;
                foundCost = c;
              }
            }
    return found;
  };
  /* THE AIMS ARE NOT ALWAYS SEPARABLE AS WRITTEN, AND THE DESIGN SYSTEM'S ARE NOT. Measured on 2026-09-29, its amber and its red
     are delta-E 4.0 apart to a deuteranope in light and 8.1 in dark, and its green and amber 9.9 to a protanope in
     dark, against check F's floor of 10. So the aimed intents are walked AWAY FROM THE GROUND along lightness, which
     only ever adds contrast, in steps of 0.01, cheapest move first by the profile's own weights (`danger` the
     dearest), until the aimed set clears the floor among itself. The unaimed ones are then searched around it.

     THE SEARCH IS OVER THE WORDS (`INTENT_TEXT`), so red enters it at its words' aim and `chosen.danger` below is
     `danger-text`. Red as a mark is placed after it, at step 5b. */
  const aimed = INTENTS.filter((k) => aims[INTENT_TEXT[k]]);
  const start = Object.fromEntries(
    aimed.map((k) => [
      k,
      place(INTENT_TEXT[k], profile.intentText, () => candidate(want[k], profile.chromaLadder[0]!, INTENT_HUE[k])),
    ]),
  ) as Partial<Record<(typeof INTENTS)[number], Lch>>;
  const moved = (k: (typeof INTENTS)[number], step: number): Lch => {
    const s = start[k]!;
    return gamutMap({ ...s, L: Math.min(0.98, Math.max(0.02, s.L + (dir === 'up' ? step : -step) * 0.01)) });
  };
  const STEPS = 26;
  const moves: number[][] = [[]];
  for (const _ of aimed) moves.splice(0, moves.length, ...moves.flatMap((m) => [...Array(STEPS).keys()].map((n) => [...m, n])));
  moves.sort(
    (a, b) =>
      a.reduce((sum, n, i) => sum + n * profile.weight[aimed[i]!], 0) -
      b.reduce((sum, n, i) => sum + n * profile.weight[aimed[i]!], 0),
  );
  const move = moves.find((m) => separable(m.map((n, i) => quantise(moved(aimed[i]!, n))), 10).ok);
  const held = (move ? Object.fromEntries(aimed.map((k, i) => [k, moved(k, move[i]!)])) : {}) as Partial<
    Record<(typeof INTENTS)[number], Lch>
  >;
  const chosen = (Object.keys(held).length > 0 ? search(held) : null) ?? search({});
  if (!chosen)
    throw new Error(
      `INTENT_INSEPARABLE: in ${scheme}, the best palette on the search grid gets ${best.pair} only ` +
        `${best.worst.toFixed(1)} apart to a dichromat. Four intents need at least 10. ` +
        `Move the accent hue, or widen the profile's chroma ladder.`,
    );

  /* 5b · RED AS A MARK: a late dot, the count on Decide, a badge. Held to the mark floor (`intentFill`) and not the
     words' one, because nobody reads a dot, and that is what lets it be the mark's own colour in the light scheme,
     where the words cannot be. Unaimed, it is the words' red, which clears both floors. */
  const dangerMark = hex(place('danger', profile.intentFill, () => rgbToLch(rgb(chosen.danger))));

  /* 6 · the accent AS TEXT — solved last, because it has to keep clear of two colours rather than
     one, and the second is not known until the intents are.

     Check K's rule is that hue alone may never encode meaning, so a link has to differ from body
     ink in LIGHTNESS. In this theme it has to differ from red words too (`danger-text`, which is
     `chosen.danger` here), and for a stronger reason: the accent and the red are the same hue by
     design, and solving both against the same ground at similar contrast targets put them on the
     same value — a link and an overdue figure rendering to one colour, in the scheme where the
     product is read most. So the search walks upward until the candidate is 8 L* clear of both.
     Falling back to the top of the range rather than refusing: an unreadable link is a floor, and
     this is a collision. */
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
  const fill = (k: (typeof INTENTS)[number]) => {
    const h = INTENT_HUE[k];
    const L = profile.fillLOf?.[k]?.[scheme] ?? profile.fillL[scheme];
    const band = gamutMap({ L, C: profile.fillChroma, H: h });
    return contrast(quantise(band), worst) >= profile.intentFill
      ? hex(band)
      : hex(solveL(profile.intentFill, profile.fillChroma, h, worst, dir));
  };

  /* 7 · live. Held to the intent floors, as text and as a mark, because it is drawn as both: the "now" line and a
     suggestion line are read, the ring and the running bar are seen. Unaimed, it is solved on an indigo nobody else
     spends. */
  const LIVE_HUE = 280;
  const live = hex(place('live', profile.intentText, () => solveL(profile.intentText, 0.16, LIVE_HUE, worst, dir)));
  const liveFill = hex(
    place('live-fill', profile.intentFill, () => solveL(profile.intentFill, 0.16, LIVE_HUE, worst, dir)),
  );

  /* 8 · THE BOARD. The board and the tile at their aims, or the ground and the panel where a profile
     names none; the field is the step a control sits on, one rung off the tile: `s2` in light, where the steps go
     down from a white tile, and `s3` in dark, where they go up. */
  const board = aims.board ? hex(place('board', null, () => acc)) : g.sunk;
  const tile = aims.tile ? hex(place('tile', null, () => acc)) : g.bg;
  const field = scheme === 'light' ? g.s2 : g.s3;
  const boardGrounds = [board, tile, field];

  /* 9 · THE WORKING ACCENT. Pinned beside the accent it was chosen with (`Seed.action`), or solved from the accent: in
     light the accent itself, which check R has already held to 3:1 on every ground, so the colour a person picked is
     the colour their buttons are; in dark a lighter step of it, as light as the design's old blue was (L 0.72) and no
     more saturated, because a mid-tone fill on a near-black tile reads as a hole and its words as mud.

     2026-10-08, THE HOUSE PIN IS RED. BrainDog red, #CF413A, in light, with #B3322C under the pointer;
     in dark the nearest red of that hue whose label and whose hover both clear their floors (`HOUSE_SEED`, ELEVEN). */
  const pinned = seed.action && toHex(rgb(seed.action.accent)) === toHex(rgb(seed.accent)) ? seed.action : null;
  const pin = pinned ? pinned[scheme] : null;
  const action = pin
    ? toHex(rgb(pin))
    : hex(scheme === 'light' ? gamutMap(acc) : gamutMap({ L: Math.max(acc.L, 0.72), C: Math.min(acc.C, 0.15), H: acc.H }));
  const actionLch = rgbToLch(rgb(action));

  /* The label on it: the tile or the ink, whichever stands further off it, and black or white only where neither
     clears AA. White on the light red, the dark tile on the dark one. */
  const onAction = (() => {
    const by = (c: string) => contrast(rgb(c), rgb(action));
    const best = [tile, ink].reduce((a, b) => (by(b) > by(a) ? b : a));
    return by(best) >= 4.5 ? best : by('#FFFFFF') >= by('#000000') ? '#FFFFFF' : '#000000';
  })();
  /* Hover steps away from the label, as `accent-hover` does, and only as far as the label still reads. A pinned
     pressed colour is taken as named: check S holds its label to AA like any other. */
  const labelIsLight = rgbToLch(rgb(onAction)).L > 0.5;
  const pressed = pinned?.pressed?.[scheme];
  const actionHover = pressed
    ? toHex(rgb(pressed))
    : ([0.05, 0.07, 0.09]
        .map((d) => hex(gamutMap({ ...actionLch, L: Math.min(0.98, Math.max(0.02, actionLch.L + (labelIsLight ? -d : d))) })))
        .find((c) => contrast(rgb(c), rgb(onAction)) >= 4.5) ?? action);

  /* THE TWO TINTS, the accent laid over the tile as `color-mix(in srgb, …)` would, and as strong as the words on them
     allow. A chosen row is `tint-1`, so its meta line (`dim`) sits on it, and the text inside a selection or a chosen
     segment sits on `tint-2`: each steps down a percent at a time until every word it carries clears AA. In dark,
     12% is where `dim` still clears 4.5:1 on the first, and 22% where body and second text do on the second.

     A CHOSEN ROW STILL SAYS ITS STATE, so the first tint carries the intents' words and `live` too: dark `info` measured
     4.35:1 on a 12% tint that was solved for the inks alone, a row whose status went under AA the moment it was picked. */
  const over = (top: string, under: string, a: number) => {
    const t = rgb(top);
    const u = rgb(under);
    return toHex({ r: t.r * a + u.r * (1 - a), g: t.g * a + u.g * (1 - a), b: t.b * a + u.b * (1 - a) });
  };
  const tint = (want: number, words: string[]) => {
    for (let a = want; a > 0.005; a -= 0.01) {
      const t = over(action, tile, a);
      if (words.every((w) => contrast(rgb(w), rgb(t)) >= 4.5)) return t;
    }
    return tile;
  };
  const states = [chosen.earn, chosen.warn, chosen.danger, chosen.info, live];
  const tint1 = tint(scheme === 'light' ? 0.1 : 0.12, [ink, ink2, dim, ...states]);
  const tint2 = tint(scheme === 'light' ? 0.2 : 0.22, [ink, ink2]);

  /* THE ACCENT AS WORDS: the fill itself where it clears the intent floor on every ground and on both tints, and
     otherwise the least move along lightness, away from the ground, in its own hue, that does. The red fill is under
     4.5:1 on the light board and on the dark field, so in both schemes its words are a step off the fill: deeper in
     light, lighter in dark (ELEVEN in `index.ts` has the figures). */
  const textGrounds = [...SURFACES.map((s) => g[s]), ...boardGrounds, tint1, tint2].map(rgb);
  const worstText = textGrounds.reduce((a, b) => ((relLuminance(b) < relLuminance(a)) === (scheme === 'light') ? b : a));
  const actionText =
    contrast(rgb(action), worstText) >= profile.intentText
      ? action
      : hex(solveL(profile.intentText, actionLch.C, actionLch.H, worstText, dir));

  return {
    ...g,
    board,
    tile,
    field,
    ink,
    ink2,
    dim,
    faint,
    line,
    edge,
    earn: chosen.earn,
    warn: chosen.warn,
    danger: dangerMark,
    'danger-text': chosen.danger,
    info: chosen.info,
    'earn-fill': fill('earn'),
    'warn-fill': fill('warn'),
    'danger-fill': fill('danger'),
    'info-fill': fill('info'),
    live,
    'live-fill': liveFill,
    accent,
    'accent-edge': accentEdge,
    'accent-text': accentText,
    'accent-ink': accentInk,
    'accent-hover': accentHover,
    'accent-press': accentPress,
    action,
    'action-hover': actionHover,
    'action-tint-1': tint1,
    'action-tint-2': tint2,
    'action-text': actionText,
    'on-action': onAction,
    /* The ring is two tones, nine apart, so it survives on every surface in both schemes. */
    'focus-in': ink,
    'focus-out': g.bg,
  };
}

/** A colour's three channels as `rgb()` writes them: the row wash is the ink at an alpha. */
const channels = (hexColour: string) => {
  const c = fromHex(hexColour);
  return [c.r, c.g, c.b].map((v) => Math.round(v * 255)).join(' ');
};

/**
 * The arrival tint, at the design system's `arrive` and held inside the surface band.
 *
 * IT IS OPAQUE AND A ROW'S TEXT SITS ON IT, so it may be no further from the inks than the worst surface is: every
 * ink is proven on that surface and so, by luminance, on this. The design system's own values are inside the band in the house
 * ladders; high contrast's darker `s3` moves the dark one down to meet it.
 */
function arrival(p: Palette, profile: Profile, scheme: Scheme): string {
  const a = profile.aim?.[scheme]?.arrive ?? { L: scheme === 'light' ? 0.958 : 0.281, C: 0.02 };
  const at = (L: number) => quantise({ L, C: a.C, H: a.H ?? 280 });
  const edge = relLuminance(extreme(p, scheme === 'light'));
  const inside = (L: number) => (scheme === 'light' ? relLuminance(at(L)) >= edge : relLuminance(at(L)) <= edge);
  if (inside(a.L)) return toHex(at(a.L));
  let out = a.L;
  let into = scheme === 'light' ? 1 : 0;
  for (let i = 0; i < 28; i++) {
    const mid = (out + into) / 2;
    if (inside(mid)) into = mid;
    else out = mid;
  }
  return toHex(at(into));
}

/**
 * The washes of one scheme.
 *
 * 2026-10-07, THE HOVER WASH IS THE INK, AND IT WAS WHITE. White at 60% lifted a row off the grey ground, which is where
 * rows sat; a row lives in a tile on the board now, and white over a white tile is no wash at all. The
 * ink at 5% darkens a light tile and lightens a dark one, so one rule answers both schemes, and every word on it keeps
 * its floor (`theme.test.ts`). A CHOSEN ROW IS THE ACCENT'S FIRST TINT, which every word it carries is solved to clear.
 */
function chromeOf(p: Palette, profile: Profile, scheme: Scheme): Chrome {
  return {
    'hover-wash': `rgb(${channels(p.ink)} / 0.05)`,
    selected: p['action-tint-1'],
    'arrived-wash': arrival(p, profile, scheme),
  };
}

/*
 * 2026-10-20, NO ELEVATION AT ALL (the UI pass, SPEC 1.9 and frame 3.8). Separation is the surface colour, the 1px
 * `--rule-strong` edge on anything that floats without a scrim, and the scrim under anything modal. All three levels are
 * `none` in both schemes and no stylesheet writes them (the names went in the last wave). Check I refuses a level that
 * casts anything.
 */
function elevationOf(_scheme: Scheme): [string, string, string] {
  return ['none', 'none', 'none'];
}

/* ── THE FRAME (UI pass, 20 Oct) ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The names the product paints with, emitted into every scheme block (`toCSS`): the surfaces, the three inks, the
 * status hues and their tints, the two reds (a fill and red as words and marks), the eight category slots, and the
 * three control colours the switch and the segmented control need. SPEC 1.1, which is frame 3.1 with the red rows
 * replaced, at its own values.
 *
 * THE ROLES ABOVE STAY THE THEME'S DIALECT. A theme declaration, a look and a record's colour still speak in `bg`,
 * `danger-text`, `action` and the rest, the solver still solves them and checks A to S still hold them. The frame is
 * read off them where a seed brings its own colour (the fill family, below) and is the design's own values everywhere
 * else, so the surfaces and inks are the product's whatever colour a record picks, as the ground always was.
 *
 * HIGH CONTRAST IS RE-SOLVED FROM THESE NAMES (`profile.frame`): the grounds come down in dark until the profile's ink
 * floor can stand on the lightest of them, and every word and mark moves along its own lightness, in its own hue, only
 * as far as its floors ask. Check T holds every pair in `FRAME_PAIRS` at the profile's floors.
 */

/**
 * The eight category slots, in the order a series takes them (frame 3.4).
 *
 * THE SIXTH IS `yellow`, WHERE FRAME 3.4 NAMES IT FOR THE PRECIOUS METAL. That word is a use case, and the core may name
 * none (`tools/gates/shell-words.mjs`): the gate reads every literal and every `.svelte` style here and in the apps,
 * so `--cat-<metal>` would be refused in this file and in every screen that paints a project with it. Same values.
 */
export const CATS = ['blue', 'violet', 'pink', 'teal', 'sky', 'yellow', 'lime', 'slate'] as const;

export const FRAME_ROLES = [
  'board',
  'tile',
  'tile-2',
  'hover',
  'nav',
  'nav-selected',
  'rule',
  'rule-strong',
  'toast',
  'on-toast',
  'ink',
  'ink-2',
  'ink-3',
  'focus',
  'good',
  'good-tint',
  'warn',
  'warn-tint',
  /* Amber as a bar or a mark, not words: "Not named yet" on Payees and Reports (polish5, 2 Nov). */
  'warn-fill',
  'info',
  'info-tint',
  'live',
  'switch-off',
  /* The switch's knob and the chosen segment: white in light, and a raised step above the track in dark (frame F23). */
  'knob',
  'segment-on',
  /* The wash a row or a figure wears for 1.5s after it lands: neutral, the ink a step into the tile (SPEC 0.2). */
  'arrived',
  'red-fill',
  'red-fill-hover',
  'red-fill-press',
  'on-red',
  'red',
  'red-tint',
  'red-tint-2',
  /* A CHOSEN THING AND A LINK, APART FROM THE RED (dark grey lane, 2 Nov). In light each is the accent, as it was:
     `chosen` its first tint (a picked row, a pressed choice), `chosen-2` its second (a text selection, a chosen row
     under the pointer), `on` its fill (a ticked box, a chosen ring, the edge of the chosen or suggested answer), `on-mark`
     the label on it, `link` red as words. In dark they are the greys and the ink, so the accent is only the one main
     action and red only what is late or failing: the page reads grey, not red. */
  'chosen',
  'chosen-2',
  'on',
  'on-mark',
  'link',
  ...CATS.flatMap((c) => [`cat-${c}`, `cat-${c}-tint`] as const),
  /* EACH SLOT AS A FILL (polish5, 2 Nov): a bar, a part of a donut, a budget's track. `cat-<slot>` is held at 4.5:1 as
     words, and in light that floor leaves a yellow and a lime nowhere but olive (#7E6300, #437010 at OKLCH L 0.51), which
     is how Coffee's budget bar read brown. A fill owes 3:1 to the tile and to the track it fills, so it may stand lighter
     and clearer; the slots that were already clean fill in their own colour. */
  ...CATS.map((c) => `cat-${c}-fill` as const),
] as const;

export type FrameRole = (typeof FRAME_ROLES)[number];
/** Every frame role, and `scrim`, the one value with an alpha (it sits over the page, never under a word). */
export type Frame = Record<FrameRole, string> & { scrim: string };

/**
 * The floors the frame is held to, per profile. `ink` is the three inks in order; `text` every other word (a status,
 * red, a category, the toast's, the words on a selection); `mark` a dot, a running mark, an off switch; `boundary` the
 * 1px edge of a floating layer, which the house leaves to the eye (`--rule-strong` is a hairline, frame 3.8) and high
 * contrast holds. A label on a red fill is 4.5 and a fill or the focus ring against what is round it 3 in every profile.
 */
export type FrameFloors = { ink: [number, number, number]; text: number; mark: number; boundary: number | null };

/**
 * The red as words in light, C1 (SPEC 0.3). His value is #CF413A, the fill; it is 4.27:1 on the board, 4.11 on tile-2,
 * 4.31 on hover and 4.06 on the red tint, and check T refuses all four. #C2362F, the dark fill's own hex, clears every
 * one (4.94, 4.76, 4.98, 4.70). This one line takes it back if he takes the failing pairs instead; the check will say so.
 */
export const RED_WORDS_LIGHT = '#C2362F';

/*
 * THE WELLS, CLEAN IN BOTH SCHEMES (colour lane, 2 Nov). Every dark well sat near OKLCH L 0.28, where a blue or a pink
 * is a deep colour of its own and a yellow or a lime can only be olive-brown (#33290F, #222E12: 0.74 and 0.67 of the
 * most colour their hue holds there, which at that depth is mud). A yellow reads as yellow only higher up, so its dark
 * well stands at L 0.37, a deep gold (0.37 0.075 86, #513C01), and the lime's turns the few degrees toward green that
 * keep it a leaf and not an olive (0.31 0.054 142, #20371D). Each word on them still clears 4.5:1 (the slot 6.2 and
 * 7.5, ink 8.8 and 11.3). In light the yellow well was a cream (#FAF1D2, chroma 0.042 at hue 94); at 0.055 and hue 97 it
 * is a pale yellow (#FAF1C7), its words at 5.0.
 */
const CAT_VALUES: Record<Scheme, Record<(typeof CATS)[number], [string, string]>> = {
  light: {
    blue: ['#2F5BD3', '#E8EEFC'],
    violet: ['#6A4FD6', '#EFEAFD'],
    pink: ['#B42F78', '#FBE8F2'],
    teal: ['#0C7168', '#DFF3F1'],
    sky: ['#0B6E95', '#E0F1F8'],
    yellow: ['#7E6300', '#FAF1C7'],
    lime: ['#437010', '#EDF5DF'],
    slate: ['#5A6475', '#EEF0F3'],
  },
  dark: {
    blue: ['#7AA7FF', '#1A2747'],
    violet: ['#B29BFF', '#2A2348'],
    pink: ['#F28DC4', '#3A1D30'],
    teal: ['#4FD1C5', '#12322F'],
    sky: ['#5CC8F0', '#10303D'],
    yellow: ['#E8C34F', '#513C01'],
    lime: ['#A6D45F', '#20371D'],
    slate: ['#A9B3C4', '#262C38'],
  },
};

/**
 * A slot's fill where it is not its words' colour: light's yellow and lime at the most colour their hue holds at 3:1 on
 * `tile-2` (OKLCH 0.636 0.130 85, a gold, and 0.622 0.167 130, a clear lime), measured 3.03 and 3.02 on the track and
 * 3.46 and 3.44 on the tile. Every other slot, and every dark one, fills in its own colour.
 */
const CAT_FILLS: Record<Scheme, Partial<Record<(typeof CATS)[number], string>>> = {
  light: { yellow: '#AF8300', lime: '#649900' },
  dark: {},
};

const cats = (scheme: Scheme) =>
  Object.fromEntries([
    ...CATS.flatMap((c) => [
      [`cat-${c}`, CAT_VALUES[scheme][c][0]],
      [`cat-${c}-tint`, CAT_VALUES[scheme][c][1]],
    ]),
    ...CATS.map((c) => [`cat-${c}-fill`, CAT_FILLS[scheme][c] ?? CAT_VALUES[scheme][c][0]]),
  ]);

/** SPEC 1.1: frame 3.1's surfaces, text and status, and the two reds as decided (0.1 item 2, 0.2). */
export const HOUSE_FRAME: Record<Scheme, Frame> = {
  light: {
    board: '#F3F4F6',
    tile: '#FFFFFF',
    'tile-2': '#EEF0F3',
    hover: '#F4F5F7',
    nav: '#FFFFFF',
    'nav-selected': '#F0F1F4',
    rule: '#E3E5E9',
    'rule-strong': '#D5D9DF',
    scrim: 'rgb(16 17 20 / 0.32)',
    toast: '#1B1E24',
    'on-toast': '#F3F4F6',
    ink: '#101114',
    'ink-2': '#3B4048',
    'ink-3': '#5F6670',
    focus: '#101114',
    good: '#1F7A47',
    'good-tint': '#E4F3EA',
    /* AMBER AS WORDS, NOT BROWN (colour lane, 2 Nov): #9A5800 (0.525 0.120 63) read brown in "Off target" and "renews
       13 Nov"; #A85700 is the lightest, most coloured amber at hue 56 that still clears 4.5:1 on every ground it is drawn
       on, its own tint included (4.55). Its tint was a beige (#FBF0DD); #FFEDD7 is a pale amber. */
    warn: '#A85700',
    'warn-tint': '#FFEDD7',
    /* The warn amber's own hue (OKLCH 63) lifted to 3:1 on the track, 0.642 0.144: amber, where #9A5800 drew a brown bar. */
    'warn-fill': '#C77700',
    info: '#2F5BD3',
    'info-tint': '#E8EEFC',
    live: '#1F8A55',
    'switch-off': '#8A919C',
    knob: '#FFFFFF',
    'segment-on': '#FFFFFF',
    /* The ink 6% into the tile in OKLab; `frameOf` mixes it again from the ink and the tile it is given. */
    arrived: '#EEEFEF',
    'red-fill': '#CF413A',
    'red-fill-hover': '#B3322C',
    'red-fill-press': '#A12A25',
    'on-red': '#FFFFFF',
    red: RED_WORDS_LIGHT,
    'red-tint': '#FBEBE9',
    'red-tint-2': '#F5D9D8',
    /* In light the chosen and the link are the accent's, the very values above (`frameOf` reads them off again). */
    chosen: '#FBEBE9',
    'chosen-2': '#F5D9D8',
    on: '#CF413A',
    'on-mark': '#FFFFFF',
    link: RED_WORDS_LIGHT,
    ...cats('light'),
  } as Frame,
  dark: {
    /* 2026-10-22, THE BOARD A STEP DARKER AND THE BAR ON IT. A tile measured 1.09:1 against
       #0F121A, so in dark the tiles barely parted from the page, and the bar was a navy of its own (#171B33) that read
       as another product's. The tile stays where every ink and intent on it was solved, and the board goes down to
       #090B10 under it.
       2026-10-23, THE FRAME ON ITS OWN INDIGO AGAIN, WITH AN EDGE (frame B): the bar on the board had no edge at all,
       so the frame is #171B33 with the rule under it, and its chosen place a soft step up that still holds ink-3 at 4.6.
       2026-10-23, THE FRAME IN THE MARK'S RED, NOT A NAVY (his word: "red tones works better"): an oxblood that sits under
       the red mark as its own ground, ink at 15.1 on it, and its chosen place a step up that holds ink-3 at 4.9.
       2026-10-23, THE GREYS LEAN RED UNDER THE RED FRAME (his word: "since the navbar is red i need the general tones to
       be leaning towards red instead of blue"): every neutral took hue 355 at two thirds of its saturation, its luminance
       held, so every pair above measures as it did (ink-3 on tile 5.7, on tile-2 5.0). Status tints keep their hues.
       The board alone is a true grey ("the main page background should be greyish not reddish"), #0B0B0B at the old
       board's luminance, so the tiles' warmth reads against a neutral page.
       2026-11-01, THE FRAME A DEEP CRIMSON, NOT AN OXBLOOD (his word: a red dark bar, but not oxblood or brown): #2B1418
       sat at hue 9 with little colour, which at that depth reads brown. The bar is #2E0C18, hue 1 at half again the
       colour (OKLCH 0.216 0.058 1), clearly red and leaning neither to yellow nor to violet, ink at 15.5 and ink-3 at
       6.0 on it; its chosen place #431628 holds ink-3 at 5.1.
       2026-11-02, GREY, NOT RED (his word: "the dashboard accents (in dark mode) are too red now ... maybe the main
       content can be more grey-tones instead of reddish"). Every neutral, the bar and the rail with them, is the grey
       of its own luminance with no hue (#231A1A to #1C1C1C, #2E0C18 to #181818, ink #F5EEEF to #F0F0F0), so every pair
       above measures as it did. The rail's chosen place is a plain step up, #2C2C2C, ink-3 at 4.7. The red is the one
       main action and what is late or failing, and a touch quieter: the fill at 0.88 of its chroma (#C2362F to
       #BA4239, white on it 5.35), the words the same (#EA645B to #E16C63), the late well 0.27 0.04 14 (#381E20). */
    board: '#0B0B0B',
    tile: '#1C1C1C',
    'tile-2': '#282828',
    hover: '#232323',
    nav: '#181818',
    'nav-selected': '#2C2C2C',
    rule: '#313131',
    'rule-strong': '#404040',
    scrim: 'rgb(7 7 7 / 0.6)',
    toast: '#323232',
    'on-toast': '#F0F0F0',
    ink: '#F0F0F0',
    'ink-2': '#C1C1C1',
    'ink-3': '#969696',
    focus: '#F0F0F0',
    good: '#5FD08F',
    'good-tint': '#14301F',
    warn: '#F0A64B',
    /* A deep amber, where #36260F (L 0.28) was brown: lifted to 0.34 0.071 64, as the yellow well is, warn on it 5.8. */
    'warn-tint': '#512F08',
    'warn-fill': '#F0A64B',
    info: '#7AA7FF',
    'info-tint': '#18264A',
    live: '#47D486',
    'switch-off': '#6D6D6D',
    knob: '#FFFFFF',
    'segment-on': '#353535',
    arrived: '#2D2D2D',
    'red-fill': '#BA4239',
    'red-fill-hover': '#C64A41',
    'red-fill-press': '#A83A32',
    'on-red': '#FFFFFF',
    red: '#E16C63',
    'red-tint': '#381E20',
    'red-tint-2': '#462529',
    /* A chosen thing a grey step over the tile (ink-3 on it 4.6) and a selection one more (ink-2 on it 5.8); a ticked box
       and the chosen ring are the ink with the tile's colour on them, as a switch that is on already was; a link is
       the ink with its underline. */
    chosen: '#2E2E2E',
    'chosen-2': '#404040',
    on: '#F0F0F0',
    'on-mark': '#1C1C1C',
    link: '#F0F0F0',
    ...cats('dark'),
  } as Frame,
};

export type FrameFloor = 'ink' | 'ink2' | 'ink3' | 'text' | 'mark' | 'label' | 'fill' | 'boundary';
export type FramePair = { fg: FrameRole; bg: FrameRole; floor: FrameFloor; what: string };

/* Where words sit: the page, a tile, a well or a field, a hovered row, the bar. */
const WORDS_ON = ['board', 'tile', 'tile-2', 'hover', 'nav'] as const satisfies readonly FrameRole[];

/**
 * EVERY PAIR THE FRAME MUST HOLD (SPEC 1.2): frame 3.1's contrast table, the label on all three fills, red as words on
 * every ground it is drawn on and as a mark on a tile, each status on its own tint, every category on the tile and on
 * its own tint. And the words a chosen row and a selection carry (check S's argument, on the frame's own tint), the
 * chosen segment's label, and the switch's two marks.
 *
 * NOT HELD, ON PURPOSE: red words on `nav-selected` (4.23 in dark; red never sits on the current place); the red
 * fill on `tile-2` (a primary button stands on the board or a tile); and the ring and the knob against a red fill. The
 * ring stands 2px off what it rings, so what it is read against is the ground round it, which is held; and the knob on
 * an on switch is the label on the fill (`--on-red`, `controls.css`), which is held at 4.5. In the house the ring
 * measures 4.02 against the light fill and 4.77 against the dark one all the same.
 */
export const FRAME_PAIRS: readonly FramePair[] = [
  ...([...WORDS_ON, 'nav-selected', 'red-tint', 'segment-on', 'arrived'] as const).map((bg) => ({ fg: 'ink' as const, bg, floor: 'ink' as const, what: 'body text' })),
  { fg: 'ink', bg: 'red-tint-2', floor: 'text', what: 'text in a selection' },
  ...([...WORDS_ON, 'nav-selected', 'red-tint', 'arrived'] as const).map((bg) => ({ fg: 'ink-2' as const, bg, floor: 'ink2' as const, what: 'second text' })),
  { fg: 'ink-2', bg: 'red-tint-2', floor: 'text', what: 'text in a selection' },
  ...([...WORDS_ON, 'nav-selected', 'red-tint', 'arrived'] as const).map((bg) => ({ fg: 'ink-3' as const, bg, floor: 'ink3' as const, what: 'quiet text' })),
  ...(['good', 'warn', 'info'] as const).flatMap((k) =>
    ([...WORDS_ON, 'red-tint', `${k}-tint`] as const).map((bg) => ({ fg: k, bg: bg as FrameRole, floor: 'text' as const, what: `${k} as words` })),
  ),
  ...([...WORDS_ON, 'red-tint'] as const).map((bg) => ({ fg: 'red' as const, bg, floor: 'text' as const, what: 'red as words' })),
  { fg: 'red', bg: 'tile', floor: 'mark', what: 'red as a mark' },
  ...CATS.flatMap((c) =>
    (['tile', `cat-${c}-tint`] as const).map((bg) => ({ fg: `cat-${c}` as FrameRole, bg: bg as FrameRole, floor: 'text' as const, what: `the ${c} slot` })),
  ),
  /* A FILL ON THE TILE AND ON THE TRACK IT FILLS, at the fill floor. */
  ...[...CATS.map((c) => `cat-${c}-fill` as const), 'warn-fill' as const].flatMap((fg) =>
    (['tile', 'tile-2'] as const).map((bg) => ({ fg: fg as FrameRole, bg, floor: 'fill' as const, what: `${fg} as a bar` })),
  ),
  /* THE CHOSEN AND THE LINK (dark grey lane, 2 Nov): every word on a chosen thing, a selection's words, a link on every
     ground it is drawn on, and the ticked box against its ground and under its tick. */
  ...(['ink', 'ink-2', 'ink-3'] as const).map((fg) => ({ fg, bg: 'chosen' as const, floor: (fg === 'ink' ? 'ink' : fg === 'ink-2' ? 'ink2' : 'ink3') as FrameFloor, what: 'words on a chosen thing' })),
  ...(['ink', 'ink-2'] as const).map((fg) => ({ fg, bg: 'chosen-2' as const, floor: 'text' as const, what: 'text in a selection' })),
  ...([...WORDS_ON, 'chosen'] as const).map((bg) => ({ fg: 'link' as const, bg, floor: 'text' as const, what: 'a link' })),
  ...(['board', 'tile'] as const).map((bg) => ({ fg: 'on' as const, bg, floor: 'fill' as const, what: 'a ticked box' })),
  { fg: 'on-mark', bg: 'on', floor: 'label', what: 'the tick on a ticked box' },
  { fg: 'on-toast', bg: 'toast', floor: 'text', what: 'a toast' },
  ...(['red-fill', 'red-fill-hover', 'red-fill-press'] as const).map((bg) => ({ fg: 'on-red' as const, bg, floor: 'label' as const, what: 'the label on a red fill' })),
  ...(['board', 'tile'] as const).map((bg) => ({ fg: 'red-fill' as const, bg, floor: 'fill' as const, what: 'a primary button' })),
  ...(['board', 'tile'] as const).map((bg) => ({ fg: 'live' as const, bg, floor: 'mark' as const, what: 'the running dot' })),
  ...(['board', 'tile'] as const).map((bg) => ({ fg: 'focus' as const, bg, floor: 'fill' as const, what: 'the focus ring' })),
  { fg: 'switch-off', bg: 'tile', floor: 'mark', what: 'an off switch' },
  { fg: 'knob', bg: 'switch-off', floor: 'fill', what: 'the knob on an off switch' },
  { fg: 'rule-strong', bg: 'tile', floor: 'boundary', what: 'the edge of a floating layer' },
];

export const frameFloor = (floors: FrameFloors, floor: FrameFloor): number | null =>
  floor === 'ink'
    ? floors.ink[0]
    : floor === 'ink2'
      ? floors.ink[1]
      : floor === 'ink3'
        ? floors.ink[2]
        : floor === 'label'
          ? 4.5
          : floor === 'fill'
            ? 3
            : floor === 'boundary'
              ? floors.boundary
              : floors[floor];

/* The grounds a high-contrast dark scheme brings down together, so they keep their order and their steps. */
const FRAME_GROUNDS = [
  'board',
  'tile',
  'tile-2',
  'hover',
  'nav',
  'nav-selected',
  'rule',
  'segment-on',
  'red-tint',
  'red-tint-2',
  'chosen',
  'chosen-2',
  'good-tint',
  'warn-tint',
  'info-tint',
  ...CATS.map((c) => `cat-${c}-tint` as const),
] as const satisfies readonly FrameRole[];

/* What moves to meet a floor: every word and mark, never a ground, a fill or the label on a fill. */
const FRAME_MOVES = ['ink', 'ink-2', 'ink-3', 'good', 'warn', 'info', 'red', 'live', 'switch-off', 'rule-strong', 'on-toast', ...CATS.map((c) => `cat-${c}` as const)] as const satisfies readonly FrameRole[];

const passes = (fg: string, pairs: [string, number][]) => pairs.every(([bg, f]) => contrast(rgb(fg), rgb(bg)) >= f);

/** The least move along lightness, in the colour's own hue and chroma, that clears every floor it is held to. */
function lift(colour: string, pairs: [string, number][], dir: 'up' | 'down'): string {
  if (passes(colour, pairs)) return colour;
  const c = rgbToLch(rgb(colour));
  const at = (L: number) => toHex(quantise({ L, C: c.C, H: c.H }));
  let near = c.L;
  let far = dir === 'up' ? 1 : 0;
  for (let i = 0; i < 30; i++) {
    const mid = (near + far) / 2;
    if (passes(at(mid), pairs)) far = mid;
    else near = mid;
  }
  return at(far);
}

/** A colour laid over another at `a`, as `color-mix(in srgb, …)` would. */
const over = (top: string, under: string, a: number) => {
  const t = rgb(top);
  const u = rgb(under);
  return toHex({ r: t.r * a + u.r * (1 - a), g: t.g * a + u.g * (1 - a), b: t.b * a + u.b * (1 - a) });
};

/**
 * The frame of one scheme.
 *
 * THE HOUSE'S RED IS PINNED; ANY OTHER SEED'S FILL IS ITS OWN. Beside the house mark (`Seed.action`) the four fills
 * are his values. A record's colour, or alpha's, moves the fill, its two states, its label and the two tints a chosen
 * thing wears, read off the solved `action` roles, so the picked colour is the colour of the buttons and the selection.
 * Red as words and marks stays the product's red, because red there means late and needs you, and a record's colour
 * does not get to say that.
 */
export function frameOf(seed: Seed, profile: Profile, scheme: Scheme, p: Palette): Frame {
  const f: Frame = { ...HOUSE_FRAME[scheme] };
  const pinned = seed.action && toHex(rgb(seed.action.accent)) === toHex(rgb(seed.accent));
  const floors = profile.frame;
  const dir = away(scheme);

  /* 1 · THE GROUNDS, brought down together in dark until the lightest ground a word sits on leaves room for the
     profile's ink floor under white, with a hair over. Light grounds are left where they are: the floors are met by
     the words moving. */
  if (scheme === 'dark') {
    const need = Math.max(...FRAME_PAIRS.filter((q) => q.fg.startsWith('ink')).map((q) => frameFloor(floors, q.floor) ?? 0)) * 1.01;
    const heaviest = FRAME_PAIRS.filter((q) => q.fg.startsWith('ink') && q.floor !== 'text' && (FRAME_GROUNDS as readonly string[]).includes(q.bg)).map((q) => q.bg);
    const scaled = (k: number) =>
      Object.fromEntries(FRAME_GROUNDS.map((g) => {
        const c = rgbToLch(rgb(HOUSE_FRAME[scheme][g]));
        return [g, toHex(quantise({ L: c.L * k, C: c.C, H: c.H }))];
      })) as Record<(typeof FRAME_GROUNDS)[number], string>;
    const fits = (k: number) => heaviest.every((g) => contrast(rgb('#FFFFFF'), rgb(scaled(k)[g as (typeof FRAME_GROUNDS)[number]])) >= need);
    if (!fits(1)) {
      let lo = 0.3;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      Object.assign(f, scaled(lo));
    }
  }

  /* 1b · THE INK STARTS WHERE THE PROFILE AIMS IT, where that is further from the tile than the frame's. High contrast
     aims light's ink darker than the house's (`HIGH_CONTRAST_PROFILE.aim`), because the house ink already clears its
     floor and a floor alone never moves it: the frame started from the house ink and drew the light high-contrast page's
     words in exactly the house ink, the one colour a reader turns the palette on for. */
  if (profile.aim?.[scheme].ink !== HOUSE_PROFILE.aim?.[scheme].ink &&contrast(rgb(p.ink), rgb(f.tile)) > contrast(rgb(f.ink), rgb(f.tile))) f.ink = p.ink;

  /* 2 · THE FILL FAMILY, from the seed's own working accent where it is not the house's. IN DARK A TOUCH QUIETER, as
     the house's is (dark grey lane, 2 Nov): the fill and its hover at `DARK_FILL_CHROMA` of their colour, at their own
     lightness and hue, where the label and the grounds still clear their floors on both; a colour that would not is
     left as the solver gave it. */
  if (!pinned) {
    const [fill, hover] = scheme === 'dark' ? quieter([p.action, p['action-hover']], p['on-action'], [f.board, f.tile]) : [p.action, p['action-hover']];
    f['red-fill'] = fill;
    f['red-fill-hover'] = hover;
    f['on-red'] = p['on-action'];
    const hov = rgbToLch(rgb(hover));
    const labelLight = rgbToLch(rgb(p['on-action'])).L > 0.5;
    f['red-fill-press'] =
      [0.03, 0.05, 0.07]
        .map((d) => toHex(quantise({ ...hov, L: Math.min(0.98, Math.max(0.02, hov.L + (labelLight ? -d : d))) })))
        .find((c) => contrast(rgb(c), rgb(p['on-action'])) >= 4.5) ?? hover;
    /* As strong as the words it carries allow, each at its own floor, stepping down a percent at a time. */
    const tint = (want: number, words: [FrameRole, FrameFloor][]) => {
      const held = words.map(([w, fl]) => [f[w], frameFloor(floors, fl) ?? 4.5] as [string, number]);
      for (let a = want; a > 0.005; a -= 0.01) {
        const t = over(fill, f.tile, a);
        if (held.every(([w, fl]) => contrast(rgb(w), rgb(t)) >= fl)) return t;
      }
      return f.tile;
    };
    f['red-tint'] = tint(scheme === 'light' ? 0.1 : 0.12, [
      ['ink', 'ink'],
      ['ink-2', 'ink2'],
      ['ink-3', 'ink3'],
      ['good', 'text'],
      ['warn', 'text'],
      ['info', 'text'],
      ['red', 'text'],
    ]);
    f['red-tint-2'] = tint(scheme === 'light' ? 0.2 : 0.22, [
      ['ink', 'text'],
      ['ink-2', 'text'],
    ]);
  }

  /* 2b · THE ARRIVAL WASH: the ink mixed into the tile in OKLab, 6% in light and 10% in dark (SPEC 1.1), as
     `color-mix(in oklab, var(--ink) 6%, var(--tile))` would draw it, solved here so the words on it are measured. */
  {
    const i = rgbToOklab(rgb(f.ink));
    const t = rgbToOklab(rgb(f.tile));
    const at = (a: number) => {
      const m = oklabToRgb(i.L * a + t.L * (1 - a), i.a * a + t.a * (1 - a), i.b * a + t.b * (1 - a));
      const c = (v: number) => Math.min(1, Math.max(0, v));
      return toHex({ r: c(m.r), g: c(m.g), b: c(m.b) });
    };
    /* WHERE THE INK FLOOR IS HIGH (high contrast) the wash is only as strong as leaves the floor standing: the words
       on it move to meet it in step 3, and the wash is what keeps that possible, as the grounds did in step 1. */
    const ext = scheme === 'light' ? '#000000' : '#FFFFFF';
    const need = floors.ink[0] * 1.01;
    let a = scheme === 'light' ? 0.06 : 0.1;
    while (a > 0.02 && contrast(rgb(ext), rgb(at(a))) < need) a -= 0.01;
    f.arrived = at(a);
  }

  /* 3 · EVERY WORD AND MARK, moved only as far as its floors ask on the grounds as they now stand. The house's own
     values clear their floors, so in the house this changes nothing; high contrast is where it works. */
  for (const role of FRAME_MOVES) {
    const pairs = FRAME_PAIRS.filter((q) => q.fg === role)
      .map((q) => [f[q.bg], frameFloor(floors, q.floor)] as const)
      .filter((q): q is readonly [string, number] => q[1] !== null)
      .map(([bg, floor]) => [bg, floor] as [string, number]);
    f[role] = lift(f[role], pairs, dir);
  }
  f.focus = f.ink;

  /* 4 · THE CHOSEN AND THE LINK (dark grey lane, 2 Nov). In light they are the accent's tints, fill and label and red as
     words, read off what was just solved, so a record's colour picks its chosen rows as it always did. In dark they are
     the frame's greys and the ink for every colour: a chosen row, a ticked box and a link say so in shape and in grey. */
  if (scheme === 'light') {
    f.chosen = f['red-tint'];
    f['chosen-2'] = f['red-tint-2'];
    f.on = f['red-fill'];
    f['on-mark'] = f['on-red'];
    f.link = f.red;
  } else {
    f.on = f.ink;
    f['on-mark'] = f.tile;
    f.link = f.ink;
  }
  return f;
}

/** How much of its colour an accent's fill keeps in dark, at its own lightness and hue (dark grey lane, 2 Nov). */
export const DARK_FILL_CHROMA = 0.88;

/**
 * An accent's fill and hover, quieter for the dark: each at `DARK_FILL_CHROMA` of its chroma, if the label on each and
 * each against every ground a button stands on still clear 4.5 and 3. If either would not, both are kept as they were,
 * so a fill and its hover never come from two rules.
 */
function quieter(fills: [string, string], label: string, grounds: string[]): [string, string] {
  const q = fills.map((hex) => {
    const c = rgbToLch(rgb(hex));
    return toHex(quantise({ L: c.L, C: c.C * DARK_FILL_CHROMA, H: c.H }));
  }) as [string, string];
  const holds = q.every((x) => contrast(rgb(label), rgb(x)) >= 4.5 && grounds.every((g) => contrast(rgb(x), rgb(g)) >= 3));
  return holds ? q : fills;
}

export function build(seed: Seed, profile: Profile = HOUSE_PROFILE, id = 'house'): Built {
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
    elevation: { dark: elevationOf('dark'), light: elevationOf('light') },
    chrome: { dark: chromeOf(schemes.dark, profile, 'dark'), light: chromeOf(schemes.light, profile, 'light') },
    frame: { dark: frameOf(seed, profile, 'dark', schemes.dark), light: frameOf(seed, profile, 'light', schemes.light) },
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
