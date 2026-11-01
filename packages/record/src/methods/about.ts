/**
 * What one thing on the record is, and where it was seen: `about` (READ+), the record's door to the kernel's about read
 * (`packages/kernel/src/about.ts`).
 *
 * BEFORE THIS NOTHING ANSWERED "WHAT IS NORTHBANK". The kernel can say what a person, an organisation or a project is
 * (`aboutOfRow`) and which rows a text may be about (`candidatesFor`), and no caller could ask it: the owner in the
 * app and an agent at its door both read a list whole and compared names themselves.
 *
 * ASKED BY A NAME OR BY A NUMBER IN A LIST. `{ name }` is looked up as the kernel looks up any text: a key, then an
 * alias, then a name, then what the full-text index finds. `{ row: { register, seq } }` is one row said outright.
 *
 * A NAME PROPOSES AND NEVER DECIDES ALONE. When one row answers to what was asked by a key, an alias or its name, it
 * is `is`. When two do, `is` is `null` and both are `candidates`, each with its list and its number, so the caller
 * asks again by the row it means. This read picks neither. A row only the full-text index found is a candidate always.
 *
 * HELD TO THE LISTS THE CALLER MAY READ, AND SILENT ABOUT THE REST. A list closed to her is not looked in, a row her
 * narrowed grant leaves out is not there, and the answer is then the one a name nobody has would get: she is never
 * told that something she may not read exists.
 *
 * WHERE IT WAS SEEN IS TWO READINGS. The sightings the record kept (`entity_mention`) are places in words nobody
 * checked against a grant, so only a caller who reads every list is answered them. Beside them, for anybody, are the
 * rows of the lists she reads whose own words name it, each said as its list and its title: a note that names a
 * project is a place the project was seen, with nothing written to make it so. Such a row is one thing's only when
 * that thing alone answers to the name, as the kernel holds a sighting (`seenOf`).
 *
 * WHAT WAITS ON HIM ABOUT IT IS A PLACE IT WAS SEEN, for a caller who reads every list. An open question whose words
 * name the thing, by the same whole-name rule, is said "Waiting on you: Renew Copperleaf's domain for another year?" at
 * the time it was opened, among the other places; never its id, its handle or who opened it. Questions live under no
 * list's grant, so somebody held to some lists is not answered them. Nothing is written to find them.
 *
 * IN NAMES. A row's id, an address, a repository and a folder are never answered: the kernel's read passes none, and a
 * place said here is a list's name and a row's title.
 */

import type { Result } from '@braindog/ports';
import { aboutOfRow, candidatesFor, entityLists, ftsQuery, nameWords, type About, type AboutDeps, type AboutKind, type AboutSeen } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import { scrubbed } from '../scrub.ts';
import { clipped } from '../same-tree.ts';
import type { RecordDeps } from './index.ts';
import { readSight } from '../sight.ts';

/** One thing as `about` answers it: the kernel's reading, and where the row is, by its list and its number there. */
export type AboutSaid = About & { register: string; seq: number | null };

/** A row the name may mean, when the name did not settle on one. `seen` is up to three places, in words. */
export type AboutProposed = { kind: AboutKind; name: string; also: string[]; seen: string[]; register: string; seq: number | null };

/** What `about` answers: the one thing meant, or `null` beside the rows it may be. Both empty is "nothing I may say". */
export type AboutAnswer = { is: AboutSaid | null; candidates: AboutProposed[] };

/** How long a name asked about may be: a name, not a page of text. */
const ASKED = 200;
/** How many places one thing is answered with, newest first, and how many rows are read to find them. */
const SEEN = 20;
const READ = 60;
const PHRASE = 80;
/** How a question that waits on the owner is said as a place. */
const ASKED_OF = 'Waiting on you: ';
/** A row's id, as the record mints one: a title holding one is not said as a place. */
const ROW_ID = /(?<![0-9A-Za-z])[0-9A-HJKMNP-TV-Z]{26}(?![0-9A-Za-z])/i;

