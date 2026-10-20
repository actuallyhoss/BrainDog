/**
 * A use case's Home drawn small, for its card on browse (the UI pass of 20 October, agents F9): four of its Home's
 * tiles, each its heading and a shape for its kind, and the glyph the use case is known by.
 *
 * A PICTURE, NOT AN OUTLINE. The card used to list the Home's headings as lines of text in a grey box, so thirteen cards
 * were thirteen boxes of text. Each tile here says what kind of thing it holds by its shape: bars for a list, a column
 * chart for figures, columns for a board, a grid of days for a calendar, two lines for a note.
 *
 * A USE CASE THAT KEEPS THE HOUSE HOME draws its own lists instead, each as a list tile, so the card still shows what it
 * brings and never says "The house Home".
 *
 * PURE, so `node --test` holds it. The heading a voice key stands for is the caller's to say (`$lib/voice.ts`).
 */

import type { UseCase } from '@braindog/declare';

export type Shape = 'list' | 'figure' | 'board' | 'calendar' | 'note';

export type MiniTile = { title: string; shape: Shape };

export type Mini = { tiles: MiniTile[]; glyph: string | null };

type Body = Record<string, unknown>;

const SHAPES: Readonly<Record<string, Shape>> = {
  stat: 'figure',
  figure: 'figure',
  progress: 'figure',
  series: 'figure',
  forecast: 'figure',
  split: 'figure',
  bar: 'figure',
  ring: 'figure',
  board: 'board',
  lanes: 'board',
  calendar: 'calendar',
  heat: 'calendar',
  note: 'note',
  capture: 'note',
};

const PLACEHOLDER = /^\{\{config:voice_([a-z_]+)\}\}$/u;

/** The kind of a block drawn as a shape: anything that is rows is a list. */
export const shapeOf = (kind: unknown): Shape => (typeof kind === 'string' ? (SHAPES[kind] ?? 'list') : 'list');

/**
 * Up to `most` tiles of the use case's Home, or of its lists when it has no Home of its own, and its glyph: its Home's
 * own icon, else its first list's. `voiced` says a heading written as a voice key, or `null` to leave that tile out.
 */
export function miniOf(u: UseCase, voiced: (key: string) => string | null, most = 4): Mini {
  const declarations = ((u.pack?.declarations ?? []) as Body[]).filter((d) => typeof d === 'object' && d !== null);
  const home = declarations.find((d) => d.page === `home-${u.usecase}`);
  const lists = declarations.filter((d) => typeof d.register === 'string');
  const firstListIcon = lists.map((d) => d.icon).find((i): i is string => typeof i === 'string') ?? null;
  const tiles: MiniTile[] = [];
  if (home && Array.isArray(home.blocks)) {
    for (const block of home.blocks as Body[]) {
      if (tiles.length >= most) break;
      if (typeof block?.heading !== 'string') continue;
      const m = PLACEHOLDER.exec(block.heading);
      const title = m ? voiced(m[1]!) : block.heading;
      if (title) tiles.push({ title, shape: shapeOf(block.kind) });
    }
  }
  if (tiles.length === 0)
    for (const d of lists.slice(0, most)) {
      const title = (u.labels as Record<string, string> | undefined)?.[d.register as string] ?? (typeof d.name === 'string' ? d.name : null);
      if (title) tiles.push({ title, shape: 'list' });
    }
  const homeIcon = typeof home?.icon === 'string' && home.icon !== 'home' ? home.icon : null;
  return { tiles, glyph: homeIcon ?? firstListIcon };
}
