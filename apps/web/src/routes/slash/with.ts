/**
 * The rows a link to Slash attaches, and the words a mention and a starter are drawn with.
 *
 * THE CONTRACT OTHER PAGES LINK TO: `/slash?with=<ref>[,<ref>...]`, a ref being a row's spoken id (`people#20`) or a
 * question, a run or a vital sign by its id (`decide:<id>`, `run:<id>`, `sign:<id>`), the forms the chat door takes
 * (`packages/host/src/slash-ask.ts` `ROW_REF`). Build it with `askAboutHref` (`$lib/query/slash.ts`), which encodes the
 * `#`. A link written by hand as `?with=people#20` still works: the browser reads `#20` as the fragment, and it is put
 * back on the last ref here. `people/20` and `people:20` are read as `people#20` too.
 *
 * PURE, so it can be held by `node --test` without a page.
 */

/** The forms the chat door takes, and no more than it takes on one message. */
export const REF = /^(?:[a-z][a-z0-9_]*#[1-9][0-9]*|(?:decide|run|sign):[A-Za-z0-9_.:-]{1,80})$/u;
export const ATTACH_MOST = 8;

const ROWISH = /^([a-z][a-z0-9_]*)[/:]([1-9][0-9]*)$/u;

/** One ref as the door takes it, or `null` when it is not one. */
export function refOf(raw: string): string | null {
  const t = raw.trim();
  if (REF.test(t)) return t;
  const m = ROWISH.exec(t);
  if (m && m[1] !== 'decide' && m[1] !== 'run' && m[1] !== 'sign') return `${m[1]}#${m[2]}`;
  return null;
}

/** The refs an address attaches, in the order given, each once, at most `ATTACH_MOST`. */
export function withOf(url: URL): string[] {
  const said = url.searchParams
    .getAll('with')
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const hash = /^#([1-9][0-9]*)$/u.exec(url.hash);
  const last = said.at(-1);
  if (hash && last !== undefined && /^[a-z][a-z0-9_]*$/u.test(last)) said[said.length - 1] = `${last}#${hash[1]}`;
  return [...new Set(said.flatMap((s) => refOf(s) ?? []))].slice(0, ATTACH_MOST);
}

/** A row's list and number, from its ref, or `null` for a question, a run or a sign. */
export function rowOfRef(ref: string): { register: string; seq: number } | null {
  const m = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u.exec(ref);
  return m ? { register: m[1]!, seq: Number(m[2]) } : null;
}

/** The field a row is called by, the first of these it holds as words. */
const NAMES = ['name', 'title', 'what', 'subject', 'label', 'summary', 'question', 'text', 'note'] as const;

/** A row's name, from its fields, or `null` when none of them is words. */
export function nameOfFields(fields: Readonly<Record<string, unknown>> | null | undefined): string | null {
  if (!fields) return null;
  for (const k of NAMES) {
    const v = fields[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim().replace(/\s+/gu, ' ');
  }
  return null;
}

/** The glyph of what a ref is, from its list's own icon, else the kind's. */
export function iconOfRef(ref: string, icons: ReadonlyMap<string, string>): string {
  if (ref.startsWith('decide:')) return 'decide';
  if (ref.startsWith('run:')) return 'session';
  if (ref.startsWith('sign:')) return 'observe';
  const row = rowOfRef(ref);
  return (row && icons.get(row.register)) || 'rows';
}

/** A day bucket for the conversations list: today, yesterday, this week, or earlier. */
export function dayOf(at: number, now: number): 'today' | 'yesterday' | 'week' | 'earlier' {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  if (at >= start.getTime()) return 'today';
  if (at >= start.getTime() - day) return 'yesterday';
  if (at >= start.getTime() - 6 * day) return 'week';
  return 'earlier';
}

/** A short time for a row: "4m", "3h", a weekday this week, else the day and month. */
export function shortWhen(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  const bucket = dayOf(at, now);
  if (bucket === 'today') return `${h}h`;
  if (bucket === 'yesterday') return 'Yesterday';
  const d = new Date(at);
  if (bucket === 'week') return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * What an action Slash took or asks to take is, read from its title: the verb, the fields it changes and the row by
 * name. The record's titles are "Change due on “X”", "Add “X” to Tasks", "Changed “X”", "Added “X” to Tasks" and
 * "Draft “X”"; anything else is drawn as its title.
 */
export type ActionSaid = { verb: string; fields: string[]; name: string | null; list: string | null };

export function actionSaid(title: string): ActionSaid {
  let m = /^Change (.+?) on “(.+)”$/u.exec(title);
  if (m) return { verb: 'Change', fields: m[1]!.split(/,\s*/u), name: m[2]!, list: null };
  m = /^(Add|Added) “(.+)” to (.+?)\.?$/u.exec(title);
  if (m) return { verb: m[1]!, fields: [], name: m[2]!, list: m[3]! };
  m = /^(Add|Added) a row to (.+?)\.?$/u.exec(title);
  if (m) return { verb: m[1]!, fields: [], name: null, list: m[2]! };
  m = /^(Changed|Drafted|Draft) “(.+?)”/u.exec(title);
  if (m) return { verb: m[1]!, fields: [], name: m[2]!, list: null };
  return { verb: '', fields: [], name: null, list: null };
}
