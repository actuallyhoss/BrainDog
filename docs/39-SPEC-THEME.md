# 39 · packages/theme — specification

`@braindog/theme`, private, zero dependencies, position 4 in the total order of [31-STACK](31-STACK.md) §2. It turns
the theme dialect of [28-THEMING](28-THEMING.md) §1 into a palette per scheme, runs the seventeen checks of 28 §4.4 and §6.1,
and emits the two sinks of [22-FRONTEND](22-FRONTEND.md) §7 — CSS custom properties in `@layer theme` and a DTCG
2025.10 document. Mode: ponytail. Colour mathematics is exact; scope is lazy. Every number below was computed by a
reference prototype while this document was written; a builder who lands more than one 8-bit unit away from a
figure here has a rounding difference to explain, not a bug to hide.

---

## 1 · Purpose and boundary

**Does.** Parse the JSON form of the theme dialect · generate every role of [13-UI](13-UI.md) §2.1 for one scheme
from one seed colour by solving for contrast · check a palette (A–P) · turn failures into the refusal shape of
[30-BLUEPRINT](30-BLUEPRINT.md) §6 with the copy of 28 §4.5 · emit CSS and DTCG byte-stably · compute an identity
accent and its distance from the intents ([13-UI](13-UI.md) §2.1b).

**Refuses to do.** Read YAML (`declare` owns YAML → JSON, 31 §2) · touch a database, the network, a file or the DOM ·
emit anything but custom properties · derive colour in CSS (28 §2.1) · set type, motion, `color-scheme` or
`forced-color-adjust` (28 §6, 13 §9) · import a DTCG document · auto-correct a contrast failure (28 §4.5).

**May import.** Nothing. Runs unchanged in Node 24.13, workerd and the browser (the theme editor of
[21-AUTHORING](21-AUTHORING.md) §6 imports it inside the editor chunk — §13 D16).

**Callers.** `record` (install: `build`), `apps/web` (editor: `build`, `toCSS`; SSR head: `toCSS`), `apps/worker`
and `apps/selfhost` (SSR head), the write path via `record` (`nextAccentHue`), `tools/gates` (`contrast`).

---

## 2 · Public API

Every symbol below is the whole `exports` map (`"."` → `src/index.ts`). Nothing else is importable.

```ts
// ── closed lists (as const arrays; unions derived) ─────────────────────────────
export const SCHEMES = ['dark', 'light'] as const;                        // dark first: the product is dark-first (28 §4.1)
export const SURFACES = ['sunk', 'bg', 's1', 's2', 's3'] as const;        // ascending in relative luminance
export const ROLES = [
  'sunk', 'bg', 's1', 's2', 's3',
  'ink', 'ink2', 'dim', 'faint',
  'line', 'edge',
  'earn', 'earn-fill', 'warn', 'warn-fill', 'danger', 'danger-fill',
  'accent', 'accent-text', 'accent-ink', 'focus-in', 'focus-out',
] as const;                                                               // 22 — 13 §2.1, 34 §6 "5 + 4 + 2 + 3(+3) + 5"
export const CHECKS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'] as const;   // 16 — 28 §4.4
export const VIEWS = ['none', 'protan', 'deutan', 'tritan'] as const;
export const DENSITY = { compact: 28, comfortable: 32, roomy: 36 } as const;                        // px — 28 §1
export const TYPE_SCALE = [['t-xs',12],['t-sm',13],['t-base',15],['t-md',17],['t-lg',20],['t-xl',24],['t-2xl',28],['t-3xl',34]] as const;
export const THEME_CODES = ['CONTRAST_FLOOR', 'INTENT_INSEPARABLE', 'THEME_LADDER_ORDER', 'THEME_VALUE_INVALID'] as const;

export type Scheme = typeof SCHEMES[number];  export type Surface = typeof SURFACES[number];
export type Role = typeof ROLES[number];      export type Check = typeof CHECKS[number];
export type View = typeof VIEWS[number];      export type Hex = `#${string}`;                        // "#RRGGBB", upper-case
export type Verdict = 'pass' | 'warn' | 'refuse' | 'corrected';
export type ThemeCode = typeof THEME_CODES[number];

// ── input ──────────────────────────────────────────────────────────────────────
/** Validates the JSON form of the 28 §1 dialect. Throws ThemeError (code THEME_VALUE_INVALID) on the first fault. */
export function parseTheme(body: unknown): ThemeInput;
export const HOUSE: ThemeInput;                        // the shipped house theme, already parsed
export const STANDARD: Profile;                        // the 28 §3 targets
export const HIGH_CONTRAST: Profile;                   // the accessibility floor — §5.9

// ── generate · check · build ───────────────────────────────────────────────────
/** Steps 0–7 of §5.7 for one scheme. Never throws for a parsed input. */
export function generate(input: ThemeInput, scheme: Scheme, profile?: Profile): Palette;
/** The seventeen checks over one palette. Never throws. See §6.1 on what it returns and what it does not. */
export function check(palette: Palette): CheckResult[];
/** 'refuse' if any result refuses, else 'warn' if any warns, else 'pass'. */
export function verdict(results: readonly CheckResult[]): 'pass' | 'warn' | 'refuse';
/** The 30 §6 shape with the 28 §4.5 copy; one refusal per refusing result, results order preserved. */
export function toRefusals(themeId: string, results: readonly CheckResult[]): Refusal[];
/** parse → generate ×2 (dark, light) → check ×2 → refusals. Total: a parse fault is a refusal, not a throw. */
export function build(body: unknown, profile?: Profile): Built;

// ── emit ───────────────────────────────────────────────────────────────────────
/** One `@layer theme` block for one scheme; `media` wraps the rule in `@media <media>`. Byte-stable. LF. */
export function toCSS(palette: Palette, media?: string): string;
/** The fixed type scale in `@layer tokens`. Constant. Not part of a theme. */
export const TOKENS_CSS: string;
/** The 28 §2.5 forced-colors block, verbatim, for apps/web to place in `@layer a11y`. Check L reads it. */
export const A11Y_FORCED_COLORS: string;
/** One DTCG 2025.10 Resolver document with both schemes inline. Byte-stable via JSON.stringify(doc, null, 2) + LF. */
export function toDTCG(theme: { dark: Palette; light: Palette }): DTCGResolver;

// ── identity accents (13 §2.1b) ────────────────────────────────────────────────
/** oklch(L C hue) at the palette's mark constants; hex is the same colour quantised. */
export function identityAccent(hue: number, palette: Palette): { css: string; hex: Hex };
/** min over palettes and the four views of ΔE2000 between two marks. */
export function accentDistance(h1: number, h2: number, palettes: readonly Palette[]): number;
/** The hue (multiple of 5) farthest from every intent, the accent and every existing mark. Deterministic. */
export function nextAccentHue(existing: readonly number[], palettes: readonly Palette[]): number;

// ── colour maths, for gates and tests ──────────────────────────────────────────
export function contrast(a: Hex, b: Hex): number;                 // WCAG 2.x ratio, ≥ 1
export function apca(text: Hex, background: Hex): number;         // Lc, signed
export function simulate(c: Hex, view: View): Hex;                // Brettel 1997 at severity 1.0; 'none' is identity
export function deltaE2000(a: Hex, b: Hex): number;               // CIEDE2000 in CIELAB D65
export function toHex(oklch: readonly [L: number, C: number, h: number]): Hex;   // gamut-mapped, quantised
export function toOklch(c: Hex): [L: number, C: number, h: number];

export class ThemeError extends Error { code: ThemeCode; at: string; found?: string; wanted?: string; fix: string; }
```

Error contract: `parseTheme` throws `ThemeError`; nothing else throws on a parsed input. `build` never throws.
Signatures differ from the first sketch in two places, both recorded: `parseTheme` takes JSON, not YAML (§13 D1); `toCSS`
takes the scheme from the palette, not as a second argument (a palette has exactly one scheme).

---

## 3 · Files

Five source files, one data file, six test files. Counted.

```
packages/theme/
├── package.json            "@braindog/theme" · private · "exports": { ".": "./src/index.ts" } · zero dependencies
├── themes/house.json       the house theme in the dialect's JSON form (§4.1) — the only data file
├── src/
│   ├── colour.ts           sRGB ↔ linear ↔ OKLab/OKLCH ↔ XYZ/CIELAB · WCAG · APCA · gamut map · Brettel · ΔE2000   ~230 lines
│   ├── generate.ts         profiles · the solve · steps 0–7 · elevation · mark constants · nextAccentHue           ~220
│   ├── checks.ts           the seventeen checks · fix solver · toRefusals · the copy                                ~190
│   ├── emit.ts             toCSS · TOKENS_CSS · A11Y_FORCED_COLORS · toDTCG                                        ~110
│   └── index.ts            types · closed lists · parseTheme · build · re-exports                                 ~150
└── test/
    ├── colour.test.ts      Sharma pairs · APCA · Brettel · OKLab · gamut vectors
    ├── generate.test.ts    golden palettes · the solve · property test (fast-check) · seeds file
    ├── check.test.ts       house and high-contrast pass · midnight refuses with the exact copy · parse refusals
    ├── emit.test.ts        toCSS bytes and stability · toDTCG bytes and stability · check L text
    ├── identity.test.ts    mark floors over 360 hues · the nextAccentHue sequence
    ├── perf.test.ts        the §7 budget
    └── golden/             house.dark.json · house.light.json · high-contrast.dark.json · high-contrast.light.json · house.css · house.tokens.json
