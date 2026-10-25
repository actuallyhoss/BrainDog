/**
 * A key keeps its command's build and its last tool call (AGT-A02).
 *
 * WHAT WAS MEASURED BEFORE THIS. The record knew when a key was last used and through which door, and nothing else: a
 * Mac five commits behind and a week of sessions that called no tool both read as a key used today. `verifyToken` now
 * keeps the build the command said in the statement that already wrote the use, and `noteTool` keeps the last tool call
 * with no event, since a tool call is not history.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MIGRATIONS, execScript } from '../src/migrate.ts';
import { openRecord } from '../src/index.ts';
import tokenBuild0032 from '../src/migrations/0032_token_build.ts';
import { createToken, isBuild, listTokens, noteTool, revokeToken, USE_WRITE_MS, verifyToken, type TokenDeps, type TokenUses } from '../src/token.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const BUILD = '2026.10.09+1a2b3c4';

const registered = MIGRATIONS.some((m) => m.slug === 'token_build');

/**
 * A migrated record, and the token module's deps over it at `nowMs`. Until `migrate.ts` lists migration 32 (kernel-index
 * registers it), the test applies its text itself, so what is tested here is the same script the runner will run.
 */
async function record(nowMs = NOW): Promise<{ sql: NodeSql; deps: TokenDeps }> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  if (!registered) execScript(sql, tokenBuild0032);
  let n = 0;
  let r = 0;
  const deps: TokenDeps = {
    sql,
    nowMs,
    mint: () => `0${(n += 1).toString().padStart(4, '0')}`,
    recordId: () => REC,
    digest: async (text) => `h:${text}`,
    random: (size) => new Uint8Array(size).fill((r += 1)),
  };
  return { sql, deps };
}

const value = <T>(out: unknown): T => {
  const x = out as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const stored = (sql: NodeSql, id: string) =>
  sql.one<{ last_build: string | null; last_tool_at: string | null; last_used_at: string | null }>(
    'SELECT last_build, last_tool_at, last_used_at FROM token WHERE id = ?',
    id,
  );

const events = (sql: NodeSql): number => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')!.n;

test('MIGRATION 32 IS THE ONE THAT ADDS THE TWO COLUMNS, and the runner lists it', { todo: registered ? false : 'kernel-index registers 0032_token_build in migrate.ts' }, async () => {
  /* THE FILE ALONE IS NOT A MIGRATION: a file nothing lists is never applied, and every write below would throw
     "no such column" on a real record. */
  assert.deepEqual(
    MIGRATIONS.map((m) => [m.version, m.slug]).find(([, slug]) => slug === 'token_build'),
    [32, 'token_build'],
  );
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const columns = sql.all<{ name: string }>("SELECT name FROM pragma_table_info('token')").map((c) => c.name);
  assert.deepEqual(columns.slice(-2), ['last_build', 'last_tool_at']);
});

test('THE MIGRATION KEEPS EVERY KEY AS IT WAS, the two new facts empty', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  let n = 0;
  const deps: TokenDeps = {
    sql,
    nowMs: NOW,
    mint: () => `0${(n += 1).toString().padStart(4, '0')}`,
    recordId: () => REC,
    digest: async (text) => `h:${text}`,
    random: (size) => new Uint8Array(size).fill(7),
  };
  const minted = value<{ id: string }>(await createToken(deps, 'p_owner', { scope: 'write', label: 'laptop', reach: ['inbox'] }));
  const before = sql.one<Record<string, unknown>>('SELECT * FROM token WHERE id = ?', minted.id)!;
  execScript(sql, tokenBuild0032);
  const after = sql.one<Record<string, unknown>>('SELECT * FROM token WHERE id = ?', minted.id)!;
  assert.deepEqual({ ...after }, { ...before, last_build: null, last_tool_at: null });
});

test('THE BUILD THE COMMAND SAID IS KEPT, in the statement that keeps the use', async () => {
  const { sql, deps } = await record();
  const minted = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'write', label: 'laptop' }));
  value(await verifyToken(deps, minted.bearer, 'mcp', BUILD));
  assert.deepEqual({ ...stored(sql, minted.id) }, { last_build: BUILD, last_tool_at: null, last_used_at: new Date(NOW).toISOString() });

  /* A DEV BUILD IS A BUILD TOO: a checkout that was never bundled says `dev+` and a commit. */
  value(await verifyToken(deps, minted.bearer, 'mcp', 'dev+0000000'));
  assert.equal(stored(sql, minted.id)?.last_build, 'dev+0000000');
});

