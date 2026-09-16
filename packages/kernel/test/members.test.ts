/**
 * Who is on this record, and what each of them may reach — the module that had no test.
 *
 * `members.ts` is where the five-level ladder lives, and it is the only thing standing between an
 * invitation and somebody seeing the whole record. `access()` is what `guard()` reads on every call;
 * `invite()` is the one method behind grant, raise, lower and remove; `remove()` and `suspend()`
 * both carry the last-owner guard, which prevents a state nobody inside the product can get out of.
 * **None of it was covered anywhere.** `45 §9` names the coverage it should have had —
 * *"`invite` → `member` rows and one `access.grant` per register, `access.revoke` on removal, last
 * owner → `LEVEL_REQUIRED`"* — under `test/admin.test.ts`, a file that does not exist.
 *
 * The file's own comments record three wrong answers this code has already shipped, each of which is
 * an authorisation defect and each of which is a test below:
 *
 *   1. `access()` promoted the highest SCOPED level to the record-wide one, so
 *      `invite({ registers: { payroll: 'owner' } })` made somebody an owner of the record — the
 *      vault, the export, `invite` itself.
 *   2. Then it gave a scoped-only member `read` on the record, which hands an APPENDER a record-wide
 *      read: `append`'s entire point is that it does not read, and every method naming no register
 *      asks `guard(ctx, 'read')` with nothing to scope it.
 *   3. `suspended_at` was a column the interface could show and the ladder could not enforce, so a
 *      suspension was a label.
 *
 * A defect that has been fixed twice in opposite directions is a defect with no test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { access, invite, members, remove, suspend, LEVELS, RECORD, type Level, type MemberDeps } from '../src/members.ts';
import { createToken, verifyToken, type TokenDeps } from '../src/token.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const reg = (id: string, name: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: {
    id,
    name,
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true }],
  } as never,
});

/** Two registers, so "held to one of them" is a thing that can be said. */
async function record(): Promise<{ k: Kernel; sql: NodeSql; deps: MemberDeps }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([reg('obligations', 'Obligations'), reg('payroll', 'Payroll')])).ok);
  let n = 0;
  const deps: MemberDeps = {
    sql,
    nowMs: NOW,
    mint: () => `e_${(n += 1).toString().padStart(4, '0')}`,
    hasRegister: (id) => id === 'obligations' || id === 'payroll',
  };
  return { k, sql, deps };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

const events = (sql: NodeSql) =>
  sql.all<{ kind: string; target: string; target_kind: string; field: string; from_v: string | null; to_v: string | null; note: string | null; actor: string }>(
    "SELECT kind, target, target_kind, field, from_v, to_v, note, actor FROM event WHERE kind LIKE 'access.%' ORDER BY id",
  );

/** An owner who is not the person under test, so the last-owner guard is not what is being measured. */
const withSpare = async () => {
  const held = await record();
  assert.ok(value(invite(held.deps, 'system', { person: 'p_root', email: 'root@example.test', level: 'owner' })));
  return held;
};

/* ── the ladder is five, and it is the same five everywhere ───────────────── */

test('the five levels are the five, in order, and there is no sixth', () => {
  assert.deepEqual([...LEVELS], ['read', 'append', 'write', 'decide', 'owner']);
  assert.equal(RECORD, '*');
});

/* ── `'*'` fills every register, and a register row overrides it ──────────── */

test('A RECORD-WIDE LEVEL COVERS EVERY REGISTER, INCLUDING ONES ADDED LATER', async () => {
  /* `45 §5.1` step 3: *"the `'*'` row fills every register without its own row."* `registers: null`
     is how that is said — the ceiling is not a list, so nothing has to be re-granted when a pack
     installs a register tomorrow. */
  const { sql, deps } = await record();
  value(invite(deps, 'system', { person: 'p_a', email: 'a@example.test', level: 'write' }));
  const held = access(sql, 'p_a')!;
  assert.equal(held.level, 'write');
  assert.equal(held.registers, null, 'a record-wide level was turned into a list of the registers that exist today');
  assert.deepEqual(held.levels, {});
});

