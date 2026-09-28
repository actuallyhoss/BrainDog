/**
 * The billing lapse ladder, one step a night: `53 §5.10`, walked by the nightly walk (`nightly.ts`).
 *
 * THE DIRECTORY KEEPS THE FACTS AND THIS FILE DECIDES. `due` answers every lapsed row with its `lapsed_at` and the
 * notices already `told`, and which notice is next, or whether the record goes, is worked out here from those two and
 * the walk's one clock. Nothing is kept anywhere else, so a night that dies halfway is picked up by the next one.
 *
 * ONE NOTICE PER RECORD PER NIGHT, THE EARLIEST ONE STILL OWED. A walk that missed a week does not send day 0 and day
 * 60 in the same minute; it sends day 0 tonight and day 60 tomorrow. That can only ever push the deletion later.
 *
 * A DELETION IS THE ONE STEP THAT CANNOT BE TAKEN BACK, so it asks for everything at once: the row is `lapsed` (asked
 * again of the Directory right before, since a payment can land while the walk runs), every one of the three notices
 * went (`told` is `0,60,83`), the lapse is `LAPSE_DELETES_DAYS` old by the walk's clock, and the record is still open.
 * A record with no billing row is never in `due`, so it is never touched at all; a notice that never went holds the
 * deletion back for as long as it keeps failing.
 *
 * IT IMPORTS NOTHING FROM `cloudflare:`, for the reason `nightly.ts` does not: what can be wrong is here, and the
 * Directory, the mail and the record's own deletion are handed in.
 */

import type { BillingDue, LadderDay } from '@braindog/record/directory';

import { LAPSE_DELETES_DAYS } from './billing.ts';
import { FINAL_KEPT_MS } from './destroy.ts';
import type { MailKind, MailVars } from './mail.ts';
import type { OpFields } from './oplog.ts';

const DAY_MS = 86_400_000;

/** The notices, in the order they go, each on its day since the lapse began. The Directory's `told` takes these three. */
export const NOTICES: readonly LadderDay[] = [0, 60, 83];

/** What one night of the ladder came to: the rows it was handed, the letters that went, the records deleted, and the steps that failed. */
export type Laddered = { lapsed: number; sent: number; deleted: number; failed: number };

export type Ladder = {
  /** The Directory's `billing({ op: 'due', now })`. */
  due: (now: number) => Promise<BillingDue[]>;
  /** The record's owners' addresses, read from the record itself. A throw is the payer alone. */
  owners: (record: string) => Promise<string[]>;
  /** `sendMail`: `true` when the binding took it. It never throws. */
  mail: (kind: MailKind, to: string, vars: MailVars) => Promise<boolean>;
  /** The Directory's `billing({ op: 'told', record, day })`, `true` when it was written. */
  told: (record: string, day: LadderDay) => Promise<boolean>;
  /** The Directory's `billing({ op: 'lapsed', record })`, asked again right before a deletion. */
  lapsed: (record: string) => Promise<boolean>;
  /** Deletes the record, final copy first (`destroy.ts`). Throwing is how it says it did not. */
  destroy: (record: string) => Promise<void>;
  /** The page a letter links to, for a record's name, or `undefined` on a deployment with no public host. */
  link?: ((slug: string) => string | undefined) | undefined;
  /** The walk's lines, `op()` in the Worker. */
  speak?: ((fields: OpFields, level: 'info' | 'error') => void) | undefined;
  /** The walk's one clock, read once by the walk and handed here. */
  now: number;
};

/** A day as a person reads it in a letter: `3 October 2026`. UTC, because the walk's clock is. */
const dayOf = (ms: number): string => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The days `told` holds, read from its comma list. */
const toldOf = (told: string): Set<number> => new Set(told.split(',').filter((d) => d !== '').map(Number));

/**
 * Every address a letter about `row` goes to: the payer and every owner, each once, compared without case.
 *
 * THE OWNERS TOO, because the person who pays and the person who would lose the record are not always the same person,
 * and the one who loses it is the one the letter is for. A record whose owners cannot be read is written to the payer.
 */
