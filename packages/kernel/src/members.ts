/**
 * Who is on this record, and what each of them may reach.
 *
 * THE ROWS HERE ARE A MIRROR. The Directory holds who somebody is across every record they touch;
 * this holds what they may do inside THIS one, so a `.dog` file resolves its own actors offline and
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

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './migrate.ts';

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
  seen_at: string | null;
  suspended_at: string | null;
};

export type MemberDeps = {
  sql: Sql;
  nowMs: number;
  mint: () => string;
  hasRegister: (register: string) => boolean;
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
 */
export function access(
  sql: Sql,
  person: string,
): { level: Level | null; registers: string[] | null; levels: Record<string, Level> } | null {
  /* A SUSPENDED PERSON HOLDS NOTHING, and until now the column was a thing the interface could show
     and the ladder could not enforce: `access` read only `member`, `verifyToken` joined nothing, and
     a suspension was a label. Suspending somebody is what you do when you cannot yet decide whether
     to remove them, and it has to actually stop them while you decide.

     THE JOIN, not two queries: a person row that disappeared between them is a person whose access
     was computed from half a record. */
  const rows = sql.all<{ register: string; level: Level }>(
    `SELECT m.register AS register, m.level AS level FROM member m
     WHERE m.person_id = ?
       AND NOT EXISTS (SELECT 1 FROM person p WHERE p.id = m.person_id AND p.suspended_at IS NOT NULL)`,
    person,
  );
  const whole = rows.find((r) => r.register === RECORD);
  const scoped = rows.filter((r) => r.register !== RECORD);
  if (!whole && scoped.length === 0) return null;

  /* SOMEBODY WITH ONLY SCOPED ROWS HOLDS `read` ON THE RECORD ITSELF, and nothing more.

     THIS PROMOTED THE HIGHEST SCOPED LEVEL TO THE RECORD-WIDE ONE, which is the wrong direction and
     the expensive one: `invite({ registers: { payroll: 'owner' } })` is accepted, and the caller
     then held `level: 'owner'` — which is what `vault()` and `admin()` read, and neither of them
     consults the ceiling, because ADMIN and VAULT are not about a register. Owner of one register
     was owner of the record: the credential index, the export, `invite`, `createToken`,
     `setDeclaration`. 45 §5.1 is explicit that for VAULT and ADMIN *"the `'*'` level must be
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
  return {
    level,
    registers: whole ? null : scoped.map((r) => r.register),
    levels: Object.fromEntries(scoped.map((r) => [r.register, r.level])),
  };
}

/** Everybody on the record, with what they hold and where. */
export function members(sql: Sql): Member[] {
  const rows = sql.all<{ person_id: string; register: string; level: Level; seen_at: string | null }>(
    'SELECT person_id, register, level, seen_at FROM member ORDER BY person_id, register',
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
    const held =
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

    if (row.register === RECORD) {
      held.level = row.level;
      held.seen_at = row.seen_at;
    } else held.scoped.push({ register: row.register, level: row.level });
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
  args: { person: string; email?: string; name?: string; level?: Level; registers?: Record<string, Level> },
): Result<Member> {
  if (!args?.person) return no<Member>('REQUIRED_MISSING', 'Who?', { at: 'person' });
  /* A LEVEL ON THE RECORD IS OPTIONAL, and leaving it out is how somebody is invited to ONE
     register and nothing else — which is the whole of what "invite the bookkeeper" means. What is
     not optional is holding SOMETHING: an invitation to nothing is not an invitation. */
  if (args.level !== undefined && !(LEVELS as readonly string[]).includes(args.level))
    return no<Member>('ENUM_VALUE_UNKNOWN', `${String(args.level)} is not a level.`, { at: 'level', allowed: LEVELS });
  if (args.level === undefined && Object.keys(args.registers ?? {}).length === 0)
    return no<Member>('REQUIRED_MISSING', 'An invitation says what somebody may reach, on the record or on a register.', {
      at: 'level',
    });

  for (const [register, level] of Object.entries(args.registers ?? {})) {
    if (!deps.hasRegister(register))
      return no<Member>('REGISTER_UNKNOWN', `There is no register called ${register}.`, { at: register });
    if (!(LEVELS as readonly string[]).includes(level))
      return no<Member>('ENUM_VALUE_UNKNOWN', `${String(level)} is not a level.`, { at: register, allowed: LEVELS });
  }

  /* THE LAST OWNER CANNOT BE MOVED DOWN, and this is the same check `remove` makes for the same
     reason: the state it prevents is one nobody inside the product can get out of. */
  const now = deps.sql.one<{ level: Level }>(
    'SELECT level FROM member WHERE person_id = ? AND register = ?',
    args.person,
    RECORD,
  )?.level;
  if (now === 'owner' && args.level !== 'owner' && owners(deps.sql) <= 1)
    return no<Member>('LEVEL_REQUIRED', 'A record keeps one owner. Make somebody else an owner first.', { at: 'level' });

  const at = instant(deps.nowMs);
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
     the list does: an invitation is the whole of what somebody holds. */
  if (args.level === undefined && now !== undefined) {
    if (now === 'owner' && owners(deps.sql) <= 1)
      return no<Member>('LEVEL_REQUIRED', 'A record keeps one owner. Make somebody else an owner first.', { at: 'level' });
    deps.sql.exec('DELETE FROM member WHERE person_id = ? AND register = ?', args.person, RECORD);
    event(deps, instant(deps.nowMs), by, 'access.revoke', args.person, RECORD, now);
  }
  for (const [register, level] of wanted) {
    const had = deps.sql.one<{ level: Level }>(
      'SELECT level FROM member WHERE person_id = ? AND register = ?',
      args.person,
      register,
    )?.level;
    if (had === level) continue;
    deps.sql.exec(
      `INSERT INTO member (person_id, register, level) VALUES (?, ?, ?)
       ON CONFLICT (person_id, register) DO UPDATE SET level = excluded.level`,
      args.person,
      register,
      level,
    );
    event(deps, at, by, 'access.grant', args.person, register, level);
  }

  /* A REGISTER LEFT OUT OF A SECOND INVITATION IS A REGISTER TAKEN AWAY, and it is revoked out loud
     rather than left standing. An invitation is the whole of what somebody holds, not a patch. */
  if (args.registers)
    for (const row of deps.sql.all<{ register: string; level: Level }>(
      'SELECT register, level FROM member WHERE person_id = ? AND register <> ?',
      args.person,
      RECORD,
    ))
      if (!wanted.has(row.register)) {
        deps.sql.exec('DELETE FROM member WHERE person_id = ? AND register = ?', args.person, row.register);
        event(deps, at, by, 'access.revoke', args.person, row.register, row.level);
      }

  return ok(members(deps.sql).find((m) => m.person_id === args.person)!);
}

/**
 * Take somebody off.
 *
 * NEVER THE LAST OWNER, and the refusal says what to do instead. Removing somebody who is not there
 * is not an error: it is the state they asked for.
 */
export function remove(deps: MemberDeps, by: string, person: string): Result<null> {
  const rows = deps.sql.all<{ register: string; level: Level }>(
    'SELECT register, level FROM member WHERE person_id = ?',
    person,
  );
  if (rows.length === 0) return ok(null);

  if (rows.some((r) => r.register === RECORD && r.level === 'owner') && owners(deps.sql) <= 1)
    return no<null>('LEVEL_REQUIRED', 'A record keeps one owner. Make somebody else an owner first.', { at: 'person' });

  const at = instant(deps.nowMs);
  for (const row of rows) event(deps, at, by, 'access.revoke', person, row.register, row.level);
  deps.sql.exec('DELETE FROM member WHERE person_id = ?', person);
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
 */
export function suspend(deps: MemberDeps, by: string, person: string, on: boolean): Result<null> {
  const row = deps.sql.one<{ id: string; suspended_at: string | null }>(
    'SELECT id, suspended_at FROM person WHERE id = ?',
    person,
  );
  if (!row) return no<null>('OUT_OF_BOUNDS', `There is nobody called ${person} in this record.`, { at: 'person' });

  const held = deps.sql.all<{ register: string; level: Level }>('SELECT register, level FROM member WHERE person_id = ?', person);
  if (on && held.some((r) => r.register === RECORD && r.level === 'owner') && owners(deps.sql) <= 1)
    return no<null>('LEVEL_REQUIRED', 'A record keeps one owner who can act. Make somebody else an owner first.', { at: 'person' });

  /* THE SECOND CALL SAYS WHAT THE FIRST SAID. Suspending somebody already suspended is not an error,
     and answering one is how a caller that lost its reply learns to be afraid of retrying. */
  if (Boolean(row.suspended_at) === on) return ok(null);

  const at = instant(deps.nowMs);
  deps.sql.exec('UPDATE person SET suspended_at = ? WHERE id = ?', on ? at : null, person);
  /* ON THE LEDGER AS AN ACCESS CHANGE, because that is what it is: every level they hold stops
     working, and somebody reading the history in six weeks needs to see the moment it happened. */
  event(deps, at, by, on ? 'access.revoke' : 'access.grant', person, RECORD, (held.find((r) => r.register === RECORD)?.level ?? 'read') as Level);
  return ok(null);
}

/**
 * How many owners can actually act.
 *
 * SUSPENDED IS NOT AN OWNER, and counting them was a way to leave a record with none. Suspension
 * never deletes the `member` row, so with two owners both suspensions passed the last-owner guard
 * one at a time — and the record then had two owner rows, neither of whom may do anything. Every
 * route answered 403 with a sentence about the caller's credential, `suspendMember` is not in the
 * route table, and `import` refuses a record that is not empty: there was no way back in short of
 * raw SQL on the file.
 *
 * IT IS THE SAME PREDICATE `ownerId()` USES, which is the point: the question "is there an owner"
 * has to have one answer, or the guard protects a different thing from the one that reads it.
 */
const owners = (sql: Sql): number =>
  Number(
    sql.one<{ n: number }>(
      `SELECT count(*) AS n FROM member m JOIN person p ON p.id = m.person_id
        WHERE m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL`,
    )?.n ?? 0,
  );

function event(
  deps: MemberDeps,
  at: string,
  by: string,
  kind: 'access.grant' | 'access.revoke',
  person: string,
  register: string,
  level: Level,
): void {
  deps.sql.exec(
    'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    deps.mint(),
    at,
    by,
    kind,
    `person:${person}`,
    'person',
    register,
    level,
  );
}
