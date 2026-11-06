/**
 * What the record notices about itself, and what it does about it.
 *
 * THE POINT IS A LOOP THAT CANNOT RUN AWAY. A product that proposes changes to itself from observed
 * data is either the most useful thing in it or a machine that fills somebody's week with plausible
 * nonsense, and the difference is entirely in the thresholds and the governors. Every number here is
 * derived rather than chosen.
 *
 * LAW ONE — A BURST IS NOT A PATTERN. Every threshold needs a count AND a dispersion requirement.
 * Five zero-result searches in one frustrated minute is one event, and a detector that counted it as
 * five would propose something after every bad afternoon.
 *
 * LAW TWO — THE MINIMUM COMES FROM THE RULE OF THREE. With zero events in `n` trials the 95% upper
 * bound on the rate is `3/n`, so telling a 20% rate from noise needs `n ≥ 15`, 10% needs 30, and 50%
 * needs 6. That is where each number below comes from; none of them is a feeling about a round
 * number.
 *
 * AND THE BRAKE. A proposal class that keeps being wrong stops being proposed: if fewer than three
 * in five of the last twenty scored predictions were met, the analyser suspends itself and says so.
 * A loop with no way to notice it is unhelpful is a loop that gets muted, and a muted loop is worse
 * than none because it is still spending.
 *
 * NONE OF IT LEAVES THE OBJECT. Observations live in the customer's own record, which is why a
 * search term is fine here — that wall is what keeps this from being surveillance with a dashboard.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { isColumn } from '@braindog/where';

import { dayIn } from './finished.ts';
import { instant } from './migrate.ts';
import { recordIdentity } from './provision.ts';

/** The nine the `CHECK` admits. `subject` is a register, a page slug, or `<register>.<field>:<code>`. */
export const SIGNALS = [
  'ingest.unmatched',
  'decision.superseded',
  'suggestion.incorrect',
  'write.refused',
  'search.empty',
  'register.read',
  'page.render',
  'tool.retry',
  'query.scan',
] as const;

export type Signal = (typeof SIGNALS)[number];
/**
 * One thing that happened. `who` is the person it happened to, where one did (a page they opened): the count is raised
 * for the whole record as always, and for that person beside it (`observation_who`, migration 47).
 */
export type Observation = { kind: Signal; subject: string; who?: string | undefined };

/** At most this many in one call. A batch is a request's worth, not a backfill. */
const BATCH = 200;

/**
 * Whether an observation is a scan of one of the record's own columns, which no declaration can index.
 *
 * A PRIMARY-KEY LOOKUP WAS COUNTED AS A SCAN. The record's `list` asks the declaration which fields carry an index, and
 * no declaration has a field called `id`, so every `where: { field: 'id', in: [...] }` was `query.scan` of `<list>.id`.
 * The MCP tools name a page's refs with exactly that read (`namesIn`, fe741dfa), and measured through `handle` on the
 * seed a hundred lists of tasks and a hundred of learnings counted `things.id` two hundred times in a day, and the
 * weekly look drafted "things.id was scanned 200 times in thirty days, and an index would pay for itself". That is a
 * model call on a proposal nobody can accept, and three of them marked incorrect suspend the whole analyser.
 *
 * ALL FIVE, NOT ONLY THE THREE WITH AN INDEX. `id` is the primary key, `seq` is `UNIQUE (register, seq)` and
 * `updated_at` leads `entry_live`, so those are not scans at all. `created_at` and `version` have no index of their
 * own, but the remedy the draft proposes is `index: true` on the field, and `declare` refuses all five as field ids
 * (`RESERVED_FIELD_IDS`), so the proposal could be installed for none of them.
 *
 * HERE AND NOT ONLY WHERE THE RECORD COUNTS IT, because this is where every counter meets and the analyser reads
 * rows already written: a record the tools named refs on since fe741dfa holds `<list>.id` rows for thirty days, and
 * `findingsFrom` leaves those out too. A subject is `<list>.<field>`, and the column is the whole name after the dot,
 * so `notes.idle` is still a field.
 */
const onColumn = (kind: string, subject: string): boolean => {
  if (kind !== 'query.scan') return false;
  const dot = subject.indexOf('.');
  return dot > 0 && isColumn(subject.slice(dot + 1));
};

/**
 * Record what happened, pre-aggregated by day.
 *
 * ONE ROW PER KIND PER SUBJECT PER DAY, incremented. The alternative — a row per event — is a table
 * that grows with usage and is never read at that grain, and the detectors below all ask about days.
 */
/** The two statements that raise a day's counter, named so a host can hold them back (`apps/worker/src/observed-later.ts`). */
export const OBSERVE_COUNT = 'INSERT INTO observation (kind, subject, day, n) VALUES (?, ?, ?, 1) ON CONFLICT (kind, subject, day) DO UPDATE SET n = n + 1';
export const OBSERVE_COUNT_WHO = 'INSERT INTO observation_who (kind, subject, day, who, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (kind, who, subject, day) DO UPDATE SET n = n + 1';

