#!/usr/bin/env node
/**
 * `braindog` as one file: `src/main.ts` and everything it imports, bundled into `dist/braindog.mjs` (48 §3, §13 D4).
 *
 *   pnpm --filter braindog-cli build
 *
 * WHY A BUNDLE AND NOT THE SOURCES. Node strips types from a `.ts` file it is asked to run, but refuses to under
 * `node_modules`, and the CLI imports workspace packages that are TypeScript all the way down. A person with Node and
 * no checkout can run one JavaScript file, so that is what this makes, and what `brain.dog/cli/` serves. The tests keep
 * running the `.ts` sources directly; this file is only ever the published artefact.
 *
 * THE BUILD TUPLE IS `<yyyy.mm.dd>+<sha7>`, the shape the Worker answers at `/.well-known/braindog-build`, and it is
 * what `braindog --version` prints first. The deploy sets `BRAINDOG_BUILD` once for its whole job and this reads it, so
 * the CLI the site serves and the Worker deployed beside it name the same build. Run by hand, the date is today's in
 * UTC and the commit is the one `git` names, as the deploy computes it. A tree `git` cannot name is refused rather than
 * given a made-up commit, because a version exists to be believed; a checkout run of `main.ts` already says
 * `dev+0000000`, and that is the only build without a commit.
 *
 * THE HASHBANG IS THE ENTRY'S OWN. `src/main.ts` opens with `#!/usr/bin/env node`, and esbuild keeps an entry's hashbang
 * as the first line of its output, so the `--banner:js` that 48 §3 writes would sit beside a second one. The first line
 * is checked after the build rather than trusted, and put in when it is missing, so the file runs as `./braindog.mjs`
 * on a system that reads hashbangs whichever way esbuild behaves.
 *
 * THE COMMAND'S OWN PATH IS THE BUNDLE'S. `install`, `login` and `tools` write lines that run this command again (the
 * MCP server `install` registers, the sign-in line `login` prints, the key helper `tools` renders), and they find it as
 * `new URL('./main.ts', import.meta.url)`, which in a checkout is the entry beside them. In the bundle every module is
 * this one file and there is no `main.ts` beside it, so that expression is rewritten to `new URL(import.meta.url)`, the
 * bundle itself, as each source under `src/` is loaded. The output is then held to it: a spelling the rewrite missed
 * would leave a registration naming a file that does not exist, so it stops the build instead.
 *
 * AND ITS SHA-256 BESIDE IT, as `<hex>  braindog.mjs`, the line `sha256sum -c` reads. The install scripts hold every
 * download to it. It is served from the same place as the file, so it catches a download cut short or altered on the
 * way; it does not defend against someone able to change what the site serves, who could change both.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const OUT = fileURLToPath(new URL('../dist/braindog.mjs', import.meta.url));
const SUM = `${OUT}.sha256`;
const HASHBANG = '#!/usr/bin/env node\n';

/* The one spelling the sources use for their own entry, rewritten in the bundle for the reason THE COMMAND'S OWN PATH
   gives above. `ENTRY_LEFT` is any quoted `./main.ts` still in the output, whichever quotes esbuild printed. */
const ENTRY = "new URL('./main.ts', import.meta.url)";
const ENTRY_LEFT = /["'`]\.\/main\.ts["'`]/;

/** Rewrites `ENTRY` in the CLI's own sources as esbuild loads them; every other file loads as esbuild would load it. */
const ownEntry = {
  name: 'own-entry',
  setup(on) {
    on.onLoad({ filter: /\.ts$/ }, async (args) => {
      if (!args.path.startsWith(SRC)) return undefined;
      const text = await readFile(args.path, 'utf8');
      return { contents: text.replaceAll(ENTRY, 'new URL(import.meta.url)'), loader: 'ts' };
    });
  },
};

/* `git rev-parse --short=7` answers seven characters, or more when seven are ambiguous in the repository, and the
   deploy's own `BRAINDOG_BUILD` comes from the same command, so both lengths are a build. */
const TUPLE = /^\d{4}\.\d{2}\.\d{2}\+[0-9a-f]{7,40}$/;

const fail = (line) => {
  process.stderr.write(`${line}\n`);
  process.exit(1);
};

/** The build this file will say it is: the deploy's, when the deploy named one, or today's date and this commit. */
function stamp() {
  const given = process.env.BRAINDOG_BUILD;
  if (given) {
    if (!TUPLE.test(given)) fail(`BRAINDOG_BUILD is ${JSON.stringify(given)}, and a build is <yyyy.mm.dd>+<sha7>, as in 2026.09.25+1a2b3c4.`);
    return given;
  }
  let sha = '';
  try {
    sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    fail('The CLI is built from a git checkout, because its version names the commit it was built from, and git could not name one here.');
  }
  const at = `${new Date().toISOString().slice(0, 10).replaceAll('-', '.')}+${sha}`;
  if (!TUPLE.test(at)) fail(`git named the commit ${JSON.stringify(sha)}, which is not a short commit id, so the build cannot say which one it is.`);
  return at;
}

const tuple = stamp();

/* THE OLD PAIR GOES FIRST, so a build that fails leaves no file beside a checksum that was written for another. */
rmSync(OUT, { force: true });
rmSync(SUM, { force: true });

try {
  await build({
    absWorkingDir: ROOT,
    entryPoints: ['src/main.ts'],
    outfile: OUT,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    define: { __BUILD__: JSON.stringify(tuple) },
    // A COMMONJS DEPENDENCY STILL CALLS require() INSIDE AN ESM FILE. `yaml` asks for `process` that way, and esbuild's
    // shim throws "Dynamic require is not supported" unless a real `require` is in scope, so the bundle makes one.
    banner: { js: "import { createRequire as __braindogRequire } from 'node:module';\nconst require = __braindogRequire(import.meta.url);" },
    plugins: [ownEntry],
    logLevel: 'warning',
  });
} catch {
  /* esbuild has already printed each error with its file and line, at `logLevel`, so saying it again adds nothing. */
  fail('The CLI did not build; the errors above name each file and line.');
}

let text = readFileSync(OUT, 'utf8');
if (ENTRY_LEFT.test(text)) {
  rmSync(OUT, { force: true });
  fail(`The bundle still names ./main.ts, which does not exist beside it, so a command it registers would not run. Every source under src/ names its own entry as ${ENTRY}, the one spelling this build rewrites.`);
}
if (!text.startsWith('#!')) {
  text = HASHBANG + text;
  writeFileSync(OUT, text);
}
/* Executable, for the systems that run a file by its hashbang. Windows keeps no such bit and ignores this. */
chmodSync(OUT, 0o755);

const bytes = readFileSync(OUT);
const hex = createHash('sha256').update(bytes).digest('hex');
writeFileSync(SUM, `${hex}  braindog.mjs\n`);

process.stdout.write(`dist/braindog.mjs, build ${tuple}, ${bytes.length} bytes, sha256 ${hex}\n`);
