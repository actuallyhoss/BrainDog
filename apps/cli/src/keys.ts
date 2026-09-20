/**
 * `braindog keys put <label>` and `braindog keys exec <label> -- <command>`: a key into the vault, and a key handed to
 * one command, through the host's key doors, under a vault grant (`loop/research-agent-path.md` §5.7,
 * `docs/48-SPEC-CLI.md` §2).
 *
 * THE VALUE IS NEVER AN ARGUMENT. `put` reads it from standard input, because an argument is kept in shell history
 * and shown in every process list.
 *
 * AND NO COMMAND PRINTS A KEY. `exec` reads one back and puts it into the environment of the command after `--`,
 * under one variable, and nowhere else: not standard output, not standard error, not a file. A printed key lands in
 * a terminal's scrollback or an agent's transcript, which is the leak §5.7 closes by having no such command.
 *
 * NOR IS A KEY PUT WHERE IT CHANGES THE COMMAND. A name such as `NODE_OPTIONS`, `LD_PRELOAD` or `PATH` is refused
 * before any request, whether `--as` names it or a label makes it. On Windows a `.cmd` such as `pnpm` or `npx` is
 * found through PATH and PATHEXT and started by `cmd.exe` with every argument escaped, and the key is never on that
 * command line.
 *
 * ONE OF THE THREE FILES THE `Plaintext` BRAND LIVES IN. The value is typed `Plaintext` where it is read and where
 * the host's answer is parsed. It leaves this file in the request `depositOne` sends and in the environment
 * `execOne` hands to the command, the two recorded exemptions in `secret-grep`.
 *
 * NO SENTENCE HERE QUOTES A VALUE, A BEARER, A LABEL OR A VARIABLE NAME. A label or a name is echoed by nobody,
 * because a value pasted in its place would otherwise be printed to stderr, which ends up in an agent's logs.
 */

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { win32 } from 'node:path';
import { parseArgs } from 'node:util';

import { hostKey, inTheClear, readHosts } from './http.ts';
import type { Answering } from './json.ts';

/** A key in the clear. */
type Plaintext = string & { readonly brand: 'Plaintext' };

/**
 * Start a command with these variables, and settle with its exit code once it ends, or reject if it did not start.
 * `verbatim` hands the arguments to the program exactly as written, which `cmd.exe` needs for its escaping to hold.
 */
export type Spawner = (command: string, args: string[], vars: Record<string, string | undefined>, verbatim?: boolean) => Promise<number>;

export type KeysIo = {
  /** The hosts file the vault grants are kept in. */
  file: string;
  env: Record<string, string | undefined>;
  /** Standard input read whole, or `null` when it is a terminal and nobody piped anything in. */
  stdin: () => string | null;
  /** One line to stderr. */
  say: (line: string) => void;
  /**
   * Under `--json`, where the machine-readable half of the answer goes (`json.ts`).
   *
   * `put` ONLY. `exec` hands stdout to the command it starts, and an envelope printed into that
   * stream would be indistinguishable from the command's own output.
   */
  answer?: Answering | undefined;
  /** The session headers for a host, naming the run this machine is in when it is in one. */
  headers: (host: string) => Promise<Record<string, string>>;
  /** How `exec` starts its command: `spawnInherit` on a real terminal. */
  spawn: Spawner;
  /** The platform the command starts on: `process.platform` unless a test names another. */
  platform?: string | undefined;
  /** Whether a path is a file, for finding a command through PATH on Windows. */
  isFile?: ((path: string) => boolean) | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  now?: (() => number) | undefined;
  signal?: AbortSignal | undefined;
};

/** `48 §4.4`: a refusal or a local failure is 1, and a host that did not answer is 3. */
const REFUSED = 1;
const UNREACHABLE = 3;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A row's spoken id, which `exec` accepts in place of a label. */
const SPOKEN = /^[a-z][a-z0-9_]{0,63}#[1-9][0-9]{0,8}$/;

/** An environment variable name `exec` will set. */
const VARIABLE = /^[A-Z_][A-Z0-9_]*$/;

