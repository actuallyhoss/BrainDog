/**
 * The decision gate: how a proposal becomes a change, or does not.
 *
 * THE RECORD ALREADY OPENS SUGGESTIONS FROM THREE PLACES — a delivery that failed eight times, an
 * ingest whose pattern is not trusted to write, and the weekly analyser's draft — and until this
 * file existed nothing could read one, let alone answer it. Every one of them was a message in a
 * bottle. That is the failure this closes.
 *
 * A DECISION IS A ROW, NOT A SIDE EFFECT. `D41` says what was asked, what was answered, why, by whom
 * and when, and the change it authorised happened in the same transaction. A product that applied a
 * proposal and recorded the application is a product that cannot answer "who decided this and what
 * did they say", which is the only question anybody asks six months later.
 *
 * A REASON IS REQUIRED AND IS NEVER A DROPDOWN. `requires_reason` is on every options body and the
 * gate enforces it for every kind: a decision with no sentence is a decision nobody can revisit. The one exception is
 * a light question a rule or Slash opened, answered in one press (`oneAnswer`), and even that decision carries a sentence.
 *
 * AND THERE IS A THIRD VERB. `defer` is neither yes nor no — it is "not now, and here is when to ask
 * me again", and it writes no event because deferring is not a thing that happened to the record. A
 * gate with only two verbs is a gate people clear by dismissing things they meant to think about.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { clash, no, ok } from '@braindog/ports';

import { approvalLines, egressOf, keyNamed, runnerCannotOpen, type Egress } from './actions.ts';
import { agentOf, kindsOfProposal, ownerIn, recordReader, rungOf, shapeIn, stampOf, tokenOfRun, type KindReader } from './change-kind.ts';
import { instant } from './migrate.ts';
import { point } from './metrics.ts';
import { pairsReads, type PairsDecl } from './pairs.ts';
import { ACROSS, ANY_LIST, touches, type Resolve } from './reach.ts';
import { egressChanged } from './script.ts';
import { SLASH, slashMayWrite } from './slash.ts';
import { causeFault, causeOf, canon, noop } from './cause.ts';
import { costOf, costRows, costRowsOnce, optionCosts, pickCost, WAIT_RANK_SQL, WAIT_SQL, waitParams, WAITS, type Cost } from './weigh.ts';
import { askOf, retypedBody, retypeShapeFault } from './api/retype.ts';
import { configValue, readPackConfig } from './declare.ts';
import { dayIn } from './finished.ts';
import { recordIdentity } from './provision.ts';
import { access } from './members.ts';
import { pinHost, recordWrapping } from './keychain.ts';

/** The three tables that are read like registers and are not registers. */
export const GOVERNANCE = ['suggestion', 'decision', 'prediction'] as const;
export type GovernRegister = (typeof GOVERNANCE)[number];

/**
 * The bodies a suggestion carries: the four of `33-CONTRACTS` §2, and the three that arrange a BrainDog.
 *
 * `pack`, `settings` AND `arrange` ARE HOW AN AGENT OR SLASH CHANGES WHAT A RECORD IS. Installing a pack and changing a
 * pack's settings are an owner's, in a browser, and no token of any scope reaches them. A proposal is the one way an
 * agent asks for either, and the owner's press is what applies it. `arrange` is several of them, and pages, as one
 * reviewable question.
 *
 * A fifth of the original kind, `query`, is Slash's palette answer and is never filed.
 */
export const BODY_KINDS = ['options', 'pattern', 'rowset', 'change', 'pack', 'settings', 'arrange'] as const;
export type BodyKind = (typeof BODY_KINDS)[number];

/** The kinds applied by the caller after the gate says yes, because installing is asynchronous. */
export const ARRANGING = ['pack', 'settings', 'arrange'] as const;
export type Arranging = (typeof ARRANGING)[number];
const arranging = (kind: string): kind is Arranging => (ARRANGING as readonly string[]).includes(kind);

/** What a `pack` proposal asks for. Exactly one, naming one pack. */
export const PACK_VERBS = ['install', 'enable', 'disable'] as const;

/** Slash's own ceiling (ADR-051): more open arrangements than this is a queue nobody reads. */
export const OPEN_ARRANGEMENTS = 3;

/** A pack id as `normalise` takes one. */
const PACK_ID = /^[a-z][a-z0-9-]{0,63}$/;
/** At most this many packs, pages or settings changes in one arrangement. Past it, it is a rebuild. */
const ARRANGE_CEILING = 12;
/** At most this many rows in one arrangement: a plan, not an import. */
const ARRANGE_ROWS = 60;

export type Suggestion = {
  id: string;
  body_kind: BodyKind;
  body: Record<string, unknown>;
  status: string;
  opened_by: string;
  opened_at: string;
  resolved_as: string | null;
  defer_until: string | null;
  defer_why: string | null;
  /** The key for what it is about, so it is asked once (`cause.ts`), or `null` for a question nobody gave one. */
  cause: string | null;
};

export type Decision = {
  id: string;
  question: string;
  answer: string;
  reason: string;
  decided_by: string;
  ts: string;
  supersedes: string | null;
  /** The cause of the question it answered, so the same ask is found with its answer. */
  cause: string | null;
};

export type GovernDeps = {
  sql: Sql;
  nowMs: number;
  /**
   * Answers a question the moment it is filed, in a savepoint, when BrainDog may handle it itself (`handledFault`).
   * Left out, every question waits as it always did.
   */
  settle?: (id: string) => Result<unknown>;
  mint: () => string;
  allocate: (name: string) => number;
  /** Whether a register exists, so a `rowset` cannot name one that does not. */
  hasRegister: (register: string) => boolean;
  /** A row of `register` by its spoken id or row id, deleted ones included, for a `rowset` row that updates it. */
  row: (register: string, at: string) => { id: string; deleted: boolean } | null;
  /**
   * The write path, for the rows an accepted `rowset` writes. With `update` it changes that row,
   * compare-and-set on `update.version`, and otherwise it creates one.
   */
  write: (
    register: string,
    patch: Record<string, unknown>,
    actor: string,
    batch: string,
    update?: { id: string; version: number },
  ) => Result<{ id: string; version: number }>;
  /**
   * Read a prediction's measure over a window, for the baseline frozen at acceptance.
   *
   * INJECTED RATHER THAN IMPORTED, because it is the metrics module's `evaluateMetric` with the
   * caller's own evaluation context — timezone and scope included — and this file has no business
   * knowing what those are.
   */
  measure: (m: { source: string; where?: unknown; value: unknown }, window: string) => Result<{ value: number | null }>;
  /**
   * What a `change` would send out of the record, if it declares or changes a scheduled action.
   *
   * ONE PROPOSAL, ONE PRESS. The record lints the declarations the change carries, with the checks the install runs
   * when it is accepted, and works out, from them alone, every host they call, how often, the key by label and the
   * fields sent. It answers a refusal when the declarations would not install, and otherwise `null` when the change
   * sends nothing new.
   */
  review?: (to: Record<string, unknown>) => Result<{ egress: Egress[]; approve: string[] } | null>;
  /**
   * Whether what a `change` installs is still true of the rows, asked when it is accepted.
   *
   * AT ACCEPTANCE AS WELL AS WHEN IT IS FILED, because the rows move in between: a `state` narrowed to `paid` over a
   * register with no open rows is filed cleanly, and two open rows written before the owner presses accept make it a
   * register whose rows every later edit refuses. Refused here, nothing is decided and the question stays open.
   */
  fits?: (to: Record<string, unknown>) => Refusal | null;
};

/**
 * What a `change` promises will be true, and how the record will know.
 *
 * 24 §4.6's shape, and the product's own law applied to itself: ADR-007 says a number with no target
 * is decoration and a number with no comparison window is a number you cannot act on. A proposal
 * with no falsifiable claim is a proposal nobody can grade, which is how a self-improving loop turns
 * into a machine that fills somebody's week.
 */
export type Prediction = {
  claim: string;
  measure: { source: string; where?: unknown; value: unknown };
  target: Record<string, number>;
  /** `30d`, `90d` — the same offsets a schedule takes. */
  window: string;
  unit?: string;
  on_miss?: 'suggest' | 'none';
};

/**
 * WHICH QUESTION A DECISION SETTLED, AND WHICH DECISION SETTLED A QUESTION.
 *
 * Neither table says, so a screen paired them by the option offered and the order they were opened,
 * which two questions worded alike and answered in the same instant defeat. `decide` writes its
 * `decide` event and the question's `resolve` event one after the other in one transaction, so the
 * pair is two adjacent rows of the log, for every decision ever made and with no migration. A
 * decision that superseded another, or a question closed without one, reads `null`.
 */
const SETTLED =
  "(SELECT substr(r.target, 12) FROM event d JOIN event r ON r.rowid = d.rowid + 1 WHERE d.kind = 'decide' AND d.target = 'decision:' || decision.id AND r.kind = 'resolve' AND r.target LIKE 'suggestion:%') AS suggestion";
const SETTLED_BY =
  "(SELECT substr(d.target, 10) FROM event r JOIN event d ON d.rowid = r.rowid - 1 WHERE r.kind = 'resolve' AND r.target = 'suggestion:' || suggestion.id AND d.kind = 'decide' AND d.target LIKE 'decision:%' ORDER BY r.rowid DESC LIMIT 1) AS decision";

/**
 * WHAT AN ACCEPTED ARRANGEMENT DID, kept on its decision (`keepApplied`). It was only ever in the answer to the press, so
 * the tab that accepted said "Installed Personal" and a reload, or anybody else, read the decision without it. The newest
 * such line wins; a decision with none reads `null`.
 */
/* ONLY A LINE WITH NO `field`, which is how `keepApplied` writes it: the line saying where a press came from
   (`answeredIn`) is a note on the decision too, and holds the app's name in `to_v`. */
const APPLIED =
  "(SELECT a.to_v FROM event a WHERE a.kind = 'note' AND a.target = 'decision:' || decision.id AND a.target_kind = 'decision' AND a.field IS NULL AND a.to_v IS NOT NULL ORDER BY a.rowid DESC LIMIT 1) AS applied";

/**
 * WHO A QUESTION IS HANDED TO, the newest hand on it (`handQuestion`), or `null` when nobody is named or it was
 * taken back. An event and no column, so it needs no migration: a `note` on the question whose `field` is `decider`,
 * the person in `to_v`.
 */
const DECIDER =
  "(SELECT nullif(h.to_v, '') FROM event h WHERE h.kind = 'note' AND h.field = 'decider' AND h.target = 'suggestion:' || suggestion.id ORDER BY h.rowid DESC LIMIT 1) AS decider";

const COLUMNS: Record<GovernRegister, string> = {
  suggestion: `id, body_kind, body, status, opened_by, opened_at, resolved_as, defer_until, defer_why, cause, ${SETTLED_BY}, ${DECIDER}`,
  decision: `id, question, answer, reason, decided_by, ts, supersedes, cause, ${SETTLED}, ${APPLIED}`,
  prediction:
    'id, for_decl, claim, measure, baseline, unit, target, window, score_at, scored_at, observed, met, on_miss',
};

/** Newest first, because a queue nobody has answered is read from the top. */
const ORDER: Record<GovernRegister, string> = {
  suggestion: 'opened_at DESC, rowid DESC',
  decision: 'ts DESC, rowid DESC',
  prediction: 'score_at DESC, rowid DESC',
};

/** The column each register is ordered by before its rowid, for the cursor. */
const WHEN: Record<GovernRegister, string> = { suggestion: 'opened_at', decision: 'ts', prediction: 'score_at' };

/**
 * THE ORDER AN AGENT READS THE QUESTIONS IN when it asks for `order: 'wait'`: what costs most to leave
 * waiting first, by the very rank Decide's queue orders by (`weigh.ts` `WAIT_RANK_SQL`, never a second formula), then
 * newest first. Newest first alone handed an agent the question opened a minute ago while the one moving money since
 * yesterday waited under it, so the agent and the person looked at different top questions. A closed question has
 * nothing left to wait for and follows every open one, newest first as before. It takes `waitParams(nowMs)`.
 */
const WAIT_ORDER = `(CASE WHEN status = 'open' THEN ${WAIT_RANK_SQL} ELSE ${WAITS.length} END)`;

/**
 * The governance rows, read like a register.
 *
 * `open` IS THE DEFAULT VIEW OF SUGGESTIONS, and a deferred one is not open until its day comes.
 * The alternative — showing everything and letting whoever is looking filter — is a queue that
 * grows and is therefore a queue nobody reads.
 */
export function listGovernance(
  deps: Pick<GovernDeps, 'sql' | 'nowMs'>,
  register: GovernRegister,
  opts: {
    status?: string | undefined;
    limit?: number | undefined;
    every?: boolean | undefined;
    cursor?: string | undefined;
    order?: 'wait' | undefined;
    /** `only`: just the doubtful arrivals waiting in To review. Left out, an open list leaves them out (they are not Needs you). */
    review?: 'only' | undefined;
    /** `only`: just agents' suggestions on their shelf; `with`: those and Needs you together. Left out, an open list leaves them out. */
    apart?: 'only' | 'with' | undefined;
    /** `false`: the rows without what each costs to get wrong, for a reader that reads no cost (the briefing's places). */
    weigh?: false | undefined;
  } = {},
): Result<Record<string, unknown>[]> {
  if (!(GOVERNANCE as readonly string[]).includes(register))
    return no('REGISTER_UNKNOWN', `${register} is not a governance register.`, { at: 'register', allowed: GOVERNANCE });

  /* `every` IS THE RECORD'S OWN, for a count held to the caller: a count read off one page stops at the page. */
  const limit = opts.every ? -1 : Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (register === 'suggestion' && opts.status !== 'all') {
    where.push('status = ?');
    params.push(opts.status ?? 'open');
    if ((opts.status ?? 'open') === 'open') {
      where.push('(defer_until IS NULL OR defer_until <= ?)');
      params.push(instant(deps.nowMs));
      /* A DOUBTFUL ARRIVAL WAITS IN TO REVIEW, NOT IN NEEDS YOU: its body says `review`, and the open
         questions every count and queue reads stop at it. `review: 'only'` is the To review list's own read. */
      const marked = "(CASE WHEN json_valid(body) THEN COALESCE(json_extract(body, '$.review'), 0) = 1 ELSE 0 END)";
      where.push(opts.review === 'only' ? marked : `NOT ${marked}`);
      /* AN AGENT'S SUGGESTION WAITS ON ITS SHELF, NOT IN NEEDS YOU (`apartOf`): left out of the open read every count
         takes, read alone with `apart: 'only'`, and both with `apart: 'with'` for an agent looking one up. */
      if (opts.apart !== 'with') {
        where.push(opts.apart === 'only' ? ONLY_APART : NOT_APART);
        params.push(apartJson(deps));
      }
    }
  }

  /* THE CURSOR IS THE ID OF THE LAST ROW THE PAGE ABOVE HELD, and the next page is every row after it in the one order
     this list has: its time, then the order it was written in. Keyset rather than an offset, so a question opened
     while somebody reads page two does not push a row they already saw onto page three. An id this register does not
     hold is refused, never read as the first page. */
  /* BY WAIT, the cursor carries the row's rank as well, read at the same instant as the page, and the next page is every
     row after it in that order: a higher rank, or the same rank and later by time and then by the order written. */
  const byWait = register === 'suggestion' && opts.order === 'wait';
  const waitAt = byWait ? waitParams(deps.nowMs) : [];
  if (opts.cursor !== undefined) {
    const at = deps.sql.one<{ w: string; r: number; k: number | null }>(
      `SELECT COALESCE(${WHEN[register]}, '') AS w, rowid AS r${byWait ? `, ${WAIT_ORDER} AS k` : ''} FROM ${register} WHERE id = ?`,
      ...waitAt,
      opts.cursor,
    );
    if (!at) return no('VALUE_MALFORMED', 'A cursor is the id of the last row the page above answered with. Start from the first page.', { at: 'cursor' });
    const after = `(COALESCE(${WHEN[register]}, '') < ? OR (COALESCE(${WHEN[register]}, '') = ? AND rowid < ?))`;
    if (byWait) {
      where.push(`(${WAIT_ORDER} > ? OR (${WAIT_ORDER} = ? AND ${after}))`);
      params.push(...waitAt, Number(at.k), ...waitAt, Number(at.k), at.w, at.w, at.r);
    } else {
      where.push(after);
      params.push(at.w, at.w, at.r);
    }
  }

  /* AND EACH OPEN QUESTION SAYS HOW LONG IT CAN WAIT (`waits`), read in this query by `WAIT_SQL`, as Decide's card says it. */
  const rows = deps.sql.all<Record<string, unknown>>(
    `SELECT ${COLUMNS[register]}${byWait ? `, CASE WHEN status = 'open' THEN ${WAIT_SQL} END AS waits` : ''} FROM ${register}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${byWait ? `${WAIT_ORDER} ASC, ${ORDER[register]}` : ORDER[register]} LIMIT ?`,
    ...waitAt,
    ...params,
    ...waitAt,
    limit,
  );
  const out = rows.map((r) => hydrate(register, r));
  if (register !== 'suggestion') return ok(out);
  /* UNWEIGHED, the rows as they are with how long each waits: weighing one is most of what a queue costs to read. */
  if (opts.weigh === false) return ok(out.map(({ waits, ...r }) => ({ ...r, ...(typeof waits === 'string' ? { waits } : {}) })));

  /* WHAT EACH QUESTION COSTS TO GET WRONG, said by the record and never left to the reader. A body alone cannot say
     which fields a list's history withholds, so a browser weighing the raw row called a patch of a hidden field a row
     change while the card and the counts called it hard to undo. A decision or a prediction has nothing left to weigh. */
  const withheld = costRowsOnce(deps.sql);
  /* AND WHAT EACH OPTION COSTS TO HAVE PICKED (`option_costs`, by the option's id), on a question of options: one hard
     option no longer makes the question `undo`, so the reader marks the option that is hard and words only that press. */
  /* ONE READER A WRITER for the whole queue (`recordReader`): each question built its own and asked who its run is again. */
  const readers = new Map<string, KindReader>();
  return ok(
    out.map(({ waits, ...r }) => ({
      ...r,
      ...(typeof waits === 'string' ? { waits } : {}),
      cost: costOfRow(deps.sql, r, withheld, readers),
      ...(r.body_kind === 'options' ? { option_costs: optionCosts(r.body, withheld) } : {}),
    })),
  );
}

/**
 * The band of one suggestion row, by the rule the queue's card reads it by (`index.ts`, `whole`): money is always hard
 * to undo, a money field cleared included, which no body spells and so the ladder is asked; `costOf` says the rest.
 */
function costOfRow(sql: Sql, row: Record<string, unknown>, withheld: ReturnType<typeof costRows>, readers?: Map<string, KindReader>): Cost {
  const kind = String(row.body_kind ?? '');
  const body = row.body;
  if (kind === 'rowset' && body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const by = String(row.opened_by ?? '');
    const reader = readers?.get(by) ?? recordReader(sql, by);
    readers?.set(by, reader);
    const floors = kindsOfProposal(kind, body as Record<string, unknown>, reader);
    if (floors.some((k) => k.floor === 'money')) return 'undo';
  }
  return costOf(kind, body, withheld);
}

/**
 * How many questions are open right now, deferrals that have not come round left out.
 *
 * THE SAME TWO CONDITIONS `listGovernance` READS, in one place rather than two: a queue that draws three
 * and says "six more" is counting the same thing it listed, and a second copy of the predicate is how
 * those two numbers come to disagree.
 */
export function countOpenQuestions(deps: Pick<GovernDeps, 'sql' | 'nowMs'>): number {
  return (
    deps.sql.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?) AND ${NOT_APART}`,
      instant(deps.nowMs),
      apartJson(deps),
    )?.n ?? 0
  );
}

/* ── Suggested by agents: the shelf beside Needs you ── */

/**
 * The owner's switch for the shelf, kept as his pref: `false` puts every question back in Needs you. Absent is on.
 *
 * NEEDS YOU IS FOR CALLS ONLY HE CAN MAKE. An agent's "Add this to Tasks?", "Add these two names to Projects?" or "A run
 * worked in kiln. Is that Kiln?" is a suggestion that one press takes and one Put back undoes: it waits on a quieter
 * shelf ("Suggested by agents") and is not counted as needing him. What cannot be undone, and what sits on the floor
 * (money, keys, sharing, deletes, add-ons, anything that runs unattended or goes out), stays in Needs you, and so does
 * a choice between options that writes nothing, and anything a person asked.
 */
export const APART_PREF = 'decide.agents_apart';

/** Whether agents' suggestions wait apart from Needs you: on unless an owner turned it off. */
export function apartOn(sql: Sql): boolean {
  return sql.one("SELECT 1 AS y FROM pref WHERE key = ? AND value = 'false' LIMIT 1", APART_PREF) == null;
}

/** A question one of the record's people asked rather than an agent, a rule or Slash: never on the shelf. */
const PERSON_ID = /^p_/u;

/**
 * A question an arrival asked (`ingest:<door>`): never on the shelf either. It is about money or a person that came in
 * from outside and did not read cleanly, which is his to look at; a doubtful one waits in To review.
 */
const ARRIVAL = /^ingest:/u;

/** A folder or a service asked about as a project ("A run worked in kiln. Is that Kiln?"), asked once a place. */
const PLACE_KEY = /^(run|service)-project:/u;

/**
 * Whether one open question waits on the shelf: asked by an agent, Slash, a rule or a script; and either a place asked
 * about as a project, or a change whose every answer can be put back and sits on no floor.
 *
 * READ WHOLE AND IN THIS PROCESS, since the floor is the kinds a body is (`kindsOfProposal`) and SQL cannot say them.
 * `readers` and `withheld` are one weighing's, handed in so a queue reads each list's shape once.
 */
export function apartOf(
  sql: Sql,
  q: { body_kind: string; body: unknown; opened_by: string },
  withheld: ReturnType<typeof costRows>,
  readers: Map<string, KindReader>,
): boolean {
  if (PERSON_ID.test(q.opened_by) || ARRIVAL.test(q.opened_by)) return false;
  const body = isMap(q.body) ? q.body : typeof q.body === 'string' ? parse(q.body) : null;
  if (body === null) return false;
  /* A DOUBTFUL ARRIVAL WAITS IN TO REVIEW, which is its own place and not this shelf. */
  if (body.review === true || body.review === 1) return false;
  if (q.body_kind === 'options' && typeof body.understand_key === 'string' && PLACE_KEY.test(body.understand_key)) return true;
  /* BRAINDOG ARRANGING ITS OWN PAGES is a suggestion; an add-on installed, turned on or off, or set up is the floor. */
  if (q.body_kind === 'arrange') {
    const packs = isMap(body.packs) ? body.packs : {};
    const touchesPacks = ['install', 'enable', 'disable'].some((v) => listOf(packs[v]).length > 0);
    return !touchesPacks && listOf(body.settings).length === 0 && costOf('arrange', body, withheld) !== 'undo';
  }
  if (!['rowset', 'change', 'options'].includes(q.body_kind)) return false;
  const cost = costOf(q.body_kind, body, withheld);
  if (cost === 'undo' || cost === 'call') return false;
  if (q.body_kind === 'options' && optionCosts(body, withheld).some((o) => o.cost === 'undo')) return false;
  const reader = readers.get(q.opened_by) ?? recordReader(sql, q.opened_by);
  readers.set(q.opened_by, reader);
  return kindsOfProposal(q.body_kind, body, reader).every((k) => k.floor === null);
}

/** The open questions on the shelf now, by id, oldest first; none when the owner keeps them in Needs you. */
export function apartIds(deps: Pick<GovernDeps, 'sql' | 'nowMs'>): string[] {
  if (!apartOn(deps.sql)) return [];
  const rows = deps.sql.all<{ id: string; body_kind: string; body: string; opened_by: string }>(
    "SELECT id, body_kind, body, opened_by FROM suggestion WHERE status = 'open' AND body_kind IN ('rowset', 'change', 'options', 'arrange') AND (defer_until IS NULL OR defer_until <= ?) ORDER BY opened_at, rowid",
    instant(deps.nowMs),
  );
  if (rows.length === 0) return [];
  const withheld = costRowsOnce(deps.sql);
  const readers = new Map<string, KindReader>();
  return rows.filter((r) => apartOf(deps.sql, r, withheld, readers)).map((r) => r.id);
}

/** `apartIds` as the one JSON parameter `NOT_APART` and `ONLY_APART` read. */
export const apartJson = (deps: Pick<GovernDeps, 'sql' | 'nowMs'>): string => JSON.stringify(apartIds(deps));

/** A suggestion row that is not on the shelf, over `apartJson`'s parameter. */
export const NOT_APART = 'id NOT IN (SELECT value FROM json_each(?))';
/** A suggestion row that is on the shelf, over `apartJson`'s parameter. */
export const ONLY_APART = 'id IN (SELECT value FROM json_each(?))';

/** How many rows one governance register holds, every one of them: a count for a screen that pages. */
export function countGovernance(sql: Sql, register: GovernRegister): number {
  if (!(GOVERNANCE as readonly string[]).includes(register)) return 0;
  return sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${register}`)?.n ?? 0;
}

/** One row, or `null`. A missing governance row is a value, not a refusal — 45 §13 #10. */
export function getGovernance(sql: Sql, register: GovernRegister, id: string): Record<string, unknown> | null {
  if (!(GOVERNANCE as readonly string[]).includes(register)) return null;
  const row = sql.one<Record<string, unknown>>(`SELECT ${COLUMNS[register]} FROM ${register} WHERE id = ?`, id);
  return row ? hydrate(register, row) : null;
}

/** The JSON columns come back as objects, because a caller reading `body.register` should not parse. */
function hydrate(register: GovernRegister, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const key of register === 'suggestion' ? ['body'] : register === 'prediction' ? ['measure'] : ['applied'])
    if (typeof out[key] === 'string') {
      try {
        out[key] = JSON.parse(out[key] as string) as unknown;
      } catch {
        /* A body this record cannot parse is still a row somebody has to see. It goes back as the
           string it is rather than as a refusal that hides the whole queue. */
      }
    }
  return out;
}

/* ── opening one ─────────────────────────────────────────────────────────── */

/**
 * `cause` IS THE FILER'S KEY FOR WHAT IT ASKS, so it is asked once (`cause.ts`): left out, an agent's run derives one.
 */
export type Proposal = {
  question: string;
  body_kind: BodyKind;
  body: Record<string, unknown>;
  cause?: string;
  /**
   * WHAT CHANGED SINCE IT WAS ANSWERED, one sentence. A question with this cause that the person declined, or
   * answered with an option, is answered from memory and nothing is filed; with `again` it is filed, and the sentence
   * is kept under the question so the person reads why it is back.
   */
  again?: string;
  /**
   * WHO DECIDES IT, a person's id, so the question arrives already handed to them. They must hold Decides on
   * the record or own it. Left out, any member who may decide may answer it, as before.
   */
  decider?: string;
  /**
   * THE OPEN QUESTIONS THIS ONE ANSWERS TOO, by their SG: "Covers SG242 too" said in words left SG242 open
   * after its twin was accepted. Accepting this one closes each still open as moot, in the decision's batch, so its
   * Undo asks them again. Declining it leaves them as they are.
   */
  covers?: string[];
};

/** The most questions one may say it covers. */
const COVERS_MOST = 20;

/** What a note holds in `to_v` before the ids of the questions a question covers: `covers:SG242,SG243`. */
const COVERS = 'covers:';

/** The ids `covers` names, or the sentence that says what is wrong with them. */
function coversFault(sql: Sql, covers: unknown): string | null {
  if (!Array.isArray(covers) || covers.length === 0 || covers.length > COVERS_MOST || covers.some((c) => typeof c !== 'string' || !/^SG\d+$/u.test(c)))
    return `covers is a list of the open questions this one answers too, as ["SG242"], at most ${COVERS_MOST}, or leave it out.`;
  const shut = (covers as string[]).find((c) => sql.one("SELECT 1 AS x FROM suggestion WHERE id = ? AND status = 'open'", c) === undefined);
  return shut === undefined ? null : `${shut} is not an open question, so this cannot cover it. Leave it out of covers.`;
}

/** The questions an open question said it covers when it was filed (`Proposal.covers`). */
function coveredBy(sql: Sql, id: string): string[] {
  const said = sql.one<{ v: string }>("SELECT to_v AS v FROM event WHERE kind = 'note' AND target = ? AND to_v LIKE 'covers:%' ORDER BY rowid DESC LIMIT 1", `suggestion:${id}`);
  return said === undefined ? [] : said.v.slice(COVERS.length).split(',').filter((c) => /^SG\d+$/u.test(c));
}

/**
 * What the person said the last time this cause was asked, when it is answered from memory: `said` is "No" or the
 * option they picked, `reason` their words (or that they gave none), `at` the instant they answered.
 */
export type Remembered = { said: string; reason: string; at: string };

/**
 * What filing answers: the question's id, and `joined` when an open question already asked it and nothing was filed.
 * `widened` when the open one was a rowset or an arrangement and this one's further rows or parts were added to it.
 * `answered` when the person already answered this cause and nothing was filed: `id` is then the question they answered.
 */
export type Filed = { id: string; joined?: true; widened?: number; answered?: Remembered; handled?: true };

/** How a question another one covered is closed: this, then the question whose accept settled it. */
export const COVERED = 'Settled by';

/** How a question is closed when its mail is asked about again one mail at a time (RM4): never reopened whole. */
export const ONE_AT_A_TIME = 'Each mail in it is asked about on its own, after';

/**
 * A mail put back in the inbox, given back to the questions its settling let go of it from (`settleAsked` in
 * `index.ts`, RL10): each `suggest` line on `raws` in the settling's batch holds the row it let go of. The question takes
 * the row back, reopened if it closed when its last mail was filed, and keeps beside it only the mail still in the inbox,
 * so a yes never files a mail that was filed meanwhile. Read by a put back (`returnArrival`) and an undo of the filing.
 */
export function askAgainLetGo(
  sql: Sql,
  mint: () => string,
  at: string,
  lines: readonly { kind: string; target: string | null; field: string | null; from_v: string | null }[],
  raw: string,
  actor: string,
  batch: string,
): void {
  for (const l of lines) {
    if (l.kind !== 'suggest' || l.field !== 'raws' || l.target === null || !l.target.startsWith('suggestion:')) continue;
    const id = l.target.slice('suggestion:'.length);
    let was: { raw?: unknown; row?: unknown } | null;
    try {
      was = JSON.parse(l.from_v ?? 'null') as { raw?: unknown; row?: unknown } | null;
    } catch {
      continue;
    }
    if (was === null || was.raw !== raw || was.row === null || typeof was.row !== 'object') continue;
    const q = sql.one<{ status: string; resolved_as: string | null; body: string }>('SELECT status, resolved_as, body FROM suggestion WHERE id = ?', id);
    if (q === undefined || (q.status !== 'open' && q.resolved_as !== 'moot')) continue;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(q.body) as Record<string, unknown>;
    } catch {
      continue;
    }
    const raws = Array.isArray(body.raws) ? (body.raws as unknown[]) : [];
    const rows = Array.isArray(body.rows) ? (body.rows as unknown[]) : [];
    if (raws.length !== rows.length || raws.includes(raw)) continue;
    const waiting = new Set(
      sql
        .all<{ id: string }>("SELECT id FROM inbox_raw WHERE id IN (SELECT value FROM json_each(?)) AND state IN ('untriaged', 'review')", JSON.stringify(raws))
        .map((r) => r.id),
    );
    const keep = raws.map((r, n) => [r, rows[n]] as const).filter(([r]) => typeof r === 'string' && waiting.has(r));
    const next = { ...body, rows: [...keep.map(([, row]) => row), was.row], raws: [...keep.map(([r]) => r), raw], count: keep.length + 1 };
    sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(next), id);
    if (q.status !== 'open')
      sql.exec(
        `UPDATE suggestion SET status = 'open', resolved_as = NULL, defer_until = NULL, defer_why = NULL,
           cause = CASE WHEN EXISTS (SELECT 1 FROM suggestion o WHERE o.status = 'open' AND o.cause = suggestion.cause AND o.id <> suggestion.id) THEN NULL ELSE cause END
         WHERE id = ?`,
        id,
      );
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch) VALUES (?, ?, ?, 'suggest', ?, 'suggestion', 'rows', ?, ?, 'Asked again: the mail is back in the inbox.', ?)",
      mint(),
      at,
      actor,
      `suggestion:${id}`,
      String(rows.length),
      String(next.rows.length),
      batch,
    );
  }
}

