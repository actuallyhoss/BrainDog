/**
 * The tools, which are the whole of what an agent sees.
 *
 * THE COUNT IS THE DESIGN. `10-MCP` §4 puts a budget on it: the tool list is in every turn of every
 * session, so one more tool costs every conversation for ever. So the record's own vocabulary
 * carries the load: `list` takes a predicate rather than there being a filter tool per register.
 *
 * FOURTEEN OF THEM, AND THE THREE NEWEST ARE THINGS AN AGENT DOES EVERY SESSION.
 * `context` is the briefing for where it stands, `handoff`
 * keeps its session's next step true, and `meet` records a person it came across. Five went to pay
 * for them: `pages`, `page` and `metric` were already resources, `credentials` could never answer a
 * token because the keychain refuses every one, and `dry_run` previews a rule, which only a person
 * installs.
 *
 * AND `activity` IS THE FIFTEENTH, WHICH PAID FOR ITSELF. An agent used to a record-wide activity
 * log had no path to one here, because `history` takes a row and a session picking up after another
 * one does not yet know which row to ask about. It cost 117 tokens of the 45 the ceiling had left, so
 * four descriptions gave back what they were saying twice: `get` said the id grammar in its
 * description and again in its schema, `handoff` and `update` each said in their description what
 * their own schema and the instructions say, and `meet` listed the examples the instructions list.
 * The list measured 2,555 tokens before and 2,565 after, against a ceiling of 2,600.
 *
 * A SIXTEENTH, `money`, CAME AND WENT, AND WHAT IT PAID STAYS PAID. It arrived with the first money
 * ledger, to answer "how am I doing this month" by reading seven figures that one pack declares, by
 * id. It cost 91 tokens of the 35 the ceiling had left, and nine descriptions gave them back by
 * stopping saying what the instructions or the schema beside them already say. The instructions are ten rules
 * (`instructions.ts`) and a client shows them in the same payload as this list, so
 * `propose` carried two of them word for word ("an agent never decides" and "to change what you may
 * not"), `context` opened on the first rule's "where you are", and `handoff`'s `tried` repeated the
 * rule about ruling a dead end out. The other five are the schema beside them: `activity` compared
 * itself with `history` after its own first clause had said "the whole record", `governance`
 * explained its own `id` argument, `meet` said "never guess an email" beside an `email` that says
 * "only as seen", `propose`'s `question` said the word question, and two cursors said "to continue"
 * after the word cursor.
 * The list measured 2,565 before, 2,656 with the tool, and 2,565 again after.
 *
 * IT LEFT BECAUSE IT WAS THE ONE USE CASE IN THE CORE.
 * A tool that knows one pack's figure ids is a tool that answers a record keeping its money in any
 * other pack with "install ours", and its own refusal said exactly that. Nothing replaced it by name:
 * a page that draws the figures is `braindog:page/<slug>`, each figure it draws is offered at
 * `braindog:metric/<id>`, and both answer the record's whole reading, where the tool relayed eight
 * keys of it and had to be taught `held` and `delta` one bug at a time. Two currencies with no rate
 * between them still come back as one amount each and no sum, because that was always the kernel's
 * doing and never the tool's (`test/money-out.test.ts`). The list measured 2,597 tokens with the
 * tool and 2,520 without it, which leaves 80 of the ceiling free and spends none of them here.
 *
 * AND THAT LEFT A CLIENT WITH TOOLS ALONE NO FIGURE AT ALL. A probe called each of the
 * nine reads with its most helpful arguments over a record with a money pack installed and not one answer named a
 * figure, and the resource list named only the figures a page draws, 18 of that pack's 36. So `record_index` names
 * the figures the caller may read and `get` reads one by its id, whatever pack declared it, for 16 tokens of the 72
 * the ceiling had left: 2,528 before, 2,544 after, still fifteen tools.
 * The record then learnt to list them (`figures`), so `record_index` names all 36 and asks three methods, `boot`,
 * `version` and `figures`, where naming the drawn 18 had run five pages and read eighteen figures.
 *
 * AND AUTOMATIONS COST IT NOTHING. `dry_run` went above because only a person
 * installed a rule; an agent now writes automations, so what one would do came back as `dry_run` on `propose`'s answer
 * for a rule change rather than as a tool, and the definitions, one automation with its runs, and the grammar are
 * resources. The list measured 2,597 tokens before and 2,597 after.
 *
 * AND SO DID `script_try`, BY THE SAME ROUTE. The design asked for a tool,
 * and the smallest one that says what it does, a name, a sentence and one `body` argument, measured 102 tokens by
 * `budget.test.ts`'s estimator against the 3 the ceiling had left. Nothing that size could be taken out of sixteen
 * descriptions that three passes have already cut to what the schema and the instructions do not say. So a trial is
 * asked on `propose`: a script change whose body also carries `"try"` is run now and filed nowhere, and the one place
 * that says so is `braindog:grammar/script`, a resource, so the list measured 2,597 after it.
 *
 * ASKED FOR, NEVER RUN ON EVERY SCRIPT CHANGE. It first came back on every script change's answer as `dry_run` does, and
 * a trial is not a dry run: it sends real requests, a POST among them, to origins nobody has approved yet, and spends a
 * run of the plan. So `propose` without `try` runs nothing, and "it changes nothing by itself" stays true either way,
 * because a trial writes nothing and files nothing. Filing nothing is also what lets an agent iterate: a trial per
 * attempt, and one question in Decide for the draft that works.
 *
 * AND A PAGE IS SEEN DRAWN THE SAME WAY. A page change whose body carries `"try": true` is
 * answered `page_preview`, the record's `previewPage` of it, and filed nowhere, so an agent sees what its blocks hold
 * before the owner is asked. It is a branch of `propose`'s, not a tool, for `script_try`'s reason, so the list costs
 * what it did; `budget.test.ts` holds that.
 *
 * AND `triage` IS THE SIXTEENTH, THE ONE TOOL THE CEILING WAS RAISED FOR. An
 * agent could read the inbox and act on none of it, because filing and setting aside were the owner's in a browser; the
 * record now admits a token its owner gave the `inbox` reach, and every other token is refused in the record's own
 * sentence. Nothing it says could ride on another tool's answer, as `dry_run` and `script_try` do, because it is a write
 * of its own, and no description had a clause left to give: the three passes above already cut them to what the schema
 * and the instructions do not say. So `budget.test.ts`'s ceiling went from 2,600 to 2,760, once, and never moves again.
 * The list measured 2,544 by that test's estimator before it, and the test's diagnostic is the count that holds after.
 *
 * AND THE RESOURCES ARE NOT TOOLS, which is the other half of the same argument. A resource list is
 * fetched when it is wanted, so the per-register variability, one `schema/<register>` each, costs
 * nothing in a turn that does not ask for it.
 *
 * A REFUSAL IS THE TEACHER. Every tool answers in the record's own shape, `ok` and a value or a code
 * and a sentence naming what to send instead, because the caller is a model that will try again
 * immediately, and the difference between a good refusal and a bad one is whether the second
 * attempt works.
 */

import { codeOf, conflicted, refused, type Refusal, type Result } from '@braindog/ports';
import type { HANDOFF_STATES as RecordHandoffStates } from '@braindog/record';
import { firewall } from '@braindog/record/sight';

import { SCRIPT_GRAMMAR } from '../grammars/script.ts';
import { ASKS, callsFound, catalogue, doorTakes, keyAsk, notADoor, type Ask, type CallRow } from './act.ts';
export { withCalls, type CallRow } from './act.ts';
import { ANSWERED_GRAMMAR, AUTOMATION_GRAMMAR } from './automations.ts';
import { names as scriptNames, ruleBrief, rulesBrief, scriptBrief, scriptsBrief } from './scripts.ts';
import {
  activityBrief,
  arrivalWhole,
  conflictBrief,
  figureBrief,
  governanceBrief,
  GROUPS_SHOWN,
  handedBrief,
  handoffBrief,
  historyBrief,
  instructionsBrief,
  pendingOf,
  type Pending,
  inboxDigestLines,
  inboxStateLines,
  indexBrief,
  listBrief,
  loggedBrief,
  metBrief,
  namedIn,
  type MetSaid,
  type Filed,
  plainOf,
  proposedBrief,
  ruledBrief,
  ruledOf,
  refusalBrief,
  rowWhole,
  schemaBrief,
  searchBrief,
  titleOf,
  triagedBrief,
  understoodBrief,
  wroteBrief,
  type Decl,
  type Field,
  type Look,
  type Page,
  type Shaped,
} from './brief.ts';
import { briefed, handlesIn } from './briefing.ts';
import { actorWords, agentOf, bare, callOf, clip, closest, counted, cursorIn, cursorOut, dayInWords, grouped, moneyIn, runnerOf } from './words.ts';

type Answer<T = unknown> = Promise<Result<T>>;
type Args = Record<string, unknown>;
/** A row as `list` returns it. Only what the skill listing reads is named. */
type Row = { state?: string | null; fields: Record<string, unknown> };

/**
 * The record, as the tools reach it: the methods they call and nothing else.
 *
 * STRUCTURAL, IN THE MANNER OF THE HOST'S `RecordSurface`, so the same tools run over the record in
 * process and over `@braindog/client` from the command line, and this package is tested with a stub.
 *
 * `C` IS WHATEVER THE TRANSPORT CARRIES. In process it is the record's `CallContext`; from the
 * command line it is nothing the tools look at, because the bearer travels in the request. The tools
 * hand it on and never read it, which is what keeps authorisation in one place: the record.
 *
 * THE ONES MARKED `?` ARE OPTIONAL, BECAUSE A HOST MAY NOT ANSWER THEM. The record answers the first four
 * of them since build step 16, and a host older than that does not. The command line offers only
 * the routes its client knows, so it still works against an older host. Without one, its tool
 * refuses with what to do instead, and its resource is not listed.
 */
export type McpSurface<C> = {
  boot(ctx: C): Answer<{ registers: { id: string; name: string }[] }>;
  version(ctx: C): Answer<{ version: number; slash?: boolean }>;
  whoami(ctx: C): Answer;
  schema(args: { register: string }, ctx: C): Answer;
  get(args: { register: string; seq: number } | { spoken: string }, ctx: C): Answer;
  list(args: { register: string; where?: unknown; limit?: number; cursor?: string | null }, ctx: C): Answer<{ rows: Row[] }>;
  search(args: { q: string; limit?: number }, ctx: C): Answer;
  history(args: { register: string; seq: number }, ctx: C): Answer;
  governance(args: never, ctx: C): Answer;
  propose(args: never, ctx: C): Answer;
  create(args: { register: string; fields: Args; note?: string; op_id?: string; said?: string }, ctx: C): Answer;
  update(args: { register: string; seq: number; patch: Args; version?: number; note?: string; op_id?: string; said?: string }, ctx: C): Answer;
  pages(ctx: C): Answer<{ slug: string; title: string }[]>;
  page(args: { slug: string }, ctx: C): Answer;
  metric(args: { metric: string }, ctx: C): Answer;
  digestToday(args: { digest?: string }, ctx: C): Answer;
  /** Where an agent stands; `task`, `project`, `depth` and `since` as the record's `context` takes them. */
  context?(args: never, ctx: C): Answer;
  /**
   * What he told the caller's own run, and its take or reply (the record's `instructionsMine`, DATA, plan §2, §8.2). It
   * backs the `instructions` tool. Optional for the command line's reason above: a surface without it answers that
   * `NOT_IN_THIS_BUILD`.
   */
  instructionsMine?(args: never, ctx: C): Answer;
  /**
   * TRUE FOR A SURFACE WHOSE TOOLS RUN ON THE MACHINE over a client (the command line's `--local`, `apps/cli/src/surface.ts`):
   * its handshake and tool list must answer with the host down, so `tools/list` is not cut by his settings there and
   * asks the host nothing. A call to a tool he switched off is still refused `TOOL_OFF`, by the call's own read.
   */
  onMachine?: true;
  handoff?(args: Args, ctx: C): Answer;
  meet?(args: Args, ctx: C): Answer;
  /** Take back one write of the caller's own run by its receipt's batch; the record refuses anyone else's. Optional like `meet`. */
  undoOwn?(args: { batch: string; dry?: boolean }, ctx: C): Answer;
  /**
   * One call of the record's table by its name, made as the app's `/api/<call>` makes it (`callRoute` in
   * `@braindog/host`): what the `act` tool runs. Optional like `undoOwn`: a surface without it answers `act`
   * `NOT_IN_THIS_BUILD`. Both hosts hand it beside the record (`withCalls`), and the command line sends it through its client.
   */
  call?(name: string, args: Args, ctx: C): Answer;
  /** The record's table of calls (`ROUTES` in `@braindog/host/table`), which `act` and `braindog:calls` are held to. */
  calls?(): readonly CallRow[];
  /** Hang a page on a thing, or give one it carries a new version (`methods/visuals.ts`). Optional like `undoOwn`. */
  attachVisual?(args: { on: string; page: string; title?: string; draft?: boolean }, ctx: C): Answer;
  /** Put a file on a thing, list a thing's files, and read one's words (`methods/attachments.ts`). Optional likewise. */
  attachFile?(args: { on: string; name: string; text?: string; sha256?: string }, ctx: C): Answer;
  attachments?(args: { on: string }, ctx: C): Answer;
  attachment?(args: { id: string; from?: number }, ctx: C): Answer;
  sessionsLive?(args: Record<string, never>, ctx: C): Answer;
  /**
   * The record's whole log, newest first, a page at a time, held to what the caller may see. READ+.
   *
   * OPTIONAL FOR ONE HOST AND NOT THE OTHER TWO. Both HTTP hosts hand `serveMcp` the whole
   * `RecordApi` (`apps/worker/src/index.ts:143`, `apps/selfhost/src/server.ts:1139`), so this
   * arrives with them. The command line builds a narrow surface over `@braindog/client` and routes
   * a fixed list (`apps/cli/src/surface.ts`), so until the name is in that list its callers get
   * `activity`'s own "not in this build" sentence rather than a method the client refuses.
   */
  recentHistory?(args: { limit?: number; cursor?: number | string; everything?: boolean }, ctx: C): Answer;
  /** Every scheduled action, with its key by label only. READ+, and optional for the same reason as the five above. */
  actions?(ctx: C): Answer;
  /** How the record is arranged, one page's declaration, or a grammar. READ+, optional likewise. */
  arrangement?(args: { page?: string; grammar?: string }, ctx: C): Answer;
  /** Every automation, or one with its last ten runs. READ+, optional likewise. */
  automations?(args: { rule?: string }, ctx: C): Answer;
  /**
   * What a rule body would do, writing nothing. READ+, and optional for one more reason than the others: it backs no
   * tool and no resource, only the `dry_run` on `propose`'s answer for a rule change, so a surface without it files the
   * change exactly as before and says nothing about what it would do.
   */
  dryRun?(args: { rule: Record<string, unknown>; limit?: number }, ctx: C): Answer;
  /**
   * A draft script run now, answering the writes it would make and writing none (`packages/host/src/script-try.ts`).
   * READ+, and optional for `dryRun`'s reason: it backs only `propose`'s `try` on a script change, and a surface
   * without it answers that `NOT_IN_THIS_BUILD`.
   */
  scriptTry?(args: { body: Record<string, unknown>; input?: unknown }, ctx: C): Answer;
  /**
   * A page body nobody has installed, drawn as `page` would draw it and held to what the caller may read, installing and
   * writing nothing (the record's `previewPage`). READ+, and optional for `scriptTry`'s reason: it backs only `propose`'s
   * `try` on a page change, and a surface without it answers that `NOT_IN_THIS_BUILD`. Both hosts hand the record's own
   * api to `serveMcp`, so over HTTP it is there without a line in either host.
   */
  previewPage?(args: { body: Record<string, unknown> }, ctx: C): Answer;
  /**
   * A whole change drawn as it would stand, every page it makes over sample rows if it brings any, installed in the
   * record's rehearsal and kept nowhere (the record's `previewChange`). READ+, and
   * optional for `scriptTry`'s reason: it backs only `propose`'s `try` on a bundle, or on one list or figure, and a surface
   * without it answers that `NOT_IN_THIS_BUILD`.
   */
  previewChange?(args: { to: unknown; rows?: unknown; about?: unknown }, ctx: C): Answer;
  /**
   * An automation body's steps taken by the real runner over a sample, everything they wrote rolled back and nothing
   * sent (the record's `tryAutomation`). READ+, and optional for `scriptTry`'s reason: it
   * backs only `propose`'s `try` on a rule change, and a surface without it answers that `NOT_IN_THIS_BUILD`.
   */
  tryAutomation?(args: { body: Record<string, unknown>; sample?: unknown; step?: string; given?: Record<string, unknown> }, ctx: C): Answer;
  /**
   * What arrived and no rule filed, in one state or all of them, with a count for each. The record's own rung, which is
   * the owner and a token its owner gave the `inbox` reach, and optional for the command line's reason above: its surface
   * is a fixed list. `digest` asks every state at once, its newest hundred each with the body cut to 180 characters,
   * and `id` one arrival whole (batch 88); a record older than those refuses them at their own key.
   */
  inbox?(args: { state?: string; limit?: number; digest?: boolean; id?: string }, ctx: C): Answer;
  /**
   * What each pattern did with the last 14 days of arrivals, door by door: filed, skipped with its reason, waiting, and
   * how many no pattern read (the record's `inboxPatterns`). READ+ on the inbox's own reach, so who may read it is
   * the record's to say, and optional for the command line's reason above.
   */
  inboxPatterns?(args: { days?: number }, ctx: C): Answer;
  /**
   * One arrival filed as a row in a list, or set aside (the record's `triage`). DATA,
   * and it admits a token only when its owner gave it the `inbox` reach. Optional for the command line's reason above:
   * both HTTP hosts hand `serveMcp` the whole record, and `apps/cli/src/surface.ts` routes it once its client knows it.
   */
  triage?(args: { arrival: string; register?: string; fields?: Args; ignore?: boolean; note?: string; back?: boolean; version?: number }, ctx: C): Answer;
  /**
   * Every figure the record declares that this caller may read, whatever pack declared it, and whether it is read about
   * one thing (`param`, asked as `<id>:<value>`). READ+, the record's `figures`. Without it the record's methods name a
   * figure only where a page draws it (`pages`, `page`) or by an id already known (`metric`): measured on the money
   * pack as it ships, 18 of its 36 figures, and what is late coming in among the 18 missing.
   *
   * OPTIONAL, for a command line built against a host older than the route, which `apps/cli/src/surface.ts` probes for.
   * Without it `record_index` and `resources/list` name the drawn ones, each read first, and `get` still reads any
   * figure by its id. With it the list is taken as answered, because the record holds it to `metric`'s own check.
   */
  figures?(ctx: C): Answer<{ id: string; name?: string; param?: boolean }[]>;
  /**
   * Everything this caller may read, in one read: `{ fixed, lists, pages, figures, skills }` (the record's `offered`,
   * READ+). A fixed address is decided by the check its own reader asks, never by running it, and a skill is its
   * name and when to use it. It backs `resources/list`, which with it reads no resource and draws no page: on a record
   * of 54 pages the old way took 8 seconds at every session start.
   *
   * OPTIONAL, for a host older than the route, which `apps/cli/src/surface.ts` probes for. Without it, or when it
   * refuses, `resources/list` reads each address and draws each page as it always has.
   */
  offered?(ctx: C): Answer;
  /**
   * What the record's walk over what it already holds would link next and ask on Decide, in names, with nothing changed
   * (the record's `understandPlan`, READ+). It backs the `braindog:understand` resource. Optional for the command line's
   * reason above: both HTTP hosts hand `serveMcp` the whole record, and a surface without it answers `NOT_IN_THIS_BUILD`.
   */
  understandPlan?(args: Record<string, never>, ctx: C): Answer;
  /**
   * What one thing on the record is, asked by its name: its kind, what else it goes by and where it was seen, or the
   * things the name may mean (the record's `about`, READ+). It backs `braindog:about/<name>`. Optional as the
   * read above is: a surface without it answers `NOT_IN_THIS_BUILD`.
   */
  about?(args: { name: string }, ctx: C): Answer;
  /**
   * What matters on the record now, a card a line (the record's `briefing`, READ+). It backs
   * `braindog:briefing`. Optional as the reads above are: a surface without it answers `NOT_IN_THIS_BUILD`.
   */
  briefing?(args: Record<string, never>, ctx: C): Answer;
  /**
   * Every widget Today can hold, each by name, group and sizes, whether the record can fill it and whether Today shows
   * it already (the record's `widgetGallery`, READ+). It backs `braindog:widgets`. Optional as the reads above are.
   */
  widgetGallery?(args: { board?: unknown[] }, ctx: C): Answer;
  /** What stopped on the record now, the longest quiet first (the record's `exceptions`, READ+). It backs `braindog:exceptions`. */
  exceptions?(args: Record<string, never>, ctx: C): Answer;
  /**
   * What went stale where the caller stands, each with the one call that clears it (the record's `stale`, READ+,
   * AGT-C18). It backs `braindog:stale`. Optional as the reads above are.
   */
  stale?(args: Record<string, never>, ctx: C): Answer;
  /**
   * The lessons that stand where the caller is, in the order to read them: method before fact, here before everywhere,
   * newest first, forty unless `limit` says otherwise (the record's `learnings`, READ+). It backs
   * `braindog:learnings`. Optional as the reads above are.
   */
  learnings?(args: { limit?: number }, ctx: C): Answer;
  /**
   * Take back a question this run asked, while it is still open (the record's `withdraw`, DATA). It backs
   * `propose`'s `withdraw`. Optional for the command line's reason above, and a surface without it answers that
   * `NOT_IN_THIS_BUILD`. Who may is the record's to say, and its refusal is said as it came.
   */
  withdraw?(args: { id: string }, ctx: C): Answer;
  /**
   * How long the start hook took (the record's `heard`, DATA), the one mark a caller posts itself. The door's
   * own marks go through `doorHeard`; `rpc.ts` falls back to this only on a surface without `doorHeard`.
   */
  heard?(args: { kind: 'hello' | 'listed' | 'called' | 'internal'; n?: number; build?: string; client?: string }, ctx: C): Answer;
  /** The door's own mark (the record's `doorHeard`, unrouted): hello, listed, called, internal; a key's called also moves its last tool call. `rpc.ts` prefers it to `heard`. */
  doorHeard?(args: { kind: 'hello' | 'listed' | 'called' | 'internal'; n?: number; build?: string; client?: string }, ctx: C): Answer;
  /** Fault `lens.firewall`, raised when the door's firewall took a field hidden from the caller off an answer (`http.ts`). */
  firewalled?(method: string, stripped: readonly string[]): void;
  /** The list a row named by its spoken id is on, `tasks#3` or `TK3`, for the firewall, or `null`. */
  listOf?(spoken: string): string | null;
  /** Whether amounts are hidden from this caller, so the firewall takes the ones written in an answer's text out too. */
  moneyHidden?(ctx: C): boolean;
  /** One tool call answered, counted for the audit as `mcp:<tool>` for a caller who is not an owner. */
  toolSeen?(args: { tool: string }, ctx: C): void;
  /**
   * The caller's run is still working (the record's `beat`, DATA): last seen moved in place, at most once a
   * minute, no version and no event. The door beats once for every tool call it admits (`beatOn`), so any client on it
   * reads Working while it calls tools, hook or none. Optional: both HTTP hosts hand `serveMcp` the whole record, so it
   * arrives with them; the command line routes a fixed list, and a surface without it answers every call as before.
   */
  beat?(args: Record<string, never>, ctx: C): Answer;
};

/**
 * A read surface with a stable address and cacheable content, which is the definition of a
 * resource and the reason these are not tools.
 *
 * EVERY RESOURCE IS BACKED BY A METHOD, so the permission ladder is the same one. One with no
 * method behind it would be a second read path with a second set of checks.
 */
export type Resource = {
  /** `braindog:<path>`. The address a client caches against. */
  uri: string;
  name: string;
  description: string;
  /** How long a client may hold it. `0` is "ask every time", which is what `whoami` is. */
  ttlMs: number;
};

/** An hour. A register's shape changes when a pack is installed, and not between one. */
export const HOUR = 3_600_000;
/** A minute. Long enough to stop a burst, short enough that a figure is not yesterday's. */
export const MINUTE = 60_000;

/**
 * The codes a scope check writes, which is what "this caller was not shown it" looks like on a block.
 *
 * TWO CODES FOR ONE FACT. `readable` is `guard(ctx, 'read', register)`: outside the ceiling is
 * `FORBIDDEN`, and inside it with a level that does not reach `read` is `LEVEL_REQUIRED`. A filter
 * naming only the first filters on the ceiling where the question is the level.
 *
 * AND A LIST OF CODES RATHER THAN "ANY REFUSAL AT ALL". A block refused for a misspelt key is a block
 * somebody has to be able to see in order to fix.
 */
export const WITHHELD_CODES: readonly string[] = ['FORBIDDEN', 'LEVEL_REQUIRED'];
const WITHHELD: ReadonlySet<string> = new Set(WITHHELD_CODES);

/**
 * Whether a page's blocks are every one withheld from their reader: at least one block, each with a refusal in
 * `WITHHELD_CODES`. THE KERNEL'S `whollyWithheld` TO THE LETTER, the rule the record's `pages()` drops a page
 * by, so an agent's list of resources and the record's list of pages never disagree on whether a page is there.
 *
 * SPELT HERE AND NOT IMPORTED, because this package imports the record's types and nothing else of it (`31 §2`: "`mcp`
 * imports the `RecordApi` *type* only", and `src/` imports ports alone): a value from `@braindog/record` would pull the
 * whole record into the command line's bundle, which carries the kernel and never the record. `withheld.test.ts` holds
 * the two to one list of codes and to one answer on a real record, so a drift between them fails by itself.
 */
const whollyWithheld = (blocks: readonly { refusals?: readonly { code: string }[] | undefined }[]): boolean =>
  blocks.length > 0 && blocks.every((b) => (b.refusals ?? []).some((r) => WITHHELD.has(r.code)));

export type Tool = {
  name: string;
  /**
   * What a host shows a person for it, in their words: "Suggest a change for the owner", never "propose".
   *
   * IT NAMES NO ROW AND NO LIST, which are the system's words for the person's own things. A
   * host draws it in a permission dialog and beside a step in a transcript, so it is copy a person reads.
   */
  title: string;
  /** What it does, in the words an agent reads before choosing it. Kept short: it is in every turn. */
  description: string;
  /** JSON Schema for the arguments. Small on purpose. */
  input: Record<string, unknown>;
  /** `read` tools never change anything, and a client may say so to its user. */
  writes: boolean;
  /**
   * A write that overwrites or takes away what was there, which a host asks a person about before it runs: `update` and
   * `undo`, whose undoing of a create deletes the row.
   *
   * THE SPEC'S DEFAULT FOR A WRITE IS DESTRUCTIVE, and every write here inherited it, so a new task prompted in Claude
   * as a delete would. The additive writes (`create`, `propose`, `log`, `meet`, `triage`, `handoff`) add a row, a
   * line or a question and take nothing away. `update` overwrites a value, and OpenAI's review rule is that "being able
   * to undo an action does not, by itself, justify setting destructiveHint to false", so it says so.
   */
  destructive?: true;
  /** A write that, sent again with the same arguments, leaves the record as the first call did (the spec's `idempotentHint`). */
  idempotent?: true;
  /**
   * Arguments the tool takes and does not list: a bridge's or a hook's, which every turn would pay for and no agent
   * needs to choose (`context`'s `since`, `instructions`' `seen`). Taken as a listed one is; never refused as stray.
   */
  quiet?: readonly string[];
};

const str = (description: string) => ({ type: 'string', description });

/**
 * The states a run hands itself into, the kernel's `HANDOFF_STATES` (`packages/kernel/src/handoff.ts`) as the record
 * passes it on. Written here and held to it by type, because this package's tool list is also the command's, which does
 * not load the record; `handoff-tool.test.ts` holds the two equal at run time too.
 */
const HANDOFF_STATES = ['idle', 'handoff', 'done'] as const;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const handoffStatesHeld: Same<typeof HANDOFF_STATES, typeof RecordHandoffStates> = true;
void handoffStatesHeld;
const int = (description: string) => ({ type: 'integer', description });
/**
 * `required` is left out when empty: in every tool that has none, it is tokens that say nothing.
 *
 * AND `additionalProperties: false` WENT, SEVEN TOKENS A TOOL, TO PAY FOR THE TITLES. A key a call does not take is
 * refused in a sentence that names what it does take (`FIELD_UNKNOWN`): by `strayIn` below for a tool that reads its
 * arguments by name, and by the record for one that hands them on whole. That teaches the second attempt the way the
 * schema keyword never did, which no server enforced. Measured by `budget.test.ts`'s estimator: 112 tokens across
 * sixteen tools.
 */
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  ...(required.length > 0 ? { required } : {}),
});

/* `format: "full"` on a read is said once, in the instructions, and the layer takes it off every call before anything
   reads it, so no tool's schema lists it: nine times six tokens. */