/**
 * NAMES THAT CHANGE HOW A PROGRAM RUNS, which a key is never put in. A value under `NODE_OPTIONS`, `LD_PRELOAD` or
 * `PERL5OPT` is read as code or a library to load, and one under `PATH`, `HOME` or `COMSPEC` changes what the command
 * finds. A label that happens to make one of these names, or an `--as` typed by mistake, would change the command
 * rather than hand it a key.
 */
const RUNS_THE_PROGRAM = new Set([
  'PATH', 'PATHEXT', 'HOME', 'USERPROFILE', 'SHELL', 'ENV', 'BASH_ENV', 'COMSPEC', 'SYSTEMROOT', 'WINDIR',
  'NODE_OPTIONS', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH',
  'PYTHONPATH', 'PYTHONSTARTUP', 'PYTHONHOME', 'RUBYOPT', 'RUBYLIB', 'PERL5OPT', 'PERL5LIB', 'PERLLIB',
  'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'PROMPT_COMMAND', 'PS4', 'IFS', 'SHELLOPTS', 'BASHOPTS', 'ZDOTDIR',
]);
const RUNS_BY_PREFIX = /^(?:NODE_|LD_|DYLD_)/;

export const changesHowItRuns = (name: string): boolean => RUNS_THE_PROGRAM.has(name) || RUNS_BY_PREFIX.test(name);

/** How a command is started: the program, its arguments, and whether they reach it exactly as written. */
export type Launch = { command: string; args: string[]; verbatim: boolean };

/** What Windows starts with no shell, and the two of them only `cmd.exe` can run. */
const RUNNABLE = ['.com', '.exe', '.bat', '.cmd'];
const BATCH = ['.bat', '.cmd'];

/** Every character `cmd.exe` treats as more than itself. */
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

/**
 * One argument as `cmd.exe` must be handed it to pass it on unchanged.
 *
 * First as the C runtime reads a quoted argument: the backslashes before a quote or the end are doubled, and the
 * quote is escaped. Then every character `cmd.exe` acts on is escaped with `^`, the quotes included, so no quote
 * opens a stretch in which a `^` stops working. A batch file's `%*` is read by `cmd.exe` a second time, so for one
 * the escaping is done twice. A `%` escaped this way is never expanded, because the name it would open ends in `^`.
 */
