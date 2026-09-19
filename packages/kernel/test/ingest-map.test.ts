/**
 * `map:`: a poll or a pull whose answer is JSON fills a row by paths (`43 §4.4`, `§4.5`, `map.ts`).
 *
 * The reads first, then the refusals at install, then the whole path through the runner with a stand-in
 * for the host: the first answer writes a row, the same answer again writes nothing, and a changed one
 * writes another.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type ActionAnswer, type Declaration, type Execute, type Kernel } from '../src/index.ts';
import { exponentOf, day } from '../src/ingest.ts';
import { mapField, select, type Mapping } from '../src/map.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 9);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const HOUR = 3_600_000;
const AT = new Date(NOW).toISOString();
const deps = { exponent: exponentOf, day };
const read = (m: Mapping, root: unknown, type?: string) => mapField(deps, m, root, AT, type);

/* ── the path grammar ────────────────────────────────────────────────────── */

test('A PATH READS OWN KEYS, INDICES, THE LAST ELEMENT AND EVERY ELEMENT', () => {
  const doc = { data: [{ id: 1 }, { id: 2 }], a: { b: 1 } };
  assert.deepEqual(select(doc, 'data'), [[{ id: 1 }, { id: 2 }]]);
  assert.deepEqual(select(doc, 'data[].id'), [1, 2]);
  assert.deepEqual(select(doc, 'data[-1].id'), [2]);
  assert.deepEqual(select(doc, 'data[0].id'), [1]);
  assert.deepEqual(select(doc, 'data[5].id'), []);
  assert.deepEqual(select([7, 8], '[1]'), [8]);
  assert.deepEqual(select({ a: { b: 1 } }, ''), [{ a: { b: 1 } }]);
  assert.deepEqual(select({}, '__proto__'), []);
  assert.deepEqual(select({}, 'constructor'), []);
  assert.deepEqual(select(doc, 'a..b'), []);
  assert.deepEqual(select(doc, Array.from({ length: 17 }, () => 'a').join('.')), []);
});

/* ── every type ──────────────────────────────────────────────────────────── */

test('EACH TYPE COERCES WHAT IT MAY, AND READS NOTHING FROM WHAT IT MAY NOT', () => {
  const doc = {
    s: 'Kiln', n: 42, f: 4200.5, fs: '12.25', big: '1234567890123456', b: true, bs: 'false', one: 1,
    at: '2026-09-16T08:30:00+02:00', epoch: 1_758_000_000, d: '2026-09-16', eu: '16/09/2026',
    state: 'up', odd: 'sideways', obj: { x: 1 }, pay: { amount: '12.50', currency: 'gbp' }, yen: 1250, list: [1, 2],
  };
  assert.deepEqual(read({ path: 's', type: 'text' }, doc), { value: 'Kiln', outcome: 'exact' });
  assert.deepEqual(read({ path: 'n', type: 'text' }, doc).value, '42');
  assert.equal(read({ path: 'obj', type: 'text' }, doc).value, null);
  assert.equal(read({ path: 'n', type: 'int' }, doc).value, 42);
  assert.equal(read({ path: 'f', type: 'int' }, doc).value, null, 'a fraction is not an int');
  assert.equal(read({ path: 'f', type: 'decimal' }, doc).value, 4200.5);
  assert.equal(read({ path: 'fs', type: 'decimal' }, doc).value, 12.25);
  assert.equal(read({ path: 'big', type: 'decimal' }, doc).value, null, 'sixteen significant digits');
  assert.equal(read({ path: 'b', type: 'bool' }, doc).value, true);
  assert.equal(read({ path: 'bs', type: 'bool' }, doc).value, false);
  assert.equal(read({ path: 'one', type: 'bool' }, doc).value, true);
  assert.equal(read({ path: 'at', type: 'instant' }, doc).value, '2026-09-16T06:30:00.000Z');
  assert.equal(read({ path: 'epoch', type: 'instant', from: 'epoch_s' }, doc).value, new Date(1_758_000_000_000).toISOString());
  assert.equal(read({ path: 's', type: 'instant' }, doc).value, null, 'never Date.parse on free text');
  assert.equal(read({ path: 'd', type: 'day' }, doc).value, '2026-09-16');
  assert.equal(read({ path: 'eu', type: 'day', format: 'DD/MM/YYYY' }, doc).value, '2026-09-16');
  assert.equal(read({ path: 'epoch', type: 'day', from: 'epoch_s' }, doc).value, new Date(1_758_000_000_000).toISOString().slice(0, 10));
  assert.deepEqual(read({ path: 'state', type: 'enum', values: ['up', 'down'] }, doc), { value: 'up', outcome: 'exact' });
  assert.deepEqual(read({ path: 'odd', type: 'enum', values: ['up', 'down'], other: 'down' }, doc), { value: 'down', outcome: 'defaulted' });
  assert.equal(read({ path: 'odd', type: 'enum', values: ['up', 'down'] }, doc).value, null);
  assert.deepEqual(read({ path: ['pay.amount', 'pay.currency'], type: 'money' }, doc).value, { amount: 1250, currency: 'GBP' });
  assert.deepEqual(read({ path: 'yen', type: 'money', currency: 'JPY' }, doc).value, { amount: 1250, currency: 'JPY' });
  assert.deepEqual(read({ path: 'n', type: 'money', currency: 'USD', minor: true }, doc).value, { amount: 42, currency: 'USD' });
  assert.deepEqual(read({ path: 'obj', type: 'json' }, doc).value, { x: 1 });
  assert.equal(read({ path: 'list[]', type: 'int' }, doc).value, null, 'two values is not one');
  assert.equal(read({ path: 'missing', type: 'text' }, doc).value, null);

  /* STATED BY THE DECLARATION, AND THE ARRIVAL'S OWN INSTANT. */
  assert.deepEqual(read({ value: 'mrr' }, doc), { value: 'mrr', outcome: 'exact' });
  assert.deepEqual(read({ arrived: true }, doc, 'instant'), { value: AT, outcome: 'exact' });
  assert.deepEqual(read({ arrived: true }, doc, 'day'), { value: AT.slice(0, 10), outcome: 'exact' });
  /* A body that was not JSON reaches nothing, and what is stated is still stated. */
  assert.equal(read({ path: 's', type: 'text' }, undefined).value, null);
  assert.equal(read({ value: 'mrr' }, undefined).value, 'mrr');
});

