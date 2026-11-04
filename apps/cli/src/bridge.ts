/**
 * `braindog mcp` as a thin bridge: each line the app writes goes to the host's own `POST /mcp`, and its answer comes back
 * as one line.
 *
 * THE SERVER IS THE HOST'S, NOT THIS COMMAND'S. Before this the command composed the server itself over a surface of one
 * host call per method (`surface.ts`), so a deploy reached no agent until its machine updated the command, and every
 * open session kept the tool list of the build it started with. Now the tools, their sentences and the instructions are
 * whatever the host serves, and one suite tests both transports.
 *
 * ONE MESSAGE PER LINE, ANSWERED AS IT FINISHES, the framing of `stdio.ts`: requests go out side by side and the id pairs
 * a reply with its request. `initialize` is answered before the next line is read, because what it agrees is how every
 * later request is sent. `ping` is answered on the machine; `notifications/cancelled` stops the request it names, and
 * nothing is written for that request after.
 *
 * WHAT LEAVES: the machine's bearer, `content-type: application/json`, `x-braindog-cli`, the session headers, the headers
 * that mirror the body (`packages/mcp/src/http.ts`, step 7), and, on a request that has `params`, the session hints as
 * `params._meta.session`. NO `Origin`, which the door refuses. A key the app set in `_meta.session` itself is left as
 * the app set it.
 *
 * WHAT COMES BACK. 200 with a body: written as one line. 202: nothing. 401: the sign-in ended while the session was open,
 * so this answer and every later one come from the refusing server (`signed-out.ts`). A network failure, a 5xx or the
 * budget: the refusal `UNREACHABLE` with its sentence (`surface.ts`).
 *
 * A WRITE WHOSE ANSWER WAS LOST IS SENT ONCE MORE, AND IS STILL ONE ENTRY. A timeout does not say whether the
 * host wrote: before this the call was never sent twice, so the agent was told it failed and wrote it again itself, two
 * tasks for one "add a task". Now a `create` or an `update` carries an operation id, the app's own or one made here, and
 * an answer that never came sends the same call with the same id once more. The record keeps the id on the first line of
 * the write and answers a second sending with the first one's entry (`packages/kernel/src/index.ts`, `opId`), so the
 * retry is one entry however many times it lands. Only when the host's listed `inputSchema` for that tool names
 * `op_id`: a host that predates it refuses an argument it does not list, and every write would fail. A read is never
 * sent twice, and nothing else is.
 *
 * A WRITE THAT MAY HAVE LANDED SAYS SO. Every other write, and a resend still away, was told
 * "could not be reached", so the agent wrote it again: a timeout, a 5xx and an unreadable answer all left after the host
 * may have written. Now the away outcome says `maybe`, true for those three and false only when the request never left
 * (refused, no such host, no route), and a write's call with `maybe` answers `UNREACHABLE_MAYBE`: read before sending
 * again. A read and the handshake keep the old sentence, since nothing they do can be twice.
 *
 * A DEPLOY MID-SESSION IS SEEN. Every answer carries `braindog-build`. When it differs from the one seen at the
 * handshake, the bridge writes one `notifications/tools/list_changed` and refreshes its cache, and the handshake told
 * the app `tools.listChanged`, so the app asks for the new list.
 *
 * A HOST AWAY AT THE START is served from the cache (`bridge-cache.ts`): its last good handshake and tool list, every
 * tool refusing with the sentence. With no cache the bundled server answers the handshake, as it does signed out.
 *
 * THE INPUT CLOSING ENDS THE RUN (`endOnClose`), once, and only a run this bridge attached by its host session's id.
 *
 * WHILE THE SESSION IS OPEN THE BRIDGE PULSES THE RECORD (agents and MCP plan §2.3 C, §4.4): every fifteen seconds, and
 * every five while he has stopped or paused the run, one `pulse` that says the session is open and answers what he
 * told the run that is still open and what stops it. Its answer is written to the session's inbox file
 * (`inbox-file.ts`), which the prompt, tool and stop hooks read and nothing else, and the instructions those hooks
 * showed go back with the next pulse, with how, so the app can say "Seen by S883 on its next prompt". Only for a
 * session that names its host session by id, since the file is keyed by it. A host older than `pulse`, a sign-in that
 * ended, or a token that may not pulse stops the pulse for the session; a host that is away leaves the file as it was,
 * so it goes stale and every hook lets the call go on.
 *
 * AND, OPT-IN, A CHANNEL (plan §2.3 D): with `BRAINDOG_CHANNEL=1` (and not switched off in his settings, when the
 * record says), the bridge declares `experimental['claude/channel']` and sends each new instruction as
 * `notifications/claude/channel` with its line as `content` and `{instruction, kind}` as `meta`, so a Claude Code
 * session started with `--dangerously-load-development-channels server:braindog` hears it mid-turn. Claude Code 2.1.304
 * delivers a channel only on a connection of the older protocol revisions ("connection negotiated a modern protocol
 * revision with no unsolicited notification path", in its own source), so with the channel on the bridge asks for
 * `2025-11-25` at the handshake and declines `server/discover`. Only lines from `pulse` are ever sent, which are his.
 *
 * THE FIRST PULSE THAT FINDS A RUN KEEPS THIS PROFILE'S PLACE (`profile-place.ts`): where the Profiles add-on is on, its
 * Places row for this profile on this machine is written once a day at most, with the build, the hooks and when it was
 * heard. Without the add-on it costs one read a day, and nothing is said.
 *
 * STDOUT CARRIES THE PROTOCOL AND NOTHING ELSE, and no line written anywhere holds the bearer.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import { TOOLS, type McpSurface } from '@braindog/mcp';
import { agreed, handle, VERSIONS, type Reply } from '@braindog/mcp/rpc';

import { readDoorCache, writeDoorCache, type DoorCache } from './bridge-cache.ts';
import { hooksThere } from './doctor.ts';
import { BUDGET_MS, type Target } from './http.ts';
import { readSession, sessionPath } from './hooks.ts';
import {
  heldOf,
  inboxPath,
  pruneInboxes,
  PULSE_HELD_MS,
  PULSE_MS,
  readInbox,
  readState,
  statePath,
  toldOf,
  writeFlags,
  writeInbox,
  type Inbox,
  type SeenHow,
  type Told,
} from './inbox-file.ts';
import { loginCommand } from './login.ts';
import { cliBuild, git, positionOf, type ClientInfo } from './position.ts';
import { keepPlace } from './profile-place.ts';
import { signedOutSurface } from './signed-out.ts';
import { helloOf } from './stdio.ts';
import { UNREACHABLE_FIX, type Ctx } from './surface.ts';

/** Where the bridge reads and writes, and what it may be told in place of its defaults (a test's fetch and folder). */
export type BridgeIo = {
  input: Readable;
  output: Writable;
  /** A line for whoever reads the server's log, on stderr. Never the protocol, never a key. */
  say?: ((line: string) => void) | undefined;
  /** The folder `.braindog/cache` is under: the home folder unless a test names another. */
  home?: string | undefined;
  /** The budget of one request, twenty seconds unless `BRAINDOG_TIMEOUT_MS` says otherwise (`budgetOf`). */
  ms?: number | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  /** The sentence a call refuses with once the host has said the sign-in ended. Left out, the one written here. */
  signedOut?: string | undefined;
  /** The environment the session files are found by (`hostsPath`), this process's own unless a test names another. */
  env?: Record<string, string | undefined> | undefined;
  /** The folder the app started this server in, where its session files and its repository are: this process's own. */
  cwd?: string | undefined;
  /** How long the end waits for that hook's end to land (`HOOK_ENDED_MS`). */
  hookEndedMs?: number;
  /** How long the end waits for Claude Code's end hook to take the run (`END_GRACE_MS`). */
  endGraceMs?: number | undefined;
  /** How often the bridge pulses (`PULSE_MS`), and how often while the run is stopped or paused (`PULSE_HELD_MS`). */
  pulseMs?: number | undefined;
  heldMs?: number | undefined;
  /** Whether the channel is offered: `BRAINDOG_CHANNEL` in the environment unless a test says. Off by default. */
  channel?: boolean | undefined;
  /**
   * The name the session's inbox file goes by when the app says no session id of its own: Codex's, by the Codex process
   * (`codexSession`). Its pulse then names no session, and the record finds the run as it finds every Codex call.
   */
  session?: string | undefined;
  /**
   * The line to say once in the next tool answer when a newer command was installed under this session
   * (`watchInstalled`), else `null`. Left out, nothing is ever said.
   */
  installed?: (() => string | null) | undefined;
};

