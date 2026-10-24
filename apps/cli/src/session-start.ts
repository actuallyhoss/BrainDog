/**
 * The work a session's start does on this machine: the skills sync and the tools scan, as one function.
 *
 * TWO CALLERS. Claude Code's start hook calls `startWork` at every start of a session (`hooks.ts`). An app with no
 * such hook (Codex, Cursor, and whatever else `braindog mcp --agent` is registered in) gets the same work from its MCP
 * server: `startFromServer`, once that server's first `initialize` has been answered, at most once a day for a
 * machine, a folder and an app (`~/.braindog/started.json`), in the background and inside the hook's time limit. So a
 * session in any app syncs the project's skills, has its servers scanned, and is placed in its project by the folder it
 * started in, which the record reads from the same session headers every call carries.
 *
 * BEHIND A TAG (`startTag`). The work runs only when something it reads moved since it last ran whole here: the
 * record's Skills and Tools rows, which the attach's own context carries, or the files on this machine. So a start in a
 * folder where nothing moved is the attach alone, one round trip, where it was the attach and then every request of
 * the sync and the scan. A start hook that ran out of time leaves the work owed, and Claude Code's MCP server does it in
 * the background once the hook's time is over.
 *
 * IT RUNS ONLY WHEN AN APP STARTS A SESSION. Nothing here is on a clock or at night.
 *
 * NOTHING IT SAYS REACHES THE PROTOCOL. Every line goes to the caller's `say`, which the MCP server points at stderr,
 * and no line quotes an error, because an error could quote anything.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';

import type { Brief, Client, Context } from '@braindog/client';
import { refused } from '@braindog/ports';

import { CLIENTS } from './clients/index.ts';
import { clientFor, hostsPath, type Target } from './http.ts';
import { cliBuild, git, sessionHeaders, type Agent, type Position } from './position.ts';
import { syncSkills } from './skills.ts';
import { depositor, scanTools } from './tools.ts';

type Env = Record<string, string | undefined>;

/** What the start work needs from its process: the environment, and the home folder when a test names another. */
export type StartIo = { env: Env; home?: string | undefined };

/** Each of the sync and the scan gets at most this long, inside what is left of the caller's budget. */
export const START_WORK_MS = 3_000;

/**
 * THE START HOOK'S WORK RUNS AFTER THE CARD, in a process of its own (`hooks.ts`, `spawnWork`), with this long for the
 * whole and `WORK_STEP_MS` for each step. Inside the hook the sync and the scan held every card for up to six seconds
 * the card never used, and on the owner's record a skills list that took 3.3 s to read never finished inside its 1.5 s,
 * so the same work was owed again at every start (audit of 22 Oct, E2).
 */
export const WORK_MS = 120_000;
export const WORK_STEP_MS = 45_000;

/**
 * Whether the start work is owed here, from the attach's context and this machine's files alone: no request.
 *
 * NOT WHEN THE RECORD HAS NEITHER REGISTER, and not when the tag here is the one the work last ran whole at. A place
 * whose tag cannot be told (a skills list the context cut short) is owed once a day: after a whole run here it keeps an
 * empty tag, and the next run is the next day's.
 */
export function startOwed(io: StartIo, to: Target, at: Position, context: Context, top: string | null, now: number = Date.now()): boolean {
  const wants = (id: string) => context.registers.some((r) => r.id === id);
  if (!wants('skills') && !wants('tools')) return false;
  const home = io.home ?? homedir();
  const place = placeOf(io.env, home, to, at, top);
  const kept = readTags(home)[tagKey(place)];
  if (underWay(kept, now)) return false;
  if (kept === undefined || kept.owed === true) return true;
  const tag = startTag(io.env, home, place, top, at.cwd, context);
  if (tag !== null) return kept.tag !== tag;
  return !(kept.tag === '' && kept.at !== undefined && dayOf(Date.parse(kept.at)) === dayOf(now));
}

/** Where the work runs, as its tag is keyed: the host, the machine, the repository's top folder (or the folder), Claude's config. */
const placeOf = (env: Env, home: string, to: Target, at: Position, top: string | null): Place => ({
  host: to.key,
  machine: at.host,
  folder: top ?? resolve(at.cwd),
  configDir: env.CLAUDE_CONFIG_DIR || join(home, '.claude'),
});

/** The repository's top folder `at` stands in, or `null` outside one. */
export async function topOf(at: Position): Promise<string | null> {
  const found = await git(at.cwd, 'rev-parse', '--show-toplevel');
  return found === null ? null : resolve(found);
}

