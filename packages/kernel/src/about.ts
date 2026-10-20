/**
 * The about read: what a person, an organisation or a project is and where it was seen, and the candidates a text is
 * handed to a model with (ENG-B02, job 3; the area's decision 2).
 *
 * `candidatesFor` IS THE RETRIEVAL, run before a model sees anything. It finds the rows a text may be about, in the
 * order that says how sure the finding is, and cuts them to `CANDIDATES`:
 *
 *   1. a row whose key is in the text: an address, a domain, a handle, a repository, a folder, a payee;
 *   2. a row one of whose aliases is in the text;
 *   3. a row whose name is in the text, the ones of the text's own project first;
 *   4. a row the full-text index finds for the text's capitalised runs.
 *
 * A NAME PROPOSES AND NEVER DECIDES ALONE (`identity-keys.ts`'s `WEAK_KINDS`). Two rows of one name are both answered,
 * each as found by `name`, and it is the model's reading and the check behind it that say which, never this file.
 *
 * NOTHING HANDED OVER HOLDS AN ID OR AN ADDRESS. A candidate is a handle, a kind, a name, what else it goes by and up
 * to three plain phrases of where it was seen. A HANDLE IS OPAQUE AND MADE PER CALL: it is random, it says nothing of
 * the row, and it means something only beside the `rows` the same call answered, so an answer kept from one job names
 * nothing in the next.
 *
 * `aboutOf` IS THE ONE READ of a row behind a handle, and `aboutOfRow` the same for a caller that knows the row.
 *
 * READ OVER THE TABLES AS THEY ARE (migration 23). `entity_mention` keeps a name, a kind, a project and a place, and
 * no row and no sentence, so:
 *
 *   - `links` is always empty, and `seen` carries no sentence, until the tables of decision 2 are made;
 *   - a sighting is a row's only when that row is the one live row of its kind answering to the name. A mention of
 *     `Web` beside two projects called Web is neither one's, since nothing kept says which was meant.
 *
 * A DELETED OR FOLDED ROW IS NOT ANSWERED, by its key, its name or its row: what it was is the row it was folded into.
 */

import type { Sql } from '@braindog/ports';

import { claimed, holders, mergeFieldOf, mentionKindOf, nameKey, type EntityList } from './entities.ts';
import { search } from './fts.ts';
import { isPublicMail, isWeakKey, keyFrom, keyOf, legacyBankKey, nameWords } from './identity-keys.ts';
import { isFolderPlace } from './scope.ts';

/**
 * What a row is. A `thing` is a row of a list that declares itself one, which no list can yet. An organisation is said
 * `org`, the word its list's role is declared by; a mention is kept under its own word, which `mentionKindOf` holds.
 */
export type AboutKind = 'person' | 'org' | 'project' | 'thing';

/** How a candidate was found, surest first. */
export type FoundBy = 'key' | 'alias' | 'name' | 'text';

/** A candidate as a model is shown it. */
export type Candidate = { h: string; kind: AboutKind; name: string; also: string[]; seen: string[] };

/** The row behind a handle: kept by the caller, never shown. */
export type HandleRow = { register: string; id: string; kind: AboutKind; how: FoundBy };

/** What one call handed out: the candidates in rank order, and the row each handle stands for. */
export type Handed = { candidates: Candidate[]; rows: ReadonlyMap<string, HandleRow> };

/** A link a text stated between two rows. None is kept yet. */
export type AboutLink = { to: string; as: string; sentence: string };

/** One place a row was seen. `sentence` comes with the tables of decision 2. */
export type AboutSeen = { at: string; where: string; sentence?: string };

export type About = { kind: AboutKind; name: string; also: string[]; links: AboutLink[]; seen: AboutSeen[] };

export type AboutDeps = {
  sql: Sql;
  /** The lists whose rows are entities, as `entityLists` reads them. */
  lists: readonly EntityList[];
  /** Whether the asker may read a list. Left out, every list is read: the owner's own read. */
  reads?: (register: string) => boolean;
  /** Random bytes for the handles. Left out, the platform's own. */
  random?: (size: number) => Uint8Array;
};

