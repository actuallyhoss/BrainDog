/**
 * Fourteen silent failures of the backend, reproduced and held.
 *
 * FOURTEEN FAILURES, EVERY ONE A SILENCE. Not one of them raised an error, printed a warning or failed a test: a figure
 * computed over the whole register, a rule that wrote half of what it declared, a question the gate answered without
 * reading, a draft billed once per retry. Each test below is named after the symptom rather than the function, because
 * that is what the next person will be looking for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateMetric,
  openRecord,
  type Declaration,
  type DryRun,
  type Entry,
  type Kernel,
  type MetricDecl,
  type Reading,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day', index: true },
      { id: 'seen_at', type: 'instant', index: true },
      { id: 'sizes', type: 'list', of: 'text' },
      { id: 'season', type: 'enum', values: ['aw26', 'ss27'] },
      { id: 'tags', type: 'list', of: 'text' },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

const SKUS: Declaration = {
  id: 'register.skus',
  kind: 'register',
  body: { id: 'skus', name: 'SKUs', title: 'code', fields: [{ id: 'code', type: 'text', required: true }] } as never,
};

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, SKUS, TASKS, ...decls])).ok);
  return { k, sql };
}

/* ── a figure over the whole register ────────────────────────────────────── */

test('AN `instant` SAYS `today` TOO, and a JSON predicate used to send SQL the word', async () => {
  /* `'2026-09-15T…' < 'today'` is a string comparison true of every instant there has ever been, so
     the figure was the whole register and looked like an answer. The sentence grammar resolved
     both types and the JSON form resolved one, which is the two renderings disagreeing. */
  const { k, sql } = await record();
  for (const offset of [-10, -1, 1, 10, 300])
    value<Entry>(
      k.create('obligations', { what: `e${offset}`, due: day(offset), seen_at: `${day(offset)}T09:00:00.000Z`, state: 'open' }, { actor: 'p_1' }),
    );

  const ctx = {
    nowMs: NOW,
    schemaOf: (register: string) => {
      const r = k.register(register);
      return r ? { register, fields: Object.fromEntries(r.fields.map((f) => [f.id, f as never])) } : null;
    },
  };
  const metric = (where: unknown): MetricDecl =>
    ({ metric: 'm', name: 'M', source: 'register.obligations', where, value: { count: 'id' }, target: { lte: 5 }, window: '30d', compare: 'none', format: 'int' }) as never;

  assert.equal(value<Reading>(evaluateMetric(sql, metric({ field: 'due', before: 'today' }), ctx)).value, 2);
  assert.equal(
    value<Reading>(evaluateMetric(sql, metric({ field: 'seen_at', before: 'today' }), ctx)).value,
    2,
    'an instant field matched every row in the register',
  );
  assert.equal(value<Reading>(evaluateMetric(sql, metric({ field: 'seen_at', after: 'today' }), ctx)).value, 3);

  // And a date the grammar does not admit is still refused on an instant.
  /* `RELATIVE_LITERAL_UNKNOWN` — `30 §6`'s grammar family, "a temporal literal outside the anchors
     and offsets", which is what `soon` is and what the old `WHERE_MALFORMED` never said. */
  assert.equal(
    refusal(evaluateMetric(sql, metric({ field: 'seen_at', before: 'soon' }), ctx)).code,
    'RELATIVE_LITERAL_UNKNOWN',
  );
  sql.close();
});

/* ── the lint that stopped linting ───────────────────────────────────────── */

test('A RULE WITH NO `when` IS STILL A DECLARATION, and used to skip every check there is', async () => {
  /* No `when` is a legal rule meaning "every row". It skipped the predicate check and, with it, the
     whole block — so a rule with no bound, no `once_per`, three axes and a target register nobody
     has installed cleanly. */
  const { k, sql } = await record();

  const cases: [Record<string, unknown>, string][] = [
    [{ rule: 'a', register: 'obligations', then: [{ notify: { say: 'x' } }] }, 'once_per'],
    [{ rule: 'b', register: 'ghosts', then: [{ tag: 'x' }] }, 'register'],
    [
      { rule: 'c', register: 'obligations', once_per: ['entry'], then: [{ create: { register: 'skus', bound: 100_000, fields: { code: 'x' } } }] },
      'bound',
    ],
    [
      { rule: 'd', register: 'obligations', once_per: ['entry'], then: [{ create: { register: 'ghosts', bound: 4, fields: { code: 'x' } } }] },
      'register',
    ],
    [
      {
        rule: 'e',
        register: 'obligations',
        once_per: ['entry'],
        then: [{ create: { register: 'skus', each: ['sizes', 'season', 'tags'], bound: 4, fields: { code: 'x' } } }],
      },
      'each',
    ],
  ];
  for (const [body, at] of cases) {
    const out = await k.install([rule(body)]);
    assert.equal(out.ok, false, `${String(body.rule)} installed with no when`);
    assert.equal((out as { refusal: { at?: string } }).refusal.at, at);
  }
  sql.close();
});

