/**
 * JSON-RPC 2.0, the framing both transports share.
 *
 * ONE FUNCTION, AND IT IS PURE. `handle` takes one parsed message and returns one reply, or `null`
 * for a notification, which is never answered. The command line's stdio loop and the hosts'
 * `POST /mcp` each do their own reading and writing around it, so the two cannot drift in what they
 * say. No `node:` module and no `process`, which the `stack`
 * and `graph` gates require of anything under `packages/`.
 *
 * STATELESS. `initialize` negotiates a version and hands over the instructions, and nothing is
 * remembered: every message stands alone, which is what a Worker that keeps nothing can serve. Two exceptions: when a
 * caller's calls were last marked (`calledBy`), which writes fewer marks and changes no reply, and each list's
 * declaration as a caller was answered it (`namingKept`), kept at the record's version, which asks the record less and
 * answers what asking again would.
 */

import { refused, type Result } from '@braindog/ports';

import { INSTRUCTIONS } from './instructions.ts';

export { INSTRUCTIONS };
import { CARD_OF_TOOL, cardHtml, cardMeta, cardOf, cardResource, cardResources } from './cards.ts';
import { HOUR, MINUTE, TEMPLATES, TOOLS, tools, ttlOf, type McpSurface, type Said, type Tool } from './index.ts';
import { refusalBrief } from './brief.ts';

/**
 * Newest first. `initialize` answers with one of these, as `negotiate` picks it.
 *
 * 2025-11-25 IS SPOKEN AND ANSWERED AS ITSELF. It was missing, so a client of that revision was answered 2025-06-18,
 * and over HTTP every later request that said `MCP-Protocol-Version: 2025-11-25` was refused -32022 as a version this
 * server does not speak. Nothing it asks of a server is beyond this one: tools that refuse a bad argument as a tool
 * error the model can read rather than a protocol error, a 403 for any `Origin`, no batches, and a `title` beside
 * every name, all of which `http.ts` and this file already do.
 */
export const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'] as const;

export const METHODS = [
  'initialize',
  'server/discover',
  'ping',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/templates/list',
  'resources/read',
  'prompts/list',
] as const;

type Id = string | number;

/**
 * THE ERROR'S NUMBER IS SPELT THROUGH `Record<'code', number>`, so that every `code:` written in this
 * package is a refusal code. The `refusals` gate reads those, and a JSON-RPC number is not one.
 */
type RpcError = { message: string; data?: unknown } & Record<'code', number>;

export type Reply =
  | { jsonrpc: '2.0'; id: Id; result: unknown }
  | { jsonrpc: '2.0'; id: Id | null; error: RpcError };

/** JSON-RPC's own numbers, and MCP's before 2026-07-28 for a resource that is not there (that revision uses params). */
const RPC = { invalid: -32600, method: -32601, params: -32602, internal: -32603, resource: -32002 } as const;

const answer = (id: Id, result: unknown): Reply => ({ jsonrpc: '2.0', id, result });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Whether a revision is the stateless one or later, the first to put `resultType` on a result. Only a date is one. */
const stateless = (version: string): boolean => DATE.test(version) && version >= VERSIONS[0];

/**
 * A result, which says it is whole when the revision it is answered under asks that.
 *
 * THE 2026-07-28 REVISION REQUIRES `resultType` ON EVERY RESULT. Only `server/discover` carried the field, so a client
 * of the revision took the handshake, then refused `tools/list`, `prompts/list` and both resource lists as invalid:
 * Claude Code connected, read the instructions and exposed none of the tools, on every session.
 *
 * AND ONLY THAT REVISION GETS IT. A client of 2025-11-25 or earlier reads `ping` against a closed, empty result, so a
 * key it does not know is a reply it may refuse; it is answered as its own revision draws a result, with nothing added.
 */
const whole = (id: Id, result: Record<string, unknown>, version: string): Reply =>
  answer(id, stateless(version) ? { resultType: 'complete', ...result } : result);

/**
 * The revision a request is answered under: the one its own `_meta` names, as every request of the stateless revision
 * does, else the one its transport knows (the HTTP header, or what `initialize` agreed on a stdio pipe), else the newest.
 *
 * THE NEWEST WHEN NOTHING SAYS, because a caller built before `version` was handed in passes nothing, and the client
 * that broke without `resultType` was the newest one. HTTP always says: `serveMcp` hands the header, or 2025-03-26, the
 * revision the specification tells a server to assume when a request carries no header.
 */
