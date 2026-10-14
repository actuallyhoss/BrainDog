/**
 * Claude Code, as the clients table holds it: where it keeps servers, the reader, and the writer, moved here from
 * `tools.ts` with no change in what they read or write.
 *
 * TWO FILES ARE READ. `<top-level>/.mcp.json` is the repository's, and `~/.claude.json` is the person's: its
 * `mcpServers` are global and its `projects[<path>].mcpServers` are this project's. A write never edits either by
 * hand: it goes through `claude mcp add-json` (and `claude mcp remove` first, for a replaced entry), user scope into
 * `~/.claude.json` and project scope into `.mcp.json`.
 *
 * A COPY BEFORE THE FIRST CHANGE (AGT-A07 build 3). The file a run's first write changes is copied beside itself
 * first, by install's `keepCopy`: `<file>.pre-braindog` the first time, then `<file>.bak`, `<file>.bak1` and on, so an
 * earlier copy is never written over. A copy that cannot be made keeps the entry out.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { keepCopy } from '../install.ts';
import { isObject, samePath } from '../skills.ts';
import { onPath, type Client, type Env, type Plan, type Runner, type ServerSet } from './index.ts';

/** Run `claude` with these arguments in this folder, and settle with its exit code, or -1 when it did not start. */
export type ClaudeRunner = Runner;

/**
 * The real one. NO SHELL, so the JSON argument is passed as it is, and its output is not relayed, because
 * `claude mcp remove` may describe the entry it removed, and an entry the scan read can hold a key.
 */
export const runClaude: ClaudeRunner = (args, cwd) =>
  new Promise((done) => {
    const child = spawn('claude', args, { cwd, stdio: 'ignore', shell: false, windowsHide: true });
    child.on('error', () => done(-1));
    child.on('exit', (code) => done(code ?? 1));
  });

/** A config file's JSON, `undefined` when there is none, and the sentence when it cannot be read. */
function readConfig(file: string, label: string): { json: Record<string, unknown> | undefined; fault: string | null } {
  if (!existsSync(file)) return { json: undefined, fault: null };
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (isObject(parsed)) return { json: parsed, fault: null };
  } catch {
    /* JSON.parse quotes the text around the fault, and the text holds keys. */
  }
  return { json: undefined, fault: `${label} is not valid JSON, so its servers were not read.` };
}

/** The reader, in precedence order: the repository's file, then the person's global servers, then this project's there. */
function servers(home: string, top: string | null, cwd: string = top ?? home): ServerSet[] {
  const sets: ServerSet[] = [];
  if (top !== null) {
    const file = join(top, '.mcp.json');
    const got = readConfig(file, file);
    sets.push({ scope: 'project', source: '.mcp.json', writes: 'project', servers: got.json?.mcpServers, fault: got.fault });
  }
  const got = readConfig(join(home, '.claude.json'), '~/.claude.json');
  sets.push({ scope: 'global', source: '~/.claude.json', writes: 'user', servers: got.json?.mcpServers, fault: got.fault });
  if (got.json !== undefined) {
    const here = [top, cwd].filter((p): p is string => p !== null).map(samePath);
    const projects = got.json.projects;
    const mine = Object.entries(isObject(projects) ? projects : {}).find(([path]) => here.includes(samePath(path)))?.[1];
    if (isObject(mine)) sets.push({ scope: 'project', source: '~/.claude.json', writes: null, servers: mine.mcpServers, fault: null });
  }
  return sets;
}

/**
 * Copy a file aside before this run first changes it, by install's `keepCopy` (its names, its mode, never over an
 * earlier copy): the copy's path, `null` when no copy is needed (there is no file yet, or it was copied already this
 * run), or `false` when the copy could not be made.
 */
function copyAside(file: string | null, copied: Set<string>): string | null | false {
  if (file === null || copied.has(file) || !existsSync(file)) return null;
  try {
    const to = keepCopy(file);
    if (to !== null) copied.add(file);
    return to;
  } catch {
    return false;
  }
}

const NOT_FOUND = 'claude was not found, so nothing was applied.';

export const claude: Client = {
  id: 'claude',
  title: 'Claude Code',

  found(home: string, env: Env): boolean {
    const profile = env.CLAUDE_CONFIG_DIR;
    return existsSync(join(home, '.claude')) || existsSync(join(home, '.claude.json')) || (profile !== undefined && profile !== '' && existsSync(profile)) || onPath('claude', env);
  },

  servers,

  plan(want): Plan {
    const file = want.scope === 'user' ? join(want.home, '.claude.json') : want.top === null ? null : join(want.top, '.mcp.json');
    const line = `${want.replace ? '~' : '+'} ${want.name} at ${want.scope} scope${want.replace ? ', replacing the entry there' : ''}: ${JSON.stringify(want.entry)}`;
    return { want, file, lines: [line] };
  },

  async apply(plan, { run, copied }) {
    const { name, scope, entry, replace, top, cwd } = plan.want;
    const at = scope === 'project' && top !== null ? top : cwd;
    const made = copyAside(plan.file, copied);
    if (made === false) return { lines: [`Tool ${name} was not written, because a copy of the file it goes into could not be kept first.`], written: false, stop: false };
    /* Nothing was changed after all, so the copy made for it goes too. */
    const unmade = () => {
      if (made === null || plan.file === null) return;
      try {
        unlinkSync(made);
        copied.delete(plan.file);
      } catch {
        /* A copy left behind is only a copy. */
      }
    };
    if (replace) {
      const removed = await run(['mcp', 'remove', name, '--scope', scope], at);
      if (removed === -1) {
        unmade();
        return { lines: [NOT_FOUND], written: false, stop: true };
      }
      if (removed !== 0) return { lines: [`claude mcp remove did not remove ${name} (exit ${String(removed)}), so it is left.`], written: false, stop: false };
    }
    const added = await run(['mcp', 'add-json', name, JSON.stringify(entry), '--scope', scope], at);
    if (added === -1) {
      if (!replace) unmade();
      return { lines: [NOT_FOUND], written: false, stop: true };
    }
    if (added !== 0) return { lines: [`claude mcp add-json did not add ${name} (exit ${String(added)}), so it is left.`], written: false, stop: false };
    return { lines: [`Tool ${name} ${replace ? 'replaced' : 'added'} at ${scope} scope.`], written: true, stop: false };
  },

  remove: (name, scope) => `claude mcp remove ${name} --scope ${scope}`,
};
