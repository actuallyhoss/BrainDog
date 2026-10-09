/**
 * `braindog setup <url> [--dry-run | --yes]`: one command sets a machine up from the record.
 *
 * THE STEPS IN ORDER, EACH ONE ALREADY A COMMAND OF ITS OWN: sign in unless a live login for the host is held,
 * `install --apply` into the user profile, the `braindog` MCP server registered at user scope, `tools write --scope
 * user`, and `skills sync`. Each step prints one line saying what it did or found, with the lines its command would
 * print indented under it, and the run stops at the first step that fails, with that step's sentence. Nothing here
 * decides anything those commands do not already decide: this file only puts them in order and says so.
 *
 * A SECOND RUN CHANGES NOTHING AND SAYS SO. Every step reads before it writes: a login held is not asked for again,
 * hooks already in the settings are not added again, a registration that already runs this command is left, and
 * `tools write` and `skills sync` already write only what differs. When no step changed anything, the last line says
 * that.
 *
 * `--dry-run` WRITES NOTHING. No login is asked for, no file is written, `claude` is not run, and the record is only
 * read, and only when a login is already held to read it with.
 *
 * NOTHING AT PROJECT SCOPE. A project's `.mcp.json` is shared through its repository, so it is written only by `tools
 * write --scope project` typed by hand (question 5 of the agent path), and skills are synced here into the profile
 * alone. Both steps are run as if outside any repository for that reason.
 *
 * NO KEY AND NO TOKEN IS PRINTED OR WRITTEN BY THIS FILE. The login goes into the hosts file inside `login`, the MCP
 * entry holds a command and no `env`, and a tool's key is named by the command that opens it, never held.
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { hostKey, hostsPath, readHosts, sameHost, saveHosts, target } from './http.ts';
import { BRAINDOG_SERVER, HOOKS_HELD, installProfiles, PLACES_SKILL, profilesOf, serversFileOf } from './install.ts';
import { login } from './login.ts';
import { connect, isObject, syncSkills, type AgentIo } from './skills.ts';
import { runClaude, writeTools, type ClaudeRunner } from './tools.ts';

type Env = Record<string, string | undefined>;

/** What `setup` needs from its process, passed in so a test can hold all of it. */
export type SetupIo = AgentIo & {
  /** The path of `main.ts` (the bundle, once built), which every tool wrapper and helper runs. */
  cli: string;
  /** The folder of the hook scripts `install` puts in the settings. */
  scripts: string;
  /** Aborted by Ctrl+C, which ends the wait for the six digits with one sentence. */
  signal?: AbortSignal | undefined;
  /** How `claude` is run: `runClaude` unless a test holds it. */
  claude?: ClaudeRunner | undefined;
  /** How step 1 signs in: `login` unless a test holds it. */
  signIn?: typeof login | undefined;
  /** Step 2's question: true for yes, false for anything else, null when no one is at a terminal. `askTerminal` unless a test holds it. */
  ask?: ((question: string) => Promise<boolean | null>) | undefined;
};

/**
 * A yes or no from the person at the terminal, asked on stderr so standard output keeps one line per step. Null off a
 * terminal, where nobody can answer and waiting would hang a script. Only `y` or `yes` is a yes.
 */
export async function askTerminal(question: string, signal?: AbortSignal): Promise<boolean | null> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  /* CTRL+C AT THE QUESTION IS A NO. Readline takes it from the terminal itself, and with no listener only pauses. */
  rl.on('SIGINT', () => rl.close());
  try {
    return /^\s*y(?:es)?\s*$/iu.test(await rl.question(question, signal ? { signal } : {}));
  } catch {
    return false;
  } finally {
    rl.close();
  }
}

const USAGE = 'braindog setup takes the address of one record, as in braindog setup https://brain.dog/app/<slug>, and --dry-run or --yes, and nothing else.';

/** Whether a login the next command would send is held for this host now: the hosts file's, unexpired, or `BRAINDOG_TOKEN`. */
function loginHeld(key: string, env: Env, file: string): boolean {
  try {
    return target(key, env, file).token !== undefined;
  } catch {
    /* EXPIRED, OR A HOSTS FILE THAT DOES NOT READ: either way step 1 signs in, and `login` says what is wrong with the file. */
    return false;
  }
}