function revisionOf(params: Record<string, unknown>, version: string | undefined): string {
  const meta = isObject(params._meta) ? params._meta : {};
  const said = meta['io.modelcontextprotocol/protocolVersion'];
  return typeof said === 'string' && DATE.test(said) ? said : (version ?? VERSIONS[0]);
}

/**
 * The version an `initialize` reply agreed, or `null` for any other reply: what a stdio loop keeps, since a pipe sends
 * no header and its later requests are answered under the revision the handshake chose.
 */
export function agreed(reply: Reply | null): string | null {
  if (reply === null || !('result' in reply) || !isObject(reply.result)) return null;
  const v = reply.result.protocolVersion;
  return typeof v === 'string' && isObject(reply.result.serverInfo) ? v : null;
}
const fail: (id: Id | null, n: number, message: string, data?: unknown) => Reply = (id, code, message, data) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

const JSON_TYPE = 'application/json';

/**
 * A tool's answer as a tool result: the text an agent reads, and the JSON beside it as `structuredContent`.
 *
 * THE TEXT IS PLAIN LABELLED LINES, AND THE JSON IS THE WHOLE ANSWER. Every read answered one block of compact JSON,
 * so a model read raw row ids, person ids and nulls it could not use and a person should never be shown, and on the
 * owner's record the default reads ran to 13 and 18 KB. The lines are what a model reads first and relays; the JSON is
 * for a client that renders it, and in the text too when the call asks `format: "full"` (`index.ts`, `answer`).
 *
 * A REFUSAL IS `isError` WITH ITS SENTENCE, ITS ALLOWED VALUES AND ITS `try` in the text, and the refusal whole beside
 * it, because those are what the model reads to correct the call. A conflict carries the current row and who changed
 * it, so the retry needs no second read.
 */
const render = (said: Said) => ({
  ...(said.result.ok ? {} : { isError: true }),
  content: [{ type: 'text', text: said.text }],
  structuredContent: said.structured,
});

/**
 * A tool as `tools/list` lists it: its name, the title a host shows a person, what it does, its arguments, and what it
 * may do to the record.
 *
 * EVERY HINT IS SAID, BECAUSE A MISSING ONE IS READ AS THE WORST. The specification's defaults for a tool that says
 * nothing are destructive and open to the world, so every write here inherited both: Claude prompts for a destructive
 * tool every time, and ChatGPT treats any tool lacking `readOnlyHint` as a write and shows the person its raw JSON.
 * Reads are read-only; `create`, `propose`, `log`, `meet`, `triage` and `handoff` add and take nothing away; `update`
 * overwrites a value and says so, by OpenAI's rule that being able to undo a change does not make it safe. `undo` puts
 * back only the caller's own write and deletes nothing else. None reaches past the record, so `openWorldHint` is false.
 */
export const listedTool = (t: Tool) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.input,
  /* readOnlyHint IS SAID ON EVERY TOOL, false for a write, because a directory reads a missing one as a write it cannot vouch for. */
  annotations: t.writes
    ? { readOnlyHint: false, destructiveHint: t.destructive === true, idempotentHint: t.idempotent === true, openWorldHint: false }
    : { readOnlyHint: true, openWorldHint: false },
  /* A CARD IS ATTACHED BY `_meta`; a host that does not know the key ignores it and shows the text lines. */
  ...(CARD_OF_TOOL[t.name] === undefined ? {} : { _meta: cardMeta(CARD_OF_TOOL[t.name]!) }),
});

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/* THE TITLE IS WHAT A HOST SHOWS A PERSON for the server, since 2025-06-18, where `name` is the handle it keys on. */
const SERVER = { name: 'braindog', title: 'BrainDog', version: '0.0.0' };

/**
 * Who this server is, with the build it runs as its version (`2026.10.21+abc1234`).
 *
 * THE BUILD AND NOT `0.0.0`. Every host answered `0.0.0`, so a client could tell two deploys apart only by the
 * `braindog-build` header, which a client that reads `serverInfo` never sees, and the door's own `hello` mark recorded
 * the same nothing. A host hands its build to `handle`; one that hands none (a self-host started without one, the
 * command line answering on the machine) still says `0.0.0`, which reads as "not told", never as a build.
 */
