/**
 * The engine's own readings (ENG-B01): what Slash's model was asked, by purpose, and what came of it, as figures.
 *
 * `engineHealth` says whether the model answers. This says what the engine did with the answers: for each purpose, how
 * many asks reached a model in the last day, week and month, and of the last day's how many were answered, how many
 * answers were kept and how many asks were refused; what still waits for a read and since when; and the newest failure.
 * Then the understanding: mentions that point at nothing, and the open questions by the kind of their cause. Then the
 * brake on Slash's questions (ENG-B17), echoed from the kernel's reading with the share it was worked out from.
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
 *
 * AND WHAT CAME OF SLASH'S SUGGESTIONS (ENG-B01 with ENG-A16, "answers that teach"): for each kind of question
 * Slash filed in the month, how many it offered and how each ended. Accepted is taken as it was filed; changed is taken
 * with only some of it (some rows of it, or some parts of an arrangement), since the person changed what was asked;
 * declined is a no; undone is one whose answer an undo put back; lapsed is one still open past the last day it waits,
 * or taken back on that day, worked out here as the kernel's sweep works it out and never written. Each question ends
 * one way, in that order of weight: an undone one is not also accepted. `share` is accepted over every one answered
 * (accepted, changed, declined, undone), the one number the agent side is judged by, and `null` with none answered.
 * Then the folds the record made by itself in the last seven days and how many were put back, and `outside`: the
 * events signed by Slash in the month that `slashMayWrite` would refuse, where 0 is the healthy answer. The caller
 * works those three counts out; here they are held to whole numbers. A kind is echoed only as a plain word.
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
  /**
   * The brake on Slash's questions, as the kernel's `slashBrake` reads it (ENG-B17): on or off, the share of his last
   * answers he took up, and how many it was worked out from. Absent where the caller read none, and the reading says
   * `null` then, never a brake that is off: an unread brake and a free one are not the same answer.
   */
  braked?: Braked | null | undefined;
  /** The questions Slash filed in the month, newest first. Absent reads as none filed. */
  slash?: readonly SlashFiled[] | undefined;
  /** The record's own day at `now`, `YYYY-MM-DD` in its zone, which a lapse day is compared with. Absent, the UTC day. */
  today?: string | undefined;
  /** The folds the record made by itself in the last seven days, and how many of them were put back. Absent reads 0. */
  folds?: Folds | undefined;
  /** Events signed by Slash in the month that Slash may not sign. Absent reads 0. */
  outside?: number | undefined;
};

/** Whether Slash's questions are braked, with the share and the count it was worked out from. */
export type Braked = { on: boolean; share: number; of: number; lapsed?: number };

/** One question Slash filed, as much of it as is counted: never its words, its body or who answered it. */
export type SlashFiled = {
  /** The kind of question, its body's kind. */
  kind: string;
  status: string;
  resolved_as: string | null | undefined;
  /** The option the decision that settled it chose, or `null` where no decision did. */
  answer: string | null | undefined;
  /** Accepted with only some of it taken. */
  in_part: boolean;
  /** An undo put back what its answer did. */
  undone: boolean;
  /** The last day it waits, as its body says it, or `null` where it says none. */
  lapses: string | null | undefined;
  /** Put off until this instant, or `null`. */
  defer_until: string | null | undefined;
  /** When it was last closed, or `null` for one never closed. */
  closed_at: string | null | undefined;
};

/** How Slash's questions of one kind ended over the month. */
export type SlashReading = {
  kind: string;
  offered: number;
  accepted: number;
  changed: number;
  declined: number;
  undone: number;
  lapsed: number;
  /** Accepted over answered, or `null` with none answered. */
  share: number | null;
};

export type Folds = { made: number; undone: number };

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
  /** The brake on Slash's questions, or `null` where it was not read. */
  braked: Braked | null;
  /** What came of Slash's questions in the month, by kind, sorted by kind. Empty where it filed none. */
  slash: SlashReading[];
  /** The record's own folds over the last seven days. */
  folds: Folds;
  /** Events signed by Slash in the month outside what it may sign. 0, or a fault. */
  outside: number;
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

