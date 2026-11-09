/**
 * Who is on this record, and what each of them may reach.
 *
 * THE ROWS HERE ARE A MIRROR. The Directory holds who somebody is across every record they touch;
 * this holds what they may do inside THIS one, so a `.brain` file resolves its own actors offline and
 * a record restored on a laptop still knows whose name is on every event. Two places, one of which
 * is authoritative and one of which travels — and the one that travels is this.
 *
 * A LEVEL PER REGISTER, WITH `*` MEANING THE RECORD. Somebody can be an owner of the record and hold
 * nothing more than `read` on the one register that carries the payroll — because the alternative is
 * a product where inviting a bookkeeper means showing them everything, and what people do then is
 * not invite the bookkeeper.
 *
 * AND A RECORD KEEPS ONE OWNER. A record with none is a record nobody can grant access to, invite
 * anybody into, or close, and the only way out of it is somebody with a database.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { compile, type Compiled, type Json, type Schema } from '@braindog/where';

import { lensOf, type Catalog, type LensLevel, type LensSources } from './lens.ts';
import { predicateOf, type EvalContext } from './metrics.ts';
import { clearFault, missedCause } from './fault.ts';
import { instant } from './migrate.ts';
import { epochOf, meOf, narrowsOf, saysMe, sharesFor, type LensCache } from './shares.ts';

/** The five, and only a person ever reaches the top two. */
export const LEVELS = ['read', 'append', 'write', 'decide', 'owner'] as const;
export type Level = (typeof LEVELS)[number];

/** `*` is the record itself. Anything else is a register id. */
export const RECORD = '*';

export type Member = {
  person_id: string;
  email: string | null;
  name: string | null;
  /** What they hold on the record as a whole, or `null` when they hold only named registers. */
  level: Level | null;
  /** Register ids where they hold something OTHER than their record level. */
  scoped: { register: string; level: Level }[];
  /**
   * The lists whose grant is narrowed to the rows matching one `where`, keyed by list id, in the shape `invite` takes
   * them, so the People screen can send back what it was given. Absent when no grant is narrowed. A rule that cannot be
   * read is `null` here, and it reaches no row.
   */
  wheres?: Record<string, Json>;
  seen_at: string | null;
  suspended_at: string | null;
};

/**
 * One `where` per list grant: the rows of that list a member reaches, keyed by list id (`20-COLLABORATION` §1).
 *
 * A LIST WITH NO KEY HERE IS EVERY ROW OF IT, which is what every grant meant before migration 19, and `null` is a rule
 * the record could not read, which reaches no row: a narrowed grant that failed open would show a colleague the rows
 * the owner chose to keep from them, and one that fails closed shows them an empty list they can ask about.
 */
export type Wheres = Record<string, Json>;

/**
 * THE LONGEST RULE A GRANT HOLDS, in characters of its JSON text. A rule is a few conditions an owner picked on the
 * People screen; one this long is not a rule anybody reads, and every row read by that member compiles it.
 */
export const WHERE_MAX_CHARS = 4_000;

export type MemberDeps = {
  sql: Sql;
  nowMs: number;
  mint: () => string;
  hasRegister: (register: string) => boolean;
  /**
   * Why a rule cannot be read against one list, or `null` when it can, so `invite` refuses a rule the readers would
   * answer nothing for rather than storing it. Absent, only the rule's shape is checked.
   */
  readsRule?: (register: string, where: Json) => Refusal | null;
  /** The name of a list declared `personal: true`, which no invitation reaches, or `null` for any other list. */
  personal?: (register: string) => string | null;
};

/**
 * What one person may do inside this record, or `null` if they are not on it.
 *
 * THE AUTHORITY, AND THE ONE PLACE IT LIVES. The Directory says which records somebody can reach at
 * all — the switcher's index — and this says what they may do inside one. Reading the level from
 * the Directory instead meant `invite` and `remove` wrote a table no authorisation path ever read:
 * removing somebody did not stop them writing, and a bookkeeper given `read` on the payroll register
 * wrote to it.
 *
 * `registers` IS THE CEILING AND `null` IS "ALL OF THEM". A person with a register-scoped row holds
 * that register and nothing else — which is what makes "invite the bookkeeper to one register"
 * true rather than decorative.
 *
 * THE LENS. With `lens` handed in, the person's shares and their groups' shares are merged
 * with their role and their legacy list rows through `lensOf`, and `token` (a key's id) brings its narrowing chain from
 * `token_lens`, ANDed into everything. The answer is a superset of the one before: `writes`, `hides`, `nots` and `grant`
 * join `wheres` where they say something. A person holding no share, through a key narrowed to nothing, gets exactly
 * the answer they got before shares existed, so an owner's call and every reader built on it are unchanged. It fails
 * closed: a share that cannot be read, or a narrowing that cannot, is `null`, the stranger's answer.
 *
 * Without `lens` (a caller with no catalog to hand) it is the member rows alone, as it always was.
 */
export function access(sql: Sql, person: string, token?: string | null, lens?: AccessLens): Held | null {
  /* A SUSPENDED PERSON HOLDS NOTHING, and until now the column was a thing the interface could show
     and the ladder could not enforce: `access` read only `member`, `verifyToken` joined nothing, and
     a suspension was a label. Suspending somebody is what you do when you cannot yet decide whether
     to remove them, and it has to actually stop them while you decide.

     THE JOIN, not two queries: a person row that disappeared between them is a person whose access
     was computed from half a record.

     AND IT FAILED OPEN ON EXACTLY THAT CASE. The predicate was
     `NOT EXISTS (… p.id = m.person_id AND p.suspended_at IS NOT NULL)` — which, with no `person`
     row at all, has nothing to find, so `NOT EXISTS` is true and every `member` row came back. A
     `member` row whose person is missing made its holder whatever level that row said, and the
     comment above claimed to be about that case.

     Measured: a record carrying `member('p_ghost', '*', 'owner')` and no `person('p_ghost')` gave
     `access('p_ghost') → owner` — the keychain, the export, `invite`. `owners()` DOES join `person`, so
     it did not count the ghost: `suspend` answered `OUT_OF_BOUNDS`, `remove` answered
     `LEVEL_REQUIRED`, and demoting the real owner was refused because the ghost was invisible to the
     count and visible to the ladder. That is the state `owners()`'s own comment says there is *"no
     way back in short of raw SQL on the file"* from, reached from a `.brain` import.

     An `INNER JOIN` is the fix and it is the shape the sentence above always described: a level
     belongs to a person, so no person is no level. */
  const rows = sql.all<MemberRow>(
    `SELECT m.register AS register, m.level AS level, m.row_where AS row_where
       FROM member m JOIN person p ON p.id = m.person_id
      WHERE m.person_id = ? AND p.suspended_at IS NULL`,
    person,
  );
  if (lens === undefined) return memberAccess(rows);

  /* THE CACHE (§2.8), keyed on everything the answer is made of that can change without the clock. The member rows are
     read on every call anyway, so they are in the key and a raw write to `member` is never answered from the cache;
     shares and groups move the epoch, and the set of lists moves the revision. An answer is good until the instant the
     clock alone would change it. */
  const epoch = epochOf(sql);
  const key = lens.cache === undefined ? '' : [person, token ?? '', epoch, lens.revision ?? 0, JSON.stringify(rows)].join('\u0000');
  const hit = lens.cache?.get(key, lens.nowMs);
  if (hit !== undefined) return hit.value;
  const { held, until } = merged(sql, person, rows, token ?? null, lens, epoch);
  return lens.cache === undefined ? held : lens.cache.set(key, held, until);
}

