/**
 * `script_try`: a draft script run now, in the sandbox, answering the writes it would make and writing none of them
 * (`loop/research-shell-scripts.md` section 7 and the remainder of Brief 6).
 *
 * THREE PLACES, ONE FILE, because they are one feature and each half is only worth anything with the others. The run
 * itself is `packages/host/src/script-try.ts`, driven here through the real QuickJS sandbox with `send` standing in
 * for the socket and `pin` for the name service, as `apps/selfhost/test/script.test.ts` does, so every request that
 * would have left is in a list. The route is `scriptTry` in `packages/host`'s table. The agent asks for it on
 * `propose`, with `"try"` on a script change, because a tool of its own measured 102 tokens against the 3 the list had
 * spare. The command line's half, that it routes the name, is `apps/cli/test/script-try.test.ts`, because a package's
 * test does not import an app.
 *
 * THE END-TO-END CASE USES THE RECORD'S OWN `scriptTry`, the guard and the body check, and a trial built the way the
 * self-host builds it, so the path from `propose` to the sandbox and back is real everywhere but the socket.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools } from '../src/index.ts';
import { stub } from './stub.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { runInQuickJs } from '../../script/src/quickjs.ts';
import { handlersFor, ROUTES, serveApi, type RecordSurface } from '../../host/src/index.ts';
import { scriptTrial, trialSandbox, type ScriptDraft, type TrialSandbox } from '../../host/src/script-try.ts';
import type { Ledger, Metered, Send } from '../../host/src/actions.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const RATES = 'https://rates.test';
const KEY = 'sk-live-not-a-real-key-4c1d';

type Pinned = { address: string };

/** A provider that echoes the authorization header back, which is the worst thing one can do with a key. */
function provider(): { send: Send<Pinned>; sent: { url: string; auth: string | null; method: string }[] } {
  const sent: { url: string; auth: string | null; method: string }[] = [];
  return {
    sent,
    send: async (url, init) => {
      const auth = new Headers(init.headers).get('authorization');
      sent.push({ url: url.href, auth, method: String(init.method ?? 'GET') });
      return new Response(JSON.stringify({ egp: 4210.5, echo: auth }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}

/** `rates.test` resolves somewhere public; every other name resolves somewhere private and is refused. */
const pin = async (at: URL): Promise<Pinned | string> =>
  at.hostname === 'rates.test' ? { address: '203.0.113.10' } : `${at.hostname} resolves to a private address, so nothing was sent.`;

/** A ledger that remembers what it counted, and holds whatever `hold` says. */
function ledger(hold: { until: number; say: string } | null = null): Ledger & { counted: Metered[]; asked: string[] } {
  const counted: Metered[] = [];
  const asked: string[] = [];
  return {
    counted,
    asked,
    mayRun: (record, action) => {
      asked.push(`${record}/${action}`);
      return hold;
    },
    meter: (_record, run) => counted.push(run),
  };
}

const FX = `export default async function run(ctx) {
  const r = await ctx.fetch('${RATES}/egp');
  const { egp } = await r.json();
  ctx.log('rate', egp);
  ctx.write('gold', { at: ctx.now(), price: Math.round(egp * 100) });
}`;

const body = (over: Partial<ScriptDraft['body']> = {}): ScriptDraft['body'] => ({
  script: 'fx-rate',
  egress: [RATES],
  keys: [],
  reads: [],
  writes: ['gold'],
  source: FX,
  ...over,
});

/** One trial through the real sandbox, with the doubles above. */
async function tryIt(draft: Partial<ScriptDraft> & { body: ScriptDraft['body'] }, o: { hold?: { until: number; say: string } | null } = {}) {
  const net = provider();
  const books = ledger(o.hold ?? null);
  const opened: string[] = [];
  const trial = scriptTrial({
    sandbox: trialSandbox<Pinned>({ run: runInQuickJs, send: net.send, pin, openKey: async (g) => (opened.push(g.label), KEY), now: () => NOW }),
    ledger: books,
    now: () => NOW,
  });
  const answer = await trial({ record: { id: REC, tz: 'Africa/Cairo' }, grantOf: null, ...draft });
  return { answer, sent: net.sent, counted: books.counted, asked: books.asked, opened };
}

/* ── the run ─────────────────────────────────────────────────────────────────────────────────────── */

test('A DRAFT RUNS AND WRITES NOTHING: the writes it would make come back, and the ledger counts it as one run', async () => {
  const { answer, sent, counted, asked } = await tryIt({ body: body() });
  assert.ok('writes' in answer, JSON.stringify(answer));
  assert.deepEqual(answer.writes, [{ op: 'create', register: 'gold', fields: { at: new Date(NOW).toISOString(), price: 421050 } }]);
  assert.match(answer.log, /rate 4210\.5/);
  assert.equal(answer.usage.fetches, 1);
  assert.deepEqual(sent.map((s) => s.url), [`${RATES}/egp`]);
  /* METERED LIKE A RUN: asked first, counted after, on the script's own line of the ledger. */
  assert.deepEqual(asked, [`${REC}/fx-rate`]);
  assert.equal(counted.length, 1);
  assert.equal(counted[0]!.channel, 'script');
  assert.equal(counted[0]!.ingest, 'fx-rate');
  assert.equal(counted[0]!.outcome, 'ok');
  assert.deepEqual(counted[0]!.usage, { runs: 1, requests: 1, bytes: counted[0]!.usage.bytes, ms: counted[0]!.usage.ms, failures: 0, held: 0 });
  assert.ok(counted[0]!.usage.bytes > 0);
});

test('A TRIAL THE PLAN HOLDS STARTS NOTHING, and is counted as held', async () => {
  const hold = { until: NOW + 86_400_000, say: "This record has used this month's runs." };
  const { answer, sent, counted } = await tryIt({ body: body() }, { hold });
  assert.deepEqual(answer, { held: hold });
  assert.deepEqual(sent, [], 'a held trial sent a request');
  assert.equal(counted.length, 1);
  assert.equal(counted[0]!.outcome, 'held');
  assert.equal(counted[0]!.usage.runs, 0);
  assert.equal(counted[0]!.usage.held, 1);
});

test('A CALLER THE RECORD GIVES NO KEYS HAS NONE OPENED: the fetch naming one is refused inside the run and nothing leaves', async () => {
  const source = `export default async function run(ctx) { await ctx.fetch('${RATES}/egp', { key: 'rates' }); ctx.write('gold', { at: 'x' }); }`;
  const { answer, sent, opened, counted } = await tryIt({ body: body({ keys: ['rates'], source }) });
  assert.ok('refused' in answer, JSON.stringify(answer));
  assert.match(answer.refused.why, /opens no key/);
  assert.deepEqual(sent, []);
  assert.deepEqual(opened, []);
  /* A REFUSED TRIAL STILL SPENT THE SANDBOX'S TIME, so it is a run and a failure, as a refused run is. */
  assert.equal(counted[0]!.outcome, 'refused');
  assert.equal(counted[0]!.usage.runs, 1);
  assert.equal(counted[0]!.usage.failures, 1);
});

test('A CALLER THE RECORD GIVES KEYS HAS THEM OPENED BY LABEL, and the value is nowhere in what comes back', async () => {
  const source = `export default async function run(ctx) {
  const r = await ctx.fetch('${RATES}/egp', { key: 'rates' });
  const text = await r.text();
  ctx.log(text);
  ctx.write('gold', { at: text });
}`;
  const { answer, sent, opened } = await tryIt({ body: body({ keys: ['rates'], source }), grantOf: (label) => (label === 'rates' ? { id: 'g_1', label, opens: 'rates.test' } : null) });
  assert.ok('writes' in answer, JSON.stringify(answer));
  assert.deepEqual(opened, ['rates']);
  assert.equal(sent[0]!.auth, `Bearer ${KEY}`);
  assert.doesNotMatch(JSON.stringify(answer), new RegExp(KEY), 'the key came back to the caller');
});

test('PIN IS ASKED BEFORE ANY SOCKET: a declared origin that resolves somewhere private is refused and never sent', async () => {
  const inside = 'https://intranet.test';
  const { answer, sent } = await tryIt({ body: body({ egress: [inside], source: `export default async function run(ctx) { await ctx.fetch('${inside}/'); }` }) });
  assert.ok('refused' in answer, JSON.stringify(answer));
  assert.match(answer.refused.why, /private address/);
  assert.deepEqual(sent, []);
});

test("THE READS ARE THE CALLER'S, AND A CALLER WHO BROUGHT NONE READS NOTHING", async () => {
  const source = `export default async function run(ctx) { const rows = await ctx.record.list('clients', null); ctx.write('gold', { at: String(rows.length) }); }`;
  const none = await tryIt({ body: body({ egress: [], reads: ['clients'], source }) });
  assert.ok('refused' in none.answer, JSON.stringify(none.answer));
  const asked: string[] = [];
  const mine = await tryIt({
    body: body({ egress: [], reads: ['clients'], source }),
    reads: { list: async (register) => (asked.push(register), [{ fields: { name: 'Kiln' } }]), get: async () => null },
  });
  assert.ok('writes' in mine.answer, JSON.stringify(mine.answer));
  assert.deepEqual(asked, ['clients']);
  assert.deepEqual(mine.answer.writes[0], { op: 'create', register: 'gold', fields: { at: '1' } });
});

/* ── the route ───────────────────────────────────────────────────────────────────────────────────── */

test('scriptTry IS ROUTED AS READ+, AND AS A POST, because a trial spends the allowance and may send a POST of its own', async () => {
  const route = ROUTES.find((r) => r.name === 'scriptTry');
  assert.deepEqual(route && { group: route.group, writes: route.writes }, { group: 'READ+', writes: true });
  const handlers = handlersFor({} as RecordSurface);
  const get = await serveApi(new Request('https://h.test/api/scriptTry'), handlers, {});
  assert.equal(get.status, 405);
  /* A RECORD THAT HAS NOT GOT THE METHOD SAYS SO, rather than a 500 from calling a function that is not there. */
  const post = await serveApi(new Request('https://h.test/api/scriptTry', { method: 'POST', body: JSON.stringify({ body: body() }) }), handlers, {});
  assert.equal(post.status, 501);
  assert.equal(((await post.json()) as { refusal: { code: string } }).refusal.code, 'NOT_IN_THIS_BUILD');
  const seen: unknown[] = [];
  const wired = handlersFor({ scriptTry: async (a: unknown) => (seen.push(a), { ok: true, value: { writes: [] } }) } as unknown as RecordSurface);
  const ran = await serveApi(new Request('https://h.test/api/scriptTry', { method: 'POST', body: JSON.stringify({ body: body() }) }), wired, {});
  assert.equal(ran.status, 200);
  assert.deepEqual(seen, [{ body: body() }]);
});


test('A SANDBOX THAT THROWS IS THE HOST: counted as a failure that cost no run, and thrown on', async () => {
  const books = ledger();
  const broken: TrialSandbox = async () => {
    throw new Error('the loader did not start');
  };
  const trial = scriptTrial({ sandbox: broken, ledger: books, now: () => NOW });
  await assert.rejects(trial({ record: { id: REC, tz: 'UTC' }, body: body(), grantOf: null }), /the loader did not start/);
  assert.equal(books.counted.length, 1);
  assert.equal(books.counted[0]!.outcome, 'failed');
  assert.deepEqual(books.counted[0]!.usage, { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 1, held: 0 });
});

test('ONE ID FOR A TRIAL: the job its fetches are sent for is the event the ledger counts, and no loader id is handed over', async () => {
  const books = ledger();
  const seen: { job: string; trial: string[] }[] = [];
  const sandbox: TrialSandbox = async (s, t) => {
    seen.push({ job: s.job.id, trial: Object.keys(t).sort() });
    return { writes: [], log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 0 } };
  };
  const trial = scriptTrial({ sandbox, ledger: books, now: () => NOW, mint: () => 'try_fixed' });
  await trial({ record: { id: REC, tz: 'UTC' }, body: body(), grantOf: null });
  assert.deepEqual(seen, [{ job: 'try_fixed', trial: ['grantOf', 'reads'] }]);
  assert.equal(books.counted[0]!.event, 'try_fixed');
});

/* ── MCP: a trial is asked for, never run on its own ─────────────────────────────────────────────── */

const change = (b: ScriptDraft['body'] & Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  question: 'Fetch the rate every hour?',
  body_kind: 'change',
  body: { declaration_id: `script.${b.script}`, to: { id: `script.${b.script}`, kind: 'script', body: { ...b, runs: { every: '1h' } } }, ...extra },
});
/** The code a refused answer carries, or `undefined` for one that was not refused. */
const codeOf = (r: unknown): string | undefined => (r as { refusal?: { code?: string } }).refusal?.code;
const ANSWERED = { writes: [], log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 0 } };

test('A SCRIPT CHANGE WITHOUT try IS FILED AND NEVER RUN: nothing fetches at proposal time unless the agent asked', async () => {
  const tried: unknown[] = [];
  const { surface, calls } = stub({ scriptTry: async (a) => (tried.push(a), { ok: true, value: ANSWERED }) });
  const out = await tools(surface).call('propose', change(body()), { who: 'agent' });
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value, { id: 'SG1' });
  assert.deepEqual(tried, [], 'a proposal ran the script nobody asked to try');
  assert.deepEqual(calls.map((c) => c.method), ['propose']);
});

