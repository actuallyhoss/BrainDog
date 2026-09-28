/**
 * The record's quiet hours, the kernel's half: `quietHours` and `setQuietHours` (`09 §5` rule 3,
 * `loop/finish/contracts.md` §12.1, decisions C74).
 *
 * ONE COLUMN, `record.quiet` (migration 0020), AND NO SETTINGS LIST. NULL reads as 22:00 to 08:00, `'off'` holds nothing
 * back, and `{"from":"HH:MM","to":"HH:MM"}` is a window in the record's time zone. `quietOf` in `digest.ts` is the one
 * reader of what is stored, and the `digest` schedule handler in `index.ts` the one place the window is applied.
 *
 * A CHANGE IS AN `edit` EVENT ON THE RECORD, target kind `record` and field `quiet`, with the old and new values as the
 * ledger writes any value. No new event kind: the window is a fact about the record, and History already reads edits.
 *
 * WHO MAY ASK IS THE RECORD'S QUESTION, NOT THIS FILE'S. `packages/record/src/methods/quiet.ts` puts the admin gate in
 * front of the write, so an owner in a browser changes it and every member reads it.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { timeOf } from '../clock.ts';
import { instant, type Json } from '../coerce.ts';
import { jcs } from '../declare.ts';
import { hhmm, quietOf, type QuietWindow } from '../digest.ts';
import type { KernelParts } from '../parts.ts';
import { slashMayWrite } from '../slash.ts';

/**
 * What the record holds: a window, `'off'`, or `null` for the default (22:00 to 08:00), which is what a record that was
 * never told otherwise holds and what `setQuietHours({ quiet: null })` puts back.
 */
export type QuietHeld = { from: string; to: string } | 'off' | null;

/** The answer to both methods: what is held, and the window that applies, so a screen draws the default's hours too. */
export type QuietHours = { quiet: QuietHeld; window: QuietWindow; tz: string };

/** What a stored value is as the owner set it: `null` when nothing is stored, and the window otherwise. */
const heldOf = (stored: string | null | undefined): QuietHeld => (stored === null || stored === undefined ? null : quietOf(stored));

export function extension(parts: KernelParts) {
  const { sql, clock, mint, transaction } = parts;

  /** The record's row, its id, zone and stored window; `null` on a record not yet created. */
  const row = () => sql.one<{ id: string; tz: string; quiet: string | null }>('SELECT id, tz, quiet FROM record WHERE singleton = 1') ?? null;

  const answer = (r: { tz: string; quiet: string | null }): QuietHours => ({ quiet: heldOf(r.quiet), window: quietOf(r.quiet), tz: r.tz });

  return {
    /** The record's quiet hours as held, the window that applies and the zone it is read in. */
    quietHours(): Result<QuietHours> {
      const r = row();
      if (r === null) return no('NOT_IN_THIS_BUILD', 'This record has not been set up yet, so it has no quiet hours to read.', { at: 'quiet' });
      return ok(answer(r));
    },

    /**
     * Set the record's quiet hours: a window, `'off'`, or `null` to put the default back.
     *
     * A WINDOW WHOSE ENDS ARE EQUAL IS REFUSED rather than read one way or the other: as "all day" it would stop every
     * digest for good, and as "none" it would be `'off'` spelled so nobody could tell. The same value again is answered
     * as it stands and logs nothing, so a double press is one change in History.
     */
    setQuietHours(args: { quiet?: unknown }, actor: string): Result<QuietHours> {
      const asked = args?.quiet;
      let stored: string | null;
      /* ABSENT IS NOT NULL. A call that forgot the key would otherwise put the default back over a window somebody chose. */
      if (asked === undefined) return no('REQUIRED_MISSING', 'Say the quiet hours: a start and an end, or off.', { at: 'quiet' });
      if (asked === null) stored = null;
      else if (asked === 'off') stored = 'off';
      else if (typeof asked === 'object' && !Array.isArray(asked)) {
        const w = asked as { from?: unknown; to?: unknown };
        const from = typeof w.from === 'string' ? quietTime(w.from) : null;
        const to = typeof w.to === 'string' ? quietTime(w.to) : null;
        if (from === null || to === null)
          return no('VALUE_MALFORMED', 'Quiet hours start and end at a time written as HH:MM, like 22:00 and 08:00.', { at: 'quiet' });
        if (from === to) return no('VALUE_MALFORMED', 'Quiet hours need to end at a different time from when they start.', { at: 'quiet' });
        stored = JSON.stringify({ from, to });
      } else return no('VALUE_MALFORMED', 'Quiet hours are a start and an end, or off.', { at: 'quiet' });

      return transaction(() => {
        const r = row();
        if (r === null) return no<QuietHours>('NOT_IN_THIS_BUILD', 'This record has not been set up yet, so it has no quiet hours to set.', { at: 'quiet' });
        if (r.quiet === stored) return ok(answer(r));
        sql.exec('UPDATE record SET quiet = ? WHERE singleton = 1', stored);
        /* THE LEDGER'S OWN SHAPE, WRITTEN HERE because `appendEvent` names every target an entry. `null` is "there was
           no prior value", as it is on every other edit, and a default put back is a `to_v` of NULL for the same reason. */
        slashMayWrite(actor, 'edit');
        const was = heldOf(r.quiet) as Json;
        const is = heldOf(stored) as Json;
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v) VALUES (?, ?, ?, 'edit', ?, 'record', 'quiet', ?, ?)",
          mint(),
          instant(clock.now()),
          actor,
          `record:${r.id}`,
          was === null ? null : jcs(was),
          is === null ? null : jcs(is),
        );
        return ok(answer({ tz: r.tz, quiet: stored }));
      });
    },
  };
}

/**
 * A typed time as `HH:MM`, or `null` when it is not one. Through the calendar clock's `timeOf`, which `quietOf` reads
 * the stored window with too, so what is accepted here is exactly what the digest handler can read back.
 */
function quietTime(typed: string): string | null {
  const t = timeOf(typed);
  return t === null ? null : hhmm(t);
}
