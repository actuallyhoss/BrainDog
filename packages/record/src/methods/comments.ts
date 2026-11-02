/**
 * The record's methods for comments: `comments`, `comment` and `resolveComment` (`docs/20-COLLABORATION.md` §5). The
 * kernel's half, how a comment is written and read back, is `packages/kernel/src/api/comments.ts`; the route rows are
 * `packages/host/src/routes/comments.ts`.
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
 *
 * ONE THREAD FOR A QUESTION AND THE DECISION THAT SETTLED IT. A decision named by its number reads, takes and resolves
 * the words of its question's thread (`targetOf`), the one the app mounts under a question open or settled.
 *
 * A BODY HOLDING `@Ada` RINGS ADA'S PHONE (collab pass 2, 2 Nov; HD.383 said "no mentions or notifications yet"): the
 * text is kept as it is, and the people it names who may see the row are told, with no word of it (`ringNamed`). And
 * on a question or a decision (leftovers 4, `ringNamedOn`), held to who may see the question.
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { COMMENT_MOST, type Kernel } from '@braindog/kernel';

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
 * IT QUOTES NO EXAMPLE ID, because a refusal's words may reach a screen (the app shows them) and no id is shown to a
 * person there. The shapes `on` takes are in the route row and `docs/20` §5.
 */
