/**
 * A secret carried out to a call's endpoint by way of a field of the row: the other road out that wave fifty's checker
 * found beside the question to Spark (`spark-launder-row.test.ts`).
 *
 * WHAT WAS MEASURED BEFORE THE REPAIR. `queueCall` left a field out of what a call sends by its live type alone, and
 * the lint followed a secret written into the row only as far as a question to Spark. So `set: { field: party, to:
 * '{{token}}' }` beside `run: paid_hook`, a call whose `sends:` names `party`, installed clean on both paths and queued
 * `party: 'hunter2'` for the host to post: inline, where the pass holds every `run` until the patch is written, so the
 * order of the two did not matter; and as a run, through `set_var`, through another field, through `tags` and inside a
 * branch. A rule that only writes the field and another that only runs the call installed clean, since neither body
 * says both, and that pair queued the secret too.
 *
 * SINCE AUDIT FIFTY-ONE §3 THE LINT REFUSES THE COPY ITSELF, at the `set` or `tag` that writes the secret into a field
 * that may leave, and no longer the call that sends it (`launder-across-rules.test.ts`). So each refusal below names
 * the step that writes, the bodies that installed because their call did not send the field are refused too, and the
 * pair can no longer be installed: its tests store the writing rule past the lint, as an earlier build let it in, so
 * that `queueCall`'s second line is still what they measure.
 *
 * `hunter2` IS PUT IN BY SQL AFTER THE ROW IS MADE, as the Spark tests put their pin, because in use a secret field
 * holds a vault grant's id and a plaintext is the plainest way to see whether it left.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type GrantRow, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

const INVOICES: Declaration = {
  id: 'register.invoices',
  kind: 'register',
  body: {
    id: 'invoices',
    name: 'Invoices',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'text' },
      { id: 'memo', type: 'text' },
      { id: 'tags', type: 'list', of: 'text' },
      { id: 'token', type: 'secret' },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

/** A call only a rule runs, sending `what` and `party`. */
const HOOK: Declaration = {
  id: 'ingest.paid_hook',
  kind: 'ingest',
  body: { ingest: 'paid_hook', channel: 'call', url: 'https://hooks.example.test/paid', trigger: 'rule', grant: 'hook key', sends: ['invoices.what', 'invoices.party'] } as never,
};

/** The same, sending `tags` where the first sends `party`. */
const TAGS_HOOK: Declaration = {
  id: 'ingest.tags_hook',
  kind: 'ingest',
  body: { ingest: 'tags_hook', channel: 'call', url: 'https://hooks.example.test/tags', trigger: 'rule', grant: 'hook key', sends: ['invoices.what', 'invoices.tags'] } as never,
};

/** A rule inside the write, on the inline path: it fires when the row is paid. */
const inline = (then: unknown[], rule = 'paid'): Declaration => ({
  id: `rule.${rule}`,
  kind: 'rule',
  body: { rule, register: 'invoices', when: 'state is paid', once_per: ['entry'], then } as never,
});

/** A rule on the run path: it runs after a row is made. */
const run = (steps: unknown[]): Declaration => ({
  id: 'rule.paid',
  kind: 'rule',
  body: { rule: 'paid', on: { written: { register: 'invoices', op: ['create'] } }, once_per: ['entry'], steps } as never,
});

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

const refusal = (r: Result<unknown>): { code: string; fix: string } | null => (r.ok ? null : 'refusal' in r ? { code: r.refusal.code, fix: r.refusal.fix } : { code: 'conflict', fix: '' });

