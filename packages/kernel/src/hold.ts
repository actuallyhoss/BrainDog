/**
 * The seven-day hold (PRF-A18, scope section 2.7): how many days in a row, ending yesterday, every hold sign on this
 * record read green, and the operator's hand marks that end such a run.
 *
 * WHY THIS EXISTS. "and his record's vital signs have stayed green for seven days running". Before this, the
 * `green-days` figure counted a day as green when one sign was green and none red, so a day on which four signs had
 * nothing to judge by, or a rule was loosened, still counted. The hold reads each hold sign's own row a day.
 *
 * THE RUN ENDS, walking back from yesterday, at the first day on which: a hold sign read red; a hold sign had nothing
 * to judge by (`none`); a hold sign has no row; a hold sign's `rule` differs from the next day's (a threshold moved, so
 * the days before were judged by another rule); or an operator's hand touched the record. It answers the count and the
 * reason, so a scorecard can print why the clock last went back.
 *
 * AN OPERATOR'S HAND is its own row in `sign_reading`, sign `hand`, state `none`. The `hand` column already says who
 * filed a reading, and the night rewrites the kernel's rows over whatever a day held, so a mark carried on a sign's row
 * would be lost by morning. `hand` is on no closed list: `fileSignReading` refuses it, `readSigns` never draws it, and
 * the night neither writes nor rewrites it (it prunes it at 400 days with the rest).
 *
 * NOTHING HERE IMPORTS `signs.ts`, which spreads other files into its list at load. The names below are its names, held
 * equal to them by `test/hold-days.test.ts`. Nothing names a list, a bank or a record.
 */

import type { Sql } from '@braindog/ports';

import { dayIn } from './finished.ts';

/** The ten hold signs: the nine of scope 2.2 and `arrived` (PRF-A20). Never the automation signs of `signs-flow.ts`. */
export const HOLD_SIGNS = [
  'arrivals-filed',
  'doors-silent',
  'numbers-arrive',
  'model-answers',
  'tools-listed',
  'briefing-true',
  'questions-by-cause',
  'oldest-question',
  'runs-true',
  'pages-clean',
  'arrived',
] as const;

export type HoldSign = (typeof HOLD_SIGNS)[number];

/** What a person reads for each hold sign: `VITAL_SIGNS`' names, held equal by the test. */
export const HOLD_NAMES: Readonly<Record<HoldSign, string>> = {
  'arrivals-filed': 'Arrivals file by themselves',
  'doors-silent': 'Busy doors do not go quiet',
  'numbers-arrive': 'Numbers arrive on schedule',
  'model-answers': 'The model answers',
  'tools-listed': 'Agents get the tool list',
  'briefing-true': 'What agents are told is true',
  'questions-by-cause': 'Each problem is asked once',
  'oldest-question': 'No question waits too long',
  'runs-true': 'Agent runs end cleanly',
  'pages-clean': 'Pages draw without errors',
  arrived: 'What shipped has arrived',
};

/** The sign id an operator's hand mark is kept under. On no closed list. */
export const HAND_SIGN = 'hand';

/** Why a run ended: the day it ended on was red, had nothing to judge by, had no reading, came before a changed rule, or
 *  held a hand mark; or the record kept no readings before it. */
export type HoldEnd = 'red' | 'none' | 'missing' | 'rule' | 'hand' | 'start';

/** The hold: `days` in a row to yesterday, the day the run ended on, the sign that ended it, and one sentence. */
export type Hold = { days: number; ended: HoldEnd; on: string; sign: HoldSign | null; said: string };

/** The calendar day before `day`, both `YYYY-MM-DD`. Its own copy, so nothing here reads `signs.ts`. */
const dayBefore = (day: string, back = 1): string => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
};

/** `3 October`, from a `YYYY-MM-DD` day: the day itself, so no zone moves it. */
const daySaid = (day: string): string => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(Date.parse(`${day}T12:00:00Z`));

const daysSaid = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;

/** A sign's name as it sits inside a sentence: quoted, since each name is a sentence of its own. */
const named = (s: HoldSign): string => `\u201c${HOLD_NAMES[s]}\u201d`;

type Kept = { state: string; rule: string };

