/**
 * A colour of its own for the rows that have none, the record's half of PGS-A06 step 5: `huesWanted`, READ+, and
 * `giveHues`, DATA (`30 §5`).
 *
 * WHY THERE ARE ROWS WITHOUT ONE. A list that declares `identity.accent` gives each new row its hue at create, the
 * theme's `nextAccentHue` of the hues the list already holds (`huedOf` in `index.ts`). Rows made before that, or brought
 * in by an import, hold nothing there and draw grey. Nothing gives them one by itself: this is an offer the person
 * presses, never a question the record files on its own.
 *
 * THE READ COUNTS, THE PRESS WRITES EACH ONCE. `huesWanted` answers, for every list the caller reads that names an
 * accent, how many live rows hold no hue and up to five of their names. `giveHues({ list })` gives each of them one, in
 * the order they were made, each the `nextAccentHue` of every hue the list holds by then, so no two land close together
 * for any kind of sight. A row that holds a hue is never touched, so a second press writes nothing.
 *
 * NO HUE IS `null` OR ABSENT. `huedOf` lets a `null` sent at create stand, but an import writes `null` for an empty cell
 * as readily as a person does, and both draw grey. A value that is there and is not a whole degree is somebody's and is
 * left alone, and counted as neither held nor wanted.
 *
 * ONE BATCH, SIGNED BY THE PERSON, ALL OR NONE. Every write runs in one kernel transaction under one minted batch, so one
 * Undo takes every colour back; a write that will not land takes back every one before it. A token is refused: colours
 * are how the person tells his things apart, and the press is his. The level is the one a row write takes (`update` in
 * `index.ts`), on the list itself.
 *
 * HELD TO THE ROWS A NARROWED GRANT ADMITS. A grant on some rows of a list (`ctx.wheres`) is told of those alone, as
 * every reader is, and a press colours those alone: a row it leaves out is not there for this caller, by count or name.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { nextAccentHue } from '@braindog/theme';
import { ulids } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The most names one list's answer carries. The count says the rest. */
export const HUES_NAMED = 5;

/** One list with rows that hold no hue: how many, and a few of them by name. */
export type HuesList = { list: string; name: string; count: number; names: string[]; said: string };

/** What `huesWanted` answers: each list with rows wanting a hue, and how many across them. */
export type HuesWanted = { lists: HuesList[]; total: number };

/** What `giveHues` answers: how many were given a hue, which, and the batch `undo({ batch })` takes back. */
export type HuesGiven = { list: string; gave: number; names: string[]; batch: string | null };

type Row = { id: string; seq: number | null; fields: Record<string, unknown>; version: number };

const isMap = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** A whole degree on the circle, which is what a hue held is. */
const isHue = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 360;

/** No hue at all: never written, or written empty. */
const unhued = (v: unknown): boolean => v === undefined || v === null;

/** The sentence a person reads for one list. */
const saidOf = (count: number, name: string): string =>
  count === 1 ? `1 in ${name} has no colour of its own.` : `${String(count)} in ${name} have no colour of their own.`;

