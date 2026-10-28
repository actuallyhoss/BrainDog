/**
 * The agent door's list of resources from one read: `resources()` over the record's `offered`.
 *
 * WHAT WAS SLOW. `resources/list` read every fixed address in full to learn whether to list it, then drew every page to
 * find its figures: 8 seconds on the owner's record of 54 pages, at every session start. With `offered` the record says
 * what each reader would let the caller see, and the door reads no address the record decides and draws no page.
 *
 * THE TEST THAT MATTERS IS THE SAME LIST BOTH WAYS. A real record is listed through `offered` and through the old path
 * for four callers, and the two lists must be one: the sign of a drift is an address listed one way and not the other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';
import type { Result } from '@braindog/ports';

import { OFFERED_DECIDES, tools, type McpSurface } from '../src/index.ts';
import { handle, LISTED_MOST, type Reply } from '../src/rpc.ts';
import { FIXED_ADDRESSES } from '../../record/src/methods/offered.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub, type Ctx } from './stub.ts';

const NOW = Date.UTC(2026, 9, 14, 9);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const token = (reach?: string[]) =>
  ({ principal: { kind: 'token', id: reach ? 'tok_in' : 'tok_out', scope: 'read', person: 'p_1', level: 'owner', ...(reach ? { reach } : {}) } }) as unknown as CallContext;
const withInbox = token(['inbox']);
const withoutInbox = token();
/** A member held to Tasks and nothing else. */
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['tasks'] };
const CALLERS = [
  ['the owner', owner],
  ['a key with the inbox reach', withInbox],
  ['a key without it', withoutInbox],
  ['a member held to Tasks', member],
] as const;

const reg = (id: string, name: string, title: string, fields: unknown[], extra: Record<string, unknown> = {}) =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields, ...extra } }) as never;
const page = (slug: string, title: string, list: string) =>
  ({
    id: `page.${slug}`,
    kind: 'page',
    body: { page: slug, title, requires: [`register.${list}`], blocks: [{ kind: 'table', source: `register.${list}`, empty: 'None.' }] },
  }) as never;
const figure = (id: string, name: string, list: string, field: string) =>
  ({
    id: `metric.${id}`,
    kind: 'metric',
    body: { metric: id, name, source: `register.${list}`, value: { sum: field }, format: 'int', window: '30d', target: { gte: 0 }, compare: 'none' },
  }) as never;

/** Two lists, a page and a figure over each, and skills: one kept twice by name, one with no trigger, one retired. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const installed = await api.kernel.install([
    reg('tasks', 'Tasks', 'what', [{ id: 'what', type: 'text', required: true }, { id: 'points', type: 'int' }]),
    reg('payroll', 'Payroll', 'who', [{ id: 'who', type: 'text', required: true }, { id: 'pay', type: 'int' }]),
    reg(
      'skills',
      'Skills',
      'name',
      [
        { id: 'name', type: 'text', required: true },
        { id: 'trigger', type: 'text' },
        { id: 'body', type: 'text' },
        { id: 'stage', type: 'enum', values: ['live', 'retired'], default: 'live' },
      ],
      { state: 'stage' },
    ),
    figure('points-done', 'Points done', 'tasks', 'points'),
    figure('pay-out', 'Pay out', 'payroll', 'pay'),
    page('work', 'Work', 'tasks'),
    page('pay', 'Payroll, monthly', 'payroll'),
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const make = (list: string, fields: Record<string, string | number>) => assert.ok(api.kernel.create(list, fields, { actor: 'p_1' }).ok);
  make('tasks', { what: 'Glaze the jars', points: 3 });
  make('payroll', { who: 'Nadia', pay: 4000 });
  make('skills', { name: 'review-pr', trigger: 'Before merging a branch.', body: '# Review' });
  make('skills', { name: 'review-pr', trigger: 'Before merging a Kiln branch.', body: '# Review, for Kiln' });
  make('skills', { name: 'reconcile-invoice', body: '# Reconcile an invoice' });
  make('skills', { name: 'chase-invoice', trigger: 'When an invoice is 30 days late.', body: '# Chase', stage: 'retired' });
  return { sql, api };
}

/** The same record with no `offered`, so the door takes the old path over it. Every other method is the record's. */
const without = <T extends object>(api: T): T => {
  const old = Object.create(api) as T;
  (old as { offered?: unknown }).offered = undefined;
  return old;
};
const uris = async (surface: McpSurface<CallContext>, ctx: CallContext) => (await tools(surface).resources(ctx)).map((r) => r.uri);

