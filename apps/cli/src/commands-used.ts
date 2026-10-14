/**
 * The command lines a project is worked with, as its own Claude Code settings name them (AGT-D10 job 5, its settings
 * half). His words: "Every MCP server, CLI and integration an agent uses is recorded with:" (D0.41).
 *
 * ONLY THE PROJECT'S SETTINGS ARE READ. The scope also counts the shell calls in the session's own log, three or more
 * a program; his rule "transcripts never read" (AGT-B10 job 4) wins over it, so that half is not built, and
 * `tools/gates/no-transcript.mjs` is red on any line here that opens one. What is read is `permissions.allow` in the
 * project's `.claude/settings.json` and `.claude/settings.local.json`, where an entry such as `Bash(wrangler:*)` says
 * the project lets an agent run that program by name.
 *
 * ONLY A PROGRAM'S NAME LEAVES THE MACHINE. An entry is the start of a command line and may hold anything typed after
 * it: an argument, a path, a token in a variable. Each is dropped here, and a name that does not look like a program's
 * is not kept, so what is sent is a short list of words such as `wrangler` and `gh`.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** At most this many programs a project, the scope's "Ten at most a session". */
export const COMMANDS_MAX = 10;

/** The same list is sent at most once a day for a folder. */
export const COMMANDS_EVERY_MS = 24 * 3_600_000;

/** Where they were read from, in words, as the record shows it beside the row. */
export const SETTINGS_SOURCE = "this project's Claude Code settings";

/** The two files read, under the project's folder. */
export const SETTINGS_FILES = ['settings.json', 'settings.local.json'] as const;

/* A settings file is a few kilobytes; one far past that is not one this reads. */
const SETTINGS_MAX_BYTES = 256 * 1024;

/**
 * Shell words and core utilities, which say nothing about how a project is worked: never kept. `git`, `node`, `npm`
 * and `pnpm` are here too, because nearly every project allows them.
 */
export const NEVER_KEPT: ReadonlySet<string> = new Set(
  (
    'cd ls cat echo grep rg sed awk head tail find xargs mkdir rm cp mv touch chmod test true false export source which ' +
    'sort uniq wc tr cut printf sleep kill ps pwd date diff tee jq curl git node npm pnpm python bash sh zsh'
  ).split(' '),
);

/* Words that run the next word, which is the program. */
const WRAPPERS: ReadonlySet<string> = new Set(['sudo', 'env', 'time']);
/* Runners whose next word is a package, and for pnpm the words that make it one. */
const RUNNERS: ReadonlySet<string> = new Set(['npx', 'bunx', 'uvx']);
const PNPM_RUNS: ReadonlySet<string> = new Set(['exec', 'dlx']);

/* A variable set before the command, `NAME=value`, whose value is never read. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;
/* A program's name: a word, or a scoped package. Nothing with a quote, a `$`, an `=` or a space. */
const NAME = /^(?:@[a-z0-9][\w.-]*\/)?[A-Za-z0-9][\w.+-]{0,39}$/u;
/* A long run of letters and digits with no break is a token, not a program: never sent, whatever it is. */
const TOKEN_LIKE = /[A-Za-z0-9]{24,}/u;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A package as a runner names it, without its version: `vitest@2` is `vitest`, `@scope/x@1` is `@scope/x`. */
const unversioned = (word: string): string => (word.startsWith('@') ? word.replace(/^(@[^/@]+\/[^@]+)@.*$/u, '$1') : word.replace(/@.*$/u, ''));

/** A path's last part, either slash. */
const lastPart = (word: string): string => word.split(/[\\/]/u).filter(Boolean).pop() ?? '';