const NOTHING = 'There is nothing by that name you can read. Name a row as it is spoken, or a question or a decision by the name you were given for it.';

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, scoped, sightOf, sight, no, tail } = deps;

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
   * THE PEOPLE A COMMENT ON A ROW NAMES WITH AN @, TOLD ON THEIR PHONES (collab pass 2, 2 Nov). The bell already marks such
   * a line `mentioned` for its reader (`youOf` in `index.ts`); this is the ring that goes with it, by the same match: `@`
   * then a person's whole name or first name, as the record names them. Anybody signed in here may be named, a member or
   * a guest; the kernel rings only one whose lens shows the row, never the writer, and only as their own settings allow.
   * A tap opens the row. Nothing else of the comment leaves the record.
   */
  const namedIn = (body: string, by: string): string[] => {
    if (!body.includes('@')) return [];
    const esc = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const people = sql.all<{ id: string; name: string | null }>('SELECT id, name FROM person WHERE name IS NOT NULL AND suspended_at IS NULL');
    const out: string[] = [];
    for (const p of people) {
      const name = (p.name ?? '').trim();
      if (name === '' || p.id === by) continue;
      const first = name.split(/\s+/u)[0] ?? '';
      const named = new RegExp(`(^|[^\\p{L}\\p{N}])@(${[esc(name), esc(first)].filter((x) => x !== '').join('|')})(?![\\p{L}\\p{N}])`, 'iu');
      if (named.test(body)) out.push(p.id);
    }
    return out;
  };

  /**
   * WHETHER ONE PERSON MAY SEE WHAT A THREAD IS ON, asked as them: their own context, made from what the record says
   * they hold (`kernel.access`, the lens), as a door would make it, then `sightOf`. The one check the ring on a question
   * asks and the one the @ list asks (`mentionable`), so the names offered are the names that would be told.
   */
  const seenBy = (id: string, target: string): boolean => {
    const held = kernel.access(id);
    if (held === null) return false;
    const theirs: CallContext = {
      principal: { kind: 'person', id, level: held.level },
      ...(held.registers === null ? {} : { registers: held.registers }),
      ...(Object.keys(held.levels).length > 0 ? { levels: held.levels } : {}),
      ...(held.wheres === undefined ? {} : { wheres: held.wheres }),
      ...(held.writes === undefined ? {} : { writes: held.writes }),
      ...(held.hides === undefined ? {} : { hides: held.hides }),
      ...(held.nots === undefined ? {} : { nots: held.nots }),
      ...(held.grant === undefined ? {} : { grant: held.grant }),
    };
    return sightOf(theirs, target) !== null;
  };

  const ringNamed = (entry: string, list: string, body: string, comment: string, by: string): void => {
    const named = namedIn(body, by);
    if (named.length === 0) return;
    const row = kernel.get(entry);
    if (row === null || typeof row.seq !== 'number') return;
    for (const id of named) if (seenBy(id, `entry:${entry}`)) kernel.tellColleague(id, { by, cause: `mention.${comment}.${id}`, open: `/r/${list}/${row.seq}`, about: entry });
  };

  /**
   * THE SAME RING FOR A QUESTION'S THREAD (leftovers 4, 2 Nov): before, only a comment on a row rang anybody, so `@Mira`
   * under a question waited in her bell. A decision's words are on its question's thread (`targetOf`), so this is every
   * comment on either. WHO MAY SEE IT IS `sightOf` ASKED AS THEM: their own context, made from what the record says
   * they hold (`kernel.access`, the lens), as a door would make it, so a question held back from somebody never rings
   * them. The kernel then keeps the rest: never the writer, quiet hours, their People switch, six an hour. A tap opens
   * the question at its thread (`/decide/<id>/thread`), a path of its own so the phone says "mentioned" and not
   * "handed". A decision no question settled has no page to open, and rings nobody.
   */
  const ringNamedOn = (target: string, body: string, comment: string, by: string): void => {
    if (!target.startsWith('suggestion:')) return;
    const named = namedIn(body, by);
    if (named.length === 0) return;
    const question = target.slice('suggestion:'.length);
    for (const id of named) {
      if (!seenBy(id, target)) continue;
      kernel.tellColleague(id, { by, cause: `mention.${comment}.${id}`, open: `/decide/${question}/thread` });
    }
  };

  /**
   * The question a decision settled, by its number, or `null` for a decision the log pairs with none.
   *
   * THE PAIR `govern.ts` READS (`SETTLED`: the `decide` line and the question's `resolve` line beside it), and, for a
   * question accepted in part, which stays open and has no `resolve`, the question its `decide` line names. A decision
   * with neither, an imported one whose two lines are not adjacent, is a decision with no question to share a thread.
   */
  const questionOf = (decision: string): string | null => {
    const row = kernel.governanceRow('decision', decision);
    if (row === null) return null;
    if (typeof row.suggestion === 'string' && row.suggestion !== '') return row.suggestion;
    const part = sql.one<{ q: unknown }>(
      "SELECT json_extract(to_v, '$.suggestion') AS q FROM event WHERE kind = 'decide' AND target = ? AND json_valid(to_v) ORDER BY rowid DESC LIMIT 1",
      `decision:${decision}`,
    );
    return typeof part?.q === 'string' && part.q !== '' ? part.q : null;
  };

  /**
   * Where words said on a decision before it shared its question's thread are kept: `decision:<number>` of the decision
   * that settled the question, or `null`. Read into the question's thread, so nothing said on a decision is left where
   * no screen looks, and a reply under one is written beside it.
   */
  const olderOf = (target: string): string | null => {
    if (!target.startsWith('suggestion:')) return null;
    const settled = kernel.governanceRow('suggestion', target.slice('suggestion:'.length))?.decision;
    return typeof settled === 'string' && settled !== '' ? `decision:${settled}` : null;
  };

  /**
   * What `on` names, as the log keys it (`entry:<id>`, `suggestion:SG5`), with the list a row is on, or `null` for
   * anything the caller may not see or that is not there. `decision:D4` answers `suggestion:SG5` when D4 settled SG5.
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
      if (sightOf(ctx, target) === null) return null;
      /* ONE THREAD FOR A QUESTION AND ITS DECISION. The decision is named on to the question it settled, which is the
         thread the app mounts under a settled question, so a word sent to `decision:D4` is read where people look. A
         decision the log pairs with no question keeps its own thread, and the question must be seen as well. */
      const question = kind === 'decision' ? questionOf(number) : null;
      if (question === null) return { target, list: null };
      const asked = `suggestion:${question}`;
      return sightOf(ctx, asked) === null ? null : { target: asked, list: null };
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
      const older = olderOf(at.target);
      if (older === null) return ok(kernel.commentsOn(at.target));
      /* OLDEST FIRST ACROSS BOTH, as one thread reads; the sort is stable, so a reply in the same instant stays after. */
      return ok([...kernel.commentsOn(older), ...kernel.commentsOn(at.target)].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)));
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
      /* AND A ROW SHE MAY COMMENT ON: seen is not enough once a grant reads more than it writes, and
         one she may not comment on is answered as one that is not there. */
      if (at.list !== null && !sight.mayWrite(ctx, at.list, at.target.slice('entry:'.length)))
        return no('REF_UNKNOWN', NOTHING, { at: 'on' });
      /* THE KERNEL'S OWN MOST (`COMMENT_MOST`), asked here first so the refusal says how many over (HD.381), counted by
         character as the kernel counts; the kernel still asks it again, so the two cannot let a long one through. */
      const over = typeof args?.body === 'string' ? [...args.body.trim()].length - COMMENT_MOST : 0;
      if (over > 0)
        return no('VALUE_MALFORMED', `A comment holds ${COMMENT_MOST} characters, and this one is ${over} over. Say it shorter, or split it into a reply.`, {
          at: 'body',
        });
      /* AND THE ROW'S OWN LIST, for a token: `scoped` asked whether any grant reaches `propose`, and this asks the one
         the row is on, as `propose` and `log` are held to the list they are about. */
      if (at.list !== null && ctx.principal.kind === 'token') {
        const held = guard(ctx, 'propose', at.list);
        if (held) return { ok: false, refusal: held };
      }
      /* A REPLY UNDER A WORD KEPT ON THE DECISION goes beside it, so the reply reads under it in the one thread. */
      const older = args?.reply_to === undefined ? null : olderOf(at.target);
      const parent = older !== null && typeof args.reply_to === 'string' ? kernel.commentOf(args.reply_to.trim()) : null;
      const written = kernel.writeComment({
        target: parent !== null && parent.target === older ? older : at.target,
        body: args?.body,
        ...(args?.reply_to === undefined ? {} : { reply_to: args.reply_to }),
        actor: actorOf(ctx),
      });
      if (written.ok && typeof args?.body === 'string') {
        if (at.list !== null) ringNamed(at.target.slice('entry:'.length), at.list, args.body, written.value.id, actorOf(ctx));
        else ringNamedOn(at.target, args.body, written.value.id, actorOf(ctx));
      }
      return tail(written);
    },

    /**
     * WHO AN @ MAY NAME ON ONE THING (leftovers 7, 2 Nov): the people with a name here, not suspended and not the caller,
     * who may see it, asked by `seenBy`, the check a mention rings by. READ+, answered only on a thing the caller sees,
     * and a thing she may not see is answered as one that is not there. Names and ids only, nothing of what they hold.
     */
    async mentionable(args: { on: string }, ctx: CallContext): Promise<Result<{ id: string; name: string }[]>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const at = targetOf(ctx, args?.on);
      if (at === null) return no('REF_UNKNOWN', NOTHING, { at: 'on' });
      const me = ctx.principal.kind === 'person' ? ctx.principal.id : null;
      const people = sql.all<{ id: string; name: string | null }>('SELECT id, name FROM person WHERE name IS NOT NULL AND suspended_at IS NULL');
      const out: { id: string; name: string }[] = [];
      for (const p of people) {
        const name = (p.name ?? '').trim();
        if (name === '' || p.id === me) continue;
        if (seenBy(p.id, at.target)) out.push({ id: p.id, name });
      }
      return ok(out.sort((a, b) => a.name.localeCompare(b.name)));
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