/** A write that stopped part way, carried out of the transaction so every hue before it is taken back. */
class Halt {
  readonly refusal: Refusal;
  constructor(refusal: Refusal) {
    this.refusal = refusal;
  }
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, scoped, readable, named, no, tail, clock } = deps;
  /** The press's one batch, minted on the record's clock as the record mints every other. */
  const mint = ulids(() => clock.now());

  /** The field a list names as its accent, when it names one and it holds whole numbers; otherwise `null`. */
  const accentOf = (list: string): string | null => {
    const decl = kernel.register(list) as { identity?: { accent?: unknown }; fields?: { id: string; type: string }[] } | undefined;
    const accent = decl?.identity?.accent;
    if (typeof accent !== 'string') return null;
    return decl?.fields?.find((f) => f.id === accent)?.type === 'int' ? accent : null;
  };

  /** A list's live rows, in the order they were made. */
  const rowsOf = (list: string): Row[] =>
    sql
      .all<{ id: string; seq: number | null; fields: string; version: number }>(
        'SELECT id, seq, fields, version FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq, id',
        list,
      )
      .map((r) => ({ id: r.id, seq: r.seq, version: r.version, fields: JSON.parse(r.fields) as Record<string, unknown> }));

  /** What a row is called: its list's title field as written, or a plain word when it holds none. */
  const titleOf = (list: string, row: Row): string => {
    const title = kernel.register(list)?.title;
    const v = title === undefined ? undefined : row.fields[title];
    const said = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
    return said === '' ? 'Untitled' : said;
  };

  /** Whether a narrowed grant still admits one row, read again by its own number as `about` reads one. */
  const admitted = (ctx: CallContext, list: string, seq: number | null): boolean => {
    if (seq === null) return true;
    const rule = kernel.scope(ctx, list);
    if (rule === undefined) return true;
    const found = kernel.list({ register: list, where: { field: 'seq', is: seq }, limit: 1 }, rule);
    return found.ok && found.value.rows.length > 0;
  };

  /** What a list is called to a person. */
  const nameOf = (list: string): string => kernel.register(list)?.name ?? list;

  return {
    /**
     * For each list the caller reads that names an accent, the live rows that hold no hue: how many, up to five names,
     * and the sentence a person reads. `{ list? }` asks of one. READ+, held to the lists the caller reads. It writes
     * nothing, and a list with every row coloured is left out.
     */
    async huesWanted(args: unknown, ctx: CallContext): Promise<Result<HuesWanted>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const one = isMap(args) && args.list !== undefined ? args.list : undefined;
      if (one !== undefined && typeof one !== 'string') return no('VALUE_MALFORMED', 'Name the list by its id, as text.', { at: 'list' });
      const lists = one === undefined ? [...kernel.registers().keys()] : [one];
      const out: HuesList[] = [];
      for (const list of lists) {
        if (readable(ctx, list) !== null) continue;
        const accent = accentOf(list);
        if (accent === null) continue;
        const wanting = rowsOf(list).filter((r) => unhued(r.fields[accent]) && admitted(ctx, list, r.seq));
        if (wanting.length === 0) continue;
        const name = nameOf(list);
        out.push({ list, name, count: wanting.length, names: wanting.slice(0, HUES_NAMED).map((r) => titleOf(list, r)), said: saidOf(wanting.length, name) });
      }
      return ok({ lists: out, total: out.reduce((n, l) => n + l.count, 0) });
    },

    /**
     * Give every live row of one list that holds no hue a hue of its own, `{ list }`, in one batch signed by the person,
     * so one Undo takes them all back. Each is the theme's `nextAccentHue` of every hue the list holds by then. A row with
     * a hue is never touched, so nothing left to colour writes nothing and answers no batch. DATA, at the level a row
     * write takes on that list, and a person only.
     */
    async giveHues(args: unknown, ctx: CallContext): Promise<Result<HuesGiven>> {
      const stop = guard(ctx, 'write', isMap(args) && typeof args.list === 'string' ? args.list : undefined);
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'person')
        return { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Giving your things their colours is yours to press. Open it from the app.', at: 'principal' } };
      const list = isMap(args) ? args.list : undefined;
      const missing = named({ register: list });
      if (missing) return { ok: false, refusal: { ...missing, at: 'list' } };
      if (typeof list !== 'string' || kernel.register(list) === undefined)
        return no('REGISTER_UNKNOWN', 'There is no list by that name. Ask huesWanted for the lists that have things without a colour.', { at: 'list' });
      const accent = accentOf(list);
      if (accent === null) return no('FIELD_UNKNOWN', `${nameOf(list)} does not give its things a colour of their own.`, { at: 'list' });

      const batch = mint();
      const actor = ctx.principal.id;
      const names: string[] = [];
      try {
        kernel.transaction(() => {
          /* READ AGAIN INSIDE THE WRITE, so a hue set a moment ago is held and its row left alone. */
          const rows = rowsOf(list);
          const held = rows.flatMap((r) => (isHue(r.fields[accent]) ? [r.fields[accent] as number] : []));
          for (const row of rows) {
            if (!unhued(row.fields[accent]) || !admitted(ctx, list, row.seq)) continue;
            const hue = nextAccentHue(held);
            const ref = row.seq === null ? row.id : `${list}#${String(row.seq)}`;
            const out = kernel.update(list, ref, { [accent]: hue }, { actor, batch, version: row.version, note: 'Given a colour of its own.' });
            if (!out.ok) {
              const r: Refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'Something changed while the colours were given. Press it again.' };
              throw new Halt({ ...r, fix: `${titleOf(list, row)}: ${r.fix}` });
            }
            held.push(hue);
            names.push(titleOf(list, row));
          }
        });
      } catch (e) {
        if (!(e instanceof Halt)) throw e;
        return tail({ ok: false as const, refusal: e.refusal });
      }
      if (names.length === 0) return ok({ list, gave: 0, names, batch: null });
      return tail(ok({ list, gave: names.length, names, batch }));
    },
  };
}
