/**
 * The client. One `fetch`, the route table, and the same `Result` at both ends.
 *
 * IT IS TYPED FROM THE SAME TABLE THE SERVER SERVES. `ROUTES` says which methods exist and which of
 * them write, so a client that calls a method the server does not have fails at the type level
 * rather than at a 404 in production — and a method added to the table without a client is a compile
 * error in the app that uses it.
 *
 * NOTHING THROWS FOR A REFUSAL. A refused call is a value with a code and a sentence, exactly as it
 * is inside the record: a client that throws on 422 makes every caller write a try/catch to read a
 * message that was already structured, and the message loses its shape on the way through.
 *
 * A THROW IS RESERVED FOR THE NETWORK, because that is the one failure the record has no opinion
 * about — and even then it comes back as a refusal, so a caller has exactly one branch to write.
 *
 * A METHOD ADDED FROM NOW ON IS TYPED FROM `@braindog/host/types`, as `call<Answer<'x'>>('x', args)`,
 * so its answer is declared once, in the record, and not a second time below. The shapes written out
 * here are the older half and stay until each moves with the test that holds it (see "The wire shapes").
 */

import type { Refusal, Result } from '@braindog/ports';
/* THE TABLE ALONE, AND NOT THE HOST: `@braindog/host` re-exports every door and the kernel behind them, and this file is
   in every screen's first load. `table.ts` is the same rows with nothing else. */
import { ROUTES } from '@braindog/host/table';
/* THE TABLE ITSELF, FOR A CALLER THAT NAMES A CALL AT RUN TIME (the command line's MCP `act`): data, no host. */
export { ROUTES as CALL_TABLE };
import type { Answer, AnswerOr } from '@braindog/host/types';
import type { ShareClosed, ShareLink, ShareRow } from '@braindog/host';

export type ClientOptions = {
  /**
   * Where the host is. `https://braindog.example` or `http://127.0.0.1:8787` — the method is
   * appended as `/api/<method>`, which is 33 §4's surface and the same on both hosts.
   *
   * WHICH RECORD IS THE TOKEN'S TO SAY, not the URL's. A bearer is `<rec_id>.<secret>` and the host
   * routes on the half in front of the dot; there is no slug in the path, because `/r/<register>` is
   * the app's own register list and a tenant prefix there would take every link in the product with
   * it.
   */
  base: string;
  /** Sent as a bearer. Absent on a self-host that was started without one. */
  token?: string | undefined;
  /** Injectable so a test can drive the client without a socket, and a Worker can pass its own. */
  fetch?: typeof globalThis.fetch;
  /**
   * The calls this client sends are asked AHEAD of the screen that will draw them (the app's `data/early-asks.ts`): still
   * counted as out, and told apart (`onCallsOut`'s second count), so a wait for the screen's own reads can leave them out.
   */
  ahead?: boolean;
};

/**
 * The wire shapes, written here before the record's could be named from this side.
 *
 * THEY WERE WRITTEN OUT A SECOND TIME, AND THE COPY IS THE COST. `31 §2` gives this package two edges,
 * `ports` and `host`, and the record is neither, so every answer was declared twice and only
 * `apps/selfhost/test/client.test.ts` held the two equal: a field the record renamed reached the app
 * as a failed integration test, never as a type error. `host` depends on the record, so
 * `@braindog/host/types` re-exports its answer types, type-only, and a method added from now on names
 * its answer from there (`Answer<'x'>`) and writes no shape here.
 *
 * THE ONES BELOW STAY UNTIL EACH MOVES WITH ITS TEST. `client.test.ts` holds them against a running
 * server, because only an app may name a runtime and the check needs a server to answer, and
 * rewriting all of them by reading, with nothing run, is where a build breaks.
 */

/**
 * A person's own settings, key by key: the record's `Prefs`, named through `boot`'s answer so that `setPref`'s keys and
 * `Boot.me.prefs` are one declaration, the record's, and a key it adds is a key this side takes.
 */
type Prefs = NonNullable<Answer<'boot'>['me']['prefs']>;

/** `boot`, and `now` is the record's own instant. See `Boot` in `@braindog/record`. */
export type Boot = {
  /** Each list the caller reads; `icon` is the glyph its declaration names, `null` for none, absent from an older host. */
  /** `kernel` marks a list the kernel declares itself (the runs, what he told them), never one he filed into. */
  registers: { id: string; name: string; count: number; open?: number; icon?: string | null; kernel?: true; pack?: string }[];
  /** ISO 8601, UTC. What day the record thinks it is, which is not always what day the reader does. */
  now: string;
  /* OPTIONAL, because a host older than the session register answers without them. */
  /** The runs that are live now, as `sessionsLive` answers. */
  sessions?: LiveRun[];
  /** Open suggestions, newest first, each with its question: what waits on a person. */
  waiting?: { id: string; body_kind: string; opened_by: string; opened_at: string; question?: string }[];
  /* OPTIONAL TOO, for the same reason: a host older than the layout's reads answers without them. */
  /**
   * The record's own name, or `null` for one that was never provisioned.
   *
   * `currency` is the home currency a person chose, `null` when nobody has: every amount is written on its terms. ABSENT
   * FROM A HOST OLDER THAN THE FIELD, which a reader tells from `null` (nobody chose) by the key not being there.
   */
  record?: {
    slug: string;
    name: string;
    locale: string;
    currency?: string | null;
    /**
     * The currencies the money the caller reads is in, sorted, at most two. A host that sends it already folded the one
     * currency into `currency`, so `null` beside it is none or two. Absent from an older host.
     */
    money?: string[];
  } | null;
  /**
   * `record.currency` and `record.money`, sent whether or not the record has a name, so a record nobody named still
   * tells its shell the home currency. Absent from a host older than the field.
   */
  currency?: string | null;
  money?: string[];
  /** The record's own time zone, which "today" is counted in. Absent from a host older than the field. */
  zone?: string;
  /** Who is asking: the person behind the call, their name, and what they hold on the record. */
  me?: {
    kind: 'person' | 'token' | 'system';
    person: string | null;
    name: string | null;
    level: string | null;
    /** The level the caller holds on each list, by id, as the record's `shellFor` answers it. Absent from an older host. */
    levels?: Record<string, string>;
    /** A person's own settings, as `setPref` kept them, key by key: the record's `Prefs`. Absent for anybody else. */
    prefs?: Prefs;
  };
  /** Each person on the record by name, by id: sent only to a caller who may read the membership list or People. */
  names?: Record<string, string>;
  /**
   * The slug of the caller's Home page, the one the shell opens first, or `null` where the record names none. The record
   * sends it on every boot; the type keeps it required so a reader cannot forget the `null`.
   */
  home: string | null;
  /**
   * Which host is serving the record, when the host said. ABSENT IS A HOST THAT DID NOT SAY, a test, the CLI or a host
   * older than the field, and not a guess at either: a reader keeps whatever it inferred before the field existed.
   */
  host?: 'cloud' | 'self-host';
  /** A self-host in its Docker image (PK5), so a screen prints the `docker compose` command only there. */
  image?: true;
  /**
   * The pages of rows that come and go (a run's), by their address alone, by list: each row's number and its page's
   * slug, so a link to the row opens its page. `pages` lists them no more. Absent from an older host, which lists them
   * in `pages`.
   */
  rowPages?: { register: string; rows: [seq: number, slug: string][] }[];
  /**
   * The lists whose rows' pages open by the row's spoken id, `page` asked for `session#904`: `boot` lists none of those
   * pages, not even by address. Absent from an older host, which sends `rowPages`.
   */
  pagesByRow?: string[];
  /**
   * The pages the caller may open, each with its place in the rail when it has one.
   *
   * `about` IS THE ROW THE PAGE CAME OUT OF, and `null` for a page somebody wrote. A declaration
   * carrying `for:` is one page per row, so it is also one rail entry per row, and the cap that
   * holds that down is per list and per heading: measured at 27 projects, 23 services and 22
   * skills, the rail drew 72 entries, one per row, against 15. Without this field the shell has a
   * slug and a heading and no way to say which list an entry grew out of, so the rule could not
   * be expressed there at all. Absent from a host older than the field, and the shell then draws
   * the rail it drew before.
   */
  pages?: {
    slug: string;
    title: string;
    /** `place` is the page's own place in the rail, a whole number 0 to 9999, absent where it names none or from an older host. */
    nav: { section: string; order: number; place?: number; tabs?: true } | null;
    icon: string | null;
    list?: string | null;
    /**
     * Every list the page reads that this caller reads too; never the whole record, and never a list holding only what
     * an add-on planted. `null` when the page reads lists and every one is a starter set. Absent from a host older than this.
     */
    lists?: string[] | null;
    /**
     * `updated_at`, when that row last changed, picks the rail's five. `hue` is the row's frozen colour, the whole degree
     * its list's `identity.accent` holds, `null` for a row that holds none and absent where the list names no accent.
     * Each is absent from a host older than it.
     */
    about?: { register: string; seq: number | null; updated_at?: string; hue?: number | null } | null;
  }[];
  /**
   * How many questions wait on a person, how many arrivals wait in the inbox, and how many ever arrived: `null` when the
   * caller may not see it. `arrived` is absent from a host older than the field.
   */
  counts?: { decide: number; inbox: number | null; decided?: number; arrived?: number | null };
  /**
   * The holding pen, as the record's `PenItem`s: what the record would add if somebody asked, each with the whole
   * declaration accepting it writes. Empty for a caller who is offered nothing; absent from a host older than the field.
   */
  pen?: Answer<'boot'>['pen'];
  /** What changed since the caller last read, as `whatsNew` answers. */
  whatsNew?: WhatsNew;
  /** The record's installed look, as the record's Boot.theme: each scheme's custom properties without the `--`; null for the house look; absent from an older host. */
  theme?: { light: Record<string, string>; dark: Record<string, string> } | null;
  /** The looks the record holds, its own and those an add-on brought, which the theme chooser offers; absent from an older host. */
  looks?: { id: string; name: string; from: 'own' | 'pack'; pack?: string }[];
  /*
   * THE SHELL'S ONE ROUND TRIP, each absent from a host older than shape 2, which a reader then asks the way it
   * asked before: `waits` from `counts`, `working` from `sessions`, the voice from the add-ons, and Slash from `version`.
   */
  /** Which shape the answer is: 2 since the five fields below joined it, 3 since `copies`. Absent from an older host. */
  shape?: number;
  /**
   * What waits on the caller, counted once by the record (`waiting()`): open questions, how many are late and how many
   * hard to undo, arrivals in the inbox (`null` where the caller is not told), and agents working now. The rail's badge,
   * Today's header and Decide's sentence say these.
   */
  waits?: BootWaits;
  /** How many days a question waits before it is late, which `waits.late` counts. */
  lateDays?: number;
  /** The agents working now (active and not quiet), most recently heard from first. Empty for a caller who may not read runs. */
  working?: BootWorking[];
  /** The voice the record speaks in: the use case that speaks (`null` for the house voice), its settings and their labels. */
  voice?: BootVoice;
  /** Whether a model is behind Slash on this host, as `version` says it. */
  slash?: boolean;
  /**
   * The record's copies as three facts (shape 3): when the last nightly copy was kept and its size in bytes, and
   * when a person last exported it, each `null` until there is one. Sent only to a caller who may take a copy, so absent
   * for anybody else and from an older host.
   */
  copies?: BootCopies;
  /**
   * The rail's places, in the order the record keeps them: each page with its glyph, its name, who put it there (an
   * add-on, the person, or the engine) and its section, and `more` for what does not fit. Absent from an older host.
   */
  places?: { places: BootPlace[]; more: BootPlace[] };
  /** Each computed source the record reads and how it draws. Absent from an older host. */
  computed?: { source: string; drawsAs: string }[];
};

/** One place in the rail, as `boot` says it (`places`). */
export type BootPlace = { page: string; icon: string | null; name: string; by: 'addon' | 'person' | 'engine'; section: string | null };

/** What `boot` says about the record's copies. See `CopyFacts` in `@braindog/kernel`. */
export type BootCopies = { last_copy_at: string | null; last_copy_bytes: number | null; last_export_at: string | null };

/** What waits on a person, as `boot` says it (`waits`). */
export type BootWaits = { questions: number; late: number; hard: number; inbox: number | null; working: number };

/** One agent at work, as `boot` sends it: its handle beside its agent, what it does, its project by name, and how long. */
export type BootWorking = {
  spoken: string;
  seq: number | null;
  agent: string | null;
  doing: string | null;
  project: string | null;
  since: string;
  last_seen: string;
  ran_s: number;
};

/** The voice `boot` sends: the use case that speaks, its settings' values, and the label each setting names. */
export type BootVoice = { pack: string | null; values: Record<string, unknown>; labels: Record<string, string> };

/** One line of the log, as `whatsNew` and `recentHistory` send it. See `EventLine` in `@braindog/record`. */
export type EventLine = {
  /**
   * The event's place in the log. Sent to a caller who reads the whole record and to nobody else: between two lines of a
   * member invited to one list it counted the events she was not shown. Key a line by `id`, which every line carries.
   */
  rowid?: number;
  id: string;
  ts: string;
  actor: string;
  kind: string;
  target: string | null;
  target_kind: string | null;
  field: string | null;
  from: unknown;
  to: unknown;
  note: string | null;
  /** The write that caused it, shared by every line that write made; `null` for a line written on its own. Absent from an older host. */
  batch?: string | null;
  /** The row's register and number, when the event is about a row. */
  register: string | null;
  seq: number | null;
  /** What the thing is called: a row's title, or a question. */
  title: string | null;
  /** On a line a run signed, who that run is, or `null` for a run the record does not hold. Absent from an older host. */
  run_by?: { run: string; agent: string; client: string | null; parent: string | null } | null;
  /** On a `decide` line, the question it settled (`SG4`): the `resolve` beside it targets `suggestion:<settles>`. */
  settles?: string;
  /** On a line the making of this BrainDog wrote (PK1): a starter's own rows, never "you added". Absent everywhere else. */
  made?: true;
  /** On the one line a pass of BrainDog's own update is said as (kind `update`): its sentence and counts. */
  pass?: { said: string; updated: number; asked: number; steps: number; at: string };
  /** Every line that pass wrote, newest first. */
  steps?: EventLine[];
  /**
   * On a line that settled a suggestion, or a row's event an accepted suggestion wrote: who suggested it, who drafted it
   * (`rules` or the model's name), the chosen option's own words on a `decide`, who settled it, and `undone` on the
   * event that took it back. Absent from a host that does not say them, which today is every host: the record's log
   * read does not send them yet.
   */
  suggested_by?: string | null;
  drafted_by?: string | null;
  answer_label?: string | null;
  settled_by?: string | null;
  undone?: boolean | null;
  /** Who had answered the question an undo took back (rule:ladder when Slash's rung let it land), and who kept a change that landed alone. */
  answered_by?: string | null;
  kept_by?: string | null;
};

/** Who wrote the lines a read answers: the record is BrainDog itself, never an agent or a person. */
export type ByWho = { you: number; people: number; agents: number; rules: number; record: number };

/**
 * Where a page of the log stops, or what a read mark reaches. A rowid for a caller who reads the whole record, and an
 * opaque string (`e.<id>`, `s.<sealed>`) for anybody else. Hand it back as it came; do not do arithmetic on it.
 */
export type Cursor = number | string;

/** `whatsNew`: newest first, at most sixty. `upTo` is what `markRead` takes to mark all of them read. */
export type WhatsNew = { events: EventLine[]; upTo: Cursor | null; sinceCapped: boolean; byWho?: ByWho };

/** The keys of a line `boot` leaves out when they are `null` (`newsCut` in `@braindog/record`). */
const NEWS_SPARE = ['target', 'field', 'from', 'to', 'note', 'batch', 'register', 'seq', 'title'] as const;
/** The keys a line of `boot`'s leaves out where the line before it about the same target said the same. */
const NEWS_SAME = ['register', 'seq', 'title', 'actor'] as const;

/**
 * `boot`'s news as `whatsNew` would say it (`newsCut` in `@braindog/record`): a key a line leaves out takes the value
 * the line before it about the same target holds (newer, above it in the list), and failing one is `null`; a
 * `target_kind` left out is the target's own first word. A line that holds every key is answered as it came, so an older
 * host's `boot` reads the same.
 */
export function linesFilled(lines: readonly EventLine[]): EventLine[] {
  const before = new Map<string, EventLine>();
  return lines.map((line) => {
    const raw = line as Partial<EventLine> & Pick<EventLine, 'id'>;
    const out: Record<string, unknown> = { ...raw };
    const target = typeof raw.target === 'string' ? raw.target : null;
    const prior = target === null ? undefined : before.get(target);
    if (prior !== undefined) for (const k of NEWS_SAME) if (!(k in out)) out[k] = prior[k];
    for (const k of NEWS_SPARE) if (!(k in out)) out[k] = null;
    if (!('target_kind' in out)) out.target_kind = target === null ? null : target.split(':', 1)[0];
    if (Array.isArray(raw.steps)) out.steps = linesFilled(raw.steps);
    const filled = out as EventLine;
    if (target !== null) before.set(target, filled);
    return filled;
  });
}

/** `boot` with its news filled (`linesFilled`), which is the shape every reader of it reads. */
export function bootFilled(boot: Boot): Boot {
  /* AN ANSWER THAT IS NOT A BOOT IS ANSWERED AS IT CAME, as `call` answers every other. */
  const news = typeof boot === 'object' && boot !== null ? boot.whatsNew : undefined;
  return news && Array.isArray(news.events) ? { ...boot, whatsNew: { ...news, events: linesFilled(news.events) } } : boot;
}

/** `recentHistory`: one page, newest first, and the cursor for the page below it. */
export type HistoryPage = { events: EventLine[]; cursor: Cursor | null; byWho?: ByWho };

/** One arrival no rule filed, as `inbox` sends it. See `InboxLine` in `@braindog/kernel`. */
export type InboxLine = {
  rowid: number;
  id: string;
  ts: string;
  channel: string;
  from: string;
  to: string;
  subject: string;
  body: string | null;
  /** Where it is: `untriaged` and `review` wait, `matched` was filed, `ignored` was archived. See `InboxState`. */
  state: InboxState;
  reason: string | null;
  /**
   * Who filed or archived it, when a person or an agent's run did, and the row a filing made with the version Put back
   * archives it at. Absent while it waits, and on one a rule filed. See `ArrivalSettlement` in `@braindog/kernel`.
   */
  settled?: {
    by: string;
    at: string;
    row: { id: string; register: string; seq: number | null; version: number; archived: boolean } | null;
  };
  /**
   * The id of the row a skipped arrival repeats, a handle for "It is a second one" and never shown. Absent on every
   * arrival the dedupe did not set aside, a rule's skip among them. See `InboxLine.repeats` in `@braindog/kernel`.
   */
  repeats?: string;
};

/** The states `inbox` reads arrivals in, as `INBOX_STATES` in `@braindog/kernel` names them. */
export type InboxState = 'untriaged' | 'review' | 'skipped' | 'matched' | 'proposed' | 'ignored';

/**
 * `inbox`: one page of the arrivals in the state asked for, newest first, the cursor for the page below it, how many are
 * in each state, and how many a rule filed this week. `counts` and `ruledThisWeek` are absent from an older host.
 */
export type InboxPage = {
  arrivals: InboxLine[];
  cursor: number | null;
  counts?: Record<InboxState, number>;
  ruledThisWeek?: number;
};

/** An arrival on a digest: its line with the body's first 180 characters, and `cut` only when there were more. */
export type InboxDigestLine = InboxLine & { cut?: true };

/**
 * `inbox({ digest: true })`: how many arrivals are in each of the six states, and each state's newest hundred, newest
 * first. A state that holds more says so by its count and is paged with `state`; a cut body is read whole with `id`.
 */
export type InboxDigest = { counts: Record<InboxState, number>; states: Record<InboxState, InboxDigestLine[]> };

/**
 * What `inbox` takes: the paged read's four, or `digest` alone, or `id` alone. The record refuses state, cursor, limit
 * or repeats beside either, and each beside the other.
 */
export type InboxArgs =
  | { state?: InboxState | 'all'; cursor?: number; limit?: number; repeats?: boolean; digest?: never; id?: never }
  | { digest: true }
  | { id: string };

/**
 * `inbox({ id })`: one arrival whole, its body never cut, in the state it is in now. The same line a page and a digest
 * send, so an agent that read a cut body on a digest reads it to its end here.
 */
export type InboxArrival = InboxLine;

/** What `inbox` answers for what it was asked: a digest, one arrival whole, or a page. */
export type InboxAnswer<A> = A extends { digest: true } ? InboxDigest : A extends { id: string } ? InboxArrival : InboxPage;

/**
 * One figure as `figures` lists it: never its reading, which `metric` answers. `format` is how the declaration says to
 * write it (`money.GBP`, `int`, `days`) and not the currency its rows are in, which only a reading knows. `param` is a
 * figure read about one thing, asked as `<id>:<value>`.
 */
export type FigureEntry = { id: string; name: string; format: string | null; list: string | null; pack: string | null; param: boolean };

/**
 * `offered`: everything the caller may read, in one read, as `{ fixed, lists, pages, figures, skills }`. `fixed` is the
 * addresses with no parameter, each decided by the check its own reader asks; a skill is its name and when to use it,
 * never its text. See `Offered` in `packages/record/src/methods/offered.ts`.
 */
export type Offered = Answer<'offered'>;

/**
 * One row as `context` shows it: its spoken id, version, scope, state, and its register's mobile fields.
 * A key's secret field is `{ sealed, opened, last_opened, last_by }`, never a value.
 */
export type Brief = { spoken: string; version: number; scope: 'project' | 'global'; state: string | null } & Record<string, unknown>;

/** What `context({ since })` answers: only what moved for the caller's run since that stamp, as the lines to say. */
export type ContextSince = {
  since: { stamp: string | null; changed: boolean; pending: Answer<'instructionsMine'>['pending']; stop: Answer<'pulse'>['stop']; lines: string[] };
};

