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
 * `test/` IS EXEMPT AND THAT IS THE POINT. The adapter that binds the kernel to `node:sqlite` lives
 * there, on the other side of the line: it is allowed to know exactly which runtime it is in, and
 * the kernel is not allowed to ask.
 *
 * The web app is not in scope — it is a browser bundle and answers to the bundle gate instead.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
];

/** Comments go, always: a banned word inside prose is prose. */
const decomment = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

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
    if (name === 'node_modules' || name === '.svelte-kit' || name === 'build') continue;
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
    const bare = decomment(readFileSync(file, 'utf8'));
    const stripped = destring(bare);
    for (const rule of BANNED) {
      const text = rule.strings ? bare : stripped;
      /* EVERY HIT, NOT THE FIRST. `exec` once per rule per file named one line and stopped, so a
         file with four `node:` imports was reported as having one — and the three below it were
         found on the next run, after the first was fixed. A gate that names one problem when there
         are four costs four runs, which is the argument the runner above it is built on. */
      rule.re.lastIndex = 0;
      for (const hit of text.matchAll(rule.re)) {
        const line = text.slice(0, hit.index).split('\n').length;
        findings.push({
          file: `${relative(root, file).replace(/\\/g, '/')}:${line}`,
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