/**
 * A tool's answer with one more line of text at its end, for the agent to read: how a newer command reaches a session
 * that is open. Anything but a tool's answer with content is left as it is.
 */
export function withLine(reply: Reply, line: string): Reply {
  if (!('result' in reply) || !isObject(reply.result) || !Array.isArray(reply.result.content)) return reply;
  return { ...reply, result: { ...reply.result, content: [...reply.result.content, { type: 'text', text: line }] } };
}

/** The longest a tool call waits for the pulse that tells the record what the hooks showed first (`seenFirst`). */
export const SEEN_FIRST_MS = 2_000;

/** Whether the environment turns the channel on: `BRAINDOG_CHANNEL` set to 1, on, yes or true. Anything else is off. */
export const channelOn = (env: Record<string, string | undefined>): boolean => /^(?:1|on|yes|true)$/iu.test(env.BRAINDOG_CHANNEL ?? '');

/** The revision the bridge asks for while the channel is on: the newest one Claude Code delivers a channel on. */
export const CHANNEL_REVISION = '2025-11-25';

/** The capability a server declares to offer a channel, as Claude Code 2.1.304 reads it (`experimental`). */
export const CHANNEL_CAPABILITY = 'claude/channel';

/** The notification a channel message is, with `content` and string-valued `meta`. */
export const CHANNEL_METHOD = 'notifications/claude/channel';

/** The refusals that mean this session's pulse will never be answered, so it stops: no such method, or no such caller. */
const PULSE_NEVER: ReadonlySet<string> = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD', 'FORBIDDEN', 'UNAUTHORIZED']);

/** The most instruction ids the inbox file keeps as reported, newest last. */
const REPORTED_MOST = 200;

/** How long the bridge waits, once its input closed, for the session's end hook to say it is ending the run itself. */
export const END_GRACE_MS = 1_500;

/** How long after its input closed the bridge waits for that hook's `end` to land, before it sends one itself. */
export const HOOK_ENDED_MS = 2_000;

/**
 * The most the end itself may take. An app gives a server two seconds between closing its input and SIGTERM, and two
 * more before SIGKILL; the command takes SIGTERM as the end of input (`main.ts`), so the grace and the end fit in four.
 */
export const END_MS = 2_000;

/** How long after a stop signal the command leaves whatever it is doing: the grace, the end and a little over. */
export const SIGNAL_EXIT_MS = HOOK_ENDED_MS + END_MS + 500;

/**
 * The session headers for a request, given what the app said it is in its hello: `sessionHeaders` in `position.ts`,
 * read per request by the caller because the start hook may write the session file after the server starts.
 */
export type Hints = (client: ClientInfo) => Promise<Record<string, string>>;

type Message = Record<string, unknown>;
type Id = string | number;
type Refusal = { code: string; fix: string; at?: string };

const isObject = (x: unknown): x is Message => typeof x === 'object' && x !== null && !Array.isArray(x);
const idOf = (m: Message): Id | null => (typeof m.id === 'string' || typeof m.id === 'number' ? m.id : null);

/**
 * The hints `_meta.session` carries (`packages/host/src/session.ts`), each by the header that says it. `worktree` is
 * the worktree folder apart from its repository (`position.ts`), which the host reads and hands the record, so a lead
 * and its builders in worktrees of one repository see each other; `seat` is the Claude Code profile's name, so an
 * instruction aimed at one profile reaches the runs under it.
 */
const HINT_OF: Readonly<Record<string, string>> = {
  'x-braindog-session': 'spoken',
  'x-braindog-client': 'client_id',
  'x-braindog-host': 'host',
  'x-braindog-repo': 'repo',
  'x-braindog-worktree': 'worktree',
  'x-braindog-remote': 'remote',
  'x-braindog-cwd': 'cwd',
  'x-braindog-agent': 'agent',
  'x-braindog-client-name': 'client',
  'x-braindog-client-version': 'client_version',
  'x-braindog-parent': 'parent',
  'x-braindog-profile': 'seat',
};

/** The hints the session headers say, as `_meta.session` spells them. `x-braindog-cli` stays a header. */
export function hintsOfHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) if (HINT_OF[name] !== undefined) out[HINT_OF[name]] = value;
  return out;
}

/**
 * The message with `params._meta.session` set to the hints, under any key the app set itself. A message with no
 * `params`, or a `_meta.session` that is not an object, goes as the app wrote it.
 */
export function withHints(message: Message, hints: Record<string, string>): Message {
  if (!isObject(message.params) || Object.keys(hints).length === 0) return message;
  const meta = isObject(message.params._meta) ? message.params._meta : {};
  if (Object.hasOwn(meta, 'session') && !isObject(meta.session)) return message;
  const own = isObject(meta.session) ? meta.session : {};
  return { ...message, params: { ...message.params, _meta: { ...meta, session: { ...hints, ...own } } } };
}

/** An `Mcp-Name` a header can carry: the name, or the `=?base64?…?=` form the door decodes for one it cannot. */
const nameHeader = (name: string): string =>
  /^[\x20-\x7e]*$/.test(name) && !name.startsWith('=?base64?') ? name : `=?base64?${Buffer.from(name, 'utf8').toString('base64')}?=`;

/** The revision a request's own `_meta` names, as a request of the stateless revision does. */
const versionIn = (m: Message): string | undefined => {
  const meta = isObject(m.params) && isObject(m.params._meta) ? m.params._meta : {};
  const v = meta['io.modelcontextprotocol/protocolVersion'];
  return typeof v === 'string' ? v : undefined;
};

