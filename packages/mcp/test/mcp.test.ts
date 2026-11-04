/**
 * The sixteen tools and the resources, from an agent's side, over a real record.
 *
 * Two things are being asserted, and the second is the unusual one. The first is that each tool does
 * what it says. The second is that its REFUSALS TEACH: the caller is a model that will try again
 * immediately, so the difference between a good refusal and a bad one is whether the second attempt
 * works. Every test below that expects a refusal also checks the sentence names what to send.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, conflicted } from '@braindog/ports';

import { TOOLS, tools } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub, type Ctx } from './stub.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'token', id: 't', scope: 'read', person: 'p_1', level: 'owner' } };

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

/**
 * A SECOND REGISTER, BECAUSE A RECORD WITH ONE CANNOT ANSWER "WHICH OF THEM".
 *
 * With one register installed, "every register" and "the one inside the ceiling" are the same list,
 * and a scoping assertion holds against a surface that applies no scope at all. It is installed per
 * test rather than in `agent()` so that the tests about what the record HOLDS keep counting what
 * they were written to count.
 */
const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true }],
  } as never,
};

async function agent() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  return { sql, mcp: tools(api), api };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; allowed?: readonly string[] } };
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal;
};

/* ── the surface itself ──────────────────────────────────────────────────── */

test('THE COUNT IS THE DESIGN: sixteen, and each is named by the plan', () => {
  /* The eight of `10-MCP` §3 less what no token can use, plus `context`,
     `handoff` and `meet`, which are what an agent does every session. `decide` is ABSENT because no
     token reaches that rung: a tool that could only ever refuse is a tool an agent spends its turns
     discovering. `activity` is the fifteenth, a record-wide log, the one thing agents coming from
     other records reach for and nowhere here: see `activity.test.ts` for the rest of that comparison.
     `triage` is the sixteenth, the one tool the ceiling was raised for. `act` took `undo`'s place on 1 Nov: one tool for
     every call the app makes, with `undo` folded into it as `act undoOwn`, so an agent still puts right what it just wrote. `understand` was a seventeenth
     and is the resource `braindog:understand` now ("keep the 16"): it takes nothing and writes
     nothing, and its words paid for `op_id` on `create` and `update`.

     `instructions` CAME AND `schema` AND `history` WENT INTO `record_index` AND `get` (agents and MCP plan §6.1, 12a): what
     he tells an agent from the app is a tool of its own, and the two it folded are still callable until FOLDED_UNTIL.

     `money` WAS ONCE THE SIXTEENTH, and it read seven of money-core's figure ids by name, so the
     core knew one use case. A pack's figures are named
     by `record_index` and read by `get`, whatever pack declared them, and its pages through the resources, like any
     other pack's (`figures.test.ts`). */
  assert.deepEqual(
    TOOLS.map((t) => t.name),
    ['record_index', 'context', 'instructions', 'get', 'list', 'search', 'activity', 'governance', 'propose', 'create', 'update', 'log', 'handoff', 'meet', 'triage', 'act'],
  );
  for (const t of TOOLS) assert.ok(t.description.length > 30, `${t.name} has a description nobody can choose from`);
});

test('AND NO TOOL READS A CREDENTIAL, because there is no keychain tool', () => {
  /* The keychain needs a person in a browser, and an agent holding a token is neither. What a key opens
     arrives through `context`, by name; the value never arrives at all. */
  for (const t of TOOLS) assert.doesNotMatch(t.name, /grant|keychain|credential|secret|key/i, `${t.name} would read a credential`);
});

test('a tool says whether it writes, so a client can tell its user before it runs', () => {
  assert.deepEqual(
    TOOLS.filter((t) => t.writes).map((t) => t.name),
    ['instructions', 'propose', 'create', 'update', 'log', 'handoff', 'meet', 'triage', 'act'],
  );
});

/* ── they do what they say ───────────────────────────────────────────────── */

test('record_index says what the record holds, with the version as a number', async () => {
  const { mcp, sql } = await agent();
  const index = value<{ registers: { id: string; count: number }[]; version: number }>(await mcp.call('record_index', {}, owner));
  /* Found rather than pinned: the kernel declares registers of its own, such as `session`. */
  assert.equal(index.registers.find((r) => r.id === 'obligations')?.count, 0);
  assert.equal(typeof index.version, 'number');
  sql.close();
});

test('a row is addressed the way a person says it, and made and read and changed', async () => {
  const { mcp, sql } = await agent();
  const made = value<{ spoken: string; version: number }>(
    await mcp.call('create', { register: 'obligations', fields: { what: 'Invoice 41', state: 'open' }, note: 'From the PDF' }, owner),
  );
  assert.equal(made.spoken, 'obligations#1');

  const read = value<{ fields: Record<string, unknown> }>(await mcp.call('get', { spoken: 'obligations#1' }, owner));
  assert.equal(read.fields.what, 'Invoice 41');

  value(await mcp.call('update', { spoken: 'obligations#1', patch: { state: 'paid' }, version: made.version }, owner));
  assert.equal(value<{ state: string }>(await mcp.call('get', { spoken: 'obligations#1' }, owner)).state, 'paid');

  /* THE ONE ENVELOPE EVERY LIST-LIKE READ SHARES, `{ rows, matched }`, where it answered a bare array. */
  const events = value<{ rows: { kind: string; note?: string }[]; matched: number }>(await mcp.call('history', { spoken: 'obligations#1' }, owner));
  assert.deepEqual(events.rows.map((e) => e.kind), ['create', 'state']);
  assert.equal(events.rows[0]?.note, 'From the PDF');
  assert.equal(events.matched, 2);
  sql.close();
});

/**
 * DELETING WORKED AND NOTHING SAID SO, which is the same thing as not having it.
 *
 * Other records hand their agents a delete tool. Here a delete is
 * `deleted_at` through `update`, on the same verb and the same permission, and the tool list said
 * only "null clears a field": an agent reading it had no way to reach a verb the record has had all
 * along. The repair is a clause, not a sixteenth tool, and this test holds the clause to the truth.
 */
