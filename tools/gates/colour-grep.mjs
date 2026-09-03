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
const SKIP = new Set(['node_modules', '.svelte-kit', 'build', 'dist', '.git', 'shots', 'docs', 'loop']);

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
  /^apps\/web\/src\/theme\/house\.css$/,
  /^tools\/gates\//,
  /\.test\.ts$/,
];

/**
 * The six-digit form everywhere; the three-digit form in stylesheets only.
 *
 * `#125` is the shape of a three-digit hex AND the shape of a spoken id, and spoken ids are the most
 * repeated string in this product. A gate that fires on `#125` in a sentence about `#125` is a gate
 * somebody switches off, which costs more than the three-digit form ever saves.
 */
const LITERAL_ANY = /#[0-9a-fA-F]{6}\b|\brgba?\(\s*\d|\bhsla?\(\s*\d/;
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

  const isCss = rel.endsWith('.css');
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
