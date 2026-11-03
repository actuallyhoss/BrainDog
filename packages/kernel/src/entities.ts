/**
 * The identities the record knows: `entity_key`, kept beside the rows of the lists that play `meets:` or `org:`.
 *
 * KEPT IN THE WRITE PATH, IN THE ROW'S OWN TRANSACTION, as `entry_fts` is (`fts.ts`). A key table updated afterwards is
 * wrong for however long "afterwards" takes, and that window is exactly when an agent meets the person it just met. So
 * `rekey` runs on every create and update of a keyed list (`index.ts`'s `writing`), `rebuildKeys` on an import and once
 * when migration 23 lands, and erase removes a row's keys with the row (`erase.ts`).
 *
 * ONE LIVE ROW PER KEY, AND THE FIRST TO CLAIM IT KEEPS IT. A second live row whose fields carry a key the first holds
 * does not take it: the record refuses that write at its own door, and a row written past it simply does not
 * answer to the key. A key whose holder is gone (deleted, erased, purged) is free again.
 *
 * A MERGED ROW'S KEYS POINT AT THE ROW IT WAS FOLDED INTO. The row stays in the file, deleted, with `merged_into` naming
 * the survivor, and every key it held moves to the survivor, so the folded row's second address still finds the one
 * person. Undoing the merge takes back the keys its own fields carry.
 *
 * BOTH FOLLOW THE CHAIN. A was folded into B, and later B into C: A's keys are at C, not B. A fold moves keys to the end
 * of the chain it points into, and an unfold takes its keys back from wherever along that chain they went, or undoing
 * A's merge after B's left A answering to nothing and C answering to A's address.
 *
 * A PROJECT HOLDS KEYS TOO, AND SHARES THEM. The one list declaring `scopes:` is the third entity list. A
 * project's keys are the places and sites its row lists (`remote:`, `folder:`, `domain:`) and what it is called
 * (`name:`, a weak key). They are held beside the others' and never in their place, because none of them is a project's
 * alone: a company and its project live at one domain, a monorepo's two projects list one repository, and two projects
 * are both called Web. So a project's claim is kept as the key and the row together (`sharedKey`), every project that
 * lists a place holds it, and `holderOf('domain:…')` still answers the organisation and nothing else. `claimed` reads
 * them back, and `settledBy` says whether what was found decides: one project by a place or a site, never by a name.
 *
 * A LIST CAN SAY WHAT MAKES TWO OF ITS ROWS ONE. A list declaring `same:` holds one key a row, built from
 * the text fields its rule names, folded as it says, within one value of its scope or a link: `same:<list>:<where>:
 * <what>`. Kept as a person's are, one live row per key and the first keeps it, so a second skill saying what the first
 * says is known to be the same row (`keyLists`, `sameLists`). These are not entities: `entityLists` never answers one.
 *
 * NOTHING HERE WRITES A ROW. It reads rows and writes the two derived tables; who becomes whom is `people.ts`'s.
 */

import type { Sql } from '@braindog/ports';

import { isWeakKey, keysOf, nameWords, sameFold, type SameFold } from './identity-keys.ts';
import { meetsRole, orgRole, type MeetsFields, type OrgFields, type Role, type RoleList } from './roles.ts';
import { isFolderPlace } from './scope.ts';

/** A list whose rows carry keys: the one playing `meets:`, and the one playing `org:`. */
export type KeyedList = { register: string; role: 'meets' | 'org'; fields: MeetsFields | OrgFields };

/**
 * The lists whose rows hold a key ALONE, read from the record's lists: people and organisations, at most two. These are
 * the lists whose rows are merged and where a second row with a held key is refused (`index.ts`'s merge door), which is
 * why the project list is not among them: see `entityLists`.
 */
export function keyedLists(lists: Iterable<RoleList>): KeyedList[] {
  const all = [...lists];
  const out: KeyedList[] = [];
  const people: Role<MeetsFields> | null = meetsRole(all);
  if (people) out.push({ register: people.register, role: 'meets', fields: people.fields });
  const orgs: Role<OrgFields> | null = orgRole(all);
  if (orgs && orgs.register !== people?.register) out.push({ register: orgs.register, role: 'org', fields: orgs.fields });
  return out;
}