/** Whether a result answered under `version` says `resultType`, as `rpc.ts` decides it: the stateless revision or later. */
const stateless = (version: string | undefined): boolean => version === undefined || (/^\d{4}-\d{2}-\d{2}$/.test(version) && version >= VERSIONS[0]);

/**
 * A tool's answer as Claude Code's model should read it: the short lines alone, without the JSON copy beside them.
 *
 * CLAUDE CODE HANDS ITS MODEL `structuredContent` WHEN A RESULT HAS ONE, in place of the text (659
 * answers in his sessions, every one read as JSON, 1.5 to 4 times the tokens). So the lines BrainDog writes for a model
 * never reached one, and what he told a run from the app, which rides on the text of the next answer, was marked seen
 * by a model that was never shown it. The copy stays for a refusal, for a call that asked `format: "full"`, for a
 * card's answer, and for every other app, which may draw it.
 */
export function linesForModel(reply: Reply, client: ClientInfo, message: Message): Reply {
  if (!/^claude[\s._-]*code/iu.test(client.name ?? '') || message.method !== 'tools/call' || !('result' in reply) || !isObject(reply.result)) return reply;
  const args = isObject(message.params) && isObject(message.params.arguments) ? message.params.arguments : {};
  const { structuredContent: copy, ...rest } = reply.result;
  const text = Array.isArray(rest.content) && rest.content.some((c) => isObject(c) && c.type === 'text' && typeof c.text === 'string' && c.text !== '');
  if (copy === undefined || !text || rest.isError === true || args.format === 'full' || (isObject(copy) && isObject(copy.card))) return reply;
  return { ...reply, result: rest };
}

/**
 * The client as a 2026-07-28 request names itself, in `_meta['io.modelcontextprotocol/clientInfo']`, or `null`.
 *
 * A CLIENT OF THAT REVISION NEVER SENDS `initialize`, so its name was never read and `linesForModel` never knew it was
 * Claude Code: a session started with `claude -p` on 24 Oct had its `context` handed to the model as the JSON copy, not
 * the card's lines. Every request carries the name, so the bridge reads it there too.
 */
export function namedIn(message: unknown): ClientInfo | null {
  if (!isObject(message) || !isObject(message.params) || !isObject(message.params._meta)) return null;
  const info = message.params._meta['io.modelcontextprotocol/clientInfo'];
  if (!isObject(info) || typeof info.name !== 'string' || info.name.trim() === '') return null;
  return { name: info.name, ...(typeof info.version === 'string' ? { version: info.version } : {}) };
}

/** A tool call refused, in the shape the host answers one: the refusal as the text, and whole beside it. */
const toolRefusal = (id: Id, refusal: Refusal, version: string | undefined): Reply => ({
  jsonrpc: '2.0',
  id,
  result: { ...(stateless(version) ? { resultType: 'complete' } : {}), isError: true, content: [{ type: 'text', text: JSON.stringify(refusal) }], structuredContent: refusal },
});

/**
 * The bundled server with every member refusing `UNREACHABLE`: what answers the handshake, a list and a read when the
 * host is away and nothing is cached. Built from the signed-out surface's members, so a member added there is here too.
 */
function unreachableSurface(): McpSurface<Ctx> {
  const no = () => Promise.resolve({ ok: false as const, refusal: { code: 'UNREACHABLE', fix: UNREACHABLE_FIX } });
  return Object.fromEntries(Object.keys(signedOutSurface('')).map((name) => [name, no])) as unknown as McpSurface<Ctx>;
}

/** The tools a lost answer is sent again for: the two that write and take an operation id. */
const RETRIED: ReadonlySet<string> = new Set(['create', 'update']);

/** The names of the tools a `tools/list` result says take `op_id`, read from each one's `inputSchema`. */
export function opTools(list: unknown): Set<string> {
  const out = new Set<string>();
  for (const tool of isObject(list) && Array.isArray(list.tools) ? list.tools : []) {
    if (!isObject(tool) || typeof tool.name !== 'string' || !isObject(tool.inputSchema)) continue;
    const props = tool.inputSchema.properties;
    if (isObject(props) && Object.hasOwn(props, 'op_id')) out.add(tool.name);
  }
  return out;
}

/**
 * The call as it is sent, and whether a lost answer may send it again: a `create` or an `update` carrying the app's own
 * `op_id`, or one made here when the host lists the argument for that tool (`takes`). Anything else goes as the app
 * wrote it, and once.
 */
export function withOpId(message: Message, takes: ReadonlySet<string>, mint: () => string = () => `op_${crypto.randomUUID()}`): { message: Message; again: boolean } {
  const params = isObject(message.params) ? message.params : undefined;
  if (message.method !== 'tools/call' || params === undefined || typeof params.name !== 'string' || !RETRIED.has(params.name)) return { message, again: false };
  const args = params.arguments ?? {};
  if (!isObject(args)) return { message, again: false };
  if (typeof args.op_id === 'string' && args.op_id !== '') return { message, again: true };
  /* AN ID THE APP SENT IN ANOTHER SHAPE is the host's to refuse, and is never replaced by one made here. */
  if (args.op_id !== undefined || !takes.has(params.name)) return { message, again: false };
  return { message: { ...message, params: { ...params, arguments: { ...args, op_id: mint() } } }, again: true };
}

/** The sentence a write answers when it left and no answer came: the host may have written it. */
export const UNREACHABLE_MAYBE = 'BrainDog did not answer in time, so this may or may not be recorded. Read before you send it again.';

/**
 * The tools that only read, which a lost answer cannot have written twice. The host's list decides for every tool it
 * lists, by `readOnlyHint`; a tool it does not list goes by this command's own list. Anything unknown is a write.
 */
export function readTools(list: unknown): Set<string> {
  const out = new Set(TOOLS.filter((t) => !t.writes).map((t) => t.name));
  for (const tool of isObject(list) && Array.isArray(list.tools) ? list.tools : []) {
    if (!isObject(tool) || typeof tool.name !== 'string') continue;
    if (isObject(tool.annotations) && tool.annotations.readOnlyHint === true) out.add(tool.name);
    else out.delete(tool.name);
  }
  return out;
}

/* THE ERRORS THAT MEAN THE REQUEST NEVER LEFT: no connection was made, or its certificate failed before a byte of the
   request was written, or the address could not be read, so the host cannot have written anything. */
