/**
 * The banned surface, `31-STACK` §1.
 *
 *   node tools/gates/stack.mjs
 *
 * One kernel has to run unchanged in workerd, in Node 24 and in a bare test process. That is not a
 * preference — it is what makes a self-host the same code as the hosted product, and what makes a
 * test in Node evidence about production. A source file that imports a driver has chosen one of the
 * three, and the choice is invisible until the day the other two break.
 *
 * So: under `packages/*` and `src/`, no `node:` import, no `cloudflare:` import, no bare `fetch`,
 * no `Buffer`. WebCrypto, `TextEncoder`, `Intl` and `URL` are the whole platform these packages get.
 *
 * A SIGNATURE IS NOT A CALL. `interface Http { fetch(url, init) }` is the port that exists so no
 * package calls the global one, and the rule is about the call. Interface bodies are blanked before
 * the identifier rules run; see `dedeclare`.
 *
 * `test/` IS EXEMPT AND THAT IS THE POINT. The adapter that binds the kernel to `node:sqlite` lives
 * there, on the other side of the line: it is allowed to know exactly which runtime it is in, and
 * the kernel is not allowed to ask.
 *
 * The web app is not in scope — it is a browser bundle and answers to the bundle gate instead.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/* THE WORKING DIRECTORY, LIKE EVERY OTHER GATE, falling back to the repository this file sits in.
   Deriving the root from `import.meta.url` alone meant this gate scanned the real tree no matter
   where it was pointed — so its own negative fixture passed, which `self-test.mjs` found on the
   first run. A gate that cannot be aimed at a seeded violation cannot be shown to work. */
