/**
 * One typed line, read as a task: a light syntax that is never required.
 *
 * "Chase Halden tomorrow !urgent #kiln" is a task called "Chase Halden", due tomorrow, marked urgent and filed under
 * the project whose name starts with Kiln. Typed without any of it, the line is the task's words and nothing else.
 *
 * WHAT IS READ, AND WHERE:
 *   `#name`   anywhere: a project, by the start of its name or of any word in it. A `#` naming no project stays text.
 *   `!word`   anywhere: a priority, by the start of its value or its word (`!u`, `!urgent`, `!high`).
 *   `@name`   anywhere: the agent that holds it, by the name it signs with.
 *   a day     AT THE END ONLY, optionally after "by", "due" or "on": today, tomorrow, a weekday, next week,
 *             "in 3 days", "in 2 weeks", or `2026-10-04`. Only at the end, so "Write the Monday newsletter" keeps its
 *             Monday and "Call mum tomorrow" is due tomorrow.
 *
 * A LINE THAT WOULD BE LEFT EMPTY IS NOT READ AT ALL: "Tomorrow" alone is a task called Tomorrow.
 *
 * PURE: the day and the projects are handed in, so `capture.test.ts` drives every rule.
 */

import { addDays, daySaid, nextMonday, weekdayOf } from './board.ts';

export type CaptureContext = {
  /** The reader's day, `YYYY-MM-DD`. */
  today: string;
  /** The projects a task can be filed under, by number. Empty when the list has no project. */
  projects: readonly { seq: number; name: string }[];
  /** The priorities, most first, with their words; `null` when the list has none. */
  priorities: readonly { value: string; said: string }[] | null;
  /** Whether the list has a due day, and an agent. */
  due: boolean;
  agent: boolean;
};

export type Capture = {
  /** The task's words, with what was read taken out. */
  text: string;
  project: number | null;
  due: string | null;
  priority: string | null;
  agent: string | null;
};

const plain = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** The project a `#word` names: its whole name, then the start of its name, then the start of any word in it. */
export function projectNamed(word: string, projects: CaptureContext['projects']): number | null {
  const w = plain(word);
  if (w === '') return null;
  const exact = projects.find((p) => plain(p.name) === w);
  if (exact) return exact.seq;
  const lead = projects.find((p) => plain(p.name).startsWith(w));
  if (lead) return lead.seq;
  const inner = projects.find((p) => p.name.split(/\s+/).some((part) => plain(part).startsWith(w)));
  return inner ? inner.seq : null;
}

function priorityNamed(word: string, priorities: CaptureContext['priorities']): string | null {
  const w = word.toLowerCase();
  if (!priorities || w === '') return null;
  return priorities.find((p) => p.value.toLowerCase().startsWith(w) || p.said.toLowerCase().startsWith(w))?.value ?? null;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 };

/** The day that `n` trailing words name, or `null`. `words` are lower-cased. */
function dayNamed(words: readonly string[], today: string): string | null {
  const [a, b, c] = words;
  if (words.length === 1 && a !== undefined) {
    if (a === 'today' || a === 'tonight') return today;
    if (a === 'tomorrow' || a === 'tmrw' || a === 'tmr') return addDays(today, 1);
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) return a;
    const w = WEEKDAYS[a];
    if (w !== undefined) return addDays(today, (w - weekdayOf(today) + 7) % 7);
    return null;
  }
  if (words.length === 2 && a === 'next' && b !== undefined) {
    if (b === 'week') return nextMonday(today);
    const w = WEEKDAYS[b];
    if (w !== undefined) return addDays(today, ((w - weekdayOf(today) + 7) % 7) || 7);
    return null;
  }
  if (words.length === 2 && a === 'this' && b === 'weekend') return addDays(today, (6 - weekdayOf(today) + 7) % 7);
  if (words.length === 3 && a === 'in' && b !== undefined && c !== undefined) {
    const n = /^\d+$/.test(b) ? Number(b) : NUMBERS[b];
    if (n === undefined || n > 400) return null;
    if (c === 'day' || c === 'days') return addDays(today, n);
    if (c === 'week' || c === 'weeks') return addDays(today, n * 7);
    return null;
  }
  return null;
}

const LEADS = new Set(['by', 'due', 'on']);

/** One typed line, read. */
export function captureOf(typed: string, ctx: CaptureContext): Capture {
  const bare: Capture = { text: typed.trim(), project: null, due: null, priority: null, agent: null };
  const out: Capture = { ...bare };
  const kept: string[] = [];
  for (const token of typed.trim().split(/\s+/)) {
    if (token.length > 1 && token.startsWith('#') && ctx.projects.length > 0) {
      const p = projectNamed(token.slice(1), ctx.projects);
      if (p !== null && out.project === null) {
        out.project = p;
        continue;
      }
    }
    if (token.length > 1 && token.startsWith('!') && ctx.priorities) {
      const p = priorityNamed(token.slice(1), ctx.priorities);
      if (p !== null && out.priority === null) {
        out.priority = p;
        continue;
      }
    }
    if (ctx.agent && /^@[\p{L}][\p{L}\p{N}_-]*$/u.test(token) && out.agent === null) {
      out.agent = token.slice(1).toLowerCase();
      continue;
    }
    kept.push(token);
  }

  if (ctx.due) {
    /* THE LONGEST DAY AT THE END FIRST, so "in 2 weeks" is not read as a task ending "in 2" due in some weeks. */
    for (const n of [3, 2, 1]) {
      if (kept.length <= n) continue;
      const tail = kept.slice(-n).map((w) => w.toLowerCase().replace(/[.,;]$/, ''));
      const day = dayNamed(tail, ctx.today);
      if (day === null) continue;
      kept.splice(-n, n);
      if (kept.length > 1 && LEADS.has(kept[kept.length - 1]!.toLowerCase())) kept.pop();
      out.due = day;
      break;
    }
  }

  out.text = kept.join(' ').trim();
  return out.text === '' ? bare : out;
}

/** What was read off the line, as a short line under the field: `Due Wed 30 Sep · Kiln · Urgent · Claude`. */
export function captureSaid(c: Capture, ctx: CaptureContext): string[] {
  const out: string[] = [];
  if (c.due) out.push(`Due ${daySaid(c.due)}`);
  if (c.project !== null) out.push(ctx.projects.find((p) => p.seq === c.project)?.name ?? `#${c.project}`);
  if (c.priority) out.push(ctx.priorities?.find((p) => p.value === c.priority)?.said ?? c.priority);
  if (c.agent) out.push(c.agent.charAt(0).toUpperCase() + c.agent.slice(1));
  return out;
}

const ASKING = new Set(
  'who what when where why how which whose whom is are am was were do does did can could should would will shall has have had may might must'.split(' '),
);

/**
 * Whether a typed line is a question rather than a thing to do: it ends with a question mark, or opens with a word a
 * question opens with. "What is due this week" asks; "Chase Halden on the invoice" is a task.
 */
export function isQuestion(typed: string): boolean {
  const t = typed.trim();
  if (t === '') return false;
  if (t.endsWith('?')) return true;
  const first = t.split(/\s+/)[0]!.toLowerCase().replace(/[^a-z']/g, '');
  return ASKING.has(first);
}
