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
  /** What they hold on the record as a whole. */
  level: Level;
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
        level: 'read',
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
  args: { person: string; email?: string; name?: string; level: Level; registers?: Record<string, Level> },
): Result<Member> {
  if (!args?.person) return no<Member>('REQUIRED_MISSING', 'Who?', { at: 'person' });
  if (!(LEVELS as readonly string[]).includes(args.level))
    return no<Member>('ENUM_VALUE_UNKNOWN', `${String(args.level)} is not a level.`, { at: 'level', allowed: LEVELS });

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

  const wanted = new Map<string, Level>([[RECORD, args.level], ...Object.entries(args.registers ?? {})]);
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

const owners = (sql: Sql): number =>
  Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM member WHERE register = '*' AND level = 'owner'")?.n ?? 0);

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
