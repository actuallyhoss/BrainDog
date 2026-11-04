/**
 * The last shell this browser drew for a record, so a cold open draws the rail at once and the live `boot` replaces it.
 *
 * ONLY WHAT THE SHELL DRAWS IS KEPT: the record's name, lists, pages, badges. No token, key or session is in a shell,
 * and a refused shell is never kept. One entry, for one record: keeping another record's drops the first, and
 * `dropCopy` runs on sign-out, on a refusal and in `forget`, so a copy never outlives the reason to draw it.
 *
 * A COPY ONLY DRAWS. `stale` marks it, and `drawnFrom` takes away the reader's level and the holding pen, so nothing it
 * shows can offer a write the record would refuse. The live answer replaces it a moment later.
 */

import type { Shell } from './boot-live.ts';
import { learnRowPages, saidRowPages } from './row-href.ts';

/** Bump when the shell's shape changes: a copy of another version is ignored and dropped. */
export const COPY_VERSION = 1;
/** How long a copy may be drawn; older is dropped, since a week-old rail is more wrong than a wait. */
export const COPY_MS = 7 * 24 * 3_600_000;
/**
 * How long a guest's shell may be drawn: a day, as their local copy (`GUEST_MS` in `data/local.ts`, not imported, so this
 * module stays out of that one's chunk). A guest is somebody shares let in, with no role on the whole record.
 */
export const GUEST_COPY_MS = 24 * 3_600_000;
export const COPY_KEY = 'braindog.boot-copy';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Entry = { v: number; base: string; at: number; shell: Shell; rows?: ReturnType<typeof saidRowPages> };

const here = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Keep `shell` as the last true picture of the record at `base`. A shell no record answered is not kept. */
export function saveCopy(base: string, shell: Shell, now: number = Date.now(), store: Store | null = here()): void {
  if (!store || shell.refused || !shell.live) return;
  try {
    const entry: Entry = { v: COPY_VERSION, base, at: now, shell, rows: saidRowPages() };
    store.setItem(COPY_KEY, JSON.stringify(entry));
  } catch {
    /* full or blocked storage: the shell just waits for the network as before */
  }
}

/** Drop the copy: sign-out, a refusal, a record switch and `forget`. */
export function dropCopy(store: Store | null = here()): void {
  try {
    store?.removeItem(COPY_KEY);
    /* AND THE PAGES' KEPT OUTLINES (`shell/page-trace.ts`): boxes only, and still this person's pages. */
    const held = (globalThis as { localStorage?: Storage }).localStorage;
    if (held && store === held) for (const k of Object.keys(held)) if (k.startsWith('bd_tr')) held.removeItem(k);
  } catch {
    /* nothing to drop */
  }
}

/** A kept shell as it may be shown before the record answers: marked `stale`, with no level to write by and no offers. */
export function drawnFrom(shell: Shell): Shell {
  return {
    ...shell,
    stale: true,
    pen: [],
    /* WHAT THE LINKS DREW WITH (`drewOwner`, `drewPen`), which offer no write and only hold their rows' places: the foot of
       the sidebar and the Settings index drew a shorter picture for the copy, and grew when `boot` answered. */
    drewPen: shell.pen,
    me: { ...shell.me, level: 'read', owner: false, drewOwner: shell.me.owner === true, lists: [], levels: {} },
  };
}

/** The shell last kept for `base`, made to only draw; `null` when there is none, it is another record's, old or odd. */
export function readCopy(base: string, now: number = Date.now(), store: Store | null = here()): Shell | null {
  if (!store) return null;
  try {
    const raw = store.getItem(COPY_KEY);
    if (raw === null) return null;
    const e = JSON.parse(raw) as Partial<Entry> | null;
    if (!e || e.v !== COPY_VERSION || typeof e.at !== 'number' || !e.shell || typeof e.shell !== 'object') {
      dropCopy(store);
      return null;
    }
    if (e.base !== base) return null;
    /* A GUEST'S SHELL IS DRAWN A DAY AT MOST, and never past their last share's end (`GUEST_COPY_MS`). */
    const grant = e.shell.me?.grant;
    const guest = grant !== undefined && e.shell.me.lists !== null;
    const until = guest && grant.until !== null ? Date.parse(grant.until) : NaN;
    if (now < e.at || now - e.at >= (guest ? GUEST_COPY_MS : COPY_MS) || now >= until) {
      dropCopy(store);
      return null;
    }
    /* AND WHICH ROW OPENS WHICH PAGE, WHICH A SHELL DOES NOT HOLD (4 Nov). A cold open draws this copy and reads its lists before
       `boot` answers, so a project's address came out `/r/things/2` where it is `/p/kiln`. A pin is kept by that address, so
       on every reload with a copy kept the sidebar found no pinned project and they went from it. */
    if (e.rows) learnRowPages(e.rows.pages, e.rows.byRow);
    return drawnFrom(e.shell);
  } catch {
    dropCopy(store);
    return null;
  }
}