/** The fields of a project's row that carry its keys. Any may be missing: a list of projects need only declare `scopes:`. */
export type ProjectFields = { name?: string; repos?: string; folders?: string; domains?: string };

/** The list of projects, the one declaring `scopes:`, as a list whose rows carry keys they share. */
export type ProjectList = { register: string; role: 'project'; fields: ProjectFields };

/** Any list whose rows are entities with keys: a person's, an organisation's, a project's. */
export type EntityList = KeyedList | ProjectList;

/** A list as `entityLists` reads it: a role's list, what makes one the list of projects, and what makes two rows one. */
export type EntityDecl = RoleList & { title?: unknown; scopes?: unknown; same?: unknown };

const fieldNamed = (list: EntityDecl, id: unknown, types?: readonly string[]): string | undefined => {
  if (typeof id !== 'string') return undefined;
  const field = list.fields?.find((f) => f.id === id && f.retired !== true);
  return field !== undefined && (types === undefined || types.includes(field.type)) ? field.id : undefined;
};

/**
 * The list of projects: the ONE list declaring `scopes:`, as `resolveProject` reads it (`scope.ts`), so two declaring
 * it are no list of projects here either. Its repositories and folders are the fields `scopes:` names, its name is its
 * title, and its domains are the field `scopes.domains` names or, with none named, the one called `domains` or
 * `domain`, as the nightly walk finds it (`backfill.ts`).
 */
export function projectList(lists: Iterable<EntityDecl>): ProjectList | null {
  const homes = [...lists].filter((l) => typeof l.scopes === 'object' && l.scopes !== null);
  const home = homes.length === 1 ? homes[0]! : undefined;
  if (home === undefined) return null;
  const scopes = home.scopes as { repos?: unknown; folders?: unknown; domains?: unknown };
  const fields: ProjectFields = {};
  const set = (part: keyof ProjectFields, field: string | undefined): void => void (field !== undefined && (fields[part] = field));
  set('name', fieldNamed(home, home.title, ['text']) ?? fieldNamed(home, 'name', ['text']));
  set('repos', fieldNamed(home, scopes.repos));
  set('folders', fieldNamed(home, scopes.folders));
  set('domains', fieldNamed(home, scopes.domains) ?? fieldNamed(home, 'domains', ['list']) ?? fieldNamed(home, 'domain', ['text', 'url']));
  return { register: home.id, role: 'project', fields };
}

/**
 * Every list whose rows are entities with keys: the two of `keyedLists`, and the list of projects. A list already
 * playing `meets:` or `org:` is that and not also the projects, so a row's keys are kept one way.
 */
export function entityLists(lists: Iterable<EntityDecl>): EntityList[] {
  const all = [...lists];
  const out: EntityList[] = keyedLists(all);
  const projects = projectList(all);
  if (projects && !out.some((l) => l.register === projects.register)) out.push(projects);
  return out;
}

/** What a list's `same:` says makes two of its rows one, as `declare.ts`'s `sameFault` let it install. */
export type SameRule = { fields: readonly string[]; within?: string; fold: SameFold; keep: 'oldest' | 'latest' | 'sealed' };

/** A list declaring `same:`: its rows hold one key each, the thing they say, and the first live row to say it keeps it. */
export type SameList = { register: string; role: 'same'; fields: Readonly<Record<string, never>>; same: SameRule };

/** Every list whose rows carry keys: the entities of `entityLists`, and the lists that declare `same:`. */
export type KeyList = EntityList | SameList;

const KEEPS = ['oldest', 'latest', 'sealed'] as const;

/**
 * The lists declaring `same:`, each with its rule read whole and `keep` filled in as `oldest`.
 *
 * KEPT APART FROM `entityLists`, which `about.ts` and `resolve.ts` read as the people, organisations and projects a
 * mention can be: a skill is not somebody met. And a list already playing a role is that and not also this, so a row's
 * keys are kept one way; `declare.ts` refuses the two together at install, and a body written past it is read here as
 * its role. A rule naming a field the list no longer has is no rule, so no row answers to half a key.
 */
