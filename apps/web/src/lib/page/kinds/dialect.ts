/**
 * What the writers of `calendar`, `link`, `gallery` and `embed` share: reading the record's answer for a block, and
 * writing it back out as the dialect's rows, which `braindog-render` draws.
 *
 * THE ANSWER IS WHAT A RECORD SENT, which may be a record on another build (`index.ts` says why), so every value is
 * narrowed here before a writer uses it: a column that names no field, an authored row whose cells are not all words,
 * a tone that is not one of the four, are each left out rather than written into a fence.
 *
 * IT LOADS IN PLAIN NODE, as every module this folder names does: relative imports with their extension, no `$lib`,
 * no stylesheet.
 */

import type { BlockResult } from '@braindog/kernel';
import { TONES, parse } from 'braindog-render';

import type { DrawOptions, Drawn } from './index.ts';

/**
 * A cell as the dialect reads it back: a `|` in a value is a pipe and not the end of the cell. And a first cell of three
 * backticks never closes the fence (RH15): the dialect has no escape for one, so an invisible space goes after the first.
 */
export const escapeCell = (c: string): string =>
  c.replace(/\s*[\r\n]+\s*/gu, ' ').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/^`(?=``)/u, '`\u200b');

/** The list a block reads, from its `source: register.<id>`, or null for a block over no list. */
export function listOf(result: BlockResult): string | null {
  const source = result.source;
  return typeof source === 'string' && source.startsWith('register.') && source.length > 'register.'.length ? source.slice('register.'.length) : null;
}

/** The field each declared column names, in order; a column that names none is an empty string, so places hold. */
export function fieldsOf(result: BlockResult): string[] {
  const columns: unknown = result.columns;
  if (!Array.isArray(columns)) return [];
  return columns.map((c) => (c !== null && typeof c === 'object' && typeof (c as { field?: unknown }).field === 'string' ? (c as { field: string }).field : ''));
}

/** The block's authored rows: every cell a word, and a tone only when it is one of the four. */
export function authoredOf(result: BlockResult): { cells: string[]; tone: string | null }[] {
  const authored = (result as unknown as { authored?: unknown }).authored;
  if (!Array.isArray(authored)) return [];
  return authored.flatMap((r) => {
    const said = r !== null && typeof r === 'object' ? (r as { cells?: unknown; tone?: unknown }) : null;
    if (!said || !Array.isArray(said.cells) || !said.cells.every((c): c is string => typeof c === 'string')) return [];
    const tone = typeof said.tone === 'string' && Object.hasOwn(TONES, said.tone) ? said.tone : null;
    return [{ cells: said.cells as string[], tone }];
  });
}

/** The rows the record answered for a block over a list, each with its number and its fields, and nothing else. */
export function entriesOf(result: BlockResult): { seq: number | null; fields: Record<string, unknown> }[] {
  const rows: unknown = result.rows;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    if (r === null || typeof r !== 'object') return [];
    const { seq, fields } = r as { seq?: unknown; fields?: unknown };
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return [];
    return [{ seq: typeof seq === 'number' && Number.isInteger(seq) && seq > 0 ? seq : null, fields: fields as Record<string, unknown> }];
  });
}

/** Where a row of a list opens, record-relative as the renderer's host expects (`RenderOptions.href` places it). */
export const rowHref = (register: string, seq: number): string => `/r/${register}/${seq}`;

/**
 * A row's words as a link to the row, the way a card's name is a door (`blocks.ts` `cardsRows`), or the words alone
 * where the row has no number or the words hold a bracket that would break the link written around them.
 */
export function linked(words: string, register: string, seq: number | null): string {
  const cell = escapeCell(words);
  return seq !== null && words !== '' && !/[[\]]/u.test(words) ? `[${cell}](${rowHref(register, seq)})` : cell;
}

/**
 * The block drawn: one fence of `kind` holding `rows`, parsed as a page's own, or the empty state every kind says when
 * there are no rows to draw.
 *
 * NO HEADING IN THE FENCE, for the reason `blocks.ts` gives: the block's frame already names it, and a caption saying
 * it again is the same sentence twice in two registers.
 */
export function fenced(kind: string, rows: readonly string[], opts: DrawOptions): Drawn {
  if (rows.length === 0) return { segments: [], refusal: opts.nothing() };
  return { segments: parse(['```' + kind, ...rows, '```'].join('\n'), { page: true }), refusal: null };
}
