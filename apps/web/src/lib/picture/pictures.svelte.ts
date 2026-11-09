/**
 * What this tab knows of pictures beyond the rows a screen holds: a picture it just wrote, and each person's face by
 * their name.
 *
 * A PICTURE WRITTEN HERE IS DRAWN AT ONCE, EVERYWHERE. The changer writes one row, and the sidebar, the board, the
 * project's page and the panel each read their own rows; until each has read again the row as it was is what they
 * hold. So the write is kept here by row (`things#3`) for a little while, and every drawer of that row asks `pictureNow`
 * before what its own read said. Kept for `HELD_MS`, by when every screen has read the record again.
 *
 * A PERSON IS DRAWN BY NAME IN MOST PLACES: a line in a log, who a question is from, who shares a list. None of those
 * holds the person's row, so the faces are learnt by name from every people row this tab reads (`refMapOf`), and once
 * a tab from the one light read `faces-read.ts` makes: each person's name and picture, and only those holding one.
 * A NAME TWO PEOPLE SHARE WITH TWO PICTURES draws neither, since a face that may be the other person's is worse than a
 * letter.
 *
 * AND AN ORGANISATION ON ITS PAYMENTS (People 4.8.0, the payee logos Cash Fish shows): a ledger line names who was paid
 * as the bank wrote it and holds no organisation's row, so each organisation's logo is learnt the same way, by its
 * name and by every bank line it was met by (its `bank:` keys, `rule.meet-payees`), and a line is drawn with the logo
 * of the organisation its payee names (`logoOf`).
 */

import { SvelteMap } from 'svelte/reactivity';
import { timelineTitle } from 'braindog-render';

import { REGISTERS } from '../record/held.ts';
import { pictureFieldOf, pictureOf } from './picture.ts';

/** How long a picture written here outranks what a screen's own read says. */
export const HELD_MS = 30_000;

/** A picture this tab wrote, by row: a hash, or `null` for one taken off. */
const NOW = new SvelteMap<string, string | null>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** The picture a row is drawn by: what this tab just wrote to it, else what the screen's read holds. */
export function pictureNow(row: string, held: string | null | undefined): string | null {
  return NOW.has(row) ? (NOW.get(row) ?? null) : (held ?? null);
}

/** Holds a picture this tab wrote to `row` (or `null`, one taken off), until every screen has read it again. */
export function holdPicture(row: string, sha: string | null): void {
  NOW.set(row, sha);
  clearTimeout(timers.get(row));
  timers.set(
    row,
    setTimeout(() => {
      NOW.delete(row);
      timers.delete(row);
    }, HELD_MS),
  );
}

/** Lets go of what this tab held for `row`: the write it was for was refused. */
export function dropPicture(row: string): void {
  clearTimeout(timers.get(row));
  timers.delete(row);
  NOW.delete(row);
}

/* ── faces and logos by name ──────────────────────────────────────────── */

/** A person's name as a face is looked up by: trimmed, one space between words, in one case. */
export const nameKey = (name: string): string => name.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

/** Each person's picture by name; `''` where two people of one name hold two pictures. */
const FACES = new SvelteMap<string, string>();
/** Each organisation's logo by its name and the bank lines it was met by; `''` where two of one name hold two. */
const LOGOS = new SvelteMap<string, string>();

/** The face a person is drawn with, by their name, or `null` for their letter. */
export function faceOf(name: string): string | null {
  const said = FACES.get(nameKey(name));
  return said === undefined || said === '' ? null : said;
}

/**
 * The keys an organisation's name or a payee is looked up by: as written, and as the Ledger says a bank's line
 * (`timelineTitle`), so "GEIDEA*CHILLOUT" and "Geidea Chillout" are one name. A cell that is one link is its words.
 */
function payeeKeys(name: string): string[] {
  const bare = name.trim().replace(/^\[([^\]]*)\]\([^)]*\)$/u, '$1');
  if (bare === '') return [];
  const one = nameKey(bare);
  const said = nameKey(timelineTitle(bare));
  return said === '' || said === one ? [one] : [one, said];
}

/** The logo of the organisation a payment was with, by its payee as the line holds it, or `null` for its chip. */
export function logoOf(payee: string): string | null {
  for (const key of payeeKeys(payee)) {
    const said = LOGOS.get(key);
    if (said !== undefined) return said === '' ? null : said;
  }
  return null;
}

/** The picture a row of `register` is known by from its name alone: a person's face or an organisation's logo. */
export function pictureByName(register: string, name: string): string | null {
  const kept = keptBy(register);
  if (kept === null) return null;
  return kept.held === FACES ? faceOf(name) : (payeeKeys(name).map((k) => LOGOS.get(k)).find((s) => s !== undefined) || null);
}

