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
 * token because the vault refuses every one, and `dry_run` previews a rule, which only a person
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

import { codeOf, type Result } from '@braindog/ports';

import { SCRIPT_GRAMMAR } from '../grammars/script.ts';
import { ANSWERED_GRAMMAR, AUTOMATION_GRAMMAR } from './automations.ts';

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
  create(args: { register: string; fields: Args; note?: string }, ctx: C): Answer;
  update(args: { register: string; seq: number; patch: Args; version?: number; note?: string }, ctx: C): Answer;
  pages(ctx: C): Answer<{ slug: string; title: string }[]>;
  page(args: { slug: string }, ctx: C): Answer;
  metric(args: { metric: string }, ctx: C): Answer;
  digestToday(args: { digest?: string }, ctx: C): Answer;
  context?(args: Record<string, never>, ctx: C): Answer;
  handoff?(args: Args, ctx: C): Answer;
  meet?(args: Args, ctx: C): Answer;
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
  recentHistory?(args: { limit?: number }, ctx: C): Answer;
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
  tryAutomation?(args: { body: Record<string, unknown>; sample?: unknown }, ctx: C): Answer;
  /**
   * What arrived and no rule filed, in one state or all of them, with a count for each. The record's own rung, which is
   * the owner and a token its owner gave the `inbox` reach, and optional for the command line's reason above: its surface
   * is a fixed list.
   */
  inbox?(args: { state?: string }, ctx: C): Answer;
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
const WITHHELD = new Set(['FORBIDDEN', 'LEVEL_REQUIRED']);

export type Tool = {
  name: string;
  /** What it does, in the words an agent reads before choosing it. Kept short: it is in every turn. */
  description: string;
  /** JSON Schema for the arguments. Small on purpose. */
  input: Record<string, unknown>;
  /** `read` tools never change anything, and a client may say so to its user. */
  writes: boolean;
};

const str = (description: string) => ({ type: 'string', description });
const int = (description: string) => ({ type: 'integer', description });
/* `required` is left out when empty: in every tool that has none, it is tokens that say nothing. */
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
});

