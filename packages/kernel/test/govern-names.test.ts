/**
 * A `change` is about the declaration it names, and what it installs has to be true of the rows already there.
 *
 * TWO HALVES OF ONE FAULT, from `loop/research-batch-seventeen-audit.md` §1 and §6. The record decides who is asked a
 * change by its `declaration_id`, and the kernel installed whatever `to` held: `declaration_id: register.obligations`
 * over a new Diary was filed, shown whole to a member invited to Obligations alone, and on acceptance installed Diary.
 * And a `to` that was a well-formed declaration was installed over rows it contradicted: `state` narrowed to `paid`
 * over two open rows, `what` turned from text to int, a new required field with no default, and a ref to a list
 * called nowhere were each accepted, and each came out as a new version of the register.
 *
 * `packages/declare` already refuses two of those on a pack's path (`FIELD_TYPE_CHANGED`, `REQUIRED_ON_POPULATED`,
 * `04 §5`), and `REGISTER_UNRESOLVED` for a list nothing holds. A change reaches `install` without passing through
 * `plan`, so it had none of them. The codes here are those codes, so one fault says one thing on either path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

type Field = Record<string, unknown>;

const register = (id: string, name: string, fields: Field[]): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: fields[0]!.id, fields } as never,
});

const OBLIGATIONS_FIELDS: Field[] = [
  { id: 'what', type: 'text', required: true },
  { id: 'state', type: 'enum', values: ['open', 'paid'] },
];
const OBLIGATIONS = register('obligations', 'Obligations', OBLIGATIONS_FIELDS);
const DIARY = register('diary', 'Diary', [{ id: 'body', type: 'text' }]);

const obligations = (fields: Field[]) => register('obligations', 'Obligations', fields);
/** A harmless change to each list: one more enum value, one more text field. */
const WIDER = obligations([OBLIGATIONS_FIELDS[0]!, { id: 'state', type: 'enum', values: ['open', 'paid', 'part'] }]);
const DIARY_SHARED = register('diary', 'Diary', [{ id: 'body', type: 'text' }, { id: 'shared_with', type: 'text' }]);

async function record(open = 2): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, DIARY])).ok);
  for (let n = 0; n < open; n++) {
    const made = k.create('obligations', { what: `Invoice ${n + 1}`, state: 'open' }, { actor: 'p_1' });
    assert.ok(made.ok, fixOf(made));
  }
  return { k, sql };
}

const change = (declaration_id: string, to: unknown) => ({
  question: 'Should this change?',
  body_kind: 'change' as const,
  body: { declaration_id, to },
});

const filed = (sql: NodeSql) => sql.all('SELECT 1 FROM suggestion').length;
const version = (sql: NodeSql, id: string) =>
  sql.one<{ v: number }>('SELECT version AS v FROM declaration WHERE id = ? AND superseded_at IS NULL', id)?.v;
const status = (sql: NodeSql, id: string) => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)?.status;
const decisions = (sql: NodeSql) => sql.all('SELECT 1 FROM decision').length;
const accept = { decide: { option: 'accept' as const, reason: 'yes' } };

/* ── §1: the declaration it names ─────────────────────────────────────────── */

test('A CHANGE NAMED FOR ONE LIST AND CARRYING ANOTHER IS REFUSED WHEN IT IS PROPOSED', async () => {
  const { k, sql } = await record();
  for (const [named, to, said] of [
    /* The audit's own: filed under Obligations, a new Diary. */
    ['register.obligations', DIARY_SHARED, /register\.diary.*register\.obligations/],
    /* And the reverse, which hid a change to Obligations from the member it changes. */
    ['register.diary', WIDER, /register\.obligations.*register\.diary/],
    /* A bundle that does not hold what it is named for. */
    ['register.obligations', { declarations: [DIARY_SHARED] }, /register\.obligations/],
    /* A bundle named for Obligations that also changes Diary: the member asked about Obligations would read Diary. */
    ['register.obligations', { declarations: [WIDER, DIARY_SHARED] }, /register\.diary/],
  ] as const) {
    const out = k.propose(change(named, to), 'p_1');
    assert.equal(out.ok, false, `${named} over ${JSON.stringify(to).slice(0, 60)} was filed`);
    assert.equal(codeOf(out), 'VALUE_MALFORMED');
    assert.equal((out as { refusal: { at: string } }).refusal.at, 'body.to');
    assert.match(fixOf(out), said);
  }
  assert.equal(filed(sql), 0);
  sql.close();
});

