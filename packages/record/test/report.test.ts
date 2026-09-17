/**
 * Report keys: a project sends its own rows with a key that reaches nothing else.
 *
 * What is asserted is the promise an owner reads when they hand a key to a service: it writes rows to the one
 * list it was made for, with the fields it was made with, and every other call it makes is refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, REPORT_BYTES_MOST, reportBindingOf, reportLabel, reportedFields, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 9);

const POINTS = {
  id: 'register.points',
  kind: 'register' as const,
  body: {
    id: 'points',
    name: 'Points',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'value', type: 'decimal', required: true },
      { id: 'unit', type: 'text' },
      { id: 'project', type: 'text' },
      { id: 'source', type: 'enum', values: ['reported', 'polled', 'typed'] },
      { id: 'at', type: 'instant' },
    ],
  } as never,
};
const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: Out): T => {
  assert.ok(r.ok, r.ok ? '' : `${r.refusal?.code}: ${r.refusal?.fix}`);
  return r.value as T;
};
const refusal = (r: Out) => {
  assert.equal(r.ok, false, 'the call went through');
  return r.refusal!;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await api.kernel.install([POINTS, TASKS])).ok);
  /* A key, and the context a host builds from it: the principal `verifyToken` answers, and nothing else. */
  const key = async (args: Record<string, unknown> = { register: 'points', fixed: { project: 'fake-project', source: 'reported' }, stamp: 'at', name: 'Fake project' }) => {
    const minted = value<{ id: string; bearer: string; register: string }>(await api.createReportKey(args as never, owner));
    const seen = await api.kernel.verifyToken(minted.bearer, 'api');
    assert.ok(seen.ok);
    const ctx: CallContext = { principal: { kind: 'token', id: seen.value.id, scope: seen.value.scope, person: seen.value.person_id, level: 'owner' } };
    return { minted, ctx };
  };
  return { api, sql, key };
}

test('A REPORT KEY WRITES ONE ROW, with its fixed fields over what was sent and its stamp filled', async () => {
  const { api, sql, key } = await record();
  const { minted, ctx } = await key();
  assert.equal(minted.register, 'points');
  const out = value<{ register: string; written: { id: string; seq: number }[] }>(
    await api.report({ name: 'Monthly recurring revenue', value: 4200.5, unit: 'GBP', project: 'somebody-else' }, ctx),
  );
  assert.equal(out.register, 'points');
  assert.equal(out.written.length, 1);
  const row = value<{ fields: Record<string, unknown> }>(await api.get({ register: 'points', seq: out.written[0]!.seq }, owner));
  assert.equal(row.fields.project, 'fake-project', 'a project said it was another project, and the record believed it');
  assert.equal(row.fields.source, 'reported');
  assert.equal(row.fields.value, 4200.5);
  assert.equal(row.fields.at, new Date(NOW).toISOString());
  const actor = sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = ? AND kind = 'create'", `entry:${out.written[0]!.id}`);
  assert.equal(actor?.actor, `report:${minted.id}`);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'session'")?.n, 0, 'a report opened a run');
  sql.close();
});

test('A BATCH IS ALL OR NOTHING, and a stamp the project sent is kept', async () => {
  const { api, sql, key } = await record();
  const { ctx } = await key();
  const at = '2026-09-16T08:00:00.000Z';
  const two = value<{ written: unknown[] }>(await api.report({ rows: [{ name: 'Sign-ups', value: 12, at }, { name: 'Sign-ups', value: 14 }] }, ctx));
  assert.equal(two.written.length, 2);
  const listed = value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'points' }, owner));
  assert.ok(listed.rows.some((r) => r.fields.at === at), 'the time the project sent was replaced');

  const bad = refusal(await api.report({ rows: [{ name: 'Fine', value: 1 }, { name: 'No value' }] }, ctx));
  assert.match(bad.at ?? '', /^rows\[1\]/);
  assert.equal(value<{ rows: unknown[] }>(await api.list({ register: 'points' }, owner)).rows.length, 2, 'half a refused batch was kept');

  const over = refusal(await api.report({ rows: Array.from({ length: 101 }, (_, i) => ({ name: 'n', value: i })) }, ctx));
  assert.equal(over.code, 'OUT_OF_BOUNDS');
  sql.close();
});

test("A REPORT IS WEIGHED, so a key kept in a project's environment cannot fill the record with text", async () => {
  const { api, sql, key } = await record();
  const { ctx } = await key();
  /* ONE ROW OF FIVE MEGABYTES WAS WRITTEN. A report key lives in a project's environment, where it is the credential most
     likely to leak, and a hundred rows of that is half a gigabyte a call. */
  const heavy = refusal(await api.report({ name: 'x'.repeat(REPORT_BYTES_MOST), value: 1 }, ctx));
  assert.equal(heavy.code, 'OUT_OF_BOUNDS');
  assert.equal(heavy.at, 'rows');
  const batch = refusal(await api.report({ rows: Array.from({ length: 50 }, () => ({ name: 'y'.repeat(Math.ceil(REPORT_BYTES_MOST / 40)), value: 1 })) }, ctx));
  assert.equal(batch.code, 'OUT_OF_BOUNDS');
  assert.equal(value<{ rows: unknown[] }>(await api.list({ register: 'points' }, owner)).rows.length, 0, 'an oversized report was written');
  /* A report of ordinary size is untouched. */
  value(await api.report({ rows: Array.from({ length: 100 }, (_, i) => ({ name: 'Sign-ups', value: i, unit: 'people' })) }, ctx));
  sql.close();
});

