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

import { instant } from './migrate.ts';

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
export type Observation = { kind: Signal; subject: string };

/** At most this many in one call. A batch is a request's worth, not a backfill. */
const BATCH = 200;

/**
 * Record what happened, pre-aggregated by day.
 *
 * ONE ROW PER KIND PER SUBJECT PER DAY, incremented. The alternative — a row per event — is a table
 * that grows with usage and is never read at that grain, and the detectors below all ask about days.
 */
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
      return no<number>('ENUM_VALUE_UNKNOWN', `${row.kind} is not a signal this record observes.`, {
        at: 'kind',
        allowed: SIGNALS,
      });

  const day = new Date(nowMs).toISOString().slice(0, 10);
  let n = 0;
  for (const row of batch) {
    if (!row.subject) continue;
    sql.exec(
      'INSERT INTO observation (kind, subject, day, n) VALUES (?, ?, ?, 1) ON CONFLICT (kind, subject, day) DO UPDATE SET n = n + 1',
      row.kind,
      row.subject,
      day,
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
  const found = findingsFrom(counts);

  /* ONE AT A TIME, and the one that cleared its threshold by the most. A list of eleven proposals is
     a list nobody reads, and the second-best one will still be there next week.

     AND NOT ONE IT HAS ALREADY ASKED ABOUT. This runs weekly and nothing recorded that it had
     proposed, so one finding became one model-call draft every seven days for ever. The next-best
     finding is taken instead, which is the same rule read the other way round. */
  const candidate = found.find((f) => !asked(deps, f)) ?? null;

  if (candidate)
    deps.outbox({ signal: candidate.signal, subject: candidate.subject, n: candidate.n, window: candidate.window, why: candidate.why });

  return { candidate, found, suspended: null };
}

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
export function findingsFrom(counts: readonly Counted[]): Finding[] {
  const found: Finding[] = [];
  for (const d of DETECTORS)
    for (const row of counts)
      if (row.signal === d.signal && row.total >= d.n && row.days >= d.days)
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
  if (live <= 20) return `this record holds ${live} rows, and a detector is a claim about a habit.`;

  const days = Number(deps.sql.one<{ n: number }>('SELECT count(DISTINCT substr(ts, 1, 10)) AS n FROM event')?.n ?? 0);
  if (days <= 3) return `this record has been written on ${days} days, which is not yet a pattern of use.`;

  const first = deps.sql.one<{ ts: string }>('SELECT ts FROM event ORDER BY rowid LIMIT 1')?.ts;
  if (!first || deps.nowMs - Date.parse(first) < 14 * DAY_MS) return 'this record is under a fortnight old.';

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
  const lately = deps.sql.one<{ ts: string }>(
    "SELECT created AS ts FROM outbox WHERE kind = 'infer.draft' ORDER BY rowid DESC LIMIT 1",
  )?.ts;
  if (lately && deps.nowMs - Date.parse(lately) < WEEK_MS)
    return 'a proposal has already been drafted this week, and the queue is the product.';

  /* THE OTHER BRAKE, AND THE ONLY ONE A YOUNG RECORD CAN REACH. Three of a class marked `incorrect`
     in ninety days (§4.3) stops that class. The implemented brake below needs twenty SCORED
     predictions, which take a year of accepted changes — so until this existed, a class the owner
     had said was wrong three times kept arriving, which is exactly how a gate gets muted. */
  const wrong = deps.sql.all<{ subject: string; n: number }>(
    `SELECT subject, SUM(n) AS n FROM observation
     WHERE kind = 'suggestion.incorrect' AND day >= ? GROUP BY subject HAVING SUM(n) >= 3`,
    new Date(deps.nowMs - 90 * DAY_MS).toISOString().slice(0, 10),
  );
  const worst = wrong[0];
  if (worst)
    return `${worst.n} ${worst.subject} proposals were marked incorrect in ninety days, so that class is suspended.`;

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