/** `context`: where an agent stands, in one call. See `Context` in `@braindog/record`. */
export type Context = {
  session: { spoken: string; state: string | null } | null;
  project: { spoken: string; name: string; mark: string | null; hue: number | null; how: 'remote' | 'folder' | 'repo' | 'asked' } | null;
  ambiguous: string[];
  /** What stops this run, with the line in his words, or `null`. Absent from a host older than instructions. */
  stop?: (Answer<'pulse'>['stop'] & { line: string }) | null;
  /** What he told this run that is still open, a stop or pause first, each with the line in his voice. Absent from an older host. */
  told?: Answer<'instructionsMine'>['pending'];
  /** The run's version stamp, which moves with anything for it; `null` before it has a run. Absent from an older host. */
  stamp?: string | null;
  /** What his settings let this agent do, as one sentence, and his brief for it. Absent from an older host. */
  may?: string | null;
  brief?: string | null;
  /** The context size his settings give this agent, in tokens. Absent from an older host. */
  budget?: number;
  /** Whether his stop switch (the hooks) and the channel are on for this agent. Absent from an older host. */
  enforce?: { hooks: boolean; channel: boolean } | null;
  depth?: 'card' | 'brief' | 'task' | 'full';
  /** The task `context({ task })` asked for, whole. */
  task?: { spoken: string; register: string; list: string; version: number; fields: Record<string, unknown>; project: string | null; history: string[] } | null;
  /**
   * The step another run left open here (`openHandoffs`, marked `next`). `agent` is the kind of agent that left it,
   * `left_at` when, and `earlier` how many more steps are open here besides. Those three are absent from a host older
   * than the briefing that sends them.
   */
  handoff: {
    from: string;
    agent?: string | null;
    left_at?: string;
    age_s: number;
    next: string;
    tried: string[];
    head: string | null;
    earlier?: number;
  } | null;
  live: { same_repo: LiveBrief[]; elsewhere: LiveBrief[] };
  /** Who else is working in the caller's tree now, or `null` when nobody is. Absent from an older host. */
  also_here?: AlsoHere | null;
  /**
   * The Next slot as lines with no label: the open step with its writer, age and commits since, the step a working run
   * took, or "Nothing was handed over" with the last run here. Empty where no run ended before; absent from an older host.
   */
  next_lines?: string[];
  waiting: { id: string; question: string }[];
  registers: { id: string; name: string; rows: Brief[]; inherited: Brief[]; truncated: boolean }[];
  /** The people linked here, most recently in touch first. A current host sends each as a `PersonBrief`. */
  people: Brief[];
  /** How many people past the record's own are linked here, sent only when there are more than `people` holds. */
  people_total?: number;
  /** The record's own person by every key they are known by (`kind:value`), or `null`. Absent from an older host. */
  self?: { keys: string[] } | null;
  /** The organisations of this project by name, the linked ones first. Absent from an older host. */
  organisations?: OrgBrief[];
  faded: number;
  /**
   * The record's vital signs that are red now, each by its name with its one sentence, so a session starts knowing what
   * is broken. Empty for a caller narrower than the whole record; absent from an older host.
   */
  signs?: { name: string; said: string }[];
  next: string;
  /**
   * The briefing as one card, at most 150 words, and its Next line alone for a compaction (`card.ts` in
   * `@braindog/record`), with the calling command's build and whether it is older than the host's oldest. Optional, so an
   * older host that sends none of them still types.
   */
  card?: string;
  card_next?: string | null;
  build?: { cli: string | null; behind: boolean } | null;
};

/** Who else works in the caller's tree, as `context` says it. See `AlsoHere` in `@braindog/record`. */
export type AlsoHere = {
  /** The one warning, said once however many there are. */
  warning: string;
  /** The few heard from last, by name, each with what it says it is doing. */
  runs: { name: string; doing: string | null }[];
  /** How many more are working here past those. */
  more: number;
  /** The two lines as the card prints them: the warning, then "Also here: ...". */
  lines: [string, string];
};

/** A person linked to the project, as `context` names them. See `PersonBrief` in `@braindog/record`. */
export type PersonBrief = Brief & { name: string; role: string | null; org: string | null; in_touch: string | null; self: boolean };

/** An organisation of the project, by name; `linked` is true for the project's own. See `OrgBrief` in `@braindog/record`. */
export type OrgBrief = { spoken: string; name: string; kind: string | null; linked: boolean };

/** Another run that is live now, as `context` shows it. */
export type LiveBrief = {
  spoken: string;
  state: string | null;
  doing: string | null;
  agent: string | null;
  repo: string | null;
  project: string | null;
  stale: boolean;
  /** Open and not heard from in 30 minutes: open is not working. */
  quiet: boolean;
  age_s: number;
};

/** One live run: the row, its spoken id, and what is worked out when it is read. */
export type LiveRun = {
  id: string;
  seq: number;
  spoken: string;
  state: string | null;
  version: number;
  fields: Record<string, unknown>;
  /** Not heard from in 45 minutes, so the record no longer joins a call that names no run to it. */
  stale: boolean;
  /**
   * Open, active or idle, and not heard from in 30 minutes: what a person is shown as gone quiet rather than working.
   * Worked out when read, like `stale`, and never a state of its own.
   */
  quiet: boolean;
  /** Seconds since it was last heard from. */
  age_s: number;
  /** Seconds it has been going: to now while it works, and frozen at the last time it was heard from once it stopped. */
  ran_s: number;
  /** Its repository is the one the caller said it is in. */
  same_repo: boolean;
  /** Where the run stands for a person: working, quiet, or left a step. Absent from a host older than the field. */
  presence?: 'working' | 'quiet' | 'left' | 'ended' | 'stopped' | 'before';
};

/** `attach`: the run this agent is, and whether it was already there. */
export type Attached = {
  session: { id: string; seq: number; state: string | null; version: number; fields: Record<string, unknown> };
  spoken: string;
  resumed: boolean;
  /** The project the run is placed in, by spoken id, or `null` for none. */
  project: string | null;
  /** The briefing for where the run stands. Optional, because a host older than `context` sends none. */
  context?: Context;
};

/**
 * What `meet` is told: a name and whatever identifies them, an email, a handle or `kind:value`
 * keys, whether it is a person or an organisation, and where they were met, as a short plain phrase.
 */
export type Meet = {
  name?: string;
  email?: string;
  handle?: string;
  keys?: readonly string[];
  kind?: 'person' | 'organisation';
  org?: string;
  domain?: string;
  role?: string;
  where?: string;
  source?: string;
};

/**
 * `meet`: the row they turned out to be by its handle and name, or `null` for a name kept only as a mention; whether it
 * was added; how it matched; and the question a doubtful match opened on Decide. See `Meeting` in `@braindog/record`.
 */
export type Met = Answer<'meet'>;

/**
 * `sameOne`: the question on Decide asking whether the people picked are one, and whether this call opened it or it was
 * already waiting. Nothing is merged until somebody answers it. See `SameOne` in `@braindog/record`.
 */
export type SameOne = Answer<'sameOne'>;

/**
 * `heldTwice`: the people of a list who may be on the record twice, each by their number in the list, lowest first, or
 * `null` when the list is not where this record keeps people. See `HeldTwice` in `@braindog/record`.
 */
export type HeldTwice = Answer<'heldTwice'>;

/**
 * `about`: what one thing on the record is, asked by its name. `is` is the one thing the name answers to (its kind,
 * name, what else it goes by, where it was seen, and its list and number), or `null`; `candidates` are the things that
 * answer to the name when more than one does, and none is picked. See `AboutAnswer` in `@braindog/record`.
 */
export type About = Answer<'about'>;

/**
 * `matched`: who the record matched on its own and still holds as one, newest first, 50 at most: who was folded into
 * whom by name, one sentence of evidence, when, and the batch an Undo takes. `null` on a record that keeps no people.
 */
export type Matched = Answer<'matched'>;

/**
 * `exceptions`: what stopped on the record, each as `{ kind, subject, said, since, row }`: what it is called, one
 * sentence about it, the day it stopped, and what to open (`null` where there is nothing to open).
 */
export type Exceptions = Answer<'exceptions'>;

/**
 * `stale`: what went stale where the caller stands, as `{ lines, count }`. Each line is `{ kind, said, count, clear }`:
 * one kind of thing in one sentence, how many, and the one call that clears it. `count` is the lines' counts added up,
 * the number `context` carries as `stale`. Nothing is counted that the caller may not read.
 */
export type Stale = Answer<'stale'>;

/**
 * `learnings`: what the record's agents learned and still stands where the caller is, as `{ rows, truncated, faded }`.
 * Each of `rows` is `{ spoken, lesson, because, kind, topic, where, confirmed_on, made }`: what it is called, the lesson
 * and the failure behind it, and `where` as `here` or `everywhere`. `truncated` says more stand than were answered, and
 * `faded` is how many were left out for being neither confirmed nor made in ninety days.
 */
export type Learnings = Answer<'learnings'>;

/**
 * `briefing`: what matters today as cards, in the record's order, seven at most. `h` is the card's handle, `line` its
 * one sentence, `row` the thing it opens as a record says one (`tasks#12`) or `null`, `cause` what several questions
 * share, and `by` whether the model wrote the line or the rules did. `at` is when it was written and `basis` what it
 * was written from. `said` is the sentence why the rules wrote the cards where a model would have: `null` when a
 * model's cards stand or nothing was kept, and absent from a host older than the field. Written out here because the
 * record's own type is not yet named from `@braindog/host/types`.
 */
export type BriefingCard = { h: string; line: string; row: string | null; cause: string | null; by: 'slash' | 'rule' };
export type Briefing = { cards: BriefingCard[]; at: string; basis: string; said?: string | null };

/** `packs`: one pack, on or off. `version` is `null` for a pack the seed owns by its bodies. See `PackState` in `@braindog/kernel`. */
export type PackState = { id: string; version: string | null; disabled_at: string | null; registers: string[] };

/** `disablePack` and `enablePack`: the packs that turned, and the declarations that went or came back. */
export type PackToggle = { id: string; state: 'enabled' | 'disabled'; changed: boolean; packs: string[]; declarations: string[]; said: string };

/** `33 §4` line 356, six keys. `app` is `null` on a host that was not told what it is running. */
export type Version = {
  /**
   * `MAX(event.rowid)` to an owner who reads every list, and to anybody else a hash of the id of the newest line they
   * are shown, or 0 when they are shown none (`versionFor` in `@braindog/record`).
   *
   * A MEMBER MAY ASK WHETHER IT CHANGED AND NOTHING ELSE. Before `83875130` she was handed the rowid, and the gap between
   * two of her polls counted the events she was not shown. The hash is not ordered: two of hers are equal or they are
   * not, and subtracting them, sorting by them or passing one on as a cursor means nothing, since `recentHistory`
   * refuses a whole-number cursor from anybody who is not handed rowids.
   */
  version: number;
  format: number;
  kernel: number;
  primitives: number;
  app: string | null;
  slash: boolean;
  /**
   * The lists that moved since the version asked about (`since`), `[]` when none did and `null` when the record cannot
   * say; absent when nothing was asked, or from an older host. The tab keeps what it read over the rest (`keptOr`).
   */
  moved?: string[] | null;
  /** The names of the other people on the page this tab said it is on (`at`), within the last half minute. Absent when none. */
  here?: string[];
};

/** `listDevices` and `revokeDevice`: one device grant, by its handle and never its poll id. See `DeviceRow` in `@braindog/kernel`. */
export type DeviceRow = {
  handle: string;
  status: 'pending' | 'approved' | 'active' | 'expired' | 'denied' | 'revoked';
  reach: 'login' | 'runner' | 'export' | 'import' | 'pack' | 'token' | 'vault' | 'shape';
  scope: string | null;
  label: string | null;
  ua: string | null;
  tries: number;
  expires: string;
  approved_by: string | null;
  approved_at: string | null;
  last_used: string | null;
  /** Present when the operator's cut-off (TOKENS_VALID_FROM) ended it, so the list can say why it stopped. */
  ended_by?: 'operator';
};

/** `deviceApprove`: the device that was let in, as the person approving it should see it. */
export type DeviceApproved = Pick<DeviceRow, 'handle' | 'reach' | 'scope' | 'label' | 'ua'>;

/** One page of rows, with the keyset cursor that reaches the next one. */
export type Page<T> = { rows: T[]; matched: number; cursor: string | null };

type ActionTotals = { runs: number; requests: number; bytes: number; failures: number };

/**
 * `actions`: one scheduled action. See `ActionRow` in `@braindog/kernel`.
 *
 * `key` IS THE KEY'S LABEL, never a value: the record builds the list from the keychain's index and reads nothing sealed.
 */
export type ActionRow = {
  ingest: string;
  channel: 'pull' | 'call' | 'poll';
  /** The project it runs for, or `null` for every project. */
  project: string | null;
  /** The row `project` names, found in the record: its id, its spoken id and its title, or `null` for every project. */
  project_row?: { id: string; spoken: string; title: string | null } | null;
  host: string | null;
  every: string;
  key: string | null;
  /** The list the action files what it fetched in, or `null` when it files nothing. Absent from an older record. */
  writes?: string | null;
  state: 'pending' | 'firing' | 'paused' | 'done';
  /** When it runs next, while it is pending or firing. */
  next: string | null;
  last: {
    at: string;
    outcome: 'ok' | 'changed' | 'unchanged' | 'paused' | 'failed' | 'refused' | 'dropped' | 'held';
    status: number | null;
    note: string;
  } | null;
  /** This calendar month so far, UTC. */
  month: ActionTotals & { held: number };
  /** This month by UTC day, oldest first. */
  days: ({ day: string } & ActionTotals)[];
};

/** `resumeAction`: the action that runs again now. */
export type ActionResumed = { ingest: string; kind: 'pull' | 'call' | 'poll' };
/** `actionRun`: the action whose next run is due now. */
export type ActionRan = { ingest: string; due_at: string };

/** `resumeScript`: the script that runs again now. */
export type ScriptResumed = { script: string };

/**
 * `scripts`: one installed script. See `ScriptRow` in `@braindog/record`.
 *
 * `refused.in_a_row` IS THE NUMBER THAT PAUSES IT: refused runs of the version now installed since its last good run or
 * resume, which pauses the script at `pauses_at`. A key is its keychain label, and no run's log is here: the log quotes what
 * the script read, and stays on the run's event for an owner who reads every list it touched.
 */
export type ScriptRow = {
  id: string;
  script: string;
  title: string;
  version: number;
  pack: string | null;
  /** `at` is the time of day its clock is pinned to (`HH:MM`, the record's zone); absent from a host a release behind. */
  runs: { every: string | null; at?: string | null; door: string | null; rule: boolean };
  reads: string[];
  writes: string[];
  egress: string[];
  keys: string[];
  status: 'on' | 'paused';
  /** When its clock next starts it. */
  next: string | null;
  last: { at: string; version: number | null; outcome: string; say: string } | null;
  refused: { in_a_row: number; pauses_at: number };
  /** This calendar month so far, UTC: the runs that ran the source, and how many were refused. */
  month: { runs: number; ok: number; refused: number };
};

/** Where one run of an automation stands. */
export type RunState = 'pending' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';

/**
 * `automations`: one automation, which is a rule. See `AutomationRow` in `@braindog/record`.
 *
 * `path` IS WHICH OF THE TWO WAYS IT RUNS, and nobody declares it: `inline` inside the write that started it, `run` after
 * it, step by step, one row per step. `register` is `null` for a clock, a button or an arrival, which have no row.
 */
export type AutomationRow = {
  id: string;
  rule: string;
  name: string;
  version: number;
  trigger: 'written' | 'arrival' | 'every' | 'metric' | 'decided' | 'manual';
  path: 'inline' | 'run';
  register: string | null;
  project: string | null;
  enabled: boolean;
  pack: string | null;
  /** When a clock next starts it. */
  next: string | null;
  /** Runs not finished: due, being taken, or parked on a wait. */
  open: number;
  last: { run: string; state: RunState; at: string; say: string | null } | null;
  /** When it last fired: its newest run's start, or for an inline rule the newest line it signed. */
  lastFired: string | null;
  /** This calendar month so far, UTC. An inline rule's firings are events and are not counted here. */
  month: { runs: number; done: number; failed: number; cancelled: number };
  /** How many times it has fired, counted up to 1,000 (`rule_stat`). Absent from a host older than the count. */
  fired?: number;
  /** When it last did, or `null` when `fired` is 0. */
  last_at?: string | null;
  /** One sentence on why it has not fired, when `fired` is 0, and `null` otherwise. */
  why_idle?: string | null;
  /** Times it ran or landed its work in the last seven days. Absent from a host older than the count. */
  week?: number;
  /** Times it ran or landed its work in this calendar month so far, UTC (`rule_month`). Absent from a host older than the count. */
  month_fired?: number;
  /** The key rules of one shape share (same trigger, list and kinds of action), so a page can draw them as one line. A handle, never shown. */
  family?: string | null;
};

/** One run, as `automations({ rule })` shows it: what started it, how it ended, and each step it took. */
export type AutomationRun = {
  id: string;
  version: number;
  state: RunState;
  trigger: string;
  actor: string;
  started_at: string;
  finished_at: string | null;
  /** The sentence it ended with: why it failed, or who cancelled it. */
  say: string | null;
  steps: { n: number; kind: string; state: 'done' | 'waiting' | 'failed' | 'skipped'; answer: string | null; at: string }[];
};

/** `automations({ rule })`: one automation with its body and its last ten runs, newest first. */
export type Automation = AutomationRow & {
  body: Record<string, unknown>;
  runs: AutomationRun[];
  /** The title of every id the body names that the caller can see, keyed by the id as the body holds it. Absent from an older host. */
  names?: Record<string, string>;
};

/** `automationRun`: the run it started, which the next drain takes. */
export type AutomationStarted = { run: string };

/** `cancelRun`: the run that stopped. */
export type RunCancelled = { run: string; state: 'cancelled' };

/**
 * One saved view, as `views` and `view` send it. See `ViewRow` in `@braindog/kernel`.
 *
 * `filter` IS `null` FOR NO FILTER, which is not the same as a filter that matches nothing, and
 * `order` is the same shape `list` takes, so a screen can hand one straight back to `list`.
 */
