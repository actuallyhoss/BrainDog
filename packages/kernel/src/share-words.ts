/**
 * A share said as one plain sentence, sized for a phone (sharing plan §3.5): "Priya can edit tasks in Kiln until 1 Dec."
 *
 * NAMES, NEVER IDS. Every person, group, list, project and row is said through `names`, and one the namer does not know
 * is said as "someone" or "a list" rather than as its id. A bundle (a template's rows, written together) is one
 * sentence: its allow, with its denies after it, "except money and keys" on the whole record and "No keys." elsewhere.
 */

import { wall, type Hours, type Share, type Target } from './lens.ts';

export type ShareNames = {
  person?: (id: string) => string | undefined;
  group?: (id: string) => { name: string; people: number } | undefined;
  /** A list as a sentence says it: "tasks", "money lists" is said here for `has money`. */
  list?: (id: string) => string | undefined;
  project?: (id: string) => string | undefined;
  /** One row as a person reads it: "Task 42". */
  row?: (list: string, id: string) => string | undefined;
  /** A saved view: "Review". */
  view?: (id: string) => string | undefined;
};

export type WordsOpts = { now: number; tz?: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "a", "a and b", "a, b and c". */
export const joined = (xs: readonly string[], last = 'and'): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${last} ${xs[xs.length - 1]}`;

const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function whoOf(s: Share, n: ShareNames): string {
  const { kind, id } = s.who;
  if (kind === 'person') return n.person?.(id) ?? 'someone';
  if (kind === 'group') {
    const g = n.group?.(id);
    return g ? `${g.name} (${g.people} ${g.people === 1 ? 'person' : 'people'})` : 'a group';
  }
  if (kind === 'email') return id;
  return 'anyone with the link';
}

const listName = (id: string, n: ShareNames): string => n.list?.(id) ?? 'a list';

/** What a target is, as the object of a sentence. */
function whatOf(t: Target, n: ShareNames): string {
  if ('record' in t) return 'everything';
  if ('project' in t) {
    const p = n.project?.(t.project) ?? 'a project';
    return t.lists ? `${joined(t.lists.map((l) => listName(l, n)))} in ${p}` : `everything in ${p}`;
  }
  if ('lists' in t) {
    const ls = t.lists;
    if (Array.isArray(ls)) return joined(ls.map((l) => listName(l, n)));
    if ('has' in ls) return 'money lists';
    return ls.role === 'keys' ? 'keys' : 'people';
  }
  if ('rows' in t) {
    if (t.rows.length === 1) return n.row?.(t.list, t.rows[0]!) ?? `a row in ${listName(t.list, n)}`;
    return `${t.rows.length} ${listName(t.list, n)}`;
  }
  const view = t.view !== undefined ? n.view?.(t.view) : undefined;
  return view ? `${listName(t.list, n)} in ${view}` : `some ${listName(t.list, n)}`;
}

/** What a deny takes away, as a noun: "money", "keys", "Payroll". */
function nounOf(t: Target, n: ShareNames): string {
  if ('lists' in t && !Array.isArray(t.lists) && !('project' in t)) return 'has' in t.lists ? 'money' : t.lists.role === 'keys' ? 'keys' : 'people';
  return whatOf(t, n);
}

function verbOf(s: Share): string {
  const add = s.caps?.create === true && (s.can === 'view' || s.can === 'comment') ? ' and add to' : '';
  if (s.can === 'view') return `can view${add}`;
  if (s.can === 'comment') return `can comment on${add}`;
  return s.can === 'edit' ? 'can edit' : 'can manage';
}

/** A time of day as a person says it: 09:00 is 9, 18:30 is 6:30. */
function clockOf(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? String(twelve) : `${twelve}:${String(m).padStart(2, '0')}`;
}

function hoursOf(h: Hours): string {
  const days = [...h.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const key = [...h.days].sort().join();
  const on = key === '0,1,2,3,4,5,6' ? 'every day' : key === '1,2,3,4,5' ? 'on weekdays' : key === '0,6' ? 'at weekends' : `on ${joined(days.map((d) => SHORT[d]!))}`;
  return `${on} ${clockOf(h.from)} to ${clockOf(h.to)}`;
}

/** A day as a person says it, from now: today, tomorrow, a weekday within the week, else "1 Dec". */
export function dayOf(at: string, opts: WordsOpts): string {
  const tz = opts.tz ?? 'UTC';
  const ms = Date.parse(at);
  const a = wall(ms, tz);
  const b = wall(opts.now, tz);
  const days = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1 && days < 7) return DAYS[a.day]!;
  const date = `${a.d} ${MONTHS[a.m - 1]}`;
  return a.y !== b.y && Math.abs(days) > 300 ? `${date} ${a.y}` : date;
}

/** One share, or a bundle written together, as one plain sentence. */
export function sentenceOf(shares: Share | readonly Share[], names: ShareNames, opts: WordsOpts): string {
  const list = Array.isArray(shares) ? (shares as readonly Share[]) : [shares as Share];
  if (list.length === 0) return 'Nothing is shared.';
  const allow = list.find((s) => s.effect === 'allow');
  const denies = list.filter((s) => s.effect === 'deny');
  const first = allow ?? list[0]!;
  /* AN ADDRESS IS SAID AS IT IS SPELT, even at the start of a sentence. */
  const who = first.who.kind === 'email' ? whoOf(first, names) : upper(whoOf(first, names));

  if (!allow) {
    const d = denies[0]!;
    const verb = d.caps === undefined ? "can't see" : d.can === 'view' ? 'can only view' : d.can === 'comment' ? 'can only comment on' : "can't see";
    return `${who} ${verb} ${joined(denies.map((x) => nounOf(x.what, names)), 'or')}.`;
  }

  const nouns = denies.map((d) => nounOf(d.what, names));
  const whole = 'record' in allow.what;
  const parts = [who, verbOf(allow), whole && nouns.length ? `everything except ${joined(nouns)}` : whatOf(allow.what, names)];
  const w = allow.when;
  if (w?.hours) parts.push(hoursOf(w.hours));
  if (w?.once === true) parts.push('once, for a day');
  if (w?.from !== undefined && Date.parse(w.from) > opts.now) parts.push(`from ${dayOf(w.from, opts)}`);
  if (w?.until !== undefined) parts.push(`until ${dayOf(w.until, opts)}`);
  let out = `${parts.join(' ')}.`;
  if (!whole && nouns.length) out += ` No ${joined(nouns, 'or')}.`;
  return out;
}