/** The one sentence a rowset that would change nothing is refused with. */
export const NOTHING_TO_DECIDE = 'Everything this asks for is already so. Nothing to decide.';

/** At most this many rows in one `rowset`. Past it, it is an import and wants a different verb. */
const MAX_ROWS = 200;

/**
 * Open a suggestion.
 *
 * THE BODY IS CHECKED HERE AND NOT AT THE GATE, because the person answering it should not be the
 * one who finds out it was malformed. A proposal that cannot be applied is a proposal that should
 * never have been filed.
 *
 * `actor` MAY BE ASKED FOR, and then it is asked only once the body has passed. A token's proposal is
 * signed by its run, and working out the run can open one: a proposal refused here must open nothing.
 *
 * `drafted` IS WHO DRAFTED IT, when that is not who filed it: Slash files both its rules' drafts and a model's
 * (`suggestion.drafted_by`, migration 21). A parameter and not a field of `Proposal`, so a caller's own proposal
 * cannot claim to be one.
 */
export function propose(deps: GovernDeps, actor: string | (() => string), p: Proposal, drafted?: string): Result<Filed> {
  if (!p?.question?.trim())
    return no<{ id: string }>('REQUIRED_MISSING', 'A proposal is a question somebody can answer.', { at: 'question' });
  if (!(BODY_KINDS as readonly string[]).includes(p.body_kind))
    return no<{ id: string }>('ENUM_VALUE_UNKNOWN', `${String(p.body_kind)} is not a kind of proposal.`, {
      at: 'body_kind',
      allowed: BODY_KINDS,
    });

  if (p.cause !== undefined) {
    const bad = causeFault(p.cause);
    if (bad !== null) return no<Filed>('VALUE_MALFORMED', bad, { at: 'cause' });
  }
  if (p.again !== undefined && (typeof p.again !== 'string' || p.again.trim() === '' || new TextEncoder().encode(p.again).length > AGAIN_BYTES))
    return no<Filed>('VALUE_MALFORMED', `again is one sentence of at most ${AGAIN_BYTES} bytes saying what changed since this was last answered, or leave it out.`, { at: 'again' });

  if (p.covers !== undefined) {
    const bad = coversFault(deps.sql, p.covers);
    if (bad !== null) return no<Filed>('VALUE_MALFORMED', bad, { at: 'covers' });
  }

  /* WHO DECIDES IT is checked before anything is filed. */
  if (p.decider !== undefined) {
    const bad = deciderNameFault(deps.sql, p.decider);
    if (bad !== null) return no<Filed>('VALUE_MALFORMED', bad, { at: 'decider' });
  }

  const wrong = checkBody(deps, p.body_kind, p.body ?? {}, p.cause ?? null);
  if (wrong) return { ok: false, refusal: wrong };
  /* A DAY IT LAPSES IS ONE STILL TO COME, in the record's own zone. */
  const past = p.body_kind === 'arrange' || (p.body_kind === 'rowset' && p.body?.lapses !== undefined) ? offerFault(p.body ?? {}, todayIn(deps)) : null;
  if (past) return { ok: false, refusal: past };

  /* A ROWSET THAT CHANGES NOTHING IS NOT A QUESTION. SG69 on the owner's record proposed values its rows already held,
     and answering it would have written nothing; the proposer is told so instead of the owner being asked. */
  if (p.body_kind === 'rowset' && noop(p.body, (register, at) => heldFields(deps, register, at)))
    return no<Filed>('ALREADY_KNOWN', NOTHING_TO_DECIDE, { at: 'body.rows' });

  /* WHAT IT SENDS OUT IS WORKED OUT HERE, NEVER TAKEN FROM THE PROPOSER. An agent that wrote its own `egress` could
     print a friendlier host than the one it declares, so whatever it wrote is dropped and the record's own reading
     of the declarations is stored in its place. */
  let body: Record<string, unknown> = p.body ?? {};
  if (p.body_kind === 'change') {
    const { egress: _theirs, approve: _theirLines, from_version: theirVersion, ...rest } = body;
    body = rest;
    /* AND THE VERSION IT WAS DRAWN FROM, WHICH ONLY THE PROPOSER KNOWS AND ONLY THE RECORD MAY BOUND. Accepted with no
       version to land against, the second of two changes drawn from one reading replaced the first whole: `domain` went
       with a value still under it, and both decisions read "accept" (`record/test/schema-add.test.ts`). Stamped with
       the version live AT FILING, that race closed and the wider one stayed open: a body read at v1 and filed after
       another change reached v2 was stamped v2, accepted, and erased the other change's fields
       (`record/test/change-drawn.test.ts`). So the proposer's version is kept when it names one that has been live, and
       the live one stands in when it is absent. One ABOVE the live version is a guess at what will be live when the
       owner presses, which is the race the filing stamp closed, so it is the live one too. An `add` needs none: it is
       merged onto whatever is live at the press, and a `retire` is merged the same way.

       AND EVERY MEMBER OF A BUNDLE GETS ONE, stored as `{ "<id>": n }`. Stamped for `declaration_id` alone, the rest of
       `{ declarations: [...] }` installed with no version at all: a change filed under a metric carrying Projects as
       read at v1 erased the `domain` another change had added at v2, and one filed under Projects at its live version
       carried a stale metric over somebody else's edit to it (`govern-bundle-version.test.ts`). The proposer may send
       the map, and a plain number still means the member the change is filed under; every member it says nothing about
       is stamped live, as an absent number is. */
    if (!fieldLevel(body.to)) {
      const named = String(body.declaration_id);
      const members = membersOf(body.to);
      const stamp = (id: string, theirs: unknown): number => {
        const live = liveVersion(deps.sql, id);
        return typeof theirs === 'number' && theirs <= live ? theirs : live;
      };
      const given: Record<string, unknown> = members !== null && isMap(theirVersion) ? theirVersion : { [named]: theirVersion };
      const unknown = Object.keys(given).find((id) => members !== null && !members.includes(id));
      if (unknown !== undefined)
        return no<{ id: string }>('VALUE_MALFORMED', `from_version names ${unknown}, and this change does not install it (${(members ?? []).join(', ')}).`, {
          at: 'body.from_version',
        });
      const wrong = Object.keys(given).find((id) => !isDrawn(given[id]));
      if (wrong !== undefined)
        return no<{ id: string }>(
          'VALUE_MALFORMED',
          members === null
            ? `from_version is the version of ${named} you read before writing this body, a whole number, or leave it out.`
            : `from_version is the version of each declaration this installs as you read it, {"${named}":1}, a whole number for each, or leave it out.`,
          { at: 'body.from_version' },
        );
      body = {
        ...body,
        from_version: members === null ? stamp(named, given[named]) : Object.fromEntries(members.map((id) => [id, stamp(id, given[id])])),
      };
    }
    const to = resolveTo(deps.sql, body);
    if (to.ok) {
      /* A RETYPE IS NOT REVIEWED HERE, because `review` counts the rows as the install does and would answer the very
         `FIELD_TYPE_CHANGED` a retype answers row by row. A list sends nothing out, and the record lints the list it would
         install before it files one (`packages/record/src/methods/retype.ts`). */
      const read: Result<{ egress: Egress[]; approve: string[] } | null> = deps.review && !isRetype(body.to) ? deps.review(to.value.to) : ok(null);
      if (!read.ok) return read as Result<{ id: string }>;
      /* AND A DIGEST'S WEBHOOK, which `review` does not ask `egressOf` about: it reads an ingest or a script and passes
         every other kind by, so a digest posting Notes to `collector.example.com` was filed with `approve: null`
         (`egress-digest-pattern.test.ts`). Worked out here beside it, and a line `review` already said is not said
         twice, so the day it asks about digests too this adds nothing. */
      const theirs = read.value?.egress ?? [];
      const digests = newEgress(deps.sql, declared(to.value.to).filter((d) => d.kind === 'digest')).filter((e) => !theirs.some((t) => t.line === e.line));
      if (digests.length > 0) body = { ...body, egress: [...theirs, ...digests], approve: approvalLines([...theirs, ...digests], { passphrase: recordWrapping(deps.sql)?.wrapped_by === 'passphrase' }) };
      else if (read.value !== null) body = { ...body, egress: read.value.egress, approve: read.value.approve };
    }
  }

  /* A PATTERN INSTALLS AN INGEST, AND AN INGEST CAN POLL. It was filed with no `approve` at all, because the lines
     above were worked out for a `change` alone: an ingest polling `api.goldapi.io` every hour on the key `goldapi` was
     filed as a pattern and read `approve: null`, so the owner accepted a clock and a key he was never shown. The
     proposer's own lines are dropped for the reason they are dropped from a change. */
  if (p.body_kind === 'pattern') {
    const { egress: _theirs, approve: _theirLines, ...rest } = body;
    body = rest;
    const ingest = body.ingest as Record<string, unknown>;
    const egress = newEgress(deps.sql, [isDeclaration(ingest) ? { id: ingest.id, kind: 'ingest', body: ingest.body } : { kind: 'ingest', body: ingest }]);
    if (egress.length > 0) body = { ...body, egress, approve: approvalLines(egress, { passphrase: recordWrapping(deps.sql)?.wrapped_by === 'passphrase' }) };
  }

  /* ASKED ONCE. The filer's cause, or for an agent's run the one the body derives, and an open question holding it is
     the answer: nothing is filed and the proposer is told which. A rule's, Slash's or a person's question derives none,
     for migration 31's reason: an automation's run waits on its own question, and two runs asking alike are two asks. */
  const by = typeof actor === 'function' ? actor() : actor;
  /* AN AGENT'S OPTION THAT SAYS A CHANGE CARRIES IT (`unwritten`), or picking it would be recorded and change nothing. */
  if (p.body_kind === 'options' && RUN_ID.test(by)) {
    const bare = unwritten(body);
    if (bare) return { ok: false, refusal: bare };
  }
  /* A MODEL'S DRAFT NAMES NOBODY TO DECIDE IT: Slash writes only suggest, propose and predict, and handing one is the owner's. */
  if (p.decider !== undefined && by === SLASH)
    return no<Filed>('FORBIDDEN', 'A question Slash drafts names nobody to decide it. The owner hands it to somebody.', { at: 'decider' });
  const cause = p.cause ?? (RUN_ID.test(by) ? causeOf(p.body_kind, body, p.question) : null);
  /* ANSWERED ALREADY. The person said no to this cause, or picked an option of it, and the proposer is told
     what they said, when and why, and nothing is filed. With `again` it is asked anyway, and that sentence goes under
     it. An open question holding the cause is newer than any answer, so it is joined below instead. */
  const memory = cause !== null && !openWith(deps.sql, cause) ? remembered(deps, cause, p.body_kind, body) : null;
  if (memory !== null && p.again === undefined) return ok(memory);
  const asked = askedAlready(deps, by, p, body, cause);
  if (!asked.ok) return asked;
  if (asked.value !== null) return ok(asked.value);
  /* AT THE CAP A STRONGER ONE TAKES THE PLACE OF THE ASKER'S OWN WEAKEST, in this write, or is refused. */
  if (p.body_kind === 'arrange') {
    const full = makeRoom(deps, by, body, cause);
    if (full) return { ok: false, refusal: full };
  }

  const id = `SG${deps.allocate('suggestion')}`;
  const at = instant(deps.nowMs);
  /* THE KIND OF CHANGE IT IS, STAMPED HERE AND NEVER TAKEN FROM THE PROPOSER, for `costOf`'s reason: a proposer that
     named its own kind would name the one it is trusted with. Worked out from the body as it is stored, after the
     record's own egress lines replaced any it sent, so what it sends out is on the floor (`change-kind.ts`). */
  const kind = stampOf(kindsOfProposal(p.body_kind, body, recordReader(deps.sql, by)));
  deps.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, drafted_by, kind, cause) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)",
    id,
    p.body_kind,
    JSON.stringify(body),
    by,
    at,
    drafted ?? null,
    kind,
    cause,
  );
  /* THE QUESTION GOES IN `to_v`, WHICH IS WHERE 45 §5.4 PUTS IT — and `note` is capped at 280 by
     the rule that a note is one sentence a human reads in six weeks. A question is not a note: it is
     the thing being asked, the `suggestion` table has no column for it, and this event is the only
     copy. So a question over 280 characters was silently cut here and the cut version became the
     immutable `decision.question` — the record's permanent answer to "what was asked", wrong, with
     the original nowhere. */
  event(deps, at, by, 'suggest', `suggestion:${id}`, 'suggestion', p.question);
  /* WHY IT IS BACK, under the question, after the `suggest` event, which `questionOf` skips. Only
     when an answer was set aside: an `again` on a cause nobody answered says nothing the question does not. */
  if (memory !== null && p.again !== undefined) event(deps, at, by, 'note', `suggestion:${id}`, 'suggestion', AGAIN, p.again.trim());
  /* AND WHO DECIDES IT, written as `handQuestion` writes it, so an agent's question that names Ada arrives already hers. */
  if (p.decider !== undefined) handEvent(deps, at, by, id, p.decider);
  /* AND WHAT IT COVERS, the ids in `to_v` and the questions in words in the note, which the card can say. */
  if (p.covers !== undefined) {
    const ids = [...new Set(p.covers)];
    const said = ids.map((c) => `“${(questionOf(deps.sql, c) ?? c).replace(/\?+\s*$/u, '')}”`).join(', ');
    event(deps, at, by, 'note', `suggestion:${id}`, 'suggestion', `${COVERS}${ids.join(',')}`, `Answers ${said} too.`);
  }
  /* BRAINDOG'S OWN ARRANGING NEEDS NO PRESS, being small and reversible: a question that only moves the owner's own rows
     and can be undone is answered now, marked, with its Undo. Anything else, or a refusal, stays the open question it was. */
  if (p.body_kind === 'rowset' && deps.settle && handledFault(deps.sql, { body_kind: p.body_kind, body: JSON.stringify(body), opened_by: by }) === null) {
    const done = deps.settle(id);
    if (done.ok) return ok({ id, handled: true });
  }
  return ok({ id });
}

/** What a note holds in `to_v` when it is the proposer's word on what changed since the person last answered. */
const AGAIN = 'again';

/** The most `again` may say: one sentence, as a note is. */
const AGAIN_BYTES = 280;

/** Whether an open question holds `cause`. */
const openWith = (sql: Sql, cause: string): boolean => sql.one('SELECT 1 AS y FROM suggestion WHERE status = ? AND cause = ?', 'open', cause) != null;

/**
 * What the person last said to `cause`, when it was a no or a pick, or `null` when they have not answered it, or said yes.
 *
 * THE NEWEST ANSWERED QUESTION WITH THE CAUSE, read through `suggestion_cause_closed` (migration 37), because a decline
 * by `wont-fix` or `incorrect` writes no decision row and `decision_cause` cannot find it; its `resolve` event carries
 * the day and the reason. THE NEWEST ONE DECIDES: one taken back by the agent, or closed because the rows already said
 * it, is not an answer, and it leaves no memory rather than handing back an older no that the ask it closed had set
 * aside. An accept of anything but options is no memory: the rows now hold it and C07's rule refuses the same ask
 * (`NOTHING_TO_DECIDE`), or they moved since and asking again is fair.
 *
 * AND ONLY FOR WHAT THAT QUESTION REACHED. A cause is the filer's key, and a script keeps one key for every month it
 * asks: a pick about Rent and Phone is no answer to the same ask about Gym, so an ask that reaches an entry or a part
 * the answered one did not is asked (`reaches`).
 */
function remembered(deps: GovernDeps, cause: string, kind: BodyKind, body: Record<string, unknown>): Filed | null {
  const sql = deps.sql;
  const q = sql.one<{ id: string; body_kind: string; body: string; resolved_as: string | null; opened_by: string }>(
    "SELECT id, body_kind, body, resolved_as, opened_by FROM suggestion WHERE cause = ? AND status <> 'open' ORDER BY opened_at DESC, rowid DESC LIMIT 1",
    cause,
  );
  if (!q || !['wont-fix', 'incorrect', 'addressed'].includes(q.resolved_as ?? '')) return null;
  const was = parse(q.body);
  if (q.body_kind !== kind || !was) return null;
  const before = reaches(deps, kind, was);
  const resolved = sql.one<{ ts: string; note: string | null; batch: string | null; actor: string }>(
    "SELECT ts, note, batch, actor FROM event WHERE kind = 'resolve' AND target = ? ORDER BY rowid DESC LIMIT 1",
    `suggestion:${q.id}`,
  );
  /* AN ENTRY THE PICK LEFT IS NOT ANSWERED (`applyPatches`): it changed after it was asked and nothing was written to it,
     so asking about it again is a new ask, not the same one. */
  if (kind === 'options' && q.resolved_as === 'addressed' && resolved?.batch) for (const r of leftBy(deps, was, resolved.batch)) before.delete(r);
  for (const r of reaches(deps, kind, body)) if (!before.has(r)) return null;
  /* A PERSON'S ANSWER ONLY. A rule closing its own ask when its run ended (`flow.ts`), Slash, or the asker itself said
     nothing about the question, and remembering that as a no would silence a fair ask. */
  if (!resolved || resolved.actor.startsWith('rule:') || resolved.actor === SLASH || resolved.actor === q.opened_by) return null;
  const reason = (words: string | null | undefined): string => (words?.trim() && !pressedOnly(words) ? words.trim() : 'No reason was given.');
  if (q.resolved_as !== 'addressed') return { id: q.id, answered: { said: 'No', reason: reason(resolved.note), at: resolved.ts } };
  /* AN ANSWER WITH A DECISION BEHIND IT: the decision written in the same batch as the `resolve`. */
  const d = resolved.batch === null
    ? null
    : sql.one<{ answer: string; reason: string | null; ts: string }>(
        "SELECT d.answer AS answer, d.reason AS reason, d.ts AS ts FROM event e JOIN decision d ON e.target = 'decision:' || d.id WHERE e.kind = 'decide' AND e.batch = ? ORDER BY e.rowid DESC LIMIT 1",
        resolved.batch,
      );
  if (!d) return null;
  if (q.body_kind === 'options') {
    const options = listOf(parse(q.body)?.options).filter(isMap);
    const label = options.find((o) => o.id === d.answer)?.label;
    return { id: q.id, answered: { said: typeof label === 'string' && label.trim() ? label.trim() : d.answer, reason: reason(d.reason), at: d.ts } };
  }
  return d.answer === 'reject' ? { id: q.id, answered: { said: 'No', reason: reason(d.reason), at: d.ts } } : null;
}

/**
 * What an ask reaches, as keys to compare: each entry a rowset or an option changes, with the change, by row id so a
 * spoken id and a row id agree; each entry a rowset makes; each part of an arrangement. Empty for the kinds that reach
 * nothing of the kind, whose cause alone says what they ask.
 */
function reaches(deps: GovernDeps, kind: string, body: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const entry = (list: string, r: Record<string, unknown>) =>
    out.add(typeof r.at === 'string' ? canon([deps.row(list, r.at)?.id ?? `${list}:${r.at}`, r.patch ?? null]) : canon([list, r]));
  if (kind === 'rowset' && typeof body.register === 'string') for (const r of listOf(body.rows).filter(isMap)) entry(body.register, r);
  if (kind === 'options')
    for (const o of listOf(body.options).filter(isMap)) {
      const lists = o.patches === undefined ? null : patchLists(o.patches, 'patches');
      if (lists?.ok) for (const [list, rows] of lists.value) for (const r of rows) entry(list, r);
    }
  if (arranging(kind as BodyKind)) for (const part of partsOf(body)) out.add(part.id);
  return out;
}

/**
 * The reach keys of the picked option's entries that its decision did not write: the pick is the option decided in
 * `batch`, and an entry is written when an event of that batch names it.
 */
function leftBy(deps: GovernDeps, body: Record<string, unknown>, batch: string): string[] {
  const answer = deps.sql.one<{ answer: string }>(
    "SELECT d.answer AS answer FROM event e JOIN decision d ON e.target = 'decision:' || d.id WHERE e.kind = 'decide' AND e.batch = ? ORDER BY e.rowid DESC LIMIT 1",
    batch,
  )?.answer;
  const picked = listOf(body.options).find((o) => isMap(o) && o.id === answer);
  const lists = isMap(picked) && picked.patches !== undefined ? patchLists(picked.patches, 'patches') : null;
  if (!lists?.ok) return [];
  const out: string[] = [];
  for (const [list, rows] of lists.value)
    for (const r of rows) {
      const id = typeof r.at === 'string' ? deps.row(list, r.at)?.id : undefined;
      if (id !== undefined && deps.sql.one('SELECT 1 AS y FROM event WHERE batch = ? AND target = ? LIMIT 1', batch, `entry:${id}`) != null) continue;
      out.push(canon([id ?? `${list}:${String(r.at)}`, r.patch ?? null]));
    }
  return out;
}

/**
 * The sentence an agent passes on when its proposal was answered from memory: what was said, the day, the reason, and
 * how to ask again. It names `again` every time, so an answer that has gone stale is never the last word.
 */
export function rememberedLine(a: Remembered): string {
  const day = new Date(a.at);
  const when = Number.isFinite(day.getTime()) ? day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : a.at.slice(0, 10);
  const said = a.said === 'No' ? 'This was declined' : `This was answered "${a.said}"`;
  const why = a.reason === 'No reason was given.' ? 'No reason was given.' : `The reason: ${a.reason.replace(/[.\s]+$/u, '')}.`;
  return `${said} on ${when}. ${why} Nothing was filed. If something has changed, propose it again and say what in again.`;
}

/** A row's fields as they stand, by its list and its spoken id or row id, or `null` for a row that is not there or is gone. */
function heldFields(deps: GovernDeps, register: string, at: string): Record<string, unknown> | null {
  const row = deps.row(register, at);
  if (!row || row.deleted) return null;
  const fields = deps.sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', row.id)?.fields;
  return typeof fields === 'string' ? parse(fields) : null;
}

/**
 * The open question this proposal already is, or `null` when it is new.
 *
 * THE SAME CAUSE IS THE SAME QUESTION, whoever asks: an open one holding it is answered with `joined` and nothing is
 * filed, so two agents proposing one change make one card. A deferred question is still open, and is joined.
 *
 * A ROWSET THAT NAMES ROWS THE OPEN ONE LACKS ADDS THEM TO IT, when both causes are derived, they are about one list,
 * share at least one row asked for word for word, and ask nothing different of any row both name. A cause its filer
 * set is never widened or widened into: the filer said what the question is about, and this would be guessing.
 *
 * A JOIN IS WRITTEN DOWN, as one note on the question by the agent that joined (`JOINED`), so the question is known to
 * be shared: `withdraw` reads it and keeps the question open for the owner. Before this nothing was written, and the
 * opener taking its question back took the joiner's with it. The opener asking again, or a later run of its key, is
 * the same agent and writes nothing; an agent joining twice writes once.
 */
function askedAlready(deps: GovernDeps, by: string, p: Proposal, body: Record<string, unknown>, cause: string | null): Result<Filed | null> {
  if (cause !== null) {
    const held = deps.sql.one<{ id: string; opened_by: string; body_kind: string; body: string }>(
      "SELECT id, opened_by, body_kind, body FROM suggestion WHERE status = 'open' AND cause = ?",
      cause,
    );
    if (held) {
      /* ONE OPEN ARRANGEMENT PER CAUSE, AND IT CARRIES THE WHOLE LIST. A second arrangement with the
         cause adds the parts the open one lacks to it, so an agent that finds a fourth key to ask for does not wait for
         the first three to be answered, and the owner reads one card. */
      if (held.body_kind === 'arrange' && p.body_kind === 'arrange') {
        const wider = widenArrangement(deps, held, body, by, cause);
        if (wider !== null) return wider;
      }
      /* THE SAME ASKER'S OPTIONS ARE ASKED AS THEY ARE NOW. A script asking nightly under one cause joined the question it
         first filed and left it as it was, so the entries it named at the versions of that night went stale one by one
         and the question could only ever be refused. Its newer reading takes the old one's place, words and changes, and
         the question keeps its id and its history. */
      if (held.body_kind === 'options' && p.body_kind === 'options' && sameAsker(deps.sql, held.opened_by, by) && canon(parse(held.body)) !== canon(body)) {
        const kind = stampOf(kindsOfProposal('options', body, recordReader(deps.sql, held.opened_by)));
        deps.sql.exec('UPDATE suggestion SET body = ?, kind = ? WHERE id = ?', JSON.stringify(body), kind, held.id);
        if (p.question.trim() !== questionOf(deps.sql, held.id)) event(deps, instant(deps.nowMs), by, 'suggest', `suggestion:${held.id}`, 'suggestion', p.question);
        return ok({ id: held.id, joined: true });
      }
      if (!sameAsker(deps.sql, held.opened_by, by) && joinersOf(deps.sql, held.id).every((j) => !sameAgent(deps.sql, j, by)))
        event(deps, instant(deps.nowMs), by, 'note', `suggestion:${held.id}`, 'suggestion', JOINED, 'Asked the same thing too, and joined this question instead of asking again.');
      return ok({ id: held.id, joined: true });
    }
  }
  if (p.body_kind !== 'rowset' || p.cause !== undefined || cause === null) return ok(null);

  const register = String(body.register);
  const rows = body.rows as Record<string, unknown>[];
  const prefix = `rowset#${register}#`;
  const open = deps.sql.all<{ id: string; body: string; cause: string; opened_by: string }>(
    "SELECT id, body, cause, opened_by FROM suggestion WHERE status = 'open' AND body_kind = 'rowset' AND substr(cause, 1, ?) = ? ORDER BY opened_at, rowid",
    prefix.length,
    prefix,
  );
  for (const q of open) {
    const theirs = parse(q.body);
    if (!theirs || !Array.isArray(theirs.rows) || causeOf('rowset', theirs) !== q.cause) continue;
    const asks = new Map((theirs.rows as Record<string, unknown>[]).map((r) => [rowKey(r), rowAsk(r)]));
    const both = rows.filter((r) => asks.has(rowKey(r)));
    if (both.length === 0 || both.some((r) => asks.get(rowKey(r)) !== rowAsk(r))) continue;
    const lacking = rows.filter((r) => !asks.has(rowKey(r)));
    if (lacking.length === 0 || asks.size + lacking.length > MAX_ROWS) continue;

    const wider = { ...theirs, rows: [...(theirs.rows as unknown[]), ...lacking] };
    const widerCause = causeOf('rowset', wider);
    if (widerCause !== null && deps.sql.one('SELECT 1 AS y FROM suggestion WHERE status = ? AND cause = ? AND id <> ?', 'open', widerCause, q.id)) continue;
    const kind = stampOf(kindsOfProposal('rowset', wider, recordReader(deps.sql, q.opened_by)));
    deps.sql.exec('UPDATE suggestion SET body = ?, cause = ?, kind = ? WHERE id = ?', JSON.stringify(wider), widerCause, kind, q.id);
    const more = lacking.length === 1 ? 'one more thing, and added it' : `${lacking.length} more things, and added them`;
    event(deps, instant(deps.nowMs), by, 'note', `suggestion:${q.id}`, 'suggestion', String(lacking.length), `Asked the same of ${more} to this question.`);
    return ok({ id: q.id, joined: true, widened: lacking.length });
  }
  return ok(null);
}

/**
 * The open arrangement `held` widened with the parts `next` adds, or `null` when it adds none and is a plain join.
 *
 * CHECKED WHOLE BEFORE IT IS STORED, as the record's `prepare` checked each half: twelve of each thing and sixty entries
 * hold for the union too, and a union past them is refused in the proposer's words with nothing changed. The kind is
 * stamped again, because what accepting would do is now more.
 */
function widenArrangement(
  deps: GovernDeps,
  held: { id: string; opened_by: string; body: string },
  next: Record<string, unknown>,
  by: string,
  cause: string,
): Result<Filed> | null {
  const open = parse(held.body);
  if (!open) return null;
  const union = uniteArrangements(open, next);
  if (union === null) return null;
  const wrong = checkArranging(deps, 'arrange', union.body, cause);
  if (wrong) return { ok: false, refusal: { ...wrong, fix: `Added to the arrangement already waiting for this, it would be too much. ${wrong.fix}` } };
  const kind = stampOf(kindsOfProposal('arrange', union.body, recordReader(deps.sql, held.opened_by)));
  deps.sql.exec('UPDATE suggestion SET body = ?, kind = ? WHERE id = ?', JSON.stringify(union.body), kind, held.id);
  const more = union.added === 1 ? 'one more part, and added it' : `${union.added} more parts, and added them`;
  /* ONE NOTE, whose value is the count, so `joinersOf` reads it as a join, as a widened rowset's is. */
  event(deps, instant(deps.nowMs), by, 'note', `suggestion:${held.id}`, 'suggestion', String(union.added), `Asked for ${more} to this question.`);
  return ok({ id: held.id, joined: true, widened: union.added });
}

/** What an arrangement holds besides its parts, which the open one keeps as it is. */
const UNITED_KEYS = new Set(['packs', 'plan', 'pages', 'settings', 'declarations', 'parts', 'rows', 'names', 'approve', 'why', 'needs', 'alongside']);

/**
 * Two arrangements with one cause as one: the open one whole, then every part of `next` it does not hold, or `null`
 * when it holds them all. `added` is how many parts that is.
 *
 * BY PART, AS AN ACCEPT TAKES THEM (`partsOf`). A part the open one already holds stays as the open one asks it, so what
 * the owner may already have read on the card does not change under them; only what is new is added. The reasons, what
 * it needs and the calls out it shows are the two lists together, each said once. Entries keep pointing at each other
 * by place, moved past the open one's (`mergeArrangement`).
 */
export function uniteArrangements(open: Record<string, unknown>, next: Record<string, unknown>): { body: Record<string, unknown>; added: number } | null {
  const held = new Set(partsOf(open).map((p) => p.id));
  const fresh = partsOf(next)
    .map((p) => p.id)
    .filter((id) => !held.has(id));
  if (fresh.length === 0) return null;
  const merged = mergeArrangement(narrowArrangement(next, new Set(fresh)), open);
  for (const [key, value] of Object.entries(open)) if (!UNITED_KEYS.has(key)) merged[key] = value;
  for (const key of Object.keys(merged)) if (!UNITED_KEYS.has(key) && !(key in open)) delete merged[key];
  const once = (key: string) => {
    const seen = new Set<string>();
    const out = [...listOf(open[key]), ...listOf(next[key])].filter((x) => {
      const k = canon(x);
      return seen.has(k) ? false : (seen.add(k), true);
    });
    if (out.length > 0) merged[key] = key === 'why' ? out.slice(0, ARRANGE_CEILING) : out;
  };
  for (const key of ['why', 'needs', 'alongside']) once(key);
  return { body: merged, added: fresh.length };
}

/** Which row a rowset row is about: an update by its target, a new row by everything it says. */
const rowKey = (r: Record<string, unknown>): string => (typeof r.at === 'string' ? `at:${r.at}` : `new:${canon(r)}`);

/** What a rowset row asks of the row it is about. A new row is all key and asks nothing besides. */
const rowAsk = (r: Record<string, unknown>): string => (typeof r.at === 'string' ? canon(r.patch ?? null) : '');