test('AN AGENT CAN DELETE A ROW, and the tool list is where it finds out how', async () => {
  const patch = (TOOLS.find((t) => t.name === 'update')?.input as { properties: { patch: { description: string } } }).properties.patch;
  assert.match(patch.description, /deleted_at/, 'nothing in the tool list tells an agent how to delete a row');

  const { mcp, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'Duplicate of 41' } }, owner));
  value(await mcp.call('update', { spoken: 'obligations#1', patch: { deleted_at: true }, note: 'A duplicate.' }, owner));

  /* GONE FROM EVERY READ. The record answers `null` for a row nobody may read, and the tool says so as a refusal,
     `ROW_UNKNOWN`, with the call that lists what is there: a bare `null` gave an agent nothing to do next. */
  const gone = refusal(await mcp.call('get', { spoken: 'obligations#1' }, owner));
  assert.equal(gone.code, 'ROW_UNKNOWN');
  assert.equal((gone as { try?: string }).try, 'list {"register":"obligations"}');
  assert.equal(value<{ matched: number }>(await mcp.call('list', { register: 'obligations' }, owner)).matched, 0);
  /* AND IT HAPPENED, rather than the patch being dropped quietly. `history` refuses a row that is
     gone as `get` does, so the log of the whole record is the only place left that carries it, which
     is a second use for `activity` nobody planned. */
  assert.equal(refusal(await mcp.call('history', { spoken: 'obligations#1' }, owner)).code, 'ROW_UNKNOWN');
  const { rows } = value<{ rows: { spoken: string; kind: string; note?: string }[] }>(await mcp.call('activity', {}, owner));
  assert.equal(rows[0]?.kind, 'delete');
  assert.equal(rows[0]?.spoken, 'obligations#1');
  assert.equal(rows[0]?.note, 'A duplicate.');
  sql.close();
});

test('list takes a predicate, which is why there is not a filter tool per register', async () => {
  const { mcp, sql } = await agent();
  for (const [what, state] of [['a', 'open'], ['b', 'paid'], ['c', 'open']] as const)
    value(await mcp.call('create', { register: 'obligations', fields: { what, state } }, owner));

  const open = value<{ matched: number }>(await mcp.call('list', { register: 'obligations', where: { field: 'state', is: 'open' } }, owner));
  assert.equal(open.matched, 2);

  const both = value<{ matched: number }>(
    await mcp.call('list', { register: 'obligations', where: { any: [{ field: 'state', is: 'open' }, { field: 'what', is: 'b' }] } }, owner),
  );
  assert.equal(both.matched, 3);
  sql.close();
});

/**
 * THE PAGE A READ ADVERTISES IS THE PAGE THE RECORD GIVES, and on both of these reads it was not.
 *
 * `list` read "1 to 200. Default 25." and the record does neither. `kernel.list` is
 * `Math.min(Math.max(1, Math.floor(Number(q.limit)) || 50), 500)` (`packages/kernel/src/index.ts:1608`),
 * and the tool layer forwards `limit` untouched, so nothing anywhere made 200 or 25 true. Driven over
 * `POST /mcp` on a self-host on port 5994 with 260 rows in one register: no `limit` came back with 50
 * rows, and `limit: 300` came back with all 260, straight past the ceiling the description named as
 * the most an agent could ask for. `search` read "1 to 50" over a ceiling of 100
 * (`packages/kernel/src/fts.ts:116`), measured against 130 rows all matching one word: `limit: 80`
 * answered 80 hits and `limit: 200` answered 100. Its default of 20 was the one figure of the four
 * that was right.
 *
 * WHICH WAY IT MATTERS IS THE DEFAULT. An agent that trusts "Default 25", reads a page and reasons
 * about what it holds is reasoning about 50 rows while believing it asked for 25, and the two answers
 * are indistinguishable from inside the payload. An understated ceiling is cheaper and still wrong: it
 * sends an agent that wants 400 rows on two round trips for a page the record gives in one.
 *
 * THE NUMBERS ARE READ OUT OF THE DESCRIPTIONS RATHER THAN WRITTEN HERE AGAIN, so this fails whichever
 * side moves. A cap named in prose and a cap enforced in code are two copies of one fact, and the copy
 * an agent reads is the prose.
 *
 * AND THE ANSWER AT `list`'s CAP IS NOT SILENT, which is the half that was already right: `matched` is
 * the whole count and `cursor` is the way down, so a page is never mistaken for the lot.
 */
test('THE LIMITS `list` AND `search` ADVERTISE ARE THE ONES THE RECORD KEEPS, ceiling and default', async () => {
  /** What the tool tells an agent it may ask for, read off the argument an agent reads. */
  const advertised = (name: string) => {
    const limit = (TOOLS.find((t) => t.name === name)?.input as { properties: { limit: { description: string } } }).properties.limit;
    const read = /^1 to ([0-9]+)\. (?:Up to [0-9]+ whole, else|Default) ([0-9]+)\.$/.exec(limit.description);
    assert.ok(read, `${name}'s limit reads ${JSON.stringify(limit.description)}, which names no range and no default`);
    return { ceiling: Number(read[1]), fallback: Number(read[2]) };
  };
  const listed = advertised('list');
  const found = advertised('search');

  const { mcp, api, sql } = await agent();
  /* SEARCHABLE, because one register has to answer both reads: two would be two fixtures for one fact. */
  assert.ok(
    (
      await api.kernel.install([
        {
          id: 'register.notes',
          kind: 'register' as const,
          body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true, search: true }] } as never,
        },
      ])
    ).ok,
  );
  /* Past the higher of the two ceilings, so "it gave me fewer" is never the register running out. */
  const held = Math.max(listed.ceiling, found.ceiling) + 20;
  for (let i = 1; i <= held; i += 1) value(await api.create({ register: 'notes', fields: { what: `zebrafish note ${String(i)}` } }, owner));

  const page = value<{ rows: unknown[]; matched: number; cursor: string | null }>(await mcp.call('list', { register: 'notes' }, owner));
  assert.equal(page.rows.length, listed.fallback, `list with no limit answered ${String(page.rows.length)} rows and promises ${String(listed.fallback)}`);
  assert.equal(page.matched, held, 'a page did not say how many rows the predicate matched');
  assert.ok(page.cursor, 'a page short of the whole register offered no way down');
  const most = value<{ rows: unknown[] }>(await mcp.call('list', { register: 'notes', limit: listed.ceiling + 100 }, owner));
  assert.equal(most.rows.length, listed.ceiling, `list answered ${String(most.rows.length)} rows for a ceiling it puts at ${String(listed.ceiling)}`);

  /* AND SEARCH ANSWERS THE SAME SHAPE AS `list` NOW, for the same reason: a hundred hits is
     character-for-character the answer to a query with exactly a hundred matches, so an agent that asked a
     broad question could not tell a whole answer from a corner of one. */
  const hits = value<{ rows: unknown[]; matched: number }>(await mcp.call('search', { q: 'zebrafish' }, owner));
  assert.equal(hits.rows.length, found.fallback, `search with no limit answered ${String(hits.rows.length)} hits and promises ${String(found.fallback)}`);
  assert.ok(hits.matched >= hits.rows.length, 'a search answered fewer matches than the rows it handed over');
  const every = value<{ rows: unknown[] }>(await mcp.call('search', { q: 'zebrafish', limit: found.ceiling + 50 }, owner));
  assert.equal(every.rows.length, found.ceiling, `search answered ${String(every.rows.length)} hits for a ceiling it puts at ${String(found.ceiling)}`);
  sql.close();
});

