/**
 * `braindog login <host>`: the device grant from the terminal (`docs/48-SPEC-CLI.md` §5.2 and §5.3, `12 §6.1`).
 *
 * THE BEARER ARRIVES IN ONE ANSWER AND GOES STRAIGHT INTO THE HOSTS FILE. It is never printed and never part of a
 * sentence, a failure's included, because stderr ends up in an agent's logs.
 *
 * THE ADDRESS PRINTED IS THE HOST'S OWN. A `verification_uri` on any other origin is refused before a digit is
 * shown: six digits typed into a page somebody else controls are an approval they can spend.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { hostKey, inTheClear, isLoopback, readHosts, sameHost, saveHosts } from './http.ts';
import type { Answering } from './json.ts';
import { saidDay } from './said-day.ts';

/* ── the machine's own name ───────────────────────────────────────────── */

/** What `machineName` reads, injectable so a test needs no Mac. */
export type MachineIo = {
  platform?: NodeJS.Platform | undefined;
  hostname?: (() => string) | undefined;
  /** Runs a program with no shell and answers its stdout, as `execFile` does. */
  run?: ((file: string, args: string[]) => Promise<string>) | undefined;
};

const runFile = (file: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 2_000, encoding: 'utf8' }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });

/** One line of at most sixty characters, with no control character and no ` · `, which the label spends as its seam. */
const tidy = (raw: string): string =>
  raw.replace(/\p{Cc}+/gu, ' ').replaceAll(' · ', ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();

/**
 * The name this machine goes by to its owner: on a Mac the one set in the system ("Studio"), read with `scutil` and no
 * shell, and elsewhere the host name with a trailing `.local` cut.
 *
 * THE HOST NAME ALONE READ "STUDIO-PC.local · braindog-cli", which is the network's spelling and not a name anybody
 * gave the machine. The record stamps what comes before the label's first ` · ` as the device's host, so this is the
 * name Settings shows beside the app. Never empty: a failing `scutil`, or a blank answer, falls back to the host name.
 */
export async function machineName(io: MachineIo = {}): Promise<string> {
  const host = (io.hostname ?? hostname)();
  const plain = tidy(host.replace(/\.local\.?$/i, '')) || tidy(host) || 'this machine';
  if ((io.platform ?? process.platform) !== 'darwin') return plain;
  try {
    return tidy(await (io.run ?? runFile)('scutil', ['--get', 'ComputerName'])) || plain;
  } catch {
    return plain;
  }
}

/* ── the login this machine keeps, and when it lapses ──────────────────── */

/**
 * The command that signs this machine in to `host`, written out whole.
 *
 * `node <this main.ts>` AND NOT `braindog`, because `braindog` is not on his PATH: he runs `node apps\cli\src\main.ts`,
 * and the MCP server `install` registers is this same file under `node`. A
 * line that says `braindog login` is one he has to translate before it runs. Double quotes, and forward slashes as the
 * server entry has them, because that one spelling of the path is read the same by PowerShell, `cmd` and Git Bash.
 */
export function loginCommand(host: string): string {
  return `node "${fileURLToPath(new URL('./main.ts', import.meta.url)).replaceAll('\\', '/')}" login ${host}`;
}

/**
 * What to type when no host is known at all: the address the app prints, with the slug left for the person.
 *
 * ON `app.brain.dog`, for the reason at `signIn` in `main.ts`: only production's `PUBLIC_HOST` starts a device, so an
 * agent that passed `brain.dog` would be handing the person a login that answers 403.
 */
export const ANY_HOST = 'https://app.brain.dog/<slug>';

/**
 * The host the next command will reach and the expiry of the login this machine keeps for it, found as `target` finds
 * them: `--host`, then `BRAINDOG_HOST`, then the file's default, matched by `sameHost`, so the two cannot come to name
 * different entries. `expires` is `null` when the bearer in use is not the file's (`BRAINDOG_TOKEN` beats the file) or
 * the file keeps none for that host. Throws what `readHosts` and `hostKey` throw.
 */
export function heldLogin(flag: string | undefined, env: Record<string, string | undefined>, file: string): { host: string | null; expires: string | null } {
  const hosts = readHosts(file);
  const named = flag || env.BRAINDOG_HOST || hosts.default;
  if (!named) return { host: null, expires: null };
  const host = hostKey(named);
  if (env.BRAINDOG_TOKEN) return { host, expires: null };
  const token = Object.entries(hosts.hosts).find(([written]) => sameHost(written, host))?.[1]?.token;
  const kept = typeof token?.value === 'string' && token.value !== '' && typeof token.expires === 'string' && !Number.isNaN(Date.parse(token.expires));
  return { host, expires: kept ? token.expires : null };
}

/**
 * How long before the lapse the start hook says so.
 *
 * THE LAPSE IS NINETY DAYS AND IT DOES NOT SLIDE. A login is minted for `DEFAULT_DAYS = 90`
 * (`packages/kernel/src/token.ts:47`, `packages/kernel/src/device.ts:250` to `:261`) and nothing in the kernel moves its
 * `expires_at` afterwards, however often it is used. The date is read from the hosts file, never counted from ninety,
 * because it is the host's answer and a host may one day mint a different length. Fourteen days, so a person who opens
 * a session each working day sees it on ten of them before the day the server has nothing to reach.
 */
export const LAPSE_WARN_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * The line the start hook prints above everything else when the kept login lapses within `LAPSE_WARN_DAYS`, or `null`.
 *
 * NOTHING ONCE IT HAS LAPSED: `target` throws then, and the hook already says that the login expired and what to run.
 * Any error is `null` for the same reason: a hosts file that cannot be read is the hook's own line to say, and a hook
 * never fails a session.
 */
export function lapseWarning(env: Record<string, string | undefined>, file: string, now: number = Date.now()): string | null {
  let held: { host: string | null; expires: string | null };
  try {
    held = heldLogin(undefined, env, file);
  } catch {
    return null;
  }
  if (held.host === null || held.expires === null) return null;
  const left = Date.parse(held.expires) - now;
  if (left <= 0 || left > LAPSE_WARN_DAYS * DAY_MS) return null;
  const days = Math.floor(left / DAY_MS);
  const when = days === 0 ? 'within a day' : `in ${String(days)} ${days === 1 ? 'day' : 'days'}`;
  return `BrainDog: the login to ${held.host} lapses on ${saidDay(held.expires, now)}, ${when}. After that every session starts without BrainDog. Tell the person to sign in again before then: ${loginCommand(held.host)}`;
}

export type LoginIo = {
  /** The hosts file the token is kept in. */
  file: string;
  /** One line to stderr. */
  say: (line: string) => void;
  /** Aborted by Ctrl+C. */
  signal?: AbortSignal | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  /** How this machine is named to the person approving it. */
  label?: string | undefined;
  now?: (() => number) | undefined;
  /**
   * Keychain access rather than a login: `things#3`, a project row id, or `*` for the keys of no project. Its bearer is
   * kept under that scope in the hosts file, beside the login token and never in its place.
   */
  vault?: string | undefined;
  /**
   * Under `--json`, where the machine-readable half of the answer goes (`json.ts`).
   *
   * THE VALUE IS THE THREE FACTS THE SENTENCE CARRIES AND NOT ONE MORE: which host, under which
   * label, until when. The bearer is not in it, and this is the one command that has a bearer in hand
   * at the moment it answers.
   */
  answer?: Answering | undefined;
};

/** A project by its spoken id or row id, or `*`. Checked before it is sent or written into a sentence. */
const SCOPE = /^(?:\*|[a-z][a-z0-9_]{0,63}#[1-9][0-9]{0,8}|[0-9A-HJKMNP-TV-Z]{26})$/;

/** `48 §4.4`: a refusal, a local failure or a stop is 1, and a host that did not answer is 3. */
const REFUSED = 1;
const UNREACHABLE = 3;

type Answer = { status: number; body: Record<string, unknown> | null; retryAfter: number | null };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A number of seconds the host sent, within reason, or the fallback. */
const seconds = (x: unknown, fallback: number, max: number): number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(x, max) : fallback;

/** A bearer is printable ASCII with no spaces; anything else is not one, whatever the host says. */
const BEARER = /^[\x21-\x7e]{16,1024}$/;

/**
 * Whether an approval address is the typed host under another loopback name: `localhost` for `127.0.0.1`, on the same
 * scheme and port. ONLY WHEN THE TYPED HOST IS THIS MACHINE, so a remote host never answers with another site.
 */
export function sameMachine(origin: string, typed: URL): boolean {
  let other: URL;
  try {
    other = new URL(origin);
  } catch {
    return false;
  }
  return isLoopback(typed.hostname) && isLoopback(other.hostname) && other.protocol === typed.protocol && other.port === typed.port;
}

/** The host a flow runs against, as `hostKey` spells it, or the exit code once the reason has been said. */
function hostOf(raw: string, say: (line: string) => void): { key: string; url: URL } | number {
  let key: string;
  try {
    key = hostKey(raw);
  } catch (e) {
    say(e instanceof Error ? e.message : 'The BrainDog host is not an address.');
    return REFUSED;
  }
  const url = new URL(key);
  if (inTheClear(url)) {
    say(`${key} is http, not https. BrainDog signs in only over https, except on this machine.`);
    return REFUSED;
  }
  return { key, url };
}

export async function login(raw: string, io: LoginIo): Promise<number> {
  const host = hostOf(raw, io.say);
  if (typeof host === 'number') return host;
  const { key } = host;
  const vault = io.vault;
  if (vault !== undefined && !SCOPE.test(vault)) {
    io.say('--keychain names a project by its number, as things#3, or * for the keys that belong to no project.');
    return REFUSED;
  }

  /* READ BEFORE ANYTHING IS ASKED, so a broken hosts file is found before somebody approves a device whose token
     would have nowhere to go. */
  try {
    readHosts(io.file);
  } catch (e) {
    io.say(e instanceof Error ? e.message : `${io.file} could not be read.`);
    return REFUSED;
  }

  const label = (io.label ?? `${await machineName()} · braindog-cli`).slice(0, 120);
  const again = `Run braindog login ${key}${vault === undefined ? '' : ` --keychain ${vault}`} to start again.`;
  const got = await approve(host, vault === undefined ? { reach: 'login' } : { reach: 'vault', scope: vault }, label, {
    again,
    nothing: 'nobody was signed in',
    stopped: 'Sign-in was stopped before it finished, and nothing was saved.',
  }, io);
  if (typeof got === 'number') return got;
  const { bearer, expires } = got;

  /* READ AGAIN, because minutes have passed and another command may have written the file since. */
  try {
    const hosts = readHosts(io.file);
    const held = hosts.hosts[key];
    if (vault === undefined) {
      hosts.hosts[key] = { ...held, token: { value: bearer, expires, label } };
      hosts.default = key;
    } else {
      /* Keychain access sits beside the login and never replaces it, and it makes a host the default only when none is. */
      hosts.hosts[key] = { ...held, vault: { ...held?.vault, [vault]: { value: bearer, expires } } };
      hosts.default ??= key;
    }
    saveHosts(io.file, hosts);
  } catch {
    io.say(`The device was approved and ${io.file} could not be written, so the token was not kept. ${again}`);
    return REFUSED;
  }
  io.say(
    vault === undefined
      ? `Logged in to ${key} as ${label} · token expires ${saidDay(expires)}`
      : `keychain access for ${vault} on ${key} kept as ${label} · expires ${saidDay(expires)}`,
  );
  io.answer?.({ value: { host: key, label, expires, vault: vault ?? null } });
  return 0;
}

/** What one device flow asks the host for: a login, keychain access over one scope, or one operation. */
type Asked = { reach: 'login' } | { reach: 'vault'; scope: string } | { reach: OperationReach; binds?: string } | { reach: 'runner' } | { reach: 'shape' };

/** The SHA-256 of a request body as it will be sent, in hex: what an operation grant is bound to (`binds`). */
export const bodyDigest = (body: string): string => createHash('sha256').update(body, 'utf8').digest('hex');

/** The short print of a bound body the terminal and the app both show, so the person can see it is the same request. */
export const bodyPrint = (binds: string): string => `${binds.slice(0, 4)} ${binds.slice(4, 8)}`;

/** The operation reaches this CLI asks for, each approving one ADMIN call (`OPERATIONS` in `packages/kernel/src/device.ts`). */
export type OperationReach = 'export' | 'import' | 'token';

/** The words a flow ends with that differ by what it asked for: the command that starts it again, and what did not happen. */
type Words = { again: string; nothing: string; stopped: string };

type FlowIo = Pick<LoginIo, 'say' | 'signal' | 'fetch' | 'now'>;

/**
 * RFC 8628 against one host: the code asked for, the six digits said, the poll until a bearer or a refusal. The bearer and
 * its expiry come back, or the exit code once the one sentence has been said.
 */
async function approve(host: { key: string; url: URL }, asked: Asked, label: string, words: Words, io: FlowIo): Promise<{ bearer: string; expires: string } | number> {
  const { key, url } = host;
  const { again } = words;
  const now = io.now ?? Date.now;
  /* THE KEY'S PATH IS THE SLUG, and `hostKey` has already taken any `/app` off the front of it, so an address kept
     from before the app moved to the root, `app.brain.dog/app/acme`, posts `acme` and not `app/acme`. */
  const slug = url.pathname.replace(/^\/+/, '');
  const where = slug ? { slug } : {};

  /* A REDIRECT IS REFUSED, not followed: the device routes never send one, and following it would hand the poll id
     to an address nobody chose. */
  const send = async (path: string, body: object): Promise<Answer> => {
    const res = await (io.fetch ?? globalThis.fetch)(`${url.origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      ...(io.signal ? { signal: io.signal } : {}),
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    const retry = Number(res.headers.get('retry-after'));
    return { status: res.status, body: isObject(parsed) ? parsed : null, retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null };
  };

  /** The one sentence for an answer that is not a success. The host's own sentence where it sent one. */
  const refusedLine = (answer: Answer): string => {
    if (answer.status === 429)
      return `${key} has had too many sign-ins started from this address. Try again in ${Math.max(1, Math.ceil((answer.retryAfter ?? 900) / 60))} minutes.`;
    const refusal = answer.body?.ok === false && isObject(answer.body.refusal) ? answer.body.refusal : null;
    if (refusal?.code === 'DEVICE_CODE_EXPIRED') return `The code expired before anyone approved it. ${again}`;
    if (refusal?.code === 'DEVICE_CODE_TRIES') return `The request was denied after five wrong codes were typed. ${again}`;
    if (typeof refusal?.fix === 'string' && refusal.fix) return refusal.fix.slice(0, 300);
    return `${key} answered in a way this command does not recognise, so ${words.nothing}.`;
  };

  try {
    const started = await send('/auth/device', { ...where, ...asked, label });
    const code = started.body?.ok === true && isObject(started.body.value) ? started.body.value : null;
    if (!code) {
      io.say(refusedLine(started));
      return REFUSED;
    }

    const uri = typeof code.verification_uri === 'string' ? code.verification_uri : '';
    let at = '';
    try {
      at = new URL(uri).origin;
    } catch {
      at = '';
    }
    if (at !== url.origin && !sameMachine(at, url)) {
      io.say(`${key} gave an address on another site to approve this at, so no code was shown and ${words.nothing}.`);
      return REFUSED;
    }
    const userCode = typeof code.user_code === 'string' && /^\d{6}$/.test(code.user_code) ? code.user_code : '';
    const deviceCode = typeof code.device_code === 'string' && code.device_code.length <= 512 ? code.device_code : '';
    if (!userCode || !deviceCode) {
      io.say(`${key} answered in a way this command does not recognise, so ${words.nothing}.`);
      return REFUSED;
    }

    const life = seconds(code.expires_in, 600, 1_800) || 600;
    /* THE PARSED ADDRESS AND NOT THE HOST'S STRING: the parser drops the control characters at its ends and the line
       breaks inside it, so the origin passed above while the string printed could still move the cursor. */
    io.say(`Open ${new URL(uri).href} and enter ${userCode.slice(0, 3)} ${userCode.slice(3)} (${Math.max(1, Math.round(life / 60))} minutes).`);
    /* AND THE ONE REQUEST IT APPROVES, by the print the app shows beside it, when the request was named. */
    if ('binds' in asked && typeof asked.binds === 'string') io.say(`It approves this one request, which the app shows as ${bodyPrint(asked.binds)}.`);

    const deadline = now() + life * 1000;
    let wait = seconds(code.interval, 5, 60);
    for (;;) {
      await delay(wait * 1000, undefined, io.signal ? { signal: io.signal } : {});
      if (now() >= deadline) {
        io.say(`The code expired before anyone approved it. ${again}`);
        return REFUSED;
      }
      const polled = await send('/auth/device/token', { ...where, device_code: deviceCode });
      const value = polled.body?.ok === true && isObject(polled.body.value) ? polled.body.value : null;
      if (!value) {
        io.say(refusedLine(polled));
        return REFUSED;
      }
      if (value.pending === true) {
        /* The reply's interval, so a host that asks for slower polling is obeyed. */
        wait = seconds(value.interval, wait, 60);
        continue;
      }

      const bearer = typeof value.bearer === 'string' && BEARER.test(value.bearer) ? value.bearer : '';
      const expires = typeof value.expires === 'string' && !Number.isNaN(Date.parse(value.expires)) ? value.expires : '';
      if (!bearer || !expires) {
        io.say(`${key} answered in a way this command does not recognise, so ${words.nothing}.`);
        return REFUSED;
      }
      return { bearer, expires };
    }
  } catch {
    if (io.signal?.aborted) {
      io.say(words.stopped);
      return REFUSED;
    }
    /* The error could quote the request, and the request holds the poll id. */
    io.say(`${key} did not answer, so ${words.nothing}.`);
    return UNREACHABLE;
  }
}

/**
 * A ten-minute operation grant for one `export`, one `import` or one `createToken` (`docs/48-SPEC-CLI.md` §13 D1), held by the caller and
 * never written anywhere, or the exit code once the reason has been said.
 *
 * THE LOGIN'S OWN FLOW, AND NOT A SECOND ONE, because every check it makes is one an operation needs as much: the
 * approval address must be the host's, the six digits go to stderr, a redirect is refused, and the bearer never reaches
 * a sentence. What differs is what is asked for and where the bearer goes. `login` keeps its bearer in the hosts file;
 * this hands it back, because the record spends it on first use (`operationGrant` in `packages/kernel/src/device.ts`)
 * and a copy on disk would be a credential that outlives the one request it was approved for.
 *
 * THE REACH IS IN THE LABEL THE APPROVER READS. `deviceStart` takes no subject, so `export` or `import` said in the
 * label is how the person at the browser knows it is not a sign-in they are approving. `token` says it too.
 */
export async function approveOperation(
  raw: string,
  reach: OperationReach,
  io: FlowIo & { label?: string | undefined; body?: string | undefined },
): Promise<{ bearer: string } | number> {
  const host = hostOf(raw, io.say);
  if (typeof host === 'number') return host;
  /* THE REACH IS APPENDED EVEN TO A LABEL THE CALLER CHOSE, and the machine's name is cut rather than the reach. */
  const label = `${(io.label ?? `${await machineName()} · braindog-cli`).slice(0, 110)} · ${reach}`;
  /* THE BODY IT WILL SEND, BY ITS SHA-256 (`binds`): the host takes the bearer for that body and no other, so the word
     "token" the person approves cannot be spent on a token wider or longer than the one this command asked for. */
  const got = await approve(host, io.body === undefined ? { reach } : { reach, binds: bodyDigest(io.body) }, label, {
    again: `Run braindog ${reach} again to ask for a new code.`,
    nothing: 'nothing was approved',
    stopped: `The approval was stopped before it finished, and nothing was ${reach === 'export' ? 'exported' : reach === 'import' ? 'sent' : 'made'}.`,
  }, io);
  return typeof got === 'number' ? got : { bearer: got.bearer };
}

/**
 * A runner's enrolment for `braindog runner enrol <host>` (`docs/48-SPEC-CLI.md` §5.13): the
 * host as `hostKey` spells it, and the bearer of reach `runner` with its expiry and the label it was approved under, or
 * the exit code once the reason has been said.
 *
 * THE LOGIN'S OWN FLOW, for `approveOperation`'s reason. The caller keeps the bearer in the hosts file beside the login
 * (`keepRunner` in `http.ts`) and never prints it. THE REACH IS IN THE LABEL, so the person approving reads that this
 * machine will run jobs, and the label is the name the record gives the machine in each job's transcript.
 */
export async function approveRunner(raw: string, io: FlowIo & { label?: string | undefined }): Promise<{ key: string; bearer: string; expires: string; label: string } | number> {
  const host = hostOf(raw, io.say);
  if (typeof host === 'number') return host;
  const label = `${(io.label ?? `${await machineName()} · braindog-cli`).slice(0, 110)} · runner`;
  const got = await approve(host, { reach: 'runner' }, label, {
    again: `Run braindog runner enrol ${host.key} to start again.`,
    nothing: 'this machine was not enrolled',
    stopped: 'Enrolment was stopped before it finished, and nothing was saved.',
  }, io);
  return typeof got === 'number' ? got : { key: host.key, bearer: got.bearer, expires: got.expires, label };
}

/**
 * A standing shape grant for `braindog export --shape`: the host as `hostKey` spells it, and the bearer of
 * reach `shape` with its expiry and label, or the exit code once the reason has been said.
 *
 * THE LOGIN'S OWN FLOW; the caller keeps it beside the login (`keepShape` in `brainfile.ts`) and never prints it.
 */
export async function approveShape(raw: string, io: FlowIo & { label?: string | undefined }): Promise<{ key: string; bearer: string; expires: string; label: string } | number> {
  const host = hostOf(raw, io.say);
  if (typeof host === 'number') return host;
  const label = `${(io.label ?? `${await machineName()} · braindog-cli`).slice(0, 110)} · shape`;
  const got = await approve(host, { reach: 'shape' }, label, {
    again: `Run braindog export --shape --host ${host.key} to ask for a new code.`,
    nothing: 'no shape grant was approved',
    stopped: 'The approval was stopped before it finished, and no shape copy was taken.',
  }, io);
  return typeof got === 'number' ? got : { key: host.key, bearer: got.bearer, expires: got.expires, label };
}
