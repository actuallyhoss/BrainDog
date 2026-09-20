/**
 * The validator. Seventeen checks, 28 §4.4 and 39 §6.1: A to H are 13 §2.4's, I to P are 28's
 * additions, and Q is this file's own.
 * Runs at install, in CI, and live in the theme editor. A failing theme is refused, naming the pair.
 *
 * TWO POLICIES, NOT THREE, AND THE HEADER SAID THREE FOR AS LONG AS THERE WERE TWO. A breached floor
 * is refused; a judgement call warns and installs (28 §4.5). The third, "mechanically correctable is
 * auto-corrected and shown in the diff", is implemented nowhere: `Finding.level` below is
 * `pass | warn | refuse` and has no room for a correction, no `corrected` row exists in this package,
 * and check J, the one row `39 §6.2` marked auto-correct, refuses. Whether an out-of-gamut override
 * should be corrected or refused is a decision; saying the product does something it does not is not.
 */

import {
  apcaLc,
  contrast,
  fromHex,
  inGamut,
  relLuminance,
  rgbToCielab,
  rgbToLch,
  separation,
  type Deficiency,
} from './color.ts';
import { HUE_FLOOR, hueGap, INKS, INTENTS, SURFACES, type Built, type Palette, type Role, type Scheme } from './build.ts';

export type Finding = {
  check: string;
  scheme: Scheme;
  level: 'pass' | 'warn' | 'refuse';
  /** The sentence the app shows, verbatim. What was wrong · where · what to do (13 §6). */
  fix?: string;
  code?: 'CONTRAST_FLOOR' | 'INTENT_INSEPARABLE' | 'THEME_LADDER_ORDER' | 'THEME_VALUE_INVALID';
  measured?: number;
  /**
   * WHERE, AS AN ADDRESS AND NOT AS A SENTENCE — `theme.<id>.roles.<scheme>.<role>`, 39 §6.2.
   *
   * Every check below knows the token at the moment it fails: which scheme, which role, which rung.
   * It was writing that into `fix` and throwing the path away, so three fixtures named an `at` the
   * validator had no concept of and could not be satisfied. The path is a real one into the
   * document a theme author sends — `declare.ts`'s `themeBody` reads `seed` and `roles`, and
   * `roles.<scheme>.<role>` is a colour per role per scheme — so it points at a line somebody can
   * go and change, which is the whole use of an `at` (41 §6).
   *
   * THE ROLE THE FIX MOVES, NOT THE PAIR. A contrast finding is about two tokens and only one of
   * them is being asked to move: the ground is the ground. Where the two are genuinely symmetric —
   * the ring's two tones, two intents that cannot be told apart — it is the first of the pair in
   * the order the check reads them, which is arbitrary once and then deterministic for ever,
   * rather than arbitrary per run. `fix` names both either way.
   *
   * AND IT IS OPTIONAL, BECAUSE TWO CHECKS HAVE NOWHERE TO POINT. `checkElevation` refuses a ladder
   * the dialect has no key for at all (39 §13 D9: elevation is generated, there is no `shadow` or
   * `elevation` in a theme), and `checkForcedColors` is about the stylesheet as a whole document.
   * A refusal with nothing to point at carries none (41 §6); inventing one is what the fixture
   * format used to compel, and 531e500 is the cleanup after nine authors did it.
   *
   * A PASS CARRIES NONE EITHER. An address is where to make a change and a pass asks for none.
   */
  at?: string;
};

/** 39 §6.2's address. `roles` and not `schemes`: the former is the dialect's key, the latter ours. */
const address = (id: string, scheme: Scheme, role: string) => `theme.${id}.roles.${scheme}.${role}`;

const rgb = (s: string) => fromHex(s);
const r2 = (n: number) => Math.round(n * 100) / 100;
const DEFS: Deficiency[] = ['protan', 'deutan', 'tritan'];
const HEX = /^#[0-9A-F]{6}$/;
const BANNED = ['url(', 'image(', 'element(', 'attr(', 'var(', '\\'];

