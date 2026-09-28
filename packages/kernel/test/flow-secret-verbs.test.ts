/**
 * A secret followed through every verb, not some: roadmap W53 "A secret is followed through every verb" (SEC-1 to 3),
 * the half wave fifty-three held back.
 *
 * WHAT WAS MEASURED AT HEAD `afb3b1b2`, BEFORE THE REPAIR, over a list whose `pin` is secret:
 *
 *   - At install, the lint followed a secret into a `set`, a `tag` and a question to Slash and into nothing else.
 *     `note`, `notify`, `schedule`, `create` into another list's text field, `suggest`, `link` and a question to a
 *     person each installed holding `{{pin}}` or `{{trigger.row.pin}}`, on both paths, and a step crossing `each: [pin]`
 *     installed too. That is SEC-1, and the recorded finding named only the `create`; measuring found all of them.
 *   - At run time, a rule stored past the lint wrote `hunter2` into the note event, a Payments row, the schedule and
 *     the question queue through every one of those verbs, and into the row itself through `set` and `tag`. Wave
 *     fifty-four refused the first set at run time and still wrote the last two, holding the field back from what
 *     leaves, because four test files stored such a copy to reach the lines after it. Those files now put the copy in
 *     by SQL, as a row an earlier build wrote, and `set` and `tag` are refused at run time with the rest.
 *   - An `untag` reading the secret installed, since it adds no word, and then failed its run whenever the secret held
 *     anything, because the run-time check read every string the run filled and named `set` and `tag` alone as
 *     exempt. It copies nothing, so it runs now (the untag test below).
 *   - Each text was filled twice. `rules.ts`'s `withEach` wrote a create's tuple in and `fill` then read the row's
 *     fields out of the result, so a `kinds` item `{{pin}}` crossed into `what: 'x {{each.0}}'` wrote `x hunter2`; and a
 *     run wrote its own paths into a step before the pass filled it from the row, so `{{trigger.row.note}}` over a
 *     `note` holding the words `{{pin}}` wrote `is hunter2`. That is SEC-3, and no lint can see it, since the braces
 *     are data.
 *
 * AND THE FIRST TEST IS THE ONE THE HELD ATTEMPT FAILED. Its run-time check compared each step filled from the row with
 * the same step filled from `sendable`'s row, which also drops every field the live list does not declare, so a list
 * with no secret field at all had its rules refused at run time. A check that fires only when a value came from a field
 * declared secret or file, or from a variable set from one, has to leave that list alone, and has to leave alone a
 * text field that merely holds the same words as the secret.
 *
 * `hunter2` IS PUT IN BY SQL AFTER THE ROW IS MADE AND BEFORE THE DRAIN, as `slash-launder-row.test.ts` puts it: in
 * use a secret field holds a vault grant's id, and a plaintext is the plainest way to see where it went.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { ACTIONS, VERBS } from '../src/flow-lint.ts';
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
      { id: 'memo', type: 'text' },
      { id: 'kinds', type: 'list', of: 'text' },
      { id: 'pin', type: 'secret' },
      { id: 'spare', type: 'secret' },
    ],
  } as never,
};

/** Another list, for a `create` into it and a `link` by it. `code` never leaves, so a copy into it is let through. */
const PAYMENTS: Declaration = {
  id: 'register.payments',
  kind: 'register',
  body: {
    id: 'payments',
    name: 'Payments',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'code', type: 'secret' },
    ],
  } as never,
};

/** A list with no field that never leaves, for the false positive. */
const JOBS: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'memo', type: 'text' },
    ],
  } as never,
};

const on = (register: string) => ({ written: { register, op: ['create'] } });
const rule = (body: Record<string, unknown>, id = 'copy'): Declaration => ({ id: `rule.${id}`, kind: 'rule', body: { rule: id, ...body } as never });
const steps = (list: unknown[], register = 'obligations', id = 'copy'): Declaration => rule({ on: on(register), once_per: ['entry'], steps: list }, id);
const inline = (then: unknown[], register = 'obligations', id = 'copy'): Declaration => rule({ register, once_per: ['entry'], then }, id);

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};
const refusal = (r: Result<unknown>): { code: string; fix: string; at?: string } | null =>
  r.ok ? null : 'refusal' in r ? { code: r.refusal.code, fix: r.refusal.fix, ...(r.refusal.at === undefined ? {} : { at: r.refusal.at }) } : { code: 'conflict', fix: '' };

type Step = Record<string, unknown>;