/* ── through the record ──────────────────────────────────────────────────── */

const POINTS: Declaration = {
  id: 'register.points',
  kind: 'register',
  body: {
    id: 'points',
    name: 'Points',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'value', type: 'decimal', required: true },
      { id: 'unit', type: 'text' },
      { id: 'at', type: 'instant' },
      { id: 'source', type: 'enum', values: ['reported', 'polled'] },
    ],
  } as never,
};

const POLL = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.mrr',
  kind: 'ingest',
  body: {
    ingest: 'mrr',
    channel: 'poll',
    url: 'https://stats.example.test/v1/numbers.json',
    every: '1h',
    grant: 'stats read',
    map: {
      name: { value: 'Monthly recurring revenue' },
      value: { path: 'data.mrr', type: 'decimal' },
      unit: { value: 'GBP' },
      source: { value: 'polled' },
      at: { arrived: true },
    },
    writes: { register: 'points' },
    ...over,
  } as never,
});

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: ID, slug: 'northwind', name: 'Northwind', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  const made = k.bindGrant({ label: 'stats read', opens: 'stats.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3, 4]), nonce: new Uint8Array([9, 9, 9, 9]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' }, 'p_1');
  assert.ok(made.ok, fixOf(made));
  if (decls.length) {
    const out = await k.install([POINTS, ...decls]);
    assert.ok(out.ok, fixOf(out as Result<unknown>));
  }
  return { k, sql, clock };
}

const codeOf = (r: Result<unknown>): string => (r.ok ? 'accepted' : 'refusal' in r ? r.refusal.code : 'conflict');
const said = (body: string): ActionAnswer => ({ status: 200, body, bytes: body.length, ms: 4, requests: 1 });
function host(...answers: ActionAnswer[]): Execute {
  let n = 0;
  return async () => answers[Math.min(n++, answers.length - 1)]!;
}
const points = (sql: NodeSql) =>
  sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'points' AND deleted_at IS NULL ORDER BY rowid").map((r) => JSON.parse(r.fields) as Record<string, unknown>);
const notes = (sql: NodeSql) =>
  sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' AND target = 'declaration:ingest.mrr' ORDER BY rowid").map((r) => r.note);

