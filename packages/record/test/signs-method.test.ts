/**
 * `signs`: the record's vital signs read through the record (PRF-A01), the door `braindog signs`, the Health page and an
 * agent all read them by.
 *
 * What is asserted is the door, not the readers, which are the kernel's (`kernel/test/signs-read.test.ts`): every
 * sign comes back with a state each, a read writes nothing and opens no run, and a caller held to part of the record is
 * told so rather than shown the whole.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VITAL_SIGNS } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);

/** Every sign on the closed list, the kernel's five and the four filed (`VITAL_SIGNS` in `packages/kernel/src/signs.ts`). */
const EVERY = VITAL_SIGNS.map((s) => s.sign);

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  return { api, sql };
}

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' },
  session: { client_id: 'claude-run-1', agent: 'claude', host: 'dev-pc', repo: 'kiln' },
};

/** The signs out of an answer, however the kernel holds them: a list, or an object with one under `signs`. */
const signsOf = (value: unknown): { sign?: string; id?: string; state?: string }[] => {
  if (Array.isArray(value)) return value as never;
  const held = (value as { signs?: unknown } | null)?.signs;
  return Array.isArray(held) ? (held as never) : [];
};

/** Everything a read could have written: rows, history lines and the signs' own readings. */
const written = (sql: NodeSql) => ({
  entries: sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM entry')!.n,
  events: sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')!.n,
});

test('THE OWNER AND HER AGENT READ EVERY SIGN, each with a state, and the read writes nothing and opens no run', async () => {
  const { api, sql } = await record();
  const before = written(sql);
  for (const who of [owner, agent]) {
    const out = await api.signs({}, who);
    assert.ok(out.ok, JSON.stringify(out));
    const signs = signsOf(out.value);
    assert.deepEqual(signs.map((s) => s.sign ?? s.id).sort(), [...EVERY].sort());
    for (const s of signs) assert.ok(['green', 'red', 'none'].includes(String(s.state)), `${String(s.sign ?? s.id)} reads ${String(s.state)}`);
  }
  assert.deepEqual(written(sql), before);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'session'")!.n, 0);
  sql.close();
});

test('A CALLER HELD TO PART OF THE RECORD, OR WHO MAY ONLY ADD, IS TOLD SO in one sentence and shown nothing', async () => {
  const { api, sql } = await record();
  const narrow: CallContext = { ...owner, principal: { kind: 'person', id: 'p_2', level: 'write' }, registers: ['tasks'] };
  const adder: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'append' } };
  /* One who reads only Tasks is held by this door; one who may only add is held by the read guard before it. */
  for (const [who, code] of [[narrow, 'FORBIDDEN'], [adder, 'LEVEL_REQUIRED']] as const) {
    const out = await api.signs({}, who);
    assert.equal(out.ok, false);
    const refusal = (out as { refusal: { code: string; fix: string } }).refusal;
    assert.equal(refusal.code, code);
    assert.doesNotMatch(refusal.fix, /—/u);
  }
  sql.close();
});