test('a note changes nothing and is still a write, so it lands in the history', async () => {
  const { mcp, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'a' } }, owner));
  const before = value<{ fields: Record<string, unknown> }>(await mcp.call('get', { spoken: 'obligations#1' }, owner));

  value(await mcp.call('log', { spoken: 'obligations#1', note: 'Chased on the call.' }, owner));
  const after = value<{ fields: Record<string, unknown> }>(await mcp.call('get', { spoken: 'obligations#1' }, owner));
  assert.deepEqual(after.fields, before.fields, 'a note changed the row');

  const events = value<{ rows: { note?: string }[] }>(await mcp.call('history', { spoken: 'obligations#1' }, owner));
  assert.equal(events.rows.at(-1)?.note, 'Chased on the call.');
  sql.close();
});

test('a prefixed id goes to the record as spoken, in one call', async () => {
  /* `S42` and `LN7` are how a person says a session or a learning. Which register owns a prefix is
     the record's declarations' to say, so the record resolves it, and the tool layer scans nothing. */
  const { surface, calls } = stub();
  const ctx: Ctx = { who: 'agent' };
  value(await tools(surface).call('get', { spoken: ' S42 ' }, ctx));
  assert.deepEqual(calls, [{ method: 'get', args: { spoken: 'S42' }, ctx }]);
});

test('AND OVER A REAL RECORD, S1 IS THE RUN', async () => {
  const { mcp, api, sql } = await agent();
  const token: CallContext = { principal: { kind: 'token', id: 't', scope: 'write', person: 'p_1', level: 'owner' }, session: { client_id: 'c-1' } };
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, token));
  assert.equal(value<{ fields: { client_id: string } }>(await mcp.call('get', { spoken: 'S1' }, owner)).fields.client_id, 'c-1');
  /* A RUN THAT IS NOT THERE IS REFUSED AS ONE, and with no list to name, since only the record knows which owns `S`. */
  const none = refusal(await mcp.call('get', { spoken: 'S9' }, owner));
  assert.equal(none.code, 'ROW_UNKNOWN');
  assert.match(none.fix, /^There is no S9 that you can read\./);
  sql.close();
});

test('AND A PREFIX NO READABLE REGISTER HOLDS IS A REFUSAL, never a throw', async () => {
  /* Against a real record, which has no learnings register here: the answer is the record's word for
     a register it does not have, and it names the tool that reads suggestions and decisions. */
  const { mcp, sql } = await agent();
  for (const spoken of ['LN7', 'SG12', 'D3']) {
    const said = refusal(await mcp.call('get', { spoken }, owner));
    assert.equal(said.code, 'REGISTER_UNKNOWN', spoken);
    assert.match(said.fix, /governance/, spoken);
  }
  sql.close();
});

/* ── the refusals teach ──────────────────────────────────────────────────── */

