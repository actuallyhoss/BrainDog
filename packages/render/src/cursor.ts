/**
 * THE ROW CURSOR'S CONTRACT, so a host can walk the rows of a page across its blocks with j and k.
 *
 * A page is several blocks, and a person reading it reads rows, not blocks: the next task, the next question, the next
 * thing that moved. Every row a `todo`, `timeline`, plain list, `feed` or `queue` draws carries `data-row` with its key,
 * in both renderers, so a host can find them in page order with one query and need not know which block holds which.
 * The Svelte drawers also take a `cursor` (the key of the row the host is on, drawn `data-focused` as a hovered row
 * is) and report `onrowfocus` when focus moves into a row by Tab or a click, so the host's cursor follows the reader.
 *
 * THE KEY IS THE ROW'S OWN WHERE IT HAS ONE. A row the host drew from the record carries `ref`, and its key is
 * `register#seq`, the same however the block is sorted or refreshed. A fence an author typed has no identity but its
 * place, so its key is its position in the block, which is a fact about one drawing and nothing more (`ticks.ts`).
 */

/** A row as the cursor reads it: its cells, and which row of the record it is where the host said. */
type Keyed = { cells: readonly string[]; ref?: { register: string; seq: number } | undefined };

/** A row's key: `register#seq` where the host said which row it is, and its position in the block otherwise. */
export const rowKey = (row: Keyed, at: number): string =>
  row.ref ? `${row.ref.register}#${row.ref.seq}` : String(at);

/**
 * EACH ROW'S KEY FOR A KEYED LIST, by place (the record growing, 9 Nov): `rowKey`, with a second row of one key told
 * apart by its count, so no two drawn rows ever share one. A list keyed by these draws a row the record added as a new
 * element and takes one it dropped out as that element, which is what lets a host move them in and out; drawn by place,
 * every row under a new one was the row above it changing its words.
 */
export const rowKeys = (rows: readonly Keyed[]): string[] => {
  const seen = new Map<string, number>();
  return rows.map((row, at) => {
    const key = rowKey(row, at);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n === 0 ? key : `${key}~${n}`;
  });
};

/** The most options a number key answers: 1 to 9, one key each. */
export const CHOICE_KEYS = 9;

/** The row of a block a key names, or undefined. */
export const rowAt = <R extends Keyed>(rows: readonly R[], key: string): R | undefined =>
  rows.find((r, i) => rowKey(r, i) === key);

/**
 * WHAT A NUMBER KEY ANSWERS: option `i` (0 is the first, which the key `1` presses) of the question under `key`, or of
 * the first question where the host names none. Null where there is no such question or option, or `i` is past 9.
 */
export function choiceOf<R extends Keyed, O>(
  rows: readonly R[],
  items: readonly { row: R; options: readonly O[] }[],
  i: number,
  key: string | null,
): { row: R; option: O } | null {
  if (!Number.isInteger(i) || i < 0 || i >= CHOICE_KEYS) return null;
  const item = key === null ? items[0] : items.find((it) => rowKey(it.row, rows.indexOf(it.row)) === key);
  const option = item?.options[i];
  return item && option !== undefined ? { row: item.row, option } : null;
}
