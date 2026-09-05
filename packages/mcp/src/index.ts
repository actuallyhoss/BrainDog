/**
 * The eight tools, which are the whole of what an agent sees.
 *
 * THE COUNT IS THE DESIGN. `10-MCP` §6 puts a budget on it — the tool list is in every turn of every
 * session, so one more tool costs every conversation for ever. What a bigger surface buys is
 * convenience for the caller; what it costs is attention, permanently. So the record's own
 * vocabulary carries the load: `list` takes a predicate rather than there being fourteen filter
 * tools.
 *
 * NINE, AND WHICH NINE IS WORTH STATING. `10-MCP` §5 names eight — `record_index` · `search` · `get`
 * · `list` · `create` · `update` · `propose` · `log`. `propose` is not here because suggestions are
 * not built yet, and a tool that refuses everything is worse than a tool that is absent. `schema`
 * and `history` are here and are RESOURCES in that document; this build serves no resources, and an
 * agent that cannot read a register's fields writes a refused row, which costs more than the tool
 * does. When resources exist, those two leave.
 *
 * `record_index` IS THE FIRST CALL AND IT IS CHEAP ON PURPOSE. An agent that has to guess a register
 * name writes a refused call, and a refused call costs more than the orientation would have.
 *
 * A REFUSAL IS THE TEACHER. Every tool answers in the record's own shape — `ok` and a value, or a
 * code and a sentence naming what to send instead — because the caller is a model that will try
 * again immediately, and the difference between a good refusal and a bad one is whether the second
 * attempt works.
 */

import type { Result } from '@braindog/ports';
import type { CallContext, RecordApi } from '@braindog/record';

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
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const TOOLS: readonly Tool[] = [
  {
    name: 'record_index',
    description: 'What this record holds: its registers, how many rows in each, and its version. Call this first.',
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
    description: 'One row, by the number a person says out loud — obligations#41.',
    input: obj({ spoken: str('register#number, as a person says it.') }, ['spoken']),
    writes: false,
  },
  {
    name: 'list',
    description:
      'Rows of one register, narrowed by a predicate. The predicate is a tree: {"field":"state","is":"open"}, or {"all":[…]}.',
    input: obj(
      {
        register: str('A register id.'),
        where: { type: 'object', description: 'A predicate tree. Omit for everything.' },
        limit: { type: 'integer', description: '1 to 500. Default 50.' },
        cursor: str('From a previous answer, to continue.'),
      },
      ['register'],
    ),
    writes: false,
  },
  {
    name: 'search',
    description: 'Rows whose text matches, across every register you can see. Every word is a prefix.',
    input: obj({ q: str('What to look for. Plain words; the operators are not read.'), limit: { type: 'integer', description: '1 to 100. Default 20.' } }, ['q']),
    writes: false,
  },
  {
    name: 'history',
    description: 'The writes that made one row, in order, each with who and when.',
    input: obj({ spoken: str('register#number.') }, ['spoken']),
    writes: false,
  },
  {
    name: 'pages',
    description: 'The pages this record can draw, by slug. A project page is one declaration per row, so there are more of these than there are declarations.',
    input: obj({}),
    writes: false,
  },
  {
    name: 'page',
    description:
      'One page: every block run, as rows and figures rather than markup. A block the record could not draw says why, and the rest of the page still comes back.',
    input: obj({ slug: str('A slug from pages.') }, ['slug']),
    writes: false,
  },
  {
    name: 'metric',
    description:
      'One figure, with the target it is measured against and how it compares to the window before. Add a parameter after a colon for a metric about one thing: project-owed:Kiln.',
    input: obj({ metric: str('A metric id, optionally with :parameter.') }, ['metric']),
    writes: false,
  },
  {
    name: 'credentials',
    description:
      'What each credential OPENS — its label, what it reaches, its kind, when it was last used and when it is due for rotation. Never the credential itself, which no tool can read.',
    input: obj({}),
    writes: false,
  },
  {
    name: 'dry_run',
    description:
      'What a rule would do, before anybody turns it on: how many rows it matches, how many it wins, which rule takes the rest, and a sample. It writes nothing.',
    input: obj({ rule: { type: 'object', description: 'A rule declaration: register, when, then.' } }, ['rule']),
    writes: false,
  },
  {
    name: 'create',
    description: 'Add a row to a register. The record allocates its number and hands it back.',
    input: obj(
      { register: str('A register id.'), fields: { type: 'object', description: 'Field ids to values.' }, note: str('One sentence a person reads in six weeks.') },
      ['register', 'fields'],
    ),
    writes: true,
  },
  {
    name: 'update',
    description:
      'Change a row. Send the version you read, and a stale write is refused rather than merged — read it again and reapply.',
    input: obj(
      {
        spoken: str('register#number.'),
        patch: { type: 'object', description: 'Field ids to values. null clears a field.' },
        version: { type: 'integer', description: "The row's version when you read it." },
        note: str('One sentence a person reads in six weeks.'),
      },
      ['spoken', 'patch'],
    ),
    writes: true,
  },
  {
    name: 'log',
    description: 'Append one note to a row, changing nothing about it. One sentence, for the next reader.',
    input: obj({ spoken: str('register#number.'), note: str('One sentence.') }, ['spoken', 'note']),
    writes: true,
  },
];

