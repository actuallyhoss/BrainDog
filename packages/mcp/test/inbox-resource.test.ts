/**
 * The inbox as a resource: `braindog:inbox` and `braindog:inbox/{state}`.
 *
 * WHAT WAS MEASURED BEFORE ANY OF THIS. `resources/read braindog:inbox` answered `ROUTE_UNKNOWN` over the wire, and MCP
 * had no inbox verb at all. The tool list is at its ceiling (`budget.test.ts`), and a resource costs it nothing, so the
 * inbox is two addresses and no tool.
 *
 * THE TOOL LAYER DECIDES NOTHING. Who may read the inbox is the record's call: the owner, and a token its owner gave the
 * `inbox` reach. An agent asking without it is answered with the record's own sentence, word for word, and the address is
 * not listed to a caller it would refuse.
 *
 * THREE READS AT ONE ADDRESS (AGT-B13 job 4): `braindog:inbox` is the digest, one line of counts and each state's lines,
 * held to the answer's limit; `braindog:inbox/<state>` is that state's hundred; an arrival's id in place of the state is
 * that arrival whole. Each is said as lines, a body cut to 180 characters and marked where it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { arrivalWhole } from '../src/brief.ts';
import { ANSWER_MOST, TEMPLATES, TOOLS, tools } from '../src/index.ts';
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

type Lines = { inbox: string[] };
/** A line's words without the arrival's id that ends it. */
const words = (line: string): string => line.replace(/ · [0-9A-HJKMNP-TV-Z]{26}$/u, '');

test('resources/read braindog:inbox ANSWERS EVERY STATE: the counts line, then each state newest first', async () => {
  const { sql, api } = await record();
  const { inbox } = contents(await readOver(api, 'braindog:inbox', owner)) as Lines;
  assert.deepEqual(inbox.map(words), [
    '2 waiting · 0 to review · 0 asked on Decide · 1 skipped · 0 filed · 0 archived',
    'Waiting: 2',
    '24 Sep · BANK · Text 3: Body 3',
    '24 Sep · BANK · Text 1: Body 1',
    'Skipped: 1',
    '24 Sep · BANK · Text 2: Body 2',
  ]);
  sql.close();
});