export const TOOLS: readonly Tool[] = [
  {
    name: 'record_index',
    title: 'See what is kept',
    /* AND ITS FIGURES, BECAUSE NOTHING ELSE AN AGENT CALLS NAMES ONE. With the one tool
       that read figures gone, the probe called all nine reads with their most helpful arguments and not one answer
       named a figure the record holds; they were resources, and a client that reads no resources had none. */
    /* AND ONE LIST'S FIELDS, WHICH WAS `schema` (agents and MCP plan §6.1, 12a): a tool of its own for one argument, folded
       here and still callable by its old name until `FOLDED_UNTIL`. */
    description: 'Lists with counts, and figures; register: its fields.',
    input: obj({ register: { type: 'string' } }),
    writes: false,
  },
  {
    name: 'context',
    title: 'Get your briefing',
    /* THAT IT IS THE FIRST CALL IS THE INSTRUCTIONS' FIRST RULE. What comes back is said in the order it is ranked:
      what he told you first, then where you are, your rules, who else is here and your lane. The four
       arguments are what saves a second call: a task whole with its version, a project by name, how much, and since a
       stamp, which answers only what moved. */
    description: 'Start here: what you were told, where you are, who is here, your lane.',
    /* `depth` AND `since` ARE TAKEN AND NOT LISTED (`quiet`): a task asks the task's depth and `format: "full"` the full
       one, and `since` is a bridge's or a hook's, which hold the stamp `_meta.braindog` carries; an agent is handed what
       moved on its next answer without asking. */
    /* AND `topic`, WHAT THE PERSON IS WORKING ON, which an agent with no folder says on its first call (Claude.ai,
       ChatGPT, any remote client): with no repository, remote or folder it is the one thing that places its run, in the
       project of that name or the first one formed from it. An agent that sends none is asked for it in the answer. */
    input: obj({ task: str('Whole, like tasks#41.'), project: { type: 'string' }, topic: str('No folder: what they work on.') }),
    quiet: ['depth', 'since'],
    writes: false,
  },
  {
    name: 'instructions',
    title: 'Answer what you were told',
    /* WHAT HE TELLS AN AGENT FROM THE APP (§6.1), the one new tool, paid for by folding `history` and `schema`.
       The three calls are the examples, because an agent copies an example before it reads a sentence. */
    /* AND AN SG HE TOLD YOU TO ANSWER, with `option` and his words in `said` (`wordAnswer`, the owner's decision of 27
       October): the one example that says it, paid for out of the budget's last tokens. */
    description: 'What the person told you. Empty reads; take IN4 starts; reply IN4 with said, state; answer SG9 with option and said decides on their word.',
    /* AND `answer` ALONE, A QUESTION HIS ORDER NAMED, given as he said: the line he sent says the call. */
    input: obj({
      take: { type: 'string' },
      reply: { type: 'string' },
      said: { type: 'string' },
      state: { enum: ['done', 'needs_you', 'declined'] },
      answer: { type: 'string' },
      option: { type: 'string' },
    }),
    /* WHAT A CLIENT SHOWED IT AND HOW, which the bridge says for its hooks; an agent reading with `{}` marks them itself. */
    quiet: ['seen', 'how'],
    writes: true,
  },
  {
    name: 'get',
    title: 'Open one thing',
    /* THE GRAMMAR IS SAID ONCE, in the argument that takes it. It was in both, and a client shows a
       model the description and the schema together, so the three forms were read twice for 27
       tokens in every turn of every session. */
    /* AND ONE FIGURE, WHICH PAID FOR ITSELF IN A CLAUSE AND NOT A TOOL. The count was fifteen and a sixteenth cost
       91 to 117 tokens each time one was measured; this clause, the one in `spoken` and `record_index`'s cost 16, and
       the list measured 2,528 before and 2,544 after. A figure's id is a bare lowercase name, which no row form is. */
    /* AND "NEVER ADD TWO CURRENCIES" MOVED HERE FROM THE INSTRUCTIONS, beside the one read that answers a figure, when
       the instructions were cut to the three rules every call needs. */
    /* AND BY ITS NAME, AND WITH ITS HISTORY (§6.1): "Kiln" answers the one thing called that, and several are
       refused `NAME_AMBIGUOUS` with their handles; `history: true` folds in what was `history`, still callable by its old
       name until `FOLDED_UNTIL`. */
    description: 'One item or figure. Two currencies are never added.',
    input: obj(
      /* SHORTER BY TEN TOKENS FOR `handoff`'s take and drop: "from record_index" is what that tool's own
         description says of its figures, and a ref field's value is a row id by what it is. */
      { spoken: str('tasks#41, S42, a name, or a figure.'), history: { type: 'boolean' } },
      ['spoken'],
    ),
    writes: false,
  },
  {
    name: 'list',
    title: 'Browse entries',
    /* "NARROWED BY A PREDICATE. THE PREDICATE IS A TREE" SAID "PREDICATE" TWICE; saying it once paid for most of
       `fields` below. The list measured 2,720 before `fields` and 2,751 after, of the 2,760 `budget.test.ts` holds. */
    description: 'Items of one list, newest first.',
    input: obj(
      {
        register: { type: 'string' },
        /* "A PREDICATE TREE" WAS SAID HERE AND IN THE DESCRIPTION ABOVE, which a client shows in the same breath. The
           five tokens it cost went to `propose`'s `from_version`. */
        where: { type: 'object', description: 'Filters, like {"field":"state","is":"open"}.' },
        /* THE RECORD'S OWN TWO NUMBERS WERE "1 to 200. Default 25.", which was neither: `kernel.list` answers 50 when
           asked for none and up to 500 (`packages/kernel/src/index.ts`), and this tool forwarded `limit` untouched.
           The default became 20 and true, because the `list` below sends 20 when the call names no limit.
           AND THE CEILING IS 100 NOW, THIS TOOL'S AND NOT THE RECORD'S. A page of 500 rows is an answer no host
           shows a model whole (Claude Code holds a tool result to 25,000 tokens by default), so a call asking more is
           answered 100 and a cursor, and `mcp.test.ts` holds both figures to what this says. */
        /* A LIST OF SIXTY ROWS OR FEWER IS ANSWERED WHOLE WHEN NO LIMIT IS NAMED (`LIST_WHOLE`), AND THAT IS SAID HERE
           NOW. "Default 20." was true of a longer list alone, so an agent that asked for none and counted sixty rows
           had been told twenty. The four tokens it costs are 2,761 against the 2,760 `budget.test.ts` holds, so one
           came off `fields` below ("answered" became "kept"), and the two together measure 2,760. `search` keeps
           "Default 20.", which is still the whole truth of it. */
        limit: int('1 to 100. Up to 60 whole, else 20.'),
        cursor: { type: 'string' },
        /* THE ONE WAY PAST THE CUT, said where it is used. A row's long text stops at 280 characters and the row says
           `clipped: true`, so an agent that needs the whole write-up names its field here or reads the row with `get`. */
        fields: { type: 'array', items: { type: 'string' }, description: 'Text fields kept whole.' },
      },
      ['register'],
    ),
    writes: false,
  },
  {
    name: 'search',
    title: 'Search everything',
    description: 'Items matching your words, each a prefix, in any list.',
    /* AND 100, NOT THE 50 THIS SAID, for `list`'s reason one tool up. `ftsSearch` is
       `Math.min(Math.max(1, opts.limit ?? 20), 100)` (`packages/kernel/src/fts.ts:116`). Measured over
       130 rows all matching one word: `limit: 80` answered 80 hits, which an agent reading this was
       told it could not ask for. The default of 20 was right and is unchanged. */
    /* "WHAT TO LOOK FOR" IS WHAT `q` BESIDE "ROWS WHOSE TEXT MATCHES" ALREADY SAYS, and its five tokens went to `propose`. */
    input: obj({ q: { type: 'string' }, limit: int('1 to 100. Default 20.') }, ['q']),
    writes: false,
  },
  {
    name: 'activity',
    title: 'See recent changes',
    description:
      'What changed lately, newest first, by whom.',
    /* A CURSOR NOW, AND TWENTY BY DEFAULT. It took a limit alone, up to the record's 200 and 50 when asked for none, so
       the default read on the owner's record was 13 KB with 70 row ids in it, and a session that wanted the page below
       had no way to ask. Paged as `list` is, the closing line says what is left and the call that reads it. */
    /* ITS LIMIT IS `list`'s, 1 to 100 and 20 by default, and no longer said here: the eight tokens went to `handoff`'s take
       and drop, and an answer at the cap still says what is left and the call that reads it. */
    /* `everything` ASKS FOR THE RECORD'S OWN BOOKKEEPING BACK (the sweep, a run's seen stamps), which no agent picks a
       call for: taken and not listed (`quiet`), and its tokens went to `instructions`. */
    input: obj({ limit: { type: 'integer' }, cursor: { type: 'string' } }),
    quiet: ['everything'],
    writes: false,
  },
  {
    name: 'governance',
    title: 'See decisions',
    description:
      'Open questions, decisions with reasons, and predictions.',
    input: obj({
      register: { enum: ['suggestion', 'decision', 'prediction'] },
      /* "AN SG OR D NUMBER" WENT, for `instructions`: every question and decision an answer names is said with it. */
      id: { type: 'string' },
      status: { enum: ['open', 'resolved', 'all'] },
      /* `list`'s limit, said there and not again here, as `activity`'s: its tokens went to `handoff`'s take and drop. */
      limit: { type: 'integer' },
      cursor: { type: 'string' },
    }),
    writes: false,
  },
  {
    name: 'propose',
    /* "ASK THE OWNER TO DECIDE", five tokens shorter than "Suggest a change for the owner", for `handoff`'s take and drop. */
    title: 'Ask the owner',
    /* WHEN TO REACH FOR IT IS THE INSTRUCTIONS' SECOND RULE, and was said again here: "an agent never decides, lay out
       options with propose" and "to change something you may not change yourself, propose it" were the two clauses
       this description carried, in the same payload, a line apart. Where the person decides is said once, here. */
    /* "IN BRAINDOG" WENT TO PAY FOR `widget` IN `body_kind` (round 1030): where they decide is the record, and says so. */
    description: 'Ask the person, with what you would do. Nothing changes until they decide.',
    /* `cause` AND `withdraw`. A key is asked once: a second proposal with an open question's cause files
       nothing and is answered "Already waiting as SG90.". `withdraw` takes one back, a branch and not an eighteenth tool
       for `script_try`'s reason: the list was at its ceiling to the token, and a tool measured 76 where this is 21.
       `required` went, since a withdrawal sends none of the three, and a proposal missing one is refused by the record
       in the sentence that names it. The 45 they cost with `cause` was paid by `required`, this description, and nine
       others that said a thing twice (`update`'s version, which its `version` says, among them): 2,760 after. */
    input: obj(
      {
        question: str('One answerable sentence.'),
        body_kind: { enum: ['options', 'rowset', 'pattern', 'change', 'pack', 'settings', 'arrange', 'widget'] },
        /* THE change EXAMPLE WAS ONE THE RECORD REFUSES. Sent as written it answered `REQUIRED_MISSING` at
           `body.declaration_id`, and it taught the whole-declaration form for adding a field, which meant copying every
           field of the list and racing any other agent doing the same.
           `record/test/schema-add.test.ts` files the addition below against a real record, and
           `record/test/change-drawn.test.ts` holds `from_version` to being said.
           AND IT IS SHORTER BY A THIRD, TO PAY FOR THE TITLES. A rowset's `register` was taught and the tool reads it
           off every row's `at` (`rowset` below), an option's three keys were a sentence where a shape says them, and
           `braindog:arrangement` is named by `braindog:grammar/proposals` itself.
           AN OPTION'S `patches` ARE SAID, since an option that says a change and carries none is refused (`govern.ts`
           `unwritten`): an agent never told of them asked "Close all six" in words, and the pick closed nothing. */
        body: {
          type: 'object',
          description:
            'options: {"options":[{id,label,because,patches}]}, two or more; patches like rowset. rowset: {"rows":[{"at":"skills#3","version":1,"patch":{...}}]}. change: {"declaration_id":"register.things","to":{"add":{"fields":[...]}}}, or a whole declaration with from_version. Others, automations too: braindog:grammar/proposals.',
        },
        cause: str('A short key, so it is asked once.'),
        again: str('What changed since they answered.'),
        /* `covers`: the open SGs this one answers too, closed as moot when it is accepted. */
        covers: { type: 'array', items: { type: 'string' }, description: 'Open SGs this answers too.' },
        withdraw: str('Alone, takes back an SG you asked.'),
      },
    ),
    writes: true,
  },
  {
    name: 'create',
    title: 'Add something',
    description: 'Add an item; answers its number.',
    /* MONEY IS SAID WHERE IT IS WRITTEN. The instructions carried it as their second rule, read on every call; it
       matters on the two calls that write a value, and a brief answer now says every amount as a person reads it. */
    input: obj(
      {
        register: { type: 'string' },
        /* AND WHERE A CURRENCY COMES FROM: an amount on a field that names its account may leave the code out
           and takes the account's, and a row's code is kept for good, refused as CURRENCY_FIXED when a write changes it. */
        fields: {
          type: 'object',
          description: "Field ids to values. Money is minor units and a currency: GBP 2 decimals, JPY 0, KWD 3.",
        },
        note: { type: 'string' },
        /* A WRITE THAT CAN BE SENT AGAIN: the record replays a write by its operation id, so a call sent once
           more after a lost answer lands once. A bare type: what it is for is a client's to know, and costs no words. */
        op_id: { type: 'string' },
        /* HIS WORDS, WHEN HE TOLD YOU TO (the owner's decision of 27 October): a write that would have asked lands, said
           as his. What it is for is the instructions' second rule, so it is a bare type here and on `update`. */
        said: { type: 'string' },
      },
      ['register', 'fields'],
    ),
    writes: true,
  },
  {
    name: 'update',
    title: 'Change something',
    /* COMPARE-AND-SET IS SAID HERE, beside the one tool it governs, since the instructions were cut to the three rules
       every call needs. The refusal carries the current row (`rpc.ts`), so the retry needs no second read.
       AND DELETING IS SAID, because nothing told an agent how. Other records hand their agents a
       delete tool; here it is `deleted_at` through the same verb and the same permission, and an
       agent had no way to find that out. */
    description: 'Change an item; on VERSION_STALE, re-apply to current.',
    input: obj(
      {
        spoken: str('As get takes it.'),
        patch: { type: 'object', description: 'As create takes fields; null clears one, deleted_at true deletes.' },
        version: int('The version you read.'),
        note: { type: 'string' },
        op_id: { type: 'string' },
        said: { type: 'string' },
      },
      ['spoken', 'patch'],
    ),
    writes: true,
    destructive: true,
    idempotent: true,
  },
  {
    name: 'log',
    title: 'Add a note',
    /* AND A PAGE DRAWN ON IT: a visual changes no value, as a note changes none, so it rides on `log`
       rather than an eighteenth tool the list has no tokens for. `note` is then its title, and a page sent again under
       the same title is its next version. */
    description: 'Note an item; page: HTML drawn on it.',
    /* A NOTE ABOUT NOTHING IN PARTICULAR IS ONE CALL. It needed a row, so an agent first
       asked `context` for its session's id, or wrote something to open one, and then logged on it: two calls for what
       a log tool elsewhere does in one. Left out, the note goes on the caller's own session, and `log` in `tools`
       below says how. */
    /* `page` IS LISTED (door audit D33): the description names it, and a client that holds to the schema dropped it, so
       the page never arrived. `draft: true` stays taken and not listed, a page handed in to be kept or thrown away, which
       Try again's instruction names to the run; an agent's page is a draft whether it says so or not (`attachVisual`). */
    input: obj(
      { spoken: str('As get takes it. Omit for your run.'), note: { type: 'string' }, page: { type: 'string' } },
      ['note'],
    ),
    quiet: ['draft'],
    writes: true,
  },
  {
    name: 'handoff',
    title: 'Leave the next step',
    /* THE HANDOFF MANNERS ARE SAID HERE, once, beside the tool they are about: they were the instructions' sixth rule,
       read on every call of every tool. Each field's own rule stays beside the field. */
    /* TAKE AND DROP ARE A CALL OF THEIR OWN, on a step another run left: `take` picks it up, and the second of
       two sessions racing for it is told in the record's words who has it; `drop` closes one that is no longer true. */
    description: "Keep your step true: doing once known, next before you stop, dead ends in tried. task starts, done closes. take or drop another run's step; drop with why.",
    input: obj({
      next: str('One step.'),
      tried: { type: 'string' },
      note: { type: 'string' },
      /* `doing`, the kernel's own field: `title` is a reserved field id, and the record refuses it. */
      doing: str('Verb first.'),
      /* AN ENUM ALONE, as every other in this list: its `type` paid for `meet`'s `keys` saying its items are text, which
         a client that checks arrays (Gemini's) refuses a tool list without. The states are the kernel's (`HANDOFF_STATES`). */
      state: {
        enum: [...HANDOFF_STATES],
        description: 'handoff passes it on.',
      },
      take: { type: 'string' },
      drop: { type: 'string' },
      why: { type: 'string' },
      /* ONE CALL WHERE A FINISHED TASK TOOK THREE: `task` puts it in hand and sets it doing, `done` closes it
         with `note` and moves the next step. The record's `handoff` takes both and says what the task is now. */
      task: { type: 'string' },
      done: { type: 'string' },
    }),
    writes: true,
  },
  /* `understand` WAS THE SEVENTEENTH TOOL, and is the resource `braindog:understand` now: "Tools: keep the
     16". It takes nothing and writes nothing, which is a resource's shape, and its tokens paid for
     `op_id` on `create` and `update`. */
  {
    name: 'meet',
    title: 'Note a person',
    /* WHEN TO CALL IT IS THE INSTRUCTIONS' LINE AGAIN, "meet everyone you work with or are told about", and the
       description says what a call does with what it is given: a key (an address, a handle, a bank payee, a domain)
       matches or adds, and a name alone is only noted, because the record never makes a person out of a name.
      `kind`, `org`, `domain`, `role` and `keys` are the contract's input, paid for out of the
       description's examples and `handle`'s sentence, which `keys` now says for every kind of key. */
    /* AND WHERE IS SAID HONESTLY, because the record believes it accordingly (`kernel/src/people.ts` `trustOf`): what an
       agent read in mail, a commit or on the web is text anybody could have written, so it never folds two people into
       one on its own, and an agent's own run, `session in <repo>`, is what the record does believe. An agent that wrote
       its own run for what it read in a mail would be lending the mail its trust. */
    description:
      'A person or organisation; a name alone is only noted. Say where honestly: mail, commits and the web are not believed alone; your run is session in <repo>.',
    input: obj(
      {
        name: { type: 'string' },
        kind: { enum: ['person', 'organisation'] },
        email: str('Only as seen.'),
        handle: { type: 'string' },
        keys: { type: 'array', items: { type: 'string' } },
        org: str('Their employer.'),
        domain: str('Like kiln.example.'),
        role: { type: 'string' },
        where: { type: 'string' },
      },
      ['where'],
    ),
    writes: true,
    idempotent: true,
  },
  {
    name: 'triage',
    title: 'File what arrived',
    /* THE DESCRIPTION IS THE CONTRACT'S, WORD FOR WORD, and the site's list of tools
       reads `TOOLS` rather than a copy. Who may call it is not said here: the record refuses every token without the
       `inbox` reach in one sentence that names what it lacks, which teaches better than a clause every turn pays for.
       `ignore` says nothing beside its name, because "or set it aside" in the description already has.
       AND ITS ARGUMENTS SAY LESS. The seven are the record's, and the two that only go with `back` and the note that only
       goes with `register` are named and left to the record's sentence, which says when each is taken. */
    description: 'File an inbox arrival as an item, or set aside.',
    input: obj(
      {
        arrival: str('Its id in braindog:inbox.'),
        register: { type: 'string' },
        /* "OMIT TO TITLE IT FROM THE ARRIVAL" WENT, for `instructions`: the record titles it so, and says it. */
        fields: { type: 'object' },
        ignore: { type: 'boolean' },
        note: { type: 'string' },
        back: { type: 'boolean' },
        version: { type: 'integer' },
      },
      ['arrival'],
    ),
    writes: true,
    idempotent: true,
  },
  {
    name: 'act',
    title: 'Do anything',
    /* EVERYTHING ELSE THE APP DOES, BY THE CALL IT MAKES (the owner's ask of 1 Nov, `act.ts`): one tool and the list of
       calls as a resource, so the list pays for one tool. It took `undo`'s place, and `undo` is folded into it: its
       receipt's batch is `act undoOwn`. Destructive in the spec's sense, as `undo` was: a call may delete. Who may make
       which call is the record's to say, with the caller's own grant, so nothing here widens what an agent reaches. */
    /* AND THE ADD-ON STORE AND AN ADD-ON OF ITS OWN (`addons`, `addon`, `addonNew`, `addonCheck`, addons market plan of
       3 Nov): an agent asked for what BrainDog does not do reads here that it may build it. Paid for by `{batch}`, which
       every receipt says whole in the call that undoes it. */
    description: 'Any app call, add-ons too; "calls" lists. Undo: undoOwn.',
    input: obj({ call: { type: 'string' }, args: { type: 'object' } }, ['call']),
    writes: true,
    destructive: true,
  },
];

/**
 * The last day a folded tool answers by its old name: sixty days after it was folded (12a).
 */
export const FOLDED_UNTIL = '2026-12-20';

/**
 * TOOLS FOLDED INTO OTHERS, NEVER LISTED AND STILL CALLABLE UNTIL `FOLDED_UNTIL` (agents and MCP plan §6.1, 12a): a
 * session that cached the older list keeps working, and its answer says where the call lives now. Folding them paid for
 * `instructions` and the new arguments, so the list's ceiling stayed at 2,760 (`budget.test.ts`).
 */
export const FOLDED: readonly (Tool & { into: string })[] = [
  {
    name: 'undo',
    title: 'Undo a change',
    description: 'Put back your own write, by its receipt\'s batch.',
    input: obj({ batch: { type: 'string' }, dry: { type: 'boolean' } }, ['batch']),
    writes: true,
    destructive: true,
    idempotent: true,
    into: 'act {call: "undoOwn", args: {batch}}',
  },
  {
    name: 'schema',
    title: 'See the fields',
    description: 'One register\'s fields and types.',
    input: obj({ register: { type: 'string' } }, ['register']),
    writes: false,
    into: 'record_index {register}',
  },
  {
    name: 'history',
    title: 'See its history',
    description: 'Every write to one entry, with who and when.',
    input: obj({ spoken: str('As get takes it.') }, ['spoken']),
    writes: false,
    into: 'get {spoken, history: true}',
  },
];

/** A tool by its name, listed or folded: what `answer`, `strayIn` and `rpc.ts` read a call's arguments against. */
export const toolNamed = (name: string): Tool | undefined => TOOLS.find((t) => t.name === name) ?? FOLDED.find((t) => t.name === name);