test('AND A REGISTER ROW OVERRIDES IT IN BOTH DIRECTIONS', async () => {
  /**
   * The sentence the whole feature is for, from the module's own header: *"Somebody can be an owner
   * of the record and hold nothing more than `read` on the one register that carries the payroll —
   * because the alternative is a product where inviting a bookkeeper means showing them everything,
   * and what people do then is not invite the bookkeeper."*
   *
   * Both directions, because a scoped level that could only narrow would make the other half —
   * `read` on the record, `write` on one register — impossible.
   */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'owner', registers: { payroll: 'read' } }));
  const down = access(sql, 'p_a')!;
  assert.equal(down.level, 'owner');
  assert.equal(down.registers, null);
  assert.equal(down.levels.payroll, 'read', 'the owner was not held to `read` on the payroll');

  value(invite(deps, 'p_root', { person: 'p_b', email: 'b@example.test', level: 'read', registers: { obligations: 'write' } }));
  const up = access(sql, 'p_b')!;
  assert.equal(up.level, 'read');
  assert.equal(up.levels.obligations, 'write', 'a scoped level could only narrow');
});

test('SOMEBODY WITH ONLY SCOPED ROWS HOLDS NOTHING ON THE RECORD', async () => {
  /**
   * Two defects, in opposite directions, both shipped.
   *
   * It PROMOTED the highest scoped level: `invite({ registers: { payroll: 'owner' } })` produced
   * `level: 'owner'` — which is what `vault()` and `admin()` read, and neither consults the ceiling
   * because ADMIN and VAULT are not about a register. Owner of one register was owner of the record:
   * the credential index, the export, `invite`, `createToken`, `setDeclaration`.
   *
   * The fix then gave them `read`, which hands an APPENDER a record-wide read — and `append`'s whole
   * point is that it does not read. Every method naming no register asks `guard(ctx, 'read')` with
   * nothing to scope it, so a contractor invited to file expenses could see the register list and
   * search across it.
   *
   * `null` is the only honest answer, and it is not the same as `read`.
   */
  const { sql, deps } = await record();
  value(invite(deps, 'system', { person: 'p_a', email: 'a@example.test', registers: { payroll: 'owner' } }));
  const held = access(sql, 'p_a')!;
  assert.equal(held.level, null, 'a scoped grant became a record-wide level');
  assert.deepEqual(held.registers, ['payroll'], 'the ceiling is not the registers they were given');
  assert.equal(held.levels.payroll, 'owner');

  value(invite(deps, 'system', { person: 'p_b', email: 'b@example.test', registers: { obligations: 'append' } }));
  assert.equal(access(sql, 'p_b')!.level, null, 'an appender was given a record-wide read');
});

test('and somebody who is not on the record at all is `null`, not an empty ceiling', async () => {
  /* `null` means *not a member*; a member with an empty ceiling means *a member who reaches
     nothing*. A caller that cannot tell them apart lets a stranger through the first check. */
  const { sql } = await record();
  assert.equal(access(sql, 'p_nobody'), null);
});

/* ── the ways it failed OPEN ──────────────────────────────────────────────── */

test('A `member` ROW WITH NO PERSON IS NOT A LEVEL', async () => {
  /**
   * `access()` filtered with `NOT EXISTS (… p.suspended_at IS NOT NULL)`, which with no `person` row
   * finds nothing and is therefore TRUE — so every row came back and a `member('p_ghost','*','owner')`
   * with no person made its holder an owner of the record: the vault, the export, `invite`.
   *
   * And the record could not be got out of it. `owners()` DOES join `person`, so it did not count
   * the ghost — `suspend` answered `OUT_OF_BOUNDS`, `remove` answered `LEVEL_REQUIRED`, and demoting
   * the real owner was refused because the ghost was invisible to the count and visible to the
   * ladder. Reachable from a `.brain` import carrying `member` without `person`.
   */
  const { sql, deps } = await withSpare();
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_ghost', '*', 'owner')");
  assert.equal(access(sql, 'p_ghost'), null, 'a membership with nobody behind it was a level');

  /* AND THE RECORD IS STILL GETTABLE-OUT-OF: the real owner can be demoted, because the ghost was
     never an owner and `owners()` was right all along. */
  value(invite(deps, 'p_root', { person: 'p_b', email: 'b@example.test', level: 'owner' }));
  value(invite(deps, 'p_root', { person: 'p_root', level: 'write' }));
  assert.equal(access(sql, 'p_root')!.level, 'write');
});