/** How many candidates one text is handed. */
export const CANDIDATES = 12;
/** How many phrases of where it was seen go with a candidate, and how long each may be. */
export const SEEN_SHOWN = 3;
const PHRASE = 80;
/** How many sightings `aboutOf` answers, newest first. */
export const SEEN_KEPT = 20;
/** How many other names a row is said to go by. */
const ALSO = 6;
/** How many keys, words and capitalised runs of one text are looked up: a pasted log is not read to its end. */
const KEYS = 48;
const WORDS = 400;
const NAME_WORDS = 5;
const RUNS = 8;
/** How many rows of one list one lookup by name reads. */
const NAMED = 60;

const KIND: Readonly<Record<EntityList['role'], AboutKind>> = { meets: 'person', org: 'org', project: 'project' };

/** What parts a shared claim's key from the row holding it, as `entities.ts` writes a project's keys. */
const SHARED = '\u001f';

const ADDRESS = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
/** A row's id, as the record mints one. */
const ROW_ID = /(?<![0-9A-Za-z])[0-9A-HJKMNP-TV-Z]{26}(?![0-9A-Za-z])/i;

const textOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const textsOf = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []).map((x) => x.trim()).filter((x) => x !== '');

/**
 * Words as a model may be shown them: an address said as `an address`, and `null` for words holding a row's id or
 * nothing at all. The one door every name, alias and place passes before it leaves this file.
 */
function plain(said: string, most = PHRASE): string | null {
  if (ROW_ID.test(said)) return null;
  const out = said.replace(ADDRESS, 'an address').replace(/\s+/g, ' ').trim();
  return out === '' ? null : out.slice(0, most);
}

/**
 * A name or an alias, or `null` when it is an address or an id and so no name to show. A site is a name: a project is
 * often called by its own (`northbank.example`), and that is what a person calls it too.
 */
const plainName = (said: string): string | null => (said.includes('@') ? null : plain(said));

/**
 * Every key a text holds that decides, each once, in the order read: a repository, an address and the domain it is
 * at, a site, a key written `kind:value`, a phone number, and a folder with every folder above it, since a project
 * holds its root and a text names a file under it. A name is not among them: it is weak, and is read as a name.
 */
export function keysIn(text: string): string[] {
  const out = new Set<string>();
  const add = (key: string | null): void => void (key !== null && !isWeakKey(key) && out.size < KEYS && out.add(key));
  const site = (host: string): void => {
    const key = keyOf('domain', host);
    if (key !== null && !isPublicMail(key.slice('domain:'.length))) add(key);
  };
  let rest = text;
  const take = (shape: RegExp, read: (m: RegExpExecArray) => void): void => {
    rest = rest.replace(shape, (...m) => (read(m as unknown as RegExpExecArray), ' '));
  };
  /* A REPOSITORY FIRST, so `git@github.com:mara/northbank` is not read as somebody's address. */
  take(/(?<![\p{L}\p{N}._-])[\w.-]+@[\w.-]+:[\w.-]+\/[\w./-]+/gu, (m) => add(keyOf('remote', m[0])));
  take(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)\]]+/gi, (m) => {
    const [host = '', owner, name] = m[0].replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^[^@/]*@/, '').split(/[/?#]/);
    if (owner && name) add(keyOf('remote', `${host}/${owner}/${name}`));
    site(host.replace(/:\d+$/, ''));
  });
  take(ADDRESS, (m) => {
    add(keyOf('email', m[0]));
    site(m[0].slice(m[0].lastIndexOf('@') + 1));
  });
  take(/(?<![\p{L}\p{N}])([a-z][a-z0-9.-]*):(@?[\p{L}\p{N}_][\p{L}\p{N}._+-]*)/giu, (m) => add(keyFrom(`${m[1]}:${m[2]!.replace(/[.]+$/, '')}`)));
  take(/(?<![\p{L}\p{N}])\+\d[\d\s().-]{6,18}\d/gu, (m) => add(keyOf('phone', m[0].replace(/[^\d+]/g, ''))));
  take(/(?<![\p{L}\p{N}:/\\])(?:\/|[A-Za-z]:[\\/])[^\s"'`<>()]+/gu, (m) => {
    if (!isFolderPlace(m[0])) return;
    const parts = m[0].replace(/\\/g, '/').replace(/[.,;:!?]+$/, '').split('/');
    for (let n = parts.length; n >= 2; n--) add(keyOf('folder', parts.slice(0, n).join('/')));
  });
  /* A SITE WRITTEN BARE, and beside it the repository a forge's path names: `github.com/mara/northbank`. */
  for (const m of rest.matchAll(/(?<![\p{L}\p{N}@.-])((?:[a-z0-9-]+\.)+[a-z]{2,})\/([\w.-]+)\/([\w.-]+)/giu)) add(keyOf('remote', `${m[1]}/${m[2]}/${m[3]}`));
  for (const m of rest.matchAll(/(?<![\p{L}\p{N}@.-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?![\p{L}\p{N}-])/giu)) site(m[0]);
  return [...out];
}