type MemberRow = { register: string; level: Level; row_where: string | null };

/** What `access` answers: the role, the ceiling, the per-list levels and rules, and with shares, what the lens adds. */
export type Held = {
  level: LensLevel | null;
  registers: string[] | null;
  levels: Record<string, LensLevel>;
  wheres?: Wheres;
  /** The rows of a list this caller may change, where that differs from what they read (`CallContext.writes`). */
  writes?: Wheres;
  /** Fields hidden from this caller, by list. */
  hides?: Record<string, string[]>;
  /** `history` and `delete`, by list, where a share switched them off. */
  nots?: Record<string, ('history' | 'delete')[]>;
  /** Present when shares made the answer: the epoch, the next clock edge, the shares that reached something. */
  grant?: Grant;
};

/** Where a lens came from and how long it holds (§2.4, §2.8). */
export type Grant = { epoch: number; until: string | null; via: string[]; agents: boolean };

/** What `access` needs to merge shares: the record's lists, its clock and zone, the People list for `$me`, and the cache. */
export type AccessLens = {
  catalog: () => Catalog;
  nowMs: number;
  /** The record's time zone, asked only when a lens is computed. */
  tz?: () => string;
  /** The list `meet` writes, whose rows `$me` names, asked only when a share says `$me`. */
  people?: () => string | null;
  /** The declaration revision, which moves when the set of lists or their fields does. */
  revision?: number;
  cache?: LensCache<Held | null>;
};

/** The answer from the member rows alone, as it was before shares. */
function memberAccess(rows: readonly MemberRow[]): Held | null {
  const whole = rows.find((r) => r.register === RECORD);
  const scoped = rows.filter((r) => r.register !== RECORD);
  if (!whole && scoped.length === 0) return null;

  /* SOMEBODY WITH ONLY SCOPED ROWS HOLDS `read` ON THE RECORD ITSELF, and nothing more.

     THIS PROMOTED THE HIGHEST SCOPED LEVEL TO THE RECORD-WIDE ONE, which is the wrong direction and
     the expensive one: `invite({ registers: { payroll: 'owner' } })` is accepted, and the caller
     then held `level: 'owner'` — which is what `keychain()` and `admin()` read, and neither of them
     consults the ceiling, because ADMIN and KEYCHAIN are not about a register. Owner of one register
     was owner of the record: the credential index, the export, `invite`, `createToken`,
     `setDeclaration`. 45 §5.1 is explicit that for KEYCHAIN and ADMIN *"the `'*'` level must be
     owner"*, and the only honest reading of "no `'*'` row" is that there is no record-wide level.

     The per-register levels below still travel, which is where a scoped grant does its work. */
  /* THE HIGHEST SCOPED LEVEL, HELD TO THOSE REGISTERS — not `read`, and not the promotion this used
     to do either. `read` was a second wrong answer in the other direction: it gave an APPENDER a
     record-wide read, and `append` is the one rung whose point is that it does not read. Every
     method that names no register — `boot`, `search`, `page`, `metric`, `governance` — asks
     `guard(ctx, 'read')` with nothing to scope it, so a contractor invited to file expenses could
     see the register list and search across it.

     What a scoped-only member holds ON THE RECORD is nothing, and `null` is how that is said. The
     ceiling and the per-register levels below carry everything they can actually do. */
  const level = whole?.level ?? null;
  /* AND THE PER-REGISTER LEVELS TRAVEL, or the whole feature is decorative: a bookkeeper with
     `read` on the record and `write` on one register is the point, and so is an owner held to
     `read` on the one register that carries the payroll. */
  /* AND THE RULES TRAVEL BESIDE THE LEVELS THEY NARROW, one per list grant, so both hosts copy them into the call's
     context wherever they copy `levels` and every reader narrows by the same map (`CallContext.wheres`). A `'*'` row
     never holds one, and one written there by hand is not read: a rule is about one list's fields. Absent when no grant
     is narrowed, which is every grant on a record that has never set a rule. */
  const wheres = wheresOf(scoped);
  return {
    level,
    registers: whole ? null : scoped.map((r) => r.register),
    levels: Object.fromEntries(scoped.map((r) => [r.register, r.level])),
    ...(Object.keys(wheres).length === 0 ? {} : { wheres }),
  };
}

/**
 * The member rows merged with the person's shares and a key's narrowing through `lensOf`, and until when that holds.
 *
 * NOTHING TO MERGE IS THE MEMBER ROWS' OWN ANSWER: no share and no narrowing, or an owner with no narrowing (a share
 * never targets an owner). A person on no member row is a guest, who is on the record while a share reaches something.
 */