test('braindog:inbox/skipped ANSWERS WHAT WAS SKIPPED, which is where a wrong skip pattern shows', async () => {
  const { sql, api } = await record();
  const { inbox } = contents(await readOver(api, 'braindog:inbox/skipped', owner)) as Lines;
  assert.deepEqual(inbox.slice(1).map(words), ['Skipped: 1', '24 Sep · BANK · Text 2: Body 2']);
  const all = (contents(await readOver(api, 'braindog:inbox/all', owner)) as Lines).inbox;
  assert.deepEqual(all.slice(1).map(words), ['Every state: 3', '24 Sep · BANK · Text 3: Body 3 · Waiting', '24 Sep · BANK · Text 2: Body 2 · Skipped', '24 Sep · BANK · Text 1: Body 1 · Waiting']);
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
  const [one] = (await api.inbox({ state: 'all' }, owner) as { value: { arrivals: { id: string }[] } }).value.arrivals;
  for (const uri of ['braindog:inbox', 'braindog:inbox/skipped', `braindog:inbox/${one!.id}`]) {
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
  const { surface } = stub({ inbox: async (args) => ({ ok: true, value: { cursor: null, counts: {}, args } }) });
  const relayed = await tools(surface).read('braindog:inbox/review', { who: 'agent' });
  assert.deepEqual((relayed as { value: { args: unknown } }).value.args, { state: 'review', limit: 100 }, 'the state went through with its hundred');
  const plain = await tools(surface).read('braindog:inbox', { who: 'agent' });
  assert.deepEqual((plain as { value: { args: unknown } }).value.args, { digest: true }, 'the bare address asks for the digest');
  assert.equal(TOOLS.some((t) => t.name.includes('inbox')), false, 'the inbox became a tool');
});

/* ── braindog:inbox/patterns, what each pattern did (REC-A03 step 5) ─────────────────────────────────────────────── */

/**
 * BEFORE: the address fell through to `inbox({ state: 'patterns' })` and was answered "state is one of ...", so an agent
 * asked what the bank's patterns did had no answer but to count the inbox by hand. A record with the kit's card pattern,
 * one charge filed, the same charge again skipped as a repeat, and one text no pattern read. Every value is invented.
 */
async function banked() {
  const { ACCOUNTS, CARD, LEDGER, used } = await import('../../kernel/test/ingest-tail-kit.ts');
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

/* ── The digest, one state's hundred, and one arrival whole (AGT-B13 job 4) ─────────────────────────────────────── */

/** A record holding `n` arrivals in each state named, every body `body` long. Every value is invented. */
async function filled(per: Partial<Record<string, number>>, body = (n: number) => `Body ${String(n)}`) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  let n = 0;
  for (const [state, count] of Object.entries(per))
    for (let i = 0; i < (count ?? 0); i++) {
      n += 1;
      clock.advance(60_000);
      const out = api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK' }, body: body(n), sha256: `f${String(n)}` });
      assert.ok(out.ok, JSON.stringify(out));
      sql.exec('UPDATE inbox_raw SET state = ? WHERE id = ?', state, out.value.raw);
    }
  return { sql, api };
}
const linesOf = async (api: Parameters<typeof readOver>[0], uri: string, ctx: unknown = owner): Promise<string[]> =>
  (contents(await readOver(api, uri, ctx)) as Lines).inbox;
const ID_LAST = / · [0-9A-HJKMNP-TV-Z]{26}$/u;

test('THE DIGEST COUNTS ALL SIX STATES ON ONE LINE, and says what waits before what was settled', async () => {
  const { sql, api } = await filled({ ignored: 1, matched: 2, skipped: 1, proposed: 1, review: 1, untriaged: 3 });
  const inbox = await linesOf(api, 'braindog:inbox');
  assert.equal(inbox[0], '3 waiting · 1 to review · 1 asked on Decide · 1 skipped · 2 filed · 1 archived');
  const heads = inbox.filter((l) => !ID_LAST.test(l)).slice(1);
  assert.deepEqual(heads, ['Waiting: 3', 'To review: 1', 'Asked on Decide: 1', 'Skipped: 1', 'Filed: 2', 'Archived: 1']);
  /* NEWEST FIRST WITHIN A STATE, and every line ends in its arrival's id and says no other. */
  const waiting = inbox.slice(2, 5).map(words);
  assert.deepEqual(waiting, ['24 Sep · BANK · Body 9', '24 Sep · BANK · Body 8', '24 Sep · BANK · Body 7']);
  for (const line of inbox) assert.doesNotMatch(words(line), /[0-9A-HJKMNP-TV-Z]{26}|rec_|p_1/u, line);
  sql.close();
});

test('A BODY PAST 180 CHARACTERS IS MARKED AS CUT, and one of exactly 180 is not', async () => {
  const long = 'a'.repeat(179) + 'Zand more';
  const { sql, api } = await filled({ untriaged: 2 }, (n) => (n === 1 ? 'b'.repeat(180) : long));
  const inbox = await linesOf(api, 'braindog:inbox');
  assert.equal(words(inbox[2]!), `24 Sep · BANK · ${'a'.repeat(179)}Z... (cut)`);
  assert.equal(words(inbox[3]!), `24 Sep · BANK · ${'b'.repeat(180)}`);
  assert.match(inbox.at(-1)!, /was cut: read braindog:inbox\/<its id> for that arrival whole/u);
  sql.close();
});

test('250 ARRIVALS PASS THE LIMIT, so every state keeps its ten newest and names its own address', async () => {
  const { sql, api } = await filled({ untriaged: 120, review: 50, skipped: 60, matched: 20 }, (n) => `Card used ${String(n)} `.repeat(30));
  const reply = await readOver(api, 'braindog:inbox', owner);
  assert.ok('result' in reply);
  const text = (reply.result as { contents: { text: string }[] }).contents[0]!.text;
  assert.ok(text.length <= ANSWER_MOST, `the digest was ${String(text.length)} characters`);
  const inbox = (JSON.parse(text) as Lines).inbox;
  assert.equal(inbox[0], '120 waiting · 50 to review · 0 asked on Decide · 60 skipped · 20 filed · 0 archived');
  assert.deepEqual(inbox.filter((l) => !ID_LAST.test(l)).slice(1, 5), [
    'Waiting: the newest 10 of 120, and braindog:inbox/untriaged reads the newest 100',
    'To review: the newest 10 of 50, and braindog:inbox/review reads the newest 50',
    'Skipped: the newest 10 of 60, and braindog:inbox/skipped reads the newest 60',
    'Filed: the newest 10 of 20, and braindog:inbox/matched reads the newest 20',
  ]);
  assert.equal(inbox.filter((l) => ID_LAST.test(l)).length, 40);

  /* ONE STATE IS ITS HUNDRED, newest first, and fits too. */
  const waiting = await linesOf(api, 'braindog:inbox/untriaged');
  assert.equal(waiting[1], 'Waiting: the newest 100 of 120');
  assert.equal(waiting.filter((l) => ID_LAST.test(l)).length, 100);
  assert.match(words(waiting[2]!), /^24 Sep · BANK · Card used 120 /u);
  sql.close();
});

test("AN ARRIVAL'S ID IN PLACE OF THE STATE ANSWERS IT WHOLE, by names, and an id that is none is the record's refusal", async () => {
  const long = `${'Your card ending 1234 was used. '.repeat(12)}End.`;
  const { sql, api } = await filled({ skipped: 1 }, () => long);
  const [line] = (await linesOf(api, 'braindog:inbox')).filter((l) => ID_LAST.test(l));
  const id = line!.slice(-26);
  sql.exec("UPDATE inbox_raw SET reason = 'Matched the skip pattern for card texts.' WHERE id = ?", id);
  const { arrival } = contents(await readOver(api, `braindog:inbox/${id}`, owner)) as { arrival: string[] };
  assert.deepEqual(arrival, [`From BANK · ${id}`, 'Arrived 24 Sep at 09:01 UTC', 'Skipped: Matched the skip pattern for card texts.', long]);
  assert.ok(TEMPLATES.find((t) => t.uriTemplate === 'braindog:inbox/{state}')!.description.includes('id'), 'the template does not say it takes an id');

  const none = refusalOf(await readOver(api, 'braindog:inbox/01JZ8QK3F7R2M9V4XN6TCB5HAE', owner));
  assert.deepEqual([none.code, none.fix], ['OUT_OF_BOUNDS', 'There is no arrival with that id in this inbox.']);
  sql.close();
});

test('A TOKEN WITH THE INBOX READS ALL THREE, and one without is told what it lacks in the record’s own sentence', async () => {
  const { sql, api } = await filled({ untriaged: 1 });
  const reach: CallContext = { ...agent, principal: { kind: 'token', id: 'tok_2', scope: 'propose', person: 'p_1', level: 'owner', reach: ['inbox'] } };
  const inbox = await linesOf(api, 'braindog:inbox', reach);
  assert.equal(inbox[1], 'Waiting: 1');
  const id = inbox[2]!.slice(-26);
  assert.equal((await linesOf(api, 'braindog:inbox/untriaged', reach))[1], 'Waiting: 1');
  assert.equal((contents(await readOver(api, `braindog:inbox/${id}`, reach)) as { arrival: string[] }).arrival[0], `From BANK · ${id}`);

  const direct = await api.inbox({ digest: true }, agent);
  assert.ok(!direct.ok && 'refusal' in direct);
  assert.match(direct.refusal.fix, /braindog token create --inbox/u);
  for (const uri of ['braindog:inbox', 'braindog:inbox/untriaged', `braindog:inbox/${id}`])
    assert.deepEqual(Object.values(refusalOf(await readOver(api, uri, agent))).slice(0, 2), ['FORBIDDEN', direct.refusal.fix], uri);
  sql.close();
});

test('A RECORD THAT ANSWERS NO DIGEST IS READ AS TODAY, and one that cannot read an arrival by id says so', async () => {
  const asked: unknown[] = [];
  const { surface } = stub({
    inbox: async (args) => {
      asked.push(args);
      if ((args as { digest?: boolean }).digest === true) return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'digest is not something inbox takes.', at: 'digest' } };
      if ((args as { id?: string }).id !== undefined) return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'id is not something inbox takes.', at: 'id' } };
      return { ok: true, value: { arrivals: [], cursor: null, counts: { untriaged: 0 } } };
    },
  });
  const plain = await tools(surface).read('braindog:inbox', { who: 'agent' });
  assert.deepEqual(plain, { ok: true, value: { arrivals: [], cursor: null, counts: { untriaged: 0 } } }, 'the old page, as it came');
  assert.deepEqual(asked, [{ digest: true }, {}]);
  const one = await tools(surface).read('braindog:inbox/01JZ8QK3F7R2M9V4XN6TCB5HAE', { who: 'agent' });
  assert.equal(one.ok ? null : 'refusal' in one ? one.refusal.code : null, 'NOT_IN_THIS_BUILD');
});