export function observe(sql: Sql, nowMs: number, batch: readonly Observation[]): Result<number> {
  if (batch.length > BATCH)
    return no<number>('OUT_OF_BOUNDS', `A batch is at most ${BATCH} observations, and this one is ${batch.length}.`, {
      at: 'batch',
    });

  /* EVERY KIND FIRST, THEN ANY WRITE. The refusal is a VALUE, so the transaction it sits in commits
     — which meant a bad kind halfway through a batch kept everything before it, told the caller
     nothing had happened, and got the first half counted twice on the retry. That double count is
     the exact arithmetic the detectors' thresholds are built on. */
  for (const row of batch)
    if (!(SIGNALS as readonly string[]).includes(row.kind))
      return no<number>('ENUM_VALUE_UNKNOWN', `${row.kind} is not a signal BrainDog observes.`, {
        at: 'kind',
        allowed: SIGNALS,
      });

  const day = new Date(nowMs).toISOString().slice(0, 10);
  let n = 0;
  for (const row of batch) {
    if (!row.subject || onColumn(row.kind, row.subject)) continue;
    sql.exec(
      OBSERVE_COUNT,
      row.kind,
      row.subject,
      day,
    );
    if (typeof row.who === 'string' && row.who !== '')
      sql.exec(
        OBSERVE_COUNT_WHO,
        row.kind,
        row.subject,
        day,
        row.who,
      );
    n++;
  }
  return ok(n);
}

/* ── what it makes of them ───────────────────────────────────────────────── */

export type Finding = {
  signal: Signal;
  subject: string;
  /** How many times, in the window. */
  n: number;
  /** How many distinct days — the dispersion half of every threshold. */
  days: number;
  window: string;
  /** Why this is worth somebody's attention, in one sentence. */
  why: string;
};

export type Analysis = {
  /** The best candidate, or `null`. One at a time: a list of eleven is a list nobody reads. */
  candidate: Finding | null;
  /** Everything that cleared its threshold, best first. */
  found: Finding[];
  /** Why nothing was proposed, when nothing was. */
  suspended: string | null;
};

const DAY_MS = 86_400_000;

/* ── presence, read one way ──────────────────────────── */

/**
 * The three places this record writes down that something happened, each with the column that says which thing, the
 * one that says when, and the one that tells two marks apart. The text is fixed here and never built from a caller's
 * words: a caller picks a name, and the name picks the SQL.
 */
const PRESENCE = {
  /** What was observed: a signal's subjects by day. */
  signals: { from: 'observation', key: 'kind = ?', at: 'day', mark: 'subject' },
  /** The rows a list took, by the instant each was made. */
  rows: { from: 'entry', key: 'register = ?', at: 'created_at', mark: 'id' },
  /** The messages a door's pattern took, by the instant each was filed. */
  arrivals: { from: 'ingest_receipt', key: "replace(ingest_id, 'ingest.', '') = ?", at: 'ts', mark: 'raw_id' },
} as const;

export type PresenceSource = keyof typeof PRESENCE;
/** How many separate days carry a mark, and how many separate marks there are. */
export type Presence = { days: number; marks: number };

/**
 * How present `key` was from the day `from` up to, and not including, the day `before`.
 *
 * THIS IS THE ONE READING BEHIND "AN ABSENCE IS ONLY EVIDENCE WHERE PRESENCE IS BEING RECORDED". Whoever calls a silence
 * a fact asks here first whether anybody was listening, and says how much listening is enough: the weekly analysis
 * asks it of a signal, and `exceptions.ts` of a list and a door. Days are counted and not marks alone, because a burst
 * on one day is not presence.
 */
export function presenceOf(sql: Sql, source: PresenceSource, key: string, from: string, before = '9999'): Presence {
  const p = PRESENCE[source];
  const r = sql.one<{ days: number; marks: number }>(
    `SELECT count(DISTINCT substr(${p.at}, 1, 10)) AS days, count(DISTINCT ${p.mark}) AS marks FROM ${p.from} WHERE ${p.key} AND ${p.at} >= ? AND ${p.at} < ?`,
    key,
    from,
    before,
  );
  return { days: Number(r?.days ?? 0), marks: Number(r?.marks ?? 0) };
}

/** When `key` was last present, as the record wrote it (a day for a signal, an instant for a row or an arrival), or `null`. */
export function lastPresence(sql: Sql, source: PresenceSource, key: string): string | null {
  const p = PRESENCE[source];
  return sql.one<{ at: string | null }>(`SELECT max(${p.at}) AS at FROM ${p.from} WHERE ${p.key}`, key)?.at ?? null;
}

type Detector = { signal: Signal; windowDays: number; n: number; days: number; why: (subject: string, n: number) => string };

/**
 * The four this record can compute from what it observes.
 *
 * Each number is Law Two applied to the rate worth catching, and each carries a dispersion
 * requirement because Law One says a burst is not a pattern.
 */
