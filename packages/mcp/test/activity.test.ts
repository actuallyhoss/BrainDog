/**
 * `activity`: the record's log as a tool, which is the one thing the old tool's agents have and this
 * package's agents did not.
 *
 * MEASURED AGAINST `loop/research-switch.md` §1. Of that server's twenty-one tools, nineteen have a
 * path here already: `brain_get/set/patch/log`, the four task tools and `brain_skills`,
 * `brain_credentials` and `brain_learnings` are `get`, `create`, `update`, `log` and `list` over the
 * register they name; `brain_suggestions` and `brain_suggest_new` are `governance` and `propose`;
 * `brain_session_update` is `handoff`; `brain_sessions` is inside `context` (`live.same_repo` and
 * `live.elsewhere`); and `money_inbox` maps to a route the record refuses to every token on purpose.
 * `brain_audit` was the one with no path at all: `history` takes a row, and an agent picking up after
 * another session does not know which row to ask about. That is what this tool is for.
 *
 * AND IT IS SHAPED THE WAY A ROW IS. A line of the log carried `register` and `seq` apart, so the
 * address every other tool takes had to be assembled by the model. It carries `spoken` here, with the
 * register's own prefix, exactly as `compact` does for a row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { TOOLS, tools } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 8, 20, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'what',
    seq_prefix: 'NO',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
  } as never,
};

type Line = { spoken?: string; register?: string; seq?: number; kind: string; actor: string; title: string | null };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([NOTES])).ok);
  return { sql, api, mcp: tools(api) };
}

test('activity IS A TOOL, so an agent picking up after another session can find what changed', async () => {
  const { mcp, sql } = await record();
  assert.ok(
    TOOLS.some((t) => t.name === 'activity'),
    'there is no tool that reaches the record log, so an agent can only ask about a row it already knows',
  );

  const made = await mcp.call('create', { register: 'notes', fields: { what: 'Chase the invoice', state: 'open' } }, owner);
  assert.ok(made.ok);
  assert.ok((await mcp.call('update', { spoken: 'NO1', patch: { state: 'done' }, note: 'Paid on the 20th.' }, owner)).ok);

  const out = await mcp.call('activity', {}, owner);
  assert.ok(out.ok, `activity refused: ${JSON.stringify(out)}`);
  const { events } = out.value as { events: Line[] };

  /* NEWEST FIRST, which is what "what changed while I was away" means. */
  assert.deepEqual(
    events.slice(0, 2).map((e) => e.kind),
    ['state', 'create'],
  );
  /* THE ROW IS NAMED AS EVERY OTHER TOOL NAMES IT, with the register's own prefix and nothing to assemble. */
  assert.equal(events[0]?.spoken, 'NO1');
  assert.equal(events[0]?.register, undefined, 'the parts travelled beside the address that replaces them');
  assert.equal(events[0]?.seq, undefined);
  assert.equal(events[0]?.title, 'Chase the invoice');
  assert.equal(events[0]?.actor, 'p_1');
  /* AND NO CURSOR, because the tool takes none: an answer that offered one would be teaching an
     argument the next call is refused for. */
  assert.deepEqual(Object.keys(out.value as object), ['events']);
  sql.close();
});

test('activity TAKES A LIMIT, and a bad one is the record\'s own refusal rather than a silent default', async () => {
  const { mcp, sql } = await record();
  for (let i = 0; i < 4; i++) assert.ok((await mcp.call('create', { register: 'notes', fields: { what: `Note ${String(i)}` } }, owner)).ok);

  const short = await mcp.call('activity', { limit: 2 }, owner);
  assert.ok(short.ok);
  assert.equal((short.value as { events: Line[] }).events.length, 2);

  const bad = await mcp.call('activity', { limit: 1.5 }, owner);
  assert.equal(bad.ok, false);
  assert.match(JSON.stringify(bad), /whole number/, 'the refusal does not say what to send instead');
  sql.close();
});

