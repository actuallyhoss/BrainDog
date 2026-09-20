/**
 * The sixteen tools, which are the whole of what an agent sees.
 *
 * THE COUNT IS THE DESIGN. `10-MCP` §4 puts a budget on it: the tool list is in every turn of every
 * session, so one more tool costs every conversation for ever. So the record's own vocabulary
 * carries the load: `list` takes a predicate rather than there being a filter tool per register.
 *
 * FOURTEEN OF THEM, AND THE THREE NEWEST ARE THINGS AN AGENT DOES EVERY SESSION
 * (`loop/research-agent-path.md` §1.5). `context` is the briefing for where it stands, `handoff`
 * keeps its session's next step true, and `meet` records a person it came across. Five went to pay
 * for them: `pages`, `page` and `metric` were already resources, `credentials` could never answer a
 * token because the vault refuses every one, and `dry_run` previews a rule, which only a person
 * installs.
 *
 * AND `activity` IS THE FIFTEENTH, WHICH PAID FOR ITSELF. `loop/research-switch.md` §1 lists the
 * twenty-one tools the old tool gives its agents, and nineteen of them have a path here already;
 * `brain_audit` had none, because `history` takes a row and a session picking up after another one
 * does not yet know which row to ask about. It cost 117 tokens of the 45 the ceiling had left, so
 * four descriptions gave back what they were saying twice: `get` said the id grammar in its
 * description and again in its schema, `handoff` and `update` each said in their description what
 * their own schema and the instructions say, and `meet` listed the examples the instructions list.
 * The list measured 2,555 tokens before and 2,565 after, against a ceiling of 2,600.
 *
 * AND `money` IS THE SIXTEENTH, AND IT PAID FOR ITSELF THE SAME WAY. A money ledger arrived in
 * money-core 1.2.0 with transactions, categories, recurring items, instalments and snapshots, and
 * the thing a person asks most days, "how am I doing this month", had no verb: an agent had to know
 * the register names, write a predicate for each, and add the rows up itself, once per currency,
 * which is the one piece of arithmetic this record refuses to do by guess. It cost 91 tokens of the
 * 35 the ceiling had left, and nine descriptions gave them back by stopping saying what the
 * instructions or the schema beside them already say. The instructions are ten rules
 * (`loop/research-agent-path.md` §1.4) and a client shows them in the same payload as this list, so
 * `propose` carried two of them word for word ("an agent never decides" and "to change what you may
 * not"), `context` opened on the first rule's "where you are", and `handoff`'s `tried` repeated the
 * rule about ruling a dead end out. The other five are the schema beside them: `activity` compared
 * itself with `history` after its own first clause had said "the whole record", `governance`
 * explained its own `id` argument, `meet` said "never guess an email" beside an `email` that says
 * "only as seen", `propose`'s `question` said the word question, and two cursors said "to continue"
 * after the word cursor.
 * The list measured 2,565 before, 2,656 with the tool, and 2,565 again after.
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

import { refused, type Result } from '@braindog/ports';

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
 * THE LAST SEVEN ARE OPTIONAL, BECAUSE A HOST MAY NOT ANSWER THEM. The record answers the first four
 * of them since build step 16, and a host older than that does not. The command line offers only
 * the routes its client knows, so it still works against an older host. Without one, its tool
 * refuses with what to do instead, and its resource is not listed.
 */
export type McpSurface<C> = {
  boot(ctx: C): Answer<{ registers: { id: string; name: string }[] }>;
  version(ctx: C): Answer<{ version: number }>;
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
  /** How the record is arranged, one page's declaration, or a grammar (`loop/research-spark.md` S12). READ+, optional likewise. */
  arrangement?(args: { page?: string; grammar?: string }, ctx: C): Answer;
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
/* `required` is left out when empty: it is sixteen tools' worth of tokens that say nothing. */
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
});

