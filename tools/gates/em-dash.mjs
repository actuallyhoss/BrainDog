/**
 * `em-dash`: the house rule that had no gate, and 91 string literals to show for it.
 *
 *   node tools/gates/em-dash.mjs [root]
 *
 * `loop/LOOP.md`, under "How to write": *"No em dashes and no flippant register in anything a
 * stranger reads."* Nothing enforced it, so it drifted the way an unenforced rule always drifts:
 * not in one careless file but a sentence at a time, in refusals, fix lines and labels, across
 * eleven packages. A refusal is the most-read prose this product has, because it is the only prose
 * somebody meets at the moment they are stuck.
 *
 * AN EM DASH IS TWO DIFFERENT CHARACTERS WEARING ONE CODEPOINT, and that is the whole of the
 * judgement here. Written ` — ` inside a sentence it is punctuation, and it is standing in for a
 * full stop, a colon or a semicolon that the writer did not choose between. Written anywhere else
 * it is typography: `'—'` alone is the empty cell in a table, `` `${heading} —` `` is a rule drawn
 * after a heading, `\n\n— Spark` is a signature. Rewriting those changes a rendered layout and
 * fixes nothing, because nobody reads them as prose.
 *
 * SO THE RULE IS A SPACE ON EACH SIDE, and it is stated as a property of the character rather than
 * as a list of forgiven files. A path allowlist would have been shorter to write and would have
 * meant that the next em dash in `digest.ts` was free.
 *
 * AND A COMMENT IS NOT PROSE, IN WHICHEVER LANGUAGE IT IS WRITTEN. The three this tree writes are
 * blanked: `/* *\/`, `//` and `<!-- -->`. That last one is not a detail. The measurement that
 * started this work did not blank HTML comments, and so reported 37 violations in
 * `settings/[area]/+page.svelte` and 3 in `Sidebar.svelte` that were every one of them a
 * backtick-quoted identifier inside a `<!-- -->` explaining why the markup is the way it is. The
 * real count in those two files is zero. A gate that made somebody rewrite 40 comments would have
 * been switched off by the second one.
 *
 * SQL LINE COMMENTS ARE BLANKED TOO, and they are the reason this file knows what a string literal
 * is at all. Four literals in this repository hold a schema: `0001_kernel.ts` alone carries 70 em
 * dashes, every one of them inside a `--` comment annotating a column. They are comments that
 * happen to be nested one language deep, and the glyph rule does not reach them: they are spaced
 * on both sides, exactly like prose. Blanking them is the same decision as blanking `//`, taken in
 * the one place where a comment is inside a value rather than beside it.
 *
 * IT SCANS WHAT IS LEFT, RATHER THAN ONLY THE LITERALS. In a `.ts` file an em dash cannot live
 * outside a string, so the two are the same set; in a `.svelte` file the prose is in the markup
 * (`<p>text — here</p>`), which no literal contains and which is read by exactly the stranger this
 * rule is about. Measured on the tree the day this landed: 0 outside a literal, so this costs no
 * finding today and closes the hole the app is most likely to fall into next.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { budget, skipDir } from './lib.mjs';

const C = budget('emDash');

const DASH = '\u2014';

/** The two workspaces, and `src` within each member: shipped source, not tooling or fixtures. */
const WORKSPACES = ['packages', 'apps'];

/**
 * AND THE README OF ANY PACKAGE THAT IS ACTUALLY PUBLISHED, which is one file today.
 *
 * `packages/render` ships to npm as `braindog-render` under MIT, and its README is the page a
 * stranger reads first: not a contributor who already has the repository, but somebody who found
 * the package and is deciding whether to use it. Every other README in this tree is read by people
 * who cloned it, and the five of them carry forty-three spaced em dashes that are nobody's
 * problem.
 *
 * READ OFF `private`, NOT OFF A LIST. A second published package inherits the rule the day its
 * `package.json` says so, and a name written here would be a list that stops agreeing with what is
 * on the registry.
 */
const publishedReadme = async (dir) => {
  try {
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    if (manifest.private === true) return null;
  } catch {
    return null;
  }
  const at = join(dir, 'README.md');
  try {
    await readFile(at, 'utf8');
    return at;
  } catch {
    return null;
  }
};

/**
 * Markdown's own two ways of saying "this is not prose": a fenced block and an inline span.
 *
 * FENCES FIRST, so their backticks are gone before spans are looked for. A `render` README draws
 * what a document turns into, and the column that separates the source from the result is an em
 * dash spaced on both sides. That is a drawing, and reading it as a sentence is the same mistake
 * the first measurement of this rule made with HTML comments.
 */
const blankMarkdown = (text) =>
  text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/^```[\s\S]*?^```/gm, blank)
    .replace(/`[^`\n]*`/g, blank);

/**
 * Comments go, and the line numbers stay.
 *
 * BLANKED RATHER THAN REMOVED, for `secret-grep`'s reason: collapsing a twenty-line header into one
 * space moves every finding below it, and a gate that names the wrong line is a gate somebody stops
 * trusting on the second use.
 *
 * THE `[^:]` BEFORE `//` IS NOT DECORATION: `https://host` is not the start of a comment, and this
 * gate's own findings are full of URLs.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');

const blankComments = (text) =>
  text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));

/**
 * A single-quoted, double-quoted or backtick string, with escapes. Only the backtick form may span
 * lines, which is why it is the only one whose body admits a newline.
 */