export const TOOLS: readonly Tool[] = [
  {
    name: 'record_index',
    /* AND ITS FIGURES, BECAUSE NOTHING ELSE AN AGENT CALLS NAMES ONE. With the one tool
       that read figures gone, the probe called all nine reads with their most helpful arguments and not one answer
       named a figure the record holds; they were resources, and a client that reads no resources had none. */
    description: 'What this record holds: its registers, how many rows in each, its figures, and its version. The cheap way to learn register names.',
    input: obj({}),
    writes: false,
  },
  {
    name: 'context',
    /* THAT IT IS THE FIRST CALL, AND THAT IT IS ABOUT WHERE YOU ARE, IS THE INSTRUCTIONS' FIRST
       LINE, which a client shows in the same payload. What is left is what comes back. */
    description:
      'Your session, your project, its open work, questions waiting on the person, people, the keys and servers you may use (by name, never a value), skills and learnings, and everything global. Call it again after a long pause.',
    input: obj({}),
    writes: false,
  },
  {
    name: 'schema',
    description: 'The fields of one register, their types and what each may take. Read before writing.',
    input: obj({ register: str('A register id from record_index.') }, ['register']),
    writes: false,
  },
  {
    name: 'get',
    /* THE GRAMMAR IS SAID ONCE, in the argument that takes it. It was in both, and a client shows a
       model the description and the schema together, so the three forms were read twice for 27
       tokens in every turn of every session. */
    /* AND ONE FIGURE, WHICH PAID FOR ITSELF IN A CLAUSE AND NOT A TOOL. The count was fifteen and a sixteenth cost
       91 to 117 tokens each time one was measured; this clause, the one in `spoken` and `record_index`'s cost 16, and
       the list measured 2,528 before and 2,544 after. A figure's id is a bare lowercase name, which no row form is. */
    description: 'One row or figure, by the id a person says out loud.',
    input: obj({ spoken: str('register#number, a prefixed id such as S42, a row id from a ref field, or a figure from record_index.') }, ['spoken']),
    writes: false,
  },
  {
    name: 'list',
    /* "NARROWED BY A PREDICATE. THE PREDICATE IS A TREE" SAID "PREDICATE" TWICE; saying it once paid for most of
       `fields` below. The list measured 2,720 before `fields` and 2,751 after, of the 2,760 `budget.test.ts` holds. */
    description:
      'Rows of one register, newest first, narrowed by a predicate tree: {"field":"state","is":"open"}, or {"all":[...]}.',
    input: obj(
      {
        register: str('A register id.'),
        /* "A PREDICATE TREE" WAS SAID HERE AND IN THE DESCRIPTION ABOVE, which a client shows in the same breath. The
           five tokens it cost went to `propose`'s `from_version`. */
        where: { type: 'object', description: 'Omit for everything.' },
        /* THE RECORD'S OWN TWO NUMBERS, AND THEY WERE "1 to 200. Default 25.", which is neither.
           `kernel.list` is `Math.min(Math.max(1, Math.floor(Number(q.limit)) || 50), 500)`
           (`packages/kernel/src/index.ts:1608`) and this tool forwards `limit` untouched, so nothing
           anywhere made either figure true. Driven over `POST /mcp` with 260 rows in one register: no
           `limit` answered 50 rows, and `limit: 300` answered all 260, straight past the ceiling the
           description named. An agent that trusted "Default 25" reasoned about 50 rows believing it
           had asked for 25, and one that wanted 400 paged twice for what the record gives in one go.
           The default is 20 now, and true, because the `list` below sends 20 when the call
           names no limit; the ceiling is still the record's. */
        limit: int('1 to 500. Default 20.'),
        cursor: str('From a previous answer.'),
        /* THE ONE WAY PAST THE CUT, said where it is used. A row's long text stops at 280 characters and the row says
           `clipped: true`, so an agent that needs the whole write-up names its field here or reads the row with `get`. */
        fields: { type: 'array', items: { type: 'string' }, description: 'Text fields to answer whole, uncut.' },
      },
      ['register'],
    ),
    writes: false,
  },
  {
    name: 'search',
    description: 'Rows whose text matches, across every register you can see. Every word is a prefix.',
    /* AND 100, NOT THE 50 THIS SAID, for `list`'s reason one tool up. `ftsSearch` is
       `Math.min(Math.max(1, opts.limit ?? 20), 100)` (`packages/kernel/src/fts.ts:116`). Measured over
       130 rows all matching one word: `limit: 80` answered 80 hits, which an agent reading this was
       told it could not ask for. The default of 20 was right and is unchanged. */
    /* "WHAT TO LOOK FOR" IS WHAT `q` BESIDE "ROWS WHOSE TEXT MATCHES" ALREADY SAYS, and its five tokens went to `propose`. */
    input: obj({ q: str('Plain words; the operators are not read.'), limit: int('1 to 100. Default 20.') }, ['q']),
    writes: false,
  },
  {
    name: 'history',
    description: 'The writes that made one row, in order, each with who and when.',
    input: obj({ spoken: str('register#number, or a prefixed id such as LN7.') }, ['spoken']),
    writes: false,
  },
  {
    name: 'activity',
    description:
      'What has changed in the whole record lately, newest first: each write, the row it touched, and who made it. Read it to pick up after another session.',
    input: obj({ limit: int('1 to 200. Default 50.') }),
    writes: false,
  },
  {
    name: 'governance',
    description:
      'What has been proposed and not yet answered, what was decided and why, and what was predicted. Ask by id for a body.',
    input: obj({
      register: str('suggestion (the default), decision, or prediction.'),
      id: str('One row, by its SG or D number.'),
      status: str('open (the default), resolved, or all.'),
      limit: int('At most 200.'),
      cursor: str('From a previous answer.'),
    }),
    writes: false,
  },
  {
    name: 'propose',
    /* WHEN TO REACH FOR IT IS SAID IN THE INSTRUCTIONS, and was said again here: "an agent never
       decides, lay out options with propose" and "to change something you may not change yourself,
       propose it" are the two clauses this description carried, in the same payload, a line apart. */
    description: 'Put a question to the person, with what you would do about it. It changes nothing by itself.',
    input: obj(
      {
        question: str('One sentence a person can answer.'),
        body_kind: str('options, rowset, pattern, change, pack, settings or arrange.'),
        /* THE change EXAMPLE WAS ONE THE RECORD REFUSES. Sent as written it answered `REQUIRED_MISSING` at
           `body.declaration_id`, and it taught the whole-declaration form for adding a field, which meant copying every
           field of the list and racing any other agent doing the same.
           `record/test/schema-add.test.ts` files the addition below against a real record. The rowset example lacked its
           `register`, which `checkBody` also requires. The fix cost 33 tokens of the 35 the ceiling had left (2,565 to
           2,598), which is why the addition names no `register` of its own: the record reads it from `declaration_id`.
           AND A WHOLE BODY NAMES THE VERSION IT WAS READ AT. Stamped by the record at filing, a body read at v1 and filed
           after another change reached v2 installed over that change (`record/test/change-drawn.test.ts`). The record now
           takes `from_version` from the proposer, and an agent that is never told to send it is stamped as before. Nine
           tokens, paid for by `list`'s `where` and `search`'s `q`, which were each repeating their own description. */
        body: {
          type: 'object',
          description:
            'options: {"options":[...]}, two or more, each with id, label and because. rowset: {"register":"skills","rows":[{"at":"skills#3","version":1,"patch":{...}}]}. change adds fields: {"declaration_id":"register.things","to":{"add":{"fields":[{"id":"domain","type":"url"}]}}}, or to is a whole declaration of that id; send the from_version you read. pack, settings and arrange: read braindog:arrangement and braindog:grammar/proposals first.',
        },
      },
      ['question', 'body_kind', 'body'],
    ),
    writes: true,
  },
  {
    name: 'create',
    description: 'Add a row to a register, which comes back with the number the record gave it.',
    input: obj(
      { register: str('A register id.'), fields: { type: 'object', description: 'Field ids to values.' }, note: str('One sentence a person reads in six weeks.') },
      ['register', 'fields'],
    ),
    writes: true,
  },
  {
    name: 'update',
    /* COMPARE-AND-SET IS A RULE ABOUT EVERY WRITE, so it is one line of the instructions and no
       longer a second copy here. What is left is what is true of this tool alone.
       AND DELETING IS SAID, because nothing told an agent how. Other records hand their agents a
       delete tool; here it is `deleted_at` through the same verb and the same permission, and an
       agent had no way to find that out. */
    description: 'Change a row. Send the version you read.',
    input: obj(
      {
        spoken: str('register#number, or a prefixed id such as LN7.'),
        patch: { type: 'object', description: 'Field ids to values, and null clears one. deleted_at true deletes the whole row.' },
        version: int("The row's version when you read it."),
        note: str('One sentence a person reads in six weeks.'),
      },
      ['spoken', 'patch'],
    ),
    writes: true,
  },
  {
    name: 'log',
    description: 'Append one note to a row, changing nothing about it.',
    /* A NOTE ABOUT NOTHING IN PARTICULAR IS ONE CALL. It needed a row, so an agent first
       asked `context` for its session's id, or wrote something to open one, and then logged on it: two calls for what
       a log tool elsewhere does in one. Left out, the note goes on the caller's own session, and `log` in `tools`
       below says how. */
    input: obj(
      { spoken: str('register#number, or a prefixed id such as LN7. Omit for your own session.'), note: str('One sentence, for the next reader.') },
      ['note'],
    ),
    writes: true,
  },
  {
    name: 'handoff',
    /* EACH FIELD IS EXPLAINED ONCE, BESIDE ITSELF. The description said what `next`, `tried`, `note`
       and `state` are, and then every one of them said it again in the schema, which a client shows
       the model in the same breath. The rules moved down to the arguments they are rules about. */
    description: "Keep your session's handoff true, so whoever picks this up next knows where it stands.",
    input: obj({
      next: str("The one concrete next step. 'Carry on' is not one."),
      /* WHEN TO SEND IT IS IN THE INSTRUCTIONS, word for word: "record each dead end in tried when
         you rule it out". What is left is the part they do not say, which is that it appends. */
      tried: str('A dead end. It appends.'),
      note: str('One line of reasoning. It appends.'),
      /* `doing`, the kernel's own field: `title` is a reserved field id, and the record refuses it. */
      doing: str('What this session is doing.'),
      state: {
        type: 'string',
        enum: ['idle', 'handoff', 'done'],
        description: 'handoff asks another session to take it on; done clears next.',
      },
    }),
    writes: true,
  },
  {
    name: 'meet',
    description:
      'Someone you came across in the work. They are matched by email or handle, added if new, and linked to your project with where you met them.',
    input: obj(
      {
        name: str('As written in the work.'),
        email: str('Only as seen.'),
        handle: str('provider:name, such as github:octocat.'),
        where: str('Where you met them, such as commit 4464966 in braindog.'),
      },
      ['where'],
    ),
    writes: true,
  },
  {
    name: 'triage',
    /* THE DESCRIPTION IS THE CONTRACT'S, WORD FOR WORD, and the site's list of tools
       reads `TOOLS` rather than a copy. Who may call it is not said here: the record refuses every token without the
       `inbox` reach in one sentence that names what it lacks, which teaches better than a clause every turn pays for.
       `ignore` says nothing beside its name, because "or set it aside" in the description already has. */
    description: 'File one arrival from the inbox as a row, or set it aside. braindog:inbox lists them.',
    input: obj(
      {
        arrival: str('Its id in braindog:inbox.'),
        register: str('The list it goes in.'),
        fields: { type: 'object', description: 'Field ids to values. Omit to title from the arrival.' },
        ignore: { type: 'boolean' },
        note: str('One sentence a person reads in six weeks.'),
        back: { type: 'boolean' },
        version: { type: 'integer' },
      },
      ['arrival'],
    ),
    writes: true,
  },
];