test('AN INVITATION IS THE WHOLE OF WHAT SOMEBODY HOLDS, INCLUDING WHEN IT NAMES NO REGISTERS', async () => {
  /**
   * The revocation sweep was guarded on `if (args.registers)`, so `invite({ person, level: 'read' })`
   * — an owner moving somebody down, which is the ordinary thing this method is for — kept every
   * scoped grant. `{level:'read'}` left `payroll: owner` standing while the identical call with
   * `registers: {}` revoked it: two spellings of one intention, opposite outcomes, and `registers`
   * is typed optional at every boundary above this one.
   *
   * `45 §5.6` is a full replacement in both cases.
   */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read', registers: { payroll: 'owner' } }));
  assert.equal(access(sql, 'p_a')!.levels.payroll, 'owner');

  value(invite(deps, 'p_root', { person: 'p_a', level: 'read' }));
  assert.deepEqual(access(sql, 'p_a')!.levels, {}, 'a demotion left an owner grant on one register standing');

  /* And the revocation is on the ledger, not silent. */
  const revoked = events(sql).filter((e) => e.target === 'p_a' && e.kind === 'access.revoke');
  assert.deepEqual(revoked.map((e) => [e.field, e.from_v, e.to_v]), [['payroll', 'owner', null]]);
});

test('A SUSPENDED OWNER IS NOT THE OWNER THE RECORD IS KEEPING', async () => {
  /**
   * `remove` and `suspend` read the raw `member` row — `register === '*' && level === 'owner'` —
   * while `owners()` joins `person` and skips the suspended. So a suspended owner was the last owner
   * to the guard and not an owner to the count, and could not be taken off with a working owner
   * sitting beside them. Suspension is *"stop somebody without deciding about them"*; the deciding
   * was refused.
   *
   * The same split, one function down from where `access()` was just fixed for it.
   */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'owner' }));
  value(suspend(deps, 'p_root', 'p_a', true));

  value(remove(deps, 'p_root', 'p_a'));
  assert.equal(access(sql, 'p_a'), null, 'a suspended owner could not be removed');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM member WHERE person_id = 'p_a'")!.n, 0);

  /* And the REAL last owner is still protected, which is what the guard is for. */
  assert.equal(refusal(remove(deps, 'p_root', 'p_root')).code, 'LEVEL_REQUIRED');
});

test('and a membership with nobody behind it protects nobody', async () => {
  /**
   * The other half of the same split. A ghost `member('*','owner')` was an owner to the guard and
   * invisible to the count — so a record with exactly one real owner refused to let that owner go,
   * on the strength of a row the ladder had just been taught to ignore. `access()` was fixed and the
   * three methods around it were not.
   */
  const { sql, deps } = await record();
  value(invite(deps, 'system', { person: 'p_real', email: 'r@example.test', level: 'owner' }));
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_ghost', '*', 'owner')");
  value(invite(deps, 'p_real', { person: 'p_b', email: 'b@example.test', level: 'owner' }));

  /* Two real owners, so demoting one is allowed — and was not, because the ghost was counted by the
     guard and not by `owners()`. */
  value(invite(deps, 'p_real', { person: 'p_b', level: 'write' }));
  assert.equal(access(sql, 'p_b')!.level, 'write');

  /* AND THE LISTING AGREES WITH THE LADDER. `members()` did not join `person`, so the People screen
     drew the ghost as an active owner while `access()` said it held nothing — the exact pair the
     inner join was added to end. */
  assert.ok(!members(sql).some((m) => m.person_id === 'p_ghost'), 'the listing shows an owner the ladder does not');
});

test('THE READ MARK SURVIVES A LEVEL CHANGE', async () => {
  /* `45 §5.6`: *"keeping the old `'*'` row's `seen_at`"*. A level change deletes the `'*'` row and
     re-inserts it, and `seen_at` went with it — so an administrative change somebody else made reset
     the unread badge for the whole record. */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read' }));
  sql.exec("UPDATE member SET seen_at = '2026-09-01T00:00:00.000Z' WHERE person_id = 'p_a' AND register = '*'");

  value(invite(deps, 'p_root', { person: 'p_a', level: 'write' }));
  assert.equal(members(sql).find((m) => m.person_id === 'p_a')!.seen_at, '2026-09-01T00:00:00.000Z', 'a level change reset the read mark');

  /* AND THE MECHANISM IS `ON CONFLICT … SET level`, not a carried column. A previous pass added a
     fourth column to copy `seen_at` across a delete, and it was dead code for a defect that did not
     exist — the `'*'` row is deleted only when `level` is ABSENT, and in that branch `'*'` is not
     re-inserted. Reverting the carry left this test green, which is how it was found. The clause is
     what this asserts, so widening the `DO UPDATE SET` is what fails it. */
  value(invite(deps, 'p_root', { person: 'p_a', level: 'decide' }));
  assert.equal(members(sql).find((m) => m.person_id === 'p_a')!.seen_at, '2026-09-01T00:00:00.000Z');

  /* Dropping the record level does take the mark with it, and that is right: the mark is ON that
     row, and somebody holding only named registers has not read the record. */
  value(invite(deps, 'p_root', { person: 'p_a', registers: { payroll: 'read' } }));
  value(invite(deps, 'p_root', { person: 'p_a', level: 'read', registers: { payroll: 'read' } }));
  assert.equal(members(sql).find((m) => m.person_id === 'p_a')!.seen_at, null, 'the record level was gone, so the mark on it is gone with it');
});