const DETECTORS: Detector[] = [
  {
    signal: 'ingest.unmatched',
    windowDays: 30,
    n: 3,
    days: 1,
    why: (s, n) => `${n} payloads shaped like ${s} arrived in thirty days and no pattern matched any of them.`,
  },
  {
    signal: 'search.empty',
    windowDays: 90,
    n: 5,
    /* FIVE OVER NINETY DAYS CLEARS THE RULE-OF-THREE FLOOR, and three distinct days kills the burst:
       five searches in one frustrated minute is one event, not five. */
    days: 3,
    why: (s, n) => `${n} searches for ${s} found nothing, on three or more separate days.`,
  },
  {
    signal: 'write.refused',
    windowDays: 30,
    n: 10,
    /* THREE DISTINCT DAYS OR ACTORS. Distinct actors is the stronger test — it means the DECLARATION
       is wrong rather than one caller having a bad afternoon — and days is the proxy the record has. */
    days: 3,
    why: (s, n) => `${n} writes were refused by ${s} in thirty days, across three or more days.`,
  },
  {
    signal: 'query.scan',
    windowDays: 30,
    n: 200,
    /* AN INDEX COSTS STORAGE AND WRITE TIME FOREVER. Below about seven queries a day the scan is
       microseconds and the index is a liability, which is where two hundred in thirty days comes
       from rather than from a round number.

       AND NO DISPERSION REQUIREMENT, which is the one detector that has none: Law One is about
       PEOPLE, and a burst of scans is not a frustrated afternoon — it is a month-end close, which
       is exactly when the index would pay. This asked for three separate days, so four hundred
       scans across a two-day close, the strongest candidate there is, proposed nothing. */
    days: 1,
    why: (s, n) => `${s} was scanned ${n} times in thirty days, and an index would pay for itself.`,
  },
];

/**
 * How long nothing has to happen before nothing is a finding.
 *
 * NINETY DAYS, FROM THE SAME RULE OF THREE EVERY OTHER THRESHOLD USES. With zero events observed in
 * *n* trials the upper bound on the rate is 3/n — so ninety days of silence bounds a register's read
 * rate at about one in thirty days, which is the point where "nobody uses this" stops being a guess.
 * A quarter is also the shortest period over which a person would agree they had not needed
 * something: anything is unread in a fortnight.
 *
 * AND IT COUNTS FROM THE DECLARATION, not from the window. A register installed last week has no
 * reads because it is new, which is not the same fact and is the one this would otherwise report.
 */
const DORMANT_DAYS = 90;

/**
 * The two signals whose finding is an ABSENCE. `24 §4.2`: "register never read, page never
 * rendered".
 *
 * EVERY OTHER DETECTOR ASKS "how many", AND THIS ONE ASKS "any at all". That is why it is not a row
 * in `DETECTORS`: the loop there groups observations by subject, and a subject with no observations
 * has no row to group — the finding is the row that is not there, so it has to start from the
 * declarations rather than from what was noticed.
 *
 * WHICH IS ALSO WHY IT WAS MISSING. `register.read` and `page.render` were two of the nine kinds the
 * `CHECK` admits, with nothing writing them and nothing reading them: a vocabulary with neither end
 * connected, which reads exactly like a vocabulary that works.
 */
const DORMANT: { kind: 'register' | 'page'; signal: Signal; why: (id: string) => string }[] = [
  {
    kind: 'register',
    signal: 'register.read',
    why: (id) => `Nothing has read ${id} in ninety days, and it has been declared for longer than that.`,
  },
  {
    kind: 'page',
    signal: 'page.render',
    why: (id) => `Nobody has opened the ${id} page in ninety days, and its blocks run every time the digest does.`,
  },
];

/**
 * Declarations old enough to be judged, that nothing has touched.
 *
 * THE SUBJECT IS THE DECLARATION'S OWN ID, which is what `register.read` and `page.render` record —
 * so a rename is a new subject and a new ninety days, which is correct: a renamed register is a
 * register somebody has just been thinking about.
 */
function dormant(deps: AnalyseDeps): Finding[] {
  const found: Finding[] = [];
  const cutoff = new Date(deps.nowMs - DORMANT_DAYS * DAY_MS).toISOString();
  const since = cutoff.slice(0, 10);

  for (const d of DORMANT) {
    /* AN ABSENCE IS ONLY EVIDENCE WHERE PRESENCE IS BEING RECORDED. This is Law One read the other
       way round — a burst is not a pattern, and a silence is not a fact unless somebody was
       listening. Without it every register on every record was dormant: nothing had ever written a
       `register.read` row, so "no reads in ninety days" was true of a record being hammered daily.
       `24 §7`'s specificity suite said so on the first run — two and a half thousand proposals out
       of a hundred record-years of pure noise, which is the test earning its place.

       TWO OTHER SUBJECTS ON THREE SEPARATE DAYS. One subject read once is somebody trying the
       product; the question "which of these does nobody open" only means anything on a record where
       the others are being opened. */
    const alive = presenceOf(deps.sql, 'signals', d.signal, since);
    if (alive.marks < 2 || alive.days < 3) continue;

    for (const row of deps.sql.all<{ id: string }>(
      `SELECT id FROM declaration
        WHERE kind = ? AND superseded_at IS NULL AND retired = 0 AND created_at < ?`,
      d.kind,
      cutoff,
    )) {
      const bare = row.id.slice(row.id.indexOf('.') + 1);
      const read = deps.sql.one<{ n: number }>(
        'SELECT count(*) AS n FROM observation WHERE kind = ? AND subject = ? AND day >= ?',
        d.signal,
        bare,
        since,
      );
      if (Number(read?.n ?? 0) === 0)
        found.push({
          signal: d.signal,
          subject: bare,
          /* ZERO IS THE FINDING, and it is what makes this one readable beside the others: every
             number in a `why` sentence elsewhere is a count of things that happened, and this one is
             the count that did not. */
          n: 0,
          days: 0,
          window: `${DORMANT_DAYS}d`,
          why: d.why(bare),
        });
    }
  }

  return found;
}

export type AnalyseDeps = {
  sql: Sql;
  nowMs: number;
  mint: () => string;
  allocate: (name: string) => number;
  /** Queue the one draft a crossed threshold earns. */
  outbox: (payload: unknown) => void;
};

