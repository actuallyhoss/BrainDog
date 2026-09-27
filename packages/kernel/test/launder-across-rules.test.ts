/**
 * A secret copied into a field every reader of the list sees, refused where it is written: audit fifty-one §3.
 *
 * WHAT THE AUDIT MEASURED. The lint followed a secret into the row within one rule's steps and no further: it held a
 * set of what each step list wrote from `pin`, and refused a question or a call later in THE SAME list that read one
 * of those fields. A record has more than one rule. `rule.write` (on create, `set: { field: note, to: '{{pin}}' }`)
 * and `rule.ask` (on an ordinary edit of `what`, `ask_slash: 'Rate for {{note}}?', about: [note]`) each installed
 * clean, since neither body says both, and the edit queued `Rate for hunter2?` with `about: { note: 'hunter2' }`. The
 * runner's `-unsent` is one run's too, so it held nothing back. And `set: { field: '{{vars.f}}', to: '{{pin}}' }`
 * with `f` set to `note` passed the lint and the runner alike, because both read the field as written, braces and all,
 * while the pass wrote the field the braces were filled to.
 *
 * THE REPAIR IS AT THE WRITE, NOT AT EVERY READER. A `set` or a `tag` whose value reaches a secret or file field, by
 * any spelling the question check knows, is refused unless the field it writes never leaves the record either; and a
 * `set` names a field of its list as written. Once nothing can copy a secret into a field that may leave, no reader in
 * this rule or another has anything to follow, which is why the per-question walk over what a step wrote is gone.
 *
 * AND SINCE WAVE FIFTY-FIVE THE RUNNER REFUSES THAT WRITE TOO, for a rule stored past the lint, where before it wrote the
 * copy and held the field back from what leaves. So the test of that holding back now starts from a run an earlier
 * build took past its write, put in by SQL, and a stored rule is held to writing nothing from the secret.
 *
 * AND A `list<secret>` IS A SECRET HERE, as the write path already reads it (`index.ts`, `field.of === 'secret'`).
 * `declare.ts` refuses such a field at install, so only a list stored past that lint holds one; the lint and the
 * runner read it by its element type now, as `redacts` does.
 *
 * `hunter2` IS PUT IN BY SQL AFTER THE ROW IS MADE AND BEFORE THE DRAIN, as `slash-launder-row.test.ts` puts it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'pin', type: 'secret' },
      { id: 'spare', type: 'secret' },
      { id: 'scan', type: 'file' },
    ],
  } as never,
};

const CREATED = { written: { register: 'obligations', op: ['create'] } };
const rule = (id: string, body: Record<string, unknown>): Declaration => ({ id: `rule.${id}`, kind: 'rule', body: { rule: id, ...body } as never });
const steps = (list: unknown[], id = 'rate'): Declaration => rule(id, { on: CREATED, once_per: ['entry'], steps: list });
const inline = (then: unknown[], id = 'rate'): Declaration => rule(id, { register: 'obligations', then });

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

type Said = { code: string; fix: string; at?: string } | null;
const refusal = (r: Result<unknown>): Said =>
  r.ok ? null : 'refusal' in r ? { code: r.refusal.code, fix: r.refusal.fix, ...(r.refusal.at === undefined ? {} : { at: r.refusal.at }) } : { code: 'conflict', fix: '' };

async function opened(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { answersSlash: true });
  value(await k.install([OBLIGATIONS]));
  return { k, sql, clock };
}

const COPIED = /and a secret field is copied only into another secret or file field/;

test('THE PROBE\'S TWO RULES: the one that writes note from pin is refused, whichever rule would read note', async () => {
  const { k, sql } = await opened();
  const write = steps([{ set: { field: 'note', to: '{{pin}}' } }], 'write');
  const ask = rule('ask', {
    on: { written: { register: 'obligations', op: ['update'], fields: ['what'] } },
    once_per: ['entry'],
    steps: [{ ask_slash: { question: 'Rate for {{note}}?', about: ['note'], as: 'rate' } }],
  });
  const out = refusal((await k.install([write, ask])) as Result<unknown>);
  assert.equal(out?.code, 'DECLARATION_INVALID', out?.fix ?? 'the pair installed');
  assert.match(out!.fix, /^rule\.write writes note from \{\{pin\}\} at steps\[0\]/);
  assert.match(out!.fix, COPIED);
  /* ALONE, WITH NO READER AT ALL, since the field is one every reader of the list sees. */
  assert.match(refusal((await k.install([write])) as Result<unknown>)?.fix ?? 'installed', COPIED);
  /* AND THE READER ALONE STILL INSTALLS: it asks about a text field, which may leave. */
  assert.equal(refusal((await k.install([ask])) as Result<unknown>), null);
  sql.close();
});