/** What a stand-in `offered` answers: every address it decides, one list, one page, two figures and two skills. */
const OFFER = {
  fixed: [...FIXED_ADDRESSES],
  lists: [{ id: 'tasks', name: 'Tasks' }],
  pages: [{ slug: 'work', title: 'Work' }],
  figures: [
    { id: 'points-done', name: 'Points done', param: false },
    { id: 'project-owed', name: 'What one project is owed', param: true },
  ],
  skills: [
    { name: 'review-pr', when: 'Before merging a branch.' },
    { name: 'reconcile-invoice', when: null },
  ],
};
const offering = (value: unknown = OFFER) => {
  const made = stub({});
  const surface: McpSurface<Ctx> = {
    ...made.surface,
    offered: async (ctx: Ctx): Promise<Result<unknown>> => {
      made.calls.push({ method: 'offered', args: undefined, ctx });
      return { ok: true, value };
    },
  };
  return { surface, calls: made.calls };
};

test('THE DOOR DECIDES THE ADDRESSES THE RECORD DECIDES, no more and no fewer', () => {
  assert.deepEqual([...OFFERED_DECIDES].sort(), [...FIXED_ADDRESSES].sort());
});

test('ONE CALL TO offered, AND NO READ OF ANY RESOURCE: nothing drawn, no figure read, no list of skills read', async () => {
  const { surface, calls } = offering();
  const listed = (await tools(surface).resources({ who: 'agent' })).map((r) => r.uri);
  assert.deepEqual(calls.map((c) => c.method), ['offered'], 'the door read something to make the list');
  assert.ok(listed.includes('braindog:whoami') && listed.includes('braindog:context') && listed.includes('braindog:grammar/script'));
  /* WHAT THIS SURFACE CANNOT SERVE IS NOT LISTED, whoever may read it: the stand-in has no inbox, no arrangement, no preview. */
  for (const gone of ['braindog:inbox', 'braindog:inbox/patterns', 'braindog:arrangement', 'braindog:grammar/page', 'braindog:handoffs', 'braindog:automations'])
    assert.equal(listed.includes(gone), false, `${gone} is listed by a surface that cannot read it`);
  assert.deepEqual(
    listed.filter((u) => /^braindog:(schema|page|metric|skill)\//u.test(u)),
    ['braindog:schema/tasks', 'braindog:page/work', 'braindog:metric/points-done', 'braindog:skill/review-pr', 'braindog:skill/reconcile-invoice'],
    'a figure read about one thing is a template, and is not listed bare',
  );
});

test('AN ADDRESS THE RECORD DOES NOT DECIDE IS STILL READ BEFORE IT IS LISTED, and that is all that is read', async () => {
  /* THE BRIEFING, WHAT STOPPED, WHAT WENT STALE AND THE LEARNINGS ARE THE RECORD'S TO DECIDE NOW (bench 24 Oct): each
     was read whole to learn it answers. A stand-in that does not offer `stale` has it left out, and none of the four is read. */
  const { surface, calls } = offering({ ...OFFER, fixed: OFFER.fixed.filter((a) => a !== 'stale') });
  const asked = (method: string) => async (_a: unknown, ctx: Ctx): Promise<Result<unknown>> => {
    calls.push({ method, args: undefined, ctx });
    return { ok: true, value: {} };
  };
  const more: McpSurface<Ctx> = { ...surface, briefing: asked('briefing'), exceptions: asked('exceptions'), stale: asked('stale'), learnings: asked('learnings'), about: asked('about') };
  const listed = (await tools(more).resources({ who: 'agent' })).map((r) => r.uri);
  assert.deepEqual(calls.map((c) => c.method).sort(), ['offered', 'version']);
  assert.ok(listed.includes('braindog:briefing') && listed.includes('braindog:learnings') && listed.includes('braindog:about'));
  assert.equal(listed.includes('braindog:stale'), false, 'an address the record did not offer is listed');
});

test('A SURFACE WITHOUT offered, OR ONE THAT REFUSES IT OR ANSWERS NO SHAPE, IS LISTED THE OLD WAY', async () => {
  const today = stub({ pages: async () => ({ ok: true, value: [{ slug: 'work', title: 'Work' }] }) });
  const before = (await tools(today.surface).resources({ who: 'agent' })).map((r) => r.uri);
  assert.ok(today.calls.some((c) => c.method === 'whoami') && today.calls.some((c) => c.method === 'boot'), 'the old path read nothing');

  for (const answer of [{ ok: false, refusal: { code: 'INTERNAL', fix: 'Try again.' } }, { ok: true, value: { rows: [] } }] as Result<unknown>[]) {
    const old = stub({ pages: async () => ({ ok: true, value: [{ slug: 'work', title: 'Work' }] }) });
    const refusing: McpSurface<Ctx> = { ...old.surface, offered: async () => answer };
    assert.deepEqual((await tools(refusing).resources({ who: 'agent' })).map((r) => r.uri), before);
    assert.ok(old.calls.some((c) => c.method === 'whoami'), 'a refused offered left the list empty');
  }
});

test('ON A REAL RECORD THE LIST IS THE SAME BOTH WAYS, for four callers, in the same order', async () => {
  const { sql, api } = await record();
  for (const [who, ctx] of CALLERS) {
    const fast = await uris(api, ctx);
    const old = await uris(without(api), ctx);
    assert.deepEqual(fast, old, `${who} is offered a different list`);
    assert.ok(fast.length > 0, `${who} is offered nothing`);
  }
  sql.close();
});

test('ON A REAL RECORD THE DOOR READS ONE THING, offered, beside what the record does not decide', async () => {
  const { sql, api } = await record();
  const asked: string[] = [];
  const watched = new Proxy(api, {
    get(target, key, receiver) {
      const got = Reflect.get(target, key, receiver) as unknown;
      if (typeof got !== 'function' || typeof key !== 'string' || key === 'kernel') return got;
      return (...a: unknown[]) => {
        asked.push(key);
        return (got as (...b: unknown[]) => unknown).apply(target, a);
      };
    },
  });
  await tools(watched).resources(owner);
  /* `arrangement` IS `design`'S: the design book is not an address `offered` decides, so it is read before it is listed, as it always was, through the arrangement. */
  const UNDECIDED = new Set(['briefing', 'exceptions', 'stale', 'learnings', 'version', 'arrangement']);
  assert.deepEqual(asked.filter((m) => !UNDECIDED.has(m)), ['offered'], 'the door read the record to make the list');
  for (const never of ['page', 'pages', 'boot', 'figures', 'metric', 'list', 'context', 'previewPage', 'inbox'])
    assert.equal(asked.includes(never), false, `${never} was asked to make the list`);
  sql.close();
});

test('A TOKEN WITHOUT THE INBOX REACH IS NOT OFFERED braindog:inbox, and one with it is', async () => {
  const { sql, api } = await record();
  const reached = await uris(api, withInbox);
  const notReached = await uris(api, withoutInbox);
  assert.ok(reached.includes('braindog:inbox') && reached.includes('braindog:inbox/patterns'));
  assert.equal(notReached.includes('braindog:inbox'), false, 'the inbox is listed to a key that may not read it');
  assert.equal(notReached.includes('braindog:inbox/patterns'), false);
  const refused = await tools(api).read('braindog:inbox', withoutInbox);
  assert.equal(refused.ok, false, 'the key without the reach reads the inbox, so the test proves nothing');
  sql.close();
});

test('A FIGURE THE CALLER MAY NOT READ IS NOT LISTED, nor its list or its page, and what is listed reads', async () => {
  const { sql, api } = await record();
  const mcp = tools(api);
  const theirs = await uris(api, member);
  assert.ok(theirs.includes('braindog:metric/points-done') && theirs.includes('braindog:page/work') && theirs.includes('braindog:schema/tasks'));
  for (const held of ['braindog:metric/pay-out', 'braindog:page/pay', 'braindog:schema/payroll'])
    assert.equal(theirs.includes(held), false, `${held} is listed to a member held to Tasks`);
  assert.equal((await mcp.read('braindog:metric/pay-out', member)).ok, false, 'the member reads the figure, so the test proves nothing');
  for (const uri of theirs) assert.ok((await mcp.read(uri, member)).ok, `${uri} is listed to the member and then refused`);
  const mine = await uris(api, owner);
  assert.ok(mine.includes('braindog:metric/pay-out') && mine.includes('braindog:page/pay'));
  /* ONCE A NAME AND NEVER A RETIRED ONE, in the order the list hands them. */
  assert.deepEqual(mine.filter((u) => u.startsWith('braindog:skill/')).sort(), ['braindog:skill/reconcile-invoice', 'braindog:skill/review-pr']);
  sql.close();
});

/* ── the list held to 15 KB ─────────────────────────── */

/**
 * MEASURED BEFORE: on the owner's record `resources/list` answered 225,553 bytes, 754 of its 933 pages one per agent run;
 * on the seed 47,292 bytes, and 99,169 once it held 300 more runs, each a page of its own. A page about one row is never
 * listed now, and the rest is taken in the plan's order until the answer would pass 15 KB.
 */
const seeded = async (runs: number) => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await installSeed(api.kernel);
  const seedOwner = { principal: { kind: 'token', id: 't', scope: 'write', person: 'p_seed', level: 'owner' } } as unknown as CallContext;
  for (let i = 0; i < runs; i++)
    assert.ok((await api.create({ register: 'session', fields: { agent: 'claude', host: 'mac', repo: 'kiln', next: `Step ${String(i)}` } } as never, seedOwner)).ok);
  return { sql, api, seedOwner };
};
const listOver = async <C>(surface: McpSurface<C>, ctx: C) => {
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'resources/list' }, surface, ctx)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  return { bytes: JSON.stringify(reply).length, uris: (reply.result as { resources: { uri: string }[] }).resources.map((r) => r.uri) };
};