/**
 * Look at what the record has noticed, and propose at most one thing.
 *
 * THE GOVERNORS COME FIRST and they are why this is safe to run weekly. A record too new or too
 * quiet to have said anything yet says nothing; a record with three unanswered proposals already
 * open does not add a fourth; and a record whose recent proposals were mostly wrong stops proposing
 * until somebody has looked.
 */
export function analyse(deps: AnalyseDeps): Analysis {
  const suspended = governors(deps);
  if (suspended) return { candidate: null, found: [], suspended };

  /* THE COUNTS COME FROM SQL AND THE THRESHOLDS ARE APPLIED IN ONE PLACE, so a surface that reads
     these findings uses the same numbers as the analyser that writes them. */
  const counts: Counted[] = [];
  for (const d of DETECTORS) {
    const since = new Date(deps.nowMs - d.windowDays * DAY_MS).toISOString().slice(0, 10);
    for (const row of deps.sql.all<{ subject: string; total: number; days: number }>(
      'SELECT subject, sum(n) AS total, count(DISTINCT day) AS days FROM observation WHERE kind = ? AND day >= ? GROUP BY subject ORDER BY total DESC',
      d.signal,
      since,
    ))
      counts.push({ signal: d.signal, subject: row.subject, total: Number(row.total), days: Number(row.days) });
  }
  /* AND THE FINDINGS THAT ARE AN ABSENCE, which no amount of grouping over `observation` produces:
     the row is the one that is not there. They go last, so a register nobody reads never outranks a
     shape nobody can ingest — a thing that is failing beats a thing that is merely unused. */
  const full = fullLists(deps.sql);
  const found = [...findingsFrom(counts), ...dormant(deps)].map((f) => (full(f) ? { ...f, why: atCeiling(f) } : f));

  /* ONE AT A TIME, and the one that cleared its threshold by the most. A list of eleven proposals is
     a list nobody reads, and the second-best one will still be there next week.

     AND NOT ONE IT HAS ALREADY ASKED ABOUT. This runs weekly and nothing recorded that it had
     proposed, so one finding became one model-call draft every seven days for ever. The next-best
     finding is taken instead, which is the same rule read the other way round.

     AND NOT AN INDEX THE LIST HAS NO ROOM FOR (`full`): the finding stays in `found`, saying so, and no draft is
     queued for it. */
  const best = found.find((f) => !full(f) && !asked(deps, f)) ?? null;

  /**
   * ONE PROPOSAL IN TEN IS DRAWN FROM BELOW THE THRESHOLD — 24 §4.3's third governor, and the note
   * beside it says it is not optional.
   *
   * GREEDILY EXPLOITING YOUR OWN BEST CURRENT MODEL DEGENERATES FASTEST. An AIES 2019 result found
   * that an ORACLE greedy policy degenerates faster than a noisy one, and that growing the candidate
   * pool at least linearly is a NECESSARY condition for avoiding it. Without this the loop converges
   * on its own first three good ideas and then has nothing left to say — which looks, from outside,
   * exactly like a loop that has finished its work.
   *
   * DETERMINISTIC, NOT RANDOM. Every tenth draft this record has ever queued is the exploratory one,
   * counted off the outbox rather than off a coin — so two runs of the same record propose the same
   * thing, a test can reach the branch without stubbing anything, and nobody has to wonder whether
   * the odd proposal they are looking at was a fluke.
   *
   * AND IT IS MARKED. `exploratory: true` rides on the payload, so the draft says which it is, the
   * gate can show it, and the prediction it earns is scored the same way as any other — which is
   * the whole point: an exploration nobody grades is a guess.
   */
  const drafted = Number(
    deps.sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'infer.draft'")?.n ?? 0,
  );
  const exploring = (drafted + 1) % EXPLORE_EVERY === 0;
  const below = exploring ? findingsFrom(counts.filter((c) => !found.some((f) => f.subject === c.subject)), true) : [];
  const candidate = (exploring ? (below.find((f) => !full(f) && !asked(deps, f)) ?? best) : best) ?? null;

  if (candidate)
    deps.outbox({
      signal: candidate.signal,
      subject: candidate.subject,
      n: candidate.n,
      window: candidate.window,
      why: candidate.why,
      ...(exploring && below.some((f) => f.subject === candidate.subject) ? { exploratory: true } : {}),
    });

  return { candidate, found, suspended: null };
}

/** One in ten, and the number is 24 §4.3's. */
const EXPLORE_EVERY = 10;

/**
 * The most fields one list may index, `02 §5`'s ceiling, which `declare.ts` refuses past as `INDEXES_OVER_CAP`.
 *
 * READ HERE AS WELL AS AT INSTALL, because the scan advice drafted "an index would pay for itself" for a list already
 * holding eight, and the proposal it earned could not install: a model call spent on a change nobody can accept, and
 * three of those marked incorrect suspend the whole analyser (`governors`).
 */
export const INDEX_CEILING = 8;

/**
 * Whether a finding is a scan of a list that already indexes `INDEX_CEILING` fields, so no index can be proposed for it.
 *
 * COUNTED AS `declare.ts` COUNTS IT, every field declaring `index: true` or `unique: true` on the live declaration, and
 * asked once per list per look, so a look reads each list's declaration at most once however many of its fields were
 * scanned.
 */