test('and one named for what it carries, alone or in a bundle, is still filed and installs', async () => {
  const { k, sql } = await record();
  for (const [named, to] of [
    ['register.obligations', WIDER],
    ['register.diary', { declarations: [DIARY_SHARED] }],
  ] as const) {
    const made = k.propose(change(named, to), 'p_1');
    assert.ok(made.ok, fixOf(made));
    const out = k.decide(made.value.id, accept, 'p_owner');
    assert.ok(out.ok, fixOf(out));
    const put = await k.install([out.value.install as Declaration]);
    assert.ok(put.ok, fixOf(put));
  }
  assert.equal(version(sql, 'register.obligations'), 2);
  assert.equal(version(sql, 'register.diary'), 2);
  sql.close();
});

test('A MISNAMED CHANGE ALREADY IN THE QUEUE IS REFUSED WHEN IT IS ACCEPTED, and the question stays open', async () => {
  const { k, sql } = await record();
  /* Filed before propose asked, as a queue carried from an earlier build holds it. */
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG90', 'change', ?, 'open', 'p_1', ?)",
    JSON.stringify({ declaration_id: 'register.obligations', to: DIARY_SHARED }),
    new Date(NOW).toISOString(),
  );
  const out = k.decide('SG90', accept, 'p_owner');
  assert.equal(codeOf(out), 'VALUE_MALFORMED', JSON.stringify(out));
  assert.equal(status(sql, 'SG90'), 'open');
  assert.equal(decisions(sql), 0);
  assert.equal(version(sql, 'register.diary'), 1);
  sql.close();
});

/* ── §6: what it installs over the rows already there ─────────────────────── */

const CONTRADICTIONS: [string, string, Declaration | { declarations: Declaration[] }, string, RegExp][] = [
  [
    'state narrowed to paid over two open rows',
    'register.obligations',
    obligations([OBLIGATIONS_FIELDS[0]!, { id: 'state', type: 'enum', values: ['paid'] }]),
    'ENUM_VALUE_UNKNOWN',
    /obligations\.state.*open.*2 rows/,
  ],
  [
    'what turned from text to int over text rows',
    'register.obligations',
    obligations([{ id: 'what', type: 'int', required: true }, OBLIGATIONS_FIELDS[1]!]),
    'FIELD_TYPE_CHANGED',
    /obligations\.what: text → int.*2 rows/,
  ],
  [
    'a new required field with no default over two rows',
    'register.obligations',
    obligations([...OBLIGATIONS_FIELDS, { id: 'amount_due', type: 'int', required: true }]),
    'REQUIRED_ON_POPULATED',
    /obligations\.amount_due.*2 rows/,
  ],
  [
    'a new list with a ref to a list called nowhere',
    'register.newlist',
    register('newlist', 'New list', [{ id: 'what', type: 'text' }, { id: 'owner', type: 'ref', to: 'nowhere' }]),
    'REGISTER_UNRESOLVED',
    /newlist\.owner.*nowhere/,
  ],
];

test('A CHANGE THAT CONTRADICTS THE ROWS IS REFUSED WHEN IT IS PROPOSED, naming the field and how many rows', async () => {
  for (const [what, named, to, code, said] of CONTRADICTIONS) {
    const { k, sql } = await record();
    const out = k.propose(change(named, to), 'p_1');
    assert.equal(out.ok, false, `${what}: filed`);
    assert.equal(codeOf(out), code, `${what}: ${fixOf(out)}`);
    assert.match(fixOf(out), said, what);
    assert.equal(filed(sql), 0, what);
    sql.close();
  }
});