function merged(sql: Sql, person: string, rows: readonly MemberRow[], token: string | null, lens: AccessLens, epoch: number): { held: Held | null; until: number } {
  const forever = Number.POSITIVE_INFINITY;
  const narrows = token === null ? [] : narrowsOf(sql, token);
  if (narrows === undefined) return { held: null, until: forever };
  const whole = rows.find((r) => r.register === RECORD);
  const owner = whole?.level === 'owner';
  /* A CHILD KEY REACHES NO PERSONAL LIST (`42 §4.4`), so while the record keeps one, a child with nothing narrowing it
     is read through the lens as well, which leaves those lists out of its ceiling. */
  const child = token !== null && lens.catalog().lists.some((l) => l.personal === true) && childKey(sql, token);
  if (owner && narrows.length === 0 && !child) return { held: memberAccess(rows), until: forever };
  const shares = owner ? [] : sharesFor(sql, person);
  if (shares === null) return { held: null, until: forever };
  if (shares.length === 0 && narrows.length === 0 && !child) return { held: memberAccess(rows), until: forever };
  if (rows.length === 0) {
    /* A GUEST HOLDS ONLY SHARES, and a suspended one holds nothing, as a suspended member does. */
    if (shares.length === 0) return { held: null, until: forever };
    if (sql.one('SELECT 1 AS y FROM person WHERE id = ? AND suspended_at IS NULL', person) === undefined) return { held: null, until: forever };
  }

  const sources: LensSources = {
    person,
    role: whole?.level ?? null,
    lists: rows
      .filter((r) => r.register !== RECORD)
      .map((r) => ({ register: r.register, level: r.level, ...(r.row_where === null ? {} : { where: parsed(r.row_where) }) })),
    shares,
    ...(saysMe(shares) ? { me: meOf(sql, person, lens.people?.() ?? null) } : {}),
    ...(token === null ? {} : { token: { narrow: null, narrows, ...(child ? { child: true } : {}) } }),
    epoch,
  };
  const got = lensOf(sources, lens.catalog(), lens.nowMs, lens.tz?.() ?? 'UTC');
  if (got === null) return { held: null, until: forever };
  const until = got.until === null ? forever : Date.parse(got.until);
  const c = got.ctx;
  /* SOMEBODY WHO REACHES NO LIST AND HOLDS NOTHING ON THE RECORD IS NOT ON IT: a guest whose shares have all ended. */
  if (c.level === null && c.registers !== null && c.registers.length === 0) return { held: null, until };
  const some = (o: object): boolean => Object.keys(o).length > 0;
  return {
    held: {
      level: c.level,
      registers: c.registers,
      levels: c.levels,
      ...(some(c.wheres) ? { wheres: c.wheres as Wheres } : {}),
      ...(some(c.writes) ? { writes: c.writes as Wheres } : {}),
      ...(some(c.hides) ? { hides: c.hides } : {}),
      ...(some(c.nots) ? { nots: c.nots } : {}),
      ...(shares.length === 0 ? {} : { grant: c.grant }),
    },
    until,
  };
}

/** Whether a key was minted under another (`mintChild`), as its `token_lens` row says. */
const childKey = (sql: Sql, token: string): boolean =>
  sql.one<{ y: number }>('SELECT 1 AS y FROM token_lens WHERE token_id = ? AND parent_id IS NOT NULL', token) !== undefined;

/**
 * The rules on a person's list grants, by list id, from the stored text of each.
 *
 * A TEXT THAT IS NOT JSON READS AS `null`, which reaches no row. It can only be there by a hand edit or a file from
 * somewhere else, and the grant it narrows is still a grant the owner narrowed.
 */
function wheresOf(rows: readonly { register: string; row_where: string | null }[]): Wheres {
  const out: Wheres = {};
  for (const row of rows) {
    if (row.register === RECORD || row.row_where === null) continue;
    out[row.register] = parsed(row.row_where);
  }
  return out;
}

const parsed = (text: string): Json => {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return null;
  }
};

/**
 * A grant's rule compiled against its list, or a refusal in `bad` when it cannot be read.
 *
 * THE SAME TWO STEPS A CALLER'S OWN `where` TAKES in `list` (`predicateOf`, then `compile`), so a rule and a filter are
 * one grammar (`34-GRAMMARS` §1) and a rule the owner could type as a filter is a rule a grant can hold. Only a
 * sentence or a tree is a rule; `null`, a number or a list is one the record could not read.
 */
export function ruleOf(where: Json, schema: Schema, ctx: EvalContext): Compiled {
  /* A READ SCOPE (`scopeFor`): the grant's rule, if any, and the private rows left out for this viewer. */
  if (isScope(where)) {
    const inner = Object.hasOwn(where, 'rule') ? ruleOf(where.rule as Json, schema, ctx) : null;
    return exceptPrivate(narrowed({ sql: '(1)', params: [], bad: [] }, inner), where[SCOPE]);
  }
  if (typeof where !== 'string' && (where === null || typeof where !== 'object' || Array.isArray(where)))
    return { sql: '', params: [], bad: [{ code: 'VALUE_MALFORMED', fix: 'A rule is a where: a sentence, or the conditions a filter holds.' }] };
  const said = predicateOf(where as Parameters<typeof predicateOf>[0], schema, ctx);
  const whole = said.bad.length ? { sql: '', params: [], bad: said.bad } : compile(said.predicate, schema);
  /* A LENS COMPOSES GROUPS A FILTER MAY NOT (`lens.ts`'s `fold`): a share's condition inside its allow and its deny nests
     deeper than the grammar's three, and a legacy sentence rides in one as a leaf. A group the filter path refuses is
     joined here instead, each part compiled as a rule, so a part means what it means alone; a part that cannot be read
     leaves the whole of it unread, which reaches no row. */
  return whole.bad.length ? (groupRule(where, schema, ctx) ?? whole) : whole;
}

/** A group of rules, joined part by part, or `null` when `where` is not a group. */
function groupRule(where: Json, schema: Schema, ctx: EvalContext): Compiled | null {
  if (where === null || typeof where !== 'object' || Array.isArray(where)) return null;
  const keys = Object.keys(where);
  const k = keys[0];
  if (keys.length !== 1 || (k !== 'all' && k !== 'any' && k !== 'none')) return null;
  const kids = (where as Record<string, Json>)[k];
  if (!Array.isArray(kids)) return null;
  const parts = kids.map((kid) => ruleOf(kid, schema, ctx));
  const bad = parts.flatMap((p) => p.bad);
  if (bad.length) return { sql: '', params: [], bad };
  const params = parts.flatMap((p) => p.params);
  if (k === 'all') return { sql: parts.length ? parts.map((p) => `(${p.sql})`).join(' AND ') : '1 = 1', params, bad: [] };
  const or = parts.length ? parts.map((p) => `(${p.sql})`).join(' OR ') : '0 = 1';
  return { sql: k === 'any' ? or : `NOT (${or})`, params, bad: [] };
}

/**
 * What a caller asked for, held to the rows their grant reaches.
 *
 * THE CALLER'S OWN REFUSAL COMES FIRST, so a filter they got wrong is still named to them. `null` is a grant with no
 * rule, every row. A rule that cannot be read runs as a clause no row meets and refuses nothing: the member sees an
 * empty list, not a sentence about a rule they cannot see or change.
 */