function pairsAgainstSurfaces(
  id: string,
  p: Palette,
  roles: readonly string[],
  floor: number,
  check: string,
  scheme: Scheme,
): Finding[] {
  const out: Finding[] = [];
  for (const role of roles)
    for (const surface of SURFACES) {
      const got = contrast(rgb(p[role as Role]), rgb(p[surface]));
      if (got < floor)
        out.push({
          check,
          scheme,
          level: 'refuse',
          code: 'CONTRAST_FLOOR',
          measured: r2(got),
          /* THE ROLE AND NOT THE SURFACE. The sentence names both and the address names the one the
             sentence tells you to move; a reader sent to `bg` would repaint the page to fix a
             caption. */
          at: address(id, scheme, role),
          fix: `theme: the pair (${role} on ${surface}) is ${r2(got)}:1 in ${scheme}. It needs ${floor}:1. Move ${role} further from the ground.`,
        });
    }
  return out;
}

export function checkScheme(built: Built, scheme: Scheme): Finding[] {
  const p = built.schemes[scheme];
  const out: Finding[] = [];
  const at = (role: string) => address(built.id, scheme, role);

  /* THE FLOORS ARE THE PROFILE'S, and they used to be literals here. `HIGH_CONTRAST_PROFILE` raises
     every one of them — ink to [16, 12.5, 9.5, 7], `edge` to 4.5, intent text to 5 — and this file
     asked the house's AA numbers of both, so the theme that exists for readers who need the most
     help was validated as though it were the ordinary one. A `Profile` is a seam only if something
     reads through it. */
  const floors = built.profile;

  /* A · every ink role x every surface. Each ink has its own floor, descending.

     `faint` IS NOT AMONG THEM, and check C below is why: it is the one ink allowed to sit at the
     LARGE-TEXT floor, because the usage rule — no faint below 24px — is enforced by a css-rules
     rule rather than here. Including it at the ramp's own floor made C strictly dominated by A: a
     fifth check that could not produce a finding A had not already produced. */
  for (const [i, ink] of INKS.entries())
    if (ink !== 'faint') out.push(...pairsAgainstSurfaces(built.id, p, [ink], floors.ink[i] ?? 4.5, 'A', scheme));

  /* B · accent as text x every surface, at the INTENT-TEXT floor rather than the ink ramp's.
     `accent-text` is a hue used as text, which is what an intent is, and the high-contrast profile's
     own note explains why that distinction is load-bearing: pushing a coloured text role to 7:1
     drives it so far down the lightness axis that it bottoms out against the sRGB gamut. High
     contrast is a property of ink on surface and of boundaries; forcing it onto the hues makes them
     less distinguishable, not more. */
  out.push(...pairsAgainstSurfaces(built.id, p, ['accent-text'], floors.intentText, 'B', scheme));

  /* C · faint at the large-text floor. The usage half — no faint below 24px — is a css-rules rule. */
  out.push(...pairsAgainstSurfaces(built.id, p, ['faint'], 3, 'C', scheme));

  /* D · the load-bearing boundaries and the four -fill roles.
     `accent-edge` belongs here and not in a check of its own: it is the visual boundary of a filled
     control, which is the same SC 1.4.11 requirement at the same floor as `edge`. It was drawn at
     the call site as a mix of the accent and `sunk` and measured 1.33:1 against `s3` in dark. */
  out.push(...pairsAgainstSurfaces(built.id, p, ['edge', 'accent-edge'], floors.edge, 'D', scheme));
  const fills = ['earn-fill', 'warn-fill', 'danger-fill', 'info-fill'];
  out.push(...pairsAgainstSurfaces(built.id, p, fills, floors.intentFill, 'D', scheme));

  /* E · the focus ring against both neighbours, and the two tones nine apart */
  const ringTones = contrast(rgb(p['focus-in']), rgb(p['focus-out']));
  if (ringTones < 9)
    out.push({
      check: 'E',
      scheme,
      level: 'refuse',
      code: 'CONTRAST_FLOOR',
      measured: r2(ringTones),
      /* THE FIRST OF A SYMMETRIC PAIR. Either tone can move and the sentence says so, so the
         address is the one the check reads first rather than a coin toss at run time. */
      at: at('focus-in'),
      fix: `theme: the two focus-ring tones are ${r2(ringTones)}:1 apart in ${scheme}. They need 9:1, or the ring vanishes on one surface.`,
    });
  out.push(...pairsAgainstSurfaces(built.id, p, ['focus-in'], 3, 'E', scheme));

  /* F · intent x intent, delta-E 2000 after Brettel at severity 1.0, all three deficiencies.
     >= 20 passes; 10-20 passes recorded `band: glyph`; below 10 is refused. The band is a pass and
     not a warning because the house theme itself sits in it (39 D6). */
  /* THE WORD AND THE ROLE, where this held the word and the hex. A reader is shown "good and bad"
     and a theme file has no `good` in it, so the finding needs both: the word for the sentence and
     the role for the address. Reading the hex through the role at the point of use costs nothing. */
  const intents: [string, Role][] = [
    ['good', 'earn'],
    ['warn', 'warn'],
    ['bad', 'danger'],
    // `info` has a generated role of its own here, and the seed file says why: the accent is the
    // mark, the mark is red, and `danger` is anchored at 27.
    ['info', 'info'],
  ];
  let worstF = Infinity;
  for (let i = 0; i < intents.length; i++)
    for (let j = i + 1; j < intents.length; j++) {
      /* AND THE HUE FLOOR, which only the generator knew. Two intents within twenty degrees are the
         same colour to a reader whatever their delta-E says, because delta-E 2000 counts lightness
         and a pale tint of a hue is far from it by that measure and indistinguishable on a screen.
         `danger` and `info` at 25.1° and 29.3° measure 41–46 apart on all three deficiencies and
         are the exact pair the generator's own note says this rule was added for. */
      const gap = hueGap(rgbToLch(rgb(p[intents[i]![1]])).H, rgbToLch(rgb(p[intents[j]![1]])).H);
      /* THE FIRST OF THE PAIR, 39 §6.2. Two intents nobody can tell apart is a fault in the set and
         either one can move — the sentence says exactly that — so a single `at` cannot be the whole
         truth here. It can still be useful: read in the fixed order earn · warn · danger · info it
         is the same address every run, and it lands the reader inside the four roles at issue. */
      if (gap < HUE_FLOOR)
        out.push({
          check: 'F',
          scheme,
          level: 'refuse',
          code: 'INTENT_INSEPARABLE',
          measured: r2(gap),
          at: at(intents[i]![1]),
          fix: `theme: ${intents[i]![0]} and ${intents[j]![0]} are ${r2(gap)}° of hue apart, and four intents need at least ${HUE_FLOOR}°. Delta-E counts lightness, so a pale tint of a hue measures far from it and reads as the same colour.`,
        });
      for (const d of DEFS) {
        const de = separation(rgb(p[intents[i]![1]]), rgb(p[intents[j]![1]]), d);
        worstF = Math.min(worstF, de);
        if (de < 10)
          out.push({
            check: 'F',
            scheme,
            level: 'refuse',
            code: 'INTENT_INSEPARABLE',
            measured: r2(de),
            at: at(intents[i]![1]),
            fix: `theme: ${intents[i]![0]} and ${intents[j]![0]} are delta-E ${r2(de)} apart to a ${d}ope. Four intents need at least 10. Move one hue, or lower the chroma of the other.`,
          });
      }
    }
  out.push({ check: 'F', scheme, level: 'pass', measured: r2(worstF) });

  /* G · intent as text x every surface */
  out.push(...pairsAgainstSurfaces(built.id, p, INTENTS, floors.intentText, 'G', scheme));

  /* H · the surface ladder is monotonic in RELATIVE LUMINANCE, not in L*.
     Ascending in BOTH schemes: `sunk` is always the lowest surface and `s3` always the raised one.
     What differs between the schemes is where the ladder is anchored, not which way it climbs —
     light anchors at the top and descends to `sunk`, dark climbs from `bg`. */
  const lum = SURFACES.map((s) => relLuminance(rgb(p[s])));
  for (let i = 1; i < lum.length; i++) {
    if (lum[i]! <= lum[i - 1]!)
      out.push({
        check: 'H',
        scheme,
        level: 'refuse',
        code: 'THEME_LADDER_ORDER',
        /* THE LATER RUNG, 39 §6.2. A ladder is out of order at a place, and the place is the step
           that failed to climb; the sentence already names it. */
        at: at(SURFACES[i]!),
        fix: `theme: the surface ladder turns back on itself at ${SURFACES[i]} in ${scheme}. Surfaces must only go one way.`,
      });
  }

  /* J · every emitted colour already in the sRGB gamut, and shaped like a colour */
  for (const [role, value] of Object.entries(p)) {
    if (!HEX.test(value))
      out.push({
        check: 'O',
        scheme,
        level: 'refuse',
        code: 'THEME_VALUE_INVALID',
        at: at(role),
        fix: `theme: ${role} is "${value}", which is not a colour this dialect accepts.`,
      });
    /* J · HOW MUCH THE GAMUT MAPPER HAD TO TAKE OFF, which is the only form of this question that
       has an answer. Asking a hex whether it is in sRGB is asking whether a number between 0 and 1
       is between 0 and 1 — `quantise` clamps and `fromHex` divides by 255 — and over all 4096
       three-digit values that branch was never false. What CAN be wrong is that the emitted colour
       is a CLIPPED version of the one the palette was solved as, and `built.clipped` is the mapper
       saying so at the moment it did it.

       0.02 OF CHROMA IS THE LINE, and it is an amount rather than a fraction. A surface at L 0.999
       keeps 0.004 of the 0.014 it asked for — 72% lost, and correctly so, because near white there
       is almost no chroma to have. What is worth refusing is a saturated role giving up an amount a
       reader could see, and 0.02 is about where two OKLCH chromas stop being the same colour. */
    else if ((built.clipped?.[scheme]?.[role as Role] ?? 0) > 0.02)
      out.push({
        check: 'J',
        scheme,
        level: 'refuse',
        code: 'THEME_VALUE_INVALID',
        at: at(role),
        fix: `theme: ${role} gave up ${(built.clipped?.[scheme]?.[role as Role] ?? 0).toFixed(3)} of chroma to the sRGB gamut, so ${value} is not the colour it was solved as.`,
      });
    for (const b of BANNED)
      if (value.includes(b))
        out.push({
          check: 'P',
          scheme,
          level: 'refuse',
          code: 'THEME_VALUE_INVALID',
          at: at(role),
          fix: `theme: ${role} contains "${b}", which a token value may never hold.`,
        });
  }

  /* Q · a control's fill against ITS OWN LABEL, in every state it can be in.
     The generator solves hover and press to clear 4.5 against `accent-ink` and then nobody checked
     the answer. That is exactly the pair that failed before they were generated at all — a control
     measured 4.16:1 against its label at the moment somebody is about to press it, in one scheme
     only — so the state a person sees least often is the one worth asserting. */
  for (const role of ['accent', 'accent-hover', 'accent-press'] as const) {
    const c = contrast(rgb(p[role]), rgb(p['accent-ink']));
    if (c < 4.5)
      out.push({
        check: 'Q',
        scheme,
        level: 'refuse',
        code: 'CONTRAST_FLOOR',
        measured: r2(c),
        at: at(role),
        fix: `theme: ${role} is ${r2(c)}:1 against its own label in ${scheme}. A control needs 4.5:1 in every state, not only at rest.`,
      });
    else out.push({ check: 'Q', scheme, level: 'pass', measured: r2(c) });
  }

  /* K · hue-only encoding. A link must differ in LIGHTNESS from the two things it is most likely to
     be confused with: body ink, and `danger` — which in a theme whose accent is a red mark is the
     same hue as the link by construction. */
  for (const [what, against] of [
    ['body text', p.ink],
    ['an overdue figure', p.danger],
  ] as const) {
    const dL = Math.abs(rgbToCielab(rgb(p['accent-text'])).L - rgbToCielab(rgb(against)).L);
    if (dL < 8)
      out.push({
        check: 'K',
        scheme,
        level: 'refuse',
        code: 'CONTRAST_FLOOR',
        measured: r2(dL),
        /* THE LINK, because the link is what moves. `ink` and `danger` are what a link is measured
           against and neither is free to shift to make room for it (39 §6.3). */
        at: at('accent-text'),
        fix: `theme: a link and ${what} are ${r2(dL)} L* apart in ${scheme}. Colour alone cannot carry the difference; they need 8.`,
      });
  }

  /* M · line and edge not confusable — a judgement call, so it warns */
  const dLine = Math.abs(rgbToLch(rgb(p.line)).L - rgbToLch(rgb(p.edge)).L);
  if (dLine < 0.06)
    out.push({
      check: 'M',
      scheme,
      level: 'warn',
      measured: r2(dLine),
      at: at('line'),
      fix: `theme: line and edge are ${r2(dLine)} apart in ${scheme}. A decorative hairline and a load-bearing boundary should not look the same.`,
    });

  /* N · APCA advisory: where WCAG 2 is known to pass a dark-on-dark pair that reads as mud */
  for (const role of INKS) {
    const w = contrast(rgb(p[role]), rgb(p.bg));
    const lc = Math.abs(apcaLc(rgb(p[role]), rgb(p.bg)));
    if (w >= 4.5 && lc < 60)
      out.push({
        check: 'N',
        scheme,
        level: 'warn',
        measured: lc,
        at: at(role),
        fix: `theme: ${role} on bg passes WCAG at ${r2(w)}:1 but scores Lc ${lc} under APCA. Advisory only.`,
      });
  }

  return out;
}

