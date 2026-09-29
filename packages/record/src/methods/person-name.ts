/**
 * A person changes their own name: `renamePerson`, DATA, a person's own as `setPref` is.
 *
 * ONLY THE CALLER'S OWN NAME, AND ONLY A PERSON. A token acts for somebody and is not them, and a shared link is
 * nobody at all, so both are refused: a name is how everybody else in the record knows who wrote a row, and changing
 * it is the person's own act, signed by them in History.
 *
 * WHAT IS KEPT AND HOW IT IS LOGGED IS THE KERNEL'S (`kernel/src/api/person-name.ts`): this record's mirror of the
 * person and an `edit` event on them. THE DIRECTORY FOLLOWS: where this host keeps it beside the record (the self-host)
 * it is written here, and where it is another object (the Worker) the host writes it after this answers, with every
 * other record the person belongs to (`renameAsked` in `packages/host/src/auth.ts`).
 *
 * The sign-in address is not here. It moves only through a link mailed to the new address, which is the account's
 * (`POST /account/email` and `/account/email/confirm` in `packages/host/src/auth.ts`), because a record method cannot
 * prove anybody reads a mailbox.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

export function methods(deps: RecordDeps) {
  const { kernel, guard, no, tail, directory } = deps;

  return {
    /**
     * Change your own name: `{ name }`, trimmed, 1 to 80 characters, and never a template field nobody filled in.
     * Answers `{ name }` as kept. The same name again changes nothing and writes nothing.
     */
    async renamePerson(args: { name?: unknown } | undefined, ctx: CallContext): Promise<Result<{ name: string }>> {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'person')
        return no('FORBIDDEN', 'A name is changed by the person it belongs to, signed in, and not by a token or a shared link.', { at: 'principal' });
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      const out = kernel.renamePerson(ctx.principal.id, args?.name);
      /* THE DIRECTORY'S REFUSAL DOES NOT UNDO THE RECORD'S NAME. The kernel has judged the name by the same rule the
         Directory bounds it by, so a refusal here is a Directory without this person, which the next sign-in says. */
      if (out.ok && directory) directory.renamePerson(ctx.principal.id, out.value.name);
      return tail(out);
    },
  };
}
