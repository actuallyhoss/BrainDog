/**
 * The validator. Nineteen checks, 28 §4.4 and 39 §6.1: A to H are 13 §2.4's, I to P are 28's
 * additions, and Q, R and S are this file's own.
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
import {
  FRAME_PAIRS,
  FRAME_ROLES,
  frameFloor,
  GROUNDS,
  HUE_FLOOR,
  hueGap,
  INKS,
  INTENT_TEXT,
  INTENTS,
  SURFACES,
  type Built,
  type Palette,
  type Role,
  type Scheme,
} from './build.ts';

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
/* FOUR PLACES FOR THE QUANTITIES THAT LIVE BELOW TWO. A contrast ratio and a delta-E are read at
   two decimals, but relative luminance and OKLCH chroma are fractions of one: check H's rungs and
   check J's clipping both round to 0.00 at `r2` and say nothing. */
const r4 = (n: number) => Math.round(n * 10000) / 10000;
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
  /* 2026-10-07, AND THE BOARD, THE TILE AND THE FIELD (DIRECTION §39). They are where the product now paints its
     words and marks, so a pair proven on the five rungs alone was a pair proven somewhere nobody reads it. */
  for (const role of roles)
    for (const surface of GROUNDS) {
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
      /* AND A ROW WHEN IT PASSES, WHICH IS THE ONLY WAY A VALIDATOR CAN SAY IT STILL RAN. Every
         check in this file used to be silent on success, so the output on a passing theme was the
         same output a deleted check produces: delete the call to this helper for G and nothing in
         the house theme's result changes. The pass carries the measurement, so a reader can see
         how much headroom a pair has rather than only that it cleared. It carries no `at` and no
         `fix`, because an address is where to make a change and a pass asks for none. */
      else out.push({ check, scheme, level: 'pass', measured: r2(got) });
    }
  return out;
}

/**
 * The one pair check K measures and does not refuse: the working accent's words beside red words (DIRECTION §42).
 * BrainDog red is the working accent and late is a deeper red of the same hue, held apart by a word, a mark or a hatch
 * rather than by colour; the reason is at K below, and `separation.test.ts` holds what carries the difference.
 */
