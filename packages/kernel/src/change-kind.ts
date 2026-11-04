/**
 * What kind of change a write or a proposal is, and whether it sits on the floor no rung lifts.
 *
 * WHY THIS EXISTS. An agent earns trust one kind of change at a time ("staff who earn trust"): it starts
 * at Ask, and once the owner has kept ten changes of one kind unchanged it is offered Do and tell for that kind and no
 * other. That needs a name for "a kind of change" that the write path, a proposal and the ladder all agree on, and a
 * fixed set of kinds that never climb however often they are kept. This file is both, written the way `weigh.ts` is:
 * the fact is computed from what the write or the body already says, never declared by whoever sends it.
 *
 * A KIND IS A LIST AND A VERB, keyed on what the write path already records (`index.ts`'s `writing`, one event per
 * changed field): `create` is `<list>:add`, a `state` move is `<list>:move:<to>`, `edit` and `link` are `<list>:edit`,
 * `tag` and `untag` are `<list>:tag`, a `note` is `<list>:note`, and `delete`, `restore` and `purge` are
 * `<list>:delete`. So `tasks:move:done` reads as "marks tasks done", which is the sentence Settings shows beside a
 * grant. A proposal breaks down into the same keys, plus four of its own: `shape:<list>` for a change to a list's
 * fields, `automation` for anything that runs unattended, `addons` for packs, settings and arrangements, and `call` for
 * a choice between options. An `attach` is `<list>:attach`: a name in a text put on the row it is, by the sentence it
 * was seen in, which is its own kind so it can be earned apart from editing the row.
 *
 * THE FLOOR IS FIXED RULES AND NOTHING ELSE, the way `costOf` is. A kind on the floor is Ask for every agent, every
 * grant and every rung, Slash included, and no setting lifts it:
 *   - `delete`: taking a row, or a field, away, which is also sending a field empty
 *   - `money`: a money amount set or changed
 *   - `keys`: anything in a list that holds a sealed value, which is where keys live
 *   - `sharing`: where a row applies, which is who can see it
 *   - `identity`: who a person or an organisation is: folding one into another, the addresses, handles, keys and
 *     domain `meet` knows them by, since a key added to the wrong row files everything that arrives under it there,
 *     which person is the record's own, or the names a merge matches on. A new row may be made with a name; one made
 *     already joined to someone, or with their addresses, asks like the edit would
 *   - `addons`: installing, turning on or off, or setting up an add-on
 *   - `outside`: anything that runs unattended or sends something out of the record, or a list the record does not have
 *   - `others`: a row another person made.
 *
 * NO WORDS A PERSON READS ARE HERE. The keys are facts; `packages/record` and the web say them in a person's words.
 */

import type { Sql } from '@braindog/ports';

import { meetsRole, orgRole, type RoleField } from './roles.ts';
import { SESSION, SESSION_PREFIX } from './session.ts';
import { SLASH } from './slash.ts';
import { kindOfAutomationChange } from './automation-kind.ts';
import { keyOf } from './identity-keys.ts';

/** The rungs, lowest first: ask before writing, write and say so, write and say nothing. */
export const RUNGS = ['ask', 'tell', 'quiet'] as const;
export type Rung = (typeof RUNGS)[number];

/** The floor, dearest first, which is also the order a kind that hits two is named by. */
export const FLOORS = ['delete', 'keys', 'money', 'sharing', 'identity', 'others', 'addons', 'outside'] as const;
export type Floor = (typeof FLOORS)[number];

/** A kind of change: its key, the list it is about when it is about one, its verb, and the floor it hits or `null`. */
export type ChangeKind = { key: string; list: string | null; verb: string; floor: Floor | null };

/** The keys a proposal has that a write does not. */
export const CALL = 'call';
export const ADDONS = 'addons';
export const AUTOMATION = 'automation';
/** The verb of a mention attached to a row it names, `<list>:attach`. */
export const ATTACH = 'attach';

/** How many days of an existing write token's own writes keep their kinds at Do and tell, once, when the ladder arrives. */
export const KEPT_DAYS = 30;

/**
 * What this file needs of a list: its fields, with their types, which field is its state, which fields say who a row
 * is (`identity`), and which of those only name it (`names`).
 *
 * STRUCTURAL, so a `RegisterDecl`, a declaration's parsed body and a test's literal are all one.
 *
 * `identity` IS READ FROM THE ROLES THE LIST PLAYS (`roles.ts`), never from its name or a field's: the fields playing
 * `merged_into`, `email`, `handles`, `keys`, `self`, `name`, `aliases` or `org` in the people `meet` writes, or
 * `merged_into`, `keys`, `domain` or `name` in its organisations. Any record's People, and any pack's list that
 * declares the role, get the same floor.
 *
 * `names` ARE THE ONES A NEW ROW MAY BE MADE WITH: its name, the other names it goes by, and the organisation a person
 * is with. Every row is made with a name, so adding a person by name alone is an add like any other; changing one
 * later is a rename a merge would match on, and asks. The rest of `identity` asks on the add too.
 */