/**
 * Each verb, and what it does with text.
 *
 * `copies` IS EVERY PLACE THE VERB PUTS TEXT, as a step with that text in it. `rowFilled` says the pass fills it from the
 * row too, so the row's own `{{pin}}` reaches the secret there as well as the run's `{{trigger.row.pin}}`; `runOnly`
 * names the copies it does not. `atRun` is what the runner does with a rule stored past the lint: `refuses` fails the
 * run at the step, a `set` and a `tag` of the run's own row included; `cleans` asks the question with the dash where
 * the secret was; `asks` is a question to Slash, which `slash-vars-hidden.test.ts` and `flow-waits.test.ts` hold; and
 * `unbuilt` is a step whose runtime is not in this build.
 * `plain` is the same verb writing into a field that never leaves either. `none` is a verb that copies no text, and why.
 */
type Fixture =
  | { copies: ((text: string) => Step)[]; rowFilled: boolean; runOnly?: number[]; atRun: 'refuses' | 'cleans' | 'asks' | 'unbuilt'; plain?: (text: string) => Step }
  | { none: string };

const FIXTURES: Record<string, Fixture> = {
  tag: { copies: [(t) => ({ tag: t })], rowFilled: false, atRun: 'refuses' },
  untag: { none: 'an untag writes back the words the row already holds, less one, and adds none' },
  set: { copies: [(t) => ({ set: { field: 'memo', to: t } })], rowFilled: true, atRun: 'refuses', plain: (t) => ({ set: { field: 'spare', to: t } }) },
  move: { copies: [(t) => ({ move: t })], rowFilled: false, atRun: 'refuses' },
  link: { copies: [(t) => ({ link: { field: 'memo', to: { register: 'payments', by: 'what', value: t } } })], rowFilled: true, atRun: 'refuses' },
  note: { copies: [(t) => ({ note: t })], rowFilled: true, atRun: 'refuses' },
  notify: { copies: [(t) => ({ notify: { say: t } })], rowFilled: true, atRun: 'refuses' },
  schedule: { copies: [(t) => ({ schedule: { in: '14d', note: t } })], rowFilled: true, atRun: 'refuses' },
  create: {
    copies: [(t) => ({ create: { register: 'payments', bound: 1, fields: { what: t } } })],
    rowFilled: true,
    atRun: 'refuses',
    plain: (t) => ({ create: { register: 'payments', bound: 1, fields: { what: 'Paid', code: t } } }),
  },
  suggest: {
    copies: [(t) => ({ suggest: { question: t, options: ['yes', 'no'] } }), (t) => ({ suggest: { question: 'Pay?', options: [t, 'no'] } })],
    rowFilled: true,
    runOnly: [1],
    atRun: 'refuses',
  },
  run: { none: "a call sends the fields its own sends: names, which queueCall holds to the ones that may leave; the rule adds no text to it" },
  stop: { none: 'a stop carries nothing' },
  if: { none: 'a condition is read, and nothing it names is written anywhere' },
  set_var: { none: 'a variable is carried, not written: the check follows it into every verb above that writes it out' },
  script: { copies: [(t) => ({ script: { id: 'rates', input: { key: t }, as: 'out' } })], rowFilled: false, atRun: 'unbuilt' },
  call: { none: "a call step names a declared call and sends that call's declared fields, as run: does" },
  ask_slash: { copies: [(t) => ({ ask_slash: { question: t, as: 'rate' } })], rowFilled: true, atRun: 'asks' },
  ask_person: { copies: [(t) => ({ ask_person: { question: t, options: ['yes', 'no'], as: 'a' } })], rowFilled: true, atRun: 'cleans' },
  wait: { none: 'a wait holds a span and no text' },
  meet: {
    copies: [(t) => ({ meet: { name: t, where: 'mail' } }), (t) => ({ meet: { email: 'a@b.example', where: t } })],
    rowFilled: true,
    atRun: 'refuses',
  },
  run_job: { copies: [(t) => ({ run_job: { kind: 'job.notes', args: { topic: t } } })], rowFilled: true, atRun: 'refuses' },
};

/** The run's spellings of `pin`, each with the steps it needs before it. */
const RUN_SPELLINGS: { spelled: string; before: Step[] }[] = [
  { spelled: 'x {{trigger.row.pin}}', before: [] },
  { spelled: 'x {{ trigger.row.pin }}', before: [] },
  { spelled: 'x {{trigger.row}}', before: [] },
  { spelled: 'x {{vars.p}}', before: [{ set_var: { name: 'p', to: 'k {{trigger.row.pin}}' } }] },
];
/** The row's own spellings, which only a text the pass fills reaches. */
const ROW_SPELLINGS = ['x {{pin}}', 'x {{money:pin}}'];