export const K_EXEMPT = ['action-text', 'danger-text'] as const satisfies readonly [Role, Role];

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
  /* `live-fill` IS A MARK LIKE THE FOUR: the ring's arc and the running bar, at the same floor. So is `danger`, red as
     a mark (a late dot, a badge), whose words are `danger-text` and are held as text in G. */
  const fills = ['earn-fill', 'warn-fill', 'danger-fill', 'info-fill', 'live-fill', 'danger'];
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
  /* THE RING'S OWN ROW, SEPARATE FROM THE FIVE BELOW IT. E is two questions and the pair helper
     answers only the second, so without this the tone comparison stayed the one silent branch in
     a check that otherwise reports five times. Six rows is what 39 §6.1 counts for E. */
  else out.push({ check: 'E', scheme, level: 'pass', measured: r2(ringTones) });
  out.push(...pairsAgainstSurfaces(built.id, p, ['focus-in'], 3, 'E', scheme));

  /* F · intent x intent, delta-E 2000 after Brettel at severity 1.0, all three deficiencies.
     >= 20 passes; 10-20 passes recorded `band: glyph`; below 10 is refused. The band is a pass and
     not a warning because the house theme itself sits in it (39 D6). */
  /* THE WORD AND THE ROLE, where this held the word and the hex. A reader is shown "good and bad"
     and a theme file has no `good` in it, so the finding needs both: the word for the sentence and
     the role for the address. Reading the hex through the role at the point of use costs nothing.

     EACH INTENT AS IT IS READ (`INTENT_TEXT`), which for red is its words, `danger-text`. */
  const intents: [string, Role][] = [
    ['good', INTENT_TEXT.earn],
    ['warn', INTENT_TEXT.warn],
    ['bad', INTENT_TEXT.danger],
    // `info` has a generated role of its own here, and the seed file says why: the accent is the
    // mark, the mark is red, and `danger` is anchored at 27.
    ['info', INTENT_TEXT.info],
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

  /* G · intent as text x every surface, and `live`, which is read as text too (the "now" line, a suggestion line) and
     is held to the same floor without being one of the four words check F keeps apart. Red's words are `danger-text`;
     red as a mark is D's. */
  out.push(...pairsAgainstSurfaces(built.id, p, [...INTENTS.map((k) => INTENT_TEXT[k]), 'live'], floors.intentText, 'G', scheme));

  /* H · the surface ladder is monotonic in RELATIVE LUMINANCE, not in L*.

     2026-09-29, THE DESIGN SYSTEM'S SHAPE. `sunk` is the ground and the lowest surface in both
     schemes, and `bg`, the tile, sits above it. `s1` to `s3` are the steps inside a tile, and they step AWAY FROM THE
     TILE, one way the whole length: up in dark, and down in light, where the tile is white and has nothing above it,
     and never down onto the ground. It asked "ascending in both schemes" until the design system's light tile-2 became a grey in
     a white tile, which that rule could not hold. The four rows are the four steps, as before. */
  const lum = SURFACES.map((s) => relLuminance(rgb(p[s])));
  const away = scheme === 'dark' ? 1 : -1;
  for (let i = 1; i < lum.length; i++) {
    const turned =
      i === 1 ? lum[1]! <= lum[0]! : (lum[i]! - lum[i - 1]!) * away <= 0 || lum[i]! <= lum[0]!;
    if (turned)
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
    /* ONE ROW PER RUNG EITHER WAY, which is what makes the ladder's shape readable in the output
       rather than only its faults. The measurement is the climb this rung made, and it is rounded
       to four places rather than to `r2`'s two: the dark ladder steps 0.028 in OKLab L, which is
       a few thousandths of relative luminance, and two decimals would report every rung as 0.00. */
    else out.push({ check: 'H', scheme, level: 'pass', measured: r4(Math.abs(lum[i]! - lum[i - 1]!)) });
  }

  /* J · every emitted colour already in the sRGB gamut, and shaped like a colour.

     THESE THREE REPORT ONCE FOR THE PALETTE AND NOT ONCE PER ROLE, which is the shape 39 §6.1
     gives I to Q. O, J and P each ask the same question of all 27 role values, so a pass row per
     role would be 81 rows saying the same thing three ways and would bury the 30 rows of check D
     that a reader is actually looking at. The refusals stay per role, because a refusal names the
     one value to go and change.

     AND THE SUMMARY IS WITHHELD WHEN THE CHECK REFUSED, rather than emitted beside its own
     refusal. A pass row next to a fail row for the same letter is the validator contradicting
     itself in its own output, and this package's rule is that saying the product did something it
     did not is never the cheaper option. `worstClip` is tracked across the loop so the J summary
     can carry the largest amount any role gave up, which is the number that would have refused. */
  let hexOk = true;
  let clipOk = true;
  let bannedOk = true;
  let worstClip = 0;
  for (const [role, value] of Object.entries(p)) {
    worstClip = Math.max(worstClip, built.clipped?.[scheme]?.[role as Role] ?? 0);
    if (!HEX.test(value)) {
      hexOk = false;
      out.push({
        check: 'O',
        scheme,
        level: 'refuse',
        code: 'THEME_VALUE_INVALID',
        at: at(role),
        fix: `theme: ${role} is "${value}", which is not a colour this dialect accepts.`,
      });
    }
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
    else if ((built.clipped?.[scheme]?.[role as Role] ?? 0) > 0.02) {
      clipOk = false;
      out.push({
        check: 'J',
        scheme,
        level: 'refuse',
        code: 'THEME_VALUE_INVALID',
        at: at(role),
        fix: `theme: ${role} gave up ${(built.clipped?.[scheme]?.[role as Role] ?? 0).toFixed(3)} of chroma to the sRGB gamut, so ${value} is not the colour it was solved as.`,
      });
    }
    for (const b of BANNED)
      if (value.includes(b)) {
        bannedOk = false;
        out.push({
          check: 'P',
          scheme,
          level: 'refuse',
          code: 'THEME_VALUE_INVALID',
          at: at(role),
          fix: `theme: ${role} contains "${b}", which a token value may never hold.`,
        });
      }
  }
  /* THE COUNT IS THE MEASUREMENT FOR O AND P, because what those two assert is a property of the
     whole set: all 27 values parsed, all 27 values held nothing banned. */
  if (hexOk) out.push({ check: 'O', scheme, level: 'pass', measured: Object.keys(p).length });
  if (clipOk) out.push({ check: 'J', scheme, level: 'pass', measured: r4(worstClip) });
  if (bannedOk) out.push({ check: 'P', scheme, level: 'pass', measured: Object.keys(p).length });

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

  /* R · THE ACCENT ITSELF, AS A FILL, AGAINST EVERY SURFACE IT CAN BE PAINTED ON.
     Nothing in this package measured it. Check D reads `edge` and `accent-edge`, check B reads
     `accent-text`, check Q reads the accent against its own label, and the fill was measured by
     nothing, so a colour that disappears into the page was accepted with no refusal at all. The
     four suggested accents this product offered until recently measured 1.92, 2.15, 2.41 and 2.47
     against `house dark s3` and every one of them was accepted: a checked switch, a selected tile
     and a chosen cell that a reader in the dark scheme cannot see.

     THE FLOOR IS FLAT 3 AND NOT `floors.edge`, WHICH WOULD REFUSE THE HOUSE THEME. SC 1.4.11 asks
     3:1 of a component boundary and the high-contrast profile raises `edge` to 4.5; measured, the
     house accent is 3.311:1 on `high-contrast dark s3` and the alpha accent 3.425, so asking 4.5
     here would refuse both palettes this package ships, in the profile whose own note says that if
     its floor fails the validator is wrong. It is the same argument check B already makes about
     `intentText`: forcing a higher ratio onto a HUE walks it off the lightness axis rather than
     making it clearer, and high contrast is a property of ink on surface and of boundaries.

     AND IT IS THE REST STATE, WHICH WAS THE OTHER THING MEASURED BEFORE IT WAS SCOPED. Adding
     `accent-hover` and `accent-press` at the same floor refuses every palette in the tree: house
     2.450 and 2.008, alpha 2.530 and 2.029, all four on dark `s3`. Hover and press are solved in
     the generator to step AWAY from the label, which is deliberately toward the ground, so a 3:1
     floor on them is a floor no colour can stand on. The rest state is what establishes the shape.

     SO IT REFUSES, AND THAT IS A DECISION RATHER THAN THE CHEAPEST BRANCH. The alternative is to
     solve the accent up the lightness axis the way `accent-edge` and the hover states are solved,
     and it was rejected for two measured reasons. The first is that the accent is the one value in
     a theme that a customer chose by eye: the settings screen shows the hex as a swatch and the
     generator returns it unchanged, so solving it means somebody picks one colour, is told it was
     applied, and is shown another. A control that reports success and paints something else is
     this codebase's signature defect, and it would be landing on the one screen whose entire
     subject is visible change. The second is that this refusal is ACTIONABLE, which is what the
     usual objection turns on. Every other refusal in this file instructs a theme author, and
     `record.ts` carries codes precisely because a customer cannot move a hue or lower a chroma.
     This one asks for the single thing the person at the picker is already holding: a lighter or
     darker shade of their own colour, and the sentence says which.

     WHAT THE REFUSAL COSTS, COUNTED RATHER THAN GUESSED. A surface is solved from the ladder and
     the neutral hue and never from the accent, so for a given ladder the band is a fixed luminance
     window: clear of `house dark s3`, which is the lightest dark surface, and clear of
     `house light sunk`, which is the darkest light one. On the house ladder that is relative
     luminance 0.1617 to 0.2442, and 2,780,570 of the 16,777,216 sRGB colours are inside it, so
     this refuses roughly five colours in six. That is the price of a fill a reader can see in both
     schemes at once, and it belongs here rather than in the surprise of whoever meets it.

     AND IT IS NOT REDUNDANT WITH `accent-edge`, WHICH IS THE OBJECTION THAT LOOKS STRONGEST. The
     generator does solve a 3:1 boundary in the accent's hue and check D proves it, so a filled
     control that draws that border is legal whatever the accent. Six sites in the app throw the
     boundary away: three rules set `background` and `border-color` both to `var(--accent)` (the
     checked switch track in `controls.css`, the ticked list marker in `blocks.css`, the checked
     filter box on the register page), and three paint a borderless accent fill (the net-series
     swatch and the drag-and-drop indicator, plus `accent-color: var(--accent)` on the forecast
     range, which the browser fills and which can carry no border of ours at all). */
  for (const surface of GROUNDS) {
    const got = contrast(rgb(p.accent), rgb(p[surface]));
    if (got < 3) {
      /* WHICH WAY TO MOVE IS A MEASUREMENT AND NOT A GUESS. Two colours are close because their
         luminances are close, so the accent gains contrast by going further the way it already
         leans: lighter when it is the lighter of the two, darker when it is the darker. In the
         dark scheme that is always lighter and in the light scheme always darker, but reading it
         off the pair means the sentence stays true if a ladder ever changes. */
      const goLighter = relLuminance(rgb(p.accent)) > relLuminance(rgb(p[surface]));
      out.push({
        check: 'R',
        scheme,
        level: 'refuse',
        code: 'CONTRAST_FLOOR',
        measured: r2(got),
        /* THE ACCENT, BECAUSE THE ACCENT IS THE ONLY THING HERE ANYBODY CHOSE. The surfaces are
           the product's own ladder and a record does not get to move them. */
        at: at('accent'),
        fix: `theme: the accent is ${r2(got)}:1 as a fill against ${surface} in ${scheme}. A filled control needs 3:1 or it is not there. Pick a ${goLighter ? 'lighter' : 'darker'} shade of the same colour.`,
      });
    } else out.push({ check: 'R', scheme, level: 'pass', measured: r2(got) });
  }

  /* S · THE WORKING ACCENT (DIRECTION §39), every pair it makes, at AA.
     Its label on the fill at rest and under the pointer (Q's argument), the fill against the three grounds a button
     stands on (R's), the accent as words on every ground and on both of its tints (B's), and the words a chosen thing
     carries on the tint that marks it: body, second and quiet text and a row's state words on the first, body and
     second text on the second.
     The address is the role the generator moves to fix the pair: the fill, the words, or the tint. */
  const pair = (fg: Role, bg: Role, floor: number, moves: Role, what: string) => {
    const got = contrast(rgb(p[fg]), rgb(p[bg]));
    if (got < floor)
      out.push({
        check: 'S',
        scheme,
        level: 'refuse',
        code: 'CONTRAST_FLOOR',
        measured: r2(got),
        at: at(moves),
        fix: `theme: ${what} (${fg} on ${bg}) is ${r2(got)}:1 in ${scheme}. It needs ${floor}:1. Move ${moves}.`,
      });
    else out.push({ check: 'S', scheme, level: 'pass', measured: r2(got) });
  };
  for (const fill of ['action', 'action-hover'] as const) pair('on-action', fill, 4.5, fill, 'the label on a primary button');
  for (const ground of ['board', 'tile', 'field'] as const) pair('action', ground, 3, 'action', 'a primary button');
  for (const ground of [...GROUNDS, 'action-tint-1', 'action-tint-2'] as const)
    pair('action-text', ground, floors.intentText, 'action-text', 'a link');
  for (const ink of ['ink', 'ink2', 'dim', 'earn', 'warn', 'danger-text', 'info', 'live'] as const)
    pair(ink, 'action-tint-1', 4.5, 'action-tint-1', 'text on a chosen row');
  for (const ink of ['ink', 'ink2'] as const) pair(ink, 'action-tint-2', 4.5, 'action-tint-2', 'text on a selection');

  out.push(...checkFrame(built, scheme));

  /* K · hue-only encoding. A link must differ in LIGHTNESS from the two things it is most likely to
     be confused with: body ink, and red words (`danger-text`) — which in a theme whose accent is a
     red mark are the same hue as the link by construction.

     2026-10-08, TWO LINKS, AND ONE PAIR LET THROUGH (DIRECTION §42). A link is `action-text` now, the working accent's
     words, as well as `accent-text`, the mark's, and both are held apart from body text. The one pair not held is the
     working accent's words against red words (`K_EXEMPT`): BrainDog red is the working accent, late and "needs you" are
     a deeper red of the same hue, and the owner's word is that the two stand apart "with a mark or a word, never the
     colour alone". In light no link can be 8 L* off the late red and still clear AA on the board, so the rule could
     only be met by a link the product does not want. The pair is measured and reported as a pass, so the distance stays
     on the record; what carries the difference is the late thing's word, its dot and its hatch
     (`separation.test.ts`). Every other pair still refuses. */
  for (const link of ['accent-text', 'action-text'] as const)
    for (const [what, role] of [
      ['body text', 'ink'],
      ['an overdue figure', 'danger-text'],
    ] as const) {
      const dL = Math.abs(rgbToCielab(rgb(p[link])).L - rgbToCielab(rgb(p[role])).L);
      const exempt = link === K_EXEMPT[0] && role === K_EXEMPT[1];
      if (dL < 8 && !exempt)
        out.push({
          check: 'K',
          scheme,
          level: 'refuse',
          code: 'CONTRAST_FLOOR',
          measured: r2(dL),
          /* THE LINK, because the link is what moves. `ink` and `danger-text` are what a link is measured
             against and neither is free to shift to make room for it (39 §6.3). */
          at: at(link),
          fix: `theme: a link and ${what} are ${r2(dL)} L* apart in ${scheme}. Colour alone cannot carry the difference; they need 8.`,
        });
      /* ONE ROW PER THING A LINK CAN BE CONFUSED WITH, passing or not, so the output says which comparisons K made.
         It is a closed list of four and a reader should be able to see all of them. */
      else out.push({ check: 'K', scheme, level: 'pass', measured: r2(dL) });
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
  /* A JUDGEMENT CALL THAT CAME OUT THE OTHER WAY IS STILL AN ANSWER. M warns or it passes, and the
     pass carries the separation so the install diff can show how close to the line a theme sat. */
  else out.push({ check: 'M', scheme, level: 'pass', measured: r2(dLine) });

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
    /* ONE ROW PER INK EVEN WHEN THERE IS NO ADVISORY, and the measurement is the APCA score
       itself. N is the only check here that reads a second contrast model, so its four rows are
       the place somebody comparing WCAG against APCA on this palette would look. */
    else out.push({ check: 'N', scheme, level: 'pass', measured: lc });
  }

  return out;
}

