/**
 * A PROJECT'S NEXT STEP AS A CHECKLIST: the one sentence somebody keeps in `next` usually holds three or four jobs, with
 * their dates written into the words ("Read the ad test (25 Oct), fix the two leaks, then the import before 31 Oct").
 * Drawn whole it is a paragraph nothing can be ticked in and no date of which is ever late. Split here into its jobs, each
 * with the day it names pulled out as a chip, so the page draws it once as a list and says which job is late.
 *
 * WHERE IT SPLITS: at a full stop, at a comma or a semicolon outside brackets (", and" with it), before "then", and at
 * "and" where the word after it is a verb a job starts with ("Answer Lena and pick the asks"). Never inside brackets, and
 * never at the commas of a list after a colon ("then the sitting: billing, sign-in and legal" stays one job).
 *
 * WHICH DAYS: "25 Oct", "Oct 25", "25 October", "Sat 31 Oct" and "2026-10-25". A day in brackets alone, or after by,
 * before, on, due or until, is taken out of the words; any other day stays in them and is still the job's chip. A day
 * without a year is the one nearest the record's today.
 *
 * PURE, AND NODE LOADS IT.
 */

/** One job of a next step: its words, and the day it names as YYYY-MM-DD with the day said short ("25 Oct"), or none. */
export type NextItem = { text: string; day: string | null; said: string | null };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAY = '(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?\\.?,?\\s+)?';
/* THE DAY ITSELF, in any of the four ways it is written. Groups: 1 day 2 month | 3 month 4 day | 5 year 6 month 7 day. */
const DAY_SAID = `${WEEKDAY}(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b|${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b|(\\d{4})-(\\d{2})-(\\d{2}))`;
const DAY_RE = new RegExp(DAY_SAID, 'iu');
/* A DAY IN BRACKETS ALONE, "(25 Oct)" or "(about 30 Oct)", taken out with its brackets. */
const BRACKETED = new RegExp(`\\s*\\((?:about|around|by|due|on|until|before|c\\.)?\\s*${DAY_SAID}\\s*\\)`, 'iu');
/* A DAY AFTER A WORD THAT SAYS IT IS THE JOB'S DAY, "by Sat 31 Oct", taken out with that word. */
const LED = new RegExp(`\\s*\\b(?:by|before|on|due|until|till)\\s+${DAY_SAID}`, 'iu');

/** The words that start a clause hanging on the job before it, after which a comma is not a new job. */
const HANGS = /^\s+(?:before|after|until|till|once|when|while|so|because|since|as|if|unless|where|which|who|by|on|due)\b/iu;

/* THE WORDS A JOB STARTS WITH, so "and" splits "Answer Lena and pick the asks" and not "with the video and deck". */
const VERBS = new Set(
  'add answer ask book build call cancel chase check choose close confirm decide deploy design draft email file finish fix get hire invite launch list look make mark meet merge move open order pay pick plan post print publish push put read record reply review run schedule send set ship sign start submit switch talk tell test try turn update upload wire write'.split(
    ' ',
  ),
);

const pad = (n: number): string => String(n).padStart(2, '0');

/** The day a match names, as YYYY-MM-DD, the year nearest `now` where it says none; `null` for a day that is no day. */
function dayOf(m: RegExpExecArray, now: number): string | null {
  if (m[5] && m[6] && m[7]) return `${m[5]}-${m[6]}-${m[7]}`;
  const d = Number(m[1] ?? m[4]);
  const month = MONTHS.indexOf(String(m[2] ?? m[3] ?? '').slice(0, 3).toLowerCase());
  if (month < 0 || !(d >= 1 && d <= 31)) return null;
  const today = new Date(now);
  const y0 = today.getUTCFullYear();
  /* THE NEAREST OF LAST YEAR, THIS YEAR AND NEXT: "2 Jan" said in late December is next year's. */
  const near = [y0 - 1, y0, y0 + 1]
    .map((y) => ({ y, t: Date.UTC(y, month, d) }))
    .sort((a, b) => Math.abs(a.t - now) - Math.abs(b.t - now))[0]!;
  const check = new Date(near.t);
  if (check.getUTCMonth() !== month) return null;
  return `${near.y}-${pad(month + 1)}-${pad(d)}`;
}