const NEVER_LEFT: ReadonlySet<string> = new Set([
  'ERR_INVALID_URL',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'EHOSTDOWN',
  'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * Whether a fetch that threw may have reached the host. False only when an error in its chain names a connection that
 * was never made, whatever ended the signal after; a timeout (the signal's own reason, which names no connection), a
 * reset and anything this cannot read may have landed, so they are true.
 */
export function mayHaveLeft(err: unknown): boolean {
  const seen = new Set<unknown>();
  const queue: unknown[] = [err];
  while (queue.length > 0) {
    const e = queue.shift();
    if (!isObject(e) || seen.has(e)) continue;
    seen.add(e);
    if (typeof e.code === 'string' && NEVER_LEFT.has(e.code)) return false;
    queue.push(e.cause, ...(Array.isArray(e.errors) ? e.errors : []));
  }
  return true;
}

/** What one POST came to. `maybe` on `away` is true when the request left and its answer did not come back. */
type Outcome =
  | { kind: 'answer'; reply: Reply | null; build: string | null }
  | { kind: 'signed-out' }
  | { kind: 'away'; maybe: boolean }
  | { kind: 'refused'; refusal: Refusal; build: string | null };

/**
 * Serve until the input ends, then finish every request already in flight. Resolves once the last reply is flushed.
 *
 * `target` is the host and its bearer (`http.ts`), `hints` the session headers for a request.
 */
export async function serveBridge(io: BridgeIo, target: Target, hints: Hints): Promise<void> {
  const ms = io.ms ?? BUDGET_MS;
  const go = io.fetch ?? globalThis.fetch;
  const say = io.say ?? (() => undefined);
  const home = io.home ?? homedir();
  const ctx = (): Ctx => ({ signal: AbortSignal.timeout(ms) });
  const offline = unreachableSurface();

  /* THE REVISION THE HANDSHAKE AGREED, mirrored as `MCP-Protocol-Version` on every later request. */
  let version: string | undefined;
  let client: ClientInfo = {};
  /* THE HOST'S BUILD AS THE APP'S TOOL LIST KNOWS IT. `local` is true while that list is the cache's or the bundled
     server's, so the host's first answer says whether the app should list again. */
  let build: string | null = null;
  let local = false;
  /* SET BY A 401, AND NEVER UNSET: from then on the refusing server answers, as for a machine not signed in. */
  let refusing: McpSurface<Ctx> | null = null;
  let cache: DoorCache | null = readDoorCache(home, target.key);
  let refreshes = 0;
  /* THE TOOLS THE HOST SAYS TAKE `op_id`, from the last list it answered, or the cache's while it has answered none. */
  let takes = opTools(cache?.tools);
  /* THE TOOLS THAT ONLY READ, from the same list: a lost answer to one of them cannot have written anything. */
  let reads = readTools(cache?.tools);

  /* THE RUN THIS BRIDGE WORKED AS, by the session headers of the last request the host answered that named its host
     session by id: a tool call, or any call naming the run the start hook attached. `null` while it attached none. */
  let ran: Record<string, string> | null = null;

  const open = new Map<Id, AbortController>();
  const inFlight = new Set<Promise<void>>();
  /* Settled by the write's own callback, which is what makes "flushed" true on a Windows pipe. */
  const send = (reply: unknown) => new Promise<void>((done) => io.output.write(`${JSON.stringify(reply)}\n`, () => done()));
  const track = (job: Promise<void>) => {
    inFlight.add(job);
    void job.finally(() => inFlight.delete(job));
  };
  /* AN ANSWER MADE ON THE MACHINE SAYS THE BUILD THAT MADE IT, this command's (`serverInfo.version`), never `0.0.0`. */
  const onMachine = (message: unknown, surface: McpSurface<Ctx>, m?: Message) => handle(message, surface, ctx(), target.base, (m && versionIn(m)) ?? version, '', cliBuild());

  /** One POST to the host's `/mcp`, and what came of it. Never throws, and no sentence here quotes the request. */
  const post = async (message: Message, signal: AbortSignal): Promise<Outcome> => {
    /* A HINT THAT CANNOT BE READ IS A REQUEST WITHOUT HINTS, never one left unanswered. */
    const session = await hints(client).catch(() => ({}) as Record<string, string>);
    const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json', 'x-braindog-cli': cliBuild() });
    if (target.token) headers.set('authorization', `Bearer ${target.token}`);
    for (const [name, value] of Object.entries(session)) headers.set(name, value);
    const method = typeof message.method === 'string' ? message.method : undefined;
    const v = versionIn(message) ?? version;
    if (v !== undefined && method !== 'initialize') headers.set('mcp-protocol-version', v);
    if (method !== undefined) headers.set('mcp-method', method);
    const params = isObject(message.params) ? message.params : {};
    const named = method === 'resources/read' ? params.uri : method === 'tools/call' || method === 'prompts/get' ? params.name : undefined;
    if (typeof named === 'string') headers.set('mcp-name', nameHeader(named));
    /* BUILT BEFORE THE SENDING, so a body that cannot be written throws out of here as a request that never left. */
    const sending = JSON.stringify(withHints(message, hintsOfHeaders(session)));
    let res: Response;
    try {
      res = await go(`${target.base}/mcp`, { method: 'POST', headers, body: sending, redirect: 'error', signal });
    } catch (err) {
      /* The error could quote the request, and the request holds the bearer: only its codes are read. */
      return { kind: 'away', maybe: mayHaveLeft(err) };
    }
    const seen = res.headers.get('braindog-build');
    if (res.status !== 401 && res.status < 500 && attaches(method, session)) ran = session;
    if (res.status === 401) {
      await res.body?.cancel().catch(() => undefined);
      return { kind: 'signed-out' };
    }
    if (res.status >= 500) {
      await res.body?.cancel().catch(() => undefined);
      return { kind: 'away', maybe: true };
    }
    if (res.status === 202) return { kind: 'answer', reply: null, build: seen };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: 'away', maybe: true };
    }
    if (isObject(body) && body.jsonrpc === '2.0') return { kind: 'answer', reply: body as Reply, build: seen };
    /* A 403 FOR SOMEBODY NO LONGER ON THE RECORD, OR A 429, is the record's refusal in the shape `/api` gives it. */
    const r = isObject(body) ? body.refusal : undefined;
    if (isObject(r) && typeof r.code === 'string' && typeof r.fix === 'string') return { kind: 'refused', refusal: { code: r.code, fix: r.fix }, build: seen };
    return { kind: 'away', maybe: true };
  };

  /** The tool list again, after a deploy, kept for a session that starts while the host is away. Nothing is written. */
  const refresh = () => {
    const message = { jsonrpc: '2.0', id: `bridge-refresh-${++refreshes}`, method: 'tools/list', params: {} };
    void post(message, AbortSignal.timeout(ms)).then((got) => {
      if (got.kind !== 'answer' || got.reply === null || !('result' in got.reply) || !isObject(got.reply.result)) return;
      writeDoorCache(home, target.key, { build: got.build ?? undefined, tools: got.reply.result });
      takes = opTools(got.reply.result);
      reads = readTools(got.reply.result);
      cache = readDoorCache(home, target.key);
    });
  };

  /** What the host's build on an answer means for the app's tool list. */
  const heard = (now: string | null) => {
    if (local) {
      local = false;
      /* THE SAME BUILD IS THE SAME LIST only when the list the app was given was the cache's. A cache with a handshake
         and no list gave it the bundled server's, which is this command's, not the host's. */
      const same = now !== null && cache?.build === now && cache.tools !== undefined;
      build = now;
      if (!same) {
        track(send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }));
        refresh();
      }
      return;
    }
    if (now === null) return;
    if (build === null) build = now;
    else if (now !== build) {
      build = now;
      say('BrainDog was updated while this session was open, so its tools are listed again.');
      track(send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }));
      refresh();
    }
  };

  /**
   * The app is told the bridge can say a list changed, because now it can, and, with the channel on, that it offers a
   * channel. `capabilities` is left as is otherwise.
   */
  const listChanged = (reply: Reply): Reply => {
    if (!('result' in reply) || !isObject(reply.result) || !isObject(reply.result.capabilities)) return reply;
    const caps = reply.result.capabilities;
    const tools = isObject(caps.tools) ? caps.tools : {};
    const experimental = isObject(caps.experimental) ? caps.experimental : {};
    return {
      ...reply,
      result: {
        ...reply.result,
        capabilities: { ...caps, tools: { ...tools, listChanged: true }, ...(channel ? { experimental: { ...experimental, [CHANNEL_CAPABILITY]: {} } } : {}) },
      },
    };
  };

  /* ── the pulse, the inbox file and the channel (plan §2.3 C and D) ─────── */

  const env = io.env ?? process.env;
  const channel = io.channel ?? channelOn(env);
  const every = io.pulseMs ?? PULSE_MS;
  const heldEvery = io.heldMs ?? PULSE_HELD_MS;
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;
  let pulsing: Promise<void> | null = null;
  let pulseOff = false;
  let closing = false;
  /* WHAT HIS SETTINGS SAY FOR THIS AGENT, read once when the first pulse finds a run: the stop switch, and the channel. */
  let settings: { hooks: boolean; channel: boolean | null } | null = null;
  /* WHETHER THIS PROCESS HAS KEPT ITS PROFILE'S PLACE, once, when the first pulse finds a run. */
  let placed = false;
  /* THE INSTRUCTIONS SENT BY CHANNEL, and those still to report as seen that way, by id. */
  const pushed = new Set<string>();
  const byChannel = new Set<string>();
  /* WHETHER THE APP HAS AGREED A REVISION, so no notification goes before the handshake is answered. */
  let greeted = false;
  /* WHETHER THIS SESSION HAS COMMITTED, read from git at most once a minute until it has, then kept. */
  let committed = false;
  let committedRead = 0;

  /** What his settings let this agent's hooks and channel do, from `whoami`; both on unless the record says off. */
  const readSettings = async (session: Record<string, string>): Promise<{ hooks: boolean; channel: boolean | null }> => {
    const got = await apiCall(target, 'whoami', {}, session, go, ms);
    const effective = got.kind === 'ok' && isObject(got.value) && isObject(got.value.effective) ? got.value.effective : {};
    const enforce = isObject(effective.enforce) ? effective.enforce : {};
    return { hooks: enforce.hooks !== false, channel: typeof enforce.channel === 'boolean' ? enforce.channel : null };
  };

  /**
   * One pulse, and how long until the next. Reads what the hooks showed since the last one, sends it with how, and
   * writes what came back to the session's inbox file and its flags. Never throws; a host away writes nothing.
   */
  const pulseOnce = async (): Promise<number> => {
    if (!target.token || refusing !== null) {
      pulseOff = true;
      return every;
    }
    const session = await hints(client).catch(() => ({}) as Record<string, string>);
    const id = session['x-braindog-client'] ?? io.session;
    if (typeof id !== 'string' || id === '') return every;
    const file = inboxPath(env, id);
    const before = readInbox(file);
    const mine = before !== null && before.host === target.key ? before : null;
    const state = readState(statePath(env, id));
    const reported = new Set(mine?.reported ?? []);
    /* WHAT WAS SHOWN SINCE, BY HOW: one pulse per way, the first carrying the stamp. Almost always one. */
    const groups = new Map<SeenHow, string[]>();
    const shown: [string, SeenHow][] = [...Object.entries(state.shown), ...[...byChannel].map((s) => [s, 'channel'] as [string, SeenHow])];
    for (const [sid, how] of shown) if (!reported.has(sid)) groups.set(how, [...(groups.get(how) ?? []), sid]);
    const ways = [...groups].map(([how, list]) => ({ how, list: list.slice(0, 50) }));
    const first = ways.shift();
    const stamped = mine?.stamp ? { stamp: mine.stamp } : {};
    const got = await apiCall(target, 'pulse', { ...stamped, ...(first ? { shown: first.list, how: first.how } : {}) }, session, go, ms);
    if (got.kind === 'refused') {
      if (PULSE_NEVER.has(got.code)) {
        pulseOff = true;
        say(`BrainDog's pulse was refused (${got.code}), so this session's hooks will not hear what you tell it in BrainDog.`);
      }
      return every;
    }
    if (got.kind === 'gone' || !isObject(got.value)) return every;
    /* EACH OTHER WAY IS ITS OWN PULSE, with the same stamp, and the last answer is the freshest. */
    let value: Record<string, unknown> = got.value;
    for (const way of ways) {
      const more = await apiCall(target, 'pulse', { ...stamped, shown: way.list, how: way.how }, session, go, ms);
      if (more.kind === 'ok' && isObject(more.value) && more.value.run === value.run) value = more.value;
    }
    if (typeof value.run !== 'string') return every;
    settings ??= await readSettings(session);
    /* THIS PROFILE'S PLACE ON THIS MACHINE (`profile-place.ts`), at most once a day, as the run just found. Awaited here,
       so the close waits for it before it ends the run, and only where the session says its profile and its machine. */
    const profile = session['x-braindog-profile'];
    const machine = session['x-braindog-host'];
    if (!placed && profile !== undefined && machine !== undefined) {
      placed = true;
      await keepPlace({
        ask: (method, body) => apiCall(target, method, body, session, go, ms),
        home,
        host: target.key,
        profile,
        machine,
        build: cliBuild(),
        hooks: hooksThere(env.CLAUDE_CONFIG_DIR || join(home, '.claude')),
        stopped: () => closing,
      });
    }
    const sent = [first, ...ways].flatMap((w) => w?.list ?? []);
    for (const s of sent) byChannel.delete(s);
    const pending = (Array.isArray(value.pending) ? value.pending : []).map(toldOf).filter((t): t is Told => t !== null);
    const stop = heldOf(value.stop);
    const lines = Array.isArray(value.lines) ? value.lines.filter((l): l is string => typeof l === 'string') : [];
    /* THE STOP IN THE RECORD'S OWN WORDS: its line when this pulse is the one that saw it, else the one kept for it. */
    const kept = mine !== null && mine.run === value.run && mine.stop !== null && stop !== null && mine.stop.id === stop.id ? mine.stop_line : null;
    const said = stop !== null && value.changed === true && lines[0] !== undefined && (stop.id === '' || lines[0].includes(stop.id)) ? lines[0] : kept;
    const sameRun = mine !== null && mine.run === value.run;
    if (!committed && Date.now() - committedRead >= COMMITTED_EVERY_MS) {
      committedRead = Date.now();
      committed = await committedSince(env, io.cwd ?? process.cwd(), id).catch(() => false);
    }
    const inbox: Inbox = {
      v: 1,
      host: target.key,
      run: value.run,
      stamp: typeof value.stamp === 'string' ? value.stamp : null,
      at: new Date().toISOString(),
      pending,
      stop,
      stop_line: said,
      hooks: settings.hooks,
      reported: [...new Set([...(sameRun ? [...reported] : []), ...sent])].slice(-REPORTED_MOST),
      ...(committed ? { committed: true as const } : {}),
    };
    try {
      writeInbox(file, inbox);
      writeFlags(env, id, Date.now(), inbox, state);
    } catch {
      /* A folder that cannot be written leaves the hooks with no file, and every hook lets the call go on. */
    }
    if (channel && greeted && settings.channel !== false) {
      for (const t of pending) {
        if (pushed.has(t.id) || state.shown[t.id] !== undefined) continue;
        pushed.add(t.id);
        byChannel.add(t.id);
        track(send({ jsonrpc: '2.0', method: CHANNEL_METHOD, params: { content: t.line, meta: { instruction: t.id, kind: t.kind } } }));
      }
    }
    return stop !== null ? heldEvery : every;
  };

  /* ONE PULSE AT A TIME, the timer's and a tool call's (`seenFirst`) in one lane, since each reads the file, sends what
     it has not reported, and writes the file again. */
  let lane: Promise<number> = Promise.resolve(every);
  const inLane = (): Promise<number> => {
    const next = lane.then(() => pulseOnce()).catch(() => every);
    lane = next;
    return next;
  };

  /** The next pulse, `wait` from now, unless the input has closed or the pulse was stopped. */
  const schedule = (wait: number) => {
    if (closing || pulseOff) return;
    pulseTimer = setTimeout(() => {
      pulseTimer = null;
      pulsing = inLane().then((next) => {
        pulsing = null;
        schedule(next);
      });
    }, wait);
    pulseTimer.unref?.();
  };

  /** Whether the hooks or the channel showed the run something the record has not been told yet. */
  const unreported = (id: string): boolean => {
    const reported = new Set(readInbox(inboxPath(env, id))?.reported ?? []);
    return byChannel.size > 0 || Object.keys(readState(statePath(env, id)).shown).some((sid) => !reported.has(sid));
  };

  /**
   * THE RECORD HEARS HOW THE RUN SAW AN INSTRUCTION BEFORE IT HEARS THE RUN'S OWN CALL. The prompt hook shows an
   * instruction and writes that it did; the record heard it only at the next pulse, up to fifteen seconds on, and a
   * BrainDog call the run made first (taking it, or any call whose answer carried it) was recorded as the first
   * sighting, so the app said "in a tool answer" or "when it asked" for what reached it on its prompt. The record keeps
   * the first way, so before a tool call this sends the pulse those sightings wait for, and the call goes after it. Only
   * when one waits, which is the first call after a hook showed something; and no longer than `SEEN_FIRST_MS`.
   */
  const seenFirst = async (): Promise<void> => {
    if (!greeted || closing || pulseOff || !target.token || refusing !== null) return;
    const session = await hints(client).catch(() => ({}) as Record<string, string>);
    const id = session['x-braindog-client'] ?? io.session;
    if (typeof id !== 'string' || id === '' || !unreported(id)) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    await Promise.race([inLane(), new Promise<void>((done) => (timer = setTimeout(done, SEEN_FIRST_MS)))]);
    if (timer !== null) clearTimeout(timer);
  };

  /**
   * The answer while the host is away. The handshake is the bundled server's, which agrees a revision with this app,
   * carrying the cached server's name, instructions and capabilities; the list is the cached one; a tool call refuses.
   * A write whose request left (`maybe`) refuses with the sentence that says it may be recorded, so it is read first.
   */
  const away = async (message: Message, id: Id | null, maybe: boolean): Promise<Reply | null> => {
    const v = versionIn(message) ?? version;
    if (id !== null && message.method === 'tools/call') {
      const name = isObject(message.params) ? message.params.name : undefined;
      const written = maybe && !(typeof name === 'string' && reads.has(name));
      return toolRefusal(id, { code: 'UNREACHABLE', fix: written ? UNREACHABLE_MAYBE : UNREACHABLE_FIX }, v);
    }
    if (id !== null && message.method === 'tools/list' && cache?.tools !== undefined && !(isObject(message.params) && message.params.cursor !== undefined)) {
      const { resultType: _was, ...listed } = cache.tools;
      return { jsonrpc: '2.0', id, result: { ...(stateless(v) ? { resultType: 'complete' } : {}), ...listed } };
    }
    const reply = await onMachine(message, offline, message);
    if (message.method === 'initialize' && reply !== null && 'result' in reply && isObject(reply.result) && cache !== null) {
      const { serverInfo, instructions, capabilities } = cache.initialize;
      return { ...reply, result: { ...reply.result, ...(isObject(serverInfo) ? { serverInfo } : {}), ...(typeof instructions === 'string' ? { instructions } : {}), ...(isObject(capabilities) ? { capabilities } : {}) } };
    }
    return reply;
  };

  /** One message the app wrote, sent and answered. */
  const forward = async (message: Message): Promise<void> => {
    const id = idOf(message);
    const method = message.method;
    const stop = new AbortController();
    if (id !== null) open.set(id, stop);
    let reply: Reply | null;
    try {
      if (method === 'tools/call') await seenFirst();
      const sent = withOpId(message, takes);
      /* POST THROWS only before it sends (its headers or its body), so a throw is a request that never left. */
      const once = () => post(sent.message, AbortSignal.any([stop.signal, AbortSignal.timeout(ms)])).catch((): Outcome => ({ kind: 'away', maybe: false }));
      let got = await once();
      /* SENT ONCE MORE WITH THE SAME ID, and only once: a host away twice is away, and the agent is told so. A first
         sending that may have landed still may have, however the second went. */
      if (got.kind === 'away' && sent.again && !stop.signal.aborted) {
        say('A write got no answer from the host, so it was sent once more with the same operation id.');
        const first = got.maybe;
        got = await once();
        if (got.kind === 'away' && first) got = { kind: 'away', maybe: true };
      }
      /* CANCELLED BY THE APP: it has said it will not read the answer, so none is written. */
      if (stop.signal.aborted) return;
      if (got.kind === 'signed-out') {
        if (refusing === null) say('The host no longer accepts this sign-in, so every call now answers how to sign in again.');
        refusing ??= signedOutSurface(io.signedOut ?? endedFix(target.key, tokenFromEnv(env, target.token)));
        reply = await onMachine(message, refusing, message);
      } else if (got.kind === 'away') {
        reply = await away(message, id, got.maybe);
        if (method === 'initialize') local = true;
      } else if (got.kind === 'refused') {
        heard(got.build);
        /* The number is a variable, as in `stdio.ts`, so every `code` key written here is a refusal code. */
        const internal = -32603;
        reply = id === null ? null : method === 'tools/call' ? toolRefusal(id, got.refusal, versionIn(message) ?? version) : { jsonrpc: '2.0', id, error: { code: internal, message: got.refusal.fix } };
      } else {
        reply = got.reply;
        if (method === 'initialize' && reply !== null && 'result' in reply && isObject(reply.result)) {
          build = got.build;
          writeDoorCache(home, target.key, { build: got.build ?? undefined, initialize: reply.result });
          cache = readDoorCache(home, target.key);
        } else heard(got.build);
        if (method === 'tools/list' && reply !== null && 'result' in reply && isObject(reply.result) && !(isObject(message.params) && message.params.cursor !== undefined)) {
          writeDoorCache(home, target.key, { build: got.build ?? undefined, tools: reply.result });
          takes = opTools(reply.result);
          reads = readTools(reply.result);
        }
      }
    } finally {
      if (id !== null) open.delete(id);
    }
    if (reply === null) return;
    if (method === 'initialize' || method === 'server/discover') {
      version = agreed(reply) ?? version;
      reply = listChanged(reply);
    }
    /* A NEWER COMMAND INSTALLED UNDER THIS SESSION is said once, at the end of the next tool answer (`installed`). */
    const newer = method === 'tools/call' ? (io.installed?.() ?? null) : null;
    if (newer !== null) say(newer);
    await send(linesForModel(newer === null ? reply : withLine(reply, newer), client, message));
  };

  for await (const line of createInterface({ input: io.input, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      /* JSON-RPC's parse error, spelt through a variable as `stdio.ts` spells it. */
      const code = -32700;
      track(send({ jsonrpc: '2.0', id: null, error: { code, message: 'This line is not JSON. Send one JSON-RPC message per line.' } }));
      continue;
    }
    const said = helloOf(message) ?? namedIn(message);
    if (said !== null) client = said;
    /* WITH THE CHANNEL ON, THE HANDSHAKE ASKS FOR A REVISION CLAUDE CODE DELIVERS A CHANNEL ON (see the top). */
    if (channel) message = channelHello(message);
    let job: Promise<void>;
    if (channel && isObject(message) && message.method === 'server/discover' && idOf(message) !== null) {
      /* DECLINED, so the app falls back to `initialize`, the handshake a channel is delivered on. Its error code is a
         variable, as `stdio.ts` spells them, so every `code` key written here is a refusal code. */
      const missing = -32601;
      job = send({ jsonrpc: '2.0', id: idOf(message), error: { code: missing, message: 'This server is reached with initialize while its channel is on.' } });
    } else if (!isObject(message) || refusing !== null || message.method === 'ping') {
      /* A MALFORMED MESSAGE, A PING, AND EVERYTHING AFTER A 401 are answered on the machine. */
      const surface = refusing ?? offline;
      job = onMachine(message, surface, isObject(message) ? message : undefined).then((reply) => {
        if (reply === null) return;
        if (isObject(message) && message.method === 'initialize') {
          version = agreed(reply) ?? version;
          reply = listChanged(reply);
        }
        return send(reply);
      });
    } else if (message.method === 'notifications/cancelled') {
      const asked = isObject(message.params) ? message.params.requestId : undefined;
      if (typeof asked === 'string' || typeof asked === 'number') open.get(asked)?.abort();
      continue;
    } else job = forward(message);
    /* THE HELLO IS ANSWERED BEFORE THE NEXT LINE IS READ, as in `stdio.ts`: what it agrees is how the rest are sent.
       A CLIENT OF THE 2026-07-28 REVISION SAYS HELLO WITH `server/discover` AND NEVER SENDS `initialize`: Claude Code
       2.1.304 does, so a pulse started on `initialize` alone never started there, and its prompt and tool hooks heard
       nothing he said after the start (found by `tools/door-check/instructions.check.mjs`). */
    if (isObject(message) && (message.method === 'initialize' || message.method === 'server/discover')) {
      await job;
      /* THE PULSE STARTS ONCE THE APP HAS SAID HELLO, its first a whole interval on: the start hook seeded the file. */
      if (!greeted) {
        greeted = true;
        pruneInboxes(env);
        schedule(every);
      }
    } else track(job);
  }

  closing = true;
  if (pulseTimer !== null) clearTimeout(pulseTimer);
  if (pulsing !== null) await pulsing;
  while (inFlight.size > 0) await Promise.all(inFlight);
  if (ran !== null && refusing === null) await endOnClose(io, target, ran, () => hints(client), go);
}

