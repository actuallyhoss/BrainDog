/**
 * THE ROWS OF A PROPOSAL THAT ADDS SEVERAL, each with a tick, so a person can accept some of them.
 *
 * An agent that finds seven MCP servers files one question with seven rows, not seven questions. Accept takes the rows
 * still ticked, and the record declines the rest with the same decision (`decide` with `rows`). A rowset that changes
 * rows that exist is drawn by `changes.ts` and is taken whole, as is a proposal of one row.
 */

type Row = Record<string, unknown>;

export type Pickable = { n: number; title: string; detail: string };

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/* What a row is called, then the one line under it that tells two rows apart. */
const TITLES = ['name', 'title', 'what', 'label'];
const DETAILS = ['command', 'endpoint', 'url', 'email', 'origin'];

/** The rows to tick, or none when the proposal is not one that adds two or more rows. */
export function pickableOf(kind: string | undefined, body: Row | undefined): Pickable[] {
  if (kind !== 'rowset' || !body || !Array.isArray(body.rows)) return [];
  const rows = body.rows;
  if (rows.length < 2 || !rows.every((r) => isRow(r) && !('at' in r))) return [];
  return (rows as Row[]).map((r, n) => {
    const title = TITLES.map((k) => text(r[k])).find((t) => t !== '') ?? words.row(n);
    const detail = DETAILS.map((k) => text(r[k])).find((t) => t !== '') ?? '';
    return { n, title, detail };
  });
}

/**
 * What Accept sends: `undefined` when every row is ticked (the whole proposal), the ticked places when some are, and
 * `null` when none are, which is a decline and not an accept.
 */
export function rowsToSend(count: number, unticked: readonly number[]): number[] | undefined | null {
  const off = new Set(unticked);
  const on = Array.from({ length: count }, (_, n) => n).filter((n) => !off.has(n));
  if (on.length === count) return undefined;
  return on.length === 0 ? null : on;
}

export const words = {
  heading: 'What accepting adds',
  hint: 'Untick a row to leave it out. The rows left out are declined with this decision.',
  row: (n: number) => `Row ${String(n + 1)}`,
  keep: (title: string) => `Add ${title}`,
  some: (on: number, of: number) => `Accepting adds ${String(on)} of ${String(of)}.`,
  none: 'Every row is unticked. Tick one to accept, or decline the proposal.',
};