/** The arguments a tool lists, by name. */
export const takesOf = (name: string): string[] => Object.keys((toolNamed(name)?.input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {});

export { pendingOf, type Pending };

/** The most merges `get` and `meet` follow from a folded row to the one kept. */
const MERGE_HOPS = 4;

/** The fields of a person or an organisation that say who they are with, read in this order for the answer to `meet`. */
const WITH_FIELDS: readonly string[] = ['org', 'organisation', 'projects', 'project', 'things'];

/** A key's kind as a person says it: `email:` is an email, `bank:` a bank payee. */
const KEY_WORDS: Readonly<Record<string, string>> = {
  email: 'email',
  github: 'GitHub handle',
  discord: 'Discord handle',
  slack: 'Slack handle',
  phone: 'phone number',
  bank: 'bank payee',
  domain: 'domain',
  remote: 'repository',
  folder: 'folder',
};

/**
 * How `meet` matched who it met, in words, from what the record answered and what the call sent: `email`, `GitHub
 * handle`, `name and address or organisation` for the record's strong rule, or `null` where it matched nobody.
 *
 * THE KEY ITSELF IS NEVER SAID, only its kind: an address is the person's, and the answer is read out to somebody else.
 */
export function matchedHow(raw: Record<string, unknown>, args: Args): string | null {
  if (raw.created === true || raw.mention === true) return null;
  /* THE KERNEL'S STRONG RULE (`strong` in people.ts) is one full name plus a shared address, login or organisation, so
     "name and address" alone was untrue of a merge made on the organisation. */
  if (raw.matched_by === 'strong') return 'name and address or organisation';
  if (raw.matched_by === 'none') return null;
  const kindOf = (key: unknown): string | null => {
    const kind = typeof key === 'string' ? /^([a-z]+):/u.exec(key.trim())?.[1] : undefined;
    return kind === undefined ? null : (KEY_WORDS[kind] ?? 'key');
  };
  const sent = Array.isArray(args.keys) ? args.keys : [];
  return (
    kindOf(raw.key) ??
    (typeof args.email === 'string' && args.email.trim() !== '' ? 'email' : null) ??
    (typeof args.handle === 'string' && args.handle.trim() !== '' ? (kindOf(args.handle) ?? 'handle') : null) ??
    kindOf(sent[0]) ??
    (raw.matched_by === 'key' ? 'key' : null)
  );
}

/** `tasks#41`, the way a person says a row. */
const QUALIFIED = /^([a-z][a-z0-9_]{0,31})#([1-9][0-9]*)$/;
/** `S42`, `LN7`: a register's own prefix and number. The record knows which register owns a prefix. */
const PREFIXED = /^[A-Z]{1,4}[1-9][0-9]*$/;

/** A row's own id, the ULID a ref field holds. The record reads one as it reads a spoken id. */
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** An attachment as `get` reads it: its id, and where in its words to start (`<id>@12000`), as its last answer said. */
const FILE_AT = /^([0-9A-HJKMNP-TV-Z]{26})(?:@([0-9]{1,9}))?$/;
/** A note that is a file's name, which keeps `log`'s page as a file: words, a dot and a text ending. */
const sizeSaid = (n: number): string => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${Math.round(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`);
const FILE_NAME = /^[^\s/\\][^/\\]{0,190}\.(?:html?|md|markdown|txt|csv|tsv|json|xml|svg)$/iu;

const parse = (spoken: unknown): { register: string; seq: number } | null => {
  const m = typeof spoken === 'string' ? QUALIFIED.exec(spoken.trim()) : null;
  return m ? { register: m[1]!, seq: Number(m[2]) } : null;
};

const ROW_OR_ID = 'Name an item by list and number, like tasks#41, or its id, like S42.';

/**
 * A name nothing is called, said first, and what a name finds: the description promises "a name", and the sentence
 * opened on "Name an item by list and number" as though names were not taken (audit 10k, AK21).
 */
const notNamed = (said: string): string =>
  `Nothing you can read is called ${clip(said, 60)}. A name finds an item in any list when it is the item's whole title, or the one item search finds for it; search finds it by its words, or name it as tasks#41.`;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The pages `boot` lists, when it lists them: a host older than its shell, and a stub, answer none. */
const pagesIn = (boot: unknown): { slug: string; title: string }[] =>
  isObject(boot) && Array.isArray(boot.pages)
    ? boot.pages.filter((p): p is { slug: string; title: string } => isObject(p) && typeof p.slug === 'string' && typeof p.title === 'string')
    : [];

/** A row as the record answers it, before it is made compact. */
type Entry = { id: string; register: string; seq: number | null; version: number; state?: string | null; fields: Record<string, unknown> };
const isEntry = (x: unknown): x is Entry =>
  isObject(x) && typeof x.id === 'string' && typeof x.register === 'string' && typeof x.version === 'number' && isObject(x.fields);

/**
 * A row as an agent reads it: its spoken id, its version, its state and its fields.
 *
 * THE SPOKEN ID IS THE ONE THING AN AGENT NEEDS AND THE RECORD'S ROW DID NOT SAY. It carried `register`
 * and `seq` apart, and the id, `created_at` and `deleted_at` beside them, so every row cost a hundred
 * bytes of what no tool takes back, and the address every tool does take had to be put together by the
 * model. `register#number` is accepted by every tool, for every register, prefixed or not.
 */
export function compact(row: Entry, prefix = ''): Record<string, unknown> {
  const extra = row as Entry & { updated_at?: unknown; deleted_at?: unknown };
  return {
    spoken: row.seq === null ? row.id : prefix ? `${prefix}${String(row.seq)}` : `${row.register}#${String(row.seq)}`,
    version: row.version,
    ...(row.state === null || row.state === undefined ? {} : { state: row.state }),
    ...(typeof extra.updated_at === 'string' ? { updated_at: extra.updated_at } : {}),
    ...(typeof extra.deleted_at === 'string' ? { deleted_at: extra.deleted_at } : {}),
    fields: row.fields,
  };
}

/** The rows `list` answers when the call names no limit and the list holds more than `LIST_WHOLE`. */
const LIST_PAGE = 20;
/** The most rows a list may hold and still be answered whole when the call names no limit: a portfolio is one read. */
const LIST_WHOLE = 60;
/** The characters of one text a `list` row carries before it is cut, unless the call names its field in `fields`. */
const CLIP = 280;
/** The longest note `log` takes, the ledger's own ceiling (`log` in the record). */
const NOTE_MOST = 280;
/** The longest note `log` takes in one call, kept as consecutive notes of `NOTE_MOST` each: a run's summary fits. */
const NOTE_LONG = NOTE_MOST * 5;

/**
 * A long note as the notes it is kept as, each at most `NOTE_MOST`, cut between sentences where it can and between words
 * where a sentence is longer than one note, never inside a word that fits.
 */
export function notesOf(note: string): string[] {
  const out: string[] = [];
  let at = '';
  const words = (text: string): void => {
    for (const word of text.split(/\s+/u)) {
      const piece = word.length > NOTE_MOST ? word.match(new RegExp(`.{1,${NOTE_MOST}}`, 'gu')) ?? [] : [word];
      for (const w of piece) {
        if (at !== '' && at.length + 1 + w.length > NOTE_MOST) {
          out.push(at);
          at = '';
        }
        at = at === '' ? w : `${at} ${w}`;
      }
    }
  };
  for (const sentence of note.split(/(?<=[.!?])\s+/u)) {
    if (at !== '' && at.length + 1 + sentence.length <= NOTE_MOST) at = `${at} ${sentence}`;
    else if (sentence.length <= NOTE_MOST) {
      if (at !== '') out.push(at);
      at = sentence;
    } else words(sentence);
  }
  if (at !== '') out.push(at);
  return out;
}

/**
 * A compact row as `list` answers it: what an agent reads to choose a row, and not the whole of each one.
 *
 * MEASURED ON THE SEED BEFORE THIS, by 44 §5.8's estimator over the JSON-RPC answer as a transport sends it: the 27
 * tasks cost 3,018 tokens and 38 obligations 5,290, against the 2,000 that 10 §4 set for a page. Four things went, each
 * for what it cost and what it said:
 * - `updated_at`, about 25 tokens a row and the largest part. The page is already newest first, `get` still answers
 *   it, and `activity` is where an agent asks what changed and when.
 * - `state` beside the fields, when a field holds the same value. The record fills the one from the other, so it
 *   was the same word twice on every row of every register that has a state.
 * - an empty field, as `spoke` drops one from a log line. An absent field reads as empty.
 * - a text past 280 characters, cut there, with `clipped: true` on the row so the agent knows it has less than the
 *   whole. A project's write-up is thousands of characters and one row of it outweighed a page of tasks. A field the
 *   call names in `fields` comes whole, and so does a text the schema does not call text or document, such as a URL.
 *
 * `version` STAYS, because the next `update` needs it, and so does `deleted_at` when a row has one.
 *
 * `texts` is the register's text and document fields, from its schema, or `undefined` where the schema could not be
 * read; then any long string is cut, because the row still says so and `get` still answers it whole.
 */
const listed = (row: Record<string, unknown>, whole: ReadonlySet<string>, texts: ReadonlySet<string> | undefined): Record<string, unknown> => {
  const fields: Record<string, unknown> = {};
  let clipped = false;
  for (const [id, value] of Object.entries(isObject(row.fields) ? row.fields : {})) {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    /* COUNTED IN CODE POINTS, so a cut never splits a character in two and an emoji is one character of the 280. */
    const points = typeof value === 'string' && value.length > CLIP && !whole.has(id) && (texts?.has(id) ?? true) ? Array.from(value) : [];
    if (points.length > CLIP) {
      fields[id] = points.slice(0, CLIP).join('');
      clipped = true;
    } else fields[id] = value;
  }
  const state = row.state;
  return {
    spoken: row.spoken,
    version: row.version,
    ...(typeof state === 'string' && !Object.values(fields).includes(state) ? { state } : {}),
    ...(typeof row.deleted_at === 'string' ? { deleted_at: row.deleted_at } : {}),
    fields,
    ...(clipped ? { clipped: true } : {}),
  };
};

/** A register's own prefix for its rows, such as `LN` or `S`, or `''` where it has none. */
type PrefixOf = (register: string) => string;
const unprefixed: PrefixOf = () => '';

/**
 * One line of the log, addressed the way a row is.
 *
 * THE SAME FAULT `compact` WAS WRITTEN FOR. A line carried `register` and `seq` apart, so an agent
 * reading "something changed on notes, 1" had to assemble `NO1` itself before it could call `get`.
 * Here the two become the one address every tool takes, with the register's own prefix.
 *
 * A LINE ABOUT NO ROW KEEPS ITS `target`. A declaration installed, a pack enabled and a proposal
 * decided are all in this log with `register` and `seq` both null, and `target` is the only thing
 * that says which one it was. Where there IS a row, `target` is `entry:<id>`, the same row the
 * address above names, so it goes with `target_kind`.
 *
 * AND AN EMPTY FIELD GOES, as `governance` drops one from a list for the same reason. `field`,
 * `from`, `to`, `note` and `batch` are null on most lines: one create measured 339 bytes as the
 * record answers it and 211 as this relays it, which `activity.test.ts` re-measures. The default
 * page is fifty lines, so it is that difference fifty times.
 *
 * `id` STAYS, because it is the EVENT's id and not the row's, and `rowid` stays because it is where
 * a page below this one would start.
 */
const spoke = (line: Record<string, unknown>, prefixOf: PrefixOf): Record<string, unknown> => {
  const { register, seq } = line;
  const named = typeof register === 'string' && typeof seq === 'number';
  const prefix = named ? prefixOf(register) : '';
  const out: Record<string, unknown> = named
    ? { spoken: prefix ? `${prefix}${String(seq)}` : `${register}#${String(seq)}` }
    : {};
  for (const [key, value] of Object.entries(line)) {
    if (key === 'register' || key === 'seq') continue;
    if (named && (key === 'target' || key === 'target_kind')) continue;
    if (value === null) continue;
    /* A TITLE THAT IS THE NOTE SAID TWICE GOES: a question's line carries the question as its title and as its note,
       and on the owner's log that was the longest text on a line, twice. */
    if (key === 'title' && typeof value === 'string' && value === line.note) continue;
    out[key] = value;
  }
  return out;
};

/** A row, a page of rows, or a page of log lines, made compact; anything else as it came. */
const compacted = (value: unknown, prefixOf: PrefixOf = unprefixed): unknown => {
  if (isEntry(value)) return compact(value, prefixOf(value.register));
  if (isObject(value) && Array.isArray(value.rows))
    return { ...value, rows: value.rows.map((r) => (isEntry(r) ? compact(r, prefixOf(r.register)) : r)) };
  if (isObject(value) && Array.isArray(value.events))
    return { ...value, events: value.events.map((e) => (isObject(e) ? spoke(e, prefixOf) : e)) };
  return value;
};

/** The batch a write's answer carries, on the answer or on the row it made, which a receipt hands to `undo`. */
const batchIn = (v: unknown): string | undefined => {
  if (!isObject(v)) return undefined;
  for (const x of [v, v.row, v.entry]) if (isObject(x) && typeof x.batch === 'string' && x.batch !== '') return x.batch;
  return undefined;
};

const badSpoken = (fix: string): Result<never> => ({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix, at: 'spoken' } });

/**
 * A register as `schema` answers it, held to the keys a brief line reads: its name, title, state, card fields and
 * fields. `undefined` for an answer that is not one.
 */
const declOf = (register: string, value: unknown): Decl | undefined => {
  if (!isObject(value)) return undefined;
  const fields = (Array.isArray(value.fields) ? value.fields : []).filter(
    (f): f is Field => isObject(f) && typeof f.id === 'string' && typeof f.type === 'string',
  );
  return { ...(value as Omit<Decl, 'id' | 'fields'>), id: typeof value.id === 'string' ? value.id : register, fields };
};

/** The rows `list` answers at most, whatever `limit` asked: this tool's ceiling, where the record's own is 500. */
const LIST_MOST = 100;
/** The lines `activity` answers when the call names no limit, and at most. The record's own are 50 and 200. */
const ACTIVITY_PAGE = 20;
const ACTIVITY_MOST = 100;
/** The questions or decisions one page of `governance` answers when the call names no limit, and at most. */
const GOVERNANCE_PAGE = 20;
const GOVERNANCE_MOST = 100;

/**
 * The most characters one answer carries, its text and its JSON each: about ten thousand tokens at four characters a
 * token. Claude Code holds a tool result to 25,000 tokens by default and claude.ai to about 150,000 characters, and the
 * agent research measured retrieval falling as answers grew past ten thousand.
 * Past it a page is read again with fewer rows, a page resource is one line a block, and a text is cut
 * at a line with a sentence saying so.
 */
export const ANSWER_MOST = 40_000;

/**
 * The longest run of `rows` from the first whose JSON fits in one answer (`ANSWER_MOST`), and never fewer than one: a
 * page cut where it stands, for a read whose cursor is its own last row, so it is asked of the record once.
 */
export function fitRows<T>(rows: readonly T[]): T[] {
  /* THE ANSWER AROUND THEM, its `rows` key, a cursor and `matched`, comes inside the same budget. */
  let size = 64;
  let kept = 0;
  for (const row of rows) {
    size += (JSON.stringify(row) ?? '').length + 1;
    if (size > ANSWER_MOST && kept >= 1) break;
    kept += 1;
  }
  return rows.slice(0, kept);
}

/**
 * The page `braindog:handoffs` draws: one table over the steps runs left, newest first, with the app that left each and
 * when. `run` rides on every row as the handle the app's name links by, and is not a column a person reads alone.
 */
const HANDOFFS_PAGE = {
  page: 'handoffs',
  title: 'Next steps left',
  blocks: [
    {
      kind: 'table',
      source: 'handoffs.open',
      heading: 'Left by a run and not taken yet',
      columns: [{ field: 'agent' }, { field: 'next' }, { field: 'left_at' }, { field: 'mark' }],
    },
  ],
} as const;

/** The tools that became resources, by their old name: where a call to one is read now. */
const NOW_READ_AT: Readonly<Record<string, string>> = { understand: 'braindog:understand' };
/**
 * The reads that were never tools, by the name an agent would call: where each is read. `about` takes a name and reads
 * like a tool, and a seventeenth could not be paid for out of the list every turn carries (`budget.test.ts`).
 */
const READ_NOT_CALLED: Readonly<Record<string, string>> = { about: 'braindog:about/<name>' };

/** The line a write sent again with a used `op_id` ends with: the first answer stands, and nothing new was written. */
export const REPLAYED = 'Already saved by this operation.';

/** The kernel's own register of an agent's runs, whose rows are `S<n>`. */
const SESSION = 'session';
/** A run as a person says it: `S42`. */
const RUN_HANDLE = /^S[1-9][0-9]*$/u;
/** The page a use case declares as its Home, `home-<use case>`, which Home draws ahead of the record's own `home`. */
const HOME_OF_A_USE_CASE = /^home-[a-z0-9][a-z0-9-]*$/u;

/**
 * A tool or resource whose record method has not arrived yet.
 *
 * `NOT_IN_THIS_BUILD` IS THE RECORD'S OWN WORD FOR THIS, and the sentence says what to do instead,
 * so an agent carries on rather than retrying a call that cannot work today.
 */
const unbuilt = (name: string, instead: string): Result<never> => ({
  ok: false,
  refusal: { code: 'NOT_IN_THIS_BUILD', fix: `This BrainDog does not answer ${name} yet. ${instead}` },
});

/** The most lessons one read of the record's `learnings` answers, which is the most its `limit` takes (`methods/learnings.ts`). */
const LEARNED_MOST = 200;

/** The most hits one search answers, whatever `limit` asked: the clamp in the kernel's `fts.ts` search. */
const SEARCH_MOST = 100;

const nowhere = (uri: string): Result<never> => ({
  ok: false,
  refusal: { code: 'ROUTE_UNKNOWN', fix: `There is nothing at ${uri}. Read braindog:boot for what this BrainDog holds.`, at: 'uri' },
});

/**
 * An address split rather than resolved.
 *
 * `braindog:schema/../../x` is a path a stranger can write, and the part after the first slash is an
 * argument to a method rather than a path on a disk, so it is split, never resolved.
 */
const split = (uri: string) => {
  const path = uri.startsWith('braindog:') ? uri.slice('braindog:'.length) : '';
  const cut = path.indexOf('/');
  return { head: cut < 0 ? path : path.slice(0, cut), rest: cut < 0 ? '' : path.slice(cut + 1) };
};

/* The argument grammar. `schema/../../x` reaching the method would be refused there too, but by a
   sentence about a register nobody has, which reads like a fact about the record. */
const NAMED = /^[a-z][a-z0-9_-]{0,63}$/;
/** An arrival's id, a ULID in capitals, which no state's name can be: `braindog:inbox/<id>` reads that arrival whole. */
const ARRIVAL = /^[0-9A-HJKMNP-TV-Z]{26}$/u;
/** The most of one state `braindog:inbox/<state>` reads, the hundred the digest keeps of each. */
const INBOX_STATE_READ = 100;
/**
 * A figure as `get` takes it: a name, and a parameter after the first colon, which is where the record splits it.
 * The parameter is anything, because one is a project's path (`C:\Repos`) and the record reads it as said.
 */
const FIGURE = /^[a-z][a-z0-9_-]{0,63}(?::[\s\S]+)?$/;
/** A skill's folder name, the grammar the command line writes files under. */
const SKILL = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** How long each kind of resource may be held, by the first segment of its address. */
const TTL = new Map([
  ['whoami', 0],
  ['context', 0],
  ['understand', MINUTE],
  /* NEVER HELD, AS `context` IS NOT: a step another run left a minute ago is the one a new session should take. */
  ['handoffs', 0],
  /* NEVER HELD EITHER: a step dropped or a question withdrawn a moment ago is not stale any more. */
  ['stale', 0],
  /* HELD A MINUTE, as the briefing is: a lesson stands for months, and the session that records one is told its handle. */
  ['learnings', MINUTE],
  ['briefing', MINUTE],
  ['exceptions', MINUTE],
  ['about', MINUTE],
  ['sessions', 0],
  ['boot', MINUTE],
  ['digest', MINUTE],
  ['decisions', MINUTE],
  ['actions', MINUTE],
  ['automations', MINUTE],
  ['automation', MINUTE],
  ['arrangement', MINUTE],
  ['declaration', MINUTE],
  ['grammar', HOUR],
  ['design', HOUR],
  ['page', MINUTE],
  ['metric', MINUTE],
  ['schema', HOUR],
  ['skill', HOUR],
]);
export const ttlOf = (uri: string): number => TTL.get(split(uri).head) ?? 0;

const resource = (path: string, description: string): Resource => ({
  uri: `braindog:${path}`,
  name: path,
  description,
  ttlMs: ttlOf(`braindog:${path}`),
});

/**
 * What is on offer, twelve at a time, and searched by a word.
 *
 * THE OFFER WAS EVERY ADD-ON THE HOST HOLDS, and once the whole catalogue is on offer that is more than an arrangement
 * read in a turn can carry. `braindog:arrangement` keeps the first twelve and says how many more there are;
 * `braindog:arrangement/offer/<word>` is the twelve whose id, title, line or modules hold the word, and a number after
 * it, or in place of it, is the next twelve. The record answers the whole offer and this package pages it, so the
 * record's own arrangement read is unchanged for every other surface.
 */
export const OFFER_PAGE = 12;
type Offered = { id: string; usecase?: string; summary?: string; modules?: readonly string[] };
const offeredHas = (o: Offered, word: string): boolean =>
  [o.id, o.usecase ?? '', o.summary ?? '', ...(o.modules ?? [])].some((said) => said.toLowerCase().includes(word));

const OFFER_WORD = /^[a-z0-9][a-z0-9-]{0,31}$/u;
const OFFER_PAGE_NUMBER = /^[1-9][0-9]{0,2}$/u;
const offerAsked = (rest: string): { word: string; page: number } | null => {
  const [head, first, second, ...extra] = rest.split('/');
  if (head !== 'offer' || extra.length > 0) return null;
  if (first === undefined) return { word: '', page: 1 };
  if (second === undefined) return OFFER_PAGE_NUMBER.test(first) ? { word: '', page: Number(first) } : OFFER_WORD.test(first) ? { word: first, page: 1 } : null;
  return OFFER_WORD.test(first) && OFFER_PAGE_NUMBER.test(second) ? { word: first, page: Number(second) } : null;
};

export function offerPaged(arrangement: unknown, word: string, page: number): Record<string, unknown> {
  const whole = arrangement as { offer?: readonly Offered[] } & Record<string, unknown>;
  const all = Array.isArray(whole.offer) ? whole.offer : [];
  const found = word ? all.filter((o) => offeredHas(o, word)) : all;
  const shown = found.slice((page - 1) * OFFER_PAGE, page * OFFER_PAGE);
  const after = found.length - page * OFFER_PAGE;
  const next = after > 0 ? `braindog:arrangement/offer/${word ? `${word}/` : ''}${page + 1}` : null;
  const more =
    after > 0 ? `${after} more on offer${word ? ` with ${word}` : ''}: read ${next}, or braindog:arrangement/offer/<word> to search them.` : null;
  if (!word && page === 1) return { ...whole, offer: shown, ...(more ? { offer_more: more } : {}) };
  return { offer: shown, ...(word ? { word } : {}), page, of: found.length, ...(more ? { offer_more: more } : {}) };
}

/** The resources with no parameter. Each is asked before it is listed, like everything else. */
const FIXED: readonly Resource[] = [
  resource('whoami', 'Who you are here, and which verbs you reach.'),
  resource('boot', 'What this BrainDog holds, and how many rows are in each register.'),
  resource('context', 'The briefing for where you are: your session, your project, and what applies here.'),
  resource('understand', 'What BrainDog would link and ask next, in names. Read before meet.'),
  resource('handoffs', 'The next steps runs left and nobody has taken, newest first, each with the app that left it and its project.'),
  resource('briefing', 'What matters here now: what is late, what is due, what stopped and what waits, a line each.'),
  resource('widgets', 'Every widget Today can hold, by name, and which Today shows. Suggest one with propose, body_kind widget, body {said} or {block,size}, question your reason: it lands on Today as a draft.'),
  resource('exceptions', 'What stopped: what went quiet or has not run, the longest first, each in a sentence.'),
  resource('stale', 'What went stale where you stand, each with the one call that clears it.'),
  /* THE DESCRIPTION IS THE TEST FOR RECORDING ONE (`docs/32-PARITY.md`), said where a session looks before it
     adds to them. All four hold, or it is not a lesson. */
  resource(
    'learnings',
    'The lessons that stand here, in the order to read them. Record one only when it changes what a session does, it generalises, a session without it would get it wrong, not merely slower, and it has no other home.',
  ),
  resource('about', 'What one thing is, by its name: read about/<name>, with a space as %20.'),
  resource(
    'sessions/live',
    'Who else is working now, on what, and in which repository. Two sessions in one working tree overwrite each other. Coordinate or stop.',
  ),
  resource('digest/today', 'What the digest would say if it went now.'),
  resource('decisions', 'What has been proposed and not yet answered.'),
  resource(
    'inbox',
    'Every state of the inbox in one answer: how many in each, then each state newest first, what waits first. inbox/<state> reads one state, inbox/<id> one arrival whole.',
  ),
  resource('inbox/patterns', 'What each pattern did with the last 14 days of messages: what it filed, what it skipped and why, what waits, and how many none of them read.'),
  resource('actions', 'Every scheduled action: what it calls, how often, whether it is paused and why, and this month so far. Keys by name only.'),
  resource('automations', 'Every automation: what starts it, when it runs next, and how its runs went this month.'),
  resource('arrangement', 'How this BrainDog is arranged: its packs, what else is on offer, its voice and settings, its pages, and what waits.'),
  resource('design', 'The design book: the house look (Look B) first, then every kind of block with an example, the colours, type and spacing, and the layout rules. Read before designing a page, a card, a widget or a visual, and follow its look rules.'),
  resource('grammar/page', 'What a page declaration may contain, with one that installs.'),
  resource('grammar/register', "What a list declaration may contain: its keys, each field's keys, and one that installs."),
  resource('grammar/metric', 'What a figure declaration may contain, with one that installs.'),
  resource('grammar/proposals', 'The bodies that change what this BrainDog is: pack, settings and arrange.'),
  resource('grammar/ingest', 'What a door or a scheduled action may contain, with one of each.'),
  /* THE LONG FORM, ONE KIND WHOLE, IS braindog:grammar/kind/<name> AND IS NO TEMPLATE: `TEMPLATES` is the site's /agents
     list (`apps/site/test/content.test.ts`), and this description and the short form's own last line both name it. */
  resource('grammar/kinds', 'Every kind of block a page draws, a line each, and what to reach for. grammar/kind/<name> says one whole.'),
  resource('grammar/script', 'What a script declaration may contain, what its ctx can reach, its limits, and two that install.'),
  resource('grammar/automations', 'What an automation may say: its triggers, its steps, its limits, what does not run yet, and two that install.'),
  /* THE ADD-ON FILE WHOLE (`packages/record/src/grammar.ts` `PACK`): what an agent reads before it builds what BrainDog lacks. */
  resource('grammar/pack', 'An add-on file whole: its manifest, its parts, what each asks the person, the loop through act (addons, addonNew, addonCheck, installPack), and one that installs.'),
  resource('calls', 'Every call act makes, a line each: what the app does, by name, and how to make one.'),
];

/**
 * The fixed addresses the record's `offered` decides, as `FIXED_ADDRESSES` in `packages/record/src/methods/offered.ts`
 * names them (`test/resources-offered.test.ts` holds the two lists together). An address of `FIXED` above that is not
 * here is read before it is listed, as it always was: who may read it is still the record's to say, and it draws no page.
 */
export const OFFERED_DECIDES: ReadonlySet<string> = new Set([
  'whoami', 'boot', 'context', 'understand', 'handoffs', 'briefing', 'widgets', 'exceptions', 'stale', 'learnings', 'sessions/live', 'digest/today', 'decisions', 'inbox', 'inbox/patterns',
  'actions', 'automations', 'arrangement', 'grammar/page', 'grammar/register', 'grammar/metric', 'grammar/proposals',
  'grammar/ingest', 'grammar/kinds', 'grammar/script', 'grammar/automations', 'grammar/pack',
]);

/**
 * The surface method each decided address is read through, where it is one a host may not have. WHAT A HOST CANNOT
 * SERVE IS THE DOOR'S TO DROP (`offered.ts`): the record says who may read an address, and an address whose method
 * this surface lacks is answered `NOT_IN_THIS_BUILD` by `read`, so it is not listed, as it is not today.
 */
const SERVED_BY: Readonly<Record<string, keyof McpSurface<unknown>>> = {
  context: 'context',
  understand: 'understandPlan',
  handoffs: 'previewPage',
  briefing: 'briefing',
  widgets: 'widgetGallery',
  exceptions: 'exceptions',
  stale: 'stale',
  learnings: 'learnings',
  'sessions/live': 'sessionsLive',
  inbox: 'inbox',
  'inbox/patterns': 'inboxPatterns',
  actions: 'actions',
  automations: 'automations',
  arrangement: 'arrangement',
  'grammar/page': 'arrangement',
  'grammar/register': 'arrangement',
  'grammar/metric': 'arrangement',
  'grammar/proposals': 'arrangement',
  'grammar/ingest': 'arrangement',
  'grammar/kinds': 'arrangement',
  'grammar/pack': 'arrangement',
};

/** What `offered` answered, held to its shape, because over the command line it came off the wire. `null` is no answer to use. */
type OfferedNow = {
  fixed: Set<string>;
  lists: { id: string; name: string }[];
  pages: { slug: string; title: string }[];
  figures: { id: string; name: string; param: boolean }[];
  skills: { name: string; when: string | null }[];
};
function offeredNow(value: unknown): OfferedNow | null {
  if (!isObject(value)) return null;
  const { fixed, lists, pages, figures, skills } = value;
  if (![fixed, lists, pages, figures, skills].every(Array.isArray)) return null;
  const text = (x: unknown): x is string => typeof x === 'string';
  return {
    fixed: new Set((fixed as unknown[]).filter(text)),
    lists: (lists as unknown[]).flatMap((l) => (isObject(l) && text(l.id) && text(l.name) ? [{ id: l.id, name: l.name }] : [])),
    pages: (pages as unknown[]).flatMap((p) => (isObject(p) && text(p.slug) && text(p.title) ? [{ slug: p.slug, title: p.title }] : [])),
    figures: (figures as unknown[]).flatMap((f) =>
      isObject(f) && text(f.id) ? [{ id: f.id, name: text(f.name) ? f.name : '', param: f.param === true }] : [],
    ),
    skills: (skills as unknown[]).flatMap((s) =>
      isObject(s) && text(s.name) ? [{ name: s.name, when: text(s.when) && s.when !== '' ? s.when : null }] : [],
    ),
  };
}

/** The addresses a client fills in itself. A template is a grammar, so it names nothing a caller cannot see. */
export const TEMPLATES = [
  { uriTemplate: 'braindog:schema/{register}', name: 'schema', description: 'The fields of one register.' },
  /* THE nth BLOCK IS SAID HERE AND NOT AS A TEMPLATE OF ITS OWN: the site's `/agents` lists every template this array
     holds, and `apps/site/test/content.test.ts` holds the two to each other, and a page too large for one answer hands
     over each block's address whole anyway. */
  {
    uriTemplate: 'braindog:page/{slug}',
    name: 'page',
    description:
      'One page, with every block run: rows and figures, never markup. page/home is the Home page. A page too large for one answer is one line a block, and page/{slug}/{n} reads block n whole.',
  },
  { uriTemplate: 'braindog:metric/{id}', name: 'metric', description: 'One figure, with its target and how it compares.' },
  { uriTemplate: 'braindog:skill/{name}', name: 'skill', description: 'The text of one skill, and when to reach for it.' },
  { uriTemplate: 'braindog:declaration/{slug}', name: 'declaration', description: 'One page as declared, to change and propose back.' },
  { uriTemplate: 'braindog:automation/{id}', name: 'automation', description: "One automation as declared, with its last ten runs and each step's outcome." },
  {
    uriTemplate: 'braindog:inbox/{state}',
    name: 'inbox',
    description:
      "The newest hundred in one state: untriaged, review, skipped, matched, proposed, ignored, or all. Skipped is where a wrong skip rule shows. An arrival's id in place of the state reads it whole.",
  },
] as const;

/**
 * What one answer has read so far, kept for that answer alone: whether it is said in words at all, the words of every
 * row it read by handle, and the one `boot` it asked for, so the tool and the words share a single read.
 *
 * PER ANSWER AND NEVER PER CALLER, for the reason `namesIn` gives below: a name kept past the answer is a name a
 * caller with less reach could be told next.
 */
type Turn = {
  text: boolean;
  titles: Map<string, string>;
  boot?: Promise<Result<unknown>>;
  /** The batch a write landed under, which its receipt hands to `undo`; or the question a `propose` filed, which `withdraw` takes back. */
  batch?: string | undefined;
  asks?: string;
};

/**
 * What a tool hands `answer`: the record's answer shaped as the full JSON, and how to say it.
 *
 * `say` IS CALLED ONCE THE ANSWER'S LOOK IS BUILT, from the reads the tool already made and, where `names` asks, one
 * `boot` for the people and one read of the runs the lines name. A tool with nobody to name asks neither.
 */
type Done = {
  result: Result<unknown>;
  say?: (look: Look) => string;
  names?: { people?: boolean; runs?: readonly string[] };
};

/**
 * One beat for one tool call the door admitted ("a real heartbeat"): the caller's run is heard from
 * now, so a client with no hook of its own reads Working through a long stretch of reads, not Quiet.
 *
 * NEVER WAITED ON, AND EVERY WAY IT CAN GO WRONG IS SWALLOWED, as `rpc.ts`'s marks are: a beat that throws, refuses,
 * rejects or never settles costs the tool's answer nothing. It sends nothing the call did not carry, only the caller's
 * own context, and the record finds the run from that or finds none. A surface without `beat` is not asked.
 */
function beatOn<C>(surface: McpSurface<C>, ctx: C): void {
  if (typeof surface.beat !== 'function') return;
  try {
    const p: unknown = surface.beat({}, ctx);
    /* ANY THENABLE, so a rejection from a surface built in another realm is caught too. */
    if (p !== null && typeof p === 'object' && typeof (p as { then?: unknown }).then === 'function') Promise.resolve(p).catch(() => undefined);
  } catch {
    /* A beat that throws is a beat not heard, and nothing more. */
  }
}

/** How long a run counts as working after it was last heard from, for `record_index`'s `live`: fifteen minutes. */
const WORKING_S = 15 * 60;

/**
 * Who is working, for `record_index`: how many runs were heard from in the last fifteen minutes, and the ones
 * in the caller's own tree by name with their handle beside it, "Claude Code". `null` when none is working.
 *
 * FROM `boot`'S `sessions`, WHICH ARE `sessionsLive`'S OWN RUNS held to the caller, `same_repo` worked out from the
 * caller's own hints (`sameTree`: the same machine and repository, never the caller's own run or its helpers). So the
 * index asks no method it did not already ask, and a caller who may not read the runs is handed none and told nothing.
 * A run that is idle or left a step for the next one is not working, whenever it was last heard from.
 */
function liveOf(sessions: unknown): { working: number; here: string[] } | null {
  if (!Array.isArray(sessions)) return null;
  const working = sessions.filter(
    (r): r is Record<string, unknown> =>
      isObject(r) && typeof r.age_s === 'number' && r.age_s <= WORKING_S && (r.presence === undefined || r.presence === 'working'),
  );
  if (working.length === 0) return null;
  const here = working
    .filter((r) => r.same_repo === true && typeof r.spoken === 'string')
    /* ON THE CALLER'S OWN MACHINE, so the machine's name would say nothing: the app and the handle. */
    .map((r) => `${runnerOf({ ...(isObject(r.fields) ? r.fields : {}), host: '' })} (${String(r.spoken)})`);
  return { working: working.length, here };
}

/**
 * Run one tool, list the resources, read one.
 *
 * The tool layer holds NO logic of its own beyond addressing and wording: every refusal a caller sees comes from
 * the record, with the sentence the record wrote. A second set of checks here would be a second set
 * to keep in step, and the one that drifted would be the one an agent reads. What this adds to a refusal is its
 * `try`, the corrected call, and only from what the refusal itself handed over.
 *
 * `origin` IS THE ADDRESS THE HOST SERVES THE APP AT, such as `https://brain.dog`, handed down by `handle`. It is read
 * for one thing, the `decide` link on a filed question, and left out it is no link at all.
 */
export function tools<C>(surface: McpSurface<C>, origin?: string) {
  /* KEPT FOR THE LIFE OF THESE TOOLS, which is one answer: `rpc.ts` is the one caller outside the tests, and it builds
     them for each message. A schema the caller may not read is not kept, and that register's rows are named
     `register#number`. */
  const prefixes = new Map<string, string>();
  /* AND ITS REF FIELDS, READ FROM THE SAME SCHEMA: whether each is a list of refs, and the register its `to` names.
     They move no more often than the prefix does, and they are what the naming pass below reads. */
  const refFields = new Map<string, Map<string, { many: boolean; to: string | null }>>();
  /* AND ITS TEXT AND DOCUMENT FIELDS, the ones a `list` row cuts at 280 characters, from the same read. */
  const textFields = new Map<string, Set<string>>();
  /* AND THE DECLARATION ITSELF, from the same read: the list's name, its title and state, the fields its card shows,
     which is everything a line of a brief answer reads about a list. No read is made for it alone. */
  const decls = new Map<string, Decl>();
  const learnPrefix = async (register: string, ctx: C): Promise<void> => {
    const schema = await surface.schema({ register }, ctx);
    if (!schema.ok) return;
    const said = isObject(schema.value) ? schema.value.seq_prefix : undefined;
    prefixes.set(register, typeof said === 'string' && /^[A-Z]{1,4}$/.test(said) ? said : '');
    const declared = isObject(schema.value) && Array.isArray(schema.value.fields) ? schema.value.fields : [];
    const refs = new Map<string, { many: boolean; to: string | null }>();
    for (const f of declared)
      if (isObject(f) && typeof f.id === 'string' && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')))
        refs.set(f.id, { many: f.type === 'list', to: typeof f.to === 'string' && f.to !== '' ? f.to : null });
    refFields.set(register, refs);
    textFields.set(
      register,
      new Set(declared.flatMap((f) => (isObject(f) && typeof f.id === 'string' && (f.type === 'text' || f.type === 'document') ? [f.id] : []))),
    );
    const decl = declOf(register, schema.value);
    if (decl) decls.set(register, decl);
  };
  const spokenOf = (register: string, seq: number): string => {
    const prefix = prefixes.get(register) ?? '';
    return prefix ? `${prefix}${String(seq)}` : `${register}#${String(seq)}`;
  };
  const addressOf = async (register: string, seq: number, ctx: C): Promise<string> => {
    if (!prefixes.has(register)) await learnPrefix(register, ctx);
    return spokenOf(register, seq);
  };
  const prefixOf: PrefixOf = (register) => prefixes.get(register) ?? '';

  /**
   * The row ids in an answer's ref fields, each as the spoken id `context` would say for the same row: `things#1`, `LN8`.
   *
   * MEASURED ON THE SEED BEFORE THIS: every task on Kiln answered `thing: "01M345FTM0..."`, which changes from run to
   * run, while `context` named the project `things#1`, so an agent matching a task to its project, or saying which
   * project a task was on, paid a `get` per id.
   *
   * ONE READ PER REGISTER THE REFS POINT INTO, NOT ONE PER ID. This asked `get` for each distinct id, one after another,
   * so an answer cost a request per ref: measured through `handle` on the seed with 120
   * learnings added, each superseding the one before, `list learnings` of 127 rows asked the surface 126 times, 123 of
   * them `get`. A ref field's declaration names its register in `to`, so every id an answer holds for that register goes
   * to it in `list` reads where `id` is in them, and the same answer asks six times: the `list`, the `schema` of
   * `learnings`, two reads of `learnings` and one of `things`, and the `schema` of `things`. `names-cache.test.ts`
   * holds it.
   *
   * IN READS OF AT MOST 64 IDS, BECAUSE THE DURABLE OBJECT BINDS AT MOST 100 PARAMETERS. `where` binds one per id, and
   * `list` three more of its own. Measured in workerd through Miniflare, a statement of 100 parameters ran and one of
   * 101 threw `too many SQL variables`, while `node:sqlite` takes tens of thousands. The first cut read 200 ids at a
   * time, which passed every test here and in production turned those 127 learnings, 119 ids in one read and
   * 122 parameters, into an internal error for the whole `list`: the answer was lost, not only its names. 64 is the
   * chunk `where` already slices `in` by (`packages/where/src/index.ts`), and it leaves the ceiling 33 to spare. It
   * also keeps the GET the command line sends (`packages/client/src/index.ts`) well short of the 16 KiB Node lets a
   * request's head be: 500 row ids made a 17,598-byte URL, measured, and 200 made 7,098.
   *
   * NOTHING IS KEPT PAST THE ANSWER. `rpc.ts` builds these tools for each message, and every read is asked with the
   * caller's own context, so a register the caller may not read, by its level on that register or by its ceiling, is
   * refused by the record and its ids stay ids, and a row deleted since the last message is read as it is now. An
   * earlier attempt kept names across messages keyed by what `whoami` said, which says nothing of
   * `ctx.levels`, so a token held to `append` on `things` could be told a project's name. With the reads batched, a
   * cache across messages would save at most the four calls above besides the `list`, which is not worth a key that
   * has to name every grant a token holds.
   *
   * AND THE WORDS OF EACH ROW READ COME BACK WITH ITS NAME, into the answer's `titles`, which is how a brief line says
   * `Kiln (things#1)` and not the handle alone, at no read of its own.
   *
   * A ROW THE CALLER CANNOT READ, OR ONE THAT IS GONE, KEEPS ITS ID: `list` leaves a deleted row out, as `get` answered
   * one `null`, measured on the seed. A ref whose declaration names no register is still asked by `get`, one id each.
   *
   * EACH READ IS A `register.read` OF THE LIST IT NAMES, AND THAT IS MEANT, and not the host's own. Both readers of the
   * signal ask whether a list was read at all in ninety days,
   * the kernel's `dormant` and Slash's untouched pack, and a list whose rows name the refs on an agent's pages is in use:
   * retiring it would turn every one of those names back into a row id. What these reads must not count as is a scan,
   * and `id` is the primary key, so the kernel's `observe` leaves a scan of any of its own columns out.
   */
  const NAMES_PER_READ = 64;
  /* THE LISTS, AND THE ROW IDS, ONE ANSWER'S SENTENCES ARE NAMED FROM: a read each, so a sentence naming many costs few. */
  const LISTS_NAMED = 4;
  const IDS_NAMED = 6;
  const namesIn = async (rows: Entry[], ctx: C, turn: Turn): Promise<Map<string, string>> => {
    const wanted = new Map<string | null, Set<string>>();
    for (const row of rows)
      for (const [id, { many, to }] of refFields.get(row.register) ?? []) {
        if (!Object.hasOwn(row.fields, id)) continue;
        const value = row.fields[id];
        for (const one of many ? (Array.isArray(value) ? value : []) : [value]) {
          if (typeof one !== 'string' || !ROW_ID.test(one)) continue;
          let ids = wanted.get(to);
          if (!ids) wanted.set(to, (ids = new Set()));
          ids.add(one);
        }
      }
    const names = new Map<string, string>();
    const said = (row: Entry, spoken: string) => {
      names.set(row.id, spoken);
      const words = titleOf(row.fields, decls.get(row.register));
      if (words) turn.titles.set(spoken, words);
    };
    /* EACH REGISTER'S PREFIX BEFORE ITS READS, so the reads of one register do not each ask its `schema`. A schema the
       caller may not read leaves no prefix, and the read of that register is refused the same way. */
    for (const to of wanted.keys()) if (to !== null && !prefixes.has(to)) await learnPrefix(to, ctx);
    const reads: Promise<void>[] = [];
    for (const [to, set] of wanted) {
      const ids = [...set];
      if (to === null)
        for (const id of ids)
          reads.push(
            surface.get({ spoken: id }, ctx).then(async (got) => {
              if (got.ok && isEntry(got.value) && got.value.seq !== null) said(got.value, await addressOf(got.value.register, got.value.seq, ctx));
            }),
          );
      else
        for (let at = 0; at < ids.length; at += NAMES_PER_READ) {
          const some = ids.slice(at, at + NAMES_PER_READ);
          reads.push(
            surface.list({ register: to, where: { field: 'id', in: some }, limit: some.length }, ctx).then((got) => {
              if (got.ok) for (const found of got.value.rows) if (isEntry(found) && found.seq !== null) said(found, spokenOf(found.register, found.seq));
            }),
          );
        }
    }
    await Promise.all(reads);
    return names;
  };
  const speakRefs = (row: Entry, names: Map<string, string>): Entry => {
    const refs = refFields.get(row.register);
    if (!refs || refs.size === 0) return row;
    const nameOf = (value: unknown): unknown => (typeof value === 'string' ? (names.get(value) ?? value) : value);
    const fields = { ...row.fields };
    for (const [id, { many }] of refs) {
      /* ONLY A FIELD THE ROW HAS. Writing `owner: undefined` onto a row that has no owner made the round trip refuse
         it, measured: "owner takes a row id or a spoken id", for a field the agent never sent. */
      if (!Object.hasOwn(fields, id)) continue;
      const value = fields[id];
      if (many && Array.isArray(value)) fields[id] = value.map(nameOf);
      else if (!many) fields[id] = nameOf(value);
    }
    return { ...row, fields };
  };

  /**
   * One row as every tool answers it: its register's prefix learnt, its refs named, compact, and its own words kept for
   * the line that says it.
   *
   * A ROW IS NAMED AS CONTEXT NAMES IT: `LN1` and `S3`, not `learnings#1` and `session#1`. An agent handed two names for
   * one row wrote the second into its notes, and the person reads the first. Both are still taken.
   */
  const entryOut = async (row: Entry, ctx: C, turn: Turn): Promise<Record<string, unknown>> => {
    if (!prefixes.has(row.register)) await learnPrefix(row.register, ctx);
    const out = compact(speakRefs(row, await namesIn([row], ctx, turn)), prefixOf(row.register));
    const words = titleOf(row.fields, decls.get(row.register));
    if (words) turn.titles.set(String(out.spoken), words);
    return out;
  };

  /**
   * The row kept for one that was merged into another, by following `merged_into` until a row is not merged: the row
   * itself when it never was, and the row first read beside it when it was.
   *
   * A FOLDED ROW IS STILL READ AS IT WAS. A merge left the fold behind with `merged_into` set, and `get` of its handle
   * answered the fold, so an agent holding `P9` from an older answer wrote a note on a person who was no longer kept
   * ("get and meet follow merged_into to the kept row"). `MERGE_HOPS` bounds a chain, and a row
   * that points at itself or cannot be read stops it where it is.
   */
  /** The batch, when undoing it would put something back (the record's own dry plan says so), else `undefined`. */
  const undoable = async (batch: string | undefined, ctx: C): Promise<string | undefined> => {
    if (batch === undefined || !surface.undoOwn) return batch;
    const plan = await surface.undoOwn({ batch, dry: true }, ctx);
    const v = plan.ok && isObject(plan.value) ? plan.value : null;
    return v !== null && Array.isArray(v.steps) && v.steps.length > 0 ? batch : undefined;
  };

  const keptOf = async (entry: Entry, ctx: C): Promise<{ entry: Entry; from: Entry | null }> => {
    let at = entry;
    for (let hop = 0; hop < MERGE_HOPS; hop++) {
      const to = at.fields.merged_into;
      if (typeof to !== 'string' || to === '') break;
      const got = await surface.get(parse(to) ?? { spoken: to }, ctx);
      if (!got.ok || !isEntry(got.value) || got.value.id === at.id) break;
      at = got.value;
    }
    return { entry: at, from: at === entry ? null : entry };
  };

  /**
   * A write to a row that is not there, refused as `get` refuses it: `ROW_UNKNOWN` at `spoken`. The kernel says
   * `VALUE_MALFORMED` at `id` ("There is no row tasks#999 in tasks"), naming a field the agent never sent.
   */
  const noRow = <T,>(r: Result<T>, spoken: unknown): Result<T> => {
    const refusal = 'refusal' in r ? r.refusal : undefined;
    if (r.ok || refusal === undefined || refusal.code !== 'VALUE_MALFORMED' || refusal.at !== 'id' || !refusal.fix.startsWith('There is no row ')) return r;
    return missing(typeof spoken === 'string' ? spoken.trim() : String(spoken));
  };

  /** A not-ok answer with the row a conflict carries made the shape the first copy was read in. A refusal as it came. */
  const failed = async (r: Result<unknown>, ctx: C, turn: Turn): Promise<Result<unknown>> => {
    const conflict = (r as { conflict?: { current?: unknown } }).conflict;
    if (!conflict || !isEntry(conflict.current)) return r;
    return { ...r, conflict: { ...conflict, current: await entryOut(conflict.current, ctx, turn) } } as Result<unknown>;
  };

  /**
   * Where a row is, from any way an agent says it: `register#number` as it is, and a prefixed id such as
   * `LN7` asked of the record, which alone knows which register owns a prefix.
   *
   * `context` NAMES ROWS BY PREFIX, so a tool that took only `register#number` refused the id the briefing
   * had just handed over: `update LN8` was "a row is addressed as register#number".
   */
  const locate = async (spoken: unknown, ctx: C, asked?: { tool: string; args: Args }): Promise<Result<{ register: string; seq: number }>> => {
    const at = parse(spoken);
    if (at) return { ok: true, value: at };
    const said = typeof spoken === 'string' ? spoken.trim() : '';
    /* A NAME, AS `get` TAKES ONE: the description says `spoken` is "as get takes it", and `update {"spoken":"Kiln"}` was
       refused a name `get` read. The one thing called that is the row; several are `NAME_AMBIGUOUS`, with the call for
       the first as `try`, so nothing is written to a row the agent did not mean. */
    if (!PREFIXED.test(said) && !ROW_ID.test(said)) {
      const found = await named(said, ctx, { text: false, titles: new Map() });
      if (found === null) return badSpoken(said === '' ? ROW_OR_ID : notNamed(said));
      if ('one' in found) return { ok: true, value: found.one };
      return { ok: false, refusal: ambiguous(said, found.many, asked === undefined ? undefined : callOf(asked.tool, { ...asked.args, spoken: found.many.handles[0]! })) };
    }
    const found = await surface.get({ spoken: said }, ctx);
    if (!found.ok) return found;
    const row = found.value as { register?: unknown; seq?: unknown } | null;
    return row && typeof row.register === 'string' && typeof row.seq === 'number'
      ? { ok: true, value: { register: row.register, seq: row.seq } }
      : missing(said);
  };

  /**
   * A rowset as the record takes it, from the shape the description teaches.
   *
   * THE REGISTER IS THE ONE EVERY ROW'S `at` NAMES, when the body leaves it out: `at` already says it, and
   * the record refused "A rowset proposal needs register" to a body whose every row named `skills`.
   *
   * AND A SKILL'S NEW TEXT IS ITS NEXT `rev`. `skills sync` rewrites a synced file only when `rev` rises, so
   * an accepted change to `body` that left `rev` alone reached the record and no session's files.
   */
  const rowset = async (body: Record<string, unknown>, ctx: C): Promise<Record<string, unknown>> => {
    if (!Array.isArray(body.rows)) return body;
    const rows = body.rows as unknown[];
    const read = new Map<string, Promise<Result<unknown>>>();
    const target = (at: string): Promise<Result<unknown>> => {
      let got = read.get(at);
      if (!got) {
        got = surface.get(parse(at) ?? { spoken: at.trim() }, ctx);
        read.set(at, got);
      }
      return got;
    };
    let register = body.register;
    if (register === undefined) {
      const named = new Set<string | undefined>();
      for (const r of rows) {
        const at = isObject(r) && typeof r.at === 'string' ? r.at : undefined;
        if (at === undefined) named.add(undefined);
        else {
          const got = await target(at);
          named.add(got.ok && isEntry(got.value) ? got.value.register : undefined);
        }
      }
      const [only] = [...named];
      if (named.size === 1 && only !== undefined) register = only;
    }
    const out = await Promise.all(
      rows.map(async (r) => {
        if (register !== 'skills' || !isObject(r) || typeof r.at !== 'string' || !isObject(r.patch)) return r;
        if (!Object.hasOwn(r.patch, 'body') || Object.hasOwn(r.patch, 'rev')) return r;
        const got = await target(r.at);
        const rev = got.ok && isEntry(got.value) ? got.value.fields.rev : undefined;
        return typeof rev === 'number' ? { ...r, patch: { ...r.patch, rev: rev + 1 } } : r;
      }),
    );
    return { ...body, ...(register === undefined ? {} : { register }), rows: out };
  };

  /**
   * A change as the record takes it. `declaration_id` IS THE ID OF WHAT IT INSTALLS, so it is taken from `to`
   * when left out: the record refused "A change proposal needs declaration_id" to a body whose `to` named it.
   */
  const change = (body: Record<string, unknown>): Record<string, unknown> =>
    body.declaration_id === undefined && isObject(body.to) && typeof body.to.id === 'string' ? { ...body, declaration_id: body.to.id } : body;

  /** The rule body a change installs, or `null` for a change to anything else, an addition of fields among them. */
  const ruleIn = (body: Record<string, unknown>): Record<string, unknown> | null => {
    const to = body.to;
    if (!isObject(to) || !isObject(to.body)) return null;
    const id = typeof to.id === 'string' ? to.id : typeof body.declaration_id === 'string' ? body.declaration_id : '';
    return to.kind === 'rule' || (to.kind === undefined && id.startsWith('rule.')) ? to.body : null;
  };

  /** The script body a change installs, or `null` for a change to anything else. The same reading as `ruleIn`. */
  const scriptIn = (body: Record<string, unknown>): Record<string, unknown> | null => {
    const to = body.to;
    if (!isObject(to) || !isObject(to.body)) return null;
    const id = typeof to.id === 'string' ? to.id : typeof body.declaration_id === 'string' ? body.declaration_id : '';
    return to.kind === 'script' || (to.kind === undefined && id.startsWith('script.')) ? to.body : null;
  };

  /** The page body a change installs, or `null` for a change to anything else. The same reading again, for `page.`. */
  const pageIn = (body: Record<string, unknown>): Record<string, unknown> | null => {
    const to = body.to;
    if (!isObject(to) || !isObject(to.body)) return null;
    const id = typeof to.id === 'string' ? to.id : typeof body.declaration_id === 'string' ? body.declaration_id : '';
    return to.kind === 'page' || (to.kind === undefined && id.startsWith('page.')) ? to.body : null;
  };

  /**
   * A page change drawn now and filed nowhere: `propose` with `"try": true` beside `to`.
   *
   * AN AGENT'S DRAFT PAGE WAS SEEN DRAWN ONLY BY THE OWNER, in Decide, which calls `previewPage` on a filed change
   * (`apps/web/src/routes/decide/[id]/proposed.ts`). The agent filed a page it had never seen hold a row, and each wrong
   * `where` became one more question in front of the owner. This is the same method, so the agent and the owner read one
   * drawing of it, and its refusals, the install's lint and a list the caller may not read among them, come back in the
   * record's own words.
   *
   * `try` IS `true` AND NOTHING ELSE HERE. A script's `{"input": ...}` stands in for what a door would hand it, and a page
   * has no door, so an input would be a value the preview dropped without saying so.
   */
  const preview = async (body: Record<string, unknown>, page: Record<string, unknown>, ctx: C): Answer => {
    if (body.try !== true)
      return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'try is true on a page change: a page has no input to hand it.', at: 'body.try' } };
    if (!surface.previewPage) return unbuilt('a preview', 'Send the change without try, and the owner sees the page drawn in Decide.');
    const drawn = await surface.previewPage({ body: page }, ctx);
    return drawn.ok ? { ok: true, value: { page_preview: drawn.value, proposed: false } } : drawn;
  };

  /**
   * A rule change whose steps are taken now over a sample and filed nowhere: `propose` with `"try": {"sample": {...}}`, or
   * `"try": true` for a clock or a button, which need none. The answer is `automation_try`.
   *
   * THE REAL RUNNER, ROLLED BACK. The record lints the body as an install would, then runs it inside its rehearsal, so
   * the agent reads each step as done, would, waiting, failed or skipped in the runner's own words, and a call, a script,
   * a question or a notice is said as what a live run would do and never sent. Nothing is filed, so nobody is asked; the
   * agent sends the change again without `try` to put it in front of the owner, as it does after `script_try`.
   */
  const automationTry = async (body: Record<string, unknown>, rule: Record<string, unknown>, ctx: C): Answer => {
    const said = body.try;
    if (said !== true && !(isObject(said) && Object.keys(said).every((k) => k === 'sample' || k === 'step' || k === 'given')))
      return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'try is true, or {"sample": {...}} to start the rule from a row, an arrival or a figure, "step": "steps[2]" to test one step. To run an installed rule again, send {"again": true} with to naming it by its id alone.', at: 'body.try' } };
    if (!surface.tryAutomation) return unbuilt('a trial', 'Send the change without try, and the owner reads what it would do in Decide.');
    const tried = await surface.tryAutomation(
      {
        body: rule,
        ...(isObject(said) && said.sample !== undefined ? { sample: said.sample } : {}),
        ...(isObject(said) && typeof said.step === 'string' ? { step: said.step } : {}),
        ...(isObject(said) && isObject(said.given) ? { given: said.given } : {}),
      },
      ctx,
    );
    return tried.ok ? { ok: true, value: { automation_try: tried.value, proposed: false } } : tried;
  };

  /**
   * A whole change drawn as it would stand and filed nowhere: `propose` with `"try": true`, or `"try": {"rows": ...,
   * "about": ...}` to draw it over sample rows, on a change whose `to` is a bundle, or one list or figure. The answer is
   * `change_preview`.
   *
   * A BUNDLE COULD NOT BE TRIED AT ALL. `try` read one page or one script, so a launch desk's lists, figures and pages
   * were filed and accepted a piece at a time before any page of it was seen holding a row
   * (`packages/mcp/test/compose-page.test.ts`). The record installs the whole change in its rehearsal and throws it away,
   * so the agent reads every page the change makes, filled over the row it names or the first one there is, in the
   * record's own words, and nobody is asked; it sends the change again without `try` to put it in front of the owner.
   */
  const rehearsed = async (body: Record<string, unknown>, ctx: C): Answer => {
    const said = body.try;
    if (said !== true && !(isObject(said) && Object.keys(said).every((k) => k === 'rows' || k === 'about')))
      return {
        ok: false,
        refusal: { code: 'VALUE_MALFORMED', fix: 'try is true, or {"rows": {...}, "about": "list#1"} to draw the change over sample rows.', at: 'body.try' },
      };
    if (!surface.previewChange) return unbuilt('a preview', 'Send the change without try, and the owner sees it drawn in Decide.');
    const drawn = await surface.previewChange(
      {
        to: body.to,
        ...(isObject(said) && said.rows !== undefined ? { rows: said.rows } : {}),
        ...(isObject(said) && said.about !== undefined ? { about: said.about } : {}),
      },
      ctx,
    );
    return drawn.ok ? { ok: true, value: { change_preview: drawn.value, proposed: false } } : drawn;
  };

  /**
   * A script change run now in the host's sandbox and filed nowhere: `propose` with `"try": true`, or `"try": {"input":
   * ...}` to hand it what a door would have, beside `to`.
   *
   * NOTHING IS FILED, SO NOBODY IS ASKED. The answer is the trial, `script_try`, and `proposed: false`; the agent sends the
   * change again without `try` to put it in front of the owner. The record checks the draft as it would at install
   * before anything runs, and refuses in its own words. A page change is handed to `preview` above before any of this.
   */
  /**
   * An installed rule run again over what it would fill now, dry: `propose` with `"try": {"again": true}` and
   * `to` naming the rule by its id alone. The record's own `dryRun` over the body as installed, read through
   * `automations` so a rule the caller may not read is answered as one that is not there, in the record's words.
   *
   * THE ANSWER IS WON, LOST, FILLED AND LEFT, and who took the rest: how many it would be first to set, how many an
   * earlier rule already set, how many it would fill, and the rest of what it matches. Nothing runs and nothing is filed;
   * the press that fills them is the owner's, on the rule's own page.
   */
  const again = async (body: Record<string, unknown>, ctx: C): Answer => {
    const said = body.try;
    if (!isObject(said) || Object.keys(said).some((k) => k !== 'again'))
      return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'try {"again": true} goes alone: it runs the rule named in to again, dry.', at: 'body.try' } };
    const id = typeof body.declaration_id === 'string' ? body.declaration_id : '';
    if (!id.startsWith('rule.') || (isObject(body.to) && body.to.body !== undefined))
      return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'Running a rule again names it in to by its id alone, such as {"id": "rule.chase"}: it runs as installed.', at: 'body.to' } };
    if (!surface.automations || !surface.dryRun) return unbuilt('a run again', 'The owner runs a rule again from its own page.');
    const found = await surface.automations({ rule: id }, ctx);
    if (!found.ok) return found;
    const rule = isObject(found.value) && isObject(found.value.body) ? found.value.body : null;
    if (rule === null) return { ok: false, refusal: { code: 'DECLARATION_UNKNOWN', fix: `There is no automation called ${id}.`, at: 'body.to' } };
    const dry = await surface.dryRun({ rule }, ctx);
    if (!dry.ok || !isObject(dry.value)) return dry;
    const v = dry.value;
    const name = isObject(found.value) && typeof found.value.name === 'string' ? found.value.name : id;
    /* WHO TOOK THE REST, BY NAME: the kernel counts them by bare rule id, which is a handle and not what a person reads.
       The names are the caller's own list of automations, so a rule she may not read keeps the kernel's word for it. */
    const taken = isObject(v.takenBy) ? Object.entries(v.takenBy).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0) : [];
    const names = new Map<string, string>();
    if (taken.length > 0) {
      const all = await surface.automations({}, ctx);
      if (all.ok && Array.isArray(all.value))
        for (const a of all.value) if (isObject(a) && typeof a.rule === 'string' && typeof a.name === 'string') names.set(a.rule, a.name);
    }
    const takenBy = taken.map(([rule, count]) => ({ rule: `rule.${rule}`, name: names.get(rule) ?? rule, count }));
    return {
      ok: true,
      value: {
        rule_again: bare({ rule: id, name, matches: v.matches, won: v.won, lost: v.lost, filled: v.filled, left: v.left, taken_by: takenBy, sample: v.sample }),
        proposed: false,
      },
    };
  };

  const trial = async (body: Record<string, unknown>, ctx: C): Answer => {
    /* AN INSTALLED RULE RUN AGAIN IS ASKED FIRST (`again` above): its change carries an id and no body, which every
       branch below would read as something else. */
    if (isObject(body.try) && body.try.again !== undefined) return again(change(body), ctx);
    const page = pageIn(change(body));
    if (page !== null) return preview(body, page, ctx);
    /* A RULE CHANGE IS TRIED BY THE RUNNER (`automationTry` above), before a script's reading of `try` is asked. */
    const rule = ruleIn(change(body));
    if (rule !== null) return automationTry(body, rule, ctx);
    /* ANYTHING ELSE IS DRAWN WHOLE BY THE RECORD'S REHEARSAL (`rehearsed` above): a bundle, or one list or figure. */
    const script = scriptIn(change(body));
    if (script === null) return rehearsed(body, ctx);
    const said = body.try;
    if (said !== true && !(isObject(said) && Object.keys(said).every((k) => k === 'input')))
      return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'try is true, or {"input": ...} to hand the script what a door would.', at: 'body.try' } };
    if (!surface.scriptTry) return unbuilt('a trial', 'Send the change without try, and the owner reads the source in Decide.');
    const tried = await surface.scriptTry({ body: script, ...(isObject(said) && said.input !== undefined ? { input: said.input } : {}) }, ctx);
    return tried.ok ? { ok: true, value: { script_try: tried.value, proposed: false } } : tried;
  };

  /**
   * `propose` with `withdraw`: a question this run asked, taken back while it is open (the record's `withdraw`).
   *
   * IT GOES ALONE. A withdrawal beside a question would be two acts in one call, and an agent that meant "replace it"
   * should read that the old one went before it asks again. WHO MAY IS THE RECORD'S: another run's question is refused
   * in the record's own sentence ("Only the run that asked can take it back."), and this adds nothing to it.
   */
  const withdrawn = async (args: Args, ctx: C): Promise<Done> => {
    const beside = ['question', 'body_kind', 'body', 'cause'].find((k) => args[k] !== undefined);
    if (beside !== undefined)
      return { result: { ok: false, refusal: { code: 'FIELD_UNKNOWN', fix: `withdraw goes alone. Send it without ${beside}, then propose again if you still need to.`, at: beside, allowed: ['withdraw'] } } };
    const id = typeof args.withdraw === 'string' ? args.withdraw.trim() : '';
    if (!surface.withdraw) return { result: unbuilt('withdraw', 'The question stays in Decide until the person answers it.') };
    const out = await surface.withdraw({ id }, ctx);
    /* AT `withdraw`, THE ARGUMENT THE AGENT SENT, never the record's `id` (door audit D30); a question that is not there
       is answered with the call that lists the open ones. */
    if (!out.ok) {
      const refusal = 'refusal' in out ? out.refusal : null;
      if (refusal === null || (refusal.at !== undefined && refusal.at !== 'id')) return { result: out };
      const gone = refusal.fix.startsWith('There is no ');
      return {
        result: {
          ok: false,
          refusal: {
            ...refusal,
            ...(gone ? { code: 'ROW_UNKNOWN', fix: `${refusal.fix} Your open questions are listed by governance.` } : {}),
            at: 'withdraw',
            ...(gone && refusal.try === undefined ? { try: callOf('governance', { register: 'suggestion', status: 'open' }) } : {}),
          } as Refusal,
        },
      };
    }
    /* SAID BY THE QUESTION'S WORDS WITH ITS HANDLE BESIDE THEM, read before the answer says it, as `log` reads one. */
    const shown = isObject(out.value) && typeof out.value.id === 'string' && out.value.id !== '' ? out.value.id : id;
    const words = await askedAs(shown, ctx);
    return {
      result: { ok: true, value: bare(out.value) },
      say: (look) => `Taken back: ${words === null ? shown : `${clip(plainOf(words, look), 160)} (${shown})`}. It is gone from Decide.`,
    };
  };

  /** The words an open or closed question was asked in, read by its SG handle, or `null` when it cannot be read. */
  const askedAs = async (sg: string, ctx: C): Promise<string | null> => {
    if (!/^SG[1-9][0-9]*$/u.test(sg)) return null;
    const read = await surface.governance({ register: 'suggestion', id: sg } as never, ctx);
    return read.ok && isObject(read.value) && typeof read.value.question === 'string' && read.value.question.trim() !== '' ? read.value.question : null;
  };

  /**
   * What a joined proposal is said as: "Already waiting as SG90.", the question's words, and where the person answers.
   *
   * THE WORDS ARE THE QUESTION ALREADY WAITING, read by its handle, since another run may have asked it in other words
   * and the person will read those; the agent's own words stand in only when it cannot be read. `widened` says how many
   * more this call added to an open set of changes.
   */
  const joinedSaid = (out: Record<string, unknown>, question: string, look: Look): string => {
    const id = typeof out.id === 'string' && out.id !== '' ? out.id : null;
    const more = typeof out.widened === 'number' && out.widened > 0 ? ` This added ${String(out.widened)} more to it.` : '';
    const at = typeof out.decide === 'string' ? ` at ${out.decide}` : '';
    const decider = look.decider.slice(0, 1).toUpperCase() + look.decider.slice(1);
    return [
      `${id === null ? 'Already waiting.' : `Already waiting as ${id}.`} ${clip(plainOf(question, look), 160)}${more}`,
      `Nothing new was asked. ${decider} decides in BrainDog${at}.`,
    ].join('\n');
  };

  /** Run `work` over every item, at most `at` at a time, and answer in the order they were given. */
  const pooled = async <T, R>(items: readonly T[], work: (item: T) => Promise<R>, at = 8): Promise<R[]> => {
    const out = new Array<R>(items.length);
    let next = 0;
    const lane = async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]!);
      }
    };
    await Promise.all(Array.from({ length: Math.min(at, items.length) }, lane));
    return out;
  };

  /**
   * The pages this caller may open, and the figures they draw. `resources/list` offers the first, and the second is
   * where a figure's id is found while no host answers `figures`.
   *
   * A PAGE IS HELD TO THE LEVEL TOO. Its rows are withheld either way, but a slug and a title are information:
   * "Payroll, monthly" in a listing tells a caller what a register they cannot read is called.
   */
  const drawn = async (listed: readonly { slug: string; title: string }[], ctx: C): Promise<{ pages: Resource[]; figures: string[] }> => {
    /* A FEW AT ONCE, IN THE ORDER LISTED. One page after another is one round trip each for a caller that reaches the
       record over a network: a record of fifty pages spent the bridge's whole 20 seconds here at every session start,
       was cut off before its figures and skills, and kept the server pending in the client all that time. */
    const drew = await pooled(
      listed.filter((page) => NAMED.test(page.slug)),
      async (page) => {
        const drawn = await surface.page({ slug: page.slug }, ctx);
        if (!drawn.ok) return null;
        const blocks =
          (drawn.value as { blocks?: { refusals?: { code: string }[]; readings?: { metric: string }[] }[] }).blocks ?? [];
        if (whollyWithheld(blocks)) return null;
        return {
          page: resource(`page/${page.slug}`, `${page.title}, with every block run: rows and figures, never markup.`),
          /* The figures a page names, taken from what it drew rather than a second read of its
             declaration, so a figure offered is one this page really carries. */
          figures: blocks.flatMap((block) => (block.readings ?? []).map((reading) => reading.metric)),
        };
      },
    );
    const held = drew.filter((d) => d !== null);
    return { pages: held.map((d) => d.page), figures: held.flatMap((d) => d.figures) };
  };

  /**
   * The figures this caller may read: an id, the name the record gave it when it gave one, and whether it takes a
   * parameter.
   *
   * THE RECORD'S LIST WHEN THE HOST ANSWERS ONE, AND THE DRAWN ONES WHEN IT DOES NOT. Named only when drawn, a figure no
   * page shows could be read by nobody who did not already know its id: a probe counted 18 of one pack's 36 so, and
   * nothing a tool answered named any of them.
   *
   * THE RECORD'S LIST IS TAKEN AS ANSWERED. It is held to `metric`'s own check figure by figure
   * (`packages/record/test/figures-list.test.ts`), so reading each id again here was that check twice, at a query per
   * figure: on the money pack as it ships with 500 rows of obligations, `record_index` took 67 ms with 36 figures read,
   * where `boot` and `version` alone take 20 to 30 and the list itself under 1.5. The drawn list, which runs every block
   * of every page, took 110 to 177. And the second read dropped the one template, what one project is owed, which
   * `metric` refuses bare as `REF_UNKNOWN` because it is read about one project, so the list said 35 of 36.
   *
   * A DRAWN FIGURE IS STILL READ BEFORE IT IS NAMED, because a reading survives its own refusal. The kernel keeps the id
   * on a cell it could not fill, so a figure the record says does not exist arrives in a page with the rest. The record
   * answers `METRIC_UNKNOWN` for a figure over a register the caller cannot reach, so that a name leaks nothing;
   * naming the id would hand the name back one layer further out.
   */
  type Named = { id: string; name?: string; param: boolean };
  const figuresFor = async (ctx: C, drawnIds: () => Promise<string[]>): Promise<Named[]> => {
    const declared = surface.figures ? await surface.figures(ctx) : null;
    /* HELD TO ITS SHAPE, because over the command line it came off the wire: `apps/cli/test/stdio.test.ts` hands the
       tools a surface where every method answers `{ rows: [] }`, and `.map` on that throws out of `resources/list`. */
    if (declared?.ok && Array.isArray(declared.value))
      return declared.value.flatMap((f: unknown): Named[] =>
        isObject(f) && typeof f.id === 'string' && NAMED.test(f.id)
          ? [{ id: f.id, ...(typeof f.name === 'string' ? { name: f.name } : {}), param: f.param === true }]
          : [],
      );
    const out: Named[] = [];
    for (const id of new Set(await drawnIds())) if (NAMED.test(id) && (await surface.metric({ metric: id }, ctx)).ok) out.push({ id, param: false });
    return out;
  };

  /**
   * A filed question with the address where the person answers it: `<origin>/<slug>/decide/<id>`.
   *
   * AN AGENT THAT PROPOSED COULD SAY ONLY "I PUT A QUESTION IN YOUR QUEUE". Deciding is the person's, in the app, and no
   * token reaches it (ADR-060), so the one useful thing to hand them is the link to the question itself, which the agent
   * can now pass on in its own reply.
   *
   * THE ORIGIN IS THE HOST'S AND THE SLUG IS THE RECORD'S. The host hands the address it is served at to `handle`, and
   * this package never guesses one, so a transport that hands none answers as before, with no `decide`. The slug is
   * `boot`'s `record`, asked only after a filing succeeded; a record that names none answers without it too. An answer
   * that already carries `decide` keeps its own.
   */
  const decideAt = async (answer: Result<unknown>, ctx: C, turn: Turn): Promise<Result<unknown>> => {
    /* AN EMPTY ID IS NO QUESTION TO LINK TO. The record answers `''` for the handle it could not find (`filedAs`), and
       a link ending in `/decide/` would land on the queue while saying it named this question. */
    if (
      origin === undefined ||
      !answer.ok ||
      !isObject(answer.value) ||
      typeof answer.value.id !== 'string' ||
      answer.value.id === '' ||
      answer.value.decide !== undefined
    )
      return answer;
    const id = answer.value.id;
    const boot = await bootOf(ctx, turn);
    const record = boot.ok && isObject(boot.value) ? boot.value.record : undefined;
    const slug = isObject(record) && typeof record.slug === 'string' && record.slug !== '' ? record.slug : null;
    if (slug === null) return answer;
    const at = `${origin.replace(/\/+$/, '')}/${encodeURIComponent(slug)}/decide/${encodeURIComponent(id)}`;
    return { ok: true, value: { ...answer.value, decide: at } };
  };

  /* ── who, when and where, for the answers that say it ────────────────── */

  /** The one `boot` an answer asks, shared by the tool and its words. */
  const bootOf = (ctx: C, turn: Turn): Promise<Result<unknown>> => (turn.boot ??= surface.boot(ctx));

  /**
   * The people an answer names, from `boot`: each by the name the record has for them, whom the questions wait on, and
   * the record's own clock.
   *
   * THE QUESTIONS WAIT ON THE OWNER, named where the caller is the owner's own key and the record has a name for them,
   * and "the owner" otherwise. `boot.names` is the record's to give: the owner and a reader of People are told names,
   * and anybody else is told none, so a line says "Someone on this record" for them as the app does.
   */
  const peopleOf = async (ctx: C, turn: Turn): Promise<{ names: Map<string, string>; decider: string; now: number; zone?: string; locale?: string; run?: string; app?: string }> => {
    const boot = await bootOf(ctx, turn);
    const value = boot.ok && isObject(boot.value) ? boot.value : {};
    const names = new Map<string, string>();
    if (isObject(value.names)) for (const [id, name] of Object.entries(value.names)) if (typeof name === 'string' && name.trim() !== '') names.set(id, name.trim());
    const me = isObject(value.me) ? value.me : {};
    const mine = typeof me.name === 'string' && me.name.trim() !== '' ? me.name.trim() : typeof me.person === 'string' ? names.get(me.person) : undefined;
    const now = typeof value.now === 'string' ? Date.parse(value.now) : NaN;
    return {
      names,
      decider: me.level === 'owner' && mine ? mine : 'the owner',
      now: Number.isFinite(now) ? now : Date.now(),
      ...(typeof value.zone === 'string' && value.zone !== '' ? { zone: value.zone } : {}),
      ...(isObject(value.record) && typeof value.record.locale === 'string' ? { locale: value.record.locale } : {}),
      ...(typeof me.run === 'string' && RUN_HANDLE.test(me.run) ? { run: me.run } : {}),
      ...(typeof me.app === 'string' && me.app.trim() !== '' ? { app: me.app.trim() } : {}),
    };
  };

  /**
   * The runs an answer's lines are signed by, each by its app and machine as a person names them, in one read of the
   * runs. A caller who cannot read the runs is refused it, and every run is then "An agent" beside its handle.
   */
  const runsOf = async (handles: readonly string[], ctx: C): Promise<Map<string, Record<string, unknown>>> => {
    const seqs = [...new Set(handles.filter((h) => RUN_HANDLE.test(h)).map((h) => Number(h.slice(1))))].slice(0, NAMES_PER_READ);
    const out = new Map<string, Record<string, unknown>>();
    if (seqs.length === 0) return out;
    const got = await surface.list({ register: SESSION, where: { field: 'seq', in: seqs }, limit: seqs.length }, ctx);
    if (got.ok) for (const row of got.value.rows) if (isEntry(row) && row.seq !== null) out.set(`S${String(row.seq)}`, row.fields);
    return out;
  };

  /**
   * The look an answer is said in: the lists it read, the rows it named, and the people and runs it asked for. `read` is
   * the runs where the answer already read them, so `context` asks for its two runs once and not twice.
   */
  const lookOf = async (ctx: C, turn: Turn, wants: Done['names'] = {}, read?: Map<string, Record<string, unknown>>): Promise<Look> => {
    const named = wants.runs !== undefined && wants.runs.length > 0;
    const [people, runs] = await Promise.all([
      /* THE CALLER'S OWN RUN IS READ WHENEVER A RUN SIGNS A LINE, so its own write says "You" (audit 10k, AK15). */
      wants.people === true || named ? peopleOf(ctx, turn) : Promise.resolve(null),
      read ?? (named ? runsOf(wants.runs!, ctx) : Promise.resolve(new Map<string, Record<string, unknown>>())),
    ]);
    /* A RUN THAT KEPT NO APP IS CALLED BY ITS KEY'S, where it is the caller's own: "An agent (S6)" for a key made for Claude Code. */
    const apps = new Map(
      [...runs].map(([spoken, fields]) => {
        const said = runnerOf(fields);
        return [spoken, said.startsWith('An agent') && spoken === people?.run && people.app !== undefined ? people.app : said];
      }),
    );
    const names = people?.names ?? new Map<string, string>();
    const mine = people?.run;
    return {
      now: people?.now ?? Date.now(),
      decl: (register) => decls.get(register),
      title: (spoken) => turn.titles.get(spoken),
      actor: (by) => (mine !== undefined && by.trim() === mine ? 'You' : actorWords(by, names, apps)),
      decider: people?.decider ?? 'the owner',
    };
  };

  /**
   * The page Home draws for this caller, of the pages it may open: a use case's own `home-<id>`, else the record's `home`.
   *
   * THE APP'S RULE (`homeSlugOf` in `apps/web/src/lib/voice.ts`), read off the pages the caller may open, so "read the
   * Home page" lands where the person's Home does. On the owner's record that is `home-founder`, and the instructions'
   * "Read the Home page" was `PAGE_UNKNOWN` there for every agent.
   *
   * AND OF TWO USE CASES, THE ONE THIS AGENT'S PROJECT BELONGS TO. This took the first `home-<id>` the record listed, so on
   * a record set up for a founder and a student an agent in the thesis folder was sent to the founder's money. Which use
   * case a project belongs to is the one whose Home reads the list the project is kept in (its `requires`, or a block's
   * `source`); where that is none or several, the use case that speaks, which is the one the person's own Home draws
   * (`speakingPack`, read off `arrangement`'s `voice`); and the first only where neither says. `project` is the project's
   * spoken id, `null` for none, and `undefined` to ask `context` for it. One use case, the common record, asks nothing.
   */
  const homeIn = async (
    pages: readonly { slug: string; title: string }[],
    ctx: C,
    project?: string | null,
  ): Promise<{ slug: string; title: string } | null> => {
    const homes = pages.filter((p) => HOME_OF_A_USE_CASE.test(p.slug));
    if (homes.length <= 1) return homes[0] ?? pages.find((p) => p.slug === 'home') ?? null;
    const arranged = surface.arrangement?.bind(surface);
    if (!arranged) return homes[0]!;
    let about = project;
    if (about === undefined) {
      const c = surface.context ? await surface.context({} as never, ctx) : null;
      about = c?.ok && isObject(c.value) && isObject(c.value.project) && typeof c.value.project.spoken === 'string' ? c.value.project.spoken : null;
    }
    let among = homes;
    const list = about === null ? null : await listOfRow(about, ctx);
    if (list !== null) {
      const reads = await Promise.all(
        homes.map(async (h) => {
          const d = await arranged({ page: h.slug }, ctx);
          return d.ok && isObject(d.value) && JSON.stringify(d.value.body ?? null).includes(JSON.stringify(`register.${list}`));
        }),
      );
      const own = homes.filter((_, i) => reads[i]);
      if (own.length === 1) return own[0]!;
      if (own.length > 1) among = own;
    }
    const overview = await arranged({}, ctx);
    const voice = overview.ok && isObject(overview.value) && isObject(overview.value.voice) ? overview.value.voice.pack : null;
    const speaking = typeof voice === 'string' ? among.find((h) => h.slug === `home-${voice.replace(/^usecase-/u, '')}`) : undefined;
    return speaking ?? among[0]!;
  };

  /** The list a row is kept in, by its spoken id: `things#3` says it, and a prefixed `P3` is read to learn it. */
  const listOfRow = async (spoken: string, ctx: C): Promise<string | null> => {
    const at = parse(spoken);
    if (at) return at.register;
    const prefix = /^([A-Z]{1,4})[1-9][0-9]*$/u.exec(spoken)?.[1];
    if (prefix === undefined) return null;
    const known = [...prefixes].find(([, p]) => p === prefix)?.[0];
    if (known !== undefined) return known;
    const got = await surface.get({ spoken }, ctx);
    return got.ok && isEntry(got.value) ? got.value.register : null;
  };

  /**
   * The words of the rows a handful of sentences name, by handle, `tools#8`, one read of each list they are in, and by
   * row id, one read each, so an answer can say the thing beside its handle and never its number alone. A list the
   * caller cannot read keeps its handles, and a row id nobody here may read is said as one that cannot be opened.
   *
   * A ROW ID IS KEPT AS ITS WORDS WITH ITS HANDLE, `Kiln (things#1)`, because a sentence that named a row by its id
   * gave the agent no handle to act on either (`plainOf`).
   */
  const handlesNamed = async (handles: readonly string[], ctx: C, turn: Turn): Promise<void> => {
    const by = new Map<string, number[]>();
    const ids: string[] = [];
    for (const h of handles) {
      if (turn.titles.has(h)) continue;
      const at = parse(h);
      if (at) by.set(at.register, [...(by.get(at.register) ?? []), at.seq]);
      else if ((ROW_ID.test(h) || PREFIXED.test(h)) && ids.length < IDS_NAMED) ids.push(h);
    }
    await Promise.all([
      ...[...by].slice(0, LISTS_NAMED).map(async ([register, seqs]) => {
        if (!decls.has(register)) await learnPrefix(register, ctx);
        const got = await surface.list({ register, where: { field: 'seq', in: seqs.slice(0, NAMES_PER_READ) }, limit: Math.min(seqs.length, NAMES_PER_READ) }, ctx);
        if (!got.ok) return;
        for (const row of got.value.rows) {
          if (!isEntry(row) || row.seq === null) continue;
          const words = titleOf(row.fields, decls.get(register));
          if (words) turn.titles.set(`${register}#${String(row.seq)}`, words);
        }
      }),
      ...ids.map(async (id) => {
        const got = await surface.get({ spoken: id }, ctx);
        if (!got.ok || !isEntry(got.value) || got.value.seq === null) return;
        const spoken = await addressOf(got.value.register, got.value.seq, ctx);
        const words = titleOf(got.value.fields, decls.get(got.value.register));
        /* A PREFIXED HANDLE IS A HANDLE ALREADY, and keeps the words alone, as a `register#number` does above. */
        if (PREFIXED.test(id)) {
          if (words) turn.titles.set(id, words);
          return;
        }
        const one = decls.get(got.value.register)?.one;
        turn.titles.set(id, words ? `${clip(words, 40)} (${spoken})` : typeof one === 'string' && one !== '' ? `Untitled ${one} (${spoken})` : spoken);
      }),
    ]);
  };

  /**
   * The questions and decisions lines of the log are about, by their own words, read once each and at most eight: what
   * `targetSaid` says beside the handle, `"Which licence?" (SG14)`. One the caller may not read keeps its handle alone.
   */
  const questionsNamed = async (lines: readonly Record<string, unknown>[], ctx: C, turn: Turn): Promise<void> => {
    const wanted = new Map<string, 'suggestion' | 'decision'>();
    for (const e of lines) {
      const m = typeof e.target === 'string' ? /^(suggestion|decision):([A-Z]{1,3}\d+)$/u.exec(e.target) : null;
      if (m && !turn.titles.has(m[2]!) && wanted.size < 8) wanted.set(m[2]!, m[1] as 'suggestion' | 'decision');
    }
    await Promise.all(
      [...wanted].map(async ([id, register]) => {
        const got = await surface.governance({ register, id } as never, ctx);
        const row = got.ok && isObject(got.value) ? got.value : null;
        const words = row && typeof row.question === 'string' ? row.question.trim() : '';
        if (words !== '') turn.titles.set(id, clip(words, 60));
      }),
    );
  };

  /**
   * The rows a line of the log moved a link from and to, by the row ids the log holds, each once: what `handlesNamed`
   * names before a history or the log is said, so a changed link reads "from Sam (people#1) to Ada (people#2)". A
   * line's list is asked of the caller, since a spoken line no longer carries it.
   */
  const linksIn = (events: readonly Record<string, unknown>[], listOf: (e: Record<string, unknown>, i: number) => string | undefined): string[] => [
    ...new Set(
      events.flatMap((e, i) => {
        if (e.kind !== 'edit' || typeof e.field !== 'string') return [];
        const list = listOf(e, i);
        const field = list === undefined ? undefined : decls.get(list)?.fields.find((f) => f.id === e.field);
        return field?.type === 'ref' ? [e.from, e.to].filter((v): v is string => typeof v === 'string' && v !== '') : [];
      }),
    ),
  ];

  /**
   * The record's `context` as an agent reads it: the card, and the briefing cut to what bears on this caller.
   *
   * WHAT THE CARD NEEDS THAT THE BRIEFING DOES NOT SAY, read beside it and at once: `boot`, for whom the questions wait
   * on, how many wait in all and the Home page; each list's declaration, which says whether it is work, learnings or
   * a list kept for reference; the caller's run and the run that left the step, in one read of the runs; and the words
   * of the rows the questions name.
   */
  const briefOf = async (c: Record<string, unknown>, ctx: C, turn: Turn): Promise<{ value: Record<string, unknown>; text: string }> => {
    const listed = (Array.isArray(c.registers) ? c.registers : []).filter(isObject).map((r) => String(r.id));
    const session = isObject(c.session) && typeof c.session.spoken === 'string' ? c.session.spoken : null;
    const from = isObject(c.handoff) && typeof c.handoff.from === 'string' ? c.handoff.from : null;
    const asked = (Array.isArray(c.waiting) ? c.waiting : []).filter(isObject);
    /* EVERY SENTENCE THE CARD SAYS THAT NAMES A ROW: the questions, the step left and its dead ends, the folders' other
       projects, and the learnings. Only the questions' were read, so a step that said "finish tasks#41" was said with
       the bare handle beside a card that named everything else. */
    const step = isObject(c.handoff) ? c.handoff : {};
    const learned = (Array.isArray(c.registers) ? c.registers : []).filter(isObject).flatMap((r) => [
      ...(Array.isArray(r.rows) ? r.rows : []),
      ...(Array.isArray(r.inherited) ? r.inherited : []),
    ]);
    const handles = [
      ...asked.flatMap((w) => (typeof w.question === 'string' ? handlesIn(w.question) : [])),
      ...[step.next, c.next, ...(Array.isArray(step.tried) ? step.tried : [])].flatMap((t) => (typeof t === 'string' ? handlesIn(t) : [])),
      ...(Array.isArray(c.ambiguous) ? c.ambiguous.filter((a): a is string => typeof a === 'string') : []),
      ...learned.flatMap((r) => (isObject(r) ? Object.values(r).flatMap((v) => (typeof v === 'string' && v.includes('#') ? handlesIn(v) : [])) : [])),
      /* AND THE ORGANISATIONS THE WHO SLOT NAMES, which the record sends as handles: each person's, and the project's. */
      ...[
        ...(Array.isArray(c.people) ? c.people : []).filter(isObject).flatMap((p) => [p.org, p.organisation]),
        ...(isObject(c.project) ? [c.project.org, c.project.organisation] : []),
        ...(Array.isArray(c.organisations) ? c.organisations : []),
      ].filter((h): h is string => typeof h === 'string' && (PREFIXED.test(h) || parse(h) !== null)),
    ];
    const [boot, runs] = await Promise.all([
      bootOf(ctx, turn),
      runsOf([session, from].filter((s): s is string => s !== null), ctx),
      Promise.all(listed.filter((id) => !decls.has(id)).map((id) => learnPrefix(id, ctx))),
      handlesNamed(handles, ctx, turn),
    ]);
    const shell = boot.ok && isObject(boot.value) ? boot.value : {};
    const counts = isObject(shell.counts) ? shell.counts : {};
    const look = await lookOf(ctx, turn, { people: true }, runs);
    return briefed({
      context: c,
      look,
      mine: session === null ? undefined : runs.get(session),
      left: from === null ? undefined : runs.get(from),
      waiting: typeof counts.decide === 'number' ? counts.decide : undefined,
      record: shell.record,
      home: await homeIn(pagesIn(shell), ctx, isObject(c.project) && typeof c.project.spoken === 'string' ? c.project.spoken : null),
    });
  };

  /**
   * A row that is not there, or not one this caller may read, refused as one. Its `try`, the list to look in or the row
   * in the list it most likely meant, is `tryFor`'s, which reads the lists the caller may open.
   */
  const missing = (spoken: string): Result<never> => ({
    ok: false,
    refusal: { code: 'ROW_UNKNOWN', fix: `There is no ${spoken} that you can read. It may have been deleted, or be in a list you cannot open.`, at: 'spoken' },
  });

  /**
   * A limit as this package holds it: the default when none was sent, a whole number past `most` cut to `most`, and
   * anything else as sent, for the record to refuse in its own words.
   *
   * A LIMIT UNDER 1 GOES ON AS SENT ("List limit below 1 refused"): it was made 1 here without a word, so an
   * agent that asked for none read one and never learnt its call was wrong. The record refuses it at `limit`, and the
   * refusal's `try` is the call with a limit it takes (`tryFor`).
   */
  const limitOf = (said: unknown, fallback: number, most: number): number => {
    if (said === undefined || said === null) return fallback;
    const n = Number(said);
    return Number.isInteger(n) ? Math.min(n, most) : n;
  };

  /**
   * A page's words when the call asked past this door's ceiling, which answers `most`: the tool's own lines
   * without its closing call, and a last line that says how many of how many, and that the rest is the same call with
   * the cursor beside it. The ceiling stays a hundred an answer here, where the HTTP and command line doors keep 500.
   */
  const cutSaid = (name: string, args: Args, most: number, page: Page, brief: (page: Page) => string): string => {
    const asked = Number(args.limit);
    if (!(Number.isInteger(asked) && asked > most) || page.cursor === undefined) return brief(page);
    const { cursor, ...rest } = page;
    const shown = grouped(page.rows.length);
    const of = page.matched !== undefined && args.cursor === undefined && page.matched > page.rows.length ? `${shown} of ${grouped(page.matched)}` : `${shown} so far`;
    const again = Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'format' && k !== 'cursor'));
    return [brief(rest), `${of}. More: the same call with this cursor. ${callOf(name, { ...again, cursor })}`].join('\n');
  };

  /**
   * A page read again with fewer rows until its JSON fits in one answer.
   *
   * NO ANSWER PASSES ABOUT TEN THOUSAND TOKENS, because no host shows a model more whole (Claude Code holds a tool result
   * to 25,000 by default, and a list asked with `fields` over project write-ups measured 760 KB on the owner's record).
   * Asked again rather than cut, so the cursor the record hands back still starts where these rows end.
   */
  const fitted = async <P extends { rows: unknown[] }>(limit: number, read: (limit: number) => Promise<Result<P>>): Promise<Result<P>> => {
    let out = await read(limit);
    for (let tries = 0; tries < 3 && out.ok; tries += 1) {
      const size = JSON.stringify(out.value).length;
      if (size <= ANSWER_MOST || out.value.rows.length <= 1) break;
      out = await read(Math.max(1, Math.floor(out.value.rows.length * (ANSWER_MOST / size) * 0.9)));
    }
    return out;
  };

  /**
   * `get` BY A NAME (§6.1): "Oxbow.gg" or "Send Wren the Oxbow Pass refund email" was refused, because `get`
   * took a handle alone, and an agent searched and read again. Now the one thing whose title is that name, case and
   * spacing aside, answers as its handle does; a search with one hit answers too. Several are refused `NAME_AMBIGUOUS`
   * with each by its handle and list, and the call for the first as `try`. `null` when nothing is called that, so the
   * caller says the row forms as before.
   */
  const byName = async (said: string, args: Args, ctx: C, turn: Turn): Promise<Done | null> => {
    const found = await named(said, ctx, turn);
    /* A SCRIPT OR AN AUTOMATION CALLED THAT (`scriptNamed`) comes before a search's lone guess, and after a row whose
       whole title it is: "bake-numbers" was refused, and "last_day" answered an update that happened to say "last". */
    if (found === null || ('one' in found && !found.exact)) {
      const script = await scriptNamed(said, ctx);
      if (script !== null) return script;
    }
    if (found === null) return null;
    if ('one' in found) {
      const got = await run.get!({ ...args, spoken: `${found.one.register}#${String(found.one.seq)}` }, ctx, turn);
      /* A GUESS SAYS IT IS ONE: nothing is called that, and this is the one item search found for its words. */
      if (found.exact || !got.result.ok || got.say === undefined) return got;
      const say = got.say;
      return { ...got, say: (look) => `Nothing is called ${clip(said, 60)}; search found this one:\n${say(look)}` };
    }
    return { result: { ok: false, refusal: ambiguous(said, found.many, callOf('get', { ...args, spoken: found.many.handles[0]! })) } };
  };

  /**
   * A script or an automation by its id or its whole title (`scripts.ts`), in short lines, or `null` when none is
   * called that. Read through the record's own `scripts` and `automations`, with the caller's grant.
   */
  const scriptNamed = async (said: string, ctx: C): Promise<Done | null> => {
    if (said === '' || said.length > 200 || !surface.call) return null;
    const [scripts, automations] = await Promise.all([
      surface.call('scripts', {}, ctx),
      surface.automations ? surface.automations({}, ctx) : Promise.resolve(null),
    ]);
    const rules = automations?.ok && Array.isArray(automations.value) ? automations.value.filter(isObject) : [];
    const script = (scripts.ok && Array.isArray(scripts.value) ? scripts.value.filter(isObject) : []).find((s) => scriptNames(s, said));
    if (script !== undefined) {
      const by = rules.filter((r) => isObject(r.script) && r.script.id === script.script);
      const value = bare({ ...script, rules: by.map((r) => r.rule) });
      return { result: { ok: true, value }, say: (look) => scriptBrief(script, by, look.now) };
    }
    const rule = rules.find((r) => scriptNames(r, said));
    if (rule === undefined || !surface.automations) return null;
    const one = await surface.automations({ rule: String(rule.rule) }, ctx);
    if (!one.ok || !isObject(one.value)) return null;
    const whole = one.value;
    return { result: { ok: true, value: bare(whole) }, say: (look) => ruleBrief(whole, look.now) };
  };

  /**
   * `list` of what is no list of rows: `scripts` and `automations` (and `rules`), a line each, from the record's own
   * reads. `null` for any other name, which keeps its refusal.
   */
  const notRows = async (register: string, ctx: C): Promise<Done | null> => {
    const asked = register.trim().toLowerCase();
    if (asked === 'scripts' || asked === 'script') {
      if (!surface.call) return null;
      const got = await surface.call('scripts', {}, ctx);
      if (!got.ok || !Array.isArray(got.value)) return got.ok ? null : { result: got };
      const rows = got.value.filter(isObject);
      return { result: { ok: true, value: bare(got.value) }, say: () => scriptsBrief(rows) };
    }
    if (asked === 'automations' || asked === 'automation' || asked === 'rules') {
      if (!surface.automations) return null;
      const got = await surface.automations({}, ctx);
      if (!got.ok || !Array.isArray(got.value)) return got.ok ? null : { result: got };
      const rows = got.value.filter(isObject);
      return { result: { ok: true, value: bare(got.value) }, say: () => rulesBrief(rows) };
    }
    return null;
  };

  /**
   * The thing a name is, for `get`, `update`, `log` and `history`: `one` when exactly one row's title is that name, case
   * and spacing aside, or a search finds one row alone; `many` with up to five handles and where each is when several
   * are called that; `null` when nothing is.
   */
  const named = async (
    said: string,
    ctx: C,
    turn: Turn,
    within?: string,
  ): Promise<{ one: { register: string; seq: number }; exact: boolean } | { many: { handles: string[]; each: string[]; count: number } } | null> => {
    if (said === '' || said.length > 200) return null;
    const found = await surface.search({ q: said, limit: 20 }, ctx);
    if (!found.ok) return null;
    const all = (Array.isArray(found.value) ? found.value : isObject(found.value) && Array.isArray(found.value.hits) ? found.value.hits : [])
      .filter(isObject)
      .filter((h): h is { register: string; seq: number; title?: unknown } => typeof h.register === 'string' && typeof h.seq === 'number')
      .filter((h) => within === undefined || h.register === within);
    const norm = (s: unknown): string => (typeof s === 'string' ? s.toLowerCase().replace(/\s+/gu, ' ').trim() : '');
    const exact = all.filter((h) => norm(h.title) === norm(said));
    const picked = exact.length > 0 ? exact : all.length === 1 ? all : [];
    if (picked.length === 0) return null;
    if (picked.length === 1) return { one: { register: picked[0]!.register, seq: picked[0]!.seq }, exact: exact.length === 1 };
    const handles = await Promise.all(picked.slice(0, 5).map((h) => addressOf(h.register, h.seq, ctx)));
    const boot = await bootOf(ctx, turn);
    const lists = new Map(
      (boot.ok && isObject(boot.value) && Array.isArray(boot.value.registers) ? boot.value.registers : []).filter(isObject).map((r) => [String(r.id), String(r.name ?? r.id)]),
    );
    const each = picked.slice(0, 5).map((h, i) => `${handles[i]!} in ${lists.get(h.register) ?? h.register}`);
    return { many: { handles, each, count: picked.length } };
  };

  /** Several things called one name, each by its handle and list, with the call for the first as `try` when there is one. */
  const ambiguous = (said: string, many: { handles: string[]; each: string[]; count: number }, tried: string | undefined): Refusal => {
    const more = many.count > 5 ? ` and ${String(many.count - 5)} more` : '';
    return {
      code: 'NAME_AMBIGUOUS',
      fix: `${String(many.count)} things are called ${clip(said, 60)}: ${many.each.join(', ')}${more}. Say which by its handle.`,
      at: 'spoken',
      allowed: many.handles,
      ...(tried === undefined ? {} : { try: tried }),
    } as Refusal;
  };

  /**
   * `get` WITH ITS HISTORY (`history: true`), which was the tool `history` (12a): the row as `get` answers it,
   * then every write to it as `history` answers them, in one call and one answer.
   */
  const withHistory = async (args: Args, ctx: C, turn: Turn): Promise<Done> => {
    const { history: _asked, ...rest } = args;
    const one = await run.get!(rest, ctx, turn);
    const value = one.result.ok && isObject(one.result.value) ? one.result.value : null;
    if (value === null || typeof value.spoken !== 'string') return one;
    const lines = await run.history!({ spoken: value.spoken }, ctx, turn);
    if (!lines.result.ok) return one;
    const events = isObject(lines.result.value) && Array.isArray(lines.result.value.rows) ? lines.result.value.rows : [];
    return {
      result: { ok: true, value: { ...value, history: events } },
      say: (look) => [one.say?.(look) ?? '', lines.say?.(look) ?? ''].filter((s) => s !== '').join('\n'),
      names: {
        people: one.names?.people === true || lines.names?.people === true,
        runs: [...(one.names?.runs ?? []), ...(lines.names?.runs ?? [])],
      },
    };
  };

  /**
   * `log` WITH A PAGE: a visual hung on the thing `spoken` names, a task by its handle or name, or a question as SG5.
   * The record resolves the thing and holds the page to the frame's rules; its answer's batch is the receipt's undo.
   */
  const pageOn = async (args: Args, ctx: C, turn: Turn): Promise<Done> => {
    if (!surface.attachVisual) return { result: unbuilt('a page on log', 'Hand the page in with braindog attach.') };
    if (typeof args.spoken !== 'string' || args.spoken.trim() === '')
      return { result: { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'Say in spoken what the page is on: a task, a project, or a question as SG5.', at: 'spoken' } } };
    if (typeof args.page !== 'string') return { result: { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'page is the HTML itself, with its style and script.', at: 'page' } } };
    /* A NOTE THAT IS A FILE'S NAME KEEPS THE PAGE AS A FILE, AS IT IS (`methods/attachments.ts`): a Claude artifact that
       loads its libraries, a markdown write-up, a CSV. No argument of its own, because the list has no tokens for one;
       the refusal below names it to an agent whose artifact a visual would not take. */
    if (typeof args.note === 'string' && FILE_NAME.test(args.note.trim()) && surface.attachFile) {
      const kept = await surface.attachFile({ on: args.spoken.trim(), name: args.note.trim(), text: args.page }, ctx);
      if (!kept.ok) return { result: await failed(kept, ctx, turn) };
      /* THE UNDO RECEIPT TAKES IT OFF AGAIN: the record's undo puts an attachment back where it stood (`undo.ts`). */
      turn.batch = batchIn(kept.value);
      const said = isObject(kept.value) && typeof kept.value.said === 'string' ? kept.value.said : 'Attached.';
      return { result: kept, say: () => said };
    }
    const title = typeof args.note === 'string' && args.note.trim() !== '' ? { title: args.note.trim() } : {};
    if (args.draft !== undefined && typeof args.draft !== 'boolean') return { result: { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'draft is true for a page to be kept or thrown away, or left out.', at: 'draft' } } };
    const out = await surface.attachVisual({ on: args.spoken.trim(), page: args.page, ...title, ...(args.draft === true ? { draft: true } : {}) }, ctx);
    if (!out.ok && 'refusal' in out && surface.attachFile && out.refusal.at === 'page' && out.refusal.code === 'VALUE_MALFORMED')
      return { result: await failed({ ok: false, refusal: { ...out.refusal, fix: `${out.refusal.fix} To keep it as it is, as a file, send note as its file name, such as dashboard.html.` } }, ctx, turn) };
    if (!out.ok) return { result: await failed(out, ctx, turn) };
    turn.batch = batchIn(out.value);
    const said = isObject(out.value) && typeof out.value.said === 'string' ? out.value.said : 'Drawn.';
    return { result: out, say: () => said };
  };

  /** The files on a row an agent just read, or none: a record without attachments, or a row it cannot name, has none. */
  const filesOn = async (row: unknown, ctx: C): Promise<{ id: string; name: string; kind: string; bytes: number }[]> => {
    const spoken = isObject(row) && typeof row.spoken === 'string' ? row.spoken : null;
    if (spoken === null || !surface.attachments) return [];
    const got = await surface.attachments({ on: spoken }, ctx);
    if (!got.ok || !isObject(got.value) || !Array.isArray(got.value.attachments)) return [];
    return got.value.attachments.flatMap((a) =>
      isObject(a) && typeof a.id === 'string' && typeof a.name === 'string' ? [{ id: a.id, name: a.name, kind: String(a.kind ?? 'file'), bytes: Number(a.bytes ?? 0) }] : [],
    );
  };

  /**
   * One attachment's words for an agent, a slice from `from`, with where the next slice starts; `null` when the record
   * holds no attachment by that id this caller can see, so `get` answers it as any id that names nothing.
   */
  const fileRead = async (id: string, from: number, ctx: C, _turn: Turn): Promise<Done | null> => {
    if (!surface.attachment) return null;
    const got = await surface.attachment({ id, ...(from > 0 ? { from } : {}) }, ctx);
    if (!got.ok || !isObject(got.value)) return null;
    const a = got.value;
    const more = typeof a.more === 'number' ? `${id}@${a.more}` : null;
    const value = bare({
      id,
      name: a.name,
      kind: a.kind,
      bytes: a.bytes,
      on: a.on,
      version: a.version,
      ...(a.gone === true ? { removed: true } : {}),
      text: typeof a.text === 'string' ? a.text : null,
      ...(more === null ? {} : { more }),
    });
    const head = `${String(a.name)} (${String(a.kind)}, ${sizeSaid(Number(a.bytes ?? 0))}) on ${String(a.on)}${a.gone === true ? ', removed' : ''}`;
    const words = typeof a.text === 'string' ? a.text : 'It holds no words this reader can find: a picture, a scan or a document to open in BrainDog.';
    return { result: { ok: true, value }, say: () => [head, '', words, ...(more === null ? [] : ['', `More: get ${more}`])].join('\n') };
  };

  const run: Record<string, (args: Args, ctx: C, turn: Turn) => Promise<Done>> = {
    /**
     * THE REGISTERS AND THE VERSION, AND NOTHING ELSE `boot` CARRIES. `boot` is the app's first screen in one
     * round trip: live sessions, waiting questions, pages and the whole of what is new, 34 kilobytes on the
     * seeded record. The description promised "the cheap way to learn register names", and `context` is
     * where the rest is for an agent.
     */
    record_index: async (args, ctx, turn) => {
      /* ONE LIST'S FIELDS, AS `schema` ANSWERED THEM, which it now is. */
      if (args.register !== undefined && args.register !== null) return run.schema!(args, ctx, turn);
      const boot = await bootOf(ctx, turn);
      if (!boot.ok) return { result: boot };
      const shell = boot.value as { registers?: unknown; record?: unknown };
      const version = await surface.version(ctx);
      /* AND THE FIGURES, BY ID AND NOT WITH THEIR READINGS, because `get` of one answers it whole and the answer here is
         meant to stay small. None is no key, as an empty field goes from `activity`'s lines, so a record with no figures
         answers what it did. A TEMPLATE IS NAMED WITH ITS SLOT, `<id>:<value>`, which is the form `get` takes it
         in; bare, the record refuses it for want of the thing it is about.
         THE PAGES ARE `boot`'S, already in hand and held by the same filter `pages` runs
         (`packages/record/src/index.ts`, `shellFor`), so a host with no `figures` asks no third method to find them. */
      const figures = (await figuresFor(ctx, async () => (await drawn(pagesIn(boot.value), ctx)).figures)).map((f) =>
        f.param ? `${f.id}:<value>` : f.id,
      );
      /* `.version.version`, BECAUSE `version` ANSWERS `33 §4`'s OBJECT and not a bare number. An
         agent holding the object as its cursor would send it back and get a range scan from nothing. */
      const live = liveOf((boot.value as { sessions?: unknown }).sessions);
      const value = bare({
        ...(shell.record === undefined ? {} : { record: shell.record }),
        registers: shell.registers,
        ...(figures.length === 0 ? {} : { figures }),
        ...(version.ok ? { version: version.value.version } : {}),
        ...(live === null ? {} : { live }),
      }) as Record<string, unknown>;
      return { result: { ok: true, value }, say: () => indexBrief(value) };
    },

    /**
     * THE CARD, AND THE BRIEFING CUT TO WHAT BEARS ON THIS CALLER (`briefing.ts`). The record's own answer measured
     * 16.6 KB on the owner's record, three quarters of it keys and skills that apply everywhere.
     *
     * THE CARD IS THE RECORD'S (`c.card`), printed as it came, then the open work and the habits: the start hook
     * and `braindog context` print the same card, so a session is never told two things by two builds.
     */
    /**
     * AND WHAT IT ASKED FOR: `task` whole with its version, `project` by name, `depth`, and `since` a stamp,
     * which answers only what moved for its run, "Nothing new." when nothing did. A full answer asks the full depth.
     * `topic` is what an agent with no folder says the person is working on, which the record places its run by.
     */
    context: async (args, ctx, turn) => {
      if (!surface.context) return { result: unbuilt('context', 'Call record_index for the registers, then list what is open.') };
      const full = (ctx as { session?: { format?: unknown } }).session?.format === 'full';
      const sent = Object.fromEntries(
        (['task', 'project', 'depth', 'since', 'topic'] as const).flatMap((k) => (args[k] === undefined || args[k] === null ? [] : [[k, args[k]]])),
      ) as { task?: string; project?: string; depth?: string; since?: string; topic?: string };
      if (full && sent.depth === undefined && sent.since === undefined) sent.depth = 'full';
      const raw = await surface.context(sent as never, ctx);
      if (!raw.ok || !isObject(raw.value)) return { result: raw };
      if (isObject(raw.value.since)) {
        const s = raw.value.since;
        const lines = Array.isArray(s.lines) ? s.lines.filter((l): l is string => typeof l === 'string') : [];
        const value = bare({ stamp: s.stamp, changed: s.changed === true, pending: pendingOf(s.pending), stop: s.stop ?? null }) as Record<string, unknown>;
        return { result: { ok: true, value }, say: () => (lines.length > 0 ? lines.join('\n') : 'Nothing new.') };
      }
      const briefing = await briefOf(raw.value, ctx, turn);
      return { result: { ok: true, value: briefing.value }, say: () => briefing.text };
    },

    /**
     * WHAT HE TOLD THIS RUN, AND ITS ANSWER (§6.1), the record's `instructionsMine`: nothing reads what waits and
     * marks it seen; `take` takes one, the first of two runs winning and the second told who has it; `reply` answers one
     * with `said` and Done, Needs you or Declined, and is answered with the receipts. A stopped run still reaches it.
     */
    instructions: async (args, ctx, turn) => {
      if (!surface.instructionsMine) return { result: unbuilt('instructions', 'Call context: what you were told is its first line.') };
      const sent = Object.fromEntries(
        (['take', 'reply', 'said', 'state', 'seen', 'how', 'answer', 'option'] as const).flatMap((k) => (args[k] === undefined || args[k] === null ? [] : [[k, args[k]]])),
      );
      const out = await surface.instructionsMine(sent as never, ctx);
      /* THE KERNEL SAYS `id`, the instruction, and this tool calls it `take` or `reply`. */
      if (refused(out) && out.refusal.at === 'id' && (sent.take !== undefined || sent.reply !== undefined))
        return { result: await failed({ ...out, refusal: { ...out.refusal, at: sent.take !== undefined ? 'take' : 'reply' } }, ctx, turn) };
      if (!out.ok || !isObject(out.value)) return { result: await failed(out, ctx, turn) };
      const v = out.value;
      const one = isObject(v.instruction) ? v.instruction : null;
      const receipts = isObject(v.receipts) ? v.receipts : null;
      const answered = isObject(v.answered) ? v.answered : null;
      const value = bare({
        run: v.run,
        stamp: v.stamp,
        pending: pendingOf(v.pending),
        stop: v.stop ?? null,
        ...(one === null ? {} : { instruction: { id: one.id, state: one.state, said: one.said, ...(one.reply ? { reply: one.reply } : {}) } }),
        ...(receipts === null ? {} : { receipts }),
        ...(answered === null ? {} : { answered: { question: answered.question, option: answered.option } }),
      }) as Record<string, unknown>;
      /* THE ROWS THE RUN CHANGED ARE SAID BY THEIR WORDS, read in one go per list. */
      const touched = receipts !== null && Array.isArray(receipts.batches) ? receipts.batches.filter(isObject).flatMap((b) => (Array.isArray(b.rows) ? b.rows.filter((r): r is string => typeof r === 'string') : [])) : [];
      if (turn.text && touched.length > 0) await handlesNamed(touched.slice(0, 5), ctx, turn);
      return {
        result: { ok: true, value },
        say: (look) =>
          instructionsBrief(v, typeof sent.take === 'string' ? 'take' : typeof sent.reply === 'string' ? 'reply' : typeof sent.answer === 'string' ? 'answer' : 'read', look),
      };
    },

    schema: async (args, ctx) => {
      const register = String(args.register);
      const out = await surface.schema({ register }, ctx);
      if (!out.ok) return { result: out };
      const decl = declOf(register, out.value);
      if (decl) decls.set(register, decl);
      const value = bare(out.value) as Record<string, unknown>;
      return { result: { ok: true, value }, say: () => schemaBrief(value) };
    },

    /**
     * A PREFIXED ID GOES TO THE RECORD AS SPOKEN. Which register owns `S` is the record's declarations'
     * to say, so it resolves `S42` itself, in one call, and answers a prefix no readable register holds
     * with a sentence that sends `SG` and `D` to `governance`.
     *
     * AND A ROW THAT IS NOT THERE IS REFUSED, `ROW_UNKNOWN`. The record answers `null`, which is its word for "no row you
     * may read", and a tool answered the four bytes `null` to an agent, with no `isError` and nothing to do next.
     */
    get: async (args, ctx, turn) => {
      if (args.history === true) return withHistory(args, ctx, turn);
      const at = parse(args.spoken);
      const said = typeof args.spoken === 'string' ? args.spoken.trim() : '';
      /* A ROW ID TOO, because a ref field holds one: `thing: 01M2...` was a value no tool could follow. */
      /* AN ATTACHMENT BY ITS ID, its words a slice at a time (`<id>@12000` for the next), as a row lists it below. */
      const fileAt = FILE_AT.exec(said);
      if (fileAt && fileAt[2] !== undefined) return (await fileRead(fileAt[1]!, Number(fileAt[2]), ctx, turn)) ?? { result: missing(said) };
      if (at || PREFIXED.test(said) || ROW_ID.test(said)) {
        const got = await surface.get(at ?? { spoken: said }, ctx);
        if (!got.ok) return { result: got };
        if ((got.value === null || got.value === undefined) && fileAt) return (await fileRead(fileAt[1]!, 0, ctx, turn)) ?? { result: missing(said) };
        if (got.value === null || got.value === undefined) return { result: missing(said) };
        if (!isEntry(got.value)) {
          const value = bare(got.value);
          return { result: { ok: true, value } };
        }
        /* A ROW MERGED INTO ANOTHER IS ANSWERED AS THE ONE KEPT, with the handle asked for beside it (`keptOf`). */
        const kept = await keptOf(got.value, ctx);
        const entry = kept.entry;
        const row = await entryOut(entry, ctx, turn);
        const folded = kept.from === null ? null : await addressOf(kept.from.register, kept.from.seq ?? 0, ctx);
        /* AND THE FILES PUT ON IT FOR CONTEXT, each by name, kind, size and the id `get` reads its words by. None, no key. */
        const files = await filesOn(row, ctx);
        const value = { ...fittedRow(row), ...(folded === null ? {} : { merged_from: folded }), ...(files.length === 0 ? {} : { files }) };
        return {
          result: { ok: true, value },
          say: (look) =>
            [
              ...(folded === null ? [] : [`${namedIn(titleOf(kept.from!.fields, look.decl(kept.from!.register)), folded, look)} was merged into this one:`]),
              ...rowWhole(value as Shaped, entry.register, look),
              ...(files.length === 0 ? [] : [`Files (get an id to read one): ${files.map((f) => `${f.name} (${f.kind}, ${sizeSaid(f.bytes)}) ${f.id}`).join('; ')}`]),
            ].join('\n'),
        };
      }
      /* A NAME, WHICH IS NO HANDLE AND NO FIGURE'S SHAPE: the one thing called that, else the row forms as before. */
      if (!FIGURE.test(said)) return (await byName(said, args, ctx, turn)) ?? { result: badSpoken(said === '' ? ROW_OR_ID : notNamed(said)) };
      /**
       * A FIGURE IS READ AS `braindog:metric/<id>` READS IT, through the record's `metric`, so its answer is the record's
       * whole reading and its permission is the record's. Two currencies with no rate between them are one amount each
       * and `value: null`, which is the kernel's doing and not this line's (`test/figures.test.ts`).
       *
       * A FIGURE THE RECORD DOES NOT ANSWER IS AN ID THAT NAMES NOTHING. The record says `METRIC_UNKNOWN` both for a name
       * nobody declared and for one over a list the caller cannot read, so that a name leaks nothing, and this keeps the
       * two one answer. It says it about `spoken`, with the row forms, because a bare lowercase word here is as often a
       * register typed without its number as a figure misspelt, and "there is no metric called tasks" teaches neither.
       */
      const figure = await surface.metric({ metric: said }, ctx);
      if (!figure.ok) {
        if (codeOf(figure) !== 'METRIC_UNKNOWN') return { result: figure };
        /* A LOWERCASE WORD THAT IS NO FIGURE MAY BE A NAME ("kiln"): the one thing called that answers. */
        return (await byName(said, args, ctx, turn)) ?? { result: badSpoken(`${ROW_OR_ID} A figure, a script or an automation is named by its id: record_index lists figures, list scripts and automations the rest; ${said} is none you can read.`) };
      }
      const reading = isObject(figure.value) ? figure.value : {};
      const value = bare(figure.value);
      if (!turn.text) return { result: { ok: true, value } };
      const [declared, labels] = await Promise.all([surface.figures ? surface.figures(ctx) : Promise.resolve(null), groupLabels(reading, ctx)]);
      const id = said.split(':')[0] ?? said;
      const name = declared?.ok && Array.isArray(declared.value) ? declared.value.find((f) => isObject(f) && f.id === id)?.name : undefined;
      return { result: { ok: true, value }, say: (look) => figureBrief(said, typeof name === 'string' ? name : undefined, reading, look, labels) };
    },

    /**
     * TWENTY WHEN THE CALL NAMES NO LIMIT, AND A HUNDRED AT MOST, where the record's own are fifty and five hundred. 10 §4
     * set 2,000 tokens for a page of 25, but counted as a transport sends it, every quote escaped inside the text block,
     * 25 seeded tasks cost 2,094 even with `listed`'s cuts, and twenty cost well under. A call asking more is answered a
     * hundred and a cursor, as the description says, which `mcp.test.ts` holds both figures to.
     *
     * A PAGE OF ROWS IS READ LEANER THAN ONE ROW: `listed` says what goes and why. Every row on a page is of the
     * register the call named, so that register's text fields are the ones cut.
     */
    list: async (args, ctx, turn) => {
      const register = String(args.register);
      const whole = new Set(Array.isArray(args.fields) ? args.fields.map(String) : []);
      const pageOf = (n: number) =>
        surface.list(
          {
            register,
            ...(args.where === undefined ? {} : { where: args.where }),
            limit: n,
            ...(args.cursor === undefined ? {} : { cursor: String(cursorIn(args.cursor)) }),
          },
          ctx,
        );
      /**
       * A SMALL LIST IS ANSWERED WHOLE ("about 700 tokens for his whole portfolio"). With no limit named, a list
       * of 27 projects was twenty rows and a cursor, so reading a portfolio took two calls. The first read asks for
       * sixty: an answer with no cursor is the whole list, and one with a cursor is a longer list, read as a page of
       * twenty as before. A call that names a limit or carries a cursor is a page, as it asked.
       */
      const first = args.limit === undefined && args.cursor === undefined ? await pageOf(LIST_WHOLE) : undefined;
      const small = first !== undefined && !(first.ok && isObject(first.value) && cursorOut((first.value as { cursor?: unknown }).cursor) !== undefined);
      const limit = small ? LIST_WHOLE : limitOf(args.limit, LIST_PAGE, LIST_MOST);
      const out = await fitted(limit, async (n) => {
        const got = small && n === LIST_WHOLE && first !== undefined ? first : await pageOf(n);
        if (!got.ok || !isObject(got.value) || !Array.isArray(got.value.rows)) return got as Result<{ rows: unknown[] }>;
        const entries = got.value.rows.filter(isEntry);
        /* NO READ FOR AN EMPTY PAGE'S NAME: a list with no rows is said by its id, so one `list` is still one request. */
        for (const r of new Set(entries.map((e) => e.register))) if (!prefixes.has(r)) await learnPrefix(r, ctx);
        const names = await namesIn(entries, ctx, turn);
        const texts = textFields.get(register);
        const rows = got.value.rows.map((r) => {
          if (!isEntry(r)) return r;
          const row = compact(speakRefs(r, names), prefixOf(r.register));
          const words = titleOf(r.fields, decls.get(r.register));
          if (words) turn.titles.set(String(row.spoken), words);
          return listed(row, whole, texts);
        });
        const cursor = cursorOut((got.value as { cursor?: unknown }).cursor);
        const matched = (got.value as { matched?: unknown }).matched;
        return { ok: true, value: { rows, ...(typeof matched === 'number' ? { matched } : {}), ...(cursor === undefined ? {} : { cursor }) } };
      });
      if (!out.ok) {
        /* SCRIPTS AND AUTOMATIONS ARE NO LIST OF ROWS, and an agent asks for them as one (`scripts.ts`): where the record
           holds no list of that name, they are answered from its own reads, a line each. */
        const other = codeOf(out) === 'REGISTER_UNKNOWN' ? await notRows(register, ctx) : null;
        return other ?? { result: out };
      }
      const page = out.value as Page;
      const said = { ...args, ...(args.limit === undefined ? {} : { limit: page.rows.length < limit && page.cursor !== undefined ? page.rows.length : limit }) };
      return { result: out, say: (look) => cutSaid('list', args, LIST_MOST, page, (p) => listBrief(said, p, look)) };
    },

    /* A HIT IS ITS SPOKEN ID, ITS TITLE AND ITS LIST. `rank` is a float the order already says. */
    search: async (args, ctx, turn) => {
      /* NOTHING TO LOOK FOR IS NOT "nothing found" (door audit D30): an empty search answered as if it had looked. */
      if (String(args.q ?? '').trim() === '')
        return { result: { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'q is the words to look for, and this one is empty. To read a list whole, list it.', at: 'q', try: callOf('record_index') } as Refusal } };
      const found = await surface.search({ q: String(args.q ?? ''), ...(args.limit === undefined ? {} : { limit: Number(args.limit) }) }, ctx);
      if (!found.ok) return { result: found };
      /**
       * AND HOW MANY MATCHED IS PART OF THE ANSWER, because an agent is the caller least able to tell a
       * hundred from a hundred-of-five-hundred-and-seventy-seven. The record clamps a search at a hundred
       * hits, so an agent that asked a broad question and got a hundred rows has no way to know it is
       * reading a corner of the answer unless the count is said.
       *
       * BOTH SHAPES ARE READ. A record built before the count existed answers a bare array, and this server
       * is deployed separately from the record it talks to. The old shape keeps the old answer rather than
       * reporting a total of zero, which would be a number that is not true.
       */
      const hits = Array.isArray(found.value) ? found.value : isObject(found.value) && Array.isArray(found.value.hits) ? found.value.hits : null;
      if (hits === null) return { result: { ok: true, value: bare(found.value) } };
      const matched = !Array.isArray(found.value) && isObject(found.value) && isObject(found.value.matched) ? (found.value.matched as Record<string, number>) : null;
      /* NAMED AS EVERY OTHER TOOL NAMES A ROW. This built `register#seq` itself, so on the seed `create` answered `LN8`
         and `search` for its words answered `learnings#8`: two names for one row, a line apart in one session. AND WHICH
         LIST IT IS IN, because "braindog" matched a run, a tool, a project and a skill on the owner's record, each titled
         the same word, and nothing said which was which. */
      const rows: unknown[] = [];
      for (const hit of hits as unknown[]) {
        if (!(isObject(hit) && typeof hit.register === 'string' && typeof hit.seq === 'number')) {
          rows.push(hit);
          continue;
        }
        const spoken = await addressOf(hit.register, hit.seq, ctx);
        if (typeof hit.title === 'string' && hit.title !== '') turn.titles.set(spoken, hit.title);
        rows.push(bare({ spoken, title: hit.title, register: hit.register }));
      }
      const total = matched === null ? undefined : Object.values(matched).reduce((a, b) => a + b, 0);
      const page: Page = { rows, ...(total === undefined ? {} : { matched: total }) };
      return { result: { ok: true, value: page }, say: (look) => searchBrief(args, page, look, SEARCH_MOST) };
    },

    /**
     * THE WRITES THAT MADE ONE ROW, IN THE ONE ENVELOPE, `{ rows, matched }`, each line addressed and with its empty
     * fields gone, as `activity`'s are. It answered the record's bare array, nulls and all: five lines of one run's
     * history measured 14 nulls and 6 row ids on the owner's record.
     */
    history: async (args, ctx, turn) => {
      const at = await locate(args.spoken, ctx, { tool: 'get', args: { spoken: args.spoken, history: true } });
      if (!at.ok) return { result: at };
      const out = await surface.history(at.value, ctx);
      if (!out.ok) return { result: out };
      const events = (Array.isArray(out.value) ? out.value : []).filter(isObject).map((e) => spoke(e, prefixOf));
      const value = bare({ rows: events, matched: events.length }) as Page;
      if (!turn.text && events.length > 0) return { result: { ok: true, value } };
      /* THE ROW'S OWN WORDS AND ITS NAME FOR THE HEAD LINE, read only when the answer is said in words: a line of the log
         carries neither, and `S1` is how the person says the run `session#1` is. */
      if (turn.text && !prefixes.has(at.value.register)) await learnPrefix(at.value.register, ctx);
      const row = await surface.get(at.value, ctx);
      /* A ROW WITH NO HISTORY THAT `get` ANSWERS `null` FOR IS NOT THERE, and is refused as `get` refuses it. The record
         answers an empty history for a row deleted, never made, or held back, and `history tasks#999` said "0 changes"
         where `get tasks#999` said `ROW_UNKNOWN`: the same row, two answers. Every row has the line that made it. */
      if (events.length === 0 && row.ok && (row.value === null || row.value === undefined)) return { result: missing(String(args.spoken).trim()) };
      if (!turn.text) return { result: { ok: true, value } };
      const spoken = typeof args.spoken === 'string' && PREFIXED.test(args.spoken.trim()) ? args.spoken.trim() : spokenOf(at.value.register, at.value.seq);
      const words = row.ok && isEntry(row.value) ? titleOf(row.value.fields, decls.get(at.value.register)) : '';
      /* A LINK THAT CHANGED IS SAID BY THE TWO ROWS' NAMES, so they are named before the lines are said. */
      await handlesNamed(linksIn(events, () => at.value.register), ctx, turn);
      return {
        result: { ok: true, value },
        say: (look) => historyBrief(spoken, at.value.register, words, value, look),
        names: { people: peopleIn(events), runs: actorsIn(events) },
      };
    },

    /**
     * THE RECORD'S LOG, A PAGE AT A TIME, newest first, in the one envelope: twenty lines when the call names no limit and
     * a hundred at most, and the cursor for the page below.
     *
     * A CURSOR NOW, where it took a limit alone. Paging the whole log was the app's, so an agent picking up after another
     * session read the newest fifty and could ask for no more: measured on the owner's record, those fifty were 13 KB and
     * 176 of the last 200 lines were the twelve-hour sweep closing runs. The record now leaves its own bookkeeping out
     * (the sweep, a run's daily seen stamp), and `everything: true` asks for it back.
     */
    activity: async (args, ctx, turn) => {
      if (!surface.recentHistory)
        return { result: unbuilt('activity', 'Call history with a row you already know about, or context for where things stand.') };
      const read = surface.recentHistory.bind(surface);
      const limit = limitOf(args.limit, ACTIVITY_PAGE, ACTIVITY_MOST);
      /* EACH LINE'S LIST, which its spoken id stands for in the answer and the brief still needs for the field's label. */
      let lists: (string | undefined)[] = [];
      const out = await fitted(limit, async (n) => {
        const got = await read(
          {
            limit: n,
            ...(args.cursor === undefined ? {} : { cursor: cursorIn(args.cursor) as number | string }),
            ...(args.everything === undefined ? {} : { everything: args.everything as boolean }),
          },
          ctx,
        );
        if (!got.ok || !isObject(got.value) || !Array.isArray(got.value.events)) return got as Result<{ rows: unknown[] }>;
        const lines = got.value.events.filter(isObject);
        lists = lines.map((e) => (typeof e.register === 'string' ? e.register : undefined));
        for (const r of new Set(lines.map((e) => e.register).filter((x): x is string => typeof x === 'string'))) if (!prefixes.has(r)) await learnPrefix(r, ctx);
        const rows = lines.map((e) => spoke(e, prefixOf));
        for (const e of rows) if (typeof e.spoken === 'string' && typeof e.title === 'string' && e.title !== '') turn.titles.set(e.spoken, e.title);
        const cursor = cursorOut(got.value.cursor);
        return { ok: true, value: bare({ rows, ...(cursor === undefined ? {} : { cursor }) }) as { rows: unknown[] } };
      });
      if (!out.ok) return { result: out };
      const page = out.value as Page;
      /* AND A CHANGED LINK IS SAID AS A HISTORY SAYS IT, each line by its own list. */
      if (turn.text) await handlesNamed(linksIn(page.rows.filter(isObject), (_e, i) => lists[i]), ctx, turn);
      /* A QUESTION OR A DECISION BY ITS OWN WORDS: "settled a question · a question (SG11)" named nothing (AK15). */
      if (turn.text) await questionsNamed(page.rows.filter(isObject), ctx, turn);
      return { result: out, say: (look) => cutSaid('activity', args, ACTIVITY_MOST, page, (p) => activityBrief(args, p, look, lists)), names: { people: peopleIn(page.rows), runs: actorsIn(page.rows) } };
    },

    /**
     * A LIST IS EACH QUESTION WITHOUT ITS BODY, in the one envelope, and one by id is whole. A `rowset` body carries every
     * field it would write, and the seeded queue's one proposal to change a page's note was four kilobytes of markdown in a
     * list an agent reads to learn what is waiting. Empty fields go too.
     *
     * A PAGE ENDS ON A CURSOR WHEN THERE IS MORE, which is the id of the last question on it, the record's own cursor. It
     * answered a bare array with no total and no way on, while the tool took a cursor. One more is asked than is shown, so
     * a page that is the last says so by having none.
     */
    governance: async (args, ctx, turn) => {
      const register = typeof args.register === 'string' ? args.register : 'suggestion';
      if (args.id !== undefined) {
        const one = await surface.governance(args as never, ctx);
        if (!one.ok) return { result: one };
        if (one.value === null || one.value === undefined) {
          const id = String(args.id);
          return {
            result: {
              ok: false,
              refusal: taught(
                { code: 'ROW_UNKNOWN', fix: `There is no ${id} that you can read. It may have been answered and removed, or be about a list you cannot open.`, at: 'id' },
                callOf('governance', { register, status: 'all' }),
              ),
            },
          };
        }
        const value = bare(one.value) as Record<string, unknown>;
        if (turn.text) await handlesNamed(questionHandles([value]), ctx, turn);
        return { result: { ok: true, value }, say: (look) => governanceBrief(args, value, look), names: { people: true, runs: actorsIn([value]) } };
      }
      const limit = limitOf(args.limit, GOVERNANCE_PAGE, GOVERNANCE_MOST);
      /* ONE READ, CUT HERE TO FIT (bench 24 Oct). `fitted` asked the record again with fewer rows, and every read
         worked out every question's card again, a script's backfill of two hundred rows among them: on his record a page
         of the queue was read twice and three times to answer two questions, which made `governance` twice `record_index`.
         The cursor is the last row kept, so the rows a smaller read would have answered are exactly these. */
      const out = await (async (): Promise<Result<{ rows: unknown[]; cursor?: string }>> => {
        const n = limit;
        /* ONE MORE THAN THE PAGE, and a limit under 1 as sent, so the record refuses it rather than answering one. */
        const got = await surface.governance({ ...args, limit: typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n + 1 : n } as never, ctx);
        if (!got.ok || !Array.isArray(got.value)) return got as Result<{ rows: unknown[] }>;
        /* ONE QUESTION ASKED BY ID KEEPS ITS OPTIONS (never the rest of the body), so the decision card can draw its buttons. */
        const all = got.value.map((row: unknown) => {
          if (!isObject(row)) return row;
          const kept = bare(Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'body'))) as Record<string, unknown>;
          const options = args.id !== undefined && isObject(row.body) && Array.isArray(row.body.options) ? row.body.options : undefined;
          return options === undefined ? kept : { ...kept, options };
        });
        const rows = fitRows(all.slice(0, n));
        const last = rows.at(-1);
        const cursor = all.length > rows.length && isObject(last) && typeof last.id === 'string' ? last.id : undefined;
        return { ok: true, value: { rows, ...(cursor === undefined ? {} : { cursor }) } };
      })();
      if (!out.ok) return { result: out };
      /* HOW MANY WAIT IS THE RECORD'S COUNT, for the one page it counts: the open questions, which is the default. */
      const open = register === 'suggestion' && (args.status === undefined || args.status === 'open');
      let page = out.value as Page;
      if (open && args.cursor === undefined) {
        const boot = await bootOf(ctx, turn);
        const counts = boot.ok && isObject(boot.value) && isObject(boot.value.counts) ? boot.value.counts : {};
        if (typeof counts.decide === 'number') page = { ...page, matched: Math.max(counts.decide, page.rows.length) };
      }
      const value = { rows: page.rows, ...(page.matched === undefined ? {} : { matched: page.matched }), ...(page.cursor === undefined ? {} : { cursor: page.cursor }) };
      /* THE ROWS THE QUESTIONS NAME, read so each is said in words beside its handle (`plainOf`): "Are people#3 and
         people#9 the same person" is the kernel's own sentence, and the agent relaying it had two numbers to pass on. */
      if (turn.text) await handlesNamed(questionHandles(value.rows), ctx, turn);
      return {
        result: { ok: true, value },
        say: (look) => cutSaid('governance', args, GOVERNANCE_MOST, value, (p) => governanceBrief(args, p as typeof value, look)),
        names: { people: true, runs: actorsIn(value.rows) },
      };
    },

    /**
     * AND THERE IS NO `decide` TOOL, deliberately. `decide` is a rung no token reaches (ADR-060), so
     * a tool for it could only ever refuse, and a tool that always refuses is a tool an agent spends
     * its turns discovering.
     *
     * AND A RULE CHANGE COMES BACK WITH ITS DRY RUN. `dry_run` was taken off
     * the tool list because only a person installed a rule; an agent now writes automations, so what one would do is
     * said here, on the answer to the call that filed it, which costs the list nothing. It is the record's own `dryRun`,
     * the one Decide reads, so the agent and the owner read one account of it. Asked after the filing, so a body the
     * record refuses is refused in the record's words and never previewed.
     *
     * AND A SCRIPT CHANGE THAT SAYS `"try"` IS TRIED INSTEAD OF FILED (`trial` above), and one that does not is filed
     * and never run: a trial fetches and is counted as a run, so it happens only when the agent asks for it. A PAGE
     * CHANGE THAT SAYS `"try"` IS DRAWN INSTEAD OF FILED by the same branch (`preview` above), answered `page_preview`.
     */
    propose: async (args, ctx, turn) => {
      /* A WIDGET LANDS ON TODAY AS A DRAFT, NOT A QUESTION (`widgetDraft` in the record), and its receipt's way back is
         withdrawing that draft by its key while it is still one. */
      const widgetBack = typeof args.withdraw === 'string' && args.withdraw.startsWith('widget:') ? args.withdraw.slice('widget:'.length) : null;
      if (widgetBack !== null || args.body_kind === 'widget') {
        const out = await surface.propose((widgetBack !== null ? { body_kind: 'widget', body: { withdraw: widgetBack } } : args) as never, ctx);
        if (!out.ok || !isObject(out.value)) return { result: out };
        const value = out.value;
        if (widgetBack === null && typeof value.withdraw === 'string') turn.asks = value.withdraw;
        return { result: { ok: true, value }, say: () => (typeof value.said === 'string' ? value.said : 'Done.') };
      }
      if (args.withdraw !== undefined) return withdrawn(args, ctx);
      if (args.body_kind === 'change' && isObject(args.body) && args.body.try !== undefined) {
        const tried = await trial(args.body, ctx);
        /* A TRIAL IS SAID WHOLE, because it is what the agent asked to see and nobody else reads it: the writes a script
           would make, the page drawn, each step of a rule. Held to one answer's size like everything else. */
        return { result: tried, say: () => trialSaid(tried) };
      }
      const body = !isObject(args.body)
        ? args.body
        : args.body_kind === 'rowset'
          ? await rowset(args.body, ctx)
          : args.body_kind === 'change'
            ? change(args.body)
            : args.body;
      const filed = await decideAt(await surface.propose({ ...args, ...(body === undefined ? {} : { body }) } as never, ctx), ctx, turn);
      const question = typeof args.question === 'string' ? args.question : '';
      if (!filed.ok || !isObject(filed.value)) return { result: filed };
      /* ANSWERED FROM MEMORY (govern-47): the person already declined this or picked an option, so nothing was filed and
         the agent passes on what they said, the day and the reason, and how to ask again (the record's `said`). */
      if (isObject(filed.value.answered)) {
        const told = typeof filed.value.said === 'string' ? filed.value.said : '';
        return { result: { ok: true, value: bare(filed.value) }, say: () => told };
      }
      /* AN OPEN QUESTION WITH THIS CAUSE WAS JOINED AND NOTHING WAS FILED, so the answer names the one waiting and never
         says "Asked": the agent asks nobody twice, and passes on the question already there. Nothing new is dry run. */
      if (filed.value.joined === true) {
        const joined = bare(filed.value) as Record<string, unknown>;
        const waiting = typeof joined.id === 'string' ? ((await askedAs(joined.id, ctx)) ?? question) : question;
        return { result: { ok: true, value: joined }, say: (look) => joinedSaid(joined, waiting, look), names: { people: true } };
      }
      let value: Record<string, unknown> = filed.value;
      const rule = args.body_kind === 'change' && isObject(body) ? ruleIn(body) : null;
      if (rule !== null && surface.dryRun) {
        const dry = await surface.dryRun({ rule }, ctx);
        value = { ...value, dry_run: dry.ok ? dry.value : { refused: 'refusal' in dry ? dry.refusal : dry } };
      }
      const out = bare(value) as Record<string, unknown>;
      if (typeof out.id === 'string' && /^SG[1-9][0-9]*$/u.test(out.id)) turn.asks = out.id;
      /* A PROPOSAL THE AGENT'S RUNG LET THROUGH IS DONE, NOT ASKED: the record answered it as the ladder (`rule:ladder`)
         and says so with `landed: true` (or `rung`), so "Asked" would send the agent to wait on a question nobody will see. */
      const ruled = ruledOf(out);
      const lists = isObject(body) && typeof body.register === 'string' ? [body.register] : [];
      for (const list of ruled === null ? [] : lists) if (!prefixes.has(list)) await learnPrefix(list, ctx);
      /* THE ROWS THE QUESTION NAMES ARE READ BEFORE IT IS SAID, so a handle or an id in it is said by its words with the
         handle beside them, never alone. */
      const dry = out.dry_run === undefined ? null : clip(JSON.stringify(out.dry_run), 1_500);
      /* AND A CHANGE'S HANDLES BEFORE AND AFTER, so `changesSaid` says a ref field moved by its words rather than leave it
         to the page. Only handles: a row id there is never said, so it is not worth a read. */
      const moved = (Array.isArray(out.changes) ? out.changes : [])
        .flatMap((c) => (isObject(c) ? [c.before, c.after] : []))
        .filter((v): v is string => typeof v === 'string' && /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u.test(v.trim()));
      if (turn.text) await handlesNamed(handlesIn([question, ruled !== null && 'filed' in ruled ? `${ruled.filed.question} ${ruled.filed.why ?? ''}` : '', dry ?? '', ...moved].join(' ')), ctx, turn);
      return {
        result: { ok: true, value: out },
        say: (look) =>
          [
            ruled !== null && 'rung' in ruled ? ruledBrief(ruled, lists, look) : proposedBrief(out, question, look),
            ...(dry === null ? [] : [`What it would do: ${plainOf(dry, look, false)}`]),
          ].join('\n'),
        names: { people: true },
      };
    },

    /**
     * THE FIELDS GO TO THE RECORD AS SENT, a prefixed ref among them, because the record reads `LN8` itself.
     *
     * THIS PACKAGE QUALIFIED A PREFIX HERE AND IN `update`, and `propose`'s `rowset` was the third writer of a row and
     * went round it: a skill's `because: ["LN6"]`, as `get` answers it, was filed and then refused at the owner's accept
     * A reader at each tool is a reader some tool lacks, so there is one, in `coerce.ts`,
     * which every write reaches, the accept of a rowset among them. `refs-round-trip.test.ts` sends every ref any tool
     * answers back through every tool that writes.
     */
    create: async (args, ctx, turn) => {
      const register = String(args.register);
      const made = await surface.create(
        {
          register,
          fields: (args.fields ?? {}) as Args,
          ...(args.note === undefined ? {} : { note: String(args.note) }),
          ...(args.op_id === undefined ? {} : { op_id: String(args.op_id) }),
          ...(args.said === undefined || args.said === null ? {} : { said: String(args.said) }),
        },
        ctx,
      );
      return wrote(made, 'Added', ctx, turn);
    },

    update: async (args, ctx, turn) => {
      const at = await locate(args.spoken, ctx, { tool: 'update', args });
      if (!at.ok) return { result: at };
      /* AN EMPTY PATCH IS REFUSED BEFORE THE LADDER (§6.1): on the seed it wrote a version and a receipt for a
         change of nothing, and on his record the ladder filed it as a question and refused it in the question's terms. A
         note with nothing to change is `log`, which is what this sends it to. */
      if (isObject(args.patch) && Object.keys(args.patch).length === 0) {
        const note = typeof args.note === 'string' && args.note.trim() !== '' ? args.note : null;
        return {
          result: {
            ok: false,
            refusal: {
              code: 'PATCH_EMPTY',
              fix: note === null ? 'patch is empty, so nothing would change. Put the fields to change in it, as {"state":"done"}.' : 'patch is empty; a note alone is log, which changes nothing else.',
              at: 'patch',
              ...(note === null ? {} : { try: callOf('log', { ...(args.spoken === undefined ? {} : { spoken: args.spoken }), note }) }),
            } as Refusal,
          },
        };
      }
      const changed = await surface.update(
        {
          ...at.value,
          patch: (args.patch ?? {}) as Args,
          ...(args.version === undefined ? {} : { version: Number(args.version) }),
          ...(args.note === undefined ? {} : { note: String(args.note) }),
          ...(args.op_id === undefined ? {} : { op_id: String(args.op_id) }),
          ...(args.said === undefined || args.said === null ? {} : { said: String(args.said) }),
        },
        ctx,
      );
      return wrote(noRow(changed, args.spoken), 'Changed', ctx, turn);
    },

    /**
     * A note changes nothing about the row and is still a write, because the record keeps what was
     * said. It goes through `update` with an empty patch, so it answers to the same permission and
     * lands in the same history.
     *
     * `log` ANSWERS WHAT IT WROTE: the row's name, the version the note left it at, and when. It answered the whole
     * row, so on the seed a one-line note on Kiln, whose note is its write-up, answered 6,610 bytes for a 5,889-byte
     * note, and `log` is the tool agents call most. The note changed no field,
     * so the fields were the one thing in that answer the agent already had. The version stays because the next
     * `update` needs it, and a refusal passes through whole.
     */
    log: async (args, ctx, turn) => {
      if (args.page !== undefined && args.page !== null) return pageOn(args, ctx, turn);
      const note = String(args.note ?? '').trim();
      if (!note) return { result: { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'A note is one sentence, and this one is empty.', at: 'note' } } };
      /* THE LEDGER'S CEILING, AS THE RECORD'S OWN `log` HOLDS IT (audit 10k, AK9). This door goes through `update` and
         `handoff`, which took a note of any length, so the 280 the docs promise held over HTTP and not here. */
      /* A LONGER NOTE IS KEPT AS SEVERAL, IN ORDER (the 1 Nov cleanup run: a run's summary could not be logged at all), up
         to `NOTE_LONG`; past that it is a page, which `log` with `page` hangs on the same row. */
      if (note.length > NOTE_LONG)
        return {
          result: {
            ok: false,
            refusal: {
              code: 'OUT_OF_BOUNDS',
              fix: `A note is at most ${String(NOTE_LONG)} characters, kept as notes of ${String(NOTE_MOST)}, and this one is ${String(note.length)}. Split it into calls, or send the whole as page (HTML) on log.`,
              at: 'note',
            },
          },
        };
      const parts = note.length > NOTE_MOST ? notesOf(note) : [note];
      for (const part of parts.slice(0, -1)) {
        const first = await logOne(args, part, ctx, turn);
        if (!first.result.ok) return first;
      }
      return logOne(args, parts.at(-1)!, ctx, turn);
    },
    /* The arguments go through whole: which fields a session may set, and how `tried` appends, are
       the record's rules, and it names the field when one is wrong.
       ITS RECEIPT OFFERS AN UNDO ONLY WHEN ONE WOULD PUT SOMETHING BACK (audit 10k, AK10): a run's own step, doing and
       notes are bookkeeping undo never touches, so a handoff that wrote only those offered a batch that answered "That
       change left nothing that can be put back". A task it started or closed still has its undo. */
    handoff: async (args, ctx, turn) => {
      if (!surface.handoff) return { result: unbuilt('handoff', 'Log the next step on the task you are working on instead.') };
      const out = await surface.handoff(args, ctx);
      /* A REFUSAL NAMES THE FIELD THE CALLER SENT: the kernel says `left`, the run whose step it is, and this tool calls
         that field `take` or `drop`. */
      if (!out.ok && 'refusal' in out && out.refusal.at === 'left' && (args.take !== undefined || args.drop !== undefined))
        return { result: await failed({ ...out, refusal: { ...out.refusal, at: args.take !== undefined ? 'take' : 'drop' } }, ctx, turn) };
      if (!out.ok) return { result: await failed(out, ctx, turn) };
      turn.batch = await undoable(batchIn(out.value), ctx);
      /* A STEP TAKEN OR DROPPED answers the run that left it and its words, not a run's row: said as what now
         happens to it. The second of two sessions racing for one step was refused above, in the record's sentence. */
      if (isObject(out.value) && typeof out.value.left === 'string' && typeof out.value.next === 'string' && !isEntry(out.value)) {
        const step = out.value as { left: string; next: string; agent?: string | null };
        const value = bare(step);
        return { result: { ok: true, value }, say: () => stepSaid(step, args.take !== undefined) };
      }
      if (!isEntry(out.value)) return { result: { ok: true, value: bare(out.value) } };
      /* THE TASK IT STARTED OR CLOSED, said after the run's line, so a finished task is one call. */
      const task = isObject((out.value as { task?: unknown }).task) ? ((out.value as { task?: unknown }).task as Record<string, unknown>) : null;
      const row = await entryOut(out.value, ctx, turn);
      const value = task === null ? row : { ...row, task: bare(task) };
      return {
        result: { ok: true, value },
        say: () => [handoffBrief(row as Shaped), ...(task === null ? [] : [handedBrief(task, args.done !== undefined)])].join('\n'),
      };
    },

    /**
     * WHO WAS MET, SAID BY NAME WITH HOW THEY WERE MATCHED, and the row kept for them read whole, so the answer can say
     * which organisation and projects they are with and never a duplicate that was folded away.
     *
     * BOTH ANSWERS THE RECORD GIVES ARE READ: the contract's `{ row, created, matched_by, question, mention }`
     * and the older `{ person, created, linked, merge }`, because this server is deployed
     * apart from the record it talks to. The row id the newer one carries is not passed on; the handle is.
     *
     * A ROW FOLDED INTO ANOTHER IS FOLLOWED TO THE ONE KEPT (`keptOf`), as `get` follows it, so an agent never meets a
     * person who was merged away and writes to them.
     */
    meet: async (args, ctx, turn) => {
      if (!surface.meet) return { result: unbuilt('meet', 'If there is a people register, add the person there with create.') };
      const out = await surface.meet(args, ctx);
      if (!out.ok || !isObject(out.value)) return { result: out };
      turn.batch = batchIn(out.value);
      const raw = bare(out.value) as Record<string, unknown>;
      const row = isObject(raw.row) ? raw.row : null;
      let spoken: string | null =
        row && typeof row.register === 'string' && typeof row.seq === 'number'
          ? await addressOf(row.register, row.seq, ctx)
          : typeof raw.person === 'string' && raw.person !== ''
            ? raw.person
            : null;
      let words = row && typeof row.name === 'string' ? row.name : '';
      let mergedFrom: string | null = null;
      let mergedName = '';
      const about: string[] = [];
      if (spoken !== null) {
        const got = await surface.get(parse(spoken) ?? { spoken }, ctx);
        if (got.ok && isEntry(got.value)) {
          const kept = await keptOf(got.value, ctx);
          const shaped = await entryOut(kept.entry, ctx, turn);
          if (kept.from) {
            mergedFrom = spoken;
            mergedName = titleOf(kept.from.fields, decls.get(kept.from.register));
          }
          spoken = String(shaped.spoken);
          words = titleOf(kept.entry.fields, decls.get(kept.entry.register)) || words;
          const fields = isObject(shaped.fields) ? shaped.fields : {};
          for (const id of WITH_FIELDS)
            for (const h of Array.isArray(fields[id]) ? fields[id] : [fields[id]]) {
              const named = typeof h === 'string' ? turn.titles.get(h) : undefined;
              if (named && !about.includes(named)) about.push(named);
            }
        }
      }
      const said = typeof args.name === 'string' ? args.name.trim() : '';
      const asked = typeof raw.question === 'string' && raw.question !== '' ? raw.question : typeof raw.merge === 'string' && raw.merge !== '' ? raw.merge : null;
      /* A QUESTION IS ITS HANDLE, `SG7`, from either answer, or its own words where the record sent those instead. */
      const question = asked !== null && /^SG[1-9][0-9]*$/u.test(asked) ? asked : null;
      let questionWords = asked !== null && question === null ? asked : null;
      const mention = raw.mention === true;
      let on: string | null = null;
      if (turn.text) {
        if (question !== null) {
          const read = await surface.governance({ register: 'suggestion', id: question } as never, ctx);
          questionWords = read?.ok && isObject(read.value) && typeof read.value.question === 'string' ? read.value.question : null;
          if (questionWords !== null) turn.titles.set(question, questionWords);
        }
        if (questionWords !== null) await handlesNamed(handlesIn(questionWords), ctx, turn);
        /* A NAME ALONE IS NOTED ON THE CALLER'S PROJECT, which is said by name: "Noted Wren on Lanternfish". */
        if (mention && surface.context) {
          const c = await surface.context({} as never, ctx);
          on = c.ok && isObject(c.value) && isObject(c.value.project) && typeof c.value.project.name === 'string' ? c.value.project.name : null;
        }
      }
      const how = matchedHow(raw, args);
      const value: Record<string, unknown> = {
        ...(spoken === null ? {} : { person: spoken }),
        ...(words ? { name: words } : {}),
        created: raw.created === true,
        ...(typeof raw.matched_by === 'string' ? { matched_by: raw.matched_by } : {}),
        ...(how === null ? {} : { how }),
        ...(typeof raw.confidence === 'number' ? { confidence: raw.confidence } : {}),
        ...(mention ? { mention: true } : {}),
        ...(question === null ? {} : { question }),
        ...(raw.linked === true ? { linked: true } : {}),
        ...(mergedFrom === null ? {} : { merged_from: mergedFrom }),
        ...(about.length > 0 ? { with: about } : {}),
      };
      const met: MetSaid = {
        ...(value as MetSaid),
        said,
        kind: args.kind === 'organisation' ? 'organisation' : 'person',
        ...(questionWords === null ? {} : { asked: questionWords }),
        ...(on === null ? {} : { on }),
        ...(mergedName ? { merged_name: mergedName } : {}),
      };
      return { result: { ok: true, value }, say: (look) => metBrief(met, look), names: { people: questionWords !== null } };
    },

    /**
     * A WRITE TAKEN BACK BY THE RECEIPT IT GAVE. The record plans and applies in one call and refuses a batch that is
     * not the caller's run's (`FORBIDDEN`), so what is said here is only what went back, in the record's own lines.
     */
    undo: async (args, ctx, turn) => {
      if (!surface.undoOwn) return { result: unbuilt('undo', 'Ask the owner to put it back from the app.') };
      const out = await surface.undoOwn({ batch: String(args.batch ?? ''), ...(args.dry === true ? { dry: true } : {}) }, ctx);
      if (!out.ok) return { result: await failed(out, ctx, turn) };
      const v = bare(out.value) as Record<string, unknown>;
      const lines = (Array.isArray(v.lines) ? v.lines : []).filter((l): l is string => typeof l === 'string').slice(0, 12);
      const value = { ...v, ...(args.dry === true ? {} : { undone: true }) };
      return { result: { ok: true, value }, say: () => [typeof v.say === 'string' ? v.say : 'Done.', ...lines].join('\n') };
    },

    /**
     * ANY CALL THE APP MAKES, BY ITS NAME (`act.ts`). The name is held to the record's own table and to what this door
     * never makes; the arguments go to the record as sent, through the handler the app's `/api/<call>` runs, with the
     * caller's own context, so the record's gates, the ladder and its receipts are the app's. A write the ladder filed is
     * answered as `create`'s is, the question and its link; a row as a row; anything else as the record said it.
     *
     * A CALL ONLY AN OWNER IN A BROWSER MAKES, REFUSED SO, IS ASKED INSTEAD WHERE A QUESTION CAN SAY IT (`ASKS`, and
     * `keyAsk` for a key), through `propose` with the caller's own context: filed on Decide, or landed at once where his
     * rung and his switches let it. Nothing is asked for a call refused for any other reason.
     */
    act: async (args, ctx, turn) => {
      const name = typeof args.call === 'string' ? args.call.trim() : '';
      const sent = args.args === undefined || args.args === null ? {} : args.args;
      if (!isObject(sent)) return { result: { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'args is an object: the call\'s own arguments, as braindog:calls names them.', at: 'args' } } };
      if (!surface.call || !surface.calls) return { result: unbuilt('act', 'Use the other tools, or ask the owner to do it from the app.') };
      const rows = surface.calls();
      /* `calls` IS THIS DOOR'S OWN, the list a client that reads no resources never saw (`callsFound`). */
      if (name === 'calls' && !rows.some((r) => r.name === 'calls')) {
        const q = typeof sent.q === 'string' ? sent.q : '';
        /* AND THE TOOLS INSTALLED ADD-ONS GIVE, each `addon.<id>.<tool>` with what it says (`addonTools`). */
        const found = callsFound([...rows, ...(await addonTools(ctx))], q);
        return { result: { ok: true, value: { calls: found.split('\n') } }, say: () => found };
      }
      /* AN ADD-ON'S OWN TOOL, `addon.<id>.<tool>`, started through the record's `addonTool` with the arguments as sent. */
      const tool = /^addon\.([a-z][a-z0-9-]{0,62})\.([a-z][a-z0-9_-]{0,31})$/u.exec(name);
      if (tool !== null && rows.some((r) => r.name === 'addonTool')) {
        const ran = await surface.call('addonTool', { addon: tool[1], tool: tool[2], args: sent }, ctx);
        if (!ran.ok) return { result: await failed(ran, ctx, turn) };
        const value = bare(ran.value);
        const said = isObject(value) && typeof value.say === 'string' ? value.say : null;
        return { result: { ok: true, value }, ...(said === null ? {} : { say: () => said }) };
      }
      const row = rows.find((r) => r.name === name);
      if (row === undefined || !doorTakes(row)) return { result: { ok: false, refusal: notADoor(name, rows) } };
      /* `undoOwn` IS `undo`'s, and answered in its words. */
      if (name === 'undoOwn') return run.undo!(sent, ctx, turn);
      const out = await surface.call(name, sent, ctx);
      if (!out.ok) {
        const refusal = 'refusal' in out ? out.refusal : null;
        if (refusal?.code === 'NEEDS_BROWSER_SESSION') {
          let ask: Ask | null = Object.hasOwn(ASKS, name) ? ASKS[name]!(sent) : null;
          if (ask === null && name === 'revokeGrant' && typeof sent.id === 'string' && sent.id.trim() !== '') {
            const key = await surface.get({ spoken: sent.id.trim() }, ctx);
            if (key.ok && isEntry(key.value) && key.value.register === 'credentials') {
              if (!prefixes.has('credentials')) await learnPrefix('credentials', ctx);
              const words = titleOf(key.value.fields, decls.get('credentials'));
              const spoken = key.value.seq === null ? key.value.id : spokenOf('credentials', key.value.seq);
              ask = keyAsk({ spoken, version: key.value.version, name: words || null });
            }
          }
          if (ask !== null) {
            const asked = await run.propose!({ question: ask.question, body_kind: ask.body_kind, body: ask.body, cause: ask.cause }, ctx, turn);
            /* AND A QUESTION THE RECORD WOULD NOT FILE SAYS WHY, in its words: an add-on made here asked for by its id is
               refused with how to send its new file, which "open this from the app" never told the agent. */
            if (asked.result.ok || !('refusal' in asked.result) || asked.result.refusal?.code !== 'NEEDS_BROWSER_SESSION') return asked;
          }
        }
        return { result: await failed(out, ctx, turn) };
      }
      turn.batch = batchIn(out.value);
      const ruled = ruledOf(out.value);
      if (ruled !== null && 'filed' in ruled && !isEntry(out.value)) return filedOut(ruled.filed, ctx, turn);
      if (isEntry(out.value)) return wrote(out, 'Changed', ctx, turn);
      /* EVERY SCRIPT OR EVERY AUTOMATION, A LINE EACH, as `list` says them (`scripts.ts`): the JSON was 19 and 43 KB. */
      if ((name === 'scripts' || (name === 'automations' && sent.rule === undefined)) && Array.isArray(out.value)) {
        const rows = out.value.filter(isObject);
        return { result: { ok: true, value: bare(out.value) }, say: () => (name === 'scripts' ? scriptsBrief(rows) : rulesBrief(rows)) };
      }
      if (name === 'automations' && isObject(out.value) && typeof out.value.rule === 'string') {
        const one = out.value;
        return { result: { ok: true, value: bare(one) }, say: (look) => ruleBrief(one, look.now) };
      }
      const value = bare(out.value);
      const say = isObject(value) && typeof value.say === 'string' ? value.say : null;
      return { result: { ok: true, value }, ...(say === null ? {} : { say: () => say }) };
    },

    /**
     * THE ARGUMENTS GO TO THE RECORD AS SENT, and who may triage is the record's to say: a token without the `inbox` reach
     * is refused there in one sentence naming what it lacks, and a field it does not take is named in `FIELD_UNKNOWN`.
     *
     * THE ROW IT FILED IS NAMED AS EVERY OTHER TOOL NAMES A ROW. The record answers the arrival's id and state beside the
     * row it became, whole, so the row is made compact here with its register's prefix, and the agent reads `LN8` where
     * `create` would have said `LN8` for the same row.
     */
    triage: async (args, ctx, turn) => {
      if (!surface.triage) return { result: unbuilt('triage', 'Read braindog:inbox, and tell the person what is waiting there.') };
      const settled = await surface.triage(args as never, ctx);
      if (!settled.ok || !isObject(settled.value)) return { result: settled };
      turn.batch = batchIn(settled.value);
      const filed = settled.value.entry;
      if (!isEntry(filed)) {
        const value = bare(settled.value) as Record<string, unknown>;
        return { result: { ok: true, value }, say: (look) => triagedBrief(value, null, undefined, look) };
      }
      const entry = await entryOut(filed, ctx, turn);
      const value = bare({ ...settled.value, entry }) as Record<string, unknown>;
      return { result: { ok: true, value }, say: (look) => triagedBrief(value, entry as Shaped, filed.register, look) };
    },
  };

  /**
   * The tools the add-ons that are on give, as rows of the call table (`addon.<id>.<tool>` with what each says), so
   * `act calls` finds them beside the app's own. Nothing when the record has no `addonActions` or refuses the caller.
   */
  async function addonTools(ctx: C): Promise<CallRow[]> {
    if (!surface.call || !surface.calls || !surface.calls().some((r) => r.name === 'addonActions')) return [];
    const out = await surface.call('addonActions', {}, ctx);
    if (!out.ok || !isObject(out.value) || !Array.isArray(out.value.tools)) return [];
    return out.value.tools.filter(isObject).map((t) => {
      const takes = isObject(t.takes) ? Object.keys(t.takes) : [];
      return {
        name: String(t.call),
        group: 'READ+',
        writes: t.writes === true,
        what: `${String(t.says)} From the add-on ${String(t.addon_title ?? t.addon)}.${takes.length > 0 ? ` Takes ${takes.join(', ')}.` : ''}`,
      };
    });
  }

  /** One note of at most `NOTE_MOST`, on the row `spoken` names or on the caller's own run: what `log` writes, once a part. */
  async function logOne(args: Args, note: string, ctx: C, turn: Turn): Promise<Done> {
      /**
       * NO ROW IS THE CALLER'S OWN SESSION, AND IT IS THE RECORD'S `handoff` WITH THE NOTE ALONE. That is the one method
       * that finds a token's run, or opens it on its first write, inside the same transaction as the write, so a note is
       * one call whether or not the run exists yet. It appends the line to the run's notes and keeps it in the run's
       * history, which is where a note about nothing in particular was always taught to go (`teach` in `briefing.ts`). A
       * person names a run from the app, so the record refuses one here in its own sentence, as `handoff` does.
       */
      let out: Result<unknown>;
      if (args.spoken === undefined || args.spoken === null) {
        if (!surface.handoff) return { result: unbuilt('log with no row', 'Name the row the note is about in spoken.') };
        out = await surface.handoff({ note }, ctx);
      } else {
        const at = await locate(args.spoken, ctx, { tool: 'log', args });
        if (!at.ok) return { result: at };
        out = noRow(await surface.update({ ...at.value, patch: {}, note }, ctx), args.spoken);
      }
      if (!out.ok) return { result: await failed(out, ctx, turn) };
      turn.batch = batchIn(out.value);
      const ruled = ruledOf(out.value);
      if (!isEntry(out.value)) {
        if (ruled !== null && 'filed' in ruled) return filedOut(ruled.filed, ctx, turn);
        return { result: { ok: true, value: bare(out.value) } };
      }
      const entry = out.value;
      if (!prefixes.has(entry.register)) await learnPrefix(entry.register, ctx);
      const row = compact(entry, prefixOf(entry.register));
      /* AND `deleted_at` WHEN THE ROW HAS ONE. The record takes a note on a deleted row, and cutting the answer to three
         fields cut the one that said so: an agent logging on an id carried from another session was told `ok` and
         nothing else, which is the case where it did not already have the row. */
      const { spoken, version, updated_at, deleted_at } = row;
      const value = { spoken, version, ...(updated_at === undefined ? {} : { updated_at }), ...(deleted_at === undefined ? {} : { deleted_at }) };
      const words = titleOf(entry.fields, decls.get(entry.register));
      if (ruled === null || !('rung' in ruled)) return { result: { ok: true, value }, say: (look) => loggedBrief(String(spoken), words, version, deleted_at !== undefined, look) };
      return {
        result: { ok: true, value: ruled.rung === null ? value : { ...value, rung: ruled.rung } },
        say: (look) => [loggedBrief(String(spoken), words, version, deleted_at !== undefined, look), ruledBrief(ruled, [entry.register], look)].join('\n'),
        names: { people: true },
      };
  }

  /**
   * What `create`, `update` and `log` on a run answer: the row compact, or the conflict with its row in that shape.
   *
   * AND WHAT THE AGENT'S RUNG DID WITH IT (`ruledOf`), said after the row in names: done because it may make that kind of
   * change, or filed on Decide with nothing written. A write the record filed has no row, so the answer is the question
   * and its link, and never a row the agent would take for written.
   */
  async function wrote(r: Result<unknown>, verb: 'Added' | 'Changed', ctx: C, turn: Turn): Promise<Done> {
    if (!r.ok) return { result: await failed(r, ctx, turn) };
    const ruled = ruledOf(r.value);
    if (!isEntry(r.value)) {
      if (ruled === null || !('filed' in ruled)) return { result: { ok: true, value: bare(r.value) } };
      return filedOut(ruled.filed, ctx, turn);
    }
    const entry = r.value;
    turn.batch = batchIn(entry);
    /* A REPLAY ANSWERS THE FIRST ANSWER AND SAYS SO: a call sent again with an `op_id` already used for that
       write is the write that landed, not a second one, and the agent is told it wrote nothing new. The record marks it. */
    const again = (entry as { replayed?: unknown }).replayed === true;
    const out = await entryOut(entry, ctx, turn);
    const row = again ? { ...out, replayed: true } : out;
    const brief = (look: Look): string => [wroteBrief(verb, row as Shaped, entry.register, look), ...(again ? [REPLAYED] : [])].join('\n');
    if (ruled === null || !('rung' in ruled)) return { result: { ok: true, value: row }, say: brief };
    return {
      result: { ok: true, value: ruled.rung === null ? row : { ...row, rung: ruled.rung } },
      say: (look) => [brief(look), ruledBrief(ruled, [entry.register], look)].join('\n'),
      names: { people: true },
    };
  }

  /** A write the record filed on Decide instead of making: the question, its link, and the person it waits on. */
  async function filedOut(filed: Filed, ctx: C, turn: Turn): Promise<Done> {
    const linked = await decideAt({ ok: true, value: filed }, ctx, turn);
    const value = (linked.ok && isObject(linked.value) ? linked.value : filed) as Filed;
    return {
      result: { ok: true, value: { filed: value } },
      say: (look) => ruledBrief({ filed: value }, [], look),
      names: { people: true },
    };
  }

  /** A row whose JSON would not fit one answer, its longest texts cut at a word until it does, and the row saying so. */
  function fittedRow(row: Record<string, unknown>): Record<string, unknown> {
    if (JSON.stringify(row).length <= ANSWER_MOST || !isObject(row.fields)) return row;
    const fields = { ...row.fields };
    const long = Object.entries(fields)
      .filter((e): e is [string, string] => typeof e[1] === 'string')
      .sort((a, z) => z[1].length - a[1].length);
    for (const [id, text] of long) {
      fields[id] = clip(text, Math.max(1_000, Math.floor(text.length / 2)));
      if (JSON.stringify({ ...row, fields }).length <= ANSWER_MOST) break;
    }
    return { ...row, fields, clipped: true };
  }

  /** The rows a figure's groups are keyed by, by their words, for the groups a brief answer shows. */
  async function groupLabels(reading: Record<string, unknown>, ctx: C): Promise<Map<string, string>> {
    const keys = (Array.isArray(reading.groups) ? reading.groups : [])
      .filter(isObject)
      .slice(0, GROUPS_SHOWN)
      .map((g) => g.key)
      .filter((k): k is string => typeof k === 'string' && ROW_ID.test(k));
    const out = new Map<string, string>();
    await Promise.all(
      keys.map(async (key) => {
        const got = await surface.get({ spoken: key }, ctx);
        if (!got.ok || !isEntry(got.value)) return;
        if (!decls.has(got.value.register)) await learnPrefix(got.value.register, ctx);
        const words = titleOf(got.value.fields, decls.get(got.value.register));
        if (words) out.set(key, words);
      }),
    );
    return out;
  }

  /**
   * The corrected call a refusal carries as `try`, or `undefined` where no call would be right.
   *
   * BUILT FROM WHAT THE REFUSAL ITSELF HANDED OVER, and from the lists the caller may read, so a `try` never names a list,
   * a field or a value the caller was not already told about: a hidden list and a missing one are refused alike, and so
   * are their `try`s (`canary.test.ts`).
   */
  async function tryFor(name: string, args: Args, refusal: Refusal, ctx: C, turn: Turn): Promise<string | undefined> {
    const allowed = (refusal.allowed ?? []).map(String);
    /* THE LISTS THE CALLER MAY OPEN, as `boot` names them, and nothing else: a hidden list and a missing one are alike. */
    const listsOf = async (): Promise<Record<string, unknown>[]> => {
      const boot = await bootOf(ctx, turn);
      return boot.ok && isObject(boot.value) && Array.isArray(boot.value.registers) ? boot.value.registers.filter(isObject) : [];
    };
    /* A ROW THAT IS NOT THERE IS LOOKED FOR IN ITS LIST, when that is a list the caller may open, and in the list it most
       likely meant when it is not: `get task#3` was told to `list {"register":"task"}`, a list nobody has, which is a
       second refusal where a corrected call belonged. */
    if (refusal.code === 'ROW_UNKNOWN' && refusal.at === 'spoken') {
      const at = parse(args.spoken);
      if (at === null) return undefined;
      const listed = await listsOf();
      if (listed.some((r) => r.id === at.register)) return callOf('list', { register: at.register });
      const best = closest(at.register, listed.map((r) => ({ id: String(r.id), name: typeof r.name === 'string' ? r.name : undefined })));
      return best === null ? undefined : callOf(name, { ...args, spoken: `${best}#${String(at.seq)}` });
    }
    if (refusal.code === 'REGISTER_UNKNOWN' && allowed.length > 0) {
      const asked = typeof args.register === 'string' ? args.register : parse(args.spoken)?.register;
      if (asked === undefined) return undefined;
      const listed = await listsOf();
      const among = allowed.map((id) => ({ id, name: listed.find((r) => r.id === id)?.name as string | undefined }));
      const best = closest(asked, among);
      if (best === null) return undefined;
      const at = parse(args.spoken);
      return callOf(name, at ? { ...args, spoken: `${best}#${String(at.seq)}` } : { ...args, register: best });
    }
    /* A SENTENCE JOINED BY "and" (door audit D31): the grammar says a comma joins two conditions, and this is the call
       with the comma. */
    if (typeof args.where === 'string' && refusal.fix.includes('Conditions are joined by a comma: '))
      return callOf(name, { ...args, where: args.where.replace(/\s+and\s+/giu, ', ') });
    /* A `where` THAT NAMES A FIELD THE LIST DOES NOT HAVE, `{"field":"stat"}`: the same where with the field it most
       likely meant, wherever in the tree it was named. */
    if (refusal.code === 'FIELD_UNKNOWN' && allowed.length > 0 && typeof refusal.at === 'string' && isObject(args.where)) {
      const wrong = refusal.at;
      const best = closest(wrong, allowed.map((id) => ({ id })));
      if (best === null || best === wrong) return undefined;
      let moved = false;
      const mend = (node: unknown): unknown => {
        if (Array.isArray(node)) return node.map(mend);
        if (!isObject(node)) return node;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node)) {
          if (k === 'field' && v === wrong) {
            out[k] = best;
            moved = true;
          } else out[k] = k === 'all' || k === 'any' || k === 'none' ? mend(v) : v;
        }
        return out;
      };
      const where = mend(args.where);
      return moved ? callOf(name, { ...args, where }) : undefined;
    }
    /* A PROJECT NOT THERE, AND THE ONES THAT ARE (`allowed`, by name): the one it most likely meant. */
    if (refusal.code === 'ROW_UNKNOWN' && refusal.at === 'project' && allowed.length > 0 && typeof args.project === 'string') {
      const best = closest(args.project, allowed.map((id) => ({ id })));
      return best === null ? undefined : callOf(name, { ...args, project: best });
    }
    /* A `where` THAT ASKS FOR A VALUE THE FIELD DOES NOT HAVE, `{"field":"state","is":"started"}`: the same where with the
       value it most likely meant (audit 10k, AK14). */
    if (refusal.code === 'ENUM_VALUE_UNKNOWN' && allowed.length > 0 && typeof refusal.at === 'string' && isObject(args.where)) {
      const field = refusal.at;
      let moved = false;
      const mend = (node: unknown): unknown => {
        if (Array.isArray(node)) return node.map(mend);
        if (!isObject(node)) return node;
        if (node.field === field) {
          const out: Record<string, unknown> = { ...node };
          for (const k of ['is', 'eq', 'not', 'in', 'not_in']) {
            const v = node[k];
            const one = (x: unknown): unknown => (typeof x === 'string' && !allowed.includes(x) ? (enumMeant(x, allowed) ?? x) : x);
            const to = Array.isArray(v) ? v.map(one) : one(v);
            if (JSON.stringify(to) !== JSON.stringify(v)) {
              out[k] = to;
              moved = true;
            }
          }
          return out;
        }
        return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k === 'all' || k === 'any' || k === 'none' ? mend(v) : v]));
      };
      const where = mend(args.where);
      return moved ? callOf(name, { ...args, where }) : undefined;
    }
    if (refusal.code === 'ENUM_VALUE_UNKNOWN' && name === 'propose' && refusal.at === 'body_kind' && typeof args.body_kind === 'string') {
      const best = enumMeant(args.body_kind, [...allowed, ...(allowed.includes('widget') ? [] : ['widget'])]);
      return best === null ? undefined : callOf(name, { ...args, body_kind: best });
    }
    if ((refusal.code === 'FIELD_UNKNOWN' || refusal.code === 'ENUM_VALUE_UNKNOWN') && allowed.length > 0 && typeof refusal.at === 'string') {
      const key = name === 'update' ? 'patch' : name === 'create' || name === 'triage' ? 'fields' : null;
      const fields = key === null ? null : args[key];
      if (!isObject(fields) || !Object.hasOwn(fields, refusal.at)) return undefined;
      if (refusal.code === 'FIELD_UNKNOWN') {
        const best = closest(refusal.at, allowed.map((id) => ({ id })));
        if (best === null || Object.hasOwn(fields, best)) return undefined;
        const { [refusal.at]: was, ...rest } = fields;
        return callOf(name, { ...args, [key!]: { ...rest, [best]: was } });
      }
      const value = fields[refusal.at];
      /* A MONEY CHOICE GETS NO TRY HERE EITHER (RL4): "incoming" read as a bill's first way is a guess at his money. */
      const at = name === 'update' ? await locate(args.spoken, ctx) : null;
      const register = at === null ? args.register : at.ok ? at.value.register : undefined;
      if (typeof register === 'string' && !decls.has(register)) await learnPrefix(register, ctx);
      if (moneyChoice(register, refusal.at)) return undefined;
      /* THE VALUE IT MOST LIKELY MEANT, BY SPELLING OR BY MEANING: "started" is no typo of doing, and got no try (AK14). */
      const best = typeof value === 'string' ? enumMeant(value, allowed) : null;
      return best === null ? undefined : callOf(name, { ...args, [key!]: { ...fields, [refusal.at]: best } });
    }
    /* A DAY SAID IN WORDS, "next friday", where a field takes one as YYYY-MM-DD: the day those words are, by the record's
       own clock, zone and locale (AK14, RL8). Words it cannot read, or could read two ways, are left to the sentence. */
    if (refusal.code === 'VALUE_MALFORMED' && typeof refusal.at === 'string' && refusal.fix.includes('takes a day, as YYYY-MM-DD')) {
      const key = name === 'update' ? 'patch' : name === 'create' || name === 'triage' ? 'fields' : null;
      const fields = key === null ? null : args[key];
      if (!isObject(fields) || typeof fields[refusal.at] !== 'string') return undefined;
      const { now, zone, locale } = await peopleOf(ctx, turn);
      const read = dayInWords(fields[refusal.at] as string, now, { ...(zone === undefined ? {} : { zone }), ...(locale === undefined ? {} : { locale }) });
      return read === null ? undefined : callOf(name, { ...args, [key!]: { ...fields, [refusal.at]: read } });
    }
    /* A FIELD THE LIST NEEDS AND THE CALL LEFT OUT, when it is a choice: the call with its first value, the values named in
       the fix (`choiceFor`). A MONEY CHOICE GETS NO TRY: a bill's way in or out, picked first, is a guess at his money. */
    if (refusal.code === 'REQUIRED_MISSING' && typeof refusal.at === 'string' && allowed.length > 0 && (name === 'create' || name === 'triage')) {
      const fields = isObject(args.fields) ? args.fields : {};
      if (Object.hasOwn(fields, refusal.at)) return undefined;
      if (typeof args.register === 'string' && !decls.has(args.register)) await learnPrefix(args.register, ctx);
      if (moneyChoice(args.register, refusal.at)) return undefined;
      return callOf(name, { ...args, fields: { ...fields, [refusal.at]: allowed[0]! } });
    }
    /* A NOTE ON A SET-ASIDE, WHICH FILES NO ROW: the same call without it. */
    if (refusal.code === 'VALUE_MALFORMED' && name === 'triage' && (refusal.at === 'note' || refusal.at === 'fields') && Object.hasOwn(args, refusal.at)) {
      const { [refusal.at]: _gone, ...rest } = args;
      return callOf(name, rest);
    }
    /* A MEETING WITH NO WHERE: this session is where an agent met them. */
    if (refusal.code === 'REQUIRED_MISSING' && name === 'meet' && refusal.at === 'where') return callOf(name, { ...args, where: 'this session' });
    /* A BATCH NO WRITE WAS MADE UNDER: the changes lately, each with the batch its receipt named. */
    if (refusal.code === 'ROW_UNKNOWN' && name === 'undo' && refusal.at === 'batch') return callOf('activity', { limit: 10, format: 'full' });
    /* A WRITE HIS WORD CANNOT CARRY, FROM A RUN THAT READ SOMEBODY ELSE'S WORDS: the same change, asked (AK14). */
    if (refusal.code === 'FORBIDDEN' && refusal.at === 'said' && /Ask with propose\.$/u.test(refusal.fix)) return askedCall(name, args, turn);
    if (refusal.code === 'VALUE_MALFORMED' && refusal.at === 'spoken' && typeof args.spoken === 'string') {
      const said = args.spoken.trim();
      /* THE FORMS AN AGENT GETS NEARLY RIGHT: a capital in the list, a lower-case prefix, and a bare word that is a list
         this caller may read or a figure one typo from one it may. A word that is neither has no corrected call. */
      if (QUALIFIED.test(said.toLowerCase())) return callOf(name, { ...args, spoken: said.toLowerCase() });
      if (PREFIXED.test(said.toUpperCase())) return callOf(name, { ...args, spoken: said.toUpperCase() });
      /* A NAME NOTHING IS CALLED IS LOOKED FOR BY ITS WORDS: the sentence said "search finds it" and the
         refusal carried no call, so an agent wrote the search itself or resent the get. */
      if (!NAMED.test(said)) return ['get', 'update', 'log', 'history'].includes(name) && said !== '' && !FIGURE.test(said) ? callOf('search', { q: said.slice(0, 100) }) : undefined;
      if ((await listsOf()).some((r) => r.id === said)) return callOf('list', { register: said });
      if (name !== 'get') return undefined;
      const figures = await figuresFor(ctx, async () => []);
      const best = closest(said, figures.filter((f) => !f.param).map((f) => ({ id: f.id, name: f.name })));
      return best === null ? undefined : callOf('get', { spoken: best });
    }
    /* A LIMIT OUT OF BOUNDS IS THE RECORD'S REFUSAL NOW: `limitOf` passes one under 1 on as sent. */
    if ((refusal.code === 'VALUE_MALFORMED' || refusal.code === 'OUT_OF_BOUNDS') && refusal.at === 'limit' && typeof args.limit === 'number' && Number.isFinite(args.limit))
      return callOf(name, { ...args, limit: Math.min(Math.max(1, Math.round(args.limit)), name === 'activity' ? ACTIVITY_MOST : LIST_MOST) });
    return undefined;
  }

  /**
   * A ref field given a name, `{"thing":"Kiln"}`, which the record refuses as "thing takes a row id or a spoken id like
   * things#41": the row that name is in the list the field points at, said in the fix and sent as `try`. Several called
   * that are listed by handle with the first as `try`; none, and the refusal stays as it came. A name and not a guess:
   * nothing is written until the agent sends the call again.
   */
  /** Where a ref refusal's name sits in a write's fields: the list the field points at, and the name as sent. */
  function refAt(name: string, args: Args, refusal: Refusal): { to: string; key: string; fields: Record<string, unknown>; field: string; index: number | null; held: unknown; value: string } | null {
    if (refusal.code !== 'VALUE_MALFORMED' || typeof refusal.at !== 'string' || (refusal as { try?: unknown }).try !== undefined) return null;
    const to = /takes a row id or a spoken id like ([a-z][a-z0-9_]*)#41/u.exec(refusal.fix)?.[1];
    const key = name === 'update' ? 'patch' : name === 'create' || name === 'triage' ? 'fields' : null;
    const fields = key === null ? null : args[key];
    const place = /^(?:(?:fields|patch)\.)?([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/u.exec(refusal.at);
    if (to === undefined || key === null || !isObject(fields) || place === null) return null;
    const field = place[1]!;
    const index = place[2] === undefined ? null : Number(place[2]);
    const held = fields[field];
    const value = index === null ? held : Array.isArray(held) ? held[index] : undefined;
    if (typeof value !== 'string' || value.trim() === '') return null;
    return { to, key, fields, field, index, held, value: value.trim() };
  }

  /**
   * A WRITE THAT NAMED A REF BY ITS NAME, SENT AGAIN WITH ITS HANDLE when exactly one row the caller reads is called that,
   * as a `where` takes the name (audit 10k AK13). `list tasks where thing is Kiln` worked and `create` with `"thing":"Kiln"`
   * was refused, knowing the row, so an agent had to carry ids. Only a name that is one row's title, case and spacing
   * aside, in the list the field points at: a name several rows are called, or one a search alone found, is still refused
   * with its handles (`refFor`). The refused call wrote nothing, so sending it again writes once. `null` is no such name.
   */
  async function refByName(name: string, args: Args, refusal: Refusal, ctx: C, turn: Turn): Promise<Args | null> {
    const at = refAt(name, args, refusal);
    if (at === null) return null;
    const found = await named(at.value, ctx, turn, at.to);
    if (found === null || !('one' in found) || !found.exact) return null;
    const handle = `${found.one.register}#${String(found.one.seq)}`;
    const put = at.index === null ? handle : (at.held as unknown[]).map((v, i) => (i === at.index ? handle : v));
    return { ...args, [at.key]: { ...at.fields, [at.field]: put } };
  }

  async function refFor(name: string, args: Args, refusal: Refusal, ctx: C, turn: Turn): Promise<Refusal> {
    const at = refAt(name, args, refusal);
    if (at === null) return refusal;
    const { key, fields, field, index, held, value } = at;
    const found = await named(value, ctx, turn, at.to);
    if (found === null) return refusal;
    const handle = 'one' in found ? `${found.one.register}#${String(found.one.seq)}` : found.many.handles[0]!;
    const put = index === null ? handle : (held as unknown[]).map((v, i) => (i === index ? handle : v));
    const tried = callOf(name, { ...args, [key]: { ...fields, [field]: put } });
    if ('one' in found) return taught({ ...refusal, fix: `${refusal.fix} ${clip(value, 60)} is ${handle}.` } as Refusal, tried);
    const more = found.many.count > 5 ? ` and ${String(found.many.count - 5)} more` : '';
    return taught({ ...refusal, fix: `${refusal.fix} ${String(found.many.count)} are called ${clip(value, 60)}: ${found.many.each.join(', ')}${more}.`, allowed: found.many.handles } as Refusal, tried);
  }

  /**
   * A field a new row needs and the call left out, when it is a choice of values: the refusal with the values said, each
   * by its label, and as `allowed`, so `tryFor` hands the call with one. A field that is no choice stays as it came.
   */
  async function choiceFor(name: string, args: Args, refusal: Refusal, ctx: C): Promise<Refusal> {
    if (refusal.code !== 'REQUIRED_MISSING' || typeof refusal.at !== 'string' || refusal.allowed !== undefined) return refusal;
    if ((name !== 'create' && name !== 'triage') || typeof args.register !== 'string') return refusal;
    if (!decls.has(args.register)) await learnPrefix(args.register, ctx);
    const field = decls.get(args.register)?.fields.find((f) => f.id === refusal.at);
    const values = field?.type === 'enum' && Array.isArray(field.values) ? field.values.filter((v): v is string => typeof v === 'string') : [];
    if (values.length === 0) return refusal;
    const said = values.slice(0, 12).map((v) => (field?.labels?.[v] && field.labels[v] !== v ? `${v} (${field.labels[v]})` : v));
    const ask = moneyChoice(args.register, refusal.at) ? ' Ask the person which; a money choice is never guessed.' : '';
    return { ...refusal, fix: `${refusal.fix} It is one of ${said.join(', ')}.${ask}`, allowed: values } as Refusal;
  }

  /**
   * A choice that is about money: a field on a list that keeps money (one with a money field), or one that names a
   * direction, a currency or an amount. Its values are named and none is picked, so no `try` writes a bill as owed when
   * it was owing.
   */
  function moneyChoice(register: unknown, field: string): boolean {
    if (/direction|currency|amount/iu.test(field)) return true;
    const decl = typeof register === 'string' ? decls.get(register) : undefined;
    return decl?.fields.some((f) => f.type === 'money') === true;
  }

  /**
   * `title` or `name` written to a list that has no such field, answered with the list's own title field: the refusal
   * with one more sentence, "This list's title is its <label> field.", and the call with that field as its `try`.
   *
   * `title` IS THE WORD AN AGENT REACHES FOR, and it is a reserved field id, so no list has it and the record's sentence
   * names no field to use in its place. The list is read as the caller may read it, so a list it cannot open is told
   * nothing more than a missing one. No call is handed where the title field was sent as well: one value would go.
   */
  async function titleFor(name: string, args: Args, refusal: Refusal, ctx: C): Promise<Refusal> {
    if (refusal.code !== 'FIELD_UNKNOWN' || (refusal.at !== 'title' && refusal.at !== 'name')) return refusal;
    const key = name === 'update' ? 'patch' : name === 'create' || name === 'triage' ? 'fields' : null;
    const fields = key === null ? null : args[key];
    if (key === null || !isObject(fields) || !Object.hasOwn(fields, refusal.at)) return refusal;
    const at = name === 'update' ? await locate(args.spoken, ctx) : null;
    const register = at === null ? args.register : at.ok ? at.value.register : undefined;
    if (typeof register !== 'string') return refusal;
    if (!decls.has(register)) await learnPrefix(register, ctx);
    const decl = decls.get(register);
    const title = decl?.title;
    const field = title === undefined ? undefined : decl?.fields.find((f) => f.id === title);
    if (title === undefined || field === undefined || title === refusal.at) return refusal;
    const label = field.label ?? title.replace(/_/gu, ' ');
    const told = { ...refusal, fix: `${refusal.fix} This list's title is its ${label.slice(0, 1).toUpperCase() + label.slice(1)} field.` } as Refusal;
    if (Object.hasOwn(fields, title)) return told;
    const { [refusal.at]: was, ...rest } = fields;
    return taught(told, callOf(name, { ...args, [key]: { [title]: was, ...rest } }));
  }

  /**
   * One tool's answer, whole: the record's answer shaped as the full JSON, which travels as `structuredContent`, and the
   * text an agent reads, plain labelled lines unless `format: "full"` asks for the JSON there as well.
   *
   * `text: false` IS WHAT `call` ASKS, for a caller in process that reads the JSON alone: the reads only a line needs, a
   * figure's group names and the people and runs a log line is signed by, are not made for it.
   */
  const answer = async (name: string, args: Args, ctx: C, text = true): Promise<Said> => {
    /**
     * `Object.hasOwn`, BECAUSE THE NAME COMES FROM THE CALLER.
     *
     * `run` is a plain object literal, so `run['constructor']` is `Object` and every name on
     * `Object.prototype` was truthy and got called rather than refused: `constructor` handed the
     * caller its arguments back, `toString` answered `[object Undefined]`, and the rest threw out
     * of a function whose type says it returns a `Result`. Now that `rpc.ts` carries names from the
     * wire, this is the lookup a stranger reaches first.
     */
    const tool = Object.hasOwn(run, name) ? run[name] : undefined;
    if (!tool) {
      const best = closest(name, TOOLS.map((t) => ({ id: t.name })));
      /* A TOOL THAT BECAME A RESOURCE IS SAID BY ITS ADDRESS: a session opened before the change keeps the older list
         until it restarts, and its call is told where the answer is read now rather than a nearest tool. */
      const now = Object.hasOwn(NOW_READ_AT, name) ? NOW_READ_AT[name] : undefined;
      const at = Object.hasOwn(READ_NOT_CALLED, name) ? READ_NOT_CALLED[name] : undefined;
      const fix = now ? `${name} is no longer a tool. Read the resource ${now}.` : at ? `${name} is read, not called. Read the resource ${at}.` : `There is no tool called ${name}.`;
      const refusal = taught(
        { code: 'ROUTE_UNKNOWN', fix, allowed: TOOLS.map((t) => t.name) },
        best === null || now || at ? undefined : callOf(best, args),
      );
      return said({ ok: false, refusal }, refusalBrief(refusal as Record<string, unknown>));
    }
    /* `format` IS THIS LAYER'S, and never reaches the record, which would refuse a key its method does not take. "json"
       is the same ask in other words, and any other value is refused rather than quietly read as brief (door audit D33). */
    if (args.format !== undefined && args.format !== null && args.format !== 'full' && args.format !== 'json' && args.format !== 'brief') {
      const refusal = taught(
        { code: 'ENUM_VALUE_UNKNOWN', fix: 'format is "full", which answers JSON, or left out for short lines.', at: 'format', allowed: ['full'] },
        callOf(name, { ...args, format: 'full' }),
      );
      return said({ ok: false, refusal }, refusalBrief(refusal as Record<string, unknown>));
    }
    const full = args.format === 'full' || args.format === 'json';
    let sent: Args = Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'format'));
    /* NOT SAID IN WORDS WHEN THE CALL ASKS full, whose text is the JSON: the reads only a line needs are not made. */
    const turn: Turn = { text: text && !full, titles: new Map() };
    const stray = strayIn(name, sent);
    if (stray !== null) return said(stray, full ? JSON.stringify(stray.refusal) : refusalBrief(stray.refusal as Record<string, unknown>));
    /* EXCEPT THAT A FULL context ASKS THE RECORD FOR THE FULL ANSWER TOO, twenty rows of each list where the brief one
       sends five: as a hint on the session, which is where the record reads it, never as an argument. */
    const asked = name === 'context' && full ? ({ ...ctx, session: { ...((ctx as { session?: object }).session ?? {}), format: 'full' } } as typeof ctx) : ctx;
    /* ADMITTED, SO IT BEATS: a name and keys this door took go on to the record, and a call refused above never got
       there. With the caller's own context, never `asked`'s hint, and never waited on. */
    beatOn(surface, ctx);
    let done = await tool(sent, asked, turn);
    /* A REF NAMED BY THE ONE ROW CALLED THAT IS TAKEN AS THAT ROW (`refByName`), a field at a time, at most three. */
    for (let hop = 0; hop < 3 && refused(done.result) && (name === 'create' || name === 'update' || name === 'triage'); hop++) {
      const again = await refByName(name, sent, done.result.refusal, ctx, turn);
      if (again === null) break;
      sent = again;
      done = await tool(sent, asked, turn);
    }
    let result = done.result;
    /* THE FIREWALL BEFORE A WORD IS WRITTEN: a field hidden from the caller still on a row of
       the answer is taken off here and raised as fault `lens.firewall`, and then BOTH HALVES ARE DRAWN FROM WHAT IS LEFT.
       The words the tool had ready (`done.say`) are past any key to take off, so an answer the firewall touched is written
       from the masked answer itself, as JSON, and never in those words. */
    let walled = false;
    {
      const held = firewall(ctx, result, typeof surface.listOf === 'function' ? (spoken) => surface.listOf!(spoken) : undefined, () => surface.moneyHidden?.(ctx) === true);
      if (held.stripped.length > 0) {
        result = held.answer;
        walled = true;
        surface.firewalled?.(`mcp ${name}`, held.stripped);
      }
    }
    if (refused(result)) {
      /* THE LIST'S TITLE FIRST: `name` is otherwise handed the field spelled most like it, which is rarely the title. */
      const titled = await titleFor(name, sent, result.refusal, ctx);
      if (titled !== result.refusal) result = { ok: false, refusal: titled };
      /* A REF FIELD GIVEN A NAME: the row it names, as `try`. */
      const reffed = await refFor(name, sent, result.refusal, ctx, turn);
      if (reffed !== result.refusal) result = { ok: false, refusal: reffed };
      /* A CHOICE THE LIST NEEDS AND THE CALL LEFT OUT, with its values named: "obligations needs direction." named none. */
      const needed = await choiceFor(name, sent, result.refusal, ctx);
      if (needed !== result.refusal) result = { ok: false, refusal: needed };
      /* `widget` IS A KIND propose TAKES, answered by this door before the record's list of kinds is read (AK14). */
      if (name === 'propose' && result.refusal.code === 'ENUM_VALUE_UNKNOWN' && result.refusal.at === 'body_kind' && Array.isArray(result.refusal.allowed) && !result.refusal.allowed.includes('widget'))
        result = { ok: false, refusal: { ...result.refusal, allowed: [...result.refusal.allowed, 'widget'] } as Refusal };
      const fix = await tryFor(name, sent, result.refusal, ctx, turn);
      /* A `try` THAT IS THE CALL JUST MADE IS NO TRY: the instructions say never to send a call again unchanged. */
      if (fix !== undefined && fix !== callOf(name, sent) && (result.refusal as { try?: unknown }).try === undefined)
        result = { ok: false, refusal: taught(result.refusal, fix) };
    }
    if (!text) return said(result, '');
    if (refused(result)) return said(result, full ? JSON.stringify(result.refusal) : refusalBrief(result.refusal as Record<string, unknown>));
    if (conflicted(result)) {
      const look = await lookOf(ctx, turn, { people: true, runs: [result.conflict.actor] });
      const current = isObject(result.conflict.current) ? result.conflict.current : null;
      const register = current && typeof current.spoken === 'string' ? registerOf(current.spoken, sent) : undefined;
      const version = typeof sent.version === 'number' ? sent.version : undefined;
      const stale = staleOf(result.conflict, look, callOf(name, { ...sent, version: result.conflict.version }), version);
      const fitted = fittedJson(stale);
      return { result, text: capped(full || walled ? JSON.stringify(fitted) : conflictBrief(result.conflict, register, look, version)), structured: fitted };
    }
    const value = result.ok ? result.value : undefined;
    /* THE LOOK'S OWN READS, a `boot` for the people and one of the runs, are made only for an answer said in words. */
    /* EVERY WRITE ENDS WITH ITS RECEIPT: what changed in names, and the one call that takes it back. */
    const receipted = (s: Said, line: string | null, short: string | null): Said =>
      line === null ? s : { ...s, ...(short !== null ? { text: `${s.text}\n${short}` } : {}), structured: { ...s.structured, receipt: line } };
    /* `act` IS RECEIPTED WHEN ITS CALL WROTE: a batch came back, or the call is a write in the record's table. */
    const receiptOn = (line: string): string | null =>
      RECEIPTED.has(name) || (name === 'act' && (turn.batch !== undefined || turn.asks !== undefined || surface.calls?.().find((r) => r.name === sent.call)?.writes === true)) ? line : null;
    if (full || walled || !done.say) return receipted(said(result), receiptOn(receiptOf(name, '', turn, value)), null);
    const body = done.say(await lookOf(ctx, turn, done.names));
    return receipted(said(result, body), receiptOn(receiptOf(name, body, turn, value)), receiptOf(name, body, turn, value, true));
  };

  /** The register a conflict's row is in, from the call that met it: the one `update` named, else the one `create` did. */
  const registerOf = (spoken: string, args: Args): string | undefined => {
    const at = parse(spoken);
    if (at) return at.register;
    const named = parse(args.spoken);
    if (named) return named.register;
    if (typeof args.register === 'string') return args.register;
    const prefix = /^([A-Z]{1,4})\d+$/u.exec(spoken)?.[1];
    return prefix === undefined ? undefined : [...prefixes].find(([, p]) => p === prefix)?.[0];
  };

  /**
   * WHAT THE RECORD WOULD LINK AND ASK, BEFORE ANYBODY IS MET: the record's `understandPlan`, the next
   * slice of its nightly walk looked at and nothing kept, said in names. Who may read it is the record's to say, so a
   * refusal passes through in its words.
   *
   * THE RESOURCE `braindog:understand`, AND NO LONGER A TOOL: it takes nothing and writes nothing. The answer
   * is the plan and nothing that acts: the counts by kind, the first changes and questions in names and how many in all,
   * and whether this slice reads to the end. An `undo` or a filed question's id is a dry slice's never, and would be a
   * handle no tool takes, so neither is passed on. `said` is the plan in a person's words, the rows its sentences name
   * read first so a handle is said by its words, and it is left out of a listing's check (`lean` false).
   */
  const understood = async (ctx: C, lean: boolean): Promise<Result<unknown>> => {
    if (!surface.understandPlan) return unbuilt('understand', 'Meet people with an email or handle, and BrainDog links them as it can.');
    const out = await surface.understandPlan({}, ctx);
    if (!out.ok || !isObject(out.value)) return out;
    const v = out.value;
    const value = bare({
      kinds: v.kinds,
      writes: v.writes,
      more: v.more,
      questions: v.questions,
      asks: v.asks,
      done: v.done,
      ...(v.dropped === undefined ? {} : { dropped: v.dropped }),
    }) as Record<string, unknown>;
    if (!lean) return { ok: true, value };
    const turn: Turn = { text: true, titles: new Map() };
    await handlesNamed(handlesIn([...(Array.isArray(v.writes) ? v.writes : []), ...(Array.isArray(v.questions) ? v.questions : [])].join(' ')), ctx, turn);
    return { ok: true, value: { said: understoodBrief(value, await lookOf(ctx, turn, { people: true })), ...value } };
  };

  /**
   * THE STEPS LEFT AND NOT TAKEN, as `braindog:handoffs`: one table over the page source `handoffs.open`, drawn by the
   * record's `previewPage` and filed nowhere, so it is the same read as the briefing's Next line and the Agents page,
   * held to the caller as a page she may open is. No record needs a page installed for it, and nothing is special to
   * one record: every record answers it from its own runs. A record without the preview lists no address.
   */
  const handoffsRead = async (ctx: C): Promise<Result<unknown>> => {
    if (!surface.previewPage) return unbuilt('braindog:handoffs', 'Read braindog:context, whose Next line names the step to take.');
    const drawn = await surface.previewPage({ body: HANDOFFS_PAGE }, ctx);
    return drawn.ok ? { ok: true, value: bare(isObject(drawn.value) ? drawn.value : {}) } : drawn;
  };

  /**
   * WHAT MATTERS, WHAT STOPPED AND WHAT WENT STALE, as `braindog:briefing`, `braindog:exceptions` and `braindog:stale`:
   * each is the record's own read of that name, so who may read it and what they are shown is the record's to say, and
   * its refusal passes through in its words.
   *
   * ONLY THE WORDS AND THE HANDLES A TOOL TAKES ARE PASSED ON, key by key. A card's `cause` is the handle the record
   * keeps it by, `at` is the moment it was worked out and `basis` a checksum: none is for an agent to read, and a key
   * the record adds later is not passed on until it is named here. An answer of no shape reads as nothing to say.
   */
  const briefingRead = async (ctx: C): Promise<Result<unknown>> => {
    if (!surface.briefing) return unbuilt('braindog:briefing', 'Read braindog:context for where you stand.');
    const out = await surface.briefing({}, ctx);
    if (!out.ok) return out;
    const cards = isObject(out.value) && Array.isArray(out.value.cards) ? out.value.cards : [];
    return {
      ok: true,
      value: {
        cards: cards.flatMap((c: unknown) =>
          isObject(c) && typeof c.line === 'string'
            ? [{ ...(typeof c.h === 'string' ? { h: c.h } : {}), line: c.line, ...(typeof c.row === 'string' && c.row !== '' ? { row: c.row } : {}) }]
            : [],
        ),
      },
    };
  };
  /**
   * THE WIDGETS, as `braindog:widgets`: the record's gallery, each by its name, group, sizes and whether it fills now,
   * and the add-on that brings one the record lacks. NO READINGS: an agent picks by name and says why, and the owner sees
   * the real numbers on the draft. Today's own widgets are read from the kept board, so `on_today` is what he sees.
   */
  const widgetsRead = async (ctx: C): Promise<Result<unknown>> => {
    if (!surface.widgetGallery) return unbuilt('braindog:widgets', 'Read braindog:design for the kinds a page draws.');
    const today = await surface.page({ slug: 'home' }, ctx);
    const blocks = today.ok && isObject(today.value) && Array.isArray(today.value.blocks) ? today.value.blocks : [];
    const board = blocks.flatMap((b: unknown) =>
      isObject(b) && typeof b.key === 'string'
        ? [{ key: b.key, ...(typeof b.heading === 'string' ? { heading: b.heading } : {}), ...(typeof b.source === 'string' ? { source: b.source } : {}), ...(typeof b.where === 'string' ? { where: b.where } : {}), ...(Array.isArray(b.cells) && isObject(b.cells[0]) && typeof b.cells[0].metric === 'string' ? { metric: b.cells[0].metric } : {}), empty: false }]
        : [],
    );
    const out = await surface.widgetGallery({ board }, ctx);
    if (!out.ok) return out;
    const widgets = isObject(out.value) && Array.isArray(out.value.widgets) ? out.value.widgets : [];
    return {
      ok: true,
      value: {
        today: board.map((b) => b.heading ?? b.key),
        widgets: widgets.flatMap((w: unknown) =>
          isObject(w) && typeof w.title === 'string'
            ? [
                {
                  name: w.title,
                  ...(typeof w.says === 'string' ? { says: w.says } : {}),
                  ...(typeof w.group === 'string' ? { group: w.group } : {}),
                  ...(Array.isArray(w.sizes) ? { sizes: w.sizes } : {}),
                  fills: w.ready === true,
                  ...(typeof w.need === 'string' && w.ready !== true ? { needs: w.need } : {}),
                  ...(w.onBoard === true ? { on_today: true } : {}),
                },
              ]
            : [],
        ),
      },
    };
  };
  const exceptionsRead = async (ctx: C): Promise<Result<unknown>> => {
    if (!surface.exceptions) return unbuilt('braindog:exceptions', 'Read braindog:actions for what runs on a clock and when it last ran.');
    const out = await surface.exceptions({}, ctx);
    if (!out.ok) return out;
    const found = isObject(out.value) && Array.isArray(out.value.exceptions) ? out.value.exceptions : [];
    const text = (e: Record<string, unknown>, key: string) => (typeof e[key] === 'string' ? { [key]: e[key] } : {});
    return {
      ok: true,
      value: {
        exceptions: found.flatMap((e: unknown) => {
          if (!isObject(e) || typeof e.said !== 'string') return [];
          /* WHAT TO OPEN: its name, and beside it the handle `get` takes. */
          const row = isObject(e.row) && typeof e.row.name === 'string' && typeof e.row.id === 'string' ? { row: { name: e.row.name, id: e.row.id } } : {};
          return [{ ...text(e, 'kind'), ...text(e, 'subject'), said: e.said, ...text(e, 'since'), ...row }];
        }),
      },
    };
  };
  /**
   * A STALE LINE IS ITS WORDS, HOW MANY, AND THE ONE CALL THAT CLEARS IT, written out to copy as a refusal's `try` is
   * (`callOf`), whether the record wrote the call or named its tool and arguments. A line with no words or no call
   * tells an agent nothing it can act on, so it is not passed on. Nothing stale is said in a sentence.
   */
  const staleRead = async (ctx: C): Promise<Result<unknown>> => {
    if (!surface.stale) return unbuilt('braindog:stale', 'Read braindog:handoffs for the steps left, and braindog:decisions for the questions open.');
    const out = await surface.stale({}, ctx);
    if (!out.ok) return out;
    /* THE RECORD ANSWERS `{ lines, count }` (`methods/stale.ts`); a surface that hands the lines bare, or under `stale`,
       is read the same. */
    const v = out.value;
    const lines = Array.isArray(v) ? v : isObject(v) && Array.isArray(v.lines) ? v.lines : isObject(v) && Array.isArray(v.stale) ? v.stale : [];
    const stale = lines.flatMap((l: unknown) => {
      if (!isObject(l) || typeof l.said !== 'string') return [];
      const c = l.clear;
      const clear = typeof c === 'string' ? c : isObject(c) && typeof c.tool === 'string' ? callOf(c.tool, isObject(c.args) ? c.args : {}) : '';
      if (clear === '') return [];
      return [{ ...(typeof l.kind === 'string' ? { kind: l.kind } : {}), said: l.said, ...(typeof l.count === 'number' ? { count: l.count } : {}), clear }];
    });
    return { ok: true, value: { stale, ...(stale.length === 0 ? { said: 'Nothing is stale where you stand.' } : {}) } };
  };
  /**
   * THE STANDING LESSONS, A LINE EACH, as `braindog:learnings`: `LN12 · method · here · <lesson> · because <failure>`,
   * in the order the record answered, which is the order to read them in (method before fact, here before everywhere,
   * newest first). The record is asked its own default and the door names no limit of its own.
   *
   * ONLY WHAT AN AGENT FOLLOWS OR CITES IS PASSED ON. The handle is the one `get` and `update` take; a row with none,
   * or with no lesson, is left out. Where it applies is one of two words, so a project's id never stands in for them.
   * The day it was made or confirmed stays behind: the order already says which is newer. A lesson with no kind is a
   * fact, as the card sorts it.
   *
   * WHAT IS LEFT IS SAID LAST: how many more stand, with the call that reads them, then how many faded. The record
   * answers `truncated` and may count what is left (`more`, or `total` of all that stand). When it says only that more
   * stand, it is asked once more for the most one read holds (`LEARNED_MOST`), and the difference is the number. If
   * that read is refused the line gives no number it would have to invent, and if it is cut short too it says "over".
   * `resources` asks only to see that the address answers (`lean` false), and counts nothing.
   */
  const learningsRead = async (ctx: C, lean: boolean): Promise<Result<unknown>> => {
    if (!surface.learnings) return unbuilt('braindog:learnings', 'Read braindog:context, whose card names the lessons that bear on where you stand.');
    const out = await surface.learnings({}, ctx);
    if (!out.ok) return out;
    const v = isObject(out.value) ? out.value : {};
    const rows = Array.isArray(v.rows) ? v.rows : [];
    const one = (x: unknown): string => (typeof x === 'string' ? x.replace(/\s+/gu, ' ').trim() : '');
    const lines = rows.flatMap((r: unknown) => {
      if (!isObject(r)) return [];
      const spoken = one(r.spoken);
      const lesson = one(r.lesson);
      if (!PREFIXED.test(spoken) || lesson === '') return [];
      const where = r.where === 'here' || r.where === 'everywhere' ? [r.where] : [];
      const because = one(r.because).replace(/^because\s+/iu, '');
      return [[spoken, one(r.kind) || 'fact', ...where, lesson, ...(because === '' ? [] : [`because ${because}`])].join(' · ')];
    });
    const count = (x: unknown): number => (typeof x === 'number' && Number.isInteger(x) && x > 0 ? x : 0);
    let left = count(v.more) || count(v.total) - rows.length;
    let over = '';
    if (left <= 0 && v.truncated === true && lean) {
      const all = await surface.learnings({ limit: LEARNED_MOST }, ctx);
      const whole = all.ok && isObject(all.value) ? all.value : {};
      left = (Array.isArray(whole.rows) ? whole.rows.length : 0) - rows.length;
      if (whole.truncated === true) over = 'over ';
    }
    const more = left > 0 ? [`and ${over}${String(left)} more, call context`] : v.truncated === true ? ['and more, call context'] : [];
    const faded = count(v.faded) > 0 ? [`${String(count(v.faded))} faded`] : [];
    const learnings = [...lines, ...more, ...faded];
    return { ok: true, value: { learnings, ...(learnings.length === 0 ? { said: 'No lesson stands here yet.' } : {}) } };
  };

  /**
   * A page, a block of one, or the Home page, as a resource reads it.
   *
   * `braindog:page/home` IS THE HOME THE RECORD DECLARES (`homeIn`), so the instructions' "read the Home page" lands on
   * every record that has one. A page too large for one answer is answered as one line a block, each with the address
   * that reads it whole, `braindog:page/<slug>/<n>`: the owner's portfolio page measured 760 KB, five times what
   * claude.ai takes from one result, and Notion's server answers the same way rather than with a part of it.
   */
  /**
   * The inbox at its three addresses, each one read of the record said as lines.
   *
   * `braindog:inbox` IS THE DIGEST: the counts of all six states and each state's lines, held to `ANSWER_MOST` by
   * `inboxDigestLines`, so 32 waiting arrivals are one read and a busy inbox cannot blow the answer. `<state>` is that
   * state's hundred, and an arrival's id in its place answers that arrival whole.
   *
   * A RECORD OLDER THAN THE DIGEST IS READ AS TODAY. It refuses `digest` at its own key, and is then asked the page it
   * has always answered, handed back as it came; an answer that is no digest is handed back the same way. Who may read is
   * still the record's to say, so a token without the reach is answered in the record's sentence, word for word.
   */
  const inboxRead = async (rest: string, uri: string, ctx: C): Promise<Result<unknown>> => {
    const inbox = surface.inbox;
    if (!inbox) return unbuilt(uri, 'Nothing else lists what arrived yet.');
    if (ARRIVAL.test(rest)) {
      const one = await inbox.call(surface, { id: rest }, ctx);
      if (!one.ok)
        return refused(one) && one.refusal.at === 'id' && one.refusal.code !== 'OUT_OF_BOUNDS'
          ? unbuilt('one arrival by its id', 'Read braindog:inbox/all for every arrival, each with its words.')
          : one;
      return isObject(one.value) ? { ok: true, value: { arrival: arrivalWhole(one.value, Date.now(), ANSWER_MOST - 4_000) } } : one;
    }
    if (rest) {
      const page = await inbox.call(surface, { state: rest, limit: INBOX_STATE_READ }, ctx);
      if (!page.ok || !isObject(page.value) || !Array.isArray(page.value.arrivals)) return page;
      return { ok: true, value: { inbox: inboxStateLines(page.value, rest, ANSWER_MOST) } };
    }
    const digest = await inbox.call(surface, { digest: true }, ctx);
    if (!digest.ok)
      return refused(digest) && digest.refusal.at === 'digest' && digest.refusal.code !== 'FORBIDDEN' ? inbox.call(surface, {}, ctx) : digest;
    if (!isObject(digest.value) || !isObject(digest.value.states) || !isObject(digest.value.counts)) return digest;
    return { ok: true, value: { inbox: inboxDigestLines(digest.value, ANSWER_MOST) } };
  };

  const pageRead = async (rest: string, uri: string, ctx: C): Promise<Result<unknown>> => {
    const parts = rest.split('/');
    const [asked, block] = [parts[0] ?? '', parts[1]];
    if (parts.length > 2 || !NAMED.test(asked) || (block !== undefined && !/^[1-9][0-9]{0,2}$/u.test(block))) return nowhere(uri);
    let slug = asked;
    if (asked === 'home') {
      const pages = await surface.pages(ctx);
      const home = await homeIn(pages.ok && Array.isArray(pages.value) ? pages.value : [], ctx);
      if (home === null)
        return {
          ok: false,
          refusal: { code: 'PAGE_UNKNOWN', fix: 'This BrainDog declares no Home page. context says what leads here, and resources/list names the pages you can read.', at: 'uri' },
        };
      slug = home.slug;
    }
    const drew = await surface.page({ slug }, ctx);
    if (!drew.ok)
      return refused(drew) && drew.refusal.code === 'PAGE_UNKNOWN'
        ? { ok: false, refusal: { ...drew.refusal, fix: `There is no page called ${asked} that you can read. resources/list names the ones you can.` } }
        : drew;
    const page = isObject(drew.value) ? drew.value : {};
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    if (block !== undefined) {
      const one = blocks[Number(block) - 1];
      if (!isObject(one)) return nowhere(uri);
      return { ok: true, value: blockFitted({ page: slug, n: Number(block), ...one }) };
    }
    const whole = bare(page);
    const size = JSON.stringify(whole).length;
    if (size <= ANSWER_MOST) return { ok: true, value: whole };
    return {
      ok: true,
      value: bare({
        page: slug,
        title: page.title,
        read_at: page.read_at,
        cut: `This page is ${grouped(size)} characters, past the ${grouped(ANSWER_MOST)} one answer carries, so each block is one line here. Read a block whole at its address.`,
        blocks: blocks.map((b, i) =>
          isObject(b)
            ? bare({
                n: i + 1,
                kind: b.kind,
                heading: b.heading,
                rows: Array.isArray(b.rows) ? b.rows.length : undefined,
                matched: b.matched,
                read: `braindog:page/${slug}/${String(i + 1)}`,
              })
            : { n: i + 1, read: `braindog:page/${slug}/${String(i + 1)}` },
        ),
      }),
    };
  };

  /**
   * Read one resource.
   *
   * THE URI IS PARSED AND NEVER PASSED THROUGH, and each segment is checked against a grammar
   * before it becomes an argument.
   *
   * `lean` IS WHETHER `braindog:context` IS THE BRIEFING AS AN AGENT READS IT, the card and what bears on this caller,
   * which is what a client reading the resource is handed; `resources` asks the record's own answer, only to see that
   * it answers, and makes none of the reads the card needs.
   */
  const read = async (uri: string, ctx: C, lean = true): Promise<Result<unknown>> => {
    const { head, rest } = split(uri);

    if (head === 'whoami' && !rest) return surface.whoami(ctx);
    if (head === 'boot' && !rest) return surface.boot(ctx);
    if (head === 'understand' && !rest) return understood(ctx, lean);
    /* WHAT ONE THING IS, BY ITS NAME (`braindog:about/<name>`): the name is a person's words, so it is decoded and handed
       to the record as text, which holds it to a name's length and to what this caller may read. */
    if (head === 'about' && rest) {
      if (!surface.about) return unbuilt('about', 'Search your BrainDog for the name instead.');
      let name: string;
      try {
        name = decodeURIComponent(rest);
      } catch {
        return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'Write the name after braindog:about/ as plain text, with a space as %20.', at: 'uri' } };
      }
      return surface.about({ name }, ctx);
    }
    /* THE BARE ADDRESS SAYS HOW TO ASK, so the list can name the read: asked of `version`, the read rung, and of nobody's name. */
    if (head === 'about' && !rest) {
      if (!surface.about) return unbuilt('about', 'Search your BrainDog for the name instead.');
      const may = await surface.version(ctx);
      return may.ok ? { ok: true, value: { read: 'braindog:about/<name>', said: 'Write the name after about/ as a person says it, with a space as %20.' } } : may;
    }
    if (head === 'handoffs' && !rest) return handoffsRead(ctx);
    if (head === 'briefing' && !rest) return briefingRead(ctx);
    if (head === 'widgets' && !rest) return widgetsRead(ctx);
    if (head === 'exceptions' && !rest) return exceptionsRead(ctx);
    if (head === 'stale' && !rest) return staleRead(ctx);
    if (head === 'learnings' && !rest) return learningsRead(ctx, lean);
    if (head === 'context' && !rest) {
      if (!surface.context) return unbuilt('context', 'Read braindog:boot instead.');
      const raw = await surface.context({} as never, ctx);
      if (!lean || !raw.ok || !isObject(raw.value)) return raw;
      return { ok: true, value: (await briefOf(raw.value, ctx, { text: true, titles: new Map() })).value };
    }
    if (head === 'sessions' && rest === 'live')
      return surface.sessionsLive ? surface.sessionsLive({}, ctx) : unbuilt('sessions/live', 'Nothing else lists live sessions yet.');
    if (head === 'decisions' && !rest) return surface.governance({ register: 'suggestion' } as never, ctx);
    /* THE RECORD'S LIST AS IT ANSWERS IT. Its `key` is the keychain's label and nothing sealed is read to build it, so
       there is nothing here to take out; a second filter would be a second place to keep in step. */
    if (head === 'actions' && !rest)
      return surface.actions ? surface.actions(ctx) : unbuilt('actions', 'Nothing else lists scheduled actions yet.');
    if (head === 'digest' && rest === 'today') return surface.digestToday({}, ctx);
    /* WHAT EACH PATTERN DID, ahead of the states below, which would otherwise hand `patterns` to `inbox` as a state and
       answer its refusal. The window is the record's default; an agent wanting another asks the route. */
    if (head === 'inbox' && rest === 'patterns')
      return surface.inboxPatterns
        ? surface.inboxPatterns({}, ctx)
        : unbuilt(uri, 'Read braindog:inbox/skipped for what the patterns skipped, each with its reason.');
    /* THE STATE IS THE RECORD'S TO CHECK. The segment is held to a name here so a path never reaches it, and a name that
       is not a state is refused by the record, with the seven words it takes; a second list of states here would be a second
       list to keep in step. Who may read it is the record's too, so an agent's token is refused in the record's words. */
    if (head === 'inbox' && (!rest || NAMED.test(rest) || ARRIVAL.test(rest))) return inboxRead(rest, uri, ctx);
    /* THE SCRIPT GRAMMAR IS THIS PACKAGE'S OWN TEXT (`grammars/script.ts` says why it is not the record's), and it is
       still asked of the record before it is answered. `version` is `guard(ctx, 'read')`, the rung `arrangement` puts
       the other two grammars on, and unlike `arrangement` every surface has it, so the command line serves this too. */
    if (head === 'grammar' && rest === 'script') {
      const may = await surface.version(ctx);
      return may.ok ? { ok: true, value: SCRIPT_GRAMMAR } : may;
    }
    /* THE AUTOMATION GRAMMAR IS THIS PACKAGE'S TOO, FOR THE SAME REASON (`automations.ts`), and asked of `version` the same
       way, so every surface serves it. The list and one automation are the record's `automations`, one method for both.
       `version`'s `slash` PICKS WHICH, because it is the one fact about the host this package can read, and the hosts
       set it and the record's `answersSlash` from the same model. A surface whose `version` carries no `slash`, as
       `test/stub.ts`'s does not, is served the grammar that lists `ask_slash` as not running. */
    /* THE CALLS `act` MAKES, from the record's own table as this surface hands it, and asked of `version` first as the
       grammars are, so a caller who may read nothing is told so in the record's words. */
    if (head === 'calls' && !rest) {
      if (!surface.calls || !surface.call) return unbuilt(uri, 'Use the other tools.');
      const may = await surface.version(ctx);
      return may.ok ? { ok: true, value: catalogue(surface.calls()) } : may;
    }
    if (head === 'grammar' && rest === 'automations') {
      const may = await surface.version(ctx);
      return may.ok ? { ok: true, value: may.value.slash === true ? ANSWERED_GRAMMAR : AUTOMATION_GRAMMAR } : may;
    }
    if ((head === 'automations' && !rest) || (head === 'automation' && NAMED.test(rest)))
      return surface.automations
        ? surface.automations(rest ? { rule: rest } : {}, ctx)
        : unbuilt(uri, 'Read braindog:actions for what runs on a clock, or governance for the rule changes waiting on a person.');
    if (head === 'arrangement' || head === 'grammar' || head === 'declaration' || head === 'design') {
      const arranged = surface.arrangement;
      if (!arranged) return unbuilt(uri, 'Read braindog:boot instead.');
      if (head === 'design' && !rest) return arranged({ grammar: 'design' }, ctx);
      if (head === 'arrangement' && !rest) {
        const seen = await arranged({}, ctx);
        return seen.ok ? { ok: true, value: offerPaged(seen.value, '', 1) } : seen;
      }
      /* `offer/<word>`, `offer/<n>` or `offer/<word>/<n>`: a word is lower-case letters, digits and dashes, and a page
         a whole number from 1. */
      const asked = head === 'arrangement' ? offerAsked(rest) : null;
      if (asked) {
        const seen = await arranged({}, ctx);
        return seen.ok ? { ok: true, value: offerPaged(seen.value, asked.word, asked.page) } : seen;
      }
      /* THE RECORD'S OWN GRAMMARS (`packages/record/src/grammar.ts`), all but its `rule`: a rule is said in full by
         `grammar/automations` above, this package's text, and a second rule grammar here would be two to keep in step. */
      if (
        head === 'grammar' &&
        (rest === 'page' || rest === 'register' || rest === 'metric' || rest === 'proposals' || rest === 'ingest' || rest === 'kinds' || rest === 'pack' || /^kind\/[a-z_]+$/u.test(rest))
      )
        return arranged({ grammar: rest }, ctx);
      if (head === 'declaration' && NAMED.test(rest)) return arranged({ page: rest }, ctx);
    }
    if (head === 'page' && rest) return pageRead(rest, uri, ctx);
    const named = NAMED.test(rest);
    if (head === 'schema' && named) return surface.schema({ register: rest }, ctx);
    if (head === 'metric' && named) return surface.metric({ metric: rest }, ctx);
    if (head === 'skill' && SKILL.test(rest)) {
      /* `list` BY NAME, BECAUSE A SKILL IS A ROW. The register's own read check is the permission,
         and a register this record does not have answers `REGISTER_UNKNOWN` in the record's words. */
      const found = await surface.list({ register: 'skills', where: { field: 'name', is: rest }, limit: 1 }, ctx);
      if (!found.ok) return found;
      const row = found.value.rows[0];
      return row ? { ok: true, value: compacted(row) } : nowhere(uri);
    }
    return nowhere(uri);
  };

  /**
   * What this caller can read, at this moment.
   *
   * EVERY ADDRESS IS ASKED BEFORE IT IS ADVERTISED. A listing that names what the caller may not read
   * tells them it exists, and one that names what then refuses sends an agent to a certain refusal.
   * So the list is never ahead of the record: each fixed resource and each figure is read first, a
   * page is withheld when every block on it was withheld, and a register comes from `boot`, which
   * lists only what the caller may read.
   *
   * ONE READ WHEN THE HOST ANSWERS `offered`. The record says in one read what each reader would let this
   * caller see, so nothing is run to find out: no fixed address it decides is read, no page is drawn, no figure read.
   * The order and the words are today's, so a client sees the same list sooner. A host without it, or one that refuses
   * it, is listed the way below, exactly as before.
   */
  const resources = async (ctx: C): Promise<Resource[]> => {
    const said = surface.offered ? await surface.offered(ctx) : null;
    const now = said?.ok ? offeredNow(said.value) : null;
    return now ? resourcesOffered(now, ctx) : resourcesRead(ctx);
  };

  /**
   * The list from `offered`'s answer. A fixed address it decides is listed when it names it and this surface has the
   * method that serves it; one it does not decide is read first, as before, a few at once. A page, figure or skill is
   * listed under today's address and words, and the name tests are today's, so nothing listed is a name `read` refuses.
   */
  const resourcesOffered = async (now: OfferedNow, ctx: C): Promise<Resource[]> => {
    const served = (address: string): boolean => {
      const method = SERVED_BY[address];
      return method === undefined || surface[method] !== undefined;
    };
    const fixed = await pooled(FIXED, async (r) => {
      if (OFFERED_DECIDES.has(r.name)) return now.fixed.has(r.name) && served(r.name) ? r : null;
      return (await read(r.uri, ctx, false)).ok ? r : null;
    });
    const out: Resource[] = fixed.filter((r) => r !== null);
    for (const list of now.lists)
      if (NAMED.test(list.id)) out.push(resource(`schema/${list.id}`, `What ${list.name} holds: its fields, their types, and what each may take.`));
    for (const page of now.pages)
      if (NAMED.test(page.slug)) out.push(resource(`page/${page.slug}`, `${page.title}, with every block run: rows and figures, never markup.`));
    for (const f of now.figures)
      if (!f.param && NAMED.test(f.id))
        out.push(resource(`metric/${f.id}`, `${f.name ? `${f.name}: the` : 'The'} figure ${f.id}, with its target and how it compares.`));
    const named = new Set<string>();
    for (const skill of now.skills) {
      if (!SKILL.test(skill.name) || named.has(skill.name)) continue;
      named.add(skill.name);
      out.push(resource(`skill/${skill.name}`, skill.when !== null ? `When to use it: ${skill.when}` : `The text of the skill ${skill.name}.`));
    }
    return out;
  };

  /** The list as it was before `offered`: each fixed address read, each page drawn, each figure and skill asked. */
  const resourcesRead = async (ctx: C): Promise<Resource[]> => {
    const out: Resource[] = [];
    const offered = await pooled(FIXED, async (r) => ((await read(r.uri, ctx, false)).ok ? r : null));
    out.push(...offered.filter((r) => r !== null));

    const boot = await surface.boot(ctx);
    const registers = boot.ok ? boot.value.registers : [];
    for (const register of registers)
      if (NAMED.test(register.id))
        out.push(resource(`schema/${register.id}`, `What ${register.name} holds: its fields, their types, and what each may take.`));

    const pages = await surface.pages(ctx);
    const drew = await drawn(pages.ok ? pages.value : [], ctx);
    out.push(...drew.pages);
    /* EVERY FIGURE THE CALLER MAY READ, AND NOT ONLY A DRAWN ONE, whenever the host names them (`figuresFor`). A
       TEMPLATE IS LEFT TO `braindog:metric/{id}`: an address is offered here only if reading it answers, and one read
       about no project answers `REF_UNKNOWN`. The record's name leads, because it is the words a person used. */
    for (const f of await figuresFor(ctx, async () => drew.figures))
      if (!f.param)
        out.push(resource(`metric/${f.id}`, `${f.name ? `${f.name}: the` : 'The'} figure ${f.id}, with its target and how it compares.`));

    /* A SKILL BY NAME, when this caller can read the skills register at all. When to use it is the
       headline, so it is the description. */
    if (registers.some((r) => r.id === 'skills')) {
      const skills = await surface.list({ register: 'skills', limit: 200 }, ctx);
      const named = new Set<string>();
      if (skills.ok)
        for (const row of skills.value.rows) {
          const name = row.fields.name;
          if (row.state === 'retired' || typeof name !== 'string' || !SKILL.test(name) || named.has(name)) continue;
          named.add(name);
          const trigger = row.fields.trigger;
          out.push(resource(`skill/${name}`, typeof trigger === 'string' ? `When to use it: ${trigger}` : `The text of the skill ${name}.`));
        }
    }

    return out;
  };

  return {
    list: () => TOOLS,
    resources,
    read,
    /** One tool's full JSON answer, as `structuredContent` carries it: what a caller in process reads. */
    call: async (name: string, args: Args, ctx: C): Promise<Result<unknown>> => (await answer(name, args, ctx, false)).result,
    answer,
  };
}

