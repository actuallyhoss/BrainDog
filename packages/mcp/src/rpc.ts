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
import { ANSWER_TOOL, CARD_OF_TOOL, cardHtml, cardMeta, cardOf, cardResource, cardResources, type Look } from './cards.ts';
import { ANSWER_LISTED, answerCall, answers, answersFor, groundOf, withGrant } from './answer.ts';
import { FOLDED, FOLDED_UNTIL, HOUR, MINUTE, TEMPLATES, TOOLS, pendingOf, takesOf, toolNamed, tools, ttlOf, type McpSurface, type Pending, type Said, type Tool } from './index.ts';
import { PROMPTS, promptOf } from './instructions.ts';
import { refusalBrief } from './brief.ts';
import { atIn, unsaid } from './words.ts';

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
  'prompts/get',
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
 * A refusal said in the called tool's own words: its `at` one of the tool's fields or a key the caller sent, and its
 * sentence with no `undefined` where a value was meant (`atIn` and `unsaid` in `words.ts`). Any other answer as it came.
 *
 * AT THE DOOR, AFTER EVERYTHING ELSE, because every refusal an agent reads passes here and the record's sentences are
 * written for every caller of a method: `update`'s write filed by the ladder as a proposal is refused in the proposal's
 * terms, `body.rows[0].patch`, which `update` cannot send. `refusal-at.test.ts` walks the refusals the door gives and
 * holds every `at` to the called tool. The text is drawn again from the refusal, as `index.ts` draws it, only when a
 * word changed.
 */
/**
 * A refusal at one field of a row, said inside the argument that carries the row: `fields.what` to `create`, `patch.what`
 * to `update`, and `where` to `list`, or `undefined`.
 *
 * THE RECORD NAMES THE FIELD BARE: "tasks needs what" came back at `what`, which no tool takes, so `atIn`
 * dropped it and the agent read a refusal that named no place to correct, against the instructions' own rule.
 */
const ROW_ARG: Readonly<Record<string, string>> = { create: 'fields', triage: 'fields', update: 'patch' };
/* ONLY A REFUSAL ABOUT A FIELD: a FORBIDDEN at `principal` is about the caller, and is no field of the row it sent. */
const ABOUT_A_FIELD: ReadonlySet<string> = new Set(['FIELD_UNKNOWN', 'REQUIRED_MISSING', 'VALUE_MALFORMED', 'ENUM_VALUE_UNKNOWN', 'IMMUTABLE_FIELD', 'OUT_OF_BOUNDS', 'MATCH_OP_UNSUPPORTED']);
function inRow(name: string, refusal: Readonly<Record<string, unknown>>, sent: Readonly<Record<string, unknown>>): string | undefined {
  const at = refusal.at;
  if (typeof at !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(at) || !ABOUT_A_FIELD.has(String(refusal.code))) return undefined;
  if (name === 'list') return Object.hasOwn(sent, 'where') ? 'where' : undefined;
  if (!Object.hasOwn(ROW_ARG, name)) return undefined;
  const row = sent[ROW_ARG[name]!];
  /* A FIELD IT SENT, OR ONE THE ROW NEEDS AND IT LEFT OUT. */
  const sentIt = typeof row === 'object' && row !== null && Object.hasOwn(row, at);
  return sentIt || refusal.code === 'REQUIRED_MISSING' ? `${ROW_ARG[name]!}.${at}` : undefined;
}