/**
 * The handshake as it is sent while the channel is on: an `initialize` asking for a revision newer than
 * `CHANNEL_REVISION` asks for that one instead, since Claude Code delivers no channel on the newer ones. Anything else
 * goes as the app wrote it.
 */
export function channelHello(message: unknown): unknown {
  if (!isObject(message) || message.method !== 'initialize' || !isObject(message.params)) return message;
  const asked = message.params.protocolVersion;
  if (typeof asked !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(asked) || asked <= CHANNEL_REVISION) return message;
  return { ...message, params: { ...message.params, protocolVersion: CHANNEL_REVISION } };
}

/** What one call to the host's `/api` came to: its value, the record's refusal code, or no answer. */
export type ApiOutcome = { kind: 'ok'; value: unknown } | { kind: 'refused'; code: string } | { kind: 'gone' };

/**
 * One record method through the host's `/api/<method>`, as the session it works for, the way the end is sent
 * (`endOnClose`). Never throws, and nothing it says quotes the request, which holds the bearer.
 */
export async function apiCall(target: Target, method: string, body: Record<string, unknown>, session: Record<string, string>, go: typeof globalThis.fetch, ms: number): Promise<ApiOutcome> {
  try {
    const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json', 'x-braindog-cli': cliBuild() });
    if (target.token) headers.set('authorization', `Bearer ${target.token}`);
    for (const [name, value] of Object.entries(session)) headers.set(name, value);
    const res = await go(`${target.base}/api/${method}`, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(Math.min(ms, 10_000)) });
    if (res.status === 401) {
      await res.body?.cancel().catch(() => undefined);
      return { kind: 'refused', code: 'UNAUTHORIZED' };
    }
    const said = (await res.json().catch(() => null)) as { ok?: unknown; value?: unknown; refusal?: { code?: unknown } } | null;
    if (said?.ok === true) return { kind: 'ok', value: said.value };
    if (said?.ok === false && typeof said.refusal?.code === 'string') return { kind: 'refused', code: said.refusal.code };
    return { kind: 'gone' };
  } catch {
    return { kind: 'gone' };
  }
}