export function narrowed(asked: Compiled, rule: Compiled | null): Compiled {
  if (asked.bad.length || rule === null) return asked;
  if (rule.bad.length) return { sql: `(${asked.sql}) AND 0`, params: asked.params, bad: [] };
  return { sql: `(${asked.sql}) AND (${rule.sql})`, params: [...asked.params, ...rule.params], bad: [] };
}

/* THE KEY A READ SCOPE CARRIES ITS VIEWER UNDER. A list id never starts with a dollar sign, so it cannot be mistaken for a rule. */
const SCOPE = '$scope';
type Scope = { [SCOPE]: string; rule?: Json };
const isScope = (where: unknown): where is Scope =>
  typeof where === 'object' && where !== null && !Array.isArray(where) && typeof (where as Record<string, unknown>)[SCOPE] === 'string';

/**
 * A ROW ITS MAKER KEPT PRIVATE (migration 40) LEFT OUT for anybody but that maker. The one clause every scoped read ends
 * in, so a reader that is handed a scope cannot forget it. A rule that cannot be read stays as `narrowed` made it.
 */
export function exceptPrivate(c: Compiled, viewer: string): Compiled {
  return c.bad.length ? c : { sql: `(${c.sql}) AND id NOT IN (SELECT entry_id FROM entry_private WHERE person_id <> ?)`, params: [...c.params, viewer], bad: [] };
}

/**
 * THE ONE READ-SCOPE HELPER: what a reader hands the kernel for one list. The caller's grant rule (`whereFor`), and, when
 * somebody else has kept a row private, the viewer too, so `list`, `count` and every reader built on them leave it out.
 * `undefined` is still "every row", which is the answer while nothing is private, so the fast whole-list paths stand
 * until a private row exists. `hidden` is whether any row is private to somebody other than the viewer.
 */
export function scopeFor(wheres: Readonly<Wheres> | undefined, register: string, viewer: string | undefined, hidden: boolean): Json | undefined {
  const rule = whereFor(wheres, register);
  if (viewer === undefined || !hidden) return rule;
  return (rule === undefined ? { [SCOPE]: viewer } : { [SCOPE]: viewer, rule }) as Json;
}

/** The viewer a read scope carries (`scopeFor`), or `undefined` for a grant that holds no private rows back. */
export const viewerOfScope = (where: Json | undefined): string | undefined => (isScope(where) ? where[SCOPE] : undefined);

/**
 * A VIEWER WHO IS NOBODY, for a read that leaves the record (a mail, a push, the written brief, what a model is sent):
 * every private row is left out of it, whoever made it, because the person it goes to is not the maker.
 */
export const NOBODY = '';

/** Who is looking, for the rows their makers kept private: a person, or the person an agent's token acts for. A share link is nobody, so it sees no private row. The system has none and reads the whole record. */
export const viewerOfPrincipal = (p: { kind: string; id: string; person?: string }): string | undefined =>
  p.kind === 'person' ? p.id : p.kind === 'token' ? p.person : p.kind === 'share' ? NOBODY : undefined;

/** Who a read is for: the person looking, or `NOBODY` when it leaves the record (`outbound`), else no one in particular. */
export const viewerOfRead = (ctx: { principal: { kind: string; id: string; person?: string }; outbound?: boolean | undefined; preview?: string | undefined }): string | undefined =>
  /* SEEING AS SOMEBODY READS AS NOBODY: the rows they keep private are theirs, not their viewer's. */
  ctx.outbound === true || (typeof ctx.preview === 'string' && ctx.preview !== '') ? NOBODY : viewerOfPrincipal(ctx.principal);

/** The rule a caller's grant holds on one list, or `undefined` when that list is every row to them. */
export const whereFor = (wheres: Readonly<Wheres> | undefined, register: string): Json | undefined =>
  wheres !== undefined && Object.hasOwn(wheres, register) ? wheres[register] : undefined;

/**
 * Everybody on the record, with what they hold and where.
 *
 * IT JOINS `person` FOR THE SAME REASON `access()` DOES. A `member` row whose person is missing was
 * listed as an active owner with a `null` name — so after the fail-open in `access()` was closed, the
 * two disagreed: the ladder said the ghost held nothing and the People screen drew it holding
 * everything. That is the pair the fix was about, relocated one function over.
 */
export function members(sql: Sql): Member[] {
  const rows = sql.all<{ person_id: string; register: string; level: Level; seen_at: string | null; row_where: string | null }>(
    `SELECT m.person_id AS person_id, m.register AS register, m.level AS level, m.seen_at AS seen_at, m.row_where AS row_where
       FROM member m JOIN person p ON p.id = m.person_id
      ORDER BY m.person_id, m.register`,
  );
  const people = new Map(
    sql
      .all<{ id: string; email: string | null; name: string | null; suspended_at: string | null }>(
        'SELECT id, email, name, suspended_at FROM person',
      )
      .map((p) => [p.id, p]),
  );

  const out = new Map<string, Member>();
  for (const row of rows) {
    const person = people.get(row.person_id);
    const held: Member =
      out.get(row.person_id) ??
      ({
        person_id: row.person_id,
        email: person?.email ?? null,
        name: person?.name ?? null,
        /* `null` UNTIL A `*` ROW SAYS OTHERWISE. "No access to the record itself" and "read on the
           record" are different things, and a listing that showed them the same would have somebody
           revoke the wrong one. */
        level: null,
        scoped: [],
        seen_at: null,
        suspended_at: person?.suspended_at ?? null,
      } satisfies Member);

    if (row.register === RECORD) held.level = row.level;
    else {
      held.scoped.push({ register: row.register, level: row.level });
      /* THE RULE ON THIS LIST, WHEN THE OWNER NARROWED IT, read the way `access` reads it, so the People screen draws
         the grant the ladder enforces. */
      if (row.row_where !== null) held.wheres = { ...held.wheres, [row.register]: parsed(row.row_where) };
    }
    /* THE FURTHEST MARK ON ANY OF THEIR ROWS, and not the `'*'` row's alone. A level is about a
       register, so it belongs to the row it is on; a read mark is about the person, and `markRead`
       moves it on every row they hold. Reading it off `'*'` meant a colleague invited to one list
       had no mark here however much they had read, and the People screen told the owner, of every
       one of them, that they had never opened the record. */
    if (row.seen_at !== null && (held.seen_at === null || row.seen_at > held.seen_at)) held.seen_at = row.seen_at;
    out.set(row.person_id, held);
  }
  return [...out.values()];
}