export type ListShape = {
  fields: readonly { id: string; type?: string; of?: string; scope?: unknown; by?: unknown; transitions?: unknown }[];
  state?: string;
  identity?: readonly string[];
  names?: readonly string[];
  /** The fields that keep where a row was seen (the `met` part, `roles.ts`), the one place an attach writes. */
  seen?: readonly string[];
};

/**
 * What a write says about itself. `madeBy` is the person who made the row, and `person` the one the writer acts for.
 * `was` is the row's fields as they stand, when the caller has them, so a field sent back as it already was is not
 * read as clearing it or as changing who the row is.
 */
export type WriteSaid = {
  list: string;
  op: 'create' | 'update' | 'delete' | 'note';
  patch?: Record<string, unknown>;
  shape: ListShape | null;
  madeBy?: string | null;
  person?: string | null;
  was?: Record<string, unknown> | null;
};

/** What reading a proposal needs from the record: a list's shape, who made a row, its fields now, and who the filer acts for. */
export type KindReader = {
  shape: (list: string) => ListShape | null;
  madeBy?: (list: string, at: string) => string | null;
  fieldsOf?: (list: string, at: string) => Record<string, unknown> | null;
  person?: string | null;
  /** The installed rule's live body, by the declaration a change names, `null` when none is installed. */
  ruleBody?: (d: Record<string, unknown>) => unknown | null;
};

const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The verbs in the order they are named by, dearest first: what a stamp of several lists first. */
const VERB_ORDER = ['delete', 'move', 'edit', 'tag', ATTACH, 'add', 'note', 'shape', AUTOMATION, ADDONS, CALL];
const verbRank = (verb: string): number => {
  const at = VERB_ORDER.indexOf(verb.split(':')[0]!);
  return at < 0 ? VERB_ORDER.length : at;
};
const floorRank = (floor: Floor | null): number => (floor === null ? FLOORS.length : FLOORS.indexOf(floor));

/** The dearer of two floors, `null` being none. */
const dearerFloor = (a: Floor | null, b: Floor | null): Floor | null => (floorRank(a) <= floorRank(b) ? a : b);

/** Whether a field holds a sealed value, alone or in a list. */
const sealed = (f: ListShape['fields'][number]): boolean => f.type === 'secret' || (f.type === 'list' && f.of === 'secret');

/** Whether a field is a list of words, which the write path logs as `tag` and `untag`. */
const tagged = (f: ListShape['fields'][number] | undefined): boolean => f?.type === 'list' && f.of === 'text';

const kind = (list: string | null, verb: string, floor: Floor | null): ChangeKind => ({
  key: list === null ? verb : `${list}:${verb}`,
  list,
  verb,
  floor,
});

/**
 * The floors that hold for every change to a row of this list, whatever the verb: a list of keys, and a row another
 * person made.
 *
 * A LIST THE RECORD DOES NOT HAVE IS OUTSIDE IT. The write path refuses one anyway; the floor says so first, so nothing
 * climbs on a list nobody can read the shape of.
 *
 * A WRITER WHO IS NOBODY'S IS NOT THE MAKER EITHER. `person` is `null` for Slash and for a run no token opened, and the
 * floor used to need both names, so either could edit a member's row at Do and tell. A row a person made is another
 * person's to every writer that is not that person.
 */
function rowFloor(w: Pick<WriteSaid, 'op' | 'shape' | 'madeBy' | 'person'>): Floor | null {
  if (w.shape === null) return 'outside';
  if (w.shape.fields.some(sealed)) return 'keys';
  if (w.op !== 'create' && w.madeBy && w.madeBy !== (w.person ?? null)) return 'others';
  return null;
}

/**
 * Whether a value sent for a field empties it: nothing, an empty text or a list with nothing in it, the three the write
 * path removes the field for (`isAbsent`). `''` was missed, and a note sent as `''` cleared it as a plain edit.
 */
const emptied = (v: unknown): boolean => v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Whether two field values are the same value, as the write path compares them before it logs a change, an empty list being no value. */
const same = (a: unknown, b: unknown): boolean => (emptied(a ?? null) && emptied(b ?? null)) || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The kinds one write is: one per verb it carries, each with its floor.
 *
 * SEVERAL, NOT THE DEAREST, because the ladder lets a write through only when EVERY kind it is may go: an agent trusted
 * to mark tasks done is not thereby trusted to rename them in the same patch. `kindOfWrite` answers the dearest.
 *
 * AN UPDATE IS READ FIELD BY FIELD, as the write path logs it: `deleted_at` is a delete (or a restore, which is the same
 * power), the list's state field a move to the value sent, a list of words a tag, and anything else an edit. A money
 * field sent with a value is the `money` floor on the add or the edit that carries it, and a field that says where rows
 * apply is `sharing` on the edit that moves it. Where a row is put when it is made is not sharing: it is where it was
 * made.
 *
 * WHO A ROW IS, AND A FIELD SENT EMPTY, ARE ON THE FLOOR TOO. A field playing `merged_into`, `email`, `handles`,
 * `keys`, `self`, `domain`, `name`, `aliases` or `org` (`ListShape.identity`) is `identity` on the edit or the tag
 * that changes it, since one key moved onto the wrong person files every mail and commit that arrives under it there,
 * a merge folds a person away, and a rename prepares one: the strong match reads names and aliases. A
 * field sent as `null` or `''`, or a list sent with nothing in it, is `delete` on its kind: the floor is "a row, or a
 * field, away", and a cleared field is a field away. Money, then sharing, then identity name a key that is two of these at once,
 * since the narrower power is the truer sentence. A field sent back as it already was (`was`) is neither.
 */