function ownWords(name: string, args: Record<string, unknown>, out: Said, sent: Record<string, unknown> = args): Said {
  if (!refused(out.result)) return out;
  const was = out.result.refusal as unknown as Record<string, unknown>;
  const tool = toolNamed(name);
  const takes = [...takesOf(name), ...(tool?.quiet ?? [])];
  const at = tool === undefined ? (typeof was.at === 'string' ? was.at : undefined) : (atIn(was.at, takes, sent) ?? inRow(name, was, sent));
  const fix = typeof was.fix === 'string' ? unsaid(was.fix, at) : was.fix;
  if (at === was.at && fix === was.fix) return out;
  const refusal = Object.fromEntries(
    Object.entries(was).flatMap(([k, v]): [string, unknown][] => (k === 'at' ? (at === undefined ? [] : [[k, at]]) : [[k, k === 'fix' ? fix : v]])),
  );
  const text = args.format === 'full' ? JSON.stringify(refusal) : refusalBrief(refusal);
  return { result: { ok: false, refusal: refusal as never }, text, structured: refusal };
}

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
/**
 * THE TOOLS A SESSION USES BEFORE IT KNOWS WHAT IT NEEDS, which a host that defers tools behind a search loads at once
 * (`anthropic/alwaysLoad`, Claude Code's per-tool key). Half the tool searches his sessions made from 15 October were
 * spent loading these five, and `context` is the first call of every session, so it waited on a search every time.
 * Every other tool stays found by search, with a few words that find it (`anthropic/searchHint`).
 */
export const ALWAYS_LOADED: ReadonlySet<string> = new Set(['context', 'search', 'list', 'get', 'handoff']);

/** The words a host's tool search finds each deferred tool by, past its name and description. */
export const SEARCH_HINTS: Readonly<Record<string, string>> = {
  create: 'add new row task note person money',
  update: 'edit change fix row field',
  log: 'note comment page html attach',
  propose: 'ask person decide suggest',
  act: 'undo revert settings packs add-on board widget page automation rule share invite key zone currency export anything app',
  record_index: 'registers lists fields schema',
  activity: 'history changes recent',
  governance: 'decisions waiting questions',
  triage: 'inbox arrivals file',
  meet: 'person contact email org',
  instructions: 'told stop pause inbox',
};

/** A tool's own `_meta` on the list: its card, and whether a host loads it at once or finds it by search. */
function toolMeta(name: string): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {
    ...(CARD_OF_TOOL[name] === undefined ? {} : cardMeta(CARD_OF_TOOL[name]!)),
    ...(ALWAYS_LOADED.has(name) ? { 'anthropic/alwaysLoad': true } : SEARCH_HINTS[name] === undefined ? {} : { 'anthropic/searchHint': SEARCH_HINTS[name] }),
  };
  return Object.keys(meta).length === 0 ? undefined : meta;
}

export const listedTool = (t: Tool) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.input,
  /* readOnlyHint IS SAID ON EVERY TOOL, false for a write, because a directory reads a missing one as a write it cannot vouch for. */
  annotations: t.writes
    ? { readOnlyHint: false, destructiveHint: t.destructive === true, idempotentHint: t.idempotent === true, openWorldHint: false }
    : { readOnlyHint: true, openWorldHint: false },
  /* A CARD IS ATTACHED BY `_meta`, and so is how a host loads it; a host that does not know a key ignores it. */
  ...((meta) => (meta === undefined ? {} : { _meta: meta }))(toolMeta(t.name)),
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
 * marks and moves a key's last tool call. A surface without it is handed the mark through
 * `heard`, as before.
 */
type Mark = Parameters<NonNullable<McpSurface<unknown>['doorHeard']>>[0];

/**
 * Leave a mark, and never wait on it or let it fail the call ("the agent door lists its tools").
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

/** The longest a decision card waits for the rows its pictures are drawn against: past it, it is drawn without them. */
const GROUND_MS = 400;

/** The one question a `governance` answer by id holds: the answer itself, or a page of exactly one. */
function questionIn(structured: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof structured.question === 'string') return structured;
  const rows = Array.isArray(structured.rows) ? structured.rows : [];
  return rows.length === 1 && isObject(rows[0]) ? rows[0] : null;
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

/* ── who is asking, and what waits for it ────────────────────────────────── */

/**
 * What his settings let this caller have, as `whoami`'s `effective` says it (§6.2): its ceiling, the tools he
 * switched off, and the settings row by name for the sentence that says so. `null` for a caller who is no agent's key,
 * or a record too old to say, which lists and calls everything as before.
 */
type Effective = { may: string; off: string[]; profile: string | null };

/**
 * WHETHER THE RECORD KNOWS WHAT HE TELLS AGENTS AND HOW HE SET THEM UP, which came in one migration with
 * `instructionsMine`: a surface without it (an older host, the command line's before it routes the name, a test's stub)
 * is asked nothing more than before, and answers every tool and every call as it did.
 */