test('WITH try IT IS TRIED AND FILED NOWHERE: the answer is script_try, and propose is never called', async () => {
  const tried: unknown[] = [];
  const { surface, calls } = stub({ scriptTry: async (a) => (tried.push(a), { ok: true, value: ANSWERED }) });
  const out = await tools(surface).call('propose', change(body(), { try: true }), { who: 'agent' });
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value, { script_try: ANSWERED, proposed: false });
  /* A COPY, because `deepEqual` narrows what it is handed to the shape it was compared with, and `tried` is pushed to again. */
  assert.deepEqual([...tried], [{ body: { ...body(), runs: { every: '1h' } } }]);
  assert.deepEqual(calls, [], 'a trial filed a proposal');

  /* AND WHAT A DOOR WOULD HAVE HANDED IT, when the agent says. */
  await tools(surface).call('propose', change(body(), { try: { input: { body: 'debited EGP 12' } } }), { who: 'agent' });
  assert.deepEqual(tried[1], { body: { ...body(), runs: { every: '1h' } }, input: { body: 'debited EGP 12' } });
});

test('try ON A SCRIPT CHANGE IS REFUSED SPELLED ANY OTHER WAY OR WHERE NOTHING CAN TRY ONE, and a rule change goes to tryAutomation', async () => {
  const tried: unknown[] = [];
  const { surface } = stub({ scriptTry: async (a) => (tried.push(a), { ok: true, value: ANSWERED }) });
  const rule = await tools(surface).call(
    'propose',
    { question: 'q', body_kind: 'change', body: { declaration_id: 'rule.x', to: { id: 'rule.x', kind: 'rule', body: { register: 'gold', then: [] } }, try: true } },
    { who: 'agent' },
  );
  assert.equal(codeOf(rule), 'NOT_IN_THIS_BUILD');
  const odd = await tools(surface).call('propose', change(body(), { try: 'yes' }), { who: 'agent' });
  assert.equal(codeOf(odd), 'VALUE_MALFORMED');
  const stray = await tools(surface).call('propose', change(body(), { try: { input: 1, dry: true } }), { who: 'agent' });
  assert.equal(codeOf(stray), 'VALUE_MALFORMED');
  assert.deepEqual(tried, []);
  const older = await tools(stub().surface).call('propose', change(body(), { try: true }), { who: 'agent' });
  assert.equal(codeOf(older), 'NOT_IN_THIS_BUILD');
});