/**
 * Skills sync, then tools scan, at a session's start, and what each did as one item of the card's More.
 *
 * A COUNT AND NOT THE LINES. What the two did is housekeeping: files written, a row recorded, an edit proposed, which
 * the owner meets on Decide and `braindog skills sync` and `braindog tools scan` say in full. Their lines carried file
 * paths and ids, and are not what an agent starts from.
 *
 * NOTHING AT ALL WHEN IT IS NOT OWED HERE (`startOwed`): no request. Each step runs on its own client and deadline, at
 * most `stepMs` long, and a failure is one fixed item, because an error could quote anything; a failure or a step with
 * no time left leaves the work owed.
 *
 * `headers`, when given, are the session headers every request of the work carries, as the MCP server sends its own;
 * left out, they are Claude Code's for `run`, as the start hook has always sent them.
 */
export async function startWork(
  io: StartIo,
  to: Target,
  at: Position,
  context: Context,
  run: { spoken?: string | undefined; client_id?: string | undefined },
  until: number,
  headers: Record<string, string> = sessionHeaders(at, 'claude', run, { env: io.env }),
  stepMs: number = START_WORK_MS,
): Promise<string[]> {
  const wants = (id: string) => context.registers.some((r) => r.id === id);
  if (!wants('skills') && !wants('tools')) return [];
  const home = io.home ?? homedir();
  const top = await topOf(at);
  const configDir = io.env.CLAUDE_CONFIG_DIR || join(home, '.claude');
  /* NOTHING MOVED SINCE THE LAST TIME IT RAN WHOLE, HERE: no request, and the start is the attach alone. */
  if (!startOwed(io, to, at, context, top)) return [];
  const place = placeOf(io.env, home, to, at, top);
  const kept = readTags(home)[tagKey(place)];
  const before = startTag(io.env, home, place, top, at.cwd, context);
  /* UNDER WAY, AND OWED UNTIL IT ENDS: a start meanwhile leaves it alone, and a run that dies is owed again later. */
  try {
    keepTag(home, tagKey(place), { tag: kept?.tag ?? '', owed: true, running: true });
  } catch {
    /* A home folder that cannot be written may run the work twice at once, as it always could. */
  }
  const said: string[] = [];
  /* WHOLE ONLY WHEN EVERY STEP RAN TO ITS END: one that ran out of time or failed leaves the work owed. */
  let whole = true;
  const step = async (label: string, work: (client: Client, signal: AbortSignal, ms: number) => Promise<string[]>) => {
    const left = until - Date.now() - 250;
    if (left <= 0) {
      whole = false;
      return;
    }
    const ms = Math.min(stepMs, left);
    const signal = AbortSignal.timeout(ms);
    try {
      const lines = await work(clientFor(to, async () => headers, signal), signal, ms);
      if (lines.length > 0) said.push(`${label}: ${String(lines.length)} change${lines.length === 1 ? '' : 's'}`);
    } catch {
      whole = false;
      said.push(`${label} skipped`);
    }
  };
  if (wants('skills'))
    /* The list read stops at half the step's time, on the hook's clock, so what was read is still acted on inside it. */
    await step('skills sync', (client, _signal, ms) =>
      syncSkills({ client, context, home, configDir, top, dryRun: false, until: Date.now() + ms / 2, to }),
    );
  if (wants('tools'))
    await step('tools scan', (client, signal) =>
      scanTools({
        client,
        context,
        top,
        cwd: at.cwd,
        home,
        dryRun: false,
        deposit: depositor({ file: hostsPath(io.env), env: io.env, host: to.key, headers, signal }),
        /* The no-grant sentence once, not at every start. */
        once: { host: to.key, hosts: hostsPath(io.env) },
      }),
    );
  /* THE TAG AFTER THE WORK, because the work itself writes the lock files and the skill files it reads next time. A
     place whose tag cannot be told keeps an empty one with its time, which says the work ran whole here that day. */
  const after = whole ? startTag(io.env, home, place, top, at.cwd, context) : null;
  try {
    keepTag(home, tagKey(place), after !== null ? { tag: after } : before === null && whole ? { tag: '' } : { tag: kept?.tag ?? '', owed: true });
  } catch {
    /* A home folder that cannot be written runs the work again at the next start, as it always did. */
  }
  return said;
}

/* ── the tag: whether anything the work reads moved ────────────────────── */

/** Where the start work runs: the host, the machine, the repository's top folder (or the folder), and Claude's config. */
type Place = { host: string; machine: string; folder: string; configDir: string };