test('and a rule with no `then` is refused rather than throwing the write out of the record', async () => {
  /* `rule.then.some(...)` on `undefined` threw a TypeError out of `k.create` — across the one
     boundary this package promises nothing throws over — and took the triggering write with it. */
  const { k, sql } = await record();
  const out = await k.install([rule({ rule: 'empty', register: 'obligations', when: 'state is open' })]);
  assert.equal(out.ok, false);
  assert.equal((out as { refusal: { at?: string } }).refusal.at, 'then');

  // And one that got in behind the linter does nothing, rather than throwing.
  sql.exec(
    `INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
     VALUES ('rule.empty', 1, 'rule', NULL, ?, 'x', 0, NULL, ?)`,
    JSON.stringify({ rule: 'empty', register: 'obligations', when: 'state is open' }),
    new Date(NOW).toISOString(),
  );
  assert.ok((await k.install([])).ok);
  assert.ok(k.create('obligations', { what: 'x', state: 'open' }, { actor: 'p_1' }).ok, 'the rule pass threw');
  assert.ok(k.dryRun({ rule: 'empty', register: 'obligations', when: 'state is open' } as never).ok);
  sql.close();
});

test('and a bound over a list axis is unchecked rather than checked against zero', async () => {
  /* `cardinality *= values?.length ?? 0` collapsed the product to nothing for a list, which turned
     the check off — including for `enum × list`, where half of it was knowable. */
  const { k, sql } = await record();
  const list = await k.install([
    rule({
      rule: 'over-a-list',
      register: 'obligations',
      once_per: ['entry'],
      then: [{ create: { register: 'skus', each: ['sizes'], bound: 1, fields: { code: '{{each.0}}' } } }],
    }),
  ]);
  assert.equal(list.ok, true, 'a list has no declared length, so the bound cannot be wrong at install');

  const enums = await k.install([
    rule({
      rule: 'over-an-enum',
      register: 'obligations',
      once_per: ['entry'],
      then: [{ create: { register: 'skus', each: ['season'], bound: 1, fields: { code: '{{each.0}}' } } }],
    }),
  ]);
  assert.equal(enums.ok, false);
  /* `04 §5`'s code and its sentence — this asserted `OUT_OF_BOUNDS`'s wording, which shadowed
     `CREATE_OVER_BOUND` everywhere it could have been raised. */
  assert.equal((enums as { refusal: { code: string } }).refusal.code, 'CREATE_OVER_BOUND');
  assert.match((enums as { refusal: { fix: string } }).refusal.fix, /season \(2\) = 2 exceeds bound 1/u);
  sql.close();
});

/* ── what a rule did and did not do ──────────────────────────────────────── */

