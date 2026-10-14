/**
 * What a project needs to send its own numbers: a report key bound to it, and the one line that uses the key.
 *
 * A REPORT KEY OPENS ONE THING. The record mints it bound to a list and to fixed fields (`createReportKey`), and it
 * reaches `report` and nothing else: it cannot read, and it cannot write a row anywhere but that list, for anything
 * but the row it was made for. So the page that makes one says exactly that, and the line it shows sends one number.
 *
 * THE LIST IS THE RECORD'S, NOT THIS FILE'S. A record that holds no list of readings with a name, a value and a time
 * has nothing a project can report into, and the panel is not drawn.
 */

/** The list a project's numbers go into, and the fields a report key needs it to have. */
export const READINGS = 'datapoints';
const NEEDS = ['name', 'value', 'at'] as const;

/** What a key for this row is bound to: the row itself, by the field that points at its list, and where it came from. */
export type Binding = { fixed: Record<string, string | null>; stamp: 'at' };

type Field = { id?: unknown; type?: unknown; to?: unknown; values?: unknown };

/**
 * Whether a list's fields can take reported numbers, which of its fields points at `register`, and every other field that
 * points at a row, which a key for this row fixes too.
 */
export function bindable(fields: readonly Field[], register: string): { field: string; source: boolean; links: string[] } | null {
  const ids = new Set(fields.map((f) => f.id));
  if (!NEEDS.every((n) => ids.has(n))) return null;
  const link = fields.find((f) => f.type === 'ref' && f.to === register);
  if (!link || typeof link.id !== 'string') return null;
  const source = fields.find((f) => f.id === 'source');
  const links = fields.flatMap((f) => (f.type === 'ref' && typeof f.id === 'string' && f.id !== link.id ? [f.id] : []));
  return { field: link.id, source: Array.isArray(source?.values) && source.values.includes('reported'), links };
}

/**
 * The fixed fields of a key for one row: the row, by its spoken id, the organisation that lists it when it is a
 * project one lists, and `reported` as its source when the list says where a number came from.
 *
 * EVERY OTHER LINK IS FIXED EMPTY. A key for Northwind fixed only `organisation`, so whoever held it could send
 * `thing: things#4`, a project of another organisation, and the number landed on that project's page. A key reports for
 * the row it was made for and points at nothing else.
 */
export function bindingOf(
  field: string,
  spoken: string,
  opts: { source: boolean; organisation?: string | null; links?: readonly string[] },
): Binding {
  return {
    fixed: {
      ...Object.fromEntries((opts.links ?? []).map((id) => [id, null])),
      [field]: spoken,
      ...(opts.organisation ? { organisation: opts.organisation } : {}),
      ...(opts.source ? { source: 'reported' } : {}),
    },
    stamp: 'at',
  };
}

/** Whether a listed key is one made for this row. */
export const keyFor = (fixed: Record<string, unknown> | undefined, field: string, spoken: string): boolean => fixed?.[field] === spoken;

/**
 * The line that sends one number, on one line, with the key when there is one to show and a placeholder when not.
 *
 * SINGLE QUOTES AROUND THE BODY, because a shell reads a double-quoted `$` and every body has quotes in it.
 */
export function curlLine(origin: string, key: string | null, placeholder: string): string {
  const body = JSON.stringify({ name: 'Sign-ups', value: 12 });
  return `curl -X POST ${origin}/api/report -H "Authorization: Bearer ${key ?? placeholder}" -H "Content-Type: application/json" -d '${body}'`;
}

/** The spoken id of the organisation whose `projects` names this project's row, or `null` when none or several do. */
export function organisationOf(rows: readonly { seq: number | null; fields: Record<string, unknown> }[], projectId: string): string | null {
  const naming = rows.filter((r) => r.seq !== null && Array.isArray(r.fields.projects) && r.fields.projects.includes(projectId));
  return naming.length === 1 ? `organisations#${naming[0]!.seq}` : null;
}

/**
 * WHETHER SETTING UP FOLDS AWAY TO ONE LINE. On a lived row the first screen is the row's own tiles, and the key, the
 * line and the poll form are a press away: a row that holds a live key, that any reading names, or that was made
 * before today is lived. Only a row made today that holds nothing opens on setup, since sending numbers is the next
 * thing to do there. A row whose made day is not known is taken as lived. Days are `YYYY-MM-DD` in the reader's zone.
 */
export function setupFolded(at: { keys: number; readings: number; madeDay: string | null; today: string }): boolean {
  if (at.keys > 0 || at.readings > 0) return true;
  return at.madeDay === null || at.madeDay < at.today;
}

/** The day an instant falls on in the reader's zone, as `YYYY-MM-DD`, or `null` when it is not a time. */
export function dayOf(when: string | number | Date | null | undefined): string | null {
  if (when === null || when === undefined || when === '') return null;
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What the fold's button says, shut and open. */
export const FOLD_WORDS = { show: 'Show how to send numbers', hide: 'Hide' } as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** `9 Oct`, with the year when it is not this one. */
function dated(d: Date, now: Date): string {
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** How long ago, by the reader's calendar: today, yesterday, 2 days ago, and a date after four weeks. */
function ago(d: Date, now: Date): string {
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return days < 28 ? `${days} days ago` : `on ${dated(d, now)}`;
}

const timeOf = (when: string | null | undefined): Date | null => {
  if (!when) return null;
  const d = new Date(when);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * THE ONE LINE SETUP FOLDS TO, in names and counts and never an id: a key that has sent says when it last did, else the
 * readings say how many arrived and when the last did, else a key not used yet says so, else nothing is sent here yet.
 */
export function foldedLine(
  at: { keys: number; lastUsed: string | null; readings: number; lastReading: string | null },
  now: Date | number = Date.now(),
): string {
  const today = new Date(now);
  const used = timeOf(at.lastUsed);
  const keys = at.keys === 1 ? '1 key' : `${at.keys} keys`;
  if (at.keys > 0 && used) return `Numbers arrive here with ${keys}, last used ${ago(used, today)}.`;
  if (at.readings > 0) {
    const last = timeOf(at.lastReading);
    if (at.readings === 1) return last ? `1 number arrived here, on ${dated(last, today)}.` : '1 number arrived here.';
    return last ? `${at.readings} numbers arrived here, the last on ${dated(last, today)}.` : `${at.readings} numbers arrived here.`;
  }
  if (at.keys === 1) return 'A key is ready here and has not been used yet.';
  if (at.keys > 1) return `${keys} are ready here and none has been used yet.`;
  return 'No numbers are sent here yet.';
}
