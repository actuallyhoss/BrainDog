/**
 * `colour-grep`: the gate over what `css-rules` cannot see.
 *
 * A class computed in TypeScript. A `fill="#333"` in an inline SVG. A hex in a data file that ends
 * up in a `style` attribute. Thirty lines of Node, AND THIS IS THE GATE THAT ACTUALLY FIRES IN
 * PRACTICE (22 §7 gate 2). The stylesheet is the place people remember to be careful.
 *
 * Usage:  node tools/gates/colour-grep.mjs [root]
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { budget, skipDir } from './lib.mjs';

const C = budget('colourGrep');

/* `negative` IS THE GATES' OWN SEEDED VIOLATIONS. `self-test.mjs` aims each gate AT that directory
   on purpose; an ordinary run must not find the violations that are there to be found. */
/* `docs` and the untracked notes folder are prose about colours rather than colours, and `negative` is this gate's
   own seeded violation. Everything else a gate never walks into is `skipDir`. */
const SKIP = new Set(['docs', 'loop', 'negative']);

// The four places a colour may legally be spelled out, and why none of them is a component writing
// one:
//
//   packages/theme         the generator IS the thing that produces colours
//   any generated sheet    earns it by carrying the generator's header, not by being listed here
//   tools/gates            this file has to know what a colour looks like
//   any *.test.ts          a test asserts on values, which is the point of a test
//   the site's shot test   the same, in the one `.test.mjs` that asserts on colours, by its name
//
// `--brand` lives in app.css and is caught deliberately: see the exemption note below.
const EXEMPT = [
  /^packages\/theme\//,
  /* THE GENERATED STYLESHEETS ARE NOT EXEMPT HERE. They are exempt further down, by carrying the
     generator's own first line, which is the argument this list used to make and then not follow:
     `packages/skin/[a-z-]+.css` was a NAME pattern sitting under a paragraph headed "by what it is
     rather than by its name". It also reached three sheets nobody generates. See the marker test
     below, which is the version that does what the paragraph says. */
  /^tools\/gates\//,
  /\.test\.ts$/,
  /**
   * THE REFUSAL RUNNER'S INPUT BODIES, for the same reason a test file is exempt one line above: an
   * input is a value being asserted on, not a component naming a colour.
   *
   * It is exempt by NAME and not by directory, which is the narrower claim and the one that stays
   * true: `tools/refusals/` will hold more than this file, and the next thing put there has no
   * licence to spell a colour. The file itself is the inputs `40 §6`'s runner drives a fixture
   * with, and one of those fixtures is `colour-outside-theme.yaml`, whose entire subject is a
   * colour the product refuses. A fixture that drives that refusal cannot do it without writing
   * the colour down, so a gate that forbade it here would forbid testing the rule it enforces.
   */
  /^tools\/refusals\/lint-inputs\.json$/,
  /**
   * The favicons, one per app. Fetched as their own document, outside any page, so they can reach no
   * custom property and no theme. The mark's colour has to be literal there or it has none.
   *
   * Which is exactly why they are GENERATED rather than written: they were the one copy of the mark
   * that no token change touched, and so the one copy that drifted. `packages/skin/scripts/theme.mjs`
   * writes both from `MARK` and the house accent, and the theme gate byte-compares them.
   */
  /^apps\/(web|site)\/static\/mark\.svg$/,
  /**
   * Build and screenshot tooling. Nothing here reaches a user: the contact sheet is a page rendered
   * once for a person to look at, and it has no theme to read because it is not the app.
   */
  /^apps\/web\/scripts\//,
  /**
   * THE TEST OF THE SITE'S SHOT TOOLING, for the reason `*.test.ts` is exempt above: it asserts on
   * values. `shot.mjs` reads the live site's colours and holds them to bounds, so its test has to
   * write down a red that is in bounds, a blue that is not, and the `rgb()` a browser reports.
   *
   * BY NAME, not `apps/site/scripts/` and not every `*.test.mjs`. The folder also holds the scripts
   * that draw the site's share card and its icons, and a colour written into one of those IS a
   * colour the site paints. The ending covers every Node test in the repository, most of which have
   * no business with a colour, so a literal in one of them is still worth a look.
   */
  /^apps\/site\/scripts\/shots\.test\.mjs$/,
];

