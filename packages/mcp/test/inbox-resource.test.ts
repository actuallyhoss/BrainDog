/**
 * The inbox as a resource: `braindog:inbox` and `braindog:inbox/{state}`.
 *
 * WHAT WAS MEASURED BEFORE ANY OF THIS. `resources/read braindog:inbox` answered `ROUTE_UNKNOWN` over the wire, and MCP
 * had no inbox verb at all. The tool list is at its ceiling (`budget.test.ts`), and a resource costs it nothing, so the
 * inbox is two addresses and no tool.
 *
 * THE TOOL LAYER DECIDES NOTHING. Who may read the inbox is the record's call: today the owner, and every token refused
 * (whether that changes is an open question). An agent asking is answered with the record's own sentence, word for word, and
 * the address is not listed to a caller it would refuse.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { TEMPLATES, TOOLS, tools } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 8, 24, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'kiln', agent: 'claude' },
};

/** One skipped text between two untriaged ones, as the first red run asked for. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  for (const [n, state] of (['untriaged', 'skipped', 'untriaged'] as const).entries()) {
    const out = api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK', Subject: `Text ${n + 1}` }, body: `Body ${n + 1}`, sha256: `s${n + 1}` });
    assert.ok(out.ok, JSON.stringify(out));
    sql.exec('UPDATE inbox_raw SET state = ? WHERE id = ?', state, out.value.raw);
  }
  return { sql, api };
}

/** One `resources/read` over the same `handle` stdio and HTTP serve. */
async function readOver(surface: Parameters<typeof handle>[1], uri: string, ctx: unknown): Promise<Reply> {
  return (await handle({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri } }, surface, ctx)) as Reply;
}
const contents = (reply: Reply): unknown => {
  assert.ok('result' in reply, JSON.stringify(reply));
  return JSON.parse((reply.result as { contents: { text: string }[] }).contents[0]!.text);
};
const refusalOf = (reply: Reply): { code: string; fix: string } => {
  assert.ok('error' in reply, JSON.stringify(reply));
  return (reply.error.data as { refusal: { code: string; fix: string } }).refusal;
};

type Page = { arrivals: { subject: string; state: string }[]; cursor: number | null; counts: Record<string, number> };

test('resources/read braindog:inbox ANSWERS THE WAITING ARRIVALS AND A COUNT FOR EVERY STATE', async () => {
  const { sql, api } = await record();
  const page = contents(await readOver(api, 'braindog:inbox', owner)) as Page;
  assert.deepEqual(page.arrivals.map((a) => a.subject), ['Text 3', 'Text 1']);
  assert.deepEqual(page.counts, { untriaged: 2, review: 0, skipped: 1, matched: 0, proposed: 0, ignored: 0 });
  sql.close();
});

test('braindog:inbox/skipped ANSWERS WHAT WAS SKIPPED, which is where a wrong skip pattern shows', async () => {
  const { sql, api } = await record();
  const page = contents(await readOver(api, 'braindog:inbox/skipped', owner)) as Page;
  assert.deepEqual(page.arrivals.map((a) => [a.subject, a.state]), [['Text 2', 'skipped']]);
  assert.equal((contents(await readOver(api, 'braindog:inbox/all', owner)) as Page).arrivals.length, 3);
  assert.ok(TEMPLATES.some((t) => t.uriTemplate === 'braindog:inbox/{state}'), 'the address is not advertised as a template');

  /* A STATE THAT IS NOT ONE IS THE RECORD'S REFUSAL, and a path that is not a name never reaches the record. */
  assert.equal(refusalOf(await readOver(api, 'braindog:inbox/erased', owner)).code, 'VALUE_MALFORMED');
  assert.equal(refusalOf(await readOver(api, 'braindog:inbox/../boot', owner)).code, 'ROUTE_UNKNOWN');
  sql.close();
});