/** One tool's answer as a transport sends it: the result, the text an agent reads, and the JSON beside it. */
export type Said = { result: Result<unknown>; text: string; structured: Record<string, unknown> };

/**
 * A result and its text, with the JSON a client reads beside the text: a value, or the refusal whole, each held to one
 * answer's size (`fittedJson`).
 *
 * `text` UNDEFINED IS THE JSON ITSELF, what `format: "full"` and a tool with no brief answer: the value as it came where
 * it fits, and the fitted JSON with its `cut` where it does not, so the text is JSON a client can parse and never the
 * first forty thousand characters of a longer one.
 */
function said(result: Result<unknown>, text?: string): Said {
  const whole = result.ok ? objectOf(result.value) : refused(result) ? (result.refusal as unknown as Record<string, unknown>) : { code: 'VERSION_STALE' };
  const structured = fittedJson(whole);
  const json = (): string => (structured !== whole ? JSON.stringify(structured) : JSON.stringify(result.ok ? result.value : whole));
  return { result, text: capped(text ?? json()), structured };
}

/**
 * `structuredContent` is an object, by the specification's own type, so a value that is not one travels inside one:
 * a page of rows as `{ rows }`, and anything else as `{ value }`.
 */
const objectOf = (value: unknown): Record<string, unknown> =>
  isObject(value) ? value : Array.isArray(value) ? { rows: value } : { value: value ?? 'none' };

