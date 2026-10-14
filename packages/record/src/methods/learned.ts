/**
 * What his answers taught: `learned` (READ+), each thing the record will not ask again because of what somebody
 * answered, said in one plain sentence ("Sara Idris and Sara Ahmed are two people.", "No page for Groceries.").
 *
 * BEFORE THIS AN ANSWER WAS KEPT WHERE NOTHING READ IT BACK. A pair said to be two, a fold taken back, an offer the pen
 * was told No about and a question declined each stop the record asking again (`refused` and `foldUndone` in the
 * kernel's people file, `pen.dismissed` in `emergent.ts`, a suggestion's status), and none of them could be seen, so a
 * wrong answer could not be found.
 *
 * READ FROM WHAT THE RECORD ALREADY KEEPS, with no table of its own: ENG-B05's teaching table waits on a migration.
 *   - `apart`: two people the record keeps apart. A merge question over the list that holds the people, answered no by
 *     a person, and a fold that was put back, read from the log's own lines as `foldUndone` reads them. Said by both
 *     names, as the record names a person.
 *   - `not-offered`: what the caller dismissed from the holding pen, each by its own title.
 *   - `declined`: any other question a person answered no to, by its question.
 *
 * NEWEST FIRST, FIFTY AT MOST, and `more` counts what was held back past them. A dismissal keeps no day of its own:
 * the newest takes the day the caller's dismissals last changed, and the others none (`at: null`) and follow it.
 *
 * HELD TO WHAT THE CALLER MAY READ. A question is said only to somebody `sightOf` hands it to, a pair only to somebody
 * who reads the list that holds them and whose grant admits both, and a dismissal only when its list is one she reads.
 * A pair from a list closed to her is never named. Nothing signed by `system` is counted as an answer.
 *
 * IT WRITES NOTHING AND ASKS NOTHING. Undoing what was taught is the record's own Undo and Decide's reopen.
 */

import type { Result } from '@braindog/ports';
import { SLASH, whereFor } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How many lines one answer holds at most, and what `limit` may ask for. */
export const LEARNED_MOST = 50;

/** How many of the newest answers of each kind are read to find them. */
const SCANNED = 500;

/** How long a name is said before it is cut, as `matched` cuts one. */
const NAME_MOST = 80;

/** What an answer taught, in the record's words: two kept apart, an offer not made again, a question declined. */
export type LearnedKind = 'apart' | 'not-offered' | 'declined';

/** One thing taught: its kind, one plain sentence, and when it was answered (`null` for a dismissal with no day). */
export type LearnedRow = { kind: LearnedKind; line: string; at: string | null };

/** What `learned` answers: the lines, newest first, and how many more were held back past them. */
export type Learned = { rows: LearnedRow[]; more: number };

/** The two ways a question is turned down without a decision (`decide` in the kernel's govern file). */
const TURNED_DOWN: ReadonlySet<string> = new Set(['wont-fix', 'incorrect']);

const parsed = (text: string | null | undefined): Record<string, unknown> | null => {
  if (typeof text !== 'string') return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const mapsIn = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x)) : [];

/** A text as one line a person reads: trimmed, cut at `most`, and with no em dash. */
const said = (text: string, most = NAME_MOST): string => {
  const one = text.replace(/\s+/gu, ' ').replace(/\s*—\s*/gu, ', ').trim();
  return one.length > most ? `${one.slice(0, most - 1)}…` : one;
};

/** A sentence ends once. */
const sentence = (text: string): string => (/[.?!…]$/u.test(text) ? text : `${text}.`);

/**
 * What one dismissed signature is called, as the pen titled it when it offered it (`emergent.ts`): `page:<list>`,
 * `week:<list>`, `block:<page>:<kind>:<list>` and `column:<page>:<block>:<field>`. The list it is about comes with it,
 * so a dismissal on a list she may not read is held back.
 */
type Dismissed = { list: string; line: string };

