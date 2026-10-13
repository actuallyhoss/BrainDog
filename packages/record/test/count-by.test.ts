/**
 * `countBy`: every value's count in one call, and each one the list's own (PGS-B06 job c).
 *
 * A chip says how many entries hold its value and opens the list filtered to it. The two numbers are read by two
 * reads, so the guard is that they agree: for every value of every countable field, with and without a `where`, for
 * an owner and for a member whose grant holds a rule, the count `countBy` answers is the `matched` the list answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';
import type { Json } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type Counted, type Limits } from '../src/methods/count-by.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A member who sees the urgent jobs and nothing else of them. */
const urgentOnly = { principal: { kind: 'person', id: 'p_2', level: 'read' }, wheres: { jobs: { field: 'urgent', is: true } } } as unknown as CallContext;

const decl = (id: string, body: Record<string, unknown>) => ({ id: `register.${id}`, kind: 'register', body: { id, ...body } }) as never;
const LISTS = [
  decl('clients', { name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
  decl('jobs', {
    name: 'Jobs',
    title: 'what',
    state: 'stage',
    done: ['done'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'stage', type: 'enum', values: ['open', 'waiting', 'done'], default: 'open' },
      { id: 'who', type: 'ref', to: 'clients' },
      { id: 'urgent', type: 'bool' },
      { id: 'due', type: 'day' },
      { id: 'fee', type: 'money' },
      { id: 'code', type: 'text', unique: true },
    ],
  }),
];

async function harness() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(LISTS);
  assert.ok(put.ok, JSON.stringify(put));
  const make = (register: string, fields: Record<string, Json>): string => {
    const got = api.kernel.create(register, fields, { actor: 'p_1' });
    assert.ok(got.ok, JSON.stringify(got));
    return got.value.id;
  };
  const nadia = make('clients', { name: 'Nadia' });
  const omar = make('clients', { name: 'Omar' });
  const jobs: Record<string, Json>[] = [
    { what: 'Jars', stage: 'open', who: nadia, urgent: true, due: '2026-10-10' },
    { what: 'Labels', stage: 'open', who: nadia, urgent: false, due: '2026-10-10' },
    { what: 'Boxes', stage: 'waiting', who: omar, urgent: true },
    { what: 'Invoice', stage: 'done', who: omar, due: '2026-10-01', fee: { amount: 15000, currency: 'GBP' } },
    { what: 'Photos', stage: 'open', urgent: true, due: '2026-10-12' },
    { what: 'Tape', stage: 'waiting' },
  ];
  for (const j of jobs) make('jobs', j);
  /* A DELETED JOB, which the list leaves out and so must every count. */
  const gone = make('jobs', { what: 'Old quote', stage: 'open', who: nadia, urgent: true });
  assert.ok(api.kernel.write('jobs', gone, { deleted_at: 'now' }, { actor: 'p_1' }).ok);

  const deps = {
    kernel: api.kernel,
    sql,
    guard: () => null,
    readable: () => null,
    readsEveryList: (ctx: CallContext) => ctx.wheres === undefined,
    named: (a: { register?: unknown }) => (typeof a.register === 'string' && a.register !== '' ? null : { code: 'REQUIRED_MISSING', fix: 'Name a list.', at: 'register' }),
    no,
    tail: async <T>(o: T) => o,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  return { sql, api, countBy: methods(deps).countBy, limited: (limits: Limits) => methods(deps, limits).countBy, make, nadia, omar };
}

const value = <T>(out: Result<T>): T => {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};
const refusal = (out: Result<unknown>): Refusal => {
  assert.ok(!out.ok, `expected a refusal, got ${JSON.stringify(out)}`);
  return (out as { refusal: Refusal }).refusal;
};

type Where = Record<string, unknown>;
/** What the list says it holds for one value: the read a chip opens. */
function listed(api: Awaited<ReturnType<typeof harness>>['api'], by: string, v: Json, where: Where | undefined, rule: Json | undefined): number {
  const one: Where = v === null ? { field: by, empty: true } : { field: by, is: v };
  const got = api.kernel.list({ register: 'jobs', where: (where === undefined ? one : { all: [where, one] }) as never, limit: 1 }, rule);
  assert.ok(got.ok, JSON.stringify(got));
  return got.value.matched;
}

for (const by of ['stage', 'who', 'urgent', 'due']) {
  test(`A CHIP'S COUNT IS THE LIST'S, by ${by}: every value, for an owner and for a member held to urgent jobs`, async () => {
    const { sql, api, countBy } = await harness();
    for (const [ctx, rule] of [
      [owner, undefined],
      [urgentOnly, { field: 'urgent', is: true }],
    ] as const) {
      for (const where of [undefined, { field: 'stage', is: 'open' }]) {
        const got = value<Counted>(await countBy({ register: 'jobs', by, ...(where === undefined ? {} : { where }) }, ctx));
        assert.ok(got.counts.length > 0, `${by} counts something`);
        for (const c of got.counts) assert.equal(c.n, listed(api, by, c.value, where, rule), `${by} = ${JSON.stringify(c.value)}`);
        const all = api.kernel.list({ register: 'jobs', ...(where === undefined ? {} : { where: where as never }), limit: 1 }, rule);
        assert.ok(all.ok);
        assert.equal(got.matched, all.value.matched, 'the counts add up to the list');
      }
    }
    sql.close();
  });
}

test('THE ANSWER: most first, empty last, a bool as true or false, and no deleted job', async () => {
  const { sql, countBy, nadia, omar } = await harness();
  const stage = value<Counted>(await countBy({ register: 'jobs', by: 'stage' }, owner));
  assert.deepEqual(stage.counts, [
    { value: 'open', n: 3 },
    { value: 'waiting', n: 2 },
    { value: 'done', n: 1 },
  ]);
  assert.equal(stage.matched, 6);
  const who = value<Counted>(await countBy({ register: 'jobs', by: 'who' }, owner));
  assert.deepEqual(new Map(who.counts.map((c) => [c.value, c.n])), new Map<Json, number>([[nadia, 2], [omar, 2], [null, 2]]));
  assert.equal(who.counts.at(-1)!.value, null, 'the jobs naming nobody come last among equals');
  const urgent = value<Counted>(await countBy({ register: 'jobs', by: 'urgent' }, owner));
  for (const c of urgent.counts) assert.ok(c.value === true || c.value === false || c.value === null, JSON.stringify(c.value));
  assert.equal(urgent.counts.find((c) => c.value === true)?.n, 3, 'the deleted urgent job is not counted');
  const held = value<Counted>(await countBy({ register: 'jobs', by: 'stage' }, urgentOnly));
  assert.equal(held.matched, 3, 'a member held to urgent jobs is told about those alone');
  sql.close();
});

test('REFUSED: a field that is not there, and one whose values are not worth a chip, each naming what can be counted', async () => {
  const { sql, countBy } = await harness();
  const unknown = refusal(await countBy({ register: 'jobs', by: 'colour' }, owner));
  assert.equal(unknown.code, 'FIELD_UNKNOWN');
  assert.deepEqual(unknown.allowed, ['what', 'stage', 'who', 'urgent', 'due']);
  const money = refusal(await countBy({ register: 'jobs', by: 'fee' }, owner));
  assert.equal(money.code, 'VALUE_MALFORMED');
  assert.doesNotMatch(money.fix, /\brows?\b|—/u, 'plain words, no "row", no em dash');
  /* A FIELD HELD UNIQUE is a different value on every job: the count would be the list again. */
  const unique = refusal(await countBy({ register: 'jobs', by: 'code' }, owner));
  assert.equal(unique.code, 'VALUE_MALFORMED');
  assert.equal(unique.at, 'by');
  assert.deepEqual(unique.allowed, ['what', 'stage', 'who', 'urgent', 'due'], 'and it is not offered as one to count by');
  assert.match(unique.fix, /different on every one of Jobs/u);
  assert.doesNotMatch(unique.fix, /\brows?\b|—/u);
  assert.equal(refusal(await countBy({ register: 'nope', by: 'stage' }, owner)).code, 'REGISTER_UNKNOWN');
  assert.equal(refusal(await countBy({ register: '', by: 'stage' }, owner)).code, 'REQUIRED_MISSING');
  sql.close();
});

test('THE MOST COMMON FIFTY, AND WHAT IS LEFT: a field with more values than that says how many values and jobs are not shown', async () => {
  const { sql, countBy, limited, make } = await harness();
  /* Sixty more jobs, each with a name of its own, two of them sharing one. */
  for (let i = 0; i < 60; i += 1) make('jobs', { what: `Crate ${String(i).padStart(2, '0')}` });
  make('jobs', { what: 'Jars' });
  for (const ctx of [owner, { ...owner, wheres: {} } as unknown as CallContext]) {
    const got = value<Counted>(await countBy({ register: 'jobs', by: 'what' }, ctx));
    assert.equal(got.counts.length, 50, 'no more than fifty values');
    assert.deepEqual(got.counts[0], { value: 'Jars', n: 2 }, 'the most common is kept');
    assert.equal(got.matched, 67, 'matched is the whole list');
    assert.deepEqual(got.more, { values: 16, n: 16 }, '66 values, 50 shown');
    assert.equal(got.counts.reduce((sum, c) => sum + c.n, 0) + got.more!.n, got.matched, 'shown and left add up to the list');
    assert.equal(got.capped, undefined);
  }
  const few = value<Counted>(await countBy({ register: 'jobs', by: 'stage' }, owner));
  assert.equal(few.more, undefined, 'nothing is left when everything is shown');
  const two = value<Counted>(await limited({ shown: 2 })({ register: 'jobs', by: 'stage' }, owner));
  assert.deepEqual(two.counts.map((c) => c.value), ['open', 'waiting']);
  assert.deepEqual(two.more, { values: 1, n: 1 });
  assert.equal(two.matched, 67);
  sql.close();
});

test('A WALK THAT STOPPED EARLY STILL SAYS HOW MANY THE LIST HOLDS: matched is the list\'s, and the uncounted are in more', async () => {
  const { sql, api, limited } = await harness();
  /* The walk reads two jobs a page and stops after four of the six. Walked for the member and for an owner alike. */
  const short = limited({ page: 2, walkMax: 4 });
  for (const [ctx, rule, whole] of [
    [{ ...owner, wheres: {} } as unknown as CallContext, undefined, 6],
    [urgentOnly, { field: 'urgent', is: true }, 3],
  ] as const) {
    const got = value<Counted>(await short({ register: 'jobs', by: 'stage' }, ctx));
    const all = api.kernel.list({ register: 'jobs', limit: 1 }, rule);
    assert.ok(all.ok);
    assert.equal(all.value.matched, whole);
    assert.equal(got.matched, whole, 'the list\'s own matched, not the part walked');
    const counted = got.counts.reduce((sum, c) => sum + c.n, 0);
    if (whole > 4) {
      assert.equal(got.capped, true);
      assert.equal(counted, 4, 'four jobs were counted');
      assert.equal(got.more?.n, 2, 'and the two not reached are said');
    } else {
      assert.equal(got.capped, undefined, 'a list that ends inside the walk is whole');
      assert.equal(counted, whole);
      assert.equal(got.more, undefined);
    }
  }
  const narrowed = value<Counted>(await short({ register: 'jobs', by: 'who', where: { field: 'stage', in: ['open', 'waiting'] } }, { ...owner, wheres: {} } as unknown as CallContext));
  assert.equal(narrowed.capped, true);
  assert.equal(narrowed.matched, 5, 'under a where too');
  sql.close();
});

test('ONE QUERY ONCE THE KERNEL COUNTS: the same answer whether the kernel tallies or the list is walked', async (t) => {
  const { sql, api, countBy } = await harness();
  if (typeof (api.kernel as unknown as { countBy?: unknown }).countBy !== 'function') {
    sql.close();
    return t.skip('kernel countBy is not beside block: yet (blocked to the integrator)');
  }
  for (const by of ['stage', 'who', 'urgent', 'due']) {
    const fast = value<Counted>(await countBy({ register: 'jobs', by }, owner));
    const walked = value<Counted>(await countBy({ register: 'jobs', by }, { ...owner, wheres: {} } as unknown as CallContext));
    assert.deepEqual(fast, walked, by);
  }
  sql.close();
});

test('THROUGH THE RECORD ITSELF, once methods/index.ts lists countBy', async (t) => {
  const { sql, api } = await harness();
  const through = (api as unknown as { countBy?: (a: unknown, c: CallContext) => Promise<Result<Counted>> }).countBy;
  if (through === undefined) {
    sql.close();
    return t.skip('countBy is not registered in methods/index.ts yet (blocked to the integrator)');
  }
  assert.equal(value<Counted>(await through({ register: 'jobs', by: 'stage' }, owner)).matched, 6);
  sql.close();
});