const LITERAL = /'([^'\\\n]|\\.)*'|"([^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/**
 * Does this literal hold SQL.
 *
 * `\\n` AS WELL AS A REAL NEWLINE, because the biggest schema in the tree is written as one source
 * line with escaped newlines in it, and a rule that only knew the real form would have exempted the
 * two small migrations and not the one carrying 70 dashes.
 */
const holdsSql = (lit) => /(?:^|\\n|\n)\s*(?:CREATE|INSERT|SELECT|UPDATE|DELETE|ALTER|DROP|PRAGMA)\s/i.test(lit);

/** `--` to the end of its line, blanked in place so every index after it still means what it did. */
const blankSqlComments = (lit) =>
  lit.replace(/(^|\\n|\n|\s)--[^\n]*?(?=\\n|\n|$)/g, (m, lead) => lead + blank(m.slice(lead.length)));

async function walk(dir, out) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    /* `test` IS NOT THIS GATE'S SUBJECT. A test asserts on the sentence a stranger reads; it is not
       itself read by one, and holding it to the rule would mean a test could not quote the prose
       it is checking. `.test.ts` beside a source file is the same statement. */
    if (skipDir(e.name) || e.name === 'test') continue;
    const at = join(dir, e.name);
    if (e.isDirectory()) await walk(at, out);
    else if (/\.(ts|svelte)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(at);
  }
}

/**
 * THE CHECK IS A FUNCTION, and `run.mjs` imports it rather than spawning this file: `52 §5.1` step
 * 3, and the runner's `IMPORTED OR SPAWNED` header holds the argument for it. Nothing in this file
 * happens on import, which is the property that lets the runner ask the module what it needs
 * instead of reading a declaration out of the source text and hoping the code agrees.
 *
 * SO THE ROOT IS AN ARGUMENT, and it still answers to the two handles the rest of this directory
 * takes: `argv[2]` from the command line, at the foot of this file, and `BRAINDOG_GATE_ROOT`, which
 * is how `self-test` aims a gate at a seeded tree. `process.cwd()` is the last resort now rather
 * than the default it was: an imported gate shares the runner's working directory, wherever the
 * operator was standing, so `run.mjs` passes the root it derived from its own location.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass`
 * grep rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function emDash(root = process.env.BRAINDOG_GATE_ROOT ?? process.cwd()) {
  const ROOT = resolve(root);

  const files = [];
  for (const workspace of WORKSPACES) {
    let members;
    try {
      members = await readdir(join(ROOT, workspace), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const m of members) {
      if (!m.isDirectory() || skipDir(m.name)) continue;
      try {
        await walk(join(ROOT, workspace, m.name, 'src'), files);
      } catch {
        /* A member with no `src` ships no prose. */
      }
      const readme = await publishedReadme(join(ROOT, workspace, m.name));
      if (readme) files.push(readme);
    }
  }

  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is this directory's word for "could not run",
     and it is the difference between a clean tree and a root aimed at the wrong place. */
  if (files.length === 0) {
    console.log(`  em-dash: no packages/*/src or apps/*/src under ${ROOT}, so no prose was read`);
    return 3;
  }

  const findings = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const rel = relative(ROOT, file).replace(/\\/g, '/');

    /* Comments first, then the comments nested one language down inside what is left. */
    let text;
    if (file.endsWith('.md')) {
      text = blankMarkdown(source);
    } else {
      text = blankComments(source);
      text = text.replace(LITERAL, (lit) => (holdsSql(lit) ? blankSqlComments(lit) : lit));
    }

    const lines = source.split('\n');
    let line = 1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        line++;
        continue;
      }
      if (text[i] !== DASH) continue;
      /* THE GLYPH RULE, and the whole of it. A space on each side is a clause break somebody did not
         choose a mark for; anything else is typography. */
      if (text[i - 1] !== ' ' || text[i + 1] !== ' ') continue;

      /* The excerpt comes from `source`, not from `text`, so a finding shows the real characters
         rather than the blanks a comment left behind. Windowed on the dash because a refusal's
         sentence is often longer than the budget and the clause break is what has to be visible. */
      const column = i - (text.lastIndexOf('\n', i) + 1);
      const whole = lines[line - 1] ?? '';
      const from = Math.max(0, column - C.excerptChars);
      const to = column + C.excerptChars;
      const clip = `${from > 0 ? '…' : ''}${whole.slice(from, to).trim()}${to < whole.length ? '…' : ''}`;
      findings.push({ where: `${rel}:${line}`, text: clip });
    }
  }

  if (findings.length === 0) {
    console.log(`  em-dash: 0 em dashes used as punctuation, over ${files.length} files`);
  } else {
    for (const f of findings) console.error(`  ${f.where}\n      ${f.text}`);
    console.error(
      `\n  em-dash: ${findings.length} em dash(es) used as punctuation in prose a stranger reads.\n` +
        '  Recast the sentence so the break is a full stop, a colon or a semicolon, whichever the\n' +
        '  clause actually is. A hyphen or an en dash in its place is the same sentence, punctuated worse.',
    );
    return 1;
  }
}

/* AND IT IS STILL A SCRIPT. `self-test` spawns each gate against a seeded tree, and the header above
   documents `node tools/gates/em-dash.mjs [root]`, so the command line stays exactly where it was.
   `?? 0` because a pass returns nothing: see the function's own last paragraph. */
if (import.meta.main) process.exitCode = (await emDash(process.argv[2])) ?? 0;
