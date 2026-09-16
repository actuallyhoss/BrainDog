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
 * `52 §5.2` NAMES TWELVE RULES AND THIS FILE HOLDS ELEVEN OF THEM (`loop/finding-css-rules.md`).
 * ROW 12 — every semantic colour token has a `pairs.json` entry — IS SKIPPED, NOT FAKED: `pairs.json`
 * is not a file that exists anywhere in this source tree. `39-SPEC-THEME.md` D14 says it is
 * apps/web's to emit, and the only consumer named anywhere in this repo is a browser-based
 * `contrast` gate that does not exist yet either. This tokeniser reads source off disk with no
 * browser and no build; asserting membership in a JSON file that nothing here produces would be a
 * check against data invented for the occasion, which is the one thing a gate must never be.
 *
 * Usage:  node tools/gates/css-rules.mjs [root]
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { budget, skipDir } from './lib.mjs';

const R = budget('cssRules');

/* A ROOT ON THE COMMAND LINE IS OBEYED RATHER THAN IGNORED, and silently ignoring one was worse
   than refusing it. A run handed a directory walked the whole repository instead and then printed a
   count in the shape of an answer about that directory, so a `0 findings` was read as "the rule
   works" by an operator whose run had never once looked at the tree they named. `process.cwd()`
   stays the default because it is how both callers aim this gate: `run.mjs` and `self-test.mjs`
   each spawn it with the root as the child's working directory and no argument. */
const ROOT = resolve(process.argv[2] ?? process.cwd());
/* `negative` IS THE GATES' OWN SEEDED VIOLATIONS. `self-test.mjs` aims each gate AT that directory
   on purpose; an ordinary run must not find the violations that are there to be found. */
/* `negative` is this gate's own seeded violation, which it must not find while checking the app.
   Everything else a gate never walks into is `skipDir`. */
/* THIS IS TESTED AGAINST ENTRIES FOUND WHILE WALKING, NEVER AGAINST THE ROOT ITSELF, so a root
   pointed INSIDE `negative/` is still scanned. Skipping the root you were explicitly handed would
   make the argv form above useless for the one tree anybody aims it at by hand. */
const SKIP = new Set(['negative']);

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

/**
 * The four names an `<Icon size=…>` may hold.
 *
 * `52 §5.2` row 7 spells these `xs sm md lg` in its table, and that is a typo in that document, not
 * a fourth naming scheme this gate should invent a fifth for. `50-SPEC-WEB.md`'s token row is
 * unambiguous — `--icon-s --icon-m --icon-l --icon-xl`, "the four names" — and it is what
 * `Icon.svelte` actually declares (`size?: 's' | 'm' | 'l' | 'xl'`) on both copies of the component
 * in this tree. Coding the table's spelling literally would red every `<Icon>` in the app on day
 * one, which is not a hole this gate has found; it is a typo two rows of the same document disagree
 * about. Routed rather than silently resolved: `docs/52-SPEC-TESTING-AND-CI.md:460` should read
 * `s m l xl`.
 */
const ICON_SIZES = new Set(['s', 'm', 'l', 'xl']);

/** The type-scale steps that are a display size, per `52 §5.2` row 8. */
const DISPLAY_SIZE = /--t-(xl|2xl|3xl)\b/;

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (skipDir(e.name) || SKIP.has(e.name)) continue;
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

/**
 * Every LEAF selector block in a stylesheet — `selector { declarations }` — found by matching
 * braces rather than assumed to be flat. Three rules need to know which SELECTOR a declaration sits
 * under, not only its value, and the flat `declarations()` regex above throws that away on purpose
 * (it does not care about nesting). An at-rule (`@media`, `@container`, `@supports`, `@keyframes`)
 * is not a leaf: its body holds further blocks, so this descends into it and yields what is nested
 * rather than the at-rule's own prelude.
 *
 * `inMedia` IS TRUE ONLY UNDER `@media`, never `@container` or `@keyframes`, because rule 11 is
 * about the one at-rule this codebase actually uses for a responsive override — the thing that goes
 * quiet when an ordinary rule later in the file matches the same selector at equal specificity and
 * wins on source order alone, media query or not.
 */
