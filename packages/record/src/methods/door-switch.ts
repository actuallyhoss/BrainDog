/**
 * A door switched off and on again without losing its address: `doorSwitch({ ingest, on })` (ADMIN), and the three reads
 * the host and the doors list ask of it.
 *
 * THERE WAS "no way to switch a door off". The only way to stop a door was to retire its declaration, which
 * drops its token (`heldDigest` in `index.ts`), so a sender stopped for an afternoon needed a new address the morning
 * after. Off is kept BESIDE the digest and never in place of it: `ingest_off.<id>` holds the instant it went off, and
 * `ingest_token.<id>` is not touched, so turning it on again is the same address the sender already posts to.
 *
 * `dog_meta` FOR `ingestTokenKey`'s REASON: no table is created and no migration is needed. The count of arrivals turned
 * away is one more key, `ingest_away.<id>`, a JSON object of UTC days to counts that keeps the last seven days and no
 * more, so a door left off for a year is one short row and not a year of them.
 *
 * NOTHING HERE READS THE DIGEST. `doorFacts` answers on or off, since when, and the arrivals the record already keeps
 * (`ingest_receipt`, which `doors-silent` in `kernel/src/signs-actions.ts` counts by too), and the event names the door
 * and who switched it, never the token or what it hashes to.
 */

