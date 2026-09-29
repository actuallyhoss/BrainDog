/**
 * A secret field retired and then dropped from its list is still a secret.
 *
 * WHAT WAS MEASURED, BEFORE THE REPAIR. `pin` on Obligations is secret, a row holds `hunter2` in it, and the list then
 * retires `pin` and drops it, which the kernel allows because a retired field's values were put away on purpose
 * (`index.ts`'s `contradicted`). The row keeps the value. `sealedOf` read the list's declaration as it stands, which no
 * longer names `pin`, so the run-time check had no secret to guard, and the lint read the same declaration through
 * `declare.ts`'s `knownTo`. Each of the four rules below installed and wrote `hunter2`: into the note event for the
 * three notes, and into `memo` for the set.
 *
 * TWO LINES, AND EACH IS HELD HERE ON ITS OWN. The lint refuses the rule at install. The run-time line is for a rule
 * the lint never saw that way: one installed before `pin` was declared at all passes, since adding a field to a list
 * asks nothing of the rules already on it (measured), and so does every rule stored before this repair. Those are
 * installed first here and must still write the value nowhere. The run-time line alone is not enough, because the four
 * rules would still install.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

type Field = Record<string, unknown>;
const obligations = (fields: Field[]): Declaration => ({
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }, { id: 'memo', type: 'text' }, ...fields] } as never,
});
const copy = (rule: Record<string, unknown>): Declaration => ({ id: 'rule.copy', kind: 'rule', body: { rule: 'copy', once_per: ['entry'], ...rule } as never });

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

/** Every row of every table holding `needle`, the row's own `pin` taken out first, as `flow-secret-verbs.test.ts` reads it. */
function holding(sql: NodeSql, needle: string): string[] {
  const out: string[] = [];
  for (const { name } of sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'automation_%'")) {
    let rows: unknown[];
    try {
      rows = sql.all(`SELECT * FROM "${name}"`);
    } catch {
      continue;
    }
    for (const raw of rows) {
      const row = name === 'entry' ? { ...(raw as Record<string, unknown>), fields: JSON.stringify({ ...(JSON.parse(String((raw as { fields: string }).fields)) as object), pin: undefined }) } : raw;
      const text = JSON.stringify(row, (_k, v: unknown) => (typeof v === 'bigint' ? String(v) : v instanceof Uint8Array ? `[${v.length} bytes]` : v));
      if (text.includes(needle)) out.push(`${name}: ${text}`);
    }
  }
  return out;
}

/**
 * Obligations with `pin` typed `type`, a row whose `pin` holds `hunter2`, then `pin` retired and each of `later`
 * installed in turn (by default the drop). `first` is installed before `pin` is declared, where the lint has no `pin`
 * to read, so it is the stored rule the run-time line is for.
 *
 * THE ROW IS MADE BEFORE `first`, so the rule's one firing (`once_per: [entry]`) is the edit after the drop. Made after
 * it, an inline rule fired on the create, when `pin` held nothing, wrote `x —` and never fired again, and the run-time
 * line under test was never reached (measured while writing this file).
 */
async function recordWith(type: string, later: Field[][], first?: Declaration): Promise<{ sql: NodeSql; k: Kernel; made: Entry }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { answersSlash: true });
  value(await k.install([obligations([])]));
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  if (first !== undefined) value(await k.install([first]));
  value(await k.install([obligations([{ id: 'pin', type }])]));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  value(await k.install([obligations([{ id: 'pin', type, retired: true }])]));
  for (const fields of later) value(await k.install([obligations(fields)]));
  return { sql, k, made };
}

/** `rule` installed after the drop: the refusal, or `null` where it installed. */
async function installedAfter(rule: Record<string, unknown>, type = 'secret', later: Field[][] = [[]]): Promise<{ code: string; fix: string } | null> {
  const { sql, k } = await recordWith(type, later);
  const out = await k.install([copy(rule)]);
  sql.close();
  return out.ok ? null : { code: 'refusal' in out ? out.refusal.code : 'CONFLICT', fix: fixOf(out) };
}

/** `rule` stored before `pin` existed, then the row edited and the record drained: what holds `hunter2`, and the run. */
async function ranFromBefore(
  rule: Record<string, unknown>,
  type = 'secret',
  later: Field[][] = [[]],
): Promise<{ went: string[]; run: { state: string; say: string | null } | undefined; refused: string[] }> {
  const { sql, k, made } = await recordWith(type, later, copy(rule));
  value(k.update('obligations', made.id, { note: 'plain' }, { actor: 'p_1' }) as Result<unknown>);
  await k.drain();
  const went = holding(sql, 'hunter2');
  const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'copy'");
  const refused = sql.all<{ subject: string }>("SELECT subject FROM observation WHERE kind = 'write.refused' AND subject LIKE '%rule.copy%'").map((r) => r.subject);
  sql.close();
  return { went, run, refused };
}

const run = (steps: unknown[]) => ({ on: { written: { register: 'obligations', op: ['update'] } }, steps });
const inline = (then: unknown[]) => ({ register: 'obligations', then });

const FOUR = [
  ["run note 'x {{trigger.row}}'", run([{ note: 'x {{trigger.row}}' }]), 'run'],
  ["run note 'x {{trigger.row.pin}}'", run([{ note: 'x {{trigger.row.pin}}' }]), 'run'],
  ["inline note 'x {{pin}}'", inline([{ note: 'x {{pin}}' }]), 'inline'],
  ['inline set memo to {{pin}}', inline([{ set: { field: 'memo', to: '{{pin}}' } }]), 'inline'],
] as const;