/**
 * Put somebody on the record, or move them.
 *
 * ONE EVENT PER REGISTER, and that is not bookkeeping: `access.grant` is how anybody later answers
 * "when did they get to see this", and a single event naming a list would make the answer a string
 * somebody has to parse.
 */
export function invite(
  deps: MemberDeps,
  by: string,
  args: {
    person: string;
    email?: string;
    name?: string;
    level?: Level;
    registers?: Record<string, Level>;
    wheres?: Wheres;
    why?: string;
  },
): Result<Member> {
  if (!args?.person) return no<Member>('REQUIRED_MISSING', 'Who?', { at: 'person' });
  /* A LEVEL ON THE RECORD IS OPTIONAL, and leaving it out is how somebody is invited to ONE
     register and nothing else — which is the whole of what "invite the bookkeeper" means. What is
     not optional is holding SOMETHING: an invitation to nothing is not an invitation. */
  if (args.level !== undefined && !(LEVELS as readonly string[]).includes(args.level))
    return no<Member>('ENUM_VALUE_UNKNOWN', `${String(args.level)} is not a level.`, { at: 'level', allowed: LEVELS });
  if (args.level === undefined && Object.keys(args.registers ?? {}).length === 0)
    return no<Member>('REQUIRED_MISSING', 'An invitation says what somebody may reach, on all of this BrainDog or on one list.', {
      at: 'level',
    });

  /* `at` IS A PATH INTO WHAT THE CALLER SENT, and `registers` is an object keyed by slug, so the
     entry that is wrong is at `registers.<slug>`. Both branches passed the bare slug, which names a
     value rather than a place: no payload has a top-level `ledger` key, and a screen given `ledger`
     has nothing to put the message on. The slug is already in `fix`, where it belongs. */
  for (const [register, level] of Object.entries(args.registers ?? {})) {
    const at = `registers.${register}`;
    if (!deps.hasRegister(register)) return no<Member>('REGISTER_UNKNOWN', `There is no register called ${register}.`, { at });
    const personal = deps.personal?.(register) ?? null;
    if (personal !== null) return no<Member>('FORBIDDEN', `${personal} is personal: only the owner reads it, so nobody is invited to it.`, { at });
    if (!(LEVELS as readonly string[]).includes(level))
      return no<Member>('ENUM_VALUE_UNKNOWN', `${String(level)} is not a level.`, { at, allowed: LEVELS });
  }
  const rules = rulesOf(deps, args);
  if (!rules.ok) return rules;

  /**
   * A SUSPENDED PERSON IS NOT INVITED THROUGH.
   *
   * `invite` never looked at `suspended_at`, so suspending somebody and then changing their level
   * wrote a grant naming a level they did not hold, from a level they did not hold — `from_v: 'read'`
   * on a person the revoke two rows above had just taken to nothing. The ledger stopped being
   * replayable, which is the property `suspend`'s own comment claims for it, and the new rows came
   * live the moment they were un-suspended without any event saying so.
   *
   * Suspension is *"stop somebody without deciding about them"*. Deciding about them is what this
   * method is, so it says which one you are doing.
   */
  if (deps.sql.one<{ n: number }>('SELECT count(*) AS n FROM person WHERE id = ? AND suspended_at IS NOT NULL', args.person)?.n)
    return no<Member>('LEVEL_REQUIRED', 'They are suspended. Let them back in first, then change what they reach.', { at: 'person' });

  /* THE LAST OWNER CANNOT BE MOVED DOWN, and this is the same check `remove` makes for the same
     reason: the state it prevents is one nobody inside the product can get out of. */
  const now = deps.sql.one<{ level: Level }>(
    'SELECT level FROM member WHERE person_id = ? AND register = ?',
    args.person,
    RECORD,
  )?.level;
  /* `counts()` LIKE THE OTHER TWO. `remove` and `suspend` were moved onto it and this was left
     reading the raw row, so with a ghost `'*' owner` and one real owner, `invite` refused to demote
     and `remove` allowed it — three methods, two answers about one row, which is the split the
     predicate was extracted to end. */
  if (counts(deps.sql, args.person) && args.level !== 'owner' && owners(deps.sql) <= 1)
    return no<Member>('LEVEL_REQUIRED', 'A BrainDog keeps one owner. Make somebody else an owner first.', { at: 'level' });

  const at = instant(deps.nowMs);
  /* A NEW ADDRESS IS NOT THE ONE THAT WAS REFUSED (RM9): Health's "didn't get the summary" line about them goes. */
  const before = deps.sql.one<{ email: string | null }>('SELECT email FROM person WHERE id = ?', args.person)?.email ?? null;
  if (typeof args.email === 'string' && args.email.trim() !== '' && before !== null && before.trim().toLowerCase() !== args.email.trim().toLowerCase())
    clearFault(deps.sql, missedCause(args.person), deps.nowMs);
  /* THE PERSON ROW IS A MIRROR AND IS WRITTEN WITHOUT OVERWRITING WHAT IT KNOWS. An invitation that
     carried no name would otherwise blank the name the Directory already had. */
  deps.sql.exec(
    `INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)
     ON CONFLICT (id) DO UPDATE SET email = COALESCE(excluded.email, person.email), name = COALESCE(excluded.name, person.name)`,
    args.person,
    args.email ?? null,
    args.name ?? null,
  );

  const wanted = new Map<string, Level>([
    ...(args.level === undefined ? [] : ([[RECORD, args.level]] as [string, Level][])),
    ...Object.entries(args.registers ?? {}),
  ]);
  /* A LEVEL LEFT OFF THE RECORD TAKES THE ROW WITH IT, for the same reason a register left out of
     the list does: an invitation is the whole of what somebody holds.

     THE LAST-OWNER CHECK THAT USED TO BE REPEATED HERE COULD NEVER FIRE. The guard above reads
     `args.level !== 'owner'`, and `undefined !== 'owner'` is true — so an invitation that leaves the
     record level off has already been refused by the time it reaches this branch. Two spellings of
     one rule, one of them unreachable, is how a rule ends up being changed in the copy that does
     nothing; a mutation run found it by disabling the dead one and watching every test stay green. */
  if (args.level === undefined && now !== undefined) {
    deps.sql.exec('DELETE FROM member WHERE person_id = ? AND register = ?', args.person, RECORD);
    event(deps, instant(deps.nowMs), by, 'access.revoke', args.person, RECORD, null, now, args.why ?? null);
  }
  for (const [register, level] of wanted) {
    const had = deps.sql.one<{ level: Level }>(
      'SELECT level FROM member WHERE person_id = ? AND register = ?',
      args.person,
      register,
    )?.level;
    if (had === level) continue;
    /**
     * THE READ MARK SURVIVES A LEVEL CHANGE, and `ON CONFLICT … SET level` is the whole of why.
     *
     * `45 §5.6` asks for *"keeping the old `'*'` row's `seen_at`"*, and a previous pass added a
     * fourth column to carry it across a delete — which was dead code for a defect that did not
     * exist: the `'*'` row is deleted only when `level` is absent, and in that branch `'*'` is not in
     * `wanted`, so the DELETE and this INSERT are mutually exclusive. The conflict path never touched
     * `seen_at` in the first place. A review proved it by reverting the carry and watching the test
     * written for it stay green.
     *
     * The requirement is real and the mechanism is this clause. It is stated here because the next
     * person to widen the `DO UPDATE SET` is the one who would break it.
     */
    deps.sql.exec(
      `INSERT INTO member (person_id, register, level) VALUES (?, ?, ?)
       ON CONFLICT (person_id, register) DO UPDATE SET level = excluded.level`,
      args.person,
      register,
      level,
    );
    event(deps, at, by, 'access.grant', args.person, register, level, had ?? null, args.why ?? null);
  }

  /**
   * A REGISTER LEFT OUT OF AN INVITATION IS A REGISTER TAKEN AWAY, and it is revoked out loud rather
   * than left standing. An invitation is the whole of what somebody holds, not a patch.
   *
   * AND "LEFT OUT" INCLUDES LEAVING THE KEY OFF ENTIRELY. This was guarded on `if (args.registers)`,
   * so `invite({ person, level: 'read' })` — an owner moving somebody down to read, which is the
   * ordinary thing this method is for — kept every scoped grant they held. Measured:
   * `{level:'read', registers:{payroll:'owner'}}` then `{level:'read'}` left `payroll: owner`
   * standing, while the identical call with `registers: {}` revoked it. Two spellings of the same
   * intention, opposite outcomes, and `packages/record/src/index.ts` types `registers` optional, so
   * every client that omits it takes the permissive one.
   *
   * `45 §5.6` is a full replacement in both cases: delete the rows, re-insert from what was sent.
   */
  {
    for (const row of deps.sql.all<{ register: string; level: Level }>(
      'SELECT register, level FROM member WHERE person_id = ? AND register <> ?',
      args.person,
      RECORD,
    ))
      if (!wanted.has(row.register)) {
        deps.sql.exec('DELETE FROM member WHERE person_id = ? AND register = ?', args.person, row.register);
        event(deps, at, by, 'access.revoke', args.person, row.register, null, row.level, args.why ?? null);
      }
  }

  /**
   * THE RULES ARE PART OF THE WHOLE, SO A LIST SENT WITHOUT ONE IS EVERY ROW AGAIN, and each change is said out loud:
   * `access.grant` when a list is narrowed or its rule changes, `access.revoke` when a rule is taken off, with
   * `field: '<list>#where'` and the rule's JSON text either side. A rule is a grant of rows, so its history is read
   * where every other grant's is.
   *
   * A LIST TAKEN AWAY ABOVE TOOK ITS RULE WITH ITS ROW, and that list's own `access.revoke` already says so.
   */
  for (const register of wanted.keys()) {
    if (register === RECORD) continue;
    const had =
      deps.sql.one<{ row_where: string | null }>(
        'SELECT row_where FROM member WHERE person_id = ? AND register = ?',
        args.person,
        register,
      )?.row_where ?? null;
    const rule = rules.value.get(register) ?? null;
    if (had === rule) continue;
    deps.sql.exec('UPDATE member SET row_where = ? WHERE person_id = ? AND register = ?', rule, args.person, register);
    event(deps, at, by, rule === null ? 'access.revoke' : 'access.grant', args.person, `${register}#where`, rule, had, args.why ?? null);
  }

  return ok(members(deps.sql).find((m) => m.person_id === args.person)!);
}

