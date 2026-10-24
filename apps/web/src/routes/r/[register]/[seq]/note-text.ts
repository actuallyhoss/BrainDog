/**
 * A LONG NOTE AS A NOTE (the audit of 25 October, Y13). A person's memo is often written in markdown by whoever imported
 * it, and the row page printed it as one block, `**`, `##` and table pipes and all, 2,600 px on a phone. Here it is read
 * into parts the page draws (`NoteText.svelte`): headings, paragraphs that keep their line breaks, flat lists, tables
 * and rules, with bold and code inside. Nothing is ever turned into HTML: every part is drawn as text.
 *
 * Out of the component so `node --test` can run it, as `timeline.ts` is.
 */

/** A run of words: plain, bold, or code. */
export type Span = { t: 'text' | 'b' | 'code'; text: string };

/** One part of a note, as the page draws it. A paragraph keeps its lines, since a memo's line breaks are its own. */
export type Part =
  | { t: 'h'; level: number; spans: Span[] }
  | { t: 'p'; lines: Span[][] }
  | { t: 'ul'; items: Span[][] }
  | { t: 'table'; head: Span[][]; rows: Span[][][] }
  | { t: 'hr' };

/** The words the note draws. */
export const noteWords = {
  more: 'Show all',
  less: 'Show less',
} as const;

/** The lines a note shows before it folds. */
export const FOLD_LINES = 8;

/** About the characters a line of the note holds at 390, for a guess at how many lines it wraps to. */
const LINE_CHARS = 44;

/** Bold (`**x**`) and code (`` `x` ``) as spans; a mark that does not close is the text it is. */
export function spansOf(text: string): Span[] {
  const out: Span[] = [];
  const push = (t: Span['t'], s: string): void => {
    if (s === '') return;
    const last = out.at(-1);
    if (t === 'text' && last?.t === 'text') last.text += s;
    else out.push({ t, text: s });
  };
  const re = /\*\*(?=\S)(.+?)(?<=\S)\*\*|`([^`]+)`/gu;
  let at = 0;
  for (const m of text.matchAll(re)) {
    push('text', text.slice(at, m.index));
    if (m[1] !== undefined) push('b', m[1]);
    else push('code', m[2]!);
    at = m.index + m[0].length;
  }
  push('text', text.slice(at));
  return out;
}

/** A table's line: it opens and closes on a pipe. */
const isRow = (line: string): boolean => /^\|.*\|$/u.test(line);
/** The line under a table's head: `|---|:--:|`. */
const isRule = (line: string): boolean => /^\|(?:\s*:?-{2,}:?\s*\|)+$/u.test(line);
const cellsOf = (line: string): Span[][] =>
  line
    .slice(1, -1)
    .split('|')
    .map((c) => spansOf(c.trim()));

/** The note read into its parts. A blank line ends a paragraph, a list or a table. */
export function partsOf(text: string): Part[] {
  const out: Part[] = [];
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  let para: Span[][] = [];
  let items: Span[][] = [];
  let table: string[] = [];
  const flush = (): void => {
    if (para.length > 0) out.push({ t: 'p', lines: para });
    if (items.length > 0) out.push({ t: 'ul', items });
    if (table.length > 0) {
      const ruled = table.length > 1 && isRule(table[1]!);
      const rows = table.filter((l) => !isRule(l)).map(cellsOf);
      out.push(ruled ? { t: 'table', head: rows[0]!, rows: rows.slice(1) } : { t: 'table', head: [], rows });
    }
    para = [];
    items = [];
    table = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    if (isRow(line)) {
      if (table.length === 0) flush();
      table.push(line);
      continue;
    }
    if (table.length > 0) flush();
    const h = /^(#{1,4})\s+(.*)$/u.exec(line);
    if (h) {
      flush();
      out.push({ t: 'h', level: h[1]!.length, spans: spansOf(h[2]!.replace(/\s+#+$/u, '')) });
      continue;
    }
    if (/^([-*_])(?:\s*\1){2,}$/u.test(line)) {
      flush();
      out.push({ t: 'hr' });
      continue;
    }
    const li = /^(?:[-*•]|\d+[.)])\s+(.*)$/u.exec(line);
    if (li) {
      if (para.length > 0) flush();
      items.push(spansOf(li[1]!));
      continue;
    }
    if (items.length > 0) flush();
    para.push(spansOf(line));
  }
  flush();
  return out;
}

/** About how many lines the note wraps to at 390: each line its own, a long one several. */
function linesAt390(text: string): number {
  return text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.trim().length / LINE_CHARS)), 0);
}

/**
 * WHETHER A TEXT FACT IS A MEMO: written in markdown (a heading, bold, a table, a list) or long enough to fold. A short
 * line stays a fact, drawn as it always was.
 */
export function isMemo(text: string): boolean {
  if (/^#{1,4}\s|\*\*\S|^\|.*\|$|^[-*]\s/mu.test(text)) return true;
  return folds(text);
}

/** Whether the note opens folded: past `FOLD_LINES` lines at 390. */
export const folds = (text: string): boolean => linesAt390(text) > FOLD_LINES;
