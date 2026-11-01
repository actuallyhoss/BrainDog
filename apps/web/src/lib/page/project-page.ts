/**
 * A project's declared page under its hero (proj F1, F3 and section 4): what the hero and its tiles say is not said again,
 * and what is left is folded under More about.
 *
 * LEFT OUT, by what each block is and never by its title: the page's sentence (`note lead`, the hero's next step says it),
 * every block in the rail (At a glance and Where it stands, which the hero's figures say, and Handed back, which is the Work
 * tile's With you), a series (Money by month, the Money tile's bars) and a list of runs (`seq_prefix`, Agents here today).
 * Each stays at its place, drawn no more.
 *
 * MORE ABOUT IS FOLDED SHUT: the first boxed section, `fold`, its lists first (half a row each), then its notes and what
 * changed the whole row, then the dated plan, moved in from above it and named Plan by date. Pure, so it is tested
 * without a page.
 */

import { KINDS, isKind } from 'braindog-render';
import { REGISTERS } from '../record/held.ts';
import { handFor } from '../record/hand-of.ts';

type Block = {
  kind: string;
  heading?: unknown;
  register?: string | undefined;
  area?: unknown;
  lead?: unknown;
  box?: unknown;
  fold?: unknown;
  span?: unknown;
  drawn?: boolean | undefined;
  why?: unknown;
  total?: unknown;
  key?: string | undefined;
};

/** The heading the dated plan takes inside More about. */
export const PLAN_BY_DATE = 'Plan by date';

/**
 * THE MODEL'S LINE ON A PROJECT'S LEAD (the thinking scope of 24 October), which the hero says in place of its rules'
 * line (`ProjectPart.svelte`): the lead note the record sent with the line it kept (`modelLine`, `page-live.ts`), drawn,
 * with words in it. `null` where the rules speak: no lead, a lead the rules wrote, or one not drawn.
 */
export function modelLineOf(blocks: readonly { kind: string; lead?: unknown; drawn?: boolean | undefined; modelLine?: unknown; body?: unknown }[]): string | null {
  const lead = blocks.find((b) => b.kind === 'note' && b.lead === true && b.drawn !== false);
  return lead?.modelLine === true && typeof lead.body === 'string' && lead.body.trim() !== '' ? lead.body : null;
}

/**
 * THE PROJECT'S SHAPE WHERE ITS PAGE DECLARES NONE. The shape's parts became blocks of the
 * project's page in founder 3.3.0 and team 2.25.0, and a record still on an older version, whose page declares
 * no `project` block, drew a project's page with no name, no hero and nothing of its work: blank on a phone. Such a page
 * is drawn with the blocks the current versions declare (three since founder 3.7.0 and team 2.28.0), in their order. AFTER THE DECLARED BLOCKS, so every index a write finds a block by is the block's own; the shape's parts are
 * drawn over both columns before the rest wherever they are (`PageBody.svelte` `shapeParts`).
 */
export const SHAPE_DEFAULT = [
  { kind: 'project', parts: ['hero', 'side'], heading: 'Overview', icon: 'eye', span: 12, key: 'shape-first' },
  { kind: 'project', parts: ['numbers', 'what-is-open'], heading: 'Numbers and work', icon: 'chart-line', span: 12, key: 'shape-second' },
  { kind: 'project', parts: ['dates', 'who-is-on-it', 'runs-on', 'agents-here', 'decisions', 'happened'], heading: 'Dates, people, agents and what happened', icon: 'calendar', span: 12, key: 'shape-third' },
] as const;

/** A project page's blocks with the shape's two blocks after them where it declares no part of the shape, else as they are. */
export function withShape<T extends { kind: string }>(blocks: readonly T[], make: (raw: (typeof SHAPE_DEFAULT)[number]) => T): T[] {
  return blocks.some((b) => b.kind === 'project') ? [...blocks] : [...blocks, ...SHAPE_DEFAULT.map(make)];
}

const isRuns = (register: string | undefined): boolean => !!register && (REGISTERS[register] as { seq_prefix?: unknown } | undefined)?.seq_prefix !== undefined;
const said = <T extends Block>(b: T): T => (b.drawn === false ? b : ({ ...b, drawn: false, why: 'empty' } as T));
const main = (b: Block): boolean => b.area !== 'rail';
/* THE DATED PLAN: a block over the work list (the one that says who holds its rows) that is not a checklist, found by
   what the list and the kind declare, never by the kind's name. */
const isPlan = (b: Block): boolean =>
  b.kind !== 'section' && !!b.register && handFor(REGISTERS[b.register]) !== null && isKind(b.kind) && (KINDS[b.kind] as { checkbox?: unknown }).checkbox !== true;

/** Where each part of More about goes, first to last. */
const rank = (b: Block): number => (b.kind === 'table' || b.kind === 'cards' || b.kind === 'list' ? 0 : isPlan(b) ? 3 : b.kind === 'feed' ? 2 : 1);

export function onProject<T extends Block>(blocks: readonly T[], register: string): T[] {
  const kept: T[] = blocks.map((b) => {
    if (b.kind === 'note' && b.lead === true) return said(b);
    if (!main(b)) return said(b);
    if (b.kind === 'series') return said(b);
    if (b.kind === 'cards' && (isRuns(b.register) || b.register === register)) return said(b);
    return b;
  });
  const at = kept.findIndex((b) => b.kind === 'section' && b.box === true && main(b));
  if (at === -1) return kept;
  /* THE RUN UNDER IT, up to the next section of the main column. */
  let end = at + 1;
  while (end < kept.length && !(kept[end]!.kind === 'section' && main(kept[end]!))) end++;
  const plan = kept.findIndex((b, n) => isPlan(b) && main(b) && n < at && b.drawn !== false);
  const run = kept.slice(at + 1, end);
  /* A KEY OF ITS OWN, so a look that lifts the plan to the top of the page (`look.ts` `lookOrder`) no longer finds it. */
  if (plan !== -1) run.push({ ...kept[plan]!, heading: PLAN_BY_DATE, span: 12, key: `${String(kept[plan]!.key ?? 'plan')}:by-date` });
  const ordered = run
    .map((b, n) => ({ b, n }))
    .sort((x, y) => rank(x.b) - rank(y.b) || x.n - y.n)
    .map(({ b }) => (b.kind === 'feed' || b.kind === 'note' ? ({ ...b, span: 12 } as T) : b));
  const section = { ...kept[at]!, fold: true } as T;
  /* THE PLAN LEAVES ITS OLD PLACE, so one block is drawn once and keyed once; the page is laid out from this list, and
     its writes find each block where this list puts it. */
  return [...kept.slice(0, at), section, ...ordered, ...kept.slice(end)].filter((_, n) => n !== plan);
}

/** "Bills and invoices 9 · Services 2 · Notes · Plan by date": what a folded More about holds, as its labels. */
export function moreSaid(blocks: readonly Block[]): string {
  const at = blocks.findIndex((b) => b.kind === 'section' && b.fold === true && b.box === true);
  if (at === -1) return '';
  const parts: string[] = [];
  for (let n = at + 1; n < blocks.length; n++) {
    const b = blocks[n]!;
    if (b.kind === 'section' && main(b)) break;
    if (b.drawn === false || typeof b.heading !== 'string' || b.heading.trim() === '') continue;
    const count = b.register && typeof b.total === 'number' && b.total > 0 ? ` ${b.total.toLocaleString('en-GB')}` : '';
    parts.push(`${b.heading.trim()}${count}`);
  }
  /* LABELS WITH THEIR COUNTS, read at a glance: the fold's own headings, never a sentence made of them. */
  return parts.join(' · ');
}
