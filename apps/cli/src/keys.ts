/**
 * `braindog keys put <label>`, `braindog keys exec <label> -- <command>`, `braindog keys headers <credential> --as
 * <Header>` and `braindog keys helper <credential>`: a key into the Keychain, a key handed to one command, and a key
 * handed to one program as the header it asks for or as the API key it asks for, through the host's key doors, under
 * keychain access (`docs/48-SPEC-CLI.md` §2). `put --from` and `scan` have
 * files of their own (`keys-many.ts`, `keys-scan.ts`), and a value they read reaches the host only through `sealOne`.
 *
 * `put` WITH NO KEYCHAIN ACCESS TO USE SENDS THE LOGIN INSTEAD. The deposit door takes a
 * `write` token too, and the record puts the key in this run's project as a NEW key: a label already there is refused
 * with the sentence that names the two ways a value is replaced. So an agent that finds a key can put it away on a
 * machine that was never given keychain access, and a login that leaks can add a key and never swap one. `exec` reads a
 * key back, and that still takes keychain access and nothing else.
 *
 * THE VALUE IS NEVER AN ARGUMENT. `put` reads it from standard input, because an argument is kept in shell history
 * and shown in every process list; at a terminal it asks for it with echo off (`secret`), one line, and nothing typed
 * is shown or kept.
 *
 * AND ONE FUNCTION PRINTS A KEY, TO A PROGRAM AND NEVER TO A PERSON. `exec` reads one back and puts it into the
 * environment of the command after `--`, under one variable, and nowhere else: not standard output, not standard
 * error, not a file. A printed key lands in a terminal's scrollback or an agent's transcript, which is the leak this
 * closes. `headers` is the one exception, at the owner's request: Claude Code's `headersHelper`
 * reads an HTTP server's headers only from a command's standard output, so a key an HTTP tool needs in a header can
 * reach it no other way. It refuses standard output that is a terminal before it reads or sends anything, it opens
 * the key under keychain access as `exec` does, which the host logs as a `grant.read`, and it prints the one header
 * document and nothing else. `helper` is the same door for Claude Code's `apiKeyHelper`, which reads a profile's API
 * key the same way, and prints the key alone through the same function.
 *
 * NOR IS A KEY PUT WHERE IT CHANGES THE COMMAND. A name such as `NODE_OPTIONS`, `LD_PRELOAD` or `PATH` is refused
 * before any request, whether `--as` names it or a label makes it. On Windows a `.cmd` such as `pnpm` or `npx` is
 * found through PATH and PATHEXT and started by `cmd.exe` with every argument escaped, and the key is never on that
 * command line.
 *
 * ONE OF THE THREE FILES THE `Plaintext` BRAND LIVES IN. The value is typed `Plaintext` where it is read and where
 * the host's answer is parsed. It leaves this file in the request `depositOne` sends, in the environment `execOne`
 * hands to the command, and in the header `headersOne` prints, the recorded exemptions in `secret-grep`.
 *
 * NO SENTENCE HERE QUOTES A VALUE, A BEARER, A LABEL OR A VARIABLE NAME. A label or a name is echoed by nobody,
 * because a value pasted in its place would otherwise be printed to stderr, which ends up in an agent's logs.
 */

import { spawn } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';
import { win32 } from 'node:path';
import { parseArgs } from 'node:util';

import { unbom } from './unbom.ts';
import { hostKey, inTheClear, readHosts, target, type Target } from './http.ts';
import type { Answering } from './json.ts';
import { keysList } from './keys-list.ts';
import { keysPutMany } from './keys-many.ts';
import { keysScan } from './keys-scan.ts';

/** A key in the clear. */
type Plaintext = string & { readonly brand: 'Plaintext' };

/**
 * Start a command with these variables, and settle with its exit code once it ends, or reject if it did not start.
 * `verbatim` hands the arguments to the program exactly as written, which `cmd.exe` needs for its escaping to hold.
 */
export type Spawner = (command: string, args: string[], vars: Record<string, string | undefined>, verbatim?: boolean) => Promise<number>;