test('A MAP IS REFUSED AT INSTALL when an entry is none of the three forms', async () => {
  const { k } = await record();
  const refusedWith = async (map: unknown, over: Record<string, unknown> = {}) => codeOf(await k.install([POINTS, POLL({ map, ...over })]));
  assert.equal(await refusedWith({ value: { path: 'a', type: 'money' } }), 'DECLARATION_INVALID');
  assert.equal(await refusedWith({ value: { path: 'a', type: 'number' } }), 'DECLARATION_INVALID');
  assert.equal(await refusedWith({ value: { path: 'a..b', type: 'decimal' } }), 'PATH_INVALID');
  assert.equal(await refusedWith({ value: { path: Array.from({ length: 17 }, () => 'a').join('.'), type: 'decimal' } }), 'PATH_INVALID');
  assert.equal(await refusedWith({ value: { path: 'data[].mrr', type: 'decimal' } }), 'PATH_INVALID');
  assert.equal(await refusedWith({ at: { arrived: true, path: 'x' } }), 'DECLARATION_INVALID');
  assert.equal(await refusedWith({ at: { arrived: 'yes' } }), 'DECLARATION_INVALID');
  assert.equal(await refusedWith({ name: { value: 'x', type: 'text' } }), 'DECLARATION_INVALID');
  assert.equal(await refusedWith({ name: 'mrr' }), 'DECLARATION_INVALID');
  assert.equal(await refusedWith({ value: { path: 'a', type: 'decimal', guess: true } }), 'DECLARATION_INVALID');
  assert.equal(await refusedWith({ value: { path: 'a', type: 'decimal' } }, { extract: { name: { after: 'x' } } }), 'DECLARATION_INVALID');
  assert.equal(await refusedWith(POLL().body['map' as never]), 'accepted');
});

test('A POLL WITH A MAP WRITES A ROW ON THE FIRST ANSWER, NOTHING ON THE SAME ANSWER, AND ANOTHER WHEN IT CHANGES', async () => {
  const { k, sql, clock } = await record(POLL());
  const stand = host(said('{"data":{"mrr":4200.5,"users":12}}'), said('{"data":{"mrr":4200.5,"users":12}}'), said('{"data":{"mrr":4310,"users":13}}'));

  const first = await k.runActions(stand);
  assert.deepEqual({ ran: first.ran, changed: first.changed }, { ran: 1, changed: 1 });
  assert.deepEqual(points(sql), [{ name: 'Monthly recurring revenue', value: 4200.5, unit: 'GBP', source: 'polled', at: new Date(NOW).toISOString() }]);

  clock.advance(2 * HOUR);
  const second = await k.runActions(stand);
  assert.deepEqual({ ran: second.ran, changed: second.changed }, { ran: 1, changed: 0 });
  assert.equal(points(sql).length, 1, 'the same answer wrote a row');

  clock.advance(2 * HOUR);
  await k.runActions(stand);
  const rows = points(sql);
  assert.equal(rows.length, 2);
  assert.equal(rows[1]!.value, 4310);
  assert.equal(rows[1]!.at, new Date(NOW + 4 * HOUR).toISOString());

  const said3 = notes(sql);
  assert.match(said3[0]!, /answer changed/);
  assert.match(said3[1]!, /answer is the same/);
  assert.match(said3[2]!, /answer changed/);
});

test('A MAPPED PATH THAT READS NOTHING WRITES NO ROW: the answer waits for review, its bytes kept', async () => {
  const { k, sql } = await record(POLL());
  await k.runActions(host(said('{"data":{"arr":50400}}')));
  assert.equal(points(sql).length, 0);
  const raw = sql.one<{ state: string; reason: string }>("SELECT state, reason FROM inbox_raw WHERE channel = 'pull'");
  assert.equal(raw?.state, 'review');
  assert.match(raw?.reason ?? '', /could not read value/);

  /* And an answer that is not JSON at all is the same answer, never a throw. */
  const other = await record(POLL());
  await other.k.runActions(host(said('<html>502</html>')));
  assert.equal(points(other.sql).length, 0);
  assert.equal(other.sql.one<{ state: string }>("SELECT state FROM inbox_raw WHERE channel = 'pull'")?.state, 'review');
});

