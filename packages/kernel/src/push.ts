/**
 * The kernel's half of a phone's subscription (`push_sub`, migration 14): who a `notify.push` rings, the addresses
 * behind them, and what the push service said back.
 *
 * THE WRITES ARE NOT HERE. `subscribePush` and `unsubscribePush` are the record's (`packages/record/src/push.ts`),
 * because whether a caller is a person and whether the row is theirs are the record's questions. What is here is what
 * the outbox's deliverer needs, and none of it takes a caller: it is the kernel answering the kernel's own job.
 *
 * A JOB NAMES SUBSCRIPTIONS BY ID AND THE ENDPOINTS COME OUT UNDER THE LEASE. The outbox travels in every `.brain`
 * file and `push_sub` does not (`0014_push.ts`), so the digest queues one job per id `ownersPushSubs` answers, each
 * `{ sub: { id } }`, and `leasedPushTarget` is what a host asks for once it holds that job's lease. An endpoint in a
 * payload would be an address that rings somebody's phone, copied into every backup of the record.
 *
 * `51 §5`: A 404 OR 410 FROM THE PUSH SERVICE MEANS THE BROWSER THREW THE SUBSCRIPTION AWAY, and nothing will bring
 * that endpoint back, so `settlePush` deletes the row rather than counting a failure against it. Any other answer is
 * the retry ladder's (`outbox.ts`), and the row stays.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

/** One subscription as a deliverer posts to it. The keys are left out: a content-free push encrypts nothing. */
export type PushTarget = { id: string; endpoint: string };

/** What one delivery found: the ids the service accepted, and the ids it answered 404 or 410 for. */
export type PushSettled = { sent?: readonly string[]; gone?: readonly string[] };

const marks = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

/** Every subscription these people made, by id, oldest first. A person with none is an empty list, never another's. */
export function pushSubsOf(sql: Sql, persons: readonly string[]): string[] {
  if (persons.length === 0) return [];
  return sql
    .all<{ id: string }>(`SELECT id FROM push_sub WHERE person_id IN (${marks(persons.length)}) ORDER BY id`, ...persons)
    .map((r) => r.id);
}

/**
 * The owners' subscriptions, which is who a digest and an urgent notice ring (`digest.ts`).
 *
 * THE SAME OWNERS `owners()` IN `index.ts` MAILS: a member on `*` at `owner`, and not suspended. A suspended owner
 * cannot open the record the push would send them to, so ringing their phone is telling them about a door they are
 * locked out of.
 */
export function ownersPushSubs(sql: Sql): string[] {
  return sql
    .all<{ id: string }>(
      `SELECT DISTINCT s.id FROM push_sub s
         JOIN member m ON m.person_id = s.person_id AND m.register = '*' AND m.level = 'owner'
         JOIN person p ON p.id = s.person_id AND p.suspended_at IS NULL
       ORDER BY s.id`,
    )
    .map((r) => r.id);
}

/**
 * The endpoints behind these ids, for a host holding the job's lease.
 *
 * AN ID WITH NO ROW IS LEFT OUT AND NOT REFUSED. Between the job being queued and leased, its person may have
 * unsubscribed or been erased, and a push the person turned off is one not to send.
 */
export function pushTargets(sql: Sql, ids: readonly string[]): PushTarget[] {
  if (ids.length === 0) return [];
  return sql
    .all<PushTarget>(`SELECT id, endpoint FROM push_sub WHERE id IN (${marks(ids.length)}) ORDER BY id`, ...ids)
    .map((r) => ({ id: r.id, endpoint: r.endpoint }));
}

/** What a `notify.push` job carries: the one subscription it rings, by id, and nothing else about the phone. */
export type PushJob = { sub: { id: string } };

/**
 * The id a `notify.push` payload names, or `null` for a payload that names none.
 *
 * `null` AND NOT A THROW, because a row written by an older build carries `{ title, url }` and no `sub`, and the answer
 * for it is the same as for a phone that has since unsubscribed: there is nobody to ring.
 */
export function pushSubOf(payload: string): string | null {
  try {
    const sub = (JSON.parse(payload) as { sub?: { id?: unknown } } | null)?.sub;
    return typeof sub?.id === 'string' && sub.id !== '' ? sub.id : null;
  } catch {
    return null;
  }
}

/**
 * The endpoint a leased `notify.push` rings, for the host holding its lease, or `null` when nobody is left to ring.
 *
 * THE LEASE IS THE AUTHORITY, CHECKED THE THREE WAYS `sealedGrant` CHECKS IT (`vault.ts`), for the same three attacks: a
 * finished job replayed, a lease another host has since taken, and a lease that has run out. An endpoint is not a key,
 * but it is the one thing that rings a person's phone, and it stays in `push_sub` (`local`) precisely so that nothing
 * outside the record reads it except a host that is delivering to it right now.
 *
 * AND THE JOB NAMES THE SUBSCRIPTION, NOT THE CALLER. `sealedGrant` takes the grant as an argument and refuses one the
 * payload does not name; here the caller passes no id at all, so a lease on one push opens the address of that push's
 * phone and no other. `null` is an answer rather than a refusal: the person unsubscribed or was erased between the job
 * being queued and leased, and a push they turned off is one not to send.
 */
export function leasedPushTarget(sql: Sql, nowMs: number, args: { outbox: string; leasedUntil: string }): Result<PushTarget | null> {
  const job = sql.one<{ state: string; leased_until: string | null; payload: string }>(
    "SELECT state, leased_until, payload FROM outbox WHERE id = ? AND kind = 'notify.push'",
    args.outbox,
  );
  if (!job) return no('OUT_OF_BOUNDS', `There is no push ${args.outbox}.`, { at: 'outbox' });
  if (job.state !== 'leased' || job.leased_until === null)
    return no('PULL_LEASE_EDGE', `${args.outbox} is ${job.state}, not leased, so no address is given out for it.`, { at: 'outbox' });
  if (job.leased_until !== args.leasedUntil)
    return no('PULL_LEASE_EDGE', `${args.outbox} was leased again since you took it, so this run is no longer the one holding it.`, { at: 'leasedUntil' });
  if (Date.parse(job.leased_until) <= nowMs)
    return no('PULL_LEASE_EDGE', `The lease on ${args.outbox} ran out at ${job.leased_until}. Take it again before sending it.`, { at: 'leasedUntil' });
  const id = pushSubOf(job.payload);
  return ok(id === null ? null : (pushTargets(sql, [id])[0] ?? null));
}

/**
 * What the push service answered: an accepted push marks its row as used, and a 404 or 410 deletes it.
 *
 * THE COUNTS ARE ROWS THAT CHANGED, so a second 410 for a row an earlier delivery already dropped is `dropped: 0`
 * rather than an error. Two digests queued in one minute are two deliveries to the same dead phone.
 */
export function settlePush(sql: Sql, settled: PushSettled, at: string): { used: number; dropped: number } {
  const count = (ids: readonly string[]): number =>
    ids.length === 0 ? 0 : Number(sql.one<{ n: number }>(`SELECT count(*) AS n FROM push_sub WHERE id IN (${marks(ids.length)})`, ...ids)?.n ?? 0);
  const sent = settled.sent ?? [];
  const gone = settled.gone ?? [];
  const used = count(sent);
  if (used > 0) sql.exec(`UPDATE push_sub SET used_at = ? WHERE id IN (${marks(sent.length)})`, at, ...sent);
  const dropped = count(gone);
  if (dropped > 0) sql.exec(`DELETE FROM push_sub WHERE id IN (${marks(gone.length)})`, ...gone);
  return { used, dropped };
}