/**
 * What the work last left here: the tag it ran whole at, or `owed` when it did not finish and the server owes it.
 * `running` while a run of it is under way since `at`, owed until it ends, so a second start does not run it beside.
 */
export type Tagged = { tag: string; at?: string; owed?: true; running?: true };

/** A run under way here, started less than the work's whole budget ago: one that died longer ago is owed again. */
const underWay = (t: Tagged | undefined, now: number): boolean => t?.running === true && t.at !== undefined && now - Date.parse(t.at) < WORK_MS;

/** `~/.braindog/start-tag.json`: one hash a place, never a key, a path or a row. */
export const startTagPath = (home: string): string => join(home, '.braindog', 'start-tag.json');

/* The places kept, newest first: a few folders a day, and the file stays small however long the machine is used. */
const TAGS_KEPT = 64;

const sha = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const tagKey = (p: Place): string => sha(JSON.stringify([p.host, p.machine, p.folder, p.configDir])).slice(0, 24);

function readTags(home: string): Record<string, Tagged> {
  try {
    const x: unknown = JSON.parse(readFileSync(startTagPath(home), 'utf8'));
    if (!isObject(x) || !isObject(x.tags)) return {};
    const out: Record<string, Tagged> = {};
    for (const [key, t] of Object.entries(x.tags))
      if (isObject(t) && typeof t.tag === 'string')
        out[key] = { tag: t.tag, ...(typeof t.at === 'string' ? { at: t.at } : {}), ...(t.owed === true ? { owed: true as const } : {}), ...(t.running === true ? { running: true as const } : {}) };
    return out;
  } catch {
    return {};
  }
}

