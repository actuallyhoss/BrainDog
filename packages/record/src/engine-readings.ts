/**
 * The engine's own readings (ENG-B01): what Slash's model was asked, by purpose, and what came of it, as figures.
 *
 * `engineHealth` says whether the model answers. This says what the engine did with the answers: for each purpose, how
 * many asks reached a model in the last day, week and month, and of the last day's how many were answered, how many
 * answers were kept and how many asks were refused; what still waits for a read and since when; and the newest failure.
 * Then the understanding: mentions that point at nothing, and the open questions by the kind of their cause.
 *
 * PURE. The caller reads the ledger, the queue of what is owed, the mentions and the open questions, and hands them in
 * with the time. Nothing here opens a store or reads a clock, so the counts are held by a test over a ledger it writes.
 *
 * COUNTED BY THE `purpose` COLUMN (ENG-A05), never by the kind of an outbox row, and ONE WAY WITH THE HEALTH READ: which
 * row is a model that answered, which is one that did not and which says nothing are `@braindog/slash`'s three clauses
 * (`LEDGER_ANSWERED`, `LEDGER_FAILED`, `LEDGER_BUDGET` in its `health.ts`), restated here because this package never
 * imports that one.
 *
 * FIGURES ONLY, NEVER A ROW'S WORDS. A row's question, what it read and the provider's own words are not in the shape
 * this takes. A purpose is echoed only when it is a plain lower-case word, the shape every purpose the engine writes
 * has, and anything else is counted under `other`. A cause is cut to the word before its first `#` (`rowset`, `install`,
 * `options`), because its tail names a list or a pack and one open question holds one cause, so counting whole causes
 * would count every one as 1. The newest failure is its code and its time.
 *
 * THE DAY IS THE LAST 24 HOURS, the week the last 7 days and the month the last 30, each ending now, so a reading does
 * not empty at midnight or on the 1st. `answered`, `kept` and `refused` are the last day's, the window of `asked.day`:
 * the vital sign is red when a purpose has `asked.day` above 0 and `answered` 0.
 */

/** One `slash_call` row, as much of it as is counted. `raw` may be handed in and is never read. */
export type LedgerCall = {
  ts: string;
  model: string;
  status: string;
  code?: string | null | undefined;
  purpose: string;
  raw?: string | null | undefined;
};

/** One thing that waits for a model to read it, for a purpose, since `at`. */
export type OwedRead = { purpose: string; at: string };

/** One mention the understanding kept: whether it points at something in the record. */
export type MentionSeen = { attached: boolean };

/** One open question, by its cause (`packages/kernel/src/cause.ts`); `null` where it has none. */
export type OpenQuestion = { cause: string | null | undefined };

export type ReadingsOf = {
  /** The time the reading is made at, in milliseconds. */
  now: number;
  calls: readonly LedgerCall[];
  owed: readonly OwedRead[];
  mentions: readonly MentionSeen[];
  questions: readonly OpenQuestion[];
};

export type AskReading = {
  purpose: string;
  /** Asks that reached a model, answered or not. */
  asked: { day: number; week: number; month: number };
  /** Of the last day's: the model spoke, whatever came of it afterwards. */
  answered: number;
  /** Of the last day's answers: the ones the engine used. */
  kept: number;
  /** Of the last day's: an answer the check refused, or an ask turned away before any model because the month was spent. */
  refused: number;
  owed: number;
  /** When the oldest thing still owed was written, or `null` when nothing is owed or none says when. */
  oldest_owed: string | null;
  /** The newest ask in the month that reached no model or got no readable answer. */
  last_error: { at: string; code: string } | null;
};

export type EngineReadings = {
  asks: AskReading[];
  understanding: { unattached: number; open_by_cause: Record<string, number> };
};

/** Where a purpose or a cause that is not a plain word is counted. */
export const OTHER = 'other';

/** Where an open question with no cause is counted. */
export const UNSAID = 'unsaid';

const DAY = 86_400_000;
export const WEEK_DAYS = 7;
export const MONTH_DAYS = 30;

