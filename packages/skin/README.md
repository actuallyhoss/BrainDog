# `@braindog/skin`

The token layer, the element defaults, the accessibility layer, the generated palette, and the mark.
CSS and one data module. No components, no JavaScript that runs in a page.

It exists because **two apps render this product** — the record at `app.brain.dog` and the marketing
site at `brain.dog` — and a second copy of a type scale is a type scale that drifts. The site is not
a different brand with a similar palette; it is the same system with fewer screens, and the only
honest way to hold that is one file.

```
tokens.css   the @layer statement, the faces, the scale, spacing, radius, motion, z-index, --brand
base.css     element defaults: box sizing, body face, headings, links, tabular figures, Arabic
a11y.css     the focus ring, forced colours, the target floor
house.css    GENERATED — do not edit. `pnpm theme`
mark.ts      the artwork, as path data
```

## The layer order is the enforcement boundary

`tokens.css` opens with

```css
@layer tokens, theme, a11y, components;
```

and nothing else in the repository declares it. A theme emits into `@layer theme`, which sits
**before** `@layer a11y`, so **an installed theme cannot remove a focus ring, the forced-colors
overrides or the target floor**. That is the mechanical form of "a theme is data, not authority"
(22 §11), and it is the most expensive line here to reverse.

Import order therefore matters exactly once: `tokens.css` first, because it carries the statement.

## Two things it deliberately does not carry

**`html, body { overflow: hidden }`.** The record is one scroll container by design; a marketing
site is a document, and documents scroll. A shared base that picks one forces the other to undo it,
and an undone rule is a rule nobody can find.

**Fonts.** The `@font-face` rules are here, but the `.woff2` files are each app's own `static/fonts`,
because the URL in `src:` is absolute and an app serves its own assets.

## Generated files

`house.css` and both apps' `static/mark.svg` are written by `scripts/theme.mjs` and **byte-compared
in CI** by the `theme` gate. A palette that has drifted from its own generator is a palette nobody
validated, and a favicon that has drifted from the mark is the one copy no token change touches —
which is exactly why it kept drifting before it was generated.

```sh
pnpm theme            # write them
node scripts/theme.mjs --check   # fail if the committed files are not what the generator emits
```

The generator itself is `@braindog/theme`: contrast-driven, sixteen validated checks, refuses a
palette it cannot prove. See that package's README for why it argues with you.

## Importing it

From a `<script>`, not from CSS:

```ts
import '@braindog/skin/tokens.css';
import '@braindog/skin/base.css';
import '@braindog/skin/a11y.css';
```

`postcss-import` resolves relative paths and not bare package specifiers, so
`@import '@braindog/skin/tokens.css'` inside a stylesheet makes Vite look for
`apps/web/@braindog/skin/tokens.css` and return 500. Vite's own resolver handles the JS form.
