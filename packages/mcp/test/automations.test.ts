/**
 * Automations, edited by an agent over MCP and by a person on a canvas, one definition (`loop/research-shell-automations.md`
 * section 5 and Brief D, `loop/DIRECTION.md` section 22).
 *
 * WHAT WAS MEASURED BEFORE ANY OF THIS. The runner had landed (94ba1ad8, 48b55fc5) and nothing outside the kernel could
 * see it: `resources/read braindog:automation/chase` answered `ROUTE_UNKNOWN` over the wire, a `propose` of a rule change
 * answered `{ id }` and nothing about what the rule would do, and `automations`, `automationRun` and `cancelRun` were in
 * no route table, so the kernel's own `automationRun` was reachable from a test and from nothing a person could press.
 * Each test below failed on its first assertion about one of those.
 *
 * NO TOOL IS ADDED. The reads are resources, which cost the tool list nothing, and the dry run rides on `propose`'s answer.
 * `budget.test.ts` measures the list, and the last test here says the list of tool names did not move.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';
import { SAID_DEPTH } from '../../record/src/automations.ts';

import { TOOLS, TEMPLATES, tools, ttlOf } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { ROUTES, handlersFor, serveApi } from '../../host/src/index.ts';
import { createClient } from '../../client/src/index.ts';
import { DEPTH_CEILING, RUNS_PER_DAY_CEILING, STEP_CEILING, VARS_CEILING, pathOf, triggerOf } from '../../kernel/src/flow-lint.ts';
import { FLOOR_MS } from '../../kernel/src/pull.ts';
import { ASK_PERSON_WAIT } from '../../kernel/src/flow.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'kiln', agent: 'claude' },
};
/** A colleague invited to `notes` alone. She reads nothing about a list she was not given, nor a rule with no row. */
const colleague: CallContext = { principal: { kind: 'person', id: 'p_2', level: null }, levels: { notes: 'read' } };

const register = (id: string, fields: { id: string; type: string; required?: boolean; values?: string[] }[], state?: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name: id, title: fields[0]!.id, ...(state ? { state } : {}), fields } as never,
});
const rule = (body: Record<string, unknown>) => ({ id: `rule.${body.rule as string}`, kind: 'rule' as const, body: body as never });

const CHASE = {
  rule: 'chase',
  name: 'Chase a late bill',
  on: { manual: true },
  steps: [{ set_var: { name: 'who', to: 'the owner' } }, { wait: '1h' }, { notify: { say: 'Chase {{vars.who}}' } }],
};
const TICK = { rule: 'tick', on: { every: '1h' }, steps: [{ notify: { say: 'Look at the rate.' } }] };
const TAGGER = { rule: 'tagger', register: 'obligations', when: 'state is open', then: [{ tag: 'open' }] };
const JOTTER = { rule: 'jotter', register: 'notes', then: [{ tag: 'seen' }] };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const installed = await api.kernel.install([
    register('obligations', [{ id: 'what', type: 'text', required: true }, { id: 'state', type: 'enum', values: ['open', 'paid'] }], 'state'),
    register('notes', [{ id: 'what', type: 'text', required: true }]),
    rule(CHASE),
    rule(TICK),
    rule(TAGGER),
    rule(JOTTER),
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { sql, api, mcp: tools(api) };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, JSON.stringify(x));
  return x.value as T;
};
const refusal = (r: unknown): { code: string; fix: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(x.ok, false, JSON.stringify(x));
  return x.refusal!;
};

/** One `resources/read` over the same `handle` stdio and HTTP serve. */
async function readOver(surface: Parameters<typeof handle>[1], uri: string, ctx: unknown): Promise<Reply> {
  return (await handle({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri } }, surface, ctx)) as Reply;
}
const contents = (reply: Reply): unknown => {
  assert.ok('result' in reply, JSON.stringify(reply));
  return JSON.parse((reply.result as { contents: { text: string }[] }).contents[0]!.text);
};

type RunView = { id: string; state: string; trigger: string; actor: string; say: string | null; steps: { n: number; kind: string; state: string; answer: string | null }[] };
type One = { id: string; rule: string; name: string; trigger: string; path: string; enabled: boolean; open: number; body: unknown; runs: RunView[] };
type Row = { id: string; trigger: string; path: string; register: string | null; next: string | null; open: number; last: { state: string } | null; month: { runs: number } };

/* ── the red the brief asked for ───────────────────────────────────────── */

