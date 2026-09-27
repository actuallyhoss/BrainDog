/**
 * A 300-value `in` through the record binds at most three parameters in any statement.
 *
 * `packages/where`'s `IN_CHUNK` paragraph has the argument. Every value of an `in` used to be its own
 * bound parameter, so a list past about ninety-five values was a statement over the adapter's hundred
 * (`DO_LIMITS.variableNumber`): the Durable Object refused it, and once both hosts run every statement
 * through `guarded` the self-host refuses it too. Past sixty-four values a field whose values carry no
 * currency or unit now binds the list as one JSON text, so `kernel.list`'s page is the register, the
 * list and the limit, and its count is the register and the list.
 *
 * THIS COUNTS AT THE PORT, beneath the record and the kernel, because the ceiling is the port's: what
 * the grammar compiles is only half of it, and the other half is whatever the statement around it binds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Param, Row, Sql } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/* ── OPS-5: a long `in` through the record ───────────────────────────── */

const JOBS = {
  id: 'register.jobs',
  kind: 'register' as const,
  body: { id: 'jobs', name: 'Jobs', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** The port, with every statement's text and parameter count written down as it passes. */
function counted(): { sql: Sql; seen: { text: string; params: number }[] } {
  const inner = openSqlite();
  const seen: { text: string; params: number }[] = [];
  const sql: Sql = {
    exec(text: string, ...params: Param[]): void {
      seen.push({ text, params: params.length });
      inner.exec(text, ...params);
    },
    all<T = Row>(text: string, ...params: Param[]): T[] {
      seen.push({ text, params: params.length });
      return inner.all<T>(text, ...params);
    },
    one<T = Row>(text: string, ...params: Param[]): T | undefined {
      seen.push({ text, params: params.length });
      return inner.one<T>(text, ...params);
    },
    transactionSync<T>(fn: () => T): T {
      return inner.transactionSync(fn);
    },
  };
  return { sql, seen };
}

type Listed = { ok: boolean; value?: { rows: { fields: Record<string, unknown> }[] }; refusal?: { code: string; fix?: string } };

test('A 300-VALUE `in` AND ITS `not_in` THROUGH THE RECORD BIND AT MOST THREE PARAMETERS A STATEMENT, and answer the right rows', async () => {
  const { sql, seen } = counted();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 25, 12)) });
  assert.ok((await api.kernel.install([JOBS])).ok);
  for (const what of ['Draft the petition', 'File the claim', 'Chase the fee'])
    assert.ok((await api.create({ register: 'jobs', fields: { what } } as never, owner)).ok);

  const filler = Array.from({ length: 298 }, (_, i) => `nothing-${i}`);
  const asked = [...filler, 'File the claim', 'Chase the fee'];
  assert.equal(asked.length, 300);

  for (const [op, want] of [
    ['in', ['Chase the fee', 'File the claim']],
    ['not_in', ['Draft the petition']],
  ] as const) {
    seen.length = 0;
    const out = (await api.list({ register: 'jobs', where: { field: 'what', [op]: asked } } as never, owner)) as Listed;
    assert.ok(out.ok, `${op} was refused: ${out.refusal?.code} ${out.refusal?.fix ?? ''}`);
    assert.deepEqual(
      out.value!.rows.map((r) => String(r.fields.what)).sort(),
      [...want],
      `${op} answered the wrong rows`,
    );

    /* NOT VACUOUS: the predicate's statements were among the ones counted. */
    const carrying = seen.filter((s) => s.text.includes('json_each(?)'));
    assert.ok(carrying.length > 0, `no statement carried the list as one parameter during ${op}`);

    const most = Math.max(...seen.map((s) => s.params));
    const worst = seen.find((s) => s.params === most);
    assert.ok(most <= 3, `${op}: a statement bound ${most} parameters: ${worst?.text.slice(0, 160)}`);
  }
});