/**
 * The six-digit form everywhere; the three-digit form in stylesheets only.
 *
 * `#125` is the shape of a three-digit hex AND the shape of a spoken id, and spoken ids are the most
 * repeated string in this product. A gate that fires on `#125` in a sentence about `#125` is a gate
 * somebody switches off, which costs more than the three-digit form ever saves.
 */
/* THE 8-DIGIT FORM TOO. `#[0-9a-fA-F]{6}\b` fails on `#11223344`, because `\b` needs a non-word
   character after the sixth digit and the seventh is one. So the one hex form that carries an alpha
   channel, which is exactly what somebody reaches for when they want "the accent, faded", walked
   straight through the gate written to stop it. */
/* AND `oklch(` WITH A NUMBER IN IT. The palette is solved in OKLCH, so a hand-written `oklch(0.7
   0.2 30)` is the modern way to write the literal this gate exists to stop. It matched none of
   the three older forms. `\s*[\d.]` rather than a bare `(`, for the same reason `rgba(` carries one:
   `oklch(var(--mark-l) …)` is three tokens and a function, not a colour. */
const LITERAL_ANY = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|\brgba?\(\s*\d|\bhsla?\(\s*\d|\bok(?:lch|lab)\(\s*[\d.]/;
const LITERAL_CSS = /#[0-9a-fA-F]{3}\b/;

/**
 * AND THE PLAINEST NOTATION OF ALL, which three regexes over hex, `rgb()` and `oklch()` all miss.
 *
 * `color: red` is how somebody writes a colour when they are not thinking about the theme, which is
 * exactly the population this gate exists for. It was invisible. Measured against ten ways to
 * write a colour in CSS, the gate caught three; `red`, `white` and `rebeccapurple` went through.
 *
 * THE PROPERTY IS PART OF THE RULE, not just the word. `tan`, `plum`, `linen`, `orange` and `gold`
 * are CSS colour names and also ordinary English, so matching the bare word would report a register
 * called `linen` and a comment about gold. A colour name only means a colour where a colour is
 * being set, so the match is `<a property that takes a colour>: <name>`.
 *
 * THE FOUR THAT STAY. `transparent`, `currentColor`, `inherit` and `none` are not literals: they
 * name a relationship to something else, which is what the semantic layer is for.
 */
const NAMED = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
  'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen',
];

/** A property whose value is a colour. `border`/`outline`/`box-shadow` carry one among other parts. */
const COLOUR_PROP = String.raw`(?:[a-z-]*color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)?|outline(?:-color)?|box-shadow|text-shadow|caret-color|accent-color)`;

const LITERAL_NAMED = new RegExp(String.raw`\b${COLOUR_PROP}\s*:[^;{}]*(?<![-\w])(?:${NAMED.join('|')})(?![-\w])`, 'i');

/**
 * Two lines are allowed to hold a literal, and they are named rather than exempted by file. A
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
 * AND SEVEN MORE, EACH NAMED WITH THE ONE FILE IT LIVES IN. The two above are shapes a stylesheet is
 * entitled to anywhere; these are not, so the same line in any other file is still a finding.
 *
 *   shot.mjs, four lines   the stylesheet of the contact sheet: `body`, `section`, `img` and `.red`.
 *                          The sheet is a page written to disk once for a person to look over the
 *                          screenshots. It is not the site, it loads no theme and no visitor is
 *                          served it, which is the reason `apps/web/scripts/` is exempt above. The
 *                          four selectors are named, so a fifth rule with a colour in it is caught,
 *                          and so is a colour anywhere else in the script.
 *   live-bounds.json, one  the `colours` list: the reds and the ink the LIVE site is held to. It is
 *                          the expected half of a comparison, a value asserted on, and nothing
 *                          paints with it. Only that key: another colour in the file is caught.
 *   harbour-look, two      the look add-on's `seed` accent, in its pack file and the catalogue's copy,
 *                          held at his word on 16 October (below).
 */
const HEX = String.raw`#[0-9a-fA-F]{6}`;
const ALLOWED_IN = [
  {
    file: 'apps/site/scripts/shot.mjs',
    lines: [
      new RegExp(String.raw`^\s*body \{[^{}#]*\bbackground: ${HEX}; color: ${HEX};[^{}#]*\}\s*$`),
      new RegExp(String.raw`^\s*(?:section|img) \{[^{}#]*\bbackground: ${HEX};[^{}#]*\}\s*$`),
      new RegExp(String.raw`^\s*\.red \{ color: ${HEX}; \}\s*$`),
    ],
  },
  {
    file: 'apps/site/scripts/live-bounds.json',
    lines: [new RegExp(String.raw`^\s*"colours": \["${HEX}"(?:, "${HEX}")*\],?\s*$`)],
  },
  /* THE HARBOUR LOOK'S ACCENT, HELD AT HIS WORD, 16 OCTOBER: the one hex a look add-on hands the theme as its seed, in the
     pack's file and in the copy the catalogue publishes. Asked whether to hold or rename what this gate, core-names and
     web-lists found, he answered "Hold them, deploy tonight" (DIRECTION 44). Only the `seed` line, so another colour in
     either file is still caught. */
  ...['packs/harbour-look/harbour-look.pack.json', 'apps/web/static/catalogue/packs/harbour-look/1.0.0.pack.json'].map((file) => ({
    file,
    lines: [new RegExp(String.raw`^\s*"seed": \{ "accent": "${HEX}", "neutral_hue": \d+ \}\s*$`)],
  })),
];

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
    if (skipDir(e.name) || SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(ts|js|mjs|svelte|css|html|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in
 * the runner's `IMPORTED OR SPAWNED` header. Nothing here happens on import.
 *
 * A ROOT ON THE COMMAND LINE IS STILL OBEYED RATHER THAN IGNORED, and it arrives as this argument.
 * An ignored argument is worse than a refused one, because the count this prints still reads as an
 * answer about the directory you named, so a clean result gets taken for proof about a tree it
 * never once looked at. That is not hypothetical: it is how a sibling gate was misread the day this
 * was written. `process.cwd()` is the last resort rather than the default it was, because
 * `self-test.mjs` still spawns this with the fixture as the child's working directory while
 * `run.mjs` now passes the repository root it derived from its own location.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function colourGrep(root = process.cwd()) {
  const ROOT = resolve(root);

  const findings = [];

  for (const file of await walk(ROOT)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (EXEMPT.some((r) => r.test(rel))) continue;

    /**
     * A GENERATED STYLESHEET IS EXEMPT BY WHAT IT IS, NOT BY ITS NAME.
     *
     * The list above named `house.css` and only that. The generator writes `alpha.css` too now
     * (the environment palette), and the moment it did, this gate reported 360 literals in a file
     * whose own first line says it is generated and must not be edited. A gate that has to be told
     * each new output by name goes red the day somebody adds one, which teaches them to add an
     * exemption rather than to ask whether the finding is real.
     *
     * The marker is the generator's own header, so a file earns this by BEING generated rather than
     * by being remembered. A hand-written file cannot claim it without saying, in its first
     * line, something that `theme.mjs --check` would then hold it to.
     */
    const source = await readFile(file, 'utf8');
    if (source.startsWith('/* GENERATED by packages/theme.')) continue;

    /* MARKUP COUNTS AS CSS FOR THE THREE-DIGIT FORM. This gate's own header names the case it exists
       for: *"a `fill="#333"` in an inline SVG"*. The three-digit rule was applied to `.css`
       files only, so that exact example passed. A `#333` inside a `style=` or an SVG attribute is a
       colour by construction; the spoken-id collision the rule guards against lives in prose and in
       `.ts`, not in markup attributes. */
    const isCss = /\.(css|svelte|html)$/.test(rel);
    /* `source` AGAIN, NOT A SECOND READ. This asked the disk for the same bytes it had just been
       handed by the marker test above, over roughly two thousand files, for no difference in what
       the gate concludes. */
    const lines = blankComments(source).split('\n');
    for (const [i, line] of lines.entries()) {
      if (!LITERAL_ANY.test(line) && !(isCss && (LITERAL_CSS.test(line) || LITERAL_NAMED.test(line)))) continue;
      if (ALLOWED_LINES.some((r) => r.test(line))) continue;
      if (ALLOWED_IN.some((a) => a.file === rel && a.lines.some((r) => r.test(line)))) continue;
      findings.push({ where: `${rel}:${i + 1}`, text: line.trim().slice(0, C.excerptChars) });
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
    return 1;
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at a seeded tree and the header above
   documents `node tools/gates/colour-grep.mjs [root]`. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await colourGrep(process.argv[2])) ?? 0;