export function kindsOfWrite(w: WriteSaid): ChangeKind[] {
  const floor = rowFloor(w);
  if (w.op === 'delete') return [kind(w.list, 'delete', dearerFloor('delete', floor))];
  if (w.op === 'note') return [kind(w.list, 'note', floor)];
  const patch = obj(w.patch);
  const fields = new Map((w.shape?.fields ?? []).map((f) => [f.id, f]));
  /* A NEW ROW IS MONEY WHEN IT COMES WITH AN AMOUNT; A ROW THERE IS MONEY WHEN ONE IS SENT AT ALL, since clearing an
     amount changes it as much as setting one. */
  const money = (keys: string[], clearing: boolean): boolean =>
    keys.some((k) => fields.get(k)?.type === 'money' && patch[k] !== undefined && (clearing || patch[k] !== null));
  const identity = new Set(w.shape?.identity ?? []);
  /* A NEW ROW IS WHO SOMEBODY IS WHEN IT IS MADE WITH MORE THAN NAMES: made already merged, as the
     record's own person, or holding the addresses, handles, keys or domain `meet` files arrivals by. An agent that may
     add people could otherwise make a second owner, or a row that takes someone's mail, without asking. A part sent
     empty, or `self` sent false, sets nothing. */
  if (w.op === 'create') {
    const names = new Set(w.shape?.names ?? []);
    const joins = Object.keys(patch).some((k) => identity.has(k) && !names.has(k) && !emptied(patch[k]) && patch[k] !== false);
    return [kind(w.list, 'add', dearerFloor(money(Object.keys(patch), false) ? 'money' : joins ? 'identity' : null, floor))];
  }

  const moved = (key: string): boolean => !w.was || !same(w.was[key], patch[key]);
  /* THE FLOOR ONE FIELD'S CHANGE HITS ON ITS OWN, before the row's. */
  const fieldFloor = (key: string): Floor | null => {
    if (money([key], true)) return 'money';
    if (fields.get(key)?.scope !== undefined) return 'sharing';
    if (!moved(key)) return null;
    if (identity.has(key)) return 'identity';
    return emptied(patch[key]) ? 'delete' : null;
  };
  const out: ChangeKind[] = [];
  let edit: Floor | null | undefined;
  let tag: Floor | null | undefined;
  for (const key of Object.keys(patch)) {
    if (key === 'deleted_at') out.push(kind(w.list, 'delete', dearerFloor('delete', floor)));
    else if (w.shape?.state !== undefined && key === w.shape.state && typeof patch[key] === 'string') out.push(kind(w.list, `move:${String(patch[key])}`, floor));
    else if (tagged(fields.get(key))) tag = dearerFloor(tag ?? null, fieldFloor(key));
    else edit = dearerFloor(edit ?? null, fieldFloor(key));
  }
  if (tag !== undefined) out.push(kind(w.list, 'tag', dearerFloor(tag, floor)));
  if (edit !== undefined) out.push(kind(w.list, 'edit', dearerFloor(edit, floor)));
  /* A PATCH THAT NAMES NOTHING is still a write somebody made, and the write path logs it as an edit. */
  return out.length > 0 ? out : [kind(w.list, 'edit', floor)];
}

/** The dearest kind one write is: what its event is named by in a sentence. */
export const kindOfWrite = (w: WriteSaid): ChangeKind => dearest(kindsOfWrite(w))!;

/**
 * The kind of a mention attached to a row it names, `<list>:attach`: a name read in a text, put on the row
 * the reader took it to be, with the sentence it was seen in. OFF THE FLOORS, so it can be earned apart from editing
 * the row, and always undoable: it adds a line where the row was seen and changes nothing it says.
 *
 * A ROW WITH AN AMOUNT IS THE `money` FLOOR, and asks at every rung: a payment taken for the wrong person is
 * not a line nobody reads. The floors of every other kind are as they were.
 */
export const kindOfAttach = (list: string, hasAmount: boolean): ChangeKind => kind(list, ATTACH, hasAmount ? 'money' : null);