/**
 * Days in a row, ending the day before `today` (`YYYY-MM-DD`, the record's zone), on which every hold sign read green
 * under the same rule as the day after and no hand touched the record. One query over the kept days, however long the run.
 */
export function holdDays(sql: Sql, today: string): Hold {
  const marks = new Set<string>();
  const byDay = new Map<string, Map<string, Kept>>();
  for (const r of sql.all<{ sign: string; day: string; state: string; rule: string }>(
    `SELECT sign, day, state, rule FROM sign_reading WHERE day < ? AND sign IN (SELECT value FROM json_each(?))`,
    today,
    JSON.stringify([HAND_SIGN, ...HOLD_SIGNS]),
  )) {
    if (r.sign === HAND_SIGN) marks.add(r.day);
    else (byDay.get(r.day) ?? byDay.set(r.day, new Map()).get(r.day)!).set(r.sign, { state: r.state, rule: r.rule });
  }
  const oldest = [...byDay.keys(), ...marks].sort()[0];

  let days = 0;
  let want = dayBefore(today);
  let after: Map<string, Kept> | null = null;
  const end = (ended: HoldEnd, sign: HoldSign | null, why: string): Hold => ({
    days,
    ended,
    on: want,
    sign,
    said: `${daysSaid(days)} in a row with every watched sign green. ${why}`,
  });

  for (;;) {
    const on = daySaid(want);
    if (oldest === undefined || want < oldest) return end('start', null, days === 0 ? 'No day has been read yet.' : `The record kept no readings before ${daySaid(dayBefore(want, -1))}.`);
    if (marks.has(want)) return end('hand', null, `An operator's hand touched the record on ${on}.`);
    const kept = byDay.get(want);
    /* A DAY WITH NO ROW AT ALL is the host not reading that night, not one sign failing, so no sign is blamed. */
    if (kept === undefined) return end('missing', null, `No sign was read on ${on}.`);
    for (const s of HOLD_SIGNS) {
      const k = kept.get(s);
      if (k === undefined) return end('missing', s, `${named(s)} was not read on ${on}.`);
      if (k.state === 'red') return end('red', s, `${named(s)} read red on ${on}.`);
      if (k.state !== 'green') return end('none', s, `${named(s)} had nothing to judge by on ${on}.`);
    }
    if (after !== null)
      for (const s of HOLD_SIGNS)
        if (after.get(s)!.rule !== kept.get(s)!.rule) return end('rule', s, `The rule behind ${named(s)} changed after ${on}.`);
    days++;
    after = kept;
    want = dayBefore(want);
  }
}

/** The most lines a day's hand mark keeps, as a reading keeps its facts. */
const MARK_LINES = 6;
const MARK_MOST = 200;

/**
 * Marks that an operator's hand touched the record today (the record's zone): a schedule row or a job requeued by anyone
 * but the system, a restore, or a replacing import. One row a day: the first mark's words are its sentence, every mark
 * adds one to its count, and the first six keep a line each. `what` says what was done, `by` who did it. Never throws on
 * words out of shape: they are cut, since a mark lost is a hold counted wrong.
 */
export function markHand(sql: Sql, what: string, by: string, nowMs: number, tz: string): { day: string; marks: number } {
  const day = dayIn(nowMs, zoneOr(tz));
  const said = (what.trim() || 'An operator touched the record.').slice(0, MARK_MOST);
  const who = (by.trim() || 'someone').slice(0, 80);
  sql.exec(
    `INSERT INTO sign_reading (sign, day, state, value, said, facts, rule, hand, read_at) VALUES (?, ?, 'none', 1, ?, json_array(?), ?, ?, ?)
       ON CONFLICT (sign, day) DO UPDATE SET value = value + 1,
         facts = CASE WHEN json_array_length(facts) < ${MARK_LINES} THEN json_insert(facts, '$[#]', excluded.said) ELSE facts END`,
    HAND_SIGN,
    day,
    said,
    said,
    HAND_SIGN,
    who,
    new Date(nowMs).toISOString(),
  );
  const marks = Number(sql.one<{ value: number }>('SELECT value FROM sign_reading WHERE sign = ? AND day = ?', HAND_SIGN, day)?.value ?? 1);
  return { day, marks };
}

/** A zone this runtime can read, or UTC. */
function zoneOr(tz: string): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}