/** A block the pen offers, by its kind, as its title said it (`blocksAskedFor` in `emergent.ts`). */
const BLOCK_SAID: Readonly<Record<string, (list: string) => string>> = {
  calendar: (list) => `a calendar of ${list}`,
  gallery: (list) => `pictures from ${list}`,
  steps: (list) => `the path through ${list}`,
  board: (list) => `a board of ${list}`,
  lines: (list) => `${list} drawn over time`,
};

const labelOf = (field: { id: string; label?: string | undefined }): string => {
  const words = typeof field.label === 'string' && field.label.trim() !== '' ? field.label.trim() : field.id.replace(/_/gu, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The person a principal speaks for: herself, or the person whose key it is. */
const personOf = (ctx: CallContext): string | null =>
  ctx.principal.kind === 'person' ? ctx.principal.id : ctx.principal.kind === 'token' ? ctx.principal.person : null;

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, readable, sightOf, no } = deps;

  /** A list as the record names it, or `null` for one it does not hold. */
  const listName = (list: string): string | null => {
    const name = kernel.register(list)?.name;
    return typeof name === 'string' && name.trim() !== '' ? said(name) : null;
  };

  /** One dismissed signature in words, or `null` when what it named is gone, so nothing is said by an id. */
  const dismissedAs = (signature: string): Dismissed | null => {
    const parts = signature.split(':');
    const kind = parts[0];
    if ((kind === 'page' || kind === 'week') && parts.length >= 2) {
      const list = parts.slice(1).join(':');
      const name = listName(list);
      return name === null ? null : { list, line: kind === 'page' ? `No page for ${name}.` : `No page of the week for ${name}.` };
    }
    if ((kind !== 'block' && kind !== 'column') || parts.length < 4) return null;
    const slug = parts.slice(1, -2).join(':');
    const page = kernel.pages().find((p) => p.slug === slug);
    if (page === undefined) return null;
    const on = said(page.title);
    if (kind === 'block') {
      const list = parts[parts.length - 1]!;
      const name = listName(list);
      const block = BLOCK_SAID[parts[parts.length - 2]!];
      if (name === null) return null;
      return { list, line: block === undefined ? `Nothing more of ${name} on ${on}.` : `No ${block(name)} on ${on}.` };
    }
    /* A COLUMN NAMES THE TABLE BY ITS PLACE ON THE PAGE, so its list is the one that block draws. */
    const at = Number(parts[parts.length - 2]);
    const decl = kernel.declarations().find((d) => d.kind === 'page' && parsed(d.body)?.page === slug);
    const block = Number.isSafeInteger(at) ? mapsIn(parsed(decl?.body)?.blocks)[at] : undefined;
    const source = typeof block?.source === 'string' && block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
    const field = source === null ? undefined : kernel.register(source)?.fields.find((f) => f.id === parts[parts.length - 1]);
    if (source === null || field === undefined) return null;
    return { list: source, line: `No ${labelOf(field)} column on ${on}.` };
  };

  return {
    /**
     * `{ limit? }`: what the record will not ask again because of an answer, newest first, `LEARNED_MOST` at most, and
     * `more`, how many were held back past them. READ+, held to what the caller may read, and it changes nothing.
     */
    async learned(args: { limit?: unknown } | undefined, ctx: CallContext): Promise<Result<Learned>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const limit = args?.limit ?? LEARNED_MOST;
      if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > LEARNED_MOST)
        return no('VALUE_MALFORMED', `limit is a whole number from 1 to ${LEARNED_MOST}.`, { at: 'limit' });

      /* EACH LINE WITH WHAT ORDERS IT: the day it was answered, then the log's own order within one day. */
      const found: { row: LearnedRow; ts: string; n: number }[] = [];
      const kept = (kind: LearnedKind, line: string, at: string | null, ts: string, n: number) => found.push({ row: { kind, line, at }, ts, n });
      const pairs = new Set<string>();

      const held = kernel.meetsList();
      const merge = held?.fields.merged_into;
      /* THE PEOPLE ARE THERE FOR HER ONLY WHEN SHE READS THEIR LIST, and each of a pair only when her grant admits them. */
      const people = held !== null && merge !== undefined && readable(ctx, held.register) === null ? held.register : null;
      const rule = people === null ? undefined : whereFor(ctx.wheres, people);
      const admitted = (seq: number | null): boolean => {
        if (rule === undefined) return true;
        if (seq === null || people === null) return false;
        const one = kernel.list({ register: people, where: { field: 'seq', is: seq }, limit: 1 }, rule);
        return one.ok && one.value.rows.length > 0;
      };
      /** Two of the people kept apart, by row id: said once, by both names, newest answer first. */
      const apart = (a: string, b: string, ts: string, n: number): boolean => {
        if (people === null || a === b) return false;
        const [x, y] = [kernel.get(a, { includeDeleted: true }), kernel.get(b, { includeDeleted: true })];
        if (x === null || y === null || x.register !== people || y.register !== people) return false;
        const key = [x.id, y.id].sort().join(' ');
        if (pairs.has(key)) return true;
        if (!admitted(x.seq ?? null) || !admitted(y.seq ?? null)) return true;
        pairs.add(key);
        const [nx, ny] = [x, y].map((r) => said((kernel.titleOfRow(r.id) ?? '').trim() || 'Somebody with no name'));
        kept('apart', nx === ny ? `The two called ${nx} are two people.` : `${nx} and ${ny} are two people.`, ts, ts, n);
        return true;
      };

      /* WHAT THE CALLER DISMISSED FROM THE PEN, newest last as it is kept, so the newest is said first. */
      const person = personOf(ctx);
      const pen = person === null ? undefined : sql.one<{ value: string; updated_at: string }>("SELECT value, updated_at FROM pref WHERE person_id = ? AND key = 'pen.dismissed'", person);
      let gone: string[] = [];
      try {
        const was = pen === undefined ? [] : (JSON.parse(pen.value) as unknown);
        gone = Array.isArray(was) ? was.filter((x): x is string => typeof x === 'string') : [];
      } catch {
        gone = [];
      }
      const dismissed = new Set(gone);
      gone.toReversed().forEach((signature, i) => {
        const one = dismissedAs(signature);
        if (one === null || readable(ctx, one.list) !== null) return;
        kept('not-offered', one.line, i === 0 ? pen!.updated_at : null, pen!.updated_at, -i);
      });

      /* EVERY QUESTION A PERSON TURNED DOWN AND THAT STAYS SO: its last word is a No, and nobody reopened it since. A No
         is a resolution of `wont-fix` or `incorrect`, or a decision whose answer is `reject` in the same batch. */
      const noes = sql.all<{ n: number; ts: string; how: string; batch: string | null; id: string; kind: string; body: string; opened_by: string }>(
        `SELECT e.rowid AS n, e.ts AS ts, e.to_v AS how, e.batch AS batch, s.id AS id, s.body_kind AS kind, s.body AS body, s.opened_by AS opened_by
           FROM event e JOIN suggestion s ON e.target = 'suggestion:' || s.id
          WHERE e.kind = 'resolve' AND s.status = 'resolved' AND s.resolved_as = e.to_v
            AND e.actor <> 'system' AND EXISTS (SELECT 1 FROM member m WHERE m.person_id = e.actor)
            AND e.rowid = (SELECT max(l.rowid) FROM event l WHERE l.kind = 'resolve' AND l.target = e.target)
          ORDER BY e.rowid DESC LIMIT ?`,
        SCANNED,
      );
      const rejected = (batch: string | null): boolean =>
        batch !== null &&
        sql.one<{ y: number }>(
          "SELECT 1 AS y FROM event WHERE batch = ? AND kind = 'decide' AND (CASE WHEN json_valid(to_v) THEN json_extract(to_v, '$.answer') END) = 'reject' LIMIT 1",
          batch,
        ) !== undefined;
      for (const q of noes) {
        if (!TURNED_DOWN.has(q.how) && !(q.how === 'addressed' && rejected(q.batch))) continue;
        if (sightOf(ctx, `suggestion:${q.id}`) === null) continue;
        const body = parsed(q.body) ?? {};
        /* A MERGE ANSWERED NO IS A PAIR KEPT APART, said by the two names, as `refused` reads it in the kernel. */
        if (q.kind === 'rowset' && merge !== undefined && held !== null && body.register === held.register) {
          const rows = mapsIn(body.rows);
          const asked = rows.flatMap((r) => {
            const into = mapsIn([r.patch])[0]?.[merge];
            return typeof r.at === 'string' && typeof into === 'string' ? [[r.at, into] as const] : [];
          });
          if (asked.length > 0) {
            for (const [a, b] of asked) apart(a, b, q.ts, q.n);
            continue;
          }
        }
        /* A PAGE SLASH ASKED FOR AND WAS TOLD NO ABOUT IS IN THE PEN'S DISMISSALS TOO, and is said once, there. */
        if (q.opened_by === SLASH && q.kind === 'arrange') {
          const pages = mapsIn(body.pages);
          const needs = pages.length === 1 ? mapsIn([pages[0]!.body])[0]?.requires : undefined;
          const list = Array.isArray(needs) && needs.length === 1 && typeof needs[0] === 'string' && needs[0].startsWith('register.') ? needs[0].slice('register.'.length) : null;
          if (list !== null && dismissed.has(`page:${list}`)) continue;
        }
        const words = (kernel.question(q.id) ?? '').trim();
        if (words === '') continue;
        kept('declined', sentence(`Answered no: ${said(words, 200)}`), q.ts, q.ts, q.n);
      }

      /* EVERY FOLD PUT BACK, read from the log as `foldUndone` reads it: the merge field set, then put back to nothing
         later, or its batch in `undone`. When is when it was put back. A pair folded again since and still one is not apart. */
      if (people !== null && merge !== undefined) {
        const backs = sql.all<{ target: string; into_v: string; back: string | null; bn: number | null; n: number }>(
          `SELECT s.target AS target, s.to_v AS into_v, s.rowid AS n,
                  coalesce((SELECT p.ts FROM event p WHERE p.target = s.target AND p.kind = 'edit' AND p.field = s.field AND p.to_v IS NULL AND p.rowid > s.rowid ORDER BY p.rowid LIMIT 1),
                           (SELECT u.at FROM undone u WHERE u.batch = s.batch OR u.batch = s.id LIMIT 1)) AS back,
                  coalesce((SELECT min(p.rowid) FROM event p WHERE p.target = s.target AND p.kind = 'edit' AND p.field = s.field AND p.to_v IS NULL AND p.rowid > s.rowid),
                           (SELECT max(b.rowid) FROM undone u JOIN event b ON b.batch = u.by_batch WHERE u.batch = s.batch OR u.batch = s.id)) AS bn
             FROM event s JOIN entry r ON s.target = 'entry:' || r.id
            WHERE r.register = ? AND s.kind = 'edit' AND s.field = ? AND s.to_v IS NOT NULL
              AND (EXISTS (SELECT 1 FROM event p WHERE p.target = s.target AND p.kind = 'edit' AND p.field = s.field AND p.to_v IS NULL AND p.rowid > s.rowid)
                OR EXISTS (SELECT 1 FROM undone u WHERE u.batch = s.batch OR u.batch = s.id))
            ORDER BY s.rowid DESC LIMIT ?`,
          people,
          merge,
          SCANNED,
        );
        for (const f of backs) {
          let into: unknown = null;
          try {
            into = JSON.parse(f.into_v) as unknown;
          } catch {
            into = f.into_v;
          }
          const from = f.target.replace(/^entry:/u, '');
          if (typeof into !== 'string') continue;
          /* FOLDED AGAIN SINCE AND STILL ONE: not two people any more. */
          const now = parsed(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', from)?.fields)?.[merge];
          if (now === into) continue;
          apart(from, into, f.back ?? '', f.bn ?? f.n);
        }
      }

      /* NEWEST FIRST: by the day, then the log's own order within it. */
      found.sort((a, b) => (a.ts === b.ts ? b.n - a.n : a.ts < b.ts ? 1 : -1));
      return { ok: true, value: { rows: found.slice(0, limit).map((f) => f.row), more: Math.max(0, found.length - limit) } };
    },
  };
}
