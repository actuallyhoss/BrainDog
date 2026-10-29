/**
 * ADD TO TODAY, FROM ANYWHERE (the widgets plan of 29 October, §4.3): any block on any page, any Slash answer, put on
 * Today's board as a widget with one press, at the end, at the size its kind draws first, with a 6 s Undo.
 *
 * IT ALWAYS WORKS. A record whose Today is drawn from what it holds, and kept nowhere, has its Today kept on this first
 * add: the record refuses the add without a body to keep it from, and the add is sent again with Today's own body, built
 * as Home builds it (the C25 pattern). LOADED ON THE PRESS, never with a screen.
 */

import { defaultSize, isWidgetSize, nearestSize, type WidgetSize } from 'braindog-render';

import { KEPT_TODAY, unwriteBoard, writeBoard, type Wrote } from './board-write.ts';
import type { Step } from './steps.ts';

/** The words an add says. */
export const addWords = {
  addToToday: 'Add to Today',
  added: (name: string) => `${name} is on Today.`,
  addedPlain: 'Added to Today.',
  another: 'Add to another page',
} as const;

/** What a page's own declaration carries that a widget does not: its column, its width, its place in a look. */
const PAGE_ONLY = ['span', 'area', 'key', 'lead', 'drawn', 'why', 'added', 'size', 'draft'] as const;

/** A block as Today will keep it: what it reads and how it draws, at a size its kind takes. */
export function widgetOf(block: Record<string, unknown>, size?: WidgetSize): Record<string, unknown> {
  const out: Record<string, unknown> = { ...block };
  for (const k of PAGE_ONLY) delete out[k];
  const kind = String(block.kind ?? 'note');
  const want = size ?? (isWidgetSize(block.size) ? block.size : undefined);
  out.size = want ? nearestSize(kind, want) : defaultSize(kind);
  out.key = `w-${Math.random().toString(36).slice(2, 6)}`;
  return out;
}

/** Today's body as Home draws it, in the house's words, for the record to keep it from. */
async function todayBody(): Promise<Record<string, unknown> | null> {
  try {
    const [{ page }, h, d, held, parts] = await Promise.all([
      import('$app/state'),
      import('../page/home-arrange.ts'),
      import('../home/default-home.ts'),
      import('../record/held.ts'),
      import('../start/parts.ts'),
    ]);
    const shell = page.data as Parameters<typeof h.holdsOf>[0] | undefined;
    if (!shell || !Array.isArray(shell.lists)) return null;
    const week = await h.weekHeld(shell);
    const decls = shell.lists.flatMap((l) => (held.REGISTERS[l.id] ? [held.REGISTERS[l.id]!] : []));
    const people = d.peopleOf(decls as never, parts.playedBy('meets'));
    const holds = { ...h.holdsOf(shell), ...(week ? { week } : {}), ...(people ? { people } : {}) };
    const body = h.whileHeld(JSON.parse(JSON.stringify(d.todayHome(holds, h.HOUSE_VOICE))));
    return { ...body, page: KEPT_TODAY };
  } catch {
    return null;
  }
}

/**
 * Put `block` on Today, the record keeping Today first where it keeps none. Answers the write, with the Undo to offer.
 */
export async function addToToday(base: string, block: Record<string, unknown>, size?: WidgetSize): Promise<Wrote & { undo?: () => Promise<boolean> }> {
  return stepToday(base, [{ add: widgetOf(block, size), before: null }]);
}

/**
 * Steps laid on Today as it is kept (a widget added, taken off, a draft kept), with its Undo. A Today not kept yet is
 * kept from the body it is drawn from, as the editor's first Done keeps it.
 */
export async function stepToday(base: string, steps: readonly Step[]): Promise<Wrote & { undo?: () => Promise<boolean> }> {
  let out = await writeBoard(base, KEPT_TODAY, steps, null, null);
  if (out.from === 'refused' && /not kept yet/u.test(out.fix)) {
    const body = await todayBody();
    if (body) out = await writeBoard(base, KEPT_TODAY, steps, body, null);
  }
  if (out.from !== 'written') return out;
  const before = out.before;
  const own = out.own === true;
  /* A TODAY KEPT JUST NOW IS ONE THE SHELL DOES NOT KNOW YET: it reads the record again, so Today draws the kept board. */
  const known = async () => {
    if (before === null) await (await import('../page/home-arrange.ts')).reboot();
  };
  await known();
  return {
    ...out,
    undo: async () => {
      const ok = await unwriteBoard(base, KEPT_TODAY, before, undefined, own);
      await known();
      return ok;
    },
  };
}
