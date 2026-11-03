/**
 * What was taken out of this record and can still be put back: `packsRemoved` (ADMIN, a read), the
 * record's half of "Removed" on the Add-ons screen.
 *
 * BEFORE THIS NOBODY COULD SEE WHAT AN UNINSTALL KEPT. Taking an add-on out keeps its rows, and the kernel keeps the
 * settings chosen for it and its pending schedules in `pack_removed` for `REMOVED_WINDOW_DAYS` (`forgetPack`), which a
 * reinstall of the same add-on spends to put them back (`test/uninstall-undo.test.ts`). Nothing read that table for a
 * person, so the press stayed an Undo nobody was told about.
 *
 * AN OWNER'S, IN A BROWSER, AS INSTALLING IS. The first statement is `admin(ctx)`, the guard `installPack` and
 * `uninstallPack` start with, so a token, a runner or a colleague is refused in that guard's one sentence: what an
 * owner took out of the record is the owner's to see and to put back.
 *
 * NEWEST FIRST, INSIDE THE WINDOW, AND ONLY WHAT IS STILL OUT. One line per add-on removed within the window (the
 * kernel's own constant, never a second number), and none for an add-on that is back, which a reinstall already
 * spent. Each says its name, the version taken out, when, and what stayed: every list it declared, by the name the
 * list had, with how many entries are still in it. `back` is whether installing that version again puts the settings
 * and the schedules back, which inside the window it always does.
 *
 * IN NAMES. An add-on is said by the title the host's catalogue gives it, or its id said as words when the catalogue
 * does not know it; a list by the name its declaration gave it, or its own id said as words.
 */

/* THE KERNEL'S WINDOW, IMPORTED, so the number is never written a second time here. */
import { REMOVED_WINDOW_DAYS, instant } from '@braindog/kernel';

import { BINNED } from '../addon-data.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** One list a removed add-on declared, and how many of its entries are still there. */
export type RemovedList = { list: string; rows: number };

/** One add-on taken out within the window. */
export type RemovedAddon = {
  id: string;
  title: string;
  /** The version that was taken out, the one a reinstall would bring back what it kept for. */
  version: string;
  removed_at: string;
  /** The last instant a reinstall still puts the settings and schedules back. */
  back_until: string;
  /** Every list it declared, by name, with its entries kept. */
  stayed: RemovedList[];
  /** Whether installing `version` again puts back the settings and the schedules. Inside the window, always. */
  back: boolean;
  /**
   * How many of its entries went into the bin with it, when it was removed with its data (`addon-data.ts`). Installing it
   * again inside the window puts them back. Absent when it was removed without them.
   */
  binned?: number;
};

/** What `packsRemoved` answers: the add-ons taken out within the window, newest first (the shape `apps/web` `routes/packs/removed.ts` reads). */
export type PacksRemovedAnswer = RemovedAddon[];

/** What the host's catalogue says an add-on is called. Absent, every add-on is said by its id. */
export type RemovedDeps = RecordDeps & { catalogue?: readonly { id: string; title: string }[] | undefined };

/** How many removed add-ons one answer holds, and how many lists each. Bounded, as every read is. */
const MOST = 50;
const LISTS_MOST = 40;
const DAY = 86_400_000;

/** An id said as words: `sample-ledger` is "Sample ledger". */
const asWords = (id: string): string => {
  const said = id.replace(/[-_.]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return said === '' ? id : said.charAt(0).toUpperCase() + said.slice(1);
};

export function methods(deps: RemovedDeps) {
  const { sql, admin, no, clock } = deps;

  /** The add-on's name as the catalogue says it, as the usage read titles one, or its id said as words. */
  const titleOf = (id: string): string => {
    const entry = (deps.catalogue ?? []).find((e) => e.id === id);
    const title = entry?.title?.trim() ?? '';
    return title === '' || title === id ? asWords(id) : title;
  };

  /** The lists one removed add-on declared, retired with it, by the name each had and its live entries. */
  const listsOf = (pack: string): RemovedList[] =>
    sql
      .all<{ id: string; body: string }>(
        `SELECT id, body FROM declaration
          WHERE coalesce(pack_id, json_extract(body, '$.pack')) = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 1
          ORDER BY id LIMIT ?`,
        pack,
        LISTS_MOST,
      )
      .map((d) => {
        const register = d.id.slice('register.'.length);
        let name = '';
        try {
          const body = JSON.parse(d.body) as { name?: unknown };
          if (typeof body.name === 'string') name = body.name.trim();
        } catch {
          /* A body that does not parse is said by its id. */
        }
        if (name === '' || name.includes('{{')) name = asWords(register);
        const count = sql.one<{ n: number }>('SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL', register)?.n ?? 0;
        return { list: name, rows: Number(count) };
      });

  /* WHAT A REMOVAL WITH DATA PUT IN THE BIN, kept in the owner's settings under `braindog:binned` (`addon-data.ts` `BINNED`). */
  const binnedOf = (pack: string): { binned?: number } => {
    const row = sql.one<{ value: string }>('SELECT value FROM pref WHERE person_id = ? AND key = ?', BINNED, pack);
    if (row === undefined) return {};
    try {
      const n = (JSON.parse(row.value) as { rows?: unknown }).rows;
      return typeof n === 'number' && n > 0 ? { binned: n } : {};
    } catch {
      return {};
    }
  };

  return {
    /**
     * The add-ons taken out of this record within the window, newest first, each with what stayed and whether a
     * reinstall puts its settings and schedules back. Takes nothing. It changes nothing.
     */
    async packsRemoved(args: unknown, ctx: CallContext) {
      const stop = admin(ctx, 'read what was taken out of this BrainDog');
      if (stop) return { ok: false as const, refusal: stop };
      if (args !== undefined && args !== null && (typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length > 0))
        return no('FIELD_UNKNOWN', `This takes nothing: it reads every plugin taken out in the last ${REMOVED_WINDOW_DAYS} days.`, { at: Object.keys(args as object)[0] ?? 'args' });

      const now = clock.now();
      const since = instant(now - REMOVED_WINDOW_DAYS * DAY);
      const rows = sql.all<{ pack: string; version: string; removed_at: string }>(
        `SELECT pack, version, removed_at FROM pack_removed
          WHERE removed_at >= ? AND pack NOT IN (SELECT id FROM pack)
          ORDER BY removed_at DESC, pack LIMIT ?`,
        since,
        MOST,
      );
      const removed: RemovedAddon[] = rows.map((r) => {
        const until = Date.parse(r.removed_at) + REMOVED_WINDOW_DAYS * DAY;
        return {
          id: r.pack,
          title: titleOf(r.pack),
          version: r.version,
          removed_at: r.removed_at,
          back_until: Number.isNaN(until) ? r.removed_at : instant(until),
          stayed: listsOf(r.pack),
          back: Number.isNaN(until) ? false : until >= now,
          ...binnedOf(r.pack),
        };
      });
      return { ok: true as const, value: removed satisfies PacksRemovedAnswer };
    },
  };
}