/* ── suspension ───────────────────────────────────────────────────────────── */

test('A SUSPENDED PERSON IS NOT INVITED THROUGH', async () => {
  /**
   * `invite` never read `suspended_at`, so suspending somebody and then changing their level wrote
   * `grant · * · read→owner` on a person the revoke two rows above had just taken to nothing — the
   * ledger stopped being replayable, and the new level came live the moment they were un-suspended
   * with no event saying so.
   */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read' }));
  value(suspend(deps, 'p_root', 'p_a', true));
  const before = events(sql).length;

  const said = refusal(invite(deps, 'p_root', { person: 'p_a', level: 'owner' }));
  assert.equal(said.code, 'LEVEL_REQUIRED');
  assert.equal(said.at, 'person');
  assert.match(said.fix, /suspended/iu);
  assert.equal(events(sql).length, before, 'a refused invitation wrote to the ledger');

  /* And un-suspending gives back exactly what was suspended, not something typed in between. */
  value(suspend(deps, 'p_root', 'p_a', false));
  assert.equal(access(sql, 'p_a')!.level, 'read');
});

/* ── what `invite` hands back ─────────────────────────────────────────────── */

test('IT RETURNS THE PERSON IT WAS ABOUT, WITH WHAT THEY NOW HOLD', async () => {
  /* Every other test here is `value(invite(…))`, which asserts `.ok` and throws the answer away — so
     the return value of this module's main method was never once inspected, and mutations returning
     a blank member or the WRONG PERSON both survived. A caller that renders the answer would have
     drawn somebody else's access. */
  const { sql, deps } = await withSpare();
  const back = value<{ person_id: string; email: string | null; level: Level | null; scoped: { register: string; level: Level }[] }>(
    invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', name: 'A. Person', level: 'read', registers: { payroll: 'write' } }),
  );
  assert.equal(back.person_id, 'p_a');
  assert.equal(back.email, 'a@example.test');
  assert.equal(back.level, 'read');
  assert.deepEqual(back.scoped, [{ register: 'payroll', level: 'write' }]);
  assert.deepEqual(back, members(sql).find((m) => m.person_id === 'p_a'), 'the answer is not what the listing says');
});

test('and the listing holds one row per person, merged', async () => {
  /* `members()` folds a person's `'*'` row and their scoped rows into one entry, and nothing called
     it on somebody holding both — so a mutation returning one person twice, or letting the last row
     win, stayed green on the function every People screen is drawn from. */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read', registers: { payroll: 'write', obligations: 'decide' } }));
  const all = members(sql);
  assert.equal(new Set(all.map((m) => m.person_id)).size, all.length, 'somebody is listed twice');
  const a = all.filter((m) => m.person_id === 'p_a');
  assert.equal(a.length, 1);
  assert.equal(a[0]!.level, 'read', 'the record level was overwritten by a scoped row');
  assert.equal(a[0]!.scoped.length, 2);
});

test('a refusal writes nothing at all, not even the person', async () => {
  /* The `person` upsert sits after the validation for a reason, and nothing held it there: moving it
     above the register check leaves a `person` row for an invitation that was refused — somebody on
     the record's mirror who was never invited to it. */
  const { sql, deps } = await withSpare();
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM person')!.n;
  const events0 = events(sql).length;
  assert.equal(refusal(invite(deps, 'p_root', { person: 'p_x', email: 'x@example.test', level: 'read', registers: { ledger: 'read' } })).code, 'REGISTER_UNKNOWN');
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM person')!.n, before, 'a refused invitation left a person behind');
  assert.equal(events(sql).length, events0, 'a refused invitation wrote an event');
  assert.equal(access(sql, 'p_x'), null);
});

test('and the event lands after the row it is about', async () => {
  /* An event written before the `INSERT` is an audit that records grants the transaction may not
     make. Both are in one statement sequence here; the check is that the row exists whenever the
     event does. */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'write', registers: { payroll: 'read' } }));
  for (const e of events(sql).filter((x) => x.target === 'p_a' && x.kind === 'access.grant')) {
    const row = sql.one<{ level: Level }>('SELECT level FROM member WHERE person_id = ? AND register = ?', 'p_a', e.field);
    assert.ok(row, `an \`access.grant\` names ${e.field} and no member row holds it`);
    assert.equal(row.level, e.to_v);
  }
});