const knowsAgents = <C>(surface: McpSurface<C>): boolean => typeof surface.instructionsMine === 'function';

/** How long one caller's settings are held between calls: a change in the app reaches its next call after this. */
const EFFECTIVE_FOR = 15_000;

/**
 * ONE CALLER'S STATE AT THIS DOOR, kept for fewer reads and quieter answers and never for a reply's truth: the stamp
 * the last answer carried, the instructions it has been shown on a tool answer (each said once), and its settings for
 * `EFFECTIVE_FOR`. Kept per surface and caller as `calledBy` is; a surface built per request keeps nothing, and every
 * answer then asks again and says a waiting instruction again, which is louder and never wrong.
 */
type Watch = { stamp: string | null; shown: Set<string>; effective: { at: number; said: Effective | null } | null };
const watched = new WeakMap<object, Map<string, Watch>>();
const WATCHED_MOST = 1_000;

function watchOf(surface: object, caller: string): Watch {
  let byCaller = watched.get(surface);
  if (byCaller === undefined) watched.set(surface, (byCaller = new Map()));
  let w = byCaller.get(caller);
  if (w === undefined) {
    if (byCaller.size >= WATCHED_MOST) byCaller.delete(byCaller.keys().next().value as string);
    byCaller.set(caller, (w = { stamp: null, shown: new Set(), effective: null }));
  }
  return w;
}

/** The caller's settings, read fresh (`tools/list`) or held for `EFFECTIVE_FOR` (`tools/call`). Never throws. */
async function effectiveOf<C>(surface: McpSurface<C>, ctx: C, watch: Watch, fresh: boolean): Promise<Effective | null> {
  if (!knowsAgents(surface)) return null;
  const now = Date.now();
  if (!fresh && watch.effective !== null && now - watch.effective.at < EFFECTIVE_FOR) return watch.effective.said;
  let said: Effective | null = null;
  try {
    const who = await surface.whoami(ctx);
    const e = who.ok && isObject(who.value) && isObject(who.value.effective) ? who.value.effective : null;
    if (e !== null && typeof e.may === 'string')
      said = {
        may: e.may,
        off: Array.isArray(e.tools_off) ? e.tools_off.filter((t): t is string => typeof t === 'string') : [],
        profile: isObject(e.profile) && typeof e.profile.name === 'string' ? e.profile.name : null,
      };
  } catch {
    said = null;
  }
  watch.effective = { at: now, said };
  return said;
}

/**
 * THE TOOLS THIS CALLER IS LISTED: a Read agent lists no writes, and a tool he switched off for it is not
 * listed, so a narrower agent also pays fewer tokens every turn. The folded tools are never listed.
 */
function listedFor(e: Effective | null): readonly Tool[] {
  if (e === null) return TOOLS;
  return TOOLS.filter((t) => !(e.may === 'read' && t.writes) && !e.off.includes(t.name));
}

/** The tool a folded one answers through, whose switch it shares: `schema` is `record_index`'s, `history` is `get`'s. */
const FOLDED_INTO: Readonly<Record<string, string>> = { schema: 'record_index', history: 'get', undo: 'act' };

/**
 * A call to a tool he switched off for this agent, refused before it runs (`TOOL_OFF`): a list cached
 * before he did is still met with why. `null` while it is on.
 */
function offFor(name: string, e: Effective | null): Said | null {
  if (e === null) return null;
  const switched = e.off.includes(name) || (Object.hasOwn(FOLDED_INTO, name) && e.off.includes(FOLDED_INTO[name]!));
  if (!switched) return null;
  const where = `Settings > Agents${e.profile ? ` > ${e.profile}` : ''}`;
  const refusal = {
    code: 'TOOL_OFF',
    fix: `${where} has ${name} off for you, so it is not yours to call. If you need it, ask with propose.`,
    allowed: listedFor(e).map((t) => t.name),
  } as const;
  return { result: { ok: false, refusal: refusal as never }, text: refusalBrief(refusal), structured: refusal };
}