/**
 * Where a list's pictures are kept by name, and what of its rows the light read asks: people's as faces, by `meets:`,
 * organisations' as logos, by `org:`, with the keys they were met by. `null` for any other list.
 */
export function keptBy(register: string): { held: SvelteMap<string, string>; title: string; field: string; merged: string | undefined; keys: string | undefined } | null {
  const decl = REGISTERS[register];
  const field = pictureFieldOf(register);
  if (!decl || field === null) return null;
  if (decl.meets) return { held: FACES, title: decl.title, field, merged: decl.meets.merged_into, keys: undefined };
  if (decl.org) return { held: LOGOS, title: decl.title, field, merged: decl.org.merged_into, keys: decl.org.keys };
  return null;
}

/** The people lists this tab knows: a list whose rows meet people and that names a picture field. */
export function faceLists(): string[] {
  return Object.keys(REGISTERS).filter((id) => keptBy(id)?.held === FACES);
}

/** The organisation lists this tab knows that name a picture field. */
export function logoLists(): string[] {
  return Object.keys(REGISTERS).filter((id) => keptBy(id)?.held === LOGOS);
}

/**
 * What a read of `register`'s rows says of each face or logo, by name. A list that keeps neither is passed over. A row
 * with no picture says nothing, since a read of a few fields leaves the picture out as a row without one does; `whole`
 * says the read held every row with a picture (`faces-read.ts`), so a name it did not answer has none, and a picture
 * taken off goes from every face at that read. A row folded into another by a merge is the other row's.
 */
export function learnFaces(register: string, rows: readonly { fields?: Readonly<Record<string, unknown>> | undefined }[], whole = false): void {
  const kept = keptBy(register);
  if (kept === null) return;
  const { held, title, field, merged, keys } = kept;
  /* BY NAME, '' FOR NO PICTURE: two rows of one name agree, or the name stands for nobody (`TWO`). */
  const seen = new Map<string, string>();
  const see = (key: string, sha: string) => {
    const before = seen.get(key);
    seen.set(key, before === undefined || before === sha ? sha : TWO);
  };
  for (const r of rows) {
    const name = r.fields?.[title];
    if (typeof name !== 'string' || name.trim() === '') continue;
    if (merged && r.fields?.[merged] !== undefined && r.fields?.[merged] !== null && r.fields?.[merged] !== '') continue;
    const sha = pictureOf(r.fields?.[field]) ?? '';
    if (sha === '' && !whole) continue;
    if (held === FACES) {
      see(nameKey(name), sha);
      continue;
    }
    /* AN ORGANISATION BY ITS NAME AND BY EACH BANK LINE IT WAS MET BY, which is what its payments say. */
    for (const key of payeeKeys(name)) see(key, sha);
    const known = keys ? r.fields?.[keys] : undefined;
    if (Array.isArray(known)) for (const k of known) if (typeof k === 'string' && k.startsWith('bank:')) for (const key of payeeKeys(k.slice(5))) see(key, sha);
  }
  if (whole) for (const key of held.keys()) if (!seen.has(key)) held.delete(key);
  for (const [key, sha] of seen) {
    if (sha === TWO) held.set(key, '');
    else if (sha === '') held.delete(key);
    else if (held.get(key) !== sha) held.set(key, sha);
  }
}

/** Two people of one name who are not drawn alike. */
const TWO = '\u0000';

/** A picture this tab just wrote, or took off (`null`), drawn on every face or payment of that name at once. */
export function faceWritten(register: string, name: string, sha: string | null): void {
  const kept = keptBy(register);
  if (kept === null || name.trim() === '') return;
  for (const key of kept.held === FACES ? [nameKey(name)] : payeeKeys(name)) {
    if (sha === null) kept.held.delete(key);
    else kept.held.set(key, sha);
  }
}

/* ── the one light read ────────────────────────────────────────────────── */

/** How long the faces read stands before a face drawn later asks again. */
const FACES_HELD_MS = 300_000;

/**
 * The read of `lists()`, asked by the first face or payment drawn and again by one drawn once it is older than
 * `FACES_HELD_MS`. Nothing is asked until this tab knows such a list that keeps pictures, so a record with none is
 * never asked.
 */
function asking(lists: () => string[]): () => void {
  let at = 0;
  let out = false;
  return () => {
    if (out || (at !== 0 && Date.now() - at < FACES_HELD_MS)) return;
    const these = lists();
    if (these.length === 0) return;
    out = true;
    at = Date.now();
    void import('./faces-read.ts')
      .then((m) => m.readFaces(these))
      .catch(() => undefined)
      .finally(() => (out = false));
  };
}

/** Everybody's face, read once a while for the faces drawn by name. */
export const wantFaces = asking(faceLists);
/** Every organisation's logo, read once a while for the payments drawn by their payee. */
export const wantLogos = asking(logoLists);