test('A LINE IS PAID FOR: the address replaces its parts, and an empty field does not travel', async (t) => {
  const { mcp, api, sql } = await record();
  assert.ok((await mcp.call('create', { register: 'notes', fields: { what: 'Chase the invoice' } }, owner)).ok);

  const raw = await api.recentHistory({ limit: 200 }, owner);
  assert.ok(raw.ok);
  const asked = await mcp.call('activity', { limit: 200 }, owner);
  assert.ok(asked.ok);
  const before = JSON.stringify(raw.value).length;
  const after = JSON.stringify(asked.value).length;
  t.diagnostic(`the log as the record answers it: ${String(before)} bytes; as the tool answers it: ${String(after)} bytes`);
  assert.ok(after < before * 0.7, `the tool relayed ${String(after)} bytes where the record sent ${String(before)}`);

  const { events } = asked.value as { events: Record<string, unknown>[] };
  const row = events.find((e) => e.spoken === 'NO1');
  assert.ok(row, 'the write to a row is not addressed');
  assert.equal(row.target, undefined, 'the row id travelled beside the address that replaces it');
  assert.equal(row.target_kind, undefined);
  for (const [key, value] of Object.entries(row)) assert.notEqual(value, null, `${key} is empty and travelled anyway`);
  sql.close();
});

/**
 * A LINE ABOUT NO ROW, WHICH THIS RECORD DOES NOT PRODUCE YET.
 *
 * `recentHistory` answered one line for a register installed and a row created, and that line was
 * the row's, so the branch could not be shown on a real record. It is held here against a line the
 * kernel's own type allows, because `target` is then the only thing left saying what it was about.
 */
test('A LINE ABOUT NO ROW KEEPS ITS TARGET, which is all it has left', async () => {
  const line = { rowid: 9, id: 'e1', ts: '2026-09-20T12:00:00.000Z', actor: 'p_1', kind: 'declaration', target: 'declaration:register.notes', target_kind: 'declaration', field: null, from: null, to: null, note: null, batch: null, register: null, seq: null, title: null };
  const { surface } = stub({ recentHistory: async () => ({ ok: true, value: { events: [line], cursor: null } }) });
  const out = await tools(surface).call('activity', {}, { who: 'agent' });
  assert.ok(out.ok);
  assert.deepEqual((out.value as { events: unknown[] }).events, [
    { rowid: 9, id: 'e1', ts: '2026-09-20T12:00:00.000Z', actor: 'p_1', kind: 'declaration', target: 'declaration:register.notes', target_kind: 'declaration' },
  ]);
});

/**
 * THE LADDER IS THE RECORD'S, AND THIS TOOL ADDS NOTHING TO IT.
 *
 * The log is the one read where a second check would be tempting, because one page of it can carry
 * lines from every register at once. It is not made here: `recentHistory` holds each line to what
 * the caller may see, and the tool relays what comes back. The assertion below is that a caller
 * held to one register sees only that register's lines, through a tool that contains no scope code.
 */
test('A CALLER HELD TO ONE REGISTER SEES ONLY ITS LINES, and the holding is the record\'s', async () => {
  const { mcp, api, sql } = await record();
  assert.ok(
    (
      await api.kernel.install([
        { id: 'register.bills', kind: 'register', body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
      ])
    ).ok,
  );
  assert.ok((await mcp.call('create', { register: 'notes', fields: { what: 'A note' } }, owner)).ok);
  assert.ok((await mcp.call('create', { register: 'bills', fields: { what: 'A bill' } }, owner)).ok);

  const whole = (await mcp.call('activity', {}, owner)) as { ok: true; value: { events: Line[] } };
  assert.ok(whole.ok);
  assert.deepEqual(new Set(whole.value.events.map((e) => e.title)), new Set(['A note', 'A bill']));

  /* THE PREMISE FIRST: without the ceiling both are there, so what is missing below is the ceiling's
     doing and not the fixture's. */
  const held = (await mcp.call('activity', {}, { ...owner, registers: ['notes'] })) as { ok: true; value: { events: Line[] } };
  assert.ok(held.ok);
  assert.deepEqual(held.value.events.map((e) => e.title), ['A note']);
  sql.close();
});

test('A HOST THAT DOES NOT ANSWER recentHistory SAYS SO, and names what to do instead', async () => {
  /* The two HTTP hosts hand `serveMcp` the whole `RecordApi`, so both answer this the day it ships.
     The command line builds a narrow surface over `@braindog/client` and routes a fixed list, so
     until `recentHistory` is in that list its stdio callers get this sentence rather than a hang. */
  const { recentHistory: _absent, ...older } = { ...stub().surface, recentHistory: undefined };
  const out = await tools(older).call('activity', {}, { who: 'agent' });
  assert.equal(out.ok, false);
  const refusal = (out as { refusal: { code: string; fix: string } }).refusal;
  assert.equal(refusal.code, 'NOT_IN_THIS_BUILD');
  assert.match(refusal.fix, /history/, 'the sentence does not name the tool that still works');
});
