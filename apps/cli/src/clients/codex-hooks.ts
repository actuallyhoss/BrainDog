/**
 * BrainDog's hooks in Codex: what `setup` and `env apply` write so a Codex session hears what he tells it in BrainDog
 * (agents and MCP plan §2.3), beside the `braindog` MCP server `codex.ts` writes.
 *
 * WHAT CODEX OFFERS, FROM ITS OWN DOCUMENTS (developers.openai.com/codex, config and AGENTS.md pages): `notify`, a key at
 * the top of `config.toml` naming a program and its arguments, which Codex runs after each turn with the turn as one
 * JSON argument; and `AGENTS.md` in its folder, the instructions every session reads before its first turn. Codex has
 * no hook that puts words in front of the model on a prompt, or denies a tool, as Claude Code's do. So a Codex session
 * hears him three ways: the first `context` of a session, the line the record adds to any BrainDog answer, and its own
 * `instructions` call, which this block asks for at the start of every turn. A stop holds at the record, which refuses
 * a stopped run's writes; Codex keeps working on files until its next BrainDog call, and the app says so.
 *
 * NOT CONFIRMED, AND NOT WRITTEN: Codex's own hook settings, said to have come in a later release behind a switch.
 * Codex was not installed where this was written, so nothing here was run against a real one, and nothing is written
 * that only such a release would read.
 *
 * THE TURN END (`notify`) is the inbox reader's (`notifyHook` in `inbox-file.ts`): when a turn ends and the run has not
 * taken something he told it, the person at the machine is told once.
 *
 * TWO MARKED BLOCKS, AND EVERY OTHER BYTE IS HIS:
 *   - `config.toml`: the `notify` line between two comment lines, at the top of the file, since a key below a `[table]`
 *     header belongs to that table. A later run takes the block out and puts it back at the top, and the file is read
 *     back as TOML and must hold exactly that `notify`, or nothing is written. A `notify` of his own outside the block
 *     is left, and the line says the turn end is off; the block is taken out then, since two would not load.
 *   - `AGENTS.md`: BrainDog's instructions between two comment lines, at the end, replaced where they stand.
 *
 * Each is written whole or not at all, with a copy kept first (`keepCopy`), as every file setup changes.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { inboxEntryIn } from '../inbox-file.ts';
import { keepCopy } from '../install.ts';
import { codexHome, parseToml, tomlString } from './codex.ts';

type Env = Record<string, string | undefined>;

/** The two comment lines BrainDog's `notify` stands between in Codex's `config.toml`. */
export const NOTIFY_START = "# braindog: the notify line below is BrainDog's, and braindog setup writes it. The rest of this file is yours.";
export const NOTIFY_END = "# braindog: end of BrainDog's lines.";

/** The two lines BrainDog's block in Codex's `AGENTS.md` starts and ends with. */
export const AGENTS_START = "<!-- braindog: what BrainDog asks of every Codex session. braindog setup writes this block; the rest of the file is yours. -->";
export const AGENTS_END = "<!-- braindog: end of BrainDog's block. -->";

/** What every Codex session is asked, in the words the record's own MCP instructions use. */
export const AGENTS_BLOCK = [
  '## BrainDog',
  '',
  "BrainDog is the person's record of their work, served to you as the `braindog` MCP server.",
  '',
  "- Start each task with BrainDog's `context` tool. It names your run, the project, the next step and anything they told you.",
  '- At the start of each turn, call `instructions`. When they told you something, take it, do it, and reply with what you did, or that it needs them.',
  '- A BrainDog answer can end with a line from them. Act on it first. When they stopped this run, reply and end; when they paused it, wait.',
  '- A key or a token never goes in a BrainDog call. A key goes into the vault with `braindog keys put <label>`, which reads standard input.',
].join('\n');

/** The program Codex runs after each turn: the inbox reader from the folder of hook scripts, with `notify`. */
export const notifyArgv = (scripts: string): string[] => ['node', inboxEntryIn(scripts).replaceAll('\\', '/'), 'notify'];