/** The spoken id of a run, `S12`, and its number. A run is the one opener that has a key and a later run of it. */
const RUN_ID = /^S([1-9]\d*)$/u;

/**
 * Take back a question its opener no longer asks.
 *
 * ONLY THE OPENER'S, AND ONLY WHILE IT IS OPEN. The run that filed it may, and so may a later run of the same key: a
 * session that ends and starts again is the same agent asking, and the question it left is still its own. Another
 * agent's run, a person, or an earlier run of the key may not, because taking back somebody else's question is
 * answering it, and answering is the owner's. A question already answered or merged is not withdrawn;
 * one put off is still open, and is.
 *
 * NOT ONCE ANOTHER AGENT HAS JOINED IT. A question another agent asked too is that agent's ask as well, and taking it
 * back would close an ask nobody took back: it stays open for the owner, and the opener is told so. With no join it is
 * withdrawn as before.
 *
 * IT CLOSES AS `withdrawn`, which is neither a yes nor a no: no decision is written, the ladder does not count it
 * against the agent as it counts `incorrect`, and the line in history says who took it back.
 */
export function withdraw(sql: Sql, deps: Pick<GovernDeps, 'mint'>, id: string, by: string, nowMs: number): Result<{ id: string; state: 'withdrawn' }> {
  type Out = { id: string; state: 'withdrawn' };
  const row = sql.one<{ status: string; resolved_as: string | null; opened_by: string }>('SELECT status, resolved_as, opened_by FROM suggestion WHERE id = ?', id);
  if (!row) return no<Out>('OUT_OF_BOUNDS', `There is no question ${id}.`, { at: 'id' });
  if (row.status !== 'open')
    return no<Out>('TRANSITION_ILLEGAL', `${id} is already closed as ${row.resolved_as ?? row.status}, so there is nothing to take back.`, { at: 'id' });
  if (!mayWithdraw(sql, row.opened_by, by))
    return no<Out>('FORBIDDEN', `${id} was asked by another agent, so only that agent can take it back. Otherwise it waits for the owner's answer.`, { at: 'id' });
  if (joinersOf(sql, id).some((j) => !sameAgent(sql, row.opened_by, j) && !sameAgent(sql, by, j)))
    return no<Out>('FORBIDDEN', 'Another agent asked the same thing, so it stays open for the owner.', { at: 'id' });
  takeBack({ sql, mint: deps.mint }, id, by, instant(nowMs), 'Taken back by the agent that asked it.');
  return ok({ id, state: 'withdrawn' });
}

/** Close an open question as `withdrawn`, signed by `by`, with the line history reads. No decision is written. */
function takeBack(deps: Pick<GovernDeps, 'sql' | 'mint'>, id: string, by: string, at: string, note: string): void {
  deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'withdrawn' WHERE id = ? AND status = 'open'", id);
  event(deps, at, by, 'resolve', `suggestion:${id}`, 'suggestion', 'withdrawn', note);
}

/* ── an asker takes back its own suggestion ─────────────────────── */

/** The most an arrangement's `rank` says: the recommender's strength for it, a whole number from 0. */
const RANK_MOST = 1000;
/** A day as an arrangement's `lapses` spells it. */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
/** The line under one a stronger suggestion took the place of. */
export const DISPLACED_NOTE = 'Taken back: a stronger suggestion took its place.';
/** The line under one nobody answered by its day, `day` being the day it was taken back. */
export const lapsedNote = (day: string): string => `Taken back on ${spokenDay(day)}: nobody answered it.`;

/** `2026-10-14` as a person says it, "14 October". */
const spokenDay = (day: string): string => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(`${day}T12:00:00Z`));

/** Whether `s` is a real day, `YYYY-MM-DD`: the 31st of September is not one. */
const isDay = (s: string): boolean => DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Today in the record's own zone, UTC for a record that has not said one. */
const todayIn = (deps: Pick<GovernDeps, 'sql' | 'nowMs'>): string => dayIn(deps.nowMs, recordIdentity(deps.sql)?.tz);

/**
 * What is wrong with an arrangement's `rank` or `lapses`, or `null`. With `today`, a `lapses` before it is wrong too:
 * a suggestion is filed with a day still to come, while one already waiting keeps its day when it is widened.
 */
function offerFault(body: Record<string, unknown>, today: string | null): Refusal | null {
  const rank = body.rank;
  if (rank !== undefined && !(typeof rank === 'number' && Number.isInteger(rank) && rank >= 0 && rank <= RANK_MOST))
    return { code: 'VALUE_MALFORMED', fix: `rank is how strong this suggestion is, a whole number from 0 to ${RANK_MOST}, or leave it out.`, at: 'body.rank' };
  const lapses = body.lapses;
  if (lapses === undefined) return null;
  const from = today === null ? '' : ` from today, ${today},`;
  if (typeof lapses !== 'string' || !isDay(lapses) || (today !== null && lapses < today))
    return { code: 'VALUE_MALFORMED', fix: `lapses is the day it is taken back if nobody answers it, a real day as YYYY-MM-DD${from} or leave it out.`, at: 'body.lapses' };
  return null;
}

/** An arrangement's rank, or -1 for one that carries none, so it is the weakest. */
const rankOf = (body: string): number => {
  const rank = parse(body)?.rank;
  return typeof rank === 'number' && Number.isInteger(rank) ? rank : -1;
};

/**
 * Whether `opener` may sign the take-back of its own question. Slash signs only what `slashMayWrite` lets it, so until
 * that lets it sign a withdrawn close, Slash's own suggestions wait for the owner as they always did.
 */
function maySign(opener: string): boolean {
  try {
    slashMayWrite(opener, 'resolve', { kind: 'withdrawn' });
    return true;
  } catch {
    return false;
  }
}

/** Whether only its opener asks a question: nobody else joined it, so taking it back closes nobody else's ask. */
const onlyItsOpeners = (sql: Sql, id: string, opener: string): boolean => joinersOf(sql, id).every((j) => sameAgent(sql, opener, j));

/** The open arrangements a new one is counted against: every one but the one holding its cause, which it joins. */
const openArrangements = (sql: Sql, cause: string | null) =>
  sql.all<{ id: string; opened_by: string; body: string }>(
    "SELECT id, opened_by, body FROM suggestion WHERE body_kind = 'arrange' AND status = 'open' AND (? IS NULL OR cause IS NOT ?) ORDER BY rowid",
    cause,
    cause,
  );

/** The refusal at the cap, as it has always read. */
const capRefusal = (open: readonly { id: string }[]): Refusal => ({
  code: 'OUT_OF_BOUNDS',
  fix: `${open.map((o) => o.id).join(', ')} already wait on the person, and ${OPEN_ARRANGEMENTS} open arrangements is the most. Wait until one is answered, then propose again.`,
  at: 'body_kind',
});

/**
 * Room for one more arrangement from `by`: nothing to do under the cap; at it, the weakest of `by`'s own open ones is
 * taken back when the new one outranks it, and otherwise the filing is refused as it always was.
 *
 * ONLY ITS OWN, AND ONLY ONE NOBODY ELSE JOINED. Taking back another agent's or a person's question is answering it,
 * which is the owner's. A new one with no rank outranks nothing. Ties go to the oldest. In the filing's own write, so a
 * filing refused later takes nothing back.
 */
function makeRoom(deps: GovernDeps, by: string, body: Record<string, unknown>, cause: string | null): Refusal | null {
  const open = openArrangements(deps.sql, cause);
  if (open.length < OPEN_ARRANGEMENTS) return null;
  const rank = typeof body.rank === 'number' ? body.rank : -1;
  const weakest = open
    .filter((o) => sameAgent(deps.sql, o.opened_by, by) && maySign(o.opened_by) && onlyItsOpeners(deps.sql, o.id, o.opened_by))
    .map((o) => ({ ...o, rank: rankOf(o.body) }))
    .reduce<{ id: string; opened_by: string; rank: number } | null>((w, o) => (w === null || o.rank < w.rank ? o : w), null);
  if (rank < 0 || weakest === null || weakest.rank >= rank) return capRefusal(open);
  takeBack(deps, weakest.id, weakest.opened_by, instant(deps.nowMs), DISPLACED_NOTE);
  return null;
}

/**
 * Take back every open arrangement nobody answered by its `lapses` day: one whose day is before today in `tz`.
 *
 * BY ITS OWN OPENER, AS `withdraw` IS, and so neither a yes nor a no: it closes as `withdrawn`, no decision is written, and
 * the brake and the ladder read nothing from it. One the person put off past today waits for that day; one another agent
 * joined stays open for the owner. It writes no row, asks nothing and files nothing.
 */
export function sweepLapsed(deps: Pick<GovernDeps, 'sql' | 'mint'>, nowMs: number, tz: string): { withdrawn: string[] } {
  const today = dayIn(nowMs, tz);
  const at = instant(nowMs);
  const withdrawn: string[] = [];
  const open = deps.sql.all<{ id: string; opened_by: string; body: string }>(
    "SELECT id, opened_by, body FROM suggestion WHERE body_kind IN ('arrange', 'rowset') AND status = 'open' AND (defer_until IS NULL OR defer_until <= ?) ORDER BY rowid",
    at,
  );
  for (const o of open) {
    const lapses = parse(o.body)?.lapses;
    if (typeof lapses !== 'string' || !isDay(lapses) || lapses >= today) continue;
    if (!maySign(o.opened_by) || !onlyItsOpeners(deps.sql, o.id, o.opened_by)) continue;
    takeBack(deps, o.id, o.opened_by, at, lapsedNote(today));
    withdrawn.push(o.id);
  }
  return { withdrawn };
}

/* ── a question that can no longer apply withdraws itself ─────────────── */

/** The line under a question whose rows changed since it was asked, so no answer could do what it asked. */
export const CHANGED_NOTE = 'Taken back: what it asked about changed since, so it no longer applies.';
/** The line under a question whose rows, or the row it is about, are gone. */
export const GONE_NOTE = 'Taken back: what it asked about is gone.';

/** How many open questions one sweep reads, so an hour's tick costs the same whatever the queue holds. */
const STALE_BOUND = 200;

/**
 * Why an open question can no longer apply, as the line it closes with, or `null` while it still can.
 *
 *   - a rowset that updates a row that is gone, or one that moved since it was asked in a way `moved` cannot carry it
 *     over (a field it changes was written since to another value, or what moved the row is not in the log): accepting
 *     it is refused, and would be refused for ever;
 *   - a choice whose every option that writes would leave every entry it names, each gone or changed the same way:
 *     whatever is picked writes nothing of what was asked;
 *   - a question about one row (`about`, a spoken id) whose row is deleted.
 *
 * EXACT, AND A MISS ONLY MEANS IT WAITS. A row that moved where the question's fields did not is carried over at the
 * press (`moved`), so it is not stale here; a question a rule or an agent can no longer apply is never answered for
 * anybody: it is taken back, with no decision written and nothing observed against whoever asked.
 */
export function staleWhy(deps: Pick<GovernDeps, 'sql' | 'row'>, q: { id: string; body_kind: string; body: unknown }): string | null {
  const body = isMap(q.body) ? q.body : typeof q.body === 'string' ? parse(q.body) : null;
  if (body === null) return null;
  /* ONE UPDATE ROW: `gone`, `changed`, or `null` when an answer can still write it. */
  const rowFate = (list: string, r: Record<string, unknown>): 'gone' | 'changed' | null => {
    if (typeof r.at !== 'string') return null;
    const row = deps.row(list, r.at);
    if (!row || row.deleted) return isMap(r.patch) && Object.hasOwn(r.patch, 'deleted_at') ? null : 'gone';
    if (typeof r.version !== 'number') return null;
    const now = deps.sql.one<{ version: number }>('SELECT version FROM entry WHERE id = ?', row.id);
    if (!now || now.version === r.version) return null;
    const met = moved(deps as GovernDeps, q.id, list, r);
    return met === null || !met.ok ? 'changed' : null;
  };
  const about = typeof body.about === 'string' ? /^([a-z][a-z0-9_]{0,31})#[1-9]\d*$/u.exec(body.about) : null;
  if (about !== null) {
    const row = deps.row(about[1]!, body.about as string);
    if (row !== null && row.deleted) return GONE_NOTE;
  }
  if (q.body_kind === 'rowset' && typeof body.register === 'string') {
    const register = body.register;
    const fates = listOf(body.rows)
      .filter(isMap)
      .map((r) => rowFate(typeof r.register === 'string' ? r.register : register, r));
    if (fates.includes('gone')) return GONE_NOTE;
    if (fates.includes('changed')) return CHANGED_NOTE;
    return null;
  }
  if (q.body_kind === 'options') {
    const writing = listOf(body.options).filter((o): o is Record<string, unknown> => isMap(o) && o.patches !== undefined);
    if (writing.length === 0) return null;
    const fates = writing.map((o) => {
      const lists = patchLists(o.patches, 'patches');
      if (!lists.ok) return null;
      const each = [...lists.value].flatMap(([list, rows]) => rows.map((r) => rowFate(list, r)));
      if (each.length === 0 || each.some((f) => f === null)) return null;
      return each.every((f) => f === 'gone') ? 'gone' : 'changed';
    });
    if (fates.some((f) => f === null)) return null;
    return fates.every((f) => f === 'gone') ? GONE_NOTE : CHANGED_NOTE;
  }
  return null;
}

/**
 * Take back each open question that can no longer apply (`staleWhy`), signed by the record (`system`) with the line that
 * says why, so it leaves Needs you on its own instead of waiting for ever. The hourly sweep runs it after `recheck`.
 * Bounded and turning as `recheck` is. Run it inside the caller's transaction.
 */