test('AND THE REASON REACHES THE LEDGER, WHICH IS THE HALF THAT WAS STILL MISSING', async () => {
  /**
   * `45 §5.6`: `note = why`. The column was plumbed through `members.ts` and the three facades above
   * it took no `why` at all, so `note` was `NULL` on every access event in the product — and this
   * file's own `events()` helper selected the column and asserted nothing about it, which is why a
   * mutation hard-wiring it to `null` stayed green. Half of *"every access change in this record was
   * unattributed"* survived the commit that said it was fixed.
   */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read', why: 'reconciling the September ledger' }));
  const grant = events(sql).find((e) => e.target === 'p_a' && e.kind === 'access.grant')!;
  assert.equal(grant.note, 'reconciling the September ledger');

  value(remove(deps, 'p_root', 'p_a', 'the engagement ended'));
  assert.equal(events(sql).find((e) => e.target === 'p_a' && e.kind === 'access.revoke')!.note, 'the engagement ended');

  value(invite(deps, 'p_root', { person: 'p_b', email: 'b@example.test', level: 'read' }));
  value(suspend(deps, 'p_root', 'p_b', true, 'away for a fortnight'));
  assert.equal(events(sql).find((e) => e.target === 'p_b' && e.kind === 'access.revoke')!.note, 'away for a fortnight');
});

test('and suspending somebody who holds nothing invents nothing', async () => {
  /* The defect this file is named for, in the function it was found in: `suspend` used to write one
     event about `'*'` with the level defaulted to `read`. Somebody removed and then suspended holds
     no rows at all, and the honest number of events for that is zero. */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read' }));
  value(remove(deps, 'p_root', 'p_a'));
  const before = events(sql).length;
  value(suspend(deps, 'p_root', 'p_a', true));
  assert.equal(events(sql).length, before, 'suspending somebody who holds nothing wrote an access event');
});


test('A SUSPENDED PERSON HOLDS NOTHING, AND THE LADDER READS IT', async () => {
  /* The column existed and nothing could set it: `invite` wrote `NULL`, provisioning wrote `NULL`,
     and nothing else touched it — so suspension was a word the interface could show. Once the
     ladder learned to read it, it was a check behind a switch nobody could flip. */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'owner' }));
  assert.equal(access(sql, 'p_a')!.level, 'owner');

  value(suspend(deps, 'p_root', 'p_a', true));
  assert.equal(access(sql, 'p_a'), null, 'a suspended person still held their level');

  /* AND THE ROWS ARE KEPT. That is the difference from `remove`: restoring somebody must not mean
     remembering what they had. */
  assert.ok(
    sql.one<{ n: number }>("SELECT count(*) AS n FROM member WHERE person_id = 'p_a'")!.n > 0,
    'suspension deleted the membership, which is what `remove` is for',
  );
  value(suspend(deps, 'p_root', 'p_a', false));
  assert.equal(access(sql, 'p_a')!.level, 'owner', 'un-suspending did not give back what suspension kept');
});

test('SUSPENSION RECORDS WHAT THEY WERE ACTUALLY HOLDING', async () => {
  /**
   * It wrote ONE event, about `'*'`, with the level defaulted to `'read'` when there was no `'*'`
   * row — the exact wrong reading this module's header condemns twice, surviving in the event
   * writer. Suspending the bookkeeper recorded `access.revoke · * · read`, a record-wide level she
   * never held, and said nothing about the two grants that actually stopped.
   *
   * An audit that answers *what were they holding when you stopped them* with a fabrication is worse
   * than one that does not answer.
   */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_book', email: 'b@example.test', registers: { payroll: 'read', obligations: 'read' } }));
  const before = events(sql).length;

  value(suspend(deps, 'p_root', 'p_book', true));
  const off = events(sql).slice(before);
  assert.equal(off.length, 2, 'suspension wrote one event for a person holding two grants');
  /* `from_v` IS WHAT THEY HELD AND `to_v` IS WHAT THEY HOLD NOW, which for a revoke is nothing.
     One column could not tell a raise from a drop. */
  assert.deepEqual(
    off.map((e) => [e.kind, e.field, e.from_v, e.to_v]).sort(),
    [['access.revoke', 'obligations', 'read', null], ['access.revoke', 'payroll', 'read', null]],
  );
  for (const e of off) assert.notEqual(e.field, RECORD, 'it recorded a record-wide level she never held');

  /* AND THE INVERSE READS AS THE INVERSE, or the history cannot be replayed. */
  value(suspend(deps, 'p_root', 'p_book', false));
  const on = events(sql).slice(before + 2);
  assert.deepEqual(
    on.map((e) => [e.kind, e.field, e.from_v, e.to_v]).sort(),
    [['access.grant', 'obligations', null, 'read'], ['access.grant', 'payroll', null, 'read']],
  );
});

