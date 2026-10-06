/**
 * What kind of change a write or a proposal is, and whether it sits on the floor no rung lifts.
 *
 * WHY THIS EXISTS. An agent earns trust one kind of change at a time (DIRECTION §37, "staff who earn trust"): it starts
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
 * a choice between options.
 *
 * THE FLOOR IS FIXED RULES AND NOTHING ELSE, the way `costOf` is. A kind on the floor is Ask for every agent, every
 * grant and every rung, Slash included, and no setting lifts it:
 *   - `delete`: taking a row, or a field, away, which is also sending a field empty
 *   - `money`: a money amount set or changed
 *   - `keys`: anything in a list that holds a sealed value, which is where keys live
 *   - `sharing`: where a row applies, which is who can see it
 *   - `identity`: who a person or an organisation is: folding one into another, the addresses, handles and keys
 *     `meet` knows them by, since a key added to the wrong row files everything that arrives under it there, or which
 *     person is the record's own
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

/** How many days of an existing write token's own writes keep their kinds at Do and tell, once, when the ladder arrives. */
export const KEPT_DAYS = 30;

/**
 * What this file needs of a list: its fields, with their types, which field is its state, and which fields say who a
 * row is (`identity`).
 *
 * STRUCTURAL, so a `RegisterDecl`, a declaration's parsed body and a test's literal are all one.
 *
 * `identity` IS READ FROM THE ROLES THE LIST PLAYS (`roles.ts`), never from its name or a field's: the fields playing
 * `merged_into`, `email`, `handles`, `keys` or `self` in the people `meet` writes, or `merged_into` or `keys` in its
 * organisations. Any record's People, and any pack's list that declares the role, get the same floor.
 */
export type ListShape = {
  fields: readonly { id: string; type?: string; of?: string; scope?: unknown; by?: unknown; transitions?: unknown }[];
  state?: string;
  identity?: readonly string[];
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
};

const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The verbs in the order they are named by, dearest first: what a stamp of several lists first. */
const VERB_ORDER = ['delete', 'move', 'edit', 'tag', 'add', 'note', 'shape', AUTOMATION, ADDONS, CALL];
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
 * path removes the field for (`isAbsent`, K2). `''` was missed, and a note sent as `''` cleared it as a plain edit.
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
 * `keys` or `self` (`ListShape.identity`) is `identity` on the edit or the tag that changes it, since one key moved
 * onto the wrong person files every mail and commit that arrives under it there, and a merge folds a person away. A
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
  if (w.op === 'create') return [kind(w.list, 'add', dearerFloor(money(Object.keys(patch), false) ? 'money' : null, floor))];

  const identity = new Set(w.shape?.identity ?? []);
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
 * The kind one logged event is, or `null` for an event that is not a change to a row.
 *
 * FOR READING THE LOG BACK, as the ladder does when it seeds a grant from what it already did: the event names its kind
 * and its field, and a `state` event carries the value moved to in `to_v`, as JSON.
 */
