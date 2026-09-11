/**
 * What `diff` decides, and the line diff a host writes its rows with.
 *
 * The renderer imports nothing (the `graph` gate), so the diff is worked out here rather than taken
 * from a library. A row is `- ` for a line taken out, `+ ` for a line put in, and two spaces for a
 * line both versions share.
 */

export type DiffOp = 'same' | 'del' | 'add';

export type DiffLine = { op: DiffOp; text: string };

const OPS: Record<string, DiffOp> = { ' ': 'same', '-': 'del', '+': 'add' };
const PREFIX: Record<DiffOp, string> = { same: '  ', del: '- ', add: '+ ' };

/**
 * The mark each changed line wears, and its word. The word is the mark's accessible name, so a
 * removed line is told apart by a glyph and a word and never by its colour alone.
 */
export const DIFF_GLYPHS = { del: '−', add: '+' } as const;
export const DIFF_WORDS = { del: 'removed', add: 'added' } as const;

/**
 * One row read, or null when it starts with anything but a mark.
 *
 * The space after the mark is optional, so a unified diff's `-line` and ` line` read as the dialect's
 * `- line` and `  line` do. An empty row is an empty line both versions share.
 */
export function readDiffRow(row: string): DiffLine | null {
  if (row === '') return { op: 'same', text: '' };
  const op = OPS[row[0]!];
  return op ? { op, text: row.slice(row[1] === ' ' ? 2 : 1) } : null;
}

/** The first row that is not a diff row, or null. The parser degrades the block with it. */
export function diffFault(rows: readonly string[]): string | null {
  const bad = rows.find((r) => readDiffRow(r) === null);
  return bad === undefined ? null : bad.length > 40 ? `${bad.slice(0, 40)}…` : bad;
}

/** A closing line ending ends the last line rather than starting an empty one. */
function linesOf(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(/\r\n|\r|\n/u);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/**
 * Past this many cells the table would cost more than a skill's text is worth, so the changed middle
 * is drawn as taken out and put back whole: every line is still shown, only the pairing is coarser.
 */
const CAP = 250_000;

/** The longest run the two middles share, found by the textbook table, then walked from the top. */
function middle(x: readonly string[], y: readonly string[]): DiffLine[] {
  const del = (text: string): DiffLine => ({ op: 'del', text });
  const add = (text: string): DiffLine => ({ op: 'add', text });
  const n = x.length;
  const m = y.length;
  if (n === 0 || m === 0 || n * m > CAP) return [...x.map(del), ...y.map(add)];
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i * w + j] = x[i] === y[j] ? L[(i + 1) * w + j + 1]! + 1 : Math.max(L[(i + 1) * w + j]!, L[i * w + j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  /* A tie takes the line out first, so a changed line reads as the old one and then the new one. */
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ op: 'same', text: x[i]! });
      i++;
      j++;
    } else if (L[(i + 1) * w + j]! >= L[i * w + j + 1]!) out.push(del(x[i++]!));
    else out.push(add(y[j++]!));
  }
  while (i < n) out.push(del(x[i++]!));
  while (j < m) out.push(add(y[j++]!));
  return out;
}

/**
 * Two versions of a text, line by line. The shared head and tail are taken off before the table is
 * built, so a one-line change to a long skill costs a table of one line.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = linesOf(before);
  const b = linesOf(after);
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const same = (text: string): DiffLine => ({ op: 'same', text });
  return [...a.slice(0, s).map(same), ...middle(a.slice(s, ea), b.slice(s, eb)), ...a.slice(ea).map(same)];
}

/**
 * The rows of a `diff` fence for two versions. A line that is itself a fence cannot close the block,
 * because every row starts with its mark.
 */
export const diffRows = (before: string, after: string): string[] => lineDiff(before, after).map((l) => PREFIX[l.op] + l.text);

/* The renderer's own words, as `cards.ts` keeps its own. */
const lines = (n: number): string => `${n} ${n === 1 ? 'line' : 'lines'}`;

/** What changed, in words, above the lines, so the size of a change is read before the change. */
export function diffSummary(added: number, removed: number): string {
  if (added && removed) return `${lines(added)} added, ${removed} removed`;
  if (added) return `${lines(added)} added`;
  if (removed) return `${lines(removed)} removed`;
  return 'No change';
}

export const diffFolded = (n: number): string => `${lines(n)} unchanged`;

/** Lines kept beside a change, and the fewest a fold may hide: folding two lines saves nothing. */
const CONTEXT = 3;
const FOLD_AT = 4;

export type DiffPart = { fold: boolean; lines: DiffLine[] };

/**
 * The rows as both drawers draw them: a long run of shared lines folds, keeping three beside each
 * change, so a one-line change to a long skill reads on a phone without the rest of it.
 *
 * Lenient where `diffFault` is strict: a row that is not a diff row is drawn as a shared line.
 */
export function diffPlan(rows: readonly string[]): { added: number; removed: number; summary: string; parts: DiffPart[] } {
  const all = rows.map((r) => readDiffRow(r) ?? { op: 'same' as const, text: r });
  const added = all.filter((l) => l.op === 'add').length;
  const removed = all.filter((l) => l.op === 'del').length;
  const parts: DiffPart[] = [];
  const show = (ls: DiffLine[]) => {
    if (ls.length === 0) return;
    const last = parts.at(-1);
    if (last && !last.fold) last.lines.push(...ls);
    else parts.push({ fold: false, lines: [...ls] });
  };
  for (let i = 0; i < all.length; ) {
    if (all[i]!.op !== 'same') {
      show([all[i++]!]);
      continue;
    }
    let j = i;
    while (j < all.length && all[j]!.op === 'same') j++;
    const run = all.slice(i, j);
    const lead = i > 0 ? CONTEXT : 0;
    const trail = j < all.length ? CONTEXT : 0;
    if (run.length - lead - trail >= FOLD_AT) {
      show(run.slice(0, lead));
      parts.push({ fold: true, lines: run.slice(lead, run.length - trail) });
      show(run.slice(run.length - trail));
    } else show(run);
    i = j;
  }
  return { added, removed, summary: diffSummary(added, removed), parts };
}
