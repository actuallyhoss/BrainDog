/**
 * A field retyped or narrowed over the rows a list already holds, the kernel's half: `retypePlan`, `retypeLanding` and
 * `retypeLand` (`21 §5`).
 *
 * THE INSTALL REFUSES THIS, AND IT IS RIGHT TO. `contradicted` in `index.ts` answers `FIELD_TYPE_CHANGED` for a type
 * change over held values and `REQUIRED_ON_POPULATED` for a new required field over empty ones (`04 §5`), because a
 * declaration that says one thing while the rows hold another is a list whose every later edit is refused. A pack
 * update still meets both. This is the one path that converts, and it converts by answering every row first: each value
 * that reads under the new type is written as it reads, and each one that does not is cleared, kept as text in a
 * sibling field, or changed to a value somebody chose. Nothing lands until every such row has its answer.
 *
 * ONE TRANSACTION FOR THE WHOLE OF IT. The new version of the list goes in through the staged install a pack takes
 * (`stageInstall`, which asks everything about the declaration and leaves the rows to its caller), and every row is then
 * written through the ordinary write path, with the version it was read at, inside the same savepoint. A row that moved,
 * or a value the write path refuses, takes the list's new version back out with it. Every write and the `declare` line
 * carry one batch, so History reads the change as one thing and Put back undoes it as one.
 *
 * NO NEW EVENT KIND, NO MIGRATION. The list's change is the `declare` event the install path writes for any change, and
 * each row's is the `edit` its write earns. A `change` body carries it (`govern.ts`, `{ retype: ... }` or
 * `{ narrow: ... }`), so an owner's lands at once and anybody else's waits on Decide.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { coerce, instant, isAbsent, type FieldDecl, type Json } from '../coerce.ts';
import type { Patch } from '../index.ts';
import type { KernelParts } from '../parts.ts';
import { attempt } from '../tx.ts';
import { widens } from '../widen.ts';

/** The two ops a `change` body may carry: a type moved, or the same type asking more of its rows. */
export const RETYPE_OPS = ['retype', 'narrow'] as const;
export type RetypeOp = (typeof RETYPE_OPS)[number];

/** The most live rows one conversion reads. Past it the change is an import and wants a different path. */
export const RETYPE_ROWS_MOST = 5000;
/** How many converted values the preview shows beside the failures. */
export const RETYPE_SAMPLE_MOST = 5;

/** What a field may be asked to become. Everything else about the field (its id, its label, its bounds) stays. */
export const RETYPE_KEYS = ['type', 'of', 'values', 'labels', 'transitions', 'to', 'unit', 'required'] as const;
/** The keys that belong to a type, taken off the field when its type moves so an enum's values do not ride onto text. */
const TYPE_KEYS = ['type', 'of', 'values', 'labels', 'transitions', 'to', 'unit'] as const;
/** The types a field is never retyped into: a secret is never a value on a row, and nobody types a file or raw JSON. */
const NEVER_INTO = new Set(['secret', 'file', 'json']);

/**
 * The answer for one row that would not convert.
 *
 * `clear` empties it. `keep` empties it and puts what it held, as text, in a sibling field beside it, so nothing typed is
 * lost. `{ to }` writes a value somebody chose: "Fill" for a required field a row left empty, and "Change to" for a
 * choice taken out of the list.
 */
export type RetypeAnswer = 'clear' | 'keep' | { to: Json };

/** What is asked: which field of which list, what it becomes, and the answers given so far, by row id. */
export type RetypeAsk = { register: string; field: string; as: Record<string, Json>; answers?: Record<string, RetypeAnswer> };

/** One row the conversion cannot carry by itself, with what it holds, why, and the answers it may take. */
export type RetypeFailing = { id: string; at: string; title: string; value: Json; why: string; takes: ('clear' | 'keep' | 'to')[] };