export function sameLists(lists: Iterable<EntityDecl>): SameList[] {
  const out: SameList[] = [];
  for (const list of lists) {
    const same = list.same as Partial<Record<keyof SameRule, unknown>> | undefined;
    if (same === null || typeof same !== 'object' || Array.isArray(same)) continue;
    if (list.meets !== undefined || list.org !== undefined || list.scopes !== undefined) continue;
    const named = Array.isArray(same.fields) ? same.fields : [];
    const fields = named.map((id) => fieldNamed(list, id, ['text']));
    if (fields.length === 0 || fields.some((f) => f === undefined)) continue;
    if (same.fold !== 'text' && same.fold !== 'exact') continue;
    const within = fieldNamed(list, same.within);
    if (same.within !== undefined && within === undefined) continue;
    const keep = (KEEPS as readonly unknown[]).includes(same.keep) ? (same.keep as SameRule['keep']) : 'oldest';
    out.push({ register: list.id, role: 'same', fields: {}, same: { fields: fields as string[], ...(within === undefined ? {} : { within }), fold: same.fold, keep } });
  }
  return out;
}

/** Every list whose rows carry keys, entities first, so a list that is both is kept as the entity it is. */
export function keyLists(lists: Iterable<EntityDecl>): KeyList[] {
  const all = [...lists];
  const out: KeyList[] = entityLists(all);
  for (const list of sameLists(all)) if (!out.some((l) => l.register === list.register)) out.push(list);
  return out;
}

/** What parts the folded fields of a `same:` key: the record separator, which no folded text keeps (`sameKey`). */
const PARTS = '\u001e';

/**
 * A `same:` row's one key: `same:<list>:<where>:<what>`. Where is the value of the rule's `within`, a list of them in
 * order, or `*` for a row that applies everywhere; what is the rule's fields, each folded, in the rule's order. NOTHING
 * when a field it names is empty, since an empty name is the same as every other empty name and says nothing.
 */
function sameKey(list: SameList, fields: Readonly<Record<string, unknown>>): string[] {
  const rule = list.same;
  const parts: string[] = [];
  for (const id of rule.fields) {
    const said = textOf(fields[id]);
    const folded = said === undefined ? '' : sameFold(said, rule.fold);
    /* A TEXT HOLDING EITHER SEPARATOR could spell another row's key, or a project's claim (`SHARED`), so it holds none. */
    if (folded === '' || folded.includes(PARTS) || folded.includes('\u001f')) return [];
    parts.push(folded);
  }
  const at = rule.within === undefined ? undefined : fields[rule.within];
  const where = textOf(at)?.trim() ?? (textsOf(at).length > 0 ? [...new Set(textsOf(at).map((w) => w.trim()))].sort().join(',') : '*');
  return [`same:${list.register}:${where}:${parts.join(PARTS)}`];
}

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const textOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

/** One text or a list of them, as the texts it holds. */
const textsOf = (v: unknown): string[] => (typeof v === 'string' ? [v] : listOf(v)).filter((x) => x.trim() !== '');

/** Whether a place a project lists is a bare repository name, with no host, owner or folder (`portage`), as `scope.ts` reads one. */
const bareName = (place: string): boolean => !/[\\/:]/u.test(place.trim().replace(/\.git$/iu, ''));

/**
 * The keys a row's fields carry. A person: the email, every handle, every key. An organisation: every key and its
 * domain. A project: every domain, every whole remote and every folder it lists, then what it is called. A field the
 * list does not name is not read.
 *
 * A PROJECT'S PLACES ARE READ AS `scope.ts` READS THEM (`candidateOf`): a folder listed among the repositories is a
 * folder. A BARE REPOSITORY NAME IS A NAME, weak like the project's own: `portage` is every fork's and every other
 * checkout's name too, so it proposes the project and a whole remote decides.
 *
 * A LIST DECLARING `same:` answers its one key, the thing the row says (`sameKey`), and nothing when it says nothing.
 */