function* leaves(css, base = 0, inMedia = false) {
  const re = /([^{}]*)\{/g;
  for (let m; (m = re.exec(css)); ) {
    const prelude = m[1].trim();
    const bodyStart = re.lastIndex;
    let depth = 1;
    let j = bodyStart;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(bodyStart, j - 1);
    if (prelude.startsWith('@')) yield* leaves(body, base + bodyStart, inMedia || /^@media\b/i.test(prelude));
    else yield { selector: prelude, body, at: base + bodyStart, inMedia };
    re.lastIndex = j;
  }
}

/**
 * Blank the inside of every `:global(...)` in a selector, matching parens, so a class named there is
 * never asked to be one this component emits — escaping scoping is what `:global` is for.
 */
function blankGlobal(sel) {
  let out = '';
  for (let i = 0; i < sel.length; i++) {
    if (sel.startsWith(':global(', i)) {
      let depth = 1;
      let j = i + 8;
      while (j < sel.length && depth > 0) {
        if (sel[j] === '(') depth++;
        else if (sel[j] === ')') depth--;
        j++;
      }
      out += ' '.repeat(j - i);
      i = j - 1;
    } else out += sel[i];
  }
  return out;
}

/** Every class a selector names, `:global(...)` excluded. */
const classesOf = (sel) => [...blankGlobal(sel).matchAll(/\.([a-zA-Z_-][\w-]*)/g)].map((m) => m[1]);

/**
 * Does this component's own markup ever write this class — a static `class="…"`, a `class:name`
 * directive, or any other spelling that puts the literal name in the file outside its `<style>`
 * block? A membership test on the raw text on purpose: the cost of missing a genuinely dead class is
 * nothing, and the cost of flagging one a template literal builds at runtime is a gate nobody trusts.
 */
const emits = (markup, cls) => new RegExp(`(^|[^\\w-])${cls}([^\\w-]|$)`).test(markup);

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

  /* `52 §5.2` ROW 7, FIRST HALF. A literal `size="…"` on the markup, not the value of a template
     expression — `size={x}` is computed at runtime and this gate reads source, not output, so it is
     out of reach the same way a colour built from a variable is out of reach of rule 1. Missing a
     dynamic one is the safe direction; inventing a violation for an expression it never evaluated
     would not be. */
  for (const m of text.matchAll(/<Icon\b[^>]*>/gs)) {
    const size = m[0].match(/\bsize\s*=\s*"([^"]*)"/);
    if (size && !ICON_SIZES.has(size[1]))
      findings.push({ where: `${rel}:${lineOf(text, m.index)}`, rule: 'icon-size', text: `size="${size[1]}"` });
  }

  /* `52 §5.2` ROW 7, SECOND HALF. A literal `width`/`height` on an `<svg>` is how a glyph grows to a
     fixed box instead of its container — the same escape rule 2 blocks for text, aimed at markup
     instead of a `<style>` block, so it is read off the tag rather than a declaration. */
  for (const m of text.matchAll(/<svg\b[^>]*>/gs)) {
    /* `(?<![\w-])` rather than `\b`, because `\b` sits happily between the hyphen and the `w` of
       `stroke-width` — every `<Icon>` glyph in this tree carries one, and `\b` alone read each as a
       literal SIZE rather than the stroke rule actually asks for. */
    const dim = m[0].match(/(?<![\w-])(width|height)\s*=\s*"(\d[\d.]*)(px)?"/);
    if (dim) findings.push({ where: `${rel}:${lineOf(text, m.index)}`, rule: 'icon-size', text: `${dim[1]}="${dim[2]}${dim[3] ?? ''}"` });
  }

  /* `52 §5.2` ROW 9, over the one file the rule names. `Icon.svelte` exists in two copies
     (`apps/web` and `apps/site`) and both are read: a `color` prop on either is a colour-writing
     icon component, which is exactly what `13`'s "no icon accepts a colour" rests on and what the
     component's own header comment (line 4) promises is impossible. */
  if (rel.endsWith('Icon.svelte')) {
    const props = text.match(/\{([^}]*)\}(?:\s*:[^=]+)?\s*=\s*\$props\(\)/s);
    const keys = props ? props[1].split(',').map((k) => k.trim().split(/[=:]/)[0].trim()) : [];
    if (keys.includes('color'))
      findings.push({ where: `${rel}:${lineOf(text, props.index)}`, rule: 'icon-color', text: '$props() destructures color' });
  }

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

      /* `52 §5.2` ROW 2. A literal escapes the type scale the same way `left`/`right` escapes the
         logical axis: it reads fine until the day something downstream — here, every OTHER element
         sized from the same scale — assumes the ladder holds. `TabBar.svelte:99` was a `10px` this
         rule would have caught the day it was written; it carried no `font` string for this gate to
         match on at all, because the check did not exist. */
      /* A SIZE IN `em` DERIVES FROM THE SCALE. A SIZE IN `px` ESCAPES IT. This rule could not tell
         them apart, because it reds on any value starting with a digit, and that is most of what it
         found the first time it ran: `0.5em` on a code span that is half of whichever figure it
         fronts, where the figure is a different step in different blocks. There is no fixed token
         that is half of a thing that varies, so pinning those would have changed what a reader sees
         in order to satisfy a rule about not changing what a reader sees.

         `rem` IS ON THE FORBIDDEN SIDE ON PURPOSE, and it is the one that looks wrong. It is
         relative to the root and not to the parent, so it is fixed wherever it is used, which is
         the defect this rule exists for wearing a relative unit's clothes. Viewport units are
         refused for the same reason, and nothing in the tree uses one for type today. */
      const derived = /^[0-9.]+(em|ex|ch|lh|%)$/i;
      if (d.prop === 'font-size' && /^[0-9.]/.test(d.value) && !derived.test(d.value.trim()))
        findings.push({ where, rule: 'font-size-literal', text: `${d.prop}: ${d.value}` });

      /* `52 §5.2` ROW 6. Zero and negative are not this rule's business — `z-index: -1` is a
         deliberate "behind everything" and has no stacking-order ambiguity to protect against.
         A POSITIVE literal is the one that silently wins or loses a fight with the next developer's
         own positive literal, which is exactly what a named `--z-*` scale exists to make explicit. */
      if (d.prop === 'z-index' && /^[1-9]/.test(d.value))
        findings.push({ where, rule: 'z-index-literal', text: `${d.prop}: ${d.value}` });

      /* `52 §5.2` ROW 8. The identifier role (13 §3.2) is deliberately small and quiet — an id, a
         hash, a token — and a DISPLAY size in the SAME RULE is the two roles colliding: a monospace
         face at `--t-xl` reads as a heading that happens to be unreadable, not as an identifier.
         `blockOf` is `flexed`'s own bounded-slice trick, reused rather than duplicated. */
      if (d.prop === 'font-family' && /--font-id\b/.test(d.value) && DISPLAY_SIZE.test(blockOf(text, d.at)))
        findings.push({ where, rule: 'identifier-display-size', text: `${d.prop}: ${d.value}` });

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

    if (generated) continue;

    const allLeaves = [...leaves(css, offset)];

    /* `52 §5.2` ROW 10, `.svelte` ONLY. A plain `.css` file such as `blocks.css` has no markup of
       its own to check its selectors against — it is a shared sheet several templates draw on — so
       "its own markup" only means something for a component that carries both halves in one file. */
    if (!file.endsWith('.css')) {
      const markup = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gs, '');
      for (const leaf of allLeaves)
        for (const cls of classesOf(leaf.selector))
          if (!emits(markup, cls))
            findings.push({ where: `${rel}:${lineOf(text, leaf.at)}`, rule: 'unemitted-class', text: `.${cls}` });
    }

    /* `52 §5.2` ROW 11. Specificity is tied — same selector, same declaration — so the cascade falls
       back to SOURCE ORDER, and a bare rule always wins that regardless of which one sits inside an
       `@media` block. The override was written to read as conditional; it never was. Reported at the
       LATER copy, because that is the line silently winning. */
    const reported = new Set();
    for (const early of allLeaves.filter((l) => l.inMedia)) {
      const earlyProps = new Set([...declarations(early.body, 0)].map((d) => d.prop));
      for (const later of allLeaves.filter((l) => !l.inMedia && l.at > early.at)) {
        if (later.selector.trim().replace(/\s+/g, ' ') !== early.selector.trim().replace(/\s+/g, ' ')) continue;
        for (const d of declarations(later.body, 0)) {
          const key = `${later.at}|${d.prop}`;
          if (earlyProps.has(d.prop) && !reported.has(key)) {
            reported.add(key);
            findings.push({
              where: `${rel}:${lineOf(text, later.at)}`,
              rule: 'media-overridden',
              text: `${later.selector} { ${d.prop} }`,
            });
          }
        }
      }
    }
  }
}

