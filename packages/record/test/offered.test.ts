/**
 * What an agent's list of resources is made from, in one read: `offered`.
 *
 * WHAT WAS SLOW. The agent door read every fixed address in full to learn whether to list it, then drew every page to
 * find its figures: 20 seconds on a record of 54 pages, then 8, at every session start. `offered` answers the same
 * question from the permission each reader asks, and draws nothing for somebody who reads every list.
 *
 * THE TEST THAT MATTERS MOST IS THE ONE THAT ASKS BOTH. A permission said twice drifts, and the sign of it is an address
 * listed and then refused. So for four callers every fixed address is read through the record's own method, and
 * `offered` must list exactly the ones that answered; the lists, pages and figures are held to `boot`, `pages` and
 * `figures` the same way.
 *
 * THE GUARDS HERE ARE SMALL COPIES, because a method file is handed the record's and a test cannot take them out of it.
 * The reads beside them are the real record's, so a copy that disagrees with the record fails the comparison.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sessionDeclaration, type Json } from '@braindog/kernel';
import type { Refusal, Result } from '@braindog/ports';
import { no } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { FIXED_ADDRESSES, methods, type Offered } from '../src/methods/offered.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const SESSION = (sessionDeclaration().body as unknown as { id: string }).id;

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const token = (reach?: string[]) =>
  ({ principal: { kind: 'token', id: reach ? 'tok_in' : 'tok_out', scope: 'read', person: 'p_1', level: 'owner', ...(reach ? { reach } : {}) } }) as unknown as CallContext;
/** A key its owner gave the inbox reach, and one they did not. */
const withInbox = token(['inbox']);
const withoutInbox = token();
/** A member held to Tasks and nothing else. */
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['tasks'] };
/** A colleague who adds across the record and reads none of it. */
const adder: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'append' } };
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

const DECLS = [
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
];

const value = <T>(out: Result<T>): T => {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

/* THE LADDER, SMALL: what each level reaches, a key held to its scope as well, and a ceiling of named lists. */
const REACH: Record<string, string[]> = {
  read: ['read'],
  append: ['append'],
  write: ['read', 'append', 'write'],
  decide: ['read', 'append', 'write', 'decide'],
  owner: ['read', 'append', 'write', 'decide', 'owner'],
};
const guard = (ctx: CallContext, need: string, asked?: string): Refusal | null => {
  const p = ctx.principal as { kind: string; level: string | null; scope?: string };
  const level = asked !== undefined && Object.hasOwn(ctx.levels ?? {}, asked) ? ctx.levels![asked]! : p.level;
  const reaches = level !== null && REACH[level]!.includes(need) && (p.kind !== 'token' || REACH[p.scope ?? 'read']!.includes(need));
  if (!reaches) return { code: 'LEVEL_REQUIRED', fix: `This needs ${need}.`, at: 'principal' };
  if (asked !== undefined && Array.isArray(ctx.registers) && !ctx.registers.includes(asked)) return { code: 'FORBIDDEN', fix: `You were not given ${asked}.`, at: 'register' };
  return null;
};
const scoped = (ctx: CallContext, need: string): Refusal | null => {
  const whole = guard(ctx, need);
  if (whole === null) return null;
  return Object.values(ctx.levels ?? {}).some((level) => REACH[level]!.includes(need)) ? null : whole;
};
const readable = (ctx: CallContext, list: string): Refusal | null => guard(ctx, 'read', list);
const readsEveryList = (ctx: CallContext): boolean =>
  guard(ctx, 'read') === null &&
  (ctx.registers === undefined || ctx.registers === '*') &&
  Object.keys(ctx.wheres ?? {}).length === 0 &&
  Object.keys(ctx.levels ?? {}).every((list) => readable(ctx, list) === null);

async function harness() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install(DECLS));
  const make = (list: string, fields: Record<string, Json>) => value(api.kernel.create(list, fields, { actor: 'p_1' })).id;
  make('tasks', { what: 'Glaze the jars', points: 3 });
  make('payroll', { who: 'Nadia', pay: 4000 });
  make('skills', { name: 'review-pr', trigger: 'Before merging a branch.', body: '# Review\n\nRead the whole diff.' });
  /* THE SAME NAME TWICE, as one skill for every project and one for a single project are kept: named once. */
  make('skills', { name: 'review-pr', trigger: 'Before merging a Kiln branch.', body: '# Review, for Kiln' });
  make('skills', { name: 'reconcile-invoice', body: '# Reconcile an invoice' });
  make('skills', { name: 'chase-invoice', trigger: 'When an invoice is 30 days late.', body: '# Chase', stage: 'retired' });

  /* WHICH PAGES OPEN ONTO NOTHING BUT HELD BLOCKS IS THE RECORD'S TO SAY (`drawnWithheld` in `index.ts`), so the member's
     answer is taken from `pages`, and anybody who reads every list must never have a page drawn to make the list. */
  const opens = new Set(value(await api.pages(member)).map((p) => p.slug));
  const drew: string[] = [];
  const deps = {
    kernel: api.kernel,
    sql,
    guard,
    scoped,
    readable,
    readsEveryList,
    understood: async () => no('NOT_IN_THIS_BUILD', 'Not asked here.'),
    withheld: (ctx: CallContext, slug: string) => {
      drew.push(slug);
      assert.equal(ctx, member, 'only somebody held from some list has a page drawn for them');
      return !opens.has(slug);
    },
    no,
    tail: async <T>(o: T) => o,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  const offered = async (ctx: CallContext): Promise<Offered> => value(await methods(deps).offered(ctx));
  return { sql, api, deps, offered, drew };
}

