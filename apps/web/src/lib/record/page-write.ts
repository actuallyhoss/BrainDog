/**
 * A declared page's gestures against the record: a card moved to another column of a board, a task ticked, and the page
 * itself arranged.
 *
 * A ROUTE-ONLY MODULE, loaded by `/p/<slug>` when one of the two happens. ONLY A LIVE PAGE CALLS THIS: the sample says
 * `cardMovedTo` and `taskTicked` as it always did.
 *
 * THE ROW IS NAMED BY WHAT THE PAGE ANSWER CARRIED: its register, its number and the version it was read at, handed down
 * through the renderer's row as `ref`. The change is an `update` at that version, so a card somebody else moved first is
 * a conflict and never a silent overwrite.
 *
 * WHAT CHANGES IS THE DECLARATION'S TO SAY. A board's columns are its first column's field, drawn in the screen's
 * spelling, so the column a card lands in goes back to the declared value. A task's tick is its register's state: done
 * is the first terminal state, and not done is the first state that is not terminal.
 */

import { createClient } from '@braindog/client';
import type { Row, RowRef } from 'braindog-render';

import { copy } from '../copy.ts';
import { writeLook } from '../page/look.ts';
import { lookOfArrangement, lookUndo, type Laid, type LookUndo } from './arrange-look.ts';
import { REGISTERS } from './held.ts';
import type { LiveLook } from './page-live.ts';
import { pagesReader, type BlockBody, type Fetch as ClientFetch, type PageBody } from './pages-live.ts';
import { declaredValue } from './where.ts';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * `version` IS THE ONE THE WRITE MADE, when the record says it. Put back is sent at it: a row the re-read no longer
 * carries has nothing else to name its version by, and the version the page read it at is now a conflict.
 */
export type Updated =
  | { from: 'written'; version?: number }
  | { from: 'refused'; fix: string }
  | { from: 'conflict'; fix: string }
  | { from: 'unreachable'; fix: string };

/**
 * What a patch needs to know about a register: its state field, which states are terminal, and each field's values.
 *
 * THE RECORD'S OWN DECLARATION, read with `schema`, and the built-in one only when there is none. A pack installed on the
 * record declares registers this build has never heard of, and a board or a checklist over one of those was a gesture
 * that answered "no state to say it with" about a register that has one.
 */
export type Declared = {
  state?: string | undefined;
  done?: readonly string[] | undefined;
  fields: readonly { id: string; values?: readonly string[] | undefined; default?: unknown }[];
};

const norm = (v: string): string => v.toLowerCase().replace(/_/g, ' ').trim();

/** The patch that puts a card in the column `to`, which is drawn as the screen spells it. */
export function movePatch(ref: RowRef, field: string, to: string, decl?: Declared | null): Record<string, unknown> {
  if (!decl) return { [field]: declaredValue(ref.register, field, to) };
  const values = decl.fields.find((f) => f.id === field)?.values;
  return { [field]: values?.find((v) => norm(v) === norm(to)) ?? to };
}

/**
 * The patch that marks a task done or not done, or `null` when its register declares no state to say it with.
 *
 * NOT DONE IS THE STATE A NEW ROW STARTS IN, and only when the register names none is it the first that is not
 * terminal. `tasks` lists `backlog` first so that the Board draws Later as its first column, and its `default` is
 * `open`. Taking the first in the list, an un-ticked task was sent to `backlog`, which on Work's Overview took it off
 * Today and out of the Open figure and put it under Later. A default is used only when it is one of the field's own
 * values and is not terminal, because a default of `done` would make un-ticking a second tick.
 */
export function tickPatch(ref: RowRef, done: boolean, declared?: Declared | null): Record<string, unknown> | null {
  const decl = declared ?? REGISTERS[ref.register];
  const field = decl?.state;
  if (!decl || !field) return null;
  const terminal = decl.done ?? [];
  const spec = decl.fields.find((f) => f.id === field);
  const values = spec?.values ?? [];
  const started = typeof spec?.default === 'string' && values.includes(spec.default) && !terminal.includes(spec.default) ? spec.default : undefined;
  const value = done ? terminal[0] : (started ?? values.find((v) => !terminal.includes(v)));
  return value === undefined ? null : { [field]: value };
}