/**
 * The rules an invitation sends, as the JSON text each list's grant will hold, or the refusal for the first that
 * cannot be held.
 *
 * A RULE NARROWS A LIST THE SAME INVITATION GIVES, and nothing else: a rule on the whole record, or on a list the person
 * is not being given, would be a rule on a grant that does not exist. `at` is the path into what the caller sent, as
 * the register checks above write it.
 */
function rulesOf(deps: MemberDeps, args: { registers?: Record<string, Level>; wheres?: Wheres }): Result<Map<string, string>> {
  const out = new Map<string, string>();
  if (args.wheres === undefined) return ok(out);
  if (args.wheres === null || typeof args.wheres !== 'object' || Array.isArray(args.wheres))
    return no('VALUE_MALFORMED', 'The rules are a map from a list to the rows of it somebody reaches.', { at: 'wheres' });
  for (const [register, where] of Object.entries(args.wheres)) {
    const at = `wheres.${register}`;
    if (!Object.hasOwn(args.registers ?? {}, register))
      return no('VALUE_MALFORMED', `A rule narrows a list somebody is given. Give them ${register} first.`, { at });
    if (typeof where !== 'string' && (where === null || typeof where !== 'object' || Array.isArray(where)))
      return no('VALUE_MALFORMED', 'A rule is a where: a sentence, or the conditions a filter holds.', { at });
    const text = JSON.stringify(where);
    if (text.length > WHERE_MAX_CHARS)
      return no('OUT_OF_BOUNDS', `A rule is at most ${WHERE_MAX_CHARS} characters, and this one is ${text.length}.`, { at });
    const bad = deps.readsRule?.(register, where) ?? null;
    if (bad) return { ok: false, refusal: { ...bad, at } };
    out.set(register, text);
  }
  return ok(out);
}

/**
 * Take somebody off.
 *
 * NEVER THE LAST OWNER, and the refusal says what to do instead. Removing somebody who is not there
 * is not an error: it is the state they asked for.
 */
