/**
 * Metadata added to a live list by agents, through `propose` and an owner's accept.
 *
 * MEASURED at `a00b3d2c`: two agents each added one field to Projects from the same reading, the owner accepted both,
 * and the second install replaced the whole register with its own copy, so `domain` was erased with a value still under
 * it and every decision said "accept". The house rule is "never resend the copy you held", and the record broke it
 * itself: `decide` called `kernel.install([decl])` with no `expect`, while `setDeclaration` has always passed one. And
 * the only change an agent could file was the whole register, so adding one optional field meant copying twenty others
 * and sending them back, which is both the cost and the race.
 *
 * The first half below holds a whole-body change to the version it was drawn from. The second adds
 * `to: { add: {...} }`, merged onto whatever is live when the owner presses, so two additions never race at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const FIELDS = [
  { id: 'name', type: 'text', required: true },
  { id: 'lane', type: 'enum', values: ['building', 'earning', 'parked'], required: true },
];

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: FIELDS } as never,
};

/** The whole register with one more field, as an agent that read it at v1 would send it. */
const plus = (field: Record<string, unknown>) => ({ ...THINGS, body: { ...(THINGS.body as object), fields: [...FIELDS, field] } });

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string }; conflict?: unknown };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([THINGS])).ok);
  assert.ok(api.kernel.create('things', { name: 'Kiln', lane: 'building' }, { actor: 'p_1' }).ok);
  const file = async (body: Record<string, unknown>): Promise<Out> =>
    (await api.propose({ question: 'Add this to Projects?', body_kind: 'change', body } as never, owner)) as Out;
  const accept = async (id: string): Promise<Out> => (await api.decide({ id, decide: { option: 'accept', reason: 'it is useful' } }, owner)) as Out;
  const live = () => {
    const decl = api.kernel.declarations().find((d) => d.id === 'register.things')!;
    return { version: decl.version, fields: (JSON.parse(decl.body) as { fields: { id: string; type: string; values?: string[] }[] }).fields };
  };
  const status = (id: string) => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)!.status;
  const stored = (id: string) => JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as Record<string, unknown>;
  return { sql, api, file, accept, live, status, stored };
}

const idOf = (out: Out): string => {
  assert.ok(out.ok, JSON.stringify(out));
  return (out.value as { id: string }).id;
};

/* ── a whole-body change lands against the version it was drawn from ── */

test('THE SECOND OF TWO WHOLE-BODY CHANGES DRAWN FROM ONE READING REOPENS, and the first one survives', async () => {
  const { sql, file, accept, live, status } = await record();
  const a = idOf(await file({ declaration_id: 'register.things', to: plus({ id: 'domain', type: 'url' }) }));
  const b = idOf(await file({ declaration_id: 'register.things', to: plus({ id: 'launched', type: 'day' }) }));

  assert.ok((await accept(a)).ok);

  /* NO VALUE IS WRITTEN UNDER `domain` BEFORE THE SECOND PRESS. With one there, the install's refusal to drop a field
     that still holds data turned the second change away on its own, and this test stayed green with the `expect`
     removed from the record's accept (checked by mutation). An empty field is the case only the version can catch:
     without it, `domain` was dropped and the decision read "accept". */
  const second = await accept(b);
  assert.equal(second.ok, false, 'the second change installed over the first');
  assert.equal((second.conflict as { version?: number } | undefined)?.version, 2, JSON.stringify(second));
  assert.equal(status(b), 'open', 'the second change is not back in the queue');
  const why = sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND to_v = 'reopened'", `suggestion:${b}`)?.note ?? '';
  assert.match(why, /at version 2 now/);
  assert.ok(
    live().fields.some((f) => f.id === 'domain'),
    `domain was erased: ${live().fields.map((f) => f.id).join(', ')}`,
  );
  assert.equal(live().version, 2);
  sql.close();
});

