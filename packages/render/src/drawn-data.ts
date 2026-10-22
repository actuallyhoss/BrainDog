/**
 * What a drawn block is handed, kept apart from the rest of `drawn.ts` so the page that only reads a block's rows (every
 * page, Today's first) does not carry the rules, the bridge and the document, which only a drawn block's frame and
 * the sheet that makes one need.
 */

/** The most rows a drawn block is handed. */
export const DRAWN_ROWS_MOST = 200;


/** One value of a row, as the component reads it: the record's own JSON, never a host's object. */
export type DrawnValue = string | number | boolean | null | DrawnValue[] | { [key: string]: DrawnValue };

/** One row handed in: how it is opened (`tasks#3`), and its fields as the block's columns name them. */
export type DrawnRow = { ref: string; fields: Record<string, DrawnValue> };

/** What a component is handed as `braindog.data`. */
export type DrawnData = { list: string | null; columns: { field: string; label: string }[]; rows: DrawnRow[] };

export const isBag = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A value narrowed to JSON, so nothing but data crosses into the frame. */
function jsonOf(v: unknown, depth = 0): DrawnValue {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (depth > 4) return null;
  if (Array.isArray(v)) return v.map((x) => jsonOf(x, depth + 1));
  if (isBag(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonOf(x, depth + 1)]));
  return null;
}

/**
 * The data a component is handed, from the block as the record answered it: its list, its columns and its rows.
 *
 * ONLY THE FIELDS ITS COLUMNS NAME, even where a row arrived with more, so what a component sees is exactly what its
 * declaration says it reads. The rows were read through this reader's lens by the record; nothing here reads more.
 */
export function drawnData(answer: { register?: unknown; source?: unknown; columns?: unknown; rows?: unknown }, listName?: string): DrawnData {
  const register =
    typeof answer.register === 'string' ? answer.register : typeof answer.source === 'string' && answer.source.startsWith('register.') ? answer.source.slice(9) : null;
  const columns = (Array.isArray(answer.columns) ? answer.columns : [])
    .filter((c): c is { field: string; label?: unknown } => isBag(c) && typeof c.field === 'string')
    .map((c) => ({ field: c.field, label: typeof c.label === 'string' && c.label !== '' ? c.label : c.field }));
  const fields = columns.map((c) => c.field);
  const rows = (Array.isArray(answer.rows) ? answer.rows : []).slice(0, DRAWN_ROWS_MOST).flatMap((r): DrawnRow[] => {
    if (!isBag(r) || !isBag(r.fields) || register === null) return [];
    const seq = r.seq;
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) return [];
    const own = r.fields;
    return [{ ref: `${register}#${seq}`, fields: Object.fromEntries(fields.filter((f) => Object.hasOwn(own, f)).map((f) => [f, jsonOf(own[f])])) }];
  });
  return { list: listName ?? register, columns, rows };
}