export function rowKeys(list: KeyList, fields: Readonly<Record<string, unknown>>): string[] {
  if (list.role === 'same') return sameKey(list, fields);
  const at = list.fields as Partial<Record<string, string>>;
  const read = (part: string): unknown => (at[part] === undefined ? undefined : fields[at[part]!]);
  if (list.role === 'project') {
    const repos = textsOf(read('repos'));
    return keysOf({
      domains: textsOf(read('domains')).map((d) => d.trim().replace(/^\*\./u, '')),
      remotes: repos.filter((r) => !isFolderPlace(r) && !bareName(r)),
      folders: [...textsOf(read('folders')), ...repos.filter(isFolderPlace)],
      names: [...textsOf(read('name')), ...repos.filter((r) => !isFolderPlace(r) && bareName(r)).map((r) => r.trim().replace(/\.git$/iu, ''))],
    });
  }
  /* A WEAK KEY IS HELD BY NOBODY ALONE: a `name:` written among a person's keys would make everyone of that name them. */
  const alone = (keys: string[]): string[] => keys.filter((k) => !isWeakKey(k));
  if (list.role === 'meets')
    return alone(keysOf({ email: textOf(read('email')), handles: listOf(read('handles')), keys: listOf(read('keys')) }));
  return alone(keysOf({ keys: listOf(read('keys')), domain: textOf(read('domain')) }));
}

/** The field a list says a row was folded into, or `undefined`. A project is never folded. */
export const mergeFieldOf = (list: KeyList): string | undefined => (list.fields as { merged_into?: string }).merged_into;

/** A row as `rekey` reads it. */
export type KeyedRow = { id: string; register: string; fields: Readonly<Record<string, unknown>>; deleted_at: string | null };

const liveRow = (sql: Pick<Sql, 'one'>, id: string): boolean =>
  sql.one<{ n: number }>('SELECT 1 AS n FROM entry WHERE id = ? AND deleted_at IS NULL', id) !== undefined;

/** How many steps of `merged_into` are followed before a chain is called a loop. */
export const FOLD_HOPS = 16;

/**
 * The rows `from` was folded into, in order, each the one the last was folded into: `[B, C]` for A folded into B and B
 * into C. Empty for a row not folded. A loop written by hand ends where it repeats, and a chain ends at `FOLD_HOPS`.
 */
export function foldChain(sql: Pick<Sql, 'one'>, field: string, from: string): string[] {
  const out: string[] = [];
  const seen = new Set([from]);
  let at = from;
  for (let hops = 0; hops < FOLD_HOPS; hops++) {
    const row = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', at);
    const next = row === undefined ? undefined : textOf(parsed(row.fields)[field]);
    if (next === undefined || seen.has(next)) break;
    out.push(next);
    seen.add(next);
    at = next;
  }
  return out;
}

/** The row at the end of `from`'s chain: the one it was finally folded into, or `from` itself when it was not. */
export const foldEnd = (sql: Pick<Sql, 'one'>, field: string, from: string): string => foldChain(sql, field, from).at(-1) ?? from;

/** Hold `key` for `row`, unless another live row holds it. A key whose holder is gone is taken over. */
function claim(sql: Pick<Sql, 'one' | 'exec'>, key: string, register: string, row: string, source: string, at: string): void {
  const held = sql.one<{ row_id: string }>('SELECT row_id FROM entity_key WHERE key = ?', key);
  if (held?.row_id === row) return;
  if (held && liveRow(sql, held.row_id)) return;
  sql.exec(
    'INSERT INTO entity_key (key, register, row_id, source, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET register = excluded.register, row_id = excluded.row_id, source = excluded.source, at = excluded.at',
    key,
    register,
    row,
    source,
    at,
  );
}

/**
 * What parts a shared claim's key from the row that holds it: the unit separator, which no key holds and which sorts
 * below every character one does, so the claims on one key are one range of the table's own index.
 */
const SHARED = '\u001f';

/** A project's claim on a key, as `entity_key` keeps it: the key and the row together, so two rows hold one key. */
const sharedKey = (key: string, row: string): string => `${key}${SHARED}${row}`;

/** A project's keys, from nothing: what it held goes, and what its fields carry now is held, unless it is deleted. */
function rekeyShared(sql: Pick<Sql, 'exec'>, list: ProjectList, after: KeyedRow, source: string, at: string): void {
  sql.exec('DELETE FROM entity_key WHERE row_id = ? AND register = ?', after.id, list.register);
  if (after.deleted_at !== null) return;
  /* A key holding the separator itself would be read back as another key's claim, so it is not held. */
  for (const key of rowKeys(list, after.fields).filter((k) => !k.includes(SHARED)))
    sql.exec(
      'INSERT INTO entity_key (key, register, row_id, source, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET register = excluded.register, row_id = excluded.row_id, source = excluded.source, at = excluded.at',
      sharedKey(key, after.id),
      list.register,
      after.id,
      source,
      at,
    );
}