/**
 * Whether a request the host answered attached this bridge to a run: it named its host session by id, and it was a tool
 * call, which opens the run when it writes, or it named the run the start hook attached (`x-braindog-session`).
 *
 * BY ID ONLY. A run named without a host session id came from the folder's session file, which may be another app's run
 * in the same folder, and ending that would end a session still working.
 */
export const attaches = (method: string | undefined, headers: Record<string, string>): boolean =>
  typeof headers['x-braindog-client'] === 'string' && (method === 'tools/call' || typeof headers['x-braindog-session'] === 'string');

/**
 * THE RUN ENDS WHEN THE APP CLOSES THIS SERVER. 842 of 888 runs on the owner's record were never ended:
 * SessionEnd does not fire for a window that was killed, a `-p` run or a subagent, and an app with no hooks has none.
 * The app closing standard input is the one end every session has, so the bridge sends `end` then, once.
 *
 * AS THE RUN IT WORKED AS. The session headers are read again, so a window that cleared ends the run it holds now, and
 * a read that no longer names a host session by id ends the run the last answered request named.
 *
 * AFTER THE END HOOK, NEVER BEFORE IT. A run the start hook attached has an end hook too, which meets the session's
 * people and sends its command lines before it ends the run; a write after an end brings the run back and starts a new
 * stretch, which would drop the step it left. So the bridge waits up to `END_GRACE_MS` for that hook to write `seen` on
 * the session's file, and then until `HOOK_ENDED_MS` for it to say the end landed (`ended`). Nothing here throws or prints
 * on the protocol.
 *
 * AND ONLY WHEN IT LANDED DOES THE BRIDGE LEAVE IT. Closing a window kills the hook too, right after `seen` and before its
 * `end` is sent, so the bridge saw `seen`, left the end to a hook that was gone, and the sweep wrote the run off twelve hours
 * later: his runs S963 and S971 carry `seen` and no end. `end` is idempotent, so sending it twice changes nothing.
 */