/** `tasks#41`, the way a person says a row. */
const QUALIFIED = /^([a-z][a-z0-9_]{0,31})#([1-9][0-9]*)$/;
/** `S42`, `LN7`: a register's own prefix and number. The record knows which register owns a prefix. */
const PREFIXED = /^[A-Z]{1,4}[1-9][0-9]*$/;

/** A row's own id, the ULID a ref field holds. The record reads one as it reads a spoken id. */
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const parse = (spoken: unknown): { register: string; seq: number } | null => {
  const m = typeof spoken === 'string' ? QUALIFIED.exec(spoken.trim()) : null;
  return m ? { register: m[1]!, seq: Number(m[2]) } : null;
};

const ROW_OR_ID = 'A row is addressed as register#number, like tasks#41, or by its prefixed id, like S42.';

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

/** The rows `list` answers when the call names no limit. */
const LIST_PAGE = 20;
/** The characters of one text a `list` row carries before it is cut, unless the call names its field in `fields`. */
const CLIP = 280;

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

const shaped = (r: Result<unknown>, prefixOf: PrefixOf = unprefixed): Result<unknown> => {
  if (r.ok) return { ok: true, value: compacted(r.value, prefixOf) };
  const conflict = (r as { conflict?: { current?: unknown } }).conflict;
  return conflict && isEntry(conflict.current)
    ? ({ ...r, conflict: { ...conflict, current: compact(conflict.current, prefixOf(conflict.current.register)) } } as Result<unknown>)
    : r;
};

/** The registers a tool's answer names: one row, a page, the row a conflict carries, or a page of log lines. */
const registersIn = (r: Result<unknown>): string[] => {
  const value = r.ok ? r.value : (r as { conflict?: { current?: unknown } }).conflict?.current;
  if (isEntry(value)) return [value.register];
  if (isObject(value) && Array.isArray(value.rows)) return [...new Set(value.rows.filter(isEntry).map((row) => row.register))];
  if (isObject(value) && Array.isArray(value.events))
    return [...new Set(value.events.map((e) => (isObject(e) ? e.register : null)).filter((id): id is string => typeof id === 'string'))];
  return [];
};
const badSpoken = (fix: string): Result<never> => ({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix, at: 'spoken' } });

/**
 * A tool or resource whose record method has not arrived yet.
 *
 * `NOT_IN_THIS_BUILD` IS THE RECORD'S OWN WORD FOR THIS, and the sentence says what to do instead,
 * so an agent carries on rather than retrying a call that cannot work today.
 */
const unbuilt = (name: string, instead: string): Result<never> => ({
  ok: false,
  refusal: { code: 'NOT_IN_THIS_BUILD', fix: `This record does not answer ${name} yet. ${instead}` },
});

/** The most hits one search answers, whatever `limit` asked: the clamp in the kernel's `fts.ts` search. */
const SEARCH_MOST = 100;

/**
 * What a search that matched more rows than it answered says about the rest.
 *
 * THE CALLER'S OWN LIMIT IS SAID AS THE CALLER'S. This said "the record answers at most" whatever number
 * came back, so an agent that sent `limit: 5` read that the record stops at five and had no reason to ask for more, and
 * one that sent no limit read twenty, the default, where the record gives up to a hundred. Only a full hundred is the
 * record's own cap, and only then is narrowing the one way on.
 */
const fewer = (total: number, showing: number, asked: boolean): string =>
  showing >= SEARCH_MOST
    ? `${String(total)} rows matched and the record answers at most ${String(SEARCH_MOST)}. Narrow the question.`
    : `${String(total)} rows matched and ${asked ? 'your limit' : 'the default limit'} kept this answer to ${String(showing)}. Send a limit up to ${String(SEARCH_MOST)}, or narrow the question.`;

