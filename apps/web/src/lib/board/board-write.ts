/**
 * A BOARD'S EDITS, WRITTEN (the widgets plan of 29 October, §5.5 and §7.3): the steps the editor made, sent once to the
 * record's `boardSteps`, which lays them on the page as it stands and writes one version. A Today the record does not
 * keep yet is kept from the body it is drawn from (`base`) on its first edit, so Done and Add to Today work on every
 * record. Undo puts back the body the record answered as `before`, or, where there was none, lets Today go back to
 * being drawn from what the record holds.
 */

import { createClient } from '@braindog/client';

import type { Fetch as ClientFetch } from '../record/pages-live.ts';

import { copy } from '../copy.ts';
import type { Step } from './steps.ts';

/** The slug Today is kept under (`home-arrange.ts` `KEPT_AS`). */
export const KEPT_TODAY = 'home';

/** `own`: written as the reader's own Today (a member's, W8), which Undo puts back through `boardSteps`' `put`. */
export type Wrote = { from: 'written'; version: number | null; before: Record<string, unknown> | null; own?: true } | { from: 'refused' | 'unreachable'; fix: string };

/** Send `steps` for `page`, with the body to keep it from where the record keeps none yet. */
export async function writeBoard(base: string, page: string, steps: readonly Step[], body: Record<string, unknown> | null, version: number | null, io?: ClientFetch): Promise<Wrote> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<{ version?: unknown; before?: unknown; own?: unknown }>('boardSteps', {
    page,
    steps,
    ...(version !== null ? { version } : {}),
    ...(body ? { base: body } : {}),
  });
  if (out.ok) {
    const v = out.value?.version;
    const b = out.value?.before;
    return { from: 'written', version: typeof v === 'number' ? v : null, before: b !== null && typeof b === 'object' ? (b as Record<string, unknown>) : null, ...(out.value?.own === true ? { own: true as const } : {}) };
  }
  if (!('refusal' in out)) return { from: 'unreachable', fix: copy.recordNotReached };
  if (out.refusal.code === 'UNREACHABLE') return { from: 'unreachable', fix: copy.recordNotReached };
  return { from: 'refused', fix: out.refusal.fix };
}

/**
 * Undo a write: the body before it set back, or the kept page retired where Today was not kept before. A member's own
 * Today (`own`) is put back through `boardSteps`, since the page a member arranges is theirs and no declaration.
 */
export async function unwriteBoard(base: string, page: string, before: Record<string, unknown> | null, io?: ClientFetch, own = false): Promise<boolean> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  if (own) return (await client.call('boardSteps', { page, put: before })).ok;
  if (before === null) return (await client.call('retireDeclaration', { id: `page.${page}` })).ok;
  /* `page` FIRST: a declaration is read by its first key, and the record keeps a body with its keys in order. */
  const { pack: _pack, ...rest } = before;
  const body = { page: rest.page, ...rest };
  return (await client.call('setDeclaration', { body })).ok;
}
