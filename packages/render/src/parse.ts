/**
 * The dialect parser.
 *
 * Fenced blocks, because an agent already writes fenced blocks and a new syntax is a new thing to
 * get wrong. `kind | heading`, then one row per line, `field | field | field | tone` (05 §2).
 *
 * TWO INVARIANTS, and everything here follows from them:
 *
 *   1. There is NO PATH THAT RETURNS NOTHING. Every failure returns a node. Silent omission in a
 *      record whose value is completeness is data loss with a tidy appearance — and when the author
 *      is an agent, the visible fence is the only feedback channel that exists (05 §3).
 *   2. The write is ACCEPTED. A document is never parsed at write and never refused for its
 *      dialect; degradation happens at render.
 *
 * The fence scan is FLAT: a fence inside a note ends the note. One parser, no nesting, nothing to
 * escape (05 §7.4).
 */

import { BAR_HOLE, KINDS, TONE_ALIAS, TONES, isKind, type DegradeCode, type Kind, type Tone } from './kinds.ts';

export type Row = { cells: string[]; tone?: Tone; hole?: boolean; done?: boolean; depth?: number };

export type Block = {
  type: 'block';
  kind: Kind;
  heading?: string;
  tone?: Tone;
  rows: Row[];
  /** The raw fence, kept so a degraded sibling can show exactly what the author typed. */
  raw: string;
  start: number;
  end: number;
};

export type Markdown = { type: 'markdown'; text: string; start: number; end: number };

export type Degraded = {
  type: 'degraded';
  code: DegradeCode;
  /** The sentence drawn above the fence. What was wrong, where, what to do — never an apology. */
  fix: string;
  raw: string;
  info: string;
  start: number;
  end: number;
};

export type Segment = Markdown | Block | Degraded;

