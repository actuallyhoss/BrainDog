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

import { BAR_HOLE, TONE_ALIAS, TONES, type DegradeCode, type KindSpec, type Tone } from './kinds.ts';
import { isPackKind, kindSpec, type BlockKind } from './kind-spec.ts';
import { cardFault } from './cards.ts';
import { feedFault } from './feed.ts';
import { queueFault } from './queue.ts';
import { captureFault } from './capture.ts';
import { diffFault } from './diff.ts';
import { pathFault } from './path.ts';
import { inputsFault } from './inputs.ts';
import { linkFault } from './links.ts';
import { embedFault } from './embed.ts';
import { lanesFault } from './lanes.ts';
import type { Action } from './actions.ts';

/**
 * `page` is set by a page's own evaluator and never by a write-up. It admits the page-only kinds
 * that have a row grammar (`cards`, `section`), because their rows come from a declaration rather
 * than from an author. `table` has none and still degrades: the host draws it from the register.
 *
 * `kinds` is the kinds the record's packs declare, keyed `block.<id>` (`kindSpec`). Without it a `block.<id>` fence
 * degrades as an unknown kind, because there is no spec to read its rows against.
 */
export type ParseOptions = { page?: boolean; kinds?: Readonly<Record<string, KindSpec>> };

/**
 * Which record row a drawn row is, when a host drew it from one: its register, its number and the version it was read at.
 *
 * NEVER PARSED. A fence an author typed names no row, so only the host that projected the rows sets it, after the parse;
 * it is what lets a moved card or a ticked task be written back to the row it came from, and the version makes a row
 * somebody else changed first a conflict rather than an overwrite.
 */
export type RowRef = { register: string; seq: number; version: number };

/**
 * `arrived` IS THE HOST SAYING THIS ROW WAS NOT THERE THE LAST TIME THE LIST WAS DRAWN: an agent wrote it, or somebody
 * else did, while the reader looked. The primitive marks it `data-arrived` and `blocks.css` tints it for a second and a
 * half. Never parsed, like `ref`: a fence an author typed has no last time.
 */
export type Row = { cells: string[]; tone?: Tone; hole?: boolean; done?: boolean; depth?: number; ref?: RowRef; arrived?: boolean };