/**
 * What `handoff` says of a step it took or dropped: whose step, in its words, and what follows. The run that left it is
 * named by its app with its handle beside it, as the briefing's Next line names it.
 */
export function stepSaid(step: { left: string; next: string; agent?: string | null }, took: boolean): string {
  const app = agentOf(step.agent ?? undefined, true);
  const whose = app === agentOf(undefined, true) ? step.left : `${app} (${step.left})`;
  const words = step.next.trim() === '' ? 'a step with no words' : clip(step.next.trim(), 160);
  return took
    ? `You took the step ${whose} left: ${words}. It is yours now; call handoff with your own next step before you stop.`
    : `Dropped the step ${whose} left: ${words}. Nobody is handed it now.`;
}

/** The writes whose answers end in a receipt. `undo` is itself the way back, so it has none. */
const RECEIPTED: ReadonlySet<string> = new Set(['create', 'update', 'log', 'triage', 'handoff', 'propose', 'meet']);

/**
 * A write's receipt: its first line as it was said in names, then the call that takes it back.
 *
 * NO CREDENTIAL CAN BE IN IT, because it quotes only the answer's own line, which says names and never a stored value,
 * and the batch, an opaque handle. A write with no batch says so rather than offering an undo that would fail.
 *
 * `inText` LEAVES THE FIRST LINE OUT: in the text the receipt sits under that very line, so every write
 * answered it twice. `structuredContent.receipt` keeps it whole, for a client that shows the receipt alone.
 */