/**
 * I · the elevation ladder only goes up, in both schemes — a theme is what breaks it (28 §4.4).
 *
 * ON THE ALPHA, NOT ON THE PIXELS. This took the largest `\d+px` of each shadow, and those numbers
 * are literals in the generator — 2, 14, 40, the same three in every theme there will ever be — so
 * the check compared `2 < 14 < 40` and could not fail. What actually varies per scheme, and what a
 * theme sets, is the opacity ladder: inverting the light scheme's to `0.9 → 0.5 → 0.01` visibly
 * turns the ladder back on itself and produced no finding at all.
 *
 * THE FIRST ALPHA OF EACH LEVEL, because a level is one or two shadows and the first is the near
 * one that carries the step. A ladder is monotone in what a reader perceives as depth, and depth
 * here is darkness.
 *
 * AND NO `at`, WHICH IS THE ONE PLACE IN THIS FILE THE ANSWER IS GENUINELY NOTHING. Every other
 * check reads a role out of `roles.<scheme>`, a key a theme author writes; elevation is generated
 * from the profile and the dialect has no `shadow` or `elevation` key at all (39 §13 D9). An
 * address here would be a path into a document nobody sent, and `41 §6` says a refusal with
 * nothing to point at carries none.
 */
export function checkElevation(built: Built): Finding[] {
  const out: Finding[] = [];
  for (const scheme of ['dark', 'light'] as Scheme[]) {
    const alphas = built.elevation[scheme].map((s) => Number(/\/\s*([\d.]+)\s*\)/.exec(s)?.[1] ?? NaN));
    for (const [i, a] of alphas.entries())
      if (!Number.isFinite(a))
        out.push({
          check: 'I',
          scheme,
          level: 'refuse',
          code: 'THEME_LADDER_ORDER',
          fix: `theme: elevation level ${i + 1} in ${scheme} carries no readable opacity, so its depth cannot be compared.`,
        });
    for (let i = 1; i < alphas.length; i++)
      if (!(alphas[i]! > alphas[i - 1]!))
        out.push({
          check: 'I',
          scheme,
          level: 'refuse',
          code: 'THEME_LADDER_ORDER',
          fix: `theme: elevation level ${i + 1} is not above level ${i} in ${scheme}.`,
        });
  }
  return out;
}