export type Block = {
  type: 'block';
  /** One of the forty-three, or `block.<id>` for a kind a pack declared; `kindSpec` reads either. */
  kind: BlockKind;
  /** The word after the kind in the fence, one of `KINDS[kind].forms`: ` ```stat lead ` is `lead`. */
  form?: string;
  heading?: string;
  tone?: Tone;
  rows: Row[];
  /** A declared block's actions, cut by the page read to what this reader may press. Never parsed: a fence an author typed has none. */
  actions?: readonly Action[];
  /** Each row's declared actions, cut by the page read to what this reader may press. Never parsed. */
  row_actions?: readonly Action[];
  /** A calendar's strip of whole weeks from this one (`weeks:`), set by the page read like `actions`. Never parsed. */
  weeks?: number;
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
/**
 * The info string: a kind word, then optionally `|` and a heading.
 *
 * THE KIND WORD IS READ IN ANY CASE AND ACCEPTED IN ONE. `[a-z]+` was the class here, so an info
 * string with a capital in it did not match this pattern AT ALL, neither the kind half nor the
 * heading half, and ` ```Stat ` fell through to the branch for a fence with no kind and was told
 * *"A fence with no kind is shown as you wrote it."* The author had written a kind. They had
 * written the shift key as well, and nothing on the screen said so, so the sentence sent them
 * looking for the thing they had already done. When the author is an agent the visible fence is
 * the only feedback channel there is, which makes the sentence the whole value of a degradation.
 */
/* A PACK'S KIND IS `block.` AND ITS ID, so the kind half takes a dot and the id's digits, hyphens and underscores after
   one word. The pattern admits more than a pack may declare; `kindSpec` is what decides whether the name is a kind. */
const INFO = /^(?<kind>[A-Za-z]+(?:\.[A-Za-z0-9_-]+)?)(?:\s+(?<form>[A-Za-z]+))?(?:\s*\|\s*(?<heading>.*))?$/;

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
function takeTone(cells: string[], spec: { cells: number; tone: boolean; hole?: boolean; optional?: number }) {
  if (!spec.tone || cells.length <= spec.cells - (spec.optional ?? 0)) return { cells, tone: undefined, hole: false };
  const last = cells[cells.length - 1]!.toLowerCase();
  if (spec.hole && last === BAR_HOLE) return { cells: cells.slice(0, -1), tone: 'warn' as Tone, hole: true };
  /* `Object.hasOwn` ON THE ALIASES TOO, and the miss was a cell that disappeared. `TONE_ALIAS` is a
     plain object, so `TONE_ALIAS['constructor']` answered with the Object constructor and
     `TONE_ALIAS['__proto__']` with `Object.prototype`: both truthy, so the last cell of the row was
     sliced off as a tone word and the tone that reached `data-intent` was
     `function Object() { [native code] }`. A `timeline` note reading "constructor" is an ordinary
     word in an ordinary column and it vanished off the page. The first half of this line already
     knew the answer, which is what makes the second half a slip rather than a design. */
  const tone = Object.hasOwn(TONES, last) ? (last as Tone) : Object.hasOwn(TONE_ALIAS, last) ? TONE_ALIAS[last] : undefined;
  return tone ? { cells: cells.slice(0, -1), tone, hole: false } : { cells, tone: undefined, hole: false };
}

const TODO = /^\[([ xX])\]\s*(.*)$/;

function readRows(kind: string, spec: KindSpec, body: string[]): { rows: Row[]; over?: string } {
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
    /* A HEADER ROW FIXES THE COLUMN COUNT, so `comparison` and `cards` take as many cells as their
       first row. The header carries no tone, and a later row's tone is read only from a cell beyond
       that count: read against `cells: 0`, every row's last value was a tone candidate, and a card
       whose last column said "good" would have lost the word to the tone. */
    const head = spec.header ? rows[0]?.cells.length : undefined;
    const { cells, tone, hole } =
      spec.header && head === undefined
        ? { cells: all, tone: undefined, hole: false }
        : takeTone(all, { ...spec, cells: head ?? spec.cells });
    const width = head ?? (spec.header ? cells.length : spec.cells);
    if (cells.length > width)
      return { rows, over: `A ${kind} line has ${cells.length} columns where ${kind} takes ${width}: "${line.trim()}"` };

    rows.push({ cells, ...(tone ? { tone } : {}), ...(hole ? { hole } : {}), ...(done === undefined ? {} : { done }) });
  }

  // Rows over a cap degrade under DIALECT_ARITY. There is no DIALECT_ROWS code (36 §13 D9).
  if (spec.rows && rows.length > spec.rows)
    return { rows, over: `A ${kind} has ${rows.length} lines where a ${kind} takes ${spec.rows}` };

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
 * Segment a document. Total: it never throws, and no byte the author typed is ever dropped.
 *
 * IT USED TO CLAIM THAT EVERY BYTE LANDS IN EXACTLY ONE SEGMENT, and that is false by two bytes on
 * the four-line document the suite tests it with. It cannot be made true without giving up the
 * half of the sentence that is worth having. A segment's `[start, end)` is the bytes the author
 * typed and NOT the terminator after them, which is what `linesOf` above is doing when it takes
 * the terminator off the text and keeps its length in the offsets. So the newline between one
 * segment and the next belongs to neither, on purpose: it is what an editor splicing a replacement
 * over `[start, end)` must not have to put back. A blank run between two fences is dropped for the
 * same reason a blank paragraph is not a paragraph.
 *
 * What holds, and what the suite measures: the segments come in source order and never overlap,
 * `src.slice(start, end)` is exactly the fence a block or a degradation was built from, and every
 * byte left over is whitespace. Nothing an author wrote goes missing; the gaps are the separators.
 */
export function parse(src: string, opts: ParseOptions = {}): Segment[] {
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
    /* WHAT THEY WROTE AND WHAT IT WOULD BE, kept apart, because the two of them are two different
       sentences. The kind is matched case-insensitively so the word can be recognised, and it is
       still only ACCEPTED in lower case: the dialect has one spelling per kind, `raw` is the bytes
       the author typed, and a fence that says `Stat` while the record says `stat` is the same
       figure written two ways, which `format.ts` opens by saying is two figures. */
    const written = parsed?.groups?.kind ?? '';
    const kind = written.toLowerCase();

    const spec = kindSpec(kind, opts.kinds);

    /* A FENCE THAT NAMES NO KIND OF OURS IS ORDINARY CODE: ` ```ts `, ` ```bash `, ` ```dockerfile `, or no word at all.
       A skill or a project note carries code the way every README does, and telling its author that "ts" is not one of
       the forty-three kinds sent them to fix a fence that was right, and counted it as a fault on the page. It is drawn
       as a `code` block, the word kept as its language. What still degrades is a fence that reads as a block of ours
       gone wrong: a pack's kind not installed, a word with a `|` heading after it, or a kind word with more after it. */
    if (!spec && !isPackKind(kind) && !info.includes('|')) {
      const first = (info.split(/\s+/)[0] ?? '').toLowerCase();
      if (!kindSpec(first, opts.kinds) && !isPackKind(first)) {
        out.push({
          type: 'block',
          kind: 'code' as BlockKind,
          ...(info ? { heading: info.split(/\s+/)[0]! } : {}),
          rows: body.map((line) => ({ cells: [line] })),
          raw,
          start,
          end,
        });
        i = close;
        continue;
      }
    }

    if (!spec) {
      out.push({
        type: 'degraded',
        code: 'DIALECT_KIND_UNKNOWN',
        /* A PACK'S KIND THAT IS NOT INSTALLED IS A DIFFERENT REPAIR from a misspelt one: the author wrote a kind that
           exists somewhere, and the step is to install the pack, not to pick another word. */
        fix: isPackKind(kind)
          ? `"${written}" is a block kind no installed pack declares. Install the pack that declares it. The block is shown as you wrote it.`
          : written
          ? `"${written}" is not one of the forty-three kinds. The block is shown as you wrote it.`
          : 'A fence with no kind is shown as you wrote it.',
        raw,
        info,
        start,
        end,
      });
      i = close;
      continue;
    }

    /* A CAPITAL IS A FAULT WITH A NAME, and it was reported as the absence of a kind. It degrades
       rather than being quietly accepted for the reason above, and it names the spelling to write,
       because a degradation that does not say what to do next is a stop rather than a step. It is
       checked before `pageOnly` so that each sentence is about one thing: fix the case, and the
       next render says whether the kind belongs in a fence at all. */
    if (written !== kind) {
      out.push({
        type: 'degraded',
        code: 'DIALECT_KIND_UNKNOWN',
        fix: `"${written}" is a kind, but kinds are lower case. Write "${kind}". The block is shown as you wrote it.`,
        raw,
        info,
        start,
        end,
      });
      i = close;
      continue;
    }

    /**
     * A PAGE-ONLY KIND IS NOT A FENCE, and it degrades like an unknown one.
     *
     * `05 §2`'s kind table says it in words, *"a `table` fence in a write-up has no rows to draw
     * and degrades to its fence like an unknown kind"*; `36 §7` says it as a parser step, and
     * `KindSpec.pageOnly` is the flag that says which kinds those are. Nothing read the flag. So a
     * bare `table` fence drew an empty grid, which reads as a bug in the record rather than as an
     * answer; and a `table` fence WITH rows was refused by arity instead, *"a table row has 2
     * columns where table takes 0"*, which points the author at a column count when the fact is
     * that the kind is bound to a register and cannot carry authored rows at all. When the author
     * is an agent the visible fence is the only feedback channel there is, so the sentence on it
     * has to name the real reason. `36 §13`'s codes are a closed pair and this is the unknown one.
     */
    const drawable = opts.page === true && (spec.cells > 0 || spec.header === true);
    if (spec.pageOnly && !drawable) {
      out.push({
        type: 'degraded',
        code: 'DIALECT_KIND_UNKNOWN',
        /* A section is not a register, so the register sentence would send its author looking for
           rows it never had. A write-up's heading is the markdown one. */
        fix:
          kind === 'section'
            ? `"section" is a heading on a page, so it has no place in a fence. Write a "##" heading. The block is shown as you wrote it.`
            : kind === 'feed' || kind === 'agents'
              ? `"${kind}" draws what happened in the record, on a page, so it takes nothing written in a fence. Use "timeline". The block is shown as you wrote it.`
              : kind === 'capture'
                ? /* A WRITE-UP HAS NO HOST TO ADD WITH, and "use comparison" would send the author to draw a table of a line nobody can type into. */
                  `"capture" adds a row to a list from a page, so a write-up cannot carry one. Link to the list instead. The block is shown as you wrote it.`
                : kind === 'inputs'
                  ? /* NOR A ROW TO TYPE INTO, and the values the inputs would show are a spec, which a write-up can carry. */
                    `"inputs" edits a row of a list from a page, so a write-up cannot carry one. Use "spec" for the values. The block is shown as you wrote it.`
                  : kind === 'embed'
                    ? `"embed" frames a video, a design or a map on a page, so a write-up cannot carry one. Link to it instead. The block is shown as you wrote it.`
                  : `"${kind}" draws a register on a page, so it takes nothing written in a fence. Use "comparison". The block is shown as you wrote it.`,
        raw,
        info,
        start,
        end,
      });
      i = close;
      continue;
    }

    /* A FORM IS A WORD THE KIND NAMES, and any other word degrades with the forms there are. Before
       forms existed a second word matched nothing and was told the fence had no kind. */
    const form = parsed?.groups?.form;
    const forms = spec.forms ?? [];
    /* `code ts` IS CODE IN TYPESCRIPT, and it is drawn now that ` ```ts ` is: the word is the language, the same label a
       bare language fence carries, and a heading after a `|` still wins it. */
    const lang = kind === 'code' && form !== undefined ? form : undefined;
    if (form !== undefined && lang === undefined && !forms.includes(form)) {
      out.push({
        type: 'degraded',
        code: 'DIALECT_KIND_UNKNOWN',
        fix: forms.length
          ? `"${form}" is not a form of ${kind}. Write ${[kind, ...forms.map((f) => `${kind} ${f}`)].map((w) => `"${w}"`).join(' or ')}. The block is shown as you wrote it.`
          : `"${kind}" takes no word after it, and a heading goes after a "|". The block is shown as you wrote it.`,
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
    const heading = headTone.cells.filter((c) => c !== '').join(' | ') || lang;

    const { rows, over } = readRows(kind, spec, body);
    if (over) {
      out.push({
        type: 'degraded',
        code: 'DIALECT_ARITY',
        /* NEVER "row" IN WORDS A PERSON READS (the house rules): a stat said "A stat row has 7 rows". */
        fix: `${over}. The block is shown as you wrote it.`,
        raw,
        info,
        start,
        end,
      });
      i = close;
      continue;
    }

    /* A CARD'S COLUMNS ARE ROLES, and one figure and at most three facts is the kind's arity, stated
       per role rather than per row. Too many is DIALECT_ARITY like any row that is too wide. A feed
       row's first word is its group and a diff row's first character its mark, and a row that has
       neither would be dropped from the drawing, so it degrades under the same code. */
    const card = kind === 'cards' ? cardFault(rows[0]?.cells ?? []) : null;
    const feed = kind === 'feed' ? feedFault(rows.map((r) => r.cells)) : null;
    const diff = kind === 'diff' ? diffFault(rows.map((r) => r.cells[0] ?? '')) : null;
    /* A QUEUE ROW IS A QUESTION OR ONE OF ITS OPTIONS, and an option under no question would be dropped
       from the drawing, which is a way to answer quietly disappearing. Same code, same reason as a feed. */
    const queue = kind === 'queue' ? queueFault(rows.map((r) => r.cells)) : null;
    /* A CAPTURE ROW IS THE LIST OR A VALUE A NEW ROW IS FILLED WITH, and a stray one is a line that adds to
       the wrong list or as the wrong state, which is a write the person did not make. */
    const capture = kind === 'capture' ? captureFault(rows.map((r) => r.cells)) : null;
    /* A PATH'S MARK AND AN INPUT'S FIELD ARE READ, NOT PRINTED, so a word neither knows is a fault rather than a cell:
       a stone marked `doing` would be drawn as later, and a field id that is not one would be handed back to the host
       as the field to write. Only the path form reads the mark; a plain `steps` row's third cell is still free text. */
    const path = kind === 'steps' && form === 'path' ? pathFault(rows.map((r) => r.cells)) : null;
    const inputs = kind === 'inputs' ? inputsFault(rows.map((r) => r.cells)) : null;
    /* A LINK'S ADDRESS AND AN EMBED'S ARE READ, NOT PRINTED: a row of links that quietly stopped being a link, or a frame
       nobody may draw, is the fault the author has to see. */
    const link = kind === 'link' ? linkFault(rows.map((r) => r.cells)) : null;
    const embed = kind === 'embed' ? embedFault(rows.map((r) => r.cells)) : null;
    /* A LANES BLOCK'S WINDOW IS READ, NOT PRINTED: one that does not read would leave every span with nowhere to sit. */
    const lanes = kind === 'lanes' ? lanesFault(rows.map((r) => r.cells)) : null;
    /* A STAT'S FOURTH CELL IS A TREND, and a word there is a note in the wrong column rather than a
       line with no points: before the trend it was a fifth cell and degraded, and it still does. */
    /* A RUN OF GAPS ALONE IS A LINE NOT KEPT YET, which says when it starts (`TREND_WAIT`), and is not a word. */
    const trend = kind === 'stat' ? rows.find((r) => (r.cells[3] ?? '').trim() !== '' && !/\d/u.test(r.cells[3]!) && !/^[-\s]+$/u.test(r.cells[3]!)) : undefined;
    const fault = trend
      ? `A stat row's fourth cell is a trend, a run of numbers like "18 20 19 24", and "${trend.cells[3]}" has none.`
      : card
      ? `A cards block has ${card}. A card takes one figure and at most three facts.`
      : feed
        ? `A feed block has ${feed}.`
        : queue
          ? `A queue block has ${queue}.`
          : capture
            ? `A capture block has ${capture}.`
            : path
              ? `A steps path has ${path}.`
              : inputs
                ? `An inputs block has ${inputs}.`
                : link
                  ? link
                : embed
                  ? `An embed block has ${embed}.`
                : lanes
                  ? `A lanes block has ${lanes}.`
                : diff !== null
                  ? `A diff row starts with "- ", "+ " or two spaces, and "${diff}" does not.`
                  : null;
    if (fault) {
      out.push({
        type: 'degraded',
        code: 'DIALECT_ARITY',
        fix: `${fault} The block is shown as you wrote it.`,
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
    const ordered = spec.hole ? [...rows.filter((r) => !r.hole), ...rows.filter((r) => r.hole)] : rows;

    out.push({
      type: 'block',
      /* `kindSpec` answered, so the name is one of the forty-three or an installed `block.<id>`. */
      kind: kind as BlockKind,
      ...(form && lang === undefined ? { form } : {}),
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