/**
 * The sentences `context` adds to the record's briefing, for an agent arriving from another record.
 *
 * TWO HABITS HAD A PATH HERE AND NO SENTENCE ANYWHERE AN AGENT READS. Agents log notes about no row
 * at all, and the home for that here is `log` on the agent's own session row; nearly every task an
 * agent adds sets a lane, and the lane here is the `agent` field, empty for the person's own. The
 * third sentence is the question agents ask most after the log, one project's tasks, in the form
 * commit 5fde092b made work: the tree with the
 * project's spoken id. The literal `null` is not taught because `{"field":"agent","is":null}` is
 * refused VALUE_MALFORMED, measured on the seed; `agent is empty` answered 19 of 27 tasks.
 *
 * ON THE ANSWER AND NOT IN THE TOOL LIST, because the list is paid in every turn of every session and
 * measured 2,565 tokens of a 2,600 ceiling (`budget.test.ts`), while `context` is read once a session.
 * The lane, project and task-note sentences are only said when `tasks` is a register the caller may read.
 */
const teaching = (briefing: Record<string, unknown>): string[] => {
  const spoken = (at: unknown): string | null =>
    isObject(at) && typeof at.spoken === 'string' && at.spoken !== '' ? at.spoken : null;
  const session = spoken(briefing.session);
  const project = spoken(briefing.project);
  const tasks = Array.isArray(briefing.registers) && briefing.registers.some((r) => isObject(r) && r.id === 'tasks');
  return [
    session
      ? `A note about nothing in particular goes on your own session: log on ${session}.`
      : 'A note about nothing in particular goes on your own session: log it with no spoken, which opens the session as handoff would.',
    ...(tasks
      ? [
          `A task's lane is its agent field, and the person's own lane is where it is empty: list tasks where "agent is empty".`,
          /* NO EXAMPLE ID WHEN THE CALLER IS IN NO PROJECT: `things#1` was taught here once, and on the
             seed it is Kiln, so a copied sentence read 14 of Kiln's tasks as the project asked about. */
          `One project's tasks: list tasks where {"field":"thing","is":"${project ?? "<the project's spoken id>"}"}.`,
          /* MEASURED ON THE SEED: `update tasks#3 {note}` left the note as the one line sent, and the import's text
             only in `history`. Agents often send an update as `{id, note}` alone, which elsewhere is an append,
             so an agent carrying the habit over wiped a note each time and nothing said so. */
          /* NOT "ADDS TO THE NOTE": a `log` leaves `fields.note` as it was and keeps its line in `history`, as
             `teaching.test.ts` asserts, so a sentence saying it appends to the note field sent an agent to look for its
             line where it never lands. */
          `To add a note to a task, log on it, which keeps each line in its history and leaves the note field alone; an update that patches note replaces the whole note.`,
        ]
      : []),
  ];
};

/** The record's briefing with the teaching on it. A refusal, or an answer that is not an object, passes through. */
const taught = (answer: Result<unknown>): Result<unknown> =>
  answer.ok && isObject(answer.value) ? { ok: true, value: { ...answer.value, teach: teaching(answer.value) } } : answer;

