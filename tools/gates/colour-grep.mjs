/**
 * `colour-grep` — the gate over what `css-rules` cannot see.
 *
 * A class computed in TypeScript. A `fill="#333"` in an inline SVG. A hex in a data file that ends
 * up in a `style` attribute. Thirty lines of Node, AND THIS IS THE GATE THAT ACTUALLY FIRES IN
 * PRACTICE (22 §7 gate 2) — the stylesheet is the place people remember to be careful.
 *
 * Usage:  node tools/gates/colour-grep.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
/* `negative` IS THE GATES' OWN SEEDED VIOLATIONS. `self-test.mjs` aims each gate AT that directory
   on purpose; an ordinary run must not find the violations that are there to be found. */
const SKIP = new Set(['node_modules', '.svelte-kit', 'build', 'dist', '.git', 'shots', 'docs', 'loop', 'negative']);

// The four places a colour may legally be spelled out, and why none of them is a component writing
// one:
//
//   packages/theme         the generator IS the thing that produces colours
//   theme/house.css        generated, and byte-compared against its generator
//   tools/gates            this file has to know what a colour looks like
//   any *.test.ts          a test asserts on values, which is the point of a test
//
// `--brand` lives in app.css and is caught deliberately: see the exemption note below.
const EXEMPT = [
  /^packages\/theme\//,
  /^packages\/skin\/house\.css$/,
  /^tools\/gates\//,
  /\.test\.ts$/,
  /**
   * The favicons, one per app. Fetched as their own document, outside any page, so they can reach no
   * custom property and no theme — the mark's colour has to be literal there or it has none.
   *
   * Which is exactly why they are GENERATED rather than written: they were the one copy of the mark
   * that no token change touched, and so the one copy that drifted. `packages/skin/scripts/theme.mjs`
   * writes both from `MARK` and `BRAND_RED`, and the theme gate byte-compares them.
   */
  /^apps\/(web|site)\/static\/mark\.svg$/,
  /**
   * Build and screenshot tooling. Nothing here reaches a user: the contact sheet is a page rendered
   * once for a person to look at, and it has no theme to read because it is not the app.
   */
  /^apps\/web\/scripts\//,
];

/**
 * The six-digit form everywhere; the three-digit form in stylesheets only.
 *
 * `#125` is the shape of a three-digit hex AND the shape of a spoken id, and spoken ids are the most
 * repeated string in this product. A gate that fires on `#125` in a sentence about `#125` is a gate
 * somebody switches off, which costs more than the three-digit form ever saves.
 */
/* THE 8-DIGIT FORM TOO. `#[0-9a-fA-F]{6}\b` fails on `#11223344`, because `\b` needs a non-word
   character after the sixth digit and the seventh is one \u2014 so the one hex form that carries an alpha
   channel, which is exactly what somebody reaches for when they want "the accent, faded", walked
   straight through the gate written to stop it. */
/* AND `oklch(` WITH A NUMBER IN IT. The palette is solved in OKLCH, so a hand-written `oklch(0.7
   0.2 30)` is the modern way to write the literal this gate exists to stop — and it matched none of
   the three older forms. `\s*[\d.]` rather than a bare `(`, for the same reason `rgba(` carries one:
   `oklch(var(--mark-l) …)` is three tokens and a function, not a colour. */
const LITERAL_ANY = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|\brgba?\(\s*\d|\bhsla?\(\s*\d|\bok(?:lch|lab)\(\s*[\d.]/;
const LITERAL_CSS = /#[0-9a-fA-F]{3}\b/;

/**
 * Two lines are allowed to hold a literal, and they are named rather than exempted by file — a
 * whole-file exemption is how the next one gets in.
 *
 *   --brand:            the mark. It is the one colour that belongs to the PRODUCT rather than to a
 *                       meaning, gate 3 knows it as a token, and exactly one element paints with it.
 *   @property … initial-value
 *                       a runtime type assertion's fallback, which is never painted: a registered
 *                       custom property with `inherits: true` falls back to the INHERITED value, not
 *                       to this one (28 §2.3). It exists so a malformed installed token fails loudly.
 */
const ALLOWED_LINES = [/^\s*--brand:\s*#[0-9a-fA-F]{6};\s*$/, /^\s*@property\s+--[a-z0-9-]+\s*\{/];

/**
 * Comments are blanked, not skipped. `#125` and `#b-4` are spoken ids and anchors that a comment is
 * entitled to mention, and `#125` is three hex digits as far as a regex is concerned.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');

const blankComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(ts|js|mjs|svelte|css|html|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

const findings = [];

for (const file of await walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (EXEMPT.some((r) => r.test(rel))) continue;

  /* MARKUP COUNTS AS CSS FOR THE THREE-DIGIT FORM. This gate's own header names the case it exists
     for — *"a `fill="#333"` in an inline SVG"* — and the three-digit rule was applied to `.css`
     files only, so that exact example passed. A `#333` inside a `style=` or an SVG attribute is a
     colour by construction; the spoken-id collision the rule guards against lives in prose and in
     `.ts`, not in markup attributes. */
  const isCss = /\.(css|svelte|html)$/.test(rel);
  const lines = blankComments(await readFile(file, 'utf8')).split('\n');
  for (const [i, line] of lines.entries()) {
    if (!LITERAL_ANY.test(line) && !(isCss && LITERAL_CSS.test(line))) continue;
    if (ALLOWED_LINES.some((r) => r.test(line))) continue;
    findings.push({ where: `${rel}:${i + 1}`, text: line.trim().slice(0, 100) });
  }
}

if (findings.length === 0) {
  console.log('  colour-grep: 0 literals outside the theme');
} else {
  for (const f of findings) console.error(`  ${f.where}\n      ${f.text}`);
  console.error(
    `\n  colour-grep: ${findings.length} colour literal(s) outside the theme package.\n` +
      '  A component may name only the semantic layer. If this is the mark, it belongs in app.css as --brand.',
  );
  process.exitCode = 1;
}