const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** Every rule is a pattern plus the sentence a person needs when it fires. */
const BANNED = [
  {
    id: 'node-import',
    strings: true,
    re: /(?:^|[^\w])(?:import|from|require\s*\()\s*['"]node:([a-z_/]+)['"]/gm,
    why: 'imports node:$1 — a package that names a runtime has chosen one. Take it through a port, or move the file to test/.',
  },
  {
    id: 'cloudflare-import',
    strings: true,
    re: /(?:^|[^\w])(?:import|from)\s*['"]cloudflare:([a-z_/]+)['"]/gm,
    why: 'imports cloudflare:$1 — the same rule in the other direction. The Worker wires it; the package takes a port.',
  },
  /* `globalThis.` IS NOT AN ESCAPE HATCH. The lookbehind was written to let `res.fetch(` and
     `this.fetch(` through, and it let `globalThis.fetch(` through with them — which is the spelling
     somebody reaches for precisely when they know the bare one is banned. */
  { id: 'fetch', re: /(?<![.\w])(?:globalThis\.)?fetch\s*\(/g, why: 'calls fetch — the record makes no outbound call (01 §1). Queue an outbox row.' },
  { id: 'buffer', re: /(?<![.\w])(?:globalThis\.)?Buffer\s*[.(]/g, why: 'uses Buffer — Uint8Array and TextEncoder are the two that exist everywhere.' },
  /* 52 §5.2 rule 4 lists five words and this gate knew three. `process.` is a Node global that does
     not exist in a Durable Object, and `__dirname` is a CommonJS one that exists in neither. */
  {
    id: 'node-globals',
    re: /(?<![.\w])(process\.|__dirname|__filename)/g,
    why: 'names a Node global — `process` and `__dirname` exist in neither runtime this ships to.',
  },
  /* THE ONLY SCOPED RULES HERE, and `31 §3` layer 4 is where the scope comes from: `no RegExp` is
     true of `packages/extract` and of nothing else, because every other package matches literals
     it wrote itself while that one matches a stranger's payload. A pattern over untrusted text is
     the classic way to turn an arrival into an outage, and `43 §8` answers it by having nothing to
     compile: every scanner there is one index that only advances. The rule is what keeps that true
     after the fourth person edits the file. */
  {
    id: 'regexp-literal',
    under: 'packages/extract/',
    re: /(?:^|[=(,:[!&|?{};]|=>|\breturn\b|\bcase\b)\s*\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuvy]*/gm,
    why: 'holds a regular expression — extract scans a stranger’s payload with one advancing index and compiles nothing (43 §8).',
  },
  {
    id: 'regexp-built',
    under: 'packages/extract/',
    re: /(?<![.\w])(?:new\s+)?RegExp\s*\(/g,
    why: 'builds a RegExp — extract scans a stranger’s payload with one advancing index and compiles nothing (43 §8).',
  },
];

/**
 * Blanked, not removed, so a line number still means the line it names.
 *
 * IT USED TO COLLAPSE A BLOCK COMMENT TO ONE SPACE, and every finding below the first one in a file
 * was reported at the wrong line — this file's own header is twenty lines, so a violation on line
 * forty-five came back as line fifteen. `graph.mjs` has always blanked; the two were written apart.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');

/** Comments go, always: a banned word inside prose is prose. */
const decomment = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])(\/\/.*)$/gm, (_, a, c) => a + blank(c));

/**
 * An `interface` body holds signatures and never statements, so a name in one is a DECLARATION.
 *
 * `37 §2.2`'s `Http` port has one method and it is called `fetch`, because a reader who knows what
 * `fetch` does knows what the port does minus what the adapter took away. Written as a method,
 * `fetch(url: URL, init: HttpInit)` matched the rule below exactly as a call would — so the gate
 * that exists to stop a package reaching the network reported the port whose whole purpose is that
 * it must not. Renaming the method would have been the gate choosing the vocabulary, which is `52
 * §9`'s subject from the other side.
 *
 * BALANCED BRACES, NOT A REGEX. A signature can carry an object type (`{ method: string }`), so the
 * body ends at the brace that closes it and nothing shorter. Run after the strings are blanked, so
 * a brace inside a string cannot move the end.
 *
 * ONLY FOR THE IDENTIFIER RULES. `type X = import('node:crypto').Hash` is a runtime edge written in
 * a type position, and blanking types for the string rules would hide it.
 */
const dedeclare = (text) => {
  let out = '';
  let at = 0;
  for (const hit of text.matchAll(/\binterface\s+[A-Za-z_$][\w$]*[^{;]*\{/gu)) {
    if (hit.index < at) continue; // an interface nested inside one already blanked
    const open = hit.index + hit[0].length;
    let depth = 1;
    let i = open;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') depth -= 1;
      i += 1;
    }
    out += text.slice(at, open) + blank(text.slice(open, i));
    at = i;
  }
  return out + text.slice(at);
};

/**
 * STRINGS ARE ONLY BLANKED FOR THE IDENTIFIER RULES, and getting that backwards is how the first
 * version of this gate passed a file importing `node:fs`: an import specifier IS a string literal,
 * so blanking every string blanked the thing being looked for. `fetch(` and `Buffer.` are
 * identifiers and must not be found inside a sentence; `node:fs` is a string and lives only there.
 */
const destring = (text) =>
  text
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (skipDir(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|mjs|js)$/.test(name) && !name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const packages = readdirSync(join(root, 'packages')).filter((p) => {
  try {
    return statSync(join(root, 'packages', p, 'src')).isDirectory();
  } catch {
    return false;
  }
});

const findings = [];
let scanned = 0;

for (const pkg of packages)
  for (const file of walk(join(root, 'packages', pkg, 'src'))) {
    scanned++;
    const rel = relative(root, file).replace(/\\/g, '/');
    const bare = decomment(readFileSync(file, 'utf8'));
    const stripped = dedeclare(destring(bare));
    for (const rule of BANNED) {
      /* A RULE MAY BE SCOPED TO A PATH, and one is. Everything above holds under every package's
         `src`; `under` is for a ban that belongs to one package's job rather than to the stack
         (`31 §3` layer 4). */
      if (rule.under !== undefined && !rel.startsWith(rule.under)) continue;
      const text = rule.strings ? bare : stripped;
      /* EVERY HIT, NOT THE FIRST. `exec` once per rule per file named one line and stopped, so a
         file with four `node:` imports was reported as having one — and the three below it were
         found on the next run, after the first was fixed. A gate that names one problem when there
         are four costs four runs, which is the argument the runner above it is built on. */
      rule.re.lastIndex = 0;
      for (const hit of text.matchAll(rule.re)) {
        const line = text.slice(0, hit.index).split('\n').length;
        findings.push({
          file: `${rel}:${line}`,
          why: rule.why.replace('$1', hit[1] ?? ''),
        });
      }
    }
  }

if (findings.length) {
  console.log('');
  for (const f of findings) console.log(`  ${f.file}\n      ${f.why}\n`);
}
console.log(`  stack: ${scanned} files across ${packages.length} packages, ${findings.length} finding(s)`);
if (findings.length) process.exitCode = 1;
