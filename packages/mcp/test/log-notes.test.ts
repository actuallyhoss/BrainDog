/**
 * `log` puts a note on a row of any list, for an agent whose run asks about every change.
 *
 * MEASURED ON THE LIVE RECORD, 20 Oct: once a run had read something from outside the record, every write of its was
 * filed as a question, and `log` failed on every row with `VALUE_MALFORMED at body.rows[0].patch`. It sent the note as
 * an empty patch through `update`, which the ladder filed as a rowset question that changes no field, and a question
 * like that is refused. A note changes no field, so the record holds a note alone to the floor, as its own `log` does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const agent: CallContext = {
  principal: { kind: 'token', id: 't', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'log-notes', agent: 'claude' },
} as CallContext;
const other: CallContext = { principal: { kind: 'person', id: 'p_other', level: 'owner' } };

const ok = <T>(r: { ok: boolean; value?: unknown }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.value as T;
};

test('LOG NOTES A ROW OF EVERY LIST, after the run has read words another person wrote', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 20, 9)) });
  await installSeed(api.kernel);
  /* A GRANT THE RECORD HOLDS, so the ladder reads this token as an agent and not as the owner. */
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t', 'p_seed', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  const mcp = tools(api);

  /* THE RUN READS A ROW ANOTHER PERSON MADE, so the record drops it to Ask for the rest of the run. */
  const theirs = ok<{ seq: number }>(await api.create({ register: 'tasks', fields: { what: 'Call the printer' } }, other));
  ok(await mcp.call('get', { spoken: `tasks#${String(theirs.seq)}` }, agent));
  const filed = ok<Record<string, unknown>>(await mcp.call('update', { spoken: 'tasks#1', patch: { what: 'Renamed' } }, agent));
  assert.ok('asked' in filed || 'filed' in filed, `the run was not asking: ${JSON.stringify(filed)}`);

  for (const spoken of ['tasks#1', 'things#1', 'obligations#1', 'people#1', 'accounts#1']) {
    const before = ok<{ version: number; fields: Record<string, unknown> }>(await api.get({ register: spoken.split('#')[0]!, seq: Number(spoken.split('#')[1]) }, other));
    const logged = await mcp.call('log', { spoken, note: `Checked ${spoken} today.` }, agent);
    const said = ok<{ spoken: string; version: number }>(logged);
    const after = ok<{ version: number; fields: Record<string, unknown> }>(await api.get({ register: spoken.split('#')[0]!, seq: Number(spoken.split('#')[1]) }, other));
    assert.equal(said.version, after.version, `log on ${spoken} answered a version the row does not hold`);
    assert.deepEqual(after.fields, before.fields, `a note on ${spoken} changed a field`);
    const events = ok<{ rows: { note?: string }[] }>(await mcp.call('history', { spoken }, other as never));
    assert.ok(
      events.rows.some((e) => e.note === `Checked ${spoken} today.`),
      `the note on ${spoken} is not in its history`,
    );
  }

  /* THE FLOOR STILL HOLDS: a row another person made takes no agent's note, and the refusal says what to do instead. */
  const held = await mcp.call('log', { spoken: `tasks#${String(theirs.seq)}`, note: 'Called them.' }, agent);
  assert.equal(held.ok, false);
  assert.match(JSON.stringify(held), /propose/u);
});