async function opened(sql: NodeSql, clock: ReturnType<typeof fixedClock>): Promise<Kernel> {
  return openRecord(sql, clock, { answersSpark: true });
}

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await opened(sql, clock);
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  value(k.bindGrant({ label: 'hook key', opens: 'hooks.example.test', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1') as Result<GrantRow>);
  value(await k.install([INVOICES, HOOK, TAGS_HOOK, ...decls]));
  return { k, sql, clock };
}

/** What each queued call carries, as the host's executor will post it. */
const sent = (sql: NodeSql) =>
  sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'pull.fetch' ORDER BY rowid").map((j) => JSON.parse(j.payload) as { ingest: string; row: Record<string, unknown> });

/** Each body the lint must refuse, with what the refusal says about the step that wrote the field. */
const LAUNDERED: { what: string; decl: Declaration; wrote: RegExp; field?: string; hook?: string }[] = [
  {
    what: 'inline: set party from the row fill, then run',
    decl: inline([{ set: { field: 'party', to: '{{token}}' } }, { run: 'paid_hook' }]),
    wrote: /writes party from \{\{token\}\} at then\[0\]/,
  },
  /* THE PASS HOLDS EVERY `run` UNTIL THE PATCH IS WRITTEN (`rules.ts`), so a `run` ahead of the `set` sends what the
     `set` wrote. */
  {
    what: 'inline: run, then set party from the row fill',
    decl: inline([{ run: 'paid_hook' }, { set: { field: 'party', to: 'Bearer {{token}}' } }]),
    wrote: /writes party from \{\{token\}\} at then\[1\]/,
  },
  {
    what: 'run: set party from trigger.row.token, then run',
    decl: run([{ set: { field: 'party', to: '{{trigger.row.token}}' } }, { run: 'paid_hook' }]),
    wrote: /writes party from \{\{trigger\.row\.token\}\} at steps\[0\]/,
  },
  {
    what: 'run: set_var p from token, set party from vars.p, then run',
    decl: run([{ set_var: { name: 'p', to: '{{trigger.row.token}}' } }, { set: { field: 'party', to: '{{vars.p}}' } }, { run: 'paid_hook' }]),
    wrote: /writes party from \{\{vars\.p\}\} at steps\[1\], and p holds token: steps\[0\] put it there with \{\{trigger\.row\.token\}\}/,
  },
  {
    what: 'run: set memo from token, set party from memo, then run',
    decl: run([{ set: { field: 'memo', to: '{{token}}' } }, { set: { field: 'party', to: 'again {{memo}}' } }, { run: 'paid_hook' }]),
    /* REFUSED AT THE FIRST COPY, into `memo`, which the call does not send but every reader of the list sees. */
    wrote: /writes memo from \{\{token\}\} at steps\[0\]/,
  },
  {
    what: 'run: tag from trigger.row.token, then run a call that sends tags',
    decl: run([{ tag: '{{trigger.row.token}}' }, { run: 'tags_hook' }]),
    wrote: /writes tags from \{\{trigger\.row\.token\}\} at steps\[0\]/,
    field: 'tags',
    hook: 'tags_hook',
  },
  {
    what: 'run: set inside a branch, then run after it',
    decl: run([{ if: 'what is Invoice 41', then: [{ set: { field: 'party', to: '{{token}}' } }] }, { run: 'paid_hook' }]),
    wrote: /writes party from \{\{token\}\} at steps\[0\]\.then\[0\]/,
  },
];

test('A STEP THAT WOULD WRITE A SECRET INTO A FIELD A CALL SENDS IS REFUSED AT INSTALL, at the step', async () => {
  const { k, sql } = await record();
  const cases = [
    ...LAUNDERED.map((c) => [c.what, c.decl, c.wrote] as const),
    /* A `call` STEP AFTER THE WRITE, as `run:` after it: the write is refused either way. */
    ['run: set party from token, then a call step', run([{ set: { field: 'party', to: '{{token}}' } }, { call: { ingest: 'paid_hook' } }]), /writes party from \{\{token\}\} at steps\[0\]/] as const,
  ];
  for (const [what, decl, wrote] of cases) {
    const out = refusal((await k.install([decl])) as Result<unknown>);
    assert.equal(out?.code, 'DECLARATION_INVALID', `${what}: ${out?.fix ?? 'installed'}`);
    assert.match(out!.fix, /token/, what);
    assert.match(out!.fix, /party|tags|memo/, what);
    assert.match(out!.fix, /a secret field is copied only into another secret or file field/, what);
    assert.match(out!.fix, wrote, `${what}: the refusal does not name the step that writes the field: ${out!.fix}`);
  }
  /* THESE INSTALLED WHILE THE LINT FOLLOWED THE FIELD TO A CALL, and are refused now. The call did not send `memo`, a
     plain `set` put `plain` over `party` before the call, or the call sat in the arm beside the write; but each wrote
     the secret into a field every reader of the list sees and another rule's call may send, so the copy is refused
     whatever follows it. */
  for (const [what, decl, said] of [
    ['inline: set memo from token, which the call does not send', inline([{ set: { field: 'memo', to: '{{token}}' } }, { run: 'paid_hook' }]), 'writes memo from {{token}} at then[0]'],
    ['run: a plain set of party after the secret one', run([{ set: { field: 'party', to: '{{token}}' } }, { set: { field: 'party', to: 'plain' } }, { run: 'paid_hook' }]), 'writes party from {{token}} at steps[0]'],
    [
      'run: the call in the arm beside the one that wrote party',
      run([{ if: 'what is Invoice 41', then: [{ set: { field: 'party', to: '{{token}}' } }], else: [{ run: 'paid_hook' }] }]),
      'writes party from {{token}} at steps[0].then[0]',
    ],
  ] as const) {
    const out = refusal((await k.install([decl])) as Result<unknown>);
    assert.equal(out?.code, 'DECLARATION_INVALID', `${what}: ${out?.fix ?? 'installed'}`);
    assert.ok(out!.fix.includes(said), `${what}: ${out!.fix}`);
  }
  sql.close();
});

test('WHAT COPIES NO SECRET INSTALLS: a word nothing fills, and fields that may leave', async () => {
  const { k, sql } = await record();
  for (const [what, decl] of [
    /* ON THE INLINE PATH NOTHING FILLS `{{trigger.…}}` (`rules.ts`'s `fill` reads `{{field}}` alone), and nothing fills a
       tag at all, so both write the braces as typed. */
    ['inline: set party from trigger.row.token, which the pass leaves as typed', inline([{ set: { field: 'party', to: '{{trigger.row.token}}' } }, { run: 'paid_hook' }])],
    ['inline: tag {{token}}, which no fill reads', inline([{ tag: '{{token}}' }, { run: 'tags_hook' }])],
    /* THE `rowFill = false` BRANCH OF `hiddenIn`, ON THE RUN PATH. The run fills a tag from `{{vars.…}}` and
       `{{trigger.…}}` only, and the pass does not fill it, so `{{token}}` is tagged as typed. */
    ['run: tag {{token}}, which the run leaves as typed', run([{ tag: '{{token}}' }, { run: 'tags_hook' }])],
    ['run: party written from fields that may leave', run([{ set: { field: 'party', to: '{{what}} {{trigger.row.memo}}' } }, { run: 'paid_hook' }])],
  ] as const) {
    const out = refusal((await k.install([decl])) as Result<unknown>);
    assert.equal(out, null, `${what}: ${out?.fix}`);
  }
  sql.close();
});

test('A TAG OF {{token}} BEFORE A QUESTION TO SPARK INSTALLS, since the run tags the braces as typed', async () => {
  /* THE SAME BRANCH FOR THE QUESTION, which wave fifty added and no case reached: `tags` read by `{{tags}}` after a
     `tag` step whose word only the pass's fill would have read. */
  const { k, sql } = await record();
  for (const steps of [
    [{ tag: '{{token}}' }, { ask_spark: { question: 'Rate for {{tags}}?', as: 'rate' } }],
    [{ tag: '{{token}}' }, { ask_spark: { question: 'Rate?', about: ['tags'], as: 'rate' } }],
  ]) {
    const out = refusal((await k.install([run(steps)])) as Result<unknown>);
    assert.equal(out, null, `${JSON.stringify(steps)}: ${out?.fix}`);
  }
  /* AND IT IS RIGHT TO: the question the run then queues holds the braces and not the secret. */
  const made = value<Entry>(k.create('invoices', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  assert.doesNotMatch(job.payload, /hunter2/);
  assert.match(job.payload, /\{\{token\}\}/);
  sql.close();
});

/** A rule written into the table past the lint, as an earlier build would have let it install, then a paid row. */
async function stored(decl: Declaration): Promise<{ sql: NodeSql; made: Entry }> {
  const { sql, clock } = await record(inline([{ tag: 'placeholder' }]));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.paid' AND superseded_at IS NULL", JSON.stringify(decl.body));
  const k = await opened(sql, clock);
  const made = value<Entry>(k.create('invoices', { what: 'Invoice 41', party: 'Fenwick', state: 'open' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  value(k.update('invoices', made.id, { state: 'paid' }, { actor: 'p_1' }) as Result<unknown>);
  await k.drain();
  return { sql, made };
}

test('A RULE STORED PAST THE LINT SENDS NO VALUE A STEP WROTE FROM A SECRET, and the call still goes with the rest', async () => {
  for (const c of LAUNDERED) {
    const { sql, made } = await stored(c.decl);
    const calls = sent(sql);
    assert.equal(calls.length, 1, `${c.what}: ${calls.length} calls were queued, and the run is ${JSON.stringify(sql.all("SELECT state, say FROM automation_run"))}`);
    assert.doesNotMatch(JSON.stringify(calls), /hunter2/, `${c.what}: ${JSON.stringify(calls)}`);
    /* LEFT OUT, AS A SECRET FIELD IS: the key is absent, not sent empty, and `what` goes as it would have. */
    assert.deepEqual(calls[0]!.row, { what: 'Invoice 41' }, c.what);
    assert.equal(calls[0]!.ingest, c.hook ?? 'paid_hook', c.what);
    /* THE ROW ITSELF WAS WRITTEN: the record keeps what the step put there, and only what leaves is cleaned. */
    const held = sql.one<{ v: string }>(`SELECT json_extract(fields, '$.${c.field ?? 'party'}') AS v FROM entry WHERE id = ?`, made.id)?.v;
    assert.match(String(held), /hunter2/, c.what);
    sql.close();
  }
});

/**
 * The pair: `rule.post` runs the call, and `rule.copy` writes `party` from `{{token}}`, stored past the lint, which now
 * refuses it at the `set` (`launder-across-rules.test.ts`). A record an earlier build let the pair into still holds it,
 * and `queueCall`'s second line is the only line for that record.
 */
async function pair(): Promise<{ k: Kernel; sql: NodeSql }> {
  const { k: first, sql, clock } = await record(inline([{ tag: 'placeholder' }], 'copy'), inline([{ run: 'paid_hook' }], 'post'));
  const copy = inline([{ set: { field: 'party', to: '{{token}}' } }], 'copy');
  assert.match(refusal((await first.install([copy])) as Result<unknown>)?.fix ?? 'installed', /rule\.copy writes party from \{\{token\}\} at then\[0\]/);
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.copy' AND superseded_at IS NULL", JSON.stringify(copy.body));
  return { k: await opened(sql, clock), sql };
}

test('TWO RULES STORED PAST THE LINT, one writing party from the secret and one running the call, send no secret', async () => {
  /* NEITHER BODY SAYS BOTH, so no lint of the call's body can refuse the pair; the write is refused now, and this is the
     second line for a record that holds it from before. */
  const { k, sql } = await pair();
  const made = value<Entry>(k.create('invoices', { what: 'Invoice 41', party: 'Fenwick', state: 'open' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', 'hunter2') WHERE id = ?", made.id);
  value(k.update('invoices', made.id, { state: 'paid' }, { actor: 'p_1' }) as Result<unknown>);
  await k.drain();
  const calls = sent(sql);
  assert.equal(calls.length, 1);
  assert.doesNotMatch(JSON.stringify(calls), /hunter2/, JSON.stringify(calls));
  assert.match(String(sql.one<{ v: string }>("SELECT json_extract(fields, '$.party') AS v FROM entry WHERE id = ?", made.id)?.v), /hunter2/);
  sql.close();
});

test('AND A RETIRED SECRET, WHICH THE ROWS WRITTEN BEFORE IT STILL HOLD, is left out of what the pair sends too', async () => {
  /* THE LIVE SCHEMA DROPS A RETIRED FIELD AND THE ROW KEEPS ITS VALUE, and `fill` reads the row. Measured by the checker
     on 23 September: with `token` retired, the lint refused the single body (`hiddenOf` reads retired fields) and the
     pair below queued `party: 'hunter2'`, because `queueCall` asked the live schema which fields were secret. */
  const { k, sql } = await pair();
  const made = value<Entry>(k.create('invoices', { what: 'Invoice 41', party: 'Fenwick', state: 'open' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', 'hunter2') WHERE id = ?", made.id);
  const fields = (INVOICES.body as { fields: { id: string }[] }).fields.map((f) => (f.id === 'token' ? { ...f, retired: true } : f));
  value(await k.install([{ ...INVOICES, body: { ...(INVOICES.body as object), fields } as never }]));
  value(k.update('invoices', made.id, { state: 'paid' }, { actor: 'p_1' }) as Result<unknown>);
  await k.drain();
  const calls = sent(sql);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.row, { what: 'Invoice 41' }, JSON.stringify(calls));
  sql.close();
});

test('A FIELD THAT HOLDS NO SECRET IS SENT AS IT WAS, and a tag of the braces goes as typed', async () => {
  const { k, sql } = await record(run([{ tag: '{{token}}' }, { set: { field: 'party', to: 'Fenwick {{what}}' } }, { run: 'paid_hook' }, { run: 'tags_hook' }]));
  const made = value<Entry>(k.create('invoices', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  assert.deepEqual(
    sent(sql).map((c) => [c.ingest, c.row]),
    [
      ['paid_hook', { what: 'Invoice 41', party: 'Fenwick Invoice 41' }],
      ['tags_hook', { what: 'Invoice 41', tags: ['{{token}}'] }],
    ],
  );
  sql.close();
});