export function sweepStale(deps: Pick<GovernDeps, 'sql' | 'row' | 'mint'>, nowMs: number): { withdrawn: string[] } {
  const open = "status = 'open' AND body_kind IN ('rowset', 'options')";
  const total = deps.sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM suggestion WHERE ${open}`)?.n ?? 0;
  if (total === 0) return { withdrawn: [] };
  type Open = { id: string; body_kind: string; body: string };
  const read = (offset: number, limit: number): Open[] =>
    limit <= 0 ? [] : deps.sql.all<Open>(`SELECT id, body_kind, body FROM suggestion WHERE ${open} ORDER BY opened_at ASC, id ASC LIMIT ? OFFSET ?`, limit, offset);
  const from = total <= STALE_BOUND ? 0 : (Math.floor(nowMs / 3_600_000) * STALE_BOUND) % total;
  const walked = [...read(from, STALE_BOUND), ...read(0, Math.min(from, from + STALE_BOUND - total))];
  const at = instant(nowMs);
  const withdrawn: string[] = [];
  for (const q of walked) {
    const why = staleWhy(deps, q);
    if (why === null) continue;
    takeBack(deps, q.id, 'system', at, why);
    withdrawn.push(q.id);
  }
  return { withdrawn };
}

/** What a join note holds in `to_v`, so a join is told from any other note on the question. */
const JOINED = 'joined';

/**
 * Who joined a question: each actor of a join note, or of a widening note (whose `to_v` is the count of rows it added,
 * so a widening is a join too). Other notes on a question, such as an answer the door could not carry out, are not.
 */
function joinersOf(sql: Sql, id: string): string[] {
  return sql
    .all<{ actor: string }>(
      "SELECT DISTINCT actor FROM event WHERE kind = 'note' AND target = ? AND (to_v = ? OR to_v GLOB '[1-9]*') ORDER BY actor",
      `suggestion:${id}`,
      JOINED,
    )
    .map((r) => r.actor);
}

/** Whether two actors are one agent: the same actor, or two runs of the same key. */
function sameAgent(sql: Sql, a: string, b: string): boolean {
  if (a === b) return true;
  if (!RUN_ID.test(a) || !RUN_ID.test(b)) return false;
  const key = tokenOfRun(sql, a);
  return key !== null && tokenOfRun(sql, b) === key;
}

/** Whether two openers are one asker: one agent (`sameAgent`), or one script at any of its versions (`script:<id>@v2`). */
function sameAsker(sql: Sql, a: string, b: string): boolean {
  const script = (x: string): string | null => (x.startsWith('script:') ? x.replace(/@v\d+$/u, '') : null);
  return sameAgent(sql, a, b) || (script(a) !== null && script(a) === script(b));
}

/** Whether `by` is the run that opened a question, or a later run of the same key. */
function mayWithdraw(sql: Sql, opener: string, by: string): boolean {
  if (by === opener) return true;
  const a = RUN_ID.exec(opener)?.[1];
  const b = RUN_ID.exec(by)?.[1];
  if (a === undefined || b === undefined || Number(b) < Number(a)) return false;
  const key = tokenOfRun(sql, opener);
  return key !== null && tokenOfRun(sql, by) === key;
}

/**
 * What an option IS, drawn beside its label: its colours, a figure, or a file the record holds.
 *
 * A SWATCH IS THE ONE PLACE A COLOUR FROM DATA REACHES A SCREEN, so it is held to one spelling, six hex digits, which a
 * drawer can put into a box and nothing else: a value it did not check could close the box and write a style. It is the
 * option's CONTENT (which lining), drawn only inside that option, never a colour the page is drawn in (`06 §7`). A file
 * is one the record already holds, named by row and field; a remote image is refused as a page's is (`06 §7`).
 */
export type Shows = { swatch: string[] } | { figure: string } | { file: { row: string; field: string } };

const SWATCH = /^#[0-9a-fA-F]{6}$/u;
const SWATCH_MOST = 8;
const FIGURE_BYTES = 80;
const ABOUT_BYTES = 80;
const SHOWS_SAID = `An option shows one thing: { swatch: ['#rrggbb'] } with one to ${SWATCH_MOST} colours, { figure: 'text' } of at most ${FIGURE_BYTES} bytes, or { file: { row: 'parts#2', field: 'photo' } }.`;

/** The option's `shows`, checked, or `null` when it is not one of the three shapes. Read on filing and again on the way out. */
export function showsOf(value: unknown): Shows | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (keys.length !== 1) return null;
  if (Array.isArray(v.swatch)) {
    const s = v.swatch as unknown[];
    return s.length >= 1 && s.length <= SWATCH_MOST && s.every((c) => typeof c === 'string' && SWATCH.test(c)) ? { swatch: [...(s as string[])] } : null;
  }
  if (typeof v.figure === 'string')
    return v.figure.trim() !== '' && new TextEncoder().encode(v.figure).length <= FIGURE_BYTES ? { figure: v.figure } : null;
  const f = v.file as Record<string, unknown> | undefined;
  if (f !== null && typeof f === 'object' && !Array.isArray(f) && Object.keys(f).length === 2 && typeof f.row === 'string' && typeof f.field === 'string')
    return /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u.test(f.row) && /^[a-z][a-z0-9_]*$/u.test(f.field) ? { file: { row: f.row, field: f.field } } : null;
  return null;
}

function checkBody(deps: GovernDeps, kind: BodyKind, body: Record<string, unknown>, cause: string | null = null): Refusal | null {
  const missing = (key: string): Refusal => ({
    code: 'REQUIRED_MISSING',
    fix: `A ${kind} proposal needs ${key}.`,
    at: `body.${key}`,
  });

  if (kind === 'options') {
    const options = body.options;
    /* TWO OR IT IS NOT A CHOICE. One option is an announcement wearing a question mark, and a gate
       that accepts one teaches people that answering is a formality. */
    if (!Array.isArray(options) || options.length < 2)
      return { code: 'OUT_OF_BOUNDS', fix: 'A choice is between at least two options.', at: 'body.options' };
    for (const o of options as Record<string, unknown>[]) {
      if (typeof o?.id !== 'string' || typeof o?.label !== 'string' || typeof o?.because !== 'string')
        return {
          code: 'REQUIRED_MISSING',
          fix: 'Every option carries an id, a label, and the because that is the reason to pick it.',
          at: 'body.options',
        };
      if (o.shows !== undefined && showsOf(o.shows) === null)
        return { code: 'VALUE_MALFORMED', fix: `${o.id} shows ${JSON.stringify(o.shows)}. ${SHOWS_SAID}`, at: 'body.options' };
      /* `hard` IS TRUE OR FALSE (`weigh.ts` reads only the boolean `true` as hard), so a "yes" is told and not read as easy. */
      if (o.hard !== undefined && typeof o.hard !== 'boolean')
        return { code: 'VALUE_MALFORMED', fix: `${o.id} says hard ${JSON.stringify(o.hard)}. It is true or false.`, at: 'body.options' };
    }
    for (const [n, o] of (options as Record<string, unknown>[]).entries()) {
      const bad = o.patches === undefined ? null : patchesFault(deps, o.patches, `body.options[${n}].patches`);
      if (bad) return bad;
    }
    const about = body.about;
    if (about !== undefined && (typeof about !== 'string' || about.trim() === '' || new TextEncoder().encode(about).length > ABOUT_BYTES))
      return {
        code: 'VALUE_MALFORMED',
        fix: `about is ${JSON.stringify(about)}; it is the thing the question is about, as a page filters by it, in at most ${ABOUT_BYTES} bytes: a name such as Box, or a spoken id such as parts#2.`,
        at: 'body.about',
      };
    /* `to` IS ONE MEMBER'S ID OR NOTHING, because `decide` compares it with the actor as it stands (`heldTo`); a blank
       one would put a question to nobody, which only an owner could then answer. */
    const to = body.to;
    if (to !== undefined && (typeof to !== 'string' || to.trim() === '' || to !== to.trim()))
      return { code: 'VALUE_MALFORMED', fix: `to is ${JSON.stringify(to)}; it is the id of the one member the question is put to.`, at: 'body.to' };
    return null;
  }

  if (kind === 'rowset') {
    const register = body.register;
    if (typeof register !== 'string') return missing('register');
    if (!deps.hasRegister(register))
      return { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.`, at: 'body.register' };
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) return missing('rows');
    /* A ROW IS AN OBJECT OF FIELDS. `null` cleared this check and then threw out of the write path
       at the gate — the one boundary this package promises nothing throws over. */
    if (rows.some((r) => typeof r !== 'object' || r === null || Array.isArray(r)))
      return { code: 'VALUE_MALFORMED', fix: 'Every row is an object of field ids to values.', at: 'body.rows' };
    if (rows.length > MAX_ROWS)
      return {
        code: 'OUT_OF_BOUNDS',
        fix: `A rowset is at most ${MAX_ROWS} rows, and this one is ${rows.length}. More than that is an import.`,
        at: 'body.rows',
      };
    return checkUpdates(deps, register, rows as Record<string, unknown>[]);
  }

  if (arranging(kind)) return checkArranging(deps, kind, body, cause);

  if (kind === 'pattern') {
    if (!body.ingest || typeof body.ingest !== 'object') return missing('ingest');
    const wrong = ingestFault(body.ingest);
    if (wrong) return wrong;
    /* AND THE SAMPLES IT WAS DRAWN FROM. 45 §5.4 puts `samples: [raw_id…]` in the body, and 07 §4's
       review counts hits against them — the `3/3 · 2/3 · 0/3` a reviewer reads before accepting. A
       pattern filed without them is a declaration somebody is asked to approve with nothing to check
       it against, which is the shape of proposal that gets approved because reading it is harder. */
    if (!Array.isArray(body.samples) || body.samples.length === 0)
      return {
        code: 'REQUIRED_MISSING',
        fix: 'A pattern proposal carries the arrivals it was drawn from, so whoever answers can check it against them.',
        at: 'body.samples',
      };
    return null;
  }
  if (typeof body.declaration_id !== 'string') return missing('declaration_id');
  if (!body.to || typeof body.to !== 'object') return missing('to');
  /* AND `to` IS WHAT `install` TAKES: a declaration, or `{ declarations: [...] }` of them. Asked only to be an
     object, `{ values: [...] }` was filed; accepting it committed the decision and resolved SG1 in the gate's
     transaction, and then `install([to])` threw `Cannot read properties of undefined (reading 'writes')` out of the
     record's `decide` before `reopen` could run. A decision that resolved with nothing installed behind it, from one
     malformed body any `propose` token can send. `review` below cannot catch it: it answers `null` for a batch it
     cannot read, which is right for egress and says nothing about whether the batch installs. */
  const to = resolveTo(deps.sql, body);
  if (!to.ok) return 'refusal' in to ? to.refusal : missing('to');
  /* A WHOLE BODY IS ASKED WHAT A RETIRE IS ASKED (`retiresRead`); a field-level change was asked it in `retireIn`. */
  const wrong = shapeFault(to.value.to) ?? namesFault(deps.sql, { ...body, to: to.value.to }) ?? (fieldLevel(body.to) ? null : retiresRead(deps.sql, to.value.to));
  if (wrong) return wrong;

  /* AND ITS PREDICTION, IF IT CARRIES ONE — checked here rather than at acceptance, for the reason
     every other body is checked here: the person answering should not be the one who finds out it
     was malformed. A `change` may be proposed by a person who is simply changing something, so a
     prediction is optional; one that is present has to be gradeable. */
  if (body.prediction !== undefined) {
    const wrong = checkPrediction(body.prediction);
    if (wrong) return wrong;
  }
  return null;
}

const isMap = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Whether a change's `to` is what `install` takes, for the reason given where `checkBody` asks it. */
function shapeFault(to: unknown): Refusal | null {
  const bundle = (to as { declarations?: unknown }).declarations;
  const listed = Array.isArray(bundle) ? bundle : [to];
  if (Array.isArray(to) || listed.length === 0 || !listed.every((d) => isMap(d) && typeof d.id === 'string' && typeof d.kind === 'string' && isMap(d.body)))
    return {
      code: 'VALUE_MALFORMED',
      fix: 'A change is to a whole declaration, {"id":"register.<id>","kind":"register","body":{...}}, or to {"declarations":[...]} of them.',
      at: 'body.to',
    };
  return null;
}

/** Whether a pattern's `ingest` is written as a declaration, `{ id, kind, body }`, rather than as an ingest's bare body. */
const isDeclaration = (ingest: Record<string, unknown>): boolean => 'id' in ingest || 'kind' in ingest;

/** The names a bare body carries when it is another kind's body: a rule, a script and a digest each name themselves. */
const NAMED_BODIES = ['rule', 'script', 'digest', 'metric'] as const;

/**
 * What a pattern's `ingest` is when it is not an ingest, in the words the refusal names it by, or `null` when it is one.
 *
 * AN INGEST IN EITHER OF ITS TWO SHAPES. Slash's prompt (`slash/src/prompts.ts`) asks for ONE ingest declaration BODY
 * and `slash/src/jobs.ts` once filed it bare, and files the declaration now; an agent or a person files the whole
 * declaration. A check that knew only the second would refuse every pattern Slash proposes. A bare body is told apart
 * by carrying neither `id` nor `kind`, and no ingest body carries either: `IngestDecl` and `ActionDecl` have no such
 * key, and name themselves in `ingest`.
 *
 * AND A BARE BODY IN A RULE'S SHAPE IS A RULE. Its own name says so, or its steps: `accept-rule-level.test.ts` filed a
 * rule as a pattern with its `id` and `kind` on, and taking them off must not be the way round this.
 */
function notAnIngest(ingest: unknown): string | null {
  if (Array.isArray(ingest) || (isMap(ingest) && Array.isArray(ingest.declarations))) return 'a bundle of declarations';
  if (!isMap(ingest)) return 'a value that is not a declaration';
  if (isDeclaration(ingest)) {
    /* AN EMPTY KIND IS NO KIND. Asked only to be a string, `kind: ''` was named back as "a  declaration". */
    if (typeof ingest.kind !== 'string' || ingest.kind === '') return 'a declaration with no kind';
    if (ingest.kind !== 'ingest') return `a ${ingest.kind}`;
    if (typeof ingest.id !== 'string' || ingest.id === '') return 'an ingest with no id';
    if (!isMap(ingest.body)) return 'an ingest with no body';
    return null;
  }
  const named = NAMED_BODIES.find((k) => typeof ingest[k] === 'string');
  if (named !== undefined) return `a ${named}`;
  if (Array.isArray(ingest.steps) || Array.isArray(ingest.then)) return 'a rule';
  return null;
}

/**
 * Whether a pattern's `ingest` is one ingest, the only thing a pattern is for, as a refusal that says what it is instead.
 *
 * ASKED ONLY TO BE AN OBJECT, IT INSTALLED WHATEVER IT WAS. The accept hands `body.ingest` to `install` as it hands a
 * change's `body.to`, so a rule filed as a pattern installed as a rule (`record/test/accept-rule-level.test.ts` measured a
 * colleague doing it), while the review screen, the cost in `weigh.ts` and the sample counts all read it as an ingest.
 * Anything else a person means to install goes through a `change`, which says what it is (`pattern-kind.test.ts`).
 */
function ingestFault(ingest: unknown): Refusal | null {
  const is = notAnIngest(ingest);
  if (is === null) return null;
  const then =
    is === 'a declaration with no kind'
      ? 'Give it "kind":"ingest", or file what it is as a change.'
      : is === 'an ingest with no id'
        ? 'Give it "id":"ingest.<name>".'
        : is === 'an ingest with no body'
          ? 'Put the ingest itself in its "body".'
          : `File ${is} as a change.`;
  return {
    code: 'VALUE_MALFORMED',
    fix: `A pattern installs one ingest, its body {"match":{...},"extract":{...},"writes":{...}} or its declaration {"id":"ingest.<name>","kind":"ingest","body":{...}}, and this is ${is}. ${then}`,
    at: 'body.ingest',
  };
}

/** The declarations a change's `to` installs, one or a bundle's, each that has a `kind` and a `body` to read. */
const declared = (to: unknown): { id?: unknown; kind: string; body: unknown }[] => {
  const listed: unknown[] = isMap(to) && Array.isArray(to.declarations) ? to.declarations : [to];
  return listed.filter((d): d is { id?: unknown; kind: string; body: unknown } => isMap(d) && typeof d.kind === 'string' && isMap(d.body));
};

/**
 * What each declaration sends out that the one installed under its id did not, as `review` answers it for a change.
 *
 * AGAINST THE LIVE BODY UNDER THE SAME ID, so an ingest or a digest filed again as it is installed asks the owner nothing
 * new, and a new host, key or source does. A body with no id (Slash's bare ingest) has nothing installed to compare with,
 * and says all it sends. `nameOf` and `opensOf` are the kernel's and this file has neither: an ingest says a project by
 * its row id, and only a script's line reads the keychain, which `review` works out.
 */
function newEgress(sql: Sql, members: readonly { id?: unknown; kind: string; body: unknown }[]): Egress[] {
  return members.flatMap((m) => {
    const e = egressOf(m.body);
    if (e === null) return [];
    const live =
      typeof m.id === 'string'
        ? sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', m.id)
        : undefined;
    const before = live ? egressOf(JSON.parse(live.body) as unknown) : null;
    return before === null || egressChanged(before, e) ? [e] : [];
  });
}

/** Whether a change's `to` is a field-level addition, `{ add: {...} }`, rather than a whole declaration. */
const isAdd = (to: unknown): to is { add: unknown } => isMap(to) && 'add' in to;

/** Whether a change's `to` retires fields of a live list, `{ retire: {...} }`, rather than being a whole declaration. */
const isRetire = (to: unknown): to is { retire: unknown } => isMap(to) && 'retire' in to && !('add' in to);

/**
 * Whether a change's `to` names fields rather than a list, and is merged onto the list live at the press.
 *
 * ONE QUESTION FOR BOTH SHAPES, because every place that asked `isAdd` was asking this: whether there is a whole body to
 * stamp a version on at filing, and whether the id installed is the resolved one. A retire asked `isAdd` there would be
 * stamped as a whole body drawn at filing, which is the race resolving at the press exists to end.
 */
const fieldLevel = (to: unknown): boolean => isAdd(to) || isRetire(to) || isRetype(to);

/* ── retype: one field retyped or narrowed over its rows (`api/retype.ts`) ── */

/**
 * Whether a change's `to` retypes or narrows one field of a live list, `{ retype: {...} }` or `{ narrow: {...} }`.
 *
 * FIELD-LEVEL, SO IT IS MERGED AT THE PRESS like an addition and a retire, and never stamped with a version at filing: the
 * rows it answers move between filing and the press, and `api/retype.ts` reads them again when it lands.
 */
const isRetype = (to: unknown): to is Record<string, unknown> => isMap(to) && ('retype' in to || 'narrow' in to) && !('add' in to) && !('retire' in to);

/**
 * The list a retype would install, merged onto the list as it is live, and the version it was merged onto.
 *
 * `retypedBody` IS THE LANDING'S OWN, so the body the owner is asked about and the body that lands are one answer. Only the
 * declaration is resolved here; the rows are `api/retype.ts`'s, which the record runs when the change is accepted.
 */
function retypeIn(sql: Sql, to: Record<string, unknown>, named: unknown): Result<{ to: Record<string, unknown>; version: number }> {
  const shape = retypeShapeFault(to);
  if (shape) return no('VALUE_MALFORMED', shape.fix, { at: shape.at });
  const ask = askOf(to);
  const list = listNamed(ask.register, named);
  if (list === null || named !== `register.${list}`)
    return no('VALUE_MALFORMED', `A retype of ${ask.register} is filed under "declaration_id":"register.${ask.register}".`, { at: 'body.declaration_id' });
  const live = liveList(sql, list);
  if (!live) return no('REGISTER_UNKNOWN', `There is no list called ${list} to change a field on.`, { at: 'body.to.register' });
  const body = retypedBody(live.body, ask);
  if (!body.ok) return body as Result<never>;
  return ok({ to: { id: `register.${list}`, kind: 'register', body: body.value.body }, version: live.version });
}

/* ── end retype ── */

/** The ids a bundle installs, in its order, or `null` when `to` is one declaration. */
const membersOf = (to: unknown): string[] | null => {
  const listed = (to as { declarations?: unknown } | null)?.declarations;
  return Array.isArray(listed) ? [...new Set(listed.map((d) => String((d as { id?: unknown } | null)?.id)))] : null;
};

/** Whether a proposer's `from_version` for one declaration is a version, or says nothing. */
const isDrawn = (x: unknown): boolean => x === undefined || x === null || (Number.isInteger(x) && (x as number) >= 0);

/** The version of `id` live now, and 0 when none is, which is how `install`'s `expect` spells "drawn from nothing". */
function liveVersion(sql: Sql, id: string): number {
  return sql.one<{ version: number }>(
    'SELECT version FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1',
    id,
  )?.version ?? 0;
}

/**
 * The conflict `install`'s `expect` would answer for `id`, if it is no longer at `version`, and `null` while it is.
 *
 * THE SAME ANSWER IN THE SAME SHAPE, the row as it stands and the pack that owns it, so a bundle member that moved reads
 * exactly as the declaration it was filed under does when that one moved, and the caller recovers both the same way.
 */
function movedFrom<T>(sql: Sql, id: string, version: number): Result<T> | null {
  const held = sql.one<{ version: number; body: string; pack_id: string | null }>(
    'SELECT version, body, pack_id FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1',
    id,
  );
  if ((held?.version ?? 0) === version) return null;
  return clash<T>(held?.version ?? 0, held ? { id, body: parse(held.body) } : null, held?.pack_id ?? 'in-app');
}

/**
 * What a change installs if it is accepted now: its `to` as filed, or an `add` merged onto the list as it is live.
 *
 * AT ACCEPTANCE AND NOT AT FILING, because resolving an `add` when it is filed turns it back into a whole body drawn
 * from one reading, which is the race it exists to end. So the stored body keeps what was asked, and this is run when it
 * is filed (to check it) and again when it is accepted (to install it). `version` is the live version it was merged onto.
 */
function resolveTo(sql: Sql, body: Record<string, unknown>): Result<{ to: Record<string, unknown>; version?: number }> {
  /* ANYTHING ELSE IS PASSED ON AS IT IS, for `shapeFault` to refuse in its own words: an array is not a declaration, and
     "needs to" would be a wrong answer to a proposer who sent one. */
  if (isAdd(body.to)) return addTo(sql, body.to, body.declaration_id);
  if (isRetire(body.to)) return retireIn(sql, body.to, body.declaration_id);
  if (isRetype(body.to)) return retypeIn(sql, body.to, body.declaration_id);
  return ok({ to: body.to as Record<string, unknown> });
}

/** The list a field-level change is about: its own `register`, or the list it is filed under. `null` when neither says. */
function listNamed(said: unknown, named: unknown): string | null {
  const list = said ?? (typeof named === 'string' && named.startsWith('register.') ? named : undefined);
  if (typeof list !== 'string') return null;
  return list.startsWith('register.') ? list.slice('register.'.length) : list;
}

/** The live body and version of `register.<list>`, or `null` when no list of that name is installed. */
function liveList(sql: Sql, list: string): { version: number; body: Record<string, unknown> } | null {
  const live = sql.one<{ version: number; body: string }>(
    "SELECT version, body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1",
    `register.${list}`,
  );
  const body = live ? parse(live.body) : null;
  return live && body ? { version: live.version, body } : null;
}

const RETIRE_KEYS = ['register', 'fields'];

/** The keys of a list's body that name one of its fields, and how the refusal says each. */
const LIST_ROLES = ['title', 'state', 'finished'] as const;
const ROLE_SAID: Record<(typeof LIST_ROLES)[number], string> = { title: 'title', state: 'state', finished: 'finished day' };

/**
 * The keys of a list's body that name its fields inside an object, and what each reads them for, as the refusal says it.
 *
 * `LIST_ROLES` WAS THE WHOLE OF THIS, AND THESE THREE WERE MISSING. A retire of the field a list's `steps` names as
 * `done` installed, and the list lost its steps without a word; `scopes` the same. The install's lint reads a retired
 * field as present for those two, because `retired` keeps its value on every row, so nothing after this caught it. A
 * `pairs` field it does refuse, but only at install, after somebody was asked and accepted.
 */
const LIST_PARTS = ['steps', 'scopes', 'pairs'] as const;
type ListPart = (typeof LIST_PARTS)[number];
const PART_READS: Record<ListPart, string> = {
  steps: 'tell which row each of its rows is a step of, and when it is done',
  scopes: 'list the repositories and folders of each project',
  pairs: 'find the two legs of a transfer',
};

/**
 * Each field a list body's `steps`, `scopes` or `pairs` names, with the key that names it.
 *
 * `fields` ARE THE ONES A `pairs` WITH NO `date` RUNS ITS WINDOW OVER, its list's sole live day field, so they are the
 * live list's when there is one: read over a body that retires that day, the window would find no day and name nothing.
 * A part installed malformed names nothing here, and the install's own lint is what refuses it.
 */
function partsNaming(body: Record<string, unknown>, fields: readonly Record<string, unknown>[]): Map<string, ListPart> {
  const named = new Map<string, ListPart>();
  const put = (part: ListPart, ids: readonly unknown[]): void => {
    for (const id of ids) if (typeof id === 'string' && !named.has(id)) named.set(id, part);
  };
  if (isMap(body.steps)) put('steps', [body.steps.of, body.steps.done, body.steps.order]);
  if (isMap(body.scopes)) put('scopes', Object.values(body.scopes));
  const pairs = body.pairs;
  if (isMap(pairs) && Array.isArray(pairs.on) && pairs.on.every((x) => typeof x === 'string'))
    put('pairs', pairsReads(pairs as unknown as PairsDecl, fields as unknown as Parameters<typeof pairsReads>[1]));
  return named;
}

/** Why `id` cannot be retired from `name` while its `part` names it, in the words the owner reads it by, then `then`. */
const partHolds = (id: string, part: ListPart, name: string, then: string): string =>
  `${id} is a field ${name}'s ${part} reads to ${PART_READS[part]}, so it cannot be retired. ${then}`;

/**
 * The first field a whole list body retires that the body still reads by, as a refusal, or `null`.
 *
 * A WHOLE BODY COULD DO WHAT A RETIRE MAY NOT: `retired: true` on the title, or on the field `steps`, `scopes` or
 * `pairs` names, installed as any other edit, and the list lost what that field held up. So each list a change installs
 * is asked what `retireIn` asks, for every field it retires that the live list does not. A field already retired on the
 * live list is left as it is, so a list filed again as it stands is not refused for a field it lost before this check
 * existed.
 */
function retiresRead(sql: Sql, to: unknown): Refusal | null {
  for (const d of declared(to)) {
    const body = d.body;
    if (d.kind !== 'register' || !isMap(body) || !Array.isArray(body.fields)) continue;
    const list = typeof body.id === 'string' ? body.id : String(d.id ?? '').slice('register.'.length);
    const live = liveList(sql, list);
    const liveFields = (live && Array.isArray(live.body.fields) ? live.body.fields : []).filter(isMap);
    const was = new Set(liveFields.filter((f) => f.retired === true).map((f) => f.id));
    const going = (body.fields as unknown[]).filter(isMap).filter((f) => f.retired === true && !was.has(f.id)).map((f) => String(f.id));
    if (going.length === 0) continue;
    const name = typeof body.name === 'string' ? body.name : list;
    const parts = partsNaming(body, live ? liveFields : (body.fields as unknown[]).filter(isMap));
    for (const id of going) {
      const role = LIST_ROLES.find((k) => body[k] === id);
      if (role !== undefined)
        return {
          code: 'OUT_OF_BOUNDS',
          fix: `${id} is the ${ROLE_SAID[role]} of ${name}, so it cannot be retired. Name another ${ROLE_SAID[role]} in the same change, or keep ${id}.`,
          at: 'body.to',
        };
      const part = parts.get(id);
      if (part !== undefined) return { code: 'OUT_OF_BOUNDS', fix: partHolds(id, part, name, `Change its ${part} in the same change, or keep ${id}.`), at: 'body.to' };
    }
  }
  return null;
}

/**
 * The first move of an enum staying on the list that needs `id` filled, or `null` when no move does. An enum retired in
 * the same change is not asked, whichever order the two are named in.
 */
function movesNeeding(fields: readonly Record<string, unknown>[], id: string, going: ReadonlySet<string>): { field: string; from: string } | null {
  for (const f of fields) {
    if (f.retired === true || going.has(String(f.id)) || !isMap(f.transitions)) continue;
    for (const [from, move] of Object.entries(f.transitions))
      if (isMap(move) && Array.isArray(move.requires) && move.requires.includes(id)) return { field: String(f.id), from };
  }
  return null;
}

/**
 * Fields of a live list marked `retired: true`, and nothing else about the list changed.
 *
 * THE APP HAD NO WAY TO TAKE A FIELD AWAY. `addTo` sends anyone removing something to "propose the whole list", and the
 * app cannot: `schema` answers the relabelled copy the screens draw from and no version, so a whole body built from it
 * writes display labels into the declaration and drops whatever somebody else added since the tab read it
 * (`field-write.ts` says why at length). This is `addTo`'s other half, and it is read the same way: stored as asked, and
 * resolved onto the list as it is live when it is filed (to check it) and when it is accepted (to install it), with the
 * version it was read at, before every check a whole body gets.
 *
 * RETIRED, NEVER REMOVED, AND NO ROW TOUCHED. `retired` is the record's honest form of removal: the install takes it
 * over rows that hold the field, the value stays in each row, and every reader passes over it (`field-drop.test.ts`).
 * Leaving the field out instead is `WOULD_ORPHAN` while any row holds it, so a retire that dropped the entry would be
 * refused at the press for the very rows it exists to keep.
 *
 * AND IT ALWAYS WAITS. It is not an `add`, so `additiveFault` holds it and the record's `byRule` never sends it:
 * removing waits for the owner's press, the owner's own filing included.
 */
function retireIn(sql: Sql, to: { retire: unknown }, named: unknown): Result<{ to: Record<string, unknown>; version: number }> {
  const retire = to.retire;
  if (!isMap(retire)) return no('VALUE_MALFORMED', 'retire is {"register":"<list>","fields":["<field>",...]}.', { at: 'body.to.retire' });
  const extra = Object.keys(to).find((k) => k !== 'retire') ?? Object.keys(retire).find((k) => !RETIRE_KEYS.includes(k));
  if (extra !== undefined)
    return no('FIELD_UNKNOWN', `A retire takes register and fields, and nothing else, so ${extra} is not one of them. To change a field rather than retire it, propose the whole list.`, {
      at: `body.to.retire.${extra}`,
      allowed: RETIRE_KEYS,
    });
  const list = listNamed(retire.register, named);
  if (list === null) return no('REQUIRED_MISSING', 'A retire names the list it retires from, as register, or is filed under "declaration_id":"register.<list>".', { at: 'body.to.retire.register' });
  const live = liveList(sql, list);
  if (!live) return no('REGISTER_UNKNOWN', `There is no list called ${list} to retire a field from.`, { at: 'body.to.retire.register' });

  const retiring = retire.fields;
  if (!Array.isArray(retiring) || !retiring.every((f) => typeof f === 'string'))
    return no('VALUE_MALFORMED', 'fields is a list of field ids, ["<field>",...].', { at: 'body.to.retire.fields' });
  if (retiring.length === 0) return no('REQUIRED_MISSING', 'A retire names at least one field.', { at: 'body.to.retire.fields' });

  const name = typeof live.body.name === 'string' ? live.body.name : list;
  const fields = (Array.isArray(live.body.fields) ? live.body.fields : []).map((f) => (isMap(f) ? { ...f } : f)) as Record<string, unknown>[];
  /* ONCE EACH, because the mark below lands on this copy: a field named twice read its own mark on the second pass and
     was refused as "already retired" while the live list held it as live as ever. */
  const going = new Set(retiring as string[]);
  /* READ BEFORE THE FIRST MARK, so a `pairs` with no `date` still finds the day it runs over. */
  const parts = partsNaming(live.body, fields);
  for (const id of going) {
    const held = fields.find((f) => f.id === id);
    if (!held) return no('FIELD_UNKNOWN', `${name} has no field called ${id}.`, { at: 'body.to.retire.fields' });
    /* REFUSED BY NAME, NOT PASSED AS A NO-OP. Two retires of one field filed from one reading both look fine on their
       own; the second, accepted, would install a version identical to the first and say it retired something. */
    if (held.retired === true) return no('VALUE_MALFORMED', `${id} is already retired on ${name}.`, { at: 'body.to.retire.fields' });
    /* AND NOT A FIELD THE LIST ITSELF IS READ BY. Measured before this line: a retire of Projects' title field `name` was
       filed, accepted and installed at version 3, and the next `create` with a name was refused `FIELD_UNKNOWN`, so the
       list could take no row with a title again. The install's lint lets a whole body do the same; one press on a row's
       label should not be the way to reach it. The state and the finished day are read by name the same way. */
    const role = LIST_ROLES.find((k) => live.body[k] === id);
    if (role !== undefined)
      return no('OUT_OF_BOUNDS', `${id} is the ${ROLE_SAID[role]} of ${name}, so it cannot be retired. Propose the whole list to name another first.`, {
        at: 'body.to.retire.fields',
      });
    /* NOR ONE A MOVE REQUIRES. Measured before this line: `note` retired from a list whose move out of `open` requires
       it, and a row in `open` could never leave. The move without it was refused `REQUIRED_MISSING` and with it
       `FIELD_UNKNOWN`, since the write path asks `requires` of the declaration and passes over no retired field there. */
    const move = movesNeeding(fields, id, going);
    if (move !== null)
      return no('OUT_OF_BOUNDS', `${id} is what ${move.field} needs filled to leave ${move.from} on ${name}, so it cannot be retired. Propose the whole list to change that move first.`, {
        at: 'body.to.retire.fields',
      });
    /* NOR ONE ITS `steps`, `scopes` OR `pairs` READS, for the reason `LIST_PARTS` gives. */
    const part = parts.get(id);
    if (part !== undefined)
      return no('OUT_OF_BOUNDS', partHolds(id, part, name, `Propose the whole list to change its ${part} first.`), { at: 'body.to.retire.fields' });
    held.retired = true;
  }
  return ok({ to: { id: `register.${list}`, kind: 'register', body: { ...live.body, fields } }, version: live.version });
}

const ADD_KEYS = ['register', 'fields', 'values'];

/**
 * An addition to a live list: new fields, and new values at the end of a closed list, and nothing else.
 *
 * AN AGENT THAT WANTED ONE OPTIONAL FIELD HAD TO SEND THE WHOLE LIST. `to` was a whole declaration or nothing, so
 * adding `hosting: text` to Projects meant reading twenty-odd fields, copying them and sending them back, and
 * `{ field: {...} }` was refused `VALUE_MALFORMED`. Metadata added this way is the ordinary case, by people and agents
 * alike.
 *
 * ADDITIVE BY CONSTRUCTION. A field id the list already has, retired ones included, is refused rather than replaced, and
 * there is no key that removes anything: a retype or a removal is a whole-body change and is read as one. The merged
 * body then goes through every check a whole body does (`namesFault`, `review`, `fits`, the install's own lint).
 */
function addTo(sql: Sql, to: { add: unknown }, named: unknown): Result<{ to: Record<string, unknown>; version: number }> {
  const add = to.add;
  if (!isMap(add)) return no('VALUE_MALFORMED', 'add is {"register":"<list>","fields":[...],"values":{"<field>":[...]}}.', { at: 'body.to.add' });
  const extra = Object.keys(to).find((k) => k !== 'add') ?? Object.keys(add).find((k) => !ADD_KEYS.includes(k));
  if (extra !== undefined)
    return no('FIELD_UNKNOWN', `An addition takes register, fields and values, and nothing else, so ${extra} is not one of them. To take something away or change its type, propose the whole list.`, {
      at: `body.to.add.${extra}`,
      allowed: ADD_KEYS,
    });
  /* THE LIST IS THE ONE THE CHANGE IS FILED UNDER unless it says otherwise, so the example agents are taught in every
     turn does not spend tokens saying it twice (`mcp/src/index.ts`, measured against the 2,600 ceiling). A `register`
     that disagrees with `declaration_id` is still refused, by `namesFault`, for the reason it gives. */
  const list = listNamed(add.register, named);
  if (list === null) return no('REQUIRED_MISSING', 'An addition names the list it adds to, as register, or is filed under "declaration_id":"register.<list>".', { at: 'body.to.add.register' });
  const id = `register.${list}`;
  const live = liveList(sql, list);
  if (!live) return no('REGISTER_UNKNOWN', `There is no list called ${list} to add to. To make one, propose it whole.`, { at: 'body.to.add.register' });
  const was = live.body;

  const fields = (Array.isArray(was.fields) ? was.fields : []).map((f) => (isMap(f) ? { ...f } : f)) as Record<string, unknown>[];
  const adding = add.fields ?? [];
  const values = add.values ?? {};
  if (!Array.isArray(adding) || !adding.every((f) => isMap(f) && typeof f.id === 'string'))
    return no('VALUE_MALFORMED', 'fields is a list of fields, each {"id":"<id>","type":"<type>"}.', { at: 'body.to.add.fields' });
  if (!isMap(values) || !Object.values(values).every((v) => Array.isArray(v) && v.every((x) => typeof x === 'string')))
    return no('VALUE_MALFORMED', 'values is {"<field>":["<value>",...]}, the values to add to each closed list.', { at: 'body.to.add.values' });
  if (adding.length === 0 && Object.keys(values).length === 0)
    return no('REQUIRED_MISSING', 'An addition names fields to add, values to add to a closed list, or both.', { at: 'body.to.add' });

  for (const f of adding as Record<string, unknown>[]) {
    if (fields.some((held) => held.id === f.id))
      return no('VALUE_MALFORMED', `${list} already has a field called ${String(f.id)}. An addition only adds; to change that field, propose the whole list.`, {
        at: 'body.to.add.fields',
      });
    fields.push(f);
  }
  for (const [field, more] of Object.entries(values) as [string, string[]][]) {
    const held = fields.find((f) => f.id === field);
    if (!held) return no('FIELD_UNKNOWN', `${list} has no field called ${field}.`, { at: `body.to.add.values.${field}` });
    if (!Array.isArray(held.values))
      return no('VALUE_MALFORMED', `${field} is not a closed list, so there are no values to add to it.`, { at: `body.to.add.values.${field}` });
    held.values = [...held.values, ...more.filter((v) => !(held.values as unknown[]).includes(v))];
  }
  return ok({ to: { id, kind: 'register', body: { ...was, fields } }, version: live.version });
}

/** Who answers a question the additive rule settles: `decision.decided_by`, and the actor on its `decide` and `resolve`. */
export const ADDITIVE_RULE = 'rule:additive';

/**
 * The keys that make an added field something other than loose metadata: it asks every writer for a value, it refuses
 * a value another row holds, or it builds an index. `search` is the full-text index, so it counts as one.
 *
 * AND `scope`, WHICH SAYS WHERE ROWS APPLY. It was not here, and `project` with a scope was added to Money from an
 * agent's key: it landed by rule, and a second agent's `context` went from no registers to Money's three row titles,
 * because `context` sends every readable list with a scope field into the brief. From then on `scopeFault` also holds a
 * key's writes to Money to its project. Neither is an optional field.
 */
const HELD_KEYS = ['required', 'required_when', 'unique', 'index', 'search', 'scope'] as const;

/** How the owner reads each held key, after the field's id: "domain is unique, and that waits for the owner." */
const HELD_AS: Record<(typeof HELD_KEYS)[number], string> = {
  required: 'required',
  required_when: 'required sometimes',
  unique: 'unique',
  index: 'indexed',
  search: 'searched',
  scope: 'where rows apply',
};

/**
 * Why a change cannot land by the additive rule, or `null` when it can.
 *
 * THE OWNER'S RULE: an agent's purely additive, optional field lands at once and is logged, and removing, retyping,
 * requiring or narrowing still waits for his press. `addTo` already makes an `add` additive by construction (no field
 * it names may exist, and values are only appended), so what is left to hold back is a field that constrains the rows:
 * `required` refuses every writer who does not know the new field, `unique` and `index` build on the table, and all
 * three are outside the narrow rule.
 *
 * A KEY SET TO `false` IS NOT A CONSTRAINT, so `required: false` still lands; any other value holds it back, because
 * the install's lint is the one that decides what `required: "yes"` means, and it should do so with the owner watching.
 */
export function additiveFault(body: Record<string, unknown> | null): string | null {
  /* A RETIRE IS SAID AS ONE. It fell to the line below and was told "a whole list is proposed", which is not what was
     filed, and the owner reading why his question waited would look for a list that is not there. */
  if (body && isRetire(body.to)) return 'It retires a field, and taking anything away waits for the owner.';
  if (!body || !isAdd(body.to)) return 'Only an addition lands by rule. A whole list is proposed, and waits for the owner.';
  const add = body.to.add;
  if (!isMap(add)) return 'The addition cannot be read.';
  /* AN EGRESS LINE IS SOMETHING SENT OUT, and what leaves the record is the owner's to approve whatever the shape. */
  if (Array.isArray(body.egress) && body.egress.length > 0) return 'It sends something out, and that waits for the owner.';
  for (const f of (Array.isArray(add.fields) ? add.fields : []) as Record<string, unknown>[]) {
    const held = HELD_KEYS.find((k) => isMap(f) && f[k] !== undefined && f[k] !== false);
    if (held !== undefined) return `${String(f?.id)} is ${HELD_AS[held]}, and that waits for the owner.`;
  }
  return null;
}

/**
 * Who answers a question the ladder settles: an agent's proposal of kinds the owner has let it make without asking.
 * No agent answers a question, its own least of all, so the ladder does, and signs as itself.
 */
export const LADDER_RULE = 'rule:ladder';

/** What the decision says when the ladder answered it. */
const LADDER_REASON =
  'Changes like this were kept unchanged often enough that they no longer ask. None is money, a key, sharing, a delete, who someone is, a plugin or somebody else\'s.';

/**
 * Why a question cannot be answered by the ladder, or `null` when it can. Checked at the gate whoever sends the verdict,
 * as the additive rule is, so a caller that got the rung wrong still cannot accept without a person.
 *
 * ONLY ROWS. A rowset is the one body whose every kind can climb; a choice is a judgement nobody but a person makes, and
 * a change, a pattern or an add-on is the shape of the record, which the additive rule or the owner answers.
 *
 * THE KINDS ARE WORKED OUT AGAIN AT THE PRESS, never read off the stamp: a list can have gained a money field since the
 * question was filed, and the floor is what it is now. The grant is read now too, so a token revoked, expired or taken
 * down to Suggest since stops here. The rung is the ladder's for the agent the question was filed by, and every kind
 * must stand at Do and tell or Do quietly, none on the floor.
 *
 * THE FLOOR READ HERE IS THE WHOLE OF IT (`change-kind.ts`), and two parts of it were missing at first:
 * a merge or an identity key (`merged_into`, `email`, `handles`, `keys` or `self` on the people or organisations
 * `meet` writes) was a plain edit, so a rowset setting only `merged_into` was let through at Do and tell; and a field
 * sent empty was an edit and not a delete. Both are on the floor now, and a filer that acts for nobody (Slash, a run no token opened)
 * meets every row a person made as somebody else's. A later change closed the rest of who someone is: a row filed
 * without `at`, which is a new person or organisation, asks when it is made merged, as the record's own person, or
 * with addresses, handles, keys or a domain, and a rename of one, or a change to its domain, aliases or organisation,
 * asks as an edit. A new row with only a name still climbs as an add.
 *
 * AND A FIELD ONLY A DECISION CHANGES (`by: 'decide'`, on the field or on the move) still waits for a person, because
 * a rung is not a person deciding.
 */
export function ladderFault(sql: Sql, row: { body_kind: string; body: string; opened_by: string }, nowMs: number): string | null {
  if (row.body_kind !== 'rowset') return `A ${row.body_kind} is never answered by the ladder.`;
  const agent = agentOf(sql, row.opened_by);
  if (agent === null) return 'Only an agent climbs the ladder, and this was not filed by one.';
  if (agent !== SLASH) {
    const grant = sql.one<{ scope: string; revoked_at: string | null; expires_at: string | null; suspended_at: string | null }>(
      'SELECT t.scope AS scope, t.revoked_at AS revoked_at, t.expires_at AS expires_at, p.suspended_at AS suspended_at FROM token t LEFT JOIN person p ON p.id = t.person_id WHERE t.id = ?',
      agent,
    );
    /* `verifyToken`'s three ends: revoked, run out, or its person suspended. Any of them and the grant is gone. */
    if (!grant || grant.revoked_at !== null || (grant.expires_at !== null && grant.expires_at <= instant(nowMs)) || grant.suspended_at)
      return 'The grant it was filed under has ended.';
    if (grant.scope !== 'write') return 'Its grant may only suggest, so everything it files asks.';
  }
  const body = parse(row.body);
  if (!body) return 'The question cannot be read.';
  const kinds = kindsOfProposal(row.body_kind, body, recordReader(sql, row.opened_by));
  const floor = kinds.find((k) => k.floor !== null);
  if (floor) return `It is ${floor.key}, which always asks (${String(floor.floor)}).`;
  const low = kinds.find((k) => rungOf(sql, agent, k) === 'ask');
  if (low) return `It is ${low.key}, which still asks.`;
  const shape = shapeIn(sql, String(body.register));
  const fields = new Map((shape?.fields ?? []).map((f) => [f.id, f]));
  /* A MOVE IS HELD WHEN ANY WAY INTO THE STATE IT GOES TO IS `by: 'decide'`, read without the row's current state, so
     it errs toward asking: `reverted` back to `active` on a learning is a person's call however the agent got there. */
  const decidedMove = (key: string, to: unknown): boolean => {
    const ways = fields.get(key)?.transitions;
    return isMap(ways) && Object.values(ways).some((w) => isMap(w) && w.by === 'decide' && Array.isArray(w.to) && w.to.includes(to));
  };
  const held = ((body.rows ?? []) as Record<string, unknown>[])
    .flatMap((r) => Object.entries(isMap(r.patch) ? r.patch : r))
    .find(([k, v]) => fields.get(k)?.by === 'decide' || decidedMove(k, v))?.[0];
  if (held !== undefined) return `${held} changes only when a person accepts it.`;
  return null;
}

/**
 * Who answers a question BrainDog settles itself: reversible arranging of the owner's own rows, too small to need a press.
 * Its rows are signed by this name, so the byline reads BrainDog and one Undo on the decision puts the whole batch back.
 */
export const HANDLED_RULE = 'rule:handled';

/** The one setting behind it: a pref of the record under this holder and key. Absent means on; `false` turns it off. */
export const HANDLED_PREF = { holder: 'record:handled', key: 'on' } as const;

/** Whether BrainDog arranges for itself. On for every record until the owner says otherwise. */
export function handledOn(sql: Sql): boolean {
  const v = sql.one<{ value: string }>('SELECT value FROM pref WHERE person_id = ? AND key = ?', HANDLED_PREF.holder, HANDLED_PREF.key)?.value;
  return v === undefined ? true : v.trim() !== 'false';
}

/**
 * The reason a handled change is kept with when the question carried none of its own. It is the rule's, not the
 * change's, so `handled` never shows it to a person: a line says what was done, and why only when the question said.
 * The earlier wording is kept on decisions made before, and `HANDLED_REASONS` names both.
 */
export const HANDLED_REASON = 'BrainDog tidied this itself, and it can be undone.';
export const HANDLED_REASONS: readonly string[] = [HANDLED_REASON, 'It only arranges your own rows, and every change can be undone.'];

/** The verbs that only arrange a row: an edit, a tag, a move to another state. Adding, deleting, notes and installs are not. */
const ARRANGES = (verb: string): boolean => verb === 'edit' || verb === 'tag' || verb.startsWith('move:');

/**
 * How `handledFault` reads an agent's question. `agents` is set only by the hourly pass over what still waits
 * (`settleWaiting`): there a question one of the owner's own agents filed, still open after `SETTLE_AFTER_MS`, is settled
 * as BrainDog's own would be. Filed, it stays the ladder's (`ladderFault`), so a write at Ask still asks first.
 */
export type HandledOpts = { agents?: { nowMs: number } };

/**
 * Why an agent's question is not one BrainDog settles for its owner, or `null`: the run was opened by a grant that is
 * still good, and the grant is a person's who keeps the whole record. A member's agent, or one whose key was revoked, run
 * out or suspended, still waits for a person.
 */
function ownAgentFault(sql: Sql, by: string, nowMs: number): string | null {
  const token = tokenOfRun(sql, by);
  if (token === null) return 'Only what BrainDog or one of your own agents files is settled by it.';
  const grant = sql.one<{ person_id: string; revoked_at: string | null; expires_at: string | null }>('SELECT person_id, revoked_at, expires_at FROM token WHERE id = ?', token);
  if (!grant || grant.revoked_at !== null || (grant.expires_at !== null && grant.expires_at <= instant(nowMs))) return 'The grant it was filed under has ended.';
  return ownerIn(sql, grant.person_id) ? null : 'It was filed by an agent of someone who does not hold all of this BrainDog.';
}

/**
 * Why BrainDog may not answer this question itself, or `null` when it may. Only what BrainDog files itself (an ingest, a
 * rule, Slash), or, in the hourly pass (`opts.agents`), what one of the owner's own agents filed, and only rows that
 * already exist: every write an edit, a tag or a move, none on the floor (money, keys, sharing, who someone is, deletes,
 * add-ons, outside the record, another person's row). Rows the owner made count as the owner's own, as they do for
 * Slash. The kinds are worked out now, as `ladderFault` works them, never from the stamp.
 *
 * A QUESTION ASKED BECAUSE ITS RUN READ OUTSIDE TEXT (`outside`) IS NEVER SETTLED HERE: a run that read outside text drops to
 * Ask so that a person reads what it would change, and settling it an hour later would undo the reason it asked.
 */
export function handledFault(sql: Sql, row: { body_kind: string; body: string; opened_by: string }, opts: HandledOpts = {}): string | null {
  if (row.body_kind !== 'rowset') return `A ${row.body_kind} is never settled by BrainDog.`;
  const by = row.opened_by;
  if (!(by === SLASH || by.startsWith('ingest:') || by.startsWith('rule:'))) {
    if (opts.agents === undefined) return 'Only what BrainDog files itself is settled by it.';
    const mine = ownAgentFault(sql, by, opts.agents.nowMs);
    if (mine !== null) return mine;
  }
  const body = parse(row.body);
  if (!body) return 'The question cannot be read.';
  if (body.outside === true) return 'Its run read text from outside BrainDog, so it waits for you.';
  const rows = (body.rows ?? []) as Record<string, unknown>[];
  /* A CONFIDENT ARRIVAL IS THE ONE ADD BRAINDOG FILES ITSELF: an ingest says so in the body
     (`arrivalSure`), and only new rows of that ingest's own list count; money is read cleanly by then, every other floor stands. */
  const confident = body.confident === true && by.startsWith('ingest:') && rows.every((r) => typeof r?.at !== 'string');
  if (rows.length === 0 || (!confident && rows.some((r) => typeof r?.at !== 'string' || !isMap(r.patch)))) return 'It adds rows, and a new row asks.';
  /* AS SLASH READS THEM, so an owner's row is the owner's own and a member's is still somebody else's. */
  const kinds = kindsOfProposal('rowset', body, recordReader(sql, SLASH));
  const floor = kinds.find((k) => k.floor !== null && !(confident && k.floor === 'money'));
  if (floor) return `It is ${floor.key}, which always asks (${String(floor.floor)}).`;
  const other = kinds.find((k) => !(confident ? k.verb === 'add' || ARRANGES(k.verb) : ARRANGES(k.verb)));
  if (other) return `It is ${other.key}, which is more than arranging.`;
  const shape = shapeIn(sql, String(body.register));
  const fields = new Map((shape?.fields ?? []).map((f) => [f.id, f]));
  const held = rows.flatMap((r) => Object.entries((isMap(r.patch) ? r.patch : r) as Record<string, unknown>)).find(([k]) => fields.get(k)?.by === 'decide')?.[0];
  return held === undefined ? null : `${held} changes only when a person accepts it.`;
}

/** How long one of the owner's agents' small questions waits for him before BrainDog settles it in the hourly pass. */
export const SETTLE_AFTER_MS = 60 * 60 * 1000;

/** How many open questions one pass reads, newest first, so an hour costs the same whatever the queue holds. */
export const SETTLE_BOUND = 300;

/** What a question an agent asked again closes with: the line in its history. No ids and no list's words. */
export const SUPERSEDED = 'A newer question asks the same about this row.';

/** One open rowset as the pass reads it. */
type Waiting = { id: string; opened_by: string; opened_at: string; body: string };

/**
 * The fields each open rowset question would change, by row: `register|row id|field`. `null` for one that adds a row,
 * names no row this record holds, or cannot be read, which no other question can be said to ask again.
 */
function cellsOf(sql: Sql, body: string): Set<string> | null {
  const b = parse(body);
  if (!b || typeof b.register !== 'string' || !Array.isArray(b.rows) || b.rows.length === 0) return null;
  const register = b.register;
  const out = new Set<string>();
  for (const r of b.rows as unknown[]) {
    if (!isMap(r) || typeof r.at !== 'string' || !isMap(r.patch)) return null;
    const at = r.at.trim();
    const hash = at.lastIndexOf('#');
    const id =
      hash > 0
        ? sql.one<{ id: string }>('SELECT id FROM entry WHERE register = ? AND seq = ?', at.slice(0, hash), Number(at.slice(hash + 1)))?.id
        : (sql.one<{ id: string }>('SELECT id FROM entry WHERE id = ? AND register = ?', at, register)?.id ?? tokenRowOf(sql, register, at));
    if (id === undefined || id === null) return null;
    for (const field of Object.keys(r.patch)) out.add(`${register}|${id}|${field}`);
  }
  return out.size === 0 ? null : out;
}

/** A row named by its list's own prefix (`S12`), as `get` reads one, or `null`. */
function tokenRowOf(sql: Sql, register: string, at: string): string | null {
  const prefix = sql.one<{ p: string | null }>(
    "SELECT json_extract(body, '$.seq_prefix') AS p FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 AND json_valid(body) ORDER BY version DESC LIMIT 1",
    `register.${register}`,
  )?.p;
  if (typeof prefix !== 'string' || prefix === '' || prefix === '#' || !at.startsWith(prefix)) return null;
  const n = at.slice(prefix.length);
  return /^[1-9][0-9]*$/.test(n) ? (sql.one<{ id: string }>('SELECT id FROM entry WHERE register = ? AND seq = ?', register, Number(n))?.id ?? null) : null;
}

/**
 * BrainDog's own arranging, over what already waits (measured live on 20 Oct: "small reversible questions settle
 * themselves: none did"). Run by the hourly sweep while `handledOn` holds, in two steps:
 *
 *   1. A QUESTION ASKED AGAIN IS CLOSED. An open rowset whose every field on every row a newer open question also
 *      changes is closed as moot with `SUPERSEDED`, as `recheck` closes one already so: fifteen "last seen" questions
 *      about two tools waited on the owner, each older one a value the newest replaced. No decision, no brake, no rung.
 *   2. WHAT IS LEFT AND SMALL IS SETTLED. Each open rowset `handledFault` passes is answered by `settle`, signed
 *      `rule:handled`, so it is one line in Handled today with its Undo. One an agent of the owner's filed waits
 *      `SETTLE_AFTER_MS` first, so he sees it before BrainDog answers it; what BrainDog filed itself and could not settle
 *      when it was filed is tried again at once. A refusal (a row changed since, a field only a person changes) leaves it open.
 *
 * Before this, the rule ran only at the moment a question was filed, and only for an ingest, a rule or Slash: every
 * question on the owner's record had been filed by one of his agents, and nothing ever looked at them again.
 */
export function settleWaiting(
  sql: Sql,
  nowMs: number,
  mint: () => string,
  settle: (id: string) => Result<unknown>,
): { superseded: string[]; settled: string[] } {
  const waiting = sql.all<Waiting>(
    "SELECT id, opened_by, opened_at, body FROM suggestion WHERE status = 'open' AND body_kind = 'rowset' ORDER BY opened_at DESC, rowid DESC LIMIT ?",
    SETTLE_BOUND,
  );
  /* NEWEST FIRST: each question is asked again only by one filed after it, so the cells seen so far are the newer ones. */
  const newer = new Set<string>();
  const superseded: string[] = [];
  const left: Waiting[] = [];
  for (const q of waiting) {
    const cells = cellsOf(sql, q.body);
    if (cells !== null && [...cells].every((c) => newer.has(c))) {
      superseded.push(q.id);
      continue;
    }
    if (cells !== null) for (const c of cells) newer.add(c);
    left.push(q);
  }
  if (superseded.length > 0) {
    const shut = JSON.stringify(superseded.map((q) => ({ q, e: mint() })));
    sql.exec(`UPDATE suggestion SET status = 'resolved', resolved_as = 'moot' WHERE status = 'open' AND id IN (SELECT json_extract(value, '$.q') FROM json_each(?))`, shut);
    sql.exec(
      `INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note)
       SELECT json_extract(value, '$.e'), ?, 'system', 'resolve', 'suggestion:' || json_extract(value, '$.q'), 'suggestion', 'moot', ?
       FROM json_each(?) ORDER BY key`,
      instant(nowMs),
      SUPERSEDED,
      shut,
    );
  }
  const settled: string[] = [];
  const due = instant(nowMs - SETTLE_AFTER_MS);
  /* OLDEST FIRST, so the Handled list reads in the order he would have answered them. */
  for (const q of left.reverse()) {
    const ours = q.opened_by === SLASH || q.opened_by.startsWith('ingest:') || q.opened_by.startsWith('rule:');
    if (!ours && q.opened_at > due) continue;
    if (handledFault(sql, { body_kind: 'rowset', body: q.body, opened_by: q.opened_by }, { agents: { nowMs } }) !== null) continue;
    if (settle(q.id).ok) settled.push(q.id);
  }
  return { superseded, settled };
}

/** What the decision says when the rule answered, in the words the owner reads it by in Decide. */
const ADDITIVE_REASON = 'It only adds optional fields or values, and those land without a press. Taking away, retyping or requiring anything still asks.';

/**
 * A `change` is about the declaration it names: `to` is that declaration, or a bundle that holds it.
 *
 * THE PROPOSER CHOSE WHO WAS ASKED. The record reads the list a change is about from `declaration_id` and nothing else,
 * and nothing held `to` to it, so `declaration_id: register.obligations` was filed over a new Diary from the owner's
 * `propose` token: it was shown whole to a member invited to Obligations alone, with Diary's schema in it, and
 * accepting it installed Diary at v2. Filed the other way round, a change to Obligations was held back from the member
 * whose list it changed. The prediction a change carries is written under the same id, so a grade about one list was
 * read by whoever reads the other.
 *
 * A BUNDLE HOLDS WHAT IT IS NAMED FOR, AND UNDER A LIST'S NAME NO OTHER LIST. A bundle is several declarations under one
 * name (a pack update's two actions), so it cannot be held to one id; but a bundle named for `register.obligations`
 * that also carries `register.diary` is the same leak with one more declaration in front of it. Under a name that is
 * not a list's, the record asks only whoever reads the whole record, and nothing is shown to anybody it is not about.
 *
 * Checked when a change is filed, and again when it is accepted, for a change filed before this was.
 */
function namesFault(sql: Sql, body: Record<string, unknown>): Refusal | null {
  const named = String(body.declaration_id);
  const to = body.to as { id?: unknown; declarations?: unknown };
  const bundle = Array.isArray(to?.declarations) ? (to.declarations as { id?: unknown; kind?: unknown }[]) : null;
  if (bundle === null)
    return to?.id === named
      ? null
      : {
          code: 'VALUE_MALFORMED',
          fix: `This change installs ${String(to?.id)} and is filed as a change to ${named}, so it would be shown to whoever reads ${named}. File it with "declaration_id":"${String(to?.id)}".`,
          at: 'body.to',
        };
  const ids = bundle.map((d) => String(d?.id));
  if (!ids.includes(named))
    return {
      code: 'VALUE_MALFORMED',
      fix: `This change is filed as a change to ${named}, and ${named} is not among what it installs (${ids.join(', ')}). Name one of them in "declaration_id".`,
      at: 'body.to',
    };
  if (named.startsWith('register.')) {
    const other = ids.find((id) => id.startsWith('register.') && id !== named);
    if (other !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix: `This change is filed as a change to ${named} and also installs ${other}, so whoever reads ${named} would read ${other} in it. Propose ${other} as a change of its own.`,
        at: 'body.to',
      };
    return aboutOthers(sql, named, bundle);
  }
  return null;
}

/**
 * A declaration in a bundle filed under a list's name that reads, writes or mails another list, or the whole record.
 *
 * A SECOND REGISTER WAS THE ONLY THING KEPT OUT, and a rule over Diary was filed under `register.obligations` from the
 * owner's `propose` token: the member invited to Obligations alone read the rule whole in the queue, and accepting it
 * installed it. A metric over Diary, a page with a table of it, an ingest that writes it and a digest that mails its
 * rows rode in the same way, one declaration each (`govern-bundle-scope.test.ts` filed all eight before this). So each
 * declaration is asked which lists it NAMES, not only which it declares.
 *
 * AND WHICH IT TOUCHES AS ITS OWN READ PLACES IT, through `touches` (`reach.ts`), which the record asks too. The walk
 * here was a page's walk over every kind, so it read neither a script's `reads` and `writes` nor an arrival rule's
 * door, and a script reading Money, one writing it and a rule on the payroll door into Money were each filed beside
 * Inbox's new field under `register.inbox`. A rule with no row, a script naming no list and a door that polls were
 * filed the same way, and Decide then held all six from Inbox's readers, since `automations`, `scripts` and `actions`
 * refuse them each: filed as a change to a list whose readers would never be shown it. Each of those now names
 * `ANY_LIST` or `ACROSS`, and is refused with the whole-record sentence. The page walk also read `{{trigger.row.what}}`
 * in a rule as a list called `trigger`, and refused a rule on Inbox under Inbox's own name; a rule's run scope is
 * skipped now.
 *
 * A FIGURE IS READ THROUGH ITS METRIC, and only a metric the bundle carries can be read here: this runs on the body
 * alone, when it is filed and again when it is accepted. A page of figures names no list itself, which is how the Money
 * page leaked to a one-list reader once (`pages.ts` `registersOf`), so a figure this cannot resolve is refused rather
 * than taken as harmless. Propose that page under its own name. A door is read from the bundle, then as installed.
 */
function aboutOthers(sql: Sql, named: string, bundle: { id?: unknown; kind?: unknown; body?: unknown }[]): Refusal | null {
  const list = named.slice('register.'.length);
  const metrics = new Map<string, unknown>();
  for (const d of bundle) if (d?.kind === 'metric' && isMap(d.body) && typeof d.body.metric === 'string') metrics.set(d.body.metric, d.body);
  /* A TEMPLATE PAGE'S `{{what}}` IS ITS ROW'S FIELD, not a figure, and the bundle always carries the list it is named for. */
  const fields = fieldsOf(bundle.find((d) => d?.id === named)?.body);
  const resolve: Resolve = {
    figure: (id) => [metrics.get(id)],
    door: (door) => bundle.find((d) => d?.id === `ingest.${door}`)?.body ?? liveBody(sql, `ingest.${door}`),
    fields: (of) => (of === list ? fields : fieldsOf(liveBody(sql, `register.${of}`))),
  };
  for (const d of bundle) {
    if (d?.id === named || d?.kind === 'register') continue;
    const { lists, unknown } = touches(String(d.id), d.body, resolve);
    const other = [...lists].find((l) => l !== list);
    if (other !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix: whole(other)
          ? `This change is filed as a change to ${named}, and ${String(d.id)} in it reads across all of this BrainDog, so whoever reads ${named} would read all of it. Propose ${String(d.id)} as a change of its own.`
          : `This change is filed as a change to ${named}, and ${String(d.id)} in it reads register.${other}, so whoever reads ${named} would read about ${other}. Propose ${String(d.id)} as a change of its own.`,
        at: 'body.to',
      };
    const figure = [...unknown][0];
    if (figure !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix: `This change is filed as a change to ${named}, and ${String(d.id)} in it reads the figure ${figure}, which it does not carry, so nothing here can say whose list that figure counts. Add metric.${figure} to the bundle, or propose ${String(d.id)} as a change of its own.`,
        at: 'body.to',
      };
    const was = replacedAbout(sql, String(d.id), list, fields);
    if (was !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix:
          was === null
            ? `This change is filed as a change to ${named}, and ${String(d.id)} in it replaces one that reads a figure no live metric declares, or names no list at all, so it belongs to all of this BrainDog and not to ${named}. Propose ${String(d.id)} as a change of its own.`
            : whole(was)
              ? `This change is filed as a change to ${named}, and ${String(d.id)} in it replaces one that reads across all of this BrainDog, so whoever reads ${named} would be asked to change what everybody reads. Propose ${String(d.id)} as a change of its own.`
              : `This change is filed as a change to ${named}, and ${String(d.id)} in it replaces one that reads register.${was}, so whoever reads ${named} would be asked to change what ${was} shows. Propose ${String(d.id)} as a change of its own.`,
        at: 'body.to',
      };
    const reader = d.kind === 'metric' && isMap(d.body) && typeof d.body.metric === 'string' ? pageOfOthers(sql, d.body.metric, list, bundle) : undefined;
    if (reader !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix:
          reader.other === undefined
            ? `This change is filed as a change to ${named}, and ${String(d.id)} in it defines a figure ${reader.page} reads, which names no list, so nothing here can say whose page that is. Propose ${String(d.id)} as a change of its own.`
            : whole(reader.other)
              ? `This change is filed as a change to ${named}, and ${String(d.id)} in it defines a figure ${reader.page} reads, which reads across all of this BrainDog, so whoever reads ${named} would be asked to change what everybody reads. Propose ${String(d.id)} as a change of its own.`
              : `This change is filed as a change to ${named}, and ${String(d.id)} in it defines a figure ${reader.page} reads, which reads register.${reader.other}, so whoever reads ${named} would be asked to change what ${reader.other} shows. Propose ${String(d.id)} as a change of its own.`,
        at: 'body.to',
      };
  }
  return null;
}

/**
 * Whether a name `touches` gave is a read across the record or of any list rather than one list.
 *
 * ONE SENTENCE FOR BOTH, because to the member invited to one list the two say the same thing: what it proposes is not
 * about her list alone. Read as a list, `ANY_LIST` would have been told as "reads register.?".
 */
const whole = (name: string): boolean => name === ACROSS || name === ANY_LIST;

/** The live body of a declaration, parsed, or `undefined` for none. */
function liveBody(sql: Sql, id: string): unknown {
  const found = sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', id)?.body;
  return found === undefined ? undefined : JSON.parse(found);
}

/** The field ids of a register body, for a template page's `{{field}}`. */
function fieldsOf(body: unknown): ReadonlySet<string> {
  return new Set(isMap(body) && Array.isArray(body.fields) ? body.fields.map((f) => (isMap(f) ? f.id : undefined)).filter((f): f is string => typeof f === 'string') : []);
}

/**
 * An installed page or digest not about `list` that reads `figure` while no live metric declares it, if there is one.
 *
 * A PAGE READS A FIGURE BY NAME, WHATEVER STATE ITS METRIC IS IN, and `replacedAbout` reads only a live one: with
 * `metric.diary-count` retired, or never declared, a bundle under `register.obligations` defining it over Obligations
 * replaced nothing the guard could read, was filed, and a page of Diary then showed Obligations' count
 * (`govern-bundle-scope.test.ts`, all three cases measured filed before this). So the pages are asked instead. A figure
 * with a live metric is left to `replacedAbout`: its `source` already says whose it is, and a page reading it already
 * shows that list to whoever reads the page, so a page that reads Obligations among other lists is no bar to changing
 * Obligations' own figure. A page the bundle replaces is skipped, since its new body is what gets checked. A page that
 * names no list is refused too: nothing says whose it is, and an unknown is not a licence.
 */
function pageOfOthers(
  sql: Sql,
  figure: string,
  list: string,
  bundle: { id?: unknown }[],
): { page: string; other: string | undefined } | undefined {
  if (liveBody(sql, `metric.${figure}`) !== undefined) return undefined;
  const replaced = new Set(bundle.map((d) => d?.id));
  /* A DIGEST READS A FIGURE BY NAME TOO, as a `metric.<id>` section (`digest.ts`), and asking only the pages filed a
     Diary digest's retired figure redefined over Obligations. It is walked as the replaced digest is, with no page. */
  const readers = sql.all<{ id: string; body: string }>(
    "SELECT id, body FROM declaration WHERE kind IN ('page', 'digest') AND superseded_at IS NULL AND retired = 0 ORDER BY id",
  );
  /* A TEMPLATE'S `{{field}}` IS ITS ROW'S, read from the list it is for as installed. */
  const resolve: Resolve = {
    figure: (id) => (id === figure ? [] : [liveBody(sql, `metric.${id}`)]),
    door: (door) => liveBody(sql, `ingest.${door}`),
    fields: (of) => fieldsOf(liveBody(sql, `register.${of}`)),
  };
  for (const row of readers) {
    if (replaced.has(row.id)) continue;
    const { lists, unknown } = touches(row.id, JSON.parse(row.body), resolve);
    if (!unknown.has(figure)) continue;
    const other = [...lists].find((l) => l !== list);
    if (other !== undefined || lists.size === 0) return { page: row.id, other };
  }
  return undefined;
}

/**
 * The list other than `list` that the installed declaration under `id` is about, if there is one.
 *
 * WHAT A DECLARATION REPLACES IS ABOUT A LIST TOO, and reading only the new body let it through: `metric.diary-count`
 * redefined over Obligations was filed under `register.obligations`, it was accepted and installed, and every page
 * reading the Diary figure then read Obligations behind a question the queue showed as a change to Obligations. A rule,
 * a page and a digest under a Diary id with an Obligations body were filed the same way
 * (`govern-bundle-scope.test.ts`). The installed body's figures are read through the installed metrics, and its door as
 * installed, since those are what it reads now.
 *
 * AN INSTALLED BODY WHOSE EVERY FIGURE HAS NO LIVE METRIC IS NOBODY'S TO REPLACE, and it answers `null`. This once
 * dropped the figures it could not resolve, so a stat of a retired Diary figure, a stat of one never declared, a note
 * whose prose read a retired one and a digest whose only section was one each read as about no list, and all four were
 * filed under `register.obligations`, accepted and installed with Obligations bodies, while `pageOfOthers` refused the
 * same figure redefined from the same question. The rule is now the one `pageOfOthers` keeps: an unknown is not a
 * licence. A body that names a list besides its dead figure is judged by that list, since the page is already shown to
 * whoever reads it and the dead figure draws nothing.
 *
 * AND AN INSTALLED BODY THAT NAMES NO LIST AND NO FIGURE IS THE OWNER'S, and answers `null` too. It answered
 * `undefined`, which the caller reads as "about no other list", so a page of prose, a digest with no list in it or a
 * theme was replaced from one list's question, and Decide showed the whole-record change as a change to that list to a
 * colleague who decides only on it. A body nobody's list places is the whole record's, and only whoever reads the whole
 * record is asked about it, when it is proposed under its own name.
 */
function replacedAbout(sql: Sql, id: string, list: string, fields: ReadonlySet<string>): string | null | undefined {
  const was = liveBody(sql, id);
  if (was === undefined) return undefined;
  const { lists } = touches(id, was, {
    figure: (figure) => [liveBody(sql, `metric.${figure}`)],
    door: (door) => liveBody(sql, `ingest.${door}`),
    fields: (of) => (of === list ? fields : fieldsOf(liveBody(sql, `register.${of}`))),
  });
  if (lists.size === 0) return null;
  return [...lists].find((l) => l !== list);
}

/**
 * The shape of a `pack`, `settings` or `arrange` body.
 *
 * STRUCTURE ONLY, AND THE RECORD DOES THE REST. Whether a pack exists, what installing it would add, and
 * whether a setting takes a value are the record's to work out, from its catalogue and its packs, before the
 * body reaches here. What is held here is what the gate needs to apply it: one pack per verb, settings that
 * are a map of values, and an arrangement that changes something and says why.
 */
function checkArranging(deps: GovernDeps, kind: Arranging, body: Record<string, unknown>, cause: string | null = null): Refusal | null {
  const packId = (v: unknown, at: string): Refusal | null =>
    typeof v === 'string' && PACK_ID.test(v)
      ? null
      : {
          code: 'VALUE_MALFORMED',
          fix: `${JSON.stringify(v ?? null)} is not a pack id. A pack id is lower-case letters, digits and dashes, such as usecase-student.`,
          at,
        };

  const settings = (s: unknown, at: string): Refusal | null => {
    if (!isMap(s)) return { code: 'VALUE_MALFORMED', fix: 'A settings change is {"pack":"<id>","values":{"<setting>":<value>}}.', at };
    const bad = packId(s.pack, `${at}.pack`);
    if (bad) return bad;
    const values = s.values;
    if (!isMap(values) || Object.keys(values).length === 0)
      return {
        code: 'REQUIRED_MISSING',
        fix: 'A settings change names at least one setting and its new value; null puts one back to its default.',
        at: `${at}.values`,
      };
    for (const [key, v] of Object.entries(values)) {
      const bad = settingValue(s.pack as string, key, v, `${at}.values.${key}`);
      if (bad) return bad;
    }
    return null;
  };

  /* A VALUE AS ITS SETTING'S TYPE SAYS, where the pack is installed and declares the setting: a `list`
     is lines of text, and any other type is coerced as its field would be (`configValue`), so what the gate would refuse
     on apply is refused here, at the key. A pack the same arrangement installs, or a setting it does not declare, is
     the record's to check from its catalogue, and only the shape is held: text, a number, true or false, a list of
     text, or null for the default. */
  const settingValue = (pack: string, key: string, v: unknown, at: string): Refusal | null => {
    if (v === null) return null;
    const read = readPackConfig(deps.sql, pack);
    const decl = read.ok && Object.hasOwn(read.value.config, key) ? read.value.config[key] : undefined;
    if (decl !== undefined) {
      const out = configValue(key, decl, v, at);
      return out.ok ? null : 'refusal' in out ? out.refusal : { code: 'VALUE_MALFORMED', fix: `The setting ${key} does not take this value.`, at };
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return null;
    if (Array.isArray(v) && v.length > 0 && v.every((line) => typeof line === 'string' && line.trim() !== '')) return null;
    return { code: 'VALUE_MALFORMED', fix: `The setting ${key} takes text, a number, true or false, a list of text, or null for its default.`, at };
  };

  if (kind === 'pack') {
    /* OR AN ADD-ON MADE HERE TO PUBLISH TO THE STORE (`{ publish }`, the record's `arrange.ts`): it changes nothing in the
       record, and the owner's browser signs and sends the file on the yes. Alone, never beside a verb that installs. */
    if (body.publish !== undefined && PACK_VERBS.every((v) => body[v] === undefined)) return packId(body.publish, 'body.publish');
    const verbs = PACK_VERBS.filter((v) => body[v] !== undefined);
    if (verbs.length !== 1)
      return {
        code: 'REQUIRED_MISSING',
        fix: 'A pack proposal names one pack under one of install, enable or disable, such as {"install":"work"}.',
        at: 'body.install',
        allowed: PACK_VERBS,
      };
    const verb = verbs[0]!;
    const bad = packId(body[verb], `body.${verb}`);
    if (bad) return bad;
    if (body.doc !== undefined && (verb !== 'install' || !isMap(body.doc)))
      return { code: 'VALUE_MALFORMED', fix: 'doc is the pack document to install, and only install carries one.', at: 'body.doc' };
    return null;
  }

  if (kind === 'settings' && isMap(body.look))
    return typeof body.look.theme === 'string' && body.look.theme !== '' && Object.keys(body).every((k) => k === 'look' || k === 'rank' || k === 'lapses')
      ? null
      : { code: 'VALUE_MALFORMED', fix: 'A look pick is {"look":{"theme":"<an installed theme id>"}} and nothing else.', at: 'body.look' };
  if (kind === 'settings') return settings(body, 'body');

  /* AN ARRANGEMENT SAYS WHY. It is the one proposal that changes the shape of the whole record, and a
     person asked to accept one is owed the reasons in words: the phrases heard, or the rows it read. */
  const why = body.why;
  if (!Array.isArray(why) || why.length === 0 || why.length > ARRANGE_CEILING)
    return {
      code: 'REQUIRED_MISSING',
      fix: `An arrangement says why, as one to ${ARRANGE_CEILING} short reasons: {"why":["They added four assignments this week."]}.`,
      at: 'body.why',
    };
  for (const [i, w] of why.entries()) {
    const text = isMap(w) ? w.text : w;
    if (typeof text !== 'string' || !text.trim())
      return { code: 'VALUE_MALFORMED', fix: 'A reason is a sentence, or {"text":"...","at":"tasks#4"} when it cites a row.', at: `body.why[${i}]` };
  }

  let changes = 0;
  if (body.packs !== undefined) {
    if (!isMap(body.packs))
      return { code: 'VALUE_MALFORMED', fix: 'packs is {"install":[...],"enable":[...],"disable":[...]}, each a list of pack ids.', at: 'body.packs' };
    for (const [verb, ids] of Object.entries(body.packs)) {
      if (!(PACK_VERBS as readonly string[]).includes(verb))
        return { code: 'FIELD_UNKNOWN', fix: `packs takes ${PACK_VERBS.join(', ')}.`, at: `body.packs.${verb}`, allowed: PACK_VERBS };
      if (!Array.isArray(ids) || ids.length > ARRANGE_CEILING)
        return { code: 'VALUE_MALFORMED', fix: `packs.${verb} is a list of at most ${ARRANGE_CEILING} pack ids.`, at: `body.packs.${verb}` };
      for (const [i, id] of ids.entries()) {
        const bad = packId(id, `body.packs.${verb}[${i}]`);
        if (bad) return bad;
      }
      changes += ids.length;
    }
  }
  if (body.pages !== undefined) {
    if (!Array.isArray(body.pages) || body.pages.length > ARRANGE_CEILING)
      return {
        code: 'VALUE_MALFORMED',
        fix: `pages is a list of at most ${ARRANGE_CEILING} page declarations, each {"id":"page.<slug>","kind":"page","body":{...}}.`,
        at: 'body.pages',
      };
    for (const [i, d] of body.pages.entries())
      if (!isMap(d) || typeof d.id !== 'string' || !d.id.startsWith('page.') || d.kind !== 'page' || !isMap(d.body))
        return {
          code: 'VALUE_MALFORMED',
          fix: 'A page is {"id":"page.<slug>","kind":"page","body":{...}}. Read the page grammar for what a body holds.',
          at: `body.pages[${i}]`,
        };
    changes += body.pages.length;
  }
  if (body.settings !== undefined) {
    if (!Array.isArray(body.settings) || body.settings.length > ARRANGE_CEILING)
      return {
        code: 'VALUE_MALFORMED',
        fix: `settings is a list of at most ${ARRANGE_CEILING} changes, each {"pack":"<id>","values":{...}}.`,
        at: 'body.settings',
      };
    for (const [i, s] of body.settings.entries()) {
      const bad = settings(s, `body.settings[${i}]`);
      if (bad) return bad;
    }
    changes += body.settings.length;
  }
  /* ROWS A PLAN IS MADE OF, written in order when the arrangement is accepted. A row may point one ref field at a row
     before it in the same list of rows, by its position, because none of them has a sequence until it is written. */
  if (body.rows !== undefined) {
    if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > ARRANGE_ROWS)
      return {
        code: 'VALUE_MALFORMED',
        fix: `rows is a list of one to ${ARRANGE_ROWS} rows, each {"register":"<id>","fields":{...},"links":{"<field>":<position of an earlier row>}}.`,
        at: 'body.rows',
      };
    /* OR A PATCH: `{ register, at, version, patch }` and the fields it was read as, checked as a
       rowset's update is, list by list so each is counted in its place. */
    const rows = body.rows as unknown[];
    for (const register of new Set(rows.flatMap((r) => (isMap(r) && 'at' in r && typeof r.register === 'string' ? [r.register] : [])))) {
      const updates = rows.map((r) => {
        if (!isMap(r) || !('at' in r) || r.register !== register) return {};
        const { register: _list, before: _read, part: _part, group: _group, ...update } = r;
        return update;
      });
      const bad = checkUpdates(deps, register, updates);
      if (bad) return bad;
    }
    for (const [i, r] of body.rows.entries()) {
      if (isMap(r) && 'at' in r && typeof r.register === 'string') continue;
      if (!isMap(r) || typeof r.register !== 'string' || !isMap(r.fields))
        return { code: 'VALUE_MALFORMED', fix: 'A row is {"register":"<id>","fields":{...}}.', at: `body.rows[${i}]` };
      if (r.links !== undefined) {
        if (!isMap(r.links)) return { code: 'VALUE_MALFORMED', fix: 'links maps a field to the position of an earlier row.', at: `body.rows[${i}].links` };
        for (const [field, to] of Object.entries(r.links))
          if (typeof to !== 'number' || !Number.isInteger(to) || to < 0 || to >= i)
            return { code: 'VALUE_MALFORMED', fix: `A link points at an earlier row of the same arrangement, by its position from 0, and ${JSON.stringify(to)} is not one.`, at: `body.rows[${i}].links.${field}` };
      }
    }
    changes += body.rows.length;
  }
  /* DECLARATIONS (arrange-47): each `{ id, kind, body }`, checked as a change is when the record files it; here only
     their shape and how many, so an arrangement of only declarations is not refused as changing nothing. */
  if (body.declarations !== undefined) {
    if (!Array.isArray(body.declarations) || body.declarations.length > ARRANGE_CEILING)
      return { code: 'VALUE_MALFORMED', fix: `declarations is a list of at most ${ARRANGE_CEILING}, each {"id":"<kind>.<name>","kind":"<kind>","body":{...}}.`, at: 'body.declarations' };
    for (const [i, d] of body.declarations.entries())
      if (!isMap(d) || typeof d.id !== 'string' || typeof d.kind !== 'string' || !isMap(d.body))
        return { code: 'VALUE_MALFORMED', fix: 'A declaration is {"id":"<kind>.<name>","kind":"<kind>","body":{...}}.', at: `body.declarations[${i}]` };
    changes += body.declarations.length;
  }
  if (changes === 0)
    return {
      code: 'REQUIRED_MISSING',
      fix: 'An arrangement changes something: packs to install, enable or disable, pages, settings such as the voice, declarations, or entries.',
      at: 'body',
    };

  /* HOW STRONG IT IS AND THE DAY IT LAPSES, in shape here; a day already past is `propose`'s to refuse. */
  if (kind === 'arrange') {
    const bad = offerFault(body, null);
    if (bad) return bad;
    if (body.prediction !== undefined) { const wrong = checkPrediction(body.prediction); if (wrong) return wrong; }
  }

  /* THE ONE HOLDING THIS CAUSE IS NOT COUNTED: the proposal joins it, or widens it (step 8), and opens nothing. AT THE CAP
     a ranked arrangement that outranks a waiting one is let through, and `makeRoom` decides once the asker is known,
     since only the asker's own may give way. */
  const open = openArrangements(deps.sql, cause);
  if (open.length >= OPEN_ARRANGEMENTS) {
    const rank = kind === 'arrange' && typeof body.rank === 'number' ? body.rank : -1;
    if (!open.some((o) => rankOf(o.body) < rank)) return capRefusal(open);
  }
  return null;
}

/* ── the parts of an arrangement ────────────────────────── */

/**
 * One part of an arrangement, which an accept may take or leave: an install, a pack turned on or off, a page, a
 * settings change, the entries for one list, a declaration, or a choice. `id` is the handle an accept names it by, `name`
 * is what a person reads, and `needs` are the parts it cannot be taken without.
 *
 * THE IDS ARE THE ONES THE RECORD FILES on the body's `parts` (`arrange.ts` `partsOf`): `install:<pack>`,
 * `enable:<pack>`, `disable:<pack>`, `setting:<pack>`, `rows:<list>`, `page:<page>`, `declaration:<id>` and `choice:<id>`, so the ids the
 * owner's Decide reads off the question are the ones this accepts. Settings sent with an install fill that install, and
 * are part of it.
 */
export type ArrangePart = {
  id: string;
  kind: 'install' | 'enable' | 'disable' | 'page' | 'setting' | 'rows' | 'declaration' | 'choice';
  name: string;
  needs: string[];
};

const PART_VERBS = ['install', 'enable', 'disable'] as const;

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const textsOf = (v: unknown): string[] => listOf(v).filter((x): x is string => typeof x === 'string');

/** The first of `keys` an item carries as text, which is the part the record filed it under. */
function filedPart(item: unknown, keys: readonly string[]): string | null {
  if (!isMap(item)) return null;
  for (const k of keys) if (typeof item[k] === 'string' && (item[k] as string).trim()) return item[k] as string;
  return null;
}

/** A pack, a list or a declaration as a person reads it: the name the record filed, else its handle in plain words. */
function spokenName(names: Record<string, unknown>, key: string, handle: string): string {
  const filed = names[key];
  if (typeof filed === 'string' && filed.trim()) return filed.trim();
  const words = handle.replace(/^[a-z]+[.:]/u, '').replace(/[-_.]+/gu, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What the record's own label for a part says a pack or a list is called, `Add Stripe` or `Additions to Bills`, so the
 * kernel names it as Decide does. Null when the record filed no label of that shape.
 */
function labelled(body: Record<string, unknown>, by: 'pack' | 'register', id: string): string | null {
  const shape = by === 'pack' ? /^(?:Add|Update|Turn on|Turn off|Settings of) (.+)$/u : /^(?:Additions and changes|Additions|Changes) to (.+)$/u;
  for (const p of listOf(body.parts)) {
    const said = isMap(p) && p[by] === id && typeof p.label === 'string' ? shape.exec(p.label.trim())?.[1] : undefined;
    if (said) return said;
  }
  return null;
}

/**
 * The part each plan step, page, setting, entry and declaration of a body belongs to, by its place in its list: the part
 * the record filed on it (`part`, or a row's `group`), else the one the record's ids give it, so a body filed before
 * parts existed still splits. Entries for one list are one part unless the record grouped them. A setting, or a plan
 * step, for an add-on the same body installs is that install's.
 */
function placesOf(body: Record<string, unknown>) {
  const installing = new Set(textsOf(isMap(body.packs) ? body.packs.install : undefined));
  const ofPack = (pack: string) => (installing.has(pack) ? `install:${pack}` : `setting:${pack}`);
  const plan = listOf(body.plan).map((e) => (isMap(e) && typeof e.pack === 'string' ? (e.replan === true ? ofPack(e.pack) : `install:${e.pack}`) : null));
  const pages = listOf(body.pages).map((p) => filedPart(p, ['part']) ?? (isMap(p) && typeof p.id === 'string' ? `page:${p.id.replace(/^page\./u, '')}` : null));
  const settings = listOf(body.settings).map((s) => filedPart(s, ['part']) ?? (isMap(s) && typeof s.pack === 'string' ? ofPack(s.pack) : null));
  const declarations = listOf(body.declarations).map((d) => filedPart(d, ['part']) ?? (isMap(d) && typeof d.id === 'string' ? `declaration:${d.id}` : null));
  const rows = listOf(body.rows).map((r) => filedPart(r, ['part', 'group']) ?? (isMap(r) && typeof r.register === 'string' ? `rows:${r.register}` : null));
  return { plan, pages, settings, declarations, rows };
}

/** The settings a declaration reads, `{{config:<key>}}`, anywhere in it. */
const settingsRead = (decl: unknown): string[] => [...JSON.stringify(decl ?? null).matchAll(/\{\{config:([a-z0-9_]+)\}\}/giu)].map((m) => m[1]!);

/**
 * The parts of an arrangement, in the order it applies them, each with what it needs.
 *
 * WHAT A PART NEEDS IS WORKED OUT HERE FROM THE BODY, and the record's own `parts` list (`requires`) can only add to it,
 * so a proposer cannot loosen what goes together: a setting
 * fills the install of its pack when the same arrangement installs it; a declaration or page that reads a setting needs
 * the settings that set it; entries need the install or declaration that makes their list; an install needs the
 * installs its plan says it requires. Entries that point at each other by place go together both ways, because a place
 * means nothing once one side is gone.
 */
export function partsOf(body: Record<string, unknown>): ArrangePart[] {
  const names = isMap(body.names) ? body.names : {};
  const out = new Map<string, ArrangePart>();
  const add = (id: string, kind: ArrangePart['kind'], name: string): ArrangePart => {
    const had = out.get(id);
    if (had) return had;
    const part = { id, kind, name, needs: [] as string[] };
    out.set(id, part);
    return part;
  };
  const need = (part: ArrangePart, on: string) => {
    if (on !== part.id && out.has(on) && !part.needs.includes(on)) part.needs.push(on);
  };
  const pack = (id: string) => (typeof names[`pack.${id}`] === 'string' ? null : labelled(body, 'pack', id)) ?? spokenName(names, `pack.${id}`, id);
  const packs = isMap(body.packs) ? body.packs : {};
  for (const verb of PART_VERBS)
    for (const id of textsOf(packs[verb]))
      add(`${verb}:${id}`, verb, verb === 'install' ? `the ${pack(id)} plugin` : `turning ${verb === 'enable' ? 'on' : 'off'} ${pack(id)}`);

  const at = placesOf(body);
  for (const [i, p] of listOf(body.pages).entries()) {
    const id = at.pages[i];
    if (!id || !isMap(p)) continue;
    const title = isMap(p.body) && typeof p.body.title === 'string' && p.body.title.trim() ? p.body.title.trim() : null;
    add(id, 'page', `the ${typeof p.id === 'string' && typeof names[p.id] === 'string' ? names[p.id] : (title ?? spokenName(names, id, id))} page`);
  }
  for (const [i, s] of listOf(body.settings).entries()) {
    const id = at.settings[i];
    if (id && isMap(s) && typeof s.pack === 'string') add(id, 'setting', `the settings for ${pack(s.pack)}`);
  }
  for (const [i, d] of listOf(body.declarations).entries()) {
    const id = at.declarations[i];
    if (!id || !isMap(d)) continue;
    const own = isMap(d.body) ? (typeof d.body.name === 'string' ? d.body.name : typeof d.body.title === 'string' ? d.body.title : null) : null;
    const handle = typeof d.id === 'string' ? d.id : id;
    add(id, 'declaration', `the ${own?.trim() || `${spokenName(names, handle, handle)}${typeof d.kind === 'string' ? ` ${d.kind}` : ''}`}`);
  }
  for (const [i, r] of listOf(body.rows).entries()) {
    const id = at.rows[i];
    if (id && isMap(r) && typeof r.register === 'string')
      add(id, 'rows', `the entries for ${(typeof names[`register.${r.register}`] === 'string' ? null : labelled(body, 'register', r.register)) ?? spokenName(names, `register.${r.register}`, r.register)}`);
  }
  /* A CHOICE THE RECORD FILED AS A PART, which travels with the half that takes it. */
  for (const p of listOf(body.parts))
    if (isMap(p) && p.kind === 'choice' && typeof p.id === 'string') add(p.id, 'choice', `the choice ${typeof p.label === 'string' && p.label.trim() ? `"${p.label.trim()}"` : 'left to you'}`);

  /* WHAT EACH NEEDS, now that every part is known. */
  const plan = listOf(body.plan).filter(isMap);
  const installing = (declId: string) => plan.filter((e) => typeof e.pack === 'string' && textsOf(e.adds).includes(declId)).map((e) => `install:${String(e.pack)}`);
  for (const e of plan) {
    const part = out.get(`install:${String(e.pack)}`);
    if (part) for (const q of textsOf(e.requires)) need(part, `install:${q}`);
  }
  const setters = listOf(body.settings).flatMap((s, i) => (isMap(s) && isMap(s.values) && at.settings[i] ? [{ id: at.settings[i]!, pack: String(s.pack), keys: Object.keys(s.values) }] : []));
  for (const s of setters) {
    const part = out.get(s.id);
    if (part) for (const verb of ['install', 'enable']) need(part, `${verb}:${s.pack}`);
  }
  const reading = (part: ArrangePart, decl: Record<string, unknown>) => {
    const keys = settingsRead(decl);
    for (const s of setters) if ((typeof decl.pack !== 'string' || decl.pack === s.pack) && s.keys.some((k) => keys.includes(k))) need(part, s.id);
    if (typeof decl.pack === 'string') need(part, `install:${decl.pack}`);
  };
  for (const [i, p] of listOf(body.pages).entries()) if (at.pages[i] && isMap(p)) reading(out.get(at.pages[i]!)!, p);
  for (const [i, d] of listOf(body.declarations).entries()) if (at.declarations[i] && isMap(d)) reading(out.get(at.declarations[i]!)!, d);
  const declaring = new Map(listOf(body.declarations).flatMap((d, i) => (isMap(d) && typeof d.id === 'string' && at.declarations[i] ? [[d.id, at.declarations[i]!] as const] : [])));
  for (const [i, r] of listOf(body.rows).entries()) {
    const id = at.rows[i];
    if (!id || !isMap(r) || typeof r.register !== 'string') continue;
    const part = out.get(id)!;
    const list = `register.${r.register}`;
    for (const by of installing(list)) need(part, by);
    const decl = declaring.get(list);
    if (decl) need(part, decl);
    for (const to of Object.values(isMap(r.links) ? r.links : {})) {
      const other = typeof to === 'number' ? at.rows[to] : undefined;
      if (other && other !== id) {
        need(part, other);
        need(out.get(other)!, id);
      }
    }
  }
  for (const p of listOf(body.parts)) {
    const part = isMap(p) && typeof p.id === 'string' ? out.get(p.id) : undefined;
    if (part) for (const on of [...textsOf((p as Record<string, unknown>).requires), ...textsOf((p as Record<string, unknown>).needs)]) need(part, on);
  }
  return [...out.values()];
}

/**
 * The arrangement holding only the parts in `keep`, with everything that says what it is kept on both halves: why, the
 * names, the use case and the calls out it shows. A call out shown for an install not taken asks nothing of the record,
 * because each install is armed with its own plan's lines (`arrange.ts` `apply`), never the body's.
 *
 * ENTRIES POINT AT EACH OTHER BY PLACE, so the places are counted again in what is kept. A link whose entry was left is
 * never seen here: `partsOf` makes the two go together.
 */
function narrowArrangement(body: Record<string, unknown>, keep: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  const at = placesOf(body);
  const set = (key: string, items: unknown[]) => {
    if (items.length === 0) delete out[key];
    else out[key] = items;
  };
  if (isMap(body.packs)) {
    const packs: Record<string, unknown> = {};
    for (const verb of PART_VERBS) {
      const ids = textsOf(body.packs[verb]).filter((id) => keep.has(`${verb}:${id}`));
      if (ids.length > 0) packs[verb] = ids;
    }
    out.packs = packs;
  }
  for (const key of ['plan', 'pages', 'settings', 'declarations'] as const)
    if (body[key] !== undefined) set(key, listOf(body[key]).filter((_, i) => keep.has(at[key][i] ?? '')));
  if (body.rows !== undefined) {
    const rows = listOf(body.rows);
    const place = new Map<number, number>();
    for (const i of rows.keys()) if (keep.has(at.rows[i] ?? '')) place.set(i, place.size);
    set(
      'rows',
      [...place.keys()].map((i) => {
        const r = rows[i] as Record<string, unknown>;
        if (!isMap(r.links)) return r;
        const links = Object.fromEntries(Object.entries(r.links).flatMap(([f, to]) => (typeof to === 'number' && place.has(to) ? [[f, place.get(to)!]] : [])));
        return { ...r, links };
      }),
    );
  }
  if (Array.isArray(body.parts)) set('parts', body.parts.filter((p) => isMap(p) && typeof p.id === 'string' && keep.has(p.id)));
  /* EACH HALF SAYS ONLY ITS OWN KEYS AND CALLS (arrange-47): a need keeps the parts it names that are kept, and goes
     when none is; a call goes with its part. */
  if (Array.isArray(body.needs))
    set(
      'needs',
      body.needs.flatMap((n) => {
        if (!isMap(n) || !Array.isArray(n.parts)) return [n];
        const parts = n.parts.filter((p) => typeof p === 'string' && keep.has(p));
        return parts.length === 0 ? [] : [{ ...n, parts }];
      }),
    );
  if (Array.isArray(body.calls)) set('calls', body.calls.filter((c) => !isMap(c) || typeof c.part !== 'string' || keep.has(c.part)));
  /* THE SENTENCE'S CALLS GO WITH THEIR PART TOO (calls-out-59): a partial yes leaves only the calls still to arm. */
  if (Array.isArray(body.calls_out)) set('calls_out', body.calls_out.filter((c) => !isMap(c) || typeof c.part !== 'string' || keep.has(c.part)));
  return out;
}

/**
 * Parts taken and then not applied, laid back on the question that still holds the rest: what was taken first, as it
 * applies first, and the rest after it, with the places the rest's entries point at moved past the taken ones.
 */
function mergeArrangement(rest: Record<string, unknown>, taken: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rest };
  const both = (key: string) => [...listOf(taken[key]), ...listOf(rest[key])];
  const set = (key: string, items: unknown[]) => {
    if (items.length > 0) out[key] = items;
  };
  const a = isMap(taken.packs) ? taken.packs : {};
  const b = isMap(rest.packs) ? rest.packs : {};
  const packs: Record<string, unknown> = {};
  for (const verb of PART_VERBS) {
    const ids = [...new Set([...textsOf(a[verb]), ...textsOf(b[verb])])];
    if (ids.length > 0) packs[verb] = ids;
  }
  if (taken.packs !== undefined || rest.packs !== undefined) out.packs = packs;
  for (const key of ['plan', 'pages', 'settings', 'declarations', 'parts', 'calls', 'calls_out']) set(key, both(key));
  /* A NEED BY ITS LABEL, with the union of the parts each half named it for. */
  const needs = new Map<string, Record<string, unknown>>();
  const loose: unknown[] = [];
  for (const n of both('needs')) {
    if (!isMap(n) || typeof n.label !== 'string') {
      loose.push(n);
      continue;
    }
    const held = needs.get(n.label);
    needs.set(n.label, held ? { ...held, parts: [...new Set([...textsOf(held.parts), ...textsOf(n.parts)])] } : n);
  }
  set('needs', [...needs.values(), ...loose]);
  const first = listOf(taken.rows).length;
  set('rows', [
    ...listOf(taken.rows),
    ...listOf(rest.rows).map((r) =>
      isMap(r) && isMap(r.links) ? { ...r, links: Object.fromEntries(Object.entries(r.links).map(([f, to]) => [f, typeof to === 'number' ? to + first : to])) } : r,
    ),
  ]);
  if (isMap(taken.names) || isMap(rest.names)) out.names = { ...(isMap(taken.names) ? taken.names : {}), ...(isMap(rest.names) ? rest.names : {}) };
  const approve = [...new Set([...textsOf(taken.approve), ...textsOf(rest.approve)])];
  if (approve.length > 0) out.approve = approve;
  return out;
}

/* ── what an option writes ─────────────────────────────────────────── */

/** An entry by its spoken id, `recurring#5`, whose list is the part before the `#`. */
const SPOKEN_AT = /^([a-z][a-z0-9_-]{0,31})#[1-9]\d*$/u;

/** The most entries one option may change, as a rowset's ceiling. */
const OPTION_PATCHES = MAX_ROWS;

/**
 * An option's `patches` by list: each `{ at, version, patch }`, with `register` when `at` is not a spoken id that names
 * its list. A refusal when one cannot say which list it is about.
 */
function patchLists(raw: unknown, at: string): Result<Map<string, Record<string, unknown>[]>> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > OPTION_PATCHES)
    return no('VALUE_MALFORMED', `patches is a list of one to ${OPTION_PATCHES} changes, each {"at":"recurring#5","version":3,"patch":{"day_of_month":"last"}}.`, { at });
  const out = new Map<string, Record<string, unknown>[]>();
  for (const [i, p] of raw.entries()) {
    if (!isMap(p)) return no('VALUE_MALFORMED', 'Each patch is {"at":"recurring#5","version":3,"patch":{...}}.', { at: `${at}[${i}]` });
    const { register, ...row } = p;
    const list = typeof register === 'string' ? register : typeof p.at === 'string' ? SPOKEN_AT.exec(p.at)?.[1] : undefined;
    if (list === undefined)
      return no('VALUE_MALFORMED', `${JSON.stringify(p.at ?? null)} does not say which list it is in. Name the entry as recurring#5, or add "register".`, { at: `${at}[${i}].at` });
    out.set(list, [...(out.get(list) ?? []), row]);
  }
  return ok(out);
}

/**
 * Whether an option's `patches` can be applied as filed: each list is here, and each entry is checked as a rowset's
 * update is (`checkUpdates`): live, read at a version, changing something, once.
 */
function patchesFault(deps: GovernDeps, raw: unknown, at: string): Refusal | null {
  const lists = patchLists(raw, at);
  if (!lists.ok) return 'refusal' in lists ? lists.refusal : null;
  for (const [list, rows] of lists.value) {
    if (!deps.hasRegister(list)) return { code: 'REGISTER_UNKNOWN', fix: `There is no list called ${list}.`, at };
    const bad = checkUpdates(deps, list, rows);
    if (bad) return { ...bad, at: bad.at?.replace(/^body\.rows/u, at) ?? at };
  }
  return null;
}

/**
 * The first word of an option that moves entries along: close them, mark them done, move them, file them. Only words
 * that say nothing but a change to rows: "Drop it" or "Merge them" may be a list's field or the record's own merge,
 * which the asker carries out on its own way.
 */
const CHANGES = /^(?:archive|cancel|close|complete|file|finish|mark|move|reopen|retire|supersede|tick)\b/iu;

/**
 * The refusal for an agent's option that says a change and carries none, or `null`.
 *
 * MEASURED ON THE LIVE RECORD: "Close all six" was an option of words only. The owner picked it, the decision was kept,
 * and the six tasks stayed open, because nothing but `patches` is ever written at a press and the agent that asked was
 * gone by then. So an option a run files that starts with a change carries the changes, or the question is a rowset.
 */
function unwritten(body: Record<string, unknown>): Refusal | null {
  for (const [n, o] of listOf(body.options).entries()) {
    if (!isMap(o) || o.patches !== undefined || typeof o.label !== 'string' || !CHANGES.test(o.label.trim())) continue;
    return {
      code: 'REQUIRED_MISSING',
      fix: `"${o.label.trim()}" says a change, and picking it would write nothing. Give it the changes it makes as patches, [{"at":"tasks#12","version":3,"patch":{"state":"done"}}], or ask it as a rowset.`,
      at: `body.options[${n}].patches`,
    };
  }
  return null;
}

/** What a pick's patches came to: the entries written, and the ones left because they changed since or are gone. */
type Patched = { wrote: string[]; skipped: number; first: string | null };

/**
 * The picked option's patches, written as the person deciding in the decision's batch: EACH ENTRY STILL AS IT WAS ASKED.
 * An entry at the version it was read at is written; one that moved since is written onto the row as it is now when
 * nothing the patch changes was written since (`moved`), as a rowset's row is; one whose changed fields were written to
 * something else, or that is gone, is left as it is and counted in `skipped`, with the first one's name in `first`.
 *
 * IT WAS ALL OR NONE, MEASURED ON THE LIVE RECORD: "File them" carried two hundred entries, one of them was edited a day
 * later, and every yes was refused with nothing written. The question could never be answered and stayed for ever. The
 * writes still compare-and-set, as a rowset's do, and one that will not land refuses the whole pick.
 */
function applyPatches(deps: GovernDeps, asked: string, raw: unknown, actor: string, batch: string): Result<Patched> {
  const lists = patchLists(raw, 'patches');
  if (!lists.ok) return lists as Result<Patched>;
  const out: Patched = { wrote: [], skipped: 0, first: null };
  const skip = (fields: string | undefined): void => {
    out.skipped += 1;
    if (out.first !== null || fields === undefined) return;
    const name = ['title', 'name', 'label', 'what'].map((k) => parse(fields)?.[k]).find((v): v is string => typeof v === 'string' && v.trim() !== '');
    out.first = name?.trim() ?? null;
  };
  for (const [list, rows] of lists.value)
    for (const r of rows) {
      const row = deps.row(list, String(r.at));
      const now = row && !row.deleted ? deps.sql.one<{ version: number; fields: string }>('SELECT version, fields FROM entry WHERE id = ?', row.id) : null;
      if (!now) {
        skip(undefined);
        continue;
      }
      let version = Number(r.version);
      if (now.version !== version) {
        const met = moved(deps, asked, list, r);
        if (met === null || !met.ok) {
          skip(now.fields);
          continue;
        }
        version = met.version;
      }
      /* AN ENTRY ALREADY AS ASKED IS LEFT AS IT IS, neither written nor counted as changed: what the pick says is already
         true of it. Measured on a live record: two hundred entries were filed in their books by another answer, and "File
         them" on the older question then wrote the same book onto each again, two hundred lines saying nothing. */
      if (alreadySo(now.fields, r.patch)) continue;
      const made = applyUpdate(deps, list, { ...r, version }, actor, batch);
      if (!made.ok) return made as Result<Patched>;
      out.wrote.push(made.value.id);
    }
  return ok(out);
}

/** Whether every field a patch sets already holds that value, so writing it would change nothing. A delete never is. */
function alreadySo(fields: string, patch: unknown): boolean {
  if (!isPlain(patch) || Object.keys(patch).length === 0 || Object.hasOwn(patch, 'deleted_at')) return false;
  const held = parse(fields) ?? {};
  return Object.entries(patch).every(([f, v]) => canon(v ?? null) === canon(held[f] ?? null));
}

/** The line a pick that left some of its entries says, counted, so the owner knows what was not written and why. */
function skippedSaid(p: Patched): string {
  const n = p.skipped;
  const which = n === 1 && p.first !== null ? `"${p.first}" was` : n === 1 ? 'One entry was' : `${n} entries were`;
  const wrote = p.wrote.length === 1 ? 'One was written.' : `${p.wrote.length} were written.`;
  return `${wrote} ${which} left as ${n === 1 ? 'it is' : 'they are'}, because ${n === 1 ? 'it' : 'they'} changed after this was asked.`;
}

/**
 * The keys a `rowset` row that updates carries, and nothing beside them. `register` is a live list the row is in when it
 * is not the rowset's own, so one question can fold a list and move the links another list holds to it.
 */
const UPDATE_KEYS = ['at', 'version', 'patch', 'register'];

/**
 * The rows of a `rowset` that update: `{ at, version, patch }`, where a row without `at` creates.
 *
 * CHECKED AT FILING, for the reason every body is: the row it names exists and is live, the version
 * it was read at is there to compare against, and the patch says something. Whether the patch is
 * valid is the write path's, at acceptance, as it is for the rows a rowset creates.
 */
function checkUpdates(deps: GovernDeps, register: string, rows: readonly Record<string, unknown>[]): Refusal | null {
  const named = new Set<string>();
  for (const [i, r] of rows.entries()) {
    if (!('at' in r)) continue;
    const where = `body.rows[${i}]`;
    if (r.register !== undefined && (typeof r.register !== 'string' || !deps.hasRegister(r.register)))
      return { code: 'REGISTER_UNKNOWN', fix: `There is no list called ${String(r.register)}. Leave register off for a row of ${register}.`, at: `${where}.register` };
    const list = typeof r.register === 'string' ? r.register : register;
    const row = typeof r.at === 'string' ? deps.row(list, r.at) : null;
    if (!row || row.deleted)
      return { code: 'VALUE_MALFORMED', fix: `${String(r.at)} is not a live row of ${list}.`, at: `${where}.at` };
    /* ONE UPDATE PER ROW. A second would be compared against the version the first leaves, so it
       could never apply, and the proposal would be one nobody can accept. */
    if (named.has(row.id))
      return { code: 'VALUE_MALFORMED', fix: `${String(r.at)} is updated twice. Put both changes in one patch.`, at: `${where}.at` };
    named.add(row.id);
    if (r.version === undefined)
      return {
        code: 'REQUIRED_MISSING',
        fix: 'An update carries the version its row was read at, so a row changed since is not overwritten.',
        at: `${where}.version`,
      };
    if (typeof r.version !== 'number' || !Number.isInteger(r.version) || r.version < 1)
      return { code: 'VALUE_MALFORMED', fix: 'version is the whole number the row was read at.', at: `${where}.version` };
    const patch = r.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0)
      return { code: 'VALUE_MALFORMED', fix: 'An update carries a patch: the fields it changes, with their new values.', at: `${where}.patch` };
    const extra = Object.keys(r).find((key) => !UPDATE_KEYS.includes(key));
    if (extra !== undefined)
      return { code: 'FIELD_UNKNOWN', fix: 'A row that updates carries at, version and patch, and register when it is in another list, and nothing beside them.', at: `${where}.${extra}` };
    const wrong = moveFault(deps.sql, list, row.id, String(r.at), patch as Record<string, unknown>, `${where}.patch`);
    if (wrong) return wrong;
  }
  return null;
}