test('resources/read braindog:automation/chase ANSWERS THE DEFINITION AND ITS RUNS, each step with its outcome', async () => {
  const { sql, api } = await record();
  const { run } = value<{ run: string }>(api.kernel.automationRun('chase', 'p_1'));
  await api.kernel.drain();

  const one = contents(await readOver(api, 'braindog:automation/chase', agent)) as One;
  assert.equal(one.id, 'rule.chase');
  assert.equal(one.name, 'Chase a late bill');
  assert.equal(one.trigger, 'manual');
  assert.equal(one.path, 'run');
  assert.equal(one.enabled, true);
  assert.equal(one.open, 1, 'a run parked on its wait is still open');
  assert.deepEqual(one.body, CHASE);
  assert.equal(one.runs.length, 1);
  const [only] = one.runs;
  assert.equal(only!.id, run);
  assert.equal(only!.state, 'waiting');
  assert.equal(only!.trigger, 'manual');
  assert.equal(only!.actor, 'p_1');
  assert.deepEqual(
    only!.steps.map((s) => [s.n, s.kind, s.state, s.answer]),
    [
      [0, 'set_var', 'done', 'the owner'],
      [1, 'wait', 'waiting', null],
    ],
  );
  assert.equal(ttlOf('braindog:automation/chase'), 60_000);

  /* AND ONE THAT IS NOT THERE IS SAID TO BE NOT THERE, in the record's words, over the same wire. */
  const none = await readOver(api, 'braindog:automation/nobody', agent);
  assert.ok('error' in none);
  assert.equal((none.error.data as { refusal: { code: string } }).refusal.code, 'DECLARATION_UNKNOWN');
  assert.ok(TEMPLATES.some((t) => t.uriTemplate === 'braindog:automation/{id}'), 'the address is not advertised as a template');
  sql.close();
});

test('A PROPOSE OF A RULE CHANGE ANSWERS WITH ITS DRY RUN: what would start it and what each step would do, and nothing is written', async () => {
  const { sql, mcp } = await record();
  const body = {
    rule: 'nightly',
    name: 'Nightly look',
    on: { every: '1d', at: '08:00' },
    steps: [
      { set_var: { name: 'mood', to: 'calm' } },
      { if: 'mood is calm', then: [{ notify: { say: 'All quiet.' } }], else: [{ notify: { say: 'Look now.' } }] },
      { wait: '2h' },
      { ask_person: { question: 'Pay the rent today?', options: ['yes', 'no'], as: 'pay' } },
    ],
  };
  const before = {
    runs: sql.one<{ n: number }>('SELECT count(*) AS n FROM automation_run')!.n,
    schedule: sql.one<{ n: number }>('SELECT count(*) AS n FROM schedule')!.n,
    declarations: sql.one<{ n: number }>('SELECT count(*) AS n FROM declaration')!.n,
  };

  const out = value<{ id: string; dry_run: { path: string; trigger: string; steps: string[] } }>(
    await mcp.call('propose', { question: 'Add a nightly look?', body_kind: 'change', body: { to: { id: 'rule.nightly', kind: 'rule', body } } }, agent),
  );
  assert.match(out.id, /^SG\d+$/);
  assert.ok(out.dry_run, `the answer carries no dry run: ${JSON.stringify(out)}`);
  assert.equal(out.dry_run.path, 'run');
  assert.match(out.dry_run.trigger, /every 1d at 08:00/i);
  assert.deepEqual(out.dry_run.steps, [
    'Keep "calm" as mood.',
    'If mood is calm:',
    '  Tell the owner: All quiet.',
    'Otherwise:',
    '  Tell the owner: Look now.',
    'Wait 2h.',
    'Ask in Decide "Pay the rent today?", yes or no, and keep the answer as pay. If nobody answers within 7d, the run stops here.',
  ]);

  assert.deepEqual(
    {
      runs: sql.one<{ n: number }>('SELECT count(*) AS n FROM automation_run')!.n,
      schedule: sql.one<{ n: number }>('SELECT count(*) AS n FROM schedule')!.n,
      declarations: sql.one<{ n: number }>('SELECT count(*) AS n FROM declaration')!.n,
    },
    before,
    'a dry run wrote something',
  );
  sql.close();
});

test('AN INLINE RULE CHANGE CARRIES THE ROWS IT WOULD TOUCH, as the kernel previews them, beside the same two sentences', async () => {
  const { sql, api, mcp } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Rent', state: 'paid' } }, owner));
  value(await api.create({ register: 'obligations', fields: { what: 'Water', state: 'open' } }, owner));
  const body = { rule: 'flagger', register: 'obligations', when: 'state is paid', then: [{ tag: 'flagged' }] };
  const out = value<{ dry_run: { path: string; trigger: string; steps: string[]; matches: number; rows: number } }>(
    await mcp.call('propose', { question: 'Flag late bills?', body_kind: 'change', body: { to: { id: 'rule.flagger', kind: 'rule', body } } }, agent),
  );
  assert.equal(out.dry_run.path, 'inline');
  assert.equal(out.dry_run.rows, 2);
  assert.equal(out.dry_run.matches, 1);
  assert.match(out.dry_run.trigger, /obligations/);
  assert.deepEqual(out.dry_run.steps, ['Tag the row flagged.']);
  sql.close();
});