test('A REFUSAL NAMES WHAT TO SEND INSTEAD, because the caller will try again immediately', async () => {
  const { mcp, sql } = await agent();

  const noRegister = refusal(await mcp.call('list', { register: 'atlantis' }, owner));
  assert.equal(noRegister.code, 'REGISTER_UNKNOWN');
  assert.ok(noRegister.allowed?.includes('obligations'), 'it did not say which registers exist');

  const noField = refusal(await mcp.call('create', { register: 'obligations', fields: { nope: 1 } }, owner));
  assert.equal(noField.code, 'FIELD_UNKNOWN');
  assert.ok(noField.allowed?.includes('what'));

  const noValue = refusal(await mcp.call('create', { register: 'obligations', fields: { what: 'a', state: 'done' } }, owner));
  assert.equal(noValue.code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(noValue.allowed, ['open', 'paid']);

  const badPredicate = refusal(await mcp.call('list', { register: 'obligations', where: { field: 'nope', is: 1 } }, owner));
  assert.equal(badPredicate.code, 'FIELD_UNKNOWN');
  assert.ok(badPredicate.allowed?.length);

  const noTool = refusal(await mcp.call('delete_everything', {}, owner));
  assert.equal(noTool.code, 'ROUTE_UNKNOWN');
  assert.equal(noTool.allowed?.length, TOOLS.length);
  sql.close();
});

test('an address that is not one says what an address looks like', async () => {
  const { mcp, sql } = await agent();
  /* WHAT COULD BE A NAME IS LOOKED FOR AS ONE, and said so, with what a handle looks like. */
  for (const spoken of ['41', 'Obligations#41', 'obligations#0', 'S0', 'S42x']) {
    const fix = refusal(await mcp.call('get', { spoken }, owner)).fix;
    assert.ok(fix.startsWith(`Nothing you can read is called ${spoken}.`), fix);
    assert.match(fix, /name it as tasks#41/u, String(spoken));
  }
  /* WHAT CANNOT BE, A LIST'S OWN ID AND WHAT IS NO TEXT, IS TOLD THE TWO SHAPES. */
  for (const spoken of ['obligations', 's42', undefined, 42])
    assert.match(refusal(await mcp.call('get', { spoken }, owner)).fix, /by list and number, like tasks#41, or its id, like S42/u, String(spoken));
  /* The tools that change a row, or read its history, take a prefixed id too, and one that names no row says so. Each is
     sent only what it takes, since an argument a tool does not take is refused before the address is read. */
  const own: Record<string, Record<string, unknown>> = { history: {}, update: { patch: {} }, log: { note: 'x' } };
  for (const [name, rest] of Object.entries(own)) {
    const bare = refusal(await mcp.call(name, { spoken: 'obligations', ...rest }, owner));
    assert.match(bare.fix, /tasks#41/u, name);
    /* AND THE CORRECTED CALL: a list's id said with no number is a list to read. */
    assert.equal((bare as { try?: string }).try, 'list {"register":"obligations"}', name);
    const missing = refusal(await mcp.call(name, { spoken: 'S42', ...rest }, owner));
    assert.equal(missing.code, 'ROW_UNKNOWN', name);
    assert.match(missing.fix, /no S42 that you can read/, name);
  }
  /* A ROW THAT IS NOT THERE BY ITS NUMBER IS REFUSED BY history AS BY get, and pointed at its list, or at the list it
     most likely meant when it names one nobody has. */
  for (const name of ['get', 'history']) {
    const gone = refusal(await mcp.call(name, { spoken: 'obligations#99' }, owner));
    assert.equal(gone.code, 'ROW_UNKNOWN', name);
    assert.equal((gone as { try?: string }).try, 'list {"register":"obligations"}', name);
    const typo = refusal(await mcp.call(name, { spoken: 'obligation#99' }, owner));
    assert.equal(typo.code, 'ROW_UNKNOWN', name);
    assert.equal((typo as { try?: string }).try, `${name} {"spoken":"obligations#99"}`, name);
  }
  /* AN ARGUMENT A TOOL DOES NOT TAKE IS REFUSED, never dropped: `fields` on update changed nothing and answered "Changed". */
  const stray = refusal(await mcp.call('update', { spoken: 'obligations#1', fields: { what: 'x' } }, owner));
  assert.equal(stray.code, 'FIELD_UNKNOWN');
  assert.equal((stray as { at?: string }).at, 'fields');
  assert.equal((stray as { try?: string }).try, 'update {"spoken":"obligations#1","patch":{"what":"x"}}');
  /* A CAPITAL IN THE LIST, OR A PREFIX IN LOWER CASE, IS THE CALL WITH IT PUT RIGHT. */
  assert.equal((refusal(await mcp.call('get', { spoken: 'Obligations#41' }, owner)) as { try?: string }).try, 'get {"spoken":"obligations#41"}');
  assert.equal((refusal(await mcp.call('get', { spoken: 's42' }, owner)) as { try?: string }).try, 'get {"spoken":"S42"}');
  sql.close();
});

test('A ROW IS COMPACT: its spoken id, version, state and fields, and never the columns no tool takes back', async () => {
  const { mcp, sql } = await agent();
  const made = value<Record<string, unknown>>(await mcp.call('create', { register: 'obligations', fields: { what: 'a', state: 'open' } }, owner));
  assert.deepEqual(Object.keys(made).sort(), ['fields', 'spoken', 'state', 'updated_at', 'version']);
  const page = value<{ rows: Record<string, unknown>[]; matched: number }>(await mcp.call('list', { register: 'obligations' }, owner));
  assert.equal(page.rows[0]?.spoken, 'obligations#1');
  assert.equal(page.rows[0]?.id, undefined);
  assert.equal(page.matched, 1);

  /* AND A CONFLICT'S ROW IS THE SAME SHAPE, so the retry reads it the way it read the first copy. */
  value(await mcp.call('update', { spoken: 'obligations#1', patch: { what: 'b' } }, owner));
  const stale = await mcp.call('update', { spoken: 'obligations#1', patch: { what: 'c' }, version: 1 }, owner);
  assert.ok(conflicted(stale));
  assert.equal((stale.conflict.current as { spoken: string }).spoken, 'obligations#1');
  sql.close();
});

test('A REF IS FOLLOWED: get takes the row id a ref field holds', async () => {
  const { mcp, api, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'a' } }, owner));
  const id = (api.kernel.get('obligations#1') as { id: string }).id;
  assert.equal(value<{ spoken: string }>(await mcp.call('get', { spoken: id }, owner)).spoken, 'obligations#1');
  sql.close();
});

test('A PREFIXED ID IS WRITTEN TO, as context names it: update, log and history take S1', async () => {
  const { mcp, api, sql } = await agent();
  const token: CallContext = { principal: { kind: 'token', id: 't', scope: 'write', person: 'p_1', level: 'owner' }, session: { client_id: 'c-1' } };
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, token));
  const run = value<{ version: number }>(await mcp.call('get', { spoken: 'S1' }, owner));
  value(await mcp.call('log', { spoken: 'S1', note: 'Looked at from the app.' }, owner));
  assert.ok(value<{ rows: unknown[] }>(await mcp.call('history', { spoken: 'S1' }, owner)).rows.length >= 2);
  const moved = await mcp.call('update', { spoken: 'S1', patch: { doing: 'Checking the gates' }, version: run.version + 1 }, token);
  /* Answered as context names it, and the other spelling is still taken. */
  const said = value<{ spoken: string; version: number }>(moved);
  assert.equal(said.spoken, 'S1');
  assert.equal(value<{ spoken: string }>(await mcp.call('get', { spoken: 'session#1' }, owner)).spoken, 'S1');
  assert.equal(value<{ rows: { spoken: string }[] }>(await mcp.call('list', { register: 'session' }, owner)).rows[0]?.spoken, 'S1');
  sql.close();
});

test('record_index IS THE REGISTERS AND THE VERSION, not the whole first screen', async () => {
  const { mcp, sql } = await agent();
  const index = value<Record<string, unknown>>(await mcp.call('record_index', {}, owner));
  for (const key of ['sessions', 'waiting', 'pages', 'whatsNew', 'me']) assert.equal(index[key], undefined, key);
  sql.close();
});

test('GOVERNANCE LISTS EACH QUESTION WITHOUT ITS BODY, and one by id is whole', async () => {
  const { mcp, sql } = await agent();
  const asked = value<{ id: string }>(
    await mcp.call(
      'propose',
      { question: 'File this?', body_kind: 'options', body: { options: [{ id: 'a', label: 'Yes', because: 'one' }, { id: 'b', label: 'No', because: 'two' }] } },
      owner,
    ),
  );
  /* IN THE ONE ENVELOPE, with how many wait in all: it answered a bare array with no total and no way on. */
  const listed = value<{ rows: Record<string, unknown>[]; matched: number; cursor?: string }>(await mcp.call('governance', {}, owner));
  assert.equal(listed.rows[0]?.question, 'File this?');
  assert.equal(listed.rows[0]?.body, undefined);
  assert.ok(!Object.values(listed.rows[0] ?? {}).includes(null), 'an empty field cost tokens');
  assert.equal(listed.matched, 1);
  assert.equal(listed.cursor, undefined, 'the last page offered a way on');
  assert.ok(value<{ body: unknown }>(await mcp.call('governance', { id: asked.id }, owner)).body);
  /* AND ONE THAT IS NOT THERE IS REFUSED, `ROW_UNKNOWN`, never the bare `null` the record answers for it. */
  assert.equal(refusal(await mcp.call('governance', { id: 'SG999' }, owner)).code, 'ROW_UNKNOWN');
  sql.close();
});

