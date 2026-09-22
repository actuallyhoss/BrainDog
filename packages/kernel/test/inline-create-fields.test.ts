/**
 * A value a rule writes is filled from text, so a value that is not text is refused where the rule is written.
 *
 * MEASURED IN `loop/research-batch-thirty-eight-audit.md`, "Found on the way, outside the wave", first bullet. The body
 * `{ rule: late, register: jobs, then: [{ create: { register: bills, bound: 1, fields: { what: Rent, tags: [late] } } }] }`
 * installed, and then every write to Jobs threw `TypeError: template.replace is not a function` out of the write, from
 * `withEach` in `rules.ts`, which calls `.replace` on each field value. A host answers each of those writes `INTERNAL`.
 *
 * THE AUDIT'S BRIEF ALLOWED NUMBERS AND BOOLEANS, AND THEY THROW TOO. Probed on 23 September against the working tree,
 * one body per value, each installed and then written once: `tags: [late]`, `n: 5`, `b: true`, `n: null` and
 * `what: { a: 1 }` in a create's fields all threw on the write, and so did `set: { to: 5 }`, `note: 5`,
 * `notify: { say: 5 }`, `schedule: { note: 5 }`, `link: { to: { value: 5 } }` and `suggest: { question: 5 }`, because
 * every one of them reaches `fill`, whose first line is `template.replace`. The same values written as text, `n: '5'`
 * and `b: 'true'`, made a Bills row holding `n: 5` and `b: true`: the list reads text as its own type, so the one form
 * that works is text, and the lint refuses the rest with the quoted form in the sentence.
 *
 * THE AUDIT'S BODY AS WRITTEN IS REFUSED ALREADY, for a different key: a create with no `once_per` is refused
 * `REQUIRED_MISSING` first. `once_per: [entry]` is added below so that the body reaches the fault under test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const FIELDS = [
  { id: 'what', type: 'text', required: true },
  { id: 'n', type: 'int' },
  { id: 'b', type: 'bool' },
  { id: 'tags', type: 'list', of: 'text' },
];
const list = (id: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id[0]!.toUpperCase() + id.slice(1), title: 'what', fields: FIELDS } as never,
});
const rule = (body: Record<string, unknown>): Declaration => ({ id: 'rule.late', kind: 'rule', body: { rule: 'late', ...body } as never });

/** The audit's body, with the `once_per` it needs to get past the check that comes first. */
const AUDIT = { register: 'jobs', once_per: ['entry'], then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', tags: ['late'] } } }] };

async function open(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

const refusal = async (body: Record<string, unknown>) => {
  const { k } = await open();
  const out = await k.install([list('jobs'), list('bills'), rule(body)]);
  assert.equal(out.ok, false, `installed: ${JSON.stringify(body)}`);
  return { code: codeOf(out), fix: fixOf(out) ?? '', at: (out as { refusal?: { at?: string } }).refusal?.at };
};

const bills = (sql: NodeSql) => sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'bills' AND deleted_at IS NULL").map((r) => JSON.parse(r.fields) as Record<string, unknown>);

test('THE AUDIT BODY IS REFUSED AT INSTALL, naming the step and the field, rather than throwing out of every write to Jobs', async () => {
  const r = await refusal(AUDIT);
  assert.equal(r.code, 'DECLARATION_INVALID');
  assert.equal(r.at, 'then[0].create.fields.tags');
  assert.equal(
    r.fix,
    'rule.late creates a bills row at then[0] with tags: ["late"], and a rule fills every value it writes from text, so a list would fail the rule each time it fired. Leave tags out of the create.',
  );
});

test('A NUMBER OR A BOOLEAN IN A CREATE IS REFUSED WITH ITS QUOTED FORM, and the quoted form installs and makes the row', async () => {
  const n = await refusal({ ...AUDIT, then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', n: 5 } } }] });
  assert.equal(n.at, 'then[0].create.fields.n');
  assert.equal(
    n.fix,
    'rule.late creates a bills row at then[0] with n: 5, and a rule fills every value it writes from text. Write n: "5", which the field reads as its own type.',
  );
  const b = await refusal({ ...AUDIT, then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', b: true } } }] });
  assert.equal(b.at, 'then[0].create.fields.b');
  assert.match(b.fix, /Write b: "true", which the field reads as its own type\.$/);

  /* THE SENTENCE'S OWN ADVICE, TAKEN. A fix that told a person to quote a value the list then refused would be a
     second defect behind the first. */
  const { k, sql } = await open();
  const out = await k.install([list('jobs'), list('bills'), rule({ ...AUDIT, then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', n: '5', b: 'true' } } }] })]);
  assert.ok(out.ok, fixOf(out));
  assert.ok(k.create('jobs', { what: 'x' }, { actor: 'p_1' }).ok);
  assert.deepEqual(bills(sql).map(({ what, n, b }) => ({ what, n, b })), [{ what: 'Rent', n: 5, b: true }]);
});

test('EVERY OTHER VALUE THE INLINE PASS FILLS IS HELD TO TEXT, each named where it sits', async () => {
  for (const [then, at] of [
    [{ set: { field: 'n', to: 5 } }, 'then[0].set.to'],
    [{ note: { text: 'x' } }, 'then[0].note'],
    [{ notify: { say: 5 } }, 'then[0].notify.say'],
    [{ schedule: { in: '14d', note: 5 } }, 'then[0].schedule.note'],
    [{ link: { field: 'what', to: { register: 'bills', by: 'what', value: 5 } } }, 'then[0].link.to.value'],
    [{ suggest: { question: 5, options: ['yes', 'no'] } }, 'then[0].suggest.question'],
  ] as const) {
    const r = await refusal({ register: 'jobs', once_per: ['entry'], then: [then] });
    assert.equal(r.code, 'DECLARATION_INVALID', JSON.stringify(then));
    assert.equal(r.at, at);
    assert.ok(r.fix.startsWith(`rule.late's ${at} is `), r.fix);
  }
});

test('A STEP WITH TWO VERBS IS HELD TO TEXT IN BOTH, whichever one the pass acts on', async () => {
  /* THE PASS'S `if` CHAIN TAKES `set` BEFORE `create`, and the lint's walk took `create` first and stopped there. Found
     by the checker on 23 September: this body installed, and the next write to Jobs threw `template.replace is not a
     function` from the `set`, which the lint had never looked at. */
  const r = await refusal({ ...AUDIT, then: [{ set: { field: 'n', to: 5 }, create: { register: 'bills', bound: 1, fields: { what: 'Rent' } } }] });
  assert.equal(r.code, 'DECLARATION_INVALID');
  assert.equal(r.at, 'then[0].set.to');
});

test('THE RUN PATH IS HELD TO THE SAME, inside a branch too, because a step acts through the same pass', async () => {
  /* A STEP'S VALUES ARE FILLED TWICE: `{{vars.…}}` by the run, which leaves anything but text as it is, and then the
     row's own `{{field}}`s by the pass. So a list in a step's create reaches the same `.replace`. Measured on 23
     September with the flat body below: the write to Jobs went in, the drain ran it, and the run ended `failed`,
     "rule.late broke at step 1: template.replace is not a function", with no Bills row. */
  const on = { written: { register: 'jobs', op: ['create'] } };
  const flat = await refusal({ on, once_per: ['entry'], steps: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', tags: ['late'] } } }] });
  assert.equal(flat.at, 'steps[0].create.fields.tags');
  const nested = await refusal({ on, once_per: ['entry'], steps: [{ if: 'what is x', then: [{ set: { field: 'n', to: 5 } }] }] });
  assert.equal(nested.at, 'steps[0].then[0].set.to');
});

test('TEXT STILL INSTALLS, templates and all', async () => {
  const { k } = await open();
  const out = await k.install([
    list('jobs'),
    list('bills'),
    rule({ register: 'jobs', once_per: ['entry'], then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent for {{what}}' } } }, { set: { field: 'n', to: '3' } }, { note: 'Made {{id}}' }] }),
  ]);
  assert.ok(out.ok, fixOf(out));
});

test(
  'A RULE ALREADY INSTALLED WITH A LIST IN ITS CREATE DOES NOT THROW OUT OF THE WRITE',
  { todo: 'rules.ts withEach calls .replace on every create field value; the guard is the rules owner\'s this wave' },
  async () => {
    /* THE BODY IS WRITTEN UNDER THE LINT, straight into the declaration row, because a record installed before the lint
       refused it still holds it. Measured on 23 September: this write throws `TypeError: template.replace is not a
       function`, and so the Jobs row a person asked for is not written either. */
    const { k, sql } = await open();
    const out = await k.install([list('jobs'), list('bills'), rule({ ...AUDIT, then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent' } } }] })]);
    assert.ok(out.ok, fixOf(out));
    sql.exec("UPDATE declaration SET body = json_set(body, '$.then', json(?)) WHERE id = 'rule.late'", JSON.stringify(AUDIT.then));

    const wrote = k.create('jobs', { what: 'x' }, { actor: 'p_1' });
    assert.ok(wrote.ok);
    assert.equal(sql.all("SELECT 1 AS x FROM entry WHERE register = 'jobs'").length, 1);
  },
);