/** The page the agent door draws for `braindog:handoffs`, as `packages/mcp/src/index.ts` declares it. */
const HANDOFFS = {
  page: 'handoffs',
  title: 'Next steps left',
  blocks: [{ kind: 'table', source: 'handoffs.open', heading: 'Left by a run and not taken yet', columns: [{ field: 'agent' }, { field: 'next' }, { field: 'left_at' }, { field: 'mark' }] }],
};

/** Every fixed address, read as the agent door reads it: the record's own method, with what the door sends. */
type Api = Awaited<ReturnType<typeof harness>>['api'];
const grammar = (g: string) => (api: Api, ctx: CallContext) => api.arrangement({ grammar: g }, ctx);
const READS: Record<string, (api: Api, ctx: CallContext) => Promise<{ ok: boolean }>> = {
  whoami: (api, ctx) => api.whoami(ctx),
  boot: (api, ctx) => api.boot(ctx),
  context: (api, ctx) => api.context({}, ctx),
  understand: (api, ctx) => api.understandPlan({}, ctx),
  handoffs: (api, ctx) => api.previewPage({ body: HANDOFFS }, ctx),
  briefing: (api, ctx) => api.briefing({}, ctx),
  /* EVERY WIDGET TODAY CAN HOLD (round 1030), a read filtered by the caller's sight, as briefing is. */
  widgets: (api, ctx) => api.widgetGallery({}, ctx),
  exceptions: (api, ctx) => api.exceptions({}, ctx),
  stale: (api, ctx) => api.stale({}, ctx),
  learnings: (api, ctx) => api.learnings({}, ctx),
  'sessions/live': (api, ctx) => api.sessionsLive({}, ctx),
  'digest/today': (api, ctx) => api.digestToday({}, ctx),
  decisions: (api, ctx) => api.governance({ register: 'suggestion' }, ctx),
  inbox: (api, ctx) => api.inbox({}, ctx),
  'inbox/patterns': (api, ctx) => api.inboxPatterns({}, ctx),
  actions: (api, ctx) => api.actions(ctx),
  automations: (api, ctx) => api.automations({}, ctx),
  arrangement: (api, ctx) => api.arrangement({}, ctx),
  'grammar/page': grammar('page'),
  'grammar/register': grammar('register'),
  'grammar/metric': grammar('metric'),
  'grammar/proposals': grammar('proposals'),
  'grammar/ingest': grammar('ingest'),
  'grammar/kinds': grammar('kinds'),
  /* The two grammars the agent door keeps as its own text are asked of `version` before they are answered. */
  'grammar/script': (api, ctx) => api.version(ctx),
  'grammar/automations': (api, ctx) => api.version(ctx),
  /* AN ADD-ON FILE WHOLE (addons market plan, 3 Nov), the record's own grammar as the six above. */
  'grammar/pack': grammar('pack'),
};

