/**
 * TODAY SPEAKS FIRST: a greeting by the time of day and his name, then two or three plain
 * sentences that name what is late and what needs him, written by rules from what the page holds. Never a count alone
 * ("3 need you."): the late salary, the late instalment and the late bills by name, each name opening its own row, and
 * each with its button on the Late tile under it (`LateNow.svelte`).
 *
 * FROM THE ROWS THE DESK ALREADY READ, NOTHING ELSE. The late lines are the ones `homeDrawn` made Today's late list of
 * (`home-rows.ts` `lateLines`, every list's deadlines before today and the late tasks), so the sentence and the tile under
 * it cannot disagree; what waits and who works are `boot`'s, as the badge says them.
 *
 * WORDS A PERSON SAYS: counts in digits, "by 13 days", names as the record wrote them, no id, no dash. The one red
 * phrase is the first thing that needs him: what is late, else the questions waiting.
 *
 * PURE, AND NODE LOADS IT, so `today-brief.test.ts` reads every sentence without mounting Home.
 */

import type { LiveBlock } from '../record/page-live.ts';
import type { HomeLine, WithRows } from './home-rows.ts';

/** One piece of the brief as the head draws it: words, a figure at 600, the red phrase, or a door to a row or a place. */
export type BriefPart = { text: string; fig?: true; needs?: true; href?: string };

/** The brief: its pieces in order, and the same words as one string (the room it holds while it is on its way). */
export type Brief = { parts: BriefPart[]; text: string };

/** Today's late list as the desk shows it: every line, how many more stand past them, and the list's own heading. */
export type LateFound = { lines: HomeLine[]; more: number; heading: string; at: number[] };

/** How many late things a sentence names before it says how many more. */
export const NAMED_MOST = 3;

const digits = (n: number): string => n.toLocaleString('en-GB');
const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "13 days late" as the figure a sentence says after "by": "13 days". `null` for a line due today and not late yet. */
export const lateFigure = (when: string | undefined): string | null => /^(.+?)\s+late$/u.exec(when ?? '')?.[1] ?? null;

/** "Good morning" to noon, "Good afternoon" to six, and "Good evening" after it, by the reader's own clock. */
export function greetingOf(now: number, name: string | null | undefined): string {
  const hour = new Date(now).getHours();
  const part = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = (name ?? '').trim().split(/\s+/u)[0] ?? '';
  return first === '' ? part : `${part}, ${first}`;
}

/**
 * TODAY'S LATE LIST, read off the page as Home shaped it: each drawn block `homeDrawn` made a late list of, its lines in
 * order and how many more each half held past its limit. `null` where nothing is late or due today.
 */
export function lateOf(blocks: readonly LiveBlock[]): LateFound | null {
  const lines: HomeLine[] = [];
  const at: number[] = [];
  let more = 0;
  let heading = '';
  blocks.forEach((b, n) => {
    const rows = (b as WithRows).homeRows;
    if (!b.drawn || rows?.kind !== 'late') return;
    lines.push(...rows.lines);
    more += (rows.more?.tasks ?? 0) + (rows.more?.money ?? 0);
    if (heading === '' && typeof b.heading === 'string') heading = b.heading;
    at.push(n);
  });
  return lines.length === 0 ? null : { lines, more, heading, at };
}

/**
 * THE LINES THE LATE TILE SHOWS: every late line but one a question in Needs you already asks about, by the row it names
 * or by its title opening the question ("Invoice 2026-041 was due 38 days ago"), so a late invoice is answered in one
 * place and never shown twice.
 */