/** `obligations#41` — the only way an agent addresses a row, because it is the way a person says it. */
const SPOKEN = /^([a-z][a-z0-9_]{0,31})#(\d+)$/;

const parse = (spoken: unknown): { register: string; seq: number } | null => {
  const m = typeof spoken === 'string' ? SPOKEN.exec(spoken.trim()) : null;
  return m ? { register: m[1]!, seq: Number(m[2]) } : null;
};

const badSpoken = (): Result<never> => ({
  ok: false,
  refusal: { code: 'VALUE_MALFORMED', fix: 'A row is addressed as register#number, like obligations#41.', at: 'spoken' },
});

/**
 * Run one tool against the record.
 *
 * The tool layer holds NO logic of its own beyond addressing: every refusal a caller sees comes from
 * the record, with the sentence the record wrote. A second set of checks here would be a second set
 * to keep in step, and the one that drifted would be the one an agent reads.
 */
export function tools(api: RecordApi) {
  const run: Record<string, (args: Record<string, unknown>, ctx: CallContext) => Promise<Result<unknown>>> = {
    record_index: async (_args, ctx) => {
      const boot = await api.boot(ctx);
      if (!boot.ok) return boot;
      const version = await api.version(ctx);
      return { ok: true, value: { ...boot.value, version: version.ok ? version.value : null } };
    },

    schema: (args, ctx) => api.schema({ register: String(args.register) }, ctx),

    get: async (args, ctx) => {
      const at = parse(args.spoken);
      return at ? api.get(at, ctx) : badSpoken();
    },

    list: (args, ctx) =>
      api.list(
        {
          register: String(args.register),
          ...(args.where === undefined ? {} : { where: args.where as never }),
          ...(args.limit === undefined ? {} : { limit: Number(args.limit) }),
          ...(args.cursor === undefined ? {} : { cursor: String(args.cursor) }),
        },
        ctx,
      ),

    search: (args, ctx) =>
      api.search({ q: String(args.q ?? ''), ...(args.limit === undefined ? {} : { limit: Number(args.limit) }) }, ctx),

    history: async (args, ctx) => {
      const at = parse(args.spoken);
      return at ? api.history(at, ctx) : badSpoken();
    },

    pages: (_args, ctx) => api.pages(ctx),
    page: (args, ctx) => api.page({ slug: String(args.slug ?? '') }, ctx),
    metric: (args, ctx) => api.metric({ metric: String(args.metric ?? '') }, ctx),

    /**
     * WHAT A KEY OPENS, NEVER THE KEY.
     *
     * There is no tool that reads a credential and there is not going to be one: the vault needs a
     * person in a browser, and an agent holding a token is neither. What an agent CAN have is the
     * index — "the Stripe live key reaches stripe.com, was last opened in June, is due for rotation
     * in eleven days" — which is what makes "check nothing is about to expire" a thing it can do
     * without anything being readable that should not be.
     */
    credentials: (_args, ctx) => api.listGrants(ctx),

    /**
     * PREVIEW BEFORE PROPOSE. An agent writing a rule is exactly the caller who most needs to see
     * what it would do first — it cannot look at the screen afterwards, and a rule that quietly
     * tagged four hundred rows is a rule nobody can undo by hand.
     */
    dry_run: (args, ctx) => api.dryRun({ rule: (args.rule ?? {}) as never }, ctx),

    create: (args, ctx) =>
      api.create(
        {
          register: String(args.register),
          fields: (args.fields ?? {}) as Record<string, unknown>,
          ...(args.note === undefined ? {} : { note: String(args.note) }),
        },
        ctx,
      ),

    update: async (args, ctx) => {
      const at = parse(args.spoken);
      if (!at) return badSpoken();
      return api.update(
        {
          ...at,
          patch: (args.patch ?? {}) as Record<string, unknown>,
          ...(args.version === undefined ? {} : { version: Number(args.version) }),
          ...(args.note === undefined ? {} : { note: String(args.note) }),
        },
        ctx,
      );
    },

    /**
     * A note changes nothing about the row and is still a write, because it is a thing somebody
     * said and the record keeps what was said. It goes through `update` with an empty patch, so it
     * answers to the same permission and lands in the same history.
     */
    log: async (args, ctx) => {
      const at = parse(args.spoken);
      if (!at) return badSpoken();
      const note = String(args.note ?? '').trim();
      if (!note)
        return { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'A note is one sentence, and this one is empty.', at: 'note' } };
      return api.update({ ...at, patch: {}, note }, ctx);
    },
  };

  return {
    list: () => TOOLS,
    async call(name: string, args: Record<string, unknown>, ctx: CallContext): Promise<Result<unknown>> {
      const tool = run[name];
      if (!tool)
        return {
          ok: false,
          refusal: {
            code: 'ROUTE_UNKNOWN',
            fix: `There is no tool called ${name}.`,
            allowed: TOOLS.map((t) => t.name),
          },
        };
      return tool(args, ctx);
    },
  };
}