test('A VALUE THAT IS NOT A BUILD IS DROPPED, and the build already kept stays', async () => {
  const { sql, deps } = await record();
  const minted = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'write', label: 'laptop' }));
  value(await verifyToken(deps, minted.bearer, 'mcp', BUILD));
  for (const bad of ['', 'latest', '2026.10.09', '2026.10.09+XYZ1234', '2026.10.09+1a2b3c', '/Users/mara/bin', 'host.local', `${BUILD} `, 'bd_live.secret', 'dev+zzzzzzz']) {
    assert.equal(isBuild(bad), false, `${JSON.stringify(bad)} read as a build`);
    value(await verifyToken(deps, minted.bearer, 'mcp', bad));
    assert.equal(stored(sql, minted.id)?.last_build, BUILD, `${JSON.stringify(bad)} replaced the build`);
  }
  /* AND A CALL THAT SAYS NOTHING KEEPS IT TOO: an older command sends no header. */
  value(await verifyToken(deps, minted.bearer, 'api'));
  assert.equal(stored(sql, minted.id)?.last_build, BUILD);
});

test('THE EDGES OF A BUILD: forty hex digits are one, forty-one, a space inside, a path or a line end are not', async () => {
  const { sql, deps } = await record();
  const minted = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'write', label: 'laptop' }));
  const forty = `2026.10.09+${'a'.repeat(40)}`;
  value(await verifyToken(deps, minted.bearer, 'mcp', forty));
  assert.equal(stored(sql, minted.id)?.last_build, forty);
  for (const bad of [
    `2026.10.09+${'a'.repeat(41)}`,
    `dev+${'0'.repeat(41)}`,
    '2026.10.09 +1a2b3c4',
    '2026.10.09+1a2b 3c4',
    ` ${BUILD}`,
    `${BUILD}\n`,
    '2026.10.09+1A2B3C4',
    '../2026.10.09+1a2b3c4',
    `/opt/braindog/${BUILD}`,
    `${BUILD}/bin/braindog`,
  ]) {
    assert.equal(isBuild(bad), false, `${JSON.stringify(bad)} read as a build`);
    value(await verifyToken(deps, minted.bearer, 'mcp', bad));
    assert.equal(stored(sql, minted.id)?.last_build, forty, `${JSON.stringify(bad)} replaced the build`);
  }
});

test('A VERIFY WITH A BUILD IS STILL ONE WRITE, good build or bad', async () => {
  const { deps } = await record();
  const minted = value<{ bearer: string }>(await createToken(deps, 'p_owner', { scope: 'write', label: 'laptop' }));
  const writes: string[] = [];
  const counted: TokenDeps = {
    ...deps,
    sql: {
      exec: (text, ...params) => {
        writes.push(text);
        deps.sql.exec(text, ...params);
      },
      all: (text, ...params) => deps.sql.all(text, ...params),
      one: (text, ...params) => deps.sql.one(text, ...params),
      transactionSync: (fn) => deps.sql.transactionSync(fn),
    },
  };
  for (const build of [BUILD, 'not a build', undefined]) {
    writes.length = 0;
    value(await verifyToken(counted, minted.bearer, 'mcp', build));
    assert.equal(writes.length, 1, `${JSON.stringify(build)} wrote ${writes.length} statements`);
  }
});

test('A REFUSED BEARER KEEPS NO BUILD, since it was not used', async () => {
  const { sql, deps } = await record();
  const minted = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'read', label: 'old key' }));
  value(revokeToken(deps, 'p_owner', minted.id));
  assert.equal((await verifyToken(deps, minted.bearer, 'mcp', BUILD)).ok, false);
  assert.equal(stored(sql, minted.id)?.last_build, null);
});