function receiptOf(name: string, said: string, turn: Turn, value: unknown, inText = false): string {
  const first = (said.split('\n')[0] ?? '').trim().replace(/[.\s]+$/u, '');
  const did = first === '' ? `Done with ${name}` : first.length > 110 ? `${first.slice(0, 109)}…` : first;
  const head = inText && first !== '' ? 'Receipt:' : `Receipt: ${did}.`;
  if (turn.batch !== undefined) return `${head} To undo, call act with call "undoOwn" and args {"batch": "${turn.batch}"}.`;
  /* A HANDOFF THAT MOVED ONLY THE RUN'S OWN STEP has nothing undo puts back: the next handoff is how it changes. */
  if (name === 'handoff') return `${head} To change it, call handoff again.`;
  if (turn.asks !== undefined) return `${head} To take it back, call propose with withdraw "${turn.asks}".`;
  /* A PROPOSAL THE LADDER LET THROUGH WAS WRITTEN (`landed`, or the `rung` it went through on), so it is not said to have written nothing. */
  const ruled = ruledOf(value);
  const landed = ruled !== null && !('filed' in ruled);
  if (!landed && (name === 'propose' || (isObject(value) && 'filed' in value))) return `${head} Nothing was written, so there is nothing to undo.`;
  /* A NAME ALONE IS NOTED, NOT WRITTEN: `meet` says `mention` and files no question, so there is nothing to put back. */
  if (name === 'meet' && isObject(value) && value.mention === true && value.question === undefined) return `${head} Nobody was added to People, so there is nothing to undo.`;
  /* TRIAGE HAS ITS OWN WAY BACK, `back` (AK23): "the owner can put it back from the app" sent the agent away from it. */
  if (name === 'triage') return `${head} To put it back to review, call triage with the same arrival and "back": true.`;
  return `${head} No undo handle came back for this one; the owner can put it back from the app.`;
}