function fullLists(sql: Sql): (f: Finding) => boolean {
  const known = new Map<string, boolean>();
  return (f) => {
    if (f.signal !== 'query.scan') return false;
    const list = f.subject.slice(0, Math.max(0, f.subject.indexOf('.')));
    if (list === '') return false;
    if (!known.has(list)) {
      const body = sql.one<{ body: string }>(
        'SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1',
        `register.${list}`,
      )?.body;
      const fields = body === undefined ? undefined : (JSON.parse(body) as { fields?: unknown }).fields;
      const indexed = Array.isArray(fields)
        ? fields.filter((x) => typeof x === 'object' && x !== null && ((x as { index?: unknown }).index === true || (x as { unique?: unknown }).unique === true)).length
        : 0;
      known.set(list, indexed >= INDEX_CEILING);
    }
    return known.get(list) === true;
  };
}

/** What a scan finding says when its list has no room for another index: the count, and that nothing is proposed. */
const atCeiling = (f: Finding): string => {
  const list = f.subject.slice(0, f.subject.indexOf('.'));
  return `${f.subject} was scanned ${f.n} times in thirty days, and ${list} already indexes ${INDEX_CEILING} fields, its ceiling, so no index is proposed.`;
};

const thresholdOf = (signal: Signal): number => DETECTORS.find((d) => d.signal === signal)?.n ?? 1;

/** One row of what a record has noticed: a signal, a subject, how often and over how many days. */
export type Counted = { signal: Signal; subject: string; total: number; days: number };

/**
 * The findings a set of counts clears, best first — and the ONE place the thresholds are applied.
 *
 * SEPARATED FROM THE QUERY so that the surface reading these can use the same numbers as the
 * analyser that writes them. Two copies of a threshold is a screen that says a pattern has been
 * reached and a proposal that never comes, or the other way round — and both read as the product
 * being wrong about itself, which is worse than either.
 */
export function findingsFrom(counts: readonly Counted[], below = false): Finding[] {
  const found: Finding[] = [];
  for (const d of DETECTORS)
    for (const row of counts)
      /* `below` INVERTS THE COUNT AND KEEPS THE DISPERSION. An exploration is a signal that has not
         yet cleared its threshold but is not noise either — half the count over the same number of
         separate days. A burst is still not a pattern, whichever side of the line it is on. */
      if (
        row.signal === d.signal &&
        !onColumn(row.signal, row.subject) &&
        row.days >= d.days &&
        (below ? row.total >= Math.ceil(d.n / 2) && row.total < d.n : row.total >= d.n)
      )
        found.push({
          signal: d.signal,
          subject: row.subject,
          n: row.total,
          days: row.days,
          window: `${d.windowDays}d`,
          why: d.why(row.subject, row.total),
        });

  /* BY HOW FAR EACH CLEARED ITS OWN THRESHOLD, so a signal that needs two hundred and got four
     hundred outranks one that needs five and got six. */
  return found.sort((a, b) => b.n / thresholdOf(b.signal) - a.n / thresholdOf(a.signal));
}

/** How long each detector looks back, so a caller can ask the right question of its own store. */
export const WINDOWS: Readonly<Record<Signal, number>> = Object.fromEntries(
  DETECTORS.map((d) => [d.signal, d.windowDays]),
) as Record<Signal, number>;

/**
 * Whether this record has already asked about this exact finding, recently.
 *
 * RECENTLY, AND IT USED TO MEAN EVER. `outbox` rows are never purged, so a finding proposed once and
 * dismissed was never raised again however much worse it got — twelve refused writes and four
 * hundred were the same to it. That is the opposite failure from flooding the queue and it is the
 * quieter one, because nothing says the record decided to stop mentioning something.
 *
 * The window is the proposal rate's own week (§4.3's second governor), so a finding that is still
 * true a week later comes back once, and never twice in the same week.
 */
const asked = (deps: AnalyseDeps, f: Finding): boolean =>
  Boolean(
    deps.sql.one(
      `SELECT 1 AS x FROM outbox WHERE kind = 'infer.draft' AND state <> 'dead' AND created >= ?
       AND json_extract(payload, '$.signal') = ? AND json_extract(payload, '$.subject') = ?`,
      instant(deps.nowMs - WEEK_MS),
      f.signal,
      f.subject,
    ),
  );

/** One proposal per record per week (24 §4.3). A week, in the one place that says how long that is. */
const WEEK_MS = 7 * DAY_MS;

/**
 * The four reasons the analyser says nothing.
 *
 * A RECORD TOO NEW TO HAVE AN OPINION ABOUT is the first one, and it matters most: every one of
 * these detectors is a claim about a habit, and a fortnight of use is not a habit.
 */