async function endOnClose(io: BridgeIo, target: Target, ran: Record<string, string>, now: () => Promise<Record<string, string>>, go: typeof globalThis.fetch): Promise<void> {
  const say = io.say ?? (() => undefined);
  try {
    const fresh = await now().catch(() => ({}) as Record<string, string>);
    const headers = typeof fresh['x-braindog-client'] === 'string' ? fresh : ran;
    const env = io.env ?? process.env;
    const cwd = io.cwd ?? process.cwd();
    const spoken = headers['x-braindog-session'];
    const closed = Date.now();
    if (spoken !== undefined && (await hookEnding(env, cwd, headers['x-braindog-client'] ?? null, spoken, io.endGraceMs ?? END_GRACE_MS))) {
      const left = (io.hookEndedMs ?? HOOK_ENDED_MS) - (Date.now() - closed);
      if (await hookEnded(env, cwd, headers['x-braindog-client'] ?? null, spoken, Math.max(0, left))) return;
    }
    const at = await positionOf(cwd);
    const body = { ...(at.branch === null ? {} : { branch: at.branch }), ...(at.head === null ? {} : { head: at.head }) };
    const sent = new Headers({ 'content-type': 'application/json', accept: 'application/json', 'x-braindog-cli': cliBuild() });
    if (target.token) sent.set('authorization', `Bearer ${target.token}`);
    for (const [name, value] of Object.entries(headers)) sent.set(name, value);
    const res = await go(`${target.base}/api/end`, { method: 'POST', headers: sent, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(END_MS) });
    const said = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    if (said?.ok === true) say('The app closed this session, so its run in BrainDog was ended.');
  } catch {
    /* A host away or slow at the close leaves the run to the record's sweep, as before. The error could quote anything. */
  }
}