/** What a conversion would do over the list's live rows, before anything is written. */
export type RetypePlan = {
  op: RetypeOp;
  register: string;
  field: string;
  /** The type as held and as asked, `list<text>` spelled whole. */
  from: string;
  to: string;
  /** Every stored value reads under the new type unchanged (`widen.ts`), so no row is written. */
  widens: boolean;
  /** Live rows the list holds, and the ones among them whose value is written by this change without being asked. */
  rows: number;
  converts: number;
  failing: RetypeFailing[];
  /** A few rows as they are and as they would be. */
  sample: { at: string; title: string; from: Json; to: Json }[];
  /** Failing rows the answers given do not yet cover. The change is filed only at zero. */
  unanswered: number;
  /** The sibling field `keep` writes into, when any answer asks for one. */
  keep: string | null;
};

/** What landing writes: the list's next body, the version it was drawn from, and each row's patch at its version. */
export type RetypeLanding = {
  op: RetypeOp;
  register: string;
  field: string;
  decl: { id: string; kind: 'register'; body: Record<string, Json> };
  version: number;
  writes: { id: string; version: number; patch: Patch }[];
  said: string;
};

export type RetypeLanded = { register: string; field: string; version: number; wrote: number; batch: string };

type Field = Record<string, Json>;
const isMap = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const typeOf = (f: Field): string => `${String(f.type)}${f.of === undefined ? '' : `<${String(f.of)}>`}`;
const same = (a: Json, b: Json): boolean => JSON.stringify(a) === JSON.stringify(b);
const rowsSaid = (n: number): string => (n === 1 ? '1 row' : `${n.toLocaleString('en-GB')} rows`);

/**
 * A value as text, for `keep` and for the second try at converting it.
 *
 * A NUMBER OR A YES/NO IS WRITTEN AS IT READS, and a list as its items. Anything else is its JSON, which is at least the
 * whole of what it held; nothing here guesses what an amount of money should read as in words.
 */
export function textOf(value: Json): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) return value.join(', ');
  return JSON.stringify(value);
}

/** The op a field's change is: `retype` when its type moves, and `narrow` for everything that keeps the type. */
export const opOf = (was: Field, now: Field): RetypeOp => (typeOf(was) === typeOf(now) ? 'narrow' : 'retype');

/**
 * The shape of a `{ retype: ... }` or `{ narrow: ... }` body, as a sentence saying what is wrong, or `null`.
 *
 * ONLY THE SHAPE. Whether the list and field exist, and whether every row is answered, is asked against the record when
 * it is filed and again when it is accepted (`govern.ts`), because the rows move in between.
 */
export function retypeShapeFault(to: unknown): { fix: string; at: string } | null {
  if (!isMap(to)) return { fix: 'A retype is {"retype":{"register":"<list>","field":"<field>","as":{"type":"<type>"}}}.', at: 'body.to' };
  const keys = Object.keys(to);
  const op = keys[0];
  if (keys.length !== 1 || !(RETYPE_OPS as readonly string[]).includes(op ?? ''))
    return { fix: 'A retype carries one of retype or narrow, and nothing beside it.', at: 'body.to' };
  const ask = to[op!];
  if (!isMap(ask)) return { fix: `${op} is {"register":"<list>","field":"<field>","as":{...}}.`, at: `body.to.${op}` };
  const extra = Object.keys(ask).find((k) => !['register', 'field', 'as', 'answers'].includes(k));
  if (extra !== undefined) return { fix: `${op} takes register, field, as and answers, so ${extra} is not one of them.`, at: `body.to.${op}.${extra}` };
  if (typeof ask.register !== 'string' || ask.register === '') return { fix: `${op} names the list, as register.`, at: `body.to.${op}.register` };
  if (typeof ask.field !== 'string' || ask.field === '') return { fix: `${op} names the field, as field.`, at: `body.to.${op}.field` };
  if (!isMap(ask.as)) return { fix: `${op} says what the field becomes, as {"type":"<type>"} or the values it keeps.`, at: `body.to.${op}.as` };
  const stray = Object.keys(ask.as).find((k) => !(RETYPE_KEYS as readonly string[]).includes(k));
  if (stray !== undefined) return { fix: `as takes ${RETYPE_KEYS.join(', ')}, so ${stray} is not one of them.`, at: `body.to.${op}.as.${stray}` };
  if (ask.answers !== undefined && !isMap(ask.answers)) return { fix: 'answers is {"<row id>":"clear"}, one answer a row.', at: `body.to.${op}.answers` };
  return null;
}