const serverOf = (build: string | undefined) => (build === undefined || build.trim() === '' ? SERVER : { ...SERVER, version: build.trim() });
const CAPABILITIES = { tools: {}, resources: {}, prompts: {} };

/**
 * Whether `propose` answers in the input-required shape of the 2026-07-28 revision's multi round-trip requests.
 *
 * OFF, BECAUSE NO CLIENT CAPABILITY FOR IT COULD BE CONFIRMED. The
 * contract turns the input-required answer on only when a request's `_meta` carries the capability the revision names
 * for it, and the name has to be read in the specification's own text, which this repository does not hold. The shape
 * `44-SPEC-MCP` §5.7 drew (one request of kind `decision`) is this project's design, not a kind the revision is known to
 * name. So nothing reads this switch yet, and a filed question answers as every tool does, with its `decide` link; the
 * day the name is confirmed, the branch in `tools/call` reads it and this turns true.
 */
export const MRTR = false;

/**
 * The answer to a `propose` that carries `inputResponses`: a retry that thinks it is answering the question it filed.
 *
 * REFUSED BEFORE ANY CALL, SO NO SECOND QUESTION IS FILED. Deciding is a rung no token reaches (ADR-060), so whatever the
 * client collected from the person in its own window is not the person's decision on this record; the record's answer is
 * the one they give in the app, at the `decide` link the first answer carried (`44-SPEC-MCP` §5.7 step 3).
 */
const DECIDES_NOT = {
  ok: false,
  refusal: {
    code: 'LEVEL_REQUIRED',
    fix: "Deciding is a person's act and no token holds it; the suggestion waits in the Decide queue of the app.",
    at: 'inputResponses',
  },
} as const satisfies Result<never>;

/**
 * One mark `handle` leaves with the surface's `doorHeard`, the record's unrouted twin of `heard` that keeps the door's own
 * marks and moves a key's last tool call (audit 38-39, findings 2 and 5). A surface without it is handed the mark through
 * `heard`, as before.
 */
type Mark = Parameters<NonNullable<McpSurface<unknown>['doorHeard']>>[0];

/**
 * Leave a mark, and never wait on it or let it fail the call (AGT-B01, "the agent door lists its tools").
 *
 * NOT AWAITED, AND EVERY WAY IT CAN GO WRONG IS SWALLOWED: a surface whose `heard` throws, answers a refusal, rejects or
 * never settles costs the answer nothing, because a session that was given its tools must be given them whether or not
 * the record could count it. The record writes a mark before its first `await`, so nothing is lost by not waiting.
 */
function hear<C>(surface: McpSurface<C>, ctx: C, mark: Mark): void {
  const s = surface;
  const leave = typeof s.doorHeard === 'function' ? s.doorHeard.bind(s) : typeof s.heard === 'function' ? s.heard.bind(s) : undefined;
  if (leave === undefined) return;
  try {
    const p: unknown = leave(mark, ctx);
    /* ANY THENABLE, not only this realm's Promise, so a rejection from a surface built elsewhere is caught too. */
    if (p !== null && typeof p === 'object' && typeof (p as { then?: unknown }).then === 'function') Promise.resolve(p).catch(() => undefined);
  } catch {
    /* A mark that throws is a mark not kept, and nothing more. */
  }
}

/** The slug of the record this server serves (`boot`'s `record.slug`), or null when it names none or cannot be read. */
async function slugOf<C>(surface: McpSurface<C>, ctx: C): Promise<string | null> {
  try {
    const boot = await surface.boot(ctx);
    const value: unknown = boot.ok ? boot.value : undefined;
    const record = isObject(value) ? value.record : undefined;
    return isObject(record) && typeof record.slug === 'string' && record.slug !== '' ? record.slug : null;
  } catch {
    /* A card links to the app's front door rather than fail the answer it rides on. */
    return null;
  }
}

/** How often a caller's calls are marked after its first: the count since the last mark rides on the next. */
const CALLED_EVERY = MINUTE;
/** The most callers one surface remembers between marks; the oldest goes first. */
const CALLERS_KEPT = 1_000;

/**
 * THE ONE THING THIS FILE REMEMBERS, AND ONLY TO WRITE FEWER MARKS. A caller's first call is marked at once, so a session
 * that called is counted from its first answer; after that, at most one mark a minute carries the calls since the last.
 * Kept per surface, so a record's host that keeps one surface keeps one count, and a surface built for each request
 * marks each call, which is more writes and the same count. A reply never depends on it.
 */