test('ONE READ ANSWERS ALL FIVE: the fixed addresses, the lists, the pages, the figures and the skills', async () => {
  const { sql, offered } = await harness();
  const got = await offered(owner);
  assert.deepEqual(Object.keys(got).sort(), ['figures', 'fixed', 'lists', 'pages', 'skills']);
  /* The owner is offered every fixed address the record names, in the order it names them. */
  assert.deepEqual(got.fixed, [...FIXED_ADDRESSES]);
  assert.deepEqual([...FIXED_ADDRESSES].sort(), Object.keys(READS).sort(), 'this test reads every address the record names');
  for (const list of ['tasks', 'payroll', 'skills']) assert.ok(got.lists.some((l) => l.id === list), `${list} is listed`);
  assert.deepEqual(got.lists.find((l) => l.id === 'tasks'), { id: 'tasks', name: 'Tasks' });
  assert.deepEqual(got.pages.filter((p) => p.slug === 'work' || p.slug === 'pay').sort((a, b) => a.slug.localeCompare(b.slug)), [
    { slug: 'pay', title: 'Payroll, monthly' },
    { slug: 'work', title: 'Work' },
  ]);
  assert.deepEqual(got.figures.find((f) => f.id === 'pay-out'), { id: 'pay-out', name: 'Pay out', param: false });
  sql.close();
});

test('A FIXED ADDRESS IS LISTED EXACTLY WHEN ITS OWN READER ANSWERS, for four callers, and no read is run to say so', async () => {
  const { sql, api, offered } = await harness();
  for (const [who, ctx] of CALLERS) {
    const got = await offered(ctx);
    for (const [address, read] of Object.entries(READS)) {
      const answers = (await read(api, ctx)).ok;
      assert.equal(got.fixed.includes(address), answers, `${address} for ${who}: listed ${got.fixed.includes(address)}, and reading it ${answers ? 'answers' : 'refuses'}`);
    }
  }
  sql.close();
});

test('THE INBOX GOES BY ITS REACH: a key with the inbox reach is offered it, a key without is not', async () => {
  const { sql, api, offered } = await harness();
  const inn = await offered(withInbox);
  const out = await offered(withoutInbox);
  for (const address of ['inbox', 'inbox/patterns']) {
    assert.ok(inn.fixed.includes(address), `${address} is offered to the key with the reach`);
    assert.ok(!out.fixed.includes(address), `${address} is not offered to the key without it`);
  }
  assert.ok((await api.inbox({}, withInbox)).ok);
  assert.ok(!(await api.inbox({}, withoutInbox)).ok);
  /* `Array.isArray`, as the inbox's own gate asks: a reach that is a word holding "inbox" is no reach. */
  const word = { principal: { ...(withoutInbox.principal as object), reach: 'no-inbox' } } as unknown as CallContext;
  assert.ok(!(await offered(word)).fixed.includes('inbox'));
  /* And the owner, and a member held to one list, as the inbox answers each. */
  assert.ok((await offered(owner)).fixed.includes('inbox'));
  assert.ok(!(await offered(member)).fixed.includes('inbox'));
  sql.close();
});