/**
 * T · THE FRAME (UI pass, 20 Oct): every name the stylesheet paints with, and every pair in `FRAME_PAIRS` at the
 * profile's frame floors (SPEC 1.2). The dialect's roles above are what a theme is written in; these are what a reader
 * sees, so a palette that clears A to S and ships a frame under its floors is refused here, naming the pair.
 *
 * And red words beside body ink, at K's 8 L*: a link and a late date are read against the sentence they sit in.
 */
export function checkFrame(built: Built, scheme: Scheme): Finding[] {
  const f = built.frame[scheme];
  const out: Finding[] = [];
  const at = (role: string) => address(built.id, scheme, role);
  let shaped = true;
  for (const role of FRAME_ROLES)
    if (!HEX.test(f[role])) {
      shaped = false;
      out.push({
        check: 'T',
        scheme,
        level: 'refuse',
        code: 'THEME_VALUE_INVALID',
        at: at(role),
        fix: `theme: ${role} is "${f[role]}", which is not a colour the frame can paint.`,
      });
    }
  if (shaped) out.push({ check: 'T', scheme, level: 'pass', measured: FRAME_ROLES.length });
  for (const q of FRAME_PAIRS) {
    const floor = frameFloor(built.profile.frame, q.floor);
    const got = contrast(rgb(f[q.fg]), rgb(f[q.bg]));
    /* A PAIR THE PROFILE DOES NOT HOLD IS STILL MEASURED AND REPORTED, as K reports its one exempt pair: the house's
       floating edge is a hairline by design, and the number stays on the record. */
    if (floor !== null && got < floor)
      out.push({
        check: 'T',
        scheme,
        level: 'refuse',
        code: 'CONTRAST_FLOOR',
        measured: r2(got),
        at: at(q.fg),
        fix: `theme: ${q.what} (${q.fg} on ${q.bg}) is ${r2(got)}:1 in ${scheme}. It needs ${floor}:1. Move ${q.fg}.`,
      });
    else out.push({ check: 'T', scheme, level: 'pass', measured: r2(got) });
  }
  const dL = Math.abs(rgbToCielab(rgb(f.red)).L - rgbToCielab(rgb(f.ink)).L);
  if (dL < 8)
    out.push({
      check: 'T',
      scheme,
      level: 'refuse',
      code: 'CONTRAST_FLOOR',
      measured: r2(dL),
      at: at('red'),
      fix: `theme: red words and body text are ${r2(dL)} L* apart in ${scheme}. Colour alone cannot carry the difference; they need 8.`,
    });
  else out.push({ check: 'T', scheme, level: 'pass', measured: r2(dL) });
  return out;
}

