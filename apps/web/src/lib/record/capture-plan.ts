/**
 * A CAPTURE'S ROWS AND ITS PLAN, WITHOUT THE PAGE'S RENDERER.
 *
 * Today's head draws its capture line on the first frame (`HeadCapture.svelte`), and it used to ask `blocks.ts` `draw`
 * for the plan, which put the whole page renderer, every kind's rows and its kinds' drawers, on Today's first load for
 * one field. A capture's rows are a few cells written here, read by the same parser `draw` reads them with, so the
 * plan is the same one; `blocks.ts` writes a capture's rows with this file's `captureRows`, so there is one writer.
 *
 * `capturePlanOf` ANSWERS ONLY THE PLAIN CASE: a capture the record answered with no rows of its own, no figures and
 * nothing refused, which is what a page's capture is. Anything else is `undefined`, and the caller asks `draw` itself.
 */

import { capturePlan, parse, type CapturePlan } from 'braindog-render';

import type { BlockResult } from './api.ts';
import { REGISTERS } from './held.ts';
import { registerHref } from './where.ts';

/** A cell as the dialect reads it back: one line, its pipes and backslashes escaped. */
export const escapeCell = (c: string): string =>
  /* AND A FIRST CELL OF THREE BACKTICKS NEVER CLOSES THE FENCE (RH15): an invisible space goes after the first. */
  c.replace(/\s*[\r\n]+\s*/gu, ' ').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/^`(?=``)/u, '`\u200b');

/**
 * A capture's rows: `into` the list, then `set` for each value a new row is filled with (`render/src/capture.ts`).
 *
 * THE BLOCK WAS DRAWN AS A DEGRADED FENCE until this existed. `4cff0163` taught both engines to answer a capture
 * with `register` and `fills`, and nothing here wrote the rows the renderer reads, so the generic branch wrote a
 * fence with none and the parser refused it with "no into row", on every page that declared one.
 *
 * THE LIST'S ADDRESS IS THE BLOCK'S OWN SLICE, `registerHref` over its `where:`, because a reader who cannot add
 * from here is sent to the list to add there, and the grid's line under the same filter fills the same values.
 * The name is the register's, the one the block bar above already prints.
 *
 * NO LIST, NO ROWS, so a capture with nothing to add to still degrades rather than drawing a field that writes
 * nowhere. Both engines refuse that declaration first, so this is only reached by a block built by hand.
 */
/**
 * LISTS NAMED BY AN ADD-ON NOBODY HAS INSTALLED, while its preview is on the screen (`market/PreviewPage.svelte`).
 * The preview's lists are lent to `REGISTERS` only while its blocks are read, so its capture line was drawn later with
 * the list's id where the name goes ("Add to money_goals"). Names only, so nothing else reads a list that is not here.
 */
export const LENT_NAMES = new Map<string, string>();

export function captureRows(block: BlockResult): string[] {
  const register = block.register;
  if (!register) return [];
  const into = ['into', register, REGISTERS[register]?.name ?? LENT_NAMES.get(register) ?? register, registerHref(register, block.where)];
  return [into, ...Object.entries(block.fills ?? {}).map(([field, value]) => ['set', field, value])].map((cells) => cells.map(escapeCell).join(' | '));
}

/**
 * The plan `draw` gives a plain capture, or `undefined` where `draw` must be asked (rows of its own, figures, a
 * refusal, a cash walk, or another kind). The fence is written as `draw` writes it: the kind, the heading as the
 * field's placeholder (or the tone where there is none), then the rows.
 */
export function capturePlanOf(block: BlockResult): CapturePlan | null | undefined {
  if (block.kind !== 'capture' || block.authored?.length || block.metrics || block.refusals.length || block.walks?.length) return undefined;
  const head = `capture${block.heading ? ` | ${escapeCell(block.heading)}` : block.tone ? ` |  | ${block.tone}` : ''}`;
  const seg = parse(['```' + head, ...captureRows(block), '```'].join('\n'), { page: true }).find((s) => s.type === 'block');
  return seg?.type === 'block' ? capturePlan(seg.rows) : null;
}