/** A row of `claimed`: a project, the keys asked for that it holds, and whether every one of them is weak. */
export type Claimed = { id: string; keys: string[]; weak: boolean };

/**
 * The live rows of the project list `register` that hold any of `keys`, oldest first, each with the keys it answered
 * to. EVERY project holding a key is found, since a project shares its keys; which of them it is, if any, is
 * `settledBy`'s to say. One short range of the key's index per key, so the list is never read whole.
 */
export function claimed(sql: Pick<Sql, 'all'>, register: string, keys: readonly string[]): Claimed[] {
  const found = new Map<string, { seq: number | null; keys: string[] }>();
  for (const key of new Set(keys)) {
    const rows = sql.all<{ row_id: string; seq: number | null }>(
      `SELECT k.row_id, e.seq FROM entity_key k JOIN entry e ON e.id = k.row_id
        WHERE k.key > ? AND k.key < ? AND k.register = ? AND e.deleted_at IS NULL`,
      `${key}${SHARED}`,
      `${key}${String.fromCharCode(SHARED.charCodeAt(0) + 1)}`,
      register,
    );
    for (const r of rows) found.set(r.row_id, { seq: r.seq, keys: [...(found.get(r.row_id)?.keys ?? []), key] });
  }
  return [...found]
    .sort(([a, x], [b, y]) => (x.seq ?? Infinity) - (y.seq ?? Infinity) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, f]) => ({ id, keys: f.keys, weak: f.keys.every(isWeakKey) }));
}

/**
 * The one project what was found decides, or `null`. A PLACE OR A SITE DECIDES, AND ONLY WHEN ONE PROJECT HOLDS IT:
 * two holding one repository are a choice for the person, as `matchProject` leaves them. A NAME NEVER DECIDES, alone or
 * among several: the projects found by name only are candidates to propose, and are passed over here.
 */
export const settledBy = (found: readonly Claimed[]): string | null => {
  const strong = found.filter((f) => !f.weak);
  return strong.length === 1 ? strong[0]!.id : null;
};

/**
 * Bring `entity_key` up to one row as it now is, from what it was. In the write's transaction.
 *
 *   - A project: its shared claims are written again from its fields (`rekeyShared`), and none of the rest applies.
 *   - Folded into another (its `merged_into` set): every key it holds, and every one its fields carry that nobody
 *     holds, moves to the end of the chain it points into (`foldEnd`), the one row of it still standing.
 *   - Deleted, and not folded: its keys go, so they are free for whoever is met with them next.
 *   - Unfolded (its `merged_into` cleared): the keys its own fields carry come back from any row along the chain it
 *     was folded into, since a later merge may have moved them on.
 *   - Live: the keys it lost go, and the ones it gained are claimed.
 *
 * A `same:` ROW IS KEPT AS A PERSON'S IS, and is never folded (its list names no `merged_into`): the first live row to
 * say a thing holds its key, a row saying it second holds nothing, and a deleted row frees what it held.
 */