const FENCE = /^(`{3,}|~{3,})(.*)$/;
const INFO = /^(?<kind>[a-z]+)(?:\s*\|\s*(?<heading>.*))?$/;

/** Split on `|` AFTER unescaping, so `\|` is a literal pipe and `\\` a literal backslash. */
export function splitRow(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '\\' && (line[i + 1] === '|' || line[i + 1] === '\\')) {
      cell += line[++i];
    } else if (c === '|') {
      out.push(cell.trim());
      cell = '';
    } else {
      cell += c;
    }
  }
  out.push(cell.trim());
  return out;
}

/**
 * A trailing cell that is a tone word is the tone. Anything else in that position is a CELL, never
 * a refusal — an unknown word in the tone slot is data, and treating it as an error would make
 * every write-up a minefield (13 §2.3).
 */
function takeTone(cells: string[], spec: { cells: number; tone: boolean; hole?: boolean }) {
  if (!spec.tone || cells.length <= spec.cells) return { cells, tone: undefined, hole: false };
  const last = cells[cells.length - 1]!.toLowerCase();
  if (spec.hole && last === BAR_HOLE) return { cells: cells.slice(0, -1), tone: 'warn' as Tone, hole: true };
  const tone = Object.hasOwn(TONES, last) ? (last as Tone) : TONE_ALIAS[last];
  return tone ? { cells: cells.slice(0, -1), tone, hole: false } : { cells, tone: undefined, hole: false };
}

const TODO = /^\[([ xX])\]\s*(.*)$/;

function readRows(kind: Kind, body: string[]): { rows: Row[]; over?: string } {
  const spec = KINDS[kind];
  // Prose keeps its blank lines, because a blank line is where one paragraph ends.
  if (spec.prose) return { rows: body.map((line) => ({ cells: [line] })) };
  if (spec.verbatim) {
    const rows = body.map((line) =>
      spec.indented
        ? { cells: [line.trimStart()], depth: Math.floor((line.length - line.trimStart().length) / 2) }
        : { cells: [line] },
    );
    return { rows };
  }

  const rows: Row[] = [];
  for (const line of body) {
    if (line.trim() === '') continue;

    let text = line;
    let done: boolean | undefined;
    if (spec.checkbox) {
      const m = TODO.exec(line.trim());
      if (m) {
        done = m[1] !== ' ';
        text = m[2]!;
      }
    }

    const all = splitRow(text);
    const { cells, tone, hole } = takeTone(all, spec);

    // A header row fixes the column count, so `comparison` takes as many cells as its first row.
    const width = spec.header ? (rows.length === 0 ? cells.length : rows[0]!.cells.length) : spec.cells;
    if (cells.length > width)
      return { rows, over: `${cells.length} columns where ${kind} takes ${width}: "${line.trim()}"` };

    rows.push({ cells, ...(tone ? { tone } : {}), ...(hole ? { hole } : {}), ...(done === undefined ? {} : { done }) });
  }

  // Rows over a cap degrade under DIALECT_ARITY. There is no DIALECT_ROWS code (36 §13 D9).
  if (spec.rows && rows.length > spec.rows)
    return { rows, over: `${rows.length} rows where ${kind} takes ${spec.rows}` };

  return { rows };
}

/**
 * The lines of a document, each carrying where its text sits in the source.
 *
 * A DOCUMENT WRITTEN ON WINDOWS PARSED AS ONE PROSE BLOB. Splitting on `\n` alone left a carriage
 * return on the end of every line, and `.` in JavaScript matches any character EXCEPT a line
 * terminator — of which `\r` is one — so a fence line never matched `FENCE`, no fence was ever
 * recognised, and every block in the file was rendered as the text of its own source.
 *
 * The terminator is taken off the text and its LENGTH is kept in the offsets, so `[start, end)`
 * still addresses the bytes the author typed. All three terminators are accepted, because a
 * document that arrives over an API is not a document somebody chose the line endings of.
 */
function linesOf(src: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const eol = /\r\n|\r|\n/g;
  let at = 0;
  for (let m = eol.exec(src); m; m = eol.exec(src)) {
    out.push({ text: src.slice(at, m.index), start: at, end: m.index });
    at = m.index + m[0].length;
  }
  out.push({ text: src.slice(at), start: at, end: src.length });
  return out;
}

/**
 * Segment a document. Total: it never throws, and every byte of the input lands in exactly one
 * segment, so an editor can splice `[start, end)` back over the source.
 */
export function parse(src: string): Segment[] {
  const out: Segment[] = [];
  const source = linesOf(src);
  const lines = source.map((l) => l.text);

  // Offsets are the source's, not the text's: a stripped `\r` still occupies a byte.
  const offset = source.map((l) => l.start);
  const endOf = (i: number) => (i < source.length ? source[i]!.end : src.length);

  let prose: string[] = [];
  let proseAt = 0;

  const flush = (endLine: number) => {
    if (prose.length === 0) return;
    const text = prose.join('\n');
    if (text.trim() !== '')
      out.push({ type: 'markdown', text, start: offset[proseAt] ?? 0, end: endOf(endLine - 1) });
    prose = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = FENCE.exec(line);
    if (!fence) {
      if (prose.length === 0) proseAt = i;
      prose.push(line);
      continue;
    }

    flush(i);

    const marker = fence[1]!;
    const info = fence[2]!.trim();
    const body: string[] = [];
    let close = i;
    for (let j = i + 1; j < lines.length; j++) {
      // Flat scan: the first closing marker of the same character ends the fence, wherever it is.
      if (lines[j]!.startsWith(marker[0]!.repeat(3)) && lines[j]!.trim().replace(/[`~]/g, '') === '') {
        close = j;
        break;
      }
      body.push(lines[j]!);
      close = j;
    }

    const start = offset[i]!;
    const end = endOf(close);
    const raw = src.slice(start, end);
    const parsed = INFO.exec(info);
    const kind = parsed?.groups?.kind ?? '';

    if (!isKind(kind)) {
      out.push({
        type: 'degraded',
        code: 'DIALECT_KIND_UNKNOWN',
        fix: kind
          ? `"${kind}" is not one of the sixteen kinds. The block is shown as you wrote it.`
          : 'A fence with no kind is shown as you wrote it.',
        raw,
        info,
        start,
        end,
      });
      i = close;
      continue;
    }

    // The heading half is row-split like a row, so a trailing tone word there is the BLOCK's tone.
    const headingCells = splitRow(parsed?.groups?.heading ?? '');
    const headTone = takeTone(headingCells, { cells: 1, tone: true });
    const heading = headTone.cells.filter((c) => c !== '').join(' | ') || undefined;

    const { rows, over } = readRows(kind, body);
    if (over) {
      out.push({
        type: 'degraded',
        code: 'DIALECT_ARITY',
        fix: `A ${kind} row has ${over}. The block is shown as you wrote it.`,
        raw,
        info,
        start,
        end,
      });
      i = close;
      continue;
    }

    // A hole never participates in a scale and never sorts among the knowns: it sits last, and it
    // is the only row that is a button, because an unknown is a task somebody has to close (05 §7.5).
    const ordered = KINDS[kind].hole ? [...rows.filter((r) => !r.hole), ...rows.filter((r) => r.hole)] : rows;

    out.push({
      type: 'block',
      kind,
      ...(heading ? { heading } : {}),
      ...(headTone.tone ? { tone: headTone.tone } : {}),
      rows: ordered,
      raw,
      start,
      end,
    });
    i = close;
  }

  flush(lines.length);
  return out;
}
