/**
 * The owner hands a question to the one person who decides it: `setDecider({ id, to })` (ADMIN), USE-A13.
 *
 * `setDecider` AND NOT `handQuestion`, the name the unit was written with, because `core-names` reads a method name as a
 * string the core ships, and `question` is a field an add-on declares. The kernel's call keeps the unit's name.
 *
 * `docs/20-COLLABORATION.md` says "one named person decides", and until this nothing could name her: any member who may
 * decide answered any question. An owner names a member who holds Decides, or another owner, and `decide` then answers
 * anybody else who may decide "This one is Ada's to decide." (`deciderFault` in `kernel/src/govern.ts`). No `to` takes it
 * back, and the question is anybody's who may decide again.
 *
 * THE OWNER'S, IN A BROWSER, as every method that changes who may do what is: a token acts for somebody and never says who
 * answers for the record. WHAT IS KEPT IS THE KERNEL'S: one note on the question, the newest of which is who decides, so
 * no migration and History says who handed it to whom.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What handing answers: the question, and who decides it now, `null` when nobody is named. */
export type Handed = { id: string; decider: string | null };

/**
 * The kernel's call this needs (`handQuestion` in `govern.ts`). Read off the kernel once it carries it; a host or a test
 * may hand it in meanwhile.
 */
export type Hands = { handQuestion: (id: string, to: string | null, by: string) => Result<Handed> };

/** The sentence a name that cannot decide is refused with, the kernel's own words. */
const cannot = (name: string): string => `${name} cannot decide here. Name somebody who can, or nobody.`;

export function methods(deps: RecordDeps, given?: Hands) {
  const { kernel, admin, no, tail } = deps;
  const hands: Partial<Hands> = given ?? (kernel as unknown as Partial<Hands>);

  /** A member's name as People shows it, never an id. Somebody not on the record has none to say. */
  const nameOf = (person: string): string => {
    const m = kernel.members().find((r) => r.person_id === person);
    return m?.name?.trim() || m?.email?.trim() || 'That person';
  };

  return {
    /**
     * Hand one open question to `to`, a member who holds Decides or owns the record, by their person id; no `to` (or
     * `null`) takes it back. Answers `{ id, decider }`. A settled question is refused, and so is a name that cannot decide.
     */
    async setDecider(args: { id?: unknown; to?: unknown } | undefined, ctx: CallContext): Promise<Result<Handed>> {
      const stop = admin(ctx, 'hand a question to somebody', 'setDecider');
      if (stop) return { ok: false, refusal: stop };
      if (typeof args?.id !== 'string' || args.id.trim() === '') return no('REQUIRED_MISSING', 'Which question? Name it by its id.', { at: 'id' });
      const to = args.to === undefined || args.to === null || args.to === '' ? null : args.to;
      if (to !== null && typeof to !== 'string') return no('VALUE_MALFORMED', 'to is the person who decides it, or leave it out for nobody.', { at: 'to' });
      if (to !== null) {
        const level = kernel.access(to)?.level ?? null;
        if (level !== 'decide' && level !== 'owner') return no('VALUE_MALFORMED', cannot(nameOf(to)), { at: 'to' });
      }
      if (typeof hands.handQuestion !== 'function') return no('NOT_IN_THIS_BUILD', 'Handing a question to somebody is not in this build yet.', { at: 'id' });
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      const by = ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id;
      return tail(hands.handQuestion(args.id.trim(), to, by));
    },
  };
}