/** Where each line stands on a line of its own: the index of its first character, or -1. */
function lineAt(text: string, line: string, from = 0): number {
  for (let at = text.indexOf(line, from); at >= 0; at = text.indexOf(line, at + 1)) {
    const starts = at === 0 || text[at - 1] === '\n';
    const next = text.slice(at + line.length, at + line.length + 2);
    if (starts && (next === '' || next.startsWith('\n') || next === '\r\n')) return at;
  }
  return -1;
}

/** The end of the line that starts at `at`, past its line break. */
const lineEnd = (text: string, at: number): number => {
  const nl = text.indexOf('\n', at);
  return nl < 0 ? text.length : nl + 1;
};

/** What a write would leave a file holding, or why it is left as it is. `left` may come with a `text` too. */
export type Next = { text: string | null; left: string | null };

const same = (a: unknown, b: readonly string[]): boolean => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Codex's `config.toml` with BrainDog's `notify` block at its top, every other byte as it was. `null` text is no file.
 * `left` says why nothing of BrainDog's is there after: the file is not TOML, or he runs a `notify` of his own.
 */
export function withNotify(text: string | null, argv: readonly string[]): Next {
  const had = text ?? '';
  const nl = had.includes('\r\n') ? '\r\n' : '\n';
  /* HIS FILE WITHOUT BRAINDOG'S BLOCK, and the blank line the block was written with. */
  let rest = had;
  const start = lineAt(had, NOTIFY_START);
  if (start >= 0) {
    const end = lineAt(had, NOTIFY_END, start + NOTIFY_START.length);
    if (end < 0) return { text, left: "Codex's config.toml holds the start of BrainDog's block and no end, so it is left as it is." };
    let after = lineEnd(had, end);
    if (had.startsWith(nl, after)) after += nl.length;
    rest = had.slice(0, start) + had.slice(after);
  }
  let theirs: ReturnType<typeof parseToml>;
  try {
    theirs = parseToml(rest);
  } catch (e) {
    /* The parser's sentence names a line and never quotes the text, which can hold keys. */
    return { text, left: `Codex's config.toml could not be read as TOML (${e instanceof Error ? e.message : 'unreadable'}), so it is left as it is.` };
  }
  if (theirs.data.notify !== undefined)
    return {
      text: rest === had ? text : rest,
      left: `Codex's config.toml runs a notify program of yours, so BrainDog's turn end is not added there${rest === had ? '' : ", and BrainDog's block was taken out, since two would not load"}.`,
    };
  const block = [NOTIFY_START, `notify = [${argv.map(tomlString).join(', ')}]`, NOTIFY_END].join(nl) + nl;
  const next = rest === '' ? block : `${block}${nl}${rest}`;
  try {
    if (same(parseToml(next).data.notify, argv)) return { text: next, left: null };
  } catch {
    /* Read back below as not placed. */
  }
  return { text, left: "BrainDog's turn end could not be placed in Codex's config.toml so that it reads back, so the file is left as it is." };
}

/**
 * Codex's `AGENTS.md` with BrainDog's block: replaced where it stands, or added at the end after a blank line. `null`
 * text is no file. A start with no end is left, and said.
 */
export function withAgents(text: string | null, body: string = AGENTS_BLOCK): Next {
  const had = text ?? '';
  const eol = had.includes('\r\n') ? '\r\n' : '\n';
  const block = [AGENTS_START, ...body.split('\n'), AGENTS_END].join(eol);
  const start = lineAt(had, AGENTS_START);
  if (start < 0) return { text: had === '' ? `${block}${eol}` : `${had}${had.endsWith('\n') ? '' : eol}${eol}${block}${eol}`, left: null };
  const end = lineAt(had, AGENTS_END, start + AGENTS_START.length);
  if (end < 0) return { text, left: "Codex's AGENTS.md holds the start of BrainDog's block and no end, so it is left as it is." };
  return { text: `${had.slice(0, start)}${block}${had.slice(end + AGENTS_END.length)}`, left: null };
}

/** One of Codex's files as a run would write it: where, what it holds now (`null` for none), and what it would hold. */
export type CodexWrite = { file: string; label: string; before: string | null; text: string };