export function remove(deps: MemberDeps, by: string, person: string, why?: string): Result<null> {
  const rows = deps.sql.all<{ register: string; level: Level }>(
    'SELECT register, level FROM member WHERE person_id = ?',
    person,
  );
  if (rows.length === 0) return ok(null);

  /* AND IT ASKS `owners()` WHETHER THEY COUNT, rather than reading the raw row. The row says
     `'*' owner`; `owners()` counts only owners whose person is not suspended — so a SUSPENDED owner
     was treated as the last one and could not be taken off, with a working owner sitting beside
     them. Suspension is "stop somebody without deciding about them", and the deciding was refused. */
  if (counts(deps.sql, person) && owners(deps.sql) <= 1)
    return no<null>('LEVEL_REQUIRED', 'A BrainDog keeps one owner. Make somebody else an owner first.', { at: 'person' });

  const at = instant(deps.nowMs);
  for (const row of rows) event(deps, at, by, 'access.revoke', person, row.register, null, row.level, why ?? null);
  deps.sql.exec('DELETE FROM member WHERE person_id = ?', person);
  /* AND HEALTH STOPS SAYING THEY MISSED A MAIL (RM9): no more is sent them, so none would ever clear it. */
  clearFault(deps.sql, missedCause(person), deps.nowMs);
  /* THE PERSON ROW STAYS. Every event they ever wrote names them, and a history whose actors cannot
     be resolved is a history that reads as a list of identifiers. */
  return ok(null);
}

/**
 * Stop somebody without deciding about them.
 *
 * THE COLUMN EXISTED AND NOTHING COULD SET IT. `person.suspended_at` was written as `NULL` by
 * `invite` and by provisioning and by nothing else, so suspension was a word the interface could
 * show — and once the ladder learned to read it, a check behind a switch nobody could flip.
 *
 * IT IS NOT `remove`, AND THAT IS THE POINT. Removal deletes the membership and the levels with it,
 * so restoring somebody means re-inviting them and remembering what they held; suspension keeps
 * every row and stops every one of them working. It is what you reach for when somebody has left
 * for a fortnight, or when you are not yet sure, and the alternative to having it is that people use
 * `remove` for both and lose the second half.
 *
 * THE LAST OWNER CANNOT BE SUSPENDED, for the reason they cannot be removed: a record with nobody
 * who can decide is a record nobody can un-suspend them from.
 *
 * IT ANSWERS WHERE THE PERSON NOW STANDS, `{ person, suspended_at }` (`suspendMember`), so People can draw "stopped"
 * from the answer instead of reading every member again, and a retried call learns the instant the first one wrote
 * rather than a bare yes.
 */
export function suspend(deps: MemberDeps, by: string, person: string, on: boolean, why?: string): Result<Suspended> {
  const row = deps.sql.one<{ id: string; suspended_at: string | null }>(
    'SELECT id, suspended_at FROM person WHERE id = ?',
    person,
  );
  if (!row) return no<Suspended>('OUT_OF_BOUNDS', `There is nobody called ${person} here.`, { at: 'person' });

  const held = deps.sql.all<{ register: string; level: Level }>('SELECT register, level FROM member WHERE person_id = ?', person);
  if (on && counts(deps.sql, person) && owners(deps.sql) <= 1)
    return no<Suspended>('LEVEL_REQUIRED', 'A BrainDog keeps one owner who can act. Make somebody else an owner first.', { at: 'person' });

  /* THE SECOND CALL SAYS WHAT THE FIRST SAID. Suspending somebody already suspended is not an error,
     and answering one is how a caller that lost its reply learns to be afraid of retrying. */
  if (Boolean(row.suspended_at) === on) return ok({ person, suspended_at: row.suspended_at });

  const at = instant(deps.nowMs);
  deps.sql.exec('UPDATE person SET suspended_at = ? WHERE id = ?', on ? at : null, person);
  /**
   * ON THE LEDGER AS AN ACCESS CHANGE, because that is what it is: every level they hold stops
   * working, and somebody reading the history in six weeks needs to see the moment it happened.
   *
   * ONE EVENT PER REGISTER, the same as `remove` — and this wrote ONE, about `'*'`, with the level
   * defaulted to `'read'` when there was no `'*'` row. That default is the exact wrong reading this
   * file's header condemns twice: suspending a bookkeeper who holds nothing on the record and `read`
   * on two lists recorded `access.revoke · * · read`, a record-wide level she never had, and said
   * nothing about the two grants that actually stopped. The audit answered *what were they holding
   * when you stopped them* with a fabrication.
   *
   * Suspension stops every row, so it says so per row. Un-suspending gives every row back and says
   * that per row too — the two have to be readable as each other's inverse or the history cannot be
   * replayed.
   */
  for (const row of held)
    event(deps, at, by, on ? 'access.revoke' : 'access.grant', person, row.register, on ? null : row.level, on ? row.level : null, why ?? null);
  return ok({ person, suspended_at: on ? at : null });
}

/**
 * The account side of a stop, carried into this record: the operator stopping a person, or the person closing their
 * account. The host calls it once for every record the person is on, because each record reads its own `person` row and
 * no bearer door asks the Directory (`leaving-ends-bearers.test.ts`).
 *
 * NOT `suspend`, WHICH REFUSES THE LAST OWNER. That refusal keeps a record with somebody who can decide, for a stop one
 * of its owners chose. An account stopped or closed is stopped everywhere, and leaving a key working on the one record
 * nobody else owns would be the worst place to leave it.
 *
 * THE STAMP SAYS WHOSE STOP THIS IS. A stop writes the operator's instant only over a person nobody has stopped, and
 * lifting clears only that same instant, so letting somebody back in never lifts an owner's own stop of them.
 *
 * `closing` ALSO ENDS WHAT THEY HOLD HERE. The person is gone from sign-in and an owner may still lift a stop, so their
 * keys and the machines they let in go now, rather than waiting on a column somebody else can clear. The `member` row and
 * the `person` row stay, as `remove` keeps a person: the record's history still names them.
 */
export function accountStop(deps: MemberDeps, person: string, stamp: string, on: boolean, closing: boolean): boolean {
  const at = instant(deps.nowMs);
  const was = deps.sql.one<{ suspended_at: string | null }>('SELECT suspended_at FROM person WHERE id = ?', person);
  let moved = false;
  if (was && (on ? was.suspended_at === null : was.suspended_at === stamp)) {
    deps.sql.exec('UPDATE person SET suspended_at = ? WHERE id = ?', on ? stamp : null, person);
    moved = true;
    for (const row of deps.sql.all<{ register: string; level: Level }>('SELECT register, level FROM member WHERE person_id = ?', person))
      event(deps, at, ACCOUNT_STOP_BY, on ? 'access.revoke' : 'access.grant', person, row.register, on ? null : row.level, on ? row.level : null, null);
  }
  if (closing) {
    const keys = deps.sql.all<{ id: string }>('SELECT id FROM token WHERE person_id = ? AND revoked_at IS NULL', person);
    for (const key of keys) {
      deps.sql.exec('UPDATE token SET revoked_at = ? WHERE id = ?', at, key.id);
      deps.sql.exec('UPDATE token SET revoked_at = ? WHERE revoked_at IS NULL AND id IN (SELECT token_id FROM token_lens WHERE parent_id = ?)', at, key.id);
    }
    deps.sql.exec("UPDATE device_grant SET status = 'revoked' WHERE approved_by = ? AND status IN ('approved', 'active')", person);
    moved = moved || keys.length > 0;
  }
  return moved;
}

