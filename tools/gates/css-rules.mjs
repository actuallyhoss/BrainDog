/**
 * `css-rules` — one regex tokeniser, zero dependencies, no Stylelint.
 *
 * "No component writes a colour" is decoration unless something checks it. This is the check, and
 * two of its rules matter more than they look:
 *
 *   - THE UNKNOWN-PROPERTY RULE matters as much as the colour rule. `var(--fain)` is not a colour
 *     violation, it is an INVISIBLE one: it resolves to nothing, inherits, looks fine in light mode
 *     and is unreadable in dark. `@property` does not rescue it either — measured, an
 *     invalid-at-computed-value-time custom property falls back to the INHERITED value, not to
 *     `initial-value` (28 §2.3).
 *   - THE PHYSICAL-PROPERTY RULE is a day's work now and a manual audit of hundreds of declarations
 *     later, which is why it is in the first commit rather than after sixteen block kinds exist.
 *
 * Usage:  node tools/gates/css-rules.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { budget } from './lib.mjs';

const R = budget('cssRules');

const ROOT = process.cwd();
/* `negative` IS THE GATES' OWN SEEDED VIOLATIONS. `self-test.mjs` aims each gate AT that directory
   on purpose; an ordinary run must not find the violations that are there to be found. */
const SKIP = new Set(['node_modules', '.svelte-kit', 'build', 'dist', '.git', 'shots', 'negative']);

/** Properties whose value paints. A literal in any of them is a component writing a colour. */
const COLOUR_PROPS = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'border',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-block-color',
  'border-inline-color',
  'border-block-start-color',
  'border-block-end-color',
  'border-inline-start-color',
  'border-inline-end-color',
  'border-block',
  'border-inline',
  'border-block-start',
  'border-block-end',
  'border-inline-start',
  'border-inline-end',
  'outline',
  'outline-color',
  'fill',
  'stroke',
  'box-shadow',
  'text-shadow',
  'text-decoration-color',
  'caret-color',
  'accent-color',
  'column-rule-color',
]);

/** A literal colour, in any of the forms a stylesheet can spell one. */
/* `oklch(` AND `oklab(` ARE ON IT NOW, and they carry a digit test for the reason `oklch(var(…))`
   is three tokens and a function rather than a colour. This product's whole palette is solved in OKLCH, so a
   hand-written `oklch(0.7 0.2 30)` is the modern spelling of the literal this rule exists to stop —
   and the list had `lch(` and `lab(` and not the two forms anybody here would actually type. */
const LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\bok?lab\(\s*[\d.]|\bok?lch\(\s*[\d.]|\bcolor\(/i;

/** Values that are not a colour a theme owns, and are legal anywhere. */
const ALLOWED_VALUES = new Set([
  'currentcolor',
  'transparent',
  'inherit',
  'initial',
  'unset',
  'revert',
  'none',
  'auto',
  // The forced-colors block surrenders the palette to the user agent on purpose (28 §2.5).
  'canvas',
  'canvastext',
  'highlight',
  'linktext',
  'buttonface',
  'buttontext',
  'graytext',
]);

/** Physical properties. Logical properties only — a CI grep on these fails the build (13 §8). */
const PHYSICAL = new Set([
  'left',
  'right',
  'margin-left',
  'margin-right',
  'padding-left',
  'padding-right',
  'border-left',
  'border-right',
  'border-left-color',
  'border-right-color',
  'border-left-width',
  'border-right-width',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'float',
  'clear',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'top',
  'bottom',
  'margin-top',
  'margin-bottom',
  'padding-top',
  'padding-bottom',
  'border-top',
  'border-bottom',
]);

/** …except where the physical axis IS the meaning, or no logical equivalent exists. */
const PHYSICAL_OK = new Set(['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height']);

const PHYSICAL_ALIGN = /^(text-align|float|clear)$/;

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(css|svelte)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Comments are blanked rather than removed, so every offset still points at the right line — and
 * blanking them is not cosmetic: a comment containing a colon and a semicolon reads as a
 * declaration to a regex, and a comment containing a `;` swallows the declaration after it. The
 * first run of this gate reported forty tokens as undeclared for exactly that reason.
 */
const blankComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Everything between `<style>` and `</style>`, or the whole file when it is already CSS. */
function cssOf(file, text) {
  if (file.endsWith('.css')) return [{ css: blankComments(text), offset: 0 }];
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  for (let m; (m = re.exec(text)); )
    out.push({ css: blankComments(m[1]), offset: m.index + m[0].indexOf(m[1]) });
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Declarations, found without a parser: `prop : value ;` outside a selector or an at-rule prelude.
 * The name class carries DIGITS — `--s1`, `--sp-4`, `--t-2xl`, `--e3` are all tokens, and a class
 * of `[-a-z]` silently declared none of them.
 */
function* declarations(css, offset) {
  const re = /(^|[;{}])\s*(--)?([-a-z][-a-z0-9]*)\s*:\s*([^;{}]+)/gi;
  for (let m; (m = re.exec(css)); ) {
    const [, , custom, prop, value] = m;
    yield {
      custom: Boolean(custom),
      prop: prop.toLowerCase(),
      value: value.trim(),
      at: offset + m.index,
    };
  }
}

const findings = [];
const declared = new Set();
const used = [];

const files = await walk(ROOT);

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const generated = rel.includes('theme/house.css');

  // Inline `style="--x: …"` in a template declares a custom property too.
  for (const m of text.matchAll(/style=["'][^"']*?--([a-z-]+)\s*:/gi)) declared.add(`--${m[1]}`);

  for (const { css, offset } of cssOf(file, text)) {
    for (const d of declarations(css, offset)) {
      const line = lineOf(text, d.at);
      const where = `${rel}:${line}`;

      /* THE `var()` USES COME FIRST, because a custom property's VALUE can name another token and
         the early return below skipped it. `--panel: var(--fain)` never entered `used`, so the
         unknown-token rule — the one this file's header calls as important as the colour rule,
         because a typo is invisible and looks fine in light mode — was blind to exactly the
         theme-layering declarations where a token typo lives. */
      for (const m of d.value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi))
        used.push({ name: m[1].toLowerCase(), where });

      if (d.custom) {
        declared.add(`--${d.prop}`);
        continue;
      }

      if (generated) continue;

      const bare = d.value.toLowerCase().replace(/var\([^)]*\)/g, '').trim();

      if (COLOUR_PROPS.has(d.prop) && LITERAL.test(bare) && !ALLOWED_VALUES.has(bare))
        findings.push({ where, rule: 'colour-literal', text: `${d.prop}: ${d.value}` });

      /* `outline: none` is banned, WITH ONE ESCAPE, because a gate that cannot express a real
         exception is a gate somebody switches off wholesale. The escape is a written
         justification in the source — a `focus-ok:` comment on the declaration or the line above
         it — so the rule stops being "never" and becomes "say why, in the file, where the next
         person reads it". The only honest reason is that something else visibly shows focus, and
         the one real case is a caret in a text field: it is the platform's own focus indicator,
         and every command palette ever shipped relies on it. */
      if (d.prop === 'outline' && /\bnone\b/.test(d.value) && !justified(text, d.at))
        findings.push({ where, rule: 'outline-none', text: `${d.prop}: ${d.value}` });

      if (PHYSICAL.has(d.prop) && !PHYSICAL_OK.has(d.prop))
        findings.push({ where, rule: 'physical-property', text: `${d.prop}: ${d.value}` });

      if (PHYSICAL_ALIGN.test(d.prop) && /\b(left|right)\b/.test(d.value))
        findings.push({ where, rule: 'physical-property', text: `${d.prop}: ${d.value}` });

      /* `text-overflow` DOES NOTHING ON A FLEX OR GRID CONTAINER, and says nothing about it.
         It applies to a block container's own inline content, so on `display: flex` the browser
         silently ignores it and the parent clips instead — a hard cut with no ellipsis, which is a
         truncation nobody can see happening. It read `fenwick.examp` for `fenwick.example.com`, six
         senders in a row, each unreadable in the same way.

         THE ELLIPSIS GOES ON THE CHILD THAT HOLDS THE TEXT. That is one span, and it is the
         difference between a cut somebody can see and one they cannot. */
      if (d.prop === 'text-overflow' && /ellipsis/.test(d.value) && flexed(text, d.at))
        findings.push({ where, rule: 'ellipsis-on-flex', text: `${d.prop}: ${d.value}` });

      // 13 §2.4 check C's usage half: `faint` clears only the LARGE-text floor, so it may not carry
      // text below 24px. The palette half is the theme validator's.
      if (d.prop === 'color' && /--faint/.test(d.value))
        findings.push({ where, rule: 'faint-on-text', text: `${d.prop}: ${d.value}` });
    }
  }
}

for (const u of used)
  if (!declared.has(u.name))
    findings.push({ where: u.where, rule: 'unknown-property', text: `var(${u.name})` });

/**
 * Does the rule this declaration sits in also make the element a flex or grid CONTAINER?
 *
 * BY THE ENCLOSING BRACES, which is the same bounded-slice technique `justified` uses and is exact
 * enough for the one thing it decides: a `display` on the same selector as the `text-overflow`.
 * `display: inline-flex` counts and `display: block` does not, and a rule with no `display` at all
 * is a block by default, which is where `text-overflow` works.
 */
function flexed(text, at) {
  const open = text.lastIndexOf('{', at);
  if (open < 0) return false;
  const close = text.indexOf('}', at);
  const block = text.slice(open, close < 0 ? text.length : close);
  /* Read as words rather than matched as a pattern: `display` and its value, with whatever
     whitespace is between them collapsed, so the check is about what the rule SAYS. */
  const flat = block.replace(/\s+/g, ' ');
  return flat.includes('display: flex') || flat.includes('display: grid') || flat.includes('display: inline-flex');
}

/**
 * Is this declaration annotated with a `focus-ok:` reason?
 *
 * A window either side rather than exact line arithmetic: the marker belongs on the declaration or
 * in the comment immediately above it, and 240 characters back reaches both without needing to
 * reconstruct line boundaries. A `focus-ok:` further away than that is not beside the thing it
 * excuses, which is the whole point of requiring it.
 */
function justified(text, at) {
  return /focus-ok:/.test(text.slice(Math.max(0, at - R.waiverLookbehindChars), at + R.waiverLookaheadChars));
}

const RULES = {
  'colour-literal': 'a component may name only the semantic layer, never a colour',
  'unknown-property': 'this resolves to nothing, inherits, and is invisible until dark mode',
  'physical-property': 'logical properties only — this breaks under dir="rtl"',
  'outline-none': 'the focus ring is not removable without a `focus-ok:` reason beside it',
  'faint-on-text': 'faint clears the large-text floor only; not below 24px',
  'ellipsis-on-flex': 'text-overflow does nothing on a flex or grid container — put it on the child that holds the text',
};

if (findings.length === 0) {
  console.log(`  css-rules: ${files.length} files, ${declared.size} tokens, 0 findings`);
} else {
  for (const f of findings) console.error(`  ${f.rule.padEnd(18)} ${f.where}  ${f.text}\n${' '.repeat(22)}${RULES[f.rule]}`);
  console.error(`\n  css-rules: ${findings.length} findings`);
  process.exitCode = 1;
}