const nowhere = (uri: string): Result<never> => ({
  ok: false,
  refusal: { code: 'ROUTE_UNKNOWN', fix: `There is nothing at ${uri}. Read braindog:boot for what this record holds.`, at: 'uri' },
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

/** The resources with no parameter. Each is asked before it is listed, like everything else. */
const FIXED: readonly Resource[] = [
  resource('whoami', 'Who you are to this record, and which verbs you reach.'),
  resource('boot', 'What this record holds, and how many rows are in each register.'),
  resource('context', 'The briefing for where you are: your session, your project, and what applies here.'),
  resource(
    'sessions/live',
    'Who else is working now, on what, and in which repository. Two sessions in one working tree overwrite each other. Coordinate or stop.',
  ),
  resource('digest/today', 'What the digest would say if it went now.'),
  resource('decisions', 'What has been proposed and not yet answered.'),
  resource('inbox', 'What arrived and nothing filed yet, newest first, with how many arrivals are in each state.'),
  resource('actions', 'Every scheduled action: what it calls, how often, whether it is paused and why, and this month so far. Keys by name only.'),
  resource('automations', 'Every automation: what starts it, when it runs next, and how its runs went this month.'),
  resource('arrangement', 'How this BrainDog is arranged: its packs, what else is on offer, its voice and settings, its pages, and what waits.'),
  resource('grammar/page', 'What a page declaration may contain, with one that installs.'),
  resource('grammar/register', "What a list declaration may contain: its keys, each field's keys, and one that installs."),
  resource('grammar/metric', 'What a figure declaration may contain, with one that installs.'),
  resource('grammar/proposals', 'The bodies that change what this BrainDog is: pack, settings and arrange.'),
  resource('grammar/ingest', 'What a door or a scheduled action may contain, with one of each.'),
  resource('grammar/script', 'What a script declaration may contain, what its ctx can reach, its limits, and two that install.'),
  resource('grammar/automations', 'What an automation may say: its triggers, its steps, its limits, what does not run yet, and two that install.'),
];

/** The addresses a client fills in itself. A template is a grammar, so it names nothing a caller cannot see. */
export const TEMPLATES = [
  { uriTemplate: 'braindog:schema/{register}', name: 'schema', description: 'The fields of one register.' },
  { uriTemplate: 'braindog:page/{slug}', name: 'page', description: 'One page, with every block run: rows and figures, never markup.' },
  { uriTemplate: 'braindog:metric/{id}', name: 'metric', description: 'One figure, with its target and how it compares.' },
  { uriTemplate: 'braindog:skill/{name}', name: 'skill', description: 'The text of one skill, and when to reach for it.' },
  { uriTemplate: 'braindog:declaration/{slug}', name: 'declaration', description: 'One page as declared, to change and propose back.' },
  { uriTemplate: 'braindog:automation/{id}', name: 'automation', description: 'One automation as declared, with its last ten runs, each step with its outcome.' },
  {
    uriTemplate: 'braindog:inbox/{state}',
    name: 'inbox',
    description: 'The arrivals in one state: untriaged, review, skipped, matched, proposed, ignored, or all. Skipped is where a wrong skip rule shows.',
  },
] as const;

/**
 * Run one tool, list the resources, read one.
 *
 * The tool layer holds NO logic of its own beyond addressing: every refusal a caller sees comes from
 * the record, with the sentence the record wrote. A second set of checks here would be a second set
 * to keep in step, and the one that drifted would be the one an agent reads.
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
  };
  const spokenOf = (register: string, seq: number): string => {
    const prefix = prefixes.get(register) ?? '';
    return prefix ? `${prefix}${String(seq)}` : `${register}#${String(seq)}`;
  };
  const addressOf = async (register: string, seq: number, ctx: C): Promise<string> => {
    if (!prefixes.has(register)) await learnPrefix(register, ctx);
    return spokenOf(register, seq);
  };

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
  const namesIn = async (rows: Entry[], ctx: C): Promise<Map<string, string>> => {
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
              if (got.ok && isEntry(got.value) && got.value.seq !== null) names.set(id, await addressOf(got.value.register, got.value.seq, ctx));
            }),
          );
      else
        for (let at = 0; at < ids.length; at += NAMES_PER_READ) {
          const some = ids.slice(at, at + NAMES_PER_READ);
          reads.push(
            surface.list({ register: to, where: { field: 'id', in: some }, limit: some.length }, ctx).then((got) => {
              if (got.ok) for (const found of got.value.rows) if (isEntry(found) && found.seq !== null) names.set(found.id, spokenOf(found.register, found.seq));
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
  /** Every row in an answer, a page's or a conflict's, with its refs spoken. Anything else as it came. */
  const spokenRefs = async (r: Result<unknown>, ctx: C): Promise<Result<unknown>> => {
    if (r.ok) {
      if (isEntry(r.value)) return { ok: true, value: speakRefs(r.value, await namesIn([r.value], ctx)) };
      if (isObject(r.value) && Array.isArray(r.value.rows)) {
        const names = await namesIn(r.value.rows.filter(isEntry), ctx);
        return { ok: true, value: { ...r.value, rows: r.value.rows.map((row) => (isEntry(row) ? speakRefs(row, names) : row)) } };
      }
      return r;
    }
    const conflict = (r as { conflict?: { current?: unknown } }).conflict;
    return conflict && isEntry(conflict.current)
      ? ({ ...r, conflict: { ...conflict, current: speakRefs(conflict.current, await namesIn([conflict.current], ctx)) } } as Result<unknown>)
      : r;
  };

  /**
   * Where a row is, from any way an agent says it: `register#number` as it is, and a prefixed id such as
   * `LN7` asked of the record, which alone knows which register owns a prefix.
   *
   * `context` NAMES ROWS BY PREFIX, so a tool that took only `register#number` refused the id the briefing
   * had just handed over: `update LN8` was "a row is addressed as register#number".
   */
  const locate = async (spoken: unknown, ctx: C): Promise<Result<{ register: string; seq: number }>> => {
    const at = parse(spoken);
    if (at) return { ok: true, value: at };
    const said = typeof spoken === 'string' ? spoken.trim() : '';
    if (!PREFIXED.test(said)) return badSpoken(ROW_OR_ID);
    const found = await surface.get({ spoken: said }, ctx);
    if (!found.ok) return found;
    const row = found.value as { register?: unknown; seq?: unknown } | null;
    return row && typeof row.register === 'string' && typeof row.seq === 'number'
      ? { ok: true, value: { register: row.register, seq: row.seq } }
      : { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: `There is no row ${said} that you can read.`, at: 'spoken' } };
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
    if (said !== true && !(isObject(said) && Object.keys(said).every((k) => k === 'sample')))
      return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'try is true, or {"sample": {...}} to start the rule from a row, an arrival or a figure.', at: 'body.try' } };
    if (!surface.tryAutomation) return unbuilt('a trial', 'Send the change without try, and the owner reads what it would do in Decide.');
    const tried = await surface.tryAutomation({ body: rule, ...(isObject(said) && said.sample !== undefined ? { sample: said.sample } : {}) }, ctx);
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
  const trial = async (body: Record<string, unknown>, ctx: C): Answer => {
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
   * The pages this caller may open, and the figures they draw. `resources/list` offers the first, and the second is
   * where a figure's id is found while no host answers `figures`.
   *
   * A PAGE IS HELD TO THE LEVEL TOO. Its rows are withheld either way, but a slug and a title are information:
   * "Payroll, monthly" in a listing tells a caller what a register they cannot read is called.
   */
  const drawn = async (listed: readonly { slug: string; title: string }[], ctx: C): Promise<{ pages: Resource[]; figures: string[] }> => {
    const out: Resource[] = [];
    const seen: string[] = [];
    for (const page of listed) {
      if (!NAMED.test(page.slug)) continue;
      const drew = await surface.page({ slug: page.slug }, ctx);
      if (!drew.ok) continue;
      const blocks =
        (drew.value as { blocks?: { refusals?: { code: string }[]; readings?: { metric: string }[] }[] }).blocks ?? [];
      if (blocks.length > 0 && blocks.every((b) => (b.refusals ?? []).some((r) => WITHHELD.has(r.code)))) continue;
      /* The figures a page names, taken from what it drew rather than a second read of its
         declaration, so a figure offered is one this page really carries. */
      for (const block of blocks) for (const reading of block.readings ?? []) seen.push(reading.metric);
      out.push(resource(`page/${page.slug}`, `${page.title}, with every block run: rows and figures, never markup.`));
    }
    return { pages: out, figures: seen };
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
   * A filed question with the address where the person answers it: `<origin>/app/<slug>/decide/<id>`.
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
  const decideAt = async (answer: Result<unknown>, ctx: C): Promise<Result<unknown>> => {
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
    const boot = await surface.boot(ctx);
    const record = boot.ok ? (boot.value as { record?: unknown }).record : undefined;
    const slug = isObject(record) && typeof record.slug === 'string' && record.slug !== '' ? record.slug : null;
    if (slug === null) return answer;
    const at = `${origin.replace(/\/+$/, '')}/app/${encodeURIComponent(slug)}/decide/${encodeURIComponent(id)}`;
    return { ok: true, value: { ...answer.value, decide: at } };
  };

  const run: Record<string, (args: Args, ctx: C) => Answer> = {
    /**
     * THE REGISTERS AND THE VERSION, AND NOTHING ELSE `boot` CARRIES. `boot` is the app's first screen in one
     * round trip: live sessions, waiting questions, pages and the whole of what is new, 34 kilobytes on the
     * seeded record. The description promised "the cheap way to learn register names", and `context` is
     * where the rest is for an agent.
     */
    record_index: async (_args, ctx) => {
      const boot = await surface.boot(ctx);
      if (!boot.ok) return boot;
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
      const { record } = boot.value as { record?: unknown };
      /* `.version.version`, BECAUSE `version` ANSWERS `33 §4`'s OBJECT and not a bare number. An
         agent holding the object as its cursor would send it back and get a range scan from nothing. */
      return {
        ok: true,
        value: {
          ...(record === undefined ? {} : { record }),
          registers: boot.value.registers,
          ...(figures.length === 0 ? {} : { figures }),
          version: version.ok ? version.value.version : null,
        },
      };
    },

    context: async (_args, ctx) =>
      surface.context ? taught(await surface.context({}, ctx)) : unbuilt('context', 'Call record_index for the registers, then list what is open.'),

    schema: (args, ctx) => surface.schema({ register: String(args.register) }, ctx),

    /**
     * A PREFIXED ID GOES TO THE RECORD AS SPOKEN. Which register owns `S` is the record's declarations'
     * to say, so it resolves `S42` itself, in one call, and answers a prefix no readable register holds
     * with a sentence that sends `SG` and `D` to `governance`.
     */
    get: async (args, ctx) => {
      const at = parse(args.spoken);
      if (at) return surface.get(at, ctx);
      const said = typeof args.spoken === 'string' ? args.spoken.trim() : '';
      /* A ROW ID TOO, because a ref field holds one: `thing: 01M2...` was a value no tool could follow. */
      if (PREFIXED.test(said) || ROW_ID.test(said)) return surface.get({ spoken: said }, ctx);
      if (!FIGURE.test(said)) return badSpoken(ROW_OR_ID);
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
      if (figure.ok || codeOf(figure) !== 'METRIC_UNKNOWN') return figure;
      return badSpoken(`${ROW_OR_ID} A figure is named by its id, and record_index lists them; ${said} is not one you can read.`);
    },

    /* TWENTY WHEN THE CALL NAMES NO LIMIT, where the record's own default is fifty. 10 §4 set 2,000 tokens for a page
       of 25, but counted as a transport sends it, every quote escaped inside the text block, 25 seeded tasks cost 2,094
       even with `listed`'s cuts, and twenty cost well under. The record still answers up to 500 to a caller that asks,
       and the description says 20, which `mcp.test.ts` holds the default to. */
    list: (args, ctx) =>
      surface.list(
        {
          register: String(args.register),
          ...(args.where === undefined ? {} : { where: args.where }),
          limit: args.limit === undefined ? LIST_PAGE : Number(args.limit),
          ...(args.cursor === undefined ? {} : { cursor: String(args.cursor) }),
        },
        ctx,
      ),

    /* A HIT IS ITS SPOKEN ID AND ITS TITLE. `rank` is a float the order already says. */
    search: async (args, ctx) => {
      const found = await surface.search({ q: String(args.q ?? ''), ...(args.limit === undefined ? {} : { limit: Number(args.limit) }) }, ctx);
      if (!found.ok) return found;
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
      if (hits === null) return found;
      const matched = !Array.isArray(found.value) && isObject(found.value) && isObject(found.value.matched) ? (found.value.matched as Record<string, number>) : null;
      /* NAMED AS EVERY OTHER TOOL NAMES A ROW. This built `register#seq` itself, so on the seed `create` answered `LN8`
         and `search` for its words answered `learnings#8`: two names for one row, a line apart in one session. */
      const rows: unknown[] = [];
      for (const hit of hits as unknown[])
        rows.push(
          isObject(hit) && typeof hit.register === 'string' && typeof hit.seq === 'number'
            ? { spoken: await addressOf(hit.register, hit.seq, ctx), title: hit.title }
            : hit,
        );
      if (matched === null) return { ok: true, value: rows };
      const total = Object.values(matched).reduce((a, b) => a + b, 0);
      return { ok: true, value: { rows, matched: total, showing: rows.length, ...(total > rows.length ? { more: fewer(total, rows.length, args.limit !== undefined) } : {}) } };
    },

    history: async (args, ctx) => {
      const at = await locate(args.spoken, ctx);
      return at.ok ? surface.history(at.value, ctx) : at;
    },

    /**
     * THE LOG TAKES A LIMIT AND NO CURSOR, which is the one place this tool is narrower than the
     * record's route. Paging the whole log backwards is the app's Activity screen; an agent picking
     * up after another session wants the last few writes, and `limit` up to the record's own 200
     * covers that. A cursor argument would be twenty-odd tokens in every turn of every session for
     * a page nothing asked for. The route keeps it, so the app is unaffected.
     */
    activity: async (args, ctx) => {
      if (!surface.recentHistory)
        return unbuilt('activity', 'Call history with a row you already know about, or context for where things stand.');
      const out = await surface.recentHistory({ ...(args.limit === undefined ? {} : { limit: Number(args.limit) }) }, ctx);
      /* AND THE CURSOR DOES NOT COME BACK EITHER. The record answers one, and an argument this tool
         does not take is an argument a model will try to send: the second call would be refused for
         a field the first answer offered it. `limit` is the whole of the dial here. */
      return out.ok && isObject(out.value) && Array.isArray(out.value.events) ? { ok: true, value: { events: out.value.events } } : out;
    },

    /**
     * A LIST IS EACH QUESTION WITHOUT ITS BODY, and one by id is whole. A `rowset` body carries every field it
     * would write, and the seeded queue's one proposal to change a page's note was four kilobytes of
     * markdown in a list an agent reads to learn what is waiting. Empty fields go too.
     */
    governance: async (args, ctx) => {
      const out = await surface.governance(args as never, ctx);
      if (!out.ok || args.id !== undefined || !Array.isArray(out.value)) return out;
      return {
        ok: true,
        value: out.value.map((row: unknown) =>
          isObject(row) ? Object.fromEntries(Object.entries(row).filter(([k, v]) => k !== 'body' && v !== null)) : row,
        ),
      };
    },

    /**
     * AND THERE IS NO `decide` TOOL, deliberately. `decide` is a rung no token reaches (ADR-060), so
     * a tool for it could only ever refuse, and a tool that always refuses is a tool an agent spends
     * its turns discovering.
     */
    /**
     * AND A RULE CHANGE COMES BACK WITH ITS DRY RUN. `dry_run` was taken off
     * the tool list because only a person installed a rule; an agent now writes automations, so what one would do is
     * said here, on the answer to the call that filed it, which costs the list nothing. It is the record's own `dryRun`,
     * the one Decide reads, so the agent and the owner read one account of it. Asked after the filing, so a body the
     * record refuses is refused in the record's words and never previewed.
     *
     * AND A SCRIPT CHANGE THAT SAYS `"try"` IS TRIED INSTEAD OF FILED (`trial` below), and one that does not is filed
     * and never run: a trial fetches and is counted as a run, so it happens only when the agent asks for it. A PAGE
     * CHANGE THAT SAYS `"try"` IS DRAWN INSTEAD OF FILED by the same branch (`preview` above), answered `page_preview`.
     */
    propose: async (args, ctx) => {
      if (args.body_kind === 'change' && isObject(args.body) && args.body.try !== undefined) return trial(args.body, ctx);
      const body = !isObject(args.body)
        ? args.body
        : args.body_kind === 'rowset'
          ? await rowset(args.body, ctx)
          : args.body_kind === 'change'
            ? change(args.body)
            : args.body;
      const filed = await decideAt(await surface.propose({ ...args, ...(body === undefined ? {} : { body }) } as never, ctx), ctx);
      if (!filed.ok || !isObject(filed.value) || args.body_kind !== 'change' || !isObject(body)) return filed;
      const rule = ruleIn(body);
      if (rule !== null && surface.dryRun) {
        const dry = await surface.dryRun({ rule }, ctx);
        return { ok: true, value: { ...filed.value, dry_run: dry.ok ? dry.value : { refused: 'refusal' in dry ? dry.refusal : dry } } };
      }
      return filed;
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
    create: async (args, ctx) => {
      const register = String(args.register);
      return surface.create(
        {
          register,
          fields: (args.fields ?? {}) as Args,
          ...(args.note === undefined ? {} : { note: String(args.note) }),
        },
        ctx,
      );
    },

    update: async (args, ctx) => {
      const at = await locate(args.spoken, ctx);
      if (!at.ok) return at;
      return surface.update(
        {
          ...at.value,
          patch: (args.patch ?? {}) as Args,
          ...(args.version === undefined ? {} : { version: Number(args.version) }),
          ...(args.note === undefined ? {} : { note: String(args.note) }),
        },
        ctx,
      );
    },

    /**
     * A note changes nothing about the row and is still a write, because the record keeps what was
     * said. It goes through `update` with an empty patch, so it answers to the same permission and
     * lands in the same history.
     */
    log: async (args, ctx) => {
      const note = String(args.note ?? '').trim();
      if (!note)
        return { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'A note is one sentence, and this one is empty.', at: 'note' } };
      /**
       * NO ROW IS THE CALLER'S OWN SESSION, AND IT IS THE RECORD'S `handoff` WITH THE NOTE ALONE. That is the one method
       * that finds a token's run, or opens it on its first write, inside the same transaction as the write, so a note is
       * one call whether or not the run exists yet. It appends the line to the run's notes and keeps it in the run's
       * history, which is where a note about nothing in particular was always taught to go (`teaching` above). A person
       * names a run from the app, so the record refuses one here in its own sentence, as `handoff` does.
       */
      if (args.spoken === undefined || args.spoken === null)
        return surface.handoff ? surface.handoff({ note }, ctx) : unbuilt('log with no row', 'Name the row the note is about in spoken.');
      const at = await locate(args.spoken, ctx);
      if (!at.ok) return at;
      return surface.update({ ...at.value, patch: {}, note }, ctx);
    },

    /* The arguments go through whole: which fields a session may set, and how `tried` appends, are
       the record's rules, and it names the field when one is wrong. */
    handoff: async (args, ctx) =>
      surface.handoff ? surface.handoff(args, ctx) : unbuilt('handoff', 'Log the next step on the task you are working on instead.'),

    meet: async (args, ctx) =>
      surface.meet ? surface.meet(args, ctx) : unbuilt('meet', 'If there is a people register, add the person there with create.'),

    /**
     * THE ARGUMENTS GO TO THE RECORD AS SENT, and who may triage is the record's to say: a token without the `inbox` reach
     * is refused there in one sentence naming what it lacks, and a field it does not take is named in `FIELD_UNKNOWN`.
     *
     * THE ROW IT FILED IS NAMED AS EVERY OTHER TOOL NAMES A ROW. The record answers the arrival's id and state beside the
     * row it became, whole, so the row is made compact here with its register's prefix, and the agent reads `LN8` where
     * `create` would have said `LN8` for the same row.
     */
    triage: async (args, ctx) => {
      if (!surface.triage) return unbuilt('triage', 'Read braindog:inbox, and tell the person what is waiting there.');
      const settled = await surface.triage(args as never, ctx);
      if (!settled.ok || !isObject(settled.value) || !isEntry(settled.value.entry)) return settled;
      const entry = settled.value.entry;
      if (!prefixes.has(entry.register)) await learnPrefix(entry.register, ctx);
      return { ok: true, value: { ...settled.value, entry: compact(entry, prefixes.get(entry.register) ?? '') } };
    },
  };

  /**
   * Read one resource.
   *
   * THE URI IS PARSED AND NEVER PASSED THROUGH, and each segment is checked against a grammar
   * before it becomes an argument.
   */
  const read = async (uri: string, ctx: C): Promise<Result<unknown>> => {
    const { head, rest } = split(uri);

    if (head === 'whoami' && !rest) return surface.whoami(ctx);
    if (head === 'boot' && !rest) return surface.boot(ctx);
    if (head === 'context' && !rest)
      return surface.context ? taught(await surface.context({}, ctx)) : unbuilt('context', 'Read braindog:boot instead.');
    if (head === 'sessions' && rest === 'live')
      return surface.sessionsLive ? surface.sessionsLive({}, ctx) : unbuilt('sessions/live', 'Nothing else lists live sessions yet.');
    if (head === 'decisions' && !rest) return surface.governance({ register: 'suggestion' } as never, ctx);
    /* THE RECORD'S LIST AS IT ANSWERS IT. Its `key` is the vault's label and nothing sealed is read to build it, so
       there is nothing here to take out; a second filter would be a second place to keep in step. */
    if (head === 'actions' && !rest)
      return surface.actions ? surface.actions(ctx) : unbuilt('actions', 'Nothing else lists scheduled actions yet.');
    if (head === 'digest' && rest === 'today') return surface.digestToday({}, ctx);
    /* THE STATE IS THE RECORD'S TO CHECK. The segment is held to a name here so a path never reaches it, and a name that
       is not a state is refused by the record, with the seven words it takes; a second list of states here would be a second
       list to keep in step. Who may read it is the record's too, so an agent's token is refused in the record's words. */
    if (head === 'inbox' && (!rest || NAMED.test(rest)))
      return surface.inbox
        ? surface.inbox(rest ? { state: rest } : {}, ctx)
        : unbuilt(uri, 'Nothing else lists what arrived yet.');
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
    if (head === 'grammar' && rest === 'automations') {
      const may = await surface.version(ctx);
      return may.ok ? { ok: true, value: may.value.slash === true ? ANSWERED_GRAMMAR : AUTOMATION_GRAMMAR } : may;
    }
    if ((head === 'automations' && !rest) || (head === 'automation' && NAMED.test(rest)))
      return surface.automations
        ? surface.automations(rest ? { rule: rest } : {}, ctx)
        : unbuilt(uri, 'Read braindog:actions for what runs on a clock, or governance for the rule changes waiting on a person.');
    if (head === 'arrangement' || head === 'grammar' || head === 'declaration') {
      const arranged = surface.arrangement;
      if (!arranged) return unbuilt(uri, 'Read braindog:boot instead.');
      if (head === 'arrangement' && !rest) return arranged({}, ctx);
      /* THE RECORD'S OWN GRAMMARS (`packages/record/src/grammar.ts`), all but its `rule`: a rule is said in full by
         `grammar/automations` above, this package's text, and a second rule grammar here would be two to keep in step. */
      if (head === 'grammar' && (rest === 'page' || rest === 'register' || rest === 'metric' || rest === 'proposals' || rest === 'ingest'))
        return arranged({ grammar: rest }, ctx);
      if (head === 'declaration' && NAMED.test(rest)) return arranged({ page: rest }, ctx);
    }
    const named = NAMED.test(rest);
    if (head === 'schema' && named) return surface.schema({ register: rest }, ctx);
    if (head === 'page' && named) return surface.page({ slug: rest }, ctx);
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
   */
  const resources = async (ctx: C): Promise<Resource[]> => {
    const out: Resource[] = [];
    const offer = async (r: Resource) => {
      if ((await read(r.uri, ctx)).ok) out.push(r);
    };

    for (const r of FIXED) await offer(r);

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
    async call(name: string, args: Args, ctx: C): Promise<Result<unknown>> {
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
      if (!tool)
        return {
          ok: false,
          refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no tool called ${name}.`, allowed: TOOLS.map((t) => t.name) },
        };
      /* The rows a tool answers with, and the row a conflict carries, as an agent reads them. */
      if (!SHAPED.has(name)) return tool(args, ctx);
      /* A ROW IS NAMED AS CONTEXT NAMES IT: `LN1` and `S3`, not `learnings#1` and `session#1`. An agent handed two
         names for one row wrote the second into its notes, and the person reads the first. Both are still taken. */
      const answer = await tool(args, ctx);
      for (const register of registersIn(answer)) if (!prefixes.has(register)) await learnPrefix(register, ctx);
      const prefixOf = (register: string) => prefixes.get(register) ?? '';
      /**
       * `log` ANSWERS WHAT IT WROTE: the row's name, the version the note left it at, and when. It answered the whole
       * row, so on the seed a one-line note on Kiln, whose note is its write-up, answered 6,610 bytes for a 5,889-byte
       * note, and `log` is the tool agents call most. The note changed no field,
       * so the fields were the one thing in that answer the agent already had. The version stays because the next
       * `update` needs it, and a refusal passes through whole.
       */
      if (name === 'log') {
        const said = shaped(answer, prefixOf);
        if (!said.ok || !isObject(said.value)) return said;
        /* AND `deleted_at` WHEN THE ROW HAS ONE. The record takes a note on a deleted row, and cutting the answer to three
           fields cut the one that said so: an agent logging on an id carried from another session was told `ok` and
           nothing else, which is the case where it did not already have the row. */
        const { spoken, version, updated_at, deleted_at } = said.value;
        return {
          ok: true,
          value: { spoken, version, ...(updated_at === undefined ? {} : { updated_at }), ...(deleted_at === undefined ? {} : { deleted_at }) },
        };
      }
      /* A PAGE OF ROWS IS READ LEANER THAN ONE ROW: `listed` says what goes and why. Every row on a page is of the
         register the call named, so that register's text fields are the ones cut. */
      if (name === 'list') {
        const said = shaped(await spokenRefs(answer, ctx), prefixOf);
        if (!said.ok || !isObject(said.value) || !Array.isArray(said.value.rows)) return said;
        const whole = new Set(Array.isArray(args.fields) ? args.fields.map(String) : []);
        const texts = textFields.get(String(args.register));
        return { ok: true, value: { ...said.value, rows: said.value.rows.map((r) => (isObject(r) ? listed(r, whole, texts) : r)) } };
      }
      return shaped(await spokenRefs(answer, ctx), prefixOf);
    },
  };
}

/** The tools whose answer is a row, a page of rows, or a page of log lines. */
const SHAPED = new Set(['get', 'list', 'create', 'update', 'log', 'handoff', 'activity']);
