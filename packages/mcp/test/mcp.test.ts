/**
 * The eight tools, from an agent's side of the wire.
 *
 * Two things are being asserted, and the second is the unusual one. The first is that each tool does
 * what it says. The second is that its REFUSALS TEACH: the caller is a model that will try again
 * immediately, so the difference between a good refusal and a bad one is whether the second attempt
 * works. Every test below that expects a refusal also checks the sentence names what to send.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TOOLS, tools } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

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

test('THE COUNT IS THE DESIGN, and it is the document’s list minus what is not built', () => {
  /* The tool list is in every turn of every session, so one more tool costs every conversation for
     ever. `10-MCP` §5 names eight, and all eight are here now that the decision gate is built —
     `propose` earns its place the moment there is something on the other end of it. `schema` and
     `history` are present because that document serves them as resources and this build serves
     none, and `decide` is ABSENT because no token reaches that rung: a tool that could only ever
     refuse is a tool an agent spends its turns discovering.

     The four added since are the record's own reading of itself — `pages`, `page`, `metric` and
     `credentials` — and each earns its place by being a question an agent asks that `list` cannot
     answer: what does this record draw, what does this figure say, what would break if this machine
     were lost, and — the one an agent needs most — what would this rule do if I turned it on. */
  const named = TOOLS.map((t) => t.name);
  for (const wanted of ['record_index', 'search', 'get', 'list', 'create', 'update', 'log'])
    assert.ok(named.includes(wanted), `${wanted} is in 10-MCP §5 and not here`);
  assert.ok(named.includes('propose'), 'the one verb an agent has when it is not sure');
  assert.ok(!named.includes('decide'), 'a tool that refuses everything is worse than an absent one');

  /* AND NO TOOL READS A CREDENTIAL. The vault needs a person in a browser and an agent holding a
     token is neither; `credentials` is the INDEX, which is what makes "check nothing expires next
     week" a thing an agent can do without anything being readable that should not be. */
  for (const forbidden of ['openGrant', 'open_grant', 'credential', 'secret'])
    assert.ok(!named.includes(forbidden), `${forbidden} would read a credential`);

  assert.equal(TOOLS.length, 16);
  assert.equal(new Set(named).size, TOOLS.length, 'two tools share a name');
  for (const t of TOOLS) {
    assert.ok(t.description.length > 30, `${t.name} has a description nobody can choose from`);
    assert.ok(t.description.length < 200, `${t.name} is long, and it is in every turn`);
  }
});

test('the whole tool list is small enough to sit in every turn', () => {
  // `10-MCP` §6 budgets 1,800 tokens for the list plus instructions. Four characters to a token is
  // the rough conversion, so the JSON is the thing to keep under about 7,000 characters.
  const size = JSON.stringify(TOOLS).length;
  assert.ok(size < 7000, `the tool list is ${size} characters, which is most of the budget`);
});

test('a tool says whether it writes, so a client can tell its user before it runs', () => {
  assert.deepEqual(
    TOOLS.filter((t) => t.writes).map((t) => t.name),
    ['propose', 'create', 'update', 'log'],
  );
});

/* ── they do what they say ───────────────────────────────────────────────── */

test('record_index is the first call, and it says what to call next', async () => {
  const { mcp, sql } = await agent();
  const index = value<{ registers: { id: string; count: number }[]; version: number }>(
    await mcp.call('record_index', {}, owner),
  );
  assert.deepEqual(index.registers.map((r) => r.id), ['obligations']);
  assert.equal(index.registers[0]?.count, 0);
  assert.equal(typeof index.version, 'number');
  sql.close();
});

test('a row is addressed the way a person says it, and made and read and changed', async () => {
  const { mcp, sql } = await agent();
  const made = value<{ seq: number; version: number }>(
    await mcp.call('create', { register: 'obligations', fields: { what: 'Invoice 41', state: 'open' }, note: 'From the PDF' }, owner),
  );
  assert.equal(made.seq, 1);

  const read = value<{ fields: Record<string, unknown> }>(await mcp.call('get', { spoken: 'obligations#1' }, owner));
  assert.equal(read.fields.what, 'Invoice 41');

  value(await mcp.call('update', { spoken: 'obligations#1', patch: { state: 'paid' }, version: made.version }, owner));
  assert.equal(value<{ state: string }>(await mcp.call('get', { spoken: 'obligations#1' }, owner)).state, 'paid');

  const events = value<{ kind: string; note: string | null }[]>(await mcp.call('history', { spoken: 'obligations#1' }, owner));
  assert.deepEqual(events.map((e) => e.kind), ['create', 'state']);
  assert.equal(events[0]?.note, 'From the PDF');
  sql.close();
});

