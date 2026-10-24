/**
 * TODAY'S DESK TILES AS BLOCKS OF ITS BODY (C27, 24 October): what is late, who is working and the projects were parts
 * Home drew around the page (`Desk.svelte`, `LateNow` over the board); they are blocks the page declares now
 * (`default-home.ts` `todayHome`), the record answers each, and the one reader draws each in its slot as the desk's own
 * tile (`BlockSlot.svelte` reads `desk` on the block, as it reads `homeRows`).
 *
 * WHAT HOME ADDS TO A BLOCK IS THE DESK'S WORDS FOR IT, never its rows: the late lines Needs you does not already ask
 * about, in the brief's order (`today-brief.ts`); the runs at work as Working now says them, each project in its card's
 * colour; and which list the projects are. A page kept from Today is drawn the same way wherever it holds the block.
 *
 * PURE, AND NO SVELTE, so `node --test` reads it.
 */

import type { Working } from '../record/boot-live.ts';
import type { LiveBlock } from '../record/page-live.ts';
import { REGISTERS } from '../record/held.ts';
import { agentKindOf } from '../ui/face.ts';
import { workingRows, type WorkingRow } from './desk.ts';
import type { HomeLine } from './home-rows.ts';
import { cardsOf, type CardDecl, type CardRow } from './project-cards.ts';

/** How the desk draws a block of Today's body, where it draws it as one of its own tiles. */
export type Desk =
  /** What is late, a line a thing with its button (`LateNow.svelte`). */
  | { kind: 'late'; lines: readonly HomeLine[]; heading: string; more: number; most: number }
  /** Who is working, each run with how long it has been at it (`WorkingNow.svelte`). */
  | { kind: 'working'; rows: readonly WorkingRow[] }
  /** The projects in play, as their cards with the lanes over them (`ProjectCards.svelte`). */
  | { kind: 'projects'; name: string };

/** A block as the desk draws it, `desk` set where it is one of the desk's own tiles. */
export type Desked<B> = B & { desk?: Desk };

/** Whether a block reads the runs at work, which Working now draws. */
export const isWorking = (b: Pick<LiveBlock, 'source'>): boolean => b.source === 'sessions.working';

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * THE RUNS AT WORK, AS `boot` WOULD NAME THEM, off a block of `sessions.working`: the agent, what it says it is doing,
 * and the project it is placed in by name (the cell the record said the run's scope in). A row with no number is left
 * out, since the face and the sheet are keyed by the run.
 *
 * NO LENGTH UNTIL `presence` SAYS IT (the audit of 25 October, Z6): the block knows when the run opened, and the Agents
 * page says how long this stretch has gone (`for_s`: since it opened, came back or began writing again). Today said
 * "since 22 Oct" from the one while Agents said "2 h 54 min" from the other, so the time is left out here and Working
 * now says the length `presence` gives, the same as Agents.
 */
export function runsOf(b: Pick<LiveBlock, 'entries' | 'rows' | 'columns'>): Working[] {
  const at = (b.columns ?? []).findIndex((c) => c.field === 'project');
  return (b.entries ?? []).flatMap((e, n) => {
    if (typeof e.seq !== 'number' || e.seq <= 0) return [];
    const agent = text(e.fields.agent) ?? 'other';
    const cell = at >= 0 ? b.rows?.[n]?.cells[at] : null;
    return [{ seq: e.seq, agent, kind: agentKindOf(agent), project: text(cell), doing: text(e.fields.doing), since: null, quiet: false }];
  });
}

/** The cards a block of projects draws, by the desk's own rule (`cardsOf`): live ones, a draft first, then by lane. */
export function deskCards(b: Pick<LiveBlock, 'register' | 'entries'>): ReturnType<typeof cardsOf> | null {
  const list = b.register;
  const d = list ? (REGISTERS[list] as unknown as CardDecl | undefined) : undefined;
  if (!list || !d || (d as { scopes?: unknown }).scopes === undefined) return null;
  const rows: CardRow[] = (b.entries ?? []).flatMap((e) =>
    typeof e.seq === 'number' && typeof e.fields === 'object' && e.fields !== null
      ? [{ seq: e.seq, fields: e.fields as Record<string, unknown>, ...(typeof e.id === 'string' ? { id: e.id } : {}), ...(typeof e.created === 'string' ? { created_at: e.created } : {}) }]
      : [],
  );
  return cardsOf({ ...d, id: list }, rows);
}

/** Each live project's colour by its name, which a run on it wears on its dot. */
export function huesOf(b: Pick<LiveBlock, 'register' | 'entries'> | undefined): Map<string, number | null> {
  return new Map((b ? (deskCards(b)?.cards ?? []) : []).map((c) => [c.name, c.hue] as const));
}

/**
 * TODAY'S BLOCKS WITH THE DESK'S TILES MARKED: who is working as Working now, in the colours of the projects' cards, and
 * the projects as the desk's row of cards. A block of runs or of projects with nothing in it is not drawn, so the desk
 * draws no tile for nobody, as it never did. What is late is Home's to mark (`lateDesk`), since what it shows leaves out
 * what Needs you asks about.
 */
export function desked<B extends LiveBlock>(blocks: readonly B[], now: number, named: (register: string) => string): Desked<B>[] {
  const projects = blocks.find((b) => b.drawn && deskCards(b) !== null && b.kind === 'cards' && b.key === 'projects');
  const hues = huesOf(projects);
  return blocks.map((b): Desked<B> => {
    if (!b.drawn) return b;
    if (isWorking(b) && b.key === 'working') {
      const rows = workingRows(runsOf(b), hues, now);
      return rows.length === 0 ? { ...b, drawn: false } : { ...b, desk: { kind: 'working', rows } };
    }
    if (b === projects) {
      const cards = deskCards(b);
      return !cards || cards.cards.length === 0 ? { ...b, drawn: false } : { ...b, desk: { kind: 'projects', name: named(b.register ?? '') } };
    }
    return b;
  });
}