test('AND WHEN IT IS ACCEPTED, because the rows can change between the two: nothing is decided and the question stays open', async () => {
  /* Filed over a register with no rows, which is true of every case then; the rows arrive, and the owner presses accept. */
  for (const [what, named, to, code, said] of CONTRADICTIONS) {
    const { k, sql } = await record(0);
    const made = k.propose(change(named, to), 'p_1');
    if (code === 'REGISTER_UNRESOLVED') {
      /* No row makes a list called nowhere exist, so this one is refused at the door and has no second moment. */
      assert.equal(codeOf(made), code, what);
      sql.close();
      continue;
    }
    assert.ok(made.ok, `${what}: ${fixOf(made)}`);
    for (const n of [1, 2]) assert.ok(k.create('obligations', { what: `Invoice ${n}`, state: 'open' }, { actor: 'p_1' }).ok);

    const out = k.decide(made.value.id, accept, 'p_owner');
    assert.equal(codeOf(out), code, `${what}: ${JSON.stringify(out).slice(0, 200)}`);
    assert.match(fixOf(out), said, what);
    assert.equal(status(sql, made.value.id), 'open', what);
    assert.equal(decisions(sql), 0, what);
    assert.equal(version(sql, 'register.obligations'), 1, what);
    sql.close();
  }
});

test('AND BY INSTALL ITSELF, which is where the in-app declare lands and what a change accepted before this build reaches', async () => {
  for (const [what, , to, code, said] of CONTRADICTIONS) {
    const { k, sql } = await record();
    const put = await k.install([to as Declaration]);
    assert.equal(codeOf(put), code, what);
    assert.match(fixOf(put), said, what);
    assert.equal(version(sql, 'register.obligations'), 1, what);
    sql.close();
  }
});

test('A ROW THE LIST ALREADY REFUSED does not hold back a change that leaves it as it was, and a row is counted once', async () => {
  const { k, sql } = await record(1);
  /* As the audit's narrowing left a record before this build: `state` at `[paid]`, over a row that holds `open`. */
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.state', 'gone') WHERE register = 'obligations'");
  const note = await k.install([obligations([...OBLIGATIONS_FIELDS, { id: 'note', type: 'text' }])]);
  assert.ok(note.ok, fixOf(note));

  const tags = (values: string[]) => obligations([...OBLIGATIONS_FIELDS, { id: 'tags', type: 'list', of: 'enum', values }]);
  assert.ok((await k.install([tags(['a', 'b', 'c'])])).ok);
  const made = k.create('obligations', { what: 'Invoice 9', state: 'open', tags: ['a', 'b'] }, { actor: 'p_1' });
  assert.ok(made.ok, fixOf(made));
  const narrowed = await k.install([tags(['c'])]);
  assert.equal(codeOf(narrowed), 'ENUM_VALUE_UNKNOWN');
  assert.match(fixOf(narrowed), /would no longer take a or b, and 1 row holds them, so every edit to that row/);
  sql.close();
});

test('and what the rows can bear still installs: a wider enum, a required field with a default, a type change over no values, a ref to a list held', async () => {
  const { k, sql } = await record();
  for (const to of [
    WIDER,
    obligations([...OBLIGATIONS_FIELDS, { id: 'amount_due', type: 'int', required: true, default: 0 }]),
    obligations([...OBLIGATIONS_FIELDS, { id: 'note', type: 'text' }]),
    obligations([...OBLIGATIONS_FIELDS, { id: 'note', type: 'int' }]),
    register('newlist', 'New list', [{ id: 'what', type: 'text' }, { id: 'owes', type: 'ref', to: 'obligations' }]),
    { declarations: [register('other', 'Other', [{ id: 'what', type: 'text' }]), register('pointer', 'Pointer', [{ id: 'what', type: 'text' }, { id: 'at', type: 'ref', to: 'other' }])] },
  ]) {
    const put = await k.install([to as Declaration]);
    assert.ok(put.ok, `${JSON.stringify(to).slice(0, 80)}: ${fixOf(put)}`);
  }
  sql.close();
});