/**
 * L · forced-colors survival, asserted over the emitted CSS text, not over a rendered page.
 *
 * NO `at` EITHER, for the second reason: this is about the stylesheet as a whole document rather
 * than about any token in it. There is no role to name and no `<id>` to root a path on.
 */
export function checkForcedColors(css: string): Finding[] {
  const has = css.includes('forced-colors: active') && css.includes('CanvasText');
  return has
    ? []
    : [
        {
          check: 'L',
          scheme: 'dark',
          level: 'refuse',
          code: 'THEME_LADDER_ORDER',
          fix: 'theme: the stylesheet has no forced-colors block. Under forced colours the five-surface ladder becomes one surface and every block boundary disappears.',
        },
      ];
}

/**
 * Every check, over a built palette and the stylesheet it is emitted as.
 *
 * `css` IS REQUIRED, AND IT WAS OPTIONAL. Check L asks whether the stylesheet has a forced-colors
 * block; every caller passed `toCSS(…) + forcedColors(…)`, which is the string being searched for
 * concatenated onto the string being searched — so L could not fail. And the only validation CI
 * actually ran passed no `css` at all, so L was skipped entirely: `''` is falsy, which meant an
 * empty stylesheet passed too. A required argument is what makes the check about the document.
 */

export function validate(built: Built, css: string): Finding[] {
  return [...checkScheme(built, 'dark'), ...checkScheme(built, 'light'), ...checkElevation(built), ...checkForcedColors(css)];
}

export const refusals = (f: Finding[]) => f.filter((x) => x.level === 'refuse');
export const warnings = (f: Finding[]) => f.filter((x) => x.level === 'warn');