/** One place's tag kept, or dropped with `null`; written whole and renamed, as `markStarted` writes its file. */
function keepTag(home: string, key: string, tagged: Tagged | null): void {
  const { [key]: _was, ...rest } = readTags(home);
  const kept = Object.entries(rest)
    .sort(([, a], [, b]) => (b.at ?? '').localeCompare(a.at ?? ''))
    .slice(0, TAGS_KEPT - 1);
  const tags = Object.fromEntries(tagged === null ? kept : [[key, { ...tagged, at: new Date().toISOString() }], ...kept]);
  const file = startTagPath(home);
  mkdirSync(join(home, '.braindog'), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ tags }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/** Whether the start work here did not finish last time, so the MCP server owes it (`startFromServer`). */
export function owedAt(home: string, place: Place): boolean {
  const kept = readTags(home)[tagKey(place)];
  return kept?.owed === true && !underWay(kept, Date.now());
}

/**
 * EVERYTHING THE SKILLS SYNC AND THE TOOLS SCAN READ, AS ONE HASH, or `null` when it cannot be told, so the work runs.
 *
 * THE RECORD'S HALF COMES IN THE ATTACH'S OWN ANSWER: the Skills and Tools rows `context` shows, by name, version, state
 * and scope, and the project. A list the context cut short (`truncated`) has rows it did not show, so no tag is made and
 * the work runs, as it did at every start. THE MACHINE'S HALF is read here and costs no request: the two lock files, each
 * skill and command file by size and time, the MCP servers each app's config names as the scan parses them (Claude
 * Code rewrites `~/.claude.json` at every start, so its time says nothing), the hosts file, and this command's build.
 */
export function startTag(env: Env, home: string, place: Place, top: string | null, cwd: string, context: Context): string | null {
  const rows: unknown[] = [];
  for (const id of ['skills', 'tools']) {
    const reg = context.registers.find((r) => r.id === id);
    if (reg === undefined) continue;
    /* A SKILLS LIST CUT SHORT IS READ WHOLE BY THE SYNC, page by page, so rows it did not show could move unseen. The
       scan reads only what the context shows, and says so when the list was cut, so a cut tools list is tagged as shown. */
    if (reg.truncated && id === 'skills') return null;
    /* A TOOL'S VERSION IS LEFT OUT: the scan itself writes what it saw onto the tools rows at every run, so their
       versions move with each one and a tag holding them would never hold. Which tools there are, and their state, stay. */
    const of = (r: Brief): unknown[] => (id === 'tools' ? [r.spoken, r.state, r.scope] : [r.spoken, r.version, r.state, r.scope]);
    rows.push(id, reg.truncated, [...reg.rows, ...reg.inherited].map(of).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  }
  const stat = (path: string): unknown[] => {
    try {
      const s = statSync(path);
      return [path, s.size, Math.round(s.mtimeMs)];
    } catch {
      return [path];
    }
  };
  const content = (path: string): string | null => {
    try {
      return sha(readFileSync(path));
    } catch {
      return null;
    }
  };
  const names = (dir: string): string[] => {
    try {
      return readdirSync(dir).sort().slice(0, 500);
    } catch {
      return [];
    }
  };
  const files: unknown[] = [];
  for (const base of [place.configDir, ...(top === null ? [] : [join(top, '.claude')])]) {
    for (const name of names(join(base, 'skills'))) files.push(stat(join(base, 'skills', name, 'SKILL.md')));
    for (const name of names(join(base, 'commands'))) files.push(stat(join(base, 'commands', name)));
  }
  const servers = CLIENTS.map((app) => {
    try {
      return [app.id, app.servers(home, top, cwd).map((s) => [s.scope, s.source, s.fault, s.servers])];
    } catch {
      return [app.id, null];
    }
  });
  return sha(
    JSON.stringify([
      cliBuild(),
      place,
      context.project?.spoken ?? null,
      rows,
      content(join(home, '.braindog', 'skills-lock.json')),
      content(join(home, '.braindog', 'tools-lock.json')),
      files,
      sha(JSON.stringify(servers)),
      stat(hostsPath(env)),
    ]),
  ).slice(0, 32);
}

/* ── once a day for a machine, a folder and an app ─────────────────────── */

/** One start the MCP server did: on which machine, in which folder, for which app, and on which day. */
type Started = { machine: string; folder: string; client: string; day: string };

/** `~/.braindog/started.json`: a few names and a day each, never a key or a token. */
export const startedPath = (home: string): string => join(home, '.braindog', 'started.json');

/** The day `now` falls on, on this machine's calendar, so a day is the person's own and not UTC's. */
export function dayOf(now: number): string {
  const d = new Date(now);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStarted = (x: unknown): x is Started =>
  isObject(x) && typeof x.machine === 'string' && typeof x.folder === 'string' && typeof x.client === 'string' && typeof x.day === 'string';

/** What the file holds, or nothing when there is none or it is not one this command wrote. */
function readStarted(home: string): Started[] {
  const file = startedPath(home);
  if (!existsSync(file)) return [];
  try {
    const x: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isObject(x) && Array.isArray(x.started) ? x.started.filter(isStarted) : [];
  } catch {
    return [];
  }
}

const same = (s: Started, machine: string, folder: string, client: string) => s.machine === machine && s.folder === resolve(folder) && s.client === client;

/** Whether the MCP server already did the start work today on this machine, in this folder, for this app. */
export function startedToday(home: string, machine: string, folder: string, client: string, now: number = Date.now()): boolean {
  const day = dayOf(now);
  return readStarted(home).some((s) => s.day === day && same(s, machine, folder, client));
}

/**
 * Keep that the start work ran today for this machine, folder and app. Written whole to a file beside it and renamed
 * over it, so a server that reads it mid-write reads the old one or the new one. Only today's starts are kept, so the
 * file stays a few lines however many days go by.
 */
export function markStarted(home: string, machine: string, folder: string, client: string, now: number = Date.now()): void {
  const day = dayOf(now);
  const kept = readStarted(home).filter((s) => s.day === day && !same(s, machine, folder, client));
  const file = startedPath(home);
  mkdirSync(join(home, '.braindog'), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ started: [...kept, { machine, folder: resolve(folder), client, day }] }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/* ── from the MCP server ───────────────────────────────────────────────── */

/** The apps whose own start hook does the start work at every start, so their MCP server leaves it to the hook. */
export const HOOKED: readonly Agent[] = ['claude'];

/** What the MCP server hands the start work: where it runs, for which app, and the headers its own requests carry. */
export type FromServer = {
  io: StartIo;
  to: Target;
  where: Position | Promise<Position>;
  /** The app `--agent` names; an unnamed one is `other`. */
  agent: Agent | undefined;
  /** The session headers the server sends with every request, so the work is the same run as the session's. */
  headers: () => Promise<Record<string, string>>;
  /** The whole budget, the start hook's (`hookBudget`). */
  ms: number;
  /** One line for the server's log, on stderr. */
  say: (line: string) => void;
  /** This machine's name; the network name `positionOf` reads when left out. */
  machine?: string | undefined;
  now?: (() => number) | undefined;
  /** How an app with a start hook waits for that hook to be done before it looks for work owed: `ms`, on a timer. */
  wait?: ((ms: number) => Promise<void>) | undefined;
};

/** What came of it, for a test: the work ran, it ran today already, the app has its own hook, or the record did not answer. */
export type Outcome = 'ran' | 'already' | 'hooked' | 'away' | 'failed';

/**
 * The start work for a session an app started through `braindog mcp`. Never throws: a failure is one line on `say`
 * and the server goes on. Marked as done for the day only once the record has answered, so a start with the host away
 * leaves the work to the next one.
 */
export async function startFromServer(s: FromServer): Promise<Outcome> {
  const now = s.now ?? Date.now;
  const began = now();
  /* THE BUDGET RUNS ON THE MACHINE'S OWN CLOCK, as `startWork` reads it; `now` names the day the start is marked on. */
  let until = Date.now() + s.ms;
  try {
    const client = s.agent ?? 'other';
    const hooked = HOOKED.includes(client);
    /* AN APP WITH A START HOOK LEAVES THE WORK TO IT, unless the hook left it owed here, and nothing is asked of the record. */
    if (hooked && !(await owedHere(s))) return 'hooked';
    const at = await s.where;
    const home = s.io.home ?? homedir();
    const machine = s.machine ?? (at.host || hostname());
    if (hooked) {
      /* ONCE THE HOOK'S OWN TIME IS OVER, so the two never sync at once, and only if it is still owed then. */
      await (s.wait ?? ((ms) => new Promise<void>((done) => setTimeout(done, ms).unref())))(s.ms);
      if (!(await owedHere(s))) return 'hooked';
      until = Date.now() + s.ms;
    } else if (startedToday(home, machine, at.cwd, client, began)) return 'already';
    const headers = await s.headers().catch(() => ({}) as Record<string, string>);
    const signal = AbortSignal.timeout(Math.max(1, until - Date.now()));
    const out = await clientFor(s.to, async () => headers, signal).context();
    if (!out.ok) {
      const away = signal.aborted || (refused(out) && out.refusal.code === 'UNREACHABLE');
      s.say(
        away
          ? `BrainDog did not answer within ${String(s.ms / 1000)} seconds, so the start work waits for the next session.`
          : `BrainDog did not do the start work: ${refused(out) ? out.refusal.fix : 'the host did not answer.'}`,
      );
      return 'away';
    }
    try {
      if (!hooked) markStarted(home, machine, at.cwd, client, began);
    } catch {
      /* A home folder that cannot be written runs the work again at the next start, and costs nothing else. */
    }
    const did = await startWork(s.io, s.to, at, out.value, {}, until, headers);
    if (did.length > 0) s.say(`BrainDog at the start of this session: ${did.join(', ')}.`);
    return 'ran';
  } catch {
    s.say('BrainDog could not do the start work for this session, and the server goes on.');
    return 'failed';
  }
}

/** Whether the start hook left the work owed in the server's folder, read from the tag file alone. */
async function owedHere(s: FromServer): Promise<boolean> {
  const at = await s.where;
  const home = s.io.home ?? homedir();
  const found = await git(at.cwd, 'rev-parse', '--show-toplevel');
  const folder = found === null ? resolve(at.cwd) : resolve(found);
  return owedAt(home, { host: s.to.key, machine: at.host, folder, configDir: s.io.env.CLAUDE_CONFIG_DIR || join(home, '.claude') });
}

/* Every `initialize` result carries the revision agreed, and no other reply does. */
const isHelloReply = (line: string): boolean => {
  if (!line.includes('"protocolVersion"')) return false;
  try {
    const x: unknown = JSON.parse(line);
    return isObject(x) && isObject(x.result) && typeof x.result.protocolVersion === 'string';
  } catch {
    return false;
  }
};

/**
 * The server's output, passed on to `out` byte for byte, which calls `then` once, just after the first answer to an
 * `initialize` was handed on. Each write's callback is `out`'s own, so "flushed" still means flushed; an error writing
 * is `out`'s to report, where the server already listens for it.
 */
export function afterHello(out: { write(chunk: Uint8Array, cb: (err?: Error | null) => void): boolean }, then: () => void): Writable {
  let done = false;
  let partial = '';
  return new Writable({
    write(chunk: Buffer, _encoding, cb) {
      if (!done) {
        partial += chunk.toString('utf8');
        for (let i = partial.indexOf('\n'); i >= 0 && !done; i = partial.indexOf('\n')) {
          const line = partial.slice(0, i);
          partial = partial.slice(i + 1);
          done = isHelloReply(line);
        }
        if (done) {
          partial = '';
          out.write(chunk, () => {
            cb();
            setImmediate(then);
          });
          return;
        }
      }
      out.write(chunk, () => cb());
    },
  });
}