/**
 * Whether a patch's move of state is one its list makes, asked as the write path will ask it at the press: a state the
 * list holds, a way it declares from where the row is now, and what that way needs filled.
 *
 * ASKED WHEN IT IS FILED, IN THE LIST'S OWN WORDS. A proposal to move a lesson to `retired` was filed and could never
 * apply, since learnings close as `superseded` or `reverted`, each with a why; the owner pressed yes and was refused. The
 * refusal names the states the list moves to from there, its finished ones and what they need, read off the list.
 */
function moveFault(sql: Sql, list: string, id: string, named: string, patch: Record<string, unknown>, at: string): Refusal | null {
  const decl = parse(sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', `register.${list}`)?.body ?? '');
  const state = typeof decl?.state === 'string' ? decl.state : null;
  if (decl === null || state === null || !Object.hasOwn(patch, state) || typeof patch[state] !== 'string') return null;
  const to = patch[state] as string;
  const field = listOf(decl.fields).find((f): f is Record<string, unknown> => isMap(f) && f.id === state);
  const held = parse(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', id)?.fields ?? '') ?? {};
  const from = typeof held[state] === 'string' ? (held[state] as string) : '';
  if (to === from) return null;
  const values = textsOf(field?.values);
  const move = isMap(field?.transitions) && isMap(field.transitions[from]) ? field.transitions[from] : null;
  const ways = move ? textsOf(move.to) : values;
  const needs = move ? textsOf(move.requires) : [];
  const or = (xs: readonly string[]) => new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(xs);
  const and = (xs: readonly string[]) => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(xs);
  const finished = textsOf(decl.done).filter((d) => ways.includes(d));
  const goes = `${from === '' ? `${named} moves` : `From ${from}, ${named} moves`} to ${ways.length === 0 ? 'no other state' : or(ways)}${needs.length === 0 ? '' : `, with ${and(needs)} filled`}.${finished.length === 0 ? '' : ` To close it, use ${or(finished)}.`}`;
  if (values.length > 0 && !values.includes(to))
    return { code: 'ENUM_VALUE_UNKNOWN', fix: `${list} has no state called ${to}. ${goes}`, at: `${at}.${state}`, allowed: ways };
  if (move && !ways.includes(to)) return { code: 'TRANSITION_ILLEGAL', fix: `${named} cannot go from ${from} to ${to}. ${goes}`, at: `${at}.${state}`, allowed: ways };
  const missing = needs.find((need) => patch[need] === undefined && held[need] === undefined);
  if (missing !== undefined) return { code: 'REQUIRED_MISSING', fix: `${named} leaves ${from} only with ${missing} filled, so put ${missing} in the same patch.`, at: `${at}.${missing}` };
  return null;
}

/**
 * What one update row of a rowset meets when its row moved after the question was asked (`moved`):
 *
 *   - `ok` with the version the row holds now, when nothing it changes was written since, so it applies onto the fresh
 *     row and keeps what moved beside it (a rename beside a new last seen);
 *   - `clash` with the fields it changes that were written since to another value, which no press can make true.
 *
 * MEASURED ON THE LIVE RECORD, 20 Oct: "Change the last seen of apify?" was asked at version 3, the row was renamed
 * before the owner answered, and every Accept was refused VERSION_STALE against the version the question still held,
 * which no read could change. The question waited for ever, and he had to decline it.
 *
 * SINCE THE QUESTION WAS FILED, by its `suggest` event and the row's events written after it, and only when those account
 * for every version the row moved. A question with no such event, or a row moved by something the log does not hold,
 * keeps the compare-and-set it always had.
 */
type Moved = { ok: true; version: number } | { ok: false; clash: string[]; fields: Record<string, unknown> } | null;
function moved(deps: GovernDeps, asked: string, list: string, r: Record<string, unknown>): Moved {
  const row = deps.row(list, String(r.at));
  if (!row || row.deleted) return null;
  /* A DELETE OR A MERGE TAKES THE WHOLE ROW, an edit made since with it, so it stays the house conflict. */
  if (isPlain(r.patch) && Object.hasOwn(r.patch, 'deleted_at')) return null;
  const now = deps.sql.one<{ version: number; fields: string }>('SELECT version, fields FROM entry WHERE id = ?', row.id);
  if (!now || now.version === Number(r.version)) return null;
  /* BY ROWID, THE ORDER THE LOG WAS WRITTEN IN: ids minted in one millisecond do not sort by when. */
  const filed = deps.sql.one<{ n: number }>("SELECT rowid AS n FROM event WHERE kind = 'suggest' AND target = ? ORDER BY rowid LIMIT 1", `suggestion:${asked}`)?.n;
  if (filed === undefined) return null;
  const lines = deps.sql.all<{ kind: string; field: string | null; write: string }>(
    "SELECT kind, field, coalesce(batch, id) AS write FROM event WHERE target = ? AND rowid > ? AND kind <> 'note'",
    `entry:${row.id}`,
    filed,
  );
  /* EVERY VERSION THE ROW MOVED IS A WRITE THE LOG HOLDS SINCE, or what moved it is not known: read before the question
     was filed, or written by a path that kept no line, and it stays the house conflict. */
  if (new Set(lines.map((l) => l.write)).size < now.version - Number(r.version)) return null;
  const since = new Set(lines.flatMap((e) => (e.kind === 'create' ? ['*'] : e.field === null ? [] : [e.field])));
  const fields = parse(now.fields) ?? {};
  const patch = isPlain(r.patch) ? r.patch : {};
  /* AN EDIT FOLDED INTO THE ROW'S CREATE, in its first moments, moves that line after the question and names no field,
     so every field the patch changes is taken as written since. */
  if (since.has('*')) for (const f of Object.keys(patch)) since.add(f);
  /* A FIELD WRITTEN SINCE TO THE VERY VALUE ASKED IS NO CLASH: what was asked is already so. */
  const clash = Object.keys(patch).filter((f) => since.has(f) && canon(patch[f] ?? null) !== canon(fields[f] ?? null));
  return clash.length === 0 ? { ok: true, version: now.version } : { ok: false, clash, fields };
}

const isPlain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The plain line a rowset question settles with when what it changes was written since to something else: the
 * fields by the names a person reads, and the row by its title. Nothing was written, and the question is closed.
 */
function movedSaid(deps: GovernDeps, list: string, clash: readonly string[], fields: Record<string, unknown>): string {
  const decl = parse(
    deps.sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', `register.${list}`)?.body ?? '',
  );
  const specs = Array.isArray(decl?.fields) ? (decl.fields as { id?: unknown; label?: unknown }[]) : [];
  const labels = clash.map((id) => {
    const label = specs.find((f) => f.id === id)?.label;
    const said = typeof label === 'string' && label.trim() !== '' ? label.trim() : id.replace(/[_-]+/gu, ' ');
    return /^\p{Lu}\p{Ll}/u.test(said) ? said[0]!.toLowerCase() + said.slice(1) : said;
  });
  const title = typeof decl?.title === 'string' ? fields[decl.title] : undefined;
  const named = typeof title === 'string' && title.trim() !== '' ? title.trim() : 'this entry';
  const what = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(labels);
  return `The ${what} of ${named} changed after this was asked, so nothing was written and the question is closed.`;
}

/**
 * One update row of an accepted `rowset`, as the person deciding, compare-and-set.
 *
 * A DELETE IS ITS OWN WRITE, after the fields. The write path logs a delete as a single event, so
 * the fields changed beside it would be missing from the history. The delete is compared against
 * the version the first write left.
 */
function applyUpdate(
  deps: GovernDeps,
  register: string,
  r: Record<string, unknown>,
  actor: string,
  batch: string,
): Result<{ id: string; version: number }> {
  /* THE ROW'S OWN LIST WHEN IT NAMES ONE, checked live when it was filed (`checkUpdates`). */
  const list = typeof r.register === 'string' ? r.register : register;
  const row = deps.row(list, String(r.at));
  if (!row) return no('VALUE_MALFORMED', `${String(r.at)} is no longer a row of ${list}.`, { at: 'body.rows' });
  const { deleted_at, ...fields } = r.patch as Record<string, unknown>;
  let version = Number(r.version);
  if (Object.keys(fields).length > 0) {
    const made = deps.write(list, fields, actor, batch, { id: row.id, version });
    if (!made.ok || deleted_at === undefined) return made;
    version = made.value.version;
  }
  return deps.write(list, { deleted_at }, actor, batch, { id: row.id, version });
}

/**
 * Whether a prediction can be settled at all.
 *
 * `PREDICTION_UNMEASURABLE` IS THE POINT OF THE CHECK (30 §6). It kills the entire class of
 * "improvements" that are vibes: a claim with no source, no value to read and no bound to compare
 * against cannot be wrong, and a loop whose proposals cannot be wrong learns nothing from being run.
 */
function checkPrediction(raw: unknown): Refusal | null {
  const unmeasurable = (fix: string, at: string): Refusal => ({ code: 'PREDICTION_UNMEASURABLE', fix, at });
  if (!raw || typeof raw !== 'object') return unmeasurable('A prediction is an object.', 'body.prediction');
  const p = raw as Record<string, unknown>;

  if (typeof p.claim !== 'string' || !p.claim.trim())
    return unmeasurable('A prediction says in one sentence what will be true.', 'body.prediction.claim');
  const m = p.measure as { source?: unknown; value?: unknown } | undefined;
  if (!m || typeof m !== 'object' || typeof m.source !== 'string' || !m.value)
    return unmeasurable('A prediction names what to read and where to read it.', 'body.prediction.measure');
  const target = p.target as Record<string, unknown> | undefined;
  if (!target || typeof target !== 'object' || Object.keys(target).length === 0)
    return unmeasurable('A prediction with no target cannot be met or missed.', 'body.prediction.target');
  /* AND ONE OF THE TWO BOUNDS THE SCORER CAN READ. `lt`, `gt` and `is` used to file cleanly and be
     unscoreable, and an unrecognised key silently turned off the already-true check as well. */
  const key = Object.keys(target)[0];
  if (Object.keys(target).length !== 1 || (key !== 'lte' && key !== 'gte') || typeof target[key] !== 'number')
    return {
      code: 'ENUM_VALUE_UNKNOWN',
      fix: 'A prediction takes one bound: { lte: <number> } or { gte: <number> }.',
      at: 'body.prediction.target',
      allowed: ['lte', 'gte'],
    };
  if (typeof p.window !== 'string' || !/^\d+[dhm]$/.test(p.window))
    return unmeasurable('A prediction says when to look: 30d, 90d.', 'body.prediction.window');
  if (p.on_miss !== undefined && p.on_miss !== 'suggest' && p.on_miss !== 'none')
    return { code: 'ENUM_VALUE_UNKNOWN', fix: 'One of: suggest, none.', at: 'body.prediction.on_miss', allowed: ['suggest', 'none'] };
  return null;
}

/* ── answering one ───────────────────────────────────────────────────────── */

export type Decided = {
  /** `D<n>` when it was decided, `null` when it was deferred. */
  decision: string | null;
  /**
   * The batch the decision was written in, on a decision: the rows an accepted rowset wrote wear it, and so do its
   * `decide` and `resolve` events, so "undo this decision" and "who accepted this row" are each one read of the log.
   * A caller that installs or applies what was accepted may sign that with it too.
   */
  batch?: string;
  suggestion: string;
  status: string;
  /** Rows an accepted `rowset` wrote. */
  wrote: string[];
  /**
   * The plain line an accepted `rowset` settled with instead, when what it changes was written since to something else
   * (`moved`): nothing was written, and the question is closed as moot.
   */
  settled?: string;
  /**
   * The entries a picked option's patches left as they are, because they changed after it was asked or are gone, and the
   * line that says so (`applyPatches`). The rest were written.
   */
  skipped?: { count: number; said: string };
  /** The open questions this one covered (`Proposal.covers`), closed as moot by its accept. */
  covered?: string[];
  /** A declaration an accepted `pattern` or `change` asks the caller to install. */
  install?: Record<string, unknown>;
  /**
   * The version an accepted `change` must find live when it installs, for the caller to pass as `install`'s `expect`:
   * the version a whole body was filed against, or the one an addition was merged onto.
   */
  expect?: { id: string; version: number };
  /**
   * Every member of an accepted bundle with the version it was drawn from, `expect` among them. `decide` has already
   * found each at its version; this is for a caller whose install can ask them all again in the transaction that writes,
   * which `install`'s single `expect` cannot yet.
   */
  expects?: { id: string; version: number }[];
  /**
   * An accepted `pack`, `settings` or `arrange`, for the caller to apply. Installing a pack is asynchronous,
   * like a `change`, so the gate hands the body back, and the caller reopens the question if it will not land.
   */
  apply?: { kind: Arranging; body: Record<string, unknown> };
  /**
   * An accepted retype or narrowing, for the caller to land through `retypeLanding` and `retypeLand`: its `to` as
   * filed, and the version of the list it was merged onto. Landing asks for that version again, and the caller reopens
   * the question if it will not land.
   */
  retype?: { to: Record<string, unknown>; expect?: { id: string; version: number } };
};

export type Verdict =
  /**
   * `rows`, on accepting a `rowset` only: the rows to write, by their place in the body from 0. The rest are declined
   * with the same decision, so a proposal of seven servers can take three. Leaving it out accepts every row.
   *
   * `parts`, on accepting an `arrange` only: the parts to take, by the ids `partsOf` gives. The rest stay open as the
   * same question, with its cause and its history. Leaving it out, or naming none, takes every part.
   */
  | { decide: { option: string; reason: string; rows?: number[]; parts?: string[] } }
  | { defer: { until: string; why: string } }
  | { resolved_as: 'wont-fix' | 'incorrect'; reason?: string }
  /**
   * Accepted by the additive rule and not by a person: only a `change` that `additiveFault` passes, answered as
   * `ADDITIVE_RULE` whatever `actor` says. The record sends it on an agent's own `propose`, and never from `decide`.
   *
   * `ladder`: accepted because the agent that filed it may make every kind of change it is without asking
   * (`ladderFault`), answered as `LADDER_RULE`. Its rows are signed by the run that filed them, since they are that
   * agent's changes and its byline is what Undo finds; a question Slash filed has its rows signed by the ladder.
   */
  | { rule: 'additive' | 'ladder' | 'handled'; swept?: true };

/** One approved line as a suggestion holds it: what accept reads of it before anything is armed. */
type SentLine = { key?: unknown; paged?: unknown; channel?: unknown; ingest?: unknown };

/**
 * The keychain labels one approved line sends, each to be looked up alone.
 *
 * A SCRIPT'S LINE HOLDS ITS KEYS JOINED, "a, b", because `Egress.key` is one string (`scriptEgress` in `actions.ts`),
 * and accept looked the joined text up as one label, so a script that sends two keys could never be accepted: the
 * answer was "Add the key called "a, b"". So a script's labels are read from the declaration being accepted, whose
 * `keys` is the list, and every other line's key is the one label it always was. A script line whose declaration is not
 * in what is installed falls back to its one string, which refuses rather than passes.
 */
function labelsSent(out: unknown, install: unknown): string[] {
  if (!isMap(out)) return [];
  const key = out.key;
  if (typeof key !== 'string') return [];
  if (out.channel === 'script') {
    const script = declared(install).find((d) => d.kind === 'script' && isMap(d.body) && d.body.script === out.ingest);
    const body = script === undefined ? undefined : script.body;
    const keys = isMap(body) ? body.keys : undefined;
    if (Array.isArray(keys) && keys.length > 0 && keys.every((k) => typeof k === 'string')) return keys as string[];
  }
  return [key];
}

/**
 * Why `actor` may not answer a question put to one member, or `null` when they may.
 *
 * A QUESTION AN AUTOMATION PUT TO ONE MEMBER (`ask_person`'s `to:`) IS THEIRS AND AN OWNER'S. The run waits on that
 * person's answer, and the owner is the one who can always step in; anybody else who can read the queue answering it
 * would move the run on a choice the rule never asked them for. A dismissal is held to the same people, since it ends
 * the run's wait as surely as a pick does. Putting it off is not an answer and is left to anyone who sees it.
 *
 * A RULE AND THE SYSTEM ARE LET THROUGH, because what they send here is the run withdrawing its own question
 * (`flow.ts`'s `release`), never a pick. The person is named by the name they gave, never by an id or an address.
 */
function heldTo(deps: GovernDeps, row: { id: string; body_kind: BodyKind; body: string }, actor: string): string | null {
  if (row.body_kind !== 'options') return null;
  const to = parse(row.body)?.to;
  if (typeof to !== 'string' || to === '' || actor === to) return null;
  if (actor.startsWith('rule:') || actor === 'system') return null;
  const owner = deps.sql.one<{ y: number }>("SELECT 1 AS y FROM member WHERE person_id = ? AND register = '*' AND level = 'owner' LIMIT 1", actor);
  if (owner) return null;
  const name = deps.sql.one<{ name: string | null }>('SELECT name FROM person WHERE id = ?', to)?.name?.trim();
  return `This question was put to ${name ? name : 'one member'}, so only they or an owner answer it.`;
}

/** The decision's sentence when a light question is answered in one press and the chosen option says no reason of its own. */
const ONE_PRESS_REASON = 'Answered in one press: a light question a rule or Slash asked, and answering it changes nothing else.';

/** The decision's sentence when any other question is answered in one press and nobody wrote one. */
const NO_REASON = 'Answered in one press, with no reason given.';

/** Whether a decision's reason is one the record wrote for a press, not words a person gave, so a receipt never quotes it as theirs. */
export function pressedOnly(reason: string): boolean {
  return reason === ONE_PRESS_REASON || reason === NO_REASON;
}

/**
 * The sentence a light question is decided with when nobody wrote one, or `null` when this question owes a reason.
 *
 * LIGHT IS TWO FACTS AND NEITHER IS THE PROPOSER'S TO CLAIM. The band is computed from what accepting would do
 * (`costOf`), and only `call`, a judgement with nothing attached, qualifies. The opener is the row's own `opened_by`:
 * a rule (`rule:<id>`) or Slash, the two that ask many small questions on their own. A person's or an agent's question
 * still asks why, because that is somebody asking somebody, and the sentence is the answer they are owed.
 *
 * THE SENTENCE IS THE CHOSEN OPTION'S OWN `because`, said to be the option's and not the decider's, so a decision cited
 * later reads as what it was. An option id that is not on the question gets the plain sentence, and the check that
 * follows refuses it by name.
 */
function oneAnswer(deps: GovernDeps, id: string, bodyKind: BodyKind, raw: string, option: string): string | null {
  const body = parse(raw);
  /* AND THE OPTION PICKED IS WEIGHED TOO (`pickCost`). A hard option beside a safe one leaves the question `call`
     since batch 64, and picking the hard one is still an answer that owes its reason. */
  const rows = costRows(deps.sql);
  if (!body || costOf(bodyKind, body, rows) !== 'call' || pickCost(bodyKind, body, option, rows) !== 'call') return null;
  /* AN OPTION THAT WRITES CHANGES SOMETHING ELSE, so the one-press sentence would not be true of it. */
  if (listOf(body.options).some((o) => isMap(o) && o.patches !== undefined)) return null;
  const by = deps.sql.one<{ by: string }>('SELECT opened_by AS by FROM suggestion WHERE id = ?', id)?.by ?? '';
  if (!by.startsWith('rule:') && by !== SLASH) return null;
  const picked = ((body.options ?? []) as { id?: unknown; because?: unknown }[]).find((o) => o?.id === option);
  const because = typeof picked?.because === 'string' ? picked.because.trim() : '';
  return because === '' ? ONE_PRESS_REASON : `Answered in one press, for the option's own reason: ${because}`;
}

/**
 * The gate.
 *
 * THE CHANGE AND THE DECISION ARE ONE TRANSACTION. An accepted `rowset` writes its rows here, beside
 * the `D<n>` that authorised them and wearing the same batch — so "undo this decision" is one query
 * rather than an archaeology exercise. A `pattern` or a `change` cannot be: installing a declaration
 * is asynchronous, so the caller is handed the body to install and this refuses to resolve the
 * suggestion until that has happened.
 */
export function decide(deps: GovernDeps, id: string, verdict: Verdict, actor: string, given: { batch?: string } = {}): Result<Decided> {
  const row = deps.sql.one<{ id: string; body_kind: BodyKind; body: string; status: string; opened_by: string }>(
    'SELECT id, body_kind, body, status, opened_by FROM suggestion WHERE id = ?',
    id,
  );
  if (!row) return no<Decided>('OUT_OF_BOUNDS', `There is no suggestion called ${id}.`, { at: 'id' });

  const at = instant(deps.nowMs);

  /* DEFER IS NOT A DECISION AND WRITES NO EVENT. "Not now, ask me on the ninth" is a thing that
     happened to the reader, not to the record — and a gate with only yes and no is a gate people
     clear by dismissing what they meant to think about. */
  if ('defer' in verdict) {
    if (row.status !== 'open')
      return no<Decided>('TRANSITION_ILLEGAL', `${id} is ${row.status}, and only an open suggestion can be deferred.`, {
        at: 'status',
        allowed: ['open'],
      });
    if (!verdict.defer?.until || !verdict.defer?.why?.trim())
      return no<Decided>('REQUIRED_MISSING', 'Deferring says when to ask again, and why it can wait.', { at: 'defer' });
    /* AND `when` IS AN ISO DATE, because it is compared as a STRING against an instant. Checking
       that it parses is not the same check and lets both failures through: `Oct 1 2026` parses and
       sorts after every date there will ever be, so the question leaves the open queue for ever
       while the gate keeps reporting it open; `10/01/2026` parses and sorts before today, so the
       deferral is a silent no-op. Both are the outcome this check exists to prevent, which is why
       it now tests the shape rather than the parse. */
    if (!/^\d{4}-\d{2}-\d{2}/.test(verdict.defer.until) || !Number.isFinite(Date.parse(verdict.defer.until)))
      return no<Decided>('VALUE_MALFORMED', `${verdict.defer.until} is not a date. Write 2026-10-01.`, { at: 'until' });
    deps.sql.exec('UPDATE suggestion SET defer_until = ?, defer_why = ? WHERE id = ?', verdict.defer.until, verdict.defer.why, id);
    return ok({ decision: null, suggestion: id, status: 'open', wrote: [] });
  }

  if (row.status !== 'open')
    return no<Decided>('TRANSITION_ILLEGAL', `${id} is ${row.status}, and a decision is made once.`, {
      at: 'status',
      allowed: ['open'],
    });

  const held = heldTo(deps, row, actor);
  if (held !== null) return no<Decided>('FORBIDDEN', held, { at: 'to' });

  /* THE RULE IS CHECKED HERE, NOT ONLY WHERE IT IS SENT. The gate is the one place every acceptance passes, so a caller
     that sent `rule` for a required field would otherwise have a person's accept without a person. Past this it is an
     ordinary accept, with every check an accept runs (`resolveTo`, `namesFault`, `fits`), signed by the rule. The
     resolution stays `addressed` because that is what `reopen` and the feed read as "accepted", and an install that
     will not land must come back to the queue exactly as a pressed one does. */
  let signer: string | null = null;
  if ('rule' in verdict) {
    if (verdict.rule !== 'additive' && verdict.rule !== 'ladder' && verdict.rule !== 'handled')
      return no<Decided>('ENUM_VALUE_UNKNOWN', `${String(verdict.rule)} is not a rule that answers questions.`, { at: 'rule', allowed: ['additive', 'ladder', 'handled'] });
    const ladder = verdict.rule === 'ladder';
    const handled = verdict.rule === 'handled';
    const why = handled
      ? handledFault(deps.sql, row, verdict.swept === true ? { agents: { nowMs: deps.nowMs } } : {})
      : ladder
        ? ladderFault(deps.sql, row, deps.nowMs)
        : row.body_kind === 'change'
          ? additiveFault(parse(row.body))
          : `A ${row.body_kind} is never answered by rule.`;
    if (why !== null) return no<Decided>('TRANSITION_ILLEGAL', `${id} waits for the owner. ${why}`, { at: 'rule' });
    /* A HANDLED CHANGE SAYS WHY: the question's own first reason when it carried one, else the rule's plain sentence. */
    const own = handled ? parse(row.body)?.why : undefined;
    const said = Array.isArray(own) && typeof own[0] === 'string' && own[0].trim() !== '' ? own[0].trim() : typeof own === 'string' && own.trim() !== '' ? own.trim() : HANDLED_REASON;
    verdict = { decide: { option: 'accept', reason: handled ? said : ladder ? LADDER_REASON : ADDITIVE_REASON } };
    actor = handled ? HANDLED_RULE : ladder ? LADDER_RULE : ADDITIVE_RULE;
    /* SLASH'S ROWS ARE THE LADDER'S. A model writes only suggest, propose and predict (`slash.ts`), so the rows of a
       question Slash filed are signed by the rule that let them land, and Slash stays on the question as its filer. */
    if (ladder && row.opened_by !== SLASH) signer = row.opened_by;
  }

  /* NO IS AN ANSWER AND IS RECORDED AS ONE. `incorrect` also feeds the brake: a class of proposal
     that keeps being wrong stops being proposed, and it can only learn that from being told. */
  if ('resolved_as' in verdict) {
    if (verdict.resolved_as !== 'wont-fix' && verdict.resolved_as !== 'incorrect')
      return no<Decided>('ENUM_VALUE_UNKNOWN', `${String(verdict.resolved_as)} is not a way to resolve one.`, {
        at: 'resolved_as',
        allowed: ['wont-fix', 'incorrect'],
      });
    deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = ? WHERE id = ?", verdict.resolved_as, id);
    /* A PAGE SLASH ASKED FOR AND WAS TOLD NO ABOUT IS DISMISSED IN THE PEN TOO (offer-pen-50): one place an offer, so the
       holding pen never offers the page Decide just turned down. */
    if (row.opened_by === SLASH && row.body_kind === 'arrange') penDismissed(deps, actor, slashPageList(row.body), at);
    event(deps, at, actor, 'resolve', `suggestion:${id}`, 'suggestion', verdict.resolved_as, verdict.reason);
    if (verdict.resolved_as === 'incorrect')
      deps.sql.exec(
        "INSERT INTO observation (kind, subject, day, n) VALUES ('suggestion.incorrect', ?, ?, 1) ON CONFLICT (kind, subject, day) DO UPDATE SET n = n + 1",
        row.body_kind,
        new Date(deps.nowMs).toISOString().slice(0, 10),
      );
    return ok({ decision: null, suggestion: id, status: 'resolved', wrote: [] });
  }

  const { option } = verdict.decide ?? { option: '' };
  let reason = verdict.decide?.reason;
  /* EVERY QUESTION IS ANSWERED IN ONE PRESS, AND EVERY DECISION STILL CARRIES A SENTENCE, because
     `decision.reason` is what renders wherever it is cited. Demanding one before the press taught people to type "ok",
     the failure 20 §3 warns of, and cost a round trip on every answer. A light question a rule or Slash opened (band
     `call`, `weigh.ts`) is decided for its option's own reason; any other says plainly that no reason was given, so
     nobody later reads a reason into it. A reason is offered after a decline or an edit, and never demanded. */
  if (!reason?.trim()) reason = oneAnswer(deps, id, row.body_kind, row.body, option) ?? NO_REASON;
  if (!option?.trim()) return no<Decided>('REQUIRED_MISSING', 'A decision names what was chosen.', { at: 'option' });

  const body = parse(row.body);
  /* A QUESTION THIS RECORD CANNOT READ IS NOT A QUESTION IT CAN ANSWER. It used to resolve as
     `addressed` with a `D<n>` behind it and nothing written — the gate saying yes to something it
     had not read. */
  if (!body) return no<Decided>('VALUE_MALFORMED', `${id} carries a body BrainDog cannot read.`, { at: 'body' });

  if (row.body_kind === 'options') {
    const ids = ((body.options ?? []) as { id?: string }[]).map((o) => o.id).filter((x): x is string => typeof x === 'string');
    if (!ids.includes(option))
      return no<Decided>('ENUM_VALUE_UNKNOWN', `${option} is not one of the options on ${id}.`, {
        at: 'option',
        allowed: ids,
      });
  }

  /* AND EVERY OTHER KIND TAKES ONE OF TWO WORDS. `Accept` with a capital, or `yes`, used to
     fall past the `accept` branch and resolve the question having done nothing — the gate silently
     answering yes and applying none of it. */
  if (row.body_kind !== 'options' && option !== 'accept' && option !== 'reject')
    return no<Decided>('ENUM_VALUE_UNKNOWN', `A ${row.body_kind} is accepted or rejected, and ${option} is neither.`, {
      at: 'option',
      allowed: ['accept', 'reject'],
    });

  /* SOME OF A ROWSET, BY PLACE. Accepted rows are written and the rest are declined by this one decision. */
  const picked = 'decide' in verdict ? verdict.decide.rows : undefined;
  let only: Set<number> | null = null;
  if (picked !== undefined) {
    const count = Array.isArray(body.rows) ? body.rows.length : 0;
    if (row.body_kind !== 'rowset' || option !== 'accept')
      return no<Decided>('VALUE_MALFORMED', 'rows picks which rows of a rowset to accept, so it goes only with accept on a rowset.', { at: 'rows' });
    if (!Array.isArray(picked) || picked.length === 0 || picked.some((n) => !Number.isInteger(n) || n < 0 || n >= count) || new Set(picked).size !== picked.length)
      return no<Decided>('OUT_OF_BOUNDS', `rows names the rows to accept by place, each once, from 0 to ${String(count - 1)}. To accept none, reject it.`, { at: 'rows' });
    only = new Set(picked);
  }

  /* SOME OF AN ARRANGEMENT, BY PART. What is taken is applied as one, all or none, and the rest stays
     open as the same question: its id, its cause and its history. A part another part needs is never taken alone, and
     the refusal names both as the owner reads them. Every part named is every part, which is an accept as it always was. */
  const naming = 'decide' in verdict ? verdict.decide.parts : undefined;
  let taking: { taken: Record<string, unknown>; rest: Record<string, unknown>; parts: string[] } | null = null;
  if (naming !== undefined && !(Array.isArray(naming) && naming.length === 0)) {
    if (row.body_kind !== 'arrange' || option !== 'accept')
      return no<Decided>('VALUE_MALFORMED', 'parts picks which parts of an arrangement to accept, so it goes only with accept on an arrangement.', { at: 'parts' });
    const all = partsOf(body);
    const ids = all.map((p) => p.id);
    if (!Array.isArray(naming) || naming.some((p) => typeof p !== 'string' || !ids.includes(p)) || new Set(naming).size !== naming.length)
      return no<Decided>('ENUM_VALUE_UNKNOWN', 'parts names the parts to accept, each once, from the ones this question holds. To accept none, reject it.', {
        at: 'parts',
        allowed: ids,
      });
    const keep = new Set(naming);
    for (const p of all)
      for (const on of keep.has(p.id) ? p.needs : [])
        if (!keep.has(on)) {
          const name = all.find((x) => x.id === on)?.name ?? on;
          return no<Decided>('REQUIRED_MISSING', `${p.name.charAt(0).toUpperCase()}${p.name.slice(1)} cannot be taken without ${name}. Take both, or leave both for later.`, {
            at: 'parts',
            allowed: [p.id, on],
          });
        }
    if (keep.size < all.length)
      taking = {
        taken: narrowArrangement(body, keep),
        rest: narrowArrangement(body, new Set(ids.filter((x) => !keep.has(x)))),
        parts: ids.filter((x) => keep.has(x)),
      };
  }

  const wrote: string[] = [];
  /* ONE BATCH FOR THE WHOLE DECISION, minted before anything is written: the rows an accepted rowset writes and the
     rules they start share it with the decision's own two events, so a decision is undone as one. */
  /* OR THE ONE A GROUP ANSWER HANDS IN (`decideMany`), so every question it answers is put back by one Undo. */
  const batch = given.batch ?? deps.mint();
  let install: Record<string, unknown> | undefined;
  let expect: Decided['expect'];
  let expects: Decided['expects'];
  let apply: Decided['apply'];
  let retype: Decided['retype'];

  if (option === 'accept') {
    if (row.body_kind === 'rowset') {
      const register = String(body.register);
      /* THE LADDER'S ROWS ARE THE AGENT'S, signed by the run that filed them; the decision is still the ladder's. */
      const by = signer ?? actor;
      const mechanism = typeof body.ingest === 'string' ? `ingest:${body.ingest}` : by;
      /* A ROW THAT MOVED SINCE THIS WAS ASKED (`moved`) is asked before anything is written: applied onto the row as it
         is now when nothing it changes was written since, and when something was, the question is settled in a plain
         line and nothing is written, so an Accept is never refused for a version no read can bring back. */
      const fresh = new Map<number, number>();
      for (const [n, r] of ((body.rows ?? []) as Record<string, unknown>[]).entries()) {
        if ((only !== null && !only.has(n)) || !('at' in r)) continue;
        const list = typeof r.register === 'string' ? r.register : register;
        const met = moved(deps, id, list, r);
        if (met === null) continue;
        if (met.ok) {
          fresh.set(n, met.version);
          continue;
        }
        const line = movedSaid(deps, list, met.clash, met.fields);
        deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'moot' WHERE id = ? AND status = 'open'", id);
        event(deps, at, 'system', 'resolve', `suggestion:${id}`, 'suggestion', 'moot', line);
        return ok({ decision: null, suggestion: id, status: 'resolved', wrote: [], settled: line });
      }
      for (const [n, r] of ((body.rows ?? []) as Record<string, unknown>[]).entries()) {
        if (only !== null && !only.has(n)) continue;
        /* AN UPDATE IS SIGNED BY THE PERSON DECIDING, whoever drew the proposal, because changing a
           row that exists is what their press authorised. A row a rowset creates keeps the ingest's
           name when an ingest produced it. */
        const now = fresh.get(n);
        const made = 'at' in r ? applyUpdate(deps, register, now === undefined ? r : { ...r, version: now }, by, batch) : deps.write(register, r, mechanism, batch);
        /* ALL THE ROWS OR NONE. Half a rowset accepted is a decision whose answer is not true of the
           record, and the caller's transaction is what undoes the rest. A stale version is the
           house conflict, and it undoes the rest the same way. */
        if (!made.ok) return made as Result<Decided>;
        wrote.push(made.value.id);
      }
    } else if (arranging(row.body_kind)) {
      apply = { kind: row.body_kind, body: taking?.taken ?? body };
    } else if (row.body_kind === 'pattern' || row.body_kind === 'change') {
      install = (row.body_kind === 'pattern' ? body.ingest : body.to) as Record<string, unknown>;
      if (!install || typeof install !== 'object')
        return no<Decided>('VALUE_MALFORMED', `${id} carries nothing to install.`, { at: 'body' });
      /* AND A PATTERN IS HELD AT ACCEPTANCE TO BEING AN INGEST, for the reason a change is held just below: a pattern
         queued before `ingestFault` existed can hold a rule, and it would install as one on this press. */
      if (row.body_kind === 'pattern') {
        const wrong = ingestFault(install);
        if (wrong) return { ok: false, refusal: wrong };
        /* AND A BARE BODY HAS NO ID TO INSTALL UNDER. Handed back as it is, Slash's body was decided as D1 and then
           `install` threw `Cannot read properties of undefined (reading 'writes')`, which the record turns into a reopen
           naming a register, after a decision that cannot be taken back (`pattern-kind.test.ts`). Asked here, nothing is
           decided. It is not wrapped into a declaration: it names no channel, and the record's hold on what a colleague
           may accept reads the `kind` the proposal was filed with. */
        if (!isDeclaration(install))
          return no<Decided>(
            'VALUE_MALFORMED',
            `${id} is an ingest's body with no id, so there is nothing to install it as. It installs once it is proposed as {"id":"ingest.<name>","kind":"ingest","body":{...}} naming its channel; until then it can be answered no.`,
            { at: 'body.ingest' },
          );
      }
      /* AND A CHANGE IS HELD AT ACCEPTANCE TO WHAT IT IS HELD TO WHEN FILED, before anything is decided: a queue carried
         from an earlier build holds changes filed before those checks existed, and `fits` asks the rows as they are now.
         Refused here, the question stays open with nothing resolved, which a refusal from `install` afterwards could only
         get back to by reopening it. */
      if (row.body_kind === 'change') {
        /* AN ADDITION IS MERGED HERE, onto the list as it is at the press, and held to that version: the install is
           asynchronous, and a whole-body change landing in between is the one thing it must not quietly undo. */
        const resolved = resolveTo(deps.sql, body);
        if (!resolved.ok) return resolved as Result<Decided>;
        install = resolved.value.to;
        const wrong =
          shapeFault(install) ?? namesFault(deps.sql, { ...body, to: install }) ?? (fieldLevel(body.to) ? null : retiresRead(deps.sql, install)) ?? (isRetype(body.to) ? null : deps.fits?.(install)) ?? null;
        if (wrong) return { ok: false, refusal: wrong };
        /* A WHOLE BODY IS HELD TO THE VERSION IT WAS FILED AGAINST. A change filed before the stamp existed carries none,
           and is installed as it always was rather than refused for a number nobody wrote. */
        const from = resolved.value.version ?? body.from_version;
        const named = String(fieldLevel(body.to) ? install.id : body.declaration_id);
        if (typeof from === 'number') expect = { id: named, version: from };
        /* A BUNDLE IS HELD MEMBER BY MEMBER, and every member but the named one is asked HERE, at the press. `install`
           takes one `expect`, so handed only that, the rest of the bundle installed over whatever had moved them
           (`govern-bundle-version.test.ts`). The named one is still asked by `install`, inside the transaction that
           writes, so a single change reads exactly as it did and `record`'s reopen still carries its sentence. A bundle
           filed before the map carries a number, and its other members install as they always did. */
        if (isMap(from)) {
          expects = Object.entries(from).flatMap(([id, version]) => (typeof version === 'number' ? [{ id, version }] : []));
          expect = expects.find((e) => e.id === named);
          for (const e of expects) {
            if (e.id === named) continue;
            const moved = movedFrom<Decided>(deps.sql, e.id, e.version);
            if (moved) return moved;
          }
        }
      }
      /* EVERY KEY IT SENDS IS IN THE KEYCHAIN BEFORE ANYTHING IS ARMED. Accepting a call whose key is missing would arm
         it and pause it on its first run, which reads as approved and does nothing. Nothing is written until all are there. */
      /* A PATTERN'S TOO, since it files the same lines: an ingest polling on a key the keychain does not hold is the same
         approved clock that pauses on its first run (`egress-digest-pattern.test.ts`). */
      if ((row.body_kind === 'change' || row.body_kind === 'pattern') && Array.isArray(body.egress))
        for (const { out, label } of (body.egress as unknown[]).flatMap((out) => labelsSent(out, install).map((label) => ({ out: out as SentLine, label })))) {
          const key = keyNamed(deps.sql, label);
          if (key === null)
            return no<Decided>('REQUIRED_MISSING', `Add the key called "${label}" to the keychain, then accept.`, { at: 'body.egress' });
          /* AND A CONNECTOR'S KEY MUST BE ONE A RUN CAN OPEN, checked here for the same reason the
             line above checks it exists at all. `12 §6` keeps two data keys apart, and a credential
             sealed under the record's — the ordinary deposit, opened on a screen with the person
             there — is refused at `sealedGrant` on the first run. Refused then, the approval has
             already happened: armed, approved, and doing nothing. Refused here, nobody has approved
             anything yet.

             ONLY A CONNECTOR, because a `call`, a `poll` and a single-request `pull` open theirs
             through `openGrant` and the RECORD key. Holding those to the connector key would refuse
             every action in the record that does not page. */
          if (out.paged === true) {
            const cannot = runnerCannotOpen(key);
            if (cannot !== null) return no<Decided>('OUT_OF_BOUNDS', cannot, { at: 'body.egress' });
          }
        }
      /* AND EACH KEY IS HELD TO THE HOST ITS LINE CALLS, in the decision's transaction: the owner approved this key going
         to that host, so a later action cannot send it anywhere else. `pinHost` writes only when the entry names no host. */
      if ((row.body_kind === 'change' || row.body_kind === 'pattern') && Array.isArray(body.egress))
        for (const e of body.egress as unknown[]) {
          const line = isMap(e) ? (e as { key?: unknown; host?: unknown }) : null;
          if (line !== null && typeof line.key === 'string' && typeof line.host === 'string') pinHost(deps.sql, line.key, line.host, deps.nowMs, actor);
        }
    }

    /* A RETYPE IS HANDED BACK TO BE LANDED, NEVER INSTALLED. The install counts the rows and would refuse the type
       change it exists to make, so the record lands it through `api/retype.ts` instead: the list and every answered row
       in one transaction, or nothing and the question reopened, as a change that will not install is. */
    if (row.body_kind === 'change' && isRetype(body.to) && install !== undefined) {
      retype = { to: body.to, ...(expect === undefined ? {} : { expect }) };
      install = undefined;
      expect = undefined;
    }

    /* THE PREDICTION, WRITTEN WITH THE DECISION AND IN THE SAME TRANSACTION.

       NOTHING WROTE ONE. `scorePrediction`, the `score` schedule handler and the brake that reads
       twenty scored rows were all built, tested and unreachable, because the table they work on had
       no writer — so the one control that stops a loop proposing nonsense could never engage. A
       loop that proposes and is never graded is the exact failure 24 §4.6 is titled after.

       ATOMIC WITH THE DECISION, because a declaration that changed with no prediction beside it is
       a change nobody can grade, and a prediction with no change behind it grades nothing. */
    if (row.body_kind === 'change' && body.prediction) {
      const wrote_ = writePrediction(deps, id, body.prediction as Prediction, String(body.declaration_id ?? id), at);
      if (!wrote_.ok) return wrote_ as Result<Decided>;
    }
    /* AN ACCEPTED ARRANGEMENT IS GRADED WHERE IT CAN BE: one the record already meets, or that reads nothing today, is accepted ungraded, never refused. */
    if (row.body_kind === 'arrange' && isMap(body.prediction)) writePrediction(deps, id, body.prediction as Prediction, id, at);
  }

  /* AN OPTION THAT CHANGES ENTRIES, such as a script asking which day a payment falls on: the one picked is
     written here, in the decision's batch and signed by the person deciding, all of it or none, so undoing the decision
     undoes what the pick wrote. The options not picked write nothing. */
  /* ENTRIES THAT CHANGED SINCE ARE LEFT AND COUNTED (`applyPatches`), and the rest are written. A pick that finds every
     entry changed writes nothing and closes the question as moot in a plain line, as a rowset's does: no yes could ever
     make it true, and a question nobody can answer is one that waits for ever. */
  let skipped: Decided['skipped'];
  if (row.body_kind === 'options') {
    const chosen = listOf(body.options).find((o) => isMap(o) && o.id === option);
    if (isMap(chosen) && chosen.patches !== undefined) {
      const made = applyPatches(deps, id, chosen.patches, actor, batch);
      if (!made.ok) return made as Result<Decided>;
      if (made.value.wrote.length === 0 && made.value.skipped > 0) {
        const one = made.value.skipped === 1;
        const line = `${one && made.value.first !== null ? `"${made.value.first}"` : one ? 'The entry this changes' : `All ${made.value.skipped} entries this changes`} changed after this was asked, so nothing was written and the question is closed.`;
        deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'moot' WHERE id = ? AND status = 'open'", id);
        event(deps, at, 'system', 'resolve', `suggestion:${id}`, 'suggestion', 'moot', line);
        return ok({ decision: null, suggestion: id, status: 'resolved', wrote: [], settled: line });
      }
      wrote.push(...made.value.wrote);
      if (made.value.skipped > 0) skipped = { count: made.value.skipped, said: skippedSaid(made.value) };
    }
  }

  const question = questionOf(deps.sql, id) ?? id;
  const decision = `D${deps.allocate('decision')}`;
  deps.sql.exec(
    /* AND THE QUESTION'S CAUSE, so the same ask filed again finds the answer it was given (`decision_cause`). */
    "INSERT INTO decision (id, question, answer, reason, decided_by, ts, supersedes, cause) VALUES (?, ?, ?, ?, ?, ?, NULL, (SELECT cause FROM suggestion WHERE id = ?))",
    decision,
    question,
    option,
    reason,
    actor,
    at,
    id,
  );
  /* A QUESTION ACCEPTED IN PART STAYS OPEN, holding what was not taken, and keeps its cause, so the same ask filed again
     still finds it. What was taken is kept on the decision's event, which is where `reopen` reads it back from. */
  if (taking) deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(taking.rest), id);
  else deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'addressed' WHERE id = ?", id);
  /* AND THE LINES THAT PRESS APPROVED, word for word, so "what did I agree to send" has an answer that does not depend
     on the declaration staying as it was. */
  const approved = option === 'accept' && (row.body_kind === 'change' || row.body_kind === 'pattern') && Array.isArray(body.approve) ? { approved: body.approve } : {};
  const part = taking ? { suggestion: id, parts: taking.parts, taken: taking.taken } : {};
  event(deps, at, actor, 'decide', `decision:${decision}`, 'decision', JSON.stringify({ question, answer: option, ...approved, ...(only === null ? {} : { rows: [...only].sort((a, b) => a - b) }), ...part }), undefined, batch);
  if (taking) {
    const n = taking.parts.length;
    /* `taken:<n>`, NEVER A BARE COUNT: `joinersOf` reads a note whose value is a number as an agent widening the question,
       and the owner who took part of it would then hold the opener's withdraw. */
    event(deps, at, actor, 'note', `suggestion:${id}`, 'suggestion', `taken:${n}`, `${n === 1 ? 'One part of this was' : `${n} parts of this were`} accepted, and the rest still wait here.`, batch);
  } else event(deps, at, actor, 'resolve', `suggestion:${id}`, 'suggestion', 'addressed', reason, batch);
  /* AND WHAT THE PICK LEFT, IN ITS BATCH, so the question's history says how many were not written and why. */
  if (skipped) event(deps, at, 'system', 'note', `suggestion:${id}`, 'suggestion', `skipped:${skipped.count}`, skipped.said, batch);

  /* THE QUESTIONS IT COVERS GO WITH IT: accepted whole, each one it named that still waits is closed as moot
     with a line saying which answer settled it (any answer but no), in this batch, so the decision's Undo asks them again. */
  const covered: string[] = [];
  if (option !== 'reject' && !taking)
    for (const c of coveredBy(deps.sql, id)) {
      if (deps.sql.one("SELECT 1 AS x FROM suggestion WHERE id = ? AND status = 'open'", c) === undefined) continue;
      deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'moot' WHERE id = ? AND status = 'open'", c);
      event(deps, at, 'system', 'resolve', `suggestion:${c}`, 'suggestion', 'moot', `${COVERED} “${question.replace(/\?+\s*$/u, '')}”.`, batch);
      covered.push(c);
    }

  return ok({
    decision,
    batch,
    suggestion: id,
    status: taking ? 'open' : 'resolved',
    wrote,
    ...(covered.length === 0 ? {} : { covered }),
    ...(skipped === undefined ? {} : { skipped }),
    ...(install === undefined ? {} : { install }),
    ...(expect === undefined ? {} : { expect }),
    ...(expects === undefined ? {} : { expects }),
    ...(apply === undefined ? {} : { apply }),
    ...(retype === undefined ? {} : { retype }),
  });
}

/**
 * Write the prediction an accepted `change` carries, and schedule its scoring.
 *
 * THE BASELINE IS FROZEN HERE, measured over the window BEFORE acceptance. Recomputing it at scoring
 * time is grading your own homework and makes every prediction pass — 24 §4.6 says so in one line,
 * and it is the difference between a loop that learns and a loop that congratulates itself.
 *
 * AND A BASELINE THAT ALREADY MEETS ITS TARGET IS REFUSED. It is the reward-hacking control: without
 * it the cheapest way for the loop to look useful is to predict things that are already true, and
 * that is a local optimum it will find.
 */
function writePrediction(deps: GovernDeps, sg: string, p: Prediction, forDecl: string, at: string): Result<string> {
  const reading = deps.measure(p.measure, p.window);
  if (!reading.ok) return reading as Result<string>;
  const baseline = reading.value.value;
  if (baseline === null)
    return no<string>('PREDICTION_UNMEASURABLE', `${sg}'s prediction reads nothing today, so it can never be settled.`, {
      at: 'body.prediction.measure',
    });

  if (met(baseline, p.target))
    return no<string>(
      'OUT_OF_BOUNDS',
      `${sg} predicts ${p.claim}, and that is already true at ${baseline}. A prediction already met grades nothing.`,
      { at: 'body.prediction.target' },
    );

  const kept = point(baseline, p.unit);

  const id = `pr_${deps.mint()}`;
  const scoreAt = deps.nowMs + windowMs(p.window);
  deps.sql.exec(
    `INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, on_miss)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    forDecl,
    p.claim,
    JSON.stringify(p.measure),
    /* THE SAME INTEGER RULE THE OBSERVATION IS STORED UNDER, AND THE SAME UNIT. `Math.round` here
       and `stored()` at scoring time put a ratio of 0.375 in as `baseline: 0` and back out as
       `observed: 3750` — a ten-thousand-fold disagreement in the one row whose entire purpose is a
       before-and-after. The scale that fixed that was then applied to money as well, so a prediction
       about a figure in pounds went in ten thousand times too large with a currency on it, and
       `listGovernance` hands these rows back as they are. `point()` decides the value and the unit
       together, which is the only way the two cannot disagree. */
    kept.value,
    p.unit ?? kept.unit ?? 'count',
    /* THE SCORER'S GRAMMAR, NOT JSON. `targetOf` parses `<=0` and `>=3`; `Number('{"lte":0}')` is
       `NaN`, so a prediction written as JSON came back `VALUE_MALFORMED` at scoring time, never got
       a `scored_at`, and walked the retry ladder to dead. Twenty scored rows is what the brake
       needs, so the loop still could not grade itself — the writer had moved and nothing else. Two
       grammars for one column is the whole of the defect; there is one now. */
    bound(p.target),
    p.window,
    instant(scoreAt),
    p.on_miss ?? 'suggest',
  );

  /* `score_at` IS A ROW IN `schedule`, which is 24 §4.6's own note and the reason this costs no new
     infrastructure: the single alarm already drains hundreds of due rows. */
  deps.sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts)
     VALUES (?, ?, 'score', ?, ?, 'pending', 0) ON CONFLICT (kind, key) DO NOTHING`,
    deps.mint(),
    instant(scoreAt),
    `prediction:${id}`,
    JSON.stringify({ prediction: id }),
  );

  event(deps, at, 'system', 'predict', `prediction:${id}`, 'prediction', JSON.stringify({ claim: p.claim, baseline, target: p.target }));
  return ok(id);
}

/**
 * Whether a reading satisfies a bound — the TWO the target grammar admits.
 *
 * IT ACCEPTED FIVE AND THE SCORER READS TWO. `lt`, `gt` and `is` filed cleanly here, were unscoreable
 * at the other end, and — worse — an unknown key made this return `false`, which silently disabled
 * the already-true check: a prediction the record already meets was accepted because the check that
 * refuses one could not read its own target. `checkPrediction` refuses the other three now, at
 * filing, where the author can fix it.
 */
function met(value: number, target: Record<string, number>): boolean {
  if (target.lte !== undefined) return value <= target.lte;
  if (target.gte !== undefined) return value >= target.gte;
  return false;
}

/** The target as `targetOf` reads it back: `<=0`, `>=3`. One grammar, written where it is written. */
const bound = (target: Record<string, number>): string =>
  target.lte !== undefined ? `<=${target.lte}` : `>=${target.gte ?? 0}`;

/** `30d` in milliseconds. The window grammar is the schedule's, so there is one of them. */
function windowMs(window: string): number {
  const [, n = '30', unit = 'd'] = /^(\d+)([dhm])$/.exec(window) ?? [];
  const each = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
  return Number(n) * each;
}

/**
 * Put a resolved suggestion back in the queue.
 *
 * FOR THE ONE CASE THE GATE CANNOT HOLD IN ITS TRANSACTION: an accepted `pattern` whose declaration
 * then will not install. The decision stands — somebody did answer — and the question comes back,
 * because a suggestion resolved with nothing behind it is the gate telling a lie.
 */
export function reopen(deps: GovernDeps, id: string, why = 'What was accepted would not install.', asked?: Record<string, unknown>): Result<null> {
  const row = deps.sql.one<{ status: string; resolved_as: string | null; body_kind: BodyKind }>(
    'SELECT status, resolved_as, body_kind FROM suggestion WHERE id = ?',
    id,
  );
  if (!row) return no<null>('OUT_OF_BOUNDS', `There is no suggestion called ${id}.`, { at: 'id' });

  /* PARTS TAKEN THAT WOULD NOT APPLY COME BACK TO THE QUESTION STILL HOLDING THE REST, all of them, so a part accepted is
     applied with the others it was taken with or not at all. The take is the last one since this question last came
     back, whose decision kept nothing as applied. The decision stands, as it does below. */
  if (row.status === 'open' && row.body_kind === 'arrange') {
    const took = deps.sql.one<{ v: string }>(
      `SELECT e.to_v AS v FROM event e
        WHERE e.kind = 'decide' AND e.target_kind = 'decision' AND json_valid(e.to_v) AND json_extract(e.to_v, '$.suggestion') = ?
          AND e.rowid > coalesce((SELECT max(r.rowid) FROM event r WHERE r.target = ? AND r.kind = 'suggest' AND r.to_v = 'reopened'), 0)
          AND NOT EXISTS (SELECT 1 FROM event k WHERE k.target = e.target AND k.kind = 'note')
        ORDER BY e.rowid DESC LIMIT 1`,
      id,
      `suggestion:${id}`,
    );
    const taken = took ? (parse(took.v)?.taken ?? null) : null;
    const rest = deps.sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id);
    const held = rest ? parse(rest.body) : null;
    if (isMap(taken) && held) {
      deps.sql.exec('UPDATE suggestion SET body = ?, defer_until = NULL, defer_why = NULL WHERE id = ?', JSON.stringify(mergeArrangement(held, taken)), id);
      event(deps, instant(deps.nowMs), 'system', 'suggest', `suggestion:${id}`, 'suggestion', 'reopened', why);
      return ok(null);
    }
  }

  /* ONLY WHAT WAS ACCEPTED. Reopening a `wont-fix` resurrects a question somebody answered, and
     nothing here undoes what an acceptance did. */
  if (row.status !== 'resolved' || row.resolved_as !== 'addressed')
    return no<null>('TRANSITION_ILLEGAL', `${id} is ${row.resolved_as ?? row.status}, and only an accepted one comes back.`, {
      at: 'status',
      allowed: ['addressed'],
    });

  /* AND ONLY THE TWO KINDS THIS EXISTS FOR. A `pattern` or a `change` is applied OUTSIDE the gate's
     transaction, so it is the only acceptance that can fail after the question was resolved. An
     accepted `rowset` wrote its rows in that transaction — reopening it would let a decision made
     once be applied twice, and the second copy of forty rows is not a thing anybody undoes by hand. */
  if (row.body_kind !== 'pattern' && row.body_kind !== 'change' && !arranging(row.body_kind))
    return no<null>('TRANSITION_ILLEGAL', `A ${row.body_kind} was applied when it was accepted, and does not come back.`, {
      at: 'body_kind',
      allowed: ['pattern', 'change', ...ARRANGING],
    });

  /* AND THE DEFERRAL GOES WITH IT. A reopened suggestion carrying a `defer_until` from last year
     comes back invisible, which is the same as not coming back. */
  /* ITS CAUSE COMES BACK WITH IT unless an open question asked the same since, which the unique index keeps the only
     one open with it: the two then stand side by side, and this one is the older. */
  deps.sql.exec(
    `UPDATE suggestion SET status = 'open', resolved_as = NULL, defer_until = NULL, defer_why = NULL,
       cause = CASE WHEN EXISTS (SELECT 1 FROM suggestion o WHERE o.status = 'open' AND o.cause = suggestion.cause AND o.id <> suggestion.id) THEN NULL ELSE cause END
     WHERE id = ?`,
    id,
  );
  /* AND IT MAY COME BACK ASKING WHAT IS TRUE NOW (`asked`): an add-on whose catalogue moved on since is asked again at the
     version the catalogue holds, worked out by the caller as a new question would be, so a yes can land. */
  if (asked !== undefined) deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(asked), id);

  /* AND IT SAYS SO, because the first law of this file is that a decision is a row and not a side
     effect. Without this a resolved row went back to open with nothing between the `resolve` event
     and the reopened state — so anybody reading the log saw a suggestion resolved and open at once,
     with no account of how. The `decision` stands: somebody did answer, and this is not an undo. */
  event(deps, instant(deps.nowMs), 'system', 'suggest', `suggestion:${id}`, 'suggestion', 'reopened', why);
  return ok(null);
}

