/**
 * The page words the install and the read refuse in one sentence: a section's host panel, a path's short view and the
 * columns a roadmap over a list needs.
 *
 * ONE SENTENCE IN TWO PLACES, which is why these are here and not in either. `declare.ts` asks them when a page is
 * installed and `pages.ts` asks them when it is read, for a page installed under an earlier build, and two copies of
 * a sentence were two answers the day one of them was edited (`block-keys.ts` says the same of the key lists).
 *
 * A LEAF, IMPORTING NOTHING OF THE KERNEL AT RUN TIME. `declare.ts` and `pages.ts` both import it, and so may a kind
 * module (`kinds/index.ts`), whose registry is read while those two are still loading; a file here that imported
 * either would be asked for before it existed.
 */

import type { Refusal } from '@braindog/ports';

/** A block as a pack sent it, before anything in it is trusted. */
export type Raw = Readonly<Record<string, unknown>>;

/**
 * The host panels a `section` may name with `panel:`, drawn by the host for the page's row under the section's
 * heading: what the row's work runs on and is scheduled to do, where its numbers are sent, and, on a run's own page,
 * what that run did (`run`, drawn only when the page is for a run).
 *
 * A KEY AND NOT TWO KINDS, because the renderer cannot draw either: each is the host's own screen, placed by the page.
 * The web still reads the two English headings a page carried before this key, and nothing new relies on them.
 */
export const PANELS = ['actions', 'reporting', 'run'] as const;

/** The most bytes a path's short view is named in, which is the width of the switch it is drawn on. */
export const SHORT_LABEL_BYTES = 24;

const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

const invalid = (fix: string, at: string, allowed?: readonly string[]): Refusal => ({
  code: 'DECLARATION_INVALID',
  fix,
  at,
  ...(allowed === undefined ? {} : { allowed }),
});

/**
 * Why a section's `panel:` cannot be drawn, or `null`.
 *
 * `onTemplate` IS WHETHER THE PAGE IS A PAGE PER ROW (`for:`). A panel is about one row, whose actions or reports it
 * draws, so on a page about no row it would be drawn about nothing. `null` when the caller cannot say, as a block
 * read on its own cannot.
 */
export function panelFault(panel: unknown, onTemplate: boolean | null): Refusal | null {
  if (panel === undefined) return null;
  if (typeof panel !== 'string' || !(PANELS as readonly string[]).includes(panel))
    return invalid(`panel: is one of ${PANELS.join(', ')}, the part of the row's page the host draws under this section's heading, and ${JSON.stringify(panel)} is none of them.`, 'panel', PANELS);
  if (onTemplate === false)
    return invalid(`panel: ${panel} draws a part of one row's page, and this page is about no row. Make it a page per row with for: { register }, or take panel: off.`, 'panel');
  return null;
}

/**
 * Why a path's `short:` cannot be read, or `null`: `{ where: <sentence>, label: <words> }`, the rows the short view
 * keeps and what the switch calls it.
 *
 * THE SENTENCE IS CHECKED HERE ONLY FOR BEING ONE. Whether its words name fields of the list is the read's question,
 * because only the read has the list in hand, and it refuses a sentence the list cannot answer as it refuses a block's
 * own `where:`.
 */
export function shortFault(short: unknown): Refusal | null {
  if (short === undefined) return null;
  const said = 'short: is { where, label }: the rows the short view keeps, as a sentence, and what its switch calls it, such as { where: "state is open", label: This week }.';
  if (short === null || typeof short !== 'object' || Array.isArray(short)) return invalid(said, 'short');
  const { where, label, ...rest } = short as { where?: unknown; label?: unknown };
  if (Object.keys(rest).length > 0) return invalid(said, 'short', ['where', 'label']);
  if (typeof where !== 'string' || where.trim() === '') return invalid(said, 'short');
  if (typeof label !== 'string' || label.trim() === '') return invalid(said, 'short');
  const size = bytesOf(label);
  if (size > SHORT_LABEL_BYTES)
    return { code: 'OUT_OF_BOUNDS', fix: `short: names its view in ${size} bytes, and the switch it is drawn on holds ${SHORT_LABEL_BYTES}. Shorten the label.`, at: 'short' };
  return null;
}

/**
 * Why a `roadmap` over a list cannot be drawn, or `null`.
 *
 * A ROADMAP READS ITS CELLS BY PLACE: the title, the day it is due by and how long it takes (`render/src/roadmap.ts`),
 * so over a list it has to be told which field is which. Without `columns:` it installed, read its rows and drew
 * nothing at all, because there was no day to place any of them on. The effort may be left off, and a row with none is
 * drawn as a dated stem, so two columns draw and one does not.
 */
export function roadmapFault(block: Raw): Refusal | null {
  if (block.source === undefined) return null;
  const columns = block.columns;
  const count = Array.isArray(columns) ? columns.length : 0;
  if (count >= 2 && count <= 3) return null;
  return invalid(
    `A roadmap over a list names three columns, the title, the day each row is due by and its effort in days, such as columns: [title, by, effort], and this one names ${count === 0 ? 'none' : count}. The effort may be left off.`,
    'columns',
  );
}
