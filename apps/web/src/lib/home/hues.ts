/**
 * Colours, on Home: the record's `huesWanted` as one quiet tile at the board's end (`Hues.svelte`). PGS-A06 step 5 on
 * the screen: the rows of a list that declares a colour and holds none of their own, counted and named ("6 projects
 * have no colour of their own"), and one press that gives them theirs (`giveHues`), each once, with one Undo.
 *
 * THROUGH THE RECORD'S OWN `huesWanted` AND NOTHING ELSE. The record says each list (`{ list, name, count, names }`,
 * `packages/record/src/methods/hues.ts`; `title` is read where `name` is not, as the scope first wrote it);
 * this file only keeps what a person can read. `list` is a handle the press is sent and is never drawn; a list with no
 * handle, no title or nobody wanting is dropped, and a name that is a raw id (a ULID) is never said.
 *
 * AN OFFER AND NEVER A WRITE OF ITS OWN: `give` writes only when he presses, and the hue each row takes is the theme's,
 * chosen by the record (`nextAccentHue`), never by this screen.
 *
 * IT NEVER FAILS THE SCREEN. A host built before the read answers `ROUTE_UNKNOWN` or `NOT_IN_THIS_BUILD`, a reader it
 * refuses answers a refusal, and an answer of another shape is none: each is `null`, and `null` draws nothing.
 *
 * A ROUTE-ONLY MODULE, like `named-twice.ts`: the client carries the route table as a value, so this is imported lazily
 * from the screen that draws it and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import type { Fetch } from '../record/boot-live.ts';
import { inSentence, singularOf } from '../voice.ts';

/** How many names the tile says of one list. The rest are counted ("and 3 more"). */
export const HUES_SHOWN = 4;

/** One list whose rows want a colour: its handle (never drawn), its name as the record names it, how many, and who. */
export type HueList = { list: string; title: string; count: number; names: string[] };

/** What the tile draws: every list that has rows wanting a colour. */
export type HuesFound = { lists: HueList[] };

/** How the screen asks the record: a client's `call`, or anything shaped like it. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * What a press answered: how many took a colour, the batch Undo takes (`''` where the record sent none, which draws no
 * Undo), and `said`, the line the screen says; or the record's own sentence for why nothing was given.
 */
export type Given = { ok: true; given: number; batch: string; said: string } | { ok: false; fix: string };

/** The words of the tile, the same on every record. */
export const huesWords = {
  give: 'Give them colours',
  giveOne: 'Give it a colour',
  undo: 'Undo',
} as const;

/** A raw id as the record mints one. Never a name a person reads. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** Trimmed text, with no em dash in what a person reads: the record's own words, said plainly. */
const plain = (v: unknown): string => (typeof v === 'string' ? v.replaceAll(/\s*—\s*/gu, ', ').trim() : '');

/** One list the screen can say, or `null`: one with no handle, no title, or nobody wanting a colour. */
function listOf(v: unknown): HueList | null {
  if (typeof v !== 'object' || v === null) return null;
  const l = v as { list?: unknown; name?: unknown; title?: unknown; count?: unknown; names?: unknown };
  const list = typeof l.list === 'string' ? l.list.trim() : '';
  /* THE LIST'S NAME AS THE RECORD SAYS IT (`name`); `title` only where a record answers in the scope's first word. */
  const title = plain(l.name) || plain(l.title);
  if (list === '' || title === '' || ULID.test(title)) return null;
  const names = (Array.isArray(l.names) ? l.names : []).map(plain).filter((n) => n !== '' && !ULID.test(n));
  const said = typeof l.count === 'number' && Number.isInteger(l.count) && l.count > 0 ? l.count : 0;
  /* THE COUNT IS NEVER FEWER THAN THE NAMES IT CAME WITH, so "and 3 more" never goes below nought. */
  const count = Math.max(said, names.length);
  if (count === 0) return null;
  return { list, title, count, names };
}

/** The record's answer as the lists the tile holds, or `null`. A REFUSAL IS NOTHING, and so is no list of lists. */
export function huesOf(answer: unknown): HuesFound | null {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true || typeof a.value !== 'object' || a.value === null) return null;
  const v = a.value as { lists?: unknown };
  if (!Array.isArray(v.lists)) return null;
  const lists = v.lists.map(listOf).filter((l): l is HueList => l !== null);
  return lists.length === 0 ? null : { lists };
}

/** The tile's sentence for one list: "6 projects have no colour of their own", "1 project has no colour of its own". */
export function huesSaid(list: Pick<HueList, 'title' | 'count'>): string {
  return list.count === 1 ? `1 ${singularOf(list.title)} has no colour of its own` : `${String(list.count)} ${inSentence(list.title)} have no colour of their own`;
}

/** The first names under it: "Crumb.gg, Lantern and Quill", or "Crumb.gg, Lantern, Quill, Otterbay and 2 more". */
export function namesSaid(list: Pick<HueList, 'names' | 'count'>): string {
  const shown = list.names.slice(0, HUES_SHOWN);
  if (shown.length === 0) return '';
  const rest = list.count - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${String(rest)} more`;
  return shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)!}`;
}

/** What a press says it did: "Gave 6 colours.", "Gave 1 colour.", or that there was nothing left to give one to. */
export function givenSaid(given: number): string {
  if (given === 0) return 'There was nothing left to give a colour to.';
  return given === 1 ? 'Gave 1 colour.' : `Gave ${String(given)} colours.`;
}

/** Ask the record's `huesWanted`. `null` on a refusal, a method the host does not know, nought, or a call that threw. */
export async function readHues(call: Call): Promise<HuesFound | null> {
  try {
    return huesOf(await call('huesWanted', {}));
  } catch {
    return null;
  }
}

/** The lists at `base` whose rows want a colour, as the tile. `null` for none, which draws nothing. */
export async function loadHues(base: string, io?: Fetch): Promise<HuesFound | null> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return await readHues((name, args) => client.call(name, args));
  } catch {
    return null;
  }
}

/**
 * HIS PRESS, AND ONLY HIS: give the rows of one list that have no colour theirs, each once. How many and the batch on
 * success; on a refusal the record's own sentence; on anything else the plain one that nothing was saved.
 */
export async function giveThrough(call: Call, list: string): Promise<Given> {
  try {
    const out = (await call('giveHues', { list })) as { ok?: unknown; value?: unknown; refusal?: unknown } | null | undefined;
    if (out?.ok === true) {
      /* THE RECORD ANSWERS `gave` (and `batch: null` when nothing was given); `given` only where it answers the scope's word. */
      const v = out.value as { gave?: unknown; given?: unknown; batch?: unknown } | null | undefined;
      const given = v?.gave ?? v?.given;
      if (typeof given !== 'number' || !Number.isInteger(given) || given < 0) return { ok: false, fix: copy.recordNotReached };
      const batch = typeof v?.batch === 'string' ? v.batch.trim() : '';
      return { ok: true, given, batch: given === 0 ? '' : batch, said: givenSaid(given) };
    }
    const fix = plain((out?.refusal as { fix?: unknown } | null | undefined)?.fix);
    return { ok: false, fix: fix === '' ? copy.recordNotReached : fix };
  } catch {
    return { ok: false, fix: copy.recordNotReached };
  }
}

/** The same press through the record at `base`, for the tile. */
export async function give(base: string, list: string, io?: Fetch): Promise<Given> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return await giveThrough((name, args) => client.call(name, args), list);
  } catch {
    return { ok: false, fix: copy.recordNotReached };
  }
}
