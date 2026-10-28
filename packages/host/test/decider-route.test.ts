/**
 * `setDecider` over the wire (`src/routes/decider.ts`): one ADMIN row that writes, in the shape
 * `router-groups` and `guards` read, naming the record method of the same name.
 *
 * THE GROUP IS WHAT THE METHOD'S FIRST STATEMENT IMPLIES: `admin(ctx)`, so the row is ADMIN. Until `routes/index.ts`
 * spreads this file the table has no such row, so the request through the host's handler waits for that line (skipped,
 * and said so); once it does, an owner hands a question to a member who decides and a token is refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, ROUTES, serveApi } from '../src/index.ts';
import { ROUTES as OWN } from '../src/routes/decider.ts';
import { methods } from '../../record/src/methods/decider.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' } as never };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const WIRED = ROUTES.some((r) => r.name === 'setDecider');

test('SET DECIDER IS ONE ADMIN WRITE, written once in its file, with a plain sentence', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['setDecider', 'ADMIN', true]]);
  assert.equal(OWN[0]!.takes, undefined, 'a write carries its shapes in its body');
  const what = OWN[0]!.what;
  assert.match(what, /decides/u);
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b/u, 'the sentence names things as a person does');
});

test('THE ROW NAMES THE RECORD METHOD OF THE SAME NAME, and the table serves it at most once', () => {
  assert.deepEqual(Object.keys(methods({} as never)), ['setDecider'], 'the method file answers the one name the row routes');
  assert.ok(ROUTES.filter((r) => r.name === 'setDecider').length <= 1);
});

test('THROUGH THE HOST, an owner hands a question and a token is refused', { skip: WIRED ? false : 'waits for routes/index.ts and methods/index.ts to spread decider.ts' }, async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const made = api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAQ', slug: 'the-kiln', name: 'The Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  assert.ok(made.ok);
  const ada = PEOPLE[3]!;
  sql.exec('INSERT INTO person (id, email, name) VALUES (?, ?, ?)', 'p_ada', ada.email, ada.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_ada', '*', 'decide')");
  const asked = api.kernel.propose(
    { question: 'Which kiln shelf first?', body_kind: 'options', body: { options: [{ id: 'top', label: 'Top', because: 'Hotter.' }, { id: 'low', label: 'Low', because: 'Safer.' }] } },
    'p_1',
  );
  assert.ok(asked.ok, JSON.stringify(asked));
  const handlers = handlersFor(api as never);
  const post = async (ctx: CallContext, body: unknown) => {
    const res = await serveApi(new Request('https://x/api/setDecider', { method: 'POST', body: JSON.stringify(body) }), handlers, ctx);
    return { status: res.status, body: (await res.json()) as Answer };
  };
  const mine = await post(owner, { id: asked.value.id, to: 'p_ada' });
  if ('handQuestion' in api.kernel) {
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.deepEqual(mine.body.value, { id: asked.value.id, decider: 'p_ada' });
    assert.equal(api.kernel.governanceRow('suggestion', asked.value.id)?.decider, 'p_ada');
  } else assert.equal(mine.body.refusal?.code, 'NOT_IN_THIS_BUILD', 'the kernel line has not landed yet');
  const theirs = await post(token, { id: asked.value.id, to: 'p_ada' });
  assert.equal(theirs.body.ok, false);
  assert.equal(theirs.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});