/**
 * Whether the hosts file keeps a login for this host while its default names another host or none.
 *
 * THE MCP SERVER AND THE HOOKS REACH THE DEFAULT HOST, because the entry `install` and step 3 write names no host. A
 * machine already signed in to another record would otherwise be set up to reach that one, with every line here
 * saying this one. `login` makes the host it signs in to the default, so only a login already held needs this.
 */
function defaultElsewhere(key: string, file: string): boolean {
  try {
    const hosts = readHosts(file);
    const kept = Object.entries(hosts.hosts).some(([written, held]) => sameHost(written, key) && held.token !== undefined);
    return kept && (hosts.default === undefined || !sameHost(hosts.default, key));
  } catch {
    return false;
  }
}

/** Whether the profile's servers file registers `braindog` as this command's server, as something else, or not at all. */
function registration(file: string): 'same' | 'other' | 'none' {
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    /* NO FILE, OR ONE CLAUDE CODE WILL REFUSE TOO: `claude mcp add-json` is the one that says what is wrong with it. */
    return 'none';
  }
  const servers: Record<string, unknown> = isObject(config) && isObject(config.mcpServers) ? config.mcpServers : {};
  if (!Object.hasOwn(servers, 'braindog')) return 'none';
  const held = servers.braindog;
  const args = isObject(held) && Array.isArray(held.args) ? held.args : [];
  /* THE TYPE IS OPTIONAL IN CLAUDE CODE'S FILE, where a stdio entry may leave it out, and an empty `env` is what
     `claude mcp add` was measured writing beside the entry (`install.ts`, `handRun`), so neither makes a registration
     differ. */
  const same =
    isObject(held) &&
    (held.type ?? 'stdio') === BRAINDOG_SERVER.type &&
    held.command === BRAINDOG_SERVER.command &&
    args.length === BRAINDOG_SERVER.args.length &&
    BRAINDOG_SERVER.args.every((arg, i) => args[i] === arg);
  return same ? 'same' : 'other';
}

