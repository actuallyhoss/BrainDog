/**
 * `packsRemoved` over the wire (`src/routes/packs-removed.ts`, SHL-A12 job 3): one ADMIN row that writes nothing and
 * takes nothing, in the shape `router-groups` and `guards` read, naming the record method of the same name.
 *
 * THE GROUP IS WHAT THE METHOD'S FIRST STATEMENT IMPLIES: `admin(ctx)`, as `uninstallPack` starts, so the row is
 * ADMIN beside it. Until `routes/index.ts` spreads this file the table has no such row, so the request through the
 * host's handler waits for that line (skipped, and said so); once it does, an owner is answered and a token is refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, ROUTES, serveApi } from '../src/index.ts';
import { ROUTES as OWN } from '../src/routes/packs-removed.ts';
import { methods } from '../../record/src/methods/packs-removed.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' } as never };

const WIRED = ROUTES.some((r) => r.name === 'packsRemoved');

test('PACKS REMOVED IS ONE ADMIN READ, written once in its file, taking nothing, with a plain sentence', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['packsRemoved', 'ADMIN', false]]);
  assert.deepEqual(OWN[0]!.takes, {});
  assert.equal(OWN[0]!.postRead, undefined, 'an ordinary read');
  const what = OWN[0]!.what;
  assert.match(what, /changes nothing/u);
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b|\{\{|\d/u, 'the sentence names things as a person does, and keeps no second copy of the window');
});

test('THE ROW NAMES THE RECORD METHOD OF THE SAME NAME, and the table serves it at most once', () => {
  const made = methods({} as never);
  assert.deepEqual(Object.keys(made), ['packsRemoved'], 'the method file answers the one name the row routes');
  assert.ok(ROUTES.filter((r) => r.name === 'packsRemoved').length <= 1);
});

test('THROUGH THE HOST, an owner is answered and a token is refused', { skip: WIRED ? false : 'waits for routes/index.ts and methods/index.ts to spread packs-removed.ts' }, async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const made = api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-kiln', name: 'The Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  assert.ok(made.ok);
  const handlers = handlersFor(api as never);
  const get = async (ctx: CallContext, query = '') => {
    const res = await serveApi(new Request(`https://x/api/packsRemoved${query}`), handlers, ctx);
    return { status: res.status, body: (await res.json()) as { ok: boolean; value?: unknown[]; refusal?: { code: string } } };
  };
  const mine = await get(owner);
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.deepEqual(mine.body.value, [], 'a fresh record has taken nothing out');
  const theirs = await get(token);
  assert.equal(theirs.body.ok, false);
  assert.equal(theirs.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});