export function rekey(sql: Pick<Sql, 'one' | 'all' | 'exec'>, list: KeyList, before: KeyedRow | null, after: KeyedRow, source: string, at: string): void {
  if (list.role === 'project') return rekeyShared(sql, list, after, source, at);
  const field = mergeFieldOf(list);
  const into = field === undefined ? undefined : textOf(after.fields[field]);
  const was = field === undefined || before === null ? undefined : textOf(before.fields[field]);
  const own = rowKeys(list, after.fields);

  if (into !== undefined && into !== after.id) {
    /* THE END OF THE CHAIN, never a row back on itself: the write path refuses a fold into a descendant, and a loop
       written by hand past it leaves the keys where they are rather than handing them round the loop. */
    const end = foldEnd(sql, field!, into);
    if (end === after.id) return;
    sql.exec('UPDATE entity_key SET row_id = ?, at = ? WHERE row_id = ?', end, at, after.id);
    for (const key of own) claim(sql, key, list.register, end, source, at);
    return;
  }
  if (after.deleted_at !== null) {
    sql.exec('DELETE FROM entity_key WHERE row_id = ?', after.id);
    return;
  }
  if (was !== undefined && own.length > 0) {
    const chain = [was, ...foldChain(sql, field!, was)].filter((id) => id !== after.id);
    /* THE CHAIN IS ONE BOUND JSON ARRAY, so the statement binds four parameters however long the chain, inside the
       Durable Object's hundred (`DO_LIMITS.variableNumber`, `ports/src/sql.ts`). */
    const ids = JSON.stringify(chain);
    for (const key of own)
      sql.exec('UPDATE entity_key SET row_id = ?, at = ? WHERE key = ? AND row_id IN (SELECT value FROM json_each(?))', after.id, at, key, ids);
  }
  const had = before === null || before.deleted_at !== null ? [] : rowKeys(list, before.fields);
  for (const key of had) if (!own.includes(key)) sql.exec('DELETE FROM entity_key WHERE key = ? AND row_id = ?', key, after.id);
  for (const key of own) claim(sql, key, list.register, after.id, source, at);
}

/**
 * Every key, from nothing: what an import runs once at the end, and migration 23 once over the rows already here.
 *
 * THE LISTS ARE READ FROM THE LIVE DECLARATIONS, not from a kernel's cache, because the migration runs before there is
 * one. Live rows claim first, oldest first, so the row a person made first keeps a key two rows carry; then each folded
 * row's keys go to the end of its chain of `merged_into`, where nobody holds them. A list declaring `same:` is read the
 * same way, and the oldest live row of two that say one thing holds its key.
 */
export function rebuildKeys(sql: Pick<Sql, 'one' | 'all' | 'exec'>, at: string): number {
  if (!sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'entity_key'")) return 0;
  const lists = keyLists(
    sql
      .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0")
      .flatMap(({ body }) => {
        try {
          return [JSON.parse(body) as EntityDecl];
        } catch {
          return [];
        }
      }),
  );
  sql.exec('DELETE FROM entity_key');
  for (const list of lists) {
    if (list.role === 'project') {
      /* A PROJECT SHARES ITS KEYS, so there is no first to claim and nothing folded: every live one holds its own. */
      const live = sql.all<{ id: string; fields: string }>('SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq, id', list.register);
      for (const r of live) rekeyShared(sql, list, { id: r.id, register: list.register, deleted_at: null, fields: parsed(r.fields) }, 'rebuilt', at);
      continue;
    }
    const field = mergeFieldOf(list);
    const rows = sql
      .all<{ id: string; fields: string; deleted_at: string | null }>('SELECT id, fields, deleted_at FROM entry WHERE register = ? ORDER BY seq, id', list.register)
      .map((r) => ({ id: r.id, register: list.register, deleted_at: r.deleted_at, fields: parsed(r.fields) }));
    const folded = (r: KeyedRow): string | undefined => (field === undefined ? undefined : textOf(r.fields[field]));
    for (const r of rows) if (r.deleted_at === null && folded(r) === undefined) for (const key of rowKeys(list, r.fields)) claim(sql, key, list.register, r.id, 'rebuilt', at);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of rows) {
      let end = folded(r);
      for (let hops = 0; end !== undefined && hops < 16; hops++) {
        const next = byId.get(end);
        const further = next === undefined ? undefined : folded(next);
        if (further === undefined || further === end) break;
        end = further;
      }
      if (end === undefined || !byId.get(end) || byId.get(end)!.deleted_at !== null) continue;
      for (const key of rowKeys(list, r.fields)) claim(sql, key, list.register, end, 'rebuilt', at);
    }
  }
  return Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM entity_key')?.n ?? 0);
}

