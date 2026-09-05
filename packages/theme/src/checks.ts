/**
 * The validator. Sixteen checks, 28 §4.4 — A–H are 13 §2.4's, I–P are 28's additions.
 * Runs at install, in CI, and live in the theme editor. A failing theme is refused, naming the pair.
 *
 * Three policies, not one: mechanically correctable is auto-corrected and shown in the diff; a
 * breached floor is refused; a judgement call warns and installs (28 §4.5). Auto-correction never
 * crosses the WCAG line — there is no "we nudged your faint up to 4.5 for you."
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
import { INKS, INTENTS, SURFACES, type Built, type Palette, type Role, type Scheme } from './build.ts';

export type Finding = {
  check: string;
  scheme: Scheme;
  level: 'pass' | 'warn' | 'refuse';
  /** The sentence the app shows, verbatim. What was wrong · where · what to do (13 §6). */
  fix?: string;
  code?: 'CONTRAST_FLOOR' | 'INTENT_INSEPARABLE' | 'THEME_LADDER_ORDER' | 'THEME_VALUE_INVALID';
  measured?: number;
};

const rgb = (s: string) => fromHex(s);
const r2 = (n: number) => Math.round(n * 100) / 100;
const DEFS: Deficiency[] = ['protan', 'deutan', 'tritan'];
const HEX = /^#[0-9A-F]{6}$/;
const BANNED = ['url(', 'image(', 'element(', 'attr(', 'var(', '\\'];

function pairsAgainstSurfaces(
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
          fix: `theme — the pair (${role} on ${surface}) is ${r2(got)}:1 in ${scheme}. It needs ${floor}:1. Move ${role} further from the ground.`,
        });
    }
  return out;
}

