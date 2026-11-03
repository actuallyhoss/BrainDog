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

/**
 * One subscription as a deliverer posts to it. THE KEYS AND `open` COME ONLY WITH A JOB THAT NAMES WHERE IT OPENS (E44 of
 * 24 October): a path in this record, a handle and never a word ("/decide/sg_..."), which the deliverer encrypts to the
 * phone's keys (RFC 8291) so a tap opens the thing that needs him. A job with none is still a push with no body.
 */
export type PushTarget = { id: string; endpoint: string; open?: string; kind?: PushKind; keys?: { p256dh: string; auth: string } };

/**
 * WHAT A PUSH IS ABOUT, AS ONE WORD FROM A CLOSED LIST, so the phone can say which kind of thing it is and a person can
 * turn each kind off (`push.off`, their own preference). Never a word anybody wrote: `needs` is something waiting on
 * him in Needs you, `agents` an agent asking or finishing, `money` a money list's notice (a bill or instalment due),
 * `summary` the morning and evening summary, `people` a colleague who handed you something, named you in a comment, or
 * joined from your invitation (collab pass 2, 2 Nov).
 */
export const PUSH_KINDS = ['needs', 'agents', 'money', 'summary', 'people'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** The person's own preference that names the kinds they turned off on every phone (`setPref`). */
export const PUSH_OFF = 'push.off';

/** The money lists whose notices are `money`: what is due, owed or repeating. */
const MONEY_LISTS = new Set(['installments', 'obligations', 'recurring', 'bills', 'invoices', 'subscriptions', 'plans', 'transactions', 'accounts']);

/**
 * The kind of a push from what its job already carries: its cause (`asked.` an agent's question, `instruction.` an
 * agent's finished or stuck work) and where it opens. Anything else is something that needs him.
 */
export function pushKindOf(p: { cause?: unknown; url?: unknown; open?: unknown } | null | undefined): PushKind {
  const cause = typeof p?.cause === 'string' ? p.cause : '';
  const at = typeof p?.open === 'string' ? p.open : typeof p?.url === 'string' ? p.url : '';
  if (at.startsWith('/agents/summary/')) return 'summary';
  if (cause.startsWith('asked.') || cause.startsWith('instruction.')) return 'agents';
  const list = /^\/r\/([A-Za-z0-9_-]+)/u.exec(at)?.[1];
  if (list !== undefined && MONEY_LISTS.has(list)) return 'money';
  return 'needs';
}

/** A kind as a job carries it, or `null` for anything that is not one. */
export const pushKindIn = (v: unknown): PushKind | null => ((PUSH_KINDS as readonly unknown[]).includes(v) ? (v as PushKind) : null);

/**
 * A path a push may open: one of the app's own screens in this record (Decide, Agents, Inbox, a list), made of handle
 * characters, and short. Anything else is no path, so a push that names one opens the record's home, as every push did
 * before. A digest opens its summary's screen, `/agents/summary/<id>`. `/decide/sg_01J...`, `/p/agents`, `/r/tasks/e_9`.
 * `p` IS A PAGE, `/p/agents` among them: `tellFinished` has always sent a finished instruction there, and without `p` here
 * that path was dropped and the tap opened Today. `addons` IS AN ADD-ON'S OWN PAGE, which its notices open (`ctx.notify`).
 */
export const PUSH_OPEN = /^\/(?:decide|agents|inbox|r|p|addons)(?:\/[A-Za-z0-9_-]{1,64}){0,3}$/u;
export const pushOpenOf = (url: unknown): string | null => (typeof url === 'string' && PUSH_OPEN.test(url) ? url : null);

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
export function ownersPushSubs(sql: Sql, kind?: PushKind): string[] {
  /* AND, FOR A PUSH OF ONE KIND, NOT THE PHONES OF AN OWNER WHO TURNED THAT KIND OFF (`push.off`, a list of kinds). */
  const off =
    kind === undefined
      ? ''
      : `AND NOT EXISTS (SELECT 1 FROM pref f, json_each(f.value) j
           WHERE f.person_id = s.person_id AND f.key = '${PUSH_OFF}' AND j.value = ?)`;
  return sql
    .all<{ id: string }>(
      `SELECT DISTINCT s.id FROM push_sub s
         JOIN member m ON m.person_id = s.person_id AND m.register = '*' AND m.level = 'owner'
         JOIN person p ON p.id = s.person_id AND p.suspended_at IS NULL
       WHERE 1 = 1 ${off}
       ORDER BY s.id`,
      ...(kind === undefined ? [] : [kind]),
    )
    .map((r) => r.id);
}

/**
 * ONE PERSON'S SUBSCRIPTIONS, for a push about them and nobody else (collab pass 2, 2 Nov): a row handed to them, a comment
 * naming them, somebody joining from their invitation. Owner or not, since what it is about is theirs. Never a suspended
 * person's, and never for a kind they turned off (`push.off`), as `ownersPushSubs` holds an owner's.
 */
export function personPushSubs(sql: Sql, person: string, kind: PushKind): string[] {
  return sql
    .all<{ id: string }>(
      `SELECT s.id FROM push_sub s JOIN person p ON p.id = s.person_id AND p.suspended_at IS NULL
        WHERE s.person_id = ?
          AND NOT EXISTS (SELECT 1 FROM pref f, json_each(f.value) j WHERE f.person_id = s.person_id AND f.key = '${PUSH_OFF}' AND j.value = ?)
        ORDER BY s.id`,
      person,
      kind,
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
 * THE LEASE IS THE AUTHORITY, CHECKED THE THREE WAYS `sealedGrant` CHECKS IT (`keychain.ts`), for the same three attacks: a
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
  if (id === null) return ok(null);
  const target = pushTargets(sql, [id])[0] ?? null;
  if (target === null) return ok(null);
  let open: string | null = null;
  let kind: PushKind | null = null;
  try {
    const payload = JSON.parse(job.payload) as { open?: unknown; kind?: unknown } | null;
    open = pushOpenOf(payload?.open);
    kind = pushKindIn(payload?.kind);
  } catch {
    open = null;
  }
  if (open === null) return ok(target);
  const keys = sql.one<{ p256dh: string; auth: string }>('SELECT p256dh, auth FROM push_sub WHERE id = ?', id);
  /* THE KIND RIDES WITH THE PATH, a word from `PUSH_KINDS` and never a word anybody wrote, so the phone says what kind of
     thing it is ("An agent is asking you something") and still nothing of what. */
  return ok(keys ? { ...target, open, ...(kind ? { kind } : {}), keys: { p256dh: keys.p256dh, auth: keys.auth } } : target);
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