/** What a run would do in Codex: the plan's lines, the files it would write, and what it leaves and why. */
export type CodexPlan = { lines: string[]; writes: CodexWrite[]; left: string[]; notify: string[] };

const read = (file: string): string | null => (existsSync(file) ? readFileSync(file, 'utf8') : null);

/** What `setup` and `env apply` would write in Codex's folder, read from the files as they are now. Writes nothing. */
export function planCodexHooks(o: { home: string; env: Env; scripts: string }): CodexPlan {
  const folder = codexHome(o.home, o.env);
  const argv = notifyArgv(o.scripts);
  const lines: string[] = [];
  const writes: CodexWrite[] = [];
  const left: string[] = [];
  const config = join(folder, 'config.toml');
  const now = read(config);
  const notify = withNotify(now, argv);
  if (notify.left !== null) left.push(notify.left);
  if (notify.text !== null && notify.text !== now) {
    writes.push({ file: config, label: '~/.codex/config.toml', before: now, text: notify.text });
    if (notify.left === null) lines.push(`  ${now !== null && lineAt(now, NOTIFY_START) >= 0 ? '~' : '+'} notify in ~/.codex/config.toml: ${JSON.stringify(argv)}`);
    else lines.push("  - BrainDog's notify block in ~/.codex/config.toml");
  }
  const agentsFile = join(folder, 'AGENTS.md');
  const had = read(agentsFile);
  const agents = withAgents(had);
  if (agents.left !== null) left.push(agents.left);
  else if (agents.text !== null && agents.text !== had) {
    writes.push({ file: agentsFile, label: '~/.codex/AGENTS.md', before: had, text: agents.text });
    lines.push(`  ${had !== null && lineAt(had, AGENTS_START) >= 0 ? '~' : '+'} BrainDog's block in ~/.codex/AGENTS.md, asking each session to read context first and instructions each turn`);
  }
  return { lines, writes, left, notify: argv };
}

/**
 * One file written whole or not at all: it must still hold what the plan read, a copy is kept before its first change
 * this run, the text goes to `<file>.tmp` with the file's own mode and is renamed into place, and it is read back. The
 * line saying what happened, and whether it was written.
 */
function writeOne(w: CodexWrite, copied: Set<string>): { line: string | null; written: boolean } {
  const now = read(w.file);
  if (now !== w.before) return { line: `${w.label} changed while it was being read, so it was not written. Run it again.`, written: false };
  if (now === w.text) return { line: null, written: true };
  let kept: string | null = null;
  if (now !== null && !copied.has(w.file)) {
    try {
      kept = keepCopy(w.file);
      copied.add(w.file);
    } catch {
      return { line: `A copy of ${w.label} could not be kept first, so it was not written.`, written: false };
    }
  }
  const tmp = `${w.file}.tmp`;
  try {
    const mode = now !== null ? statSync(w.file).mode & 0o777 : 0o600;
    if (now === null) mkdirSync(dirname(w.file), { recursive: true });
    if (existsSync(tmp)) unlinkSync(tmp);
    writeFileSync(tmp, w.text, { mode });
    chmodSync(tmp, mode);
    renameSync(tmp, w.file);
  } catch {
    if (existsSync(tmp)) unlinkSync(tmp);
    return { line: `${w.label} could not be written, so it is as it was.`, written: false };
  }
  if (read(w.file) !== w.text) {
    if (now === null) unlinkSync(w.file);
    else writeFileSync(w.file, now);
    return { line: `${w.label} did not read back as written, so it was put back as it was.`, written: false };
  }
  copied.add(w.file);
  return { line: kept === null ? null : `${w.label} as it was is kept beside it as ${basename(kept)}.`, written: true };
}

/** The plan's files written, each whole or not at all. Its lines, and whether every one was written. */
export function applyCodexHooks(plan: CodexPlan, copied: Set<string>): { lines: string[]; written: boolean } {
  const lines: string[] = [];
  let written = true;
  for (const w of plan.writes) {
    const done = writeOne(w, copied);
    if (done.line !== null) lines.push(done.line);
    if (!done.written) written = false;
  }
  return { lines, written };
}