/**
 * Keep what an accepted arrangement did on the decision that accepted it: what was installed, turned on and off, and which
 * pages and settings were set, as `apply` answered it. One `note` line on the decision, which `APPLIED` reads back.
 */
export function keepApplied(deps: GovernDeps, decision: string, applied: Record<string, unknown>, actor: string): Result<null> {
  if (!deps.sql.one('SELECT id FROM decision WHERE id = ?', decision)) return no<null>('OUT_OF_BOUNDS', `There is no decision called ${decision}.`, { at: 'id' });
  event(deps, instant(deps.nowMs), actor, 'note', `decision:${decision}`, 'decision', JSON.stringify(applied), 'Applied what was accepted.');
  return ok(null);
}

/**
 * The question, from the `suggest` event that carried it — the only copy there is.
 *
 * `to_v` FIRST AND `note` AFTER IT. `to_v` is where it belongs and where it is written now; `note`
 * is where a record written by an earlier build put it, capped at 280. Reading both costs one
 * `coalesce` and means an old record's questions still answer for themselves.
 *
 * EXPORTED, because what waits on a person is read by its question: `boot` and `context` list open
 * suggestions, and an id with no question is a list nobody can answer from.
 */
export function questionOf(sql: Sql, id: string): string | null {
  return (
    sql.one<{ q: string | null }>(
      "SELECT coalesce(to_v, note) AS q FROM event WHERE kind = 'suggest' AND target = ? AND field IS NULL AND coalesce(to_v, '') <> 'reopened' ORDER BY rowid DESC LIMIT 1",
      `suggestion:${id}`,
    )?.q ?? null
  );
}

