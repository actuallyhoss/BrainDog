/**
 * The kernel's own wiring for batch 39 answers through `openRecord`, not only in the module that holds each part.
 *
 * Each part was built and tested beside the kernel (`token.ts`, `pages.ts`, migration 32), and a part the kernel never
 * hands on is a part nobody reaches: the build a key's command said, the tool call it made, a question's cause and how
 * many share it, and the vital signs as a page block. Each test reads one of them the way the record and the door do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type PageBlock } from '../src/index.ts';
import { NEVER_FILED } from '../src/sources/signs.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const BUILD = '2026.10.09+1a2b3c4';

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};
const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It helps.' }, { id: 'no', label: 'No', because: 'It does not.' }] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await k.install([TASKS]));
  return { k, sql, clock };
}

const kept = (sql: NodeSql, id: string) =>
  sql.one<{ last_build: string | null; last_tool_at: string | null }>('SELECT last_build, last_tool_at FROM token WHERE id = ?', id);

test('A KEY KEEPS THE BUILD ITS COMMAND SAID, through the kernel, and a value that is not a build leaves it be', async () => {
  const { k, sql } = await record();
  const minted = value<{ id: string; bearer: string }>(await k.createToken('p_1', { scope: 'write', label: 'laptop' }));
  value(await k.verifyToken(minted.bearer, 'mcp', undefined, BUILD));
  assert.equal(kept(sql, minted.id)?.last_build, BUILD);
  value(await k.verifyToken(minted.bearer, 'mcp', undefined, '/Users/someone/braindog'));
  assert.equal(kept(sql, minted.id)?.last_build, BUILD);
  sql.close();
});

test('A TOOL CALL MOVES THE KEY’S LAST TOOL CALL to now, through the kernel', async () => {
  const { k, sql, clock } = await record();
  const minted = value<{ id: string }>(await k.createToken('p_1', { scope: 'write', label: 'laptop' }));
  assert.equal(kept(sql, minted.id)?.last_tool_at, null);
  clock.advance(60_000);
  k.noteTool(minted.id);
  assert.equal(kept(sql, minted.id)?.last_tool_at, new Date(NOW + 60_000).toISOString());
  sql.close();
});

test('A QUESTION ON A PAGE CARRIES ITS CAUSE AND HOW MANY OPEN ONES SHARE IT, open or put off', async () => {
  const { k, sql } = await record();
  const given = value<{ id: string }>(k.propose({ question: 'Which first?', body_kind: 'options', body: OPTIONS, cause: 'release-order' } as never, 'p_1'));
  const later = value<{ id: string }>(k.propose({ question: 'Ship on Friday?', body_kind: 'options', body: OPTIONS, cause: 'ship-day' } as never, 'p_1'));
  sql.exec('UPDATE suggestion SET defer_until = ? WHERE id = ?', new Date(NOW + 86_400_000).toISOString(), later.id);

  const open = k.block({ kind: 'queue', source: 'governance.open' } as PageBlock) as { queue?: { id: string; cause?: string; alike?: number }[] };
  const one = open.queue?.find((q) => q.id === given.id);
  assert.deepEqual([one?.cause, one?.alike], ['release-order', 1]);

  const put = k.block({ kind: 'queue', source: 'governance.later' } as PageBlock) as { queue?: { id: string; cause?: string; alike?: number }[] };
  const off = put.queue?.find((q) => q.id === later.id);
  assert.deepEqual([off?.cause, off?.alike], ['ship-day', 1]);
  sql.close();
});

test('THE VITAL SIGNS ARE A PAGE SOURCE: a signs block reads every sign the record reads, and never refuses as not built', async () => {
  const { k, sql } = await record();
  const read = k.block({ kind: 'table', source: 'signs', columns: [{ field: 'name' }, { field: 'state' }, { field: 'said' }] } as PageBlock);
  assert.ok(!read.refusals.some((r) => r.code === 'NOT_IN_THIS_BUILD'), JSON.stringify(read.refusals));
  const signs = value<{ signs: { sign: string; state: string; said: string }[] }>(k.signs()).signs;
  assert.ok(signs.length > 0);
  /* EVERY SIGN, those nothing was filed for folded into one line (`foldUnfiled`). */
  const never = signs.filter((s) => s.state === 'none' && s.said === NEVER_FILED).length;
  assert.equal(read.matched, signs.length - (never > 1 ? never - 1 : 0));
  sql.close();
});
