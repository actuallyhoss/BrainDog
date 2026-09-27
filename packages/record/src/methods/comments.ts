/**
 * The record's methods for comments: `comments`, `comment` and `resolveComment` (`loop/finish/contracts.md` §2.5,
 * `docs/20-COLLABORATION.md` §5). The kernel's half, how a comment is written and read back, is
 * `packages/kernel/src/api/comments.ts`; the route rows are `packages/host/src/routes/comments.ts`.
 *
 * WHO SEES WHAT A COMMENT IS ON IS ASKED ONCE, BY `sightOf`, and every method here asks it. `sightOf` is `index.ts`'s,
 * because it is the question `lineOf` already asks of a row, a question and a decision (`readable`, `holds`, `nameOf`),
 * and a second copy of it here would be a second rule that could drift from the first. It answers what the caller calls
 * the thing, or `null` when she may not see it, and a thing she may not see is answered in the sentence a thing that is
 * not there gets, so no refusal tells her which of the two it was.
 *
 * READ+ TO READ A THREAD AND DATA TO WRITE ONE. Anybody who reads a thing may say something about it, a colleague
 * invited at Reads included, because a comment changes no field (`docs/20` §5). A token is held to `propose`, the rung
 * an agent's other words on the record need, so a read-only token reads a thread and writes nothing to it.
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import type { Kernel } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import { isHandle, spokenOf } from '../question-handles.ts';
import type { RecordDeps } from './index.ts';

/** One line of a thread, and how a comment was resolved, as the kernel answers them. */
type CommentLine = ReturnType<Kernel['commentsOn']>[number];
type CommentResolved = NonNullable<CommentLine['resolved']>;

/** The two kinds of thing other than a row a comment may be on, and the letter their handle opens with. */
const GOVERNED = { suggestion: 'q.', decision: 'd.' } as const;

/**
 * The sentence for a thing that is not there and for a thing the caller may not see, which must be the same sentence.
 *
 * IT QUOTES NO EXAMPLE ID, because a refusal's words may reach a screen (COL-8 shows them) and no id is shown to a
 * person there (`loop/finish/rules.md` §2). The shapes `on` takes are in the route row and `docs/20` §5.
 */