export type SavedView = {
  register: string;
  id: string;
  name: string;
  filter: unknown | null;
  search: string | null;
  order: { field: string; dir: 'asc' | 'desc' }[];
  columns: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** `retireView`: the view that is no longer on the list. */
export type ViewRetired = { register: string; id: string; retired: true };

/**
 * `backlinks`: one relation pointing at the row that was asked about.
 *
 * One group per FIELD and not per register, because two fields of one register can name the same row
 * and mean different things. `matched` is the whole count and `rows` is the page of it.
 */
export type BacklinkGroup = { register: string; field: string; matched: number; rows: unknown[] };

/** `backlinks`: the row asked about, what points at it, and where the next page starts. */
export type BacklinksAnswer = {
  to: { register: string; seq: number | null; id: string | null };
  from: BacklinkGroup[];
  cursor: string | null;
};

/** One of the five levels a member holds, on the record or on one register. */
export type Level = 'owner' | 'decide' | 'write' | 'append' | 'read';

/** `members` and `invite`: one person, what they hold on the record, and where it differs. See `Member` in `@braindog/kernel`. */
export type Member = {
  person_id: string;
  email: string | null;
  name: string | null;
  /** `null` is nothing on the record itself, which is not `read`. */
  level: Level | null;
  scoped: { register: string; level: Level }[];
  /** One `where` per list grant, narrowing what that register's rows the member reads (`CallContext.wheres` in `@braindog/kernel`). */
  wheres?: Record<string, unknown>;
  seen_at: string | null;
  suspended_at: string | null;
};

/** What a token may open beyond its scope, named when it is minted. `TOKEN_REACHES` in `@braindog/kernel`. */
export type TokenReach = 'inbox';

/** `listTokens` and `revokeToken`: one agent token, never the bearer. See `TokenRow` in `@braindog/kernel`. */
export type TokenRow = {
  id: string;
  person_id: string;
  scope: 'read' | 'propose' | 'write';
  /** Optional because a host older than token reaches answers without it, and that is a token that reaches nothing more. */
  reach?: TokenReach[];
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  last_surface: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  /** Present when the operator's cut-off (TOKENS_VALID_FROM) ended it, so the list can say why it stopped. */
  ended_by?: 'operator';
  /** Whose it is, by name or address, on `listTokens`'s rows only: a colleague may hold keys of their own. */
  person_name?: string | null;
  /** The app and machine that signed in for it (the sign-in stamp); absent on a host older than the stamp. */
  client?: { id: string; kind: 'cimd' | 'dcr' | 'device' | 'key'; host: string | null } | null;
  /** The build of the command behind the key, as its last call said it (`x-braindog-cli`). Absent on an older host. */
  last_build?: string | null;
  /** When the key last made a tool call through the door (`noteTool`). Absent on an older host. */
  last_tool_at?: string | null;
};

/** `invitations`: one invitation still waiting to be used. Never its link. */
export type Invitation = {
  id: string;
  email: string;
  level: Level | null;
  registers: Record<string, Level>;
  invited_by: string;
  created_at: string;
  expires_at: string;
  /** Whether its link has run out. */
  expired: boolean;
};

/** `invite` by address: the invitation, and the only copy of its link's token. Show the link once, and keep it nowhere. */
export type Invited = { invitation: Invitation; token: string };

/** `createToken`: the only copy of the bearer there will ever be. Show it once, and keep it nowhere. */
export type MintedToken = { id: string; bearer: string; scope: string; reach?: TokenReach[]; expires_at: string };

/** `createReportKey`: the only copy of a report key there will ever be. Show it once, and keep it nowhere. */
export type MintedReportKey = { id: string; bearer: string; register: string; expires_at: string };

/** `reportKeys`: one report key and what it is bound to. Never the key. */
export type ReportKeyRow = {
  id: string;
  register: string;
  fixed?: Record<string, unknown>;
  stamp?: string;
  name?: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

/** `report`: the rows a report key wrote, in the order it sent them. */
export type Reported = { register: string; written: { id: string; seq: number | null }[] };

/** `snapshot` and `snapshots`: one copy of the whole record, by the id `restore` takes. */
export type Snapshot = { id: string; at: string; bytes: number };

/** `restore`: the copy the record went back to, and the copy of what it was just before. */
export type Restored = { bookmark: string; at: string; kept: string | null };

/** `erase`: what the cascade touched, store by store. The subject is never in it. */
export type EraseReport = { id: string; at: string; subjects: number; rows: number; counts: Record<string, number>; keys: number };

/** One entry a capture keeps: the list it goes into, and its fields. */
export type CaptureRow = { register: string; fields: Record<string, unknown> };

/**
 * What `capture` answers: the batch that takes them all back, and each entry made, in the order sent. The record's own
 * `Captured` once it answers the method (`AnswerOr`), and this until then.
 */
export type Captured = { batch: string; made: { register: string; seq: number | null; title: string }[] };

/**
 * What `understand` answers, the shape the client names until the record's own type reaches it (`AnswerOr`): one slice
 * of the nightly walk. `kinds` counts what it looked at and linked, payments, runs and services; `writes` is the first
 * changes in names ("Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios") and `more` how many it did not name;
 * `questions` is what it would not do on its own. Not dry, `filed` is each question put on Decide, `undo` each change's
 * batch, to put back with `understand({ undo })`, and `dropped` each line about what was not asked.
 */
export type Understood = {
  dry: boolean;
  kinds: { kind: string; looked: number; linked: number; refused: number; organisations?: number }[];
  writes: string[];
  more: number;
  questions: string[];
  asks: Record<string, number>;
  done: boolean;
  undo?: string[];
  filed?: { id: string; question: string }[];
  dropped?: string[];
};

/**
 * What `setup` takes: an arrangement, as Decide's proposals carry one, and the three things the first run adds.
 * The record checks every part; this names them so a caller sees what there is to send.
 */
export type SetupBody = {
  /** The owner: met when the list that holds people is on, written to their account name when it is not. */
  me?: { name: string; email?: string; note?: string };
  /** What this person calls a list, by the list: `{ tasks: 'jobs' }`. */
  names?: Record<string, string>;
  /** On a record that already holds a person's lists, write only what is missing. Without it such a record refuses. */
  again?: boolean;
  [part: string]: unknown;
};
/**
 * What `setup` answers, which is the record's own `SetupAnswer` (`AnswerOr`): `done` is what landed, by kind (the
 * add-ons `installed`, the `settings`, `me`, the `rows`), `failed` each part that was not written, by the part's id
 * (`install:money`, `me`, `rows`) with a sentence a person can read, and `skipped` what had nowhere to go.
 */
export type SetupAnswer = AnswerOr<'setup', { done: Record<string, string[]>; failed: { part: string; label?: string; why: string }[]; skipped?: { part: string; label?: string; why: string }[] }>;

/**
 * A host that has no such call: an older one answers `ROUTE_UNKNOWN`, and one built over a record without the method
 * answers `NOT_IN_THIS_BUILD` at the call's own name. The record's own `NOT_IN_THIS_BUILD` (at `host`, at a field) is an
 * answer like any other. THROWN, where every other answer here is a value, so the one caller that falls back to
 * the old way for a release catches exactly this and nothing else. It goes when that fallback does.
 */
export const NO_SUCH_CALL = 'NO_SUCH_CALL';
export class NoSuchCall extends Error {
  override readonly name = NO_SUCH_CALL;
  readonly code = NO_SUCH_CALL;
  readonly call: string;
  readonly refusal: Refusal;
  constructor(call: string, refusal: Refusal) {
    super(`This BrainDog has no call named ${call}.`);
    this.call = call;
    this.refusal = refusal;
  }
}
/** Whether something caught is that. By name, so it holds across two copies of this package. */
export const isNoSuchCall = (e: unknown): e is NoSuchCall => e instanceof Error && e.name === NO_SUCH_CALL;

const WRITES = new Set(ROUTES.filter((r) => r.writes).map((r) => r.name));
const NAMES = new Set(ROUTES.map((r) => r.name));

/**
 * The one refusal the record does not produce, and `30 §6` now says so rather than leaving it to be
 * invented here.
 *
 * IT SAYS WHICH SIDE FAILED. A caller told "the record refused" for a DNS failure goes looking for a
 * problem with their arguments; there is not one, and every minute spent there is a minute the
 * network is still down. That argument was already written here and the code it produced —
 * `UNREACHABLE` — was in no registry, which meant the one refusal a client is guaranteed to meet
 * was the one refusal it could not look up.
 *
 * AND `30 §6` HAD RULED ON THE HALF OF THIS IT COULD SEE. The `Http` port's four error names —
 * `PrivateRange` · `TooLarge` · `Timeout` · `Network` — are a **vocabulary**, mapped onto exactly one
 * code, `PULL_ORIGIN_REFUSED`, for the record's OUTBOUND calls. The record's inbound half, which is
 * this file, had no such code, so it made one. The amendment gives it the same treatment the
 * outbound half already had: one code, named, for the whole vocabulary of ways a socket fails.
 *
 * THE REASON IS KEPT IN `detail`, NEVER IN `fix`. `fix` is the one sentence a person reads, and a socket's
 * message ("fetch failed", "502 with a body that is not JSON") is not one; a screen folds `detail` under
 * Details, as the design system asks, so the technical reason is there for whoever needs it and is never content.
 */
const unreachable = (why: string): Refusal => ({
  code: 'UNREACHABLE',
  fix: answeredBadly(why) ? "BrainDog's answer could not be read." : 'BrainDog could not be reached.',
  detail: why,
});

/**
 * WHETHER THE HOST WAS REACHED AND ITS ANSWER WAS THE TROUBLE. Every such reason starts with the status that came back
 * (`500 with a body that is not JSON`); a socket's own message never does. A 500 said "BrainDog could not be reached"
 * about a host that had answered (audit f, AF19). A gateway's 502, 503 and 504 are the hop in front saying the host
 * behind it did not answer, so they keep the old sentence.
 */
const answeredBadly = (why: string): boolean => /^\d{3}\b/u.test(why) && !/^50[234]\b/u.test(why);

/**
 * A RECORD TOO BUSY TO TAKE A REQUEST (503, its object's queue full) IS ASKED AGAIN, a read only, twice at most, after a
 * jittered wait that doubles, so a burst of tabs does not come back in step (23 Oct: 80 crashes in two seconds).
 */
export const BUSY_TRIES = 2;
const busyWait = (attempt: number): number => 400 * 2 ** attempt * (0.5 + Math.random());
let BUSY_WAIT = busyWait;
/** How long a busy read waits before its next try, by try; `null` puts the jittered wait back. For tests. */
export function busyWaits(wait: ((attempt: number) => number) | null): void {
  BUSY_WAIT = wait ?? busyWait;
}
const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
/** Whether an answer is a record too busy to take it (the Worker's 503 `RECORD_UNAVAILABLE` with `retry_after`). */
export const busy = (out: Result<unknown>): boolean =>
  !out.ok && 'refusal' in out && out.refusal.code === 'RECORD_UNAVAILABLE' && typeof out.refusal.retry_after === 'number';

/**
 * Whether a parsed body is an answer at all, in one place for both doors.
 *
 * THE SHAPE IS CHECKED, not assumed. A proxy that returns its own error page with a 200 would
 * otherwise arrive as a successful call whose value is an HTML string, and the first thing that
 * reads a field off it fails somewhere unrelated.
 *
 * THAT ARGUMENT HELD FOR AN HTML PAGE AND FAILED FOR A JSON ONE, because the check under it asked
 * whether `ok` was present and never what it was. Measured on 2026-09-20 by handing this client
 * canned bodies through its injected `fetch`: `502 {"ok":1,"error":"upstream"}` came back as
 * `{ ok: 1 }`, and every caller in this repository writes `if (out.ok)`, so a gateway error read as
 * a success whose `value` was `undefined`. `200 {"ok":true}` did the same. So `ok` has to BE a
 * boolean, and a success has to carry the key it promises.
 *
 * `null` IS A VALUE AND ABSENT IS NOT, which is why this is `Object.hasOwn` and not a truth test.
 * `revokeGrant` answers `Result<null>`, and refusing that would refuse the record's own answer.
 *
 * AND IT IS ONE FUNCTION BECAUSE THERE ARE TWO DOORS. `call` and `hostDoor` (then `keyDoor`) had these checks
 * written out twice, so the first three were repaired twice or they were not repaired at all.
 */
const answered = <T>(status: number, body: unknown): Result<T> => {
  if (body === null || typeof body !== 'object' || !('ok' in body) || typeof (body as { ok: unknown }).ok !== 'boolean')
    return { ok: false, refusal: unreachable(`${status} with an answer this client does not recognise`) };

  /* AND A NOT-OK ANSWER HAS TO BE ONE OF THE TWO. There are three arms and only two of them are
     failures; an `{ ok: false }` carrying neither a refusal nor a conflict would reach a caller
     that reads `.refusal.fix` off it and fail somewhere unrelated, with a 422 in the log and a
     `TypeError` on the screen. */
  if (body.ok === false && !('refusal' in body) && !('conflict' in body))
    return { ok: false, refusal: unreachable(`${status} with a failure carrying neither a refusal nor a conflict`) };

  if (body.ok === true && !Object.hasOwn(body, 'value'))
    return { ok: false, refusal: unreachable(`${status} with a success carrying no value`) };

  return body as Result<T>;
};

/** `putKey`: the row the key is on, and which version of its grant this made. Never anything sealed. */
export type KeyPut = { credential: string; label: string; version: number; rotated: boolean };

/** `openKey`: one key, read back once. The answer is `no-store`, and reading it is counted as a `grant.read`. */
export type KeyOpened = { credential: string; label: string; value: string };

/**
 * `slashRead`'s answer, WRITTEN OUT HERE BECAUSE THIS PACKAGE MAY NOT IMPORT `@braindog/slash`. It is `Reading` in
 * `packages/slash/src/types.ts`, key for key, and NOT the `46 §5.4` step 8 shape, which carries a `version` the built engine
 * never sends: a client written to the specification would read `undefined` there. `predicate` is `34 §1`'s `where` tree,
 * or `null` when the model's draft did not fit and `q` is the keyword search Slash ran instead.
 */
export type SlashWhere =
  | { all: SlashWhere[] }
  | { any: SlashWhere[] }
  | { none: SlashWhere[] }
  | ({ field: string; via?: string } & Record<string, unknown>)
  | { matches: string };

/** One line of the fold, *What Slash read*: a register, how many rows, and the predicate as JSON or `all`. Never a value. */
export type SlashTrace = { register: string; rows: number; predicate: string };

/** One row Slash found, with the spoken id `tasks#3` a link is built from. */
export type SlashRow = { id: string; register: string; seq: number; spoken: string; summary: string; fields: Record<string, unknown> };

export type Reading = { ask_id: string; predicate: SlashWhere | null; q: string | null; read: SlashTrace[]; rows: SlashRow[] };

/**
 * `slashStatus`'s answer, `Status` in `packages/slash/src/types.ts` key for key, and written by hand for `Reading`'s reason.
 *
 * `source` IS THE OWNER'S ONE CHOICE, "Included" or "Your own key", and `tier` is the name it is stored under (`a` and `b`),
 * readable for one release while every reader moves to `source`. `provider` is said only
 * on his own key. `asks.capped` is `false` there: his asks are listed and not held to a cap, so a page draws the count
 * without "of". OPTIONAL HERE for that same release, because a host a release behind answers
 * without them, and a reader treats a missing `source` as what `tier` says.
 */
export type SlashTier = 'a' | 'b' | 'byo';
export type SlashSource = 'included' | 'key';
export type SlashProvider = 'anthropic' | 'openai';
export type SlashStatus = {
  source?: SlashSource;
  tier: SlashTier;
  provider?: SlashProvider | null;
  model: string;
  asks: { used: number; cap: number; resets: string; capped?: boolean };
  /**
   * The background allowance (digest prose, pattern drafts, embeddings), exact for a busy month: `packages/host/src/
   * slash.ts`'s status door reads it off `backgroundMeter(...).spent(monthStart)` and its own `cap`, in place of the
   * `60` the web used to carry as its own copy of `BACKGROUND_JOBS_MONTH`. Absent on a host built before this field.
   */
  background?: { used: number; cap: number };
  /**
   * Deep, on the owner's own Anthropic key: whether a key is set for it, its model and the one "Think harder" asks, and
   * this month's spend against its cap in cents. Absent on a host built before Deep.
   */
  deep?: { key: boolean; model: string; harder: string; cap_cents: number; spent_cents: number };
};

/**
 * `slashSettings`'s answer, `Setup` in the same file: the stored settings with the source, the provider and the address
 * his key is sent to. `model` is `null` on the included model, which has none of its own; `base_url` is `null` where he
 * named none and his provider's own address is used; `grant_id` names the keychain key he picked, never the key.
 */
export type SlashSettings = {
  source?: SlashSource;
  tier: SlashTier;
  provider?: SlashProvider | null;
  base_url?: string | null;
  model: string | null;
  grant_id: string | null;
  ask_cap: number;
  updated_at: string;
  /** Deep's key, picked from the keychain by its grant (`null`: his own key for Slash, where that is Anthropic's), and its monthly cap in cents. */
  deep?: { grant_id: string | null; cap_cents: number };
};

/**
 * What a settings save may carry. `source: 'key'` wants a `provider`, a `model` and a `grant_id`;
 * `base_url` is `https:` on the public internet, and left out it is the provider's own. `tier` is kept for one release.
 * The door refuses any other key with `FIELD_UNKNOWN`.
 */
export type SlashSettingsPatch = Partial<{
  source: SlashSource;
  provider: SlashProvider;
  base_url: string | null;
  model: string | null;
  grant_id: string | null;
  ask_cap: number;
  tier: SlashTier;
  deep_grant_id: string | null;
  deep_cap_cents: number;
}>;

/**
 * One ask as `slashAsks` lists it, `Asked` in the same file, newest first. `question` is what was typed, or `null` where
 * an erasure took it; `filed` is the `SG<n>` a proposal put on Decide. `code` is the refusal's, `null` for an answer.
 * `purpose` is what the ask was for (`ask`, `automation`, `plan`, `headline`, `understand`, `look` and the host's own
 * names), absent from a host built before it said so.
 */
export type SlashAsked = {
  id: string;
  ts: string;
  kind: string;
  purpose?: string;
  status: string;
  code: string | null;
  question: string | null;
  model: string;
  filed: string | null;
};

/**
 * One thing Slash did in a conversation, or holds for a yes (`ChatAction` in `packages/slash/src/types.ts`, restated). A
 * `done` has happened and `undo.batch` is what `undo({ batch })` takes back; an `ask` waits on `slashAct`. `state` is
 * said on a thread read back, once an `ask` is answered.
 */
export type SlashChatAction = {
  id: string;
  kind: 'done' | 'ask';
  title: string;
  detail?: string;
  undo?: { batch: string };
  href?: string;
  state?: 'open' | 'accepted' | 'declined';
};

/** One event of a conversation's turn, as `POST /api/slash/chat` streams them, one a line. `done` always comes last. */
export type SlashChatEvent =
  | { type: 'thread'; id: string }
  | { type: 'step'; text: string }
  | { type: 'delta'; text: string; figures?: { ref: string; label: string }[] }
  | ({ type: 'action' } & Omit<SlashChatAction, 'state'>)
  | { type: 'navigate'; href: string; label: string }
  | { type: 'error'; text: string }
  /* Which brain answers: `quick` the included model, `deep` the owner's Anthropic key, with the model it asks. */
  | { type: 'brain'; depth: 'quick' | 'deep'; model?: string }
  /* Deep was wanted and cannot answer here: offer the turn to Claude on the person's Mac. */
  | { type: 'route'; to: 'mac' }
  | { type: 'done'; spent: { asks: number; left: number | null }; figures?: { ref: string; label: string }[] };

/**
 * What a person sends: the words, the conversation they continue, and where they are. `mode` is how deep (absent is
 * `quick`); `attach` names rows sent with the words, up to eight (`tasks#12`); `rethink` with `thread` asks that
 * conversation's last question again on the model that thinks harder, and `message` may then be empty.
 */
export type SlashChatMode = 'quick' | 'deep' | 'auto';
export type SlashChatInput = {
  thread?: string;
  message: string;
  page?: { path: string; title?: string; row?: string };
  mode?: SlashChatMode;
  attach?: string[];
  rethink?: boolean;
};

/** A held action answered (`POST /api/slash/act`). */
export type SlashActed = { ok: true; receipt?: string; undo?: { batch: string } };

/** One conversation read back (`GET /api/slash/thread/<id>`), its turns oldest first. */
export type SlashThread = { id: string; turns: { role: 'you' | 'slash'; text: string; actions: SlashChatAction[] }[] };

/** A person's conversations, newest first, each titled by its first words (`GET /api/slash/threads`). */
export type SlashThreads = { threads: { id: string; title: string; at: string }[] };

/** What matters now, up to three short lines for an empty palette (`GET /api/slash/now`). No model is asked. */
export type SlashNow = { lines: { text: string; href?: string }[] };

/** `slashAnswer`'s answer, `Proposal` in the same file. `filed` is the `SG<n>` it put on Decide, or `null` for a `query`. */
export type SlashProposal = {
  text: string;
  citations: string[];
  verbs: ('decide' | 'defer' | 'dismiss' | 'edit' | 'save' | 'open')[];
  body_kind: 'query' | 'options' | 'pattern' | 'rowset' | 'change';
  body: Record<string, unknown>;
  model: string;
  filed: string | null;
  read: SlashTrace[];
};

/**
 * One mark the agent door leaves about a session: `hello`, `listed` (with `n`, the tools sent), `called`
 * (with `n`, the calls since the last mark), `hook` (with `ms`, how long the start hook took), `resource` (with `ms`),
 * `card` (with `n`, its words), or `internal`. `build` is the caller's own build, `client` the app's name and version.
 * The record keeps one row for each run and kind and adds to `n`; it refuses any other key.
 */
export type HeardKind = 'hello' | 'listed' | 'called' | 'hook' | 'resource' | 'card' | 'internal';
export type Heard = { kind: HeardKind; n?: number | undefined; ms?: number | undefined; build?: string | undefined; client?: string | undefined };

/**
 * `engineHealth`'s answer, `packages/slash/src/health.ts` read through the record: whether the engine's model
 * answers, from its own ledger, and the one sentence a person reads about it.
 *
 * `last_ok` is when a model last answered, `since` when the failing began, both instants or `null`. `said.whose` is
 * whose the fault is to fix: `ours` (the operator's), `yours` (the owner's own key), or `null` when nothing is wrong.
 * WRITTEN HERE UNTIL THE RECORD NAMES IT, as `AnswerOr` reads it: the record's own declaration wins once it exists.
 */
export type EngineState = 'answering' | 'not_answering' | 'never_asked' | 'off' | 'key_closed';
/** `engineProbe`'s answer: each model Slash would use, whether it answered and how fast, or why not. */
export type EngineProbed = { candidates: { model: string; served: boolean; strict: boolean; ms: number; why?: string }[]; said: string; next: string };
export type EngineHealth = {
  health: { state: EngineState; last_ok: string | null; since: string | null; answeredBy?: { model: string; at: string }; lastWords?: string; doubleShare?: number; doubleOf?: { twice: number; asks: number }; spent?: { person: number; background: number } };
  said: { text: string; whose: 'ours' | 'yours' | null };
};

/**
 * `engineReadings`'s answer, `packages/record/src/engine-readings.ts` read through the record: what the
 * model was asked, purpose by purpose, and what the record still does not understand.
 *
 * `asked` counts the asks that reached a model in the last day, week and month. `answered`, `kept` and `refused` are
 * the last day's: the model spoke, the engine used the answer, the check refused it or the month was spent. `owed` is
 * what still waits, `oldest_owed` when the oldest of it was written, `last_error` the newest ask that got no readable
 * answer. `unattached` is the mentions that point at nothing in the record, `open_by_cause` the open questions by cause.
 * WRITTEN HERE UNTIL THE RECORD NAMES IT, as `AnswerOr` reads it: the record's own declaration wins once it exists.
 */
export type AskReading = {
  purpose: string;
  asked: { day: number; week: number; month: number };
  answered: number;
  kept: number;
  refused: number;
  owed: number;
  oldest_owed: string | null;
  last_error: { at: string; code: string } | null;
};
/** How Slash's questions of one kind ended over the last 30 days: `share` is accepted unchanged over answered, `null` with none answered. */
export type SlashReading = { kind: string; offered: number; accepted: number; changed: number; declined: number; undone: number; lapsed: number; share: number | null };
export type EngineReadings = {
  asks: AskReading[];
  understanding: { unattached: number; open_by_cause: Record<string, number> };
  braked: { on: boolean; share: number; of: number } | null;
  slash: SlashReading[];
  folds: { made: number; undone: number };
  outside: number;
};

/**
 * `trust`'s answer: each connected agent by name, and for each kind of change the rung it stands on (Ask, Do
 * and tell, Do quietly), since when, whether it was lifted there, and when and why it was put back to Ask. See
 * `Standing` in `packages/record/src/ladder.ts`.
 */
export type TrustStanding = {
  agents: {
    agent: string;
    connected: string | null;
    asking: { from: string; at: string } | null;
    kinds: { kind: string; rung: 'ask' | 'tell' | 'quiet'; since: string; lifted: boolean; dropped: { at: string; why: string | null } | null }[];
    /** The share of its questions the owner took as filed over `days`, overall and by kind of change; absent with none answered. */
    kept?: KeptShare & { days: number; kinds: (KeptShare & { kind: string })[] };
  }[];
};

/** Of an agent's answered questions, how many the owner accepted unchanged, and the share, `null` with none answered. */
export type KeptShare = { accepted: number; answered: number; share: number | null };

/**
 * `slashReads`'s answer: whether Slash reads in the background. On unless the owner turned it off. See
 * `SlashReads` in `packages/record/src/methods/engine.ts`.
 */
export type SlashReads = { on: boolean };

/**
 * `doorHealth`'s answer, the owner's: every connection that can act on the record and the agent door's seven
 * signs. `id` is a handle, never shown alone: a screen names a connection by `app` and `where`. Each sign is a count, 0
 * green, or `null` where there is nothing yet to judge. See `DoorHealth` in `packages/record/src/methods/door.ts`.
 */
export type DoorConnection = {
  id: string;
  kind: 'device' | 'cimd' | 'dcr' | 'key' | 'runner';
  app: string | null;
  app_version: string | null;
  where: string | null;
  verified: boolean | null;
  scope: string | null;
  reach: string[];
  made_at: string;
  ends_at: string | null;
  days_left: number | null;
  last_call_at: string | null;
  last_door: string | null;
  last_tool_at: string | null;
  cli_build: string | null;
  /** Whole days its build is older than `min_cli`; `null` with no build, a checkout's, or no `min_cli`. */
  behind: number | null;
  runs_7d: number;
};
export type DoorHealth = {
  host_build: string | null;
  min_cli: string | null;
  connections: DoorConnection[];
  signs: {
    delivered: number | null;
    behind: number | null;
    ending: number;
    silent: number;
    door_used: number | null;
    runners_listening: number | null;
    jobs_lost_7d: number;
  };
};

/**
 * Call one method.
 *
 * The verb follows the route table rather than the caller's guess, so a write is a POST because the
 * table says it changes something — the same rule the server enforces, read from the same list.
 */
/** How long a list's schema is kept at one version: a host's own install can move it without a version a tab saw. */
export const SCHEMA_KEPT_MS = 300_000;

/** What a kept schema was kept at: the record's version, or the app's declarations token (`followDeclarations`). */
type Stamp = number | string | null;
type SchemaStore = {
  version: number | null;
  lists: Map<string, { version: Stamp; at: number; answer: Promise<Result<unknown>> }>;
  /** The lists asked in this turn and not sent yet, each with whoever waits on it (`batchSchemas`). */
  wave?: Map<string, ((r: Result<unknown>) => void)[]> | undefined;
  /** The host has no `schemas`: a host older than it, asked `schema` once a list from then on. */
  single?: boolean;
};

/**
 * SCHEMAS ASKED IN ONE TURN GO AS ONE READ, for an app that turns it on (`batchSchemas`). Today learns every list's
 * declaration before it asks its page, and a desk and a page reader ask theirs beside it: twenty-five `schema` asks on
 * the seed, which a browser sends six at a time, five round trips before the page could be asked. Each
 * `schema` asked while one is waiting to go joins it, and the wave goes as `schemas` (`packages/record/src/methods/
 * schemas.ts`), which holds each list to the reader exactly as `schema` holds it.
 *
 * EACH ASKER IS ANSWERED AS `schema` WOULD HAVE ANSWERED IT: the list's declaration with the installed kinds beside it,
 * or the refusal `schema` gives. A wave of one is sent as `schema`, as before. A host older than `schemas` is asked once
 * a list from then on; a whole wave refused is asked once a list too, so each list hears its own refusal; and a host
 * nobody reached is that answer for every list in the wave.
 *
 * OFF UNLESS AN APP TURNS IT ON. A command, a test and an agent's client ask once a list, as they always have.
 */
let BATCHING = false;
/** Send the schemas asked in one turn as one read from now on, or once a list again (`false`). */
export function batchSchemas(on: boolean): void {
  BATCHING = on;
}

/**
 * FIGURES ASKED TOGETHER GO AS ONE READ (`metrics`), for an app that turns it on (`batchMetrics`): the sidebar asked
 * `metric` once a project in play and a project page four more, up to seventeen requests queued on one record beside a
 * page load (23 Oct, the overload). Each `metric` asked within `METRIC_WAVE_MS` of the first joins one wave, by host
 * and token across every client of the tab, and each asker is answered as `metric` would have answered it. A wave of
 * one is `metric`; a host without `metrics` is asked once a figure from then on.
 */
let METRIC_BATCHING = false;
/** Send the figures asked together as one read from now on, or once a figure again (`false`). */
export function batchMetrics(on: boolean): void {
  METRIC_BATCHING = on;
}
/**
 * How long a wave of figures waits for more to join it: a page's own reads land within it, a click never does. A revisit
 * never pays it: a figure kept at this version is answered from the kept copy before any wave (`call`, `wave`). At 8 ms
 * the sidebar's figures and a project page's, asked a moment apart, went as two `metrics`.
 */
export const METRIC_WAVE_MS = 40;
/** The most figures one `metrics` names, as the record takes them (`METRICS_MOST`). */
const METRICS_WAVE_MOST = 50;
type MetricWave = { asked: Map<string, ((r: Result<unknown>) => void)[]>; send: (name: string, args: Record<string, unknown>) => Promise<Result<unknown>> };
let METRIC_WAVES = new Map<string, MetricWave>();
/** The hosts that answered `metrics` as a method they do not have. */
let NO_METRICS = new Set<string>();
/**
 * EVERY LIST'S DECLARATION, ASKED ONCE BESIDE `boot` (`schemas`), by host and token: a first screen's lists are
 * then learnt from it as they are asked, and none waits for `boot` to say which lists there are and then for their
 * declarations in turn. Each kept store takes it once, at the version it stands at then, as long as this tab has sent
 * no write since it was asked, no grant has moved and it is younger than `SCHEMA_KEPT_MS`; a list it does not hold is
 * asked as before. Another reader (`readAs`) drops it.
 */
type Every = { wrote: number; regrants: number; at: number; done: Promise<{ lists: Record<string, unknown>; blocks: Record<string, unknown> } | null>; taken: WeakMap<SchemaStore, Promise<void>> };
let EVERY = new Map<string, Every>();

/** The most lists one `schemas` names, as the record takes them (`SCHEMAS_MOST`). */
const SCHEMAS_WAVE_MOST = 100;
/** Refusals that say the host has no `schemas` at all. */
const NO_SCHEMAS = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']);
/** Refusals that say nothing about the lists asked, only about the host now: never asked again once a list. */
const TRANSIENT = new Set(['UNREACHABLE', 'INTERNAL', 'RECORD_UNAVAILABLE', 'RATE_LIMITED']);

/**
 * READS ASKED TOGETHER ARE SENT TOGETHER (`reads`, scope 2026-10-24 A12), for an app that turns it on (`batchReads`).
 *
 * WHY. Today asked about thirty reads of his record as it opened, and each was its own request: through the doors in
 * front of the record (the session, the Directory, the record's own three checks of who is asking), then the record's
 * one thread, behind every other. The record answered most in 2 to 40 ms and the front saw 100 to 500. A read asked
 * while others are going out now waits a moment for them (`READ_WAVE_QUIET_MS`, never more than `READ_WAVE_MOST_MS`),
 * and they go as one `reads`; each is answered as its own route answers it, with its status, so nothing reads a
 * difference. One read by itself goes as it always did.
 *
 * WHAT NEVER WAITS: the version poll (`ALONE`), which must not sit behind a screen's reads, `boot`, and a write. A read
 * kept at this version is answered from the kept copy before it gets here (`keptOr`), so a revisit pays nothing.
 *
 * WHEN `reads` FAILS: a host without it is asked one read a call from then on; one this browser could not reach is asked
 * one read a call now, which is what lets the service worker answer each from its copy offline; any other refusal (a
 * record still busy after its tries, a sign-in gone) is every read's answer, and is never fanned out into the requests
 * the batch was there to save (23 Oct, a failed wave of 28 became 28 more requests into the record that had failed it).
 */
let READ_BATCHING = false;
/** Send the reads a screen asks at once as one request from now on, or each by itself again. */
export function batchReads(on: boolean): void {
  READ_BATCHING = on;
}
/** How long a wave waits with nothing new joining it before it goes. */
export const READ_WAVE_QUIET_MS = 8;
/** The longest a wave waits from its first read, however many keep joining. */
export const READ_WAVE_MOST_MS = 30;
/** The most reads one `reads` carries, as the record takes them (`READS_MOST`). */
const READS_WAVE_MOST = 32;
/** The reads that always go by themselves. */
const ALONE = new Set(['version', 'boot', 'reads']);
type ReadAsk = { name: string; url: URL; writes: boolean; sent: string | undefined; args: Record<string, unknown>; ahead: boolean; done: (r: Result<unknown>) => void };
type ReadWave = { asks: ReadAsk[]; quiet: ReturnType<typeof setTimeout> | undefined; most: ReturnType<typeof setTimeout> | undefined; hold: AbortController };
/** The wave filling now, by the fetch it will go through and then the host and token. */
let READ_WAVES = new WeakMap<object, Map<string, ReadWave>>();
/** The hosts that answered `reads` as a method they do not have. */
let NO_READS = new Set<string>();

/**
 * The app's word on the record's declarations, or `null` where it has none to give.
 *
 * A KEPT SCHEMA WENT STALE ON EVERY MOVE OF THE RECORD'S VERSION, and a lived-in record moves it with every row an agent
 * writes, so each move asked every list's schema again though no declaration had changed. An app that follows the
 * record's change log (the web's local copy) knows when one did: it hands a token here that moves only when the log
 * holds a line it cannot place on a row, a declaration among them. While it answers a token, a schema kept under that
 * token stays kept across version moves; `null` (not following, not caught up) keeps a schema by version, as before.
 * The token is asked before every `schema`, so the app may hold it until its follow has caught up with the version.
 */
let FOLLOW: (() => Promise<string | null>) | null = null;

/** Keep schemas by the app's declarations token from now on, or by the record's version again (`null`). */
export function followDeclarations(token: (() => Promise<string | null>) | null): void {
  FOLLOW = token;
}

/**
 * The writes that can never change a declaration or a row's name: the reader's own mark, their own settings and a note.
 * Every other write drops the kept schemas, since it may have declared something; these left Today's leave (`markRead`)
 * asking every list's schema again on the next screen.
 */
const POST_READS = new Set(ROUTES.filter((r) => (r as { postRead?: true }).postRead === true).map((r) => r.name));
/* AND A READ SENT AS A WRITE (`postRead`): Today's body is `previewPage`, and every read of it dropped every schema. */
const UNDECLARING = new Set(['markRead', 'setPref', 'log', ...POST_READS]);

/** How many writes this tab has sent that may have changed what a read answers (`UNDECLARING` aside). */
let WROTE = 0;
/** A number that moves whenever this tab sends a write that may change a row, a name or a declaration. */
export const wrote = (): number => WROTE;

/**
 * The same read, out at once, is sent once (`call`): by the fetch it goes through, then its address and token. A screen
 * and a tile asking `get(obligations, 3)` together, or two readers walking one list, shared nothing.
 */
let FLYING = new WeakMap<object, Map<string, Promise<Result<unknown>>>>();

/**
 * Every client's kept schemas, by the fetch it sends through, then its host and its token.
 *
 * ONE STORE FOR THE TAB AND NOT ONE A CLIENT. The app builds a client wherever it reads (196 places), so a store per
 * client kept nothing: nine screens asked `schema` 48 times. The fetch is in the key so a
 * test's stub never shares with another's, and the token so two people on one host never do.
 */
let SCHEMAS = new WeakMap<object, Map<string, SchemaStore>>();

/** Drop every kept schema, as the app's `forget` does on a record switch and a sign-out, so the next ask goes out. */
export function forgetSchemas(): void {
  READ_WAVES = new WeakMap();
  NO_READS = new Set();
  METRIC_WAVES = new Map();
  NO_METRICS = new Set();
  SCHEMAS = new WeakMap();
  EVERY = new Map();
  FLYING = new WeakMap();
  READS = new Map();
  OUT = new Map();
  HEARD = new Map();
  FIRST = new Map();
  GRANTS = new Map();
}

/**
 * READS KEPT BY THE RECORD'S VERSION, for an app that follows it (`keepReads`): a read asked again while the version
 * this tab last heard has not moved, and this tab has sent no write since, is answered from what it was answered, at
 * once, and asks nothing. Going back to a page, or opening it again, read every block of it again at the same version:
 * twenty requests for a project page that had not changed.
 *
 * OFF UNLESS AN APP TURNS IT ON, and the web turns it on only while its poll follows the record's version, since the
 * poll is what tells a kept answer from a stale one. A command, a test and an agent's client ask every time, as before.
 *
 * WHAT IS KEPT is the reads whose answer is the record's at a version: rows, a page, a figure, the tiles that read the
 * record. NEVER the version itself, `boot` (kept by the app), who is here now (`presence`) or what is new since the
 * reader's mark, which move without the version. A refusal is never kept.
 *
 * WHAT DROPS ONE: the version moving, any write this tab sends (counted once it has answered, so a read sent while it
 * was out is never kept as though it saw it), the reader's own mark for the answers that carry it (a page's feed says
 * what is unread), `KEPT_READ_MS`, and midnight, since "late" and "today" move with the clock and not the version.
 * Each caller is handed its own copy, as a shared flight is.
 */
export const KEPT_READ_MS = 300_000;
/** The reads that may be kept, by name. */
const KEEPS = new Set([
  'get', 'list', 'countBy', 'history', 'backlinks', 'page', 'pages', 'previewPage', 'metric', 'metrics', 'figures', 'governance', 'packs', 'actions',
  'automations', 'examples', 'briefing', 'namedTwice', 'handled', 'textFaults', 'learned', 'matched', 'skillsBehind', 'huesWanted',
  'learningsTwice', 'stale', 'heldTwice', 'instructionList', 'today',
]);
/** The kept reads whose answer may carry the reader's own mark: what a feed draws as unread. Today's carries its body's. */
const MARKED = new Set(['page', 'pages', 'previewPage', 'today']);

/**
 * Whether a page's answer carries the reader's mark: a feed's `seen`, or the changes a block marks unseen from it. Where
 * the answer is not a page's blocks it is taken to carry it, so a mark moved always asks it again.
 */
function carriesMark(value: unknown): boolean {
  const blocks = (value as { blocks?: unknown } | null)?.blocks;
  if (!Array.isArray(blocks)) return true;
  return blocks.some((b) => typeof b !== 'object' || b === null || 'seen' in b || Array.isArray((b as { changes?: unknown }).changes));
}
/** The most reads the tab keeps; past it the oldest goes. */
const KEPT_READS_MOST = 400;
let KEEPING = false;
/** The one key the tab's kept schemas are under while reads are kept. */
const TAB = {};
/**
 * A TAB BEING LEFT BEGINS NO MORE CALLS. WebKit refuses every call begun once a navigation starts and prints each as an
 * uncaught error, whoever catches it, so a call asked after `beforeunload` is answered unreachable without going out. A
 * call already out is called off, which is a handled AbortError where a cancelled load is an uncaught one. A leave
 * that was cancelled is over after a moment, and a page restored from the back-forward cache is not leaving.
 */
let LEAVING = false;
/** Every call out now that the tab's leaving may stop (`LEAVING`); a call taken off it as it answers. */
const OUTGOING = new Set<AbortController>();
/**
 * THE CALLS OUT NOW THAT WERE ASKED AHEAD (`ClientOptions.ahead`), each also in `OUTGOING`: a request already on the wire
 * for a part that has not drawn yet. Only a request sent is in it, never a wave still filling, since a read asked while
 * one fills joins it and the asked-ahead answer would wait for that read too.
 */
const AHEAD = new Set<AbortController>();
/** Who is told when the count of calls out changes: the app's quiet mark and its rest (`onCallsOut`). */
const COUNTERS = new Set<(out: number, ahead: number) => void>();
const tell = (): void => {
  for (const fn of COUNTERS) fn(OUTGOING.size, AHEAD.size);
};
/**
 * How many calls are out now, and how many of those were asked ahead, told to `fn` at once and at every change; the
 * returned function stops it. `out` counts every call, the asked-ahead ones too.
 */
export function onCallsOut(fn: (out: number, ahead: number) => void): () => void {
  COUNTERS.add(fn);
  fn(OUTGOING.size, AHEAD.size);
  return () => void COUNTERS.delete(fn);
}
const WINDOW = globalThis as { document?: unknown; addEventListener?: (type: string, fn: () => void) => void };
if (typeof WINDOW.addEventListener === 'function' && WINDOW.document !== undefined) {
  /* `beforeunload` is not sent to a page nobody has touched, and `pagehide` is, so both stop it. */
  const leave = () => {
    LEAVING = true;
    for (const out of OUTGOING) out.abort();
    OUTGOING.clear();
    AHEAD.clear();
    tell();
    setTimeout(() => (LEAVING = false), 3000);
  };
  WINDOW.addEventListener('beforeunload', leave);
  WINDOW.addEventListener('pagehide', leave);
  WINDOW.addEventListener('pageshow', () => (LEAVING = false));
}
/**
 * The record's version as this tab last heard it, by host and token, whichever client asked: the poll asks through one
 * client and the screens read through many, some with a fetch of their own, so the version a kept read is checked
 * against is the tab's and not one client's.
 */
let HEARD = new Map<string, number>();
/**
 * THE FIRST VERSION HEARD, and when it was asked. A read asked before the tab had heard any version is kept at none,
 * and it is still the record's at that first version when it went out after that version was asked: the poll's first
 * answer is the baseline every screen is drawn against (`live.ts`), and a read sent before it was asked is not kept on.
 */
let FIRST = new Map<string, { asked: number; version: number }>();
/**
 * THE ACCESS EPOCH THIS TAB LAST HEARD, by host and token, as `version` answers it for somebody a share let in: what a
 * person holds moved (a share narrowed, stopped or widened, a group left) without the record's version having to, so
 * every read kept before it goes at once, before the app has booted again onto the new grant.
 */
let GRANTS = new Map<string, number | null>();
/** How many times a grant or the reader moved: a read out across a move is never kept, since it was asked before it. */
let REGRANTS = 0;
/**
 * WHO IS READING, as the app names them (`readAs`): the person, what their role and shares reach, and who the record is
 * seen as. Every kept read, every read out now and every kept schema is keyed by it, so an answer read for one reader is
 * never handed to another in the same tab, and naming somebody else drops what was kept for the last.
 */
let READER = '';
/**
 * `lists` IS WHAT THE READ IS OVER, when it is over one list (`list`, `get` and the rest that name a `register`), and
 * `null` for a read over anything else (a page, a figure, the questions): a version that moved over other lists keeps
 * the first and drops the second (`keepOver`). `heard` is the record it was read from.
 */
type KeptRead = { version: number | null; sent: number; marks: number; at: number; marked: boolean; answer: Result<unknown>; lists: readonly string[] | null; heard: string };

/** The reads over one list, which a version that moved over other lists leaves kept (scope 2026-10-24 A15). */
const OVER_ONE_LIST = new Set(['list', 'get', 'countBy', 'history', 'backlinks']);

/**
 * The record `heard` moved from `from` to `to` over `moved` alone: every read kept at `from` over one list that is not
 * among them is the record's at `to` too, and stays kept; one over a moved list, or over anything else, is dropped by
 * the version it stands at, as before. Nothing is kept on when the record could not say what moved.
 */
function keepOver(heard: string, from: number, to: number, moved: readonly string[]): void {
  const gone = new Set(moved);
  for (const kept of READS.values())
    if (kept.heard === heard && kept.version === from && kept.lists !== null && !kept.lists.some((l) => gone.has(l))) kept.version = to;
}

/** Whether a read kept at `kept`, asked at `at`, is the record's at the version the tab has heard now. */
function sameVersion(heard: string, kept: number | null, at: number): boolean {
  const now = HEARD.get(heard) ?? null;
  if (kept === now) return true;
  const first = FIRST.get(heard);
  return kept === null && first !== undefined && first.version === now && at > first.asked;
}
/**
 * THE TAB'S KEPT READS, by address, token and body, whichever client asked: a screen builds a client with a fetch of its
 * own in many places, and a read kept for one of them is the record's answer for all. Beside them, the reads out now.
 */
let READS = new Map<string, KeptRead>();
let OUT = new Map<string, { version: number | null; sent: number; marks: number; at: number; regrants: number; flight: Promise<Result<unknown>> }>();
/** Every write this tab sent but a read sent as one, once answered; and the reader's marks it moved. */
let SENT = 0;
let MARKS = 0;
/** When this tab's last write of a row answered (`wroteAt`), in the page's clock; 0 before any. */
let WROTE_AT = 0;
const clockNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * WHEN THIS TAB LAST WROTE, in `performance.now()` milliseconds (0 before any write): every write sent through a client and
 * every one sent past it (`wroteOutside`), but not a read sent as one and not the reader's mark. A screen reads it to tell
 * an answer that changed because of what the reader just did from one that changed under them, so the first is drawn
 * where the reader is working and does not rearrange the page (skills pass 2 Nov: a budget typed on Budgets lifted its
 * tile to the page's top and threw the field 600px down).
 */
export const wroteAt = (): number => WROTE_AT;

/**
 * The kept answer for `key` on the record `heard` names, or `ask`ed and kept once it lands if nothing moved while it was
 * out. `marked`: the answer may carry the reader's mark (`carriesMark`).
 */
function keptOr<T>(heard: string, asked: string, marked: boolean, ask: () => Promise<Result<T>>, lists: readonly string[] | null = null): Promise<Result<T>> {
  const reader = READER;
  const regrants = REGRANTS;
  const key = `${JSON.stringify(reader)} ${asked}`;
  const version = HEARD.get(heard) ?? null;
  const now = Date.now();
  const was = READS.get(key);
  if (
    was !== undefined &&
    sameVersion(heard, was.version, was.at) &&
    was.sent === SENT &&
    (!was.marked || was.marks === MARKS) &&
    now >= was.at &&
    now - was.at < KEPT_READ_MS &&
    new Date(was.at).toDateString() === new Date(now).toDateString()
  )
    return Promise.resolve(structuredClone(was.answer) as Result<T>);
  /* THE SAME READ OUT NOW, ASKED AT THIS VERSION, is shared, a POST read among them, whichever client sent it. */
  const flying = OUT.get(key);
  if (flying !== undefined && flying.regrants === REGRANTS && sameVersion(heard, flying.version, flying.at) && flying.sent === SENT && flying.marks === MARKS)
    /* ONE THAT FAILED IS ASKED AGAIN BY THIS CALLER: the sender's own fetch may have been called off as it left. */
    return flying.flight.then((r) => (r.ok ? (structuredClone(r) as Result<T>) : ask()));
  const at = { version, sent: SENT, marks: MARKS, at: now };
  const flight = ask();
  const mine = { ...at, regrants, flight: flight as Promise<Result<unknown>> };
  OUT.set(key, mine);
  void flight.then((got) => {
    if (OUT.get(key) === mine) OUT.delete(key);
    if (!got.ok || !KEEPING || READER !== reader || REGRANTS !== regrants || !sameVersion(heard, at.version, at.at) || SENT !== at.sent) return;
    /* AN ANSWER THE RECORD SAYS IS BEHIND (Today as it was last drawn) is not the record's at this version, so it is not kept. */
    if ((got.value as { behind?: unknown } | null)?.behind === true) return;
    const carries = marked && carriesMark(got.value);
    if (carries && MARKS !== at.marks) return;
    READS.delete(key);
    READS.set(key, { ...at, marked: carries, answer: structuredClone(got), lists, heard });
    if (READS.size > KEPT_READS_MOST) READS.delete(READS.keys().next().value!);
  });
  return flight;
}

/**
 * A read the app makes past this client (its own `fetch`), kept by the version as the client keeps its own (`keepReads`):
 * `base` is the record's address, as a client is made with, and `key` names the question. Asked every time unless reads
 * are kept. A refusal is never kept.
 */
export function keptRead<R extends { ok: boolean }>(base: string, key: string, ask: () => Promise<R>): Promise<R> {
  const at = base.replace(/\/+$/, '');
  /* A RELATIVE ADDRESS NAMES NO RECORD THE POLL HEARS, so it is asked every time. */
  if (!KEEPING || !/^https?:\/\//u.test(at)) return ask();
  return keptOr<unknown>(`${at} `, `${at} ${key} outside`, false, ask as unknown as () => Promise<Result<unknown>>) as unknown as Promise<R>;
}

/** Keep reads by the record's version from now on, or stop and drop what was kept. */
export function keepReads(on: boolean): void {
  KEEPING = on;
  READS = new Map();
  OUT = new Map();
  HEARD = new Map();
  FIRST = new Map();
  GRANTS = new Map();
}

/**
 * Name who reads through this tab from now on: an app keeping reads names the person a live boot answered for, with
 * their role, their shares' epoch and who the record is seen as. Somebody else drops every kept read and schema.
 *
 * THE FIRST NAMING KEEPS EVERY LIST'S DECLARATION ASKED BESIDE `boot` (`EVERY`): it was asked with the same sign-in as
 * the `boot` that named the reader, so it is theirs. Dropped there, every cold open asked all of them a second time,
 * 32 KB on a lived-in record and 38.6 KB on the owner's, the same answer twice.
 */
export function readAs(reader: string): void {
  if (reader === READER) return;
  const first = READER === '';
  READER = reader;
  REGRANTS += 1;
  READS = new Map();
  OUT = new Map();
  SCHEMAS = new WeakMap();
  if (first) for (const every of EVERY.values()) every.regrants = REGRANTS;
  else EVERY = new Map();
  FLYING = new WeakMap();
}

/** Drop every kept read, so each is asked again: what a pull on a phone asks for. */
export function forgetReads(): void {
  READS = new Map();
  OUT = new Map();
}

/**
 * A write the app sent past this client (its own `fetch` to `/api/update` and the like) has answered: the kept reads go,
 * as after a write sent here, so the read that follows it is never answered from before it.
 */
export function wroteOutside(): void {
  SENT += 1;
  WROTE_AT = clockNow();
}

/** Where the sign-in routes are for a client's `base`: its origin, since `/auth/*` is the person's and never under a record's path. */
const originOf = (base: string): string => {
  try {
    return new URL(base).origin;
  } catch {
    return '';
  }
};

/**
 * Whether a refusal is answered by signing in again here and now: the record's stale-proof refusals (`at: 'proof'`,
 * "Sign in again to ...") and the Share sheet's inline confirm (`at: 'confirm'`). NOT a token, a press in a chat or an
 * order refused `NEEDS_BROWSER_SESSION` at `principal`: no sign-in changes those, so nothing is asked for them.
 */
export const wantsProof = (refusal: { code: string; at?: string | undefined } | null | undefined): boolean =>
  refusal != null && refusal.code === 'NEEDS_BROWSER_SESSION' && (refusal.at === 'proof' || refusal.at === 'confirm');

/**
 * What the app does when a call is refused for a sign-in that is not recent enough (`wantsProof`): asks for the proof in
 * place, and answers `proved` once the session is fresh, when the same call is sent once more. Not proved, `fix` (when
 * given) replaces the refusal's sentence, so the screen that made the call says the app's plain line and no dead end.
 * `writes` tells a press (a write, or a host door) from a read a screen made by itself.
 */
export type StepUp = (refusal: Refusal, asked: { method: string; writes: boolean }) => Promise<{ proved: true } | { proved: false; fix?: string }>;

let STEP_UP: StepUp | null = null;

/** Put the app's step-up in (`StepUp`), or take it away with `null`. One for the tab, whichever client sent the call. */
export function onStepUp(fn: StepUp | null): void {
  STEP_UP = fn;
}

/** `out`, or, refused for a stale proof and proved again in place (`STEP_UP`), the same call sent once more. */
async function provedAgain<T>(out: Result<T>, again: () => Promise<Result<T>>, method: string, writes: boolean): Promise<Result<T>> {
  if (out.ok || !('refusal' in out) || !wantsProof(out.refusal) || STEP_UP === null) return out;
  const said = await STEP_UP(out.refusal, { method, writes }).catch(() => ({ proved: false as const }));
  if (said.proved) return again();
  return 'fix' in said && said.fix !== undefined ? { ok: false, refusal: { ...out.refusal, fix: said.fix } } : out;
}

export function createClient(options: ClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch;
  const base = options.base.replace(/\/+$/, '');
  /** Whether this client's calls are asked ahead of the screen that draws them (`ClientOptions.ahead`, `AHEAD`). */
  const ahead = options.ahead === true;

  /** This client's kept schemas: dropped whole on a write it sent, and stale once a `version` answer moves. */
  const schemas = (): SchemaStore => {
    /* AN APP KEEPING READS (`keepReads`) KEEPS ONE STORE FOR THE TAB, whatever fetch a client was handed: a reader made
       with a fetch of its own asked every list's schema again, nineteen asks for one page read ahead of a press. */
    const by = KEEPING ? TAB : doFetch;
    let byHost = SCHEMAS.get(by);
    if (byHost === undefined) SCHEMAS.set(by, (byHost = new Map()));
    const key = `${JSON.stringify(READER)} ${base} ${options.token ?? ''}`;
    let store = byHost.get(key);
    if (store === undefined) byHost.set(key, (store = { version: null, lists: new Map() }));
    return store;
  };

  /** Every list's declaration asked beside `boot` (`EVERY`), taken into `store` once; whether there was one to wait for. */
  async function takeEvery(store: SchemaStore): Promise<boolean> {
    const every = EVERY.get(`${base} ${options.token ?? ''}`);
    if (every === undefined) return false;
    let taking = every.taken.get(store);
    if (taking === undefined) {
      taking = every.done.then((got) => {
        if (got === null || every.wrote !== WROTE || every.regrants !== REGRANTS || Date.now() - every.at >= SCHEMA_KEPT_MS) return;
        for (const [id, decl] of Object.entries(got.lists)) {
          if (store.lists.has(id) || decl === null || typeof decl !== 'object') continue;
          store.lists.set(id, { version: store.version, at: every.at, answer: Promise.resolve({ ok: true, value: { ...decl, blocks: got.blocks } }) });
        }
      });
      every.taken.set(store, taking);
    }
    await taking;
    return true;
  }

  /** An answer the page asked for before the app arrived (`app.html`), read as `send` reads one. */
  async function fromEarly<T>(early: Promise<Response>): Promise<Result<T>> {
    let res: Response;
    try {
      res = await early;
    } catch (e) {
      return { ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, refusal: unreachable(`${res.status} with a body that is not JSON`) };
    }
    return answered<T>(res.status, body);
  }

  /** One list's schema, sent with every other asked in this turn (`batchSchemas`). */
  function inWave(store: SchemaStore, register: string): Promise<Result<unknown>> {
    return new Promise((done) => {
      let wave = store.wave;
      if (wave === undefined) {
        wave = store.wave = new Map();
        /* A TURN AND NOT A MICROTASK: each asker waits on the declarations token first (`FOLLOW`), so the askers of one
           read reach here on microtasks of their own. */
        setTimeout(() => void sendWave(store), 0);
      }
      const waiting = wave.get(register);
      if (waiting) waiting.push(done);
      else wave.set(register, [done]);
    });
  }

  /** The wave waiting on `store`, sent: as `schema` for one list or a host without `schemas`, else as `schemas`. */
  async function sendWave(store: SchemaStore): Promise<void> {
    const wave = store.wave;
    store.wave = undefined;
    if (wave === undefined) return;
    const tell = (register: string, r: Result<unknown>) => {
      for (const done of wave.get(register) ?? []) done(r);
    };
    const alone = (register: string) =>
      call<unknown>('schema', { register }).then(
        (r) => tell(register, r),
        (e) => tell(register, { ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) }),
      );
    const lists = [...wave.keys()];
    if (lists.length === 1 || store.single === true) {
      await Promise.all(lists.map(alone));
      return;
    }
    const parts: string[][] = [];
    for (let i = 0; i < lists.length; i += SCHEMAS_WAVE_MOST) parts.push(lists.slice(i, i + SCHEMAS_WAVE_MOST));
    await Promise.all(
      parts.map(async (part) => {
        const out = await call<{ lists?: Record<string, unknown>; refused?: Record<string, Refusal>; blocks?: Record<string, unknown> }>('schemas', { registers: part }).catch(
          (e: unknown): Result<never> => ({ ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) }),
        );
        if (!out.ok) {
          const refusal = 'refusal' in out ? out.refusal : undefined;
          /* A HOST DOWN, BUSY OR CRASHED SAYS THE SAME FOR EVERY LIST: asked once a list, a failed wave of 28 became 28
             more requests into the record that had just failed it (23 Oct, the overload). */
          if (refusal === undefined || TRANSIENT.has(refusal.code)) {
            for (const register of part) tell(register, out);
            return;
          }
          if (refusal && NO_SCHEMAS.has(refusal.code)) store.single = true;
          await Promise.all(part.map(alone));
          return;
        }
        const said = out.value ?? {};
        const blocks = said.blocks ?? {};
        await Promise.all(
          part.map((register) => {
            const decl = said.lists?.[register];
            if (decl !== undefined && decl !== null && typeof decl === 'object') return tell(register, { ok: true, value: { ...(decl as object), blocks } });
            const refusal = said.refused?.[register];
            if (refusal !== undefined) return tell(register, { ok: false, refusal });
            return alone(register);
          }),
        );
      }),
    );
  }

  /** One figure, sent with every other asked within `METRIC_WAVE_MS` through any client of this host (`batchMetrics`). */
  function inMetricWave(metric: string): Promise<Result<unknown>> {
    const key = `${base} ${options.token ?? ''}`;
    return new Promise((done) => {
      let wave = METRIC_WAVES.get(key);
      if (wave === undefined) {
        /* `bare`: a figure sent by itself is not asked through the kept store, where its own wave already waits. */
        const made: MetricWave = { asked: new Map(), send: (name, args) => call<unknown>(name, args, name === 'metric' ? { bare: true } : {}) };
        METRIC_WAVES.set(key, (wave = made));
        setTimeout(() => {
          if (METRIC_WAVES.get(key) === made) METRIC_WAVES.delete(key);
          void sendMetricWave(key, made);
        }, METRIC_WAVE_MS);
      }
      const waiting = wave.asked.get(metric);
      if (waiting) waiting.push(done);
      else wave.asked.set(metric, [done]);
    });
  }

  /** A wave of figures, sent: as `metric` for one figure or a host without `metrics`, else as `metrics`. */
  async function sendMetricWave(key: string, wave: MetricWave): Promise<void> {
    const tell = (id: string, r: Result<unknown>) => (wave.asked.get(id) ?? []).forEach((done, i) => done(i === 0 ? r : (structuredClone(r) as Result<unknown>)));
    const alone = (id: string) => wave.send('metric', { metric: id }).then((r) => tell(id, r), (e) => tell(id, { ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) }));
    const ids = [...wave.asked.keys()].sort();
    if (ids.length === 1 || NO_METRICS.has(key)) return void (await Promise.all(ids.map(alone)));
    const parts: string[][] = [];
    for (let i = 0; i < ids.length; i += METRICS_WAVE_MOST) parts.push(ids.slice(i, i + METRICS_WAVE_MOST));
    await Promise.all(
      parts.map(async (part) => {
        const out = (await wave.send('metrics', { metrics: part }).catch((e: unknown): Result<never> => ({ ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) }))) as Result<{ readings?: Record<string, unknown>; refused?: Record<string, Refusal> }>;
        if (!out.ok) {
          const refusal = 'refusal' in out ? out.refusal : undefined;
          /* A HOST OLDER THAN `metrics` IS ASKED ONCE A FIGURE; any other refusal is the answer for every figure in it. */
          if (refusal && NO_SCHEMAS.has(refusal.code)) {
            NO_METRICS.add(key);
            return void (await Promise.all(part.map(alone)));
          }
          for (const id of part) tell(id, out);
          return;
        }
        const said = out.value ?? {};
        await Promise.all(
          part.map((id) => {
            if (said.readings && Object.hasOwn(said.readings, id)) return tell(id, { ok: true, value: said.readings[id] });
            const refusal = said.refused?.[id];
            if (refusal !== undefined) return tell(id, { ok: false, refusal });
            return alone(id);
          }),
        );
      }),
    );
  }

  /** Past this many encoded bytes of arguments a read is sent as a POST body, well under any server's header ceiling. */
  const READ_URL_CEILING = 6000;

  /** The most a browser lets every `keepalive` request of a page carry at once; one over it is refused unsent. */
  const KEEPALIVE_CEILING = 64 * 1024;

  /**
   * `outlive` asks that the request be finished though the page that sent it has gone (`keepalive`). ONLY `markRead`
   * ASKS, because it is the one call a screen makes as it is left: a plain fetch of a closing page is cancelled, and
   * the reader's mark was lost with it, so what was new stayed new. It is not an option of the client, and a body
   * at or over the ceiling goes plain, since a browser refuses that one rather than sending it late.
   *
   * `wave` sends a figure with the others asked beside it (`inMetricWave`) only when it is not already kept: a revisit's
   * figures are answered from the kept copy at once, as they were before the waves, and never wait for one. `bare` skips
   * the kept store, for the wave's own figure sent by itself.
   */
  async function call<T>(
    name: string,
    args: Record<string, unknown> = {},
    how: { outlive?: boolean; wave?: boolean; bare?: boolean } = {},
  ): Promise<Result<T>> {
    /* A STALE SIGN-IN IS PROVED AGAIN IN PLACE AND THE SAME CALL SENT ONCE MORE (`provedAgain`), for every screen alike. */
    const out = await callOnce<T>(name, args, how);
    return provedAgain(out, () => callOnce<T>(name, args, how), name, WRITES.has(name) && !POST_READS.has(name));
  }

  async function callOnce<T>(
    name: string,
    args: Record<string, unknown>,
    how: { outlive?: boolean; wave?: boolean; bare?: boolean },
  ): Promise<Result<T>> {
    if (!NAMES.has(name))
      return {
        ok: false,
        refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${name}.`, allowed: [...NAMES] },
      };

    const url = new URL(`${base}/api/${name}`);
    /* A READ TOO LONG FOR AN ADDRESS GOES AS A POST, which the host accepts for any read. `planPack` carries
       the whole pack, and Money's is over 20 KB: as a query string it was answered 431 by Node's 16 KB header
       ceiling before the host saw it, so onboarding could add every first-party list but Money. */
    const long = !WRITES.has(name) && encodeURIComponent(JSON.stringify(args)).length > READ_URL_CEILING;
    const writes = WRITES.has(name) || long;
    if (!writes)
      for (const [key, value] of Object.entries(args)) {
        /* AND `null` IS ABSENT TOO, BECAUSE A QUERY STRING HAS NO `null` TO SEND. `cursor: null` is
           how a caller says "from the beginning", and it went out as the four letters `null` and
           came back as the value only because the host was guessing JSON out of every value it
           read. The host now reads a cursor as the text the record minted, so a word that means
           nothing there must not be written at all: `?cursor=null` would be a position, and it
           sorts above every timestamp, so the first page would be handed back forever. */
        if (value === undefined || value === null) continue;
        /* JSON per value, so a predicate survives the query string and a plain string stays one.
           THE SECOND HALF OF THAT SENTENCE WAS NOT TRUE, AND THIS LINE WAS NOT WHERE IT WAS WRONG.
           The host `JSON.parse`d every value and kept the raw text only when the parse threw, so a
           string whose text happens to be valid JSON changed type in flight: `"2026"` arrived as
           the number 2026, `"true"` as the boolean. A page really declared at the slug `2026` was
           advertised by `pages` and then answered `REQUIRED_MISSING`, "A page is asked for by its
           slug", to a caller that had sent one, and `get('true', 1)` was a 500 out of SQLite.
           `ROUTES` now says which arguments are structured and the host decodes only those, which
           fixes it for a browser following a link as well as for this client, so the line means
           what it says. */
        url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      }

    const sent = writes ? JSON.stringify(args) : undefined;
    const outlives = how.outlive === true && sent !== undefined && new TextEncoder().encode(sent).length < KEEPALIVE_CEILING;

    /* A READ KEPT AT THIS VERSION IS ANSWERED FROM WHAT IT WAS ANSWERED (`KEEPS`), and one asked now is kept once it
       lands, if nothing moved while it was out. */
    const waved = how.wave === true && typeof args.metric === 'string' ? () => inMetricWave(args.metric as string) as Promise<Result<T>> : null;
    if (KEEPING && KEEPS.has(name) && (!WRITES.has(name) || POST_READS.has(name)) && !outlives && how.bare !== true) {
      const ask = waved ?? (() => (sent === undefined ? shared<T>(name, url, writes, sent, outlives, args) : send<T>(name, url, writes, sent, outlives, args)));
      const over = OVER_ONE_LIST.has(name) && typeof args.register === 'string' ? [args.register] : null;
      return keptOr<T>(`${base} ${options.token ?? ''}`, `${url.toString()} ${options.token ?? ''} ${sent ?? ''}`, MARKED.has(name), ask, over);
    }

    /* A READ ALREADY OUT IS NOT SENT TWICE (`FLYING`). The first caller gets the answer itself and every other one its
       own copy, so a reader that sorts or trims the rows it was handed cannot reach into another's. */
    if (waved !== null) return waved();
    if (sent === undefined) return shared<T>(name, url, writes, sent, outlives, args);
    /* A WRITE GOING OUT ENDS THE SHARING: a read asked after it must not be handed one sent before it. */
    if (WRITES.has(name) && !POST_READS.has(name)) {
      FLYING.get(doFetch)?.clear();
      OUT.clear();
    }
    return send<T>(name, url, writes, sent, outlives, args);
  }

  /** A read sent once while it is out, every other asker handed its own copy (`FLYING`). */
  function shared<T>(name: string, url: URL, writes: boolean, sent: string | undefined, outlives: boolean, args?: Record<string, unknown>): Promise<Result<T>> {
    let byFetch = FLYING.get(doFetch);
    if (byFetch === undefined) FLYING.set(doFetch, (byFetch = new Map()));
    const key = `${JSON.stringify(READER)} ${url.toString()} ${options.token ?? ''}`;
    const out = byFetch.get(key);
    if (out !== undefined) return out.then((r) => structuredClone(r) as Result<T>);
    const flight = send<T>(name, url, writes, sent, outlives, args);
    const flights = byFetch;
    flights.set(key, flight as Promise<Result<unknown>>);
    void flight.finally(() => {
      if (flights.get(key) === flight) flights.delete(key);
    });
    return flight;
  }

  /** A request out now, or a read put in the wave filling now (`batchReads`) when it may wait for one. */
  function send<T>(name: string, url: URL, writes: boolean, sent: string | undefined, outlives: boolean, args?: Record<string, unknown>): Promise<Result<T>> {
    const read = !WRITES.has(name) || POST_READS.has(name);
    const host = `${base} ${options.token ?? ''}`;
    /* A CLIENT ASKED AHEAD FILLS A WAVE OF ITS OWN (speed-g SG1): joined to a screen's own reads, its answer waited for
       theirs and the whole request was the screen's, which is what asking ahead was for. */
    if (READ_BATCHING && read && args !== undefined && !outlives && !ALONE.has(name) && !NO_READS.has(host) && !LEAVING)
      return inReadWave<T>(ahead ? `${host} ahead` : host, { name, url, writes, sent, args, ahead });
    return sendNow<T>(name, url, writes, sent, outlives);
  }

  /** One read into the wave filling for `host`, which goes once nothing has joined it for a moment. */
  function inReadWave<T>(host: string, ask: Omit<ReadAsk, 'done'>): Promise<Result<T>> {
    return new Promise((done) => {
      let byHost = READ_WAVES.get(doFetch);
      if (byHost === undefined) READ_WAVES.set(doFetch, (byHost = new Map()));
      const waves = byHost;
      let wave = waves.get(host);
      const go = (w: ReadWave): void => {
        if (waves.get(host) !== w) return;
        waves.delete(host);
        clearTimeout(w.quiet);
        clearTimeout(w.most);
        /* THE WAVE COUNTS AS A CALL OUT WHILE IT FILLS, so the page is not quiet over reads that have not gone yet. */
        if (OUTGOING.delete(w.hold)) tell();
        void sendReadWave(w.asks);
      };
      if (wave === undefined) {
        const made: ReadWave = { asks: [], quiet: undefined, most: undefined, hold: new AbortController() };
        made.most = setTimeout(() => go(made), READ_WAVE_MOST_MS);
        OUTGOING.add(made.hold);
        tell();
        waves.set(host, (wave = made));
      }
      const w = wave;
      w.asks.push({ ...ask, done: done as (r: Result<unknown>) => void });
      clearTimeout(w.quiet);
      w.quiet = setTimeout(() => go(w), READ_WAVE_QUIET_MS);
      if (w.asks.length >= READS_WAVE_MOST) go(w);
    });
  }

  /** A wave of reads, sent: by itself for one, else as one `reads`, each answered as it would have been alone. */
  async function sendReadWave(asks: readonly ReadAsk[]): Promise<void> {
    const alone = (a: ReadAsk): Promise<void> =>
      sendNow<unknown>(a.name, a.url, a.writes, a.sent, false, a.ahead).then(a.done, (e) => a.done({ ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) }));
    if (asks.length === 1) return alone(asks[0]!);
    if (LEAVING) {
      for (const a of asks) a.done({ ok: false, refusal: unreachable('This page is being left.') });
      return;
    }
    /* A READ SENT AS AN ADDRESS LEAVES OUT WHAT IS ABSENT, as a query string does (`call`); its address goes too, so the
       service worker can keep each answer under it, as it keeps a read asked by itself. */
    const calls = asks.map((a) => ({
      method: a.name,
      args: a.writes ? a.args : Object.fromEntries(Object.entries(a.args).filter(([, v]) => v !== undefined && v !== null)),
      ...(a.writes ? {} : { at: a.url.toString() }),
    }));
    /* ASKED AHEAD ONLY WHEN EVERY READ IN IT WAS: a screen's own read in the wave makes the whole request the screen's. */
    const allAhead = asks.every((a) => a.ahead);
    const out = (await sendNow<{ answers?: { status: number; body: unknown }[] }>('reads', new URL(`${base}/api/reads`), true, JSON.stringify({ calls }), false, allAhead).catch(
      (e: unknown): Result<never> => ({ ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) }),
    ));
    const answers = out.ok ? out.value?.answers : undefined;
    if (out.ok && Array.isArray(answers) && answers.length === asks.length) {
      asks.forEach((a, i) => a.done(answered<unknown>(answers[i]!.status, answers[i]!.body)));
      return;
    }
    const refusal = !out.ok && 'refusal' in out ? out.refusal : undefined;
    /* A HOST WITHOUT `reads` IS ASKED ONE READ A CALL FROM NOW ON; ONE NOT REACHED, ONE READ A CALL NOW. */
    if (refusal === undefined || NO_SCHEMAS.has(refusal.code) || refusal.code === 'UNREACHABLE') {
      if (refusal !== undefined && NO_SCHEMAS.has(refusal.code)) NO_READS.add(`${base} ${options.token ?? ''}`);
      await Promise.all(asks.map(alone));
      return;
    }
    asks.forEach((a, i) => a.done(i === 0 ? out : (structuredClone(out) as Result<unknown>)));
  }

  async function sendNow<T>(name: string, url: URL, writes: boolean, sent: string | undefined, outlives: boolean, early = ahead): Promise<Result<T>> {
    if (LEAVING && !outlives) return { ok: false, refusal: unreachable('This page is being left.') };
    let res: Response;
    const leaving = outlives ? null : new AbortController();
    if (leaving) {
      OUTGOING.add(leaving);
      if (early) AHEAD.add(leaving);
      tell();
    }
    /* TAKEN OFF AS IT ANSWERS, whichever way it ends, so the count of calls out returns to nothing. */
    const done = (): void => {
      if (leaving && OUTGOING.delete(leaving)) {
        AHEAD.delete(leaving);
        tell();
      }
    };
    /* A READ ANSWERED 503 IS ASKED AGAIN (`BUSY_TRIES`); a write never is, since it may have landed before the 503. */
    const reads = !WRITES.has(name) || POST_READS.has(name);
    try {
      for (let attempt = 0; ; attempt += 1) {
        res = await doFetch(url.toString(), {
          ...(leaving ? { signal: leaving.signal } : {}),
          method: writes ? 'POST' : 'GET',
          headers: {
            ...(writes ? { 'content-type': 'application/json' } : {}),
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          },
          ...(sent !== undefined ? { body: sent } : {}),
          ...(outlives ? { keepalive: true } : {}),
        });
        if (res.status !== 503 || !reads || attempt >= BUSY_TRIES || LEAVING) break;
        await res.body?.cancel().catch(() => undefined);
        await pause(BUSY_WAIT(attempt));
      }
    } catch (e) {
      done();
      return { ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, refusal: unreachable(`${res.status} with a body that is not JSON`) };
    } finally {
      done();
    }

    const out = answered<T>(res.status, body);
    /* A WRITE THIS CLIENT SENT MAY HAVE DECLARED SOMETHING, and the version it moved is not seen until the next poll.
       Counted after it answered, so a read sent while it was out is not kept as though it saw the write. */
    if (WRITES.has(name) && !UNDECLARING.has(name)) {
      WROTE += 1;
      schemas().lists.clear();
    }
    /* AND ANY WRITE BUT A READ SENT AS ONE DROPS THE KEPT READS (`KEEPS`); the reader's mark only those that carry it. */
    if (WRITES.has(name) && !POST_READS.has(name)) {
      if (name === 'markRead') MARKS += 1;
      else {
        SENT += 1;
        WROTE_AT = clockNow();
      }
    }
    return out;
  }

  /**
   * The host's own doors: the app's key doors, `POST /api/keys/put` and `POST /api/keys/open`, and Slash's,
   * `POST /api/slash/read`, `/api/slash/settings`, `/api/slash/propose`, `/api/slash/pattern`, and the first run's
   * `/api/slash/setup` and `/api/slash/mapping` (and its two GETs, in `hostGet` below).
   *
   * NOT THROUGH `call`, BECAUSE THEY ARE NOT METHODS. `ROUTES` is the record's surface; these are a host step in
   * front of it at a fixed path, and a name in `NAMES` would be a name `handlersFor` had to route. The key doors
   * hand the record sealed bytes, which is why a browser may send a value at all, and the ask is answered by an
   * engine the host builds and `packages/record` cannot import (`packages/host/test/slash-ask.test.ts` holds it out).
   *
   * AND NO BEARER IS SENT, EVER, even where this client holds one. A bearer is the thing these doors refuse, so
   * sending the caller's would turn every call into `NEEDS_BROWSER_SESSION`. The cookie and the `Origin` are the
   * browser's own and it sends both by itself.
   */
  async function hostDoor<T>(
    path: 'keys/put' | 'keys/open' | 'slash/read' | 'slash/settings' | 'slash/propose' | 'slash/pattern' | 'slash/setup' | 'slash/mapping' | 'slash/act',
    args: Record<string, unknown>,
    how: { busy?: () => void } = {},
  ): Promise<Result<T>> {
    /* THE KEY DOORS ANSWER THE KEYCHAIN'S STALE PROOF TOO, and a key typed in is sent again once it is proved. */
    const out = await hostDoorOnce<T>(path, args, how);
    return provedAgain(out, () => hostDoorOnce<T>(path, args, how), path, true);
  }

  async function hostDoorOnce<T>(
    path: 'keys/put' | 'keys/open' | 'slash/read' | 'slash/settings' | 'slash/propose' | 'slash/pattern' | 'slash/setup' | 'slash/mapping' | 'slash/act',
    args: Record<string, unknown>,
    how: { busy?: () => void },
  ): Promise<Result<T>> {
    OUT.clear();
    const ask = () =>
      doFetch(`${base}/api/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
    let out = await hostAnswer<T>(ask);
    /* SLASH'S READ IS A READ: a busy record is asked again as `send` asks one, and the screen is told it is waiting. */
    for (let attempt = 0; path === 'slash/read' && busy(out) && attempt < BUSY_TRIES && !LEAVING; attempt += 1) {
      how.busy?.();
      await pause(BUSY_WAIT(attempt));
      out = await hostAnswer<T>(ask);
    }
    /* A DOOR MAY WRITE ROWS (a key kept, a proposal filed), so the kept reads go, as after any write. */
    SENT += 1;
    return out;
  }

  /**
   * The host doors that are a GET, `GET /api/slash/status` and `GET /api/slash/asks`, under the same no-bearer rule.
   *
   * A GET AND NOT `hostDoor` WITH AN EMPTY BODY, because `46 §5.2` has status as a GET and the door holds it to one:
   * a browser sends no `Origin` on a same-origin GET, and the door's origin rule for both is written for exactly
   * that request. A POST here would be answered 405.
   */
  /**
   * An account door (`/account/email`, `/account/email/confirm`): the person's and not a record's, so at the
   * origin's root whatever record `base` names, with the browser's cookie and never a bearer, as `hostDoor`'s rule.
   */
  async function accountDoor<T>(path: 'email' | 'email/confirm', args: Record<string, unknown>): Promise<Result<T>> {
    const once = () => accountDoorOnce<T>(path, args);
    return provedAgain(await once(), once, `account/${path}`, true);
  }

  async function accountDoorOnce<T>(path: 'email' | 'email/confirm', args: Record<string, unknown>): Promise<Result<T>> {
    return hostAnswer<T>(() =>
      doFetch(new URL(`/account/${path}`, base).toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      }),
    );
  }

  async function hostGet<T>(path: 'slash/status' | 'slash/now' | 'slash/threads' | `slash/thread/${string}` | `slash/asks?limit=${number}`): Promise<Result<T>> {
    return hostAnswer<T>(() => doFetch(`${base}/api/${path}`, { method: 'GET' }));
  }

  async function hostAnswer<T>(send: () => Promise<Response>): Promise<Result<T>> {
    let res: Response;
    try {
      res = await send();
    } catch (e) {
      return { ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, refusal: unreachable(`${res.status} with a body that is not JSON`) };
    }
    return answered<T>(res.status, body);
  }

  return {
    call,
    /* THE TWO KEY DOORS. A browser session, no bearer, this origin, and an owner whose last proof is under
       fifteen minutes old, which the record decides. `12 §6` rules 2, 3 and 9. While the keychain is behind its
       passphrase each carries `passphrase` too, and without it the answer is `REQUIRED_MISSING` at `passphrase`; a
       wrong one is `WRONG_KEY`, and past the kernel's `PASSPHRASE_TRIES` the answer is `RATE_LIMITED` with `retry_after`. */
    /** Put a key in, or replace the value of one named by `credential`. The host seals it; the record never sees it. */
    putKey: (args: { label: string; value: string; opens?: string; kind?: string; project?: string; credential?: string; passphrase?: string; sealed_under?: 'record' | 'connector' }) =>
      hostDoor<KeyPut>('keys/put', args as unknown as Record<string, unknown>),
    /** Read one key back, once, by its label or by its spoken id. */
    openKey: (args: { label?: string; credential?: string; passphrase?: string }) =>
      hostDoor<KeyOpened>('keys/open', args as unknown as Record<string, unknown>),
    /* THE KEYCHAIN PASSPHRASE (`12 §6`, "The optional second factor"). KEYCHAIN, as the key doors are: an owner in a browser,
       proved in the last fifteen minutes. The answer's `on` is whether the keychain is behind a passphrase now; the
       passphrase itself goes in the body and is taken off by the host before the record is called. */
    /** Put the keychain behind a passphrase. Forgotten, no key in it opens again, and nobody can open it for its owner. */
    setKeychainPassphrase: (passphrase: string) => call<Answer<'setKeychainPassphrase'>>('setKeychainPassphrase', { passphrase }),
    /** Take the passphrase off the keychain, with that passphrase. A wrong one counts towards the same limit. */
    clearKeychainPassphrase: (passphrase: string) => call<Answer<'clearKeychainPassphrase'>>('clearKeychainPassphrase', { passphrase }),
    /** @deprecated The old names of the two above, kept so a caller not yet renamed still compiles; they reach the same handlers. */
    setVaultPassphrase: (passphrase: string) => call<Answer<'setVaultPassphrase'>>('setVaultPassphrase', { passphrase }),
    /** @deprecated See setVaultPassphrase. */
    clearVaultPassphrase: (passphrase: string) => call<Answer<'clearVaultPassphrase'>>('clearVaultPassphrase', { passphrase }),
    /* KEYCHAIN ACCESS (`12 §6.3`). KEYCHAIN, as the key doors are: the owner in a browser, proved within the keychain's
       lock window. A machine is a keychain grant's handle from `listDevices`, or `*` for every machine; no rule is always. */
    /** The lock window in minutes and the rules set, every key's or one key's: `{ lock_after, rules }`. */
    keyAccess: (args: { credential?: string } = {}) => call<Answer<'keyAccess'>>('keyAccess', args as Record<string, unknown>),
    /** Which tools need which key: `[{ credential, tool, title }]`, names only. */
    keyUses: () => call<Answer<'keyUses'>>('keyUses'),
    /** One key opened always, after asking, or never by one machine or every machine; `rule: null` takes the rule away. */
    setKeyAccess: (args: { credential: string; machine: string; rule: 'always' | 'ask' | 'deny' | null }) =>
      call<Answer<'setKeyAccess'>>('setKeyAccess', args as Record<string, unknown>),
    /** The machines waiting for the owner to allow a key, newest first; `recent` adds the last week's answered asks. */
    keyAsks: (args: { recent?: boolean } = {}) => call<Answer<'keyAsks'>>('keyAsks', args.recent ? { recent: 'true' } : {}),
    /** Answer one ask: let it through once, always (which sets the machine's rule), or deny it. */
    answerKeyAsk: (args: { id: string; answer: 'once' | 'always' | 'deny' }) => call<Answer<'answerKeyAsk'>>('answerKeyAsk', args as Record<string, unknown>),
    /** How long a sign-in opens the keychain for: 5, 15 or 60 minutes. */
    setLockAfter: (minutes: 5 | 15 | 60) => call<Answer<'setLockAfter'>>('setLockAfter', { minutes }),
    /**
     * Lock now: the keychain's next use in this browser asks for a sign-in again (`POST /auth/keychain/lock`, a sign-in
     * route on the origin, since what changes is the session). Everything else stays signed in. Answers `{ locked: true }`.
     */
    lockKeychain: () =>
      hostAnswer<{ locked: true }>(() =>
        doFetch(`${originOf(base)}/auth/keychain/lock`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
      ),
    /**
     * Ask Slash one question, pass 1 of `46 §5.4`: the predicate it drafted, the rows that answered it, and what it read.
     * A browser session and this origin, like the key doors. 501 `NOT_IN_THIS_BUILD` on a host with no model behind it,
     * which `version().slash` already says as `false`, and 422 `SLASH_BUDGET_SPENT` once the month's asks are used.
     */
    slashRead: (question: string, how: { busy?: () => void } = {}) => hostDoor<Reading>('slash/read', { question }, how),
    /**
     * Slash's source, the model it names, and this month's asks, against the cap on the included model and uncapped on
     * his own key. Any signed-in person may ask; the palette asks on open, which also builds the engine so the first
     * question of the day finds it built. 501 with no model.
     */
    slashStatus: () => hostGet<SlashStatus>('slash/status'),
    /**
     * Change how Slash is set up. The owner only, which the engine decides and answers 403 `FORBIDDEN` to anyone else;
     * a key the door does not know is 422 `FIELD_UNKNOWN`, and his own key on a host that cannot open a key is 501. A
     * save that points his key somewhere asks what opening it asks: a proof in the last fifteen minutes.
     */
    slashSettings: (patch: SlashSettingsPatch) => hostDoor<SlashSettings>('slash/settings', patch as Record<string, unknown>),
    /**
     * Pass 2 of `46 §5.5`: what Slash answers about the rows pass 1 found. `askId` is `Reading.ask_id`, and with it the
     * engine re-projects the predicate it already drafted rather than asking the model for a second one. The door is
     * still `/api/slash/propose`; the method was `slashPropose` until it was renamed for what it gives.
     */
    slashAnswer: (question: string, askId?: string) =>
      hostDoor<SlashProposal>('slash/propose', askId === undefined ? { question } : { question, ask_id: askId }),
    /**
     * This record's asks, newest first: what was asked, of which model, and what came of it. The owner only. `limit` is
     * how many, 20 when left out; the host answers at most 100, so a larger number is sent as 100 rather than as digits
     * the door refuses, and a number that is not finite as the 20 left out.
     */
    slashAsks: (limit = 20) =>
      hostGet<{ asks: SlashAsked[] }>(`slash/asks?limit=${Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 20}`),
    /**
     * A `pattern` proposal drafted from inbox arrivals, named by the ids the inbox gives them (one to ten). It installs
     * nothing: the proposal goes to Decide like any other, and is refused once the month's asks are spent.
     */
    slashPattern: (samples: readonly string[]) => hostDoor<SlashProposal>('slash/pattern', { samples: [...samples] }),
    /**
     * One turn of a conversation with Slash, its events handed to `onEvent` as they arrive: the thread, each step, each
     * action, the answer in pieces, and `done`, which always comes last. Pass the thread's id back to continue it. A door
     * that refuses before the turn starts is answered as a refusal, and said to `onEvent` as an `error` and a `done` too,
     * so a screen drawing the events alone still ends.
     */
    slashChat: async (input: SlashChatInput, onEvent: (event: SlashChatEvent) => void): Promise<Result<{ thread: string | null }>> => {
      OUT.clear();
      SENT += 1;
      const ended = (refusal: Refusal): Result<{ thread: string | null }> => {
        onEvent({ type: 'error', text: refusal.fix });
        onEvent({ type: 'done', spent: { asks: 0, left: null } });
        return { ok: false, refusal };
      };
      let res: Response;
      try {
        res = await doFetch(`${base}/api/slash/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      } catch (e) {
        return ended(unreachable(e instanceof Error ? e.message : String(e)));
      }
      if (!(res.headers.get('content-type') ?? '').includes('ndjson') || res.body === null) {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          return ended(unreachable(`${res.status} with a body that is not JSON`));
        }
        const out = answered<unknown>(res.status, body);
        return ended(out.ok ? unreachable(`${res.status} with an answer that is not a conversation`) : 'refusal' in out ? out.refusal : unreachable(`${res.status}`));
      }
      let thread: string | null = null;
      let done = false;
      const said = (line: string): void => {
        if (line.trim() === '') return;
        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        if (event === null || typeof event !== 'object' || typeof (event as { type?: unknown }).type !== 'string') return;
        const e = event as SlashChatEvent;
        if (e.type === 'thread') thread = e.id;
        if (e.type === 'done') done = true;
        onEvent(e);
      };
      const reader = res.body.getReader();
      const text = new TextDecoder();
      let held = '';
      try {
        for (let part = await reader.read(); !part.done; part = await reader.read()) {
          held += text.decode(part.value, { stream: true });
          let at = held.indexOf('\n');
          while (at >= 0) {
            said(held.slice(0, at));
            held = held.slice(at + 1);
            at = held.indexOf('\n');
          }
        }
        said(held + text.decode());
      } catch (e) {
        if (!done) return ended(unreachable(e instanceof Error ? e.message : String(e)));
      }
      if (!done) onEvent({ type: 'done', spent: { asks: 0, left: null } });
      return { ok: true, value: { thread } };
    },
    /** Say yes or no to an action Slash held. A yes makes it and answers its receipt and the batch an Undo takes. */
    slashAct: (id: string, accept: boolean) => hostDoor<SlashActed>('slash/act', { id, accept }),
    /** One conversation, its turns oldest first, for the person who had it. */
    slashThread: (id: string) => hostGet<SlashThread>(`slash/thread/${encodeURIComponent(id)}`),
    /** This person's conversations, newest first, so one started on another device can be picked up here. */
    slashThreads: () => hostGet<SlashThreads>('slash/threads'),
    /** Up to three short lines of what matters now, for the palette opened empty. Asks no model and spends no ask. */
    slashNow: () => hostGet<SlashNow>('slash/now'),
    /**
     * The first run's two asks: a setup from what a person said about themselves, `{ said, offer, today }`, and how a
     * file exported elsewhere maps into the record, `{ file, columns, sample, lists }`. Both propose and neither writes.
     * THE ANSWER'S SHAPE IS THE CALLER'S TO NAME, because it is `@braindog/slash`'s `SetupAnswer` and `MappingAnswer`,
     * which this package may not import (`Reading` above says why).
     */
    slashSetup: <T = unknown>(ask: Record<string, unknown>) => hostDoor<T>('slash/setup', ask),
    slashMapping: <T = unknown>(ask: Record<string, unknown>) => hostDoor<T>('slash/mapping', ask),
    /**
     * Make the record from what its owner accepted, in one call. The answer is a value like any other, a
     * refusal included, except from a host with no such call: that throws `NoSuchCall`.
     */
    setup: async (body: SetupBody) => {
      const out = await call<SetupAnswer>('setup', body as Record<string, unknown>);
      if (!out.ok && 'refusal' in out && (out.refusal.code === 'ROUTE_UNKNOWN' || (out.refusal.code === 'NOT_IN_THIS_BUILD' && out.refusal.at === 'setup')))
        throw new NoSuchCall('setup', out.refusal);
      return out;
    },
    boot: async () => {
      const out = await call<Boot>('boot');
      return out.ok ? { ...out, value: bootFilled(out.value) } : out;
    },
    /* `at`, THE PAGE THE TAB IS ON (an app path), so the record can say who else is on it (`Version.here`). */
    version: async (at?: string) => {
      const asked = Date.now();
      const heard = `${base} ${options.token ?? ''}`;
      /* WHAT MOVED SINCE THE VERSION THIS TAB HEARD LAST is asked with it, while reads are kept, so a move over other lists
         drops nothing kept over these (`keepOver`). */
      const since = KEEPING ? HEARD.get(heard) : undefined;
      const out = await call<Version>('version', { ...(since === undefined ? {} : { since }), ...(typeof at === 'string' && at !== '' ? { at } : {}) });
      if (out.ok && typeof out.value.version === 'number') {
        const moved = out.value.moved;
        if (since !== undefined && HEARD.get(heard) === since && Array.isArray(moved) && out.value.version !== since) keepOver(heard, since, out.value.version, moved);
        const store = schemas();
        /* THE FIRST VERSION HEARD names what was asked before it, the boot's schemas, so they are not all asked again. AND A
           MOVE THE RECORD SAYS WAS OVER ROWS ALONE CHANGED NO DECLARATION, so the kept schemas stand at the new one. */
        if (store.version === null) for (const kept of store.lists.values()) if (kept.version === null) kept.version = out.value.version;
        if (since !== undefined && store.version === since && Array.isArray(moved)) for (const kept of store.lists.values()) if (kept.version === since) kept.version = out.value.version;
        store.version = out.value.version;
        if (!HEARD.has(heard)) FIRST.set(heard, { asked, version: out.value.version });
        HEARD.set(heard, out.value.version);
        /* A GRANT THAT MOVED DROPS EVERY KEPT READ, whatever the version says: they were held to what was held before. */
        const said = (out.value as { grant?: { epoch?: unknown } | null }).grant?.epoch;
        const epoch = typeof said === 'number' ? said : null;
        if (GRANTS.has(heard) && GRANTS.get(heard) !== epoch) {
          REGRANTS += 1;
          READS = new Map();
          OUT = new Map();
        }
        GRANTS.set(heard, epoch);
      }
      return out;
    },
    /**
     * Every list the caller reads, its declaration asked once now (`schemas` with `every`), for the lists a first screen
     * learns: each `schema` asked for one of them from then on is answered from it (`EVERY`). `early` is that answer when
     * the page asked for it before the app arrived (`app.html`). Whether the record answered.
     */
    schemas: (early?: Promise<Response> | null): Promise<boolean> => {
      type Said = { lists?: Record<string, unknown>; blocks?: Record<string, unknown> };
      const asked = early ? fromEarly<Said>(early) : call<Said>('schemas', { every: true });
      const done = asked.then(
        (out) => (out.ok && out.value !== null && typeof out.value === 'object' ? { lists: out.value.lists ?? {}, blocks: out.value.blocks ?? {} } : null),
        () => null,
      );
      EVERY.set(`${base} ${options.token ?? ''}`, { wrote: WROTE, regrants: REGRANTS, at: Date.now(), done, taken: new WeakMap() });
      return done.then((got) => got !== null);
    },
    /** A list's schema, asked once a version for the whole tab (`SCHEMAS`). A refusal is not kept. */
    schema: async (register: string) => {
      /* KEPT AT THE VERSION THE RECORD IS AT NOW, it is answered at once: the token is only what keeps a schema past a
         move of the version, so a first screen does not wait for the copy's first catch-up to learn a list it holds. */
      const byVersion = (): Promise<Result<unknown>> | null => {
        const at = Date.now();
        const s = schemas();
        const was = s.lists.get(register);
        return was !== undefined && was.version === s.version && at - was.at < SCHEMA_KEPT_MS && at >= was.at ? was.answer : null;
      };
      const first = byVersion();
      if (first !== null) return first;
      /* AND EVERY LIST'S DECLARATION ASKED BESIDE `boot` (`schemas`), taken into this store once it lands. */
      if (await takeEvery(schemas())) {
        const taken = byVersion();
        if (taken !== null) return taken;
      }
      /* THE APP'S DECLARATIONS TOKEN FIRST (`FOLLOW`), which may wait for its follow of the log to catch up. */
      const token = FOLLOW ? await FOLLOW().catch(() => null) : null;
      const store = schemas();
      /* KEPT AT THE TOKEN, or at the version the record is at now, which a token then carries on past its moves. */
      const kept = (): Promise<Result<unknown>> | null => {
        const at = Date.now();
        const was = store.lists.get(register);
        if (was === undefined || !(was.version === store.version || (token !== null && was.version === token)) || at - was.at >= SCHEMA_KEPT_MS || at < was.at) return null;
        if (token !== null) was.version = token;
        return was.answer;
      };
      const hit = kept();
      if (hit !== null) return hit;
      const now = Date.now();
      const answer = BATCHING ? inWave(store, register) : call<unknown>('schema', { register });
      const entry: { version: Stamp; at: number; answer: Promise<Result<unknown>> } = { version: token ?? store.version, at: now, answer };
      store.lists.set(register, entry);
      void answer.then((r) => {
        if (!r.ok && store.lists.get(register) === entry) store.lists.delete(register);
      });
      return answer;
    },
    get: (register: string, seq: number) => call<unknown>('get', { register, seq }),
    list: (args: {
      register: string;
      where?: unknown;
      limit?: number;
      cursor?: string | null;
      order?: { field: string; dir?: 'asc' | 'desc' }[];
      /**
       * The rows somebody deleted as well, each with its `deleted_at` set. Absent is live rows only.
       *
       * THE RECORD HAD THE READ AND THIS SIGNATURE DID NOT, so the CLI's import could not ask for it here and sent its
       * own POST instead (`apps/cli/src/import.ts`, `listWithDeleted`): a GET carrying it undeclared was answered with
       * live rows and nothing said. The host's table now decodes it, so it goes in the address like any other read.
       */
      includeDeleted?: boolean;
      /** Only these fields of each row, its other columns kept: a walk for names need not carry every note. */
      fields?: string[];
      /** Each long text cut to its first line, at most 200 characters and a closing `…`: for a walk that never draws a note. */
      short?: boolean;
    }) => call<Page<unknown>>('list', args as Record<string, unknown>),
    /**
     * How many entries of one list hold each value of one field, in one read. `counts` is the most common values; `more`
     * says how many values and entries are in none of them. `capped` when the list was too long to count whole.
     */
    countBy: (args: { register: string; by: string; where?: unknown }) =>
      call<{ register: string; by: string; counts: { value: unknown; n: number }[]; matched: number; more?: { values: number; n: number }; capped?: true }>('countBy', args as Record<string, unknown>),
    search: (q: string, limit?: number) =>
      call<{ register: string; seq: number; title: string }[]>('search', { q, ...(limit === undefined ? {} : { limit }) }),
    history: (register: string, seq: number) => call<unknown[]>('history', { register, seq }),
    /** What points at one row, held to the lists this caller may read. `limit` is rows across the whole answer. */
    backlinks: (args: { register: string; seq: number; limit?: number; cursor?: string }) =>
      call<BacklinksAnswer>('backlinks', args as Record<string, unknown>),
    /** What changed since the caller's read mark, or since `cursor`, one the record answered with, when one is given. */
    whatsNew: (cursor?: Cursor, opts: { everything?: boolean } = {}) =>
      call<WhatsNew>('whatsNew', { ...(cursor === undefined ? {} : { cursor }), ...(opts.everything ? { everything: true } : {}) }),
    /**
     * The record's log, newest first. `cursor` is the one the page above answered with. Changes only, unless `everything`
     * asks for the record's own bookkeeping too: the sweep writing quiet runs off, and an agent's stamps of when it saw
     * a tool.
     */
    recentHistory: (args: { cursor?: Cursor | null; limit?: number; everything?: boolean } = {}) =>
      call<HistoryPage>('recentHistory', args as Record<string, unknown>),
    /**
     * The arrivals in one state, newest first: left out, what waits; `matched` what was filed, `ignored` what was
     * archived, `all` every state. An owner's read, or a token's with the `inbox` reach; `cursor` is the one the page
     * above answered with. `repeats: true` pages through the arrivals set aside as repeats alone, so a page of skipped
     * balance alerts cannot push a real second charge out of sight.
     *
     * `{ digest: true }` answers every state at once (`InboxDigest`) and `{ id }` one arrival whole (`InboxArrival`). Each
     * goes alone. An older host refuses either with the keys it takes.
     */
    inbox: <const A extends InboxArgs = Record<never, never>>(args?: A) => call<InboxAnswer<A>>('inbox', (args ?? {}) as Record<string, unknown>),
    /**
     * Settle one arrival: file it on a list with the fields it should carry (`register`), archive it (`ignore`), or put a
     * filed or archived one back in the inbox (`back`, with the filed row's `version`). Exactly one of the three. DATA.
     */
    triage: (
      args:
        | { arrival: string; register: string; fields?: Record<string, unknown>; note?: string }
        | { arrival: string; ignore: true }
        | { arrival: string; back: true; version?: number },
    ) => call<Answer<'triage'>>('triage', args as Record<string, unknown>),
    /** Which runs used a key or a tool, the one that used it last first, by the row's spoken name. READ+. */
    usedBy: (args: { spoken: string }) => call<Answer<'usedBy'>>('usedBy', args as Record<string, unknown>),
    /**
     * Tell an agent something from the app (agents and MCP plan §2.1): `to` a run (`to_run`), a kind of agent
     * (`to_agent`), whoever is next, or a task; `when` now or at the next start; or stop, pause, resume or redirect a run
     * (`kind`). `machine` and `seat` narrow any but a named run to the runs on that machine and under that Claude Code
     * profile, each by name. A person only: every key is refused `NEEDS_BROWSER_SESSION`. DATA.
     */
    instruct: (args: {
      said: string;
      kind?: 'tell' | 'stop' | 'pause' | 'resume' | 'redirect';
      when?: 'now' | 'next';
      to?: 'run' | 'agent' | 'anyone' | 'task';
      to_run?: string;
      to_agent?: string;
      project?: string;
      task?: string;
      repo?: string;
      machine?: string;
      seat?: string;
      replaces?: string;
      waits_ms?: number;
    }) => call<Answer<'instruct'>>('instruct', args as Record<string, unknown>),
    /** Take back an instruction no run has taken yet. A person only. DATA. */
    withdrawInstruction: (args: { id: string }) => call<Answer<'withdrawInstruction'>>('withdrawInstruction', args as Record<string, unknown>),
    /**
     * What he told agents, newest first, each with who saw it and how and the receipts: in one state (`open` is Sent,
     * Seen and Working), on a project or task, or to or by a run. `cursor` is the one the page above answered with. READ+.
     */
    instructionList: (args: { state?: string; project?: string; task?: string; run?: string; limit?: number; cursor?: string } = {}) =>
      call<Answer<'instructionList'>>('instructionList', args as Record<string, unknown>),
    /**
     * Send to…: who he can send a request to from a row now (`row`, or a `project`), each with its `id` for `sendTo`.
     * READ+, the owner's.
     */
    sendTargets: (args: { row?: string; project?: string } = {}) => call<Answer<'sendTargets'>>('sendTargets', args as Record<string, unknown>),
    /**
     * Send one request from a row: `target` is `auto` or an id `sendTargets` listed. Answers the instruction's spoken
     * name and where it went, or `{ route: 'slash' }` for the app to ask Slash itself. DATA, a person only.
     */
    sendTo: (args: { target: string; note?: string; attach?: string[]; may_change?: boolean; profile?: string; repo?: string; row?: string; project?: string }) =>
      call<Answer<'sendTo'>>('sendTo', args as Record<string, unknown>),
    /** One request he sent (`IN12`): its state, reply, what it is doing now and its receipts, for the strip. READ+. */
    sent: (args: { id: string }) => call<Answer<'sent'>>('sent', args as Record<string, unknown>),
    /** What he sent that is still in flight, or every request about one `row` from the last week (`open: '1'` for in flight). READ+. */
    sentList: (args: { row?: string; open?: string } = {}) => call<Answer<'sentList'>>('sentList', args as Record<string, unknown>),
    /** Take back a request he sent, or stop its job on the machine. DATA, a person only. */
    sendWithdraw: (args: { id: string }) => call<Answer<'sendWithdraw'>>('sendWithdraw', args as Record<string, unknown>),
    /** Follow up a request he sent with `note`, to the same run while it is open. DATA, a person only. */
    sendReply: (args: { id: string; note: string }) => call<Answer<'sendReply'>>('sendReply', args as Record<string, unknown>),
    /**
     * An agent's own instructions: with nothing, what is pending (marked seen); `take` one; `reply` to one with `said`
     * and `state` (done, needs_you or declined); or `seen`, the ids a client showed it, with `how`. DATA.
     */
    instructionsMine: (args: { take?: string; reply?: string; said?: string; state?: 'done' | 'needs_you' | 'declined'; seen?: string[]; how?: string } = {}) =>
      call<Answer<'instructionsMine'>>('instructionsMine', args as Record<string, unknown>),
    /** The bridge says this session is open, and hears its run's stamp, what is pending and whether it is stopped. DATA. */
    pulse: (args: { stamp?: string; shown?: string[]; how?: string } = {}) => call<Answer<'pulse'>>('pulse', args as Record<string, unknown>),
    /** The sessions open now, on one project or in one repository when asked. READ+. */
    presence: (args: { project?: string; repo?: string } = {}) => call<Answer<'presence'>>('presence', args as Record<string, unknown>),
    /** Every agent settings row, Defaults first, each with what it lets an agent do. The owner's. READ+. */
    agentProfiles: (args: { retired?: boolean } = {}) => call<Answer<'agentProfiles'>>('agentProfiles', args as Record<string, unknown>),
    /** Make (no `id`), change or retire (`retired: true`) one agent settings row. ADMIN: the owner, signed in. */
    setAgentProfile: (args: Record<string, unknown>) => call<Answer<'setAgentProfile'>>('setAgentProfile', args),
    /** Queue a job of a declared kind for a runner to take: any runner, or one on `machine` that can run `seat`. */
    createJob: (args: { kind: string; args?: Record<string, unknown>; about?: string; machine?: string; seat?: string }) =>
      call<Answer<'createJob'>>('createJob', args as Record<string, unknown>),
    /** Stop one job: at once while it waits, or by a flag its runner reads while a machine runs it. */
    cancelJob: (args: { id: string }) => call<Answer<'cancelJob'>>('cancelJob', args as Record<string, unknown>),
    /** The record's jobs, newest first. `cursor` is the one the page above answered with. */
    listJobs: (args: { status?: string; limit?: number; cursor?: string } = {}) =>
      call<Answer<'listJobs'>>('listJobs', args as Record<string, unknown>),
    /** One job's lines after `after`, with where it stands now. */
    jobEvents: (args: { id: string; after?: number }) => call<Answer<'jobEvents'>>('jobEvents', args as Record<string, unknown>),
    /** Drafts Slash makes from a description, each with the rows it is drawn over; it spends the month's asks. ADMIN. */
    slashDraft: (asked: string, page?: string) =>
      call<Answer<'slashDraft'>>('slashDraft', page === undefined ? { asked } : { asked, page }),
    /* `op_id` IS THE CALLER'S KEY FOR ONE WRITE: the same create or update sent again with it, after an answer
       that never arrived, lands once, and the record answers the first answer. */
    create: (args: { register: string; fields: Record<string, unknown>; note?: string; op_id?: string }) =>
      call<unknown>('create', args as Record<string, unknown>),
    update: (args: { register: string; seq: number; patch: Record<string, unknown>; version?: number; note?: string; op_id?: string }) =>
      call<unknown>('update', args as Record<string, unknown>),
    /**
     * One sentence kept as the one to eight entries it became, across lists, all or none, under one batch: `undo({ batch })`
     * takes every one of them back. A field may be `{ "$row": n }`, the n-th entry of the same call, counted from 0.
     */
    capture: (args: { rows: readonly CaptureRow[]; op_id?: string }) =>
      call<AnswerOr<'capture', Captured>>('capture', args as unknown as Record<string, unknown>),

    /* THE READ+ METHODS THE APP NEEDS AND HAD NO NAME FOR.
       `call(name, args)` already reached all of these — it validates the name against the table and
       picks the verb from it — so this was never a reachability gap, it was a typing one. A screen
       written against `call('governance', { … })` gets no help with the argument name and no error
       when the route is renamed, which is the whole reason the table is typed at all. */
    pages: () => call<unknown[]>('pages'),
    /** Each page the caller may open, counted: what it holds, what it could not show, each placeholder naming nothing. */
    pagesCensus: () => call<AnswerOr<'pagesCensus', unknown>>('pagesCensus'),
    /** Each placeholder a document holds, and whether the record has anything by that name. It changes nothing. */
    checkPaths: (args: { document: string; register?: string }) =>
      call<AnswerOr<'checkPaths', { paths: { path: string; named: boolean }[] }>>('checkPaths', args as Record<string, unknown>),
    /**
     * One page, narrowed by the reader's own filter choices (a field to the value chosen). An empty filter is no filter.
     * `walk` is how far a forecast looks past the two years walked unasked, in days or to the `last` bill; it goes as
     * text, which the record turns back into days. `shape` asks a project's page to carry what its shape's parts draw.
     */
    page: (slug: string, filter?: Readonly<Record<string, string>>, opts: { walk?: number | 'last'; shape?: boolean } = {}) =>
      call<unknown>('page', {
        slug,
        ...(filter && Object.keys(filter).length ? { filter } : {}),
        ...(opts.walk === undefined ? {} : { walk: String(opts.walk) }),
        ...(opts.shape === true ? { shape: '1' } : {}),
      }),
    metric: (metric: string) => call<unknown>('metric', { metric }, { wave: METRIC_BATCHING && !NO_METRICS.has(`${base} ${options.token ?? ''}`) }),
    /** Every figure the caller may read, whichever pack declared it and whether or not a page draws it. */
    figures: () => call<FigureEntry[]>('figures'),
    /** What the caller may read, in one read: the fixed addresses, lists, pages, figures and skills by name. READ+. */
    offered: () => call<Offered>('offered', {}),
    packs: () => call<PackState[]>('packs'),
    /* ADMIN, SO A BROWSER SESSION. Nothing cascades: `alsoDisable` names what a `PACK_REQUIRED` listed. */
    disablePack: (args: { id: string; alsoDisable?: string[] }) => call<PackToggle>('disablePack', args as Record<string, unknown>),
    enablePack: (args: { id: string }) => call<PackToggle>('enablePack', args as Record<string, unknown>),
    governance: (args: { register?: string; id?: string; status?: string; limit?: number; cursor?: string; review?: 'only' } = {}) =>
      call<unknown>('governance', args as Record<string, unknown>),
    members: () => call<unknown[]>('members'),
    listTokens: () => call<unknown[]>('listTokens'),
    /* ADMIN, SO A BROWSER SESSION, and approving also asks for a sign-in in the last fifteen minutes. */
    listDevices: () => call<DeviceRow[]>('listDevices'),
    deviceApprove: (args: { user_code: string }) => call<DeviceApproved>('deviceApprove', args as Record<string, unknown>),
    revokeDevice: (args: { handle: string }) => call<DeviceRow>('revokeDevice', args as Record<string, unknown>),
    /** Rename one machine by its handle (`id`): its sign-in and its key read the new name. */
    renameDevice: (args: { id: string; label: string }) => call<DeviceRow>('renameDevice', args as Record<string, unknown>),
    /** Switch one webhook door off or on: off answers every arrival 410 and stores nothing, and on again is the same door. ADMIN. */
    doorSwitch: (args: { ingest: string; on: boolean }) => call<unknown>('doorSwitch', args as Record<string, unknown>),
    listGrants: () => call<unknown[]>('listGrants'),
    /* KEYCHAIN, SO A BROWSER SESSION AND A SIGN-IN IN THE LAST FIFTEEN MINUTES. The bytes go and the row stays. */
    revokeGrant: (args: { id: string }) => call<null>('revokeGrant', args as Record<string, unknown>),
    whoami: () => call<unknown>('whoami'),
    planPack: (args: { doc: unknown; source?: { kind: string; ref?: string } }) =>
      call<unknown>('planPack', args as Record<string, unknown>),
    /** What installing a shared use case would do, pack by pack, with the documents to install. A POST, as a file is long. */
    planUseCase: (args: { doc?: unknown; text?: string; source?: { kind: string; ref?: string }; modules?: Record<string, unknown> }) =>
      call<unknown>('planUseCase', args as Record<string, unknown>),
    /**
     * The text of a shared use case or add-on at an https address or `git:owner/repo@ref:path`, read by the host, for the
     * plan to read like a chosen file. Answers `{ url, text, bytes }`.
     */
    fetchShared: (args: { url: string }) => call<unknown>('fetchShared', args as Record<string, unknown>),
    /** `fetchShared` under its old name, kept for one release. */
    fetchUseCase: (args: { url: string }) => call<unknown>('fetchUseCase', args as Record<string, unknown>),
    /** This BrainDog's arrangement as a use-case file, with only the example rows named by list and number. */
    exportUseCase: (
      args: {
        usecase?: string;
        title?: string;
        summary?: string;
        version?: string;
        audience?: string;
        author?: string;
        examples?: Record<string, number[]>;
        step?: 'patch' | 'minor';
        nav?: string[];
        signals?: string[];
        skills?: number[];
      } = {},
    ) =>
      call<unknown>('exportUseCase', args as Record<string, unknown>),
    /**
     * What a person made on this record that can be shared as an add-on, or, with ticks, the add-on file made from them
     * Reads, and changes nothing.
     */
    exportPack: (args: { declarations?: string[]; rows?: Record<string, number[]>; title?: string; id?: string; version?: string; summary?: string } = {}) =>
      call<unknown>('exportPack', args as Record<string, unknown>),

    /* THE ADMIN WRITES A SETTINGS SCREEN MAKES, SO A BROWSER SESSION FOR EACH. They were reachable through
       `call` and had no name, which left the argument names unchecked on the screens that change who may
       see a record. */
    /** Apply the plan somebody read: `planHash` is the plan's, and `approve` the calls-out lines it printed. */
    installPack: (args: { doc: unknown; source?: { kind: string; ref?: string }; planHash: string; approve?: string[]; retireWithRows?: boolean }) =>
      call<unknown>('installPack', args as Record<string, unknown>),
    /** Take a pack back out. Its declarations go and its rows stay. */
    uninstallPack: (args: { id: string; data?: boolean }) => call<unknown>('uninstallPack', args as Record<string, unknown>),
    /** The add-ons taken out within the window a reinstall still puts back, newest first, with the lists that stayed. */
    packsRemoved: () => call<Answer<'packsRemoved'>>('packsRemoved'),
    packConfig: (args: { id: string }) => call<unknown>('packConfig', args as Record<string, unknown>),
    /** Only the settings that changed; `null` puts one back to its default. */
    setPackConfig: (args: { id: string; values: Record<string, unknown>; batch?: string }) => call<unknown>('setPackConfig', args as Record<string, unknown>),
    /** Everything the person holds, not a patch: a register left out is taken away. */
    invite: (args: {
      person: string;
      email?: string;
      name?: string;
      level?: Level;
      registers?: Record<string, Level>;
      wheres?: Record<string, unknown>;
      why?: string;
    }) => call<Member>('invite', args as Record<string, unknown>),
    /* AN ADDRESS, NOT A PERSON: a single-use link good for 24 hours, handed back once. Nothing is mailed. */
    inviteByEmail: (args: { email: string; level?: Level; registers?: Record<string, Level> }) =>
      call<Invited>('invite', args as Record<string, unknown>),
    invitations: () => call<Invitation[]>('invitations'),
    revokeInvite: (args: { id: string }) => call<{ id: string; revoked_at: string }>('revokeInvite', args as Record<string, unknown>),
    removeMember: (args: { person: string; why?: string }) => call<unknown>('removeMember', args as Record<string, unknown>),
    /**
     * Stop somebody without taking them off, or let them back in with `suspended: false`. Everything they held is kept,
     * and the answer is where they now stand: `suspended_at` is when they were stopped, or `null`.
     */
    suspendMember: (args: { person: string; suspended: boolean }) =>
      call<Answer<'suspendMember'>>('suspendMember', args as Record<string, unknown>),
    /** Make somebody already here an owner and step down to Can decide, in one write (collab pass, 2 Nov). */
    handOver: (args: { person: string; why?: string }) => call<Answer<'handOver'>>('handOver', args as Record<string, unknown>),
    /** Hand one open question to the person who decides it, or take it back with `to` left out. ADMIN. The wire name is `setDecider`. */
    handQuestion: (args: { id: string; to?: string | null }) => call<{ id: string; decider: string | null }>('setDecider', args as Record<string, unknown>),
    /** `reach` opens something beyond the scope, and only an owner's whole-record token uses it: `['inbox']` reads the money inbox. */
    createToken: (args: { scope: TokenRow['scope']; label?: string; days?: number; reach?: TokenReach[] }) =>
      call<MintedToken>('createToken', args as Record<string, unknown>),
    revokeToken: (args: { id: string }) => call<TokenRow>('revokeToken', args as Record<string, unknown>),
    /* A MEMBER'S OWN AGENT (`docs/20-COLLABORATION.md` §2, tier 0). DATA, so any person on the record, signed in as
       themselves; minting needs a sign-in in the last fifteen minutes. A token writes as its person and never does more
       than they can, so `scope` is a ceiling (`write` unless said). */
    /** Make a key for your own agent. The bearer is in the answer once: show it, and keep it nowhere. */
    createOwnToken: (args: { name?: string; scope?: TokenRow['scope']; days?: number } = {}) =>
      call<MintedToken>('createOwnToken', args as Record<string, unknown>),
    /** Your own keys, newest first, revoked ones included. Never a bearer. */
    ownTokens: () => call<TokenRow[]>('ownTokens'),
    /** Revoke one of your own keys. The second call says the same as the first. */
    revokeOwnToken: (args: { id: string }) => call<TokenRow>('revokeOwnToken', args as Record<string, unknown>),
    /** A token that sends rows to one list and reaches nothing else. Revoked with `revokeToken`. */
    createReportKey: (args: { register: string; fixed?: Record<string, unknown>; stamp?: string; name?: string; days?: number }) =>
      call<MintedReportKey>('createReportKey', args as Record<string, unknown>),
    reportKeys: () => call<ReportKeyRow[]>('reportKeys'),
    /** What a project sends with its report key: one row's fields, or `{ rows }` up to a hundred. */
    report: (args: Record<string, unknown> | { rows: Record<string, unknown>[] }) => call<Reported>('report', args as Record<string, unknown>),
    /** The record as the lines of a `.brainl` file. Sealed bytes stay out unless the wrapping key is named. */
    export: (args: { sections?: ('header' | 'data' | 'origin' | 'governance')[]; redactGrants?: boolean; kek_id?: string } = {}) =>
      call<string[]>('export', args as Record<string, unknown>),

    /* BACKUPS, ERASURE AND DELETION: ADMIN, so a browser session. A host that keeps no copies, or cannot delete a
       record from the app, refuses `NOT_IN_THIS_BUILD` with a sentence saying what does work. */
    /** A copy of the whole record, now. */
    snapshot: (args: { label?: string } = {}) => call<Snapshot>('snapshot', args as Record<string, unknown>),
    /** The copies this host keeps, newest first. */
    snapshots: () => call<Snapshot[]>('snapshots'),
    /** Put the record back to one kept copy. What it was is kept as a copy first. */
    restore: (args: { bookmark: string; at?: string }) => call<Restored>('restore', args as Record<string, unknown>),
    /** Erase a person: every value naming them, in one transaction. There is no undo. */
    erase: (args: { subjects: string[]; personId?: string; basis: string }) => call<EraseReport>('erase', args as Record<string, unknown>),
    /** The example rows nobody has touched, counted by list, and how many examples somebody has. */
    examples: () => call<{ untouched: number; touched: number; registers: Record<string, number>; others: number }>('examples'),
    /** Delete every untouched example row. A row somebody edited, or one a row of theirs points at, stays. */
    clearExamples: () => call<{ cleared: number; kept: number }>('clearExamples'),
    /* SLASH'S LOOK OVER A PAGE, ANSWERED BY THE PERSON WHO SAW IT LAND: ADMIN, so a browser session. `page` is the
       page's slug, as the rail links it. */
    /** Put a page back the way it was before Slash arranged it: `previous` when an arrangement came back, `rules` when there was none. */
    undoLook: (args: { page: string }) => call<Answer<'undoLook'>>('undoLook', args as Record<string, unknown>),
    /** Keep how Slash arranged a page once its Undo has passed, so the page says who kept it. */
    keepLook: (args: { page: string }) => call<Answer<'keepLook'>>('keepLook', args as Record<string, unknown>),
    /* UNDO ON THE SERVER: ADMIN, so a browser session, and no token reaches either. `dry: true` answers the plan in
       names and its `hash`; applying sends that `hash` back, so what goes back is the plan the person read. A change
       somebody made since is skipped and said, never overwritten. */
    /**
     * Put back one set of changes (`batch`) or what one decision did (`decision`). `row` narrows a batch to the part of it
     * on one row, by its list and number, for a byline's "Only this one".
     */
    undo: (args: ({ batch: string; row?: { register: string; seq: number } } | { decision: string }) & { dry?: boolean; hash?: string }) =>
      call<Answer<'undo'>>('undo', args as Record<string, unknown>),
    /** Take back one write of the caller's own run by its receipt's batch (the agent door's `undo` tool). */
    undoOwn: (args: { batch: string; dry?: boolean }) => call<Answer<'undoOwn'>>('undoOwn', args as Record<string, unknown>),
    /** Put back every change one agent run made. */
    undoRun: (args: { run: string; dry?: boolean; hash?: string }) => call<Answer<'undoRun'>>('undoRun', args as Record<string, unknown>),
    /* UNDERSTANDING, ON ASK: ADMIN, so a browser session, and no token reaches it. The nightly walk over
       what the record holds, run now: what is certain is linked, the rest is asked on Decide. A record built before it
       answers 501 `NOT_IN_THIS_BUILD`. */
    /**
     * Read the record for who and what each thing is about, now. `dry: true` says what it would link and ask, and changes
     * nothing; `undo` puts back what an earlier run of it did, by the batches that run answered.
     */
    understand: (args: { dry?: boolean; undo?: readonly string[] } = {}) =>
      call<AnswerOr<'understand', Understood>>('understand', args as Record<string, unknown>),
    /* AND ITS DRY HALF AS A READ (READ+): a GET a token may send, so the command line and an agent see what the walk
       would link and ask without a browser. Who may read it is the record's to say. */
    /** What the next slice of the walk would link and ask, in names, with `dry: true`. It changes nothing. */
    understandPlan: () => call<AnswerOr<'understandPlan', Understood>>('understandPlan'),
    /** Delete this record. `slug` is its name, typed to confirm. */
    deleteRecord: (args: { slug: string }) => call<{ slug: string; deleted: true }>('deleteRecord', args as Record<string, unknown>),

    /* THE TWO DATA WRITES A SCREEN MAKES WITHOUT CHANGING A ROW. `markRead` moves the reader's own
       mark and nothing else, and with no `upTo` the record uses its own newest event, so a caller
       never has to know a number to say "I have seen this". `log` is a note against a row: it is a
       write, and it leaves the row's version where it was. `markRead` alone is sent to outlive its page (see
       `call`), because Home stamps the mark as the reader leaves. */
    markRead: (upTo?: Cursor) =>
      call<{ upTo: Cursor; seen_at: unknown }>('markRead', upTo === undefined ? {} : { upTo }, { outlive: true }),
    log: (args: { register: string; seq: number; note?: string }) => call<unknown>('log', args as Record<string, unknown>),
    /**
     * One of the reader's own settings, in the shape its key takes (`Prefs`): the rail's `nav.order` and `nav.hidden`,
     * `nav.shape`, `pen.suggest` or `pen.dismissed`, or `null` to take it away. A wrong shape is refused by key.
     */
    setPref: <K extends keyof Prefs>(key: K, value: NonNullable<Prefs[K]> | null) =>
      call<{ key: K; value: NonNullable<Prefs[K]> | null }>('setPref', { key, value }),
    /** One test notification to each of the reader's own devices, once a minute: how many it went to and the record's line. */
    pushTest: () => call<{ devices: number; line: string }>('pushTest'),
    /**
     * This browser asks to be told, with what `PushSubscription.toJSON()` gave, passed as it is: the record takes that
     * shape, `expirationTime` included, so nothing between the browser and the record reshapes a key.
     */
    subscribePush: (sub: { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } }) =>
      call<{ endpoint: string; at: string }>('subscribePush', sub as Record<string, unknown>),
    /** This browser stops being told. `removed` is false for an endpoint the reader does not hold. */
    unsubscribePush: (endpoint: string) => call<{ endpoint: string; removed: boolean }>('unsubscribePush', { endpoint }),

    /* A RUN'S THREE. `attach` and `handoff` are an agent's, and the host reads which run from the session
       headers the caller's own `fetch` sends; `sessionsLive` is anybody's who may read the register. */
    attach: (args: {
      source: 'startup' | 'resume' | 'clear' | 'compact' | 'cli';
      client_id?: string;
      doing?: string;
      branch?: string;
      head?: string;
    }) => call<Attached>('attach', args as Record<string, unknown>),
    /**
     * Hand the run's step on, or TAKE OR DROP ANOTHER RUN'S STEP, each of those a call of its own naming the run
     * that left the step (`S12`). `take` is an agent's: its run picks the step up and the run that left it is done; the
     * second of two takers is refused with who took it and when. `drop` closes a step that is no longer true, and `why`
     * says why in words (a drop with none is refused), by an agent or by a person from the app.
     */
    handoff: (
      args:
        | {
            next?: string;
            tried?: string;
            note?: string;
            doing?: string;
            state?: string;
            branch?: string;
            head?: string;
            session?: string;
          }
        | { take: string }
        | { drop: string; why: string },
    ) => call<unknown>('handoff', args as Record<string, unknown>),
    sessionsLive: () => call<LiveRun[]>('sessionsLive'),
    /** Where the caller stands: its run, its project, the last handoff, who is live, and what applies. */
    /**
     * Where the caller stands: its run, its project, the last handoff, who is live, and what applies. `project` stands it
     * in a project by name, `task` hands one task whole with its version, and `depth` says how much (agents and MCP plan
     * §3.1).
     */
    context: (args: { task?: string; project?: string; depth?: 'card' | 'brief' | 'task' | 'full' } = {}) => call<Context>('context', args as Record<string, unknown>),
    /** Only what moved for the caller's run since `since`, a stamp an earlier answer carried: "Nothing new." when nothing did. */
    contextSince: (since: string) => call<ContextSince>('context', { since }),
    /** Someone or some organisation met in the work, a commit author, a sender or a payee, as the caller's run. */
    meet: (args: Meet) => call<Met>('meet', args as Record<string, unknown>),
    /**
     * Ask whether two or more people held twice are the same one: `register` is the list of people and `rows` the ones
     * picked, two to twelve. It opens one question on Decide and merges nothing. Anybody who may write to the list.
     */
    sameOne: (args: { register: string; rows: readonly string[] }) => call<SameOne>('sameOne', args as Record<string, unknown>),
    /**
     * Put one question on Decide that folds everything `register` holds twice into one of each, by what the list says
     * makes two of its rows the same, with one Undo. A person's press: a token is refused.
     */
    askFoldTwice: (args: { register: string; rows?: readonly (number | string)[] }) => call<Answer<'askFoldTwice'>>('askFoldTwice', args as Record<string, unknown>),
    /**
     * Which people of `register` may be on the record twice, as `{ seqs }`, so a list can be narrowed to them. `null`
     * when that list is not where the record keeps people. It reads and changes nothing. READ+.
     */
    heldTwice: (args: { register: string }) => call<HeldTwice>('heldTwice', args as Record<string, unknown>),
    /** How many things in each list that names an accent have no colour of their own, with up to five names each: { lists, total }. list asks of one. It reads and changes nothing. READ+. */
    huesWanted: (args: { list?: string } = {}) => call<Answer<'huesWanted'>>('huesWanted', args as Record<string, unknown>),
    /** Give everything in list with no colour of its own a hue, once, in one batch: { list, gave, names, batch }, the batch for undo({ batch }), null when nothing wanted one. A person's press: a token is refused. DATA. */
    giveHues: (args: { list: string }) => call<Answer<'giveHues'>>('giveHues', args as Record<string, unknown>),
    /**
     * What matters today, as cards a screen draws above everything else: `{ cards, at, basis, said }`, `said` being why
     * the rules wrote them where a model would have, or `null`. It reads and changes nothing, and a caller is handed no
     * card from a list they may not read. READ+.
     */
    briefing: () => call<Briefing>('briefing', {}),
    /**
     * What one thing is, asked by its name: `{ is, candidates }`. Two things of one name are both offered and neither
     * is picked. Held to the lists the caller may read, and it changes nothing. READ+.
     */
    about: (args: { name: string }) => call<About>('about', args as Record<string, unknown>),
    /**
     * Who the record matched on its own and still holds as one: `{ matches }`, newest first, or `null` on a record
     * that keeps no people. Each carries the `batch` an Undo takes. It reads and changes nothing. READ+.
     */
    matched: (args?: { limit?: number }) => call<Matched>('matched', (args ?? {}) as Record<string, unknown>),
    /**
     * What stopped on the record: a list or a way in that went quiet, a feed that missed its time, and anything older
     * than its page allows, each in one sentence. Held to what the caller may read, and it changes nothing. READ+.
     */
    exceptions: () => call<Exceptions>('exceptions', {}),
    /**
     * What went stale where the caller stands: steps left earlier that nobody took, questions that waited, and what the
     * hourly tidy counts, a line a kind with the one call that clears it. It changes nothing. READ+.
     */
    stale: () => call<Stale>('stale', {}),
    /**
     * What was learned that still stands where the caller is: a method before a fact, this project before everywhere,
     * the newest first, forty unless `limit` asks for another count. One that was replaced, taken back or faded is
     * left out. Refused to a caller who may not read them, and it changes nothing. READ+.
     */
    learnings: (args?: { limit?: number }) => call<Learnings>('learnings', (args ?? {}) as Record<string, unknown>),

    /* THE SCHEDULED ACTIONS. `actions` is READ+; `resumeAction` is ADMIN, so a browser session, and it is the only
       thing that starts a paused action again. */
    actions: () => call<ActionRow[]>('actions'),
    resumeAction: (ingest: string) => call<ActionResumed>('resumeAction', { ingest }),
    actionRun: (ingest: string) => call<ActionRan>('actionRun', { ingest }),
    /** A script paused by three refused runs in a row, started again now. ADMIN, and the only thing that restarts one. */
    resumeScript: (script: string) => call<ScriptResumed>('resumeScript', { script }),
    /** Every installed script with its last run and its refused runs in a row. READ+, held to the lists each touches. */
    scripts: () => call<ScriptRow[]>('scripts'),

    /* THE AUTOMATIONS. `automations` is READ+, held to the lists the caller reads, and is one method for the list and for
       one automation with its runs, which is why it has two names here. `automationRun` and `cancelRun` are ADMIN, so a
       browser session: Run now is a person's decision. */
    automations: () => call<AutomationRow[]>('automations'),
    automation: (rule: string, page: { before?: string; limit?: number } = {}) =>
      call<Automation>('automations', { ...page, rule }),
    automationRun: (rule: string) => call<AutomationStarted>('automationRun', { rule }),
    cancelRun: (run: string) => call<RunCancelled>('cancelRun', { run }),
    /** Whether an automation's body would install, without installing it: where it is wrong, if it is. READ+. */
    checkAutomation: (args: { body: unknown }) => call<Answer<'checkAutomation'>>('checkAutomation', args as Record<string, unknown>),
    /** The reminder lines automations put on Today. READ+. */
    todayReminders: () => call<Answer<'todayReminders'>>('todayReminders'),
    automationSentence: (args: { sentence: string; rule?: string }) => call<Answer<'automationSentence'>>('automationSentence', args as Record<string, unknown>),
    /** What an automation's body would do to one sample, step by step, writing nothing. READ+. */
    tryAutomation: (args: { body: unknown; sample: unknown }) =>
      call<Answer<'tryAutomation'>>('tryAutomation', args as Record<string, unknown>),
    /** Turn one automation on or off. ADMIN, so a browser session. */
    setAutomation: (args: { rule: string; enabled: boolean }) =>
      call<Answer<'setAutomation'>>('setAutomation', args as Record<string, unknown>),
    /** Start a finished run again, as the rule is installed now and with the trigger the first run had. ADMIN. */
    retryRun: (args: { run: string }) => call<Answer<'retryRun'>>('retryRun', args as Record<string, unknown>),
    /** One page's versions, newest first, each with its source, when it was applied and by whom. READ+. */
    pageVersions: (args: { page: string }) => call<AnswerOr<'pageVersions', unknown>>('pageVersions', args as Record<string, unknown>),
    /** One automation's versions, newest first, each with its body, when and by whom it was installed. READ+. */
    automationVersions: (args: { rule: string }) =>
      call<Answer<'automationVersions'>>('automationVersions', args as Record<string, unknown>),

    /* THE SAVED VIEWS. `views` and `view` are READ+, held to the list they belong to; `saveView` and
       `retireView` are ADMIN, so a browser session, because a saved view goes on the list for
       everybody who opens it rather than into one person's bookmarks. */
    /** Every saved view on one list, or on every list this caller can read. */
    views: (args: { register?: string } = {}) => call<SavedView[]>('views', args as Record<string, unknown>),
    /** One saved view, whole. A name the list has no view for is `VIEW_UNKNOWN` with the names it has. */
    view: (args: { register: string; id: string }) => call<SavedView>('view', args as Record<string, unknown>),
    /** Save how this list is being looked at. Saving over a name replaces it and keeps who first saved it. */
    saveView: (args: {
      register: string;
      id: string;
      name: string;
      filter?: unknown;
      search?: string | null;
      order?: { field: string; dir?: 'asc' | 'desc' }[];
      columns?: string[];
    }) => call<SavedView>('saveView', args as Record<string, unknown>),
    /** Take one saved view off a list. The rows are untouched: a view is a question, not a row. */
    retireView: (args: { register: string; id: string }) => call<ViewRetired>('retireView', args as Record<string, unknown>),

    /* THE COMMENTS (`docs/20-COLLABORATION.md` §5). A thread is on a row, named as it is spoken (`tasks#3`), or on a
       question or a decision (`suggestion:SG5`, `decision:D4`, or the name the record handed this caller for one).
       `comments` is READ+; `comment` and `resolveComment` are DATA, and a Reads colleague may make both. A thing the
       caller cannot see is answered as a thing that is not there. */
    /** Every comment and reply on one thing, oldest first, each comment with how it was resolved. */
    comments: (on: string) => call<Answer<'comments'>>('comments', { on }),
    /** The people an @ may name on one thing: those who may see it, by name, the caller left out. */
    mentionable: (on: string) => call<Answer<'mentionable'>>('mentionable', { on }),
    /** Say something about one thing, or reply under a comment on it with `reply_to`, in 280 characters or fewer. */
    comment: (args: { on: string; body: string; reply_to?: string }) => call<Answer<'comment'>>('comment', args as Record<string, unknown>),
    /** Resolve a comment with the reason. Its author may, and so may somebody who may change what it is on. */
    resolveComment: (args: { id: string; as: 'addressed' | 'wont-fix' | 'incorrect'; why: string }) =>
      call<Answer<'resolveComment'>>('resolveComment', args as Record<string, unknown>),

    /* THE RECORD'S QUIET HOURS (`docs/09` §5 rule 3): READ+ to read, ADMIN to change, since the window holds the summary
       back for everybody. `quiet: null` puts 21:00 to 08:00 back. */
    quietHours: () => call<Answer<'quietHours'>>('quietHours'),
    setQuietHours: (quiet: { from: string; to: string } | 'off' | null) => call<Answer<'setQuietHours'>>('setQuietHours', { quiet }),
    /* THE RECORD'S TIME ZONE (MC2): ADMIN, since every member's "today" is counted in it; read in `boot`'s `zone`. */
    setZone: (tz: string) => call<Answer<'setZone'>>('setZone', { tz }),

    /* A PERSON'S OWN NAME AND SIGN-IN ADDRESS. The name is a record method, DATA, a person only; the address is
       the account's: a link mailed to the new one, then pressed from a sign-in in the last fifteen minutes. */
    renamePerson: (name: string) => call<Answer<'renamePerson'>>('renamePerson', { name }),

    /* THE AGENT DOOR'S OWN SIGNS. DATA, from a token or a session: the mark lands against the caller's run, or
       the token when there is none, and never opens a run. Only the keys a mark has are sent, because the record
       refuses any other, and an absent one is absent rather than `null`. */
    heard: (mark: Heard) =>
      call<AnswerOr<'heard', { marked: true }>>(
        'heard',
        Object.fromEntries(Object.entries(mark).filter(([key, value]) => value !== undefined && ['kind', 'n', 'ms', 'build', 'client'].includes(key))),
      ),
    /* WHETHER THE ENGINE'S MODEL ANSWERS, at read level, so a read token, the command line and the daily
       vital-sign read can ask. `null` from a host that hands the record no engine. */
    engineHealth: () => call<AnswerOr<'engineHealth', EngineHealth | null>>('engineHealth'),
    /* WHAT THE MODEL WAS ASKED AND WHAT THE RECORD STILL DOES NOT UNDERSTAND, at read level as `engineHealth`
       is, so the command line and an agent can read the counts. `null` from a host that hands the record no ledger. */
    engineReadings: () => call<AnswerOr<'engineReadings', EngineReadings | null>>('engineReadings'),
    /** The one switch for Slash's background reading: with nothing, the state as it stands. An owner's in a browser. */
    slashReads: (on?: boolean) => call<SlashReads>('slashReads', on === undefined ? {} : { on }),
    /** Ask each model Slash would use whether it answers now: which answered and how fast, or why not. One every ten minutes. ADMIN. */
    engineProbe: () => call<EngineProbed>('engineProbe', {}),
    /* THE DOOR'S HEALTH. ADMIN, so a browser session at owner: every connection, its app, build and last tool
       call, and the seven signs. It takes nothing and changes nothing. */
    doorHealth: () => call<AnswerOr<'doorHealth', DoorHealth>>('doorHealth'),
    /** How far each connected agent is trusted with each kind of change, by name. It writes nothing. */
    trust: () => call<AnswerOr<'trust', TrustStanding>>('trust'),
    /** Put an agent back to asking on one kind it does on its own, or on every such kind with none named. An owner's in a browser. */
    trustTakeBack: (args: { agent: string; kind?: string }) => call<TrustStanding>('trustTakeBack', args),
    /** Every import made into the record, newest first, and whether the owner said it is his own. It writes nothing. */
    imports: () => call<unknown>('imports', {}),
    /** The owner's press saying an import is his own or outside text. An owner's in a browser; it files no question. */
    importAdopt: (args: { run: string; yes: boolean }) => call<unknown>('importAdopt', args),
    /** What may be here twice: pairs of rows that may be one (named-twice). It writes nothing. */
    namedTwice: (args?: { limit?: number }) => call<unknown>('namedTwice', args ?? {}),
    /** File one question on Decide asking whether a pair is one, signed by the person who pressed. Nothing is folded until it is answered. */
    askNamedSame: (args: { pair: string }) => call<{ question: string }>('askNamedSame', args),
    changeEmail: (email: string) => accountDoor<Record<string, never>>('email', { email }),
    confirmEmail: (token: string) => accountDoor<{ email: string; unreached: number }>('email/confirm', { token }),

    /* SHARED LINKS TO ONE PAGE. The first three are ADMIN, so a browser session at owner; their answers are
       `@braindog/host`'s, because the host signs the link into `openShare`'s and the record never holds the key. */
    /** Open a read-only link to one page, for `days` from 1 to 90 (30 unless said), with amounts only when `money` is true. The link is in the answer once. */
    openShare: (args: { slug: string; days?: number; money?: boolean }) => call<ShareLink>('openShare', args as Record<string, unknown>),
    /** Whether this host can open a link at all, and the sentence why not when it cannot. */
    shareable: () => call<{ can: boolean; why?: string }>('shareable'),
    /** Close one link for good. Sharing the page again makes a new link. */
    closeShare: (id: string) => call<ShareClosed>('closeShare', { id }),
    /** The links this record opened, newest first, open and closed. Never a link itself. */
    shares: () => call<ShareRow[]>('shares'),
    /**
     * The page one link opens, read-only, asked with `Authorization: Share <token>` and no other credential.
     *
     * NOT THROUGH `call`, because the link is the credential and `call` would send this client's bearer beside it. AND A
     * 404 IS THE LINK NOT OPENING, never an unreachable host: every way a link fails is that one bare 404, so it comes
     * back as `PAGE_UNKNOWN` with the sentence a person holding it can act on.
     */
    sharedPage: async (token: string): Promise<Result<unknown>> => {
      let res: Response;
      try {
        res = await doFetch(`${base}/api/sharedPage`, { method: 'GET', headers: { authorization: `Share ${token}` } });
      } catch (e) {
        return { ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) };
      }
      if (res.status === 404)
        return { ok: false, refusal: { code: 'PAGE_UNKNOWN', fix: 'This link does not open a page. It may have been closed or have run out, so ask whoever sent it for a new one.' } };
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, refusal: unreachable(`${res.status} with a body that is not JSON`) };
      }
      return answered<unknown>(res.status, body);
    },
    /**
     * Keep one file's bytes at the address their hash makes (`PUT /api/files/<sha256>`), with this client's bearer.
     * The host hashes them again and refuses bytes that are not at their own hash.
     */
    putFile: async (bytes: Uint8Array): Promise<Result<{ sha256: string; mime: string; bytes: number }>> => {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)));
      const sha256 = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
      let res: Response;
      try {
        res = await doFetch(`${base}/api/files/${sha256}`, {
          method: 'PUT',
          headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
          body: Uint8Array.from(bytes),
        });
      } catch (e) {
        return { ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, refusal: unreachable(`${res.status} with a body that is not JSON`) };
      }
      /* THE FILE DOOR ANSWERS A KEPT FILE BARE, `{ sha256, mime, bytes }`, and only a refusal in the envelope
         (`apps/worker/src/files.ts`), so a success read through `answered` alone came back as an unreachable host. */
      const kept = body as { sha256?: unknown; mime?: unknown; bytes?: unknown } | null;
      if (res.ok && kept !== null && typeof kept.sha256 === 'string' && typeof kept.mime === 'string' && typeof kept.bytes === 'number')
        return { ok: true, value: { sha256: kept.sha256, mime: kept.mime, bytes: kept.bytes } };
      return answered<{ sha256: string; mime: string; bytes: number }>(res.status, body);
    },
  };
}

export type Client = ReturnType<typeof createClient>;