function governors(deps: AnalyseDeps): string | null {
  const live = Number(deps.sql.one<{ n: number }>('SELECT count(*) AS n FROM entry WHERE deleted_at IS NULL')?.n ?? 0);
  if (live <= 20) return `your BrainDog holds ${live} things so far, too few to show a habit.`;

  const days = Number(deps.sql.one<{ n: number }>('SELECT count(DISTINCT substr(ts, 1, 10)) AS n FROM event')?.n ?? 0);
  if (days <= 3) return `your BrainDog has been written to on ${days} days, which is not yet a pattern of use.`;

  const first = deps.sql.one<{ ts: string }>('SELECT ts FROM event ORDER BY rowid LIMIT 1')?.ts;
  if (!first || deps.nowMs - Date.parse(first) < 14 * DAY_MS) return 'your BrainDog is under a fortnight old.';

  /* A DEFERRED QUESTION IS NOT AN UNANSWERED ONE, and this counted it as one. `listGovernance`
     excludes deferred rows from the queue and this did not, so three questions deferred to next year
     left `/decide` showing nothing to answer while the analyser reported three proposals already
     open and stopped for a year. The operator sees an empty queue and a silent loop and has no way
     to connect them. Same clause, in both places. */
  const open = Number(
    deps.sql.one<{ n: number }>(
      `SELECT count(*) AS n FROM suggestion WHERE opened_by = 'system' AND status = 'open'
       AND (defer_until IS NULL OR defer_until <= ?)`,
      instant(deps.nowMs),
    )?.n ?? 0,
  );
  /* THREE, and the comment above says three: at `open === 3` this used to add a fourth. */
  if (open >= 3) return `${open} proposals are already open and unanswered.`;

  /* ONE PROPOSAL PER RECORD PER WEEK — §4.3's second governor, and the half of it that was never
     built. Three-at-once caps the QUEUE; this caps the RATE, and without it a caller invoking
     `analyse()` twice in a day got two drafts and two model bills. They are not the same governor:
     a record that answers every proposal the day it arrives never reaches three open, and could be
     asked something new every hour. */
  /* `state <> 'dead'`, the same clause `asked` uses. A draft that died after eight attempts
     delivered nothing, and counting it muted the loop for a week on the strength of a bill nobody
     was sent. Two queries about the same rows in the same function disagreeing is how one of them
     ends up meaning something nobody intended. */
  const lately = deps.sql.one<{ ts: string }>(
    "SELECT created AS ts FROM outbox WHERE kind = 'infer.draft' AND state <> 'dead' ORDER BY rowid DESC LIMIT 1",
  )?.ts;
  if (lately && deps.nowMs - Date.parse(lately) < WEEK_MS)
    return 'a proposal has already been drafted this week, and the queue is the product.';

  /* THE OTHER BRAKE, AND THE ONLY ONE A YOUNG RECORD CAN REACH. Three of a class marked `incorrect`
     in ninety days (§4.3) stops that class. The implemented brake below needs twenty SCORED
     predictions, which take a year of accepted changes — so until this existed, a class the owner
     had said was wrong three times kept arriving, which is exactly how a gate gets muted. */
  const wrong = deps.sql.all<{ subject: string; n: number }>(
    `SELECT subject, SUM(n) AS n FROM observation
     WHERE kind = 'suggestion.incorrect' AND day >= ? GROUP BY subject HAVING SUM(n) >= 3
     ORDER BY n DESC, subject`,
    new Date(deps.nowMs - 90 * DAY_MS).toISOString().slice(0, 10),
  );
  const worst = wrong[0];
  if (worst) {
    /* IT SUSPENDS THE ANALYSER, NOT THE CLASS, and the sentence says so. `governors` returning any
       string stops the whole weekly run, so three `change` proposals marked incorrect also silence
       `search.empty`, `ingest.unmatched` and `query.scan`. That is the conservative reading of
       24 §4.3 and it is defensible — what was not defensible was a sentence claiming otherwise.

       AND IT SAYS SO OUT LOUD, once, like the other brake. This returned a sentence and wrote
       nothing, so the loop stopped with nothing in the digest or the audit log to say why — the
       exact failure fixed for the scored-prediction brake, reintroduced beside it, on the brake that
       fires more often because it is the only one a young record can reach. */
    const said = `${worst.n} ${worst.subject} proposals were marked incorrect in ninety days, so proposing is suspended until somebody has looked.`;
    if (!braked(deps)) brakeNote(deps, said);
    return said;
  }

  /* THE BRAKE. A proposal class that keeps being wrong stops being proposed. Twenty scored
     predictions and fewer than three in five met means the analyser is not earning its place, and a
     loop with no way to notice that is a loop that gets muted — which is worse than none, because it
     is still spending. */
  const scored = deps.sql.all<{ met: number | null }>(
    'SELECT met FROM prediction WHERE scored_at IS NOT NULL ORDER BY scored_at DESC LIMIT 20',
  );
  if (scored.length === 20) {
    const met = scored.filter((r) => r.met === 1).length / 20;
    const on = braked(deps);

    /* TWO THRESHOLDS, NOT ONE — 24 §4.7's 70/60, and both numbers are a Wilson interval rather than
       a feeling. At n=20 and p̂=0.70 the 95% lower bound is 0.481, the smallest observed rate still
       about a coin flip; at p̂=0.60 it is 0.387, clearly worse than one. With only the lower number
       a record oscillating around 60% suspends, resumes at 61% and suspends again, and every flap is
       an unexplained change in whether the loop speaks at all. So it goes on below 0.6 and does not
       come off until 0.7. */
    if (met < STOP || (on && met < GO)) {
      const said = `${Math.round(met * 100)}% of the last twenty predictions were met, so proposing is suspended until somebody has looked.`;
      /* SAID OUT LOUD, ONCE PER SUSPENSION. The guard used to be a `LIKE` over all of `event`, which
         is append-only — so the first suspension in a record's life was announced and every later
         one was silent. The loop then stops proposing with nothing in the digest, the audit log or
         the app to say why, and 24 §7's warning is about exactly that: if the brake never seems to
         fire, everybody quietly assumes it cannot. */
      if (!on) brakeNote(deps, said);
      return said;
    }

    /* AND COMING OFF IS AN EVENT TOO. It is what makes the state above readable from the log rather
       than kept in a column that could disagree with it — and somebody who was told the loop stopped
       is owed the sentence saying it started again. */
    if (on) brakeNote(deps, `${Math.round(met * 100)}% of the last twenty predictions were met, so proposing has resumed.`);
  }

  return null;
}