const NOTHING = 'There is nothing by that name you can read. Name a row as it is spoken, or a question or a decision by the name you were given for it.';

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, scoped, sightOf, no, tail } = deps;

  /**
   * The rung a comment and a resolution need of the caller before anything is looked up: `read` for a person, who says
   * what she sees, and `propose` for a token, as an agent's other words on the record are held.
   */
  const says = (ctx: CallContext) => (ctx.principal.kind === 'token' ? 'propose' : 'read');

  /**
   * Who signs a comment: a person as herself, and a token as `agent:<name>`, which is what `writerOf` in `index.ts` signs
   * an agent's write with when no run is found. A token is never signed as the person who holds it, for `writerOf`'s
   * reason: a person's name on an agent's words is the attribution the record does not make.
   */
  const actorOf = (ctx: CallContext): string =>
    ctx.principal.kind === 'token' ? `agent:${ctx.session?.agent ?? 'other'}` : ctx.principal.id;

  /**
   * What `on` names, as the log keys it (`entry:<id>`, `suggestion:SG5`, `decision:D4`), with the list a row is on, or
   * `null` for anything the caller may not see or that is not there.
   *
   * A HANDLE IS TURNED BACK INTO ITS NUMBER FIRST, as `governance` turns one, so a hidden question named by handle meets
   * the same `sightOf` as one named by its number. A handle of the other kind (`decision:q.<id>`) names nothing.
   */
  const targetOf = (ctx: CallContext, on: unknown): { target: string; list: string | null } | null => {
    if (typeof on !== 'string') return null;
    const said = on.trim();
    for (const kind of ['suggestion', 'decision'] as const) {
      if (!said.startsWith(`${kind}:`)) continue;
      const given = said.slice(kind.length + 1);
      const number = isHandle(given) ? (given.startsWith(GOVERNED[kind]) ? spokenOf(sql, given) : null) : given;
      if (number === null || number === '') return null;
      const target = `${kind}:${number}`;
      return sightOf(ctx, target) === null ? null : { target, list: null };
    }
    /* A ROW BY ITS SPOKEN ID, ITS PREFIX (`T3`) OR ITS ID, as `get` takes one. A deleted row has no thread to add to. */
    const row = said === '' ? null : kernel.get(said);
    if (row === null) return null;
    const target = `entry:${row.id}`;
    return sightOf(ctx, target) === null ? null : { target, list: row.register };
  };

  return {
    /**
     * Every comment and reply on one row, question or decision, oldest first, each comment with how it was resolved.
     * READ+. A thing the caller may not see is answered as a thing that is not there, so it has no comments to count.
     */
    async comments(args: { on: string }, ctx: CallContext): Promise<Result<CommentLine[]>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const at = targetOf(ctx, args?.on);
      if (at === null) return no('REF_UNKNOWN', NOTHING, { at: 'on' });
      return ok(kernel.commentsOn(at.target));
    },

    /**
     * Say something about one row, question or decision the caller may see, or reply under a comment on it with
     * `reply_to`, in `COMMENT_MOST` characters or fewer (`kernel/src/api/comments.ts`). DATA. Answers the new line's id.
     */
    async comment(args: { on: string; body: string; reply_to?: string }, ctx: CallContext): Promise<Result<{ id: string }>> {
      const stop = scoped(ctx, says(ctx));
      if (stop) return { ok: false, refusal: stop };
      const at = targetOf(ctx, args?.on);
      if (at === null) return no('REF_UNKNOWN', NOTHING, { at: 'on' });
      /* AND THE ROW'S OWN LIST, for a token: `scoped` asked whether any grant reaches `propose`, and this asks the one
         the row is on, as `propose` and `log` are held to the list they are about. */
      if (at.list !== null && ctx.principal.kind === 'token') {
        const held = guard(ctx, 'propose', at.list);
        if (held) return { ok: false, refusal: held };
      }
      return tail(
        kernel.writeComment({
          target: at.target,
          body: args?.body,
          ...(args?.reply_to === undefined ? {} : { reply_to: args.reply_to }),
          actor: actorOf(ctx),
        }),
      );
    },

    /**
     * Resolve one comment as `addressed`, `wont-fix` or `incorrect`, with the reason. DATA. Its author may, and so may
     * whoever may change what it is on: `write` on a row's list, `decide` for a question or a decision.
     *
     * THE AUTHOR IS A PERSON. A token signs as `agent:<name>`, which every token of that agent shares, so being its
     * author proves nothing about which key is asking; a token resolves only through the rung the thing asks.
     */
    async resolveComment(
      args: { id: string; as: 'addressed' | 'wont-fix' | 'incorrect'; why: string },
      ctx: CallContext,
    ): Promise<Result<{ id: string; resolved: CommentResolved }>> {
      const stop = scoped(ctx, says(ctx));
      if (stop) return { ok: false, refusal: stop };
      const held = typeof args?.id === 'string' ? kernel.commentOf(args.id.trim()) : null;
      /* THE COMMENT'S SENTENCE FOR A COMMENT ON SOMETHING SHE MAY NOT SEE, which is the kernel's for one that is not
         there, so the two cannot be told apart. */
      if (held === null || sightOf(ctx, held.target) === null)
        return no('REF_UNKNOWN', 'There is no comment by that id you can read.', { at: 'id' });
      const author = ctx.principal.kind === 'person' && held.by === ctx.principal.id;
      if (!author) {
        const row = held.target.startsWith('entry:') ? kernel.get(held.target.slice('entry:'.length)) : null;
        const may = row !== null ? guard(ctx, 'write', row.register) : guard(ctx, 'decide');
        if (may)
          return no('FORBIDDEN', 'A comment is resolved by whoever wrote it, or by somebody who may change what it is on.', {
            at: 'id',
          });
      }
      return tail(kernel.writeResolution({ id: held.id, as: args?.as, why: args?.why, actor: actorOf(ctx) }));
    },
  };
}