async function opened(...more: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { answersSlash: true });
  value(await k.install([OBLIGATIONS, PAYMENTS, JOBS, ...more]));
  return { k, sql, clock };
}

/**
 * Every row of every table holding `needle`, as `table: row`, leaving out the automation tables, whose step rows
 * record what a `set_var` took (a known limit, reported, not this file's). The row's own `pin` is where the vault put
 * it, so it is taken out of each entry before the row is read.
 */
function holding(sql: NodeSql, needle: string): Set<string> {
  const out = new Set<string>();
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
      if (text.includes(needle)) out.add(`${name}: ${text}`);
    }
  }
  return out;
}

type Ran = { sql: NodeSql; k: Kernel; made: Entry; went: string[]; run: { state: string; say: string | null } | undefined };

/**
 * Store `body` past the lint as `rule.copy`, make a row of `register` with `fields`, put `pin` in it by SQL where the
 * list has one, drain, and say where `needle` went that it was not before.
 */
async function stored(body: Record<string, unknown>, fields: Record<string, unknown>, register = 'obligations', needle = 'hunter2'): Promise<Ran> {
  const { k: first, sql, clock } = await opened();
  value(await first.install([steps([{ set_var: { name: 'x', to: 'y' } }])]));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.copy' AND superseded_at IS NULL", JSON.stringify({ rule: 'copy', ...body }));
  const k = await openRecord(sql, clock, { answersSlash: true });
  const before = holding(sql, needle);
  const made = value<Entry>(k.create(register, { what: 'Rent', ...fields }, { actor: 'p_1' }));
  if (register === 'obligations') sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  const went = [...holding(sql, needle)].filter((r) => !before.has(r));
  const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'copy'");
  return { sql, k, made, went, run };
}

test('EVERY VERB THE KERNEL NAMES HAS A FIXTURE HERE, so a new verb is covered or this fails', () => {
  const missing = VERBS.filter((v) => !(v in FIXTURES));
  assert.deepEqual(missing, [], `the kernel names ${missing.join(', ')}, and this file says nothing about what it does with a secret`);
  const stale = Object.keys(FIXTURES).filter((v) => !VERBS.includes(v));
  assert.deepEqual(stale, [], `this file holds fixtures for ${stale.join(', ')}, which the kernel no longer names`);
});

