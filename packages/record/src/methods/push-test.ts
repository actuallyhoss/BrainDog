/**
 * A person proves a phone rings, on their own press: `pushTest`, DATA, a person's own as `setPref` is.
 *
 * ONE `notify.push` PER SUBSCRIPTION THE CALLER HOLDS, AND NOBODY ELSE'S. Turning push on keeps a row in `push_sub`
 * (`packages/record/src/push.ts`), and until now nothing told anybody whether it still rang: a dead subscription was
 * found only when a real notice never arrived. The jobs go in through the kernel's own queue (`kernel.outbox`), in the
 * `{ sub: { id } }` shape the Worker's deliverer reads (`apps/worker/src/deliver.ts`), so a 404 or 410 drops the dead
 * row the way it does for any other push, and an eighth failure is the outbox's fault `outbox#notify.push`, never a
 * question (`deadLetter` in `kernel/src/outbox.ts`).
 *
 * A PERSON, NOT A TOKEN, for `subscribePush`'s reason: a phone is somebody's, and an agent has no lock screen. Any level
 * may, since the push rings only the caller's own devices.
 *
 * NOTHING OF THE RECORD IN IT. The title and body are fixed words, and the Worker sends a push with no body at all
 * (`apps/worker/src/vapid.ts`), so the service worker shows its one fixed line. `test: true` marks the job so the rate
 * below can find it, and so the hour's interrupt count can leave it out (a blocked line in `kernel/src/index.ts`).
 *
 * ONCE A MINUTE PER PERSON, counted over the outbox rather than a new column: the newest test job that names one of
 * the caller's subscriptions is the last press. A press inside the minute is `RATE_LIMITED` with the seconds left.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The fixed words a test push carries. Nothing in them names the record, a person or a thing in it. */
export const TEST_PUSH = { title: 'BrainDog test', body: 'If you can see this, notifications reach this device.' } as const;

/** How long one person waits between two test pushes. */
export const PUSH_TEST_EVERY_MS = 60_000;

export type PushTested = { devices: number; line: string };

/** The answer's sentence, by how many devices were rung. */
export function testLine(devices: number): string {
  if (devices === 0) return 'No device of yours has notifications turned on, so nothing was sent. Turn them on first.';
  return `Sent to ${devices} ${devices === 1 ? 'device' : 'devices'}. It should arrive within a minute.`;
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, no, tail, clock } = deps;

  return {
    /**
     * Ring each of your own devices once: one push per subscription you hold. Takes nothing. Answers `{ devices, line }`,
     * `devices` 0 with its own sentence when you hold none, and refuses a second press inside a minute.
     */
    async pushTest(args: unknown, ctx: CallContext): Promise<Result<PushTested>> {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'person') return no('FORBIDDEN', "A test push rings a person's own phone, and a token is not a person.", { at: 'principal' });
      if (args !== undefined && args !== null && (typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length > 0))
        return no('FIELD_UNKNOWN', 'pushTest takes nothing: it rings every device you turned notifications on for.', { at: Object.keys(args as object)[0] ?? 'args', allowed: [] });
      const person = ctx.principal.id;
      const subs = sql.all<{ id: string }>('SELECT id FROM push_sub WHERE person_id = ? ORDER BY id', person).map((r) => r.id);
      if (subs.length === 0) return { ok: true, value: { devices: 0, line: testLine(0) } };

      const now = clock.now();
      const marks = subs.map(() => '?').join(', ');
      const last = sql.one<{ at: string | null }>(
        `SELECT max(created) AS at FROM outbox WHERE kind = 'notify.push' AND json_extract(payload, '$.test') = 1
           AND json_extract(payload, '$.sub.id') IN (${marks})`,
        ...subs,
      )?.at;
      const since = last ? now - Date.parse(last) : Infinity;
      if (since < PUSH_TEST_EVERY_MS) {
        const wait = Math.max(1, Math.ceil((PUSH_TEST_EVERY_MS - since) / 1000));
        return {
          ok: false,
          refusal: {
            code: 'RATE_LIMITED',
            fix: `A test went out a moment ago. The next one can go in ${wait} ${wait === 1 ? 'second' : 'seconds'}.`,
            at: 'principal',
            retry_after: wait,
          },
        };
      }

      kernel.transaction(() => {
        for (const id of subs) kernel.outbox('notify.push', { sub: { id }, test: true, ...TEST_PUSH });
      });
      /* THE TAIL RINGS THE DOORBELL, so the Worker leases the jobs now and not at the next unrelated write. */
      return tail({ ok: true as const, value: { devices: subs.length, line: testLine(subs.length) } });
    },
  };
}