export function checkScheme(built: Built, scheme: Scheme): Finding[] {
  const p = built.schemes[scheme];
  const out: Finding[] = [];

  /* A · every ink role x every surface */
  out.push(...pairsAgainstSurfaces(p, INKS, 4.5, 'A', scheme));

  /* B · accent as text x every surface */
  out.push(...pairsAgainstSurfaces(p, ['accent-text'], 4.5, 'B', scheme));

  /* C · faint at the large-text floor. The usage half — no faint below 24px — is a css-rules rule. */
  out.push(...pairsAgainstSurfaces(p, ['faint'], 3, 'C', scheme));

  /* D · the load-bearing boundaries and the four -fill roles.
     `accent-edge` belongs here and not in a check of its own: it is the visual boundary of a filled
     control, which is the same SC 1.4.11 requirement at the same floor as `edge`. It was drawn at
     the call site as a mix of the accent and `sunk` and measured 1.33:1 against `s3` in dark. */
  out.push(
    ...pairsAgainstSurfaces(
      p,
      ['edge', 'accent-edge', 'earn-fill', 'warn-fill', 'danger-fill', 'info-fill'],
      3,
      'D',
      scheme,
    ),
  );

  /* E · the focus ring against both neighbours, and the two tones nine apart */
  const ringTones = contrast(rgb(p['focus-in']), rgb(p['focus-out']));
  if (ringTones < 9)
    out.push({
      check: 'E',
      scheme,
      level: 'refuse',
      code: 'CONTRAST_FLOOR',
      measured: r2(ringTones),
      fix: `theme — the two focus-ring tones are ${r2(ringTones)}:1 apart in ${scheme}. They need 9:1, or the ring vanishes on one surface.`,
    });
  out.push(...pairsAgainstSurfaces(p, ['focus-in'], 3, 'E', scheme));

  /* F · intent x intent, delta-E 2000 after Brettel at severity 1.0, all three deficiencies.
     >= 20 passes; 10-20 passes recorded `band: glyph`; below 10 is refused. The band is a pass and
     not a warning because the house theme itself sits in it (39 D6). */
  const intents: [string, string][] = [
    ['good', p.earn],
    ['warn', p.warn],
    ['bad', p.danger],
    // `info` has a generated role of its own here, and the seed file says why: the accent is the
    // mark, the mark is red, and `danger` is anchored at 27.
    ['info', p.info],
  ];
  let worstF = Infinity;
  for (let i = 0; i < intents.length; i++)
    for (let j = i + 1; j < intents.length; j++)
      for (const d of DEFS) {
        const de = separation(rgb(intents[i]![1]), rgb(intents[j]![1]), d);
        worstF = Math.min(worstF, de);
        if (de < 10)
          out.push({
            check: 'F',
            scheme,
            level: 'refuse',
            code: 'INTENT_INSEPARABLE',
            measured: r2(de),
            fix: `theme — ${intents[i]![0]} and ${intents[j]![0]} are delta-E ${r2(de)} apart to a ${d}ope. Four intents need at least 10. Move one hue, or lower the chroma of the other.`,
          });
      }
  out.push({ check: 'F', scheme, level: 'pass', measured: r2(worstF) });

  /* G · intent as text x every surface */
  out.push(...pairsAgainstSurfaces(p, INTENTS, 4.5, 'G', scheme));

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
        fix: `theme — the surface ladder turns back on itself at ${SURFACES[i]} in ${scheme}. Surfaces must only go one way.`,
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
        fix: `theme — ${role} is "${value}", which is not a colour this dialect accepts.`,
      });
    else if (!inGamut(rgb(value)))
      out.push({ check: 'J', scheme, level: 'refuse', code: 'THEME_VALUE_INVALID', fix: `theme — ${role} is outside sRGB.` });
    for (const b of BANNED)
      if (value.includes(b))
        out.push({
          check: 'P',
          scheme,
          level: 'refuse',
          code: 'THEME_VALUE_INVALID',
          fix: `theme — ${role} contains "${b}", which a token value may never hold.`,
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
        fix: `theme — ${role} is ${r2(c)}:1 against its own label in ${scheme}. A control needs 4.5:1 in every state, not only at rest.`,
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
        fix: `theme — a link and ${what} are ${r2(dL)} L* apart in ${scheme}. Colour alone cannot carry the difference; they need 8.`,
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
      fix: `theme — line and edge are ${r2(dLine)} apart in ${scheme}. A decorative hairline and a load-bearing boundary should not look the same.`,
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
        fix: `theme — ${role} on bg passes WCAG at ${r2(w)}:1 but scores Lc ${lc} under APCA. Advisory only.`,
      });
  }

  return out;
}

/** I · the elevation ladder only goes up, in both schemes — a theme is what breaks it (28 §4.4). */
export function checkElevation(built: Built): Finding[] {
  const out: Finding[] = [];
  for (const scheme of ['dark', 'light'] as Scheme[]) {
    const blurs = built.elevation[scheme].map((s) => {
      const m = [...s.matchAll(/(\d+)px/g)].map((x) => Number(x[1]));
      return Math.max(...m);
    });
    for (let i = 1; i < blurs.length; i++)
      if (blurs[i]! <= blurs[i - 1]!)
        out.push({
          check: 'I',
          scheme,
          level: 'refuse',
          code: 'THEME_LADDER_ORDER',
          fix: `theme — elevation level ${i + 1} is not above level ${i} in ${scheme}.`,
        });
  }
  return out;
}

/** L · forced-colors survival, asserted over the emitted CSS text, not over a rendered page. */
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
          fix: 'theme — the stylesheet has no forced-colors block. Under forced colours the five-surface ladder becomes one surface and every block boundary disappears.',
        },
      ];
}

export function validate(built: Built, css?: string): Finding[] {
  return [
    ...checkScheme(built, 'dark'),
    ...checkScheme(built, 'light'),
    ...checkElevation(built),
    ...(css ? checkForcedColors(css) : []),
  ];
}

export const refusals = (f: Finding[]) => f.filter((x) => x.level === 'refuse');
export const warnings = (f: Finding[]) => f.filter((x) => x.level === 'warn');
