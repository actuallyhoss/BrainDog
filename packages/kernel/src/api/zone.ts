/**
 * The record's time zone, the kernel's half: `setZone` (MC2).
 *
 * ONE COLUMN, `record.tz`, set when the record is made (`provision.ts`) and never changed after, so a record made on a
 * machine in Greenwich counted its "today" there for good. `dog_meta.tz` says the same thing in an exported file and is
 * kept beside it, so a copy taken after the change opens in the new zone.
 *
 * A CHANGE IS AN `edit` EVENT ON THE RECORD, target kind `record` and field `tz`, as `setQuietHours` logs a window. The
 * event is also what turns every held answer over (`stamp` in the record), so "today" moves at once. Nothing else is
 * written: no row's day is moved, and a summary already armed keeps its hour until it next comes due.
 *
 * WHO MAY ASK IS THE RECORD'S QUESTION: `packages/record/src/methods/zone.ts` puts the admin gate in front of it.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from '../coerce.ts';
import { jcs } from '../declare.ts';
import type { KernelParts } from '../parts.ts';
import { placeZone, zoneRefused } from '../provision.ts';
import { slashMayWrite } from '../slash.ts';

export function extension(parts: KernelParts) {
  const { sql, clock, mint, transaction } = parts;

  return {
    /** Set the record's time zone, a place such as `Africa/Cairo`, or `UTC`. The same zone again changes nothing. */
    setZone(args: { tz?: unknown }, actor: string): Result<{ tz: string }> {
      const tz = typeof args?.tz === 'string' ? args.tz.trim() : '';
      if (tz === '') return no('REQUIRED_MISSING', 'Say the time zone, a place such as Europe/London.', { at: 'tz' });
      if (tz.length > 64 || !placeZone(tz)) return no('VALUE_MALFORMED', zoneRefused(tz), { at: 'tz' });
      return transaction(() => {
        const r = sql.one<{ id: string; tz: string }>('SELECT id, tz FROM record WHERE singleton = 1') ?? null;
        if (r === null) return no<{ tz: string }>('NOT_IN_THIS_BUILD', 'This BrainDog has not been set up yet, so it has no time zone to set.', { at: 'tz' });
        if (r.tz === tz) return ok({ tz });
        sql.exec('UPDATE record SET tz = ? WHERE singleton = 1', tz);
        sql.exec("UPDATE dog_meta SET value = ? WHERE key = 'tz'", tz);
        slashMayWrite(actor, 'edit');
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v) VALUES (?, ?, ?, 'edit', ?, 'record', 'tz', ?, ?)",
          mint(),
          instant(clock.now()),
          actor,
          `record:${r.id}`,
          jcs(r.tz),
          jcs(tz),
        );
        return ok({ tz });
      });
    },
  };
}