test('EVERY SPELLING THE QUESTION CHECK KNOWS IS REFUSED IN A SET OR A TAG, on both paths, naming the step and the way back', async () => {
  const { k, sql } = await opened();
  const cases: [string, Declaration, RegExp][] = [
    ['run: {{pin}}', steps([{ set: { field: 'note', to: 'Bearer {{pin}}' } }]), /writes note from \{\{pin\}\} at steps\[0\]/],
    ['run: {{money:pin}}', steps([{ set: { field: 'note', to: '{{money:pin}}' } }]), /writes note from \{\{money:pin\}\} at steps\[0\]/],
    ['run: {{trigger.row.pin}}', steps([{ set: { field: 'note', to: '{{trigger.row.pin}}' } }]), /writes note from \{\{trigger\.row\.pin\}\} at steps\[0\]/],
    ['run: spaces inside the braces', steps([{ set: { field: 'note', to: '{{ trigger.row.pin }}' } }]), /writes note from \{\{ trigger\.row\.pin \}\} at steps\[0\]/],
    ['run: the whole row', steps([{ set: { field: 'note', to: '{{trigger.row}}' } }]), /writes note from \{\{trigger\.row\}\} at steps\[0\], which is the whole obligations row, pin in it/],
    [
      'run: by way of a variable',
      steps([{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { set: { field: 'note', to: '{{vars.p}}' } }]),
      /writes note from \{\{vars\.p\}\} at steps\[1\], and p holds pin: steps\[0\] put it there with \{\{trigger\.row\.pin\}\}/,
    ],
    [
      'run: by way of two variables',
      steps([{ set_var: { name: 'p', to: '{{pin}}' } }, { set_var: { name: 'q', to: 'x {{vars.p}}' } }, { set: { field: 'note', to: '{{vars.q}}' } }]),
      /writes note from \{\{vars\.q\}\} at steps\[2\], and q holds pin, by way of p: steps\[0\] put it there with \{\{pin\}\}/,
    ],
    ['run: a tag the run fills', steps([{ tag: '{{trigger.row.pin}}' }]), /writes tags from \{\{trigger\.row\.pin\}\} at steps\[0\]/],
    ['run: inside a branch', steps([{ if: 'what is Rent', then: [{ set: { field: 'note', to: '{{pin}}' } }] }]), /at steps\[0\]\.then\[0\]/],
    ['inline: {{pin}}', inline([{ set: { field: 'note', to: '{{pin}}' } }]), /writes note from \{\{pin\}\} at then\[0\]/],
    ['inline: after a plain set', inline([{ tag: 'late' }, { set: { field: 'note', to: 'Bearer {{money:pin}}' } }]), /writes note from \{\{money:pin\}\} at then\[1\]/],
  ];
  for (const [what, decl, said] of cases) {
    const out = refusal((await k.install([decl])) as Result<unknown>);
    assert.equal(out?.code, 'DECLARATION_INVALID', `${what}: ${out?.fix ?? 'installed'}`);
    assert.match(out!.fix, /^rule\.rate writes/, what);
    assert.match(out!.fix, COPIED, `${what}: ${out!.fix}`);
    assert.match(out!.fix, said, `${what}: ${out!.fix}`);
  }
  sql.close();
});

test('WHAT COPIES NO SECRET INTO A FIELD THAT MAY LEAVE STILL INSTALLS', async () => {
  const { k, sql } = await opened();
  for (const [what, decl] of [
    /* THE FIELD WRITTEN NEVER LEAVES EITHER, so nothing is copied to a reader who could not already see it. */
    ['run: into another secret field', steps([{ set: { field: 'spare', to: '{{pin}}' } }])],
    ['run: into a file field', steps([{ set: { field: 'scan', to: '{{trigger.row.pin}}' } }])],
    ['inline: into another secret field', inline([{ set: { field: 'spare', to: '{{pin}}' } }])],
    /* THE WORDS AS TYPED: the run fills a tag from `{{vars.…}}` and `{{trigger.…}}` only, so this does not read `pin`.
       An inline `set` of the run's braces was a case here too, and the lint now refuses it as a hole nothing fills
       (`flow-lint.ts`'s `holeIn`, `loop/finish/defects.md` A8). */
    ['run: a tag of the braces', steps([{ tag: '{{pin}}' }])],
    ['run: a variable set plainly again before the write', steps([{ set_var: { name: 'p', to: '{{pin}}' } }, { set_var: { name: 'p', to: '{{what}}' } }, { set: { field: 'note', to: '{{vars.p}}' } }])],
    ['run: fields that may leave', steps([{ set: { field: 'note', to: '{{what}} {{trigger.row.what}}' } }])],
  ] as const) {
    const out = refusal((await k.install([decl])) as Result<unknown>);
    assert.equal(out, null, `${what}: ${out?.fix}`);
  }
  sql.close();
});

test('A SET NAMES THE FIELD IT WRITES AS ONE OF ITS LIST\'S FIELD IDS, on both paths', async () => {
  const { k, sql } = await opened();
  /* THE PROBE'S L4. `f` is `note`, the pass writes `note`, and the lint and the runner both read `{{vars.f}}`. */
  const templated = refusal(
    (await k.install([steps([{ set_var: { name: 'f', to: 'note' } }, { set: { field: '{{vars.f}}', to: '{{pin}}' } }, { ask_slash: { question: 'Rate for {{note}}?', about: ['note'], as: 'rate' } }])])) as Result<unknown>,
  );
  assert.equal(templated?.code, 'DECLARATION_INVALID', templated?.fix ?? 'installed');
  assert.equal(templated?.at, 'steps[1].set.field');
  assert.match(templated!.fix, /rule\.rate writes \{\{vars\.f\}\} at steps\[1\], and a set names the field it writes by its id in obligations, never by braces the run fills/);
  for (const [what, decl, at] of [
    ['run', steps([{ set: { field: 'nope', to: 'x' } }]), 'steps[0].set.field'],
    ['inline', inline([{ set: { field: 'nope', to: 'x' } }]), 'then[0].set.field'],
  ] as const) {
    const out = refusal((await k.install([decl])) as Result<unknown>);
    assert.equal(out?.code, 'FIELD_UNKNOWN', `${what}: ${out?.fix ?? 'installed'}`);
    assert.equal(out?.at, at, what);
    assert.match(out!.fix, /obligations has no field called nope/, what);
  }
  /* `tags` IS ONE EVERY LIST TAKES, declared or not (`withTags`), so a set of it is a set of a field of the list. */
  assert.equal(refusal((await k.install([steps([{ set: { field: 'tags', to: 'late' } }])])) as Result<unknown>), null);
  sql.close();
});

/** L4 as a step list: `f` is `note`, and the `set` names its field as `{{vars.f}}`. */
const BRACED = [
  { set_var: { name: 'f', to: 'note' } },
  { set: { field: '{{vars.f}}', to: '{{pin}}' } },
  { ask_slash: { question: 'Rate for {{note}} {{trigger.row.note}}?', about: ['note', 'what'], as: 'rate' } },
];

/** `rule.rate` written into the table past the lint as `list`, and a row made, with `pin` put in by SQL after it. */
async function storedRate(list: unknown[]): Promise<{ k: Kernel; sql: NodeSql; made: Entry; run: string }> {
  const { sql, clock } = await opened();
  let k = await openRecord(sql, clock, { answersSlash: true });
  value(await k.install([steps([{ set_var: { name: 'x', to: 'y' } }])]));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: CREATED, once_per: ['entry'], steps: list }));
  k = await openRecord(sql, clock, { answersSlash: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  const run = sql.one<{ id: string }>("SELECT id FROM automation_run WHERE rule = 'rate'")!.id;
  return { k, sql, made, run };
}

test('A RULE STORED PAST THE LINT WITH ITS FIELD IN BRACES IS REFUSED AT THE FIELD THE BRACES FILL TO, at run time', async () => {
  /* MEASURED AT HEAD `b7409d2d`, BEFORE THIS CHANGE: the run wrote `hunter2` into `note` and held `note` back from the
     question, and the test that stood here pinned that the row kept it. The runner reads the field the run filled
     `{{vars.f}}` to, `note`, which every reader of the list sees, so the step is refused and the question after it is
     never asked. */
  const { k, sql, made } = await storedRate(BRACED);
  await k.drain();
  const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'rate'");
  assert.equal(run?.state, 'failed', run?.say ?? '');
  assert.match(run!.say ?? '', /\{\{pin\}\}/);
  assert.match(run!.say ?? '', /secret or file field/);
  assert.doesNotMatch(run!.say ?? '', /hunter2/);
  assert.equal(sql.one<{ v: string }>("SELECT json_extract(fields, '$.note') AS v FROM entry WHERE id = ?", made.id)?.v, 'plain');
  assert.deepEqual(k.leaseOutbox(['infer.ask'], 10), []);
  sql.close();
});

test('A RUN A BUILD BEFORE -unsent TOOK PAST THAT WRITE HOLDS THE FIELD THE BRACES FILLED TO BACK FROM SLASH', async () => {
  /* THE SECOND LINE, for L4: `writes()` read the step's `field` as written, so `-unsent` held `{{vars.f}}` and the
     question read `note` as the step left it. Measured before the repair through this harness: `Rate for hunter2
     hunter2?` with `about: { note: 'hunter2', what: 'Rent' }`.

     THE WRITE IS PUT IN BY SQL, as that build left it, since this build refuses it (the test above): `note` holds
     `hunter2`, the step rows say the `set_var` answered `note` and the `set` was done, and the column holds `-sendable`
     alone. This build replays the two steps to rebuild `-unsent` (`flow.ts`'s `rebuilt`), and the replay is where
     `writes()` reads the field the braces fill to. */
  const { k, sql, made, run } = await storedRate(BRACED);
  const at = new Date(NOW).toISOString();
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.note', 'hunter2') WHERE id = ?", made.id);
  sql.exec("INSERT INTO automation_step (run, n, kind, state, answer, ms, at) VALUES (?, 0, 'set_var', 'done', 'note', NULL, ?), (?, 1, 'set', 'done', NULL, NULL, ?)", run, at, run, at);
  sql.exec('UPDATE automation_run SET step = 2, vars = ? WHERE id = ?', JSON.stringify({ f: 'note', '-sendable': {} }), run);
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, `no infer.ask row was queued, and the run is ${JSON.stringify(sql.all("SELECT state, say FROM automation_run WHERE rule = 'rate'"))}`);
  assert.doesNotMatch(job.payload, /hunter2/, job.payload);
  const payload = JSON.parse(job.payload) as { question: string; about?: Record<string, unknown> };
  assert.equal(payload.question, 'Rate for — —?');
  assert.deepEqual(payload.about, { what: 'Rent' });
  sql.close();
});