const calledBy = new WeakMap<object, Map<string, { at: number; n: number }>>();

/** How many calls to mark now for this caller, or `null` to hold this one for the next mark. */
function called(surface: object, caller: string, now: number): number | null {
  let seen = calledBy.get(surface);
  if (seen === undefined) calledBy.set(surface, (seen = new Map()));
  const was = seen.get(caller);
  if (was !== undefined && now - was.at < CALLED_EVERY) {
    was.n += 1;
    return null;
  }
  if (was === undefined && seen.size >= CALLERS_KEPT) seen.delete(seen.keys().next().value as string);
  seen.set(caller, { at: now, n: 0 });
  return (was?.n ?? 0) + 1;
}

/** How long a caller's lists are kept at one version of the record before they are asked again whatever it says. */
const NAMING_FOR = 5 * MINUTE;
/** The most callers one surface keeps lists for, and the most lists one caller keeps; the oldest caller goes first. */
const NAMING_CALLERS = 200;
const NAMING_LISTS = 200;

/** One caller's lists as the record answered them, at the version it stood at when they were kept. `null` is a caller seen once. */
type Naming = { stamp: number | null; at: number; lists: Map<string, Result<unknown>> };

/**
 * The naming state, held across messages: each list's declaration as `schema` answered it, which is where `tools` reads
 * its prefix, its ref fields, its text fields and its card (`learnPrefix`, `index.ts`).
 *
 * WHAT IT COST. `tools` is built for every message, so its maps died with the answer, and every answer that named a row
 * asked `schema` again for each list it touched: a `list tasks` asked for Tasks, Projects and People before it could
 * say one name, and on the record the `schema` read parses every block declaration it holds (`record/src/index.ts`,
 * `schema`). The same few lists, read again on every call of a session, for an answer that moves only when a list is
 * declared again.
 *
 * KEYED BY THE RECORD AND THE CALLER'S WHOLE CONTEXT, and stamped with the version the record answers that caller.
 * The record is the surface object, one per record on a host that keeps its record open. The caller is the context as
 * it came, written out whole, because a list's declaration is told only to whoever may read it: an earlier attempt at
 * keeping names keyed them by what `whoami` said, which says nothing of `ctx.levels`, and a token held to `append` on
 * one list was told the names of its rows. Two contexts that write out the same are the same grant, the same ceiling
 * and the same run; anything else is another key, and a context that cannot be written out is not kept at all.
 *
 * THE STAMP IS THE RECORD'S `version` FOR THAT CALLER, which moves when any line she may read is written, and a list
 * the record declares again is one: every install it makes names who made it, and that writes the `declare` line
 * (`kernel/src/index.ts`, `declared`), measured on the seed moving both an owner's and a token's version. So a kept
 * list is never older than the version it was read at, and the next version asks again. `NAMING_FOR` bounds it
 * besides, for a declaration put in with nobody named (a seed, a migration), which writes no line.
 *
 * A CALLER SEEN ONCE IS NOT KEPT, AND ASKS NO VERSION. Its first message reads as it always did; its second asks the
 * version once and keeps what it reads at it; every one after asks the version and nothing it already has. A start
 * hook that calls one tool pays nothing for a cache it never uses. A refused `schema` is never kept, so a list the
 * caller may not read is asked again, and refused again, by the record.
 *
 * ONLY `schema` IS KEPT. Rows, names and everything else an answer reads are asked fresh, every message, with the
 * caller's own context: `namesIn` in `index.ts` says why a name is never kept past its answer.
 */
const namingKept = new WeakMap<object, Map<string, Naming>>();

/** A context written out whole, the key a caller's lists are kept under, or `null` for one that cannot be. */
function reachOf(ctx: unknown): string | null {
  try {
    const said: unknown = JSON.stringify(ctx ?? null);
    return typeof said === 'string' ? said : null;
  } catch {
    return null;
  }
}

/**
 * The surface one message's tools are built over: the caller's own, with `schema` answered from the lists kept for this
 * caller at this version (`namingKept`). Every other method is the surface's, reached through it as before.
 */
