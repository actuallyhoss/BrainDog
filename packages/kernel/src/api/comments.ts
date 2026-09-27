/**
 * Comments: a thread on a row, a question or a decision, one level of replies, and a resolution with its reason.
 * `docs/20-COLLABORATION.md` §5, `loop/finish/contracts.md` §2.5 and §10 (the `note` row).
 *
 * NO TABLE, NO EVENT KIND AND NO REFUSAL CODE. A comment is a `note` event on the thing it is about, with `field` set to
 * `comment`, and a reply is one with `field` set to `reply:<id>`, the id of the comment it answers. A resolution is a
 * `note` on `event:<id>` with `field` set to `resolve`, how it was resolved in `to_v` and the reason in `note`. So a
 * comment is in the log a person already reads, it travels in an export with every other event (`brainl.ts` leaves out
 * only `export` events), and an erasure reaches it through the event pass it already makes (`erase.ts`).
 *
 * `to_v` STAYS NULL ON A COMMENT AND A REPLY. `govern.ts` reads a decision's `note` that carries a `to_v` as what was
 * applied when it was accepted, so a comment on a decision written with one would read as that decision's application.
 * A resolution is on an event, never on a decision, so its `to_v` is free to say how it was resolved.
 *
 * WHO MAY SEE THE THING IS NOT ASKED HERE. The kernel cannot know who is asking, so the record decides whether a caller
 * sees what a comment is on (`sightOf` in `packages/record/src/index.ts`) and hands this file the target it may use, as
 * it hands `list` a `reads` function; a search hands `commentsMatching` the same question as a function.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant, type Json } from '../coerce.ts';
import { jcs } from '../declare.ts';
import type { KernelParts } from '../parts.ts';
import { slashMayWrite } from '../slash.ts';

/** The characters one comment, one reply or one resolution's reason may hold, as a row's note may (`0001_kernel.ts`). */
export const COMMENT_MOST = 280;

/**
 * The comments and replies one thing may hold, and so the most one thread's read walks.
 *
 * A THREAD IS READ WHOLE, every time a row's panel or a Decide card opens, so an unbounded one would make that read as
 * long as anybody wanted it to be. A conversation past this many lines on one row is a conversation the row's fields
 * should be carrying, which is `docs/20` §5's last rule.
 */
export const THREAD_MOST = 500;

/**
 * The newest events of the log one search reads for comments, and so the most rows it walks.
 *
 * THE EVENT TABLE HAS NO INDEX ON A NOTE'S WORDS, OR ON ITS KIND OR FIELD, so a search that read the whole log would
 * cost as much as the log is long, on every call to `search`. Bounded by `rowid`, it is one range read on
 * the table's own key. A comment older than this window is still read whole in its thread (`commentsOn`); a search just
 * no longer reaches it, as `USED_BY_WALK` counts only an agent's newest uses (`packages/record/src/methods/agents.ts`).
 */
export const COMMENT_SEARCH_EVENTS = 20_000;

/** The matching comments one search asks the log for, newest first, before the record holds each to what she sees. */
export const COMMENT_SEARCH_WALK = 200;

/** The comments one search answers with. */
export const COMMENT_SEARCH_MOST = 20;