/** The tools whose arguments go to the record whole, which names a key its method does not take in its own sentence. */
const PASSED_WHOLE: ReadonlySet<string> = new Set(['propose', 'handoff', 'meet', 'triage']);

/** The argument another tool, or most servers, call by the name a caller sent: what a stray key most likely meant. */
const MEANT: Readonly<Record<string, string>> = { fields: 'patch', patch: 'fields', query: 'q', filter: 'where', id: 'spoken' };

/**
 * An argument the tool does not take, refused with what it does take and the call with the key it meant, or `null`.
 *
 * NEVER SET ASIDE, BECAUSE A TOOL THAT READS ITS ARGUMENTS BY NAME DROPPED ANY OTHER WITHOUT A WORD, and the schemas no
 * longer say `additionalProperties: false` (`obj`). Measured on the seed: `update` with `fields` where it takes `patch`
 * answered "Changed" at a new version and changed nothing, which is `create`'s word and the one `patch`'s own description
 * names, and `search` with `query` answered "nothing found". A tool whose arguments go to the record whole is the
 * record's to check (`PASSED_WHOLE`), and `format` is this layer's own on every tool.
 */
function strayIn(name: string, sent: Args): { ok: false; refusal: Refusal } | null {
  if (PASSED_WHOLE.has(name)) return null;
  const takes = takesOf(name);
  const quiet = toolNamed(name)?.quiet ?? [];
  const stray = Object.keys(sent).find((k) => !takes.includes(k) && !quiet.includes(k));
  if (stray === undefined) return null;
  const alias = Object.hasOwn(MEANT, stray) ? MEANT[stray]! : '';
  const meant = closest(stray, takes.map((id) => ({ id }))) ?? (takes.includes(alias) ? alias : null);
  const { [stray]: was, ...rest } = sent;
  const call = meant === null || Object.hasOwn(sent, meant) ? undefined : callOf(name, { ...rest, [meant]: was });
  return { ok: false, refusal: taught({ code: 'FIELD_UNKNOWN', fix: `${stray} is not something ${name} takes.`, at: stray, allowed: takes }, call) };
}