/** Whether a row holds an amount: a money field with a value in `was`, or, when the row cannot be read, any money field at all. */
const holdsAmount = (shape: ListShape | null, was: Record<string, unknown> | null | undefined): boolean => {
  const money = (shape?.fields ?? []).filter((f) => f.type === 'money');
  if (money.length === 0) return false;
  return !was || money.some((f) => !emptied(was[f.id] ?? null));
};

/**
 * Whether a field's new value only adds to the old: every line it held is still there and something is new. A row that
 * cannot be read (`was` is null) is taken at its word, as the write path refuses an update to a row that is not there.
 */
const addsTo = (before: unknown, after: unknown): boolean => {
  if (emptied(after ?? null)) return false;
  if (before === undefined || emptied(before)) return true;
  const had = (Array.isArray(before) ? before : [before]).map((v) => JSON.stringify(v));
  const now = (Array.isArray(after) ? after : [after]).map((v) => JSON.stringify(v));
  return now.length > had.length && had.every((v) => now.includes(v));
};

/**
 * Whether a rowset row is an attach: an update that adds only to the fields keeping where its row was seen
 * (`ListShape.seen`), keeping every line already there. A body says `as: 'attach'`, and the rows that are more than that
 * (a line taken out, a field beside them) are read as the edits they are, so saying it never makes a write cheaper.
 */
const attaches = (shape: ListShape | null, patch: Record<string, unknown>, was: Record<string, unknown> | null | undefined): boolean => {
  const seen = new Set(shape?.seen ?? []);
  const keys = Object.keys(patch);
  return seen.size > 0 && keys.length > 0 && keys.every((k) => seen.has(k) && addsTo(was?.[k], patch[k]));
};

/**
 * The kind one logged event is, or `null` for an event that is not a change to a row.
 *
 * FOR READING THE LOG BACK, as the ladder does when it seeds a grant from what it already did: the event names its kind
 * and its field, and a `state` event carries the value moved to in `to_v`, as JSON.
 */
export function kindOfEvent(
  e: { list: string; kind: string; field: string | null; to_v: string | null },
  shape: ListShape | null,
  who: { madeBy?: string | null; person?: string | null; amount?: boolean } = {},
): ChangeKind | null {
  const said = { shape, madeBy: who.madeBy ?? null, person: who.person ?? null };
  switch (e.kind) {
    case 'create':
      /* `to_v` IS THE WHOLE ROW on a create, so a money amount it was made with is read from it. */
      return kindOfWrite({ list: e.list, op: 'create', patch: parsed(e.to_v), ...said });
    case 'state': {
      const to = parsed(e.to_v, true);
      return kind(e.list, `move:${typeof to === 'string' ? to : String(to)}`, rowFloor({ op: 'update', ...said }));
    }
    case 'edit':
    case 'link':
    case 'tag':
    case 'untag':
      /* THE VALUE IS NOT NEEDED: a money field is redacted in the log, and what makes it the floor is its type. Only
         an edit to nothing is read off it, as the clearing it was; an untag takes one word off a list, which is not
         emptying it. */
      return e.field === null
        ? kind(e.list, 'edit', rowFloor({ op: 'update', ...said }))
        : kindOfWrite({ list: e.list, op: 'update', patch: { [e.field]: e.kind === 'edit' && e.to_v === 'null' ? null : true }, ...said });
    case 'note':
      return kindOfWrite({ list: e.list, op: 'note', ...said });
    /* AN ATTACH IS LOGGED AS ITSELF, so the ladder counts it apart from the edits. The event cannot say whether its row
       holds an amount, so `who.amount` does, and a list with a money field is read as one when it is not given. */
    case ATTACH: {
      const k = kindOfAttach(e.list, who.amount ?? holdsAmount(shape, null));
      return { ...k, floor: dearerFloor(k.floor, rowFloor({ op: 'update', ...said })) };
    }
    case 'delete':
    case 'restore':
    case 'purge':
      return kindOfWrite({ list: e.list, op: 'delete', ...said });
    default:
      return null;
  }
}

/** A logged value, parsed. `scalar` answers a JSON string as itself; otherwise only an object is a patch. */
function parsed(text: string | null, scalar?: false): Record<string, unknown>;
function parsed(text: string | null, scalar: true): unknown;
function parsed(text: string | null, scalar = false): unknown {
  if (text === null) return scalar ? null : {};
  try {
    const out: unknown = JSON.parse(text);
    return scalar ? out : obj(out);
  } catch {
    return scalar ? text : {};
  }
}

/** The list a declaration id or a field-level change names, without `register.`. */
const listOf = (named: unknown): string | null =>
  typeof named === 'string' && named !== '' ? (named.startsWith('register.') ? named.slice('register.'.length) : named) : null;

/** The kinds a scheduled or unattended declaration is, which `packages/record` holds to the owner's door. */
const UNATTENDED = new Set(['rule', 'script', 'digest', 'ingest']);

/**
 * The kinds a `change` is: one per declaration it installs, or the list a field-level change is about.
 *
 * TAKING AWAY IS A DELETE. A retired field, or an enum narrowed, takes values off rows somebody has, so it is the
 * `delete` floor. Adding a field or a value, or retyping one, is `shape:<list>`, which may climb.
 */