test('A VERSION ABOVE THE LIVE ONE IS STAMPED WITH THE LIVE ONE, and one at or below it is kept', async () => {
  const { sql, file, stored } = await record();
  const id = idOf(await file({ declaration_id: 'register.things', from_version: 99, to: plus({ id: 'domain', type: 'url' }) }));
  assert.equal(stored(id).from_version, 1);
  /* A NEW DECLARATION IS DRAWN FROM NOTHING, which `install`'s `expect` spells 0. */
  const fresh = idOf(
    await file({
      declaration_id: 'register.registrars',
      to: { id: 'register.registrars', kind: 'register', body: { id: 'registrars', name: 'Registrars', title: 'name', fields: [{ id: 'name', type: 'text' }] } },
    }),
  );
  assert.equal(stored(fresh).from_version, 0);
  sql.close();
});

test('A SINGLE WHOLE-BODY CHANGE STILL INSTALLS', async () => {
  const { sql, file, accept, live, status } = await record();
  const a = idOf(await file({ declaration_id: 'register.things', to: plus({ id: 'domain', type: 'url' }) }));
  assert.ok((await accept(a)).ok);
  assert.equal(status(a), 'resolved');
  assert.deepEqual(live().fields.map((f) => f.id), ['name', 'lane', 'domain']);
  sql.close();
});

/* ── a field-level change, merged at acceptance ── */

test('TWO ADDITIONS FILED FROM ONE READING BOTH LAND, because each is merged onto what is live when accepted', async () => {
  const { sql, api, file, accept, live, status, stored } = await record();
  const a = idOf(await file({ declaration_id: 'register.things', to: { add: { register: 'things', fields: [{ id: 'domain', type: 'url' }] } } }));
  const b = idOf(
    await file({
      declaration_id: 'register.things',
      to: { add: { register: 'things', fields: [{ id: 'launched', type: 'day' }], values: { lane: ['paused'] } } },
    }),
  );
  /* STORED AS WHAT WAS ASKED, not as a whole body resolved at filing: resolving then is the race again. */
  assert.ok('add' in (stored(a).to as object));

  assert.ok((await accept(a)).ok);
  assert.ok(api.kernel.update('things', 'things#1', { domain: 'https://kiln.example/' }, { actor: 'p_1', version: 1 }).ok);
  const second = await accept(b);
  assert.ok(second.ok, JSON.stringify(second));
  assert.equal(status(b), 'resolved');

  const after = live();
  assert.deepEqual(after.fields.map((f) => f.id), ['name', 'lane', 'domain', 'launched']);
  assert.deepEqual(after.fields.find((f) => f.id === 'lane')!.values, ['building', 'earning', 'parked', 'paused']);
  assert.equal(after.version, 3);
  assert.ok(api.kernel.update('things', 'things#1', { lane: 'paused' }, { actor: 'p_1', version: 2 }).ok);
  sql.close();
});

test('AN ADDITION TAKES NOTHING AWAY AND RETYPES NOTHING', async () => {
  const { sql, file } = await record();
  const refused = async (add: Record<string, unknown>, declaration_id = 'register.things') => {
    const out = await file({ declaration_id, to: { add } });
    assert.equal(out.ok, false, `${JSON.stringify(add)} was filed`);
    assert.ok(out.refusal?.fix, JSON.stringify(out));
    return out.refusal!;
  };
  /* A FIELD THE LIST HAS ALREADY is a retype or a no-op, and neither is an addition. */
  assert.match((await refused({ register: 'things', fields: [{ id: 'lane', type: 'text' }] })).fix, /already has a field called lane/);
  assert.equal((await refused({ register: 'things', remove: ['lane'] })).code, 'FIELD_UNKNOWN');
  assert.equal((await refused({ register: 'things', values: { name: ['x'] } })).code, 'VALUE_MALFORMED');
  assert.equal((await refused({ register: 'things', values: { nope: ['x'] } })).code, 'FIELD_UNKNOWN');
  assert.equal((await refused({ register: 'things' })).code, 'REQUIRED_MISSING');
  assert.equal((await refused({ register: 'ghosts', fields: [{ id: 'x', type: 'text' }] }, 'register.ghosts')).code, 'REGISTER_UNKNOWN');
  /* AND THE NAME IT IS FILED UNDER IS THE LIST IT CHANGES, as for a whole body (`namesFault`). */
  assert.equal((await refused({ register: 'things', fields: [{ id: 'x', type: 'text' }] }, 'register.people')).code, 'VALUE_MALFORMED');
  /* A FIELD THE GRAMMAR REFUSES is refused when filed, because the merged body goes through the install's own lint. */
  await refused({ register: 'things', fields: [{ id: 'Domain-Name', type: 'text' }] });
  sql.close();
});

