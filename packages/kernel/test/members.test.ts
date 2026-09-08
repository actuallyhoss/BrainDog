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
  sql.all<{ kind: string; target: string; target_kind: string; field: string; to_v: string; actor: string }>(
    "SELECT kind, target, target_kind, field, to_v, actor FROM event WHERE kind LIKE 'access.%' ORDER BY id",
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

/* ── suspension ───────────────────────────────────────────────────────────── */

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
  const wrote = events(sql).filter((e) => e.target === 'person:p_a');
  assert.equal(wrote.length, 2, 'one invitation over two registers did not write two events');
  assert.deepEqual(wrote.map((e) => [e.kind, e.field, e.to_v]).sort(), [
    ['access.grant', '*', 'read'],
    ['access.grant', 'payroll', 'write'],
  ]);
  for (const e of wrote) {
    /* `target_kind` SELECTED, not defaulted. This read `e.target_kind ?? 'person'` over a query that
       did not select the column, which is a tautology wearing an assertion's clothes — the one
       failure mode this file exists to catch. */
    assert.equal(e.target_kind, 'person');
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
  const revoked = events(sql).filter((e) => e.target === 'person:p_a' && e.kind === 'access.revoke');
  assert.deepEqual(revoked.map((e) => [e.field, e.to_v]), [['obligations', 'write']], 'the register that was dropped left no trace');
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

  const revoked = events(sql).filter((e) => e.target === 'person:p_a' && e.kind === 'access.revoke');
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