/** The words of one command, wrappers and variables passed, with the flags a wrapper or runner takes before its word. */
function programOf(words: readonly string[]): string | null {
  let i = 0;
  const skipFlags = () => {
    while (i < words.length && words[i]!.startsWith('-')) i += 1;
  };
  for (;;) {
    while (i < words.length && ASSIGNMENT.test(words[i]!)) i += 1;
    const word = words[i];
    if (word === undefined) return null;
    if (!WRAPPERS.has(lastPart(word))) break;
    i += 1;
    skipFlags();
  }
  const first = lastPart(words[i]!);
  if (RUNNERS.has(first) || (first === 'pnpm' && PNPM_RUNS.has(words[i + 1] ?? ''))) {
    i += first === 'pnpm' ? 2 : 1;
    skipFlags();
    const pkg = words[i];
    if (pkg === undefined) return null;
    return pkg.startsWith('@') ? unversioned(pkg) : lastPart(unversioned(pkg));
  }
  return first;
}

/** The programs one `Bash(...)` entry allows: one a command, for an entry that joins several with `&&`, `;` or `|`. */
export function programsOf(entry: string): string[] {
  const inner = /^Bash\((.*)\)$/su.exec(entry.trim())?.[1];
  if (inner === undefined) return [];
  /* `Bash(wrangler:*)` and `Bash(wrangler *)` both mean any line that starts with the word. */
  const line = inner.replace(/:\*\s*$/u, ' ');
  const out: string[] = [];
  for (const part of line.split(/&&|\|\||[;|]/u)) {
    const name = programOf(part.trim().split(/\s+/u).filter(Boolean));
    if (name !== null && NAME.test(name) && !TOKEN_LIKE.test(name) && !NEVER_KEPT.has(name)) out.push(name);
  }
  return out;
}

/**
 * The programs a project's settings allow by name, in the order the files name them, each once, ten at most. A file
 * that is not an object, or whose `permissions.allow` is not a list, is skipped; an entry that is not a string too.
 */
export function allowedPrograms(settings: readonly unknown[]): string[] {
  const kept: string[] = [];
  for (const file of settings) {
    if (!isObject(file) || !isObject(file.permissions) || !Array.isArray(file.permissions.allow)) continue;
    for (const entry of file.permissions.allow) {
      if (typeof entry !== 'string') continue;
      for (const name of programsOf(entry)) {
        if (kept.length >= COMMANDS_MAX) return kept;
        if (!kept.includes(name)) kept.push(name);
      }
    }
  }
  return kept;
}

/** A command line as `toolsSeen` is handed it: its name, and nothing else of what the settings said. */
export type FoundCommand = { name: string; kind: 'cli'; scope: 'project'; command: string; needs: string[]; source: string };

/** The programs as `toolsSeen`'s `found`, by name only. */
export const usedTools = (names: readonly string[]): FoundCommand[] =>
  names.map((name) => ({ name, kind: 'cli', scope: 'project', command: name, needs: [], source: SETTINGS_SOURCE }));

/** The project's two settings files, parsed, the ones that are there and read whole. Never throws. */
export function readAllowed(folder: string): unknown[] {
  const out: unknown[] = [];
  for (const name of SETTINGS_FILES) {
    const file = join(folder, '.claude', name);
    try {
      if (statSync(file).size > SETTINGS_MAX_BYTES) continue;
      out.push(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      /* Missing, unreadable or not JSON: that file says nothing. */
    }
  }
  return out;
}

/** What a folder's session file remembers of the last list sent: the names, and when. */
export type SentCommands = { names: string[]; at: string };

/** Whether this list is owed: there is one, and it is not the one sent within the day. */
export function owedCommands(names: readonly string[], sent: SentCommands | undefined, now: number): boolean {
  if (names.length === 0) return false;
  if (sent === undefined) return true;
  const same = sent.names.length === names.length && [...sent.names].sort().join('\n') === [...names].sort().join('\n');
  return !same || now - Date.parse(sent.at) >= COMMANDS_EVERY_MS || Number.isNaN(Date.parse(sent.at));
}

/** A session file's `commands`, kept only when it is names and a time this command wrote. */
export function sentOf(x: unknown): SentCommands | undefined {
  if (!isObject(x) || !Array.isArray(x.names) || typeof x.at !== 'string' || Number.isNaN(Date.parse(x.at))) return undefined;
  const names = x.names.filter((n): n is string => typeof n === 'string' && NAME.test(n)).slice(0, COMMANDS_MAX);
  return { names, at: x.at };
}