/**
 * The value of `allowed` a word most likely meant: by spelling (`closest`), then by meaning, "started" for doing and
 * "finished" for done, and else `null`: a value no word points to is never guessed as the first (audit 10k, AK14; RL4).
 */
const MEANINGS: Readonly<Record<string, readonly string[]>> = {
  doing: ['started', 'start', 'in progress', 'in_progress', 'inprogress', 'active', 'working', 'wip', 'ongoing', 'underway', 'progress'],
  done: ['finished', 'finish', 'complete', 'completed', 'closed', 'resolved', 'shipped', 'over'],
  open: ['new', 'todo', 'to do', 'to_do', 'pending', 'not started', 'unstarted'],
  backlog: ['later', 'someday', 'icebox'],
  waiting: ['blocked', 'on hold', 'on_hold', 'held', 'paused', 'stuck'],
  cancelled: ['canceled', 'dropped', 'abandoned', 'killed', 'wontdo'],
  paid: ['settled', 'cleared'],
};
export function enumMeant(said: string, allowed: readonly string[]): string | null {
  if (allowed.length === 0) return null;
  const among = allowed.map((id) => ({ id }));
  const spelt = closest(said, among);
  if (spelt !== null) return spelt;
  const word = said.trim().toLowerCase();
  for (const [meant, words] of Object.entries(MEANINGS)) {
    if (!words.includes(word)) continue;
    const found = closest(meant, among);
    if (found !== null) return found;
  }
  /* NEITHER SPELLING NOR MEANING FINDS ONE: no guess. The refusal lists the values (RL4). */
  return null;
}

/**
 * The question a refused write would have been, as the call that asks it: a change to a row as a rowset on it, a new
 * row as a rowset of one, with a question said in the row's words. `undefined` for a tool that writes no row.
 */
function askedCall(name: string, args: Args, turn: Turn): string | undefined {
  if (name === 'update' && typeof args.spoken === 'string' && isObject(args.patch)) {
    const title = turn.titles.get(args.spoken.trim());
    return callOf('propose', {
      question: `Change ${title === undefined ? 'this one' : `"${clip(title, 60)}"`}?`,
      body_kind: 'rowset',
      body: { rows: [{ at: args.spoken.trim(), ...(typeof args.version === 'number' ? { version: args.version } : {}), patch: args.patch }] },
    });
  }
  if (name === 'create' && typeof args.register === 'string' && isObject(args.fields))
    return callOf('propose', { question: `Add this to ${args.register}?`, body_kind: 'rowset', body: { register: args.register, rows: [args.fields] } });
  return undefined;
}

/** A refusal with its corrected call beside it, or as it was where there is none. */
function taught(refusal: Refusal, call: string | undefined): Refusal {
  return call === undefined ? refusal : (Object.assign({}, refusal, { try: call }) as Refusal);
}

/**
 * A write that arrived second, as a client reads it: who wrote first, in words, the row as it stands, the version to
 * send, and the call that sends it.
 *
 * "RE-APPLY YOUR CHANGE" AND NOT "SEND IT AGAIN". The `try` is the same change sent at the version that holds now,
 * which is right for a patch that says only what this agent meant to change, and the sentence says to look first.
 */
function staleOf(conflict: { version: number; current: unknown; actor: string }, look: Look, call: string, sent?: number): Record<string, unknown> {
  const ahead = sent !== undefined && sent > conflict.version;
  return {
    code: 'VERSION_STALE',
    fix: ahead
      ? `You sent version ${String(sent)}, but it is only at version ${String(conflict.version)}; nobody changed it. current is how it stands: apply your change to it and send that version.`
      : `${look.actor(conflict.actor)} changed it after you read it. current is how it stands at version ${String(conflict.version)}: re-apply your change to it and send that version.`,
    version: conflict.version,
    actor: conflict.actor,
    current: conflict.current,
    try: call,
  };
}

/** A trial's answer as text: the record's own account of it, its empty parts gone and its length held to one answer. */
function trialSaid(tried: Result<unknown>): string {
  if (!tried.ok) return '';
  const again = isObject(tried.value) && isObject(tried.value.rule_again) ? tried.value.rule_again : null;
  if (again !== null) return againSaid(again);
  return `Tried, and nothing was filed. Send it again without try to ask the owner.\n${capped(JSON.stringify(bare(tried.value)), ANSWER_MOST - 100)}`;
}

/**
 * A rule run again, dry, in words: what it would fill and leave, how many it would win and lose, and which rules took the
 * ones it loses, by name. "Would fill 7, 3 already set by hand" is the sheet's line; this is the agent's.
 */
function againSaid(v: Record<string, unknown>): string {
  const n = (k: string): number => (typeof v[k] === 'number' ? v[k] : 0);
  const name = typeof v.name === 'string' ? v.name : 'This rule';
  const takers = Array.isArray(v.taken_by)
    ? v.taken_by.filter(isObject).map((t) => `${String(t.name)} (${grouped(typeof t.count === 'number' ? t.count : 0)})`)
    : [];
  return [
    `${name}, run again: would fill ${grouped(n('filled'))} and leave ${grouped(n('left'))} of the ${grouped(n('matches'))} it matches.`,
    `Won ${grouped(n('won'))}, lost ${grouped(n('lost'))}${takers.length ? ` to ${takers.join(', ')}` : ''}.`,
    'Nothing was changed. The owner runs it from the rule\'s own page.',
  ].join('\n');
}

/** Text held to one answer's size, cut at a line where it is not, with a line that says so. */
function capped(text: string, most = ANSWER_MOST): string {
  if (text.length <= most) return text;
  const cut = text.slice(0, most - 120);
  const end = cut.lastIndexOf('\n');
  return `${end > most / 2 ? cut.slice(0, end) : cut}\nCut at ${grouped(most)} characters, the most one answer carries. Narrow the call or ask fewer.`;
}

/** The most characters one text of a JSON answer keeps once its lists are cut and it still does not fit. */
const JSON_TEXT_MOST = 2_000;

/**
 * The JSON an answer carries as `structuredContent`, held to `ANSWER_MOST` as its text is, with a `cut` that says what
 * went: each list cut by path and how many it kept of how many, and how many long texts were shortened.
 *
 * THE TEXT WAS CAPPED AND THE JSON BESIDE IT NEVER WAS. A client that renders `structuredContent`, or hands it to its
 * model, read the whole answer however large: a `history` of a busy row, a `context` with every key, a figure with a
 * thousand groups, each past the ten thousand tokens no host shows a model whole. `list`, `activity` and `governance`
 * already read a page again with fewer rows (`fitted`), and a page resource answers a line a block; this is the floor
 * under every other answer.
 *
 * THE LARGEST LIST IS CUT FIRST, from its end, by the share it is over, until the answer fits; then any text longer than
 * two thousand characters is shortened. A list keeps its first entry, because an empty list reads as "there are none".
 * A `cursor` beside a cut `rows` goes too, since it points past the rows that were dropped and following it would skip
 * them. An answer that still does not fit, one object with thousands of keys, is answered as its keys and the sentence.
 *
 * ANY `rows`, AT ANY DEPTH, TAKES THE CURSOR BESIDE IT AND THE ANSWER'S OWN: only `rows` at the top was asked of, so a
 * page's `x.rows` cut under its own cursor kept one that skipped what was dropped.
 * AND A CUT LIST THAT CARRIED MONEY SAYS ITS TOTALS STILL COUNT WHAT WENT: a total beside it was summed by the record over
 * every entry, and read against the entries left it no longer adds up.
 */
export function fittedJson(value: Record<string, unknown>, most = ANSWER_MOST): Record<string, unknown> {
  const size = (v: unknown): number => JSON.stringify(v)?.length ?? 0;
  if (size(value) <= most) return value;
  /* ROOM FOR THE SENTENCE, which names each list it cut. */
  const room = most - 600;
  const out = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  const cuts = new Map<string, { kept: number; of: number; holder: object; key: string | number; money: boolean }>();
  let now = size(out);
  for (let tries = 0; tries < 64 && now > room; tries += 1) {
    const big = largestList(out);
    if (big === null) break;
    const keep = Math.min(big.list.length - 1, Math.max(1, Math.floor((big.list.length * Math.max(0, big.bytes - (now - room))) / big.bytes)));
    (big.holder as Record<string | number, unknown>)[big.key] = big.list.slice(0, keep);
    const had = cuts.get(big.path);
    cuts.set(big.path, { kept: keep, of: had?.of ?? big.list.length, holder: big.holder, key: big.key, money: (had?.money ?? false) || big.list.slice(keep).some((e) => carriesMoney(e)) });
    now = size(out);
  }
  let texts = 0;
  for (let longest = JSON_TEXT_MOST; now > room && longest >= 250; longest = Math.floor(longest / 2)) {
    /* EACH PASS CUTS EVERY TEXT THE LAST ONE DID AND MORE, so the count is the last pass's. */
    texts = Math.max(texts, shortened(out, longest));
    now = size(out);
  }
  /* FOUR LISTS BY PATH AT MOST, so the sentence stays inside the room kept for it and the JSON in `full` still parses. */
  const parts = [...cuts].slice(0, 4).map(([path, c]) => `${path} ${grouped(c.kept)} of ${grouped(c.of)}`);
  if (cuts.size > 4) parts.push(`${counted(cuts.size - 4, 'more list')} cut`);
  if (texts > 0) parts.push(`${counted(texts, 'long text')} shortened`);
  let dropped = false;
  const rowsCut = [...cuts.values()].filter((c) => c.key === 'rows');
  for (const holder of [out, ...rowsCut.map((c) => c.holder)])
    /* WHATEVER SHAPE THE CURSOR HAS: this server says one as text, but an answer passed through as the record gave it
       may carry a number or an object, and either still points past the rows that went. */
    if (rowsCut.length > 0 && isObject(holder) && holder.cursor !== undefined && holder.cursor !== null) {
      delete holder.cursor;
      dropped = true;
    }
  const money = [...cuts].filter(([, c]) => c.money).map(([path]) => path);
  const totals =
    money.length === 0
      ? ''
      : ` Any total here still counts what was cut from ${money.slice(0, 2).join(' and ')}${money.length > 2 ? ' and the rest' : ''}, so it no longer adds up to the entries shown.`;
  const said = `Cut at ${grouped(most)} characters, the most one answer carries${parts.length > 0 ? `: ${parts.join(', ')}` : ''}.${totals}${
    dropped ? ' The cursor went with what was cut, so ask again with a smaller limit.' : ''
  } Narrow the call or ask fewer.`;
  const before = typeof out.cut === 'string' ? `${out.cut} ` : '';
  if (now <= room) return { ...out, cut: `${before}${said}` };
  return {
    cut: `This answer is ${grouped(size(value))} characters, past the ${grouped(most)} one answer carries, and nothing in it could be cut to fit. Narrow the call.`,
    keys: Object.keys(value).slice(0, 200),
  };
}

/** Whether a JSON value holds an amount of money, `{ amount, currency }`, four levels down at most. */
function carriesMoney(value: unknown, depth = 0): boolean {
  if (moneyIn(value) !== null) return true;
  if (depth >= 4) return false;
  if (Array.isArray(value)) return value.some((v) => carriesMoney(v, depth + 1));
  return isObject(value) && Object.values(value).some((v) => carriesMoney(v, depth + 1));
}

/** The largest list in a JSON value with more than one entry, four levels down at most: where it is, and its size. */
function largestList(root: Record<string, unknown>): { holder: object; key: string | number; path: string; list: unknown[]; bytes: number } | null {
  let best: { holder: object; key: string | number; path: string; list: unknown[]; bytes: number } | null = null;
  const walk = (holder: object, key: string | number, value: unknown, path: string, depth: number): void => {
    if (Array.isArray(value)) {
      if (value.length > 1) {
        const bytes = JSON.stringify(value).length;
        if (best === null || bytes > best.bytes) best = { holder, key, path, list: value, bytes };
      }
      if (depth < 4) value.forEach((v, i) => walk(value, i, v, `${path}[${String(i)}]`, depth + 1));
      return;
    }
    if (isObject(value) && depth < 4) for (const [k, v] of Object.entries(value)) walk(value, k, v, path === '' ? k : `${path}.${k}`, depth + 1);
  };
  for (const [k, v] of Object.entries(root)) walk(root, k, v, k, 1);
  return best;
}

/** Every text in a JSON value longer than `most`, cut to it with three dots where it was cut; how many were cut. */
function shortened(value: unknown, most: number): number {
  let n = 0;
  const walk = (holder: Record<string | number, unknown>, key: string | number): void => {
    const v = holder[key];
    if (typeof v === 'string' && v.length > most) {
      holder[key] = `${v.slice(0, most - 3)}...`;
      n += 1;
    } else if (Array.isArray(v)) v.forEach((_, i) => walk(v as unknown as Record<number, unknown>, i));
    else if (isObject(v)) for (const k of Object.keys(v)) walk(v, k);
  };
  if (isObject(value)) for (const k of Object.keys(value)) walk(value, k);
  return n;
}

/** One block of a page, its rows cut until it fits one answer, and the block saying how many it holds. */
function blockFitted(block: Record<string, unknown>): Record<string, unknown> {
  const whole = bare(block) as Record<string, unknown>;
  if (JSON.stringify(whole).length <= ANSWER_MOST || !Array.isArray(whole.rows) || whole.rows.length <= 1) return whole;
  let rows = whole.rows;
  while (rows.length > 1 && JSON.stringify({ ...whole, rows }).length > ANSWER_MOST) rows = rows.slice(0, Math.floor(rows.length * 0.7));
  return { ...whole, rows, cut: `${grouped(whole.rows.length - rows.length)} more than one answer carries. The page in BrainDog shows them all.` };
}

/** The handles and row ids the questions on a page name, in their words and their reasons. */
function questionHandles(rows: readonly unknown[]): string[] {
  return rows.flatMap((r) => (isObject(r) ? [r.question, r.reason].flatMap((t) => (typeof t === 'string' ? handlesIn(t) : [])) : []));
}

/** Whether any line of a page is signed by a person, which is when the people are read to name them. */
function peopleIn(rows: readonly unknown[]): boolean {
  return rows.some((r) => isObject(r) && ['actor', 'opened_by', 'decided_by'].some((k) => typeof r[k] === 'string' && /^(?:p_|person:)/u.test(r[k] as string)));
}

/** The runs a page of log lines or questions is signed by, by handle. */
function actorsIn(rows: readonly unknown[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (!isObject(r)) continue;
    for (const k of ['actor', 'opened_by', 'decided_by'])
      if (typeof r[k] === 'string' && RUN_HANDLE.test(r[k] as string)) out.add(r[k] as string);
  }
  return [...out];
}