test('A FILED ARRIVAL SAYS WHAT BECAME OF IT: by a person or an agent, never their id, with the version triage takes back', () => {
  const at = '2026-09-24T09:00:00.000Z';
  const filed = arrivalWhole(
    { id: '01JZ8QK3F7R2M9V4XN6TCB5HAD', ts: at, from: 'BANK', to: '', subject: '', body: 'Paid.', state: 'matched', reason: null, settled: { by: 'p_1', at, row: { id: '01JZ8QK3F7R2M9V4XN6TCB5HAF', register: 'ledger', seq: 12, version: 3, archived: false } } },
    NOW,
  );
  assert.deepEqual(filed.slice(2), ['Filed', 'Filed by a person on 24 Sep, as version 3 of an entry in ledger (ledger#12)', 'Paid.']);
  const ran = arrivalWhole({ id: 'x', ts: at, from: 'BANK', body: null, state: 'ignored', settled: { by: 'run_01JZ8QK3F7R2M9V4XN6TCB5HAG', at, row: null } }, NOW);
  assert.deepEqual(ran.slice(-2), ['Archived by an agent on 24 Sep', 'Its body is not kept.']);
  assert.doesNotMatch(JSON.stringify([filed.slice(1), ran.slice(1)]), /p_1|run_|HAF|HAG/u);
  /* A BODY PAST WHAT ONE ANSWER CARRIES IS CUT THERE, and says so. */
  const big = arrivalWhole({ id: 'x', ts: at, from: 'BANK', body: 'x'.repeat(50), state: 'untriaged' }, NOW, 20);
  assert.deepEqual(big.slice(-2), ['x'.repeat(20), 'The body is 50 characters, past what one answer carries, so it was cut at 20.']);
});