/** Whether the end hook says its `end` landed, within `ms`: `ended` on a file that names the run, since its start hook wrote it. */
export async function hookEnded(env: Record<string, string | undefined>, cwd: string, client: string | null, spoken: string, ms: number): Promise<boolean> {
  const files = [...(client === null ? [] : [sessionPath(env, cwd, client)]), sessionPath(env, cwd)];
  const until = Date.now() + ms;
  for (;;) {
    for (const file of files) {
      const held = readSession(file);
      if (held !== null && held.spoken === spoken && held.ended !== undefined && Date.parse(held.ended) >= (Date.parse(held.at) || 0)) return true;
    }
    if (Date.now() >= until) return false;
    await new Promise((done) => setTimeout(done, 100));
  }
}

/** How often a bridge reads whether its session has committed, until it has. */
export const COMMITTED_EVERY_MS = 60_000;

/**
 * WHETHER THE SESSION HAS COMMITTED SINCE IT STARTED: HEAD in its folder is not the commit its start hook
 * kept (`head_at_start`). The session's own file first, then the folder's. No file, no commit kept, or no git: no.
 */
export async function committedSince(env: Record<string, string | undefined>, cwd: string, client: string | null): Promise<boolean> {
  const files = [...(client === null ? [] : [sessionPath(env, cwd, client)]), sessionPath(env, cwd)];
  const from = files.map(readSession).find((held) => held !== null)?.head_at_start ?? null;
  if (from === null) return false;
  const head = await git(cwd, 'rev-parse', 'HEAD');
  return head !== null && head !== from;
}

/**
 * Whether Claude Code's end hook is ending this run itself: within `ms`, a session file in this folder that names the
 * run says an end hook heard from it (`seen`) since its start hook wrote it. Every start hook writes the file without
 * `seen` and the end hook adds it first, before it sends anything, so `seen` is this session's end and no earlier one.
 * Polled, because the hook is a process of its own that may start after this one saw its input close.
 */
export async function hookEnding(env: Record<string, string | undefined>, cwd: string, client: string | null, spoken: string, ms: number): Promise<boolean> {
  const files = [...(client === null ? [] : [sessionPath(env, cwd, client)]), sessionPath(env, cwd)];
  const until = Date.now() + ms;
  for (;;) {
    for (const file of files) {
      const held = readSession(file);
      if (held !== null && held.spoken === spoken && held.seen !== undefined && Date.parse(held.seen) >= (Date.parse(held.at) || 0)) return true;
    }
    if (Date.now() >= until) return false;
    await new Promise((done) => setTimeout(done, 100));
  }
}

/**
 * The sentence every call answers once the host has said this machine's sign-in ended, in `signedOutFix`'s words.
 *
 * A TOKEN FROM `BRAINDOG_TOKEN` IS NOT A LOGIN, and the environment wins over the hosts file (`target`), so a new login
 * would change nothing: the person is told the variable is the one refused, and to replace it or unset it.
 */
export const endedFix = (host: string, fromEnv = false): string =>
  fromEnv
    ? `${host} does not take the token in BRAINDOG_TOKEN, so nothing was read or written. Tell the person to replace BRAINDOG_TOKEN with a token that works there, or to unset it and run ${loginCommand(host)} in a terminal, then start a new session. Until then do not answer from memory, and say that BrainDog is not signed in.`
    : `The login to ${host} ended, so nothing was read or written. Tell the person to run ${loginCommand(host)} in a terminal, then start a new session. Until then do not answer from memory, and say that BrainDog is not signed in.`;

/** Whether the token sent is the one `BRAINDOG_TOKEN` holds, which `target` sends before any the hosts file has. */
export const tokenFromEnv = (env: Record<string, string | undefined>, token: string | undefined): boolean =>
  token !== undefined && token !== '' && env.BRAINDOG_TOKEN === token;