test('ON THE SEED WITH 120 RUNS THE LIST IS 15 KB OR LESS, names no page about one row, and leads with what a session reads', async () => {
  const { sql, api, seedOwner } = await seeded(120);
  const { bytes, uris: listed } = await listOver(api as unknown as McpSurface<CallContext>, seedOwner);
  assert.ok(bytes <= LISTED_MOST, `resources/list answered ${String(bytes)} bytes`);

  const pages = await api.pages(seedOwner);
  assert.ok(pages.ok);
  const about = pages.value.filter((p) => p.about !== null);
  assert.ok(about.filter((p) => p.about!.register === 'session').length >= 120, 'the runs made no pages, so the test proves nothing');
  for (const p of about) assert.equal(listed.includes(`braindog:page/${p.slug}`), false, `${p.slug}, a page about one row, is listed`);
  /* STILL READ BY ITS ADDRESS, as every page is. */
  const run = about.find((p) => p.about!.register === 'session')!;
  assert.ok((await tools(api).read(`braindog:page/${run.slug}`, seedOwner)).ok, 'a page about a run no longer reads by its address');

  for (const first of ['context', 'handoffs', 'learnings', 'decisions', 'briefing', 'stale', 'grammar/page', 'grammar/register', 'grammar/kinds'])
    assert.ok(listed.includes(`braindog:${first}`), `braindog:${first} is cut from the list`);
  assert.ok(listed.some((u) => u.startsWith('braindog:skill/')), 'no skill is listed');
  assert.ok(listed.includes('braindog:page/portfolio') && listed.includes('braindog:page/money'), 'a page somebody wrote is cut');
  /* CUT FROM ITS LEAST-READ END: a figure only once every list's fields are in. */
  const all = (await tools(api).resources(seedOwner)).map((r) => r.uri);
  const schemas = all.filter((u) => u.startsWith('braindog:schema/'));
  if (listed.some((u) => u.startsWith('braindog:metric/'))) for (const s of schemas) assert.ok(listed.includes(s), `${s} is cut while a figure is listed`);
  /* IN THE ORDER THEY CAME: the list is a subset, never a reshuffle. */
  const order = listed.filter((u) => u.startsWith('braindog:')).map((u) => all.indexOf(u));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  sql.close();
});

test('A SURFACE THAT CANNOT SAY WHICH PAGES ARE ABOUT A ROW DROPS NONE FOR IT, and a small list is listed whole', async () => {
  const { sql, api } = await record();
  const whole = (await tools(api).resources(owner)).map((r) => r.uri);
  const { uris } = await listOver(api as unknown as McpSurface<CallContext>, owner);
  assert.deepEqual(uris.filter((u) => u.startsWith('braindog:')), whole, 'a list well under 15 KB was cut');
  const blind = Object.create(api) as typeof api;
  (blind as { pages: unknown }).pages = async () => ({ ok: false, refusal: { code: 'INTERNAL', fix: 'Try again.' } });
  assert.deepEqual((await listOver(blind as unknown as McpSurface<CallContext>, owner)).uris.filter((u) => u.startsWith('braindog:')), whole);
  sql.close();
});
