/**
 * The record's widget making and drawing, for the inspector, a draft's cell and the sheet's Make your own (W4).
 *
 * `composeOn` asks `widgetCompose`: rules over the record's own things first, the model only when they cannot, and the
 * answer is a draft (`draft: { by, why, cost? }`), never written. `readOn` draws one block by `previewPage` and distills it
 * to what a widget's preview shows, so the inspector's preview is the record's own number as it changes.
 */

import { distill, type WidgetReading, type WidgetSize } from 'braindog-render';

export type Made = { block: Record<string, unknown>; size: WidgetSize; title: string; from: 'rules' | 'model'; reading: WidgetReading | null; cost?: string; sizes?: WidgetSize[] };

/** A widget made from what was said, or the record's sentence why not. `from` changes a widget; `not` is what was turned down. */
/** `draw` has the model draw it (W7, `drawWidgetAsk`) at `sizes`, rather than make it from the grammar. */
export async function composeOn(base: string, said: string, from?: Record<string, unknown>, not: readonly Record<string, unknown>[] = [], draw?: { sizes: readonly WidgetSize[] }): Promise<Made | { fix: string }> {
  try {
    const { createClient } = await import('@braindog/client');
    const out = await createClient({ base }).call<Made>('widgetCompose', { said, ...(from ? { from } : {}), ...(not.length > 0 ? { not } : {}), ...(draw ? { draw: true, sizes: [...draw.sizes] } : {}) });
    if (out.ok) return out.value;
    return { fix: 'refusal' in out ? out.refusal.fix : 'That could not be made.' };
  } catch {
    return { fix: 'BrainDog could not be reached.' };
  }
}

/** Which fields a list block's preview reads: its first column as the line, a day and an amount where it has them. */
export function rowsReadOf(block: Record<string, unknown>): { title: string; day?: string; amount?: string } | undefined {
  const cols = Array.isArray(block.columns) ? (block.columns as Record<string, unknown>[]).flatMap((c) => (typeof c.field === 'string' ? [c.field] : [])) : [];
  if (cols.length === 0) return undefined;
  const day = cols.find((f) => /^(on|by|day|from|due|as_of|in_touch)$/u.test(f));
  const amount = cols.find((f) => /amount|paid|value|total|budget|target|per_gram/u.test(f));
  const title = cols.find((f) => f !== day && f !== amount) ?? cols[0]!;
  return { title, ...(day ? { day } : {}), ...(amount ? { amount } : {}) };
}

/** One block drawn by the record and distilled for a preview, or `null` with the record's sentence when it refused. */
export async function readOn(base: string, block: Record<string, unknown>): Promise<{ reading: WidgetReading | null; fix: string | null }> {
  try {
    const { createClient } = await import('@braindog/client');
    const { draft: _d, size: _s, ...plain } = block;
    const out = await createClient({ base }).call<{ blocks?: unknown[] }>('previewPage', { body: { page: 'widget', title: 'Widget', blocks: [plain] } });
    if (!out.ok) return { reading: null, fix: 'refusal' in out ? out.refusal.fix : null };
    const drawn = Array.isArray(out.value.blocks) ? out.value.blocks[0] : null;
    const rows = rowsReadOf(plain);
    const reading = distill(rows === undefined ? { block: plain } : { block: plain, rows }, drawn);
    return { reading, fix: reading.fix ?? null };
  } catch {
    return { reading: null, fix: null };
  }
}