/**
 * I · NO LEVEL CASTS ANYTHING (UI pass, 20 Oct; SPEC 1.9). It held a ladder that only went up; there is no ladder now,
 * separation is the surface colour and a 1px edge, and each level is `none` in both schemes. A theme that brings a
 * shadow back is refused.
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
    let ok = true;
    for (const [i, level] of built.elevation[scheme].entries())
      if (level.trim() !== 'none') {
        ok = false;
        out.push({
          check: 'I',
          scheme,
          level: 'refuse',
          code: 'THEME_LADDER_ORDER',
          fix: `theme: elevation level ${i + 1} in ${scheme} casts "${level}". Nothing in the product casts a shadow; separate it by its surface and a 1px edge.`,
        });
      }
    /* ONE PASS ROW PER SCHEME, so I still says it ran. The measurement is the number of levels it read. */
    if (ok) out.push({ check: 'I', scheme, level: 'pass', measured: built.elevation[scheme].length });
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
  /* AND THE PASS IS A ROW TOO, WITH THE SAME ARBITRARY `dark` THE REFUSAL ALREADY CARRIES. L is
     about the stylesheet rather than about either scheme, so neither value of `scheme` is true
     here; the field is not optional, and picking the same one both ways is at least consistent.
     The measurement is the length of the document the check read, which is the one fact that
     separates "the block is there" from "the caller handed in an empty string". */
  return has
    ? [{ check: 'L', scheme: 'dark', level: 'pass', measured: css.length }]
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
