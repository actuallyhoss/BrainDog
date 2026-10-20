/**
 * Who the record matched on its own: `matched` (READ+), the folds its strong rules made and the names Slash put on
 * somebody alone, each with its evidence and the batch its Undo takes.
 *
 * BEFORE THIS A CONFIDENT MATCH WAS ONE COUNT ON ONE PAGE. The rules fold two of somebody into one as a single batch the
 * record can undo, and the only place that batch was ever said was the answer to the meeting that made it. Nothing
 * listed what was matched, so a wrong fold could not be found, read or taken back.
 *
 * READ FROM WHAT STANDS, THEN FROM THE LOG. A fold is somebody taken out of the list and pointed at who they were
 * folded into, so the ones still pointed are the folds that stand. Each one's batch is the last line in the log that
 * pointed it, read as the kernel's own undo of a merge reads it. A fold put back is no longer pointed, and is not listed.
 *
 * ONLY WHAT THE RECORD MADE. A merge the owner answered a question with carries its decision in the same batch, and is
 * theirs, not a match made for them: it is left out.
 *
 * ONE ANSWER A BATCH, NEWEST FIRST, FIFTY AT MOST. One meeting may fold a few in a row, all under one batch, so one
 * Undo takes them all back and they are said together: everybody folded, and the one they are now.
 *
 * NAMES, AND ONE SENTENCE. Who was folded and into whom by what each is called, the number of the one kept so a list
 * can open them, and the evidence in plain words: the handle the two share, read without its dots and the number on
 * its end as the rules read it, and never an address. Where no shared handle can be read from what the two hold now,
 * the sentence is the reason the batch itself wrote down.
 *
 * AND THE NAMES SLASH PUT ON SOMEBODY ALONE (ENG-B15, "Slash may act on its own", "always undoable"). Once the owner
 * has let it, an attach Slash is sure of lands with no question: a dated line put on the one a text named, in the part
 * of the list that keeps where somebody was seen. A model writes nothing but what it proposes, so the ladder accepts
 * Slash's question at its rung and the line is written under the ladder's name, in the batch that settles the question
 * Slash asked; a line Slash itself signs is read the same way. Each is listed here as an `attach`, with the text's own words, who it
 * went to and the batch its Undo takes, among the folds by when it was made. One that a person answered, one undone
 * and one whose line is no longer there are not listed. A fold answers as it always has, with `kind` beside it.
 *
 * IT WRITES NOTHING AND FOLDS NOTHING. Which list holds the people is the kernel's to say (`meetsList`), so no list is
 * named here. A caller whose grant is narrowed to some of them is answered only the folds into somebody it admits.
 */

import type { Result } from '@braindog/ports';
import { LADDER_RULE, MET_CAP, SLASH, foldFill, identityFloor, shapeIn } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';
import { readSight } from '../sight-read.ts';

/** How many folds one answer holds at most, and what `limit` may ask for. */
export const MATCHED_MOST = 50;

/** How many of the most recently folded are read to find them: a fold answered by a question is read and left out. */
const SCANNED = 500;

/** How many of the newest lines Slash put on somebody are read to find the attaches that stand. */
const ATTACHES_SCANNED = 500;

/** How long the text's own words may be, and how they are cut, as the about read cuts them (`about.ts`, `clipped`). */
const SENTENCE_CHARS_MOST = 160;
const clipped = (s: string): string => (s.length > SENTENCE_CHARS_MOST ? `${s.slice(0, SENTENCE_CHARS_MOST - 3)}...` : s);

/** The day a line where somebody was seen begins with, `2026-10-15 · `, which the text's words follow (`people.ts`). */
const DAY_SAID = /^\d{4}-\d{2}-\d{2}\s*·\s*/u;

/** How many steps of a fold's chain are followed, as the kernel follows them (`FOLD_HOPS`). */
const HOPS = 16;

/**
 * One batch of folds: who was folded, who they are now, why in one sentence, when, and the batch its Undo takes. An
 * `attach` folded nobody, so `from` is empty: `into` is who the name was put on, and `sentence` the text's own words.
 */