for (const u of used)
  if (!declared.has(u.name))
    findings.push({ where: u.where, rule: 'unknown-property', text: `var(${u.name})` });

/**
 * The rule a declaration at `at` sits inside, by the enclosing braces — not a parse, a bounded
 * slice, and exact enough for what its two callers each decide about a single sibling declaration.
 * Shared rather than duplicated: `flexed` asks it for `display`, the identifier/display-size check
 * (rule 8) asks it for `font-size`.
 */
function blockOf(text, at) {
  const open = text.lastIndexOf('{', at);
  if (open < 0) return '';
  const close = text.indexOf('}', at);
  return text.slice(open, close < 0 ? text.length : close);
}

/**
 * Does the rule this declaration sits in also make the element a flex or grid CONTAINER?
 *
 * `display: inline-flex` counts and `display: block` does not, and a rule with no `display` at all
 * is a block by default, which is where `text-overflow` works.
 */
function flexed(text, at) {
  /* Read as words rather than matched as a pattern: `display` and its value, with whatever
     whitespace is between them collapsed, so the check is about what the rule SAYS. */
  const flat = blockOf(text, at).replace(/\s+/g, ' ');
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
  'font-size-literal': 'a size in px or rem is fixed wherever it lands, so it escapes the type scale. A size in em rides the step around it, and is not this',
  'z-index-literal': 'a positive stacking order is a `--z-*` token or it is a fight the next literal wins',
  'icon-size': 'an icon grows to a name from the scale, not a number — s, m, l or xl',
  'identifier-display-size': 'the identifier role is small and quiet by design; a display size on it is the two roles colliding',
  'icon-color': 'an icon component takes no colour prop — currentColor only, or it is a colour-writing component',
  'unemitted-class': "this component's own markup never writes this class — a rename left the rule behind",
  'media-overridden': 'a later bare rule matches this selector and property at equal specificity and wins on source order, media query or not',
};

if (findings.length === 0) {
  console.log(`  css-rules: ${files.length} files, ${declared.size} tokens, 0 findings`);
} else {
  for (const f of findings) console.error(`  ${f.rule.padEnd(18)} ${f.where}  ${f.text}\n${' '.repeat(22)}${RULES[f.rule]}`);
  console.error(`\n  css-rules: ${findings.length} findings`);
  process.exitCode = 1;
}