test('list takes a predicate, which is why there are not fourteen filter tools', async () => {
  const { mcp, sql } = await agent();
  for (const [what, state] of [['a', 'open'], ['b', 'paid'], ['c', 'open']] as const)
    value(await mcp.call('create', { register: 'obligations', fields: { what, state } }, owner));

  const open = value<{ rows: unknown[]; matched: number }>(
    await mcp.call('list', { register: 'obligations', where: { field: 'state', is: 'open' } }, owner),
  );
  assert.equal(open.matched, 2);

  const both = value<{ matched: number }>(
    await mcp.call('list', { register: 'obligations', where: { any: [{ field: 'state', is: 'open' }, { field: 'what', is: 'b' }] } }, owner),
  );
  assert.equal(both.matched, 3);
  sql.close();
});

test('a note changes nothing and is still a write, so it lands in the history', async () => {
  const { mcp, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'a' } }, owner));
  const before = value<{ fields: Record<string, unknown>; version: number }>(await mcp.call('get', { spoken: 'obligations#1' }, owner));

  value(await mcp.call('log', { spoken: 'obligations#1', note: 'Chased on the call.' }, owner));
  const after = value<{ fields: Record<string, unknown> }>(await mcp.call('get', { spoken: 'obligations#1' }, owner));
  assert.deepEqual(after.fields, before.fields, 'a note changed the row');

  const events = value<{ note: string | null }[]>(await mcp.call('history', { spoken: 'obligations#1' }, owner));
  assert.equal(events.at(-1)?.note, 'Chased on the call.');
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
  for (const spoken of ['41', 'obligations', 'Obligations#41', undefined, 42])
    assert.match(refusal(await mcp.call('get', { spoken }, owner)).fix, /register#number/, String(spoken));
  sql.close();
});

test('a stale write is refused with the sentence that says what to do about it', async () => {
  const { mcp, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'a' } }, owner));
  value(await mcp.call('update', { spoken: 'obligations#1', patch: { what: 'b' } }, owner));
  const stale = refusal(await mcp.call('update', { spoken: 'obligations#1', patch: { what: 'c' }, version: 1 }, owner));
  assert.equal(stale.code, 'VERSION_STALE');
  assert.match(stale.fix, /Read it again/);
  sql.close();
});

test('an empty note is refused rather than written, because a note is for the next reader', async () => {
  const { mcp, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'a' } }, owner));
  assert.equal(refusal(await mcp.call('log', { spoken: 'obligations#1', note: '   ' }, owner)).code, 'REQUIRED_MISSING');
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
  ] as const)
    assert.equal(refusal(await mcp.call(name, args, reader)).code, 'SCOPE_INSUFFICIENT', name);
  sql.close();
});

/* ── search ──────────────────────────────────────────────────────────────── */

test('search finds a row by any of its searchable fields, and the words are prefixes', async () => {
  const { sql, api, mcp } = await agent();
  await api.kernel.install([
    {
      id: 'register.people',
      kind: 'register',
      body: {
        id: 'people',
        name: 'People',
        title: 'name',
        fields: [{ id: 'name', type: 'text', required: true, search: true }],
      } as never,
    },
  ]);
  value(await mcp.call('create', { register: 'people', fields: { name: 'Halden Studio' } }, owner));

  const hits = value<{ register: string; seq: number; title: string }[]>(await mcp.call('search', { q: 'hal' }, owner));
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.register, 'people');
  assert.equal(hits[0]?.title, 'Halden Studio', 'a hit that does not say what it is makes the agent fetch it to find out');
  sql.close();
});

test('and a query of punctuation finds nothing rather than erroring', async () => {
  // The words a person types are not FTS5 syntax. Passed through raw, a typed quote is a syntax
  // error and a typed minus is an exclusion nobody asked for.
  const { sql, mcp } = await agent();
  for (const q of ['"', '-', '   ', 'NEAR(a b)'])
    assert.ok(Array.isArray(value(await mcp.call('search', { q }, owner))), `${q} threw`);
  sql.close();
});

/* ── the four the record added ───────────────────────────────────── */

test('AN AGENT CAN ASK WHAT THE RECORD DRAWS, and read one page of it', async () => {
  const { mcp, sql } = await agent();
  const pages = await mcp.call('pages', {}, owner);
  assert.ok(pages.ok, pages.ok ? '' : pages.refusal.fix);
  assert.deepEqual(pages.value, [], 'this record declares no pages');

  const missing = await mcp.call('page', { slug: 'nonsense' }, owner);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.refusal.code, 'PAGE_UNKNOWN');

  // And a slug that is not a string is a refusal rather than a crash, like every other argument.
  const bad = await mcp.call('page', {}, owner);
  assert.equal(bad.ok, false);
  sql.close();
});