const NOTHING: AboutAnswer = { is: null, candidates: [] };

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, readable, no } = deps;

  /** The kernel's read, held to the lists this caller may read. */
  const reading = (ctx: CallContext): AboutDeps => ({
    sql,
    lists: entityLists(kernel.registers().values() as never),
    reads: (register) => readable(ctx, register) === null,
  });

  /** Whether a narrowed grant still admits one row, and the rows kept private from the caller are left out (`sight.ts`). */
  const sight = readSight(kernel);

  /** Every word a row holds, as a name is compared: its text fields and its lists of text, and nothing of a ref. */
  const wordsOf = (fields: Readonly<Record<string, unknown>>): string =>
    ` ${nameWords(
      Object.values(fields)
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .filter((v): v is string => typeof v === 'string')
        .join(' '),
    )} `;

  /**
   * The rows of the lists this caller reads whose own words name the thing, newest first, each as a place: its list's
   * name and its title. The thing's own row is not a place it was seen, and neither is another row of its own list
   * that merely shares the words.
   */
  const namedIn = (ctx: CallContext, self: { id: string; register: string }, names: readonly string[]): AboutSeen[] => {
    const lists = [...kernel.registers().keys()].filter((r) => r !== self.register && readable(ctx, r) === null);
    const keys = [...new Set(names.map((n) => nameWords(n)))].filter((k) => k !== '');
    if (lists.length === 0 || keys.length === 0) return [];
    const out = new Map<string, AboutSeen>();
    for (const key of keys) {
      const query = ftsQuery(key);
      if (!query) continue;
      const hits = sql.all<{ id: string; register: string; seq: number | null; fields: string; updated_at: string }>(
        `SELECT entry.id AS id, entry.register AS register, entry.seq AS seq, entry.fields AS fields, entry.updated_at AS updated_at
           FROM entry_fts JOIN entry ON entry.rowid = entry_fts.rowid
          WHERE entry_fts MATCH ? AND entry_fts.register IN (${lists.map(() => '?').join(', ')}) AND entry.deleted_at IS NULL
          ORDER BY entry.updated_at DESC, entry.id LIMIT ?`,
        query,
        ...lists,
        READ,
      );
      for (const hit of hits) {
        /* THE WHOLE NAME, WORD FOR WORD: the index matches a word's start, and `Northbanks` is not Northbank. AND ONLY IN
           THE FIELDS SHE IS SHOWN (`sight.hidden`): matched on a field hidden from her, a name she typed told her which
           row's hidden notes held it. */
        const hidden = sight.hidden(ctx, hit.register);
        const fields = Object.entries(JSON.parse(hit.fields) as Record<string, unknown>).filter(([k]) => !hidden.has(k));
        if (!wordsOf(Object.fromEntries(fields)).includes(` ${key} `)) continue;
        if (!sight.admits(ctx, hit)) continue;
        const list = kernel.register(hit.register)?.name ?? null;
        const title = kernel.titleOfRow(hit.id);
        if (list === null) continue;
        const where = clipped(title === null || title.trim() === '' || ROW_ID.test(title) ? list : `${list}: ${title.trim()}`, PHRASE);
        if (!out.has(where)) out.set(where, { at: hit.updated_at, where });
      }
    }
    return [...out.values()];
  };

  /**
   * The open questions whose own words name the thing, each as a place: "Waiting on you: " and the question, opened at.
   * Only for a caller who reads every list, as the kept sightings are: a question is the record's, under no list's grant.
   * Never its id, its handle or who opened it.
   */
  const askedOf = (ctx: CallContext, names: readonly string[]): AboutSeen[] => {
    if (deps.readsEveryList?.(ctx) !== true) return [];
    const keys = [...new Set(names.map((n) => nameWords(n)))].filter((k) => k !== '');
    if (keys.length === 0) return [];
    const open = kernel.openSuggestions();
    if (!open.ok) return [];
    const out: AboutSeen[] = [];
    for (const q of open.value) {
      const asked = kernel.question(String(q.id ?? ''));
      if (asked === null) continue;
      const said = (scrubbed(asked) ?? '').replace(/\s+/gu, ' ').trim();
      const words = wordsOf({ said });
      /* THE WHOLE NAME, as `namedIn` holds it, and its own: "Renew Copperleaf's domain" names Copperleaf. */
      if (said === '' || !keys.some((k) => words.includes(` ${k} `) || words.includes(` ${k}'s `))) continue;
      const where = clipped(`${ASKED_OF}${said}`, PHRASE);
      if (ROW_ID.test(where)) continue;
      out.push({ at: String(q.opened_at ?? ''), where });
    }
    return out;
  };

  /**
   * WHETHER A SHARE HIDES A FIELD OF THIS LIST FROM HER. An alias, an address and the words found in a row's text may each
   * be a hidden field's, so on such a list she is told the row's name and nothing it was also called, and a row is found
   * for her by its name alone.
   */
  const masked = (ctx: CallContext, register: string): boolean => sight.hidden(ctx, register).size > 0;

  /** A row as a caller is answered it, or `null` when it is not hers to read or is nothing the kernel's read knows. */
  const said = (ctx: CallContext, about: AboutDeps, id: string): AboutSaid | null => {
    const row = kernel.get(id);
    if (row === null || row.deleted_at !== null || readable(ctx, row.register) !== null || !sight.admits(ctx, row)) return null;
    const what = aboutOfRow(about, id);
    if (what === null) return null;
    /* ONLY WHEN IT ALONE ANSWERS TO THE NAME is a row that says the name a place it was seen (the file's head). */
    const names = [what.name, ...what.also].filter((name) => {
      const found = [...candidatesFor(about, name, null).rows.values()].filter((r) => r.how !== 'text' && r.kind === what.kind);
      return found.length === 1 && found[0]!.id === id;
    });
    const kept = deps.readsEveryList?.(ctx) === true ? what.seen : [];
    const places = new Map<string, AboutSeen>();
    for (const s of [...kept, ...namedIn(ctx, row, names), ...askedOf(ctx, names)]) if (!places.has(s.where)) places.set(s.where, s);
    const seen = [...places.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.where < b.where ? -1 : 1)).slice(0, SEEN);
    return { ...what, ...(masked(ctx, row.register) ? { also: [] } : {}), seen, register: row.register, seq: row.seq };
  };

  return {
    /**
     * `{ name }` or `{ row: { register, seq } }`: what that thing is, as `{ is, candidates }` (the file's head). READ+,
     * and it changes nothing. Both empty when nothing the caller may read answers.
     */
    async about(args: { name?: unknown; row?: unknown } | undefined, ctx: CallContext): Promise<Result<AboutAnswer>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const about = reading(ctx);

      if (args?.row !== undefined && args.row !== null) {
        const at = args.row as { register?: unknown; seq?: unknown };
        if (typeof at !== 'object' || typeof at.register !== 'string' || at.register === '' || typeof at.seq !== 'number' || !Number.isInteger(at.seq) || at.seq < 1)
          return no('VALUE_MALFORMED', 'row names a list by its id and one of its rows by its number, such as { register: "projects", seq: 3 }.', { at: 'row' });
        /* A LIST CLOSED TO HER, A LIST THAT IS NOT THERE AND A NUMBER NOBODY HAS ARE ONE ANSWER, so none is told apart. */
        if (!kernel.register(at.register) || readable(ctx, at.register) !== null) return { ok: true, value: NOTHING };
        const id = sql.one<{ id: string }>('SELECT id FROM entry WHERE register = ? AND seq = ? AND deleted_at IS NULL', at.register, at.seq)?.id;
        return { ok: true, value: id === undefined ? NOTHING : { is: said(ctx, about, id), candidates: [] } };
      }

      const name = typeof args?.name === 'string' ? args.name.trim() : '';
      if (name === '') return no('VALUE_MALFORMED', 'name is what the thing is called, such as the name of a project or a person.', { at: 'name' });
      if (name.length > ASKED) return no('VALUE_MALFORMED', `name is a name, ${ASKED} letters at most.`, { at: 'name' });

      const handed = candidatesFor(about, name, null);
      const found = handed.candidates.flatMap((c) => {
        const row = handed.rows.get(c.h);
        const entry = row === undefined ? null : kernel.get(row.id);
        if (row === undefined || entry === null || !sight.admits(ctx, entry)) return [];
        /* FOUND BY ITS NAME ALONE where a field of its list is hidden from her: an address, an alias or a note's words may be that field. */
        if (row.how !== 'name' && masked(ctx, row.register)) return [];
        return [{ c, row, seq: entry.seq }];
      });
      const sure = found.filter((f) => f.row.how !== 'text');
      const is = sure.length === 1 ? said(ctx, about, sure[0]!.row.id) : null;
      const whole = deps.readsEveryList?.(ctx) === true;
      const candidates = found
        .filter((f) => is === null || f.row.id !== sure[0]!.row.id)
        .map((f): AboutProposed => ({ kind: f.c.kind, name: f.c.name, also: masked(ctx, f.row.register) ? [] : f.c.also, seen: whole ? f.c.seen : [], register: f.row.register, seq: f.seq }));
      return { ok: true, value: { is, candidates } };
    },
  };
}