test('and a suspended token stops with the person who minted it', async () => {
  /**
   * `20 §6` asks for it *"in the same statement — not by a nightly job"*, and `verifyToken` gets
   * there by joining `person.suspended_at` rather than by writing `revoked_at` on every token —
   * which is the better answer, because `revoked_at` is not reversible and un-suspending has to give
   * the tokens back.
   *
   * *"A token is a capability handed to an agent by a PERSON — that is the whole of what the second
   * ladder means — so a suspended person's agent must stop with them."* The join was added because
   * both hosts happened to call `access` afterwards, closing the door by accident of call order; any
   * caller of `verifyToken` alone re-opened it. Nothing tested either half.
   */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'write' }));

  const tokens: TokenDeps = {
    sql,
    nowMs: NOW,
    mint: () => 't_0001',
    recordId: () => 'rec_test',
    digest: async (text) => `h:${text}`,
    random: () => new Uint8Array(32).fill(7),
  };
  const minted = value<{ bearer: string }>(await createToken(tokens, 'p_a', { scope: 'write', label: 'agent' }));
  assert.ok((await verifyToken(tokens, minted.bearer)).ok, 'the token did not work before the suspension');

  value(suspend(deps, 'p_root', 'p_a', true));
  const refused = await verifyToken(tokens, minted.bearer);
  assert.equal(refused.ok, false, 'a suspended person\u2019s agent kept writing');
  assert.equal(refusal(refused).code, 'FORBIDDEN');
  /* THE SAME SENTENCE AS A BEARER THIS RECORD NEVER MINTED. A different one would tell whoever is
     holding it which half they got right. */
  assert.equal(refusal(refused).fix, refusal(await verifyToken(tokens, 'rec_test.nonsense')).fix);

  /* AND IT COMES BACK, which is the whole difference from `remove`. */
  value(suspend(deps, 'p_root', 'p_a', false));
  assert.ok((await verifyToken(tokens, minted.bearer)).ok, 'un-suspending did not give the agent back');
});

test('the last owner cannot be suspended, and the sentence says what to do instead', async () => {
  const { deps } = await record();
  value(invite(deps, 'system', { person: 'p_a', email: 'a@example.test', level: 'owner' }));
  const said = refusal(suspend(deps, 'p_a', 'p_a', true));
  assert.equal(said.code, 'LEVEL_REQUIRED');
  assert.equal(said.at, 'person');
  assert.match(said.fix, /owner/u);
  assert.match(said.fix, /Make somebody else/u, 'the refusal does not say the way out');
});

test('suspending somebody who is not there is refused, not ignored', async () => {
  const { deps } = await record();
  assert.equal(refusal(suspend(deps, 'system', 'p_ghost', true)).code, 'OUT_OF_BOUNDS');
});

test('and it is idempotent, because a switch that only works once is a switch', async () => {
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'write' }));
  value(suspend(deps, 'p_root', 'p_a', true));
  value(suspend(deps, 'p_root', 'p_a', true));
  assert.equal(access(sql, 'p_a'), null);
  value(suspend(deps, 'p_root', 'p_a', false));
  value(suspend(deps, 'p_root', 'p_a', false));
  assert.equal(access(sql, 'p_a')!.level, 'write');
});

/* ── the last owner ───────────────────────────────────────────────────────── */

test('THE LAST OWNER CANNOT BE MOVED DOWN, REMOVED, OR LEFT WITHOUT A RECORD LEVEL', async () => {
  /* Three doors into the same state, and the state is one nobody inside the product can get out of:
     a record with no owner cannot grant access, invite anybody, or be closed. */
  const { sql, deps } = await record();
  value(invite(deps, 'system', { person: 'p_a', email: 'a@example.test', level: 'owner' }));

  assert.equal(refusal(invite(deps, 'p_a', { person: 'p_a', level: 'write' })).code, 'LEVEL_REQUIRED');
  assert.equal(refusal(remove(deps, 'p_a', 'p_a')).code, 'LEVEL_REQUIRED');
  /* The third door is the quiet one: leaving `level` OFF an invitation deletes the `'*'` row, which
     is how somebody is held to named registers — and doing it to the last owner is the same state
     by another route. It is the FIRST guard that catches it, because `undefined !== 'owner'`; the
     second copy inside that branch could never fire and is gone. */
  const third = refusal(invite(deps, 'p_a', { person: 'p_a', registers: { payroll: 'owner' } }));
  assert.equal(third.code, 'LEVEL_REQUIRED');
  assert.equal(third.at, 'level');
  /* AND THE ROW SURVIVES THE REFUSAL. A guard that returns after the `DELETE` would leave the record
     ownerless AND report that it had refused to. */
  assert.equal(access(sql, 'p_a')!.level, 'owner', 'the refusal deleted the row it was protecting');
});

