/**
 * `no-login`: nothing BrainDog runs on a person's machine names an agent app's own login, except to refuse it
 * (`docs/48-SPEC-CLI.md` §8).
 *
 *   node tools/gates/no-login.mjs [root]
 *
 * HIS LINE IS THAT NO CLAUDE OR CLAUDE.AI LOGIN IS HELD, READ OR MOVED (`docs/26-BYO-INTELLIGENCE.md` §3: "may not
 * collect, store, or intermediate"). Claude Code keeps a profile's login in the keychain item `Claude Code-credentials`
 * (as `claudeAiOauth`, beside the MCP sign-ins) or in the profile's `.credentials.json`, and Codex keeps its own in
 * `auth.json`. A setup sync carries sign-ins from machine to machine, and naming one of these is the first step of
 * reading it, so the name alone is the finding, as `no-transcript` finds a transcript by its field's name.
 *
 * WHAT A NAME IS, a line at a time, comments blanked (`blankComments`, as `no-transcript` reads them) and a regular
 * expression's escapes taken out, so `credentials\.json` is read as the name it matches:
 *   - `Claude Code-credentials`, the keychain item, with or without the hash a profile's own item adds;
 *   - `credentials.json`, a profile's login file, with or without its dot;
 *   - `claudeAiOauth`, the login inside the item;
 *   - `auth.json`, Codex's login file.
 *
 * EXCEPT IN A REFUSAL LIST: the whole of a top-level `const` that `ALLOWED` names by file and name, with why. Anywhere
 * else in code, a function's body included, the name is a finding. A test may name them, to prove they are refused. A
 * list `ALLOWED` names that is no longer in its file, or names none of them, is a finding too, so the list only shrinks
 * (`ledger.json`, `no-login.ALLOWED`).
 *
 * WHERE: what `no-transcript` reads, the command and its hook scripts (`apps/cli/src`, `apps/cli/hooks`), every
 * package's source and `packs/`, which is everything that runs on the machine or ships to one.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blankComments } from './no-transcript.mjs';
import { filesOf, textOf } from './public-clean.mjs';

/** What is read: the command, its hook scripts, every package's source, and the packs. */
const WHERE = /^(?:apps\/cli\/(?:src|hooks)\/|packages\/[^/]+\/src\/|packs\/)/u;
const SOURCE = /\.(?:[cm]?[jt]s|svelte|sh|ps1)$/u;
/** The exit of a gate that could not run, which is no pass. */
const COULD_NOT_RUN = 3;
const isTest = (rel) => /\.test\.[cm]?[jt]s$/u.test(rel) || /(?:^|\/)(?:tests?|fixtures)\//u.test(rel);

/** Each name, and the words its finding says. */
export const NAMES = [
  { re: /Claude Code-credentials/iu, says: "names Claude Code's login in the keychain" },
  { re: /credentials\.json/iu, says: "names Claude Code's login file" },
  { re: /claudeAiOauth/iu, says: 'names the claude.ai login inside Claude Code\'s keychain item' },
  { re: /\bauth\.json\b/iu, says: "names Codex's login file" },
];

/**
 * THE REFUSAL LISTS, each a top-level `const` of data by its file and name, and why it names them. Held on the ledger:
 * a list may come off, and one is added only with a line there.
 */
export const ALLOWED = [
  { file: 'apps/cli/src/sync.ts', name: 'SIGN_IN_FILE', why: 'the files sync inventory refuses to carry, a sign-in among them, by name alone' },
  { file: 'apps/cli/src/sync.ts', name: 'SIGN_INS', why: "a Claude Code profile's and Codex's sign-in, which sync inventory sizes by stat and refuses, never opened" },
];

/** A declaration at the top of a module, by its keyword and name. */
const DECLARATION = /^(?:export\s+)?(?:declare\s+)?(?:async\s+)?(const|let|var|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/u;
/** A string literal, taken out before brackets are counted, so a bracket inside one is not counted. */
const STRING = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/gu;
const balance = (line) => {
  const bare = line.replace(STRING, "''");
  return (bare.match(/[({[]/gu)?.length ?? 0) - (bare.match(/[)}\]]/gu)?.length ?? 0);
};

/**
 * Each line of a file that names a login outside a refusal list, as `{ line, says }`, and the refusal lists it holds
 * that name one. A declaration's span runs from its line to the line its brackets close on, so a statement after it is
 * not inside it.
 */
export function loginNames(text, rel) {
  const found = [];
  const lists = new Set();
  let span = null;
  blankComments(text, rel)
    .split('\n')
    .forEach((line, i) => {
      const declared = span === null ? DECLARATION.exec(line) : null;
      if (declared) span = { kind: declared[1], name: declared[2], depth: 0 };
      const hit = NAMES.find((n) => n.re.test(line.replaceAll('\\', '')));
      if (hit) {
        const listed = span !== null && span.kind === 'const' && ALLOWED.some((a) => a.file === rel && a.name === span.name);
        if (listed) lists.add(span.name);
        else found.push({ line: i + 1, says: hit.says });
      }
      if (span !== null) {
        span.depth += balance(line);
        if (span.depth <= 0) span = null;
      }
    });
  return { found, lists };
}

export default function noLogin(root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')) {
  const ROOT = resolve(root);
  const all = existsSync(ROOT) ? filesOf(ROOT) : null;
  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is "could not run". */
  if (all === null || all.length === 0) {
    console.log(`  no-login: no file to read under ${ROOT}`);
    return COULD_NOT_RUN;
  }
  const files = all.filter((rel) => WHERE.test(rel) && SOURCE.test(rel) && !isTest(rel));
  if (files.length === 0) {
    console.log(`  no-login: nothing the command, a package or a pack runs, under ${ROOT}`);
    return COULD_NOT_RUN;
  }
  const findings = [];
  const held = new Map();
  for (const rel of files) {
    const text = textOf(ROOT, rel);
    if (text === null) continue;
    const { found, lists } = loginNames(text, rel);
    for (const { line, says } of found) findings.push(`  ${rel}:${String(line)} ${says}`);
    held.set(rel, lists);
  }
  for (const a of ALLOWED)
    if (!held.get(a.file)?.has(a.name)) findings.push(`  ${a.file} holds no refusal list ${a.name} naming a login, so no-login.mjs no longer allows one: take it off ALLOWED.`);
  if (findings.length === 0) {
    console.log(`  no-login: ${String(files.length)} file(s), ${String(ALLOWED.length)} refusal list(s), 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  no-login: ${String(files.length)} file(s), ${String(findings.length)} finding(s).\n` +
      "  An agent app's own login is never held, read or moved by anything BrainDog runs: it is named only in a list\n" +
      '  of what is refused.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = noLogin(process.argv[2]) ?? 0;