export type Match = {
  kind: 'fold' | 'attach';
  from: string[];
  into: { name: string; seq: number | null };
  evidence: string;
  at: string;
  batch: string;
  sentence?: string;
  /** What the folded held that the kept one was not given (the organisation), for the owner to press: the value as written, its name, and who it came from by name. */
  offered?: { field: string; value: unknown; said: string; from: string }[];
};

/** What `matched` answers, or `null` on a record that keeps no people. */
export type Matched = { matches: Match[] } | null;

/**
 * A handle as the strong rules compare two (`stem` in the kernel's people file): lower case, without what follows a
 * plus, its dots, dashes and underscores, or the number on its end. Five characters at least, as there.
 */
const stemOf = (handle: string): string => handle.toLowerCase().replace(/\+.*$/, '').replace(/[._-]/g, '').replace(/\d+$/, '');
const STEM_LEAST = 5;

/** The handle of one stored key: `email:ada@one.example`, `github:ada` and a bare address alike. Never the domain. */
const handleOf = (key: string): string => {
  const said = /^[a-z]+:/u.test(key) ? key.slice(key.indexOf(':') + 1) : key;
  return said.split('@')[0] ?? '';
};

const fieldsOf = (text: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(text) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The lines a value of where somebody was seen holds: a list of text, or one text. */
const linesIn = (text: string | null): string[] => {
  if (text === null) return [];
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** Every key one of them holds, from the fields that carry keys: text, or a list of text. */
const keysIn = (fields: Record<string, unknown>, at: readonly (string | undefined)[]): string[] =>
  at.flatMap((f) => {
    const v = f === undefined ? undefined : fields[f];
    return typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  });

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, no } = deps;

  type Folded = { n: number; event: string; batch: string | null; ts: string; note: string | null; to_v: string; row: string; fields: string };
  type Attached = { n: number; event: string; batch: string | null; ts: string; from_v: string | null; to_v: string; row: string; seq: number | null; fields: string };

  /**
   * The names Slash put on somebody alone that still stand (see the head of this file), newest first, `limit` at most:
   * each the line it added to where they were seen, the one it went to, and the batch it was written under, which is
   * what its Undo takes. ONE A BATCH AND ONE IT WENT TO, as a fold is.
   */
  const attachesOf = (
    register: string,
    met: string | undefined,
    limit: number,
    admitted: (id: string | null) => boolean,
    named: (id: string) => string,
  ): { n: number; match: Match }[] => {
    if (met === undefined) return [];
    const lines = sql.all<Attached>(
      `SELECT e.rowid AS n, e.id AS event, e.batch AS batch, e.ts AS ts, e.from_v AS from_v, e.to_v AS to_v, r.id AS row, r.seq AS seq, r.fields AS fields
         FROM event e JOIN entry r ON e.target = 'entry:' || r.id
        WHERE e.field = ? AND e.to_v IS NOT NULL AND r.register = ? AND r.deleted_at IS NULL
          AND (e.actor = ? OR (e.actor = ? AND e.batch IS NOT NULL AND EXISTS (
                SELECT 1 FROM event q JOIN suggestion s ON q.target = 'suggestion:' || s.id
                 WHERE q.batch = e.batch AND q.kind = 'resolve' AND s.opened_by = ?)))
        ORDER BY e.rowid DESC LIMIT ?`,
      met,
      register,
      SLASH,
      LADDER_RULE,
      SLASH,
      ATTACHES_SCANNED,
    );
    const out: { n: number; match: Match }[] = [];
    const alreadySaid = new Set<string>();
    for (const l of lines) {
      if (out.length >= limit) break;
      const batch = l.batch ?? l.event;
      if (alreadySaid.has(`${batch} ${l.row}`)) continue;
      alreadySaid.add(`${batch} ${l.row}`);
      /* ANSWERED BY A PERSON, SO NOT MADE ALONE; OR PUT BACK ALREADY, the mark every undo keeps (`undone`). */
      if (sql.one("SELECT 1 AS y FROM event WHERE batch = ? AND kind = 'decide' AND substr(actor, 1, 2) = 'p_' LIMIT 1", batch) !== undefined) continue;
      if (sql.one('SELECT 1 AS y FROM undone WHERE batch = ? LIMIT 1', batch) !== undefined) continue;
      /* THE LINE IT ADDED, AND STILL THERE: one taken away since by any write is no longer a name standing on them. */
      const before = new Set(linesIn(l.from_v));
      const now = new Set(linesIn(JSON.stringify(fieldsOf(l.fields)[met] ?? null)));
      const line = linesIn(l.to_v).find((x) => !before.has(x) && now.has(x));
      if (line === undefined || !admitted(l.row)) continue;
      const name = named(l.row);
      out.push({
        n: l.n,
        match: { kind: 'attach', from: [], into: { name, seq: l.seq }, evidence: `Slash put this on ${name} without asking.`, sentence: clipped(line.replace(DAY_SAID, '').trim()), at: l.ts, batch },
      });
    }
    return out;
  };

  return {
    /**
     * `{ limit? }`: the folds the record made on its own that still stand, and the names Slash put on somebody alone,
     * together newest first, `MATCHED_MOST` at most. `null`
     * on a record that keeps no people. READ+ on the list that holds them, and it changes nothing.
     */
    async matched(args: { limit?: unknown } | undefined, ctx: CallContext): Promise<Result<Matched>> {
      const stop = guard(ctx, 'read', kernel.meetsList()?.register);
      if (stop) return { ok: false, refusal: stop };
      const limit = args?.limit ?? MATCHED_MOST;
      if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > MATCHED_MOST)
        return no('VALUE_MALFORMED', `limit is a whole number from 1 to ${MATCHED_MOST}.`, { at: 'limit' });
      const held = kernel.meetsList();
      if (held === null) return { ok: true, value: null };
      const { register, fields: at } = held;
      /* A LIST THAT CANNOT FOLD HAS NO FOLDS TO LIST, and may still hold names Slash put on somebody. */
      const merge = at.merged_into ?? '';

      /* EVERYBODY STILL FOLDED, WITH EVERY LINE THAT POINTED THEM, newest line first: the first line met for each is the
         fold that stands, as `undoMerge` finds a merge's batch from the one folded. */
      const lines = merge === '' ? [] : sql.all<Folded>(
        `SELECT e.rowid AS n, e.id AS event, e.batch AS batch, e.ts AS ts, e.note AS note, e.to_v AS to_v, r.id AS row, r.fields AS fields
           FROM entry r JOIN event e ON e.target = 'entry:' || r.id AND e.field = ? AND e.to_v IS NOT NULL
          WHERE r.register = ? AND r.deleted_at IS NOT NULL AND json_extract(r.fields, ?) IS NOT NULL
          ORDER BY e.rowid DESC LIMIT ?`,
        merge,
        register,
        `$.${merge}`,
        SCANNED,
      );
      const seen = new Set<string>();
      const stands = lines.filter((l) => {
        if (seen.has(l.row)) return false;
        seen.add(l.row);
        /* POINTED SOMEWHERE ELSE SINCE, by a write the log does not hold: not this line's fold. */
        return JSON.stringify(fieldsOf(l.fields)[merge]) === l.to_v;
      });

      const person = (id: string) => sql.one<{ seq: number | null; fields: string }>('SELECT seq, fields FROM entry WHERE id = ?', id);
      /** Who somebody folded is now: the end of their chain, since the one they were folded into may have been folded since. */
      const endOf = (from: string): string => {
        const walked = new Set([from]);
        let here = from;
        for (let hop = 0; hop < HOPS; hop++) {
          const next = fieldsOf(person(here)?.fields ?? '')[merge];
          if (typeof next !== 'string' || walked.has(next)) break;
          walked.add(next);
          here = next;
        }
        return here;
      };
      /* SOMEBODY A NARROWED GRANT LEAVES OUT IS NOT THERE FOR THIS CALLER, read as `heldTwice` reads it: the one kept,
         again by their own number under the grant's rule. A grant that is whole admits everybody. */
      const sight = readSight(kernel);
      const admitted = (id: string | null): boolean => id !== null && sight.admitted(ctx, register, [id]).has(id);
      const named = (id: string): string => {
        const title = (kernel.titleOfRow(id) ?? '').trim();
        return title === '' ? 'Somebody with no name' : title.length > 80 ? `${title.slice(0, 79)}…` : title;
      };
      /**
       * The one sentence. The handle is one the kept one holds apart from the keys carried over from the folded, and
       * that a folded one holds too. With none to read, the reason the batch wrote down, which is the rule's own.
       */
      const evidenceOf = (folded: readonly Folded[], end: string): string => {
        /* A FOLD THE BANDS MADE (`people.ts` `settleVerdicts`) WROTE ITS OWN SENTENCE, 'Matched A with B: <sentence>',
           and that is the evidence: the two were folded on what else the record holds, not on a handle they share, so
           the handle's sentence below would say a reason that was not the reason. */
        const banded = folded.map((f) => f.note ?? '').find((n) => n.startsWith('Matched ') && n.includes(': '));
        if (banded !== undefined) {
          const said = banded.slice(banded.indexOf(': ') + 2).trim();
          if (said !== '') return `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
        }
        const carry = [at.email, at.handles, at.keys];
        const theirs = folded.flatMap((f) => keysIn(fieldsOf(f.fields), carry));
        const bare = (key: string): string => key.replace(/^[a-z]+:/u, '').toLowerCase();
        const carried = new Set(theirs.map(bare));
        const own = keysIn(fieldsOf(person(end)?.fields ?? ''), carry).filter((k) => !carried.has(bare(k)));
        const stems = new Set(theirs.map((k) => stemOf(handleOf(k))).filter((s) => s.length >= STEM_LEAST));
        const shared = own.map((k) => stemOf(handleOf(k))).find((s) => stems.has(s));
        if (shared !== undefined) return `The same name and the same handle, ${shared}.`;
        const note = folded.map((f) => f.note ?? '').find((n) => n.includes(': ')) ?? '';
        const why = note.slice(note.lastIndexOf(': ') + 2).trim();
        return why === '' ? 'The rules for a certain match held for the two.' : `${why.charAt(0).toUpperCase()}${why.slice(1)}`;
      };

      const shape = shapeIn(sql, register);
      const floor = identityFloor(shape, at);
      /* ONE ANSWER A BATCH AND THE ONE ITS FOLDS ENDED AT, in the order the log met them: newest first. */
      const groups = new Map<string, { batch: string; end: string; folded: Folded[] }>();
      const decided = new Map<string, boolean>();
      for (const l of stands) {
        const batch = l.batch ?? l.event;
        /* THE OWNER'S OWN ANSWER, NOT A MATCH MADE FOR THEM: the decision is a line of the same batch. */
        if (!decided.has(batch)) decided.set(batch, sql.one("SELECT 1 AS y FROM event WHERE batch = ? AND kind = 'decide' LIMIT 1", batch) !== undefined);
        if (decided.get(batch)) continue;
        const end = endOf(l.row);
        const key = `${batch} ${end}`;
        const group = groups.get(key) ?? { batch, end, folded: [] };
        groups.set(key, group);
        group.folded.push(l);
      }

      /* EACH WITH THE LOG'S PLACE OF ITS NEWEST LINE, so folds and attaches are said together, newest first. */
      const found: { n: number; match: Match }[] = [];
      for (const g of groups.values()) {
        if (found.length >= limit) break;
        const seq = person(g.end)?.seq ?? null;
        if (!admitted(g.end)) continue;
        /* Said in the order they were folded, and when the last of them was. */
        const folded = [...g.folded].sort((a, b) => a.n - b.n);
        const { offered } = foldFill(
          { declared: shape?.fields ?? [], at, metCap: MET_CAP },
          { id: g.end, fields: fieldsOf(person(g.end)?.fields ?? '') },
          folded.map((f) => ({ id: f.row, fields: fieldsOf(f.fields) })),
          floor,
        );
        const left = offered.map((o) => ({ field: o.field, value: o.value, said: typeof o.value === 'string' ? (kernel.titleOfRow(o.value) ?? o.value) : String(o.value), from: named(o.from) }));
        found.push({
          n: g.folded[0]!.n,
          match: { kind: 'fold', from: folded.map((f) => named(f.row)), into: { name: named(g.end), seq }, evidence: evidenceOf(folded, g.end), at: g.folded[0]!.ts, batch: g.batch, ...(left.length > 0 ? { offered: left } : {}) },
        });
      }
      found.push(...attachesOf(register, at.met, limit, admitted, named));
      const matches = found.sort((a, b) => b.n - a.n).slice(0, limit).map((f) => f.match);
      return { ok: true, value: { matches } };
    },
  };
}