test('GOVERNANCE PAGES ON A CURSOR, the id of the last question shown, until a page carries none', async () => {
  const { mcp, sql } = await agent();
  const options = { options: [{ id: 'a', label: 'Yes', because: 'one' }, { id: 'b', label: 'No', because: 'two' }] };
  for (let i = 1; i <= 5; i += 1) value(await mcp.call('propose', { question: `Question ${String(i)}?`, body_kind: 'options', body: options }, owner));
  const first = value<{ rows: { id: string }[]; matched: number; cursor?: string }>(await mcp.call('governance', { limit: 3 }, owner));
  assert.equal(first.rows.length, 3);
  assert.equal(first.matched, 5);
  assert.equal(first.cursor, first.rows.at(-1)?.id);
  const second = value<{ rows: { id: string }[]; cursor?: string }>(await mcp.call('governance', { limit: 3, cursor: first.cursor }, owner));
  assert.equal(second.rows.length, 2);
  assert.equal(second.cursor, undefined);
  assert.equal(new Set([...first.rows, ...second.rows].map((r) => r.id)).size, 5, 'a question was answered twice, or not at all');
  sql.close();
});

test('A CHANGE TAKES ITS declaration_id FROM to, so an agent can propose a page and its place in the nav', async () => {
  const { mcp, api, sql } = await agent();
  const proposer: CallContext = { principal: { kind: 'token', id: 't', scope: 'propose', person: 'p_1', level: 'owner' } };
  const page = { page: 'studies', title: 'Studies', nav: { section: 'Studies', order: 10 }, requires: ['register.obligations'], blocks: [{ kind: 'table', heading: 'Open', source: 'register.obligations', columns: [{ field: 'what', label: 'What' }] }] };
  const asked = value<{ id: string }>(
    await mcp.call('propose', { question: 'Add a Studies page?', body_kind: 'change', body: { to: { id: 'page.studies', kind: 'page', body: page } } }, proposer),
  ).id;
  assert.equal(value<{ body: { declaration_id: string } }>(await mcp.call('governance', { id: asked }, owner)).body.declaration_id, 'page.studies');
  value(await api.decide({ id: asked, decide: { option: 'accept', reason: 'Yes.' } }, owner));
  assert.ok(value<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'studies'));
  sql.close();
});

test('A ROWSET NAMES ITS REGISTER FROM at, AND A NEW SKILL BODY RAISES rev, so sync takes it', async () => {
  const { surface, calls } = stub({
    get: async () => ({ ok: true, value: { id: 'x', register: 'skills', seq: 3, version: 2, fields: { rev: 4 } } }),
  });
  const ctx: Ctx = { who: 'agent' };
  value(
    await tools(surface).call(
      'propose',
      { question: 'Take it?', body_kind: 'rowset', body: { rows: [{ at: 'skills#3', version: 2, patch: { body: 'New text' } }] } },
      ctx,
    ),
  );
  const sent = calls.find((c) => c.method === 'propose')?.args as { body: { register: string; rows: { patch: { rev: number } }[] } };
  assert.equal(sent.body.register, 'skills');
  assert.equal(sent.body.rows[0]?.patch.rev, 5);
});

test('a stale write comes back as a conflict, with the row and the actor an agent needs to retry', async () => {
  /* AN AGENT IS THE CALLER THAT MOST NEEDS THE BODY. It cannot look at the screen, so "this moved"
     with no row attached leaves it dropping the write or retrying blind. */
  const { mcp, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'a' } }, owner));
  value(await mcp.call('update', { spoken: 'obligations#1', patch: { what: 'b' } }, owner));
  const stale = await mcp.call('update', { spoken: 'obligations#1', patch: { what: 'c' }, version: 1 }, owner);
  assert.ok(conflicted(stale));
  assert.equal(codeOf(stale), 'VERSION_STALE');
  assert.equal((stale.conflict.current as { fields: { what: string } }).fields.what, 'b');
  assert.ok(stale.conflict.actor.length > 0, 'a conflict that will not say who changed it is a dead end');
  sql.close();
});

test('an empty note is refused rather than written, because a note is for the next reader', async () => {
  const { mcp, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'a' } }, owner));
  assert.equal(refusal(await mcp.call('log', { spoken: 'obligations#1', note: '   ' }, owner)).code, 'REQUIRED_MISSING');
  sql.close();
});

test('WHAT A HOST DOES NOT ANSWER YET IS A REFUSAL THAT SAYS WHAT TO DO, never a throw', async () => {
  /* A host older than build step 16 has no `meet`. An agent that calls it there is told to carry on
     another way, in the record's own word for it, so it does not spend turns retrying. */
  const { meet: _meet, ...older } = stub().surface;
  const said = refusal(await tools(older).call('meet', { where: 'commit 4464966' }, { who: 'agent' }));
  assert.equal(said.code, 'NOT_IN_THIS_BUILD');
  assert.match(said.fix, /create/);
});

/** Projects, and people with the fields the agents pack gives them, which are the fields `meet` writes. */
const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};
const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