import { ulids } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';
import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import { FRESH, type CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** Where a door's off state lives: the instant it went off, as ISO 8601. Absent is on. */
export const doorOffKey = (ingest: string): string => `ingest_off.${ingest}`;

/** Where a door's turned-away counts live: `{ "2026-10-15": 3, ... }`, UTC days, the last `AWAY_DAYS` of them. */
export const doorAwayKey = (ingest: string): string => `ingest_away.${ingest}`;

/** How many days of turned-away counts are kept, and the window every count in `doorFacts` covers. */
export const AWAY_DAYS = 7;

const DAY = 86_400_000;

/** One door as the doors list says it, beside what `doors` already answered. Never the digest. */
export type DoorFacts = {
  on: boolean;
  /** When it went off, ISO 8601, or `null` while it is on. */
  offSince: string | null;
  /** The newest arrival the record filed through it, ISO 8601, or `null` for none yet. */
  lastArrival: string | null;
  /** Arrivals filed through it in the last `AWAY_DAYS` days. */
  arrivals: number;
  /** Arrivals answered 410 and not stored, in the last `AWAY_DAYS` days. */
  turnedAway: number;
};

const meta = (sql: Sql, key: string): string | undefined => sql.one<{ value: string }>('SELECT value FROM dog_meta WHERE key = ?', key)?.value;

const put = (sql: Sql, key: string, value: string): void => {
  sql.exec('INSERT INTO dog_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
};

/** The UTC day of an instant, `YYYY-MM-DD`. */
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The first day inside the window that ends on `nowMs`'s day: today and the six before it. */
const windowFrom = (nowMs: number): string => dayOf(nowMs - (AWAY_DAYS - 1) * DAY);

/**
 * The turned-away counts as kept, cut to the window. A row somebody wrote by hand, or one this file never wrote, reads
 * as nothing turned away rather than throwing on the door's hot path.
 */
function awayDays(sql: Sql, ingest: string, nowMs: number): Record<string, number> {
  const raw = meta(sql, doorAwayKey(ingest));
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const from = windowFrom(nowMs);
  const out: Record<string, number> = {};
  for (const [day, n] of Object.entries(parsed as Record<string, unknown>))
    if (/^\d{4}-\d{2}-\d{2}$/u.test(day) && day >= from && Number.isInteger(n) && (n as number) > 0) out[day] = n as number;
  return out;
}

const sum = (days: Record<string, number>): number => Object.values(days).reduce((a, n) => a + n, 0);

/** When the door went off, or `null` while it is on. */
export function doorIsOff(sql: Sql, ingest: string): string | null {
  return meta(sql, doorOffKey(ingest)) ?? null;
}

/**
 * Count one arrival the host turned away at this door, today, and answer the count for the window.
 *
 * THE HOST CALLS IT ONLY FOR A DOOR THAT IS OFF (`IngestDoor.turnedAway` in `packages/host/src/ingest.ts`), and it does
 * not ask again: the answer the host already gave was 410, and a count that refused to add would only lose that fact.
 * Days older than the window are dropped on the same write, which is what keeps the row at seven days at most.
 */
export function turnedAway(sql: Sql, ingest: string, nowMs: number): number {
  const days = awayDays(sql, ingest, nowMs);
  const today = dayOf(nowMs);
  days[today] = (days[today] ?? 0) + 1;
  put(sql, doorAwayKey(ingest), JSON.stringify(days));
  return sum(days);
}

/**
 * On or off, since when, the newest arrival, and the window's arrivals and turned away, for one door.
 *
 * ARRIVALS ARE RECEIPTS, counted by the arrival they belong to. `ingest_id` is the bare id on every receipt the kernel
 * writes; the prefixed spelling is read as well because `observe.ts` strips one, and a count that missed half a door's
 * arrivals would say it was quiet when it was not.
 */
export function doorFacts(sql: Sql, ingest: string, nowMs: number): DoorFacts {
  const offSince = doorIsOff(sql, ingest);
  const ids = [ingest, `ingest.${ingest}`];
  const last = sql.one<{ ts: string | null }>('SELECT max(ts) AS ts FROM ingest_receipt WHERE ingest_id IN (?, ?)', ...ids)?.ts ?? null;
  const from = new Date(Date.parse(`${windowFrom(nowMs)}T00:00:00Z`)).toISOString();
  const arrivals = Number(sql.one<{ n: number }>('SELECT count(DISTINCT raw_id) AS n FROM ingest_receipt WHERE ingest_id IN (?, ?) AND ts >= ?', ...ids, from)?.n ?? 0);
  return { on: offSince === null, offSince, lastArrival: last, arrivals, turnedAway: sum(awayDays(sql, ingest, nowMs)) };
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, admin, no, tail, clock } = deps;
  const mint = ulids(() => clock.now());
  return {
    /**
     * Switch one webhook door off or on. ADMIN, routed as `/api/doorSwitch`.
     *
     * AN OWNER, IN A BROWSER, as `ingestMint` is, and a token of any kind is refused `NEEDS_BROWSER_SESSION` by `admin`:
     * an agent that could turn a door on would be opening a door it was never shown. TURNING ON ASKS FOR A SIGN-IN FROM
     * THE LAST FIFTEEN MINUTES and turning off does not, because on lets rows in at `exact` again and off only stops
     * them; a person stopping a flood of forgeries should not be sent to sign in first.
     *
     * SWITCHING TO THE STATE IT IS IN WRITES NOTHING, so off twice keeps the first instant and one event, and the line
     * "Off since 3 October" stays true.
     */
    async doorSwitch(args: { ingest?: unknown; on?: unknown } | undefined, ctx: CallContext): Promise<Result<{ ingest: string } & DoorFacts>> {
      const stop = admin(ctx, 'switch a door off or on');
      if (stop) return { ok: false as const, refusal: stop };
      if (ctx.credentialed === false)
        return {
          ok: false as const,
          refusal: {
            code: 'NEEDS_BROWSER_SESSION',
            fix: 'This BrainDog was started without BRAINDOG_SERVER_KEY, so nothing here can prove who is asking. Start it with BRAINDOG_SERVER_KEY set, then sign in from the app.',
            at: 'principal',
          },
        };
      const ingest = args?.ingest;
      if (typeof ingest !== 'string' || ingest === '') return no('REQUIRED_MISSING', 'Which door? Name it by its id.', { at: 'ingest' });
      if (typeof args?.on !== 'boolean') return no('REQUIRED_MISSING', 'Say on: true to open the door or on: false to switch it off.', { at: 'on' });
      const on = args.on;
      if (on && ctx.provedAt !== undefined && clock.now() - ctx.provedAt > FRESH)
        return { ok: false as const, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to switch this door back on. It is still off.', at: 'proof' } };

      const row = kernel.declarations().find((d) => d.kind === 'ingest' && d.id === `ingest.${ingest}`);
      if (!row) return no('DECLARATION_UNKNOWN', `There is no door called ${ingest} here.`, { at: 'ingest' });
      const decl = JSON.parse(row.body) as { channel?: unknown };
      if (decl.channel !== 'webhook')
        return no('VALUE_MALFORMED', `${ingest} arrives by ${String(decl.channel)}, and only a web address is switched off here.`, { at: 'ingest' });

      const now = clock.now();
      const was = doorIsOff(sql, ingest);
      if ((was === null) !== on) {
        /* ONE EVENT, IN THE SAME TRANSACTION AS THE STATE, naming the door and who switched it. `state` because the
           event kinds are closed (`0001_kernel.ts`, a new kind is a migration) and this is a door's state changing;
           `field` and the two values say which way. The digest is never written here. */
        kernel.transaction(() => {
          if (on) sql.exec('DELETE FROM dog_meta WHERE key = ?', doorOffKey(ingest));
          else put(sql, doorOffKey(ingest), new Date(now).toISOString());
          sql.exec(
            "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v) VALUES (?, ?, ?, 'state', ?, 'ingest', 'on', ?, ?)",
            mint(),
            new Date(now).toISOString(),
            ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id,
            `door:${ingest}`,
            JSON.stringify(!on),
            JSON.stringify(on),
          );
        });
      }
      return tail(ok({ ingest, ...doorFacts(sql, ingest, now) }));
    },
  };
}
