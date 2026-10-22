/**
 * Which questions arrange the record: a pack, a settings change or a whole arrangement, by what was filed.
 *
 * ITS OWN FILE, because a page's queue asks it of every question to know which to leave unfolded (`lib/page/batch.ts`),
 * and that queue is on Today's first open. Asked of `arranged.ts`, the answer came with the whole story an arrangement
 * is drawn as, the flow and the kernel's decision rules behind it. `arranged.ts` exports these again.
 */

export const ARRANGING = ['pack', 'settings', 'arrange'] as const;
export const isArranging = (kind: string | undefined): boolean => (ARRANGING as readonly string[]).includes(kind ?? '');