export function unasked(lines: readonly HomeLine[], questions: readonly { about?: string | undefined; question?: string | undefined }[]): HomeLine[] {
  if (questions.length === 0) return [...lines];
  const abouts = new Set(questions.map((q) => q.about).filter((a): a is string => typeof a === 'string' && a !== ''));
  const asked = questions.map((q) => (typeof q.question === 'string' ? q.question : ''));
  /* AND A QUESTION THAT NAMES THE ROW'S WHOLE TITLE INSIDE IT: "Mark Wave 0: nav, … done?" asks about the late
     task "Wave 0: nav, …", so it is shown once, in Needs you. Only a title long enough to be a name and not a word. */
  const names = (q: string, title: string): boolean => {
    if (title.length < TITLE_NAMED) return false;
    const at = q.indexOf(title);
    return at >= 0 && !/[\p{L}\p{N}]/u.test(q.charAt(at + title.length)) && (at === 0 || !/[\p{L}\p{N}]/u.test(q.charAt(at - 1)));
  };
  return lines.filter((l) => !abouts.has(l.key) && !(l.title !== '' && asked.some((q) => q.startsWith(`${l.title} `) || q.startsWith(`${l.title}:`) || names(q, l.title))));
}

/** The fewest characters a title has before a question that holds it is read as asking about it. */
const TITLE_NAMED = 12;

/**
 * THE LATE TILE'S NAME, SAID OF WHAT IT HOLDS (live check of 30 October, 5): "Late" where a line is past its day or more
 * past the limit are, "due today" where one is due today, "urgent" and "handed back" where those stand in it, joined as a
 * person lists them ("Late, due today and handed back"). Its count is every one of them, so the name says every kind.
 */
