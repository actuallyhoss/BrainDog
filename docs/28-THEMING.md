# 28 · Theming, dynamically

[05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §5 says a theme is *"a token document and nothing
else"* and that contrast is gated at install. This document is how — the wire format, the
generator that turns one colour into a whole coherent theme, and the validator that decides whether
it ships.

Everything below was measured or retrieved on **2026-09-01**. Live browser measurements are
**Chrome 152, Windows 11**; support data is from the webstatus.dev API.

---

## 1 · Two formats, and they are not the same artefact

| Layer | Format | Why |
|---|---|---|
| What a person or an agent **writes** | a small BrainDog YAML dialect — roles, one seed, three scales | the interchange format has no concept of a *role*, an *intent*, or a *contrast floor*. It is a container, not a design system |
| What BrainDog **stores and shares** | **DTCG 2025.10** + a **Resolver 2025.10** document | a theme is the cheapest thing anybody will ever share. A shareable artefact only one product can read is not shareable |
| What the browser **gets** | generated CSS custom properties in `@layer theme` | already decided in [22-FRONTEND](22-FRONTEND.md) §7 |

> **Never write "W3C design tokens."** As of 2025-10-28 the Design Tokens Community Group has three
> **Final Reports** — Format, Color and Resolver, all 2025.10, all self-labelled Candidate
> Recommendation and all carrying the same status line: *"It is not a W3C Standard nor is it on the
> W3C Standards Track."* A widely-shared August 2026 post claims otherwise; it is wrong, and the
> spec disclaims it in its own status section. **Write "DTCG 2025.10."**

### Why not author in DTCG directly

Because it is a wire format and it reads like one. Colour became an object (`colorSpace`,
`components`, `alpha`, `hex`), and so did `dimension` and `duration`. **A single black 50%-opacity
shadow is about fourteen lines of JSON.** The spec's own open issue #149 — *"Clarify if manually
typing and reading token files is a primary concern"* — is unresolved. Nobody should hand-write it,
and an agent writing it wastes tokens on punctuation.

```yaml
theme: midnight
extends: house            # unspecified roles inherit from this base
scheme: both

seed:
  accent: "oklch(0.62 0.16 262)"
  neutral_hue: from-accent

roles:                    # all optional; the generator fills the rest
  dark:  { bg: "oklch(0.17 0.008 262)", ink: "oklch(0.96 0.004 262)" }

scale:
  space:   { base: 4 }
  radius:  { sm: 3, md: 6, lg: 10 }
  density: comfortable    # compact | comfortable | roomy → row height 28 / 32 / 36 px;
                          # the UI labels them Compact / Comfortable / Roomy
```

Three keys an earlier draft had are gone. **No `version:`** — a theme travels as a declaration inside
a pack; the pack's `version:` is its semver and the kernel's `declaration.version` integer is its
supersession count, and the theme document carries neither. **No `type:`** — the type scale is a
fixed eight steps (`t-xs` 12 · `t-sm` 13 · `t-base` 15 · `t-md` 17 · `t-lg` 20 · `t-xl` 24 · `t-2xl`
28 · `t-3xl` 34) and the reader's Text setting picks the body step among `t-sm` / `t-base` / `t-md`;
a theme never sets type ([13-UI](13-UI.md) §7). **No `intent:` remap** — `warn: warn-quiet` named a
role no list defines; instead every intent role (`earn` `warn` `danger`) gets a `-fill` variant from
the generator (§3 step 5). Two themes ship, each in both schemes: **house** and **high-contrast**.

### Why conform at the wire anyway

Theming in DTCG is a separate **Resolver** document — `sets`, `modifiers` with a `contexts` map,
and a required `resolutionOrder`. Its own rationale names BrainDog's three axes exactly: *"Theming,
such as light mode, dark mode, and high contrast color modes … Sizing … Accessibility mode …
susceptible to combinatorial explosion."*

**That is the mode system, already specified, and not inventing one is worth a lot.** The caveat is
that the ecosystem does not treat it as settled — issue #210, *"Native modes and theming support"*,
is still open and was last touched **after** the Resolver shipped, and issue #2, *"[RFC] Theming"*,
has been open since 2019. Terrazzo is the only implementation of the Resolver anywhere.

> **So: store the Resolver document; depend on nobody else reading it.** Export it for interop, and
> expect that in 2026 exactly one other tool round-trips it. That still beats inventing a mode
> system, because when the ecosystem lands, BrainDog is already there.

### Three parts of DTCG refused, each with the spec's own evidence

| Refused | Argument |
|---|---|
| **`$ref` / JSON Pointer aliasing** | a second, more powerful resolution engine to write, secure and cycle-detect, inside a system whose security argument ([04-PACKS](04-PACKS.md) §7) is *enumeration over a small surface*. **And the published stable spec cannot decide whether it is mandatory** — it says MAY in one place and MUST in two others. Issue #383, fix PR #442 **opened 2026-08-30 and still open.** Resolve on import, emit only `{curly.brace}`, and say in the docs that conformance here is undefined by the spec itself |
| **`gradient`, `transition`, `strokeStyle`, `border`** | no BrainDog primitive consumes them — depth is a luminance ladder, not a gradient, and motion is a 300 ms budget, not a themeable curve. **And the stable spec ships an open *"is the current specification for X fit for purpose?"* issue against every one of them** (#98–#103) |
| **Free-form `shadow`** | [05-BLOCKS](05-BLOCKS-AND-THEMES.md) §6 already guards *"the elevation ladder only goes up, in both themes."* A theme sets an **ordered ladder of exactly N levels**, validated monotonic in both schemes — not an arbitrary list |

> **And do not delegate validation to the DTCG JSON Schema.** It is buggy — #439 (group `$type`
> inheritance is not validated) and #428 (a broken internal reference) — and **there is no
> conformance test suite at all** (#413, open since 2026-06-03). BrainDog was writing its own
> validator regardless. This is the evidence that it has to.

---

## 2 · Runtime mechanics: five decisions, four of them measured

| Feature | Baseline | Verdict |
|---|---|---|
| Custom properties · `@layer` · `color-scheme` · `prefers-contrast` · `forced-colors` | **Widely** | use freely; `@layer` is load-bearing |
| `adoptedStyleSheets` + `replaceSync` | **Widely, since 2025-09-27** | the delivery mechanism |
| `oklch()` · `color-mix()` | **Widely, since 2025-11-09** | derivation space; state layers |
| `@property` | Newly, 2024-07-09 | one narrow use |
| `light-dark()` | Newly, 2024-05-13 | **refused** |
| Relative colour `oklch(from …)` | Newly, 2024-09-16 | **refused at runtime** |
| `@scope` | Newly, **2026-03-24** (Safari 26.4) | **refused** |
| `prefers-reduced-transparency` | **Limited — Safari has never shipped it** | [13-UI](13-UI.md) §7 carries the caveat: honoured where the query exists |

### 2.1 · Derive at install. Emit literals. Never derive in CSS.

Relative colour syntax is the obvious way to write a ramp. Refuse it, and **not** primarily for
support. Measured in Chrome 152:

```
oklch(0.70 C 30) painted to sRGB        getComputedStyle / canvas fillStyle
  C 0.20 → rgb(255, 97, 77)               "oklch(0.7 0.5 30)"   ← verbatim,
  C 0.30 → rgb(255,  0,  0)  ┐               unresolved, at every C
  C 0.40 → rgb(255,  0,  0)  ├ three authored colours,
  C 0.50 → rgb(255,  0,  0)  ┘ one painted colour
```

Pure red is OKLCH L ≈ 0.628, not 0.70 — **lightness is not preserved, so this is clipping, not
gamut mapping.** And the CSSOM hands back the authored string, so **it cannot be detected from
JavaScript.**

> **This broke an existing gate, since fixed.** [22-FRONTEND](22-FRONTEND.md) §7 gate 3 originally
> walked every element and asserted only that its *computed* colour resolves to a value in the token
> set. That is sound for token identity and **completely blind to gamut** — it would have certified
> `oklch(0.7 0.5 30)` while the user looks at pure red. Gate 3 now carries a second assertion: every
> computed colour is already in sRGB, or it is sampled through a 1×1 canvas rather than read from the
> CSSOM.

The generator does CSS Color 4 gamut mapping in JS and emits in-gamut sRGB. This is free —
§7 already says *"one generator, two sinks."*

### 2.2 · No `light-dark()`

Measured: with no `color-scheme` set, `light-dark(rgb(1,2,3), rgb(250,251,252))` computes to
`rgb(1, 2, 3)` — the light value, silently. It does work on a subtree once `color-scheme` is set.

Refused for three reasons, in weight order: it puts two values behind one function, so **the
validator would have to parse CSS to check a pair** — and the validator must read tokens, not CSS;
it depends hard on `color-scheme`, with a silent wrong answer when that is missing; and it is
Baseline-newly. Emit two blocks.

### 2.3 · `@property` buys less than it looks like

Measured: `@property` works inside a constructed stylesheet; `adoptedStyleSheets.push()` mutates in
place; re-registering a property throws `InvalidModificationError`. All useful. But:

> **Measured: with `inherits: true`, an invalid-at-computed-value-time custom property falls back
> to the *inherited* value, not `initial-value`.** Parent `--probe: blue`, child `--probe:
> not-a-color`, registered `initial-value: green` → the child computes **blue**.

Colour tokens inherit. So `@property` does **not** rescue `var(--fain)` — the typo case
[22-FRONTEND](22-FRONTEND.md) §7 gate 1 exists for. **That lint gate stays load-bearing.** Use
`@property` for exactly one thing: `syntax: "<color>"` on the semantic colour tokens, as a runtime
type assertion so a malformed installed token fails loudly. About thirty lines.

### 2.4 · `color-mix()` for state layers only

Measured: `color-mix(in srgb, red, transparent)` → `color(srgb 1 0 0 / 0.5)` — premultiplied, no
muddy grey. Not for deriving the ramp, which happens at install. For **hover, press and selection**,
where the mix is against a surface the theme cannot know at authoring time.

### 2.5 · `forced-colors` deletes the surface ladder, and nothing accounted for it

Under `forced-colors: active` the UA overrides every colour property, **`box-shadow` and
`text-shadow` compute to `none`**, and `background-image` computes to `none` without a `url()`.

[13-UI](13-UI.md) §2.1 says *"depth comes from the surface ladder."* In forced colours, `sunk`,
`bg`, `s1`, `s2` and `s3` all become `Canvas`. **A five-level ladder becomes one level and every
block boundary in the product disappears** — and the elevation ladder cannot rescue it, because the
shadows are gone too.

```css
@layer a11y {
  @media (forced-colors: active) {
    .panel, .grid, .rows, .table, .media { border: 1px solid CanvasText; }
    [data-intent] { forced-color-adjust: none; }   /* the glyph is what survives */
    :focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
  }
}
```

**And `prefers-contrast` is not the same state.** On Windows, Contrast Themes report
`prefers-contrast` from the actual ratio — `more` above 7:1, **`custom` between 4.5 and 7:1**, `less`
below. macOS "Increase Contrast" gives `more` **without** `forced-colors: active`. So:
`prefers-contrast: more` swaps to the high-contrast theme; `forced-colors: active` surrenders the
palette entirely.

---

## 3 · One colour in, a coherent theme out

### The three families

| Family | Mechanism | Guarantee |
|---|---|---|
| **Tone-driven** — Material 3 / HCT | CAM16 hue and chroma bolted to CIELAB **L\***, so lightness is linear. Fixed tone stops read off a tonal palette | Δtone 40 ⇒ ≥3:1, Δtone 50 ⇒ ≥4.5:1 — works *because* L\* is linear and contrast is not |
| **Curve-fitting** — Radix, 12 steps | a seed is mapped onto the *shape* of a hand-tuned scale | steps 11 and 12 guaranteed to Lc 60 and Lc 90 **APCA** on step 2 |
| **Contrast-driven** — Leonardo | you name target **contrast ratios**; it solves for the colour that hits them | contrast is an *input*, so it cannot fail |

Tailwind v4 moved to OKLCH but is hand-tuned, with **no published generation algorithm**.

### Radix's step list is the best-argued role map in the industry

Its step 6 is *"subtle borders on **non-interactive** components"* and step 7 is *"border and focus
rings on **interactive** components."* **That is exactly [13-UI](13-UI.md) §2.2's own discovery that
`line` and `edge` must be different roles**, reached independently and for the same reason: a
decorative hairline and a load-bearing boundary have different floors. Worth knowing the precedent
agrees. Worth also knowing that Radix never explains why *twelve* — treat the number as convention.

### The choice: contrast-driven, and the reason is specific to this product

BrainDog already has a **refusal gate**. Generate by lightness and then validate by contrast, and
you have built a loop that can fail — with a failure mode of *"the user picked a colour and the app
said no,"* repeatedly, with no path forward.

> **Generate *by* contrast and the checks the generator drives become tautologies.** Only the checks
> it cannot drive — intent separability, ladder monotonicity — can fail. A much smaller, much more
> explainable failure surface.

### The algorithm

```
INPUT: accent_seed, scheme ∈ {light, dark}          OUTPUT: every role, in-gamut sRGB, with a proof

0 NORMALISE   c = to_oklch(seed)
              if c.C < 0.02: refuse — "that colour is almost grey, so there is no hue to build
              from." Below C 0.02 the hue angle is numerically unstable: two identical greys can
              be 180° apart, and every derived rotation lands somewhere random.

1 GROUND      bg = oklch(scheme==light ? 0.99 : 0.16, min(c.C, 0.008), c.H)   # a whisper of hue
              sunk,s1,s2,s3 = ladder(bg), ΔL ≈ 0.022 light / 0.028 dark
              assert monotonic RELATIVE LUMINANCE, not L*                          → check H

2 INK RAMP    C_ink = min(c.C * 0.12, 0.02)         # tinted ink, never coloured ink
              worst = (scheme==light) ? sunk : s3   # the worst ground this role ever sits on
              for (role,target) in [ink 12, ink2 8, dim 6, faint 4.5]:
                  L = bisect(L -> wcag(oklch(L,C_ink,c.H), worst), target)

3 BOUNDARIES  edge = solve for exactly 3.0 against the worst surface               → 1.4.11
              line = decorative, no floor, but assert ΔL ≥ 0.06 from edge
              focus_in = ink, focus_out = bg                                       → check E
              (two boundary roles, not four — there is no line2 and no line3)

4 ACCENT      accent      = seed, chroma-clamped into gamut            # the fill role
              accent_text = solve L for ≥ 4.5 on the worst surface     # emitted as accent-text
              accent_ink  = white or ink, whichever clears 4.5 on accent    # accent-ink
              if |L(text) − L(fill)| > 0.10: warn. The link will not look like the button —
              that is the honest cost of splitting the role, and 13-UI §2.2 already pays it.

5 INTENTS     roles earn / warn / danger; hue anchors earn 145°, warn 75°, danger 27°.
              The fourth author word, info, resolves to accent and adds no role.
              solve each for ≥ 4.5 on the worst surface as text, THEN run §4's separability
              solve, which may move L and C. Each intent also gets a -fill variant
              (earn-fill, warn-fill, danger-fill) solved for ≥ 3.0 on the worst surface,
              for chips and bars.
              YELLOW: warn at 75° cannot reach 4.5:1 on a light ground at useful chroma.
              Drop chroma, darken to ~L 0.55. It will read olive. Do not fight it.

6 GAMUT MAP   CSS Color 4 §14.2.1 — binary-search chroma down, ΔE_OK ≤ 0.02.
              Never let the browser clip. See §2.1, measured.

7 VALIDATE    §4. On failure retry once with relaxed chroma, then refuse, naming the pair
              and the number.
```

### The failure cases, and what each really is

| Failure | What happens | Handling |
|---|---|---|
| **Yellow** | maximum chroma sits at high lightness, so yellow text cannot reach 4.5:1 on white at any useful chroma. **Measured:** `oklch(0.90 0.20 100)` → `rgb(254,223,0)`; `oklch(0.90 0.30 100)` → `rgb(255,219,0)`. **Fifty per cent more chroma buys four units of green** — it has saturated and stopped moving | accept the olive; refuse a yellow-family `accent` **as text**, and say why |
| **Near-neutral seed** | hue is noise below C 0.02 | refuse at step 0 with a specific message. Never a silent fallback |
| **Gamut** | browsers clip, lightness is not preserved, and it is invisible to the CSSOM | map in the generator; gate 3 asserts sRGB |
| **Helmholtz–Kohlrausch** | saturated colours look lighter than their L\* predicts, so equal-L intents do not look equally light. **Nothing mainstream corrects for it** — not OKLCH, not HCT, not Leonardo | recorded as a known residual. On high-chroma pairs the validator will sometimes disagree with a designer's eye, **and the numbers win.** That is [13-UI](13-UI.md) §2.2's whole lesson |
| **"Constant chroma" ramps** | the sRGB gamut is a wildly irregular solid: at L 0.70 you can reach C ≈ 0.19 at hue 145° and C ≈ 0.11 at 262°. Rotating hue at fixed chroma is silently clipped at some hues and not others | solve per hue; never rotate at fixed chroma |
| **The blue→purple drift** | **a premise worth correcting: this is a *CIELAB* defect, not an Oklab one.** Oklab was built to fix CIELAB's hue non-linearity, and CSS Color 4 uses OKLCH for gamut mapping for that reason | **no action.** Do not add a blue correction; it would fix a bug that is not there |
| **M3's DislikeAnalyzer** | detects dark yellow-green tones and nudges them | **do not copy it.** It is a *taste* correction, not an accessibility one, and silently changing the colour a user picked is worse than keeping it |

---

## 4 · The validator

### 4.1 · WCAG 2 refuses; APCA is computed and never gates

| | WCAG 2 | APCA |
|---|---|---|
| Perceptually uniform | no | substantially better |
| Polarity aware | no — dark-on-light and light-on-dark score identically | **yes**, deliberately |
| Size and weight aware | one crude large-text exception | Lc 90 / 75 / 60 / 45 / 30 / 15 by size and weight |
| Legal standing in 2026 | **the standard** — EN 301 549 under the EAA, enforceable 2025-06-28; ADA Title II deadlines now 2027-04-26 and 2028-04-26, both citing WCAG 2.1 AA | **none.** Its own docs: *"APCA as the candidate for WCAG 3 is still in development"* |

**Decision — which is what [22-FRONTEND](22-FRONTEND.md) §7 gate 4 already says, plus two
additions:**

1. **Store the APCA Lc with every checked pair.** The day WCAG 3 lands you have history, not a
   migration.
2. **Use APCA to catch WCAG 2's known false pass.** If `wcag ≥ 4.5` but `|Lc| < 60`, **warn**. That
   is precisely where WCAG 2's lack of perceptual uniformity bites — dark-on-dark pairs that clear
   the ratio and read as mud — and this product is dark-first.

### 4.2 · Dichromat simulation: Brettel 1997, and it is forty lines

Use **Brettel, Viénot & Mollon (1997)**, the two-plane method, for all three deficiencies.
Viénot 1999's single-plane simplification is valid for protan and deutan only; the reference
implementation carries a literal warning that it is **not accurate for tritanopia**.

Three matrix pairs plus a plane-selection normal, operating in **linear** RGB, public domain.

```
lin(v) = v/12.92 if v < 0.04045 else ((v+0.055)/1.055) ** 2.4
# exact sRGB decoding, NOT gamma 2.2 — the most-copied implementation omits this
# and produces visibly dark, wrong results.

# pick the half-plane by sign of dot(rgb_linear, n), then apply M1 or M2
PROTAN n = ( 0.00048,  0.00393, -0.00441)
DEUTAN n = (-0.00281, -0.00611,  0.00892)
TRITAN n = ( 0.03901, -0.02788, -0.01113)
```

**Machado (2009) is the better model for *anomalous* trichromacy** — a matrix per severity step
rather than a lerp. It is unnecessary here: **the gate asserts the worst case, full dichromacy at
severity 1.0, which is exactly where Brettel is the validated method.** Fewer dependencies, one
file, no severity ladder to get wrong.

### 4.3 · The correction: contrast ratio is the wrong metric for intent separability

[13-UI](13-UI.md) §2.3 measured *contrast ratio between simulated pairs* and found `earn` vs
`danger` at **1.07:1** under deuteranopia. **The finding is correct and it is important. The metric
is wrong**, and it will cost real work the moment anyone tries to fix a palette against it.

Under simulated dichromacy colours collapse onto a **two-dimensional** surface — luminance plus one
surviving chromatic axis. Contrast ratio measures only luminance. So:

| Error | Consequence |
|---|---|
| **False failure** | two intents that differ strongly along the *surviving* axis but share luminance score 1.00 and are refused — forcing a hue change that was never needed |
| **False pass** | two colours thirty luminance points apart clear 3:1 while being "the same colour, lighter" — the harder failure to spot in a ledger |

**Use ΔE2000 on the simulated pair.** It measures the whole distance. Keep contrast ratio as a
secondary check for the one case where luminance genuinely is the thing: an intent used as *text on
a surface*.

| ΔE2000 after simulation | Verdict |
|---|---|
| ≥ 20 | pass |
| 10 – 20 | pass **only** with a distinct glyph |
| < 10 | **refuse** |

> **These numbers are chosen, not measured, and the document says so.** ΔE2000 ≈ 1 is a
> just-noticeable difference for *adjacent* patches under controlled viewing. BrainDog's intents are
> 11–13px glyphs compared **non-adjacently and from memory** — a `warn` chip on row 3 against a
> `bad` chip on row 41. That is categorical naming, not discrimination, and needs an order of
> magnitude more separation. Corroboration: **ColorBrewer's colour-blind-safe filter yields one
> qualitative palette, capped at four classes.** BrainDog has exactly four intents.
>
> **The twenty-minute experiment that settles it:** render the four intent chips at 12px in both
> schemes, simulate all three deficiencies at severity 1.0, and ask three deuteranope readers to
> sort twelve shuffled chips into four piles. Any wrong pile raises the floor.

**The structural mitigation does not depend on the number**, which is why a soft threshold is safe:
the glyph is part of the intent token, there is one mapping table, and no API renders an intent
without its glyph.

### 4.4 · The checks

Every check runs at install, in CI, and live in the theme editor — both schemes, every surface.
**A–H are [13-UI](13-UI.md) §2.4's. I–P are new.**

| # | Check | Floor | On failure |
|---|---|---|---|
| A | every ink role × every surface | 4.5:1 | refuse |
| B | `accent` **as text** × every surface | 4.5:1 | refuse |
| C | `faint` used below 24 px (`t-xl`) | — | refuse |
| D | `edge` × every surface | 3:1 (1.4.11) | refuse |
| E | focus ring vs both neighbours, and focused vs unfocused | 3:1 (2.4.13) | refuse |
| F | **intent × intent, ΔE2000 after Brettel at severity 1.0, all three deficiencies** | ≥ 20, or ≥ 10 with glyphs | refuse < 10, warn 10–20 |
| G | intent **as text** × every surface | 4.5:1 | refuse |
| H | surface ladder monotonic in **relative luminance** | strict | refuse |
| **I** | **elevation ladder monotonic, both schemes** | strict | refuse |
| **J** | **every emitted colour in sRGB gamut** | ΔE_OK ≤ 0.02 | **auto-correct** |
| **K** | **hue-only encoding** — any meaningful pair needs \|ΔL\*\| ≥ 8 **or** a non-colour channel | — | refuse |
| **L** | **`forced-colors` survival** — with tokens replaced by system colours, every load-bearing boundary still has a declared border | — | refuse |
| **M** | `line` vs `edge` not confusable | ΔL ≥ 0.06 | warn |
| **N** | APCA advisory: `wcag ≥ 4.5` but `\|Lc\| < 60` | — | warn |
| **O** | every `$value` parses against its `$type` and is **re-serialised from the parse** | — | refuse |
| **P** | banned in any value: `url(`, `image(`, `element(`, `attr(`, `var(`, `\` | — | refuse |

**I and L are the two worth arguing for.** I, because [05-BLOCKS](05-BLOCKS-AND-THEMES.md) §6
already promises the elevation ladder only goes up, and a theme is exactly the thing that breaks it.
L, because forced colours silently deletes the surface ladder and nothing currently notices.

### 4.5 · Refuse, warn, or auto-correct

The instinct is one policy. That is wrong — three failure classes with different authors and
different recoveries.

| Class | Policy | Argument |
|---|---|---|
| **Mechanically correctable, no intent lost** — out-of-gamut chroma, a missing hex fallback, a dimension in the wrong unit | **auto-correct, and put it in the install diff** | the intent is unambiguous and there is one right answer. Refusing is pedantry. But it must appear in the diff, because [04-PACKS](04-PACKS.md) §3 makes the diff the review surface |
| **A floor is breached** — A, B, C, D, E, F below ΔE 10, G, H, I, K, L, O, P | **refuse, naming the pair and the number** | auto-correcting a contrast failure silently ships a theme the author did not make, and they blame the app. **And an auto-corrected theme is not portable, because the recipient's correction may differ.** A refusal is portable — which matters most for the one artefact designed to be shared |
| **Judgement, or an uncertain threshold** — F in the 10–20 band, M, N | **warn, and let it install** | the threshold is flagged low-confidence above. Refusing on a number you have called a guess is dishonest and produces refusals you cannot defend |

**Two hard exceptions.** The shipped **high-contrast theme is never refused and never
auto-corrected** — it is the accessibility floor, so if it fails, the *validator* is wrong and CI
fails on the validator. And **auto-correction never crosses the WCAG line**: there is no *"we nudged
your `faint` up to 4.5:1 for you."* That is exactly how the light ink ramp ended up with four levels
where there was room for three — a nudge instead of a redesign.

```
theme.midnight — the pair (faint on s3) is 3.61:1. Body text needs 4.5:1.
Lighten faint to at least #8E9C96, or use it only above 24px.

theme.midnight — good and bad are ΔE 6.2 apart to a deuteranope.
Four intents need at least 10. Move one hue, or lower the chroma of the other.
```

---

## 5 · Applying a theme without a rebuild

`adoptedStyleSheets` + `replaceSync()`, which [22-FRONTEND](22-FRONTEND.md) §7 already picked and
which is **Baseline Widely available (2025-09-27)** — an earlier draft of that document said "95%",
and it now carries the date. Full
expressiveness including `@layer`; **no CSP `unsafe-inline`, because it is never parsed from
markup**; a theme swap is one call, one style recalc, no reflow of the token layer.

`@layer theme` sits **before** `@layer a11y`, so a theme cannot remove the focus ring, the
forced-colors block or the target-size floor. That is the mechanical form of *a theme is data, not
authority*.

### Flash of wrong theme — three mechanisms, and two were missing

| # | Mechanism | Why |
|---|---|---|
| 1 | `<meta name="color-scheme" content="light dark">` **as the first thing in `<head>`** | the only thing that stops the white UA canvas painting before the stylesheet parses. It also governs UA-drawn scrollbars and form controls |
| 2 | **`data-scheme` on `<html>`, written server-side from the preference row** | not from a client script. An inline script reading `localStorage` is the classic fix and it costs a CSP nonce and a render-blocking script. **The record already knows the scheme — render it** |
| 3 | the theme text into a nonced `<style>` in the SSR head, from the same generator | already *"one generator, two sinks."* First paint is themed |

**And one addition to the ETag, now made.** [22-FRONTEND](22-FRONTEND.md) §9 keys the document ETag
on `{page.version, record_version, theme.version, scheme, renderer.version}`. `scheme` was added on
this document's request: without it a scheme switch serves a stale document.

### Per-page and per-register theming: refused

| Argument | Weight |
|---|---|
| **It breaks the validator's contract.** The gate checks *the theme*; per-page themes make the checked artefact and the rendered artefact different objects, and the pair count becomes pages × roles × surfaces | decisive |
| **It breaks the reason for strictness** — *"the block set only looks like one product because no kind writes its own colour."* A per-page theme is a kind writing its own colour, one level up | decisive |
| **It breaks intent.** `warn` amber on Money and `warn` blue on Estate is not a theme, it is a bug with permission | decisive |
| `@scope` would be the mechanism, and it is Baseline-newly 2026-03-24 | secondary |

**The one concession, and it is not theming:** a page may carry a `tone:` on its section header,
from the existing four intents. Money reads differently from Estate without introducing a colour —
already validated, already glyph-backed.

---

## 6 · What a theme may never set

| Refused | Because |
|---|---|
| any CSS text, selector, at-rule or declaration | there is no parser path from a theme to CSS syntax; values are re-serialised from a typed parse |
| `url(`, `image(`, `element(`, `attr(`, `var(`, `\` in any value | `url()` is an outbound request from a system designed to make none — the record id lands in somebody's access log. `var(` lets a token escape into another token's context |
| a third-party font, or any remote asset | same channel — and `unicode-range` is all-or-nothing per file, so it also breaks the two-file, 45 KB budget |
| **the four intent words** | a theme maps `warn` to a *role*. It may not add a fifth intent or rename one, and that closure is what makes the measured ten-pair collapse survivable |
| **the intent → glyph mapping** | the glyph is part of the token *precisely so* colour never carries meaning alone. A theme that could change it re-opens the exact failure the gate exists to close |
| the focus ring's existence, `outline: none`, any `:focus-visible` property | `@layer a11y` is later than `@layer theme`, so a theme cannot reach it — structural. And `outline: none` in first-party CSS is a CI failure ([13-UI](13-UI.md) §7, [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6) |
| target sizes or row heights below the floor | a theme sets *density*, a bounded enum (`compact` \| `comfortable` \| `roomy` → 28 / 32 / 36 px) — never a pixel value |
| motion above the 300 ms ceiling, or any animation on a focus ring | *"an app that feels like it is running underwater"* is fatal for this buyer |
| **`forced-color-adjust`** | a theme that can set it can opt the product out of Windows High Contrast entirely |
| **`color-scheme`** | it changes UA scrollbars, form controls and the canvas. A theme declaring `only light` breaks dark mode for a user who never asked |
| a hex at a call site, or `colour:` on a block | [06-PAGES](06-PAGES.md) §7 |

> **One sentence covers all of it: a theme emits into `@layer theme`, and nothing else exists that
> it can reach.**

---

*Next: [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) — pages and headers that are created as you go.*