test('MEET ANSWERS THROUGH THE RECORD: refused where People is switched off, then added, then matched', async () => {
  const { mcp, api, sql } = await agent();
  const token: CallContext = {
    principal: { kind: 'token', id: 't', scope: 'propose', person: 'p_1', level: 'owner' },
    session: { client_id: 'c-1', host: 'work-pc', repo: 'braindog' },
  };
  const rows = () => sql.all('SELECT 1 FROM entry').length;

  const off = refusal(await mcp.call('meet', { name: 'Ada Lovelace', email: 'ada@example.com', where: 'commit 4464966 in braindog' }, token));
  assert.equal(off.code, 'REGISTER_UNKNOWN');
  assert.equal(rows(), 0, 'a refused meet wrote something, a run perhaps');

  assert.ok((await api.kernel.install([THINGS, PEOPLE])).ok);
  const added = value<{ person: string; created: boolean }>(
    await mcp.call('meet', { name: 'Ada Lovelace', email: 'ada@example.com', where: 'commit 4464966 in braindog' }, token),
  );
  assert.deepEqual([added.person, added.created], ['people#1', true]);

  const again = value<{ person: string; created: boolean }>(
    await mcp.call('meet', { handle: 'github:ada', email: 'ADA@example.com', where: 'commit 5a7b1c2 in braindog' }, token),
  );
  assert.deepEqual([again.person, again.created], ['people#1', false]);
  sql.close();
});

test('CONTEXT AND HANDOFF ANSWER THROUGH THE RECORD, and context names the run that asked', async () => {
  const { mcp, sql } = await agent();
  const token: CallContext = {
    principal: { kind: 'token', id: 't', scope: 'write', person: 'p_1', level: 'owner' },
    session: { client_id: 'c-1', host: 'work-pc', repo: 'braindog' },
  };
  const handed = value<{ fields: { next: string } }>(await mcp.call('handoff', { next: 'Run the gates.', doing: 'Step 8' }, token));
  assert.equal(handed.fields.next, 'Run the gates.');

  const here = value<{ session: { spoken: string } | null; registers: unknown[]; next: string }>(await mcp.call('context', {}, token));
  assert.equal(here.session?.spoken, 'S1');
  assert.ok(Array.isArray(here.registers));
  assert.match(here.next, /handoff/);
  sql.close();
});

test('and the five tools that left answer as any unknown name does', async () => {
  const { mcp, sql } = await agent();
  for (const name of ['pages', 'page', 'metric', 'credentials', 'dry_run', 'listGrants', 'openGrant']) {
    const said = refusal(await mcp.call(name, { slug: 'money', metric: 'owed' }, owner));
    assert.equal(said.code, 'ROUTE_UNKNOWN', name);
    assert.ok(said.allowed?.includes('context'), `the refusal for ${name} does not say what there is instead`);
  }
  sql.close();
});

/* ── the permission is the record's, not the tool layer's ────────────────── */

test('a read token reads through every tool and writes through none', async () => {
  // The tool layer holds no checks of its own: a second set would be a second set to keep in step,
  // and the one that drifted would be the one an agent reads.
  const { mcp, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'a' } }, owner));

  value(await mcp.call('record_index', {}, reader));
  value(await mcp.call('list', { register: 'obligations' }, reader));
  value(await mcp.call('get', { spoken: 'obligations#1' }, reader));

  for (const [name, args] of [
    ['create', { register: 'obligations', fields: { what: 'b' } }],
    ['update', { spoken: 'obligations#1', patch: { what: 'b' } }],
    ['log', { spoken: 'obligations#1', note: 'x' }],
  ] as const) {
    const said = refusal(await mcp.call(name, args, reader));
    assert.equal(said.code, 'FORBIDDEN', name);
    assert.match(said.fix, /Ask the owner for a token with a wider scope\./, name);
  }
  sql.close();
});

/* ── search ──────────────────────────────────────────────────────────────── */

test('search finds a row by any of its searchable fields, and the words are prefixes', async () => {
  const { sql, api, mcp } = await agent();
  await api.kernel.install([
    {
      id: 'register.people',
      kind: 'register',
      body: { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true, search: true }] } as never,
    },
  ]);
  value(await mcp.call('create', { register: 'people', fields: { name: 'Halden Studio' } }, owner));

  const found = value<{ rows: { spoken: string; title: string; register: string }[]; matched: number }>(await mcp.call('search', { q: 'hal' }, owner));
  assert.equal(found.rows.length, 1);
  assert.equal(found.rows[0]?.spoken, 'people#1');
  assert.equal(found.rows[0]?.title, 'Halden Studio', 'a hit that does not say what it is makes the agent fetch it to find out');
  /* AND WHICH LIST IT IS IN: "braindog" matched a run, a tool, a project and a skill on the owner's record, alike. */
  assert.equal(found.rows[0]?.register, 'people');
  assert.equal(found.matched, 1, 'a search that handed over every row it matched still has to say how many that was');
  sql.close();
});

test('and a query of punctuation finds nothing rather than erroring', async () => {
  const { sql, mcp } = await agent();
  /* WHITESPACE IS NOTHING TO LOOK FOR, which is not "nothing found": refused, with the call that says what there is. */
  const blank = refusal(await mcp.call('search', { q: '   ' }, owner));
  assert.equal(blank.code, 'REQUIRED_MISSING');
  assert.equal((blank as { at?: string }).at, 'q');
  for (const q of ['"', '-', 'NEAR(a b)']) {
    const answer = value<{ rows: unknown[]; matched: number }>(await mcp.call('search', { q }, owner));
    assert.ok(Array.isArray(answer.rows), `${q} threw`);
    assert.equal(answer.rows.length, 0, `${q} found something`);
    assert.equal(answer.matched, 0, `${q} said rows matched that it did not hand over`);
  }
  sql.close();
});

/* ── the resources, which are not tools and that is the point ─────── */

test('A PAGE IS A RESOURCE, and every resource listed reads', async () => {
  /* ADR-018: a screen needing an endpoint no agent can call is a design error. A page is a read
     surface with a stable address and cacheable content, which is what a resource is, and the tool
     list is in every turn. */
  const { mcp, sql } = await agent();

  const list = await mcp.resources(owner);
  const uris = list.map((r) => r.uri);
  for (const uri of ['braindog:whoami', 'braindog:boot', 'braindog:digest/today', 'braindog:decisions', 'braindog:schema/obligations'])
    assert.ok(uris.includes(uri), `${uri} is not listed`);

  assert.equal(list.find((r) => r.uri === 'braindog:whoami')?.ttlMs, 0);
  assert.equal(list.find((r) => r.uri === 'braindog:schema/obligations')?.ttlMs, 3_600_000);

  for (const r of list) assert.ok((await mcp.read(r.uri, owner)).ok, `${r.uri} is listed and does not read`);

  assert.equal(refusal(await mcp.read('braindog:page/nonsense', owner)).code, 'PAGE_UNKNOWN');
  assert.equal(refusal(await mcp.read('braindog:metric/nonesuch', owner)).code, 'METRIC_UNKNOWN');
  sql.close();
});