/** The brake's two thresholds. Below `STOP` it goes on; it stays on until `GO`. 24 §4.7. */
const STOP = 0.6;
const GO = 0.7;

/** The words that make a brake event a brake event. Both notes carry it; nothing else does. */
const BRAKE = '%of the last twenty predictions were met%';

/**
 * Whether the brake is currently on.
 *
 * THE NEWEST BRAKE EVENT IS THE STATE. Suspending and resuming both write a `note` by `system`, so
 * "is it on?" is "was the last one a suspension?" — readable from the audit log, impossible to
 * disagree with what the record told somebody, and no column to keep in step.
 *
 * An earlier attempt compared the note against the newest scored prediction, which looked equivalent
 * and was not: the next batch of scores is always newer than the note, so the brake released itself
 * on the very next analysis and the hysteresis it exists for never applied.
 */
function braked(deps: AnalyseDeps): boolean {
  const last = deps.sql.one<{ note: string }>(
    `SELECT note FROM event WHERE kind = 'note' AND actor = 'system' AND note LIKE ?
     ORDER BY rowid DESC LIMIT 1`,
    BRAKE,
  )?.note;
  return Boolean(last?.includes('suspended'));
}

const brakeNote = (deps: AnalyseDeps, said: string): void => {
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, 'system', 'note', NULL, NULL, ?)",
    deps.mint(),
    instant(deps.nowMs),
    said,
  );
};

/* ── whether Slash may file another question at all ──────────────────────────────────────────────────────── */

/**
 * The brake as it stands: on or off, the share of the window he took up, and how many answers it was worked out from.
 * `lapsed` is how many of that window were offers he let pass, counted as a no, and is absent where there were none.
 */
export type Brake = { on: boolean; share: number; of: number; lapsed?: number };

/** Whether Slash may file another question, and when it may not, the one sentence that says why. */
export type MayPropose = { may: true } | { may: false; why: string; share?: number; of?: number };

/** The window the brake reads: Slash's last twenty answered questions (24 §4.7, the scored brake's own twenty). */
const BRAKE_OF = 20;
/** The most of Slash's answers read to walk the brake's history. A night files a handful, so this is years of them. */
const ANSWERS_READ = 500;
/** The floor: a fortnight since a person first used the record, and use on five separate days (HD.410). */
const FLOOR = { days: 14, used: 5 };

/**
 * The brake over Slash's answered questions, oldest first, `true` where he took it up (`addressed`).
 *
 * THE HISTORY IS THE STATE. The scored-prediction brake keeps its state in a note signed `system`; this one writes
 * nothing, so it walks every window of twenty in order with the same two thresholds: on below `STOP`, off again only at
 * `GO`. A share of 0.65 is braked after a fall from 0.7 and free after a climb from 0.5, which is the hysteresis, and
 * no row can disagree with it because there is no row. Under twenty answers it never brakes: too few to say.
 */
export function brakeOf(answers: readonly boolean[]): Brake {
  const took = (from: number, to: number): number => answers.slice(from, to).filter(Boolean).length;
  if (answers.length < BRAKE_OF) return { on: false, share: answers.length === 0 ? 0 : took(0, answers.length) / answers.length, of: answers.length };
  let on = false;
  let share = 0;
  for (let end = BRAKE_OF; end <= answers.length; end++) {
    share = took(end - BRAKE_OF, end) / BRAKE_OF;
    if (share < STOP) on = true;
    else if (on && share >= GO) on = false;
  }
  return { on, share, of: BRAKE_OF };
}

/** A day as an offer's `lapses` spells it, and a real one: the 31st of September is not. */
const isLapseDay = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The `lapses` an offer's body carries, read in the query; a body that is not JSON carries none rather than throwing. */
const LAPSES_SQL = "CASE WHEN json_valid(s.body) THEN json_extract(s.body, '$.lapses') END";

/** One of Slash's answers as the brake reads it: whether he took it up, whether it lapsed, and when. */
type Answer = { took: boolean; lapsed: boolean; at: string; seq: number };

/**
 * The brake on this record: Slash's answered questions in the order he answered them, a lapse counting as a no.
 *
 * HIS ANSWER, NEVER THE RECORD'S. Answered is resolved as `addressed`, `wont-fix` or `incorrect`; one withdrawn, moot,
 * asked again or still deferred was never put to him and decided, so it is in no window.
 *
 * A LAPSE IS A NO ("Slash learns from being ignored"). An offer nobody answered by its `lapses` day is closed
 * by govern.ts `sweepLapsed` as `withdrawn` with `lapsedNote`, after that day; one a stronger offer took the place of
 * (`makeRoom`) or its filer took back is `withdrawn` before it, and stays out. Until the sweep runs, a lapsed offer is
 * still open with its day behind it, and that counts too, as the record's engine readings already read it (`endingOf`):
 * open, not put off past now, its day before today in the record's zone. Each is ordered by when it lapsed: the sweep's
 * close, or the end of its day. Without `nowMs` only the swept ones count, since nothing says what today is. `tz` is
 * the record's zone, UTC where it is not said. ONLY `all` IS ASKED OF THE STORE, so a host's bare read can ask it too.
 */