export function bandHeading(lines: readonly HomeLine[], moreLate: number, said: { late: string; today: string; urgent: string; back: string }): string {
  const parts = [
    lines.some((l) => !l.mark && l.late) || moreLate > 0 ? said.late : '',
    lines.some((l) => !l.mark && !l.late) ? said.today : '',
    lines.some((l) => l.mark === 'urgent') ? said.urgent : '',
    lines.some((l) => l.mark === 'back') ? said.back : '',
  ].filter((p) => p !== '');
  if (parts.length === 0) return said.late;
  const joined = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** The headings Today's urgent work and the work handed back are declared under (`default-home.ts`), by their mark. */
export type BandHeadings = { urgent: string; back: string };

/**
 * URGENT WORK AND WORK HANDED BACK, AS LINES OF THE LATE BAND: they sat under seventeen project cards, 2,600px
 * down a laptop and 6,600px down a phone. Each drawn `todo` block declared under one of the two headings gives its rows
 * as lines, each with its tick and how it got here in words; a row already in the late list is not said twice. `at` is
 * where each such block stands, so the page marks it not drawn.
 */
export function bandOf(blocks: readonly LiveBlock[], headings: BandHeadings, said: { urgent: string; back: string }, already: ReadonlySet<string>): { lines: HomeLine[]; at: number[] } {
  const lines: HomeLine[] = [];
  const at: number[] = [];
  const seen = new Set(already);
  blocks.forEach((b, n) => {
    if (!b.drawn || b.kind !== 'todo') return;
    const mark = b.heading === headings.urgent ? 'urgent' : b.heading === headings.back ? 'back' : null;
    if (mark === null) return;
    at.push(n);
    b.rows.forEach((row, i) => {
      const r = row as { key?: unknown; href?: unknown; cells?: unknown[] };
      const entry = b.entries[i];
      const key = typeof r.key === 'string' && r.key !== '' ? r.key : entry && typeof entry.seq === 'number' && typeof b.source === 'string' && b.source.startsWith('register.') ? `${b.source.slice('register.'.length)}#${entry.seq}` : null;
      if (key === null || seen.has(key)) return;
      seen.add(key);
      const what = (entry?.fields as Record<string, unknown> | undefined)?.what;
      const title = typeof what === 'string' && what.trim() !== '' ? what.trim() : String(r.cells?.[0] ?? '').trim();
      lines.push({
        key,
        title,
        when: mark === 'urgent' ? said.urgent : said.back,
        ...(typeof r.href === 'string' && r.href !== '' ? { href: r.href } : {}),
        late: false,
        mark,
        ...(typeof entry?.seq === 'number' ? { tick: entry.seq } : {}),
      });
    });
  });
  return { lines, at };
}

/** Whether two late lines are one thing kept in two lists: one name, one day, and one amount where both carry one. */
function oneThing(a: HomeLine, b: HomeLine): boolean {
  if (a.title.trim().toLowerCase() !== b.title.trim().toLowerCase()) return false;
  if ((a.day ?? a.when ?? '') !== (b.day ?? b.when ?? '') || a.late !== b.late) return false;
  if ((a.amount === undefined) !== (b.amount === undefined)) return false;
  return !a.money || !b.money || (a.money.currency === b.money.currency && Math.abs(a.money.minor) === Math.abs(b.money.minor));
}

/**
 * ONE THING, ONE LINE: rows that are one payment kept in two lists (on his record the Lanternfish salary stood twice, the
 * same name, amount and day) are said once, by the row `keep` prefers (the one a press can finish), so the brief never
 * names a thing twice and the Late tile never shows two lines nobody can tell apart. Rows told apart by any of name,
 * day or amount stay apart, and the order is the first of each.
 */
export function onceEach(lines: readonly HomeLine[], keep: (line: HomeLine) => boolean = () => false): HomeLine[] {
  const out: HomeLine[] = [];
  for (const line of lines) {
    const at = out.findIndex((seen) => oneThing(seen, line));
    if (at === -1) out.push(line);
    else if (!keep(out[at]!) && keep(line)) out[at] = line;
  }
  return out;
}

/**
 * THE LATE TILE IN THE BRIEF'S ORDER: late money first, then what else is late, then what is due today, each in the
 * page's order, so the first thing the brief names is the tile's first line and not a task the page listed before it.
 */
export function inBriefOrder(lines: readonly HomeLine[]): HomeLine[] {
  const money = lines.filter((l) => l.late && l.amount !== undefined);
  const others = lines.filter((l) => l.late && l.amount === undefined);
  const today = lines.filter((l) => !l.late);
  return [...money, ...others, ...today];
}

/** A thing named in a sentence: its title, opening its row where it has one. */
const named = (line: HomeLine): BriefPart => (line.href ? { text: line.title, href: line.href } : { text: line.title });

/** "A by 13 days, B by 14 days and C by 9 days", and "and 2 more" past the ones named. */
function listed(lines: readonly HomeLine[], rest: number): BriefPart[] {
  const shown = lines.slice(0, NAMED_MOST);
  const left = rest + Math.max(0, lines.length - shown.length);
  const out: BriefPart[] = [];
  shown.forEach((line, i) => {
    if (i > 0) out.push({ text: i === shown.length - 1 && left === 0 ? ' and ' : ', ' });
    out.push(named(line));
    const by = lateFigure(line.when);
    if (by !== null) out.push({ text: ' by ' }, { text: by, fig: true });
  });
  if (left > 0) out.push({ text: ` and ${digits(left)} more` });
  return out;
}

/** What `briefOf` is written from. */
export type BriefFrom = {
  /** Today's late list, tasks and money, in the order the page holds it. */
  lines: readonly HomeLine[];
  /** Late things past what the lines hold. */
  more?: number;
  /** The questions waiting on the reader, as the badge counts them. */
  needYou: number;
  /** What waits in the inbox, said when no question does. */
  inbox?: number;
  /** The agents working now, by name, each once. */
  agents: readonly string[];
  /** The calm sentence, said when nothing is late and nothing waits. */
  calm: string;
};

/** "Claude", "Claude and Codex", "3 agents", with the verb that agrees. */
function workingSaid(agents: readonly string[]): string | null {
  if (agents.length === 0) return null;
  if (agents.length === 1) return `${agents[0]!} is working`;
  if (agents.length === 2) return `${agents[0]!} and ${agents[1]!} are working`;
  return `${digits(agents.length)} agents are working`;
}

/**
 * THE BRIEF, two or three sentences:
 *
 * 1. What money is late, by name and by how much time: "3 payments are late: Lanternfish salary by 13 days, Copperleaf
 *    contractor fee by 14 days and Harbourview instalment by 9 days." One alone: "Lanternfish salary is 13 days late."
 * 2. What else is late: "Send Jennifer the refund email is 7 days late." or "2 other things are late, the oldest X by
 *    3 weeks.", and what is due today where room is left.
 * 3. Who is working and what waits: "Claude is working, and 3 questions wait for you."
 *
 * With nothing late and nothing waiting it is the calm sentence, then who is working.
 */
export function briefOf({ lines, more = 0, needYou, inbox = 0, agents, calm }: BriefFrom): Brief {
  const sentences: BriefPart[][] = [];
  const money = lines.filter((l) => l.late && l.amount !== undefined);
  const others = lines.filter((l) => l.late && l.amount === undefined);
  const today = lines.filter((l) => !l.late);
  /* WHAT STANDS PAST THE LIST IS COUNTED WITH THE KIND THAT LEADS: money where any is late, else the rest. */
  const moneyMore = money.length > 0 ? more : 0;
  const othersMore = money.length > 0 ? 0 : more;
  let red = false;

  const moneyCount = money.length + moneyMore;
  if (moneyCount === 1) {
    const by = lateFigure(money[0]!.when);
    sentences.push([named(money[0]!), { text: ' ' }, { text: by ? `is ${by} late` : 'is late', needs: true }, { text: '.' }]);
    red = true;
  } else if (moneyCount > 1) {
    sentences.push([{ text: `${digits(moneyCount)} payments are late`, needs: true }, { text: ': ' }, ...listed(money, moneyMore), { text: '.' }]);
    red = true;
  }

  const othersCount = others.length + othersMore;
  if (othersCount === 1) {
    const by = lateFigure(others[0]!.when);
    const late: BriefPart = by ? { text: `is ${by} late` } : { text: 'is late' };
    sentences.push([named(others[0]!), { text: ' ' }, red ? late : { ...late, needs: true }, { text: '.' }]);
    red = true;
  } else if (othersCount > 1) {
    if (red) {
      const oldest = others[0]!;
      const by = lateFigure(oldest.when);
      sentences.push([{ text: `${digits(othersCount)} other things are late, the oldest ` }, named(oldest), ...(by ? [{ text: ' by ' }, { text: by, fig: true as const }] : []), { text: '.' }]);
    } else {
      sentences.push([{ text: `${digits(othersCount)} things are late`, needs: true }, { text: ': ' }, ...listed(others, othersMore), { text: '.' }]);
      red = true;
    }
  }

  /* WHAT IS DUE TODAY, only while there is room for it: the brief is two or three sentences, never a list. */
  if (today.length > 0 && sentences.length < 2) {
    sentences.push(today.length === 1 ? [named(today[0]!), { text: ' is due today.' }] : [{ text: `${digits(today.length)} things are due today.` }]);
  }

  const working = workingSaid(agents);
  if (needYou > 0) {
    const door: BriefPart = { text: needYou === 1 ? '1 question' : `${digits(needYou)} questions`, href: '/decide', ...(red ? {} : { needs: true as const }) };
    const verb = needYou === 1 ? ' waits for you.' : ' wait for you.';
    sentences.push(working ? [{ text: `${upper(working)}, and ` }, door, { text: verb }] : [door, { text: verb }]);
  } else if (inbox > 0) {
    const waiting = `${digits(inbox)} ${inbox === 1 ? 'thing waits' : 'things wait'} in your inbox`;
    sentences.push([{ text: working ? `${upper(working)}, and ${waiting}.` : `${upper(waiting)}.` }]);
  } else {
    if (sentences.length === 0) sentences.push([{ text: calm }]);
    if (working) sentences.push([{ text: `${upper(working)}.` }]);
  }

  const parts: BriefPart[] = [];
  sentences.forEach((s, i) => {
    if (i > 0) parts.push({ text: ' ' });
    parts.push(...s);
  });
  return { parts, text: parts.map((p) => p.text).join('') };
}