test('WHAT A SURFACE CANNOT ANSWER IS NOT LISTED, and the record answers context and sessions/live', async () => {
  /* Offering an address the surface has no method for would send an agent to a certain refusal. The
     record answers both since step 8, and the sessions one carries the sentence the start hook prints. */
  const { mcp, sql } = await agent();
  const today = (await mcp.resources(owner)).map((r) => r.uri);
  assert.equal(today.includes('braindog:context'), true, 'the record answers context since step 8');
  assert.equal(today.includes('braindog:sessions/live'), true, 'the record answers sessionsLive since step 6');
  sql.close();

  const { context: _context, ...older } = stub().surface;
  assert.equal((await tools(older).resources({ who: 'agent' })).some((r) => r.uri === 'braindog:context'), false);

  const later = await tools(stub().surface).resources({ who: 'agent' });
  assert.ok(later.some((r) => r.uri === 'braindog:context'));
  const live = later.find((r) => r.uri === 'braindog:sessions/live');
  assert.match(live?.description ?? '', /Two sessions in one working tree overwrite each other\. Coordinate or stop\./);
  assert.equal(live?.ttlMs, 0);
});

test('and a uri is parsed rather than resolved, because a stranger writes one', async () => {
  const { mcp, sql } = await agent();
  for (const uri of ['braindog:schema/../../x', 'braindog:nothing', 'schema/obligations', 'braindog:', 'braindog:page', 'braindog:skill/../x', 'braindog:sessions'])
    assert.equal(refusal(await mcp.read(uri, owner)).code, 'ROUTE_UNKNOWN', `${uri} resolved to something`);
  sql.close();
});

test('and a caller sees the registers they may touch and not the ones they may not', async () => {
  /* THE SECOND REGISTER IS INSTALLED FIRST, BECAUSE WITH ONE THIS TEST COULD NOT FAIL. And its
     premise is asserted: without the ceiling the second register IS listed, so the absence below is
     the ceiling's doing and not the fixture's. */
  const { mcp, api, sql } = await agent();
  assert.ok((await api.kernel.install([NOTES])).ok);
  assert.ok((await mcp.resources(owner)).some((r) => r.uri === 'braindog:schema/notes'), 'the fixture has no second register to withhold');

  const scoped = await mcp.resources({ ...owner, registers: ['obligations'] });
  assert.ok(scoped.some((r) => r.uri === 'braindog:schema/obligations'));
  assert.equal(scoped.some((r) => r.uri === 'braindog:schema/notes'), false, 'a register outside the ceiling is named in the list');
  sql.close();
});

const OVERDUE = {
  id: 'metric.overdue',
  kind: 'metric' as const,
  body: {
    metric: 'overdue',
    name: 'Overdue',
    source: 'register.obligations',
    where: 'state is open',
    value: { count: 'id' },
    target: { lte: 5 },
    window: '30d',
    compare: 'none',
    format: 'int',
  } as never,
};

const MONEY = {
  id: 'page.money',
  kind: 'page' as const,
  /* `kind:`, not `as:`, which is the digest's word for the same idea (`09 §6`) and was written here
     by mistake. The block named no kind at all, so the page drew a hole: `readBlock` matched none of
     its arms and came back empty, and nothing refused it because `declare.ts` treated `kind` as
     optional. It is required now, and this fixture is what the requirement first caught. */
  body: { page: 'money', title: 'Money', blocks: [{ kind: 'stat', cells: [{ metric: 'overdue', label: 'Overdue' }] }] } as never,
};

test('AND A METRIC RESOURCE READS A METRIC', async () => {
  const { mcp, api, sql } = await agent();
  assert.ok((await api.kernel.install([OVERDUE, MONEY])).ok);
  const uri = (await mcp.resources(owner)).find((r) => r.uri.startsWith('braindog:metric/'))?.uri;
  assert.ok(uri, 'no metric is listed, and a page names figures an agent cannot read');
  assert.ok(value<{ value: unknown }>(await mcp.read(uri, owner)));
  sql.close();
});

/* A page whose title is a sentence about a register, over a register the caller is not the reader
   of. `for:` makes the record list it at all: a template names the register it walks, that one is
   readable, and the only block on the page draws from another one that is not. */
const NOTEBOOK = {
  id: 'page.notebook',
  kind: 'page' as const,
  body: {
    page: 'notebook',
    title: 'Notes, monthly',
    for: { register: 'obligations' },
    blocks: [{ kind: 'table', source: 'register.notes', columns: [{ field: 'what' }] }],
  } as never,
};

test('AND A PAGE IS WITHHELD FOR THE LEVEL HELD ON A REGISTER, not only for the ceiling', async () => {
  /* A caller whose CEILING excludes the register is refused `FORBIDDEN`; a caller invited to FILE
     into it is refused `LEVEL_REQUIRED` by the same check about the same fact. Neither may read a row
     of it, so neither is told what it is called. */
  const { mcp, api, sql } = await agent();
  assert.ok((await api.kernel.install([NOTES, NOTEBOOK])).ok);
  assert.ok((await api.create({ register: 'obligations', fields: { what: 'Coffee' } }, owner)).ok);

  const ceiling: CallContext = { ...owner, registers: ['obligations'] };
  const level: CallContext = { ...owner, levels: { obligations: 'read', notes: 'append' } };
  const codes = async (ctx: CallContext) =>
    value<{ blocks: { refusals: { code: string }[] }[] }>(await api.page({ slug: 'coffee' }, ctx)).blocks.flatMap((b) => b.refusals.map((r) => r.code));

  /* THE FIXTURE'S OWN PREMISE, ASSERTED: both callers are refused every block, in different words. */
  assert.deepEqual(await codes(ceiling), ['FORBIDDEN'], 'the ceiling caller is no longer refused the block');
  const held = await codes(level);
  assert.equal(held.length, 1, 'the append caller is no longer refused the block');
  assert.notEqual(held[0], 'FORBIDDEN', 'the two callers are refused in the same word, so this proves nothing');

  for (const [who, ctx] of [['ceiling', ceiling], ['append level', level]] as const) {
    const listed = await mcp.resources(ctx);
    assert.equal(listed.some((r) => r.uri === 'braindog:page/coffee'), false, `the ${who} caller is offered a page they see nothing of`);
    assert.equal(listed.some((r) => r.description.includes('Notes, monthly')), false, `the ${who} caller is told what a register they cannot read is called`);
    for (const r of listed) assert.ok((await mcp.read(r.uri, ctx)).ok, `the ${who} caller is offered ${r.uri}, which refuses them`);
  }
  sql.close();
});