/** Obligations with `keys` a `list<secret>`, written into the table past `declare.ts`'s refusal of one. */
async function sealedList(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const { sql, clock } = await opened();
  const body = OBLIGATIONS.body as { fields: unknown[] };
  sql.exec(
    "UPDATE declaration SET body = ? WHERE id = 'register.obligations' AND superseded_at IS NULL",
    JSON.stringify({ ...body, fields: [...body.fields, { id: 'keys', type: 'list', of: 'secret' }] }),
  );
  return { k: await openRecord(sql, clock, { answersSlash: true }), sql, clock };
}

test('A LIST<SECRET> IS A SECRET TO THE LINT: not sent, not asked about, not copied', async () => {
  const { k, sql } = await sealedList();
  /* THE PREMISE, MEASURED: the write path reads the field as sealed, which is the reading the lint now shares. */
  const made = k.create('obligations', { what: 'Rent', keys: ['g_1'] }, { actor: 'p_1' });
  assert.equal(refusal(made as Result<unknown>)?.code, 'IMMUTABLE_FIELD');
  for (const [what, list, said] of [
    ['about', [{ ask_slash: { question: 'Rate?', about: ['keys'], as: 'rate' } }], /sends keys to Slash at steps\[0\], and a secret field never leaves the record/],
    ['the question', [{ ask_slash: { question: 'Rate for {{keys}}?', as: 'rate' } }], /puts keys in its question to Slash at steps\[0\] with \{\{keys\}\}, and a secret field never leaves the record/],
    ['a set', [{ set: { field: 'note', to: '{{trigger.row.keys}}' } }], /writes note from \{\{trigger\.row\.keys\}\} at steps\[0\]/],
  ] as const) {
    const out = refusal((await k.install([steps([...list])])) as Result<unknown>);
    assert.equal(out?.code, 'DECLARATION_INVALID', `${what}: ${out?.fix ?? 'installed'}`);
    assert.match(out!.fix, said, `${what}: ${out!.fix}`);
  }
  /* AND IT IS A FIELD THAT NEVER LEAVES, so a secret copied into it is not copied anywhere a reader sees. */
  assert.equal(refusal((await k.install([steps([{ set: { field: 'keys', to: '{{pin}}' } }])])) as Result<unknown>), null);
  sql.close();
});

test('A LIST<SECRET> IS LEFT OUT OF A QUESTION TO SLASH BY THE RUNNER, for a rule stored past the lint', async () => {
  /* `sendable` ASKED THE FIELD'S OWN TYPE, which is `list`. Measured before the repair: `Rate for hunter2 ["hunter2"]?`
     with `about: { keys: ['hunter2'], what: 'Rent' }`. */
  const { sql, clock } = await sealedList();
  let k = await openRecord(sql, clock, { answersSlash: true });
  value(await k.install([steps([{ set_var: { name: 'x', to: 'y' } }])]));
  const list = [{ ask_slash: { question: 'Rate for {{keys}} {{trigger.row.keys}}?', about: ['keys', 'what'], as: 'rate' } }];
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: CREATED, once_per: ['entry'], steps: list }));
  k = await openRecord(sql, clock, { answersSlash: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.keys', json('[\"hunter2\"]')) WHERE id = ?", made.id);
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  assert.doesNotMatch(job.payload, /hunter2/, job.payload);
  const payload = JSON.parse(job.payload) as { question: string; about?: Record<string, unknown> };
  assert.equal(payload.question, 'Rate for — —?');
  assert.deepEqual(payload.about, { what: 'Rent' });
  sql.close();
});