function named<C>(surface: McpSurface<C>): McpSurface<C> {
  let byReach = namingKept.get(surface);
  if (byReach === undefined) namingKept.set(surface, (byReach = new Map()));
  const kept = byReach;
  /* ONE VERSION A MESSAGE FOR EACH CALLER IT SPEAKS FOR, asked only when a list is first wanted. */
  const checked = new Map<string, Promise<Naming | null>>();
  const keep = (reach: string, naming: Naming): Naming => {
    kept.delete(reach);
    if (kept.size >= NAMING_CALLERS) kept.delete(kept.keys().next().value as string);
    kept.set(reach, naming);
    return naming;
  };
  const namingFor = (reach: string, ctx: C): Promise<Naming | null> => {
    let said = checked.get(reach);
    if (said === undefined) {
      said = (async (): Promise<Naming | null> => {
        const was = kept.get(reach);
        const now = Date.now();
        if (was === undefined) {
          keep(reach, { stamp: null, at: now, lists: new Map() });
          return null;
        }
        let stamp: number | null = null;
        try {
          const v = await surface.version(ctx);
          stamp = v.ok && typeof v.value?.version === 'number' ? v.value.version : null;
        } catch {
          stamp = null;
        }
        if (stamp === null) {
          kept.delete(reach);
          return null;
        }
        if (was.stamp === stamp && now - was.at <= NAMING_FOR) return was;
        return keep(reach, { stamp, at: now, lists: new Map() });
      })();
      checked.set(reach, said);
    }
    return said;
  };
  const schema: McpSurface<C>['schema'] = async (args, ctx) => {
    const reach = reachOf(ctx);
    const naming = reach === null ? null : await namingFor(reach, ctx);
    const had = naming?.lists.get(args.register);
    if (had !== undefined) return had;
    const out = await surface.schema(args, ctx);
    if (naming !== null && out.ok && naming.lists.size < NAMING_LISTS) naming.lists.set(args.register, out);
    return out;
  };
  const over = Object.create(surface) as McpSurface<C>;
  Object.defineProperty(over, 'schema', { value: schema, enumerable: true });
  return over;
}

/** The client as a mark names it, its name and version, held to the record's 80 characters. */
function clientOf(params: Record<string, unknown>): string | undefined {
  const info = params.clientInfo;
  if (!isObject(info) || typeof info.name !== 'string' || info.name.trim() === '') return undefined;
  const said = `${info.name.trim()}${typeof info.version === 'string' && info.version.trim() !== '' ? ` ${info.version.trim()}` : ''}`;
  return said.slice(0, 80);
}

/**
 * The most a `resources/list` answer may come to, written out as JSON: the agents plan's 15 KB (§6.4).
 *
 * WHAT IT WAS. Measured on the owner's record through his own command line, `resources/list` answered 225,553 bytes, 1,124
 * resources, and 754 of its 933 pages were one page per agent run (`agent-run-1-oct-459`), 147 KB on their own; on the
 * seed it is 47 KB, 144 of its 238 resources figures. A client that lists resources pays for every run ever made, at
 * the start of every session, for addresses its templates already name.
 */
export const LISTED_MOST = 15_000;

/** The fixed addresses a session reads first, which lead the list whatever else is cut. */
const LISTED_FIRST: ReadonlySet<string> = new Set(['context', 'instructions', 'presence', 'handoffs', 'learnings', 'decisions', 'briefing', 'stale', 'changes']);

/**
 * Where one resource stands when the list must be cut, lowest first, or `null` for one never listed.
 *
 * THE ORDER IS THE AGENTS PLAN'S LIST (§6.4): the cards; what a session reads first and the grammars;
 * the skills; the pages somebody wrote. After those, while there is room, the rest of the fixed addresses, each list's
 * fields and each figure, which their templates (`braindog:schema/{register}`, `braindog:metric/{id}`) name whatever
 * is listed.
 *
 * A PAGE ABOUT ONE ROW IS NEVER LISTED: a template's page for each run, project or person. It is still read by its
 * address, `braindog:page/{slug}`, and `record_index` and `context` name the rows it is about.
 */
function rankOf(uri: string, rows: ReadonlySet<string>): number | null {
  if (!uri.startsWith('braindog:')) return 0;
  const path = uri.slice('braindog:'.length);
  if (LISTED_FIRST.has(path) || path.startsWith('grammar/')) return 1;
  if (path.startsWith('skill/')) return 2;
  if (path.startsWith('page/')) return rows.has(path.slice('page/'.length)) ? null : 3;
  if (path.startsWith('schema/')) return 5;
  if (path.startsWith('metric/')) return 6;
  return 4;
}