test('A MEMBER HELD TO ONE LIST GETS THAT LIST, its page and its figure, and nothing over a list they cannot read', async () => {
  const { sql, api, offered } = await harness();
  const got = await offered(member);
  assert.deepEqual(got.lists, [{ id: 'tasks', name: 'Tasks' }]);
  assert.deepEqual(got.pages, [{ slug: 'work', title: 'Work' }]);
  assert.deepEqual(got.figures, [{ id: 'points-done', name: 'Points done', param: false }]);
  assert.deepEqual(got.skills, [], 'Skills is a list they were not given');
  assert.ok(!JSON.stringify(got).includes('Payroll'), 'the name of a list they cannot read is nowhere in the answer');
  assert.ok(!got.fixed.includes('sessions/live') && !got.fixed.includes('understand'));
  /* Each figure offered is one `metric` answers, and the one withheld is one it refuses. */
  for (const f of got.figures) assert.ok((await api.metric({ metric: f.id }, member)).ok, f.id);
  assert.ok(!(await api.metric({ metric: 'pay-out' }, member)).ok);
  sql.close();
});

test('THE LISTS, PAGES AND FIGURES ARE THE ONES boot, pages AND figures ANSWER, for four callers', async () => {
  const { sql, api, offered, drew } = await harness();
  for (const [who, ctx] of CALLERS) {
    const got = await offered(ctx);
    assert.deepEqual(got.lists.map((l) => l.id).sort(), value(await api.boot(ctx)).registers.map((r) => r.id).sort(), `lists for ${who}`);
    assert.deepEqual(got.pages.map((p) => p.slug).sort(), value(await api.pages(ctx)).map((p) => p.slug).sort(), `pages for ${who}`);
    assert.deepEqual(got.figures.map((f) => f.id).sort(), value(await api.figures(ctx)).map((f) => f.id).sort(), `figures for ${who}`);
    if (ctx !== member) assert.deepEqual(drew, [], `no page is drawn to make the list for ${who}`);
  }
  sql.close();
});

test('WITH NOTHING TO SAY WHICH PAGES OPEN ONTO HELD BLOCKS, somebody held from a list is offered no page', async () => {
  const { sql, deps, offered } = await harness();
  const bare = { ...deps, withheld: undefined } as unknown as RecordDeps;
  assert.deepEqual(value(await methods(bare).offered(member)).pages, []);
  assert.ok(value(await methods(bare).offered(owner)).pages.some((p) => p.slug === 'work'), 'the owner reads every list, so nothing is asked');
  assert.ok((await offered(member)).pages.length > 0);
  sql.close();
});

test('A SKILL IS ITS NAME AND WHEN TO USE IT, AND NOTHING ELSE: once a name, never a retired one, never its text', async () => {
  const { sql, api, offered } = await harness();
  const got = await offered(owner);
  /* IN THE LIST'S OWN ORDER, and a name kept twice is the one `list` hands first, which `braindog:skill/<name>` reads. */
  const first = value(api.kernel.list({ register: 'skills', where: { field: 'name', is: 'review-pr' }, limit: 1 })).rows[0]!;
  assert.deepEqual(
    [...got.skills].sort((x, y) => x.name.localeCompare(y.name)),
    [
      { name: 'reconcile-invoice', when: null },
      { name: 'review-pr', when: first.fields.trigger },
    ],
  );
  assert.ok(!JSON.stringify(got.skills).includes('Read the whole diff'), 'the text of a skill is read by its own address');
  /* MORE THAN ONE CHUNK: every live skill is named, once. */
  for (let i = 0; i < 230; i++) value(api.kernel.create('skills', { name: `skill-${i}`, trigger: `When ${i}.`, body: 'x' }, { actor: 'p_1' }));
  const many = await offered(owner);
  assert.equal(many.skills.length, 232);
  assert.equal(new Set(many.skills.map((s) => s.name)).size, 232);
  assert.deepEqual(many.skills.find((s) => s.name === 'skill-229'), { name: 'skill-229', when: 'When 229.' });
  sql.close();
});

test('THE GUARD COMES FIRST: somebody who adds and reads nothing is refused, and told nothing', async () => {
  const { sql, deps } = await harness();
  const out = await methods(deps).offered(adder);
  assert.ok(!out.ok);
  assert.equal((out as { refusal: Refusal }).refusal.code, 'LEVEL_REQUIRED');
  sql.close();
});