/* ── who decides ─────────────────────────────────────────────────────────── */

/**
 * The `field` of the note that hands a question to somebody.
 *
 * A NOTE AND NOT AN EVENT KIND OF ITS OWN, because `event.kind` is a closed list and a new kind is a migration
 * (`0001_kernel.ts`). The question is the target, `to_v` holds the person's id, and an empty `to_v` is the question taken
 * back. The newest one is who decides, so handing it on, or taking it back, is one more line and History keeps the rest.
 *
 * THE PERSON IN `to_v` AND WORDS IN `note`, as `again` and `keepApplied` keep theirs: History and the news say an event's
 * `note` as it is, and a note holding the person's id read as an id to whoever opened History.
 */
const HAND = 'decider';

/** Whether a person may be handed a question: somebody here, not suspended, who holds Decides on the record or owns it. */
export function mayDecide(sql: Sql, person: string): boolean {
  const level = access(sql, person)?.level ?? null;
  return level === 'decide' || level === 'owner';
}

/** A person's name as the record holds it, for a sentence the record says itself. Never an id. */
function personNamed(sql: Sql, person: string): string {
  const row = sql.one<{ name: string | null; email: string | null }>('SELECT name, email FROM person WHERE id = ?', person);
  return row?.name?.trim() || row?.email?.trim() || 'That person';
}