test('THE DRY RUN SAYS THE PATH THE KERNEL TAKES, for every shape of trigger, since the record carries a copy of the rule', async () => {
  const { sql, api } = await record();
  const bodies: Record<string, unknown>[] = [
    TAGGER,
    { ...TAGGER, on: 'create' },
    { rule: 'w1', on: { written: { register: 'obligations', op: ['create'] } }, steps: [{ tag: 'new' }] },
    { rule: 'w2', on: { written: { register: 'obligations', fields: ['what'] } }, then: [{ tag: 'renamed' }] },
    { rule: 'w3', register: 'obligations', on: { written: { register: 'obligations' } }, then: [{ tag: 'x' }] },
    { rule: 'a1', on: { arrival: { channel: 'webhook' } }, steps: [{ notify: { say: 'Arrived.' } }] },
    TICK,
    CHASE,
  ];
  for (const body of bodies) {
    const said = value<{ path: string; trigger: string }>(await api.dryRun({ rule: body as never }, owner));
    assert.equal(said.path, pathOf(body as never), JSON.stringify(body));
    const words: Record<string, RegExp> = { written: /a row of obligations/, every: /^Every 1h\./, manual: /Run now/, arrival: /arrives by webhook/ };
    assert.match(said.trigger, words[triggerOf(body as never)]!);
  }
  sql.close();
});

test('WHAT THE DRY RUN SAYS OF A STEP THAT WAITS ON SOMEBODY ELSE IS WHAT A REAL RUN DOES IN THIS BUILD', async () => {
  /* THE RECORD'S SENTENCE IS A COPY OF A FACT IN `flow.ts`, so it is held to a run of the real runner here. It went red
     the day Brief C built `ask_person`, as it said it would: the run read `waiting` where `failed` was expected. So an
     ask of a person is said as the question Decide shows and the wait the runner arms, and the grammar no longer lists
     it; a `call` still stops the run, and an ask of Spark, which no host answers yet, is refused at install. */
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const asks = { rule: 'asks', on: { manual: true }, steps: [{ ask_person: { question: 'Go?', options: ['yes', 'no'], as: 'go' } }] };
  value(await api.kernel.install([rule(asks)]));
  const said = value<{ steps: string[] }>(await api.dryRun({ rule: asks as never }, owner));
  assert.equal(said.steps[0], `Ask in Decide "Go?", yes or no, and keep the answer as go. If nobody answers within ${ASK_PERSON_WAIT}, the run stops here.`);
  const { run } = value<{ run: string }>(await api.automationRun({ rule: 'asks' }, owner));
  await api.kernel.drain();
  const row = sql.one<{ state: string; say: string | null }>('SELECT state, say FROM automation_run WHERE id = ?', run)!;
  assert.equal(row.state, 'waiting', row.say ?? '');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open' AND opened_by = 'rule:asks'")?.n, 1, 'no question was opened in Decide');

  const spark = { rule: 'spark', on: { manual: true }, steps: [{ ask_spark: { question: 'Go?', as: 'go' } }] };
  assert.match(value<{ steps: string[] }>(await api.dryRun({ rule: spark as never }, owner)).steps[0]!, /Not in this build: a rule with this step is refused at install/);
  assert.equal(refusal(await api.kernel.install([rule(spark)])).code, 'NOT_IN_THIS_BUILD');

  const grammar = value<{ not_in_this_build: { steps: string[] } }>(await tools(api).read('braindog:grammar/automations', owner));
  assert.equal(grammar.not_in_this_build.steps.includes('ask_person'), false);
  assert.ok(grammar.not_in_this_build.steps.includes('ask_spark'));
  sql.close();
});

