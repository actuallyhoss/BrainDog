/**
 * A project's shape as blocks of its page (24 October): the hero, Path and Money, Work and Who is on it, Runs
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
  /* THE PARTS OF THE PAGE OF 27 OCTOBER: the tile beside the hero by lane, its numbers, its dates, what was decided and
     what happened. Absent is nothing to draw. */
  side?: boolean;
  numbers?: boolean;
  dates?: boolean;
  decisions?: boolean;
  happened?: boolean;
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
    case 'what-is-open':
      return at(h.work, h.people ? 8 : 12);
    case 'who-is-on-it':
      return at(h.people, h.work ? 4 : 12);
    case 'runs-on':
      return at(h.runsOn, h.today ? 6 : 12);
    case 'side':
      return at(h.side === true, 4);
    case 'numbers':
      return at(h.numbers === true, 8);
    case 'dates':
      return at(h.dates === true, 6);
    case 'decisions':
      return at(h.decisions === true, 6);
    case 'happened':
      return at(h.happened === true, 12);
    case 'agents-here':
      /* DRAWN ONCE THE READ IS BACK, AND SEEN ONLY WITH SOMETHING TO SHOW: its runs are read unseen till one is on it. */
      return at(h.known, h.today && h.runsOn ? 6 : 12, h.today || h.band);
    default:
      return at(false, 12);
  }
}

/**
 * HOW WIDE EACH PART IS IN A ROW OF THE PAGE OF 27 OCTOBER, in twelfths: each part's share as the page lays it (the hero
 * at eight beside its lane's tile at four, the numbers at eight beside the work at four, the dates at six beside who is
 * on it and what it runs on at three each, the agents at six beside what was decided or what happened).
 */
const SHARE: Readonly<Record<string, number>> = { hero: 8, side: 4, numbers: 8, 'what-is-open': 4, dates: 6, 'who-is-on-it': 3, 'runs-on': 3, 'agents-here': 6, decisions: 6, happened: 6, path: 8, money: 4 };

/**
 * The parts of one block that are drawn, each with its width and the line of the block it sits on. The parts that show
 * something are laid in order, a line at a time, a part that would pass twelve starting the next line; then the shares
 * on each line are stretched to fill it, so a part whose partner has nothing takes the room it left. A part drawn unseen
 * (the agents' runs read before one is on it) takes no room, and is laid on line -1.
 */
export function rowLaid(parts: readonly string[], h: PartsHave): (PartLaid & { part: string; line: number })[] {
  const laid = parts.map((part) => ({ part, ...partLaid(part, h) })).filter((x) => x.on);
  const lines: string[][] = [];
  let used = 12;
  for (const x of laid) {
    if (!x.seen) continue;
    const share = SHARE[x.part] ?? 12;
    if (used + share > 12) {
      lines.push([]);
      used = 0;
    }
    lines.at(-1)!.push(x.part);
    used += share;
  }
  const at = new Map<string, { span: number; line: number }>();
  lines.forEach((line, n) => {
    const total = line.reduce((t, p) => t + (SHARE[p] ?? 12), 0);
    let left = 12;
    line.forEach((p, i) => {
      const span = i === line.length - 1 ? left : Math.max(1, Math.round(((SHARE[p] ?? 12) / Math.max(1, total)) * 12));
      left -= span;
      at.set(p, { span: Math.max(1, span), line: n });
    });
  });
  return laid.map((x) => (x.seen ? { ...x, ...at.get(x.part)! } : { ...x, span: 12, line: -1 }));
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

/**
 * The parts that stand in the left column beside the right one, when a page's numbers and its dates are laid together.
 * THE AGENTS UNDER THE DATES, WHAT HAPPENED UNDER WHAT IT RUNS ON (the lists review, L32): with the dates the last of
 * the left column, they grew to the work's height and left 200px of white under six dates; the agents' tile, whose box
 * to tell them goes to its foot, takes the difference instead, and the row of agents and what happened under the
 * columns is gone.
 */
export const LEFT_COLUMN: readonly string[] = ['numbers', 'dates', 'agents-here'];
export const RIGHT_COLUMN: readonly string[] = ['what-is-open', 'who-is-on-it', 'runs-on', 'happened', 'decisions'];

/**
 * THE NUMBERS AND THE DATES IN ONE COLUMN, BESIDE THE WORK AND WHAT IT RUNS ON (bento, 1 Nov): laid as two rows, three
 * figures stood over a band of 200px beside a tall Tasks, and the dates started under it. So, on a page read as it is laid
 * out (not arranged, and not a board), the parts of the next block's first line, its dates, who is on it and what it runs
 * on, join the numbers' block, which draws them as two columns (`ProjectPart.svelte`). The blocks keep their places, so a
 * write still finds each; only which parts each draws moves.
 */
export function columned<B extends Row>(blocks: readonly B[]): B[] {
  const out = [...blocks];
  const at = out.findIndex((b) => b.drawn !== false && (partsIn(b) ?? []).includes('numbers'));
  if (at < 0) return out;
  const next = out.findIndex((b, i) => i > at && b.kind === 'project' && b.drawn !== false && (partsIn(b) ?? []).includes('dates'));
  if (next < 0) return out;
  const from = partsIn(out[next]!) ?? [];
  const moves = from.filter((p) => LEFT_COLUMN.includes(p) || RIGHT_COLUMN.includes(p));
  const withParts = (b: B, parts: string[]): B => {
    const answer = typeof b.answer === 'object' && b.answer !== null ? { ...(b.answer as object), parts } : b.answer;
    return { ...b, parts, ...(answer === undefined ? {} : { answer }) } as B;
  };
  out[at] = withParts(out[at]!, [...(partsIn(out[at]!) ?? []), ...moves]);
  out[next] = withParts(out[next]!, from.filter((p) => !moves.includes(p)));
  return out;
}

