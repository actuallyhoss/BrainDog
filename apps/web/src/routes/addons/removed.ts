/**
 * WHAT WAS REMOVED, AND THE WAY BACK. An uninstall keeps every row and, for thirty days, the add-on's settings and
 * pending schedules (the record's `pack_removed`); the record's `packsRemoved` read lists what is inside that window,
 * newest first. This file says each in words for the "Removed" part of Add-ons, and nothing here touches the screen.
 *
 * THE READ IS AN EXTRA, never the screen's: a refusal, or a record that does not answer it yet, is nothing removed,
 * and the screen draws what it draws without it.
 */
import { offeredVersion, type CatalogueIndex } from '@braindog/declare/catalogue';

/** One list the removed add-on declared, by the name the record gives it, and how many of its rows are still there. */
export type Stayed = { list: string; rows: number };

/** One add-on removed inside the window, as `packsRemoved` answers it. `removed_at` is the record's instant. */
export type Removed = { id: string; title: string; version: string; removed_at: string; stayed: Stayed[]; back: boolean; binned?: number };

/** What the part says of one: when it went, and what of it stays. */
export type Lines = { id: string; title: string; when: string; stayed: string };

/** The client as this file calls it: only `call`, so a test hands in a stand-in. */
export type Caller = { call<T>(name: string, args?: Record<string, unknown>): Promise<{ ok: true; value: T } | { ok: false; refusal?: unknown }> };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day as the person's own calendar has it, `YYYY-MM-DD`, from an instant. */
const localDay = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * "Removed today", "Removed yesterday", "Removed 3 Oct", and the year only when it is not this one. Never the
 * timestamp: an instant the record could not have written reads as "Removed" and nothing more.
 */
export function whenSaid(at: string, now: number): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return 'Removed';
  const day = localDay(t);
  if (day === localDay(now)) return 'Removed today';
  if (day === localDay(now - 86_400_000)) return 'Removed yesterday';
  const d = new Date(t);
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `Removed ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/* A LIST IS COUNTED BY WHAT IT HOLDS: an item, never a row. */
const items = (n: number): string => (n === 1 ? 'Your 1 item stays' : `Your ${n.toLocaleString('en-GB')} items stay`);

/**
 * What of it stays, by the lists that still hold something: "Your 41 items stay in Services", "in Services and
 * Rentals", "in 4 lists". A list it held nothing in is not named; nothing anywhere is "Nothing was in it."
 */
export function stayedSaid(stayed: readonly Stayed[]): string {
  const held = stayed.filter((s) => s.rows > 0);
  const n = held.reduce((sum, s) => sum + s.rows, 0);
  if (n === 0) return 'Nothing was in it.';
  const where = held.length === 1 ? held[0]!.list : held.length === 2 ? `${held[0]!.list} and ${held[1]!.list}` : `${held.length} lists`;
  return `${items(n)} in ${where}.`;
}

/** Each removed add-on's two lines, in the order the record gave them. */
export function removedLines(rows: readonly Removed[], now: number): Lines[] {
  return rows.map((r) => ({ id: r.id, title: r.title, when: whenSaid(r.removed_at, now), stayed: stayedSaid(r.stayed) }));
}

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One answered row, or `null` for one this screen cannot say. A list with no name is not said by its id either. */
function rowOf(v: unknown): Removed | null {
  if (!isMap(v) || typeof v.id !== 'string' || v.id === '' || typeof v.removed_at !== 'string') return null;
  const stayed = (Array.isArray(v.stayed) ? v.stayed : []).flatMap((s): Stayed[] =>
    isMap(s) && typeof s.list === 'string' && s.list !== '' && typeof s.rows === 'number' && Number.isFinite(s.rows) ? [{ list: s.list, rows: Math.max(0, Math.floor(s.rows)) }] : [],
  );
  return {
    id: v.id,
    title: typeof v.title === 'string' ? v.title : '',
    version: typeof v.version === 'string' ? v.version : '',
    removed_at: v.removed_at,
    stayed,
    back: v.back !== false,
    ...(typeof v.binned === 'number' && Number.isFinite(v.binned) && v.binned > 0 ? { binned: Math.floor(v.binned) } : {}),
  };
}

/**
 * The record's removed add-ons, or `[]`: a refusal, a throw, or an answer of any other shape is nothing removed.
 * Called through `call` by name until the client carries `packsRemoved` itself.
 */
export async function readRemoved(client: Caller | null): Promise<Removed[]> {
  if (!client) return [];
  try {
    const out = await client.call<unknown>('packsRemoved', {});
    if (!out.ok || !Array.isArray(out.value)) return [];
    return out.value.map(rowOf).filter((r): r is Removed => r !== null);
  } catch {
    return [];
  }
}

/* ── the way back ──────────────────────────────────────────────────────── */

/**
 * How Put back brings one in. A module this build ships is planned and installed here, the way the toast's Undo does
 * it (`reinstall` on the page). Anything else, a use case or an add-on from the Kennel, is read on its own page first,
 * where its file is verified and its plan is shown, and Put back opens that page. `newest` is the version Put back
 * brings, and `null` when this screen cannot tell before the page is opened.
 */
export type Way = { kind: 'here'; newest: string } | { kind: 'page'; href: string; newest: string | null };

/** Where a removed add-on comes back from: `modules` is this build's version of each module, by id. */
export function wayBack(r: Pick<Removed, 'id' | 'version'>, modules: ReadonlyMap<string, string>, kennel: CatalogueIndex | null): Way {
  const shipped = modules.get(r.id);
  if (shipped !== undefined) return { kind: 'here', newest: shipped };
  /* A USE CASE'S PACK IS HELD AS `usecase-<id>`, and its listing goes by the use case's own id. */
  const usecase = r.id.startsWith('usecase-') ? r.id.slice('usecase-'.length) : null;
  const kind = usecase === null ? 'pack' : 'usecase';
  const id = usecase ?? r.id;
  const entry = kennel?.entries.find((e) => e.kind === kind && e.id === id) ?? null;
  const kept = entry?.versions.find((v) => v.version === r.version && v.yanked === undefined);
  const newest = kept ? kept.version : entry ? (offeredVersion(entry)?.version ?? null) : null;
  return { kind: 'page', href: `/addons/${encodeURIComponent(id)}${kind === 'pack' ? '?kind=pack' : ''}`, newest };
}

/**
 * The one line said when the version removed is not the one Put back brings: that version is gone from here, and what
 * comes instead. Nothing when they are the same, or when either is unknown.
 */
export function versionSaid(removed: string, newest: string | null): string | null {
  if (removed === '' || newest === null || newest === removed) return null;
  return `Version ${removed} is no longer here, so Put back brings ${newest}, the newest there is.`;
}

/** Said under one removed with its data: where its entries are, and that Put back brings them. */
export const binnedSaid = (n: number): string =>
  `${n === 1 ? 'Its 1 entry is' : `Its ${n.toLocaleString('en-GB')} entries are`} in the bin. Put back brings ${n === 1 ? 'it' : 'them'} back too.`;

/** Said under one whose settings and schedules the record no longer keeps: Put back still brings it, as new. */
export const FRESH = 'Its settings and schedules are no longer kept, so it comes back as new.';

/** The press, and the press while it runs. */
export const PUT_BACK = { idle: 'Put back', going: 'Putting back…', title: 'Removed', label: (name: string) => `Put back ${name}` } as const;