test('and with a second owner every one of the three is allowed', async () => {
  /* The guard has to be about the RECORD and not about the person: a check that refused any owner
     demotion would make the second owner a permanent one. */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'owner' }));
  value(invite(deps, 'p_root', { person: 'p_a', level: 'write' }));
  assert.equal(access(sql, 'p_a')!.level, 'write');

  value(invite(deps, 'p_root', { person: 'p_a', level: 'owner' }));
  value(remove(deps, 'p_root', 'p_a'));
  assert.equal(access(sql, 'p_a'), null);
});

test('a suspended owner does not count as the owner the record is keeping', async () => {
  /**
   * The subtle one. `owners()` counts unsuspended `'*'` owners, so with one active owner and one
   * suspended, demoting the active one must be refused — otherwise the record is left with an owner
   * who cannot act, which is the state the guard exists to prevent wearing a disguise.
   */
  const { deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'owner' }));
  value(suspend(deps, 'p_root', 'p_a', true));
  assert.equal(refusal(invite(deps, 'p_root', { person: 'p_root', level: 'write' })).code, 'LEVEL_REQUIRED');
  assert.equal(refusal(remove(deps, 'p_root', 'p_root')).code, 'LEVEL_REQUIRED');
});

test('removing somebody who was never on the record is the state they asked for', async () => {
  const { deps } = await record();
  assert.equal(value<null>(remove(deps, 'system', 'p_ghost')), null);
});

/* ── one event per register ───────────────────────────────────────────────── */

test('EVERY CHANGE WRITES ONE EVENT PER REGISTER, AND THAT IS NOT BOOKKEEPING', async () => {
  /* *"`access.grant` is how anybody later answers 'when did they get to see this', and a single
     event naming a list would make the answer a string somebody has to parse."* */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read', registers: { payroll: 'write' } }));
  const wrote = events(sql).filter((e) => e.target === 'p_a');
  assert.equal(wrote.length, 2, 'one invitation over two registers did not write two events');
  assert.deepEqual(wrote.map((e) => [e.kind, e.field, e.from_v, e.to_v]).sort(), [
    ['access.grant', '*', null, 'read'],
    ['access.grant', 'payroll', null, 'write'],
  ]);
  for (const e of wrote) {
    /* `target_kind` SELECTED, not defaulted. This read `e.target_kind ?? 'person'` over a query that
       did not select the column, which is a tautology wearing an assertion's clothes — the one
       failure mode this file exists to catch.

       AND IT IS `member`, NOT `person`. `45 §5.6` fixes the shape — *"`target` = person id,
       `target_kind 'member'`, `field` = register"* — and this wrote `target = 'person:<id>'` with
       `target_kind = 'person'`, which is a third spelling beside `20 §1`'s. The row that changed is
       a `member` row; the person is untouched. */
    assert.equal(e.target_kind, 'member');
    assert.equal(e.target, 'p_a', '`45 §5.6`: the target is the person id, bare');
    assert.equal(e.actor, 'p_root', 'the event does not say who did it');
  }
});

test('A REGISTER LEFT OUT OF A SECOND INVITATION IS REVOKED OUT LOUD', async () => {
  /* An invitation is the whole of what somebody holds, not a patch. The alternative is that a
     screen showing two registers and sending one leaves the other standing, silently. */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read', registers: { payroll: 'write', obligations: 'write' } }));
  value(invite(deps, 'p_root', { person: 'p_a', level: 'read', registers: { payroll: 'write' } }));

  assert.deepEqual(access(sql, 'p_a')!.levels, { payroll: 'write' });
  const revoked = events(sql).filter((e) => e.target === 'p_a' && e.kind === 'access.revoke');
  assert.deepEqual(revoked.map((e) => [e.field, e.from_v, e.to_v]), [['obligations', 'write', null]], 'the register that was dropped left no trace');
});

test('and a level that did not change writes nothing', async () => {
  /* An event per call rather than per change turns the audit into a log of who opened the screen. */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'write' }));
  const before = events(sql).length;
  value(invite(deps, 'p_root', { person: 'p_a', level: 'write' }));
  assert.equal(events(sql).length, before, 're-sending the same level wrote an event');
});