/** The two ways round the kernel's refusal of `secret` retyped to `text` while a row holds a value. */
const RETYPED = [
  ['dropped and declared again as text', [[], [{ id: 'pin', type: 'text' }]]],
  ['retyped as text while retired', [[{ id: 'pin', type: 'text', retired: true }]]],
] as const;

test("THE AUDIT'S FOUR RULES ARE REFUSED AT INSTALL once the secret field is retired and dropped, as while it was declared", async () => {
  const passed: string[] = [];
  for (const [what, rule] of FOUR) {
    const out = await installedAfter(rule);
    if (out === null || out.code !== 'DECLARATION_INVALID' || !/pin/.test(out.fix) || !/secret field/.test(out.fix))
      passed.push(`${what}: ${out === null ? 'installed' : `${out.code} ${out.fix}`}`);
  }
  assert.deepEqual(passed, []);
});

test('AND IN THE SAME BATCH AS THE DROP, which the lint reads with the batch laid over the record', async () => {
  const { sql, k } = await recordWith('secret', []);
  const out = await k.install([obligations([]), copy(run([{ note: 'x {{trigger.row.pin}}' }]))]);
  assert.equal(out.ok, false, 'the drop and the rule installed together');
  assert.match(fixOf(out), /copies pin into a note at steps\[0\] with \{\{trigger\.row\.pin\}\}, and a secret field/);
  sql.close();
});

test('A SECRET FIELD RETYPED AS TEXT BY WAY OF RETIRING IT IS REFUSED AT INSTALL TOO, since its old rows still hold the secret', async () => {
  const passed: string[] = [];
  for (const [what, later] of RETYPED) {
    const out = await installedAfter(run([{ note: 'x {{trigger.row.pin}}' }]), 'secret', later as unknown as Field[][]);
    if (out === null || !/secret field/.test(out.fix)) passed.push(`${what}: ${out === null ? 'installed' : out.fix}`);
  }
  assert.deepEqual(passed, []);
});

test('A RULE STORED BEFORE THE FIELD WAS SECRET WRITES THE VALUE NOWHERE after the drop, and the step says why', async () => {
  const leaked: string[] = [];
  for (const [what, rule, path] of FOUR) {
    const out = await ranFromBefore(rule);
    if (out.went.length) leaked.push(`${what}: hunter2 went to ${out.went.join(' | ')}`);
    if (path === 'run' && (out.run?.state !== 'failed' || !/secret or file field/.test(out.run.say ?? '')))
      leaked.push(`${what}: the run is ${out.run?.state} ${out.run?.say ?? ''}, and a step that copies the secret fails it`);
    if (path === 'inline' && out.refused.length === 0) leaked.push(`${what}: no refusal was observed`);
  }
  assert.deepEqual(leaked, []);
});

test('AND BY EITHER WAY ROUND THE RETYPE, the stored rule writes it nowhere', async () => {
  /* MEASURED BY THE CHECKER ON 23 SEPTEMBER against a `sealedOf` that typed each field by the newest version naming it:
     both wrote `x hunter2` into the note event, the value the row was given while `pin` was a secret. */
  const leaked: string[] = [];
  for (const [what, later] of RETYPED) {
    const out = await ranFromBefore(run([{ note: 'x {{trigger.row.pin}}' }]), 'secret', later as unknown as Field[][]);
    if (out.went.length) leaked.push(`${what}: hunter2 went to ${out.went.join(' | ')}`);
    if (out.run?.state !== 'failed') leaked.push(`${what}: the run is ${out.run?.state}`);
  }
  assert.deepEqual(leaked, []);
});

test('NO FALSE POSITIVE: a text field retired and then dropped installs and is copied as it always was', async () => {
  /* THE SAME STATE `flow-secret-verbs.test.ts` BUILDS FOR `old` on Jobs, here by the kernel's own retire and drop, for a
     field that was never secret. Reading the declaration's history must not seal it, at install or at run time. */
  assert.equal(await installedAfter(run([{ note: 'x {{trigger.row.pin}}' }]), 'text'), null);
  const out = await ranFromBefore(run([{ note: 'x {{trigger.row.pin}}' }]), 'text');
  assert.equal(out.run?.state, 'done', out.run?.say ?? '');
  assert.equal(out.went.length, 1, out.went.join(' | '));
  assert.match(out.went[0]!, /^event: .*x hunter2/);
});

test('THE NEW FIELD THAT REFUSAL NAMES IS TEXT, beside a dropped secret declared again under its old name', async () => {
  /* THE WAY OUT THE KERNEL ALREADY GIVES, "Retire the field and add a new one", has to stay open: sealing follows the
     field that was secret and no other. `code` is declared as text after `pin` came back as text, and is copied, and
     the rule naming it installs past the lint. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { answersSlash: true });
  value(await k.install([obligations([{ id: 'pin', type: 'secret' }])]));
  value(await k.install([obligations([{ id: 'pin', type: 'secret', retired: true }])]));
  value(await k.install([obligations([])]));
  value(await k.install([obligations([{ id: 'pin', type: 'text' }, { id: 'code', type: 'text' }])]));
  value(await k.install([copy(run([{ note: 'x {{trigger.row.code}}' }]))]));
  const made = value<Entry>(k.create('obligations', { what: 'Rent', code: 'open' }, { actor: 'p_1' }));
  value(k.update('obligations', made.id, { note: 'plain' }, { actor: 'p_1' }) as Result<unknown>);
  await k.drain();
  const ran = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'copy'");
  assert.equal(ran?.state, 'done', ran?.say ?? '');
  assert.equal(sql.one<{ note: string }>("SELECT note FROM event WHERE actor = 'rule:copy' AND kind = 'note'")?.note, 'x open');
  sql.close();
});