/**
 * The resources to list, in the order they came, held to `LISTED_MOST`: taken by `rankOf` until the next one would not
 * fit, so a list is cut from its least-read end and never has a gap in the middle of a rank it reached.
 */
function listedWithin<R extends { uri: string }>(resources: readonly R[], rows: ReadonlySet<string>): R[] {
  const ranked = resources
    .map((r, at) => ({ r, at, rank: rankOf(r.uri, rows) }))
    .filter((x): x is { r: R; at: number; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.at - b.at);
  const kept = new Set<number>();
  /* THE ANSWER AROUND THEM, its `jsonrpc`, `id`, `ttlMs`, `cacheScope` and `resultType`, comes inside the same 15 KB. */
  let size = 256;
  for (const { r, at } of ranked) {
    size += JSON.stringify(r).length + 1;
    if (size > LISTED_MOST) break;
    kept.add(at);
  }
  return resources.filter((_, at) => kept.has(at));
}

/**
 * The pages this caller may open that are about one row, by address: a template's page for each run, project or person
 * (`pages`' `about`). Empty when the surface cannot say, so nothing is dropped for being about a row it could not name.
 */
async function rowPagesOf<C>(surface: McpSurface<C>, ctx: C): Promise<Set<string>> {
  try {
    const pages = await surface.pages(ctx);
    if (!pages.ok || !Array.isArray(pages.value)) return new Set();
    return new Set(
      (pages.value as unknown[]).flatMap((p) => (isObject(p) && typeof p.slug === 'string' && isObject(p.about) ? [p.slug] : [])),
    );
  } catch {
    return new Set();
  }
}

/**
 * The version an `initialize` is answered with, or `null` for none.
 *
 * THE ONE ASKED FOR, OR THE NEWEST OLDER ONE. A client that names a revision this server does not know
 * is answered with the newest it speaks at or below that one, because a client cannot speak a revision
 * newer than its own. Older than all of them is `null`, and the answer is an error naming the versions
 * there are. A client that names no date is answered with the newest.
 */
export function negotiate(asked: unknown): (typeof VERSIONS)[number] | null {
  if (typeof asked !== 'string' || !DATE.test(asked)) return VERSIONS[0];
  return VERSIONS.find((v) => v <= asked) ?? null;
}

/**
 * Answer one message.
 *
 * NEVER THROWS. A throw below the dispatch becomes `-32603` with the word `internal` and a reference,
 * and the reference and the error go to the host's log. No exception text crosses the wire, because
 * an exception message can carry a row's value or a path.
 *
 * `origin` IS WHERE THE HOST SERVES THE APP, `https://brain.dog` or a self-host's own address, and only a host knows it:
 * the tools put it in front of a filed question's `decide` link and read it for nothing else. Left out, as a caller
 * built before it passes nothing, a filed question answers without the link.
 *
 * `version` IS THE REVISION THE TRANSPORT KNOWS this request speaks (`revisionOf`), and it decides only whether a
 * result carries `resultType`. `initialize` is answered under the revision it negotiates, whatever is passed.
 *
 * AND IT MARKS HOW THE SESSION MET THE DOOR, through the surface's optional `doorHeard`, or `heard` on a surface without
 * it (AGT-B01): `hello` for an `initialize` it answered, with the client and this server's build; `listed` for a tool list
 * it gave, with how many;
 * `called` on a caller's first tool call and at most once a minute after; `internal` for an answer whose code is
 * INTERNAL. None is waited on and none can fail the call (`hear`). `caller` is the transport's key for who is calling,
 * which only the minute between `called` marks reads; a stdio pipe is one caller and passes none.
 *
 * `build` IS THE HOST'S OWN BUILD, `serverInfo.version` in `initialize` and `server/discover` and the `hello` mark's.
 */
export async function handle<C>(
  message: unknown,
  surface: McpSurface<C>,
  ctx: C,
  origin?: string,
  version?: string,
  caller = '',
  build?: string,
): Promise<Reply | null> {
  if (Array.isArray(message)) return fail(null, RPC.invalid, 'Send one message at a time; a batch is not accepted.');
  if (!isObject(message)) return fail(null, RPC.invalid, 'A message is a JSON object.');

  const id = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null;
  if (Object.hasOwn(message, 'id') && id === null) return fail(null, RPC.invalid, 'id is a string or a number.');
  /* A reply to a request this server never sends. Answering it would start a conversation nobody asked for. */
  if (message.method === undefined && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) return null;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string')
    return fail(id, RPC.invalid, 'A request carries jsonrpc "2.0" and a method.');
  /* A NOTIFICATION IS NEVER ANSWERED, AND NOTHING RUNS FOR ONE. The client has said it will not read
     a reply, so a write made for one would be a write nobody hears about. */
  if (id === null) return null;

  const params = message.params ?? {};
  if (!isObject(params)) return fail(id, RPC.params, 'params is an object.');

  try {
    return await dispatch(id, message.method, params, surface, ctx, origin, revisionOf(params, version), caller, serverOf(build));
  } catch (e) {
    const ref = crypto.randomUUID();
    console.error('mcp', ref, message.method, e);
    hear(surface, ctx, { kind: 'internal' });
    return fail(id, RPC.internal, 'internal', { ref });
  }
}

async function dispatch<C>(
  id: Id,
  method: string,
  params: Record<string, unknown>,
  surface: McpSurface<C>,
  ctx: C,
  origin: string | undefined,
  version: string,
  caller: string,
  server: typeof SERVER,
): Promise<Reply> {
  /* OVER THE NAMING STATE THIS CALLER WAS ANSWERED BEFORE, at the version the record says it is at (`named`). */
  const mcp = tools(named(surface), origin);
  const said = (result: Record<string, unknown>) => whole(id, result, version);
  /* EVERY LIST IS ONE PAGE, AND SAYS SO BY CARRYING NO `nextCursor`. So a cursor is one this server never issued, which
     the specification answers -32602; a client that sends one is never handed the whole list again as if it were the
     next page. `null` is read as no cursor, as a missing key is. */
  const paged = (p: Record<string, unknown>): Reply | null =>
    p.cursor === undefined || p.cursor === null
      ? null
      : fail(id, RPC.params, 'This list is one page and issues no cursor. Ask again without one.', { cursor: p.cursor });

  switch (method) {
    case 'initialize': {
      const protocolVersion = negotiate(params.protocolVersion);
      /* THE REVISION'S OWN ANSWER to a version the server cannot meet: -32602, naming what it speaks. */
      if (protocolVersion === null)
        return fail(id, RPC.params, 'Unsupported protocol version', { supported: [...VERSIONS], requested: params.protocolVersion });
      /* ANSWERED UNDER THE REVISION IT AGREES, so a client of the stateless one reads `resultType` here as on every other
         result, and an older client's handshake carries nothing it does not know. */
      const client = clientOf(params);
      hear(surface, ctx, { kind: 'hello', build: server.version, ...(client === undefined ? {} : { client }) });
      return whole(id, { protocolVersion, capabilities: CAPABILITIES, serverInfo: server, instructions: INSTRUCTIONS }, protocolVersion);
    }

    /* WHAT A 2026-07-28 CLIENT ASKS BEFORE ANYTHING ELSE, which that revision says every server answers:
       the versions, the capabilities, who this is and the instructions. The same for every caller, so
       any cache may keep it. Only that revision has the method, so it is always answered as that revision. */
    case 'server/discover':
      return whole(id, {
        supportedVersions: [...VERSIONS],
        capabilities: CAPABILITIES,
        _meta: { 'io.modelcontextprotocol/serverInfo': server },
        instructions: INSTRUCTIONS,
        ttlMs: HOUR,
        cacheScope: 'public',
      }, VERSIONS[0]);

    /* `{}` FOR AN OLDER CLIENT, which reads a ping's answer as an empty result and nothing else. */
    case 'ping':
      return said({});

    /* THE INSTRUCTIONS ARE NOT SENT AGAIN HERE. They went out in `initialize`, or in `server/discover` for a client of the
       stateless revision, and a session that asked for both carried the whole text twice; Claude Code puts the
       instructions in every session's system prompt on its own. Once a connection is the specification's place for them. */
    case 'tools/list': {
      const wrong = paged(params);
      if (wrong) return wrong;
      hear(surface, ctx, { kind: 'listed', n: TOOLS.length });
      return said({ tools: TOOLS.map(listedTool), ttlMs: HOUR, cacheScope: 'private' });
    }

    case 'tools/call': {
      const args = params.arguments ?? {};
      if (typeof params.name !== 'string')
        return fail(id, RPC.params, 'tools/call needs the name of a tool.', { allowed: TOOLS.map((t) => t.name) });
      if (!isObject(args)) return fail(id, RPC.params, "arguments is an object of the tool's fields.");
      /* MARKED BEFORE IT RUNS, so a call that throws or is refused was still a call. */
      const n = called(surface, caller, Date.now());
      if (n !== null) hear(surface, ctx, { kind: 'called', n });
      /* THE REVISION SENDS `inputResponses` ON A RETRY OF THE ORIGINAL REQUEST, and a client may put it in the request's
         params or among the tool's arguments, so both places are read. */
      if (params.name === 'propose' && (Object.hasOwn(params, 'inputResponses') || Object.hasOwn(args, 'inputResponses')))
        return said(render({ result: DECIDES_NOT, text: refusalBrief(DECIDES_NOT.refusal), structured: DECIDES_NOT.refusal }));
      const out = await mcp.answer(params.name, args, ctx);
      if (refused(out.result) && out.result.refusal.code === 'INTERNAL') hear(surface, ctx, { kind: 'internal' });
      /* THE CARD'S DATA RIDES BESIDE THE ANSWER, only when this answer is one the card can draw. */
      let drawn = out.result.ok ? cardOf(params.name, args, out.structured, origin) : null;
      /* THE RECORD'S SLUG IS ASKED ONLY FOR AN ANSWER A CARD DRAWS, so the link lands on this record and not the app's front door. */
      if (drawn !== null && origin !== undefined) drawn = cardOf(params.name, args, out.structured, origin, await slugOf(surface, ctx)) ?? drawn;
      const shown = render(out);
      /* A RULE IS ANSWERED BY `governance`, WHICH LISTS THE DECISION CARD, so the answer names its own template beside it. */
      const meta = drawn?.kind === 'rule' ? { _meta: cardMeta('rule') } : {};
      return said(drawn === null ? shown : { ...shown, ...meta, structuredContent: { ...out.structured, card: drawn } });
    }

    /* A minute, not an hour: the list names pages, and a page appears when its row does. */
    case 'resources/list': {
      const wrong = paged(params);
      if (wrong) return wrong;
      const [listing, rows] = await Promise.all([mcp.resources(ctx), rowPagesOf(surface, ctx)]);
      return said({
        resources: listedWithin([
          /* THE CARDS LEAD, each under its own type: MCP Apps hosts and ChatGPT name different ones for the same page. */
          ...cardResources().map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType })),
          ...listing.map(({ uri, name, description }) => ({ uri, name, description, mimeType: JSON_TYPE })),
        ], rows),
        ttlMs: MINUTE,
        cacheScope: 'private',
      });
    }

    case 'resources/templates/list':
      return paged(params) ?? said({ resourceTemplates: TEMPLATES.map((t) => ({ ...t, mimeType: JSON_TYPE })), ttlMs: HOUR, cacheScope: 'private' });

    case 'resources/read': {
      if (typeof params.uri !== 'string') return fail(id, RPC.params, 'resources/read needs a uri.');
      const card = cardResource(params.uri);
      if (card !== undefined)
        return said({ contents: [{ uri: card.uri, mimeType: card.mimeType, text: cardHtml(card.kind), _meta: { ui: { prefersBorder: false } } }], ttlMs: HOUR, cacheScope: 'public' });
      const r = await mcp.read(params.uri, ctx);
      const missingCode = stateless(version) ? RPC.params : RPC.resource;
      if (!r.ok)
        /* 2026-07-28 moved resource-not-found from -32002 to -32602; older clients still expect -32002. */
        return refused(r)
          ? fail(id, missingCode, r.refusal.fix, { refusal: r.refusal })
          : fail(id, missingCode, 'This resource did not answer. Read it again.');
      return said({
        contents: [{ uri: params.uri, mimeType: JSON_TYPE, text: JSON.stringify(r.value ?? null) }],
        ttlMs: ttlOf(params.uri),
        cacheScope: 'private',
      });
    }

    /* None yet. The skill and the instructions teach; a prompt library is a third thing to keep true. */
    case 'prompts/list':
      return paged(params) ?? said({ prompts: [], ttlMs: HOUR, cacheScope: 'private' });

    default:
      return fail(id, RPC.method, `There is no method called ${method}.`, { allowed: METHODS });
  }
}
