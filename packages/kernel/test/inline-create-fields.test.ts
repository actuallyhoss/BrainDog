/**
 * A value a rule writes is filled from text, so a value that is not text is refused where the rule is written.
 *
 * MEASURED. The body
 * `{ rule: late, register: jobs, then: [{ create: { register: bills, bound: 1, fields: { what: Rent, tags: [late] } } }] }`
 * installed, and then every write to Jobs threw `TypeError: template.replace is not a function` out of the write, from
 * `withEach` in `rules.ts`, which calls `.replace` on each field value. A host answers each of those writes `INTERNAL`.
 *
 * NUMBERS AND BOOLEANS THROW TOO. Probed against the working tree, one body per value, each installed and then written
 * once: `tags: [late]`, `n: 5`, `b: true`, `n: null` and `what: { a: 1 }` in a create's fields all threw on the write,
 * and so did `set: { to: 5 }`, `note: 5`, `notify: { say: 5 }`, `schedule: { note: 5 }`, `link: { to: { value: 5 } }`
 * and `suggest: { question: 5 }`, because every one of them reaches `fill`, whose first line is `template.replace`. The
 * same values written as text, `n: '5'` and `b: 'true'`, made a Bills row holding `n: 5` and `b: true`: the list reads
 * text as its own type, so the one form that works is text, and the lint refuses the rest with the quoted form in the
 * sentence.
 *
 * THE BODY AS WRITTEN IS REFUSED ALREADY, for a different key: a create with no `once_per` is refused
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

/** That body, with the `once_per` it needs to get past the check that comes first. */
const LATE = { register: 'jobs', once_per: ['entry'], then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', tags: ['late'] } } }] };

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

test('THE LATE-TAGGING BODY IS REFUSED AT INSTALL, naming the step and the field, rather than throwing out of every write to Jobs', async () => {
  const r = await refusal(LATE);
  assert.equal(r.code, 'DECLARATION_INVALID');
  assert.equal(r.at, 'then[0].create.fields.tags');
  assert.equal(
    r.fix,
    'rule.late creates a bills row at then[0] with tags: ["late"], and a rule fills every value it writes from text, so a list would fail the rule each time it fired. Leave tags out of the create.',
  );
});

test('A NUMBER OR A BOOLEAN IN A CREATE IS REFUSED WITH ITS QUOTED FORM, and the quoted form installs and makes the row', async () => {
  const n = await refusal({ ...LATE, then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', n: 5 } } }] });
  assert.equal(n.at, 'then[0].create.fields.n');
  assert.equal(
    n.fix,
    'rule.late creates a bills row at then[0] with n: 5, and a rule fills every value it writes from text. Write n: "5", which the field reads as its own type.',
  );
  const b = await refusal({ ...LATE, then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', b: true } } }] });
  assert.equal(b.at, 'then[0].create.fields.b');
  assert.match(b.fix, /Write b: "true", which the field reads as its own type\.$/);

  /* THE SENTENCE'S OWN ADVICE, TAKEN. A fix that told a person to quote a value the list then refused would be a
     second defect behind the first. */
  const { k, sql } = await open();
  const out = await k.install([list('jobs'), list('bills'), rule({ ...LATE, then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', n: '5', b: 'true' } } }] })]);
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
  /* THE PASS'S `if` CHAIN TAKES `set` BEFORE `create`, and the lint's walk took `create` first and stopped there.
     Found: this body installed, and the next write to Jobs threw `template.replace is not a function` from the `set`,
     which the lint had never looked at. */
  const r = await refusal({ ...LATE, then: [{ set: { field: 'n', to: 5 }, create: { register: 'bills', bound: 1, fields: { what: 'Rent' } } }] });
  assert.equal(r.code, 'DECLARATION_INVALID');
  assert.equal(r.at, 'then[0].set.to');
});

test('THE RUN PATH IS HELD TO THE SAME, inside a branch too, because a step acts through the same pass', async () => {
  /* A STEP'S VALUES ARE FILLED TWICE: `{{vars.…}}` by the run, which leaves anything but text as it is, and then the
     row's own `{{field}}`s by the pass. So a list in a step's create reaches the same `.replace`. Measured with the
     flat body below: the write to Jobs went in, the drain ran it, and the run ended `failed`, "rule.late broke at step
     1: template.replace is not a function", with no Bills row. */
  const on = { written: { register: 'jobs', op: ['create'] } };
  const flat = await refusal({ on, once_per: ['entry'], steps: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', tags: ['late'] } } }] });
  assert.equal(flat.at, 'steps[0].create.fields.tags');
  const nested = await refusal({ on, once_per: ['entry'], steps: [{ if: 'what is x', then: [{ set: { field: 'n', to: 5 } }] }] });
  assert.equal(nested.at, 'steps[0].then[0].set.to');
});

test('A TAG OR AN UNTAG WHOSE WORD IS NOT TEXT IS REFUSED AT INSTALL, over a list<enum> and over the list<text> every list takes', async () => {
  /* `tagsRefusing` passed over a word that was not a string and nothing else asked, so `tag: 5` installed; the pass
     added the 5 to the row's tags as it was, `coerce` refused a number in either list, and the rule's whole patch went.
     Measured: over `[late]` the Rent went in as `{"what":"Rent"}`, and over `list<text>` with
     `then: [{ tag: 5 }, { set: note }]` it lost the note too. */
  const enumJobs: Declaration = {
    id: 'register.jobs',
    kind: 'register',
    body: { id: 'jobs', name: 'Jobs', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'tags', type: 'list', of: 'enum', values: ['late'] }] } as never,
  };
  const { k } = await open();
  const t1 = await k.install([enumJobs, rule({ register: 'jobs', then: [{ tag: 5 }] })]);
  assert.equal(t1.ok, false, 'tag: 5 installed over list<enum> [late]');
  assert.equal(codeOf(t1), 'DECLARATION_INVALID');
  assert.equal((t1 as { refusal?: { at?: string } }).refusal?.at, 'then[0].tag');
  assert.equal(fixOf(t1), `rule.late's then[0].tag is 5, and a tag is a word. Write "5".`);

  const t1b = await refusal({ register: 'jobs', then: [{ tag: 5 }, { set: { field: 'what', to: 'seen' } }] });
  assert.equal(t1b.at, 'then[0].tag');
  const untag = await refusal({ register: 'jobs', then: [{ untag: ['late'] }] });
  assert.equal(untag.at, 'then[0].untag');
  assert.equal(untag.fix, `rule.late's then[0].untag is ["late"], and a tag is one word. Write it as text.`);
  const onRun = await refusal({ on: { written: { register: 'jobs', op: ['create'] } }, steps: [{ if: 'what is x', then: [{ tag: true }] }] });
  assert.equal(onRun.at, 'steps[0].then[0].tag');
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

test('A RULE ALREADY INSTALLED WITH A LIST IN ITS CREATE DOES NOT THROW OUT OF THE WRITE', async () => {
  /* THE BODY IS WRITTEN UNDER THE LINT, straight into the declaration row, because a record installed before the lint
     refused it still holds it. Measured: this write throws `TypeError: template.replace is not a function`, and so the
     Jobs row a person asked for is not written either. */
  const { k, sql } = await open();
  const out = await k.install([list('jobs'), list('bills'), rule({ ...LATE, then: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent' } } }] })]);
  assert.ok(out.ok, fixOf(out));
  sql.exec("UPDATE declaration SET body = json_set(body, '$.then', json(?)) WHERE id = 'rule.late'", JSON.stringify(LATE.then));

  const wrote = k.create('jobs', { what: 'x' }, { actor: 'p_1' });
  assert.ok(wrote.ok);
  assert.equal(sql.all("SELECT 1 AS x FROM entry WHERE register = 'jobs'").length, 1);
  /* PASSED THROUGH AS IT WAS WRITTEN. The list reads `["late"]` as its own type, so the row the rule meant is made. */
  assert.deepEqual(bills(sql).map(({ what, tags }) => ({ what, tags })), [{ what: 'Rent', tags: ['late'] }]);
});

test('A RULE ALREADY INSTALLED WITH A NUMBER IN A set OR A note DOES NOT THROW OUT OF THE WRITE EITHER', async () => {
  /* EVERY OTHER SITE REACHES `fill` DIRECTLY, not through `withEach`, and `fill`'s first line was `template.replace`.
     Measured before the guard: this body, written under the lint, threw `template.replace is not a function` out of the
     Jobs write, the same as the create above. */
  const { k, sql } = await open();
  const out = await k.install([list('jobs'), list('bills'), rule({ register: 'jobs', once_per: ['entry'], then: [{ set: { field: 'n', to: '1' } }] })]);
  assert.ok(out.ok, fixOf(out));
  sql.exec("UPDATE declaration SET body = json_set(body, '$.then', json(?)) WHERE id = 'rule.late'", JSON.stringify([{ set: { field: 'n', to: 5 } }, { note: 7 }]));

  const wrote = k.create('jobs', { what: 'x' }, { actor: 'p_1' });
  assert.ok(wrote.ok, fixOf(wrote));
  const jobs = sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'jobs'").map((r) => JSON.parse(r.fields) as Record<string, unknown>);
  assert.deepEqual(jobs.map(({ what, n }) => ({ what, n })), [{ what: 'x', n: 5 }]);
});

/** A list with a lifecycle, for `move`: the pass writes a move's word into the register's state field as it is. */
const STATED: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    state: 'state',
    fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }, { id: 'state', type: 'enum', values: ['open', 'done'] }],
  } as never,
};

test('A move WHOSE WORD IS NOT TEXT IS REFUSED AT INSTALL, naming the states the list has', async () => {
  /* `fillSites` did not list `move`, since nothing fills it, and so nothing asked what it held. Measured before this
     check: `then: [{ move: 5 }, { set: note }]` installed over Jobs, and the Water row was written holding `what`
     alone, the move and the note both lost, because the pass puts the 5 into the enum as it is and the write refuses
     the rule's whole patch. */
  const { k } = await open();
  const five = await k.install([STATED, rule({ register: 'jobs', then: [{ move: 5 }, { set: { field: 'note', to: 'seen' } }] })]);
  assert.equal(five.ok, false, 'move: 5 installed');
  assert.equal(codeOf(five), 'DECLARATION_INVALID');
  assert.equal((five as { refusal?: { at?: string } }).refusal?.at, 'then[0].move');
  assert.equal(fixOf(five), `rule.late's then[0].move is 5, and a move names one of jobs's states as text: open or done.`);
  assert.deepEqual((five as { refusal?: { allowed?: string[] } }).refusal?.allowed, ['open', 'done']);

  const list = await k.install([STATED, rule({ register: 'jobs', then: [{ move: ['done'] }] })]);
  assert.equal(list.ok, false, 'move: ["done"] installed');
  assert.equal(fixOf(list), `rule.late's then[0].move is ["done"], and a move names one of jobs's states as text: open or done.`);

  /* A STEP ON THE RUN PATH IS HELD THE SAME, inside a branch too, since it acts through the same pass. */
  const onRun = await k.install([STATED, rule({ on: { written: { register: 'jobs', op: ['create'] } }, steps: [{ if: 'what is x', then: [{ move: true }] }] })]);
  assert.equal(onRun.ok, false, 'move: true installed on the run path');
  assert.equal((onRun as { refusal?: { at?: string } }).refusal?.at, 'steps[0].then[0].move');

  /* WHERE THE LIST IS NOT KNOWN, as for a dry run's body, the sentence hands back the quoted form, as a tag's does. */
  const { inlineFault } = await import('../src/flow-lint.ts');
  assert.equal(inlineFault('rule.late', { rule: 'late', register: 'jobs', then: [{ move: 5 }] } as never)?.fix, `rule.late's then[0].move is 5, and a move names a state as text. Write "5".`);
});

test('A move WRITTEN AS TEXT STILL INSTALLS AND MOVES THE ROW, the note beside it kept', async () => {
  const { k, sql } = await open();
  const out = await k.install([STATED, rule({ register: 'jobs', then: [{ move: 'done' }, { set: { field: 'note', to: 'seen' } }] })]);
  assert.ok(out.ok, fixOf(out));
  assert.ok(k.create('jobs', { what: 'Water', state: 'open' }, { actor: 'p_1' }).ok);
  const rows = sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'jobs'").map((r) => JSON.parse(r.fields) as Record<string, unknown>);
  assert.deepEqual(rows, [{ what: 'Water', state: 'done', note: 'seen' }]);
});

/**
 * THE DRY RUN'S HALF. The guard in `rules.ts`'s `fill` (`7869be84`) stopped every throw measured here, the bodies below
 * and the two stored-rule tests above. Measured after it: the kernel's `dryRun` of `note: 5`, `set.to: 5`,
 * `notify.say: true` and `schedule.note: 5` answered `ok`, each previewing its value as words ("note 5", "notify
 * true"), for bodies `install` refuses. A preview that promises what the install then refuses is the preview being
 * wrong about the feature it exists to explain, so the dry run should refuse them in the install's words. `inlineFault`
 * is those words for a body that did not come through `install`.
 */
const NOT_TEXT: [Record<string, unknown>, string][] = [
  [{ note: 5 }, 'then[0].note'],
  [{ set: { field: 'n', to: 5 } }, 'then[0].set.to'],
  [{ notify: { say: true } }, 'then[0].notify.say'],
  [{ schedule: { in: '14d', note: 5 } }, 'then[0].schedule.note'],
  [{ link: { field: 'what', to: { register: 'bills', by: 'what', value: 5 } } }, 'then[0].link.to.value'],
];

test('inlineFault ANSWERS EACH OF THE NOT-TEXT BODIES WITH THE REFUSAL install GIVES IT, word for word', async () => {
  const { inlineFault } = await import('../src/flow-lint.ts');
  for (const [then, at] of NOT_TEXT) {
    const body = { register: 'jobs', once_per: ['entry'], then: [then] };
    const installed = await refusal(body);
    const linted = inlineFault('rule.late', { rule: 'late', ...body } as never);
    assert.deepEqual({ code: linted?.code, fix: linted?.fix, at: linted?.at }, installed, JSON.stringify(then));
    assert.equal(linted?.at, at);
  }
  assert.equal(inlineFault('rule.late', { rule: 'late', register: 'jobs', then: [{ if: 'what is x', then: [{ note: 'x' }] }] } as never)?.code, 'NOT_IN_THIS_BUILD');
  assert.equal(inlineFault('rule.late', { rule: 'late', register: 'jobs', then: [{ note: 'Made {{id}}' }] } as never), null);
  /* A RUN'S then: IS A LIST OF STEPS, AND AN if THERE BRANCHES. Checked: this body installs, and the first cut of
     `inlineFault` refused it "does not branch", so a dry run asking it of a run-path body would have refused what
     install takes. Its value is still held to text, since a step acts through the same pass. */
  const run = { rule: 'late', on: { written: { register: 'jobs', op: ['create'] } }, once_per: ['entry'], then: [{ if: 'what is x', then: [{ note: 'seen' }] }] };
  assert.equal(inlineFault('rule.late', run as never), null);
  assert.equal(inlineFault('rule.late', { ...run, then: [{ if: 'what is x', then: [{ note: 5 }] }] } as never)?.at, 'then[0].then[0].note');
});

test(
  'THE KERNEL\'S DRY RUN REFUSES THE NOT-TEXT BODIES IN THE INSTALL\'S WORDS, rather than previewing their values as words',
  async () => {
    const { k } = await open();
    assert.ok((await k.install([list('jobs'), list('bills')])).ok);
    assert.ok(k.create('jobs', { what: 'x' }, { actor: 'p_1' }).ok);
    for (const [then, at] of NOT_TEXT) {
      const out = k.dryRun({ rule: 'late', register: 'jobs', once_per: ['entry'], then: [then] } as never);
      assert.equal(out.ok, false, `previewed ${JSON.stringify(then)}`);
      assert.equal((out as { refusal?: { at?: string } }).refusal?.at, at);
    }
  },
);
