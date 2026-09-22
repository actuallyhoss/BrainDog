/**
 * Additive is automatic (DIRECTION §22, the owner's answer of September 22nd).
 *
 * "An agent adding an optional field: automatic. A purely additive, optional field lands at once and is logged in
 * history ("Claude added domain to Projects"). Removing, retyping or narrowing a field still waits for his press in
 * Decide." Measured before this file: an agent's `{ add: { fields: [{ id: 'domain' }] } }` on Projects opened SG1 and
 * nothing else, so a row could not hold `domain` until the owner opened Decide and pressed accept, for a field that
 * takes nothing away from anybody. The narrow rule is `loop/research-shell-schema.md` "For the owner": additive,
 * optional, not unique, not indexed, and a history line that names the agent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'lane', type: 'enum', values: ['building', 'earning', 'parked'], required: true },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** An agent's key at `propose`: it may put a question in front of the owner, and may not write. */
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'kiln', agent: 'claude' },
};

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([THINGS])).ok);
  assert.ok(api.kernel.create('things', { name: 'Kiln', lane: 'building' }, { actor: 'p_1' }).ok);
  const add = async (add: Record<string, unknown>, ctx: CallContext = agent): Promise<Out> =>
    (await api.propose({ question: 'Add this to Projects?', body_kind: 'change', body: { declaration_id: 'register.things', to: { add } } } as never, ctx)) as Out;
  const live = () => {
    const decl = api.kernel.declarations().find((d) => d.id === 'register.things')!;
    return { version: decl.version, fields: (JSON.parse(decl.body) as { fields: { id: string; values?: string[] }[] }).fields };
  };
  const suggestion = (id: string) => sql.one<{ status: string; opened_by: string }>('SELECT status, opened_by FROM suggestion WHERE id = ?', id)!;
  const declared = () =>
    sql.all<{ actor: string; to_v: string; note: string | null }>("SELECT actor, to_v, note FROM event WHERE kind = 'declare' AND target = 'declaration:register.things' ORDER BY rowid");
  return { sql, api, add, live, suggestion, declared };
}

const idOf = (out: Out): string => {
  assert.ok(out.ok, JSON.stringify(out));
  return String(out.value!.id);
};

test('AN AGENT ADDING AN OPTIONAL FIELD: it lands at once, a row can hold it, and history names the agent', async () => {
  const { sql, api, add, live, suggestion, declared } = await record();
  const out = await add({ fields: [{ id: 'domain', type: 'url' }] });
  const id = idOf(out);

  /* THE PROPOSER IS TOLD IT LANDED, so it writes the value next rather than waiting on a question nobody will ask. */
  assert.deepEqual(out.value!.landed, { declaration: 'register.things', version: 2 }, JSON.stringify(out));
  assert.deepEqual(live().fields.map((f) => f.id), ['name', 'lane', 'domain']);
  assert.equal(suggestion(id).status, 'resolved');

  const put = api.kernel.update('things', 'things#1', { domain: 'https://kiln.example/' }, { actor: 'p_1', version: 1 });
  assert.ok(put.ok, JSON.stringify(put));

  /* SIGNED BY WHOEVER FILED IT, and the decision by the rule, never by a person who did not press anything. */
  const line = declared().at(-1)!;
  assert.equal(line.actor, suggestion(id).opened_by);
  assert.equal(line.to_v, '2');
  assert.match(line.note ?? '', /^Added domain\./);
  const decided = sql.one<{ decided_by: string; answer: string }>('SELECT decided_by, answer FROM decision ORDER BY rowid DESC LIMIT 1')!;
  assert.deepEqual({ ...decided }, { decided_by: 'rule:additive', answer: 'accept' });
  sql.close();
});

test('AND A VALUE APPENDED TO A CLOSED LIST lands the same way', async () => {
  const { sql, api, add, live } = await record();
  idOf(await add({ values: { lane: ['paused'] } }));
  assert.deepEqual(live().fields.find((f) => f.id === 'lane')!.values, ['building', 'earning', 'parked', 'paused']);
  assert.ok(api.kernel.update('things', 'things#1', { lane: 'paused' }, { actor: 'p_1', version: 1 }).ok);
  sql.close();
});

test('A REQUIRED, UNIQUE OR INDEXED FIELD STILL WAITS FOR THE OWNER', async () => {
  for (const field of [
    { id: 'domain', type: 'url', required: true, default: 'https://example.com/' },
    { id: 'domain', type: 'url', required_when: { field: 'lane', is: 'earning' } },
    { id: 'domain', type: 'url', unique: true },
    { id: 'domain', type: 'url', index: true },
    { id: 'domain', type: 'url', search: true },
  ]) {
    const { sql, add, live, suggestion, declared } = await record();
    const out = await add({ fields: [field] });
    const id = idOf(out);
    assert.equal(suggestion(id).status, 'open', `${JSON.stringify(field)} landed without the press`);
    assert.equal(out.value!.landed, undefined);
    assert.equal(live().version, 1);
    assert.equal(declared().length, 0);
    sql.close();
  }
});