/** The sentence a name nobody may hand a question to is refused with. */
export const cannotDecide = (name: string): string => `${name} cannot decide here. Name somebody who can, or nobody.`;

/** Why `person` cannot be handed a question, or `null` when they can. */
function deciderNameFault(sql: Sql, person: unknown): string | null {
  if (typeof person !== 'string' || person.trim() === '') return 'decider is the person who decides it, or leave it out.';
  return mayDecide(sql, person) ? null : cannotDecide(personNamed(sql, person));
}

/** Write one hand: `to` the person's id, or `null` for the question taken back. */
function handEvent(deps: Pick<GovernDeps, 'sql' | 'mint'>, at: string, by: string, id: string, to: string | null): void {
  slashMayWrite(by, 'note');
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note) VALUES (?, ?, ?, 'note', ?, 'suggestion', ?, ?, ?)",
    deps.mint(),
    at,
    by,
    `suggestion:${id}`,
    HAND,
    to ?? '',
    to === null ? 'Taken back, so anybody who may decide can answer it.' : `Handed to ${personNamed(deps.sql, to)} to decide.`,
  );
}

/**
 * WHERE A PRESS CAME FROM, kept on the decision it made (a press on the decision card inside Claude or ChatGPT, the MCP
 * door's `answer`). An event and no column, as `HAND` is: a `note` on the decision whose `field` is `answered_in`, the
 * app's name in `to_v` and the sentence History says in `note`. A decision answered in the app has none.
 */
export const ANSWERED_IN = 'answered_in';

/** Keep where one decision was answered, by the person who answered it, in the batch that decided it. */
export function answeredIn(deps: Pick<GovernDeps, 'sql' | 'mint' | 'nowMs'>, decision: string, app: string, by: string, batch?: string): void {
  slashMayWrite(by, 'note');
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note, batch) VALUES (?, ?, ?, 'note', ?, 'decision', ?, ?, ?, ?)",
    deps.mint(),
    instant(deps.nowMs),
    by,
    `decision:${decision}`,
    ANSWERED_IN,
    app,
    `Answered in ${app}, on the card.`,
    batch ?? null,
  );
}

/** The app one decision was answered in, or `null` for a decision answered in BrainDog. */
export function answeredInOf(sql: Sql, decision: string): string | null {
  const row = sql.one<{ to_v: string | null }>(
    "SELECT to_v FROM event WHERE kind = 'note' AND field = ? AND target = ? ORDER BY rowid DESC LIMIT 1",
    ANSWERED_IN,
    `decision:${decision}`,
  );
  return row?.to_v ? row.to_v : null;
}

/** Who decides one question: the person the newest hand names, or `null` when nobody is named or it was taken back. */
export function deciderOf(sql: Sql, id: string): string | null {
  const row = sql.one<{ to_v: string | null }>(
    "SELECT to_v FROM event WHERE kind = 'note' AND field = ? AND target = ? ORDER BY rowid DESC LIMIT 1",
    HAND,
    `suggestion:${id}`,
  );
  return row?.to_v ? row.to_v : null;
}

/**
 * Hand one open question to the person who decides it, or take it back with `to: null`.
 *
 * WHO MAY HAND ONE IS THE CALLER'S TO ASK (`packages/record/src/methods/decider.ts`, the owner's in a browser). This holds
 * the rest: the question is there and still open, and the person holds Decides or owns the record. Handed to whoever
 * already decides it, nothing is written.
 */
export function handQuestion(deps: Pick<GovernDeps, 'sql' | 'mint' | 'nowMs'>, id: string, to: string | null, by: string): Result<{ id: string; decider: string | null }> {
  const row = deps.sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id);
  if (!row) return no('OUT_OF_BOUNDS', `There is no question called ${id}.`, { at: 'id' });
  if (row.status !== 'open')
    return no('TRANSITION_ILLEGAL', 'This question is already settled, so it cannot be handed to anybody.', { at: 'status', allowed: ['open'] });
  if (to !== null) {
    const bad = deciderNameFault(deps.sql, to);
    if (bad !== null) return no('VALUE_MALFORMED', bad, { at: 'to' });
  }
  if (deciderOf(deps.sql, id) === to) return ok({ id, decider: to });
  handEvent(deps, instant(deps.nowMs), by, id, to);
  return ok({ id, decider: to });
}

/**
 * Why `actor` may not answer a question somebody else was handed, in one sentence, or `null` when they may.
 *
 * A QUESTION WITH A DECIDER IS ANSWERED BY HER OR BY AN OWNER. Anybody else who may decide is told whose it is, by the
 * name `nameOf` gives, never an id. A question nobody was handed is anybody's who may decide, as it always was.
 */
export function deciderFault(sql: Sql, id: string, actor: string, isOwner: boolean, nameOf: (person: string) => string = (p) => personNamed(sql, p)): string | null {
  const decider = deciderOf(sql, id);
  if (decider === null || decider === actor || isOwner) return null;
  return `This one is ${nameOf(decider)}'s to decide.`;
}

function event(
  deps: Pick<GovernDeps, 'sql' | 'mint'>,
  at: string,
  actor: string,
  kind: string,
  target: string,
  targetKind: string,
  to: string,
  note?: string,
  batch?: string,
): void {
  /* A CLOSE IS ASKED ABOUT WITH WHAT IT CLOSES AS, so Slash may be let take back its own suggestion and close nothing else. */
  slashMayWrite(actor, kind, kind === 'resolve' ? { kind: to } : undefined);
  deps.sql.exec(
    'INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note, batch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    deps.mint(),
    at,
    actor,
    kind,
    target,
    targetKind,
    to,
    note === undefined ? null : note.slice(0, 280),
    batch ?? null,
  );
}

const parse = (body: string): Record<string, unknown> | null => {
  try {
    const out: unknown = JSON.parse(body);
    return out && typeof out === 'object' && !Array.isArray(out) ? (out as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** How many pen dismissals a person keeps, newest last (`PEN_DISMISSED_MOST` in the record's `emergent.ts`). */
const PEN_DISMISSED_KEPT = 500;

/**
 * The one list a page Slash asked for is over, or `null`: an arrangement adding exactly one new page that requires one
 * list and draws it whole (a block on `register.<list>` with no `where`), the page Slash's growing-list notice files.
 */
function slashPageList(body: string): string | null {
  let b: { pages?: unknown } | null = null;
  try {
    b = JSON.parse(body) as { pages?: unknown };
  } catch {
    return null;
  }
  const pages = Array.isArray(b?.pages) ? (b.pages as { was?: unknown; body?: { requires?: unknown; blocks?: unknown } }[]) : [];
  if (pages.length !== 1) return null;
  const page = pages[0]!;
  if (page.was !== undefined && page.was !== null) return null;
  const requires = Array.isArray(page.body?.requires) ? (page.body!.requires as unknown[]) : [];
  if (requires.length !== 1 || typeof requires[0] !== 'string' || !requires[0].startsWith('register.')) return null;
  const list = requires[0].slice('register.'.length);
  const blocks = Array.isArray(page.body?.blocks) ? (page.body!.blocks as { source?: unknown; where?: unknown }[]) : [];
  return blocks.some((x) => x?.source === `register.${list}` && x.where === undefined) ? list : null;
}

/** Add `page:<list>` to a person's `pen.dismissed`, newest last, keeping the last `PEN_DISMISSED_KEPT`. */
function penDismissed(deps: Pick<GovernDeps, 'sql'>, person: string, list: string | null, at: string): void {
  if (list === null) return;
  const held = deps.sql.one<{ value: string }>("SELECT value FROM pref WHERE person_id = ? AND key = 'pen.dismissed'", person)?.value;
  let gone: string[] = [];
  try {
    const was = held === undefined ? [] : (JSON.parse(held) as unknown);
    gone = Array.isArray(was) ? was.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    gone = [];
  }
  const signature = `page:${list}`;
  if (gone.includes(signature)) return;
  deps.sql.exec(
    `INSERT INTO pref (person_id, key, value, updated_at) VALUES (?, 'pen.dismissed', ?, ?)
     ON CONFLICT (person_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    person,
    JSON.stringify([...gone, signature].slice(-PEN_DISMISSED_KEPT)),
    at,
  );
}