test('removal writes one revoke per register, and keeps the person', async () => {
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read', registers: { payroll: 'write' } }));
  value(remove(deps, 'p_root', 'p_a'));

  const revoked = events(sql).filter((e) => e.target === 'p_a' && e.kind === 'access.revoke');
  assert.equal(revoked.length, 2);
  /* *"The person row stays. Every event they ever wrote names them, and a history whose actors
     cannot be resolved is a history that reads as a list of identifiers."* */
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM person WHERE id = 'p_a'")!.n, 1);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM member WHERE person_id = 'p_a'")!.n, 0);
});

/* ── what an invitation must say ──────────────────────────────────────────── */

test('an invitation to nothing is not an invitation', async () => {
  const { deps } = await record();
  assert.equal(refusal(invite(deps, 'system', { person: 'p_a' })).at, 'level');
  assert.equal(refusal(invite(deps, 'system', { person: 'p_a', registers: {} })).at, 'level');
  assert.equal(refusal(invite(deps, 'system', { person: '', level: 'read' })).at, 'person');
});

test('a level that is not on the ladder is refused, and the refusal says which are', async () => {
  const { deps } = await record();
  const said = refusal(invite(deps, 'system', { person: 'p_a', level: 'admin' as Level }));
  assert.equal(said.code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual([...(said.allowed ?? [])], [...LEVELS]);
  /* There is no `admin` (ADR-060), and this is the check that says so at the door — on the
     per-register branch too, which carries its own copy of the refusal and its own `allowed`. */
  const scoped = refusal(invite(deps, 'system', { person: 'p_a', registers: { payroll: 'admin' as Level } }));
  assert.equal(scoped.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(scoped.at, 'payroll');
  assert.deepEqual([...(scoped.allowed ?? [])], [...LEVELS], 'the register branch refuses without saying what it would take');
});

test('a register that does not exist is refused by name', async () => {
  const { deps } = await record();
  const said = refusal(invite(deps, 'system', { person: 'p_a', level: 'read', registers: { ledger: 'read' } }));
  assert.equal(said.code, 'REGISTER_UNKNOWN');
  assert.equal(said.at, 'ledger');
  assert.match(said.fix, /ledger/u, 'the refusal does not name the register it is about');
});

/* ── the listing the screen draws ─────────────────────────────────────────── */

test('THE LISTING TELLS "NO RECORD LEVEL" APART FROM "READ ON THE RECORD"', async () => {
  /* *"A listing that showed them the same would have somebody revoke the wrong one."* */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'read' }));
  value(invite(deps, 'p_root', { person: 'p_b', email: 'b@example.test', registers: { payroll: 'read' } }));

  const all = members(sql);
  const a = all.find((m) => m.person_id === 'p_a')!;
  const b = all.find((m) => m.person_id === 'p_b')!;
  assert.equal(a.level, 'read');
  assert.deepEqual(a.scoped, []);
  assert.equal(b.level, null, 'somebody with no record row was listed as holding one');
  assert.deepEqual(b.scoped, [{ register: 'payroll', level: 'read' }]);
});

test('the listing carries the mirror, so a name resolves offline', async () => {
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', name: 'A. Person', level: 'write' }));
  const a = members(sql).find((m) => m.person_id === 'p_a')!;
  assert.equal(a.email, 'a@example.test');
  assert.equal(a.name, 'A. Person');
  assert.equal(a.suspended_at, null);

  /* AND A SECOND INVITATION WITHOUT A NAME DOES NOT BLANK THE ONE THE DIRECTORY ALREADY HAD. */
  value(invite(deps, 'p_root', { person: 'p_a', level: 'read' }));
  const again = members(sql).find((m) => m.person_id === 'p_a')!;
  assert.equal(again.name, 'A. Person', 'a level change erased the name');
  assert.equal(again.email, 'a@example.test');
});

test('a suspended person is listed as suspended rather than as absent', async () => {
  /* They are still on the record and still have to be un-suspendable from a screen. */
  const { sql, deps } = await withSpare();
  value(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'write' }));
  value(suspend(deps, 'p_root', 'p_a', true));
  const a = members(sql).find((m) => m.person_id === 'p_a');
  assert.ok(a, 'a suspended person vanished from the listing that has to un-suspend them');
  assert.ok(a.suspended_at, 'the listing does not say they are suspended');
  assert.equal(a.level, 'write', 'the listing forgot what they will get back');
});
