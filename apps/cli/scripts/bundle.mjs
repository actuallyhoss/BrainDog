#!/usr/bin/env node
/**
 * `braindog` as one file: `src/main.ts` and everything it imports, bundled into `dist/braindog.mjs` (48 §3, §13 D4).
 *
 *   pnpm --filter braindog-cli build
 *
 * IT IS ALSO WHAT npm SHIPS. `braindog-cli` is this workspace's name for the package, and npm's is `braindog` (the root
 * manifest holds that name here); `.github/workflows/tag.yml` builds with this file on a `cli-v*` tag and publishes
 * `dist/` under the npm name. There is no second bundler.
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
 *
 * AND ITS BUILD BESIDE IT, as `braindog.mjs.build`: one line, the tuple, and nothing else. `braindog update` reads it
 * first from the address the install script downloads from, so a command that is already the served build says so
 * without fetching the bundle, and one that is behind names the build it is about to become.
 *
 * AND NOT ITS SIGNATURE. `braindog.mjs.sig` is made at release by `tools/ship/cli-sign.mjs`, with a key this build never sees.
 *
 * AND THE HOOKS' OWN ENTRY INSIDE IT. The prompt, tool and stop hooks, and Codex's turn end, read one local file and
 * print; starting Node on the whole bundle for that cost 77 ms where the reader alone costs 20. So
 * `src/inbox-file.ts`, which imports nothing but Node's own modules, is built first on its own and defined into the
 * bundle as `__INBOX_HOOK__`, as the skill is, and the command writes it beside its hook scripts as
 * `braindog-inbox.mjs` (`hookScripts` in `main.ts`). One file is still all a machine downloads.
 *
 * AND dist/ IS A PACKAGE OF ITS OWN, so a publish by hand is one line: `npm publish apps/cli/dist`. The build writes
 * `dist/package.json` under the npm name (`NPM_NAME`, the name `tag.yml` publishes under), with this manifest's
 * version, licence and links, the bundle as its only file and no dependencies, and copies the README and LICENSE in.
 * The workspace's own manifest keeps its workspace name and its `workspace:*` tools, which never reach npm.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const OUT = fileURLToPath(new URL('../dist/braindog.mjs', import.meta.url));
const SUM = `${OUT}.sha256`;
const STAMP = `${OUT}.build`;
const SKILL = fileURLToPath(new URL('../../../skills/braindog/SKILL.md', import.meta.url));
const HASHBANG = '#!/usr/bin/env node\n';
/* The name npm knows the command by (`tag.yml` publishes `apps/cli` under it too). */
const NPM_NAME = 'braindog';
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

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

/* THE AGENT SKILL RIDES INSIDE THE BUNDLE. `install` places `skills/braindog/SKILL.md` in each profile, and a checkout
   reads it from the repository's root, but the bundle is one file on a machine with no checkout, so the text is
   defined into it as `__SKILL__`, exactly as the build is. A missing file stops the build rather than shipping an
   install with nothing to place. */
let skill = '';
try {
  skill = readFileSync(SKILL, 'utf8');
} catch {
  fail(`The Agent Skill is not at ${SKILL}, and the CLI carries it, so there is nothing to bundle.`);
}

/* THE HOOKS' ENTRY, built on its own (see the top). A module that came to import more than Node's own would make every
   hook start slow again, so its output is held to that: an import of anything but a `node:` module stops the build. */
let inboxHook = '';
try {
  const built = await build({
    absWorkingDir: ROOT,
    entryPoints: ['src/inbox-file.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'warning',
  });
  inboxHook = built.outputFiles[0]?.text ?? '';
} catch {
  fail('The hooks\' own entry did not build; the errors above name each file and line.');
}
if (inboxHook === '' || /^import\s.*from\s+["'](?!node:)/mu.test(inboxHook)) fail('The hooks\' own entry imports something other than Node\'s own modules, which every hook would then load.');

/* THE STATUS LINE'S ENTRY, built the same way and held to the same rule: Claude Code runs it on every redraw. */
let statusEntry = '';
try {
  const built = await build({ absWorkingDir: ROOT, entryPoints: ['src/statusline-entry.ts'], bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24', logLevel: 'warning' });
  statusEntry = built.outputFiles[0]?.text ?? '';
} catch {
  fail('The status line\'s own entry did not build; the errors above name each file and line.');
}
if (statusEntry === '' || /^import\s.*from\s+["'](?!node:)/mu.test(statusEntry)) fail('The status line\'s own entry imports something other than Node\'s own modules, which every redraw would then load.');

/* THE OLD THREE GO FIRST, so a build that fails leaves no file beside a checksum or a build written for another. */
rmSync(OUT, { force: true });
rmSync(SUM, { force: true });
rmSync(STAMP, { force: true });

try {
  await build({
    absWorkingDir: ROOT,
    entryPoints: ['src/main.ts'],
    outfile: OUT,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    define: { __BUILD__: JSON.stringify(tuple), __SKILL__: JSON.stringify(skill), __INBOX_HOOK__: JSON.stringify(inboxHook), __STATUSLINE_ENTRY__: JSON.stringify(statusEntry) },
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
writeFileSync(STAMP, `${tuple}\n`);
/* AN OLD SIGNATURE IS NOT THIS BUILD'S (`tools/ship/cli-sign.mjs` makes the new one, at release, and nothing here can). */
rmSync(`${OUT}.sig`, { force: true });

/* THE PUBLISHED MANIFEST (see the top): only what a person installing it needs, read from this workspace's manifest. */
const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const published = {
  name: NPM_NAME,
  version: own.version,
  description: own.description,
  license: own.license,
  type: 'module',
  homepage: own.homepage,
  repository: own.repository,
  bugs: own.bugs,
  keywords: own.keywords,
  bin: { braindog: 'braindog.mjs' },
  files: ['braindog.mjs'],
  engines: own.engines,
  publishConfig: own.publishConfig,
};
writeFileSync(`${DIST}package.json`, `${JSON.stringify(published, null, 2)}\n`);
copyFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), `${DIST}README.md`);
copyFileSync(fileURLToPath(new URL('../LICENSE', import.meta.url)), `${DIST}LICENSE`);

process.stdout.write(`dist/braindog.mjs, build ${tuple}, ${bytes.length} bytes, sha256 ${hex}\n`);