/** The ask a `{ retype }` or `{ narrow }` body carries, once `retypeShapeFault` has passed it. */
export const askOf = (to: Record<string, unknown>): RetypeAsk => (to.retype ?? to.narrow) as RetypeAsk;

/** The id `keep` writes into: `<field>_text`, then `_text_2` and on, never one the list already holds. */
function keepIdOf(field: string, held: readonly Field[]): string {
  const taken = new Set(held.map((f) => String(f.id)));
  const base = `${field.slice(0, 27)}_text`;
  if (!taken.has(base)) return base;
  /* A LIST HOLDS AT MOST A FEW HUNDRED FIELDS, so a free number is always found well inside this ceiling. */
  for (let n = 2; n < 1000; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
  return `${field.slice(0, 20)}_as_text`;
}

/**
 * The list's body with the field as asked, and the sibling `keep` needs when an answer asks for it.
 *
 * PURE, SO `govern.ts` RESOLVES A FILED CHANGE WITH THE SAME ANSWER THE LANDING WRITES. The field keeps its id, its label
 * and its bounds; when its type moves, what belonged to the old type (an enum's values and labels, a link's list, a
 * duration's unit) goes with it, and the asked keys are laid over what is left.
 */
export function retypedBody(
  live: Record<string, unknown>,
  ask: RetypeAsk,
): Result<{ body: Record<string, Json>; was: Field; now: Field; keep: string | null }> {
  const name = typeof live.name === 'string' ? live.name : ask.register;
  const fields = (Array.isArray(live.fields) ? live.fields : []).filter(isMap) as Field[];
  const was = fields.find((f) => f.id === ask.field);
  if (!was) return no('FIELD_UNKNOWN', `${name} has no field called ${ask.field}.`, { at: 'field' });
  if (was.retired === true) return no('FIELD_UNKNOWN', `${ask.field} is retired on ${name}, so there is nothing to change it into.`, { at: 'field' });
  if (was.derived === true) return no('VALUE_MALFORMED', `${ask.field} is worked out by BrainDog, so its type is not one to change.`, { at: 'field' });

  const as = ask.as;
  const moving = as.type !== undefined && (as.type !== was.type || (as.of ?? null) !== (was.of ?? null));
  const now: Field = { ...was };
  if (moving) for (const k of TYPE_KEYS) delete now[k];
  for (const k of RETYPE_KEYS) {
    if (as[k] === undefined) continue;
    /* `required: false` IS TAKING IT OFF, and an absent key reads the same way to every reader, so it is left out. */
    if (k === 'required' && as[k] === false) delete now.required;
    else now[k] = as[k]!;
  }
  if (typeof now.type !== 'string') return no('REQUIRED_MISSING', 'Say what the field becomes, as its type.', { at: 'as.type' });
  if (NEVER_INTO.has(now.type) || (now.type === 'list' && typeof now.of === 'string' && NEVER_INTO.has(now.of)))
    return no('VALUE_MALFORMED', `A field is not changed into a ${now.type}. Add a new field for it instead.`, { at: 'as.type' });
  const enumish = now.type === 'enum' || (now.type === 'list' && now.of === 'enum');
  if (!enumish) {
    delete now.values;
    delete now.labels;
    delete now.transitions;
  }
  /* THE ROLES A LIST READS A FIELD BY ARE HELD TO THEIR TYPE. A title that stopped being text, or a state that stopped
     being a choice, is a list every screen reads wrong; the install's lint refuses the second, and this says both first. */
  if (moving && live.title === ask.field) return no('VALUE_MALFORMED', `${ask.field} is ${name}'s title, so it stays text.`, { at: 'as.type' });
  if (moving && live.state === ask.field && now.type !== 'enum') return no('VALUE_MALFORMED', `${ask.field} is ${name}'s state, so it stays a choice.`, { at: 'as.type' });
  if (same(was, now)) return no('VALUE_MALFORMED', `${ask.field} is already that, so there is nothing to change.`, { at: 'as' });

  const keeping = Object.values(ask.answers ?? {}).some((a) => a === 'keep');
  const keep = keeping ? keepIdOf(ask.field, fields) : null;
  const label = typeof was.label === 'string' ? was.label : ask.field.replace(/_/gu, ' ');
  const next = fields.map((f) => (f.id === ask.field ? now : f));
  if (keep !== null) next.push({ id: keep, label: `${label} (as text)`, type: 'text' });
  return ok({ body: { ...(live as Record<string, Json>), fields: next }, was, now, keep });
}

/**
 * What one stored value becomes under the new field, or why it does not.
 *
 * THE WRITE PATH'S OWN READING (`coerce`), so a value that converts here is one the write path takes. A value that is
 * not text is tried once more as its text, which is how `12` held by a number field reads into a text field, and `"12"`
 * into a whole number. Membership of a choice list is the write path's and not `coerce`'s, so it is asked here.
 */
function converted(now: Field, value: Json, widening: boolean): { ok: true; value: Json } | { ok: false; why: string } {
  if (widening) return { ok: true, value };
  const decl = now as unknown as FieldDecl;
  let read = coerce(decl, value);
  if (!read.ok && typeof value !== 'string') read = coerce(decl, textOf(value));
  if (!read.ok) return { ok: false, why: read.refusal.fix };
  const values = Array.isArray(now.values) ? now.values.map(String) : null;
  if (values !== null) {
    const held = now.type === 'enum' ? [read.value] : Array.isArray(read.value) ? read.value : [];
    const out = held.find((v) => !values.includes(String(v)));
    if (out !== undefined) return { ok: false, why: `${String(out)} is not one of the choices it keeps.` };
  }
  return { ok: true, value: read.value };
}

/** Whether an answer is one this row may take, and the value it writes when it is. */
function answered(now: Field, row: RetypeFailing, answer: RetypeAnswer | undefined): { ok: true; patch: 'clear' | 'keep' | { to: Json } } | { ok: false; why?: string } {
  if (answer === undefined) return { ok: false };
  if (answer === 'clear' || answer === 'keep') return row.takes.includes(answer) ? { ok: true, patch: answer } : { ok: false, why: `${row.at} takes ${row.takes.join(' or ')}.` };
  if (!isMap(answer) || !('to' in answer) || !row.takes.includes('to')) return { ok: false, why: `${row.at} takes ${row.takes.join(' or ')}.` };
  const to = answer.to as Json;
  if (isAbsent(to)) return { ok: false, why: `${row.at} needs a value to change to.` };
  const read = converted(now, to, false);
  if (!read.ok) return { ok: false, why: `${row.at}: ${read.why}` };
  return { ok: true, patch: { to: read.value } };
}

export function extension(parts: KernelParts) {
  const { sql, clock, mint, transaction, write, reload, caches } = parts;

  /** The live body and version of `register.<list>`, or `null` when no list of that name is installed. */
  const liveList = (list: string): { version: number; body: Record<string, unknown> } | null => {
    const held = sql.one<{ version: number; body: string }>(
      "SELECT version, body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1",
      `register.${list}`,
    );
    if (!held) return null;
    try {
      const body: unknown = JSON.parse(held.body);
      return isMap(body) ? { version: held.version, body } : null;
    } catch {
      return null;
    }
  };

  /** The plan and everything the landing needs beside it, read in one pass over the rows. */
  function read(ask: RetypeAsk): Result<{ plan: RetypePlan; landing: Omit<RetypeLanding, 'said'> | null; faults: string[] }> {
    if (!isMap(ask) || typeof ask.register !== 'string' || typeof ask.field !== 'string' || !isMap(ask.as))
      return no('VALUE_MALFORMED', 'Say the list, the field and what it becomes: {"register":"<list>","field":"<field>","as":{"type":"<type>"}}.', { at: 'as' });
    const live = liveList(ask.register);
    if (!live) return no('REGISTER_UNKNOWN', `There is no list called ${ask.register}.`, { at: 'register' });
    const shaped = retypedBody(live.body, ask);
    if (!shaped.ok) return shaped as Result<never>;
    const { body, was, now, keep } = shaped.value;
    const op = opOf(was, now);
    const widening = op === 'retype' && widens(was, now);
    const required = now.required === true && now.default === undefined;

    const rows = sql.all<{ id: string; seq: number | null; version: number; fields: string }>(
      'SELECT id, seq, version, fields FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq, id LIMIT ?',
      ask.register,
      RETYPE_ROWS_MOST + 1,
    );
    if (rows.length > RETYPE_ROWS_MOST)
      return no('OUT_OF_BOUNDS', `A field is changed in place over at most ${RETYPE_ROWS_MOST.toLocaleString('en-GB')} rows. Add a new field beside it instead.`, { at: 'register' });

    const title = typeof live.body.title === 'string' ? live.body.title : null;
    const failing: RetypeFailing[] = [];
    const sample: RetypePlan['sample'] = [];
    const writes: RetypeLanding['writes'] = [];
    const faults: string[] = [];
    let converts = 0;
    let unanswered = 0;

    for (const r of rows) {
      let fields: Record<string, Json>;
      try {
        fields = JSON.parse(r.fields) as Record<string, Json>;
      } catch {
        continue;
      }
      const at = r.seq === null ? r.id : `${ask.register}#${r.seq}`;
      const named = title !== null && typeof fields[title] === 'string' ? String(fields[title]) : at;
      const value = fields[ask.field] ?? null;
      let fail: RetypeFailing | null = null;

      if (isAbsent(value)) {
        if (required) fail = { id: r.id, at, title: named, value, why: 'It is empty, and the field would be required.', takes: ['to'] };
        else continue;
      } else {
        const out = converted(now, value, widening);
        if (out.ok) {
          if (!same(out.value, value)) {
            converts += 1;
            writes.push({ id: r.id, version: r.version, patch: { [ask.field]: out.value } });
            if (sample.length < RETYPE_SAMPLE_MOST) sample.push({ at, title: named, from: value, to: out.value });
          }
          continue;
        }
        /* A CHOICE TAKEN OUT OF THE LIST IS CHANGED TO ANOTHER, or emptied when the field may be empty; a value the new
           type cannot read may also be kept as text beside it. */
        const takes: RetypeFailing['takes'] = op === 'retype' ? ['clear', 'keep', 'to'] : ['to', 'clear'];
        fail = { id: r.id, at, title: named, value, why: out.why, takes: required ? takes.filter((t) => t !== 'clear') : takes };
      }

      failing.push(fail);
      const answer = answered(now, fail, ask.answers?.[r.id]);
      if (!answer.ok) {
        unanswered += 1;
        if (answer.why !== undefined) faults.push(answer.why);
        continue;
      }
      const patch: Patch =
        answer.patch === 'clear'
          ? { [ask.field]: null }
          : answer.patch === 'keep'
            ? { [ask.field]: null, [keep!]: textOf(value) }
            : { [ask.field]: answer.patch.to };
      writes.push({ id: r.id, version: r.version, patch });
    }

    const plan: RetypePlan = {
      op,
      register: ask.register,
      field: ask.field,
      from: typeOf(was),
      to: typeOf(now),
      widens: widening,
      rows: rows.length,
      converts,
      failing,
      sample,
      unanswered,
      keep,
    };
    const landing = unanswered === 0 && faults.length === 0
      ? { op, register: ask.register, field: ask.field, decl: { id: `register.${ask.register}`, kind: 'register' as const, body }, version: live.version, writes }
      : null;
    return ok({ plan, landing, faults });
  }

  return {
    /**
     * What changing one field would do over its list's live rows, written nowhere: how many convert, each row that does
     * not with the answers it may take, and a few converted values (`21 §5`).
     */
    retypePlan(ask: RetypeAsk): Result<RetypePlan> {
      const out = read(ask);
      return out.ok ? ok(out.value.plan) : (out as Result<never>);
    },

    /**
     * What landing the change writes, or why it cannot land yet.
     *
     * EVERY FAILING ROW ANSWERED, OR NOTHING. A row with no answer is counted in the refusal rather than cleared by
     * default, because an empty cell nobody chose is data lost without a word.
     */
    retypeLanding(ask: RetypeAsk): Result<RetypeLanding> {
      const out = read(ask);
      if (!out.ok) return out as Result<never>;
      const { plan, landing, faults } = out.value;
      if (faults.length > 0) return no('VALUE_MALFORMED', faults[0]!, { at: 'answers' });
      if (landing === null)
        return no('REQUIRED_MISSING', `${rowsSaid(plan.unanswered)} would not carry over and ${plan.unanswered === 1 ? 'has' : 'have'} no answer yet. Answer each one first.`, { at: 'answers' });
      const said =
        plan.op === 'retype'
          ? `Changed ${plan.field} from ${plan.from} to ${plan.to}, writing ${rowsSaid(landing.writes.length)}.`
          : `Changed what ${plan.field} takes, writing ${rowsSaid(landing.writes.length)}.`;
      return ok({ ...landing, said });
    },

    /**
     * Land a change `retypeLanding` drew: the list's new version through `apply` (a staged install), then every row.
     *
     * `apply` IS THE STAGED INSTALL'S WRITE, handed in because staging hashes the body and a kernel extension is handed
     * no install (`parts.ts`); `packages/record/src/methods/retype.ts` stages it and calls this straight after. The list
     * is asked for the version the landing was drawn from inside the savepoint, so a change that landed in between is a
     * refusal here rather than a body that erases it. A refusal anywhere puts the caches back with the tables.
     */
    retypeLand(landing: RetypeLanding, apply: () => Result<unknown>, by: { actor: string; suggestion?: string | undefined }): Result<RetypeLanded> {
      const saved = caches.save();
      const batch = mint();
      const out = attempt(sql, transaction, (): Result<RetypeLanded> => {
        const live = liveList(landing.register);
        if (!live || live.version !== landing.version)
          return no('PLAN_STALE', `${landing.register} changed after this was drawn and is at version ${String(live?.version ?? 0)} now. Look at the conversion again.`, { at: 'register' });
        const applied = apply();
        if (!applied.ok) return applied as Result<never>;
        reload();
        const note = by.suggestion === undefined ? landing.said : `${landing.said} Accepted in ${by.suggestion}.`;
        for (const w of landing.writes) {
          /* NO RULE RUNS OFF A CONVERSION. A value that reads the same in its new type is not something that happened
             to the row, and an automation that fired on each of a thousand rows would be the change's side effect. */
          const made = write(landing.register, w.id, w.patch, { actor: by.actor, batch, version: w.version, note, cascade: false });
          if (!made.ok) return made as Result<never>;
        }
        const now = liveList(landing.register);
        /* THE `declare` LINE THE INSTALL PATH WRITES FOR ANY CHANGE, in this batch, so History reads the change and its
           rows as one thing. The staged install writes none (a pack's path writes its own), so it is written here. */
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, from_v, to_v, note, batch) VALUES (?, ?, ?, 'declare', ?, 'declaration', ?, ?, ?, ?)",
          mint(),
          instant(clock.now()),
          by.actor,
          `declaration:register.${landing.register}`,
          String(landing.version),
          String(now?.version ?? landing.version + 1),
          note.slice(0, 280),
          batch,
        );
        return ok({ register: landing.register, field: landing.field, version: now?.version ?? landing.version + 1, wrote: landing.writes.length, batch });
      });
      if (!out.ok) {
        caches.restore(saved);
        reload();
      }
      return out;
    },
  };
}