/** Who the ledger names for `accountStop`: no person on the record decided it. */
const ACCOUNT_STOP_BY = 'system:account';

/** What `suspend` answers: the person, and the instant they were stopped, or `null` while they are not. */
export type Suspended = { person: string; suspended_at: string | null };

/**
 * What a stopped member is told at every door that turns them away, word for word on both hosts.
 *
 * ONE SENTENCE, AND IT SAYS WHAT HAPPENED. `access` answers `null` for a stopped person as it does for a stranger, so each
 * door said its own words for "not on this record": the Worker "You are not on this record.", the self-host "This
 * credential does not reach this record.". Neither is true of somebody an owner has stopped for a fortnight, and both
 * send them looking for a fault in their sign-in. Their rows are kept, so the sentence says what brings them back.
 */
export const STOPPED = 'An owner has stopped your access for now. Ask them to let you back in.';

/**
 * Whether this person is on the record and stopped: a `member` row, and a `person` row whose `suspended_at` is set.
 *
 * ASKED ONLY AFTER `access` HAS ANSWERED `null`, to choose between `STOPPED` and a door's own sentence. It gives nobody
 * anything: a stopped person is refused either way, and the question is only which words they read. Somebody removed
 * and then stopped holds no `member` row, is not on the record, and reads the door's own sentence.
 */
export const stopped = (sql: Sql, person: string): boolean =>
  (sql.one<{ n: number }>(
    `SELECT count(*) AS n FROM member m JOIN person p ON p.id = m.person_id
      WHERE m.person_id = ? AND p.suspended_at IS NOT NULL`,
    person,
  )?.n ?? 0) > 0;

/**
 * How many owners can actually act.
 *
 * SUSPENDED IS NOT AN OWNER, and counting them was a way to leave a record with none. Suspension
 * never deletes the `member` row, so with two owners both suspensions passed the last-owner guard
 * one at a time — and the record then had two owner rows, neither of whom may do anything. Every
 * route answered 403 with a sentence about the caller's credential, nobody left could call
 * `suspendMember` to lift it, and `import` refuses a record that is not empty: there was no way back
 * in short of raw SQL on the file.
 *
 * IT IS THE SAME PREDICATE `ownerId()` USES, which is the point: the question "is there an owner"
 * has to have one answer, or the guard protects a different thing from the one that reads it.
 */
/**
 * Is this person one of the owners `owners()` is counting?
 *
 * (The block below belongs to `owners()`. It was moved above this one when `counts()` was added, so
 * the most load-bearing comment in the file documented nothing and `owners()` had none — TypeScript
 * attaches only the nearer block.)
 *
 * THE GUARD AND THE COUNT HAVE TO ASK ONE QUESTION. `remove` and `suspend` read the raw `member` row
 * — `register === '*' && level === 'owner'` — while `owners()` joins `person` and skips the suspended
 * and the missing. So a suspended owner was the last owner to the guard and not an owner to the
 * count, and could neither be removed nor un-suspended by removal; and a ghost row was an owner to
 * the guard and invisible to the count, which is how a record with one real owner refused to let
 * that owner go.
 */
const counts = (sql: Sql, person: string): boolean =>
  (sql.one<{ n: number }>(
    `SELECT count(*) AS n FROM member m JOIN person p ON p.id = m.person_id
      WHERE m.person_id = ? AND m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL`,
    person,
  )?.n ?? 0) > 0;

const owners = (sql: Sql): number =>
  Number(
    sql.one<{ n: number }>(
      `SELECT count(*) AS n FROM member m JOIN person p ON p.id = m.person_id
        WHERE m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL`,
    )?.n ?? 0,
  );

/**
 * One access change, on the ledger — with the two columns it used to leave empty.
 *
 * `from_v` AND `note`, BOTH SPECIFIED AND NEITHER WRITTEN. `45 §5.6` gives the row as *"`from_v` =
 * old level or NULL, `to_v` = new level or NULL, `note = why`"*, and this wrote `to_v` alone. What
 * that cost is the whole value of the table: **every access change in this record was
 * unattributed** — the audit said who was granted what and never why, on the one table whose
 * entries are decisions about other people, and it could not say what they were moved FROM either,
 * so a raise and a drop read identically.
 *
 * `null` IS A REAL VALUE FOR `from_v` and means *they held nothing here*, which is different from a
 * grant that lowered something. The column is nullable for exactly that.
 */
/**
 * The one event a level change writes — and three documents gave it three shapes.
 *
 * `45 §5.6` is the method's own specification and the most precise: *"`target` = person id,
 * `target_kind 'member'`, `field` = register, `from_v` = old level or NULL, `to_v` = new level or
 * NULL, `note = why`"*. `20 §1` says `{ person, register }` in `target`. This wrote
 * `target = 'person:<id>'` with `target_kind = 'person'`.
 *
 * `45 §5.6` WINS, AND IT IS RIGHT ON THE MERITS. The row being changed is a `member` row, not a
 * person — the person is unchanged; what moved is what they hold over one register. `target_kind`
 * names the table, `target` names the row it hangs off, and `field` names the register: three
 * columns the DDL already has, doing what they are for. `20 §1`'s pair packs two of them into one
 * string and leaves `event_target`'s index nothing to seek on. **`20 §1` is amended to agree**, in
 * the same revision, the way `36 §5.5` was: a corpus with two shapes for one event is a corpus
 * where the next reader picks one at random.
 */
function event(
  deps: MemberDeps,
  at: string,
  by: string,
  kind: 'access.grant' | 'access.revoke',
  person: string,
  register: string,
  level: string | null,
  was: string | null = null,
  why: string | null = null,
): void {
  deps.sql.exec(
    'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    deps.mint(),
    at,
    by,
    kind,
    person,
    'member',
    register,
    was,
    level,
    why,
  );
}