/** What waits for the caller's run, as `context { since }` answers it: its stamp, everything open, and what stops it. */
type Waiting = { stamp: string | null; pending: Pending[]; stop: { kind: string; id: string; said: string } | null };

/** How long a tool's answer waits for the check of what waits, after its own answer is ready: never longer. */
const WAITING_GRACE_MS = 150;

/**
 * Ask what waits for the caller's run (`context { since }`, a read that marks nothing, W2-A), with a stamp no kernel
 * makes, so every open instruction comes back and not only the new ones. `null` from a surface without `context`, a
 * refusal, or a session with no run yet. Never throws.
 */
async function waitingFor<C>(surface: McpSurface<C>, ctx: C): Promise<Waiting | null> {
  if (typeof surface.context !== 'function' || !knowsAgents(surface)) return null;
  try {
    const out = await surface.context({ since: '-' } as never, ctx);
    const s = out.ok && isObject(out.value) && isObject(out.value.since) ? out.value.since : null;
    if (s === null || typeof s.stamp !== 'string') return null;
    const stop = isObject(s.stop) && typeof s.stop.id === 'string' ? { kind: String(s.stop.kind), id: s.stop.id, said: String(s.stop.said ?? '') } : null;
    return { stamp: s.stamp, pending: pendingOf(s.pending), stop };
  } catch {
    return null;
  }
}

/**
 * What waits, as an answer of `context` or `instructions` already said it: its stamp, the instructions it named (the
 * briefing's `told`, the delta's or the tool's `pending`), and what stops the run. `null` without a stamp.
 */
function waitingIn(value: Record<string, unknown>): Waiting | null {
  if (typeof value.stamp !== 'string') return null;
  const stop = isObject(value.stop) && typeof value.stop.id === 'string' ? { kind: String(value.stop.kind), id: value.stop.id, said: String(value.stop.said ?? '') } : null;
  return { stamp: value.stamp, pending: pendingOf(value.told ?? value.pending), stop };
}