```

Comments explain why at the decision; every constant table carries the section of this document it comes from.

---

## 4 · Data structures

### 4.1 · `ThemeInput` — the parsed dialect

```ts
type ThemeInput = {
  theme: string;                                  // ^[a-z][a-z0-9_]{0,31}$ (34 §4, register-id grammar) → declaration id theme.<id>
  extends: 'house';                               // the only base in v1; absent = house
  scheme: 'both';                                 // the only value in v1; absent = both
  seed: { accent: Oklch; neutralHue: number };    // accent C ≥ 0.02; neutralHue = accent hue unless `neutral_hue` was a number
  roles: Record<Scheme, Partial<Record<Role, Override>>>;   // absent roles are generated
  scale: { space: number; radius: [sm: number, md: number, lg: number]; density: keyof typeof DENSITY };
};
type Oklch = readonly [L: number, C: number, h: number];          // L 0–1, C ≥ 0, h [0, 360)
type Override = { raw: string; hex: Hex; corrected: boolean };    // hex = gamut-mapped, quantised; corrected = the raw value was outside sRGB
```

Invariants a test can check: every `hex` matches `/^#[0-9A-F]{6}$/`; `scale.space ∈ [2, 8]`; each radius `∈ [0, 999]`
and `sm ≤ md ≤ lg`; `extends` and `scheme` hold their single legal value; unspecified `seed.neutralHue` equals
`seed.accent[2]`; unspecified `scale` equals `HOUSE.scale` (`extends: house` means *inherit house's seed and scale
defaults*, §13 D18).

The wire form this parses (what `declare` hands over from the YAML of 28 §1):

```json
{ "theme": "midnight", "extends": "house", "scheme": "both",
  "seed": { "accent": "oklch(0.62 0.16 262)", "neutral_hue": "from-accent" },
  "roles": { "dark": { "bg": "oklch(0.17 0.008 262)", "ink": "oklch(0.96 0.004 262)" } },
  "scale": { "space": { "base": 4 }, "radius": { "sm": 3, "md": 6, "lg": 10 }, "density": "comfortable" } }
```

`themes/house.json` is `{ "theme": "house", "seed": { "accent": "oklch(0.62 0.16 262)" }, "scale": { "space": { "base": 4 }, "radius": { "sm": 3, "md": 6, "lg": 10 }, "density": "comfortable" } }`.

### 4.2 · `Profile` — the targets the generator solves for

```ts
type Profile = {
  ladder: Record<Scheme, { anchor: Surface; L: number; step: number }>;
  surfaceChroma: number;                 // cap on the surfaces' OKLCH chroma
  inkChroma: [factor: number, cap: number];   // C_ink = min(C_seed · factor, cap)
  ink: { ink: number; ink2: number; dim: number; faint: number };   // contrast targets on the worst surface
  edge: number; lineOffset: number;      // edge target; line = edge's L moved lineOffset toward the ground
  accentInk: number; fill: number;       // accent-ink floor on accent; -fill target on the worst surface
  mark: Record<Scheme, [L: number, C: number]>;                    // identity accent constants
  elevation: Record<Scheme, [number, number, number]>;             // shadow alphas e1 < e2 < e3
};
```

| Field | `STANDARD` | `HIGH_CONTRAST` |
|---|---|---|
| `ladder.dark` | anchor `bg` L 0.16, step 0.028 | anchor `bg` L 0.10, step 0.035 |
| `ladder.light` | anchor `s3` L 0.99, step 0.022 | anchor `s3` L 1.00, step 0.022 |
| `surfaceChroma` | 0.008 | 0 |
| `inkChroma` | [0.12, 0.02] | [0, 0] |
| `ink` | 12 · 8 · 6 · 4.5 | 15 · 12.5 · 10.5 · 9.5 |
| `edge` · `lineOffset` | 3.0 · 0.08 | 4.5 · 0.08 |
| `accentInk` · `fill` | 4.5 · 3.0 | 4.5 · 4.5 |
| `mark.dark` · `mark.light` | [0.72, 0.12] · [0.55, 0.09] | [0.78, 0.11] · [0.48, 0.08] |
| `elevation.dark` · `.light` | [0.30, 0.42, 0.55] · [0.08, 0.12, 0.18] | [0.45, 0.60, 0.75] · [0.14, 0.20, 0.28] |

Shared by both profiles, not in the type: intent hue anchors `danger 27° · warn 75° · earn 145°` (28 §3 step 5);
intent target grid `GRID = [4.5, 6, 7.5, 9, 10.5, 12]`; accent-text grid `AGRID = [4.5, 6, 7.5, 9]`; intent chroma
stages `[0.14]` then `[0.14, 0.08]`; K floor 8 L\*; F floors 10 and 20; M floor 0.06; N floor 60 Lc.

### 4.3 · `Palette` — one scheme, every role, with its proof

```ts
type Palette = {
  theme: string; scheme: Scheme; profile: 'standard' | 'high';
  roles: Record<Role, Hex>;                                   // 22 keys, ROLES order
  elevation: [number, number, number];                        // alphas, from the profile
  mark: [L: number, C: number];
  scale: ThemeInput['scale'];
  targets: { danger: number; warn: number; earn: number; accentText: number; intentChroma: number };   // what step 5 chose
  overridden: Role[];                                         // roles taken from input.roles[scheme]
  corrections: { role: Role; from: string; to: Hex }[];       // check J's material: overrides that were outside sRGB
  warnings: string[];                                         // generator notes, e.g. accent-text is 0.11 L from accent
};
```

Invariants: every role value is in sRGB (by construction); `overridden ⊆ input.roles[scheme]` keys; when
`overridden` is empty, `check(palette)` has zero `refuse` results for `STANDARD` and `HIGH_CONTRAST` except possibly
check F; `focus-in === ink` and `focus-out === bg` unless overridden; `generate` is a pure function of
`(input, scheme, profile)` — the same input gives the same bytes on every host.

### 4.4 · `CheckResult`, `Refusal`, `Built`

```ts
type CheckResult = {
  check: Check; scheme: Scheme;
  pair: string;                 // 'faint on s3' · 'good and bad' · 'sunk < bg' · 'accent-text vs ink2' · 'e1 < e2 < e3'
  roles: Role[];                // involved roles, first = the one a fix moves
  value: number; floor: number;
  unit: 'ratio' | 'dE2000' | 'Lstar' | 'L' | 'luminance' | 'alpha' | 'Lc' | 'count' | 'none';
  verdict: Verdict;
  wanted?: string;              // the second sentence of the copy
  view?: View;                  // F: the simulation that produced the minimum
  band?: 'clear' | 'glyph';     // F: ≥ 20 · 10–20
  lc?: number;                  // A, B, G: APCA Lc of the pair, stored on every text pair (28 §4.1)
  fix?: { role: Role; to: Hex; verb: 'Lighten' | 'Darken' };   // A–D, G: the role re-solved on this surface, L only
};
type Refusal = { code: ThemeCode; at: string; found?: string; wanted?: string; fix: string };   // 30 §6, 33 §2 shape
type Built =
  | { ok: true;  theme: string; dark: Palette; light: Palette; results: CheckResult[]; warnings: string[]; corrections: Palette['corrections'] }
  | { ok: false; refusals: Refusal[]; results: CheckResult[] };
```

Invariants: **`checkScheme` returns 99 results per scheme, and it is 99 and not 90.** The number is counted by
`theme.test.ts` ("EVERY CHECK REPORTS, PASS OR FAIL"), per letter as well as in total, so a change to any one check
has to be argued for in the same commit instead of quietly moving a sum. The arithmetic, which is the seventeen
checks exactly as they are written:

| Letter | How many | Why |
|---|---|---|
| A | 3 inks × 5 surfaces | 15 |
| B | `accent-text` × 5 surfaces | 5 |
| C | `faint` × 5 surfaces | 5 |
| D | `edge` `accent-edge` and four `-fill` roles, 6 × 5 surfaces | 30 |
| E | the two ring tones against each other, then `focus-in` × 5 surfaces | 6 |
| F | one summary row carrying the worst separation over the six intent pairs | 1 |
| G | 4 intents as text × 5 surfaces | 20 |
| H | 4 rungs of the five-surface ladder | 4 |
| J | one row for the palette: the most chroma any role gave up | 1 |
| K | a link against body ink, and against `danger` | 2 |
| M | `line` against `edge` | 1 |
| N | the APCA advisory, one row per ink | 4 |
| O | one row for the palette: every value is shaped like a colour | 1 |
| P | one row for the palette: no value holds a banned token | 1 |
| Q | the control fill against its own label, at rest and on hover and on press | 3 |

`15 + 5 + 5 + 30 + 6 + 1 + 20 + 4 + 1 + 2 + 1 + 4 + 1 + 1 + 3 = 99`. `validate` adds `checkElevation`'s one row per
scheme and `checkForcedColors`'s one row for the document, so it returns `99 + 99 + 2 + 1 = 201` for a theme that
passes everything.

**90 WAS NEVER IMPLEMENTED, SO IT HAS NO AUTHORITY.** Measured on September 20th 2026, before this was built,
`checkScheme` returned 6 results in dark and 4 in light: it emitted a row only when something was notable, plus a
summary pass for F and three for Q, and checks A to E and G to P emitted nothing at all when they passed. Nothing
asserted either number, which is how the spec and the code came to sit that far apart. The specified shape was the
better one, for the reason the gate directory acts on elsewhere: a validator silent on a passing check cannot report
that the check stopped running, so deleting G left the output on a passing theme identical. Building it was additive
and safe, because every consumer reads through `refusals()` or `warnings()`, which filter by level. The per-letter
figures 90 was summed from were written for four roles that have since moved: A is 15 and not 20 (`faint` went to
C), B is 5 and not 6 (`accent-ink` on `accent` moved into Q), D is 30 and not 20 (`accent-edge` and `info-fill`
arrived), G is 20 and not 15 (`info` is a fourth intent), and F reports one summary row rather than one per pair.

The shape: one row per pair for A to G, one per rung for H, one per check for I to Q, plus one `N` row per ink;
every letter A to Q appears at least once in `validate`'s output, which is the property the test ends on. A pass
carries the measurement and no `at` and no `fix`. A check that refuses does **not** also emit its pass row, because
a validator contradicting itself in its own output is the fault this work exists to remove; F is the one exception
and it predates this, its summary row being the worst separation it found rather than a verdict.
`results` in `Built` is dark then light; `refusals` preserve `results` order, so a theme failing A in dark and F in
light lists `CONTRAST_FLOOR` first, as the 28 §4.5 example does.

---

## 5 · Algorithms

All arithmetic is IEEE double. A colour is quantised to 8 bits per channel exactly once, at the end of every solve
and every emission; every check reads the quantised colour, because the quantised colour is what ships.

### 5.1 · Colour spaces