/** How a comment may be resolved, in the order a person is offered them. */
export const RESOLUTIONS = ['addressed', 'wont-fix', 'incorrect'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** The `field` of each line this file writes. A reply's is `reply:` and the id of the comment it answers. */
const COMMENT = 'comment';
const REPLY = 'reply:';
const RESOLVE = 'resolve';

/** The kinds of thing a comment may be on, as the prefix of its target (`docs/20` §5: nothing else). */
const ON = ['entry', 'suggestion', 'decision'] as const;

/** Every comment and reply, and nothing else a `note` carries: a row's own note has no `field`. */
const THREADED = `kind = 'note' AND (field = '${COMMENT}' OR field GLOB '${REPLY}*')`;

/**
 * How a comment was resolved: one of `RESOLUTIONS`, the reason, who and when.
 *
 * `as` IS `null` ONLY AFTER AN ERASURE, which writes `--erased--` over the value it names (`erase.ts`); the reason then
 * reads `--erased--` too, as every erased line in the log does, so "resolved, and the words were taken out" is not
 * mistaken for "never resolved".
 */
export type CommentResolved = { as: Resolution | null; why: string; by: string; at: string };

/** One line of a thread, as `comments` answers it. `reply_to` is the comment it answers, and `null` on a comment. */
export type CommentLine = {
  id: string;
  by: string;
  at: string;
  body: string;
  reply_to: string | null;
  /** How it was resolved, the newest resolution when it has been resolved more than once. Always `null` on a reply. */
  resolved: CommentResolved | null;
};

/** One comment or reply as the log holds it, with the target it is on: what the record asks who may see. */
export type CommentHeld = { id: string; target: string; by: string; at: string; body: string; reply_to: string | null };

/** One comment a search found, with what it is on as the caller names it. */
export type CommentFound = { id: string; on: string; by: string; at: string; body: string; reply_to: string | null };

/** What `writeComment` is handed: the target the record resolved, and the caller's words as they arrived. */
export type CommentAsked = { target: string; body: unknown; reply_to?: unknown; actor: string };

/** What `writeResolution` is handed: the comment's id and the caller's words as they arrived. */
export type ResolutionAsked = { id: string; as: unknown; why: unknown; actor: string };

type HeldRow = { id: string; ts: string; actor: string; target: string; field: string; note: string | null };

/** A comment's words as a caller sent them, trimmed, or the refusal that names what is wrong with them. */
const wordsOf = (said: unknown, at: string, what: string): Result<string> => {
  const text = typeof said === 'string' ? said.trim() : '';
  if (said !== undefined && said !== null && typeof said !== 'string') return no('VALUE_MALFORMED', `${what} is text.`, { at });
  if (text === '') return no('REQUIRED_MISSING', `${what} is missing. Write one to ${COMMENT_MOST} characters.`, { at });
  /* CHARACTERS AND NOT UTF-16 UNITS, so an emoji counts once, as a person counting would count it. */
  const length = [...text].length;
  if (length > COMMENT_MOST)
    return no('VALUE_MALFORMED', `${what} is ${COMMENT_MOST} characters or fewer, and this one is ${length}. Say it shorter, or split it into a reply.`, { at });
  return ok(text);
};

/** A line as `commentOf` and a search hand it on: the reply's parent read out of its `field`. */
const heldOf = (row: HeldRow): CommentHeld => ({
  id: row.id,
  target: row.target,
  by: row.actor,
  at: row.ts,
  body: row.note ?? '',
  reply_to: row.field.startsWith(REPLY) ? row.field.slice(REPLY.length) : null,
});

/** A resolution's `to_v` read back: one of `RESOLUTIONS`, or `null` for anything else, an erased value included. */
const resolutionOf = (stored: string | null): Resolution | null => {
  if (stored === null) return null;
  try {
    const said: unknown = JSON.parse(stored);
    return (RESOLUTIONS as readonly unknown[]).includes(said) ? (said as Resolution) : null;
  } catch {
    return null;
  }
};

export function extension(parts: KernelParts) {
  const { sql } = parts;

  /** The newest resolution of one comment, or `null`. One lookup on the event table's `(target, ts)` index. */
  const resolvedOf = (id: string): CommentResolved | null => {
    const r = sql.one<{ actor: string; ts: string; to_v: string | null; note: string | null }>(
      `SELECT actor, ts, to_v, note FROM event WHERE target = ? AND kind = 'note' AND field = '${RESOLVE}' ORDER BY rowid DESC LIMIT 1`,
      `event:${id}`,
    );
    return r ? { as: resolutionOf(r.to_v), why: r.note ?? '', by: r.actor, at: r.ts } : null;
  };

  /** One comment or reply by its id, or `null` when no line of a thread has it. */
  const commentOf = (id: string): CommentHeld | null => {
    const row = sql.one<HeldRow>(`SELECT id, ts, actor, target, field, note FROM event WHERE id = ? AND ${THREADED}`, id);
    return row ? heldOf(row) : null;
  };

  return {
    commentOf,

    /**
     * Every comment and reply on one thing, oldest first, each comment with its newest resolution.
     *
     * `target` IS AS THE LOG KEYS IT, `entry:<id>`, `suggestion:<id>` or `decision:<id>`, and the record hands it only
     * once it has asked whether the caller sees that thing. At most `THREAD_MOST`, which is also the most one thing holds.
     */
    commentsOn(target: string): CommentLine[] {
      return sql
        .all<HeldRow>(
          `SELECT id, ts, actor, target, field, note FROM event WHERE target = ? AND ${THREADED} ORDER BY rowid LIMIT ?`,
          target,
          THREAD_MOST,
        )
        .map((row) => {
          const held = heldOf(row);
          return {
            id: held.id,
            by: held.by,
            at: held.at,
            body: held.body,
            reply_to: held.reply_to,
            resolved: held.reply_to === null ? resolvedOf(held.id) : null,
          };
        });
    },

    /**
     * Put one comment on a thing, or one reply under a comment on it, and answer its id.
     *
     * ONE LEVEL OF REPLIES (`docs/20` §5: depth is how a discussion becomes unsearchable). A reply names the comment that
     * opened the thread; a reply to a reply is refused with the sentence that says which to answer instead, and a reply
     * naming a comment on something else is answered as a comment that is not there.
     *
     * THE THREAD'S LENGTH IS COUNTED AND THE LINE WRITTEN IN ONE TRANSACTION, so two comments sent at once cannot both be
     * the one that fits under `THREAD_MOST`.
     */
    writeComment(asked: CommentAsked): Result<{ id: string }> {
      const colon = asked.target.indexOf(':');
      const kind = colon > 0 ? asked.target.slice(0, colon) : '';
      if (!(ON as readonly string[]).includes(kind) || colon === asked.target.length - 1)
        return no('REF_UNKNOWN', 'A comment is on a row, a question or a decision, and this names none of them.', { at: 'on' });
      const body = wordsOf(asked.body, 'body', 'The comment');
      if (!body.ok) return body as Result<never>;

      let field: string = COMMENT;
      if (asked.reply_to !== undefined && asked.reply_to !== null) {
        const parent = typeof asked.reply_to === 'string' ? commentOf(asked.reply_to.trim()) : null;
        if (parent === null || parent.target !== asked.target)
          return no('REF_UNKNOWN', 'There is no comment by that id on this to reply to.', { at: 'reply_to' });
        if (parent.reply_to !== null)
          return no('VALUE_MALFORMED', 'Replies go one level deep. Reply to the comment that opened the thread.', { at: 'reply_to' });
        field = `${REPLY}${parent.id}`;
      }

      /* THE ACTOR COMES FROM THE RECORD, so it is asked here as every event writer asks it (`slash.ts`): a model
         suggests, proposes and predicts, and a comment is none of the three. */
      slashMayWrite(asked.actor, 'note');
      return parts.transaction(() => {
        const held = Number(sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM event WHERE target = ? AND ${THREADED}`, asked.target)?.n ?? 0);
        if (held >= THREAD_MOST)
          return no<{ id: string }>('OUT_OF_BOUNDS', `This thread holds ${THREAD_MOST} comments and replies, the most one thing takes. Put what is left in its fields.`, {
            at: 'on',
          });
        const id = parts.mint();
        sql.exec(
          'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          id,
          instant(parts.clock.now()),
          asked.actor,
          'note',
          asked.target,
          kind,
          field,
          body.value,
        );
        return ok({ id });
      });
    },

    /**
     * Resolve one comment as one of `RESOLUTIONS`, with the reason, and answer how it now stands.
     *
     * A COMMENT AND NOT A REPLY: a reply is resolved with the thread it is in, and is refused with the sentence that says
     * which to resolve instead. The record has already asked whether the caller sees the comment and may resolve it.
     *
     * THE SAME RESOLUTION AGAIN WRITES NOTHING, so a press that is retried after a lost answer leaves one line. A
     * different one is written after the first, and the newest is how the comment stands; both stay in the log.
     */
    writeResolution(asked: ResolutionAsked): Result<{ id: string; resolved: CommentResolved }> {
      const held = commentOf(asked.id);
      if (held === null) return no('REF_UNKNOWN', 'There is no comment by that id you can read.', { at: 'id' });
      if (held.reply_to !== null)
        return no('VALUE_MALFORMED', 'A reply is resolved with its thread. Resolve the comment that opened it.', { at: 'id' });
      if (typeof asked.as !== 'string' || !(RESOLUTIONS as readonly string[]).includes(asked.as))
        return no('VALUE_MALFORMED', `Say how it was resolved: ${RESOLUTIONS.join(', ')}.`, { at: 'as', allowed: [...RESOLUTIONS] });
      const as = asked.as as Resolution;
      const why = wordsOf(asked.why, 'why', 'The reason');
      if (!why.ok) return why as Result<never>;

      const was = resolvedOf(held.id);
      if (was !== null && was.as === as && was.why === why.value) return ok({ id: held.id, resolved: was });

      slashMayWrite(asked.actor, 'note');
      const at = instant(parts.clock.now());
      sql.exec(
        'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        parts.mint(),
        at,
        asked.actor,
        'note',
        `event:${held.id}`,
        'event',
        RESOLVE,
        jcs(as as Json),
        why.value,
      );
      return ok({ id: held.id, resolved: { as, why: why.value, by: asked.actor, at } });
    },

    /**
     * The comments and replies whose words hold `q`, newest first, each on a thing `sees` names for the caller.
     *
     * A COMMENT IS NOT A ROW, SO THE ROW INDEX NEVER HELD ONE, and the log is asked instead: every thread line among
     * its newest `COMMENT_SEARCH_EVENTS` events whose words hold what she typed, newest first, at most
     * `COMMENT_SEARCH_WALK` of them. `sees` is the record's question, asked once per thing: it answers what the thing is
     * called to the caller, or `null` when she may not see it, and a comment on a thing she cannot see is neither
     * answered nor counted. At most `COMMENT_SEARCH_MOST` come back.
     *
     * THE WINDOW AND NOT AN INDEX, because an index on a note's words would be a migration this finish does not assign
     * (`loop/finish/contracts.md` §1.2). It runs only when the query has words.
     */
    commentsMatching(q: string, sees: (target: string) => string | null): CommentFound[] {
      const said = q.trim();
      if (said === '') return [];
      /* `instr` AND NOT `LIKE`, BECAUSE THE STORAGE REFUSES A LONG `LIKE` PATTERN. The guard every host puts over the
         record throws on a pattern past `DO_LIMITS.likePatternLength` bytes (`packages/ports/src/sql.ts`), so a sentence
         pasted into search would throw out of `search` whole. `instr` takes the words as they are, a percent sign or an
         underscore included, at any length. SQLite's own `lower` folds only A to Z, as its `LIKE` does, so what she typed
         is folded the same way and no further. */
      const folded = said.replace(/[A-Z]/g, (c) => c.toLowerCase());
      const newest = Number(sql.one<{ v: number | null }>('SELECT MAX(rowid) AS v FROM event')?.v ?? 0);
      const named = new Map<string, string | null>();
      const found: CommentFound[] = [];
      const rows = sql.all<HeldRow>(
        `SELECT id, ts, actor, target, field, note FROM event WHERE rowid > ? AND ${THREADED} AND instr(lower(note), ?) > 0 ORDER BY rowid DESC LIMIT ?`,
        newest - COMMENT_SEARCH_EVENTS,
        folded,
        COMMENT_SEARCH_WALK,
      );
      for (const row of rows) {
        if (!named.has(row.target)) named.set(row.target, sees(row.target));
        const on = named.get(row.target) ?? null;
        if (on === null) continue;
        const held = heldOf(row);
        found.push({ id: held.id, on, by: held.by, at: held.at, body: held.body, reply_to: held.reply_to });
        if (found.length >= COMMENT_SEARCH_MOST) break;
      }
      return found;
    },
  };
}