test('A REPORT KEY REACHES NOTHING BUT report', async () => {
  const { api, sql, key } = await record();
  const { ctx } = await key();
  const surface = api as unknown as Record<string, (...a: unknown[]) => Promise<Out>>;
  const calls: [string, unknown[]][] = [
    ['list', [{ register: 'points' }]],
    ['list', [{ register: 'tasks' }]],
    ['get', [{ register: 'points', seq: 1 }]],
    ['create', [{ register: 'points', fields: { name: 'x', value: 1 } }]],
    ['create', [{ register: 'tasks', fields: { what: 'x' } }]],
    ['update', [{ register: 'points', seq: 1, patch: { value: 2 } }]],
    ['search', [{ q: 'x' }]],
    ['boot', []],
    ['whoami', []],
    ['page', [{ slug: 'x' }]],
    ['pages', []],
    ['propose', [{ register: 'tasks', body_kind: 'rowset', body: {} }]],
    ['log', [{ register: 'points', seq: 1, note: 'x' }]],
    ['metric', [{ metric: 'x' }]],
    ['schema', [{ register: 'points' }]],
    ['context', [{}]],
    ['listTokens', []],
    ['createToken', [{ scope: 'write' }]],
    ['createReportKey', [{ register: 'points' }]],
    ['reportKeys', []],
    ['listGrants', []],
    ['members', []],
  ];
  for (const [name, args] of calls) {
    const said = refusal(await surface[name]!(...args, ctx));
    assert.ok(['FORBIDDEN', 'NEEDS_BROWSER_SESSION'].includes(said.code), `${name} answered ${said.code}`);
  }
  assert.equal(refusal(await api.list({ register: 'points' }, ctx)).code, 'FORBIDDEN');
  sql.close();
});

test('ONLY A REPORT KEY REPORTS, and only createReportKey makes one', async () => {
  const { api, sql, key } = await record();
  assert.equal(refusal(await api.report({ name: 'x', value: 1 }, owner)).code, 'FORBIDDEN');
  const token = { principal: { kind: 'token', id: 't_other', scope: 'write', person: 'p_1', level: 'owner' } } as CallContext;
  assert.equal(refusal(await api.report({ name: 'x', value: 1 }, token)).code, 'FORBIDDEN');

  const labelled = refusal(await api.createToken({ scope: 'write', label: reportLabel({ register: 'tasks' }) }, owner));
  assert.equal(labelled.code, 'VALUE_MALFORMED');
  assert.equal(labelled.at, 'label');

  assert.equal(refusal(await api.createReportKey({ register: 'nothing' }, owner)).code, 'REGISTER_UNKNOWN');
  assert.equal(refusal(await api.createReportKey({ register: 'points', fixed: { nope: 1 } }, owner)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(await api.createReportKey({ register: 'points', stamp: 'name' }, owner)).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await api.createReportKey({ register: 'points' }, { ...owner, credentialed: false })).code, 'NEEDS_BROWSER_SESSION');

  const { minted, ctx } = await key();
  const listed = value<{ id: string; register: string; fixed?: Record<string, unknown>; name?: string }[]>(await api.reportKeys(owner));
  assert.deepEqual(listed.map((k) => [k.id, k.register, k.fixed?.project, k.name]), [[minted.id, 'points', 'fake-project', 'Fake project']]);
  assert.ok(!JSON.stringify(listed).includes(minted.bearer.split('.')[1]!), 'the listing carried the key');

  /* REVOKED, THE KEY IS GONE: a host that verifies it gets nothing to build a context from. */
  assert.ok((await api.revokeToken({ id: minted.id }, owner)).ok);
  assert.equal((await api.kernel.verifyToken(minted.bearer, 'api')).ok, false);
  void ctx;
  sql.close();
});

test('the binding reads back as it was written, and a broken one binds nothing', () => {
  const binding = { register: 'points', fixed: { project: 'p' }, stamp: 'at', name: 'P' };
  assert.deepEqual(reportBindingOf(reportLabel(binding)), binding);
  assert.equal(reportBindingOf('laptop'), null);
  assert.equal(reportBindingOf(null), null);
  assert.deepEqual(reportBindingOf('report:{not json'), { register: '' });
  assert.deepEqual(reportBindingOf('report:{"register":"Bad Name"}'), { register: '' });
  assert.deepEqual(reportedFields({ register: 'points', stamp: 'day' }, { name: 'x' }, '2026-09-17T09:00:00.000Z', 'day'), { name: 'x', day: '2026-09-17' });
});
