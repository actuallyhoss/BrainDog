/**
 * Which new things earn a Mac notification: a question that lands in Needs you, or an agent handing a run off.
 * Pure on purpose; the layout feeds it what `boot` said and the shell door does the ringing.
 */

export type Alert = { id: string; title: string; body: string; goto: string };

/** THE BELL HOLDS WHAT HAPPENED, NEVER WHAT WAS ASKED (frame A): a question is said once, in Needs you. */
export const happened = <N extends { asked?: true | undefined }>(news: readonly N[]): N[] => news.filter((n) => n.asked !== true);

/**
 * A NAME IN CAPITALS AS A PERSON WRITES IT: "LEDGER POST" is "Ledger Post", as `readable` in the renderer says it (only a
 * run with no small letter and more than three letters; a word of three or fewer stays, an initialism more often than
 * not). Written here so the bell, which is in the shell's first chunk, does not bring the renderer with it.
 */
const unshout = (t: string): string =>
  (t.match(/\p{L}/gu) ?? []).length <= 3 || /\p{Ll}/u.test(t) ? t : t.replace(/\p{L}[\p{L}'’]*/gu, (w) => (w.replace(/['’]/gu, '').length <= 3 ? w : w.charAt(0) + w.slice(1).toLowerCase()));

/**
 * ONE LINE OF THE BELL: the name before its colon out of capitals, and the name said once ("Halden licence: Halden
 * licence is due" is "Halden licence is due").
 */
export function bellSaid(text: string, year: number = new Date().getFullYear()): string {
  const i = text.indexOf(': ');
  const head = i <= 0 ? '' : unshout(text.slice(0, i));
  const rest = i <= 0 ? unshout(text) : text.slice(i + 2);
  const line = head === '' || rest.toLowerCase().startsWith(head.toLowerCase()) ? rest : `${head}: ${rest}`;
  return plain(line, year).replace(/\.$/u, '');
}

const SIGNS: Readonly<Record<string, string>> = { GBP: '£', USD: '$', EUR: '€' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * A RECORD'S WAY OF WRITING MONEY AND DAYS, AS A PERSON READS THEM: "GBP 2,400.00" is "£2,400" and "2026-09-10" is
 * "10 Sep" (with its year when it is not this one). A currency with no sign of its own keeps its code.
 */
function plain(line: string, year: number): string {
  return line
    .replace(/\b([A-Z]{3}) (-?[\d,]+)(?:\.(\d{2}))?\b/gu, (_, code: string, whole: string, cents?: string) => {
      const sign = SIGNS[code];
      const n = cents === undefined || cents === '00' ? whole : `${whole}.${cents}`;
      return sign === undefined ? `${code} ${n}` : `${sign}${n}`;
    })
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/gu, (all, y: string, m: string, d: string) => {
      const month = MONTHS[Number(m) - 1];
      if (month === undefined) return all;
      return `${Number(d)} ${month}${Number(y) === year ? '' : ` ${y}`}`;
    });
}

type Tone = 'good' | 'warn' | 'bad' | 'info';

/** One line of the bell: what happened, where it goes, how many times, when it last did (`at`) and how it went. */
export type BellLine = { text: string; href: string; n: number; at: string; tone?: Tone | undefined; you?: 'assigned' | 'mentioned' | undefined };

/** WHAT HAPPENED, EACH LINE ONCE: the same line twice is one, with how many times it happened, at its newest time. */
export function bellLines<N extends { text: string; href: string; asked?: true | undefined; at?: string; tone?: Tone | undefined; you?: 'assigned' | 'mentioned' | undefined }>(news: readonly N[]): BellLine[] {
  const out: BellLine[] = [];
  for (const item of happened(news)) {
    const text = bellSaid(item.text);
    const at = item.at ?? '';
    const same = out.find((o) => o.text === text);
    /* ONE ROW, ONE LINE A DAY (audit of 30 October, 7): an instalment falling due was said as its row's change and again
       as the rule's "is due today", two lines about one thing. The newest, which comes first, stands for both. */
    if (!same && /^\/r\/[^/]+\/\d+$/u.test(item.href) && out.some((o) => o.href === item.href && o.at.slice(0, 10) === at.slice(0, 10))) continue;
    if (same) {
      same.n += 1;
      if (Date.parse(at) > Date.parse(same.at)) same.at = at;
    } else out.push({ text, href: item.href, n: 1, at, ...(item.tone ? { tone: item.tone } : {}), ...(item.you ? { you: item.you } : {}) });
  }
  return out;
}

/** Whether a line is newer than what was last marked read (`readTo`, a time; empty is nothing marked). */
export const unreadBy =
  (readTo: string) =>
  (l: { at: string }): boolean =>
    readTo === '' || !(Date.parse(l.at) <= Date.parse(readTo));

/** THE DAY A LINE FALLS IN, by the reader's own clock: Today, Yesterday, or Earlier. */
export type Day = 'today' | 'yesterday' | 'earlier';