/** "2026-10-25" said short: "25 Oct". */
export function daySaid(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(day);
  return m ? `${Number(m[3])} ${SHORT[Number(m[2]) - 1] ?? ''}`.trim() : day;
}

/** A job's words with the day pulled out where it is said as the job's day, and the day. */
function withDay(raw: string, now: number): NextItem {
  let text = raw;
  let found: RegExpExecArray | null = null;
  for (const re of [BRACKETED, LED]) {
    const m = re.exec(text);
    if (m) {
      found = DAY_RE.exec(m[0]);
      text = `${text.slice(0, m.index)}${text.slice(m.index + m[0].length)}`;
      break;
    }
  }
  if (!found) found = DAY_RE.exec(text);
  const day = found ? dayOf(found, now) : null;
  return { text: tidy(text), day, said: day ? daySaid(day) : null };
}

/* A JOB AS A LINE OF A LIST: no lead "and" or "then", no closing stop, its first word capitalised where it is a plain
   word (never "a16z", "iOS" or "eBay"). */
function tidy(s: string): string {
  let t = s.replace(/\s+/gu, ' ').trim();
  t = t.replace(/^(?:and|then|and then|also)\b[\s,]*/iu, '');
  t = t.replace(/[\s,;:]+$/u, '').replace(/\.+$/u, '').trim();
  const first = /^[a-z]+(?=\s|$)/u.exec(t);
  if (first) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

/** The sentence cut into its parts where a job ends, outside brackets and lists after a colon. */
function pieces(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let listed = false;
  let start = 0;
  const cut = (at: number, skip: number) => {
    out.push(text.slice(start, at));
    start = at + skip;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    if (depth > 0) continue;
    const rest = text.slice(i);
    /* A FULL STOP THAT ENDS A SENTENCE, never the one in "PR #10.5", "e.g." or "crumb.gg". */
    if (c === '.' && /^\.\s+[A-Z0-9]/u.test(rest)) {
      cut(i, 1);
      listed = false;
      continue;
    }
    if (c === ':') listed = true;
    if (listed) continue;
    /* NOT BEFORE A CLAUSE THAT HANGS ON THE JOB: "Settle the licence, before the issue announces it" is one job. */
    if ((c === ',' || c === ';') && /^[,;]\s/u.test(rest) && !HANGS.test(rest.slice(1))) {
      cut(i, 1);
      continue;
    }
    const then = /^\s+(?:and\s+)?then\s+/iu.exec(rest);
    if (then && i > start) {
      cut(i, then[0].length);
      i += then[0].length - 1;
      continue;
    }
    const and = /^\s+and\s+([a-z]+)\b/iu.exec(rest);
    if (and && VERBS.has(and[1]!.toLowerCase()) && i > start) {
      cut(i, and[0].length - and[1]!.length);
      i += and[0].length - and[1]!.length - 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/**
 * The next step's jobs, in the order written, each with its day where it names one. A step of one job is one item; an
 * empty step is none. `now` is the record's clock, which a day with no year is read against.
 */
export function nextSplit(next: string | null | undefined, now: number): NextItem[] {
  const text = typeof next === 'string' ? next.replace(/\s+/gu, ' ').trim() : '';
  if (text === '') return [];
  return pieces(text)
    .map((p) => withDay(p, now))
    .filter((x) => x.text !== '' && /[\p{L}\p{N}]/u.test(x.text));
}

/** The soonest day the step names, or `null`. */
export function nextDay(items: readonly NextItem[]): string | null {
  const days = items.flatMap((x) => (x.day ? [x.day] : [])).sort();
  return days[0] ?? null;
}