/* A page an agent may read, carrying a figure the record will not admit exists. */
const GHOSTLY = {
  id: 'page.ghostly',
  kind: 'page' as const,
  body: {
    page: 'ghostly',
    title: 'Obligations, and a figure nobody declared',
    blocks: [
      { kind: 'table', source: 'register.obligations', columns: [{ field: 'what' }] },
      { kind: 'stat', cells: [{ metric: 'owed', label: 'Owed' }] },
    ],
  } as never,
};

test('AND NO METRIC IS ADVERTISED THAT THE RECORD SAYS DOES NOT EXIST', async () => {
  const { mcp, api, sql } = await agent();
  assert.ok((await api.kernel.install([GHOSTLY])).ok);

  assert.equal(refusal(await mcp.read('braindog:metric/owed', owner)).code, 'METRIC_UNKNOWN');

  const listed = await mcp.resources(owner);
  assert.ok(listed.some((r) => r.uri === 'braindog:page/ghostly'), 'the page itself is readable and belongs in the list');
  assert.equal(listed.some((r) => r.uri === 'braindog:metric/owed'), false, 'a figure the record denies is advertised');
  for (const r of listed) assert.ok((await mcp.read(r.uri, owner)).ok, `${r.uri} is advertised and refuses`);
  sql.close();
});

const SKILLS = {
  id: 'register.skills',
  kind: 'register' as const,
  body: {
    id: 'skills',
    name: 'Skills',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'trigger', type: 'text' },
      { id: 'body', type: 'text' },
      { id: 'state', type: 'enum', values: ['active', 'retired'] },
    ],
  } as never,
};

test('A SKILL IS READ BY ITS NAME, and listed with when to use it', async () => {
  const { mcp, api, sql } = await agent();
  assert.equal(refusal(await mcp.read('braindog:skill/review-pr', owner)).code, 'REGISTER_UNKNOWN');

  assert.ok((await api.kernel.install([SKILLS])).ok);
  for (const [name, state] of [['review-pr', 'active'], ['old-deploy', 'retired']] as const)
    value(await mcp.call('create', { register: 'skills', fields: { name, trigger: 'Before merging a branch.', body: 'Read the diff.', state } }, owner));

  const listed = await mcp.resources(owner);
  const skill = listed.find((r) => r.uri === 'braindog:skill/review-pr');
  assert.equal(skill?.description, 'When to use it: Before merging a branch.');
  assert.equal(listed.some((r) => r.uri === 'braindog:skill/old-deploy'), false, 'a retired skill is offered');

  assert.equal(value<{ fields: { body: string } }>(await mcp.read('braindog:skill/review-pr', owner)).fields.body, 'Read the diff.');
  assert.equal(refusal(await mcp.read('braindog:skill/nonesuch', owner)).code, 'ROUTE_UNKNOWN');
  sql.close();
});

test('AND A NAME OFF `Object.prototype` IS NOT A TOOL, it is a refusal', async () => {
  const { mcp, sql } = await agent();
  for (const name of [
    'constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty', 'isPrototypeOf',
    'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__lookupGetter__',
  ]) {
    const said = refusal(await mcp.call(name, { register: 'obligations' }, owner));
    assert.equal(said.code, 'ROUTE_UNKNOWN', `${name} was answered rather than refused`);
    assert.ok(said.fix.includes(name), `the refusal for ${name} does not say what was asked for`);
    assert.ok(said.allowed?.includes('list'), `the refusal for ${name} does not say what there is instead`);
  }
  assert.ok((await mcp.call('record_index', {}, owner)).ok);
  sql.close();
});

/* ── what the record would link: a resource, once the seventeenth tool ── */

test('UNDERSTAND IS A RESOURCE THAT READS THE PLAN IN NAMES, held a minute, and passes on nothing that acts', async () => {
  const slice = {
    dry: true,
    kinds: [{ kind: 'payments', looked: 40, linked: 3, refused: 0, organisations: 1 }],
    writes: ['Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios'],
    more: 0,
    questions: ['Which project is Fly for?'],
    asks: { 'service-project': 1 },
    done: true,
    undo: ['01M345FTM0D4F495AW6K6NDA06'],
    filed: [{ id: 'SG4', question: 'Which project is Fly for?' }],
  };
  const { surface, calls } = stub({ understandPlan: async () => ({ ok: true, value: slice }) });
  const mcp = tools(surface);
  assert.equal(TOOLS.some((t) => t.name === 'understand'), false, 'understand is still a tool');
  const listed = (await mcp.resources({ who: 'agent' })).find((r) => r.uri === 'braindog:understand');
  assert.ok(listed, 'braindog:understand is not listed');
  assert.match(listed.description, /\bmeet\b/u);
  assert.equal(listed.ttlMs, 60_000);

  const read = await mcp.read('braindog:understand', { who: 'agent' });
  assert.ok(read.ok);
  const v = read.value as Record<string, unknown>;
  assert.equal(v.undo, undefined, 'an undo is a handle no tool takes');
  assert.equal(v.filed, undefined, 'a dry slice files nothing');
  assert.deepEqual(v.writes, slice.writes);
  assert.match(String(v.said), /Would ask the owner: Which project is Fly for\?/u);
  assert.doesNotMatch(String(v.said), /—|\brows?\b/u);
  assert.ok(!calls.some((c) => ['meet', 'create', 'update', 'propose'].includes(c.method)), 'it wrote');

  /* A SESSION OPENED BEFORE STILL CALLS THE TOOL, and is told where it is read now. */
  const old = refusal(await mcp.call('understand', {}, { who: 'agent' }));
  assert.equal(old.code, 'ROUTE_UNKNOWN');
  assert.match(old.fix, /braindog:understand/u);

  /* AND A SURFACE WITHOUT IT LISTS NO ADDRESS THAT WOULD REFUSE. */
  const before = stub().surface;
  delete before.understandPlan;
  assert.ok(!(await tools(before).resources({ who: 'agent' })).some((r) => r.uri === 'braindog:understand'));
});