export function slashBrake(sql: Pick<Sql, 'all'>, nowMs?: number, tz?: string | null): Brake {
  const closed = sql.all<{ r: string; lapses: unknown; at: string | null; seq: number | null; rid: number }>(
    `SELECT s.resolved_as AS r, ${LAPSES_SQL} AS lapses, e.ts AS at, e.rowid AS seq, s.rowid AS rid FROM suggestion s
     LEFT JOIN event e ON e.rowid = (SELECT max(x.rowid) FROM event x WHERE x.target = 'suggestion:' || s.id AND x.kind = 'resolve')
     WHERE s.opened_by = 'slash' AND s.status = 'resolved' AND s.resolved_as IN ('addressed', 'wont-fix', 'incorrect', 'withdrawn')
     ORDER BY e.rowid DESC, s.rowid DESC
     LIMIT ?`,
    ANSWERS_READ * 2,
  );
  const answers: Answer[] = [];
  for (const c of closed) {
    const at = c.at ?? '';
    const seq = c.seq ?? 0;
    if (c.r !== 'withdrawn') answers.push({ took: c.r === 'addressed', lapsed: false, at, seq });
    else if (isLapseDay(c.lapses) && at.slice(0, 10) > c.lapses) answers.push({ took: false, lapsed: true, at, seq });
  }
  if (nowMs !== undefined) {
    const today = dayIn(nowMs, tz);
    const now = instant(nowMs);
    const open = sql.all<{ lapses: unknown; deferred: string | null }>(
      `SELECT ${LAPSES_SQL} AS lapses, s.defer_until AS deferred FROM suggestion s
       WHERE s.opened_by = 'slash' AND s.status = 'open' AND (s.defer_until IS NULL OR s.defer_until <= ?)`,
      now,
    );
    for (const o of open)
      if (isLapseDay(o.lapses) && o.lapses < today)
        answers.push({ took: false, lapsed: true, at: instant(Date.parse(`${o.lapses}T00:00:00Z`) + DAY_MS), seq: Number.MAX_SAFE_INTEGER });
  }
  answers.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.seq - b.seq));
  const kept = answers.slice(-ANSWERS_READ);
  const brake = brakeOf(kept.map((a) => a.took));
  const lapsed = kept.slice(-brake.of).filter((a) => a.lapsed).length;
  return lapsed > 0 ? { ...brake, lapsed } : brake;
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * Whether Slash may file another question now: the floor, the brake, then one arrangement offer a week.
 *
 * ONE GOVERNOR FOR EVERY QUESTION SLASH WOULD FILE. `governors` above holds the weekly analyser; this holds the daily
 * look and anything else Slash files. THE FLOOR IS A PERSON'S OWN USE (HD.410, "a fortnight of use is not a habit"):
 * events whose actor is a person (`p_`), never an agent, an import's run or `system`, so a record brought in with a
 * year of rows is as young as its owner's use. The brake is `slashBrake`. `arrangement` asks for an arrangement offer,
 * of which Slash files one a week. READS ONLY: nothing is written, so asking twice answers the same.
 */
export function mayPropose(sql: Sql, nowMs: number, opts: { arrangement?: boolean } = {}): MayPropose {
  const used = sql.one<{ first: string | null; days: number }>(
    `SELECT min(ts) AS first, count(DISTINCT substr(ts, 1, 10)) AS days FROM event
     WHERE actor LIKE 'p\\_%' ESCAPE '\\' AND ts <= ?`,
    instant(nowMs),
  );
  const first = used?.first ? Date.parse(used.first) : NaN;
  const days = Number(used?.days ?? 0);
  if (!Number.isFinite(first)) return { may: false, why: 'Slash waits until you have used BrainDog for two weeks, and you have not used it yet.' };
  const since = Math.floor((nowMs - first) / DAY_MS);
  if (since < FLOOR.days)
    return { may: false, why: `Slash waits until you have used BrainDog for two weeks, and you began ${since === 0 ? 'today' : `${plural(since, 'day')} ago`}.` };
  if (days < FLOOR.used) return { may: false, why: `Slash waits until you have used BrainDog on five days, and you have used it on ${plural(days, 'day')}.` };

  const brake = slashBrake(sql, nowMs, recordIdentity(sql)?.tz);
  if (brake.on) {
    const took = Math.round(brake.share * brake.of);
    /* THE ONES HE LET PASS ARE SAID, so a no he never typed is not read as one he did. */
    const why = brake.lapsed
      ? `Slash stopped offering: you took up ${took} of its last ${brake.of}, counting the ones you let pass.`
      : `You turned down ${brake.of - took} of the last ${brake.of}, so Slash waits.`;
    return { may: false, why, share: brake.share, of: brake.of };
  }

  if (opts.arrangement) {
    const lately = sql.one<{ x: number }>(
      "SELECT 1 AS x FROM suggestion WHERE opened_by = 'slash' AND body_kind = 'arrange' AND opened_at >= ? LIMIT 1",
      instant(nowMs - WEEK_MS),
    );
    if (lately) return { may: false, why: 'Slash offered a new arrangement this week, and it offers one a week.' };
  }
  return { may: true };
}