const fetched: Fetch = (url, init) => fetch(url, init);

const isDeclared = (v: unknown): v is Declared =>
  typeof v === 'object' && v !== null && Array.isArray((v as { fields?: unknown }).fields);

/**
 * A register's declaration as the record holds it, or `null` when the record will not say.
 *
 * KEPT PER TAB AND PER REGISTER, because a board is moved many times and its register does not change between moves.
 */
const declared = new Map<string, Promise<Declared | null>>();
export function schemaOf(base: string, register: string, io?: ClientFetch): Promise<Declared | null> {
  const key = `${base} ${register}`;
  let held = declared.get(key);
  if (!held) {
    held = createClient({ base, ...(io ? { fetch: io } : {}) })
      .schema(register)
      .then((out) => (out.ok && isDeclared(out.value) ? out.value : null))
      .catch(() => null);
    /* A REFUSAL IS NOT KEPT, so a record that could not answer once is asked again on the next gesture. */
    void held.then((d) => d === null && declared.delete(key));
    declared.set(key, held);
  }
  return held;
}

/** One row's change, at the version the page read it at. `title` is what a conflict's sentence calls the row. */
export async function updateRow(base: string, ref: RowRef, patch: Record<string, unknown>, title: string, io: Fetch = fetched): Promise<Updated> {
  let res: Response;
  try {
    res = await io(`${base}/api/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ register: ref.register, seq: ref.seq, patch, version: ref.version }),
    });
  } catch {
    return { from: 'unreachable', fix: copy.recordNotReached };
  }
  if (res.status === 401) return { from: 'refused', fix: copy.signInAgain };
  const said: unknown = await res.json().catch(() => undefined);
  if (typeof said !== 'object' || said === null || !('ok' in said)) return { from: 'unreachable', fix: copy.recordNotReached };
  if ((said as { ok: unknown }).ok === true) {
    const made = (said as { value?: { version?: unknown } }).value?.version;
    return Number.isInteger(made) ? { from: 'written', version: made as number } : { from: 'written' };
  }

  const refusal = (said as { refusal?: { code?: unknown; fix?: unknown } }).refusal;
  /* A CONFLICT CARRIES NO REFUSAL, and a stale version is the same fact said as one. */
  if ('conflict' in said || refusal?.code === 'VERSION_STALE') return { from: 'conflict', fix: copy.pageRowConflict(title) };
  if (refusal?.code === 'UNREACHABLE') return { from: 'unreachable', fix: copy.recordNotReached };
  return { from: 'refused', fix: typeof refusal?.fix === 'string' && refusal.fix !== '' ? refusal.fix : copy.recordNotReached };
}

/* ── a ticked task and a moved card stay where they were ─────────────────── */

/**
 * The receipt's words. Past tense with the row named, as `toast.svelte.ts` asks, and never a claim beyond the write that
 * landed. Kept here beside the write rather than in `copy.ts`.
 */
export const words = {
  ticked: (title: string, done: boolean) => `Marked ${title} ${done ? 'done' : 'not done'}.`,
  moved: (title: string, to: string) => `Moved ${title} to ${to}.`,
};

/** Which row a drawn row is, by what the page answer named it with. A page's rows carry no other identity. */
export const rowKey = (ref: RowRef): string => `${ref.register}#${ref.seq}`;

/**
 * What happened to a held row: the tick it now wears, or the column it now sits in as the screen spells it, and the
 * version the write answered with when the record said one.
 */
export type Kept = {
  done?: boolean | undefined;
  to?: string | undefined;
  version?: number | undefined;
  /**
   * The write is still out, or its answer not read back: the row wears this even where the page's answer still has it,
   * because that answer was read before the write and says what the row was, not what it is (`lib/data/optimistic.ts`).
   */
  pending?: boolean | undefined;
};

/** The remembered copy of a row, wearing what happened to it. A board's column is its first cell, as `columnOf` reads it. */
function wear(row: Row, kept: Kept): Row {
  return {
    ...row,
    ...(kept.done === undefined ? {} : { done: kept.done }),
    ...(kept.to === undefined ? {} : { cells: [kept.to, ...row.cells.slice(1)] }),
    ...(row.ref && kept.version !== undefined ? { ref: { ...row.ref, version: kept.version } } : {}),
  };
}

/**
 * THE BLOCK'S ROWS AFTER A RE-READ, with every held row where the reader last saw it.
 *
 * A TICK WAS FOLLOWED BY THE ROW LEAVING. `writeRow` reads the page again once a write lands, and a `todo` whose
 * `where:` leaves out done rows answers without the row it just ticked, so the mark the reader was checking went with
 * it and the only way to see whether they had hit the right one was to tick it back and look. A count of the history
 * found 13 of 85 writes reversed within five seconds on the register list for the same reason. A board moved a card to the head of
 * its new column for the same cause one step removed: the record answers newest write first.
 *
 * A MOVED CARD IS HELD AT THE FOOT OF ITS NEW COLUMN, NOT AT ITS OLD INDEX. A board's columns are the order its rows
 * first name them (`columnsOf` in `packages/render/src/board.ts`), so the first version of this, which spliced every
 * held row back at its index, turned a board reading Open, Doing, Done into Open, Done, Doing the moment a card left
 * Open for Done, with the card at the head of Done. The foot is where `lanes` drew the card when it was dropped, so it
 * is also where the reader last saw it. A column the board never drew goes last, as `boardOrder` sorts an undeclared
 * value last.
 *
 * `holdInPlace` in `rows-write.ts` IS THE SAME ANSWER over the register screen's `Entry`, and these are its rules over
 * the renderer's `Row` rather than a third set:
 *
 *   A HELD ROW STILL IN THE ANSWER IS DRAWN FROM THE ANSWER, so a change somebody else made shows; only its place is
 *   the remembered one. A held row the answer left out comes back from `before`, wearing what happened to it.
 *
 *   THE PLACE IS CLAMPED, because an index found in a longer list may not exist in a shorter one.
 *
 *   HOLDS LAND IN THE ORDER THEY SIT IN `before`. `holdInPlace` says "oldest hold first" and sorts by index; the index
 *   is what makes a splice put each row back where it was, so this sorts the same way.
 *
 * `before` IS THE BLOCK AS DRAWN AT THE LATEST GESTURE, earlier holds already in their places, so every place is read
 * off one list. `held` is keyed by `rowKey`; a hold on a row `before` never drew belongs to some other block and is
 * left alone, so one map can serve every block on the page.
 */
export function keepInPlace(before: readonly Row[], after: readonly Row[], held: ReadonlyMap<string, Kept>): Row[] {
  if (held.size === 0) return [...after];
  const keyOf = (row: Row): string | null => (row.ref ? rowKey(row.ref) : null);
  const places = before
    .map((row, at) => ({ row, at, kept: held.get(keyOf(row) ?? '') }))
    .filter((p): p is { row: Row; at: number; kept: Kept } => p.kept !== undefined);
  if (places.length === 0) return [...after];
  const pinned = new Set(places.map((p) => keyOf(p.row)));
  const out = after.filter((row) => !pinned.has(keyOf(row)));
  const lanes = [...new Set(before.map((row) => row.cells[0] ?? ''))];
  for (const p of places) {
    const found = after.find((row) => keyOf(row) === keyOf(p.row));
    const now = found ? (p.kept.pending ? wear(found, p.kept) : found) : wear(p.row, p.kept);
    out.splice(p.kept.to === undefined ? Math.min(p.at, out.length) : footOf(out, lanes, now.cells[0] ?? ''), 0, now);
  }
  return out;
}

/** Just after the last row in `lane` or any column before it, which is the foot of `lane` on a board grouped in `lanes` order. */
function footOf(rows: readonly Row[], lanes: readonly string[], lane: string): number {
  const rank = lanes.indexOf(lane);
  if (rank === -1) return rows.length;
  let foot = 0;
  rows.forEach((row, i) => {
    const at = lanes.indexOf(row.cells[0] ?? '');
    if (at !== -1 && at <= rank) foot = i + 1;
  });
  return foot;
}

/* ── arranging a page ────────────────────────────────────────────────────── */

/**
 * What the block editor changed on one block: each key it set, and `null` for each key it took off.
 *
 * `null` AND NOT `undefined` FOR A KEY TAKEN OFF, because a patch travels as JSON-shaped data between the sheet and this
 * write, and an `undefined` value is a key that silently vanishes on the way rather than one that says "remove".
 */
export type Patch = Readonly<Record<string, unknown>>;

/** A block with one edit laid over it. `kind` is never patched away: a block without one is not a block. */
export function withPatch(block: BlockBody, patch: Patch | undefined): BlockBody {
  if (!patch) return block;
  const out: Record<string, unknown> = { ...block };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'kind') continue;
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return { ...out, kind: block.kind };
}

/**
 * One place in the arrangement: which block (declared first, then added), the width it takes, and on a page with a rail
 * the column it sits in. No `area` is the block left where the record has it. `edit` is what the block editor changed
 * on that block, which travels in the same write so an edit and a move are one thing to put back.
 */
export type Placed = { i: number; span: number; area?: 'main' | 'rail'; edit?: Patch };

/** A block added in arrange mode, in the app's spelling. Only the keys a declaration may carry go to the record. */
export type Added = { kind: string; [key: string]: unknown };

/**
 * THE KEYS AN ADDED BLOCK DECLARES, and no others. The picker's block is the app's `PageBlock`, which carries drawing
 * hints (a column's width and alignment) the record does not read and would name as keys it cannot. A column keeps its
 * field, its label and its role.
 */
const DECLARES = ['kind', 'heading', 'span', 'source', 'where', 'cells', 'order', 'limit', 'target', 'authored', 'empty', 'tone', 'body', 'when', 'icon', 'fold'];

export function declaredBlock(block: Added): BlockBody {
  const out: Record<string, unknown> = {};
  for (const key of DECLARES) if (block[key] !== undefined) out[key] = block[key];
  if (Array.isArray(block.columns))
    out.columns = (block.columns as { field: string; label?: unknown; as?: unknown }[]).map((c) => ({
      field: c.field,
      ...(typeof c.label === 'string' ? { label: c.label } : {}),
      ...(typeof c.as === 'string' ? { as: c.as } : {}),
    }));
  return { ...out, kind: block.kind };
}

/**
 * The page's body with its blocks in the order, at the widths and in the columns placed, and the added ones declared
 * where they were put.
 *
 * THE AREA WENT NOWHERE UNTIL THIS WROTE IT. This wrote order and span only, so a block moved to the rail went back to
 * the record in the main column and the page read after Done drew it where it had been; a later change answered that with a
 * second write path for pages with a rail (`layout-write.ts`), which this replaces. A block moved to the rail gains
 * `area: rail`; one moved to main loses the key, since main is what a block with none already means, rather than
 * gaining a second spelling of the default. A block whose column did not change is written as the record holds it,
 * `area: main` and all, so arranging the order of a page does not rewrite how somebody chose to spell its areas.
 *
 * `null` WHEN THE PLACES DO NOT FIT THE BODY: an index past both lists means the page changed under the arrangement, and
 * writing a body built from a guess would drop or duplicate a block somebody else declared.
 */
export function arrangedBody(body: PageBody, placed: readonly Placed[], added: readonly Added[]): PageBody | null {
  const declared = body.blocks.length;
  const blocks: BlockBody[] = [];
  for (const p of placed) {
    const from = p.i < declared ? body.blocks[p.i] : added[p.i - declared] ? declaredBlock(added[p.i - declared]!) : undefined;
    if (!from) return null;
    blocks.push(inArea({ ...withPatch(from, p.edit), span: p.span }, p.area));
  }
  return { ...body, blocks };
}

/** A block in the column it was placed in, touched only when that column is not the one it already says. */
function inArea(block: BlockBody, to: Placed['area']): BlockBody {
  const now = block.area === 'rail' ? 'rail' : 'main';
  if (to === undefined || to === now) return block;
  if (to === 'rail') return { ...block, area: 'rail' };
  const { area: _moved, ...rest } = block;
  return { ...rest, kind: block.kind };
}

/** `template` is the template's own page id when what was set is the one declaration every row's page is drawn from. */
export type Arranged =
  | { from: 'written'; before: PageBody; version: number | null; template: string | null }
  | { from: 'refused'; fix: string }
  | { from: 'unreachable'; fix: string };

/**
 * The body the arrangement is laid over: the page's own, or, on a page drawn for one row of a list, its template's.
 *
 * A TEMPLATE'S ANSWER IS ONE ROW'S EXPANSION, so it is never the body written back: setting it would turn one declaration
 * for every row into a page about one row, with that row's name filled into every filter. The stored template is read
 * instead, through `arrangement({ page })` (`sourceOf`), the same read "How this is built" makes, and arranged by BLOCK
 * INDEX: an expansion has the template's blocks in the template's order, so place `n` on screen is block `n` of the
 * template, and nothing is matched by the text a row filled in.
 */
async function storedBody(
  base: string,
  slug: string,
  io?: ClientFetch,
): Promise<{ body: PageBody; version: number | null; template: string | null } | { from: 'refused' | 'unreachable'; fix: string }> {
  const read = await pagesReader(base, io).readOne(slug);
  if (read.from === 'absent') return { from: 'refused', fix: copy.recordNotReached };
  if (read.from === 'refused') return read;
  if (read.from === 'live') return { body: read.page.body, version: read.page.version, template: null };
  const { sourceOf } = await import('../dog/read.ts');
  const stored = await sourceOf(base, slug, io);
  if ('fix' in stored) return { from: stored.code === 'UNREACHABLE' ? 'unreachable' : 'refused', fix: stored.fix };
  /* AN EXPANSION WHOSE SOURCE NAMES NO TEMPLATE is a page this build cannot place, and it is refused in the sentence that
     says why rather than written over as if it were its own. */
  if (stored.template === null) return { from: 'refused', fix: copy.arrangeTemplate };
  return { body: asPageBody(stored.body, stored.template), version: stored.version, template: stored.template };
}

/**
 * A stored body as the open shape this file writes. `page` stays the FIRST key, because the record reads a declaration's
 * kind from its first key (`bodyOf` in `pages-live.ts` says the same), and a block with no `kind` is carried as the empty
 * string so the body keeps its length and the drawn count still compares.
 */
function asPageBody(raw: Readonly<Record<string, unknown>>, page: string): PageBody {
  const listed = Array.isArray(raw.blocks) ? (raw.blocks as unknown[]) : [];
  const blocks = listed
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map((b) => ({ ...b, kind: typeof b.kind === 'string' ? b.kind : '' }));
  const named = { page, title: typeof raw.title === 'string' ? raw.title : '' };
  return { ...named, ...raw, ...named, blocks };
}

/**
 * Done, on a live page: read the body the record stores, lay it out as arranged, and set it whole.
 *
 * `drawn` IS HOW MANY BLOCKS THE SCREEN WAS ARRANGING, and a body with another number is a page that changed since it was
 * read. `before` comes back so the toast's undo can set it again.
 *
 * A TEMPLATE ARRANGES THE TEMPLATE (`storedBody`), so every row's page moves together, and the answer names it so the
 * screen can say so.
 *
 * `seen` IS THE VERSION THE SCREEN DREW, and the write carries it: a page somebody else arranged after it was drawn is
 * refused here or by the record, never written over. `version` in the answer is what the undo carries.
 */
export async function saveArrangement(
  base: string,
  slug: string,
  drawn: number,
  placed: readonly Placed[],
  added: readonly Added[],
  io?: ClientFetch,
  seen?: number | null,
): Promise<Arranged> {
  const read = await storedBody(base, slug, io);
  if ('from' in read) return read;
  if (read.body.blocks.length !== drawn) return { from: 'refused', fix: copy.arrangeMoved };
  if (typeof seen === 'number' && read.version !== null && read.version !== seen) return { from: 'refused', fix: copy.arrangeMoved };
  const body = arrangedBody(read.body, placed, added);
  if (!body) return { from: 'refused', fix: copy.arrangeMoved };
  const out = await setBody(base, body, io, read.version);
  return out.from === 'written' ? { from: 'written', before: read.body, version: out.version, template: read.template } : out;
}

/** Done kept as the person's own look: `undo` is what Undo writes (`lookUndo`). */
export type Looked = { from: 'written'; undo: LookUndo };

/** What the whole-body write needs, for a record that cannot keep the arrangement as a look. */
export type ByBody = { drawn: number; placed: readonly Placed[]; seen?: number | null; removed?: readonly string[] };

/** A record older than a look's widths and columns, which names the key it does not know. */
const olderLook = (code: string | undefined, fix: string): boolean => code === 'DECLARATION_INVALID' && /\b(span|area)\b/u.test(fix);

/**
 * Done, kept as the person's own look over the page (`arrange-look.ts`): one `setDeclaration` of `look.<page>`, and no
 * page body, so a page an add-on wrote or added a block to is arranged and keeps taking that add-on's updates.
 *
 * A RECORD THAT REFUSES THE LOOK'S WIDTHS OR COLUMNS (a host older than them) is written the old way, through
 * `saveArrangement`, and says what that says: nothing new is asked of the person for it.
 */
export async function saveLayout(
  base: string,
  slug: string,
  live: LiveLook | null,
  laid: readonly Laid[],
  old: ByBody,
  io?: ClientFetch,
): Promise<Looked | Arranged> {
  const undo = lookUndo(slug, live);
  const out = await writeLook(base, lookOfArrangement(slug, live, laid, old.removed ?? []), io);
  if (out.ok) return { from: 'written', undo };
  if (olderLook(out.code, out.fix)) return saveArrangement(base, slug, old.drawn, old.placed, [], io, old.seen);
  if (out.code === 'UNREACHABLE' || out.fix === copy.recordNotReached) return { from: 'unreachable', fix: copy.recordNotReached };
  if (out.code === 'UNAUTHORIZED') return { from: 'refused', fix: copy.signInAgain };
  return { from: 'refused', fix: out.fix };
}

/**
 * One page body, set whole through `setDeclaration`. Undo is this with the body read before and the version the write made.
 *
 * `version` IS THE ONE THE BODY WAS READ AT; `null` sends none, for a record that does not say. A page moved meanwhile is a
 * conflict, and it is said as the page having changed.
 */
export async function setBody(
  base: string,
  body: PageBody,
  io?: ClientFetch,
  version: number | null = null,
): Promise<{ from: 'written'; version: number | null } | { from: 'refused' | 'unreachable'; fix: string }> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call('setDeclaration', version === null ? { body } : { body, version });
  if (out.ok) {
    const made = Array.isArray(out.value) ? (out.value as { version?: unknown }[]).find((d) => Number.isInteger(d?.version)) : undefined;
    return { from: 'written', version: made ? (made.version as number) : null };
  }
  if ('conflict' in out) return { from: 'refused', fix: copy.arrangeMoved };
  if (!('refusal' in out)) return { from: 'unreachable', fix: copy.recordNotReached };
  if (out.refusal.code === 'UNREACHABLE') return { from: 'unreachable', fix: copy.recordNotReached };
  if (out.refusal.code === 'UNAUTHORIZED') return { from: 'refused', fix: copy.signInAgain };
  return { from: 'refused', fix: out.refusal.fix };
}