test("AN AGENT IS ANSWERED WITH THE RECORD'S OWN SENTENCE, and the address is not listed to it", async () => {
  const { sql, api } = await record();
  const direct = await api.inbox(undefined, agent);
  assert.ok(!direct.ok && 'refusal' in direct, 'the record let a token read the inbox; if tokens may now read it, this test is stale');
  for (const uri of ['braindog:inbox', 'braindog:inbox/skipped']) {
    const no = refusalOf(await readOver(api, uri, agent));
    assert.equal(no.code, 'FORBIDDEN');
    assert.equal(no.fix, direct.refusal.fix, 'the tool layer wrote a sentence of its own');
    assert.doesNotMatch(no.fix, /Text \d/);
  }
  const mcp = tools(api);
  assert.equal((await mcp.resources(agent)).some((r) => r.uri === 'braindog:inbox'), false, 'listed to a caller it refuses');
  assert.equal((await mcp.resources(owner)).some((r) => r.uri === 'braindog:inbox'), true, 'not listed to the owner, who reads it');
  sql.close();
});

test('A SURFACE WITH NO INBOX DOES NOT LIST IT, says so when asked, and the tool list did not move', async () => {
  const bare = tools(stub().surface);
  assert.equal((await bare.resources({ who: 'agent' })).some((r) => r.uri.startsWith('braindog:inbox')), false);
  const no = await bare.read('braindog:inbox/skipped', { who: 'agent' });
  assert.equal(no.ok ? null : 'refusal' in no ? no.refusal.code : null, 'NOT_IN_THIS_BUILD');

  /* THE RELAY, read off the answer: the stub records only the methods it builds, and `inbox` is not one of them. */
  const { surface } = stub({ inbox: async (args) => ({ ok: true, value: { arrivals: [], cursor: null, counts: {}, args } }) });
  const relayed = await tools(surface).read('braindog:inbox/review', { who: 'agent' });
  assert.deepEqual((relayed as { value: { args: unknown } }).value.args, { state: 'review' }, 'the state went through as the one argument');
  const plain = await tools(surface).read('braindog:inbox', { who: 'agent' });
  assert.deepEqual((plain as { value: { args: unknown } }).value.args, {}, "no state is the record's default, not one chosen here");
  assert.equal(TOOLS.some((t) => t.name.includes('inbox')), false, 'the inbox became a tool');
});

/* ── braindog:inbox/patterns, what each pattern did (REC-A03 step 5) ─────────────────────────────────────────────── */

/**
 * BEFORE: the address fell through to `inbox({ state: 'patterns' })` and was answered "state is one of ...", so an agent
 * asked what the bank's patterns did had no answer but to count the inbox by hand. A record with the kit's card pattern,
 * one charge filed, the same charge again skipped as a repeat, and one text no pattern read. Every value is invented.
 */
async function banked() {
  const { ACCOUNTS, CARD, LEDGER, used } = await import('../../kernel/test/ingest-tail-kit.test.ts');
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const k = api.kernel;
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([ACCOUNTS, LEDGER, CARD({ description: 'Card texts', dedupe: ['amount', 'account'] })])).ok);
  assert.ok(k.create('accounts', { name: 'Credit Card', kind: 'card', last4: '1234', balance: { amount: 0, currency: 'EGP' } }, { actor: 'p_1' }).ok);
  clock.advance(60 * 60_000);
  for (const [n, body] of [used('1234', 'Corner Shop', '120.00', '23/09/2026'), used('1234', 'Corner Shop', '120.00', '24/09/2026'), 'Your OTP is 551234.'].entries())
    assert.ok(k.arrive({ channel: 'webhook', ingest: 'bank-sms', body, sha256: `p${n}`, verified: true }).ok);
  return { sql, api };
}

type Report = { days: number; doors: { said: string; unread: number; patterns: { said: string; filed: number; waiting: number; skipped: { reason: string; n: number }[] }[] }[] };

