/**
 * `record_index` says who is working: how many runs were heard from in the last fifteen minutes, and the ones
 * in the caller's own tree by name with their handle beside it, in one line an agent reads when it opens the record.
 *
 * OVER A REAL RECORD, so the runs are `boot`'s own and `same_repo` is the record's `sameTree`, worked out from the
 * caller's hints. Three packs are installed so the index is the size the budget was measured at, and the line is paid
 * for inside it: `record_index` answers in under 500 tokens (`docs/10-MCP.md`, measured budget targets), counted with
 * the estimator `budget.test.ts` counts the tool list with.
 *
 * Invented names only: the machine `lark-mac`, the repositories `kestrel` and `tern`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { liveLine } from '../src/brief.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../seed/src/index.ts';
import { tokenBudget } from './tokens.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const MIN = 60_000;
const BUDGET = 500;

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const run = (client_id: string, repo: string): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { host: 'lark-mac', repo, agent: 'claude', client: 'claude-code', client_id },
});
/* THE CALLER, in `kestrel` on `lark-mac`: a reader of the runs that names where it is and has no run of its own yet. */
const caller: CallContext = { ...owner, session: { host: 'lark-mac', repo: 'kestrel', client_id: 'c-caller' } };

async function record(runs: { client: string; repo: string; ago: number }[]) {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 30 * MIN);
  const api = await createRecordApi({ sql, clock });
  for (const id of ['portfolio', 'people', 'money-core']) {
    const doc = firstPartyDocument(id, { seeds: [] });
    const plan = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as { ok: boolean; value: { diff: { planHash: string; approve: string[] } } };
    assert.ok(plan.ok, JSON.stringify(plan));
    const put = await api.installPack({ doc, source: { kind: 'local' }, planHash: plan.value.diff.planHash, approve: plan.value.diff.approve } as never, owner);
    assert.ok(put.ok, JSON.stringify(put));
  }
  for (const r of runs) {
    clock.set(NOW - r.ago);
    const attached = await api.attach({ source: 'startup' }, run(r.client, r.repo));
    assert.ok(attached.ok, JSON.stringify(attached));
  }
  clock.set(NOW);
  return { sql, api };
}

/** `record_index` over the wire: the text the model reads, and the whole answer beside it. */
async function index(api: unknown, ctx: CallContext): Promise<{ text: string; structured: Record<string, unknown> }> {
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'record_index', arguments: {} } }, api as never, ctx)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const result = reply.result as { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> };
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return { text: result.content.map((c) => c.text).join(''), structured: result.structuredContent ?? {} };
}

test('TWO WORKING, ONE IN THE CALLER’S TREE: the index counts both and names the one here by app and handle', async () => {
  const { sql, api } = await record([
    { client: 'c-here', repo: 'kestrel', ago: 2 * MIN },
    { client: 'c-away', repo: 'tern', ago: 5 * MIN },
  ]);
  const got = await index(api, caller);
  const live = got.structured.live as { working: number; here: string[] };
  assert.equal(live.working, 2, JSON.stringify(live));
  assert.equal(live.here.length, 1, JSON.stringify(live));
  assert.match(live.here[0]!, /^Claude Code \(S\d+\)$/u, 'a run here is named by its app with its handle beside it');
  const line = got.text.split('\n').find((l) => /working/u.test(l));
  assert.equal(line, `2 agents working, one of them here: ${live.here[0]!}.`, got.text);
  /* NAMES, NEVER IDS OR PLACES: no machine, no folder, no ULID. */
  assert.doesNotMatch(line!, /lark-mac|kestrel|tern|[0-9A-HJKMNP-TV-Z]{26}/u);
  sql.close();
});

test('NONE WORKING, NO LINE: a run heard from twenty minutes ago is not working, and the index says nothing of runs', async () => {
  const { sql, api } = await record([{ client: 'c-old', repo: 'kestrel', ago: 20 * MIN }]);
  const got = await index(api, caller);
  assert.equal(got.structured.live, undefined, JSON.stringify(got.structured.live));
  assert.doesNotMatch(got.text, /working/u, got.text);
  sql.close();
});

test('AND A RECORD WITH NO RUNS AT ALL says nothing of them either', async () => {
  const { sql, api } = await record([]);
  const got = await index(api, caller);
  assert.equal(got.structured.live, undefined);
  assert.doesNotMatch(got.text, /working/u, got.text);
  sql.close();
});

test('THE INDEX STAYS INSIDE ITS BUDGET with the line in it', async () => {
  const { sql, api } = await record([
    { client: 'c-here', repo: 'kestrel', ago: 2 * MIN },
    { client: 'c-away', repo: 'tern', ago: 5 * MIN },
  ]);
  const got = await index(api, caller);
  assert.match(got.text, /2 agents working/u);
  const spent = tokenBudget(got.text);
  console.log(`record_index text: ${String(spent)} tokens of ${String(BUDGET)}`);
  assert.ok(spent < BUDGET, `record_index costs ${String(spent)} tokens, over ${String(BUDGET)}`);
  sql.close();
});

test('THE LINE ITSELF: one working here, several here, none here, and nothing for none working', () => {
  assert.equal(liveLine({ working: 1, here: ['Codex (S3)'] }), '1 agent working, and it is here: Codex (S3).');
  assert.equal(liveLine({ working: 1, here: [] }), '1 agent working, not here.');
  assert.equal(liveLine({ working: 3, here: [] }), '3 agents working, none of them here.');
  assert.equal(liveLine({ working: 3, here: ['Codex (S3)', 'Cursor (S4)'] }), '3 agents working, 2 of them here: Codex (S3) and Cursor (S4).');
  assert.equal(
    liveLine({ working: 6, here: ['A (S1)', 'B (S2)', 'C (S3)', 'D (S4)', 'E (S5)'] }),
    '6 agents working, 5 of them here: A (S1), B (S2), C (S3) and 2 more.',
  );
  assert.equal(liveLine({ working: 0, here: [] }), null);
  assert.equal(liveLine(undefined), null);
});