export const TOOLS: readonly Tool[] = [
  {
    name: 'record_index',
    description: 'What this record holds: its registers, how many rows in each, and its version. The cheap way to learn register names.',
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
    description: 'One row, by the id a person says out loud.',
    input: obj({ spoken: str('register#number, a prefixed id such as S42, or a row id from a ref field.') }, ['spoken']),
    writes: false,
  },
  {
    name: 'list',
    description:
      'Rows of one register, newest first, narrowed by a predicate. The predicate is a tree: {"field":"state","is":"open"}, or {"all":[...]}.',
    input: obj(
      {
        register: str('A register id.'),
        where: { type: 'object', description: 'A predicate tree. Omit for everything.' },
        limit: int('1 to 200. Default 25.'),
        cursor: str('From a previous answer.'),
      },
      ['register'],
    ),
    writes: false,
  },
  {
    name: 'search',
    description: 'Rows whose text matches, across every register you can see. Every word is a prefix.',
    input: obj({ q: str('What to look for. Plain words; the operators are not read.'), limit: int('1 to 50. Default 20.') }, ['q']),
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
    name: 'money',
    /* ONE AMOUNT PER CURRENCY IS SAID ONCE, in the instructions, which say it about every tool
       (`never add two currencies`). What is left here is what this tool alone is for. */
    description: 'How money stands: cash now, what moved in 30 days, what is due in and out, and what is late each way. One amount per currency.',
    input: obj({}),
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
        body: {
          type: 'object',
          description:
            'options: {"options":[...]}, two or more, each with id, label and because. rowset: {"rows":[{"at":"skills#3","version":1,"patch":{...}}]}. change: {"to":{"id":"page.x","kind":"page","body":{...}}}. pack, settings and arrange change what this BrainDog is: read braindog:arrangement and braindog:grammar/proposals first.',
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
       AND DELETING IS SAID, because nothing told an agent how. the old tool gives its agents a
       `brain_task_delete` (`loop/research-switch.md` §1); here it is `deleted_at` through the same
       verb and the same permission, and an agent had no way to find that out. */
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
    input: obj({ spoken: str('register#number, or a prefixed id such as LN7.'), note: str('One sentence, for the next reader.') }, ['spoken', 'note']),
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

/**
 * The money figures the `money` tool relays, in the order an answer reads in.
 *
 * EVERY ONE IS A FIGURE THE MONEY PACK ALREADY DECLARES (`packages/seed/src/modules/money.ts`), so
 * the number an agent reads here is the number the Money page draws and `metric` answers by id.
 * Adding the rows up in the tool instead would be a second engine over the same registers, and the
 * two would part company the first time a predicate moved: `spent-30d` leaves out a transfer between
 * your own accounts and a payment the bank has not settled, and a tool that summed
 * `transactions.amount` would count both.
 *
 * SEVEN, BECAUSE EACH ONE IS A READ OF THE RECORD. They are what "how am I doing this month" asks:
 * where the money is, what has moved in thirty days, what is due to move in thirty more, and what is
 * late in each direction. The pack declares twenty-five, and the other eighteen are one `metric`
 * call away by id, which is what keeps this list short enough to read in one go.
 */
export const MONEY_FIGURES = ['cash-now', 'received-30d', 'spent-30d', 'in-30d', 'out-30d', 'late-in', 'overdue'] as const;

/** A figure as the record answers it, with only what an overview reads. Structural, in the manner of `McpSurface`. */
type Figure = {
  value?: unknown;
  unit?: unknown;
  rows?: unknown;
  met?: unknown;
  delta?: unknown;
  parts?: unknown;
  fx?: { asOf?: unknown; forward?: unknown; missing?: unknown };
};

/**
 * One figure as an agent reads it: an amount with the currency it is in, or one amount per currency.
 *
 * THIS IS THE WHOLE ARGUMENT FOR THE TOOL OVER `list`. An agent given the rows adds them up itself,
 * and nothing in a list of rows stops it adding EGP 5,200,000 to USD 3,400.50 and reading the sum as
 * a position. The record holds that line in three places: `where/src/index.ts:1165` answers
 * `MIXED_CURRENCY` to a range with two currencies in it, `kernel/src/fx.ts` `across` hands back one
 * part per currency when no rate reaches the home currency, and `kernel/src/metrics.ts:970` refuses
 * where the amounts cannot be read one at a time at all. `fx.ts` itself emits no refusal code, which
 * is worth saying because parts are not a refusal: they are the answer, and the missing pair is the
 * repair. So this relays what the record answered and adds nothing: `parts` when the
 * record kept them apart, with `missing` naming the pair of currencies a rate would join, and
 * otherwise the one amount with its currency.
 *
 * A CONVERTED FIGURE NAMES THE DAY OF THE RATE IT USED, because "GBP 9,850" built from dollars at
 * last Tuesday's rate and the same figure at today's are different numbers, and an agent writing
 * either into a note should be able to say which. `rate_forward` is the case the kernel marks for
 * the same reason: no rate on or before the amount's day existed, so a later one stood in.
 */
const figureOf = (answered: unknown): Record<string, unknown> => {
  const read = (isObject(answered) ? answered : {}) as Figure;
  const fx = isObject(read.fx) ? (read.fx as Figure['fx'] & object) : {};
  const missing = Array.isArray(fx.missing) ? fx.missing : [];
  return {
    ...(Array.isArray(read.parts)
      ? { parts: read.parts, ...(missing.length > 0 ? { missing } : {}) }
      : { currency: read.unit ?? null, amount: read.value ?? null }),
    ...(typeof read.rows === 'number' ? { rows: read.rows } : {}),
    ...(typeof fx.asOf === 'string' ? { rate_as_of: fx.asOf } : {}),
    ...(fx.forward === true ? { rate_forward: true } : {}),
    ...(typeof read.met === 'boolean' ? { met: read.met } : {}),
    ...(typeof read.delta === 'number' ? { delta: read.delta } : {}),
  };
};

/**
 * A record that keeps no money at all, refused by naming what would give it some.
 *
 * `METRIC_UNKNOWN` IS WHAT ALL SEVEN SAID, and this is those seven collapsed into one rather than a
 * code of the tool's own for the same fact. The sentence names the add-on because "there is no
 * metric called cash-now" is true and useless: an agent cannot install anything, and what it can do
 * is say which add-on the person is missing and carry on.
 *
 * AND IT IS THE SAME SENTENCE FOR A CALLER WHO MAY NOT READ THE MONEY REGISTERS, deliberately. The
 * record answers `METRIC_UNKNOWN` for a figure over a register outside the caller's ceiling so that a
 * probe cannot enumerate what a business keeps (`record/src/index.ts`), and a tool that told those
 * two cases apart would hand the list back one layer further out.
 */
const NO_MONEY: Result<never> = {
  ok: false,
  refusal: {
    code: 'METRIC_UNKNOWN',
    fix: 'This record keeps no money figures. Install the money-core add-on, which declares them, or call record_index for what it does hold.',
  },
};

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
  resource('actions', 'Every scheduled action: what it calls, how often, whether it is paused and why, and this month so far. Keys by name only.'),
  resource('arrangement', 'How this BrainDog is arranged: its packs, what else is on offer, its voice and settings, its pages, and what waits.'),
  resource('grammar/page', 'What a page declaration may contain, with one that installs.'),
  resource('grammar/proposals', 'The bodies that change what this BrainDog is: pack, settings and arrange.'),
];

/** The addresses a client fills in itself. A template is a grammar, so it names nothing a caller cannot see. */
export const TEMPLATES = [
  { uriTemplate: 'braindog:schema/{register}', name: 'schema', description: 'The fields of one register.' },
  { uriTemplate: 'braindog:page/{slug}', name: 'page', description: 'One page, with every block run: rows and figures, never markup.' },
  { uriTemplate: 'braindog:metric/{id}', name: 'metric', description: 'One figure, with its target and how it compares.' },
  { uriTemplate: 'braindog:skill/{name}', name: 'skill', description: 'The text of one skill, and when to reach for it.' },
  { uriTemplate: 'braindog:declaration/{slug}', name: 'declaration', description: 'One page as declared, to change and propose back.' },
] as const;

/**
 * Run one tool, list the resources, read one.
 *
 * The tool layer holds NO logic of its own beyond addressing: every refusal a caller sees comes from
 * the record, with the sentence the record wrote. A second set of checks here would be a second set
 * to keep in step, and the one that drifted would be the one an agent reads.
 */
export function tools<C>(surface: McpSurface<C>) {
  /* KEPT FOR THE LIFE OF THE SERVER, because a register's prefix is part of its declaration and does not move. A schema
     the caller may not read is not kept, and that register's rows are named `register#number`. */
  const prefixes = new Map<string, string>();
  const learnPrefix = async (register: string, ctx: C): Promise<void> => {
    const schema = await surface.schema({ register }, ctx);
    if (!schema.ok) return;
    const said = isObject(schema.value) ? schema.value.seq_prefix : undefined;
    prefixes.set(register, typeof said === 'string' && /^[A-Z]{1,4}$/.test(said) ? said : '');
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
      const { record } = boot.value as { record?: unknown };
      /* `.version.version`, BECAUSE `version` ANSWERS `33 §4`'s OBJECT and not a bare number. An
         agent holding the object as its cursor would send it back and get a range scan from nothing. */
      return {
        ok: true,
        value: {
          ...(record === undefined ? {} : { record }),
          registers: boot.value.registers,
          version: version.ok ? version.value.version : null,
        },
      };
    },

    context: async (_args, ctx) =>
      surface.context ? surface.context({}, ctx) : unbuilt('context', 'Call record_index for the registers, then list what is open.'),

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
      return PREFIXED.test(said) || ROW_ID.test(said) ? surface.get({ spoken: said }, ctx) : badSpoken(ROW_OR_ID);
    },

    list: (args, ctx) =>
      surface.list(
        {
          register: String(args.register),
          ...(args.where === undefined ? {} : { where: args.where }),
          ...(args.limit === undefined ? {} : { limit: Number(args.limit) }),
          ...(args.cursor === undefined ? {} : { cursor: String(args.cursor) }),
        },
        ctx,
      ),

    /* A HIT IS ITS SPOKEN ID AND ITS TITLE. `rank` is a float the order already says. */
    search: async (args, ctx) => {
      const found = await surface.search({ q: String(args.q ?? ''), ...(args.limit === undefined ? {} : { limit: Number(args.limit) }) }, ctx);
      if (!found.ok || !Array.isArray(found.value)) return found;
      return {
        ok: true,
        value: found.value.map((hit: unknown) =>
          isObject(hit) && typeof hit.register === 'string' && typeof hit.seq === 'number'
            ? { spoken: `${hit.register}#${String(hit.seq)}`, title: hit.title }
            : hit,
        ),
      };
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
     * HOW MONEY STANDS, AND NOT ONE FIGURE OF THIS TOOL'S OWN.
     *
     * SEVEN READS AT ONCE, BECAUSE THEY DO NOT DEPEND ON EACH OTHER. Over the command line each is a
     * request to the host, and in the app each is a query; done one after another the tool would be
     * as slow as its slowest seven added together for no reason.
     *
     * A FIGURE THIS RECORD HAS NOT GOT IS LEFT OUT AND NOT REPORTED, because a record with the pack
     * and an older version of it is the ordinary case: `spent-30d` and `received-30d` arrived with
     * the ledger in money-core 1.2.0, and an agent on a record from before it should read the five
     * that are there rather than five figures and two apologies.
     *
     * A FIGURE THAT REFUSED FOR ANY OTHER REASON KEEPS ITS PLACE AND ITS SENTENCE, because a gap
     * where a figure was is read as a zero. Measured on a record with sterling and dollars in it,
     * two currencies with no rate between them are NOT a refusal: `evaluateMetric` always hands the
     * aggregation an fx context, so the answer is one amount per currency with the pair named, which
     * is what `money.test.ts` asserts. What can still refuse here is narrower, a `MIXED_CURRENCY` or
     * a `LOOKUP_MISSING` from a figure whose declaration and rows have parted company, and that is
     * a sentence somebody has to see in order to fix.
     */
    money: async (_args, ctx) => {
      const read = await Promise.all(MONEY_FIGURES.map(async (id) => [id, await surface.metric({ metric: id }, ctx)] as const));
      /* NOTHING ANSWERED IS EITHER NO MONEY PACK OR ONE REFUSAL SAID SEVEN TIMES, such as a caller
         outside the read ceiling. The record's own sentence goes back where there is one, because
         "install the money-core add-on" to somebody who cannot read what is already installed is an
         instruction that cannot work. */
      if (!read.some(([, got]) => got.ok)) return read.find(([, got]) => refused(got) && got.refusal.code !== 'METRIC_UNKNOWN')?.[1] ?? NO_MONEY;
      const figures: Record<string, unknown> = {};
      for (const [id, got] of read) {
        if (got.ok) figures[id] = figureOf(got.value);
        else if (refused(got) && got.refusal.code !== 'METRIC_UNKNOWN') figures[id] = { refusal: got.refusal };
      }
      return { ok: true, value: { figures } };
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
    propose: async (args, ctx) => {
      const body = !isObject(args.body)
        ? args.body
        : args.body_kind === 'rowset'
          ? await rowset(args.body, ctx)
          : args.body_kind === 'change'
            ? change(args.body)
            : args.body;
      return surface.propose({ ...args, ...(body === undefined ? {} : { body }) } as never, ctx);
    },

    create: (args, ctx) =>
      surface.create(
        {
          register: String(args.register),
          fields: (args.fields ?? {}) as Args,
          ...(args.note === undefined ? {} : { note: String(args.note) }),
        },
        ctx,
      ),

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
      return surface.context ? surface.context({}, ctx) : unbuilt('context', 'Read braindog:boot instead.');
    if (head === 'sessions' && rest === 'live')
      return surface.sessionsLive ? surface.sessionsLive({}, ctx) : unbuilt('sessions/live', 'Nothing else lists live sessions yet.');
    if (head === 'decisions' && !rest) return surface.governance({ register: 'suggestion' } as never, ctx);
    /* THE RECORD'S LIST AS IT ANSWERS IT. Its `key` is the vault's label and nothing sealed is read to build it, so
       there is nothing here to take out; a second filter would be a second place to keep in step. */
    if (head === 'actions' && !rest)
      return surface.actions ? surface.actions(ctx) : unbuilt('actions', 'Nothing else lists scheduled actions yet.');
    if (head === 'digest' && rest === 'today') return surface.digestToday({}, ctx);
    if (head === 'arrangement' || head === 'grammar' || head === 'declaration') {
      const arranged = surface.arrangement;
      if (!arranged) return unbuilt(uri, 'Read braindog:boot instead.');
      if (head === 'arrangement' && !rest) return arranged({}, ctx);
      if (head === 'grammar' && (rest === 'page' || rest === 'proposals')) return arranged({ grammar: rest }, ctx);
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

    /* A PAGE IS HELD TO THE LEVEL TOO. Its rows are withheld either way, but a slug and a title are
       information: "Payroll, monthly" in a listing tells a caller what a register they cannot read
       is called. */
    const seen: string[] = [];
    const pages = await surface.pages(ctx);
    if (pages.ok)
      for (const page of pages.value) {
        if (!NAMED.test(page.slug)) continue;
        const drawn = await surface.page({ slug: page.slug }, ctx);
        if (!drawn.ok) continue;
        const blocks =
          (drawn.value as { blocks?: { refusals?: { code: string }[]; readings?: { metric: string }[] }[] }).blocks ?? [];
        if (blocks.length > 0 && blocks.every((b) => (b.refusals ?? []).some((r) => WITHHELD.has(r.code)))) continue;
        /* The figures a page names, taken from what it drew rather than a second read of its
           declaration, so a figure offered is one this page really carries. */
        for (const block of blocks) for (const reading of block.readings ?? []) seen.push(reading.metric);
        out.push(resource(`page/${page.slug}`, `${page.title}, with every block run: rows and figures, never markup.`));
      }

    /**
     * AND A FIGURE IS READ BEFORE IT IS OFFERED, because a reading survives its own refusal. The
     * kernel keeps the id on a cell it could not fill, so a figure the record says does not exist
     * arrives here with the rest. The record answers `METRIC_UNKNOWN` for a figure over a register
     * the caller cannot reach, so that a name leaks nothing; advertising the id would hand the name
     * back one layer further out.
     */
    for (const id of new Set(seen)) await offer(resource(`metric/${id}`, `The figure ${id}, with its target and how it compares.`));

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
      return shaped(answer, (register) => prefixes.get(register) ?? '');
    },
  };
}

/** The tools whose answer is a row, a page of rows, or a page of log lines. */
const SHAPED = new Set(['get', 'list', 'create', 'update', 'log', 'handoff', 'activity']);