**sRGB ↔ linear** (IEC 61966-2-1; WCAG 2.2 uses the 0.04045 threshold — WCAG 2.0's 0.03928 differs on no 8-bit value):

```
lin(v) = v ≤ 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ^ 2.4
enc(v) = v ≤ 0.0031308 ? 12.92 · v : 1.055 · v ^ (1/2.4) − 0.055
quantise(rgb_lin) = lin(round(enc(v) · 255) / 255) per channel, after clamping enc(v) to [0, 1]
hex = "#" + three upper-case two-digit bytes of round(enc(v) · 255)
```

**Linear sRGB → OKLab** (Ottosson 2020, the published matrices — `https://bottosson.github.io/posts/oklab/`):

```
l = 0.4122214708 r + 0.5363325363 g + 0.0514459929 b        l' = cbrt(l)   (cbrt keeps the sign)
m = 0.2119034982 r + 0.6806995451 g + 0.1073969566 b        m' = cbrt(m)
s = 0.0883024619 r + 0.2817188376 g + 0.6299787005 b        s' = cbrt(s)
L = 0.2104542553 l' + 0.7936177850 m' − 0.0040720468 s'
a = 1.9779984951 l' − 2.4285922050 m' + 0.4505937099 s'
b = 0.0259040371 l' + 0.7827717662 m' − 0.8086757660 s'
```

**OKLab → linear sRGB:**

```
l' = L + 0.3963377774 a + 0.2158037573 b      l = l'³
m' = L − 0.1055613458 a − 0.0638541728 b      m = m'³
s' = L − 0.0894841775 a − 1.2914855480 b      s = s'³
r = +4.0767416621 l − 3.3077115913 m + 0.2309699292 s
g = −1.2684380046 l + 2.6097574011 m − 0.3413193965 s
b = −0.0041960863 l − 0.7034186147 m + 1.7076147010 s
```

**OKLab ↔ OKLCH:** `C = hypot(a, b)`; `h = atan2(b, a)` in degrees, `+360` if negative; `h = 0` when `C < 1e-4`
(powerless hue); back: `a = C·cos h`, `b = C·sin h`. For a grey, `L = cbrt(Y)` exactly (the rows of the first matrix
sum to 1), which is why the surface ladder is written in OKLab L and checked in relative luminance.

**Linear sRGB → XYZ (D65) → CIELAB**, for ΔE2000 only:

```
X = 0.4124564 r + 0.3575761 g + 0.1804375 b       white: Xn 0.95047 · Yn 1.0 · Zn 1.08883 (the row sums of this matrix)
Y = 0.2126729 r + 0.7151522 g + 0.0721750 b
Z = 0.0193339 r + 0.1191920 g + 0.9503041 b
f(t) = t > (6/29)³ ? cbrt(t) : t / (3·(6/29)²) + 4/29
L* = 116 f(Y/Yn) − 16 · a* = 500 (f(X/Xn) − f(Y/Yn)) · b* = 200 (f(Y/Yn) − f(Z/Zn))
```

### 5.2 · Contrast

**WCAG 2.x relative luminance and ratio** (WCAG 2.2 §"relative luminance", §"contrast ratio"):

```
Y  = 0.2126 R_lin + 0.7152 G_lin + 0.0722 B_lin          on the quantised colour
CR = (Y_lighter + 0.05) / (Y_darker + 0.05)              printed with toFixed(2)
```

Composition, used by check E: for any three colours, `CR(a, c) ≤ CR(a, b) · CR(b, c)`. Therefore
`CR(focus-in, focus-out) ≥ 9` guarantees that any colour X adjacent to the ring has `CR ≥ 3` against at least one of
its two tones.

**APCA** (APCA-W3 0.1.9, "G-4g" constants), advisory only (28 §4.1, 22 §7 gate 4). On sRGB values in [0, 1]:

```
Y(c)  = 0.2126729 r^2.4 + 0.7151522 g^2.4 + 0.0721750 b^2.4      (no linear segment — APCA's own curve)
        if Y < 0.022: Y += (0.022 − Y)^1.414                       (soft black clamp)
if |Y_bg − Y_txt| < 0.0005: Lc = 0
if Y_bg > Y_txt (dark text):  S = (Y_bg^0.56 − Y_txt^0.57) · 1.14;  Lc = S < 0.1 ? 0 : (S − 0.027) · 100
else (light text):            S = (Y_bg^0.65 − Y_txt^0.62) · 1.14;  Lc = S > −0.1 ? 0 : (S + 0.027) · 100
```

### 5.3 · Gamut mapping — CSS Color 4 §14.2.1, "Binary Search Gamut Mapping with Local MINDE"

Input an OKLCH colour; output linear sRGB inside [0, 1]. `JND = 0.02`, `EPSILON = 0.0001`, `inGamut(c)` ⇔ every
linear channel in `[−1e-6, 1 + 1e-6]`, `ΔE_OK(a, b)` = Euclidean distance in OKLab, `clip` = clamp each channel to [0, 1].

1. If `L ≥ 1` return white; if `L ≤ 0` return black.
2. If `inGamut(oklch(L, C, h))` return it clipped (a no-op on the numbers).
3. `min = 0`, `max = C`, `min_inGamut = true`, `current = oklch(L, C, h)`.
4. While `max − min > EPSILON`: `chroma = (min + max) / 2`; `current = oklch(L, chroma, h)`.
   a. If `min_inGamut` and `inGamut(current)`: `min = chroma`; continue.
   b. `clipped = clip(current)`; `E = ΔE_OK(clipped, current)`.
   c. If `E < JND`: if `JND − E < EPSILON` return `clipped`; else `min_inGamut = false`, `min = chroma`.
   d. Else `max = chroma`.
5. Return `clip(current)`.

Lightness and hue are held; only chroma falls. Vectors: `oklch(0.7 0.5 30)` → `#FF5843` (L 0.683, C 0.206) where
Chrome clips to `#FF0000` at L 0.628 (28 §2.1); `oklch(0.9 0.3 100)` → `#FFDF00`; `oklch(0.5 0.3 145)` → `#007C00`;
`oklch(0.62 0.16 262)` is already in gamut and is unchanged, `#4E82E5`.

### 5.4 · Dichromat simulation — Brettel, Viénot & Mollon 1997

The two-plane method, in **linear** sRGB, severity 1.0, for all three deficiencies (28 §4.2). The constants are the
ones published in libDaltonLens (`libDaltonLens.c`, Nicolas Burrus, public domain — *"This is free and unencumbered
software released into the public domain"*), which derived them from the paper's anchor wavelengths (475/575 nm for
protan and deutan, 485/660 nm for tritan) and are the source of the normals 28 §4.2 quotes.

```
sim(rgb_lin, view):  d = rgb_lin · n ;  M = d ≥ 0 ? M1 : M2 ;  out = clip(M · rgb_lin)      (rows below are row-major)

protan  n = ( 0.00048,  0.00393, −0.00441)
  M1 = [0.14980, 1.19548, −0.34528 | 0.10764, 0.84864,  0.04372 |  0.00384, −0.00540, 1.00156]
  M2 = [0.14570, 1.16172, −0.30742 | 0.10816, 0.85291,  0.03892 |  0.00386, −0.00524, 1.00139]
deutan  n = (−0.00281, −0.00611,  0.00892)
  M1 = [0.36477, 0.86381, −0.22858 | 0.26294, 0.64245,  0.09462 | −0.02006,  0.02728, 0.99278]
  M2 = [0.37298, 0.88166, −0.25464 | 0.25954, 0.63506,  0.10540 | −0.01980,  0.02784, 0.99196]
tritan  n = ( 0.03901, −0.02788, −0.01113)
  M1 = [1.01277, 0.13548, −0.14826 | −0.01243, 0.86812, 0.14431 |  0.07589,  0.80500, 0.11911]
  M2 = [0.93678, 0.18979, −0.12657 |  0.06154, 0.81526, 0.12320 | −0.37562,  1.12767, 0.24796]
```

Properties a test asserts: each `n` sums to zero (the separation plane contains the neutral axis), so every grey is
a fixed point (max channel error ≤ 1e-4 over five greys); the six worked values of §9.1. Idempotence is **not**
asserted — clipping and five-decimal constants leave a residual of ΔE_OK ≈ 0.03–0.05.

### 5.5 · ΔE2000 — Sharma, Wu & Dalal 2005

Inputs two CIELAB colours; `k_L = k_C = k_H = 1`; angles in degrees. The eighteen steps, in order:

```
 1  C1 = hypot(a1, b1); C2 = hypot(a2, b2); C̄ = (C1 + C2) / 2
 2  G  = 0.5 · (1 − sqrt(C̄⁷ / (C̄⁷ + 25⁷)))
 3  a1' = (1 + G) a1; a2' = (1 + G) a2
 4  C1' = hypot(a1', b1); C2' = hypot(a2', b2)
 5  h' = atan2(b, a') mod 360, and 0 when a' = b = 0
 6  ΔL' = L2 − L1; ΔC' = C2' − C1'
 7  Δh' = 0 if C1'·C2' = 0; h2' − h1' if |h2' − h1'| ≤ 180; h2' − h1' − 360 if h2' − h1' > 180; else h2' − h1' + 360
 8  ΔH' = 2 sqrt(C1' C2') sin(Δh' / 2)
 9  L̄' = (L1 + L2) / 2; C̄' = (C1' + C2') / 2
10  h̄' = h1' + h2' if C1'·C2' = 0; (h1' + h2') / 2 if |h1' − h2'| ≤ 180; (h1' + h2' + 360) / 2 if h1' + h2' < 360; else (h1' + h2' − 360) / 2
11  T  = 1 − 0.17 cos(h̄' − 30) + 0.24 cos(2h̄') + 0.32 cos(3h̄' + 6) − 0.20 cos(4h̄' − 63)
12  Δθ = 30 exp(−((h̄' − 275) / 25)²)
13  R_C = 2 sqrt(C̄'⁷ / (C̄'⁷ + 25⁷))
14  S_L = 1 + 0.015 (L̄' − 50)² / sqrt(20 + (L̄' − 50)²)
15  S_C = 1 + 0.045 C̄'
16  S_H = 1 + 0.015 C̄' T
17  R_T = −sin(2Δθ) R_C
18  ΔE00 = sqrt((ΔL'/S_L)² + (ΔC'/S_C)² + (ΔH'/S_H)² + R_T (ΔC'/S_C)(ΔH'/S_H))
```

Reference data: the 34 pairs of Sharma et al., *"The CIEDE2000 color-difference formula: Implementation notes,
supplementary test data, and mathematical observations"*, Color Res. Appl. 30(1), 2005 — `ciede2000testdata.txt`.
Every pair must match to 4 decimals (§9.1).

`accentDistance`, check F and `nextAccentHue` all use one function: `dist(a, b) = min over VIEWS of
ΔE00(Lab(sim(a, v)), Lab(sim(b, v)))`, where `sim(·, 'none')` is the identity and the simulated linear RGB is
clipped to [0, 1] before CIELAB.

### 5.6 · The solve — bisection on L for a target contrast

`solve(target, ground, C, h, dir)` returns the colour of hue `h` and chroma `C` **nearest the ground** whose
quantised, gamut-mapped form reaches `target` against `ground`, or `null`.

1. `L_g = L(ground)` in OKLab. `dir = 'lighter'` → search `[L_g, 1]`; `'darker'` → `[0, L_g]`.
2. `colour(L) = quantise(gamutMap(oklch(L, C, h)))`; `P(L) = CR(colour(L), ground) ≥ target`.
3. If `P` is false at the far end (`L = 1` or `L = 0`) return `null` — unreachable.
4. Bisect 24 times: `mid = (lo + hi) / 2`; if `P(mid)` move the far bound to `mid`, else the near bound. 2⁻²⁴ is
   far below one 8-bit step, so the result is the boundary hex.
5. Return `colour(far bound)` — the far bound only ever moves to a passing `L`, so the result passes by construction.

`P` is monotone in `L` for in-gamut colours at fixed `(C, h)`: `Y` is a positive combination dominated by the middle
cone response, and gamut mapping holds `L`. The solver does not rely on the argument — step 5 verifies.
`ponytail:` 8-bit quantisation inside the predicate; a 10-bit target would move quantisation to emission.

### 5.7 · The generator — steps 0–7 for one scheme

`worst` is the surface every text role sits on at its lowest contrast: `sunk` in light, `s3` in dark. `dir` is
`'darker'` in light and `'lighter'` in dark. `pick(role, colour)` stores the override for `role` if
`input.roles[scheme]` has one, else `colour`; overrides feed every later step, so the ink ramp is solved against the
surfaces the author actually set.

| Step | Does |
|---|---|
| **0 Normalise** | `seed = toOklch(parse(seed.accent))`. `C < 0.02` → `THEME_VALUE_INVALID` at `seed.accent`, fix *"that colour is almost grey, so there is no hue to build from. Pick a colour with chroma of at least 0.02."* `h_n = neutralHue` |
| **1 Ground** | `C_s = min(C_seed, profile.surfaceChroma)`. Ladder from the anchor: surface `i` (0 sunk … 4 s3) gets `L = anchor.L + (i − anchor.index) · step`. Dark: `bg` 0.16 up by 0.028 → sunk 0.132, s1 0.188, s2 0.216, s3 0.244. Light: `s3` 0.99 down by 0.022 → s2 0.968, s1 0.946, bg 0.924, sunk 0.902. Each `pick(surface, toHex(oklch(L, C_s, h_n)))`. *An earlier draft (28 §3) anchored light at `bg` 0.99, which leaves no room for three lighter surfaces — §13 D2* |
| **2 Ink ramp** | `C_ink = min(C_seed · 0.12, 0.02)`. For `[ink 12, ink2 8, dim 6, faint 4.5]` (profile.ink): `pick(role, solve(target, worst, C_ink, h_n, dir))`; unreachable → white (dark) or black (light), which check A then refuses naming the pair |
| **3 Boundaries** | `edge = solve(profile.edge, worst, C_ink, h_n, dir)` — exactly 3.0 on the worst surface. `line = toHex(oklch(L_edge ∓ 0.08, C_ink, h_n))`, moved toward the ground (`−` in dark, `+` in light). `focus-in = ink`, `focus-out = bg` |
| **4 Accent** | `accent = toHex(seed)` (gamut-mapped, L and h held). `accent-ink` = the first of `[ink, #FFFFFF, #000000]` with `CR ≥ profile.accentInk` on `accent` — one of white or black always clears 4.5 (`Y ≥ 0.175` or `Y ≤ 0.183`). `accent-text` is chosen in step 5 from `AGRID`, filtered by check K: a candidate must sit ≥ 8 L\* from both `ink` and `ink2`; if none survives, the 4.5 candidate is kept and K will refuse (only reachable through an ink override). If `|L(accent-text) − L(accent)| > 0.10` push the warning *"accent-text is 0.11 L from accent; the link will not look like the button"* (28 §3 step 4) |
| **5 Intents** | Grid search, two stages. Candidates: for each intent `k ∈ {danger 27°, warn 75°, earn 145°}`, each `t ∈ GRID`, each `C ∈ stage`, `solve(t, worst, C, h_k, dir)` (nulls dropped); for `accent-text`, `AGRID` at the seed's chroma and hue after the K filter. For every combination `(danger, warn, earn, accent-text)` compute `m = min` of `dist` over the six pairs; `score = floor(2m) / 2`. Keep the combination with the highest `score`; ties → the higher chroma sum; then the lower target sum; then the first in iteration order. Stage 1 uses chroma `[0.14]`; if the winner's `m < 10`, stage 2 re-runs with `[0.14, 0.08]` and keeps its winner. Then `pick` the four, and `pick(k + '-fill', solve(profile.fill, worst, C_k, h_k, dir))` at the chosen chroma. Yellow lands where 28 §3 says it will: `warn` in light is `#351B00` at 12:1. Do not fight it |
| **6 Gamut map** | Already done inside every `toHex`. Overrides parsed from `oklch()` outside sRGB are mapped by §5.3 and recorded as `corrections` (check J) |
| **7 Validate** | `check(palette)`; `toRefusals`. There is no retry loop: step 5 already searched, and a floor breached by an override is the author's to fix (28 §4.5) |

House, chosen by step 5: dark `danger 4.5 · warn 7.5 · earn 12 · accent-text 4.5` at C 0.14; light
`danger 4.5 · warn 12 · earn 7.5 · accent-text 4.5` at C 0.14. Over 306 random in-gamut seeds (§9.2) the search
leaves every check but F passing; F refuses 41 palettes, all light, all seeds within ~30° of an intent hue — the
refusal 28 §4.5 intends, named.

### 5.8 · Fixed outputs — elevation, density, type, the mark constants

| Output | Value | Emitted as |
|---|---|---|
| Elevation | three levels, geometry fixed `0 1px 2px` · `0 2px 6px` · `0 6px 18px`, colour `rgb(0 0 0 / α)`, α from `profile.elevation[scheme]` | `--e1 --e2 --e3` in `@layer theme` |
| Density | `scale.density` → 28 / 32 / 36 px (28 §1, 13 §4.2) | `--row-h` |
| Space, radius | `scale.space` px; `scale.radius` px | `--space --radius-sm --radius-md --radius-lg` |
| Type scale | fixed eight steps 12 → 34 (13 §7); the reader's Text setting picks the body step in apps/web | `TOKENS_CSS`, `@layer tokens`, identical for every theme |
| Motion | not the theme's (13 §9); apps/web declares the six tokens in its own tokens sheet | nothing |
| Identity accent | `profile.mark[scheme]` = `(L, C)`; every hue at `(L, C)` is inside sRGB (min over hues of the gamut's chroma at that L: dark 0.1224 at h 200, light 0.0935 at h 200) and ≥ 3:1 on every surface (measured worst: dark 6.18 at h 348, light 3.44 at h 178) | `--mark-l --mark-c` |

### 5.9 · The high-contrast theme

`HIGH_CONTRAST` is a `Profile`, not a dialect key: `build(HOUSE, HIGH_CONTRAST)` with `theme: 'high-contrast'`.
Achromatic surfaces and inks; the ladder widened; ink 15 / 12.5 / 10.5 / 9.5 (`faint` at 9.5:1 keeps
|Lc| ≥ 60 in dark); edge and fills 4.5; marks at 4.5 (measured worst: dark 8.49, light 4.81). Intents use the same
grid as `STANDARD` because the separability floor binds first: at 9.5:1 the three intents in light sit below
L\* 24 and collapse under simulation (measured best F 7.4). Result: zero refusals, zero corrections, zero M
warnings in both schemes; F bands 10.1–52.6; N advisories on dark `accent-text`, `warn`, `danger` (15 rows). It is
never refused and never corrected; if a check fails it, the check is wrong and CI fails (28 §4.5, 18 §6).

### 5.10 · `forced-colors`

`A11Y_FORCED_COLORS` is the 28 §2.5 block, verbatim:

```css
@layer a11y {
  @media (forced-colors: active) {
    .panel, .grid, .rows, .table, .media { border: 1px solid CanvasText; }
    [data-intent] { forced-color-adjust: none; }
    :focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
  }
}
```

The theme never emits a selector, a border, `forced-color-adjust` or `color-scheme`, so it cannot delete the
surviving boundary. `prefers-contrast: more` is a *theme swap*, not a forced-colours state (28 §2.5): apps/web
appends `toCSS(highContrast[scheme], '(prefers-contrast: more)')` after the active theme's block; later in the
same layer wins when the query matches.

### 5.11 · Identity accents

1. `identityAccent(hue, p)`: `css = "oklch(<L> <C> <hue>)"` with the mark constants to 2 decimals and the hue as an
   integer; `hex = toHex([L, C, hue])`. Legal only on a mark, chip, avatar, calendar dot or chart series (13 §2.1b).
2. `accentDistance(h1, h2, palettes)` = `min over palettes of dist(identityAccent(h1).hex, identityAccent(h2).hex)`.
3. `nextAccentHue(existing, palettes)`: candidates `h ∈ {0, 5, …, 355}` minus every hue within 20° of 27, 75 or 145
   (a mark must not read as an intent). Score of `h` = min over palettes of `dist` between the mark at `h` and each
   of `earn earn-fill warn warn-fill danger danger-fill accent accent-text` and each existing mark. Return the
   highest score; ties → the lower hue. The kernel-written `hue` field of ADR-028 is this value at create.

Measured for house, first twelve calls: `320 (8.8) · 190 (5.3) · 5 (5.1) · 265 (4.3) · 125 (3.3) · 335 (2.3) ·
300 (2.2) · 350 (2.0) · 105 (1.9) · 170 (1.9) · 330 (1.4) · 115 (1.1)`. Four marks are separable under every
simulation at ΔE ≥ 4; after that the name beside the mark carries identity, as 13 §2.1b requires anyway (§13 D11).

### 5.12 · Emission

`toCSS(palette, media?)` — exactly this text, LF, two-space indent, roles in `ROLES` order, then `--e1..3`,
`--mark-l --mark-c`, `--space`, `--radius-sm/md/lg`, `--row-h`; alphas and marks with two decimals; no
`color-scheme`, no selector but `:root[data-scheme="<scheme>"]`, no property without a `--` prefix:

```css
@layer theme {
  :root[data-scheme="dark"] {
    --sunk: #06080B;
    --bg: #0B0D11;
    …
    --focus-out: #0B0D11;
    --e1: 0 1px 2px rgb(0 0 0 / 0.30);
    --e2: 0 2px 6px rgb(0 0 0 / 0.42);
    --e3: 0 6px 18px rgb(0 0 0 / 0.55);
    --mark-l: 0.72;
    --mark-c: 0.12;
    --space: 4px;
    --radius-sm: 3px;
    --radius-md: 6px;
    --radius-lg: 10px;
    --row-h: 32px;
  }
}
```

With `media`, the rule is wrapped in `  @media <media> { … }` inside the layer, indented one level further.
`TOKENS_CSS` is `@layer tokens {\n  :root {\n    --t-xs: 12px;\n … --t-3xl: 34px;\n  }\n}\n`.

`toDTCG` — one Resolver 2025.10 document, both schemes inline (28 §1), no `$ref` inside any token value, no
aliases (every role is a literal), `hex` alongside `components` (four decimals, which round-trips every 8-bit value):

```json
{ "name": "house",
  "sets": { "scale": { "sources": [ { "dimension": { "$type": "dimension",
      "space": { "$value": { "value": 4, "unit": "px" } }, "radius-sm": …, "radius-md": …, "radius-lg": …, "row-h": … } } ] } },
  "modifiers": { "scheme": { "default": "dark", "contexts": {
      "dark":  [ { "color": { "$type": "color", "sunk": { "$value": { "colorSpace": "srgb", "components": [0.0235, 0.0314, 0.0431], "hex": "#06080B" } }, … 22 roles },
                   "shadow": { "$type": "shadow", "e1": { "$value": { "color": { "colorSpace": "srgb", "components": [0, 0, 0], "alpha": 0.30 },
                                "offsetX": { "value": 0, "unit": "px" }, "offsetY": { "value": 1, "unit": "px" }, "blur": { "value": 2, "unit": "px" }, "spread": { "value": 0, "unit": "px" } } }, "e2": …, "e3": … },
                   "number": { "$type": "number", "mark-l": { "$value": 0.72 }, "mark-c": { "$value": 0.12 } } } ],
      "light": [ … the same shape … ] } } },
  "resolutionOrder": [ { "$ref": "#/sets/scale" }, { "$ref": "#/modifiers/scheme" } ] }
```

The record stores the dialect body (`declaration.body`, 30 §1); CSS and DTCG are derived on demand and are
byte-stable, so nothing derived is ever persisted (§13 D15).

---

## 6 · Refusals and errors

### 6.1 · The seventeen checks

Letters, pairs, floors and policies are 28 §4.4's; the last two columns are this package's. *Pairs* counts results
per palette, passing or failing, and they sum to the 99 of §4.4. A pass row carries the measurement and no `at`.

| # | Check | Pair set (per scheme) | Floor | Policy | Code | Pairs |
|---|---|---|---|---|---|---|
| A | every ink role × every surface | `ink ink2 dim` × 5 surfaces (`faint` is C's, below) | 4.5:1 | refuse | `CONTRAST_FLOOR` | 15 |
| B | `accent` as text × every surface | `accent-text` × 5 (`accent-ink` on `accent` is Q's) | 4.5:1 | refuse | `CONTRAST_FLOOR` | 5 |
| C | `faint` used below 24 px | `faint` × 5 at the large-text floor; decides whether A's copy offers the 24 px route | 3:1 | refuse | `CONTRAST_FLOOR` | 5 |
| D | `edge` × every surface | `edge accent-edge earn-fill warn-fill danger-fill info-fill` × 5 (1.4.11) | 3:1 | refuse | `CONTRAST_FLOOR` | 30 |
| E | focus ring vs both neighbours, focused vs unfocused | `focus-in` on `focus-out` ≥ 9 (§5.2 composition); `focus-in` × 5 ≥ 3 | 3:1 (2.4.13) | refuse | `CONTRAST_FLOOR` | 6 |
| F | intent × intent, ΔE2000 after Brettel, all three deficiencies | six pairs of `earn warn danger info`, `dist` of §5.5. **This row said `accent-text` and the code has never compared it here**: `INTENTS` is the four above, which is what this row’s own “intent × intent” means and what `build.ts`’s “Four intents need at least 10” says. `accent-text` is solved separately at generator step 6 by lightness clearance and is in no grid search, so §5’s description of a search over `(danger, warn, earn, accent-text)` is stale with it. **The count is 1 and not 6**: F reports one summary row per scheme carrying the worst separation it found over the six pairs, plus one refusal per pair below the floor | ≥ 20 clear · 10–20 glyph · < 10 | refuse < 10; 10–20 **pass, band recorded** (§13 D6) | `INTENT_INSEPARABLE` | 1 |
| G | intent as text × every surface | `earn warn danger info` × 5 | 4.5:1 | refuse | `CONTRAST_FLOOR` | 20 |
| H | surface ladder monotonic in relative luminance | four adjacent pairs `sunk<bg<s1<s2<s3`, strict | strict | refuse | `THEME_LADDER_ORDER` | 4 |
| I | elevation ladder monotonic, both schemes | `e1 < e2 < e3` in alpha (geometry is fixed and ascending) | strict | refuse | `THEME_LADDER_ORDER` | 1 per scheme, from `checkElevation` |
| J | how much chroma the gamut mapper took off | `built.clipped[scheme][role]` | > 0.02 refuses | refuse | `THEME_VALUE_INVALID` | 1 |

J is the one row where the code deliberately answers a different question from the one this table asked, and its comment gives the reason: asking an emitted hex whether it is in sRGB is asking whether a number between 0 and 1 is between 0 and 1, because `quantise` clamps and `fromHex` divides by 255, and over all 4,096 three-digit values that branch was never false. What can be wrong is that the emitted colour is a clipped version of the one the palette was solved as. **The `auto-correct` policy this row used to name is implemented nowhere**: `Finding.level` is `pass | warn | refuse` and has no room for a correction, and no `corrected` row exists in the package. `checks.ts` opened "Three policies, not one" for the same reason and has been corrected to two.
| K | hue-only encoding | `accent-text` vs `ink`, vs `ink2`: \|ΔL\*\| ≥ 8 (intents carry a glyph, 13 §2.3, so they pass structurally) | 8 L\* | refuse | `CONTRAST_FLOOR` | 2 |
| L | `forced-colors` survival | `toCSS` text has only `--` declarations under `:root[data-scheme]`; `A11Y_FORCED_COLORS` declares `border: 1px solid CanvasText` for `.panel .grid .rows .table .media` | — | refuse | — (cannot fail on a parsed input; a CI assertion) | 1 |
| M | `line` vs `edge` not confusable | \|L(line) − L(edge)\| in OKLab | 0.06 | warn | — | 1 |
| N | APCA advisory | every ink on `bg`, warning where `CR ≥ 4.5` and \|Lc\| < 60 | 60 Lc | warn | — | 4 |
| O | every value parses and is re-serialised | enforced in `parseTheme`; here asserts every emitted value is `#RRGGBB` | — | refuse | `THEME_VALUE_INVALID` (at parse) | 1 |
| P | banned in any value | `url( image( element( attr( var( \` — checked on the raw string before parsing; here asserts none in the emitted text | — | refuse | `THEME_VALUE_INVALID` (at parse) | 1 |
| Q | a control’s fill × its own label, in every state | `accent` `accent-hover` `accent-press` × `accent-ink` | 4.5:1 | refuse | `CONTRAST_FLOOR` | 3 |

### 6.2 · The four codes

| Code | Raised | `at` | Fixture |
|---|---|---|---|
| `CONTRAST_FLOOR` | A, B, C, D, E, G, K | `theme.<id>.roles.<scheme>.<role moved by the fix>` | `contrast-floor` (30 §6, existing) |
| `INTENT_INSEPARABLE` | F below 10 | `theme.<id>.roles.<scheme>.<first role of the pair in earn·warn·danger·accent-text order>` | `intent-inseparable` — new, §13 D12 |
| `THEME_LADDER_ORDER` | H, I | `theme.<id>.roles.<scheme>.<the later surface>` | `theme-ladder-order` — new |
| `THEME_VALUE_INVALID` | `parseTheme`: shape, grammar, bounds, banned token, achromatic seed, `extends`/`scheme` value | the JSON path, e.g. `theme.midnight.roles.dark.faint`, `theme.midnight.seed.accent` | `theme-value-invalid` — new |

Codes from the corpus reused: `CONTRAST_FLOOR` (04 §5). `COLOUR_OUTSIDE_THEME` is `declare`'s (a colour in a
non-theme declaration) and is never raised here.

### 6.3 · The copy

The CLI/UI line is `<declaration id> — <found>. <wanted>. <fix>` where the declaration id is the first two segments
of `at` (30 §6, one vocabulary, four renderings). `found` and `fix` are built as follows; `wanted` is the check's
sentence from §6.1's pair set.

| Check | `found` | `wanted` | `fix` |
|---|---|---|---|
| A, B, C, D, G | `the pair (<role> on <surface>) is <CR toFixed(2)>:1` | A/B/G `Body text needs 4.5:1` · B accent-ink `A button label needs 4.5:1` · C `Large text needs 3:1` · D edge `A boundary needs 3:1` · D fill `A fill needs 3:1` | `<Lighten|Darken> <role> to at least <fix hex><clause>.` — the fix hex is the failing role re-solved at the floor on the failing surface along its own `(C, h)` (L only — 21 §6 "the fix moves lightness only"), first away from the surface, then toward it; verb by the sign of ΔL. `<clause>` is `, or use it only above 24px` when the role is `faint` and check C passes for that surface. No reachable fix → `Move <role> further from <surface><clause>.` |
| E | `the pair (focus-in on focus-out) is <CR>:1` | `The two ring tones need 9:1 between them, which is 3:1 against anything either touches` | `Set focus-in to the ink and focus-out to the page.` |
| F | `<word a> and <word b> are ΔE <toFixed(1)> apart <view>` — words `good warn bad info`; views `in full colour · to a protanope · to a deuteranope · to a tritanope` | `Four intents need at least 10` | `Move one hue, or lower the chroma of the other.` |
| H | `<later> is not lighter than <earlier>` | `Surfaces must rise in relative luminance: sunk, bg, s1, s2, s3` | `Lighten <later> or darken <earlier>.` |
| K | `accent-text and <ink role> differ by <toFixed(1)> L*` | `A link must differ from body text by at least 8 L*, not by hue alone` | `Move accent-text further from <ink role> in lightness.` |
| parse | `<the value>` or `<the key>` | `#RRGGBB or oklch(L C H)` · `one of the 22 roles` · `compact, comfortable or roomy` · `an integer from 2 to 8` · `chroma of at least 0.02` … | one imperative sentence naming the key |

Two lines, produced exactly by the `midnight` fixture of §9.3:

```
theme.midnight — the pair (faint on s3) is 3.61:1. Body text needs 4.5:1. Lighten faint to at least #8E9C96, or use it only above 24px.
theme.midnight — good and bad are ΔE 6.2 apart to a deuteranope. Four intents need at least 10. Move one hue, or lower the chroma of the other.
```

Warnings (M, N, F's band, the accent-text note, J's corrections) are not refusals: `build` returns them on the
`ok: true` branch for the install diff (04 §3) and the editor's `Tight` label (21 §6). A theme installs with them.

---

## 7 · Performance budget

| Metric | Budget | Measured (prototype, Node 24, this machine) | How measured |
|---|---|---|---|
| `build(body)` — parse, two generates, two checks, refusals | ≤ 50 ms warm, median of 5 | house 7.0 ms · red seed (stage 2) 18.8 ms · worst random seed 13.1 ms per scheme | `perf.test.ts`, `performance.now()` |
| `generate` one scheme | ≤ 25 ms | 3–13 ms; stage 1 evaluates 6·6·6·4 = 864 combinations over ≤ 22 solves and ≤ 180 cached pair distances; stage 2 twice that | same |
| `check` one palette | ≤ 5 ms | < 2 ms | same |
| `nextAccentHue` | ≤ 10 ms per call | 3.9 ms (72 candidates × 2 palettes × 4 views × ≤ 20 colours) | `identity.test.ts` |
| `toCSS` per scheme | ≤ 2,048 bytes | 809 dark · 810 light · 917 with the `prefers-contrast` wrapper | `new TextEncoder().encode(css).length` |
| `TOKENS_CSS` | ≤ 300 bytes | 180 | same |
| `toDTCG` | ≤ 24,576 bytes pretty-printed | 19,948 | same |
| Results per palette | 99, every letter reporting whether it passed or failed (§4.4, §6.1) | house dark 99 · house light 99 · high-contrast 99 each | `checkScheme().length`, counted in `theme.test.ts` |
| Source | ≤ 1,000 lines across five files | — | review |
| Browser cost | inside the editor chunk's 80 KB gzip (22 §9); never in the entry chunk | — | apps/web's `bundle` gate (33 §8) |

---

## 8 · Security

**Trust boundary.** A theme body arrives from a pack — kennel, URL, git, paste or file (04 §3) — and from the editor.
`parseTheme` is the boundary. Everything after it handles typed numbers.

**Accepted value grammar, and nothing else** (a hand parser over whitespace-separated tokens; never a regex
blocklist as the primary defence — 22 §7):

```ebnf
colour     = hex6 | hex3 | oklch ;
hex6       = "#" hexdigit×6 ;   hex3 = "#" hexdigit×3 ;                  (* case-insensitive; hex3 expands digit-doubled *)
oklch      = "oklch(" ws L ws C ws H ws ")" ;
L          = number in [0, 1] | percentage in [0%, 100%] ;
C          = number in [0, 0.5] | percentage in [0%, 100%] ;              (* 100% = 0.4, CSS Color 4 *)
H          = number [ "deg" ] ;                                           (* reduced mod 360 *)
```

Refused by name: alpha (`/`), commas, `none`, `rgb()`, `hsl()`, `oklab()`, `color()`, named colours, `var()`,
anything else. Before parsing, the raw string is refused if it contains `url(`, `image(`, `element(`, `attr(`,
`var(` or `\` (check P) or exceeds 64 bytes. Object shapes are closed: `theme extends scheme seed roles scale`;
`seed: accent neutral_hue`; `roles: dark light`, each a subset of `ROLES`; `scale: space radius density` with
`space: base`, `radius: sm md lg`. An unknown key anywhere → `THEME_VALUE_INVALID` at its path. Numbers are
bounded (§4.1). `theme` matches the register-id grammar (34 §4).

**Re-serialisation.** No input string reaches an output. Every emitted colour is produced from linear RGB by
`hex`; every number is formatted by the emitter. `--x: red; } body{display:none} .z {` cannot exist because the
value never parsed.

**Layers.** `toCSS` emits one `@layer theme` block containing one `:root[data-scheme="…"]` rule containing only
`--`-prefixed declarations. `@layer a11y` is declared later in `@layer tokens, theme, a11y, components;` (22 §7),
so the focus ring, the forced-colours borders and the target floor are unreachable from a theme — structurally,
not by review. The theme never emits `color-scheme`, `forced-color-adjust`, a font, a `url()`, an `@import`, or a
selector.

**What never travels.** The package makes no request, opens no file, reads no clock and logs nothing. A refusal
carries a role name, a number and a hex — never the raw input beyond the offending value.

---

## 9 · Tests and gates

`node --test` over `test/**/*.test.ts`. Every case is input → expected. Tolerances: contrast ratios compared after
`toFixed(2)`; ΔE to 4 decimals; hexes exactly.

### 9.1 · `colour.test.ts`

| Case | Input → expected |
|---|---|
| ΔE2000 reference | all 34 Sharma 2005 pairs → the published ΔE00, \|error\| ≤ 5e-5. Named rows: `(50, 2.6772, −79.7751)/(50, 0, −82.7485)` → 2.0425; `(50, 0, 0)/(50, −1, 2)` → 2.3669; `(50, 2.5, 0)/(73, 25, −18)` → 27.1492; `(60.2574, −34.0099, 36.2677)/(60.4626, −34.1751, 39.4387)` → 1.2644; `(2.0776, 0.0795, −1.1350)/(0.9033, −0.0636, −0.5514)` → 0.9082 |
| APCA | `#888888` on `#FFFFFF` → 63.056; `#FFFFFF` on `#888888` → −68.541; `#000000` on `#AAAAAA` → 58.146; `#AAAAAA` on `#000000` → −56.241 (APCA-W3 readme values), ±0.005 |
| Brettel greys | for v ∈ {0, 0.2, 0.5, 0.8, 1} and each view, `sim((v,v,v))` = `(v,v,v)` within 1e-4 per channel |
| Brettel normals | each `n` sums to 0 within 1e-6 |
| Brettel worked values | protan `#FF0000` → `#6C5C0C`; protan `#00FF00` → `#FFED00`; deutan `#FF0000` → `#A48B00`; deutan `#00FF00` → `#F1D12E`; tritan `#0000FF` → `#006288`; tritan `#FFFF00` → `#FFEEF1` — computed from the §5.4 constants; a mismatch is a copy error |
| OKLab | white → `(1, 0, 0)` within 1e-6; `#FF0000` → `oklch(0.6280, 0.2577, 29.23)` within 5e-4 / 0.01° |
| WCAG | `contrast('#000000', '#FFFFFF')` → 21.00; `contrast('#767676', '#FFFFFF')` → 4.54 |
| Gamut | `toHex([0.7, 0.5, 30])` → `#FF5843`; `[0.9, 0.3, 100]` → `#FFDF00`; `[0.5, 0.3, 145]` → `#007C00`; `[0.62, 0.16, 262]` → `#4E82E5`; `[1, 0.2, 30]` → `#FFFFFF`; `[0, 0.2, 30]` → `#000000` |

### 9.2 · `generate.test.ts`

| Case | Input → expected |
|---|---|
| Golden palettes | `generate(HOUSE, scheme)` and `generate(HOUSE, scheme, HIGH_CONTRAST)` equal `test/golden/*.json` byte for byte; the four are the table below |
| The solve | house dark `faint` on `s3` = 4.50 and the same hue one 8-bit step darker on every channel < 4.50; house light `edge` on `sunk` = 3.01 |
| Targets chosen | house dark `{ danger 4.5, warn 7.5, earn 12, accentText 4.5, intentChroma 0.14 }`; light `{ 4.5, 12, 7.5, 4.5, 0.14 }` |
| Ladder | house dark surfaces L (OKLab, quantised) ascend; relative luminance `0.0024 < 0.0040 < 0.0065 < 0.0102 < 0.0144`; light `0.7359 < 0.7892 < 0.8453 < 0.9091 < 0.9698` |
| Contrast on the worst surface | dark on `s3`: ink 12.04 · ink2 8.00 · dim 6.05 · faint 4.50 · accent-text 4.50 · edge 3.00 · earn 12.02 · warn 7.54 · danger 4.52 · fills 3.00–3.02; light on `sunk`: 12.07 · 8.02 · 6.05 · 4.52 · 4.50 · 3.01 · 7.52 · 12.02 · 4.52 · 3.02–3.03 |
| Achromatic seed | `#808080` → `ThemeError` `THEME_VALUE_INVALID` at `theme.x.seed.accent`, fix begins `that colour is almost grey` |
| Property (fast-check 4.9.0, 200 runs, seeds committed under `test/seeds/`) | seed `L ∈ [0.2, 0.9], C ∈ [0.02, 0.25], h ∈ [0, 360)`, in gamut, both schemes: no `refuse` from any check but F; every role matches `/^#[0-9A-F]{6}$/`; `generate` twice gives equal JSON; if F refuses, `toRefusals` names a pair of the four intent words and a view |
| Determinism across hosts | the golden files are compared unchanged on Windows, Linux and workerd CI |

Golden palettes (22 roles × two themes × two schemes):

| Role | house light | house dark | high-contrast light | high-contrast dark |
|---|---|---|---|---|
| sunk | `#DCDFE4` | `#06080B` | `#E2E2E2` | `#010101` |
| bg | `#E3E6EB` | `#0B0D11` | `#E9E9E9` | `#030303` |
| s1 | `#EAEDF3` | `#111317` | `#F0F0F0` | `#080808` |
| s2 | `#F1F5FA` | `#181A1D` | `#F8F8F8` | `#0F0F0F` |
| s3 | `#F9FCFF` | `#1E2024` | `#FFFFFF` | `#171717` |
| ink | `#1C212B` | `#D6DEEA` | `#0D0D0D` | `#EBEBEB` |
| ink2 | `#393E49` | `#AFB6C3` | `#202020` | `#D8D8D8` |
| dim | `#4B505B` | `#979EAA` | `#2D2D2D` | `#C7C7C7` |
| faint | `#5D636F` | `#808792` | `#343434` | `#BDBDBD` |
| line | `#9097A3` | `#4E545E` | `#7B7B7B` | `#696969` |
| edge | `#797F8B` | `#646A76` | `#646464` | `#808080` |
| earn | `#004E00` | `#9BF19E` | `#005000` | `#91E794` |
| earn-fill | `#3B8F42` | `#217A2C` | `#1B7427` | `#3C9143` |
| warn | `#351B00` | `#E5A43A` | `#391D00` | `#DD9B2F` |
| warn-fill | `#B07100` | `#965D00` | `#8F5900` | `#B17200` |
| danger | `#A94039` | `#D3665C` | `#AC423B` | `#CB5E55` |
| danger-fill | `#CA5D54` | `#B14840` | `#AC423B` | `#CB5E55` |
| accent | `#4E82E5` | `#4E82E5` | `#4E82E5` | `#4E82E5` |
| accent-text | `#2D5FBE` | `#5084E7` | `#2F61C1` | `#497DDF` |
| accent-ink | `#000000` | `#000000` | `#0D0D0D` | `#000000` |
| focus-in | `#1C212B` | `#D6DEEA` | `#0D0D0D` | `#EBEBEB` |
| focus-out | `#E3E6EB` | `#0B0D11` | `#E9E9E9` | `#030303` |

### 9.3 · `check.test.ts`

| Case | Input → expected |
|---|---|
| House passes | both schemes: 0 `refuse`, 0 `corrected`, 0 M warnings; F bands light `10.7 · 11.0 · 14.2 · 17.4 · 43.8 · 39.7` (good/warn, good/bad, good/info, warn/bad, warn/info, bad/info), dark `14.5 · 20.7 · 24.4 · 14.0 · 52.3 · 40.0`, ±0.1; N advisories: dark `dim faint accent-text warn danger` × 5 surfaces (25), light none |
| High-contrast passes | both schemes: 0 refuse, 0 corrected, 0 M; F min light 10.1, dark 14.3; N advisories dark `accent-text warn danger` × 5 (15) |
| Result shape | 99 results per palette, N's 4 advisory rows among them; every letter A to Q present in `validate`'s output |
| **midnight** — the 28 §4.5 failing theme | body `{ theme: "midnight", seed: { accent: "oklch(0.62 0.16 262)" }, roles: { dark: { s3: "#2B3239", faint: "#7D8A85" }, light: { earn: "#506020" } } }` → `ok: false`, exactly two refusals, in order: `CONTRAST_FLOOR` at `theme.midnight.roles.dark.faint`, rendered `theme.midnight — the pair (faint on s3) is 3.61:1. Body text needs 4.5:1. Lighten faint to at least #8E9C96, or use it only above 24px.`; `INTENT_INSEPARABLE` at `theme.midnight.roles.light.earn`, rendered `theme.midnight — good and bad are ΔE 6.2 apart to a deuteranope. Four intents need at least 10. Move one hue, or lower the chroma of the other.` Byte-equal |
| Gamut correction | `roles.dark.accent: "oklch(0.7 0.5 30)"` → `ok: true`, `corrections = [{ role: 'accent', from: 'oklch(0.7 0.5 30)', to: '#FF5843' }]`, one J result `corrected` |
| Ladder order | `roles.dark.s2: "#0B0D11"` → `THEME_LADDER_ORDER` at `roles.dark.s2`, found `s2 is not lighter than s1` |
| Focus override | `roles.dark: { "focus-in": "#0B0D11" }` → `CONTRAST_FLOOR` on `focus-in on focus-out` |
| Parse refusals — each → `THEME_VALUE_INVALID` at the path | `roles.dark.faint: "red"` · `roles.dark.bg: "url(https://x)"` · `roles.dark.ink: "#FFF; } body { display: none } .z {"` · `seed.accent: "oklch(0.6 0.1 200 / 0.5)"` · `roles.dark.line2: "#000"` · `scheme: "light"` · `extends: "midnight"` · `scale.density: "cosy"` · `scale.radius: { sm: 8, md: 6, lg: 10 }` · `scale.space.base: 12` · `theme: "Midnight"` |
| Hex3 | `roles.dark.faint: "#fff"` parses to `#FFFFFF` |

### 9.4 · `emit.test.ts` · `identity.test.ts` · `perf.test.ts`

| Case | Input → expected |
|---|---|
| CSS golden | `toCSS(house.dark)` equals `test/golden/house.css` byte for byte; LF only; every line inside the rule starts with `    --` |
| CSS stable | `toCSS(generate(HOUSE,'dark'))` called twice → identical strings |
| CSS size | ≤ 2,048 bytes for every golden palette; with `'(prefers-contrast: more)'` the text contains `  @media (prefers-contrast: more) {` |
| Nothing but tokens | `toCSS` output contains no `color-scheme`, no `forced-color-adjust`, no `url(`, no `;` outside a `--` declaration, exactly one `{` after `@layer theme` and one after `:root[` |
| TOKENS_CSS | contains the eight steps `--t-xs: 12px` … `--t-3xl: 34px`, nothing else |
| Check L | `A11Y_FORCED_COLORS` contains `.panel, .grid, .rows, .table, .media { border: 1px solid CanvasText; }` |
| DTCG golden | `toDTCG(house)` stringified equals `test/golden/house.tokens.json`; ≤ 24,576 bytes; contains no `$ref` under `modifiers`; every `hex` re-parses to its `components` |
| Mark floors | for `h ∈ [0, 360)`, both schemes, both profiles: `contrast(identityAccent(h).hex, surface) ≥ 3` (4.5 for high-contrast) on every surface; `oklch(mark.L, mark.C, h)` is in gamut before mapping (chroma at that L exceeds `mark.C` for every hue) |
| Sequence | house, twelve calls → `320 190 5 265 125 335 300 350 105 170 330 115`; `accentDistance(320, 190) ≥ 5.0`; no returned hue within 20° of 27, 75, 145 |
| Mark colour | `identityAccent(320, house.dark)` → `{ css: 'oklch(0.72 0.12 320)', hex: '#C68BD3' }`; light → `#896092` |
| Budget | `build(HOUSE)` median of 5 ≤ 50 ms; `nextAccentHue` ≤ 10 ms |

### 9.5 · CI rows this package owns (33 §8, 18 §6)

| Gate | Asserts |
|---|---|
| `contrast` (Playwright, apps/web) | uses `contrast()` from this package over `pairs.json` — one implementation of the ratio in the repo |
| `closed-lists` (script) | `ROLES` has 22, `CHECKS` 16, `DENSITY` 3, `TYPE_SCALE` 8 — against 34 §6 |
| `refusal-fixtures` (script) | `fixtures/refusals/{contrast-floor,intent-inseparable,theme-ladder-order,theme-value-invalid}.yaml` each produce their code through `build` |
| high-contrast row (18 §6) | `build(HOUSE, HIGH_CONTRAST)`: zero refusals, zero corrections, zero M warnings — *"if it fails, the validator is wrong"* |

---

## 10 · Deliberate ceilings

- `ponytail:` no DTCG importer — a theme arrives as a pack body; add `fromDTCG` when a second tool produces themes anyone installs (28 §1 expects exactly one other reader in 2026).
- `ponytail:` `extends` accepts only `house`; a theme extending an installed theme is a cross-declaration dependency — add when a pack needs it, with `DEPENDENCY_UNRESOLVED` semantics.
- `ponytail:` `scheme` accepts only `both`; a single-scheme theme would leave the other scheme with no palette — add a fallback-to-house rule if a real theme wants it.
- `ponytail:` the separability search is a fixed grid (6 targets × 3 intents × 4 accent × ≤ 2 chroma), not an optimiser; it maximises the minimum simulated ΔE and stops. If a real theme fails F where a designer can hand-place a pass, add finer steps before adding an optimiser.
- `ponytail:` intent hues are fixed at 27/75/145; the refusal copy says *"move one hue"* but the generator never rotates an intent — add ±15° rotation to the grid if measured hue-collisions with brand accents are frequent (measured: 13 % of random seeds, all light, all near an intent hue).
- `ponytail:` elevation is generated, not authored (three alphas per scheme, fixed geometry); add an `elevation:` key of exactly three alphas per scheme when a theme needs it (28 §1's "ordered ladder of exactly N levels", N = 3).
- `ponytail:` full dichromacy only (Brettel at severity 1.0); anomalous trichromacy (Machado 2009) is deliberately absent — 28 §4.2.
- `ponytail:` APCA constants pinned to APCA-W3 0.1.9 (G-4g); it is advisory and never gates, so a constant change is a fixture change.
- `ponytail:` CIELAB via the 7-digit sRGB→XYZ matrix and D65 = its row sums, not CSS Color 4's higher-precision chain; the difference is below 1e-3 ΔE, far under the 10/20 floors.
- `ponytail:` identity distinctness is best-effort — four marks separable under simulation, then the name carries it (13 §2.1b already requires the name). A register that needs more distinct marks gets a validated palette per register (ADR-028's "would reverse it"), not a smarter sequence.
- `ponytail:` `nextAccentHue` scans 72 candidates and recomputes every distance per call (~4 ms); cache per palette if a bulk import of thousands of rows measures it.
- `ponytail:` the fix hex moves L only along the role's own chroma and hue; the editor's other two sliders (chroma, hue) are the person's, never the generator's (21 §6).
- `ponytail:` the Resolver's inner keys (`sources`, `default`) are pinned by the golden file, not by a schema (28 §1: the DTCG schema is buggy and there is no conformance suite); if a re-read of the Resolver 2025.10 Final Report disagrees, the emitter changes and the golden regenerates — no BrainDog consumer reads them.
- `ponytail:` `Refusal` is declared here structurally identical to 33 §2's; `record` narrows `ThemeCode` into `RefusalCode`. One type, two files, checked by `tsc` where they meet.

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | — | — | none; the package is arithmetic and string building |
| dev | `typescript` | 6.0.3 | type-check only (31 §3) |
| dev | `fast-check` | 4.9.0 | the §9.2 property test; zero built-ins, runs in workerd (31 §3) |
| dev | `@types/node` | matching 24.13 | `node:test`, `node:assert/strict`, `performance` |

`erasableSyntaxOnly`: closed lists are `as const` arrays with derived unions; no `enum`, no `namespace`, no
parameter properties. Every local import carries `.ts`. Licence `Apache-2.0` (31 §4).

---

## 12 · Build order

**Before this:** nothing — position 4, in-degree 0. `render`, `ports` and `where` are unrelated siblings.

**This unblocks:** `record` (10) — `build` on `installPack`/`setDeclaration` of a `theme` kind, `nextAccentHue` at
create for a register with `identity:`; `apps/web` (13) — the theme editor (live `build`, `toCSS`), the SSR head
(`toCSS`, `TOKENS_CSS`, `A11Y_FORCED_COLORS`), gate 4's `contrast`; `apps/worker` (14) and `apps/selfhost` (15) —
the SSR head. `declare` (7) does **not** import this package (31 §2: `declare ⇎ theme`); it validates the shape of
a `theme` declaration and hands the JSON to `record`, which calls `build`.

**Amendment this needs before `apps/web` is specified:** 31 §2 row 13, `web` depends on `1, 3, 4, 7` (§13 D16).

---

## 13 · Decisions taken here

| # | Decision | Amend |
|---|---|---|
| D1 | **JSON in, not YAML.** `parseTheme` takes the dialect's JSON form; `declare` owns YAML → JSON for all eight kinds (31 §2). The YAML of 28 §1 is the authoring form; the wire to this package is its JSON | 28 §1: note the two forms; 35 §4 row 39 wording "the YAML dialect" → "the dialect's JSON form" |
| D2 | **The light ladder anchors at the top.** `s3` = L 0.99 and the ladder descends 0.022 to `bg` 0.924 and `sunk` 0.902. 28 §3 step 1's `bg = 0.99` in light leaves no room for three lighter surfaces, and 13 §2.2 measured the predecessor's light `s3` as the lightest surface and `sunk` the darkest, which is also why 28 step 2 names `sunk` the worst light ground. Dark keeps `bg` 0.16 ascending 0.028 | 28 §3 step 1 |
| D3 | **The solve is a 24-step bisection on OKLab L over the quantised, gamut-mapped colour**, returning the boundary hex that meets the target (§5.6). "bisect" in 28 §3 gets its definition | 28 §3 step 2 |
| D4 | **Separability is searched, not repaired.** Step 5 is a two-stage grid over contrast targets (and chroma 0.14 → 0.08) for the three intents and `accent-text`, maximising the minimum simulated ΔE. Replaces 28's "solve for 4.5, then run the separability solve" and "retry once with relaxed chroma" | 28 §3 steps 5, 7 |
| D5 | **`accent-text` may sit above 4.5** (grid 4.5–9, filtered by K) and **`accent-ink` is the first of `ink`, white, black clearing 4.5** (28 said "white or ink" — neither clears a mid-lightness accent in dark; black or white always does) | 28 §3 step 4 |
| D6 | **F's 10–20 band is a pass, recorded as `band: 'glyph'`**, because the glyph is structural (13 §2.3, 28 §6) and the shipped house theme itself lands at 10.7–14.5 on four of six light pairs — a warning on every theme is noise. `< 10` refuses. **N is advisory and is not counted against the high-contrast theme's "passes all sixteen"**; that gate is zero refusals, zero corrections, zero M | 28 §4.4 F row, §4.5 judgement row; 18 §6 high-contrast row wording |
| D7 | **Four checks made computable on a palette:** C = `faint` at the 3:1 large-text floor (decides the "or use it only above 24px" clause; the usage lint is apps/web's Stylelint); D includes the three `-fill` roles (1.4.11); E = 9:1 between the two ring tones (§5.2 composition) plus `focus-in` ≥ 3 on every surface; K = `accent-text` vs `ink`/`ink2` ≥ 8 L\* (intents pass K by glyph) | 28 §4.4 rows C, D, E, K; 13 §2.4 |
| D8 | **L is a text assertion** over `toCSS` output (only `--` declarations) and the exported `A11Y_FORCED_COLORS` (a border per load-bearing primitive); the rendered assertion under `forcedColors: 'active'` is apps/web's Playwright gate | 28 §4.4 row L; 50-SPEC-WEB to carry the rendered gate |
| D9 | **Elevation is generated:** three levels, fixed geometry, alphas per scheme from the profile; check I guards the constants. No `shadow`/`elevation` key in the dialect | 28 §1 shadow row ("a theme sets" → "the generator emits"); 05 §6 note |
| D10 | **High-contrast = the house seed through `HIGH_CONTRAST`** (§4.2 numbers, §5.9); no dialect key; swapped in by `prefers-contrast: more` via `toCSS(hc, media)` | 28: add §3.1; 05 §5 |
| D11 | **Identity constants and sequence:** marks at `(0.72, 0.12)` dark / `(0.55, 0.09)` light (`(0.78, 0.11)` / `(0.48, 0.08)` high-contrast); `nextAccentHue` is a deterministic farthest-point pick over 72 hues excluding ±20° of the intents; "pairwise distinct … or regenerated" becomes "the farthest available hue, measured": four marks at ΔE ≥ 4, then the name carries identity | 13 §2.1b; ADR-028; 32 §4.4 |
| D12 | **Three new refusal codes:** `THEME_VALUE_INVALID`, `INTENT_INSEPARABLE`, `THEME_LADDER_ORDER`; fixtures `theme-value-invalid`, `intent-inseparable`, `theme-ladder-order`. 30 §6 counts 78 — 36 pack and declaration | 30 §6; 04 §5 |
| D13 | **Sources pinned:** OKLab matrices — Ottosson 2020; Brettel constants — libDaltonLens (public domain), which 28 §4.2's normals already come from; ΔE2000 — Sharma 2005 with its 34-pair data; APCA — APCA-W3 0.1.9; gamut mapping — CSS Color 4 §14.2.1 | 28 §4.2 (name the file) |
| D14 | **Who emits what:** the theme emits one `@layer theme` block per scheme under `:root[data-scheme]`; the fixed type scale is `TOKENS_CSS` in `@layer tokens`; motion tokens, `color-scheme` on `[data-scheme]`, `--ctl-h --tap --measure` and `pairs.json` are apps/web's | 22 §7 (a paragraph naming the split) |
| D15 | **The record stores the dialect body; DTCG and CSS are derived.** 28 §1's "stores and shares DTCG" becomes "shares as DTCG, derived byte-stably from the stored body"; the Resolver document is one file with both schemes inline | 28 §1 table row 2 |
| D16 | **`apps/web` imports `@braindog/theme`** for the editor (inside the editor chunk, so the entry-chunk budget is untouched) and the SSR head | 31 §2 row 13: `web` → `1, 3, 4, 7` |
| D17 | **The two shipped themes are constants, not declarations.** `HOUSE` and `build(HOUSE, HIGH_CONTRAST)` ship in the package; a `theme` declaration row exists only for an installed third-party theme. 04 §6's "no declarations in the kernel" test is unaffected | 05 §5 |
| D18 | **Dialect closure:** `extends: house` only (inherits seed and scale defaults); `scheme: both` only; `neutral_hue: from-accent | <degrees>`; `space.base` 2–8; radii 0–999 with `sm ≤ md ≤ lg`; `theme` in the register-id grammar; accepted colour forms are `#RRGGBB`, `#RGB`, `oklch(L C H)` without alpha | 28 §1 |

Eighteen, counted.

---

## 14 · Done when

- [ ] `pnpm -F @braindog/theme test` passes every case in §9.1–§9.4; the seeds directory is committed.
- [ ] The four golden palettes, `house.css` and `house.tokens.json` are committed and byte-equal on Windows, Linux and workerd CI.
- [ ] The `midnight` fixture produces the two §6.3 lines byte for byte, in that order.
- [ ] `build(HOUSE, HIGH_CONTRAST)` has zero refusals, zero corrections, zero M warnings in both schemes.
- [ ] `fixtures/refusals/{contrast-floor,intent-inseparable,theme-ladder-order,theme-value-invalid}.yaml` exist and the `refusal-fixtures` gate is green.
- [ ] `closed-lists` reads `ROLES` (22), `CHECKS` (16), `DENSITY` (3), `TYPE_SCALE` (8) and matches 34 §6.
- [ ] `perf.test.ts` holds `build` under 50 ms.
- [ ] `package.json` has zero runtime dependencies and the `exports` map of §2; `tsc --noEmit` is clean under `erasableSyntaxOnly`.
- [ ] The eighteen amendments of §13 are applied to 04, 05, 13, 16, 18, 22, 28, 30, 31, 32, 35 in the same revision.


---

*Next: [40-SPEC-FIXTURES](40-SPEC-FIXTURES.md).*