test('TWO `create` ACTIONS IN ONE RULE BOTH WRITE, and the second used to be skipped silently', async () => {
  /* The idempotency tuple did not carry the target register, so the second action's read found the
     first action's row and skipped — half of what the rule declared, and nothing refused. */
  const { k, sql } = await record(
    rule({
      rule: 'twin',
      register: 'obligations',
      when: 'state is open',
      once_per: ['entry'],
      then: [
        { create: { register: 'skus', bound: 4, fields: { code: 'S-{{what}}' } } },
        { create: { register: 'tasks', bound: 4, fields: { what: 'T-{{what}}' } } },
      ],
    }),
  );
  value<Entry>(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  assert.equal(k.count('skus'), 1);
  assert.equal(k.count('tasks'), 1, 'the second create wrote nothing and refused nothing');
  void sql;
  sql.close();
});

test('A RULE THAT MADE NOTHING HAS NOT FIRED, and used to keep its marker for ever', async () => {
  /* An expansion over an empty list, or one its bound refused, kept the marker — so filling in the
     sizes, or fixing the bound, could never take effect. */
  const { k, sql } = await record(
    rule({
      rule: 'run',
      register: 'obligations',
      when: 'state is open',
      once_per: ['entry'],
      then: [{ create: { register: 'skus', each: ['sizes'], bound: 3, fields: { code: '{{each.0}}' } } }],
    }),
  );
  value<Entry>(k.create('obligations', { what: 'Halden', sizes: [], state: 'open' }, { actor: 'p_1' }));
  assert.equal(k.count('skus'), 0);
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'rule'").length, 0, 'a rule that made nothing was marked as fired');

  value<Entry>(k.update('obligations', 'obligations#1', { sizes: ['S', 'M'] }, { actor: 'p_1' }));
  assert.equal(k.count('skus'), 2, 'the fix could not take effect');

  // And an expansion over its bound is the same: refused, and free to run again once it is fixed.
  const second = await record(
    rule({
      rule: 'run',
      register: 'obligations',
      when: 'state is open',
      once_per: ['entry'],
      then: [{ create: { register: 'skus', each: ['sizes'], bound: 2, fields: { code: '{{each.0}}' } } }],
    }),
  );
  value<Entry>(second.k.create('obligations', { what: 'Halden', sizes: ['S', 'M', 'L'], state: 'open' }, { actor: 'p_1' }));
  assert.equal(second.k.count('skus'), 0);
  assert.equal(second.sql.all("SELECT 1 FROM schedule WHERE kind = 'rule'").length, 0);
  sql.close();
  second.sql.close();
});

test('and the preview models an earlier `stop`, or it promises what will not happen', async () => {
  const { k, sql } = await record(
    rule({ rule: 'halt', register: 'obligations', priority: 1, when: 'state is open', then: [{ stop: true }] }),
  );
  for (const what of ['a', 'b']) value<Entry>(k.create('obligations', { what, state: 'open' }, { actor: 'p_1' }));

  const out = value<DryRun>(k.dryRun({ rule: 'chase', register: 'obligations', when: 'state is open', then: [{ tag: 'chased' }] } as never));
  assert.equal(out.matches, 2);
  assert.equal(out.won, 0, 'the preview promised what an earlier stop prevents');
  assert.equal(out.takenBy.halt, 2);
  assert.match(out.sample[0]?.reason ?? '', /halt stops the pass first/);
  assert.deepEqual(out.sample[0]?.would, []);
  sql.close();
});

/* ── what a draft costs ──────────────────────────────────────────────────── */

test('A REDELIVERY IS NOT AN ARRIVAL, and used to buy another draft every time', async () => {
  /* Every webhook sender retries and most mail servers do too. The redelivery branch returns the
     state it had the first time, so reading the state alone re-observed the payload and re-queued
     the draft — once per retry, which is the bill 3′ exists to ration. */
  const { k, sql } = await record();
  const send = (n: number) =>
    k.arrive({ channel: 'email', headers: { From: 'noreply@stranger.example', Subject: 'Debit' }, body: `p${n}`, sha256: `s${n}` });

  for (const n of [1, 2, 3]) assert.ok(send(n).ok);
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1);

  for (let i = 0; i < 4; i++) assert.ok(send(3).ok);
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1, 'a retry bought another model call');
  assert.equal(
    Number(sql.one<{ n: number }>("SELECT n FROM observation WHERE kind = 'ingest.unmatched'")?.n),
    3,
    'three payloads were counted as seven',
  );
  sql.close();
});

test('and a busy channel does not bury the shape that needs a pattern most', async () => {
  /* The scan cap was applied per CHANNEL and the shape filtered in JS afterwards, so on a busy
     inbox the three examples of a new shape were truncated out before the filter ran. */
  const { k, sql } = await record();
  const send = (from: string, n: number) =>
    k.arrive({ channel: 'email', headers: { From: from, Subject: 'x' }, body: `b${n}`, sha256: `h${from}${n}` });

  for (let i = 0; i < 600; i++) assert.ok(send(`noise${i}@example.com`, i).ok);
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 0, 'six hundred distinct senders proposed something');

  for (const n of [1, 2]) assert.ok(send('alerts@cib.eg', n).ok);
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 0);
  assert.ok(send('alerts@cib.eg', 3).ok);

  const drafts = sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'infer.draft'");
  assert.equal(drafts.length, 1, 'the shape that needed a pattern never got one');
  assert.equal((JSON.parse(drafts[0]!.payload) as { shape: string }).shape, 'email:alerts@cib.eg');
  sql.close();
});