/** A promise's answer if it comes within `ms`, else `null`; the timer never outlives it. */
async function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<null>((done) => {
    timer = setTimeout(() => done(null), ms);
  });
  try {
    return await Promise.race([p, late]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** The most a tool answer's added lines may come to: two lines and two hundred characters. */
const PIGGYBACK_MOST = 200;

/**
 * THE LINE ADDED TO A TOOL'S ANSWER WHEN SOMETHING NEW WAITS (plan §2.3 B, §3.4): an instruction for this run it has not
 * been shown, each said once, in his words, with the call that takes it; and while he has it stopped or paused, that,
 * on every answer, unless the answer is already the record refusing it for that. At most two lines and 200 characters.
 * Empty when nothing new waits, which is almost always: never noisy.
 */
export function piggyback(w: Waiting, shown: ReadonlySet<string>, refusedFor?: string): { lines: string[]; shown: string[] } {
  const lines: string[] = [];
  const stopped = w.stop !== null && refusedFor !== 'RUN_STOPPED' && refusedFor !== 'RUN_PAUSED';
  if (stopped) {
    const held = w.pending.find((p) => p.id === w.stop!.id);
    const line = held?.line ?? `This run is ${w.stop!.kind === 'stop' ? 'stopped' : 'paused'} in BrainDog (${w.stop!.id}). Reply with instructions.`;
    lines.push(line.length <= PIGGYBACK_MOST ? line : `${line.slice(0, PIGGYBACK_MOST - 3).trimEnd()}...`);
  }
  /* A RESUME IS NEWS ONLY IN THE STOP LINE GOING AWAY; everything else not yet shown is said, a redirect taken for the
     run as it was made among them. */
  const fresh = w.pending.filter((p) => p.kind !== 'stop' && p.kind !== 'pause' && p.kind !== 'resume' && !shown.has(p.id));
  const room = (): number => PIGGYBACK_MOST - lines.join('\n').length - (lines.length > 0 ? 1 : 0);
  const said: string[] = [];
  if (fresh.length > 0 && lines.length < 2) {
    const first = fresh[0]!;
    const how = first.taken_by === null ? `Take it: instructions {take:"${first.id}"}` : `It is yours; when done, instructions {reply:"${first.id}"}`;
    const tail = `. ${how}.${fresh.length > 1 ? ` And ${String(fresh.length - 1)} more: instructions.` : ''}`;
    const head = `New for you: ${first.by ?? 'The owner'} (${first.id}): "`;
    const words = first.said.replace(/\s+/gu, ' ').trim();
    const fits = Math.max(0, room() - head.length - tail.length - 1);
    const quoted = words.length <= fits ? words : `${words.slice(0, Math.max(0, fits - 3)).trimEnd()}...`;
    lines.push(`${head}${quoted}"${tail}`);
    said.push(...fresh.map((p) => p.id));
  }
  return { lines: lines.slice(0, 2), shown: said };
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
 * it: `hello` for an `initialize` it answered, with the client and this server's build; `listed` for a tool list
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
    /* CUT TO THE CALLER'S SETTINGS, read fresh: a Read agent lists no writes, and a tool he switched off is
       not listed. A caller who is no agent's key, or a record too old to say, is listed every tool. */
    case 'tools/list': {
      const wrong = paged(params);
      if (wrong) return wrong;
      const listed = surface.onMachine === true ? TOOLS : listedFor(await effectiveOf(surface, ctx, watchOf(surface, caller), true));
      /* AND `answer`, FOR THE DECISION CARD ONLY (`answer.ts`), to a key Claude or ChatGPT holds: hidden from the model in
         both apps, and of no use to it, since it holds no grant. */
      const shown: unknown[] = listed.map(listedTool);
      if (surface.onMachine !== true && (await answersFor(surface, ctx))) shown.push(ANSWER_LISTED);
      hear(surface, ctx, { kind: 'listed', n: shown.length });
      return said({ tools: shown, ttlMs: HOUR, cacheScope: 'private' });
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
        return said(render(ownWords('propose', args, { result: DECIDES_NOT, text: refusalBrief(DECIDES_NOT.refusal), structured: DECIDES_NOT.refusal }, { ...params, ...args })));
      const name = params.name;
      /* A PRESS ON A DECISION CARD (`answer.ts`), answered with the grant the card was drawn with, or refused for want of
         one, which is the model asking. Before the switches and what waits: it is the person's press, not the agent's call. */
      if (name === ANSWER_TOOL && answers(surface)) return said(await answerCall(surface, args, ctx));
      const watch = watchOf(surface, caller);
      /* A TOOL HE SWITCHED OFF FOR THIS AGENT IS REFUSED BEFORE IT RUNS, whatever list the client cached (`TOOL_OFF`). */
      const off = offFor(name, await effectiveOf(surface, ctx, watch, false));
      if (off !== null) return said(render(off));
      /* WHAT WAITS FOR THIS RUN IS ASKED BESIDE THE CALL, never before it: a tool's answer waits for it at most
         `WAITING_GRACE_MS` after its own is ready. `context` and `instructions` say what waits themselves. */
      const says = name === 'context' || name === 'instructions';
      const waiting = says ? null : waitingFor(surface, ctx);
      const answered = await mcp.answer(name, args, ctx);
      const out = ownWords(name, args, answered);
      if (refused(out.result) && out.result.refusal.code === 'INTERNAL') hear(surface, ctx, { kind: 'internal' });
      /* AND ONE READ COUNTED FOR THE AUDIT, `mcp:<tool>`, for an answered call: never awaited, never failing it. */
      if (out.result.ok && typeof surface.toolSeen === 'function') {
        try {
          surface.toolSeen({ tool: params.name }, ctx);
        } catch {
          /* One call uncounted. */
        }
      }
      /* THE CARD'S DATA RIDES BESIDE THE ANSWER, only when this answer is one the card can draw. */
      let drawn = out.result.ok ? cardOf(params.name, args, out.structured, origin) : null;
      let granted: Record<string, unknown> = {};
      if (drawn !== null) {
        /* THE RECORD'S SLUG IS ASKED ONLY FOR AN ANSWER A CARD DRAWS, so the link lands on this record and not the app's front door. */
        const slug = origin === undefined ? undefined : await slugOf(surface, ctx);
        /* A DECISION'S PICTURES ARE DRAWN AGAINST ITS GROUND, read as the caller, and never waited on past `GROUND_MS`. */
        const asked = drawn.kind === 'decision' ? questionIn(out.structured) : null;
        const look: Look = asked === null ? {} : { now: Date.now(), ground: (await within(groundOf(surface, ctx, asked), GROUND_MS)) ?? {} };
        drawn = cardOf(params.name, args, out.structured, origin, slug, look) ?? drawn;
        /* AND ITS GRANT, when the record gives one: the card's buttons then answer, and the grant rides in `_meta` only. */
        if (drawn.kind === 'decision' && asked !== null) {
          const id = typeof asked.id === 'string' && asked.id !== '' ? asked.id : String(args.id);
          const g = await withGrant(surface, ctx, id, drawn);
          drawn = g.card;
          granted = g.meta;
        }
      }
      const shown = render(out);
      /* A RULE IS ANSWERED BY `governance`, WHICH LISTS THE DECISION CARD, so the answer names its own template beside it. */
      const meta: Record<string, unknown> = { ...(drawn?.kind === 'rule' ? cardMeta('rule') : {}), ...granted };
      const body = drawn === null ? shown : { ...shown, structuredContent: { ...out.structured, card: drawn } };

      /* WHAT WAITS, ON EVERY ANSWER (plan §2.3 B, §8.3): `_meta.braindog = { stamp, pending, stop }`, and one line or
         two added to the text when something new waits. From the answer itself for `context` and `instructions`, which
         said it, and everything they said counts as shown. */
      const w: Waiting | null = says ? waitingIn(out.structured) : await within(waiting!, WAITING_GRACE_MS);
      if (w === null) return said(Object.keys(meta).length === 0 ? body : { ...body, _meta: meta });
      watch.stamp = w.stamp;
      let content = body.content;
      let structured = body.structuredContent;
      if (says) for (const p of w.pending) watch.shown.add(p.id);
      else {
        const refusedFor = refused(out.result) ? out.result.refusal.code : undefined;
        const added = piggyback(w, watch.shown, refusedFor);
        for (const id of added.shown) watch.shown.add(id);
        if (added.lines.length > 0) content = [{ type: 'text', text: `${body.content[0]?.text ?? ''}\n${added.lines.join('\n')}` }];
        /* AND IN THE JSON COPY, because an app that hands its model the copy and not the text (Claude Code does) showed it none of this, while the record heard it was seen. */
        if (added.lines.length > 0 && isObject(structured)) structured = { ...structured, new_for_you: added.lines };
        /* AND THE RECORD HEARS IT WAS SEEN, in a tool answer, never waited on: the app says "Seen by S883 in a tool answer". */
        if (added.shown.length > 0 && typeof surface.instructionsMine === 'function') {
          try {
            void Promise.resolve(surface.instructionsMine({ seen: added.shown, how: 'tool' } as never, ctx)).catch(() => undefined);
          } catch {
            /* A mark that throws is a mark not kept. */
          }
        }
      }
      return said({ ...body, content, ...(structured === body.structuredContent ? {} : { structuredContent: structured }), _meta: { ...meta, braindog: { stamp: w.stamp, pending: w.pending, stop: w.stop } } });
    }

    /* THE PROMPTS: start, wrap and ask, which a client shows as commands and which cost the tool list nothing. */
    case 'prompts/get': {
      if (typeof params.name !== 'string') return fail(id, RPC.params, 'prompts/get needs the name of a prompt.', { allowed: PROMPTS.map((p) => p.name) });
      const given = isObject(params.arguments) ? params.arguments : {};
      const prompt = promptOf(params.name, given);
      if (prompt === null) return fail(id, RPC.params, `There is no prompt called ${params.name}.`, { allowed: PROMPTS.map((p) => p.name) });
      return said(prompt);
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

    /* THREE, EACH THE CALLS IN ORDER, held to the tools they name by `prompts.test.ts`. */
    case 'prompts/list':
      return paged(params) ?? said({ prompts: PROMPTS, ttlMs: HOUR, cacheScope: 'private' });

    default:
      return fail(id, RPC.method, `There is no method called ${method}.`, { allowed: METHODS });
  }
}
