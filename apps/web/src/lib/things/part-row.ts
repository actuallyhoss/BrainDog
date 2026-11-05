/**
 * WHICH ROW A PART OF A CHART IS. A bar on a figure grouped by something ("What each account holds", "Spent, by category") comes
 * with its group's name and nothing to point at, so a menu on it asks the record which row that is: the list the figure reads
 * when it groups by that list's name, or the list its grouping field links to. Nothing here names a list.
 */

import { apiBase } from '../at.ts';
import { createClient } from '@braindog/client';
import { readKpis, type Reads } from '../kpis/kpi-rows.ts';
import { declOf } from './menu-of.ts';
import { FIGURES_KNOWN } from '../record/figures-known.ts';

type Figure = { source?: unknown; group_by?: unknown };

type Group = { key?: unknown; label?: unknown };
export type FiguredBlock = {
  parts?: { metric?: unknown; groups?: readonly Group[] };
  source?: unknown;
};

/** The list a block's `source` names, or a figure of it reads. */
export function listOfBlock(block: FiguredBlock): string | null {
  const direct = typeof block.source === 'string' ? /^register\.(.+)$/u.exec(block.source)?.[1] : undefined;
  if (direct) return direct;
  const figure = typeof block.parts?.metric === 'string' ? (FIGURES_KNOWN[block.parts.metric] as Figure | undefined) : undefined;
  return (typeof figure?.source === 'string' ? /^register\.(.+)$/u.exec(figure.source)?.[1] : undefined) ?? null;
}

/** The address of the row a chart's part stands for, or null where the record has none. */
export async function partRow(block: FiguredBlock, said: string): Promise<string | null> {
  const parts = block.parts;
  const figure = typeof parts?.metric === 'string' ? (FIGURES_KNOWN[parts.metric] as Figure | undefined) : undefined;
  const source = typeof figure?.source === 'string' ? /^register\.(.+)$/u.exec(figure.source)?.[1] : undefined;
  const by = figure?.group_by;
  const group = parts?.groups?.find((g) => (g.label ?? g.key) === said);
  if (!source || typeof by !== 'string' || !group) return null;
  const decl = await declOf(source);
  if (!decl) return null;
  const reads = createClient({ base: apiBase() }) as unknown as Reads;
  if (decl.title === by) {
    const rows = await readKpis(reads, source);
    const row = rows?.find((r) => r.fields[by] === group.key);
    return row ? `/r/${source}/${row.seq}` : null;
  }
  const to = decl.fields.find((f) => f.id === by)?.to;
  if (!to) return null;
  const rows = await readKpis(reads, to);
  const row = rows?.find((r) => r.id === group.key);
  return row ? `/r/${to}/${row.seq}` : null;
}
