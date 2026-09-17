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
