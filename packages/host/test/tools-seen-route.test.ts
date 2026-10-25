/**
 * `toolsSeen`, what one machine holds (AGT-D02): routed as one DATA write, taking the machine as text and the tools as
 * JSON, and handed to the record method of the same name.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): DATA, since the method's first statement is
 * `guard(ctx, 'write', ...)`. The row is proved here by its file; once `routes/index.ts` holds its line, the table's
 * DATA rows grow by exactly this one and the call reaches the record, which the last test then proves too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { ROUTES as OWN } from '../src/routes/tools-seen.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };
const wired = EXTRA_ROUTES.some((r) => r.name === 'toolsSeen');

test('TOOLS SEEN IS ONE DATA WRITE, written once in its file, taking the machine and the tools, with a plain sentence', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['toolsSeen', 'DATA', true]]);
  assert.deepEqual(OWN[0]!.takes, { machine: 'text', found: 'json' });
  const what = OWN[0]!.what;
  assert.match(what, /servers, command lines and integrations/u);
  assert.doesNotMatch(what, /—|\bids?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b|\{\{/u, 'the sentence names things as a person does');
});

test('ONCE WIRED, THE ROUTE COUNTS BY GROUP: one DATA route, nothing else grows', { skip: wired ? false : 'routes/index.ts does not hold its line yet' }, () => {
  assert.deepEqual(ROUTES.filter((r) => r.name === 'toolsSeen'), [OWN[0]], 'the table serves the row its file wrote');
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'toolsSeen').length, 1, 'served from routes/, not written twice');
  const by = (rows: readonly { group: string }[]) => rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'toolsSeen'));
  assert.equal(all.DATA, (without.DATA ?? 0) + 1);
  for (const group of ['READ+', 'KEYCHAIN', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('ONCE WIRED, A POST REACHES THE RECORD METHOD OF ITS NAME with the machine and the tools as sent', { skip: wired ? false : 'routes/index.ts does not hold its line yet' }, async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 14, 12)) });
  const heard: unknown[] = [];
  const said = { tools: [{ name: 'quill', did: 'added' }] };
  const handlers = handlersFor(
    Object.assign(Object.create(api), {
      toolsSeen: async (args: unknown, ctx: CallContext) => (heard.push([args, ctx.principal.id]), ok(said)),
    }) as never,
  );
  const found = [{ name: 'quill', kind: 'mcp', scope: 'global', transport: 'stdio', command: 'npx', args: ['quill-mcp'], needs: [], source: 'the user config' }];
  const res = await serveApi(
    new Request('https://x/api/toolsSeen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ machine: 'build-box', found }) }),
    handlers,
    agent,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, value: said });
  assert.deepEqual(heard, [[{ machine: 'build-box', found }, 'tok_1']]);
  sql.close();
});