function parsed(fields: string): Record<string, unknown> {
  try {
    return JSON.parse(fields) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * The live rows of `register` holding any of `keys`, oldest first, each with the keys it answered to. A key held by a
 * row of another list is not one of them: a person is never found by an organisation's key, nor the other way.
 *
 * THE KEYS ARE ONE BOUND JSON ARRAY, so a row carrying 250 handles asks in two parameters and not 251.
 */
export function holders(sql: Pick<Sql, 'all'>, register: string, keys: readonly string[]): { id: string; keys: string[] }[] {
  if (keys.length === 0) return [];
  const rows = sql.all<{ key: string; row_id: string }>(
    `SELECT k.key, k.row_id FROM entity_key k JOIN entry e ON e.id = k.row_id
      WHERE k.key IN (SELECT value FROM json_each(?)) AND k.register = ? AND e.deleted_at IS NULL
      ORDER BY e.seq, e.id`,
    JSON.stringify(keys),
    register,
  );
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.row_id, [...(out.get(r.row_id) ?? []), r.key]);
  return [...out].map(([id, held]) => ({ id, keys: held }));
}

/** Who holds one key, of any list, or `null`. */
export function holderOf(sql: Pick<Sql, 'one'>, key: string): { register: string; id: string } | null {
  const r = sql.one<{ register: string; row_id: string }>(
    'SELECT k.register, k.row_id FROM entity_key k JOIN entry e ON e.id = k.row_id WHERE k.key = ? AND e.deleted_at IS NULL',
    key,
  );
  return r ? { register: r.register, id: r.row_id } : null;
}

/** How many deleted rows of a list `buried` reads, newest deleted first. */
export const BURIED_READ = 2000;

/**
 * THE TOMBSTONE: the deleted row of `list` that answers to any of `keys`, or `null`. A person or an organisation the owner
 * deleted keeps every address and handle on its deleted row, and while that row is deleted nobody but the owner by hand
 * makes it again: not a script, a door, a sync or an agent (`writing` in `index.ts`, `meet` and `meetContact` in
 * `people.ts`). Undo brings the row itself back, so the tombstone goes with it, and an erase takes it for good.
 *
 * A ROW MERGED AWAY IS A TOMBSTONE ONLY WHERE ITS CHAIN ENDS IN A DELETED ROW. Merged into somebody still here, its keys
 * answer to them (`rekey`), and a meeting by its address finds them.
 *
 * Measured on 3 November: Sam deleted five people the Gmail script had made, and an older copy of the script still
 * running made all five again an hour later, as new rows, because a deleted row's keys are freed (`rekey`).
 */
export function buried(sql: Pick<Sql, 'one' | 'all'>, list: KeyedList, keys: readonly string[]): { id: string } | null {
  const want = new Set(keys);
  if (want.size === 0) return null;
  const field = mergeFieldOf(list);
  const rows = sql.all<{ id: string; fields: string }>(
    'SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?',
    list.register,
    BURIED_READ,
  );
  for (const r of rows) {
    const fields = parsed(r.fields);
    const into = field === undefined ? undefined : textOf(fields[field]);
    if (into !== undefined && liveRow(sql, foldEnd(sql, field!, into))) continue;
    if (rowKeys(list, fields).some((k) => want.has(k))) return { id: r.id };
  }
  return null;
}

/** Say where the keys a meet just gave a row came from, in place of the write path's plain stamp. */
export function sourceKeys(sql: Pick<Sql, 'exec'>, row: string, keys: readonly string[], source: string): void {
  for (const key of keys) sql.exec('UPDATE entity_key SET source = ? WHERE key = ? AND row_id = ?', source, key, row);
}

/**
 * A name as two mentions of one share it: trimmed, spaces collapsed, lower case, and no punctuation but `-` and `'`.
 * The one reading a `name:` key is made with (`identity-keys.ts`), so a mention and a project's name key agree.
 */
export const nameKey = (name: string): string => nameWords(name);

/**
 * Keep a name met with nothing that identifies it. One line per name, kind, project and source, so the same commit
 * read twice is one mention, and the newest instant wins.
 */
export function noteMention(
  sql: Pick<Sql, 'exec'>,
  m: { name: string; kind: 'person' | 'organisation' | 'project' | 'thing'; project: string | null; source: string; at: string },
): void {
  sql.exec(
    `INSERT INTO entity_mention (name_key, name, kind, project, source, at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (name_key, kind, project, source) DO UPDATE SET at = excluded.at, name = excluded.name`,
    nameKey(m.name),
    m.name,
    m.kind,
    m.project ?? '',
    m.source,
    m.at,
  );
}

/** The kind a mention of a row of this role was kept under: what `noteMention` wrote, and so what a read of it asks for. */
export const mentionKindOf = (role: EntityList['role']): 'person' | 'organisation' | 'project' =>
  role === 'meets' ? 'person' : role === 'org' ? 'organisation' : 'project';

/** How many sources a name has been mentioned in, of one kind. */
export const mentionSources = (sql: Pick<Sql, 'one'>, name: string, kind: 'person' | 'organisation'): number =>
  Number(sql.one<{ n: number }>('SELECT count(DISTINCT source) AS n FROM entity_mention WHERE name_key = ? AND kind = ?', nameKey(name), kind)?.n ?? 0);

/** A declared field as `foldedCarry` reads it. */
export type CarryField = { id: string; type: string; label?: string; retired?: boolean; derived?: unknown };

/** How many dated lines a `met` field keeps, as `people.ts`'s `MET_CAP` does: the newest. */
const LINES_KEPT = 20;
/** How much of a value a note line keeps. */
const NOTE_CLIP = 80;

/**
 * What a kept row takes from a row folded into it where the two DISAGREE: the part `people.ts`'s `carried` leaves
 * behind, since it fills only what the kept row left empty. THE KEPT ROW WINS, and the folded value is not lost: a
 * different name joins `aliases` (or, on a list with none, a `met` line saying they were also called it), and any other
 * text the two disagree on becomes a dated `met` line naming the field, the value and the row it came from.
 *
 * NOT THE PARTS THAT ARE KEYS. An address, a handle or a domain the fold held already answers for the kept row through
 * `entity_key`, and a line carrying an address would put it in front of every reader of `met`. Nor a list, which
 * `carried` joins whole, nor a `document`, which is no line's length.
 *
 * Nothing when there is nowhere to keep it: a list with neither `aliases` nor `met` keeps the value on the folded row,
 * which stays in the file.
 */
export function foldedCarry(
  list: KeyedList,
  declared: readonly CarryField[],
  keep: Readonly<Record<string, unknown>>,
  fold: Readonly<Record<string, unknown>>,
  foldName: string,
  day: string,
): Record<string, unknown> {
  const at = list.fields as Partial<Record<string, string>>;
  const parts = new Set(Object.values(at).filter((f): f is string => f !== undefined));
  const patch: Record<string, unknown> = {};
  const lines: string[] = [];
  const met = at.met;
  const aliases = at.aliases;
  const held = (f: string): string[] => listOf(f in patch ? patch[f] : keep[f]);
  const noted = (text: string): boolean => [...listOf(keep[met ?? '']), ...lines].some((l) => l.slice(l.indexOf(' · ') + 3) === text);

  const theirs = textOf(fold[at.name!]);
  const ours = textOf(keep[at.name!]);
  if (theirs !== undefined && ours !== undefined && nameKey(theirs) !== nameKey(ours)) {
    if (aliases !== undefined) {
      if (!held(aliases).some((a) => nameKey(a) === nameKey(theirs))) patch[aliases] = [...held(aliases), theirs.trim()];
    } else if (met !== undefined && !held(met).some((l) => l.includes(theirs.trim()))) {
      const text = `also called ${clip(theirs)}`;
      if (!noted(text)) lines.push(`${day} · ${text}`);
    }
  }
  if (met !== undefined)
    for (const f of declared) {
      if (f.retired === true || f.derived !== undefined || parts.has(f.id) || f.id.startsWith('_')) continue;
      if (f.type !== 'text' && f.type !== 'url') continue;
      const was = textOf(fold[f.id]);
      const is = textOf(keep[f.id]);
      if (was === undefined || is === undefined || was.trim() === is.trim()) continue;
      const text = `${f.label ?? f.id.replace(/_/g, ' ')}: ${clip(was)}, from ${clip(foldName)}`;
      if (!noted(text)) lines.push(`${day} · ${text}`);
    }
  if (lines.length > 0 && met !== undefined) {
    const all = [...new Set([...held(met), ...lines])];
    patch[met] = all.sort((a, b) => (a.slice(0, 10) < b.slice(0, 10) ? -1 : a.slice(0, 10) > b.slice(0, 10) ? 1 : 0)).slice(-LINES_KEPT);
  }
  return patch;
}

const clip = (text: string): string => {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length <= NOTE_CLIP ? one : `${one.slice(0, NOTE_CLIP - 1).trimEnd()}…`;
};
