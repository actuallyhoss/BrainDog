/**
 * What a `change` carries to install, held to the shape `install` reads, at the moment it is proposed.
 *
 * `checkBody` asked only that `to` be an object, so `{ values: [...] }` was filed. Accepting it committed the decision
 * and resolved the suggestion inside the gate's transaction, and then `install([to])` read `decl.body.writes` off
 * `undefined` and threw a `TypeError` out of the record's `decide`, before `reopen` could run. Driven through the
 * record, with the state read afterwards: SG1 `resolved`, D1 `accept`, nothing installed. That is the decision that
 * resolved before its change landed, which the comment on `decide` exists to rule out, reached from any `propose` token
 * with one malformed body.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

/** The same register with one more value, as a whole declaration: the shape `install` takes. */
const WIDER: Declaration = {
  ...OBLIGATIONS,
  body: {
    ...(OBLIGATIONS.body as Record<string, unknown>),
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid', 'part'] },
    ],
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS])).ok);
  return { k, sql };
}

const change = (to: unknown) => ({
  question: 'Should state admit `part`?',
  body_kind: 'change' as const,
  body: { declaration_id: 'register.obligations', to },
});

const filed = (sql: NodeSql) => sql.all('SELECT 1 FROM suggestion').length;

test('A CHANGE WHOSE `to` IS A BARE BODY IS REFUSED WHEN IT IS PROPOSED, not thrown when it is accepted', async () => {
  const { k, sql } = await record();
  for (const to of [
    { values: ['open', 'paid', 'part'] },
    { id: 'register.obligations', kind: 'register' },
    { id: 'register.obligations', kind: 'register', body: 'fields' },
    { id: 7, kind: 'register', body: {} },
    { id: 'register.obligations', kind: 7, body: {} },
    { declarations: [] },
    { declarations: [WIDER, { values: ['part'] }] },
    [WIDER],
  ]) {
    const out = k.propose(change(to), 'p_1');
    assert.equal(out.ok, false, `${JSON.stringify(to)} was filed, and accepting it installs nothing`);
    if (out.ok || !('refusal' in out)) continue;
    assert.equal(out.refusal.code, 'VALUE_MALFORMED', JSON.stringify(to));
    assert.equal(out.refusal.at, 'body.to');
  }
  assert.equal(filed(sql), 0, 'a change with nothing installable behind it reached the queue');
  sql.close();
});

test('and a declaration, or a bundle of them, is still filed, accepted and installed', async () => {
  const { k, sql } = await record();
  for (const to of [WIDER, { declarations: [WIDER] }]) {
    const made = k.propose(change(to), 'p_1');
    assert.ok(made.ok, made.ok ? '' : JSON.stringify(made));
    const out = k.decide(made.value.id, { decide: { option: 'accept', reason: 'part payments happen' } }, 'p_owner');
    assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
    const put = await k.install([out.value.install as Declaration]);
    assert.ok(put.ok, put.ok ? '' : JSON.stringify(put));
  }
  sql.close();
});