test('AN ADDITION THAT A RACE HAS MADE A DUPLICATE IS REFUSED AT ACCEPTANCE, and stays open', async () => {
  const { sql, file, accept, live, status } = await record();
  const a = idOf(await file({ declaration_id: 'register.things', to: { add: { register: 'things', fields: [{ id: 'domain', type: 'url' }] } } }));
  const b = idOf(await file({ declaration_id: 'register.things', to: { add: { register: 'things', fields: [{ id: 'domain', type: 'text' }] } } }));
  assert.ok((await accept(a)).ok);
  const second = await accept(b);
  assert.equal(second.ok, false);
  assert.match(second.refusal!.fix, /already has a field called domain/);
  assert.equal(status(b), 'open');
  assert.equal(live().fields.find((f) => f.id === 'domain')!.type, 'url');
  sql.close();
});

/* ── what an agent is taught ── */

test('THE MCP propose DESCRIPTION TEACHES A change THE RECORD ACCEPTS: add for metadata, and declaration_id named', async () => {
  /* BLOCKER 6, MEASURED: the one place agents read taught `change: {"to":{"id":"page.x",...}}`, and sent exactly that way
     it is refused `REQUIRED_MISSING` at `body.declaration_id`. So the examples are read out of the description itself
     and filed against a real record, rather than checked for a phrase. */
  const { TOOLS } = await import('../../mcp/src/index.ts');
  const tool = TOOLS.find((t) => t.name === 'propose') ?? assert.fail('propose is not an MCP tool');
  const said = String((tool.input as { properties: { body: { description: string } } }).properties.body.description);

  /* EVERY WHOLE-BODY EXAMPLE IS FILED UNDER THE ID IT INSTALLS, which is what `namesFault` holds a change to. */
  const whole = [...said.matchAll(/"to":\{"id":"([^"]+)"/g)].map((m) => m[1]);
  const named = [...said.matchAll(/\{"declaration_id":"([^"]+)","to":\{"id":"([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.equal(named.length, whole.length, `a change example has no declaration_id: ${said}`);
  for (const [filed, installs] of named) assert.equal(filed, installs);

  /* AND THE ADDITION IS REAL JSON THAT FILES AND LANDS. */
  const at = said.indexOf('{"declaration_id":"register.');
  assert.ok(at >= 0, `no addition is taught: ${said}`);
  let depth = 0;
  let end = at;
  for (; end < said.length; end++) {
    if (said[end] === '{') depth++;
    if (said[end] === '}' && --depth === 0) break;
  }
  /* THE WORDS SHORTEN THE FIELDS TO FIT THE TOOL'S BUDGET, so a field stands where they do. */
  const body = JSON.parse(said.slice(at, end + 1).replace('[...]', '[{"id":"note","type":"text"}]')) as { to: { add?: unknown } };
  assert.ok(body.to.add, 'the register example is not an addition');
  const { sql, file, accept, live } = await record();
  const filed = await file(body as never);
  assert.ok((await accept(idOf(filed))).ok);
  assert.ok(live().version > 1);
  sql.close();
});
