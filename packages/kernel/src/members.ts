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
     was computed from half a record.

     AND IT FAILED OPEN ON EXACTLY THAT CASE. The predicate was
     `NOT EXISTS (… p.id = m.person_id AND p.suspended_at IS NOT NULL)` — which, with no `person`
     row at all, has nothing to find, so `NOT EXISTS` is true and every `member` row came back. A
     `member` row whose person is missing made its holder whatever level that row said, and the
     comment above claimed to be about that case.

     Measured: a record carrying `member('p_ghost', '*', 'owner')` and no `person('p_ghost')` gave
     `access('p_ghost') → owner` — the vault, the export, `invite`. `owners()` DOES join `person`, so
     it did not count the ghost: `suspend` answered `OUT_OF_BOUNDS`, `remove` answered
     `LEVEL_REQUIRED`, and demoting the real owner was refused because the ghost was invisible to the
     count and visible to the ladder. That is the state `owners()`'s own comment says there is *"no
     way back in short of raw SQL on the file"* from, reached from a `.dog` import.

     An `INNER JOIN` is the fix and it is the shape the sentence above always described: a level
     belongs to a person, so no person is no level. */
  const rows = sql.all<{ register: string; level: Level }>(
    `SELECT m.register AS register, m.level AS level
       FROM member m JOIN person p ON p.id = m.person_id
      WHERE m.person_id = ? AND p.suspended_at IS NULL`,
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

/**
 * Everybody on the record, with what they hold and where.
 *
 * IT JOINS `person` FOR THE SAME REASON `access()` DOES. A `member` row whose person is missing was
 * listed as an active owner with a `null` name — so after the fail-open in `access()` was closed, the
 * two disagreed: the ladder said the ghost held nothing and the People screen drew it holding
 * everything. That is the pair the fix was about, relocated one function over.
 */
export function members(sql: Sql): Member[] {
  const rows = sql.all<{ person_id: string; register: string; level: Level; seen_at: string | null }>(
    `SELECT m.person_id AS person_id, m.register AS register, m.level AS level, m.seen_at AS seen_at
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
  args: { person: string; email?: string; name?: string; level?: Level; registers?: Record<string, Level>; why?: string },
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

  return ok(members(deps.sql).find((m) => m.person_id === args.person)!);
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
    return no<null>('LEVEL_REQUIRED', 'A record keeps one owner. Make somebody else an owner first.', { at: 'person' });

  const at = instant(deps.nowMs);
  for (const row of rows) event(deps, at, by, 'access.revoke', person, row.register, null, row.level, why ?? null);
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
export function suspend(deps: MemberDeps, by: string, person: string, on: boolean, why?: string): Result<null> {
  const row = deps.sql.one<{ id: string; suspended_at: string | null }>(
    'SELECT id, suspended_at FROM person WHERE id = ?',
    person,
  );
  if (!row) return no<null>('OUT_OF_BOUNDS', `There is nobody called ${person} in this record.`, { at: 'person' });

  const held = deps.sql.all<{ register: string; level: Level }>('SELECT register, level FROM member WHERE person_id = ?', person);
  if (on && counts(deps.sql, person) && owners(deps.sql) <= 1)
    return no<null>('LEVEL_REQUIRED', 'A record keeps one owner who can act. Make somebody else an owner first.', { at: 'person' });

  /* THE SECOND CALL SAYS WHAT THE FIRST SAID. Suspending somebody already suspended is not an error,
     and answering one is how a caller that lost its reply learns to be afraid of retrying. */
  if (Boolean(row.suspended_at) === on) return ok(null);

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
  level: Level | null,
  was: Level | null = null,
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