test('A PULL ANSWER WITH A MAP ARRIVES THROUGH THE SAME PATH', async () => {
  const users = {
    ingest: 'users',
    channel: 'pull',
    map: { name: { value: 'Users' }, value: { path: 'total', type: 'decimal' }, at: { path: 'as_of', type: 'instant', from: 'epoch_ms' } },
    writes: { register: 'points' },
  };
  const { k, sql } = await record(POLL());
  const out = k.arrive({ channel: 'pull', body: JSON.stringify({ total: 128, as_of: NOW - HOUR }), sha256: 'users:1' }, users as never);
  assert.ok(out.ok, fixOf(out as Result<unknown>));
  assert.equal(out.value.state, 'matched');
  assert.deepEqual(points(sql)[0], { name: 'Users', value: 128, at: new Date(NOW - HOUR).toISOString() });
});

/**
 * `43 §4.5`'s table says `invalid` for a value that is there and cannot be read, and this returned
 * `missing` for every one of them until now. Nothing in 868 tests noticed, because both outcomes make
 * the row `needs-review` and no wrong row was ever written.
 *
 * WHAT THEY COST IS THE SENTENCE A PERSON READS. `missing` sends somebody to the provider to ask why a
 * field was not sent; `invalid` sends them to a value that WAS sent and that we could not read, which is
 * almost always a format that changed. And `invalid` outranks `missing` in `§5.1` step 9's severity, so
 * collapsing them made a field that was invalid in one row and absent in another report as merely absent.
 */
test('A VALUE THAT IS NOT THERE IS `missing`', () => {
  assert.equal(read({ path: 'nope', type: 'int' }, { a: 1 }).outcome, 'missing');
  assert.equal(read({ path: 'a.b.c', type: 'text' }, { a: 1 }).outcome, 'missing');
  /* A path that fans out to several is not one value, so it is absent rather than unreadable. */
  assert.equal(read({ path: 'xs[]', type: 'int' }, { xs: [1, 2] }).outcome, 'missing');
});

test('A VALUE THAT IS THERE AND WILL NOT COERCE IS `invalid`', () => {
  assert.equal(read({ path: 'a', type: 'int' }, { a: 'abc' }).outcome, 'invalid');
  assert.equal(read({ path: 'a', type: 'int' }, { a: 1.5 }).outcome, 'invalid');
  assert.equal(read({ path: 'a', type: 'decimal' }, { a: 'x' }).outcome, 'invalid');
  assert.equal(read({ path: 'a', type: 'bool' }, { a: 'yes' }).outcome, 'invalid');
  assert.equal(read({ path: 'a', type: 'instant' }, { a: 'last Tuesday' }).outcome, 'invalid');
  assert.equal(read({ path: 'a', type: 'day', format: 'YYYY-MM-DD' }, { a: '29/08/26' }).outcome, 'invalid');
  assert.equal(read({ path: 'a', type: 'text' }, { a: { deep: 1 } }).outcome, 'invalid');
  assert.equal(read({ path: 'a', type: 'enum', values: ['x'] }, { a: 'y' }).outcome, 'invalid');
});

test('an enum with a declared `other:` is `defaulted`, which is neither of those', () => {
  const got = read({ path: 'a', type: 'enum', values: ['x'], other: 'x' }, { a: 'y' });
  assert.deepEqual(got, { value: 'x', outcome: 'defaulted' });
});

test('money tells an absent currency from an unreadable one', () => {
  assert.equal(read({ path: ['amt', 'cur'], type: 'money' }, { amt: 5 }).outcome, 'missing');
  assert.equal(read({ path: ['amt', 'cur'], type: 'money' }, { amt: 5, cur: 'pounds' }).outcome, 'invalid');
  assert.equal(read({ path: ['amt', 'cur'], type: 'money' }, { cur: 'EGP' }).outcome, 'missing');
  assert.equal(read({ path: ['amt', 'cur'], type: 'money' }, { amt: 'x', cur: 'EGP' }).outcome, 'invalid');
});

test('precision the currency cannot hold is invalid, not absent', () => {
  /* `JPY 12.5` is a real number the yen cannot carry, and the two available answers are 12 and 13, so
     the answer is neither (`43 §4.3`). */
  assert.equal(read({ path: 'amt', type: 'money', currency: 'JPY' }, { amt: 12.5 }).outcome, 'invalid');
  assert.equal(read({ path: 'amt', type: 'money', currency: 'JPY' }, { amt: 12 }).outcome, 'exact');
});
