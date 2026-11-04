/**
 * `update`, `log` and a ref field take a name the way `get` does (door audit D8, D30).
 *
 * `update`'s `spoken` is described "As get takes it", and `get {"spoken":"Kiln"}` reads Kiln, but `update` and `log` with
 * the same word were refused VALUE_MALFORMED with no `try`. A ref field given a name was refused "thing takes a row id or
 * a spoken id like things#41", with no `try` either. And a write to a row that is not there was VALUE_MALFORMED at `id`,
 * a field nobody sent, where `get` says ROW_UNKNOWN at `spoken`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const agent: CallContext = {
  principal: { kind: 'token', id: 't', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'write-by-name' },
} as CallContext;

async function seeded() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 22, 9)) });
  await installSeed(api.kernel);
  return tools(api);
}

type Refused = { ok: false; refusal: { code: string; at?: string; fix: string; try?: string } };

test('update and log take a name, as get does', async () => {
  const mcp = await seeded();
  const read = await mcp.call('get', { spoken: 'Kiln' }, agent);
  assert.ok(read.ok, JSON.stringify(read));
  const spoken = (read.value as { spoken: string }).spoken;

  const logged = await mcp.call('log', { spoken: 'Kiln', note: 'Checked the kiln by name.' }, agent);
  assert.ok(logged.ok, JSON.stringify(logged));
  assert.equal((logged.value as { spoken: string }).spoken, spoken);

  const lower = await mcp.call('log', { spoken: 'kiln', note: 'And in lower case.' }, agent);
  assert.ok(lower.ok, JSON.stringify(lower));
});

test('a name nothing is called is refused with a search to find it', async () => {
  const mcp = await seeded();
  const out = (await mcp.call('update', { spoken: 'Nothing Is Called This', patch: { health: 'fine' } }, agent)) as unknown as Refused;
  assert.equal(out.ok, false);
  assert.equal(out.refusal.at, 'spoken');
  assert.match(out.refusal.fix, /Nothing you can read is called Nothing Is Called This/u);
  assert.equal(out.refusal.try, 'search {"q":"Nothing Is Called This"}');
});

test('a write to a row that is not there is ROW_UNKNOWN at spoken, as get says it', async () => {
  const mcp = await seeded();
  const out = (await mcp.call('update', { spoken: 'tasks#999', patch: { what: 'x' } }, agent)) as unknown as Refused;
  assert.equal(out.refusal.code, 'ROW_UNKNOWN');
  assert.equal(out.refusal.at, 'spoken');
  const noted = (await mcp.call('log', { spoken: 'tasks#999', note: 'x' }, agent)) as unknown as Refused;
  assert.equal(noted.refusal.code, 'ROW_UNKNOWN');
});

test('a ref field given the name of the one row called that is taken as that row', async () => {
  const mcp = await seeded();
  const out = (await mcp.call('create', { register: 'tasks', fields: { what: 'Fire the test tiles', thing: 'Kiln' } }, agent)) as { ok: boolean; value: { spoken: string; fields: { thing: string } } };
  assert.ok(out.ok, JSON.stringify(out));
  /* THE ROW HOLDS THE LINK, NOT THE WORD: it reads back the handle of the same row `get` finds by that name. */
  const kiln = (await mcp.call('get', { spoken: 'Kiln' }, agent)) as { value: { spoken: string } };
  assert.equal(out.value.fields.thing, kiln.value.spoken);
  assert.match(out.value.fields.thing, /^things#\d+$/u);
});

test('a name nothing is called is refused at the field and writes nothing', async () => {
  const mcp = await seeded();
  const out = (await mcp.call('create', { register: 'tasks', fields: { what: 'Fire the test tiles', thing: 'No Such Project' } }, agent)) as unknown as Refused;
  assert.equal(out.ok, false);
  assert.equal(out.refusal.at, 'thing');
  const found = (await mcp.call('search', { q: 'Fire the test tiles' }, agent)) as { value: { matched: number } };
  assert.equal(found.value.matched, 0);
});