export function kindOfEvent(
  e: { list: string; kind: string; field: string | null; to_v: string | null },
  shape: ListShape | null,
  who: { madeBy?: string | null; person?: string | null } = {},
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
function changeKinds(body: Record<string, unknown>): ChangeKind[] {
  const to = obj(body.to);
  const named = listOf(body.declaration_id);
  if ('add' in to) return [kind(null, `shape:${listOf(obj(to.add).register) ?? named ?? '?'}`, null)];
  if ('retire' in to) return [kind(null, `shape:${listOf(obj(to.retire).register) ?? named ?? '?'}`, 'delete')];
  if ('retype' in to || 'narrow' in to) return [kind(null, `shape:${named ?? '?'}`, 'narrow' in to ? 'delete' : null)];
  const members = Array.isArray(to.declarations) ? to.declarations.map(obj) : [to];
  return members.map((d) => {
    const k = typeof d.kind === 'string' ? d.kind : '';
    if (UNATTENDED.has(k)) return kind(null, AUTOMATION, 'outside');
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
      return merged(
        arr(b.rows).flatMap((raw) => {
          const r = obj(raw);
          if (typeof r.at !== 'string') return kindsOfWrite({ list, op: 'create', patch: r, shape });
          return kindsOfWrite({
            list,
            op: 'update',
            patch: obj(r.patch),
            shape,
            madeBy: read.madeBy?.(list, r.at) ?? null,
            person: read.person ?? null,
            was: read.fieldsOf?.(list, r.at) ?? null,
          });
        }),
      );
    }
    case 'change': {
      const out = changeKinds(b);
      return merged(arr(b.egress).length > 0 ? out.map((k) => ({ ...k, floor: dearerFloor(k.floor, 'outside') })) : out);
    }
    case 'pattern':
      return [kind(null, AUTOMATION, 'outside')];
    case 'pack':
    case 'settings':
    case 'arrange':
      return [kind(null, ADDONS, 'addons')];
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
  const identity = identityOf(list, body, fields);
  return {
    fields,
    ...(typeof body.state === 'string' ? { state: body.state } : {}),
    ...(identity.length > 0 ? { identity } : {}),
  };
}

/**
 * The parts of a person or an organisation that say who they are, which `identity` is read from.
 *
 * `self` TOO, which says which person is the record's own: the row a merge keeps (`people.ts`'s fold order), and
 * whose addresses count as the owner's when a stranger's mail is weighed (`wroteTo`). Set on the wrong row it is the
 * same harm as a key moved there.
 */
const IDENTITY_PARTS = ['merged_into', 'email', 'handles', 'keys', 'self'] as const;

/**
 * The fields of one list that say who its rows are: those playing an identity part of the people or the
 * organisations `meet` writes, read with `roles.ts`'s own rule, so a list that declares `meets:` or `org:` and a
 * keyless `people` from before the keys are read the same way `meet` reads them.
 */
function identityOf(list: string, body: Record<string, unknown>, fields: ListShape['fields']): string[] {
  const one = [{ id: list, fields: fields as readonly RoleField[], meets: body.meets, org: body.org }];
  const played = { ...orgRole(one)?.fields, ...meetsRole(one)?.fields } as Record<string, string | undefined>;
  const held = new Set(fields.map((f) => f.id));
  return [...new Set(IDENTITY_PARTS.map((p) => played[p]).filter((f): f is string => f !== undefined && held.has(f)))];
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

/** The person who made a row, read from its `create` event, or `null`. */
export function madeByIn(sql: Sql, rowId: string): string | null {
  const actor = sql.one<{ a: string }>("SELECT actor AS a FROM event WHERE target = ? AND kind = 'create' ORDER BY rowid LIMIT 1", `entry:${rowId}`)?.a;
  return actor === undefined ? null : personOf(sql, actor);
}

/** Whether a person keeps the whole record: an owner of every list, not suspended, as `members.ts` counts one. */
const ownerIn = (sql: Sql, person: string): boolean =>
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
 * given: a row a member made always asks, and the owners' rows climb as any agent's own do (DIRECTION §37).
 */
export function recordReader(sql: Sql, actor: string): KindReader {
  const rowAt = (list: string, at: string): { id: string; fields: string } | undefined => {
    const hash = at.lastIndexOf('#');
    return hash > 0
      ? sql.one<{ id: string; fields: string }>('SELECT id, fields FROM entry WHERE register = ? AND seq = ?', at.slice(0, hash), Number(at.slice(hash + 1)))
      : sql.one<{ id: string; fields: string }>('SELECT id, fields FROM entry WHERE id = ? AND register = ?', at, list);
  };
  return {
    shape: (list) => shapeIn(sql, list),
    madeBy: (list, at) => {
      const row = rowAt(list, at);
      const maker = row === undefined ? null : madeByIn(sql, row.id);
      return actor === SLASH && maker !== null && ownerIn(sql, maker) ? null : maker;
    },
    fieldsOf: (list, at) => {
      const row = rowAt(list, at);
      return row === undefined ? null : parsed(row.fields);
    },
    person: personOf(sql, actor),
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
