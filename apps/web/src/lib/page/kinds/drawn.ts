/**
 * A `drawn` block, from the record's answer: nothing in the dialect at all. Its code runs only in a sandboxed frame,
 * which `BlockSlot.svelte` draws from the answer kept on the block (`DrawnFrame.svelte`), so this answers no segments
 * and no refusal, and is registered so the answer is kept whole (`page-live.ts`).
 *
 * A BLOCK WITH NO CODE never arrives here: the record refuses it at read (the kernel's `kinds/drawn.ts`), and it is drawn
 * as every refused block is. One whose code is somehow blank is the empty state every kind says.
 */

import { drawnData, type DrawnData } from 'braindog-render';

import type { KindDrawer } from './index.ts';

export const drawn: KindDrawer = {
  draw(result, opts) {
    return drawnCode(result) !== null ? { segments: [], refusal: null } : { segments: [], refusal: opts.nothing() };
  },
};

/** The code a block's answer carries, or `null`. */
export const drawnCode = (answer: unknown): string | null => {
  const code = typeof answer === 'object' && answer !== null ? (answer as { code?: unknown }).code : undefined;
  return typeof code === 'string' && code.trim() !== '' ? code : null;
};

/** What `DrawnFrame.svelte` draws a block with: its code, what it is handed, and the height it starts at. */
export type DrawnPlan = { code: string; data: DrawnData; start: number | undefined };

/**
 * A drawn block's plan, from the record's answer kept on it, or, for a block added while arranging that the record has
 * not read yet (`Arrange.svelte` `added`), from the rows its list's other block already holds. `null` for any other
 * kind, and for a drawn block with no code.
 *
 * `name` is the list's name as the record declares it, so a component says Bills and never `bills`.
 */
export function drawnOf(
  block: { kind: string; answer?: unknown; code?: unknown; height?: unknown; register?: unknown; source?: unknown; columns?: unknown; entries?: unknown },
  name: (register: string) => string | null = () => null,
): DrawnPlan | null {
  if (block.kind !== 'drawn') return null;
  /* AN ANSWER COUNTS ONLY WHEN IT IS A DRAWN BLOCK'S: a block added while arranging is built over another block of its
     list (`Arrange.svelte` `added`), and keeps that block's answer, a calendar's say, until the page is read again. */
  const answer = typeof block.answer === 'object' && block.answer !== null && (block.answer as { kind?: unknown }).kind === 'drawn' ? block.answer : undefined;
  const from = (answer ?? block) as { code?: unknown; height?: unknown; source?: unknown; columns?: unknown; rows?: unknown };
  const code = drawnCode(from);
  if (code === null) return null;
  const rows = answer === undefined ? block.entries : from.rows;
  const source = typeof from.source === 'string' ? from.source : undefined;
  const register = typeof block.register === 'string' ? block.register : source?.startsWith('register.') ? source.slice('register.'.length) : null;
  const data = drawnData({ register, source, columns: from.columns ?? block.columns, rows }, register === null ? undefined : (name(register) ?? undefined));
  return { code, data, start: typeof from.height === 'number' ? from.height : undefined };
}