/** `braindog setup <url> [--dry-run | --yes]`, and the exit code: the first failing step's, or 0. */
export async function setup(args: string[], io: SetupIo): Promise<number> {
  let parsed: { values: { 'dry-run'?: boolean | undefined; yes?: boolean | undefined }; positionals: string[] };
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: { 'dry-run': { type: 'boolean' }, yes: { type: 'boolean' } } });
  } catch {
    /* parseArgs quotes what it could not read, and that could be a token pasted in the wrong place. */
    io.say(USAGE);
    return 1;
  }
  const [url, ...more] = parsed.positionals;
  if (url === undefined || more.length > 0 || url.startsWith('-')) {
    io.say(USAGE);
    return 1;
  }
  let key: string;
  try {
    key = hostKey(url);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'The BrainDog host is not an address.');
    return 1;
  }
  const dryRun = parsed.values['dry-run'] === true;
  const file = hostsPath(io.env);
  const detail = (lines: string[]) => {
    for (const line of lines) io.out(`   ${line}`);
  };
  /* WHETHER ANY STEP CHANGED ANYTHING, so the last line can say a second run changed nothing, and never says so wrongly. */
  let changed = false;
  /*
   * CTRL+C IS HONOURED BETWEEN STEPS, NOT ONLY IN THE FIRST. `main.ts` takes SIGINT so the wait for six digits ends
   * with a sentence, which also means the process no longer ends on it; without this check a Ctrl+C pressed during a
   * later step was swallowed and every step after it still ran. A step already started is left to finish.
   */
  const stoppedBefore = (step: number): boolean => {
    if (!io.signal?.aborted) return false;
    io.out(`Setup was stopped before step ${String(step)}, and the steps before it are kept as they are.`);
    return true;
  };

  /* ── 1. sign in ──────────────────────────────────────────────────────── */
  const held = loginHeld(key, io.env, file);
  if (held) {
    const moves = defaultElsewhere(key, file);
    if (moves && !dryRun) {
      try {
        const hosts = readHosts(file);
        hosts.default = key;
        saveHosts(file, hosts);
      } catch (e) {
        io.say(e instanceof Error ? e.message : `${file} could not be written.`);
        io.out('1. Sign-in: a login is held, and the hosts file could not be changed to reach this host by default, so setup stopped there.');
        return 1;
      }
      changed = true;
    }
    io.out(
      `1. Sign-in: this machine already holds a login to ${key}, so none was asked for${
        moves ? `, and ${key} ${dryRun ? 'would become' : 'is now'} the host the MCP server and the hooks reach` : ''
      }.`,
    );
  } else if (dryRun) {
    io.out(`1. Sign-in: this machine holds no login to ${key}, so setup would ask for one, with six digits to approve in the app.`);
  } else {
    /* THE SIX DIGITS GO TO STDERR, as `login` always sends them, so standard output keeps one line per step. */
    const code = await (io.signIn ?? login)(url, { file, say: io.say, signal: io.signal });
    if (code !== 0) {
      io.out('1. Sign-in did not finish, so setup stopped there and changed nothing else.');
      return code;
    }
    changed = true;
    io.out(`1. Sign-in: this machine is signed in to ${key}.`);
  }

  /* ── 2. the hooks, as `install --apply` writes them into the user profile ── */
  if (stoppedBefore(2)) return 1;
  const profiles = profilesOf([], io.env);
  try {
    /*
     * PLANNED DRY FIRST, WHICH WRITES NOTHING, so a run with nothing to add is said as one and applies nothing. Each
     * entry it would add is its own `  + hooks.` line, and an older BrainDog entry it would rewrite its own `  ~ hooks.`
     * line. Its dry run's closing line names `install --apply` as the way to write it, which is not this command's way,
     * so it is left out.
     *
     * AND THE PLAN IS SHOWN BEFORE ANYTHING IS WRITTEN (AGT-B10, his "Hooks install shows changes first"). It was
     * applied first and shown after, so the first a person saw of a hook in every session was the line saying it was
     * already there. On a terminal the step asks; `--yes` is the answer given ahead; off a terminal with no `--yes` it
     * stops after the plan and says how to go on, because a yes nobody typed is not one.
     */
    const planned = installProfiles(profiles, [], { apply: false, scripts: io.scripts }).lines;
    const pending = planned.some((line) => line.startsWith('  + hooks.') || line.startsWith('  ~ hooks.') || line.startsWith(PLACES_SKILL));
    const rest = (lines: string[]) => lines.filter((line) => !line.startsWith('Nothing was changed.') && !line.includes(HOOKS_HELD));
    if (!pending) {
      io.out("2. Hooks: Claude Code's settings already run the BrainDog hooks and Agent Skill.");
      detail(rest(planned));
    } else if (dryRun) {
      io.out("2. Hooks: the BrainDog hooks and Agent Skill would be added to Claude Code's settings, with a copy of the file kept first.");
      detail(rest(planned));
    } else {
      io.out("2. Hooks: these changes to Claude Code's settings come next, with a copy of each file kept first:");
      detail(rest(planned));
      const yes = parsed.values.yes === true || (await (io.ask ?? ((q: string) => askTerminal(q, io.signal)))('Write these changes? [y/N] '));
      if (yes === null) {
        io.out(`   Nothing was written, because no one is at a terminal to say yes. Run braindog setup ${key} --yes to write them.`);
        return 1;
      }
      if (!yes) {
        io.out(`   Nothing was written to Claude Code's settings, so setup stopped there. Run braindog setup ${key} again to be asked again.`);
        return 1;
      }
      const applied = installProfiles(profiles, [], { apply: true, scripts: io.scripts }).lines;
      changed = true;
      io.out("   Written: the BrainDog hooks and Agent Skill are in Claude Code's settings.");
      detail(rest(applied).filter((line) => !line.startsWith('  ') && !line.endsWith(':')));
    }
  } catch (e) {
    /* `install`'s own sentence, which names the file, says what became of it, and never quotes what is in it. */
    io.say(e instanceof Error ? e.message : String(e));
    io.out("2. Hooks: Claude Code's settings could not be changed, so setup stopped there.");
    return 1;
  }

  /* ── 3. the MCP server, at user scope ────────────────────────────────── */
  if (stoppedBefore(3)) return 1;
  const [profile] = profiles;
  const now = profile === undefined ? 'none' : registration(serversFileOf(profile, io.home));
  const entry = JSON.stringify(BRAINDOG_SERVER);
  if (now === 'same') io.out('3. MCP server: braindog is already registered at user scope, running this command.');
  else if (dryRun)
    io.out(`3. MCP server: braindog would be registered at user scope${now === 'other' ? ' in place of the braindog entry there, which runs something else' : ''}: ${entry}`);
  else {
    const claude = io.claude ?? runClaude;
    if (now === 'other') {
      const removed = await claude(['mcp', 'remove', 'braindog', '--scope', 'user'], io.cwd);
      if (removed !== 0) {
        io.out(
          removed === -1
            ? '3. MCP server: claude was not found, so setup stopped there. Install Claude Code, then run setup again.'
            : `3. MCP server: claude mcp remove did not remove the braindog entry there (exit ${String(removed)}), so setup stopped there.`,
        );
        return 1;
      }
    }
    const added = await claude(['mcp', 'add-json', 'braindog', entry, '--scope', 'user'], io.cwd);
    if (added !== 0) {
      io.out(
        added === -1
          ? '3. MCP server: claude was not found, so setup stopped there. Install Claude Code, then run setup again.'
          : `3. MCP server: claude mcp add-json did not register braindog (exit ${String(added)}), so setup stopped there.`,
      );
      return 1;
    }
    changed = true;
    io.out(`3. MCP server: braindog ${now === 'other' ? 'replaced the entry there and is' : 'is'} registered at user scope, running this command.`);
  }

  /* ── 4 and 5. what the record holds for every machine ────────────────── */
  if (!held && dryRun) {
    io.out('4. Tools: not read, because this machine holds no login yet to read the record with.');
    io.out('5. Skills: not read, for the same reason.');
    io.out('That was a dry run, so nothing was signed in, written or registered.');
    return 0;
  }

  /* ONE CONNECTION PER STEP, so each has the whole of its own deadline (`connect`), and `top` is left out of both, so
     neither reads or writes anything at project scope. */
  if (stoppedBefore(4)) return 1;
  const tools = await connect(key, io);
  if (typeof tools === 'number') {
    io.out('4. Tools: the record could not be read, so setup stopped there.');
    return tools;
  }
  if (!tools.context.registers.some((r) => r.id === 'tools')) io.out('4. Tools: this record has no tools register, so there is nothing to write.');
  else {
    const lines = await writeTools({ client: tools.client, context: tools.context, top: null, cwd: io.cwd, home: io.home, scope: 'user', dryRun, cli: io.cli, claude: io.claude ?? runClaude });
    /* ANY LINE IS COUNTED AS A CHANGE, because `writeTools` is silent when every entry is as the record has it. */
    if (lines.length > 0) changed = true;
    io.out(
      lines.length === 0
        ? '4. Tools: every tool the record applies everywhere is already in Claude Code as the record has it.'
        : dryRun
          ? '4. Tools: what would be written at user scope, from the tools the record applies everywhere:'
          : '4. Tools: the tools the record applies everywhere, written at user scope:',
    );
    detail(lines.filter((line) => !line.startsWith('Nothing was changed.')));
  }

  if (stoppedBefore(5)) return 1;
  const skills = await connect(key, io);
  if (typeof skills === 'number') {
    io.out('5. Skills: the record could not be read, so setup stopped there.');
    return skills;
  }
  if (!skills.context.registers.some((r) => r.id === 'skills')) io.out('5. Skills: this record has no skills register, so there is nothing to sync.');
  else {
    const configDir = io.env.CLAUDE_CONFIG_DIR || join(io.home, '.claude');
    const lines = await syncSkills({ client: skills.client, context: skills.context, home: io.home, configDir, top: null, dryRun });
    if (lines.length > 0) changed = true;
    io.out(lines.length === 0 ? `5. Skills: ${configDir} already holds every skill as the record has it.` : `5. Skills: ${dryRun ? 'what would be synced into' : 'synced into'} ${configDir}:`);
    detail(lines);
  }

  if (dryRun) io.out('That was a dry run, so nothing was signed in, written, registered or proposed.');
  else if (!changed) io.out(`Nothing changed: this machine was already set up from ${key}.`);
  else io.out(`This machine is set up from ${key}. Every Claude Code session started from now on has it.`);
  return 0;
}