function changeKinds(body: Record<string, unknown>, read: KindReader): ChangeKind[] {
  const to = obj(body.to);
  const named = listOf(body.declaration_id);
  if ('add' in to) return [kind(null, `shape:${listOf(obj(to.add).register) ?? named ?? '?'}`, null)];
  if ('retire' in to) return [kind(null, `shape:${listOf(obj(to.retire).register) ?? named ?? '?'}`, 'delete')];
  if ('retype' in to || 'narrow' in to) return [kind(null, `shape:${named ?? '?'}`, 'narrow' in to ? 'delete' : null)];
  const members = Array.isArray(to.declarations) ? to.declarations.map(obj) : [to];
  return members.map((d) => {
    const k = typeof d.kind === 'string' ? d.kind : '';
    if (UNATTENDED.has(k)) return k === 'rule' ? kindOfAutomationChange(read.ruleBody?.(d) ?? null, d.body) : kind(null, AUTOMATION, 'outside');
    if (k === 'register') return kind(null, `shape:${listOf(obj(d.body).id) ?? listOf(d.id) ?? '?'}`, null);
    return kind(null, `declare:${k || '?'}`, null);
  });
}

/**
 * The kinds a proposal is, from its body alone and the record's lists. Lenient about a body it cannot read, for
 * `costOf`'s reason: a row a build two versions old wrote still has to be stamped, and what cannot be read is `call`.
 *
 * WHAT IT SENDS OUT IS THE FLOOR WHATEVER ELSE IT IS. A change or a pattern carrying `egress` lines, which `propose`
 * works out and never takes from the proposer, is `outside` on every kind it is.
 */
export function kindsOfProposal(bodyKind: string, body: unknown, read: KindReader): ChangeKind[] {
  const b = obj(body);
  switch (bodyKind) {
    case 'rowset': {
      const list = typeof b.register === 'string' ? b.register : '?';
      const shape = read.shape(list);
      const attaching = b.as === ATTACH;
      return merged(
        arr(b.rows).flatMap((raw) => {
          const r = obj(raw);
          if (typeof r.at !== 'string') return kindsOfWrite({ list, op: 'create', patch: r, shape });
          const said: WriteSaid = {
            list,
            op: 'update',
            patch: obj(r.patch),
            shape,
            madeBy: read.madeBy?.(list, r.at) ?? null,
            person: read.person ?? null,
            was: read.fieldsOf?.(list, r.at) ?? null,
          };
          /* AN ATTACH KEEPS THE ROW'S OWN FLOORS (keys, another person's row) and adds the amount's. */
          if (attaching && attaches(shape, said.patch!, said.was)) {
            const k = kindOfAttach(list, holdsAmount(shape, said.was));
            return [{ ...k, floor: dearerFloor(k.floor, rowFloor(said)) }];
          }
          return kindsOfWrite(said);
        }),
      );
    }
    case 'change': {
      const out = changeKinds(b, read);
      return merged(arr(b.egress).length > 0 ? out.map((k) => ({ ...k, floor: dearerFloor(k.floor, 'outside') })) : out);
    }
    case 'pattern':
      return [kind(null, AUTOMATION, 'outside')];
    case 'pack':
    case 'settings':
    case 'arrange':
      return [kind(null, ADDONS, 'addons')];
    /* AN OPTION THAT WRITES (`patches`, govern-47) SAYS WHAT A PICK WRITES: each patch is an update to the list its
       `register` or its spoken `at` names. Options that only say a choice are a call. */
    case 'options': {
      const patches = arr(b.options).flatMap((o) => arr(obj(o).patches));
      if (patches.length === 0) return [kind(null, CALL, null)];
      return merged(
        patches.flatMap((raw) => {
          const p = obj(raw);
          const list = typeof p.register === 'string' ? p.register : typeof p.at === 'string' && p.at.includes('#') ? p.at.slice(0, p.at.indexOf('#')) : '?';
          return kindsOfWrite({ list, op: 'update', patch: obj(p.patch), shape: read.shape(list) });
        }),
      );
    }
    default:
      return [kind(null, CALL, null)];
  }
}

/** One kind per key, each with the dearest floor any of its copies hit, dearest first. */
function merged(kinds: ChangeKind[]): ChangeKind[] {
  const by = new Map<string, ChangeKind>();
  for (const k of kinds) {
    const had = by.get(k.key);
    by.set(k.key, had ? { ...had, floor: dearerFloor(had.floor, k.floor) } : k);
  }
  return [...by.values()].sort(order);
}

/** Floor kinds first, by their floor, then by verb, then by key. */
const order = (a: ChangeKind, b: ChangeKind): number =>
  floorRank(a.floor) - floorRank(b.floor) || verbRank(a.verb) - verbRank(b.verb) || a.key.localeCompare(b.key);