export type KeysIo = {
  /** The hosts file the keychain access is kept in. */
  file: string;
  env: Record<string, string | undefined>;
  /** Standard input read whole, or `null` when it is a terminal and nobody piped anything in. */
  stdin: () => string | null;
  /**
   * `put` AT A TERMINAL: one line typed or pasted after the question, with nothing echoed, or `null` when it was
   * stopped (Ctrl+C) or there is no terminal to ask at. Absent where nothing can be asked, and then `put` says to pipe
   * the value in, as it always did.
   */
  secret?: ((question: string) => Promise<string | null>) | undefined;
  /** One line to stdout, which `list` alone prints: `process.stdout` unless a test or `--json` keeps the lines. */
  out?: ((line: string) => void) | undefined;
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
  /** Whether standard output is a terminal, which `headers` refuses: `process.stdout.isTTY` unless a test says. */
  terminal?: (() => boolean) | undefined;
  /** The platform the command starts on: `process.platform` unless a test names another. */
  platform?: string | undefined;
  /** Whether a path is a file, for finding a command through PATH on Windows. */
  isFile?: ((path: string) => boolean) | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  now?: (() => number) | undefined;
  /** How a wait between two tries for a key the owner is asked about passes: a timer unless a test says. */
  wait?: ((ms: number) => Promise<void>) | undefined;
  signal?: AbortSignal | undefined;
  /**
   * `put --from` ONLY: one yes or no from the person at the terminal, before each key is sent, or `null` when there is
   * no terminal to ask at, and then nothing is sent. A credential is his, so nothing deposits a folder of them unasked.
   */
  confirm?: ((question: string) => Promise<boolean | null>) | undefined;
  /** The folder a relative `--from` or `scan` path is read from: `process.cwd()` unless a test says. */
  cwd?: string | undefined;
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
 * A header name `headers` will print, and `tools write` will put in a `headersHelper` command. LETTERS, DIGITS, `-`,
 * `_` AND `.` ONLY, a subset of what HTTP allows, because the name is written into a JSON string by hand here and
 * into a command line a shell reads there, and none of these needs quoting in either.
 */
export const HEADER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

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

/**
 * Where a request goes and what it carries: keychain access for `scope`, or, for `put` alone, the login (`login`).
 * `expired` is the sentence about a keychain grant past its day that `put` passed over for the login, said in place of
 * the login's refusal, since the grant is what ran out (AK8).
 */
type Door = { key: string; base: string; bearer: string; scope: string; login: boolean; from?: Target['from']; expired?: string };
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

/**
 * The host and the bearer a command uses, or the one sentence that says why there is none.
 *
 * KEYCHAIN ACCESS FIRST: the one `--keychain` names, or the one live grant kept for the host. `put` alone, with no `--keychain`
 * and no grant to take, then uses the login every other command sends (`BRAINDOG_TOKEN`, or the hosts file's), because
 * the deposit door takes a login to add a new key. A grant named with `--keychain` is that grant or the sentence about it,
 * never the login in its place, since whoever named one meant to replace a value with it.
 */
function doorFor(flags: { host?: string | undefined; vault?: string | undefined }, io: KeysIo, mayLogin: boolean): Door | string {
  const granted = grantDoor(flags, io);
  if (typeof granted !== 'string' || flags.vault !== undefined || !mayLogin) return granted;
  let to;
  try {
    to = target(flags.host, io.env, io.file, (io.now ?? Date.now)());
  } catch (e) {
    return e instanceof Error ? e.message : granted;
  }
  const expired = / has expired\. /.test(granted) ? { expired: granted } : {};
  if (to.token) return { key: to.key, base: to.base, bearer: to.token, scope: '', login: true, ...(to.from ? { from: to.from } : {}), ...expired };
  if (expired.expired !== undefined) return expired.expired;
  /* NEITHER IS KEPT, and the sentence still names keychain access, which is what `tools scan` reads to say why a key it
     found was kept by name only. */
  return `No keychain access or login is kept for ${to.key}. Run braindog login ${to.key}.`;
}

/** The host and the keychain access a command uses, or the one sentence that says why there is none. */
function grantDoor(flags: { host?: string | undefined; vault?: string | undefined }, io: KeysIo): Door | string {
  let hosts;
  try {
    hosts = readHosts(io.file);
  } catch (e) {
    return e instanceof Error ? e.message : `${io.file} could not be read.`;
  }
  const named = flags.host || io.env.BRAINDOG_HOST || hosts.default;
  if (!named) return `No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or run braindog login <host> --keychain <project>.`;
  let key: string;
  try {
    key = hostKey(named);
  } catch (e) {
    return e instanceof Error ? e.message : 'The BrainDog host is not an address.';
  }
  const url = new URL(key);
  if (inTheClear(url)) return `${key} is http, not https. BrainDog sends keychain access only over https, except to this machine.`;

  const grants = hosts.hosts[key]?.vault ?? {};
  const scopes = Object.keys(grants);
  const scope = flags.vault ?? (scopes.length === 1 ? scopes[0] : undefined);
  if (scope === undefined)
    return scopes.length === 0
      ? `No keychain access is kept for ${key}. Run braindog login ${key} --keychain <project>.`
      : `${key} has keychain access for ${scopes.join(', ')}, so name one with --keychain.`;
  const held = Object.hasOwn(grants, scope) ? grants[scope] : undefined;
  if (!isObject(held) || typeof held.value !== 'string' || !held.value)
    return `No keychain access for that project is kept for ${key}. Run braindog login ${key} --keychain <project>.`;
  const until = typeof held.expires === 'string' ? Date.parse(held.expires) : Number.NaN;
  if (!(until > (io.now ?? Date.now)()))
    return `The keychain access for ${scope} on ${key} has expired. Run braindog login ${key} --keychain ${scope}.`;
  return { key, base: url.origin, bearer: held.value, scope, login: false };
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
  /* A LOGIN THE HOST DID NOT KNOW IS ANSWERED IN THE VAULT GRANT'S WORDS, `at: 'vault'`, because the door asks for a grant
     first and cannot tell which of the two was meant; this side knows it sent the login. */
  /* BRAINDOG_TOKEN IS NO LOGIN TO SIGN IN AGAIN (D26): a self-host's server key, or a token the deposit door does not
     take. Keychain access is the way in, and once it is kept it is sent before the variable. */
  if (door.login && door.from === 'env' && (answer.status === 401 || refusal?.at === 'vault'))
    return `${door.key} did not take the token in BRAINDOG_TOKEN for a key: only this machine's login, an agent's write token or keychain access adds one, and a self-host's server key is none of those. Run braindog login ${door.key} --keychain <project>, then put the key again.`;
  /* THE LOGIN IS NEVER THE FIX HERE (AK8): the deposit door takes keychain access, or a login only where the host wired
     that half, so "run braindog login" sent a person round to the same refusal. One way on, and it works. */
  if (answer.status === 401 || (door.login && refusal?.at === 'vault'))
    return door.login
      ? (door.expired ?? `${door.key} did not take this machine's login for a key. Run braindog login ${door.key} --keychain <project>, then put the key again.`)
      : `${door.key} did not take the keychain access. Run braindog login ${door.key} --keychain ${door.scope}.`;
  /* STILL ASKED AFTER THE WAIT: nothing was kept, and the same command puts it once he says yes. */
  if (refusal?.code === 'KEY_ASKED' && refusal.at === 'register')
    return 'Nothing was put away yet. Say yes to adding Agents in Needs you, then put the key again.';
  /* A NEW KEY WITH NO `--opens` is answered in the record's words, which name no flag. */
  if (refusal?.at === 'opens' && refusal.code === 'REQUIRED_MISSING')
    return 'A new key says what it opens. Add --opens "<what it opens>", such as a host or an account, and put it again.';
  if (typeof refusal?.fix === 'string' && refusal.fix) return refusal.fix.slice(0, 300);
  return `${door.key} answered in a way this command does not recognise.`;
}

/**
 * Send one deposit. THE ONE REQUEST A VALUE LEAVES IN, and `secret-grep` names this function as its exemption. A
 * redirect is refused rather than followed, because following it would carry the value somewhere nobody chose.
 */
async function depositOne(door: Door, ask: { label: string; opens?: string; kind?: string; everywhere?: true }, value: Plaintext, headers: Record<string, string>, io: KeysIo): Promise<Answer> {
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

/**
 * One deposit, and a wait while the owner is asked (AK3). A BrainDog with no Keychain yet asks him on Decide to add it
 * and answers `KEY_ASKED`; this says the record's sentence once and sends the same deposit again every three seconds for
 * up to two minutes, as `getWaiting` does for a key set to ask first, until it is kept or refused for another reason.
 */
async function depositWaiting(door: Door, ask: { label: string; opens?: string; kind?: string; everywhere?: true }, value: Plaintext, headers: Record<string, string>, io: KeysIo): Promise<Answer> {
  const asked = (a: Answer): string | null => {
    const r = a.body?.ok === false && isObject(a.body.refusal) ? a.body.refusal : null;
    return r?.code === 'KEY_ASKED' ? (typeof r.fix === 'string' && r.fix ? r.fix.slice(0, 300) : 'You were asked in BrainDog first.') : null;
  };
  let answer = await depositOne(door, ask, value, headers, io);
  const said = asked(answer);
  if (said === null) return answer;
  io.say(`${said} Waiting for that…`);
  const now = io.now ?? Date.now;
  const wait = io.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const until = now() + ASK_FOR_MS;
  while (now() < until && !io.signal?.aborted) {
    await wait(ASK_EVERY_MS);
    answer = await depositOne(door, ask, value, headers, io);
    if (asked(answer) === null) return answer;
  }
  return answer;
}

/** The door `put --from` sends every key of one file or folder through: what `put` would use, read once. */
export type ManyDoor = { readonly door: Door; readonly host: string; readonly replaces: boolean };

/**
 * `put --from`'s door, or the one sentence that says why there is none. A PROJECT NAMED IS THAT PROJECT'S KEYCHAIN ACCESS
 * OR NOTHING, as `--keychain` is for `put`, because under the login a key goes to the run's project and not the one typed.
 * With no project it is `put`'s door: the one grant kept, or the login. Under a grant a key the project already holds
 * has its value replaced (`replaces`); under the login it is refused at the door, and `put --from` counts it skipped.
 */
export function manyDoor(flags: { host?: string | undefined; project?: string | undefined }, io: KeysIo): ManyDoor | string {
  const door = doorFor({ host: flags.host, vault: flags.project }, io, true);
  return typeof door === 'string' ? door : { door, host: door.key, replaces: !door.login };
}

/** What became of one key `put --from` sent. */
export type SealedOne = { sealed: 'new' | 'replaced' } | { held: true } | { refused: string; unreachable?: true };

/**
 * One key of a file or a folder through the deposit door. THE VALUE IS BRANDED HERE AND LEAVES ONLY IN `depositOne`'s
 * request, so `keys-many.ts` hands it in and gets back what the record did, never the value and never the label.
 */
export async function sealOne(many: ManyDoor, ask: { label: string; opens?: string | undefined; kind?: string | undefined }, value: string, io: KeysIo): Promise<SealedOne> {
  const { door } = many;
  const sent = { label: ask.label, ...(ask.opens ? { opens: ask.opens } : {}), ...(ask.kind ? { kind: ask.kind } : {}) };
  let answer: Answer;
  try {
    answer = await depositOne(door, sent, value as Plaintext, await io.headers(door.key), io);
  } catch {
    /* The error could quote the request, and the request holds the value. */
    return { refused: io.signal?.aborted ? 'Stopped before the host answered.' : `${door.key} did not answer.`, unreachable: true };
  }
  const kept = answer.body?.ok === true && isObject(answer.body.value) ? answer.body.value : null;
  if (kept !== null && typeof kept.credential === 'string') return { sealed: kept.rotated === true ? 'replaced' : 'new' };
  /* A LABEL ALREADY WITHIN THE LOGIN'S REACH is the one refusal that means the record holds the key already. */
  const refusal = answer.body?.ok === false && isObject(answer.body.refusal) ? answer.body.refusal : null;
  if (door.login && refusal?.code === 'FORBIDDEN' && refusal.at === 'label') return { held: true };
  return { refused: refusedLine(door, answer) };
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

/** How often a key the owner is asked about is tried again, and for how long, before the command gives up. */
export const ASK_EVERY_MS = 3_000;
export const ASK_FOR_MS = 120_000;

/** Whether an answer is the record asking the owner first (`KEY_ASKED`): the same call opens the key once he allows it. */
const askedOf = (got: { value: Plaintext } | { refused: Answer }): boolean =>
  'refused' in got && got.refused.body?.ok === false && isObject(got.refused.body.refusal) && got.refused.body.refusal.code === 'KEY_ASKED';

/**
 * Read one key back, and wait while the owner is asked (`12 §6.3`). A key set to ask first answers `KEY_ASKED`; this
 * says so once, on standard error, and asks the open door again every three seconds for up to two minutes, until it
 * opens or is refused for another reason. Nothing new is sent: the same request, to the same `/api/vault/open` every
 * installed host answers. A key with no rule opens on the first try, as it always did, and nothing is printed.
 */
async function getWaiting(door: Door, ask: { label: string } | { credential: string }, said: string, headers: Record<string, string>, io: KeysIo): Promise<{ value: Plaintext } | { refused: Answer }> {
  let got = await getOne(door, ask, headers, io);
  if (!askedOf(got)) return got;
  io.say(`Waiting for you to allow ${said} in BrainDog…`);
  const now = io.now ?? Date.now;
  const wait = io.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const until = now() + ASK_FOR_MS;
  while (now() < until && !io.signal?.aborted) {
    await wait(ASK_EVERY_MS);
    got = await getOne(door, ask, headers, io);
    if (!askedOf(got)) return got;
  }
  return got;
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

/**
 * Print one key as the one header a program asks for, `{"<Header>":"<value>"}`, or, with no header (`keys helper`),
 * as the key alone, which is all an `apiKeyHelper` prints. THE ONE PLACE A KEY IS PRINTED, and `secret-grep` names
 * this function as its exemption from standard output and from nothing else.
 *
 * THE DOCUMENT IS WRITTEN BY HAND RATHER THAN SERIALISED, so the value reaches one sink and not two: the header's name
 * is `HEADER_NAME`'s and needs no escaping, and the value is refused unless every character is one a header can carry,
 * which leaves `"` and `\` as the only characters JSON needs escaped. Claude Code sends an `apiKeyHelper`'s key in a
 * header too, and refuses one outside printable ASCII, so the same rule holds for the key alone. Written
 * synchronously, so it is out before the exit.
 */
function headersOne(header: string | null, value: Plaintext, io: KeysIo): number {
  if (/[^\x20-\x7e]/.test(value)) {
    io.say('That key holds a character a header cannot carry, such as a line break, so it was not printed.');
    return REFUSED;
  }
  if (header === null) {
    writeFileSync(1, `${value}\n`);
    return 0;
  }
  const quoted = value.replace(/["\\]/g, '\\$&');
  writeFileSync(1, `{"${header}":"${quoted}"}\n`);
  return 0;
}

/**
 * `keys headers`: one key read back and printed as a header, for Claude Code's `headersHelper` (the file's header
 * says why this command exists at all). And `keys helper` (`helper` true): the key alone, for its `apiKeyHelper`.
 *
 * REFUSED BEFORE ANYTHING IS READ OR SENT when standard output is a terminal, because then a person is reading it and
 * not a program. Keychain access and never the login, as `exec`: the login may add a key and never read one.
 */
async function openHeader(label: string, flags: { as?: string | undefined; vault?: string | undefined; host?: string | undefined }, io: KeysIo, helper = false): Promise<number> {
  if ((io.terminal ?? (() => process.stdout.isTTY === true))()) {
    io.say(
      helper
        ? "braindog keys helper prints a key for a program that reads its standard output, such as Claude Code's apiKeyHelper, and standard output here is a terminal, so nothing was opened."
        : 'braindog keys headers prints a key for a program that reads its standard output, such as a headersHelper, and standard output here is a terminal, so nothing was opened.',
    );
    return REFUSED;
  }
  if (!helper && (flags.as === undefined || !HEADER_NAME.test(flags.as))) {
    io.say('--as takes the name of the header the key goes in, such as Authorization: letters, digits, -, _ and . only.');
    return REFUSED;
  }
  const header = helper ? null : (flags.as ?? null);
  const door = doorFor(flags, io, false);
  if (typeof door === 'string') {
    io.say(door);
    return REFUSED;
  }
  try {
    const ask = SPOKEN.test(label) ? { credential: label } : { label };
    const got = await getWaiting(door, ask, label, await io.headers(door.key), io);
    if ('refused' in got) {
      io.say(refusedLine(door, got.refused));
      return REFUSED;
    }
    return headersOne(header, got.value, io);
  } catch {
    if (io.signal?.aborted) {
      io.say('Stopped before the host answered.');
      return REFUSED;
    }
    io.say(`${door.key} did not answer.`);
    return UNREACHABLE;
  }
}

/** The variable a label becomes when `--as` is not given: upper case, other runs to `_`, no leading digits or `_`. */
export function variableOf(label: string): string {
  return label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^[0-9_]+/, '');
}

const USAGE_PUT = 'braindog keys put takes one label, --opens, --kind, --everywhere, --keychain and --host, and reads the value from standard input, or asks for it at a terminal.';
const USAGE_EXEC = 'braindog keys exec takes one label or credentials#n, --as, --keychain and --host, then -- and the command to run.';
const USAGE_HEADERS = 'braindog keys headers takes one label or credentials#n, --as with the header name, --keychain and --host, and nothing else.';
const USAGE_HELPER = 'braindog keys helper takes one label or credentials#n, --keychain and --host, and nothing else.';

/** `braindog keys list|put|scan|exec|headers|helper`, and the exit code: for `exec`, the command's own once it has run. */
/**
 * How many lines a value has, when it holds several and is not one of the two shapes that are meant to: a private key's
 * armour, or a JSON service account. `null` for anything else.
 *
 * A WHOLE NOTES FILE WENT IN AS A KEY. The Sketchpad metrics key held 15 lines of explanation with the token on the last,
 * sealed with no word when the old PC's secrets were carried over. Every request it signed was wrong, and the first
 * answer threw while striking 633 bytes of it from the reply, so the script stopped with an error that was not in its
 * code.
 */
export function manyLines(value: string): number | null {
  const lines = value.split(/\r?\n/u).filter((line) => line.trim() !== '').length;
  if (lines < 2) return null;
  const text = value.trim();
  return text.startsWith('{') || /^-----BEGIN [A-Z ]+-----/u.test(text) ? null : lines;
}

export async function keys(args: string[], io: KeysIo): Promise<number> {
  /* `keys run` IS `keys exec`, as the top-level `run` is: the help named the pair, and the verb was refused. */
  const [said, ...all] = args;
  const verb = said === 'run' ? 'exec' : said;
  /* `list` READS THE INDEX AND OPENS NOTHING, so it has a file and a path of its own (`keys-list.ts`). */
  if (verb === 'list') return keysList(all, io);
  /* `scan` READS NAMES AND SENDS NOTHING, and `put --from` READS A FILE OR A FOLDER OF KEYS, so each has a file of its
     own (`keys-scan.ts`, `keys-many.ts`); the value still leaves only through `sealOne` here. */
  if (verb === 'scan') return keysScan(all, io);
  if (verb === 'put' && all.some((a) => a === '--from' || a.startsWith('--from='))) return keysPutMany(all, io);
  if (verb !== 'put' && verb !== 'exec' && verb !== 'headers' && verb !== 'helper') {
    io.say(
      'braindog keys takes put <label>, with the value piped in or typed when asked, put --from <file or folder>, scan [<folder>], exec <label> -- <command>, headers <credential> --as <Header>, helper <credential>, or list.',
    );
    return REFUSED;
  }
  const usage = verb === 'put' ? USAGE_PUT : verb === 'exec' ? USAGE_EXEC : verb === 'helper' ? USAGE_HELPER : USAGE_HEADERS;

  /* EVERYTHING AFTER THE FIRST `--` IS THE COMMAND, flags and all, and is never read as this command's own. */
  const cut = verb === 'exec' ? all.indexOf('--') : -1;
  const rest = cut === -1 ? all : all.slice(0, cut);
  const command = cut === -1 ? [] : all.slice(cut + 1);

  let values: {
    opens?: string | undefined;
    kind?: string | undefined;
    everywhere?: boolean | undefined;
    vault?: string | undefined;
    keychain?: string | undefined;
    host?: string | undefined;
    as?: string | undefined;
  };
  let positionals: string[];
  try {
    ({ values, positionals } =
      verb === 'put'
        ? parseArgs({
            args: rest,
            allowPositionals: true,
            strict: true,
            options: { opens: { type: 'string' }, kind: { type: 'string' }, everywhere: { type: 'boolean' }, vault: { type: 'string' }, keychain: { type: 'string' }, host: { type: 'string' } },
          })
        : verb === 'helper'
          ? parseArgs({ args: rest, allowPositionals: true, strict: true, options: { vault: { type: 'string' }, keychain: { type: 'string' }, host: { type: 'string' } } })
          : parseArgs({ args: rest, allowPositionals: true, strict: true, options: { as: { type: 'string' }, vault: { type: 'string' }, keychain: { type: 'string' }, host: { type: 'string' } } }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a value typed as an argument. */
    io.say(usage);
    return REFUSED;
  }
  /* `--keychain` IS THE NAME, and `--vault` stays as the same flag for scripts and installed docs. */
  values.vault = values.keychain ?? values.vault;
  const [label, ...more] = positionals;
  if (label === undefined || more.length > 0 || !label.trim()) {
    io.say(usage);
    return REFUSED;
  }
  /* `headers` TAKES `exec`'s FLAGS AND NO COMMAND, and has a path of its own from here, which `helper` shares. */
  if (verb === 'headers') return openHeader(label.trim(), values, io);
  if (verb === 'helper') return openHeader(label.trim(), values, io, true);

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
    let read = io.stdin();
    /* AT A TERMINAL IT ASKS, with nothing echoed: the value is never on the screen, in argv or in shell history. A pipe
       is read as it always was. */
    const typed = read === null && io.secret !== undefined;
    if (typed) read = await io.secret!('Paste or type the key, then press Enter (nothing you type is shown): ');
    if (read === null) {
      io.say(
        typed
          ? 'Nothing was deposited.'
          : 'braindog keys put reads the value from standard input, so pipe it in, or run it at a terminal to be asked; a value is never an argument, because shell history keeps those.',
      );
      return REFUSED;
    }
    /* One trailing newline is what `echo` and a file's last line add, and never part of a key. */
    value = unbom(read).replace(/\r?\n$/, '') as Plaintext;
    if (!value) {
      io.say(typed ? 'Nothing was typed, so nothing was deposited.' : 'Standard input was empty, so nothing was deposited.');
      return REFUSED;
    }
    const lines = manyLines(value);
    if (lines !== null) {
      io.say(`This value has ${String(lines)} lines, and a key is one line, so nothing was deposited. Pipe in the key alone, not the file it is written in.`);
      return REFUSED;
    }
  }

  const door = doorFor(values, io, verb === 'put');
  if (typeof door === 'string') {
    io.say(door);
    return REFUSED;
  }

  let exited: Promise<number>;
  try {
    const headers = await io.headers(door.key);
    if (verb === 'put' && value !== null) {
      /* `--everywhere` KEEPS IT FOR EVERY PROJECT, as a script needs: under a login the record files a new key in the
         session's project otherwise, and it says plainly when only the owner may make one for every project. */
      const ask = { label: label.trim(), ...(values.opens ? { opens: values.opens } : {}), ...(values.kind ? { kind: values.kind } : {}), ...(values.everywhere === true ? { everywhere: true as const } : {}) };
      const answer = await depositWaiting(door, ask, value, headers, io);
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
    const got = await getWaiting(door, ask, label.trim(), headers, io);
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