test('A DRY RUN OF A BODY NESTED PAST ANY CEILING IS REFUSED, not a blown stack answered INTERNAL', async () => {
  /* `dryRun` is READ+ and runs before the lint, so a read token could send a body nested some 2,000 `if` levels deep
     and `stepLines` recursed until the stack gave out. Measured red first: RangeError, Maximum call stack size exceeded. */
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  let steps: unknown[] = [{ stop: true }];
  for (let i = 0; i < 20_000; i++) steps = [{ if: 'vars.go', then: steps }];
  const refused = refusal(await api.dryRun({ rule: { rule: 'deep', on: { manual: true }, steps } as never }, owner));
  assert.equal(refused.code, 'OUT_OF_BOUNDS');
  assert.ok(SAID_DEPTH > DEPTH_CEILING, 'the dry run must say every body the lint lets install');
  /* And a body the lint allows is still said in full, the deepest step included. */
  let allowed: unknown[] = [{ stop: true }];
  for (let i = 0; i < DEPTH_CEILING; i++) allowed = [{ if: 'vars.go', then: allowed }];
  const said = value<{ steps: string[] }>(await api.dryRun({ rule: { rule: 'ok', on: { manual: true }, steps: allowed } as never }, owner));
  assert.match(said.steps.at(-1)!, /Stop, and take no further step/);
  /* The record names an unknown automation with one full stop, however it was spelled. */
  assert.equal(refusal(await api.automations({ rule: 'rule.' }, owner)).fix, 'There is no automation called rule.');
  sql.close();
});

test('braindog:automations IS LISTED AND ANSWERS EVERY RULE, inline ones too, with what starts it, when it runs next and how its runs went', async () => {
  const { sql, api, mcp } = await record();
  value(api.kernel.automationRun('chase', 'p_1'));
  await api.kernel.drain();

  const listed = (await mcp.resources(owner)).find((r) => r.uri === 'braindog:automations');
  assert.ok(listed, 'braindog:automations is not listed');
  assert.equal(listed.ttlMs, 60_000);

  const rows = contents(await readOver(api, 'braindog:automations', agent)) as Row[];
  const by = new Map(rows.map((r) => [r.id, r]));
  assert.deepEqual([...by.keys()].sort(), ['rule.chase', 'rule.jotter', 'rule.tagger', 'rule.tick']);
  assert.deepEqual([by.get('rule.tagger')!.trigger, by.get('rule.tagger')!.path, by.get('rule.tagger')!.register], ['written', 'inline', 'obligations']);
  assert.deepEqual([by.get('rule.tick')!.trigger, by.get('rule.tick')!.path, by.get('rule.tick')!.next], ['every', 'run', new Date(NOW + HOUR).toISOString()]);
  assert.equal(by.get('rule.chase')!.open, 1);
  assert.equal(by.get('rule.chase')!.last?.state, 'waiting');
  assert.equal(by.get('rule.chase')!.month.runs, 1);
  assert.equal(by.get('rule.tagger')!.last, null);

  /* HELD TO WHAT THE CALLER MAY READ. A rule is about a list, and one with no row may write anywhere, so a colleague
     given `notes` sees the one rule about notes and is told nothing of the others, not even that they are there. */
  const hers = value<Row[]>(await api.automations(undefined, colleague));
  assert.deepEqual(hers.map((r) => r.id), ['rule.jotter']);
  assert.equal(refusal(await api.automations({ rule: 'chase' }, colleague)).code, 'DECLARATION_UNKNOWN');
  assert.equal(refusal(await api.automations({ rule: 'chase', extra: 1 } as never, owner)).code, 'FIELD_UNKNOWN');
  sql.close();
});

test('automationRun AND cancelRun ARE AN OWNER\'S IN A BROWSER, like installPack: a token is refused, and a button runs only a button rule', async () => {
  const { sql, api } = await record();
  assert.equal(refusal(await api.automationRun({ rule: 'chase' }, agent)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.automationRun({ rule: 'tick' }, owner)).code, 'DECLARATION_INVALID');
  assert.equal(refusal(await api.automationRun({} as never, owner)).code, 'REQUIRED_MISSING');

  const { run } = value<{ run: string }>(await api.automationRun({ rule: 'rule.chase' }, owner));
  await api.kernel.drain();
  assert.equal(refusal(await api.cancelRun({ run }, agent)).code, 'NEEDS_BROWSER_SESSION');
  assert.deepEqual(value(await api.cancelRun({ run }, owner)), { run, state: 'cancelled' });
  assert.equal(refusal(await api.cancelRun({ run }, owner)).code, 'TRANSITION_ILLEGAL');

  const one = value<One>(await api.automations({ rule: 'chase' }, owner));
  assert.equal(one.runs[0]!.state, 'cancelled');
  assert.equal(one.open, 0);
  sql.close();
});