test('and what each credential OPENS, which is never the credential', async () => {
  // There is no tool that reads one and there is not going to be. What an agent can have is the
  // index, which is what makes "check nothing expires next week" possible without anything leaking.
  const { mcp, sql } = await agent();
  const out = await mcp.call('credentials', {}, owner);
  assert.ok(out.ok, out.ok ? '' : out.refusal.fix);
  assert.deepEqual(out.value, []);
  assert.ok(!JSON.stringify(out).includes('ciphertext'));
  sql.close();
});

test('a figure comes back with its target, and one that is not declared is named', async () => {
  const { mcp, sql } = await agent();
  const out = await mcp.call('metric', { metric: 'nonesuch' }, owner);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.refusal.code, 'METRIC_UNKNOWN');
  sql.close();
});

test('PREVIEW BEFORE PROPOSE, which is the tool an agent needs most', async () => {
  /* An agent writing a rule cannot look at the screen afterwards, and a rule that quietly tagged
     four hundred rows is a rule nobody can undo by hand. */
  const { mcp, sql } = await agent();
  value(await mcp.call('create', { register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } }, owner));

  const out = value<{ matches: number; won: number; sample: { would: string[] }[] }>(
    await mcp.call(
      'dry_run',
      { rule: { rule: 'late', register: 'obligations', when: 'state is open', then: [{ tag: 'chased' }] } },
      owner,
    ),
  );
  assert.equal(out.matches, 1);
  assert.equal(out.won, 1);
  assert.deepEqual(out.sample[0]?.would, ['tag chased']);

  // And it wrote nothing, which is the whole reason it can be handed to whoever is writing the rule.
  assert.equal(sql.all("SELECT 1 FROM event WHERE actor LIKE 'rule:%'").length, 0);
  assert.equal(value<{ fields: Record<string, unknown> }>(await mcp.call('get', { spoken: 'obligations#1' }, owner)).fields.tags, undefined);

  // A rule about a register nobody has is a refusal, not a preview of nothing.
  assert.ok(refusal(await mcp.call('dry_run', { rule: { rule: 'x', register: 'nothing', then: [] } }, owner)).code);
  assert.ok(refusal(await mcp.call('dry_run', {}, owner)).code);
  sql.close();
});

/* ── the resources, which are not tools and that is the point ─────── */

test('A PAGE WAS INVISIBLE TO EVERY AGENT, and that is what ADR-018 calls a design error', async () => {
  /* Its rule is that any screen needing an endpoint no agent can call is a design error — and the
     web app's page read is `page({ slug })`, which no tool reaches. The fix is a resource rather
     than a ninth tool, because a page is a read surface with a stable address and cacheable
     content, and the tool list is in every turn of every session. */
  const { mcp, sql } = await agent();

  const list = value<{ uri: string; ttlMs: number }[]>(await mcp.resources(owner));
  const uris = list.map((r) => r.uri);
  assert.ok(uris.includes('braindog:whoami'));
  assert.ok(uris.includes('braindog:boot'));
  assert.ok(uris.includes('braindog:schema/obligations'), 'a register has no schema resource');

  // `whoami` is asked every time; a register's shape changes when a pack is installed and not
  // between one.
  assert.equal(list.find((r) => r.uri === 'braindog:whoami')?.ttlMs, 0);
  assert.equal(list.find((r) => r.uri === 'braindog:schema/obligations')?.ttlMs, 3_600_000);

  // And every one of them reads.
  assert.ok(value<{ kind: string }>(await mcp.read('braindog:whoami', owner)).kind);
  assert.ok(value<{ registers: unknown[] }>(await mcp.read('braindog:boot', owner)).registers);
  assert.ok(value<{ fields: unknown[] }>(await mcp.read('braindog:schema/obligations', owner)).fields);
  assert.ok(Array.isArray(value<unknown[]>(await mcp.read('braindog:decisions', owner))));
  assert.ok(Array.isArray(value<unknown[]>(await mcp.read('braindog:digest/today', owner))));
  sql.close();
});

test('and a uri is parsed rather than resolved, because a stranger writes one', async () => {
  const { mcp, sql } = await agent();
  for (const uri of ['braindog:schema/../../x', 'braindog:nothing', 'schema/obligations', 'braindog:', 'braindog:page'])
    assert.equal(refusal(await mcp.read(uri, owner)).code, 'ROUTE_UNKNOWN', `${uri} resolved to something`);
  sql.close();
});

test('and a caller sees the registers they may touch and not the ones they may not', async () => {
  // A list of names is itself information, so the resource list is scoped like `boot` is.
  const { mcp, sql } = await agent();
  const scoped = value<{ uri: string }[]>(await mcp.resources({ ...owner, registers: ['obligations'] }));
  assert.ok(scoped.some((r) => r.uri === 'braindog:schema/obligations'));
  assert.equal(scoped.some((r) => r.uri.startsWith('braindog:schema/') && r.uri !== 'braindog:schema/obligations'), false);
  sql.close();
});
