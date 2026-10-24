/**
 * A project's shape as blocks of its page (C28, C29, 24 October): the hero, Path and Money, Work and Who is on it, Runs
 * on and the agents on it were drawn by hand over the page's declared blocks (`ProjectShape.svelte`, gone); the page
 * declares each row now (`{ kind: project, parts: [path, money] }`, the portfolio project template), and this says,
 * once the project is read, which parts have something to draw and how wide each is in its row.
 *
 * THE ROWS AS THE SHAPE LAID THEM, from 1100px: Path at eight twelfths beside Money at four, Work at eight beside Who is
 * on it at four, Runs on beside Agents here today at half each, and the band of who is working here now across the row
 * under what it runs on. A part whose partner has nothing takes the whole row, as it did. Under 1100px they stack
 * (`ProjectPart.svelte`).
 *
 * A ROW WITH NOTHING TO DRAW IS MARKED SO, `drawn: false` and `why: empty`, as a block whose rows went is, so arranging
 * still draws it. One whose only part is the agents' runs read unseen is drawn, and takes no room. Before the read is back only the hero's row is drawn, and it holds the screen while it waits.
 *
 * PURE, AND NO SVELTE, so `node --test` reads it.
 */

import { monthsDrawn, type Months, type Trend } from '../record/visuals.ts';

/** What the project's read says each part has (`shape-hold.svelte.ts`). */
export type PartsHave = {
  /** The hero is drawn, or it holds the screen while the read is out. */
  hero: boolean;
  path: boolean;
  money: boolean;
  work: boolean;
  people: boolean;
  runsOn: boolean;
  /** Agents here today stands on its own, beside Runs on. */
  today: boolean;
  /** The band of who is working here now, or the box to tell agents on it, across the row. */
  band: boolean;
  /** The read is back: the agents part is drawn, even unseen, so it hears when a run arrives. */
  known: boolean;
};

/** Whether a part is drawn, how wide it is in twelfths of its row, and whether it shows anything at all. */
export type PartLaid = { on: boolean; span: number; seen: boolean };

/** How one part is laid, by what the read has. */
export function partLaid(part: string, h: PartsHave): PartLaid {
  const at = (on: boolean, span: number, seen = on): PartLaid => ({ on, span, seen });
  switch (part) {
    case 'hero':
      return at(h.hero, 12);
    case 'path':
      return at(h.path, h.money ? 8 : 12);
    case 'money':
      return at(h.money, h.path ? 4 : 12);
    case 'work':
      return at(h.work, h.people ? 8 : 12);
    case 'people':
      return at(h.people, h.work ? 4 : 12);
    case 'runs-on':
      return at(h.runsOn, h.today ? 6 : 12);
    case 'agents':
      /* DRAWN ONCE THE READ IS BACK, AND SEEN ONLY WITH SOMETHING TO SHOW: its runs are read unseen till one is on it. */
      return at(h.known, h.today && h.runsOn ? 6 : 12, h.today || h.band);
    default:
      return at(false, 12);
  }
}

type Row = { kind: string; drawn?: boolean | undefined; why?: unknown; parts?: unknown; answer?: unknown };

const partsIn = (b: Row): string[] | null => {
  if (b.kind !== 'project') return null;
  const from = (typeof b.answer === 'object' && b.answer !== null ? b.answer : b) as { parts?: unknown };
  const parts = from.parts ?? b.parts;
  return Array.isArray(parts) ? parts.filter((p): p is string => typeof p === 'string') : [];
};

/**
 * The page's blocks with each row of the shape drawn where one of its parts shows something, and left out where none
 * does or the page is about no project (`have` is `null`). Every other block is handed back as it came, and a block
 * whose `when:` said no stays so.
 */
export function partsLaid<B extends Row>(blocks: readonly B[], have: PartsHave | null): B[] {
  return blocks.map((b) => {
    const parts = partsIn(b);
    if (parts === null || b.drawn === false) return b;
    /* A ROW WHOSE ONLY PART READS UNSEEN IS STILL DRAWN, and takes no room on the board (`ProjectPart.svelte`). */
    const on = have !== null && parts.some((p) => partLaid(p, have).on);
    return on ? b : ({ ...b, drawn: false, why: 'empty' } as B);
  });
}

/**
 * Whether the Money part has anything to say: a figure of this month's money, what it earned this period, the months
 * as bars, or a total since money first moved on it (`ProjectVisuals.svelte` draws it).
 */
export function moneyShown(money: readonly unknown[], trend: Trend | null, inByMonth: Months | null, outByMonth: Months | null): boolean {
  const total = (m: Months | null): number => m?.total ?? 0;
  return money.length > 0 || (trend !== null && trend.now > 0) || monthsDrawn(inByMonth) || monthsDrawn(outByMonth) || total(inByMonth) > 0 || total(outByMonth) > 0;
}