test('NO FALSE POSITIVE: a list with no secret field, and a text field holding the same words as the secret, run as they always did', async () => {
  /* THE HELD ATTEMPT'S FAULT, AS A TEST. Each step below copies nothing a secret or file field gave it. On Jobs, which
     declares none, the row also carries `old`, a value under a field the list no longer declares, which is how a row
     looks after a field is taken off; `{{trigger.row}}` writes it, and `{{old}}` reads it. On Obligations, `pin` holds
     `plain` and so does `note`, and the steps read `note` alone. Each run has to finish, and each text has to be the
     words the rule named. */
  const texts = ['x {{trigger.row}} {{trigger.row.note}} {{note}} {{old}} {{vars.v}}', 'x {{trigger.row.what}} {{vars.v}}'];
  const failed: string[] = [];
  for (const register of ['jobs', 'obligations'] as const) {
    for (const verb of VERBS) {
      const f = FIXTURES[verb];
      if (f === undefined || 'none' in f || f.atRun === 'unbuilt' || f.atRun === 'asks') continue;
      for (const copy of f.copies)
        for (const text of register === 'jobs' ? texts : ['x {{note}} {{trigger.row.note}} {{vars.v}}']) {
          const set = { set_var: { name: 'v', to: register === 'jobs' ? '{{trigger.row}}' : '{{trigger.row.note}}' } };
          const sql = openSqlite();
          const k = await openRecord(sql, fixedClock(NOW), { answersSlash: true });
          const installed = await k.install([OBLIGATIONS, PAYMENTS, JOBS, rule({ on: on(register), once_per: ['entry'], steps: [set, copy(text)] })]);
          if (!installed.ok) {
            failed.push(`${register} ${verb} ${text}: install refused ${fixOf(installed)}`);
            sql.close();
            continue;
          }
          const made = value<Entry>(k.create(register, { what: 'Rent', note: 'plain', memo: 'm' }, { actor: 'p_1' }));
          sql.exec(`UPDATE entry SET fields = json_set(fields, '$.${register === 'jobs' ? 'old' : 'pin'}', ?) WHERE id = ?`, register === 'jobs' ? 'put away' : 'plain', made.id);
          await k.drain();
          const r = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'copy'");
          const settled = f.atRun === 'cleans' ? 'waiting' : 'done';
          /* A `move` ON A LIST WITH NO STATES, AND A `link` TO NOTHING, ARE THE PASS'S OWN NO-OPS AND NOT THIS CHECK. A
             `meet` with no list playing `meets:` and a `run_job` of a kind nobody approved fail on their own sentences,
             which the line after this holds to being some other sentence than the copy check's. */
          if (r?.state !== settled && !(verb === 'move' || verb === 'link' || verb === 'meet' || verb === 'run_job')) failed.push(`${register} ${verb} ${text}: the run is ${r?.state} ${r?.say ?? ''}`);
          if (/secret or file field/.test(r?.say ?? '')) failed.push(`${register} ${verb} ${text}: ${r?.say}`);
          sql.close();
        }
    }
    /* AND ON THE INLINE PATH, where the pass fills from the row alone, inside the write. */
    for (const verb of ACTIONS) {
      const f = FIXTURES[verb];
      if (f === undefined || 'none' in f || !f.rowFilled) continue;
      const sql = openSqlite();
      const k = await openRecord(sql, fixedClock(NOW), { answersSlash: true });
      value(await k.install([OBLIGATIONS, PAYMENTS, JOBS, rule({ register, once_per: ['entry'], then: [f.copies[0]!('x {{note}} {{old}}')] })]));
      const made = value<Entry>(k.create(register, { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
      sql.exec(`UPDATE entry SET fields = json_set(fields, '$.${register === 'jobs' ? 'old' : 'pin'}', ?) WHERE id = ?`, register === 'jobs' ? 'put away' : 'plain', made.id);
      value(k.update(register, made.id, { memo: 'again' }, { actor: 'p_1' }) as Result<unknown>);
      const refused = sql.all<{ subject: string }>("SELECT subject FROM observation WHERE kind = 'write.refused' AND subject LIKE '%rule.copy%'");
      if (refused.length) failed.push(`inline ${register} ${verb}: ${refused.map((r) => r.subject).join(', ')}`);
      sql.close();
    }
  }
  assert.deepEqual(failed, []);
});

test('EVERY VERB THAT COPIES TEXT IS REFUSED AT INSTALL, in every spelling that reaches the secret, on both paths', async () => {
  const { k, sql } = await opened();
  const installed: string[] = [];
  for (const verb of VERBS) {
    const f = FIXTURES[verb];
    if (f === undefined || 'none' in f) continue;
    for (const [n, copy] of f.copies.entries()) {
      const rowFilled = f.rowFilled && !f.runOnly?.includes(n);
      const spellings = [...RUN_SPELLINGS, ...(rowFilled ? ROW_SPELLINGS.map((spelled) => ({ spelled, before: [] })) : [])];
      for (const { spelled, before } of spellings) {
        const out = refusal((await k.install([steps([...before, copy(spelled)])])) as Result<unknown>);
        if (out?.code !== 'DECLARATION_INVALID' || !/pin/.test(out.fix)) installed.push(`run ${verb}#${n} ${spelled}: ${out ? `${out.code} ${out.fix}` : 'installed'}`);
        else assert.ok(out.at?.startsWith(`steps[${before.length}]`), `run ${verb}#${n} ${spelled} is refused at ${out.at}, not at the step: ${out.fix}`);
      }
      /* THE INLINE PATH FILLS WITH THE PASS ALONE, so only the row's own spellings reach the secret there, and only in
         a text the pass fills. */
      if ((ACTIONS as readonly string[]).includes(verb) && rowFilled)
        for (const spelled of ROW_SPELLINGS) {
          const out = refusal((await k.install([inline([copy(spelled)])])) as Result<unknown>);
          if (out?.code !== 'DECLARATION_INVALID' || !/pin/.test(out.fix)) installed.push(`inline ${verb}#${n} ${spelled}: ${out ? `${out.code} ${out.fix}` : 'installed'}`);
        }
    }
  }
  /* A CREATE THAT CROSSES THE SECRET copies it with no text, into `{{each.0}}` and every row's `_each`. */
  const crossed = refusal((await k.install([steps([{ create: { register: 'payments', bound: 4, each: ['pin'], fields: { what: 'x' } } }])])) as Result<unknown>);
  if (crossed?.code !== 'DECLARATION_INVALID' || crossed.at !== 'steps[0].create.each') installed.push(`run create each: [pin]: ${crossed ? `${crossed.code} ${crossed.at} ${crossed.fix}` : 'installed'}`);
  assert.deepEqual(installed, []);
  sql.close();
});

test('WHAT COPIES NO SECRET STILL INSTALLS, through every verb that copies text, and into a field that never leaves either', async () => {
  const { k, sql } = await opened();
  const refused: string[] = [];
  for (const verb of VERBS) {
    const f = FIXTURES[verb];
    if (f === undefined || 'none' in f) continue;
    const cases: [string, Declaration][] = [
      [`${verb} of fields that may leave`, steps([f.copies[0]!('{{trigger.row.what}} {{what}}')])],
      /* THE WORDS AS TYPED: a text only the run fills leaves the row's braces alone, so `{{pin}}` is written as typed. */
      ...(f.rowFilled ? [] : ([[`${verb} of the row's braces, which only the pass reads`, steps([f.copies[0]!('{{pin}}')])]] as [string, Declaration][])),
      ...(f.plain ? ([[`${verb} into a field that never leaves`, steps([f.plain('{{trigger.row.pin}}')])]] as [string, Declaration][]) : []),
    ];
    for (const [what, decl] of cases) {
      const out = refusal((await k.install([decl])) as Result<unknown>);
      if (out !== null && /pin|what/.test(out.fix) && out.code === 'DECLARATION_INVALID') refused.push(`${what}: ${out.fix}`);
    }
  }
  assert.deepEqual(refused, []);
  sql.close();
});

test('A RULE STORED PAST THE LINT COPIES THE SECRET THROUGH NO VERB AT RUN TIME: the step fails and says why, and a question is asked with the dash', async () => {
  const leaked: string[] = [];
  for (const verb of VERBS) {
    const f = FIXTURES[verb];
    if (f === undefined || 'none' in f || f.atRun === 'asks' || f.atRun === 'unbuilt') continue;
    for (const [n, copy] of f.copies.entries())
      for (const { spelled, before } of [
        { spelled: 'x {{trigger.row.pin}}', before: [] as Step[] },
        { spelled: 'x {{trigger.row}}', before: [] as Step[] },
        { spelled: 'x {{vars.p}}', before: [{ set_var: { name: 'p', to: 'k {{trigger.row.pin}}' } }] as Step[] },
        ...(f.rowFilled && !f.runOnly?.includes(n) ? [{ spelled: 'x {{pin}}', before: [] as Step[] }] : []),
      ]) {
        const { sql, went, run } = await stored({ on: on('obligations'), once_per: ['entry'], steps: [...before, copy(spelled)] }, { note: 'plain' });
        /* NOTHING NEW HOLDS IT, the run's own row included: a `set` or a `tag` of it wrote the entry, its write's event
           and its search text before wave fifty-five. */
        if (went.length) leaked.push(`${verb}#${n} ${spelled}: ${went.join(' | ')}`);
        if (f.atRun === 'refuses') {
          if (run?.state !== 'failed') leaked.push(`${verb}#${n} ${spelled}: the run is ${run?.state}, and a step that copies the secret fails it`);
          else if (!/secret or file field/.test(run.say ?? '') || /hunter2/.test(run.say ?? '')) leaked.push(`${verb}#${n} ${spelled}: ${run.say}`);
        }
        /* A QUESTION TO A PERSON IS STILL ASKED, with the dash where the secret was. */
        if (f.atRun === 'cleans') {
          const asked = question(sql);
          if (run?.state !== 'waiting' || typeof asked !== 'string') leaked.push(`${verb}#${n} ${spelled}: the run is ${run?.state} ${run?.say ?? ''} and asked ${String(asked)}`);
          else if (!['x —', 'x k —', 'x {"what":"Rent","note":"plain"}'].includes(asked)) leaked.push(`${verb}#${n} ${spelled}: asked ${asked}`);
        }
        sql.close();
      }
  }
  assert.deepEqual(leaked, []);
});

test('A RULE ON THE INLINE PATH STORED PAST THE LINT WRITES THE SECRET NOWHERE, and says which step it left out', async () => {
  const leaked: string[] = [];
  for (const verb of ACTIONS) {
    const f = FIXTURES[verb];
    if (f === undefined || 'none' in f || !f.rowFilled) continue;
    const { sql, went, made } = await stored({ register: 'obligations', once_per: ['entry', 'memo'], then: [f.copies[0]!('x {{pin}}')] }, { note: 'plain' });
    /* THE PASS RAN INSIDE THE CREATE, before `pin` was put in, so the edit here is what reaches the secret; `once_per`
       names `memo`, which the edit changes, so the rule fires again for it. */
    const { k } = await (async () => ({ k: await openRecord(sql, fixedClock(NOW), { answersSlash: true }) }))();
    value(k.update('obligations', made.id, { memo: 'again' }, { actor: 'p_1' }) as Result<unknown>);
    const after = [...holding(sql, 'hunter2')].filter((r) => !went.includes(r));
    if (after.length) leaked.push(`${verb}: ${after.join(' | ')}`);
    const refused = sql.all<{ subject: string }>("SELECT subject FROM observation WHERE kind = 'write.refused' AND subject LIKE '%rule.copy%DECLARATION_INVALID'");
    if (refused.length === 0) leaked.push(`${verb}: no refusal was observed`);
    sql.close();
  }
  assert.deepEqual(leaked, []);
});

test('A COPY INTO A FIELD THAT NEVER LEAVES EITHER IS NOT THE COPY CHECK AT RUN TIME, as the lint lets it install', async () => {
  /* ONLY THE VAULT WRITES A SECRET FIELD, so the write path refuses these on its own sentence; what this holds is that
     the copy check is not what stopped them. */
  const wrong: string[] = [];
  for (const verb of VERBS) {
    const f = FIXTURES[verb];
    if (f === undefined || 'none' in f || f.atRun !== 'refuses' || f.plain === undefined) continue;
    const { sql, run } = await stored({ on: on('obligations'), once_per: ['entry'], steps: [f.plain('{{trigger.row.pin}}')] }, { note: 'plain' });
    if (/reads what a secret|holds what a secret/.test(run?.say ?? '')) wrong.push(`${verb}: ${run?.say}`);
    sql.close();
  }
  assert.deepEqual(wrong, []);
});

test('AN UNTAG THAT READS A SECRET INSTALLS AND RUNS, since it writes back only words the row already holds', async () => {
  /* WAVE FIFTY-FOUR'S CHECKER FOUND INSTALL AND RUN DISAGREEING HERE. The lint lets an untag read the secret, as the
     fixture above says why; the runner failed the run whenever `pin` held anything, because the check read every
     string the run filled. The one thing an untag writes is the row's own `tags` less one word, so what it can tell a
     reader is whether a tag equalled the secret, which an `if` on the field already tells, and nothing it writes is
     new text. Install is the right one. Each case installs through the lint, not past it. */
  const wrong: string[] = [];
  for (const { spelled, before } of [
    { spelled: '{{trigger.row.pin}}', before: [] as Step[] },
    { spelled: '{{ trigger.row.pin }}', before: [] as Step[] },
    { spelled: '{{vars.p}}', before: [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }] as Step[] },
  ])
    for (const tags of [['late'], ['late', 'hunter2']]) {
      const { k, sql } = await opened();
      const out = refusal((await k.install([steps([...before, { untag: spelled }])])) as Result<unknown>);
      if (out !== null) {
        wrong.push(`${spelled}: install refused ${out.code} ${out.fix}`);
        sql.close();
        continue;
      }
      const made = value<Entry>(k.create('obligations', { what: 'Rent', tags }, { actor: 'p_1' }));
      sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
      const was = holding(sql, 'hunter2');
      await k.drain();
      const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'copy'");
      if (run?.state !== 'done') wrong.push(`${spelled} over ${tags.join(', ')}: the run is ${run?.state} ${run?.say ?? ''}`);
      const now = sql.one<{ v: string }>("SELECT json_extract(fields, '$.tags') AS v FROM entry WHERE id = ?", made.id)?.v;
      if (now !== '["late"]') wrong.push(`${spelled} over ${tags.join(', ')}: tags are ${now}`);
      /* A ROW THAT HELD NO SUCH TAG IS LEFT AS IT WAS, and the secret went nowhere it was not. */
      if (tags.length === 1) {
        const went = [...holding(sql, 'hunter2')].filter((r) => !was.has(r));
        if (went.length) wrong.push(`${spelled}: hunter2 went to ${went.join(' | ')}`);
      }
      sql.close();
    }
  assert.deepEqual(wrong, []);
});

test('A CREATE THAT CROSSES A SECRET FIELD FAILS AT RUN TIME, since each value would be written into every row it makes', async () => {
  const create = { create: { register: 'payments', bound: 4, each: ['pin'], fields: { what: 'x {{each.0}}' } } };
  const { sql, went, run } = await stored({ on: on('obligations'), once_per: ['entry'], steps: [create] }, {});
  assert.deepEqual(went, []);
  assert.equal(run?.state, 'failed', run?.say ?? '');
  assert.match(run!.say ?? '', /each: pin/);
  sql.close();
});

test('SEC-3, rules.ts: A LIST ITEM THAT SPELLS {{pin}} IS CROSSED AS THOSE WORDS, on the inline path and as a run', async () => {
  /* THE RECORDED FINDING, AS IT WAS MEASURED: `kinds` holds the words `{{pin}}`, and a create crossing it wrote
     `x hunter2`. The lint cannot see this, since the braces are the row's data; both rules install clean. */
  for (const body of [
    { register: 'obligations', once_per: ['entry'], then: [{ create: { register: 'payments', bound: 4, each: ['kinds'], fields: { what: 'x {{each.0}}' } } }] },
    { on: { written: { register: 'obligations', op: ['update'] } }, once_per: ['entry'], steps: [{ create: { register: 'payments', bound: 4, each: ['kinds'], fields: { what: 'x {{each.0}}' } } }] },
  ]) {
    const { k: first, sql, clock } = await opened();
    value(await first.install([rule(body)]));
    const k = await openRecord(sql, clock, { answersSlash: true });
    /* THE PIN IS IN THE ROW WHEN THE PASS READS IT, so the create is made by an edit after the pin is put in. */
    const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
    sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
    sql.exec("DELETE FROM schedule WHERE kind = 'rule'");
    value(k.update('obligations', made.id, { kinds: ['{{pin}}', 'b'] }, { actor: 'p_1' }) as Result<unknown>);
    await k.drain();
    const whats = sql.all<{ v: string }>("SELECT json_extract(fields, '$.what') AS v FROM entry WHERE register = 'payments' ORDER BY v").map((r) => r.v);
    assert.deepEqual(whats.filter((w) => w.startsWith('x ')), ['x b', 'x {{pin}}'], `${'then' in body ? 'inline' : 'run'}: ${JSON.stringify(whats)}`);
    assert.deepEqual([...holding(sql, 'hunter2')], []);
    sql.close();
  }
});

test('SEC-3, flow.ts: A TEXT FIELD THAT SPELLS {{pin}} IS COPIED AS THOSE WORDS, filled once and never again from the row', async () => {
  const wrong: string[] = [];
  const cases: { what: string; list: Step[]; found: (sql: NodeSql, made: Entry) => unknown }[] = [
    { what: 'set', list: [{ set: { field: 'memo', to: 'is {{trigger.row.note}}' } }], found: (sql, made) => sql.one<{ v: string }>("SELECT json_extract(fields, '$.memo') AS v FROM entry WHERE id = ?", made.id)?.v },
    { what: 'note', list: [{ note: 'is {{trigger.row.note}}' }], found: (sql) => noted(sql) },
    { what: 'notify', list: [{ notify: { say: 'is {{trigger.row.note}}' } }], found: (sql) => noted(sql) },
    { what: 'create', list: [{ create: { register: 'payments', bound: 1, fields: { what: 'is {{trigger.row.note}}' } } }], found: (sql) => sql.one<{ v: string }>("SELECT json_extract(fields, '$.what') AS v FROM entry WHERE register = 'payments'")?.v },
    { what: 'suggest', list: [{ suggest: { question: 'is {{trigger.row.note}}', options: ['yes', 'no'] } }], found: question },
    { what: 'ask_person', list: [{ ask_person: { question: 'is {{trigger.row.note}}', options: ['yes', 'no'], as: 'a' } }], found: question },
    /* A VARIABLE HOLDING THE BRACES IS FILLED IN THE SAME PASS, so it is written as its words too. */
    { what: 'note from a variable', list: [{ set_var: { name: 'n', to: '{{trigger.row.note}}' } }, { note: 'is {{vars.n}}' }], found: (sql) => noted(sql) },
  ];
  for (const c of cases) {
    const { sql, made, went, run } = await stored({ on: on('obligations'), once_per: ['entry'], steps: c.list }, { note: '{{pin}}' });
    const found = c.found(sql, made);
    if (found !== 'is {{pin}}') wrong.push(`${c.what}: wrote ${JSON.stringify(found)}, the run is ${run?.state} ${run?.say ?? ''}`);
    if (went.length) wrong.push(`${c.what}: hunter2 went to ${went.join(' | ')}`);
    sql.close();
  }
  assert.deepEqual(wrong, []);
});

test('WHERE A VARIABLE CAME FROM OUTLIVES A WAIT, is rebuilt for a column with no -sealed, and goes when an answer takes the name', async () => {
  /* THREE LINES THE TESTS ABOVE LEFT UNTESTED, found by the checker on 23 September by taking each out and watching
     this file, `slash-vars-hidden.test.ts`, `flow-waits.test.ts` and `slash-launder-row.test.ts` stay green: the
     replay for a column a build before `-sealed` parked (`sealedAgain`), the filter in `answerStep` that takes an
     answered name off `-sealed`, and the `present` that keeps an empty secret field from counting. With the replay
     taken out, the run below finished and wrote `x k hunter2` into the note event after the wait. With the filter taken out, `p`
     answered `yes` still read as the secret and the note step failed. With `present` taken out, a note reading a
     `pin` that holds nothing failed its run. */
  const decide = async (sql: NodeSql, k: Kernel): Promise<void> => {
    const asked = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' AND opened_by = 'rule:copy'")!;
    const yes = (JSON.parse(asked.body) as { options: { id: string; label: string }[] }).options.find((o) => o.label === 'yes')!.id;
    value(k.decide(asked.id, { decide: { option: yes, reason: 'Paid.' } }, 'p_1') as Result<unknown>);
    await k.drain();
  };
  const set = { set_var: { name: 'p', to: 'k {{trigger.row.pin}}' } };

  /* THAT BUILD WROTE NO `-sealed`, so the key is taken out by SQL while the run waits on the person. */
  const old = await stored({ on: on('obligations'), once_per: ['entry'], steps: [set, { ask_person: { question: 'Pay?', options: ['yes', 'no'], as: 'a' } }, { note: 'x {{vars.p}}' }] }, { note: 'plain' });
  old.sql.exec(`UPDATE automation_run SET vars = json_remove(vars, '$."-sealed"') WHERE rule = 'copy'`);
  await decide(old.sql, old.k);
  const after = old.sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'copy'");
  assert.equal(after?.state, 'failed', after?.say ?? '');
  assert.match(after!.say ?? '', /\{\{vars\.p\}\}/);
  assert.deepEqual(noted(old.sql), []);
  old.sql.close();

  const answered = await stored({ on: on('obligations'), once_per: ['entry'], steps: [set, { ask_person: { question: 'Pay?', options: ['yes', 'no'], as: 'p' } }, { note: 'x {{vars.p}}' }] }, { note: 'plain' });
  await decide(answered.sql, answered.k);
  const done = answered.sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'copy'");
  assert.equal(done?.state, 'done', done?.say ?? '');
  assert.equal(noted(answered.sql), 'x yes');
  answered.sql.close();

  /* A LIST WITH NO `pin` PUT IN: every spelling of it reads the dash, and the dash is no copy. */
  const { sql, k: first, clock } = await opened();
  value(await first.install([steps([{ set_var: { name: 'x', to: 'y' } }])]));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.copy' AND superseded_at IS NULL", JSON.stringify({ rule: 'copy', on: on('obligations'), once_per: ['entry'], steps: [{ note: 'x {{pin}} {{trigger.row.pin}} {{trigger.row}}' }] }));
  const k = await openRecord(sql, clock, { answersSlash: true });
  value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  await k.drain();
  const empty = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'copy'");
  assert.equal(empty?.state, 'done', empty?.say ?? '');
  assert.equal(noted(sql), 'x — — {"what":"Rent","note":"plain"}');
  sql.close();
});

/** The text of the rule's note or notification, as its event holds it. */
function noted(sql: NodeSql): unknown {
  const rows = sql.all<{ note: string | null }>("SELECT note FROM event WHERE actor = 'rule:copy' AND kind = 'note'");
  return rows.length === 1 ? rows[0]!.note : rows.map((r) => r.note);
}

/** The question the rule put in the queue, which its `suggest` event holds as `to_v`. */
const question = (sql: NodeSql): unknown => sql.one<{ to_v: string | null }>("SELECT to_v FROM event WHERE actor = 'rule:copy' AND kind = 'suggest'")?.to_v;