test('A TRIAL THE RECORD REFUSES IS REFUSED IN ITS WORDS, and nothing is filed', async () => {
  const { surface, calls } = stub({ scriptTry: async () => ({ ok: false, refusal: { code: 'DECLARATION_INVALID', fix: 'No.' } }) });
  const out = await tools(surface).call('propose', change(body(), { try: true }), { who: 'agent' });
  assert.deepEqual(out, { ok: false, refusal: { code: 'DECLARATION_INVALID', fix: 'No.' } });
  assert.deepEqual(calls, []);
});

test('END TO END ON A REAL RECORD: the trial answers its write, the register gains no row, and nothing waits in Decide', async () => {
  const sql = openSqlite();
  const net = provider();
  const trial = scriptTrial({
    sandbox: trialSandbox<Pinned>({ run: runInQuickJs, send: net.send, pin, openKey: null, now: () => NOW }),
    ledger: null,
    now: () => NOW,
  });
  const owned: boolean[] = [];
  const api = await createRecordApi({
    sql,
    clock: fixedClock(NOW),
    tryScript: (d) => (owned.push(d.owner), trial({ record: d.record, body: d.body as never, input: d.input as never, reads: d.reads as never, grantOf: null })),
  });
  const installed = await api.kernel.install([
    { id: 'register.gold', kind: 'register', body: { id: 'gold', name: 'gold', title: 'at', fields: [{ id: 'at', type: 'text', required: true }, { id: 'price', type: 'int' }] } as never },
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' } };
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

  const out = await tools(api).call('propose', change(body(), { try: true }), agent);
  assert.ok(out.ok, JSON.stringify(out));
  const tried = (out.value as { script_try: { writes: unknown[] } }).script_try;
  assert.deepEqual(tried.writes, [{ op: 'create', register: 'gold', fields: { at: new Date(NOW).toISOString(), price: 421050 } }]);
  assert.equal(net.sent.length, 1);
  /* A TOKEN IS NOT THE OWNER, whatever level its person has: the record says so, and the trial opens no key. */
  assert.deepEqual(owned, [false]);
  const rows = await api.list({ register: 'gold' }, owner);
  assert.ok(rows.ok, JSON.stringify(rows));
  assert.equal(rows.value.rows.length, 0, 'the trial wrote a row');
  const open = await api.governance({ status: 'open' } as never, owner);
  assert.ok(open.ok, JSON.stringify(open));
  assert.equal(JSON.stringify(open.value).includes('script.fx-rate'), false, 'a trial put a question in Decide');
  sql.close();
});