/** The dearest of several kinds, or `null` for none. */
export const dearest = (kinds: readonly ChangeKind[]): ChangeKind | null => [...kinds].sort(order)[0] ?? null;

/**
 * What `suggestion.kind` holds: the one key, or a JSON list of them, dearest first, when there are several. `null`
 * for none, which only a body with no rows can be, and `checkBody` refuses those.
 *
 * ONE KEY AS ITSELF, so "accepted unchanged, by kind" is one `GROUP BY kind` over nearly every question.
 */
export function stampOf(kinds: readonly ChangeKind[]): string | null {
  const keys = [...new Set([...kinds].sort(order).map((k) => k.key))];
  if (keys.length === 0) return null;
  return keys.length === 1 ? keys[0]! : JSON.stringify(keys);
}

/** The keys a stamp holds, whichever of the two shapes it is in. */
export function keysOfStamp(stamp: string | null | undefined): string[] {
  if (!stamp) return [];
  if (!stamp.startsWith('[')) return [stamp];
  try {
    const out: unknown = JSON.parse(stamp);
    return Array.isArray(out) ? out.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/* ── reading it from the record ──────────────────────────────────────────── */

/** A list's live shape, from its declaration, or `null` when no list of that name is installed. */
export function shapeIn(sql: Sql, list: string): ListShape | null {
  const row = sql.one<{ body: string }>(
    "SELECT body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1",
    `register.${list}`,
  );
  if (!row) return null;
  const body = parsed(row.body);
  const fields = arr(body.fields).map(obj).filter((f) => typeof f.id === 'string') as unknown as ListShape['fields'];
  const { identity, names, seen } = identityOf(list, body, fields);
  return {
    fields,
    ...(typeof body.state === 'string' ? { state: body.state } : {}),
    ...(identity.length > 0 ? { identity } : {}),
    ...(names.length > 0 ? { names } : {}),
    ...(seen.length > 0 ? { seen } : {}),
  };
}

/**
 * The parts of a person or an organisation that say who they are, which `identity` is read from.
 *
 * `self` TOO, which says which person is the record's own: the row a merge keeps (`people.ts`'s fold order), and
 * whose addresses count as the owner's when a stranger's mail is weighed (`wroteTo`). Set on the wrong row it is the
 * same harm as a key moved there.
 *
 * `domain` FEEDS AN ORGANISATION'S ENTITY KEY (`entities.ts`), so editing it moves who a domain belongs to. `name` and
 * `aliases` are what the strong merge matches (`people.ts`), so a rename prepares a fold on the next meeting. `org` is
 * who a person is with, which their mail is filed under.
 */
const IDENTITY_PARTS = ['merged_into', 'email', 'handles', 'keys', 'self', 'domain', 'name', 'aliases', 'org'] as const;

/** The identity parts a new row may be made with, since they only name it (`ListShape.names`). */
const NAMING_PARTS: ReadonlySet<string> = new Set(['name', 'aliases', 'org']);

/**
 * The fields of one list that say who its rows are: those playing an identity part of the people or the
 * organisations `meet` writes, read with `roles.ts`'s own rule, so a list that declares `meets:` or `org:` and a
 * keyless `people` from before the keys are read the same way `meet` reads them.
 */
function identityOf(list: string, body: Record<string, unknown>, fields: ListShape['fields']): { identity: string[]; names: string[]; seen: string[] } {
  const one = [{ id: list, fields: fields as readonly RoleField[], meets: body.meets, org: body.org }];
  const played = { ...orgRole(one)?.fields, ...meetsRole(one)?.fields } as Record<string, string | undefined>;
  const held = new Set(fields.map((f) => f.id));
  const of = (parts: readonly string[]): string[] => [...new Set(parts.map((p) => played[p]).filter((f): f is string => f !== undefined && held.has(f)))];
  const identity = of(IDENTITY_PARTS);
  /* A FIELD THAT PLAYS A NAMING PART AND A JOINING ONE, which only a hand-made declaration could say, joins. */
  const joining = new Set(of(IDENTITY_PARTS.filter((p) => !NAMING_PARTS.has(p))));
  return { identity, names: of([...NAMING_PARTS]).filter((f) => !joining.has(f)), seen: of(['met']) };
}

/** A run's spoken name as its writes are signed, `S42`, and nothing else. */
const RUN = new RegExp(`^${SESSION_PREFIX}(\\d+)$`);

/** The token a run's writes were made under, or `null` for a run no token opened, or an actor that is not a run. */
export function tokenOfRun(sql: Sql, actor: string): string | null {
  const seq = RUN.exec(actor)?.[1];
  if (seq === undefined) return null;
  const token = sql.one<{ t: unknown }>("SELECT json_extract(fields, '$.token_id') AS t FROM entry WHERE register = ? AND seq = ?", SESSION, Number(seq))?.t;
  return typeof token === 'string' && token !== '' ? token : null;
}

/** What `suggestion.drafted_by` begins with when it keeps the key that asked through a run no key opened (RM1). */
export const ASKED_KEY = 'token:';

/**
 * The key that asked a question: the one kept on it (`ASKED_KEY`), or the one its run was opened under, or `null`. The
 * kept key comes first, since a run no key opened is signed by whichever key it is shared with.
 */
export function askedKeyOf(sql: Sql, openedBy: string, draftedBy: unknown): string | null {
  if (typeof draftedBy === 'string' && draftedBy.startsWith(`${ASKED_KEY}t_`)) return draftedBy.slice(ASKED_KEY.length);
  return tokenOfRun(sql, openedBy);
}

/**
 * Who climbs the ladder for an actor: the token its run was opened under, or Slash. `null` for a person, a rule, the
 * system, or a run no token opened, none of which has a rung.
 */
export function agentOf(sql: Sql, actor: string): string | null {
  if (actor === SLASH) return SLASH;
  return tokenOfRun(sql, actor);
}

/**
 * The person an actor writes as: a person is themself, and a run is the person whose token opened it. `null` for a
 * rule, an ingest, Slash or the system, which make rows nobody owns as a person.
 */
export function personOf(sql: Sql, actor: string): string | null {
  if (actor.startsWith('p_')) return actor;
  const token = tokenOfRun(sql, actor);
  return token === null ? null : (sql.one<{ p: string }>('SELECT person_id AS p FROM token WHERE id = ?', token)?.p ?? null);
}

/** The place a joiner is met at (`acceptInvite`), which the key their row is made with keeps as its source. */
export const JOINED_AT = 'accepted an invitation';

/**
 * Who joined to make this row. Joining is signed by the record, so its Activity never says they wrote it, but the row is
 * still theirs: read as nobody's, a guest whose name and address look like a contact's was folded into that contact, and
 * their share's `$me` then read the contact's rows. The key the meeting kept names them.
 */
function joinerOf(sql: Sql, rowId: string): string | null {
  const keys = new Set(sql.all<{ key: string }>('SELECT key FROM entity_key WHERE row_id = ? AND source = ?', rowId, JOINED_AT).map((k) => k.key));
  if (keys.size === 0) return null;
  const people = sql.all<{ id: string; email: string }>('SELECT id, email FROM person WHERE email IS NOT NULL');
  return people.find((p) => keys.has(keyOf('email', p.email) ?? ''))?.id ?? null;
}

/** The person who made a row, read from its `create` event, or `null`. A row joining made is the joiner's (`joinerOf`). */
export function madeByIn(sql: Sql, rowId: string): string | null {
  const actor = sql.one<{ a: string }>("SELECT actor AS a FROM event WHERE target = ? AND kind = 'create' ORDER BY rowid LIMIT 1", `entry:${rowId}`)?.a;
  if (actor === undefined) return null;
  return personOf(sql, actor) ?? (actor === 'system' ? joinerOf(sql, rowId) : null);
}

/** Whether a person keeps the whole record: an owner of every list, not suspended, as `members.ts` counts one. */
export const ownerIn = (sql: Sql, person: string): boolean =>
  sql.one(
    "SELECT 1 AS y FROM member m JOIN person p ON p.id = m.person_id WHERE m.person_id = ? AND m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL",
    person,
  ) !== undefined;

/**
 * A reader over the record for `kindsOfProposal`, filing as `actor`. A row is named by its spoken id (`tasks#4`) or its
 * row id, as a rowset names one.
 *
 * SLASH WORKS FOR THE RECORD'S OWNERS, whoever they are on any record, and for nobody else. It is no person, so a row
 * a person made is somebody else's to it (`rowFloor`), except a row one of its owners made, which is the work it was
 * given: a row a member made always asks, and the owners' rows climb as any agent's own do.
 */
export function recordReader(sql: Sql, actor: string): KindReader {
  const rowAt = (list: string, at: string): { id: string; fields: string } | undefined => {
    const hash = at.lastIndexOf('#');
    return hash > 0
      ? sql.one<{ id: string; fields: string }>('SELECT id, fields FROM entry WHERE register = ? AND seq = ?', at.slice(0, hash), Number(at.slice(hash + 1)))
      : sql.one<{ id: string; fields: string }>('SELECT id, fields FROM entry WHERE id = ? AND register = ?', at, list);
  };
  /* ONE READ OF A LIST'S SHAPE AND OF A ROW'S MAKER FOR AS LONG AS THIS READER LASTS (one weighing): a queue's rowsets
     asked both again for every row they named. */
  const shapes = new Map<string, ReturnType<typeof shapeIn>>();
  const makers = new Map<string, string | null>();
  return {
    shape: (list) => {
      if (!shapes.has(list)) shapes.set(list, shapeIn(sql, list));
      return shapes.get(list)!;
    },
    madeBy: (list, at) => {
      const row = rowAt(list, at);
      if (row !== undefined && !makers.has(row.id)) makers.set(row.id, madeByIn(sql, row.id));
      const maker = row === undefined ? null : makers.get(row.id)!;
      return actor === SLASH && maker !== null && ownerIn(sql, maker) ? null : maker;
    },
    fieldsOf: (list, at) => {
      const row = rowAt(list, at);
      return row === undefined ? null : parsed(row.fields);
    },
    person: personOf(sql, actor),
    ruleBody: (d) => {
      const id = typeof d.id === 'string' && d.id !== '' ? d.id : null;
      if (id === null) return null;
      const row = sql.one<{ body: string }>(
        "SELECT body FROM declaration WHERE id = ? AND kind = 'rule' AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1",
        id,
      );
      return row === undefined ? null : parsed(row.body);
    },
  };
}

/** The row kinds a write leaves in the log, which are the only ones a grant's past writes are read from. */
const ROW_KINDS = ['create', 'edit', 'state', 'link', 'tag', 'untag', 'note', 'delete', 'restore', 'purge'];

/**
 * Once, when the ladder arrives: every live write token keeps Do and tell on the kinds it used in the last
 * `KEPT_DAYS` days and that are not on the floor. Answers how many rungs it set.
 *
 * WHY. Before the ladder a write token wrote anything its scope let it, so starting every grant at Ask would take away
 * from the owner's agents overnight what they were doing yesterday, and he would meet it as a wall of questions. What
 * they did in the last month keeps going and says so; everything else, and every new grant, starts at Ask.
 *
 * A RUN'S OWN ROW IS NOT A KIND. An agent saying what it is doing and where it is (`session`) is the record keeping its
 * books, and the gate never asks about it.
 *
 * A RUNG ALREADY THERE IS LEFT AS IT IS, so a second run, over a ladder the owner has since changed, changes nothing.
 */
export function seedLadder(sql: Sql, nowMs: number): number {
  const at = new Date(nowMs).toISOString();
  const since = new Date(nowMs - KEPT_DAYS * 86_400_000).toISOString();
  const tokens = new Map(
    sql
      .all<{ id: string; person_id: string }>(
        "SELECT id, person_id FROM token WHERE scope = 'write' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)",
        at,
      )
      .map((t) => [t.id, t.person_id]),
  );
  if (tokens.size === 0) return 0;
  const runs = new Map<string, string>();
  for (const r of sql.all<{ seq: number; t: unknown }>("SELECT seq, json_extract(fields, '$.token_id') AS t FROM entry WHERE register = ? AND seq IS NOT NULL", SESSION))
    if (typeof r.t === 'string' && tokens.has(r.t)) runs.set(`${SESSION_PREFIX}${r.seq}`, r.t);
  if (runs.size === 0) return 0;

  const shapes = new Map<string, ListShape | null>();
  const shapeOf = (list: string): ListShape | null => {
    if (!shapes.has(list)) shapes.set(list, shapeIn(sql, list));
    return shapes.get(list) ?? null;
  };
  const kept = new Set<string>();
  const lines = sql.all<{ actor: string; kind: string; field: string | null; to_v: string | null; row: string; list: string }>(
    `SELECT e.actor AS actor, e.kind AS kind, e.field AS field, e.to_v AS to_v, n.id AS row, n.register AS list
     FROM event e JOIN entry n ON e.target = 'entry:' || n.id
     WHERE e.ts >= ? AND e.target_kind = 'entry' AND e.kind IN (${ROW_KINDS.map(() => '?').join(', ')}) AND n.register <> ?`,
    since,
    ...ROW_KINDS,
    SESSION,
  );
  for (const line of lines) {
    const token = runs.get(line.actor);
    if (token === undefined) continue;
    const k = kindOfEvent(line, shapeOf(line.list), { madeBy: line.kind === 'create' ? null : madeByIn(sql, line.row), person: tokens.get(token) ?? null });
    if (k === null || k.floor !== null) continue;
    kept.add(JSON.stringify([token, k.key]));
  }
  let set = 0;
  for (const pair of kept) {
    const [agent, key] = JSON.parse(pair) as [string, string];
    if (sql.one('SELECT 1 AS y FROM ladder WHERE agent = ? AND kind = ?', agent, key)) continue;
    sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES (?, ?, 'tell', 0, ?)", agent, key, at);
    set += 1;
  }
  return set;
}

/**
 * The rung an agent is on for one kind, read from the ladder: Ask for a kind on the floor, a kind it has no rung for,
 * or a rung dropped. The scope a token holds is the ceiling over it (`ceilingOf` in `token.ts`), which the caller
 * applies, since a rung read here knows nothing of the grant.
 */
export function rungOf(sql: Sql, agent: string, k: ChangeKind): Rung {
  if (k.floor !== null) return 'ask';
  const row = sql.one<{ rung: string; dropped_at: string | null }>('SELECT rung, dropped_at FROM ladder WHERE agent = ? AND kind = ?', agent, k.key);
  if (!row || row.dropped_at !== null) return 'ask';
  return (RUNGS as readonly string[]).includes(row.rung) ? (row.rung as Rung) : 'ask';
}