test('braindog:inbox/patterns SAYS WHAT EACH PATTERN DID, by its name, and never as an inbox state', async () => {
  const { sql, api } = await banked();
  const report = contents(await readOver(api, 'braindog:inbox/patterns', owner)) as Report;
  assert.equal(report.days, 14);
  const [door] = report.doors;
  assert.deepEqual([door!.said, door!.unread], ['Card texts', 1]);
  const [card] = door!.patterns;
  assert.deepEqual([card!.said, card!.filed, card!.waiting], ['Card texts', 1, 0]);
  assert.deepEqual(card!.skipped, [{ reason: 'Looks like a repeat of Corner Shop, EGP 120.00, 23 Sep.', n: 1 }]);
  assert.doesNotMatch(JSON.stringify(report.doors.map((d) => [d.said, d.patterns.map((p) => [p.said, p.skipped])])), /bank-sms|#\d/u);
  sql.close();
});

test('braindog:inbox/patterns IS THE INBOX’S TO GIVE: listed to its readers, refused to others in the record’s words', async () => {
  const { sql, api } = await banked();
  const reach: CallContext = { ...agent, principal: { kind: 'token', id: 'tok_2', scope: 'propose', person: 'p_1', level: 'owner', reach: ['inbox'] } };
  const direct = await api.inboxPatterns({}, agent);
  assert.ok(!direct.ok && 'refusal' in direct);
  const no = refusalOf(await readOver(api, 'braindog:inbox/patterns', agent));
  assert.deepEqual([no.code, no.fix], ['FORBIDDEN', direct.refusal.fix], 'the tool layer wrote a sentence of its own');
  const mcp = tools(api);
  const listed = async (ctx: CallContext) => (await mcp.resources(ctx)).some((r) => r.uri === 'braindog:inbox/patterns');
  assert.equal(await listed(agent), false, 'listed to a caller it refuses');
  assert.equal(await listed(owner), true, 'not listed to the owner');
  assert.equal(await listed(reach), true, 'not listed to a token its owner gave the inbox');
  sql.close();
});

test('A SURFACE WITHOUT THE REPORT SAYS SO, and one with it is asked it and not the inbox', async () => {
  const bare = await tools(stub().surface).read('braindog:inbox/patterns', { who: 'agent' });
  assert.equal(bare.ok ? null : 'refusal' in bare ? bare.refusal.code : null, 'NOT_IN_THIS_BUILD');
  const { surface } = stub({
    inbox: async (args) => ({ ok: true, value: { from: 'inbox', args } }),
    inboxPatterns: async (args) => ({ ok: true, value: { from: 'inboxPatterns', args } }),
  });
  const relayed = await tools(surface).read('braindog:inbox/patterns', { who: 'agent' });
  assert.deepEqual((relayed as { value: unknown }).value, { from: 'inboxPatterns', args: {} });
  assert.equal(TOOLS.some((t) => t.name.includes('pattern')), false, 'the report became a tool');
});

test('braindog:inbox/patterns ANSWERS A RECORD WITH NO PATTERN: no doors, and a door per channel once texts arrive', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.deepEqual((contents(await readOver(api, 'braindog:inbox/patterns', owner)) as Report).doors, []);
  assert.ok(api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK' }, body: 'Body 1', sha256: 'f1' }).ok);
  const [door] = (contents(await readOver(api, 'braindog:inbox/patterns', owner)) as Report).doors;
  assert.deepEqual([door!.patterns, door!.unread], [[], 1], 'a text no pattern read is counted, not lost');
  assert.doesNotMatch(door!.said, /webhook/u, 'the door is said by its name');
  /* AND HELD TO PART OF THE RECORD, A TOKEN WITH THE INBOX IS STILL REFUSED. */
  const part: CallContext = { principal: { kind: 'token', id: 'tok_3', scope: 'read', person: 'p_1', level: 'owner', reach: ['inbox'] }, registers: ['tasks'] };
  assert.equal(refusalOf(await readOver(api, 'braindog:inbox/patterns', part)).code, 'FORBIDDEN');
  sql.close();
});