test('THE THREE ARE ROUTED IN THE GROUPS THE BRIEF NAMES, served by both hosts\' one table, and typed in the client', async () => {
  const { sql, api } = await record();
  const group = (name: string) => ROUTES.find((r) => r.name === name);
  assert.deepEqual(
    ['automations', 'automationRun', 'cancelRun'].map((n) => [n, group(n)?.group, group(n)?.writes]),
    [
      ['automations', 'READ+', false],
      ['automationRun', 'ADMIN', true],
      ['cancelRun', 'ADMIN', true],
    ],
  );

  const handlers = handlersFor(api as never);
  let ctx: CallContext = owner;
  const seen: string[] = [];
  const client = createClient({
    base: 'https://dog.example.test',
    fetch: async (url, init) => {
      seen.push(`${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`);
      return serveApi(new Request(String(url), init), handlers, ctx);
    },
  });

  const listed = value<Row[]>(await client.automations());
  assert.ok(listed.some((r) => r.id === 'rule.chase'));
  assert.equal(value<One>(await client.automation('chase')).id, 'rule.chase');
  const { run } = value<{ run: string }>(await client.automationRun('chase'));
  assert.deepEqual(value(await client.cancelRun(run)), { run, state: 'cancelled' });
  assert.deepEqual(seen, ['GET /api/automations', 'GET /api/automations', 'POST /api/automationRun', 'POST /api/cancelRun']);

  ctx = agent;
  const refused = await client.automationRun('chase');
  assert.equal(refusal(refused).code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});

/* ── the grammar ───────────────────────────────────────────────────────── */

type Grammar = { limits: Record<string, unknown>; examples: { id: string; kind: 'rule'; body: Record<string, unknown> }[]; not_in_this_build: { triggers: string[]; steps: string[] } };

test('braindog:grammar/automations IS LISTED FOR ANY CALLER WHO READS, and its numbers are the kernel\'s', async () => {
  const { sql, api, mcp } = await record();
  const listed = (await mcp.resources(agent)).find((r) => r.uri === 'braindog:grammar/automations');
  assert.ok(listed, 'not listed');
  assert.equal(listed.ttlMs, 3_600_000);
  const grammar = contents(await readOver(api, 'braindog:grammar/automations', agent)) as Grammar;
  assert.deepEqual(grammar.limits, {
    steps: STEP_CEILING,
    depth: DEPTH_CEILING,
    runs_per_day: RUNS_PER_DAY_CEILING,
    answers: VARS_CEILING,
    shortest_clock: `${FLOOR_MS / 60_000}m`,
  });
  assert.deepEqual(grammar.not_in_this_build, { triggers: ['metric', 'decided'], steps: ['call', 'script', 'ask_spark'] });

  /* A STUB ANSWERS IT TOO, since it is this package's own text asked of `version`, which every surface has. */
  assert.ok((await tools(stub().surface).resources({ who: 'agent' })).some((r) => r.uri === 'braindog:grammar/automations'));
  sql.close();
});

test('EVERY EXAMPLE IN THE GRAMMAR INSTALLS ON A REAL RECORD AND DRY-RUNS, so the text an agent copies is text that works', async () => {
  const { sql, api } = await record();
  const grammar = contents(await readOver(api, 'braindog:grammar/automations', agent)) as Grammar;
  assert.ok(grammar.examples.length >= 2);
  for (const example of grammar.examples) {
    const put = await api.kernel.install([example as never]);
    assert.ok(put.ok, `${example.id}: ${JSON.stringify(put)}`);
    value(await api.dryRun({ rule: example.body as never }, owner));
  }
  sql.close();
});

test('THE GRAMMAR\'S ask_person STEP INSTALLS AS WRITTEN, so an agent copying it is not refused', async () => {
  /* IT CARRIED `"to":"<person>"`, which the lint refuses as not in this build, and no test installed it: the examples
     above are whole rules and this is one step. Measured red first: NOT_IN_THIS_BUILD at steps[0].ask_person.to. */
  const { sql, api } = await record();
  const grammar = contents(await readOver(api, 'braindog:grammar/automations', agent)) as { steps: Record<string, string> };
  const written = grammar.steps.ask_person!;
  const step = JSON.parse(written.slice(0, written.lastIndexOf('}}') + 2).replace(/<[a-z]+>/g, 'x')) as Record<string, unknown>;
  const put = await api.kernel.install([rule({ rule: 'asks', on: { manual: true }, steps: [step] })]);
  assert.ok(put.ok, JSON.stringify(put));
  sql.close();
});

/* ── and what it cost ──────────────────────────────────────────────────── */

test('NO TOOL WAS ADDED: the sixteen are the sixteen, and the reads are resources', () => {
  assert.equal(TOOLS.length, 16);
  for (const name of ['automations', 'automation', 'dry_run', 'automationRun', 'cancelRun']) assert.equal(TOOLS.some((t) => t.name === name), false, name);
});
