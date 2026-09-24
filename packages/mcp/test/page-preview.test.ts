/**
 * An agent sees its page drawn before it proposes it: `propose` with `"try"` on a page change answers the record's
 * `previewPage` and files nothing (M4 wave three brief 3).
 *
 * BY `script_try`'S ROUTE AND NOT A TOOL OF ITS OWN, because a tool costs tokens against the ceiling `docs/10-MCP.md`
 * measured, and the smallest one that could say this measured 102 against 3 the last time anything asked. A page an
 * agent drafted was otherwise seen drawn only by the owner, in Decide, after the agent had already filed it; the agent
 * iterated blind and the owner was asked about every draft.
 *
 * RED BEFORE THE ROUTE: over the stub, a page change with `try` answered `VALUE_MALFORMED`, "Only a script change can
 * be tried", and the end-to-end case failed the same way. The command line's half (that `surfaceOver` carries
 * `previewPage` when its host lists it, and the signed-out surface refuses it) lives in `apps/cli`, because a package's
 * test does not import an app; the signed-out half is also held by the compiler, since that surface is `Required`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools } from '../src/index.ts';
import { stub } from './stub.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);

/** What an agent drafts: a page of open tasks. */
const PAGE = {
  page: 'open-tasks',
  title: 'Open tasks',
  nav: { section: 'Work', order: 10 },
  blocks: [{ kind: 'table', source: 'register.tasks', heading: 'Open', where: 'state is open' }],
};

/** A page change as an agent sends it, with `kind` said or left for the id to say. */
const change = (extra: Record<string, unknown> = {}, o: { kind?: boolean } = {}) => ({
  question: 'Add a page of open tasks?',
  body_kind: 'change',
  body: { declaration_id: 'page.open-tasks', to: { id: 'page.open-tasks', ...(o.kind === false ? {} : { kind: 'page' }), body: PAGE }, ...extra },
});

/** The code a refused answer carries, or `undefined` for one that was not refused. */
const codeOf = (r: unknown): string | undefined => (r as { refusal?: { code?: string } }).refusal?.code;

const DRAWN = { page: 'open-tasks', read_at: new Date(NOW).toISOString(), blocks: [{ kind: 'table', rows: [], matched: 0, refusals: [] }] };

/* ── over the stub: the route, and nothing filed ─────────────────────────────────────────────────── */

test('A PAGE CHANGE WITH try IS DRAWN AND FILED NOWHERE: the answer is page_preview, and propose is never called', async () => {
  const asked: unknown[] = [];
  const { surface, calls } = stub({ previewPage: async (a) => (asked.push(a), { ok: true, value: DRAWN }) });
  const out = await tools(surface).call('propose', change({ try: true }), { who: 'agent' });
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value, { page_preview: DRAWN, proposed: false });
  /* THE BODY ALONE, which is the one argument `previewPage` takes: it refuses any other name as FIELD_UNKNOWN. */
  assert.deepEqual([...asked], [{ body: PAGE }]);
  assert.deepEqual(calls, [], 'a preview filed a proposal');

  /* AND AN ID THAT SAYS `page.` IS A PAGE CHANGE WITHOUT `kind`, as `scriptIn` reads `script.`. */
  const bare = await tools(surface).call('propose', change({ try: true }, { kind: false }), { who: 'agent' });
  assert.deepEqual(bare, { ok: true, value: { page_preview: DRAWN, proposed: false } });
  assert.equal(asked.length, 2);
});

test('A PAGE CHANGE WITHOUT try IS FILED AND NEVER DRAWN, so a proposal costs the record no preview it was not asked for', async () => {
  const asked: unknown[] = [];
  const { surface, calls } = stub({ previewPage: async (a) => (asked.push(a), { ok: true, value: DRAWN }) });
  const out = await tools(surface).call('propose', change(), { who: 'agent' });
  assert.deepEqual(out, { ok: true, value: { id: 'SG1' } });
  assert.deepEqual(asked, []);
  assert.deepEqual(calls.map((c) => c.method), ['propose']);
});