/**
 * The brake as handed in, held to its shape: a share outside 0..1 or a count that is not a whole number is no reading,
 * so `null`, the same as one never read. Echoed, never worked out here: the kernel owns the arithmetic.
 */
const brakedOf = (b: Braked | null | undefined): Braked | null => {
  if (b === null || b === undefined || typeof b.on !== 'boolean') return null;
  if (!Number.isFinite(b.share) || b.share < 0 || b.share > 1 || !Number.isInteger(b.of) || b.of < 0) return null;
  return { on: b.on, share: b.share, of: b.of, ...(Number.isInteger(b.lapsed) && (b.lapsed as number) > 0 ? { lapsed: b.lapsed } : {}) };
};

/** A day as a lapse is spelled, `YYYY-MM-DD`, and a real one: the 31st of September is not one. */
const DAY_SPELT = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: unknown): s is string => typeof s === 'string' && DAY_SPELT.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The words a question is closed with as a no, beside a decision whose answer is `reject`. */
const NO: ReadonlySet<string> = new Set(['wont-fix', 'incorrect']);

type Ending = 'accepted' | 'changed' | 'declined' | 'undone' | 'lapsed' | null;

/**
 * How one question ended, or `null` for one still waiting, merged into another or taken back before its day.
 *
 * LAPSED AS THE KERNEL'S SWEEP READS IT (`sweepLapsed`): open, not put off past now, and its last day before today. A
 * question the sweep did take back is lapsed too, when it closed after its last day; one its filer took back sooner is
 * neither, since nobody was asked long enough to answer it.
 */
function endingOf(s: SlashFiled, today: string, now: string): Ending {
  if (s.undone) return 'undone';
  if (s.in_part) return 'changed';
  if (s.status === 'resolved') {
    if (s.resolved_as === 'addressed') return s.answer === 'reject' ? 'declined' : 'accepted';
    if (typeof s.resolved_as === 'string' && NO.has(s.resolved_as)) return 'declined';
    const closed = typeof s.closed_at === 'string' ? s.closed_at.slice(0, 10) : '';
    return s.resolved_as === 'withdrawn' && isDay(s.lapses) && closed > s.lapses ? 'lapsed' : null;
  }
  if (s.status !== 'open' || !isDay(s.lapses) || s.lapses >= today) return null;
  return typeof s.defer_until === 'string' && s.defer_until > now ? null : 'lapsed';
}

/** What came of the questions handed in, by kind, sorted by kind. */
function slashOf(filed: readonly SlashFiled[], today: string, now: string): SlashReading[] {
  const kinds = new Map<string, SlashReading>();
  for (const s of filed) {
    const kind = plain(s.kind);
    let k = kinds.get(kind);
    if (!k) {
      k = { kind, offered: 0, accepted: 0, changed: 0, declined: 0, undone: 0, lapsed: 0, share: null };
      kinds.set(kind, k);
    }
    k.offered += 1;
    const ended = endingOf(s, today, now);
    if (ended !== null) k[ended] += 1;
  }
  for (const k of kinds.values()) {
    const answered = k.accepted + k.changed + k.declined + k.undone;
    k.share = answered === 0 ? null : k.accepted / answered;
  }
  return [...kinds.values()].sort((a, b) => byName(a.kind, b.kind));
}

/** A count as handed in, held to a whole number from 0. */
const whole = (n: unknown): number => (typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0);

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
    braked: brakedOf(of.braked),
    slash: slashOf(of.slash ?? [], isDay(of.today) ? of.today : new Date(of.now).toISOString().slice(0, 10), new Date(of.now).toISOString()),
    folds: { made: whole(of.folds?.made), undone: Math.min(whole(of.folds?.undone), whole(of.folds?.made)) },
    outside: whole(of.outside),
  };
}
