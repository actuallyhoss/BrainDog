/**
 * The Share sheet's template chips: Accountant, Contractor, Assistant and Reviewer, read from
 * the kernel's templates (`SHARE_TEMPLATES`) and never written out here, so the rows a chip writes are the ones the
 * record's own templates say.
 *
 * A CHIP IS OFFERED WHERE THE SHEET CAN FILL WHAT IT ASKS. Contractor asks for a project, so it is offered on a project;
 * Reviewer asks for a list and a condition, so it is offered on a list, and the sheet asks the condition before it can
 * share. Accountant and Assistant ask nothing and are offered everywhere.
 *
 * PLAIN TYPESCRIPT WITH RELATIVE IMPORTS, so `share-state.test.ts` loads it in Node.
 */

import { SHARE_TEMPLATES, type ShareRung, type ShareTemplate, type ShareTemplateAsk } from '@braindog/kernel';

/** The chips, in the order the sheet draws them. One Row is the row sheet's own target, not a chip. */
export const CHIPS = ['accountant', 'contractor', 'assistant', 'reviewer'] as const;
export type ChipId = (typeof CHIPS)[number];

/** What a sheet is opened on, as far as a template's asks go. */
export type Fills = { project?: string | null; list?: string | null; where?: unknown; row?: string | null };

/** What the subject can give each ask: a project row, a list, a list for a condition, a row. */
export type Offers = { project: boolean; list: boolean; row: boolean };

const can = (ask: ShareTemplateAsk, offers: Offers): boolean =>
  ask === 'project' ? offers.project : ask === 'row' ? offers.row : offers.list;

/** The chips this sheet offers, each its kernel template. */
export function chipsFor(offers: Offers): ShareTemplate[] {
  return CHIPS.map((id) => SHARE_TEMPLATES.find((t) => t.id === id)).filter((t): t is ShareTemplate => t !== undefined && t.asks.every((a) => can(a, offers)));
}

export const templateOf = (id: string | null): ShareTemplate | null => (id === null ? null : (SHARE_TEMPLATES.find((t) => t.id === id) ?? null));

/** The rung a template's allow row gives: what Can starts at when its chip is pressed. */
export const rungOf = (t: ShareTemplate): ShareRung => t.rows.find((r) => r.effect === 'allow')?.can ?? 'view';

/** Whether a template's allow row turns delete off (Contractor's does), so Can delete starts off. */
export const deletesOf = (t: ShareTemplate): boolean => t.rows.find((r) => r.effect === 'allow')?.caps?.delete !== false;

/** A `$` word filled from what the sheet holds, or `undefined` where it holds nothing for it. */
function fill(v: unknown, f: Fills): unknown {
  if (v === '$project') return f.project ?? undefined;
  if (v === '$list') return f.list ?? undefined;
  if (v === '$where') return f.where ?? undefined;
  if (v === '$row') return f.row ?? undefined;
  if (Array.isArray(v)) return v.map((x) => fill(x, f));
  if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, f)]));
  return v;
}

const holes = (v: unknown): boolean =>
  v === undefined || (Array.isArray(v) ? v.some(holes) : typeof v === 'object' && v !== null ? Object.values(v).some(holes) : false);

/** A template's rows with its `$` words filled in, or `null` while one of them has nothing to fill it. */
export function rowsOf(t: ShareTemplate, f: Fills): ShareTemplate['rows'] | null {
  const out = t.rows.map((r) => ({ ...r, what: fill(r.what, f) as Record<string, unknown> }));
  return out.some((r) => holes(r.what)) ? null : out;
}
