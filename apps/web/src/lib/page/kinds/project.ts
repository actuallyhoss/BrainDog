/**
 * A `project` block, from the record's answer: nothing in the dialect at all. It is a row of a project's own shape
 * (the kernel's `kinds/project.ts`), which `BlockSlot.svelte` draws from the project's own read (`ProjectPart.svelte`,
 * `shape-hold.svelte.ts`), so this answers no segments and no refusal, and is registered so the answer is kept whole
 * (`page-live.ts`).
 */

import type { KindDrawer } from './index.ts';

export const project: KindDrawer = {
  draw() {
    return { segments: [], refusal: null };
  },
};

/**
 * The parts of a project's shape a block draws, in its order, read off its answer or its declaration; `null` for
 * another kind. A name that is not a string is left out.
 */
export function partsOf(block: { kind: string; answer?: unknown; parts?: unknown }): string[] | null {
  if (block.kind !== 'project') return null;
  const from = (typeof block.answer === 'object' && block.answer !== null ? block.answer : block) as { parts?: unknown };
  const parts = from.parts ?? block.parts;
  return Array.isArray(parts) ? parts.filter((p): p is string => typeof p === 'string' && p !== '') : [];
}