test('ONE LOOSE FIELD BESIDE ONE REQUIRED ONE: the whole addition waits', async () => {
  const { sql, add, live, suggestion } = await record();
  const id = idOf(await add({ fields: [{ id: 'domain', type: 'url' }, { id: 'owner', type: 'text', required: true, default: 'Sam' }] }));
  assert.equal(suggestion(id).status, 'open');
  assert.equal(live().version, 1);
  sql.close();
});

test('A PERSON PROPOSING IS ASKING, and her addition is a question as it always was', async () => {
  const { sql, add, live, suggestion } = await record();
  const id = idOf(await add({ fields: [{ id: 'domain', type: 'url' }] }, owner));
  assert.equal(suggestion(id).status, 'open');
  assert.equal(live().version, 1);
  sql.close();
});

test('AN AGENT KEY HELD TO OTHER LISTS may still ask, and does not add to Projects on its own', async () => {
  const { sql, add, live } = await record();
  const out = await add({ fields: [{ id: 'domain', type: 'url' }] }, { ...agent, registers: ['people'] });
  if (out.ok) assert.equal(out.value!.landed, undefined);
  assert.equal(live().version, 1);
  sql.close();
});

test('A WHOLE-BODY CHANGE FROM AN AGENT is a question, whatever it holds', async () => {
  const { sql, api, live, suggestion } = await record();
  const body = { ...(THINGS.body as object), fields: [...(THINGS.body as { fields: unknown[] }).fields, { id: 'domain', type: 'url' }] };
  const out = (await api.propose({ question: 'Add domain?', body_kind: 'change', body: { declaration_id: 'register.things', to: { ...THINGS, body } } } as never, agent)) as Out;
  assert.equal(suggestion(idOf(out)).status, 'open');
  assert.equal(live().version, 1);
  sql.close();
});

test('THE RULE CANNOT BE SENT THROUGH decide: an agent never answers a question, and a person answers with her own name', async () => {
  const { sql, api, add, suggestion } = await record();
  const id = idOf(await add({ fields: [{ id: 'domain', type: 'url', unique: true }] }));
  const forged = (await api.decide({ id, rule: 'additive' } as never, owner)) as Out;
  assert.equal(forged.ok, false);
  assert.equal(suggestion(id).status, 'open');
  sql.close();
});

test("A PACK'S OWN LIST TAKES THE FIELD BY RULE, and the pack's next version still updates over it", async () => {
  /* THE CASE THE RULE COULD HAVE BROKEN: before it, an addition to a pack's list waited for the owner and reached the
     list through the same accept. Landing it by rule must leave the list as `plan` reads an owner's edit (the pack body
     plus fields it lacks), or the first agent that adds `domain` to Projects locks portfolio at the version it is. */
  const { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument } = await import('../../seed/src/index.ts');
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  type Diff = { planHash: string; approve: unknown; conflicts: unknown[] };
  const planned = async (doc: unknown) => {
    const out = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;
    assert.ok(out.ok, JSON.stringify(out));
    return (out.value as unknown as { diff: Diff }).diff;
  };
  const installed = async (doc: unknown) => {
    const diff = await planned(doc);
    const out = (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
    assert.ok(out.ok, JSON.stringify(out));
  };
  for (const id of FIRST_PARTY) await installed(firstPartyDocument(id));

  const out = (await api.propose(
    { question: 'Add domain to Projects?', body_kind: 'change', body: { declaration_id: 'register.things', to: { add: { fields: [{ id: 'domain', type: 'url' }] } } } } as never,
    agent,
  )) as Out;
  assert.ok(out.ok && out.value!.landed, JSON.stringify(out));

  const [major, minor] = FIRST_PARTY_VERSIONS.portfolio.split('.').map(Number) as [number, number];
  const next = structuredClone(firstPartyDocument('portfolio')) as unknown as { version: string; declarations: Record<string, unknown>[] };
  next.version = `${major}.${minor + 1}.0`;
  next.declarations = next.declarations.map((d) =>
    d.register === 'things' && Array.isArray(d.fields) ? { ...d, fields: [...(d.fields as unknown[]), { id: 'launched', type: 'day' }] } : d,
  );
  assert.deepEqual((await planned(next)).conflicts, [], 'the field the rule added locked the list against its pack');
  await installed(next);
  const ids = (JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.things')!.body) as { fields: { id: string }[] }).fields.map((f) => f.id);
  assert.ok(ids.includes('domain') && ids.includes('launched'), `things holds ${ids.join(', ')}`);
  sql.close();
});