test('noteTool KEEPS THE LAST TOOL CALL AND WRITES NO EVENT', async () => {
  const { sql, deps } = await record();
  const minted = value<{ id: string }>(await createToken(deps, 'p_owner', { scope: 'write', label: 'laptop' }));
  const before = events(sql);
  noteTool(sql, minted.id, '2026-10-09T09:05:00.000Z');
  noteTool(sql, minted.id, '2026-10-09T09:06:00.000Z');
  assert.equal(stored(sql, minted.id)?.last_tool_at, '2026-10-09T09:06:00.000Z');
  assert.equal(events(sql), before, 'a tool call wrote history');
  /* A KEY THAT IS NOT THERE CHANGES NOTHING, and does not throw out of a tool call that was answered. */
  noteTool(sql, 'tk_gone', '2026-10-09T09:07:00.000Z');
  assert.equal(events(sql), before);
});

test('THE LISTING CARRIES BOTH, and a revoke answers with them', async () => {
  const { sql, deps } = await record();
  const used = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'write', label: 'laptop' }));
  const idle = value<{ id: string }>(await createToken(deps, 'p_owner', { scope: 'read', label: 'phone' }));
  value(await verifyToken(deps, used.bearer, 'mcp', BUILD));
  noteTool(sql, used.id, '2026-10-09T09:05:00.000Z');

  const listed = listTokens(sql);
  const row = listed.find((t) => t.id === used.id);
  assert.equal(row?.last_build, BUILD);
  assert.equal(row?.last_tool_at, '2026-10-09T09:05:00.000Z');
  const other = listed.find((t) => t.id === idle.id);
  assert.equal(other?.last_build, null);
  assert.equal(other?.last_tool_at, null);

  const revoked = value<{ last_build: string | null; last_tool_at: string | null }>(revokeToken(deps, 'p_owner', used.id));
  assert.equal(revoked.last_build, BUILD);
  assert.equal(revoked.last_tool_at, '2026-10-09T09:05:00.000Z');
});

test('A KEY CALLED AGAIN INSIDE A MINUTE WRITES NOTHING, and the first use, a minute on, a new door and a new build do', async () => {
  const { sql, deps: base } = await record();
  const minted = value<{ id: string; bearer: string }>(await createToken(base, 'p_owner', { scope: 'write', label: 'laptop' }));
  const exec = sql.exec.bind(sql);
  let writes = 0;
  sql.exec = ((query: string, ...args: unknown[]) => {
    if (/^UPDATE token SET last_used_at/.test(query)) writes += 1;
    return (exec as (q: string, ...a: unknown[]) => unknown)(query, ...args);
  }) as typeof sql.exec;
  const uses: TokenUses = new Map();
  const at = (ms: number): TokenDeps => ({ ...base, nowMs: NOW + ms, uses });
  const used = (): string | null | undefined => stored(sql, minted.id)?.last_used_at;

  value(await verifyToken(at(0), minted.bearer, 'api', BUILD));
  assert.equal(writes, 1, 'the first use was not written');
  value(await verifyToken(at(30_000), minted.bearer, 'api', BUILD));
  value(await verifyToken(at(USE_WRITE_MS - 1), minted.bearer, 'api', 'not a build'));
  value(await verifyToken(at(USE_WRITE_MS - 1), minted.bearer, 'api'));
  assert.equal(writes, 1, 'a use inside the minute, same door and build, was written');
  assert.equal(used(), new Date(NOW).toISOString());

  /* A MINUTE ON IS WRITTEN, so the column is never more than a minute behind. */
  value(await verifyToken(at(USE_WRITE_MS), minted.bearer, 'api', BUILD));
  assert.equal(writes, 2);
  assert.equal(used(), new Date(NOW + USE_WRITE_MS).toISOString());

  /* ANOTHER DOOR OR A NEW BUILD IS WRITTEN AT ONCE, so the listing never names the wrong one. */
  value(await verifyToken(at(USE_WRITE_MS + 1_000), minted.bearer, 'mcp', BUILD));
  assert.equal(writes, 3);
  value(await verifyToken(at(USE_WRITE_MS + 2_000), minted.bearer, 'mcp', 'dev+0000000'));
  assert.equal(writes, 4);
  assert.equal(stored(sql, minted.id)?.last_build, 'dev+0000000');

  /* AND WITH NO `uses`, EVERY USE IS WRITTEN, as before. */
  value(await verifyToken({ ...base, nowMs: NOW + USE_WRITE_MS + 3_000 }, minted.bearer, 'mcp', 'dev+0000000'));
  assert.equal(writes, 5);
});