export function quoteForCmd(arg: string, batch: boolean): string {
  const once = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`.replace(CMD_META, '^$1');
  return batch ? once.replace(CMD_META, '^$1') : once;
}

const BATCH_REFUSED = 'The command after -- is a Windows batch file, and cmd.exe cannot be handed its arguments safely here, so run the program it starts directly.';

/**
 * How to start a command with no shell.
 *
 * ELSEWHERE, AS IT IS. ON WINDOWS a name is found as `cmd.exe` would find it, through PATH and then PATHEXT, because
 * Node with no shell tries only `.com` and `.exe`, so `pnpm` or `npx`, which are `.cmd` files, would not start. A
 * program found is started by its path. A batch file is started by `cmd.exe /d /v:off /s /c`, with AutoRun and delayed
 * expansion off and every argument escaped by `quoteForCmd`. The key is in the environment, never on that line. An
 * argument with a line break cannot be escaped at all, nor can a `%` be while a variable's name ends in `^`, so those
 * are one sentence. A command found nowhere is left as it was, and fails to start as it would have.
 */
export function planCommand(command: string, args: string[], env: Record<string, string | undefined>, o: { platform: string; isFile: (path: string) => boolean }): Launch | string {
  if (o.platform !== 'win32') return { command, args, verbatim: false };
  const read = (name: string) => Object.entries(env).find(([k]) => k.toUpperCase() === name)?.[1];
  const exts = (read('PATHEXT') || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => RUNNABLE.includes(e));
  const names = RUNNABLE.includes(win32.extname(command).toLowerCase()) ? [command] : exts.map((e) => `${command}${e}`);
  const dirs = /[\\/:]/.test(command)
    ? ['']
    : (read('PATH') ?? '')
        .split(';')
        .map((d) => d.trim().replace(/^"(.*)"$/, '$1'))
        .filter((d) => d !== '');
  const found = dirs.flatMap((dir) => names.map((name) => (dir ? win32.join(dir, name) : name))).find((path) => o.isFile(path));
  if (found === undefined) return { command, args, verbatim: false };
  if (!BATCH.includes(win32.extname(found).toLowerCase())) return { command: found, args, verbatim: false };
  if (args.some((a) => /[\r\n\0]/.test(a)) || Object.keys(env).some((k) => k.endsWith('^'))) return BATCH_REFUSED;
  const line = [win32.normalize(found).replace(CMD_META, '^$1'), ...args.map((a) => quoteForCmd(a, true))].join(' ');
  return { command: win32.join(read('SYSTEMROOT') || 'C:\\Windows', 'System32', 'cmd.exe'), args: ['/d', '/v:off', '/s', '/c', `"${line}"`], verbatim: true };
}

const aFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

type Door = { key: string; base: string; bearer: string; scope: string };
type Answer = { status: number; body: Record<string, unknown> | null };

/**
 * The real spawner: the command's own standard streams, no shell, and the exit code it ends with (1 for a signal).
 *
 * NO SHELL, so nothing in the command or its arguments is expanded, and the variable is not echoed by a shell's
 * tracing. Ctrl+C reaches the command from the terminal itself, so this process waits for it rather than dying first.
 * A Windows batch file is the one exception, planned by `planCommand`: `cmd.exe` is the program, handed its escaped
 * line verbatim.
 */
export const spawnInherit: Spawner = (command, args, vars, verbatim) =>
  new Promise((done, fail) => {
    const ignore = () => {};
    process.on('SIGINT', ignore);
    const child = spawn(command, args, { stdio: 'inherit', shell: false, env: vars, windowsVerbatimArguments: verbatim === true });
    child.on('error', (e) => {
      process.off('SIGINT', ignore);
      fail(e);
    });
    child.on('exit', (code) => {
      process.off('SIGINT', ignore);
      done(code ?? 1);
    });
  });

/** The host and the vault grant a command uses, or the one sentence that says why there is none. */
function doorFor(flags: { host?: string | undefined; vault?: string | undefined }, io: KeysIo): Door | string {
  let hosts;
  try {
    hosts = readHosts(io.file);
  } catch (e) {
    return e instanceof Error ? e.message : `${io.file} could not be read.`;
  }
  const named = flags.host || io.env.BRAINDOG_HOST || hosts.default;
  if (!named) return `No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or run braindog login <host> --vault <project>.`;
  let key: string;
  try {
    key = hostKey(named);
  } catch (e) {
    return e instanceof Error ? e.message : 'The BrainDog host is not an address.';
  }
  const url = new URL(key);
  if (inTheClear(url)) return `${key} is http, not https. BrainDog sends a vault grant only over https, except to this machine.`;

  const grants = hosts.hosts[key]?.vault ?? {};
  const scopes = Object.keys(grants);
  const scope = flags.vault ?? (scopes.length === 1 ? scopes[0] : undefined);
  if (scope === undefined)
    return scopes.length === 0
      ? `No vault grant is kept for ${key}. Run braindog login ${key} --vault <project>.`
      : `${key} has vault grants for ${scopes.join(', ')}, so name one with --vault.`;
  const held = Object.hasOwn(grants, scope) ? grants[scope] : undefined;
  if (!isObject(held) || typeof held.value !== 'string' || !held.value)
    return `No vault grant for that project is kept for ${key}. Run braindog login ${key} --vault <project>.`;
  const until = typeof held.expires === 'string' ? Date.parse(held.expires) : Number.NaN;
  if (!(until > (io.now ?? Date.now)()))
    return `The vault grant for ${scope} on ${key} has expired. Run braindog login ${key} --vault ${scope}.`;
  return { key, base: url.origin, bearer: held.value, scope };
}

async function answerOf(res: Response): Promise<Answer> {
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: isObject(parsed) ? parsed : null };
}

/** The one sentence for an answer that is not a success: the host's own where it sent one. */
function refusedLine(door: Door, answer: Answer): string {
  const refusal = answer.body?.ok === false && isObject(answer.body.refusal) ? answer.body.refusal : null;
  if (answer.status === 401) return `${door.key} did not take the vault grant. Run braindog login ${door.key} --vault ${door.scope}.`;
  if (typeof refusal?.fix === 'string' && refusal.fix) return refusal.fix.slice(0, 300);
  return `${door.key} answered in a way this command does not recognise.`;
}

/**
 * Send one deposit. THE ONE REQUEST A VALUE LEAVES IN, and `secret-grep` names this function as its exemption. A
 * redirect is refused rather than followed, because following it would carry the value somewhere nobody chose.
 */
async function depositOne(door: Door, ask: { label: string; opens?: string; kind?: string }, value: Plaintext, headers: Record<string, string>, io: KeysIo): Promise<Answer> {
  const fetch = io.fetch ?? globalThis.fetch;
  const res = await fetch(`${door.base}/api/vault/deposit`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', authorization: `Bearer ${door.bearer}` },
    body: JSON.stringify({ ...ask, value }),
    redirect: 'error',
    ...(io.signal ? { signal: io.signal } : {}),
  });
  return answerOf(res);
}

/** Read one key back: its value, or the answer that refused it. */
async function getOne(door: Door, ask: { label: string } | { credential: string }, headers: Record<string, string>, io: KeysIo): Promise<{ value: Plaintext } | { refused: Answer }> {
  const fetch = io.fetch ?? globalThis.fetch;
  const res = await fetch(`${door.base}/api/vault/open`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', authorization: `Bearer ${door.bearer}` },
    body: JSON.stringify(ask),
    redirect: 'error',
    ...(io.signal ? { signal: io.signal } : {}),
  });
  const answer = await answerOf(res);
  const opened = answer.body?.ok === true && isObject(answer.body.value) ? answer.body.value : null;
  return opened !== null && typeof opened.value === 'string' ? { value: opened.value as Plaintext } : { refused: answer };
}

/**
 * Start the command with the key under one variable. THE ONE PLACE A KEY READ BACK LEAVES, and `secret-grep` names
 * this function as its exemption. The variables are a copy, so this process's own environment never holds the key,
 * and the copy's entry is deleted as soon as the command has been started with it.
 */
function execOne(run: Launch & { name: string }, value: Plaintext, io: KeysIo): Promise<number> {
  const handed: Record<string, string | undefined> = { ...io.env, [run.name]: value };
  const exited = io.spawn(run.command, run.args, handed, run.verbatim);
  delete handed[run.name];
  return exited;
}

/** The variable a label becomes when `--as` is not given: upper case, other runs to `_`, no leading digits or `_`. */
export function variableOf(label: string): string {
  return label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^[0-9_]+/, '');
}

const USAGE_PUT = 'braindog keys put takes one label, --opens, --kind, --vault and --host, and reads the value from standard input.';
const USAGE_EXEC = 'braindog keys exec takes one label or spoken id, --as, --vault and --host, then -- and the command to run.';

/** `braindog keys put|exec`, and the exit code: for `exec`, the command's own once it has run. */
export async function keys(args: string[], io: KeysIo): Promise<number> {
  const [verb, ...all] = args;
  if (verb !== 'put' && verb !== 'exec') {
    io.say('braindog keys takes put <label>, with the value on standard input, or exec <label> -- <command>.');
    return REFUSED;
  }

  /* EVERYTHING AFTER THE FIRST `--` IS THE COMMAND, flags and all, and is never read as this command's own. */
  const cut = verb === 'exec' ? all.indexOf('--') : -1;
  const rest = cut === -1 ? all : all.slice(0, cut);
  const command = cut === -1 ? [] : all.slice(cut + 1);

  let values: { opens?: string | undefined; kind?: string | undefined; vault?: string | undefined; host?: string | undefined; as?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } =
      verb === 'put'
        ? parseArgs({
            args: rest,
            allowPositionals: true,
            strict: true,
            options: { opens: { type: 'string' }, kind: { type: 'string' }, vault: { type: 'string' }, host: { type: 'string' } },
          })
        : parseArgs({ args: rest, allowPositionals: true, strict: true, options: { as: { type: 'string' }, vault: { type: 'string' }, host: { type: 'string' } } }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a value typed as an argument. */
    io.say(verb === 'put' ? USAGE_PUT : USAGE_EXEC);
    return REFUSED;
  }
  const [label, ...more] = positionals;
  if (label === undefined || more.length > 0 || !label.trim()) {
    io.say(verb === 'put' ? USAGE_PUT : USAGE_EXEC);
    return REFUSED;
  }

  /* REFUSED BEFORE ANYTHING IS READ OR SENT, so a mistake costs nothing. */
  let run: (Launch & { name: string }) | null = null;
  if (verb === 'exec') {
    const [program, ...programArgs] = command;
    if (program === undefined || !program) {
      io.say('braindog keys exec hands the key to the command after --, and no command was given.');
      return REFUSED;
    }
    const name = values.as ?? variableOf(label.trim());
    if (values.as !== undefined && !VARIABLE.test(values.as)) {
      io.say('--as takes an environment variable name: capital letters, digits and underscores, not starting with a digit.');
      return REFUSED;
    }
    if (!name) {
      io.say('No environment variable name can be made from that label, so name one with --as.');
      return REFUSED;
    }
    if (changesHowItRuns(name)) {
      io.say('That variable name changes how a command runs, so a key is never put in it; name another with --as.');
      return REFUSED;
    }
    const plan = planCommand(program, programArgs, io.env, { platform: io.platform ?? process.platform, isFile: io.isFile ?? aFile });
    if (typeof plan === 'string') {
      io.say(plan);
      return REFUSED;
    }
    run = { ...plan, name };
  }

  let value: Plaintext | null = null;
  if (verb === 'put') {
    const read = io.stdin();
    if (read === null) {
      io.say('braindog keys put reads the value from standard input, so pipe it in; a value is never an argument, because shell history keeps those.');
      return REFUSED;
    }
    /* One trailing newline is what `echo` and a file's last line add, and never part of a key. */
    value = read.replace(/\r?\n$/, '') as Plaintext;
    if (!value) {
      io.say('Standard input was empty, so nothing was deposited.');
      return REFUSED;
    }
  }

  const door = doorFor(values, io);
  if (typeof door === 'string') {
    io.say(door);
    return REFUSED;
  }

  let exited: Promise<number>;
  try {
    const headers = await io.headers(door.key);
    if (verb === 'put' && value !== null) {
      const ask = { label: label.trim(), ...(values.opens ? { opens: values.opens } : {}), ...(values.kind ? { kind: values.kind } : {}) };
      const answer = await depositOne(door, ask, value, headers, io);
      const kept = answer.body?.ok === true && isObject(answer.body.value) ? answer.body.value : null;
      if (kept === null || typeof kept.credential !== 'string') {
        io.say(refusedLine(door, answer));
        return REFUSED;
      }
      io.say(`${kept.rotated === true ? 'rotated' : 'deposited'} ${kept.credential} on ${door.key} · version ${String(kept.version)}`);
      /* THE ROW IT BECAME, NEVER THE VALUE AND NEVER THE LABEL: the same facts the sentence carries,
         and this is the one command in the tree with a plaintext in a variable two lines above the
         line it prints. */
      io.answer?.({ value: { credential: kept.credential, host: door.key, version: kept.version, rotated: kept.rotated === true } });
      return 0;
    }
    if (run === null) return REFUSED;

    const ask = SPOKEN.test(label.trim()) ? { credential: label.trim() } : { label: label.trim() };
    const got = await getOne(door, ask, headers, io);
    if ('refused' in got) {
      io.say(refusedLine(door, got.refused));
      return REFUSED;
    }
    /* The answer holding the key goes out of scope with this block, so nothing here keeps it past the start. */
    exited = execOne(run, got.value, io);
  } catch {
    if (io.signal?.aborted) {
      io.say('Stopped before the host answered.');
      return REFUSED;
    }
    /* The error could quote the request, and a deposit's request holds the value. */
    io.say(`${door.key} did not answer.`);
    return UNREACHABLE;
  }

  try {
    return await exited;
  } catch {
    /* The error names the command, and nothing about it is worth the risk of a sentence that quotes more. */
    io.say('The command after -- did not start.');
    return REFUSED;
  }
}