/** A live row of an entity list the asker may read, with its fields. */
type Row = { id: string; list: EntityList; fields: Readonly<Record<string, unknown>> };

const fieldsOf = (json: string): Record<string, unknown> => {
  try {
    const read: unknown = JSON.parse(json);
    return typeof read === 'object' && read !== null && !Array.isArray(read) ? (read as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The entity lists the asker may read. */
const readable = (deps: AboutDeps): EntityList[] => deps.lists.filter((l) => deps.reads?.(l.register) ?? true);

/** The row `id` names, or `null` when it is gone, deleted, folded into another, or of a list the asker may not read. */
function live(deps: AboutDeps, id: string): Row | null {
  const at = deps.sql.one<{ register: string; fields: string; deleted_at: string | null }>('SELECT register, fields, deleted_at FROM entry WHERE id = ?', id);
  if (at === undefined || at.deleted_at !== null) return null;
  const list = readable(deps).find((l) => l.register === at.register);
  if (list === undefined) return null;
  const fields = fieldsOf(at.fields);
  const fold = mergeFieldOf(list);
  return fold !== undefined && textOf(fields[fold]) !== '' ? null : { id, list, fields };
}

const part = (row: Row, name: string): unknown => {
  const field = (row.list.fields as Partial<Record<string, string>>)[name];
  return field === undefined ? undefined : row.fields[field];
};

/** What a row is called, as its list's own name field says it. */
const nameOf = (row: Row): string => textOf(part(row, 'name'));

/** A repository listed by its bare name, `portage`, which `entities.ts` keys as a name the project also answers to. */
const bareRepo = (place: string): string | null => {
  const said = place.trim().replace(/\.git$/iu, '');
  return said === '' || isFolderPlace(place) || /[\\/:]/u.test(said) ? null : said;
};

/** What else a row goes by: a person's aliases, a project's bare repository names. Never its own name twice. */
function alsoOf(row: Row): string[] {
  const said = row.list.role === 'meets' ? textsOf(part(row, 'aliases')) : row.list.role === 'project' ? textsOf(part(row, 'repos')).flatMap((r) => bareRepo(r) ?? []) : [];
  const out = new Map<string, string>();
  for (const one of said) {
    const key = nameKey(one);
    if (key !== '' && key !== nameKey(nameOf(row)) && !out.has(key)) out.set(key, one);
  }
  return [...out.values()];
}

/** Whether a row is of the project a text came in under: the project itself, or a row that lists it. */
const inProject = (row: Row, project: string | null): boolean =>
  project !== null && (row.list.role === 'project' ? row.id === project : textsOf(part(row, 'projects')).includes(project));

/** A field's place in a row's JSON, or `null` for an id that could not be written into a path. */
const pathOf = (field: string | undefined): string | null => (field !== undefined && /^[\w-]+$/u.test(field) ? `$."${field}"` : null);

/**
 * The live rows of one list whose name or alias is among `grams`, each with which of the two it was. `padded` is the
 * words they are looked for in, with a space either side, so `web` is not found inside `webhook`.
 *
 * A PROJECT IS FOUND IN ITS NAME KEYS, one range of the key table's index, and never by reading the list. A PERSON OR
 * AN ORGANISATION HOLDS NO NAME KEY (a name is nobody's alone), so its list is asked for the rows whose name or alias
 * is one of the text's own runs of words, bound as one array, and what comes back is checked here in the one spelling.
 */
function answering(deps: AboutDeps, list: EntityList, grams: readonly string[], padded: string): Map<string, { row: Row; by: 'alias' | 'name' }> {
  const out = new Map<string, { row: Row; by: 'alias' | 'name' }>();
  if (grams.length === 0) return out;
  const said = (name: string): boolean => name !== '' && padded.includes(` ${name} `);
  let ids: string[];
  if (list.role === 'project') {
    const held = deps.sql.all<{ key: string; row_id: string }>(
      `SELECT k.key, k.row_id FROM entity_key k JOIN entry e ON e.id = k.row_id
        WHERE k.register = ? AND k.key >= 'name:' AND k.key < 'name;' AND e.deleted_at IS NULL ORDER BY k.row_id`,
      list.register,
    );
    ids = [...new Set(held.filter((k) => said(k.key.slice('name:'.length).split(SHARED)[0]!)).map((k) => k.row_id))];
  } else {
    const name = pathOf(list.fields.name);
    const aliases = list.role === 'meets' ? pathOf((list.fields as { aliases?: string }).aliases) : null;
    if (name === null) return out;
    const all = JSON.stringify(grams);
    const also = aliases === null ? '' : ' OR EXISTS (SELECT 1 FROM json_each(e.fields, ?) a WHERE lower(trim(a.value)) IN (SELECT value FROM json_each(?)))';
    ids = deps.sql
      .all<{ id: string }>(
        `SELECT e.id FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL
          AND (lower(trim(json_extract(e.fields, ?))) IN (SELECT value FROM json_each(?))${also})
        ORDER BY e.id LIMIT ?`,
        ...[list.register, name, all, ...(aliases === null ? [] : [aliases, all]), NAMED],
      )
      .map((r) => r.id);
  }
  for (const id of ids.slice(0, NAMED)) {
    const row = live(deps, id);
    if (row === null) continue;
    if (alsoOf(row).some((a) => said(nameKey(a)))) out.set(id, { row, by: 'alias' });
    else if (said(nameKey(nameOf(row)))) out.set(id, { row, by: 'name' });
  }
  return out;
}

/**
 * Where a row was seen, newest first: the mentions of its kind by a name it alone answers to. A place is said in plain
 * words (`plain`), and one that only names a row is left out.
 */
function seenOf(deps: AboutDeps, row: Row, most: number): AboutSeen[] {
  const names = [...new Set([nameOf(row), ...alsoOf(row)].map(nameKey))].filter((key) => {
    if (key === '') return false;
    /* ONLY A ROW CALLED EXACTLY THIS shares the name: a project called Site is not one called Northbank Site. */
    const sharing = [...answering(deps, row.list, [key], ` ${key} `).values()].filter((f) => [nameOf(f.row), ...alsoOf(f.row)].some((n) => nameKey(n) === key));
    return sharing.length === 1 && sharing[0]!.row.id === row.id;
  });
  if (names.length === 0) return [];
  const met = deps.sql.all<{ source: string; at: string }>(
    'SELECT source, at FROM entity_mention WHERE kind = ? AND name_key IN (SELECT value FROM json_each(?)) ORDER BY at DESC, source LIMIT ?',
    mentionKindOf(row.list.role),
    JSON.stringify(names),
    most * 3,
  );
  const out = new Map<string, AboutSeen>();
  for (const m of met) {
    const where = plain(m.source);
    if (where !== null && !out.has(where)) out.set(where, { at: m.at, where });
  }
  return [...out.values()].slice(0, most);
}

/** What a live row is, or `null` when it has no name a model may be shown. */
function about(deps: AboutDeps, row: Row): About | null {
  const name = plainName(nameOf(row));
  if (name === null) return null;
  const also = alsoOf(row).flatMap((a) => plainName(a) ?? []).slice(0, ALSO);
  return { kind: KIND[row.list.role], name, also, links: [], seen: seenOf(deps, row, SEEN_KEPT) };
}

/** What the row `id` is and where it was seen, or `null` for one that is not answered (see the file's head). */
export function aboutOfRow(deps: AboutDeps, id: string): About | null {
  const row = live(deps, id);
  return row === null ? null : about(deps, row);
}

/** What the row behind a handle is. `rows` is what the call that made the handle answered; any other handle is `null`. */
export function aboutOf(deps: AboutDeps, rows: ReadonlyMap<string, Pick<HandleRow, 'id'>>, handle: string): About | null {
  const at = rows.get(handle);
  return at === undefined ? null : aboutOfRow(deps, at.id);
}

const LETTERS = 'abcdefghjkmnpqrstvwxyz23456789';

/**
 * A handle nobody was handed before in this call: `h` and six random letters, saying nothing of the row. A source of
 * bytes that repeats itself (a test's fixed one) is asked a few times and then told apart by how many were handed out,
 * so a call always ends.
 */
function mint(deps: AboutDeps, taken: ReadonlyMap<string, unknown>): string {
  for (let tries = 0; ; tries++) {
    const bytes = deps.random?.(6) ?? crypto.getRandomValues(new Uint8Array(6));
    const letters = [...bytes].map((b) => LETTERS[b % LETTERS.length]).join('');
    const handle = tries < 4 ? `h${letters}` : `h${letters}${taken.size + tries}`;
    if (!taken.has(handle)) return handle;
  }
}

/** Every run of one to `NAME_WORDS` of the text's words, the spellings a name or an alias could be found by. */
function gramsOf(words: readonly string[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) for (let n = 1; n <= NAME_WORDS && i + n <= words.length; n++) out.add(words.slice(i, i + n).join(' '));
  return [...out];
}

/** How sure each finding is, surest first: the order the candidates are cut in. */
const RANK = { key: 0, alias: 1, nameHere: 2, name: 3, textHere: 4, text: 5 } as const;

/**
 * The rows a text may be about, surest first, cut to `CANDIDATES`, each behind a handle made for this call. `project`
 * is the row of the project the text came in under, or `null`. See the file's head for the order and what is shown.
 */
export function candidatesFor(deps: AboutDeps, text: string, project: string | null): Handed {
  const lists = readable(deps);
  const found = new Map<string, { row: Row; rank: number; how: FoundBy }>();
  const put = (row: Row, rank: number, how: FoundBy): void => {
    const had = found.get(row.id);
    if (had === undefined || rank < had.rank) found.set(row.id, { row, rank, how });
  };
  const hit = (id: string, rank: (row: Row) => number, how: FoundBy): void => {
    const row = found.get(id)?.row ?? live(deps, id);
    if (row !== null) put(row, rank(row), how);
  };

  /* 1. A KEY IN THE TEXT. One short line may be a payee as a statement prints one, so it is read as that too. */
  const keys = keysIn(text);
  const line = text.trim();
  const payee = line.length <= PHRASE && !line.includes('\n') ? keyOf('bank', line) : null;
  if (payee !== null) keys.push(payee);
  /* AND THE KEY IT HAD BEFORE THE SHOP NAME WAS READ BY ITSELF, for a payee kept under that. */
  const old = payee === null ? null : legacyBankKey(line);
  if (old !== null) keys.push(old);
  for (const list of lists) {
    const held = list.role === 'project' ? claimed(deps.sql, list.register, keys) : holders(deps.sql, list.register, keys);
    for (const h of held) hit(h.id, () => RANK.key, 'key');
  }

  /* 2 AND 3. AN ALIAS, THEN A NAME, the rows of the text's own project ahead of the rest. */
  const words = nameWords(text).split(' ').filter(Boolean).slice(0, WORDS);
  const grams = gramsOf(words);
  const padded = ` ${words.join(' ')} `;
  for (const list of lists)
    for (const { row, by } of answering(deps, list, grams, padded).values())
      put(row, by === 'alias' ? RANK.alias : inProject(row, project) ? RANK.nameHere : RANK.name, by);

  /* 4. WHAT THE FULL-TEXT INDEX FINDS for the text's capitalised runs: a first name, half a company's name. */
  const runs = [...new Set([...text.matchAll(/\p{Lu}[\p{L}\p{N}'-]*(?:[ \t]+\p{Lu}[\p{L}\p{N}'-]*){0,3}/gu)].map((m) => m[0]))].slice(0, RUNS);
  const registers = lists.map((l) => l.register);
  for (const run of runs)
    for (const h of search(deps.sql, run, { registers, limit: 6 })) hit(h.id, (row) => (inProject(row, project) ? RANK.textHere : RANK.text), 'text');

  const ranked = [...found.values()].sort((a, b) => a.rank - b.rank || (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));
  const candidates: Candidate[] = [];
  const rows = new Map<string, HandleRow>();
  for (const { row, how } of ranked) {
    if (candidates.length >= CANDIDATES) break;
    const said = about(deps, row);
    if (said === null) continue;
    const h = mint(deps, rows);
    rows.set(h, { register: row.list.register, id: row.id, kind: said.kind, how });
    candidates.push({ h, kind: said.kind, name: said.name, also: said.also, seen: said.seen.slice(0, SEEN_SHOWN).map((s) => s.where) });
  }
  return { candidates, rows };
}