/** A model that did not answer (`LEDGER_FAILED`). */
const FAILED: ReadonlySet<string> = new Set(['UNREACHABLE', 'PULL_REQUEST_REFUSED', 'ANSWER_UNREADABLE']);

/** The month's asks spent, under `-` (`LEDGER_BUDGET`). */
const BUDGET: ReadonlySet<string> = new Set(['SLASH_BUDGET_SPENT', 'SPARK_BUDGET_SPENT']);

/** A hold in flight, a budget refusal or a build without the model: none is an ask that reached one (`LEDGER_ANSWERED`). */
const SILENT: ReadonlySet<string> = new Set(['SLASH_PENDING', 'SPARK_PENDING', 'NOT_IN_THIS_BUILD', ...BUDGET]);

const PLAIN = /^[a-z][a-z0-9_-]{0,31}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,47}$/;

const plain = (word: string): string => (PLAIN.test(word) ? word : OTHER);

/** What one row says about the model: it failed, it answered, the month was spent, or nothing either way. */
const said = (c: LedgerCall): 'answered' | 'failed' | 'budget' | 'silent' => {
  const code = c.code ?? '';
  if (c.model === '-') return BUDGET.has(code) ? 'budget' : 'silent';
  if (SILENT.has(code)) return 'silent';
  return c.status === 'error' && FAILED.has(code) ? 'failed' : 'answered';
};

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Count the ledger, the queue, the mentions and the open questions handed in, as they stand at `of.now`. */
export function engineReadings(of: ReadingsOf): EngineReadings {
  const asks = new Map<string, AskReading>();
  const at = (purpose: string): AskReading => {
    const name = plain(purpose);
    let a = asks.get(name);
    if (!a) {
      a = { purpose: name, asked: { day: 0, week: 0, month: 0 }, answered: 0, kept: 0, refused: 0, owed: 0, oldest_owed: null, last_error: null };
      asks.set(name, a);
    }
    return a;
  };

  for (const c of of.calls) {
    const t = Date.parse(c.ts);
    const age = of.now - t;
    /* A TIME THAT CANNOT BE READ, OR ONE AFTER NOW, IS IN NO WINDOW: counting it somewhere would be a guess. */
    if (!Number.isFinite(t) || age < 0 || age >= MONTH_DAYS * DAY) continue;
    const what = said(c);
    if (what === 'silent') continue;
    const a = at(c.purpose);
    const today = age < DAY;
    if (what === 'budget') {
      if (today) a.refused += 1;
      continue;
    }
    a.asked.month += 1;
    if (age < WEEK_DAYS * DAY) a.asked.week += 1;
    if (what === 'failed') {
      /* ISO instants compare as text, which is how the ledger orders them too. */
      const when = new Date(t).toISOString();
      if (a.last_error === null || when > a.last_error.at) a.last_error = { at: when, code: CODE.test(c.code ?? '') ? (c.code as string) : 'UNKNOWN' };
    }
    if (!today) continue;
    a.asked.day += 1;
    if (what === 'answered') {
      a.answered += 1;
      if (c.status === 'ok') a.kept += 1;
      if (c.status === 'refused') a.refused += 1;
    }
  }

  for (const o of of.owed) {
    const a = at(o.purpose);
    a.owed += 1;
    const t = Date.parse(o.at);
    if (!Number.isFinite(t)) continue;
    const when = new Date(t).toISOString();
    if (a.oldest_owed === null || when < a.oldest_owed) a.oldest_owed = when;
  }

  const causes = new Map<string, number>();
  for (const q of of.questions) {
    const cause = q.cause ?? '';
    const cut = cause.indexOf('#');
    const name = cause === '' ? UNSAID : plain(cut === -1 ? cause : cause.slice(0, cut));
    causes.set(name, (causes.get(name) ?? 0) + 1);
  }

  return {
    asks: [...asks.values()].sort((a, b) => byName(a.purpose, b.purpose)),
    understanding: {
      unattached: of.mentions.reduce((n, m) => n + (m.attached ? 0 : 1), 0),
      open_by_cause: Object.fromEntries([...causes.entries()].sort((a, b) => byName(a[0], b[0]))),
    },
  };
}