export function dayOf(at: string, now: Date = new Date()): Day {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return 'earlier';
  if (t >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) return 'today';
  return t >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime() ? 'yesterday' : 'earlier';
}

/** The lines in their days, newest first, each day said once and an empty day not at all. */
export function bellDays<L extends { at: string }>(lines: readonly L[], now: Date = new Date()): { day: Day; lines: L[] }[] {
  const sorted = [...lines].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  const out: { day: Day; lines: L[] }[] = [];
  for (const l of sorted) {
    const day = dayOf(l.at, now);
    const last = out[out.length - 1];
    if (last?.day === day) last.lines.push(l);
    else out.push({ day, lines: [l] });
  }
  return out;
}

/**
 * HOW LONG AGO, SHORT, FOR THE END OF A ROW: "now", "5m", "3h", "2d", and a date past a week ("12 Oct"). Written here and
 * not taken from the renderer's `since`, so the bell, in the shell's first chunk, does not bring the renderer with it.
 */
export function agoOf(at: string, now: number = Date.now()): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  const ms = Math.max(0, now - t);
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d`;
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`}`;
}

/** The glyph a line wears, by what it is about: a question, an agent's run, an alarm, or the list its link opens. */
export type BellKind = 'decide' | 'session' | 'alert' | 'activity';

/**
 * A LINE INTO A LIST WEARS THAT LIST'S OWN GLYPH, as its declaration gives it (`icon`) and the rail draws it, so the bell
 * names no list: `glyph` answers a list's declared glyph, or nothing for a list this tab has no declaration for, which
 * wears the log's. A question, an agent's run and an alarm are where the link goes, not a list.
 */
export function kindOf<G extends string = never>(href: string, tone?: Tone, glyph: (list: string) => G | undefined = () => undefined): BellKind | G {
  if (tone === 'bad') return 'alert';
  if (href.startsWith('/decide')) return 'decide';
  if (href.startsWith('/p/agents') || href.startsWith('/jobs')) return 'session';
  const list = /^\/r\/([^/?#]+)/u.exec(href)?.[1] ?? '';
  return (list !== '' ? glyph(decodeURIComponent(list)) : undefined) ?? 'activity';
}

/** The first hearing only seeds what is already there, so opening the app never rings for old questions. */
export function sift(seen: ReadonlySet<string> | null, items: readonly Alert[]): { seen: Set<string>; fresh: Alert[] } {
  const next = new Set(seen ?? []);
  const fresh: Alert[] = [];
  for (const a of items) {
    if (next.has(a.id)) continue;
    next.add(a.id);
    if (seen !== null) fresh.push(a);
  }
  return { seen: next, fresh };
}

/** A waiting question as boot lists it (`waiting`), sent to Needs you. */
export const questionAlert = (w: { id: string; question?: string | undefined }): Alert => ({
  id: `q:${w.id}`,
  title: 'Needs you',
  body: w.question || 'A question is waiting',
  goto: '/decide',
});

/**
 * A handoff line from the record's recent events, sent to Agents. The record writes no event kind of its own for it:
 * a run that hands off is a `state` event whose new value is `handoff` (`packages/kernel/src/handoff.ts`). Anything
 * else is not one.
 */
export function handoffAlert(e: { id: string; kind: string; to?: unknown; actor?: string; title?: string | null; note?: string | null }): Alert | null {
  if (e.kind !== 'state' || e.to !== 'handoff') return null;
  return {
    id: `h:${e.id}`,
    title: 'Handed off',
    body: e.note || e.title || `${e.actor ?? 'An agent'} handed off a run`,
    goto: '/p/agents',
  };
}

/**
 * An instruction he gave that reached Done or Needs you, as the record's `instructions` list has it. Any other state is
 * not one. The id carries the state, so each state rings once and a return to a state already heard rings nothing.
 * The words are fixed: what he told the agent and what it answered stay on the screen and out of a notification.
 */
export function instructionAlert(i: { id: string; state: string }): Alert | null {
  if (i.state !== 'done' && i.state !== 'needs_you') return null;
  return {
    id: `i:${i.id}:${i.state}`,
    title: i.state === 'done' ? 'Done' : 'Needs you',
    body: i.state === 'done' ? 'An agent finished what you told it' : 'An agent needs you on something you told it',
    goto: i.state === 'done' ? '/p/agents' : '/decide',
  };
}

export type Ring ={ on: () => boolean; focused: () => boolean; send: (title: string, body: string, goto: string) => void };

/** Ring once per new item, and not at all while the window is in front or the switch is off. Returns the seen set to keep. */
export function ring(seen: ReadonlySet<string> | null, items: readonly Alert[], door: Ring): Set<string> {
  const out = sift(seen, items);
  if (door.on() && !door.focused()) for (const a of out.fresh) door.send(a.title, a.body, a.goto);
  return out.seen;
}