async function addressesOf(o: Ladder, row: BillingDue): Promise<string[]> {
  let owners: string[] = [];
  try {
    owners = await o.owners(row.record);
  } catch (e) {
    o.speak?.({ op: 'walk', rec: row.record, billing: 'owners', ok: false, why: reason(e) }, 'error');
  }
  const seen = new Map<string, string>();
  for (const address of [row.email, ...owners]) if (address) seen.set(address.trim().toLowerCase(), address.trim());
  return [...seen.values()];
}

/** One letter to every address. `true` when at least one of them took it: see `ladder` for why that is enough. */
async function letter(o: Ladder, kind: MailKind, to: readonly string[], vars: MailVars): Promise<boolean> {
  let went = false;
  for (const address of to) if (await o.mail(kind, address, vars)) went = true;
  return went;
}

/**
 * One night of the ladder over every row `due` answers.
 *
 * A NOTICE COUNTS AS TOLD WHEN ONE ADDRESS TOOK IT. Holding it for the address that bounced would send the same letter
 * again every night to everyone who already has it; the bounce is its own `op: 'mail'` line. A notice nobody took is
 * not told, and goes again tomorrow.
 *
 * A ROW WHOSE RECORD IS CLOSED IS PASSED OVER. The Directory keeps the row after a deletion, and there is nothing left
 * to delete or to warn about; the day-90 letter went, or was tried, in the same step as the deletion.
 */
export async function ladder(o: Ladder): Promise<Laddered> {
  const out: Laddered = { lapsed: 0, sent: 0, deleted: 0, failed: 0 };
  const rows = await o.due(o.now);
  out.lapsed = rows.length;
  for (const row of rows) {
    if (row.slug === null) continue;
    try {
      const told = toldOf(row.told);
      const days = Math.floor((o.now - row.lapsed_at) / DAY_MS);
      const deletesOn = row.lapsed_at + LAPSE_DELETES_DAYS * DAY_MS;
      const vars: MailVars = { record: row.slug, until: dayOf(deletesOn) };
      const link = o.link?.(row.slug);
      if (link !== undefined) vars.link = link;

      const owed = NOTICES.find((day) => days >= day && !told.has(day));
      if (owed !== undefined) {
        const kind: MailKind = owed === 0 ? 'lapse.0' : owed === 60 ? 'lapse.60' : 'lapse.83';
        if (!(await letter(o, kind, await addressesOf(o, row), vars))) {
          out.failed++;
          o.speak?.({ op: 'walk', rec: row.record, billing: kind, ok: false, why: 'no address took the letter; it goes again tomorrow' }, 'error');
          continue;
        }
        out.sent++;
        if (!(await o.told(row.record, owed))) {
          out.failed++;
          o.speak?.({ op: 'walk', rec: row.record, billing: kind, ok: false, why: 'the letter went and the Directory did not write it down, so it may go twice' }, 'error');
          continue;
        }
        o.speak?.({ op: 'walk', rec: row.record, billing: kind, ok: true, days }, 'info');
        continue;
      }

      if (days < LAPSE_DELETES_DAYS || !NOTICES.every((day) => told.has(day))) continue;
      /* ASKED AGAIN, NOW. `due` was read at the start of the ladder, and a payment that landed since then has emptied
         `told` and made the row `active`; a deletion from the stale read is the one mistake this file cannot undo. */
      if (!(await o.lapsed(row.record))) continue;
      /* THE ADDRESSES BEFORE THE DELETION, because the owners are read from the record, and after it there is none. */
      const to = await addressesOf(o, row);
      await o.destroy(row.record);
      out.deleted++;
      const gone: MailVars = { record: row.slug, until: dayOf(o.now + FINAL_KEPT_MS) };
      const told90 = await letter(o, 'lapse.90', to, gone);
      if (told90) out.sent++;
      else out.failed++;
      o.speak?.({ op: 'walk', rec: row.record, billing: 'deleted', ok: true, days, letter: told90 }, told90 ? 'info' : 'error');
    } catch (e) {
      out.failed++;
      o.speak?.({ op: 'walk', rec: row.record, billing: 'failed', ok: false, why: reason(e) }, 'error');
    }
  }
  return out;
}