test('try ON A PAGE IS true AND NOTHING ELSE, and a host without the method says so rather than filing it', async () => {
  const asked: unknown[] = [];
  const { surface } = stub({ previewPage: async (a) => (asked.push(a), { ok: true, value: DRAWN }) });
  /* A PAGE HAS NO DOOR, so `{"input": ...}` would be a value the preview silently dropped. */
  const input = await tools(surface).call('propose', change({ try: { input: { body: 'x' } } }), { who: 'agent' });
  assert.equal(codeOf(input), 'VALUE_MALFORMED');
  assert.equal((input as { refusal: { at?: string } }).refusal.at, 'body.try');
  assert.equal(codeOf(await tools(surface).call('propose', change({ try: 'yes' }), { who: 'agent' })), 'VALUE_MALFORMED');
  assert.deepEqual(asked, []);

  const { surface: older, calls } = stub();
  const out = await tools(older).call('propose', change({ try: true }), { who: 'agent' });
  assert.equal(codeOf(out), 'NOT_IN_THIS_BUILD');
  assert.deepEqual(calls, [], 'a host that cannot draw the page filed it instead');
});

test('A RULE CHANGE STILL CANNOT BE TRIED, and the sentence names both kinds that can', async () => {
  const { surface } = stub({ previewPage: async () => ({ ok: true, value: DRAWN }) });
  const rule = await tools(surface).call(
    'propose',
    { question: 'q', body_kind: 'change', body: { declaration_id: 'rule.x', to: { id: 'rule.x', kind: 'rule', body: { register: 'gold', then: [] } }, try: true } },
    { who: 'agent' },
  );
  assert.equal(codeOf(rule), 'VALUE_MALFORMED');
  assert.match((rule as { refusal: { fix: string } }).refusal.fix, /script or a page/);
});

test("A PREVIEW THE RECORD REFUSES IS REFUSED IN ITS WORDS, and nothing is filed", async () => {
  const said = { ok: false as const, refusal: { code: 'FIELD_UNKNOWN', fix: 'No such field.', at: 'blocks[0].where' } };
  const { surface, calls } = stub({ previewPage: async () => said });
  const out = await tools(surface).call('propose', change({ try: true }), { who: 'agent' });
  assert.deepEqual(out, said);
  assert.deepEqual(calls, []);
});

/* ── end to end, on the record's own method ──────────────────────────────────────────────────────── */

/** Three tasks, two of them open, on a real kernel. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install([
    {
      id: 'register.tasks',
      kind: 'register',
      body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'state', type: 'enum', values: ['open', 'done'] }] } as never,
    },
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
  for (const [what, state] of [['Write the brief', 'open'], ['Ring the printer', 'done'], ['Send the invoice', 'open']] as const) {
    const made = await api.create({ register: 'tasks', fields: { what, state } }, owner);
    assert.ok(made.ok, JSON.stringify(made));
  }
  const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' } };
  return { sql, api, owner, agent };
}

test('END TO END ON A REAL RECORD: the agent reads the two open tasks its table would hold, and nothing waits in Decide', async () => {
  const { sql, api, owner, agent } = await record();
  const declared = api.kernel.declarations().length;
  const out = await tools(api).call('propose', change({ try: true }), agent);
  assert.ok(out.ok, JSON.stringify(out));
  const drawn = out.value as { proposed: boolean; page_preview: { page: string; blocks: { rows: { fields: Record<string, unknown> }[]; matched: number }[] } };
  assert.equal(drawn.proposed, false);
  assert.equal(drawn.page_preview.page, 'open-tasks');
  assert.equal(drawn.page_preview.blocks[0]!.matched, 2);
  assert.deepEqual(
    drawn.page_preview.blocks[0]!.rows.map((r) => r.fields.what).sort(),
    ['Send the invoice', 'Write the brief'],
  );
  assert.equal(api.kernel.declarations().length, declared, 'a preview installed the page');
  const open = await api.governance({ status: 'open' } as never, owner);
  assert.ok(open.ok, JSON.stringify(open));
  assert.equal(JSON.stringify(open.value).includes('open-tasks'), false, 'a preview put a question in Decide');
  sql.close();
});

test("END TO END, A BODY THE INSTALL WOULD REFUSE IS REFUSED IN THE INSTALL'S WORDS before anybody is asked about it", async () => {
  const { sql, api, owner, agent } = await record();
  const bad = change({ try: true });
  (bad.body.to as { body: unknown }).body = { ...PAGE, blocks: [{ kind: 'table', source: 'register.tasks', where: 'nosuch is x' }] };
  const out = await tools(api).call('propose', bad, agent);
  assert.equal(codeOf(out), 'FIELD_UNKNOWN');
  const open = await api.governance({ status: 'open' } as never, owner);
  assert.ok(open.ok, JSON.stringify(open));
  assert.equal(JSON.stringify(open.value).includes('open-tasks'), false, 'a refused preview was filed');
  sql.close();
});
